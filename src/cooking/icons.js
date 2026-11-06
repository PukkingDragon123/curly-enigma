// 32×32 item icons for the new cave ingredients and Old Star's dishes (spec { k: 'cook', t, c }).
// Hand-pixel style on top of lifeKit / gearKit, like food.js: every piece gets its own hand-built
// outline (lifeKit.loop control points, no stamped circles or shared silhouettes), a few flat
// planes lit from the top-left, seams where parts overlap, a hue-tinted ink outline, rim light,
// glints, steam, and thin details (stalks, root hairs, legs) laid over the ink so they stay
// 1px. gfx/PixelArt.js calls drawCookIcon.
import {
  M, mat, mix, hash2, vnoise, step, ink, seam, glint, line, gl, clamp, isTop, isBot, loop, fringe, form, sheen, marks, bumps,
  blade, tube, spline, steam, twinkle, RAMPS,
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
  // a knobbly tunnel tuber: lumpy skin pitted with eyes and clinging soil, a thin pale sprout,
  // a straggly root tail, a smaller tuber still attached behind it
  const R = mat(0xb88c5a, { cont: 1.12, warm: 42 });
  const R2 = mat(0xa87e52, { cont: 1.1, warm: 40 });
  const baby = loop([[19.6, 8.6], [22.4, 5.6], [26, 5], [28.4, 7], [28.2, 10.4], [25.6, 12.4], [21.6, 12]]);
  seam(pc, baby, 'shadow');
  form(pc, baby, R2, { bias: 0.04 });
  bumps(pc, baby, R2, { dens: 0.12, seed: 2 });
  const t = loop([[3.4, 22], [4.4, 17.6], [7.4, 14.6], [11, 14], [13.6, 11.8], [17.6, 11], [21, 10.6], [24.6, 11.6], [27.4, 14], [28, 17.4], [26.4, 20.2], [24.4, 21], [22.6, 23.4], [18.4, 25], [14.6, 27.4], [10, 28.6], [6, 27.8]]);
  seam(pc, t, 'shadow');
  form(pc, t, R, { cx: 13, cy: 16, rx: 14, ry: 10, bias: 0.04, tex: (x, y) => (vnoise(x * 0.45, y * 0.45, 9) - 0.5) * 0.45 });
  bumps(pc, t, R, { dens: 0.08, seed: 4 });
  t.clone().erode(1).each((x, y) => { if (vnoise(x * 0.35 + 4, y * 0.35, 3) > 0.72) pc.set(x, y, hash2(x, y, 2) < 0.5 ? 0x5e4028 : 0x76553a); });
  // eyes: small sunken pits, a shadow pixel with a lit lower lip
  for (const [x, y] of [[8, 20], [14, 16], [20, 21], [12, 25], [24, 15], [18, 14]]) { pc.set(x, y, R[5]); pc.set(x + 1, y + 1, R[1]); }
  ink(pc);
  // a thin sprout from the top eye, two tiny leaves, root hairs and the stolon joining the two
  strand(pc, [[18, 13], [17.4, 9], [15.4, 6], [13, 4.6]], (s) => (s < 0.7 ? 0xe8e0d0 : 0xc8a8e0));
  strand(pc, [[19, 13], [18.4, 9], [16.4, 6.4]], 0xb8ac9c);
  pc.set(16, 6, 0x8ac06a); pc.set(15, 5, 0x6aa04a); pc.set(18, 9, 0x8ac06a); pc.set(19, 9, 0x6aa04a);
  for (const P of [[[5, 27.4], [2.6, 29], [1.4, 31]], [[8, 28.6], [7, 30.6]], [[27.6, 18], [29.6, 19.6], [30.4, 22]], [[28.4, 9], [30.4, 8], [31, 5.6]]]) strand(pc, P, 0x7a5a3e);
  glint(pc, 10, 17, 0); pc.set(17, 13, R[1]); pc.set(23, 7, R2[1]);
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
  // a lumpy cushion of glow moss peeled off the cave wall and slumped over a stone, tongues of it
  // hanging down the front, its pile speckled with soft glowing points
  const RK = mat(0x6a645e, { cont: 1.12 });
  const rock = loop([[4.6, 25], [7.6, 21], [14, 19.6], [21.6, 19.8], [26.6, 22], [28.6, 26], [26, 29.6], [16, 30.6], [7.6, 29.8], [4.4, 27.6]]);
  form(pc, rock, RK, { bias: 0.04, dome: 0.3 });
  marks(pc, rock, RK, { dens: 0.12, seed: 4, len: 3, dir: [1, 0.2] });
  const R = mat(0x4cb45e, { cont: 1.15 });
  const cush = loop([[2.4, 20.4], [3.6, 16.8], [6.6, 14.8], [8.4, 11.8], [11.8, 11], [13.8, 8.8], [17.4, 8.4], [19.8, 10.2], [23, 9.8], [26.2, 11.8], [27.6, 14.8], [29.6, 17], [29.4, 20.8], [27.6, 22.6], [26.6, 26.4], [24.8, 23.8], [21.4, 24.4], [19.6, 27.6], [17.8, 24.2], [13.6, 25], [11.6, 27.8], [10.2, 24.4], [6.6, 24.4], [4.4, 22.8]]);
  const m = fringe(cush, 16, 18, { dens: 0.45, seed: 3, len: 1.4, lean: 0.3, only: (x, y) => y < 15 });
  seam(pc, m, 'shadow');
  form(pc, m, R, { cx: 13, cy: 13, rx: 15, ry: 11, bias: 0.04, emit: (x, y, k) => (k <= 2 ? 0.4 : 0.12) });
  // creases between the lumps, running down from the dips in the top edge
  for (const [x0, y0, x1, y1] of [[13, 10, 11, 17], [20, 11, 21, 17], [8, 13, 6, 19], [26, 12, 26, 17]]) line(pc, x0, y0, x1, y1, (i, X, Y) => (i && m.get(X, Y) && !isBot(m, X, Y) ? (step(pc, R, X, Y, 1, 1, 5), step(pc, R, X + 1, Y, -1, 1, 5), null) : null));
  bumps(pc, m, R, { dens: 0.3, seed: 7 });
  // the tongues: darker undersides as the moss rolls over the stone's edge
  m.each((x, y) => { if (!m.get(x, y + 1)) { pc.set(x, y, R[5]); if (m.get(x, y - 1) && y > 22) pc.set(x, y - 1, R[4]); } });
  ink(pc);
  m.clone().erode(1).each((x, y) => { const h = hash2(x, y, 13); if (h < 0.07) gl(pc, x, y, h < 0.03 ? 0xf0ffe0 : 0xb8ffa8, 1); });
  m.each((x, y) => { if (!m.get(x, y - 1) && hash2(x, y, 11) < 0.35) gl(pc, x, y, 0xc8ffb8, 0.9); });
  for (const [x, y0, h] of [[12, 28, 2], [20, 28, 3], [27, 27, 2]]) { for (let i = 0; i < h; i++) pc.set(x, y0 + i, 0x2e6a3a); gl(pc, x, y0 + h, 0xd8ffc8, 1); }
  for (const [x, y] of [[5, 7], [24, 5], [30, 11], [2, 13]]) gl(pc, x, y, 0xc8ffc0, 0.8);
  twinkle(pc, 10, 5, 0xffffff, 0xb8ffb0, 1, 0.9);
}

