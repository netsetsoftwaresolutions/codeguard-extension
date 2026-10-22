import type { OrgRole, ScanStatus, Severity, SourceKind, SourceProvider } from './enums';
import type { ParsedSource } from './source-url';
import type { RiskLevel, ScanView, SeverityCounts } from './models';

/** API response shapes beyond the core scan/finding models. */

export interface ProjectSourceView {
  id: string;
  provider: SourceProvider;
  kind: string;
  url: string | null;
  displayName: string;
  defaultBranch: string | null;
  monitorPushes: boolean;
  monitorPullRequests: boolean;
  lastScannedAt: string | null;
}

export interface ProjectView {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  monitoringEnabled: boolean;
  settings: {
    excludePaths?: string[];
    secretAllowlist?: string[];
    enableAi?: boolean;
    enableHistory?: boolean;
  };
  createdAt: string;
  sources?: ProjectSourceView[];
  latestScan?: ScanView | null;
  openFindings?: SeverityCounts;
  scanCount?: number;
}

export interface BranchSummaryView {
  branch: string;
  scanId: string;
  status: ScanStatus;
  commitSha: string | null;
  completedAt: string | null;
  filesScanned: number;
  severityCounts: SeverityCounts;
  suspiciousCount: number;
  vulnerableDependencies: number;
  malwareIndicators: number;
  riskScore: number;
  riskLevel: RiskLevel;
}

export interface ScanGroupView {
  scanGroupId: string;
  repository: string;
  scans: ScanView[];
  branches: BranchSummaryView[];
}

export interface ScanFileView {
  path: string;
  language: string | null;
  sizeBytes: number;
  status: 'SCANNED' | 'EXCLUDED' | 'BINARY' | 'TOO_LARGE';
  excludeReason: string | null;
}

export interface CommitView {
  sha: string;
  authorName: string | null;
  committedAt: string | null;
  message: string | null;
  filesChanged: number;
  findingCount: number;
  link: string | null;
  signals: {
    dependencyChanges?: string[];
    scriptChanges?: string[];
    newUrls?: string[];
    executables?: string[];
    configChanges?: string[];
  };
  findings: { id: string; title: string; severity: Severity; filePath: string | null; startLine: number | null }[];
}

export interface ScanComparisonView {
  baseScanId: string;
  headScanId: string;
  newFindings: import('./models').FindingView[];
  resolvedFindings: import('./models').FindingView[];
  unchangedCount: number;
  riskDelta: number;
}

export interface SourceInspection {
  parsed: ParsedSource;
  accessible: boolean;
  visibility: 'public' | 'private' | 'unknown';
  defaultBranch: string | null;
  branches: string[] | null;
  /** Which scan actions are actually possible for this source with the current configuration. */
  capabilities: {
    scanFile: boolean;
    scanBranch: boolean;
    scanRepository: boolean;
    scanAllBranches: boolean;
    scanPullRequest: boolean;
    scanFolder: boolean;
  };
  /** e.g. "Only the shared file is accessible; a full folder scan is not possible from this link." */
  messages: string[];
  previousScans: ScanView[];
}

export interface DashboardOverview {
  organizationId: string;
  projectCount: number;
  scansLast30Days: number;
  scansInProgress: number;
  openFindings: SeverityCounts;
  recentScans: ScanView[];
  riskTrend: { date: string; averageScore: number; scans: number }[];
  topRiskProjects: { projectId: string; name: string; riskScore: number; riskLevel: RiskLevel; lastScanAt: string | null }[];
}

export interface IntegrationView {
  provider: SourceProvider;
  name: string;
  /** Server has the required credentials configured (env). */
  configured: boolean;
  /** Organization has an active connection. */
  connected: boolean;
  connections: { id: string; accountLogin: string | null; status: string; createdAt: string }[];
  publicAccess: string;
  privateAccess: string;
  setupHint: string | null;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  severity: Severity | null;
  readAt: string | null;
  createdAt: string;
}

export interface MemberView {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: OrgRole;
  createdAt: string;
}

export interface InvitationView {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  acceptedAt: string | null;
}

export interface AuditLogView {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SubscriptionView {
  organizationId: string;
  plan: {
    key: string;
    name: string;
    description: string;
    limits: Record<string, number>;
    features: string[];
  };
  status: string;
  currentPeriodStart: string;
  usage: { scansThisPeriod: number; scansLimit: number; projects: number; projectsLimit: number; members: number; membersLimit: number };
  billingEnabled: boolean;
}

export interface AdminOverview {
  totals: { users: number; organizations: number; projects: number; scans: number };
  scansBySource: Partial<Record<SourceProvider, number>>;
  scansByStatus: Partial<Record<ScanStatus, number>>;
  scansLast24h: number;
  failedScans: { id: string; organizationId: string; errorMessage: string | null; createdAt: string; provider: SourceProvider }[];
  queue: { waiting: number; active: number; delayed: number; failed: number; completed: number };
  workers: { id: string; hostname: string; lastHeartbeat: string; concurrency: number; engines: Record<string, string> }[];
  ruleset: { version: string; rules: number; enabled: number };
  plans: { key: string; organizations: number }[];
}

export interface MetaView {
  productName: string;
  version: string;
  features: {
    ai: boolean;
    githubApp: boolean;
    githubOAuthLogin: boolean;
    dropboxOAuth: boolean;
    googleDriveApiKey: boolean;
    googleDriveOAuth: boolean;
    email: boolean;
    billing: boolean;
  };
  limits: { maxUploadBytes: number };
}

export interface ScanCreatedResponse {
  scans: ScanView[];
  scanGroupId: string | null;
}

export type { SourceKind };
