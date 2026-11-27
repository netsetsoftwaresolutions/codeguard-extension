import type { FileContext, Language } from './types';

const EXT_LANG: Record<string, Language> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  py: 'python', pyw: 'python', pyi: 'python',
  php: 'php', phtml: 'php', php5: 'php', php7: 'php',
  rb: 'ruby', gemspec: 'ruby',
  sh: 'shell', bash: 'shell', zsh: 'shell', ksh: 'shell',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
  bat: 'batch', cmd: 'batch',
  go: 'go', java: 'java', kt: 'kotlin', kts: 'kotlin', cs: 'csharp',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp',
  rs: 'rust', swift: 'swift', pl: 'perl', pm: 'perl', lua: 'lua',
  html: 'html', htm: 'html', vue: 'vue', svelte: 'html',
  yml: 'yaml', yaml: 'yaml', json: 'json', jsonc: 'json', toml: 'toml', xml: 'xml',
  tf: 'terraform', hcl: 'terraform', sql: 'sql',
  md: 'markdown', mdx: 'markdown', rst: 'markdown', txt: 'text',
  ini: 'config', cfg: 'config', conf: 'config', properties: 'config', env: 'config',
};

export function detectLanguage(path: string): Language {
  const base = path.split('/').pop()!.toLowerCase();
  if (base === 'dockerfile' || base.startsWith('dockerfile.') || base.endsWith('.dockerfile')) return 'dockerfile';
  if (base === '.env' || base.startsWith('.env.')) return 'config';
  if (base === 'makefile' || base === 'gemfile' || base === 'rakefile') return base === 'makefile' ? 'shell' : 'ruby';
  if (base === '.npmrc' || base === '.pypirc' || base === '.gitconfig' || base === '.htaccess' || base === '.htpasswd') return 'config';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 && !base.startsWith('.')) return 'other';
  const ext = base.slice(dot + 1);
  return EXT_LANG[ext] ?? 'other';
}

/** Display names for the inventory / language breakdown. */
export const LANGUAGE_LABELS: Partial<Record<Language, string>> = {
  javascript: 'JavaScript', typescript: 'TypeScript', python: 'Python', php: 'PHP', ruby: 'Ruby',
  shell: 'Shell', powershell: 'PowerShell', batch: 'Batch', go: 'Go', java: 'Java', kotlin: 'Kotlin',
  csharp: 'C#', c: 'C', cpp: 'C++', rust: 'Rust', swift: 'Swift', perl: 'Perl', lua: 'Lua',
  html: 'HTML', vue: 'Vue', yaml: 'YAML', json: 'JSON', toml: 'TOML', xml: 'XML',
  dockerfile: 'Dockerfile', terraform: 'Terraform', sql: 'SQL', markdown: 'Markdown', text: 'Text', config: 'Config',
};

const TEST_PATH = /(^|\/)(__tests__|__mocks__|tests?|spec|specs|fixtures?|examples?|samples?|demo|testdata|test-data|mocks?)(\/|$)|\.(test|spec|stories)\.[a-z]+$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;
const DOC_PATH = /(^|\/)(docs?|documentation)(\/|$)|\.(md|mdx|rst|txt|adoc)$/i;
const GENERATED_PATH = /(^|\/)(dist|build|out|\.next|coverage|vendor|third[_-]?party)(\/|$)|\.min\.(js|css)$|\.bundle\.js$|-lock\.json$|\.lock$/i;

export function isTestOrExamplePath(path: string): boolean {
  return TEST_PATH.test(path);
}

export function isDocumentationPath(path: string): boolean {
  return DOC_PATH.test(path);
}

export function isGeneratedPath(path: string): boolean {
  return GENERATED_PATH.test(path);
}

export function looksMinified(content: string, lines: string[]): boolean {
  if (content.length < 2000) return false;
  const longLines = lines.filter((l) => l.length > 1000).length;
  const avg = content.length / Math.max(lines.length, 1);
  return avg > 300 || longLines > 0 && longLines / lines.length > 0.2;
}

