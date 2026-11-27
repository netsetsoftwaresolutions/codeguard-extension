import { editDistance } from './entropy';
import { isTestOrExamplePath } from './context';
import { POPULAR_NPM, POPULAR_PACKAGIST, POPULAR_PYPI } from './popular-packages';
import type { RuleHit, RuleMeta } from './types';

/** Supply-chain rules (category F). Operate on manifests rather than individual lines. */
export const supplyChainRules: RuleMeta[] = [
  {
    id: 'CG-SC-001',
    name: 'High-risk install-time lifecycle script',
    description: 'A package lifecycle script that runs automatically on install (preinstall/install/postinstall) performs network access, inline code execution, decoding or shell piping. Most npm malware executes through these hooks.',
    category: 'SUPPLY_CHAIN',
    severity: 'HIGH',
    confidence: 'MEDIUM',
    classification: 'SUSPICIOUS',
    languages: ['json'],
    matching: 'package.json scripts.preinstall/install/postinstall containing curl/wget/http(s) URLs, node -e / python -c inline code, eval, base64 decoding, pipes into shells, PowerShell, or hidden-file execution.',
    falsePositiveGuidance: 'Native modules (node-gyp, prebuild-install) legitimately run install scripts that download prebuilt binaries. Verify the download source and checksum.',
    remediation: 'Remove install-time network/exec behaviour or replace it with documented, explicit setup steps. Install untrusted packages with --ignore-scripts.',
    references: ['https://docs.npmjs.com/cli/using-npm/scripts#best-practices', 'https://attack.mitre.org/techniques/T1195/001/'],
  },
  {
    id: 'CG-SC-002',
    name: 'Install-time lifecycle script present',
    description: 'The package runs a script automatically on install. This is not malicious by itself but executes code on every machine that installs the package.',
    category: 'SUPPLY_CHAIN',
    severity: 'INFO',
    confidence: 'HIGH',
    classification: 'CONFIRMED',
    languages: ['json'],
    matching: 'package.json defines scripts.preinstall, scripts.install or scripts.postinstall without high-risk indicators (see CG-SC-001).',
    falsePositiveGuidance: 'Common for native modules and build tooling.',
    remediation: 'Review the script and the files it runs.',
    references: ['https://docs.npmjs.com/cli/using-npm/scripts'],
  },
  {
    id: 'CG-SC-003',
    name: 'Typosquatting candidate dependency',
    description: 'A dependency name is one or two edits away from a widely used package name. Attackers publish look-alike packages hoping for typos.',
    category: 'SUPPLY_CHAIN',
    severity: 'MEDIUM',
    confidence: 'LOW',
    classification: 'SUSPICIOUS',
    languages: ['json', 'text', 'toml'],
    matching: 'Edit distance 1 (names ≥ 5 chars) or 2 (names ≥ 10 chars) from a reference list of popular npm/PyPI/Packagist packages, or equal after removing separators, while not itself being on the list.',
    falsePositiveGuidance: 'Many legitimate packages have similar names (forks, plugins). This is a review prompt, not a verdict.',
    remediation: 'Confirm the package name, publisher and download counts on the registry. Replace with the intended package if it was a typo.',
    references: ['https://attack.mitre.org/techniques/T1195/001/'],
  },
  {
    id: 'CG-SC-004',
    name: 'Dependency installed from non-registry source',
    description: 'A dependency is resolved from a Git URL, HTTP tarball, or local path rather than a package registry. These sources bypass registry malware scanning and can change without a version bump.',
    category: 'SUPPLY_CHAIN',
    severity: 'LOW',
    confidence: 'HIGH',
    classification: 'CONFIRMED',
    languages: ['json', 'text', 'toml'],
    matching: 'Dependency specifiers starting with git+, git://, github:, http(s)://, file:, link: or user/repo shorthand; requirements lines with git+/http URLs.',
    falsePositiveGuidance: 'Common for forks and internal packages. Pin to a commit SHA.',
    remediation: 'Prefer registry versions. If a Git source is required, pin it to an immutable commit SHA.',
    references: ['https://docs.npmjs.com/cli/configuring-npm/package-json#git-urls-as-dependencies'],
  },
  {
    id: 'CG-SC-005',
    name: 'Unpinned dependency version',
    description: 'A dependency allows any version ("*", "latest", "x", ">=" without upper bound). A compromised future release would be installed automatically.',
    category: 'SUPPLY_CHAIN',
    severity: 'LOW',
    confidence: 'HIGH',
    classification: 'CONFIRMED',
    languages: ['json', 'text'],
    matching: 'npm/composer version specifiers "*", "", "latest", "x", or ">=" ranges with no upper bound; requirements.txt lines with no version specifier.',
    falsePositiveGuidance: 'Lockfiles mitigate this for applications, but not for libraries or installs without a lockfile.',
    remediation: 'Use bounded ranges and commit a lockfile.',
    references: ['https://docs.npmjs.com/cli/configuring-npm/package-lock-json'],
  },
  {
    id: 'CG-SC-006',
    name: 'Lockfile resolves packages from unexpected registry',
    description: 'The lockfile resolves packages from a host other than the official registry. This can indicate dependency confusion or a tampered lockfile.',
    category: 'SUPPLY_CHAIN',
    severity: 'MEDIUM',
    confidence: 'MEDIUM',
    classification: 'SUSPICIOUS',
    languages: ['json', 'yaml'],
    matching: '"resolved" / "tarball" URLs in package-lock.json, yarn.lock or pnpm-lock.yaml whose host is not registry.npmjs.org, registry.yarnpkg.com, npm.pkg.github.com, or codeload.github.com.',
    falsePositiveGuidance: 'Private registries (Artifactory, Verdaccio, GitHub Packages) are common in enterprises. Confirm the host is your organization\'s registry.',
    remediation: 'Confirm the registry host. Scope private packages to the private registry and public packages to the public registry.',
    references: ['https://medium.com/@alex.birsan/dependency-confusion-4a5d60fec610'],
  },
  {
    id: 'CG-SC-007',
    name: 'Python setup script runs code at install time',
    description: 'setup.py overrides install commands or performs network/process actions at module level — code that runs on "pip install" from source.',
    category: 'SUPPLY_CHAIN',
    severity: 'HIGH',
    confidence: 'MEDIUM',
    classification: 'SUSPICIOUS',
    languages: ['python'],
    matching: 'setup.py containing a cmdclass override of install/develop/egg_info together with subprocess/os.system/urllib/requests/socket/exec/base64 usage.',
    falsePositiveGuidance: 'Packages with C extensions customise build commands legitimately; network access during install is still unusual.',
    remediation: 'Review the custom command code. Install untrusted Python packages from wheels in isolated environments.',
    references: ['https://attack.mitre.org/techniques/T1195/001/'],
  },
];

