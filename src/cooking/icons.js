// 32×32 item icons for the new cave ingredients and Old Star's dishes (spec { k: 'cook', t, c }).
// Drawn with the shared pixel toolkit (gfx/px) so they match every other icon: 1px selective
// outlines, top-left light, hue-shifted ramps, a few glints. gfx/PixelArt.js calls drawCookIcon.
import { mat, mix } from '../gfx/px/color.js';
import { vol, fill, sparkle, hash2, vnoise } from '../gfx/px/shade.js';
import { M, ring, lineIn } from '../gfx/px/parts.js';
import { leaf } from '../gfx/px/flora.js';

/** Icon spec for recipes.js / items: t = drawing, c = the dish's tint (liquids in the 3D kitchen). */
export function cookIcon(t, c) { return c === undefined ? { k: 'cook', t } : { k: 'cook', t, c }; }

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };
const WOODB = () => mat(0x9a6438, { cont: 1.05 });
const CLAY = () => mat(0xc0663a, { cont: 1.05 });
const CERAMIC = () => mat(0xece4d4, { cont: 0.95 });
const CRUST = () => mat(0xd8a050, { cont: 1.1, warm: 45 });

// ---------------------------------------------------------------- tableware
function bowl(pc, o) {
  const { cx = 16, y = 16, rx = 13, ry = 5, h = 10 } = o;
  const R = o.R || WOODB();
  const body = M().ellipse(cx, y, rx, ry).union(M().ellipse(cx, y + 1, rx, h).sub(M().rect(0, 0, 32, Math.round(y))));
  ring(pc, body, R);
  vol(pc, body, R, { mode: 'cyl', axis: Math.PI / 2, flat: 0.2 });
  const inner = M().ellipse(cx, y, rx - 1.2, ry - 1);
  M().ellipse(cx, y, rx, ry).sub(inner).each((x, yy) => pc.set(x, yy, yy < y ? R[2] : R[1]));
  fill(pc, inner, R[5]);
  if (o.band) body.each((x, yy) => { if (!M().ellipse(cx, y, rx, ry).get(x, yy) && Math.abs(yy - (y + h * 0.45)) < 0.8) pc.set(x, yy, o.band); });
  return M().ellipse(cx, y + 0.6, rx - 1.6, ry - 1.4);
}

function plate(pc, o = {}) {
  const { cx = 16, y = 21, rx = 14.5, ry = 6.5 } = o;
  const R = o.R || CERAMIC();
  const base = M().ellipse(cx, y + 1, rx, ry);
  ring(pc, base, R);
  fill(pc, base, R[4]);
  fill(pc, M().ellipse(cx, y, rx, ry), R[2]);
  const inner = M().ellipse(cx, y + 0.4, rx * 0.72, ry * 0.68);
  fill(pc, inner, R[3]);
  inner.edge().each((x, yy) => { if (yy < y) pc.set(x, yy, R[4]); });
  M().ellipse(cx, y, rx, ry).edge().each((x, yy) => { if (yy < y - 1) pc.set(x, yy, R[1]); });
  if (o.trim) M().ellipse(cx, y, rx - 1.3, ry - 1).edge().each((x, yy) => { if ((x + yy) % 2) pc.set(x, yy, o.trim); });
  return inner;
}

/** Wooden board in 3/4 view (for bread, jerky, fish). */
function board(pc, o = {}) {
  const R = mat(0xb07a44, { cont: 1.05 });
  const m = M().poly([[2, 22], [20, 14], [30, 19], [12, 28]]);
  const side = M().poly([[2, 22], [12, 28], [12, 30], [2, 24]]).union(M().poly([[12, 28], [30, 19], [30, 21], [12, 30]]));
  ring(pc, m.clone().union(side), R);
  fill(pc, side, R[5]);
  fill(pc, m, R[3]);
  m.each((x, y) => { const g = vnoise(x * 0.4 + y * 0.9, y * 0.3, 5); if (g > 0.68) pc.set(x, y, R[4]); else if (g < 0.22) pc.set(x, y, R[2]); });
  if (o.hole !== false) { pc.set(26, 19, R[6]); pc.set(27, 19, R[5]); }
  return m;
}

function steam(pc, xs, y0 = 9, h = 7) {
  for (const x0 of xs) for (let i = 0; i < h; i++) pc.set(x0 + Math.sin(i * 0.9 + x0) * 1.2, y0 - i, 0xffffff, Math.round(200 - i * 22));
}

