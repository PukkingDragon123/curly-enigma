// The wait while Old Star's house is built (or put back together): a dark screen with a little
// lantern swinging on its chain, the house's name, a wick of a progress bar that burns along with
// an ember at its tip, and what's being done ("Stoking the fire", "Winding the clock"...). CSS
// animations only, so it keeps moving even while the page is busy. After the fall it's quieter:
// just the ember line and three dots (you're out cold).
//
//   const ld = houseLoading(game, { dark }); ld.set({ k, label }); ld.done()
import { el } from '../core/util.js';

const LINES = {
  start: 'Opening the shutters', living: 'Stoking the fire', kitchen: 'Putting the kettle on', smithy: 'Banking the forge',
  hall: 'Sweeping the hall', garden: 'Watering the glowcaps', terrace: 'Wiping the telescope', workshop: 'Oiling the little train',
  larder: 'Counting the cheeses', ways: 'Oiling the hinges', vista: 'Lighting the cavern', shell: 'Airing your room',
  rooms: 'Lighting the lamps', star: 'Waking Old Star', done: 'Home',
};

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const css = `
.hl-back{position:absolute;inset:0;z-index:7;pointer-events:auto;background:radial-gradient(ellipse at 50% 46%,#2a1810 0,#120a08 55%,#070405 100%);display:grid;place-items:center;transition:opacity .45s ease;font-family:var(--font);color:#f4e2c0}
.hl-back.out{opacity:0;pointer-events:none}
.hl-card{display:flex;flex-direction:column;align-items:center;gap:calc(var(--px) * 5);transform:translateY(calc(var(--px) * -4))}
.hl-lamp{position:relative;width:calc(var(--px) * 14);height:calc(var(--px) * 30);transform-origin:50% 0;animation:hlSwing 3.2s ease-in-out infinite}
.hl-lamp i{position:absolute;left:50%;top:0;width:var(--px);height:calc(var(--px) * 9);margin-left:calc(var(--px) * -.5);background:repeating-linear-gradient(#6a5a4a 0 var(--px),#3a3028 var(--px) calc(var(--px) * 2))}
.hl-lamp b{position:absolute;left:0;top:calc(var(--px) * 9);width:calc(var(--px) * 14);height:calc(var(--px) * 18);background:linear-gradient(#ffe7a0,#ffb04a 60%,#e8702a);box-shadow:0 0 0 var(--px) #2e2018,0 0 calc(var(--px) * 10) calc(var(--px) * 4) #ff9a3a55,inset 0 0 0 var(--px) #8a5a2a;animation:hlGlow 1.7s ease-in-out infinite}
.hl-lamp b:before,.hl-lamp b:after{content:"";position:absolute;left:calc(var(--px) * -1);width:calc(var(--px) * 16);height:calc(var(--px) * 2);background:#2e2018}
.hl-lamp b:before{top:calc(var(--px) * -2)}.hl-lamp b:after{bottom:calc(var(--px) * -2)}
.hl-title{font-family:var(--font-head);font-size:var(--fs-h);letter-spacing:.06em;color:#f6dca8;text-shadow:0 var(--px) 0 #000,0 0 calc(var(--px) * 6) #ff9a3a44}
.hl-wick{position:relative;width:min(calc(var(--px) * 110),70vw);height:calc(var(--px) * 3);background:#2a1a12;box-shadow:0 0 0 var(--px) #4a3020}
.hl-wick em{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#7a2a12,#e8702a 70%,#ffd27a);transition:width .35s ease}
.hl-wick em:after{content:"";position:absolute;right:calc(var(--px) * -2);top:calc(var(--px) * -2);width:calc(var(--px) * 7);height:calc(var(--px) * 7);background:#fff0b0;box-shadow:0 0 calc(var(--px) * 4) calc(var(--px) * 2) #ffb04a;animation:hlEmber .5s steps(2) infinite}
.hl-what{min-height:1.3em;font-size:var(--fs);color:#d8b888;opacity:.9}
.hl-what:after{content:"";display:inline-block;width:1.6em;text-align:left;animation:hlDots 1.2s steps(4) infinite}
.hl-back.dark{background:#000}
.hl-back.dark .hl-lamp,.hl-back.dark .hl-title{display:none}
.hl-back.dark .hl-card{position:absolute;bottom:calc(var(--sab, 0px) + var(--px) * 18);transform:none}
.hl-back.dark .hl-wick{height:var(--px);width:min(calc(var(--px) * 80),50vw);background:#140c08;box-shadow:none}
.hl-back.dark .hl-wick em{background:linear-gradient(90deg,#3a1408,#a8481c)}
.hl-back.dark .hl-wick em:after{width:calc(var(--px) * 3);height:calc(var(--px) * 3);top:calc(var(--px) * -1);right:calc(var(--px) * -1);background:#ff9a4a;box-shadow:0 0 calc(var(--px) * 3) var(--px) #a8481c}
.hl-back.dark .hl-what{color:#6a5040}
@keyframes hlSwing{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
@keyframes hlGlow{0%,100%{filter:brightness(1)}40%{filter:brightness(1.18)}70%{filter:brightness(.9)}}
@keyframes hlEmber{50%{opacity:.6;transform:scale(.8)}}
@keyframes hlDots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
@media (prefers-reduced-motion:reduce){.hl-lamp,.hl-lamp b,.hl-wick em:after,.hl-what:after{animation:none}}`;
  document.head.append(el('style', { 'data-house': 'loading' }, css));
}

/** The loading screen over the game (above the transition's black). opts.dark: after the fall. */
export function houseLoading(game, opts = {}) {
  let root = null, bar = null, what = null, shown = false, gone = false, last = '';
  const t0 = performance.now();
  const show = () => {
    if (shown || gone) return;
    shown = true;
    try {
      style();
      bar = el('em');
      what = el('div', { class: 'hl-what' }, opts.dark ? '' : LINES.start);
      root = el('div', { class: 'hl-back' + (opts.dark ? ' dark' : ''), role: 'status', 'aria-label': 'Loading Old Star\'s house' }, [
        el('div', { class: 'hl-card' }, [el('div', { class: 'hl-lamp', 'aria-hidden': 'true' }, [el('i'), el('b')]), el('div', { class: 'hl-title' }, 'Old Star\'s house'), el('div', { class: 'hl-wick' }, [bar]), what]),
      ]);
      (game.ui?.overlay || document.body).append(root);
    } catch (e) { /* no DOM to show it in */ }
  };
  // a house that's ready in a blink never flashes the screen
  const timer = setTimeout(show, opts.delay ?? 120);
  return {
    set(p) {
      if (gone) return;
      if (!shown && performance.now() - t0 > 100) show();
      if (!bar) return;
      bar.style.width = `${Math.round(Math.max(0.02, Math.min(1, p.k)) * 100)}%`;
      const line = opts.dark ? '' : (LINES[p.label] || LINES.rooms);
      if (line !== last && what) { last = line; what.textContent = line; }
    },
    done() {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      if (!root) return;
      if (bar) bar.style.width = '100%';
      root.classList.add('out');
      setTimeout(() => root.remove(), 500);
    },
  };
}
