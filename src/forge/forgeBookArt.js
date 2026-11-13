// The forge's book-like interface art (Wave 9): the smith's grimoire. Iron-bound oxblood boards
// with riveted corner brackets and a gilt page edge, vellum with foxing and soot, illuminated
// initials, an iron hasp, a wax seal with the forge's anvil pressed in, hand-inked diagrams for
// every step of the work (and the weapon itself drawn in ink with a watercolour wash for the
// pattern book), and the smith's painted heat-colour chart beside the thermometer. Drawn in art
// pixels on Px rasters (the r > 1 passes add the finer detail) and cached through uiArt's art().
import { Px, PAL, INK, art, mixHex, shade } from '../ui/uiArt.js';
import { blob, lumpDist } from '../iso/organic.js';
import { TONES, rivet, glint } from '../ui/craftArt.js';
import { PixelCanvas, drawWeapon } from '../gfx/PixelArt.js';
import { METALS } from '../data/weapons.js';
import { glowHex, glowAmount } from './blackbody.js';

const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const wrap = (v, n) => ((v % n) + n) % n;
const OX = TONES.oxblood, BR = TONES.brass, R = PAL.red;
// wrought iron: from the deep shadow to the hammered highlight
const IRON = [0x141214, 0x1e1b1e, 0x2a2629, 0x363136, 0x433d42, 0x544d52, 0x686066, 0x7e767c, 0x9a9298, 0xb8b0b4];
const SEPIA = 0x3a2414, SEPIA_LT = 0x7a5a3a, RUBRIC = 0xa8301e, GOLD = 0xd8a640, AZURE = 0x2e5a9c;

// ---------------------------------------------------------------- tiles
/** Vellum: warm skin with fibres, foxing and the odd thumb of soot. 32×32 tile (slice-free). */
function vellumTile() {
  const p = new Px(32, 32), r = p.r;
  p.fine((X, Y, fx, fy) => {
    const x = Math.floor(X), y = Math.floor(Y);
    const h = hash(x, y, 31);
    let c = h < 0.1 ? 0xeedcb4 : h > 0.92 ? 0xf8ecd0 : 0xf3e4c0;
    // a slow mottle across the skin
    const m = Math.sin((X + Y * 0.6) * 0.31) + Math.sin((Y - X * 0.4) * 0.23);
    if (m > 1.2) c = mixHex(c, 0xe4cc9c, 0.35);
    else if (m < -1.3) c = mixHex(c, 0xfbf2dc, 0.4);
    if (r > 1) {
      const g = hash(fx, fy, 37);
      if (g < 0.035) c = mixHex(c, 0xc8a878, 0.35); // a fibre
      else if (g > 0.985) c = mixHex(c, 0x9a7048, 0.35); // a grain of grit
      // hair follicles of the skin, in faint short diagonal rows
      if (wrap(fx * 3 + fy * 7, 23) === 0 && g < 0.5) c = mixHex(c, 0xd8bc8c, 0.3);
    }
    return c;
  });
  // foxing: small rusty blooms
  for (const [x, y, s] of [[6, 9, 1.4], [23, 4, 0.9], [19, 26, 1.2], [3, 22, 0.7], [28, 17, 0.8]]) {
    blob(p, x, y, s + 0.6, s + 0.4, 0xd8b480, 120, { lump: 0.3, seed: x * 7 + y });
    p.set(x, y, 0xb88a56, 150);
  }
  return p;
}

