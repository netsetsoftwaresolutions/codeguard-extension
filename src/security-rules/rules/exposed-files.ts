import type { Confidence, Severity } from '../../contracts';
import { isTestOrExamplePath } from '../context';
import type { RuleHit, RuleMeta } from '../types';

/**
 * Path-based rules evaluated against the file inventory (including binary files that are not content-scanned).
 */
export const exposedFileRules: RuleMeta[] = [
  {
    id: 'CG-EXP-001',
    name: 'Environment file committed',
    description: 'A .env file is present in the source tree. These usually contain real credentials and should never be committed.',
    category: 'EXPOSED_FILE',
    severity: 'MEDIUM',
    confidence: 'HIGH',
    classification: 'CONFIRMED',
    languages: 'any',
    matching: 'File named .env or .env.<environment> (excluding .env.example/.sample/.template/.dist/.defaults).',
    falsePositiveGuidance: 'Files containing only non-sensitive defaults are low risk. Secret findings in the same file are reported separately.',
    remediation: 'Remove the file from the repository and its history, add it to .gitignore, and rotate any credentials it contained.',
    references: ['https://cwe.mitre.org/data/definitions/538.html'],
  },
  {
    id: 'CG-EXP-002',
    name: 'Private key or keystore file',
    description: 'A private key, certificate keystore or credential container is present in the source tree.',
    category: 'EXPOSED_FILE',
    severity: 'HIGH',
    confidence: 'MEDIUM',
    classification: 'SUSPICIOUS',
    languages: 'any',
    matching: 'Files named id_rsa/id_dsa/id_ecdsa/id_ed25519 or with extensions .pem/.key/.p12/.pfx/.jks/.keystore/.ppk/.asc (private).',
    falsePositiveGuidance: 'Test certificates and public certificates (.crt/.cer) are common. Verify whether the file holds private key material.',
    remediation: 'Remove the file, purge it from history, and revoke/rotate the key.',
    references: ['https://cwe.mitre.org/data/definitions/321.html'],
  },
  {
    id: 'CG-EXP-003',
    name: 'Credential or state file committed',
    description: 'A file that typically holds credentials or sensitive infrastructure state is present (e.g. .git-credentials, .htpasswd, terraform.tfstate, service-account JSON, .npmrc/.pypirc).',
    category: 'EXPOSED_FILE',
    severity: 'MEDIUM',
    confidence: 'MEDIUM',
    classification: 'SUSPICIOUS',
    languages: 'any',
    matching: 'Filenames: .git-credentials, .htpasswd, .netrc, .pgpass, terraform.tfstate(.backup), credentials.json, service-account*.json, *-sa.json, .npmrc, .pypirc, .dockercfg, wp-config.php, database dumps (*.sql.gz, dump.sql, *.sqlite/*.db outside tests).',
    falsePositiveGuidance: 'Project-level .npmrc files often contain only registry settings. Secret findings in these files are reported separately.',
    remediation: 'Remove sensitive state/credential files from the repository and rotate any secrets they contained.',
    references: ['https://cwe.mitre.org/data/definitions/538.html'],
  },
  {
    id: 'CG-EXP-004',
    name: 'Unexpected executable binary',
    description: 'A compiled executable or native library is committed to the source tree. Binaries cannot be reviewed like source and are a common way to smuggle malware into repositories.',
    category: 'SUPPLY_CHAIN',
    severity: 'MEDIUM',
    confidence: 'LOW',
    classification: 'SUSPICIOUS',
    languages: 'any',
    matching: 'Files with executable extensions (.exe, .dll, .scr, .com, .msi, .so, .dylib, .bin, .elf, .apk, .jar except gradle-wrapper.jar) or whose content starts with ELF / PE (MZ) / Mach-O magic bytes.',
    falsePositiveGuidance: 'Vendored tools and test binaries are common. Verify their origin and checksum.',
    remediation: 'Replace committed binaries with reproducible builds or downloads verified by checksum from the official source.',
    references: ['https://attack.mitre.org/techniques/T1195/'],
  },
  {
    id: 'CG-EXP-005',
    name: 'File blocked from reading (possible antivirus detection)',
    description: 'The scanner could not open this file. On hosts with real-time antivirus this almost always means the antivirus detected the file as malicious and blocked or quarantined it, so its contents were not analyzed.',
    category: 'SUPPLY_CHAIN',
    severity: 'HIGH',
    confidence: 'MEDIUM',
    classification: 'SUSPICIOUS',
    languages: 'any',
    matching: 'Opening a regular file in the downloaded source failed (e.g. EPERM/EACCES, or UNKNOWN on Windows when Defender blocks the file).',
    falsePositiveGuidance: 'A plain permission or filesystem error can also cause this. Check the host antivirus history for the file path before dismissing.',
    remediation: 'Inspect the file in an isolated environment (or rescan on a worker without host antivirus). If antivirus flagged it, treat the repository as compromised: remove the file, audit its history and rotate credentials it could have reached.',
    references: ['https://attack.mitre.org/techniques/T1195/'],
  },
];

