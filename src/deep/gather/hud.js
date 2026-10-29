// The gathering HUD, in the house style (pixel art drawn in code, shown at whole multiples of
// --px): a hanging name sign with the plant's icon and the verb, a small decorated gauge for the
// minigame (a brass-capped tension tube on an oak plate with the root-loosening pips under it;
// a speed tube for peeling, a berry basket for picking, a height tube and spirit level for eggs),
// words that pop up where things happen in the world, a paper hint, a Leave plaque, and the
// result tag pinned beside the plant held up in the paw.
import { el } from '../../core/util.js';
import { ITEMS } from '../../data/items.js';
import { iconURL } from '../../gfx/PixelArt.js';
import { Px, PAL, INK } from '../../ui/uiArt.js';
import { SPR } from '../../ui/uiSprites.js';

const W = PAL.wood, B = PAL.brass;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hash = (x, y) => { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); };

const CSS = /* css */`
#ui.gathering > .hud > :not(.toasts), #ui.gathering > .world-layer { opacity: 0; transition: opacity .3s; pointer-events: none; }
#ui.gathering .toasts { left: auto; right: calc(var(--sar) + var(--px) * 4); top: calc(var(--sat) + var(--px) * 4); align-items: flex-end; transform: scale(.8); transform-origin: 100% 0; }
.gt-hud.still, .gt-hud.still * { animation-delay: -10s !important; animation-duration: .001s !important; transition: none !important; }
.gt-hud.still .gt-pop { animation: none !important; transform: translate(-50%, -120%); }
.gt-hud { position: absolute; inset: 0; pointer-events: none; font-family: var(--font); font-size: var(--fs-ui); color: var(--ink); }
.modal-back.gt-back { background: radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 55%, rgba(6,3,6,.42)); padding: 0; place-items: stretch; animation: gtFade .5s ease-out; touch-action: none; cursor: grab; }
.modal-back.gt-back.gripping { cursor: grabbing; }
.modal-back.gt-back.closing { animation: gtFade .35s ease-in reverse forwards; }
@keyframes gtFade { from { opacity: 0; } }
.modal-back > .panel.sheet.gt-panel { position: absolute; inset: 0; width: auto; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: none; filter: none; animation: none; }
.modal-back > .panel.sheet.gt-panel::before, .modal-back > .panel.gt-panel > .close { display: none; }
.gt-sign { position: absolute; left: 50%; top: calc(var(--sat) + var(--px) * 10); transform: translateX(-50%); display: flex; align-items: center; gap: calc(var(--px) * 3);
  border-style: solid; border-width: calc(var(--px) * 6); border-image: var(--a-sign) 6 fill / calc(var(--px) * 6) stretch; padding: 0 calc(var(--px) * 3);
  filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(10, 4, 8, .55)); animation: gtDrop .7s cubic-bezier(.25,1.6,.4,1) both; transform-origin: 50% calc(var(--px) * -14); white-space: nowrap; }
.gt-sign::before, .gt-sign::after { content: ''; position: absolute; bottom: 100%; width: calc(var(--px) * 4); height: calc(var(--px) * 14 + var(--sat)); margin-bottom: calc(var(--px) * 1);
  background: var(--a-chain) 0 100% / calc(var(--px) * 4) calc(var(--px) * 8) repeat-y; }
.gt-sign::before { left: calc(var(--px) * 8); } .gt-sign::after { right: calc(var(--px) * 8); }
@keyframes gtDrop { 0% { transform: translateX(-50%) translateY(-160%) rotate(-6deg); } 60% { transform: translateX(-50%) rotate(3deg); } 100% { transform: translateX(-50%) rotate(0); } }
.gt-sign.swing { animation: gtSwing .5s ease-out; }
@keyframes gtSwing { 30% { transform: translateX(-50%) rotate(-3deg); } 65% { transform: translateX(-50%) rotate(2deg); } }
.gt-sign img { width: var(--icon-s); height: var(--icon-s); image-rendering: pixelated; }
.gt-name { font-family: var(--font-head); font-size: var(--fs-h); line-height: 1; color: #fff1d0; text-shadow: 0 var(--px) 0 #3a2212, var(--px) 0 0 #3a2212, calc(var(--px) * -1) 0 0 #3a2212, 0 calc(var(--px) * -1) 0 #3a2212; }
.gt-verb { font-family: var(--font-display); font-size: calc(var(--fs-h) * .8); line-height: 1; color: #fff4d0; padding: 0 calc(var(--px) * 2) calc(var(--px) * .5); margin-left: calc(var(--px) * 1);
  background: #a8402a; box-shadow: 0 0 0 var(--px) #4a1a10, inset 0 calc(var(--px) * -1) 0 #6a2414, inset 0 var(--px) 0 #d0684a; transform: rotate(-4deg); animation: gtVerb .8s ease-in-out infinite alternate; }
@keyframes gtVerb { to { transform: rotate(3deg) scale(1.06); } }
.gt-gauge { position: absolute; right: calc(var(--sar) + var(--px) * 12); top: 50%; transform: translateY(-46%); filter: drop-shadow(0 calc(var(--px) * 3) 0 rgba(10, 4, 8, .5)); animation: gtSlide .6s .15s cubic-bezier(.25,1.5,.4,1) both; }
@keyframes gtSlide { from { transform: translate(140%, -46%); } }
.gt-gauge canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; }
.gt-gauge.shake { animation: gtShake .12s linear infinite; }
@keyframes gtShake { 25% { translate: var(--px) 0; } 75% { translate: calc(var(--px) * -1) 0; } }
.gt-cap { text-align: center; margin-top: calc(var(--px) * 2); font-size: .72em; color: #fbe8c0; text-shadow: 0 var(--px) 0 #000; letter-spacing: .02em; }
.gt-hint { position: absolute; left: 50%; bottom: calc(var(--sab) + var(--px) * 5); transform: translateX(-50%); max-width: min(calc(100vw - 32px), calc(var(--px) * 175)); text-align: center;
  border-style: solid; border-width: calc(var(--px) * 5); border-image: var(--a-note) 5 / calc(var(--px) * 5) repeat; background: #f8ecd2 padding-box; padding: calc(var(--px) * 1) calc(var(--px) * 3);
  filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(10, 4, 8, .45)); line-height: 1.25; font-size: .82em; transition: opacity .4s, transform .4s; animation: gtUp .6s .3s cubic-bezier(.25,1.5,.4,1) both; }
@keyframes gtUp { from { transform: translate(-50%, 160%); } }
.gt-hint b { color: #a8402a; }
.gt-hint .keys { display: block; font-size: .78em; color: var(--ink-soft); margin-top: calc(var(--px) * .5); }
.gt-hint kbd { font: inherit; padding: 0 var(--px); border: var(--px) solid #8a6a48; border-bottom-width: calc(var(--px) * 2); background: #fff8e8; color: #4a2c16; }
.gt-hint.dim { opacity: .55; }
.gt-hint.hide { opacity: 0; transform: translate(-50%, 40%); }
.gt-leave { position: absolute; left: calc(var(--sal) + var(--px) * 6); top: calc(var(--sat) + var(--px) * 6); pointer-events: auto; cursor: pointer; font: inherit; font-size: .85em; color: #fff1d0;
  border-style: solid; border-width: calc(var(--px) * 7); border-image: var(--a-wood) 7 / calc(var(--px) * 7) repeat; background: #6b4226 padding-box; padding: 0 calc(var(--px) * 2);
  text-shadow: 0 var(--px) 0 #2a160c; filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(10, 4, 8, .5)); transition: transform .12s var(--pop); }
.gt-leave:hover { transform: rotate(-3deg) scale(1.05); }
.gt-leave:active { transform: scale(.94); }
.gt-pop { position: absolute; transform: translate(-50%, -50%); font-family: var(--font-display); font-size: calc(var(--px) * 11); line-height: 1; white-space: nowrap; color: #fff;
  text-shadow: 0 var(--px) 0 #1a0e08, var(--px) 0 0 #1a0e08, calc(var(--px) * -1) 0 0 #1a0e08, 0 calc(var(--px) * -1) 0 #1a0e08, 0 calc(var(--px) * 3) 0 rgba(0,0,0,.45); animation: gtPop 1.05s ease-out forwards; }
.gt-pop.big { font-size: calc(var(--px) * 19); }
@keyframes gtPop { 0% { transform: translate(-50%, -50%) scale(.3); } 18% { transform: translate(-50%, -80%) scale(1.25); } 30% { transform: translate(-50%, -90%) scale(1); } 100% { transform: translate(-50%, -200%) scale(1); opacity: 0; } }
.gt-card { position: absolute; left: calc(var(--sal) + 6vw); top: 50%; width: calc(var(--px) * 92); padding: calc(var(--px) * 5) calc(var(--px) * 5) calc(var(--px) * 4); text-align: center;
  border-style: solid; border-width: calc(var(--px) * 8); border-image: var(--a-parchDog) 8 / calc(var(--px) * 8) repeat; background: var(--a-paperT) 0 0 / calc(var(--px) * 32) repeat padding-box, var(--parch) padding-box;
  filter: drop-shadow(0 calc(var(--px) * 3) 0 rgba(10, 4, 8, .5)); transform: translateY(-50%) rotate(-3deg); animation: gtCard .55s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes gtCard { from { transform: translate(-60%, -50%) rotate(-14deg) scale(.4); opacity: 0; } }
.gt-card::before { content: ''; position: absolute; left: 50%; top: calc(var(--px) * -10); width: calc(var(--px) * 8); height: calc(var(--px) * 9); margin-left: calc(var(--px) * -4); background: var(--a-tackRed) center / 100% 100% no-repeat; }
.gt-card .nm { font-family: var(--font-head); font-size: var(--fs-h); line-height: 1; color: var(--sepia); }
.gt-card .q { font-family: var(--font-display); font-size: calc(var(--fs-h) * 1.5); line-height: 1; margin-top: calc(var(--px) * 2); }
.gt-card .st { margin-top: calc(var(--px) * 1); letter-spacing: .12em; color: #d89a10; font-size: 1.15em; text-shadow: 0 var(--px) 0 #7a4a08; }
.gt-card .st i { font-style: normal; color: #c8b090; text-shadow: none; }
.gt-card .w { font-size: .82em; margin-top: calc(var(--px) * 2); line-height: 1.25; color: var(--ink); }
.gt-card .n { position: absolute; left: calc(var(--px) * -6); top: calc(var(--px) * -4); font-family: var(--font-display); font-size: 1.4em; color: #fff4d0; background: #3a7a2a; padding: 0 calc(var(--px) * 2); box-shadow: 0 0 0 var(--px) #1a3a12; transform: rotate(-10deg); }
.gt-card .seal { position: absolute; right: calc(var(--px) * -12); bottom: calc(var(--px) * -10); width: calc(var(--px) * 26); image-rendering: pixelated; animation: gtSeal .45s .35s cubic-bezier(.2,1.6,.4,1) both; }
.gt-card .stamp { position: absolute; right: calc(var(--px) * -8); top: calc(var(--px) * -6); transform: rotate(9deg); font-family: var(--font-display); font-size: 1.2em; color: #fff; padding: 0 calc(var(--px) * 2);
  background: #3a8a3a; box-shadow: 0 0 0 var(--px) #1a3a12; animation: gtSeal .45s .3s cubic-bezier(.2,1.6,.4,1) both; }
.gt-card .stamp.bad { background: #a8302a; box-shadow: 0 0 0 var(--px) #3a1010; }
.gt-card .stamp.gold { background: #c8901a; box-shadow: 0 0 0 var(--px) #4a2a08; }
@keyframes gtSeal { from { transform: rotate(20deg) scale(2.6); opacity: 0; } }
.gt-card .go { margin-top: calc(var(--px) * 3); font-size: .7em; color: var(--ink-soft); animation: gtBlink 1.2s steps(2) infinite; }
@keyframes gtBlink { 50% { opacity: .35; } }
.gt-flash { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse at 50% 50%, rgba(255, 244, 200, .55), rgba(255, 244, 200, 0) 60%); animation: gtFlash .5s ease-out forwards; }
.gt-flash.red { background: radial-gradient(ellipse at 50% 50%, rgba(255, 80, 50, .35), rgba(255, 80, 50, 0) 65%); }
@keyframes gtFlash { to { opacity: 0; } }
@media (max-aspect-ratio: 4/5) {
  .gt-gauge { top: auto; bottom: calc(var(--sab) + var(--px) * 40); transform: none; right: calc(var(--sar) + var(--px) * 6); animation-name: gtSlideP; }
  @keyframes gtSlideP { from { transform: translateX(140%); } }
  .gt-sign { top: calc(var(--sat) + var(--px) * 22); }
  .gt-card { left: 50%; top: calc(var(--sat) + var(--px) * 46); transform: translateX(-50%) rotate(-2deg); animation-name: gtCardP; }
  @keyframes gtCardP { from { transform: translate(-50%, -30%) rotate(-12deg) scale(.4); opacity: 0; } }
  .gt-hint { bottom: calc(var(--sab) + var(--px) * 6); font-size: .85em; }
}
@media (max-height: 500px) { .gt-hint .keys { display: none; } .gt-sign { top: calc(var(--sat) + var(--px) * 8); } }
`;
let styled = false;
function ensureCss() { if (!styled) { styled = true; document.head.append(el('style', { id: 'gt-styles' }, CSS)); } }

