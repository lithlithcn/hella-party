// Auto packs: built server-side from Wikidata (SPARQL) or a Fandom category, cached 7 days in the Library.
// Difficulty = popularity: Wikidata sitelinks (number of Wikipedias with a page) / Fandom page length,
// split in thirds → 1 facile / 2 moyen / 3 difficile. Images never come from logos/posters (P18 photos,
// Fandom infobox images; Library.wiki also skips files named like logos/covers/group shots).
import type { PackFile, PackQuestion } from '../shared/pack';
import type { NameKind } from './library';

type Base = { id: string; name: string; emoji: string; prompt: string; tags: string[]; kind?: NameKind };
export type AutoDef = Base & (
  | { from: 'wd'; where: string; min?: number; img?: 'photo' | 'page' } // photo = Commons P18, page = enwiki lead image
  | { from: 'fandom'; wiki: string; cat: string; lang?: string });

const wd = (id: string, name: string, emoji: string, prompt: string, tags: string[], where: string, min = 10, img: 'photo' | 'page' = 'photo', kind?: NameKind): AutoDef =>
  ({ id: `auto-${id}`, name, emoji, prompt, tags, from: 'wd', where, min, img, kind });
const fd = (id: string, name: string, emoji: string, wiki: string, cat = 'Characters', prompt = 'Qui est ce personnage ?', tags: string[] = [], kind: NameKind = 'anime'): AutoDef =>
  ({ id: `auto-${id}`, name, emoji, prompt, tags: ['personnages', ...tags], from: 'fandom', wiki, cat, kind });

