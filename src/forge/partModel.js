// Coop parts in 3D at the forge: every part is a set of small voxels (VX m) with three poses
// that the forging morphs through as you strike it:
//   bar    a hot, thick bar of the right amount of metal (what comes out of the ingots)
//   flat   the bar drawn out: straight strips and flat sheets laid side by side (the flat
//          blanks: a strap for every bracket arm, a disk for every bell, a net for every box)
//   final  the strips bent, the sheets raised and folded into the part
// p 0 … 0.45 draws the bar out (stone by stone from one end), 0.45 … 1 bends and folds it
// (from the tongs' end on). Each track has its own shapes (shelves: brackets and racks, legs:
// bands, talons, braces, spurs, nest: box, warming pan, bell, chute: funnel and trough, lamp:
// lanterns) and the levels differ. Late voxels (straw, a candle, the lumite) are set in when
// the work is done. PartView renders it all as two instanced meshes.
import * as THREE from 'three';
import { voxelMaterial } from '../gfx/Voxel.js';
import { METALS } from '../data/weapons.js';
import { applyHeat, glowAmount, glowHex } from './blackbody.js';
import { mixHex, shade } from '../core/util.js';
import { makeGlow } from '../bookends/fx.js';
import { COOP_PARTS } from '../data/coopParts.js';

export const VX = 0.0075; // meters per voxel
const TAU = Math.PI * 2;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const hash = (a, b, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2246822519) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// tones: 0 body, 1 dark (holes, rivets), 2 bright (rims, bolts); late voxels carry a color
// ---------------------------------------------------------------- the builder
class Shape {
  constructor() { this.v = []; this.keys = new Map(); this.comps = []; }
  comp(kind = 'lanes') { const c = { id: this.comps.length, kind, x0: 0, z0: 0 }; this.comps.push(c); return c; }
  add(x, y, z, o = {}) {
    const ix = Math.round(x), iy = Math.round(y), iz = Math.round(z);
    const k = ix + ',' + iy + ',' + iz;
    const had = this.keys.get(k);
    if (had) { if (o.tone && !had.late) had.tone = Math.max(had.tone, o.tone); return null; }
    const vx = { f: [ix, iy, iz], tone: o.tone || 0, late: o.late || null, comp: o.comp || null, flat: o.flat || null, lane: o.lane ?? null, s: o.s ?? 0, lf: o.lf || [0, 0] };
    this.keys.set(k, vx);
    this.v.push(vx);
    return vx;
  }
}

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * A strap along a polyline. cross: [[a, b, fz?, fy?], ...] offsets across (a: sideways, b: up
 * from the path) and where that lane lies in the flat strip (fz across, fy layer).
 * o: { tone(t, c) | tone, taper(t), comp }
 */
function sweep(S, pts, cross, o = {}) {
  const comp = o.comp || S.comp('lanes');
  let total = 0;
  const segs = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (L < 1e-6) continue;
    segs.push({ a, b, L, s0: total });
    total += L;
  }
  for (const sg of segs) {
    const T = norm([sg.b[0] - sg.a[0], sg.b[1] - sg.a[1], sg.b[2] - sg.a[2]]);
    let A = [-T[2], 0, T[0]];
    if (Math.hypot(A[0], A[2]) < 0.3) A = o.across || [0, 0, 1];
    A = norm(A);
    const U = norm(crossV(A, T));
    const n = Math.max(1, Math.ceil(sg.L / 0.35));
    for (let j = 0; j <= n; j++) {
      const s = (j / n) * sg.L;
      const t = total > 0 ? (sg.s0 + s) / total : 0;
      const k = o.taper ? o.taper(t) : 1;
      const P = [sg.a[0] + T[0] * s, sg.a[1] + T[1] * s, sg.a[2] + T[2] * s];
      for (const c of cross) {
        const ca = c[0] * k, cb = c[1] * k;
        const tone = typeof o.tone === 'function' ? o.tone(t, c, sg.s0 + s) : o.tone || 0;
        S.add(P[0] + A[0] * ca + U[0] * cb, P[1] + A[1] * ca + U[1] * cb, P[2] + A[2] * ca + U[2] * cb,
          { tone, comp, lane: comp.id + ':' + c[0] + ':' + c[1], s: sg.s0 + s, lf: [c[2] ?? c[0], c[3] ?? Math.max(0, c[1])] });
      }
    }
  }
  return comp;
}

/** Arc points: center c, radius r, angles a0→a1, in plane 'xz' | 'xy' | 'yz'. */
function arc(c, r, a0, a1, plane = 'xz', n = 0) {
  const N = n || Math.max(6, Math.ceil(Math.abs(a1 - a0) * r / 0.8));
  const out = [];
  for (let i = 0; i <= N; i++) {
    const a = a0 + (a1 - a0) * (i / N);
    const ca = Math.cos(a) * r, sa = Math.sin(a) * r;
    out.push(plane === 'xz' ? [c[0] + ca, c[1], c[2] + sa] : plane === 'xy' ? [c[0] + ca, c[1] + sa, c[2]] : [c[0], c[1] + sa, c[2] + ca]);
  }
  return out;
}