function grub(pc) {
  // a fat cave grub curled into a tight C: creased segments, a dark gut showing through at the
  // rear, a glossy amber head with mandibles and three pairs of tiny legs, a crumb of soil
  const R = mat(0xf2e0be, { cont: 1.1, warm: 46 });
  const HR = mat(0xd07a2a, { cont: 1.15, warm: 40 });
  const SO = mat(0x5e4430, { cont: 1.08 });
  const soil = loop([[15.6, 29.6], [19, 27.6], [24.6, 27.2], [29.6, 28.6], [28.4, 31.2], [18, 31.4]]);
  form(pc, soil, SO, { bias: 0.06 });
  bumps(pc, soil, SO, { dens: 0.35, seed: 3 });
  const P = [];
  for (let i = 0; i <= 8; i++) { const a = -0.72 - i * (4.7 / 8), r = 7.6 - Math.abs(i - 4) * 0.12; P.push([14.6 + Math.cos(a) * r * 1.02, 16.6 + Math.sin(a) * r]); }
  const sw = tube(pc, P, (s) => 2.8 + Math.sin(Math.min(1, s * 1.08) * Math.PI) * 2.6, R, { bias: 0.04 });
  for (let i = 0; i < 1024; i++) {
    if (!sw.mask.m[i]) continue;
    const s = sw.S[i], f = (s * 12) % 1, x = i % 32, y = (i / 32) | 0;
    if (s < 0.24 && !isTop(sw.mask, x, y) && !isBot(sw.mask, x, y)) pc.set(x, y, mix(pc.getHex(x, y), 0x6a5a6e, 0.38 * (1 - s / 0.24)));
    if (isTop(sw.mask, x, y) || isBot(sw.mask, x, y)) continue;
    if (f < 0.14) step(pc, R, x, y, 2, 1, 5);
    else if (f < 0.3) step(pc, R, x, y, -1, 1, 5);
  }
  const [hx, hy] = sw.at(1);
  const head = loop([[hx - 3, hy - 1], [hx - 0.6, hy - 3.4], [hx + 2.4, hy - 2.6], [hx + 3.6, hy + 0.4], [hx + 2.4, hy + 3.2], [hx - 0.6, hy + 3], [hx - 2.6, hy + 1.4]]);
  seam(pc, head, 'shadow');
  form(pc, head, HR, { bias: 0.06 });
  ink(pc);
  const mx = Math.round(hx + 3), my = Math.round(hy + 2);
  pc.set(mx, my, 0x2a120a); pc.set(mx + 1, my, 0x4a200e); pc.set(mx, my + 1, 0x2a120a);
  for (let k = 0; k < 3; k++) {
    const [x, y] = sw.at(0.86 - k * 0.07), [x2, y2] = sw.at(0.87 - k * 0.07);
    const a = Math.atan2(y2 - y, x2 - x), nx = -Math.sin(a), ny = Math.cos(a);
    for (const d of [3.6, 4.6]) { const X = Math.floor(x - nx * d), Y = Math.floor(y - ny * d); if (!sw.mask.get(X, Y)) pc.set(X, Y, d < 4 ? 0xb87038 : 0x8a4a20); }
  }
  for (let s = 0.2; s < 0.8; s += 0.085) { const [x, y] = sw.at(s), [x2, y2] = sw.at(s + 0.01); const a = Math.atan2(y2 - y, x2 - x); const X = Math.floor(x - Math.sin(a) * -2.6), Y = Math.floor(y + Math.cos(a) * -2.6); if (sw.mask.get(X, Y) && !isTop(sw.mask, X, Y) && !isBot(sw.mask, X, Y)) pc.set(X, Y, 0xc0905e); }
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
  // a thumb-pressed earthenware bowl of mushroom stew: sliced caps, a thyme sprig, steam
  const CL = mat(0xa8603a, { cont: 1.12 });
  const s = vessel(pc, CL, [[2.6, 14.6], [4.6, 12], [9, 10.6], [16, 10.2], [23, 10.8], [27.6, 12.2], [29.6, 14.8], [28.8, 18.4], [26, 22.6], [22, 25.6], [21.4, 27.6, 1], [11, 27.8, 1], [10.6, 25.6], [6.4, 22.6], [3.4, 18.4]],
    [[4.6, 14.4], [7.6, 12.6], [13, 11.8], [19, 11.8], [24.4, 12.4], [27.6, 14.4], [26, 16.6], [21, 18], [15.6, 18.2], [10, 17.8], [5.8, 16.4]], { band: [0xe8c890, 0.4] });
  for (let x = 5; x < 28; x += 3) { const y = x > 8 && x < 25 ? 19 : 18; if (s.body.get(x, y) && !isBot(s.body, x, y)) { step(pc, CL, x, y, 1, 1, 5); step(pc, CL, x + 1, y, -1, 1, 5); } }
  broth(pc, s, mat(0xa06a38, { cont: 1.08 }), { seed: 4, drops: 2 });
  // mushroom slices: the cap-and-stem profile, standing up out of the stew at odd angles
  const MR = mat(0xeedcbc, { cont: 1.05 });
  const SLICES = [
    [[5.4, 13.6], [6.6, 10.6], [9.4, 9.4], [12.2, 10.4], [13, 13], [10.8, 13.2], [10.6, 15.6], [8.2, 15.8], [8, 13.6]],
    [[13.6, 12], [15.6, 8.8], [18.8, 8.2], [21.2, 10], [21.6, 12.6], [19, 12.6], [18.6, 15.2], [16.4, 15.4], [16.2, 12.6]],
    [[19.6, 15], [21.4, 12.8], [24, 12.6], [26, 14], [26.2, 16], [24, 16.2], [23.8, 17.6], [22, 17.6], [21.8, 16]],
  ];
  SLICES.forEach((P, i) => {
    const m = loop(P);
    seam(pc, m, 'shadow');
    chip(pc, m, MR, 2);
    const b = m.bounds();
    // brown cap skin over the top, a gill line under the cap
    m.each((x, y) => { if (!m.get(x, y - 1) || (!m.get(x, y - 2) && y < b.y0 + 2)) pc.set(x, y, i === 1 ? 0x8a5a34 : 0x7a4a2c); });
    const gy = Math.round(P[5][1]) - 1;
    for (let x = b.x0 + 1; x < b.x1; x++) if (m.get(x, gy) && m.get(x, gy - 1) && !isBot(m, x, gy)) pc.set(x, gy, MR[4]);
  });
  ink(pc);
  sprig(pc, [[24, 14], [26, 10], [28, 6.6], [29.4, 4.6]], { n: 4 });
  steam(pc, 11, 8, 7); steam(pc, 17, 7, 7, { phase: 2 });
  glint(pc, 7, 20, 0);
}

