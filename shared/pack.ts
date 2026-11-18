// Pack file format (content/packs/<id>/pack.json). Written by the Studio, read by the server.
// A pack folder = pack.json + media/ (+ sounds/ for game sound overrides).

export const PACK_FORMAT = 'hella-pack';
export const PACK_VERSION = 1;

export type QuestionType = 'image' | 'audio' | 'video' | 'text' | 'script';

/** Display / playback options. Everything optional; unknown keys are ignored. */
export interface MediaOpts {
  // image & video
  blur?: number;          // px, initial blur
  pixelate?: number;      // 0..1 (0 = none)
  zoom?: number;          // 1 = none, 3 = very zoomed
  zoomX?: number;         // focus point 0..100 (%)
  zoomY?: number;
  grayscale?: boolean;
  invert?: boolean;
  rotate?: number;        // degrees
  flip?: boolean;
  /** Progressive reveal over the question time. */
  reveal?: 'none' | 'unblur' | 'unzoom' | 'unpixelate' | 'spotlight';
  // audio & video
  start?: number;         // seconds
  end?: number;           // seconds (0 = till the end)
  volume?: number;        // 0..1
  loop?: boolean;
  rate?: number;          // playback speed (0.5..2)
  hideVideo?: boolean;    // video as audio only
}

export interface PackQuestion {
  id: string;
  type?: QuestionType;    // default 'image'
  src?: string;           // file in media/ or absolute URL
  text?: string;          // for text questions (or extra caption)
  prompt?: string;        // overrides the pack prompt
  answer: string;         // shown at reveal
  exact: string[];        // accepted full answers (answer is always accepted too)
  partial?: string[];     // accepted partial answers (fewer points)
  tags?: string[];
  difficulty?: number;    // 1..5
  time?: number;          // seconds, overrides the room answer time
  points?: number;        // score multiplier (1 = normal)
  hint?: string;          // shown at half time
  explain?: string;       // shown at reveal
  effect?: string;        // special effect id (features)
  opts?: MediaOpts;
  script?: string;        // JS for type 'script' (see client/question-types/script.tsx)
  data?: any;             // free-form, for scripts and features
}

export interface PackFile {
  format: typeof PACK_FORMAT;
  version: number;
  id: string;
  name: string;
  description?: string;
  author?: string;
  emoji?: string;
  color?: string;
  tags?: string[];
  prompt: string;         // default question text ("Quel est ce pays ?")
  opts?: MediaOpts;       // default display options for every question (merged under question.opts)
  questions: PackQuestion[];
  /** Game sound overrides: event id → file in sounds/. */
  sounds?: Record<string, string>;
}