// ---------------------------------------------------------------- frames (9-slice)
/** The iron-bound board: tooled oxblood leather, riveted iron corner brackets, a gilt page edge. 36×36, slice 12. */
function ironBoard() {
  const N = 36, S = 12;
  const p = new Px(N, N), r = p.r;
  // the board
  p.rr(0, 0, N, N, 2, OX[5]);
  const D = p.dist(12);
  p.each((x, y) => {
    const d = D(x, y);
    const lit = x + y < N;
    if (d === 1) return lit ? OX[8] : OX[2];
    if (d === 2) return lit ? OX[7] : OX[3];
    // blind-tooled double fillet, then the gilt edge of the pages showing inside
    if (d === 6 || d === 8) return OX[3];
    if (d === 7) return OX[7];
    if (d === 10) return lit ? 0x8a5a24 : 0x5a3814; // the board's inner lip
    if (d === 11) return lit ? BR[7] : BR[4]; // gilt page edge
    const g = hash(x, y, 41);
    return g < 0.14 ? OX[4] : g > 0.9 ? OX[6] : undefined;
  });
  // tooled lozenges along the fillet (period 6 so the edges tile)
  for (let i = 0; i < N; i++) {
    if (wrap(i - S, 6) !== 3) continue;
    for (const [x, y] of [[i, 4], [i, N - 5], [4, i], [N - 5, i]]) if (D(x, y) === 5) p.set(x, y, OX[2]);
  }
  // iron corner brackets: an L of hammered strap, three rivets each
  const bracket = (fx, fy) => {
    const X = (x) => (fx ? N - 1 - x : x), Y = (y) => (fy ? N - 1 - y : y);
    for (let a = 0; a < 11; a++) for (let b = 0; b < 4; b++) {
      for (const [x, y] of [[a, b], [b, a]]) {
        const edge = b === 0 || b === 3 || a === 10;
        const lit = (fx ? -1 : 1) * (a - b) + (fy ? -1 : 1) * 0 > 0;
        const h = hash(X(x), Y(y), 43);
        let c = edge ? IRON[2] : h < 0.25 ? IRON[4] : h > 0.85 ? IRON[7] : IRON[5];
        if (b === 1 && !edge) c = IRON[6 + (lit ? 1 : 0)];
        p.set(X(x), Y(y), c);
      }
    }
    // the bracket's end is cut in a little fleur (a notch and a point)
    p.set(X(11), Y(1), IRON[3]); p.set(X(11), Y(2), IRON[3]); p.set(X(1), Y(11), IRON[3]); p.set(X(2), Y(11), IRON[3]);
    for (const [x, y] of [[2, 2], [8, 1.5], [1.5, 8]]) {
      if (r > 1) rivet(p, X(x) + (fx ? 0 : 1) - 0.5, Y(y) + (fy ? 0 : 1) - 0.5, IRON, 0.85);
      else { p.set(X(Math.round(x)), Y(Math.round(y)), IRON[8]); }
    }
  };
  bracket(0, 0); bracket(1, 0); bracket(0, 1); bracket(1, 1);
  p.outline(OX[0]);
  if (r > 1) {
    // finer: hammer pocks in the iron, the leather's pores, a burnish along the lit edge
    p.fine((X, Y, fx, fy) => {
      const g = hash(fx, fy, 47), c = p.fget(fx, fy);
      if (!p.fa(fx, fy)) return undefined;
      const isIron = ((c >> 16) & 255) === ((c >> 8) & 255) + 6 || IRON.includes(c);
      if (isIron && g < 0.08) return mixHex(c, IRON[1], 0.5);
      if (isIron && g > 0.95) return mixHex(c, IRON[9], 0.5);
      if (!isIron && OX.includes(c) && g < 0.05) return mixHex(c, OX[1], 0.4);
      return undefined;
    });
  }
  return p;
}

/** An inked box with ruled corner ticks (pattern-book choices). 12×12, slice 3. on: rubric red. */
function inkBox(on = false) {
  const p = new Px(12, 12);
  const c = on ? RUBRIC : SEPIA, c2 = on ? 0xd06a4a : SEPIA_LT;
  if (on) p.rect(2, 2, 8, 8, 0xe8a070, 50);
  for (let i = 1; i <= 10; i++) {
    if (hash(i, 1, 5) > 0.08) p.set(i, 1, c); if (hash(i, 10, 5) > 0.08) p.set(i, 10, c);
    if (hash(1, i, 6) > 0.08) p.set(1, i, c); if (hash(10, i, 6) > 0.08) p.set(10, i, c);
  }
  for (let i = 3; i <= 8; i++) if (i % 2) { p.set(i, 2, c2, 120); p.set(2, i, c2, 120); }
  // the quill overshot the corners
  p.set(0, 1, c, 160); p.set(11, 10, c, 160); p.set(1, 11, c, 160); p.set(10, 0, c, 160);
  return p;
}