// ---------------------------------------------------------------- pixel bits
function plate(p, x0, y0, w, h, R = W) {
  p.rr(x0, y0, w, h, 2, R.base);
  for (let y = y0 + 1; y < y0 + h - 1; y++) for (let x = x0 + 1; x < x0 + w - 1; x++) {
    const g = (x * 7 + Math.floor(y / 5) * 3) % 11;
    if (g === 0) p.set(x, y, R.dk); else if (g === 5 && hash(x, y >> 2) < 0.5) p.set(x, y, R.lt);
  }
  p.hl(x0 + 2, x0 + w - 3, y0 + 1, R.hi); p.vl(x0 + 1, y0 + 2, y0 + h - 3, R.lt);
  p.hl(x0 + 2, x0 + w - 3, y0 + h - 2, R.dd); p.vl(x0 + w - 2, y0 + 2, y0 + h - 3, R.dk);
}
function nail(p, x, y) { p.set(x, y, B.hi); p.set(x + 1, y, B.base); p.set(x, y + 1, B.base); p.set(x + 1, y + 1, B.dd); }
function cap(p, x0, y0, w, h) {
  p.rr(x0, y0, w, h, 1, B.base);
  p.hl(x0 + 1, x0 + w - 2, y0, B.hi); p.hl(x0 + 1, x0 + w - 2, y0 + 1, B.lt);
  p.hl(x0 + 1, x0 + w - 2, y0 + h - 1, B.dd); p.hl(x0 + 1, x0 + w - 2, y0 + h - 2, B.dk);
  p.set(x0 + 1, y0 + 2, B.hi);
}
function icon(p, rows, pal, x, y) { p.tpl(rows, pal, x, y); }
const SPROUT = ['..gg.', '.gGgg', 'gg.g.', '...s.', '..ss.'];
const ROOTS = ['..ss..', '..ss..', '.r.sr.', 'r..s.r', '.r.r..', 'r...r.'];
const CRACK = ['.d.', 'dd.', '.dd', 'd..'];

