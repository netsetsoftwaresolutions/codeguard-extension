// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { formatBytes, formatRelativeTime, RiskBadge, SeverityBadge } from '../../../src/components/primitives/index';

describe('ui components', () => {
  it('renders severity labels', () => {
    render(<SeverityBadge severity="CRITICAL" />);
    expect(screen.getByText('Critical')).toBeTruthy();
  });
  it('renders risk with score and explains it is not a probability', () => {
    render(<RiskBadge level="MINIMAL" score={0} />);
    expect(screen.getByText('No significant findings').getAttribute('title')).toContain('not a probability');
  });
  it('formats values', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatRelativeTime(new Date(Date.now() - 120_000).toISOString())).toBe('2m ago');
  });
});
