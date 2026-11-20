// The game core. Knows rooms, players, phases, questions and answers — nothing else.
// Every rule beyond that lives in /features and plugs in through server/feature.ts.
import { GRADE_RANK, type Found, type Grade, type PackInfo, type Phase, type PublicQuestion, type PublicState, type ServerMsg, type SettingDef } from '../shared/protocol';
import { judge } from '../shared/answer';
import type { GameEvents, ScoreCtx, ServerFeature } from './feature';
import { FEATURES } from './_gen/features';
import { PACK_META, PACKS, type Question } from './packs';

export type { Question };

export interface Player {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  bot: boolean;
  joinedAt: number;
  color: number;
}

export interface IO {
  sync(): void;                                   // schedule a state broadcast
  send(to: string | null, msg: ServerMsg): void;  // null = everyone
  /** Log a player's bubble text in the chat (to = only these players, null = everyone). */
  bubble?(from: string, text: string, to: string[] | null): void;
  /** Make a question playable (e.g. resolve wiki: images). null = unusable → skipped. */
  prepare?(q: Question): Promise<Question | null>;
}

export interface QueuedPhase { name: string; ms: number; data?: any; onEnd?: () => void }

const CORE_SETTINGS: SettingDef[] = [
  { key: 'answerTime', label: 'Temps de réponse (s)', type: 'number', default: 20, min: 5, max: 60, step: 1 },
  { key: 'revealTime', label: 'Temps de révélation (s)', type: 'number', default: 4, min: 2, max: 15, step: 1 },
  { key: 'mediaEffects', label: 'Effets des packs (zoom…)', type: 'bool', default: false },
  { key: 'imageReveal', label: 'Image qui se dévoile', type: 'select', default: 'none', options: [{ value: 'none', label: 'Non' }, { value: 'unpixelate', label: 'Pixelisée → nette' }, { value: 'unblur', label: 'Floue → nette' }, { value: 'unzoom', label: 'Zoomée → normale' }, { value: 'random', label: 'Au hasard' }] },
  { key: 'maxDifficulty', label: 'Difficulté max', type: 'select', default: 2, options: [{ value: 1, label: 'Facile' }, { value: 2, label: 'Moyen' }, { value: 3, label: 'Tout (même niche)' }] },
  { key: 'packs', label: 'Packs', type: 'packs', default: Object.keys(PACKS).filter(id => id !== 'flags') },
];

export const SETTING_DEFS: SettingDef[] = [
  ...CORE_SETTINGS,
  ...FEATURES.flatMap(f => (f.settings ?? []).map(s => ({ ...s, key: `${f.id}.${s.key}`, feature: f.id }))),
];

export const PACK_INFO: PackInfo[] = Object.values(PACKS).map(p => ({ id: p.id, name: p.name, count: p.questions.length, ...PACK_META[p.id] }));

const SCORE_STEPS = FEATURES.flatMap(f => (f.score ?? []).map(s => ({ ...s, f }))).sort((a, b) => a.order - b.order);

const VISUAL_FX = ['blur', 'pixelate', 'zoom', 'zoomX', 'zoomY', 'reveal'] as const;

const REVEALS = ['unpixelate', 'unblur', 'unzoom'] as const;
function publicQuestion(q: Question, effects: boolean, reveal: string): PublicQuestion {
  const { answer, exact, partial, explain, key, pack, id, time, media, ...pub } = q;
  if (!effects && pub.opts) { pub.opts = { ...pub.opts }; for (const k of VISUAL_FX) delete pub.opts[k]; }
  // room-wide "image qui se dévoile" for image questions that don't already have a reveal
  if (reveal !== 'none' && pub.type === 'image' && (!pub.opts?.reveal || pub.opts.reveal === 'none')) {
    let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    pub.opts = { ...pub.opts, reveal: reveal === 'random' ? REVEALS[h % 3] : (reveal as any) };
  }
  return { ...pub, id: key, assets: media ?? `/packs/${pack}/` };
}