/** Copy a background Px into another (same size). */
function copyPx(dst, src) { dst.d.set(src.d); }

class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.c = el('canvas', { width: w, height: h });
    this.ctx = this.c.getContext('2d');
    this.p = new Px(w, h);
    this.bg = new Px(w, h);
  }
  show() { this.ctx.putImageData(this.p.img, 0, 0); }
  size(px) { this.c.style.width = `${this.w * px}px`; this.c.style.height = `${this.h * px}px`; }
}

// ---------------------------------------------------------------- gauges
/** The tension tube (pull, dig's pull phase): 40×120 art px. */
class PullGauge {
  constructor(spec) {
    this.spec = spec;
    this.cv = new Canvas(40, 122);
    const p = this.cv.bg;
    plate(p, 1, 1, 38, 98);
    nail(p, 3, 3); nail(p, 35, 3); nail(p, 3, 95); nail(p, 35, 95);
    // the progress slot (left) and the tube (middle)
    p.rect(6, 12, 5, 80, INK); p.rect(7, 13, 3, 78, 0x2a1a10);
    p.rect(15, 10, 12, 84, INK);
    cap(p, 13, 7, 16, 5); cap(p, 13, 92, 16, 5);
    plate(p, 1, 100, 38, 21, { ...W, base: 0x6a4224, lt: 0x8a5a32, hi: 0xa87444, dk: 0x4a2c16, dd: 0x341e0e });
    icon(p, ROOTS, { s: 0xc8a070, r: 0x9a7448 }, 4, 106);
    p.outline(INK);
    this.y = (v) => Math.round(91 - clamp(v / 1.45, 0, 1) * 80);
  }
  draw(s, t) {
    const cv = this.cv, p = cv.p;
    copyPx(p, cv.bg);
    const [lo, hi] = s.band, snap = s.snap;
    const y = this.y;
    // the tube's glass: zones painted behind the column
    for (let yy = 11; yy <= 91; yy++) {
      const v = (91 - yy) / 80 * 1.45;
      let c = 0x1e1612;
      if (v >= lo && v <= hi) c = s.inBand ? ((yy + Math.floor(t * 12)) % 4 ? 0x3e8a2a : 0x56aa3a) : 0x2e5a22;
      else if (v > snap) c = (yy & 1) ? 0x5a1410 : 0x481010;
      else if (v > hi) c = ((yy + 16) % 4 < 2) ? 0x6a3a14 : 0x582c10;
      for (let x = 16; x <= 25; x++) p.set(x, yy, c);
    }
    // band edges
    p.hl(16, 25, y(hi), 0xc8f08a); p.hl(16, 25, y(lo), 0x8ac85a);
    p.hl(16, 25, y(snap), 0xff7a5a);
    // the column: the tension right now
    const top = y(s.pv);
    const colC = s.pv > snap ? 0xff4a2a : s.pv > hi ? (Math.floor(t * 16) % 2 ? 0xff8a3a : 0xe85a2a) : s.pv >= lo ? 0x9af06a : 0xe8c870;
    const colD = s.pv > hi ? 0xa8301a : s.pv >= lo ? 0x4a9a2a : 0xa88a40;
    for (let yy = top; yy <= 91; yy++) for (let x = 18; x <= 23; x++) p.set(x, yy, x === 18 ? 0xffffff : x >= 22 ? colD : colC);
    if (s.grip) p.hl(18, 23, top, 0xffffff);
    // glass sheen and walls
    for (let yy = 10; yy <= 92; yy++) { p.set(15, yy, INK); p.set(26, yy, INK); p.set(16, yy, 0x9ac0bc); if (yy % 9 < 5) p.set(17, yy, 0xd8f0ec, 120); }
    // strain cracks the glass
    if (s.strain > 0.3) {
      const n = Math.floor((s.strain - 0.3) * 10);
      for (let i = 0; i < n; i++) {
        let cx = 17 + Math.floor(hash(i, 3) * 8), cy = 20 + Math.floor(hash(i, 7) * 60);
        for (let k = 0; k < 6; k++) { p.set(cx, cy, 0xf0f0f0); cx += hash(i, k) < 0.5 ? 1 : -1; cy += 1; }
      }
    }
    // the needle
    const sh = s.strain > 0.45 ? Math.round(Math.sin(t * 60) * 1.5) : 0;
    const ny = top + sh;
    p.tpl(['...oo', '.oobo', 'obbbo', '.oobo', '...oo'], { o: INK, b: s.inBand ? 0xc8f08a : B.lt }, 27, ny - 2);
    p.hl(29, 33, ny, s.inBand ? 0xffffff : B.hi);
    // progress (left slot, gold from the bottom)
    const ph = Math.round(clamp(s.prog, 0, 1) * 78);
    for (let yy = 90 - ph + 1; yy <= 90; yy++) { p.set(7, yy, 0xfff0a0); p.set(8, yy, 0xf6be4a); p.set(9, yy, 0xc88a1a); }
    // the sprout on top glows near the end
    icon(p, SPROUT, { g: s.prog > 0.85 ? 0xc8ff8a : 0x6aa84a, G: s.prog > 0.85 ? 0xffffff : 0x8ac85a, s: 0x8a6a48 }, 5, 1);
    // loosening pips: soil cracking under the roots
    const need = s.need, N = 6;
    for (let i = 0; i < N; i++) {
      const x = 12 + i * 4, filled = s.loose >= (i + 1) / N - 1e-3, part = !filled && s.loose > i / N;
      p.rect(x, 108, 3, 7, INK);
      const c = filled ? (s.loose >= need ? 0x8ae05a : 0xc89a5a) : part ? 0x7a5a36 : 0x2a1a10;
      p.rect(x + 1, 109, 1, 5, c);
      if (filled) p.set(x + 1, 109, 0xffffff);
    }
    const fx = 12 + Math.round(need * N * 4) - 1;
    p.vl(fx, 104, 117, s.loose >= need ? 0xffffff : 0xffe066);
    p.set(fx + 1, 104, 0xd83a26); p.set(fx + 2, 104, 0xd83a26); p.set(fx + 1, 105, 0xd83a26);
    if (s.loose >= need) p.tpl(['....g', '...gg', 'g.gg.', 'ggg..', '.g...'], { g: 0x9af06a }, 33, 102);
    // heat / cold strip
    if (s.heat > 0) {
      const c = s.cold ? 0x9ae6ff : 0xff7a2a;
      const n = Math.round(s.heat * 26);
      p.hl(7, 32, 118, 0x2a1a10);
      if (n) p.hl(7, 6 + n, 118, c);
    }
    cv.show();
  }
}

