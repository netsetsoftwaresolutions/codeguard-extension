import { takeUpload, validateUploadFiles } from '../shared/upload';
import { parseSourceUrl, type ParsedSource, type ScanCreatedResponse, type SourceInspection } from '../contracts';
import { autoScanAllowed, autoScanCandidate, type AutoScanDecision } from '../shared/auto-scan';
import { requiresConsent } from '../shared/consent';
import { DEFAULT_PRODUCT_NAME } from '../shared/constants';
import {
  validateMessage,
  type ActiveSource,
  type BroadcastMessage,
  type ContentMessage,
  type ErrorCode,
  type ExtensionState,
  type MessageResponse,
  type ResponseMap,
  type SenderLike,
  type StartScanRequest,
  type UiMessage,
} from '../shared/messages';
import { isDefaultApiOrigin, normalizeBaseUrl, originPatternFor, type Settings } from '../shared/settings';
import { acceptBranchHint, isGitProvider, repositoryUrl, shouldShowFloatingButton, sourceKey, sourceKeyForUrl } from '../shared/source';
import { toErrorInfo, type CodeGuardApi, type RepositoryScanBody, type UrlScanBody } from './api-client';
import type { Store } from './store';

export class ServiceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ServiceDeps {
  store: Store;
  api: CodeGuardApi;
  runtimeId: string;
  now?: () => number;
  /** Must be invoked synchronously from the message listener to keep the user gesture. */
  openSidePanel: (tabId: number) => Promise<void>;
  hasHostPermission: (originPattern: string) => Promise<boolean>;
  getActiveTab: () => Promise<{ id?: number; url?: string } | null>;
  broadcast: (m: BroadcastMessage) => void;
  trackScan: (tabId: number, scanIds: string[]) => Promise<void>;
  newIdempotencyKey?: () => string;
}

/** Background message router + business logic. All API access happens here. */
export class BackgroundService {
  private readonly now: () => number;
  /** Visibility reported by the most recent inspection, by source key. */
  private readonly visibilityCache = new Map<string, SourceInspection['visibility']>();
  private readonly autoInFlight = new Set<string>();

