// One Durable Object per room code: owns the Game and the players' WebSockets.
import { DurableObject } from 'cloudflare:workers';
import type { ClientMsg, ServerMsg } from '../shared/protocol';
import { Game, PACK_INFO, SETTING_DEFS } from './engine';

export class Room extends DurableObject {
  private game: Game | null = null;
  private sockets = new Map<WebSocket, string | null>(); // socket → player id
  private dirty = false;

  private getGame(code: string) {
    return (this.game ??= new Game(code, {
      sync: () => {
        if (this.dirty) return;
        this.dirty = true;
        queueMicrotask(() => { this.dirty = false; this.flush(); });
      },
      send: (to, msg) => this.send(to, msg),
    }));
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.pathname.slice(-4);
    const game = this.getGame(code);
    if (url.pathname.startsWith('/log/')) {
      return Response.json({ settings: game.settings, status: game.status, phase: game.phase, question: game.question, players: game.list, f: game.f, log: game.log });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const { 0: client, 1: ws } = new WebSocketPair();
    ws.accept();
    this.sockets.set(ws, null);
    ws.addEventListener('message', ev => this.onMessage(ws, game, ev.data as string));
    const close = () => {
      const id = this.sockets.get(ws);
      this.sockets.delete(ws);
      // only leave if no other socket of the same player is still open (reloads, double tabs)
      if (id && ![...this.sockets.values()].includes(id)) game.leave(id);
    };
    ws.addEventListener('close', close);
    ws.addEventListener('error', close);
    return new Response(null, { status: 101, webSocket: client });
  }

  private onMessage(ws: WebSocket, game: Game, raw: string) {
    let m: ClientMsg;
    try { m = JSON.parse(raw); } catch { return; }
    const id = this.sockets.get(ws);
    if (m.t === 'hello') {
      const pid = String(m.id).slice(0, 40);
      this.sockets.set(ws, pid);
      ws.send(JSON.stringify({ t: 'welcome', defs: SETTING_DEFS, packs: PACK_INFO } satisfies ServerMsg));
      game.join(pid, String(m.name));
      return;
    }
    if (!id) return;
    game.guard(`msg.${m.t}`, () => {
      switch (m.t) {
        case 'answer': return game.answer(id, String(m.text).slice(0, 100));
        case 'chat': {
          const text = String(m.text).trim().slice(0, 300);
          if (text) this.send(null, { t: 'chat', from: id, name: game.players.get(id)?.name ?? '?', text });
          return;
        }
        case 'start': if (id === game.leaderId) game.start(); return;
        case 'stop': if (id === game.leaderId) game.stop(); return;
        case 'settings': return game.patchSettings(id, m.patch ?? {});
        case 'action': return game.action(id, String(m.f), String(m.a), m.p);
      }
    });
  }

  private send(to: string | null, msg: ServerMsg) {
    const raw = JSON.stringify(msg);
    for (const [ws, id] of this.sockets) if (id && (to === null || id === to)) this.trySend(ws, raw);
  }

  private flush() {
    const g = this.game; if (!g) return;
    for (const [ws, id] of this.sockets) if (id) this.trySend(ws, JSON.stringify({ t: 'state', s: g.view(id) } satisfies ServerMsg));
  }

  private trySend(ws: WebSocket, raw: string) {
    try { ws.send(raw); } catch { /* socket closing */ }
  }
}