/** The peel speed tube (horizontal): 120×40. */
class PeelGauge {
  constructor(spec) {
    this.spec = spec;
    this.cv = new Canvas(112, 40);
    const p = this.cv.bg;
    plate(p, 1, 1, 110, 38);
    nail(p, 3, 3); nail(p, 107, 3); nail(p, 3, 35); nail(p, 107, 35);
    p.rect(12, 9, 88, 12, INK);
    cap(p, 6, 8, 6, 14); cap(p, 100, 8, 6, 14);
    p.rect(12, 27, 88, 6, INK);
    p.outline(INK);
  }
  draw(s, t) {
    const cv = this.cv, p = cv.p;
    copyPx(p, cv.bg);
    const [lo, hi] = s.speed;
    const vmax = hi * 1.7;
    const X = (v) => 13 + Math.round(clamp(v / vmax, 0, 1) * 85);
    for (let x = 13; x <= 98; x++) {
      const v = (x - 13) / 85 * vmax;
      const c = v < lo * 0.6 ? 0x1e1612 : v <= hi ? (s.inBand ? 0x46962e : 0x2e5a22) : ((x + Math.floor(t * 10)) % 4 < 2 ? 0x6a2a14 : 0x581c10);
      for (let y = 10; y <= 19; y++) p.set(x, y, c);
    }
    const end = X(s.v);
    const col = s.v > hi ? 0xff6a3a : s.v >= lo * 0.6 ? 0x9af06a : 0xe8c870;
    for (let x = 13; x <= end; x++) for (let y = 12; y <= 17; y++) p.set(x, y, y === 12 ? 0xffffff : y >= 16 ? 0x3a6a24 : col);
    p.tpl(['oo...', 'obo..', 'obbo.', 'obo..', 'oo...'].map((r) => r), { o: INK, b: B.lt }, end - 1, 20);
    // the peel's progress: the mat rolling back
    const pw = Math.round(clamp(s.p, 0, 1) * 86);
    for (let x = 13; x < 13 + pw; x++) for (let y = 28; y <= 31; y++) p.set(x, y, y === 28 ? 0xc8ffb0 : 0x5ab84a);
    if (s.warn > 0 && Math.floor(t * 10) % 2) {
      p.tpl(['..yy', '.yy.', 'yyyy', '..y.', '.y..'], { y: 0xc8f4ff }, 104, 26);
    }
    if (s.tear > 0.2) for (let i = 0; i < Math.floor(s.tear * 8); i++) p.set(20 + Math.floor(hash(i, 2) * 70), 10 + Math.floor(hash(i, 5) * 9), 0xffffff);
    cv.show();
  }
}

