// Voxel props for the sunset beach.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VoxelGrid, voxMesh, meshVoxGreedy, jitf, hash3, voxLine } from './vox.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { makeRng, shade } from '../core/util.js';

const S16 = 1 / 16;

/**
 * A leaning palm tree at 1/24: a ringed, cross-hatched trunk on a flared foot, a cluster of
 * coconuts and pinnate fronds (leaflets angled toward the tip, a couple of dry ones hanging).
 * Trunk and crown are separate grids merged into one mesh. Origin at the trunk base; the trunk
 * top sits at (lean * height² / 12, height / 12, 0) as before.
 */
export function makePalm(seed = 1, { height = 46, lean = 0.012 } = {}) {
  const rng = makeRng(seed);
  const K = 2, VSZ = 1 / 24;
  const HT = height * K, L = lean / K;
  const topX = L * HT * HT;
  // ---- trunk
  const TW = Math.ceil(topX) + 24, TD = 24;
  const tg = new VoxelGrid(TW, HT + 2, TD);
  const tcx = 11, tcz = 12;
  let zTop = tcz;
  for (let s = 0; s < HT; s++) {
    const x = tcx + L * s * s, z = tcz + Math.sin(s * 0.04) * 1.6;
    zTop = z;
    const u = s / HT;
    const ring = s % 8;
    const r = (s < 8 ? 6.2 - s * 0.22 : 4.5 - u * 1.2) + (ring === 0 ? 0.55 : 0);
    for (let dx = -8; dx <= 8; dx++) for (let dz = -8; dz <= 8; dz++) {
      const dd = Math.hypot(dx, dz);
      if (dd > r) continue;
      const a = Math.atan2(dz, dx);
      const lit = Math.cos(a - 2.4);
      let c;
      if (ring === 0) c = 0xb89a6a;
      else if (ring === 7 || ring === 1) c = 0x5a3e28;
      else c = (Math.floor(a * 2.6 + s * 0.22) + Math.floor(s / 8)) % 2 ? 0x7a5a3a : 0x6a4a30;
      tg.set(x + dx, s, z + dz, jitf(shade(c, 0.86 + lit * 0.16), dx, s, dz, seed, 0.04));
    }
  }
  // roots spreading into the sand
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rng.range(-0.3, 0.3);
    for (let r = 5; r < 10 + rng.int(0, 3); r++) tg.set(tcx + Math.cos(a) * r, r > 8 ? 0 : 1, tcz + Math.sin(a) * r, r > 8 ? 0x6a4a30 : 0x7a5a3a);
  }
  // ---- crown
  const CW = 132, CH = 76, CD = 132, ccx = CW / 2, ccy = 42, ccz = CD / 2;
  const cg = new VoxelGrid(CW, CH, CD);
  // coconuts
  const nuts = [[3.4, -3, 3.2], [-3.6, -2.5, 1.8], [0.6, -4, -3.8], [-1, -6.5, 1.2]];
  nuts.forEach(([ox, oy, oz], i) => {
    const young = i === 3;
    cg.ellipsoid(ccx + ox, ccy + oy, ccz + oz, 3.3, 3.5, 3.3, (x, y, z, dx, dy, dz) => {
      const lit = -dx * 0.6 + dy * 0.8;
      if (young) return lit > 0.5 ? 0x8aaa3a : lit < -0.4 ? 0x4a6a1a : 0x6a8a2a;
      return lit > 0.55 ? 0x8a5a2c : lit < -0.35 ? 0x3a2410 : hash3(x, y, z, 3) < 0.25 ? 0x4a2e18 : 0x5e3a1e;
    });
  });
  // a little crown of leaf bases
  cg.ellipsoid(ccx, ccy + 1, ccz, 5, 3, 5, (x, y, z) => (hash3(x, y, z, 9) < 0.5 ? 0x6a5a2a : 0x7a6a34));
  const N = 10;
  for (let f = 0; f < N; f++) {
    const dry = f === 3 || f === 8;
    const a = (f / N) * Math.PI * 2 + rng.range(-0.18, 0.18);
    const len = dry ? rng.range(36, 44) : rng.range(46, 60);
    const dx = Math.cos(a), dz = Math.sin(a);
    const px = -dz, pz = dx; // perpendicular
    const lift = dry ? -0.55 : rng.range(0.3, 0.7);
    const pal = dry ? [0x9a7a40, 0xb89a5a, 0xc8aa6a, 0x7a5a30] : [0x3a7a2a, 0x4a9a34, 0x5aa83a, 0x6ab040];
    for (let i = 0; i <= len; i++) {
      const u = i / len;
      const x = ccx + dx * i, z = ccz + dz * i;
      const y = ccy + 3 + (dry ? lift * i * (0.4 + u) : lift * i * (1 - u * 1.7) * 1.1);
      cg.set(x, y, z, dry ? 0xc8aa6a : u < 0.15 ? 0x8a8a3a : 0x9ab84a); // midrib
      cg.set(x, y - 1, z, dry ? 0x7a5a30 : 0x2a5a1a);
      if (u < 0.08 || (u > 0.75 && i % 2)) continue; // dense leaflets, thinning toward the tip
      const w = Math.max(1, (dry ? 6 : 9) * Math.sin(Math.min(1, u * 1.15) * Math.PI) * (1 - u * 0.4));
      for (const side of [-1, 1]) {
        for (let k = 1; k <= Math.round(w); k++) {
          const t = k / w;
          const lx = x + px * k * side + dx * k * 0.38, lz = z + pz * k * side + dz * k * 0.38;
          const ly = y - k * (dry ? 0.9 : 0.42) - k * k * 0.025;
          let c = t > 0.8 ? pal[3] : t > 0.45 ? pal[2] : (i % 4 ? pal[1] : pal[0]);
          if (!dry && u > 0.88) c = 0x7ac04a;
          if (!dry && t > 0.85 && hash3(f, i, k, 5) < 0.12) c = 0xa8a040; // a sun-bleached tip
          cg.set(lx, ly, lz, c);
        }
      }
    }
  }
  const trunk = meshVoxGreedy(tg, { scale: VSZ, pivot: [tcx, 0, tcz] });
  const crown = meshVoxGreedy(cg, { scale: VSZ, pivot: [ccx, ccy, ccz] });
  crown.translate(topX * VSZ, (HT - 1) * VSZ, (zTop - tcz) * VSZ);
  const geo = mergeGeometries([trunk, crown]);
  trunk.dispose(); crown.dispose();
  const m = new THREE.Mesh(geo, voxelMaterial('toon'));
  m.layers.enable(LAYER_OUTLINE);
  return m;
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

