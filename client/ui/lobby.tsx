import { useState } from 'preact/hooks';
import type { PublicState, SettingDef } from '../../shared/protocol';
import { CLIENT_FEATURES } from '../feature';
import { DEBUG, send, store } from '../store';
import { play } from '../sfx';

const GROUPS: Record<string, string> = { '': 'Partie', scoring: 'Score', goal: 'Victoire', chain: 'Enchaînement bonus', bots: 'Debug : bots' };

export function Lobby({ s }: { s: PublicState }) {
  const isLeader = s.players.find(p => p.id === s.me)?.leader;
  const defs = store.defs.filter(d => !d.dev || DEBUG);
  const packDef = defs.find(d => d.type === 'packs');
  const groups = [...new Set(defs.filter(d => d.type !== 'packs').map(d => d.feature ?? ''))];
  const set = (key: string, v: any) => { play('select', 0.5); send({ t: 'settings', patch: { [key]: v } }); };
  const link = `${location.origin}/${s.code}`;

  return (
    <div class="lobby">
      <div class="lobby-head">
        <h2>Salle <span class="code">{s.code}</span></h2>
        <button class="btn ghost" onClick={() => navigator.clipboard?.writeText(link)}>📋 Copier le lien</button>
      </div>
      {packDef && <fieldset class="packs-field" disabled={!isLeader}><legend>Packs</legend><Setting d={packDef} v={s.settings[packDef.key]} set={set} /></fieldset>}
      <div class="settings">
        {groups.map(g => (
          <fieldset key={g} disabled={!isLeader}>
            <legend>{GROUPS[g] ?? g}</legend>
            {defs.filter(d => (d.feature ?? '') === g && d.type !== 'packs').map(d => <Setting key={d.key} d={d} v={s.settings[d.key]} set={set} />)}
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
  const [openId, setOpenId] = useState<string | null>(null);
  if (d.type === 'packs') {
    const chip = (p: (typeof store.packs)[number]) => {
      const on = (v ?? []).includes(p.id);
      const merged = store.packs.filter(x => x.into === p.id);
      const count = p.count + merged.reduce((n, x) => n + x.count, 0);
      const off = (v ?? []).filter((x: string) => x.startsWith(`-g:${p.id}:`)).length;
      return (
        <span key={p.id} class={`pack ${on ? 'on' : ''} ${openId === p.id ? 'open' : ''}`} title={[p.author && `par ${p.author}`, p.tags?.join(', ')].filter(Boolean).join(' · ')}>
          <input type="checkbox" checked={on} onChange={() => set(d.key, on ? v.filter((x: string) => x !== p.id) : [...(v ?? []), p.id])} />
          <button type="button" class="pack-open" onClick={() => { const o = openId === p.id ? null : p.id; setOpenId(o); if (o && !store.groups[o]) send({ t: 'groups', id: o }); }}>
            {p.emoji} {p.name} <small>{count}{off ? ` · −${off}` : ''}</small> <i>{openId === p.id ? '▾' : '▸'}</i>
          </button>
        </span>
      );
    };
    const panel = (list: (typeof store.packs)) => openId && list.some(p => p.id === openId) && <Groups id={openId} v={v ?? []} set={x => set(d.key, x)} />;
    const mine = store.packs.filter(p => p.custom);
    return (
      <div class="packs-block">
        <div class="packs-sub">
          <button type="button" class="btn ghost small" onClick={() => set(d.key, store.packs.filter(p => !p.custom && !p.univ && p.id !== 'flags').map(p => p.id))}>Tout cocher</button>
          <button type="button" class="btn ghost small" onClick={() => set(d.key, [])}>Tout décocher</button>
          <small class="muted">{(v ?? []).length} packs · {store.packs.filter(p => (v ?? []).includes(p.id)).reduce((n, p) => n + p.count, 0)} questions</small>
        </div>
        {(() => { const L = store.packs.filter(p => !p.custom && !p.auto && !p.univ && !p.into); return <><div class="packs">{L.map(chip)}</div>{panel(L)}</>; })()}
        <div class="packs-sub"><b>🌍 Nouvelles catégories</b> <small class="muted">générées depuis Wikipédia + Fandom · 0 = pas encore chargé</small></div>
        {(() => { const L = store.packs.filter(p => (p.auto || p.univ || p.id.startsWith('fw-')) && !p.into); return <><div class="packs">{L.map(chip)}</div>{panel(L)}</>; })()}
        <div class="packs-sub">
          <b>Packs du Studio</b>
          <button type="button" class="btn ghost small" onClick={() => send({ t: 'packs' })} title="Actualiser">🔄</button>
          <a class="btn ghost small" href="/studio" target="_blank">🎨 Créer</a>
        </div>
        <div class="packs">{mine.length ? mine.map(chip) : <small class="muted">Publie un pack depuis le Studio pour le voir ici.</small>}</div>
        {panel(mine)}
      </div>
    );
  }
  return (
    <label class="setting">
      <span>{d.label}</span>
      {d.type === 'bool' && <input type="checkbox" checked={!!v} onChange={e => set(d.key, (e.target as HTMLInputElement).checked)} />}
      {d.type === 'number' && <input type="number" value={v} min={d.min} max={d.max} step={d.step ?? 1} onChange={e => set(d.key, +(e.target as HTMLInputElement).value)} />}
      {d.type === 'select' && (
        <select value={v} onChange={e => { const raw = (e.target as HTMLSelectElement).value; set(d.key, d.options?.find(o => String(o.value) === raw)?.value ?? raw); }}>
          {d.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </label>
  );
}

/** Sub-categories of a category (works, sources…): all shown, tick / untick each ("-g:<cat>:<group>" = unticked). */
function Groups({ id, v, set }: { id: string; v: string[]; set: (v: string[]) => void }) {
  const [q, setQ] = useState(''), [lim, setLim] = useState(200);
  const list = store.groups[id], on = v.includes(id);
  const key = (g: string) => `-g:${id}:${g}`;
  const isOn = (g: string) => on && !v.includes(key(g));
  const toggle = (g: string) => {
    if (!on) return set([...v.filter(x => !x.startsWith(`-g:${id}:`)), id, ...(list ?? []).filter(x => x.g !== g).map(x => key(x.g))]); // only this one
    set(v.includes(key(g)) ? v.filter(x => x !== key(g)) : [...v, key(g)]);
  };
  const all = (yes: boolean) => set([...v.filter(x => !x.startsWith(`-g:${id}:`) && x !== id), ...(yes ? [id] : [])]);
  const shown = (list ?? []).filter(x => !q || x.g.toLowerCase().includes(q.toLowerCase()));
  return (
    <div class="groups">
      <div class="packs-sub">
        <input class="univ-q" placeholder="Chercher (ex : Naruto, Touhou, Umineko…)" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} />
        <button type="button" class="btn ghost small" onClick={() => all(true)}>Tout</button>
        <button type="button" class="btn ghost small" onClick={() => all(false)}>Rien</button>
        <small class="muted">{list ? `${list.length} sous-catégories` : 'Chargement… (la 1ʳᵉ fois peut prendre ~30 s)'}</small>
      </div>
      <div class="univ-list">
        {shown.slice(0, lim).map(x => (
          <label key={x.g} class={`pack ${isOn(x.g) ? 'on' : ''}`}><input type="checkbox" checked={isOn(x.g)} onChange={() => toggle(x.g)} /> {x.g} <small>{x.n}</small></label>
        ))}
        {shown.length > lim && <button type="button" class="btn ghost small" onClick={() => setLim(lim + 400)}>+ {shown.length - lim} autres</button>}
      </div>
    </div>
  );
}
