// Item icons for the building part, hand-built on the shared icon kits (gfx/px/lifeKit, gearKit)
// and painted natively at S× on the 32-unit design grid (gfx/px/res.js):
//   { k: 'block', b }       blocks as little isometric cubes with the same patterns as in the
//                           mine (cobble, bricks, planks, logs, glass, dirt…), each stone, brick
//                           and board bevelled (lit top-left edge, shaded bottom-right), crisp
//                           one-pixel mortar and seams, lit cube edges; and the odd ones drawn as
//                           themselves (ladder, torch, lantern, door, chest, workbench, sticks,
//                           sand, clay, vine)
//   { k: 'btool', t, c }    axes, spades and shears (c: the metal; stone ones are knapped and lashed)
// PixelArt.drawIconArt calls drawBuildIcon(pc, spec) → true when it drew something.
import {
  M, mat, mix, hash2, vnoise, ink, seam, form, loop, blade, tube, marks, speckle, sheen, line, glint, sparkle, stitch, rivet,
  step, isTop, isBot, clamp, gl, toneN, S, SZ, nc, np, dc, pits, bumps,
} from '../../gfx/px/lifeKit.js';
import { stick, wrapStick, dents, RAMPS } from '../../gfx/px/gearKit.js';
import { MAT } from '../materials.js';
import { BM } from './mats.js';

const hh = (x, y, s = 0) => hash2(x, y, s + 101);
const dk = (c, k) => mix(c, 0x000000, k), lt = (c, k) => mix(c, 0xffffff, k);
const P = (pc, X, Y, c) => pc.set(X, Y, c);
function part(pc, m, R, o = {}) {
  if (o.seam !== false) seam(pc, m, 'shadow');
  return form(pc, m, R, o);
}

// ------------------------------------------------------------------ face patterns
// (U, V) in 0..16 pattern units across a face (V up), e = pattern units per real pixel (so a
// feature `< e` wide is one pixel). Each returns a tone (0..5 on the block's ramp, dark → light),
// 'a' (the accent: mortar, gaps), { c } (a fixed colour) or null (see-through).
const fr = (v) => v - Math.floor(v);
const PAT = {
  cobble(U, V, e) {
    const p = [U / 4, V / 4], g = [Math.floor(p[0]), Math.floor(p[1])];
    let f1 = 9, f2 = 9, id = 0, ox = 0, oy = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = g[0] + i, cy = g[1] + j, h = hh((cx + 8) % 4, (cy + 8) % 4, 3);
      const fx = cx + 0.5 + (h - 0.5) * 0.7, fy = cy + 0.5 + (hh(cx, cy, 9) - 0.5) * 0.7;
      const d = Math.hypot(p[0] - fx, p[1] - fy);
      if (d < f1) { f2 = f1; f1 = d; id = h; ox = p[0] - fx; oy = p[1] - fy; } else if (d < f2) f2 = d;
    }
    const gap = f2 - f1;
    if (gap < e * 0.22) return 'a';
    let t = 2 + Math.round(id * 2);
    if (gap < e * 0.6) t += -ox + oy > 0 ? 1 : -1; // each stone's lit and shaded rim
    else if (hh(Math.floor(U / e), Math.floor(V / e), 5) < 0.06) t -= 1; // pits
    return clamp(t, 0, 5);
  },
  stonebrick(U, V, e) {
    const row = Math.floor(V / 8), x = U + (row % 2) * 4, bx = x % 8, by = V % 8;
    if (bx < e || by < e) return 'a';
    const id = hh(Math.floor(x / 8), row, 4);
    let t = id > 0.6 ? 3 : 2;
    if (bx < 2 * e || by > 8 - 1.2 * e) t = 4; // lit top-left lip
    else if (by < 2 * e || bx > 8 - 1.2 * e) t = 1; // shaded bottom-right
    else {
      const n = vnoise(U * 0.8, V * 0.8, 3 + row);
      if (n > 0.72) t -= 1;
      if (Math.abs(bx - 4 - (by - 4) * 0.7 * (id - 0.5)) < e * 0.6 && id > 0.75 && by > 2 && by < 6) t = 0; // a hairline crack
    }
    return t;
  },
  bricks(U, V, e) {
    const row = Math.floor(V / 4), x = U + (row % 2) * 4, bx = x % 8, by = V % 4;
    if (bx < e || by < e) return 'a';
    const h = hh(Math.floor(x / 8), row, 7);
    let t = h < 0.15 ? 1 : h > 0.7 ? 3 : 2;
    if (by > 4 - e * 1.2) t += 1;
    else if (bx < e * 2) t += 1;
    else if (by < e * 2) t -= 1;
    if (hh(Math.floor(U / e), Math.floor(V / e), 2) < 0.05) t -= 1; // pores
    return clamp(t, 0, 5);
  },
  planks(U, V, e) {
    const b = Math.floor(V / 4), by = V % 4, x = U + b * 5;
    if (by < e || x % 16 < e) return 'a';
    let t = 3;
    if (by > 4 - e * 1.2) t = 4;
    else if (by < e * 2) t = 2;
    else {
      const g = Math.sin(x * 0.9 + b * 7 + vnoise(x * 0.2, by, b) * 3) * 0.5 + 0.5;
      if (g > 0.86) t = 2; else if (g < 0.1) t = 4;
    }
    // a nail at each board's end
    const ex = x % 16;
    if (Math.abs(ex - 1.6) < e * 0.6 && Math.abs(by - 2) < e * 0.6) return { c: 0x2a2220 };
    if (Math.abs(ex - 1.6 - e) < e * 0.6 && Math.abs(by - 2 + e) < e * 0.6) return { c: 0x8a8890 };
    return t;
  },
  logSide(U, V, e) {
    const g = Math.floor(U / 2.6), gx = U % 2.6;
    const wob = vnoise(g * 3.1, V * 0.3, 5) * 1.2;
    if (Math.abs(gx - 0.4 - wob * 0.5) < e * 0.8) return 0;
    let t = hh(g, Math.floor(V * 0.5 + hh(g, 1) * 2), 5) > 0.5 ? 2 : 1;
    if (Math.abs(gx - 1 - wob * 0.5) < e) t += 1; // the ridge catches the light
    if (V > 15 - e) t = 3;
    return t;
  },
  logEnd(U, V, e) {
    const x = U - 8, y = V - 8, r = Math.hypot(x, y) + vnoise(U * 0.5, V * 0.5, 2) * 0.5;
    if (r > 7) return 1;
    if (r > 6.3) return 2;
    if (r > 5.8) return 5;
    const a = Math.atan2(y, x);
    if (Math.abs(a - 0.6) < 0.14 && r > 1.5) return 2; // a drying crack
    return fr(r / 1.25) < e / 1.25 ? 3 : r < 1 ? 3 : 4;
  },
  glass(U, V, e) {
    const m = Math.min(U, V, 16 - U, 16 - V);
    if (m < 1.1) return m < e ? 2 : 3;
    if (m < 1.1 + e) return 5;
    const d1 = U - (16 - V);
    if (Math.abs(d1 + 4) < 0.5 && U > 3 && U < 10) return 5;
    if (Math.abs(d1 + 1.6) < 0.28 && U > 4 && U < 12) return 5;
    return null;
  },
  dirt(U, V, e) {
    const cx = Math.floor(U / 3), cy = Math.floor(V / 3);
    const hx = hh(cx, cy, 2);
    // pebbles: little stones with a lit top
    const px = cx * 3 + 1.5 + (hh(cx, cy, 3) - 0.5), py = cy * 3 + 1.5 + (hh(cx, cy, 4) - 0.5);
    if (hx > 0.82 && Math.hypot(U - px, V - py) < 0.9) return { c: V - py > 0.2 ? 0xb8a890 : 0x7a6a5a };
    const n = vnoise(U * 0.5, V * 0.5, 7), h = hh(Math.floor(U / e), Math.floor(V / e), 9);
    let t = n > 0.66 ? 4 : n > 0.4 ? 3 : n > 0.2 ? 2 : 1;
    if (h > 0.94) t = 0;
    else if (h < 0.05) t += 1;
    if (Math.abs(fr(U * 0.18 + V * 0.05) - 0.5) < 0.02 && hx < 0.3) return 'a'; // a root
    return t;
  },
};