export class Game {
  players = new Map<string, Player>();
  leaderId: string | null = null;
  status: PublicState['status'] = 'lobby';
  phase: Phase | null = null;
  round = 0;
  settings: Record<string, any> = Object.fromEntries(SETTING_DEFS.map(d => [d.key, d.default]));
  question: Question | null = null;
  found = new Map<string, Found>();
  /** Speech bubble under each card: wrong guesses, and free messages once found / during the reveal (`after`). */
  guesses = new Map<string, { text: string; after: boolean }>();
  private foundText = new Map<string, string>();
  private gaveUp = new Set<string>();
  /** Library packs loaded for this room (by Room before start). */
  extra: Record<string, import('./packs').Pack> = {};
  /** Ids of library packs that may be selected. */
  libraryIds = new Set<string>();
  avatarVersion = new Map<string, number>();
  reveal: PublicState['reveal'] = null;
  winners: string[] = [];
  /** Feature state slices, keyed by feature id. */
  f: Record<string, any> = {};
  /** Questions to play next, before random picks (used by e.g. a "série" feature). */
  forced: Question[] = [];
  /** Every question played this game, in order. */
  history: Question[] = [];
  log: { t: number; ev: string; d?: any }[] = [];

  private queue: QueuedPhase[] = [];
  private phaseTimer: any = null;
  private phaseEnd: (() => void) | null = null;
  private timers = new Set<any>();
  private used = new Set<string>();

  constructor(public code: string, public io: IO) {
    this.initFeatures();
  }

  // ───────────── helpers for features ─────────────
  now() { return Date.now(); }
  get list() { return [...this.players.values()]; }
  get humans() { return this.list.filter(p => !p.bot); }
  get active() { return this.list.filter(p => p.connected); }
  setting<T = any>(key: string): T { return this.settings[key]; }
  isActive(f: ServerFeature) { return !f.active || f.active(this); }
  /** Timer cleared automatically when the phase changes. */
  later(ms: number, fn: () => void) {
    const t = setTimeout(() => { this.timers.delete(t); this.guard('timer', fn); }, ms);
    this.timers.add(t);
  }
  /** Queue a phase to run before the next question. Call from on.beforeQuestion. */
  enqueue(p: QueuedPhase) { this.queue.push(p); }
  /** End the current phase now. */
  skipPhase() { const end = this.phaseEnd; if (end) { clearTimeout(this.phaseTimer); this.phaseEnd = null; end(); } }
  addPoints(id: string, n: number, why?: string) {
    const p = this.players.get(id); if (!p) return;
    p.score = Math.max(0, Math.round(p.score + n));
    this.record('points', { id, n, why });
  }
  rank() { return this.list.sort((a, b) => b.score - a.score); }
  chat(text: string) { this.io.send(null, { t: 'chat', from: null, name: '', text }); }
  fx(to: string | null, kind: string, data?: any, f?: string) { this.io.send(to, { t: 'fx', kind, data, f }); }
  record(ev: string, d?: any) { this.log.push({ t: this.now(), ev, d }); if (this.log.length > 500) this.log.splice(0, 100); }

  emit<E extends keyof GameEvents>(ev: E, e: GameEvents[E]) {
    this.record(ev, ev === 'answer' ? { id: (e as any).player.id, grade: (e as any).grade, ms: (e as any).ms } : undefined);
    for (const f of FEATURES) {
      const h = f.on?.[ev];
      if (h && this.isActive(f)) this.guard(`${f.id}.${ev}`, () => h(this, e));
    }
  }

  /** Feature code never crashes the room: errors are logged and shown in chat when ?debug. */
  guard(where: string, fn: () => void) {
    try { fn(); } catch (err: any) {
      this.record('error', { where, msg: String(err?.stack ?? err) });
      console.error(where, err);
      this.fx(null, 'error', { where, msg: String(err?.message ?? err) });
    }
  }

