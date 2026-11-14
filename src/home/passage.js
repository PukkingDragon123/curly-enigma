// The old passage: the tunnel from Old Star's front door (the north rock of the burrow) up to your
// round green door in Deep Town's north cliff. Once the way is found from below (state.escaped)
// you just walk it, both ways: out of the hollow through the open door, up a timbered tunnel that
// doglegs (north, west, north) past two lanterns, and out under the stone arch into the town.
//
// The burrow (HomeScene) and the town (TownScene) are separate scenes, so the passage is built
// into both from this one module, the same voxels in the same place: the burrow's frame (meters,
// src/home/units.js) is the passage's own, and the town sees it turned half round (TOWN_XF). The
// hand-off between the two happens across the middle of the dogleg's cross leg (SWAP), where
// neither end can be seen from anywhere you can stand on the near side of it; Game.goto's
// 'seamless' switch holds the frame on screen while the other scene is built and dissolves into
// it, the mole keeps its place, heading and stride. A little dead band (SWAP.band) keeps it from
// flipping back and forth on the line. Near the line the town's look eases into the burrow's
// (PASSAGE_LOOK), so the two frames match.
//
// Everything here is pure meshes and numbers (no scene state): buildPassage() → a group in the
// burrow's frame (its meshes cached and shared between visits); passageBoxes() → its collision;
// inPassage / passageU / passageK → where the mole is along it.
//
// Layout (burrow frame, m): the door's face at z -4.3 (x 6.55); the cave's rock ends at -4.75 and
// the tube starts; leg 1 north to the cross leg (z -6.6, from x 7.05 to 3.05); leg 3 north from its
// west end (x 3.55) to the back of the town's wall (z -8.375) and through the wall's arch to its face
// (z -9.5625). The tube is 1 m wide, its walls straight to 0.95 m then vaulting to a 1.42 m crown.
import * as THREE from 'three';
import { VoxelGrid } from '../gfx/Voxel.js';
import { meshFast } from '../iso/mesher.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

// ---------------------------------------------------------------- the plan
const HW = 0.5; // the tube's half width (m)
/** Leg rectangles of the walkable tube [x0, z0, x1, z1] (m, burrow frame). */
const LEGS = [
  [6.05, -7.1, 7.05, -4.75], // leg 1: from the door north to the cross leg
  [3.05, -7.1, 7.05, -6.1], // leg 2: the cross leg, west
  [3.05, -8.375, 4.05, -6.1], // leg 3: north to the back of the town's wall
];
export const PASSAGE = {
  door: { x: 6.55, z: -4.3 }, // Old Star's front door (its face)
  rockEnd: -4.75, // where the burrow's own rock ends
  townBack: -8.375, // the back of the town's north wall
  townFace: -9.5625, // its face: the mouth under the arch
  mouthX: 3.55,
  hw: HW,
  crown: 1.42,
  legs: LEGS,
  // the bounds of what the passage builds and collides (m)
  // (z: the burrow's rock ends and the town's floor begins on its cell edges: no seam, no overlap)
  box: { x0: 2.6, x1: 7.45, z0: -9.5625, z1: -4.75 },
};
/** The hand-off line across leg 2 (x, burrow frame) and the dead band either side of it (m). */
export const SWAP = { x: 5.05, z0: -7.1, z1: -6.1, band: 0.15 };
/**
 * The town's frame from the burrow's: turned half round about y and moved, town meters =
 * (ox - x, oz - z) (and back the same way). Puts the mouth (x 3.55, z -9.5625) on the town's
 * burrow door (TOWN.home: x 10.5 TU, the north face at z 3 TU) and the tube's end (z -8.375) on
 * the back of the town's north wall (its relief is FACE_D = 1.9 TU deep).
 */
export const TOWN_XF = { ox: 10.1125, oz: -7.6875, yaw: Math.PI };
export function toTown(x, z) { return [TOWN_XF.ox - x, TOWN_XF.oz - z]; }
export function toHome(x, z) { return [TOWN_XF.ox - x, TOWN_XF.oz - z]; }
/** The town's arch over the mouth (m): half width, where the round top springs, its top. */
export const ARCH = { hw: 0.39, spring: 0.547, top: 0.938 };

/**
 * The burrow's look (its post settings): the passage wears it all the way through, so the town
 * eases into it near the hand-off and the two frames match (HomeScene uses it as its own).
 */
export const PASSAGE_GRADE = { lift: [0.0, 0.012, 0.042], gamma: [1.02, 1.0, 0.97], gain: [1.06, 0.99, 0.88] };
export const PASSAGE_LOOK = { vignette: 0.5, outlineAlpha: 0.7, innerThresh: 0.22, saturation: 1.02, contrast: 1.1, brightness: 1.06, grade: PASSAGE_GRADE, gradeMix: 1, bloom: 0.7, bloomThreshold: 0.72, aoRadius: 0.35, aoFar: 18 };
/** The paws' light in the passage (the burrow's): [lamp rgb], [ambient rgb]. */
export const PASSAGE_PAWS = { lamp: [1.2, 0.98, 0.78], ambient: [0.4, 0.32, 0.28] };

