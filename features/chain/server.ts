// Enchaînement: once everyone (connected humans) has found the same N questions, those N come back
// as a quick-fire bonus round, one after another, with a short timer.
import { defineFeature } from '../../server/feature';
import type { Question } from '../../server/packs';

interface S { pool: Question[]; run: { keys: string[]; i: number } | null }

export default defineFeature<S>({
  id: 'chain',
  settings: [
    { key: 'enabled', label: 'Enchaînement bonus', type: 'bool', default: false },
    { key: 'size', label: 'Questions à enchaîner', type: 'number', default: 5, min: 3, max: 10, step: 1 },
    { key: 'time', label: 'Temps par question (s)', type: 'number', default: 7, min: 3, max: 20, step: 1 },
  ],
  active: g => g.setting('chain.enabled') === true,
  init: () => ({ pool: [], run: null }),
  on: {
    beforeQuestion(g) {
      const s: S = g.f.chain, n = g.setting<number>('chain.size');
      if (s.run || s.pool.length < n) return;
      const qs = s.pool.splice(0, n);
      s.run = { keys: qs.map(q => q.key), i: 0 };
      const time = g.setting<number>('chain.time');
      g.forced.push(...qs.map(q => ({ ...q, time })));
      g.enqueue({ name: 'chain.intro', ms: 3500, data: { n } });
      g.fx(null, 'chain', { n }, 'chain');
    },
    questionStart(g) {
      const s: S = g.f.chain;
      if (s.run && s.run.keys.includes(g.question!.key)) s.run.i++;
    },
    questionEnd(g) {
      const s: S = g.f.chain, q = g.question;
      if (!q) return;
      if (s.run) {
        if (s.run.i >= s.run.keys.length && !g.forced.length) { s.run = null; g.chat('⚡ Enchaînement terminé !'); }
        return;
      }
      const humans = g.active.filter(p => !p.bot);
      if (humans.length && humans.every(p => g.found.get(p.id)?.grade === 'exact')) s.pool.push(q);
    },
  },
  view: g => { const s: S = g.f.chain; return { run: s.run && { i: s.run.i, n: s.run.keys.length }, pool: s.pool.length }; },
});
