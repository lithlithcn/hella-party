// Profile picture: pick an image, drag to move, slider/wheel to zoom, export a 128×128 WebP data URL.
import { useEffect, useRef, useState } from 'preact/hooks';

const OUT = 128, VIEW = 260;

export const myAvatar = {
  get: () => localStorage.getItem('hp.avatar'),
  set: (v: string | null) => (v ? localStorage.setItem('hp.avatar', v) : localStorage.removeItem('hp.avatar')),
};

export function AvatarEditor({ onDone, onClose }: { onDone: (dataUrl: string | null) => void; onClose: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const cv = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const base = img ? VIEW / Math.min(img.width, img.height) : 1; // scale so the short side fills the circle
  const draw = (c: HTMLCanvasElement, size: number) => {
    const ctx = c.getContext('2d')!;
    c.width = c.height = size;
    ctx.fillStyle = '#1d1238'; ctx.fillRect(0, 0, size, size);
    if (!img) return;
    const k = size / VIEW, s = base * zoom * k;
    ctx.drawImage(img, size / 2 + pos.x * k - (img.width * s) / 2, size / 2 + pos.y * k - (img.height * s) / 2, img.width * s, img.height * s);
  };
  useEffect(() => { if (cv.current) draw(cv.current, VIEW); }, [img, zoom, pos]);

  const pick = (f?: File) => {
    if (!f) return;
    const i = new Image();
    i.onload = () => { setImg(i); setZoom(1); setPos({ x: 0, y: 0 }); };
    i.src = URL.createObjectURL(f);
  };
  const save = () => {
    if (!img) return onDone(null);
    const c = document.createElement('canvas');
    draw(c, OUT);
    onDone(c.toDataURL('image/webp', 0.85));
  };

  return (
    <div class="modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div class="modal-card avatar-editor">
        <h3>Photo de profil</h3>
        <div class="crop" style={{ width: VIEW, height: VIEW }}
          onPointerDown={e => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
          onPointerMove={e => { const d = drag.current; if (d) setPos({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }); }}
          onPointerUp={() => (drag.current = null)}
          onWheel={e => { e.preventDefault(); setZoom(z => Math.min(6, Math.max(1, z * (e.deltaY < 0 ? 1.1 : 0.9)))); }}>
          <canvas ref={cv} />
          {!img && <label class="crop-pick">📷 Choisir une image<input type="file" accept="image/*" onChange={e => pick((e.target as HTMLInputElement).files?.[0])} /></label>}
        </div>
        {img && <input type="range" min="1" max="6" step="0.01" value={zoom} onInput={e => setZoom(+(e.target as HTMLInputElement).value)} />}
        <p class="muted small">Glisse pour déplacer · molette ou curseur pour zoomer</p>
        <div class="row">
          {img && <label class="btn ghost small file-btn">Changer<input type="file" accept="image/*" onChange={e => pick((e.target as HTMLInputElement).files?.[0])} /></label>}
          <button class="btn ghost small" onClick={() => onDone(null)}>Retirer la photo</button>
          <span class="grow" />
          <button class="btn ghost small" onClick={onClose}>Annuler</button>
          <button class="btn small" disabled={!img} onClick={save}>Valider</button>
        </div>
      </div>
    </div>
  );
}