// ---------------------------------------------------------------- sprites
/** The iron hasp at the top of the work page: a strap, a hinge knuckle and a tongue with a staple. 30×14. */
function hasp() {
  const p = new Px(30, 14), r = p.r;
  // strap across
  p.rr(1, 1, 28, 6, 1, IRON[5]);
  p.hl(2, 27, 1, IRON[8]); p.hl(2, 27, 2, IRON[6]); p.hl(2, 27, 6, IRON[2]);
  // hinge knuckles
  for (const x of [10, 14, 18]) { p.rect(x, 5, 3, 3, IRON[6]); p.set(x, 5, IRON[8]); p.set(x + 2, 7, IRON[2]); }
  // the tongue hanging down over the page, its slot and the staple through it
  p.poly([[11, 7], [19, 7], [18, 12], [15, 13], [12, 12]], IRON[5]);
  p.vl(12, 8, 11, IRON[7]); p.vl(18, 8, 11, IRON[3]);
  p.rect(14, 9, 3, 2, IRON[0]);
  p.rect(13, 8, 5, 1, BR[6]); p.set(13, 8, BR[8]); // the brass staple
  p.outline(IRON[0]);
  for (const x of [4, 25]) { if (r > 1) rivet(p, x, 4, IRON, 1.0); else p.set(x, 3, IRON[9]); }
  if (r > 1) { glint(p, 6, 2, 0xffffff, IRON[9], 150); glint(p, 21, 2, IRON[9], IRON[8], 120); }
  return p;
}

/** An illuminated initial's ground: gold leaf framing a red field with white filigree and a blue leaf. 20×20. */
function initialGround(field = R.base) {
  const p = new Px(20, 20), r = p.r;
  p.rect(0, 0, 20, 20, BR[5]);
  // the gold frame, lit top-left
  for (let i = 0; i < 20; i++) { p.set(i, 0, BR[8]); p.set(0, i, BR[8]); p.set(i, 19, BR[2]); p.set(19, i, BR[2]); p.set(i, 1, BR[7]); p.set(1, i, BR[7]); p.set(i, 18, BR[3]); p.set(18, i, BR[3]); }
  p.rect(2, 2, 16, 16, field);
  // diapered field: a tiny diamond lattice
  p.each((x, y) => {
    if (x < 2 || y < 2 || x > 17 || y > 17) return undefined;
    if (wrap(x + y, 4) === 0 || wrap(x - y, 4) === 0) return shade(field, 0.82);
    return undefined;
  });
  // white filigree dots and a blue vine leaf curling in from the corner
  for (const [x, y] of [[3, 3], [16, 3], [3, 16], [16, 16], [9, 2], [2, 10]]) p.set(x, y, 0xfff6e0);
  p.poly([[13, 17], [17, 13], [17, 17]], AZURE); p.line(13, 16, 16, 13, PAL.blue.lt);
  p.poly([[2, 6], [6, 2], [2, 2]], AZURE); p.line(3, 5, 5, 3, PAL.blue.lt);
  p.outline(INK);
  if (r > 1) {
    // burnished leaf: tooled dots in the gold, a shine on the top rail
    for (let i = 2; i < 19; i += 2) { p.dot(i + 0.5, 0.5, 0xfffbe8); p.dot(0.5, i + 0.5, 0xfffbe8, 200); }
    glint(p, 3, 1, 0xffffff, BR[9], 200);
  }
  return p;
}