/** The berry basket (pick): picked berries fill it, squashed ones show as stains. 96×40. */
class PickGauge {
  constructor(spec, sim) {
    this.spec = spec; this.sim = sim;
    this.cv = new Canvas(96, 40);
    const p = this.cv.bg;
    const S = { hi: 0xf6d898, lt: 0xe2b66a, base: 0xc8924a, dk: 0x9a6830, dd: 0x6a4420 };
    // a wicker basket: handle, woven body
    for (let a = 0; a <= 40; a++) { const x = 48 + Math.round(Math.cos(Math.PI * a / 40) * 34), y = 18 - Math.round(Math.sin(Math.PI * a / 40) * 14); p.set(x, y, S.dk); p.set(x, y + 1, S.lt); }
    p.rr(8, 17, 80, 21, 3, S.base);
    for (let y = 18; y < 37; y++) for (let x = 9; x < 87; x++) p.set(x, y, ((x >> 2) + (y >> 1)) % 2 ? S.lt : S.dk);
    p.hl(9, 86, 17, S.hi); p.hl(9, 86, 36, S.dd);
    p.outline(INK);
  }
  draw(s, t) {
    const cv = this.cv, p = cv.p;
    copyPx(p, cv.bg);
    const n = this.sim.ripeN;
    const pk = this.sim.picked, sq = this.sim.squashed;
    for (let i = 0; i < Math.max(n, pk + sq); i++) {
      const x = 14 + (i % 9) * 8, y = 21 + Math.floor(i / 9) * 8;
      if (i < pk) {
        p.disk(x + 3, y + 3, 3, 0xd02a40); p.set(x + 2, y + 1, 0xffb0b8); p.set(x + 3, y, 0x3a7a2a);
      } else if (i < pk + sq) {
        p.rect(x + 1, y + 3, 5, 2, 0x8a1a28); p.set(x + 3, y + 2, 0xb02a3a);
      } else p.disk(x + 3, y + 3, 2.6, 0x4a3018);
    }
    if (this.sim.streak > 1) {
      const k = Math.min(9, this.sim.streak);
      p.tpl(['x.x', '.x.', 'x.x'], { x: 0xffe066 }, 76, 2);
      p.tpl([['.oo.', 'o..o', 'o..o', 'o..o', '.oo.'], ['..o.', '.oo.', '..o.', '..o.', '.ooo'], ['ooo.', '...o', '.oo.', 'o...', 'oooo'], ['ooo.', '...o', '.oo.', '...o', 'ooo.'], ['o..o', 'o..o', 'oooo', '...o', '...o'], ['oooo', 'o...', 'ooo.', '...o', 'ooo.'], ['.oo.', 'o...', 'ooo.', 'o..o', '.oo.'], ['oooo', '...o', '..o.', '.o..', '.o..'], ['.oo.', 'o..o', '.oo.', 'o..o', '.oo.'], ['.oo.', 'o..o', '.ooo', '...o', '.oo.']][k], { o: 0xffe066 }, 81, 1);
    }
    cv.show();
  }
}

