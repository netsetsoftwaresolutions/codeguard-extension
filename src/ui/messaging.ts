import type { ErrorInfo, MessageResponse, ResponseMap, UiMessage } from '../shared/messages';

export class UiError extends Error {
  constructor(public readonly info: ErrorInfo) {
    super(info.message);
  }
  get code() {
    return this.info.code;
  }
}

type MsgOf<T extends UiMessage['type']> = Extract<UiMessage, { type: T }>;

/** Typed request to the background service worker. Throws UiError on failure. */
export async function send<T extends UiMessage['type']>(message: MsgOf<T>): Promise<ResponseMap[T]> {
  let res: MessageResponse<ResponseMap[T]> | undefined;
  try {
    res = await chrome.runtime.sendMessage<UiMessage, MessageResponse<ResponseMap[T]>>(message);
  } catch (err) {
    throw new UiError({ code: 'UNKNOWN', message: `The extension background is unavailable: ${err instanceof Error ? err.message : String(err)}` });
  }
  if (!res) throw new UiError({ code: 'UNKNOWN', message: 'No response from the extension background.' });
  if (!res.ok) throw new UiError(res.error);
  return res.data;
}

export function errorMessage(err: unknown): string {
  if (err instanceof UiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Unexpected error.';
}

/** Opens a URL in a new tab. Only http(s) URLs are allowed. */
export function openTab(url: string): void {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
  } catch {
    return;
  }
  void chrome.tabs.create({ url });
}

export function dashboardLink(dashboardUrl: string, path: string): string {
  return `${dashboardUrl.replace(/\/+$/, '')}${path}`;
}
