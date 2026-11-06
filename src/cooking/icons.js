// 32×32 item icons for the new cave ingredients and Old Star's dishes (spec { k: 'cook', t, c }).
// Hand-pixel style on top of lifeKit / gearKit, like food.js: every piece gets its own hand-built
// outline (lifeKit.loop control points, no stamped circles or shared silhouettes), a few flat
// planes lit from the top-left, seams where parts overlap, a hue-tinted ink outline, rim light,
// glints, steam, and thin details (stalks, root hairs, legs) laid over the ink so they stay
// 1px. gfx/PixelArt.js calls drawCookIcon.
import {
  M, mat, mix, hash2, vnoise, step, ink, seam, glint, line, gl, clamp, isTop, isBot, blob, loop, fringe, form, sheen, marks, bumps,
  speckle, blade, tube, spline, steam, twinkle, RAMPS, shadowOf,
} from '../gfx/px/lifeKit.js';

/** Icon spec for recipes.js / items: t = drawing, c = the dish's tint (liquids in the 3D kitchen). */
export function cookIcon(t, c) { return c === undefined ? { k: 'cook', t } : { k: 'cook', t, c }; }

// ---------------------------------------------------------------- small helpers
/** A 1px stroke along a spline (stalks, threads, root hairs), skipping pixels inside `skip`. */
function strand(pc, pts, c, o = {}) {
  const at = spline(pts);
  let last = '';
  for (let i = 0; i <= 60; i++) {
    const [x, y] = at(i / 60), X = Math.floor(x), Y = Math.floor(y), k = X + ',' + Y;
    if (k === last) continue;
    last = k;
    if (o.skip && o.skip.get(X, Y)) continue;
    pc.set(X, Y, typeof c === 'function' ? c(i / 60, X, Y) : c);
    if (o.emit) pc.emit(X, Y, o.emit);
  }
}

/** Paint a mask in two flat tones split by its top-left / bottom-right edges (small hard parts). */
function chip(pc, m, R, k = 2) {
  m.each((x, y) => { const t = isTop(m, x, y), b = isBot(m, x, y); pc.set(x, y, R[t && !b ? k - 1 : b && !t ? k + 1 : k]); });
}

/**
 * A hand-built vessel in 3/4 view from two outlines: `outer` (the whole silhouette, back rim to
 * foot) and `mouth` (the opening). Body shaded as a belly lit from the top-left, a lit lip all
 * round, a shadowed inner back wall. o: extra (mask added to the body: handles, feet), bias,
 * band [color, y-fraction] glaze stripe, drip (glaze drip color + level), wall (inner wall rows).
 * Returns the contents surface mask (.mouth, .outer, .body).
 */
function vessel(pc, R, outer, mouth, o = {}) {
  const om = loop(outer), mm = loop(mouth);
  if (o.extra) om.union(o.extra);
  const lip = mm.clone().dilate(1, true).and(om).sub(mm);
  const body = om.clone().sub(mm).sub(lip);
  const b = om.bounds(), mb = mm.bounds();
  const mcx = (mb.x0 + mb.x1 + 1) / 2, mcy = (mb.y0 + mb.y1 + 1) / 2;
  form(pc, body, R, { cx: b.x0 + b.w * 0.36, cy: mcy, rx: b.w * 0.6, ry: (b.y1 - mcy) * 1.3 + 1, dome: 0.3, bias: o.bias ?? 0.04, tex: o.tex });
  if (o.band) {
    const [bc, f] = o.band, by = mb.y1 + (b.y1 - mb.y1) * f;
    body.each((x, y) => {
      if (Math.abs(y + 0.5 - by + Math.abs(x + 0.5 - mcx) * 0.08) > 0.9) return;
      const k = R.indexOf(pc.get(x, y));
      pc.set(x, y, mix(bc, k <= 2 ? 0xffffff : 0x1a1030, k <= 2 ? 0.2 : k >= 4 ? 0.34 : 0.04));
    });
  }
  lip.each((x, y) => { const front = y + 0.5 >= mcy; pc.set(x, y, R[front ? (x < mcx + mb.w * 0.25 ? 1 : 2) : (x < mcx - mb.w * 0.2 ? 2 : 3)]); });
  mm.each((x, y) => pc.set(x, y, R[y + 0.5 < mcy ? 5 : 4]));
  const surf = mm.clone().erode(1).and(mm.clone().shift(0, o.wall ?? 2));
  surf.mouth = mm; surf.outer = om; surf.body = body; surf.lip = lip;
  return surf;
}

/**
 * A plate / board / platter from its top outline (+ optional well outline): a thickness band
 * under it, a lit rim catch-light, an optional painted trim. Returns the well (or the top).
 */
function platter(pc, R, top, well = null, o = {}) {
  const tm = loop(top);
  if (o.extra) tm.union(o.extra);
  const under = tm.clone().shift(0, o.thick ?? 2).sub(tm);
  under.each((x, y) => pc.set(x, y, R[o.underK ?? 4]));
  const b = tm.bounds(), cx = (b.x0 + b.x1 + 1) / 2, cy = (b.y0 + b.y1 + 1) / 2;
  tm.each((x, y) => { const t = (x + 0.5 - cx) / (b.w / 2) + (y + 0.5 - cy) / (b.h / 2) * 0.6; pc.set(x, y, R[t < -0.7 ? 1 : t < 0.55 ? 2 : 3]); });
  let wm = tm;
  if (well) {
    wm = loop(well);
    wm.each((x, y) => pc.set(x, y, R[3]));
    wm.edge().each((x, y) => pc.set(x, y, y + 0.5 < cy ? R[4] : R[1]));
  }
  if (o.trim) tm.clone().erode(1).sub(tm.clone().erode(2)).each((x, y) => { if ((x * 3 + y) % 5) pc.set(x, y, y + 0.5 < cy ? mix(o.trim, 0xffffff, 0.2) : o.trim); });
  tm.edge().each((x, y) => { if (y + 0.5 < cy && x < cx + 4 && !tm.get(x, y - 1)) pc.set(x, y, R[o.rimK ?? 0]); });
  wm.top = tm; wm.under = under;
  return wm;
}

/** A broth / stew surface: shadow under the back rim, a reflected window, fat droplets. */
function broth(pc, m, R, o = {}) {
  const b = m.bounds();
  if (!b) return;
  const cx = (b.x0 + b.x1 + 1) / 2, cy = (b.y0 + b.y1 + 1) / 2, rw = b.w / 2, rh = b.h / 2;
  m.each((x, y) => {
    let k = 3;
    if (!m.get(x, y - 1) || !m.get(x, y - 2)) k = 4;
    const dx = (x + 0.5 - (cx - rw * 0.3)) / (rw * 0.4), dy = (y + 0.5 - (cy + rh * 0.1)) / (rh * 0.55);
    const d = dx * dx + dy * dy;
    if (o.gloss !== false && d < 1 && dy < 0.25) k = d > 0.4 ? 1 : 2;
    pc.set(x, y, R[k]);
    if (o.emit) pc.emit(x, y, o.emit);
  });
  for (let i = 0; i < (o.drops ?? 3); i++) {
    const x = Math.round(b.x0 + 2 + hash2(i, 3, o.seed ?? 5) * (b.w - 4)), y = Math.round(b.y0 + 1 + hash2(i, 7, o.seed ?? 5) * (b.h - 2));
    if (m.get(x, y) && m.get(x + 1, y + 1)) { pc.set(x, y, R[1]); pc.set(x + 1, y + 1, R[4]); }
  }
}

/** A sprig of thyme: a thin woody stem with pairs of tiny leaves, laid over everything (after ink). */
function sprig(pc, pts, o = {}) {
  const W = mat(0x7a5a3a, { cont: 1.1 }), L = mat(0x8ab46a, { cont: 1.15 });
  const at = spline(pts);
  strand(pc, pts, (t) => W[t < 0.5 ? 3 : 2]);
  const n = o.n ?? 4;
  for (let i = 1; i <= n; i++) {
    const t = 0.15 + (i / n) * 0.8, [x, y] = at(t), [x2, y2] = at(Math.min(1, t + 0.05));
    const a = Math.atan2(y2 - y, x2 - x), px = -Math.sin(a), py = Math.cos(a);
    for (const s of [-1, 1]) {
      const X = Math.round(x + px * s * 1.2 + Math.cos(a) * 0.4), Y = Math.round(y + py * s * 1.2 + Math.sin(a) * 0.4);
      pc.set(X, Y, L[s < 0 ? 2 : 3]);
      if (i % 2 && o.big !== false) pc.set(X + (s < 0 ? -1 : 1) * (Math.abs(px) > 0.5 ? 1 : 0), Y + (Math.abs(px) > 0.5 ? 0 : s), L[s < 0 ? 1 : 4]);
    }
  }
  const [tx, ty] = at(1);
  pc.set(Math.round(tx), Math.round(ty), L[1]);
}

