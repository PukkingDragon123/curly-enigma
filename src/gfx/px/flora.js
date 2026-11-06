// 32×32 icons: harvested cave plants (carrots, mushrooms, ferns, flowers, roots...).
// Hand-pixel style on top of lifeKit / gearKit: lumpy organic silhouettes, leaves split into a
// lit and a shaded half with veins and serrations, tapered stems, crisp ink outline, a few
// flat planes per form, reflected rim light, glints, and fine 1px details (root hairs,
// sparks, spores) laid over the ink so they stay thin.
import {
  M, mat, mix, hash2, vnoise, step, ink, inkOf, seam, glint, line, gl, clamp, isTop, isBot, blob, loop, fringe, form, sheen, marks, bumps, speckle,
  blade, tube, spline, twinkle, sparkle, shadowOf, liftOf,
} from './lifeKit.js';
import { ring } from './parts.js';

// ---------------------------------------------------------------- shared shapes (also used by food.js / home.js / cooking)
/** Lens-shaped leaf mask from (x0,y0) to (x1,y1) with max half-width w; bend curves it sideways. */
export function leafMask(x0, y0, x1, y1, w, bend = 0) {
  const m = M();
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const b = Math.sin(t * Math.PI) * bend;
    const r = Math.max(0.3, Math.sin(Math.pow(t, 0.8) * Math.PI) * w);
    m.disk(x0 + dx * t + px * b, y0 + dy * t + py * b, r);
  }
  return m;
}

/**
 * A leaf from (x0, y0) to (x1, y1), half width w: two-plane shading either side of a lit
 * midrib, side veins, lit lip. o: bend, rib (color), ring (own outline, default on — callers
 * that finish with an ink pass use ring: false), serr, asym, curl, spec (ignored), veins.
 */
export function leaf(pc, x0, y0, x1, y1, w, R, o = {}) {
  const m = blade(pc, x0, y0, x1, y1, w, R, { ...o, seam: o.ring === false ? o.seam : false, rib: o.rib ?? undefined });
  if (o.ring !== false) ring(pc, m, R);
  return m;
}

/** Curvy stem through points (round tube). */
export function stem(pc, pts, r, R, o = {}) {
  const sw = tube(pc, pts, r, R, { seam: o.ring === false });
  if (o.ring !== false) ring(pc, sw.mask, R);
  return sw.mask;
}

/** Root hairs / fine fibres: 1px dark lines laid over the ink. */
function hairs(pc, list, c) {
  for (const [x0, y0, x1, y1] of list) line(pc, x0, y0, x1, y1, c);
}

/** A fern frond: curved rachis with alternating pinnae (lit / shaded halves) and a thin stalk on top. */
function frond(pc, pts, R, o = {}) {
  const at = spline(pts);
  const n = o.pairs ?? 6;
  const len0 = o.len ?? 5.5;
  for (let i = n - 1; i >= 0; i--) {
    const s = 0.14 + (i / n) * 0.8;
    const [x, y] = at(s);
    const [x2, y2] = at(Math.min(1, s + 0.02));
    const ta = Math.atan2(y2 - y, x2 - x);
    const l = len0 * (1 - s * 0.62) + 1.2;
    for (const side of [-1, 1]) {
      if (o.skip && o.skip(i, side)) continue;
      const a = ta + side * (o.spread ?? 0.95);
      const sh = side * (i % 2 ? 0.6 : -0.2);
      const bx = x + Math.cos(ta) * sh, by = y + Math.sin(ta) * sh;
      blade(pc, bx, by, bx + Math.cos(a) * l, by + Math.sin(a) * l, Math.max(0.9, l * 0.36), R, {
        bend: side * 0.7, serr: o.serr ?? 0.18, teeth: 3, rib: false, veins: 0, fold: 1.05, seam: i % 2 === 0, bias: (o.bias ?? 0) + (side < 0 ? 0.04 : -0.04), emit: o.emit,
      });
    }
  }
  // the rachis on top: a thin two-tone stalk
  return tube(pc, at, (s) => Math.max(0.5, 0.95 - s * 0.5), o.RR || R, { seam: false, bias: 0.15 });
}

/** Fiddlehead: a tight spiral curl at (cx, cy). */
function fiddle(pc, cx, cy, r, R, dir = 1) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = i * 0.55 * dir + (dir > 0 ? -1.2 : 4.3);
    const rr = r * (1 - i / 22);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return tube(pc, pts, (s) => Math.max(0.5, 1 - s * 0.5), R, { bias: 0.1 });
}

