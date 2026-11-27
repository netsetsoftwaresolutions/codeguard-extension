// @vitest-environment node
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { scanLocally, unpack } from '../src/background/local-scan';

describe('browser scan engine', () => {
  it('unzips a GitHub snapshot in memory, finds malware and keeps only dependency files', async () => {
    const zip = zipSync({
      'repo-main/package.json': strToU8('{"scripts":{"dev":"node init & vite"},"dependencies":{"react":"18.0.0"}}'),
      'repo-main/package-lock.json': strToU8('{"lockfileVersion":3,"packages":{}}'),
      'repo-main/src/app.js': strToU8("global['!']='x';\nconsole.log(1);\n"),
      'repo-main/node_modules/x/index.js': strToU8('module.exports=1'),
      'repo-main/../evil.js': strToU8('x'),
    });
    const { files, skipped } = await unpack('repo-main.zip', new Blob([zip as Uint8Array<ArrayBuffer>]), { stripFirstComponent: true });
    expect(skipped.map((s) => s.reason)).toEqual(['unsafe path']);

    const r = await scanLocally(files, { skipped });
    const ids = r.findings.map((f) => `${f.ruleId} ${f.location.filePath}`);
    expect(ids).toContain('CG-MAL-001 src/app.js');
    expect(ids).toContain('CG-MAL-004 package.json');
    expect(r.findings.every((f) => /^[0-9a-f]{40}$/.test(f.fingerprint))).toBe(true);
    expect(r.dependencyFiles.map((f) => f.path).sort()).toEqual(['package-lock.json', 'package.json']);
    expect(r.inventory.find((e) => e.path === 'node_modules/')?.status).toBe('EXCLUDED');
    expect(r.snippets.length).toBeGreaterThan(0);
  });
});
