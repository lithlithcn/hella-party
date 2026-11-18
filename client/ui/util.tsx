import { useEffect, useState } from 'preact/hooks';
import { serverNow, store } from '../store';

/** Re-render every `ms` while `on`; returns server time. */
export function useNow(ms = 100, on = true) {
  const [, bump] = useState(0);
  useEffect(() => { if (!on) return; const t = setInterval(() => bump(x => x + 1), ms); return () => clearInterval(t); }, [ms, on]);
  return serverNow();
}

export const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/** 12 clearly different rainbow hues first; slots 12+ reuse them as lighter / darker / pastel variants. */
const RAINBOW = [0, 28, 52, 85, 125, 165, 190, 215, 245, 275, 300, 330];
const VARIANTS: [number, number][] = [[90, 64], [80, 80], [70, 48], [45, 72]]; // [saturation, lightness]
export function slotColor(slot: number, dl = 0) {
  const [s, l] = VARIANTS[Math.floor(slot / RAINBOW.length) % VARIANTS.length];
  return `hsl(${RAINBOW[slot % RAINBOW.length]} ${s}% ${l + dl}%)`;
}
/** Colour of a player in this room (falls back to a hash for people who left). */
export function playerColor(id: string, dl = 0) {
  const p = store.s?.players.find(x => x.id === id);
  return p ? slotColor(p.color, dl) : `hsl(${hue(id)} 85% ${68 + dl}%)`;
}

export function Avatar({ name, id, size = 44, src }: { name: string; id: string; size?: number; src?: string | null }) {
  const img = src !== undefined ? src : store.avatars[id];
  if (img) return <img class="avatar" src={img} alt="" style={{ width: `${size}px`, height: `${size}px` }} />;
  const c1 = playerColor(id, -4), c2 = playerColor(id, -16);
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div class="avatar" style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px`, background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
      {initials}
    </div>
  );
}

export function Logo({ big }: { big?: boolean }) {
  return (
    <div class={`logo ${big ? 'big' : ''}`} aria-label="Hella Party">
      <span class="logo-star" />
      <span class="logo-a">HELLA</span>
      <span class="logo-b">PARTY</span>
    </div>
  );
}

export const fmtMs = (ms: number) => `${(ms / 1000).toFixed(3)} s`;
