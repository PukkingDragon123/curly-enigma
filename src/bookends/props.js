// Small voxel props shared by the title and ending dioramas. Built at 1/32-unit voxels (twice
// the character grid of old) so they hold fine detail up close; sizes in the public options
// (w/h/d, len, r, post, spread) are still given in 1/16 units so callers keep their layouts.
// Glowing parts use the unlit 'basic' material so they stay bright in the dark.
import * as THREE from 'three';
import { VoxelGrid, voxMesh, hash3 } from './vox.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { makeRng, shade, mixHex } from '../core/util.js';

const S16 = 1 / 16;
const S32 = 1 / 32;

function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}

/** Structured jitter: one tone per `size`³ patch, so flat areas read as material and still mesh greedily. */
export function pj(c, x, y, z, seed = 1, amt = 0.06, size = 2) {
  const h = hash3(Math.floor(x / size), Math.floor(y / size), Math.floor(z / size), seed);
  return shade(c, 1 + (h - 0.5) * 2 * amt);
}

/** Pick from a palette by structured patches. */
export function pp(pal, x, y, z, seed = 1, size = 2) {
  return pal[(hash3(Math.floor(x / size), Math.floor(y / size), Math.floor(z / size), seed) * pal.length) | 0];
}

/**
 * Rasterise a cylinder from a to b (voxel coords) of radius r. colorFn(t, ang, d, x, y, z) → colour | -1,
 * where t is 0..1 along the axis, ang the angle around it and d the distance from the axis.
 */
export function cyl(g, a, b, r, colorFn, r1 = r) {
  const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
  const len2 = ax * ax + ay * ay + az * az;
  const len = Math.sqrt(len2) || 1;
  const ux = ax / len, uy = ay / len, uz = az / len;
  // perpendicular basis for the angle
  let px = -uz, py = 0, pz = ux;
  if (Math.abs(ux) < 1e-3 && Math.abs(uz) < 1e-3) { px = 1; py = 0; pz = 0; }
  const pl = Math.hypot(px, py, pz);
  px /= pl; py /= pl; pz /= pl;
  const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
  const R = Math.max(r, r1) + 1;
  const x0 = Math.floor(Math.min(a[0], b[0]) - R), x1 = Math.ceil(Math.max(a[0], b[0]) + R);
  const y0 = Math.floor(Math.min(a[1], b[1]) - R), y1 = Math.ceil(Math.max(a[1], b[1]) + R);
  const z0 = Math.floor(Math.min(a[2], b[2]) - R), z1 = Math.ceil(Math.max(a[2], b[2]) + R);
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const vx = x + 0.5 - a[0], vy = y + 0.5 - a[1], vz = z + 0.5 - a[2];
    const t = (vx * ux + vy * uy + vz * uz) / len;
    if (t < 0 || t > 1) continue;
    const ox = vx - ux * t * len, oy = vy - uy * t * len, oz = vz - uz * t * len;
    const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
    const rr = r + (r1 - r) * t;
    if (d > rr) continue;
    const ang = Math.atan2(ox * qx + oy * qy + oz * qz, ox * px + oy * py + oz * pz);
    const c = colorFn(t, ang, d / Math.max(0.01, rr), x, y, z);
    if (c !== undefined && c !== -1) g.set(x, y, z, c);
  }
}

/**
 * A rectangular beam between two voxel points a and b: half-size hw (sideways, kept horizontal) × hh (up).
 * colorFn(t, s, v, x, y, z, along) where s and v run -1..1 across the section.
 */
