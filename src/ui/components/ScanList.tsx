import type { ScanView } from '../../contracts';
import { cx, formatRelativeTime, ScanStatusBadge } from '../../components/primitives';
import { scanVerdict, TONE_DOTS } from './ScanSummary';

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
              <span className="flex-none text-[11px] text-slate-500 dark:text-slate-400">{formatRelativeTime(s.createdAt)}</span>
            </div>
            {s.status === 'COMPLETED' && s.summary ? (
              <ScanVerdictLine summary={s.summary} />
            ) : (
              <span className="self-start">
                <ScanStatusBadge status={s.status} />
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ScanVerdictLine({ summary }: { summary: NonNullable<ScanView['summary']> }) {
  const v = scanVerdict(summary);
  const n = summary.totalFindings;
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
      <span className={cx('h-2 w-2 flex-none rounded-full', TONE_DOTS[v.tone])} aria-hidden="true" />
      <span className={cx(v.malware && 'font-semibold text-red-600 dark:text-red-400')}>{v.title}</span>
      {n > 0 && <span className="text-slate-500 dark:text-slate-400">· {n} issue{n === 1 ? '' : 's'}</span>}
    </span>
  );
}
