// Win condition: first to reach the goal score at the end of a question.
import { defineFeature } from '../../server/feature';

export default defineFeature({
  id: 'goal',
  settings: [{ key: 'score', label: 'Score pour gagner', type: 'number', default: 100, min: 10, max: 2000, step: 10 }],
  on: {
    questionEnd(g) {
      const goal = g.setting<number>('goal.score');
      const top = g.rank()[0];
      if (top && top.score >= goal) g.endAfterReveal(g.list.filter(p => p.score === top.score).map(p => p.id));
    },
  },
});
