import { useEffect, useState } from 'preact/hooks';
import { db } from '../db';
import { loadOverrides, play, SOUND_EVENTS } from '../sfx';
import { exportSounds } from './zip';
import { Drop } from './widgets';

export function SoundsEditor() {
  const [have, setHave] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState<Record<string, true>>({});
  const refresh = async () => {
    const keys = await db.keys('files');
    setHave(Object.fromEntries(SOUND_EVENTS.map(e => [e.id, keys.includes(`sound/${e.id}`)])));
    setActive((await db.get('kv', 'soundOverrides')) ?? {});
  };
  useEffect(() => { refresh(); }, []);

  const saveActive = async (a: Record<string, true>) => { await db.set('kv', 'soundOverrides', a); setActive(a); await loadOverrides(); };
  const upload = async (id: string, f?: File) => { if (!f) return; await db.set('files', `sound/${id}`, f); await saveActive({ ...active, [id]: true }); refresh(); };
  const remove = async (id: string) => { await db.del('files', `sound/${id}`); const a = { ...active }; delete a[id]; await saveActive(a); refresh(); };
  const preview = async (id: string) => { const b: Blob | undefined = await db.get('files', `sound/${id}`); if (b) new Audio(URL.createObjectURL(b)).play(); };
  const mine = SOUND_EVENTS.filter(e => have[e.id]).map(e => e.id);

  return (
    <div class="card sounds">
      <h2>🔊 Sons du jeu</h2>
      <p class="muted">Remplace n'importe quel son ou ajoute des musiques. Ils sont utilisés tout de suite sur cet appareil. Exporte-les pour qu'ils soient ajoutés au jeu pour tout le monde.</p>
      <div class="sound-list">
        {SOUND_EVENTS.map(e => (
          <div class="sound-row" key={e.id}>
            <span class="sound-name">{e.label}<small> · {e.id}</small></span>
            {!('music' in e) && <button class="btn ghost small" onClick={() => play(e.id)} title="Son actuel">▶ actuel</button>}
            {have[e.id] && <>
              <button class="btn ghost small" onClick={() => preview(e.id)}>▶ le mien</button>
              <label class="check"><input type="checkbox" checked={!!active[e.id]} onChange={ev => { const a = { ...active }; if ((ev.target as HTMLInputElement).checked) a[e.id] = true; else delete a[e.id]; saveActive(a); }} /> utiliser</label>
              <button class="btn ghost small" onClick={() => remove(e.id)}>🗑</button>
            </>}
            <Drop accept="audio/*" onFiles={f => upload(e.id, f[0])}>{have[e.id] ? 'Remplacer' : '+ Mon son'}</Drop>
          </div>
        ))}
      </div>
      <button class="btn" disabled={!mine.length} onClick={() => exportSounds(mine)}>📦 Exporter mes sons ({mine.length})</button>
    </div>
  );
}
