import type { Grade } from './protocol';

const ARTICLES = /^(le|la|les|l|the|un|une|a|an)\s+/;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(ARTICLES, '');
}

export function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Allowed typos for an answer of that length. */
const tolerance = (len: number) => (len >= 9 ? 2 : len >= 5 ? 1 : 0);

export interface Answerable { exact: string[]; partial?: string[] }

/** Best grade for a guess, or null if wrong. Normalized lists can be cached by the caller. */
export function judge(guess: string, q: Answerable): Grade | null {
  const g = normalize(guess);
  if (!g) return null;
  const exact = q.exact.map(normalize);
  const partial = (q.partial ?? []).map(normalize);
  if (exact.includes(g)) return 'exact';
  if (partial.includes(g)) return 'partial';
  for (const e of exact) if (levenshtein(g, e, tolerance(e.length)) <= tolerance(e.length)) return 'approx';
  return null;
}
