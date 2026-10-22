import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { AppShell } from '../components/AppShell';
import { Workspace } from '../components/Workspace';

function Popup() {
  return (
    <div className="w-[380px] max-h-[600px] overflow-y-auto">
      <AppShell>{(state, api) => <Workspace state={state} variant="popup" onStateChange={() => void api.reload(false)} />}</AppShell>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