/**
 * An isometric cube: top (lit), left (mid), right (shaded). pal: 4 tones (dark → light) + accent.
 * pats: [top, left, right]. see-through pixels (null) show the far faces behind (glass).
 */
function isoCube(pc, pal, acc, pats, o = {}) {
  const cx = o.cx ?? 16, top = o.top ?? 3, w = o.w ?? 13, hgt = o.h ?? 14, q = w / 2;
  const ramp = [dk(pal[0], 0.3), pal[0], pal[1], pal[2], pal[3], lt(pal[3], 0.24)];
  const SH = [0, 0.14, 0.32];
  const e = 16 / (w * S) * 1.05;
  const tone = (t, f) => (t === 'a' ? dk(acc, SH[f] * 0.6) : typeof t === 'object' ? dk(t.c, SH[f]) : dk(ramp[clamp(Math.round(t), 0, 5)], SH[f]));
  const face = new Int8Array(SZ * SZ).fill(-1);
  for (let Y = 0; Y < SZ; Y++) for (let X = 0; X < SZ; X++) {
    const x = (X + 0.5) / S, y = (Y + 0.5) / S, dx = x - cx;
    let f = -1, u = 0, v = 0;
    const ty = y - (top + q);
    if (Math.abs(dx) / w + Math.abs(ty) / q <= 1) {
      f = 0;
      const a = (dx / w + ty / q) * 0.5 + 0.5, b = (-dx / w + ty / q) * 0.5 + 0.5;
      u = a; v = 1 - b;
    } else {
      const yy = y - top - q;
      if (dx < 0 && dx > -w) {
        const yy2 = yy - q * (1 + dx / w);
        if (yy2 >= 0 && yy2 <= hgt) { f = 1; u = (dx + w) / w; v = 1 - yy2 / hgt; }
      } else if (dx >= 0 && dx < w) {
        const yy2 = yy - q * (1 - dx / w);
        if (yy2 >= 0 && yy2 <= hgt) { f = 2; u = dx / w; v = 1 - yy2 / hgt; }
      }
    }
    if (f < 0) continue;
    const t = pats[f](clamp(u, 0, 0.999) * 16, clamp(v, 0, 0.999) * 16, e, f);
    if (t === null || t === undefined) {
      if (o.glass) pc.set(X, Y, f === 0 ? 0xdff2f4 : f === 1 ? 0xa8ccd4 : 0x86aab4, f === 0 ? 70 : 95);
      continue;
    }
    face[Y * SZ + X] = f;
    pc.set(X, Y, tone(t, f));
  }
  // crisp lit edges: where the top meets the sides, and the near vertical corner
  if (o.edges !== false) for (let Y = 0; Y < SZ; Y++) for (let X = 0; X < SZ; X++) {
    const f = face[Y * SZ + X];
    if (f === 0 && Y + 1 < SZ && face[(Y + 1) * SZ + X] > 0) pc.set(X, Y, lt(pc.getHex(X, Y), 0.28));
    else if (f === 1 && X + 1 < SZ && face[Y * SZ + X + 1] === 2) pc.set(X, Y, lt(pc.getHex(X, Y), 0.2));
  }
  return face;
}

