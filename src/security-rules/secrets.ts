import type { Confidence, Severity } from '../contracts';
import { applyContext } from './rules/helpers';
import { looksLikePlaceholder, shannonEntropy } from './entropy';
import type { FileContext, RuleHit, RuleMeta } from './types';

/**
 * Built-in secret detection (engine id `codeguard-secrets`). Gitleaks runs in addition when installed.
 * Secret values are only held in memory for masking; findings carry masked evidence only.
 */
interface SecretPattern {
  id: string;
  name: string;
  secretType: string;
  /** Group 1 (if present) is the secret value; otherwise the whole match. */
  pattern: RegExp;
  severity: Severity;
  confidence: Confidence;
  /** Minimum Shannon entropy of the captured value. */
  minEntropy?: number;
  rotation: string;
  references?: string[];
}

const PATTERNS: SecretPattern[] = [
  { id: 'CG-SEC-001', name: 'AWS access key ID', secretType: 'Cloud credential', pattern: /\b((?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16})\b/, severity: 'HIGH', confidence: 'HIGH', rotation: 'Deactivate the key in AWS IAM, create a replacement, and review CloudTrail for misuse.' },
  { id: 'CG-SEC-002', name: 'AWS secret access key', secretType: 'Cloud credential', pattern: /aws_?secret_?(?:access_?)?key['"]?\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})(?![A-Za-z0-9/+=])/i, severity: 'CRITICAL', confidence: 'HIGH', minEntropy: 3.5, rotation: 'Rotate the IAM key pair immediately and review CloudTrail for misuse.' },
  { id: 'CG-SEC-003', name: 'GitHub token', secretType: 'Access token', pattern: /\b(gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{82})\b/, severity: 'HIGH', confidence: 'HIGH', rotation: 'Revoke the token at github.com/settings/tokens (or the GitHub App) and audit repository/org activity.' },
  { id: 'CG-SEC-004', name: 'GitLab personal access token', secretType: 'Access token', pattern: /\b(glpat-[A-Za-z0-9_-]{20,})\b/, severity: 'HIGH', confidence: 'HIGH', rotation: 'Revoke the token in GitLab user settings and review audit events.' },
  { id: 'CG-SEC-005', name: 'Slack token', secretType: 'Access token', pattern: /\b(xox[baprs]-[A-Za-z0-9]{10,48}(?:-[A-Za-z0-9]{10,48}){1,4})\b/, severity: 'HIGH', confidence: 'HIGH', rotation: 'Revoke the token in the Slack app configuration.' },
  { id: 'CG-SEC-006', name: 'Slack incoming webhook', secretType: 'Webhook secret', pattern: /(https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{6,}\/B[A-Z0-9]{6,}\/[A-Za-z0-9]{20,})/, severity: 'MEDIUM', confidence: 'HIGH', rotation: 'Regenerate the webhook URL in Slack.' },
  { id: 'CG-SEC-007', name: 'Stripe live secret key', secretType: 'Payment credential', pattern: /\b((?:sk|rk)_live_[0-9a-zA-Z]{24,99})\b/, severity: 'CRITICAL', confidence: 'HIGH', rotation: 'Roll the key in the Stripe dashboard and review account activity.' },
  { id: 'CG-SEC-008', name: 'Google API key', secretType: 'API key', pattern: /\b(AIza[0-9A-Za-z_-]{35})\b/, severity: 'MEDIUM', confidence: 'HIGH', rotation: 'Restrict or regenerate the key in Google Cloud Console. Browser keys must have HTTP referrer and API restrictions.' },
  { id: 'CG-SEC-009', name: 'Private key', secretType: 'Private key', pattern: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----)/, severity: 'HIGH', confidence: 'HIGH', rotation: 'Revoke and replace the key pair; remove it from repository history.' },
  { id: 'CG-SEC-010', name: 'npm access token', secretType: 'Access token', pattern: /\b(npm_[A-Za-z0-9]{36})\b/, severity: 'HIGH', confidence: 'HIGH', rotation: 'Revoke the token on npmjs.com and check recently published package versions.' },
  { id: 'CG-SEC-011', name: 'npm auth token in .npmrc', secretType: 'Access token', pattern: /_authToken\s*=\s*([^\s$][^\s]{15,})/, severity: 'HIGH', confidence: 'MEDIUM', minEntropy: 3.0, rotation: 'Revoke the registry token and use an environment variable reference (${NPM_TOKEN}) instead.' },
  { id: 'CG-SEC-012', name: 'OpenAI API key', secretType: 'API key', pattern: /\b(sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,})\b/, severity: 'HIGH', confidence: 'HIGH', rotation: 'Revoke the key in the OpenAI dashboard.' },
  { id: 'CG-SEC-013', name: 'Anthropic API key', secretType: 'API key', pattern: /\b(sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,})\b/, severity: 'HIGH', confidence: 'HIGH', rotation: 'Revoke the key in the Anthropic Console.' },
  { id: 'CG-SEC-014', name: 'SendGrid API key', secretType: 'API key', pattern: /\b(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})\b/, severity: 'HIGH', confidence: 'HIGH', rotation: 'Delete the key in SendGrid and create a new restricted key.' },
  { id: 'CG-SEC-015', name: 'Twilio API key', secretType: 'API key', pattern: /\b(SK[0-9a-f]{32})\b/, severity: 'MEDIUM', confidence: 'MEDIUM', minEntropy: 3.2, rotation: 'Delete the API key in the Twilio console.' },
  { id: 'CG-SEC-016', name: 'Telegram bot token', secretType: 'Access token', pattern: /\b(\d{8,10}:AA[A-Za-z0-9_-]{33})\b/, severity: 'MEDIUM', confidence: 'HIGH', rotation: 'Revoke the token with @BotFather (/revoke).' },
  { id: 'CG-SEC-017', name: 'Database connection string with password', secretType: 'Database credential', pattern: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|sqlserver):\/\/[^:\s/@'"]{1,64}:([^@\s'"/]{4,128})@[\w.-]+/i, severity: 'HIGH', confidence: 'MEDIUM', rotation: 'Change the database password, restrict network access, and load the connection string from a secret store.' },
  { id: 'CG-SEC-018', name: 'JSON Web Token', secretType: 'Authentication token', pattern: /\b(eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{16,})\b/, severity: 'LOW', confidence: 'MEDIUM', rotation: 'If the token is long-lived, revoke it or rotate the signing key.' },
  { id: 'CG-SEC-019', name: 'Azure storage account key', secretType: 'Cloud credential', pattern: /AccountKey=([A-Za-z0-9+/]{86}==)/, severity: 'CRITICAL', confidence: 'HIGH', rotation: 'Regenerate the storage account key in the Azure portal.' },
  { id: 'CG-SEC-020', name: 'Google service-account private key', secretType: 'Cloud credential', pattern: /"private_key"\s*:\s*"(-----BEGIN PRIVATE KEY-----[^"]{20,})/, severity: 'CRITICAL', confidence: 'HIGH', rotation: 'Delete the service-account key in Google Cloud IAM and create a new one if required.' },
  {
    id: 'CG-SEC-100',
    name: 'Hardcoded credential assignment',
    secretType: 'Hardcoded password / secret',
    pattern: /\b(?:password|passwd|pwd|secret|secret_?key|api_?key|apikey|access_?token|auth_?token|client_?secret|private_?key|signing_?key|encryption_?key)['"]?\s*(?::|=|=>|:=)\s*['"]([^'"\s]{8,128})['"]/i,
    severity: 'MEDIUM',
    confidence: 'LOW',
    minEntropy: 3.3,
    rotation: 'Move the value to a secret manager or environment variable and rotate it if it was ever valid.',
  },
];