/** A seashell at 1/32: a ribbed scallop fan or a little spiral whelk (by seed). Origin at its base. */
export function makeShell(seed = 1) {
  const rng = makeRng(seed);
  const c = rng.pick([0xffc0c8, 0xfff0e0, 0xf0b090, 0xe8d0ff, 0xffe0b0]);
  const lo = shade(c, 0.8), hi = shade(c, 1.12);
  if (seed % 2) {
    // scallop: a fan of ribs with little ears at the hinge, domed in the middle
    const g = new VoxelGrid(14, 4, 12);
    for (let z = 0; z < 12; z++) for (let x = 0; x < 14; x++) {
      const dx = x + 0.5 - 7, dz = z + 0.5 - 1;
      const r = Math.hypot(dx, dz);
      if (r > 6.6 || dz < 0) continue;
      const ang = Math.atan2(dz, dx);
      if (r > 5.8 && Math.sin(ang * 14) > 0.3) continue; // scalloped edge
      const rib = Math.sin(ang * 14) > 0;
      const h = r < 4.5 ? 2 : 1;
      for (let y = 0; y < h; y++) g.set(x, y, z, y === h - 1 ? (rib ? hi : c) : lo);
      if (r < 2.2 && (Math.floor(r * 2) % 2 === 0)) g.set(x, h - 1, z, shade(c, 0.9)); // growth line
    }
    g.box(4, 0, 0, 2, 1, 2, lo); g.box(8, 0, 0, 2, 1, 2, lo); // ears
    return voxMesh(g, { scale: 1 / 32, pivot: [7, 0, 6] });
  }
  // whelk: a tapering spiral with a pale mouth
  const g = new VoxelGrid(12, 6, 8);
  for (let x = 0; x < 12; x++) {
    const t = x / 11;
    const r = 3.2 * (1 - t * 0.75);
    for (let z = 0; z < 8; z++) for (let y = 0; y < 6; y++) {
      const d = Math.hypot(y + 0.5 - 2.6, (z + 0.5 - 4) * 0.9);
      if (d > r) continue;
      const band = (Math.floor(x * 0.7 + Math.atan2(y - 2.6, z - 4) * 0.8) % 2) === 0;
      g.set(x, y, z, x < 3 && z > 4 && y < 3 ? 0xfff6ec : band ? hi : lo);
    }
  }
  return voxMesh(g, { scale: 1 / 32, pivot: [6, 0, 4] });
}

