// Old Star talks: a speech card with his portrait in pixel art (game.ui.tutor). Every scene calls
//   game.ui.tutor?.say(html, { mood, key, wait, dur, name })   → Promise (resolves when the line is gone)
//   game.ui.tutor?.hide(key?)                                   (hide the line; with a key, only that line)
// mood: 'calm' | 'happy' | 'stern' | 'proud' | 'worried' | 'laugh' (the portrait changes with it).
// key: the line's id: saying the same key again while it is up only updates it (no retyping), and
//   hide(key) leaves anyone else's line alone.
// wait: true keeps the card up until the player carries on (E, Space, Enter, a click or tap on the
//   card); otherwise it goes after a reading time (dur seconds overrides it; dur: Infinity keeps it
//   up until hide() or the next line). A new line replaces the one showing (its promise resolves).
// place: 'top' puts the card at the top of the screen (it is there anyway on touch screens), for
//   scenes whose work happens low in the view (the forge).
// The text types itself out in Old Star's mumbly voice; his star nose wiggles, he blinks, his mouth
// moves while he talks. Also: tutor.active ({ key, mood, html, wait } or null), tutor.next() (carry
// on, as the player would), starPortrait(mood, frame) → a canvas, starPortraitURL(mood).
import { el, clamp } from '../core/util.js';
import { PixelCanvas } from '../gfx/px/canvas.js';
import './tutor.css';

export const MOODS = ['calm', 'happy', 'stern', 'proud', 'worried', 'laugh'];
const S = 40; // portrait size (art pixels)
const FR = 3; // brass frame round it (art pixels)
const VOICE = { calm: 205, happy: 240, stern: 165, proud: 215, worried: 250, laugh: 270 };
const isTouch = () => document.documentElement.classList.contains('is-touch');

// ---------------------------------------------------------------- the portrait
const P = {
  bg: 0x1c1216, bg2: 0x2a1a1a, glow: 0x6a3018, glow2: 0x8a4a1e,
  coat: 0x76643e, coatDk: 0x544628, coatLt: 0x948052, coatDd: 0x3c321c,
  vest: 0x8a6a34, vestDk: 0x664a22, shirt: 0xd8ccb0,
  strap: 0x6a4224, strapDk: 0x4a2c16, brass: 0xc8a048, brassDk: 0x8a6a28, brassLt: 0xf0d080,
  fur: 0x4a4044, furDk: 0x322a2e, furDd: 0x241e22, furLt: 0x625860,
  grey: 0x8a8288, greyLt: 0xaca4a8, white: 0xe2dcd8,
  helm: 0x9a8448, helmLt: 0xbaa460, helmHi: 0xd8c482, helmDk: 0x76643a, helmDd: 0x544628,
  lampDk: 0x4a4038, lens: 0xd8b860, lensHi: 0xfff0b0,
  glass: 0x9ab4bc, eye: 0x160e14, eyeHi: 0xffffff,
  brow: 0xeae4dc, browDk: 0xb8b0a8,
  star: 0xf08aa0, starLt: 0xffbccc, starDk: 0xc85068, starDd: 0x8a3044,
  mouth: 0x3a1418, tongue: 0xd85a6a, tooth: 0xf0e8e0,
  whisker: 0xd8d0c8, sweat: 0x9ad0f0, sweatLt: 0xe8f8ff, blush: 0xd86a7a,
};

/** Bresenham-ish thick ray from radius r0 to r1 at angle a around (cx, cy). */
function ray(pc, cx, cy, a, r0, r1, c, c2) {
  const n = Math.ceil((r1 - r0) * 2);
  for (let i = 0; i <= n; i++) {
    const r = r0 + (r1 - r0) * (i / n);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    pc.set(Math.floor(x), Math.floor(y), i >= n - 1 && c2 !== undefined ? c2 : c);
  }
}

