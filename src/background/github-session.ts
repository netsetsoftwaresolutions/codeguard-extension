/**
 * Fetches GitHub source with the user's own signed-in browser session.
 * Runs only in the background service worker. Because the extension has host permission for
 * github.com, Chrome attaches the user's GitHub cookies to these requests itself; the extension
 * never reads, stores or forwards cookies or tokens. Only the selected repository is requested.
 */
import type { BrowserScanStep, ErrorCode } from '../shared/messages';

export interface GitHubTarget {
  owner: string;
  repo: string;
  /** Branch / tag / sha. null = the repository's default branch. */
  ref: string | null;
  /** File path inside the repository. Set = single file; null = whole snapshot. */
  path: string | null;
}

export interface FetchedSource {
  name: string;
  relativePath: string;
  blob: Blob;
}

export class GitHubSessionError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// github.com redirects raw files to raw.githubusercontent.com and archives to codeload.github.com.
const ALLOWED_HOSTS = new Set(['github.com', 'raw.githubusercontent.com', 'codeload.github.com']);
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const TIMEOUT_MS = 4 * 60_000; // below Chrome's 5-minute limit for one service-worker request

const NO_ACCESS =
  'GitHub did not return this repository. Make sure you are signed in to GitHub in this browser and can open it, then try again.';

/** Encodes a ref or path segment by segment and rejects traversal or empty segments. */
function encodePath(value: string): string {
  const parts = value.split('/');
  if (parts.some((p) => !p || p === '.' || p === '..' || /[\u0000-\u001f\\]/.test(p))) {
    throw new GitHubSessionError('VALIDATION', 'Invalid branch or file path.');
  }
  return parts.map(encodeURIComponent).join('/');
}

async function request(url: string, fetchFn: typeof fetch, signal: AbortSignal, method = 'GET'): Promise<Response> {
  let res: Response;
  try {
    res = await fetchFn(url, { method, credentials: 'include', redirect: 'follow', cache: 'no-store', signal });
  } catch (err) {
    if (signal.aborted) throw new GitHubSessionError('TIMEOUT', 'GitHub took too long to respond. Try a smaller branch or use Upload.');
    throw new GitHubSessionError('API_UNREACHABLE', `Could not reach GitHub: ${err instanceof Error ? err.message : String(err)}`);
  }
  let final: URL;
  try {
    final = new URL(res.url || url);
  } catch {
    throw new GitHubSessionError('UNSUPPORTED_SOURCE', 'GitHub returned an unexpected redirect.');
  }
  if (final.protocol !== 'https:' || !ALLOWED_HOSTS.has(final.hostname)) {
    throw new GitHubSessionError('UNSUPPORTED_SOURCE', 'GitHub redirected to an unexpected site. Nothing was uploaded.');
  }
  if (final.hostname === 'github.com' && (final.pathname === '/login' || final.pathname.startsWith('/sessions/'))) {
    throw new GitHubSessionError('UNAUTHENTICATED', 'Your GitHub session has expired. Sign in to GitHub in this browser and try again.');
  }
  if (res.status === 404) throw new GitHubSessionError('NOT_FOUND', NO_ACCESS);
  if (res.status === 401 || res.status === 403) throw new GitHubSessionError('FORBIDDEN', NO_ACCESS);
  if (res.status === 429) throw new GitHubSessionError('RATE_LIMITED', 'GitHub is rate limiting requests. Try again in a few minutes.');
  if (!res.ok) throw new GitHubSessionError('SERVER_ERROR', `GitHub returned HTTP ${res.status}.`);
  return res;
}

/** Reads the body, stopping as soon as it exceeds maxBytes (bounded memory). */
async function readLimited(res: Response, maxBytes: number): Promise<Blob> {
  const tooLarge = () =>
    new GitHubSessionError('TOO_LARGE', `The source is larger than the ${Math.round(maxBytes / 1048576)} MB upload limit. Use a smaller branch, scan a single file, or connect the GitHub integration.`);
  if (Number(res.headers.get('content-length')) > maxBytes) throw tooLarge();
  if (!res.body) return new Blob([]);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    parts.push(value);
  }
  return new Blob(parts as BlobPart[]);
}

/**
 * Downloads one file (raw contents) or a full snapshot (GitHub's own ZIP of the ref) into memory.
 * Throws GitHubSessionError with a user-facing message when the source cannot be fully retrieved.
 */
export async function fetchGitHubSource(
  target: GitHubTarget,
  opts: { maxBytes: number; fetchFn?: typeof fetch; onStep?: (s: BrowserScanStep) => void; timeoutMs?: number },
): Promise<FetchedSource> {
  if (!NAME.test(target.owner) || !NAME.test(target.repo) || target.repo === '.' || target.repo === '..') {
    throw new GitHubSessionError('VALIDATION', 'Invalid GitHub repository.');
  }
  const fetchFn = opts.fetchFn ?? fetch;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS);
  const base = `https://github.com/${target.owner}/${target.repo}`;

  opts.onStep?.('CHECKING_ACCESS');
  await request(base, fetchFn, signal, 'HEAD');

  opts.onStep?.('RETRIEVING');
  if (target.path) {
    if (!target.ref) throw new GitHubSessionError('VALIDATION', 'The current branch could not be determined.');
    const res = await request(`${base}/raw/${encodePath(target.ref)}/${encodePath(target.path)}`, fetchFn, signal);
    // A web page here means GitHub served a sign-in or error page instead of the raw file.
    if (/text\/html/i.test(res.headers.get('content-type') ?? '')) throw new GitHubSessionError('UNAUTHENTICATED', NO_ACCESS);
    const blob = await readLimited(res, opts.maxBytes);
    opts.onStep?.('PREPARING');
    return { name: target.path.split('/').pop()!, relativePath: target.path, blob };
  }

  const res = await request(`${base}/archive/${target.ref ? encodePath(target.ref) : 'HEAD'}.zip`, fetchFn, signal);
  const blob = await readLimited(res, opts.maxBytes);
  opts.onStep?.('PREPARING');
  const magic = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (magic[0] !== 0x50 || magic[1] !== 0x4b) {
    throw new GitHubSessionError('UNSUPPORTED_SOURCE', 'GitHub did not return a complete ZIP snapshot, so a full scan is not possible. Use Upload instead.');
  }
  const name = `${target.repo}-${(target.ref ?? 'default').replace(/[^A-Za-z0-9._-]/g, '-')}.zip`.slice(0, 200);
  return { name, relativePath: name, blob };
}