function surface(pc, m, R, o = {}) {
  const b = m.bounds();
  if (!b) return;
  m.each((x, y) => {
    const v = (y - b.y0) / Math.max(1, b.h), u = (x - b.x0) / Math.max(1, b.w);
    let k = v < 0.25 ? 4 : v < 0.7 ? 3 : 2;
    if (o.gloss && v > 0.3 && v < 0.55 && u > 0.15 && u < 0.45) k = 1;
    pc.set(x, y, R[k]);
    if (o.emit) pc.emit(x, y, o.emit);
  });
}

function chunks(pc, m, items, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const b = m.bounds();
  for (const [c, n, size = 1] of items) {
    const R = mat(c, { cont: 1 });
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 12; t++) {
        const x = Math.floor(b.x0 + 1 + rnd() * (b.w - 2)), y = Math.floor(b.y0 + 1 + rnd() * (b.h - 2));
        if (!m.get(x, y) || !m.get(x + size, y + size)) continue;
        pc.set(x, y, R[2]); if (size > 1) { pc.set(x + 1, y, R[3]); pc.set(x, y + 1, R[3]); pc.set(x + 1, y + 1, R[4]); } else pc.set(x + 1, y, R[4]);
        break;
      }
    }
  }
}

/** Small thyme sprig: a woody stem with paired tiny leaves. */
function sprig(pc, x0, y0, x1, y1, n = 5) {
  const W = mat(0x7a6a4a), L = mat(0x7a9a5a, { cont: 1.1 });
  lineIn(pc, x0, y0, x1, y1, W[3]);
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1), x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    pc.set(x - 1, y - 1, i % 2 ? L[2] : L[3]); pc.set(x + 1, y - 1, i % 2 ? L[3] : L[2]);
    pc.set(x - 1, y, L[4]); pc.set(x + 1, y, L[4]);
  }
  pc.set(x1, y1 - 1, L[1]);
}

// ---------------------------------------------------------------- ingredients
function berries(pc) {
  const LR = mat(0x4e8a3a, { cont: 1.1 });
  leaf(pc, 16, 9, 6, 3, 2.6, LR, { bend: 1 });
  leaf(pc, 17, 9, 27, 4, 2.4, LR, { bend: -1 });
  const ST = mat(0x6a4a2a);
  lineIn(pc, 16, 9, 12, 16, ST[3]); lineIn(pc, 17, 9, 21, 15, ST[3]); lineIn(pc, 16, 9, 16, 18, ST[4]);
  const BR = mat(0xd02a40, { cont: 1.15, warm: 0 });
  const pts = [[11, 19, 3.4], [17, 21, 3.6], [22, 18, 3.2], [14, 25, 3.3], [20, 26, 3.1], [9, 25, 2.6], [25, 23, 2.6]];
  for (const [x, y, r] of pts) {
    const m = M().disk(x, y, r);
    ring(pc, m, BR);
    vol(pc, m, BR, { spec: 0.86, bounce: true });
    pc.set(x - 1, y - 1, 0xffd0d8); // shine
    pc.set(x, y + r - 1, BR[5]);
  }
  pc.set(26, 13, 0x8a2030); pc.set(27, 13, 0xd02a40); // a stray unripe-dark one
  sparkle(pc, 7, 16, 1, 0xffffff, 0xffc0c8);
}

function thyme(pc) {
  const W = mat(0x7a5a3a, { cont: 1.1 });
  const L = mat(0x9ab878, { cont: 1.15, sat: 0.85 });
  // a little bunch: woody stems fanning up from a twine knot, tiny paired leaves with gaps between
  const sprigs = [[16, 26, 7, 5], [16, 26, 15, 2], [16, 26, 24, 4], [16, 26, 28, 12], [16, 26, 4, 13]];
  for (const [x0, y0, x1, y1] of sprigs) {
    lineIn(pc, x0, y0, x1, y1, W[3]);
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const t = 0.18 + (i / n) * 0.8, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), px = -dy / l, py = dx / l;
      for (const sd of [-1, 1]) {
        const lx = x + px * sd * 1.6, ly = y + py * sd * 1.6;
        const m = M().ellipse(lx, ly, 1.3, 1);
        fill(pc, m, i % 2 ? L[2] : L[3]);
        pc.set(lx - 0.5, ly - 0.5, L[1]);
        pc.set(lx + 0.5, ly + 0.5, L[4]);
      }
    }
    pc.set(x1, y1, L[1]); pc.set(x1, y1 - 1, L[0]);
  }
  // tiny lilac flowers on two tips
  for (const [x, y] of [[15, 1], [24, 3]]) { pc.set(x, y, 0xc8a0e0); pc.set(x + 1, y, 0xe0c8f0); }
  // the stems below the knot, and the twine
  for (let i = -2; i <= 2; i++) lineIn(pc, 16 + i * 0.5, 26, 16 + i * 1.2, 30, W[i & 1 ? 2 : 4]);
  const TW = mat(0xc8a870);
  const knot = M().ellipse(16, 26, 3.2, 1.6);
  ring(pc, knot, TW); fill(pc, knot, TW[2]);
  pc.set(15, 26, TW[4]); pc.set(17, 26, TW[4]); pc.set(19, 28, TW[3]); pc.set(20, 29, TW[3]);
}