/** One frame of Old Star's face. f: { blink, talk (0 closed, 1 open, 2 wide), wig (0/1) }. */
function drawStar(mood, f = {}) {
  const pc = new PixelCanvas(S);
  const set = (x, y, c) => pc.set(x, y, c);
  // backdrop: the cave, warmed from below-right by the forge
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const g = clamp(1 - Math.hypot(x - 33, y - 36) / 30, 0, 1);
    const d = ((x * 7 + y * 13) % 4) / 4; // ordered dither
    set(x, y, g > 0.55 + d * 0.2 ? P.glow2 : g > 0.25 + d * 0.25 ? P.glow : g > 0.06 + d * 0.12 ? P.bg2 : P.bg);
  }
  // a couple of glowing motes
  for (const [x, y] of [[4, 6], [35, 4], [3, 27], [36, 17]]) set(x, y, mood === 'worried' ? 0x5a6a7a : 0x8a5a2a);

  // ---- shoulders: the long coat, collar up, waistcoat and the satchel strap
  pc.poly([[0, 40], [2, 33], [9, 29], [31, 29], [38, 33], [40, 40]], P.coat);
  for (let x = 1; x < 39; x++) set(x, 39, P.coatDk);
  pc.poly([[14, 40], [16, 31], [24, 31], [26, 40]], P.vest);
  pc.poly([[17, 40], [18, 32], [22, 32], [23, 40]], P.shirt);
  for (let y = 33; y < 40; y += 2) set(20, y, P.vestDk);
  set(15, 35, P.brass); set(15, 38, P.brass); set(25, 35, P.brass); set(25, 38, P.brass);
  // the collar points, turned up past the jowls
  pc.poly([[6, 34], [8, 26], [12, 29], [14, 36]], P.coatLt);
  pc.poly([[34, 34], [32, 26], [28, 29], [26, 36]], P.coatLt);
  pc.line(8, 26, 12, 30, P.coatDk); pc.line(32, 26, 28, 30, P.coatDk);
  pc.line(6, 34, 14, 36, P.coatDd); pc.line(34, 34, 26, 36, P.coatDd);
  // satchel strap from the right shoulder down across the chest
  for (let i = 0; i < 12; i++) { set(30 - i, 30 + Math.floor(i * 0.8), P.strap); set(31 - i, 30 + Math.floor(i * 0.8), P.strap); set(29 - i, 31 + Math.floor(i * 0.8), P.strapDk); }
  set(26, 33, P.brass); set(27, 33, P.brassLt); set(26, 34, P.brassDk);
  // a sewn patch on the left shoulder
  pc.rect(3, 34, 4, 3, 0x5a6a48); for (const [x, y] of [[3, 34], [6, 34], [3, 36], [6, 36]]) set(x, y, 0xe8dcb8);

  // ---- head: dark old fur, greying round the snout
  pc.ellipse(20, 20.5, 13.2, 12, P.fur);
  for (let y = 9; y < 33; y++) for (let x = 6; x < 35; x++) {
    if (pc.get(x, y) !== P.fur) continue;
    const dx = (x + 0.5 - 20) / 13.2, dy = (y + 0.5 - 20.5) / 12;
    const r = dx * dx + dy * dy;
    if (r > 0.82 && (dx > 0.2 || dy > 0.3)) set(x, y, P.furDk);
    else if (r < 0.45 && dx < -0.15 && dy < -0.1) set(x, y, P.furLt);
    // fur strands
    if ((x * 3 + y * 5) % 11 === 0 && r < 0.8) set(x, y, P.furDk);
  }
  // jowls fluff over the collar
  for (const [x, y] of [[8, 29], [9, 31], [11, 32], [31, 29], [30, 31], [28, 32], [7, 27], [32, 27]]) set(x, y, P.furDk);
  // grey muzzle
  pc.ellipse(20, 26.5, 8.6, 6.2, P.grey);
  pc.ellipse(20, 26, 6.6, 4.8, P.greyLt);
  for (const [x, y] of [[12, 25], [28, 25], [13, 30], [27, 30], [16, 31], [24, 31]]) set(x, y, P.grey);
  if (mood === 'happy' || mood === 'laugh' || mood === 'proud') for (const [x, y] of [[10, 24], [11, 24], [29, 24], [30, 24], [10, 25], [30, 25]]) pc.set(x, y, P.blush, 150);

  // ---- helmet: a battered brass-khaki dome, its lamp gone dim
  pc.ellipse(20, 12, 12.5, 8.5, P.helm);
  for (let y = 0; y < 14; y++) for (let x = 6; x < 34; x++) {
    if (pc.get(x, y) !== P.helm) continue;
    const dx = (x + 0.5 - 20) / 12.5, dy = (y + 0.5 - 12) / 8.5;
    if (dx < -0.35 && dy < -0.25) set(x, y, P.helmLt);
    if (dx < -0.5 && dy < -0.45) set(x, y, P.helmHi);
    if (dx > 0.55 || dy > 0.6) set(x, y, P.helmDk);
  }
  // clear below the brim line (the dome is only the top)
  for (let y = 14; y < 21; y++) for (let x = 6; x < 35; x++) if (pc.get(x, y) === P.helm || pc.get(x, y) === P.helmDk || pc.get(x, y) === P.helmLt) set(x, y, P.fur);
  // dents and a scratch
  set(12, 7, P.helmDk); set(13, 6, P.helmDk); set(27, 9, P.helmDd); set(28, 8, P.helmDk); pc.line(23, 4, 26, 6, P.helmDk);
  // crest ridge
  for (let y = 4; y < 12; y++) set(20, y, P.helmDk);
  // brim
  for (let x = 5; x <= 35; x++) { set(x, 13, P.helmDk); set(x, 14, P.helmDd); }
  for (let x = 7; x <= 33; x++) set(x, 12, P.helm);
  set(5, 14, 0); pc.clear(5, 14); set(4, 14, P.helmDd); set(36, 14, P.helmDd); set(35, 13, P.helmDk);
  // rivets
  for (const x of [9, 15, 25, 31]) set(x, 12, P.lens);
  // the lamp
  pc.disk(20, 8.5, 3.6, P.brassDk);
  pc.disk(20, 8.5, 2.8, P.brass);
  pc.disk(20, 8.5, 2.0, mood === 'worried' ? 0xa89050 : P.lens);
  set(19, 7, P.lensHi); set(20, 7, P.lensHi);
  pc.emit(20, 8, 0.5);

  // ---- brows: bushy white tufts under the brim (they do most of the acting)
  const brow = (cx, side) => {
    // tilt: + raises the inner end; per mood
    const tilt = { calm: 0, happy: 1.2, stern: -3, proud: side < 0 ? 1.5 : -0.5, worried: 3, laugh: 1.5 }[mood] || 0;
    const lift = { calm: 0, happy: -1, stern: 1, proud: side < 0 ? -1 : 0, worried: -1, laugh: -1 }[mood] || 0;
    for (let i = -3; i <= 3; i++) {
      const inner = side * i; // >0 toward the middle of the face
      const y = 14 + lift - Math.round((inner / 3) * tilt * 0.5) + (Math.abs(i) === 3 ? 1 : 0);
      const x = cx + i;
      set(x, y, P.brow);
      set(x, y + 1, (x + y) % 3 ? P.brow : P.browDk);
      if (Math.abs(i) < 3) set(x, y - 1, (x * 5) % 3 ? P.brow : P.white);
    }
    // a stray hair or two curling out
    set(cx - side * 4, 14 + lift, P.browDk); set(cx - side * 4, 13 + lift, P.brow);
  };
  brow(13, 1); brow(27, -1);
  if (mood === 'stern') { set(19, 17, P.furDd); set(21, 17, P.furDd); set(20, 16, P.furDd); }
  if (mood === 'worried') { set(19, 15, P.furDd); set(21, 15, P.furDd); }

  // ---- spectacles and eyes
  const eye = (cx, cy, side) => {
    pc.disk(cx, cy, 3.7, P.brassDk);
    pc.disk(cx, cy, 3.0, P.glass);
    // lens: the fur shows through, tinted
    pc.disk(cx, cy, 2.5, 0x6a6a74);
    set(cx - 2, cy - 2, P.eyeHi);
    const ex = Math.floor(cx), ey = Math.floor(cy);
    if (f.blink || mood === 'laugh') {
      if (mood === 'laugh') { // squeezed shut: ^ ^
        set(ex - 1, ey, P.eye); set(ex, ey - 1, P.eye); set(ex + 1, ey, P.eye);
      } else { set(ex - 1, ey, P.eye); set(ex, ey, P.eye); set(ex + 1, ey, P.eye); }
    } else if (mood === 'happy') {
      set(ex - 1, ey, P.eye); set(ex, ey - 1, P.eye); set(ex + 1, ey, P.eye); set(ex, ey, P.eye);
    } else if (mood === 'proud') {
      // content, half-lidded
      set(ex - 1, ey, P.eye); set(ex, ey, P.eye); set(ex + 1, ey, P.eye); set(ex, ey + 1, P.eye);
      set(ex - 1, ey - 1, P.fur); set(ex, ey - 1, P.fur); set(ex + 1, ey - 1, P.fur);
    } else if (mood === 'stern') {
      set(ex, ey, P.eye); set(ex + side, ey, P.eye); set(ex, ey + 1, P.eye); set(ex + side, ey + 1, P.eye);
      for (let i = -1; i <= 1; i++) set(ex + i, ey - 1 - (i * side > 0 ? 0 : 1) + 1, P.furDk);
    } else if (mood === 'worried') {
      // wide, small pupils
      pc.disk(cx, cy, 1.7, 0xd8d4d0);
      set(ex, ey, P.eye); set(ex - side, ey, P.eye);
    } else {
      set(ex, ey, P.eye); set(ex - 1, ey, P.eye); set(ex, ey + 1, P.eye); set(ex - 1, ey + 1, P.eye);
      set(ex - 1, ey, 0x4a3a50);
    }
    set(cx + 1.6, cy - 1.6, 0xd0e4ea);
  };
  eye(14, 19, 1); eye(26, 19, -1);
  // bridge and arms
  for (let x = 17; x <= 23; x++) set(x, x === 20 ? 19 : 18, P.brass);
  pc.line(10, 18, 7, 17, P.brassDk); pc.line(30, 18, 33, 17, P.brassDk);
  if (mood === 'laugh') { set(10, 21, P.sweat); set(30, 21, P.sweat); set(10, 22, P.sweatLt); set(30, 22, P.sweatLt); }

  // ---- whiskers (behind the star): two to a side, fine and pale
  const wk = mood === 'laugh' ? -1 : mood === 'worried' ? 1 : 0;
  for (const s of [-1, 1]) {
    pc.line(20 + s * 9, 27, 20 + s * 16, 25 + wk, P.whisker, 150);
    pc.line(20 + s * 9, 29, 20 + s * 16, 30 - wk, P.whisker, 120);
  }

  // ---- the mouth under the star
  const my = 33;
  const talk = mood === 'laugh' ? 2 + (f.talk ? 1 : 0) : f.talk || 0;
  if (talk) {
    const w = talk >= 2 ? 3 : 2, h = talk >= 3 ? 3 : 2;
    pc.rect(20 - w, my - 1, w * 2, h, P.mouth);
    pc.rect(20 - w + 1, my + h - 2, w * 2 - 2, 1, P.tongue);
    if (talk >= 2) { set(20 - w, my - 1, P.tooth); set(20 + w - 1, my - 1, P.tooth); }
  } else if (mood === 'happy' || mood === 'proud') {
    const sk = mood === 'proud' ? 1 : 0;
    set(16 + sk, my - 1, P.mouth); set(17 + sk, my, P.mouth); for (let x = 18; x <= 22; x++) set(x + sk, my + (mood === 'happy' && x > 18 && x < 22 ? 1 : 0), P.mouth); set(23 + sk, my, P.mouth); set(24 + sk, my - 1 - sk, P.mouth);
  } else if (mood === 'stern') {
    for (let x = 17; x <= 23; x++) set(x, my, P.mouth);
    set(16, my + 1, P.mouth); set(24, my + 1, P.mouth);
  } else if (mood === 'worried') {
    set(16, my + 1, P.mouth); set(17, my, P.mouth); set(18, my, P.mouth); set(19, my + 1, P.mouth); set(20, my + 1, P.mouth); set(21, my, P.mouth); set(22, my, P.mouth); set(23, my + 1, P.mouth); set(24, my + 1, P.mouth);
  } else {
    for (let x = 18; x <= 22; x++) set(x, my, P.mouth);
  }

  // ---- the star: fleshy pink rays (22 on him; 12 read at this size) round the snout
  const cx = 20, cy = 25.5;
  const spread = mood === 'laugh' || mood === 'happy' ? 0.8 : mood === 'stern' ? -0.7 : mood === 'worried' ? -0.4 : 0;
  const wig = f.wig ? 0.06 : 0;
  const N = 12;
  // a shadow ring so the star stands off the grey muzzle
  pc.disk(cx, cy, 6.2 + spread, P.grey, 255);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + wig * (i % 2 ? 1 : -1) - Math.PI / 2 + Math.PI / N;
    const droop = mood === 'worried' ? Math.max(0, Math.sin(a)) * 0.8 : 0;
    const len = 5.6 + spread + ((i * 7) % 3) * 0.3 - droop + (f.wig && i % 2 ? 0.6 : 0);
    ray(pc, cx + Math.cos(a) * 0.4, cy + Math.sin(a) * 0.4, a, 2.4, len, P.starDk);
  }
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + wig * (i % 2 ? 1 : -1) - Math.PI / 2 + Math.PI / N;
    const droop = mood === 'worried' ? Math.max(0, Math.sin(a)) * 0.8 : 0;
    const len = 5.6 + spread + ((i * 7) % 3) * 0.3 - droop + (f.wig && i % 2 ? 0.6 : 0);
    ray(pc, cx, cy, a, 2.0, len - 0.6, P.star, P.starLt);
  }
  pc.disk(cx, cy, 2.9, P.starDk);
  pc.disk(cx, cy - 0.3, 2.3, P.star);
  set(19, 24, P.starLt); set(20, 24, P.starLt); set(18, 25, P.starLt);
  set(19, 26, P.starDd); set(21, 26, P.starDd); // nostrils
  // ---- mood extras
  if (mood === 'worried') { set(33, 16, P.sweatLt); set(33, 17, P.sweat); set(32, 18, P.sweat); set(33, 18, P.sweat); set(34, 18, P.sweat); set(33, 19, P.sweat); }
  if (mood === 'proud') { const sx = 34, sy = 6; set(sx, sy, 0xfff4b0); set(sx - 1, sy, 0xf2c23a); set(sx + 1, sy, 0xf2c23a); set(sx, sy - 1, 0xf2c23a); set(sx, sy + 1, 0xf2c23a); }
  if (mood === 'stern') for (const [x, y] of [[33, 4], [34, 3], [35, 4], [34, 5]]) set(x, y, 0xb83a2a);
  if (mood === 'laugh') for (const [x, y] of [[2, 10], [3, 9], [36, 11], [37, 10]]) set(x, y, 0xf2c23a);
  // a dark outline round the silhouette (head + helmet) against the backdrop
  outline(pc);
  pc.ctx.putImageData(pc.img, 0, 0);
  return pc.canvas;
}