/** A soot smudge with a sooty thumbprint (translucent; lay it over a page corner). 34×14. */
function sootSmudge() {
  const p = new Px(34, 14), r = p.r;
  const LD = lumpDist(13, 9, 12, 4.5, { lump: 0.35, seed: 5 });
  for (let y = 0; y < 14; y++) for (let x = 0; x < 34; x++) {
    const d = LD(x, y);
    if (d > 1) continue;
    const a = Math.round((1 - d) * 90 + hash(x, y, 51) * 30);
    if (a > 8) p.set(x, y, 0x1a1210, a);
  }
  // the thumb: whorls pressed in soot
  const T = lumpDist(26, 6, 4.2, 3.4, { lump: 0.1, seed: 9 });
  for (let y = 0; y < 14; y++) for (let x = 18; x < 34; x++) {
    const d = T(x, y);
    if (d > 1) continue;
    p.set(x, y, 0x1a1210, Math.round(40 + (1 - d) * 50));
  }
  if (r > 1) {
    for (let k = 0; k < 4; k++) {
      const rr = 1 + k * 0.85;
      for (let a = 0; a < Math.PI * 2; a += 0.12) p.dot(26 + Math.cos(a) * rr * 1.15, 6 + Math.sin(a) * rr * 0.85, 0x0e0a08, 120);
    }
    for (let i = 0; i < 40; i++) p.dot(2 + hash(i, 1, 53) * 24, 5 + hash(i, 2, 53) * 8, 0x0e0a08, 70);
  }
  return p;
}

/** The forge's wax seal: a lumpy red puddle with the anvil mark pressed in. 22×22. */
function forgeSeal(hex = R.base) {
  const p = new Px(22, 22), r = p.r;
  const lt = mixHex(hex, 0xffffff, 0.3), hi = mixHex(hex, 0xffffff, 0.55), dk = shade(hex, 0.62), dd = shade(hex, 0.42);
  const LD = lumpDist(11, 11, 8.6, 8.2, { lump: 0.12, seed: 21 });
  blob(p, 11, 11, 8.6, 8.2, hex, 255, { lump: 0.12, seed: 21 });
  for (let a = 0; a < 9; a++) { const ang = (a / 9) * Math.PI * 2 + 0.5; const rr = 8.8 + hash(a, 3, 55) * 1.6; blob(p, 11 + Math.cos(ang) * rr * 0.92, 11 + Math.sin(ang) * rr * 0.92, 1.4, 1.2, hex, 255, { lump: 0.25, seed: a + 3 }); }
  p.each((x, y) => {
    const d = LD(x, y) * 8.6, t = (x - 11) + (y - 11);
    if (d > 5.6 && d < 6.6) return t < 0 ? dk : lt; // the die's rim pressed in
    if (t < -11) return hi;
    if (t < -5) return lt;
    if (t > 10) return dk;
    return undefined;
  });
  // the anvil mark (sunk: shadow on its top-left edges, light on its bottom-right)
  const A = ['.aaaaaaa.', 'aaaaaaaa.', '..aaaaa..', '...aaa...', '..aaaaa..'];
  for (let j = 0; j < A.length; j++) for (let i = 0; i < 9; i++) if (A[j][i] === 'a') {
    const up = j === 0 || A[j - 1][i] !== 'a', left = i === 0 || A[j][i - 1] !== 'a';
    p.set(7 + i, 9 + j, up || left ? dd : dk);
    if (j === A.length - 1 || A[j + 1]?.[i] !== 'a') p.set(7 + i, 10 + j, lt);
  }
  p.set(7, 9, dd); p.set(6, 10, dd); // the horn
  p.outline(dd);
  if (r > 1) {
    for (let a = 3.6; a < 4.6; a += 0.05) p.dot(11 + Math.cos(a) * 7.4, 11 + Math.sin(a) * 7.1, 0xffffff, 120);
    for (let i = 0; i < 6; i++) { const a = hash(i, 1, 57) * 6.28, d = 2 + hash(i, 2, 57) * 3.5; p.dot(11 + Math.cos(a) * d, 7 + Math.sin(a) * d * 0.4, dk, 150); }
  }
  return p;
}

