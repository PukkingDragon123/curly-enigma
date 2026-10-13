// Deep Town's natural and civic bits: the painted cave floor, voxel rock walls with
// crystals, roots and vines, low rims, glowing mushroom trees, lamp posts, benches,
// the plaza fountain, mine-cart tracks, mound houses and small props.
import * as THREE from 'three';
import { PixelCanvas, pixelTexture, ramp } from '../gfx/PixelArt.js';
import { makeRng, makeNoise2D, mixHex, shade, clamp } from '../core/util.js';
import { VoxelGrid, vmesh, vmeshG, gmesh, jit, hash3, V16, V8, carve } from './vox.js';
import { TOWN, pavedAt } from './townLayout.js';
import { waterMaterial } from './water.js';

const TPX = 16;
const ROCK = 0x5e4c50, ROCK_D = 0x3e3238, MOSS = 0x4a7a3a, MOSS_L = 0x6a9a4a, ROOT = 0x6a4a2a;
const WOOD = 0x8a5a32, WOOD_D = 0x5a3a22, IRON = 0x34343c;

// ---------------------------------------------------------------- floor
export function paintTownFloor() {
  const { W, H, plaza, sun, fountain } = TOWN;
  const pc = new PixelCanvas(W * TPX, H * TPX);
  const n = makeNoise2D(11);
  const dirtA = 0x58422f, dirtB = 0x644a36, dirtC = 0x483428;
  for (let py = 0; py < H * TPX; py++) {
    for (let px = 0; px < W * TPX; px++) {
      const x = px / TPX, z = py / TPX;
      const h = hash3(px, py, 0, 3);
      const nn = n.fbm(x * 0.35, z * 0.35, 3);
      let c = nn > 0.12 ? dirtB : nn < -0.15 ? dirtC : dirtA;
      if (h < 0.06) c = shade(c, 0.78); else if (h > 0.95) c = shade(c, 1.2);
      // moss creeping out from the walls and rims
      const edge = Math.min(z - TOWN.northFace, x - TOWN.westFace, TOWN.southRim - z, TOWN.eastRim - x);
      if (edge < 2.2 && n.fbm(x * 0.9 + 7, z * 0.9, 2) > edge * 0.18 - 0.05 && h < 0.75) c = hash3(px, py, 1, 2) < 0.2 ? MOSS_L : MOSS;
      pc.set(px, py, c);
    }
  }
  // cobbles: plaza and paths, drawn as little rounded stones
  const rng = makeRng(77);
  const cob = [0x8a7e74, 0x7a6e66, 0x968a7c, 0x6e645c];
  for (let gy = 0; gy < H * TPX; gy += 4) {
    for (let gx = (gy / 4) % 2 ? 2 : 0; gx < W * TPX; gx += 5) {
      const cx = gx + 2, cy = gy + 2;
      if (!pavedAt(cx / TPX, cy / TPX)) continue;
      const col = cob[Math.floor(hash3(gx, gy, 2, 5) * cob.length)];
      const dark = 0x3a322c;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) {
        const corner = (x === 0 || x === 4) && (y === 0 || y === 3);
        if (corner) continue;
        let c = col;
        if (y === 0 || x === 0) c = shade(col, 1.12);
        if (y === 3 || x === 4) c = shade(col, 0.8);
        pc.set(gx + x, gy + y, c);
      }
      pc.set(gx + 4, gy + 3, dark);
      if (rng.chance(0.06)) pc.set(gx + 2, gy + 1, MOSS);
    }
  }
  // fountain surround: a ring of big flagstones
  for (let py = 0; py < H * TPX; py++) for (let px = 0; px < W * TPX; px++) {
    const d = Math.hypot(px / TPX - fountain.x, py / TPX - fountain.z);
    if (d > fountain.r && d < fountain.r + 0.7) {
      const a = Math.atan2(py / TPX - fountain.z, px / TPX - fountain.x);
      const seg = Math.floor((a + Math.PI) / (Math.PI / 10));
      let c = jit(0x9a8e80, seg, 0, 0, 3, 0.08);
      if (Math.abs(((a + Math.PI) / (Math.PI / 10)) % 1) < 0.06 || d > fountain.r + 0.64) c = 0x4a3e36;
      pc.set(px, py, c);
    }
  }
  // the sunlit patch: the only grass in Deep Town
  for (let py = 0; py < H * TPX; py++) for (let px = 0; px < W * TPX; px++) {
    const dx = px / TPX - sun.x, dz = (py / TPX - sun.z) * 1.15;
    const d = Math.hypot(dx, dz);
    if (d < sun.r * (0.86 + 0.14 * hash3(px >> 1, py >> 1, 0, 9))) {
      const h = hash3(px, py, 3, 4);
      pc.set(px, py, h < 0.2 ? 0x8ad86a : h < 0.5 ? 0x6ac04a : h < 0.85 ? 0x5aa83a : 0x4a8a3a);
    }
  }
  // puddles
  for (const [x, z, r] of [[24.2, 18.4, 0.55], [12.6, 9.6, 0.45], [28.6, 14.6, 0.5]]) {
    for (let py = Math.floor((z - r) * TPX); py < (z + r) * TPX; py++) for (let px = Math.floor((x - r * 1.5) * TPX); px < (x + r * 1.5) * TPX; px++) {
      const dx = (px / TPX - x) / 1.5, dz = py / TPX - z;
      const d = Math.hypot(dx, dz);
      if (d < r) pc.set(px, py, d > r - 0.08 ? 0x2a2a34 : d < r * 0.35 && hash3(px, py, 0, 1) < 0.2 ? 0x6a7a90 : 0x3a4458);
    }
  }
  // gravel bed under the tracks
  for (let i = 0; i < TOWN.track.length - 1; i++) {
    const a = TOWN.track[i], b = TOWN.track[i + 1];
    const x0 = Math.min(a.x, b.x) - 0.65, x1 = Math.max(a.x, b.x) + 0.65, z0 = Math.min(a.z, b.z) - 0.65, z1 = Math.max(a.z, b.z) + 0.65;
    for (let py = Math.floor(z0 * TPX); py < z1 * TPX; py++) for (let px = Math.floor(x0 * TPX); px < x1 * TPX; px++) {
      const h = hash3(px, py, 7, 1);
      pc.set(px, py, h < 0.3 ? 0x6a5e54 : h < 0.6 ? 0x54483e : 0x463a32);
    }
  }
  // the lift pit
  const L = TOWN.lift;
  for (let py = (L.z0 + 0.4) * TPX; py < (L.z0 + L.d - 0.4) * TPX; py++) for (let px = (L.x0 + 0.4) * TPX; px < (L.x0 + L.w - 0.4) * TPX; px++) pc.set(px, py, 0x08060a);
  // contact shadows at the back walls
  for (let py = 0; py < H * TPX; py++) for (let px = 0; px < W * TPX; px++) {
    const x = px / TPX, z = py / TPX;
    const dn = z - TOWN.northFace, dw = x - TOWN.westFace;
    const f = Math.min(1, 0.55 + Math.max(0, Math.min(dn, dw)) * 0.9);
    if (f < 1) { const i = (py * W * TPX + px) * 4; pc.d[i] *= f; pc.d[i + 1] *= f; pc.d[i + 2] *= f; }
  }
  return pc;
}

