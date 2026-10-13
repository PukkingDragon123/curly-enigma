// Ending phase 2: the ascent. A side-view cross-section of the lift shaft; the cage rises
// through The Core, Frost Vault, Magma Deep, Crystal Grotto, Clayworks and Rootsoil while the
// depth counter ticks from 400 m to 0 m and daylight grows overhead.
import * as THREE from 'three';
import { VoxelGrid, voxMesh, meshRelief, jitf, hash3, fshade, fmix } from './vox.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { batchStatic } from './batch.js';
import { makeRoot, makeMushrooms, makeLantern, S16 } from './props.js';
import { Particles, Twinkles, SHAPE, makeGlow, GLSL_BAYER } from './fx.js';
import { ZONES } from '../data/zones.js';
import { makeNoise2D, makeRng, shade, mixHex, clamp, lerp } from '../core/util.js';

const VS = 0.25;
const ZH = 20; // world units per zone
const Y_TOP = ZH * 6; // the surface
const Y_END = Y_TOP - 1.2;
const X_IN = 1.25; // grids start here (|x|)
const NX = 36;
const NZ = 11;
const Z0 = -2.25;
const CAM_DIST = 9.2;
const CAM_UP = 1.15;

/** Zones from the bottom of the shaft (index 0 = The Core) to the top (5 = Rootsoil). */
export const SHAFT_ZONES = [6, 5, 4, 3, 2, 1].map((id) => ({ id, name: ZONES[id].name, css: ZONES[id].color, top: ZONES[id].depth[0], bottom: ZONES[id].depth[1] }));

const LOOK = [
  { // The Core
    rock: [0x2c1a3c, 0x3c2454, 0x241432, 0x46305e, 0x321e48], back: 0x160c20, bg: 0x0c0614, hemi: [0xb08ae0, 0x2a1040], tint: 0xeedcff,
    glow: [0xc86aff, 0xff9ad0, 0xffe08a], spark: 0xffd8ff,
  },
  { // Frost Vault
    rock: [0x3a5a7a, 0x4e6e92, 0x2e4a66, 0x5e7e9e, 0x44647e], back: 0x14243a, bg: 0x08101c, hemi: [0xcfeaff, 0x1a3050], tint: 0xe6f4ff,
    glow: [0xbff6ff, 0x7fd0ff, 0xffffff], spark: 0xe8faff,
  },
  { // Magma Deep
    rock: [0x2a1a1c, 0x3c2622, 0x221416, 0x48302a, 0x30201e], back: 0x140808, bg: 0x100404, hemi: [0xffa070, 0x3a0a04], tint: 0xffe6d4,
    glow: [0xff6a1a, 0xffb040, 0xffe080], spark: 0xffc070,
  },
  { // Crystal Grotto
    rock: [0x4a5274, 0x5c6890, 0x3c4464, 0x6a78a0, 0x505a80], back: 0x181826, bg: 0x0a0a16, hemi: [0xb8c8ff, 0x1a1a3a], tint: 0xe8eeff,
    glow: [0x7fd0ff, 0xbfe6ff, 0x4a86c9], spark: 0xd8f0ff,
  },
  { // Clayworks
    rock: [0xb8603a, 0xc8743f, 0x9a4e30, 0xd88a50, 0xa85a36], back: 0x3a1a10, bg: 0x140806, hemi: [0xffd0a0, 0x3a1a0a], tint: 0xfff0e0,
    glow: [0xf2a32c, 0xffe08a, 0x7bf08a], spark: 0xffe0a0,
  },
  { // Rootsoil
    rock: [0x6b4a32, 0x58402c, 0x7c5a3c, 0x4e3626, 0x6a4c34], back: 0x22140c, bg: 0x100a06, hemi: [0xffe8c0, 0x2a1a0a], tint: 0xfff4e0,
    glow: [0x7af0c0, 0xc0ffe0, 0xffe080], spark: 0xfff0b0,
  },
];

// ------------------------------------------------------------------ decorations
function crystalCluster(seed, cols, n = 5, len = 9, base = 0x2a2a3a) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(16, 16, 10);
  for (let i = 0; i < n; i++) {
    const a = rng.range(-0.9, 0.9);
    const L = rng.int(Math.max(3, len - 4), len);
    const bx = 2, by = 8 + rng.range(-3, 3), bz = 5 + rng.range(-2, 2);
    const dx = Math.cos(a), dy = Math.sin(a);
    const w = rng.chance(0.4) ? 2 : 1;
    for (let s = 0; s < L; s++) {
      const x = bx + dx * s, y = by + dy * s;
      const tip = s > L - 3;
      const c = s === L - 1 ? 0xffffff : tip ? cols[1] : (s % 3 === 0 ? cols[2] : cols[0]);
      g.set(x, y, bz, c);
      if (!tip && w > 1) { g.set(x, y + 1, bz, cols[0]); g.set(x, y, bz + 1, cols[2]); g.set(x, y + 1, bz + 1, cols[1]); }
    }
  }
  g.box(0, 6, 3, 3, 5, 4, (x, y, z) => jitf(base, x, y, z, seed, 0.1));
  return g;
}

function icicles(seed) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(14, 18, 4);
  g.box(0, 15, 0, 14, 3, 4, (x, y, z) => (y === 17 ? 0xf4fbff : 0xbfe8ff));
  for (let x = 1; x < 13; x += rng.int(2, 3)) {
    const L = rng.int(4, 14);
    for (let s = 0; s < L; s++) {
      const c = s > L - 3 ? 0xffffff : (s % 2 ? 0xaee8ff : 0xd8f4ff);
      g.set(x, 15 - s, 1, c);
      if (s < L / 2) g.set(x + 1, 15 - s, 1, 0x9ad8f8);
    }
  }
  return g;
}

function lavaDrip(seed) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(8, 22, 3);
  const L = rng.int(10, 20);
  for (let s = 0; s < L; s++) {
    const c = s % 4 === 0 ? 0xffe080 : s % 2 ? 0xff8a2a : 0xffb040;
    g.set(3, 21 - s, 1, c);
    if (s < 4) g.set(4, 21 - s, 1, 0xff6a1a);
  }
  g.box(2, 0, 0, 4, 2, 3, 0xff6a1a);
  g.set(3, 2, 1, 0xffe080);
  return g;
}