/** One mushroom: stem from (cx + lean, cy + h) up to the gill line at cy, cap radius r. */
export function mushroom(pc, cx, cy, r, h, CAP, STM, o = {}) {
  const lean = o.lean ?? 0;
  // stem with fibrous streaks
  const st = tube(pc, [[cx + lean, cy + h], [cx + lean * 0.4, cy + h * 0.5], [cx, cy + 0.5]], (s) => r * (0.27 + (1 - s) * 0.06), STM, { bias: 0.1 });
  marks(pc, st.mask, STM, { dens: 0.18, seed: o.seed ?? 3, len: 3, dir: [0, 1], lit: false });
  // gills: a shadowed underside band, glowing for glowcaps
  const sd = o.seed ?? 3, j = (k, a = 0.16) => (hash2(sd, k, 31) - 0.5) * r * a;
  const gh = Math.max(1.1, r * 0.3);
  const gills = loop([[cx - r * 0.92, cy + 0.2], [cx - r * 0.4 + j(20), cy - 0.3], [cx + r * 0.4 + j(21), cy - 0.3], [cx + r * 0.92, cy + 0.2], [cx + r * 0.5 + j(22), cy + gh + 0.4], [cx - r * 0.45 + j(23), cy + gh + 0.6]]);
  seam(pc, gills, 'shadow');
  gills.each((x, y) => {
    const a = Math.atan2(y + 0.5 - cy, x + 0.5 - cx);
    const stripe = Math.floor((x + 0.5 - cx) / Math.max(1, r * 0.22) + 100) % 2;
    if (o.glow) gl(pc, x, y, stripe ? o.glow[0] : o.glow[1], 0.9);
    else pc.set(x, y, (o.GI || CAP)[stripe ? 4 : 5]);
    void a;
  });
  // cap: a lumpy dome, flat underneath
  // cap: a hand-built dome, each one lopsided its own way, the rim drooping a little
  const T = o.tall ?? 0.78, dr = o.droop ?? 0.14, tl = o.tilt ?? (hash2(sd, 9, 3) - 0.5) * 0.4;
  const cap = loop([
    [cx - r * 1.02 + j(1), cy + r * dr + 0.4], [cx - r * 0.98 + j(2), cy - r * T * 0.32 + j(3)], [cx - r * 0.72 + j(4), cy - r * T * 0.8 + j(5)],
    [cx - r * 0.18 + tl * r + j(6), cy - r * T + j(7, 0.1)], [cx + r * 0.42 + tl * r + j(8), cy - r * T * 0.9 + j(9)], [cx + r * 0.9 + j(10), cy - r * T * 0.42 + j(11)],
    [cx + r * 1.02 + j(12), cy + r * dr * 0.8 + 0.4], [cx + r * 0.5, cy + 0.5 + j(13, 0.05)], [cx - r * 0.5, cy + 0.6 + j(14, 0.05)],
  ]);
  seam(pc, cap, 'shadow');
  const K = form(pc, cap, CAP, { cx: cx - r * 0.1, cy: cy + r * 0.15, rx: r * 1.05, ry: r * 0.9, dome: 0.35, bias: o.bias ?? 0.05, emit: o.emit });
  // rim lip: the underside edge of the cap rolls under (one tone darker), lit on the left
  cap.each((x, y) => { if (!cap.get(x, y + 1) && y >= cy - 1) pc.set(x, y, CAP[clamp(K[y * 32 + x] + (x < cx - r * 0.4 ? 0 : 1), 1, 5)]); });
  // spots: little irregular flecks with a shaded lower edge
  for (const [dx, dy, w] of o.spots || []) {
    const sx = Math.round(cx + dx * r), sy = Math.round(cy + dy * r);
    for (let i = 0; i < w; i++) if (cap.get(sx + i, sy)) { pc.set(sx + i, sy, o.spotC[0]); if (o.glow) pc.emit(sx + i, sy, 1); }
    if (cap.get(sx, sy + 1) && w > 1) pc.set(sx + (w > 2 ? 1 : 0), sy + 1, o.spotC[1]);
  }
  return { cap, stem: st.mask, gills };
}

// ---------------------------------------------------------------- the plants
function carrot(pc) {
  const R = mat(0xf2ae74, { cont: 1.12, warm: 46 });
  const LR = mat(0x62ae4a, { cont: 1.15 });
  const SR = mat(0x86b05a, { cont: 1.1 });
  // feathery greens: three stalks with serrated leaflets fanning to the top-right
  tube(pc, [[20.5, 11], [22, 7.5], [23.5, 4.5]], 0.7, SR, { seam: false });
  blade(pc, 21, 8.5, 27, 3, 2.6, LR, { bend: -1.3, serr: 0.45, teeth: 5, veins: 2, asym: 0.15 });
  blade(pc, 21.5, 10.5, 30, 10, 2.4, LR, { bend: 1.4, serr: 0.45, teeth: 5, veins: 2, asym: -0.1, bias: -0.05 });
  blade(pc, 20, 9.5, 18.6, 2.5, 2.2, LR, { bend: 1.1, serr: 0.45, teeth: 4, veins: 1, bias: 0.05 });
  // tapered, slightly crooked root
  const r = (s) => Math.max(0.45, 4.9 * Math.pow(1 - s, 0.72) * (1 + 0.06 * Math.sin(s * 21)));
  const sw = tube(pc, [[20.8, 12], [16.6, 16.6], [12, 21.5], [7.6, 25.8], [4.2, 29.2]], r, R, { capStart: 0.6, bias: 0.12 });
  const m = sw.mask;
  // growth creases: short grooves part-way across the root, each with a lit lip below
  for (const [s, v0, v1] of [[0.14, -0.9, 0.2], [0.26, -0.2, 0.9], [0.37, -0.9, 0.1], [0.5, -0.3, 0.8], [0.62, -0.8, 0.2], [0.74, -0.2, 0.7]]) {
    const [x, y] = sw.at(s), [x2, y2] = sw.at(s + 0.02);
    const tx = x2 - x, ty = y2 - y, tl = Math.hypot(tx, ty) || 1;
    const nx = ty / tl, ny = -tx / tl, w = r(s);
    line(pc, x + nx * w * v0, y + ny * w * v0, x + nx * w * v1, y + ny * w * v1, (i, X, Y) => (m.get(X, Y) ? (step(pc, R, X, Y, 1, 1, 5), null) : null));
    line(pc, x + nx * w * v0 + tx / tl, y + ny * w * v0 + ty / tl, x + nx * w * v1 + tx / tl, y + ny * w * v1 + ty / tl, (i, X, Y) => (m.get(X, Y) && i > 0 ? (step(pc, R, X, Y, -1, 1, 5), null) : null));
  }
  // green-tinged shoulder where the leaves sprout
  for (const [x, y, k] of [[19, 10, 2], [20, 10, 3], [21, 10, 3], [22, 11, 4], [18, 11, 3]]) if (m.get(x, y)) pc.set(x, y, SR[k]);
  ink(pc);
  hairs(pc, [[11, 23, 9, 22], [8, 26, 7, 28], [15, 19, 17, 20], [5, 29, 3, 30]], inkOf(R[4]));
  pc.set(15, 14, R[0]); pc.set(16, 14, R[1]); pc.set(14, 15, R[1]);
}

