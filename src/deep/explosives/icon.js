// 32×32 icons for the explosives, drawn with the shared icon toolkit (gfx/px): a red paper stick
// with a wax cap, a label band and a sparking fuse; a bundle of three tied with twine; the heavy
// blasting charge, an iron canister with hazard stripes and a red lamp.
//
// drawExplosiveIcon(pc, spec) paints into a 32×32 PixelCanvas for item specs { k: 'tool',
// t: 'dynamite', n: 1 | 3, charge? } (the hook in gfx/px/gear.js's drawGear 'tool' branch).
// explosiveIconURL(id) is a cached data URL with the UI glow halo, for the upgrade board.
import { PixelCanvas } from '../../gfx/px/canvas.js';
import { mat, mix } from '../../gfx/px/color.js';
import { glowHalo } from '../../gfx/px/shade.js';
import { M, hash2, step, ink, seam, line, gl, loop, form, tube, marks, bumps, twinkle, glint, rivet, RAMPS } from '../../gfx/px/lifeKit.js';
import { ITEMS } from '../../data/items.js';

// Hand-pixel style (gfx/px/lifeKit): rolled paper sticks with a spiral seam and crimped wax ends,
// a stencilled label, a braided fuse spitting sparks; a twine-lashed bundle; a dented, riveted
// iron canister with hazard stripes. Thin fuses and sparks go over the ink so they stay fine.

/** One rolled stick from (x0, y0) (bottom) to (x1, y1) (fuse end), radius r. Returns the tube. */
function stick(pc, x0, y0, x1, y1, r, o = {}) {
  const R = mat(o.c || 0xc42a22, { cont: 1.2, sat: 1.1 });
  const W = mat(0x8a1e1a, { cont: 1.1 });
  const P = mat(0xeee0b8, { cont: 1.05 });
  const sw = tube(pc, [[x0, y0], [x1, y1]], (s) => r * (1 + Math.sin(s * 23 + (o.seed || 0)) * 0.04), R, { bias: -0.04, capStart: 0.25, capEnd: 0.25, clip: o.clip });
  const L = Math.hypot(x1 - x0, y1 - y0);
  sw.mask.each((x, y) => {
    const i = y * 32 + x, s = sw.S[i], v = sw.V[i], k = sw.K[i];
    // wax-dipped ends, crimped
    if (s < 0.08 || s > 0.93) { pc.set(x, y, W[Math.min(5, k + ((x + y) % 2))]); return; }
    // the label band with a stencilled mark
    if (o.label !== false && s > 0.38 && s < 0.62) {
      pc.set(x, y, P[k]);
      if (s > 0.45 && s < 0.55 && Math.abs(v) < r * 0.5 && (x + y) % 3 !== 0) pc.set(x, y, mix(0x3a1a12, P[k], 0.2));
      return;
    }
    // paper wrap: a spiral seam of lit lips
    if (k >= 2 && k <= 4 && ((s * L * 0.8 + v * 0.9) % 3.4 + 3.4) % 3.4 < 0.55) pc.set(x, y, R[k - 1]);
  });
  return sw;
}

/** A braided fuse through the given points (drawn over the ink), sparks at its tip. */
function fuse(pc, pts, spark = true) {
  const C = [0xe0d4b4, 0x9a8e74, 0x5e5444];
  let n = 0;
  for (let i = 0; i + 1 < pts.length; i++) line(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], (k, X, Y) => { n++; pc.set(X + 1, Y, C[2]); return n % 2 ? C[0] : C[1]; });
  if (!spark) return;
  const [tx, ty] = pts[pts.length - 1];
  gl(pc, tx, ty - 1, 0xfff2b0);
  twinkle(pc, tx, ty - 2, 0xffffff, 0xffc04a, 2, 1);
  for (const [dx, dy, c] of [[-3, -1, 0xffd06a], [3, -3, 0xffa03a], [2, 1, 0xff8a2a], [-2, -4, 0xffe08a], [4, 0, 0xffc060]]) gl(pc, tx + dx, ty - 2 + dy, c, 0.9);
}

function dynamite(pc) {
  stick(pc, 7.6, 26.4, 21.6, 11.4, 3.3, { seed: 1 });
  ink(pc);
  fuse(pc, [[22, 10], [23, 8], [24, 7], [25, 7], [26, 5]]);
  glint(pc, 12, 19, 0);
}

