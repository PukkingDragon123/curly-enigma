// 32×32-per-tile pixel art for the mine: the sprite atlas (growing plants, animated
// creatures, misc props, dropped items, legacy ore overlay tiles) and the in-rock look of
// every ore deposit (oreBlob) for the micro-pixel world.
//
// Emissive pixels use the mine's alpha band: alpha in [140, 247) ⇒ glow = (0.97 - a/255) / 0.42
// (see glowOf in Render.js). Everything else is fully opaque or fully transparent.
import * as THREE from 'three';
import { PixelCanvas } from '../gfx/px/canvas.js';
import { mat, mix } from '../gfx/px/color.js';
import { Mask, vol, fill, sparkle, hash2, vnoise, bayer } from '../gfx/px/shade.js';
import { ring, lineIn } from '../gfx/px/parts.js';
import { leaf, leafMask, stem } from '../gfx/px/flora.js';
import { oreArt } from '../gfx/px/ores.js';
import { drawIconArt } from '../gfx/PixelArt.js';
import { CRITTER_DRAW, critterIconURL } from '../gfx/critters32.js';
import { hashStr } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { ORES } from './blocks.js';
import { registerCreatureIcons } from '../ui/UI.js';

export const T = 32;
/** Strongest glow alpha (glow = 1). */
export const GLOW_A = 140;
/** Alpha for a glow strength g in 0..1. */
export const glowAlpha = (g) => Math.max(GLOW_A, Math.min(246, Math.round((0.97 - 0.42 * Math.min(1, g)) * 255)));

/**
 * Convert a drawn PixelCanvas to the mine's encoding in place: emissive pixels get their
 * glow alpha, translucent decoration either becomes opaque (alpha ≥ 160) or is dropped.
 */
export function encodeGlow(pc) {
  const d = pc.d, n = pc.w * pc.h;
  for (let i = 0; i < n; i++) {
    const a = d[i * 4 + 3];
    if (!a) continue;
    const g = pc.glow ? pc.glow[i] : 0;
    if (g > 0.05 && a >= 128) d[i * 4 + 3] = glowAlpha(g);
    else d[i * 4 + 3] = a >= 160 ? 255 : 0;
  }
  return pc;
}

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };
const M = () => new Mask(T, T);