/** 1px dark outline where the character meets the backdrop. */
function outline(pc) {
  const bg = new Set([P.bg, P.bg2, P.glow, P.glow2]);
  const isBg = (x, y) => { const c = pc.get(x, y); return c < 0 || bg.has(c); };
  const marks = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!isBg(x, y)) continue;
    if ((x > 0 && !isBg(x - 1, y)) || (x < S - 1 && !isBg(x + 1, y)) || (y > 0 && !isBg(x, y - 1)) || (y < S - 1 && !isBg(x, y + 1))) marks.push([x, y]);
  }
  for (const [x, y] of marks) pc.set(x, y, 0x0e080a);
}

let frameC = null;
/** The riveted brass frame (S + 2·FR square, the middle left clear). */
function brassFrame() {
  if (frameC) return frameC;
  const n = S + FR * 2;
  const pc = new PixelCanvas(n);
  const B = { hi: 0xfff0b0, lt: 0xf0cc6a, base: 0xc89a3a, dk: 0x8a6420, dd: 0x4a3010 };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const d = Math.min(x, y, n - 1 - x, n - 1 - y);
    if (d >= FR) continue;
    const tl = x + y < n - 1;
    const c = d === 0 ? B.dd : d === 1 ? (tl ? B.hi : B.base) : (tl ? B.base : B.dk);
    pc.set(x, y, c);
  }
  // corners cut, rivets
  for (const [x, y] of [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1]]) pc.clear(x, y);
  for (const [x, y] of [[1, 1], [n - 2, 1], [1, n - 2], [n - 2, n - 2], [Math.floor(n / 2), 1], [Math.floor(n / 2), n - 2], [1, Math.floor(n / 2)], [n - 2, Math.floor(n / 2)]]) { pc.set(x, y, B.lt); }
  // inner shadow line
  for (let i = FR; i < n - FR; i++) { pc.set(i, FR, 0x0a0608, 140); pc.set(FR, i, 0x0a0608, 140); }
  pc.ctx.putImageData(pc.img, 0, 0);
  frameC = pc.canvas;
  return frameC;
}

