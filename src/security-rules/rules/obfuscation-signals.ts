import type { Confidence } from '../../contracts';
import { shannonEntropy } from '../entropy';
import type { FileContext } from '../types';

/**
 * Independent indicators of hidden code execution, combined by proximity into one confidence.
 * No single indicator (a long line, a high-entropy string, an escape sequence, one eval) is enough:
 * a finding needs an execution sink plus evidence that what it runs is hidden, or a hidden
 * dangerous function name. Only `ctx.code` is read, so template markup and CSS never contribute.
 */

export type SignalKind = 'exec' | 'decode' | 'layered' | 'payload' | 'escapes' | 'identifiers' | 'hiddenName' | 'dense';

export interface Signal {
  kind: SignalKind;
  index: number;
  label: string;
  /** exec: the text after the call opens; used to see whether a decoded variable flows in. */
  arg?: string;
  /** decode: the variable the decoded value is assigned to. */
  assigned?: string;
}

export interface Cluster {
  index: number;
  confidence: Confidence;
  indicators: string[];
}

const DECODERS = 'atob|unescape|decodeURIComponent|base64_decode|gzinflate|gzuncompress|gzdecode|str_rot13|hex2bin|convert_uudecode|b64decode';
const DANGEROUS = new Set([
  'eval', 'assert', 'system', 'exec', 'execsync', 'spawn', 'shell_exec', 'passthru', 'popen', 'proc_open', 'pcntl_exec',
  'create_function', 'call_user_func', 'call_user_func_array', 'base64_decode', 'gzinflate', 'gzuncompress', 'str_rot13',
  'preg_replace', 'atob', 'function', 'constructor', 'child_process', 'require', 'settimeout', 'setinterval',
]);

