import type {
  FindingView,
  MetaView,
  OrganizationView,
  Paginated,
  ParsedSource,
  ScanCreatedResponse,
  ScanStage,
  ScanStatus,
  ScanView,
  Severity,
  SourceInspection,
  UserView,
} from '../contracts';
import { SEVERITIES } from '../contracts';
import type { ScanActionId } from './capabilities';
import type { Settings } from './settings';

/* ------------------------------------------------------------------------------------------ */
/* Message union                                                                              */
/* ------------------------------------------------------------------------------------------ */

/** Messages that unprivileged content scripts may send. They never receive tokens or API data. */
export type ContentMessage =
  | { type: 'PAGE_DETECTED'; url: string; branchHint?: string | null }
  | { type: 'OPEN_SIDE_PANEL' }
  | { type: 'DISMISS_BUTTON' };

export interface StartScanRequest {
  action: ScanActionId;
  /** The page URL the scan was started from (re-parsed by the background). */
  sourceUrl: string;
  ref?: string | null;
  path?: string | null;
  /** True only after the user accepted the consent dialog. */
  consent?: boolean;
  /** Tab to attach the badge to. */
  tabId?: number | null;
}

/** Messages that only extension pages (popup, side panel) may send. */
export type UiMessage =
  | { type: 'GET_STATE'; refresh?: boolean }
  | { type: 'LOGIN'; email: string; password: string }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<Settings> }
  | { type: 'GET_ACTIVE_SOURCE'; tabId?: number | null }
  | { type: 'INSPECT_SOURCE'; url: string }
  | { type: 'UPLOAD_SCAN'; uploadId: string; organizationId: string; consent: true }
  | { type: 'START_SCAN'; request: StartScanRequest }
  | { type: 'GET_SCAN'; scanId: string }
  | { type: 'GET_SCAN_STATUS'; scanId: string }
  | { type: 'GET_FINDINGS'; scanId: string; severity?: Severity | null }
  | { type: 'LIST_RECENT_SCANS' }
  | { type: 'SET_AUTO_SCAN'; sourceUrl: string; enabled: boolean };

export type ExtensionMessage = ContentMessage | UiMessage;

/** Broadcasts from the background to open extension pages. */
export type BroadcastMessage =
  | { type: 'SOURCE_CHANGED'; tabId: number }
  | { type: 'AUTH_CHANGED' };

export const CONTENT_MESSAGE_TYPES = ['PAGE_DETECTED', 'OPEN_SIDE_PANEL', 'DISMISS_BUTTON'] as const;
export const UI_MESSAGE_TYPES = [
  'GET_STATE',
  'LOGIN',
  'LOGOUT',
  'UPDATE_SETTINGS',
  'GET_ACTIVE_SOURCE',
  'INSPECT_SOURCE',
  'START_SCAN',
  'UPLOAD_SCAN',
  'GET_SCAN',
  'GET_SCAN_STATUS',
  'GET_FINDINGS',
  'LIST_RECENT_SCANS',
  'SET_AUTO_SCAN',
] as const;
export const BROADCAST_MESSAGE_TYPES = ['SOURCE_CHANGED', 'AUTH_CHANGED'] as const;

const SCAN_ACTIONS: readonly ScanActionId[] = [
  'SCAN_FILE',
  'SCAN_FOLDER_PATH',
  'SCAN_BRANCH',
  'SCAN_REPOSITORY',
  'SCAN_ALL_BRANCHES',
  'SCAN_PULL_REQUEST',
  'SCAN_SHARED_FOLDER',
  'SCAN_SHARED_FILE',
];