function worm() {
  const g = new VoxelGrid(8, 8, 3);
  const pts = [[0, 3], [1, 3], [2, 4], [3, 5], [4, 5], [5, 4], [5, 3]];
  pts.forEach(([x, y], i) => g.set(x, y, 1, i === pts.length - 1 ? 0xd88088 : (i % 2 ? 0xe8a0a8 : 0xf0b0b8)));
  g.set(5, 4, 2, 0x1a1012);
  return g;
}

/** A strand of hanging vine (green) with leaves. */
function vine(seed, len = 26) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(9, len + 2, 5);
  let x = 4;
  for (let s = 0; s < len; s++) {
    x = clamp(x + rng.int(-1, 1) * (rng.chance(0.3) ? 1 : 0), 1, 7);
    g.set(x, len - s, 2, s % 5 === 0 ? 0x3a6a2a : 0x4a7a3a);
    if (rng.chance(0.3)) { const sx = rng.chance(0.5) ? 1 : -1; g.set(x + sx, len - s, 2, 0x6aa84a); g.set(x + sx, len - s + 1, 2, 0x5a9a3a); }
  }
  return g;
}

// ------------------------------------------------------------------ strata
// The walls are heightfield reliefs at 1/16 (columns pointing at the camera), meshed in 5-unit
// chunks so only the stretch around the cage is drawn.
const VF = 1 / 16;
const X_OUT = 7.25;
const NXF = Math.round((X_OUT - X_IN) / VF);
const NLV = Math.round((NZ * VS) / VF);
const CHUNK_ROWS = 16; // 1 world unit per mesh: small enough to build in one thin slice
const ROCK_MAT = () => voxelMaterial('toon');
const GLOW_MAT = () => voxelMaterial('basic');

const PATCH = [0.95, 1.0, 1.05];
const PEBBLES = {
  1: [0x8aa8c8, 0xb8d0e8, 0x6a88a8], 3: [0x6a6a90, 0x9090b8, 0x50507a], 4: [0xe0a070, 0xf0c090, 0xb07048], 5: [0x8a8278, 0xb0a898, 0x6a645c],
};

/** Pebbles (most zones) and fossil ammonites (clay, root soil) pressed into a finished relief. */
function stampOrnaments(k, side, y0, ny, W, h, top, base, gh) {
  const yTop = y0 + ny * VF;
  const cellOf = (x, y) => [Math.floor((Math.abs(x) - X_IN) / VF), Math.floor((y - y0) / VF)];
  const each = (cx, cy, r, fn) => {
    const [ia, ja] = cellOf(cx - side * r, cy - r), [ib, jb] = cellOf(cx + side * r, cy + r);
    for (let j = Math.max(0, Math.min(ja, jb)); j <= Math.min(ny - 1, Math.max(ja, jb)); j++)
      for (let i = Math.max(0, Math.min(ia, ib)); i <= Math.min(W - 1, Math.max(ia, ib)); i++) {
        const q = i + W * j;
        if (!h[q] || gh[q]) continue;
        fn(q, side * (X_IN + (i + 0.5) * VF), y0 + (j + 0.5) * VF);
      }
  };
  const pal = PEBBLES[k];
  if (pal) {
    const G = 0.42, dens = k === 5 ? 0.16 : 0.08;
    const xs = Math.min(side * X_IN, side * X_OUT), xe = Math.max(side * X_IN, side * X_OUT);
    for (let cy = Math.floor(y0 / G); cy <= Math.floor(yTop / G); cy++) for (let cx = Math.floor(xs / G); cx <= Math.floor(xe / G); cx++) {
      if (hash3(cx, cy, k * 3 + side, 77) >= dens) continue;
      const ox = (cx + 0.25 + hash3(cx, cy, 1, 78) * 0.5) * G, oy = (cy + 0.25 + hash3(cx, cy, 2, 79) * 0.5) * G;
      const r = (0.22 + hash3(cx, cy, 3, 80) * 0.22) * G;
      if (k === 5 && oy > Y_TOP - 1.25) continue;
      each(ox, oy, r, (q, x, y) => {
        const dx = (x - ox) / r, dy = ((y - oy) / r) * 1.25;
        const d = Math.hypot(dx, dy);
        if (d >= 1) return;
        const c = d > 0.78 ? pal[2] : dx < -0.15 && dy > 0.15 ? pal[1] : pal[0];
        h[q] = Math.min(NLV, h[q] + Math.round((0.05 + (1 - d * d) * 0.07) / VF));
        top[q] = base[q] = fshade(c, PATCH[(hash3(q, 3, 5, 6) * 3) | 0]);
      });
    }
  }
  if (k === 4 || k === 5) {
    const G = 2.6;
    const xs = Math.min(side * X_IN, side * X_OUT), xe = Math.max(side * X_IN, side * X_OUT);
    for (let ay = Math.floor(y0 / G); ay <= Math.floor(yTop / G); ay++) for (let ax = Math.floor(xs / G); ax <= Math.floor(xe / G); ax++) {
      if (hash3(ax, ay, k + side * 5, 91) >= 0.3) continue;
      const ox = (ax + 0.3 + hash3(ax, ay, 4, 92) * 0.4) * G, oy = (ay + 0.3 + hash3(ax, ay, 5, 93) * 0.4) * G;
      const R = 0.24 + hash3(ax, ay, 6, 94) * 0.12;
      if (k === 5 && oy > Y_TOP - 1.4) continue;
      each(ox, oy, R, (q, x, y) => {
        const dx = x - ox, dy = y - oy, d = Math.hypot(dx, dy);
        if (d >= R) return;
        const th = Math.atan2(dy, dx) / (Math.PI * 2) + 0.5;
        const rr = d / R;
        const coil = (((Math.log(rr + 0.04) / Math.log(2.6) + th) % 1) + 1) % 1;
        const rib = Math.floor(th * 22) % 2 === 0;
        const c = rr > 0.9 ? 0x9a8462 : coil < 0.16 ? 0x8a7458 : rib ? 0xe8d8b0 : 0xd0bc90;
        h[q] = Math.min(NLV, h[q] + Math.round((0.06 + (1 - rr) * 0.05) / VF));
        top[q] = base[q] = c;
      });
    }
  }
}