function tuber(pc) {
  const R = mat(0xb08a5a, { cont: 1.1, warm: 45 });
  const m = M().ellipse(16, 18, 12, 9).ellipse(9, 13, 5, 5).ellipse(23, 22, 6, 5.5);
  ring(pc, m, R);
  vol(pc, m, R, { round: 4, bounce: true, tex: (x, y) => (vnoise(x * 0.5, y * 0.5, 9) - 0.5) * 0.35 });
  // eyes and dirt
  for (const [x, y] of [[12, 16], [19, 13], [22, 21], [15, 22], [8, 12]]) { pc.set(x, y, R[5]); pc.set(x + 1, y, R[4]); pc.set(x, y - 1, R[2]); }
  m.each((x, y) => { if (hash2(x, y, 31) < 0.06) pc.set(x, y, 0x5a3c28); });
  // a pale sprout
  const SP = mat(0xe0e8b0);
  lineIn(pc, 8, 9, 6, 5, SP[3]); pc.set(5, 4, SP[1]); pc.set(6, 4, SP[2]);
  lineIn(pc, 24, 17, 27, 14, SP[3]); pc.set(28, 13, SP[1]);
}

function garlic(pc) {
  const R = mat(0xf0e8d8, { cont: 1.05, sat: 0.6 });
  const bulb = M().fn((x, y) => { const dx = (x + 0.5 - 16) / 11, dy = (y + 0.5 - 20) / 9.5; return dx * dx + dy * dy * (dy < 0 ? 1.1 : 1) <= 1; }).poly([[13, 12], [19, 12], [17.5, 6], [14.5, 6]]);
  ring(pc, bulb, R);
  vol(pc, bulb, R, { round: 5, spec: 0.9 });
  // clove seams with a faint violet blush
  for (const [x0, x1] of [[11, 9], [16, 16], [21, 23]]) lineIn(pc, x0 + (x1 - x0) * 0.2, 13, x1, 27, R[4], bulb);
  bulb.each((x, y) => { if (y > 22 && hash2(x, y, 5) < 0.25) pc.set(x, y, mix(R[3], 0xc8a0c8, 0.4)); });
  // papery neck + root tuft
  const NK = mat(0xd8c8a8);
  lineIn(pc, 15, 6, 16, 2, NK[3]); lineIn(pc, 17, 6, 18, 2, NK[4]);
  const RT = mat(0xc8b088);
  for (let i = -3; i <= 3; i++) lineIn(pc, 16 + i, 29, 16 + i * 1.6, 31, RT[3 + (i & 1)]);
  sparkle(pc, 10, 16, 1, 0xffffff, R[0]);
}

function moss(pc) {
  const R = mat(0x4aa84a, { cont: 1.1 });
  const ROCK = mat(0x6a625a);
  const rock = M().poly([[3, 26], [8, 20], [24, 18], [30, 24], [26, 29], [6, 30]]);
  ring(pc, rock, ROCK); vol(pc, rock, ROCK, { round: 2 });
  const mat0 = M();
  for (let i = 0; i < 9; i++) mat0.disk(7 + i * 2.3, 18 - Math.sin(i * 0.8) * 2.2 + (i % 2), 3.6 + (i % 3) * 0.6);
  mat0.sub(M().rect(0, 25, 32, 8));
  ring(pc, mat0, R);
  vol(pc, mat0, R, { round: 2.5, tex: (x, y) => (hash2(x, y, 41) - 0.5) * 0.5 });
  // glowing tips
  mat0.edge().each((x, y) => { if (y < 18 && hash2(x, y, 43) < 0.4) gl(pc, x, y, 0xb8ffb0, 0.9); });
  mat0.each((x, y) => { if (hash2(x, y, 47) < 0.05) gl(pc, x, y, 0x9af08a, 0.8); });
  for (const [x, y] of [[6, 9], [25, 8], [15, 6]]) gl(pc, x, y, 0xc8ffc0, 0.8);
}

