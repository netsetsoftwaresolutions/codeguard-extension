import { describe, expect, it } from 'vitest';
import { isDefaultApiOrigin, normalizeBaseUrl, originPatternFor } from '../src/shared/settings';
import { AUTH, makeService, PAGE_SENDER } from './service-helpers';
import { inspectionFor } from './fixtures';

describe('settings URL handling', () => {
  it('requires https except for localhost and strips trailing slashes', () => {
    expect(normalizeBaseUrl('http://localhost:4000/')).toBe('http://localhost:4000');
    expect(normalizeBaseUrl('https://api.example.com/')).toBe('https://api.example.com');
    expect(normalizeBaseUrl('http://api.example.com')).toBeNull();
    expect(normalizeBaseUrl('https://user:pw@api.example.com')).toBeNull();
    expect(normalizeBaseUrl('javascript:alert(1)')).toBeNull();
  });
  it('maps to optional host permission patterns', () => {
    expect(originPatternFor('http://localhost:4001')).toBe('http://localhost/*');
    expect(originPatternFor('https://api.example.com:8443')).toBe('https://api.example.com/*');
    expect(isDefaultApiOrigin('http://localhost:4000')).toBe(true);
    expect(isDefaultApiOrigin('http://localhost:4001')).toBe(false);
  });
});

describe('UPDATE_SETTINGS', () => {
  it('requests permission synchronously and persists both URLs after approval without another UI message', async () => {
    const { service, store, requestHostPermission } = await makeService({ inspection: inspectionFor('https://github.com/a/b') });
    let approve!: (granted: boolean) => void;
    requestHostPermission.mockReturnValueOnce(new Promise((resolve) => { approve = resolve; }));
    const patch = { apiBaseUrl: 'https://api.example.com', dashboardUrl: 'https://app.example.com' };
    const saving = service.handle({ type: 'UPDATE_SETTINGS', patch }, PAGE_SENDER);
    expect(requestHostPermission).toHaveBeenCalledWith('https://api.example.com/*');
    expect((await store.getSettings()).apiBaseUrl).not.toBe(patch.apiBaseUrl);
    approve(true);
    expect((await saving).ok).toBe(true);
    expect(await store.getSettings()).toMatchObject(patch);
    expect(await store.getToken()).toBeNull();
  });

  it('keeps URLs and authentication when permission is denied', async () => {
    const { service, store, requestHostPermission } = await makeService({ inspection: inspectionFor('https://github.com/a/b') });
    const before = await store.getSettings();
    requestHostPermission.mockResolvedValueOnce(false);
    const result = await service.handle({ type: 'UPDATE_SETTINGS', patch: { apiBaseUrl: 'https://api.example.com', dashboardUrl: 'https://app.example.com' } }, PAGE_SENDER);
    expect(result.ok).toBe(false);
    expect(await store.getSettings()).toEqual(before);
    expect(await store.getToken()).toBe(AUTH.accessToken);
  });

  it('signs out when the API URL changes so the token is never sent to another server', async () => {
    const { service, store } = await makeService({ inspection: inspectionFor('https://github.com/a/b') });
    expect(await store.getToken()).toBe(AUTH.accessToken);
    const res = await service.handle({ type: 'UPDATE_SETTINGS', patch: { apiBaseUrl: 'https://api.example.com' } }, PAGE_SENDER);
    expect(res.ok).toBe(true);
    expect(await store.getToken()).toBeNull();
  });

  it('rejects switching to an organization the user is not a member of', async () => {
    const { service } = await makeService({ inspection: inspectionFor('https://github.com/a/b') });
    const res = await service.handle({ type: 'UPDATE_SETTINGS', patch: { organizationId: 'org_other' } }, PAGE_SENDER);
    expect(res).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN' }) });
  });

  it('never exposes the access token in GET_STATE', async () => {
    const { service, api } = await makeService({ inspection: inspectionFor('https://github.com/a/b') });
    api.meta.mockResolvedValue({ productName: 'SecureScan', version: '1', features: {}, limits: { maxUploadBytes: 1 } });
    const res = await service.handle({ type: 'GET_STATE' }, PAGE_SENDER);
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res)).not.toContain(AUTH.accessToken);
    if (res.ok) expect((res.data as { productName: string }).productName).toBe('SecureScan');
  });
});

describe('content-script messages', () => {
  it('PAGE_DETECTED returns only the button decision and product name', async () => {
    const { service } = await makeService({ inspection: inspectionFor('https://github.com/a/b') });
    const sender = { id: 'ext-id', url: 'https://github.com/acme/app', tab: { id: 4 } };
    const res = await service.handle({ type: 'PAGE_DETECTED', url: 'https://github.com/acme/app', branchHint: null }, sender);
    expect(res).toEqual({ ok: true, data: { showButton: true, productName: 'CodeGuard' } });
    expect(JSON.stringify(res)).not.toContain(AUTH.accessToken);
  });

  it('PAGE_DETECTED on Drive does not show the in-page button', async () => {
    const { service } = await makeService({ inspection: inspectionFor('https://github.com/a/b') });
    const sender = { id: 'ext-id', url: 'https://drive.google.com/file/d/x/view', tab: { id: 4 } };
    const res = await service.handle({ type: 'PAGE_DETECTED', url: 'https://drive.google.com/file/d/x/view' }, sender);
    expect(res.ok && (res.data as { showButton: boolean }).showButton).toBe(false);
  });

  it('content scripts cannot start scans', async () => {
    const { service, api } = await makeService({ inspection: inspectionFor('https://github.com/a/b') });
    const sender = { id: 'ext-id', url: 'https://github.com/a/b', tab: { id: 4 } };
    const res = await service.handle({ type: 'START_SCAN', request: { action: 'SCAN_REPOSITORY', sourceUrl: 'https://github.com/a/b' } }, sender);
    expect(res.ok).toBe(false);
    expect(api.scanRepository).not.toHaveBeenCalled();
  });
});
