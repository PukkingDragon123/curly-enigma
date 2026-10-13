// On-screen controls for touch devices. Taps on the world already act as the mouse
// (dig/aim); these buttons stand in for the keyboard.
import { el } from '../core/util.js';

const CSS = `
.touch { position: absolute; inset: 0; pointer-events: none; z-index: 3; }
.touch .pad { position: absolute; bottom: calc(var(--px) * 34 + env(safe-area-inset-bottom, 0px)); display: grid; gap: calc(var(--px) * 2); pointer-events: none; }
.touch .pad.left { left: calc(var(--px) * 4); grid-template-columns: repeat(3, calc(var(--px) * 20)); }
.touch .pad.right { right: calc(var(--px) * 4); grid-template-columns: repeat(2, calc(var(--px) * 22)); }
.touch button { pointer-events: auto; height: calc(var(--px) * 20); border: var(--px) solid #000; background: rgba(243, 226, 191, .72); color: #2a1a12; font: inherit; font-weight: 700; touch-action: none; }
.touch button.on { background: rgba(242, 194, 58, .9); }
.touch .blank { visibility: hidden; }
`;

export function setupTouch(game) {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
    const inp = game.input;
    const btn = (label, code, title) => {
      const b = el('button', { 'aria-label': title || label, title: title || label }, label);
      const on = (e) => { e.preventDefault(); b.classList.add('on'); inp.down.add(code); inp.justDown.add(code); game.audio.init(); };
      const off = (e) => { e.preventDefault(); b.classList.remove('on'); inp.down.delete(code); inp.justUp.add(code); };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      return b;
    };
    const blank = () => el('span', { class: 'blank' });
    const left = el('div', { class: 'pad left' }, [
      blank(), btn('▲', 'KeyW', 'Jump / climb / up'), blank(),
      btn('◀', 'KeyA', 'Left'), btn('▼', 'KeyS', 'Down'), btn('▶', 'KeyD', 'Right'),
    ]);
    const right = el('div', { class: 'pad right' }, [
      btn('E', 'KeyE', 'Interact'), btn('Q', 'KeyQ', 'Snack'),
      btn('⟳', 'Tab2', 'Next tool'), btn('X', 'KeyX', 'Build mode'),
    ]);
    // "next tool" maps to a wheel tick
    right.children[2].addEventListener('pointerdown', () => { inp.mouse.wheel += 1; });
    const root = el('div', { class: 'touch' }, [left, right]);
    game.ui.root.append(root);
    game.touch = root;
  };
  if (coarse) build();
  window.addEventListener('touchstart', build, { once: true, passive: true });
}