function grub(pc) {
  const R = mat(0xf0e0c0, { cont: 1.05, warm: 55 });
  // a curled C of segments
  const segs = [];
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.15 + i * 0.17);
    segs.push([16 + Math.cos(a) * 8.5, 17 - Math.sin(a) * 7.5, 4.2 - Math.abs(i - 4) * 0.25]);
  }
  const body = M();
  for (const [x, y, r] of segs) body.disk(x, y, r);
  ring(pc, body, R);
  vol(pc, body, R, { round: 3, spec: 0.88, bounce: true });
  for (let i = 1; i < segs.length; i++) {
    const [x, y] = segs[i], [px, py] = segs[i - 1];
    const mx = (x + px) / 2, my = (y + py) / 2, nx = -(y - py), ny = x - px, l = Math.hypot(nx, ny) || 1;
    for (let k = -3; k <= 3; k++) { const X = mx + nx / l * k, Y = my + ny / l * k; if (body.get(X, Y)) pc.set(X, Y, R[4]); }
  }
  // amber head with mandibles
  const [hx, hy] = segs[segs.length - 1];
  const head = M().disk(hx - 1, hy + 1, 3);
  const HR = mat(0xc8782a, { cont: 1.1 });
  ring(pc, head, HR); vol(pc, head, HR, { round: 1.5, spec: 0.8 });
  pc.set(hx - 3, hy + 3, 0x3a2010); pc.set(hx - 1, hy + 4, 0x3a2010);
  // a second little grub peeking
  const g2 = M().ellipse(25, 26, 4, 2.2);
  ring(pc, g2, R); vol(pc, g2, R, { round: 1.5 });
  pc.set(28, 26, HR[3]);
}

function dinoEgg(pc) {
  // nest of twigs
  const NR = mat(0x8a6a3a);
  const nest = M().ellipse(16, 27, 14, 4);
  ring(pc, nest, NR); fill(pc, nest, NR[4]);
  for (let i = 0; i < 14; i++) { const a = i * 0.7; lineIn(pc, 3 + i * 2, 25 + (i % 3), 6 + i * 2 + Math.cos(a) * 3, 29 - (i % 2), i % 2 ? NR[2] : NR[3]); }
  const R = mat(0xd8e0c0, { cont: 1.05, sat: 0.7 });
  const egg = M().fn((x, y) => { const dx = (x + 0.5 - 16) / 10, dy = (y + 0.5 - 15) / 13; return dx * dx * (1 + dy * 0.3) + dy * dy <= 1; }).sub(M().rect(0, 27, 32, 6));
  ring(pc, egg, R);
  vol(pc, egg, R, { spec: 0.92, bounce: true });
  // green-brown speckles
  egg.each((x, y) => { const h = hash2(x, y, 61); if (h < 0.09) pc.set(x, y, 0x6a8a4a); else if (h > 0.95) pc.set(x, y, 0x8a6a3a); });
  for (const [x, y] of [[12, 9], [19, 13], [14, 18], [20, 21]]) { pc.set(x, y, 0x4a6a3a); pc.set(x + 1, y, 0x5a7a40); }
  pc.set(12, 5, 0xffffff); pc.set(11, 6, R[0]); pc.set(12, 6, R[0]);
  // twigs over the front
  for (let i = 0; i < 6; i++) lineIn(pc, 4 + i * 4, 27 + (i % 2), 9 + i * 4, 26, NR[i % 2 ? 1 : 3]);
}

function drakeMeat(pc) {
  const PP = mat(0xe8d8b8);
  const paper = M().poly([[2, 20], [16, 12], [31, 18], [17, 28]]);
  ring(pc, paper, PP); fill(pc, paper, PP[2]);
  paper.edge().each((x, y) => { if (y > 20) pc.set(x, y, PP[4]); });
  const R = mat(0xa83a3a, { cont: 1.1, warm: 10 });
  const meat = M().ellipse(16, 19, 10, 6).ellipse(12, 16, 6, 4);
  ring(pc, meat, R);
  vol(pc, meat, R, { round: 3, spec: 0.82 });
  // marbling + fat rim
  meat.each((x, y) => { if (vnoise(x * 0.6, y * 0.9, 13) > 0.7) pc.set(x, y, 0xe8b8a8); });
  meat.edge().each((x, y) => { if (y > 19) pc.set(x, y, 0xf0d8c0); });
  // bone
  const B = mat(0xf0e8d0);
  const bone = M().capsule(20, 19, 29, 13, 1.4).disk(29.5, 12, 1.8).disk(28, 11, 1.6);
  ring(pc, bone, B); vol(pc, bone, B, { round: 1 });
  // scaly hint: one drake scale stuck on the paper
  gl(pc, 6, 22, 0xff9a4a, 0.3); pc.set(7, 22, 0xd8582a);
}

