// Hold to skip a cutscene (wave 18): hold Esc, or hold the mouse button down anywhere. A tap never
// skips (a click or Space finishes / carries on the line that's up: ui/Convo.js); a click held past
// a beat starts it. The indicator is a small crafted thing, low in the corner: an iron rod in a
// riveted brass gauge that heats from dull iron through cherry red to white as you hold, with the
// Esc key cap beside it, and a spray of embers when it's done. It shows for a moment as a cutscene
// starts (faint), then only while held.
//   const sk = new SkipHold({ onSkip, parent, hold: 1.0 }); per frame sk.update(dt); sk.dispose()
// While any SkipHold is live, Esc belongs to it (no pause menu, no closing the talk).
import { el } from '../core/util.js';
import { bits } from '../ui/floatType.js';

const live = new Set();
let escHeld = false, ptrHeld = false, escSpent = false;
// (registered when the module loads, before the interface's own Escape handler; an Esc that has
// just skipped stays swallowed until it's let go, so its key repeats don't open the pause menu)
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || (!live.size && !escSpent)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (live.size) escHeld = true;
  }, true);
  window.addEventListener('keyup', (e) => { if (e.code === 'Escape') { escHeld = false; escSpent = false; } }, true);
  window.addEventListener('pointerdown', (e) => { if (e.button === 0) ptrHeld = true; }, true);
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, (e) => { if (e.button === 0 || ev === 'pointercancel') ptrHeld = false; }, true);
  window.addEventListener('blur', () => { escHeld = false; ptrHeld = false; });
}

// ------------------------------------------------------------------ art
const W = 34, H = 9;
const PAL = {
  ink: '#1c0e06', brassD: '#7a4a14', brass: '#c08a2a', brassL: '#ecc260', brassH: '#fff0b0',
  chan: '#120a08', ironD: '#2c272c', iron: '#4a4248', ironL: '#6a6068', rivet: '#3a2410',
};
const HEAT = ['#5a0c06', '#8a1a0a', '#c0300e', '#e8501a', '#ff8a2a', '#ffc050', '#ffe89a', '#fff8e0'];

function gauge(hot) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  // the brass frame: inked round, lit from the top left, rivets at the ends
  px(1, 0, PAL.ink, W - 2, 1); px(1, H - 1, PAL.ink, W - 2, 1); px(0, 1, PAL.ink, 1, H - 2); px(W - 1, 1, PAL.ink, 1, H - 2);
  px(1, 1, PAL.brass, W - 2, H - 2);
  px(1, 1, PAL.brassL, W - 2, 1); px(1, 1, PAL.brassL, 1, H - 2);
  px(1, H - 2, PAL.brassD, W - 2, 1); px(W - 2, 2, PAL.brassD, 1, H - 3);
  px(2, 1, PAL.brassH, 3, 1);
  for (const x of [2, W - 4]) { px(x, 3, PAL.rivet, 2, 2); px(x, 3, PAL.brassH); }
  // the channel, and the rod in it
  px(5, 2, PAL.chan, W - 10, H - 4);
  for (let x = 6; x < W - 6; x++) {
    if (hot) {
      const k = (x - 6) / (W - 13);
      const i = Math.min(HEAT.length - 1, Math.floor(k * HEAT.length));
      px(x, 3, HEAT[Math.min(HEAT.length - 1, i + 1)]); px(x, 4, HEAT[i]); px(x, 5, HEAT[Math.max(0, i - 2)]);
    } else {
      px(x, 3, PAL.ironL); px(x, 4, PAL.iron); px(x, 5, PAL.ironD);
      if (x % 7 === 3) px(x, 4, PAL.ironD); // (hammer marks)
    }
  }
  if (hot) { px(W - 7, 3, '#ffffff'); px(W - 8, 4, '#fff8e0'); }
  return c.toDataURL();
}

let ART = null;
function art() { return ART || (ART = { cold: gauge(false), hot: gauge(true) }); }

