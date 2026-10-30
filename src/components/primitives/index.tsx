import type { FindingClassification, FindingStatus, RiskLevel, ScanStatus, Severity, SeverityCounts } from '../../contracts';
import { SEVERITIES } from '../../contracts';
import type { ReactNode } from 'react';

/** Shared presentational components used by the dashboard and the Chrome extension. */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export const SEVERITY_STYLES: Record<Severity, { label: string; badge: string; dot: string; text: string }> = {
  CRITICAL: { label: 'Critical', badge: 'bg-red-600/15 text-red-600 ring-red-600/30 dark:text-red-400', dot: 'bg-red-600', text: 'text-red-600 dark:text-red-400' },
  HIGH: { label: 'High', badge: 'bg-orange-500/15 text-orange-600 ring-orange-500/30 dark:text-orange-400', dot: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400' },
  MEDIUM: { label: 'Medium', badge: 'bg-yellow-500/15 text-yellow-700 ring-yellow-500/30 dark:text-yellow-300', dot: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-300' },
  LOW: { label: 'Low', badge: 'bg-blue-600/15 text-blue-700 ring-blue-600/30 dark:text-blue-300', dot: 'bg-blue-600', text: 'text-blue-700 dark:text-blue-300' },
  INFO: { label: 'Info', badge: 'bg-slate-500/15 text-slate-600 ring-slate-500/30 dark:text-slate-300', dot: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-300' },
};

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const s = SEVERITY_STYLES[severity];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', s.badge, className)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden="true" />
      {s.label}
    </span>
  );
}

const RISK_STYLES: Record<RiskLevel, { label: string; cls: string }> = {
  CRITICAL: { label: 'Critical risk', cls: 'bg-red-600 text-white' },
  HIGH: { label: 'High risk', cls: 'bg-orange-500 text-white' },
  ELEVATED: { label: 'Elevated risk', cls: 'bg-yellow-500 text-slate-900' },
  LOW: { label: 'Low risk', cls: 'bg-blue-600 text-white' },
  MINIMAL: { label: 'No significant findings', cls: 'bg-green-600 text-white' },
};

export function RiskBadge({ level, score, className }: { level: RiskLevel; score?: number; className?: string }) {
  const r = RISK_STYLES[level];
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', r.cls, className)} title="Risk score is an additive, explainable measure — not a probability that the code is safe.">
      {r.label}
      {score !== undefined && (
        <>
          <span className="opacity-60" aria-hidden="true">·</span>
          <span className="tabular-nums">{score}/100</span>
        </>
      )}
    </span>
  );
}

