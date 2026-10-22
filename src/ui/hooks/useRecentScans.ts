import type { ScanView } from '../../contracts';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage, send } from '../messaging';

export function useRecentScans(organizationId: string | null, enabled: boolean) {
  const [scans, setScans] = useState<ScanView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!organizationId || !enabled) return;
    setLoading(true);
    try {
      const page = await send({ type: 'LIST_RECENT_SCANS' });
      setScans(page.items);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [organizationId, enabled]);

  useEffect(() => {
    setScans(null);
    void refresh();
  }, [refresh]);

  return { scans, error, loading, refresh };
}