export function floorMaterialAt(x, z) {
  const L = TOWN.lift;
  for (let i = 0; i < TOWN.track.length - 1; i++) {
    const a = TOWN.track[i], b = TOWN.track[i + 1];
    if (x > Math.min(a.x, b.x) - 0.6 && x < Math.max(a.x, b.x) + 0.6 && z > Math.min(a.z, b.z) - 0.6 && z < Math.max(a.z, b.z) + 0.6) return 'wood';
  }
  if (x > L.x0 && x < L.x0 + L.w && z > L.z0 && z < L.z0 + L.d + 1) return 'wood';
  if (Math.hypot(x - TOWN.sun.x, z - TOWN.sun.z) < TOWN.sun.r) return 'dirt';
  return pavedAt(x, z) ? 'stone' : 'dirt';
}

// ---------------------------------------------------------------- rock walls
/**
 * A section of back wall. axis 'N' runs along x (face toward +z at TOWN.northFace),
 * 'W' runs along z (face toward +x). u0..u1 in world units along the wall.
 */
export function rockWall(axis, u0, u1, opts = {}) {
  const H = opts.h ?? 52;
  const depth = 15;
  const len = Math.round((u1 - u0) / V8);
  const g = new VoxelGrid(axis === 'N' ? len : depth, H, axis === 'N' ? depth : len);
  const noise = makeNoise2D(axis === 'N' ? 5 : 9);
  const face = axis === 'N' ? TOWN.northFace : TOWN.westFace;
  const base = face - (depth - 3) * V8; // world coordinate of grid depth 0
  const flat = opts.flat || [];
  for (let i = 0; i < len; i++) {
    const u = u0 + (i + 0.5) * V8;
    const behind = flat.some(([a, b]) => u > a - 0.1 && u < b + 0.1);
    for (let v = 0; v < H; v++) {
      const bump = noise.fbm(u * 0.55, v * 0.09, 3) * 3.2 + (v < 12 ? noise(u * 1.3, 4) * 2.2 : 0) + (v > H - 10 ? (v - (H - 10)) * -0.3 : 0);
      const fd = behind ? depth - 4 : Math.round(clamp(depth - 3 + bump, 4, depth - 1));
      const top = v / H;
      const fade = top < 0.55 ? 1 : Math.max(0.12, 1 - (top - 0.55) * 2.0);
      const strata = 0.9 + ((Math.floor((v + noise(u * 0.3, 2) * 4) / 6) % 3) * 0.07);
      for (let d = 0; d < fd; d++) {
        let c = jit(shade(ROCK, strata * fade), i >> 1, v >> 1, d >> 1, 3, 0.1);
        const h = hash3(i, v, d, 7);
        if (h < 0.04) c = shade(ROCK_D, fade);
        else if (h > 0.985) c = shade(0x8a7a7c, fade);
        if (axis === 'N') g.set(i, v, d, c); else g.set(d, v, i, c);
      }
    }
  }
  // moss on ledges, roots running down the face
  const W = g.w, D = g.d;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) for (let y = 0; y < H - 14; y++) {
    if (g.filled(x, y, z) && !g.filled(x, y + 1, z) && hash3(x >> 1, y, z >> 1, 11) < 0.45) g.set(x, y, z, hash3(x, z, y, 3) < 0.3 ? MOSS_L : MOSS);
  }
  const rng = makeRng((axis === 'N' ? 3 : 4) * 1000 + Math.round(u0));
  const roots = Math.round((u1 - u0) * 0.45);
  for (let k = 0; k < roots; k++) {
    let i = rng.int(2, len - 3);
    const uWorld = u0 + i * V8;
    if (flat.some(([a, b]) => uWorld > a - 0.2 && uWorld < b + 0.2)) continue;
    let v = H - 1 - rng.int(0, 6);
    const end = rng.int(10, 30);
    while (v > end) {
      // find the face along depth for (i, v)
      for (let d = depth - 1; d >= 0; d--) {
        const [x, z] = axis === 'N' ? [i, d] : [d, i];
        if (g.filled(x, v, z)) {
          const [x2, z2] = axis === 'N' ? [i, d + 1] : [d + 1, i];
          g.set(x2, v, z2, jit(ROOT, i, v, 0, 5, 0.12));
          break;
        }
      }
      v--;
      if (rng.chance(0.25)) i = clamp(i + (rng.chance(0.5) ? 1 : -1), 0, len - 1);
    }
  }
  const m = vmeshG(g, { scale: V8, pivot: [0, 0, 0] });
  if (axis === 'N') m.position.set(u0, 0, base);
  else m.position.set(base, 0, u0);
  return m;
}

