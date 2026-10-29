// Little voxel models for the building part: torch and lantern flames (the light sources you
// place), the tools held in the paws (axes, spades, shears and the block you are about to put
// down, for the first-person view model), mini blocks that pop out of a broken block, and the
// crack stages drawn over a block you are breaking. Geometries are cached.
import * as THREE from 'three';
import { VoxelGrid, meshGridGreedy } from '../../gfx/Voxel.js';
import { MAT } from '../materials.js';
import { BLOCK_OF_ITEM } from './blocks.js';
import { ITEMS } from '../../data/items.js';

const cache = new Map();
const cached = (k, fn) => { if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const hh = (x, y, z, s = 0) => { let h = (x * 374761393 + y * 668265263 + z * 1274126177 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mix = (a, b, t) => {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};
const lt = (c, k) => mix(c, 0xffffff, k), dk = (c, k) => mix(c, 0x000000, k);

const WOOD = [0x5a3a1e, 0x74482a, 0x8a5a34];
const IRON = [0x1e1a1a, 0x2e2a2a, 0x46403e, 0x6a625e];

// ------------------------------------------------------------------ torches and lanterns (meters)
/** Torch: { body, flame, top } (meters, base centre at the origin, standing up +y). */
export function torchModel() {
  return cached('torch', () => {
    const S = 1 / 32;
    const g = new VoxelGrid(6, 17, 6), f = new VoxelGrid(6, 17, 6);
    for (let y = 0; y < 9; y++) for (let x = 2; x < 4; x++) for (let z = 2; z < 4; z++) g.set(x, y, z, WOOD[(x + z + (y >> 1)) % 3]);
    // a wrap of coal and pitch at the head
    for (let y = 9; y < 11; y++) for (let x = 2; x < 4; x++) for (let z = 2; z < 4; z++) g.set(x, y, z, y === 10 ? 0x3a2414 : 0x2a1c14);
    for (const [x, z] of [[1, 2], [4, 3], [2, 1], [3, 4]]) g.set(x, 9, z, 0x2a1c14);
    // the flame: an orange skin round a hot core, licking up to a point
    for (let y = 11; y < 15; y++) for (let x = 1; x < 5; x++) for (let z = 1; z < 5; z++) {
      const edge = x === 1 || x === 4 || z === 1 || z === 4;
      if (edge && (y > 12 || ((x === 1 || x === 4) && (z === 1 || z === 4)))) continue;
      f.set(x, y, z, edge ? 0xe86018 : y === 11 ? 0xff9a28 : y === 12 ? 0xffc848 : 0xffe8a0);
    }
    f.set(2, 15, 3, 0xffb040); f.set(3, 15, 2, 0xffd878); f.set(3, 16, 3, 0xff9a30);
    const o = { scale: S, pivot: [3, 0, 3], shade: true };
    return { body: meshGridGreedy(g, o), flame: meshGridGreedy(f, o), top: new THREE.Vector3(0, 13 * S, 0), size: 17 * S };
  });
}

/**
 * Lantern: { body, glow, height } (meters): an iron frame with warm glass, a cap and a ring.
 * mode 'hang' adds a chain above (the origin is the hook), 'stand' sits on the origin.
 */
export const LANTERN_S = 1 / 46; // meters per lantern voxel (a lantern about 15 cm across)
export function lanternModel(mode = 'hang') {
  return cached('lantern:' + mode, () => {
    const S = LANTERN_S;
    const chain = mode === 'hang' ? 4 : 0;
    const H = 11 + chain;
    const g = new VoxelGrid(7, H, 7), f = new VoxelGrid(7, H, 7);
    for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) {
      const edge = x === 0 || z === 0 || x === 6 || z === 6;
      g.set(x, 0, z, edge ? IRON[2] : IRON[1]); // the base plate
      if (x > 0 && x < 6 && z > 0 && z < 6) g.set(x, 7, z, IRON[2 + ((x + z) & 1)]); // the cap, stepping up
    }
    for (let x = 2; x < 5; x++) for (let z = 2; z < 5; z++) g.set(x, 8, z, IRON[2]);
    g.set(3, 9, 3, IRON[3]);
    for (const [x, z] of [[2, 3], [4, 3]]) g.set(x, 10, z, IRON[3]); // the ring
    g.set(3, 10, 3, IRON[1]);
    for (let y = 1; y < 7; y++) {
      // iron posts at the corners and a frame round each window
      for (const [x, z] of [[0, 0], [6, 0], [0, 6], [6, 6]]) g.set(x, y, z, IRON[y === 6 ? 3 : 2]);
      for (let k = 1; k < 6; k++) for (const [x, z] of [[k, 0], [k, 6], [0, k], [6, k]]) {
        const frame = k === 1 || k === 5 || y === 1 || y === 6;
        if (frame) g.set(x, y, z, IRON[1 + (y === 6 ? 1 : 0)]);
        else f.set(x, y, z, (y === 4 && k === 3) ? 0xfff0c0 : y > 3 && k > 1 && k < 5 ? 0xffc868 : 0xe89040); // warm glass, brightest round the flame
      }
    }
    // the flame inside (seen through the panes from above and below the bars)
    for (let y = 2; y < 6; y++) for (let x = 2; x < 5; x++) for (let z = 2; z < 5; z++) if (y < 5 || (x === 3 && z === 3)) f.set(x, y, z, y >= 4 ? 0xfff6d0 : 0xffb848);
    for (let k = 0; k < chain; k++) g.set(3, 11 + k, 3, k & 1 ? IRON[1] : IRON[3]);
    const o = { scale: S, pivot: [3.5, mode === 'hang' ? H : 0, 3.5], shade: true };
    return { body: meshGridGreedy(g, o), glow: meshGridGreedy(f, o), height: H * S, light: new THREE.Vector3(0, (mode === 'hang' ? -H + 4 : 4) * S, 0) };
  });
}

/** A wall bracket arm for a lantern on a wall: from the wall (origin) out along +z. */
export function bracketModel() {
  return cached('bracket', () => {
    const S = LANTERN_S * 1.15;
    const g = new VoxelGrid(3, 6, 8);
    for (let z = 0; z < 8; z++) g.set(1, 5, z, IRON[2 + (z & 1)]);
    for (let k = 0; k < 4; k++) g.set(1, 1 + k, k, IRON[2]);
    g.set(1, 4, 7, IRON[3]);
    g.set(1, 3, 7, IRON[1]);
    return meshGridGreedy(g, { scale: S, pivot: [1.5, 0, 0], shade: true });
  });
}

// ------------------------------------------------------------------ crack stages
/** Eight crack textures (Minecraft's breaking stages), drawn once. */
export function crackTextures() {
  return cached('cracks', () => {
    const out = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // grow one set of crack paths and snapshot it at eight lengths
    const paths = [];
    for (let i = 0; i < 9; i++) {
      let x = 16 + (rnd() - 0.5) * 6, y = 16 + (rnd() - 0.5) * 6, a = rnd() * Math.PI * 2;
      const p = [];
      for (let k = 0; k < 30; k++) { p.push([x | 0, y | 0]); a += (rnd() - 0.5) * 1.1; x += Math.cos(a); y += Math.sin(a); if (x < 0 || y < 0 || x > 31 || y > 31) break; }
      paths.push(p);
    }
    for (let s = 0; s < 8; s++) {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const ctx = c.getContext('2d');
      const len = Math.round(4 + (s + 1) * 3.2);
      // a dark crack with a pale lip under it (the light catches the broken edge)
      for (let i = 0; i < Math.min(paths.length, 2 + s); i++) for (const [x, y] of paths[i].slice(0, len)) { ctx.fillStyle = 'rgba(255, 240, 220, 0.32)'; ctx.fillRect(x, y + 1, 1, 1); }
      ctx.fillStyle = 'rgba(10, 6, 4, 1)';
      for (let i = 0; i < Math.min(paths.length, 2 + s); i++) for (const [x, y] of paths[i].slice(0, len)) ctx.fillRect(x, y, 1, 1);
      if (s >= 4) { ctx.fillStyle = 'rgba(12, 8, 6, 0.35)'; for (let i = 0; i < 4 + s * 6; i++) ctx.fillRect((rnd() * 32) | 0, (rnd() * 32) | 0, 1, 1); }
      const t = new THREE.CanvasTexture(c);
      t.magFilter = t.minFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.colorSpace = THREE.SRGBColorSpace;
      out.push(t);
    }
    return out;
  });
}

// ------------------------------------------------------------------ block colours
/** A few colours that read as the block (for mini blocks, ghosts and the paw). */
export function blockColors(m) {
  const d = MAT[m];
  if (!d) return [0x808080, 0x909090, 0xa0a0a0, 0xb0b0b0];
  return d.tones;
}

/** A mini block (meters): a 4×4×4 voxel cube coloured like the block (edges a shade darker). */
export function miniBlockGeo(m, size = 0.12) {
  return cached(`mini:${m}:${size}`, () => {
    const g = new VoxelGrid(4, 4, 4), T = blockColors(m);
    for (let z = 0; z < 4; z++) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const e = (x === 0 || x === 3) + (y === 0 || y === 3) + (z === 0 || z === 3);
      const k = Math.min(3, Math.max(0, Math.floor(hh(x, y, z, m) * 3.2) + (e >= 2 ? -1 : 0) + (y === 3 ? 1 : 0)));
      g.set(x, y, z, T[k]);
    }
    return meshGridGreedy(g, { scale: size / 4, pivot: [2, 2, 2], shade: true });
  });
}

// ------------------------------------------------------------------ held in the paws (view-model voxels)
/**
 * Geometry for the view model's custom held tool (ViewModel.setTool(kind, { geo })): { geo, tip }.
 * Built in view-model voxels like the pick: the grip at the origin, the handle up +y, the head at
 * the top facing −z.
 */
export function heldGeo(itemId) {
  const it = ITEMS[itemId];
  if (!it) return null;
  if (it.slot === 'axe') return cached('h:' + itemId, () => axeGeo(it.icon?.c ?? 0x9aa0a8, it.tier || 2));
  if (it.slot === 'spade') return cached('h:' + itemId, () => spadeGeo(it.icon?.c ?? 0x9aa0a8, it.tier || 2));
  if (it.slot === 'shears') return cached('h:' + itemId, () => shearsGeo(it.icon?.c ?? 0x9aa0a8));
  const b = BLOCK_OF_ITEM[itemId];
  if (b) return cached('h:' + itemId, () => heldBlockGeo(b));
  return null;
}

function axeGeo(metal, tier) {
  // grid: x -8..8, y -16..96, z -40..20 (offset into the grid)
  const OX = 8, OY = 16, OZ = 40;
  const g = new VoxelGrid(17, 114, 62);
  const set = (x, y, z, c) => g.set(x + OX, y + OY, z + OZ, c);
  // handle (slightly curved forward at the top)
  for (let y = -15; y < 90; y++) {
    const bend = y > 60 ? Math.round((y - 60) * 0.12) : 0;
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      if (x * x + z * z > 9.5) continue;
      let c = WOOD[(Math.floor(Math.atan2(z, x) * 1.6 + 8) + (y >> 3)) % 3];
      if (y < 14 && y > -12) c = (y & 3) === 0 ? 0x2a1a10 : 0x4a2e1a;
      set(x, y, z - bend, c);
    }
  }
  // the head: an eye round the handle, a flared blade forward (−z), a short poll behind
  const stone = tier <= 1;
  const base = metal, hi = lt(metal, 0.35), lo = dk(metal, 0.35), edge = lt(metal, stone ? 0.15 : 0.6);
  for (let y = 70; y < 92; y++) for (let z = -38; z < 12; z++) for (let x = -5; x <= 5; x++) {
    const yc = 81;
    const bz = -z; // forward distance
    let half; // blade half-height at this forward distance
    if (z >= -6 && z <= 8) half = 6; // eye / poll
    else if (z < -6) half = 4 + (bz - 6) * 0.42; // flaring blade
    else continue;
    if (Math.abs(y - yc) > half) continue;
    const th = z < -6 ? Math.max(1, 3.5 - (bz - 6) * 0.11) : 5;
    if (Math.abs(x) > th) continue;
    let c = Math.abs(x) >= th - 0.5 ? lo : base;
    if (y - yc > half - 1.5) c = hi;
    if (z < -34) c = edge;
    if (stone && hh(x, y, z, 3) < 0.3) c = dk(c, 0.15);
    set(x, y, z - 0, c);
  }
  // the handle shows through the eye top
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (x * x + z * z < 5) set(x, 92, z, WOOD[1]);
  if (stone) for (let y = 74; y < 90; y += 3) for (let x = -6; x <= 6; x++) set(x, y, 0, 0x6a5a3a); // lashing
  return { geo: meshGridGreedy(g, { scale: 1, pivot: [OX, OY, OZ], shade: true }), tip: [0, 81, -36] };
}

