import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, CodeGuardApi, mapHttpError } from '../src/background/api-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(fetchImpl: typeof fetch, token: string | null = 'tok_abc') {
  const onUnauthorized = vi.fn(async () => undefined);
  const client = new ApiClient({
    getBaseUrl: async () => 'http://localhost:4000/',
    getToken: async () => token,
    onUnauthorized,
    fetchImpl,
    timeoutMs: 50,
  });
  return { api: new CodeGuardApi(client), client, onUnauthorized };
}

describe('ApiClient', () => {
  it('sends the bearer token and JSON body to the right URL', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { scans: [], scanGroupId: null }));
    const { api } = setup(fetchImpl as unknown as typeof fetch);
    await api.scanRepository({ target: { organizationId: 'org_1' }, url: 'https://github.com/a/b', options: { enableAi: false } }, 'idem-1');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/scans/repository');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok_abc');
    expect(headers['Idempotency-Key']).toBe('idem-1');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body as string)).toEqual({ target: { organizationId: 'org_1' }, url: 'https://github.com/a/b', options: { enableAi: false } });
  });

  it('does not send a token to public endpoints and sends client=extension on login', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { accessToken: 't', expiresIn: 3600, user: {}, organizations: [] }));
    const { api } = setup(fetchImpl as unknown as typeof fetch);
    await api.login('a@b.co', 'pw');
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.co', password: 'pw', client: 'extension' });
  });

  it('clears the token on 401 from an authenticated request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { statusCode: 401, message: 'Unauthorized' }));
    const { api, onUnauthorized } = setup(fetchImpl as unknown as typeof fetch);
    await expect(api.getScan('scan_1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not clear the session on a failed login (401 on public endpoint)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { message: 'Invalid email or password' }));
    const { api, onUnauthorized } = setup(fetchImpl as unknown as typeof fetch);
    await expect(api.login('a@b.co', 'bad')).rejects.toMatchObject({ code: 'UNAUTHENTICATED', message: 'Invalid email or password' });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('refuses authenticated requests without a token, without calling fetch', async () => {
    const fetchImpl = vi.fn();
    const { api } = setup(fetchImpl as unknown as typeof fetch, null);
    await expect(api.listScans('org_1')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps network failures to API_UNREACHABLE with the base URL', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const { api } = setup(fetchImpl as unknown as typeof fetch);
    const err = await api.meta().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'API_UNREACHABLE' });
    expect((err as Error).message).toContain('http://localhost:4000');
  });

  it('times out slow requests', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    );
    const { api } = setup(fetchImpl as unknown as typeof fetch);
    await expect(api.meta()).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('encodes query parameters and ids', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, []));
    const { api } = setup(fetchImpl as unknown as typeof fetch);
    await api.scansBySource('https://github.com/a/b?x=1&y=2');
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(
      'http://localhost:4000/api/scans/by-source?url=https%3A%2F%2Fgithub.com%2Fa%2Fb%3Fx%3D1%26y%3D2',
    );
  });

  it('returns undefined for 204 responses', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const { api } = setup(fetchImpl as unknown as typeof fetch);
    await expect(api.logout()).resolves.toBeUndefined();
  });
});

describe('mapHttpError', () => {
  it('produces user-friendly messages', () => {
    expect(mapHttpError(413, null)).toMatchObject({ code: 'TOO_LARGE' });
    expect(mapHttpError(413, null).message).toMatch(/larger than your plan/);
    expect(mapHttpError(429, null)).toMatchObject({ code: 'RATE_LIMITED' });
    expect(mapHttpError(429, { message: 'Monthly scan quota reached' }).message).toBe('Monthly scan quota reached');
    expect(mapHttpError(403, { message: 'Requires DEVELOPER role' }).message).toBe('Requires DEVELOPER role');
    expect(mapHttpError(500, { message: 'stack trace...' })).toMatchObject({ code: 'SERVER_ERROR' });
    expect(mapHttpError(500, { message: 'stack trace...' }).message).not.toContain('stack');
    const v = mapHttpError(400, { statusCode: 400, message: 'Validation failed', errors: [{ path: 'url', message: 'Invalid url' }] });
    expect(v).toMatchObject({ code: 'VALIDATION' });
    expect(v.message).toContain('url: Invalid url');
  });
});
