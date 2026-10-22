import type { ParsedSource, ScanView, SourceInspection } from '../contracts';
import { AUTO_SCAN_MIN_INTERVAL_MS } from './constants';
import type { Settings } from './settings';
import { isGitProvider, sourceKey } from './source';

/** Local record of automatic scans started by this browser: source key → epoch ms. */
export type AutoScanLog = Record<string, number>;

export type AutoScanDecision =
  | { scan: true; key: string }
  | { scan: false; reason: string };

/** Pre-network check: is this page even a candidate for automatic scanning? */
export function autoScanCandidate(settings: Settings, signedIn: boolean, parsed: ParsedSource, log: AutoScanLog, now: number): AutoScanDecision {
  if (settings.scanMode !== 'automatic') return { scan: false, reason: 'manual-mode' };
  if (!signedIn) return { scan: false, reason: 'signed-out' };
  if (!settings.organizationId) return { scan: false, reason: 'no-organization' };
  if (!parsed.supported || !isGitProvider(parsed)) return { scan: false, reason: 'unsupported' };
  const key = sourceKey(parsed);
  if (!settings.autoScanAllowlist.includes(key)) return { scan: false, reason: 'not-allowlisted' };
  const last = log[key];
  if (last !== undefined && now - last < AUTO_SCAN_MIN_INTERVAL_MS) return { scan: false, reason: 'recently-scanned' };
  return { scan: true, key };
}

/** Post-network check using the server's inspection and previous scans for the source. */
export function autoScanAllowed(inspection: SourceInspection, previousScans: ScanView[], now: number): AutoScanDecision {
  if (inspection.visibility !== 'public') return { scan: false, reason: 'not-public' };
  if (!inspection.accessible || !inspection.capabilities.scanRepository) return { scan: false, reason: 'not-scannable' };
  const recent = previousScans.some((s) => {
    const t = Date.parse(s.createdAt);
    return Number.isFinite(t) && now - t < AUTO_SCAN_MIN_INTERVAL_MS && s.status !== 'FAILED' && s.status !== 'CANCELLED';
  });
  if (recent) return { scan: false, reason: 'recently-scanned' };
  return { scan: true, key: sourceKey(inspection.parsed) };
}
