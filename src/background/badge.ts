import { TERMINAL_SCAN_STATUSES } from '../contracts';
import type { CodeGuardApi } from './api-client';
import type { Store } from './store';

export interface BadgeApi {
  set(tabId: number, text: string, color: string): Promise<void>;
}

export const BADGE_COLORS = { running: '#2563EB', findings: '#DC2626', clean: '#16A34A', failed: '#64748B' } as const;

export function chromeBadgeApi(): BadgeApi {
  return {
    async set(tabId, text, color) {
      try {
        await chrome.action.setBadgeBackgroundColor({ tabId, color });
        await chrome.action.setBadgeText({ tabId, text });
      } catch {
        // Tab may have been closed.
      }
    },
  };
}

/**
 * Shows scan state on the toolbar icon for the tab the scan was started from:
 * "…" while running, the number of CRITICAL+HIGH findings when done, "!" on failure.
 */
export class ScanTracker {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly store: Store,
    private readonly api: CodeGuardApi,
    private readonly badge: BadgeApi,
    private readonly intervalMs = 3000,
  ) {}

  async track(tabId: number, scanIds: string[]): Promise<void> {
    if (!scanIds.length) return;
    await this.store.setTracked(tabId, { scanIds, startedAt: Date.now() });
    await this.badge.set(tabId, '…', BADGE_COLORS.running);
    this.schedule();
  }

  /** Resume polling after a service worker restart. */
  resume(): void {
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, this.intervalMs);
  }

  async tick(): Promise<void> {
    const tracked = await this.store.getTracked();
    const entries = Object.entries(tracked);
    if (!entries.length) return;
    let pending = false;
    for (const [tab, t] of entries) {
      const tabId = Number(tab);
      try {
        const statuses = await Promise.all(t.scanIds.map((id) => this.api.getScanStatus(id)));
        if (statuses.some((s) => !TERMINAL_SCAN_STATUSES.includes(s.status))) {
          pending = true;
          await this.badge.set(tabId, '…', BADGE_COLORS.running);
          continue;
        }
        const finished = statuses.filter((s) => s.status === 'COMPLETED' || s.status === 'COMPLETED_WITH_ERRORS');
        if (!finished.length) {
          await this.badge.set(tabId, '!', BADGE_COLORS.failed);
        } else {
          const scans = await Promise.all(finished.map((s) => this.api.getScan(s.id)));
          const count = scans.reduce((n, s) => n + (s.summary?.severityCounts.CRITICAL ?? 0) + (s.summary?.severityCounts.HIGH ?? 0), 0);
          await this.badge.set(tabId, String(count), count > 0 ? BADGE_COLORS.findings : BADGE_COLORS.clean);
        }
        await this.store.setTracked(tabId, null);
      } catch {
        // Signed out or API down: stop tracking this tab rather than polling forever.
        await this.badge.set(tabId, '', BADGE_COLORS.failed);
        await this.store.setTracked(tabId, null);
      }
    }
    if (pending) this.schedule();
  }
}
