// Game sounds: files in client/public/sfx/<id>.mp3, overridable per device from the Studio ("Sons du jeu").
import { db } from './db';

export const SOUND_EVENTS = [
  { id: 'start', label: 'Démarrer la partie' },
  { id: 'media', label: 'Une question apparaît' },
  { id: 'correct', label: 'Bonne réponse' },
  { id: 'wrong', label: 'Mauvaise réponse' },
  { id: 'select', label: 'Un autre joueur trouve / clic' },
  { id: 'tick', label: '5 dernières secondes (chaque seconde)' },
  { id: 'spawn', label: 'Révélation de la réponse' },
  { id: 'join', label: 'Un joueur rejoint' },
  { id: 'chat', label: 'Message du chat' },
  { id: 'invalid', label: 'Action impossible / erreur' },
  { id: 'victory', label: 'Victoire' },
  { id: 'clap1', label: 'Applaudissements 1' },
  { id: 'clap2', label: 'Applaudissements 2' },
  { id: 'clap3', label: 'Applaudissements 3' },
  { id: 'bonus', label: 'Bonus / avantage' },
  { id: 'counter', label: 'Contre' },
  { id: 'h3inStack', label: 'H3in : charge' },
  { id: 'heavyHit', label: 'Gros coup' },
  { id: 'explosion', label: 'Explosion' },
  { id: 'musicLobby', label: 'Musique du lobby (boucle)', music: true },
  { id: 'musicGame', label: 'Musique pendant la partie (boucle)', music: true },
] as const;
export type SoundId = (typeof SOUND_EVENTS)[number]['id'] | (string & {});

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
const overrides = new Map<string, string>(); // id → blob URL
const DEFAULTS = new Set<string>(SOUND_EVENTS.filter(e => !('music' in e)).map(e => e.id));

export const volume = {
  get: () => +(localStorage.getItem('hp.vol') ?? 0.7),
  set: (v: number) => { localStorage.setItem('hp.vol', String(v)); if (music) music.volume = v * 0.5; },
};

function ac() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
addEventListener('pointerdown', () => ac(), { once: true });
addEventListener('keydown', () => ac(), { once: true });

const url = (id: string) => overrides.get(id) ?? (DEFAULTS.has(id) ? `/sfx/${id}.mp3` : null);

function load(id: string) {
  let p = buffers.get(id);
  if (!p) {
    const u = url(id);
    p = u ? fetch(u).then(r => r.arrayBuffer()).then(b => ac().decodeAudioData(b)).catch(() => null) : Promise.resolve(null);
    buffers.set(id, p);
  }
  return p;
}

export async function play(id: SoundId, gain = 1) {
  const v = volume.get() * gain;
  if (v <= 0) return;
  const buf = await load(id);
  if (!buf) return;
  const c = ac(), src = c.createBufferSource(), g = c.createGain();
  g.gain.value = v;
  src.buffer = buf;
  src.connect(g).connect(c.destination);
  src.start();
}

export const playRandom = (...ids: SoundId[]) => play(ids[Math.floor(Math.random() * ids.length)]);

let music: HTMLAudioElement | null = null, musicId = '';
/** Loop a music event (only if the player set one in the Studio). Pass null to stop. */
export function setMusic(id: SoundId | null) {
  if (id === musicId) return;
  musicId = id ?? '';
  music?.pause(); music = null;
  const u = id && overrides.get(id);
  if (!u) return;
  music = new Audio(u); music.loop = true; music.volume = volume.get() * 0.5;
  music.play().catch(() => addEventListener('pointerdown', () => music?.play(), { once: true }));
}

/** Load this device's overrides (Studio → Sons du jeu → "utiliser sur cet appareil"). */
export async function loadOverrides() {
  try {
    const set: Record<string, true> | undefined = await db.get('kv', 'soundOverrides');
    for (const u of overrides.values()) URL.revokeObjectURL(u);
    overrides.clear(); buffers.clear();
    for (const id of Object.keys(set ?? {})) {
      const blob: Blob | undefined = await db.get('files', `sound/${id}`);
      if (blob) overrides.set(id, URL.createObjectURL(blob));
    }
  } catch { /* IndexedDB unavailable (private mode): defaults only */ }
}
loadOverrides();

// Back-compat helpers used by the core UI
export const sfx = {
  correct: () => play('correct'),
  partial: () => play('correct', 0.7),
  wrong: () => play('wrong', 0.8),
  other: () => play('select', 0.6),
  start: () => play('media'),
  tick: () => play('tick'),
  win: () => { play('victory'); playRandom('clap1', 'clap2', 'clap3'); },
};