export function bar(g, a, b, hw, hh, colorFn) {
  const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2];
  const len = Math.hypot(ax, ay, az) || 1;
  const ux = ax / len, uy = ay / len, uz = az / len;
  let sx = -uz, sz = ux;
  const sy = 0;
  const sl = Math.hypot(sx, sz);
  if (sl < 1e-3) { sx = 1; sz = 0; } else { sx /= sl; sz /= sl; }
  const vx = uy * sz - uz * sy, vy = uz * sx - ux * sz, vz = ux * sy - uy * sx;
  const R = Math.max(hw, hh) + 1;
  for (let z = Math.floor(Math.min(a[2], b[2]) - R); z <= Math.ceil(Math.max(a[2], b[2]) + R); z++)
    for (let y = Math.floor(Math.min(a[1], b[1]) - R); y <= Math.ceil(Math.max(a[1], b[1]) + R); y++)
      for (let x = Math.floor(Math.min(a[0], b[0]) - R); x <= Math.ceil(Math.max(a[0], b[0]) + R); x++) {
        const px = x + 0.5 - a[0], py = y + 0.5 - a[1], pz = z + 0.5 - a[2];
        const t = px * ux + py * uy + pz * uz;
        if (t < 0 || t > len) continue;
        const s = px * sx + py * sy + pz * sz, v = px * vx + py * vy + pz * vz;
        if (Math.abs(s) > hw || Math.abs(v) > hh) continue;
        const c = colorFn(t / len, s / hw, v / hh, x, y, z, t);
        if (c !== undefined && c !== -1) g.set(x, y, z, c);
      }
}

// ------------------------------------------------------------------ campfire
const ASH = [0x5a5250, 0x4e4846, 0x625a56];
const CAMP_STONES = [0x8a8278, 0x7a7068, 0x948a80, 0x6e6660, 0x847a6e];

/**
 * Stone ring + charred log teepee + ash bed + glowing coals. Origin at ground centre, ~1.6 units across.
 * Returns a group; group.userData.coals is the unlit coal mesh (its material can be tinted to flicker).
 */
export function makeCampfire(seed = 5) {
  const rng = makeRng(seed);
  const N = 54, c = N / 2;
  const g = new VoxelGrid(N, 26, N);
  const k = new VoxelGrid(N, 26, N); // glowing bits
  // ash bed: grey, darker charcoal toward the middle, a few pale flecks
  g.ellipsoid(c, 0.4, c, 16, 2.2, 16, (x, y, z) => {
    const d = Math.hypot(x + 0.5 - c, z + 0.5 - c) / 16;
    if (hash3(x, y, z, 3) < 0.05) return 0x9a9490;
    if (d < 0.45) return pp([0x2a2422, 0x342c28, 0x241e1c], x, y, z, 4);
    return pp(ASH, x, y, z, 5);
  });
  // stone ring: 11 rounded stones, soot-blackened on the side facing the fire
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.12, 0.12);
    const r = 19 + rng.range(-0.8, 0.8);
    const sx = c + Math.cos(a) * r, sz = c + Math.sin(a) * r;
    const base = rng.pick(CAMP_STONES);
    const rx = rng.range(3.8, 5.0), ry = rng.range(3.2, 4.4), rz = rng.range(3.6, 4.8);
    const crack = rng.range(0, Math.PI * 2);
    g.ellipsoid(sx, 2.2, sz, rx, ry, rz, (x, y, z, dx, dy, dz) => {
      const toC = -(dx * Math.cos(a) + dz * Math.sin(a)); // >0 on the fire side
      let col = pj(base, x, y, z, i + 7, 0.05);
      if (dy > 0.55) col = shade(col, 1.14);
      else if (dy < -0.2) col = shade(col, 0.82);
      if (toC > 0.35) col = mixHex(col, 0x241c1a, Math.min(0.8, (toC - 0.35) * 1.6));
      if (Math.abs(Math.sin(Math.atan2(dz, dx) * 2 + crack)) < 0.08 && dy > -0.3) col = shade(col, 0.62);
      if (toC < -0.4 && dy > 0.35 && hash3(x, y, z, 9) < 0.35) col = pp([0x5a7a34, 0x4a6a2e], x, y, z, 11, 1);
      return col;
    });
  }
  // logs: a teepee of three and one lying across; charred and glowing toward the middle
  const logs = [
    [[9, 2.5, 18], [c + 1, 13, c - 1], 2.6],
    [[44, 2.5, 20], [c + 0.5, 13.5, c + 0.5], 2.5],
    [[24, 2.5, 45], [c - 0.5, 12.5, c + 1], 2.4],
    [[12, 3, 36], [42, 3.5, 30], 2.5],
  ];
  logs.forEach(([a, b, r], li) => {
    const furrow = rng.range(0, 6);
    cyl(g, a, b, r, (t, ang, d, x, y, z) => {
      const mid = Math.hypot(x + 0.5 - c, z + 0.5 - c);
      const burnt = mid < 9 + Math.sin(ang * 3 + li) * 1.5;
      if (t < 0.03 || t > 0.97) return d < 0.45 ? 0xc8986a : d < 0.8 ? (Math.round(d * 6) % 2 ? 0xd8b080 : 0xb8885a) : 0x4a2e1a; // end grain
      if (burnt) {
        if (d > 0.7 && hash3(x, y, z, 21 + li) < 0.22) { k.set(x, y, z, rng.pick([0xff8a2a, 0xffb040, 0xe0501a])); return -1; }
        return pp([0x1e1614, 0x2a201c, 0x161010], x, y, z, 23 + li, 1);
      }
      const fur = Math.sin(ang * 7 + furrow + t * 3) > 0.55;
      return fur ? 0x3a2414 : pj(t * 40 % 7 < 1 ? 0x5a3a20 : 0x6a4426, x, y, z, 25 + li, 0.06, 2);
    });
  });
  const mesh = voxMesh(g, { pivot: [c, 0, c], scale: S32 });
  // glowing coal heap in the middle
  k.ellipsoid(c, 1.2, c, 7, 3, 7, (x, y, z, dx, dy, dz) => {
    const h = hash3(x, y, z, 31);
    if (dy > 0.2 && h < 0.35) return -1;
    const r = Math.sqrt(dx * dx + dz * dz);
    if (h < 0.18) return 0x3a1a10;
    return r < 0.5 ? (h < 0.6 ? 0xffe080 : 0xffb040) : h < 0.6 ? 0xff7a1a : 0xd9401a;
  });
  for (let i = 0; i < 40; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(0, 9);
    k.set(c + Math.cos(a) * r, rng.int(1, 3), c + Math.sin(a) * r, rng.pick([0xffb040, 0xff7a1a, 0xffe080, 0xd9401a, 0x8a2a10]));
  }
  const coals = voxMesh(k, { pivot: [c, 0, c], scale: S32, kind: 'basic', outline: false, material: voxelMaterial('basic', { unique: true }) });
  coals.userData.dynamic = true;
  const grp = group(mesh, coals);
  grp.userData.coals = coals;
  return grp;
}