function blockCube(pc, m, pats, o) {
  const d = MAT[m];
  return isoCube(pc, d.tones, d.accent, pats, o);
}

// ------------------------------------------------------------------ the odd ones
function ladder(pc) {
  const W = RAMPS.wood(), TW = RAMPS.twine();
  // rungs behind the rails, lashed at each end
  for (let r = 0; r < 5; r++) {
    const y = 5.6 + r * 5.2;
    stick(pc, 9.6, y, 22.4, y + 0.2, 0.9, W, { grain: true, seed: r + 2, tones: [1, 2, 3, 4, 5] });
  }
  for (const x of [9.4, 22.6]) stick(pc, x, 1.8, x + (x < 16 ? -0.4 : 0.4), 30.2, 1.3, W, { grain: true, seed: x | 0, knots: x < 16 ? [0.62] : [0.3] });
  for (let r = 0; r < 5; r++) {
    const y = 5.6 + r * 5.2;
    for (const x of [9.3, 22.7]) {
      const lash = M().rect(x - 1.6, y - 1, 3.2, 2.2);
      seam(pc, lash, 'shadow', { soft: false });
      lash.each((X, Y) => pc.set(X, Y, TW[((Y + X) % 3 === 0) ? 4 : isTop(lash, X, Y) ? 1 : (Y % 2 ? 3 : 2)]));
    }
  }
  ink(pc);
}
function torch(pc) {
  const W = RAMPS.darkWood(), CL = mat(0x6a5a4a, { cont: 1.1 });
  stick(pc, 16, 13.4, 16.6, 29.6, [1.1, 1.4], W, { grain: true, seed: 3 });
  // the oily rag head, bound with cord
  wrapStick(pc, 16, 9.6, 16.2, 15.4, 1.9, 0, 5.8, CL, { rows: 2, grow: 0.4, tones: [2, 3, 3, 4, 5, 5] });
  line(pc, 14.4, 14.4, 17.8, 13.6, 0xc8a870); line(pc, 14.4, 15, 17.8, 14.2, 0x8a6a40);
  // the flame: three tongues, white-hot at the core
  const fl = loop([[16, 1.4], [17.2, 4], [19, 3.6], [18.6, 6.6], [19.6, 8.6], [18.4, 10.6], [16, 11.2], [13.6, 10.6], [12.6, 8.4], [13.4, 6], [12.8, 3.8], [14.8, 4.8]]);
  fl.each((X, Y) => {
    const x = dc(X), y = dc(Y), d = Math.hypot((x - 16) * 1.3, (y - 8.4) * 0.8);
    gl(pc, X, Y, d < 1.6 ? 0xfff6d8 : d < 2.8 ? 0xffe080 : d < 4 ? 0xffb030 : 0xff7a20, 1);
  });
  for (const [x, y] of [[20.4, 2.4], [11.6, 3.6], [19.6, 0.8]]) gl(pc, np(x), np(y), 0xffd060, 1);
  ink(pc, { skip: (X, Y) => dc(Y) < 11 && (fl.get(X + 1, Y) || fl.get(X - 1, Y) || fl.get(X, Y + 1) || fl.get(X, Y - 1)) });
}
function lantern(pc) {
  const I = mat(0x3e3838, { cont: 1.2 }), B = RAMPS.brass();
  // the bail handle
  const bail = M().path([[11.6, 7], [12.4, 2.6], [16, 1.4], [19.6, 2.6], [20.4, 7]], 0.6);
  part(pc, bail, I, { bias: 0.1, round: 0.7 });
  // the cap: a little roof with a vent knob
  const cap = loop([[9.4, 9.4, 1], [13, 6.2], [19, 6.2], [22.6, 9.4, 1]]);
  part(pc, cap, I, { bias: 0.08 });
  part(pc, loop([[14.6, 6.4], [15, 4.6], [17, 4.6], [17.4, 6.4]]), B, { bias: 0.1 });
  // the glowing glass between the frame's bars
  const glass = loop([[10.6, 9.6], [21.4, 9.6], [21.4, 24.4], [10.6, 24.4]].map((p) => [...p, 1]));
  glass.each((X, Y) => {
    const x = dc(X), y = dc(Y), d = Math.hypot((x - 16) * 1.1, (y - 17.6) * 0.8);
    gl(pc, X, Y, d < 1.8 ? 0xfff8e0 : d < 3.6 ? 0xffe8a0 : d < 6 ? 0xffc860 : 0xf0a040, d < 6 ? 1 : 0.8);
  });
  // the wick flame
  const fl = loop([[16, 13.4], [17.2, 16.4], [16.8, 18.6], [15.2, 18.6], [14.8, 16.4]]);
  fl.each((X, Y) => gl(pc, X, Y, 0xffffff, 1));
  // reflections on the panes
  line(pc, 11.8, 11, 11.8, 16, 0xfffbe8, glass, 1); line(pc, 19.8, 11, 19.8, 13, 0xfffbe8, glass, 1);
  // frame: bars, the base, little rivets
  for (const x of [10.2, 16, 21.8]) {
    const bar = M().rect(x - 0.7, 9.4, 1.4, 15.2);
    seam(pc, bar, 'shadow', { soft: false });
    bar.each((X, Y) => pc.set(X, Y, I[X === np(x - 0.7) ? 2 : isBot(bar, X, Y) ? 5 : 3]));
  }
  const base = loop([[8.8, 24.2, 1], [23.2, 24.2, 1], [23.8, 26.6], [22.4, 28.2, 1], [9.6, 28.2, 1], [8.2, 26.6]]);
  part(pc, base, I, { bias: 0.08 });
  line(pc, 9.4, 25, 22.6, 25, I[1], base);
  for (const x of [11, 16, 21]) rivet(pc, x, 26.4, B);
  rivet(pc, 10, 10.6, B); rivet(pc, 21.2, 10.6, B);
  ink(pc);
}
function door(pc) {
  const W = mat(0x8a5832, { cont: 1.08 }), I = mat(0x3a3436, { cont: 1.2 });
  // planks, each its own board with grain and a lit left edge
  const d = loop([[8.4, 4.6], [10.6, 2.4], [16, 1.6], [21.4, 2.4], [23.6, 4.6], [23.6, 30, 1], [8.4, 30, 1]]);
  seam(pc, d, 'shadow');
  d.each((X, Y) => {
    const x = dc(X), y = dc(Y), b = Math.floor((x - 8.4) / 3.8), bx = (x - 8.4) - b * 3.8;
    let k = bx < 0.5 ? 2 : bx > 3.2 ? 4 : 3;
    const g = vnoise(x * 1.4 + b * 5, y * 0.16, b + 3);
    if (g > 0.68 && k === 3) k = 4; else if (g < 0.14 && k === 3) k = 2;
    if (Math.abs(bx) < 0.3 || Math.abs(bx - 3.8) < 0.25) k = 6;
    pc.set(X, Y, W[clamp(k, 1, 6)]);
  });
  // a knot, the iron straps with nails, the ring pull
  const kx = np(13.2), ky = np(21);
  for (const [dx, dy, k] of [[0, 0, 5], [1, 0, 5], [-1, 0, 4], [2, 0, 4], [0, -1, 4], [1, 1, 4], [0, 1, 2]]) P(pc, kx + dx, ky + dy, W[k]);
  for (const y of [7.4, 23.6]) {
    const st = M().rect(8.4, y, 12.6, 2.2).union(M().poly([[21, y], [22.6, y + 1.1], [21, y + 2.2]]));
    seam(pc, st, 'shadow', { soft: false });
    st.each((X, Y) => pc.set(X, Y, I[isTop(st, X, Y) ? 2 : isBot(st, X, Y) ? 5 : 3]));
    for (let x = 9.6; x < 20; x += 3.6) rivet(pc, x, y + 0.6, I);
  }
  const ring = M().path([[19.4, 15.6], [18.6, 17.2], [19.4, 18.8], [21, 18.8], [21.8, 17.2], [21, 15.6], [19.4, 15.6]], 0.45);
  part(pc, ring, mat(0xc8a040, { cont: 1.15 }), { bias: 0.12, round: 0.6 });
  rivet(pc, 20, 14.8, mat(0xc8a040, { cont: 1.15 }), true);
  ink(pc);
}
function sticks(pc) {
  const W = RAMPS.wood(), BK = mat(0x5a3a1e, { cont: 1.1 });
  stick(pc, 5.6, 25.4, 26.4, 6.4, [1.4, 1.1], W, { grain: true, seed: 4, knots: [0.35, 0.7] });
  stick(pc, 7.2, 9.6, 25.6, 24.6, [1.2, 1.0], BK, { grain: true, seed: 9, knots: [0.55] });
  // a twig with a leaf, cut ends showing pale wood with rings
  line(pc, 16.6, 16.4, 20.4, 12.4, BK[3]); line(pc, 17, 16.8, 20.8, 12.8, BK[5]);
  blade(pc, 20.4, 12.4, 24.4, 9.6, 1.6, mat(0x5a8a3a, { cont: 1.1 }), { bend: 0.6, veins: 2 });
  for (const [x, y, R] of [[5.6, 25.4, W], [7.2, 9.6, BK]]) {
    const X = np(x), Y = np(y);
    for (const [dx, dy, c] of [[-1, -1, 0xe8c890], [0, -1, 0xd8b078], [-1, 0, 0xd8b078], [0, 0, 0xb88a58], [1, 0, R[3]], [0, 1, R[4]]]) P(pc, X + dx, Y + dy, c);
  }
  ink(pc);
}
function pile(pc, tones, acc, o = {}) {
  const R = [lt(tones[3], 0.5), lt(tones[3], 0.25), tones[3], tones[2], tones[1], tones[0], dk(tones[0], 0.35)];
  const m = loop([[3.6, 27.4], [5.4, 23.4], [8.6, 19.4], [12.6, 16.4], [16.4, 15.4], [20, 16.4], [23.6, 19], [26.6, 22.6], [28.6, 27.2], [24, 28.8], [16, 29.4], [8, 28.8]], { jit: 0.3, seed: o.seed ?? 3 });
  form(pc, m, R, { cx: 15, cy: 21, rx: 12, ry: 8, bias: 0.06 });
  // grains: lit specks and shaded specks, a few pebbles or shells
  speckle(pc, m, [R[1], R[2]], 0.08, 4, (X, Y) => !isTop(m, X, Y));
  speckle(pc, m, [R[4], R[5]], 0.06, 7, (X, Y) => !isTop(m, X, Y));
  speckle(pc, m, [acc], 0.02, 9);
  // little slides of grains down the slope
  marks(pc, m, R, { dens: 0.12, len: 1.4, seed: 2, dir: (X) => [dc(X) < 16 ? -1 : 1, 0.7] });
  if (o.shell) {
    const sh = loop([[20.4, 22.4], [22.6, 21.6], [24, 23.4], [22.2, 24.8]]);
    part(pc, sh, mat(0xf0e0d0, { cont: 1 }), { bias: 0.1 });
    line(pc, 21, 23, 23.4, 22.6, 0xc8a890, sh);
  }
  ink(pc);
}
function clay(pc) {
  const R = mat(0xa05634, { cont: 1.05 });
  const m = loop([[4.4, 22.6], [6.6, 17.4], [10.4, 13.6], [15.6, 12], [21, 12.8], [25.4, 16.4], [27.6, 21.4], [26.6, 26], [22, 28.6], [15, 29.2], [8.4, 28.4], [4.8, 26.2]], { jit: 0.4, seed: 5 });
  form(pc, m, R, { cx: 14.4, cy: 18, rx: 12, ry: 9, bias: 0.06 });
  // finger dents: smooth hollows, dark on their lit side and catching light on the far side
  for (const [x, y, r] of [[12.4, 17.2, 2], [18.6, 16.4, 1.8], [15.4, 22.4, 2.2]]) {
    m.each((X, Y) => {
      const dx = dc(X) - x, dy = (dc(Y) - y) * 1.3, dd = Math.hypot(dx, dy);
      if (dd > r) return;
      step(pc, R, X, Y, -dx - dy < 0 ? -1 : 1);
    });
  }
  // a wire-cut face on the right, with drag lines
  m.each((X, Y) => { const x = dc(X), y = dc(Y); if (x > 23.4 - (y - 13) * 0.1) { const k = R.indexOf(pc.get(X, Y)); if (k > 0) pc.set(X, Y, R[clamp(k + 1, 3, 5)]); if (Y % 3 === 0) step(pc, R, X, Y, 1); } });
  ink(pc);
  sheen(pc, m, R[1], { a0: -2.7, a1: -1.6, inset: 1 });
  glint(pc, 9.6, 16.6, 0, R[0]);
}
function vine(pc) {
  const G = mat(0x367240, { cont: 1.12 }), ST = mat(0x5a6a2a, { cont: 1.1 });
  const pts = [];
  for (let i = 0; i <= 12; i++) { const y = 2 + i * 2.4; pts.push([16 + Math.sin(y * 0.42) * 3.4, y]); }
  const t = tube(pc, pts, (s) => 1.1 - s * 0.3, ST, { bias: 0.1 });
  // leaves at the bends, alternating sides, and curling tendrils
  for (let i = 0; i < 6; i++) {
    const s = 0.08 + i * 0.16, [x, y] = t.at(s), side = i % 2 ? 1 : -1;
    blade(pc, x, y, x + side * 6.4, y - 2.8 + (i % 3) * 0.8, 2.2, G, { bend: side * 0.8, veins: 2, asym: 0.1 });
    if (i % 2 === 0) {
      const tx = x - side * 1.4, ty = y + 1.2;
      for (let k = 0; k < 14; k++) { const a = k * 0.45, r = 2.2 - k * 0.12; P(pc, np(tx - side * (1 + Math.cos(a) * r)), np(ty + 0.4 + Math.sin(a) * r), G[k < 6 ? 3 : 2]); }
    }
  }
  ink(pc);
}
function chest(pc) {
  const d = MAT[BM.B_CHEST];
  const I = [0x2a2426, 0x4a4446, 0x6a6466], GD = 0xd8a83a;
  const band = (f) => (U, V, e) => {
    const iron = U < 1.6 || U > 14.4 || V > 14.6 || (f > 0 && Math.abs(V - 9.6) < 0.9);
    if (iron) {
      if ((U < 1.6 || U > 14.4) && Math.abs((V % 4) - 2) < e * 0.7 && Math.abs((U < 8 ? U : 16 - U) - 0.8) < e * 0.7) return { c: 0xb8b0a8 }; // rivets
      return { c: I[U < e || V > 16 - e ? 2 : (V % 16) < e ? 0 : 1] };
    }
    if (f === 1 && Math.abs(U - 8) < 1.6 && V > 5.6 && V < 9) { // the lock plate and keyhole
      if (Math.abs(U - 8) < 0.4 && V > 6.2 && V < 7.8) return { c: 0x1a1210 };
      return { c: U - 8 < -1 + e || V > 9 - e ? lt(GD, 0.3) : GD };
    }
    return PAT.planks(U, V, e);
  };
  isoCube(pc, d.tones, d.accent, [(U, V, e) => (U < 1.2 || U > 14.8 || V < 1.2 || V > 14.8 ? { c: I[1] } : PAT.planks(U, V, e)), band(1), band(2)], { top: 6, w: 12, h: 13 });
  ink(pc);
}
function bench(pc) {
  const d = MAT[BM.B_BENCH];
  const top = (U, V, e) => {
    if (U > 1.6 && U < 5.8 && V > 10 && V < 14.2) return U < 1.6 + e || V > 14.2 - e ? { c: 0xaab0b8 } : { c: d.accent }; // the vise block
    if (Math.abs(V - 3.4) < e * 0.5 && U > 3 && U < 13) return 1; // a saw kerf
    if (hh(Math.floor(U / e), Math.floor(V / e), 6) < 0.03) return 1; // tool marks
    return PAT.planks(U, V, e);
  };
  const side = (U, V, e) => (V > 11.2 ? PAT.planks(U, (V - 11.2) * 2.6, e) : U < 2.4 || U > 13.6 ? (U < 2.4 ? (U < e ? 4 : 3) : (U > 16 - e ? 1 : 2)) : V > 9.4 && V < 10.6 ? 2 : null);
  isoCube(pc, d.tones, d.accent, [top, side, side], { top: 3, w: 13, h: 14 });
  // a hammer resting on top
  const W = RAMPS.wood(), I = mat(0x7a7f88, { cont: 1.15 });
  stick(pc, 12.4, 9.6, 18.6, 6.4, 0.7, W, { tones: [1, 2, 3, 4, 5] });
  const hd = loop([[17.6, 4.2], [20.6, 5.6], [19.6, 8.4], [16.6, 7]].map((p) => [...p, 1]));
  part(pc, hd, I, { bias: 0.08 });
  ink(pc);
}