const RISKY_SCRIPT = /\b(curl|wget|Invoke-WebRequest|iwr|powershell|certutil|bitsadmin)\b|https?:\/\/|\bnode\s+-e\b|\bnode\s+--eval\b|\bpython[0-9.]*\s+-c\b|\beval\b|base64|\|\s*(ba)?sh\b|\bnc\s|\/dev\/tcp|\s\.[\w-]+\.(js|sh|py)\b|\bchmod\s+\+x\b/i;
const NPM_REGISTRY_HOSTS = new Set(['registry.npmjs.org', 'registry.yarnpkg.com', 'npm.pkg.github.com', 'codeload.github.com', 'registry.npmmirror.com']);

function rule(id: string): RuleMeta {
  return supplyChainRules.find((r) => r.id === id)!;
}

function lineOf(content: string, needle: string): number | null {
  const idx = content.indexOf(needle);
  if (idx < 0) return null;
  let line = 1;
  for (let i = 0; i < idx; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

function withPathContext(hit: RuleHit, path: string): RuleHit {
  if (!isTestOrExamplePath(path)) return hit;
  return { ...hit, classification: 'FALSE_POSITIVE_CANDIDATE', confidence: 'LOW', extraDescription: 'Possible false positive: the manifest is in a test, fixture or example location.' };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_.]/g, '');
}