/**
 * A surface of revolution round the y axis (profile [[r, y], ...]); flattened to a disk of the
 * same area (or a square sheet when o.square). o: { th (layers inward), tone(r, y, phi, layer), square, at: [x, z] }
 */
function revolve(S, prof, o = {}) {
  const comp = S.comp('sheet');
  const th = o.th || 1;
  const at = o.at || [0, 0];
  // sample the profile and its swept area
  const samp = [];
  let area = 0;
  for (let i = 0; i + 1 < prof.length; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    const L = Math.hypot(r1 - r0, y1 - y0);
    const n = Math.max(1, Math.ceil(L / 0.35));
    for (let j = i === 0 ? 0 : 1; j <= n; j++) {
      const t = j / n;
      const r = r0 + (r1 - r0) * t, y = y0 + (y1 - y0) * t;
      if (samp.length) { const p = samp[samp.length - 1]; area += Math.PI * (p.r + r) * Math.hypot(r - p.r, y - p.y); }
      const nx = -(y1 - y0) / (L || 1), ny = (r1 - r0) / (L || 1); // inward-ish normal in (r, y)
      samp.push({ r, y, area, nx, ny });
    }
  }
  const r00 = Math.max(0, prof[0][0]);
  for (const sp of samp) {
    const rho = Math.sqrt(r00 * r00 + sp.area / Math.PI);
    for (let layer = 0; layer < th; layer++) {
      const r = Math.max(0, sp.r + sp.nx * layer), y = sp.y + sp.ny * layer;
      const n = Math.max(1, Math.ceil((TAU * Math.max(r, rho)) / 0.45));
      for (let k = 0; k < n; k++) {
        const phi = (k / n) * TAU;
        let cx = Math.cos(phi), sz = Math.sin(phi);
        let fx = cx, fz = sz;
        if (o.square) { const m = Math.max(Math.abs(cx), Math.abs(sz)); cx /= m; sz /= m; fx = cx; fz = sz; }
        const tone = o.tone ? o.tone(r, y, phi, layer) : 0;
        if (tone < 0) continue;
        S.add(at[0] + cx * r, y, at[1] + sz * r, { tone, comp, flat: [fx * rho, layer, fz * rho] });
      }
    }
  }
  return comp;
}

/** Flat plate (y = y0, thickness th) over the cells where fn(x, z) is true; flat = itself. */
function plate(S, x0, x1, z0, z1, y0 = 0, o = {}) {
  const comp = S.comp('sheet');
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    if (o.fn && !o.fn(x, z)) continue;
    for (let j = 0; j < (o.th || 1); j++) S.add(x, y0 + j, z, { tone: o.tone ? o.tone(x, z) : 0, comp, flat: [x, j, z] });
  }
  return comp;
}

/** Open box (bottom + four walls) folded from its net. o: { cut(x, y, z), tone(x, y, z) } */
function box(S, w, d, h, o = {}) {
  const comp = S.comp('sheet');
  const hw = Math.floor(w / 2), hd = Math.floor(d / 2);
  const add = (x, y, z, f) => { if (o.cut && o.cut(x, y, z)) return; S.add(x, y, z, { tone: o.tone ? o.tone(x, y, z) : 0, comp, flat: f }); };
  for (let x = -hw; x <= hw; x++) for (let z = -hd; z <= hd; z++) add(x, 0, z, [x, 0, z]);
  for (let y = 1; y <= h; y++) {
    for (let x = -hw; x <= hw; x++) { add(x, y, hd, [x, 0, hd + y]); add(x, y, -hd, [x, 0, -hd - y]); }
    for (let z = -hd + 1; z <= hd - 1; z++) { add(hw, y, z, [hw + y, 0, z]); add(-hw, y, z, [-hw - y, 0, z]); }
  }
  return comp;
}

/** Late voxels (not forged: set in at the end), color hex, glow 0..1. */
function late(S, x, y, z, color, glow = 0) { S.add(x, y, z, { late: { color, glow } }); }

const C3x2 = [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const C2x2 = [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]];
const C2x1 = [[-0.5, 0], [0.5, 0]];
const C1x2 = [[0, 0], [0, 1]];
const C1 = [[0, 0]];

// ---------------------------------------------------------------- the parts
function bracket(S, z, o = {}) {
  const holes = (t, c, s) => (c[1] === 1 && c[0] === 0 && (Math.abs(s - 22) < 0.6 || Math.abs(s - 28) < 0.6) ? 1 : 0);
  const H = o.h ?? 16, Lx = o.w ?? 16;
  sweep(S, [[0, 0, z], [0, H, z], [Lx, H, z]].concat(o.lip ? [[Lx, H + 2, z]] : []), o.cross || C3x2, { tone: holes });
  if (o.scroll) {
    sweep(S, arc([13, 3, z], 12, Math.PI, Math.PI / 2, 'xy'), o.cross2 || C2x2);
    const sp = [];
    for (let i = 0; i <= 18; i++) { const a = Math.PI / 2 - (i / 18) * TAU * 0.85; const r = 3 - (i / 18) * 1.9; sp.push([Lx + Math.cos(a) * r, H - 3 + Math.sin(a) * r, z]); }
    sweep(S, sp, C2x1, { tone: 2 });
  } else {
    sweep(S, [[1, 3, z], [Lx - 3, H - 1, z]], o.cross2 || C2x2);
  }
}