// ---------------------------------------------------------------- dishes
function mushStew(pc) {
  const s = bowl(pc, { R: CLAY(), y: 14, h: 12, band: 0xf0d090 });
  surface(pc, s, mat(0x9a6a3a, { cont: 1 }), { gloss: true });
  // mushroom slices: cap curve + stem
  const MR = mat(0xd8c0a0);
  for (const [x, y] of [[9, 14], [15, 13], [21, 15], [12, 17], [19, 17]]) {
    const cap = M().ellipse(x, y, 2.4, 1.3).sub(M().rect(0, y + 1, 32, 4));
    fill(pc, cap, MR[2]); pc.set(x, y + 1, MR[3]); pc.set(x, y + 2, MR[4]);
    cap.edge().each((X, Y) => { if (Y <= y - 1) pc.set(X, Y, 0x7a4a2a); });
  }
  sprig(pc, 20, 13, 27, 7, 3);
  chunks(pc, s, [[0xf0e8d8, 3, 1]], 5);
  steam(pc, [10, 15], 9, 7);
}

function trufOmelette(pc) {
  plate(pc, { trim: 0x8a6a3a });
  const R = mat(0xffd848, { cont: 1.05, warm: 55 });
  const om = M().fn((x, y) => { const dx = (x + 0.5 - 16) / 12, dy = (y + 0.5 - 18) / 6; return dx * dx + dy * dy <= 1; });
  ring(pc, om, R);
  vol(pc, om, R, { round: 3, spec: 0.85 });
  for (let x = 6; x < 27; x++) { const y = 17 + Math.sin(x * 0.2) * 0.5; if (om.get(x, y)) pc.set(x, y, R[4]); }
  om.each((x, y) => { if (hash2(x, y, 9) < 0.05) pc.set(x, y, 0xd89a3a); });
  // black truffle shavings (thin curled flakes)
  const TR = mat(0x3a2a24);
  for (const [x, y] of [[10, 14], [15, 13], [20, 14], [12, 17], [18, 16], [23, 17]]) {
    const f = M().ellipse(x, y, 1.8, 0.9);
    fill(pc, f, TR[3]); pc.set(x - 1, y, TR[1]); pc.set(x + 1, y, 0xc8b0a0);
  }
  sparkle(pc, 8, 8, 2, 0xfff6c0, 0xffe080);
}

function pieBase(pc, filling, o = {}) {
  const CR = CRUST();
  const dish = M().ellipse(16, 21, 14.5, 7.5);
  ring(pc, dish, CR);
  vol(pc, dish, mat(0xb06a3a), { round: 2 });
  const top = M().ellipse(16, 18, 13.5, 7.5);
  vol(pc, top, CR, { round: 3 });
  M().ellipse(16, 18, 13.5, 7.5).edge().each((x, y) => pc.set(x, y, (x % 2) ? CR[1] : CR[3]));
  if (o.lattice) {
    const FR = mat(filling, { cont: 1.1 });
    M().ellipse(16, 18, 11, 6).each((x, y) => {
      const vx = ((x - 1) % 5 + 5) % 5, hy = ((y - 13) % 3 + 3) % 3;
      if (vx < 2) { pc.set(x, y, vx === 0 ? CR[1] : CR[3]); return; }
      if (hy === 0) { pc.set(x, y, CR[2]); return; }
      pc.set(x, y, FR[hy === 1 ? 2 : 4]);
    });
  } else {
    // closed crust: steam slits and a glaze shine
    for (const [x, y] of [[12, 16], [16, 15], [20, 16]]) { lineIn(pc, x - 1, y - 1, x + 1, y + 1, CR[5]); }
  }
  return CR;
}

function rootPie(pc) {
  const CR = pieBase(pc, 0xe0a040, { lattice: true });
  // a carrot-coloured pastry leaf + tuber cubes peeking
  leaf(pc, 13, 13, 20, 10, 1.6, mat(0xf2a35e));
  for (const [x, y] of [[9, 18], [22, 20], [15, 21]]) { pc.set(x, y, 0xe8d8b0); pc.set(x + 1, y, 0xc8b088); }
  steam(pc, [11, 17, 22], 10, 6);
  sparkle(pc, 8, 15, 1, 0xfff4e0, CR[0]);
}

