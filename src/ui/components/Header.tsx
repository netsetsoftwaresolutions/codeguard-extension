import { ShieldLogo } from '../../components/primitives';
import { ArrowLeft, LogOut, Moon, Settings as SettingsIcon, Sun } from 'lucide-react';
import type { ExtensionState } from '../../shared/messages';

export function Header({
  state,
  onToggleTheme,
  onOpenSettings,
  onBack,
  onLogout,
  onSelectOrg,
}: {
  state: ExtensionState;
  onToggleTheme: () => void;
  onOpenSettings?: () => void;
  onBack?: () => void;
  onLogout?: () => void;
  onSelectOrg?: (id: string) => void;
}) {
  const { auth, settings, productName } = state;
  const dark = settings.theme === 'dark';
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-slate-200 bg-white/90 px-3 py-2 backdrop-blur dark:border-ink-600 dark:bg-ink-900/90">
      {onBack ? (
        <button type="button" className="cg-btn-ghost -ml-1 px-1.5" onClick={onBack} aria-label="Back">
          <ArrowLeft size={16} />
        </button>
      ) : (
        <ShieldLogo size={24} />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold tracking-tight">{onBack ? 'Settings' : productName}</div>
      </div>
      {auth.signedIn && onSelectOrg && auth.organizations.length > 0 && !onBack && (
        <label className="sr-only" htmlFor="org-select">
          Organization
        </label>
      )}
      {auth.signedIn && onSelectOrg && auth.organizations.length > 0 && !onBack && (
        <select
          id="org-select"
          className="max-w-[130px] truncate rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium dark:border-ink-500 dark:bg-ink-800"
          value={settings.organizationId ?? ''}
          onChange={(e) => onSelectOrg(e.target.value)}
          title="Organization"
        >
          {auth.organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}
      <button type="button" className="cg-btn-ghost px-1.5" onClick={onToggleTheme} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title="Toggle theme">
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      {onOpenSettings && (
        <button type="button" className="cg-btn-ghost px-1.5" onClick={onOpenSettings} aria-label="Settings" title="Settings">
          <SettingsIcon size={16} />
        </button>
      )}
      {auth.signedIn && onLogout && !onBack && (
        <button type="button" className="cg-btn-ghost px-1.5" onClick={onLogout} aria-label="Sign out" title={auth.user ? `Sign out (${auth.user.email})` : 'Sign out'}>
          <LogOut size={16} />
        </button>
      )}
    </header>
  );
}
