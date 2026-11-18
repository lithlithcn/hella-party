import { useEffect, useRef } from 'preact/hooks';
import type { PublicQuestion } from '../../shared/protocol';

export default function Audio({ q }: { q: PublicQuestion }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { ref.current?.play().catch(() => {}); }, [q.id]);
  return (
    <div class="q-audio">
      <div class="q-audio-wave">{Array.from({ length: 12 }, (_, i) => <i style={{ animationDelay: `${i * 0.08}s` }} />)}</div>
      <audio ref={ref} src={q.src} controls />
    </div>
  );
}