function spadeGeo(metal, tier) {
  const OX = 14, OY = 18, OZ = 8;
  const g = new VoxelGrid(29, 126, 16);
  const set = (x, y, z, c) => g.set(x + OX, y + OY, z + OZ, c);
  const stone = tier <= 1;
  // D-grip at the bottom, the shaft up, the blade at the top (facing −z)
  for (let x = -8; x <= 8; x++) for (let z = -2; z <= 2; z++) { set(x, -16, z, WOOD[1]); if (Math.abs(x) >= 7) for (let y = -16; y < -6; y++) set(x, y, z, WOOD[(y & 1) + 1]); }
  for (let y = -6; y < 76; y++) for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
    if (x * x + z * z > 9.5) continue;
    let c = WOOD[(Math.floor(Math.atan2(z, x) * 1.6 + 8) + (y >> 3)) % 3];
    if (y > 4 && y < 22) c = (y & 3) === 0 ? 0x2a1a10 : 0x4a2e1a;
    set(x, y, z, c);
  }
  const hi = lt(metal, 0.35), lo = dk(metal, 0.3), edge = lt(metal, stone ? 0.12 : 0.55);
  for (let y = 72; y < 106; y++) {
    const t = (y - 72) / 34;
    const half = y < 78 ? 5 : y > 98 ? Math.max(2, 13 - (y - 98) * 1.4) : 13;
    for (let x = -14; x <= 14; x++) {
      if (Math.abs(x) > half) continue;
      const dish = Math.round((x / 14) ** 2 * 2);
      for (let z = -1; z <= 1; z++) {
        let c = z === -1 ? hi : z === 1 ? lo : metal;
        if (y > 101) c = edge;
        if (Math.abs(x) >= half - 0.5) c = lo;
        if (stone && hh(x, y, z, 5) < 0.25) c = dk(c, 0.18);
        set(x, y, z + dish - (t > 0.6 ? 1 : 0), c);
      }
    }
  }
  return { geo: meshGridGreedy(g, { scale: 1, pivot: [OX, OY, OZ], shade: true }), tip: [0, 104, -1] };
}

