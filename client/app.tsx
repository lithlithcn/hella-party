import { useEffect, useState } from 'preact/hooks';
import { CLIENT_FEATURES } from './feature';
import { connect, DEBUG, identity, onFx, send, useStore } from './store';
import { Avatar, Logo } from './ui/util';
import { AvatarEditor, myAvatar } from './ui/avatar-editor';
import { startMusic, volume } from './sfx';
startMusic();
import { lazy, Suspense } from 'preact/compat';

const Studio = lazy(() => import('./studio/studio'));
import { answerInput, Stage } from './ui/stage';
import { Chat, chatInput, Players } from './ui/side';
import { focusTargets } from './store';
focusTargets.answer = () => answerInput.el;
focusTargets.chat = () => chatInput.el;

const codeFromPath = () => location.pathname.slice(1).toUpperCase().match(/^[A-Z]{4}$/)?.[0] ?? null;

export function App() {
  const [code, setCode] = useState(codeFromPath());
  const [name, setName] = useState(identity.name);
  useEffect(() => { const f = () => setCode(codeFromPath()); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  const go = (c: string) => { history.pushState(null, '', `/${c}${location.search}`); setCode(c); };
  if (location.pathname === '/check') return <WikiCheck />;
  if (location.pathname.startsWith('/studio')) return <Suspense fallback={<div class="loading">Chargement du Studio…</div>}><Studio /></Suspense>;
  if (!code || !name) return <Home code={code} onName={n => { identity.name = n; setName(n); }} go={go} />;
  return <Room code={code} />;
}

function Home({ code, onName, go }: { code: string | null; onName: (n: string) => void; go: (c: string) => void }) {
  const [name, setName] = useState(identity.name);
  const [join, setJoin] = useState('');
  const [av, setAv] = useState(myAvatar.get());
  const [editAv, setEditAv] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    onName(name.trim());
    if (!code) go(((await (await fetch("/api/new")).json()) as { code: string }).code);
  };
  return (
    <main class="home">
      <Logo big />
      <p class="tagline">iviks</p>
      <div class="home-card">
        <button class="avatar-btn" onClick={() => setEditAv(true)} title="Photo de profil">
          <Avatar id={identity.id} name={name || '?'} size={84} src={av} /><span>📷</span>
        </button>
        {editAv && <AvatarEditor onClose={() => setEditAv(false)} onDone={d => { myAvatar.set(d); setAv(d); setEditAv(false); }} />}
        <input class="big-input" placeholder="Ton pseudo" maxLength={20} value={name} autofocus
          onInput={e => setName((e.target as HTMLInputElement).value)} onKeyDown={e => e.key === 'Enter' && create()} />
        <button class="btn big" onClick={create}>{code ? `Rejoindre ${code}` : 'Créer une salle'}</button>
        {!code && (
          <div class="join">
            <input placeholder="CODE" maxLength={4} value={join} onInput={e => setJoin((e.target as HTMLInputElement).value.toUpperCase())} />
            <button class="btn ghost" disabled={join.length !== 4 || !name.trim()} onClick={() => { onName(name.trim()); go(join); }}>Rejoindre</button>
          </div>
        )}
      </div>
      <a class="btn ghost studio-link" href="/studio">🎨 Studio : crée tes propres packs</a>
      <VolumeMenu />
      <Version />
    </main>
  );
}

function Room({ code }: { code: string }) {
  const st = useStore();
  useEffect(() => connect(code), [code]);
  useEffect(() => onFx(m => CLIENT_FEATURES.forEach(f => (!m.f || m.f === f.id) && f.onFx?.(m))), []);
  // typing anywhere goes to the answer field; feature shortcuts when not typing
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (st.s) for (const f of CLIENT_FEATURES) if (f.onKey?.(e, st.s)) return e.preventDefault();
      if (e.key.length === 1 && answerInput.el?.isConnected) answerInput.el.focus();
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  const s = st.s;
  const me = s?.players.find(p => p.id === s.me);
  return (
    <div class="room">
      <header class="topbar">
        <a href="/" class="topbar-logo"><Logo /></a>
        {s && <span class="code" title="Copier le lien" onClick={() => navigator.clipboard?.writeText(location.href)}>{code}</span>}
        <span class={`dot ${st.online ? 'on' : ''}`} title={st.online ? 'Connecté' : 'Reconnexion…'} />
        <span class="grow" />
        <VolumeMenu />
        {me?.leader && s?.status === 'playing' && <button class="btn ghost small" onClick={() => send({ t: 'stop' })}>Arrêter</button>}
      </header>
      {s ? (
        <div class="layout">
          <Stage s={s} />
          <Players s={s} />
          <Chat />
        </div>
      ) : <div class="loading">Connexion…</div>}
      {DEBUG && s && <pre class="debug">{JSON.stringify({ ...s, now: undefined }, null, 1)}<a href={`/log/${code}`} target="_blank">/log/{code}</a></pre>}
    </div>
  );
}

/** Debug page: shows every wiki: image of the built-in packs, failures first. */
function WikiCheck() {
  const [rows, setRows] = useState<{ pack: string; answer: string; src: string; url?: string | null }[]>([]);
  useEffect(() => {
    fetch('/api/wiki-check').then(r => r.json() as Promise<any[]>).then(async list => {
      setRows(list);
      const { resolveWiki } = await import('./question-types/common');
      const out = await Promise.all(list.map(async r => ({ ...r, url: (await resolveWiki(r.src)) ?? null })));
      setRows(out.sort((a, b) => Number(!!a.url) - Number(!!b.url)));
    });
  }, []);
  const bad = rows.filter(r => r.url === null);
  return (
    <main class="check">
      <a class="btn small" href="/">← Retour au jeu</a>
      <h2>Page de diagnostic (pas le jeu) — images Wikipédia : {rows.length} · ❌ {bad.length}{rows.some(r => r.url === undefined) ? ' · vérification en cours…' : ''}</h2>
      {bad.length > 0 && <pre>{bad.map(r => `${r.pack} | ${r.answer} | ${r.src}`).join('\n')}</pre>}
      <div class="check-grid">{rows.map(r => <figure><img src={r.url ?? ''} loading="lazy" /><figcaption>{r.url === null ? '❌ ' : ''}{r.answer}</figcaption></figure>)}</div>
    </main>
  );
}

/** Deployed version (commit + build time) — tells at a glance whether the latest update is live. */
function Version() {
  const [v, setV] = useState<{ commit: string; built: string } | null>(null);
  useEffect(() => { fetch('/api/version').then(r => r.json() as Promise<any>).then(setV).catch(() => {}); }, []);
  return v ? <small class="muted version">version {v.commit} · {new Date(v.built).toLocaleString('fr-FR')}</small> : null;
}

/** 🔊 button → two sliders: music / sound effects. */
function VolumeMenu() {
  const [open, setOpen] = useState(false);
  return (
    <span class="volmenu">
      <button class="btn ghost small" onClick={() => setOpen(o => !o)} title="Volume">🔊</button>
      {open && (
        <div class="volpop">
          <label>🎵 Musique<input type="range" min="0" max="1" step="0.05" defaultValue={String(volume.music())} onInput={e => volume.setMusic(+(e.target as HTMLInputElement).value)} /></label>
          <label>💥 Effets<input type="range" min="0" max="1" step="0.05" defaultValue={String(volume.get())} onInput={e => volume.set(+(e.target as HTMLInputElement).value)} /></label>
        </div>
      )}
    </span>
  );
}