// ------------------------------------------------------------------ rocks & logs
const ROCK_TONES = (c) => [c, shade(c, 0.92), shade(c, 1.07), mixHex(c, 0x6a5a48, 0.25)];

/** A mossy boulder. w/h/d in 1/16 units (built at 1/32). */
export function makeRock(seed = 1, { w = 14, h = 10, d = 12, color = 0x7a7068, moss = 0 } = {}) {
  const rng = makeRng(seed);
  w *= 2; h *= 2; d *= 2;
  const g = new VoxelGrid(w + 8, h + 6, d + 8);
  const cx = (w + 8) / 2, cz = (d + 8) / 2;
  const pal = ROCK_TONES(color);
  const blobs = 3 + rng.int(0, 2);
  const crackA = rng.range(0, 6);
  for (let i = 0; i < blobs; i++) {
    const rx = rng.range(w * 0.3, w * 0.5), ry = rng.range(h * 0.45, h * 0.75), rz = rng.range(d * 0.3, d * 0.5);
    g.ellipsoid(cx + rng.range(-w * 0.18, w * 0.18), ry * 0.55, cz + rng.range(-d * 0.15, d * 0.15), rx, ry, rz, (x, y, z, dx, dy) => {
      let col = pp(pal, x, y, z, seed, 3);
      if (dy > 0.6) col = shade(col, 1.1);
      if (Math.abs(Math.sin((x * 0.21 + z * 0.17) + crackA) * 3 + Math.sin(y * 0.4)) < 0.12) col = shade(col, 0.66);
      if (hash3(x, y, z, seed + 3) < 0.04) col = mixHex(col, 0xc8c090, 0.4); // lichen
      if (moss && y > h * 0.5 && hash3(x >> 1, y >> 1, z >> 1, seed + 1) < moss * (0.6 + dy * 0.6)) col = pp([0x5a7a3a, 0x4e6e34, 0x668a40], x, y, z, seed + 2, 1);
      return col;
    });
  }
  g.paint((x, y) => (y < 2 ? -1 : undefined));
  return voxMesh(g, { pivot: [cx, 2, cz], scale: S32 });
}