function trufOmelette(pc) {
  // a soft folded omelette on a blue-rimmed stoneware plate, black truffle shaved over it
  const PL = mat(0xece4d4, { cont: 1.05 });
  platter(pc, PL, [[1.4, 21.4], [3.6, 17.8], [9, 15.8], [16, 15.2], [23.6, 15.8], [28.6, 17.8], [30.6, 21], [29, 24.6], [23, 27.4], [15.6, 28.2], [8, 27.4], [3.2, 25]],
    [[5.6, 21.4], [9, 18.6], [16, 17.8], [23, 18.4], [26.8, 21.2], [24.4, 24], [16, 25.2], [8.6, 24.4]], { trim: 0x3a6ab0 });
  const R = mat(0xffd24a, { cont: 1.1, warm: 52 });
  // half-moon: the rounded edge at the back, the folded edge running across the front
  const om = loop([[6, 21.4], [6.4, 17.4], [8.6, 13.6], [12.4, 11.2], [17, 10.6], [21.4, 11.6], [24.6, 14.4], [26.2, 18.4], [25.6, 21.4], [21, 22.6], [15, 23], [9.6, 22.6]]);
  seam(pc, om, 'shadow');
  form(pc, om, R, { cx: 13, cy: 14, rx: 12, ry: 9, bias: 0.06 });
  om.each((x, y) => { if (vnoise(x * 0.5, y * 0.7, 4) > 0.7 && !isTop(om, x, y) && !isBot(om, x, y) && y < 19) pc.set(x, y, mix(R[3], 0xb8742a, 0.5)); });
  // the fold: a soft rolled lip with a crease under it
  for (let x = 7; x < 26; x++) { const y = Math.round(20.4 - Math.sin((x - 7) / 19 * Math.PI) * 0.8); if (om.get(x, y + 1)) { pc.set(x, y, R[1]); pc.set(x, y + 1, R[3]); if (om.get(x, y + 2)) pc.set(x, y + 2, R[4]); } }
  // truffle shavings: thin curled slices, dark with pale marbling, a lit edge
  for (const P of [[[9.4, 15.4], [11.6, 13.4], [14, 13.8], [12.4, 15.8]], [[15.6, 13], [18.4, 12.2], [19.6, 13.6], [16.8, 14.6]], [[18.6, 17], [21.6, 15.8], [23.2, 17], [20.2, 18.4]], [[12.4, 18.2], [15, 17], [16.6, 18], [13.6, 19.2]]]) {
    const m = loop(P);
    seam(pc, m, 'shadow');
    m.each((x, y) => pc.set(x, y, isTop(m, x, y) ? 0x6a5040 : (x * 2 + y) % 3 ? 0x3a2620 : 0xb8a090));
  }
  ink(pc);
  for (const [x, y] of [[11, 12], [21, 14], [17, 19]]) { pc.set(x, y, 0x5aa84a); pc.set(x + 1, y, 0x3a7a3a); }
  glint(pc, 9, 14, 1, 0xffffff, R[0]);
  steam(pc, 14, 9, 6, { a: 150 });
}

