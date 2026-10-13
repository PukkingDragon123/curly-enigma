// Voxel props for the sunset beach.
import * as THREE from 'three';
import { VoxelGrid, voxMesh, jitf, hash3, voxLine } from './vox.js';
import { makeRng, shade } from '../core/util.js';

const S16 = 1 / 16;

/** A leaning palm tree (1 voxel = 1/12 unit). Origin at the trunk base. */
export function makePalm(seed = 1, { height = 46, lean = 0.012 } = {}) {
  const rng = makeRng(seed);
  const W = 84, H = height + 22, D = 84;
  const g = new VoxelGrid(W, H, D);
  const cx = W / 2, cz = D / 2;
  // trunk: a gentle curve along +x
  let top = [cx, 0, cz];
  for (let s = 0; s < height; s++) {
    const x = cx + lean * s * s, z = cz + Math.sin(s * 0.08) * 0.8;
    const ring = s % 4 === 0;
    const r = s < 4 ? 2.6 : 2.0;
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (dx * dx + dz * dz > r * r + 0.5) continue;
      const c = ring ? 0xa88a60 : (dx + dz + s) % 3 === 0 ? 0x6a4a30 : 0x7a5a3a;
      g.set(x + dx, s, z + dz, jitf(c, dx, s, dz, seed, 0.06));
    }
    top = [x, s, z];
  }
  const [tx, ty, tz] = top;
  // coconuts
  for (const [ox, oz] of [[1.5, 1.5], [-1.8, 0.8], [0.4, -1.9]]) g.ellipsoid(tx + ox, ty - 1.5, tz + oz, 1.6, 1.6, 1.6, (x, y, z) => (hash3(x, y, z, 3) < 0.3 ? 0x4a2e18 : 0x6a4424));
  // fronds
  const N = 8;
  for (let f = 0; f < N; f++) {
    const a = (f / N) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const len = rng.range(22, 30);
    const dx = Math.cos(a), dz = Math.sin(a);
    const px = -dz, pz = dx; // perpendicular
    const lift = rng.range(0.3, 0.7);
    for (let i = 0; i <= len; i++) {
      const u = i / len;
      const x = tx + dx * i, z = tz + dz * i;
      const y = ty + 2 + lift * i * (1 - u * 1.7) * 1.1;
      const w = Math.max(0.5, 4.2 * Math.sin(Math.min(1, u * 1.15) * Math.PI) * (1 - u * 0.4));
      g.set(x, y, z, 0x3a7a2a);
      for (let k = 1; k <= Math.round(w); k++) {
        const jag = (i + k) % 3 === 0 ? -1 : 0;
        const droop = k * 0.35;
        const c = u > 0.85 ? 0x7ac04a : k > w - 1.2 ? 0x6ab040 : (i % 2 ? 0x4a9a34 : 0x5aa83a);
        g.set(x + px * k, y - droop + jag, z + pz * k, c);
        g.set(x - px * k, y - droop + jag, z - pz * k, c);
      }
    }
  }
  return voxMesh(g, { scale: 1 / 12, pivot: [cx, 0, cz] });
}

/** Striped beach umbrella. Origin at the pole base; canopy faces up. */
export function makeUmbrella({ a = 0xe0403a, b = 0xf6f0e6 } = {}) {
  const R = 22;
  const g = new VoxelGrid(R * 2 + 2, 50, R * 2 + 2);
  const c = R + 1;
  for (let y = 0; y < 42; y++) g.set(c, y, c, y % 6 === 0 ? 0xd8c8a8 : 0xf0e8d8);
  for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {
    const dx = x + 0.5 - c, dz = z + 0.5 - c;
    const d = Math.hypot(dx, dz);
    if (d > R) continue;
    const ang = Math.atan2(dz, dx);
    const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 10);
    const scallop = d > R - 1.6 && Math.sin(ang * 10 * 2) < -0.2;
    if (scallop) continue;
    const y = Math.round(47 - (d / R) * 8 - (d / R) ** 2 * 2);
    const col = seg % 2 ? a : b;
    g.set(x, y, z, jitf(col, x, y, z, 2, 0.04));
    g.set(x, y - 1, z, shade(col, 0.82));
  }
  g.box(c - 1, 47, c - 1, 2, 2, 2, 0xffd040);
  return voxMesh(g, { scale: S16, pivot: [c + 0.5, 0, c + 0.5] });
}