/** A forged iron corner cap (for buttons and the thermometer board), top-left corner. 9×9. */
function ironCap() {
  const p = new Px(9, 9), r = p.r;
  for (let a = 0; a < 8; a++) for (let b = 0; b < 3; b++) for (const [x, y] of [[a, b], [b, a]]) {
    const c = b === 0 ? IRON[7] : b === 2 ? IRON[3] : hash(x, y, 59) < 0.3 ? IRON[4] : IRON[5];
    p.set(x, y, c);
  }
  p.set(8, 1, IRON[4]); p.set(1, 8, IRON[4]);
  p.outline(IRON[0]);
  if (r > 1) rivet(p, 2, 2, IRON, 0.8); else p.set(1, 1, IRON[9]);
  return p;
}

// ---------------------------------------------------------------- hand-inked diagrams
/** A sepia pen on vellum: lines with the odd skip, a hatch, and a rubric red accent. */
class Pen {
  constructor(p) { this.p = p; }
  line(x0, y0, x1, y1, c = SEPIA, a = 255) {
    const p = this.p;
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
      if (hash(x, y, 61) < 0.04 && i > 0 && i < n) continue; // the nib skips
      p.set(x, y, c, a);
    }
  }
  poly(pts, c = SEPIA, closed = true) { for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; this.line(a[0], a[1], b[0], b[1], c); } }
  hatch(x0, y0, x1, y1, c = SEPIA_LT, step = 2) { const p = this.p; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (wrap(x + y, step + 1) === 0) p.set(x, y, c, 170); }
  wash(x0, y0, x1, y1, c, a = 90) { const p = this.p; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (hash(x, y, 63) > 0.12) p.set(x, y, c, a); }
}