  constructor(private readonly deps: ServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  /**
   * Entry point for chrome.runtime.onMessage. Validation is synchronous so that
   * OPEN_SIDE_PANEL can call chrome.sidePanel.open() while the user gesture is still active.
   */
  handle(raw: unknown, sender: SenderLike): Promise<MessageResponse> {
    const v = validateMessage(raw, sender, this.deps.runtimeId);
    if (!v.ok) return Promise.resolve({ ok: false, error: v.error });
    const run = v.kind === 'content-script' ? this.handleContent(v.message as ContentMessage, sender) : this.handleUi(v.message as UiMessage);
    return run.then(
      (data) => ({ ok: true as const, data }),
      (err: unknown) => ({ ok: false as const, error: toErrorInfo(err) }),
    );
  }

  /* --------------------------------------------------------------------------------------- */
  /* Content scripts (unprivileged)                                                          */
  /* --------------------------------------------------------------------------------------- */

  private handleContent(m: ContentMessage, sender: SenderLike): Promise<unknown> {
    const tabId = sender.tab?.id;
    if (typeof tabId !== 'number') return Promise.reject(new ServiceError('FORBIDDEN_SENDER', 'Missing tab.'));
    switch (m.type) {
      case 'OPEN_SIDE_PANEL': {
        // Called before any await: keeps the user gesture from the click in the page.
        const p = this.deps.openSidePanel(tabId);
        return p.then(
          (): ResponseMap['OPEN_SIDE_PANEL'] => ({ opened: true }),
          () => {
            throw new ServiceError('SIDE_PANEL_UNAVAILABLE', 'Click the toolbar icon to open the side panel.');
          },
        );
      }
      case 'PAGE_DETECTED':
        return this.pageDetected(tabId, m.url, m.branchHint ?? null);
      case 'DISMISS_BUTTON':
        return this.dismissButton(sender);
    }
  }

  private async pageDetected(tabId: number, url: string, hint: string | null): Promise<ResponseMap['PAGE_DETECTED']> {
    const parsed = parseSourceUrl(url);
    const branchHint = acceptBranchHint(parsed, hint);
    await this.deps.store.setTabSource(tabId, { url, parsed, branchHint, updatedAt: this.now() });
    this.deps.broadcast({ type: 'SOURCE_CHANGED', tabId });
    const settings = await this.deps.store.getSettings();
    const meta = await this.deps.store.getMeta();
    const host = safeHost(url);
    void this.maybeAutoScan(tabId, parsed).catch(() => undefined);
    return {
      showButton: shouldShowFloatingButton(parsed) && !!host && !settings.dismissedSites.includes(host),
      productName: meta?.productName || DEFAULT_PRODUCT_NAME,
    };
  }

  private async dismissButton(sender: SenderLike): Promise<ResponseMap['DISMISS_BUTTON']> {
    const host = safeHost(sender.url ?? '');
    if (!host) return { dismissed: false };
    const s = await this.deps.store.getSettings();
    if (!s.dismissedSites.includes(host)) await this.deps.store.updateSettings({ dismissedSites: [...s.dismissedSites, host] });
    return { dismissed: true };
  }

  /* --------------------------------------------------------------------------------------- */
  /* Extension pages (privileged)                                                            */
  /* --------------------------------------------------------------------------------------- */

  private async handleUi(m: UiMessage): Promise<unknown> {
    const { api, store } = this.deps;
    switch (m.type) {
      case 'GET_STATE':
        return this.getState(m.refresh === true);
      case 'LOGIN': {
        const res = await api.login(m.email.trim(), m.password);
        await store.setAuth(res);
        await this.ensureOrganization();
        this.deps.broadcast({ type: 'AUTH_CHANGED' });
        return this.getState(false);
      }
      case 'LOGOUT': {
        try {
          if (await store.getToken()) await api.logout();
        } catch {
          // Revocation failure (offline / already expired) must not keep the user signed in locally.
        }
        await store.clearAuth();
        this.deps.broadcast({ type: 'AUTH_CHANGED' });
        return this.getState(false);
      }
      case 'UPDATE_SETTINGS':
        return this.updateSettings(m.patch);
      case 'GET_ACTIVE_SOURCE':
        return this.getActiveSource(m.tabId ?? null);
      case 'INSPECT_SOURCE':
        return this.inspect(m.url);
      case 'UPLOAD_SCAN': {
        const files = await takeUpload(m.uploadId);
        if (!(await store.getToken())) throw new ServiceError('UNAUTHENTICATED', 'Please sign in first.');
        const organizationId = await this.requireOrganization();
        if (organizationId !== m.organizationId) throw new ServiceError('CONFLICT', 'Organization changed. Select the files again.');
        const settings = await store.getSettings();
        const meta = await store.getMeta();
        validateUploadFiles(files, meta?.limits.maxUploadBytes ?? 200 * 1024 * 1024);
        const body = new FormData();
        body.append('organizationId', organizationId);
        body.append('enableAi', String(settings.enableAi));
        body.append('relativePaths', JSON.stringify(files.map((f) => f.path)));
        for (const file of files) body.append('files', file.blob, file.name);
        return api.uploadScan(body, m.uploadId);
      }
      case 'START_SCAN':
        return this.startScan(m.request);
      case 'GET_SCAN':
        return api.getScan(m.scanId);
      case 'GET_SCAN_STATUS':
        return api.getScanStatus(m.scanId);
      case 'GET_FINDINGS':
        return api.getFindings(m.scanId, { severity: m.severity ?? null, pageSize: 100 });
      case 'LIST_RECENT_SCANS': {
        const org = await this.requireOrganization();
        return api.listScans(org, 5);
      }
      case 'SET_AUTO_SCAN':
        return this.setAutoScan(m.sourceUrl, m.enabled);
    }
  }

  async getState(refresh: boolean): Promise<ExtensionState> {
    const { api, store } = this.deps;
    let apiReachable = true;
    let apiError: string | null = null;
    let meta = await store.getMeta();
    try {
      meta = await api.meta();
      await store.setMeta(meta);
    } catch (err) {
      apiReachable = false;
      apiError = toErrorInfo(err).message;
    }
    if (apiReachable && refresh && (await store.getToken())) {
      try {
        const me = await api.me();
        await store.updateProfile(me.user, me.organizations);
        await this.ensureOrganization();
      } catch (err) {
        const info = toErrorInfo(err);
        if (info.code !== 'UNAUTHENTICATED') apiError = info.message;
      }
    }
    const auth = await store.getAuth();
    return {
      productName: meta?.productName || DEFAULT_PRODUCT_NAME,
      apiReachable,
      apiError,
      meta,
      settings: await store.getSettings(),
      auth: { signedIn: !!auth, user: auth?.user ?? null, organizations: auth?.organizations ?? [] },
    };
  }

  private async ensureOrganization(): Promise<void> {
    const auth = await this.deps.store.getAuth();
    if (!auth) return;
    const s = await this.deps.store.getSettings();
    if (!s.organizationId || !auth.organizations.some((o) => o.id === s.organizationId)) {
      await this.deps.store.updateSettings({ organizationId: auth.organizations[0]?.id ?? null });
    }
  }

  private async requireOrganization(): Promise<string> {
    const s = await this.deps.store.getSettings();
    if (!s.organizationId) throw new ServiceError('NO_ORGANIZATION', 'Select an organization first.');
    return s.organizationId;
  }

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const { store } = this.deps;
    const current = await store.getSettings();
    const next: Partial<Settings> = { ...patch };
    let apiChanged = false;

    if (patch.apiBaseUrl !== undefined) {
      const n = normalizeBaseUrl(patch.apiBaseUrl);
      if (!n) throw new ServiceError('VALIDATION', 'API URL must be https:// (or http://localhost) without credentials, query or fragment.');
      if (!isDefaultApiOrigin(n)) {
        const pattern = originPatternFor(n)!;
        if (!(await this.deps.hasHostPermission(pattern))) {
          throw new ServiceError('PERMISSION_REQUIRED', `Permission to access ${pattern} was not granted.`);
        }
      }
      next.apiBaseUrl = n;
      apiChanged = n !== current.apiBaseUrl;
    }
    if (patch.dashboardUrl !== undefined) {
      const n = normalizeBaseUrl(patch.dashboardUrl);
      if (!n) throw new ServiceError('VALIDATION', 'Dashboard URL must be https:// (or http://localhost).');
      next.dashboardUrl = n;
    }
    if (patch.organizationId !== undefined && patch.organizationId !== null) {
      const auth = await store.getAuth();
      if (!auth?.organizations.some((o) => o.id === patch.organizationId)) {
        throw new ServiceError('FORBIDDEN', 'You are not a member of that organization.');
      }
    }
    if (patch.autoScanAllowlist !== undefined) {
      next.autoScanAllowlist = [...new Set(patch.autoScanAllowlist.map((u) => sourceKeyForUrl(u)).filter((k): k is string => !!k))];
    }
    if (patch.dismissedSites !== undefined) {
      next.dismissedSites = [...new Set(patch.dismissedSites.filter((h) => /^[a-z0-9.-]+$/i.test(h)))];
    }

    if (apiChanged) {
      // A token issued by one server must never be sent to another.
      await store.clearAuth();
      next.organizationId = null;
    }
    const saved = await store.updateSettings(next);
    if (apiChanged) this.deps.broadcast({ type: 'AUTH_CHANGED' });
    return saved;
  }