/** A short log lying along x (seat). length/radius in 1/16 units. */
export function makeLog(len = 22, r = 3.2) {
  const L = len * 2, R = r * 2;
  const g = new VoxelGrid(L + 4, Math.ceil(R * 2) + 6, Math.ceil(R * 2) + 4);
  const cy = R + 0.5, cz = R + 2;
  cyl(g, [2, cy, cz], [L + 2, cy, cz], R, (t, ang, d, x, y, z) => {
    const end = t < 0.02 || t > 0.98;
    if (end) {
      if (d < 0.12) return 0x8a6040;
      if (d > 0.86) return 0x4a2e1a;
      return Math.round(d * 9) % 2 ? 0xd8b080 : 0xc09060;
    }
    const fur = Math.sin(ang * 9 + Math.sin(t * 7) * 0.8) > 0.5;
    let c = fur ? 0x3e2616 : pj(0x6e4628, x, y, z, 7, 0.07, 2);
    if (Math.sin(t * 31) > 0.95 && !fur) c = 0x5a3a20;
    if (ang > 1.2 && ang < 1.95 && hash3(x, y >> 1, z, 9) < 0.55) c = pp([0x6a8a3a, 0x5a7a34, 0x7a9a44], x, y, z, 10, 1); // moss on top
    return c;
  });
  // knot + a tiny shelf fungus
  g.ellipsoid(L * 0.62 + 2, cy, cz + R - 0.5, 1.6, 1.6, 1.2, 0x3a2414);
  g.ellipsoid(L * 0.3 + 2, cy + 1, cz + R + 0.8, 2.4, 0.9, 1.6, (x, y) => (y > cy + 1 ? 0xe8c890 : 0xb8945a));
  return voxMesh(g, { pivot: [(L + 4) / 2, 0, cz], scale: S32 });
}

// ------------------------------------------------------------------ mushrooms
/**
 * A cluster of glowing mushrooms. Returns {group, glows:[{pos:Vector3, size}]} where glow
 * positions are local to the group (for halo billboards). spread in 1/16 units.
 */
export function makeMushrooms(seed = 1, { n = 4, spread = 7, cap = [0x4ac8ff, 0x8ae8ff, 0x2a8ad0], stem = 0xd8dce4, scale = 1, glow = true } = {}) {
  const rng = makeRng(seed);
  const sp = spread * 2;
  const W = sp * 2 + 24;
  const stems = new VoxelGrid(W, 44, W);
  const caps = new VoxelGrid(W, 44, W);
  const c = W / 2;
  const glows = [];
  const spot = mixHex(cap[1], 0xffffff, 0.6);
  for (let i = 0; i < n; i++) {
    const big = i === 0;
    const hgt = big ? rng.int(18, 24) : rng.int(8, 16);
    const r = big ? rng.range(8, 10) : rng.range(4.4, 6.8);
    const x = c + (big ? 0 : rng.range(-sp, sp)), z = c + (big ? 0 : rng.range(-sp * 0.7, sp * 0.7));
    const lean = big ? 0 : rng.range(-0.12, 0.12);
    const sr = big ? 2.6 : 1.6;
    for (let y = 0; y < hgt; y++) {
      const ox = lean * y;
      stems.cylinderY(x + ox, z, sr + (y < 3 ? 0.8 : 0), y, y + 1, (xx, yy, zz) => {
        let col = pj(yy < 4 ? shade(stem, 0.8) : stem, xx, yy, zz, seed, 0.04, 2);
        if ((yy + Math.round(Math.atan2(zz - z, xx - x - ox) * 3)) % 5 === 0) col = shade(col, 0.9); // fibres
        return col;
      });
    }
    // skirt ring under the cap of the big one
    if (big) stems.cylinderY(x, z, sr + 1.6, hgt - 6, hgt - 5, shade(stem, 0.92));
    const capX = x + lean * hgt;
    caps.ellipsoid(capX, hgt, z, r, r * 0.6, r, (xx, yy, zz, dx, dy, dz) => {
      if (dy < -0.18) return -1;
      if (dy < 0.08) return Math.round(Math.atan2(dz, dx) * 6) % 2 ? shade(cap[2], 0.8) : cap[2]; // gills
      let col = dy > 0.55 ? cap[1] : cap[0];
      // spots in a soft ring pattern
      const hs = hash3(xx >> 1, yy >> 1, zz >> 1, seed + i * 3);
      if (hs < 0.13 && dy > 0.25) col = spot;
      return col;
    });
    glows.push({ pos: new THREE.Vector3((capX - c) * S32 * scale, (hgt + 2) * S32 * scale, (z - c) * S32 * scale), size: r * 0.21 * scale });
  }
  const sm = voxMesh(stems, { pivot: [c, 0, c], scale: S32 * scale });
  const cm = voxMesh(caps, { pivot: [c, 0, c], scale: S32 * scale, kind: glow ? 'basic' : 'toon' });
  return { group: group(sm, cm), glows };
}

