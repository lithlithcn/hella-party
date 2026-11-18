import type { PublicQuestion } from '../../shared/protocol';

export default function Image({ q }: { q: PublicQuestion }) {
  return <img class="q-image" src={q.src} alt="" draggable={false} />;
}