/** Low rocky rim with stalagmites. axis 'S' along x at z=TOWN.southRim, 'E' along z at x=TOWN.eastRim. */
export function rockRim(axis, u0, u1) {
  const depth = 36;
  const len = Math.round((u1 - u0) / V8);
  const H = 18;
  const g = new VoxelGrid(axis === 'S' ? len : depth, H, axis === 'S' ? depth : len);
  const noise = makeNoise2D(axis === 'S' ? 21 : 23);
  const rng = makeRng(axis === 'S' ? 5 : 6);
  const put = (i, v, d, c) => { if (axis === 'S') g.set(i, v, d, c); else g.set(d, v, i, c); };
  const has = (i, v, d) => (axis === 'S' ? g.filled(i, v, d) : g.filled(d, v, i));
  for (let i = 0; i < len; i++) {
    const u = u0 + (i + 0.5) * V8;
    for (let d = 0; d < depth; d++) {
      const w = d * V8; // distance out from the rim edge
      const hh = (0.55 + noise.fbm(u * 0.5, w * 0.6, 3) * 1.6) * (1 - Math.min(0.85, w * 0.22)) * 8 + (d < 3 ? -3 + d : 0);
      const h = Math.round(clamp(hh, 1, H - 2));
      const fade = Math.max(0.15, 1 - w * 0.2);
      for (let v = 0; v < h; v++) put(i, v, d, jit(shade(v === h - 1 && hash3(i >> 1, d >> 1, v, 2) < 0.22 ? MOSS : ROCK, fade * (0.9 + v * 0.02)), i >> 1, v, d >> 1, 4, 0.1));
    }
  }
  // stalagmites near the inner edge
  const count = Math.round((u1 - u0) * 0.5);
  for (let k = 0; k < count; k++) {
    const i = rng.int(2, len - 3), d = rng.int(3, 12);
    const hgt = rng.int(6, 15);
    let base = 0;
    while (base < H - 1 && has(i, base, d)) base++;
    for (let v = 0; v < hgt && base + v < H; v++) {
      const r = Math.max(0, 1.6 * (1 - v / hgt));
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (a * a + b * b <= r * r + 0.3) put(i + a, base + v, d + b, jit(shade(ROCK, 1.05), i + a, v, d + b, 6, 0.08));
    }
  }
  const m = vmeshG(g, { scale: V8, pivot: [0, 0, 0] });
  if (axis === 'S') m.position.set(u0, 0, TOWN.southRim - 0.2);
  else m.position.set(TOWN.eastRim - 0.2, 0, u0);
  return m;
}

/** Solid rock block (corners). */
export function rockBlock(x0, z0, w, d, h = 52) {
  const g = new VoxelGrid(Math.round(w / V8), h, Math.round(d / V8));
  for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) for (let y = 0; y < h; y++) {
    const fade = y / h < 0.55 ? 1 : Math.max(0.12, 1 - (y / h - 0.55) * 2);
    g.set(x, y, z, jit(shade(ROCK, fade), x >> 1, y >> 1, z >> 1, 9, 0.1));
  }
  const m = vmeshG(g, { scale: V8, pivot: [0, 0, 0] });
  m.position.set(x0, 0, z0);
  return m;
}

// ---------------------------------------------------------------- crystals & vines
const CRYSTAL_COLS = [[0xb07ae0, 0xe8c8ff, 0x6a3aa0], [0x6ac8ff, 0xd8f6ff, 0x2a7ab0], [0x7bf08a, 0xd9ffd6, 0x2f9a52], [0xff9ad0, 0xffe0f0, 0xb04a8a]];