function pepperroot(pc) {
  const R = mat(0xd8341e, { cont: 1.22, warm: 32 });
  const G = mat(0x5a9a3a, { cont: 1.15 });
  // curled stem
  tube(pc, [[21, 9.5], [23, 6], [26, 4], [28.5, 4.6]], (s) => 1.25 - s * 0.35, G, { capEnd: 0.1 });
  // the pod: plump at the shoulder, wrinkling into a hooked tip
  const r = (s) => Math.max(0.5, 4.7 * Math.pow(1 - s, 0.55) * (1 + 0.05 * Math.sin(s * 17 + 1)));
  const sw = tube(pc, [[20.5, 11.5], [17.6, 16], [13.5, 20.6], [9, 24.2], [5.4, 25.4], [3.6, 23.6]], r, R, { capStart: 0.7, bias: 0.12 });
  // glossy streak along the lit side, broken in two
  sw.mask.each((x, y) => {
    const i = y * 32 + x, s = sw.S[i], v = sw.V[i] / Math.max(0.6, sw.Wd[i]);
    if (s > 0.06 && s < 0.66 && v < -0.25 && v > -0.62 && !(s > 0.3 && s < 0.36)) pc.set(x, y, s < 0.3 ? R[0] : R[1]);
  });
  marks(pc, sw.mask, R, { dens: 0.1, seed: 4, len: 2, dir: [1, 1], only: (x, y) => sw.S[y * 32 + x] > 0.45 });
  // calyx: star of sepals hugging the shoulder
  for (const [x1, y1, b] of [[16.5, 10.5, 0.6], [24.5, 13.5, -0.5], [19.5, 14.6, 0.3], [22.6, 9, 0]]) blade(pc, 21, 10.8, x1, y1, 1.5, G, { bend: b, veins: 0, rib: false, fold: 1 });
  const cap = blob(21.2, 10.4, 2.4, 1.8, { seed: 2 });
  seam(pc, cap, 'shadow');
  form(pc, cap, G, { bias: 0.1 });
  ink(pc);
  glint(pc, 18, 14, 0);
  for (const [x, y] of [[4, 28], [7, 29]]) gl(pc, x, y, 0xffb04a, 0.6);
}

function glowcap(pc) {
  const CAP = mat(0x3a9cf0, { cont: 1.1 });
  const STM = mat(0xe4dccb, { cont: 1.05 });
  const GLOW = [0xc6f4ff, 0x6ad6ff];
  const SPOT = [0xe6fbff, 0x8ad8f8];
  // the tall one at the back, a mid one, and a little one in front
  mushroom(pc, 11.5, 11, 7.6, 17, CAP, STM, { lean: -1.2, seed: 3, glow: GLOW, emit: 0.85, spots: [[-0.5, -0.45, 2], [0.15, -0.62, 3], [0.5, -0.25, 1], [-0.1, -0.2, 1]], spotC: SPOT });
  mushroom(pc, 22.5, 15.5, 5, 11, CAP, STM, { lean: 1.2, seed: 7, glow: GLOW, emit: 0.85, spots: [[-0.35, -0.5, 2], [0.35, -0.4, 1]], spotC: SPOT });
  // mossy clump they grow from
  const MO = mat(0x3f7a3a, { cont: 1.1 });
  const moss = fringe(blob(15.5, 28, 12.5, 3.4, { seed: 5, lump: 0.12 }), 15.5, 30, { dens: 0.55, seed: 6, len: 2, only: (x, y) => y < 28 });
  seam(pc, moss, 'shadow');
  form(pc, moss, MO, { cy: 29.5, ry: 4, bias: 0.12 });
  bumps(pc, moss, MO, { dens: 0.18, seed: 4 });
  mushroom(pc, 27, 24, 2.9, 4, CAP, STM, { seed: 11, glow: GLOW, emit: 0.85, spots: [[-0.3, -0.5, 1]], spotC: SPOT, lump: 0.02 });
  ink(pc);
  for (const [x, y] of [[4, 5], [26, 4], [29, 15]]) twinkle(pc, x, y, 0xe8fbff, 0x7fd8ff, 1, 0.9);
  for (const [x, y] of [[8, 5], [18, 10]]) gl(pc, x, y, 0xffffff, 1);
}

/** One small fern pinna: a lens with a lit top edge, a body tone and a shaded lower edge. */
function pinna(pc, x0, y0, x1, y1, w, R, k, emit) {
  const m = leafMask(x0, y0, x1, y1, w, 0.35);
  seam(pc, m, 'shadow');
  m.each((x, y) => {
    let kk = k;
    if (isTopPx(m, x, y)) kk--;
    else if (!m.get(x + 1, y) || !m.get(x, y + 1)) kk++;
    pc.set(x, y, R[clamp(kk, 1, 5)]);
    if (emit) pc.emit(x, y, emit);
  });
  return m;
}
const isTopPx = (m, x, y) => (!m.get(x - 1, y) || !m.get(x, y - 1)) && m.get(x + 1, y) && m.get(x, y + 1);

