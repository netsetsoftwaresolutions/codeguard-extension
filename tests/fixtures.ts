import { parseSourceUrl, type ScanView, type SourceInspection } from '../src/contracts';

/** Test fixtures shaped exactly like the API contract in src/contracts. */
export function inspectionFor(url: string, overrides: Partial<SourceInspection> = {}): SourceInspection {
  return {
    parsed: parseSourceUrl(url),
    accessible: true,
    visibility: 'public',
    defaultBranch: 'main',
    branches: ['main', 'develop', 'feature/login'],
    capabilities: {
      scanFile: true,
      scanBranch: true,
      scanRepository: true,
      scanAllBranches: true,
      scanPullRequest: true,
      scanFolder: true,
    },
    messages: [],
    previousScans: [],
    ...overrides,
  };
}

export function scanView(overrides: Partial<ScanView> = {}): ScanView {
  return {
    id: 'scan_1',
    projectId: 'proj_1',
    type: 'REPOSITORY',
    status: 'COMPLETED',
    stage: 'DONE',
    progress: 100,
    provider: 'GITHUB',
    sourceKind: 'REPOSITORY',
    sourceUrl: 'https://github.com/acme/app',
    sourceLabel: 'acme/app',
    ref: 'main',
    commitSha: 'abcdef1234567',
    scanGroupId: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    summary: null,
    ...overrides,
  };
}
