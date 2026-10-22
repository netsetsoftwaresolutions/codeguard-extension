import type { SourceKind, SourceProvider } from './enums';

/**
 * Parsed description of a supported source URL. Used by the Chrome extension to recognise
 * pages and by the API to validate scan requests. Parsing never performs network access.
 */
export interface ParsedSource {
  supported: boolean;
  provider: SourceProvider;
  kind: SourceKind;
  /** Canonical URL for the resource (no query/fragment unless required). */
  canonicalUrl: string;
  owner?: string;
  repo?: string;
  /** GitLab namespaces can be nested: "group/subgroup/project". */
  projectPath?: string;
  /** Branch / tag / commit from the URL. For GitHub tree/blob URLs, refs containing "/" are ambiguous. */
  ref?: string;
  refAmbiguous?: boolean;
  filePath?: string;
  pullNumber?: number;
  commitSha?: string;
  /** Dropbox / Google Drive identifiers. */
  shareId?: string;
  /** Human-readable label for UIs. */
  label: string;
  /** Explains why a URL is unsupported or what is limited. */
  notes: string[];
}

const ARCHIVE_EXTENSIONS = ['.zip', '.tar', '.tar.gz', '.tgz'];

/** Extensions considered "source code" for the public raw-file fetcher. */
export const SOURCE_FILE_EXTENSIONS = [
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte',
  '.py', '.pyw', '.rb', '.php', '.phtml', '.java', '.kt', '.kts', '.scala', '.groovy', '.gradle',
  '.go', '.rs', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs', '.swift', '.m', '.mm',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.bat', '.cmd', '.pl', '.pm', '.lua', '.r',
  '.json', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.xml', '.env', '.properties',
  '.html', '.htm', '.sql', '.tf', '.hcl', '.dockerfile', '.lock', '.txt', '.md',
];

const GITHUB_RESERVED = new Set([
  'settings', 'orgs', 'organizations', 'marketplace', 'explore', 'topics', 'notifications',
  'login', 'logout', 'signup', 'join', 'new', 'pulls', 'issues', 'search', 'sponsors',
  'features', 'enterprise', 'pricing', 'about', 'apps', 'codespaces', 'collections',
  'trending', 'dashboard', 'account', 'site', 'security', 'contact', 'readme', 'stars',
  'watching', 'customer-stories', 'team', 'resources', 'solutions', 'copilot', 'github-copilot',
]);

const GITLAB_RESERVED = new Set([
  'explore', 'dashboard', 'users', 'help', 'admin', 'search', 'groups', 'projects', '-',
  'api', 'profile', 'snippets', 'public',
]);

const BITBUCKET_RESERVED = new Set(['account', 'dashboard', 'product', 'repo', 'site', 'support', 'blog', 'workspace']);