export const secretRuleMeta: RuleMeta[] = PATTERNS.map((p) => ({
  id: p.id,
  name: p.name,
  description: `Potential ${p.secretType.toLowerCase()} (${p.name}) committed to source code.`,
  category: 'SECRET',
  severity: p.severity,
  confidence: p.confidence,
  classification: p.confidence === 'HIGH' ? 'CONFIRMED' : 'SUSPICIOUS',
  languages: 'any',
  matching: `Regular expression ${p.pattern.source.length > 140 ? p.pattern.source.slice(0, 140) + '…' : p.pattern.source}${p.minEntropy ? `; captured value entropy ≥ ${p.minEntropy} bits/char` : ''}; placeholders, templates and environment references are ignored.`,
  falsePositiveGuidance: 'Example values, test fixtures and revoked credentials may match. "Confirmed" means the value matches a provider-specific format — CodeGuard never tests whether a secret is live.',
  remediation: p.rotation + ' Remove the secret from the code and from Git history (e.g. git filter-repo), then load it from a secret manager.',
  references: p.references ?? ['https://cwe.mitre.org/data/definitions/798.html'],
}));

const FILE_SKIP = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|composer\.lock|Pipfile\.lock|go\.sum|Cargo\.lock)$|\.(svg|map|min\.js)$/i;

export interface SecretScanOptions {
  /** Regex sources or literal path prefixes that suppress secret findings (validated project allowlist). */
  allowlist?: string[];
}

function allowlisted(path: string, line: string, allowlist: string[]): boolean {
  for (const entry of allowlist) {
    if (!entry) continue;
    if (path === entry || path.startsWith(entry.endsWith('/') ? entry : entry + '/')) return true;
    if (entry.startsWith('re:')) {
      try {
        if (new RegExp(entry.slice(3)).test(line)) return true;
      } catch {
        // invalid patterns are rejected at configuration time; ignore defensively here
      }
    }
  }
  return false;
}

export function scanSecrets(ctx: FileContext, options: SecretScanOptions = {}): RuleHit[] {
  if (FILE_SKIP.test(ctx.path)) return [];
  const allow = options.allowlist ?? [];
  const hits: RuleHit[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ctx.lines.length; i++) {
    const line = ctx.lines[i]!;
    if (line.length < 8 || line.length > 5000) continue;
    for (const p of PATTERNS) {
      const m = p.pattern.exec(line);
      if (!m) continue;
      const value = m[1] ?? m[0];
      if (p.id !== 'CG-SEC-009' && looksLikePlaceholder(value)) continue;
      if (/\$\{|\{\{|process\.env|os\.environ|getenv|ENV\[/.test(value)) continue;
      if (p.minEntropy && shannonEntropy(value) < p.minEntropy) continue;
      if (p.id === 'CG-SEC-100' && /^(true|false|null|none|\w+\.\w+\(.*\))$/i.test(value)) continue;
      if (allowlisted(ctx.path, line, allow)) continue;
      const key = `${p.id}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const meta = secretRuleMeta.find((r) => r.id === p.id)!;
      const hit: RuleHit = {
        ruleId: p.id,
        line: i + 1,
        evidence: line,
        secretValue: value,
        // fingerprint on a hash-safe derivative (rule + value length + first 4 chars) – never the value itself
        fingerprintKey: `${p.id}:${value.length}:${value.slice(0, 4)}:${line.replace(value, '').trim().slice(0, 80)}`,
        severity: p.severity,
        confidence: p.confidence,
        metadata: { secretType: p.secretType, rotation: p.rotation },
      };
      hits.push(applyContext(hit, meta, ctx, line));
      break; // one secret finding per line is enough
    }
  }
  return hits;
}