/** A hand-inked diagram of a step of the work. 30×22. */
function inkStep(step) {
  const p = new Px(30, 22);
  const pen = new Pen(p);
  const flame = (cx, by, h) => { pen.line(cx, by, cx - 2, by - h * 0.5); pen.line(cx - 2, by - h * 0.5, cx, by - h); pen.line(cx, by - h, cx + 1, by - h * 0.55); pen.line(cx + 1, by - h * 0.55, cx + 2, by); p.set(cx, by - 2, RUBRIC); p.set(cx, by - 3, 0xd8701e); };
  const anvil = (x, y) => { pen.poly([[x, y], [x + 14, y], [x + 14, y + 2], [x + 11, y + 3], [x + 11, y + 5], [x + 13, y + 7], [x + 2, y + 7], [x + 4, y + 5], [x + 4, y + 3], [x + 1, y + 2]]); pen.line(x - 3, y + 1, x, y); pen.line(x - 3, y + 1, x, y + 2); pen.hatch(x + 5, y + 3, x + 10, y + 6); };
  if (step === 'heat') {
    // the hearth's coals in section, the bar in them, flames, the bellows' blast
    pen.poly([[3, 15], [27, 15], [25, 20], [5, 20]]);
    for (let x = 5; x < 26; x += 3) { pen.poly([[x, 15], [x + 1, 13], [x + 3, 14]], SEPIA, false); }
    pen.hatch(6, 16, 24, 19);
    pen.line(2, 13, 20, 13, RUBRIC); pen.line(2, 12, 20, 12, RUBRIC); // the bar, red hot
    pen.line(0, 11, 4, 14);
    flame(8, 11, 7); flame(15, 11, 9); flame(22, 12, 6);
    for (const [x, y] of [[11, 2], [19, 1], [25, 4], [6, 3]]) p.set(x, y, 0xd8701e);
  } else if (step === 'smelt') {
    // the crucible down in the coals, the melt glowing in it, the tongs ready
    pen.poly([[2, 17], [28, 17], [26, 21], [4, 21]]); pen.hatch(5, 18, 25, 20);
    pen.poly([[9, 5], [21, 5], [19, 18], [11, 18]]); pen.line(8, 5, 22, 5);
    pen.wash(11, 7, 19, 10, 0xe8902a, 160); pen.line(11, 7, 19, 7, RUBRIC);
    pen.hatch(12, 12, 18, 17);
    flame(6, 16, 6); flame(24, 16, 7); flame(15, 4, 3);
    pen.line(0, 1, 9, 7); pen.line(1, 0, 10, 6);
  } else if (step === 'hammer' || step === 'shape') {
    anvil(8, 13);
    pen.line(10, 12, 22, 12, RUBRIC); // the work on the face
    // the hammer, raised, with swing marks
    pen.poly([[15, 2], [21, 2], [21, 5], [15, 5]]); pen.hatch(16, 3, 20, 4);
    pen.line(21, 4, 28, 8);
    for (const [a, b, c, d] of [[12, 3, 13, 7], [11, 6, 13, 9], [24, 1, 26, 2]]) pen.line(a, b, c, d, SEPIA_LT);
    for (const [x, y] of [[14, 10], [20, 9], [12, 9], [23, 11]]) p.set(x, y, 0xd8701e);
  } else if (step === 'grind') {
    // the wheel on its frame, sparks off the far side
    const cx = 11, cy = 10;
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; p.set(Math.round(cx + Math.cos(t) * 7.4), Math.round(cy + Math.sin(t) * 7.4), SEPIA); }
    for (let a = 0; a < 6; a++) { const t = a / 6 * Math.PI * 2; pen.line(cx, cy, Math.round(cx + Math.cos(t) * 6), Math.round(cy + Math.sin(t) * 6), SEPIA_LT); }
    pen.line(5, 20, 11, 10); pen.line(17, 20, 11, 10);
    pen.line(14, 2, 27, 4, RUBRIC);
    for (const [x, y] of [[20, 1], [24, 0], [26, 6], [22, 7], [28, 2]]) p.set(x, y, 0xd8701e);
  } else if (step === 'balance') {
    // the blade on the fulcrum, arrows either end
    pen.line(2, 10, 27, 10); pen.line(2, 11, 22, 11); pen.line(22, 11, 27, 10);
    pen.poly([[13, 12], [17, 12], [15, 16]]); pen.line(9, 17, 21, 17); pen.hatch(14, 13, 16, 15);
    pen.line(3, 4, 3, 8, RUBRIC); pen.line(2, 7, 3, 8, RUBRIC); pen.line(4, 7, 3, 8, RUBRIC);
    pen.line(26, 4, 26, 8, RUBRIC); pen.line(25, 7, 26, 8, RUBRIC); pen.line(27, 7, 26, 8, RUBRIC);
  } else if (step === 'quench') {
    // the barrel, the blade going in tip first, steam curling up
    pen.poly([[7, 9], [23, 9], [22, 21], [8, 21]]); pen.line(7, 13, 23, 13); pen.line(8, 18, 22, 18);
    pen.hatch(9, 14, 21, 17, AZURE);
    pen.line(15, 0, 15, 12, RUBRIC); pen.line(14, 1, 14, 6);
    for (const [x, y] of [[10, 7], [11, 5], [10, 3], [19, 7], [20, 5], [19, 3], [21, 1]]) p.set(x, y, SEPIA_LT);
  } else if (step === 'infuse') {
    pen.poly([[15, 1], [19, 6], [15, 11], [11, 6]]); pen.line(15, 1, 15, 11, SEPIA_LT); p.set(14, 4, AZURE); p.set(16, 7, AZURE);
    pen.line(2, 17, 27, 17); pen.line(2, 18, 23, 18);
    for (const [a, b, c, d] of [[8, 6, 5, 4], [22, 6, 25, 4], [9, 11, 6, 13], [21, 11, 24, 13]]) pen.line(a, b, c, d, RUBRIC);
  } else {
    // the finished blade with rays
    pen.line(15, 2, 15, 15); pen.line(14, 3, 14, 15); pen.line(16, 3, 16, 15); pen.line(10, 15, 20, 15); pen.line(15, 16, 15, 20); p.set(15, 21, RUBRIC);
    for (const [a, b, c, d] of [[8, 4, 11, 6], [22, 4, 19, 6], [7, 10, 11, 10], [23, 10, 19, 10]]) pen.line(a, b, c, d, 0xc88a2a);
  }
  return p;
}

