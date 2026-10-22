import { DEFAULT_API_BASE_URL, DEFAULT_DASHBOARD_URL } from './constants';

export type ScanMode = 'manual' | 'automatic';
export type Theme = 'dark' | 'light';

/** User preferences persisted in chrome.storage.local. Never contains credentials. */
export interface Settings {
  apiBaseUrl: string;
  dashboardUrl: string;
  organizationId: string | null;
  scanMode: ScanMode;
  /** Exact canonical repository URLs the user approved for automatic scanning. */
  autoScanAllowlist: string[];
  /** Opt-in: masked snippets of non-secret findings are sent to the configured AI provider. */
  enableAi: boolean;
  theme: Theme;
  /** Hostnames on which the floating "Scan with …" button was dismissed. */
  dismissedSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  dashboardUrl: DEFAULT_DASHBOARD_URL,
  organizationId: null,
  scanMode: 'manual',
  autoScanAllowlist: [],
  enableAi: false,
  theme: 'dark',
  dismissedSites: [],
};

export function mergeSettings(stored: Partial<Settings> | undefined | null): Settings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

/**
 * Validates and normalises an API / dashboard base URL. HTTPS is required except for localhost.
 * Returns the URL without trailing slash, or null when invalid.
 */
export function normalizeBaseUrl(input: string): string | null {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return null;
  }
  if (u.username || u.password || u.search || u.hash) return null;
  const isLocal = u.hostname === 'localhost';
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLocal)) return null;
  return (u.origin + u.pathname).replace(/\/+$/, '');
}

/**
 * Host permission pattern to request for an API base URL. Ports are not part of match
 * patterns, so `http://localhost:4001` maps to `http://localhost/*` (declared optional).
 */
export function originPatternFor(baseUrl: string): string | null {
  const n = normalizeBaseUrl(baseUrl);
  if (!n) return null;
  const u = new URL(n);
  return `${u.protocol}//${u.hostname}/*`;
}

/** The API base URL that ships with the manifest's host_permissions (no runtime request needed). */
export function isDefaultApiOrigin(baseUrl: string): boolean {
  const n = normalizeBaseUrl(baseUrl);
  return !!n && new URL(n).origin === new URL(DEFAULT_API_BASE_URL).origin;
}