// ---------------------------------------------------------------- ingredients
function berries(pc) {
  // a sprig of glossy cave berries hanging from a woody stalk, two leaves on top
  const LR = mat(0x4e8a3a, { cont: 1.15 });
  const ST = mat(0x6a4a2a, { cont: 1.1 });
  blade(pc, 15.4, 7.4, 4, 3.4, 2.8, LR, { bend: 1.4, veins: 2, serr: 0.18, teeth: 5, asym: 0.1 });
  blade(pc, 16.4, 7.6, 28, 5.6, 2.5, LR, { bend: -1.2, veins: 2, serr: 0.15, teeth: 5, curl: -1 });
  tube(pc, [[17, 1.6], [16, 5], [15.4, 9], [15.6, 12.6]], (s) => 1.1 - s * 0.35, ST, { bias: 0.1 });
  const BR = mat(0xc8243c, { cont: 1.18, warm: 0 });
  // each berry its own lopsided outline, back to front
  const BERRIES = [
    [[18.6, 14.4], [21.4, 13.4], [24.2, 14.6], [25, 17.6], [23.4, 20.2], [20.4, 20.6], [18.2, 18.6]],
    [[7, 15.4], [9.6, 13.8], [12.6, 14.4], [13.8, 17.4], [12.4, 20.4], [9.2, 21], [6.8, 19]],
    [[12.4, 18.4], [15.6, 16.8], [19, 17.8], [20.2, 21.4], [18.6, 24.6], [15, 25.4], [12.2, 23.4], [11.6, 20.8]],
    [[3.6, 23], [5.8, 20.8], [8.8, 21], [10.2, 23.6], [9.4, 26.6], [6.4, 27.6], [4, 26]],
    [[20.4, 21.6], [23.6, 20.4], [26.8, 21.8], [27.4, 25], [25.4, 27.4], [22.2, 27.4], [20.2, 25.2]],
    [[9.6, 24.6], [12.6, 23.2], [15.6, 24.4], [16.2, 27.6], [14.4, 30], [11, 30.2], [9, 28]],
  ];
  const all = M();
  BERRIES.forEach((P, i) => {
    const m = loop(P);
    all.union(m);
    seam(pc, m, 'shadow');
    form(pc, m, BR, { bias: 0.02 });
    const b = m.bounds();
    // a hard window highlight and a soft second one, then the dried calyx star at the bottom
    pc.set(b.x0 + 2, b.y0 + 1, 0xffe0e4); pc.set(b.x0 + 1, b.y0 + 2, BR[1]); pc.set(b.x0 + 3, b.y0 + 1, BR[1]);
    if (i % 2 === 0) pc.set(b.x1 - 1, b.y1 - 2, BR[2]);
    const cx = Math.round((b.x0 + b.x1) / 2), cy = b.y1;
    pc.set(cx, cy, 0x4a1a14); pc.set(cx - 1, cy, 0x6a2a1a); pc.set(cx, cy - 1, 0x5a2018);
  });
  ink(pc);
  // stalks from the stem to each berry crown, over the ink so they stay fine
  for (const [x1, y1] of [[21, 13], [10, 13.6], [15.6, 16.6], [6.4, 20.6], [24, 20.2], [12.8, 23]]) {
    strand(pc, [[15.6, 11.6], [(15.6 + x1) / 2, Math.min(11.6, y1) + 1], [x1, y1]], ST[2], { skip: all });
  }
  glint(pc, 14, 18, 1, 0xffffff, 0xffc8d0);
  for (const [x, y] of [[29, 13], [2, 11]]) pc.set(x, y, 0xffd0d8, 170);
}

function thyme(pc) {
  // a bunch of stone thyme: woody stems fanning out of a twine wrap, tiny paired leaves, lilac buds
  const W = mat(0x8a6a48, { cont: 1.1 });
  const L = mat(0xa8c88c, { cont: 1.15, sat: 0.8 });
  const D = mat(0x8eb27a, { cont: 1.12, sat: 0.8 });
  const STEMS = [
    [[15, 23], [11, 15], [6.4, 9.4], [3.6, 7.4]], [[15.6, 23], [14.2, 14], [13.6, 7], [14.4, 2.6]], [[16.6, 23], [18.6, 15], [21, 8], [23.6, 3.6]],
    [[17, 23.4], [21.6, 17.6], [26, 13], [29, 11.6]], [[15, 23.6], [9.6, 19.6], [5.4, 17.4], [2.4, 17.4]],
  ];
  STEMS.forEach((P, si) => {
    const sw = tube(pc, P, (s) => 0.8 - s * 0.25, W, { bias: 0.12, seam: false });
    const R = si % 2 ? D : L;
    for (let i = 0; i < 4; i++) {
      const t = 0.38 + i * 0.17, [x, y] = sw.at(t), [x2, y2] = sw.at(Math.min(1, t + 0.04));
      const a = Math.atan2(y2 - y, x2 - x), l = 2.8 - i * 0.3;
      for (const s of [-1, 1]) {
        if ((i + si) % 2 && s > 0) continue;
        const aa = a + s * 0.85;
        blade(pc, x, y, x + Math.cos(aa) * l, y + Math.sin(aa) * l, 1.15, R, { veins: 0, rib: false, fold: 0.9, seam: false, bias: s < 0 ? 0.1 : 0 });
      }
    }
  });
  for (let i = -2; i <= 2; i++) tube(pc, [[15.6 + i * 0.6, 23.4], [15.6 + i * 1.2, 29.4]], 0.7, W, { bias: 0.1, seam: i % 2 === 0, capEnd: 0.1 });
  const TW = RAMPS.twine();
  const wrap = loop([[12.6, 21.8], [15.6, 20.8], [19, 21.4], [19.6, 24.6], [16.4, 25.8], [13, 25]]);
  seam(pc, wrap, 'shadow');
  form(pc, wrap, TW, { bias: 0.08 });
  wrap.each((x, y) => { if ((x - y * 1.4 + 40) % 3 < 1 && !isTop(wrap, x, y)) step(pc, TW, x, y, 1, 1, 5); });
  ink(pc);
  for (const x of [13, 15, 17, 19]) pc.set(x, 30, W[1]);
  strand(pc, [[19, 24.4], [22, 27], [24, 26.4], [26, 28.8]], (t) => TW[t < 0.5 ? 2 : 3]);
  strand(pc, [[19.4, 23.6], [23, 23.6], [25.6, 22]], TW[2]);
  for (const [x, y] of [[13, 1], [23, 2], [2, 6], [29, 10], [1, 16]]) { pc.set(x, y, 0xecd4f8); pc.set(x + 1, y, 0xb88ad8); pc.set(x, y + 1, 0x9a6ac0); }
}

function tuber(pc) {
  // a knobbly tunnel tuber: lumpy skin with eyes and clinging soil, two pale sprouts, a root tail
  const R = mat(0xb48a5a, { cont: 1.12, warm: 42 });
  const t = loop([[3.4, 21], [4.4, 16.6], [7.4, 13.6], [11, 13], [13.6, 11], [17.6, 10.4], [20.4, 8.4], [24.4, 8.6], [27.4, 11.2], [28, 15.4], [26.4, 18.2], [24.4, 19], [22.6, 21.8], [18.4, 23.4], [14.6, 26.2], [10, 27.6], [6, 26.8]]);
  seam(pc, t, 'shadow');
  const K = form(pc, t, R, { cx: 13, cy: 15, rx: 14, ry: 10, bias: 0.04, tex: (x, y) => (vnoise(x * 0.45, y * 0.45, 9) - 0.5) * 0.45 });
  void K;
  bumps(pc, t, R, { dens: 0.08, seed: 4 });
  // soil clinging in the hollows
  t.clone().erode(1).each((x, y) => { if (vnoise(x * 0.35 + 4, y * 0.35, 3) > 0.72) pc.set(x, y, hash2(x, y, 2) < 0.5 ? 0x5e4028 : 0x76553a); });
  // eyes: little dark crescents with a lit lower lip
  for (const [x, y] of [[9, 17], [15, 14], [22, 12], [19, 19], [12, 23], [25, 15]]) { pc.set(x, y, R[5]); pc.set(x + 1, y, R[5]); pc.set(x, y + 1, R[2]); pc.set(x + 1, y + 1, R[1]); }
  // sprouts from two eyes
  const SP = mat(0xe8dcf0, { cont: 1.1 });
  tube(pc, [[22.4, 11.6], [22, 7], [24, 4], [26.4, 3.2]], (s) => 1.1 - s * 0.4, SP, { bias: 0.1 });
  tube(pc, [[9.4, 16.4], [7, 12], [5.6, 9.4]], (s) => 1 - s * 0.35, SP, { bias: 0.1 });
  ink(pc);
  pc.set(26, 2, 0xc8a8e0); pc.set(27, 3, 0x9a7ac0); pc.set(5, 8, 0xc8a8e0);
  // root hairs off the tail end
  for (const P of [[[5, 26.4], [2.6, 28], [1.4, 30.6]], [[8, 27.6], [7, 29.6], [8.4, 31]], [[27.4, 17], [29.6, 18.6], [30.4, 21]]]) strand(pc, P, 0x8a6a4a);
  glint(pc, 10, 15, 0); pc.set(18, 12, R[1]);
}