  async getActiveSource(tabId: number | null): Promise<ActiveSource> {
    let id = tabId;
    let url: string | null = null;
    if (id === null) {
      const tab = await this.deps.getActiveTab();
      id = typeof tab?.id === 'number' ? tab.id : null;
      url = tab?.url ?? null;
    }
    const stored = id !== null ? await this.deps.store.getTabSource(id) : null;
    if (!url) url = stored?.url ?? null;
    if (!url) return { tabId: id, url: null, parsed: null, branchHint: null };
    const parsed = parseSourceUrl(url);
    const branchHint = stored && stored.url === url ? stored.branchHint : null;
    return { tabId: id, url, parsed, branchHint };
  }

  async inspect(url: string): Promise<SourceInspection> {
    const parsed = parseSourceUrl(url);
    if (!parsed.supported) throw new ServiceError('UNSUPPORTED_SOURCE', parsed.notes[0] ?? 'This page is not a supported source.');
    const s = await this.deps.store.getSettings();
    const inspection = await this.deps.api.inspect(url, s.organizationId);
    this.visibilityCache.set(sourceKey(parsed), inspection.visibility);
    return inspection;
  }

  private async visibilityFor(parsed: ParsedSource, url: string): Promise<SourceInspection['visibility']> {
    const cached = this.visibilityCache.get(sourceKey(parsed));
    if (cached) return cached;
    return (await this.inspect(url)).visibility;
  }

