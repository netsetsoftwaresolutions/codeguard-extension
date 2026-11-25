import { createHash } from 'node:crypto';
import type { EngineId, NormalizedFinding } from '../contracts';
import { buildFileContext } from './context';
import { maskEvidence } from './masking';
import { configurationRules } from './rules/configuration';
import { analyzePath, exposedFileRules } from './rules/exposed-files';
import { malwareRules } from './rules/malware';
import { fakeBinaryHit, inzFileHit, polinriderPathRules, polinriderRules } from './rules/polinrider';
import { scanSecrets, secretRuleMeta, type SecretScanOptions } from './secrets';
import {
  analyzeLockfileRegistries,
  analyzePackageJson,
  analyzeRequirementsTxt,
  analyzeSetupPy,
  supplyChainRules,
} from './supply-chain';
import type { CodeRule, RuleHit, RuleMeta } from './types';
import { dependencyRuleMeta } from './dependencies/rules';

export const CODE_RULES: CodeRule[] = [...malwareRules, ...polinriderRules, ...configurationRules];

/** Every rule with metadata, used for docs, DB seeding and report rendering. */
export const RULE_CATALOG: RuleMeta[] = [
  ...CODE_RULES.map(stripAnalyzer),
  ...secretRuleMeta,
  ...supplyChainRules,
  ...exposedFileRules,
  ...polinriderPathRules,
  ...dependencyRuleMeta,
];

function stripAnalyzer(rule: CodeRule): RuleMeta {
  const { analyze: _a, appliesToPath: _p, ...meta } = rule;
  return meta;
}

const META_BY_ID = new Map(RULE_CATALOG.map((r) => [r.id, r]));

export function getRuleMeta(id: string): RuleMeta | undefined {
  return META_BY_ID.get(id);
}

export function fingerprint(parts: (string | number | null | undefined)[]): string {
  return createHash('sha256').update(parts.map((p) => String(p ?? '')).join('␟')).digest('hex').slice(0, 40);
}

function engineFor(ruleId: string): EngineId {
  if (ruleId.startsWith('CG-SEC-')) return 'codeguard-secrets';
  if (ruleId.startsWith('CG-SC-')) return 'codeguard-dependencies';
  return 'codeguard-rules';
}

/** Convert a raw rule hit into a normalized finding. Evidence is masked here — the single choke point. */
export function normalizeHit(hit: RuleHit, filePath: string | null): NormalizedFinding {
  const meta = getRuleMeta(hit.ruleId);
  if (!meta) throw new Error(`Unknown rule ${hit.ruleId}`);
  const secrets = hit.secretValue ? [hit.secretValue] : [];
  const description = [meta.description, hit.extraDescription].filter(Boolean).join(' ');
  return {
    fingerprint: fingerprint([hit.ruleId, filePath, hit.fingerprintKey ?? hit.evidence ?? hit.line]),
    ruleId: meta.id,
    engine: engineFor(meta.id),
    category: meta.category,
    classification: hit.classification ?? meta.classification,
    title: hit.title ?? meta.name,
    description,
    severity: hit.severity ?? meta.severity,
    confidence: hit.confidence ?? meta.confidence,
    location: { filePath, startLine: hit.line, endLine: hit.endLine ?? hit.line },
    maskedEvidence: hit.evidence ? maskEvidence(hit.evidence, secrets) : null,
    recommendation: meta.remediation,
    falsePositiveGuidance: meta.falsePositiveGuidance,
    references: meta.references,
    packageName: hit.packageName ?? null,
    packageVersion: hit.packageVersion ?? null,
    packageEcosystem: hit.packageEcosystem ?? null,
    metadata: hit.metadata,
  };
}

export interface AnalyzeFileOptions {
  secrets?: SecretScanOptions;
  /** Disable built-in secret detection (e.g. when the caller handles it). */
  skipSecrets?: boolean;
}

/** Analyze one text file with every built-in content rule. Pure and synchronous. */
export function analyzeFile(path: string, content: string, options: AnalyzeFileOptions = {}): NormalizedFinding[] {
  const ctx = buildFileContext(path, content);
  const hits: RuleHit[] = [];
  for (const rule of CODE_RULES) {
    if (rule.appliesToPath && !rule.appliesToPath(path)) continue;
    try {
      hits.push(...rule.analyze(ctx));
    } catch {
      // A single faulty rule must not abort the scan; failures surface through engine status in the worker.
    }
  }
  if (!options.skipSecrets) hits.push(...scanSecrets(ctx, options.secrets));

  const base = path.split('/').pop() ?? path;
  if (base === 'package.json') hits.push(...analyzePackageJson(path, content));
  else if (/^requirements([-_.][\w-]+)?\.txt$/i.test(base)) hits.push(...analyzeRequirementsTxt(path, content));
  else if (base === 'setup.py') hits.push(...analyzeSetupPy(path, content));
  else if (base === 'package-lock.json' || base === 'yarn.lock' || base === 'pnpm-lock.yaml' || base === 'npm-shrinkwrap.json') {
    hits.push(...analyzeLockfileRegistries(path, content));
  }
  return hits.map((h) => normalizeHit(h, path));
}

/** Analyze a path (and optionally its first bytes) for exposed-file and executable rules. */
export function analyzeInventoryEntry(path: string, head: Uint8Array | null, readError?: string): NormalizedFinding[] {
  const malware = [fakeBinaryHit(path, head), inzFileHit(path)].filter((h): h is RuleHit => h !== null);
  return [...analyzePath(path, head, readError), ...malware].map((h) => normalizeHit(h, path));
}

/**
 * Deduplicate findings by fingerprint, keeping the highest-severity instance.
 * Engines that report the same secret/issue (e.g. gitleaks + built-in) are merged.
 */
export function dedupeFindings(findings: NormalizedFinding[]): NormalizedFinding[] {
  const order = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 } as const;
  const byFp = new Map<string, NormalizedFinding>();
  for (const f of findings) {
    const prev = byFp.get(f.fingerprint);
    if (!prev || order[f.severity] > order[prev.severity]) byFp.set(f.fingerprint, f);
  }
  // Secondary merge: identical location + category from different engines (e.g. gitleaks and built-in secrets).
  const byLoc = new Map<string, NormalizedFinding>();
  for (const f of byFp.values()) {
    const key = f.category === 'SECRET' && f.location.filePath && f.location.startLine
      ? `SECRET|${f.location.filePath}|${f.location.startLine}`
      : `FP|${f.fingerprint}`;
    const prev = byLoc.get(key);
    if (!prev || order[f.severity] > order[prev.severity] || (prev.engine !== 'codeguard-secrets' && f.engine === 'codeguard-secrets' && order[f.severity] === order[prev.severity])) {
      byLoc.set(key, f);
    }
  }
  // A "secret" on the same line as known malware (e.g. PolinRider's AUTH_API_KEY) is the malware itself, not a credential.
  const malwareLines = new Set([...byLoc.values()].filter((f) => f.ruleId.startsWith('CG-MAL-')).map((f) => `${f.location.filePath}|${f.location.startLine}`));
  return [...byLoc.values()].filter((f) => f.category !== 'SECRET' || !malwareLines.has(`${f.location.filePath}|${f.location.startLine}`));
}
