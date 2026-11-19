// Correct-answer effect: the background flashes white, and when the white fades the décor hue has moved +15°.
// Cheap on any device: one opacity animation on a dedicated layer + one filter change hidden under the flash.
let hue = 0;
let el: HTMLElement | null = null, bg: HTMLElement | null = null;

export function flash() {
  el ??= document.querySelector<HTMLElement>('.bg-flash');
  bg ??= document.querySelector<HTMLElement>('.bg-in');
  if (!el || !bg) return;
  el.classList.remove('go');
  void el.offsetWidth; // restart the animation
  el.classList.add('go');
  hue = (hue + 15) % 360;
  const b = bg;
  setTimeout(() => { b.style.filter = `hue-rotate(${hue}deg)`; }, 90); // while fully white
}

/** One-shot "hit" on the stage (shmup-style): short shake, and for strong hits a 1-frame colour inversion. */
export function hit(strength: 1 | 2 | 3 = 1) {
  const st = document.querySelector<HTMLElement>('.stage');
  if (!st) return;
  st.classList.remove('hit1', 'hit2', 'hit3');
  void st.offsetWidth;
  st.classList.add(`hit${strength}`);
}

/** Wrong answer: small horizontal recoil of the stage. */
export function recoil() {
  const st = document.querySelector<HTMLElement>('.stage');
  if (!st) return;
  st.classList.remove('recoil'); void st.offsetWidth; st.classList.add('recoil');
}

