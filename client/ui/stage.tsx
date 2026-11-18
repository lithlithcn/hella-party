import { useEffect, useRef, useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type { PublicQuestion, PublicState } from '../../shared/protocol';
import { CLIENT_FEATURES } from '../feature';
import { onFx, send, store } from '../store';
import { sfx } from '../sfx';
import { fmtMs, useNow } from './util';
import { Lobby } from './lobby';

const QT = Object.fromEntries(
  Object.entries(import.meta.glob<{ default: FunctionComponent<{ q: PublicQuestion }> }>('../question-types/*.tsx', { eager: true }))
    .map(([path, m]) => [path.match(/([^/]+)\.tsx$/)![1], m.default]),
);

export function Stage({ s }: { s: PublicState }) {
  const ph = s.phase;
  const now = useNow(100, !!ph);
  const left = ph ? Math.max(0, ph.endsAt - now) : 0;
  const frac = ph ? left / Math.max(1, ph.endsAt - ph.startedAt) : 0;

  let body;
  if (s.status === 'lobby') body = <Lobby s={s} />;
  else if (ph?.name === 'podium') body = <Podium s={s} />;
  else if (ph?.name === 'question' || ph?.name === 'reveal') body = <Question s={s} />;
  else {
    const P = CLIENT_FEATURES.map(f => f.Phases?.[ph?.name ?? '']).find(Boolean);
    body = P ? <P s={s} /> : <div class="stage-wait">…</div>;
  }

  return (
    <section class={`stage phase-${ph?.name ?? 'none'}`}>
      {ph && s.status !== 'lobby' && (
        <div class={`timer ${frac < 0.25 && ph.name === 'question' ? 'hurry' : ''}`}>
          <i style={{ transform: `scaleX(${frac})` }} />
          <span>{Math.ceil(left / 1000)}</span>
        </div>
      )}
      <div class="stage-body">{body}</div>
      {CLIENT_FEATURES.map(f => f.Stage && <f.Stage key={f.id} s={s} />)}
      {s.status === 'playing' && <AnswerBox s={s} />}
      {s.status === 'playing' && <div class="hud">{CLIENT_FEATURES.map(f => f.Hud && <f.Hud key={f.id} s={s} />)}</div>}
    </section>
  );
}

function Question({ s }: { s: PublicState }) {
  const q = s.question;
  const r = s.reveal;
  const T = q ? QT[q.type] ?? QT.text : null;
  const name = (id: string) => s.players.find(p => p.id === id)?.name ?? '?';
  return (
    <div class="question">
      <div class="q-prompt"><span class="q-round">#{s.round}</span> {q?.prompt ?? 'Réponse'}</div>
      <div class="q-media">
        {q && T ? <T q={q} /> : r?.src ? <img class="q-image" src={r.src} alt="" /> : null}
      </div>
      {r && (
        <div class="reveal">
          <div class="reveal-answer">{r.answer}</div>
          <div class="reveal-finders">
            {r.finders.length === 0 && <span class="muted">Personne n'a trouvé 😶</span>}
            {r.finders.map((f, i) => (
              <span key={f.id} class={`finder g-${f.grade}`}>{i === 0 && '⚡'}{name(f.id)} <b>+{f.points}</b> <small>{fmtMs(f.ms)}</small></span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Podium({ s }: { s: PublicState }) {
  useEffect(() => sfx.win(), []);
  const ranked = [...s.players].sort((a, b) => b.score - a.score);
  return (
    <div class="podium">
      <div class="podium-title">🏆 {s.winners.map(id => s.players.find(p => p.id === id)?.name).join(' & ')} gagne !</div>
      <ol>{ranked.slice(0, 5).map(p => <li key={p.id}><span>{p.name}</span><b>{p.score}</b></li>)}</ol>
    </div>
  );
}

export const answerInput = { el: null as HTMLInputElement | null };

function AnswerBox({ s }: { s: PublicState }) {
  const ref = useRef<HTMLInputElement>(null);
  const [fb, setFb] = useState('');
  const me = s.players.find(p => p.id === s.me);

  useEffect(() => {
    answerInput.el = ref.current;
    return onFx(m => {
      if (m.kind === 'answer') {
        const d = m.data;
        const cls = d.ok ? (d.grade === 'exact' ? 'ok' : 'partial') : 'bad';
        (d.ok ? (d.grade === 'exact' ? sfx.correct : sfx.partial) : sfx.wrong)();
        setFb(''); requestAnimationFrame(() => setFb(cls));
      } else if (m.kind === 'found' && m.data.id !== store.s?.me) sfx.other();
    });
  }, []);

  useEffect(() => {
    if (s.phase?.name === 'question' && ref.current) { ref.current.value = ''; setFb(''); ref.current.focus(); sfx.start(); }
  }, [s.phase?.startedAt]);

  const onKey = (e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLInputElement;
    if (!el.value && store.s) for (const f of CLIENT_FEATURES) if (f.onKey?.(e, store.s)) { e.preventDefault(); return; }
    if (e.key === 'Enter' && el.value.trim()) { send({ t: 'answer', text: el.value }); el.value = ''; }
  };

  const done = me?.found?.grade === 'exact';
  return (
    <div class={`answer ${fb}`} onAnimationEnd={() => setFb(x => (x === 'bad' ? '' : x))}>
      <input ref={ref} onKeyDown={onKey} autocomplete="off" autocapitalize="off" spellcheck={false} maxLength={100}
        placeholder={done ? 'Trouvé ! ✓' : s.phase?.name === 'question' ? 'Tape ta réponse…' : 'Prochaine question…'} />
    </div>
  );
}
