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
    <div className="cg-card space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-ink-700 dark:text-slate-200">
          <ProviderIcon provider={parsed.provider} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold" title={name}>
            {name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-brand-600 dark:text-brand-400">{label}</span>
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
            {inspection && (
              <span className="inline-flex items-center gap-1 capitalize">
                {inspection.visibility === 'public' ? <Globe size={12} aria-hidden="true" /> : <Lock size={12} aria-hidden="true" />}
                {inspection.visibility}
              </span>
            )}
            {inspection && isGitProvider(parsed) && inspection.branches && <span>{inspection.branches.length} branches</span>}
            {inspection && isGitProvider(parsed) && inspection.defaultBranch && inspection.defaultBranch !== branch && <span>default: {inspection.defaultBranch}</span>}
            {inspection && !isGitProvider(parsed) && <span>{inspection.accessible ? 'Accessible' : 'Not accessible'}</span>}
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