// ---------------------------------------------------------------- plants growing in the mine (2 frames)
// Drawn standing on the bottom edge (y = 31). The renderer rotates them for walls/ceilings.
const PLANT_DRAW = {
  glowcap(pc, f) {
    const ST = mat(0xe8e0d0), CP = mat(0x4ab0ff, { cont: 1.05 });
    const shroom = (cx, top, r, h) => {
      const s = new Mask(T, T).poly([[cx - r * 0.3, top], [cx + r * 0.3, top], [cx + r * 0.38, top + h], [cx - r * 0.38, top + h]]);
      ring(pc, s, ST); vol(pc, s, ST, { mode: 'cyl', axis: Math.PI / 2 });
      const gills = M().ellipse(cx, top + 0.5, r * 0.95, r * 0.3);
      const cap = M().ellipse(cx, top - r * 0.1, r, r * 0.72).sub(M().rect(0, Math.round(top + 0.5), T, T));
      ring(pc, gills.clone().union(cap), CP);
      gills.each((x, y) => gl(pc, x, y, (x + f) % 2 ? 0xbff0ff : 0x7fd8ff, 1));
      vol(pc, cap, CP, { emit: 0.85, spec: 0.85, round: r * 0.6 });
      for (const [dx, dy] of [[-0.4, -0.35], [0.3, -0.5], [0.55, -0.1]]) gl(pc, cx + dx * r, top + dy * r, 0xe0f8ff, 1);
    };
    shroom(22, 19, 4.4, 12.5);
    shroom(9, 15, 5.4, 16.5);
    shroom(16, 8, 7, 23.5);
    // drifting spores
    for (const [x, y] of f ? [[5, 6], [26, 9], [13, 2]] : [[6, 9], [25, 12], [12, 4]]) gl(pc, x, y, 0xbff0ff, 0.9);
  },
  carrot(pc, f) {
    const LR = mat(0x5aa84a, { cont: 1.1 });
    const sw = f ? 1 : 0;
    leaf(pc, 16, 26, 8 - sw, 6, 2.6, LR, { bend: 1.4 });
    leaf(pc, 16, 26, 25 + sw, 7, 2.6, LR, { bend: -1.4 });
    leaf(pc, 16, 26, 16 + sw, 3, 2.4, LR, { bend: 0.6 });
    leaf(pc, 16, 27, 5, 16, 2, LR, { bend: 1 });
    // carrot shoulder peeking out of the ground
    const R = mat(0xf0b884, { cont: 1.1 });
    const top = M().ellipse(16, 30, 5.5, 3.6);
    ring(pc, top, R); vol(pc, top, R, { round: 2.5 });
    lineIn(pc, 13, 30, 15, 31, R[4]);
  },
  fern(pc, f) {
    const R = mat(0xd8dfcc, { cont: 1.1, sat: 0.8 });
    frond(pc, 16, 31, 26, -1.75 + (f ? 0.06 : 0), 1.4, R);
    frond(pc, 15, 31, 20, -1.4, -1.3 + (f ? 0.1 : 0), R);
    frond(pc, 17, 31, 15, -1.95, 1.1, R);
  },
  whisper(pc, f) {
    const R = mat(0xa684c8, { cont: 1.1 });
    const s = f ? 1 : -1;
    const tendril = (pts, r) => { const m = new Mask(T, T).path(pts, r); ring(pc, m, R); vol(pc, m, R, { round: 1 }); return m; };
    tendril([[12, 31], [10, 24], [6, 19], [5 + s, 12], [8 + s, 7], [11 + s, 9]], 1.2);
    tendril([[16, 31], [17, 22], [15, 14], [17 + s, 6], [21 + s, 3], [22 + s, 6]], 1.4);
    tendril([[20, 31], [24, 24], [27, 17], [25 + s, 11], [28 + s, 8]], 1.1);
    for (const [x0, y0, x1, y1] of [[10, 23, 5, 25], [16, 17, 21, 16], [25, 21, 29, 22], [16, 25, 12, 27]]) leaf(pc, x0, y0, x1, y1, 1.4, mat(0x8a70b0), { bend: 0.5 });
    for (const [x, y] of [[11 + s, 9], [22 + s, 6], [28 + s, 8]]) { gl(pc, x, y, 0xf0e0ff, 0.9); gl(pc, x + 1, y, 0xd0b8f8, 0.7); }
  },
  vine(pc, f) {
    // rubber vine: a twisting stem with broad leaves and beads of pale sap
    const VR = mat(0x4a7a3a, { cont: 1.1 });
    const pts = [];
    for (let y = 31; y >= 1; y -= 2) pts.push([16 + Math.sin(y * 0.35) * 4, y]);
    stem(pc, pts, 1.6, VR);
    const LR = mat(0x5aa84a, { cont: 1.1 });
    for (const [y, s] of [[26, -1], [19, 1], [12, -1], [6, 1]]) {
      const x = 16 + Math.sin(y * 0.35) * 4;
      leaf(pc, x, y, x + s * (8 + (f && s > 0 ? 1 : 0)), y - 3 - (f ? 1 : 0), 2.8, LR, { bend: s * -1 });
    }
    const SR = mat(0xf0e2b0, { cont: 1.1 });
    for (const [y, dy] of [[22, f ? 2 : 0], [9, f ? 1 : 0]]) {
      const x = 16 + Math.sin(y * 0.35) * 4 + 1.5;
      const d = M().disk(x, y + 2 + dy, 1.7).union(M().rect(Math.round(x - 0.5), y, 1, 2 + dy));
      ring(pc, d, SR); vol(pc, d, SR, { spec: 0.75 });
    }
  },
  pepper(pc, f) {
    const LR = mat(0x4a8a3a, { cont: 1.1 });
    stem(pc, [[16, 31], [16, 22], [14, 15], [15, 9]], 1.1, LR);
    stem(pc, [[16, 23], [21, 17]], 0.8, LR);
    for (const [x0, y0, x1, y1, b] of [[15, 12, 7, 7, 1], [15, 10, 23, 5, -1], [16, 20, 8, 17, 1], [20, 18, 27, 14, -1]]) leaf(pc, x0, y0, x1, y1, 2.2, mat(0x5aa84a), { bend: b });
    const R = mat(0xd83a26, { cont: 1.2, warm: 40 });
    const sw = f ? 1 : 0;
    for (const [x, y, l] of [[12, 15, 7], [21, 18, 6], [17, 23, 5]]) {
      const m = M();
      for (let i = 0; i <= 10; i++) { const t = i / 10; m.disk(x + Math.sin(t * 2) * 1.2 + sw * t, y + t * l, Math.max(0.5, 2 * (1 - t * 0.85))); }
      ring(pc, m, R); vol(pc, m, R, { spec: 0.75, round: 1.5 });
      pc.set(x, y - 1, 0x3a7a2a);
    }
  },
  sparkmoss(pc, f) {
    const R = mat(0x3a86d8, { cont: 1.1 });
    const moss = M();
    const tufts = [[6, 28, 4], [12, 26, 5], [19, 25.5, 5.5], [26, 27.5, 4.4], [16, 29, 4.5], [9, 30, 3.5], [23, 30, 3.6]];
    for (const [x, y, r] of tufts) moss.disk(x, y, r);
    moss.and(M().rect(0, 0, T, T));
    ring(pc, moss, R);
    vol(pc, moss, R, { round: 3.5 });
    for (const [x, y, r] of tufts) M().disk(x, y, r).and(moss).edge().each((X, Y) => { if (X + Y > x + y + r * 0.8) pc.set(X, Y, R[4]); });
    moss.each((x, y) => { if (hash2(x, y, 4) < 0.18) { const k = R.indexOf(pc.getHex(x, y)); if (k > 1) pc.set(x, y, R[k - 1]); } });
    const bolts = f ? [[[8, 20], [10, 16], [8, 13]], [[22, 19], [20, 15], [23, 12]]] : [[[13, 19], [11, 15], [14, 12]], [[25, 21], [27, 17], [25, 14]]];
    for (const pts of bolts) for (let i = 0; i + 1 < pts.length; i++) lineIn(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0xfff27a, null, 1);
    for (const [x, y] of f ? [[16, 14], [4, 18]] : [[18, 13], [6, 16]]) gl(pc, x, y, 0xffffff);
  },
  bubble(pc, f) {
    const LR = mat(0x5a9a4a);
    leaf(pc, 16, 31, 6, 26, 2.4, LR, { bend: 1 });
    leaf(pc, 16, 31, 26, 26, 2.4, LR, { bend: -1 });
    stem(pc, [[16, 31], [16, 22]], 1.2, mat(0x4a8a3a));
    const R = mat(0xc8a8f8, { cont: 1.1 });
    const r = f ? 9.5 : 8.5;
    const bulb = M().ellipse(16, 22 - r, r, r).poly([[13, 21], [19, 21], [16, 24]]);
    ring(pc, bulb, R);
    vol(pc, bulb, R, { spec: 0.8, shine: 10, round: 5 });
    for (const [dx, dy, rr] of [[-3, 2, 2.2], [3, -2, 1.6], [2, 4, 1.2], [-4, -4, 1]]) {
      const x = 16 + dx, y = 22 - r + dy;
      M().disk(x, y, rr).edge().each((X, Y) => pc.set(X, Y, (X - x) + (Y - y) < 0 ? R[1] : R[4]));
      pc.set(x - rr * 0.4, y - rr * 0.4, 0xffffff);
    }
  },
  lily(pc, f) {
    const LR = mat(0x6aa8a0, { cont: 1.05 });
    stem(pc, [[16, 31], [16, 22], [15, 17]], 1, LR);
    leaf(pc, 16, 29, 25, 23, 2.2, LR, { bend: -1.2 });
    leaf(pc, 16, 28, 7, 24, 2, LR, { bend: 1 });
    const R = mat(0xc8ecff, { cont: 1.25, hs: 0.7 });
    const open = f ? 1 : 0;
    for (const [[x1, y1], w, b] of [[[6 - open, 7], 3.2, 1.2], [[24 + open, 6], 3.2, -1.2], [[15, 3], 3.4, 0], [[9, 14], 2.6, 0.5], [[22, 14], 2.6, -0.5]]) {
      const m = leaf(pc, 15, 17, x1, y1, w, R, { bend: b, rib: R[0] });
      m.each((x, y) => pc.emit(x, y, 0.45));
    }
    for (const [x, y] of [[14, 11], [16, 10], [18, 12]]) gl(pc, x, y, 0xfff2b0, 1);
    if (f) gl(pc, 24, 18, 0xffffff, 0.9); else gl(pc, 7, 17, 0xffffff, 0.9);
  },
  gloom(pc, f) {
    const ST = mat(0x9a8aa8), CP = mat(0x5a3478, { cont: 1.1 });
    const s = M().poly([[13, 16], [18, 16], [19.5, 31], [11.5, 31]]);
    ring(pc, s, ST); vol(pc, s, ST, { mode: 'cyl', axis: Math.PI / 2 });
    const sk = M().ellipse(15.5, 21, 4.5, 1.6); ring(pc, sk, ST); vol(pc, sk, ST, { round: 1 });
    const cap = M().ellipse(15.5, 13, 11, 7.5).sub(M().rect(0, 16, T, 20)).union(M().ellipse(6, 15.5, 2.4, 2.4)).union(M().ellipse(25, 15.5, 2.4, 2.4));
    ring(pc, cap, CP);
    vol(pc, cap, CP, { round: 5, spec: 0.85 });
    for (const [x, y, r] of [[10, 10, 1.6], [17, 8, 1.3], [21, 12, 1.4], [13, 13.5, 1]]) { fill(pc, M().disk(x, y, r), CP[1]); pc.set(x - 0.5, y - 0.5, 0xd8b8f0); }
    for (const [x, y] of f ? [[5, 4], [9, 1], [24, 3], [28, 7]] : [[6, 6], [10, 3], [25, 5], [27, 10]]) { gl(pc, x, y, 0xc8a8e8, 0.5); pc.set(x + 1, y, 0x8a68b8); }
  },
  ashfern(pc, f) {
    const R = mat(0x9a948e, { cont: 1.05 });
    frond(pc, 16, 31, 26, -1.75 + (f ? 0.05 : 0), 1.4, R);
    frond(pc, 15, 31, 20, -1.4, -1.3, R);
    frond(pc, 17, 31, 15, -1.95, 1.1, R);
    for (const [x, y] of f ? [[24, 6], [6, 9], [20, 2]] : [[25, 7], [5, 10], [19, 3]]) { gl(pc, x, y, 0xff7a2a, 1); gl(pc, x, y - 1, 0xffc070, 0.8); }
  },
  ember(pc, f) {
    const LR = mat(0x4a5a2a);
    stem(pc, [[16, 31], [15, 25], [16, 20]], 1, LR);
    leaf(pc, 16, 28, 7, 24, 2, LR, { bend: 1 });
    leaf(pc, 16, 27, 25, 24, 2, LR, { bend: -1 });
    const R = mat(0xe8501e, { cont: 1.15, warm: 40 });
    const cup = M();
    for (const a of [-2.6, -2.0, -1.57, -1.14, -0.54]) cup.union(leafMask(16, 21, 16 + Math.cos(a) * 9, 21 + Math.sin(a) * 9, 3, 0));
    ring(pc, cup, R);
    vol(pc, cup, R, { round: 2.5, emit: 0.5 });
    const fl = f ? [[11, 15], [12, 6], [15, 11], [17, 2], [19, 10], [22, 4], [22, 15], [16, 18]] : [[11, 15], [13, 4], [15, 10], [16, 1], [18, 9], [21, 6], [22, 15], [16, 18]];
    const fm = M().poly(fl);
    fm.each((x, y) => gl(pc, x, y, y < 8 ? 0xfff2a0 : y < 13 ? 0xffc040 : 0xff7a20, 1));
    for (const [x, y] of f ? [[8, 5], [24, 8]] : [[9, 3], [23, 6]]) gl(pc, x, y, 0xffb04a, 1);
  },
  frost(pc, f) {
    const LR = mat(0x7aa8b8);
    stem(pc, [[16, 31], [16, 22]], 1, LR);
    leaf(pc, 16, 29, 25, 26, 2, LR, { bend: -1 });
    leaf(pc, 16, 28, 7, 25, 2, LR, { bend: 1 });
    const R = mat(0xbdf2ff, { cont: 1.2, hs: 0.6 });
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 3 + (f ? 0.08 : 0);
      const m = leaf(pc, 16, 14, 16 + Math.cos(a) * 10, 14 + Math.sin(a) * 10, 2.5, R, { rib: 0xffffff, spec: 0.85 });
      m.each((x, y) => pc.emit(x, y, 0.35));
    }
    const c = M().disk(16, 14, 2.4);
    vol(pc, c, mat(0xe8fbff), { emit: 0.8 });
    for (const [x, y] of f ? [[5, 6], [27, 4]] : [[4, 9], [26, 7]]) sparkle(pc, x, y, 1, 0xffffff, 0xbff6ff, 0.9);
  },
  lotus(pc, f) {
    const PD = mat(0x3a8a5a, { cont: 1.05 });
    const pad = M().ellipse(16, 28, 15, 3.6);
    ring(pc, pad, PD); vol(pc, pad, PD, { round: 1.5 });
    const R = mat(0xff8ac8, { cont: 1.15 }), back = mat(0xe0609a, { cont: 1.1 });
    const o = f ? 1 : 0;
    for (const [a, l, w, Rr] of [[-2.25, 14 + o, 3.6, back], [-0.89, 14 + o, 3.6, back], [-1.57, 15, 3.8, back], [-2.8 - o * 0.05, 11, 3.2, R], [-0.34 + o * 0.05, 11, 3.2, R], [-2.0, 9, 3.4, R], [-1.14, 9, 3.4, R]]) {
      const m = leaf(pc, 16, 26, 16 + Math.cos(a) * l, 26 + Math.sin(a) * l, w, Rr, { rib: Rr[1] });
      m.each((x, y) => pc.emit(x, y, 0.3));
    }
    vol(pc, M().ellipse(16, 23, 3.4, 2.6), mat(0xffd84a), { emit: 1 });
    for (const [x, y] of [[15, 22], [17, 22]]) gl(pc, x, y, 0xfff8c0);
  },
  web(pc) {
    // radial threads + spiral, a few dew drops (opaque, faintly glowing drops)
    const c = 0xe8f0ff;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + 0.2; lineIn(pc, 16, 16, 16 + Math.cos(a) * 16, 16 + Math.sin(a) * 16, c); }
    for (let r = 3; r < 15; r += 2.6) {
      let prev = null;
      for (let i = 0; i <= 8; i++) {
        const a = i * Math.PI / 4 + 0.2;
        const p = [16 + Math.cos(a) * r, 16 + Math.sin(a) * r];
        if (prev) lineIn(pc, prev[0], prev[1], p[0], p[1], 0xd0dcf0);
        prev = p;
      }
    }
    for (const [x, y] of [[20, 10], [9, 19], [23, 22], [12, 8]]) gl(pc, x, y, 0xffffff, 0.5);
  },
};

