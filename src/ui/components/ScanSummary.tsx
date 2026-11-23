import type { FindingCategory, RiskLevel, ScanView } from '../../contracts';
import { cx } from '../../components/primitives';
import { Bug, ChevronDown, ShieldAlert, ShieldCheck } from 'lucide-react';

// Plain words a non-security user understands.
const CATEGORY_LABELS: Record<FindingCategory, string> = {
  OBFUSCATION: 'Hidden or scrambled code',
  REMOTE_CODE_EXECUTION: 'Runs code from the internet',
  CREDENTIAL_THEFT: 'Tries to steal passwords',
  DATA_EXFILTRATION: 'Sends data out secretly',
  BACKDOOR: 'Backdoor',
  SUPPLY_CHAIN: 'Risky package setup',
  VULNERABLE_DEPENDENCY: 'Outdated packages with known flaws',
  MALICIOUS_PACKAGE: 'Known malicious packages',
  SECRET: 'Exposed passwords or keys',
  CONFIGURATION: 'Unsafe settings',
  EXPOSED_FILE: 'Private files in the code',
  CODE_QUALITY_SECURITY: 'Unsafe code',
  SUSPICIOUS_NETWORK: 'Suspicious network calls',
};

export function categoryLabel(c: FindingCategory): string {
  return CATEGORY_LABELS[c] ?? c;
}

const MALWARE_CATEGORIES: FindingCategory[] = ['BACKDOOR', 'MALICIOUS_PACKAGE', 'OBFUSCATION', 'REMOTE_CODE_EXECUTION', 'CREDENTIAL_THEFT', 'DATA_EXFILTRATION'];

const TONES = {
  red: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  orange: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  amber: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  neutral: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-ink-500 dark:bg-ink-700 dark:text-slate-200',
  green: 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300',
};

const RISK_VERDICT: Record<RiskLevel, { title: string; tone: keyof typeof TONES }> = {
  CRITICAL: { title: 'Serious problems found', tone: 'red' },
  HIGH: { title: 'Serious problems found', tone: 'orange' },
  ELEVATED: { title: 'Some problems found', tone: 'amber' },
  LOW: { title: 'Minor problems only', tone: 'neutral' },
  MINIMAL: { title: 'Looks safe', tone: 'green' },
};

// Dot colour per tone, for compact rows.
export const TONE_DOTS: Record<keyof typeof TONES, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  neutral: 'bg-slate-400',
  green: 'bg-green-500',
};

/** One plain-words verdict for a scan, shared by the result card and the scan list. */
export function scanVerdict(s: NonNullable<ScanView['summary']>) {
  const malware = MALWARE_CATEGORIES.some((c) => (s.categoryCounts[c] ?? 0) > 0);
  return { malware, ...(malware ? { title: 'Malware found', tone: 'red' as const } : RISK_VERDICT[s.risk.level]) };
}

const TOP_CATEGORIES = 3;

export function ScanSummary({ scan }: { scan: ScanView }) {
  const s = scan.summary;
  if (!s) return <p className="text-xs text-slate-500 dark:text-slate-400">No summary is available for this scan.</p>;

  const verdict = scanVerdict(s);
  const { malware } = verdict;
  const Icon = malware ? Bug : verdict.tone === 'green' ? ShieldCheck : ShieldAlert;
  const detail = malware ? 'Do not install or run this code.' : 'No malware found.';

  const categories = (Object.entries(s.categoryCounts) as [FindingCategory, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const critical = s.severityCounts.CRITICAL ?? 0;
  const high = s.severityCounts.HIGH ?? 0;
  const { coverage } = s;

  return (
    <div className="space-y-3">
      <div role={malware ? 'alert' : undefined} className={cx('flex items-start gap-2.5 rounded-lg border px-3 py-2.5', TONES[verdict.tone])}>
        <Icon size={18} className="mt-0.5 flex-none" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">{verdict.title}</p>
          <p className="text-xs">{detail}</p>
        </div>
      </div>

      {s.totalFindings > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-slate-600 dark:text-slate-300">
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{s.totalFindings}</span> issue{s.totalFindings === 1 ? '' : 's'} to review
            {critical > 0 && <> · <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{critical}</span> critical</>}
            {high > 0 && <> · <span className="font-semibold tabular-nums text-orange-600 dark:text-orange-400">{high}</span> high</>}
          </p>
          <ul className="divide-y divide-slate-200 text-xs dark:divide-ink-600">
            {categories.slice(0, TOP_CATEGORIES).map(([c, n]) => (
              <li key={c} className="flex justify-between gap-3 py-1.5">
                <span className="text-slate-700 dark:text-slate-200">{categoryLabel(c)}</span>
                <span className="tabular-nums text-slate-500 dark:text-slate-400">{n}</span>
              </li>
            ))}
          </ul>
          {categories.length > TOP_CATEGORIES && (
            <p className="text-xs text-slate-500 dark:text-slate-400">See the full report for {categories.length - TOP_CATEGORIES} more.</p>
          )}
        </div>
      )}

      <details className="group text-xs text-slate-500 dark:text-slate-400">
        <summary className="flex cursor-pointer list-none items-center gap-1 rounded hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:hover:text-slate-200">
          About this scan
          <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="mt-1.5 list-disc space-y-1 pl-4 leading-relaxed">
          <li>
            Checked {coverage.filesScanned} of {coverage.filesDiscovered} files.
          </li>
          {coverage.truncated && <li>The scan stopped early; not every file was checked.</li>}
          {(coverage.limitations ?? []).map((l) => (
            <li key={l}>{l}</li>
          ))}
          <li>Some results may be false alarms, not confirmed malware. No scan can guarantee code is safe.</li>
          {s.aiUsed && <li>Some explanations were written by AI; check them before acting.</li>}
        </ul>
      </details>
    </div>
  );
}
