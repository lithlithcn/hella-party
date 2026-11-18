import type { PublicQuestion } from '../../shared/protocol';

export default function Text({ q }: { q: PublicQuestion }) {
  return <div class="q-text">{q.text}</div>;
}
