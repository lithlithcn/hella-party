// Combo: consecutive questions answered exactly. Display only (x1, x2, x3… on the player card).
import { defineFeature } from '../../server/feature';

interface S { n: Record<string, number>; base: Record<string, number> }

export default defineFeature<S>({
  id: 'streak',
  init: () => ({ n: {}, base: {} }),
  on: {
    questionStart(g) { const s: S = g.f.streak; s.base = { ...s.n }; },
    answer(g, e) {
      if (e.grade !== 'exact') return;
      const s: S = g.f.streak, id = e.player.id;
      s.n[id] = (s.base[id] ?? 0) + 1;
      const n = s.n[id];
      g.fx(null, 'streak', { id, n }, 'streak');
      if (n >= 5 && n % 5 === 0) g.chat(`🔥 ${e.player.name} enchaîne ${n} bonnes réponses !`);
    },
    questionEnd(g) {
      const s: S = g.f.streak;
      for (const p of g.list) if (g.found.get(p.id)?.grade !== 'exact') {
        if ((s.n[p.id] ?? 0) >= 5) g.chat(`💔 Fin de la série de ${p.name} (x${s.n[p.id]})`);
        delete s.n[p.id];
      }
    },
  },
  view: g => (g.f.streak as S).n,
});
