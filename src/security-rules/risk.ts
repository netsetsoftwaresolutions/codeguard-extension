import type {
  Confidence,
  FindingCategory,
  NormalizedFinding,
  RiskLevel,
  RiskScore,
  RiskScoreComponent,
  Severity,
} from '../contracts';

/**
 * Transparent additive risk score, methodology v1.
 *
 *   finding points = SEVERITY_POINTS[severity] × CONFIDENCE_FACTOR[confidence]
 *
 * Points are summed per component and each component is capped, so one noisy category cannot
 * dominate. False-positive candidates, findings marked false positive / accepted risk / resolved,
 * and informational findings contribute 0. The total is capped at 100.
 *
 * The level is the higher of (a) the score band and (b) an evidence floor: any CRITICAL finding
 * with HIGH confidence forces level CRITICAL; any HIGH/HIGH finding forces at least HIGH.
 *
 * The score is NOT a probability and does not say a project is safe. Coverage is reported separately.
 */
export const RISK_METHODOLOGY_VERSION = '1.0';

export const SEVERITY_POINTS: Record<Severity, number> = { CRITICAL: 25, HIGH: 10, MEDIUM: 4, LOW: 1, INFO: 0 };
export const CONFIDENCE_FACTOR: Record<Confidence, number> = { HIGH: 1, MEDIUM: 0.7, LOW: 0.4 };

interface ComponentDef {
  key: string;
  label: string;
  categories: FindingCategory[];
  cap: number;
}

export const RISK_COMPONENTS: ComponentDef[] = [
  { key: 'malware', label: 'Malware & backdoor indicators', categories: ['OBFUSCATION', 'REMOTE_CODE_EXECUTION', 'CREDENTIAL_THEFT', 'DATA_EXFILTRATION', 'BACKDOOR'], cap: 60 },
  { key: 'malicious_packages', label: 'Known malicious packages', categories: ['MALICIOUS_PACKAGE'], cap: 60 },
  { key: 'vulnerable_dependencies', label: 'Known vulnerable dependencies', categories: ['VULNERABLE_DEPENDENCY'], cap: 40 },
  { key: 'secrets', label: 'Exposed secrets', categories: ['SECRET'], cap: 40 },
  { key: 'supply_chain', label: 'Supply-chain risks', categories: ['SUPPLY_CHAIN'], cap: 30 },
  { key: 'configuration', label: 'Security configuration & exposed files', categories: ['CONFIGURATION', 'EXPOSED_FILE'], cap: 20 },
  { key: 'other', label: 'Other findings', categories: ['SUSPICIOUS_NETWORK', 'CODE_QUALITY_SECURITY'], cap: 15 },
];

const EXCLUDED_STATUSES = new Set(['FALSE_POSITIVE', 'ACCEPTED_RISK', 'RESOLVED']);

export interface ScorableFinding extends Pick<NormalizedFinding, 'severity' | 'confidence' | 'category' | 'classification'> {
  status?: string;
}

export function findingPoints(f: ScorableFinding): number {
  if (f.classification === 'FALSE_POSITIVE_CANDIDATE') return 0;
  if (f.status && EXCLUDED_STATUSES.has(f.status)) return 0;
  return SEVERITY_POINTS[f.severity] * CONFIDENCE_FACTOR[f.confidence];
}

function levelForScore(score: number): RiskLevel {
  if (score >= 70) return 'CRITICAL';
  if (score >= 40) return 'HIGH';
  if (score >= 15) return 'ELEVATED';
  if (score > 0) return 'LOW';
  return 'MINIMAL';
}

const LEVEL_RANK: Record<RiskLevel, number> = { MINIMAL: 0, LOW: 1, ELEVATED: 2, HIGH: 3, CRITICAL: 4 };

export function calculateRiskScore(findings: ScorableFinding[]): RiskScore {
  const components: RiskScoreComponent[] = [];
  let total = 0;
  for (const def of RISK_COMPONENTS) {
    const relevant = findings.filter((f) => def.categories.includes(f.category));
    const raw = relevant.reduce((s, f) => s + findingPoints(f), 0);
    const points = Math.min(def.cap, Math.round(raw * 10) / 10);
    const counted = relevant.filter((f) => findingPoints(f) > 0).length;
    if (relevant.length === 0) continue;
    components.push({
      key: def.key,
      label: def.label,
      points,
      detail: `${counted} contributing finding(s)${raw > def.cap ? `, capped at ${def.cap} (uncapped ${Math.round(raw)})` : ''}`,
    });
    total += points;
  }
  const score = Math.min(100, Math.round(total));
  let level = levelForScore(score);
  const active = findings.filter((f) => findingPoints(f) > 0);
  if (active.some((f) => f.severity === 'CRITICAL' && f.confidence === 'HIGH')) level = 'CRITICAL';
  else if (active.some((f) => (f.severity === 'HIGH' || f.severity === 'CRITICAL') && f.confidence === 'HIGH') && LEVEL_RANK[level] < LEVEL_RANK.HIGH) level = 'HIGH';
  return { score, level, components, methodologyVersion: RISK_METHODOLOGY_VERSION };
}
