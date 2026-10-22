/**
 * Best-effort extraction of the branch name shown on a GitHub / GitLab page. Used only to split
 * ambiguous `tree/<ref>/<path>` URLs; the background re-validates the hint against the URL.
 * This is the ONLY page content the content script reads.
 */
export function extractBranchHint(doc: Document, provider: 'GITHUB' | 'GITLAB' | string): string | null {
  if (provider === 'GITHUB') return fromGitHubEmbeddedData(doc) ?? fromGitHubRefSelector(doc);
  if (provider === 'GITLAB') return fromGitLab(doc);
  return null;
}

function clean(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= 255 && !/\s/.test(s) ? s : null;
}

/** Bounded search for `refInfo.name` inside GitHub's react-app embedded JSON. */
function findRefInfoName(node: unknown, depth: number): string | null {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  const obj = node as Record<string, unknown>;
  const refInfo = obj['refInfo'];
  if (refInfo && typeof refInfo === 'object') {
    const name = clean((refInfo as Record<string, unknown>)['name']);
    if (name) return name;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const r = findRefInfoName(v, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

export function fromGitHubEmbeddedData(doc: Document): string | null {
  const scripts = doc.querySelectorAll('script[data-target="react-app.embeddedData"]');
  for (const s of Array.from(scripts)) {
    const text = s.textContent ?? '';
    if (text.length > 5_000_000) continue;
    try {
      const data = JSON.parse(text) as { payload?: unknown };
      const direct = (data.payload as { refInfo?: { name?: unknown } } | undefined)?.refInfo?.name;
      const name = clean(direct) ?? findRefInfoName(data.payload, 0);
      if (name) return name;
    } catch {
      // Not JSON — ignore.
    }
  }
  return null;
}

function fromGitHubRefSelector(doc: Document): string | null {
  const el = doc.querySelector('#branch-picker-repos-header-ref-selector, [data-testid="ref-selector"] [data-component="text"]');
  return clean(el?.textContent);
}

function fromGitLab(doc: Document): string | null {
  const el = doc.querySelector('#js-tree-ref-switcher[data-ref], [data-ref].js-tree-ref, #tree-holder[data-ref]');
  return clean(el?.getAttribute('data-ref'));
}
