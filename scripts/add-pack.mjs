// Adds Studio exports to the repo.  node scripts/add-pack.mjs <file.zip> [...]
// - "<id>/pack.json" + "<id>/media/*"  → content/packs/<id>/   (replaces an existing pack with the same id)
// - "sounds/<event>.<ext>"             → client/public/sfx/<event>.mp3 (converted with ffmpeg when available)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';

const root = path.resolve(import.meta.dirname, '..');
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

for (const zip of process.argv.slice(2)) {
  const entries = unzipSync(fs.readFileSync(zip));
  for (const key of Object.keys(entries).filter(k => k.endsWith('pack.json'))) {
    const base = key.slice(0, -'pack.json'.length);
    const pack = JSON.parse(strFromU8(entries[key]));
    if (pack.format !== 'hella-pack' || !/^[a-z0-9-]+$/.test(pack.id)) { console.warn(`skip ${key}: not a hella pack`); continue; }
    const dir = path.join(root, 'content/packs', pack.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify(pack, null, 1));
    let n = 0, bytes = 0;
    for (const [k, data] of Object.entries(entries)) {
      if (!k.startsWith(`${base}media/`) || k.endsWith('/')) continue;
      const name = path.basename(k);
      fs.writeFileSync(path.join(dir, 'media', name), data); n++; bytes += data.length;
    }
    const missing = pack.questions.filter(q => q.src && !/^(https?:|\/|wiki:)/.test(q.src) && !fs.existsSync(path.join(dir, 'media', q.src))).map(q => q.src);
    console.log(`pack ${pack.id}: ${pack.questions.length} questions, ${n} files (${(bytes / 1e6).toFixed(1)} MB)${missing.length ? ` ⚠ missing: ${missing.join(', ')}` : ''}`);
  }
  for (const [k, data] of Object.entries(entries)) {
    const m = k.match(/^sounds\/([A-Za-z0-9_-]+)\.(\w+)$/);
    if (!m) continue;
    const out = path.join(root, 'client/public/sfx', `${m[1]}.mp3`);
    if (m[2] === 'mp3' || !hasFfmpeg) { fs.writeFileSync(m[2] === 'mp3' ? out : out.replace(/mp3$/, m[2]), data); }
    else {
      const tmp = path.join(root, `.tmp-${m[1]}.${m[2]}`);
      fs.writeFileSync(tmp, data);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-ac', '1', '-b:a', '96k', out]);
      fs.rmSync(tmp);
    }
    console.log(`sound ${m[1]} → ${path.relative(root, out)}`);
  }
}
