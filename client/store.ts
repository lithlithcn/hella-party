// Client state: the latest server snapshot + connection. UI reads it with useStore().
import { useEffect, useState } from 'preact/hooks';
import type { ClientMsg, PackInfo, PublicState, ServerMsg, SettingDef } from '../shared/protocol';

export interface ChatLine { from: string | null; name: string; text: string }

export const store = {
  s: null as PublicState | null,
  defs: [] as SettingDef[],
  packs: [] as PackInfo[],
  chat: [] as ChatLine[],
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
  sock.onopen = () => { retry = 0; store.online = true; send({ t: 'hello', id: identity.id, name: identity.name }); changed(); };
  sock.onmessage = ev => {
    const m: ServerMsg = JSON.parse(ev.data);
    switch (m.t) {
      case 'welcome': store.defs = m.defs; store.packs = m.packs; break;
      case 'state': store.s = m.s; store.offset = m.s.now - Date.now(); break;
      case 'chat': store.chat = [...store.chat.slice(-150), m]; break;
      case 'fx': fxListeners.forEach(l => l(m)); if (m.kind === 'error' && DEBUG) store.chat = [...store.chat, { from: null, name: '', text: `⚠ ${m.data?.where ?? ''} ${m.data?.msg}` }]; break;
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