function* zoneSide(k, side, noise) {
  const L = LOOK[k];
  const extraBelow = k === 0 ? 8 : 0;
  const y0 = k * ZH - extraBelow;
  const ny = Math.round((ZH + extraBelow + (k === 5 ? 1.5 : 0)) / VF);
  const W = NXF, n = W * ny;
  const h = new Uint16Array(n), top = new Uint32Array(n), base = new Uint32Array(n);
  const gh = new Uint16Array(n), gc = new Uint32Array(n);
  const twinkles = [];
  const { n1, n2, n3, n4, n5 } = noise;
  const bandH = k === 4 ? 0.75 : k === 2 ? 1.6 : 1.25;
  const nr = L.rock.length;
  for (let j = 0; j < ny; j++) {
    if (j % 8 === 7) yield 'rows';
    const y = y0 + (j + 0.5) * VF;
    if (y > Y_TOP + 0.3) continue;
    const edge = 1.62 + n1(y * 0.33, k * 7 + side * 3) * 0.32 + (Math.floor(y * 0.9) % 4 === 0 ? 0.12 : 0);
    const topSoil = k === 5 && y > Y_TOP - 1.2;
    for (let i = 0; i < W; i++) {
      const ax = X_IN + (i + 0.5) * VF;
      if (ax < edge) continue;
      const x = side * ax;
      const q = i + W * j;
      const lip = clamp((ax - edge) / 1.2, 0, 1);
      // strata: coherent bands that step in and out like terraces, with ragged edges
      const by = y + n2(x * 0.09 + k * 3, 7.7) * 1.3 + n5(x * 0.9 + k, y * 0.9) * 0.06;
      const band = Math.floor(by / bandH);
      const seamY = by - band * bandH;
      const bandOff = (hash3(band, k, side, 9) - 0.5) * 0.55;
      let front = -0.3 + bandOff + n2(x * 0.1 + k * 5, y * 0.1) * 0.35 - (1 - lip) * 0.6;
      const boulder = n3(x * 0.3 + k * 11, y * 0.3);
      if (boulder > 0.36) front += 0.22 + (boulder - 0.36) * 0.7;
      // (no per-voxel knobbles: contours would cost a wall quad per cell edge)
      let c = L.rock[((band % nr) + nr) % nr];
      if (k !== 2 && Math.floor(seamY / 0.19 + n5(x * 0.4, y * 0.4) * 0.6) % 3 === 0) c = fshade(c, 0.93); // laminations
      if (boulder > 0.36) c = fshade(c, 1.1);
      const c0 = c;
      c = fshade(c, PATCH[(hash3(i >> 1, j >> 1, k * 7 + side, 1) * 3) | 0]);
      const cPatch = c;
      let glow = 0;
      const hh = hash3(i, j, k * 7 + side, 2);
      if (k === 0) {
        const vein = Math.abs(n4(x * 0.35 + 4, y * 0.18));
        if (vein < 0.012) glow = hh < 0.85 ? 0x9a48d8 : 0xf0a0ff;
        else if (vein < 0.02) c = 0x2a1040;
        else {
          const vp = n3(x * 0.45 + 40, y * 0.45);
          if (vp > 0.4) { c = vp > 0.47 ? 0x0a0412 : 0x5a2a8a; front -= 0.08; }
        }
        if (hh < 0.0004) { glow = hh < 0.00015 ? 0xffffff : 0xffe08a; twinkles.push([x, y, front + 0.2]); }
      } else if (k === 1) {
        const ice = n3(x * 0.32 + 20, y * 0.32);
        if (ice > 0.22) {
          c = ice > 0.34 ? 0xd8f4ff : 0xaee0f8;
          front += 0.05;
          if ((i + j) % 11 === 0 && ice > 0.28) c = 0xf4fbff; // glassy streaks
        }
        if (hh < 0.0004) { glow = 0x5a8aff; twinkles.push([x, y, front + 0.2]); }
      } else if (k === 2) {
        const vein = Math.abs(n4(x * 0.55, y * 0.16));
        if (vein < 0.02) glow = vein < 0.008 ? L.glow[2] : L.glow[1];
        else if (vein < 0.034) c = 0x6a2a14;
        else if (vein < 0.05) c = fmix(c, 0x6a2a14, 0.45);
        const seam = hash3(band, 3, side, 4) < 0.45;
        if (seam && seamY < VF * 2.2) glow = hh < 0.5 ? L.glow[0] : L.glow[1]; // molten seams
        else if (seam && seamY < VF * 4) c = 0x7a2a12;
        if (hh < 0.002 && !glow) c = 0x8a7aa0; // obsidian glints
      } else if (k === 3) {
        const geo = n3(x * 0.4 + 7, y * 0.4 + 3);
        if (geo > 0.3) {
          c = 0x1a1a30;
          front -= 0.12;
          if (hash3(i >> 1, j >> 1, 5, 7) < 0.1) glow = hash3(i >> 1, j >> 1, 6, 8) < 0.5 ? 0x9ad8ff : 0x4a86c9;
        } else if (geo > 0.22) {
          glow = hh < 0.5 ? 0x7fd0ff : 0xbfe6ff;
          if (hh < 0.004) twinkles.push([x, y, front + 0.2]);
        }
        if (hh < 0.0004) { glow = 0xbfe6ff; twinkles.push([x, y, front + 0.2]); }
      } else if (k === 4) {
        if (seamY < VF * 1.5) c = fshade(c, 0.82);
        if (hh < 0.0004) { glow = hh < 0.00025 ? 0xf2a32c : 0x7bf08a; twinkles.push([x, y, front + 0.2]); }
      } else if (k === 5) {
        const root = Math.abs(n4(x * 0.2, y * 0.5));
        if (root < 0.018) { c = hh < 0.5 ? 0xa8845a : 0x8a6a48; front += 0.09; }
        else if (root < 0.027) c = fshade(c, 0.82);
        else if (n3(x * 0.8 + 3, y * 0.8) > 0.33) c = fmix(c, 0x5a7a34, 0.35); // moss
        if (topSoil) c = y > Y_TOP - 0.3 ? (hh < 0.5 ? 0x5ab84a : 0x4a9a3a) : (hh < 0.3 ? 0x3e2818 : 0x4a3020);
      }
      if (!glow && !topSoil && Math.abs(n4(x * 0.55 + k * 9, y * 0.55 + side)) < 0.011) { front -= 0.13; c = fshade(c, 0.58); } // cracks
      let lvl = clamp(Math.round((front - Z0) / VF), 4, NLV);
      base[q] = c === cPatch ? c0 : c;   // walls skip the patch jitter so ledges merge into strips
      if (glow) { lvl = Math.max(3, lvl - 1); gh[q] = lvl; gc[q] = glow; }
      else top[q] = c;
      h[q] = lvl;
    }
  }
  stampOrnaments(k, side, y0, ny, W, h, top, base, gh);
  yield 'stamp';
  // lit ledge lips: snow in the Frost Vault, moss in the Rootsoil
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < W; i++) {
    if (i === 0 && j % 48 === 47) yield 'ledge';
    const q = i + W * j;
    if (!top[q] || h[q + W] >= h[q]) continue;
    if (k === 1) top[q] = hash3(i, j, 3, 5) < 0.4 ? 0xdff6ff : 0xf4fbff;
    else if (k === 5 && hash3(i, j, 3, 6) < 0.45) top[q] = hash3(i, j, 4, 6) < 0.5 ? 0x5a8a3a : 0x6a9a44;
    else top[q] = fshade(top[q], 1.1);
  }
  const sideFn = (q, y, dir) => {
    const c = base[q];
    if (dir === 3) {
      if (k === 1) return (q + y) % 3 ? 0xf4fbff : 0xdff6ff;
      if (k === 5) return (q * 7 + y) % 5 < 2 ? 0x5a7a34 : fshade(c, 1.12);
      return fshade(c, 1.12);
    }
    if (dir === 2) return fshade(c, 0.78);
    return fshade(c, 0.86 + ((y >> 2) % 3) * 0.05);
  };
  const origin = [side * X_IN, y0, Z0], U = [side * VF, 0, 0], V = [0, VF, 0], N = [0, 0, VF];
  const meshes = [];
  let tris = 0;
  // chunks are meshed one unit at a time (thin slices) and merged four at a time (fewer draws)
  let rockParts = [], glowParts = [];
  const flush = () => {
    for (const [parts, mat] of [[rockParts, ROCK_MAT()], [glowParts, GLOW_MAT()]]) {
      if (!parts.length) continue;
      const g = parts.length > 1 ? mergeGeometries(parts) : parts[0];
      if (parts.length > 1) {
        const box = new THREE.Box3();
        for (const p of parts) { box.union(p.boundingBox); p.dispose(); }
        g.boundingBox = box;
        g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      }
      meshes.push(new THREE.Mesh(g, mat));
      tris += g.index.count / 3;
    }
    rockParts = [];
    glowParts = [];
  };
  for (let r0 = 0, n = 0; r0 < ny; r0 += CHUNK_ROWS, n++) {
    const rows = [r0, Math.min(ny, r0 + CHUNK_ROWS)];
    const g = meshRelief({ W, D: ny, h, top, side: sideFn, U, V, N, origin, rows, wallAO: false });
    if (g.attributes.position.count) rockParts.push(g);
    const gg = meshRelief({ W, D: ny, h: gh, top: gc, U, V, N, origin, rows, walls: false, ao: false });
    if (gg.attributes.position.count) glowParts.push(gg);
    yield 'mesh';
    if (n % 4 === 3) { flush(); yield 'merge'; }
  }
  flush();
  const faceAt = (x, y) => {
    const i = Math.floor((Math.abs(x) - X_IN) / VF), j = Math.floor((y - y0) / VF);
    if (i < 0 || i >= W || j < 0 || j >= ny) return -99;
    const v = h[i + W * j] || gh[i + W * j];
    return v ? Z0 + v * VF : -99;
  };
  return { meshes, twinkles, faceAt, tris };
}