export const AUTO: AutoDef[] = [
  // ── nature
  wd('especes', 'Espèces célèbres', '🦁', 'Quelle est cette espèce ?', ['nature', 'animaux'], '?item wdt:P31 wd:Q16521; wdt:P18 [].', 70),
  wd('chiens', 'Races de chiens', '🐕', 'Quelle est cette race de chien ?', ['animaux', 'chiens'], '?item wdt:P31 wd:Q39367.', 8),
  wd('chats', 'Races de chats', '🐈', 'Quelle est cette race de chat ?', ['animaux', 'chats'], '?item wdt:P31 wd:Q43577.', 6),
  wd('chevaux', 'Races de chevaux', '🐎', 'Quelle est cette race de cheval ?', ['animaux'], '?item wdt:P31 wd:Q1160573.', 10),
  wd('montagnes', 'Montagnes', '🏔️', 'Quelle est cette montagne ?', ['géographie', 'nature'], '?item wdt:P31 wd:Q8502.', 40),
  wd('volcans', 'Volcans', '🌋', 'Quel est ce volcan ?', ['géographie', 'nature'], '?item wdt:P31 wd:Q8072.', 30),
  wd('iles', 'Îles', '🏝️', 'Quelle est cette île ?', ['géographie'], '?item wdt:P31 wd:Q23442.', 60),
  wd('lacs', 'Lacs', '🏞️', 'Quel est ce lac ?', ['géographie', 'nature'], '?item wdt:P31 wd:Q23397.', 45),
  wd('cascades', 'Cascades', '💦', 'Quelle est cette cascade ?', ['géographie', 'nature'], '?item wdt:P31 wd:Q34038.', 20),
  // ── monuments & lieux
  wd('unesco', 'Patrimoine mondial', '🏛️', 'Quel est ce lieu ?', ['monuments', 'voyage'], '?item wdt:P1435 wd:Q9259.', 30),
  wd('chateaux', 'Châteaux', '🏰', 'Quel est ce château ?', ['monuments'], '?item wdt:P31 wd:Q23413.', 25),
  wd('ponts', 'Ponts', '🌉', 'Quel est ce pont ?', ['monuments'], '?item wdt:P31 wd:Q12280.', 25),
  wd('gratte-ciels', 'Gratte-ciels', '🏙️', 'Quel est ce gratte-ciel ?', ['monuments', 'architecture'], '?item wdt:P31 wd:Q11303.', 25),
  wd('stades', 'Stades', '🏟️', 'Quel est ce stade ?', ['sport', 'monuments'], '?item wdt:P31 wd:Q483110.', 30),
  wd('tableaux', 'Tableaux célèbres', '🖼️', 'Quel est ce tableau ?', ['art', 'culture'], '?item wdt:P31 wd:Q3305213.', 35),
  wd('sculptures', 'Sculptures célèbres', '🗿', 'Quelle est cette sculpture ?', ['art', 'culture'], '?item wdt:P31 wd:Q860861.', 30),
  // ── bouffe
  wd('plats', 'Plats du monde', '🍲', 'Quel est ce plat ?', ['bouffe'], '?item wdt:P31 wd:Q746549.', 20),
  wd('fromages', 'Fromages', '🧀', 'Quel est ce fromage ?', ['bouffe'], '?item wdt:P279 wd:Q10943.', 12),
  wd('cocktails', 'Boissons & cocktails', '🍹', 'Quelle est cette boisson ?', ['bouffe'], '?item wdt:P31 wd:Q134768.', 15),
  wd('patisseries', 'Pâtisseries', '🥐', 'Quelle est cette pâtisserie ?', ['bouffe', 'desserts'], '?item wdt:P279 wd:Q477248.', 12),
  wd('fruits', 'Fruits', '🍎', 'Quel est ce fruit ?', ['bouffe', 'nature'], '?item wdt:P279 wd:Q1364.', 15),
  // ── objets & tech
  wd('voitures', 'Modèles de voitures', '🚗', 'Quelle est cette voiture ?', ['véhicules'], '?item wdt:P31 wd:Q3231690.', 25),
  wd('avions', 'Avions', '✈️', 'Quel est cet avion ?', ['véhicules'], '?item wdt:P31 wd:Q15056995.', 25),
  wd('consoles', 'Consoles de jeu', '🎮', 'Quelle est cette console ?', ['jeux vidéo', 'tech'], '?item wdt:P31 wd:Q8076.', 15, 'photo', 'game'),
  wd('instruments', 'Instruments de musique', '🎻', 'Quel est cet instrument ?', ['musique'], '?item wdt:P279 wd:Q34379.', 15),
  wd('sports', 'Sports', '⚽', 'Quel est ce sport ?', ['sport'], '?item wdt:P31 wd:Q31629.', 30),
  // ── personnages (image = page image, never a cover)
  wd('persos-jv', 'Persos de jeux vidéo (tous)', '🕹️', 'Qui est ce personnage ?', ['jeux vidéo', 'personnages'], '?item wdt:P31 wd:Q1569167.', 15, 'page', 'game'),
  wd('persos-anime', "Persos d'animés (tous)", '🍥', 'Qui est ce personnage ?', ['animés', 'personnages'], '{ ?item wdt:P31 wd:Q15711870. } UNION { ?item wdt:P31 wd:Q80447. }', 12, 'page', 'anime'),
  wd('persos-cartoon', 'Persos de dessins animés (tous)', '📺', 'Qui est ce personnage ?', ['dessins animés', 'personnages'], '?item wdt:P31 wd:Q15773317.', 15, 'page', 'series'),
  // ── Fandom: one pack per big franchise (infobox images = single character portraits)
  fd('naruto', 'Persos de Naruto', '🍥', 'naruto', 'Characters', undefined, ['animés']),
  fd('onepiece', 'Persos de One Piece', '🏴‍☠️', 'onepiece', 'Characters', undefined, ['animés']),
  fd('dragonball', 'Persos de Dragon Ball', '🐉', 'dragonball', 'Characters', undefined, ['animés']),
  fd('snk', "Persos de L'Attaque des Titans", '⚔️', 'attackontitan', 'Characters', undefined, ['animés']),
  fd('mha', 'Persos de My Hero Academia', '💥', 'myheroacademia', 'Characters', undefined, ['animés']),
  fd('demonslayer', 'Persos de Demon Slayer', '🗡️', 'kimetsu-no-yaiba', 'Characters', undefined, ['animés']),
  fd('jjk', 'Persos de Jujutsu Kaisen', '👁️', 'jujutsu-kaisen', 'Characters', undefined, ['animés']),
  fd('bleach', 'Persos de Bleach', '⚰️', 'bleach', 'Characters', undefined, ['animés']),
  fd('hxh', 'Persos de Hunter x Hunter', '🃏', 'hunterxhunter', 'Characters', undefined, ['animés']),
  fd('jojo', 'Persos de JoJo', '⭐', 'jojo', 'Characters', undefined, ['animés']),
  fd('pokemon', 'Pokémon', '⚡', 'pokemon', 'Pokémon species', 'Quel est ce Pokémon ?', ['jeux vidéo'], 'game'),
  fd('mario', 'Univers Mario', '🍄', 'mario', 'Characters', undefined, ['jeux vidéo'], 'game'),
  fd('zelda', 'Univers Zelda', '🗡️', 'zelda', 'Characters', undefined, ['jeux vidéo'], 'game'),
  fd('sonic', 'Univers Sonic', '💨', 'sonic', 'Characters', undefined, ['jeux vidéo'], 'game'),
  fd('minecraft', 'Créatures de Minecraft', '⛏️', 'minecraft', 'Mobs', 'Quelle est cette créature ?', ['jeux vidéo'], 'game'),
  fd('lol', 'Champions de League of Legends', '🛡️', 'leagueoflegends', 'Champions', 'Quel est ce champion ?', ['jeux vidéo'], 'game'),
  fd('genshin', 'Persos de Genshin Impact', '🌸', 'genshin-impact', 'Playable Characters', undefined, ['jeux vidéo'], 'game'),
  fd('overwatch', "Héros d'Overwatch", '🎯', 'overwatch', 'Heroes', 'Quel est ce héros ?', ['jeux vidéo'], 'game'),
  fd('simpsons', 'Persos des Simpson', '🍩', 'simpsons', 'Characters', undefined, ['dessins animés'], 'series'),
  fd('spongebob', "Persos de Bob l'éponge", '🧽', 'spongebob', 'Characters', undefined, ['dessins animés'], 'series'),
  fd('disney', 'Persos Disney', '🏰', 'disney', 'Disney characters', undefined, ['dessins animés'], 'series'),
  fd('pixar', 'Persos Pixar', '🎬', 'pixar', 'Characters', undefined, ['dessins animés'], 'series'),
  fd('harrypotter', 'Univers Harry Potter (créatures)', '🪄', 'harrypotter', 'Magical creatures', 'Quelle est cette créature ?', ['films'], 'series'),
];

