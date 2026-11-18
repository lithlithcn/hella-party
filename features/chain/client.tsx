import type { ClientFeature } from '../../client/feature';
import { play } from '../../client/sfx';

export default {
  id: 'chain',
  Phases: {
    'chain.intro': ({ s }) => (
      <div class="chain-intro">
        <div class="ci-big">⚡ ENCHAÎNEMENT ⚡</div>
        <div class="ci-sub">Tout le monde a trouvé ces {s.phase?.data?.n} questions…<br />Elles reviennent, enchaîne-les vite !</div>
      </div>
    ),
  },
  Hud({ s }) {
    const r = s.f.chain?.run;
    if (!r) return null;
    return <div class="chain-hud">⚡ Enchaînement {r.i}/{r.n}</div>;
  },
  onFx(m) { if (m.kind === 'chain') play('bonus'); },
} satisfies ClientFeature;
