import type { PublicState, SettingDef } from '../../shared/protocol';
import { CLIENT_FEATURES } from '../feature';
import { DEBUG, send, store } from '../store';
import { play } from '../sfx';

const GROUPS: Record<string, string> = { '': 'Partie', scoring: 'Score', goal: 'Victoire', bots: 'Debug : bots' };

export function Lobby({ s }: { s: PublicState }) {
  const isLeader = s.players.find(p => p.id === s.me)?.leader;
  const defs = store.defs.filter(d => !d.dev || DEBUG);
  const groups = [...new Set(defs.map(d => d.feature ?? ''))];
  const set = (key: string, v: any) => { play('select', 0.5); send({ t: 'settings', patch: { [key]: v } }); };
  const link = `${location.origin}/${s.code}`;

  return (
    <div class="lobby">
      <div class="lobby-head">
        <h2>Salle <span class="code">{s.code}</span></h2>
        <button class="btn ghost" onClick={() => navigator.clipboard?.writeText(link)}>📋 Copier le lien</button>
      </div>
      <div class="settings">
        {groups.map(g => (
          <fieldset key={g} disabled={!isLeader}>
            <legend>{GROUPS[g] ?? g}</legend>
            {defs.filter(d => (d.feature ?? '') === g).map(d => <Setting key={d.key} d={d} v={s.settings[d.key]} set={set} />)}
          </fieldset>
        ))}
      </div>
      {CLIENT_FEATURES.map(f => f.Lobby && <f.Lobby key={f.id} s={s} />)}
      {isLeader
        ? <button class="btn big" onClick={() => { play('start'); send({ t: 'start' }); }}>C'est parti !</button>
        : <p class="muted">En attente du chef de salle…</p>}
    </div>
  );
}

function Setting({ d, v, set }: { d: SettingDef; v: any; set: (k: string, v: any) => void }) {
  if (d.type === 'packs') {
    const chip = (p: (typeof store.packs)[number]) => {
      const on = (v ?? []).includes(p.id);
      return (
        <label key={p.id} class={`pack ${on ? 'on' : ''}`} title={[p.author && `par ${p.author}`, p.tags?.join(', ')].filter(Boolean).join(' · ')}>
          <input type="checkbox" checked={on} onChange={() => set(d.key, on ? v.filter((x: string) => x !== p.id) : [...(v ?? []), p.id])} />
          {p.emoji} {p.name} <small>{p.count}</small>
        </label>
      );
    };
    const mine = store.packs.filter(p => p.custom);
    return (
      <div class="packs-block">
        <div class="packs">{store.packs.filter(p => !p.custom).map(chip)}</div>
        <div class="packs-sub">
          <b>Packs du Studio</b>
          <button type="button" class="btn ghost small" onClick={() => send({ t: 'packs' })} title="Actualiser">🔄</button>
          <a class="btn ghost small" href="/studio" target="_blank">🎨 Créer</a>
        </div>
        <div class="packs">{mine.length ? mine.map(chip) : <small class="muted">Publie un pack depuis le Studio pour le voir ici.</small>}</div>
      </div>
    );
  }
  return (
    <label class="setting">
      <span>{d.label}</span>
      {d.type === 'bool' && <input type="checkbox" checked={!!v} onChange={e => set(d.key, (e.target as HTMLInputElement).checked)} />}
      {d.type === 'number' && <input type="number" value={v} min={d.min} max={d.max} step={d.step ?? 1} onChange={e => set(d.key, +(e.target as HTMLInputElement).value)} />}
      {d.type === 'select' && (
        <select value={v} onChange={e => set(d.key, (e.target as HTMLSelectElement).value)}>
          {d.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </label>
  );
}