const SHAPES = {
  // your first pickaxe: a curved head (a point one end, a chisel the other) round an eye, an ash haft set in at the end
  pick_first(S) {
    const head = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, x = -14 + t * 28, y = 10 - 0.03 * x * x; head.push([x, y, 0]); }
    sweep(S, head, C3x2, { taper: (t) => 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ** 0.5, tone: (t) => (t < 0.08 || t > 0.94 ? 1 : 0) });
    sweep(S, [[-2, 8, 0], [2, 8, 0]], C2x2, { tone: 2 }); // the eye's cheeks
    for (let y = -16; y <= 7; y++) for (const [x, z] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) late(S, x, y, z, (y + x) % 5 === 0 ? 0x7a5432 : y < -12 ? 0x5a3a22 : 0x9a6a42);
    for (let y = -14; y <= -10; y++) for (const [x, z] of [[1, 0], [-2, 0], [0, 1], [0, -2], [1, -1], [-2, -1], [-1, 1], [-1, -2]]) late(S, x, y, z, 0x4a2a18); // the leather grip
  },
  shelf_copper(S) { bracket(S, 0, { lip: true }); },
  shelf_bronze(S) { bracket(S, 0, { scroll: true, w: 17 }); },
  shelf_iron(S) {
    for (const z of [-9, 9]) bracket(S, z, { cross: C2x2, cross2: C2x1, h: 15, w: 17 });
    for (const x of [1, 7, 13, 17]) sweep(S, [[x, 16, -10], [x, 16, 10]], C1x2, { tone: x === 17 ? 2 : 0 });
    sweep(S, [[18, 17, -10], [18, 17, 10]], C1, { tone: 2 });
    for (const z of [-4, 4]) sweep(S, [[0, 2, z], [0, 14, z]], C1); // a back strap for the wall bolts
  },
  shelf_steel(S) {
    const X = 15, Z = 10;
    sweep(S, [[-X, 0, -Z], [X, 0, -Z], [X, 0, Z], [-X, 0, Z], [-X, 0, -Z]], [[-0.5, 0], [0.5, 0]]);
    for (const x of [-7.5, 0, 7.5]) sweep(S, [[x, 0, -Z + 1], [x, 0, Z - 1]], C2x1, { tone: (t, c, s) => (Math.abs(s - 9) < 0.5 ? 1 : 0) });
    for (const z of [-Z, Z]) {
      sweep(S, [[-X + 1, 5, z], [X - 1, 5, z]], C1x2, { tone: 2 });
      for (const x of [-X + 1, -5, 5, X - 1]) sweep(S, [[x, 1, z], [x, 4, z]], C1);
    }
    for (const [x, z] of [[-X, -Z], [X, -Z], [-X, Z], [X, Z]]) sweep(S, arc([x, 1.5, z], 1.6, 0, Math.PI, 'xy'), C1, { tone: 2 });
  },
  legs_copper(S) {
    const ring = (cx, dir) => {
      const band = [[-0.5, 0, 0, 0], [0.5, 0, 0, 1], [-0.5, 1, 1, 0], [0.5, 1, 1, 1], [-0.5, 2, 2, 0], [0.5, 2, 2, 1], [-0.5, 3, 3, 0], [0.5, 3, 3, 1]];
      sweep(S, arc([cx, 0, 0], 6, dir > 0 ? Math.PI + 0.25 : 0.25, dir > 0 ? Math.PI + TAU - 0.25 : TAU - 0.25, 'xz'), band, { tone: (t, c) => (c[1] === 3 && c[0] > 0 ? 2 : 0) });
      const lx = dir > 0 ? cx - 6 : cx + 6;
      for (const z of [-1.2, 1.2]) sweep(S, [[lx, 0, z], [lx - 2.6 * dir, 0, z]], [[0, 0], [0, 1], [0, 2], [0, 3]]);
      sweep(S, [[lx - 2 * dir, 0, 0], [lx - 2 * dir, 4.6, 0]], C1, { tone: 2 });
    };
    ring(-8, 1); ring(8, -1);
  },
  legs_iron(S) {
    sweep(S, arc([0, 0, -3], 4.5, Math.PI * 0.15, Math.PI * 1.85, 'xz').map((p) => [p[0], p[1], p[2]]), [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1], [-0.5, 2], [0.5, 2]], { tone: (t) => (Math.abs(t - 0.5) < 0.04 || Math.abs(t - 0.2) < 0.03 || Math.abs(t - 0.8) < 0.03 ? 1 : 0) });
    for (const ang of [-0.7, 0, 0.7]) {
      const dx = Math.sin(ang), dz = Math.cos(ang);
      const P = (r, y) => [dx * r, y, -3 + dz * r];
      sweep(S, [P(3.5, 2), P(11, 2.5), P(14, 1.6), P(15.5, 0)], [[-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [0, 2]], { taper: (t) => 1 - t * 0.7, tone: (t) => (t > 0.86 ? 2 : 0) });
    }
  },
  legs_steel(S) {
    for (const z of [-4, 4]) {
      sweep(S, [[-14, 0, z], [14, 0, z]], [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]], { tone: (t, c, s) => (Math.abs(s - 6) < 0.5 || Math.abs(s - 22) < 0.5 ? 2 : 0) });
      const bow = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16; bow.push([-8 + 16 * t, 2 + Math.sin(t * Math.PI) * 4, z]); }
      sweep(S, bow, C2x1);
    }
    for (const x of [-15, 15]) sweep(S, arc([x, 0, 0], 5.5, 0, Math.PI, 'yz'), [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]], { across: [1, 0, 0], tone: (t) => (t < 0.06 || t > 0.94 ? 2 : 0) });
  },
  legs_mithril(S) {
    // a U-shaped heel band opening toward -z, a neck out the back and a star rowel on its pin
    const u = [[-7, 0, -8], [-7, 0, 0]].concat(arc([0, 0, 0], 7, Math.PI, 0, 'xz').slice(1), [[7, 0, -8]]);
    sweep(S, u, [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1], [-0.5, 2], [0.5, 2]], { tone: (t) => (t < 0.03 || t > 0.97 ? 2 : 0) });
    sweep(S, [[0, 1, 7], [0, 3, 12], [0, 6, 14]], C2x2);
    // the star rowel, standing in the yz plane on its pin
    const c = [0, 7.5, 16.5];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU + 0.2;
      sweep(S, [[c[0], c[1], c[2]], [c[0], c[1] + Math.sin(a) * 7, c[2] + Math.cos(a) * 7]], [[-0.5, 0], [0.5, 0]], { across: [1, 0, 0], taper: (t) => 1.2 - t, tone: (t) => (t > 0.8 ? 2 : 0) });
    }
    sweep(S, arc(c, 2.2, 0, TAU, 'yz'), [[-0.5, 0], [0.5, 0], [-0.5, 1], [0.5, 1]], { across: [1, 0, 0], tone: 2 });
  },
  nest_tin(S) {
    box(S, 17, 13, 8, {
      cut: (x, y, z) => z === 6 && y > 3 && (x / 5) ** 2 + ((y - 9) / 5.5) ** 2 < 1,
      tone: (x, y, z) => (y === 8 || (z === 6 && y > 3 && (x / 5) ** 2 + ((y - 9) / 5.5) ** 2 < 1.4) ? 2 : (Math.abs(x) === 8 && Math.abs(z) === 6 && y % 3 === 1) ? 1 : 0),
    });
    plate(S, -2, 2, -6, -6, 9, { th: 3, tone: (x) => (x === 0 ? 1 : 0) });
    for (let x = -6; x <= 6; x++) for (let z = -4; z <= 4; z++) if (hash(x, z, 3) > 0.25) late(S, x, 1 + (hash(x, z, 5) > 0.6 ? 1 : 0), z, hash(x, z, 7) > 0.5 ? 0xe8c060 : 0xc89a40);
  },
  nest_bronze(S) {
    revolve(S, [[0, 0], [7, 0], [7.4, 1.2], [7.9, 3]], { tone: (r, y) => (y > 2.6 ? 2 : 0) });
    revolve(S, [[8.4, 3.6], [7, 4.4], [4.5, 5.2], [2, 5.7], [0, 5.8]], { tone: (r, y, phi) => (r > 1.5 && r < 7 && Math.floor(r) % 2 === 0 && Math.floor(phi * 6) % 2 === 0 ? 1 : 0) });
    sweep(S, [[8, 2, 0], [16, 3, 0], [21, 4, 0]], C2x1, { tone: (t) => (t < 0.08 ? 2 : 0) });
    sweep(S, arc([23.2, 4, 0], 2.2, Math.PI, Math.PI + TAU, 'xz'), C1x2);
    late(S, 0, 6, 0, 0x8a5a2a); late(S, 0, 7, 0, 0xa06c3c);
  },
  nest_silver(S) {
    revolve(S, [[7, 0], [6.6, 1], [5.9, 2], [5.1, 4], [4.7, 6], [4.5, 8], [4.1, 10], [3.2, 11.5], [1.6, 12.3], [0, 12.5]], { tone: (r, y) => (Math.abs(y - 5) < 0.45 ? 2 : 0) });
    revolve(S, [[7.6, 0], [7.6, 1.2]], { tone: () => 2 });
    sweep(S, arc([0, 15.2, 0], 2.6, -Math.PI / 2, Math.PI * 1.5, 'xy'), C2x1);
  },
  chute_copper(S) {
    revolve(S, [[9, 17], [7, 14], [4.4, 11], [3.2, 9.5], [3.2, 7.5]], { at: [0, 0], tone: (r, y, phi) => (Math.abs(phi - Math.PI) < 0.12 && Math.round(y) % 2 === 0 ? 1 : (y > 16.4 ? 2 : 0)) });
    const U = [];
    for (let a = -2; a <= 2; a++) U.push([a, 0, a, 0]);
    for (const s of [-1, 1]) for (let b = 1; b <= 3; b++) U.push([s * 3, b, s * (2 + b), 0]);
    sweep(S, [[1, 6.5, 0], [6, 4.5, 0], [19, 0, 0]], U, { tone: (t, c) => (Math.abs(c[0]) === 3 && c[1] === 3 ? 2 : 0) });
    sweep(S, [[10, 0, -4], [10, 2.5, -4]], C1); sweep(S, [[10, 0, 4], [10, 2.5, 4]], C1);
  },
  lamp_tin(S) {
    plate(S, -5, 5, -5, 5, 0, { tone: (x, z) => (Math.abs(x) === 5 || Math.abs(z) === 5 ? 2 : 0) });
    for (const [x, z] of [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]]) sweep(S, [[x, 1, z], [x, 10, z]], C1);
    sweep(S, [[-5, 10.5, -5], [5, 10.5, -5], [5, 10.5, 5], [-5, 10.5, 5], [-5, 10.5, -5]], C1, { tone: 2 });
    revolve(S, [[6.5, 11.2], [0, 15.6]], { square: true });
    sweep(S, arc([0, 18, 0], 2.2, -Math.PI / 2, Math.PI * 1.5, 'xy'), C1);
    for (let y = 1; y <= 4; y++) for (const [x, z] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) late(S, x, y, z, y === 4 ? 0xfff4d8 : 0xf0e2c0);
    late(S, 0, 5, 0, 0xffd060, 1); late(S, -1, 5, -1, 0xffb030, 1); late(S, 0, 6, -1, 0xfff0a0, 1);
  },
  lamp_lumite(S) {
    plate(S, -6, 6, -6, 6, 0, { tone: (x, z) => (Math.abs(x) === 6 || Math.abs(z) === 6 ? 2 : 0) });
    for (const [x, z] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5], [0, -6], [0, 6], [-6, 0], [6, 0]]) sweep(S, [[x, 1, z], [x, 12, z]], C1);
    sweep(S, arc([0, 6, 0], 6.6, 0, TAU, 'xz'), C1, { tone: 2 });
    revolve(S, [[7.6, 12.6], [7, 14.2], [5, 16.2], [2.5, 17.4], [0, 17.8]]);
    sweep(S, arc([0, 20.4, 0], 2.4, -Math.PI / 2, Math.PI * 1.5, 'xy'), C1x2);
    const crystal = (x, z, h, w = 1) => { for (let y = 1; y <= h; y++) for (let dx = 0; dx <= w; dx++) for (let dz = 0; dz <= w; dz++) if (!(y === h && (dx || dz))) late(S, x + dx, y, z + dz, y > h - 2 ? 0xe8ffe0 : (dx + y) % 3 ? 0x9dff9a : 0x5ad86a, 1); };
    crystal(-1, -1, 9, 1); crystal(2, 1, 6, 0); crystal(-3, 1, 5, 0); crystal(1, -3, 4, 0);
  },
};

