import { describe, expect, it } from 'vitest';
import { isBroadcastFromBackground, validateMessage } from '../src/shared/messages';

const ID = 'ext-id-123';
const page = { id: ID, url: `chrome-extension://${ID}/popup.html` };
const content = { id: ID, url: 'https://github.com/acme/app', tab: { id: 7 } };

describe('validateMessage', () => {
  it('accepts valid UI messages from extension pages', () => {
    const r = validateMessage({ type: 'GET_STATE', refresh: true }, page, ID);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.kind).toBe('extension-page');
  });

  it('rejects messages from other extensions', () => {
    const r = validateMessage({ type: 'GET_STATE' }, { ...page, id: 'other-extension' }, ID);
    expect(r).toEqual({ ok: false, error: expect.objectContaining({ code: 'FORBIDDEN_SENDER' }) });
  });

  it('rejects senders without an id', () => {
    expect(validateMessage({ type: 'GET_STATE' }, { url: page.url }, ID).ok).toBe(false);
  });

  it('rejects unknown message types', () => {
    const r = validateMessage({ type: 'FETCH_ANY_PATH', path: '/admin' }, page, ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_MESSAGE');
  });

  it('rejects malformed payloads and extra fields', () => {
    expect(validateMessage({ type: 'GET_SCAN', scanId: '../../admin' }, page, ID).ok).toBe(false);
    expect(validateMessage({ type: 'GET_SCAN', scanId: 'scan_1', path: '/x' }, page, ID).ok).toBe(false);
    expect(validateMessage({ type: 'LOGIN', email: 'a@b.c' }, page, ID).ok).toBe(false);
    expect(validateMessage(null, page, ID).ok).toBe(false);
    expect(validateMessage('GET_STATE', page, ID).ok).toBe(false);
    expect(validateMessage({ type: 'UPDATE_SETTINGS', patch: { accessToken: 'x' } }, page, ID).ok).toBe(false);
    expect(validateMessage({ type: 'START_SCAN', request: { action: 'RM_RF', sourceUrl: 'https://github.com/a/b' } }, page, ID).ok).toBe(false);
  });

  it('allows content scripts to send only content message types', () => {
    const ok = validateMessage({ type: 'PAGE_DETECTED', url: 'https://github.com/acme/app/tree/main', branchHint: 'main' }, content, ID);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.kind).toBe('content-script');
    expect(validateMessage({ type: 'OPEN_SIDE_PANEL' }, content, ID).ok).toBe(true);
  });

  it('blocks content-script privilege escalation to UI messages', () => {
    for (const msg of [
      { type: 'GET_STATE' },
      { type: 'LOGIN', email: 'a@b.co', password: 'x' },
      { type: 'START_SCAN', request: { action: 'SCAN_REPOSITORY', sourceUrl: 'https://github.com/a/b' } },
      { type: 'UPDATE_SETTINGS', patch: { apiBaseUrl: 'https://evil.example' } },
      { type: 'GET_FINDINGS', scanId: 'scan_1' },
    ]) {
      const r = validateMessage(msg, content, ID);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('FORBIDDEN_SENDER');
    }
  });

  it('rejects a content script reporting a URL of a different origin', () => {
    const r = validateMessage({ type: 'PAGE_DETECTED', url: 'https://gitlab.com/a/b' }, content, ID);
    expect(r.ok).toBe(false);
  });

  it('rejects content messages with non-http URLs', () => {
    expect(validateMessage({ type: 'PAGE_DETECTED', url: 'javascript:alert(1)' }, content, ID).ok).toBe(false);
  });

  it('does not treat extension pages as content scripts even when opened in a tab', () => {
    const r = validateMessage({ type: 'GET_STATE' }, { ...page, tab: { id: 3 } }, ID);
    expect(r.ok && r.kind).toBe('extension-page');
  });

  it('rejects content message types from extension pages', () => {
    expect(validateMessage({ type: 'PAGE_DETECTED', url: 'https://github.com/a/b' }, page, ID).ok).toBe(false);
  });
});

describe('isBroadcastFromBackground', () => {
  it('only accepts known broadcast types from this extension without a tab', () => {
    expect(isBroadcastFromBackground({ type: 'AUTH_CHANGED' }, { id: ID, url: `chrome-extension://${ID}/background.js` }, ID)).toBe(true);
    expect(isBroadcastFromBackground({ type: 'AUTH_CHANGED' }, content, ID)).toBe(false);
    expect(isBroadcastFromBackground({ type: 'NOPE' }, { id: ID }, ID)).toBe(false);
    expect(isBroadcastFromBackground({ type: 'AUTH_CHANGED' }, { id: 'x' }, ID)).toBe(false);
  });
});
