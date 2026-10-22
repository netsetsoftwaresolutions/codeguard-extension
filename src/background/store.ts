import type { AuthResponse, MetaView, OrganizationView, ParsedSource, UserView } from '../contracts';
import type { AutoScanLog } from '../shared/auto-scan';
import type { ConsentRecord } from '../shared/consent';
import { mergeSettings, type Settings } from '../shared/settings';

/** Minimal async key/value interface so the store can run on chrome.storage or in memory (tests). */
export interface KV {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export function chromeKV(area: chrome.storage.StorageArea): KV {
  return {
    async get<T>(key: string) {
      const r = await area.get(key);
      return r[key] as T | undefined;
    },
    async set(key, value) {
      await area.set({ [key]: value });
    },
    async remove(key) {
      await area.remove(key);
    },
  };
}

export function memoryKV(initial: Record<string, unknown> = {}): KV & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = structuredClone(initial);
  return {
    data,
    async get<T>(key: string) {
      return (data[key] === undefined ? undefined : structuredClone(data[key])) as T | undefined;
    },
    async set(key, value) {
      data[key] = structuredClone(value);
    },
    async remove(key) {
      delete data[key];
    },
  };
}

export interface StoredAuth {
  accessToken: string;
  /** Epoch ms after which the token is considered expired. */
  expiresAt: number;
  user: UserView;
  organizations: OrganizationView[];
}

export interface TabSource {
  url: string;
  parsed: ParsedSource;
  branchHint: string | null;
  updatedAt: number;
}

export interface TrackedScan {
  scanIds: string[];
  startedAt: number;
}

const K = {
  settings: 'settings',
  auth: 'auth',
  consents: 'consents',
  autoLog: 'autoScanLog',
  meta: 'meta',
  tabSources: 'tabSources',
  tracked: 'trackedScans',
} as const;

/**
 * Persistent state of the background service worker.
 * - `local` (chrome.storage.local): settings, auth token, consents, auto-scan log, meta cache.
 * - `session` (chrome.storage.session, trusted contexts only): per-tab detection and tracked scans.
 */
export class Store {
  constructor(
    private readonly local: KV,
    private readonly session: KV,
    private readonly now: () => number = Date.now,
  ) {}

  async getSettings(): Promise<Settings> {
    return mergeSettings(await this.local.get<Partial<Settings>>(K.settings));
  }
  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await this.getSettings()), ...patch };
    await this.local.set(K.settings, next);
    return next;
  }

  async getAuth(): Promise<StoredAuth | null> {
    const a = await this.local.get<StoredAuth>(K.auth);
    if (!a || !a.accessToken) return null;
    if (a.expiresAt && a.expiresAt <= this.now()) {
      await this.clearAuth();
      return null;
    }
    return a;
  }
  async getToken(): Promise<string | null> {
    return (await this.getAuth())?.accessToken ?? null;
  }
  async setAuth(res: AuthResponse): Promise<StoredAuth> {
    const auth: StoredAuth = {
      accessToken: res.accessToken,
      expiresAt: res.expiresIn > 0 ? this.now() + res.expiresIn * 1000 : 0,
      user: res.user,
      organizations: res.organizations,
    };
    await this.local.set(K.auth, auth);
    return auth;
  }
  async updateProfile(user: UserView, organizations: OrganizationView[]): Promise<void> {
    const a = await this.getAuth();
    if (!a) return;
    await this.local.set(K.auth, { ...a, user, organizations });
  }
  async clearAuth(): Promise<void> {
    await this.local.remove(K.auth);
  }

  async getConsents(): Promise<ConsentRecord> {
    return (await this.local.get<ConsentRecord>(K.consents)) ?? {};
  }
  async addConsent(key: string): Promise<void> {
    const c = await this.getConsents();
    c[key] = this.now();
    await this.local.set(K.consents, c);
  }

  async getAutoLog(): Promise<AutoScanLog> {
    return (await this.local.get<AutoScanLog>(K.autoLog)) ?? {};
  }
  async recordAutoScan(key: string): Promise<void> {
    const log = await this.getAutoLog();
    log[key] = this.now();
    await this.local.set(K.autoLog, log);
  }

  async getMeta(): Promise<MetaView | null> {
    return (await this.local.get<MetaView>(K.meta)) ?? null;
  }
  async setMeta(meta: MetaView): Promise<void> {
    await this.local.set(K.meta, meta);
  }

  async getTabSource(tabId: number): Promise<TabSource | null> {
    const all = (await this.session.get<Record<string, TabSource>>(K.tabSources)) ?? {};
    return all[String(tabId)] ?? null;
  }
  async setTabSource(tabId: number, src: TabSource): Promise<void> {
    const all = (await this.session.get<Record<string, TabSource>>(K.tabSources)) ?? {};
    all[String(tabId)] = src;
    await this.session.set(K.tabSources, all);
  }
  async clearTabSource(tabId: number): Promise<void> {
    const all = (await this.session.get<Record<string, TabSource>>(K.tabSources)) ?? {};
    if (!(String(tabId) in all)) return;
    delete all[String(tabId)];
    await this.session.set(K.tabSources, all);
  }
  async removeTab(tabId: number): Promise<void> {
    const all = (await this.session.get<Record<string, TabSource>>(K.tabSources)) ?? {};
    delete all[String(tabId)];
    await this.session.set(K.tabSources, all);
    const tracked = await this.getTracked();
    delete tracked[String(tabId)];
    await this.session.set(K.tracked, tracked);
  }

  async getTracked(): Promise<Record<string, TrackedScan>> {
    return (await this.session.get<Record<string, TrackedScan>>(K.tracked)) ?? {};
  }
  async setTracked(tabId: number, t: TrackedScan | null): Promise<void> {
    const all = await this.getTracked();
    if (t) all[String(tabId)] = t;
    else delete all[String(tabId)];
    await this.session.set(K.tracked, all);
  }
}
