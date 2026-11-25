import type { CodeRule, RuleHit, RuleMeta } from '../types';
import { applyContext } from './helpers';

/**
 * PolinRider (DPRK) campaign detection, ported from the team's scan-malware-latest.mjs.
 * Every check in that script has a rule here: literal IOCs, .env loader, editor auto-run tasks,
 * package.json droppers, loader techniques, fake binaries and decoy font folders.
 */

const REFERENCES = [
  'https://opensourcemalware.com/blog/polinrider-rides-again',
  'https://www.microsoft.com/en-us/security/blog/?p=145338',
  'https://attack.mitre.org/techniques/T1195/002/',
];
const COMPROMISED =
  'Treat the repository as compromised: do not run it. Remove the injected files from every branch and from history, rotate every secret the code could read (.env values, npm/GitHub tokens, SSH keys), check other repositories you can push to, and enable branch protection.';

// The team's own scanner lists every IOC as data.
// shortcut: skipped by file name; replace with a hash allowlist if attackers start using that name.
const isTeamScanner = (path: string) => /(^|\/)scan-malware[\w.-]*\.mjs$/.test(path);

/** Literal IOCs and high-confidence shapes (HARD_SIGNATURES + HARD_PATTERNS). Also applied to binaries. */
export const POLINRIDER_SIGNATURES: RegExp[] = [
  /global\s*\[\s*['"](!|_V|r|m)['"]\s*\]\s*=/,
  /\}\s*\(\s*global\s*,\s*require\s*\)\s*\)/,
  /_\$_1e42|TUU=401-390|rmcej%otb%|Cot%3t=shtP|function MDy\(f\)|dgC\(Apa|var Tgw=jFD\(/,
  /2\[gWfGj;<:-93Z\^C|m6:tTh\^D\)cBz\?NM\]/,
  /TMfKQEd7TJJa5xNZJZ2Lep838vrzrs7mAP|TXfxHUet9pJVU1BgVkBAbrES4YUc1nGzcG/,
  /0xbe037400670fbf1c32364f762975908dc43eeb38759263e7dfcdabc76380811e|0x3f0e5781d0855fb460661ac63257376db1941b2bb522499e4757ecb3ebd5dce3/,
  /api\.trongrid\.io\/v1\/accounts|fullnode\.mainnet\.aptoslabs\.com\/v1\/accounts/,
  /\b(vscode-[\w-]+|default-configuration|\d{6})\.vercel\.app\b/i,
  /\btemp_auto_push\b|\bLAST_COMMIT_TEXT\b/,
  /git\s+commit\s+--amend[^\n]*--no-verify|git\s+push\s+-u?f\b[^\n]*--no-verify/,
  /BlockchainFont-Regular|TechMono-Regular/,
  /eval\s*\(\s*(atob|Buffer\.from|decodeURIComponent|unescape)\s*\(/,
  /atob\s*\(\s*process\.env\./,
  /eval\s*\(\s*(await\s+)?\w*(res|response|body|data|text|proxyInfo|payload|src)\w*(\.text\(\))?\s*\)/i,
  // 2026 "init" / Ethereum waves (Abnormal, Corgea, OX Security): build markers, tags, XOR keys, wallets, C2.
  /\/\*(M260630A|RS260605|NPM_WS_SHIM|C25061[7-9]A|C250620A|C260511A)\*\//,
  /\bA10-(npm_inject|II|E|online|npm-handy|new_npm)\b/,
  /q4FZkxX\{!h,Sr3=@|y-p_>d\$0B&@\^1aQk/,
  /0x1eef0849eda15d87f64e51c73c8442cf3c8bcef3|0xa322E5f3D311D3080e6f0121063e9aDC2490Ef1a|0x5f87b5975f87b59768656c6c6f6970626f742121|0x67B38e9b67B38E9b68656c6C6f6970626f742121/i,
  /\b(95\.135\.181\.151|103\.179\.142\.155|103\.179\.143\.219|166\.88\.134\.(62|75)|166\.88\.73\.46|23\.27\.13\.(72|135)|193\.247\.144\.38|91\.218\.183\.174)\b/,
  /:443\/0x\/(cls|ls|npm-migrate|clb|cb|js)\b|\.npm-ws(-runner)?\.(js|json|pid|log)\b|nm-npm-cache-/,
];

const PIPE_TO_SHELL = /(curl|wget)[^"\n]*\|\s*(ba|z)?sh\b|(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)[^"\n]*\|\s*iex\b/i;

const AUTORUN: { name: string; re: RegExp; strong?: boolean }[] = [
  { name: 'task runs on folder open', re: /"runOn"\s*:\s*"folderOpen"/ },
  { name: 'automatic tasks enabled', re: /"task\.allowAutomaticTasks"\s*:\s*"?(true|on)"?/ },
  { name: 'task runs node on a non-script file', re: /\bnode\s+[^\s"'|&;]+\.(?![cm]?[jt]sx?\b)[a-z0-9]+\b/i, strong: true },
  { name: 'task hides output (reveal: never)', re: /"reveal"\s*:\s*"never"/ },
  { name: 'download piped into a shell', re: PIPE_TO_SHELL, strong: true },
  { name: 'task fetches from a throwaway host (vercel.app/onrender/short.gy)', re: /https?:\/\/[^"\s]*(vercel\.app|onrender\.com|short\.gy)/i, strong: true },
];

const MALICIOUS_PACKAGES = new Set([
  'tailwind-mainanimation',
  'tailwind-autoanimation',
  'tailwind-animationbased',
  'tailwindcss-typography-style',
  'tailwindcss-style-animate',
  'tailwindcss-style-modify',
  'tailwindcss-animate-style',
  'react-contact-forms',
  'tailwindcss-form-utils',
  'tailwind-contact-forms',
  'tailwindcss-contact-form',
  'tailwind-form-core',
  'tailwind-input-kit',
  'tailwind-forms-kit',
  'tailwind-lines-clamps',
  'tailwind-lineclamp',
  'tailwindcss-form-ui',
  'tailwind-custom-forms',
  'scrollbar-hide-plugin',
]);

/** npm script runs the variant's extensionless `init` loader or an `.inz` side file. */
const INIT_LOADER = /\bnode\s+(?:-\S+\s+)*(?:\.\/)?(?:[\w.-]+\/)*init(?=$|[\s"'&|;])|[\w.-]*\.inz\.(?:cjs|orig|tmp)\b/;
/** npm script runs node on a non-JavaScript file, e.g. `node public/fonts/fa-solid-400.woff2`. Flags like --env-file=.env are skipped. */
const DISGUISED_NODE_FILE = /\bnode\s+(?:-\S+\s+)*[^\s"'|&;-][^\s"'|&;]*\.(?![cm]?[jt]sx?\b)(?:woff2?|ttf|otf|eot|svg|png|jpe?g|gif|ico|orc|txt|md|css|json|dat|bin)\b/i;
const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

/**
 * Loader techniques from the script's PATTERNS list. Not repeated here because other rules cover them:
 * _0x identifiers (CG-OBF-002), String.fromCharCode chains and webhook exfil (malware.ts), and
 * child_process + download (CG-RCE-001, which needs the download to actually be executed).
 */
const LOADER_PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'eval/Function with string concat', re: /(Function|eval)\s*\(\s*['"`][^'"`\n]*['"`]\s*\+/ },
  { name: 'new Function(...) executing a variable', re: /new\s+Function\s*\(\s*[\w.]+\s*\)/ },
  { name: 'vm.runIn*Context', re: /vm\.run(InThisContext|InNewContext|InContext)\s*\(/ },
  { name: 'hidden detached child process (detached + windowsHide)', re: /detached\s*:\s*true[\s\S]{0,300}windowsHide\s*:\s*true|windowsHide\s*:\s*true[\s\S]{0,300}detached\s*:\s*true/ },
  { name: 'spawns `node -e` with inline code', re: /(['"`]node['"`]|process\.execPath)\s*,\s*\[\s*['"`]-e['"`]/ },
  { name: 'eval near require of http(s)', re: /eval[\s\S]{0,200}require\s*\(\s*['"]https?['"]\s*\)/ },
  { name: 'obfuscator string-array rotation (while(!![]))', re: /while\s*\(\s*!!\s*\[\s*\]\s*\)/ },
  { name: 'huge hex/base64 string blob', re: /['"`](?:[0-9a-f]{2000,}|[A-Za-z0-9+/]{4000,}={0,2})['"`]/i },
];
const SKIP_LOADER_PATH = /\.min\.(js|css)$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$|\.(lock|map|csv|sql)$/i;
const SKIP_LONG_LINE_PATH = /(^|\/)src\/database\/migrations\/|\.svg$/i;

/** Base64 or base64url to UTF-8 text with web APIs (this file also runs in the browser extension). */
function decodeBase64(value: string): string {
  try {
    const bin = atob(value.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
}

const lineAt = (content: string, index: number) => content.slice(0, index).split('\n').length;
const windowAround = (text: string, index: number) => (text.length > 300 ? text.slice(Math.max(0, index - 80), index + 160) : text);

function meta(id: string, name: string, description: string, extra: Partial<RuleMeta> = {}): RuleMeta {
  return {
    id,
    name,
    description,
    category: 'BACKDOOR',
    severity: 'CRITICAL',
    confidence: 'HIGH',
    classification: 'CONFIRMED',
    languages: 'any',
    matching: '',
    falsePositiveGuidance: 'Only security write-ups or scanners that quote these indicators as data should match.',
    remediation: COMPROMISED,
    references: REFERENCES,
    ...extra,
  };
}

/** CG-MAL-001 hits for a text (also used on binary files read as latin1, where line numbers are meaningless). */
export function polinriderSignatureHits(content: string, binary = false): RuleHit[] {
  const hits: RuleHit[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length && hits.length < 5; i++) {
    const text = lines[i]!;
    for (const re of POLINRIDER_SIGNATURES) {
      const m = re.exec(text);
      if (!m) continue;
      const evidence = windowAround(text, m.index);
      hits.push({
        ruleId: 'CG-MAL-001',
        line: binary ? null : i + 1,
        evidence: binary ? `signature inside binary file: ${m[0]}` : evidence,
        fingerprintKey: binary ? m[0] : evidence.replace(/\s+/g, ' ').trim().slice(0, 200),
      });
      break;
    }
  }
  return hits;
}

export const polinriderRules: CodeRule[] = [
  {
    ...meta(
      'CG-MAL-001',
      'Known malware: PolinRider (DPRK) backdoor',
      'This file contains a known signature of PolinRider, a North Korea–linked campaign that hides a loader in repositories, steals secrets from process.env, and uses stolen tokens to push itself into more repositories. These are exact indicators from analysed samples, not a heuristic. Docs and scanner scripts that quote the indicators are shown as possible false positives, except README files inside a fonts folder: the campaign ships its own decoy README there.',
    ),
    matching: 'Literal PolinRider indicators: decoder names (_$_1e42, MDy, jFD, dgC), global["!"|"_V"|"r"|"m"] markers, the (global, require) loader IIFE, eval of decoded or fetched data, atob(process.env.*), string-table fragments, XOR keys, TRON/Aptos dead-drop wallets and lookups, vercel.app C2 hosts, the temp_auto_push/config.bat dropper, amend/push with --no-verify, and the decoy font README names.',
    appliesToPath: (path) => !isTeamScanner(path),
    analyze(ctx) {
      const hits = polinriderSignatureHits(ctx.content);
      // Incident write-ups and security scanners quote IOCs as data. The campaign's decoy README sits in a fonts folder and stays confirmed.
      const quotes = (ctx.isDocumentation && !/(^|\/)fonts\//i.test(ctx.path)) || /(^|\/)scripts?\/[^/]*scan[^/]*\.[cm]?[jt]s$/i.test(ctx.path);
      if (!quotes) return hits;
      return hits.map((h) => ({
        ...h,
        classification: 'FALSE_POSITIVE_CANDIDATE' as const,
        confidence: 'MEDIUM' as const,
        extraDescription: 'Possible false positive: the file looks like documentation or a security scanner that quotes these indicators as data.',
      }));
    },
  },
  {
    ...meta(
      'CG-MAL-002',
      'Known malware: PolinRider hidden loader address in .env',
      'The .env file sets AUTH_API / AUTH_API_KEY to a Base64 value that decodes to a web address. PolinRider loaders decode this variable, download code from that address and run it, so the "key" is really the malware\'s command server.',
    ),
    languages: ['config'],
    matching: 'A .env* line AUTH_API, AUTH_API_KEY, AUTH_ACCESS_KEY or AUTH_ACCESS_VALUE whose value Base64-decodes to an http(s) URL.',
    falsePositiveGuidance: 'Legitimate API keys are not Base64-encoded URLs. If you set this value yourself on purpose, mark the finding as a false positive.',
    remediation: 'Delete the variable, find and remove the code that decodes it (look for atob(process.env.AUTH_API...) or Buffer.from(..., "base64") feeding fetch/axios and new Function/eval), purge it from history, and rotate all secrets the app could read.',
    appliesToPath: (path) => /(^|\/)\.env(\.[^/]*)?$/.test(path),
    analyze(ctx) {
      const hits: RuleHit[] = [];
      ctx.lines.forEach((text, i) => {
        const m = /^\s*(?:export\s+)?(AUTH_API(?:_KEY)?|AUTH_ACCESS_(?:KEY|VALUE))\s*=\s*['"]?([A-Za-z0-9+/_-]{12,}={0,2})['"]?\s*$/.exec(text);
        if (!m) return;
        const decoded = decodeBase64(m[2]!).trim();
        if (!/^https?:\/\/[^\s]+$/.test(decoded)) return;
        const host = decoded.replace(/^https?:\/\/([^/?#]+).*$/, '$1');
        hits.push({
          ruleId: 'CG-MAL-002',
          line: i + 1,
          evidence: `${m[1]}=<Base64 of a URL on ${host}>`,
          fingerprintKey: `${m[1]}:${host}`,
          extraDescription: `The value decodes to a URL on ${host}.`,
          metadata: { variable: m[1], decodedHost: host },
        });
      });
      return hits;
    },
  },
  {
    ...meta(
      'CG-MAL-003',
      'Known malware technique: editor auto-run task (PolinRider)',
      'An editor configuration runs a task automatically when the folder is opened, or hides a task that runs a disguised file or fetches remote code. PolinRider uses .vscode tasks to start its loader the moment a developer opens the repository.',
      { classification: 'SUSPICIOUS' },
    ),
    matching: '.vscode/, .idea/, .devcontainer/ and *.code-workspace files with runOn: folderOpen, task.allowAutomaticTasks, reveal: never, node on a non-script file, a download piped into a shell, or a URL on vercel.app/onrender.com/short.gy. Confirmed when one of the last three is present.',
    falsePositiveGuidance: 'Some teams use folderOpen tasks for harmless setup (for example a watcher). Read the task command: anything that runs a renamed file or downloads code is malicious.',
    appliesToPath: (path) => /(^|\/)\.(vscode|idea|devcontainer)\//.test(path) || /\.code-workspace$/.test(path),
    analyze(ctx) {
      const found = AUTORUN.map((a) => ({ ...a, m: a.re.exec(ctx.content) })).filter((a) => a.m);
      if (!found.length) return [];
      const strong = found.some((a) => a.strong);
      const line = lineAt(ctx.content, found[0]!.m!.index);
      return [
        {
          ruleId: 'CG-MAL-003',
          line,
          evidence: ctx.lines[line - 1] ?? found[0]!.m![0],
          fingerprintKey: found.map((a) => a.name).join('|'),
          classification: strong ? 'CONFIRMED' : 'SUSPICIOUS',
          extraDescription: `Signals: ${found.map((a) => a.name).join('; ')}.`,
        },
      ];
    },
  },
  {
    ...meta(
      'CG-MAL-004',
      'Known malware: PolinRider package.json dropper',
      'package.json pulls in a package published by the PolinRider campaign, or a script runs a hidden node file (or a download piped into a shell) before the real command, e.g. "start": "node api.js && vite".',
    ),
    languages: ['json'],
    matching: 'Dependencies named after known PolinRider npm packages (tailwind-mainanimation, tailwind-lines-clamps, react-contact-forms, ...); scripts that run the extensionless "init" loader or an *.inz.cjs file, run node on a font/image/other non-JS file (confirmed); scripts with "node <file>" chained before another command, or curl/wget/iwr piped into a shell (suspicious).',
    falsePositiveGuidance: 'A chained "node scripts/x.js && ..." can be a legitimate build step. Open the file it runs: PolinRider droppers are obfuscated and fetch remote code.',
    appliesToPath: (path) => /(^|\/)package\.json$/.test(path),
    analyze(ctx) {
      let pkg: Record<string, unknown>;
      try {
        pkg = JSON.parse(ctx.content) as Record<string, unknown>;
      } catch {
        return [];
      }
      const findLine = (needle: string) => Math.max(1, ctx.lines.findIndex((l) => l.includes(needle)) + 1);
      const hits: RuleHit[] = [];
      for (const field of DEP_FIELDS) {
        for (const dep of Object.keys((pkg[field] as Record<string, string>) ?? {})) {
          if (!MALICIOUS_PACKAGES.has(dep)) continue;
          hits.push({ ruleId: 'CG-MAL-004', line: findLine(`"${dep}"`), evidence: `${field}: ${dep}`, fingerprintKey: `dep:${dep}`, packageName: dep, packageEcosystem: 'npm' });
        }
      }
      for (const [key, cmd] of Object.entries((pkg.scripts as Record<string, unknown>) ?? {})) {
        if (typeof cmd !== 'string') continue;
        const init = INIT_LOADER.test(cmd);
        const disguised = DISGUISED_NODE_FILE.test(cmd);
        const chained = /(^|&&|\|\||;)\s*node\s+[^\s&|;]+\s*(&&|\|\||;)/.test(cmd);
        const piped = PIPE_TO_SHELL.test(cmd);
        if (!init && !disguised && !chained && !piped) continue;
        hits.push({
          ruleId: 'CG-MAL-004',
          line: findLine(`"${key}"`),
          evidence: `"${key}": "${cmd}"`,
          fingerprintKey: `script:${key}`,
          classification: init || disguised ? 'CONFIRMED' : 'SUSPICIOUS',
          extraDescription: init
            ? 'The script runs the extensionless "init" loader (or an .inz side file) that the 2026 PolinRider wave adds, so the malware starts on npm run dev/start.'
            : disguised
              ? 'The script runs node on a file that is not JavaScript (for example a .woff2 font), the way PolinRider launches its hidden payload.'
              : chained
                ? 'A node file runs before the real command.'
                : 'A download is piped into a shell.',
        });
      }
      return hits;
    },
  },
  {
    ...meta(
      'CG-MAL-005',
      'Malware loader technique (PolinRider-style)',
      'The file uses a technique PolinRider loaders rely on to hide or launch code: code pushed off-screen after wide whitespace, obfuscator string-array rotation, hidden detached processes, inline node -e, runtime evaluation of variables, or very long dense code lines.',
      { category: 'OBFUSCATION', confidence: 'MEDIUM', classification: 'SUSPICIOUS' },
    ),
    matching: 'Script PATTERNS: eval/Function string concat, new Function(variable), vm.runIn*Context, detached + windowsHide, node -e spawn, eval near require("http"), while(!![]), huge hex/base64 blobs, a non-space run of 20+ whitespace characters ending past column 100, and lines of 600+ characters where ( ) { } ; make up over 3%.',
    falsePositiveGuidance: 'Bundlers and some tools produce long lines or runtime evaluation. Hidden off-screen code and string-array rotation have almost no legitimate use in source files.',
    remediation: 'Open the file in an editor with word-wrap on and review the flagged line. If it hides or launches code you did not write, treat the repository as compromised. ' + COMPROMISED,
    appliesToPath: (path) => !isTeamScanner(path) && !SKIP_LOADER_PATH.test(path),
    analyze(ctx) {
      // Build output (dist/, build/, .next/, out/, coverage/) is skipped, as in the team script; CG-MAL-001 still checks it.
      if (ctx.isGenerated) return [];
      const hits: RuleHit[] = [];
      const push = (name: string, line: number, column: number) => {
        const text = ctx.lines[line - 1] ?? '';
        const base: RuleHit = { ruleId: 'CG-MAL-005', line, evidence: windowAround(text, column), fingerprintKey: name, extraDescription: `Technique: ${name}.` };
        hits.push(applyContext(base, polinriderRules[4]!, ctx, text));
      };
      for (const { name, re } of LOADER_PATTERNS) {
        const m = re.exec(ctx.content);
        if (!m) continue;
        const line = lineAt(ctx.content, m.index);
        push(name, line, Math.max(0, (ctx.lines[line - 1] ?? '').indexOf(m[0].split('\n')[0]!)));
      }
      const padded = ctx.lines.findIndex((l) => /^.*\S[ 	  -​　﻿]{20,}(?<=^.{100,})\S/.test(l));
      if (padded >= 0) {
        push('code hidden after wide whitespace padding', padded + 1, 100);
        // The 2026 wave's loader is an extensionless file named `init`: a harmless stub, ~776 spaces, then obfuscated code.
        if (/(^|\/)init$/.test(ctx.path)) {
          const last = hits[hits.length - 1]!;
          hits[hits.length - 1] = { ...last, severity: 'CRITICAL', confidence: 'HIGH', classification: 'CONFIRMED', title: 'Known malware: PolinRider "init" loader file', extraDescription: 'This is the extensionless "init" file the 2026 PolinRider wave adds and runs from npm scripts: a harmless-looking stub followed by obfuscated code pushed off-screen.' };
        }
      }
      if (!SKIP_LONG_LINE_PATH.test(ctx.path) && !ctx.isMinified) {
        // Counts only ( ) { } ; — long Tailwind class strings are full of [ ] = but are not code.
        const dense = ctx.lines.findIndex((l) => l.length >= 600 && (l.match(/[(){};]/g) ?? []).length / l.length > 0.03);
        if (dense >= 0) push('long line with high code-shape density', dense + 1, 0);
      }
      return hits;
    },
  },
];


// ---------------------------------------------------------------- Binary and repository-level checks

export const polinriderPathRules: RuleMeta[] = [
  {
    ...meta(
      'CG-MAL-006',
      'Known malware: fake font/image file (PolinRider dropper)',
      'A font or image file is not what its extension says: its header bytes are wrong or it contains plain text. PolinRider hides its JavaScript payload in files like public/fonts/fa-solid-400.woff2 and runs them with node.',
    ),
    matching: 'Files with a font/image/PDF extension (.woff2, .woff, .ttf, .otf, .eot, .png, .jpg, .gif, .ico, .pdf, .webp) whose first bytes match no real font/image/PDF format, or whose content is text.',
    falsePositiveGuidance: 'A real asset saved with the wrong extension can match. Open the file in a text editor: a payload is readable or obfuscated JavaScript.',
  },
  {
    ...meta(
      'CG-MAL-007',
      'Known malware: PolinRider decoy font folder',
      'A folder of font files sits in the repository where nothing uses it. PolinRider plants a genuine Font Awesome set (with a README) as cover, then drops or downloads a fake-font payload next to it. Backends never ship fonts at all.',
      { classification: 'SUSPICIOUS' },
    ),
    matching: 'In a backend repository (no UI framework in the root package.json): any font file. In a frontend repository: font files whose names no code, CSS or HTML outside their own folder mentions. Confirmed when the same folder also holds another PolinRider indicator.',
    falsePositiveGuidance: 'An unused font folder can be leftover assets. Check git history for who added it and whether a README or a fake font file came with it.',
  },
  {
    ...meta(
      'CG-MAL-008',
      'Known malware: PolinRider .inz side file',
      'A file ending in .inz.cjs, .inz.orig or .inz.tmp is present. The 2026 PolinRider wave writes these next to the files it patches (npm, editors, project scripts) to load its stage-1 code.',
    ),
    matching: 'Any file named *.inz.cjs, *.inz.orig or *.inz.tmp.',
    falsePositiveGuidance: 'No legitimate tool is known to use this naming.',
  },
];

const MAGIC: Record<string, number[][] | null> = {
  '.woff2': [[0x77, 0x4f, 0x46, 0x32]],
  '.woff': [[0x77, 0x4f, 0x46, 0x46]],
  '.ttf': [[0, 1, 0, 0], [0x74, 0x72, 0x75, 0x65], [0x4f, 0x54, 0x54, 0x4f]],
  '.otf': [[0x4f, 0x54, 0x54, 0x4f]],
  '.eot': null,
  '.png': [[0x89, 0x50, 0x4e, 0x47]],
  '.jpg': [[0xff, 0xd8, 0xff]],
  '.jpeg': [[0xff, 0xd8, 0xff]],
  '.gif': [[0x47, 0x49, 0x46, 0x38]],
  '.ico': [[0, 0, 1, 0]],
  '.pdf': [[0x25, 0x50, 0x44, 0x46]],
  '.webp': [[0x52, 0x49, 0x46, 0x46]],
};
const FONT_EXT = /\.(woff2?|ttf|otf|eot)$/i;

export const isFontPath = (path: string) => FONT_EXT.test(path) || /(^|\/)fonts\/[^/]+\.svg$/i.test(path);

function looksLikeText(head: Uint8Array): boolean {
  const sample = head.subarray(0, 4096);
  let bad = 0;
  for (const b of sample) if (b === 0 || b < 7 || (b > 13 && b < 32)) bad++;
  return sample.length > 0 && bad / sample.length < 0.01;
}

/** CG-MAL-006: wrong magic bytes or text content behind a binary asset extension. */
export function fakeBinaryHit(path: string, head: Uint8Array | null): RuleHit | null {
  const ext = /\.[^./]+$/.exec(path)?.[0].toLowerCase() ?? '';
  if (!(ext in MAGIC) || !head?.length) return null;
  // Any real font/image header passes: a JPEG saved as .png is a harmless misnaming, a payload is text.
  const magics = MAGIC[ext] ? Object.values(MAGIC).flatMap((m) => m ?? []) : null;
  const okMagic = magics ? magics.some((m) => m.every((b, i) => head[i] === b)) : true;
  if (okMagic && !looksLikeText(head)) return null;
  const base = path.split('/').pop() ?? path;
  return { ruleId: 'CG-MAL-006', line: null, evidence: `${base}: not a real ${ext} (${okMagic ? 'text content' : 'wrong header bytes'})`, fingerprintKey: path };
}

/** CG-MAL-008: side files the 2026 wave writes next to the code it patches. */
export function inzFileHit(path: string): RuleHit | null {
  if (!/\.inz\.(cjs|orig|tmp)$/i.test(path)) return null;
  return { ruleId: 'CG-MAL-008', line: null, evidence: path.split('/').pop() ?? path, fingerprintKey: path };
}

const FRONTEND_DEPS = /^(react|react-dom|react-native|preact|vue|nuxt|next|gatsby|astro|svelte|@sveltejs\/kit|solid-js|@angular\/core|@remix-run\/react|expo|electron|vite|webpack|parcel|@vitejs\/[\w-]+)$/;

/** True when the root package.json depends on a UI framework or bundler. */
export function isFrontendPackageJson(content: string | null): boolean {
  if (!content) return false;
  try {
    const pkg = JSON.parse(content) as Record<string, Record<string, string> | undefined>;
    return DEP_FIELDS.some((f) => Object.keys(pkg[f] ?? {}).some((d) => FRONTEND_DEPS.test(d)));
  } catch {
    return false;
  }
}

/**
 * CG-MAL-007: one hit per font folder. `flagged` are font paths to report (every font in a backend,
 * unreferenced fonts in a frontend); `confirmedDirs` are folders that already hold another PolinRider hit.
 */
export function decoyFontHits(flagged: string[], frontend: boolean, confirmedDirs: Set<string>): { dir: string; hit: RuleHit }[] {
  const byDir = new Map<string, string[]>();
  for (const p of flagged) {
    const dir = p.slice(0, p.lastIndexOf('/') + 1);
    byDir.set(dir, [...(byDir.get(dir) ?? []), p.slice(dir.length)]);
  }
  return [...byDir].map(([dir, names]) => ({
    dir,
    hit: {
      ruleId: 'CG-MAL-007',
      line: null,
      evidence: `${names.length} font file(s): ${names.slice(0, 20).join(', ')}${names.length > 20 ? ', ...' : ''}`,
      fingerprintKey: dir,
      classification: confirmedDirs.has(dir) ? 'CONFIRMED' : 'SUSPICIOUS',
      extraDescription: frontend ? 'Nothing outside this folder references these fonts.' : 'This is a backend repository, which has no use for fonts.',
      metadata: { files: names },
    },
  }));
}