function bundle(pc) {
  // three sticks of slightly different lengths, lashed with twine, fuses twisted together
  stick(pc, 10.6, 27.6, 23.4, 13.2, 2.9, { c: 0xb02c24, label: false, seed: 2 });
  stick(pc, 4.6, 22.6, 17.6, 8.2, 2.9, { c: 0xbe3228, label: false, seed: 3 });
  stick(pc, 7.2, 26, 20.8, 10.6, 3.1, { seed: 4 });
  const TW = RAMPS.twine();
  for (const t of [0.22, 0.74]) {
    const cx = 7.2 + (20.8 - 7.2) * t, cy = 26 + (10.6 - 26) * t;
    const band = tube(pc, [[cx - 5.6, cy - 5.8], [cx + 6.2, cy + 5.2]], 1, TW, { bias: 0.1, capStart: 0.05, capEnd: 0.05 });
    band.mask.each((x, y) => { if ((x + y) % 3 === 0) step(pc, TW, x, y, 1, 1, 5); });
  }
  ink(pc);
  pc.set(26, 15, 0xa8885a); pc.set(27, 16, 0xc8a46a);
  fuse(pc, [[20, 9], [21, 7], [22, 6], [23, 4], [24, 3]]);
  line(pc, 18, 7, 21, 7, 0x9a8e74); line(pc, 23, 12, 22, 8, 0x9a8e74);
}

function charge(pc) {
  const IR = mat(0x4c4e58, { cont: 1.2 });
  const RD = mat(0xb8302a, { cont: 1.15 });
  const YL = mat(0xf2c23a, { cont: 1.1 });
  // a squat iron canister, a little dented, seen from above: red bands, a hazard stripe, rivets
  const body = loop([[6.4, 13.6], [9, 11.4], [16, 10.6], [23, 11.4], [25.6, 13.6], [25.4, 20], [25.8, 26.4], [23, 29], [16, 30], [9, 29.2], [6.2, 26.6], [6.6, 20]]);
  seam(pc, body, 'shadow');
  const K = form(pc, body, IR, { cx: 12, cy: 18, rx: 13, ry: 26, flatten: 0.7, dome: 0.15, bias: 0.06 });
  body.each((x, y) => {
    const k = K[y * 32 + x];
    if ((y >= 14 && y <= 15) || (y >= 26 && y <= 27)) pc.set(x, y, RD[k]);
    else if (y >= 19 && y <= 22) pc.set(x, y, ((x + y) >> 1) % 2 ? mix(0x2a2420, 0x000000, k * 0.05) : YL[k]);
  });
  for (const [x, y] of [[20, 17], [21, 17], [9, 24]]) step(pc, IR, x, y, 1, 1, 5);
  pc.set(20, 18, IR[1]); pc.set(9, 25, IR[1]);
  for (const x of [9, 13, 19, 23]) { rivet(pc, x, 16, IR); rivet(pc, x, 24, IR); }
  // the lid: a rim, a brass cap, a red lamp
  const lid = loop([[6.4, 13.4], [9, 10.4], [16, 9.4], [23, 10.4], [25.6, 13.4], [23, 15.4], [16, 16], [9, 15.4]]);
  seam(pc, lid, 'shadow');
  form(pc, lid, IR, { flatten: 0.5, bias: 0.1 });
  const BR = RAMPS.brass();
  const cap = loop([[13.4, 12, 1], [13.4, 7.4], [16, 6.4], [18.6, 7.4], [18.6, 12, 1], [16, 12.8]]);
  seam(pc, cap, 'shadow');
  form(pc, cap, BR, { cx: 15, cy: 9, rx: 4, ry: 8, flatten: 0.7, bias: 0.1 });
  ink(pc);
  for (const [x, y, c] of [[15, 5, 0xff5a3a], [16, 5, 0xff8a6a], [15, 4, 0xff3a2a], [16, 4, 0xffd0b0]]) gl(pc, x, y, c, 1);
  twinkle(pc, 16, 2, 0xffe0d0, 0xff6a4a, 1, 0.8);
  fuse(pc, [[26, 12], [27, 11], [28, 11], [29, 12], [29, 14], [28, 15]], false);
  glint(pc, 9, 12, 0);
}

/** Paint the icon for an explosive spec into a 32×32 PixelCanvas. Returns true when drawn. */
export function drawExplosiveIcon(pc, spec = {}) {
  if (spec.charge) charge(pc);
  else if ((spec.n || 1) >= 3) bundle(pc);
  else dynamite(pc);
  return true;
}

const urls = new Map();
/** Data URL for an explosive item's icon (with a glow halo around the spark), cached. */
export function explosiveIconURL(id) {
  if (urls.has(id)) return urls.get(id);
  const pc = new PixelCanvas(32);
  drawExplosiveIcon(pc, ITEMS[id]?.icon || {});
  glowHalo(pc, 0xffd890, 70, 2);
  const url = pc.commit().toDataURL();
  urls.set(id, url);
  return url;
}