/** Returns the popular package a name imitates, or null. */
export function typosquatTarget(name: string, ecosystem: 'npm' | 'PyPI' | 'Packagist'): string | null {
  const list = ecosystem === 'npm' ? POPULAR_NPM : ecosystem === 'PyPI' ? POPULAR_PYPI : POPULAR_PACKAGIST;
  const lower = name.toLowerCase();
  if (list.includes(lower)) return null;
  const pypiNorm = (s: string) => s.replace(/[-_.]+/g, '-');
  if (ecosystem === 'PyPI' && list.some((p) => pypiNorm(p) === pypiNorm(lower))) return null; // PEP 503 equivalent
  // Scoped npm packages are only compared on the bare name when the scope is not an official one.
  const bare = lower.startsWith('@') ? lower.split('/')[1] ?? lower : lower;
  for (const p of list) {
    const pb = p.startsWith('@') ? p.split('/')[1] ?? p : p;
    if (bare === pb) continue; // e.g. "@myorg/lodash" is a scoped fork, not a typo
    if (ecosystem === 'npm' && normalizeName(bare) === normalizeName(pb) && bare !== pb) return p;
    const d = editDistance(bare, pb, 2);
    if ((d === 1 && pb.length >= 5) || (d === 2 && pb.length >= 10)) return p;
  }
  return null;
}

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const NON_REGISTRY_SPEC = /^(git\+|git:|github:|gitlab:|bitbucket:|https?:|file:|link:)|^[\w.-]+\/[\w.-]+(#.*)?$/;
const UNPINNED_SPEC = /^(\*|latest|x|X|>=?\s*[\d.]+)$|^$/;

export function analyzePackageJson(path: string, content: string): RuleHit[] {
  let pkg: PackageJson;
  try {
    pkg = JSON.parse(content) as PackageJson;
  } catch {
    return [];
  }
  if (!pkg || typeof pkg !== 'object') return [];
  const hits: RuleHit[] = [];
  for (const hook of ['preinstall', 'install', 'postinstall']) {
    const script = pkg.scripts?.[hook];
    if (typeof script !== 'string') continue;
    const risky = RISKY_SCRIPT.test(script);
    const id = risky ? 'CG-SC-001' : 'CG-SC-002';
    hits.push(
      withPathContext(
        {
          ruleId: id,
          line: lineOf(content, `"${hook}"`),
          evidence: `"${hook}": ${JSON.stringify(script)}`,
          fingerprintKey: `${hook}:${script}`,
          title: `${rule(id).name}: ${hook}`,
          metadata: { hook, packageName: pkg.name ?? null },
        },
        path,
      ),
    );
  }
  const sections: (keyof PackageJson)[] = ['dependencies', 'devDependencies', 'optionalDependencies'];
  for (const section of sections) {
    const deps = pkg[section] as Record<string, string> | undefined;
    if (!deps || typeof deps !== 'object') continue;
    for (const [name, specRaw] of Object.entries(deps)) {
      const spec = String(specRaw ?? '').trim();
      const line = lineOf(content, `"${name}"`);
      const target = typosquatTarget(name, 'npm');
      if (target) {
        hits.push(withPathContext({
          ruleId: 'CG-SC-003', line, evidence: `"${name}": "${spec}"`, fingerprintKey: `npm:${name}`,
          title: `Typosquatting candidate: "${name}" resembles "${target}"`,
          packageName: name, packageEcosystem: 'npm', metadata: { resembles: target, section },
        }, path));
      }
      if (NON_REGISTRY_SPEC.test(spec) && !spec.startsWith('npm:') && !spec.startsWith('workspace:')) {
        const pinned = /#[0-9a-f]{40}$/.test(spec);
        hits.push(withPathContext({
          ruleId: 'CG-SC-004', line, evidence: `"${name}": "${spec}"`, fingerprintKey: `npm:${name}:${spec}`,
          severity: pinned ? 'INFO' : 'LOW',
          packageName: name, packageEcosystem: 'npm', metadata: { section, pinnedToCommit: pinned },
        }, path));
      } else if (UNPINNED_SPEC.test(spec) && section !== 'devDependencies') {
        hits.push(withPathContext({
          ruleId: 'CG-SC-005', line, evidence: `"${name}": "${spec}"`, fingerprintKey: `npm:${name}`,
          packageName: name, packageEcosystem: 'npm',
        }, path));
      }
    }
  }
  return hits;
}

export function analyzeRequirementsTxt(path: string, content: string): RuleHit[] {
  const hits: RuleHit[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('-r') || line.startsWith('-c') || line.startsWith('--')) return;
    if (/^(-e\s+)?(git\+|https?:\/\/)/.test(line)) {
      hits.push(withPathContext({ ruleId: 'CG-SC-004', line: i + 1, evidence: line, fingerprintKey: `pypi:${line}`, packageEcosystem: 'PyPI' }, path));
      return;
    }
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*(.*)$/.exec(line);
    if (!m) return;
    const name = m[1]!;
    const spec = m[3] ?? '';
    const target = typosquatTarget(name, 'PyPI');
    if (target) {
      hits.push(withPathContext({
        ruleId: 'CG-SC-003', line: i + 1, evidence: line, fingerprintKey: `pypi:${name.toLowerCase()}`,
        title: `Typosquatting candidate: "${name}" resembles "${target}"`, packageName: name, packageEcosystem: 'PyPI',
        metadata: { resembles: target },
      }, path));
    }
    if (!spec) {
      hits.push(withPathContext({ ruleId: 'CG-SC-005', line: i + 1, evidence: line, fingerprintKey: `pypi:${name.toLowerCase()}`, packageName: name, packageEcosystem: 'PyPI', severity: 'INFO' }, path));
    }
  });
  return hits;
}