function rootPie(pc) {
  // a closed root-vegetable pie in a fluted tin: a domed, egg-washed lid with a deep crimped rim,
  // pastry leaves, three steam slits with orange filling peeking through
  const TN = mat(0x9aa0a8, { cont: 1.2 });
  const tin = loop([[1.4, 19.6], [3.6, 16.4], [9, 14.6], [16, 14], [23, 14.6], [28.6, 16.4], [30.6, 19.6], [29.6, 24], [25, 27.6], [16, 29], [7, 27.6], [2.4, 24]]);
  tin.each((x, y) => pc.set(x, y, TN[y > 25 ? 4 : x % 2 ? 2 : 3]));
  tin.each((x, y) => { if (!tin.get(x, y + 1)) pc.set(x, y, TN[5]); });
  const CR = mat(0xd8aa66, { cont: 1.08, sat: 0.9 });
  const top = loop([[2.6, 18.4], [5.4, 13.6], [10.4, 10.4], [16, 9.4], [22, 10.2], [26.8, 13], [29.4, 17.8], [27.6, 22], [22.4, 24.6], [16, 25.4], [9.4, 24.6], [4.4, 22.2]]);
  seam(pc, top, 'shadow');
  form(pc, top, CR, { cx: 12, cy: 13, rx: 15, ry: 11, bias: 0.06, lo: 1, hi: 4 });
  // egg-wash: glossy golden patches on the crown
  top.clone().erode(3).each((x, y) => { if (vnoise(x * 0.4, y * 0.5, 6) > 0.7) pc.set(x, y, mix(pc.getHex(x, y), 0xc8862e, 0.25)); });
  const rim = top.clone().sub(top.clone().erode(2));
  rim.each((x, y) => { const a = Math.atan2(y + 0.5 - 17.4, (x + 0.5 - 16) * 0.7), f = ((a * 15 / (Math.PI * 2)) % 1 + 1) % 1; pc.set(x, y, CR[f < 0.55 ? (isTop(top, x, y) ? 1 : 2) : 3]); });
  // pastry leaves
  const LV = mat(0xf4dcae, { cont: 1.1 });
  blade(pc, 6.4, 18, 12.6, 12.6, 2.6, LV, { bend: 1.4, veins: 1, rib: LV[3], bias: 0.16, fold: 0.45, lo: 1, hi: 3 });
  blade(pc, 25.6, 18.6, 19.6, 13, 2.4, LV, { bend: -1.4, veins: 1, rib: LV[3], bias: 0.16, fold: 0.45, lo: 1, hi: 3 });
  // steam slits: dark cuts with a lit lip, filling glowing deep inside
  for (const [x0, y0] of [[12, 19], [15, 16], [18, 19]]) {
    line(pc, x0, y0, x0 + 2, y0 - 2, (i, X, Y) => { pc.set(X, Y + 1, CR[1]); return i === 1 ? 0xd8642a : 0x5a3018; });
  }
  ink(pc);
  glint(pc, 8, 13, 0); pc.set(11, 11, CR[0]);
  steam(pc, 13, 15, 7); steam(pc, 19, 14, 7, { phase: 3 }); steam(pc, 16, 12, 5, { phase: 1.4, a: 130 });
}