/** Egg lifting: a height tube and a spirit level. 40×100. */
class LiftGauge {
  constructor(spec) {
    this.cv = new Canvas(44, 104);
    const p = this.cv.bg;
    plate(p, 1, 1, 42, 102);
    nail(p, 3, 3); nail(p, 39, 3); nail(p, 3, 99); nail(p, 39, 99);
    p.rect(16, 10, 12, 66, INK);
    cap(p, 14, 7, 16, 4); cap(p, 14, 75, 16, 4);
    p.rect(5, 86, 34, 10, INK);
    p.outline(INK);
  }
  draw(s, t) {
    const cv = this.cv, p = cv.p;
    copyPx(p, cv.bg);
    const Y = (v) => Math.round(74 - clamp(v, 0, 1.1) / 1.1 * 63);
    for (let y = 11; y <= 74; y++) for (let x = 17; x <= 26; x++) p.set(x, y, y <= Y(0.92) ? 0x2e5a22 : 0x1e1612);
    const top = Y(s.h);
    for (let y = top; y <= 74; y++) for (let x = 19; x <= 24; x++) p.set(x, y, x === 19 ? 0xffffff : 0xe8d8a8);
    p.hl(17, 26, Y(0.92), 0xc8f08a);
    // the egg icon rides the column
    p.ellipse(22, top - 3, 3, 4, 0xe8f0d0); p.set(21, top - 5, 0xffffff);
    // spirit level: the bubble must stay in the middle
    for (let x = 6; x <= 37; x++) for (let y = 87; y <= 94; y++) p.set(x, y, Math.abs(x - 21.5) < 5 ? 0x4a8a3a : 0x6aa8a0);
    p.vl(16, 87, 94, INK); p.vl(27, 87, 94, INK);
    const bx = Math.round(21.5 + clamp(s.tilt, -1.1, 1.1) * 14);
    p.ellipse(bx, 90.5, 3.5, 2.6, Math.abs(s.tilt) > 0.7 ? 0xff6a4a : 0xf8fff0);
    p.set(bx - 1, 89, 0xffffff);
    cv.show();
  }
}

