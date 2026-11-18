import type { QProps } from './common';

export default function Text({ q }: QProps) {
  return (
    <div class="q-textbox">
      <div class="q-text">{q.text}</div>
      {q.data?.clue && <div class="q-clue">{q.data.clue}</div>}
    </div>
  );
}