function garlic(pc) {
  // a fat bulb of cave garlic: clove ribs under papery skin, a twisted neck, a root tuft, a loose clove
  const R = mat(0xf2ebe0, { cont: 1.1, sat: 0.55 });
  const bulb = loop([[15.6, 7.6], [17.6, 9.6], [21.4, 11.6], [24.6, 14.8], [25.8, 19], [24.6, 23.4], [21.2, 26.6], [16, 27.8], [10.6, 26.8], [6.8, 23.6], [5.6, 19.2], [6.8, 14.8], [10, 11.6], [13.6, 9.6]]);
  const neck = loop([[14.2, 9.6], [14.4, 5], [13.6, 1.8], [15.6, 2.2], [17, 5.6], [17.6, 9.4]]);
  seam(pc, neck, 'shadow');
  form(pc, neck, mat(0xe0d2b4, { cont: 1.05 }), { bias: 0.1 });
  line(pc, 15, 3, 16, 8, 0xc8b490);
  seam(pc, bulb, 'shadow');
  form(pc, bulb, R, { cx: 13.5, cy: 17, rx: 11, ry: 11, bias: 0.06 });
  // clove ribs: curved grooves from the neck to the base, lit on their left
  for (const f of [-0.66, -0.24, 0.2, 0.62]) {
    for (let y = 11; y <= 27; y++) {
      const v = (y - 11) / 16, half = 9.6 * Math.sin(Math.min(1, v * 1.25 + 0.15) * Math.PI * 0.62);
      const x = Math.round(15.8 + f * half);
      if (!bulb.get(x, y) || isTop(bulb, x, y) || isBot(bulb, x, y)) continue;
      step(pc, R, x, y, 2, 1, 5);
      if (bulb.get(x - 1, y)) step(pc, R, x - 1, y, -1, 1, 5);
    }
  }
  // violet blush toward the base
  bulb.each((x, y) => { if (y > 20 && !isTop(bulb, x, y) && hash2(x, y, 5) < 0.18 + (y - 20) * 0.03) pc.set(x, y, mix(pc.getHex(x, y), 0xa070b0, 0.3)); });
  // the root plate
  const RP = mat(0xc8b088, { cont: 1.05 });
  const rp = loop([[12.6, 27], [16, 26.4], [19.6, 27.2], [18, 29], [14, 29.2]]);
  seam(pc, rp, 'shadow'); form(pc, rp, RP, { bias: 0.05 });
  // a single clove broken off, lying in front
  const cl = loop([[21.6, 26.4], [24.4, 23.4], [27.6, 22.2], [30.2, 23.4], [29.6, 26.6], [26.8, 29], [23.4, 29.4]]);
  seam(pc, cl, 'shadow');
  form(pc, cl, R, { bias: 0.04 });
  line(pc, 23, 28, 29, 24, (i, X, Y) => (cl.get(X, Y) && !isBot(cl, X, Y) && i % 3 ? R[4] : null));
  ink(pc);
  for (const P of [[[13.6, 29.4], [12.4, 31]], [[15, 29.6], [14.8, 31.4]], [[16.6, 29.6], [17.4, 31.2]], [[18.2, 29.2], [20, 30.6]], [[12.6, 28.8], [10.6, 30]]]) strand(pc, P, 0xb09870);
  pc.set(13, 1, 0xd8c8a4); pc.set(12, 0, 0xc8b490);
  glint(pc, 10, 14, 1, 0xffffff, R[0]);
}

function moss(pc) {
  // a sheet of glow moss peeled off the cave wall, draped over a stone, glowing threads hanging
  const RK = mat(0x6a645e, { cont: 1.12 });
  const rock = loop([[7.4, 24], [10, 20.6], [16, 19.6], [22.4, 20.2], [26.4, 22.6], [27.6, 26.4], [24.6, 29.4], [16, 30.2], [8.6, 29.4], [5.6, 27]]);
  form(pc, rock, RK, { bias: 0.04, dome: 0.3 });
  marks(pc, rock, RK, { dens: 0.1, seed: 4, len: 3, dir: [1, 0.2] });
  const R = mat(0x46b05a, { cont: 1.15 });
  const sheet = loop([[2.6, 18.4], [4.4, 13.2], [8, 10.2], [11.6, 9.6], [14.4, 7.4], [18.4, 7.8], [21.6, 9.6], [25.6, 9.8], [28.6, 12.6], [29.4, 17], [27.6, 21.8], [25.4, 23.6], [22.6, 22.2], [19, 23.8], [15.6, 22.8], [12, 24.4], [8.6, 23.2], [5.6, 23.6], [3.4, 21.6]]);
  const m = fringe(sheet, 16, 16, { dens: 0.5, seed: 3, len: 1.5, lean: 0.3, only: (x, y) => y < 16 });
  seam(pc, m, 'shadow');
  const K = form(pc, m, R, { cx: 14, cy: 13, rx: 15, ry: 9, bias: 0.06, emit: (x, y, k) => (k <= 2 ? 0.45 : 0.15) });
  void K;
  // the pile: tight little rosettes (a lit pixel with a dark one under it) all over
  bumps(pc, m, R, { dens: 0.32, seed: 7 });
  // rolled, curled-under front edge
  m.each((x, y) => { if (!m.get(x, y + 1)) { pc.set(x, y, R[5]); if (m.get(x, y - 1)) pc.set(x, y - 1, R[4]); } });
  ink(pc);
  // glowing tips along the top and hanging threads with glowing beads
  m.each((x, y) => { if (!m.get(x, y - 1) && hash2(x, y, 11) < 0.45) gl(pc, x, y, (x + y) % 2 ? 0xc8ffb8 : 0x9af08a, 0.9); });
  for (const [x, y0, h] of [[6, 24, 4], [13, 25, 3], [20, 24, 5], [26, 24, 3]]) {
    for (let i = 0; i < h; i++) pc.set(x + (i > 1 && x % 2 ? 1 : 0), y0 + i, 0x2e6a3a);
    gl(pc, x + (h > 2 && x % 2 ? 1 : 0), y0 + h, 0xd8ffc8, 1);
  }
  for (const [x, y] of [[5, 6], [24, 4], [15, 3], [30, 8]]) gl(pc, x, y, 0xc8ffc0, 0.8);
  twinkle(pc, 10, 4, 0xffffff, 0xb8ffb0, 1, 0.9);
}

function grub(pc) {
  // a fat cave grub curled into a tight C: creased segments, a translucent dark gut at the rear,
  // a glossy amber head with mandibles and three pairs of tiny legs; a smaller one behind it
  const R = mat(0xf4e8d2, { cont: 1.08, warm: 46 });
  const HR = mat(0xd07a2a, { cont: 1.15, warm: 40 });
  const s2 = tube(pc, [[21.6, 29.6], [25.6, 28.4], [28.6, 25.4], [29.8, 21.6]], (s) => 1.6 + Math.sin(s * Math.PI) * 0.8, R, { bias: 0.02 });
  for (let i = 0; i < 1024; i++) if (s2.mask.m[i] && ((s2.S[i] * 6) % 1) < 0.2 && !isTop(s2.mask, i % 32, (i / 32) | 0)) step(pc, R, i % 32, (i / 32) | 0, 1, 1, 5);
  const h2 = loop([[28.4, 21.6], [29.4, 19.4], [31.4, 19.6], [31.4, 22.2], [30, 23]]);
  seam(pc, h2, 'shadow'); form(pc, h2, HR, { bias: 0.04 });
  const P = [];
  for (let i = 0; i <= 8; i++) { const a = -0.72 - i * (4.7 / 8), r = 7.6 - Math.abs(i - 4) * 0.12; P.push([14.6 + Math.cos(a) * r * 1.02, 16.6 + Math.sin(a) * r]); }
  const sw = tube(pc, P, (s) => 2.8 + Math.sin(Math.min(1, s * 1.08) * Math.PI) * 2.6, R, { bias: 0.08 });
  for (let i = 0; i < 1024; i++) {
    if (!sw.mask.m[i]) continue;
    const s = sw.S[i], f = (s * 12) % 1, x = i % 32, y = (i / 32) | 0;
    if (s < 0.22 && !isTop(sw.mask, x, y)) pc.set(x, y, mix(pc.getHex(x, y), 0x7a6a78, 0.3 * (1 - s / 0.22)));
    if (isTop(sw.mask, x, y) || isBot(sw.mask, x, y)) continue;
    if (f < 0.13) step(pc, R, x, y, 2, 1, 5);
    else if (f < 0.28) step(pc, R, x, y, -1, 1, 5);
  }
  const [hx, hy] = sw.at(1);
  const head = loop([[hx - 3, hy - 1], [hx - 0.6, hy - 3.4], [hx + 2.4, hy - 2.6], [hx + 3.6, hy + 0.4], [hx + 2.4, hy + 3.2], [hx - 0.6, hy + 3], [hx - 2.6, hy + 1.4]]);
  seam(pc, head, 'shadow');
  form(pc, head, HR, { bias: 0.06 });
  ink(pc);
  // mandibles at the front of the head, legs tucked into the curl, spiracle dots, a wet glint
  const mx = Math.round(hx + 3), my = Math.round(hy + 2);
  pc.set(mx, my, 0x2a120a); pc.set(mx + 1, my, 0x4a200e); pc.set(mx, my + 1, 0x2a120a);
  for (let k = 0; k < 3; k++) {
    const [x, y] = sw.at(0.86 - k * 0.07), [x2, y2] = sw.at(0.87 - k * 0.07);
    const a = Math.atan2(y2 - y, x2 - x), nx = -Math.sin(a), ny = Math.cos(a);
    for (const d of [3.6, 4.6]) { const X = Math.floor(x - nx * d), Y = Math.floor(y - ny * d); if (!sw.mask.get(X, Y)) pc.set(X, Y, d < 4 ? 0xb87038 : 0x8a4a20); }
  }
  for (let s = 0.2; s < 0.8; s += 0.085) { const [x, y] = sw.at(s), [x2, y2] = sw.at(s + 0.01); const a = Math.atan2(y2 - y, x2 - x); const X = Math.floor(x - Math.sin(a) * -2.6), Y = Math.floor(y + Math.cos(a) * -2.6); if (sw.mask.get(X, Y) && !isTop(sw.mask, X, Y) && !isBot(sw.mask, X, Y)) pc.set(X, Y, 0xc89a6a); }
  glint(pc, 9, 9, 1, 0xffffff, R[0]); pc.set(hx - 1, hy - 2, 0xffe8c8);
}