function shearsGeo(metal) {
  const OX = 12, OY = 4, OZ = 6;
  const g = new VoxelGrid(25, 80, 12);
  const set = (x, y, z, c) => g.set(x + OX, y + OY, z + OZ, c);
  const hi = lt(metal, 0.45), lo = dk(metal, 0.3);
  // two crossed blades from a rivet, red-wrapped handles below
  for (const s of [-1, 1]) {
    for (let y = 0; y < 34; y++) {
      const x = Math.round(s * (5 - y * 0.12));
      for (let k = -2; k <= 2; k++) for (let z = -2; z <= 2; z++) if (k * k + z * z < 6) set(x + k, y, z, (y & 3) ? 0x9a2a1e : 0x6a1a12);
    }
    for (let y = 34; y < 72; y++) {
      const x = Math.round(s * (1.5 - (y - 34) * 0.06));
      const w = y > 64 ? 1 : 2;
      for (let k = -w; k <= w; k++) set(x + k * s * (k > 0 ? 1 : 1), y, s, k === w ? hi : metal);
    }
  }
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) if (x * x + z * z < 5) set(x, 36, z, lo);
  return { geo: meshGridGreedy(g, { scale: 1, pivot: [OX, OY, OZ], shade: true }), tip: [0, 70, 0] };
}

