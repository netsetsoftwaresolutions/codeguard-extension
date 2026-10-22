import { cx } from '../../components/primitives';
import { CircleAlert, Info } from 'lucide-react';
import type { ReactNode } from 'react';

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'error' | 'warning'; children: ReactNode; className?: string }) {
  const cls =
    tone === 'error'
      ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
      : tone === 'warning'
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
        : 'border-brand-500/30 bg-brand-500/10 text-brand-700 dark:text-brand-100';
  const Icon = tone === 'info' ? Info : CircleAlert;
  return (
    <div role={tone === 'error' ? 'alert' : 'note'} className={cx('flex gap-2 rounded-lg border px-2.5 py-2 text-xs leading-relaxed', cls, className)}>
      <Icon size={14} className="mt-0.5 flex-none" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="flex items-center justify-between">
        <h2 className="cg-section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ id, checked, onChange, label, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-ink-500',
      )}
    >
      <span className={cx('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  );
}