export function analyzeSetupPy(path: string, content: string): RuleHit[] {
  if (!/\bcmdclass\s*=/.test(content)) return [];
  if (!/\b(install|develop|egg_info|build_py)\b/.test(content)) return [];
  if (!/\b(subprocess|os\.system|os\.popen|urllib|requests\.|socket\.|exec\s*\(|eval\s*\(|base64)\b/.test(content)) return [];
  return [withPathContext({ ruleId: 'CG-SC-007', line: lineOf(content, 'cmdclass'), evidence: 'cmdclass override with process/network/decoding calls', fingerprintKey: 'setup.py:cmdclass' }, path)];
}

/** Check lockfile "resolved" URLs for unexpected registries. */
export function analyzeLockfileRegistries(path: string, content: string): RuleHit[] {
  const hits: RuleHit[] = [];
  const hosts = new Map<string, number>();
  const re = /(?:"resolved"\s*:\s*"|resolved\s+"?|tarball:\s*)(https?:\/\/[^"\s,}]+)/g;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(content)) && guard++ < 200_000) {
    try {
      const host = new URL(m[1]!).hostname.toLowerCase();
      if (!NPM_REGISTRY_HOSTS.has(host) && !hosts.has(host)) hosts.set(host, m.index);
    } catch {
      /* ignore malformed */
    }
  }
  for (const [host, index] of hosts) {
    let line = 1;
    for (let i = 0; i < index; i++) if (content.charCodeAt(i) === 10) line++;
    hits.push(withPathContext({
      ruleId: 'CG-SC-006', line, evidence: `resolved from ${host}`, fingerprintKey: `${host}`,
      title: `Lockfile resolves packages from ${host}`, metadata: { host },
    }, path));
  }
  return hits;
}