  private initFeatures() {
    for (const f of FEATURES) if (f.init) this.guard(`${f.id}.init`, () => (this.f[f.id] = f.init!(this)));
  }

  // ───────────── players ─────────────
  /** Who created the room: gets the leader role back when they reconnect. */
  hostId: string | null = null;
  join(id: string, name: string, bot = false) {
    name = name.trim().slice(0, 20) || 'Joueur';
    let p = this.players.get(id);
    if (p) { p.connected = true; p.name = name; }
    else {
      p = { id, name, score: 0, connected: true, bot, joinedAt: this.now(), color: this.freeColor() };
      this.players.set(id, p);
      this.chat(`${name} a rejoint la partie`);
      this.fx(null, 'join', { id });
    }
    if (!bot && !this.hostId) this.hostId = id;
    if (!bot && (id === this.hostId || !this.leaderId || !this.players.get(this.leaderId)?.connected)) this.leaderId = id; // host gets the lead back
    this.emit('playerJoin', { player: p });
    this.io.sync();
    return p;
  }

  /** Leader hands the host role to another connected human (also keeps it when that player reconnects). */
  makeHost(by: string, id: string) {
    const p = this.players.get(id);
    if (by !== this.leaderId || !p || p.bot || !p.connected || id === by) return;
    this.leaderId = this.hostId = id; this.chat(`👑 ${p.name} est maintenant l'hôte`); this.io.sync();
  }
  /** Leader removes a player for good (Room closes their sockets and refuses them). */
  kick(id: string) { const p = this.players.get(id); if (!p) return; this.leave(id); this.players.delete(id); this.chat(`🚫 ${p.name} a été expulsé`); this.io.sync(); }

  leave(id: string) {
    const p = this.players.get(id); if (!p) return;
    p.connected = false;
    if (this.status === 'lobby') this.players.delete(id);
    if (this.leaderId === id) this.leaderId = this.humans.find(h => h.connected)?.id ?? null;
    this.chat(`${p.name} est parti`);
    this.fx(null, 'leave', { id });
    this.emit('playerLeave', { player: p });
    if (!this.humans.some(h => h.connected)) this.stop();
    this.io.sync();
  }

  // ───────────── flow ─────────────
  start() {
    if (this.status === 'playing') return;
    const packs = this.packQuestions();
    if (!packs.length) return this.fx(this.leaderId, 'error', { msg: 'Aucun pack sélectionné' });
    for (const p of this.list) p.score = 0;
    this.status = 'playing'; this.round = 0; this.winners = []; this.used.clear(); this.history = []; this.forced = []; this.prepared = []; this.prepGen++;
    this.initFeatures();
    this.emit('gameStart', {});
    this.nextRound();
  }

  stop() {
    this.clearPhase();
    this.status = 'lobby'; this.phase = null; this.question = null; this.reveal = null; this.found.clear();
    for (const [id, p] of this.players) if (!p.connected || p.bot) this.players.delete(id);
    this.emit('backToLobby', {});
    this.io.sync();
  }

  endGame(winners = [this.rank()[0]?.id].filter(Boolean) as string[]) {
    if (this.status !== 'playing') return;
    this.status = 'ended'; this.winners = winners; this.question = null;
    this.emit('gameEnd', { winners });
    this.setPhase('podium', 8000, undefined, () => this.stop());
  }

  /** End the game once the current reveal is over (so the last answer is always shown). */
  endAfterReveal(winners: string[]) { if (this.phase?.name === 'reveal' || this.phase?.name === 'question') this.pendingEnd = winners; else this.endGame(winners); }
  private pendingEnd: string[] | null = null;

  private nextRound() {
    if (this.status !== 'playing') return;
    if (this.pendingEnd) { const w = this.pendingEnd; this.pendingEnd = null; return this.endGame(w); }
    this.queue = []; this.reveal = null; this.question = null; this.found.clear();
    this.emit('beforeQuestion', {});
    this.runQueue();
  }

