import type { EngineRun, NormalizedFinding } from '../contracts';
import { buildFileContext } from './context';
import { analyzeFile, analyzeInventoryEntry, normalizeHit } from './engine';
import { maskSecret, redactKnownSecretShapes, truncateEvidence } from './masking';
import { decoyFontHits, isFontPath, isFrontendPackageJson, polinriderSignatureHits } from './rules/polinrider';
import { scanSecrets } from './secrets';

/**
 * The built-in rule engine over a file inventory, independent of where the bytes live.
 * The scanner reads from disk; the browser extension reads from an unzipped archive in memory.
 * This file is copied into the extension (src/scan-engine), so keep it free of Node-only APIs.
 */

export const RULESET_VERSION = 'ruleset 2026.11.1';

export interface RuleEntry {
  /** POSIX path relative to the scan root; directories end with "/". */
  path: string;
  size: number;
  status: 'SCANNED' | 'EXCLUDED' | 'BINARY' | 'TOO_LARGE';
  head: Uint8Array;
  readError?: string;
}

export interface RuleRunResult {
  findings: NormalizedFinding[];
  snippets: Map<string, { startLine: number; content: string }>;
  runs: EngineRun[];
}

const MAX_SIGNATURE_BYTES = 20 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8');
const latin1 = new TextDecoder('latin1');
const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/') + 1);
const stemOf = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
const isTeamScanner = (path: string) => /(^|\/)scan-malware[\w.-]*\.mjs$/.test(path);

/** Mask every secret detected anywhere in the file, plus known secret shapes, in a context window. */
function maskedWindow(lines: string[], line: number, secrets: string[], radius = 2): { startLine: number; content: string } {
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  const out: string[] = [];
  for (let i = start; i <= end; i++) {
    let text = lines[i - 1] ?? '';
    for (const s of secrets) if (s.length >= 4) text = text.split(s).join(maskSecret(s));
    out.push(truncateEvidence(redactKnownSecretShapes(text), 300));
  }
  return { startLine: start, content: out.join('\n') };
}

/**
 * Runs malware, PolinRider, configuration, supply-chain, exposed-file and secret rules over every entry.
 * Pure static analysis: contents are read as text and never executed or imported.
 */
export async function runRules(
  entries: RuleEntry[],
  read: (entry: RuleEntry) => Promise<Uint8Array>,
  opts: {
    secretAllowlist?: string[];
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => Promise<void> | void;
    /** Scan covers only part of the repository (path filter), so "font referenced nowhere" cannot be judged. */
    partial?: boolean;
  } = {},
): Promise<RuleRunResult> {
  const started = Date.now();
  const findings: NormalizedFinding[] = [];
  const snippets = new Map<string, { startLine: number; content: string }>();
  const scannable = entries.filter((e) => e.status === 'SCANNED');
  let ruleErrors = 0;

  for (const e of entries) {
    if (e.path.endsWith('/')) continue;
    findings.push(...analyzeInventoryEntry(e.path, e.head, e.readError));
    // PolinRider hides payloads inside binaries and oversized files, which the text rules never read.
    if ((e.status === 'BINARY' || e.status === 'TOO_LARGE') && e.size <= MAX_SIGNATURE_BYTES && !isTeamScanner(e.path)) {
      try {
        findings.push(...polinriderSignatureHits(latin1.decode(await read(e)), true).map((h) => normalizeHit(h, e.path)));
      } catch {
        ruleErrors++;
      }
    }
  }

  // Decoy font folders: fonts nothing outside their own folder mentions (frontend) or any font at all (backend).
  const fonts = entries
    .filter((e) => !e.path.endsWith('/') && isFontPath(e.path))
    .map((e) => ({ path: e.path, dir: dirOf(e.path), stem: stemOf(e.path), referenced: false }));
  let rootPackageJson: string | null = null;

  for (let i = 0; i < scannable.length; i++) {
    if (opts.signal?.aborted) break;
    const e = scannable[i]!;
    let content: string;
    try {
      content = utf8.decode(await read(e));
    } catch {
      ruleErrors++;
      continue;
    }
    if (e.path === 'package.json') rootPackageJson = content;
    if (!isFontPath(e.path)) {
      const dir = dirOf(e.path);
      for (const f of fonts) if (!f.referenced && f.dir !== dir && content.includes(f.stem)) f.referenced = true;
    }
    let fileFindings: NormalizedFinding[] = [];
    try {
      fileFindings = analyzeFile(e.path, content, { secrets: { allowlist: opts.secretAllowlist } });
    } catch {
      ruleErrors++;
    }
    if (fileFindings.length) {
      const ctx = buildFileContext(e.path, content);
      const secretValues = scanSecrets(ctx).map((h) => h.secretValue).filter((s): s is string => !!s);
      for (const f of fileFindings) {
        if (f.location.startLine && f.category !== 'SECRET') snippets.set(f.fingerprint, maskedWindow(ctx.lines, f.location.startLine, secretValues));
      }
      findings.push(...fileFindings);
    }
    if (i % 200 === 0) {
      await opts.onProgress?.(i, scannable.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  if (fonts.length && !opts.partial) {
    const frontend = isFrontendPackageJson(rootPackageJson);
    const flagged = fonts.filter((f) => !frontend || !f.referenced).map((f) => f.path);
    const confirmedDirs = new Set(findings.filter((f) => f.ruleId.startsWith('CG-MAL-') && f.location.filePath).map((f) => dirOf(f.location.filePath!)));
    for (const { dir, hit } of decoyFontHits(flagged, frontend, confirmedDirs)) findings.push(normalizeHit(hit, dir));
  }

  const durationMs = Date.now() - started;
  const count = (engine: string) => findings.filter((f) => f.engine === engine).length;
  const note = ruleErrors ? `${ruleErrors} file(s) could not be analyzed.` : null;
  return {
    findings,
    snippets,
    runs: [
      { engine: 'codeguard-rules', status: 'COMPLETED', version: RULESET_VERSION, durationMs, findingCount: count('codeguard-rules'), message: note ?? `${scannable.length} files analyzed.` },
      { engine: 'codeguard-secrets', status: 'COMPLETED', version: RULESET_VERSION, durationMs: 0, findingCount: count('codeguard-secrets'), message: null },
      { engine: 'codeguard-dependencies', status: 'COMPLETED', version: RULESET_VERSION, durationMs: 0, findingCount: count('codeguard-dependencies'), message: 'Manifest analysis: lifecycle scripts, typosquatting candidates, dependency sources, pinning.' },
    ],
  };
}
