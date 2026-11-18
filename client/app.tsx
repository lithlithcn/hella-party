import { useEffect, useState } from 'preact/hooks';
import { CLIENT_FEATURES } from './feature';
import { connect, DEBUG, identity, onFx, send, useStore } from './store';
import { Logo } from './ui/util';
import { setMusic, volume } from './sfx';
import { lazy, Suspense } from 'preact/compat';

const Studio = lazy(() => import('./studio/studio'));
import { answerInput, Stage } from './ui/stage';
import { Chat, Players } from './ui/side';

const codeFromPath = () => location.pathname.slice(1).toUpperCase().match(/^[A-Z]{4}$/)?.[0] ?? null;

export function App() {
  const [code, setCode] = useState(codeFromPath());
  const [name, setName] = useState(identity.name);
  useEffect(() => { const f = () => setCode(codeFromPath()); addEventListener('popstate', f); return () => removeEventListener('popstate', f); }, []);
  const go = (c: string) => { history.pushState(null, '', `/${c}${location.search}`); setCode(c); };
  if (location.pathname.startsWith('/studio')) return <Suspense fallback={<div class="loading">Chargement du Studio…</div>}><Studio /></Suspense>;
  if (!code || !name) return <Home code={code} onName={n => { identity.name = n; setName(n); }} go={go} />;
  return <Room code={code} />;
}

function Home({ code, onName, go }: { code: string | null; onName: (n: string) => void; go: (c: string) => void }) {
  const [name, setName] = useState(identity.name);
  const [join, setJoin] = useState('');
  const create = async () => {
    if (!name.trim()) return;
    onName(name.trim());
    if (!code) go(((await (await fetch("/api/new")).json()) as { code: string }).code);
  };
  return (
    <main class="home">
      <Logo big />
      <p class="tagline">Reconnais. Mise. Maudis tes potes.</p>
      <div class="home-card">
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
  useEffect(() => { setMusic(s?.status === 'lobby' ? 'musicLobby' : s?.status === 'playing' ? 'musicGame' : null); }, [s?.status]);
  useEffect(() => () => setMusic(null), []);
  return (
    <div class="room">
      <header class="topbar">
        <a href="/" class="topbar-logo"><Logo /></a>
        {s && <span class="code" title="Copier le lien" onClick={() => navigator.clipboard?.writeText(location.href)}>{code}</span>}
        <span class={`dot ${st.online ? 'on' : ''}`} title={st.online ? 'Connecté' : 'Reconnexion…'} />
        <span class="grow" />
        <input class="vol" type="range" min="0" max="1" step="0.05" defaultValue={String(volume.get())} title="Volume" onInput={e => volume.set(+(e.target as HTMLInputElement).value)} />
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