function dinoEgg(pc) {
  // a huge mottled dino egg nested in fern fronds and pebbles, a hairline crack near the top
  const LF = mat(0x4a8a3e, { cont: 1.15 });
  const LD = mat(0x3a6e34, { cont: 1.12 });
  for (const [x0, y0, x1, y1, b] of [[13, 26, 2, 18.6, 1.4], [19, 26, 30, 18, -1.4]]) blade(pc, x0, y0, x1, y1, 3, LD, { bend: b, serr: 0.4, teeth: 6, veins: 3 });
  const R = mat(0xd6dcb8, { cont: 1.1, sat: 0.75 });
  const egg = loop([[15.4, 2.4], [19.4, 3.6], [22.8, 7.4], [24.8, 12.4], [25.4, 17.6], [24, 22.4], [20.6, 26], [15.6, 27.2], [10.6, 26], [7.2, 22.4], [6.4, 17], [7.4, 11.6], [9.8, 6.6], [12.4, 3.6]]);
  seam(pc, egg, 'shadow');
  form(pc, egg, R, { cx: 13.6, cy: 11, rx: 11, ry: 14, bias: 0.04 });
  // mottling: soft olive / umber blotches, with crisp edges
  egg.clone().erode(1).each((x, y) => {
    const v = vnoise(x * 0.42 + 7, y * 0.42, 6);
    if (v > 0.72) pc.set(x, y, v > 0.82 ? 0x5a6a3a : 0x7a8a50);
    else if (v < 0.17) pc.set(x, y, 0x8a6a46);
  });
  // the crack: a jagged dark line with a lit lip and a chip out of the shell
  for (const [x, y] of [[13, 6], [14, 7], [14, 8], [15, 9], [16, 9], [17, 10], [17, 11], [18, 12]]) { pc.set(x, y, 0x3a3424); if (egg.get(x - 1, y + 1)) pc.set(x - 1, y + 1, R[1]); }
  pc.set(19, 12, 0x3a3424); pc.set(12, 5, 0x3a3424);
  // front fronds and two pebbles hold it upright
  const PB = mat(0x8a8078, { cont: 1.1 });
  for (const P of [[[3.6, 27.6], [6, 25.4], [9.4, 25.6], [10.4, 28], [8, 30], [4.6, 29.8]], [[22.6, 27], [25.6, 25.6], [28.4, 26.8], [28.6, 29.4], [25, 30.4], [22.4, 29.4]]]) {
    const p = loop(P); seam(pc, p, 'shadow'); form(pc, p, PB, { bias: 0.06 });
  }
  for (const [x0, y0, x1, y1, b] of [[16, 30, 6, 25, 1], [16, 30, 26.6, 24.4, -1], [15, 31, 12.6, 25.4, 0.4], [17, 31, 20.6, 25.6, -0.4]]) blade(pc, x0, y0, x1, y1, 2.2, LF, { bend: b, serr: 0.35, teeth: 5, veins: 2 });
  ink(pc);
  glint(pc, 11, 7, 1, 0xffffff, R[0]); pc.set(9, 11, R[0]);
}

function drakeMeat(pc) {
  // a drake shank on butcher paper: marbled red meat, a cream fat cap, a strip of scaly hide, the bone
  const PP = mat(0xeadcbc, { cont: 1.05 });
  const paper = loop([[1.6, 21.6, 1], [13.6, 14.4], [20, 13, 1], [31, 18.6, 1], [26.4, 24], [19.4, 29.6, 1], [12, 27.2], [5.4, 25.4]]);
  form(pc, paper, PP, { flatten: 0.4, dome: 0.2, bias: 0.06 });
  for (const [x0, y0, x1, y1] of [[5, 22, 11, 20], [22, 25, 27, 21], [14, 26, 18, 27]]) line(pc, x0, y0, x1, y1, PP[4]);
  // the bone end with its two-lobed knuckle
  const B = mat(0xf2e8d0, { cont: 1.08 });
  const bone = loop([[18.4, 13.4], [22.6, 10], [25.4, 7], [24.6, 4.4], [26.6, 2.6], [29, 3.4], [30.4, 5.6], [29.6, 7.8], [27.6, 8.4], [25.4, 12], [21.4, 16.4]]);
  seam(pc, bone, 'shadow');
  form(pc, bone, B, { bias: 0.08 });
  const R = mat(0xb03a36, { cont: 1.15, warm: 8 });
  const meat = loop([[3.6, 19], [5.6, 14.4], [9.6, 11], [14.4, 10.2], [19.4, 11.8], [22.8, 15], [23.6, 19], [21.4, 22.6], [16.4, 24.8], [10.4, 25], [6, 23.4]]);
  seam(pc, meat, 'shadow');
  form(pc, meat, R, { cx: 11, cy: 15, rx: 12, ry: 10, bias: 0.04 });
  // marbling: thin curving streaks of fat
  meat.clone().erode(1).each((x, y) => { const v = vnoise(x * 0.55 + y * 0.3, y * 0.9, 13); if (v > 0.74 && v < 0.82) pc.set(x, y, 0xecb8a8); });
  // the fat cap along the underside
  meat.each((x, y) => { if (!meat.get(x, y + 1) || !meat.get(x, y + 2)) { if (y > 18 && x < 21) pc.set(x, y, !meat.get(x, y + 1) ? 0xd8b896 : 0xf2dcc0); } });
  // a strip of drake hide, scales in staggered rows
  const HD = mat(0xd86a2a, { cont: 1.15, warm: 30 });
  const hide = loop([[5, 15.4], [8.6, 12], [12.4, 11], [11.6, 13.6], [8.6, 15.6], [6, 18]]);
  hide.each((x, y) => pc.set(x, y, HD[((x + (y % 2)) % 2) ? 2 : 3]));
  hide.each((x, y) => { if (isBot(hide, x, y)) pc.set(x, y, HD[4]); else if (isTop(hide, x, y)) pc.set(x, y, HD[1]); });
  ink(pc);
  glint(pc, 14, 13, 0); pc.set(13, 13, R[1]); pc.set(28, 4, 0xffffff);
  for (const [x, y] of [[8, 27], [3, 24]]) pc.set(x, y, 0x9a3a2a, 160);
}

// ---------------------------------------------------------------- dishes
function mushStew(pc) {
  // a thumb-pressed earthenware bowl of brown stew, sliced mushrooms, a thyme sprig, steam
  const CL = mat(0xa8603a, { cont: 1.12 });
  const s = vessel(pc, CL, [[2.6, 14.6], [4.6, 12], [9, 10.6], [16, 10.2], [23, 10.8], [27.6, 12.2], [29.6, 14.8], [28.8, 18.4], [26, 22.6], [22, 25.6], [21.4, 27.6, 1], [11, 27.8, 1], [10.6, 25.6], [6.4, 22.6], [3.4, 18.4]],
    [[4.6, 14.4], [7.6, 12.6], [13, 11.8], [19, 11.8], [24.4, 12.4], [27.6, 14.4], [26, 16.6], [21, 18], [15.6, 18.2], [10, 17.8], [5.8, 16.4]], { band: [0xe8c890, 0.36] });
  // thumb dimples along the outside of the rim
  for (let x = 5; x < 28; x += 3) { const y = Math.round(15.6 + Math.abs(x - 16) * -0.04 + (x > 8 && x < 25 ? 2.4 : 1.2)); if (s.body.get(x, y) && !isBot(s.body, x, y)) { step(pc, CL, x, y, 1, 1, 5); step(pc, CL, x + 1, y, -1, 1, 5); } }
  broth(pc, s, mat(0x8a5a32, { cont: 1.05 }), { seed: 4 });
  // mushroom slices: the classic cap-and-stem profile, each one cut a little differently
  const MR = mat(0xe4d0b0, { cont: 1.05 });
  for (const P of [
    [[7.4, 15], [8.6, 13], [11, 12.6], [12.6, 14], [11, 14.8], [10.6, 16.4], [9.2, 16.4], [9, 15.2]],
    [[14, 14.4], [15.4, 12.4], [18, 12.2], [19.4, 13.8], [17.8, 14.6], [17.6, 16.6], [16.2, 16.4], [15.8, 14.8]],
    [[19.6, 15.8], [21, 14], [23.6, 13.8], [25, 15.2], [23.4, 16], [23, 17.4], [21.8, 17.4], [21.4, 16.2]],
  ]) {
    const m = loop(P);
    seam(pc, m, 'shadow');
    chip(pc, m, MR, 2);
    m.each((x, y) => { if (!m.get(x, y - 1)) pc.set(x, y, 0x8a5a36); });
  }
  ink(pc);
  sprig(pc, [[21, 14], [24, 10], [27, 6.4], [28.4, 4]], { n: 4 });
  steam(pc, 10, 10, 8); steam(pc, 16, 9, 9, { phase: 2 });
  glint(pc, 7, 20, 0);
}