/** A fern frond along a spline: pinnae in pairs from the tip down (lower ones overlap), stalk on top. */
function fernFrond(pc, pts, R, o = {}) {
  const at = spline(pts);
  const n = o.pairs ?? 7;
  for (let i = n - 1; i >= 0; i--) {
    const s = 0.1 + (i / n) * 0.84;
    const [x, y] = at(s), [x2, y2] = at(Math.min(1, s + 0.03));
    const ta = Math.atan2(y2 - y, x2 - x);
    const l = (o.len ?? 5.5) * (1 - s * 0.6) + 1;
    for (const side of [1, -1]) {
      const a = ta + side * 0.92;
      const lit = Math.cos(a) * -0.6 + Math.sin(a) * -0.8 > 0;
      pinna(pc, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, Math.max(0.9, l * 0.27), R, (lit ? 2 : 3) + (i % 2 && !lit ? 1 : 0), o.emit);
    }
  }
  let last = '';
  for (let i = 0; i <= 90; i++) { const [x, y] = at(i / 90 * 0.97); const key = Math.floor(x) + ',' + Math.floor(y); if (key === last) continue; last = key; pc.set(x, y, (o.RR || R)[i < 40 ? 3 : 2]); }
}

function fernPlant(pc, R, o = {}) {
  // a crumb of soil, two arching fronds and a young curled one
  const SO = mat(0x5a3e2a, { cont: 1.05 });
  fernFrond(pc, [[12, 29], [9, 23.5], [5.8, 18.5], [3.8, 12.5]], R, { pairs: 5, len: 4.6, emit: o.emit, RR: o.RR });
  fernFrond(pc, [[13, 29], [12.6, 21], [15, 12.5], [20, 6], [26, 3.4]], R, { pairs: 8, len: 6, emit: o.emit, RR: o.RR });
  tube(pc, [[15, 29], [19, 25.5], [22.4, 23.6]], 0.85, o.RR || R, { bias: 0.1 });
  fiddle(pc, 23.4, 20.6, 3, o.RR || R, -1);
  const soil = blob(14, 29.5, 6.5, 2.2, { seed: 3, lump: 0.15 });
  seam(pc, soil, 'shadow');
  form(pc, soil, SO, { bias: 0.1 });
  bumps(pc, soil, SO, { dens: 0.3, seed: 5 });
}

function blindfern(pc) {
  const R = mat(0xb8cca4, { cont: 1.1, sat: 0.9, cool: 220 });
  fernPlant(pc, R, { RR: mat(0x98ae86, { cont: 1.1 }) });
  ink(pc);
  glint(pc, 19, 7, 0);
}

function ashfern(pc) {
  // a fire-scorched fern: two pale ash fronds arching over and drooping under the heat, the
  // outer leaflets burnt to charcoal with a glowing rim, a young curl, a mound of grey ash
  const R = mat(0xbab6a6, { cont: 1.1, sat: 0.6 });
  const CH = mat(0x4e4844, { cont: 1.05 });
  const STK = 0x4a4440;
  const burnt = [];
  const fr = (pts, n, len, char) => {
    const at = spline(pts);
    for (let i = n - 1; i >= 0; i--) {
      const s = 0.16 + (i / n) * 0.8, [x, y] = at(s), [x2, y2] = at(Math.min(1, s + 0.03));
      const ta = Math.atan2(y2 - y, x2 - x), l = len * (1 - s * 0.55) + 1;
      for (const side of [-1, 1]) {
        const a = ta + side * 1.0, ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
        const m = leafMask(x, y, ex, ey, Math.max(1, l * 0.3), 0.4 * side);
        const up = Math.sin(a) < 0.15;
        const C = s > char ? CH : R;
        seam(pc, m, 'shadow');
        m.each((X, Y) => { const t = isTop(m, X, Y) && !isBot(m, X, Y), b = isBot(m, X, Y) && !isTop(m, X, Y); pc.set(X, Y, C[t ? 1 : b ? 4 : up ? 2 : 3]); });
        if (s > char) burnt.push([ex, ey]);
      }
    }
    let last = '';
    for (let i = 0; i <= 80; i++) { const [x, y] = at(i / 80 * 0.98), k = Math.floor(x) + ',' + Math.floor(y); if (k === last) continue; last = k; pc.set(x, y, STK); }
  };
  fr([[13, 27], [10.4, 19.6], [6, 14], [2.6, 15.6]], 4, 4.6, 0.7);
  fr([[15, 27], [16, 18.6], [20, 10.6], [25.4, 7.4], [29.4, 10.4]], 6, 5.6, 0.74);
  const SM = mat(0x8a847a, { cont: 1.1 });
  tube(pc, [[16.4, 27], [20.4, 24.6], [23, 22.4]], 0.8, SM, { bias: 0.1 });
  const cu = []; for (let i = 0; i <= 14; i++) { const a = -1.2 - i * 0.5, r = 2.8 * (1 - i / 20); cu.push([23.4 + Math.cos(a) * r, 19.6 + Math.sin(a) * r]); }
  tube(pc, cu, (s) => Math.max(0.5, 1 - s * 0.5), SM, { bias: 0.1 });
  const ASH = mat(0x9a948e, { cont: 1.05 });
  const mound = loop([[5.6, 29.6], [8, 26.8], [12, 25.6], [17, 25.2], [21.4, 26], [24.4, 27.8], [25.4, 30.2], [15.6, 30.8]]);
  seam(pc, mound, 'shadow');
  form(pc, mound, ASH, { bias: 0.1 });
  for (const [x, y] of [[10, 28], [17, 27], [21, 28]]) { pc.set(x, y, ASH[1]); pc.set(x + 1, y + 1, ASH[4]); }
  ink(pc);
  // the burnt leaflet tips glow along their ragged ends; an ember in the ash, one drifting up
  for (const [x, y] of burnt) { const X = Math.floor(x), Y = Math.floor(y); for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) if (CH.indexOf(pc.get(X + dx, Y + dy)) >= 0) { gl(pc, X + dx, Y + dy, (X + Y) % 2 ? 0xff8a2a : 0xffb050, 1); break; } }
  gl(pc, 14, 28, 0xff6a2a, 0.9); gl(pc, 15, 28, 0xffa040, 0.9);
  gl(pc, 26, 3, 0xffb050, 0.9);
  pc.set(6, 8, 0xb0a8a0, 150);
}

