import { parseSourceUrl } from '../src/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { extractBranchHint, fromGitHubEmbeddedData } from '../src/shared/branch-hint';
import { acceptBranchHint, resolveRef } from '../src/shared/source';

const SAMPLE = JSON.stringify({
  payload: {
    allShortcutsEnabled: false,
    path: 'src/auth/login.ts',
    repo: { id: 1, defaultBranch: 'main', name: 'app', ownerLogin: 'acme' },
    refInfo: { name: 'feature/login', listCacheKey: 'v0:123', canEdit: false, refType: 'branch', currentOid: 'abc123' },
  },
  title: 'app/src/auth/login.ts at feature/login · acme/app',
});

describe('GitHub branch-hint extraction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('reads payload.refInfo.name from the react-app embedded JSON', () => {
    document.body.innerHTML = `<react-app><script type="application/json" data-target="react-app.embeddedData">${SAMPLE}</script></react-app>`;
    expect(fromGitHubEmbeddedData(document)).toBe('feature/login');
    expect(extractBranchHint(document, 'GITHUB')).toBe('feature/login');
  });

  it('finds refInfo nested in a route-specific payload', () => {
    const nested = JSON.stringify({ payload: { codeViewBlobRoute: { refInfo: { name: 'release/1.2' } } } });
    document.body.innerHTML = `<script type="application/json" data-target="react-app.embeddedData">${nested}</script>`;
    expect(extractBranchHint(document, 'GITHUB')).toBe('release/1.2');
  });

  it('returns null for missing or malformed data', () => {
    document.body.innerHTML = `<script type="application/json" data-target="react-app.embeddedData">{not json</script>`;
    expect(extractBranchHint(document, 'GITHUB')).toBeNull();
    document.body.innerHTML = '';
    expect(extractBranchHint(document, 'GITHUB')).toBeNull();
    expect(extractBranchHint(document, 'BITBUCKET')).toBeNull();
  });
});

describe('acceptBranchHint / resolveRef', () => {
  const parsed = parseSourceUrl('https://github.com/acme/app/blob/feature/login/src/auth/login.ts');

  it('accepts a hint consistent with the URL and uses it to split ref and path', () => {
    expect(acceptBranchHint(parsed, 'feature/login')).toBe('feature/login');
    expect(resolveRef(parsed, { branchHint: 'feature/login' })).toEqual({ ref: 'feature/login', path: 'src/auth/login.ts', uncertain: false });
  });

  it('rejects hints that do not match the URL or contain unsafe characters', () => {
    expect(acceptBranchHint(parsed, 'main')).toBeNull();
    expect(acceptBranchHint(parsed, 'feature/log')).toBeNull();
    expect(acceptBranchHint(parsed, 'feature/login\n')).toBe('feature/login'); // trimmed
    expect(acceptBranchHint(parsed, 'feat ure')).toBeNull();
    expect(acceptBranchHint(parsed, '../etc')).toBeNull();
    expect(acceptBranchHint(parsed, 42)).toBeNull();
  });

  it('falls back to the naive split and flags uncertainty without hint or branch list', () => {
    expect(resolveRef(parsed)).toEqual({ ref: 'feature', path: 'login/src/auth/login.ts', uncertain: true });
  });
});
