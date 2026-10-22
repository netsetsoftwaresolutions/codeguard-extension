import { ShieldLogo, Spinner } from '../../components/primitives';
import { useState, type FormEvent } from 'react';
import { dashboardLink, errorMessage, openTab } from '../messaging';

export function LoginForm({
  productName,
  dashboardUrl,
  onLogin,
}: {
  productName: string;
  dashboardUrl: string;
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setBusy(true);
    setError(null);
    try {
      await onLogin(email, password);
      setPassword('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 p-4" aria-label="Sign in">
      <div className="flex flex-col items-center gap-2 pb-1 text-center">
        <ShieldLogo size={36} />
        <h1 className="text-base font-semibold">Sign in to {productName}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">Scan repositories and shared links for security issues.</p>
      </div>
      <div>
        <label className="cg-label" htmlFor="login-email">
          Email
        </label>
        <input id="login-email" type="email" autoComplete="username" required className="cg-input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="cg-label" htmlFor="login-password">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          className="cg-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button type="submit" className="cg-btn-primary w-full" disabled={busy}>
        {busy && <Spinner size={14} />} Sign in
      </button>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        No account?{' '}
        <button type="button" className="font-medium text-brand-600 hover:underline dark:text-brand-400" onClick={() => openTab(dashboardLink(dashboardUrl, '/register'))}>
          Create account
        </button>
      </p>
    </form>
  );
}