const CLASSIFICATION_STYLES: Record<FindingClassification, { label: string; cls: string; help: string }> = {
  CONFIRMED: { label: 'Confirmed', cls: 'bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300', help: 'Deterministic evidence: advisory match or provider-specific secret format.' },
  SUSPICIOUS: { label: 'Suspicious', cls: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300', help: 'Heuristic indicator that requires human review.' },
  FALSE_POSITIVE_CANDIDATE: { label: 'Possible false positive', cls: 'bg-slate-500/10 text-slate-600 ring-slate-500/20 dark:text-slate-300', help: 'Matched in tests, docs, examples or comments.' },
};

export function ClassificationBadge({ classification }: { classification: FindingClassification }) {
  const c = CLASSIFICATION_STYLES[classification];
  return (
    <span title={c.help} className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', c.cls)}>
      {c.label}
    </span>
  );
}

const STATUS_LABELS: Record<FindingStatus, string> = {
  OPEN: 'Open',
  UNDER_REVIEW: 'Under review',
  CONFIRMED: 'Confirmed',
  FALSE_POSITIVE: 'False positive',
  ACCEPTED_RISK: 'Accepted risk',
  RESOLVED: 'Resolved',
};

export function findingStatusLabel(s: FindingStatus): string {
  return STATUS_LABELS[s];
}

export function FindingStatusBadge({ status }: { status: FindingStatus }) {
  const cls =
    status === 'RESOLVED' ? 'text-green-700 bg-green-500/10 dark:text-green-300'
      : status === 'FALSE_POSITIVE' || status === 'ACCEPTED_RISK' ? 'text-slate-600 bg-slate-500/10 dark:text-slate-300'
      : status === 'CONFIRMED' ? 'text-red-700 bg-red-500/10 dark:text-red-300'
      : 'text-blue-700 bg-blue-500/10 dark:text-blue-300';
  return <span className={cx('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', cls)}>{STATUS_LABELS[status]}</span>;
}

const SCAN_STATUS: Record<ScanStatus, { label: string; cls: string }> = {
  QUEUED: { label: 'Queued', cls: 'text-slate-600 bg-slate-500/10 dark:text-slate-300' },
  RUNNING: { label: 'Running', cls: 'text-blue-700 bg-blue-500/10 dark:text-blue-300' },
  COMPLETED: { label: 'Completed', cls: 'text-green-700 bg-green-500/10 dark:text-green-300' },
  COMPLETED_WITH_ERRORS: { label: 'Completed with gaps', cls: 'text-amber-700 bg-amber-500/10 dark:text-amber-300' },
  FAILED: { label: 'Failed', cls: 'text-red-700 bg-red-500/10 dark:text-red-300' },
  CANCELLED: { label: 'Cancelled', cls: 'text-slate-600 bg-slate-500/10 dark:text-slate-300' },
};

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const s = SCAN_STATUS[status];
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', s.cls)}>{status === 'RUNNING' && <Spinner size={10} />}{s.label}</span>;
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" role="status" aria-label="Loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-ink-600', className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand-600 transition-all duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

export function SeverityBar({ counts, className }: { counts: SeverityCounts; className?: string }) {
  const total = SEVERITIES.reduce((s, k) => s + (counts[k] ?? 0), 0);
  if (!total) return <div className={cx('h-2 w-full rounded-full bg-green-500/30', className)} title="No findings" />;
  return (
    <div className={cx('flex h-2 w-full overflow-hidden rounded-full', className)} title={SEVERITIES.map((s) => `${SEVERITY_STYLES[s].label}: ${counts[s] ?? 0}`).join(', ')}>
      {SEVERITIES.map((s) => (counts[s] ? <div key={s} className={SEVERITY_STYLES[s].dot} style={{ width: `${(counts[s] / total) * 100}%` }} /> : null))}
    </div>
  );
}

export function SeverityCountsRow({ counts, compact }: { counts: SeverityCounts; compact?: boolean }) {
  return (
    <div className={cx('flex gap-x-3 gap-y-1', compact ? 'flex-nowrap' : 'flex-wrap')}>
      {SEVERITIES.map((s) => (
        <span
          key={s}
          className={cx('inline-flex items-center gap-1.5 text-xs font-medium tabular-nums text-slate-700 dark:text-slate-300', !counts[s] && 'opacity-40')}
          title={compact ? SEVERITY_STYLES[s].label : undefined}
        >
          <span className={cx('h-1.5 w-1.5 rounded-full', SEVERITY_STYLES[s].dot)} aria-hidden="true" />
          {counts[s] ?? 0}
          <span className={compact ? 'sr-only' : 'text-slate-500 dark:text-slate-400'}>{SEVERITY_STYLES[s].label}</span>
        </span>
      ))}
    </div>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-ink-500">
      {icon && <div className="mb-3 text-slate-400">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ShieldLogo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 2 4 6.5v8.2c0 7.4 5.1 13.6 12 15.3 6.9-1.7 12-7.9 12-15.3V6.5L16 2Z" fill="#2563EB" />
      <path d="m11 16.2 3.4 3.4L21.5 12" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function emptySeverityCounts(): SeverityCounts {
  return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
}
