import { gunzipSync, unzipSync } from 'fflate';
import type { NormalizedFinding } from '../contracts';
import {
  createInventoryClassifier,
  DEFAULT_EXCLUDED_DIRS,
  detectLanguage,
  isDependencyFile,
  RULESET_VERSION,
  runRules,
  type RuleEntry,
} from '../security-rules';

/**
 * Browser scan: unpack the source in memory and run the shared CodeGuard rule engine here, so source
 * code never leaves the browser. Only findings, masked snippets, the file list and dependency
 * manifests/lockfiles (for the server-side OSV check) are uploaded. Mirrors the scanner's
 * BrowserScanResults (codeguard-scanner/src/queue-contracts).
 */
export interface BrowserScanResults {
  version: 1;
  ruleset: string;
  durationMs: number;
  inventory: { path: string; size: number; language: string; status: RuleEntry['status']; excludeReason: string | null; sha256: string | null }[];
  findings: NormalizedFinding[];
  snippets: { fingerprint: string; startLine: number; content: string }[];
  dependencyFiles: { path: string; content: string }[];
  limitations: string[];
  skipped: { path: string; reason: string }[];
  truncated: boolean;
}

/** Same defaults as the scanner (platform-config/limits.ts), except extraction, which must fit in browser memory. */
const LIMITS = { maxFileBytesForAnalysis: 2 * 1024 * 1024, maxFilesAnalyzed: 25_000, maxDirectoryDepth: 40, maxArchiveEntries: 50_000, maxExtractedBytes: 512 * 1024 * 1024 };
const MAX_DEPENDENCY_FILE_BYTES = 10 * 1024 * 1024;

export class LocalScanError extends Error {}

export interface SourceFile {
  path: string;
  bytes: Uint8Array;
}

/** Clean a relative path; null when it could escape the root. */
function cleanPath(raw: string): string | null {
  const p = raw.replace(/\\/g, '/').replace(/^\.?\/+/, '');
  if (!p || p.includes('\0') || /^[a-zA-Z]:/.test(p) || p.split('/').some((s) => s === '..')) return null;
  return p;
}