const cache = new Map();
/** A frame of the portrait as a 40×40 canvas (cached). frame: { blink, talk, wig }. */
export function starPortrait(mood = 'calm', frame = {}) {
  if (!MOODS.includes(mood)) mood = 'calm';
  const k = `${mood}|${frame.blink ? 1 : 0}|${frame.talk || 0}|${frame.wig ? 1 : 0}`;
  if (!cache.has(k)) cache.set(k, drawStar(mood, frame));
  return cache.get(k);
}
/** The portrait as a data URL (for books, notes and panels). */
export function starPortraitURL(mood = 'calm') { return starPortrait(mood).toDataURL(); }

// ---------------------------------------------------------------- the card
export class Tutor {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.cur = null;
    this.face = el('canvas', { class: 'pix tt-face-c', width: S + FR * 2, height: S + FR * 2, 'aria-hidden': 'true' });
    this.fctx = this.face.getContext('2d');
    this.nameEl = el('div', { class: 'tt-name' });
    this.textEl = el('div', { class: 'tt-text' });
    this.nextEl = el('div', { class: 'tt-next', 'aria-hidden': 'true' }, [el('kbd', {}, 'E'), el('span', { class: 'tt-tap' }, 'tap'), el('i', {}, '▶')]);
    this.card = el('div', { class: 'tt-card interactive', role: 'status', 'aria-live': 'polite' }, [
      el('div', { class: 'tt-face' }, [this.face]),
      el('div', { class: 'tt-body' }, [this.nameEl, this.textEl, this.nextEl]),
    ]);
    this.el = el('div', { class: 'tutor', hidden: true }, [this.card]);
    ui.root.insertBefore(this.el, ui.overlay);
    this.card.addEventListener('pointerdown', (e) => {
      if (!this.cur) return;
      e.preventDefault();
      e.stopPropagation();
      this.game.audio.init?.();
      this.advance();
    });
    // keys carry a waiting line on (and never reach the game while it waits)
    window.addEventListener('keydown', (e) => {
      const c = this.cur;
      if (!c || !c.wait || e.repeat || this.ui.isPanelOpen?.()) return;
      if (e.code !== 'KeyE' && e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.advance();
    }, true);
    this.blinkT = 2;
    this.wigT = 0;
    this.raf = 0;
    this.lastT = 0;
  }