function whisperweed(pc) {
  const R = mat(0xa684cc, { cont: 1.15 });
  const D = mat(0x7a5aa6, { cont: 1.1 });
  // long curling blades rising from a clump, the far ones darker
  for (const [x0, y0, x1, y1, w, b, c, RR] of [
    [14, 27, 9, 4, 1.9, 2, 3, D], [18, 27, 26, 5, 1.9, -1.5, -3, D],
    [12, 27, 3, 12, 1.8, 1.5, 3.5, R], [16, 27, 15, 2, 2.1, 1.5, -3, R], [19, 27, 29, 14, 1.9, -1.8, 3, R], [15, 27, 20, 11, 1.6, 0.5, 2, R],
  ]) blade(pc, x0, y0, x1, y1, w, RR, { bend: b, curl: c, veins: 0, fold: 1.1, pow: 0.55 });
  // the soil clump
  const SO = mat(0x6b4a32, { cont: 1.05 });
  const soil = blob(16, 28.4, 7.5, 2.6, { seed: 8, lump: 0.14 });
  seam(pc, soil, 'shadow');
  form(pc, soil, SO, { bias: 0.08 });
  bumps(pc, soil, SO, { dens: 0.3, seed: 2 });
  ink(pc);
  // whispering, glowing tips
  for (const [x, y] of [[9, 5], [26, 6], [3, 11], [15, 3], [29, 13]]) { gl(pc, x, y, 0xf4e8ff, 1); }
  for (const [x, y] of [[6, 2], [22, 1], [30, 9]]) twinkle(pc, x, y, 0xf4e8ff, 0xc8a8f0, 1, 0.8);
}

function rubberSap(pc) {
  const VR = mat(0x4f7c3a, { cont: 1.15 });
  const LR = mat(0x5aa84a, { cont: 1.15 });
  const SR = mat(0xf0e0b0, { cont: 1.18 });
  // a tapped vine running across the top: nodes, bark grooves, two leaves
  blade(pc, 25, 5.5, 30.5, 13, 2.4, LR, { bend: -1, veins: 2 });
  blade(pc, 5, 7, 2, 14, 2, LR, { bend: 1, veins: 1 });
  const vine = tube(pc, [[0.5, 9.4], [9, 7.8], [18, 7.4], [27, 5.6], [31.5, 5.2]], 2.2, VR, { bias: 0.08 });
  marks(pc, vine.mask, VR, { dens: 0.2, seed: 3, len: 3, dir: [1, 0] });
  for (const x of [7, 23]) { const y = Math.round(vine.at(x / 32)[1]) + 1; pc.set(x, y - 1, VR[1]); pc.set(x, y, VR[2]); pc.set(x + 1, y + 1, VR[5]); pc.set(x, y + 1, VR[4]); }
  // the cut notch weeping a stretchy strand into a glossy pool
  const strand = tube(pc, [[15.5, 9], [16.4, 13], [15, 17], [15.6, 21]], (s) => 1.5 - Math.sin(s * Math.PI) * 0.8, SR, { bias: 0.1 });
  void strand;
  const glob = loop([[6.6, 26.4], [8.6, 23.4], [11, 21], [14.4, 19.6], [17, 20.6], [19.4, 22.6], [23.4, 23.2], [26, 25.2], [25.4, 28], [20, 29.4], [12, 29.6], [7.6, 28.6]]);
  seam(pc, glob, 'shadow');
  form(pc, glob, SR, { bias: 0.12, cy: 26.5, ry: 6 });
  sheen(pc, glob, SR[0], { inset: 1, a0: -2.9, a1: -1.4, gap: 5 });
  // drips on the vine and a fresh bead forming
  pc.set(14, 9, SR[1]); pc.set(15, 9, SR[2]); pc.set(16, 9, SR[1]); pc.set(17, 9, SR[3]);
  const bd = blob(22.5, 11.5, 1.5, 1.8, { seed: 1, lump: 0 });
  seam(pc, bd, 'shadow');
  form(pc, bd, SR, { bias: 0.1 });
  ink(pc);
  glint(pc, 10, 23, 0); pc.set(11, 23, SR[0]);
  pc.set(22, 11, 0xffffff);
}

function sparkmoss(pc) {
  const RK = mat(0x6e6864, { cont: 1.1 });
  const R = mat(0x3a8ad8, { cont: 1.15 });
  // a weathered pebble
  const rock = blob(16, 25.5, 13.4, 5.2, { seed: 9, lump: 0.1, flat: 0.75 });
  form(pc, rock, RK, { dome: 0.2, flatten: 0.8, bias: 0.04 });
  marks(pc, rock, RK, { dens: 0.08, seed: 2, len: 3, dir: [1, 0] });
  // moss cushion built from little round tufts, back to front, each with its own fuzz
  const tufts = [[8.5, 17, 2.8], [13.5, 15, 3], [19, 14.6, 3], [24, 17, 2.7], [5, 20.4, 2.4], [11, 19.4, 3], [16.5, 18.5, 3.2], [22, 20.4, 3], [27, 21, 2.2], [8, 23, 2.5], [14, 22.6, 2.8], [19.6, 23.4, 2.4]];
  tufts.forEach(([x, y, r], i) => {
    const t = fringe(blob(x, y, r, r * 0.85, { seed: i + 3, lump: 0.12 }), x, y + r, { dens: 0.6, seed: i + 9, len: 1.4, only: (X, Y) => Y < y });
    seam(pc, t, 'shadow');
    form(pc, t, R, { cy: y + r * 0.4, ry: r * 1.2, bias: 0.04, lo: 2, dome: 0.6, lip: false });
    bumps(pc, t, R, { dens: 0.45, seed: i + 1 });
  });
  ink(pc);
  // spore stalks with glowing capsules, and static sparks crackling off the tips
  for (const [x, y, h] of [[10, 13, 4], [17, 11, 5], [23, 13, 3], [6, 17, 3]]) {
    line(pc, x, y, x + (x % 3 ? 1 : 0), y - h, (n) => (n ? 0x2a4a8a : null));
    gl(pc, x + (x % 3 ? 1 : 0), y - h, 0xbff4ff, 1);
  }
  const bolt = (pts, c = 0xfff27a) => { for (let i = 0; i + 1 < pts.length; i++) line(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], (n, X, Y) => (gl(pc, X, Y, n === 0 ? 0xffffff : c, 1), null)); };
  bolt([[11, 8], [13, 5], [11, 3], [13, 0]]);
  bolt([[21, 8], [19, 5], [22, 3]]);
  bolt([[27, 14], [29, 11], [28, 9]], 0xbff0ff);
  for (const [x, y] of [[4, 11], [29, 4], [16, 3]]) twinkle(pc, x, y, 0xffffff, 0xfff27a, 1, 1);
}

