// 32×32 icons for the explosives, drawn with the shared icon toolkit (gfx/px): a red paper stick
// with a wax cap, a label band and a sparking fuse; a bundle of three tied with twine; the heavy
// blasting charge, an iron canister with hazard stripes and a red lamp.
//
// drawExplosiveIcon(pc, spec) paints into a 32×32 PixelCanvas for item specs { k: 'tool',
// t: 'dynamite', n: 1 | 3, charge? } (the hook in gfx/px/gear.js's drawGear 'tool' branch).
// explosiveIconURL(id) is a cached data URL with the UI glow halo, for the upgrade board.
import { PixelCanvas } from '../../gfx/px/canvas.js';
import { mat, mix } from '../../gfx/px/color.js';
import { vol, fill, sparkle, glowHalo, hash2 } from '../../gfx/px/shade.js';
import { M, ring } from '../../gfx/px/parts.js';
import { ITEMS } from '../../data/items.js';

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };

/** One stick from (x0, y0) (bottom) to (x1, y1) (fuse end), radius r. Returns its mask. */
function stick(pc, x0, y0, x1, y1, r, o = {}) {
  const R = mat(o.c || 0xc8342a, { cont: 1.15 });
  const ax = x1 - x0, ay = y1 - y0, L = Math.hypot(ax, ay);
  const m = M().capsule(x0, y0, x1, y1, r);
  if (o.clip) m.sub(o.clip);
  ring(pc, m, R);
  vol(pc, m, R, { mode: 'cyl', axis: Math.atan2(ay, ax), spec: 0.86 });
  const along = (x, y) => ((x + 0.5 - x0) * ax + (y + 0.5 - y0) * ay) / (L * L);
  const across = (x, y) => (-(x + 0.5 - x0) * ay + (y + 0.5 - y0) * ax) / L;
  m.each((x, y) => {
    const t = along(x, y);
    const k = R.indexOf(pc.getHex(x, y));
    // wax caps at both ends, darker
    if ((t < 0.07 || t > 0.94) && k >= 0 && k < 6) pc.set(x, y, R[Math.min(6, k + 1)]);
    // a cream label band with a dark stencil mark
    if (o.label !== false && t > 0.38 && t < 0.62) {
      const P = mat(0xeee0b8, { cont: 0.9 });
      const kk = Math.max(1, Math.min(5, k));
      pc.set(x, y, P[kk]);
      const a = across(x, y);
      if (t > 0.45 && t < 0.55 && Math.abs(a) < r * 0.55 && hash2(x, y, 3) < 0.75) pc.set(x, y, mix(0x3a1a12, P[kk], 0.25));
    }
    // paper seam: a faint spiral of lighter pixels
    else if (k >= 2 && k <= 4 && ((t * L * 0.8 + across(x, y) * 0.9) % 3.2 + 3.2) % 3.2 < 0.6) pc.set(x, y, R[k - 1]);
  });
  return m;
}

/** A fuse from (x, y) curling out by the given points; a spark at its tip. */
function fuse(pc, pts, spark = true) {
  const C = [0xd8ceb0, 0x9a8e74, 0x5e5444];
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    pc.set(x, y, i % 2 ? C[1] : C[0]);
    if (i < pts.length - 1) pc.set(x + 1, y, C[2]);
  }
  if (!spark) return;
  const [tx, ty] = pts[pts.length - 1];
  gl(pc, tx, ty - 1, 0xfff2b0);
  sparkle(pc, tx, ty - 2, 2, 0xffffff, 0xffc04a, 1);
  for (const [dx, dy, c] of [[-3, -1, 0xffd06a], [3, -2, 0xffa03a], [2, 1, 0xff8a2a], [-2, -4, 0xffe08a]]) gl(pc, tx + dx, ty - 2 + dy, c, 0.9);
}

function dynamite(pc) {
  stick(pc, 8, 26, 21.5, 11.5, 3.3);
  fuse(pc, [[23, 10], [23, 9], [24, 8], [25, 7], [25, 6], [26, 5]]);
}

function bundle(pc) {
  // back, middle, front: three sticks side by side along the diagonal, a shared twisted fuse
  stick(pc, 10.5, 27.5, 23, 13.5, 2.9, { c: 0xb02c24, label: false });
  stick(pc, 5, 22.5, 18, 8.5, 2.9, { c: 0xbe3228, label: false });
  const front = stick(pc, 7.5, 25.5, 20.5, 11, 3.1);
  // twine bands across the bundle (light rope with dark twists)
  const T = mat(0xc8a46a, { cont: 1 });
  for (const t of [0.24, 0.76]) {
    const cx = 7.5 + (20.5 - 7.5) * t, cy = 25.5 + (11 - 25.5) * t;
    const band = M().capsule(cx - 6, cy - 5.4, cx + 6, cy + 5.4, 1.1);
    const cover = M().capsule(4, 23, 24, 10, 7.5);
    band.and(cover);
    ring(pc, band, T, { clip: cover });
    vol(pc, band, T, { mode: 'cyl', axis: Math.atan2(5.4, 6) });
    band.each((x, y) => { if ((x + y) % 3 === 0) pc.set(x, y, T[4]); });
  }
  void front;
  fuse(pc, [[20, 9], [21, 8], [21, 7], [22, 6], [23, 5], [23, 4], [24, 3]]);
}

function charge(pc) {
  const IR = mat(0x4c4e58, { cont: 1.2 });
  const RD = mat(0xb8302a, { cont: 1.15 });
  // the canister: an upright drum seen a little from above
  const body = M().rect(7, 12, 18, 15).ellipse(16, 27, 9, 3);
  ring(pc, body, IR);
  vol(pc, body, IR, { mode: 'cyl', axis: 0, spec: 0.82 });
  // red bands top and bottom, a hazard stripe band in the middle
  body.each((x, y) => {
    const k = Math.max(1, Math.min(5, IR.indexOf(pc.getHex(x, y))));
    if ((y >= 13 && y <= 14) || (y >= 25 && y <= 26 + (Math.abs(x - 16) < 6 ? 1 : 0))) pc.set(x, y, RD[k]);
    if (y >= 18 && y <= 21) pc.set(x, y, ((x + y) >> 1) % 2 ? mix(0x2a2420, 0x000000, k * 0.05) : mat(0xf2c23a, { cont: 1.1 })[k]);
  });
  // lid: an ellipse with a rim, a brass cap and a red lamp
  const lid = M().ellipse(16, 12, 9, 3.2);
  ring(pc, lid, IR);
  vol(pc, lid, IR, { round: 2, spec: 0.8 });
  lid.edge().each((x, y) => { if (y > 12) pc.set(x, y, IR[5]); });
  const BR = mat(0xdcae4e, { cont: 1.2 });
  const cap = M().rect(13, 7, 6, 4).ellipse(16, 7, 3, 1.2);
  ring(pc, cap, BR);
  vol(pc, cap, BR, { mode: 'cyl', axis: 0, spec: 0.8 });
  // the lamp, lit
  for (const [x, y, c] of [[15, 5, 0xff5a3a], [16, 5, 0xff8a6a], [15, 4, 0xff3a2a], [16, 4, 0xffd0b0]]) gl(pc, x, y, c, 1);
  sparkle(pc, 16, 3, 1, 0xffe0d0, 0xff6a4a, 0.8);
  // rivets
  for (const x of [9, 13, 19, 23]) { pc.set(x, 16, IR[1]); pc.set(x, 23, IR[1]); }
  // fuse cord coiled down the side
  fuse(pc, [[24, 11], [25, 10], [26, 10], [27, 11], [27, 12]], false);
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