/** A tiny sprout with a yellow flower (grows in the sunbeam). */
export function makeFlower() {
  const g = new VoxelGrid(20, 26, 20);
  cyl(g, [10, 0, 10], [9.5, 16, 10.5], 0.8, () => 0x4a9a34);
  // leaves
  for (const [s, y] of [[-1, 5], [1, 9], [-1, 12]]) {
    for (let i = 0; i < 6; i++) {
      const lx = 10 + s * (i + 1), ly = y + Math.round(i * 0.5 - (i > 3 ? (i - 3) * 0.8 : 0));
      g.set(lx, ly, 10, i > 3 ? 0x8ad060 : 0x6ac04a);
      if (i > 0 && i < 5) g.set(lx, ly + 1, 10, 0x5aa83a);
    }
  }
  // flower: five petals, orange heart
  for (let a = 0; a < 5; a++) {
    const t = (a / 5) * Math.PI * 2;
    g.ellipsoid(10 + Math.cos(t) * 2.6, 17.5, 10 + Math.sin(t) * 2.6, 1.9, 0.9, 1.9, a % 2 ? 0xffe066 : 0xfff08a);
  }
  g.ellipsoid(10, 18.2, 10, 1.5, 1, 1.5, 0xe08a1a);
  g.set(10, 19, 10, 0xfff2a0);
  return voxMesh(g, { pivot: [10, 0, 10], scale: S32 });
}

// ------------------------------------------------------------------ tools
/** A pickaxe; origin at the bottom of the handle, handle along +y. */
export function makePickaxe() {
  const g = new VoxelGrid(34, 48, 6);
  // handle: two voxels thick, grain streaks, leather wrap near the bottom
  for (let y = 0; y < 41; y++) for (let x = 16; x < 18; x++) for (let z = 2; z < 4; z++) {
    let c = (y * 3 + x + z) % 7 === 0 ? 0x7a5230 : y < 3 ? 0x5a3a22 : 0x9a6a3a;
    if (y >= 5 && y < 13) c = (y % 2) ? 0x5a2a1a : 0x7a3a24;
    if (x === 16 && y > 13) c = shade(c, 0.9);
    g.set(x, y, z, c);
  }
  // steel head: a curved bar with a bright edge on top and a darker underside
  for (let i = 0; i <= 30; i++) {
    const u = i / 30 - 0.5;
    const x = 2 + i;
    const y = 40 - Math.round(u * u * 26);
    for (let z = 1; z < 5; z++) {
      g.set(x, y, z, z === 1 || z === 4 ? 0x8a929a : 0xa8b0b8);
      g.set(x, y + 1, z, z === 1 || z === 4 ? 0xb8c0c8 : 0xd8e0e8);
      g.set(x, y - 1, z, 0x6a7078);
    }
  }
  // sharpened tips
  g.set(1, 34, 2, 0xe8f0f8); g.set(1, 34, 3, 0xe8f0f8); g.set(33, 34, 2, 0xe8f0f8); g.set(33, 34, 3, 0xe8f0f8);
  // eye + wedge
  g.box(14, 37, 1, 6, 6, 4, (x, y) => (y === 42 ? 0x7a828a : 0x4a5058));
  g.box(16, 43, 2, 2, 1, 2, 0x8a5a2a);
  return voxMesh(g, { pivot: [17, 0, 3], scale: S32 });
}