function bubblebulb(pc) {
  const LR = mat(0x5a9a4a, { cont: 1.15 });
  const R = mat(0xc4a0f4, { cont: 1.18 });
  blade(pc, 16, 28, 4.5, 23, 2.6, LR, { bend: 1.6, veins: 2 });
  blade(pc, 16, 28, 27.5, 22.5, 2.5, LR, { bend: -1.6, veins: 2, bias: -0.05 });
  tube(pc, [[16, 29.5], [16.4, 25], [16, 21.5]], 1.3, mat(0x4a8a3a, { cont: 1.1 }));
  // the bulb: a plump onion with a pointed tip and soft segment ribs
  const bulb = loop([[16.4, 1.6], [17.4, 4.4], [20.6, 7], [24, 10.6], [25.4, 15], [24.4, 19.4], [21, 22.4], [17.4, 23.6], [13, 22.8], [9, 20.2], [6.8, 15.6], [7.8, 10.8], [11.4, 7.2], [14.8, 4.6]]);
  bulb.union(loop([[13.6, 21.6], [18.6, 21.4], [16.4, 24.8]]));
  seam(pc, bulb, 'shadow');
  const K = form(pc, bulb, R, { cy: 14, ry: 10, bias: 0.08 });
  for (const s of [-1, 1]) for (let y = 4; y < 22; y++) {
    const t = (y - 4) / 18, x = Math.round(16 + s * Math.sin(t * Math.PI) * 4.8);
    if (bulb.get(x, y) && bulb.get(x, y + 1)) pc.set(x, y, R[clamp(K[y * 32 + x] + 1, 1, 5)]);
  }
  // bubbles floating inside: lit rim on top-left, shade on bottom-right, a glint
  for (const [x, y, r] of [[12.5, 16.5, 2.2], [19.5, 12, 1.7], [18.5, 18, 1.3], [12.5, 10.5, 1.1]]) {
    const b = blob(x, y, r, r * 0.9, { seed: (x * 7) | 0, lump: 0.22 });
    b.edge().each((X, Y) => { if (bulb.get(X, Y)) pc.set(X, Y, (X + 0.5 - x) + (Y + 0.5 - y) < 0 ? R[1] : R[4]); });
    pc.set(Math.floor(x - r * 0.4), Math.floor(y - r * 0.4), 0xffffff);
  }
  sheen(pc, bulb, R[0], { inset: 1, a0: -2.6, a1: -1.9 });
  ink(pc);
  glint(pc, 11, 8, 0);
}

function crystalLily(pc) {
  const LR = mat(0x5aa098, { cont: 1.12 });
  const R = mat(0xbfe8ff, { cont: 1.3, hs: 0.7 });
  tube(pc, [[17, 31], [16.5, 25], [15.5, 18]], 1.05, LR);
  blade(pc, 16.5, 27, 27, 21, 2.4, LR, { bend: -1.3, veins: 2 });
  blade(pc, 16.5, 29, 6, 26.5, 2, LR, { bend: 1, veins: 1, bias: -0.05 });
  // trumpet of glassy, faceted petals opening upward (back ones first)
  const petals = [[3.5, 6, 3, 1.4, -0.06], [27.5, 5, 3, -1.4, -0.06], [16, 1.5, 3.3, 0.3, 0], [7.5, 12.5, 2.8, 0.6, 0.04], [24, 12, 2.8, -0.7, 0.04]];
  for (const [x1, y1, w, b, bias] of petals) {
    const m = blade(pc, 15.5, 17, x1, y1, w, R, { bend: b, fold: 1.5, rib: R[0], veins: 0, bias, pow: 1.1 });
    m.edge().each((x, y) => { if (hash2(x, y, 2) < 0.3 && !m.get(x - 1, y - 1)) pc.set(x, y, 0xffffff); });
  }
  ink(pc);
  // glowing stamens and sparkle
  for (const [x, y] of [[14, 10], [16, 9], [18, 11]]) { gl(pc, x, y, 0xfff2b0, 0.9); pc.set(x, y + 1, 0xe0c070); }
  twinkle(pc, 25, 18, 0xffffff, 0xd8f4ff, 1, 0.6);
  glint(pc, 12, 7, 0);
}