/** Is (x, z) (burrow frame) on the passage's floor, m in from its walls? */
export function inPassage(x, z, m = 0) {
  for (const [x0, z0, x1, z1] of LEGS) if (x > x0 + m && x < x1 - m && z > z0 + m && z < z1 - m) return true;
  return false;
}

/** Signed distance past the hand-off line toward the town (m), on the cross leg; null elsewhere. */
export function passageU(x, z) {
  if (z < SWAP.z0 || z > SWAP.z1 || x < 3.05 || x > 7.05) return null;
  return SWAP.x - x;
}

/** How near the hand-off (x, z) (burrow frame) is along the passage: 1 on the line, 0 a few steps off. */
export function passageK(x, z) {
  let d = 99;
  if (inPassage(x, z, -0.1)) {
    if (z >= SWAP.z0 - 0.1 && z <= SWAP.z1 + 0.1) d = Math.abs(x - SWAP.x);
    else if (x > 6.0) d = Math.abs(x - SWAP.x) + Math.abs(z - (SWAP.z0 + SWAP.z1) / 2);
    else d = Math.abs(x - SWAP.x) + Math.abs(z - (SWAP.z0 + SWAP.z1) / 2);
  }
  const k = 1 - d / 2.4;
  return k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
}

/**
 * The passage's collision (burrow frame, m): the rock round the tube as boxes (0.05 m cells,
 * merged along x), the floor under it, a ceiling at head height, and the timbers' posts. Not the
 * ends: the burrow's door hole and the town's arch are their own scenes' boxes.
 */
let BOXES = null;
export function passageBoxes() {
  if (BOXES) return BOXES;
  const C = 0.05, B = PASSAGE.box, Z0 = PASSAGE.townBack, Z1 = B.z1;
  const nx = Math.round((B.x1 - B.x0) / C), nz = Math.round((Z1 - Z0) / C);
  const out = [];
  for (let j = 0; j < nz; j++) {
    let run = -1;
    for (let i = 0; i <= nx; i++) {
      const x = B.x0 + (i + 0.5) * C, z = Z0 + (j + 0.5) * C;
      const rock = i < nx && !inPassage(x, z);
      if (rock && run < 0) run = i;
      if (!rock && run >= 0) { out.push([B.x0 + run * C, -0.5, Z0 + j * C, B.x0 + i * C, 2.2, Z0 + (j + 1) * C]); run = -1; }
    }
  }
  out.push([B.x0, -1, Z0 - 0.02, B.x1, 0, Z1 + 0.02]); // the floor
  out.push([B.x0, 1.3, Z0 - 0.02, B.x1, 2.4, Z1 + 0.02]); // the roof, at head height (the vault is a little higher)
  for (const p of posts()) out.push([p.x - p.sx, 0, p.z - p.sz, p.x + p.sx, 1.3, p.z + p.sz]);
  // the caps across (a jump bumps your head on them, it doesn't put the eye through them)
  for (const f of frames()) {
    if (f.ax === 'x') out.push([f.x - HW, 1.0, f.z - 0.07, f.x + HW, 1.3, f.z + 0.07]);
    else out.push([f.x - 0.07, 1.0, f.z - HW, f.x + 0.07, 1.3, f.z + HW]);
  }
  out.push([4.49, 0, -6.94, 5.61, 0.0625, -6.26]); // the duckboards (a step up)
  return (BOXES = out);
}

