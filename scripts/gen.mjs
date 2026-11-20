// Auto-registration: every features/<id>/server.ts and content/packs/<id>/pack.json is picked up here.
// Adding a folder is enough — never edit server/_gen by hand. (Client side uses import.meta.glob.)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const gen = path.join(root, 'server/_gen');
fs.mkdirSync(gen, { recursive: true });
const dirs = d => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).filter(e => e.isDirectory() && !e.name.startsWith('_')).map(e => e.name).sort() : []);

const features = dirs(path.join(root, 'features')).filter(id => fs.existsSync(path.join(root, 'features', id, 'server.ts')));
fs.writeFileSync(path.join(gen, 'features.ts'),
  features.map((id, i) => `import f${i} from '../../features/${id}/server';`).join('\n') +
  `\nimport type { ServerFeature } from '../feature';\nexport const FEATURES: ServerFeature[] = [${features.map((_, i) => `f${i}`).join(', ')}];\n`);

const BIG = 1_000_000; // bigger pack.json files are served as static data instead of being bundled (Worker size limit)
const packs = dirs(path.join(root, 'content/packs')).filter(id => fs.existsSync(path.join(root, 'content/packs', id, 'pack.json')) && fs.statSync(path.join(root, 'content/packs', id, 'pack.json')).size <= BIG);
const bigPacks = dirs(path.join(root, 'content/packs')).filter(id => fs.existsSync(path.join(root, 'content/packs', id, 'pack.json')) && !packs.includes(id)).map(id => path.join(id, 'pack.json'));
fs.writeFileSync(path.join(gen, 'packs.ts'),
  packs.map((id, i) => `import p${i} from '../../content/packs/${id}/pack.json';`).join('\n') +
  `\nexport const RAW_PACKS: any[] = [${packs.map((_, i) => `p${i}`).join(', ')}];\n`);

for (const id of packs) {
  const src = path.join(root, 'content/packs', id, 'media');
  if (fs.existsSync(src)) fs.cpSync(src, path.join(root, 'client/public/packs', id), { recursive: true });
}
// harvested Wikidata/Fandom content (scripts/harvest.ts): files served as static /data/<id>.json, small index bundled
const hv = path.join(root, 'content/harvest'), hvOut = path.join(root, 'client/public/data');
const hIndex = fs.existsSync(path.join(hv, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(hv, 'index.json'), 'utf8')) : [];
fs.mkdirSync(hvOut, { recursive: true });
if (fs.existsSync(hv)) for (const f of fs.readdirSync(hv)) if (f.endsWith('.json')) fs.copyFileSync(path.join(hv, f), path.join(hvOut, f));
const bg = {};
for (const id of packs) {
  const p = JSON.parse(fs.readFileSync(path.join(root, 'content/packs', id, 'pack.json'), 'utf8')), m = new Map();
  for (const q of p.questions) { const g = q.group ?? (p.groupBy === 'answer' ? q.answer : p.name); m.set(g, (m.get(g) ?? 0) + 1); }
  bg[id] = [...m].sort((a, b) => b[1] - a[1]).map(([g, n]) => ({ g, n }));
}
// Single-file packs: any content/packs/<name>.json (easy to upload from a phone, no folder needed).
// Served as static /data/<id>.json (not bundled → no Worker size limit), listed with the built-in categories.
for (const f of [...(fs.existsSync(path.join(root, 'content/packs')) ? fs.readdirSync(path.join(root, 'content/packs')) : []), ...bigPacks]) {
  if (!f.endsWith('.json')) continue;
  let p; try { p = JSON.parse(fs.readFileSync(path.join(root, 'content/packs', f), 'utf8')); } catch (e) { console.warn(`gen: ${f} is not valid JSON, skipped`); continue; }
  if (p.format !== 'hella-pack' || !Array.isArray(p.questions) || !/^[a-z0-9-]{1,60}$/.test(p.id ?? '')) { console.warn(`gen: ${f} is not a hella-pack, skipped`); continue; }
  fs.writeFileSync(path.join(hvOut, `${p.id}.json`), JSON.stringify(p));
  const m = new Map(); for (const q of p.questions) { const g = q.group ?? p.name; m.set(g, (m.get(g) ?? 0) + 1); }
  bg[p.id] = [...m].sort((a, b) => b[1] - a[1]).map(([g, n]) => ({ g, n }));
  hIndex.push({ id: p.id, name: p.name, emoji: p.emoji, count: p.questions.length, tags: p.tags ?? [], base: true });
  console.log(`gen: single-file pack ${f} → ${p.id} (${p.questions.length} questions)`);
}
fs.writeFileSync(path.join(hvOut, 'builtin-groups.json'), JSON.stringify(bg));
fs.writeFileSync(path.join(gen, 'harvest.ts'), `export const HARVEST: { id: string; name: string; emoji?: string; count: number; into?: string; tags: string[]; base?: boolean }[] = ${JSON.stringify(hIndex.map(({ groups, ...p }) => p))};\n`);
fs.writeFileSync(path.join(gen, 'version.ts'), `export const VERSION = ${JSON.stringify({ commit: (process.env.WORKERS_CI_COMMIT_SHA ?? 'local').slice(0, 7), built: new Date().toISOString() })};\n`);
console.log(`gen: ${features.length} features [${features}], ${packs.length} packs [${packs}]`);