const CSS = /* css */`
.skh { position: absolute; left: calc(var(--sal, 0px) + 18px); bottom: calc(var(--sab, 0px) + 16px); z-index: 60; display: flex; align-items: center; gap: calc(var(--px) * 2.5);
  pointer-events: none; opacity: 0; transform: translateY(calc(var(--px) * 3)); transition: opacity .35s, transform .35s cubic-bezier(.3,1.4,.5,1); font-family: var(--font); }
.skh.peek { opacity: .55; transform: none; }
.skh.on { opacity: 1; transform: none; }
.skh.fired { opacity: 0; transition-duration: .6s; }
.skh-t { font-size: var(--fs); line-height: 1; color: #f2dcb8; text-shadow: var(--px) 0 0 #1c0e06, calc(var(--px) * -1) 0 0 #1c0e06, 0 var(--px) 0 #1c0e06, 0 calc(var(--px) * -1) 0 #1c0e06; white-space: nowrap; }
.skh kbd { margin: 0; }
.skh-g { position: relative; width: calc(var(--px) * ${W}); height: calc(var(--px) * ${H}); flex: none; }
.skh-g i { position: absolute; inset: 0; background-size: 100% 100%; image-rendering: pixelated; image-rendering: crisp-edges; }
.skh-g i.hot { clip-path: inset(0 calc(82.4% - var(--k, 0) * 64.8%) 0 0); }
.skh.on .skh-g i.hot { animation: skhFlick .18s steps(2) infinite; }
@keyframes skhFlick { 50% { filter: brightness(1.12); } }
`;
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  document.head.append(el('style', { 'data-skh': '' }, CSS));
}

// ------------------------------------------------------------------ the control
export class SkipHold {
  /** o: { onSkip, parent (DOM, default #ui or body), hold (s, default 1), peek (s shown faint at the start, default 2.6) } */
  constructor(o = {}) {
    style();
    const A = art();
    this.onSkip = o.onSkip || null;
    this.hold = o.hold ?? 1.0;
    this.grace = 0.28; // (a click held this long before it counts: a click is a click)
    this.t = 0;
    this.ptrT = 0;
    this.k = -1;
    this.peekT = o.peek ?? 2.6;
    this.fired = false;
    this.cold = el('i', { style: { backgroundImage: `url(${A.cold})` } });
    this.hot = el('i', { class: 'hot', style: { backgroundImage: `url(${A.hot})` } });
    this.g = el('span', { class: 'skh-g' }, [this.cold, this.hot]);
    this.el = el('div', { class: 'skh', 'aria-hidden': 'true' }, [el('span', { class: 'skh-t', html: 'hold <kbd>Esc</kbd>' }), this.g]);
    (o.parent || document.getElementById('ui') || document.body).append(this.el);
    if (this.peekT > 0) requestAnimationFrame(() => this.el?.classList.add('peek'));
    live.add(this);
    escHeld = false;
  }

  get holding() { return !this.fired && (escHeld || (ptrHeld && this.ptrT >= this.grace)); }

  update() {
    if (this.fired || !this.el) return;
    // (wall time: a hold is a hold however slowly the frames come)
    const now = performance.now(), dt = this.last ? Math.min(0.25, (now - this.last) / 1000) : 0;
    this.last = now;
    this.ptrT = ptrHeld ? this.ptrT + dt : 0;
    const h = this.holding;
    this.t = h ? this.t + dt : Math.max(0, this.t - dt * 2.5);
    const k = Math.min(1, this.t / this.hold);
    if (Math.abs(k - this.k) > 0.004) { this.k = k; this.g.style.setProperty('--k', k.toFixed(3)); }
    const on = h || k > 0.01;
    if (on !== this.shown) { this.shown = on; this.el.classList.toggle('on', on); }
    if (this.peekT > 0) { this.peekT -= dt; if (this.peekT <= 0) this.el.classList.remove('peek'); }
    if (k >= 1) this.fire();
  }

  fire() {
    if (this.fired) return;
    this.fired = true;
    if (escHeld) escSpent = true;
    this.el.classList.add('fired');
    try { bits(this.g, { from: 'rect', n: 22, rise: 34, spread: 30 }); } catch (e) { /* no bits */ }
    live.delete(this);
    const f = this.onSkip;
    this.onSkip = null;
    try { f?.(); } catch (e) { console.warn('[skip]', e); }
    setTimeout(() => this.dispose(), 700);
  }

  dispose() {
    live.delete(this);
    this.el?.remove();
    this.el = null;
  }
}

/**
 * No quest marks bobbing over heads in a cutscene or a talk (src/ui/QuestMarks.js hides them while
 * the quest strip is muted). Counted, so a talk inside a cutscene ends cleanly; the strip's own mute
 * comes back as it was.
 */
export function cineMarks(ui, on) {
  const tr = ui?.tracker;
  if (!tr?.mute) return;
  const n = ui._cineN | 0;
  if (on) { if (n === 0) { ui._cineWas = !!tr.muted; tr.mute(true); } ui._cineN = n + 1; return; }
  if (n <= 0) return;
  ui._cineN = n - 1;
  if (n === 1) tr.mute(!!ui._cineWas);
}
