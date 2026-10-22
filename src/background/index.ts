/**
 * CodeGuard background service worker (MV3, ES module).
 * The only context that talks to the CodeGuard API or reads the access token.
 */
import { ApiClient, CodeGuardApi } from './api-client';
import { chromeBadgeApi, ScanTracker } from './badge';
import { BackgroundService } from './service';
import { chromeKV, Store } from './store';

const store = new Store(chromeKV(chrome.storage.local), chromeKV(chrome.storage.session));

const api = new CodeGuardApi(
  new ApiClient({
    getBaseUrl: async () => (await store.getSettings()).apiBaseUrl,
    getToken: () => store.getToken(),
    onUnauthorized: async () => {
      await store.clearAuth();
      broadcast({ type: 'AUTH_CHANGED' });
    },
  }),
);

const tracker = new ScanTracker(store, api, chromeBadgeApi());

function broadcast(message: { type: 'SOURCE_CHANGED'; tabId: number } | { type: 'AUTH_CHANGED' }): void {
  // Rejects with "Receiving end does not exist" when no extension page is open — expected.
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

const service = new BackgroundService({
  store,
  api,
  runtimeId: chrome.runtime.id,
  openSidePanel: (tabId) => chrome.sidePanel.open({ tabId }),
  hasHostPermission: (pattern) => chrome.permissions.contains({ origins: [pattern] }),
  getActiveTab: async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tab ? { id: tab.id, url: tab.url } : null;
  },
  broadcast,
  trackScan: (tabId, ids) => tracker.track(tabId, ids),
  newIdempotencyKey: () => crypto.randomUUID(),
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Validation and (for OPEN_SIDE_PANEL) chrome.sidePanel.open() run synchronously inside handle().
  service.handle(message, sender).then(sendResponse);
  return true; // async response
});

// Session storage holds per-tab detection; keep it out of reach of content scripts.
chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => undefined);

// The toolbar icon opens the popup; the side panel is opened explicitly (popup button / page button).
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);

// Without the "tabs" permission we cannot read URLs of arbitrary tabs. When a tab starts loading a
// new document, forget its previous detection; content scripts re-report on supported sites.
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading') {
    void store.clearTabSource(tabId).then(() => broadcast({ type: 'SOURCE_CHANGED', tabId }));
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void store.removeTab(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  void service.getState(false).catch(() => undefined);
});

tracker.resume();