function gloomshroom(pc) {
  const ST = mat(0xa496b2, { cont: 1.05 });
  const CP = mat(0x5e3480, { cont: 1.15 });
  // stem with a ragged ring skirt
  const st = tube(pc, [[17.6, 28.5], [15.2, 23], [15.4, 18.5], [16.6, 14]], (s) => 2.6 - s * 1.1 + Math.max(0, 0.25 - s) * 3, ST, { bias: 0.1 });
  marks(pc, st.mask, ST, { dens: 0.2, seed: 5, len: 3, dir: [0, 1], lit: false });
  const foot = blob(17.4, 29, 4.4, 2, { seed: 2, lump: 0.12 });
  seam(pc, foot, 'shadow'); form(pc, foot, ST, { bias: 0.08 });
  // a torn, drooping ring hanging off the stem
  const sk = blob(15.8, 18.6, 3.6, 1.2, { seed: 4, lump: 0.1 }).union(M().poly([[12.6, 18.6], [19, 18.6], [18.4, 21.4], [17, 20.2], [15.6, 21.8], [14.2, 20.4], [12.8, 21]]));
  seam(pc, sk, 'shadow'); form(pc, sk, ST, { bias: 0.12, cy: 18, ry: 4 });
  // underside gills in deep shadow
  const gills = loop([[5.4, 14.4], [15.4, 13.2], [26.2, 14.4], [22, 16.8], [15.6, 17.2], [9, 16.6]]);
  seam(pc, gills, 'shadow');
  gills.each((x, y) => pc.set(x, y, CP[(x % 2) ? 5 : 6]));
  // drooping bell cap with scalloped, hanging edge
  const cap = loop([[3.6, 13.4], [4.4, 9.4], [7.6, 5.4], [12, 3.2], [16.6, 2.8], [21.6, 4.2], [25.4, 7], [27.6, 10.4], [28, 13.6], [16, 14.6]]);
  for (const [x, y, r] of [[5, 13.5, 2.2], [9.5, 14.4, 2], [14.5, 14.8, 2], [19.5, 14.6, 2], [24.6, 13.6, 2.3], [27, 11.5, 1.6]]) cap.union(blob(x, y, r, r * 0.9, { seed: x | 0, lump: 0.1 }));
  seam(pc, cap, 'shadow');
  form(pc, cap, CP, { cx: 14, cy: 14, rx: 13, ry: 11, dome: 0.35, bias: 0.05 });
  // pale, irregular spots with shade under each
  for (const [x, y, w] of [[9, 7, 2], [15, 4, 3], [21, 8, 2], [12, 10, 1], [24, 11, 1], [18, 11, 2], [6, 11, 1]]) {
    for (let i = 0; i < w; i++) pc.set(x + i, y, i ? 0xc8a6e6 : 0xe6d0fa);
    if (w > 1) pc.set(x + 1, y + 1, 0x9a72c0);
  }
  ink(pc);
  glint(pc, 11, 5, 0);
  // drowsy spores drifting up
  for (const [x, y, c] of [[4, 4, 0xc8a8e8], [7, 1, 0xb090d8], [26, 2, 0xc8a8e8], [29, 6, 0xa080c8], [22, 0, 0xb090d8]]) gl(pc, x, y, c, 0.5);
}

function emberbloom(pc) {
  const LR = mat(0x506030, { cont: 1.15 });
  const R = mat(0xe24a1e, { cont: 1.2, warm: 36 });
  tube(pc, [[16, 31], [15, 26], [16, 20]], 1.1, LR);
  blade(pc, 15.5, 27.5, 5.5, 23, 2.2, LR, { bend: 1.3, veins: 2, serr: 0.2 });
  blade(pc, 16, 25.5, 25.5, 22.5, 1.8, LR, { bend: -1, veins: 1, bias: -0.05 });
  // a cup of fleshy petals, back row first
  for (const [a, l, w, bias] of [[-2.25, 10, 3.2, -0.1], [-0.9, 10, 3.2, -0.1], [-1.57, 11, 3.2, -0.08], [-2.85, 8.5, 2.8, 0.05], [-0.3, 8.5, 2.8, 0.05], [-2.05, 7.5, 3, 0.08], [-1.1, 7.5, 3, 0.08]]) {
    blade(pc, 16, 20, 16 + Math.cos(a) * l, 20 + Math.sin(a) * l, w, R, { veins: 1, fold: 1, bias, pow: 1, emit: 0.3, tex: (x, y, t) => t * 0.12 });
  }
  ink(pc);
  // flames licking up from the heart (over the ink: pure light)
  const fl = M().poly([[11.5, 15], [13, 7], [14.6, 11], [16.6, 2.5], [18.4, 10], [20.5, 5.5], [21, 15], [16, 17.5]]);
  fl.each((x, y) => { const t = (y - 2) / 15, w = vnoise(x * 0.7, y * 0.5, 3); gl(pc, x, y, t < 0.35 ? 0xfff4b0 : t < 0.65 ? (w > 0.5 ? 0xffd050 : 0xffb030) : 0xff7a20, 1); });
  fl.edge().each((x, y) => { if (!fl.get(x, y - 1)) gl(pc, x, y, 0xffe890, 1); });
  for (const [x, y, c] of [[8, 5, 0xffb04a], [24, 3, 0xffd070], [21, 0, 0xffa040], [10, 1, 0xff8a30]]) gl(pc, x, y, c, 0.9);
}