// ---------------------------------------------------------------- noise (pure)
function hash(x, y, z, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const sm = (t) => t * t * (3 - 2 * t);
function n2(x, z, s = 0) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = sm(x - xi), fz = sm(z - zi);
  const a = hash(xi, 0, zi, s), b = hash(xi + 1, 0, zi, s), c = hash(xi, 0, zi + 1, s), d = hash(xi + 1, 0, zi + 1, s);
  return (a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz) * 2 - 1;
}
function n3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
  const l = (dy, dz) => { const a = hash(xi, yi + dy, zi + dz, s), b = hash(xi + 1, yi + dy, zi + dz, s); return a + (b - a) * fx; };
  const p = l(0, 0) + (l(1, 0) - l(0, 0)) * fy, q = l(0, 1) + (l(1, 1) - l(0, 1)) * fy;
  return (p + (q - p) * fz) * 2 - 1;
}
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const mulc = (c, k) => (cl(((c >> 16) & 255) * k) << 16) | (cl(((c >> 8) & 255) * k) << 8) | cl((c & 255) * k);
const mixc = (a, b, t) => (cl(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) | (cl(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) | cl((a & 255) * (1 - t) + (b & 255) * t);

/** Rounded-box signed distance in the plan (m). */
function sdBox(x, z, x0, z0, x1, z1, r) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2 - r, hz = (z1 - z0) / 2 - r;
  const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
/** Distance to the tube's wall at floor level (m, < 0 inside); the walls only ever wander outward. */
function tubeSD(x, z) {
  let d = Infinity;
  for (const [x0, z0, x1, z1] of LEGS) d = Math.min(d, sdBox(x, z, x0, z0, x1, z1, 0.1));
  return d - (0.035 + 0.035 * n2(x * 3.1 + 7, z * 3.1, 3));
}
/** How far the walls lean in at height h (m): straight to 0.95, then vaulting over to the crown. */
const lean = (h) => (h < 0.95 ? 0 : ((h - 0.95) / 0.47) ** 2 * 0.48);
/** Inside the town's arch (m from its middle, height)? */
function inArch(du, y, pad = 0) {
  const hw = ARCH.hw + pad;
  if (Math.abs(du) > hw || y < 0) return false;
  if (y < ARCH.spring) return true;
  return du * du + (y - ARCH.spring) ** 2 <= hw * hw;
}

// ---------------------------------------------------------------- the timbers and the dressing
/** The shoring: a post each side and a cap across, every so often (m, burrow frame). */
function frames() {
  return [
    { x: 6.55, z: -5.3, ax: 'x' }, // leg 1 (posts on the east and west walls, the cap across x)
    { x: 6.55, z: -5.95, ax: 'x' },
    { x: 5.65, z: -6.6, ax: 'z' }, // leg 2 (posts on the north and south walls)
    { x: 4.45, z: -6.6, ax: 'z' },
    { x: 3.55, z: -7.3, ax: 'x' }, // leg 3
    { x: 3.55, z: -8.05, ax: 'x' },
  ];
}
/** The posts' footprints (m): centre and half sizes. */
function posts() {
  const out = [];
  for (const f of frames()) {
    for (const s of [-1, 1]) {
      if (f.ax === 'x') out.push({ x: f.x + s * (HW - 0.01), z: f.z, sx: 0.06, sz: 0.055 });
      else out.push({ x: f.x, z: f.z + s * (HW - 0.01), sx: 0.055, sz: 0.06 });
    }
  }
  return out;
}
/** The lanterns (m): where they hang, and the baked light each gives. */
const LANTERNS = [
  { x: 6.55, y: 1.02, z: -7.02, nx: 0, nz: 1 }, // the cross leg's north wall: seen straight up leg 1 from the door
  { x: 3.55, y: 1.02, z: -6.18, nx: 0, nz: -1 }, // its south wall at the west end: seen straight down leg 3 from the town
];
const LIGHTS = [
  ...LANTERNS.map((l) => ({ x: l.x + l.nx * 0.16, y: l.y + 0.05, z: l.z + l.nz * 0.16, color: [1.0, 0.7, 0.38], power: 1.05, radius: 2.7 })),
  { x: 6.55, y: 0.9, z: -4.1, color: [1.0, 0.62, 0.32], power: 0.55, radius: 1.9 }, // the burrow's firelight through the door
  { x: 3.55, y: 1.1, z: -9.9, color: [1.0, 0.78, 0.5], power: 0.9, radius: 2.4 }, // the town's lamplight through the arch
];
const AMB = [0.16, 0.15, 0.19];

// cold grey-blue stone, warmer earth bands, the packed floor
const ROCK = [0x55585c, 0x484b50, 0x5f5e5a, 0x3e4145, 0x5d574f, 0x4b4e53, 0x67635b, 0x5a4e42];
const DIRT = [0x4e4234, 0x45392d, 0x56493a];

// ---------------------------------------------------------------- the build
let CACHE = null;

/**
 * The passage as a group in the burrow's frame (meters): the rock tube, the timbers and the
 * dressing (baked light, unlit materials: it looks the same in either scene), the lanterns' glass
 * (and its flicker). Returns { group, update(t), stats }. The meshes are built once per page and
 * shared (geometry and materials are flagged shared: a scene's exit leaves them alone).
 */
export function buildPassage() {
  if (!CACHE) CACHE = makePassage();
  const C = CACHE;
  const group = new THREE.Group();
  group.name = 'passage';
  for (const m of C.meshes) group.add(new THREE.Mesh(m.geometry, m.material).copy(m, false));
  return {
    group,
    update(t) {
      // the lanterns' flames breathe (the glass's colour; the baked light stays put)
      const k = 1 + 0.08 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 12.9 + 1.3);
      C.glow.color.setScalar(k);
    },
    stats: C.stats,
  };
}

function makePassage() {
  const t0 = performance.now();
  const meshes = [];
  const matRock = new THREE.MeshBasicMaterial({ vertexColors: true });
  const matGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
  for (const m of [matRock, matGlow]) m.userData.shared = true;
  const add = (geo, mat, outline) => {
    if (!geo) return;
    bake(geo, mat === matGlow);
    geo.userData.shared = true;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    if (outline) mesh.layers.enable(LAYER_OUTLINE);
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
  };
  add(rockGeometry(), matRock, false);
  const pr = propGeometry();
  add(pr.solid, matRock, true);
  add(pr.glow, matGlow, false);
  const ln = lanternGeometry();
  add(ln.solid, matRock, true);
  add(ln.glow, matGlow, false);
  let tris = 0;
  for (const m of meshes) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  return { meshes, glow: matGlow, stats: { ms: Math.round(performance.now() - t0), tris: Math.round(tris) } };
}

/** Bake the passage's lights into a geometry's vertex colours (glow parts just shine). */
function bake(geo, glow) {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), col = geo.getAttribute('color');
  if (!pos || !col) return;
  const P = pos.array, N = nor.array, C = col.array;
  for (let i = 0; i < pos.count; i++) {
    const k = i * 3;
    if (glow) { C[k] *= 1.9; C[k + 1] *= 1.9; C[k + 2] *= 1.9; continue; }
    const x = P[k], y = P[k + 1], z = P[k + 2];
    // a little skylight-ish fill from above, darker low in the corners
    const up = 0.75 + 0.25 * N[k + 1];
    let r = AMB[0] * up, g = AMB[1] * up, b = AMB[2] * up;
    for (const l of LIGHTS) {
      const dx = l.x - x, dy = l.y - y, dz = l.z - z;
      const d2 = dx * dx + dy * dy + dz * dz, r2 = l.radius * l.radius;
      if (d2 >= r2) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const w = ((dx * N[k] + dy * N[k + 1] + dz * N[k + 2]) / d) * 0.65 + 0.35;
      if (w <= 0) continue;
      const t = 1 - d2 / r2, a = t * t * w * l.power;
      r += l.color[0] * a; g += l.color[1] * a; b += l.color[2] * a;
    }
    C[k] *= Math.min(1.8, r * 1.35); C[k + 1] *= Math.min(1.8, g * 1.35); C[k + 2] *= Math.min(1.8, b * 1.35);
  }
  col.needsUpdate = true;
}

