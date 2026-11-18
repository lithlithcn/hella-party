// Online pack library: one Durable Object ("main") with SQLite storage.
// Packs published from the Studio (JSON) + their media, content-addressed (sha-256) and chunked (rows ≤ 2 MB).
import { DurableObject } from 'cloudflare:workers';
import { PACK_FORMAT, type PackFile } from '../shared/pack';
import type { PackInfo } from '../shared/protocol';

export interface Env { ROOM: DurableObjectNamespace; LIBRARY: DurableObjectNamespace<Library>; ASSETS: Fetcher }
export const library = (env: Env) => env.LIBRARY.get(env.LIBRARY.idFromName('main'));

const CHUNK = 1_000_000;
export const MAX_MEDIA = 25_000_000;
const MAX_PACK_JSON = 2_000_000;

export class Library extends DurableObject {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS packs (id TEXT PRIMARY KEY, json TEXT NOT NULL, key TEXT NOT NULL, info TEXT NOT NULL, updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS media (hash TEXT NOT NULL, part INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (hash, part));
      CREATE TABLE IF NOT EXISTS media_meta (hash TEXT PRIMARY KEY, type TEXT NOT NULL, size INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS wiki (src TEXT PRIMARY KEY, url TEXT, at INTEGER NOT NULL);`);
  }

  // ── RPC (called by Room and the Worker) ──
  list(): PackInfo[] {
    return this.sql.exec<{ info: string }>('SELECT info FROM packs ORDER BY updated DESC').toArray().map(r => JSON.parse(r.info));
  }
  ids(): string[] { return this.sql.exec<{ id: string }>('SELECT id FROM packs').toArray().map(r => r.id); }
  get(id: string): (PackFile & { media?: Record<string, string> }) | null {
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

  /** wiki:Title → image URL, cached for every room (failures retried after a day). */
  async wiki(src: string): Promise<string | null> {
    const row = this.sql.exec<{ url: string | null; at: number }>('SELECT url, at FROM wiki WHERE src = ?', src).toArray()[0];
    if (row && (row.url || Date.now() - row.at < 86_400_000)) return row.url;
    const m = src.match(/^wiki:(?:([a-z]{2,3}):)?(.+)$/);
    if (!m) return null;
    const lang = m[1] ?? 'fr', title = encodeURIComponent(m[2].trim().replace(/ /g, '_'));
    let url: string | null = null, transient = false;
    for (const l of [lang, lang === 'fr' ? 'en' : 'fr']) {
      const r = await fetch(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${title}`, { headers: { 'user-agent': 'HellaParty/1.0 (party quiz game between friends)' } }).catch(() => null);
      if (!r || r.status === 429 || r.status >= 500) { transient = true; continue; }
      if (!r.ok) continue;
      const j: any = await r.json().catch(() => null);
      url = j?.thumbnail?.source?.replace(/\/(\d+)px-/, '/640px-') ?? j?.originalimage?.source ?? null;
      if (url) break;
    }
    if (url || !transient) this.sql.exec('INSERT OR REPLACE INTO wiki (src, url, at) VALUES (?, ?, ?)', src, url, Date.now());
    return url;
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