function trufOmelette(pc) {
  // a soft folded omelette on a blue-rimmed stoneware plate, black truffle shaved over it
  const PL = mat(0xece4d4, { cont: 1.05 });
  platter(pc, PL, [[1.4, 21.4], [3.6, 17.8], [9, 15.8], [16, 15.2], [23.6, 15.8], [28.6, 17.8], [30.6, 21], [29, 24.6], [23, 27.4], [15.6, 28.2], [8, 27.4], [3.2, 25]],
    [[5.6, 21.4], [9, 18.6], [16, 17.8], [23, 18.4], [26.8, 21.2], [24.4, 24], [16, 25.2], [8.6, 24.4]], { trim: 0x3a6ab0 });
  const R = mat(0xffd24a, { cont: 1.1, warm: 52 });
  const om = loop([[4.6, 20.6], [5.6, 16.4], [9, 12.6], [14, 10.6], [19.6, 10.6], [24.4, 12.6], [27.4, 16.4], [27.6, 20.6], [24, 22.6], [16, 23.4], [8.4, 22.8]]);
  seam(pc, om, 'shadow');
  form(pc, om, R, { cx: 14, cy: 15, rx: 13, ry: 9, bias: 0.04 });
  // browned patches, then the soft fold along the front with a lit roll above it
  om.each((x, y) => { if (vnoise(x * 0.5, y * 0.7, 4) > 0.7 && !isTop(om, x, y) && !isBot(om, x, y)) pc.set(x, y, mix(R[3], 0xb8742a, 0.5)); });
  for (let x = 6; x < 27; x++) { const y = Math.round(20 - Math.sin((x - 6) / 21 * Math.PI) * 1.6); if (om.get(x, y + 1)) { pc.set(x, y, R[4]); pc.set(x, y - 1, R[1]); } }
  // truffle shavings: thin wavy slices, dark with pale marbling, each its own curl
  for (const P of [[[8, 15], [10.6, 13.6], [12.6, 14.4], [10.4, 16]], [[14.6, 13.2], [17.6, 12.4], [18.6, 13.6], [15.6, 14.8]], [[19.4, 16.2], [22.6, 15.2], [23.4, 16.6], [20.4, 17.6]], [[12, 18.2], [14.4, 17], [15.6, 18.2], [13, 19.4]]]) {
    const m = loop(P);
    seam(pc, m, 'shadow');
    m.each((x, y) => pc.set(x, y, (x * 2 + y) % 3 ? 0x3e2a22 : 0xb8a090));
  }
  ink(pc);
  for (const [x, y] of [[11, 12], [21, 13], [17, 18]]) { pc.set(x, y, 0x5aa84a); pc.set(x + 1, y, 0x3a7a3a); }
  glint(pc, 9, 13, 1, 0xffffff, R[0]);
  steam(pc, 13, 9, 6, { a: 150 });
}

function rootPie(pc) {
  // a closed root-vegetable pie in a fluted tin: crimped rim, pastry leaves, a vent bubbling orange
  const TN = mat(0x9aa0a8, { cont: 1.2 });
  const tin = loop([[1.4, 20], [3.6, 16.6], [9, 14.6], [16, 14], [23, 14.6], [28.6, 16.6], [30.6, 20], [29.6, 24], [25, 27.6], [16, 29], [7, 27.6], [2.4, 24]]);
  tin.each((x, y) => pc.set(x, y, TN[y > 24 ? 4 : x % 2 ? 2 : 3]));
  const CR = mat(0xdca058, { cont: 1.12, warm: 45 });
  const top = loop([[2.6, 18.8], [5.4, 14.4], [10.4, 11.4], [16, 10.6], [22, 11.4], [26.8, 14], [29.4, 18.4], [27.6, 22.4], [22.4, 25], [16, 25.8], [9.4, 25], [4.4, 22.6]]);
  seam(pc, top, 'shadow');
  form(pc, top, CR, { cx: 13, cy: 15, rx: 15, ry: 10, flatten: 0.7, bias: 0.06 });
  // crimped rim: pinches round the edge, each a lit and a shaded pixel
  const rim = top.clone().sub(top.clone().erode(2));
  rim.each((x, y) => { const a = Math.atan2(y + 0.5 - 18, x + 0.5 - 16); if ((Math.floor(a * 7 + 20)) % 2) step(pc, CR, x, y, 1, 1, 5); else step(pc, CR, x, y, -1, 1, 5); });
  // two pastry leaves laid on top
  const LV = mat(0xe8b468, { cont: 1.12, warm: 45 });
  blade(pc, 9, 18, 15.6, 13.6, 2.4, LV, { bend: 1, veins: 2, rib: LV[4] });
  blade(pc, 23.6, 19.6, 17.6, 14.4, 2.2, LV, { bend: -1, veins: 2, rib: LV[4] });
  // the vent: a torn hole with filling bubbling up
  const vent = loop([[14.6, 18.6], [16.6, 17.6], [18.6, 18.4], [17.6, 20.4], [15.4, 20.4]]);
  seam(pc, vent, CR[5]);
  vent.each((x, y) => gl(pc, x, y, y < 19 ? 0xffa850 : 0xe0702a, 0.35));
  pc.set(16, 18, 0xffe0a0);
  speckle(pc, top, [CR[1]], 0.05, 8, (x, y) => !rim.get(x, y));
  ink(pc);
  // a carrot-top frond garnish, glints, steam
  for (const [x0, y0, x1, y1] of [[16, 18, 13, 13], [17, 18, 19, 12], [16, 18, 16, 11]]) line(pc, x0, y0 - 1, x1, y1, (i) => (i ? (i % 2 ? 0x5aa84a : 0x3e8a3a) : null));
  glint(pc, 7, 15, 0);
  steam(pc, 11, 12, 7); steam(pc, 21, 12, 7, { phase: 3 });
}

function fishPie(pc) {
  // stargazy pie: a deep clay dish, a domed crust, three fish heads poking out to look up
  const DSH = mat(0xb0603a, { cont: 1.12 });
  const s = vessel(pc, DSH, [[1.6, 17.6], [4, 14.6], [9, 13], [16, 12.6], [23, 13], [28, 14.6], [30.4, 17.6], [30, 21.6], [27, 25.6], [21, 28], [11, 28], [5, 25.6], [2, 21.6]],
    [[3.6, 17.6], [7, 15.4], [16, 14.6], [25, 15.4], [28.4, 17.6], [25, 20], [16, 21], [7, 20]], { band: [0xf0d8a0, 0.42], wall: 0 });
  const CR = mat(0xdca460, { cont: 1.12, warm: 45 });
  const crust = loop([[3.6, 17.4], [6.4, 13.6], [11, 11.4], [16, 10.8], [21.6, 11.4], [25.8, 13.6], [28.4, 17.4], [25.4, 20], [16, 21], [6.6, 20]]);
  crust.and(s.mouth.clone().dilate(1).union(loop([[5, 17], [16, 9], [27, 17]])));
  seam(pc, crust, 'shadow');
  form(pc, crust, CR, { flatten: 0.7, bias: 0.06 });
  bumps(pc, crust, CR, { dens: 0.08, seed: 3 });
  // three heads, each tilted its own way: a pointed snout, gill line, a big round-ish eye
  const FR = mat(0xb8c4d4, { cont: 1.2 });
  const heads = [
    [[7.4, 17], [7.4, 12.6], [8.6, 8.4], [10, 6.6], [11.4, 8.8], [11.8, 13], [11.4, 17]],
    [[13.8, 16.6], [14, 11], [15, 5.6], [16.4, 3.6], [17.8, 5.8], [18.4, 11], [18.2, 16.6]],
    [[20.4, 17.6], [21, 12.8], [22.6, 8.8], [24.4, 7.6], [25.2, 10], [24.6, 13.6], [24.4, 17.6]],
  ];
  const eyes = [[9, 10], [15, 8], [23, 10]];
  heads.forEach((P, i) => {
    const m = loop(P);
    seam(pc, m, 'shadow');
    form(pc, m, FR, { bias: 0.06 });
    const b = m.bounds();
    // gill crescent near the crust and the collar of crust bubbling round the neck
    for (let x = b.x0; x <= b.x1; x++) { const y = b.y1 - 2; if (m.get(x, y) && !isTop(m, x, y)) pc.set(x, y, FR[4]); }
    for (let x = b.x0 - 1; x <= b.x1 + 1; x++) { const y = b.y1; if (crust.get(x, y)) pc.set(x, y, CR[(x + i) % 2 ? 1 : 2]); if (crust.get(x, y + 1)) pc.set(x, y + 1, CR[4]); }
    const [ex, ey] = eyes[i];
    pc.set(ex, ey, 0xf8f4e0); pc.set(ex + 1, ey, 0x1a1420); pc.set(ex + 1, ey + 1, 0x2a2430);
  });
  ink(pc);
  for (const [x, y] of [[10, 6], [16, 3], [24, 7]]) pc.set(x, y - 1 + (x === 16 ? 0 : 0), 0x6a7a90);
  glint(pc, 14, 7, 0); glint(pc, 6, 15, 0);
  steam(pc, 5, 12, 6, { a: 150 }); steam(pc, 27, 12, 6, { a: 150, phase: 2 });
}