  private runQueue() {
    if (this.status !== 'playing') return;
    const p = this.queue.shift();
    if (!p) return this.startQuestion();
    this.setPhase(p.name, p.ms, p.data, () => {
      p.onEnd?.();
      this.emit('phaseEnd', { name: p.name, data: p.data });
      this.runQueue();
    });
  }

  private prepared: Question[] = [];
  private prepGen = 0; private preparing = false;
  static AHEAD = 4; // questions resolved (images downloaded server-side + preloaded by clients) in advance
  private mediaFails = new Set<string>();

  /** Next playable question: forced ones first, then the preloaded one, then random picks (unusable ones skipped). */
  private async nextQuestion(usePrepared = true): Promise<Question | null> {
    if (usePrepared && !this.forced.length && this.prepared.length) { const q = this.prepared.shift()!; this.prepareAhead(); return q; }
    for (let i = 0; i < 10; i++) {
      const c = this.forced.shift() ?? this.pick();
      if (!c) return null;
      const ok = this.io.prepare ? await this.io.prepare(c).catch(() => c) : c;
      if (ok) return ok;
      this.record('skip', { key: c.key, src: c.src });
    }
    return null;
  }

  /** Keep AHEAD questions resolved in advance (one at a time) and tell clients to preload their images. */
  private async prepareAhead() {
    if (this.preparing) return;
    this.preparing = true; const gen = this.prepGen;
    try {
      while (this.status === 'playing' && gen === this.prepGen && this.prepared.length < Game.AHEAD) {
        const q = await this.nextQuestion(false);
        if (!q || gen !== this.prepGen || this.status !== 'playing') break;
        this.prepared.push(q);
        if (q.type === 'image' && q.src) this.fx(null, 'preload', { src: q.src });
      }
    } finally { this.preparing = false; }
  }

  /** Every connected human failed to load the media → replace the question silently. */
  mediaError(id: string) {
    if (this.phase?.name !== 'question' || !this.question) return;
    this.mediaFails.add(id);
    const humans = this.humans.filter(h => h.connected);
    if (!humans.every(h => this.mediaFails.has(h.id))) return;
    this.record('skip', { key: this.question.key, reason: 'media failed on clients' });
    for (const [pid, f] of this.found) { const p = this.players.get(pid); if (p) p.score -= f.points; }
    this.round--; this.history.pop();
    this.clearPhase();
    this.startQuestion();
  }

  private async startQuestion() {
    const q = await this.nextQuestion();
    if (this.status !== 'playing') return;
    if (!q) return this.endGame();
    this.mediaFails.clear();
    this.question = q; this.round++; this.history.push(q); this.found.clear(); this.guesses.clear(); this.foundText.clear(); this.gaveUp.clear();
    this.setPhase('question', (q.time || this.setting<number>('answerTime')) * 1000, undefined, () => this.endQuestion());
    this.emit('questionStart', {});
    this.prepareAhead();
  }

  private endQuestion() {
    const q = this.question!;
    this.emit('questionEnd', {});
    if (this.status !== 'playing') return; // a feature ended the game
    this.reveal = {
      answer: q.answer, src: q.type === 'image' ? q.src : undefined, explain: q.explain,
      finders: [...this.found].map(([id, f]) => ({ id, ...f })).sort((a, b) => a.ms - b.ms),
    };
    const names = this.reveal.finders.map(f => `${this.players.get(f.id)?.name ?? '?'} (${(f.ms / 1000).toFixed(3)} s)`);
    this.chat(`✅ ${q.answer}${names.length ? ` — trouvé par ${names.join(', ')}` : ' — personne n\'a trouvé'}`);
    // reveal: every finder's bubble shows exactly what they typed (later messages replace it)
    for (const [pid, t] of this.foundText) this.guesses.set(pid, { text: t, after: false });
    this.setPhase('reveal', this.setting<number>('revealTime') * 1000, undefined, () => this.nextRound());
    this.prepareAhead();
  }

