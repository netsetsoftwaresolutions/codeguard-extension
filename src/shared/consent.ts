import type { SourceInspection } from '../contracts';

/** Consent records: source key → epoch ms when the user accepted. */
export type ConsentRecord = Record<string, number>;

/**
 * Private or unknown-visibility sources require explicit consent before their contents are
 * downloaded to the CodeGuard server. Consent is remembered per source.
 */
export function requiresConsent(visibility: SourceInspection['visibility'] | undefined, key: string, consents: ConsentRecord): boolean {
  if (visibility === 'public') return false;
  return !consents[key];
}

export function consentText(apiHost: string, productName: string): string {
  return `${productName} will download this source to the ${productName} server at ${apiHost} for analysis. Source code is never executed. Uploaded copies are deleted after scanning.`;
}
