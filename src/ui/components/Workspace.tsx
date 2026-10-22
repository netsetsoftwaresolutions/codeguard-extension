import { Spinner } from '../../components/primitives';
import { ExternalLink, PanelRight } from 'lucide-react';
import { useState } from 'react';
import type { ExtensionState } from '../../shared/messages';
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
  const showActions = !!ws.source?.parsed?.supported;

  return (
    <main className="space-y-3 p-3">
      <button type="button" className="cg-btn-secondary w-full" onClick={() => void chrome.tabs.create({ url: chrome.runtime.getURL('upload.html') })}>
        Upload source code
      </button>
      <SourceCard ws={ws} state={state} onToggleAutoScan={toggleAuto} />
      {autoError && <Notice tone="error">{autoError}</Notice>}

      {showActions && ws.inspection && (
        <Section title="Scan">
          {ws.actions.length ? (
            <ScanActions actions={ws.actions} onScan={ws.startScan} starting={ws.starting} disabled={!state.apiReachable} />
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">No scan options are available for this page.</p>
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

      {compact && (
        <div className="flex gap-2">
          <button type="button" className="cg-btn-secondary flex-1" onClick={openSidePanel}>
            <PanelRight size={14} aria-hidden="true" /> Open side panel
          </button>
          <button type="button" className="cg-btn-ghost" onClick={() => openTab(dashboardLink(dashboardUrl, '/'))}>
            <ExternalLink size={14} aria-hidden="true" /> Dashboard
          </button>
        </div>
      )}
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

      {compact && (
        <Section title="Recent scans" action={recent.loading ? <Spinner size={12} /> : undefined}>
          {recent.error ? (
            <Notice tone="error">{recent.error}</Notice>
          ) : recent.scans ? (
            <ScanList
              scans={recent.scans}
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
      />
    </main>
  );
}
