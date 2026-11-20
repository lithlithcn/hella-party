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
fs.rmSync(hvOut, { recursive: true, force: true }); fs.mkdirSync(hvOut, { recursive: true }); // no stale files
// Each pack is split by difficulty (<id>.d1/.d2/.d3.json): a room loads only the levels it plays, then samples.
// Loading whole packs (47 MB of JSON) blew the Durable Object's 128 MB memory → room reset = everyone kicked.
const writeSplit = (id, p) => { for (const d of [1, 2, 3]) fs.writeFileSync(path.join(hvOut, `${id}.d${d}.json`), JSON.stringify({ ...p, questions: p.questions.filter(q => (q.difficulty || 1) === d) })); };
if (fs.existsSync(hv)) for (const f of fs.readdirSync(hv)) if (f.endsWith('.json') && !/-map\.json$/.test(f)) {
  if (f === 'index.json') fs.copyFileSync(path.join(hv, f), path.join(hvOut, f)); else writeSplit(f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(hv, f), 'utf8')));
}
// sub-categories of built-in packs computed by the harvest (content/harvest/builtin-groups-map.json)
const gmapFile = path.join(root, 'content/harvest/builtin-groups-map.json');
const gmap = fs.existsSync(gmapFile) ? JSON.parse(fs.readFileSync(gmapFile, 'utf8')) : {};
fs.writeFileSync(path.join(gen, 'groupmap.ts'), `export const GROUP_MAP: Record<string, Record<string, string>> = ${JSON.stringify(gmap)};\n`);
// Difficulty from French notoriety (content/harvest/views-map.json = fr.wikipedia views over 12 months, scripts/harvest.ts).
// Owner: « facile » = things EVERYBODY knows, « moyen » ≈ half of people, « difficile » = hard.
//  - people packs: absolute thresholds;  - other packs: a « facile » far less viewed than the pack's other « facile » → moyen.
const vmFile = path.join(hv, 'views-map.json'), vmap = fs.existsSync(vmFile) ? JSON.parse(fs.readFileSync(vmFile, 'utf8')) : {};
const PEOPLE = { facile: 700_000, moyen: 150_000 };
function viewsDifficulty(p) {
  const v = vmap[p.id]; if (!v) return {};
  const out = {};
  if (p.aliasFrom === 'answer' && /célébr|francophon|personnal/i.test(`${p.name} ${(p.tags ?? []).join(' ')}`)) {
    for (const q of p.questions) { const n = v[q.id] ?? 0; out[q.id] = n >= PEOPLE.facile ? 1 : n >= PEOPLE.moyen ? 2 : 3; }
  } else {
    const easy = p.questions.filter(q => (q.difficulty || 1) === 1 && v[q.id] > 0).map(q => v[q.id]).sort((a, b) => a - b);
    const med = easy[easy.length >> 1] ?? 0;
    for (const q of p.questions) if ((q.difficulty || 1) === 1 && v[q.id] !== undefined && v[q.id] < med * 0.25) out[q.id] = 2;
  }
  return out;
}
const dmap = {};
for (const id of packs) { const p = JSON.parse(fs.readFileSync(path.join(root, 'content/packs', id, 'pack.json'), 'utf8')); const d = viewsDifficulty(p); if (Object.keys(d).length) dmap[p.id] = d; }
fs.writeFileSync(path.join(gen, 'diffmap.ts'), `export const DIFF_MAP: Record<string, Record<string, number>> = ${JSON.stringify(dmap)};\n`);
const bg = {};
for (const id of packs) {
  const p = JSON.parse(fs.readFileSync(path.join(root, 'content/packs', id, 'pack.json'), 'utf8')), m = new Map();
  for (const q of p.questions) { const g = q.group ?? gmap[id]?.[q.id] ?? (p.groupBy === 'answer' ? q.answer : gmap[id] ? 'Autres' : p.name); m.set(g, (m.get(g) ?? 0) + 1); }
  bg[id] = [...m].sort((a, b) => b[1] - a[1]).map(([g, n]) => ({ g, n }));
}
// Single-file packs: any content/packs/<name>.json (easy to upload from a phone, no folder needed).
// Served as static /data/<id>.json (not bundled → no Worker size limit), listed with the built-in categories.
for (const f of [...(fs.existsSync(path.join(root, 'content/packs')) ? fs.readdirSync(path.join(root, 'content/packs')) : []), ...bigPacks]) {
  if (!f.endsWith('.json')) continue;
  let p; try { p = JSON.parse(fs.readFileSync(path.join(root, 'content/packs', f), 'utf8')); } catch (e) { console.warn(`gen: ${f} is not valid JSON, skipped`); continue; }
  if (p.format !== 'hella-pack' || !Array.isArray(p.questions) || !/^[a-z0-9-]{1,60}$/.test(p.id ?? '')) { console.warn(`gen: ${f} is not a hella-pack, skipped`); continue; }
  const dv = viewsDifficulty(p); if (Object.keys(dv).length) p.questions = p.questions.map(q => (dv[q.id] ? { ...q, difficulty: dv[q.id] } : q));
  writeSplit(p.id, p);
  const m = new Map(); for (const q of p.questions) { const g = q.group ?? p.name; m.set(g, (m.get(g) ?? 0) + 1); }
  bg[p.id] = [...m].sort((a, b) => b[1] - a[1]).map(([g, n]) => ({ g, n }));
  hIndex.push({ id: p.id, name: p.name, emoji: p.emoji, count: p.questions.length, tags: p.tags ?? [], base: true });
  console.log(`gen: single-file pack ${f} → ${p.id} (${p.questions.length} questions)`);
}
fs.writeFileSync(path.join(hvOut, 'builtin-groups.json'), JSON.stringify(bg));
fs.writeFileSync(path.join(gen, 'harvest.ts'), `export const HARVEST: { id: string; name: string; emoji?: string; count: number; into?: string; tags: string[]; base?: boolean }[] = ${JSON.stringify(hIndex.map(({ groups, ...p }) => p))};\n`);
fs.writeFileSync(path.join(gen, 'version.ts'), `export const VERSION = ${JSON.stringify({ commit: (process.env.WORKERS_CI_COMMIT_SHA ?? 'local').slice(0, 7), built: new Date().toISOString() })};\n`);
console.log(`gen: ${features.length} features [${features}], ${packs.length} packs [${packs}]`);
