// Script questions: free JavaScript, run in the player's browser (friends only — no sandbox, on purpose).
// The code receives `api` (see SCRIPT_API_DOC below, also shown in the Studio). It may return a cleanup function.
import { useEffect, useRef, useState } from 'preact/hooks';
import { assets, type QProps } from './common';
import { play } from '../sfx';
import { send, serverNow, store } from '../store';

export const SCRIPT_API_DOC = `api.el          conteneur HTML (div) — tu peux y mettre ce que tu veux
api.canvas      canvas 640×360 déjà créé · api.ctx = son contexte 2D · api.w / api.h
api.q           la question (q.data = tes données libres, q.opts, q.tags…)
api.t           secondes depuis le début de la question · api.progress = 0 → 1
api.onFrame(fn) appelle fn(t, dt) à chaque image (60 fps)
api.onKey(fn)   fn(event) à chaque touche (keydown) · api.on(cible, 'event', fn)
api.asset(nom)  URL d'un fichier de ton pack (media/nom)
api.image(nom)  Promise<HTMLImageElement> · api.sound(nom) → HTMLAudioElement
api.play(id)    joue un son du jeu ('correct', 'explosion', 'bonus'…)
api.answer(txt) envoie une réponse à la place du joueur (pour les mini-jeux)
api.state       état de la partie (joueurs, scores…) en lecture
return () => {} (optionnel) nettoyage quand la question se termine
(await est autorisé : const img = await api.image('perso.png'))`;

/** The Studio swaps this to catch api.answer() in preview. */
export const scriptBridge = { answer: (text: string) => send({ t: 'answer', text }) };

export default function Script({ q, phase }: QProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const el = ref.current!;
    el.innerHTML = '';
    setErr('');
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 360; canvas.className = 'q-canvas';
    el.appendChild(canvas);
    const t0 = phase?.startedAt ?? serverNow();
    const dur = phase ? phase.endsAt - phase.startedAt : 20000;
    const frames: ((t: number, dt: number) => void)[] = [];
    const cleanups: (() => void)[] = [];
    const api = {
      el, canvas, ctx: canvas.getContext('2d')!, w: 640, h: 360, q, data: q.data,
      get t() { return (serverNow() - t0) / 1000; },
      get progress() { return Math.min(1, (serverNow() - t0) / dur); },
      get state() { return store.s; },
      onFrame: (fn: (t: number, dt: number) => void) => void frames.push(fn),
      on: (target: EventTarget, ev: string, fn: any) => { target.addEventListener(ev, fn); cleanups.push(() => target.removeEventListener(ev, fn)); },
      onKey: (fn: (e: KeyboardEvent) => void) => api.on(window, 'keydown', fn),
      asset: (name: string) => assets.resolve(q, name),
      image: (name: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = api.asset(name); }),
      sound: (name: string) => new Audio(api.asset(name)),
      play: (id: string) => play(id),
      answer: (text: string) => scriptBridge.answer(String(text)),
    };
    const fail = (e: any) => { console.error('[script]', e); setErr(String(e?.message ?? e)); };
    // async so scripts can `await api.image(...)` at top level
    let dead = false;
    try {
      const AsyncFn = Object.getPrototypeOf(async () => {}).constructor;
      new AsyncFn('api', q.script ?? '')(api).then((ret: any) => { if (typeof ret === 'function') dead ? ret() : cleanups.push(ret); }, fail);
    } catch (e) { fail(e); }
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      for (const f of frames) try { f(api.t, dt); } catch (e) { fail(e); frames.length = 0; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { dead = true; cancelAnimationFrame(raf); for (const c of cleanups) try { c(); } catch { /* ignore */ } };
  }, [q.id, q.script]);
  return (
    <div class="q-script">
      <div ref={ref} class="q-script-root" />
      {err && <div class="q-script-err">⚠ Erreur dans le script : {err}</div>}
    </div>
  );
}