/** A wooden beach lounger with striped fabric; origin at the seat centre on the ground, facing -z. */
export function makeLounger({ a = 0x3a8ad0, b = 0xf6f0e6 } = {}) {
  const g = new VoxelGrid(18, 24, 40);
  const wood = 0xc89a5a, woodDk = 0x9a7040;
  // legs + side rails
  for (const x of [1, 16]) {
    for (const z of [3, 22]) g.box(x, 0, z, 1, 6, 1, woodDk);
    g.box(x, 5, 2, 1, 1, 22, wood);
  }
  // seat fabric (z 3..22), stripes across
  g.box(2, 5, 2, 14, 1, 21, (x, y, z) => ((z >> 2) % 2 ? a : b));
  // backrest rising toward +z (the mole faces -z)
  for (let i = 0; i < 16; i++) {
    const z = 23 + Math.round(i * 0.55), y = 6 + i;
    g.box(2, y, z, 14, 1, 1, ((i >> 2) % 2) ? a : b);
    g.set(1, y, z, wood); g.set(16, y, z, wood);
  }
  g.box(1, 21, 31, 16, 1, 1, wood);
  // foot rest legs
  g.box(2, 0, 1, 1, 5, 1, woodDk); g.box(15, 0, 1, 1, 5, 1, woodDk);
  return voxMesh(g, { scale: S16, pivot: [9, 0, 13] });
}

export function makeTowel({ cols = [0xffd040, 0xff7a5a, 0xfff6e8, 0x4ab0c8] } = {}) {
  const g = new VoxelGrid(16, 1, 28);
  for (let z = 0; z < 28; z++) for (let x = 0; x < 16; x++) {
    const fringe = z === 0 || z === 27;
    if (fringe && x % 2) continue;
    g.set(x, 0, z, fringe ? 0xfff6e8 : cols[Math.floor(z / 4) % cols.length]);
  }
  return voxMesh(g, { scale: S16, pivot: [8, 0, 14] });
}

export function makeSandcastle(seed = 3) {
  const g = new VoxelGrid(30, 24, 30);
  const sand = (x, y, z) => jitf(y % 3 === 0 ? 0xd8b880 : 0xe8cc96, x, y, z, seed, 0.06);
  g.ellipsoid(15, 0, 15, 13, 4, 12, sand);
  // walls
  g.box(6, 3, 6, 18, 5, 18, (x, y, z) => ((x > 7 && x < 22 && z > 7 && z < 22) ? -1 : sand(x, y, z)));
  for (let x = 6; x < 24; x += 2) { g.set(x, 8, 6, 0xe0c48e); g.set(x, 8, 23, 0xe0c48e); }
  for (let z = 6; z < 24; z += 2) { g.set(6, 8, z, 0xe0c48e); g.set(23, 8, z, 0xe0c48e); }
  // towers
  const towers = [[7, 7, 10], [22, 7, 11], [7, 22, 9], [22, 22, 12], [15, 15, 17]];
  for (const [x, z, h] of towers) {
    g.cylinderY(x, z, x === 15 ? 4 : 3, 3, h, sand);
    for (let a = 0; a < 8; a++) if (a % 2 === 0) g.set(x + Math.cos((a / 8) * 6.28) * 3, h, z + Math.sin((a / 8) * 6.28) * 3, 0xe0c48e);
  }
  // door + windows
  g.box(14, 3, 19, 2, 4, 1, 0x8a6a48);
  g.set(15, 12, 19, 0x6a4a30); g.set(22, 8, 25, 0x6a4a30);
  // a little flag on the keep
  for (let y = 17; y < 23; y++) g.set(15, y, 15, 0x8a6a48);
  g.box(16, 20, 15, 3, 2, 1, 0xe0403a);
  g.set(19, 21, 15, 0xe0403a);
  return voxMesh(g, { scale: S16, pivot: [15, 0, 15] });
}

export function makeBucket() {
  const g = new VoxelGrid(12, 12, 12);
  g.cylinderY(6, 6, 4, 0, 8, (x, y, z) => (y === 7 ? 0xf06a4a : 0xe0403a));
  g.cylinderY(6, 6, 3, 2, 8, -1);
  g.cylinderY(6, 6, 3, 1, 6, 0xe8cc96); // sand inside
  voxLine(g, [2, 8, 6], [6, 11, 6], 0x3a3a3a);
  voxLine(g, [6, 11, 6], [10, 8, 6], 0x3a3a3a);
  return voxMesh(g, { scale: S16, pivot: [6, 0, 6] });
}

export function makeSpade() {
  const g = new VoxelGrid(5, 18, 3);
  for (let y = 6; y < 17; y++) g.set(2, y, 1, 0xf6f0e6);
  g.box(1, 16, 1, 3, 1, 1, 0x3a8ad0);
  g.box(0, 0, 0, 5, 6, 2, (x, y) => (y === 0 ? 0x2a6aa8 : 0x3a8ad0));
  return voxMesh(g, { scale: S16, pivot: [2.5, 0, 1] });
}

