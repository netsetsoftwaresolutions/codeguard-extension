import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';

/** OSV ecosystem identifiers (https://ossf.github.io/osv-schema/#affectedpackage-field). */
export type OsvEcosystem = 'npm' | 'PyPI' | 'Packagist' | 'Go' | 'crates.io' | 'Maven' | 'NuGet' | 'RubyGems';

export interface ResolvedDependency {
  ecosystem: OsvEcosystem;
  name: string;
  version: string;
  /** Lockfile / manifest the dependency came from. */
  source: string;
  dev?: boolean;
}

export interface LockfileParseResult {
  dependencies: ResolvedDependency[];
  /** Human-readable notes about anything that could not be resolved. */
  notes: string[];
}

export interface DependencyAdapter {
  id: string;
  ecosystem: OsvEcosystem;
  /** File basename(s) handled by this adapter. */
  matches: (basename: string) => boolean;
  status: 'implemented' | 'planned';
  parse?: (path: string, content: string) => LockfileParseResult;
}

const SEMVERISH = /^v?\d+(\.\d+)*([-+][\w.-]+)?$/;

function dedupe(deps: ResolvedDependency[]): ResolvedDependency[] {
  const seen = new Map<string, ResolvedDependency>();
  for (const d of deps) {
    const key = `${d.ecosystem}|${d.name}|${d.version}`;
    const prev = seen.get(key);
    if (!prev) seen.set(key, d);
    else if (prev.dev && !d.dev) seen.set(key, d);
  }
  return [...seen.values()];
}

export function parsePackageLock(path: string, content: string): LockfileParseResult {
  const notes: string[] = [];
  const deps: ResolvedDependency[] = [];
  const json = JSON.parse(content) as {
    lockfileVersion?: number;
    packages?: Record<string, { version?: string; dev?: boolean; link?: boolean; name?: string }>;
    dependencies?: Record<string, V1Dep>;
  };
  interface V1Dep { version?: string; dev?: boolean; dependencies?: Record<string, V1Dep> }
  if (json.packages && typeof json.packages === 'object') {
    for (const [key, entry] of Object.entries(json.packages)) {
      if (!key || entry.link) continue;
      const idx = key.lastIndexOf('node_modules/');
      if (idx === -1) continue; // workspace package folders
      const name = entry.name ?? key.slice(idx + 'node_modules/'.length);
      const version = entry.version;
      if (!version || !SEMVERISH.test(version)) continue;
      deps.push({ ecosystem: 'npm', name, version, source: path, dev: !!entry.dev });
    }
  } else if (json.dependencies) {
    const walk = (tree: Record<string, V1Dep>) => {
      for (const [name, d] of Object.entries(tree)) {
        if (d.version && SEMVERISH.test(d.version)) deps.push({ ecosystem: 'npm', name, version: d.version, source: path, dev: !!d.dev });
        if (d.dependencies) walk(d.dependencies);
      }
    };
    walk(json.dependencies);
  } else {
    notes.push(`${path}: no packages found in lockfile.`);
  }
  return { dependencies: dedupe(deps), notes };
}

function nameFromDescriptor(descriptor: string): string | null {
  const d = descriptor.trim().replace(/^"|"$/g, '');
  const at = d.indexOf('@', d.startsWith('@') ? 1 : 0);
  if (at <= 0) return null;
  return d.slice(0, at);
}

export function parseYarnLock(path: string, content: string): LockfileParseResult {
  const deps: ResolvedDependency[] = [];
  const notes: string[] = [];
  const lines = content.split(/\r?\n/);
  let currentNames: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    if (!line.startsWith(' ') && line.endsWith(':')) {
      const header = line.slice(0, -1);
      if (header.startsWith('__metadata')) { currentNames = []; continue; }
      currentNames = [...new Set(header.split(',').map((s) => nameFromDescriptor(s)).filter((n): n is string => !!n))];
      continue;
    }
    const m = /^\s{2}version:?\s+"?([^"\s]+)"?/.exec(line);
    if (m && currentNames.length) {
      const version = m[1]!;
      if (SEMVERISH.test(version) && !version.startsWith('0.0.0-use.local')) {
        for (const name of currentNames) deps.push({ ecosystem: 'npm', name, version, source: path });
      }
      currentNames = [];
    }
  }
  if (!deps.length) notes.push(`${path}: no resolvable packages found.`);
  return { dependencies: dedupe(deps), notes };
}

