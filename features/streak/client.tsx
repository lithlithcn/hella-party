// x1, x2, x3… combo badge on player cards. Colour climbs the spectrum; each new level replays a
// one-shot animation whose strength grows with the combo (no infinite animations: weak phones).
import type { ClientFeature } from '../../client/feature';

const HUES = [200, 170, 130, 85, 50, 30, 10, 340, 300, 275];
export const comboStyle = (n: number) => {
  const h = HUES[Math.min(n, HUES.length) - 1];
  const lvl = Math.min(n, 10);
  return { '--ch': h, '--cs': 1 + lvl * 0.05, '--cr': `${lvl * 1.5}deg`, '--cg': `${4 + lvl * 2}px` } as Record<string, any>;
};

export default {
  id: 'streak',
  PlayerCard({ s, p }) {
    const n: number = s.f.streak?.[p.id] ?? 0;
    if (n < 1) return null;
    return (
      <div key={n} class={`combo lv${Math.min(Math.ceil(n / 2), 5)}`} style={comboStyle(n)}>
        {n >= 3 && <span class="cfire">🔥</span>}x{n}
      </div>
    );
  },
} satisfies ClientFeature;
