// Online pack library: one Durable Object ("main") with SQLite storage.
// Packs published from the Studio (JSON) + their media, content-addressed (sha-256) and chunked (rows ≤ 2 MB).
import { normalize } from '../shared/answer';
import { AUTO, buildAuto, buildDomain, domainFandoms, DOMAINS, fandomChars, fandomDef } from './autopacks';
import { DurableObject } from 'cloudflare:workers';
import { PACK_FORMAT, type PackFile } from '../shared/pack';
import type { PackInfo } from '../shared/protocol';

export interface Env { ROOM: DurableObjectNamespace; LIBRARY: DurableObjectNamespace<Library>; ASSETS: Fetcher }
export const library = (env: Env) => env.LIBRARY.get(env.LIBRARY.idFromName('main'));

const CHUNK = 1_000_000;
export const MAX_MEDIA = 25_000_000;
const MAX_PACK_JSON = 2_000_000;

export type NameKind = 'anime' | 'game' | 'series';

/** Image file names that usually show the answer as text, or a whole cast instead of one subject → skip. */
export const TEXTY = /(^|[^a-z])(logos?|wordmark|covers?|posters?|affiche|jaquette|box[ _-]?art|title[ _-]?card|titlecard|banner|cast|group|ensemble|main[ _-]characters|personnages|characters|promo(tional)?|key[ _-]?art|dvd|blu-?ray|vhs|comic[ _-]?book|issue[ _-]?\d+|tv[ _-]?series|season[ _-]?\d+)([^a-z]|$)/i;

