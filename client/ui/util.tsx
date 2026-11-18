import { useEffect, useState } from 'preact/hooks';
import { serverNow, store } from '../store';

/** Re-render every `ms` while `on`; returns server time. */
export function useNow(ms = 100, on = true) {
  const [, bump] = useState(0);
  useEffect(() => { if (!on) return; const t = setInterval(() => bump(x => x + 1), ms); return () => clearInterval(t); }, [ms, on]);
  return serverNow();
}

export const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

export function Avatar({ name, id, size = 44, src }: { name: string; id: string; size?: number; src?: string | null }) {
  const img = src !== undefined ? src : store.avatars[id];
  if (img) return <img class="avatar" src={img} alt="" style={{ width: `${size}px`, height: `${size}px` }} />;
  const h = hue(id);
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  return (
    <div class="avatar" style={{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.4)}px`, background: `conic-gradient(from ${h}deg, hsl(${h} 90% 60%), hsl(${(h + 60) % 360} 90% 55%), hsl(${h} 90% 60%))` }}>
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

export const fmtMs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