function friedGrubs(pc) {
  // a twist of parchment cone stuffed with golden fried grubs, salt and chili flakes
  const PP = mat(0xeee0be, { cont: 1.08 });
  const cone = loop([[2.4, 29.6, 1], [9.6, 14], [13.6, 9.4], [19.6, 6.6], [24.4, 8.6], [27.2, 13.6], [26, 17.6, 1]]);
  form(pc, cone, PP, { cx: 12, cy: 16, rx: 14, ry: 14, flatten: 0.6, dome: 0.2, bias: 0.04 });
  // printed lines on the paper (a recipe sheet), and the folded seam
  cone.clone().erode(1).each((x, y) => { const u = x * 0.6 + y * 0.8, v = x * 0.8 - y * 0.6; if (((Math.floor(v) % 3) + 3) % 3 === 0 && (u % 4) > 1.2 && u > 13 && u < 34) pc.set(x, y, mix(pc.getHex(x, y), 0x6a5a4a, 0.4)); });
  line(pc, 4, 27, 17, 13, (i, X, Y) => (cone.get(X, Y) && cone.get(X - 1, Y) ? PP[4] : null));
  // grubs heaped in the mouth: little curled bodies, each its own curl
  const G = mat(0xe8aa3a, { cont: 1.12, warm: 48 });
  const CURLS = [
    [[10.6, 12], [12, 9], [15, 8.4], [16, 10.6], [14, 11.4]],
    [[15.4, 8], [18, 5], [21.6, 5.4], [21.8, 8.4], [19.4, 8.6]],
    [[20, 10.6], [22.6, 7.6], [26, 8.6], [26.4, 11.6], [24, 12]],
    [[13.6, 13.4], [15.4, 10.8], [19, 10.6], [20.6, 13], [18, 14.6]],
    [[19.4, 14.4], [21.4, 12], [25, 12.8], [25.4, 15.6], [22.6, 16.4]],
  ];
  for (const P of CURLS) {
    const sw = tube(pc, P, (s) => 1.6 + Math.sin(s * Math.PI) * 0.4, G, { bias: 0.04 });
    for (let i = 0; i < 1024; i++) if (sw.mask.m[i] && ((sw.S[i] * 5) % 1) < 0.2) step(pc, G, i % 32, (i / 32) | 0, 1, 1, 5);
    bumps(pc, sw.mask, G, { dens: 0.2, seed: P[0][0] | 0 });
  }
  // one escaped onto the table
  const sw = tube(pc, [[25.4, 26], [27.6, 23.6], [30.2, 24.6], [29.6, 27.4]], 1.5, G, { bias: 0.04 });
  void sw;
  ink(pc);
  for (const [x, y] of [[14, 9], [19, 12], [23, 10], [17, 6], [28, 25]]) pc.set(x, y, 0xffffff);
  for (const [x, y] of [[16, 12], [22, 14], [21, 7]]) pc.set(x, y, 0xd8302a);
  glint(pc, 8, 19, 0);
  steam(pc, 16, 4, 4, { a: 140 }); steam(pc, 22, 4, 4, { a: 120, phase: 2 });
}

function saltFish(pc) {
  // a stiff salt-cured fish on a heap of coarse salt, crystals crusted along its back
  const SL = mat(0xe8e4dc, { cont: 1.05 });
  const heap = loop([[2.6, 26], [5.6, 22.6], [10.6, 21.2], [17, 21.6], [23.4, 20.6], [28.4, 22.4], [30.4, 26.2], [27, 29.4], [17, 30.4], [7, 29.6]]);
  form(pc, heap, SL, { bias: 0.04, dome: 0.3 });
  bumps(pc, heap, SL, { dens: 0.3, seed: 5, big: true });
  const R = mat(0xc8b08a, { cont: 1.15, sat: 0.8 });
  // the fish lies on the diagonal, its tail flicked up, mouth open
  const tail = loop([[24.6, 9.6], [27.4, 4.4], [29.8, 2.6], [29, 6.6, 1], [30.6, 9.6], [28.4, 11.6]]);
  seam(pc, tail, 'shadow');
  form(pc, tail, R, { bias: 0.04 });
  for (let k = 0; k < 3; k++) line(pc, 26, 9, 29 - k * 0.4, 4 + k * 2.6, (i, X, Y) => (i > 1 && tail.get(X, Y) ? R[4] : null));
  const fish = loop([[2.6, 24.4], [4, 21], [7.6, 17.6], [12.4, 14.6], [18, 11.8], [22.6, 9.8], [26, 9.4], [26.4, 11.4], [23.4, 14.6], [18.6, 18.2], [13, 21.4], [8, 23.8], [4.6, 25.4]]);
  seam(pc, fish, 'shadow');
  form(pc, fish, R, { cx: 12, cy: 16, rx: 14, ry: 8, bias: 0.06 });
  // scale rows, a gill arc, the eye and the open mouth
  fish.clone().erode(1).each((x, y) => { if ((x + y * 2) % 4 === 0 && (x - y + 40) % 3 === 0 && x > 8) step(pc, R, x, y, 1, 1, 5); });
  for (const [x, y] of [[8, 19], [9, 20], [9, 21], [8, 22]]) if (fish.get(x, y)) pc.set(x, y, R[5]);
  // a dorsal fin along the top edge
  const fin = loop([[11, 15.4], [13, 12], [17.4, 9.4], [18.4, 11.6]]);
  seam(pc, fin, 'shadow'); fin.each((x, y) => pc.set(x, y, R[(x + y) % 2 ? 3 : 4]));
  ink(pc);
  pc.set(5, 21, 0xf8f0e0); pc.set(6, 21, 0x1a1210); pc.set(2, 25, 0x3a2418);
  // coarse salt crystals: little cubes, a lit top and a shaded side
  for (const [x, y] of [[12, 16], [16, 14], [20, 12], [10, 20], [15, 18], [22, 13], [6, 28], [24, 27], [14, 27], [28, 24]]) { pc.set(x, y, 0xffffff); pc.set(x + 1, y, 0xdcd8d0); pc.set(x, y + 1, 0xc8c0b8); }
  glint(pc, 14, 15, 0);
}

function bread(pc) {
  // a crusty round boule on a striped linen cloth: cross-scored ears, flour dust, thyme flecks
  const CL = mat(0xece4d4, { cont: 1.05 });
  const cloth = loop([[1, 24, 1], [9, 19.4], [22, 19], [31, 22.6, 1], [27, 29.6, 1], [5, 30.4, 1]]);
  cloth.each((x, y) => { const st = ((x + 2 * y) % 9 < 2); pc.set(x, y, st ? (y > 26 ? 0xa83a32 : 0xc84a3a) : CL[y > 27 ? 3 : 2]); });
  cloth.edge().each((x, y) => { if (y > 26) pc.set(x, y, (x % 2) ? CL[4] : CL[3]); });
  const R = mat(0xd49650, { cont: 1.15, warm: 42 });
  const loaf = loop([[3.4, 19.4], [5, 13.6], [9.4, 8.6], [15.4, 6.6], [21.6, 7.6], [26.6, 11.6], [28.6, 17.2], [27.4, 22.4], [22.6, 25.4], [15.4, 26.2], [8.4, 25.2], [4.4, 22.8]]);
  seam(pc, loaf, 'shadow');
  form(pc, loaf, R, { cx: 13, cy: 12, rx: 14, ry: 12, bias: 0.05 });
  // the scores: two cuts that opened in the oven, a pale crumb ear with a dark lip
  const CR = mat(0xf2dcae, { cont: 1.05 });
  for (const [x0, y0, x1, y1] of [[8, 12, 22, 20], [9, 20, 22, 10]]) {
    line(pc, x0, y0, x1, y1, (i, X, Y) => {
      if (!loaf.get(X, Y) || isBot(loaf, X, Y)) return null;
      pc.set(X, Y + 1, R[5]);
      return CR[i % 4 === 0 ? 1 : 2];
    });
  }
  // flour dusting on the crown, thyme flecks
  loaf.each((x, y) => { const h = hash2(x, y, 23); if (h < 0.1 && y < 14) pc.set(x, y, 0xfaf2e2); else if (h > 0.95) pc.set(x, y, 0x5a7a3a); });
  ink(pc);
  glint(pc, 10, 9, 1, 0xfff4e0, R[0]);
  for (const [x, y] of [[29, 26], [3, 27], [26, 27]]) pc.set(x, y, 0xc8904a);
  steam(pc, 13, 6, 5, { a: 140 }); steam(pc, 19, 6, 5, { a: 120, phase: 2 });
}

function jamToast(pc) {
  // a thick slice of toast seen in 3/4: browned crust and cut side, jam spread to the edge and
  // dripping over it, a butter curl melting, two loose berries
  const BR = mat(0xd49a52, { cont: 1.15, warm: 44 });
  const side = loop([[3, 21.4], [3.6, 25.6], [15.6, 30.4], [28.6, 24.4], [28.4, 20.4], [16, 25.4]]);
  side.each((x, y) => pc.set(x, y, BR[x < 16 ? 3 : 4]));
  side.each((x, y) => { if (hash2(x, y, 4) < 0.3 && !isTop(side, x, y)) step(pc, BR, x, y, 1, 1, 5); });
  const top = loop([[3, 21.4], [5.6, 14.6], [4.4, 10.6], [7, 7.6], [11.4, 7.6], [14.4, 9.4], [17.6, 8.8], [21.4, 10.4], [24.6, 13.4], [28.4, 20.4], [16, 25.4]]);
  seam(pc, top, 'shadow');
  // crust ring, toasted face mottled
  const face = top.clone().erode(1);
  top.each((x, y) => pc.set(x, y, BR[face.get(x, y) ? 2 : (isTop(top, x, y) ? 3 : 4)]));
  face.each((x, y) => { const v = vnoise(x * 0.5, y * 0.5, 5); if (v > 0.66) pc.set(x, y, BR[3]); else if (v < 0.2) pc.set(x, y, BR[1]); });
  // the jam: a glossy, uneven layer, thicker in the middle, a few seeds, drips over the crust
  const J = mat(0xc8203a, { cont: 1.2 });
  const jam = loop([[6.6, 19], [8, 14.6], [7.4, 11.4], [10.4, 10.6], [14.4, 12.2], [19.4, 12.4], [23.4, 16.6], [25.4, 20.4], [19.6, 22], [15.6, 23.4], [11.4, 21.6]]);
  seam(pc, jam, J[5]);
  form(pc, jam, J, { bias: 0.08, dome: 0.5 });
  sheen(pc, jam, 0xff8aa0, { inset: 1, a0: -2.9, a1: -1.8, gap: 4 });
  for (const [x, y] of [[12, 15], [17, 18], [20, 17], [10, 18], [15, 14]]) pc.set(x, y, J[5]);
  for (const [x, y0, h] of [[13, 23, 3], [20, 22, 4]]) { for (let y = y0; y < y0 + h; y++) pc.set(x, y, J[y === y0 + h - 1 ? 3 : 2]); pc.set(x, y0 + h, J[4]); }
  // butter curl
  const BU = mat(0xffe27a, { cont: 0.95 });
  const bu = loop([[14, 13.4], [16.4, 11.6], [19, 12.2], [18.6, 14.4], [15.6, 15]]);
  seam(pc, bu, 'shadow'); form(pc, bu, BU, { bias: 0.12 });
  line(pc, 15, 14, 18, 13, BU[3]);
  ink(pc);
  for (const [x, y] of [[26, 27], [29, 28]]) { pc.set(x, y, J[2]); pc.set(x + 1, y, J[3]); pc.set(x, y + 1, J[4]); pc.set(x + 1, y + 1, J[5]); pc.set(x, y - 1, 0x1a0a0a); }
  glint(pc, 10, 12, 1, 0xffffff, 0xffb0c0);
  for (const [x, y] of [[2, 28], [6, 30]]) pc.set(x, y, BR[3]);
}

