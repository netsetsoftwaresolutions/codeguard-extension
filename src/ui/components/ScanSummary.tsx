import type { FindingCategory, FindingClassification, ScanView } from '../../contracts';
import { RiskBadge, SeverityBar, SeverityCountsRow } from '../../components/primitives';
import { Notice } from './common';

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  OBFUSCATION: 'Obfuscation',
  REMOTE_CODE_EXECUTION: 'Remote code execution',
  CREDENTIAL_THEFT: 'Credential theft',
  DATA_EXFILTRATION: 'Data exfiltration',
  BACKDOOR: 'Backdoor indicators',
  SUPPLY_CHAIN: 'Supply chain',
  VULNERABLE_DEPENDENCY: 'Vulnerable dependencies',
  MALICIOUS_PACKAGE: 'Known malicious packages',
  SECRET: 'Secrets',
  CONFIGURATION: 'Configuration',
  EXPOSED_FILE: 'Exposed files',
  CODE_QUALITY_SECURITY: 'Insecure code patterns',
  SUSPICIOUS_NETWORK: 'Suspicious network activity',
};

export function categoryLabel(c: FindingCategory): string {
  return CATEGORY_LABELS[c] ?? c;
}

const CLASS_LABELS: Record<FindingClassification, string> = {
  CONFIRMED: 'Confirmed',
  SUSPICIOUS: 'Suspicious (needs review)',
  FALSE_POSITIVE_CANDIDATE: 'Possible false positives',
};

export function ScanSummary({ scan, compact }: { scan: ScanView; compact?: boolean }) {
  const s = scan.summary;
  if (!s) return <p className="text-xs text-slate-500 dark:text-slate-400">No summary is available for this scan.</p>;
  const categories = (Object.entries(s.categoryCounts) as [FindingCategory, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const limitations = s.coverage.limitations ?? [];
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <RiskBadge level={s.risk.level} score={s.risk.score} />
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {s.totalFindings} finding{s.totalFindings === 1 ? '' : 's'} · {s.coverage.filesScanned}/{s.coverage.filesDiscovered} files
        </span>
      </div>
      <SeverityBar counts={s.severityCounts} />
      <SeverityCountsRow counts={s.severityCounts} compact={compact} />

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        {(Object.keys(CLASS_LABELS) as FindingClassification[]).map((k) => (
          <span key={k}>
            <span className="font-semibold tabular-nums">{s.classificationCounts[k] ?? 0}</span> {CLASS_LABELS[k]}
          </span>
        ))}
      </div>

      {categories.length > 0 && (
        <div>
          <h3 className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Risk categories</h3>
          <ul className="flex flex-wrap gap-1.5">
            {categories.slice(0, compact ? 6 : 13).map(([c, n]) => (
              <li key={c} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-ink-700">
                {categoryLabel(c)} <span className="font-semibold tabular-nums">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(limitations.length > 0 || s.coverage.truncated) && (
        <Notice tone="warning">
          <div className="font-medium">Coverage limitations</div>
          <ul className="mt-0.5 list-disc pl-4">
            {s.coverage.truncated && <li>The scan was truncated; not every file was analysed.</li>}
            {limitations.slice(0, compact ? 3 : 20).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Notice>
      )}

      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        “Suspicious” findings are heuristic indicators for human review — they are not confirmed malware. No scan can guarantee that code is free of
        malware or vulnerabilities.{s.aiUsed ? ' AI-assisted explanations were generated for some findings; verify them before acting.' : ''}
      </p>
    </div>
  );
}
