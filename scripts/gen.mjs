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

const packs = dirs(path.join(root, 'content/packs')).filter(id => fs.existsSync(path.join(root, 'content/packs', id, 'pack.json')));
fs.writeFileSync(path.join(gen, 'packs.ts'),
  packs.map((id, i) => `import p${i} from '../../content/packs/${id}/pack.json';`).join('\n') +
  `\nexport const RAW_PACKS: any[] = [${packs.map((_, i) => `p${i}`).join(', ')}];\n`);

for (const id of packs) {
  const src = path.join(root, 'content/packs', id, 'media');
  if (fs.existsSync(src)) fs.cpSync(src, path.join(root, 'client/public/packs', id), { recursive: true });
}
console.log(`gen: ${features.length} features [${features}], ${packs.length} packs [${packs}]`);