/* ------------------------------------------------------------------------------------------ */
/* Responses                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export type ErrorCode =
  | 'INVALID_MESSAGE'
  | 'FORBIDDEN_SENDER'
  | 'API_UNREACHABLE'
  | 'TIMEOUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TOO_LARGE'
  | 'RATE_LIMITED'
  | 'VALIDATION'
  | 'SERVER_ERROR'
  | 'CONSENT_REQUIRED'
  | 'PERMISSION_REQUIRED'
  | 'NO_ORGANIZATION'
  | 'UNSUPPORTED_SOURCE'
  | 'SIDE_PANEL_UNAVAILABLE'
  | 'UNKNOWN';

export interface ErrorInfo {
  code: ErrorCode;
  message: string;
}

export type MessageResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: ErrorInfo };

export interface AuthState {
  signedIn: boolean;
  user: UserView | null;
  organizations: OrganizationView[];
}

export interface ExtensionState {
  productName: string;
  apiReachable: boolean;
  apiError: string | null;
  meta: MetaView | null;
  settings: Settings;
  auth: AuthState;
}

export interface ActiveSource {
  tabId: number | null;
  url: string | null;
  parsed: ParsedSource | null;
  branchHint: string | null;
}

export interface ScanStatusView {
  id: string;
  status: ScanStatus;
  stage: ScanStage | null;
  progress: number;
  errorMessage: string | null;
}

export interface PageDetectedResponse {
  showButton: boolean;
  productName: string;
}

/** Response payload for each request type. */
export interface ResponseMap {
  GET_STATE: ExtensionState;
  LOGIN: ExtensionState;
  LOGOUT: ExtensionState;
  UPDATE_SETTINGS: Settings;
  GET_ACTIVE_SOURCE: ActiveSource;
  INSPECT_SOURCE: SourceInspection;
  START_SCAN: ScanCreatedResponse;
  UPLOAD_SCAN: ScanCreatedResponse;
  GET_SCAN: ScanView;
  GET_SCAN_STATUS: ScanStatusView;
  GET_FINDINGS: Paginated<FindingView>;
  LIST_RECENT_SCANS: Paginated<ScanView>;
  SET_AUTO_SCAN: Settings;
  PAGE_DETECTED: PageDetectedResponse;
  OPEN_SIDE_PANEL: { opened: boolean };
  DISMISS_BUTTON: { dismissed: boolean };
}

/* ------------------------------------------------------------------------------------------ */
/* Validation                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/** Minimal shape of chrome.runtime.MessageSender we rely on (keeps tests independent of Chrome). */
export interface SenderLike {
  id?: string;
  url?: string;
  origin?: string;
  tab?: { id?: number; url?: string };
}

export type SenderKind = 'extension-page' | 'content-script';

export type ValidationResult =
  | { ok: true; kind: SenderKind; message: ExtensionMessage }
  | { ok: false; error: ErrorInfo };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown, max: number, min = 1): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const isOptStr = (v: unknown, max: number) => v === undefined || v === null || isStr(v, max);
