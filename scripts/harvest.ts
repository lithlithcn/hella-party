// Offline harvester (runs in GitHub Actions: Wikidata/Fandom are reachable there, not at play time).
// Writes content/harvest/<id>.json (pack files with `group` on every question) + index.json.
// Nothing is fetched from wikis while playing; to change what is harvested, edit server/autopacks.ts (AUTO, DOMAINS, INTO).
//   npx tsx scripts/harvest.ts            (all)      ONLY=auto-chiens,u-jeux npx tsx scripts/harvest.ts
import fs from 'node:fs';
import path from 'node:path';
import { AUTO, BUILTIN_GROUPS, DOMAINS, INTO, buildAuto, buildDomain, domainFandoms, fandomChars, groupLabels } from '../server/autopacks';

const out = path.resolve(import.meta.dirname, '../content/harvest');
fs.mkdirSync(out, { recursive: true });
const only = process.env.ONLY ? process.env.ONLY.split(',') : undefined;
const FANDOM_PER_DOMAIN = +(process.env.FANDOM ?? 1e9); // every work that has a Fandom wiki
// no request may hang the run (a stuck Wikidata/Fandom connection blocked a whole run for hours): 90 s max each
const fetch0 = globalThis.fetch;
globalThis.fetch = ((u: any, o: any = {}) => fetch0(u, { signal: AbortSignal.timeout(90_000), ...o })) as typeof fetch;
const t0 = Date.now(), log = console.log;
console.log = (...a: any[]) => log(`[${Math.round((Date.now() - t0) / 1000)}s]`, ...a);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function save(id: string, p: any) { fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(p)); console.log(`✔ ${id}: ${p.questions.length}`); }

for (const d of AUTO) {
  if (only && !only.includes(d.id)) continue;
  console.log(`… ${d.id}`);
  const p = await buildAuto(d).catch(e => (console.error(d.id, e), null));
  // sub-category = country / origin / maker / artist when Wikidata has it, else the source name; tiny groups folded
  if (p) {
    const n = new Map<string, number>(); for (const q of p.questions as any[]) if (q.group) n.set(q.group, (n.get(q.group) ?? 0) + 1);
    save(d.id, { ...p, questions: p.questions.map((q: any) => ({ ...q, group: q.group && (n.get(q.group) ?? 0) >= 3 ? q.group : d.name })) });
  } else console.warn(`✘ ${d.id}`);
  await sleep(1500); // be gentle with Wikidata
}

for (const dom of Object.keys(DOMAINS)) {
  const id = `u-${dom}`; if (only && !only.includes(id)) continue;
  console.log(`… ${id}`);
  const works = await buildDomain(dom).catch(e => (console.error(id, e), null));
  if (!works) { console.warn(`✘ ${id}`); continue; }
  const byId = new Map(works.map(w => [w.id, w]));
  // every work with its own Fandom wiki (Wikidata P4073): add that wiki's characters
  const fw = ((await domainFandoms(dom).catch(() => null)) ?? []).sort((a, b) => b.pop - a.pop).slice(0, FANDOM_PER_DOMAIN);
  for (let i = 0; i < fw.length; i += 6) {
    await Promise.all(fw.slice(i, i + 6).map(async f => {
      const qs = await fandomChars(f.wiki, f.name, DOMAINS[dom].name).catch(() => []);
      if (!qs.length) return;
      let w = byId.get(f.id); if (!w) byId.set(f.id, w = { id: f.id, name: f.name, pop: f.pop, questions: [] });
      const have = new Set(w.questions.map(q => norm(q.answer)));
      w.questions.push(...qs.filter(q => !have.has(norm(q.answer))));
    }));
  }
  const D = DOMAINS[dom];
  // never shrink a domain by a lot because Wikidata had a bad day: keep the previous file
  const old = path.join(out, `${id}.json`), was = fs.existsSync(old) ? JSON.parse(fs.readFileSync(old, 'utf8')).questions.length : 0;
  const now = [...byId.values()].reduce((n, w) => n + w.questions.length, 0);
  if (now < was * 0.8) { console.warn(`✘ ${id}: ${now} < 80% of ${was}, kept the old file`); continue; }
  for (const w of byId.values()) if (w.questions.length < 3) w.name = `Autres (${D.name.toLowerCase()})`; // no 1-2 item sub-categories
  save(id, { format: 'hella-pack', version: 1, id, name: D.name, emoji: D.emoji, prompt: D.prompt, nameKind: D.kind, author: 'Wikidata + Fandom',
    questions: [...byId.values()].flatMap(w => w.questions.map(q => ({ ...q, id: `${w.id}-${q.id}`, group: w.name }))) });
}

// sub-categories for the hand-made built-in packs (one Wikidata property each, see BUILTIN_GROUPS)
// ONLY=builtin-groups (all) or bg:<pack>,bg:<pack> (some); merged into the existing map, saved after each pack
const bg = Object.keys(BUILTIN_GROUPS).filter(pid => !only || only.includes('builtin-groups') || only.includes('bg:' + pid));
if (bg.length) {
  const mapFile = path.join(out, 'builtin-groups-map.json');
  const map: Record<string, Record<string, string>> = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
  for (const pid of bg) { const snippet = BUILTIN_GROUPS[pid];
    const f = path.resolve(import.meta.dirname, `../content/packs/${pid}/pack.json`); if (!fs.existsSync(f)) continue;
    const p = JSON.parse(fs.readFileSync(f, 'utf8'));
    const title = (q: any) => q.src?.startsWith('wiki:') ? (/^wiki:[a-z]{2,3}:/.test(q.src) ? q.src.slice(5) : 'fr:' + q.src.slice(5)) : 'fr:' + q.answer;
    console.log(`… groups ${pid} (${p.questions.length})`);
    const labels = await groupLabels([...new Set(p.questions.map(title))] as string[], snippet).catch(() => new Map());
    const m: Record<string, string> = {}, n = new Map<string, number>();
    for (const q of p.questions) { const g = labels.get(title(q).replace(/_/g, ' ')); if (g) { m[q.id] = g[0].toUpperCase() + g.slice(1); n.set(m[q.id], (n.get(m[q.id]) ?? 0) + 1); } }
    for (const [id, g] of Object.entries(m)) if ((n.get(g) ?? 0) < 3) m[id] = 'Autres'; // no tiny sub-categories
    map[pid] = m; console.log(`✔ groups ${pid}: ${Object.keys(m).length}/${p.questions.length} in ${new Set(Object.values(m)).size} groups`);
    if (Object.keys(m).length) fs.writeFileSync(mapFile, JSON.stringify(map)); else console.warn(`✘ groups ${pid}: 0 (snippet?)`);
  }
}

// index: what the lobby shows (counts, merge target, sub-categories)
const index = fs.readdirSync(out).filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'builtin-groups-map.json').map(f => {
  const p = JSON.parse(fs.readFileSync(path.join(out, f), 'utf8')), id = f.slice(0, -5);
  const g = new Map<string, number>(); for (const q of p.questions) g.set(q.group, (g.get(q.group) ?? 0) + 1);
  return { id, name: p.name, emoji: p.emoji, count: p.questions.length, into: INTO[id], tags: p.tags ?? [], groups: [...g].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ g: name, n })) };
});
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index));
console.log(`index: ${index.length} packs, ${index.reduce((n, p) => n + p.count, 0)} questions`);