function fishPie(pc) {
  const CR = pieBase(pc, 0xe8d8b0, { lattice: false });
  // stargazy: three fish heads poking out, looking up
  const FR = mat(0xc8ccd8, { cont: 1.15 });
  for (const [x, y, a] of [[10, 15, -0.4], [16, 13, 0], [22, 15, 0.4]]) {
    const h = M().capsule(x, y + 2, x + Math.sin(a) * 4, y - 4, [2.2, 1.2]);
    ring(pc, h, FR); vol(pc, h, FR, { round: 1, spec: 0.8 });
    pc.set(x + Math.sin(a) * 3 - 1, y - 2, 0x1a1a24); // eye
    pc.set(x + Math.sin(a) * 4, y - 5, FR[1]);
  }
  steam(pc, [13, 19], 9, 6);
  sparkle(pc, 26, 12, 1, 0xfff4e0, CR[0]);
}

function friedGrubs(pc) {
  plate(pc, { trim: 0xc8902a });
  const R = mat(0xe0a838, { cont: 1.1, warm: 50 });
  for (const [x, y, f] of [[10, 18, 1], [16, 16, -1], [21, 19, 1], [13, 21, -1], [19, 22, 1], [24, 16, -1]]) {
    const g = M();
    for (let i = 0; i < 5; i++) g.disk(x + f * (i - 2) * 1.2, y - Math.sin(i * 0.8) * 1.2, 1.9);
    ring(pc, g, R); vol(pc, g, R, { round: 1.5, spec: 0.8 });
    g.each((X, Y) => { if (hash2(X, Y, 7) < 0.2) pc.set(X, Y, R[1]); });
  }
  // salt flakes + chili flakes
  for (const [x, y] of [[12, 15], [18, 14], [22, 21], [9, 21], [15, 19]]) pc.set(x, y, 0xffffff);
  for (const [x, y] of [[14, 17], [20, 17]]) pc.set(x, y, 0xd8302a);
  steam(pc, [12, 20], 12, 6);
}

function saltFish(pc) {
  board(pc);
  const R = mat(0xe0d0b0, { cont: 1.1, sat: 0.7 });
  const fish = M().ellipse(15, 18, 10, 3.6).poly([[23, 18], [29, 13], [29, 22]]);
  ring(pc, fish, R);
  vol(pc, fish, R, { round: 2.5, spec: 0.82 });
  fish.each((x, y) => { if (((x + y * 2) % 4) === 0 && y > 16) pc.set(x, y, R[4]); });
  pc.set(7, 17, 0x2a1a10);
  // big salt crystals scattered
  for (const [x, y] of [[9, 23], [18, 24], [24, 21], [5, 19], [21, 14]]) { pc.set(x, y, 0xffffff); pc.set(x + 1, y, 0xf0e6e6); pc.set(x, y + 1, 0xd8c8c8); }
  sparkle(pc, 13, 15, 1, 0xffffff, 0xf0f0f0);
}

function bread(pc) {
  board(pc);
  const R = mat(0xd8a058, { cont: 1.15, warm: 45 });
  const loaf = M().ellipse(16, 17, 12, 7.5).sub(M().rect(0, 22, 32, 10)).union(M().ellipse(16, 21, 12, 2.5));
  ring(pc, loaf, R);
  vol(pc, loaf, R, { round: 4, spec: 0.9, bounce: true });
  // scored top + flour dust + herb flecks
  for (const x0 of [9, 14, 19]) lineIn(pc, x0, 15, x0 + 4, 11, R[5], loaf);
  for (const x0 of [9, 14, 19]) lineIn(pc, x0 + 1, 15, x0 + 5, 11, mix(R[1], 0xfff8e8, 0.5), loaf);
  loaf.each((x, y) => { const h = hash2(x, y, 23); if (h < 0.06) pc.set(x, y, 0x5a7a3a); else if (h > 0.96 && y < 15) pc.set(x, y, 0xfff8ec); });
  sprig(pc, 22, 25, 29, 20, 3);
  steam(pc, [12, 18], 8, 5);
}

function jamToast(pc) {
  plate(pc, { trim: 0xd02a40 });
  const BR = mat(0xd8a05a, { cont: 1.15, warm: 45 });
  const crust = M().poly([[5, 18], [14, 11], [27, 15], [19, 24]]).union(M().ellipse(9.5, 14.5, 5, 4));
  ring(pc, crust, BR);
  vol(pc, crust, BR, { round: 1.5 });
  const crumb = crust.clone().erode(1);
  fill(pc, crumb, BR[1]);
  const J = mat(0xc8203a, { cont: 1.2 });
  const jam = crumb.clone().erode(1);
  jam.each((x, y) => { if (vnoise(x * 0.5, y * 0.5, 3) > 0.32) pc.set(x, y, hash2(x, y, 4) < 0.15 ? J[1] : J[3]); });
  jam.edge().each((x, y) => { if (hash2(x, y, 6) < 0.4) pc.set(x, y, J[4]); });
  for (const [x, y] of [[12, 15], [18, 17], [15, 19]]) { const m = M().disk(x, y, 1.5); fill(pc, m, J[2]); pc.set(x - 1, y - 1, 0xffc0c8); }
  // butter curl + berries
  const BU = mat(0xffe07a);
  const b = M().ellipse(22, 16, 2.4, 1.3); fill(pc, b, BU[1]); pc.set(23, 16, BU[3]);
  for (const [x, y] of [[26, 22], [24, 24]]) { const m = M().disk(x, y, 1.6); ring(pc, m, J); vol(pc, m, J, { spec: 0.8 }); }
}

