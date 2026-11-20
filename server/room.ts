// One Durable Object per room code: owns the Game and the players' WebSockets.
import { DurableObject } from 'cloudflare:workers';
import type { ChatQuote, ClientMsg, PackInfo, ServerMsg } from '../shared/protocol';
import { Game, PACK_INFO, SETTING_DEFS } from './engine';
import { PACKS, resolvePack } from './packs';
import { library, type Env, type NameKind } from './library';
import { HARVEST } from './_gen/harvest';
import type { Pack } from './packs';
/** Questions kept per harvested pack and difficulty level for one game (random sample). */
const SAMPLE = 400;
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

const MAX_AVATAR = 80_000; // data URL chars (~60 KB image)

/** Which specialised name sources a pack gets (see Library.names). */
const NAME_KIND: Record<string, NameKind> = { animes: 'anime', 'jeux-par-perso': 'game', 'persos-jeux-video': 'game', consoles: 'game', 'dessins-animes': 'series' };

/** A dropped player keeps their place (score, host role, running game) this long. */
const GRACE_MS = 45_000;

export class Room extends DurableObject<Env> {
  private game: Game | null = null;
  private sockets = new Map<WebSocket, string | null>(); // socket → player id
  private avatars = new Map<string, string>();
  private dirty = false;
  private libList: PackInfo[] = [];
  private libAt = 0;
  private chatSeq = 0;
  private kicked = new Set<string>();
  private chatLog = new Map<number, ChatQuote>(); // recent player messages, for replies

  private getGame(code: string) {
    return (this.game ??= new Game(code, {
      sync: () => {
        if (this.dirty) return;
        this.dirty = true;
        // Big rooms: batch bursts (e.g. 50 players answering at once) into one snapshot per 40 ms.
        const run = () => { this.dirty = false; this.flush(); };
        if (this.sockets.size > 8) setTimeout(run, 40); else queueMicrotask(run);
      },
      send: (to, msg) => this.send(to, msg),
      bubble: (from, text, to) => this.chatLine(from, text, undefined, to, true),
      prepare: async q => {
        const lib = library(this.env);
        // extra accepted answers from Wikipedia (redirects + other languages); never blocks the question
        const names = q.aliasTitle ? await lib.names(q.aliasTitle, q.nameKind ?? NAME_KIND[q.pack]).catch(() => [] as string[]) : [];
        const exact = names.length ? [...new Set([...q.exact, ...names])] : q.exact;
        if (!/^(wiki|url|fandom):/.test(q.src ?? '')) return { ...q, exact };
        const url = await lib.wiki(q.src!);
        return url ? { ...q, src: url, exact } : null;
      },
    }));
  }

  /** Library pack list, cached 10 s. Also tells the game which ids are selectable. */
  private async packList(force = false): Promise<PackInfo[]> {
    if (force || Date.now() - this.libAt > 10_000) {
      try { this.libList = await library(this.env).list(); this.libAt = Date.now(); } catch (e) { console.error('library', e); }
      if (this.game) this.game.libraryIds = new Set([...this.libList.map(p => p.id), ...HARVEST.map(h => h.id)]);
    }
    return [...PACK_INFO, ...HARVEST.map(({ base, ...h }) => ({ ...h, auto: !base })), ...this.libList];
  }

  /** Harvested pack (static /data/<id>.d<level>.json, baked at deploy by scripts/harvest.ts): only the played levels,
   *  only the ticked sub-categories, at most SAMPLE questions per level — loaded one file at a time, nothing cached.
   *  (Keeping whole packs in memory went past the Durable Object's 128 MB → the room was reset, the game lost.) */
  private async harvested(id: string, game: Game, cat = id) {
    const max = Number(game.setting('maxDifficulty') ?? 3), off = new Set((game.setting('packs') ?? []).filter((x: string) => x.startsWith('-g:')));
    let head: Pack | null = null; const qs: Pack['questions'] = [];
    for (let d = 1; d <= max; d++) {
      const r = await this.env.ASSETS.fetch(new Request(`https://assets.local/data/${id}.d${d}.json`)).catch(() => null);
      let j: any = r?.ok ? await r.json().catch(() => null) : null;
      if (!j) continue;
      const ok = j.questions.filter((q: any) => !off.has(`-g:${cat}:${q.group ?? j.name}`));
      j.questions = ok.length > SAMPLE ? shuffle(ok).slice(0, SAMPLE) : ok;
      const p = resolvePack(j); j = null;
      head ??= p; qs.push(...p.questions);
    }
    return head ? { ...head, questions: qs } : null;
  }
  /** Questions merged into a built-in category from harvested packs (INTO map). */
  private async merged(id: string, game: Game) {
    const parts: (Pack | null)[] = [];
    for (const h of HARVEST.filter(h => h.into === id)) parts.push(await this.harvested(h.id, game, id));
    const qs = parts.flatMap(p => p?.questions ?? []);
    return qs.length ? { id: '+' + id, name: id, tags: [], questions: qs.map(q => ({ ...q, key: `+${id}/${q.key}` })) } : null;
  }

