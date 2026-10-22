import { vi } from 'vitest';

/** Minimal chrome.* stub for jsdom tests. Individual tests override what they need. */
function event() {
  return { addListener: vi.fn(), removeListener: vi.fn(), hasListener: vi.fn(() => false) };
}

const chromeStub = {
  runtime: { id: 'test-extension-id', sendMessage: vi.fn(), onMessage: event() },
  tabs: { create: vi.fn(), query: vi.fn(async () => []), onActivated: event(), onUpdated: event(), onRemoved: event() },
  sidePanel: { open: vi.fn(async () => undefined) },
  permissions: { request: vi.fn(async () => true), contains: vi.fn(async () => true) },
  windows: { getCurrent: vi.fn(async () => ({ id: 1 })) },
};

(globalThis as unknown as { chrome: unknown }).chrome = chromeStub;