function jamJar(pc) {
  const G = mat(0xd8e8e8, { cont: 1.1, sat: 0.4 });
  const jar = M().rect(9, 10, 14, 18).ellipse(16, 28, 7, 1.8).ellipse(16, 10, 7, 1.8);
  ring(pc, jar, G);
  const J = mat(0xc82a48, { cont: 1.15 });
  const jam = M().rect(10, 12, 12, 16).ellipse(16, 28, 6, 1.4);
  vol(pc, jam, J, { mode: 'cyl', axis: Math.PI / 2, spec: 0.8 });
  for (let y = 12; y < 27; y++) pc.set(10, y, G[1]);
  for (const [x, y] of [[13, 18], [18, 22], [15, 25]]) pc.set(x, y, J[0]);
  // cloth lid tied with twine
  const C = mat(0xe8d8b0);
  const lid = M().ellipse(16, 9, 9, 2.8).rect(7, 9, 18, 3);
  ring(pc, lid, C); vol(pc, lid, C, { round: 1.5 });
  lid.each((x, y) => { if (((x >> 1) + (y >> 1)) % 2 && y > 8) pc.set(x, y, 0xc84a3a); });
  for (let x = 8; x < 25; x++) pc.set(x, 12, 0xa0784a);
  // label
  const L = M().rect(12, 17, 8, 6);
  fill(pc, L, 0xf4ead0); L.edge().each((x, y) => pc.set(x, y, 0xc8b080));
  pc.set(15, 19, 0xc82a48); pc.set(16, 19, 0xc82a48); pc.set(16, 20, 0x5a8a3a);
  sparkle(pc, 21, 15, 1, 0xffffff, 0xe0f0f0);
}

function frittata(pc) {
  // cast-iron pan with a thick golden frittata, a wedge cut out
  const IR = mat(0x3a3438, { cont: 1.2 });
  const pan = M().ellipse(15, 19, 13, 7.5);
  ring(pc, pan, IR); vol(pc, pan, IR, { round: 2 });
  lineIn(pc, 26, 17, 31, 13, IR[3]); lineIn(pc, 26, 18, 31, 14, IR[5]);
  const R = mat(0xf0c040, { cont: 1.1, warm: 50 });
  const top = M().ellipse(15, 18, 11, 6).sub(M().poly([[15, 18], [26, 15], [26, 22]]));
  ring(pc, top, R);
  vol(pc, top, R, { round: 3, spec: 0.85 });
  top.each((x, y) => { const h = hash2(x, y, 17); if (h < 0.1) pc.set(x, y, 0xc88a2a); else if (h > 0.93) pc.set(x, y, 0x5a8a3a); });
  // cut face showing the thickness + tuber cubes
  for (let x = 16; x < 25; x++) { const y = 18 + (x - 15) * 0.15; pc.set(x, y + 1, R[4]); pc.set(x, y + 2, R[5]); }
  for (const [x, y] of [[10, 17], [17, 15], [12, 20]]) { pc.set(x, y, 0xe8d8b0); pc.set(x + 1, y, 0xc8b088); }
  sprig(pc, 6, 14, 12, 11, 3);
  steam(pc, [10, 16], 11, 6);
}

function jerky(pc) {
  board(pc);
  const R = mat(0x8a3a2a, { cont: 1.15, warm: 10 });
  for (const [x0, y0, x1, y1] of [[5, 21, 20, 13], [9, 24, 25, 16], [14, 26, 28, 20]]) {
    const s = M().capsule(x0, y0, x1, y1, 2.2);
    ring(pc, s, R);
    vol(pc, s, R, { round: 1.2, tex: (x, y) => (hash2(x, y, 5) - 0.5) * 0.6 });
    s.each((x, y) => { if (hash2(x, y, 8) < 0.07) pc.set(x, y, 0x2a1a10); else if (hash2(x, y, 9) < 0.05) pc.set(x, y, 0xd84a2a); });
  }
  // twine bundle
  const TW = mat(0xc8a870);
  lineIn(pc, 12, 14, 17, 26, TW[2]); lineIn(pc, 13, 14, 18, 26, TW[4]);
  pc.set(19, 27, TW[3]); pc.set(20, 28, TW[3]);
  // pepper on top
  for (const [x, y] of [[10, 18], [16, 17], [21, 21], [24, 18]]) pc.set(x, y, 0x1a1a1a);
}

