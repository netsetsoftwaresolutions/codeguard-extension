/**
 * Domain enumerations shared by every CodeGuard component.
 * Values are stable strings — they are persisted in MongoDB and exported in reports.
 */

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const FINDING_STATUSES = [
  'OPEN',
  'UNDER_REVIEW',
  'CONFIRMED',
  'FALSE_POSITIVE',
  'ACCEPTED_RISK',
  'RESOLVED',
] as const;
export type FindingStatus = (typeof FINDING_STATUSES)[number];

/**
 * How a finding should be read by a human. Every report separates these so that
 * a pattern match is never presented as confirmed malware.
 */
export const FINDING_CLASSIFICATIONS = [
  /** Deterministic evidence: known advisory match, verified secret format, exact malicious-package advisory. */
  'CONFIRMED',
  /** Heuristic indicator that warrants human review. */
  'SUSPICIOUS',
  /** Matched, but context suggests a likely false positive (tests, docs, examples). */
  'FALSE_POSITIVE_CANDIDATE',
] as const;
export type FindingClassification = (typeof FINDING_CLASSIFICATIONS)[number];

export const FINDING_CATEGORIES = [
  'OBFUSCATION',
  'REMOTE_CODE_EXECUTION',
  'CREDENTIAL_THEFT',
  'DATA_EXFILTRATION',
  'BACKDOOR',
  'SUPPLY_CHAIN',
  'VULNERABLE_DEPENDENCY',
  'MALICIOUS_PACKAGE',
  'SECRET',
  'CONFIGURATION',
  'EXPOSED_FILE',
  'CODE_QUALITY_SECURITY',
  'SUSPICIOUS_NETWORK',
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const SOURCE_PROVIDERS = [
  'UPLOAD',
  'GITHUB',
  'GITLAB',
  'BITBUCKET',
  'DROPBOX',
  'GOOGLE_DRIVE',
  'PUBLIC_URL',
] as const;
export type SourceProvider = (typeof SOURCE_PROVIDERS)[number];

export const SOURCE_KINDS = [
  'REPOSITORY',
  'FILE',
  'FOLDER',
  'ARCHIVE',
  'PULL_REQUEST',
  'MERGE_REQUEST',
  'UNKNOWN',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SCAN_TYPES = [
  'UPLOAD',
  'URL',
  'REPOSITORY',
  'BRANCH',
  'FILE',
  'PULL_REQUEST',
  'COMMIT_HISTORY',
] as const;
export type ScanType = (typeof SCAN_TYPES)[number];

export const SCAN_STATUSES = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED',
] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const TERMINAL_SCAN_STATUSES: readonly ScanStatus[] = [
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED',
];

export const SCAN_STAGES = [
  'VALIDATING',
  'ACQUIRING_SOURCE',
  'BUILDING_INVENTORY',
  'DETECTING_ECOSYSTEMS',
  'RUNNING_ENGINES',
  'NORMALIZING',
  'SCORING',
  'AI_ANALYSIS',
  'SAVING',
  'DONE',
] as const;
export type ScanStage = (typeof SCAN_STAGES)[number];

export const ORG_ROLES = ['OWNER', 'ADMIN', 'DEVELOPER', 'SECURITY_ANALYST', 'VIEWER'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const ENGINE_IDS = [
  'codeguard-rules',
  'codeguard-secrets',
  'codeguard-dependencies',
  'osv-api',
  'semgrep',
  'gitleaks',
  'osv-scanner',
  'git-history',
] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export const ENGINE_RUN_STATUSES = ['COMPLETED', 'SKIPPED', 'NOT_INSTALLED', 'FAILED', 'TIMED_OUT'] as const;
export type EngineRunStatus = (typeof ENGINE_RUN_STATUSES)[number];

export const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER[b] - SEVERITY_ORDER[a];
}