  /** Load the selected library packs into the game (fresh copy at each start). */
  private async loadPacks(game: Game) {
    const all: string[] = game.setting('packs') ?? [];
    // auto sources merged INTO the selected built-in categories → game.extra['+<id>']
    for (const id of all) {
      const p = HARVEST.some(h => h.into === id) ? await this.merged(id, game) : null;
      if (p) game.extra['+' + id] = p; else delete game.extra['+' + id];
    }
    const ids = all.filter(id => game.libraryIds.has(id) || /^(u|w|fw)-/.test(id));
    const excluded = all.filter(id => id.startsWith('-w-')).map(id => id.slice(1));
    const lib = library(this.env);
    for (const id of ids) {
      if (HARVEST.some(h => h.id === id)) { const h = await this.harvested(id, game); if (h) game.extra[id] = h; else delete game.extra[id]; continue; }
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
      // only leave if no other socket of the same player is still open (reloads, double tabs), and only after
      // a grace period: phones drop the socket when the screen locks / the app switches, they reconnect within seconds
      if (id) setTimeout(() => { if (![...this.sockets.values()].includes(id)) game.leave(id); }, GRACE_MS);
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
    if (m.t === 'ping') { this.trySend(ws, '{"t":"pong"}'); return; }
    if (m.t === 'hello') {
      const pid = String(m.id).slice(0, 40);
      if (this.kicked.has(pid)) { ws.send(JSON.stringify({ t: 'err', msg: 'Tu as été expulsé de ce salon.' } satisfies ServerMsg)); ws.close(); return; }
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
        case 'mediaError': return game.mediaError(id);
        case 'chat': {
          const text = String(m.text).trim().slice(0, 300);
          if (!text) return;
          if (game.phase?.name === 'reveal') game.say(id, text); // during the reveal, chat also shows in the bubble
          this.chatLine(id, text, typeof m.reply === 'number' ? m.reply : undefined, null, false);
          return;
        }
        case 'stop': if (id === game.leaderId) game.stop(); return;
        case 'host': return game.makeHost(id, String(m.id));
        case 'kick': {
          const target = String(m.id);
          if (id !== game.leaderId || target === id) return;
          this.kicked.add(target);
          for (const [w, pid] of this.sockets) if (pid === target) { this.trySend(w, JSON.stringify({ t: 'err', msg: 'Tu as été expulsé de ce salon.' })); this.sockets.delete(w); try { w.close(); } catch {} }
          game.kick(target); return;
        }
        case 'settings': return game.patchSettings(id, m.patch ?? {});
        case 'action': return game.action(id, String(m.f), String(m.a), m.p);
      }
    });
  }

  /** One player chat line (normal message or a logged bubble), with an id so it can be replied to. */
  private chatLine(from: string, text: string, reply: number | undefined, to: string[] | null, bubble: boolean) {
    const msg = { id: ++this.chatSeq, from, name: this.game?.players.get(from)?.name ?? '?', text };
    const q = reply !== undefined ? this.chatLog.get(reply) : undefined;
    this.chatLog.set(msg.id, msg); if (this.chatLog.size > 200) this.chatLog.delete(this.chatLog.keys().next().value!);
    const out: ServerMsg = { t: 'chat', ...msg, reply: q && { ...q, text: q.text.slice(0, 80) }, bubble: bubble || undefined };
    if (!to) this.send(null, out); else for (const pid of to) this.send(pid, out);
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