/** A glowing crystal cluster. Returns {obj, color}. */
export function crystalCluster(seed, size = 1) {
  const rng = makeRng(seed);
  const [c, hi, lo] = CRYSTAL_COLS[seed % CRYSTAL_COLS.length];
  const g = new VoxelGrid(16, 20, 16);
  const spikes = 3 + rng.int(0, 2);
  for (let s = 0; s < spikes; s++) {
    const cx = 8 + rng.range(-3, 3), cz = 8 + rng.range(-3, 3);
    const h = Math.round((s === 0 ? 16 : rng.int(6, 12)) * size);
    const r = s === 0 ? 2.4 : rng.range(1.2, 1.9);
    const lx = rng.range(-0.25, 0.25), lz = rng.range(-0.25, 0.25);
    for (let y = 0; y < h; y++) {
      const rr = r * (1 - Math.pow(y / h, 1.5));
      const ox = cx + lx * y, oz = cz + lz * y;
      for (let x = Math.floor(ox - rr); x <= Math.ceil(ox + rr); x++) for (let z = Math.floor(oz - rr); z <= Math.ceil(oz + rr); z++) {
        if ((x + 0.5 - ox) ** 2 + (z + 0.5 - oz) ** 2 > rr * rr) continue;
        g.set(x, y, z, y > h - 3 ? 0xffffff : x + 0.5 < ox ? hi : x + 0.5 > ox + 0.6 ? lo : c);
      }
    }
  }
  const base = new VoxelGrid(16, 3, 16);
  base.ellipsoid(8, 0, 8, 5, 2.5, 5, (x, y, z) => jit(ROCK, x, y, z, 2, 0.1));
  const grp = new THREE.Group();
  grp.add(gmesh(g, { scale: V16, pivot: [8, 0, 8] }));
  grp.add(vmesh(base, { scale: V16, pivot: [8, 0, 8] }));
  return { obj: grp, color: c };
}

export function vine(seed, len = 24) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(7, len + 1, 3);
  let x = 3;
  for (let y = len; y >= 0; y--) {
    g.set(x, y, 1, jit(0x3a7a32, x, y, 0, seed, 0.12));
    if (rng.chance(0.35)) { const s = rng.chance(0.5) ? -1 : 1; g.set(x + s, y, 1, rng.chance(0.25) ? 0x8ad86a : 0x5aa84a); }
    if (rng.chance(0.08)) g.set(x, y, 2, rng.pick([0xf0e070, 0xf0a0c0, 0x9fd6ff]));
    if (rng.chance(0.18)) x = clamp(x + (rng.chance(0.5) ? -1 : 1), 1, 5);
  }
  return vmesh(g, { scale: V16, pivot: [3, len + 1, 1] });
}

// ---------------------------------------------------------------- mushroom trees
const CAPS = [[0x5ad0e0, 0xd8faff, 0x2a7a9a], [0x8a7af0, 0xe8e0ff, 0x4a3aa0], [0x6ae0a0, 0xe0ffe8, 0x2a8a5a]];

/** Giant glowing mushroom tree. Returns {obj, mats (for fading), light:{y,color}}. */
export function mushroomTree(t) {
  const [c, hi, lo] = CAPS[t.hue % CAPS.length];
  const hV = Math.round(t.h / V8), rV = t.r / V8;
  const stem = new VoxelGrid(16, hV + 2, 16);
  for (let y = 0; y < hV; y++) {
    const r = 2.6 + Math.max(0, 3 - y) * 0.6 + Math.sin(y * 0.4) * 0.3;
    const ox = 8 + Math.sin(y * 0.18) * 0.8;
    stem.cylinderY(ox, 8, r, y, y + 1, (x, yy, z) => jit((x + z) % 4 === 0 ? 0xd8ccc8 : 0xece4dc, x, yy, z, 3, 0.05));
  }
  // root flare
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7]]) for (let k = 0; k < 4; k++) stem.set(8 + dx * (3 + k), 0, 8 + dz * (3 + k), 0xd8ccc0);
  const capW = Math.ceil(rV * 2 + 4);
  const cap = new VoxelGrid(capW, 10, capW);
  const cc = capW / 2;
  cap.ellipsoid(cc, 2, cc, rV, 7, rV, (x, y, z, dx, dy) => {
    if (y < 2) return -1;
    const spot = hash3(Math.floor(x / 3), Math.floor(z / 3), y >> 1, t.hue) < 0.18;
    return spot ? hi : jit(c, x, y, z, 5, 0.08);
  });
  cap.ellipsoid(cc, 2, cc, rV - 0.5, 1.2, rV - 0.5, (x, y) => (y === 1 || y === 2 ? lo : -1));
  for (let x = 0; x < capW; x++) for (let z = 0; z < capW; z++) {
    const d = Math.hypot(x + 0.5 - cc, z + 0.5 - cc);
    if (d > rV - 1.2 && d < rV - 0.2 && hash3(x, z, 0, t.hue) < 0.3) cap.set(x, 0, z, c); // drips at the rim
  }
  const grp = new THREE.Group();
  const sm = vmesh(stem, { scale: V8, pivot: [8, 0, 8] });
  const cm = gmesh(cap, { scale: V8, pivot: [cc, 0, cc] });
  cm.position.y = (hV - 2) * V8;
  grp.add(sm, cm);
  // little mushrooms at the foot
  const small = new VoxelGrid(24, 8, 24);
  const rng = makeRng(t.hue * 13 + 5);
  for (let k = 0; k < 5; k++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(5, 10);
    const x = Math.round(12 + Math.cos(a) * d), z = Math.round(12 + Math.sin(a) * d), h = rng.int(2, 5);
    small.box(x, 0, z, 1, h, 1, 0xe8dcd0);
    small.ellipsoid(x + 0.5, h, z + 0.5, 1.8, 1.3, 1.8, (xx, y) => (y < h ? -1 : c));
  }
  const smm = gmesh(small, { scale: V16, pivot: [12, 0, 12] });
  grp.add(smm);
  grp.position.set(t.x, 0, t.z);
  // unique materials so the tree can fade when the player walks behind it
  const mats = [];
  grp.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material.clone();
    m.transparent = true;
    m.userData.shared = false;
    o.material = m;
    mats.push(m);
  });
  return { obj: grp, mats, light: { y: t.h - 0.2, color: c } };
}

