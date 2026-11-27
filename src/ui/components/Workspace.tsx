import { Spinner } from '../../components/primitives';
import { Check, Circle, ExternalLink, PanelRight, Plug, Upload } from 'lucide-react';
import { useState } from 'react';
import { BROWSER_SCAN_ACTIONS } from '../../shared/capabilities';
import type { BrowserScanStep, ExtensionState } from '../../shared/messages';
import { dashboardLink, errorMessage, openTab, send } from '../messaging';
import { useRecentScans } from '../hooks/useRecentScans';
import { useSourceWorkspace } from '../hooks/useSourceWorkspace';
import { Notice, Section } from './common';
import { ConsentDialog } from './ConsentDialog';
import { FindingsList } from './FindingsList';
import { ScanActions } from './ScanActions';
import { ScanList } from './ScanList';
import { ScanStatusPanel } from './ScanStatusPanel';
import { SourceCard } from './SourceCard';

/** Progress of a scan whose source is read in this browser: scanned here (local) or uploaded (deep). */
function BrowserSteps({ step, productName, local }: { step: BrowserScanStep | null; productName: string; local: boolean }) {
  const steps: BrowserScanStep[] = local ? ['CHECKING_ACCESS', 'RETRIEVING', 'PREPARING', 'SCANNING', 'UPLOADING'] : ['CHECKING_ACCESS', 'RETRIEVING', 'PREPARING', 'UPLOADING'];
  const labels: Record<BrowserScanStep, string> = {
    CHECKING_ACCESS: 'Checking browser access',
    RETRIEVING: 'Retrieving source code',
    PREPARING: 'Preparing source',
    SCANNING: 'Scanning in your browser',
    UPLOADING: local ? `Sending results to ${productName}` : `Uploading to ${productName}`,
  };
  const current = step ? steps.indexOf(step) : 0;
  return (
    <ol className="mt-2 space-y-1 text-xs" aria-live="polite" aria-label="Scan preparation progress">
      {steps.map((s, i) => (
        <li key={s} className={i <= current ? 'flex items-center gap-2' : 'flex items-center gap-2 text-slate-500 dark:text-slate-400'} aria-current={i === current ? 'step' : undefined}>
          {i < current ? <Check size={12} className="text-emerald-500" aria-hidden="true" /> : i === current ? <Spinner size={12} /> : <Circle size={12} aria-hidden="true" />}
          {labels[s]}
        </li>
      ))}
    </ol>
  );
}

