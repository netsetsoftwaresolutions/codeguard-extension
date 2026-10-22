import { Spinner } from '../../components/primitives';
import { GitBranch, Globe, Lock, RefreshCw } from 'lucide-react';
import type { ExtensionState } from '../../shared/messages';
import { detectionLabel, isGitProvider, providerName, resolveRef, sourceKey } from '../../shared/source';
import type { SourceWorkspace } from '../hooks/useSourceWorkspace';
import { Notice, Toggle } from './common';
import { ProviderIcon } from './ProviderIcon';

export function SourceCard({
  ws,
  state,
  onToggleAutoScan,
}: {
  ws: SourceWorkspace;
  state: ExtensionState;
  onToggleAutoScan?: (enabled: boolean) => void;
}) {
  const { source, inspection, inspecting, inspectError } = ws;
  const parsed = source?.parsed ?? null;
  const label = detectionLabel(parsed);

  if (ws.sourceLoading) {
    return (
      <div className="cg-card flex items-center gap-2 text-sm text-slate-500" aria-busy="true">
        <Spinner size={14} /> Detecting current page…
      </div>
    );
  }
  if (!parsed || !parsed.supported) {
    return (
      <div className="cg-card">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Globe size={18} className="text-slate-400" aria-hidden="true" />
          Not a supported page
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Open a GitHub, GitLab or Bitbucket repository, a pull request, or a Dropbox / Google Drive shared link.
        </p>
        {parsed?.notes[0] && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{parsed.notes[0]}</p>}
      </div>
    );
  }

  const resolved = resolveRef(parsed, { branchHint: source?.branchHint, branches: inspection?.branches });
  const branch = resolved.ref ?? (parsed.kind === 'REPOSITORY' ? inspection?.defaultBranch ?? null : null);
  const name = isGitProvider(parsed) ? (parsed.projectPath ?? `${parsed.owner}/${parsed.repo}`) : parsed.label;
  const key = sourceKey(parsed);
  const autoEnabled = state.settings.autoScanAllowlist.includes(key);

  return (
    <div className="cg-card space-y-2">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 text-slate-700 dark:text-slate-200">
          <ProviderIcon provider={parsed.provider} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">{label}</div>
          <div className="truncate text-sm font-semibold" title={name}>
            {name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span>{providerName(parsed.provider)}</span>
            {parsed.pullNumber !== undefined && <span>#{parsed.pullNumber}</span>}
            {branch && (
              <span className="inline-flex items-center gap-1" title={resolved.uncertain ? 'Branch could not be confirmed from the page' : 'Current branch'}>
                <GitBranch size={12} aria-hidden="true" />
                {branch}
                {resolved.uncertain && '?'}
              </span>
            )}
            {resolved.path && (
              <span className="truncate" title={resolved.path}>
                {resolved.path}
              </span>
            )}
          </div>
        </div>
        <button type="button" className="cg-btn-ghost px-1.5" onClick={() => void ws.reinspect()} aria-label="Refresh source information" title="Refresh">
          <RefreshCw size={14} className={inspecting ? 'animate-spin' : ''} />
        </button>
      </div>

      {inspecting && !inspection && (
        <div className="flex items-center gap-2 text-xs text-slate-500" aria-busy="true">
          <Spinner size={12} /> Checking access with the {state.productName} API…
        </div>
      )}
      {inspectError && <Notice tone="error">{inspectError}</Notice>}

      {inspection && (
        <dl className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-xs dark:bg-ink-900/60">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">Visibility</dt>
            <dd className="mt-0.5 inline-flex items-center gap-1 font-medium capitalize">
              {inspection.visibility === 'public' ? <Globe size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}
              {inspection.visibility}
            </dd>
          </div>
          {isGitProvider(parsed) && (
            <>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Default branch</dt>
                <dd className="mt-0.5 truncate font-medium" title={inspection.defaultBranch ?? undefined}>
                  {inspection.defaultBranch ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Branches</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{inspection.branches ? inspection.branches.length : '—'}</dd>
              </div>
            </>
          )}
          {!isGitProvider(parsed) && (
            <div className="col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">Access</dt>
              <dd className="mt-0.5 font-medium">{inspection.accessible ? 'Accessible' : 'Not accessible'}</dd>
            </div>
          )}
        </dl>
      )}

      {inspection?.messages.map((m) => (
        <Notice key={m} tone="info">
          {m}
        </Notice>
      ))}
      {!inspection?.messages.length && parsed.notes.map((n) => (
        <Notice key={n} tone="info">
          {n}
        </Notice>
      ))}

      {onToggleAutoScan && state.settings.scanMode === 'automatic' && isGitProvider(parsed) && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-2 text-xs dark:border-ink-600">
          <label htmlFor="auto-scan-toggle" className="text-slate-600 dark:text-slate-300">
            Auto-scan this repository (public only, max once / 24h)
          </label>
          <Toggle id="auto-scan-toggle" checked={autoEnabled} onChange={onToggleAutoScan} label="Auto-scan this repository" />
        </div>
      )}
    </div>
  );
}