// ---------------------------------------------------------------- lamp posts, benches
export function lampPost(seed = 0) {
  const g = new VoxelGrid(16, 44, 16);
  g.box(5, 0, 5, 6, 2, 6, (x, y, z) => jit(0x6a625c, x, y, z, 2, 0.12));
  g.box(6, 2, 6, 4, 2, 4, IRON);
  g.box(7, 4, 7, 2, 32, 2, (x, y) => (y % 7 === 0 ? 0x4a4a54 : IRON));
  g.box(7, 35, 7, 7, 1, 2, IRON); // arm
  g.box(12, 33, 7, 1, 2, 2, IRON);
  // lantern
  g.box(10, 24, 6, 6, 1, 4, IRON); g.box(10, 32, 6, 6, 1, 4, IRON); g.box(11, 33, 7, 4, 1, 2, IRON);
  for (const [x, z] of [[10, 6], [15, 6], [10, 9], [15, 9]]) g.box(x, 25, z, 1, 7, 1, IRON);
  if (seed % 3 === 0) { g.box(3, 20, 7, 3, 1, 2, WOOD_D); g.box(2, 16, 7, 5, 4, 1, (x, y) => (y === 19 ? 0xd9a84a : WOOD)); } // little sign
  const glass = new VoxelGrid(4, 7, 2);
  glass.box(0, 0, 0, 4, 7, 2, (x, y) => (y > 4 ? 0xffd890 : 0xffb24a));
  glass.box(1, 2, 0, 2, 3, 2, 0xfff2c0);
  const grp = new THREE.Group();
  grp.add(vmesh(g, { scale: V16, pivot: [8, 0, 8] }));
  const gm = gmesh(glass, { scale: V16, pivot: [2, 0, 1], outline: false });
  gm.position.set((13 - 8) * V16, 25 * V16, (7.5 - 8) * V16 + V16);
  grp.add(gm);
  return { obj: grp, light: { x: 5 * V16, y: 28.5 * V16, z: 0 } };
}

export function bench() {
  const g = new VoxelGrid(32, 16, 10);
  for (const x of [2, 28]) { g.box(x, 0, 2, 2, 7, 2, IRON); g.box(x, 0, 6, 2, 7, 2, IRON); g.box(x, 7, 1, 2, 9, 2, IRON); }
  g.box(0, 6, 2, 32, 1, 7, (x, y, z) => (z % 3 === 1 ? shade(WOOD, 0.75) : jit(WOOD, x >> 2, z, 0, 2, 0.08)));
  g.box(0, 7, 2, 32, 1, 7, (x, y, z) => (z % 3 === 1 ? -1 : jit(shade(WOOD, 1.08), x >> 2, z, 0, 3, 0.08)));
  g.box(0, 10, 1, 32, 2, 1, (x) => jit(WOOD, x >> 2, 0, 0, 4, 0.08));
  g.box(0, 13, 1, 32, 2, 1, (x) => jit(WOOD, x >> 2, 1, 0, 5, 0.08));
  return vmesh(g, { scale: V16, pivot: [16, 0, 5] });
}

