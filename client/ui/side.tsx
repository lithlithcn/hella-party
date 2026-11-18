import { useEffect, useRef } from 'preact/hooks';
import type { PublicState } from '../../shared/protocol';
import { CLIENT_FEATURES } from '../feature';
import { send, store } from '../store';
import { useState } from 'preact/hooks';
import { AvatarEditor, myAvatar } from './avatar-editor';
import { Avatar, fmtMs } from './util';

export function Players({ s }: { s: PublicState }) {
  const list = s.status === 'lobby' ? s.players : [...s.players].sort((a, b) => b.score - a.score);
  const reveal = s.phase?.name === 'reveal';
  const [edit, setEdit] = useState(false);
  return (
    <section class="players">
      {edit && <AvatarEditor onClose={() => setEdit(false)} onDone={d => { myAvatar.set(d); send({ t: 'avatar', data: d }); setEdit(false); }} />}
      {list.map(p => {
        const f = p.found;
        return (
          <div key={p.id} data-pid={p.id} class={`pcard ${f ? `found g-${f.grade}` : ''} ${p.connected ? '' : 'off'} ${p.id === s.me ? 'me' : ''}`}>
            <span onClick={() => p.id === s.me && setEdit(true)} title={p.id === s.me ? 'Changer ma photo' : undefined} class={p.id === s.me ? 'clickable' : ''}><Avatar name={p.name} id={p.id} /></span>
            <div class="pinfo">
              <div class="pname">{p.leader && '👑 '}{p.name}</div>
              <div class="pscore">{p.score}</div>
            </div>
            {f && <div class="pfound">{reveal ? `+${f.points}` : `✓ ${fmtMs(f.ms)}`}</div>}
            {!f && p.guess && <div class="pguess" key={p.guess}>{p.guess}</div>}
            {CLIENT_FEATURES.map(ft => ft.PlayerCard && <ft.PlayerCard key={ft.id} s={s} p={p} />)}
          </div>
        );
      })}
    </section>
  );
}

export const chatInput = { el: null as HTMLInputElement | null };

export function Chat() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [store.chat.length]);
  return (
    <section class="chat">
      <div class="chat-log" ref={box}>
        {store.chat.map((c, i) => (
          <div key={i} class={c.from ? 'msg' : 'msg sys'}>{c.from && <b>{c.name} </b>}{c.text}</div>
        ))}
      </div>
      <form class="chat-form" onSubmit={e => { e.preventDefault(); const el = chatInput.el!; if (el.value.trim()) { send({ t: 'chat', text: el.value }); el.value = ''; } el.focus(); }}>
        <input class="chat-input" ref={el => { chatInput.el = el; }} placeholder="Discuter…" maxLength={300} enterKeyHint="send" autocomplete="off" />
      </form>
    </section>
  );
}
