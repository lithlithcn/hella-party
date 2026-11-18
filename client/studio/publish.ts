// Publish a Studio pack to the online library (server/library.ts) so it can be picked in any room's settings.
// Media are uploaded once, content-addressed (sha-256): identical files are never stored twice.
import type { PackFile } from '../../shared/pack';
import { db } from '../db';
import { fileKey, packFiles, slug } from './model';
import { usedFiles } from './zip';

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

export function publishedId(p: PackFile) { return slug(p.name); }

function keyFor(id: string) {
  let k = localStorage.getItem(`hp.pubkey.${id}`);
  if (!k) { k = crypto.randomUUID(); localStorage.setItem(`hp.pubkey.${id}`, k); }
  return k;
}

export async function publish(p: PackFile, progress: (msg: string) => void): Promise<string> {
  const id = publishedId(p);
  const files = usedFiles(p, await packFiles(p));
  const media: Record<string, string> = {};
  let i = 0;
  for (const f of files) {
    progress(`Envoi des fichiers ${++i}/${files.length}…`);
    const blob: Blob | undefined = await db.get('files', fileKey(p.id, f));
    if (!blob) continue;
    const buf = await blob.arrayBuffer();
    const hash = hex(await crypto.subtle.digest('SHA-256', buf));
    const url = `/api/media/${hash}${f.match(/\.\w+$/)?.[0]?.toLowerCase() ?? ''}`;
    if ((await fetch(url, { method: 'HEAD' })).status !== 200) {
      const r = await (await fetch(url, { method: 'PUT', body: buf, headers: { 'content-type': blob.type || 'application/octet-stream' } })).json<any>();
      if (!r.ok) throw new Error(`${f} : ${r.error}`);
    }
    media[f] = url;
  }
  progress('Publication…');
  const r = await (await fetch(`/api/packs/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pack: { ...p, id, media }, key: keyFor(id) }) })).json<any>();
  if (!r.ok) throw new Error(r.error ?? 'erreur');
  localStorage.setItem(`hp.published.${p.id}`, String(Date.now()));
  return id;
}

export async function unpublish(p: PackFile) {
  const id = publishedId(p);
  await fetch(`/api/packs/${id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: keyFor(id) }) });
  localStorage.removeItem(`hp.published.${p.id}`);
}

export async function packSize(p: PackFile) {
  let n = 0;
  for (const f of usedFiles(p, await packFiles(p))) n += ((await db.get('files', fileKey(p.id, f))) as Blob | undefined)?.size ?? 0;
  return n;
}
