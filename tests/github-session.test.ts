// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { parseSourceUrl } from '../src/contracts';
import { fetchGitHubSource } from '../src/background/github-session';
import { getScanActions } from '../src/shared/capabilities';
import { validateMessage } from '../src/shared/messages';
import { inspectionFor } from './fixtures';
import { makeService, PAGE_SENDER, RUNTIME_ID } from './service-helpers';

const REPO = 'https://github.com/acme/private-app';
const FILE_URL = `${REPO}/blob/main/src/a.ts`;
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
const NONE = { scanFile: false, scanBranch: false, scanRepository: false, scanAllBranches: false, scanPullRequest: false, scanFolder: false };
const privateInspection = (url: string) => inspectionFor(url, { accessible: false, visibility: 'unknown', defaultBranch: null, branches: null, capabilities: NONE });

function reply(url: string, body: BodyInit | null, init: ResponseInit = {}) {
  const res = new Response(body, init);
  Object.defineProperty(res, 'url', { value: url });
  return res;
}

/** Fake fetch: the repository page is reachable; other routes are given; everything else is a 404. */
function github(routes: Record<string, () => Response> = {}) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url === REPO) return reply(REPO, null);
    return routes[url]?.() ?? reply(url, null, { status: 404 });
  });
}

const rawRoute = (content: string, type = 'text/plain') => ({
  [`${REPO}/raw/main/src/a.ts`]: () => reply('https://raw.githubusercontent.com/acme/private-app/main/src/a.ts?token=x', content, { headers: { 'content-type': type } }),
});

describe('fetchGitHubSource', () => {
  it('reads a private file with the browser session (cookies included) and keeps its repo path', async () => {
    const fetchFn = github(rawRoute('const key = 1;'));
    const steps: string[] = [];
    const src = await fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: 'main', path: 'src/a.ts' }, { maxBytes: 1000, fetchFn, onStep: (s) => steps.push(s) });
    expect(src.relativePath).toBe('src/a.ts');
    expect(src.name).toBe('a.ts');
    expect(await src.blob.text()).toBe('const key = 1;');
    expect(fetchFn.mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
    expect(steps).toEqual(['CHECKING_ACCESS', 'RETRIEVING', 'PREPARING']);
  });

  it('encodes branch names with slashes and rejects path traversal', async () => {
    const fetchFn = github({ [`${REPO}/archive/feature/login%20x.zip`]: () => reply('https://codeload.github.com/acme/private-app/zip/x', ZIP) });
    await expect(fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: 'feature/login x', path: null }, { maxBytes: 1000, fetchFn })).resolves.toMatchObject({ name: 'private-app-feature-login-x.zip' });
    await expect(fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: 'main', path: '../secret' }, { maxBytes: 1000, fetchFn })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(fetchGitHubSource({ owner: 'acme/..', repo: 'x', ref: null, path: null }, { maxBytes: 1000, fetchFn })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('downloads the default-branch snapshot for an entire-repository scan', async () => {
    const fetchFn = github({ [`${REPO}/archive/HEAD.zip`]: () => reply('https://codeload.github.com/acme/private-app/zip/HEAD', ZIP) });
    const src = await fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: null, path: null }, { maxBytes: 1000, fetchFn });
    expect(src.name).toBe('private-app-default.zip');
  });

  it('reports no access (or an expired session) when GitHub hides the repository', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL) => reply(String(url), null, { status: 404 }));
    await expect(fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: null, path: null }, { maxBytes: 1000, fetchFn })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('detects a redirect to the GitHub sign-in page as an expired session', async () => {
    const fetchFn = vi.fn(async () => reply('https://github.com/login?return_to=x', '<html>', { headers: { 'content-type': 'text/html' } }));
    await expect(fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: null, path: null }, { maxBytes: 1000, fetchFn })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('refuses an HTML page instead of a raw file', async () => {
    const fetchFn = github(rawRoute('<html>sign in</html>', 'text/html; charset=utf-8'));
    await expect(fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: 'main', path: 'src/a.ts' }, { maxBytes: 1000, fetchFn })).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('refuses redirects to sites other than GitHub', async () => {
    const fetchFn = github({ [`${REPO}/raw/main/src/a.ts`]: () => reply('https://evil.example/a.ts', 'x') });
    await expect(fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: 'main', path: 'src/a.ts' }, { maxBytes: 1000, fetchFn })).rejects.toMatchObject({ code: 'UNSUPPORTED_SOURCE' });
  });

  it('stops at the upload size limit (declared or streamed)', async () => {
    const big = github(rawRoute('x'.repeat(50)));
    await expect(fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: 'main', path: 'src/a.ts' }, { maxBytes: 10, fetchFn: big })).rejects.toMatchObject({ code: 'TOO_LARGE' });
    const declared = github({ [`${REPO}/archive/HEAD.zip`]: () => reply('https://codeload.github.com/z', ZIP, { headers: { 'content-length': '999999' } }) });
    await expect(fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: null, path: null }, { maxBytes: 1000, fetchFn: declared })).rejects.toMatchObject({ code: 'TOO_LARGE' });
  });

  it('never reports an incomplete snapshot as success', async () => {
    const fetchFn = github({ [`${REPO}/archive/HEAD.zip`]: () => reply('https://codeload.github.com/z', 'not a zip') });
    await expect(fetchGitHubSource({ owner: 'acme', repo: 'private-app', ref: null, path: null }, { maxBytes: 1000, fetchFn })).rejects.toMatchObject({ code: 'UNSUPPORTED_SOURCE' });
  });
});

