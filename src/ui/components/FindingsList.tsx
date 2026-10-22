import { compareSeverity, SEVERITIES, type FindingView, type Severity } from '../../contracts';
import { ClassificationBadge, cx, EmptyState, SEVERITY_STYLES, SeverityBadge, Spinner } from '../../components/primitives';
import { ExternalLink, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { dashboardLink, errorMessage, openTab, send } from '../messaging';
import { Notice } from './common';
import { categoryLabel } from './ScanSummary';

export function groupBySeverity(findings: FindingView[]): [Severity, FindingView[]][] {
  const sorted = [...findings].sort((a, b) => compareSeverity(a.severity, b.severity));
  return SEVERITIES.map((s) => [s, sorted.filter((f) => f.severity === s)] as [Severity, FindingView[]]).filter(([, list]) => list.length > 0);
}

function location(f: FindingView): string | null {
  if (!f.filePath) return f.packageName ? `${f.packageName}${f.packageVersion ? `@${f.packageVersion}` : ''}` : null;
  return f.startLine ? `${f.filePath}:${f.startLine}` : f.filePath;
}

export function FindingItem({ finding, dashboardUrl }: { finding: FindingView; dashboardUrl: string }) {
  const loc = location(finding);
  return (
    <li className="cg-card p-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-col gap-1 p-2.5 [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={finding.severity} />
            <ClassificationBadge classification={finding.classification} />
            {finding.introducedInChange && <span className="rounded-md bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:text-brand-100">New in change</span>}
          </div>
          <div className="text-sm font-medium leading-snug">{finding.title}</div>
          {loc && <div className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400" title={loc}>{loc}</div>}
        </summary>
        <div className="space-y-2 border-t border-slate-200 p-2.5 text-xs dark:border-ink-600">
          <p className="text-slate-500 dark:text-slate-400">
            {categoryLabel(finding.category)} · {finding.engine} · confidence {finding.confidence.toLowerCase()}
          </p>
          {finding.description && <p className="leading-relaxed text-slate-700 dark:text-slate-200">{finding.description}</p>}
          {finding.maskedEvidence && (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-2 font-mono text-[11px] leading-relaxed text-slate-100 dark:bg-black/40" aria-label="Masked evidence">
              {finding.maskedEvidence}
            </pre>
          )}
          {finding.recommendation && (
            <div>
              <h4 className="mb-0.5 inline-flex items-center gap-1 font-semibold">
                <Wrench size={12} aria-hidden="true" /> How to fix
              </h4>
              <p className="leading-relaxed text-slate-700 dark:text-slate-200">{finding.recommendation}</p>
              {finding.fixedVersions.length > 0 && <p className="mt-0.5 text-slate-500 dark:text-slate-400">Fixed in: {finding.fixedVersions.join(', ')}</p>}
            </div>
          )}
          {finding.falsePositiveGuidance && <p className="text-slate-500 dark:text-slate-400">False-positive guidance: {finding.falsePositiveGuidance}</p>}
          {finding.aiExplanation && (
            <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-2">
              <h4 className="mb-0.5 inline-flex items-center gap-1 font-semibold text-violet-700 dark:text-violet-300">
                <Sparkles size={12} aria-hidden="true" /> AI explanation — verify before acting
              </h4>
              <p className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-200">{finding.aiExplanation}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {finding.sourceLink && (
              <button type="button" className="cg-btn-secondary px-2 py-1 text-xs" onClick={() => openTab(finding.sourceLink!)}>
                <ExternalLink size={12} aria-hidden="true" /> View source line
              </button>
            )}
            <button
              type="button"
              className="cg-btn-ghost px-2 py-1 text-xs"
              onClick={() => openTab(dashboardLink(dashboardUrl, `/scans/${encodeURIComponent(finding.scanId)}?finding=${encodeURIComponent(finding.id)}`))}
            >
              <ExternalLink size={12} aria-hidden="true" /> Open in report
            </button>
          </div>
        </div>
      </details>
    </li>
  );
}

export function FindingsList({ scanId, dashboardUrl }: { scanId: string; dashboardUrl: string }) {
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [findings, setFindings] = useState<FindingView[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    send({ type: 'GET_FINDINGS', scanId, severity })
      .then((page) => {
        if (cancelled) return;
        setFindings(page.items);
        setTotal(page.total);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [scanId, severity]);

  const groups = useMemo(() => groupBySeverity(findings ?? []), [findings]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by severity">
        {[null, ...SEVERITIES].map((s) => (
          <button
            key={s ?? 'all'}
            type="button"
            aria-pressed={severity === s}
            onClick={() => setSeverity(s)}
            className={cx(
              'rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
              severity === s ? 'bg-brand-600 text-white ring-brand-600' : 'ring-slate-300 hover:bg-slate-100 dark:ring-ink-500 dark:hover:bg-ink-700',
            )}
          >
            {s ? SEVERITY_STYLES[s].label : 'All'}
          </button>
        ))}
      </div>
      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500" aria-busy="true">
          <Spinner size={12} /> Loading findings…
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {!loading && !error && findings && findings.length === 0 && (
        <EmptyState
          icon={<ShieldCheck size={24} />}
          title={severity ? `No ${SEVERITY_STYLES[severity].label.toLowerCase()} findings` : 'No findings'}
          description="Nothing was detected by the enabled engines. This does not guarantee the code is safe — check coverage limitations."
        />
      )}
      {!loading && groups.map(([sev, list]) => (
        <section key={sev} aria-label={`${SEVERITY_STYLES[sev].label} findings`}>
          <h3 className={cx('mb-1 text-xs font-semibold', SEVERITY_STYLES[sev].text)}>
            {SEVERITY_STYLES[sev].label} · {list.length}
          </h3>
          <ul className="space-y-1.5">
            {list.map((f) => (
              <FindingItem key={f.id} finding={f} dashboardUrl={dashboardUrl} />
            ))}
          </ul>
        </section>
      ))}
      {!loading && findings && total > findings.length && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Showing {findings.length} of {total} findings.{' '}
          <button type="button" className="text-brand-600 hover:underline dark:text-brand-400" onClick={() => openTab(dashboardLink(dashboardUrl, `/scans/${encodeURIComponent(scanId)}`))}>
            Open the full report
          </button>{' '}
          for the rest.
        </p>
      )}
    </div>
  );
}
