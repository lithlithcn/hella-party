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
/** Wikidata SPARQL with retries (the public endpoint times out / rate-limits now and then). */
async function sparql(q: string): Promise<any> {
  for (let i = 0; i < 4; i++) {
    const j = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (j) return j;
    await new Promise(r => setTimeout(r, 5000 * (i + 1)));
  }
  return null;
}
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
    const j: any = await sparql(q);
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
    let j: any = null;
    for (const cat of [d.cat, 'Characters', 'Playable characters'].filter((x, i, a) => a.indexOf(x) === i)) {
      const u = `${base}?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + cat)}&gcmnamespace=0&gcmlimit=500&prop=pageimages|info&piprop=original&pilicense=any`;
      j = await fetch(u, { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (j?.query?.pages) break;
    }
    if (!j) return null;
    const pages = Object.values<any>(j.query?.pages ?? {}).filter(p => p.original?.source && !/\/|List of|Category/i.test(p.title)).sort((a, b) => b.length - a.length);
    pages.forEach((p, i) => {
      const diff = thirds(i, pages.length);
      const img = p.original.source.replace(/\/revision\/latest(\/[^?]*)?/, '/revision/latest/scale-to-width-down/800');
      qs.push({ id: String(p.pageid), answer: clean(p.title), exact: [], difficulty: diff, tags: [...d.tags, DIFF[diff]], type: 'image', src: `url:${img}`, group: d.name.replace(/^(Persos (de |d'|des )|Univers |Champions de |Héros d'|Créatures de )/, ''),
        aliasTitle: `fw:${d.wiki}:${p.title}` } as PackQuestion);
    });
  }
  if (!qs.length) return null;
  return { format: 'hella-pack', version: 1, id: d.id, name: d.name, emoji: d.emoji, prompt: d.prompt, tags: d.tags, author: d.from === 'wd' ? 'Wikidata' : 'Fandom', nameKind: d.kind, questions: qs } as PackFile;
}

// ── Univers: EVERY fictional character on Wikidata, grouped by work (game / anime / film…), browsable as a tree.
// Domain = classes of works. Characters = items "present in work" (P1441) or "from franchise" (P8345), not humans.
export const DOMAINS: Record<string, { name: string; emoji: string; classes: string[]; prompt: string; kind?: NameKind }> = {
  jeux: { name: 'Jeux vidéo', emoji: '🎮', classes: ['Q7889', 'Q7058673', 'Q865493'], prompt: 'Qui est ce personnage ?', kind: 'game' },
  animes: { name: 'Animés & mangas', emoji: '🍥', classes: ['Q63952888', 'Q21198342', 'Q1107', 'Q20650540', 'Q8274'], prompt: 'Qui est ce personnage ?', kind: 'anime' },
  vn: { name: 'Visual novels', emoji: '📖', classes: ['Q689445'], prompt: 'Qui est ce personnage ?', kind: 'anime' },
  cartoons: { name: 'Dessins animés', emoji: '📺', classes: ['Q581714', 'Q202866', 'Q117467246'], prompt: 'Qui est ce personnage ?', kind: 'series' },
  films: { name: 'Films', emoji: '🎬', classes: ['Q11424', 'Q24856'], prompt: 'Qui est ce personnage ?' },
  series: { name: 'Séries TV', emoji: '📡', classes: ['Q5398426'], prompt: 'Qui est ce personnage ?', kind: 'series' },
  comics: { name: 'BD & comics', emoji: '💬', classes: ['Q1004', 'Q14406742', 'Q838795', 'Q725377'], prompt: 'Qui est ce personnage ?' },
  livres: { name: 'Livres', emoji: '📚', classes: ['Q7725634', 'Q1667921', 'Q8261'], prompt: 'Qui est ce personnage ?' },
};

export interface Work { id: string; name: string; pop: number; questions: PackQuestion[] }

/** One SPARQL fetch → all works of the domain with their characters (difficulty = character sitelinks, thirds). */
export async function buildDomain(dom: string): Promise<Work[] | null> {
  const D = DOMAINS[dom]; if (!D) return null;
  const all: any[] = []; let ok = false;
  for (const cls of D.classes) { const r = await domainQuery([cls]); if (r) { ok = true; all.push(...r); } }
  if (!ok) return null;
  return groupWorks(D, all);
}
async function domainQuery(classes: string[]): Promise<any[] | null> {
  const D = { classes };
  const q = `SELECT ?c ?cl ?sl ?w ?wl ?fandom ?enwiki WHERE {
    { SELECT DISTINCT ?c ?w ?sl WHERE { VALUES ?cls { ${D.classes.map(c => 'wd:' + c).join(' ')} } ?w wdt:P31 ?cls.
      { ?c wdt:P1441 ?w } UNION { ?c wdt:P8345 ?w } ?c wikibase:sitelinks ?sl. FILTER(?sl >= 1) FILTER NOT EXISTS { ?c wdt:P31 wd:Q5 } } LIMIT 30000 }
    OPTIONAL { ?c wdt:P6262 ?fandom } OPTIONAL { ?enwiki schema:about ?c; schema:isPartOf <https://en.wikipedia.org/> }
    FILTER(BOUND(?fandom) || BOUND(?enwiki))
    SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?c rdfs:label ?cl. ?w rdfs:label ?wl. } }`;
  const j: any = await sparql(q);
  return j ? j.results.bindings : null;
}
function groupWorks(D: { name: string }, bindings: any[]): Work[] {
  const seen = new Set<string>(), works = new Map<string, Work>(), rows: any[] = [];
  for (const b of bindings) {
    const k = b.c.value + b.w.value; if (seen.has(k)) continue; seen.add(k);
    if (/^Q\d+$/.test(b.cl?.value ?? 'Q1') || /^Q\d+$/.test(b.wl?.value ?? 'Q1')) continue;
    rows.push(b);
  }
  rows.sort((a, b) => +b.sl.value - +a.sl.value);
  rows.forEach((b, i) => {
    const wid = 'w-' + b.w.value.split('/').pop();
    let w = works.get(wid); if (!w) works.set(wid, w = { id: wid, name: clean(b.wl.value), pop: 0, questions: [] });
    w.pop += +b.sl.value;
    const diff = thirds(i, rows.length), enTitle = b.enwiki ? decodeURIComponent(b.enwiki.value.split('/wiki/')[1]) : undefined;
    w.questions.push({ id: b.c.value.split('/').pop()!, answer: clean(b.cl.value), exact: [], difficulty: diff, tags: [D.name.toLowerCase(), w.name, DIFF[diff]], type: 'image',
      src: b.fandom ? `fandom:${b.fandom.value}` : `wiki:en:${enTitle}`, explain: `Personnage de ${w.name}`, group: w.name,
      ...(enTitle ? { aliasTitle: `en:${enTitle}` } : {}) } as PackQuestion);
  });
  return [...works.values()].sort((a, b) => b.pop - a.pop);
}

/** Any Fandom wiki by name ("rivalsofaether", "touhou"…): its character category. */
export const fandomDef = (wiki: string): AutoDef => ({ id: `fw-${wiki}`, name: `Fandom : ${wiki}`, emoji: '🌐', prompt: 'Qui est ce personnage ?', tags: ['personnages', wiki], from: 'fandom', wiki, cat: 'Characters' });

/** Works of a domain that have their own Fandom wiki (Wikidata P4073) → their whole character category is added. */
export async function domainFandoms(dom: string): Promise<{ id: string; name: string; wiki: string; pop: number }[] | null> {
  const D = DOMAINS[dom]; if (!D) return null;
  const q = `SELECT ?w ?wl ?fw ?sl WHERE { VALUES ?cls { ${D.classes.map(c => 'wd:' + c).join(' ')} } ?w wdt:P31 ?cls; wdt:P4073 ?fw; wikibase:sitelinks ?sl.
    SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". ?w rdfs:label ?wl. } } LIMIT 20000`;
  const j: any = await sparql(q);
  if (!j) return null;
  const seen = new Set<string>();
  return j.results.bindings.filter((b: any) => !seen.has(b.w.value) && seen.add(b.w.value) && !/^Q\d+$/.test(b.wl?.value ?? 'Q'))
    .map((b: any) => ({ id: 'w-' + b.w.value.split('/').pop(), name: clean(b.wl.value), wiki: b.fw.value.split('.')[0].toLowerCase(), pop: +b.sl.value }));
}

/** Characters of one Fandom wiki (1-2 fetches). Difficulty by page length within the wiki. */
export async function fandomChars(wiki: string, work: string, domName: string): Promise<PackQuestion[]> {
  const p = await buildAuto({ id: 'x', name: work, emoji: '', prompt: '', tags: [domName.toLowerCase(), work], from: 'fandom', wiki, cat: 'Characters' });
  return (p?.questions ?? []).map(q => ({ ...q, id: `${wiki}-${q.id}`, explain: `Personnage de ${work}`, group: work } as PackQuestion));
}

/** Auto sources merged INTO existing built-in categories (owner: add to the tags already there; new categories only
 *  when nothing matches). Univers domains merged here get the ▸ works list on that category's chip. */
export const INTO: Record<string, string> = {
  'auto-especes': 'animaux', 'auto-chiens': 'chiens-chats', 'auto-chats': 'chiens-chats', 'auto-chevaux': 'animaux',
  'auto-montagnes': 'merveilles-nature', 'auto-volcans': 'merveilles-nature', 'auto-iles': 'merveilles-nature', 'auto-lacs': 'merveilles-nature', 'auto-cascades': 'merveilles-nature',
  'auto-unesco': 'monuments', 'auto-chateaux': 'monuments', 'auto-ponts': 'monuments', 'auto-gratte-ciels': 'monuments',
  'auto-stades': 'sports', 'auto-sports': 'sports',
  'auto-plats': 'bouffe', 'auto-fromages': 'bouffe', 'auto-cocktails': 'bouffe', 'auto-patisseries': 'desserts', 'auto-fruits': 'fruits-legumes',
  'auto-voitures': 'vehicules', 'auto-avions': 'vehicules', 'auto-consoles': 'consoles', 'auto-instruments': 'instruments',
  'auto-persos-jv': 'persos-jeux-video', 'auto-persos-cartoon': 'persos-dessins-animes',
  'auto-mario': 'persos-jeux-video', 'auto-zelda': 'persos-jeux-video', 'auto-sonic': 'persos-jeux-video', 'auto-overwatch': 'persos-jeux-video',
  'auto-genshin': 'persos-jeux-video', 'auto-lol': 'persos-jeux-video',
  'auto-simpsons': 'persos-dessins-animes', 'auto-spongebob': 'persos-dessins-animes', 'auto-disney': 'persos-dessins-animes', 'auto-pixar': 'persos-dessins-animes',
  'u-jeux': 'persos-jeux-video', 'u-cartoons': 'persos-dessins-animes', 'u-animes': 'animes', 'auto-persos-anime': 'animes',
  'auto-naruto': 'animes', 'auto-onepiece': 'animes', 'auto-dragonball': 'animes', 'auto-snk': 'animes', 'auto-mha': 'animes', 'auto-demonslayer': 'animes',
  'auto-jjk': 'animes', 'auto-bleach': 'animes', 'auto-hxh': 'animes', 'auto-jojo': 'animes', 'auto-pokemon': 'persos-jeux-video', 'auto-minecraft': 'persos-jeux-video',
};