// ---------------------------------------------------------------- finalize: flat layout, bar, order
function build(id) {
  const S = new Shape();
  (SHAPES[id] || SHAPES.shelf_copper)(S);
  const forged = S.v.filter((v) => !v.late);
  const lateV = S.v.filter((v) => v.late);
  // straps: rank each lane's voxels along the path → a straight strip per component
  const lanes = new Map();
  for (const v of forged) if (v.lane !== null) { if (!lanes.has(v.lane)) lanes.set(v.lane, []); lanes.get(v.lane).push(v); }
  for (const list of lanes.values()) {
    list.sort((a, b) => a.s - b.s);
    const n = list.length;
    list.forEach((v, i) => { v.flat = [i - (n - 1) / 2, v.lf[1], v.lf[0]]; });
  }
  // long straps are cut into lengths laid side by side (so the blank fits on the anvil)
  const MAXL = 34;
  for (const c of S.comps) {
    if (c.kind !== 'lanes') continue;
    const ls = [...lanes.entries()].filter(([k]) => k.startsWith(c.id + ':')).map(([, l]) => l);
    if (!ls.length) continue;
    const len = Math.max(...ls.map((l) => l.length));
    if (len <= MAXL) continue;
    const segs = Math.ceil(len / MAXL), segLen = Math.ceil(len / segs);
    let z0 = Infinity, z1 = -Infinity;
    for (const l of ls) for (const v of l) { z0 = Math.min(z0, v.lf[0]); z1 = Math.max(z1, v.lf[0]); }
    const w = Math.ceil(z1 - z0) + 1;
    for (const l of ls) l.forEach((v, i) => { const sg = Math.floor(i / segLen); v.flat = [i - sg * segLen - (segLen - 1) / 2, v.lf[1], v.lf[0] + sg * (w + 1)]; });
  }
  // pack the components' flat blanks into rows (each one centered on its own)
  const boxes = S.comps.map((c) => {
    const vs = forged.filter((v) => v.comp === c);
    if (!vs.length) return null;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const v of vs) { x0 = Math.min(x0, v.flat[0]); x1 = Math.max(x1, v.flat[0]); z0 = Math.min(z0, v.flat[2]); z1 = Math.max(z1, v.flat[2]); }
    for (const v of vs) { v.flat[0] -= (x0 + x1) / 2; v.flat[2] -= (z0 + z1) / 2; }
    return { c, vs, w: x1 - x0 + 1, d: z1 - z0 + 1 };
  }).filter(Boolean).sort((a, b) => b.w * b.d - a.w * a.d);
  const ROW = 40;
  let rows = [], cur = null;
  for (const b of boxes) {
    if (!cur || cur.w + b.w + 1 > ROW) { cur = { w: 0, d: 0, items: [] }; rows.push(cur); }
    b.x = cur.w + b.w / 2; cur.w += b.w + 1; cur.d = Math.max(cur.d, b.d); cur.items.push(b);
  }
  let zAt = 0;
  for (const r of rows) {
    for (const b of r.items) { const dx = b.x - r.w / 2, dz = zAt + r.d / 2; for (const v of b.vs) { v.flat[0] = Math.round(v.flat[0] + dx); v.flat[2] = Math.round(v.flat[2] + dz); } }
    zAt += r.d + 1;
  }
  // center the final and flat poses (y from 0 up)
  const center = (get) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, z0 = Infinity, z1 = -Infinity;
    for (const v of S.v) { const p = get(v); if (!p) continue; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    for (const v of S.v) { const p = get(v); if (p) { p[0] -= cx; p[1] -= y0; p[2] -= cz; } }
  };
  center((v) => v.f);
  const fl = forged.map((v) => v.flat);
  { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity; for (const p of fl) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); y0 = Math.min(y0, p[1]); } for (const p of fl) { p[0] -= (x0 + x1) / 2; p[2] -= (z0 + z1) / 2; p[1] -= y0; } }
  // order: along the flat blank, left to right (the bar draws out from its left end)
  forged.sort((a, b) => a.flat[0] - b.flat[0] || a.flat[2] - b.flat[2] || a.flat[1] - b.flat[1]);
  const N = forged.length;
  forged.forEach((v, i) => { v.t = N > 1 ? i / (N - 1) : 0; });
  // the bar: the same voxels packed into a stubby bar, slices left to right
  const bw = Math.max(3, Math.round(Math.cbrt(N / 3.2))), bh = Math.max(2, Math.round(bw * 0.7));
  const bl = Math.ceil(N / (bw * bh));
  forged.forEach((v, i) => {
    const sl = Math.floor(i / (bw * bh)), r = i % (bw * bh);
    v.bar = [sl - (bl - 1) / 2, Math.floor(r / bw), (r % bw) - (bw - 1) / 2];
  });
  return { forged, late: lateV, N, bar: [bl, bh, bw] };
}

