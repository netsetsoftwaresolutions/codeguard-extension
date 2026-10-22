import { parseSourceUrl } from '../src/contracts';
import { describe, expect, it } from 'vitest';
import { getScanActions } from '../src/shared/capabilities';
import { inspectionFor } from './fixtures';

const ids = (a: { id: string }[]) => a.map((x) => x.id);

describe('getScanActions', () => {
  it('Dropbox single-file link never offers a folder scan, even if the API reports scanFolder', () => {
    const url = 'https://www.dropbox.com/scl/fi/abc123/app.js?rlkey=xyz';
    const actions = getScanActions(parseSourceUrl(url), inspectionFor(url, { branches: null, defaultBranch: null }));
    expect(ids(actions)).toEqual(['SCAN_SHARED_FILE']);
    expect(actions[0]!.label).toBe('Scan this file');
  });

  it('Dropbox folder link offers the folder scan, disabled when the API cannot list it', () => {
    const url = 'https://www.dropbox.com/scl/fo/abc123/key?rlkey=xyz';
    const insp = inspectionFor(url, {
      capabilities: { scanFile: true, scanBranch: false, scanRepository: false, scanAllBranches: false, scanPullRequest: false, scanFolder: false },
    });
    const actions = getScanActions(parseSourceUrl(url), insp);
    expect(ids(actions)).toEqual(['SCAN_SHARED_FOLDER']);
    expect(actions[0]!.label).toBe('Scan accessible folder contents');
    expect(actions[0]!.enabled).toBe(false);
    expect(actions[0]!.reason).toBeTruthy();
  });

  it('Google Drive file link offers only a file scan', () => {
    const url = 'https://drive.google.com/file/d/1AbC/view';
    expect(ids(getScanActions(parseSourceUrl(url), inspectionFor(url)))).toEqual(['SCAN_SHARED_FILE']);
  });

  it('GitHub pull request page shows the PR scan first and no branch/file scan', () => {
    const url = 'https://github.com/acme/app/pull/42';
    const actions = getScanActions(parseSourceUrl(url), inspectionFor(url));
    expect(actions[0]).toMatchObject({ id: 'SCAN_PULL_REQUEST', enabled: true, primary: true, label: 'Scan this pull request' });
    expect(ids(actions)).not.toContain('SCAN_FILE');
    expect(ids(actions)).not.toContain('SCAN_BRANCH');
  });

  it('PR scan is disabled when the API reports no capability', () => {
    const url = 'https://github.com/acme/app/pull/42';
    const insp = inspectionFor(url);
    insp.capabilities.scanPullRequest = false;
    expect(getScanActions(parseSourceUrl(url), insp)[0]).toMatchObject({ id: 'SCAN_PULL_REQUEST', enabled: false });
  });

  it('GitHub repository root shows branch (default), repository and all-branches scans', () => {
    const url = 'https://github.com/acme/app';
    const actions = getScanActions(parseSourceUrl(url), inspectionFor(url));
    expect(ids(actions)).toEqual(['SCAN_BRANCH', 'SCAN_REPOSITORY', 'SCAN_ALL_BRANCHES']);
    expect(actions[0]).toMatchObject({ ref: 'main', enabled: true });
    expect(actions[2]!.label).toBe('Scan all accessible branches (3)');
  });

  it('GitHub file view resolves a slash-containing branch via the branch list', () => {
    const url = 'https://github.com/acme/app/blob/feature/login/src/auth.ts';
    const actions = getScanActions(parseSourceUrl(url), inspectionFor(url));
    const file = actions.find((a) => a.id === 'SCAN_FILE')!;
    expect(file).toMatchObject({ enabled: true, ref: 'feature/login', path: 'src/auth.ts', label: 'Scan current file' });
    expect(actions.find((a) => a.id === 'SCAN_BRANCH')).toMatchObject({ ref: 'feature/login' });
  });

  it('respects capability flags for repository scans', () => {
    const url = 'https://github.com/acme/app';
    const insp = inspectionFor(url, { accessible: false });
    insp.capabilities = { scanFile: false, scanBranch: false, scanRepository: false, scanAllBranches: false, scanPullRequest: false, scanFolder: false };
    const actions = getScanActions(parseSourceUrl(url), insp);
    expect(actions.every((a) => !a.enabled)).toBe(true);
    expect(actions[0]!.reason).toMatch(/not accessible/);
  });

  it('returns nothing for unsupported pages or before inspection', () => {
    expect(getScanActions(parseSourceUrl('https://example.com/'), null)).toEqual([]);
    expect(getScanActions(parseSourceUrl('https://github.com/acme/app'), null)).toEqual([]);
  });
});