const ENV_FILE = /(^|\/)\.env(\.[\w-]+)?$/i;
const ENV_TEMPLATE = /\.(example|sample|template|dist|defaults?|tpl|schema)$/i;
const KEY_FILE = /(^|\/)(id_(rsa|dsa|ecdsa|ed25519))$|\.(pem|key|p12|pfx|jks|keystore|ppk)$/i;
const CRED_FILE = /(^|\/)(\.git-credentials|\.htpasswd|\.netrc|\.pgpass|terraform\.tfstate(\.backup)?|credentials\.json|service[-_]?account[^/]*\.json|[^/]*-sa\.json|\.npmrc|\.pypirc|\.dockercfg|wp-config\.php|dump\.sql|[^/]+\.sql\.gz)$/i;
const DB_FILE = /\.(sqlite3?|db)$/i;
const EXEC_EXT = /\.(exe|dll|scr|com|msi|so|dylib|bin|elf|apk|jar|sys|pif|cpl)$/i;
const ALLOWED_BINARIES = /(^|\/)(gradle-wrapper\.jar|maven-wrapper\.jar)$/i;

function meta(id: string): RuleMeta {
  return exposedFileRules.find((r) => r.id === id)!;
}

function hit(id: string, path: string, evidence: string, overrides: { severity?: Severity; confidence?: Confidence } = {}): RuleHit {
  const testy = isTestOrExamplePath(path);
  return {
    ruleId: id,
    line: null,
    evidence,
    fingerprintKey: path,
    severity: overrides.severity ?? meta(id).severity,
    confidence: testy ? 'LOW' : overrides.confidence ?? meta(id).confidence,
    classification: testy ? 'FALSE_POSITIVE_CANDIDATE' : meta(id).classification,
    extraDescription: testy ? 'Possible false positive: the file is in a test, fixture or example location.' : undefined,
  };
}

/**
 * Evaluate path-based rules for one inventory entry.
 * @param head first bytes of the file (used for magic-byte executable detection); may be empty.
 * @param readError error code when the file could not be opened (see CG-EXP-005).
 */
export function analyzePath(path: string, head: Uint8Array | null, readError?: string): RuleHit[] {
  const hits: RuleHit[] = [];
  const base = path.split('/').pop() ?? path;
  // No test-path downgrade: an antivirus block in a fixture folder is just as serious.
  if (readError) hits.push({ ruleId: 'CG-EXP-005', line: null, evidence: `${base} (open failed: ${readError})`, fingerprintKey: path });
  if (ENV_FILE.test(path) && !ENV_TEMPLATE.test(base)) hits.push(hit('CG-EXP-001', path, base));
  if (KEY_FILE.test(path) && !/\.pub$/i.test(base)) {
    // A .key/.pem file that is actually a public certificate is less severe.
    hits.push(hit('CG-EXP-002', path, base));
  }
  if (CRED_FILE.test(path)) hits.push(hit('CG-EXP-003', path, base, /\.npmrc$|\.pypirc$/i.test(base) ? { severity: 'LOW' } : {}));
  else if (DB_FILE.test(path)) hits.push(hit('CG-EXP-003', path, base, { severity: 'LOW', confidence: 'LOW' }));

  let execReason: string | null = null;
  if (EXEC_EXT.test(base) && !ALLOWED_BINARIES.test(path)) execReason = 'executable file extension';
  if (head && head.length >= 4) {
    if (head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) execReason = 'ELF executable header';
    else if (head[0] === 0x4d && head[1] === 0x5a && !/\.(png|jpg|gif|ico|pdf)$/i.test(base)) execReason = 'Windows PE (MZ) header';
    else if ((head[0] === 0xcf || head[0] === 0xce) && head[1] === 0xfa && head[2] === 0xed && head[3] === 0xfe) execReason = 'Mach-O executable header';
  }
  if (execReason && !ALLOWED_BINARIES.test(path)) hits.push(hit('CG-EXP-004', path, `${base} (${execReason})`));
  return hits;
}