// ------------------------------------------------------------------ tools
const STONE = 0x8a8580;
/** A metal head's ramp; stone heads are knapped flint. */
const metal = (c) => (c === STONE ? mat(0x7a7470, { cont: 1.15 }) : mat(c, { cont: 1.22, hs: 1.1 }));
/** Knapped facets over a stone head: flat scallops toned by a jittered normal, sharp ridges between. */
function knap(pc, m, R, seed = 3) {
  const cells = [];
  for (let i = 0; i < 14; i++) cells.push([hash2(i, 1, seed) * 32, hash2(i, 2, seed) * 32, (hash2(i, 3, seed) - 0.5) * 1.6, (hash2(i, 4, seed) - 0.5) * 1.6]);
  m.each((X, Y) => {
    const x = dc(X), y = dc(Y);
    let b = 0, bd = 1e9, b2 = 1e9;
    for (let i = 0; i < cells.length; i++) { const d = (cells[i][0] - x) ** 2 + (cells[i][1] - y) ** 2; if (d < bd) { b2 = bd; bd = d; b = i; } else if (d < b2) b2 = d; }
    let k = clamp(toneN(cells[b][2] * 0.6, cells[b][3] * 0.6, 1, 0.08), 2, 4);
    if (Math.sqrt(b2) - Math.sqrt(bd) < 0.3) k = clamp(k - 1, 1, 5); // the sharp ridge between two scars
    else if (isBot(m, X, Y)) k = 5;
    pc.set(X, Y, R[k]);
  });
}
function axe(pc, c) {
  const W = RAMPS.ash(), R = metal(c), stone = c === STONE;
  const E = [20.4, 8.6], hx = 7.4, hy = 28.4;
  const L = Math.hypot(E[0] - hx, E[1] - hy), d = [(E[0] - hx) / L, (E[1] - hy) / L], p = [-d[1], d[0]];
  const at = (a, b) => [E[0] + p[0] * a + d[0] * b, E[1] + p[1] * a + d[1] * b];
  const h = stick(pc, hx, hy, E[0] + d[0] * 2.2, E[1] + d[1] * 2.2, [1.4, 1.15], W, { grain: true, seed: 5, knots: [0.36] });
  // a leather grip near the end
  wrapStick(pc, hx, hy, E[0], E[1], 1.4, 1.4, 6.6, RAMPS.leather(), { rows: 3, grow: 0.4 });
  // the head: a poll behind, a flared bearded bit in front (a along p = right-down, b along the handle)
  const out = stone
    ? [[-2.4, -1.8], [-2.8, 1.6], [0, 2.6], [3.4, 3.4], [6.6, 4.4], [8.4, 2.2], [8.8, -0.6], [7.8, -3.6], [5, -4], [2.4, -2.6], [0, -2.4]]
    : [[-3.4, -1.8], [-3.6, 1.8], [-1, 2.4], [2.6, 2.2], [5.6, 4], [8.4, 5.4], [9.4, 1.6], [9.2, -2], [8, -5.6], [5.6, -3.8], [2.6, -2.4], [-1, -2.4]];
  const hm = loop(out.map(([a, b], i) => [...at(a, b), i === 0 || i === 1 ? 1 : 0]), { seg: 4 });
  seam(pc, hm, 'shadow');
  if (stone) knap(pc, hm, R, 7);
  else {
    form(pc, hm, R, { flatten: 0.55, dome: 0.4, bias: 0.06 });
    // the ground edge: a bright bevel along the bit
    hm.each((X, Y) => {
      const x = dc(X) - E[0], y = dc(Y) - E[1], a = x * p[0] + y * p[1];
      const edgeA = stone ? 99 : 7.8 + Math.abs(x * d[0] + y * d[1]) * -0.15;
      if (a > edgeA) pc.set(X, Y, R[isBot(hm, X, Y) ? 2 : 1]);
      else if (a > edgeA - 0.5) pc.set(X, Y, R[4]);
    });
    dents(pc, hm, R, { dens: 0.05, seed: 3 });
  }
  if (stone) {
    // rawhide lashing crossing over the haft
    const TW = RAMPS.twine();
    for (let k = -1; k <= 1; k++) {
      const [x0, y0] = at(-2.2, -1.6 + k * 1.1), [x1, y1] = at(2.4, -0.6 + k * 1.1);
      line(pc, x0, y0, x1, y1, TW[2]); line(pc, x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, TW[4]);
    }
  } else {
    // the eye: a darker collar round the haft, the wedge's end in it
    const [ex, ey] = at(0, 0);
    const eye = loop([at(-1.6, -2.2), at(1.8, -2.2), at(1.8, 2.2), at(-1.6, 2.2)].map((q) => [...q, 1]));
    eye.each((X, Y) => { const k = R.indexOf(pc.get(X, Y)); if (k >= 0) pc.set(X, Y, R[clamp(k + 1, 2, 5)]); });
    void ex; void ey;
  }
  ink(pc);
  if (!stone) { const [gx, gy] = at(8.2, 3.4); glint(pc, gx, gy, 1, R[0]); }
}
function spade(pc, c) {
  const W = RAMPS.ash(), R = metal(c), stone = c === STONE;
  // the shaft runs from a T grip (bottom-left) up to the socket (top-right)
  const g = [7.4, 27.6], s0 = [18.4, 15];
  stick(pc, g[0], g[1], s0[0], s0[1], 1.1, W, { grain: true, seed: 6, knots: [0.5] });
  const L = Math.hypot(s0[0] - g[0], s0[1] - g[1]), d = [(s0[0] - g[0]) / L, (s0[1] - g[1]) / L], p = [-d[1], d[0]];
  const at = (a, b) => [s0[0] + p[0] * a + d[0] * b, s0[1] + p[1] * a + d[1] * b];
  const tg = [g[0] - d[0] * 0.6, g[1] - d[1] * 0.6];
  stick(pc, tg[0] - p[0] * 3.2, tg[1] - p[1] * 3.2, tg[0] + p[0] * 3.2, tg[1] + p[1] * 3.2, 1.1, W, { tones: [1, 2, 3, 4, 5], grain: true, seed: 2 });
  // the blade: shoulders (the tread) at the socket, swelling and coming to a rounded point
  const out = stone
    ? [[-3.6, 0.6], [-4.6, 3.6], [-4.4, 7.4], [-2.6, 10.4], [0, 11.6], [2.8, 10.2], [4.4, 7], [4.6, 3.4], [3.4, 0.6]]
    : [[-4.8, 1.4], [-5.4, 4.4], [-5, 8], [-3.4, 11.2], [0, 13.2], [3.4, 11.2], [5, 8], [5.4, 4.4], [4.8, 1.4]];
  const bm = loop(out.map(([a, b], i) => [...at(a, b), i === 0 || i === out.length - 1 ? 1 : 0]), { seg: 5 });
  seam(pc, bm, 'shadow');
  if (stone) knap(pc, bm, R, 4);
  else {
    // dished: lit on the left half, a crease down the middle, the right half shaded
    bm.each((X, Y) => {
      const x = dc(X) - s0[0], y = dc(Y) - s0[1], a = x * p[0] + y * p[1], b = x * d[0] + y * d[1];
      let k = a < -0.4 ? 2 : a > 0.4 ? 4 : 3;
      if (Math.abs(a) < 0.35 && b > 2.6 && b < 11) k = 5;
      if (b > 11.6 - Math.abs(a) * 0.5) k = 1; // the worn, bright cutting edge
      if (isTop(bm, X, Y) && !isBot(bm, X, Y) && k > 1) k--;
      pc.set(X, Y, R[k]);
    });
    // the tread lip and the socket with its rivets
    line(pc, ...at(-4.8, 1.8), ...at(4.8, 1.8), R[1], bm);
    dents(pc, bm, R, { dens: 0.05, seed: 6 });
  }
  const sock = loop([at(-1.6, -3.2), at(1.6, -3.2), at(2.2, 1.6), at(-2.2, 1.6)].map((q) => [...q, 1]));
  part(pc, sock, stone ? RAMPS.twine() : R, { bias: 0.08 });
  if (stone) for (let k = 0; k < 4; k++) line(pc, ...at(-2, -2.6 + k * 1.1), ...at(2, -2.2 + k * 1.1), RAMPS.twine()[4], sock);
  else { const [rx, ry] = at(0, -1); rivet(pc, rx - 0.5, ry - 0.5, R); }
  ink(pc);
  if (!stone) { const [gx, gy] = at(-2.6, 5); glint(pc, gx, gy, 1, R[0]); }
}
function shears(pc, c) {
  const R = metal(c), RD = mat(0xb03024, { cont: 1.1 });
  // two red-gripped handles below the pivot, a coil spring between them
  for (const s of [-1, 1]) {
    const pts = [[16 + s * 0.6, 15.6], [16 + s * 3.4, 20.6], [16 + s * 5.4, 26.4], [16 + s * 6, 29.4]];
    tube(pc, pts, (t) => (t < 0.3 ? 0.9 : 1.2), R, { bias: 0.08 });
    const gp = tube(pc, pts.slice(1), 1.6, RD, { bias: 0.08 });
    gp.mask.each((X, Y) => { if ((Y % 4) === 0 && !isTop(gp.mask, X, Y)) step(pc, RD, X, Y, 1); }); // grip ridges
  }
  for (let k = 0; k < 5; k++) line(pc, 14.4, 19 + k * 0.9, 17.6, 19.4 + k * 0.9, k % 2 ? R[2] : R[4]);
  // the blades: a curved cutting blade and a hooked anvil jaw, crossing at the bolt
  const b1 = loop([[15.4, 17], [13.2, 12.4], [12.4, 7.6], [13.4, 3.4], [15.6, 1.6], [16, 4.2], [16.6, 9.2], [17.2, 14.6]]);
  const b2 = loop([[16.6, 17], [19.4, 12.4], [21.2, 7.6], [21, 3.6], [19.4, 2.4], [18.2, 4.8], [17.4, 9.8], [15.4, 14.6]]);
  part(pc, b2, R, { bias: 0.02 });
  line(pc, 18.6, 4.8, 17, 12, R[5], b2);
  part(pc, b1, R, { bias: 0.1 });
  line(pc, 15.8, 3, 16.2, 12, R[1], b1); // the honed edge
  // the bolt
  const bolt = loop([[16, 13.8], [17.4, 14.6], [17.4, 16.2], [16, 17], [14.6, 16.2], [14.6, 14.6]]);
  part(pc, bolt, mat(0xc8a040, { cont: 1.15 }), { bias: 0.12 });
  P(pc, np(16), np(15.4), 0x2a2220);
  ink(pc);
  glint(pc, 14, 6, 1, R[0]);
}

