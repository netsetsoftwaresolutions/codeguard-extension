import type { AuthResponse, SourceInspection } from '../src/contracts';
import { vi } from 'vitest';
import type { CodeGuardApi } from '../src/background/api-client';
import { BackgroundService } from '../src/background/service';
import { memoryKV, Store } from '../src/background/store';
import type { Settings } from '../src/shared/settings';
import { scanView } from './fixtures';

export const RUNTIME_ID = 'ext-id';
export const PAGE_SENDER = { id: RUNTIME_ID, url: `chrome-extension://${RUNTIME_ID}/popup.html` };

export const AUTH: AuthResponse = {
  accessToken: 'tok_secret',
  expiresIn: 3600,
  user: { id: 'u1', email: 'dev@acme.test', name: null, isPlatformAdmin: false, emailVerified: true, createdAt: '2026-01-01T00:00:00Z' },
  organizations: [{ id: 'org_1', name: 'Acme', slug: 'acme', role: 'DEVELOPER', planKey: 'free' }],
};

export function fakeApi(inspection: SourceInspection) {
  const created = { scans: [scanView({ id: 'scan_new' })], scanGroupId: null };
  return {
    inspect: vi.fn(async (_url: string, _org: string | null) => inspection),
    scansBySource: vi.fn(async (_url: string) => [] as ReturnType<typeof scanView>[]),
    scanRepository: vi.fn(async (_body: unknown, _idem?: string) => created),
    scanBranch: vi.fn(async (_body: unknown, _idem?: string) => created),
    scanPullRequest: vi.fn(async (_body: unknown, _idem?: string) => created),
    scanUrl: vi.fn(async (_body: unknown, _idem?: string) => created),
    meta: vi.fn(),
    me: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    listScans: vi.fn(),
    getScan: vi.fn(),
    getScanStatus: vi.fn(),
    getFindings: vi.fn(),
  };
}

export async function makeService(opts: { inspection: SourceInspection; settings?: Partial<Settings>; signedIn?: boolean; now?: number }) {
  const now = opts.now ?? Date.parse('2026-10-22T12:00:00Z');
  const store = new Store(memoryKV(), memoryKV(), () => now);
  if (opts.signedIn !== false) await store.setAuth(AUTH);
  await store.updateSettings({ organizationId: 'org_1', ...(opts.settings ?? {}) });
  const api = fakeApi(opts.inspection);
  const trackScan = vi.fn(async () => undefined);
  const service = new BackgroundService({
    store,
    api: api as unknown as CodeGuardApi,
    runtimeId: RUNTIME_ID,
    now: () => now,
    openSidePanel: vi.fn(async () => undefined),
    hasHostPermission: vi.fn(async () => true),
    getActiveTab: vi.fn(async () => null),
    broadcast: vi.fn(),
    trackScan,
  });
  return { service, store, api, trackScan, now };
}