export function makeBeachBall() {
  const g = new VoxelGrid(10, 10, 10);
  const cols = [0xe0403a, 0xfff6e8, 0x3a8ad0, 0xffd040, 0xfff6e8, 0x5ab84a];
  g.ellipsoid(5, 5, 5, 4.5, 4.5, 4.5, (x, y, z, dx, dy, dz) => {
    if (dy > 0.8) return 0xffffff;
    const a = Math.atan2(dz, dx);
    return cols[Math.floor(((a + Math.PI) / (Math.PI * 2)) * 6) % 6];
  });
  return voxMesh(g, { scale: S16, pivot: [5, 0.5, 5] });
}

export function makeShell(seed = 1) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(5, 2, 5);
  const c = rng.pick([0xffc0c8, 0xfff0e0, 0xf0b090, 0xe8d0ff]);
  for (const [x, z] of [[2, 0], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [2, 3], [3, 3]]) g.set(x, 0, z, (x + z) % 2 ? c : shade(c, 0.85));
  g.set(2, 1, 2, shade(c, 1.1));
  return voxMesh(g, { scale: S16, pivot: [2.5, 0, 2.5] });
}

export function makeStarfish(seed = 1) {
  const g = new VoxelGrid(7, 2, 7);
  const c = seed % 2 ? 0xff8a3a : 0xf06a7a;
  g.set(3, 0, 3, c); g.set(3, 1, 3, shade(c, 1.15));
  for (let a = 0; a < 5; a++) {
    const t = (a / 5) * Math.PI * 2 - Math.PI / 2;
    for (let r = 1; r <= 3; r++) g.set(3 + Math.cos(t) * r, 0, 3 + Math.sin(t) * r, r === 3 ? shade(c, 0.85) : c);
  }
  return voxMesh(g, { scale: S16, pivot: [3.5, 0, 3.5] });
}

/** A little red crab. Returns {root, body, clawL, clawR, legs}. Faces +z; scuttles along x. */
export function makeCrab(seed = 1) {
  const c = seed % 2 ? 0xe0503a : 0xf06a3a;
  const bodyG = new VoxelGrid(9, 4, 7);
  bodyG.ellipsoid(4.5, 1.4, 3.5, 4, 1.8, 3, (x, y) => (y > 1 ? shade(c, 1.1) : c));
  for (const x of [3, 5]) { bodyG.set(x, 3, 5, 0xf6f0e6); bodyG.set(x, 3, 6, 0x1a1012); bodyG.set(x, 2, 5, c); }
  const clawG = new VoxelGrid(3, 3, 3);
  clawG.box(0, 0, 0, 3, 2, 3, c);
  clawG.set(1, 2, 2, c); clawG.set(0, 2, 2, shade(c, 1.15));
  const legG = new VoxelGrid(4, 2, 1);
  legG.set(0, 1, 0, c); legG.set(1, 1, 0, c); legG.set(2, 0, 0, c); legG.set(3, 0, 0, shade(c, 0.8));
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(voxMesh(bodyG, { scale: S16, pivot: [4.5, -1, 3.5] }));
  const claws = [-1, 1].map((side) => {
    const m = voxMesh(clawG, { scale: S16, pivot: [1.5, 0, 0] });
    const p = new THREE.Group();
    p.position.set(side * 4.2 * S16, 2.2 * S16, 3.2 * S16);
    p.add(m);
    body.add(p);
    return p;
  });
  const legs = [];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const m = voxMesh(legG, { scale: S16, pivot: [0, 1, 0.5] });
    const p = new THREE.Group();
    p.position.set(side * 3.6 * S16, 1.2 * S16, (2 + i * 1.3) * S16);
    if (side < 0) p.rotation.y = Math.PI;
    p.add(m);
    body.add(p);
    legs.push(p);
  }
  return { root, body, clawL: claws[0], clawR: claws[1], legs };
}

/** Beach grass tuft. */
export function makeGrassTuft(seed = 1) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(9, 9, 9);
  for (let i = 0; i < 9; i++) {
    const x = rng.int(1, 7), z = rng.int(1, 7), h = rng.int(3, 8);
    const lx = rng.range(-0.35, 0.35), lz = rng.range(-0.35, 0.35);
    for (let y = 0; y < h; y++) g.set(x + lx * y, y, z + lz * y, y > h - 3 ? 0xd8d080 : y % 2 ? 0x8aa84a : 0x9ab858);
  }
  return voxMesh(g, { scale: S16, pivot: [4.5, 0, 4.5] });
}

/** A little brass ring set into the sand where the Surface Express arrives. */
export function makeTerminusRing() {
  const R = 22;
  const g = new VoxelGrid(R * 2 + 2, 2, R * 2 + 2);
  const c = R + 1;
  for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {
    const d = Math.hypot(x + 0.5 - c, z + 0.5 - c);
    if (d > R) continue;
    if (d > R - 2.2) g.set(x, 1, z, (x + z) % 4 ? 0xd9a83a : 0xffe08a);
    else g.set(x, 0, z, 0x2a1a14);
  }
  return voxMesh(g, { scale: S16, pivot: [c, 1, c] });
}

export { S16 };
