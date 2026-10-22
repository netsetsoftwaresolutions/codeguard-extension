import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ScanCreatedResponse } from '../../contracts';
import type { ExtensionState } from '../../shared/messages';
import { cleanUploads, stageUpload, takeUpload, validateUploadFiles, type UploadFile } from '../../shared/upload';
import { AppShell } from '../components/AppShell';
import { FindingsList } from '../components/FindingsList';
import { Notice, Section } from '../components/common';
import { ScanStatusPanel } from '../components/ScanStatusPanel';
import { errorMessage, send } from '../messaging';
import '../styles.css';

function Upload({ state }: { state: ExtensionState }) {
  const [mode, setMode] = useState('files');
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ScanCreatedResponse | null>(null);
  useEffect(() => { void cleanUploads().catch(() => undefined); }, []);
  useEffect(() => { setFiles([]); setConsent(false); setCreated(null); }, [state.settings.organizationId]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    if (busy) window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  async function submit() {
    setError(null);
    let uploadId: string | undefined;
    try {
      if (!consent || !state.settings.organizationId) throw new Error('Confirm permission to upload these files.');
      validateUploadFiles(files, state.meta?.limits.maxUploadBytes ?? 200 * 1024 * 1024);
      if (mode === 'archive' && (files.length !== 1 || !/\.(zip|tar|tar\.gz|tgz)$/i.test(files[0]!.name))) throw new Error('Select one ZIP, TAR, TAR.GZ or TGZ archive.');
      setBusy(true);
      uploadId = await stageUpload(files);
      const result = await send({ type: 'UPLOAD_SCAN', uploadId, organizationId: state.settings.organizationId, consent: true });
      setCreated(result);
      setFiles([]);
      setConsent(false);
    } catch (err) { setError(errorMessage(err)); }
    finally {
      if (uploadId) await takeUpload(uploadId).catch(() => undefined);
      setBusy(false);
    }
  }

  return <main className="space-y-4 p-4">
    <Section title="Upload source code">
      <div className="space-y-3">
        <p className="text-sm">Select local source files, a folder, or an archive to scan in {state.auth.organizations.find((org) => org.id === state.settings.organizationId)?.name}.</p>
        <label className="block text-sm">Source type
          <select className="cg-input mt-1 w-full" value={mode} disabled={busy} onChange={(e) => { setMode(e.target.value); setFiles([]); setConsent(false); }}>
            <option value="files">Files</option><option value="folder">Folder</option><option value="archive">Archive</option>
          </select>
        </label>
        <label className="block text-sm">Select {mode}
          <input key={`${mode}:${state.settings.organizationId}:${created?.scans[0]?.id ?? ''}`} className="mt-1 block w-full" type="file" disabled={busy}
            multiple={mode !== 'archive'} accept={mode === 'archive' ? '.zip,.tar,.tar.gz,.tgz' : undefined}
            {...(mode === 'folder' ? { webkitdirectory: '', directory: '' } : {})}
            onChange={(e) => { setFiles(Array.from(e.target.files ?? []).map((f) => ({ name: f.name, path: f.webkitRelativePath || f.name, blob: f }))); setConsent(false); setError(null); }} />
        </label>
        <p className="text-xs">{files.length} files selected · {(files.reduce((n, f) => n + f.blob.size, 0) / 1048576).toFixed(2)} MB. Folder paths are preserved. Plan upload limits apply.</p>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={(e) => setConsent(e.target.checked)} />
          <span>I have permission to send these files to {state.settings.apiBaseUrl} for security analysis.</span>
        </label>
        {state.settings.enableAi && <p className="text-xs">AI explanations are enabled in extension settings.</p>}
        <button type="button" className="cg-btn-primary" disabled={busy || !files.length || !consent || !state.apiReachable} onClick={() => void submit()}>{busy ? 'Uploading… Keep this tab open' : 'Upload and scan'}</button>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Section>
    {created?.scans[0] && <Section title="Uploaded source scan"><ScanStatusPanel scanId={created.scans[0].id} created={created} dashboardUrl={state.settings.dashboardUrl}
      footer={(scan) => <FindingsList scanId={scan.id} dashboardUrl={state.settings.dashboardUrl} />} /></Section>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><div className="mx-auto max-w-3xl"><AppShell>{(state) => <Upload state={state} />}</AppShell></div></StrictMode>);