// ---------------------------------------------------------------- fountain
export function fountain() {
  const { r } = TOWN.fountain;
  const grp = new THREE.Group();
  const R = Math.round(r / V8);
  const S = R * 2 + 2;
  const g = new VoxelGrid(S, 6, S);
  const c0 = S / 2;
  for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) {
    const d = Math.hypot(x + 0.5 - c0, z + 0.5 - c0);
    if (d > R) continue;
    const a = Math.atan2(z + 0.5 - c0, x + 0.5 - c0);
    const block = Math.floor((a + Math.PI) / (Math.PI / 8));
    if (d > R - 2) for (let y = 0; y < 4; y++) g.set(x, y, z, jit(y === 3 ? 0xa89c90 : 0x8a7e74, block, y, 0, 3, 0.08));
    else g.set(x, 0, z, 0x2a3a4a);
    if (d > R - 2 && Math.abs(((a + Math.PI) / (Math.PI / 8)) % 1) < 0.1) g.set(x, 3, z, 0x6a5e54);
  }
  grp.add(vmeshG(g, { scale: V8, pivot: [c0, 0, c0] }));
  const water = new THREE.Mesh(new THREE.PlaneGeometry((R - 2) * 2 * V8, (R - 2) * 2 * V8).rotateX(-Math.PI / 2), waterMaterial({ res: [30, 30], round: true }));
  water.position.y = 2.7 * V8;
  grp.add(water);
  // pedestal, bowl and the statue of a mole holding up a crystal
  const p = new VoxelGrid(32, 52, 32);
  const stone = (x, y, z) => jit(y % 4 === 0 ? 0x9a8e82 : 0x8a7e74, (x + z) >> 2, y >> 1, 0, 4, 0.08);
  p.cylinderY(16, 16, 4.2, 0, 12, stone);
  p.cylinderY(16, 16, 9.5, 12, 15, stone);
  carve(p, 6, 14, 6, 20, 1, 20, (x, y, z) => Math.hypot(x + 0.5 - 16, z + 0.5 - 16) < 8);
  p.cylinderY(16, 16, 3, 15, 20, stone);
  // the mole
  const marble = (x, y, z) => jit(0xb8aea4, x, y, z, 6, 0.05);
  p.ellipsoid(16, 25, 16, 4.6, 5.5, 4, marble);
  p.ellipsoid(16, 33, 16.5, 4.3, 3.8, 4, marble);
  p.box(15, 31, 20, 2, 2, 2, 0xc8beb4);
  p.box(13, 34, 20, 2, 1, 1, 0x6a625c); p.box(17, 34, 20, 2, 1, 1, 0x6a625c);
  for (let k = 0; k < 8; k++) { p.box(11 - Math.floor(k * 0.3), 27 + k, 15, 2, 1, 2, marble); p.box(19 + Math.floor(k * 0.3), 27 + k, 15, 2, 1, 2, marble); }
  p.box(9, 35, 14, 3, 3, 4, marble); p.box(20, 35, 14, 3, 3, 4, marble);
  grp.add(vmeshG(p, { scale: V16, pivot: [16, 0, 16] }));
  const cr = new VoxelGrid(12, 14, 6);
  for (let y = 0; y < 12; y++) { const rr = 3.2 * (1 - Math.pow(y / 12, 1.4)); for (let x = 0; x < 12; x++) for (let z = 0; z < 6; z++) if ((x + 0.5 - 6) ** 2 / 1 + (z + 0.5 - 3) ** 2 * 1.6 <= rr * rr) cr.set(x, y, z, x < 5 ? 0xd8f6ff : x > 6 ? 0x3a8ad0 : 0x7fd0ff); }
  const crm = gmesh(cr, { scale: V16, pivot: [6, 0, 3] });
  crm.position.set(0, 38 * V16, -0.5 * V16);
  grp.add(crm);
  const bowl = new THREE.Mesh(new THREE.PlaneGeometry(14 * V16, 14 * V16).rotateX(-Math.PI / 2), waterMaterial({ res: [14, 14], round: true }));
  bowl.position.y = 14.4 * V16;
  grp.add(bowl);
  grp.position.set(TOWN.fountain.x, 0, TOWN.fountain.z);
  return { obj: grp, crystal: { y: 42 * V16 }, bowlY: 14.5 * V16, bowlR: 9 * V16, basinY: 2.8 * V8 };
}

// ---------------------------------------------------------------- tracks, cart, ore
export function tracks() {
  const grp = new THREE.Group();
  const pts = TOWN.track;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.round(len / V16);
    const g = new VoxelGrid(16, 3, n + 4);
    for (let z = 0; z < n + 4; z += 8) g.box(1, 0, z, 14, 1, 3, (x) => jit(0x6a4a30, x >> 2, z, 0, 2, 0.12));
    for (let z = 0; z < n + 4; z++) for (const x of [3, 12]) { g.set(x, 1, z, 0x5a5a62); g.set(x, 2, z, 0x9a9aa4); }
    const m = vmesh(g, { scale: V16, pivot: [8, 0, 2] });
    m.position.set(a.x, 0, a.z);
    m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
    grp.add(m);
  }
  // buffer stop at the end
  const e = pts[pts.length - 1];
  const s = new VoxelGrid(16, 10, 6);
  s.box(1, 0, 1, 14, 2, 4, WOOD_D); s.box(1, 2, 2, 2, 6, 2, WOOD_D); s.box(13, 2, 2, 2, 6, 2, WOOD_D); s.box(0, 6, 1, 16, 3, 3, (x) => (x % 4 < 2 ? 0xc0402a : 0xe8d8b0));
  const sm = vmesh(s, { scale: V16, pivot: [8, 0, 3] });
  sm.position.set(e.x - 0.25, 0, e.z);
  sm.rotation.y = -Math.PI / 2;
  grp.add(sm);
  return grp;
}

export function oreCart() {
  const g = new VoxelGrid(16, 16, 22);
  g.box(1, 3, 1, 14, 9, 20, (x, y, z) => (y === 3 || y === 11 || z === 1 || z === 20 ? IRON : jit(0x7a5030, x >> 1, y, z >> 2, 3, 0.1)));
  for (const z of [7, 14]) g.box(0, 3, z, 16, 9, 1, IRON);
  for (const [x, z] of [[0, 4], [14, 4], [0, 15], [14, 15]]) g.box(x, 0, z, 2, 4, 4, 0x2a2a30);
  const ores = [0xd9773f, 0x2a2628, 0x9a6450, 0x8a8078, 0xc4876c, 0xf2c23a];
  for (let x = 2; x < 14; x++) for (let z = 2; z < 20; z++) {
    const h = 12 + Math.round(2.5 * Math.sin(x * 0.5) * Math.sin(z * 0.3) + hash3(x, z, 0, 3) * 2);
    for (let y = 11; y < h; y++) g.set(x, y, z, hash3(x >> 1, y, z >> 1, 9) < 0.25 ? ores[Math.floor(hash3(z, x, y, 4) * ores.length)] : jit(0x6a5e54, x, y, z, 2, 0.12));
  }
  return vmesh(g, { scale: V16, pivot: [8, 0, 11] });
}

