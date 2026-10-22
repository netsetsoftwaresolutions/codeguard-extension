import { Spinner } from '../../components/primitives';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { ExtensionState } from '../../shared/messages';
import { isDefaultApiOrigin, normalizeBaseUrl, originPatternFor, type ScanMode, type Settings } from '../../shared/settings';
import { errorMessage } from '../messaging';
import { Notice, Section, Toggle } from './common';

export function SettingsView({
  state,
  onUpdate,
}: {
  state: ExtensionState;
  onUpdate: (patch: Partial<Settings>) => Promise<Settings>;
}) {
  const { settings, productName } = state;
  const [apiUrl, setApiUrl] = useState(settings.apiBaseUrl);
  const [dashUrl, setDashUrl] = useState(settings.dashboardUrl);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const apply = async (patch: Partial<Settings>, okText?: string) => {
    setMessage(null);
    try {
      await onUpdate(patch);
      if (okText) setMessage({ tone: 'info', text: okText });
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    }
  };

  const saveUrls = (e: FormEvent) => {
    e.preventDefault();
    const api = normalizeBaseUrl(apiUrl);
    const dash = normalizeBaseUrl(dashUrl);
    if (!api || !dash) {
      setMessage({ tone: 'error', text: 'URLs must use https:// (http:// is only allowed for localhost) and contain no credentials, query or fragment.' });
      return;
    }
    const apiChanged = api !== settings.apiBaseUrl;
    // chrome.permissions.request must run synchronously within the click (user gesture).
    const pattern = apiChanged && !isDefaultApiOrigin(api) ? originPatternFor(api) : null;
    const granted: Promise<boolean> = pattern ? chrome.permissions.request({ origins: [pattern] }) : Promise.resolve(true);
    setSaving(true);
    void granted
      .then(async (ok) => {
        if (!ok) {
          setMessage({ tone: 'error', text: `Permission to access ${pattern} was denied; the API URL was not changed.` });
          return;
        }
        await apply({ apiBaseUrl: api, dashboardUrl: dash }, apiChanged ? 'Saved. You were signed out because the API changed.' : 'Saved.');
      })
      .catch((err) => setMessage({ tone: 'error', text: errorMessage(err) }))
      .finally(() => setSaving(false));
  };

  return (
    <div className="space-y-4 p-3">
      <Section title="Connection">
        <form className="cg-card space-y-2" onSubmit={saveUrls}>
          <div>
            <label className="cg-label" htmlFor="api-url">
              API base URL
            </label>
            <input id="api-url" className="cg-input font-mono text-xs" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} spellCheck={false} />
          </div>
          <div>
            <label className="cg-label" htmlFor="dash-url">
              Dashboard URL
            </label>
            <input id="dash-url" className="cg-input font-mono text-xs" value={dashUrl} onChange={(e) => setDashUrl(e.target.value)} spellCheck={false} />
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Changing the API URL asks Chrome for permission to that host and signs you out. The API must allow this extension's origin (CORS).
          </p>
          <button type="submit" className="cg-btn-primary" disabled={saving}>
            {saving && <Spinner size={12} />} Save
          </button>
        </form>
      </Section>

      <Section title="Scan mode">
        <fieldset className="cg-card space-y-2">
          <legend className="sr-only">Scan mode</legend>
          {(['manual', 'automatic'] as ScanMode[]).map((mode) => (
            <label key={mode} className="flex items-start gap-2 text-sm">
              <input type="radio" name="scan-mode" className="mt-1 accent-brand-600" checked={settings.scanMode === mode} onChange={() => void apply({ scanMode: mode })} />
              <span>
                <span className="font-medium capitalize">{mode}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {mode === 'manual'
                    ? 'Scans start only when you click a scan button.'
                    : 'Repositories you approve are scanned when you visit them — public repositories only, at most once every 24 hours.'}
                </span>
              </span>
            </label>
          ))}
          {settings.scanMode === 'automatic' && (
            <div className="border-t border-slate-200 pt-2 dark:border-ink-600">
              <h3 className="mb-1 text-xs font-medium">Approved repositories</h3>
              {settings.autoScanAllowlist.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">None yet. Open a repository and enable “Auto-scan this repository”.</p>
              ) : (
                <ul className="space-y-1">
                  {settings.autoScanAllowlist.map((u) => (
                    <li key={u} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-mono" title={u}>
                        {u.replace(/^https:\/\//, '')}
                      </span>
                      <button
                        type="button"
                        className="cg-btn-ghost px-1 py-0.5"
                        aria-label={`Remove ${u} from automatic scanning`}
                        onClick={() => void apply({ autoScanAllowlist: settings.autoScanAllowlist.filter((x) => x !== u) })}
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </fieldset>
      </Section>

      <Section title="AI assistance">
        <div className="cg-card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="ai-toggle" className="text-sm font-medium">
              Enable AI explanations
            </label>
            <Toggle id="ai-toggle" checked={settings.enableAi} onChange={(v) => void apply({ enableAi: v })} label="Enable AI explanations" />
          </div>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            When enabled, masked snippets of non-secret findings are sent to the AI provider configured on the {productName} server. Secrets are never sent.
            {state.meta && !state.meta.features.ai && ' AI is not configured on this server, so this setting currently has no effect.'}
          </p>
        </div>
      </Section>

      <Section title="Page button">
        <div className="cg-card flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-600 dark:text-slate-300">
            Hidden on: {settings.dismissedSites.length ? settings.dismissedSites.join(', ') : 'no sites'}
          </span>
          {settings.dismissedSites.length > 0 && (
            <button type="button" className="cg-btn-secondary px-2 py-1 text-xs" onClick={() => void apply({ dismissedSites: [] }, 'The page button will show again.')}>
              Reset
            </button>
          )}
        </div>
      </Section>

      {message && (
        <Notice tone={message.tone} className="sticky bottom-2">
          {message.text}
        </Notice>
      )}
    </div>
  );
}