/** Fern frond for the in-world fern / ashfern (same idea as the icon frond). */
function frond(pc, x0, y0, len, ang, curl, R) {
  const pts = [];
  let x = x0, y = y0, a = ang;
  for (let i = 0; i <= len; i++) { pts.push([x, y]); x += Math.cos(a); y += Math.sin(a); a += (curl * 2 * i) / (len * len); }
  const all = M();
  const leaflets = [];
  for (let i = 3; i < pts.length - 1; i += 3) {
    const [px, py] = pts[i];
    const t = i / pts.length;
    const la = Math.atan2(pts[i + 1][1] - py, pts[i + 1][0] - px);
    const l = (1 - t) * 4.2 + 1.2;
    for (const s of [-1, 1]) {
      const a2 = la + s * (Math.PI / 2 - 0.5);
      const m = leafMask(px, py, px + Math.cos(a2) * l, py + Math.sin(a2) * l, Math.max(0.6, l * 0.3), s * 0.5);
      leaflets.push(m); all.union(m);
    }
  }
  const rach = new Mask(T, T).path(pts, 0.6);
  all.union(rach);
  ring(pc, all, R);
  for (const m of leaflets) vol(pc, m, R, { round: 1.2 });
  fill(pc, rach, R[4]);
}

// ---------------------------------------------------------------- misc props
function flame(pc, f) {
  const cols = [0xfff4b0, 0xffd050, 0xff9a2a, 0xe0501a];
  const m = M().fn((x, y) => {
    const t = (31 - y) / 26; // 0 bottom .. 1 top
    if (t < 0 || t > 1) return false;
    const w = (1 - t) * 9 * (1 - t * 0.2) + 1;
    const cx = 16 + Math.sin(t * 5 + f * 2.1) * 2.2 * t;
    return Math.abs(x + 0.5 - cx) < w;
  });
  // tongues
  for (const [dx, h] of [[-6, 10], [5, 13], [-1, 18]]) m.union(M().poly([[16 + dx - 2.5, 31], [16 + dx + Math.sin(f * 2 + dx) * 2, 31 - h - f], [16 + dx + 2.5, 31]]));
  m.each((x, y) => {
    const t = (31 - y) / 26;
    const core = Math.abs(x + 0.5 - 16) < (1 - t) * 4;
    gl(pc, x, y, core ? (t < 0.5 ? cols[0] : cols[1]) : t < 0.35 ? cols[1] : t < 0.65 ? cols[2] : cols[3], 1);
  });
}

