/** Shannon entropy in bits per character. */
export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const PLACEHOLDER = /^(\$\{.*\}|\{\{.*\}\}|<[^>]+>|%[a-z_]+%|\[[^\]]+\])$|(x{4,}|\*{3,}|changeme|change_me|example|placeholder|your[_-]|dummy|sample|redacted|test|fake|secret123|password123|todo|replace|insert|enter[_-]|abc123|12345|qwerty|null|none|undefined|process\.env|os\.environ|getenv)/i;

/** True if a candidate secret value is obviously a placeholder / template / reference. */
export function looksLikePlaceholder(value: string): boolean {
  const v = value.trim();
  if (v.length < 6) return true;
  if (PLACEHOLDER.test(v)) return true;
  if (/^(.)\1+$/.test(v)) return true; // aaaaaaa
  if (/^[a-z]+$/i.test(v) && v.length < 16) return true; // plain words
  return false;
}

/** Levenshtein (optimal string alignment) distance, bounded for speed. */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length]![b.length]!;
}
