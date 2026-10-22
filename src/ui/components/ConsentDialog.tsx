import { Lock } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { consentText } from '../../shared/consent';

export function ConsentDialog({
  open,
  apiBaseUrl,
  productName,
  sourceLabel,
  visibility,
  onAccept,
  onCancel,
  busy,
}: {
  open: boolean;
  apiBaseUrl: string;
  productName: string;
  sourceLabel: string;
  visibility: 'public' | 'private' | 'unknown' | undefined;
  onAccept: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const acceptRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) acceptRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  let host = apiBaseUrl;
  try {
    host = new URL(apiBaseUrl).host;
  } catch {
    // keep raw
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="consent-body" className="cg-card w-full max-w-sm shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          <Lock size={16} className="text-amber-500" aria-hidden="true" />
          <h2 id="consent-title" className="text-sm font-semibold">
            Confirm scan of a {visibility === 'private' ? 'private' : 'non-public'} source
          </h2>
        </div>
        <p className="mb-1 truncate text-xs font-medium text-slate-600 dark:text-slate-300" title={sourceLabel}>
          {sourceLabel}
        </p>
        <p id="consent-body" className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          {consentText(host, productName)}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="cg-btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button ref={acceptRef} type="button" className="cg-btn-primary" onClick={onAccept} disabled={busy}>
            I agree, scan
          </button>
        </div>
      </div>
    </div>
  );
}
