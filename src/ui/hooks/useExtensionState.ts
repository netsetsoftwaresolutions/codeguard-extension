import { useCallback, useEffect, useState } from 'react';
import { isBroadcastFromBackground, type ExtensionState } from '../../shared/messages';
import type { Settings } from '../../shared/settings';
import { errorMessage, send } from '../messaging';

export interface ExtensionStateApi {
  state: ExtensionState | null;
  loading: boolean;
  error: string | null;
  reload: (refresh?: boolean) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<Settings>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function applyTheme(theme: Settings['theme']): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export function useExtensionState(): ExtensionStateApi {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (refresh = true) => {
    setLoading(true);
    try {
      const s = await send({ type: 'GET_STATE', refresh });
      setState(s);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(true);
    const listener = (msg: unknown, sender: chrome.runtime.MessageSender) => {
      if (isBroadcastFromBackground(msg, sender, chrome.runtime.id) && msg.type === 'AUTH_CHANGED') void reload(false);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [reload]);

  useEffect(() => {
    if (state) applyTheme(state.settings.theme);
  }, [state?.settings.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const settings = await send({ type: 'UPDATE_SETTINGS', patch });
    setState((s) => (s ? { ...s, settings } : s));
    if (patch.apiBaseUrl !== undefined) await reload(false);
    return settings;
  }, [reload]);

  const login = useCallback(async (email: string, password: string) => {
    const s = await send({ type: 'LOGIN', email, password });
    setState(s);
  }, []);

  const logout = useCallback(async () => {
    const s = await send({ type: 'LOGOUT' });
    setState(s);
  }, []);

  return { state, loading, error, reload, updateSettings, login, logout };
}