// ---------------------------------------------------------------- the view
const unit = new THREE.BoxGeometry(VX, VX, VX);
unit.userData.shared = true;
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/**
 * The part on the tongs: setProgress(p) (0 bar → 1 finished), update(dt, T, time), squash(k),
 * dent(localPoint, k), crack(localPoint), setDone(on) (the late voxels), spotLocal(out, p),
 * gripLocal(out), extent (half sizes over all poses), dispose().
 */
export class PartView {
  constructor(id) {
    this.id = id;
    const def = build(id);
    this.def = def;
    this.metal = METALS[COOP_PARTS[id]?.metal] ? COOP_PARTS[id].metal : 'iron';
    const base = METALS[this.metal].color;
    this.base = mixHex(base, 0x2e2826, 0.25);
    this.group = new THREE.Group();
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    const mat = voxelMaterial('toon', { unique: true, vertexColors: false, color: this.base, emissive: 0x000000 });
    // hot metal glows unevenly: the per-voxel tint scales its glow too
    mat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n\ttotalEmissiveRadiance *= (0.15 + 0.95 * vColor.rgb * vColor.rgb);\n#endif');
    };
    mat.customProgramCacheKey = () => 'fg-part-glow';
    this.mat = mat;
    const N = def.N;
    this.mesh = new THREE.InstancedMesh(unit, mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(1);
    this.tint = new Float32Array(N);
    def.forged.forEach((v, i) => {
      const j = 0.74 + hash(v.f[0], v.f[1], v.f[2]) * 0.3 + (v.f[1] % 2 ? 0 : 0.04);
      const c = v.tone === 1 ? 0.5 : v.tone === 2 ? 1.25 : j;
      this.tint[i] = c;
      this.mesh.setColorAt(i, _c.setRGB(c, c * (v.tone === 2 ? 1.02 : 1), c));
    });
    this.inner.add(this.mesh);
    this.lateN = def.late.length;
    if (this.lateN) {
      this.lateMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      this.lateMesh = new THREE.InstancedMesh(unit, this.lateMat, this.lateN);
      this.lateMesh.frustumCulled = false;
      this.lateMesh.layers.enable(1);
      def.late.forEach((v, i) => { this.lateMesh.setColorAt(i, _c.setHex(v.late.color)); });
      this.inner.add(this.lateMesh);
      this.lateK = 0;
      this.lateWant = 0;
      this.lateMesh.visible = false;
    }
    // a heat haze round the hot metal and a ring where the next blow lands
    this.halo = makeGlow({ color: 0xff8a30, size: 1, intensity: 0, falloff: 1.6, levels: 6, renderOrder: 18 });
    this.group.add(this.halo);
    const ring = new THREE.Mesh(new THREE.RingGeometry(VX * 2.2, VX * 3.2, 20), new THREE.MeshBasicMaterial({ color: 0xffd34a, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 30;
    ring.visible = false;
    this.marker = ring;
    this.group.add(ring);
    // extents over every pose (for framing the anvil view)
    let ex = 0, ez = 0, ey = 0;
    for (const v of def.forged) for (const p of [v.bar, v.flat, v.f]) { ex = Math.max(ex, Math.abs(p[0])); ez = Math.max(ez, Math.abs(p[2])); ey = Math.max(ey, p[1]); }
    this.extent = { x: (ex + 1) * VX, z: (ez + 1) * VX, y: (ey + 1) * VX };
    this.finalH = Math.max(...def.forged.map((v) => v.f[1]), ...def.late.map((v) => v.f[1])) * VX;
    this.target = 0;
    this.p = 0;
    this.sq = 0;
    this.dents = [];
    this.pos = new Float32Array(N * 3);
    this.T = 20;
    this.update(0, 20, 0);
  }

  setProgress(p) { this.target = clamp01(p); }
  /** Snap the shape (no tween). */
  snap(p) { this.target = this.p = clamp01(p); }
  squash(k = 1) { this.sq = Math.max(this.sq, Math.min(1, k)); }
  dent(local, k = 1) { this.dents.push({ x: local.x / VX, y: local.y / VX, z: local.z / VX, k, t: 0 }); }
  /** A crack near a local point: a few dark voxels for good. */
  crack(local) {
    const d = this.def, px = local.x / VX, pz = local.z / VX;
    let best = [];
    d.forged.forEach((v, i) => { const q = this.cur(i); const dd = Math.hypot(q[0] - px, q[2] - pz); if (dd < 3.2) best.push([dd + hash(i, 3) * 2, i]); });
    best.sort((a, b) => a[0] - b[0]);
    for (const [, i] of best.slice(0, 5)) { this.tint[i] = 0.22; this.mesh.setColorAt(i, _c.setRGB(0.18, 0.14, 0.13)); }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  setDone(on) { this.lateWant = on ? 1 : 0; }

  /** Current local position (voxel units) of forged voxel i. */
  cur(i) { return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]]; }

  /** Morph weights of a voxel at progress p: [kA (bar → flat), kB (flat → final)]. */
  weights(v, p) {
    const qa = clamp01(p / 0.45), qb = clamp01((p - 0.45) / 0.55);
    const sa = 0.4, sb = 0.45;
    return [smooth((qa - sa * v.t) / (1 - sa)), smooth((qb - sb * v.t) / (1 - sb))];
  }

  update(dt, T, time) {
    this.T = T;
    this.p += (this.target - this.p) * Math.min(1, dt * 12);
    if (Math.abs(this.target - this.p) < 1e-4) this.p = this.target;
    this.sq = Math.max(0, this.sq - dt * 5);
    for (const dn of this.dents) dn.t += dt;
    this.dents = this.dents.filter((dn) => dn.t < 0.3);
    const d = this.def, arr = this.mesh.instanceMatrix.array;
    for (let i = 0; i < d.N; i++) {
      const v = d.forged[i];
      const [ka, kb] = this.weights(v, this.p);
      let x, y, z;
      if (kb <= 0) {
        x = v.bar[0] + (v.flat[0] - v.bar[0]) * ka; y = v.bar[1] + (v.flat[1] - v.bar[1]) * ka; z = v.bar[2] + (v.flat[2] - v.bar[2]) * ka;
        if (ka > 0 && ka < 1) y += Math.sin(ka * Math.PI) * 1.2;
      } else {
        // a bezier through (flat.x, final.y, flat.z): raised sheets fold up round their hinge
        const u = 1 - kb, a = v.flat, f = v.f;
        x = u * u * a[0] + 2 * u * kb * a[0] + kb * kb * f[0];
        y = u * u * a[1] + 2 * u * kb * f[1] + kb * kb * f[1];
        z = u * u * a[2] + 2 * u * kb * a[2] + kb * kb * f[2];
      }
      for (const dn of this.dents) {
        const dd = Math.hypot(x - dn.x, z - dn.z);
        if (dd < 4) y -= (1 - dd / 4) * dn.k * Math.sin(Math.min(1, dn.t / 0.3) * Math.PI) * 0.9;
      }
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      const moving = (ka > 0.02 && ka < 0.98) || (kb > 0.02 && kb < 0.98);
      const s = moving ? 1.14 : 1.02;
      const o = i * 16;
      arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0;
      arr[o + 12] = x * VX; arr[o + 13] = (y + 0.5) * VX; arr[o + 14] = z * VX; arr[o + 15] = 1;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // squash on a blow
    const sq = this.sq;
    this.inner.scale.set(1 + sq * 0.05, 1 - sq * 0.22, 1 + sq * 0.05);
    // late voxels pop in when the part is done
    if (this.lateMesh) {
      this.lateK += (this.lateWant - this.lateK) * Math.min(1, dt * 6);
      const k = this.lateK;
      this.lateMesh.visible = k > 0.02;
      if (this.lateMesh.visible) {
        const la = this.lateMesh.instanceMatrix.array;
        d.late.forEach((v, i) => {
          const s = Math.max(0, Math.min(1, k * 1.6 - (v.f[1] / 20) * 0.6));
          const o = i * 16;
          la[o] = s; la[o + 5] = s; la[o + 10] = s; la[o + 15] = 1;
          la[o + 1] = la[o + 2] = la[o + 3] = la[o + 4] = la[o + 6] = la[o + 7] = la[o + 8] = la[o + 9] = la[o + 11] = 0;
          la[o + 12] = v.f[0] * VX; la[o + 13] = (v.f[1] + 0.5) * VX; la[o + 14] = v.f[2] * VX;
        });
        this.lateMesh.instanceMatrix.needsUpdate = true;
        if (this.lateMat) this.lateMat.color.setScalar(0.9 + 0.12 * Math.sin(time * 9));
      }
    }
    // heat: dark forge scale, the glow and its haze
    applyHeat(this.mat, this.base, T, 0.85);
    const g = glowAmount(T);
    const hu = this.halo.userData.glow;
    hu.uIntensity.value = Math.min(0.32, g * 0.24) * (0.92 + Math.sin(time * 7.3) * 0.08);
    if (g > 0) hu.uColor.value.setHex(glowHex(T));
    const span = Math.max(this.extent.x, this.extent.z) * (0.6 + 0.4 * (1 - Math.abs(this.p - 0.45)));
    hu.uSize.value.setScalar(0.1 + span * 1.4);
    this.halo.position.set(0, 0.02, 0);
    this.halo.visible = g > 0.02;
    if (this.marker.visible) {
      this.marker.material.opacity = 0.55 + 0.35 * Math.sin(time * 10);
      this.marker.scale.setScalar(1 + 0.15 * Math.sin(time * 10));
    }
  }

  /** The top of the metal where the next blow (taking the shape from p to p2) lands (local). */
  spotLocal(out, p, p2) {
    const d = this.def;
    let sx = 0, sz = 0, sy = 0, n = 0;
    for (let i = 0; i < d.N; i++) {
      const v = d.forged[i];
      const w0 = this.weights(v, p), w1 = this.weights(v, p2);
      const ch = Math.abs(w1[0] - w0[0]) + Math.abs(w1[1] - w0[1]);
      if (ch < 0.04) continue;
      const q = this.cur(i);
      sx += q[0] * ch; sz += q[2] * ch; n += ch;
      sy = Math.max(sy, q[1]);
    }
    if (n <= 0) {
      // nothing left to move: the middle of the piece
      for (let i = 0; i < d.N; i += 3) { const q = this.cur(i); sx += q[0]; sz += q[2]; sy = Math.max(sy, q[1]); n++; }
    }
    const x = sx / n, z = sz / n;
    // the highest metal right under that point
    let top = 0;
    for (let i = 0; i < d.N; i++) { const q = this.cur(i); if (Math.abs(q[0] - x) < 1.6 && Math.abs(q[2] - z) < 1.6) top = Math.max(top, q[1]); }
    return out.set(x * VX, (top + 1) * VX, z * VX);
  }

  /** Where the tongs bite: the left end of the work (local). */
  gripLocal(out = new THREE.Vector3()) {
    const d = this.def;
    let best = 0, bx = Infinity;
    for (let i = 0; i < Math.min(d.N, 60); i++) { const q = this.cur(i); if (q[0] < bx) { bx = q[0]; best = i; } }
    const q = this.cur(best);
    return out.set((q[0] - 0.5) * VX, (q[1] + 0.8) * VX, q[2] * VX);
  }

  showMarker(local) {
    if (!local) { this.marker.visible = false; return; }
    this.marker.visible = true;
    this.marker.position.copy(local).setY(local.y + VX * 0.2);
  }

  dispose() {
    this.mat.dispose();
    this.mesh.dispose();
    if (this.lateMesh) { this.lateMesh.dispose(); this.lateMat.dispose(); }
    this.halo.material.dispose();
    this.marker.geometry.dispose(); this.marker.material.dispose();
  }
}


/** Voxel counts per part (tests). */
export function partStats(id) { const d = build(id); return { N: d.N, late: d.late.length, bar: d.bar }; }
