import type { ScanCreatedResponse, SourceInspection } from '../../contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getScanActions, type ScanAction } from '../../shared/capabilities';
import type { ExtensionState } from '../../shared/messages';
import { UiError, errorMessage, send } from '../messaging';
import { useActiveSource } from './useActiveSource';

/**
 * Everything the popup and side panel need for the current page: detection, server inspection,
 * scan actions (from capabilities), starting scans with the consent flow, and the active scan.
 */
export function useSourceWorkspace(state: ExtensionState, opts: { follow: boolean }) {
  const { source, loading: sourceLoading, error: sourceError, refresh: refreshSource } = useActiveSource(opts.follow);
  const [inspection, setInspection] = useState<SourceInspection | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [created, setCreated] = useState<ScanCreatedResponse | null>(null);
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const [starting, setStarting] = useState<ScanAction['id'] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [consentFor, setConsentFor] = useState<ScanAction | null>(null);

  const orgId = state.settings.organizationId;
  const signedIn = state.auth.signedIn;
  const url = source?.parsed?.supported ? source.url : null;

  const inspect = useCallback(async () => {
    if (!url || !signedIn || !orgId) {
      setInspection(null);
      return;
    }
    setInspecting(true);
    setInspectError(null);
    try {
      setInspection(await send({ type: 'INSPECT_SOURCE', url }));
    } catch (err) {
      setInspection(null);
      setInspectError(errorMessage(err));
    } finally {
      setInspecting(false);
    }
  }, [url, signedIn, orgId]);

  useEffect(() => {
    setCreated(null);
    setSelectedScanId(null);
    setScanError(null);
    void inspect();
  }, [inspect]);

  const actions = useMemo(
    () => (source?.parsed && inspection ? getScanActions(source.parsed, inspection, { branchHint: source.branchHint }) : []),
    [source, inspection],
  );

  const run = useCallback(
    async (action: ScanAction, consent: boolean) => {
      if (!source?.url) return;
      setStarting(action.id);
      setScanError(null);
      try {
        const res = await send({
          type: 'START_SCAN',
          request: { action: action.id, sourceUrl: source.url, ref: action.ref ?? null, path: action.path ?? null, consent, tabId: source.tabId },
        });
        setCreated(res);
        setSelectedScanId(res.scans[0]?.id ?? null);
        setConsentFor(null);
      } catch (err) {
        if (err instanceof UiError && err.code === 'CONSENT_REQUIRED') {
          setConsentFor(action);
        } else {
          setScanError(errorMessage(err));
          setConsentFor(null);
        }
      } finally {
        setStarting(null);
      }
    },
    [source],
  );

  /**
   * Starts a scan. The request is sent without consent; for a private / unknown-visibility source
   * that has no stored consent the background refuses with CONSENT_REQUIRED (nothing is downloaded)
   * and the consent dialog is shown. Only after acceptance is the request repeated with consent: true.
   */
  const startScan = useCallback((action: ScanAction) => void run(action, false), [run]);

  const acceptConsent = useCallback(() => {
    if (consentFor) void run(consentFor, true);
  }, [consentFor, run]);
  const declineConsent = useCallback(() => setConsentFor(null), []);

  const previousScans = inspection?.previousScans ?? [];
  const activeScanId = selectedScanId ?? previousScans[0]?.id ?? null;

  return {
    source,
    sourceLoading,
    sourceError,
    refreshSource,
    inspection,
    inspecting,
    inspectError,
    reinspect: inspect,
    actions,
    startScan,
    starting,
    scanError,
    consentFor,
    acceptConsent,
    declineConsent,
    created,
    activeScanId,
    selectScan: setSelectedScanId,
    previousScans,
  };
}

export type SourceWorkspace = ReturnType<typeof useSourceWorkspace>;