// shortcut: reads ustar names and GNU long names only, not pax headers; upgrade if pax archives show truncated paths.
function untar(data: Uint8Array): Record<string, Uint8Array> {
  const text = new TextDecoder();
  const out: Record<string, Uint8Array> = {};
  let off = 0;
  let longName: string | null = null;
  while (off + 512 <= data.length) {
    const h = data.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const field = (a: number, b: number) => text.decode(h.subarray(a, b)).replace(/\0[\s\S]*$/, '');
    const size = parseInt(field(124, 136).trim() || '0', 8);
    const type = String.fromCharCode(h[156]!);
    const body = data.subarray(off + 512, off + 512 + size);
    if (type === 'L') longName = text.decode(body).replace(/\0[\s\S]*$/, '');
    else {
      const prefix = field(345, 500);
      if (type === '0' || type === '\0') out[longName ?? (prefix ? `${prefix}/` : '') + field(0, 100)] = body;
      longName = null;
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

export const isArchiveName = (name: string) => /\.(zip|tar|tar\.gz|tgz)$/i.test(name);

/** Unpack a .zip, .tar, .tar.gz or .tgz in memory. */
export async function unpack(name: string, blob: Blob, opts: { stripFirstComponent?: boolean } = {}): Promise<{ files: SourceFile[]; skipped: { path: string; reason: string }[] }> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const lower = name.toLowerCase();
  let raw: Record<string, Uint8Array>;
  if (lower.endsWith('.zip')) {
    let total = 0;
    let count = 0;
    raw = unzipSync(data, {
      filter: (f) => {
        if (f.name.endsWith('/')) return false;
        if (++count > LIMITS.maxArchiveEntries) throw new LocalScanError(`The archive has more than ${LIMITS.maxArchiveEntries} files. Run a Deep scan instead.`);
        total += f.originalSize;
        if (total > LIMITS.maxExtractedBytes) throw new LocalScanError('The source is too large to scan in the browser. Run a Deep scan instead.');
        return true;
      },
    });
  } else if (/\.(tar\.gz|tgz)$/.test(lower)) raw = untar(gunzipSync(data));
  else if (lower.endsWith('.tar')) raw = untar(data);
  else throw new LocalScanError(`${name} is not a supported archive.`);

  const files: SourceFile[] = [];
  const skipped: { path: string; reason: string }[] = [];
  for (const [entry, bytes] of Object.entries(raw)) {
    const stripped = opts.stripFirstComponent ? entry.slice(entry.indexOf('/') + 1) : entry;
    const path = cleanPath(stripped);
    if (path) files.push({ path, bytes });
    else if (stripped) skipped.push({ path: entry.slice(0, 200), reason: 'unsafe path' });
  }
  return { files, skipped };
}

/** Classify files like the scanner's inventory walk, then run every built-in rule. */
export async function scanLocally(files: SourceFile[], opts: { pathFilter?: string | null; skipped?: { path: string; reason: string }[]; secretAllowlist?: string[] } = {}): Promise<BrowserScanResults> {
  const started = Date.now();
  const filter = opts.pathFilter?.replace(/^\/+|\/+$/g, '') || null;
  const classifier = createInventoryClassifier(LIMITS);
  const bytes = new Map<string, Uint8Array>();
  const entries: (RuleEntry & { language: string; excludeReason: string | null })[] = [];
  const excludedDirs = new Set<string>();
  const limitations: string[] = [];
  let depthLimited = false;

  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = f.path.split('/');
    const dirIndex = parts.findIndex((s, i) => i < parts.length - 1 && DEFAULT_EXCLUDED_DIRS.includes(s));
    if (dirIndex >= 0) {
      const dir = parts.slice(0, dirIndex + 1).join('/') + '/';
      if (!excludedDirs.has(dir)) {
        excludedDirs.add(dir);
        entries.push({ path: dir, size: 0, language: 'other', status: 'EXCLUDED', excludeReason: `${parts[dirIndex]}/ directory excluded by default`, head: new Uint8Array() });
      }
      continue;
    }
    if (parts.length - 1 > LIMITS.maxDirectoryDepth) {
      depthLimited = true;
      continue;
    }
    if (filter && f.path !== filter && !f.path.startsWith(filter + '/')) continue;
    const head = f.bytes.subarray(0, 8192);
    entries.push({ path: f.path, size: f.bytes.length, language: detectLanguage(f.path), ...classifier.classify(f.bytes.length, head), head });
    bytes.set(f.path, f.bytes);
  }

  if (filter && !entries.some((e) => e.path === filter || e.path.startsWith(filter + '/'))) limitations.push(`The requested path "${filter}" was not found in the downloaded source.`);
  if (classifier.truncated) limitations.push(`Only the first ${LIMITS.maxFilesAnalyzed} text files were analyzed (per-scan file limit).`);
  if (depthLimited) limitations.push(`Directories nested deeper than ${LIMITS.maxDirectoryDepth} levels were not scanned.`);
  limitations.push('Project exclude-path settings are not applied to browser scans.');

  const result = await runRules(entries, async (e) => bytes.get(e.path)!, { partial: !!filter, secretAllowlist: opts.secretAllowlist });
  const utf8 = new TextDecoder();
  return {
    version: 1,
    ruleset: RULESET_VERSION,
    durationMs: Date.now() - started,
    inventory: entries.map(({ path, size, language, status, excludeReason }) => ({ path, size, language, status, excludeReason, sha256: null })),
    findings: result.findings,
    snippets: [...result.snippets].map(([fingerprint, s]) => ({ fingerprint, ...s })),
    dependencyFiles: entries
      .filter((e) => e.status !== 'EXCLUDED' && e.size <= MAX_DEPENDENCY_FILE_BYTES && isDependencyFile(e.path.split('/').pop()!))
      .map((e) => ({ path: e.path, content: utf8.decode(bytes.get(e.path)!) })),
    limitations,
    skipped: opts.skipped ?? [],
    truncated: classifier.truncated,
  };
}
