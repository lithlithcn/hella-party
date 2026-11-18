import type { QProps } from './common';

export default function Text({ q }: QProps) {
  return <div class="q-text">{q.text}</div>;
}