/** Digging: how much soil is left on top, then the tension tube. */
class DigGauge {
  constructor(spec) {
    this.pull = new PullGauge(spec);
    this.cv = this.pull.cv;
  }
  draw(s, t) {
    if (s.phase === 'pull') { this.pull.draw(s, t); return; }
    const cv = this.cv, p = cv.p;
    copyPx(p, cv.bg);
    // the tube shows the soil still covering it: brown from the bottom, emptying as you scrub
    const left = clamp(s.cover, 0, 1);
    const top = Math.round(91 - left * 80);
    for (let yy = 11; yy <= 91; yy++) for (let x = 16; x <= 25; x++) p.set(x, yy, yy >= top ? ((x + yy) % 3 ? 0x6a4a30 : 0x5a3e28) : 0x1e1612);
    p.hl(16, 25, Math.round(91 - 0.12 * 80), 0x9af06a);
    for (let yy = 10; yy <= 92; yy++) { p.set(15, yy, INK); p.set(26, yy, INK); p.set(16, yy, 0x9ac0bc); }
    icon(p, SPROUT, { g: 0x6aa84a, G: 0x8ac85a, s: 0x8a6a48 }, 5, 1);
    // scrub arrows
    const k = Math.floor(t * 4) % 2;
    p.tpl(['..o', '.oo', 'ooo', '.oo', '..o'], { o: k ? 0xffe066 : 0x8a6a48 }, 8, 108);
    p.tpl(['o..', 'oo.', 'ooo', 'oo.', 'o..'], { o: k ? 0x8a6a48 : 0xffe066 }, 29, 108);
    cv.show();
  }
}

