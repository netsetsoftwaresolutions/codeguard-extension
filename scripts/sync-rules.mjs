// Copies the scanner's rule engine into the extension so browser scans run the exact same rules.
// Usage: npm run sync:rules [path-to-codeguard-scanner]   (default: ../../nodejs/codeguard-scanner)
import { cpSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const scanner = resolve(process.argv[2] ?? '../../nodejs/codeguard-scanner');
rmSync('src/security-rules', { recursive: true, force: true });
cpSync(resolve(scanner, 'src/security-rules'), 'src/security-rules', { recursive: true });
console.log(`Copied rules from ${scanner}`);