/** The rock: walls, vault, floor, the end wall with the arch's hole, the floor through the town's wall. */
function rockGeometry() {
  const CV = 16, S = 1 / CV, B = PASSAGE.box, Y0 = -0.25;
  const nx = Math.round((B.x1 - B.x0) * CV), nz = Math.round((B.z1 - B.z0) * CV), ny = 30;
  const g = new VoxelGrid(nx, ny, nz);
  const FLOOR = Math.round(-Y0 * CV); // first row above the floor
  const solid = new Uint8Array(nx * ny * nz);
  const I = (ix, iy, iz) => ix + nx * (iy + ny * iz);
  const SHELL = 0.32;
  const sd = new Float32Array(nx * nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) sd[ix + iz * nx] = tubeSD(B.x0 + (ix + 0.5) * S, B.z0 + (iz + 0.5) * S);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = B.x0 + (ix + 0.5) * S, z = B.z0 + (iz + 0.5) * S, d0 = sd[ix + iz * nx];
    const inWall = z < PASSAGE.townBack; // (the town's own wall stands here: only the floor through its arch)
    const endWall = z >= PASSAGE.townBack && z < PASSAGE.townBack + 0.13;
    for (let iy = 0; iy < ny; iy++) {
      const h = (iy - FLOOR + 0.5) / CV;
      let s = false;
      if (iy < FLOOR) s = inWall ? Math.abs(x - PASSAGE.mouthX) < 0.95 : d0 < SHELL + 0.1;
      else if (inWall) s = false;
      else if (endWall && Math.abs(x - PASSAGE.mouthX) < HW + 0.45 && h < 1.75) s = !inArch(x - PASSAGE.mouthX, h, 0.03);
      else {
        const dl = d0 + lean(h) + 0.03 * n3(x * 5.3, h * 5.3, z * 5.3, 9);
        s = dl > 0 && dl < SHELL;
        if (h > 1.62 && d0 < SHELL) s = true; // (the crown never opens)
      }
      if (s) solid[I(ix, iy, iz)] = 1;
    }
  }
  const air = (ix, iy, iz) => ix >= 0 && iy >= 0 && iz >= 0 && ix < nx && iy < ny && iz < nz && !solid[I(ix, iy, iz)];
  for (let iz = 0; iz < nz; iz++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
    if (!solid[I(ix, iy, iz)]) continue;
    const up = air(ix, iy + 1, iz);
    const shows = up || air(ix + 1, iy, iz) || air(ix - 1, iy, iz) || air(ix, iy - 1, iz) || air(ix, iy, iz + 1) || air(ix, iy, iz - 1);
    if (!shows) { g.set(ix, iy, iz, 0x2e2925); continue; }
    const x = B.x0 + (ix + 0.5) * S, z = B.z0 + (iz + 0.5) * S, h = (iy - FLOOR + 0.5) / CV;
    g.set(ix, iy, iz, iy < FLOOR && up ? floorColour(x, z, ix, iz) : rockColour(x, h, z, ix, iy, iz));
  }
  // roots hanging out of the vault here and there
  for (let k = 0; k < 26; k++) {
    let ix = Math.floor(hash(k, 1, 0, 71) * nx), iz = Math.floor(hash(k, 2, 0, 71) * nz);
    const x = B.x0 + (ix + 0.5) * S, z = B.z0 + (iz + 0.5) * S;
    if (!inPassage(x, z, 0.08) || z < PASSAGE.townBack + 0.3) continue;
    let iy = ny - 2;
    while (iy > FLOOR && solid[I(ix, iy, iz)]) iy--;
    const len = 3 + Math.floor(hash(k, 3, 0, 71) * 7);
    for (let j = 0; j < len && iy > FLOOR + 17; j++, iy--) {
      g.set(ix, iy, iz, j % 3 === 2 ? 0x3a2a1e : 0x5a4030);
      if (j % 3 === 2) { if (hash(ix, iy, iz, 72) < 0.5) ix += hash(k, j, 1, 73) < 0.5 ? 1 : -1; else iz += hash(k, j, 2, 73) < 0.5 ? 1 : -1; }
    }
  }
  return meshFast(g, { scale: S, pivot: [-B.x0 * CV, -Y0 * CV, -B.z0 * CV], ao: true, shade: true });
}