/** A hanging root strand from the ceiling. Origin at the top, hangs down along -y. len in 1/16 units. */
export function makeRoot(seed = 1, len = 40) {
  const rng = makeRng(seed);
  const L = len * 2;
  const W = 28;
  const g = new VoxelGrid(W, L + 4, W);
  let x = W / 2, z = W / 2;
  let dx = rng.range(-0.25, 0.25), dz = rng.range(-0.2, 0.2);
  const col = rng.pick([0xa8845a, 0x9a7650, 0xb89466]);
  const dark = shade(col, 0.78), lite = shade(col, 1.15);
  for (let i = 0; i < L; i++) {
    const y = L - i;
    dx += rng.range(-0.06, 0.06); dz += rng.range(-0.05, 0.05);
    dx = Math.max(-0.3, Math.min(0.3, dx)); dz = Math.max(-0.26, Math.min(0.26, dz));
    x = Math.max(4, Math.min(W - 5, x + dx)); z = Math.max(4, Math.min(W - 5, z + dz));
    const r = i < L * 0.25 ? 2.2 : i < L * 0.6 ? 1.5 : i < L * 0.85 ? 1.0 : 0.6;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      if (a * a + b * b > r * r + 0.3) continue;
      const c = a < 0 ? lite : b > 0 ? dark : (i % 6 === 0 ? dark : col);
      g.set(x + a, y, z + b, c);
    }
    if (rng.chance(0.06) && i > 6 && i < L - 8) {
      // a rootlet curling off
      const sx = rng.chance(0.5) ? 1 : -1, sz = rng.chance(0.5) ? 0.5 : -0.5;
      const n = rng.int(3, 7);
      for (let k = 1; k <= n; k++) g.set(x + sx * (k + 1), y - k * 0.8, z + sz * k, k === n ? lite : shade(col, 0.92));
    }
  }
  // hairy tip
  for (let k = 0; k < 4; k++) g.set(x + rng.int(-1, 1), 1 + k, z + rng.int(-1, 1), lite);
  return voxMesh(g, { pivot: [W / 2, L + 2, W / 2], scale: S32 });
}

// ------------------------------------------------------------------ sunglasses
/**
 * Black voxel sunglasses for a chibi head `headW` world units wide (lenses facing +z).
 * Origin between the lenses at the lens centre height.
 */
export function makeSunglasses(headW = 0.75) {
  const g = new VoxelGrid(28, 8, 18);
  const lens = 0x141018, frame = 0x2a2230, shine = 0xf4f0ff, tint = 0x3a2a5a, tint2 = 0x5a3a7a;
  const z = 16;
  for (const x0 of [2, 16]) {
    g.box(x0, 0, z, 10, 6, 2, lens);
    for (const [x, y] of [[0, 0], [1, 0], [0, 1], [9, 0], [8, 0], [9, 1]]) g.clear(x0 + x, y, z), g.clear(x0 + x, y, z + 1);
    g.box(x0 - 1, 6, z, 12, 2, 2, frame);
    // gradient tint + glints
    for (let x = 1; x < 9; x++) { g.set(x0 + x, 1, z + 1, tint2); g.set(x0 + x, 2, z + 1, tint); }
    g.set(x0 + 2, 4, z + 1, shine); g.set(x0 + 3, 4, z + 1, shine); g.set(x0 + 2, 3, z + 1, shine); g.set(x0 + 6, 4, z + 1, 0xb8b0d8);
  }
  g.box(12, 4, z, 4, 3, 2, frame); // bridge
  for (let k = 1; k < 17; k++) { g.set(0, 6, z - k + 1, frame); g.set(27, 6, z - k + 1, frame); g.set(0, 7, z - k + 1, frame); g.set(27, 7, z - k + 1, frame); }
  const s = headW / 26;
  return voxMesh(g, { pivot: [14, 4, 17], scale: s });
}

