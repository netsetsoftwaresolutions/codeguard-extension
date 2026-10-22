import { describe, expect, it } from 'vitest';
import { requiresConsent } from '../src/shared/consent';
import { inspectionFor } from './fixtures';
import { makeService, PAGE_SENDER } from './service-helpers';

const REPO = 'https://github.com/acme/private-app';

function startScan(service: Awaited<ReturnType<typeof makeService>>['service'], consent?: boolean) {
  return service.handle(
    { type: 'START_SCAN', request: { action: 'SCAN_REPOSITORY', sourceUrl: REPO, ...(consent !== undefined ? { consent } : {}) } },
    PAGE_SENDER,
  );
}

describe('requiresConsent', () => {
  it('is required for private and unknown sources without stored consent', () => {
    expect(requiresConsent('private', 'k', {})).toBe(true);
    expect(requiresConsent('unknown', 'k', {})).toBe(true);
    expect(requiresConsent(undefined, 'k', {})).toBe(true);
    expect(requiresConsent('private', 'k', { k: 1 })).toBe(false);
    expect(requiresConsent('public', 'k', {})).toBe(false);
  });
});

describe('consent gating in the background', () => {
  it('refuses to scan a private source without consent and never calls the scan API', async () => {
    const { service, api } = await makeService({ inspection: inspectionFor(REPO, { visibility: 'private' }) });
    const res = await startScan(service);
    expect(res).toEqual({ ok: false, error: expect.objectContaining({ code: 'CONSENT_REQUIRED' }) });
    expect(api.scanRepository).not.toHaveBeenCalled();
  });

  it('treats unknown visibility like private', async () => {
    const { service, api } = await makeService({ inspection: inspectionFor(REPO, { visibility: 'unknown' }) });
    expect((await startScan(service, false)).ok).toBe(false);
    expect(api.scanRepository).not.toHaveBeenCalled();
  });

  it('scans with consent: true after acceptance and remembers consent for the source', async () => {
    const { service, api, store } = await makeService({ inspection: inspectionFor(REPO, { visibility: 'private' }) });
    const res = await startScan(service, true);
    expect(res.ok).toBe(true);
    expect(api.scanRepository).toHaveBeenCalledWith(
      expect.objectContaining({ url: REPO, consent: true, target: { organizationId: 'org_1' }, options: { enableAi: false } }),
      undefined,
    );
    expect(Object.keys(await store.getConsents())).toEqual([REPO]);

    // Second scan of the same repo (from a file page) needs no new consent.
    const again = await service.handle(
      { type: 'START_SCAN', request: { action: 'SCAN_BRANCH', sourceUrl: `${REPO}/tree/develop`, ref: 'develop' } },
      PAGE_SENDER,
    );
    expect(again.ok).toBe(true);
    expect(api.scanBranch).toHaveBeenCalledWith(expect.objectContaining({ url: REPO, ref: 'develop', consent: true }), undefined);
  });

  it('does not require consent for public sources and does not send a consent flag', async () => {
    const { service, api } = await makeService({ inspection: inspectionFor(REPO, { visibility: 'public' }) });
    const res = await startScan(service);
    expect(res.ok).toBe(true);
    const body = api.scanRepository.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(body.consent).toBeUndefined();
  });

  it('applies to Dropbox shared links too and posts to /scans/url with the canonical link', async () => {
    const url = 'https://www.dropbox.com/scl/fi/abc/app.js?rlkey=k1&dl=0';
    const { service, api } = await makeService({ inspection: inspectionFor(url, { visibility: 'unknown' }) });
    const denied = await service.handle({ type: 'START_SCAN', request: { action: 'SCAN_SHARED_FILE', sourceUrl: url } }, PAGE_SENDER);
    expect(denied.ok).toBe(false);
    const ok = await service.handle({ type: 'START_SCAN', request: { action: 'SCAN_SHARED_FILE', sourceUrl: url, consent: true } }, PAGE_SENDER);
    expect(ok.ok).toBe(true);
    expect(api.scanUrl).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://www.dropbox.com/scl/fi/abc/app.js?rlkey=k1', consent: true }),
      undefined,
    );
  });

  it('refuses a folder scan for a single-file share link', async () => {
    const url = 'https://www.dropbox.com/scl/fi/abc/app.js?rlkey=k1';
    const { service, api } = await makeService({ inspection: inspectionFor(url) });
    const res = await service.handle({ type: 'START_SCAN', request: { action: 'SCAN_SHARED_FOLDER', sourceUrl: url } }, PAGE_SENDER);
    expect(res.ok).toBe(false);
    expect(api.scanUrl).not.toHaveBeenCalled();
  });

  it('sends multi-branch requests as branches: "ALL" and PR scans to the PR endpoint', async () => {
    const { service, api } = await makeService({ inspection: inspectionFor(REPO) });
    await service.handle({ type: 'START_SCAN', request: { action: 'SCAN_ALL_BRANCHES', sourceUrl: REPO } }, PAGE_SENDER);
    expect(api.scanRepository).toHaveBeenCalledWith(expect.objectContaining({ branches: 'ALL' }), undefined);
    await service.handle({ type: 'START_SCAN', request: { action: 'SCAN_PULL_REQUEST', sourceUrl: `${REPO}/pull/9` } }, PAGE_SENDER);
    expect(api.scanPullRequest).toHaveBeenCalledWith(expect.objectContaining({ url: `${REPO}/pull/9` }), undefined);
  });
});
