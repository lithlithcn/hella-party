import { useLayoutEffect, useRef } from 'preact/hooks';
import type { PublicState } from '../../shared/protocol';
import { CLIENT_FEATURES } from '../feature';
import { send, store } from '../store';
import { useState } from 'preact/hooks';
import { AvatarEditor, myAvatar } from './avatar-editor';
import { Avatar, fmtMs, playerColor } from './util';
import type { ChatLine } from '../store';

export function Players({ s }: { s: PublicState }) {
  const list = s.status === 'lobby' ? s.players : [...s.players].sort((a, b) => b.score - a.score);
  const reveal = s.phase?.name === 'reveal';
  const [edit, setEdit] = useState(false);
  return (
    <section class={`players ${list.length > 40 ? 'tiny' : list.length > 24 ? 'compact' : ''}`}>
      {edit && <AvatarEditor onClose={() => setEdit(false)} onDone={d => { myAvatar.set(d); send({ t: 'avatar', data: d }); setEdit(false); }} />}
      {list.map(p => {
        const f = p.found;
        return (
          <div key={p.id} data-pid={p.id} class={`pcard ${f ? `found g-${f.grade}` : ''} ${p.connected ? '' : 'off'} ${p.id === s.me ? 'me' : ''}`}>
            <span onClick={() => p.id === s.me && setEdit(true)} title={p.id === s.me ? 'Changer ma photo' : undefined} class={p.id === s.me ? 'clickable' : ''}><Avatar name={p.name} id={p.id} /></span>
            <div class="pinfo">
              <div class="pname">{p.leader && '👑 '}{p.name}</div>
              {s.players.find(x => x.leader)?.id === s.me && p.id !== s.me && !p.bot && p.connected && <button type="button" class="phost" title="Rendre hôte" onClick={() => confirm(`Donner le rôle d'hôte à ${p.name} ?`) && send({ t: 'host', id: p.id })}>👑</button>}
              {s.players.find(x => x.leader)?.id === s.me && p.id !== s.me && <button type="button" class="pkick" title="Expulser" onClick={() => confirm(`Expulser ${p.name} ?`) && send({ t: 'kick', id: p.id })}>✕</button>}
            <div class="pscore"><Count v={p.score} /></div>
            </div>

            {p.guess && <div class={`pguess ${f ? 'said' : ''}`} key={p.guess}>{p.guess}</div>}
            <div class="ptags">
              {CLIENT_FEATURES.map(ft => ft.PlayerCard && <ft.PlayerCard key={ft.id} s={s} p={p} />)}
              {f && reveal && <div class="ppts">+{f.points}</div>}
            </div>
            {f && <div class="pfound">✓ {fmtMs(f.ms)}</div>}
          </div>
        );
      })}
    </section>
  );
}

export const chatInput = { el: null as HTMLInputElement | null };

const nameColor = (id: string) => playerColor(id);
const jump = (id: number) => { const el = document.querySelector(`[data-mid="${id}"]`); if (!el) return; el.scrollIntoView({ block: 'center' }); el.classList.remove('hl'); void (el as HTMLElement).offsetWidth; el.classList.add('hl'); };

export function Chat() {
  const box = useRef<HTMLDivElement>(null);
  const [reply, setReply] = useState<ChatLine | null>(null);
  // Discord-like: stick to the bottom unless the user scrolled up to read (the log is capped, so watch the last line, not the length)
  const stick = useRef(true);
  const last = store.chat[store.chat.length - 1];
  useLayoutEffect(() => {
    const b = box.current; if (!b || !(stick.current || last?.from === store.s?.me)) return;
    b.scrollTop = b.scrollHeight; requestAnimationFrame(() => { b.scrollTop = b.scrollHeight; }); // again after the entry animation/layout
  }, [last]);
  useLayoutEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => { if (stick.current) b.scrollTop = b.scrollHeight; }); ro.observe(b); return () => ro.disconnect(); }, []);
  const pick = (c: ChatLine) => { if (c.id == null) return; setReply(c); chatInput.el?.focus(); };
  return (
    <section class="chat">
      <div class="chat-log" ref={box} onScroll={e => { const b = e.currentTarget; stick.current = b.scrollHeight - b.scrollTop - b.clientHeight < 60; }}>
        {store.chat.map((c, i) => (
          <div key={c.id ?? `s${i}`} data-mid={c.id} class={c.from ? `msg ${c.bubble ? 'bub' : ''}` : 'msg sys'}>
            {c.reply && <div class="mquote" onClick={() => jump(c.reply!.id)}>↪ <b style={{ color: c.reply.from ? nameColor(c.reply.from) : undefined }}>{c.reply.name}</b> {c.reply.text}</div>}
            {c.from && <b style={{ color: nameColor(c.from) }}>{c.name} </b>}{c.text}
            {c.id != null && <button type="button" class="mreply" title="Répondre" onClick={() => pick(c)}>↩</button>}
          </div>
        ))}
      </div>
      {reply && <div class="reply-bar">↩ Réponse à <b style={{ color: nameColor(reply.from!) }}>{reply.name}</b> <span>{reply.text}</span><button type="button" onClick={() => setReply(null)} title="Annuler">✕</button></div>}
      <form class="chat-form" onSubmit={e => { e.preventDefault(); const el = chatInput.el!; if (el.value.trim()) { send({ t: 'chat', text: el.value, reply: reply?.id }); el.value = ''; setReply(null); } el.focus(); }}>
        <input class="chat-input" onKeyDown={e => { if (e.key === 'Escape') setReply(null); }} ref={el => { chatInput.el = el; }} placeholder="Discuter…" maxLength={300} enterKeyHint="send" autocomplete="off" />
      </form>
    </section>
  );
}

/** Score that counts up (≈0.6 s, ease-out) instead of jumping — one rAF loop only while it moves. */
function Count({ v }: { v: number }) {
  const [shown, setShown] = useState(v);
  const from = useRef(v);
  useLayoutEffect(() => {
    const a = from.current, d = v - a; if (!d) return;
    const t0 = performance.now(); let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 600); const n = Math.round(a + d * (1 - (1 - k) ** 3)); setShown(n); from.current = n; if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [v]);
  return <span class={shown !== v ? 'counting' : ''}>{shown}</span>;
}
