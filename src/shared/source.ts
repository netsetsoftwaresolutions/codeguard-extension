import { parseSourceUrl, type ParsedSource, type SourceInspection } from '../contracts';

export const GIT_PROVIDERS = new Set(['GITHUB', 'GITLAB', 'BITBUCKET']);

export function isGitProvider(p: ParsedSource): boolean {
  return GIT_PROVIDERS.has(p.provider);
}

/** Base repository URL for git providers (used for repository-level scans, consent and allowlist keys). */
export function repositoryUrl(p: ParsedSource): string | null {
  if (!p.supported) return null;
  switch (p.provider) {
    case 'GITHUB':
      return p.owner && p.repo ? `https://github.com/${p.owner}/${p.repo}` : null;
    case 'GITLAB':
      return p.projectPath ? `https://gitlab.com/${p.projectPath}` : null;
    case 'BITBUCKET':
      return p.owner && p.repo ? `https://bitbucket.org/${p.owner}/${p.repo}` : null;
    default:
      return null;
  }
}

/** Stable key identifying a source: the repository for git providers, the canonical share link otherwise. */
export function sourceKey(p: ParsedSource): string {
  return repositoryUrl(p) ?? p.canonicalUrl;
}

/** Re-parse a URL and return its source key (or null if unsupported). */
export function sourceKeyForUrl(url: string): string | null {
  const p = parseSourceUrl(url);
  return p.supported ? sourceKey(p) : null;
}

export interface ResolvedRef {
  /** Branch / tag / sha, if known. */
  ref: string | null;
  /** Path inside the repository (file or folder), if any. */
  path: string | null;
  /** True when the split between ref and path could not be confirmed. */
  uncertain: boolean;
}

/**
 * GitHub/GitLab tree/blob URLs cannot distinguish `feature/x` + `src/a.ts` from `feature` + `x/src/a.ts`.
 * Resolve using (1) a page-provided branch hint, validated to be a prefix of the URL ref+path,
 * (2) the branch list from inspection (longest matching branch), (3) the naive first-segment split.
 */
export function resolveRef(p: ParsedSource, opts: { branchHint?: string | null; branches?: string[] | null } = {}): ResolvedRef {
  if (!p.ref) return { ref: null, path: p.filePath ?? null, uncertain: false };
  if (!p.refAmbiguous || !p.filePath) return { ref: p.ref, path: p.filePath ?? null, uncertain: false };
  const full = `${p.ref}/${p.filePath}`;
  const split = (branch: string): ResolvedRef | null => {
    if (full === branch) return { ref: branch, path: null, uncertain: false };
    if (full.startsWith(`${branch}/`)) return { ref: branch, path: full.slice(branch.length + 1), uncertain: false };
    return null;
  };
  if (opts.branchHint) {
    const r = split(opts.branchHint);
    if (r) return r;
  }
  if (opts.branches?.length) {
    const match = [...opts.branches].sort((a, b) => b.length - a.length).map(split).find(Boolean);
    if (match) return match;
  }
  return { ref: p.ref, path: p.filePath, uncertain: true };
}

/** Validates a branch hint coming from a content script: plain ref name, consistent with the URL. */
export function acceptBranchHint(p: ParsedSource, hint: unknown): string | null {
  if (typeof hint !== 'string') return null;
  const h = hint.trim();
  if (!h || h.length > 255 || /[\s\u0000-\u001f\u007f~^:?*[\\]/.test(h) || h.includes('..')) return null;
  if (!p.ref) return null;
  const full = p.filePath ? `${p.ref}/${p.filePath}` : p.ref;
  return full === h || full.startsWith(`${h}/`) ? h : null;
}

export type DetectionLabel =
  | 'Repository detected'
  | 'Shared folder detected'
  | 'Shared file detected'
  | 'Pull request detected'
  | 'Not a supported page';

export function detectionLabel(p: ParsedSource | null): DetectionLabel {
  if (!p || !p.supported) return 'Not a supported page';
  if (p.kind === 'PULL_REQUEST' || p.kind === 'MERGE_REQUEST') return 'Pull request detected';
  if (isGitProvider(p)) return 'Repository detected';
  if (p.kind === 'FOLDER') return 'Shared folder detected';
  return 'Shared file detected';
}

export function providerName(provider: ParsedSource['provider']): string {
  switch (provider) {
    case 'GITHUB':
      return 'GitHub';
    case 'GITLAB':
      return 'GitLab';
    case 'BITBUCKET':
      return 'Bitbucket';
    case 'DROPBOX':
      return 'Dropbox';
    case 'GOOGLE_DRIVE':
      return 'Google Drive';
    case 'UPLOAD':
      return 'Upload';
    default:
      return 'Web';
  }
}

/** Whether the floating in-page button should be shown for this page (git repository pages only). */
export function shouldShowFloatingButton(p: ParsedSource): boolean {
  return p.supported && isGitProvider(p);
}

export type Visibility = SourceInspection['visibility'];