const MISC_DRAW = {
  beam(pc) {
    const W = mat(0x9a6a3a, { cont: 1.05 });
    const post = M().rect(12, 5, 8, 27);
    ring(pc, post, W); vol(pc, post, W, { mode: 'cyl', axis: Math.PI / 2, flat: 0.5 });
    post.each((x, y) => { if (vnoise(x * 0.9, y * 0.12, 3) > 0.68) { const k = W.indexOf(pc.getHex(x, y)); if (k > 0 && k < 5) pc.set(x, y, W[k + 1]); } });
    const cap = M().rect(0, 0, 32, 6);
    ring(pc, cap, W); vol(pc, cap, W, { mode: 'cyl', axis: 0, flat: 0.5 });
    cap.each((x, y) => { if (vnoise(x * 0.12, y * 0.9, 7) > 0.68) { const k = W.indexOf(pc.getHex(x, y)); if (k > 0 && k < 5) pc.set(x, y, W[k + 1]); } });
    const I = mat(0x5a5a64, { cont: 1.1 });
    const br = M().poly([[9, 6], [12, 6], [12, 11]]).union(M().poly([[20, 6], [23, 6], [20, 11]]));
    fill(pc, br, I[3]);
    for (const [x, y] of [[3, 2], [28, 2], [15, 9], [16, 25]]) { pc.set(x, y, I[1]); pc.set(x + 1, y, I[5]); }
  },
  stake(pc) {
    const W = mat(0x9a6a3a, { cont: 1.05 });
    const st = M().poly([[14, 12], [18, 12], [18, 26], [16, 31], [14, 26]]);
    ring(pc, st, W); vol(pc, st, W, { mode: 'cyl', axis: Math.PI / 2 });
    const LR = mat(0x7bf08a, { cont: 1.1 });
    const c = M().poly([[16, 1], [21, 7], [16, 12], [11, 7]]);
    ring(pc, c, LR);
    c.each((x, y) => gl(pc, x, y, LR[x < 16 ? (y < 7 ? 1 : 2) : (y < 7 ? 3 : 4)], 1));
    gl(pc, 15, 4, 0xffffff);
  },
  bell(pc) {
    const W = mat(0x6a4424);
    const arm = M().rect(4, 0, 24, 3); ring(pc, arm, W); vol(pc, arm, W, { mode: 'cyl', axis: 0 });
    const I = mat(0x4a4a52); fill(pc, M().rect(15, 3, 2, 3), I[3]);
    const G = mat(0xe0b040, { cont: 1.2, warm: 55 });
    const b = M().poly([[9, 27], [10, 13], [16, 6], [22, 13], [23, 27]]).union(M().rect(7, 25, 18, 3));
    ring(pc, b, G); vol(pc, b, G, { mode: 'cyl', axis: Math.PI / 2, spec: 0.8 });
    for (let x = 8; x < 25; x++) pc.set(x, 25, G[1]);
    const cl = M().disk(16, 29.5, 2); ring(pc, cl, G); vol(pc, cl, mat(0x8a6a20), { round: 1 });
  },
  sign(pc) {
    const W = mat(0x9a6a3a, { cont: 1.05 });
    const post = M().rect(14, 16, 4, 16); ring(pc, post, W); vol(pc, post, W, { mode: 'cyl', axis: Math.PI / 2 });
    const bd = M().rect(3, 3, 26, 14); ring(pc, bd, W); vol(pc, bd, W, { round: 2 });
    for (let y = 7; y < 17; y += 4) for (let x = 3; x < 29; x++) pc.set(x, y, W[4]);
    // painted down-arrow (to the lift)
    const A = 0xf4e6c4;
    for (let y = 5; y < 11; y++) { pc.set(15, y, A); pc.set(16, y, A); }
    for (let i = 0; i < 5; i++) { pc.set(11 + i, 10 + i * 0.6, A); pc.set(20 - i, 10 + i * 0.6, A); }
    pc.set(15, 14, A); pc.set(16, 14, A);
  },
  spark(pc) {
    for (const [x, y, c] of [[15, 15, 0xffffff], [16, 15, 0xffffff], [15, 16, 0xffffff], [16, 16, 0xffffff], [14, 15, 0xfff8d0], [17, 16, 0xfff8d0], [15, 14, 0xfff8d0], [16, 17, 0xfff8d0]]) gl(pc, x, y, c, 1);
  },
  glint(pc) {
    sparkle(pc, 16, 16, 3, 0xffffff, 0xfffbe0, 1);
    for (const [x, y] of [[16, 9], [16, 23], [9, 16], [23, 16]]) gl(pc, x, y, 0xfff4c0, 0.8);
  },
  fire0(pc) { flame(pc, 0); },
  fire1(pc) { flame(pc, 1); },
  fire2(pc) { flame(pc, 2); },
  lift(pc) {
    // the lift cage: brass-trimmed wooden frame with bars, roof pulley
    const W = mat(0x5a3a22, { cont: 1.05 }), G = mat(0xd0a040, { cont: 1.2 });
    const back = M().rect(2, 5, 28, 26); fill(pc, back, 0x2a1a12);
    for (let x = 4; x < 29; x += 4) { const bar = M().rect(x, 6, 2, 24); vol(pc, bar, G, { mode: 'cyl', axis: Math.PI / 2, spec: 0.8 }); }
    for (const y of [4, 29]) { const r = M().rect(1, y, 30, 3); ring(pc, r, W); vol(pc, r, W, { mode: 'cyl', axis: 0 }); for (let x = 1; x < 31; x++) pc.set(x, y, G[1]); }
    for (const x of [1, 28]) { const p = M().rect(x, 4, 3, 28); ring(pc, p, W); vol(pc, p, W, { mode: 'cyl', axis: Math.PI / 2 }); }
    const pul = M().disk(16, 2, 2.2); ring(pc, pul, mat(0x5a5a64)); vol(pc, pul, mat(0x7a7a84), { spec: 0.8 });
    gl(pc, 6, 18, 0xffc860, 0.6);
  },
};