export function orePile() {
  const g = new VoxelGrid(24, 14, 24);
  const ores = [0xd9773f, 0x2a2628, 0x9a6450, 0xbfc3c4];
  g.ellipsoid(12, 0, 12, 10, 9, 9, (x, y, z) => (hash3(x >> 1, y >> 1, z >> 1, 5) < 0.2 ? ores[Math.floor(hash3(x, y, z, 2) * 4)] : jit(0x5e5048, x >> 1, y, z >> 1, 3, 0.15)));
  for (let k = 0; k < 12; k++) g.set(6 + k, 6 + Math.floor(k * 0.5), 14, k > 8 ? 0x9aa0a8 : 0x8a5a32);
  for (let k = -3; k <= 3; k++) g.set(17 + k, 11 - Math.abs(k) * 0.4, 14, 0x9aa0a8);
  return vmesh(g, { scale: V16, pivot: [12, 0, 12] });
}

// ---------------------------------------------------------------- mound houses (seen from behind)
export function moundHouse(seed) {
  const g = new VoxelGrid(40, 26, 36);
  const rng = makeRng(seed);
  // earth in clods and moss in clumps (patches merge into big faces; per-voxel noise does not)
  g.ellipsoid(20, 0, 18, 18, 18, 16, (x, y, z) => {
    const top = y > 12 && hash3(x >> 1, z >> 1, y >> 1, seed) < 0.7;
    return top ? (hash3(z >> 1, x >> 1, y >> 1, 2) < 0.3 ? MOSS_L : MOSS) : shade(0x6a4a34, 0.9 + Math.floor(hash3(Math.floor(x / 3), Math.floor(y / 3), Math.floor(z / 3), seed) * 3) * 0.07);
  });
  // round window facing the camera (+z) and a little side window (+x)
  g.ellipsoid(20, 8, 33, 4, 4, 2, 0x4a3020);
  const glow = new VoxelGrid(40, 26, 36);
  glow.ellipsoid(20, 8, 34, 2.8, 2.8, 1.2, (x, y) => (y > 8 ? 0xffd890 : 0xffb24a));
  glow.set(20, 8, 35, 0x6a4a2a); glow.set(20, 9, 35, 0x6a4a2a); glow.set(19, 8, 35, 0x6a4a2a);
  // chimney
  g.box(28, 14, 12, 5, 12, 5, (x, y, z) => jit(0x8a7e74, x, y >> 1, z, 3, 0.12));
  g.box(27, 25, 11, 7, 1, 7, 0x6a625c);
  void rng;
  const grp = new THREE.Group();
  grp.add(vmeshG(g, { scale: V16 * 1.2, pivot: [20, 0, 18] }), gmesh(glow, { scale: V16 * 1.2, pivot: [20, 0, 18], outline: false }));
  return { obj: grp, chimney: { x: (30.5 - 20) * V16 * 1.2, y: 26 * V16 * 1.2, z: (14.5 - 18) * V16 * 1.2 }, window: { x: 0, y: 8 * V16 * 1.2, z: (35 - 18) * V16 * 1.2 } };
}

// ---------------------------------------------------------------- small props
export function barrel(seed = 0, col = WOOD) {
  const g = new VoxelGrid(12, 13, 12);
  for (let y = 0; y < 12; y++) {
    const r = 4.2 + Math.sin((y / 11) * Math.PI) * 1;
    g.cylinderY(6, 6, r, y, y + 1, (x, yy, z) => (y === 2 || y === 9 ? IRON : jit(col, Math.floor(Math.atan2(z - 5.5, x - 5.5) * 2), yy >> 2, seed, 3, 0.1)));
  }
  g.cylinderY(6, 6, 4, 12, 13, shade(col, 1.15));
  return vmesh(g, { scale: V16, pivot: [6, 0, 6] });
}

export function crate(seed = 0) {
  const g = new VoxelGrid(12, 11, 12);
  g.box(0, 0, 0, 12, 11, 12, (x, y, z) => (y % 4 === 3 ? shade(0xb07a4a, 0.8) : jit(0xb07a4a, x >> 2, y >> 2, (z >> 2) + seed, 3, 0.08)));
  for (const [x, z] of [[0, 0], [10, 0], [0, 10], [10, 10]]) g.box(x, 0, z, 2, 11, 2, WOOD);
  return vmesh(g, { scale: V16, pivot: [6, 0, 6] });
}

export function sack(col = 0xc8b08a) {
  const g = new VoxelGrid(10, 11, 10);
  g.ellipsoid(5, 4, 5, 4.2, 4.5, 3.8, (x, y, z) => jit(col, x, y, z, 2, 0.06));
  g.box(4, 8, 4, 2, 2, 2, shade(col, 0.85));
  g.box(3, 10, 4, 4, 1, 2, col);
  return vmesh(g, { scale: V16, pivot: [5, 0, 5] });
}