function floorColour(x, z, ix, iz) {
  let c = DIRT[Math.floor(hash(ix >> 1, 0, iz >> 1, 31) * 3)];
  const patch = n2(x * 1.4 + 3, z * 1.4, 32);
  if (patch > 0.35 || patch < -0.35) c = mulc(c, patch > 0 ? 1.08 : 0.88);
  // a path worn down the middle by sixty years of paws
  const mid = Math.min(...LEGS.map(([x0, z0, x1, z1]) => {
    const vert = z1 - z0 > x1 - x0;
    const inside = vert ? z >= z0 && z <= z1 : x >= x0 && x <= x1;
    return inside ? Math.abs(vert ? x - (x0 + x1) / 2 : z - (z0 + z1) / 2) : 9;
  }));
  if (mid < 0.2 && hash(ix, 1, iz, 33) < 0.85 - mid * 2) c = mixc(c, 0x76654c, 0.5);
  // the threshold through the town's wall: worn flagstones
  if (z < PASSAGE.townBack + 0.05) {
    const fx = Math.floor((x - PASSAGE.mouthX + 4) / 0.19), fz = Math.floor((z + 20) / 0.23 + (fx & 1) * 0.5);
    const edge = (x - PASSAGE.mouthX + 4) % 0.19 < 0.025 || ((z + 20) / 0.23 + (fx & 1) * 0.5) % 1 < 0.11;
    c = edge ? 0x3e3a36 : mulc(0x86807a, 0.88 + hash(fx, 2, fz, 34) * 0.18);
  }
  const pb = hash(ix, 0, iz, 35);
  if (pb < 0.03) c = pb < 0.01 ? 0x77746c : 0x5e5b55; // a pebble
  // damp under the drip in the cross leg (the duckboards' puddle)
  const wet = Math.hypot(x - 5.05, z + 6.62);
  if (wet < 0.42) c = mixc(c, 0x2e3438, 0.5 * (1 - wet / 0.42));
  return c;
}

function rockColour(x, h, z, ix, iy, iz) {
  const band = Math.floor((h + 0.16 * n2(x * 0.7, z * 0.7, 41)) / 0.17);
  let c = ROCK[((band % ROCK.length) + ROCK.length) % ROCK.length];
  const blk = hash(ix >> 1, iy >> 1, iz >> 1, 42);
  c = mulc(c, blk < 0.2 ? 0.88 : blk > 0.86 ? 1.1 : 1);
  // dug, not grown: pick scars in short diagonal strokes
  if ((ix + iz + iy * 2) % 7 === 0 && hash(ix >> 2, iy >> 2, iz >> 2, 43) < 0.45) c = mulc(c, 0.8);
  if (h > 1.15) c = mulc(c, Math.max(0.7, 1 - (h - 1.15) * 0.6));
  if (h < 0.22 && hash(ix >> 1, iy, iz >> 1, 44) < 0.35) c = mixc(c, DIRT[0], 0.55);
  if (h < 0.35 && hash(ix >> 1, iy >> 1, iz >> 1, 45) < 0.18) c = hash(ix, iy, iz, 46) < 0.5 ? 0x3e5028 : 0x4a5e30; // damp moss low down
  if (hash(ix, iy, iz, 47) < 0.006) c = hash(ix, iy, iz, 48) < 0.5 ? 0x7c8670 : 0x8e8a76;
  return c;
}

