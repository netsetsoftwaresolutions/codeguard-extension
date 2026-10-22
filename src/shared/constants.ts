/**
 * Build-time defaults. The product name shown in the UI is replaced at runtime by
 * `GET /api/meta` → `productName` whenever the API is reachable.
 */
export const DEFAULT_PRODUCT_NAME = 'CodeGuard';
export const DEFAULT_API_BASE_URL = 'http://localhost:4000';
export const DEFAULT_DASHBOARD_URL = 'http://localhost:3000';

/** Scan status polling interval used by the popup / side panel. */
export const STATUS_POLL_INTERVAL_MS = 2000;
/** Automatic mode never rescans the same source more often than this. */
export const AUTO_SCAN_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Network timeout for API calls made by the background service worker. */
export const API_TIMEOUT_MS = 20_000;