  /** What's showing: { key, mood, html, wait } or null. */
  get active() { const c = this.cur; return c ? { key: c.key, mood: c.mood, html: c.html, wait: c.wait } : null; }

  /** Show a line. Returns a promise that resolves when it's gone (carried on, expired, replaced or hidden). */
  say(html, opts = {}) {
    html = String(html ?? '');
    const mood = MOODS.includes(opts.mood) ? opts.mood : 'calm';
    const c = this.cur;
    if (c && opts.key && c.key === opts.key) {
      // the same line again: update it in place
      const changed = c.html !== html;
      if (c.mood !== mood) this.setMood(mood);
      c.wait = !!opts.wait;
      if (changed) { c.html = html; this.typeIn(html); }
      c.t = 0;
      c.dur = this.durFor(html, opts);
      this.el.classList.toggle('waits', c.wait);
      return c.promise;
    }
    if (c) this.finish(c);
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const line = { key: opts.key || null, html, mood, wait: !!opts.wait, resolve, promise, t: 0, typed: false, dur: 0, name: opts.name ?? (opts.muffled ? '· · ·' : 'Old Star'), voice: opts.sound !== false, muffled: !!opts.muffled };
    line.dur = this.durFor(html, opts);
    this.cur = line;
    this.nameEl.textContent = line.name;
    this.el.hidden = false;
    this.el.classList.toggle('waits', line.wait);
    this.el.classList.toggle('top', opts.place === 'top');
    this.muteTracker(isTouch() || opts.place === 'top');
    this.card.classList.toggle('muffled', line.muffled);
    this.el.classList.remove('out');
    this.card.classList.remove('pop');
    void this.card.offsetWidth;
    this.card.classList.add('pop');
    this.setMood(mood, true);
    this.typeIn(html);
    this.game.audio?.play?.('page', { vol: 0.25 });
    if (mood === 'laugh' && line.voice) this.game.audio?.play?.('laugh', { pitch: 300 });
    if (!this.raf) { this.lastT = performance.now(); this.raf = requestAnimationFrame((t) => this.tick(t)); }
    return promise;
  }