// ---------------------------------------------------------------- atlas
function makeTex(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.shared = true;
  return tex;
}
function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }
function tileUV(i, cols, rows) {
  const x = i % cols, y = Math.floor(i / cols);
  const e = 0.0004;
  return [x / cols + e, 1 - (y + 1) / rows + e, (x + 1) / cols - e, 1 - y / rows - e];
}

/** Item categories that can lie in the mine as pickups. */
const PICKUP_CATS = ['mineral', 'gem', 'plant', 'critter', 'drop', 'ingredient', 'food', 'consumable'];

/**
 * Build the 32px sprite atlas. Same shape as MineArt.buildSpriteAtlas():
 * { tex, canvas, items, plants, critters, misc, ore, uv(i), T: 32, cols, rows }
 *  items[itemId] → tile, plants[type] → [2 tiles], critters[type] → [4 tiles],
 *  misc[name] → tile, ore[oreId] → [2 tiles] (legacy whole-cell overlay).
 */
export function buildSpriteAtlas32() {
  const tiles = [];
  const put = (pc) => { tiles.push(pc); return tiles.length - 1; };
  const items = {};
  for (const id of Object.keys(ITEMS)) {
    const it = ITEMS[id];
    if (!PICKUP_CATS.includes(it.cat)) continue;
    items[id] = put(encodeGlow(drawIconArt(it.icon || { k: '?' }, hashStr(id), id)));
  }
  const plants = {};
  for (const [name, fn] of Object.entries(PLANT_DRAW)) {
    plants[name] = [];
    for (let f = 0; f < 2; f++) { const pc = new PixelCanvas(T); fn(pc, f); plants[name].push(put(encodeGlow(pc))); }
  }
  const critters = {};
  for (const [name, fn] of Object.entries(CRITTER_DRAW)) {
    critters[name] = [];
    for (let f = 0; f < 4; f++) { const pc = new PixelCanvas(T); fn(pc, f); critters[name].push(put(encodeGlow(pc))); }
  }
  const misc = {};
  for (const [name, fn] of Object.entries(MISC_DRAW)) { const pc = new PixelCanvas(T); fn(pc); misc[name] = put(encodeGlow(pc)); }
  const ore = {};
  for (const o of ORES) {
    if (!o) continue;
    ore[o.id] = [];
    for (let v = 0; v < 2; v++) ore[o.id].push(put(oreTile(o.item, v + 1)));
  }
  const cols = 32;
  const rows = nextPow2(Math.ceil(tiles.length / cols));
  const canvas = document.createElement('canvas');
  canvas.width = cols * T;
  canvas.height = rows * T;
  const ctx = canvas.getContext('2d');
  tiles.forEach((pc, i) => ctx.drawImage(pc.commit(), (i % cols) * T, Math.floor(i / cols) * T));
  const tex = makeTex(canvas);
  const uv = (i) => tileUV(i, cols, rows);
  registerCreatureIcons(critterIconURL);
  return { tex, canvas, items, plants, critters, misc, ore, uv, T, cols, rows };
}

