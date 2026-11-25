import type { Confidence, Severity } from '../../contracts';
import { indexToLine, isCommentLine } from '../context';
import type { CodeRule, FileContext, Language, RuleHit, RuleMeta } from '../types';

export interface PatternRuleSpec extends RuleMeta {
  /** Tested against each line (do not use the `g` flag). */
  linePatterns?: RegExp[];
  /** Tested against the whole file (for multi-line constructs). Must NOT use the `g` flag; one is added. */
  filePatterns?: RegExp[];
  /** All of these must match somewhere in the file for the rule to fire. */
  requireAllInFile?: RegExp[];
  /** At least one of these must match somewhere in the file for the rule to fire. */
  requireAnyInFile?: RegExp[];
  /** The pattern must occur at least `min` times in the file (linear scan; avoids backtracking-prone regexes). */
  requireCount?: { pattern: RegExp; min: number };
  /** Lines matching any of these are ignored. */
  excludeLine?: RegExp[];
  /** Raise severity/confidence when additional indicators co-occur in the same file. */
  escalate?: { anyInFile: RegExp[]; severity: Severity; confidence: Confidence; note: string };
  /** Skip files detected as minified/bundled (use for obfuscation heuristics). */
  skipMinified?: boolean;
  /** Skip generated/vendor paths entirely. */
  skipGenerated?: boolean;
  appliesToPath?: (path: string) => boolean;
  maxHitsPerFile?: number;
}

const LOWER_CONFIDENCE: Record<Confidence, Confidence> = { HIGH: 'MEDIUM', MEDIUM: 'LOW', LOW: 'LOW' };

function languageMatches(langs: Language[] | 'any', lang: Language): boolean {
  return langs === 'any' || langs.includes(lang);
}

/**
 * Apply context to a hit: matches inside tests, examples, documentation or comments are
 * reported as false-positive candidates with reduced confidence instead of being dropped,
 * so reviewers can still see them.
 */
export function applyContext(hit: RuleHit, meta: RuleMeta, ctx: FileContext, lineText: string | null): RuleHit {
  const reasons: string[] = [];
  if (ctx.isTestOrExample) reasons.push('the file is in a test, fixture or example location');
  if (ctx.isDocumentation) reasons.push('the file is documentation');
  if (lineText !== null && isCommentLine(lineText, ctx.language)) reasons.push('the match is inside a comment');
  if (reasons.length === 0) return hit;
  return {
    ...hit,
    classification: 'FALSE_POSITIVE_CANDIDATE',
    confidence: LOWER_CONFIDENCE[hit.confidence ?? meta.confidence],
    extraDescription: [hit.extraDescription, `Possible false positive: ${reasons.join(' and ')}.`].filter(Boolean).join(' '),
  };
}

export function patternRule(spec: PatternRuleSpec): CodeRule {
  const {
    linePatterns = [],
    filePatterns = [],
    requireAllInFile,
    requireAnyInFile,
    requireCount,
    excludeLine = [],
    escalate,
    skipMinified,
    skipGenerated,
    maxHitsPerFile = 5,
    ...meta
  } = spec;
  return {
    ...meta,
    appliesToPath: spec.appliesToPath,
    analyze(ctx) {
      if (!languageMatches(meta.languages, ctx.language)) return [];
      if (skipMinified && ctx.isMinified) return [];
      if (skipGenerated && ctx.isGenerated) return [];
      if (requireAllInFile && !requireAllInFile.every((re) => re.test(ctx.content))) return [];
      if (requireAnyInFile && !requireAnyInFile.some((re) => re.test(ctx.content))) return [];
      if (requireCount) {
        const g = new RegExp(requireCount.pattern.source, requireCount.pattern.flags.includes('g') ? requireCount.pattern.flags : requireCount.pattern.flags + 'g');
        let n = 0;
        while (g.exec(ctx.content) && ++n < requireCount.min);
        if (n < requireCount.min) return [];
      }

      const escalated = escalate ? escalate.anyInFile.some((re) => re.test(ctx.content)) : false;
      const hits: RuleHit[] = [];
      const seenLines = new Set<number>();

      const push = (line: number, lineText: string, evidence: string) => {
        if (hits.length >= maxHitsPerFile || seenLines.has(line)) return;
        if (excludeLine.some((re) => re.test(lineText))) return;
        seenLines.add(line);
        const base: RuleHit = {
          ruleId: meta.id,
          line,
          evidence,
          severity: escalated ? escalate!.severity : meta.severity,
          confidence: escalated ? escalate!.confidence : meta.confidence,
          extraDescription: escalated ? escalate!.note : undefined,
          fingerprintKey: evidence.replace(/\s+/g, ' ').trim().slice(0, 200),
        };
        hits.push(applyContext(base, meta, ctx, lineText));
      };

      if (linePatterns.length) {
        for (let i = 0; i < ctx.lines.length && hits.length < maxHitsPerFile; i++) {
          const text = ctx.lines[i]!;
          if (text.length === 0) continue;
          const probe = text.length > 20000 ? text.slice(0, 20000) : text;
          for (const re of linePatterns) {
            const m = re.exec(probe);
            if (m) {
              // For very long (minified) lines, show a window around the match instead of the whole line.
              const evidence = probe.length > 300 ? probe.slice(Math.max(0, m.index - 80), m.index + 160) : probe;
              push(i + 1, text, evidence);
              break;
            }
          }
        }
      }
      for (const re of filePatterns) {
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        let m: RegExpExecArray | null;
        let guard = 0;
        while ((m = g.exec(ctx.content)) && hits.length < maxHitsPerFile && guard++ < 1000) {
          const line = indexToLine(ctx.content, m.index);
          push(line, ctx.lines[line - 1] ?? '', m[0].slice(0, 300));
          if (m[0].length === 0) g.lastIndex++;
        }
      }
      return hits;
    },
  };
}