function pesto(pc) {
  const s = bowl(pc, { R: mat(0x6a6a72, { cont: 1.1 }), y: 15, h: 11 });
  const G = mat(0x5ac85a, { cont: 1.05 });
  surface(pc, s, G, { emit: 0.25 });
  for (let k = 0; k < 4; k++) for (let x = 5; x < 28; x++) { const y = 14 + k * 1.3 + Math.sin(x * 0.8 + k * 2) * 0.8; if (s.get(x, y)) gl(pc, x, y, k % 2 ? 0x9af08a : 0x7ae06a, 0.6); }
  for (const [x, y] of [[11, 15], [19, 14]]) { pc.set(x, y, 0xf0e8d8); pc.set(x + 1, y, 0xd8d0c0); }
  // fork twirl
  const F = mat(0xc8ccd4, { cont: 1.2 });
  lineIn(pc, 18, 14, 27, 3, F[2]); lineIn(pc, 19, 14, 28, 3, F[4]);
  for (const [x, y] of [[6, 7], [25, 9], [15, 4]]) gl(pc, x, y, 0xb8ffb0, 0.8);
}

function mash(pc) {
  const s = bowl(pc, { R: mat(0x6a8ab0, { cont: 1.05 }), y: 16, h: 10 });
  const R = mat(0xf0e0b0, { cont: 1.05 });
  const heap = M().ellipse(16, 14, 10, 4).ellipse(15, 11.5, 6, 3).union(s);
  ring(pc, heap, R);
  vol(pc, heap, R, { round: 3, tex: (x, y) => (vnoise(x * 0.9, y * 0.9, 4) - 0.5) * 0.4 });
  // melting butter pat + garlic bits
  const B = mat(0xffd84a);
  const pat = M().poly([[13, 9], [18, 8.5], [19, 11], [14, 11.5]]);
  fill(pc, pat, B[1]); pc.set(18, 11, B[3]); pc.set(19, 12, B[2]); pc.set(15, 12, B[2]);
  for (const [x, y] of [[9, 14], [22, 13], [12, 16]]) pc.set(x, y, 0xfffaf0);
  for (const [x, y] of [[20, 15], [11, 12]]) pc.set(x, y, 0x5a8a3a);
  steam(pc, [10, 21], 7, 6);
}

function tea(pc) {
  const C = mat(0xe0d8c8, { cont: 1.05 });
  const cup = M().rect(8, 12, 14, 13).ellipse(15, 25, 7, 2.5).ellipse(15, 12, 7, 2.4);
  const handle = M().ellipse(24, 18, 4, 4).sub(M().ellipse(24, 18, 2, 2.2)).sub(M().rect(0, 0, 22, 32));
  ring(pc, cup.clone().union(handle), C);
  vol(pc, cup, C, { mode: 'cyl', axis: Math.PI / 2, spec: 0.85 });
  vol(pc, handle, C, { round: 1 });
  const T = mat(0xc8a050);
  const top = M().ellipse(15, 12, 5.8, 1.6);
  fill(pc, top, T[2]); pc.set(12, 12, T[0]);
  for (let x = 8; x < 22; x++) pc.set(x, 19, x % 3 ? 0x7a9a5a : 0x5a7a3a); // painted band
  sprig(pc, 17, 12, 22, 4, 3);
  steam(pc, [12, 15], 9, 6);
  // saucer
  const S = mat(0xd8d0c0);
  const sc = M().ellipse(15, 27.5, 12, 2.6);
  ring(pc, sc, S); fill(pc, sc, S[2]);
}

const DRAW = {
  berry: berries, thyme, tuber, garlic, moss, grub, dinoegg: dinoEgg, drake: drakeMeat,
  mushstew: mushStew, trufomelette: trufOmelette, rootpie: rootPie, fishpie: fishPie, friedgrubs: friedGrubs,
  saltfish: saltFish, bread, jamtoast: jamToast, jam: jamJar, frittata, jerky, pesto, mash, tea,
};

/** PixelArt.drawIconArt hook: draws { k: 'cook', t } specs, returns false for anything else. */
export function drawCookIcon(pc, spec) {
  if (!spec || spec.k !== 'cook') return false;
  const f = DRAW[spec.t];
  if (!f) return false;
  f(pc, spec);
  return true;
}