// ------------------------------------------------------------------ coconut drink
/** Coconut with a straw and a tiny umbrella; origin at its bottom. */
export function makeCoconut() {
  const g = new VoxelGrid(24, 32, 24);
  g.ellipsoid(12, 6.8, 12, 7.2, 6.8, 7.2, (x, y, z, dx, dy) => {
    if (dy > 0.55) return -1;
    if (dy > 0.38) return dy > 0.48 ? 0xfff8ea : 0xf6efe0;
    const fib = (x * 3 + y * 5 + z) % 4 === 0;
    return fib ? 0x4a2a14 : pp([0x6a3a1c, 0x7a4a24, 0x5e341a], x, y, z, 2, 1);
  });
  g.ellipsoid(12, 10.6, 12, 4.4, 1, 4.4, (x, y, z) => (hash3(x, y, z, 4) < 0.15 ? 0xfff0c0 : 0xf0d8a0)); // the drink
  // straw (striped) and a lemon slice
  cyl(g, [12, 10, 12], [17, 23, 14], 0.9, (t) => (Math.floor(t * 9) % 2 ? 0xf03a4a : 0xffffff));
  g.ellipsoid(5.5, 11, 12, 1.2, 2.6, 2.6, (x, y, z, dx, dy, dz) => (Math.hypot(dy, dz) > 0.7 ? 0xf0c020 : 0xfff090));
  // umbrella
  cyl(g, [8, 10, 10], [6, 22, 10], 0.6, () => 0xd8b080);
  for (let x = -5; x <= 5; x++) for (let z = -5; z <= 5; z++) {
    const d = Math.hypot(x, z);
    if (d > 5.2) continue;
    const seg = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8);
    g.set(6 + x, 23 - Math.round(d * 0.45), 10 + z, seg % 2 ? 0xff7ab0 : 0xfff0a0);
  }
  return voxMesh(g, { pivot: [12, 0, 12], scale: S32 });
}

// ------------------------------------------------------------------ lantern
/** A hanging/standing lantern; glass is unlit-bright. post in 1/16 units. Returns {group, glowPos}. */
export function makeLantern({ post = 0, color = 0xffd060, frame = 0x3a2a22 } = {}) {
  const P = post * 2;
  const H = P + 28;
  const f = new VoxelGrid(18, H + 4, 18);
  const gl = new VoxelGrid(18, H + 4, 18);
  const fhi = shade(frame, 1.5), flo = shade(frame, 0.75);
  if (P) {
    for (let y = 0; y < P; y++) f.box(7, y, 7, 4, 1, 4, (x, yy, z) => ((yy + x) % 5 === 0 ? 0x4a2e1a : x === 7 ? 0x6a4428 : 0x5a3a22));
    f.box(5, 0, 5, 8, 2, 8, 0x4a3020);
    f.box(6, 2, 6, 6, 1, 6, 0x5a3a26);
    f.box(6, P - 2, 6, 6, 2, 6, flo);
  }
  const b = P;
  f.box(3, b, 3, 12, 2, 12, frame);
  f.box(2, b + 1, 2, 14, 1, 14, flo);
  f.box(3, b + 15, 3, 12, 1, 12, frame);
  f.box(4, b + 16, 4, 10, 2, 10, fhi);
  f.box(6, b + 18, 6, 6, 2, 6, frame);
  f.box(8, b + 20, 8, 2, 3, 2, frame);
  if (!P) { f.box(7, b + 23, 8, 4, 1, 2, flo); f.set(7, b + 24, 8, flo); f.set(10, b + 24, 8, flo); }
  for (const [x, z] of [[3, 3], [13, 3], [3, 13], [13, 13]]) f.box(x, b + 2, z, 2, 13, 2, (xx, y) => (y % 4 === 0 ? fhi : frame));
  // thin bars across the panes
  for (const z of [3, 14]) for (let x = 5; x < 13; x += 4) f.box(x, b + 2, z, 1, 13, 1, flo);
  for (const x of [3, 14]) for (let z = 5; z < 13; z += 4) f.box(x, b + 2, z, 1, 13, 1, flo);
  // glass + the little flame inside
  gl.box(4, b + 2, 4, 10, 13, 10, (x, y, z) => {
    const inner = x > 4 && x < 13 && z > 4 && z < 13;
    if (inner) return -1;
    return mixHex(color, 0xffffff, Math.min(0.5, (y - b) / 30));
  });
  gl.ellipsoid(9, b + 7, 9, 1.8, 3.2, 1.8, (x, y) => (y > b + 8 ? 0xfff0b0 : 0xffffff));
  const fm = voxMesh(f, { pivot: [9, 0, 9], scale: S32 });
  const gm = voxMesh(gl, { pivot: [9, 0, 9], scale: S32, kind: 'basic', outline: false });
  return { group: group(fm, gm), glowPos: new THREE.Vector3(0, (b + 8) * S32, 0) };
}

