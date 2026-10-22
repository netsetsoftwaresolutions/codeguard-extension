import { cx, Spinner } from '../../components/primitives';
import { FileCode, Folder, GitBranch, GitPullRequest, Layers, ScanSearch } from 'lucide-react';
import type { ScanAction, ScanActionId } from '../../shared/capabilities';

const ICONS: Record<ScanActionId, typeof FileCode> = {
  SCAN_FILE: FileCode,
  SCAN_FOLDER_PATH: Folder,
  SCAN_BRANCH: GitBranch,
  SCAN_REPOSITORY: ScanSearch,
  SCAN_ALL_BRANCHES: Layers,
  SCAN_PULL_REQUEST: GitPullRequest,
  SCAN_SHARED_FOLDER: Folder,
  SCAN_SHARED_FILE: FileCode,
};

export function ScanActions({
  actions,
  onScan,
  starting,
  disabled,
}: {
  actions: ScanAction[];
  onScan: (a: ScanAction) => void;
  starting: ScanActionId | null;
  disabled?: boolean;
}) {
  if (!actions.length) return null;
  return (
    <div className="grid gap-1.5" role="group" aria-label="Scan options">
      {actions.map((a) => {
        const Icon = ICONS[a.id];
        const busy = starting === a.id;
        return (
          <div key={a.id}>
            <button
              type="button"
              data-action={a.id}
              className={cx('w-full justify-start', a.primary ? 'cg-btn-primary' : 'cg-btn-secondary')}
              disabled={!a.enabled || !!starting || disabled}
              onClick={() => onScan(a)}
              aria-describedby={!a.enabled && a.reason ? `reason-${a.id}` : undefined}
            >
              {busy ? <Spinner size={14} /> : <Icon size={14} aria-hidden="true" />}
              <span className="truncate">{a.label}</span>
            </button>
            {!a.enabled && a.reason && (
              <p id={`reason-${a.id}`} className="mt-0.5 px-1 text-[11px] text-slate-500 dark:text-slate-400">
                {a.reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