const EXEC_JS = /\beval\s*\(|\bnew\s+Function\s*\((?!\s*(['"`])[^'"`]*\1\s*\))|(?<![\w.$])Function\s*\((?!\s*(['"`])[^'"`]*\2\s*\))[^)]*\)\s*\(|\bvm\.run(?:InThisContext|InNewContext|InContext)\s*\(|\bset(?:Timeout|Interval)\s*\(\s*['"`]|\[\s*['"]constructor['"]\s*\]\s*\(/g;
const EXEC_PHP = /\b(?:eval|assert|create_function)\s*\(|\bpreg_replace\s*\(\s*(['"])([^\w\s\\])(?:(?!\1).)*?\2[a-zA-Z]*e[a-zA-Z]*\1/g;
const DECODE = new RegExp(`(?:(\\$?[A-Za-z_]\\w*)\\s*=\\s*@?\\s*)?(?:\\b(?:${DECODERS})\\s*\\(|Buffer\\.from\\s*\\([^)\\n]*['"](?:base64|hex)['"]|String\\.fromCharCode\\s*\\(|\\bpack\\s*\\(\\s*['"]H\\*)`, 'g');
const LAYERED = new RegExp(`\\b(?:${DECODERS})\\s*\\(\\s*@?\\s*(?:${DECODERS})\\s*\\(`, 'g');
const PAYLOAD = /(['"`])([A-Za-z0-9+/=_-]{200,}|[0-9a-fA-F]{400,})\1/g;
// \x41, A (ASCII written as escapes) and octal \101. CJK text such as 你 is ordinary i18n.
const ESCAPE = /\\x[0-9a-fA-F]{2}|\\u00[0-7][0-9a-fA-F]|\\[0-3][0-7]{2}/g;

const WINDOW = 1500;

/** Index of the first character of every line. */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** 1-based line containing `index` (binary search over lineStarts). */
export function lineOf(starts: number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function decodeEscapes(s: string): string {
  return s.replace(/\\x([0-9a-fA-F]{2})|\\([0-7]{1,3})/g, (_, h: string | undefined, o: string | undefined) => String.fromCharCode(h ? parseInt(h, 16) : parseInt(o!, 8)));
}
const rot13 = (s: string) => s.replace(/[a-z]/gi, (c) => String.fromCharCode(((c.toLowerCase().charCodeAt(0) - 97 + 13) % 26) + (c <= 'Z' ? 65 : 97)));
function fromBase64(s: string): string {
  try {
    return atob(s);
  } catch {
    return '';
  }
}

/** The arguments of a call whose "(" was just consumed: up to the balancing ")" on the same line (max 300 chars). */
function callArgs(code: string, from: number): string {
  let depth = 1;
  for (let i = from; i < code.length && i < from + 300; i++) {
    const ch = code[i];
    if (ch === '\n') return code.slice(from, i);
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return code.slice(from, i);
  }
  return code.slice(from, from + 300);
}

/** Dangerous function names written so a keyword search cannot see them. */
function hiddenNames(code: string): Signal[] {
  const out: Signal[] = [];
  const add = (index: number, name: string, how: string) => {
    const n = name.trim().toLowerCase();
    if (DANGEROUS.has(n)) out.push({ kind: 'hiddenName', index, label: `"${n}" hidden by ${how}` });
  };
  const each = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(code)) && guard++ < 500) fn(m);
  };
  each(/(['"])[\w.$]{1,12}\1(?:\s*[.+]\s*(['"])[\w.$]{1,12}\2)+/g, (m) => add(m.index, [...m[0].matchAll(/(['"])([\w.$]*)\1/g)].map((f) => f[2]).join(''), 'string splitting'));
  each(/(['"])((?:\\x[0-9a-fA-F]{2}|\\[0-7]{1,3}){3,})\1/g, (m) => add(m.index, decodeEscapes(m[2]!), 'escape sequences'));
  each(/\bstr_rot13\s*\(\s*(['"])(\w+)\1/g, (m) => add(m.index, rot13(m[2]!), 'ROT13'));
  each(/\bstrrev\s*\(\s*(['"])(\w+)\1/g, (m) => add(m.index, [...m[2]!].reverse().join(''), 'reversal'));
  each(/(?:\bchr\s*\(\s*\d+\s*\)\s*\.\s*)+\bchr\s*\(\s*\d+\s*\)/gi, (m) => add(m.index, [...m[0].matchAll(/\d+/g)].map((d) => String.fromCharCode(Number(d[0]))).join(''), 'chr() codes'));
  each(/String\.fromCharCode\s*\(\s*(\d+(?:\s*,\s*\d+)+)\s*\)/g, (m) => add(m.index, m[1]!.split(',').map((d) => String.fromCharCode(Number(d))).join(''), 'character codes'));
  each(/\b(?:atob|base64_decode)\s*\(\s*(['"])([A-Za-z0-9+/]{4,24}={0,2})\1/g, (m) => add(m.index, fromBase64(m[2]!), 'Base64'));
  return out;
}

/** Every indicator in the executable part of the file. */
export function collectSignals(ctx: FileContext): Signal[] {
  const code = ctx.code;
  const signals: Signal[] = [];
  const scan = (re: RegExp, fn: (m: RegExpExecArray) => Signal | null) => {
    const g = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = g.exec(code)) && guard++ < 2000) {
      const s = fn(m);
      if (s) signals.push(s);
      if (m[0].length === 0) g.lastIndex++;
    }
  };

  const execLabel = (m: RegExpExecArray) => `dynamic code execution (${m[0].replace(/\s+/g, '').slice(0, 24)})`;
  const execSignal = (m: RegExpExecArray): Signal => ({ kind: 'exec', index: m.index, label: execLabel(m), arg: callArgs(code, m.index + m[0].length) });
  scan(EXEC_JS, execSignal);
  if (ctx.language === 'php') scan(EXEC_PHP, execSignal);
  scan(DECODE, (m) => ({ kind: 'decode', index: m.index, label: 'decoding call', assigned: m[1] }));
  scan(LAYERED, (m) => ({ kind: 'layered', index: m.index, label: 'multiple encoding layers' }));
  // `name = "<literal>"` on the literal's own line: the variable the hidden data lives in.
  const assignedOn = (lineText: string) => /^\s*(?:(?:var|let|const)\s+)?(\$?[A-Za-z_]\w*)\s*=/.exec(lineText)?.[1];
  const lineText = (index: number) => code.slice(code.lastIndexOf('\n', index - 1) + 1, index);
  scan(PAYLOAD, (m) => {
    const body = m[2]!;
    const hex = /^[0-9a-fA-F]+$/.test(body);
    if (!hex && (shannonEntropy(body.slice(0, 4096)) < 4.8 || !/\d/.test(body) || !/[a-z]/.test(body) || !/[A-Z]/.test(body))) return null;
    return { kind: 'payload', index: m.index, assigned: assignedOn(lineText(m.index)), label: `encoded payload (${body.length} chars${hex ? ', hex' : `, entropy ${shannonEntropy(body.slice(0, 4096)).toFixed(1)}`})` };
  });

  const starts = lineStarts(code);
  ctx.codeLines.forEach((l, i) => {
    const escapes = l.match(ESCAPE)?.length ?? 0;
    if (escapes >= 16) signals.push({ kind: 'escapes', index: starts[i]!, assigned: assignedOn(l), label: `${escapes} hex/octal escape sequences on one line` });
    // Kept only as a weak indicator: CSS, templates and minified code also produce long dense lines.
    if (l.length >= 600 && (l.match(/[(){};]/g)?.length ?? 0) / l.length > 0.03) signals.push({ kind: 'dense', index: starts[i]!, label: 'long line with dense code punctuation' });
  });

  const obf = code.match(/\b_0x[0-9a-f]{4,6}\b/g);
  if (obf && new Set(obf).size >= 10) signals.push({ kind: 'identifiers', index: code.indexOf(obf[0]!), label: `${new Set(obf).size} obfuscator-style _0x identifiers` });
  const php = code.match(/\$(?=[O0_]*O)(?=[O0_]*0)[O0_]{4,}\b/g);
  if (php && new Set(php).size >= 3) signals.push({ kind: 'identifiers', index: code.indexOf(php[0]!), label: `${new Set(php).size} look-alike $O0O0 identifiers` });

  signals.push(...hiddenNames(code));
  return signals.sort((a, b) => a.index - b.index);
}

const STRONG: SignalKind[] = ['payload', 'escapes', 'identifiers', 'layered', 'hiddenName'];
const RANK: Record<Confidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

function score(anchor: Signal, near: Signal[], code: string): Confidence | null {
  const kinds = new Set(near.map((s) => s.kind));
  // A decoder nested in the sink's own call, e.g. eval(atob(...)) or new Function(..., unescape(...)).
  const nested = near.some((s) => s.kind === 'decode' && s.index > anchor.index && s.index - anchor.index < 200 && !code.slice(anchor.index, s.index).includes('\n'));
  if (anchor.kind === 'hiddenName') {
    // `$f = 'sys'.'tem'; $f(...)`: the variable holding the hidden name is called.
    const before = code.slice(code.lastIndexOf('\n', anchor.index) + 1, anchor.index);
    const v = /(\$?[A-Za-z_]\w*)\s*=\s*(?:\w+\s*\[\s*)?$/.exec(before)?.[1];
    const calledLater = !!v && new RegExp(`(^|[^\\w$])${v.replace(/\$/g, '\\$')}\\s*\\(`).test(code.slice(anchor.index, anchor.index + 400));
    return kinds.has('exec') || kinds.has('decode') || calledLater ? 'HIGH' : 'MEDIUM';
  }
  // The value a decoder (or a hidden literal) was assigned to is passed into the sink.
  const feeds = (s: Signal) => !!s.assigned && new RegExp(`(^|[^\\w$])${s.assigned.replace(/\$/g, '\\$')}\\b`).test(anchor.arg ?? '');
  const flow = near.some((s) => s.kind === 'decode' && feeds(s));
  const hiddenLiteralRuns = near.some((s) => (s.kind === 'payload' || s.kind === 'escapes') && feeds(s));
  const strong = STRONG.some((k) => kinds.has(k));
  // A decode elsewhere in the neighbourhood that does not reach the sink is not evidence.
  if (kinds.has('layered') || hiddenLiteralRuns || ((nested || flow) && strong)) return 'HIGH';
  if (nested || flow || strong) return 'MEDIUM';
  return null;
}

/**
 * Combine signals within ~1500 characters (about 30 lines, or one stretch of a minified line).
 * `skip(index)` removes anchors another rule already reports at that spot (no duplicate findings).
 * Minified and generated files only report high-confidence clusters.
 */
export function assessSignals(signals: Signal[], ctx: FileContext, skip: (index: number) => boolean): Cluster[] {
  const strictOnly = ctx.isMinified || ctx.isGenerated;
  const candidates: Cluster[] = [];
  for (const a of signals) {
    if ((a.kind !== 'exec' && a.kind !== 'hiddenName') || skip(a.index)) continue;
    const near = signals.filter((s) => Math.abs(s.index - a.index) <= WINDOW);
    const confidence = score(a, near, ctx.code);
    if (!confidence || (strictOnly && confidence !== 'HIGH')) continue;
    const indicators = [...new Set([a.label, ...near.filter((s) => s !== a && s.kind !== 'dense').map((s) => s.label)])];
    candidates.push({ index: a.index, confidence, indicators });
  }
  // Weak-only combinations (no execution seen): two different payload-style indicators close together.
  if (!candidates.length && !strictOnly) {
    const weak = signals.filter((s) => s.kind === 'payload' || s.kind === 'escapes' || s.kind === 'identifiers' || s.kind === 'layered');
    for (const w of weak) {
      const other = weak.find((s) => s.kind !== w.kind && Math.abs(s.index - w.index) <= WINDOW);
      if (other) {
        candidates.push({ index: w.index, confidence: 'LOW', indicators: [w.label, other.label] });
        break;
      }
    }
  }
  // Strongest first; one finding per neighbourhood, at most three per file.
  candidates.sort((x, y) => RANK[y.confidence] - RANK[x.confidence] || x.index - y.index);
  const kept: Cluster[] = [];
  for (const c of candidates) {
    if (kept.length >= 3) break;
    if (!kept.some((k) => Math.abs(k.index - c.index) <= WINDOW)) kept.push(c);
  }
  return kept.sort((x, y) => x.index - y.index);
}