// ------------------------------------------------------------------ sack / bedroll
export function makeSack(seed = 2, color = 0xc8a070) {
  const g = new VoxelGrid(24, 28, 24);
  const dark = shade(color, 0.84), lite = shade(color, 1.08);
  g.ellipsoid(12, 10, 12, 10, 10, 9.2, (x, y, z, dx, dy) => {
    let c = ((x + y) % 2 === 0) !== ((z + y) % 2 === 0) ? color : lite; // burlap weave
    if (dy < -0.6) c = dark;
    if (Math.abs(dx) < 0.08 && dy > -0.3) c = dark; // seam
    return c;
  });
  g.box(9, 19, 9, 6, 4, 6, (x, y, z) => ((x + z + y) % 2 ? shade(color, 0.9) : color));
  g.box(8, 18, 8, 8, 2, 8, (x, y, z) => ((x + z) % 2 ? 0x8a5a2a : 0x7a4a22)); // rope tie
  g.box(10, 23, 10, 4, 2, 4, shade(color, 1.05));
  g.set(16, 17, 12, 0x8a5a2a); g.set(17, 16, 12, 0x8a5a2a); g.set(17, 15, 12, 0x8a5a2a);
  // a patch
  const rng = makeRng(seed);
  const px = rng.int(7, 12), py = rng.int(6, 10);
  for (let x = px; x < px + 5; x++) for (let y = py; y < py + 4; y++) {
    for (let z = 23; z >= 0; z--) if (g.filled(x, y, z)) { g.set(x, y, z, (x === px || x === px + 4 || y === py || y === py + 3) ? 0x6a4a2a : 0xa86a3a); break; }
  }
  g.paint((x, y) => (y < 2 ? -1 : undefined));
  return voxMesh(g, { pivot: [12, 2, 12], scale: S32 });
}

/** A rolled straw bed / nest. */
export function makeNest(seed = 3) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(60, 14, 44);
  const STRAW = [0xe0c060, 0xd8b050, 0xc89a40, 0xe8d080, 0xb8903a];
  g.ellipsoid(30, 2, 22, 28, 8, 20, (x, y, z, dx, dy, dz) => {
    const rim = dx * dx + dz * dz > 0.55;
    if (!rim && y > 4) return -1;
    // straws run around the ring: pick by angle stripes
    const a = Math.atan2(dz, dx);
    const stripe = Math.floor(a * 10 + y * 0.7 + hash3(x >> 2, y, z >> 2, seed) * 2);
    return STRAW[((stripe % 5) + 5) % 5];
  });
  // loose straws poking out
  for (let i = 0; i < 26; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(0.85, 1.05);
    const x = 30 + Math.cos(a) * 28 * r, z = 22 + Math.sin(a) * 20 * r;
    const len = rng.int(3, 7), up = rng.range(0, 0.6);
    for (let k = 0; k < len; k++) g.set(x + Math.cos(a) * k, 5 + up * k + rng.range(0, 1), z + Math.sin(a) * k, rng.pick(STRAW));
  }
  // a little patchwork blanket
  g.box(18, 4, 12, 24, 1, 20, (x, y, z) => {
    const cell = ((x - 18) >> 3) + ((z - 12) >> 3);
    if ((x - 18) % 8 === 0 || (z - 12) % 8 === 0) return 0xf0e0c0;
    return [0xb84a3a, 0xe8d2a2, 0x5a7ab0, 0xd8a040][cell % 4];
  });
  g.paint((x, y) => (y < 2 ? -1 : undefined));
  return voxMesh(g, { pivot: [30, 2, 22], scale: S32 });
}

export { group, S16, S32 };