  pack(id: string) { return PACKS[id] ?? this.extra[id]; }
  packExists(id: string) { return !!PACKS[id] || this.libraryIds.has(id) || /^-?(u|w|fw)-[A-Za-z0-9-]{1,60}$/.test(id) || (id.startsWith('-g:') && id.length < 200); }

  private packQuestions(): Question[] {
    const ids: string[] = this.setting('packs') ?? [];
    const max = Number(this.setting('maxDifficulty') ?? 3);
    const off = new Set(ids.filter(x => x.startsWith('-g:')));
    return ids.flatMap(id => [...(this.pack(id)?.questions ?? []), ...(this.extra['+' + id]?.questions ?? [])].filter(q => !off.has(`-g:${id}:${q.group}`))).filter(q => (q.difficulty || 1) <= max);
  }

  private pick(): Question | null {
    const all = this.packQuestions();
    let pool = all.filter(q => !this.used.has(q.key));
    if (!pool.length) { this.used.clear(); pool = all; }
    const q = pool[Math.floor(Math.random() * pool.length)];
    if (q) this.used.add(q.key);
    return q ?? null;
  }

  setPhase(name: string, ms: number, data: any, onEnd: () => void) {
    this.clearPhase();
    const now = this.now();
    this.phase = { name, startedAt: now, endsAt: now + ms, data };
    this.phaseEnd = onEnd;
    this.phaseTimer = setTimeout(() => { this.phaseEnd = null; this.guard(`phase:${name}`, onEnd); }, ms);
    this.io.sync();
  }

