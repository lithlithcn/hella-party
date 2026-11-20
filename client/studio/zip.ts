// Export / import of Studio packs as zip files: "<id>/pack.json" + "<id>/media/*".
// The zip layout is exactly the repo layout of content/packs/<id>/, so adding a pack to the game = unzip it there.
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { PACK_FORMAT, type PackFile } from '../../shared/pack';
import { db } from '../db';
import { fileKey, packFiles, packs, slug } from './model';

const download = (data: Uint8Array, name: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/zip" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

/** Only keep files that the pack actually uses (src, sounds, or names mentioned in scripts/data). */
export function usedFiles(p: PackFile, all: string[]) {
  const text = JSON.stringify(p.questions.map(q => [q.script, q.data, q.text]));
  return all.filter(f => p.questions.some(q => q.src === f) || Object.values(p.sounds ?? {}).includes(f) || text.includes(f));
}

export async function exportPacks(list: PackFile[]) {
  const z: Zippable = {};
  for (const p of list) {
    const files = usedFiles(p, await packFiles(p));
    const id = slug(p.name); // repo folder = readable name; same name = same pack (updates replace it)
    const dir: Zippable = { 'pack.json': strToU8(JSON.stringify({ ...p, id }, null, 1)) };
    const media: Zippable = {};
    for (const f of files) {
      const b: Blob | undefined = await db.get('files', fileKey(p.id, f));
      if (b) media[f] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }]; // media already compressed
    }
    if (Object.keys(media).length) dir.media = media;
    z[id] = dir;
  }
  download(zipSync(z, { level: 6 }), list.length === 1 ? `${slug(list[0].name)}.hellapack.zip` : `hella-packs-${list.length}.zip`);
}

/** Accepts zips made by exportPacks (one or many packs). Returns imported pack names. */
export async function importZip(file: File): Promise<string[]> {
  if (file.name.toLowerCase().endsWith('.json')) { // a bare pack.json (e.g. written by another AI, media = URLs / wiki:)
    const p = JSON.parse(await file.text()) as PackFile;
    if (p.format !== PACK_FORMAT || !Array.isArray(p.questions)) throw new Error('pack.json invalide (format "hella-pack" attendu)');
    await packs.remove(p.id); await packs.save(p); return [p.name];
  }
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  const names: string[] = [];
  for (const path of Object.keys(entries).filter(k => k.endsWith('pack.json'))) {
    const root = path.slice(0, -'pack.json'.length);
    const p = JSON.parse(strFromU8(entries[path])) as PackFile;
    if (p.format !== PACK_FORMAT || !Array.isArray(p.questions)) continue;
    await packs.remove(p.id);
    for (const [k, data] of Object.entries(entries)) {
      if (k.startsWith(`${root}media/`) && !k.endsWith('/')) await db.set('files', fileKey(p.id, k.slice(root.length + 6)), new Blob([data as BlobPart]));
    }
    await packs.save(p);
    names.push(p.name);
  }
  return names;
}

export async function exportSounds(ids: string[]) {
  const z: Zippable = {};
  for (const id of ids) {
    const b: Blob | undefined = await db.get('files', `sound/${id}`);
    if (b) z[`${id}.${(b.type.split('/')[1] || 'mp3').replace('mpeg', 'mp3').replace(/;.*/, '')}`] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }];
  }
  download(zipSync({ sounds: z }), 'hella-sounds.zip');
}
