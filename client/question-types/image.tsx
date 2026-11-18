import { useEffect, useRef, useState } from 'preact/hooks';
import { type QProps, useProgress, useSrc, visualStyle } from './common';

export default function Image({ q, phase, clear }: QProps) {
  const o = q.opts ?? {};
  const progress = useProgress(phase, !!o.reveal && o.reveal !== 'none', clear);
  const v = visualStyle(o, progress, clear);
  const src = useSrc(q.src);
  const [fallback, setFallback] = useState(false);
  if (src === null) return <div class="q-frame q-loading">🖼️❓<small>Image indisponible{q.hint ? '' : ' — devine avec la catégorie !'}</small></div>;
  if (!src) return <div class="q-frame q-loading">⏳</div>;
  const url = fallback ? src.replace(/\/640px-/, '/330px-') : src;
  return (
    <div class="q-frame q-frame-col">
      {v.pixel > 0.01
        ? <Pixelated src={url} amount={v.pixel} style={v.style} />
        : <img class="q-image" src={url} alt="" draggable={false} style={v.style} onError={() => !fallback && setFallback(true)} />}
      {q.text && <div class="q-caption q-caption-over">{q.text}</div>}
    </div>
  );
}

/** Draws the image at low resolution and scales it up (pixelated). */
function Pixelated({ src, amount, style }: { src: string; amount: number; style: Record<string, any> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const draw = () => {
    const c = ref.current, i = img.current;
    if (!c || !i?.complete || !i.naturalWidth) return;
    const w = Math.max(2, Math.round(i.naturalWidth * (1 - amount)));
    const h = Math.max(2, Math.round(w * i.naturalHeight / i.naturalWidth));
    c.width = w; c.height = h;
    c.getContext('2d')!.drawImage(i, 0, 0, w, h);
    c.style.aspectRatio = `${i.naturalWidth} / ${i.naturalHeight}`;
  };
  useEffect(() => { const i = new window.Image(); i.onload = draw; i.src = src; img.current = i; }, [src]);
  useEffect(draw, [amount]);
  return <canvas ref={ref} class="q-image q-pixel" style={style} />;
}