function jamJar(pc) {
  // an open jar of berry jam with a wooden spoon in it, a drip down the glass, a parchment label
  const G = mat(0xd8e4e8, { cont: 1.1, sat: 0.4 });
  const J = mat(0xc4284a, { cont: 1.18 });
  const jar = loop([[8, 8.6], [9, 7], [23, 7], [24, 8.6], [23.4, 11], [25.6, 13.6], [26.4, 18], [26, 25.4], [24.6, 29], [22, 30.2], [10, 30.2], [7.4, 29], [6, 25.4], [5.6, 18], [6.4, 13.6], [8.6, 11]]);
  form(pc, jar, J, { cx: 12, cy: 17, rx: 11, ry: 16, flatten: 0.8, dome: 0.2, bias: 0.04 });
  // the glass: a pale rim band at the neck, the jam stopping a little below it
  jar.each((x, y) => { if (y < 11) pc.set(x, y, G[y < 9 ? 2 : 3], 230); });
  for (let x = 9; x < 24; x++) { pc.set(x, 7, G[1]); if (jar.get(x, 11)) pc.set(x, 11, J[2]); }
  // jam surface seen through the mouth
  const surf = loop([[10, 8.4], [16, 7.6], [22, 8.4], [21, 9.8], [11, 9.8]]);
  surf.each((x, y) => pc.set(x, y, J[y < 9 ? 4 : 3]));
  // label: torn-edged parchment wrapped round the belly, a berry doodle
  const LB = mat(0xf2e6c8, { cont: 1.05 });
  const lb = loop([[7, 17.6, 1], [16, 16.8], [25.2, 17.6, 1], [25.4, 24.4, 1], [16, 25.4], [6.6, 24.4, 1]]);
  seam(pc, lb, 'shadow');
  lb.each((x, y) => pc.set(x, y, LB[x < 9 ? 2 : x > 22 ? 4 : 3]));
  lb.each((x, y) => { if (!lb.get(x, y - 1)) pc.set(x, y, LB[1]); });
  for (const [x, y, c] of [[14, 20, 0xc4284a], [15, 20, 0xc4284a], [16, 21, 0x9a1a3a], [14, 21, 0xa82040], [17, 20, 0xc4284a], [17, 19, 0x4a8a3a], [18, 18, 0x4a8a3a]]) pc.set(x, y, c);
  for (let x = 10; x < 23; x += 2) pc.set(x, 23, 0xb8a080);
  // the spoon, leaning out of the mouth
  const SP = mat(0xc89058, { cont: 1.12 });
  tube(pc, [[16, 9], [21, 3.6], [24.6, 0.6]], (s) => 0.9 + s * 0.3, SP, { capEnd: 0.1 });
  // a drip over the rim
  for (let y = 7; y < 15; y++) pc.set(9, y, J[y < 13 ? 2 : 3]);
  pc.set(9, 15, J[4]); pc.set(8, 14, J[3]);
  ink(pc, { minA: 150 });
  // glass highlights: a long streak on the left, a sparkle on the shoulder
  for (let y = 12; y < 28; y++) if (!lb.get(7, y) && y % 6) pc.set(7, y, 0xffd0dc);
  pc.set(8, 12, 0xffffff); pc.set(24, 26, J[2]);
  glint(pc, 22, 12, 1, 0xffffff, 0xffe0e8);
}

function frittata(pc) {
  // a deep two-eared pan holding a thick dino-egg frittata, one wedge already served
  const IR = mat(0x3c3840, { cont: 1.2 });
  const ears = loop([[1, 16.6], [3.4, 15.4], [5.4, 17], [3.4, 19]]).union(loop([[26.4, 15.6], [29.6, 14.4], [31, 16.6], [28.6, 18.6]]));
  const s = vessel(pc, IR, [[2.6, 17], [5, 13.4], [10, 11.6], [16, 11.2], [22, 11.6], [27, 13.4], [29.4, 17], [28.6, 21], [25, 24.6], [16, 26.4], [7, 24.6], [3.4, 21]],
    [[4.6, 17], [7.6, 14], [16, 12.8], [24.4, 14], [27.4, 17], [24.4, 20.4], [16, 21.6], [7.6, 20.4]], { extra: ears, wall: 0 });
  // the frittata fills the pan; a wedge cut out toward the front right shows its thick side and the pan floor
  const R = mat(0xf2c444, { cont: 1.12, warm: 50 });
  const cut = M().poly([[16.4, 16.6], [28, 15.6], [29, 22.6]]);
  const top = s.mouth.clone().erode(1).sub(cut);
  const face = M().poly([[16.4, 16.6], [26, 20.2], [26.4, 23], [16.4, 19.6]]).and(s.mouth).sub(top);
  // pan floor in the gap
  s.mouth.clone().and(cut).each((x, y) => pc.set(x, y, IR[y < 18 ? 4 : 3]));
  seam(pc, top, 'shadow');
  form(pc, top, R, { cx: 11, cy: 15, rx: 12, ry: 7, flatten: 0.6, bias: 0.06 });
  top.each((x, y) => { const h = hash2(x, y, 17); if (vnoise(x * 0.5, y * 0.6, 3) > 0.7 && !isTop(top, x, y)) pc.set(x, y, mix(R[3], 0xa8642a, 0.45)); else if (h > 0.93) pc.set(x, y, 0x4e8a3a); });
  // the cut side: crust top, fluffy middle with tuber cubes, browned base
  face.each((x, y) => { const u = (y + 0.5) - (16.6 + (x + 0.5 - 16.4) * 0.36); pc.set(x, y, u < 1 ? R[2] : u < 3.2 ? (hash2(x, y, 4) < 0.2 ? 0xe8d8b0 : R[3]) : R[5]); });
  for (const [x, y] of [[10, 15], [14, 13], [19, 14], [8, 18]]) { pc.set(x, y, 0xeee0b8); pc.set(x + 1, y, 0xc8b088); pc.set(x, y + 1, 0xb89a70); }
  ink(pc);
  sprig(pc, [[6, 16], [7.6, 13], [10, 10.4]], { n: 3, big: false });
  glint(pc, 8, 15, 0); glint(pc, 6, 13, 0);
  steam(pc, 12, 11, 7); steam(pc, 18, 10, 6, { phase: 2 });
}

function jerky(pc) {
  // four torn strips of drake jerky fanned out and tied with twine, cracked pepper on top
  const R = mat(0x8a3424, { cont: 1.15, warm: 10 });
  const STRIPS = [
    [[2.6, 17, 1], [7, 13.6], [14, 9.8], [21, 6], [26.6, 3.4], [28, 5.6], [24.4, 8.6], [17, 12.6], [9, 17.4], [4, 20.4, 1]],
    [[3.4, 23.4, 1], [10, 19], [17.4, 14.6], [24.6, 10.6], [29.6, 9.4, 1], [30, 12.4], [25, 15], [18, 19], [11, 23], [5.4, 26.4, 1]],
    [[6, 28.4, 1], [12.6, 24.6], [19.6, 20.6], [25, 18.6], [30, 17.6, 1], [30.4, 20.6], [26, 22.4], [19.4, 25.6], [12.4, 29], [7.6, 30.4, 1]],
  ];
  STRIPS.forEach((P, i) => {
    const m = loop(P);
    seam(pc, m, 'shadow');
    form(pc, m, R, { flatten: 0.6, dome: 0.4, bias: 0.04 + i * 0.02, tex: (x, y) => (vnoise(x * 0.9, y * 0.3, i + 2) - 0.5) * 0.7 });
    // torn fibres along the length, glossy salt-cured sheen spots
    marks(pc, m, R, { dens: 0.22, seed: i + 4, len: 4, dir: [0.85, -0.5], lit: false });
    m.each((x, y) => { if (hash2(x, y, i + 9) < 0.04 && !isBot(m, x, y)) pc.set(x, y, R[1]); });
  });
  // twine wrapped round the middle, knotted
  const TW = RAMPS.twine();
  const band = loop([[13.6, 12.4], [15.6, 11], [21, 26.6], [18.8, 28]]);
  seam(pc, band, 'shadow');
  band.each((x, y) => pc.set(x, y, TW[(y % 2) ? 2 : 3]));
  band.each((x, y) => { if (isBot(band, x, y)) pc.set(x, y, TW[4]); });
  ink(pc);
  strand(pc, [[15, 12], [12.6, 8], [10, 6.6], [8.6, 3.6]], TW[2]);
  strand(pc, [[15.6, 11.4], [17.6, 7.6], [17, 4.6]], TW[3]);
  for (const [x, y] of [[8, 16], [12, 13], [20, 9], [24, 7], [9, 21], [23, 13], [27, 12], [11, 26], [24, 20], [28, 19]]) { pc.set(x, y, 0x1a1210); pc.set(x + 1, y, 0x4a3a30); }
  glint(pc, 7, 15, 0);
}

