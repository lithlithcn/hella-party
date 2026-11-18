import { useEffect, useRef, useState } from 'preact/hooks';
import { type QProps, reportMediaError, useProgress, useSrc, visualStyle } from './common';
import { serverNow } from '../store';

export default function Image({ q, phase, clear }: QProps) {
  const o = q.opts ?? {};
  // unblur / unzoom = ONE CSS transition (GPU, zero re-render). pixelate / spotlight need JS steps (4/s).
  const cssReveal = !!phase && (o.reveal === 'unblur' || o.reveal === 'unzoom');
  const stepped = !cssReveal && !!o.reveal && o.reveal !== 'none';
  const progress = useProgress(phase, stepped, clear);
  const [p0] = useState(() => (phase ? Math.min(1, Math.max(0, (serverNow() - phase.startedAt) / (phase.endsAt - phase.startedAt))) : 0));
  const [go, setGo] = useState(false);
  useEffect(() => { if (cssReveal) { const r = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true))); return () => cancelAnimationFrame(r); } }, [q.id]);
  const v = visualStyle(o, cssReveal ? (go ? 1 : p0) : progress, clear);
  if (cssReveal && go && phase && !clear) {
    const ms = Math.max(0, phase.endsAt - serverNow());
    v.style.transition = `filter ${ms}ms linear, transform ${ms}ms linear`;
  }
  const src = useSrc(q.src);
  const [fallback, setFallback] = useState(false);
  const [dead, setDead] = useState(false);
  useEffect(() => { setFallback(false); setDead(false); }, [src]);
  useEffect(() => { if (src === null) reportMediaError(); }, [src]);
  if (src === null || dead) return <div class="q-frame q-loading">🖼️❓<small>Image indisponible</small></div>;
  if (!src) return <div class="q-frame q-loading">⏳</div>;
  const url = fallback ? src.replace(/\/640px-/, '/330px-') : src;
  return (
    <div class="q-frame q-frame-col">
      {v.pixel > 0.01
        ? <Pixelated src={url} amount={v.pixel} style={v.style} />
        : <img class="q-image" src={url} alt="" draggable={false} decoding="async" style={v.style}
            onError={() => { if (!fallback && /\/640px-/.test(src)) setFallback(true); else { setDead(true); reportMediaError(); } }} />}
      {q.text && <div class="q-caption q-caption-over">{q.text}</div>}
    </div>
  );
}

/** Draws the image at low resolution and scales it up (pixelated). Redraws only when the amount changes. */
function Pixelated({ src, amount, style }: { src: string; amount: number; style: Record<string, any> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const draw = () => {
    const c = ref.current, i = img.current;
    if (!c || !i?.complete || !i.naturalWidth) return;
    const w = Math.max(2, Math.round(i.naturalWidth * (1 - amount)));
    const h = Math.max(2, Math.round(w * i.naturalHeight / i.naturalWidth));
    if (c.width === w) return;
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(i, 0, 0, w, h);
    c.style.aspectRatio = `${i.naturalWidth} / ${i.naturalHeight}`;
  };
  useEffect(() => { const i = new window.Image(); i.onload = draw; i.onerror = () => reportMediaError(); i.src = src; img.current = i; }, [src]);
  useEffect(draw, [amount]);
  return <canvas ref={ref} class="q-image q-pixel" style={style} />;
}