// ------------------------------------------------------------------ entry
export function drawBuildIcon(pc, spec) {
  if (!spec) return false;
  if (spec.k === 'btool') {
    const c = spec.c ?? 0x9aa0a8;
    if (spec.t === 'axe') axe(pc, c);
    else if (spec.t === 'spade') spade(pc, c);
    else shears(pc, c);
    return true;
  }
  if (spec.k !== 'block') return false;
  const b = spec.b;
  const cube = (m, pats, o) => { blockCube(pc, m, pats, o); ink(pc); };
  if (b === 'cobble') cube(BM.B_COBBLE, [PAT.cobble, PAT.cobble, PAT.cobble]);
  else if (b === 'stonebrick') cube(BM.B_STONEBRICK, [PAT.stonebrick, PAT.stonebrick, PAT.stonebrick]);
  else if (b === 'bricks') cube(BM.B_CLAYBRICK, [PAT.bricks, PAT.bricks, PAT.bricks]);
  else if (b === 'planks') cube(BM.B_PLANKS, [PAT.planks, PAT.planks, PAT.planks]);
  else if (b === 'log') cube(BM.B_LOG_Y, [PAT.logEnd, PAT.logSide, PAT.logSide]);
  else if (b === 'glass') { blockCube(pc, BM.B_GLASS, [PAT.glass, PAT.glass, PAT.glass], { glass: true }); ink(pc, { skip: (X, Y) => pc.alpha(X, Y) > 0 }); }
  else if (b === 'dirt') cube(BM.B_DIRT, [PAT.dirt, PAT.dirt, PAT.dirt]);
  else if (b === 'ladder') ladder(pc);
  else if (b === 'torch') torch(pc);
  else if (b === 'lantern') lantern(pc);
  else if (b === 'door') door(pc);
  else if (b === 'chest') chest(pc);
  else if (b === 'workbench') bench(pc);
  else if (b === 'stick') sticks(pc);
  else if (b === 'sand') pile(pc, [0x9a7a4a, 0xae8c58, 0xc09e68, 0xd0b078], 0xe0c890, { shell: true, seed: 3 });
  else if (b === 'clay') clay(pc);
  else if (b === 'vine') vine(pc);
  else return false;
  return true;
}