/** A deposit centered in one 32×32 cell tile (legacy overlay; transparent = rock). */
function oreTile(itemId, seed) {
  const art = oreArt(itemId, seed);
  const pc = new PixelCanvas(T);
  const ox = Math.round((T - art.w) / 2), oy = Math.round((T - art.h) / 2);
  for (let y = 0; y < art.h; y++) for (let x = 0; x < art.w; x++) {
    const a = art.alpha(x, y);
    if (!a) continue;
    pc.set(x + ox, y + oy, art.getHex(x, y), a);
    const g = art.glowAt(x, y);
    if (g) pc.emit(x + ox, y + oy, g);
  }
  return encodeGlow(pc);
}

// ---------------------------------------------------------------- ore deposits (micro-pixel world)
const blobCache = new Map();

/**
 * In-rock look of one ore deposit. idx 0 = host rock (not part of the ore). pal ≤ 15 colors
 * (index 1..15 used; pal[0] is a placeholder). glow[i] 0..1 per palette entry (emissive).
 * stain[i] = true when that palette entry is only discoloured host rock around the deposit
 * (tarnish halo, rime, matrix specks): it should chip like rock, not count as ore.
 * Sizes are in micro-pixels (32 per cell): nuggets ~10–16, deposits ~16–26, geodes/fossils up to ~40.
 * @returns {{w:number, h:number, pal:number[], idx:Uint8Array, glow:number[], stain:boolean[], item:string}}
 */
