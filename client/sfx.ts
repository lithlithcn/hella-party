// Sounds synthesized in code (WebAudio) — no audio files.
let ctx: AudioContext | null = null;

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0) {
  ctx ??= new AudioContext();
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
}

export const sfx = {
  correct() { tone(660, 0.12, 'triangle'); tone(990, 0.18, 'triangle', 0.15, 0.08); },
  partial() { tone(520, 0.15, 'triangle'); },
  wrong() { tone(160, 0.15, 'square', 0.06); },
  other() { tone(1200, 0.06, 'sine', 0.05); },
  start() { tone(440, 0.08, 'sine', 0.08); },
  tick() { tone(880, 0.04, 'sine', 0.04); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, i * 0.12)); },
};
