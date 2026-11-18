// Every message between client and server. Single source of truth for the wire format.

export type Grade = 'exact' | 'partial' | 'approx';
export const GRADE_RANK: Record<Grade, number> = { approx: 1, partial: 2, exact: 3 };

export interface SettingDef {
  key: string;            // core keys are plain ("answerTime"), feature keys are "<featureId>.<key>"
  label: string;
  type: 'number' | 'bool' | 'select' | 'packs';
  default: any;
  min?: number; max?: number; step?: number;
  options?: { value: any; label: string }[];
  feature?: string;       // owning feature id, for grouping in the settings UI
  dev?: boolean;          // hidden unless the client runs with ?debug
}

import type { MediaOpts } from './pack';

/** A question as players see it: everything except the answers. */
export interface PublicQuestion {
  id: string;
  type: string;           // matches client/question-types/<type>.tsx
  prompt: string;
  src?: string;
  text?: string;
  opts?: MediaOpts;
  hint?: string;          // client shows it at half time
  points?: number;
  difficulty?: number;
  tags?: string[];
  effect?: string;
  script?: string;
  assets?: string;        // base URL of the pack media (for scripts)
  data?: any;
}

export interface Found { grade: Grade; ms: number; points: number }

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  bot: boolean;
  leader: boolean;
  found: Found | null;    // for the current question
}

export interface Phase { name: string; startedAt: number; endsAt: number; data?: any }

export interface PublicState {
  code: string;
  now: number;            // server clock, for client offset
  me: string;
  status: 'lobby' | 'playing' | 'ended';
  phase: Phase | null;
  round: number;
  question: PublicQuestion | null;
  reveal: { answer: string; src?: string; explain?: string; finders: ({ id: string } & Found)[] } | null;
  players: PublicPlayer[];
  settings: Record<string, any>;
  winners: string[];
  f: Record<string, any>; // per-feature public slices (feature.view)
}

export interface PackInfo { id: string; name: string; count: number }

export type ClientMsg =
  | { t: 'hello'; id: string; name: string }
  | { t: 'answer'; text: string }
  | { t: 'chat'; text: string }
  | { t: 'start' }
  | { t: 'stop' }
  | { t: 'settings'; patch: Record<string, any> }
  | { t: 'action'; f: string; a: string; p?: any };

export type ServerMsg =
  | { t: 'welcome'; defs: SettingDef[]; packs: PackInfo[] }
  | { t: 'state'; s: PublicState }
  | { t: 'chat'; from: string | null; name: string; text: string }
  | { t: 'fx'; kind: string; f?: string; data?: any } // transient: sounds, feedback, animations
  | { t: 'err'; msg: string };
