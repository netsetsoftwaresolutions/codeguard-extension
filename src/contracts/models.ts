import type {
  Confidence,
  EngineId,
  EngineRunStatus,
  FindingCategory,
  FindingClassification,
  FindingStatus,
  ScanStage,
  ScanStatus,
  ScanType,
  Severity,
  SourceKind,
  SourceProvider,
} from './enums';

/** Location of a finding inside the scanned tree. Paths are always POSIX and relative to the scan root. */
export interface FindingLocation {
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  startColumn?: number | null;
}

/**
 * A normalized finding as produced by any engine before persistence.
 * `fingerprint` is stable across line shifts so the same issue is recognised between scans.
 */
export interface NormalizedFinding {
  fingerprint: string;
  ruleId: string;
  engine: EngineId;
  category: FindingCategory;
  classification: FindingClassification;
  title: string;
  description: string;
  severity: Severity;
  confidence: Confidence;
  location: FindingLocation;
  /** Already masked/truncated; never contains a full secret value. */
  maskedEvidence: string | null;
  recommendation: string;
  falsePositiveGuidance?: string | null;
  references: string[];
  packageName?: string | null;
  packageVersion?: string | null;
  packageEcosystem?: string | null;
  advisoryIds?: string[];
  fixedVersions?: string[];
  vulnerableRange?: string | null;
  /** Free-form engine-specific details safe to display. */
  metadata?: Record<string, unknown>;
}

export interface EngineRun {
  engine: EngineId;
  status: EngineRunStatus;
  version?: string | null;
  durationMs: number;
  findingCount: number;
  message?: string | null;
}

export interface ExcludedFile {
  path: string;
  reason: string;
}

/** Scan completeness — reported separately from risk. */
export interface ScanCoverage {
  filesDiscovered: number;
  filesScanned: number;
  filesExcluded: number;
  bytesScanned: number;
  excludedSamples: ExcludedFile[];
  excludedByReason: Record<string, number>;
  languages: Record<string, number>;
  ecosystems: string[];
  manifests: string[];
  lockfiles: string[];
  engines: EngineRun[];
  limitations: string[];
  truncated: boolean;
}

export interface RiskScoreComponent {
  key: string;
  label: string;
  points: number;
  detail: string;
}

export const RISK_LEVELS = ['CRITICAL', 'HIGH', 'ELEVATED', 'LOW', 'MINIMAL'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/**
 * Transparent, additive risk score (0–100). It is NOT a probability that the code is safe.
 * Every point is traceable to a component listed in `components`.
 */
export interface RiskScore {
  score: number;
  level: RiskLevel;
  components: RiskScoreComponent[];
  methodologyVersion: string;
}

export type SeverityCounts = Record<Severity, number>;

export interface ScanSummaryView {
  severityCounts: SeverityCounts;
  categoryCounts: Partial<Record<FindingCategory, number>>;
  classificationCounts: Record<FindingClassification, number>;
  totalFindings: number;
  risk: RiskScore;
  coverage: ScanCoverage;
  aiUsed: boolean;
}

export interface ScanView {
  id: string;
  projectId: string;
  projectName?: string;
  type: ScanType;
  status: ScanStatus;
  stage: ScanStage | null;
  progress: number;
  provider: SourceProvider;
  sourceKind: SourceKind;
  sourceUrl: string | null;
  sourceLabel: string;
  ref: string | null;
  commitSha: string | null;
  baseRef?: string | null;
  baseCommitSha?: string | null;
  scanGroupId: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  summary?: ScanSummaryView | null;
}

export interface FindingView {
  id: string;
  scanId: string;
  projectId: string;
  fingerprint: string;
  ruleId: string;
  engine: EngineId;
  category: FindingCategory;
  classification: FindingClassification;
  title: string;
  description: string;
  severity: Severity;
  confidence: Confidence;
  status: FindingStatus;
  filePath: string | null;
  startLine: number | null;
  endLine: number | null;
  branch: string | null;
  commitSha: string | null;
  packageName: string | null;
  packageVersion: string | null;
  packageEcosystem: string | null;
  advisoryIds: string[];
  fixedVersions: string[];
  maskedEvidence: string | null;
  recommendation: string;
  falsePositiveGuidance: string | null;
  references: string[];
  /** Link to the exact revision/line on the source provider, when one exists. */
  sourceLink: string | null;
  /** Set on PR / comparison scans: whether the finding is new relative to the base revision. */
  introducedInChange: boolean | null;
  aiExplanation: string | null;
  detectedAt: string;
  lastSeenAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserView {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface OrganizationView {
  id: string;
  name: string;
  slug: string;
  role: import('./enums').OrgRole;
  planKey: string;
  /** Data retention in days (null = plan default). */
  retentionDays?: number | null;
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: UserView;
  organizations: OrganizationView[];
}