function unsupported(url: string, notes: string[]): ParsedSource {
  return {
    supported: false,
    provider: 'PUBLIC_URL',
    kind: 'UNKNOWN',
    canonicalUrl: url,
    label: 'Unsupported page',
    notes,
  };
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function lowerPath(pathname: string): string {
  return pathname.toLowerCase();
}

export function isArchivePath(pathname: string): boolean {
  const p = lowerPath(pathname);
  return ARCHIVE_EXTENSIONS.some((ext) => p.endsWith(ext));
}

export function isSourceFilePath(pathname: string): boolean {
  const p = lowerPath(pathname);
  const base = p.split('/').pop() ?? '';
  if (base === 'dockerfile' || base === 'makefile' || base.startsWith('.env')) return true;
  return SOURCE_FILE_EXTENSIONS.some((ext) => p.endsWith(ext));
}

function parseGitHub(u: URL): ParsedSource {
  const segs = u.pathname.split('/').filter(Boolean).map(safeDecode);
  if (segs.length < 2 || GITHUB_RESERVED.has(segs[0]!.toLowerCase())) {
    return unsupported(u.href, ['This GitHub page is not a repository.']);
  }
  const owner = segs[0]!;
  const repo = segs[1]!.replace(/\.git$/, '');
  const base = `https://github.com/${owner}/${repo}`;
  const common = { supported: true, provider: 'GITHUB' as const, owner, repo, notes: [] as string[] };

  const section = segs[2];
  if (!section) {
    return { ...common, kind: 'REPOSITORY', canonicalUrl: base, label: `${owner}/${repo}` };
  }
  if (section === 'pull' && segs[3] && /^\d+$/.test(segs[3])) {
    const pullNumber = Number(segs[3]);
    return {
      ...common,
      kind: 'PULL_REQUEST',
      pullNumber,
      canonicalUrl: `${base}/pull/${pullNumber}`,
      label: `${owner}/${repo} #${pullNumber}`,
    };
  }
  if (section === 'commit' && segs[3] && /^[0-9a-f]{7,40}$/i.test(segs[3])) {
    return {
      ...common,
      kind: 'REPOSITORY',
      commitSha: segs[3],
      ref: segs[3],
      canonicalUrl: `${base}/commit/${segs[3]}`,
      label: `${owner}/${repo}@${segs[3].slice(0, 7)}`,
    };
  }
  if ((section === 'tree' || section === 'blob') && segs[3]) {
    const ref = segs[3];
    const rest = segs.slice(4).join('/');
    const notes = rest
      ? ['Branch names containing "/" cannot be separated from the path using the URL alone; the extension reads the branch from the page when possible.']
      : [];
    if (section === 'blob' && rest) {
      return {
        ...common,
        kind: 'FILE',
        ref,
        refAmbiguous: true,
        filePath: rest,
        canonicalUrl: `${base}/blob/${segs.slice(3).map(encodeURIComponent).join('/')}`,
        label: `${owner}/${repo}: ${rest}`,
        notes,
      };
    }
    return {
      ...common,
      kind: rest ? 'FOLDER' : 'REPOSITORY',
      ref,
      refAmbiguous: rest.length > 0,
      filePath: rest || undefined,
      canonicalUrl: `${base}/tree/${segs.slice(3).map(encodeURIComponent).join('/')}`,
      label: rest ? `${owner}/${repo}: ${rest}` : `${owner}/${repo} (${ref})`,
      notes,
    };
  }
  // Other repository sub-pages (issues, actions, ...) still identify the repository.
  return { ...common, kind: 'REPOSITORY', canonicalUrl: base, label: `${owner}/${repo}` };
}

function parseGitHubRaw(u: URL): ParsedSource {
  const segs = u.pathname.split('/').filter(Boolean).map(safeDecode);
  if (segs.length < 4) return unsupported(u.href, ['Incomplete raw.githubusercontent.com URL.']);
  const [owner, repo, ref, ...rest] = segs as [string, string, string, ...string[]];
  const filePath = rest.join('/');
  return {
    supported: true,
    provider: 'GITHUB',
    kind: 'FILE',
    owner,
    repo,
    ref,
    refAmbiguous: true,
    filePath,
    canonicalUrl: u.origin + u.pathname,
    label: `${owner}/${repo}: ${filePath}`,
    notes: [],
  };
}

function parseGitLab(u: URL): ParsedSource {
  const raw = u.pathname.split('/').filter(Boolean).map(safeDecode);
  if (raw.length < 2 || GITLAB_RESERVED.has(raw[0]!.toLowerCase())) {
    return unsupported(u.href, ['This GitLab page is not a project.']);
  }
  const dash = raw.indexOf('-');
  const projectSegs = dash === -1 ? raw : raw.slice(0, dash);
  if (projectSegs.length < 2) return unsupported(u.href, ['This GitLab page is not a project.']);
  const projectPath = projectSegs.join('/').replace(/\.git$/, '');
  const base = `https://gitlab.com/${projectPath}`;
  const common = {
    supported: true,
    provider: 'GITLAB' as const,
    projectPath,
    owner: projectSegs.slice(0, -1).join('/'),
    repo: projectSegs[projectSegs.length - 1]!.replace(/\.git$/, ''),
    notes: [] as string[],
  };
  if (dash === -1) return { ...common, kind: 'REPOSITORY', canonicalUrl: base, label: projectPath };
  const section = raw[dash + 1];
  const after = raw.slice(dash + 2);
  if (section === 'merge_requests' && after[0] && /^\d+$/.test(after[0])) {
    const n = Number(after[0]);
    return { ...common, kind: 'MERGE_REQUEST', pullNumber: n, canonicalUrl: `${base}/-/merge_requests/${n}`, label: `${projectPath} !${n}` };
  }
  if ((section === 'tree' || section === 'blob') && after[0]) {
    const ref = after[0];
    const rest = after.slice(1).join('/');
    const kind: SourceKind = section === 'blob' && rest ? 'FILE' : rest ? 'FOLDER' : 'REPOSITORY';
    return {
      ...common,
      kind,
      ref,
      refAmbiguous: rest.length > 0,
      filePath: rest || undefined,
      canonicalUrl: u.origin + u.pathname,
      label: rest ? `${projectPath}: ${rest}` : `${projectPath} (${ref})`,
    };
  }
  return { ...common, kind: 'REPOSITORY', canonicalUrl: base, label: projectPath };
}

function parseBitbucket(u: URL): ParsedSource {
  const segs = u.pathname.split('/').filter(Boolean).map(safeDecode);
  if (segs.length < 2 || BITBUCKET_RESERVED.has(segs[0]!.toLowerCase())) {
    return unsupported(u.href, ['This Bitbucket page is not a repository.']);
  }
  const [owner, repo] = segs as [string, string];
  const base = `https://bitbucket.org/${owner}/${repo}`;
  const common = { supported: true, provider: 'BITBUCKET' as const, owner, repo, notes: [] as string[] };
  if (segs[2] === 'pull-requests' && segs[3] && /^\d+$/.test(segs[3])) {
    const n = Number(segs[3]);
    return { ...common, kind: 'PULL_REQUEST', pullNumber: n, canonicalUrl: `${base}/pull-requests/${n}`, label: `${owner}/${repo} #${n}` };
  }
  if (segs[2] === 'src' && segs[3]) {
    const ref = segs[3];
    const rest = segs.slice(4).join('/');
    return {
      ...common,
      kind: rest && isSourceFilePath(rest) ? 'FILE' : rest ? 'FOLDER' : 'REPOSITORY',
      ref,
      filePath: rest || undefined,
      canonicalUrl: u.origin + u.pathname,
      label: rest ? `${owner}/${repo}: ${rest}` : `${owner}/${repo} (${ref})`,
    };
  }
  return { ...common, kind: 'REPOSITORY', canonicalUrl: base, label: `${owner}/${repo}` };
}

function parseDropbox(u: URL): ParsedSource {
  const segs = u.pathname.split('/').filter(Boolean);
  const base = { supported: true, provider: 'DROPBOX' as const, notes: [] as string[] };
  // New-style links: /scl/fi/<id>/<name>?rlkey=... (file) and /scl/fo/<id>/<key>?rlkey=... (folder)
  if (segs[0] === 'scl' && (segs[1] === 'fi' || segs[1] === 'fo') && segs[2]) {
    const isFolder = segs[1] === 'fo';
    const name = safeDecode(segs[segs.length - 1] ?? '');
    const canonical = new URL(u.origin + u.pathname);
    const rlkey = u.searchParams.get('rlkey');
    if (rlkey) canonical.searchParams.set('rlkey', rlkey);
    return {
      ...base,
      kind: isFolder ? 'FOLDER' : isArchivePath(name) ? 'ARCHIVE' : 'FILE',
      shareId: segs[2],
      canonicalUrl: canonical.href,
      label: isFolder ? 'Dropbox shared folder' : `Dropbox file: ${name}`,
      notes: rlkey ? [] : ['Link has no rlkey parameter; Dropbox may refuse access.'],
    };
  }
  // Legacy links: /s/<id>/<name> (file), /sh/<id>/<key> (folder)
  if ((segs[0] === 's' || segs[0] === 'sh') && segs[1]) {
    const isFolder = segs[0] === 'sh';
    const name = safeDecode(segs[segs.length - 1] ?? '');
    return {
      ...base,
      kind: isFolder ? 'FOLDER' : isArchivePath(name) ? 'ARCHIVE' : 'FILE',
      shareId: segs[1],
      canonicalUrl: u.origin + u.pathname,
      label: isFolder ? 'Dropbox shared folder' : `Dropbox file: ${name}`,
    };
  }
  return unsupported(u.href, ['Open a Dropbox shared link (dropbox.com/scl/... or /s/...) to scan it. Browsing your private Dropbox requires the Dropbox integration.']);
}

function parseGoogleDrive(u: URL): ParsedSource {
  const segs = u.pathname.split('/').filter(Boolean);
  const base = { supported: true, provider: 'GOOGLE_DRIVE' as const };
  const folderIdx = segs.indexOf('folders');
  if (folderIdx !== -1 && segs[folderIdx + 1]) {
    const id = segs[folderIdx + 1]!;
    return {
      ...base,
      kind: 'FOLDER',
      shareId: id,
      canonicalUrl: `https://drive.google.com/drive/folders/${id}`,
      label: 'Google Drive shared folder',
      notes: ['Folder listing requires the server to be configured with a Google API key or a connected Google account; only files shared with "anyone with the link" are readable without OAuth.'],
    };
  }
  if (segs[0] === 'file' && segs[1] === 'd' && segs[2]) {
    return {
      ...base,
      kind: 'FILE',
      shareId: segs[2],
      canonicalUrl: `https://drive.google.com/file/d/${segs[2]}/view`,
      label: 'Google Drive file',
      notes: [],
    };
  }
  const id = u.searchParams.get('id');
  if ((segs[0] === 'open' || segs[0] === 'uc') && id) {
    return { ...base, kind: 'FILE', shareId: id, canonicalUrl: `https://drive.google.com/file/d/${id}/view`, label: 'Google Drive file', notes: [] };
  }
  return unsupported(u.href, ['Open a Google Drive shared file or folder link to scan it.']);
}

/** Parse any URL into a supported source description. Never throws. */
export function parseSourceUrl(input: string): ParsedSource {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return unsupported(input, ['Not a valid URL.']);
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    return unsupported(input, ['Only http(s) URLs are supported.']);
  }
  if (u.username || u.password) {
    return unsupported(input, ['URLs containing credentials are not accepted.']);
  }
  const host = u.hostname.toLowerCase();
  if (host === 'github.com' || host === 'www.github.com') return parseGitHub(u);
  if (host === 'raw.githubusercontent.com') return parseGitHubRaw(u);
  if (host === 'gitlab.com' || host === 'www.gitlab.com') return parseGitLab(u);
  if (host === 'bitbucket.org' || host === 'www.bitbucket.org') return parseBitbucket(u);
  if (host === 'dropbox.com' || host === 'www.dropbox.com') return parseDropbox(u);
  if (host === 'drive.google.com') return parseGoogleDrive(u);

  if (u.protocol !== 'https:') {
    return unsupported(input, ['Public URLs must use HTTPS.']);
  }
  const name = safeDecode(u.pathname.split('/').pop() ?? '');
  if (isArchivePath(u.pathname)) {
    return { supported: true, provider: 'PUBLIC_URL', kind: 'ARCHIVE', canonicalUrl: u.href, label: `Archive: ${name}`, notes: [] };
  }
  if (isSourceFilePath(u.pathname)) {
    return { supported: true, provider: 'PUBLIC_URL', kind: 'FILE', canonicalUrl: u.href, label: `File: ${name}`, notes: [] };
  }
  return unsupported(input, ['This page is not a recognised repository, shared folder, archive, or source file.']);
}

