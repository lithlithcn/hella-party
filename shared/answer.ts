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
  const exact = q.exact.map(normalize).flatMap(shortcuts);
  const partial = (q.partial ?? []).map(normalize);
  if (exact.includes(g)) return 'exact';
  if (partial.includes(g)) return 'partial';
  for (const e of exact) if (levenshtein(g, e, tolerance(e.length)) <= tolerance(e.length)) return 'approx';
  return null;
}

// Automatic shortcuts accepted as exact (no per-question data needed):
// - head noun before a linking word: "flute a bec" → "flute", "chat de gouttiere" → "chat" (head ≥ 4 letters)
// - initials of 3+ words: "grand theft auto" → "gta"; "super nintendo entertainment system" → "snes"
// - a small table of common aliases (consoles, brands…)
const LINK = new Set(['a', 'au', 'aux', 'de', 'du', 'des', 'd', 'en', 'et', 'la', 'le', 'l', 'pour', 'sur']);
const ALIAS: Record<string, string[]> = {
  'super nintendo': ['snes', 'super nes', 'super famicom'], 'nintendo entertainment system': ['nes'], 'nes': ['nintendo'],
  'playstation': ['ps1', 'psx', 'play'], 'playstation 2': ['ps2'], 'playstation 3': ['ps3'], 'playstation 4': ['ps4'], 'playstation 5': ['ps5'],
  'playstation portable': ['psp'], 'playstation vita': ['ps vita', 'vita'], 'nintendo 64': ['n64'], 'game boy': ['gameboy', 'gb'],
  'game boy advance': ['gba'], 'game boy color': ['gbc'], 'nintendo ds': ['ds'], 'nintendo 3ds': ['3ds'], 'nintendo switch': ['switch'],
  'gamecube': ['game cube', 'gc'], 'xbox 360': ['360'], 'mega drive': ['megadrive', 'genesis'], 'grand theft auto': ['gta'],
  'the legend of zelda': ['zelda'], 'league of legends': ['lol'], 'counter strike': ['cs'], 'call of duty': ['cod'],
  'etats unis': ['usa', 'us', 'amerique'], 'royaume uni': ['uk', 'angleterre'], 'tour eiffel': ['eiffel'],
};
function shortcuts(e: string): string[] {
  const out = [e], w = e.split(' ');
  if (w.length >= 2 && LINK.has(w[1]) && w[0].length >= 4) out.push(w[0]);
  if (w.length >= 3) out.push(w.filter(x => !LINK.has(x)).map(x => x[0]).join(''));
  if (ALIAS[e]) out.push(...ALIAS[e].map(normalize));
  return out;
}
