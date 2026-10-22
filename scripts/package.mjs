#!/usr/bin/env node
/** Zips the built unpacked extension (dist/) into release/codeguard-extension.zip. */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const releaseDir = join(root, 'release');
const zipPath = join(releaseDir, 'codeguard-extension.zip');

for (const f of ['manifest.json', 'background.js', 'content.js', 'popup.html', 'sidepanel.html']) {
  if (!existsSync(join(dist, f))) {
    console.error(`dist/${f} is missing. Run "pnpm build" first.`);
    process.exit(1);
  }
}

const hasZip = spawnSync('zip', ['-v'], { stdio: 'ignore' }).status === 0;
if (!hasZip) {
  console.log('The "zip" command is not available. Create the archive manually:');
  console.log(`  cd ${dist} && <your zip tool> -r ${zipPath} .`);
  console.log('Upload the archive to the Chrome Web Store, or load dist/ unpacked via chrome://extensions.');
  process.exit(0);
}

mkdirSync(releaseDir, { recursive: true });
rmSync(zipPath, { force: true });
execFileSync('zip', ['-r', '-X', '-q', zipPath, '.', '-x', '*.map', '-x', '.DS_Store'], { cwd: dist, stdio: 'inherit' });
console.log(`Created ${zipPath}`);