export function parsePnpmLock(path: string, content: string): LockfileParseResult {
  const notes: string[] = [];
  const deps: ResolvedDependency[] = [];
  const doc = parseYaml(content, { maxAliasCount: 1000 }) as { packages?: Record<string, { dev?: boolean; version?: string }> } | null;
  const packages = doc?.packages ?? {};
  for (const [rawKey, entry] of Object.entries(packages)) {
    let key = rawKey.replace(/^\//, '').split('(')[0]!;
    let name: string;
    let version: string;
    const at = key.lastIndexOf('@');
    if (at > 0) {
      name = key.slice(0, at);
      version = key.slice(at + 1);
    } else {
      const slash = key.lastIndexOf('/');
      if (slash <= 0) continue;
      name = key.slice(0, slash);
      version = key.slice(slash + 1).split('_')[0]!;
    }
    if (entry?.version && SEMVERISH.test(entry.version)) version = entry.version;
    key = name;
    if (!SEMVERISH.test(version)) continue;
    deps.push({ ecosystem: 'npm', name: key, version, source: path, dev: !!entry?.dev });
  }
  if (!deps.length) notes.push(`${path}: no resolvable packages found.`);
  return { dependencies: dedupe(deps), notes };
}

export function parseRequirementsTxt(path: string, content: string): LockfileParseResult {
  const deps: ResolvedDependency[] = [];
  let unpinned = 0;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*==\s*([A-Za-z0-9.+!_-]+)\s*(;.*)?$/.exec(line);
    if (m) deps.push({ ecosystem: 'PyPI', name: m[1]!, version: m[3]!, source: path });
    else unpinned++;
  }
  const notes = unpinned
    ? [`${path}: ${unpinned} requirement(s) are not pinned with "=="; their installed versions cannot be determined, so they were not checked against advisories.`]
    : [];
  return { dependencies: dedupe(deps), notes };
}

export function parsePoetryLock(path: string, content: string): LockfileParseResult {
  const doc = parseToml(content) as { package?: { name?: string; version?: string; category?: string }[] };
  const deps = (doc.package ?? [])
    .filter((p) => p.name && p.version)
    .map((p) => ({ ecosystem: 'PyPI' as const, name: p.name!, version: p.version!, source: path, dev: p.category === 'dev' }));
  return { dependencies: dedupe(deps), notes: [] };
}

export function parsePipfileLock(path: string, content: string): LockfileParseResult {
  const doc = JSON.parse(content) as Record<string, Record<string, { version?: string }>>;
  const deps: ResolvedDependency[] = [];
  for (const section of ['default', 'develop']) {
    for (const [name, info] of Object.entries(doc[section] ?? {})) {
      const v = info?.version?.replace(/^==/, '');
      if (v && SEMVERISH.test(v)) deps.push({ ecosystem: 'PyPI', name, version: v, source: path, dev: section === 'develop' });
    }
  }
  return { dependencies: dedupe(deps), notes: [] };
}

export function parseComposerLock(path: string, content: string): LockfileParseResult {
  const doc = JSON.parse(content) as { packages?: { name: string; version: string }[]; 'packages-dev'?: { name: string; version: string }[] };
  const deps: ResolvedDependency[] = [];
  for (const [list, dev] of [[doc.packages ?? [], false], [doc['packages-dev'] ?? [], true]] as const) {
    for (const p of list) {
      const v = String(p.version ?? '').replace(/^v/, '');
      if (p.name && SEMVERISH.test(v)) deps.push({ ecosystem: 'Packagist', name: p.name, version: v, source: path, dev });
    }
  }
  return { dependencies: dedupe(deps), notes: [] };
}

export const DEPENDENCY_ADAPTERS: DependencyAdapter[] = [
  { id: 'npm-package-lock', ecosystem: 'npm', status: 'implemented', matches: (b) => b === 'package-lock.json' || b === 'npm-shrinkwrap.json', parse: parsePackageLock },
  { id: 'yarn-lock', ecosystem: 'npm', status: 'implemented', matches: (b) => b === 'yarn.lock', parse: parseYarnLock },
  { id: 'pnpm-lock', ecosystem: 'npm', status: 'implemented', matches: (b) => b === 'pnpm-lock.yaml', parse: parsePnpmLock },
  { id: 'pip-requirements', ecosystem: 'PyPI', status: 'implemented', matches: (b) => /^requirements([-_.][\w-]+)?\.txt$/i.test(b), parse: parseRequirementsTxt },
  { id: 'poetry-lock', ecosystem: 'PyPI', status: 'implemented', matches: (b) => b === 'poetry.lock', parse: parsePoetryLock },
  { id: 'pipfile-lock', ecosystem: 'PyPI', status: 'implemented', matches: (b) => b === 'Pipfile.lock', parse: parsePipfileLock },
  { id: 'composer-lock', ecosystem: 'Packagist', status: 'implemented', matches: (b) => b === 'composer.lock', parse: parseComposerLock },
  { id: 'go-modules', ecosystem: 'Go', status: 'planned', matches: (b) => b === 'go.sum' || b === 'go.mod' },
  { id: 'cargo', ecosystem: 'crates.io', status: 'planned', matches: (b) => b === 'Cargo.lock' },
  { id: 'maven', ecosystem: 'Maven', status: 'planned', matches: (b) => b === 'pom.xml' },
  { id: 'gradle', ecosystem: 'Maven', status: 'planned', matches: (b) => b === 'gradle.lockfile' || b === 'build.gradle' || b === 'build.gradle.kts' },
  { id: 'nuget', ecosystem: 'NuGet', status: 'planned', matches: (b) => b === 'packages.lock.json' || /\.csproj$/.test(b) },
  { id: 'bundler', ecosystem: 'RubyGems', status: 'planned', matches: (b) => b === 'Gemfile.lock' },
];

export { MANIFEST_FILES } from './files';

export function findAdapter(basename: string): DependencyAdapter | undefined {
  return DEPENDENCY_ADAPTERS.find((a) => a.matches(basename));
}