/** The ledger's diagram: a crucible in the coals, tongs, the pour into the mould (with notes). 44×30. */
function inkCrucible() {
  const p = new Px(44, 30);
  const pen = new Pen(p);
  // coals and flames
  pen.poly([[2, 24], [22, 24], [20, 29], [4, 29]]); pen.hatch(5, 25, 19, 28);
  for (const x of [5, 10, 15, 19]) { pen.line(x, 23, x - 1, 19); pen.line(x - 1, 19, x + 1, 16); pen.line(x + 1, 16, x + 2, 22); p.set(x, 21, 0xd8701e); }
  // the crucible (a tapered pot) with the melt in it
  pen.poly([[6, 9], [18, 9], [16, 22], [8, 22]]); pen.line(5, 9, 19, 9);
  pen.wash(8, 11, 16, 16, 0xe8902a, 140); pen.line(8, 11, 16, 11, RUBRIC);
  pen.hatch(8, 17, 15, 21);
  // tongs gripping it
  pen.line(1, 4, 7, 11); pen.line(2, 3, 9, 9); p.set(4, 6, SEPIA);
  // the pour: an arc to the mould
  for (let i = 0; i <= 12; i++) { const t = i / 12; p.set(Math.round(19 + t * 13), Math.round(10 - Math.sin(t * Math.PI) * 5 + t * 9), RUBRIC); }
  pen.poly([[28, 21], [42, 21], [41, 26], [29, 26]]); pen.wash(30, 22, 40, 23, 0xe8902a, 160);
  pen.hatch(30, 24, 40, 25);
  // margin notes: a tick list in the corner
  for (let y = 2; y < 9; y += 3) { pen.line(30, y, 31, y + 1, RUBRIC); pen.line(31, y + 1, 33, y - 1, RUBRIC); pen.line(35, y, 42, y, SEPIA_LT); }
  return p;
}

/**
 * The smith's heat-colour chart beside the thermometer: hand-painted swatches of each heat colour
 * at their place on the scale (0 at the bottom, maxT at the top), inked borders between them.
 * 6 × 84 (the glass's height).
 */
function heatChart(maxT) {
  const H = 84, Wd = 6;
  const p = new Px(Wd, H), r = p.r;
  const bands = [0, 450, 560, 690, 820, 960, 1100, 1250, 1400, 1700, 2100];
  for (let y = 0; y < H; y++) {
    const T = (1 - (y + 0.5) / H) * maxT;
    let k = 0;
    while (k < bands.length - 1 && T >= bands[k + 1]) k++;
    const mid = (bands[k] + Math.min(bands[k + 1] ?? bands[k], maxT)) / 2;
    const c = glowAmount(mid) > 0 ? glowHex(mid) : 0x3a3230;
    for (let x = 1; x < Wd - 1; x++) p.set(x, y, hash(x, y, 67) < 0.18 ? shade(c, 0.86) : c);
    // ink lines where the colour changes
    const Tn = (1 - (y + 1.5) / H) * maxT;
    let kn = 0;
    while (kn < bands.length - 1 && Tn >= bands[kn + 1]) kn++;
    if (kn !== k) p.hl(0, Wd - 1, y, SEPIA);
  }
  for (let y = 0; y < H; y++) { p.set(0, y, SEPIA); p.set(Wd - 1, y, SEPIA); }
  p.hl(0, Wd - 1, 0, SEPIA); p.hl(0, Wd - 1, H - 1, SEPIA);
  if (r > 1) {
    // brush strokes in the paint
    p.fine((X, Y, fx, fy) => {
      if (X < 1 || X >= Wd - 1) return undefined;
      const c = p.fget(fx, fy);
      return wrap(fx * 2 + fy, 7) === 0 ? mixHex(c, 0xffffff, 0.12) : undefined;
    });
  }
  return p;
}

