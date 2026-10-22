import { useCallback, useEffect, useState } from 'react';
import { isBroadcastFromBackground, type ActiveSource } from '../../shared/messages';
import { errorMessage, send } from '../messaging';

/**
 * The source shown in the current tab. `follow` keeps it in sync with tab switches and SPA
 * navigation (side panel); the popup reads it once.
 */
export function useActiveSource(follow: boolean) {
  const [source, setSource] = useState<ActiveSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSource(await send({ type: 'GET_ACTIVE_SOURCE' }));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    if (!follow) return;
    const onActivated = () => void refresh();
    const onUpdated = (_id: number, info: chrome.tabs.OnUpdatedInfo) => {
      if (info.status === 'complete') void refresh();
    };
    const onMessage = (msg: unknown, sender: chrome.runtime.MessageSender) => {
      if (isBroadcastFromBackground(msg, sender, chrome.runtime.id) && msg.type === 'SOURCE_CHANGED') void refresh();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [follow, refresh]);

  return { source, loading, error, refresh };
}