export function glowShrooms(seed, colorIdx = 0) {
  const [c, hi] = CAPS[colorIdx % CAPS.length];
  const g = new VoxelGrid(16, 8, 16);
  const rng = makeRng(seed);
  for (let k = 0; k < 4; k++) {
    const x = rng.int(3, 12), z = rng.int(3, 12), h = rng.int(2, 5);
    g.box(x, 0, z, 1, h, 1, 0xe8dcd0);
    g.ellipsoid(x + 0.5, h, z + 0.5, 1.6 + h * 0.15, 1.4, 1.6 + h * 0.15, (xx, y, zz) => (y < h ? -1 : (xx + zz) % 3 === 0 ? hi : c));
  }
  return { obj: gmesh(g, { scale: V16, pivot: [8, 0, 8] }), color: c };
}

export function stalagmite(seed, h = 14) {
  const g = new VoxelGrid(10, h, 10);
  for (let y = 0; y < h; y++) {
    const r = 3.6 * (1 - y / h) + 0.4;
    g.cylinderY(5 + Math.sin(y * 0.4 + seed) * 0.5, 5, r, y, y + 1, (x, yy, z) => jit(ROCK, x, yy, z, seed, 0.1));
  }
  return vmesh(g, { scale: V16, pivot: [5, 0, 5] });
}

export function rockLump(seed, s = 1) {
  const g = new VoxelGrid(16, 10, 16);
  g.ellipsoid(8, 0, 8, 6 * s, 6 * s, 5 * s, (x, y, z) => (y > 4 && hash3(x, z, y, seed) < 0.5 ? MOSS : jit(ROCK, x >> 1, y, z >> 1, seed, 0.12)));
  return vmesh(g, { scale: V16, pivot: [8, 0, 8] });
}

/** A few grass tufts and a single flower for the sunbeam patch. */
export function sunPatch() {
  const g = new VoxelGrid(40, 10, 34);
  const rng = makeRng(321);
  for (let k = 0; k < 34; k++) {
    const x = rng.int(4, 35), z = rng.int(4, 29);
    if (Math.hypot((x - 20) / 18, (z - 17) / 15) > 1) continue;
    const h = rng.int(1, 4);
    for (let y = 0; y < h; y++) g.set(x + (y === h - 1 && rng.chance(0.5) ? 1 : 0), y, z, y === h - 1 ? 0x8ad86a : 0x5aa83a);
  }
  // the flower
  for (let y = 0; y < 7; y++) g.set(21, y, 18, 0x4a9a3a);
  g.set(22, 3, 18, 0x6ac04a); g.set(20, 2, 18, 0x6ac04a);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(21 + dx, 7, 18 + dz, 0xfff070);
  g.set(21, 7, 18, 0xe0902a); g.set(21, 8, 18, 0xfff070);
  const m = vmesh(g, { scale: V16, pivot: [20, 0, 17] });
  m.position.set(TOWN.sun.x, 0, TOWN.sun.z);
  return m;
}

/** String lights sagging between two points: a dark wire and glowing bulbs. */
export function garland(a, b, seed = 0) {
  const grp = new THREE.Group();
  const n = Math.max(6, Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 2.2));
  const sag = 0.35 + Math.hypot(b.x - a.x, b.z - a.z) * 0.06;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t));
  }
  const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a1a12 }));
  grp.add(wire);
  const cols = [0xffd060, 0xff7a5a, 0x8ae07a, 0x7ac8ff, 0xffa0d0];
  const bulb = new VoxelGrid(2, 3, 2);
  for (let i = 1; i < n; i++) {
    const g = new VoxelGrid(2, 3, 2);
    const c = cols[(i + seed) % cols.length];
    g.box(0, 0, 0, 2, 2, 2, c);
    g.set(0, 2, 0, 0x3a3a3a);
    const m = gmesh(g, { scale: V16, pivot: [1, 3, 1], outline: false });
    m.position.copy(pts[i]);
    grp.add(m);
  }
  void bulb;
  return { obj: grp, points: pts };
}

/** A cork notice board on posts, with pinned scraps of town life. */
export function noticeBoard() {
  const grp = new THREE.Group();
  const g = new VoxelGrid(26, 30, 6);
  g.box(1, 0, 2, 2, 30, 2, WOOD_D); g.box(23, 0, 2, 2, 30, 2, WOOD_D);
  g.box(0, 12, 1, 26, 17, 2, (x, y) => (x === 0 || x === 25 || y === 12 || y === 28 ? WOOD : jit(0xb08050, x, y, 0, 5, 0.12)));
  for (let x = 0; x < 26; x++) g.set(x, 29, 1, 0x6a4a2a);
  grp.add(vmesh(g, { scale: V16, pivot: [13, 0, 3] }));
  const pc = new PixelCanvas(24, 15);
  const notes = [[1, 1, 7, 6, 0xf6eccc], [9, 2, 6, 7, 0xf0d0d8], [16, 1, 7, 5, 0xd8ecf8], [3, 8, 8, 6, 0xf6f0a0], [13, 9, 9, 5, 0xe8f0d8]];
  for (const [x, y, w, h, c] of notes) {
    pc.rect(x, y, w, h, c);
    pc.set(x + Math.floor(w / 2), y, 0xc0402a);
    for (let k = 2; k < h - 1; k += 2) pc.rect(x + 1, y + k, w - 2 - (k % 3), 1, 0x8a7a6a);
  }
  const tex = pixelTexture(pc.commit());
  const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.94), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5 }));
  p.position.set(0, 20.5 / 16, 3.2 / 16);
  grp.add(p);
  return grp;
}

export { CAPS, CRYSTAL_COLS, mixHex, ramp };