  /** Hide the line (only if it is `key`, when given). */
  hide(key) {
    const c = this.cur;
    if (!c || (key && c.key !== key)) return;
    this.finish(c);
  }

  /** Carry on, as if the player pressed E: finish the typing first, then close the line. */
  next() { this.advance(true); }

  durFor(html, opts) {
    if (opts.wait) return Infinity;
    if (opts.dur !== undefined) return opts.dur;
    const n = html.replace(/<[^>]*>/g, '').length;
    return clamp(2.4 + n * 0.055, 3, 10);
  }

  advance() {
    const c = this.cur;
    if (!c) return;
    if (!c.typed) { this.revealAll(); return; }
    this.game.audio?.play?.('ui_click', { pitch: 0.8 });
    this.finish(c);
  }

  finish(c) {
    if (this.cur === c) {
      this.cur = null;
      this.el.classList.add('out');
      const el0 = this.el;
      clearTimeout(this.outT);
      this.outT = setTimeout(() => { if (!this.cur) { el0.hidden = true; this.muteTracker(false); } }, 220);
    }
    c.resolve?.();
  }

  /**
   * At the top of the screen (always on touch screens) the card sits where the quest tracker's scroll
   * hangs: hide that while a line is up (only undoing a mute of our own).
   */
  muteTracker(on) {
    const tr = this.ui?.tracker;
    if (!tr?.mute) return;
    if (on) { if (!this.trMuted && !tr.muted) { tr.mute(true); this.trMuted = true; } } else if (this.trMuted) { this.trMuted = false; if (tr.muted) tr.mute(false); }
  }

