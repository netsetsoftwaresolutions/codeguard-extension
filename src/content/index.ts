/**
 * CodeGuard content script (IIFE). Runs on GitHub, GitLab, Bitbucket, Dropbox and Google Drive.
 *  - Reports the current page URL (and, on GitHub/GitLab, the branch name shown on the page) to
 *    the background so the popup / side panel can recognise it.
 *  - On git repository pages, shows a small floating button that opens the side panel.
 * It never reads page content other than the branch hint and never sends page HTML anywhere.
 * It has no access to the auth token or the API.
 */
import { extractBranchHint } from '../shared/branch-hint';
import { DEFAULT_PRODUCT_NAME } from '../shared/constants';
import type { ContentMessage, MessageResponse, PageDetectedResponse } from '../shared/messages';
import { FloatingButton } from './floating-button';

function send<T>(message: ContentMessage): Promise<MessageResponse<T> | null> {
  try {
    return chrome.runtime.sendMessage<ContentMessage, MessageResponse<T>>(message).catch(() => null);
  } catch {
    // Extension was reloaded/updated: this orphaned content script can no longer talk to it.
    return Promise.resolve(null);
  }
}

function providerOf(host: string): string {
  if (host === 'github.com') return 'GITHUB';
  if (host === 'gitlab.com') return 'GITLAB';
  return 'OTHER';
}

const button = new FloatingButton({
  onScan: () => {
    void send<{ opened: boolean }>({ type: 'OPEN_SIDE_PANEL' }).then((r) => {
      if (!r || !r.ok) button.toast(`Click the ${productName} toolbar icon to open the scanner.`);
    });
  },
  onDismiss: () => {
    void send({ type: 'DISMISS_BUTTON' });
  },
});

let productName = DEFAULT_PRODUCT_NAME;
let lastReported = '';
let lastHint: string | null = null;

async function report(force = false): Promise<void> {
  const url = location.href;
  const hint = extractBranchHint(document, providerOf(location.hostname));
  if (!force && url === lastReported && hint === lastHint) return;
  lastReported = url;
  lastHint = hint;
  const res = await send<PageDetectedResponse>({ type: 'PAGE_DETECTED', url, branchHint: hint });
  if (!res || !res.ok) return;
  productName = res.data.productName;
  if (res.data.showButton) button.mount(res.data.productName);
  else button.unmount();
}

let pending: ReturnType<typeof setTimeout> | null = null;
function scheduleReport(delay = 300): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    void report();
  }, delay);
}

// SPA navigation: history events, GitHub Turbo / PJAX, and URL polling through DOM mutations.
window.addEventListener('popstate', () => scheduleReport());
document.addEventListener('turbo:load', () => scheduleReport());
document.addEventListener('turbo:render', () => scheduleReport());
document.addEventListener('pjax:end', () => scheduleReport());

let observedHref = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== observedHref) {
    observedHref = location.href;
    scheduleReport();
    // GitHub fills the embedded data after navigation; re-check the branch hint shortly after.
    scheduleReportLater();
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });

let later: ReturnType<typeof setTimeout> | null = null;
function scheduleReportLater(): void {
  if (later) clearTimeout(later);
  later = setTimeout(() => void report(), 1500);
}

void report(true);
