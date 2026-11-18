// Client state: the latest server snapshot + connection. UI reads it with useStore().
import { useEffect, useState } from 'preact/hooks';
import type { ClientMsg, PackInfo, PublicState, ServerMsg, SettingDef } from '../shared/protocol';
import { play } from './sfx';

export interface ChatLine { id?: number; from: string | null; name: string; text: string; reply?: { id: number; from: string | null; name: string; text: string } }

export const store = {
  s: null as PublicState | null,
  defs: [] as SettingDef[],
  packs: [] as PackInfo[],
  chat: [] as ChatLine[],
  avatars: {} as Record<string, string>, // player id → data URL
  offset: 0,          // serverNow - Date.now()
  online: false,
};

export const DEBUG = new URLSearchParams(location.search).has('debug');

const listeners = new Set<() => void>();
const fxListeners = new Set<(m: Extract<ServerMsg, { t: 'fx' }>) => void>();
const changed = () => listeners.forEach(l => l());

export function useStore() {
  const [, bump] = useState(0);
  useEffect(() => { const l = () => bump(x => x + 1); listeners.add(l); return () => void listeners.delete(l); }, []);
  return store;
}

/** Subscribe to transient server effects (sounds, feedback). */
export function onFx(fn: (m: Extract<ServerMsg, { t: 'fx' }>) => void) { fxListeners.add(fn); return () => void fxListeners.delete(fn); }

export const serverNow = () => Date.now() + store.offset;

// identity: per tab (sessionStorage) so several tabs = several players when testing
export const identity = {
  get id() { let id = sessionStorage.getItem('hp.id'); if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('hp.id', id); } return id; },
  get name() { return localStorage.getItem('hp.name') ?? ''; },
  set name(v: string) { localStorage.setItem('hp.name', v); },
};

let ws: WebSocket | null = null;
let retry = 0;

export function connect(code: string) {
  ws?.close();
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/${code}`);
  ws = sock;
  sock.onopen = () => { retry = 0; store.online = true; send({ t: 'hello', id: identity.id, name: identity.name, avatar: localStorage.getItem('hp.avatar') ?? undefined }); changed(); };
  sock.onmessage = ev => {
    const m: ServerMsg = JSON.parse(ev.data);
    switch (m.t) {
      case 'welcome': store.defs = m.defs; store.packs = m.packs; break;
      case 'packs': store.packs = m.packs; break;
      case 'avatars': store.avatars = m.map; break;
      case 'avatar': store.avatars = { ...store.avatars }; if (m.data) store.avatars[m.id] = m.data; else delete store.avatars[m.id]; break;
      case 'state': focusHandoff(store.s?.phase?.name, m.s.phase?.name); store.s = m.s; store.offset = m.s.now - Date.now(); break;
      case 'chat': store.chat = [...store.chat.slice(-150), m]; if (m.from) play('chat', 0.6); break;
      case 'fx': if (m.kind === 'preload' && m.data?.src) new Image().src = m.data.src; if (m.kind === 'join') play('join', 0.7); if (m.kind === 'error') play('invalid'); fxListeners.forEach(l => l(m)); if (m.kind === 'error' && DEBUG) store.chat = [...store.chat, { from: null, name: '', text: `⚠ ${m.data?.where ?? ''} ${m.data?.msg}` }]; break;
      case 'err': console.warn(m.msg); break;
    }
    changed();
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    store.online = false; changed();
    setTimeout(() => ws === sock && connect(code), Math.min(5000, 500 * 2 ** retry++));
  };
}

export function send(m: ClientMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

/** Shortcut for feature actions. */
export const act = (f: string, a: string, p?: any) => send({ t: 'action', f, a, p });

/** Question → reveal: answer field → chat field. Reveal/other → question: back to the answer field.
 *  Done synchronously before rendering so focus moves between two visible fields (phone keyboard stays open). */
export const focusTargets = { answer: () => null as HTMLInputElement | null, chat: () => null as HTMLInputElement | null };
function focusHandoff(prev?: string, next?: string) {
  if (prev === next) return;
  const answer = focusTargets.answer(), chat = focusTargets.chat(), active = document.activeElement;
  if (next === 'question') { if (answer && (active === chat ? !chat?.value : true)) answer.focus({ preventScroll: true }); }
  else if (prev === 'question' && active === answer) chat?.focus({ preventScroll: true });
}