function pesto(pc) {
  // a nest of glowing green noodles twirled on a fork, in a shallow speckled stoneware bowl
  const BW = mat(0x5a6a7a, { cont: 1.12 });
  const s = vessel(pc, BW, [[1.6, 17], [4, 14.4], [9, 13], [16, 12.6], [23, 13], [28, 14.4], [30.4, 17], [29.4, 20.6], [25.6, 24.6], [19.6, 27], [12.4, 27], [6.4, 24.6], [2.6, 20.6]],
    [[3.6, 17], [7, 15], [16, 14.2], [25, 15], [28.4, 17], [25.4, 19.4], [16, 20.4], [6.6, 19.4]], { band: [0xd8e0e8, 0.34] });
  s.body.each((x, y) => { if (hash2(x, y, 6) < 0.07) pc.set(x, y, 0x2a323e); });
  broth(pc, s, mat(0x3a8a3e, { cont: 1.05 }), { gloss: false, drops: 0, emit: 0.2 });
  // the nest: loops of noodle stacked into a swirl, each pass its own path
  const NR = mat(0x7ae07a, { cont: 1.1 });
  const LOOPS = [
    [[6, 18], [10, 15.4], [16, 15], [22, 15.6], [26, 18]],
    [[8, 16.6], [11, 13], [17, 12], [22.6, 13.6], [24, 16.6], [19, 18.6], [12, 18.4]],
    [[10, 14], [13, 10.4], [18, 10], [21.6, 12.4], [19.6, 15.2], [14, 15.6]],
    [[12.6, 12], [15, 8.6], [19, 9], [19.6, 11.6], [16, 13]],
  ];
  LOOPS.forEach((P, i) => {
    tube(pc, P, 0.95, NR, { bias: 0.06 - i * 0.02, emit: 0.35, capStart: 0.1, capEnd: 0.1 });
  });
  // the fork, tines buried in the nest, handle up and to the right
  const ST = RAMPS.steel();
  tube(pc, [[17.4, 9.6], [23, 4], [27.6, 0.6]], 0.85, ST, { capEnd: 0.1 });
  ink(pc);
  // grated cheese, pine nuts, glowing motes
  for (const [x, y] of [[12, 13], [17, 11], [20, 14], [9, 17], [23, 17]]) pc.set(x, y, 0xf8f0d8);
  for (const [x, y] of [[14, 16], [21, 12]]) { pc.set(x, y, 0xe8d0a0); pc.set(x + 1, y, 0xc8a878); }
  for (const [x, y] of [[5, 9], [27, 9], [11, 5]]) gl(pc, x, y, 0xc8ffb8, 0.9);
  glint(pc, 24, 3, 0);
}

function mash(pc) {
  // white enamel bowl with a chipped blue rim, a swirled heap of garlic mash, butter melting down it
  const EN = mat(0xe8eef2, { cont: 1.05, sat: 0.5 });
  const s = vessel(pc, EN, [[2.4, 18], [4.6, 15.4], [9.6, 14], [16, 13.6], [22.4, 14], [27.4, 15.4], [29.6, 18], [28.6, 21.6], [25, 25.6], [19, 28], [13, 28], [7, 25.6], [3.4, 21.6]],
    [[4.4, 18], [7.6, 16], [16, 15.2], [24.4, 16], [27.6, 18], [24.6, 20.4], [16, 21.2], [7.4, 20.4]], { wall: 1 });
  // blue rim with a chip showing the dark iron underneath
  s.lip.each((x, y) => pc.set(x, y, y < 18 ? 0x5a8ad0 : 0x3a64a8));
  for (const [x, y] of [[24, 20], [25, 20], [25, 19]]) pc.set(x, y, 0x2a2a34);
  s.body.each((x, y) => { if (y === 25 && x % 3) pc.set(x, y, mix(pc.getHex(x, y), 0x5a8ad0, 0.4)); });
  const R = mat(0xf2e2b4, { cont: 1.05 });
  const heap = loop([[5.6, 19.4], [7, 15.6], [10, 12.4], [13.6, 10.4], [16.4, 7.4], [18.4, 9.6], [22, 11], [25.4, 14.6], [26.4, 19.4], [22, 21.6], [16, 22], [9, 21.4]]);
  seam(pc, heap, 'shadow');
  form(pc, heap, R, { cx: 13, cy: 13, rx: 12, ry: 9, bias: 0.06 });
  // spoon-swirl ridges: crescents with a lit crest and a shaded trough
  for (const [cx, cy, r, a0, a1] of [[16, 15, 6, 3.4, 5.6], [15, 13, 3.6, 3.2, 6], [17, 18, 8, 3.6, 5.2]]) {
    for (let a = a0; a < a1; a += 0.06) {
      const x = Math.floor(cx + Math.cos(a) * r), y = Math.floor(cy + Math.sin(a) * r * 0.55);
      if (heap.get(x, y) && heap.get(x, y + 1) && !isTop(heap, x, y)) { pc.set(x, y, R[1]); pc.set(x, y + 1, R[4]); }
    }
  }
  // butter pat sliding, a pool running down, a roasted garlic clove, chives
  const BU = mat(0xffd84a, { cont: 1 });
  const pat = M().poly([[14.2, 8.6], [18, 7.8], [19, 10], [15.2, 10.8]]);
  seam(pc, pat, 'shadow');
  pat.each((x, y) => pc.set(x, y, y < 9 ? BU[1] : BU[2]));
  for (const [x, y0, y1] of [[16, 11, 15], [18, 11, 13]]) for (let y = y0; y <= y1; y++) pc.set(x, y, BU[y === y1 ? 3 : 2]);
  const GC = mat(0xd8a050, { cont: 1.1 });
  const gc = loop([[20.6, 15], [22.6, 13.6], [24.6, 14.4], [23.6, 16.6], [21.4, 16.8]]);
  seam(pc, gc, 'shadow'); form(pc, gc, GC, { bias: 0.08 });
  ink(pc);
  for (const [x, y] of [[9, 16], [12, 19], [20, 19], [11, 13]]) { pc.set(x, y, 0x4e9a3a); pc.set(x + 1, y, 0x3a7a30); }
  glint(pc, 7, 18, 0); glint(pc, 15, 8, 0);
  steam(pc, 11, 9, 6, { a: 150 }); steam(pc, 21, 9, 6, { a: 130, phase: 2 });
}

function tea(pc) {
  // a lumpy hand-thrown mug: cream glaze dipped over the dark clay, drips, a big ear handle,
  // thyme steeping in golden tea, honey on the rim
  const CLY = mat(0x7a4a32, { cont: 1.12 });
  const GLZ = mat(0xe8dcc4, { cont: 1.08 });
  const handle = loop([[22.6, 12.6], [26.6, 11.4], [29.6, 13.6], [30, 18], [27.6, 22], [23.4, 24]]).sub(loop([[23.6, 15], [26.4, 14.4], [27.6, 16.6], [26.4, 19.4], [23.6, 20.6]]));
  seam(pc, handle, 'shadow');
  form(pc, handle, GLZ, { bias: 0.04 });
  const cup = loop([[5.4, 10.6], [8, 8.4], [15, 7.6], [21.6, 8.4], [24, 10.6], [24.4, 16], [23.6, 22], [24.2, 26.4], [22.4, 29], [15, 29.8], [7.6, 29], [5.6, 26.4], [6.2, 22], [5.4, 16]]);
  seam(pc, cup, 'shadow');
  const K = form(pc, cup, GLZ, { cx: 11, cy: 14, rx: 11, ry: 18, flatten: 0.7, dome: 0.2, bias: 0.06 });
  // bare clay foot below a wavy dip line, with glaze drips running into it
  cup.each((x, y) => {
    const lv = 23.4 + Math.sin(x * 0.9) * 0.6 + (x === 9 || x === 17 || x === 20 ? 2.4 : 0) + (x === 13 ? 1.4 : 0);
    if (y + 0.5 > lv) pc.set(x, y, CLY[clamp(K[y * 32 + x], 1, 5)]);
    else if (y + 0.5 > lv - 1) pc.set(x, y, GLZ[clamp(K[y * 32 + x] + 1, 1, 5)]);
  });
  const mouth = loop([[7, 10.6], [9.4, 9.2], [15, 8.8], [20.6, 9.2], [22.6, 10.6], [20.6, 12], [15, 12.4], [9.4, 12]]);
  mouth.each((x, y) => pc.set(x, y, y < 10 ? GLZ[4] : 0xc8a050));
  mouth.clone().erode(1).each((x, y) => pc.set(x, y, x < 12 ? 0xe8c870 : 0xc8a050));
  // honey dribble on the rim
  for (let y = 10; y < 15; y++) pc.set(20, y, y < 14 ? 0xf2a020 : 0xc87818);
  ink(pc);
  sprig(pc, [[14, 11], [12.6, 7], [11, 3.6], [10.6, 1.6]], { n: 4 });
  glint(pc, 8, 14, 1, 0xffffff, GLZ[0]);
  steam(pc, 17, 8, 7); steam(pc, 7, 8, 5, { phase: 3, a: 140 });
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
