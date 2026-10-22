import { describe, expect, it, vi } from 'vitest';
import { ApiClient, CodeGuardApi } from '../src/background/api-client';
import { validateMessage } from '../src/shared/messages';
import { validateUploadFiles } from '../src/shared/upload';
import { PAGE_SENDER, RUNTIME_ID } from './service-helpers';

const file = (path: string, content = 'code') => ({ name: path.split('/').pop()!, path, blob: new Blob([content]) });

describe('source uploads', () => {
  it('preserves nested paths and rejects unsafe, duplicate and oversized selections', () => {
    expect(() => validateUploadFiles([file('src/index.ts'), file('test/index.ts')], 100)).not.toThrow();
    for (const path of ['../key', '/etc/key', 'a/../../key', 'a\\key', 'a//key']) {
      expect(() => validateUploadFiles([file(path)], 100)).toThrow('invalid relative path');
    }
    expect(() => validateUploadFiles([file('a'), file('a')], 100)).toThrow('Duplicate');
    expect(() => validateUploadFiles([file('a')], 1)).toThrow('upload limit');
    expect(() => validateUploadFiles([], 100)).toThrow('Select');
    expect(() => validateUploadFiles(Array.from({ length: 5001 }, (_, i) => file(String(i))), 100000)).toThrow('5,000');
  });

  it('requires explicit consent and blocks content scripts from uploading', () => {
    const message = { type: 'UPLOAD_SCAN', uploadId: 'upload_1', organizationId: 'org_1', consent: true };
    expect(validateMessage(message, PAGE_SENDER, RUNTIME_ID).ok).toBe(true);
    expect(validateMessage({ ...message, consent: false }, PAGE_SENDER, RUNTIME_ID).ok).toBe(false);
    expect(validateMessage(message, { id: RUNTIME_ID, url: 'https://github.com/a/b', tab: { id: 1 } }, RUNTIME_ID).ok).toBe(false);
    expect(validateMessage({ ...message, uploadId: '../bad' }, PAGE_SENDER, RUNTIME_ID).ok).toBe(false);
  });

  it('sends multipart files with background authentication and browser-generated boundary', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ scans: [], scanGroupId: null }), { status: 201 }));
    const api = new CodeGuardApi(new ApiClient({ getBaseUrl: async () => 'http://localhost:4000', getToken: async () => 'secret', onUnauthorized: async () => undefined, fetchImpl }));
    const form = new FormData();
    form.append('organizationId', 'org_1');
    form.append('relativePaths', JSON.stringify(['src/a.ts']));
    form.append('files', new Blob(['source']), 'a.ts');
    await api.uploadScan(form, 'upload_1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/scans/upload');
    expect(init.body).toBe(form);
    expect(init.headers).toMatchObject({ Authorization: 'Bearer secret', 'Idempotency-Key': 'upload_1' });
    expect(init.headers).not.toHaveProperty('Content-Type');
  });
});
