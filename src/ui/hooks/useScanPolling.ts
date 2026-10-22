import { TERMINAL_SCAN_STATUSES, type ScanView } from '../../contracts';
import { useEffect, useState } from 'react';
import { STATUS_POLL_INTERVAL_MS } from '../../shared/constants';
import type { ScanStatusView } from '../../shared/messages';
import { errorMessage, send } from '../messaging';

/** Polls `GET /scans/:id/status` every 2s until terminal, then loads the full scan with summary. */
export function useScanPolling(scanId: string | null) {
  const [status, setStatus] = useState<ScanStatusView | null>(null);
  const [scan, setScan] = useState<ScanView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(null);
    setScan(null);
    setError(null);
    if (!scanId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const loadScan = async () => {
      const s = await send({ type: 'GET_SCAN', scanId });
      if (!cancelled) setScan(s);
      return s;
    };

    const poll = async () => {
      try {
        const st = await send({ type: 'GET_SCAN_STATUS', scanId });
        if (cancelled) return;
        setStatus(st);
        setError(null);
        if (TERMINAL_SCAN_STATUSES.includes(st.status)) {
          await loadScan();
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setError(errorMessage(err));
      }
      if (!cancelled) timer = setTimeout(() => void poll(), STATUS_POLL_INTERVAL_MS);
    };

    void (async () => {
      try {
        const s = await loadScan();
        if (cancelled) return;
        if (TERMINAL_SCAN_STATUSES.includes(s.status)) {
          setStatus({ id: s.id, status: s.status, stage: s.stage, progress: s.progress, errorMessage: s.errorMessage });
          return;
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
      void poll();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [scanId]);

  const terminal = !!status && TERMINAL_SCAN_STATUSES.includes(status.status);
  return { status, scan, error, terminal };
}