function fishPie(pc) {
  // stargazy pie: a deep clay dish, a golden domed crust, three fish heads poking up through it
  // to look at the ceiling, each with an open mouth, a big eye and a gill slit
  const DSH = mat(0xb0603a, { cont: 1.12 });
  vessel(pc, DSH, [[1.6, 20.6], [4, 18], [9, 16.6], [16, 16.2], [23, 16.6], [28, 18], [30.4, 20.6], [30, 24.2], [27, 27.6], [21, 29.6], [11, 29.6], [5, 27.6], [2, 24.2]],
    [[3.6, 20.6], [7, 18.8], [16, 18], [25, 18.8], [28.4, 20.6], [25, 22.6], [16, 23.4], [7, 22.6]], { band: [0xf0d8a0, 0.5], wall: 0 });
  const CR = mat(0xe4b874, { cont: 1.08, warm: 40, sat: 0.85 });
  // the lid domes well above the dish, its crimped edge sitting on the rim
  const crust = loop([[3.2, 20.6], [4.6, 16.6], [8.4, 13.4], [13, 11.8], [19, 11.8], [23.6, 13.4], [27.4, 16.6], [28.8, 20.6], [25.6, 22.8], [16, 23.6], [6.4, 22.8]]);
  seam(pc, crust, 'shadow');
  form(pc, crust, CR, { cx: 12, cy: 15, rx: 15, ry: 9, bias: 0.12, lo: 1, hi: 4 });
  bumps(pc, crust, CR, { dens: 0.08, seed: 3 });
  crust.each((x, y) => { if (!crust.get(x, y + 1) || !crust.get(x, y + 2)) { const f = (x * 0.7) % 2; pc.set(x, y, CR[f < 1 ? 1 : 3]); } });
  const FR = mat(0xb4c4d4, { cont: 1.22 });
  const BK = mat(0x3e5a7a, { cont: 1.15 });
  // a head in local coords (u across, v up from the crust), rotated by a and placed at (x, y)
  const HEAD = [[-2.8, 0.4], [-3, 3.4], [-2.4, 6.2], [-1.2, 8.4], [0, 9.6, 1], [1.2, 8.4], [2.4, 6], [3, 3.2], [2.8, 0.4]];
  const place = (x, y, a, k) => [x + k[0] * Math.cos(a) + k[1] * Math.sin(a), y + k[0] * Math.sin(a) - k[1] * Math.cos(a)];
  [[9, 17.4, -0.42, 0.9], [16, 16.2, 0.04, 1.05], [23, 17.6, 0.46, 0.92]].forEach(([x, y, a, sz], i) => {
    const P = HEAD.map(([u, v, c]) => [...place(x, y, a, [u * sz, v * sz]), c]);
    const m = loop(P);
    seam(pc, m, 'shadow');
    // dark back on the side away from the light, a silver cheek, a lit stripe along the lateral line
    m.each((X, Y) => {
      const lx = (X + 0.5 - x) * Math.cos(a) + (Y + 0.5 - y) * Math.sin(a);
      const k = lx < -1.4 ? 1 : lx < 0.4 ? 2 : lx < 1.6 ? 3 : -1;
      pc.set(X, Y, k < 0 ? BK[isBot(m, X, Y) ? 4 : 3] : FR[isTop(m, X, Y) && k > 1 ? k - 1 : k]);
    });
    // gill slit, eye, open mouth at the tip
    const g = [place(x, y, a, [-1.6 * sz, 3 * sz]), place(x, y, a, [0, 2.6 * sz]), place(x, y, a, [1.6 * sz, 3.2 * sz])];
    for (const [gx, gy] of g) if (m.get(gx, gy)) pc.set(gx, gy, FR[5]);
    const [ex, ey] = place(x, y, a, [-0.6 * sz, 6.4 * sz]);
    pc.set(ex - 1, ey, 0xfff8e8); pc.set(ex, ey, 0x0e0a14); pc.set(ex, ey + 1, 0x2a2a3a);
    const [mx, my] = place(x, y, a, [0, 9 * sz]);
    pc.set(mx, my, 0x2a1420); pc.set(mx, my + 1, 0x5a2a34);
    // crust collar bubbling round the neck
    for (let u = -3.6; u <= 3.6; u += 0.5) { const [cx, cy] = place(x, y, a, [u * sz, -0.4]); if (crust.get(cx, cy) && !m.get(cx, cy)) pc.set(cx, cy, CR[(Math.round(u * 2) + i) % 2 ? 1 : 3]); }
    void i;
  });
  ink(pc);
  glint(pc, 6, 16, 0);
  steam(pc, 5, 14, 6, { a: 150 }); steam(pc, 27, 14, 6, { a: 150, phase: 2 });
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
  const SL = mat(0xe6e2dc, { cont: 1.08, sat: 0.4, cool: 220 });
  const heap = loop([[2.4, 27.4], [4.6, 24.6], [8.6, 22.6], [13, 20.2], [17.6, 19.4], [22, 20.4], [26, 22.2], [29.2, 24.6], [30.6, 27.6], [27, 29.8], [17, 30.6], [6.4, 30]]);
  form(pc, heap, SL, { cx: 14, cy: 22, rx: 15, ry: 9, bias: -0.02, dome: 0.6 });
  // coarse crystals all over the heap: small cubes, a lit top and a shaded side, a few loose ones
  heap.clone().erode(1).each((x, y) => { if (hash2(x, y, 5) < 0.24 && heap.get(x + 1, y + 1)) { pc.set(x, y, 0xffffff); pc.set(x + 1, y, SL[3]); pc.set(x, y + 1, SL[5]); } });
  const R = mat(0xd4a868, { cont: 1.15, warm: 40 });
  const tail = loop([[24.6, 9.6], [27.4, 4.4], [29.8, 2.6], [29, 6.6, 1], [30.6, 9.6], [28.4, 11.6]]);
  seam(pc, tail, 'shadow');
  form(pc, tail, R, { bias: 0.04 });
  for (let k = 0; k < 3; k++) line(pc, 26, 9, 29 - k * 0.4, 4 + k * 2.6, (i, X, Y) => (i > 1 && tail.get(X, Y) ? R[4] : null));
  const fish = loop([[2.6, 24.4], [4, 21], [7.6, 17.6], [12.4, 14.6], [18, 11.8], [22.6, 9.8], [26, 9.4], [26.4, 11.4], [23.4, 14.6], [18.6, 18.2], [13, 21.4], [8, 23.8], [4.6, 25.4]]);
  seam(pc, fish, 'shadow');
  form(pc, fish, R, { cx: 12, cy: 16, rx: 14, ry: 8, bias: 0.06 });
  // the pale salted belly, scale rows, the gill arc
  fish.each((x, y) => { const v = (y + 0.5) - (24 - (x + 0.5) * 0.62); if (v > -1.2 && !isBot(fish, x, y)) pc.set(x, y, mix(pc.getHex(x, y), 0xf4ead4, 0.55)); });
  fish.clone().erode(1).each((x, y) => { if ((x + y * 2) % 4 === 0 && (x - y + 40) % 3 === 0 && x > 8) step(pc, R, x, y, 1, 1, 5); });
  for (const [x, y] of [[8, 19], [9, 20], [9, 21], [8, 22]]) if (fish.get(x, y)) pc.set(x, y, R[5]);
  const fin = loop([[11, 15.4], [13, 12], [17.4, 9.4], [18.4, 11.6]]);
  seam(pc, fin, 'shadow'); fin.each((x, y) => pc.set(x, y, R[(x + y) % 2 ? 3 : 4]));
  ink(pc);
  pc.set(5, 21, 0xf8f0e0); pc.set(6, 21, 0x1a1210); pc.set(2, 25, 0x3a2418);
  for (const [x, y] of [[12, 16], [16, 14], [20, 12], [10, 20], [15, 18], [22, 13]]) { pc.set(x, y, 0xffffff); pc.set(x + 1, y, 0xe0dcd8); pc.set(x, y + 1, 0xc0bab4); }
  glint(pc, 14, 15, 0); glint(pc, 24, 23, 0);
}

