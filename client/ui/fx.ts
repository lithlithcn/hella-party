// Visual impact when someone finds the answer: hue kick, flash, shockwave, shake, particle burst.
// Pure DOM/CSS (see "impact" section in style.css). strength 0..1.
const root = document.documentElement;
let kick = 0;

export function impact(strength = 1, origin?: Element | null, color?: string) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) strength *= 0.3;
  // background hue jumps and settles (CSS transition on --kick)
  kick = (kick + 40 + 80 * strength) % 360;
  root.style.setProperty('--kick', `${kick}deg`);
  root.style.setProperty('--pulse', String(strength));
  restart(document.body, strength > 0.7 ? 'impact-big' : 'impact');

  const r = origin?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth / 2;
  const y = r ? r.top + r.height / 2 : innerHeight / 2;
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.style.setProperty('--x', `${x}px`);
  layer.style.setProperty('--y', `${y}px`);
  layer.style.setProperty('--c', color ?? 'var(--lime)');
  layer.style.setProperty('--s', String(strength));
  let html = '<i class="fx-flash"></i><i class="fx-ring"></i><i class="fx-ring r2"></i>';
  const n = Math.round(14 + 30 * strength);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = (120 + Math.random() * 380) * (0.5 + strength);
    html += `<b style="--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d).toFixed(0)}px;--h:${Math.floor(Math.random() * 360)};--d:${(0.5 + Math.random() * 0.7).toFixed(2)}s"></b>`;
  }
  layer.innerHTML = html;
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1400);
}

function restart(el: HTMLElement, cls: string) {
  el.classList.remove('impact', 'impact-big');
  void el.offsetWidth; // reflow so the animation restarts
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), 700);
}