export function oreBlob(itemId, seed = 1) {
  const key = itemId + ':' + seed;
  if (blobCache.has(key)) return blobCache.get(key);
  const art = oreArt(itemId, seed);
  const { w, h } = art;
  // gather colors with their glow / stain stats
  const stats = new Map();
  const px = new Int32Array(w * h).fill(-1);
  for (let i = 0; i < w * h; i++) {
    if (art.d[i * 4 + 3] < 128) continue;
    const c = (art.d[i * 4] << 16) | (art.d[i * 4 + 1] << 8) | art.d[i * 4 + 2];
    px[i] = c;
    let s = stats.get(c);
    if (!s) { s = { c, n: 0, g: 0, st: 0 }; stats.set(c, s); }
    s.n++;
    s.g += art.glow ? art.glow[i] : 0;
    s.st += art.stain.m[i] ? 1 : 0;
  }
  // reduce to ≤ 15 entries by merging the closest colors (never mixing glow/non-glow or stain/ore if avoidable)
  let list = [...stats.values()].map((s) => ({ ...s, members: [s.c] }));
  const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const dist = (a, b) => {
    const A = rgb(a.c), B = rgb(b.c);
    let d = (A[0] - B[0]) ** 2 * 0.3 + (A[1] - B[1]) ** 2 * 0.59 + (A[2] - B[2]) ** 2 * 0.11;
    if ((a.g / a.n > 0.05) !== (b.g / b.n > 0.05)) d += 40000;
    if ((a.st / a.n > 0.5) !== (b.st / b.n > 0.5)) d += 60000;
    return d * Math.min(a.n, b.n);
  };
  while (list.length > 15) {
    let bi = 0, bj = 1, bd = Infinity;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const d = dist(list[i], list[j]);
      if (d < bd) { bd = d; bi = i; bj = j; }
    }
    const A = list[bi], B = list[bj];
    const keep = A.n >= B.n ? A : B;
    const merged = { c: keep.c, n: A.n + B.n, g: A.g + B.g, st: A.st + B.st, members: [...A.members, ...B.members] };
    list = list.filter((_, k) => k !== bi && k !== bj);
    list.push(merged);
  }
  list.sort((a, b) => b.n - a.n);
  const pal = [0], glow = [0], stainFlags = [false];
  const lut = new Map();
  list.forEach((e, k) => {
    pal.push(e.c);
    glow.push(Math.round(Math.min(1, e.g / e.n) * 100) / 100);
    stainFlags.push(e.st / e.n > 0.5);
    for (const c of e.members) lut.set(c, k + 1);
  });
  const idx = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (px[i] >= 0) idx[i] = lut.get(px[i]) || 0;
  const out = { w, h, pal, idx, glow, stain: stainFlags, item: itemId };
  blobCache.set(key, out);
  return out;
}