function truffle(pc) {
  const R = mat(0x3c2a22, { cont: 0.8 });
  // a knobbly black truffle: lumpy body + a smaller lobe, covered in little pyramidal warts
  const body = blob(13, 16.5, 10.6, 9.4, { seed: 7, lump: 0.17, freq: [3, 4, 7, 9] }).union(blob(8, 11.5, 5.2, 4.6, { seed: 3, lump: 0.15 }));
  form(pc, body, R, { cx: 11, cy: 15, rx: 12, ry: 11, bias: -0.1, lo: 2, tex: (x, y) => (vnoise(x * 0.8, y * 0.8, 3) - 0.5) * 0.3 });
  body.clone().erode(1).each((x, y) => {
    if ((x + y * 3) % 4 !== 0 || hash2(x, y, 5) < 0.25) return;
    step(pc, R, x, y, -1, 1, 5);
    if (body.get(x + 1, y + 1)) step(pc, R, x + 1, y + 1, 1, 1, 5);
  });
  // a cut slice leaning on it: dark skin around a chocolate heart veined with white
  const sl = loop([[20.4, 16.8], [23.4, 15], [27, 15.8], [29.2, 19.4], [29, 24.4], [26.4, 27.8], [22.6, 28], [19.4, 25.4], [18.6, 20.6]]);
  seam(pc, sl, 'shadow');
  const SL = mat(0x5c3a26, { cont: 1.1 });
  sl.each((x, y) => {
    const f = (vnoise(x * 0.42, y * 0.42, 9) * 4.2 + x * 0.05) % 1;
    pc.set(x, y, f < 0.13 ? 0xf0e4d0 : f < 0.24 ? 0xa88a6c : SL[x + y < 44 ? 3 : 4]);
  });
  sl.edge().each((x, y) => pc.set(x, y, R[(x + y) % 3 ? 4 : 3]));
  ink(pc);
  glint(pc, 7, 10, 0); pc.set(13, 9, R[1]); pc.set(5, 17, R[1]);
  for (const [x, y] of [[3, 28], [5, 29], [19, 30]]) pc.set(x, y, 0x5a3e2a);
}

function frostbloom(pc) {
  const LR = mat(0x6fa0b4, { cont: 1.12 });
  const R = mat(0xb8eeff, { cont: 1.3, hs: 0.6 });
  tube(pc, [[16, 31], [16.6, 26], [16, 21]], 1.1, LR);
  blade(pc, 16.5, 28, 26.5, 24.5, 2.2, LR, { bend: -1.2, veins: 2, serr: 0.2 });
  // six icy, faceted petals – each a little different in length and angle
  const P = [[-1.62, 12.5], [-0.55, 11], [0.5, 10.5], [1.6, 9.5], [2.62, 10.5], [3.66, 11.5]];
  for (const [a, l] of P) blade(pc, 16, 13.5, 16 + Math.cos(a) * l, 13.5 + Math.sin(a) * l, 2.7, R, { fold: 1.6, rib: 0xffffff, veins: 0, pow: 1.15, bias: 0.02 });
  const c = blob(16, 13.5, 2.6, 2.4, { seed: 2 });
  seam(pc, c, 'shadow');
  form(pc, c, mat(0xe0faff, { cont: 0.9 }), { emit: 0.7 });
  ink(pc);
  gl(pc, 15, 12, 0xffffff);
  for (const [x, y] of [[4, 5], [28, 27], [27, 3]]) twinkle(pc, x, y, 0xffffff, 0xbff6ff, 1, 0.7);
}

function coreLotus(pc) {
  // lily pad with a notch, radial veins, floating on a ring of ripples
  const PD = mat(0x3a8a5a, { cont: 1.12 });
  const pad = loop([[1.6, 26.4], [3.4, 23.4], [8, 21.8], [14, 21.4], [21, 21.6], [26.4, 22.6], [30, 24.8], [29.6, 27], [16.4, 26.4, 1], [24.4, 30], [17, 30.8], [9, 30.4], [3.6, 28.8]]);
  form(pc, pad, PD, { flatten: 0.6, dome: 0.3, bias: 0.06 });
  for (let i = 0; i < 6; i++) line(pc, 16, 26, 16 + Math.cos(i * 1.05 + 2.3) * 13, 26 + Math.sin(i * 1.05 + 2.3) * 4.2, (n, X, Y) => (n > 1 && pad.get(X, Y) ? PD[2] : null));
  const R = mat(0xff8ac4, { cont: 1.2 });
  const back = mat(0xd85a96, { cont: 1.15 });
  // petals: back row, side row, front row
  for (const [a, l, w, RR, bias] of [[-2.2, 13, 3.6, back, 0], [-0.94, 13, 3.6, back, 0], [-1.57, 14, 3.8, back, 0.04], [-2.8, 11, 3.2, R, 0], [-0.34, 11, 3.2, R, 0], [-2.05, 9.5, 3.4, R, 0.06], [-1.09, 9.5, 3.4, R, 0.06]]) {
    blade(pc, 16, 21.5, 16 + Math.cos(a) * l, 21.5 + Math.sin(a) * l, w, RR, { veins: 1, fold: 1, pow: 1.15, bias, tex: (x, y, t) => t * 0.16 });
  }
  // glowing golden seed head
  const h = blob(16, 18.4, 3.6, 2.6, { seed: 2 });
  seam(pc, h, 'shadow');
  form(pc, h, mat(0xffd03a, { cont: 1.1 }), { emit: 1, bias: 0.1 });
  for (const [x, y] of [[14, 18], [16, 17], [18, 18], [15, 19], [17, 19]]) gl(pc, x, y, 0xb8801a, 1);
  ink(pc);
  gl(pc, 14, 17, 0xfffbe0);
  for (const [x, y] of [[5, 6], [26, 5], [16, 2]]) twinkle(pc, x, y, 0xffffff, 0xffc8e8, 1, 0.8);
}

// ---------------------------------------------------------------- dispatcher
const PLANTS = {
  carrot, glowcap, fern: blindfern, whisper: whisperweed, sap: rubberSap, pepper: pepperroot,
  sparkmoss, bubble: bubblebulb, lily: crystalLily, gloom: gloomshroom, ashfern, ember: emberbloom, truffle,
  frost: frostbloom, lotus: coreLotus,
};

export function drawFlora(pc, spec) {
  if (spec.k !== 'plant') return false;
  const f = PLANTS[spec.t];
  if (!f) return false;
  f(pc);
  return true;
}

export { mix, liftOf, shadowOf, sparkle };