function bread(pc) {
  // a crusty round boule on a blue gingham napkin: cross-scored ears, flour dust, thyme flecks
  const NP = mat(0xe8eef4, { cont: 1.05 });
  const nap = loop([[0.6, 24.6, 1], [6, 19.6], [16, 18.4], [27.6, 19.2], [31.4, 23.6, 1], [28.6, 28.6], [21.6, 30.6, 1], [4.4, 30.2, 1]]);
  nap.each((x, y) => {
    const u = Math.floor((x + y * 0.4) / 2), v = Math.floor(y / 2);
    const c = (u % 2) + (v % 2);
    pc.set(x, y, c === 2 ? 0x3a62a8 : c === 1 ? 0x8aa6d4 : NP[y > 27 ? 3 : 2]);
  });
  nap.each((x, y) => { if (!nap.get(x, y + 1)) pc.set(x, y, 0x2a4278); });
  const R = mat(0xd89a52, { cont: 1.15, warm: 42 });
  const loaf = loop([[3.6, 18.6], [5, 12.6], [9.4, 7.4], [15.4, 5.4], [21.6, 6.4], [26.6, 10.6], [28.6, 16.6], [27.4, 21.6], [22.6, 24.6], [15.4, 25.4], [8.4, 24.4], [4.6, 22]]);
  seam(pc, loaf, 'shadow');
  form(pc, loaf, R, { cx: 13, cy: 11, rx: 14, ry: 12, bias: 0.04 });
  // the scores opened in the oven: a pale crumb ear with a dark lip under it
  const CRM = mat(0xf6e2b4, { cont: 1.05 });
  for (const [x0, y0, x1, y1] of [[8, 9.6, 22, 19], [9.4, 19, 23, 9]]) {
    line(pc, x0, y0, x1, y1, (i, X, Y) => {
      if (!loaf.get(X, Y) || isBot(loaf, X, Y) || isTop(loaf, X, Y)) return null;
      if (loaf.get(X, Y + 1)) pc.set(X, Y + 1, R[5]);
      if (loaf.get(X, Y - 1) && i % 2) pc.set(X, Y - 1, CRM[2]);
      return CRM[i % 3 === 0 ? 1 : 2];
    });
  }
  loaf.each((x, y) => { const h = hash2(x, y, 23); if (h < 0.12 && y < 13 && !isTop(loaf, x, y)) pc.set(x, y, 0xfaf2e2); else if (h > 0.96) pc.set(x, y, 0x5a7a3a); });
  ink(pc);
  glint(pc, 10, 8, 1, 0xfff4e0, R[0]);
  for (const [x, y] of [[29, 27], [3, 28], [26, 29]]) pc.set(x, y, 0xc8904a);
  steam(pc, 12, 5, 5, { a: 140 }); steam(pc, 19, 5, 5, { a: 120, phase: 2 });
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
  // an open, round-bellied jar of berry jam: a wooden spoon in it, a drip down the glass, a label
  const G = mat(0xd8e4e8, { cont: 1.1, sat: 0.4 });
  const J = mat(0xc4284a, { cont: 1.18 });
  const jar = loop([[8.8, 9.2], [9.4, 6.8], [22.6, 6.6], [23.2, 9], [22.6, 11], [25.4, 13.2], [27, 17.4], [26.8, 23.6], [25.2, 27.8], [21.6, 30], [10.4, 30.2], [6.8, 28], [5.2, 23.6], [5.2, 17.4], [6.8, 13.2], [9.4, 11]]);
  form(pc, jar, J, { cx: 12, cy: 17, rx: 11, ry: 15, bias: 0.04 });
  // the glass neck: threads round the mouth, the jam stops just below them
  jar.each((x, y) => { if (y < 11) pc.set(x, y, y === 7 ? G[1] : (y % 2 ? G[2] : G[3]), 235); });
  for (let x = 10; x < 23; x++) if (jar.get(x, 11)) pc.set(x, 11, J[2]);
  const LB = mat(0xf2e6c8, { cont: 1.05 });
  const lb = loop([[6, 17.2], [11, 16.4], [16, 16.8], [21, 16.2], [26.4, 17], [26.4, 24.6], [21, 25.4], [16, 24.8], [11, 25.6], [5.6, 24.8]]);
  seam(pc, lb, 'shadow');
  lb.each((x, y) => pc.set(x, y, LB[x < 9 ? 2 : x > 22 ? 4 : 3]));
  lb.each((x, y) => { if (!lb.get(x, y - 1)) pc.set(x, y, LB[1]); else if (!lb.get(x, y + 1)) pc.set(x, y, LB[4]); });
  // label doodle: a berry sprig, and twine knotted round the neck
  for (const [x, y, c] of [[14, 20, 0xc4284a], [15, 20, 0xe0405a], [16, 21, 0x9a1a3a], [14, 21, 0xa82040], [17, 20, 0xc4284a], [18, 21, 0x9a1a3a], [17, 19, 0x4a8a3a], [18, 18, 0x4a8a3a], [16, 18, 0x3a7a30]]) pc.set(x, y, c);
  for (let x = 10; x < 23; x += 2) pc.set(x, 23, 0xb8a080);
  const TW = RAMPS.twine();
  for (let x = 9; x < 24; x++) if (jar.get(x, 10)) pc.set(x, 10, TW[(x % 2) + 2]);
  const SP = mat(0xc89058, { cont: 1.12 });
  tube(pc, [[15, 8.4], [20.6, 3.6], [24.6, 0.6]], (s) => 0.9 + s * 0.35, SP, { capEnd: 0.1 });
  for (let y = 7; y < 15; y++) pc.set(10, y, J[y < 13 ? 2 : 3]);
  pc.set(10, 15, J[4]);
  ink(pc, { minA: 150 });
  strand(pc, [[23.4, 10.4], [25.6, 11.6], [26, 14]], TW[2]);
  pc.set(24, 9, TW[1]);
  for (let y = 13; y < 28; y++) if (!lb.get(7, y) && y % 5) pc.set(y < 16 ? 8 : 7, y, 0xff9ab0);
  pc.set(9, 12, 0xffffff); pc.set(24, 26, J[2]);
  glint(pc, 22, 13, 1, 0xffffff, 0xffe0e8);
}

