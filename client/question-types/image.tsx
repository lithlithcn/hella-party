import { useEffect, useRef } from 'preact/hooks';
import { type QProps, useProgress, visualStyle } from './common';

export default function Image({ q, phase, clear }: QProps) {
  const o = q.opts ?? {};
  const progress = useProgress(phase, !!o.reveal && o.reveal !== 'none', clear);
  const v = visualStyle(o, progress, clear);
  return (
    <div class="q-frame">
      {v.pixel > 0.01
        ? <Pixelated src={q.src!} amount={v.pixel} style={v.style} />
        : <img class="q-image" src={q.src} alt="" draggable={false} style={v.style} />}
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
