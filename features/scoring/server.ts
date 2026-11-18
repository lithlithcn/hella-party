// Base score: precision × speed. Everything else that touches points runs after this (order > 0).
import { defineFeature } from '../../server/feature';

export default defineFeature({
  id: 'scoring',
  settings: [
    { key: 'exact', label: 'Points : réponse exacte', type: 'number', default: 10, min: 1, max: 100 },
    { key: 'partial', label: 'Points : réponse partielle', type: 'number', default: 6, min: 0, max: 100 },
    { key: 'approx', label: 'Points : petite faute', type: 'number', default: 3, min: 0, max: 100 },
    { key: 'speed', label: 'Bonus de vitesse (×2 → ×1)', type: 'bool', default: true },
  ],
  score: [{
    order: 0,
    apply(g, ctx) {
      ctx.base = g.setting<number>(`scoring.${ctx.grade}`);
      const T = (g.question?.time || g.setting<number>('answerTime')) * 1000;
      ctx.mult = g.setting('scoring.speed') ? 2 - Math.min(1, ctx.ms / T) : 1;
      ctx.points = ctx.base * ctx.mult * (g.question?.points ?? 1);
    },
  }],
});
