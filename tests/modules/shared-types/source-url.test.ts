import { describe, expect, it } from 'vitest';
import { buildSourceLink, parseSourceUrl } from '../../../src/contracts/source-url';

describe('parseSourceUrl', () => {
  it('recognises a GitHub repository root', () => {
    const p = parseSourceUrl('https://github.com/organization/repository');
    expect(p).toMatchObject({ supported: true, provider: 'GITHUB', kind: 'REPOSITORY', owner: 'organization', repo: 'repository' });
    expect(p.canonicalUrl).toBe('https://github.com/organization/repository');
  });

  it('recognises GitHub branch, file, PR and commit URLs', () => {
    expect(parseSourceUrl('https://github.com/a/b/tree/dev')).toMatchObject({ kind: 'REPOSITORY', ref: 'dev', refAmbiguous: false });
    expect(parseSourceUrl('https://github.com/a/b/blob/main/src/index.js')).toMatchObject({ kind: 'FILE', ref: 'main', filePath: 'src/index.js' });
    expect(parseSourceUrl('https://github.com/a/b/pull/42/files')).toMatchObject({ kind: 'PULL_REQUEST', pullNumber: 42 });
    expect(parseSourceUrl('https://github.com/a/b/commit/abcdef1234')).toMatchObject({ commitSha: 'abcdef1234' });
    expect(parseSourceUrl('https://github.com/a/b.git')).toMatchObject({ repo: 'b' });
  });

  it('rejects non-repository GitHub pages', () => {
    expect(parseSourceUrl('https://github.com/settings/profile').supported).toBe(false);
    expect(parseSourceUrl('https://github.com/octocat').supported).toBe(false);
  });

  it('recognises GitLab nested projects and merge requests', () => {
    expect(parseSourceUrl('https://gitlab.com/group/sub/proj')).toMatchObject({ provider: 'GITLAB', projectPath: 'group/sub/proj', kind: 'REPOSITORY' });
    expect(parseSourceUrl('https://gitlab.com/group/proj/-/merge_requests/7')).toMatchObject({ kind: 'MERGE_REQUEST', pullNumber: 7 });
    expect(parseSourceUrl('https://gitlab.com/group/proj/-/blob/main/a.py')).toMatchObject({ kind: 'FILE', ref: 'main', filePath: 'a.py' });
  });

  it('recognises Bitbucket repositories and PRs', () => {
    expect(parseSourceUrl('https://bitbucket.org/ws/repo')).toMatchObject({ provider: 'BITBUCKET', kind: 'REPOSITORY' });
    expect(parseSourceUrl('https://bitbucket.org/ws/repo/pull-requests/3')).toMatchObject({ kind: 'PULL_REQUEST', pullNumber: 3 });
  });

  it('distinguishes Dropbox shared files from folders', () => {
    expect(parseSourceUrl('https://www.dropbox.com/scl/fo/abc123/xyz?rlkey=k&dl=0')).toMatchObject({ provider: 'DROPBOX', kind: 'FOLDER' });
    expect(parseSourceUrl('https://www.dropbox.com/scl/fi/abc123/app.zip?rlkey=k&dl=0')).toMatchObject({ kind: 'ARCHIVE' });
    expect(parseSourceUrl('https://www.dropbox.com/s/abc/main.py?dl=0')).toMatchObject({ kind: 'FILE' });
    expect(parseSourceUrl('https://www.dropbox.com/home').supported).toBe(false);
  });

  it('recognises Google Drive folders and files', () => {
    expect(parseSourceUrl('https://drive.google.com/drive/folders/1AbC?usp=sharing')).toMatchObject({ provider: 'GOOGLE_DRIVE', kind: 'FOLDER', shareId: '1AbC' });
    expect(parseSourceUrl('https://drive.google.com/file/d/XYZ/view')).toMatchObject({ kind: 'FILE', shareId: 'XYZ' });
    expect(parseSourceUrl('https://drive.google.com/open?id=QQ')).toMatchObject({ kind: 'FILE', shareId: 'QQ' });
  });

  it('accepts public HTTPS raw files and archives, rejects other pages', () => {
    expect(parseSourceUrl('https://example.com/dl/project.tar.gz')).toMatchObject({ provider: 'PUBLIC_URL', kind: 'ARCHIVE' });
    expect(parseSourceUrl('https://example.com/install.sh')).toMatchObject({ kind: 'FILE' });
    expect(parseSourceUrl('http://example.com/install.sh').supported).toBe(false);
    expect(parseSourceUrl('https://example.com/blog/post').supported).toBe(false);
  });

  it('rejects URLs with embedded credentials and non-http schemes', () => {
    expect(parseSourceUrl('https://user:pass@github.com/a/b').supported).toBe(false);
    expect(parseSourceUrl('file:///etc/passwd').supported).toBe(false);
    expect(parseSourceUrl('javascript:alert(1)').supported).toBe(false);
    expect(parseSourceUrl('not a url').supported).toBe(false);
  });
});

describe('buildSourceLink', () => {
  it('pins links to the exact commit and line', () => {
    expect(
      buildSourceLink({ provider: 'GITHUB', owner: 'a', repo: 'b', commitSha: 'abc', ref: 'main', filePath: 'src/x y.js', line: 10 }),
    ).toBe('https://github.com/a/b/blob/abc/src/x%20y.js#L10');
    expect(buildSourceLink({ provider: 'UPLOAD', filePath: 'a.js', ref: 'x' })).toBeNull();
  });
});