export class Library extends DurableObject {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS packs (id TEXT PRIMARY KEY, json TEXT NOT NULL, key TEXT NOT NULL, info TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS media (hash TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (hash, part));
      CREATE TABLE IF NOT EXISTS media_meta (hash TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS reports (key TEXT NOT NULL, reason TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 1, at INTEGER NOT NULL, PRIMARY KEY (key, reason));
      CREATE TABLE IF NOT EXISTS univ1 (work TEXT PRIMARY KEY, dom TEXT NOT NULL, name TEXT NOT NULL, n INTEGER NOT NULL, pop INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS fwq1 (work TEXT PRIMARY KEY, dom TEXT NOT NULL, name TEXT NOT NULL, wiki TEXT NOT NULL, pop INTEGER NOT NULL, done INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS univdom1 (dom TEXT PRIMARY KEY, at INTEGER NOT NULL, works INTEGER NOT NULL, n INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS auto1 (id TEXT PRIMARY KEY, json TEXT NOT NULL, n INTEGER NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS names8 (k TEXT PRIMARY KEY, list TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS wiki5 (src TEXT PRIMARY KEY, url TEXT, kind TEXT NOT NULL, info TEXT, at INTEGER NOT NULL);`);
  }

  // ── RPC (called by Room and the Worker) ──
  list(): PackInfo[] {
    const lib = this.sql.exec<{ info: string }>('SELECT info FROM packs ORDER BY updated DESC').toArray().map(r => JSON.parse(r.info));
    const counts = new Map(this.sql.exec<{ id: string; n: number }>('SELECT id, n FROM auto1').toArray().map(r => [r.id, r.n]));
    const auto = AUTO.filter(d => counts.get(d.id) !== 0).map(d => ({ id: d.id, name: d.name, emoji: d.emoji, count: counts.get(d.id) ?? 0, tags: d.tags, author: d.from === 'wd' ? 'Wikidata' : 'Fandom', auto: true }));
    const doms = new Map(this.sql.exec<{ dom: string; works: number; n: number }>('SELECT dom, works, n FROM univdom1').toArray().map(r => [r.dom, r]));
    const univ = Object.entries(DOMAINS).map(([k, d]) => ({ id: `u-${k}`, name: d.name, emoji: d.emoji, count: doms.get(k)?.n ?? 0, works: doms.get(k)?.works ?? 0, univ: true }));
    return [...lib, ...auto, ...univ];
  }
  // ── Univers (every fictional character on Wikidata, by work) ────────────────────────────────
  async buildDom(dom: string, force = false) {
    const row = this.sql.exec<{ at: number }>('SELECT at FROM univdom1 WHERE dom = ?', dom).toArray()[0];
    if (row && !force && Date.now() - row.at < 7 * 86_400_000) return;
    const works = await buildDomain(dom);
    if (!works?.length) { if (!row) this.sql.exec('INSERT OR REPLACE INTO univdom1 VALUES (?, ?, 0, 0)', dom, Date.now() - 6 * 86_400_000); return; }
    this.sql.exec('DELETE FROM univ1 WHERE dom = ?', dom);
    for (const w of works) this.sql.exec('INSERT OR REPLACE INTO univ1 VALUES (?, ?, ?, ?, ?, ?)', w.id, dom, w.name, w.questions.length, w.pop, JSON.stringify(w.questions));
    // queue every work of the domain that has its own Fandom wiki (Wikidata P4073) for enrichment
    for (const f of (await domainFandoms(dom)) ?? []) this.sql.exec('INSERT OR IGNORE INTO fwq1 VALUES (?, ?, ?, ?, ?, 0)', f.id, dom, f.name, f.wiki, f.pop);
    this.recount(dom, Date.now());
  }
  private recount(dom: string, at?: number) {
    const r = this.sql.exec<{ w: number; n: number }>('SELECT COUNT(*) AS w, COALESCE(SUM(n), 0) AS n FROM univ1 WHERE dom = ?', dom).toArray()[0];
    const old = this.sql.exec<{ at: number }>('SELECT at FROM univdom1 WHERE dom = ?', dom).toArray()[0];
    this.sql.exec('INSERT OR REPLACE INTO univdom1 VALUES (?, ?, ?, ?)', dom, at ?? old?.at ?? Date.now(), r.w, r.n);
  }
  /** Add the characters of up to `n` queued Fandom wikis (most popular works first) to their work. */
  async enrich(n = 30) {
    const todo = this.sql.exec<{ work: string; dom: string; name: string; wiki: string; pop: number }>('SELECT work, dom, name, wiki, pop FROM fwq1 WHERE done = 0 ORDER BY pop DESC LIMIT ?', n).toArray();
    const doms = new Set<string>();
    for (const t of todo) {
      const qs = await fandomChars(t.wiki, t.name, DOMAINS[t.dom]?.name ?? '');
      this.sql.exec('UPDATE fwq1 SET done = ? WHERE work = ?', qs.length ? 1 : 2, t.work);
      if (!qs.length) continue;
      const row = this.sql.exec<{ json: string }>('SELECT json FROM univ1 WHERE work = ?', t.work).toArray()[0];
      const old: any[] = row ? JSON.parse(row.json) : [];
      const have = new Set(old.map(q => normalize(q.answer)));
      const merged = [...old, ...qs.filter(q => !have.has(normalize(q.answer)))];
      const json = JSON.stringify(merged);
      if (json.length > 1_800_000) continue; // DO row limit
      this.sql.exec('INSERT OR REPLACE INTO univ1 VALUES (?, ?, ?, ?, ?, ?)', t.work, t.dom, t.name, merged.length, Math.max(t.pop * 10, 1), json);
      doms.add(t.dom);
    }
    for (const d of doms) this.recount(d);
    return todo.length;
  }
  univStats() {
    return { domains: this.sql.exec('SELECT * FROM univdom1').toArray(), fandom: this.sql.exec('SELECT done, COUNT(*) AS n FROM fwq1 GROUP BY done').toArray(),
      fandomDone: this.sql.exec('SELECT name, wiki FROM fwq1 WHERE done = 1 ORDER BY pop DESC LIMIT 30').toArray() };
  }
  /** Works of a domain for the lobby tree (most popular first). */
  async works(dom: string) {
    if (!DOMAINS[dom]) return [];
    await this.buildDom(dom);
    return this.sql.exec<{ work: string; name: string; n: number }>('SELECT work, name, n FROM univ1 WHERE dom = ? ORDER BY pop DESC', dom).toArray().map(r => ({ id: r.work, name: r.name, n: r.n }));
  }
  private packOf(id: string, name: string, dom: string, rows: { json: string }[]): PackFile {
    const D = DOMAINS[dom];
    return { format: PACK_FORMAT, version: 1, id, name, prompt: D?.prompt ?? 'Qui est ce personnage ?', nameKind: D?.kind, questions: rows.flatMap(r => JSON.parse(r.json)) } as PackFile;
  }
  /** A whole domain minus the unticked works. */
  async universe(dom: string, excluded: string[] = []) {
    if (!DOMAINS[dom]) return null;
    await this.buildDom(dom);
    const ex = new Set(excluded);
    const rows = this.sql.exec<{ work: string; json: string }>('SELECT work, json FROM univ1 WHERE dom = ?', dom).toArray().filter(r => !ex.has(r.work));
    return this.packOf(`u-${dom}`, DOMAINS[dom].name, dom, rows);
  }
  work(id: string) {
    const r = this.sql.exec<{ dom: string; name: string; json: string }>('SELECT dom, name, json FROM univ1 WHERE work = ?', id).toArray()[0];
    return r ? this.packOf(id, r.name, r.dom, [r]) : null;
  }

  /** Build a few auto packs that were never built (called by rooms when they list packs; 1 fetch each). */
  async warm(n = 6) {
    const have = new Set(this.sql.exec<{ id: string }>('SELECT id FROM auto1').toArray().map(r => r.id));
    for (const d of AUTO.filter(x => !have.has(x.id)).slice(0, n)) await this.auto(d.id);
    const built = new Set(this.sql.exec<{ dom: string }>('SELECT dom FROM univdom1').toArray().map(r => r.dom));
    const next = Object.keys(DOMAINS).find(d => !built.has(d));
    if (next) await this.buildDom(next); // one domain per call (big query)
    else await this.enrich(35);        // then Fandom wikis, 35 per call (subrequest budget)
  }
  /** Auto pack (Wikidata / Fandom), rebuilt at most every 7 days; old copy kept if the rebuild fails. */
  async auto(id: string): Promise<PackFile | null> {
    const d = AUTO.find(x => x.id === id) ?? (/^fw-[a-z0-9-]{2,60}$/.test(id) ? fandomDef(id.slice(3)) : undefined); if (!d) return null;
    const row = this.sql.exec<{ json: string; at: number }>('SELECT json, at FROM auto1 WHERE id = ?', id).toArray()[0];
    if (row && Date.now() - row.at < 7 * 86_400_000) return row.json ? JSON.parse(row.json) : null;
    const p = await buildAuto(d);
    if (p) this.sql.exec('INSERT OR REPLACE INTO auto1 VALUES (?, ?, ?, ?)', id, JSON.stringify(p), p.questions.length, Date.now());
    else if (!row) this.sql.exec('INSERT OR REPLACE INTO auto1 VALUES (?, ?, ?, ?)', id, '', 0, Date.now() - 6 * 86_400_000); // retry in a day
    return p ?? (row?.json ? JSON.parse(row.json) : null);
  }
  ids(): string[] { return this.sql.exec<{ id: string }>('SELECT id FROM packs').toArray().map(r => r.id); }
  async get(id: string): Promise<(PackFile & { media?: Record<string, string> }) | null> {
    if (id.startsWith('auto-') || id.startsWith('fw-')) return this.auto(id);
    const r = this.sql.exec<{ json: string }>('SELECT json FROM packs WHERE id = ?', id).toArray()[0];
    return r ? JSON.parse(r.json) : null;
  }

  put(pack: PackFile & { media?: Record<string, string> }, key: string): { ok: boolean; error?: string } {
    if (pack?.format !== PACK_FORMAT || !/^[a-z0-9-]{1,40}$/.test(pack.id) || !Array.isArray(pack.questions)) return { ok: false, error: 'pack invalide' };
    if (!key || key.length < 8) return { ok: false, error: 'clé manquante' };
    const old = this.sql.exec<{ key: string }>('SELECT key FROM packs WHERE id = ?', pack.id).toArray()[0];
    if (old && old.key !== key) return { ok: false, error: 'Ce nom de pack est déjà pris par quelqu\'un d\'autre. Change le nom.' };
    const json = JSON.stringify(pack);
    if (json.length > MAX_PACK_JSON) return { ok: false, error: 'pack trop gros (texte > 2 Mo)' };
    const tags = [...new Set([...(pack.tags ?? []), ...pack.questions.flatMap(q => q.tags ?? [])])].slice(0, 40);
    const info: PackInfo = { id: pack.id, name: String(pack.name).slice(0, 60), count: pack.questions.length, emoji: pack.emoji, author: pack.author, tags, custom: true };
    this.sql.exec('INSERT OR REPLACE INTO packs (id, json, key, info, updated) VALUES (?, ?, ?, ?, ?)', pack.id, json, key, JSON.stringify(info), Date.now());
    return { ok: true };
  }

  remove(id: string, key: string) {
    const old = this.sql.exec<{ key: string }>('SELECT key FROM packs WHERE id = ?', id).toArray()[0];
    if (!old || old.key !== key) return { ok: false };
    this.sql.exec('DELETE FROM packs WHERE id = ?', id);
    return { ok: true };
  }

  /** wiki:Title → playable image URL, shared by all rooms (table wiki5, kind = how it was resolved, for /api/wiki-stats):
   *  'stored' = downloaded once by the server, served from /api/media (best);
   *  'direct' = the server could not download it, players load Wikimedia's own thumbnail;
   *  'none'   = the article has no image → the question is skipped. Transient errors are not cached. */
  /** 'lang:Title' → other names of that Wikipedia page: its redirects (abbreviations, spellings) and its
   *  titles in en/fr/es/it/de/pt (+ their en/fr redirects). Cached 30 days. Becomes extra accepted answers. */
  async names(k: string, kind?: NameKind): Promise<string[]> {
    if (kind) k += '|' + kind;
    const FR_EN = (l: string) => /^(fr|en)(-|$)/.test(l);
    const row = this.sql.exec<{ list: string; at: number }>('SELECT list, at FROM names8 WHERE k = ?', k).toArray()[0];
    if (row && Date.now() - row.at < 30 * 86_400_000) return JSON.parse(row.list);
    if (k.startsWith('fw:')) { // fandom page (auto packs): that wiki's redirects = nicknames
      const [, wiki, ...t] = k.split(':'); const out = new Set<string>([t.join(':')]);
      const j: any = await fetch(`https://${wiki}.fandom.com/api.php?action=query&format=json&redirects=1&prop=redirects&rdnamespace=0&rdlimit=500&titles=${encodeURIComponent(t.join(':'))}`, { headers: { 'user-agent': 'HellaParty/1.0' } }).then(r => r.ok ? r.json() : null).catch(() => null);
      const page: any = j && Object.values(j.query?.pages ?? {})[0];
      for (const r of page?.redirects ?? []) out.add(r.title);
      const list = [...out].map(x => x.replace(/\s*\([^)]*\)\s*$/, '')).filter(x => x && x.length <= 60);
      if (page) this.sql.exec('INSERT OR REPLACE INTO names8 VALUES (?, ?, ?)', k, JSON.stringify(list), Date.now());
      return list;
    }
    const [lang, ...rest] = k.split('|')[0].split(':'); const title = rest.join(':').replace(/_/g, ' ');
    const UA = { 'user-agent': 'HellaParty/1.0 (https://hella-party.arietbatiment5.workers.dev; party quiz game)' };
    const out = new Set<string>(); let ok = false;
    const q = async (l: string, t: string) => {
      const u = `https://${l}.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=redirects|langlinks&rdnamespace=0&rdlimit=200&lllimit=500&titles=${encodeURIComponent(t)}`;
      const j: any = await fetch(u, { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
      const page: any = j && Object.values(j.query?.pages ?? {})[0];
      if (!page || page.missing !== undefined) return null;
      ok = true;
      if (/\(homonymie\)|\(disambiguation\)/i.test(page.title)) return null;
      out.add(page.title);
      for (const r of page.redirects ?? []) out.add(r.title);
      const ll: Record<string, string> = {};
      for (const x of page.langlinks ?? []) { ll[x.lang] = x['*']; if (FR_EN(x.lang)) out.add(x['*']); } // owner: French + English only
      return ll;
    };
    const ll = await q(lang, title);
    const other = lang === 'fr' ? ll?.en : ll?.fr;
    if (other) await q(lang === 'fr' ? 'en' : 'fr', other);
    // redirects of the big other wikis too (each has its own abbreviations / spellings)
    // ConceptNet: synonyms / translations of the word in every language (common nouns: tomate → tomato, pomodoro…)
    const cn = async (l: string, w: string) => {
      const term = w.toLowerCase().trim().replace(/\s+/g, '_');
      const j: any = await fetch(`https://api.conceptnet.io/query?node=/c/${l}/${encodeURIComponent(term)}&other=/c&limit=500`, { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
      for (const e of j?.edges ?? []) if (/Synonym|TranslationOf|FormOf|EtymologicallyRelatedTo/.test(e.rel?.['@id'] ?? '')) for (const n of [e.start, e.end]) if (n?.label && /^\/c\/(fr|en)\//.test(n['@id'] ?? '')) out.add(n.label);
    };
    // Wiktionary (FR + EN): synonyms, abbreviations, spelling variants of the word (frigo, télé, bagnole…)
    const wikt = async (l: 'fr' | 'en', w: string) => {
      const j: any = await fetch(`https://${l}.wiktionary.org/w/api.php?action=parse&format=json&prop=wikitext&redirects=1&page=${encodeURIComponent(w.toLowerCase())}`, { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
      let t: string = j?.parse?.wikitext?.['*'] ?? ''; if (!t) return;
      t = l === 'fr' ? (t.split(/==\s*\{\{langue\|fr\}\}\s*==/)[1] ?? '').split(/\n==\s*\{\{langue\|/)[0] : (t.split(/\n==English==/)[1] ?? '').split(/\n==[^=]/)[0];
      const SEC = l === 'fr' ? /\{\{S\|(synonymes|quasi-synonymes|abréviations|variantes|variantes orthographiques)/ : /^=+\s*(Synonyms|Alternative forms|Abbreviations)\s*=+/;
      for (const sec of t.split(/\n(?==)/)) {
        const head = sec.split('\n')[0];
        if (SEC.test(head)) for (const m of sec.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]|\{\{(?:lien|l)\|([^|}]+)/g)) out.add(m[1] ?? m[2]);
        for (const m of sec.matchAll(/\{\{(?:syn|synonyms)\|en\|([^}]+)\}\}/g)) for (const x of m[1].split('|')) if (!x.includes('=')) out.add(x);
      }
    };
    // AniList (anime packs): romaji / English / native titles + every synonym fans use (SnK, AoT, Shingeki…)
    const anilist = async (search: string) => {
      const j: any = await fetch('https://graphql.anilist.co', { method: 'POST', headers: { ...UA, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query: 'query($s:String){Media(search:$s,type:ANIME,sort:POPULARITY_DESC){title{romaji english userPreferred}synonyms}}', variables: { s: search } }) })
        .then(r => r.ok ? r.json() : null).catch(() => null);
      const m = j?.data?.Media; if (!m) return;
      for (const t of [m.title?.romaji, m.title?.english, m.title?.userPreferred, ...(m.synonyms ?? [])]) if (t) out.add(t);
    };
    // Video games: keyless MediaWiki fan wikis (redirects = abbreviations, alt titles, character nicknames)
    const mw = async (api: string, t: string) => {
      const j: any = await fetch(`${api}?action=query&format=json&redirects=1&prop=redirects&rdnamespace=0&rdlimit=500&titles=${encodeURIComponent(t)}`, { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
      const page: any = j && Object.values(j.query?.pages ?? {})[0];
      if (!page || page.missing !== undefined) return;
      out.add(page.title); for (const r of page.redirects ?? []) out.add(r.title);
    };
    const en = lang === 'en' ? title : other ?? title;
    const GAME_WIKIS = ['https://www.pcgamingwiki.com/w/api.php', 'https://strategywiki.org/w/api.php', 'https://www.ssbwiki.com/api.php'];
    // TV series / cartoons: TVMaze alternative titles per country (keyless)
    const tvmaze = async (t: string) => {
      const j: any = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(t)}&embed=akas`, { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!j) return; out.add(j.name); for (const a of j._embedded?.akas ?? []) if (!a.country || ['FR', 'US', 'GB', 'CA', 'BE'].includes(a.country.code)) out.add(a.name);
    };
    await Promise.all([
      ...(kind === 'game' ? GAME_WIKIS.map(w => mw(w, en)) : []),
      kind === 'series' ? tvmaze(en) : null, kind === 'series' && en !== title ? tvmaze(title) : null,
      kind === 'anime' ? anilist(other && lang === 'fr' ? other : title) : null, cn(lang, title), other ? cn(lang === 'fr' ? 'en' : 'fr', other) : null,
      wikt(lang === 'en' ? 'en' : 'fr', title), other ? wikt(lang === 'fr' ? 'en' : 'fr', other) : null]);
    // Wikidata labels + aliases in every language (nicknames, short names, abbreviations)
    const wd: any = ll && await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|aliases|claims&sites=${lang}wiki&titles=${encodeURIComponent(title)}`, { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
    const ent: any = wd && Object.values(wd.entities ?? {})[0];
    for (const [k, l] of Object.entries<any>(ent?.labels ?? {})) if (FR_EN(k)) out.add(l.value);
    for (const [k, a] of Object.entries<any>(ent?.aliases ?? {})) if (FR_EN(k)) for (const x of a) out.add(x.value);
    // curated Wikidata name properties: short name (acronyms like SNES), nickname, pseudonym, taxon common name
    for (const p of ['P1813', 'P1449', 'P742', 'P1843', 'P1448', 'P1476']) for (const c of ent?.claims?.[p] ?? []) {
      const v = c.mainsnak?.datavalue?.value; if (typeof v === 'string') out.add(v); else if (v?.text && FR_EN(v.language ?? 'en')) out.add(v.text);
    }
    // Fandom: Wikidata P6262 = "[lang.]wiki:Article" → that fan wiki's title + redirects (nicknames, alt names)
    const fandoms: string[] = (ent?.claims?.P6262 ?? []).map((c: any) => c.mainsnak?.datavalue?.value).filter(Boolean).slice(0, 8);
    await Promise.all(fandoms.map(async v => {
      const m = /^(?:([a-z-]+)\.)?([a-z0-9-]+):(.+)$/i.exec(v); if (!m) return;
      const base = `https://${m[2]}.fandom.com${m[1] ? '/' + m[1] : ''}`;
      const j: any = await fetch(`${base}/api.php?action=query&format=json&redirects=1&prop=redirects&rdnamespace=0&rdlimit=500&titles=${encodeURIComponent(m[3].replace(/_/g, ' '))}`, { headers: UA }).then(r => r.ok ? r.json() : null).catch(() => null);
      const page: any = j && Object.values(j.query?.pages ?? {})[0];
      if (!page || page.missing !== undefined) return;
      out.add(page.title); for (const r of page.redirects ?? []) out.add(r.title);
    }));
    const list = [...out].map(s => s.replace(/\s*\([^)]*\)\s*$/, '').trim())
      .filter(s => s && s.length <= 60 && !/[:/#]/.test(s) && /^[\p{Script=Latin}\d\s'’.,&!?()-]+$/u.test(s)).slice(0, 1000); // French/English only
    if (ok) this.sql.exec('INSERT OR REPLACE INTO names8 VALUES (?, ?, ?)', k, JSON.stringify([...new Set(list)]), Date.now());
    return [...new Set(list)];
  }

  /** Download an image URL, keep a same-origin copy (/api/media/<hash>), cache the result under `src`. */
  private async store(src: string, u: string, UA: Record<string, string>): Promise<string | null> {
    if (TEXTY.test(decodeURIComponent(u.split('?')[0]))) { this.sql.exec('INSERT OR REPLACE INTO wiki5 VALUES (?, ?, ?, ?, ?)', src, null, 'none', 'texty file name', Date.now()); return null; }
    const img = await fetch(u, { headers: UA }).catch(() => null);
    if (img?.ok) {
      const type = img.headers.get('content-type') ?? '', bytes = await img.arrayBuffer();
      if (type.startsWith('image/') && !type.includes('svg') && bytes.byteLength > 200 && bytes.byteLength <= 3_000_000) {
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
        await this.putMedia(hash, type, bytes);
        const url = `/api/media/${hash}.${type.split('/')[1].replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '')}`;
        this.sql.exec('INSERT OR REPLACE INTO wiki5 VALUES (?, ?, ?, ?, ?)', src, url, 'stored', null, Date.now());
        return url;
      }
    }
    if (img && img.status < 500 && img.status !== 429) this.sql.exec('INSERT OR REPLACE INTO wiki5 VALUES (?, ?, ?, ?, ?)', src, null, 'none', `img ${img.status}`, Date.now());
    return null;
  }

  async wiki(src: string): Promise<string | null> {
    const row = this.sql.exec<{ url: string | null; kind: string; at: number }>('SELECT url, kind, at FROM wiki5 WHERE src = ?', src).toArray()[0];
    if (row && (row.kind === 'stored' || Date.now() - row.at < (row.kind === 'direct' ? 3_600_000 : 86_400_000))) return row.url;
    const UA0 = { 'user-agent': 'HellaParty/1.0 (https://hella-party.arietbatiment5.workers.dev; party quiz game)' };
    if (src.startsWith('url:') || src.startsWith('fandom:')) {
      let u = src.slice(4);
      if (src.startsWith('fandom:')) { // Wikidata P6262 "[lang.]wiki:Article" → that page's infobox image
        const f = /^fandom:(?:([a-z-]+)\.)?([a-z0-9-]+):(.+)$/i.exec(src); if (!f) return null;
        const j: any = await fetch(`https://${f[2]}.fandom.com${f[1] ? '/' + f[1] : ''}/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=original&titles=${encodeURIComponent(f[3].replace(/_/g, ' '))}`, { headers: UA0 }).then(r => r.ok ? r.json() : null).catch(() => null);
        const o = j && (Object.values(j.query?.pages ?? {})[0] as any)?.original?.source;
        if (!o) { this.sql.exec('INSERT OR REPLACE INTO wiki5 VALUES (?, ?, ?, ?, ?)', src, null, 'none', 'fandom: no image', Date.now()); return null; }
        u = o.replace(/\/revision\/latest(\/[^?]*)?/, '/revision/latest/scale-to-width-down/800');
      }
      return this.store(src, u, UA0);
    }
    const m = src.match(/^wiki:(?:([a-z]{2,3}):)?(.+)$/);
    if (!m) return null;
    const lang = m[1] ?? 'fr', title = encodeURIComponent(m[2].trim().replace(/ /g, '_'));
    const UA = { 'user-agent': 'HellaParty/1.0 (https://hella-party.arietbatiment5.workers.dev; party quiz game)', 'api-user-agent': 'HellaParty/1.0' };
    let thumb: string | undefined, big: string | undefined, info = '', transient = false;
    for (const l of [lang, lang === 'fr' ? 'en' : 'fr']) {
      const r = await fetch(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${title}`, { headers: UA }).catch(e => { info += `summary ${l}: ${e}; `; return null; });
      if (!r || r.status === 429 || r.status >= 500) { transient = true; if (r) info += `summary ${l}: ${r.status}; `; continue; }
      if (!r.ok) { info += `summary ${l}: ${r.status}; `; continue; }
      const j: any = await r.json().catch(() => null);
      thumb = j?.thumbnail?.source;
      if (thumb && TEXTY.test(decodeURIComponent(j?.originalimage?.source ?? thumb))) { info += `summary ${l}: texty image; `; thumb = undefined; break; }
      // summary thumbnails are ~320px: ask for 960px (a standard Wikimedia step), or the original if smaller (not SVG)
      const o = j?.originalimage;
      if (thumb && o?.width > 960 && /\/\d+px-/.test(thumb)) big = thumb.replace(/\/\d+px-/, '/960px-');
      else if (o?.source && o.width > 330 && !/\.svg$/i.test(o.source)) big = o.source;
      if (thumb) break;
      info += `summary ${l}: no image; `;
    }
    if (!thumb) {
      if (!transient) this.sql.exec('INSERT OR REPLACE INTO wiki5 VALUES (?, ?, ?, ?, ?)', src, null, 'none', info, Date.now());
      return null;
    }
    // try to store a copy (thumbnail as given = a size Wikimedia always serves)
    let img = big ? await fetch(big, { headers: UA }).catch(() => null) : null;
    if (img?.ok && Number(img.headers.get('content-length') ?? 0) > 1_500_000) img = null; // too heavy for phones
    if (!img?.ok) img = await fetch(thumb, { headers: UA }).catch(e => { info += `img: ${e}; `; return null; });
    else thumb = big!;
    if (img?.ok) {
      const type = img.headers.get('content-type') ?? '';
      const bytes = await img.arrayBuffer();
      if (type.startsWith('image/') && bytes.byteLength > 200 && bytes.byteLength <= 3_000_000) {
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
        await this.putMedia(hash, type, bytes);
        const url = `/api/media/${hash}.${type.split('/')[1].replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '')}`;
        this.sql.exec('INSERT OR REPLACE INTO wiki5 VALUES (?, ?, ?, ?, ?)', src, url, 'stored', null, Date.now());
        return url;
      }
      info += `img: bad type/size ${type} ${bytes.byteLength}; `;
    } else if (img) info += `img: ${img.status}; `;
    // could not copy it: let players load the thumbnail straight from Wikimedia (they report back if it fails)
    this.sql.exec('INSERT OR REPLACE INTO wiki5 VALUES (?, ?, ?, ?, ?)', src, thumb, 'direct', info, Date.now());
    return thumb;
  }

  /** Players flag a bad question from the reveal screen (🚩). Read with GET /api/reports. */
  report(key: string, reason: string) {
    this.sql.exec('INSERT INTO reports (key, reason, n, at) VALUES (?, ?, 1, ?) ON CONFLICT(key, reason) DO UPDATE SET n = n + 1, at = excluded.at', key.slice(0, 120), reason.slice(0, 40), Date.now());
  }
  reports() { return this.sql.exec('SELECT key, reason, n, at FROM reports ORDER BY n DESC, at DESC LIMIT 500').toArray(); }

  wikiStats() {
    const counts = this.sql.exec<{ kind: string; n: number }>('SELECT kind, COUNT(*) AS n FROM wiki5 GROUP BY kind').toArray();
    const samples = this.sql.exec<{ src: string; kind: string; info: string }>("SELECT src, kind, info FROM wiki5 WHERE kind != 'stored' ORDER BY at DESC LIMIT 30").toArray();
    return { counts, samples };
  }

  hasMedia(hash: string) { return this.sql.exec('SELECT 1 FROM media_meta WHERE hash = ?', hash).toArray().length > 0; }

  async putMedia(hash: string, type: string, bytes: ArrayBuffer) {
    if (bytes.byteLength > MAX_MEDIA) return { ok: false, error: 'fichier trop gros (> 25 Mo)' };
    const real = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (real !== hash) return { ok: false, error: 'hash invalide' };
    if (this.hasMedia(hash)) return { ok: true };
    for (let i = 0, part = 0; i < bytes.byteLength; i += CHUNK, part++) {
      this.sql.exec('INSERT OR REPLACE INTO media (hash, part, data) VALUES (?, ?, ?)', hash, part, bytes.slice(i, i + CHUNK));
    }
    this.sql.exec('INSERT OR REPLACE INTO media_meta (hash, type, size) VALUES (?, ?, ?)', hash, type.slice(0, 60), bytes.byteLength);
    return { ok: true };
  }

  getMedia(hash: string): { type: string; data: Uint8Array } | null {
    const meta = this.sql.exec<{ type: string; size: number }>('SELECT type, size FROM media_meta WHERE hash = ?', hash).toArray()[0];
    if (!meta) return null;
    const out = new Uint8Array(meta.size);
    let off = 0;
    for (const r of this.sql.exec<{ data: ArrayBuffer }>('SELECT data FROM media WHERE hash = ? ORDER BY part', hash)) {
      const b = new Uint8Array(r.data); out.set(b, off); off += b.byteLength;
    }
    return { type: meta.type, data: out };
  }
}