function frittata(pc) {
  // a deep two-eared pan holding a thick dino-egg frittata, one wedge already served
  const IR = mat(0x4e4a54, { cont: 1.18 });
  const ears = loop([[0.6, 15.6], [3.4, 14.6], [4.6, 17.6], [2.4, 18.4]]).union(loop([[27.4, 14.6], [30.6, 14], [31.4, 16.6], [29, 18.2]]));
  const s = vessel(pc, IR, [[2.6, 16], [5, 12.4], [10, 10.6], [16, 10.2], [22, 10.6], [27, 12.4], [29.4, 16], [28.6, 20.4], [25, 24.4], [16, 26.4], [7, 24.4], [3.4, 20.4]],
    [[3.8, 16], [6.6, 12.8], [16, 11.6], [25.4, 12.8], [28.2, 16], [25.4, 19.4], [16, 20.8], [6.6, 19.4]], { extra: ears, wall: 0 });
  const R = mat(0xf6cc4c, { cont: 1.08, warm: 50 });
  const cut = M().poly([[15.4, 15.2], [30, 13.4], [30, 23.6]]);
  const top = loop([[4.4, 15.6], [6.6, 12.2], [11, 10.4], [16, 9.8], [21, 10.4], [25.4, 12.2], [27.6, 15.6], [25, 18.6], [16, 19.8], [7, 18.6]]).sub(cut);
  s.mouth.clone().and(cut).each((x, y) => pc.set(x, y, IR[y < 16 ? 5 : 4]));
  const face = M().poly([[15.4, 15.2], [25.4, 18.6], [25.6, 21], [15.4, 18.2]]).and(s.mouth.clone().union(top)).sub(top);
  seam(pc, top, 'shadow');
  form(pc, top, R, { cx: 11, cy: 12, rx: 12, ry: 7, flatten: 0.5, bias: 0.16, lo: 1, hi: 4 });
  // a puffed, browned rim where it climbed the pan, a few golden blisters, herbs
  top.each((x, y) => { if (!top.get(x, y + 1) || !top.get(x + 1, y) || !top.get(x - 1, y)) pc.set(x, y, mix(R[3], 0xa8642a, 0.4)); });
  top.each((x, y) => { const h = hash2(x, y, 17); if (h > 0.95) pc.set(x, y, 0x4e8a3a); else if (h < 0.04 && !isTop(top, x, y)) pc.set(x, y, R[1]); });
  face.each((x, y) => { const u = (y + 0.5) - (15.2 + (x + 0.5 - 15.4) * 0.34); pc.set(x, y, u < 0.9 ? R[2] : u < 2.6 ? (hash2(x, y, 4) < 0.25 ? 0xeee0b8 : R[3]) : 0xa8642a); });
  for (const [x, y] of [[9, 13], [13, 12], [19, 12], [7, 16], [12, 16]]) { pc.set(x, y, 0xf2e4c0); pc.set(x + 1, y, 0xc8b088); pc.set(x, y + 1, 0xb89a70); }
  ink(pc);
  sprig(pc, [[5, 15], [6.6, 12], [9, 9.4]], { n: 3, big: false });
  glint(pc, 8, 12, 0);
  steam(pc, 12, 9, 7); steam(pc, 19, 9, 6, { phase: 2 });
}

