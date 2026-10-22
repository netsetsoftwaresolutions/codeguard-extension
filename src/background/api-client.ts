import type {
  AuthResponse,
  FindingView,
  MetaView,
  OrganizationView,
  Paginated,
  ScanCreatedResponse,
  ScanView,
  Severity,
  SourceInspection,
  UserView,
} from '../contracts';
import { API_TIMEOUT_MS } from '../shared/constants';
import type { ErrorCode, ErrorInfo, ScanStatusView } from '../shared/messages';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  toInfo(): ErrorInfo {
    return { code: this.code, message: this.message };
  }
}

export interface ApiClientDeps {
  getBaseUrl: () => Promise<string>;
  getToken: () => Promise<string | null>;
  /** Called when an authenticated request returns 401 (token expired / revoked). */
  onUnauthorized: () => Promise<void>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface RequestOptions {
  timeoutMs?: number;
  body?: unknown;
  /** Send the bearer token (default true). */
  auth?: boolean;
  headers?: Record<string, string>;
}

function serverMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as { message?: unknown; errors?: unknown };
  let msg: string | null = null;
  if (typeof b.message === 'string') msg = b.message;
  else if (Array.isArray(b.message)) msg = b.message.filter((x) => typeof x === 'string').join('; ');
  if (Array.isArray(b.errors) && b.errors.length) {
    const details = b.errors
      .slice(0, 3)
      .map((e) => (e && typeof e === 'object' ? `${(e as { path?: unknown }).path ?? ''}: ${(e as { message?: unknown }).message ?? ''}` : ''))
      .filter(Boolean)
      .join('; ');
    if (details) msg = msg ? `${msg} (${details})` : details;
  }
  return msg ? msg.slice(0, 500) : null;
}

/** Maps an HTTP status + body to a user-friendly error. */
export function mapHttpError(status: number, body: unknown, opts: { authRequest?: boolean } = {}): ApiError {
  const msg = serverMessage(body);
  switch (status) {
    case 400:
    case 422:
      return new ApiError(status, 'VALIDATION', msg ?? 'The request was rejected as invalid.');
    case 401:
      return new ApiError(
        status,
        'UNAUTHENTICATED',
        opts.authRequest ? msg ?? 'Incorrect email or password.' : 'Your session has expired. Please sign in again.',
      );
    case 403:
      return new ApiError(status, 'FORBIDDEN', msg ?? 'You do not have permission to do this in the selected organization.');
    case 404:
      return new ApiError(status, 'NOT_FOUND', msg ?? 'Not found, or not visible to your account.');
    case 409:
      return new ApiError(status, 'CONFLICT', msg ?? 'The request conflicts with the current state.');
    case 413:
      return new ApiError(status, 'TOO_LARGE', msg ?? 'The source is larger than your plan allows for a single scan.');
    case 429:
      return new ApiError(status, 'RATE_LIMITED', msg ?? 'Rate limit or plan scan quota reached. Please try again later.');
    default:
      if (status >= 500) return new ApiError(status, 'SERVER_ERROR', `The API reported a server error (${status}). Please try again later.`);
      return new ApiError(status, 'UNKNOWN', msg ?? `Unexpected response from the API (${status}).`);
  }
}

/** Low-level JSON client. Paths are always constants built inside this module — never caller-supplied. */
export class ApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly deps: ApiClientDeps) {
    this.fetchImpl = deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
    this.timeoutMs = deps.timeoutMs ?? API_TIMEOUT_MS;
  }

  async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<T> {
    const base = (await this.deps.getBaseUrl()).replace(/\/+$/, '');
    const url = `${base}/api${path}`;
    const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
    const auth = opts.auth !== false;
    if (auth) {
      const token = await this.deps.getToken();
      if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'You are signed out. Please sign in.');
      headers.Authorization = `Bearer ${token}`;
    }
    let body: string | FormData | undefined;
    if (opts.body instanceof FormData) {
      body = opts.body;
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { method, headers, body, signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new ApiError(0, 'TIMEOUT', `The API at ${base} did not respond within ${Math.round(timeoutMs / 1000)}s.`);
      }
      throw new ApiError(
        0,
        'API_UNREACHABLE',
        `Cannot reach the API at ${base}. Check that it is running, the URL in Settings is correct, and the API allows this extension's origin.`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text().catch(() => '');
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!res.ok) {
      if (res.status === 401 && auth) await this.deps.onUnauthorized();
      throw mapHttpError(res.status, parsed, { authRequest: !auth });
    }
    if (text && parsed === null) throw new ApiError(res.status, 'SERVER_ERROR', 'The API returned an invalid (non-JSON) response.');
    return parsed as T;
  }
}