// ---------------------------------------------------------------- the HUD
export class GatherHud {
  constructor(game, id, spec, sim, o = {}) {
    ensureCss();
    this.game = game;
    this.id = id; this.spec = spec; this.sim = sim;
    const it = ITEMS[id];
    const touch = document.documentElement.classList.contains('is-touch');
    this.root = el('div', { class: 'gt-hud' });
    const word = { pull: spec.twist ? 'TWIST!' : o.down ? 'PULL!' : 'PULL!', dig: 'DIG!', peel: 'PEEL!', pick: 'PICK!', lift: 'LIFT!' }[spec.tech] || 'PULL!';
    this.sign = el('div', { class: 'gt-sign' }, [el('img', { src: iconURL(id), alt: '' }), el('span', { class: 'gt-name' }, it?.name || id), el('span', { class: 'gt-verb' }, word)]);
    const G = { pull: PullGauge, dig: DigGauge, peel: PeelGauge, pick: PickGauge, lift: LiftGauge }[spec.tech] || PullGauge;
    this.gauge = new G(spec, sim);
    this.gaugeEl = el('div', { class: 'gt-gauge' }, [this.gauge.cv.c]);
    const how = touch ? {
      pull: `Hold and <b>drag ${o.down ? 'down' : 'up'}</b> · swing side to side to loosen`,
      dig: 'Hold and <b>scrub side to side</b>, then drag up gently',
      peel: 'Hold the edge and <b>drag left</b>, slowly',
      pick: '<b>Tap</b> as the ring touches a red berry',
      lift: 'Hold, <b>drag up</b> slowly, lean left/right against the wobble',
    } : {
      pull: `<kbd>Hold</kbd> the mouse, move ${o.down ? 'down' : 'up'} to pull, side to side to loosen · or <kbd>Space</kbd>+<kbd>W</kbd> <kbd>A</kbd>/<kbd>D</kbd>`,
      dig: '<kbd>Hold</kbd> and scrub side to side, then up · or <kbd>Space</kbd>+<kbd>A</kbd>/<kbd>D</kbd>, <kbd>W</kbd>',
      peel: '<kbd>Hold</kbd> and drag left, slowly · or hold <kbd>A</kbd>',
      pick: '<kbd>Click</kbd> / <kbd>Space</kbd> as the ring touches a red berry',
      lift: '<kbd>Hold</kbd> and lift slowly, lean with left/right · or <kbd>W</kbd> + <kbd>A</kbd>/<kbd>D</kbd>',
    };
    this.hint = el('div', { class: 'gt-hint', html: `${spec.tip || 'Pull it out <b>whole</b>.'}<span class="keys">${how[spec.tech] || how.pull}${touch ? '' : ' · <kbd>Esc</kbd> leave it'}</span>` });
    this.leave = el('button', { class: 'gt-leave gt-btn', onclick: () => o.onLeave?.() }, 'Leave it');
    this.pops = el('div', { class: 'gt-pops' });
    this.root.append(this.pops, this.sign, this.gaugeEl, this.hint, this.leave);
    this.popEls = new Map();
    this.t = 0;
    this.resize();
  }
  resize() {
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
    this.px = px;
    this.gauge.cv.size(px);
  }
  /** s: the sim's visible state (see the session). */
  update(dt, s) {
    this.t += dt;
    this.gauge.draw(s, this.t);
    this.gaugeEl.classList.toggle('shake', s.strain > 0.55);
    // the hint steps back once you've got the hang of it
    if (s.started && !this.hintDim && (this.t > 7 || (s.inBand && this.t > 2.5))) { this.hintDim = true; this.hint.classList.add('dim'); }
  }
  /** Floating words at screen points: [{ id, text, color, big, x, y }] (new ones only animate once). */
  words(list) {
    for (const w of list) {
      if (this.popEls.has(w.id)) continue;
      const n = el('div', { class: 'gt-pop' + (w.big ? ' big' : ''), style: { left: `${w.x}px`, top: `${w.y}px`, color: w.color } }, w.text);
      this.pops.append(n);
      this.popEls.set(w.id, n);
      setTimeout(() => { n.remove(); this.popEls.delete(w.id); }, 1100);
    }
  }
  flash(red = false) {
    const f = el('div', { class: 'gt-flash' + (red ? ' red' : '') });
    this.root.append(f);
    setTimeout(() => f.remove(), 520);
  }
  /** The result: hide the controls, pin the tag. */
  result(r) {
    this.hint.classList.add('hide');
    // the sign's verb turns into the verdict
    const v = this.sign.querySelector('.gt-verb');
    if (v) {
      v.textContent = r.empty ? 'EMPTY' : r.snapped ? (r.broke ? 'CRACKED' : 'SNAPPED') : r.p ? 'PERFECT!' : 'GOT IT!';
      v.style.background = r.snapped || r.empty ? '#8a2a20' : r.p ? '#c8901a' : '#3a8a3a';
      v.style.boxShadow = `0 0 0 var(--px) ${r.snapped || r.empty ? '#3a1010' : r.p ? '#4a2a08' : '#1a3a12'}`;
      this.sign.classList.add('swing');
    }
    this.gaugeEl.style.transition = 'opacity .3s, transform .3s';
    this.gaugeEl.style.opacity = '0';
    this.leave.style.display = 'none';
    const it = ITEMS[this.id];
    const stars = r.empty ? 0 : Math.max(1, Math.min(5, Math.round(r.q / 20)));
    const col = r.p ? '#b07a14' : r.q >= 70 ? '#3a7a2a' : r.q >= 40 ? '#3a6a9a' : '#a83a2a';
    const touch = document.documentElement.classList.contains('is-touch');
    this.card = el('div', { class: 'gt-card' }, [
      el('img', { src: iconURL(this.id), alt: '', style: { width: 'var(--icon)', height: 'var(--icon)', imageRendering: 'pixelated' } }),
      el('div', { class: 'nm' }, it?.name || this.id),
      el('div', { class: 'q', style: { color: col } }, r.empty ? '—' : `${r.q}%`),
      el('div', { class: 'st', html: '★'.repeat(stars) + `<i>${'★'.repeat(5 - stars)}</i>` }),
      el('div', { class: 'w' }, r.word || ''),
      r.n > 1 ? el('div', { class: 'n' }, `×${r.n}`) : null,
      r.p ? el('img', { class: 'seal', src: SPR.seal('amber', 'star'), alt: 'Pristine' }) : null,
      r.p ? el('span', { class: 'stamp gold' }, 'PRISTINE') : r.snapped || r.empty ? el('span', { class: 'stamp bad' }, r.empty ? 'EMPTY' : r.broke ? 'CRACKED' : 'TORN') : null,
      el('div', { class: 'go' }, touch ? 'tap to carry on' : 'click or Space to carry on'),
    ]);
    this.root.append(this.card);
  }
  dispose() { this.root.remove(); }
}
