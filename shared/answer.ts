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

/** Best grade for a guess, or null if wrong. */
export function judge(guess: string, q: Answerable): Grade | null {
  const g = normalize(guess);
  if (!g) return null;
  const exact = [...new Set(q.exact.flatMap(expand))];
  if (exact.includes(g)) return 'exact';
  const partial = [...(q.partial ?? []).map(normalize), ...q.exact.map(normalize).flatMap(guessed)];
  if (partial.includes(g)) return 'partial';
  for (const e of exact) if (e.length >= 4 && levenshtein(g, e, tolerance(e.length)) <= tolerance(e.length)) return 'approx';
  return null;
}

// ── Automatic shortcuts (owner: "les raccourcis doivent marcher") ─────────────────────────────
// exact: the answer, without subtitle / parentheses / leading article, roman↔arabic numbers,
//        acronyms (The Last of Us → tlou, The Lord of the Rings → lotr, Le Seigneur des anneaux → sda,
//        JoJo's Bizarre Adventure → jjba/jba, Final Fantasy VII → ff7/ffvii), + ALIAS table.
// partial (fewer points): head noun before a linking word (flûte à bec → flûte), unless NOHEAD.
const LINK = new Set(['a', 'au', 'aux', 'de', 'du', 'des', 'd', 'en', 'et', 'la', 'le', 'l', 'pour', 'sur']);
const GENERIC = new Set(['movie', 'film', 'films', 'series', 'serie', 'saga', 'game', 'games', 'jeu', 'jeux', 'video', 'videogame', 'tv', 'television', 'televisee',
  'animated', 'anime', 'manga', 'franchise', 'universe', 'univers', 'trilogy', 'trilogie', 'show', 'cartoon', 'live', 'action', 'remake', 'reboot', 'the', 'official',
  'edition', 'collection', 'chronicles', 'part', 'partie', 'chapter', 'chapitre', 'episode', 'volume', 'vol', 'season', 'saison']);
const ART = new Set(['the', 'le', 'la', 'les', 'l', 'a', 'an', 'un', 'une']);
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi'];
const num = (w: string) => { const r = ROMAN.indexOf(w); return r >= 0 && w !== 'i' ? String(r + 1) : /^\d+$/.test(w) ? w : null; };
const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const dup = (w: string) => (/^([a-z]{1,3})\1/.test(w) ? w[0] + w[0] : w[0]); // jojo → jj

const cache = new Map<string, string[]>();
export function expand(raw: string): string[] {
  let hit = cache.get(raw); if (hit) return hit;
  const out = new Set<string>();
  const parts = raw.split(/\s*[:–—]\s*|\s+-\s+/);
  const forms = [raw, ...parts, raw.replace(/\s*\([^)]*\)/g, '')];
  for (const f of forms) {
    const w = words(f); if (!w.length) continue;
    out.add(normalize(f));
    const arabic = w.map(x => num(x) ?? x);
    out.add(arabic.join(' ')); out.add(w.join(' ')); out.add(w.filter(x => !ART.has(x)).join(' '));
    // core name without generic words: "A Minecraft Movie" → "minecraft", "Pokémon (série télévisée)" → "pokemon"
    const core0 = w.filter(x => !ART.has(x) && !GENERIC.has(x) && !/^(19|20)\d\d$/.test(x));
    if (core0.length && core0.length < w.length) out.add(core0.join(' '));
    const core = w.filter(x => x !== 's'), noArt = core.filter(x => !ART.has(x)), noLead = ART.has(core[0]) ? core.slice(1) : core;
    for (const list of [core, noArt, noLead]) {
      if (list.length < 2) continue;
      const ac = list.map(x => num(x) ?? x[0]).join(''), ac2 = list.map(x => num(x) ?? dup(x)).join('');
      const acR = list.map(x => (ROMAN.includes(x) && x !== 'i' ? x : (num(x) ?? x[0]))).join('');
      for (const a of [ac, ac2, acR]) if (a.length >= 3) out.add(a);
    }
  }
  for (const e of [...out]) for (const a of ALIAS[e] ?? []) out.add(normalize(a));
  hit = [...out].filter(Boolean);
  if (cache.size > 20000) cache.clear();
  cache.set(raw, hit);
  return hit;
}

const ALIAS: Record<string, string[]> = {
  'super nintendo': ['snes', 'super nes', 'super famicom'], 'nintendo entertainment system': ['nes'], 'nes': ['nintendo'],
  'playstation': ['ps1', 'psx', 'play'], 'playstation 2': ['ps2'], 'playstation 3': ['ps3'], 'playstation 4': ['ps4'], 'playstation 5': ['ps5'],
  'playstation portable': ['psp'], 'playstation vita': ['ps vita', 'vita'], 'nintendo 64': ['n64'], 'game boy': ['gameboy', 'gb'],
  'game boy advance': ['gba'], 'game boy color': ['gbc'], 'nintendo ds': ['ds'], 'nintendo 3ds': ['3ds'], 'nintendo switch': ['switch'],
  'gamecube': ['game cube', 'gc'], 'xbox 360': ['360'], 'mega drive': ['megadrive', 'genesis'], 'grand theft auto': ['gta'],
  'the legend of zelda': ['zelda'], 'league of legends': ['lol'], 'counter strike': ['cs'], 'call of duty': ['cod'],
  'etats unis': ['usa', 'us', 'amerique'], 'royaume uni': ['uk', 'angleterre'], 'tour eiffel': ['eiffel'],
};

// Compound nouns whose head word means something else ("pomme" ≠ "pomme de terre").
const NOHEAD = new Set(['pomme de terre', 'noix de coco', 'fruit de la passion', 'chou de bruxelles', 'arc en ciel', 'pomme d amour',
  'chauve souris', 'poisson d avril', 'boule de neige', 'bonhomme de neige', 'coup de foudre', 'tour de france', 'fer a repasser',
  'pomme de pin', 'queue de cheval', 'cochon d inde', 'belle de nuit', 'tete de mort']);
/** Generated, less certain shortcuts → 'partial'. */
function guessed(e: string): string[] {
  const w = e.split(' ').filter(Boolean);
  return w.length >= 2 && LINK.has(w[1]) && w[0].length >= 4 && !NOHEAD.has(e) ? [w[0]] : [];
}