/** The back of the shaft behind the cage: rough slabs crossed by timber beams every 3.2 units. */
function* backWall(k, noise) {
  const L = LOOK[k];
  const extraBelow = k === 0 ? 8 : 0;
  const y0 = k * ZH - extraBelow;
  const W = Math.round(3.5 / VF), ny = Math.round((ZH + extraBelow) / VF);
  const h = new Uint16Array(W * ny), top = new Uint32Array(W * ny);
  const wood = 0x5a3a22;
  for (let j = 0; j < ny; j++) {
    if (j % 16 === 15) yield 'backRows';
    const y = y0 + (j + 0.5) * VF;
    const bt = (((y + 1.5) % 3.2) + 3.2) % 3.2;
    const beam = Math.abs(bt - 1.6) < 0.15;
    for (let i = 0; i < W; i++) {
      const x = -1.75 + (i + 0.5) * VF;
      const q = i + W * j;
      if (beam) {
        const bv = Math.abs(bt - 1.6) / 0.15;
        const grain = Math.sin(x * 9 + n2b(noise, x, y) * 4) > 0.75;
        let c = bv > 0.8 ? shade(wood, 0.78) : grain ? shade(wood, 0.86) : jitf(wood, i >> 1, j, 0, 4, 0.06);
        let lv = 12;
        if (Math.abs(Math.abs(x) - 1.05) < 0.07 && bv < 0.5) { c = 0x8a8a92; lv = 13; } // bolts
        h[q] = lv; top[q] = c;
        continue;
      }
      const slab = noise.n3(x * 0.8, y * 0.6 + k * 9);
      let lv = 4 + (slab > 0.1 ? 3 : 0) + (slab > 0.3 ? 1 : 0);
      let c = mixHex(L.back, L.rock[(Math.floor(y / 1.25) % L.rock.length + L.rock.length) % L.rock.length], 0.35);
      c = fshade(c, PATCH[(hash3(i >> 1, j >> 1, k, 2) * 3) | 0]);
      if (Math.abs(noise.n4(x * 0.9 + 3, y * 0.7 + k)) < 0.014) { lv -= 2; c = shade(c, 0.6); }
      h[q] = clamp(lv, 2, 11); top[q] = c;
    }
  }
  const origin = [-1.75, y0, -2.2], U = [VF, 0, 0], V = [0, VF, 0], N = [0, 0, VF];
  const sideFn = (q, y, dir) => (dir === 3 ? 0x6a5040 : dir === 2 ? 0x2a1c14 : 0x46342a);
  const meshes = [];
  let parts = [];
  const flush = () => {
    if (!parts.length) return;
    const g = parts.length > 1 ? mergeGeometries(parts) : parts[0];
    if (parts.length > 1) {
      const box = new THREE.Box3();
      for (const p of parts) { box.union(p.boundingBox); p.dispose(); }
      g.boundingBox = box;
      g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    }
    meshes.push(new THREE.Mesh(g, ROCK_MAT()));
    parts = [];
  };
  for (let r0 = 0, n = 0; r0 < ny; r0 += CHUNK_ROWS, n++) {
    const g = meshRelief({ W, D: ny, h, top, side: sideFn, U, V, N, origin, rows: [r0, Math.min(ny, r0 + CHUNK_ROWS)], wallAO: false });
    if (g.attributes.position.count) parts.push(g);
    if (n % 4 === 3) flush();
    yield 'backMesh';
  }
  flush();
  return meshes;
}
const n2b = (noise, x, y) => noise.n2(x * 0.7, y * 3.1);