  setMood(mood, instant = false) {
    const c = this.cur;
    if (c) c.mood = mood;
    this.card.dataset.mood = mood;
    if (!instant) { this.face.classList.remove('bump'); void this.face.offsetWidth; this.face.classList.add('bump'); }
    this.draw();
  }

  // ------------------------------------------------------------ typing
  typeIn(html) {
    const t = this.textEl;
    t.innerHTML = html;
    // every text node: full text kept aside, shown a little at a time (layout reserved by a ghost span)
    this.nodes = [];
    const walk = (n) => {
      for (const ch of [...n.childNodes]) {
        if (ch.nodeType === 3) {
          const full = ch.textContent;
          if (!full) continue;
          const shown = document.createTextNode('');
          const ghost = el('span', { class: 'tt-ghost' }, full);
          ch.replaceWith(shown, ghost);
          this.nodes.push({ shown, ghost, full });
        } else if (ch.nodeType === 1) walk(ch);
      }
    };
    walk(t);
    this.total = this.nodes.reduce((s, n) => s + n.full.length, 0);
    this.typedN = 0;
    this.blipT = 0;
    if (this.cur) this.cur.typed = this.total === 0;
  }

  revealAll() {
    for (const n of this.nodes || []) { n.shown.textContent = n.full; n.ghost.textContent = ''; }
    this.typedN = this.total;
    if (this.cur) this.cur.typed = true;
  }

