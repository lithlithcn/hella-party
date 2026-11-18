import { useEffect, useRef, useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import type { PublicState } from '../../shared/protocol';
import type { QProps } from '../question-types/common';
import { CLIENT_FEATURES } from '../feature';
import { onFx, send, store } from '../store';
import { play, sfx } from '../sfx';
import { fmtMs, useNow } from './util';
import { flash } from './fx';
import { Lobby } from './lobby';

export const QT: Record<string, FunctionComponent<QProps>> = Object.fromEntries(
  Object.entries(import.meta.glob<{ default: FunctionComponent<QProps> }>('../question-types/*.tsx', { eager: true }))
    .map(([path, m]) => [path.match(/([^/]+)\.tsx$/)![1], m.default]),
);

export function Stage({ s }: { s: PublicState }) {
  const ph = s.phase;
  useEffect(() => { if (ph?.name === 'reveal') play('spawn', 0.6); }, [ph?.startedAt]);

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
      {ph && s.status !== 'lobby' && <Timer key={ph.startedAt} name={ph.name} startedAt={ph.startedAt} endsAt={ph.endsAt} />}
      <div class="stage-body">{body}</div>
      {CLIENT_FEATURES.map(f => f.Stage && <f.Stage key={f.id} s={s} />)}
      {s.status === 'playing' && <AnswerBox s={s} />}
      {s.status === 'playing' && <div class="hud">{CLIENT_FEATURES.map(f => f.Hud && <f.Hud key={f.id} s={s} />)}</div>}
    </section>
  );
}

/** Bar = one CSS animation (GPU, no re-render). Only the seconds counter re-renders, 4×/s. */
function Timer({ name, startedAt, endsAt }: { name: string; startedAt: number; endsAt: number }) {
  const now = useNow(250);
  const total = Math.max(1, endsAt - startedAt);
  const left = Math.max(0, endsAt - now);
  const sec = Math.ceil(left / 1000);
  useEffect(() => { if (name === 'question' && sec <= 5 && sec > 0) sfx.tick(); }, [sec]);
  const [start] = useState(() => left / total); // fraction remaining when mounted (late joiners)
  const [dur] = useState(left);                   // fixed once: changing animation-duration later desyncs the bar
  return (
    <div class={`timer ${name === 'question' && left < total / 4 ? 'hurry' : ''}`}>
      <i style={{ transform: `scaleX(${start})`, animation: `timer-shrink ${dur}ms linear forwards`, ['--from' as any]: start }} />
      <span>{sec}</span>
    </div>
  );
}

function Question({ s }: { s: PublicState }) {
  const q = s.question;
  const r = s.reveal;
  const ph = s.phase;
  const now = useNow(250, !!q?.hint && ph?.name === 'question');
  const showHint = q?.hint && ph && (ph.name === 'reveal' || now - ph.startedAt > (ph.endsAt - ph.startedAt) / 2);
  const T = q ? QT[q.type] ?? QT.text : null;
  const name = (id: string) => s.players.find(p => p.id === id)?.name ?? '?';
  return (
    <div class="question">
      <div class="q-prompt"><span class="q-round">#{s.round}</span> {q?.prompt ?? 'Réponse'}</div>
      <div class="q-media">
        {q && T ? <T q={q} phase={ph?.name === 'question' ? ph : null} clear={ph?.name === 'reveal'} /> : r?.src ? <img class="q-image" src={r.src} alt="" /> : null}
      </div>
      {showHint && !r && <div class="q-hint">💡 {q!.hint}</div>}
      {r && (
        <div class="reveal">
          <div class="reveal-answer">{r.answer}</div>
          {r.explain && <div class="reveal-explain">{r.explain}</div>}
          {q?.src?.startsWith('wiki:') && <small class="credit">Image : Wikipédia / Wikimedia Commons</small>}
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
  const open = s.phase?.name === 'question';

  useEffect(() => {
    answerInput.el = ref.current;
    return onFx(m => {
      if (m.kind === 'answer') {
        const d = m.data;
        const cls = d.ok ? (d.grade === 'exact' ? 'ok' : 'partial') : 'bad';
        (d.ok ? (d.grade === 'exact' ? sfx.correct : sfx.partial) : sfx.wrong)();
        setFb(''); requestAnimationFrame(() => setFb(cls));
      } else if (m.kind === 'found') {
        if (m.data.id !== store.s?.me) sfx.other();
        flash();
      }
    });
  }, []);

  useEffect(() => {
    if (open && ref.current) {
      ref.current.value = ''; setFb(''); sfx.start();
      if (!document.activeElement || document.activeElement === document.body) ref.current.focus({ preventScroll: true });
    }
  }, [s.phase?.startedAt]);

  // <form> + enterkeyhint: on phones "Enter" submits here instead of jumping to the next field (the chat)
  const submit = (e: Event) => {
    e.preventDefault();
    const el = ref.current!;
    if (el.value.trim()) { send({ t: 'answer', text: el.value }); el.value = ''; }
    el.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLInputElement;
    if (!el.value && store.s) for (const f of CLIENT_FEATURES) if (f.onKey?.(e, store.s)) e.preventDefault();
  };

  const done = me?.found?.grade === 'exact';
  // stays mounted (collapsed) during the reveal so focus can move without closing the phone keyboard
  return (
    <form class={`answer ${fb} ${open ? '' : 'collapsed'}`} onSubmit={submit} onAnimationEnd={() => setFb(x => (x === 'bad' ? '' : x))}>
      <input ref={ref} onKeyDown={onKey} autocomplete="off" autocapitalize="off" autoCorrect="off" spellcheck={false} maxLength={100} enterKeyHint="send"
        tabIndex={open ? 0 : -1} placeholder={done ? 'Trouvé ! ✓' : 'Tape ta réponse…'} />
    </form>
  );
}
