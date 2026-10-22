import type { ScanCreatedResponse, ScanStage, ScanView } from '../../contracts';
import type { ReactNode } from 'react';
import { ProgressBar, ScanStatusBadge, Spinner } from '../../components/primitives';
import { ExternalLink } from 'lucide-react';
import { dashboardLink, openTab } from '../messaging';
import { useScanPolling } from '../hooks/useScanPolling';
import { Notice } from './common';
import { ScanSummary } from './ScanSummary';

export const STAGE_LABELS: Record<ScanStage, string> = {
  VALIDATING: 'Validating request',
  ACQUIRING_SOURCE: 'Downloading source',
  BUILDING_INVENTORY: 'Building file inventory',
  DETECTING_ECOSYSTEMS: 'Detecting ecosystems',
  RUNNING_ENGINES: 'Running scan engines',
  NORMALIZING: 'Normalizing findings',
  SCORING: 'Scoring risk',
  AI_ANALYSIS: 'AI analysis',
  SAVING: 'Saving results',
  DONE: 'Done',
};

export function ScanStatusPanel({
  scanId,
  created,
  dashboardUrl,
  compact,
  footer,
}: {
  scanId: string;
  created: ScanCreatedResponse | null;
  dashboardUrl: string;
  compact?: boolean;
  /** Rendered below the summary once the scan has completed (e.g. the findings list). */
  footer?: (scan: ScanView) => ReactNode;
}) {
  const { status, scan, error, terminal } = useScanPolling(scanId);
  const isGroup = !!created && created.scans.length > 1 && !!created.scanGroupId && created.scans.some((s) => s.id === scanId);
  const reportUrl = isGroup
    ? dashboardLink(dashboardUrl, `/scans/groups/${encodeURIComponent(created!.scanGroupId!)}`)
    : dashboardLink(dashboardUrl, `/scans/${encodeURIComponent(scanId)}`);

  return (
    <div className="cg-card space-y-2.5" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={scan?.sourceLabel}>
            {scan?.sourceLabel ?? 'Scan'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {scan?.type ? scan.type.replace('_', ' ').toLowerCase() : ''}
            {scan?.ref ? ` · ${scan.ref}` : ''}
            {scan?.commitSha ? ` · ${scan.commitSha.slice(0, 7)}` : ''}
          </div>
        </div>
        {status ? <ScanStatusBadge status={status.status} /> : <Spinner size={14} />}
      </div>

      {isGroup && (
        <Notice tone="info">
          {created!.scans.length} branch scans were started. Showing the first; open the comparison report for all branches.
        </Notice>
      )}

      {status && !terminal && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>{status.stage ? STAGE_LABELS[status.stage] : 'Waiting in queue'}</span>
            <span className="tabular-nums">{Math.round(status.progress)}%</span>
          </div>
          <ProgressBar value={status.progress} />
        </div>
      )}

      {status?.status === 'FAILED' && <Notice tone="error">{status.errorMessage ?? 'The scan failed.'}</Notice>}
      {status?.status === 'CANCELLED' && <Notice tone="warning">The scan was cancelled.</Notice>}
      {status?.status === 'COMPLETED_WITH_ERRORS' && status.errorMessage && <Notice tone="warning">{status.errorMessage}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {terminal && scan && (scan.status === 'COMPLETED' || scan.status === 'COMPLETED_WITH_ERRORS') && <ScanSummary scan={scan} compact={compact} />}

      <button type="button" className="cg-btn-secondary w-full" onClick={() => openTab(reportUrl)}>
        <ExternalLink size={14} aria-hidden="true" /> {isGroup ? 'Open branch comparison' : 'Open full report'}
      </button>
      {footer && terminal && scan && (scan.status === 'COMPLETED' || scan.status === 'COMPLETED_WITH_ERRORS') && footer(scan)}
    </div>
  );
}