// ------------------------------------------------------------------ build
export function buildShaft(ctx) {
  let camDist = CAM_DIST;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(LOOK[0].bg);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 80);
  camera.position.set(0, CAM_UP, CAM_DIST);
  camera.lookAt(0, CAM_UP, 0);
  const camQuat = camera.quaternion.clone();
  const t0 = performance.now();
  const noise = { n1: makeNoise2D(101), n2: makeNoise2D(202), n3: makeNoise2D(303), n4: makeNoise2D(404), n5: makeNoise2D(505) };

  const hemi = new THREE.HemisphereLight(LOOK[0].hemi[0], LOOK[0].hemi[1], 1.6);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0xfff0e0, 0.7);
  fill.position.set(2, 3, 10);
  scene.add(fill);
  const lampLight = new THREE.PointLight(0xffc880, 7, 9, 1.6);
  scene.add(lampLight);

  const world = new THREE.Group();
  scene.add(world);
  const twinklePts = [];
  const faces = [];
  let wallTris = 0, wallMs = 0;
  let twinkles = null;
  // guide rails (brass) on the back wall
  const railMat = new THREE.MeshLambertMaterial({ color: 0xc8902a });
  for (const x of [-1.32, 1.32]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, Y_TOP + 12, 0.1), railMat);
    r.position.set(x, Y_TOP / 2 - 4, -1.25);
    world.add(r);
  }

  // decorations along the shaft lips (they whizz past closest to the cage)
  const deco = new THREE.Group();
  world.add(deco);
  // decorations live in 5-unit groups (four per zone) that are batched one per build slice
  const decoZ = Array.from({ length: 6 }, () => Array.from({ length: 4 }, () => { const g = new THREE.Group(); deco.add(g); return g; }));
  const decoAt = (y) => {
    const k = clamp(Math.floor(y / ZH), 0, 5);
    return decoZ[k][clamp(Math.floor((y - k * ZH) / 5), 0, 3)];
  };
  const glowHalos = [];
  const cache = {};
  const decoMesh = (key, make, kind = 'basic', pivot = [0, 0, 0]) => {
    if (!cache[key]) cache[key] = voxMesh(make(), { scale: S16, pivot, kind });
    return cache[key].clone();
  };
  const rng = makeRng(9);
  for (let k = 0; k < 6; k++) {
    const L = LOOK[k];
    for (let y = k * ZH + 0.8; y < (k + 1) * ZH - 0.4; y += rng.range(1.4, 2.4)) {
      const side = rng.chance(0.5) ? -1 : 1;
      const edge = 1.62 + noise.n1(y * 0.33, k * 7 + side * 3) * 0.32;
      let m = null;
      if (k === 0 || k === 3) {
        const cols = k === 0 ? [0xc86aff, 0xf0c0ff, 0x8a3ad0] : [0x7fd0ff, 0xd8f4ff, 0x4a86c9];
        m = decoMesh(`cr${k}${(y * 3) % 3 | 0}`, () => crystalCluster(k * 100 + ((y * 3) % 3 | 0), cols, k === 3 ? 6 : 4, k === 3 ? 12 : 8, shade(L.rock[0], 0.8)));
        m.position.set(side * (edge + 0.05), y, -0.4 + rng.range(-0.6, 0.4));
        m.scale.x = -side;
        if (k === 3 && rng.chance(0.6)) {
          const gl = makeGlow({ color: 0x5ab0ff, size: 1.4, intensity: 0.35, levels: 4 });
          gl.position.set(side * (edge - 0.35), y + 0.5, 0);
          deco.add(gl);
          glowHalos.push(gl);
        }
      } else if (k === 1) {
        m = decoMesh(`ice${(y * 7) % 3 | 0}`, () => icicles(10 + ((y * 7) % 3 | 0)), 'toon');
        m.position.set(side > 0 ? edge - 0.55 : -edge - 14 * S16 + 0.55, y, -0.2);
      } else if (k === 2) {
        m = decoMesh(`lava${(y * 5) % 3 | 0}`, () => lavaDrip(20 + ((y * 5) % 3 | 0)));
        m.position.set(side * (edge + 0.1), y, 0.0);
        const gl = makeGlow({ color: 0xff6a1a, size: 1.2, intensity: 0.4, levels: 4 });
        gl.position.set(side * (edge + 0.1), y + 0.4, 0.3);
        deco.add(gl);
        glowHalos.push(gl);
      } else if (k === 4) {
        m = decoMesh(`vine${(y * 5) % 3 | 0}`, () => vine(30 + ((y * 5) % 3 | 0)), 'toon');
        m.position.set(side * (edge + 0.05), y - 1.7, -0.1);
      } else if (k === 5) {
        const v = (y * 10 | 0) % 4;
        if (rng.chance(0.5)) {
          const len = rng.int(18, 30);
          if (!cache['root' + v]) cache['root' + v] = makeRoot(500 + v, len);
          m = cache['root' + v].clone();
          m.position.set(side * (edge + 0.1), y + 0.6, rng.range(-0.6, 0.2));
        } else if (rng.chance(0.6)) {
          if (!cache['lipm' + v]) cache['lipm' + v] = makeMushrooms(70 + v, { n: 3, cap: [0x5ae0a0, 0xb0ffd8, 0x2a9a6a], scale: 0.9 }).group;
          m = cache['lipm' + v].clone();
          m.position.set(side * (edge + 0.35), y, rng.range(-0.8, 0.2));
          const gl = makeGlow({ color: 0x4ae0a0, size: 1.0, intensity: 0.32, levels: 4 });
          gl.position.set(side * (edge + 0.2), y + 0.3, 0.2);
          deco.add(gl);
          glowHalos.push(gl);
        } else {
          m = decoMesh('worm', () => worm(), 'toon');
          m.position.set(side * (edge - 0.1), y, 0.25);
          m.scale.x = -side;
        }
      }
      if (m) decoAt(m.position.y).add(m);
    }
  }
  // lamps on the shaft walls
  const lamps = [];
  const lantern = makeLantern({ post: 0, color: 0xffd070 });
  for (let y = 4; y < Y_TOP - 2; y += 7.5) {
    const side = Math.round(y / 7.5) % 2 ? 1 : -1;
    const lg = lantern.group.clone();
    lg.position.set(side * 1.55, y, -0.9);
    decoAt(y).add(lg);
    const gl = makeGlow({ color: 0xffc060, size: 1.7, intensity: 0.45, levels: 4 });
    gl.position.copy(lg.position).add(lantern.glowPos);
    world.add(gl);
    lamps.push(gl);
  }
  // decorations studding the rock faces, pointing at the camera (placed once a zone's walls exist)
  const frng = makeRng(31);
  // one cached shape per (zone, variant), all made up front so the build slices only clone
  const faceMesh = (k, vn, gold = false) => {
    const base = shade(LOOK[k].rock[vn % LOOK[k].rock.length], 0.8);
    const cl = (key, make, kind) => decoMesh(`f${k}:${key}:${vn}`, make, kind, [1, 8, 5]);
    if (k === 0) {
      const cols = gold ? [0xffe08a, 0xffffff, 0xc9862a] : [0xc86aff, 0xf0c0ff, 0x8a3ad0];
      return cl(gold ? 'g' : 'p', () => crystalCluster(700 + vn + (gold ? 9 : 0), cols, 4 + (vn % 3), 7 + vn, base), 'basic');
    }
    if (k === 1) return cl('i', () => crystalCluster(720 + vn, [0xbff6ff, 0xffffff, 0x7ab8e0], 4, 8, base), 'basic');
    if (k === 2) return cl('o', () => crystalCluster(740 + vn, [0x2a2238, 0x6b5a8a, 0x0e0a14], 4, 9, base), 'toon');
    if (k === 3) return cl('c', () => crystalCluster(760 + vn, [0x7fd0ff, 0xd8f4ff, 0x4a86c9], 5 + (vn % 3), 10 + (vn % 4), base), 'basic');
    if (k === 4) return cl('a', () => crystalCluster(780 + vn, [0xf2a32c, 0xffe08a, 0xa85a10], 3, 5, base), 'basic');
    const key = `mush${vn}`;
    if (!cache[key]) cache[key] = makeMushrooms(800 + vn, { n: 3, cap: [0x5ae0a0, 0xb0ffd8, 0x2a9a6a], scale: 0.8 }).group;
    return cache[key].clone();
  };
  for (let k = 0; k < 6; k++) for (let vn = 0; vn < 5; vn++) { faceMesh(k, vn); if (k === 0) faceMesh(k, vn, true); }
  function* faceDecor(k) {
    const count = k === 2 ? 6 : 13;
    for (let n = 0; n < count * 2; n++) {
      yield 'decor';
      const side = n % 2 ? 1 : -1;
      const x = side * frng.range(2.3, 5.0), y = k * ZH + frng.range(0.6, ZH - 0.6);
      const fz = faces[k][side](x, y);
      if (fz < -9) continue;
      const vn = n % 5; // five shapes per zone, reused (clones share geometry)
      const m = faceMesh(k, vn, k === 0 && frng.chance(0.3));
      if (k === 3) {
        const gl = makeGlow({ color: 0x5ab0ff, size: 1.3, intensity: 0.3, levels: 4 });
        gl.position.set(x, y, fz + 0.35);
        deco.add(gl);
        glowHalos.push(gl);
      }
      if (k === 5) m.rotation.x = Math.PI / 2;
      else m.rotation.y = -Math.PI / 2;
      m.rotation.z += frng.range(-0.4, 0.4);
      m.position.set(x, y, fz - 0.05);
      if (k !== 5) m.scale.setScalar(frng.range(1.1, 1.6));
      decoAt(y).add(m);
    }
  }

  // The walls are the heavy part (~0.6M triangles at 1/16): they build in small slices while the
  // farewell plays (prebuild), and whatever is left finishes when the ride starts.
  function* buildWalls() {
    for (let k = 0; k < 6; k++) {
      faces[k] = {};
      for (const side of [-1, 1]) {
        const z = yield* zoneSide(k, side, noise);
        faces[k][side] = z.faceAt;
        world.add(...z.meshes);
        wallTris += z.tris;
        for (const p of z.twinkles) twinklePts.push({ pos: p, color: LOOK[k].spark, size: 1, big: 3, bigShape: SHAPE.plus, speed: 1.5 + Math.random() * 2, phase: Math.random() * 9, sharp: 8, base: 0.15 });
      }
      world.add(...(yield* backWall(k, noise)));
      yield* faceDecor(k);
      for (const g of decoZ[k]) { batchStatic(g); yield 'batch'; } // crystals, roots and lamps: a couple of draws per 5 units
      builtZones = k + 1;
      yield;
    }
    twinkles = new Twinkles(twinklePts);
    world.add(twinkles.points);
  }
  let builtZones = 0;
  const wallGen = buildWalls();
  let wallsDone = false;
  function prebuild(budgetMs = 4) {
    if (wallsDone) return true;
    const t1 = performance.now(), end = t1 + budgetMs;
    while (performance.now() < end) {
      const a = performance.now();
      const r = wallGen.next();
      const d = performance.now() - a;
      if (r.value && d > (prebuild.worst[r.value] || 0)) prebuild.worst[r.value] = +d.toFixed(2); // what each kind of slice costs at worst
      if (r.done) {
        wallsDone = true;
        console.log(`[ending] shaft walls built in ${Math.round(wallMs + performance.now() - t1)} ms of slices (relief at 1/16, ${Math.round(wallTris / 1000)}k tris in 5-unit chunks)`);
        break;
      }
    }
    wallMs += performance.now() - t1;
    return wallsDone;
  }
  prebuild.worst = {};

  // surface: daylight above the topsoil
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.ShaderMaterial({
    uniforms: { uTop: { value: new THREE.Color(0xbfe8ff) }, uBot: { value: new THREE.Color(0xfff6dc) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uBot; varying vec2 vUv; ${GLSL_BAYER}
      void main(){ float k = bk_steps(vUv.y, 10.0); gl_FragColor = vec4(mix(uBot, uTop, k), 1.0); }`,
  }));
  sky.position.set(0, Y_TOP + 20, -3);
  world.add(sky);
  // grass tufts and flowers on the very top
  const tufts = new VoxelGrid(200, 6, 6);
  const trng = makeRng(4);
  for (let x = 0; x < 200; x++) {
    const ax = Math.abs(x - 100) / 8;
    if (ax < 1.75) continue;
    const h = trng.int(1, 4);
    for (let y = 0; y < h; y++) tufts.set(x, y, trng.int(1, 4), y === h - 1 && trng.chance(0.08) ? trng.pick([0xffe066, 0xff8ad0, 0xffffff]) : (y % 2 ? 0x6ac04a : 0x5ab84a));
  }
  const tuftMesh = voxMesh(tufts, { scale: 1 / 8, pivot: [100, 0, 3] });
  tuftMesh.position.set(0, Y_TOP + 0.3, 0.2);
  world.add(tuftMesh);

  // light from above (dithered gradient that grows near the top)
  const godMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uColor: { value: new THREE.Color(0xfff2c8) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uI; uniform vec3 uColor; varying vec2 vUv; ${GLSL_BAYER}
      void main(){
        float rays = 0.7 + 0.3 * sin(vUv.x * 40.0 + sin(vUv.x * 7.0) * 3.0);
        float i = smoothstep(0.35, 1.0, vUv.y) * uI * rays;
        float q = bk_steps(i, 10.0);
        if (q <= 0.0) discard;
        gl_FragColor = vec4(uColor * q, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const god = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), godMat);
  god.renderOrder = 50;
  scene.add(god);

  // particles: zone motes (world space) and speed lines (camera space)
  const motes = new Particles({ max: 260, additive: true });
  world.add(motes.points);
  const speedN = 46;
  const spPos = new Float32Array(speedN * 6);
  const spCol = new Float32Array(speedN * 8);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3).setUsage(THREE.DynamicDrawUsage));
  spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 4).setUsage(THREE.DynamicDrawUsage));
  const speed = new THREE.LineSegments(spGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  speed.frustumCulled = false;
  speed.renderOrder = 40;
  scene.add(speed);
  const lines = Array.from({ length: speedN }, () => ({ x: 0, y: 0, z: 0, len: 1, a: 0 }));
  const resetLine = (l, anywhere) => {
    l.z = 2 + Math.random() * 7;
    const half = (camDist - l.z) * Math.tan(THREE.MathUtils.degToRad(17)) * 1.9 * Math.max(0.6, camera.aspect / 1.78);
    l.x = (Math.random() * 2 - 1) * half;
    if (Math.abs(l.x) < 1.2 && l.z < 4) l.x += Math.sign(l.x || 1) * 1.2;
    l.y = anywhere ? (Math.random() * 2 - 1) * half * 0.6 : half * 0.6 + Math.random() * 2;
    l.len = 0.6 + Math.random() * 1.8;
    l.a = 0.25 + Math.random() * 0.45;
  };
  for (const l of lines) resetLine(l, true);

  const { mole, hen, cage } = ctx;
  const S = { t: 0, y: 0, zone: 0 };
  const dur = 14;
  const accel = 0.12;
  const heightAt = (u) => {
    u = clamp(u, 0, 1);
    const yy = u < accel ? (u * u) / (2 * accel) : u - accel / 2;
    return (Y_END * yy) / (1 - accel / 2);
  };
  const tmpC = new THREE.Color();
  const tmpC2 = new THREE.Color();

  const seatRiders = () => {
    if (mole.root.parent !== cage.root) cage.root.add(mole.root);
    if (hen.root.parent !== cage.root) cage.root.add(hen.root);
    mole.root.position.set(-0.34, cage.seatY - 2 * mole.s, cage.seatZ + 0.02);
    mole.root.rotation.set(0, 0, 0);
    mole.face(0, true);
    mole.play('sit');
    hen.root.position.set(0.46, cage.seatY, cage.seatZ + 0.06);
    hen.face(0, true);
    hen.play('sit');
  };

  // make sure every zone up to height y exists before it can be seen
  const ensureWalls = (y) => {
    const need = Math.min(6, Math.floor(Math.max(0, y) / ZH) + 1);
    while (builtZones < need && !wallsDone) prebuild(8);
  };
  const enter = () => {
    ensureWalls(0);
    scene.add(cage.root);
    if (cage.cable) cage.cable.visible = true;
    cage.lampGlow.visible = true;
    seatRiders();
    cage.setGate(1);
    cage.root.position.set(0, 0, 0);
    cage.root.rotation.set(0, 0, 0);
    S.t = 0; S.y = 0; S.zone = -1;
    motes.clear();
  };

  const zoneAt = (y) => clamp(Math.floor(y / ZH), 0, 5);
  const depthAt = (y) => {
    const k = zoneAt(y);
    const f = clamp((y - k * ZH) / ZH, 0, 1);
    const z = SHAFT_ZONES[k];
    return z.bottom + (z.top - z.bottom) * f;
  };

  let flapT = 0.6;
  const update = (dt, api) => {
    S.t += dt;
    const y = heightAt(S.t / dur);
    // keep building the walls above in thin slices; only block if the ride outruns the builder
    prebuild(2);
    ensureWalls(y + CAM_UP + camDist * Math.tan(THREE.MathUtils.degToRad(17)) + 1); // the top of the view, plus a margin
    const vy = (y - S.y) / Math.max(dt, 1e-4);
    S.y = y;
    const speedK = clamp(vy / 9, 0, 1.4);
    cage.root.position.set(Math.sin(S.t * 23) * 0.008 * speedK, y, 0);
    cage.root.rotation.z = Math.sin(S.t * 2.3) * 0.012 * speedK;
    camera.position.set(0, y + CAM_UP, camDist);
    camera.quaternion.copy(camQuat);
    lampLight.position.set(0, y + 2.2, 0.4);

    // zone-dependent mood
    const k = zoneAt(y);
    const f = clamp((y - k * ZH) / ZH, 0, 1);
    const kn = Math.min(5, k + 1);
    const blend = clamp((f - 0.82) / 0.18, 0, 1);
    const A = LOOK[k], B = LOOK[kn];
    scene.background.set(A.bg).lerp(tmpC.set(B.bg), blend);
    hemi.color.set(A.hemi[0]).lerp(tmpC.set(B.hemi[0]), blend);
    hemi.groundColor.set(A.hemi[1]).lerp(tmpC.set(B.hemi[1]), blend);
    tmpC2.set(A.tint).lerp(tmpC.set(B.tint), blend);
    const top = clamp((y - (Y_TOP - 26)) / 24, 0, 1);
    api.post.tint = tmpC2.getHex();
    api.post.brightness = 1 + top * 0.18;
    api.post.vignette = 0.5 - top * 0.3;
    hemi.intensity = 1.6 + top * 1.6;
    godMat.uniforms.uI.value = top * 0.9;
    god.position.set(0, y + CAM_UP + 0.25, camDist - 3.2);
    if (k !== S.zone) {
      S.zone = k;
      if (k > 0) api.audio.play('whoosh');
    }
    api.setDepth(depthAt(y), k, y / Y_END);

    // zone particles streaming past
    const spawnN = Math.round(dt * 60);
    for (let i = 0; i < spawnN; i++) {
      const px = (Math.random() * 2 - 1) * 7, pz = -1 + Math.random() * 3.5;
      const py = y + CAM_UP + 5 + Math.random() * 3;
      const zk = zoneAt(py);
      const L = LOOK[zk];
      if (zk === 2) motes.spawn({ pos: [px, py - 6, pz], vel: [(Math.random() - 0.5) * 0.4, 1.5 + Math.random() * 2, 0], life: 2.5, color: 0xffd060, color2: 0xd9401a, size: Math.random() < 0.3 ? 2 : 1, flicker: 0.4 });
      else if (zk === 1) motes.spawn({ pos: [px, py, pz], vel: [(Math.random() - 0.5) * 0.5, -0.6, 0], life: 3, color: 0xffffff, size: Math.random() < 0.3 ? 2 : 1, wobble: 0.4, shape: SHAPE.plus });
      else if (zk === 4) { if (Math.random() < 0.4) motes.spawn({ pos: [px * 0.4, py, pz], vel: [0, -4, 0], life: 2, color: 0x9ad8ff, size: 1, shape: SHAPE.square }); }
      else if (zk === 5) motes.spawn({ pos: [px, py, pz], vel: [(Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0], life: 3, color: Math.random() < 0.3 ? 0xd8ff7a : L.spark, size: Math.random() < 0.25 ? 2 : 1, flicker: 0.6, wobble: 0.3 });
      else motes.spawn({ pos: [px, py, pz], vel: [(Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, 0], life: 3, color: L.spark, size: Math.random() < 0.2 ? 3 : 1, shape: Math.random() < 0.3 ? SHAPE.plus : SHAPE.square, flicker: 0.5 });
    }
    motes.update(dt);
    if (twinkles) twinkles.update(dt);
    for (const g of lamps) g.userData.glow.uIntensity.value = 0.42 + Math.sin(S.t * 6 + g.id) * 0.04;
    for (const g of glowHalos) g.userData.glow.uIntensity.value = 0.32 + Math.sin(S.t * 3 + g.id) * 0.06;

    // speed lines in camera space
    const camY = y + CAM_UP;
    for (let i = 0; i < speedN; i++) {
      const l = lines[i];
      l.y -= vy * dt * (1 + (l.z - 2) * 0.08) * 1.15;
      const half = (camDist - l.z) * Math.tan(THREE.MathUtils.degToRad(17));
      if (l.y + l.len < -half - 0.5) resetLine(l, false);
      const len = l.len * (0.4 + speedK * 0.9);
      spPos[i * 6] = l.x; spPos[i * 6 + 1] = camY + l.y; spPos[i * 6 + 2] = l.z;
      spPos[i * 6 + 3] = l.x; spPos[i * 6 + 4] = camY + l.y + len; spPos[i * 6 + 5] = l.z;
      const a = l.a * clamp(speedK, 0, 1);
      for (const o of [0, 4]) { spCol[i * 8 + o] = 1; spCol[i * 8 + o + 1] = 0.95; spCol[i * 8 + o + 2] = 0.85; spCol[i * 8 + o + 3] = o ? a : 0; }
    }
    spGeo.attributes.position.needsUpdate = true;
    spGeo.attributes.color.needsUpdate = true;

    // riders: the mole looks up, the hen flaps
    mole.update(dt);
    hen.update(dt);
    const look = clamp(S.t / 2, 0, 1);
    mole.neck.rotation.x = -0.12 - 0.42 * look + Math.sin(S.t * 1.7) * 0.04;
    mole.neck.rotation.y = Math.sin(S.t * 0.6) * 0.15;
    mole.armL.rotation.x = -0.55; mole.armR.rotation.x = -0.55;
    mole.legL.rotation.x = -1.45 + Math.sin(S.t * 5) * 0.18;
    mole.legR.rotation.x = -1.45 - Math.sin(S.t * 5) * 0.18;
    flapT -= dt;
    if (flapT < 0) { flapT = 0.9 + Math.random() * 1.2; hen.flap(0.5 + Math.random() * 0.4); if (Math.random() < 0.4) api.audio.play('cluck', { n: 2 }); }
    hen.head.rotation.x = -0.35;
    cage.lampGlow.userData.glow.uIntensity.value = 0.55 + Math.sin(S.t * 9) * 0.05;
  };

  // narrow screens: back off so the cage keeps some rock on either side
  const onResize = () => { camDist = Math.max(CAM_DIST, 9.6 / Math.max(0.3, camera.aspect)); };
  console.log(`[ending] shaft set up in ${Math.round(performance.now() - t0)} ms (walls build in slices)`);
  return { scene, camera, enter, update, prebuild, duration: dur, depthAt, heightAt, onResize };
}
