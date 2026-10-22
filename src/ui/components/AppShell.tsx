import { Spinner } from '../../components/primitives';
import { RefreshCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { ExtensionState } from '../../shared/messages';
import { errorMessage } from '../messaging';
import { useExtensionState, type ExtensionStateApi } from '../hooks/useExtensionState';
import { Header } from './Header';
import { LoginForm } from './LoginForm';
import { SettingsView } from './SettingsView';
import { Notice } from './common';

/**
 * Shared frame for popup and side panel: loading, background errors, API-unreachable banner,
 * signed-out (login) state, settings view, and the signed-in content.
 */
export function AppShell({ children }: { children: (state: ExtensionState, api: ExtensionStateApi) => ReactNode }) {
  const ext = useExtensionState();
  const [view, setView] = useState<'main' | 'settings'>('main');
  const [actionError, setActionError] = useState<string | null>(null);
  const { state, loading, error } = ext;

  if (!state) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-sm text-slate-500" aria-busy={loading}>
        {loading ? (
          <>
            <Spinner size={20} /> Loading…
          </>
        ) : (
          <>
            <Notice tone="error">{error ?? 'The extension could not load its state.'}</Notice>
            <button type="button" className="cg-btn-secondary" onClick={() => void ext.reload(true)}>
              Retry
            </button>
          </>
        )}
      </div>
    );
  }

  const run = (p: Promise<unknown>) => {
    setActionError(null);
    p.catch((err) => setActionError(errorMessage(err)));
  };

  return (
    <div className="flex min-h-full flex-col">
      <Header
        state={state}
        onToggleTheme={() => run(ext.updateSettings({ theme: state.settings.theme === 'dark' ? 'light' : 'dark' }))}
        onOpenSettings={view === 'main' ? () => setView('settings') : undefined}
        onBack={view === 'settings' ? () => setView('main') : undefined}
        onLogout={() => run(ext.logout())}
        onSelectOrg={(id) => run(ext.updateSettings({ organizationId: id }))}
      />
      {!state.apiReachable && (
        <div className="px-3 pt-3">
          <Notice tone="error">
            <div className="font-medium">
              Cannot reach the {state.productName} API at {state.settings.apiBaseUrl}.
            </div>
            <div className="mt-0.5">{state.apiError}</div>
            <button type="button" className="mt-1.5 inline-flex items-center gap-1 font-medium underline" onClick={() => void ext.reload(true)}>
              <RefreshCw size={12} aria-hidden="true" /> Retry
            </button>
          </Notice>
        </div>
      )}
      {actionError && (
        <div className="px-3 pt-3">
          <Notice tone="error">{actionError}</Notice>
        </div>
      )}
      {view === 'settings' ? (
        <SettingsView state={state} onUpdate={ext.updateSettings} />
      ) : !state.auth.signedIn ? (
        <LoginForm productName={state.productName} dashboardUrl={state.settings.dashboardUrl} onLogin={ext.login} />
      ) : !state.settings.organizationId ? (
        <div className="p-3">
          <Notice tone="warning">Your account is not a member of any organization. Create or join one in the dashboard.</Notice>
        </div>
      ) : (
        children(state, ext)
      )}
    </div>
  );
}