  private clearPhase() {
    clearTimeout(this.phaseTimer); this.phaseEnd = null;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  // ───────────── answers ─────────────
  /** Smallest colour slot nobody in the room uses: the 12 rainbow hues are all taken before any variant. */
  private freeColor() { const used = new Set([...this.players.values()].map(p => p.color)); let i = 0; while (used.has(i)) i++; return i; }

  private visibleGuess(pid: string, viewer: string | null) {
    const g = this.guesses.get(pid);
    if (!g) return undefined;
    // no spoilers: a finder's messages stay hidden from players who haven't found yet (until the reveal)
    if (g.after && this.phase?.name === 'question' && pid !== viewer && !(viewer && this.found.has(viewer))) return undefined;
    return g.text;
  }

  /** Free text in the player's bubble (after finding, or during the reveal). Hidden from players still searching. */
  say(id: string, text: string) {
    const ph = this.phase?.name;
    if (!this.players.get(id) || (ph !== 'reveal' && !(ph === 'question' && this.found.has(id)))) return;
    const t = text.trim().slice(0, 120);
    if (!t) return;
    this.guesses.set(id, { text: t, after: true });
    if (ph === 'question') this.io.bubble?.(id, t, [...this.found.keys()]); // finders only (no spoilers); reveal lines are already chat
    this.io.sync();
  }

  answer(id: string, text: string) {
    const p = this.players.get(id);
    const q = this.question;
    if (!p || !q || this.phase?.name !== 'question') return;
    const prev = this.found.get(id);
    if (prev?.grade === 'exact') return this.say(id, text); // already found: the answer box becomes a bubble
    if (text.trim() === '//') { // give up on this question; if everyone still searching gives up → reveal now
      this.gaveUp.add(id); this.guesses.set(id, { text: '💀 abandon', after: false }); this.io.bubble?.(id, '💀 abandon', null);
      if (this.active.every(pl => this.found.get(pl.id)?.grade === 'exact' || this.gaveUp.has(pl.id))) this.skipPhase(); else this.io.sync();
      return;
    }
    const grade = judge(text, q);
    if (!grade) {
      this.fx(id, 'answer', { ok: false });
      this.guesses.set(id, { text: text.trim().slice(0, 120), after: !!prev });
      this.io.bubble?.(id, text.trim().slice(0, 120), null);
      this.emit('wrongAnswer', { player: p, text });
      this.io.sync();
      return;
    }
    if (prev && GRADE_RANK[prev.grade] >= GRADE_RANK[grade]) return this.fx(id, 'answer', { ok: false, already: true });
    const ms = this.now() - this.phase.startedAt;
    const ctx = this.score(p, grade, ms);
    const points = Math.round(ctx.points);
    const delta = Math.max(0, points - (prev?.points ?? 0));
    p.score += delta;
    this.found.set(id, { grade, ms, points: Math.max(points, prev?.points ?? 0) });
    this.guesses.delete(id);
    this.foundText.set(id, text.trim().slice(0, 120)); // shown in the bubble at the reveal
    this.fx(id, 'answer', { ok: true, grade, delta, notes: ctx.notes });
    this.fx(null, 'found', { id, grade });
    this.emit('answer', { player: p, grade, ms, points, delta });
    if (this.active.every(pl => this.found.has(pl.id) || this.gaveUp.has(pl.id))) this.skipPhase(); // everyone found (or gave up) → reveal now
    this.io.sync();
  }

  /** Runs the score pipeline. Public so features can preview a score. */
  score(player: Player, grade: Grade, ms: number): ScoreCtx {
    const ctx: ScoreCtx = { player, grade, ms, base: 0, mult: 1, points: 0, notes: [] };
    for (const s of SCORE_STEPS) if (this.isActive(s.f)) this.guard(`${s.f.id}.score`, () => s.apply(this, ctx));
    return ctx;
  }

  // ───────────── client commands ─────────────
  patchSettings(by: string, patch: Record<string, any>) {
    if (by !== this.leaderId || this.status === 'playing') return;
    for (const [k, v] of Object.entries(patch)) {
      const d = SETTING_DEFS.find(x => x.key === k); if (!d) continue;
      if (d.type === 'number') this.settings[k] = Math.min(d.max ?? Infinity, Math.max(d.min ?? -Infinity, Number(v) || 0));
      else if (d.type === 'bool') this.settings[k] = !!v;
      else if (d.type === 'packs') this.settings[k] = (Array.isArray(v) ? v : []).filter((id: string) => this.packExists(id));
      else if (d.options?.some(o => o.value === v)) this.settings[k] = v;
    }
    this.io.sync();
  }

  action(by: string, fid: string, a: string, payload: any) {
    const f = FEATURES.find(x => x.id === fid);
    const h = f?.actions?.[a];
    if (!f || !h || !this.isActive(f) || !this.players.has(by)) return;
    this.record('action', { by, f: fid, a, payload });
    this.guard(`${fid}.action.${a}`, () => h(this, by, payload));
    this.io.sync();
  }

  // ───────────── view ─────────────
  view(me: string): PublicState {
    const q = this.question;
    const f: Record<string, any> = {};
    for (const ft of FEATURES) if (ft.view && this.isActive(ft)) this.guard(`${ft.id}.view`, () => (f[ft.id] = ft.view!(this, me)));
    return {
      code: this.code, now: this.now(), me, status: this.status, phase: this.phase, round: this.round,
      question: q && publicQuestion(q, this.setting('mediaEffects') !== false, this.setting<string>('imageReveal') ?? 'none'),
      reveal: this.reveal,
      players: this.list.map(p => ({
        id: p.id, name: p.name, score: p.score, connected: p.connected, bot: p.bot, color: p.color,
        leader: p.id === this.leaderId, found: this.found.get(p.id) ?? null,
        guess: this.visibleGuess(p.id, me), av: this.avatarVersion.get(p.id),
      })),
      settings: this.settings, winners: this.winners, f,
    };
  }
}
