// Contract every server-side feature implements. A feature = one folder in /features with a server.ts
// that default-exports defineFeature({...}). scripts/gen.mjs registers it automatically.
import type { Grade, SettingDef } from '../shared/protocol';
import type { Game, Player } from './engine';

/** Events emitted by the engine, in the order they happen during a game. */
export interface GameEvents {
  playerJoin: { player: Player };
  playerLeave: { player: Player };
  gameStart: {};
  beforeQuestion: {};                 // enqueue interlude phases here (prep, minigame…) or force a question
  phaseEnd: { name: string; data?: any }; // fired for custom phases you enqueued
  questionStart: {};
  answer: { player: Player; grade: Grade; ms: number; points: number; delta: number };
  wrongAnswer: { player: Player; text: string };
  questionEnd: {};                    // scores for the question are final; may call g.endGame()
  gameEnd: { winners: string[] };
  backToLobby: {};
}

/** Mutable context passed through every feature's score steps, in ascending `order`. */
export interface ScoreCtx {
  player: Player;
  grade: Grade;
  ms: number;          // time since question start
  base: number;        // set by the scoring feature
  mult: number;        // speed multiplier, set by the scoring feature
  points: number;      // what the player will be credited (for this grade); later steps may change it
  notes: string[];     // human-readable modifiers ("×2 Double"), shown in the reveal
}

export interface ServerFeature<S = any> {
  id: string;
  /** Settings shown in the room settings panel. Keys are auto-prefixed with "<id>.". */
  settings?: Omit<SettingDef, 'feature'>[];
  /** Whether the feature runs in this room. Default: always on. Typically reads an "enabled" setting. */
  active?(g: Game): boolean;
  /** Initial state slice, stored in g.f[id]. Called on room creation and on each game start. */
  init?(g: Game): S;
  on?: { [E in keyof GameEvents]?: (g: Game, e: GameEvents[E]) => void };
  score?: { order: number; apply(g: Game, ctx: ScoreCtx): void }[];
  /** Client-callable actions: send({t:'action', f:id, a:name, p}). */
  actions?: Record<string, (g: Game, playerId: string, payload: any) => void>;
  /** Public slice for one viewer → state.f[id]. Hide secrets per viewer here. */
  view?(g: Game, viewerId: string): any;
}

export const defineFeature = <S>(f: ServerFeature<S>) => f;
