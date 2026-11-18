import { useEffect, useRef } from 'preact/hooks';
import { clipMedia, type QProps, reportMediaError } from './common';

export default function Audio({ q, clear }: QProps) {
  const ref = useRef<HTMLAudioElement>(null);
  const o = q.opts ?? {};
  useEffect(() => (ref.current ? clipMedia(ref.current, o, !clear) : undefined), [q.id, q.src, JSON.stringify(o), clear]);
  const replay = () => { const a = ref.current; if (a) { a.currentTime = o.start ?? 0; a.play().catch(() => {}); } };
  return (
    <div class="q-audio">
      <div class="q-audio-wave" onClick={replay} title="Rejouer">{Array.from({ length: 14 }, (_, i) => <i style={{ animationDelay: `${i * 0.07}s` }} />)}</div>
      <audio ref={ref} src={q.src} preload="auto" onError={() => reportMediaError()} />
      <button class="btn ghost small" onClick={replay}>🔁 Réécouter</button>
      {q.text && <div class="q-caption">{q.text}</div>}
    </div>
  );
}