/**
 * The pattern book's drawing of a weapon: its silhouette traced in sepia ink, a watercolour wash
 * in the metal's colour, hatching on the shaded side, a dimension line with ticks. 40×40.
 */
function inkWeapon(type, metal) {
  const src = new PixelCanvas(32);
  drawWeapon(src, type, METALS[metal]?.color ?? 0xa0a0a0, null);
  const p = new Px(40, 40);
  const A = (x, y) => (x >= 0 && y >= 0 && x < 32 && y < 32 ? src.alpha(x, y) : 0);
  const mc = METALS[metal]?.color ?? 0xa0a0a0;
  const washC = mixHex(mc, 0xf3e4c0, 0.35);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (A(x, y) < 100) continue;
    const edge = A(x - 1, y) < 100 || A(x + 1, y) < 100 || A(x, y - 1) < 100 || A(x, y + 1) < 100;
    const lum = ((src.getHex(x, y) >> 8) & 255) / 255;
    const X = x + 4, Y = y + 2;
    if (edge) { p.set(X, Y, SEPIA); continue; }
    p.set(X, Y, washC, 200);
    if (lum < 0.45 && wrap(x + y, 3) === 0) p.set(X, Y, SEPIA_LT, 200); // hatched in the shade
    else if (lum > 0.75) p.set(X, Y, mixHex(washC, 0xfffbf0, 0.5), 220);
  }
  // the dimension line with its arrowheads and ticks
  for (let x = 6; x < 34; x++) if (wrap(x, 2) === 0) p.set(x, 37, SEPIA_LT);
  p.vl(5, 35, 39, SEPIA); p.vl(34, 35, 39, SEPIA);
  p.set(6, 36, SEPIA); p.set(6, 38, SEPIA); p.set(33, 36, SEPIA); p.set(33, 38, SEPIA);
  // a compass-prick centre and a rubric note
  p.set(2, 2, RUBRIC); p.set(3, 3, RUBRIC); p.set(2, 3, SEPIA_LT);
  return p;
}

/** A gilt-and-ink knotwork ornament for a page head (line filler). 40×5 tile (repeat-x). */
function ruleOrnament() {
  const p = new Px(16, 5);
  for (let x = 0; x < 16; x++) {
    const y = 2 + Math.round(Math.sin((x / 16) * Math.PI * 2) * 1.6);
    const y2 = 2 - Math.round(Math.sin((x / 16) * Math.PI * 2) * 1.6);
    p.set(x, y, SEPIA); p.set(x, y2, RUBRIC);
  }
  p.set(4, 2, GOLD); p.set(12, 2, GOLD);
  return p;
}

// ---------------------------------------------------------------- registry
const FLAT = { detail: false, edges: false };
const BOOK = {
  vellumT: [vellumTile, FLAT], ironBoard: [ironBoard, { edges: false }], inkBox: [() => inkBox(false), FLAT], inkBoxOn: [() => inkBox(true), FLAT],
  hasp: [hasp, { brown: 'none' }], initial: [() => initialGround(R.base), FLAT], initialBlue: [() => initialGround(AZURE), FLAT],
  soot: [sootSmudge, FLAT], forgeSeal: [() => forgeSeal(R.base), { brown: 'wax' }], ironCap: [ironCap, { brown: 'none' }],
  inkCrucible: [inkCrucible, FLAT], ruleOrn: [ruleOrnament, FLAT],
};
/** Data URL of a named book-art sprite. */
export function bart(key) { const e = BOOK[key]; return e ? art('fb:' + key, e[0], e[1]) : ''; }
/** Keys published as --fa-<key> on the forge layer. */
export const BOOK_KEYS = Object.keys(BOOK);
export const inkStepURL = (step) => art('fb:step:' + step, () => inkStep(step), FLAT);
export const heatChartURL = (maxT) => art('fb:chart:' + maxT, () => heatChart(maxT), FLAT);
export const inkWeaponURL = (type, metal) => art(`fb:wp:${type}:${metal}`, () => inkWeapon(type, metal), FLAT);