/** Simple textured host rock for previews. */
function rockFill(pc, color, seed = 3) {
  const R = mat(color, { cont: 0.45, hs: 0.5 });
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const n = vnoise(x * 0.16, y * 0.16, seed) * 0.75 + hash2(x, y, seed) * 0.25;
    pc.set(x, y, R[n > 0.74 ? 2 : n < 0.26 ? 4 : 3]);
  }
}

/**
 * Review helper: a canvas (size×size micro-px, default 48) of host rock with the deposit
 * centered on it, glowing pixels brightened. Returns an HTMLCanvasElement.
 */
export function oreBlobCanvas(itemId, seed = 1, rockColor = 0x8a8480, size = 48) {
  const b = oreBlob(itemId, seed);
  const pc = new PixelCanvas(size);
  rockFill(pc, rockColor, seed);
  const ox = Math.floor((size - b.w) / 2), oy = Math.floor((size - b.h) / 2);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const k = b.idx[y * b.w + x];
    if (!k) continue;
    let c = b.pal[k];
    if (b.stain[k]) c = mix(pc.getHex(x + ox, y + oy), c, 0.75);
    if (b.glow[k] > 0) c = mix(c, 0xffffff, b.glow[k] * 0.15);
    pc.set(x + ox, y + oy, c);
  }
  return pc.commit();
}