  showChars(k) {
    let left = k;
    for (const n of this.nodes) {
      const take = Math.max(0, Math.min(n.full.length, left));
      n.shown.textContent = n.full.slice(0, take);
      n.ghost.textContent = n.full.slice(take);
      left -= n.full.length;
    }
  }

  // ------------------------------------------------------------ frame
  tick(now) {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;
    const c = this.cur;
    if (!c) { this.raf = 0; return; }
    this.raf = requestAnimationFrame((t) => this.tick(t));
    // (the game loop drives it through UI.update; this only keeps it going if nothing does)
    if (now - (this.drivenAt || 0) > 250) this.step(dt);
  }

  /** Per frame, from UI.update. */
  update(dt) {
    this.drivenAt = performance.now();
    this.step(dt);
  }

  /** Typing, the voice, the face, the reading timer, E from the touch "use" button. */
  step(dt) {
    const c = this.cur;
    if (!c) return;
    if (!c.typed) {
      const speed = c.mood === 'laugh' ? 52 : c.mood === 'worried' ? 48 : 42;
      const before = Math.floor(this.typedN);
      this.typedN = Math.min(this.total, this.typedN + dt * speed);
      const now = Math.floor(this.typedN);
      if (now !== before) {
        this.showChars(now);
        // a mumble every few letters
        this.blipT -= now - before;
        if (this.blipT <= 0 && c.voice) { this.blipT = 3; this.blip(c.mood); }
      }
      if (this.typedN >= this.total) { c.typed = true; this.revealAll(); }
    } else {
      c.t += dt;
      if (c.t >= c.dur) { this.finish(c); return; }
    }
    // touch "use" button and other synthetic presses carry a waiting line on
    const inp = this.game.input;
    if (c.wait && inp && inp.justDown && inp.justDown.has('KeyE') && !this.ui.isPanelOpen?.()) { inp.consume('KeyE'); this.advance(); }
    // the face: blinks, the star wiggles, the mouth moves while the words come
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 1.8 + Math.random() * 3.2;
    this.wigT += dt;
    this.mouthT = (this.mouthT || 0) + dt;
    this.draw();
  }

  blip(mood) {
    const a = this.game.audio;
    if (!a?.tone || !a.ctx) return;
    const base = VOICE[mood] || 205;
    const f = base * (0.82 + Math.random() * 0.4);
    if (this.cur?.muffled) { a.tone({ f: f * 0.6, f2: f * 0.5, type: 'triangle', dur: 0.09, vol: 0.03, filter: 'lowpass', ff: 380, q: 0.8, reverb: 0.5 }); return; }
    a.tone({ f, f2: f * (0.85 + Math.random() * 0.3), type: 'square', dur: 0.05, vol: 0.026, filter: 'bandpass', ff: base * 3, q: 1.6 });
    if (mood === 'worried') a.tone({ f: f * 1.02, type: 'sine', dur: 0.06, vol: 0.01, vib: 14, vibRate: 18 });
  }

  draw() {
    const c = this.cur;
    const mood = c ? c.mood : this.card.dataset.mood || 'calm';
    const talking = c && !c.typed;
    const talk = talking ? (Math.floor((this.mouthT || 0) * 9) % 3 === 0 ? 0 : Math.floor((this.mouthT || 0) * 9) % 3) : 0;
    const frame = { blink: this.blinkT < 0, talk: mood === 'laugh' ? (talking ? (talk ? 1 : 0) : Math.floor(this.wigT * 6) % 2) : talk ? 1 : 0, wig: (talking ? Math.floor(this.wigT * 8) : Math.floor(this.wigT * 1.5)) % 2 === 1 };
    const key = `${mood}|${frame.blink}|${frame.talk}|${frame.wig}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.fctx.clearRect(0, 0, S + FR * 2, S + FR * 2);
    this.fctx.drawImage(starPortrait(mood, frame), FR, FR);
    this.fctx.drawImage(brassFrame(), 0, 0);
  }
}
