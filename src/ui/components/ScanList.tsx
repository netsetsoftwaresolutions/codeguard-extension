import type { ScanView } from '../../contracts';
import { cx, formatRelativeTime, ScanStatusBadge, SeverityCountsRow } from '../../components/primitives';

export function ScanList({
  scans,
  selectedId,
  onSelect,
  emptyText,
}: {
  scans: ScanView[];
  selectedId?: string | null;
  onSelect: (s: ScanView) => void;
  emptyText: string;
}) {
  if (!scans.length) return <p className="px-1 text-xs text-slate-500 dark:text-slate-400">{emptyText}</p>;
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-ink-600 dark:border-ink-600">
      {scans.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onSelect(s)}
            aria-current={selectedId === s.id ? 'true' : undefined}
            className={cx(
              'flex w-full flex-col gap-1 bg-white px-3 py-2 text-left hover:bg-slate-50 dark:bg-ink-800 dark:hover:bg-ink-700',
              selectedId === s.id && 'ring-2 ring-inset ring-brand-500',
            )}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="truncate text-xs font-medium" title={s.sourceLabel}>
                {s.sourceLabel}
                {s.ref ? <span className="text-slate-500 dark:text-slate-400"> · {s.ref}</span> : null}
              </span>
              <ScanStatusBadge status={s.status} />
            </div>
            <div className="flex w-full items-center justify-between gap-2">
              {s.summary ? <SeverityCountsRow counts={s.summary.severityCounts} compact /> : <span className="text-[11px] text-slate-500">{s.type.toLowerCase()}</span>}
              <span className="flex-none text-[11px] text-slate-500 dark:text-slate-400">{formatRelativeTime(s.createdAt)}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
