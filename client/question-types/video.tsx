import { useEffect, useRef } from 'preact/hooks';
import { clipMedia, type QProps, useProgress, visualStyle } from './common';

export default function Video({ q, phase, clear }: QProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const o = q.opts ?? {};
  const progress = useProgress(phase, !!o.reveal && o.reveal !== 'none', clear);
  const v = visualStyle(o, progress, clear);
  useEffect(() => (ref.current ? clipMedia(ref.current, o) : undefined), [q.id, q.src, JSON.stringify(o)]);
  const hidden = o.hideVideo && !clear;
  return (
    <div class="q-frame">
      <video ref={ref} class="q-image" src={q.src} playsInline preload="auto" style={hidden ? { display: 'none' } : v.style} />
      {hidden && <div class="q-audio-wave">{Array.from({ length: 14 }, (_, i) => <i style={{ animationDelay: `${i * 0.07}s` }} />)}</div>}
    </div>
  );
}