/** Main signed-in view shared by the popup (compact) and the side panel (with findings). */
export function Workspace({ state, variant, onStateChange }: { state: ExtensionState; variant: 'popup' | 'sidepanel'; onStateChange: () => void }) {
  const ws = useSourceWorkspace(state, { follow: variant === 'sidepanel' });
  const recent = useRecentScans(state.settings.organizationId, variant === 'popup');
  const [panelError, setPanelError] = useState<string | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const dashboardUrl = state.settings.dashboardUrl;

  const openSidePanel = () => {
    setPanelError(null);
    const tabId = ws.source?.tabId;
    // Must be called synchronously in the click handler (user gesture).
    const p = typeof tabId === 'number' ? chrome.sidePanel.open({ tabId }) : chrome.windows.getCurrent().then((w) => chrome.sidePanel.open({ windowId: w.id! }));
    p.then(() => window.close()).catch((err: unknown) => setPanelError(`Could not open the side panel: ${errorMessage(err)}`));
  };

  const toggleAuto = (enabled: boolean) => {
    if (!ws.source?.url) return;
    setAutoError(null);
    send({ type: 'SET_AUTO_SCAN', sourceUrl: ws.source.url, enabled })
      .then(onStateChange)
      .catch((err) => setAutoError(errorMessage(err)));
  };

  const compact = variant === 'popup';
  // Scans already listed under "Previous scans" are not repeated under "Recent scans".
  const listedIds = new Set(ws.previousScans.slice(0, compact ? 3 : 20).map((s) => s.id));
  const recentOthers = (recent.scans ?? []).filter((s) => !listedIds.has(s.id));
  const showActions = !!ws.source?.parsed?.supported;
  const browserMode = ws.actions.some((a) => a.browserSession);
  const isGitHub = ws.source?.parsed?.provider === 'GITHUB';
  const localRunning = !!ws.starting && isGitHub && !ws.deep && BROWSER_SCAN_ACTIONS.includes(ws.starting);
  const browserRunning = localRunning || (!!ws.starting && !!ws.actions.find((a) => a.id === ws.starting)?.browserSession);

  return (
    <main className="space-y-3 p-3">
      <SourceCard ws={ws} state={state} onToggleAutoScan={toggleAuto} />
      {autoError && <Notice tone="error">{autoError}</Notice>}

      {showActions && ws.inspection && (
        <Section title="Scan">
          {ws.actions.length ? (
            <ScanActions actions={ws.actions} onScan={ws.startScan} starting={ws.starting} disabled={!state.apiReachable} />
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">No scan options are available for this page.</p>
          )}
          {isGitHub && (
            <label className="mt-2 flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={ws.deep} onChange={(e) => ws.setDeep(e.target.checked)} disabled={!!ws.starting} />
              <span>
                <span className="font-medium">Deep scan</span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                  {ws.deep
                    ? `Sends the code to ${state.productName} to also run Semgrep, Gitleaks and history checks.`
                    : 'Off: the code is scanned in this browser and only the results are sent.'}
                </span>
              </span>
            </label>
          )}
          {browserRunning && <BrowserSteps step={ws.browserStep} productName={state.productName} local={localRunning} />}
          {browserMode && !browserRunning && (
            <>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Private repository: the code is read with your GitHub sign-in in this browser, only after you confirm.
              </p>
              <button type="button" className="cg-btn-secondary mt-1.5 w-full justify-start" onClick={() => openTab(dashboardLink(dashboardUrl, '/integrations'))}>
                <Plug size={14} aria-hidden="true" /> Connect GitHub integration (optional)
              </button>
            </>
          )}
          {state.settings.enableAi && <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">AI explanations are enabled for new scans.</p>}
        </Section>
      )}
      {ws.scanError && <Notice tone="error">{ws.scanError}</Notice>}

      {ws.activeScanId && (
        <Section title={ws.created ? 'Current scan' : 'Latest scan of this source'}>
          <ScanStatusPanel
            key={ws.activeScanId}
            scanId={ws.activeScanId}
            created={ws.created}
            dashboardUrl={dashboardUrl}
            compact={compact}
            footer={variant === 'sidepanel' ? (scan) => (
              <div className="border-t border-slate-200 pt-2.5 dark:border-ink-600">
                <h3 className="cg-section-title">Findings</h3>
                <FindingsList scanId={scan.id} dashboardUrl={dashboardUrl} />
              </div>
            ) : undefined}
          />
        </Section>
      )}

      <div className="flex gap-2">
        <button type="button" className="cg-btn-secondary flex-1" onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('upload.html') })}>
          <Upload size={14} aria-hidden="true" /> {compact ? 'Upload' : 'Upload source code'}
        </button>
        {compact && (
          <>
            <button type="button" className="cg-btn-secondary flex-1" onClick={openSidePanel}>
              <PanelRight size={14} aria-hidden="true" /> Side panel
            </button>
            <button type="button" className="cg-btn-secondary flex-1" onClick={() => openTab(dashboardLink(dashboardUrl, '/'))}>
              <ExternalLink size={14} aria-hidden="true" /> Dashboard
            </button>
          </>
        )}
      </div>
      {panelError && <Notice tone="error">{panelError}</Notice>}

      {ws.inspection && (
        <Section title="Previous scans of this source">
          <ScanList
            scans={ws.previousScans.slice(0, compact ? 3 : 20)}
            selectedId={ws.activeScanId}
            onSelect={(s) => ws.selectScan(s.id)}
            emptyText="This source has not been scanned yet."
          />
        </Section>
      )}

      {compact && (recent.error || recent.loading || !recent.scans || recent.scans.length === 0 || recentOthers.length > 0) && (
        <Section title="Recent scans" action={recent.loading ? <Spinner size={12} /> : undefined}>
          {recent.error ? (
            <Notice tone="error">{recent.error}</Notice>
          ) : recent.scans ? (
            <ScanList
              scans={recentOthers}
              onSelect={(s) => openTab(dashboardLink(dashboardUrl, `/scans/${encodeURIComponent(s.id)}`))}
              emptyText="No scans in this organization yet."
            />
          ) : null}
        </Section>
      )}

      <ConsentDialog
        open={!!ws.consentFor}
        apiBaseUrl={state.settings.apiBaseUrl}
        productName={state.productName}
        sourceLabel={ws.source?.parsed?.label ?? ''}
        visibility={ws.inspection?.visibility}
        onAccept={ws.acceptConsent}
        onCancel={ws.declineConsent}
        busy={!!ws.starting}
        browserSession={!!ws.consentFor?.browserSession}
      />
    </main>
  );
}