const isId = (v: unknown): v is string => isStr(v, 64) && /^[A-Za-z0-9_-]+$/.test(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isHttpUrl = (v: unknown): v is string => {
  if (!isStr(v, 2048)) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

function only(obj: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(obj).every((k) => keys.includes(k));
}

const SETTINGS_KEYS: (keyof Settings)[] = [
  'apiBaseUrl',
  'dashboardUrl',
  'organizationId',
  'scanMode',
  'autoScanAllowlist',
  'enableAi',
  'theme',
  'dismissedSites',
];

function validSettingsPatch(p: unknown): boolean {
  if (!isObj(p) || !only(p, SETTINGS_KEYS as string[])) return false;
  if ('apiBaseUrl' in p && !isStr(p.apiBaseUrl, 512)) return false;
  if ('dashboardUrl' in p && !isStr(p.dashboardUrl, 512)) return false;
  if ('organizationId' in p && p.organizationId !== null && !isId(p.organizationId)) return false;
  if ('scanMode' in p && p.scanMode !== 'manual' && p.scanMode !== 'automatic') return false;
  if ('theme' in p && p.theme !== 'dark' && p.theme !== 'light') return false;
  if ('enableAi' in p && !isBool(p.enableAi)) return false;
  for (const k of ['autoScanAllowlist', 'dismissedSites'] as const) {
    if (k in p) {
      const v = p[k];
      if (!Array.isArray(v) || v.length > 500 || !v.every((x) => isStr(x, 2048))) return false;
    }
  }
  return true;
}

function validContentMessage(m: Record<string, unknown>): boolean {
  switch (m.type) {
    case 'PAGE_DETECTED':
      return only(m, ['type', 'url', 'branchHint']) && isHttpUrl(m.url) && isOptStr(m.branchHint, 255);
    case 'OPEN_SIDE_PANEL':
    case 'DISMISS_BUTTON':
      return only(m, ['type']);
    default:
      return false;
  }
}

function validUiMessage(m: Record<string, unknown>): boolean {
  switch (m.type) {
    case 'GET_STATE':
      return only(m, ['type', 'refresh']) && (m.refresh === undefined || isBool(m.refresh));
    case 'LOGIN':
      return only(m, ['type', 'email', 'password']) && isStr(m.email, 254) && isStr(m.password, 200);
    case 'LOGOUT':
    case 'LIST_RECENT_SCANS':
      return only(m, ['type']);
    case 'UPDATE_SETTINGS':
      return only(m, ['type', 'patch']) && validSettingsPatch(m.patch);
    case 'GET_ACTIVE_SOURCE':
      return only(m, ['type', 'tabId']) && (m.tabId === undefined || m.tabId === null || Number.isInteger(m.tabId));
    case 'INSPECT_SOURCE':
      return only(m, ['type', 'url']) && isHttpUrl(m.url);
    case 'UPLOAD_SCAN':
      return only(m, ['type', 'uploadId', 'organizationId', 'consent']) && isId(m.uploadId) && isId(m.organizationId) && m.consent === true;
    case 'START_SCAN': {
      if (!only(m, ['type', 'request']) || !isObj(m.request)) return false;
      const r = m.request;
      return (
        only(r, ['action', 'sourceUrl', 'ref', 'path', 'consent', 'tabId']) &&
        SCAN_ACTIONS.includes(r.action as ScanActionId) &&
        isHttpUrl(r.sourceUrl) &&
        isOptStr(r.ref, 255) &&
        isOptStr(r.path, 1024) &&
        (r.consent === undefined || isBool(r.consent)) &&
        (r.tabId === undefined || r.tabId === null || Number.isInteger(r.tabId))
      );
    }
    case 'GET_SCAN':
    case 'GET_SCAN_STATUS':
      return only(m, ['type', 'scanId']) && isId(m.scanId);
    case 'GET_FINDINGS':
      return (
        only(m, ['type', 'scanId', 'severity']) &&
        isId(m.scanId) &&
        (m.severity === undefined || m.severity === null || (SEVERITIES as readonly unknown[]).includes(m.severity))
      );
    case 'SET_AUTO_SCAN':
      return only(m, ['type', 'sourceUrl', 'enabled']) && isHttpUrl(m.sourceUrl) && isBool(m.enabled);
    default:
      return false;
  }
}

/**
 * Validates an incoming runtime message.
 *  - The sender must be this extension (`sender.id === runtimeId`).
 *  - Extension pages are identified by their chrome-extension:// URL and may send UI messages.
 *  - Everything else with a tab is a content script and may only send ContentMessage types.
 *  - Unknown types, extra fields and malformed payloads are rejected.
 */
export function validateMessage(raw: unknown, sender: SenderLike, runtimeId: string): ValidationResult {
  const reject = (code: ErrorCode, message: string): ValidationResult => ({ ok: false, error: { code, message } });
  if (!sender || sender.id !== runtimeId) return reject('FORBIDDEN_SENDER', 'Messages are only accepted from this extension.');
  if (!isObj(raw) || typeof raw.type !== 'string') return reject('INVALID_MESSAGE', 'Malformed message.');

  const extensionOrigin = `chrome-extension://${runtimeId}/`;
  const isExtensionPage = typeof sender.url === 'string' && sender.url.startsWith(extensionOrigin);

  if (isExtensionPage) {
    if (!(UI_MESSAGE_TYPES as readonly string[]).includes(raw.type)) return reject('INVALID_MESSAGE', `Unknown message type "${raw.type}".`);
    if (!validUiMessage(raw)) return reject('INVALID_MESSAGE', `Invalid payload for ${raw.type}.`);
    return { ok: true, kind: 'extension-page', message: raw as unknown as UiMessage };
  }

  if (sender.tab && typeof sender.tab.id === 'number') {
    if (!(CONTENT_MESSAGE_TYPES as readonly string[]).includes(raw.type)) {
      return reject('FORBIDDEN_SENDER', `Content scripts may not send "${raw.type}".`);
    }
    if (!validContentMessage(raw)) return reject('INVALID_MESSAGE', `Invalid payload for ${raw.type}.`);
    // A content script may only describe the page it runs in.
    if (raw.type === 'PAGE_DETECTED' && sender.url) {
      try {
        if (new URL(raw.url as string).origin !== new URL(sender.url).origin) {
          return reject('FORBIDDEN_SENDER', 'Reported URL does not match the sending page.');
        }
      } catch {
        return reject('INVALID_MESSAGE', 'Invalid sender URL.');
      }
    }
    return { ok: true, kind: 'content-script', message: raw as unknown as ContentMessage };
  }

  return reject('FORBIDDEN_SENDER', 'Unrecognised sender.');
}

/** Validates broadcasts received by extension pages (sent by the background service worker). */
export function isBroadcastFromBackground(raw: unknown, sender: SenderLike, runtimeId: string): raw is BroadcastMessage {
  if (!sender || sender.id !== runtimeId || sender.tab) return false;
  if (typeof sender.url === 'string' && !sender.url.startsWith(`chrome-extension://${runtimeId}/`)) return false;
  return isObj(raw) && (BROADCAST_MESSAGE_TYPES as readonly unknown[]).includes(raw.type);
}