/** Files that mix markup with code: Vue, Svelte, HTML, Blade views and PHP files that drop out of PHP into markup. */
export function isTemplateFile(path: string, language: Language, content: string): boolean {
  if (language === 'html' || language === 'vue' || /\.(blade\.php|phtml)$/i.test(path)) return true;
  return language === 'php' && /\?>\s*</.test(content);
}

// Executable regions of a template; group 0 keeps the whole match. Script types that hold data are not code.
const TEMPLATE_CODE: { re: RegExp; group: number }[] = [
  { re: /<script\b(?![^>]*\btype\s*=\s*["']?(?:application\/(?:ld\+)?json|text\/(?:template|x-template|html)|importmap))[^>]*>([\s\S]*?)<\/script\s*>/gi, group: 1 },
  { re: /<\?(?:php\b|=)([\s\S]*?)(?:\?>|$(?![\s\S]))/gi, group: 1 },
  { re: /@php\b([\s\S]*?)@endphp\b/g, group: 1 },
  { re: /\{!![\s\S]*?!!\}|\{\{[\s\S]*?\}\}/g, group: 0 },
  { re: /\s(?:on[a-z]+|@[\w.:-]+|v-on:[\w.:-]+)\s*=\s*(?:"[^"]*"|'[^']*')/gi, group: 0 },
  { re: /\bhref\s*=\s*["']\s*(javascript:[^"']*)/gi, group: 1 },
];

/**
 * Blank everything in a template that cannot execute (markup, text, <style> blocks), keeping
 * <script> bodies, PHP blocks, Blade @php and {{ }} / {!! !!} echoes, Vue interpolations, inline
 * event handlers and javascript: URLs. Newlines survive, so line and column numbers are unchanged.
 */
export function executableView(content: string): string {
  const keep = new Uint8Array(content.length);
  for (const { re, group } of TEMPLATE_CODE) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content))) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const body = m[group];
      if (!body) continue;
      const start = group === 0 ? m.index : m.index + m[0].lastIndexOf(body);
      keep.fill(1, start, start + body.length);
    }
  }
  const out: string[] = [];
  let i = 0;
  while (i < content.length) {
    let j = i;
    while (j < content.length && keep[j] === keep[i]) j++;
    out.push(keep[i] ? content.slice(i, j) : content.slice(i, j).replace(/[^\r\n]/g, ' '));
    i = j;
  }
  return out.join('');
}

export function buildFileContext(path: string, content: string): FileContext {
  const lines = content.split(/\r?\n/);
  const language = detectLanguage(path);
  const code = isTemplateFile(path, language, content) ? executableView(content) : content;
  return {
    path,
    content,
    lines,
    code,
    codeLines: code === content ? lines : code.split(/\r?\n/),
    language,
    isTestOrExample: isTestOrExamplePath(path),
    isDocumentation: isDocumentationPath(path),
    isMinified: looksMinified(content, lines),
    isGenerated: isGeneratedPath(path),
  };
}

const COMMENT_LINE = /^\s*(\/\/|#(?!!)|\*|\/\*|<!--|--\s|;|rem\s|'|"""|''')/i;

/** True if the line is (most likely) only a comment in common languages. */
export function isCommentLine(line: string, language: string): boolean {
  if (language === 'json' || language === 'markdown' || language === 'text') return false;
  return COMMENT_LINE.test(line);
}

/** Convert an absolute string index into a 1-based line number. */
export function indexToLine(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) if (content.charCodeAt(i) === 10) line++;
  return line;
}

export const CODE_LANGUAGES: Language[] = [
  'javascript', 'typescript', 'python', 'php', 'ruby', 'shell', 'powershell', 'batch', 'go', 'java',
  'kotlin', 'csharp', 'c', 'cpp', 'rust', 'swift', 'perl', 'lua', 'html', 'vue',
];
export const JS_LIKE: Language[] = ['javascript', 'typescript', 'html', 'vue'];