  async startScan(req: StartScanRequest): Promise<ScanCreatedResponse> {
    const { api, store } = this.deps;
    const organizationId = await this.requireOrganization();
    const parsed = parseSourceUrl(req.sourceUrl);
    if (!parsed.supported) throw new ServiceError('UNSUPPORTED_SOURCE', 'This page is not a supported source.');
    const key = sourceKey(parsed);

    // Consent gate: enforced here, not only in the UI.
    const visibility = await this.visibilityFor(parsed, req.sourceUrl);
    const consents = await store.getConsents();
    if (requiresConsent(visibility, key, consents)) {
      if (req.consent !== true) {
        throw new ServiceError('CONSENT_REQUIRED', 'This source is private or its visibility is unknown. Consent is required before it is downloaded for scanning.');
      }
      await store.addConsent(key);
    }
    const consent = visibility !== 'public' ? true : undefined;

    const settings = await store.getSettings();
    const target = { organizationId };
    const options = { enableAi: settings.enableAi };
    const idem = this.deps.newIdempotencyKey?.();
    const repoUrl = repositoryUrl(parsed);
    const needRepo = () => {
      if (!repoUrl) throw new ServiceError('UNSUPPORTED_SOURCE', 'This action requires a repository page.');
      return repoUrl;
    };
    const repoBody = (extra: Partial<RepositoryScanBody>): RepositoryScanBody => ({
      target,
      url: needRepo(),
      options,
      ...(consent ? { consent } : {}),
      ...extra,
    });
    const urlBody = (url: string): UrlScanBody => ({ target, url, options, ...(consent ? { consent } : {}) });

    let res: ScanCreatedResponse;
    switch (req.action) {
      case 'SCAN_FILE':
      case 'SCAN_FOLDER_PATH':
        if (!req.ref || !req.path) throw new ServiceError('VALIDATION', 'A branch and path are required.');
        res = await api.scanRepository(repoBody({ ref: req.ref, path: req.path }), idem);
        break;
      case 'SCAN_BRANCH':
        if (!req.ref) throw new ServiceError('VALIDATION', 'A branch is required.');
        res = await api.scanBranch(repoBody({ ref: req.ref }), idem);
        break;
      case 'SCAN_REPOSITORY':
        res = await api.scanRepository(repoBody({}), idem);
        break;
      case 'SCAN_ALL_BRANCHES':
        res = await api.scanRepository(repoBody({ branches: 'ALL' }), idem);
        break;
      case 'SCAN_PULL_REQUEST':
        if (parsed.kind !== 'PULL_REQUEST' && parsed.kind !== 'MERGE_REQUEST') {
          throw new ServiceError('UNSUPPORTED_SOURCE', 'This page is not a pull request.');
        }
        res = await api.scanPullRequest(urlBody(parsed.canonicalUrl), idem);
        break;
      case 'SCAN_SHARED_FOLDER':
        if (isGitProvider(parsed) || parsed.kind !== 'FOLDER') throw new ServiceError('UNSUPPORTED_SOURCE', 'This link is not a shared folder.');
        res = await api.scanUrl(urlBody(parsed.canonicalUrl), idem);
        break;
      case 'SCAN_SHARED_FILE':
        if (isGitProvider(parsed) || (parsed.kind !== 'FILE' && parsed.kind !== 'ARCHIVE')) {
          throw new ServiceError('UNSUPPORTED_SOURCE', 'This link is not a shared file.');
        }
        res = await api.scanUrl(urlBody(parsed.canonicalUrl), idem);
        break;
    }
    if (typeof req.tabId === 'number' && res.scans.length) {
      await this.deps.trackScan(req.tabId, res.scans.map((s) => s.id)).catch(() => undefined);
    }
    return res;
  }

  async setAutoScan(sourceUrl: string, enabled: boolean): Promise<Settings> {
    const parsed = parseSourceUrl(sourceUrl);
    if (!parsed.supported || !isGitProvider(parsed)) {
      throw new ServiceError('UNSUPPORTED_SOURCE', 'Automatic scanning is only available for repositories.');
    }
    const key = sourceKey(parsed);
    const s = await this.deps.store.getSettings();
    const list = s.autoScanAllowlist.filter((k) => k !== key);
    if (enabled) list.push(key);
    return this.deps.store.updateSettings({ autoScanAllowlist: list });
  }

  /**
   * Automatic mode: scan an allowlisted, PUBLIC repository at most once per 24 hours.
   * Never scans private / unknown-visibility sources. Returns the decision (for tests / logging).
   */
  async maybeAutoScan(tabId: number | null, parsed: ParsedSource): Promise<AutoScanDecision> {
    const { store, api } = this.deps;
    const settings = await store.getSettings();
    const signedIn = !!(await store.getToken());
    const pre = autoScanCandidate(settings, signedIn, parsed, await store.getAutoLog(), this.now());
    if (!pre.scan) return pre;
    if (this.autoInFlight.has(pre.key)) return { scan: false, reason: 'in-flight' };
    this.autoInFlight.add(pre.key);
    try {
      const repoUrl = repositoryUrl(parsed)!;
      const inspection = await api.inspect(repoUrl, settings.organizationId);
      this.visibilityCache.set(pre.key, inspection.visibility);
      const bySource = await api.scansBySource(repoUrl);
      const decision = autoScanAllowed(inspection, [...bySource, ...inspection.previousScans], this.now());
      if (!decision.scan) return decision;
      await store.recordAutoScan(pre.key);
      const res = await api.scanRepository({
        target: { organizationId: settings.organizationId! },
        url: repoUrl,
        options: { enableAi: settings.enableAi },
      });
      if (tabId !== null && res.scans.length) await this.deps.trackScan(tabId, res.scans.map((s) => s.id)).catch(() => undefined);
      return decision;
    } finally {
      this.autoInFlight.delete(pre.key);
    }
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}
