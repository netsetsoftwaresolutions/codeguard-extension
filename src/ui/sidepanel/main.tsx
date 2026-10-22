import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { AppShell } from '../components/AppShell';
import { Workspace } from '../components/Workspace';

function SidePanel() {
  return (
    <div className="min-h-screen">
      <AppShell>{(state, api) => <Workspace state={state} variant="sidepanel" onStateChange={() => void api.reload(false)} />}</AppShell>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SidePanel />
  </StrictMode>,
);
