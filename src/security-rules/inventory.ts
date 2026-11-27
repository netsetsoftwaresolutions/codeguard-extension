/**
 * How each file in a scan is classified (scanned, binary, too large, excluded).
 * Shared by the scanner's disk walk and the browser extension's in-memory archive, so both
 * produce the same inventory. Keep it free of Node-only APIs.
 */

export type InventoryStatus = 'SCANNED' | 'EXCLUDED' | 'BINARY' | 'TOO_LARGE';

/** Directories excluded from content analysis by default (still counted in the inventory). */
export const DEFAULT_EXCLUDED_DIRS = ['.git', 'node_modules', 'bower_components', '.hg', '.svn', '__pycache__', '.venv', 'venv', '.tox'];

/** Convert simple glob patterns (`*`, `**`, `?`) or path prefixes into a matcher. */
export function compileExcludes(patterns: string[]): (p: string) => boolean {
  const res = patterns
    .map((raw) => raw.trim().replace(/^\.?\//, ''))
    .filter(Boolean)
    .map((pat) => {
      if (!/[*?]/.test(pat)) {
        const prefix = pat.replace(/\/+$/, '');
        return (p: string) => p === prefix || p.startsWith(prefix + '/');
      }
      const re = new RegExp(
        '^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(?:.*/)?') + '$',
      );
      return (p: string) => re.test(p);
    });
  return (p) => res.some((fn) => fn(p));
}

export function isBinaryHead(head: Uint8Array): boolean {
  const n = Math.min(head.length, 8000);
  for (let i = 0; i < n; i++) if (head[i] === 0) return true;
  return false;
}

/** Classifies files in walk order; counts analyzed files against the per-scan limit. */
export function createInventoryClassifier(limits: { maxFileBytesForAnalysis: number; maxFilesAnalyzed: number }) {
  let analyzed = 0;
  let truncated = false;
  return {
    get truncated() {
      return truncated;
    },
    classify(size: number, head: Uint8Array): { status: InventoryStatus; excludeReason: string | null } {
      if (isBinaryHead(head)) return { status: 'BINARY', excludeReason: 'binary file (path and header checks only)' };
      if (size > limits.maxFileBytesForAnalysis) {
        return { status: 'TOO_LARGE', excludeReason: `larger than ${Math.round(limits.maxFileBytesForAnalysis / 1024)} KB analysis limit` };
      }
      if (analyzed >= limits.maxFilesAnalyzed) {
        truncated = true;
        return { status: 'EXCLUDED', excludeReason: 'per-scan file limit reached' };
      }
      analyzed++;
      return { status: 'SCANNED', excludeReason: null };
    },
  };
}