const UA = { 'user-agent': 'HellaParty/1.0 (https://hella-party.arietbatiment5.workers.dev; party quiz game)', accept: 'application/sparql-results+json' };
const thirds = (i: number, n: number) => (i < n * 0.35 ? 1 : i < n * 0.7 ? 2 : 3);
const DIFF = ['', 'facile', 'moyen', 'difficile'];
const clean = (t: string) => t.replace(/\s*\([^)]*\)\s*$/, '').trim();

/** Build the pack (network). Returns null on failure (caller keeps the old cache). */
export async function buildAuto(d: AutoDef): Promise<PackFile | null> {
  const qs: PackQuestion[] = [];
  if (d.from === 'wd') {
    const q = `SELECT ?item ?sl ?fr ?en ?img ?enwiki ?fandom WHERE {
      { SELECT ?item ?sl WHERE { ${d.where} ?item wikibase:sitelinks ?sl. FILTER(?sl >= ${d.min ?? 10}) } ORDER BY DESC(?sl) LIMIT 500 }
      OPTIONAL { ?item rdfs:label ?fr. FILTER(LANG(?fr) = "fr") } OPTIONAL { ?item rdfs:label ?en. FILTER(LANG(?en) = "en") }
      OPTIONAL { ?item wdt:P18 ?img } OPTIONAL { ?enwiki schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> }
      OPTIONAL { ?item wdt:P6262 ?fandom } } ORDER BY DESC(?sl)`;
    const j: any = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!j) return null;
    const seen = new Set<string>(), rows: any[] = [];
    for (const b of j.results.bindings) { const id = b.item.value; if (seen.has(id)) continue; seen.add(id); rows.push(b); }
    const ok = rows.filter(b => (b.fr || b.en) && (d.img === 'page' ? b.fandom || b.enwiki : b.img));
    ok.forEach((b, i) => {
      const answer = clean(b.fr?.value ?? b.en.value), en = b.en?.value, diff = thirds(i, ok.length);
      const enTitle = b.enwiki ? decodeURIComponent(b.enwiki.value.split('/wiki/')[1]) : undefined;
      const src = d.img === 'page'
        ? (b.fandom ? `fandom:${b.fandom.value}` : `wiki:en:${enTitle}`)
        : `url:${b.img.value.replace(/^http:/, 'https:')}?width=960`;
      if (/^Q\d+$/.test(answer)) return;
      qs.push({ id: b.item.value.split('/').pop()!, answer, exact: en && en !== answer ? [clean(en)] : [], difficulty: diff, tags: [...d.tags, DIFF[diff]], type: 'image', src,
        ...(enTitle ? { aliasTitle: `en:${enTitle}` } : {}) } as PackQuestion);
    });
  } else {
    const base = `https://${d.wiki}.fandom.com${d.lang ? '/' + d.lang : ''}/api.php`;
    const u = `${base}?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + d.cat)}&gcmnamespace=0&gcmlimit=500&prop=pageimages|info&piprop=original&pilicense=any`;
    const j: any = await fetch(u, { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!j) return null;
    const pages = Object.values<any>(j.query?.pages ?? {}).filter(p => p.original?.source && !/\/|List of|Category/i.test(p.title)).sort((a, b) => b.length - a.length);
    pages.forEach((p, i) => {
      const diff = thirds(i, pages.length);
      const img = p.original.source.replace(/\/revision\/latest(\/[^?]*)?/, '/revision/latest/scale-to-width-down/800');
      qs.push({ id: String(p.pageid), answer: clean(p.title), exact: [], difficulty: diff, tags: [...d.tags, DIFF[diff]], type: 'image', src: `url:${img}`,
        aliasTitle: `fw:${d.wiki}:${p.title}` } as PackQuestion);
    });
  }
  if (!qs.length) return null;
  return { format: 'hella-pack', version: 1, id: d.id, name: d.name, emoji: d.emoji, prompt: d.prompt, tags: d.tags, author: d.from === 'wd' ? 'Wikidata' : 'Fandom', nameKind: d.kind, questions: qs } as PackFile;
}
