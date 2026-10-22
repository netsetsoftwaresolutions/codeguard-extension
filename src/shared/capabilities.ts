import type { ParsedSource, SourceInspection } from '../contracts';
import { isGitProvider, resolveRef } from './source';

export type ScanActionId =
  | 'SCAN_FILE'
  | 'SCAN_FOLDER_PATH'
  | 'SCAN_BRANCH'
  | 'SCAN_REPOSITORY'
  | 'SCAN_ALL_BRANCHES'
  | 'SCAN_PULL_REQUEST'
  | 'SCAN_SHARED_FOLDER'
  | 'SCAN_SHARED_FILE';

export interface ScanAction {
  id: ScanActionId;
  label: string;
  enabled: boolean;
  /** Why the action is disabled (shown as a hint). */
  reason?: string;
  /** Primary action is visually emphasised. */
  primary?: boolean;
  ref?: string | null;
  path?: string | null;
}

/**
 * Maps a parsed page + server inspection to the scan buttons to show.
 * Only actions that make sense for the page kind are returned; each is enabled only when the
 * API reports the matching capability. A file-only share link never offers a folder scan.
 */
export function getScanActions(
  parsed: ParsedSource,
  inspection: SourceInspection | null,
  opts: { branchHint?: string | null } = {},
): ScanAction[] {
  if (!parsed.supported || !inspection) return [];
  const caps = inspection.capabilities;
  const notAccessible = inspection.accessible ? undefined : 'The source is not accessible with the current configuration.';
  const off = (cap: boolean, fallback: string) => (cap ? undefined : notAccessible ?? fallback);
  const actions: ScanAction[] = [];

  if (isGitProvider(parsed)) {
    const isPr = parsed.kind === 'PULL_REQUEST' || parsed.kind === 'MERGE_REQUEST';
    const resolved = resolveRef(parsed, { branchHint: opts.branchHint, branches: inspection.branches });
    const currentRef = resolved.ref ?? (isPr ? null : inspection.defaultBranch);

    if (isPr) {
      actions.push({
        id: 'SCAN_PULL_REQUEST',
        label: 'Scan this pull request',
        enabled: caps.scanPullRequest,
        reason: off(caps.scanPullRequest, 'Pull request scanning is not available for this source.'),
        primary: true,
      });
    }
    if (parsed.kind === 'FILE' && resolved.path) {
      actions.push({
        id: 'SCAN_FILE',
        label: 'Scan current file',
        enabled: caps.scanFile && !!currentRef,
        reason: off(caps.scanFile, 'File scanning is not available for this source.') ?? (currentRef ? undefined : 'The current branch could not be determined.'),
        primary: true,
        ref: currentRef,
        path: resolved.path,
      });
    }
    if (parsed.kind === 'FOLDER' && resolved.path) {
      actions.push({
        id: 'SCAN_FOLDER_PATH',
        label: 'Scan this folder',
        enabled: caps.scanFolder && !!currentRef,
        reason: off(caps.scanFolder, 'Folder scanning is not available for this source.') ?? (currentRef ? undefined : 'The current branch could not be determined.'),
        ref: currentRef,
        path: resolved.path,
      });
    }
    if (!isPr) {
      actions.push({
        id: 'SCAN_BRANCH',
        label: currentRef ? `Scan current branch (${currentRef})` : 'Scan current branch',
        enabled: caps.scanBranch && !!currentRef,
        reason: off(caps.scanBranch, 'Branch scanning is not available for this source.') ?? (currentRef ? undefined : 'The current branch could not be determined.'),
        ref: currentRef,
      });
    }
    actions.push({
      id: 'SCAN_REPOSITORY',
      label: 'Scan entire repository',
      enabled: caps.scanRepository,
      reason: off(caps.scanRepository, 'Repository scanning is not available for this source.'),
      primary: parsed.kind === 'REPOSITORY' && !parsed.ref,
    });
    actions.push({
      id: 'SCAN_ALL_BRANCHES',
      label: inspection.branches ? `Scan all accessible branches (${inspection.branches.length})` : 'Scan all accessible branches',
      enabled: caps.scanAllBranches,
      reason: off(caps.scanAllBranches, 'Multi-branch scanning is not available (plan or provider limitation).'),
    });
    return actions;
  }

  // Dropbox / Google Drive / public URLs: the page kind decides; never claim a folder scan for a file link.
  if (parsed.kind === 'FOLDER') {
    actions.push({
      id: 'SCAN_SHARED_FOLDER',
      label: 'Scan accessible folder contents',
      enabled: caps.scanFolder,
      reason: off(caps.scanFolder, 'The folder contents cannot be listed with the current configuration.'),
      primary: true,
    });
  } else if (parsed.kind === 'FILE' || parsed.kind === 'ARCHIVE') {
    actions.push({
      id: 'SCAN_SHARED_FILE',
      label: 'Scan this file',
      enabled: caps.scanFile,
      reason: off(caps.scanFile, 'This file cannot be downloaded with the current configuration.'),
      primary: true,
    });
  }
  return actions;
}
