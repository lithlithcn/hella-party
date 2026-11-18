// Debug: fake players that answer automatically, to test alone. Settings visible with ?debug.
import { defineFeature } from '../../server/feature';

const NAMES = ['Bip', 'Boop', 'Zorg', 'Pixel', 'Gizmo', 'Turbo', 'Nova', 'Kiwi'];

export default defineFeature({
  id: 'bots',
  settings: [
    { key: 'count', label: 'Bots', type: 'number', default: 0, min: 0, max: 8, dev: true },
    { key: 'skill', label: 'Réussite des bots (%)', type: 'number', default: 60, min: 0, max: 100, dev: true },
  ],
  active: g => g.setting<number>('bots.count') > 0,
  on: {
    gameStart(g) {
      for (let i = 0; i < g.setting<number>('bots.count'); i++) g.join(`bot-${i}`, `🤖 ${NAMES[i]}`, true);
    },
    questionStart(g) {
      const q = g.question!;
      const T = g.setting<number>('answerTime') * 1000;
      for (const b of g.list.filter(p => p.bot)) {
        const ok = Math.random() * 100 < g.setting<number>('bots.skill');
        g.later(500 + Math.random() * T * 0.8, () => g.answer(b.id, ok ? q.exact[0] : 'zzz'));
      }
    },
  },
});
