// One Durable Object per room code: owns the Game and the players' WebSockets.
import { DurableObject } from 'cloudflare:workers';
import type { ClientMsg, PackInfo, ServerMsg } from '../shared/protocol';
import { Game, PACK_INFO, SETTING_DEFS } from './engine';
import { resolvePack } from './packs';
import { library, type Env } from './library';

const MAX_AVATAR = 80_000; // data URL chars (~60 KB image)

export class Room extends DurableObject<Env> {
  private game: Game | null = null;
  private sockets = new Map<WebSocket, string | null>(); // socket → player id
  private avatars = new Map<string, string>();
  private dirty = false;
  private libList: PackInfo[] = [];
  private libAt = 0;

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

  /** Library pack list, cached 10 s. Also tells the game which ids are selectable. */
  private async packList(force = false): Promise<PackInfo[]> {
    if (force || Date.now() - this.libAt > 10_000) {
      try { this.libList = await library(this.env).list(); this.libAt = Date.now(); } catch (e) { console.error('library', e); }
      if (this.game) this.game.libraryIds = new Set(this.libList.map(p => p.id));
    }
    return [...PACK_INFO, ...this.libList];
  }

  /** Load the selected library packs into the game (fresh copy at each start). */
  private async loadPacks(game: Game) {
    const ids: string[] = (game.setting('packs') ?? []).filter((id: string) => game.libraryIds.has(id));
    const lib = library(this.env);
    for (const id of ids) {
      const p = await lib.get(id);
      if (p) game.extra[id] = resolvePack(p); else delete game.extra[id];
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.pathname.slice(-4);
    const game = this.getGame(code);
    if (url.pathname.startsWith('/log/')) {
      return Response.json({ settings: game.settings, status: game.status, phase: game.phase, question: game.question, players: game.list, f: game.f, log: game.log });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    await this.packList();
    const { 0: client, 1: ws } = new WebSocketPair();
    ws.accept();
    this.sockets.set(ws, null);
    ws.addEventListener('message', ev => { this.onMessage(ws, game, ev.data as string).catch(e => game.record('error', { where: 'room', msg: String(e) })); });
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

  private setAvatar(game: Game, id: string, data: unknown) {
    const ok = typeof data === 'string' && data.startsWith('data:image/') && data.length <= MAX_AVATAR;
    if (ok) this.avatars.set(id, data as string); else this.avatars.delete(id);
    game.avatarVersion.set(id, (game.avatarVersion.get(id) ?? 0) + 1);
    this.send(null, { t: 'avatar', id, data: ok ? (data as string) : null });
    game.io.sync();
  }

  private async onMessage(ws: WebSocket, game: Game, raw: string) {
    let m: ClientMsg;
    try { m = JSON.parse(raw); } catch { return; }
    const id = this.sockets.get(ws);
    if (m.t === 'hello') {
      const pid = String(m.id).slice(0, 40);
      this.sockets.set(ws, pid);
      ws.send(JSON.stringify({ t: 'welcome', defs: SETTING_DEFS, packs: await this.packList() } satisfies ServerMsg));
      ws.send(JSON.stringify({ t: 'avatars', map: Object.fromEntries(this.avatars) } satisfies ServerMsg));
      game.join(pid, String(m.name));
      if (m.avatar) this.setAvatar(game, pid, m.avatar);
      return;
    }
    if (!id) return;
    switch (m.t) {
      case 'packs': ws.send(JSON.stringify({ t: 'packs', packs: await this.packList(true) } satisfies ServerMsg)); return;
      case 'avatar': return this.setAvatar(game, id, m.data);
      case 'start':
        if (id !== game.leaderId || game.status === 'playing') return;
        await this.packList();
        await this.loadPacks(game);
        game.guard('start', () => game.start());
        return;
      case 'settings':
        if (Array.isArray(m.patch?.packs) && m.patch.packs.some((p: string) => !game.packExists(p))) await this.packList(true);
        break;
    }
    game.guard(`msg.${m.t}`, () => {
      switch (m.t) {
        case 'answer': return game.answer(id, String(m.text).slice(0, 100));
        case 'chat': {
          const text = String(m.text).trim().slice(0, 300);
          if (text) this.send(null, { t: 'chat', from: id, name: game.players.get(id)?.name ?? '?', text });
          return;
        }
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