/** Timbers (posts, caps, a lagging board or two), duckboards, a chalk arrow, glowcaps, cobwebs: 1/32 m. */
function propGeometry() {
  const V = 32, S = 1 / V, B = PASSAGE.box, Y0 = 0;
  const nx = Math.round((B.x1 - B.x0) * V), nz = Math.round((PASSAGE.rockEnd - PASSAGE.townBack) * V) + 2, ny = Math.round(1.5 * V);
  const Z0 = PASSAGE.townBack - 0.03;
  const g = new VoxelGrid(nx, ny, nz), gl = new VoxelGrid(nx, ny, nz);
  const vx = (x) => Math.round((x - B.x0) * V), vz = (z) => Math.round((z - Z0) * V), vy = (y) => Math.round((y - Y0) * V);
  const wood = (base, along, seed) => (x, y, z) => {
    const a = along === 'y' ? y : along === 'x' ? x : z;
    const across = along === 'y' ? x + z : along === 'x' ? y + z : x + y;
    let c = mulc(base, 0.9 + hash(across, 1, seed, 51) * 0.14);
    if ((across + Math.floor(a / 11)) % 4 === 0 && hash(Math.floor(a / 6), across, seed, 52) < 0.7) c = mulc(c, 0.86); // grain
    if (hash(Math.floor(a / 3), across >> 1, seed, 53) < 0.03) c = mulc(base, 0.6); // a knot
    return c;
  };
  // the shoring sets
  frames().forEach((f, n) => {
    const seed = 60 + n;
    const post = wood(0x6a4a30, 'y', seed), cap = wood(0x5e4028, f.ax === 'x' ? 'x' : 'z', seed + 9);
    const capY = vy(1.0), capH = 4;
    for (const s of [-1, 1]) {
      // (set into the rock a little: the walls only ever wander outward from HW)
      const px = f.ax === 'x' ? f.x + s * (HW - 0.01) : f.x, pz = f.ax === 'x' ? f.z : f.z + s * (HW - 0.01);
      const lean2 = n % 2 ? 1 : 0; // (one post of each set sits a hair out of true)
      for (let y = 0; y < capY; y++) {
        const off = s > 0 && lean2 ? Math.round(y / 40) : 0;
        g.box(vx(px) - 2 + (f.ax === 'x' ? -off * s : 0), y, vz(pz) - 2 + (f.ax === 'z' ? -off * s : 0), 4, 1, 4, post);
      }
      // a wedge driven in under the cap, an iron dog nailed across the joint
      g.box(vx(px) - 2, capY - 2, vz(pz) - 2, 4, 2, 4, 0x8a6a48);
      if (n % 3 === 0) g.box(vx(px) - (f.ax === 'x' ? 0 : 2), capY - 3, vz(pz) - (f.ax === 'x' ? 2 : 0), f.ax === 'x' ? 1 : 4, 5, f.ax === 'x' ? 4 : 1, 0x2e2e36);
      // a stone footing
      g.box(vx(px) - 3, 0, vz(pz) - 3, 6, 2, 6, (x, y, z) => mulc(0x6e6a64, 0.9 + hash(x, y, z, 54) * 0.2));
    }
    // the cap across, its ends sunk into the rock
    const span = Math.round((HW + 0.06) * V);
    if (f.ax === 'x') g.box(vx(f.x) - span, capY, vz(f.z) - 2, span * 2, capH, 4, cap);
    else g.box(vx(f.x) - 2, capY, vz(f.z) - span, 4, capH, span * 2, cap);
    // lagging boards laid over the caps against the vault
    if (n === 1 || n === 3) {
      const boards = f.ax === 'x' ? [[vz(f.z) - 12, vz(f.z) + 12]] : [[vx(f.x) - 12, vx(f.x) + 12]];
      for (const [a0, a1] of boards) for (let a = a0; a < a1; a++) for (let w = -10; w < 10; w++) {
        if ((a - a0) % 6 === 5) continue;
        const c = mulc(0x7a5a3a, 0.88 + hash(Math.floor((a - a0) / 6), 0, n, 55) * 0.16);
        if (f.ax === 'x') g.set(vx(f.x) + w, capY + capH, a, c); else g.set(a, capY + capH, vz(f.z) + w, c);
      }
    }
  });
  // duckboards over the damp patch in the cross leg (three planks across two runners)
  const dbx = vx(5.05), dbz = vz(-6.6);
  for (const r of [-8, 8]) g.box(dbx - 18, 0, dbz + r - 1, 36, 1, 2, 0x4e3624);
  for (let p = 0; p < 6; p++) g.box(dbx - 17 + p * 6, 1, dbz - 11, 5, 1, 22, (x, y, z) => mulc(0x8a6a44, (0.86 + hash(p, 0, 3, 56) * 0.16) * (hash(x, z, 57, 58) < 0.04 ? 0.75 : 1)));
  // glowcaps in the damp foot of the walls, and a few stones
  const caps = [[6.95, -5.6], [6.12, -6.95], [4.75, -6.18], [3.14, -7.6], [3.95, -7.95], [5.6, -7.02]];
  caps.forEach(([x, z], n) => {
    const cx = vx(x), cz = vz(z);
    for (let k = 0; k < 3; k++) {
      const ox = cx + Math.round((hash(n, k, 1, 59) - 0.5) * 6), oz = cz + Math.round((hash(n, k, 2, 59) - 0.5) * 6), hh = 2 + Math.floor(hash(n, k, 3, 59) * 3);
      g.box(ox, 0, oz, 1, hh, 1, 0xd8ccb0);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(dx) + Math.abs(dz) < 2 || k === 0) gl.set(ox + dx, hh, oz + dz, (dx + dz) & 1 ? 0x5ad0e0 : 0x8ae8f0);
      gl.set(ox, hh + 1, oz, 0xd8faff);
    }
  });
  for (let k = 0; k < 14; k++) {
    const x = B.x0 + hash(k, 1, 0, 61) * (B.x1 - B.x0), z = PASSAGE.townBack + 0.2 + hash(k, 2, 0, 61) * (PASSAGE.rockEnd - PASSAGE.townBack - 0.2);
    if (!inPassage(x, z, 0.02) || inPassage(x, z, 0.16)) continue; // (along the foot of the walls)
    g.ellipsoid(vx(x), 0, vz(z), 2 + hash(k, 3, 0, 61) * 2, 1.5 + hash(k, 4, 0, 61) * 1.5, 2 + hash(k, 5, 0, 61) * 2, (x2, y2, z2) => mulc(0x6a6660, 0.85 + hash(x2, y2, z2, 62) * 0.25));
  }
  // an old pick leaned on a post in leg 3, its head on the floor
  {
    const bx = vx(3.55 + (HW - 0.2)), bz = vz(-7.62);
    for (let k = 0; k < 24; k++) g.set(bx + Math.round(k * 0.3), 2 + k, bz, k % 5 ? 0x8a6038 : 0x6a4628); // the haft, its top on the rock
    for (let k = -6; k <= 6; k++) { const y = 1 + Math.round(Math.abs(k) * 0.25); g.set(bx + 1, y, bz + k, Math.abs(k) > 4 ? 0x5c5c68 : 0x3a3a44); g.set(bx + 1, y + 1, bz + k, 0x4a4a54); }
    g.set(bx + 1, 3, bz, 0x24242a);
  }
  // a small crate tucked into the corner at the cross leg's west end, a candle stub on it
  {
    const cx0 = vx(3.12), cz0 = vz(-6.42);
    const plank = (x, y, z) => ((y - 0) % 5 === 4 ? 0x4e3624 : mulc(0x7a5634, 0.88 + hash(y >> 2, x + z, 0, 64) * 0.18));
    g.box(cx0, 0, cz0, 9, 9, 9, plank);
    for (const [x, z] of [[0, 0], [8, 0], [0, 8], [8, 8]]) g.box(cx0 + x, 0, cz0 + z, 1, 9, 1, 0x4e3624);
    g.box(cx0 + 3, 9, cz0 + 3, 2, 3, 2, 0xe8dcc0);
    gl.set(cx0 + 3, 12, cz0 + 3, 0xffd890);
  }
  // a board nailed to the cross leg's first south post with an arrow burnt into it: town's round
  // the next corner to the right (seen walking west from the burrow)
  {
    const px = vx(5.65) + 2, pz = vz(-6.6 + (HW - 0.01)), by0 = vy(0.5);
    g.box(px, by0, pz - 7, 2, 7, 11, (x, y, z) => mulc(0x9a7a52, 0.9 + hash(y, z >> 2, 0, 65) * 0.14));
    const ARROW = ['..#.....', '.##.....', '########', '.##.....', '..#.....'];
    // (on its east face: z runs to your right as you face west, so the head at the small z points
    // right, round the corner to the north)
    ARROW.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') g.set(px + 2, by0 + 5 - j, pz - 5 + i, 0x3a2414); });
    g.set(px + 2, by0 + 5, pz - 6, 0x8a8a94); g.set(px + 2, by0 + 5, pz + 2, 0x8a8a94); // nails
  }
  // cobwebs strung across the corners under the caps
  for (const [x, z, sx, sz] of [[7.02, -7.07, -1, 1], [3.08, -6.13, 1, -1], [6.08, -4.8, 1, -1]]) {
    const cx = vx(x), cz = vz(z), cy = vy(1.12);
    for (let i = 0; i < 10; i++) for (let j = 0; j < 10 - i; j++) {
      if (!((i + j) % 3 === 0 || i === j || (j === 0 && i % 2 === 0))) continue;
      if (hash(i, j, cx, 63) < 0.18) continue; // (torn here and there)
      g.set(cx + sx * Math.round(i * 0.75), cy - j, cz + sz * Math.round(i * 0.75), (i + j) % 2 ? 0xc8c8c0 : 0xa8a8a0);
    }
  }
  return {
    solid: meshFast(g, { scale: S, pivot: [-B.x0 * V, -Y0 * V, -Z0 * V], ao: true, shade: true }),
    glow: meshFast(gl, { scale: S, pivot: [-B.x0 * V, -Y0 * V, -Z0 * V], ao: false, shade: false }),
  };
}

