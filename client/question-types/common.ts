// Shared helpers for question renderers (game and Studio preview).
import type { Phase, PublicQuestion } from '../../shared/protocol';
import type { MediaOpts } from '../../shared/pack';
import { useNow } from '../ui/util';
import { useEffect, useState } from 'preact/hooks';

// "wiki:Pizza" / "wiki:en:Pizza" → lead image of that Wikipedia article (resolved in the player's browser).
// Requests go through a small queue (max 4 at once) with retries: Wikipedia answers 429 when hammered.
const wikiCache = new Map<string, Promise<string | undefined>>();
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= 4) await new Promise<void>(r => waiting.push(r));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}
async function summary(lang: string, title: string): Promise<string | undefined | 'retry'> {
  const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`).catch(() => null);
  if (!r || r.status === 429 || r.status >= 500) return 'retry';
  if (!r.ok) return undefined;
  const j: any = await r.json().catch(() => null);
  return j?.thumbnail?.source?.replace(/\/(\d+)px-/, '/640px-') ?? j?.originalimage?.source;
}
async function lookup(lang: string, title: string) {
  for (let i = 0; i < 4; i++) {
    const u = await limited(() => summary(lang, title));
    if (u !== 'retry') return u;
    await new Promise(r => setTimeout(r, 400 * 2 ** i));
  }
  return undefined;
}
export function resolveWiki(src: string): Promise<string | undefined> {
  let p = wikiCache.get(src);
  if (!p) {
    const m = src.match(/^wiki:(?:([a-z]{2,3}):)?(.+)$/)!;
    const lang = m[1] ?? 'fr', title = encodeURIComponent(m[2].trim().replace(/ /g, '_'));
    // same title on the other language as a fallback (titles are often identical)
    p = lookup(lang, title).then(u => u ?? lookup(lang === 'fr' ? 'en' : 'fr', title));
    p.then(u => { if (!u) wikiCache.delete(src); }); // don't remember failures
    wikiCache.set(src, p);
  }
  return p;
}
export const isWiki = (src?: string) => !!src && src.startsWith('wiki:');

/** Media URL, resolving wiki: sources. */
export function useSrc(src?: string) {
  const [url, setUrl] = useState<string | null | undefined>(isWiki(src) ? undefined : src);
  useEffect(() => { if (isWiki(src)) { setUrl(undefined); resolveWiki(src!).then(u => setUrl(u ?? null)); } else setUrl(src); }, [src]);
  return url; // undefined = loading, null = not found
}

export interface QProps {
  q: PublicQuestion;
  phase?: Phase | null;   // question phase (for progressive reveal); absent = static
  clear?: boolean;        // reveal phase: show the media without effects
}

/** Resolves a pack asset name to a URL. The Studio overrides this with blob URLs. */
export const assets = {
  resolve(q: PublicQuestion, name: string) { return /^(https?:|\/|blob:|data:)/.test(name) ? name : `${q.assets ?? ''}${name}`; },
};

/** 0 → 1 over the phase; 1 when clear. Re-renders while running. */
export function useProgress(phase: Phase | null | undefined, on: boolean, clear?: boolean) {
  const now = useNow(100, on && !!phase && !clear);
  if (clear) return 1;
  if (!phase || !on) return 0;
  return Math.min(1, Math.max(0, (now - phase.startedAt) / Math.max(1, phase.endsAt - phase.startedAt)));
}

/** CSS filter/transform for image & video options. k = remaining effect strength (1 = full, 0 = none). */
export function visualStyle(o: MediaOpts, progress: number, clear?: boolean) {
  if (clear) return { style: {}, pixel: 0, spot: 0 };
  const r = o.reveal ?? 'none';
  const k = 1 - progress;
  const blur = (o.blur ?? (r === 'unblur' ? 24 : 0)) * (r === 'unblur' ? k : 1);
  const z0 = o.zoom ?? (r === 'unzoom' ? 4 : 1);
  const zoom = r === 'unzoom' ? 1 + (z0 - 1) * k : z0;
  const pixel = (o.pixelate ?? (r === 'unpixelate' ? 0.97 : 0)) * (r === 'unpixelate' ? k : 1);
  const spot = r === 'spotlight' ? 8 + progress * 92 : 0; // visible radius in %
  const filter = [blur && `blur(${blur.toFixed(1)}px)`, o.grayscale && 'grayscale(1)', o.invert && 'invert(1)'].filter(Boolean).join(' ');
  const transform = [zoom !== 1 && `scale(${zoom})`, o.rotate && `rotate(${o.rotate}deg)`, o.flip && 'scaleX(-1)'].filter(Boolean).join(' ');
  return {
    pixel, spot,
    style: {
      filter: filter || undefined,
      transform: transform || undefined,
      transformOrigin: `${o.zoomX ?? 50}% ${o.zoomY ?? 50}%`,
      maskImage: spot ? `radial-gradient(circle at ${o.zoomX ?? 50}% ${o.zoomY ?? 50}%, #000 ${spot}%, transparent ${spot + 4}%)` : undefined,
      WebkitMaskImage: spot ? `radial-gradient(circle at ${o.zoomX ?? 50}% ${o.zoomY ?? 50}%, #000 ${spot}%, transparent ${spot + 4}%)` : undefined,
    } as Record<string, any>,
  };
}

/** Clip playback to [start, end], with loop / volume / rate. Returns a cleanup. */
export function clipMedia(el: HTMLMediaElement, o: MediaOpts, autoplay = true) {
  const start = o.start ?? 0, end = o.end || 0;
  el.volume = Math.min(1, Math.max(0, o.volume ?? 1));
  el.playbackRate = o.rate ?? 1;
  const onMeta = () => { el.currentTime = start; if (autoplay) el.play().catch(() => {}); };
  const onTime = () => { if (end && el.currentTime >= end) { if (o.loop) el.currentTime = start; else el.pause(); } };
  const onEnded = () => { if (o.loop) { el.currentTime = start; el.play().catch(() => {}); } };
  el.addEventListener('loadedmetadata', onMeta);
  el.addEventListener('timeupdate', onTime);
  el.addEventListener('ended', onEnded);
  if (el.readyState >= 1) onMeta();
  return () => { el.pause(); el.removeEventListener('loadedmetadata', onMeta); el.removeEventListener('timeupdate', onTime); el.removeEventListener('ended', onEnded); };
}
