/**
 * Evidence masking. Every piece of evidence that leaves the scanning engine passes through
 * `maskEvidence`, so full secret values never reach the database, logs, reports or AI prompts.
 */

const MAX_EVIDENCE_LENGTH = 240;
const MASK = '********';

/** Mask a secret value: keep at most 4 leading characters, never reveal length or suffix. */
export function maskSecret(value: string): string {
  if (!value) return MASK;
  const visible = value.length >= 16 ? 4 : value.length >= 10 ? 2 : 0;
  return value.slice(0, visible) + MASK;
}

/** Replace every occurrence of `secret` in `line` with its masked form, then truncate. */
export function maskEvidence(line: string, secrets: string[] = []): string {
  let out = line;
  for (const s of secrets) {
    if (s && s.length >= 4) out = out.split(s).join(maskSecret(s));
  }
  out = redactKnownSecretShapes(out);
  return truncateEvidence(out.trim());
}

export function truncateEvidence(text: string, max = MAX_EVIDENCE_LENGTH): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

/**
 * Defence-in-depth: redact high-confidence secret shapes even when the rule that produced the
 * evidence was not a secret rule (e.g. a malware rule whose evidence line also contains a token).
 */
const SECRET_SHAPES: RegExp[] = [
  /AKIA[0-9A-Z]{16}/g,
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  /github_pat_[A-Za-z0-9_]{40,}/g,
  /glpat-[A-Za-z0-9_-]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /sk_live_[0-9a-zA-Z]{16,}/g,
  /rk_live_[0-9a-zA-Z]{16,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
  /npm_[A-Za-z0-9]{36}/g,
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
  /SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,
  /(?<=:\/\/[^:/\s@]{1,64}:)[^@\s/]{3,}(?=@)/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY[A-Z ]*-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY[A-Z ]*-----|$)/g,
  /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/g,
];

export function redactKnownSecretShapes(text: string): string {
  let out = text;
  for (const re of SECRET_SHAPES) {
    out = out.replace(re, (m) => (m.startsWith('-----BEGIN') ? '-----BEGIN PRIVATE KEY----- ' + MASK : maskSecret(m)));
  }
  return out;
}

/** Strip anything that looks like a credential from free-form text before logging. */
export function sanitizeForLog(text: string): string {
  return truncateEvidence(redactKnownSecretShapes(text).replace(/(authorization|token|password|secret)(["'\s:=]+)[^\s"',]+/gi, `$1$2${MASK}`), 500);
}