/**
 * The two lanterns on iron hooks: 1/64 m (small things up close are finer). An iron cage (corner
 * posts, rails round the top and bottom and across the middle, a ring and a little pyramid roof),
 * panes lit from a candle inside (its flame's shape bright in the middle, warm toward the edges,
 * sooty at the top), the bracket plate pinned to the rock.
 */
function lanternGeometry() {
  const V = 64, S = 1 / V;
  const solids = [], glows = [];
  LANTERNS.forEach((L, n) => {
    const W = 18, H = 44, D = 22;
    const g = new VoxelGrid(W, H, D), gl = new VoxelGrid(W, H, D);
    const ir = (x, y, z) => (hash(x, y, z, 80 + n) > 0.965 ? 0x7a4228 : hash(x, y, z, 81) < 0.05 ? 0x4a4a54 : 0x2e2e36);
    const cx = 9, cz = 13; // the lantern's middle (x, z): z out from the rock
    // the plate on the rock with two rivets, the hook arm out to the ring
    g.box(cx - 3, 32, 0, 6, 8, 2, ir); g.set(cx - 2, 38, 2, 0x5c5c68); g.set(cx + 1, 33, 2, 0x5c5c68);
    for (let k = 0; k <= cz; k++) g.set(cx, 36 + (k < 3 ? 0 : k > cz - 3 ? -(k - (cz - 3)) : 0), 1 + k, ir(cx, 36, k));
    g.box(cx, 31, cz, 1, 3, 1, ir);
    // the roof: a little stepped pyramid with a ring on top
    for (let t = 0; t < 4; t++) g.box(cx - 5 + t, 26 + t, cz - 5 + t, 11 - t * 2, 1, 11 - t * 2, t === 0 ? 0x24242a : ir);
    g.box(cx - 1, 30, cz - 1, 3, 1, 3, 0x5c5c68);
    // the cage: corner posts, rails top, bottom and middle; the base
    for (const [x, z] of [[cx - 4, cz - 4], [cx + 4, cz - 4], [cx - 4, cz + 4], [cx + 4, cz + 4]]) g.box(x, 10, z, 1, 16, 1, ir);
    for (const y of [10, 17, 25]) {
      g.box(cx - 4, y, cz - 4, 9, 1, 1, ir); g.box(cx - 4, y, cz + 4, 9, 1, 1, ir);
      g.box(cx - 4, y, cz - 4, 1, 1, 9, ir); g.box(cx + 4, y, cz - 4, 1, 1, 9, ir);
    }
    g.box(cx - 4, 8, cz - 4, 9, 2, 9, ir); g.box(cx - 2, 6, cz - 2, 5, 2, 5, 0x24242a); g.set(cx, 5, cz, 0x24242a);
    // the panes: the flame's glow inside (bright tall middle, warm round it, sooty up top)
    for (let y = 11; y < 25; y++) for (let z = cz - 3; z <= cz + 3; z++) for (let x = cx - 3; x <= cx + 3; x++) {
      const face = Math.abs(x - cx) === 3 || Math.abs(z - cz) === 3;
      if (!face || y === 17) continue;
      const u = Math.abs(x - cx) === 3 ? z - cz : x - cx; // across the pane
      const fl = Math.abs(u) <= (y < 15 ? 1 : y < 20 ? 1 : 0) && y > 12 && y < 22; // the flame's shape
      let c = fl ? (y > 18 ? 0xfff6d0 : 0xffe9a0) : Math.abs(u) <= 1 ? 0xffc260 : 0xf09a3a;
      if (y >= 23) c = mixc(c, 0x6a4020, 0.55); // soot
      if (y <= 12 && !fl) c = mixc(c, 0x8a5020, 0.35);
      gl.set(x, y, z, c);
    }
    const sg = meshFast(g, { scale: S, pivot: [cx, 0, 0], ao: true, shade: true });
    const gg = meshFast(gl, { scale: S, pivot: [cx, 0, 0], ao: false, shade: false });
    // the plate's on the rock; z out of the rock along the wall's normal
    const m = new THREE.Matrix4().makeRotationY(Math.atan2(L.nx, L.nz)).setPosition(L.x - L.nx * 0.02, L.y - 26 * S, L.z - L.nz * 0.02);
    if (sg) solids.push(sg.applyMatrix4(m));
    if (gg) glows.push(gg.applyMatrix4(m));
  });
  return { solid: merge(solids), glow: merge(glows) };
}

/** Merge indexed geometries with position / normal / color. */
function merge(list) {
  list = list.filter(Boolean);
  if (!list.length) return null;
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.getAttribute('position').count; ni += g.index.count; }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), Ix = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    P.set(g.getAttribute('position').array, ov * 3); N.set(g.getAttribute('normal').array, ov * 3); C.set(g.getAttribute('color').array, ov * 3);
    const src = g.index.array;
    for (let i = 0; i < src.length; i++) Ix[oi + i] = src[i] + ov;
    ov += g.getAttribute('position').count; oi += src.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  out.setIndex(new THREE.BufferAttribute(Ix, 1));
  return out;
}