/** The block (or torch, door…) held in the paw, about 14 cm. */
function heldBlockGeo(b) {
  const N = 12;
  if (b.kind === 'torch') {
    const g = new VoxelGrid(6, 40, 6);
    for (let y = 0; y < 30; y++) for (let x = 1; x < 5; x++) for (let z = 1; z < 5; z++) g.set(x, y, z, WOOD[(x + z + (y >> 2)) % 3]);
    for (let y = 30; y < 35; y++) for (let x = 1; x < 5; x++) for (let z = 1; z < 5; z++) g.set(x, y, z, 0x2a1c14);
    for (let y = 35; y < 40; y++) for (let x = 1; x < 5; x++) for (let z = 1; z < 5; z++) g.set(x, y, z, y < 37 ? 0xffb030 : 0xffe080);
    return { geo: meshGridGreedy(g, { scale: 1, pivot: [3, 2, 3], shade: true }), tip: [0, 38, 0] };
  }
  const T = blockColors(b.m);
  const g = new VoxelGrid(N, N, N);
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (b.kind === 'ladder' && !(((x === 1 || x === 10) || (y % 3 === 1)) && z === 0)) continue;
    const e = (x === 0 || x === N - 1) + (y === 0 || y === N - 1) + (z === 0 || z === N - 1);
    let k = Math.floor(hh(x >> 1, y >> 1, z >> 1, b.m) * 3.4);
    if (e >= 2) k -= 1;
    if (y === N - 1) k += 1;
    g.set(x, y, z, T[Math.max(0, Math.min(3, k))]);
  }
  const S = 2.4; // view-model voxels per mini voxel (a block about 10 cm across in the paw)
  return { geo: meshGridGreedy(g, { scale: S, pivot: [N / 2, 0, N / 2], shade: true }), tip: [0, N * S, 0] };
}
