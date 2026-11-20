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
        <div class="packs-sub">
          <button type="button" class="btn ghost small" onClick={() => set(d.key, store.packs.filter(p => !p.custom && !p.univ && p.id !== 'flags').map(p => p.id))}>Tout cocher</button>
          <button type="button" class="btn ghost small" onClick={() => set(d.key, [])}>Tout décocher</button>
          <small class="muted">{(v ?? []).length} packs · {store.packs.filter(p => (v ?? []).includes(p.id)).reduce((n, p) => n + p.count, 0)} questions</small>
        </div>
        <div class="packs">{store.packs.filter(p => !p.custom && !p.auto && !p.univ).map(chip)}</div>
        <div class="packs-sub"><b>🌐 Packs auto (Wikipedia / Fandom)</b> <small class="muted">générés et mis à jour tout seuls · difficulté selon la popularité · 0 = pas encore chargé</small></div>
        <div class="packs">{store.packs.filter(p => p.auto || p.id.startsWith('fw-')).map(chip)}</div>
        <div class="packs-sub"><b>🌍 Univers : tous les persos de Wikipédia</b> <small class="muted">coche un univers entier puis décoche les œuvres que tu ne veux pas, ou coche seulement certaines œuvres</small></div>
        {store.packs.filter(p => p.univ).map(p => <Univ key={p.id} p={p} v={v ?? []} set={x => set(d.key, x)} />)}
        <FandomAdd v={v ?? []} set={x => set(d.key, x)} />
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
        <select value={v} onChange={e => { const raw = (e.target as HTMLSelectElement).value; set(d.key, d.options?.find(o => String(o.value) === raw)?.value ?? raw); }}>
          {d.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </label>
  );
}

/** One Univers domain: tick it all, or open it and tick / untick works (exclusions are stored as "-w-Q…"). */
function Univ({ p, v, set }: { p: { id: string; name: string; emoji?: string; count: number; works?: number }; v: string[]; set: (v: string[]) => void }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), [lim, setLim] = useState(150);
  const dom = p.id.slice(2), all = v.includes(p.id), works = store.univ[dom];
  const workOn = (id: string) => (all ? !v.includes('-' + id) : v.includes(id));
  const toggle = (id: string) => set(all ? (v.includes('-' + id) ? v.filter(x => x !== '-' + id) : [...v, '-' + id]) : (v.includes(id) ? v.filter(x => x !== id) : [...v, id]));
  const ids = new Set(works?.map(w => w.id));
  const setAll = (on: boolean) => set([...v.filter(x => !ids.has(x) && !ids.has(x.replace(/^-/, '')) && x !== p.id), ...(on ? [p.id] : [])]);
  const shown = (works ?? []).filter(w => !q || w.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div class="univ">
      <div class="univ-head">
        <label class={`pack ${all ? 'on' : ''}`}><input type="checkbox" checked={all} onChange={() => setAll(!all)} /> {p.emoji} {p.name} <small>{p.count || '…'} persos · {p.works || '…'} œuvres</small></label>
        <button type="button" class="btn ghost small" onClick={() => { setOpen(!open); if (!works) send({ t: 'univ', dom }); }}>{open ? '▾' : '▸'} Œuvres</button>
      </div>
      {open && (
        <div class="univ-body">
          <input class="univ-q" placeholder="Chercher (ex : Touhou, Umineko, Rivals…)" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)} />
          {!works ? <small class="muted">Chargement… (la 1ʳᵉ fois peut prendre ~30 s)</small> : (
            <div class="univ-list">
              {shown.slice(0, lim).map(w => (
                <label key={w.id} class={`pack ${workOn(w.id) ? 'on' : ''}`}><input type="checkbox" checked={workOn(w.id)} onChange={() => toggle(w.id)} /> {w.name} <small>{w.n}</small></label>
              ))}
              {shown.length > lim && <button type="button" class="btn ghost small" onClick={() => setLim(lim + 300)}>+ {shown.length - lim} autres</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Add any Fandom wiki by its name (the part before .fandom.com). */
function FandomAdd({ v, set }: { v: string[]; set: (v: string[]) => void }) {
  const [w, setW] = useState('');
  const mine = v.filter(x => x.startsWith('fw-'));
  const add = () => { const id = 'fw-' + w.toLowerCase().replace(/^https?:\/\//, '').replace(/\.fandom\.com.*$/, '').replace(/[^a-z0-9-]/g, ''); if (id.length > 4 && !v.includes(id)) set([...v, id]); setW(''); };
  return (
    <div class="packs-sub">
      <b>➕ Wiki Fandom</b>
      <input class="univ-q" placeholder="nom du wiki (ex : rivalsofaether, touhou, ssf2)" value={w} onInput={e => setW((e.target as HTMLInputElement).value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} />
      <button type="button" class="btn ghost small" onClick={add}>Ajouter</button>
      {mine.map(id => <span key={id} class="pack on">🌐 {id.slice(3)} <button type="button" class="pkick" style="position:static" onClick={() => set(v.filter(x => x !== id))}>✕</button></span>)}
    </div>
  );
}