/** Build a provider deep link to a file/line at an exact revision, when the provider supports it. */
export function buildSourceLink(args: {
  provider: SourceProvider;
  owner?: string | null;
  repo?: string | null;
  projectPath?: string | null;
  commitSha?: string | null;
  ref?: string | null;
  filePath?: string | null;
  line?: number | null;
}): string | null {
  const { provider, owner, repo, filePath, line } = args;
  const rev = args.commitSha || args.ref;
  if (!filePath || !rev) return null;
  const encPath = filePath.split('/').map(encodeURIComponent).join('/');
  switch (provider) {
    case 'GITHUB':
      if (!owner || !repo) return null;
      return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(rev)}/${encPath}${line ? `#L${line}` : ''}`;
    case 'GITLAB': {
      const p = args.projectPath ?? (owner && repo ? `${owner}/${repo}` : null);
      if (!p) return null;
      return `https://gitlab.com/${p}/-/blob/${encodeURIComponent(rev)}/${encPath}${line ? `#L${line}` : ''}`;
    }
    case 'BITBUCKET':
      if (!owner || !repo) return null;
      return `https://bitbucket.org/${owner}/${repo}/src/${encodeURIComponent(rev)}/${encPath}${line ? `#lines-${line}` : ''}`;
    default:
      return null;
  }
}