/** A starfish at 1/32: five tapering arms, a raised centre and a bumpy, dotted back. */
export function makeStarfish(seed = 1) {
  const c = seed % 2 ? 0xff8a3a : 0xf06a7a;
  const g = new VoxelGrid(17, 3, 17);
  for (let z = 0; z < 17; z++) for (let x = 0; x < 17; x++) {
    const dx = x + 0.5 - 8.5, dz = z + 0.5 - 8.5;
    const r = Math.hypot(dx, dz);
    const a = Math.atan2(dz, dx) + Math.PI / 2;
    const arm = Math.abs(Math.cos((a * 5) / 2)); // 1 along each arm
    const width = 1.4 + (1 - Math.min(1, r / 8)) * 2.6;
    if (r > 8.2 || (1 - arm) * r * 2.2 > width) continue;
    const h = r < 2.5 ? 3 : r < 6 ? 2 : 1;
    for (let y = 0; y < h; y++) {
      let col = y === h - 1 ? c : shade(c, 0.78);
      if (y === h - 1 && (x * 3 + z * 5) % 7 === 0) col = shade(c, 1.25); // bumps
      if (y === h - 1 && r > 6.8) col = shade(c, 0.9);
      g.set(x, y, z, col);
    }
  }
  return voxMesh(g, { scale: 1 / 32, pivot: [8.5, 0, 8.5] });
}

/** A little red crab at 1/32. Returns {root, body, clawL, clawR, legs}. Faces +z; scuttles along x. */
export function makeCrab(seed = 1) {
  const c = seed % 2 ? 0xe0503a : 0xf06a3a;
  const hi = shade(c, 1.18), lo = shade(c, 0.72), spot = shade(c, 0.86);
  const S32 = 1 / 32;
  // shell: a wide dome with a lighter crown, freckles, a dark rim and the mouth plate at the front
  const bodyG = new VoxelGrid(18, 9, 14);
  bodyG.ellipsoid(9, 2.6, 7, 8.2, 3.4, 6.2, (x, y, z, dx, dy, dz) => {
    if (dy < -0.4) return lo;
    if (Math.abs(dx) > 0.86 || Math.abs(dz) > 0.86) return lo; // rim
    if (dy > 0.55) return (x * 7 + z * 3) % 9 === 0 ? spot : hi;
    return (x * 5 + z * 11 + y) % 13 === 0 ? spot : c;
  });
  bodyG.box(7, 1, 12, 4, 2, 2, lo); // mouth plate
  // eye stalks with glossy eyes
  for (const x of [6, 11]) {
    bodyG.box(x, 5, 11, 1, 3, 1, c);
    bodyG.box(x, 8, 11, 1, 1, 2, 0x1a1012);
    bodyG.set(x, 8, 12, 0x1a1012);
    bodyG.set(x, 8, 13, 0xf6f0e6);
  }
  // claw: a chunky palm with a fixed lower finger and a curved upper one
  const clawG = new VoxelGrid(6, 6, 7);
  clawG.ellipsoid(3, 2, 2.5, 2.6, 2, 2.6, (x, y, z, dx, dy) => (dy > 0.3 ? hi : c));
  clawG.box(1, 0, 4, 4, 1, 3, lo); // lower finger
  clawG.box(1, 3, 4, 4, 1, 2, c); // upper finger
  clawG.box(2, 2, 6, 2, 1, 1, lo); // tips almost touching
  clawG.set(2, 3, 6, 0xf6d0c0); clawG.set(3, 0, 6, 0xf6d0c0);
  // leg: two segments with a joint, pointed tip
  const legG = new VoxelGrid(8, 4, 2);
  for (let x = 0; x < 4; x++) { legG.set(x, 3, 0, c); legG.set(x, 3, 1, c); legG.set(x, 2, 0, lo); }
  legG.set(4, 2, 0, hi); legG.set(4, 2, 1, hi);
  for (let x = 5; x < 8; x++) legG.set(x, 1 - (x > 6 ? 1 : 0), 0, x === 7 ? lo : c);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(voxMesh(bodyG, { scale: S32, pivot: [9, -2, 7] }));
  const claws = [-1, 1].map((side) => {
    const m = voxMesh(clawG, { scale: S32, pivot: [3, 0, 0] });
    const p = new THREE.Group();
    p.position.set(side * 4.2 * S16, 2.2 * S16, 3.2 * S16);
    p.add(m);
    body.add(p);
    return p;
  });
  const legs = [];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const m = voxMesh(legG, { scale: S32, pivot: [0, 2, 1] });
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