export interface ScanTarget {
  organizationId: string;
}
export interface ScanOptionsBody {
  enableAi: boolean;
}
export interface RepositoryScanBody {
  target: ScanTarget;
  url: string;
  ref?: string;
  branches?: 'ALL' | string[];
  path?: string;
  options: ScanOptionsBody;
  consent?: boolean;
}
export interface UrlScanBody {
  target: ScanTarget;
  url: string;
  options: ScanOptionsBody;
  consent?: boolean;
}

const enc = encodeURIComponent;

/** Typed CodeGuard endpoints used by the extension. */
export class CodeGuardApi {
  constructor(private readonly client: ApiClient) {}

  meta() {
    return this.client.request<MetaView>('GET', '/meta', { auth: false });
  }
  login(email: string, password: string) {
    return this.client.request<AuthResponse>('POST', '/auth/login', { auth: false, body: { email, password, client: 'extension' } });
  }
  logout() {
    return this.client.request<void>('POST', '/auth/logout');
  }
  me() {
    return this.client.request<{ user: UserView; organizations: OrganizationView[] }>('GET', '/auth/me');
  }
  inspect(url: string, organizationId: string | null) {
    return this.client.request<SourceInspection>('POST', '/sources/inspect', {
      body: organizationId ? { url, organizationId } : { url },
    });
  }
  scanRepository(body: RepositoryScanBody, idempotencyKey?: string) {
    return this.client.request<ScanCreatedResponse>('POST', '/scans/repository', { body, headers: idem(idempotencyKey) });
  }
  scanBranch(body: RepositoryScanBody, idempotencyKey?: string) {
    return this.client.request<ScanCreatedResponse>('POST', '/scans/branch', { body, headers: idem(idempotencyKey) });
  }
  scanPullRequest(body: UrlScanBody, idempotencyKey?: string) {
    return this.client.request<ScanCreatedResponse>('POST', '/scans/pull-request', { body, headers: idem(idempotencyKey) });
  }
  scanUrl(body: UrlScanBody, idempotencyKey?: string) {
    return this.client.request<ScanCreatedResponse>('POST', '/scans/url', { body, headers: idem(idempotencyKey) });
  }
  uploadScan(body: FormData, idempotencyKey?: string) {
    return this.client.request<ScanCreatedResponse>('POST', '/scans/upload', { body, headers: idem(idempotencyKey), timeoutMs: 120_000 });
  }
  listScans(organizationId: string, pageSize = 5) {
    return this.client.request<Paginated<ScanView>>('GET', `/scans?organizationId=${enc(organizationId)}&page=1&pageSize=${pageSize}`);
  }
  scansBySource(url: string) {
    return this.client.request<ScanView[]>('GET', `/scans/by-source?url=${enc(url)}`);
  }
  getScan(id: string) {
    return this.client.request<ScanView>('GET', `/scans/${enc(id)}`);
  }
  getScanStatus(id: string) {
    return this.client.request<ScanStatusView>('GET', `/scans/${enc(id)}/status`);
  }
  getFindings(id: string, opts: { severity?: Severity | null; pageSize?: number } = {}) {
    const q = new URLSearchParams({ page: '1', pageSize: String(opts.pageSize ?? 100) });
    if (opts.severity) q.set('severity', opts.severity);
    return this.client.request<Paginated<FindingView>>('GET', `/scans/${enc(id)}/findings?${q.toString()}`);
  }
}

function idem(key?: string): Record<string, string> {
  return key ? { 'Idempotency-Key': key } : {};
}

export function toErrorInfo(err: unknown): ErrorInfo {
  if (err instanceof ApiError) return err.toInfo();
  if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
    const e = err as { code: unknown; message: unknown };
    if (typeof e.code === 'string' && typeof e.message === 'string') return { code: e.code as ErrorCode, message: e.message };
  }
  return { code: 'UNKNOWN', message: err instanceof Error ? err.message : 'Unexpected error.' };
}
