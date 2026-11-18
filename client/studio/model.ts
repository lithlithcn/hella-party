// Studio data: drafts are PackFile objects saved in IndexedDB; media blobs under files/"pack/<id>/<name>".
import { PACK_FORMAT, PACK_VERSION, type PackFile, type PackQuestion, type QuestionType } from '../../shared/pack';
import { db } from '../db';

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'x';

export const uid = () => Math.random().toString(36).slice(2, 8);

export function newPack(name = 'Mon pack'): PackFile {
  return { format: PACK_FORMAT, version: PACK_VERSION, id: `${slug(name)}-${uid()}`, name, prompt: 'Qu\'est-ce que c\'est ?', emoji: '🎉', color: '#ff3d9a', tags: [], questions: [] };
}

export function newQuestion(answer = '', type: QuestionType = 'image'): PackQuestion {
  return { id: `${slug(answer || 'q')}-${uid()}`, type, answer, exact: [], partial: [], tags: [], opts: {} };
}

/** "the_dark-knight (2008).png" → "The dark knight (2008)" */
export const answerFromFile = (name: string) => {
  const s = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const typeFromFile = (f: File): QuestionType =>
  f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('video/') ? 'video' : 'image';

export const fileKey = (packId: string, name: string) => `pack/${packId}/${name}`;

export const packs = {
  async list(): Promise<PackFile[]> {
    const keys = await db.keys('packs');
    const all = await Promise.all(keys.map(k => db.get<PackFile>('packs', k)));
    return all.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  },
  save: (p: PackFile) => db.set('packs', p.id, JSON.parse(JSON.stringify(p))),
  async remove(id: string) { await db.del('packs', id); await db.delPrefix('files', `pack/${id}/`); },
};

/** Store a media file for a pack, returns the (deduplicated, safe) file name used in pack.json. */
export async function putMedia(p: PackFile, file: Blob, wanted: string, optimize: boolean): Promise<string> {
  let blob = file, name = wanted;
  if (optimize && file.type.startsWith('image/') && file.type !== 'image/gif' && file.type !== 'image/svg+xml') {
    const out = await shrinkImage(file, 1280, 0.85);
    if (out && out.size < file.size) { blob = out; name = name.replace(/\.[^.]+$/, '') + '.webp'; }
  }
  const ext = name.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? '';
  const base = slug(name.replace(/\.[^.]+$/, ''));
  const used = new Set((await db.keys('files')).filter(k => k.startsWith(`pack/${p.id}/`)).map(k => k.slice(`pack/${p.id}/`.length)));
  let final = base + ext, i = 2;
  while (used.has(final)) final = `${base}-${i++}${ext}`;
  await db.set('files', fileKey(p.id, final), blob);
  return final;
}

async function shrinkImage(file: Blob, max: number, quality: number): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await c.convertToBlob({ type: 'image/webp', quality });
  } catch { return null; }
}

/** Blob URLs for a pack's media, cached per session. */
const urls = new Map<string, string>();
export async function mediaUrl(packId: string, name?: string): Promise<string | undefined> {
  if (!name) return undefined;
  if (/^(https?:|\/|blob:|data:|wiki:)/.test(name)) return name;
  const k = fileKey(packId, name);
  if (urls.has(k)) return urls.get(k);
  const b: Blob | undefined = await db.get('files', k);
  if (!b) return undefined;
  const u = URL.createObjectURL(b);
  urls.set(k, u);
  return u;
}
export const mediaUrlSync = (packId: string, name?: string) => (!name ? undefined : /^(https?:|\/|blob:|data:|wiki:)/.test(name) ? name : urls.get(fileKey(packId, name)));

/** Media files referenced by the pack (src + names used in scripts via api.asset/image/sound). */
export async function packFiles(p: PackFile): Promise<string[]> {
  return (await db.keys('files')).filter(k => k.startsWith(`pack/${p.id}/`)).map(k => k.slice(`pack/${p.id}/`.length));
}