describe('browser-session scan actions', () => {
  it('enables file, branch and default-branch scans for a private GitHub repo the API cannot read', () => {
    const actions = getScanActions(parseSourceUrl(FILE_URL), privateInspection(FILE_URL), { branchHint: 'main' });
    const byId = Object.fromEntries(actions.map((a) => [a.id, a]));
    expect(byId.SCAN_FILE).toMatchObject({ enabled: true, browserSession: true, ref: 'main', path: 'src/a.ts' });
    expect(byId.SCAN_BRANCH).toMatchObject({ enabled: true, browserSession: true, label: 'Scan current branch (main)' });
    expect(byId.SCAN_REPOSITORY).toMatchObject({ enabled: true, browserSession: true, label: 'Scan entire repository (default branch)' });
    expect(byId.SCAN_ALL_BRANCHES).toMatchObject({ enabled: false });
  });

  it('disables the branch scan when the branch is unknown', () => {
    const actions = getScanActions(parseSourceUrl(REPO), privateInspection(REPO));
    expect(actions.find((a) => a.id === 'SCAN_BRANCH')).toMatchObject({ enabled: false });
  });

  it('leaves public GitHub and inaccessible GitLab repositories unchanged', () => {
    expect(getScanActions(parseSourceUrl(REPO), inspectionFor(REPO)).some((a) => a.browserSession)).toBe(false);
    const gl = 'https://gitlab.com/acme/app';
    const actions = getScanActions(parseSourceUrl(gl), privateInspection(gl));
    expect(actions.every((a) => !a.enabled && !a.browserSession)).toBe(true);
  });

  it('validates the browserSession flag and never accepts it from a content script', () => {
    const req = { action: 'SCAN_FILE', sourceUrl: FILE_URL, ref: 'main', path: 'src/a.ts', tabId: 7 };
    expect(validateMessage({ type: 'START_SCAN', request: { ...req, browserSession: 'yes' } }, PAGE_SENDER, RUNTIME_ID).ok).toBe(false);
    expect(validateMessage({ type: 'START_SCAN', request: { ...req, browserSession: true } }, PAGE_SENDER, RUNTIME_ID).ok).toBe(true);
    const contentSender = { id: RUNTIME_ID, url: FILE_URL, tab: { id: 7, url: FILE_URL } };
    expect(validateMessage({ type: 'START_SCAN', request: { ...req, browserSession: true } }, contentSender, RUNTIME_ID)).toMatchObject({ ok: false, error: { code: 'FORBIDDEN_SENDER' } });
  });
});

describe('browser-session scans in the background', () => {
  async function setup(fetchFn = github(rawRoute('const key = 1;')), tabUrl = FILE_URL) {
    const ctx = await makeService({ inspection: privateInspection(FILE_URL), fetchFn });
    await ctx.store.setTabSource(7, { url: tabUrl, parsed: parseSourceUrl(tabUrl), branchHint: 'main', updatedAt: ctx.now });
    return { ...ctx, fetchFn };
  }
  const start = (service: Awaited<ReturnType<typeof setup>>['service'], extra: Record<string, unknown> = {}) =>
    service.handle({ type: 'START_SCAN', request: { action: 'SCAN_FILE', sourceUrl: FILE_URL, ref: 'main', path: 'src/a.ts', tabId: 7, browserSession: true, ...extra } }, PAGE_SENDER);

  it('requires explicit consent every time and reads nothing before it', async () => {
    const { service, fetchFn, api, store } = await setup();
    await store.addConsent(REPO);
    expect(await start(service)).toMatchObject({ ok: false, error: { code: 'CONSENT_REQUIRED' } });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(api.uploadScan).not.toHaveBeenCalled();
  });

  it('uploads the file with validated repository metadata and reports progress', async () => {
    const { service, api, broadcast, trackScan } = await setup();
    expect(await start(service, { consent: true })).toMatchObject({ ok: true });
    const body = api.uploadScan.mock.calls[0]![0];
    expect(body.get('acquisition')).toBe('browser-session');
    expect(body.get('sourceUrl')).toBe(REPO);
    expect(body.get('ref')).toBe('main');
    expect(body.get('path')).toBe('src/a.ts');
    expect(body.get('relativePaths')).toBe(JSON.stringify(['src/a.ts']));
    expect(await (body.get('files') as Blob).text()).toBe('const key = 1;');
    expect(broadcast.mock.calls.map(([m]) => m.step).filter(Boolean)).toEqual(['CHECKING_ACCESS', 'RETRIEVING', 'PREPARING', 'UPLOADING']);
    expect(trackScan).toHaveBeenCalledWith(7, ['scan_new']);
  });

  it('refuses when the tab does not show the requested repository (spoofed source)', async () => {
    const { service, fetchFn } = await setup(undefined, 'https://github.com/other/repo');
    expect(await start(service, { consent: true })).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('surfaces an expired GitHub session and uploads nothing', async () => {
    const { service, api } = await setup(vi.fn(async () => reply('https://github.com/login', '<html>')));
    expect(await start(service, { consent: true })).toMatchObject({ ok: false, error: { code: 'UNAUTHENTICATED' } });
    expect(api.uploadScan).not.toHaveBeenCalled();
  });

  it('does not offer all-branch scans through the browser session', async () => {
    const { service, fetchFn } = await setup();
    expect(await start(service, { action: 'SCAN_ALL_BRANCHES', consent: true })).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_SOURCE' } });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
