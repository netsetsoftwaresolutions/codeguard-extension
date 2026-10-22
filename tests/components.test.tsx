import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FindingView } from '../src/contracts';
import { ConsentDialog } from '../src/ui/components/ConsentDialog';
import { FindingItem, groupBySeverity } from '../src/ui/components/FindingsList';
import { LoginForm } from '../src/ui/components/LoginForm';
import { ScanActions } from '../src/ui/components/ScanActions';
import { ScanSummary } from '../src/ui/components/ScanSummary';
import { scanView } from './fixtures';

afterEach(cleanup);

function finding(overrides: Partial<FindingView> = {}): FindingView {
  return {
    id: 'f1', scanId: 'scan_1', projectId: 'p1', fingerprint: 'fp', ruleId: 'r1', engine: 'codeguard-rules', category: 'REMOTE_CODE_EXECUTION',
    classification: 'SUSPICIOUS', title: 'Dynamic eval of remote content', description: 'Code downloads and evaluates a script.', severity: 'HIGH',
    confidence: 'MEDIUM', status: 'OPEN', filePath: 'src/install.js', startLine: 12, endLine: 14, branch: 'main', commitSha: 'abc',
    packageName: null, packageVersion: null, packageEcosystem: null, advisoryIds: [], fixedVersions: [], maskedEvidence: 'eval(await fetch(u)…)',
    recommendation: 'Remove dynamic evaluation.', falsePositiveGuidance: null, references: [], sourceLink: 'https://github.com/acme/app/blob/abc/src/install.js#L12',
    introducedInChange: null, aiExplanation: 'This pattern lets a remote server run code.', detectedAt: '2026-10-01T00:00:00Z', lastSeenAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

describe('ScanActions', () => {
  it('renders enabled and disabled actions with reasons and fires onScan', () => {
    const onScan = vi.fn();
    render(
      <ScanActions
        starting={null}
        onScan={onScan}
        actions={[
          { id: 'SCAN_PULL_REQUEST', label: 'Scan this pull request', enabled: true, primary: true },
          { id: 'SCAN_ALL_BRANCHES', label: 'Scan all accessible branches', enabled: false, reason: 'Plan limit' },
        ]}
      />,
    );
    const pr = screen.getByRole('button', { name: /Scan this pull request/ });
    const all = screen.getByRole('button', { name: /Scan all accessible branches/ }) as HTMLButtonElement;
    expect(all.disabled).toBe(true);
    expect(screen.getByText('Plan limit')).toBeTruthy();
    fireEvent.click(pr);
    expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ id: 'SCAN_PULL_REQUEST' }));
  });
});

describe('ScanSummary', () => {
  it('shows risk, categories, limitations and the suspicious ≠ malware disclaimer', () => {
    const scan = scanView({
      summary: {
        severityCounts: { CRITICAL: 1, HIGH: 2, MEDIUM: 0, LOW: 0, INFO: 3 },
        categoryCounts: { SECRET: 1, OBFUSCATION: 2 },
        classificationCounts: { CONFIRMED: 1, SUSPICIOUS: 2, FALSE_POSITIVE_CANDIDATE: 3 },
        totalFindings: 6,
        risk: { score: 72, level: 'HIGH', components: [], methodologyVersion: '1' },
        coverage: {
          filesDiscovered: 10, filesScanned: 9, filesExcluded: 1, bytesScanned: 1000, excludedSamples: [], excludedByReason: {}, languages: {},
          ecosystems: [], manifests: [], lockfiles: [], engines: [], limitations: ['semgrep not installed'], truncated: false,
        },
        aiUsed: false,
      },
    });
    render(<ScanSummary scan={scan} />);
    expect(screen.getByText('High risk')).toBeTruthy();
    expect(screen.getByText('Risk categories')).toBeTruthy();
    expect(screen.getByText(/Obfuscation/)).toBeTruthy();
    expect(screen.getByText('semgrep not installed')).toBeTruthy();
    expect(screen.getByText(/not confirmed malware/)).toBeTruthy();
    expect(screen.getByText(/No scan can guarantee/)).toBeTruthy();
  });
});

describe('FindingItem', () => {
  it('renders severity, classification, location, evidence, fix and labelled AI explanation', () => {
    render(<ul><FindingItem finding={finding()} dashboardUrl="http://localhost:3000" /></ul>);
    expect(screen.getByText('Dynamic eval of remote content')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Suspicious')).toBeTruthy();
    expect(screen.getByText('src/install.js:12')).toBeTruthy();
    expect(screen.getByLabelText('Masked evidence').textContent).toContain('eval(await fetch(u)');
    expect(screen.getByText('How to fix')).toBeTruthy();
    expect(screen.getByText(/AI explanation — verify before acting/)).toBeTruthy();
  });

  it('groups by severity in descending order', () => {
    const groups = groupBySeverity([finding({ id: 'a', severity: 'LOW' }), finding({ id: 'b', severity: 'CRITICAL' }), finding({ id: 'c', severity: 'LOW' })]);
    expect(groups.map(([s, l]) => [s, l.length])).toEqual([['CRITICAL', 1], ['LOW', 2]]);
  });
});

describe('ConsentDialog', () => {
  it('shows the API host in the disclosure and requires an explicit choice', () => {
    const onAccept = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConsentDialog open apiBaseUrl="https://api.codeguard.example" productName="CodeGuard" sourceLabel="acme/private" visibility="private" onAccept={onAccept} onCancel={onCancel} />,
    );
    expect(screen.getByRole('dialog').textContent).toContain('CodeGuard will download this source to the CodeGuard server at api.codeguard.example for analysis. Source code is never executed. Uploaded copies are deleted after scanning.');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /I agree/ }));
    expect(onAccept).toHaveBeenCalled();
  });
});

describe('LoginForm', () => {
  it('submits credentials and shows API errors', async () => {
    const onLogin = vi.fn(async () => {
      throw new Error('Incorrect email or password.');
    });
    render(<LoginForm productName="CodeGuard" dashboardUrl="http://localhost:3000" onLogin={onLogin} />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dev@acme.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }));
    expect(onLogin).toHaveBeenCalledWith('dev@acme.test', 'pw');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Incorrect email or password.')).toBeTruthy();
  });
});
