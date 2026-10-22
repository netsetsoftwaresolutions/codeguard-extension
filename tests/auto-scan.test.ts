import { parseSourceUrl } from '../src/contracts';
import { describe, expect, it } from 'vitest';
import { autoScanAllowed, autoScanCandidate } from '../src/shared/auto-scan';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
import { inspectionFor, scanView } from './fixtures';
import { makeService } from './service-helpers';

const REPO = 'https://github.com/acme/app';
const NOW = Date.parse('2026-10-22T12:00:00Z');
const HOUR = 3600_000;
const autoSettings = { ...DEFAULT_SETTINGS, scanMode: 'automatic' as const, organizationId: 'org_1', autoScanAllowlist: [REPO] };

describe('autoScanCandidate', () => {
  const parsed = parseSourceUrl(`${REPO}/tree/main/src`);
  it('requires automatic mode, sign-in, and an allowlisted repository', () => {
    expect(autoScanCandidate({ ...autoSettings, scanMode: 'manual' }, true, parsed, {}, NOW)).toMatchObject({ scan: false, reason: 'manual-mode' });
    expect(autoScanCandidate(autoSettings, false, parsed, {}, NOW)).toMatchObject({ scan: false, reason: 'signed-out' });
    expect(autoScanCandidate({ ...autoSettings, autoScanAllowlist: [] }, true, parsed, {}, NOW)).toMatchObject({ scan: false, reason: 'not-allowlisted' });
    expect(autoScanCandidate(autoSettings, true, parsed, {}, NOW)).toEqual({ scan: true, key: REPO });
  });
  it('never auto-scans Dropbox / Drive links', () => {
    const p = parseSourceUrl('https://drive.google.com/file/d/1AbC/view');
    expect(autoScanCandidate({ ...autoSettings, autoScanAllowlist: [p.canonicalUrl] }, true, p, {}, NOW).scan).toBe(false);
  });
  it('dedupes using the local log for 24 hours', () => {
    expect(autoScanCandidate(autoSettings, true, parsed, { [REPO]: NOW - 23 * HOUR }, NOW).scan).toBe(false);
    expect(autoScanCandidate(autoSettings, true, parsed, { [REPO]: NOW - 25 * HOUR }, NOW).scan).toBe(true);
  });
});

describe('autoScanAllowed', () => {
  it('never allows private or unknown visibility', () => {
    expect(autoScanAllowed(inspectionFor(REPO, { visibility: 'private' }), [], NOW)).toMatchObject({ scan: false, reason: 'not-public' });
    expect(autoScanAllowed(inspectionFor(REPO, { visibility: 'unknown' }), [], NOW)).toMatchObject({ scan: false, reason: 'not-public' });
  });
  it('skips when the source was scanned in the last 24h', () => {
    const recent = scanView({ createdAt: new Date(NOW - 2 * HOUR).toISOString() });
    expect(autoScanAllowed(inspectionFor(REPO), [recent], NOW)).toMatchObject({ scan: false, reason: 'recently-scanned' });
    const old = scanView({ createdAt: new Date(NOW - 30 * HOUR).toISOString() });
    expect(autoScanAllowed(inspectionFor(REPO), [old], NOW).scan).toBe(true);
  });
});

describe('BackgroundService.maybeAutoScan', () => {
  it('scans an allowlisted public repo once, then not again within 24h', async () => {
    const { service, api } = await makeService({ inspection: inspectionFor(REPO), settings: autoSettings, now: NOW });
    const parsed = parseSourceUrl(REPO);
    expect(await service.maybeAutoScan(5, parsed)).toMatchObject({ scan: true });
    expect(api.scansBySource).toHaveBeenCalledWith(REPO);
    expect(api.scanRepository).toHaveBeenCalledTimes(1);
    expect(api.scanRepository).toHaveBeenCalledWith({ target: { organizationId: 'org_1' }, url: REPO, options: { enableAi: false } });

    expect(await service.maybeAutoScan(5, parsed)).toMatchObject({ scan: false, reason: 'recently-scanned' });
    expect(api.scanRepository).toHaveBeenCalledTimes(1);
  });

  it('does not rescan when the API reports a scan within 24h', async () => {
    const { service, api } = await makeService({ inspection: inspectionFor(REPO), settings: autoSettings, now: NOW });
    api.scansBySource.mockResolvedValueOnce([scanView({ createdAt: new Date(NOW - HOUR).toISOString() })]);
    expect(await service.maybeAutoScan(5, parseSourceUrl(REPO))).toMatchObject({ scan: false, reason: 'recently-scanned' });
    expect(api.scanRepository).not.toHaveBeenCalled();
  });

  it('never auto-scans a private repository, even if allowlisted', async () => {
    const { service, api } = await makeService({ inspection: inspectionFor(REPO, { visibility: 'private' }), settings: autoSettings, now: NOW });
    expect(await service.maybeAutoScan(5, parseSourceUrl(REPO))).toMatchObject({ scan: false, reason: 'not-public' });
    expect(api.scanRepository).not.toHaveBeenCalled();
  });

  it('does nothing in manual mode (no network calls)', async () => {
    const { service, api } = await makeService({ inspection: inspectionFor(REPO), settings: { autoScanAllowlist: [REPO] }, now: NOW });
    expect(await service.maybeAutoScan(5, parseSourceUrl(REPO))).toMatchObject({ scan: false, reason: 'manual-mode' });
    expect(api.inspect).not.toHaveBeenCalled();
  });
});