function jerky(pc) {
  // three wide, torn strips of drake jerky in a loose stack, tied across the middle with twine,
  // fibrous and pepper-cracked
  const R = mat(0x9a4430, { cont: 1.14, warm: 12 });
  const strip = (x0, y0, x1, y1, w, seed) => {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), px = -dy / L, py = dx / L, n = 7, A = [], B = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + dx * t, y = y0 + dy * t;
      const wa = w * (0.85 + hash2(i, 1, seed) * 0.3) * (i === 0 || i === n ? 0.8 : 1), wb = w * (0.85 + hash2(i, 2, seed) * 0.3) * (i === 0 || i === n ? 0.8 : 1);
      A.push([x + px * wa, y + py * wa, i === 0 || i === n ? 1 : 0]); B.push([x - px * wb, y - py * wb, i === 0 || i === n ? 1 : 0]);
    }
    return loop([...A, ...B.reverse()]);
  };
  const S = [strip(3.6, 18.6, 25.6, 4.6, 2.9, 3), strip(4.6, 25.6, 28.6, 11.2, 3.1, 7), strip(7.6, 29.4, 30.4, 18.4, 2.7, 11)];
  S.forEach((m, i) => {
    seam(pc, m, 'shadow');
    form(pc, m, R, { flatten: 0.3, dome: 0.3, round: 1.5, bias: 0.04 + i * 0.03, tex: (x, y) => (vnoise(x * 0.8, y * 0.5, i + 2) - 0.5) * 0.5 });
    marks(pc, m, R, { dens: 0.28, seed: i + 4, len: 4, dir: [0.85, -0.52], lit: false });
    m.each((x, y) => { if (hash2(x, y, i + 9) < 0.05 && !isBot(m, x, y) && !isTop(m, x, y)) pc.set(x, y, R[1]); });
  });
  const TW = RAMPS.twine();
  const band = loop([[12.6, 9.6], [14.8, 8.8], [21, 25.8], [18.8, 26.6]]);
  seam(pc, band, 'shadow');
  band.each((x, y) => pc.set(x, y, TW[((x + y) % 3) ? 2 : 4]));
  band.each((x, y) => { if (isTop(band, x, y)) pc.set(x, y, TW[1]); });
  ink(pc);
  strand(pc, [[13.4, 9.4], [11, 6.6], [9, 6.4], [7.4, 4]], TW[2]);
  strand(pc, [[14.2, 9], [15.6, 5.6], [14.6, 3]], TW[3]);
  for (const [x, y] of [[7, 17], [11, 13], [21, 8], [9, 23], [24, 13], [26, 15], [13, 27], [25, 21], [28, 19]]) { pc.set(x, y, 0x1a1210); pc.set(x + 1, y, 0x4a3a30); }
  glint(pc, 7, 15, 0); glint(pc, 24, 9, 0);
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
