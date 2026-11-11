// The title's mushroom cave: a great bioluminescent chamber under the forest, seen from a low brow
// of rock hung with roots and dripping stalactites. Giant glowcaps (pale fibrous stems with ring
// skirts and shelf fungi, domed caps with spots, a bright rim and glowing gills) light it in teal,
// violet, blue and rose; the floor is dark loam and moss with glowing mycelium threads round their
// feet, stalagmites, mossy boulders, crystal clusters, fallen roots and the mine's own cave plants
// (src/deep/veg: glowshrooms, puffballs, flowers, ferns, tufts; roots, vines, moss curtains and
// mycelium hanging from above; brackets on the walls). The walls rise in strata, streaked with
// flowstone and veins of glowing lichen; glowworms star the far roof. A still pool catches the
// drips (rings spread where they land); spores drift up from the gills; mist lies on the floor.
// Everything is voxels at the size rule's resolution (src/gfx/voxRes.js): the rock 1/8 m (as the
// mine's), the giants 1/16, furniture-sized things 1/32, plants and small things 1/56–1/64, and
// the ground under the nest 1/32 (the camera comes close there).
//
// Metres, y up; the camera looks north (-z) from z ≈ 4. Only what the title's cameras can see is
// built: buildCave({ view }) asks view.box(min, max) of every 1 m cell (and view.point for things).
//
//   CAVE.sign / CAVE.nest / CAVE.vista / CAVE.pool   the layout
//   floorH(x, z), ceilH(x, z)                        the rock's heights (analytic: no build needed)
//   CHASE_PATHS                                      the chase's two routes (titleChase.js)
//   const C = await buildCave({ lite, soft, view, cancel });  scene.add(C.group)
//   C.update(dt, camera, heightPx)   C.breakables   C.dispose()   C.stats
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VoxelGrid, meshRelief, hash3, fshade, fmix } from './vox.js';
import { voxelSizeFor } from '../gfx/voxRes.js';
import { makeNoise2D, makeRng, clamp } from '../core/util.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { MODELS, RAMP } from '../deep/veg/plants.js';
import { rng as vrng } from '../deep/veg/paint.js';
import { down2 } from '../deep/veg/vox.js';
import { makeBoulderGeo, makeRootArcGeo } from './forest/flora.js';
import { Particles, Twinkles, SHAPE } from './fx.js';
import { CF, caveToon, glowHex, lit, meshGlow, vgGeo, withGlow, makeMistSheet, GLOW } from './titleCaveFx.js';

const TAU = Math.PI * 2;
const tick = () => new Promise((r) => setTimeout(r, 0));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const tone = (R, t) => R[clamp(Math.round(t), 0, R.length - 1)];

// ------------------------------------------------------------------ layout
export const CAVE = {
  sign: { x: 1.55, z: 1.0 },
  nest: { x: -2.75, z: -1.2 },
  vista: new THREE.Vector3(-1.2, 1.9, -12),
  pool: { x: -1.4, z: -11.2, r: 2.4, level: -0.12 },
};
const CH = { cx: 0, cz: -9.5, rx: 13.6, rz: 19.5 };
/** The giant glowcaps: foot (x, z), height, cap radius, colour ramp. */
export const GIANTS = [
  { x: -6.5, z: -5.2, h: 5.0, R: 2.05, ramp: 'cyan', seed: 11 },
  { x: 7.1, z: -6.9, h: 4.3, R: 1.75, ramp: 'violet', seed: 23 },
  { x: 0.9, z: -17.0, h: 7.3, R: 2.9, ramp: 'blue', seed: 37 },
  { x: -8.2, z: -17.2, h: 6.1, R: 2.4, ramp: 'cyan', seed: 41 },
  { x: 8.9, z: -18.0, h: 5.7, R: 2.3, ramp: 'pink', seed: 53 },
  { x: -2.6, z: -25.0, h: 8.2, R: 3.1, ramp: 'violet', seed: 67 },
];
const LIGHT_OF = { cyan: 0x5ae8dc, violet: 0xa678ff, blue: 0x5a98ff, pink: 0xff70c0 };
/** The chase's routes (x, z): out of the dark past the great blue cap toward the camera, off to the
 * left; and in from the left, past the cyan giant and away into the dark at the back. Both keep to
 * the left of the screen (the signpost's boards fill the right). */
export const CHASE_PATHS = [
  [[3.7, -21.8], [2.9, -16.9], [2.0, -12.8], [0.7, -9.0], [-0.9, -6.6], [-2.9, -4.7], [-5.4, -3.5], [-8.6, -2.6]],
  [[-9.8, -2.5], [-6.6, -3.4], [-4.0, -5.6], [-3.5, -8.4], [-4.6, -11.6], [-5.6, -15.0], [-5.4, -19.0], [-4.5, -23.5]],
];
/** Things the chase knocks about: mid-size glowcaps (the raptor barges through) and puffballs. */
export const BREAK_SPOTS = [
  { kind: 'cap', x: 2.35, z: -15.2, h: 1.5, R: 0.7, ramp: 'violet', seed: 3 },
  { kind: 'cap', x: 3.4, z: -14.4, h: 1.0, R: 0.48, ramp: 'pink', seed: 5 },
  { kind: 'cap', x: -1.75, z: -7.45, h: 1.35, R: 0.64, ramp: 'cyan', seed: 7 },
  { kind: 'cap', x: -5.05, z: -6.0, h: 1.25, R: 0.6, ramp: 'blue', seed: 9 },
  { kind: 'cap', x: -4.35, z: -10.6, h: 1.0, R: 0.5, ramp: 'violet', seed: 11 },
  { kind: 'puff', x: 1.55, z: -10.6, seed: 13 },
  { kind: 'puff', x: -3.15, z: -5.25, seed: 15 },
  { kind: 'puff', x: -4.3, z: -8.6, seed: 17 },
];
/** Roots arching out of the floor across the routes (the mole hops them). */
export const ROOT_ARCS = [{ x: 0.05, z: -7.85, span: 2.0 }, { x: -3.72, z: -7.1, span: 1.9 }];

const nA = makeNoise2D(901), nB = makeNoise2D(902), nC = makeNoise2D(903), nD = makeNoise2D(904), nE = makeNoise2D(905);

// stalagmites (on the floor) and stalactites (hanging), placed once
const STALAG = [], STALACT = [];
{
  const r = makeRng(4242);
  const clear = (x, z) => {
    if (Math.hypot(x - CAVE.sign.x, z - CAVE.sign.z) < 2.5 || Math.hypot(x - CAVE.nest.x, z - CAVE.nest.z) < 2.6) return false;
    if (Math.hypot(x - CAVE.pool.x, z - CAVE.pool.z) < CAVE.pool.r + 0.6) return false;
    for (const G of GIANTS) if (Math.hypot(x - G.x, z - G.z) < 1.6) return false;
    for (const P of CHASE_PATHS) if (pathDist(P, x, z) < 1.6) return false;
    return true;
  };
  for (let i = 0; i < 70 && STALAG.length < 22; i++) {
    const x = r.range(-13, 13), z = r.range(-27, 2);
    if (!clear(x, z) || z > -2 && Math.abs(x) < 6) continue;
    STALAG.push({ x, z, h: r.range(0.5, 2.4), r: r.range(0.35, 0.8) });
  }
  STALAG.push({ x: -9.6, z: -7.2, h: 2.6, r: 0.8 }, { x: 10.4, z: -3.6, h: 2.2, r: 0.75 }, { x: 4.6, z: -13.2, h: 1.6, r: 0.55 }, { x: -11.2, z: -12.6, h: 3.4, r: 1.0 });
  // a thicket of them hanging off the brow over the front of the cave (the top of the menu's frame)
  for (let i = 0; i < 200 && STALACT.length < 34; i++) {
    const x = r.range(-12, 10), z = r.range(-10.5, -3.5);
    if (Math.abs(x - CAVE.sign.x) < 1.6 && z > -4.5) continue;
    STALACT.push({ x, z, h: r.range(0.35, 1.5), r: r.range(0.14, 0.42) });
  }
  for (let i = 0; i < 260 && STALACT.length < 100; i++) {
    const x = r.range(-14, 14), z = r.range(-30, 4);
    if (Math.abs(x - CAVE.sign.x) < 1.4 && Math.abs(z - CAVE.sign.z) < 2) continue;
    if (GIANTS.some((G) => Math.hypot(x - G.x, z - G.z) < G.R + 0.4)) continue;
    STALACT.push({ x, z, h: r.range(0.4, z > -6 ? 1.6 : 3.2), r: r.range(0.18, 0.55) });
  }
}

function pathDist(P, x, z) {
  let best = 1e9;
  for (let i = 0; i < P.length - 1; i++) {
    const [ax, az] = P[i], [bx, bz] = P[i + 1];
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L, 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
/** Distance to the nearer chase route (a 1/4 m table, sampled bilinearly). */
let PD = null;
const PDX0 = -19, PDZ0 = -35, PDS = 4, PDW = 39 * PDS, PDD = 46 * PDS;
function nearPath(x, z) {
  if (!PD) {
    PD = new Float32Array((PDW + 1) * (PDD + 1));
    for (let k = 0; k <= PDD; k++) for (let i = 0; i <= PDW; i++) {
      const px = PDX0 + i / PDS, pz = PDZ0 + k / PDS;
      PD[i + (PDW + 1) * k] = Math.min(pathDist(CHASE_PATHS[0], px, pz), pathDist(CHASE_PATHS[1], px, pz));
    }
  }
  const fx = clamp((x - PDX0) * PDS, 0, PDW - 0.001), fz = clamp((z - PDZ0) * PDS, 0, PDD - 0.001);
  const i = fx | 0, k = fz | 0, u = fx - i, v = fz - k, W1 = PDW + 1, q = i + W1 * k;
  return (PD[q] * (1 - u) + PD[q + 1] * u) * (1 - v) + (PD[q + W1] * (1 - u) + PD[q + W1 + 1] * u) * v;
}

function rimOf(x, z) {
  const dx = (x - CH.cx) / CH.rx, dz = (z - CH.cz) / CH.rz;
  const a = Math.atan2(dz, dx);
  const R = 1 + 0.07 * Math.sin(3 * a + 1.1) + 0.05 * Math.sin(5 * a + 2.3) + 0.06 * nC(x * 0.12, z * 0.12);
  return Math.hypot(dx, dz) / R;
}

/** The floor's height (m). */
export function floorH(x, z) {
  const r = rimOf(x, z);
  let y = nA(x * 0.16, z * 0.16) * 0.2 + nB(x * 0.55, z * 0.55) * 0.05;
  y += Math.pow(Math.max(0, r - 0.8), 1.5) * 26;
  const P = CAVE.pool, pd = Math.hypot((x - P.x) / P.r, (z - P.z) / (P.r * 0.72));
  if (pd < 1.35) y -= 0.36 * (1 - sm(0.45, 1.35, pd));
  // the routes are a little smoother (trodden)
  const pdist = nearPath(x, z);
  if (pdist < 1.2) y = y * (0.55 + 0.45 * sm(0.3, 1.2, pdist));
  for (const s of STALAG) {
    const dx = x - s.x, dz = z - s.z;
    if (dx > s.r || dx < -s.r || dz > s.r || dz < -s.r) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < s.r) y += s.h * Math.pow(1 - d / s.r, 1.7) * (1 + 0.15 * nD(x * 3, z * 3));
  }
  return Math.min(y, 14);
}

/** The roof's height (m). */
export function ceilH(x, z) {
  const r = rimOf(x, z);
  let y = 4.75 + 7.8 * sm(-5.5, -13.5, z) + nA(x * 0.2 + 5, z * 0.2) * 0.55 + nB(x * 0.7, z * 0.7) * 0.15;
  y -= Math.pow(Math.max(0, r - 0.6), 1.35) * 14;
  for (const s of STALACT) {
    const dx = x - s.x, dz = z - s.z;
    if (dx > s.r || dx < -s.r || dz > s.r || dz < -s.r) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < s.r) y -= s.h * Math.pow(1 - d / s.r, 1.9);
  }
  return y;
}

// ------------------------------------------------------------------ palettes
const ROCK = [0x1a1824, 0x221f2c, 0x2c2836, 0x363140, 0x423b4c, 0x52485a, 0x625868];
const SOIL = [0x1e1712, 0x271e17, 0x31261d, 0x3c2f24, 0x4a3a2c];
const FLOW = [0x5a5248, 0x6c6254, 0x807462, 0x988a74];
const STEM = [0x4a4254, 0x6a6074, 0x8a8092, 0xaaa0b0, 0xc8c0cc, 0xe2dce2, 0xf6f2f2];
const MOSS = RAMP.moss;

// ------------------------------------------------------------------ the rock (two heightfields)
const X0 = -18, X1 = 18, Z0 = -34, Z1 = 9;
const FBASE = -1.5, FUP = 1 / 16; // the floor: levels of 1/16 m up from -1.5
const CTOP = 16, CDN = 1 / 8; // the roof: levels of 1/8 m down from 16
/** The rock's regions: 1/16 m columns (the mine's own voxel) close to the cameras, 1/8 m across the chamber, 1/4 m out in the dark at the back. */
const REGIONS = [
  { kind: 'floor', x0: X0, x1: X1, z0: -6, z1: Z1, vs: 1 / 16 },
  { kind: 'floor', x0: X0, x1: X1, z0: -15, z1: -5.875, vs: 1 / 8 },
  { kind: 'floor', x0: X0, x1: X1, z0: Z0, z1: -14.75, vs: 1 / 4 },
  { kind: 'roof', x0: X0, x1: X1, z0: -10.5, z1: Z1, vs: 1 / 8 },
  { kind: 'roof', x0: X0, x1: X1, z0: Z0, z1: -10.25, vs: 1 / 4 },
];

/** Floor colours: loam, moss, pebbles, the trodden routes, mycelium round the giants; strata up the walls. */
function floorTopCol(x, z, y, slope) {
  const n = nA(Math.floor(x * 3) * 0.3, Math.floor(z * 3) * 0.3), n2 = nE(x * 0.35, z * 0.35);
  const cell = hash3(Math.floor(x * 2), 0, Math.floor(z * 2), 7);
  if (slope > 0.9 || y > 1.4) return wallCol(x, y, z);
  let c;
  if (n2 > 0.2 && slope < 0.5) c = tone(MOSS, 1.6 + Math.round(n * 2) * 0.8 + (cell < 0.2 ? 0.6 : 0));
  else c = tone(SOIL, 1.6 + Math.round(n * 2) + (cell < 0.25 ? -0.8 : 0));
  if (hash3(Math.floor(x * 8), 0, Math.floor(z * 8), 7) > 0.985) c = tone(ROCK, 4 + cell * 2); // pebbles
  const pd = nearPath(x, z);
  if (pd < 0.65) c = fmix(c, SOIL[0], 0.45);
  // mycelium threads round the giants' feet (and the pool's rim), glowing
  for (const G of GIANTS) {
    const dx = x - G.x, dz = z - G.z;
    if (Math.abs(dx) > 4.2 || Math.abs(dz) > 4.2) continue;
    const d = Math.hypot(dx, dz);
    if (d > 4.2 || d < 0.4) continue;
    const a = Math.atan2(dz, dx) + nB(x * 1.3, z * 1.3) * 0.5 + d * 0.15;
    const th = Math.abs(Math.sin(a * 7 + G.seed));
    if (th < 0.07 * (1.2 - d / 4.2) + 0.012) return glowHex(tone(RAMP[G.ramp], 4.6 - Math.round(d) * 0.4), d < 2.2 ? 2 : 1);
  }
  if (Math.abs(Math.hypot((x - CAVE.pool.x) / CAVE.pool.r, (z - CAVE.pool.z) / (CAVE.pool.r * 0.72)) - 1.05) < 0.05 && cell < 0.5) return glowHex(tone(RAMP.cyan, 4), 1);
  return lit(c);
}
/** Rock up the walls: strata, flowstone curtains, wet streaks, veins of glowing lichen. */
let wcKey = NaN, wcN = 0, wcFl = 0, wcCol = 0, wcPh = 0, wcLi = 0;
function wallCol(x, y, z) {
  // (per column: the strata's offset, flowstone or a wet streak, the veins' phase)
  const key = Math.floor(x * 8) * 4099 + Math.floor(z * 8);
  if (key !== wcKey) {
    wcKey = key;
    wcN = nC(x * 0.2, z * 0.2) * 2.5;
    wcCol = Math.floor(x * 3) * 31 + Math.floor(z * 3) * 17;
    wcFl = hash3(wcCol, 3, 0, 11);
    wcPh = nB(x * 0.5, z * 0.5) * 3;
    wcLi = nE(x * 0.13 + 3, z * 0.13 - 2);
  }
  const band = Math.floor(y * 2.6 + wcN);
  const b4 = ((band % 4) + 4) % 4;
  let c = ROCK[2 + (b4 === 1 ? 1 : b4 === 3 ? -1 : 0) + (Math.sin(y * 1.9 + wcPh) > 0.45 ? 1 : 0)];
  if (wcFl < 0.08) c = tone(FLOW, 1 + hash3(wcCol, Math.floor(y * 1.5), 0, 12) * 2.5); // flowstone curtain
  else if (wcFl > 0.94) c = fshade(c, 0.7); // a wet streak
  // glowing lichen in a few patches, veining down the cracks there
  if (wcLi > 0.3 && y > 0.6) {
    const v = Math.sin(x * 1.3 + z * 0.9 + y * 1.7 + wcPh * 2) * Math.sin(x * 0.7 - z * 1.1 - y * 0.8 + wcPh);
    if (Math.abs(v) < 0.03 * (wcLi - 0.3) * 3) return glowHex(tone(RAMP.cyan, 4 + (v > 0 ? 1 : 0)), 2);
    if (hash3(Math.floor(x * 8), Math.floor(y * 8), Math.floor(z * 8), 13) < 0.02) return glowHex(tone(RAMP.violet, 5), 3);
  }
  return lit(c);
}
/** The roof: dark rock, roots near the brow, pale wet stalactite tips, glowworms. */
function roofCol(x, y, z, depth) {
  let c = ROCK[1 + (nB(x * 0.6, z * 0.6) > 0.2 ? 1 : 0) + (Math.floor(y * 2) % 3 === 0 ? 1 : 0)];
  if (depth > 0.5) c = tone(FLOW, depth > 1.2 ? 3 : 1.5 + hash3(Math.floor(x * 8), Math.floor(y * 8), Math.floor(z * 8), 3));
  if (z > -7 && nE(x * 0.4, z * 0.4) > 0.15) c = tone(SOIL, 2 + nA(x * 2, z * 2) * 2);
  if (y > 7.5 && hash3(Math.floor(x * 8), 5, Math.floor(z * 8), 17) < 0.012) return glowHex(hash3(Math.floor(x * 8), 6, Math.floor(z * 8), 18) < 0.6 ? 0xa8f4ff : 0x7ac8ff, 3);
  return lit(c);
}

/**
 * Mesh a heightfield (floor or roof) a chunk at a time, culled to what the cameras see, with
 * each quad's glow decoded from the colour functions.
 */
function reliefChunks(o, colTop, colSide, keep, out, stats) {
  const { W, D, h, top, O, U, V, N } = o;
  const CK = 48;
  const uu = Math.hypot(...U), nn = Math.hypot(...N);
  const Un = U.map((v) => v / uu), Vn = V.map((v) => v / uu), Nn = N.map((v) => v / nn);
  for (let k0 = 0; k0 < D; k0 += CK) for (let i0 = 0; i0 < W; i0 += CK) {
    let any = false;
    for (let k = k0; k < Math.min(D, k0 + CK) && !any; k++) for (let i = i0; i < Math.min(W, i0 + CK); i++) if (h[i + W * k] && top[i + W * k]) { any = true; break; }
    if (!any) continue;
    const geo = meshRelief({ W, D, h, top, side: colSide, origin: O, U, V, N, rows: [k0, k0 + CK], cols: [i0, i0 + CK] });
    const P = geo.attributes.position.array, Nr = geo.attributes.normal.array;
    const nv = P.length / 3;
    if (!nv) { geo.dispose(); continue; }
    const g = new Float32Array(nv);
    for (let v = 0; v < nv; v += 4) {
      let cx = 0, cy = 0, cz = 0;
      for (let q = 0; q < 4; q++) { cx += P[(v + q) * 3]; cy += P[(v + q) * 3 + 1]; cz += P[(v + q) * 3 + 2]; }
      cx /= 4; cy /= 4; cz /= 4;
      const n0 = Nr[v * 3], n1 = Nr[v * 3 + 1], n2 = Nr[v * 3 + 2];
      const capQ = n0 * Nn[0] + n1 * Nn[1] + n2 * Nn[2] > 0.9;
      let px = cx - O[0], py = cy - O[1], pz = cz - O[2];
      if (!capQ) { px -= n0 * 0.5 * uu; py -= n1 * 0.5 * uu; pz -= n2 * 0.5 * uu; }
      const i = Math.floor((px * Un[0] + py * Un[1] + pz * Un[2]) / uu), k = Math.floor((px * Vn[0] + py * Vn[1] + pz * Vn[2]) / uu);
      if (i < 0 || k < 0 || i >= W || k >= D) continue;
      const q = i + W * k;
      let raw;
      if (capQ) raw = top[q];
      else {
        const l = Math.floor((px * Nn[0] + py * Nn[1] + pz * Nn[2]) / nn);
        const dir = Math.abs(n0 * Un[0] + n1 * Un[1] + n2 * Un[2]) > 0.9 ? (n0 * Un[0] + n1 * Un[1] + n2 * Un[2] < 0 ? 0 : 1) : (n0 * Vn[0] + n1 * Vn[1] + n2 * Vn[2] < 0 ? 2 : 3);
        raw = colSide(q, l, dir);
      }
      const lv = raw & 3;
      if (lv) { const s = GLOW[lv]; g[v] = s; g[v + 1] = s; g[v + 2] = s; g[v + 3] = s; }
    }
    geo.setAttribute('aGlow', new THREE.BufferAttribute(g, 1));
    stats.reliefQuads += nv / 4;
    out.push(geo);
  }
  void keep;
}

/** Build one region of the floor or the roof (culled to the 1 m cells the cameras see). */
function reliefRegion(RG, view, stats) {
  const tR0 = performance.now();
  const vs = RG.vs, W = Math.round((RG.x1 - RG.x0) / vs), D = Math.round((RG.z1 - RG.z0) / vs);
  const floor = RG.kind === 'floor';
  const h = new Int32Array(W * D), top = new Uint32Array(W * D), fH = new Float32Array(W * D).fill(NaN);
  const cw = Math.round(1 / vs);
  const nest = CAVE.nest;
  const colX = (i) => RG.x0 + (i + 0.5) * vs, colZ = (k) => RG.z0 + (k + 0.5) * vs;
  const cells = [];
  for (let ck = 0; ck < D; ck += cw) for (let ci = 0; ci < W; ci += cw) {
    const x0 = RG.x0 + ci * vs, z0 = RG.z0 + ck * vs;
    let fmin = 1e9, fmax = -1e9, cmin = 1e9, cmax = -1e9;
    for (const [sx, sz] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]]) {
      const f = floorH(x0 + sx, z0 + sz), c = ceilH(x0 + sx, z0 + sz);
      fmin = Math.min(fmin, f); fmax = Math.max(fmax, f); cmin = Math.min(cmin, c); cmax = Math.max(cmax, c);
    }
    const see = floor
      ? view.box(x0 - 0.3, fmin - 0.6, z0 - 0.3, x0 + 1.3, Math.min(fmax + 2.6, Math.max(cmax, fmax + 0.5)), z0 + 1.3)
      : cmin >= fmax + 0.2 && view.box(x0 - 0.3, Math.max(cmin - 0.4, fmin), z0 - 0.3, x0 + 1.3, cmax + 0.4, z0 + 1.3);
    if (see) cells.push([ci, ck]);
  }
  if (floor) {
    for (const [ci, ck] of cells) for (let k = Math.max(0, ck - 1); k < Math.min(D, ck + cw + 1); k++) for (let i = Math.max(0, ci - 1); i < Math.min(W, ci + cw + 1); i++) {
      const q = i + W * k;
      if (Number.isNaN(fH[q])) fH[q] = floorH(colX(i), colZ(k));
    }
    for (const [ci, ck] of cells) for (let k = ck; k < Math.min(D, ck + cw); k++) for (let i = ci; i < Math.min(W, ci + cw); i++) {
      const q = i + W * k, x = colX(i), z = colZ(k), f = fH[q];
      if (Math.hypot(x - nest.x, z - nest.z) <= 1.95) continue; // (the finer ground under the nest takes over)
      h[q] = Math.max(1, Math.round((f - FBASE) / FUP));
      const at = (qq) => (Number.isNaN(fH[qq]) ? f : fH[qq]);
      const s = (Math.abs(at(q + 1) - at(q - 1)) + Math.abs(at(q + W) - at(q - W))) / (2 * vs) * 0.5;
      top[q] = floorTopCol(x, z, FBASE + h[q] * FUP, s) || 0x10;
    }
  } else {
    for (const [ci, ck] of cells) for (let k = ck; k < Math.min(D, ck + cw); k++) for (let i = ci; i < Math.min(W, ci + cw); i++) {
      const q = i + W * k, x = colX(i), z = colZ(k);
      const c = ceilH(x, z);
      if (c <= floorH(x, z)) continue;
      h[q] = Math.max(1, Math.round((CTOP - c) / CDN));
      const y = CTOP - h[q] * CDN;
      top[q] = roofCol(x, y, z, Math.max(0, domeH(z) - y - 0.6)) || 0x10;
    }
  }
  const side = floor
    ? (q, level, dir) => {
      const i = q % W, k = (q - i) / W;
      const x = RG.x0 + (i + 0.5 + (dir === 0 ? -0.5 : dir === 1 ? 0.5 : 0)) * vs, z = RG.z0 + (k + 0.5 + (dir === 2 ? -0.5 : dir === 3 ? 0.5 : 0)) * vs;
      const y = FBASE + (level + 0.5) * FUP;
      if (h[q] * FUP + FBASE - y < 0.07 && y < 1.2) return top[q] & 0xfffffc; // a lip of the cap's own colour
      return wallCol(x, y, z);
    }
    : (q, level) => {
      const i = q % W, k = (q - i) / W;
      const x = colX(i), z = colZ(k), y = CTOP - (level + 0.5) * CDN;
      return roofCol(x, y, z, Math.max(0, domeH(z) - y - 0.6));
    };
  const out = [];
  stats.rH = (stats.rH || 0) + (performance.now() - tR0);
  const tR1 = performance.now();
  reliefChunks({ W, D, h, top, O: [RG.x0, floor ? FBASE : CTOP, RG.z0], U: [vs, 0, 0], V: [0, 0, vs], N: [0, floor ? FUP : -CDN, 0] }, null, side, null, out, stats);
  stats.rM = (stats.rM || 0) + (performance.now() - tR1);
  return out;
}
const domeH = (z) => 4.75 + 7.8 * sm(-5.5, -13.5, z);

// ------------------------------------------------------------------ the giants
/**
 * A giant glowcap at 1/k m voxels: a fibrous stem (bent, flared foot, ring scars, glowing veins, a
 * drooping ring skirt), a domed cap (wobbling rim, banded, pale glowing spots, a bright rim) with
 * glowing gills underneath and threads of slime hanging off the rim. split: the cap as its own
 * mesh (for the ones the chase knocks about). Returns { geo | stem, cap, capY (m), light (m) }.
 */
function giantGeo(G, k = 16, split = false) {
  const CR = RAMP[G.ramp];
  const rng = makeRng(G.seed * 977 + 13);
  const hV = Math.round(G.h * k), RV = G.R * k;
  const capH = Math.max(4, Math.round(RV * 0.52));
  const r0 = Math.max(2.2, (0.16 + G.R * 0.075) * k);
  const W = Math.ceil(RV * 2 + r0 * 2 + 10), D = W, BUR = 4;
  const H = hV + capH + BUR + 4;
  const cx = W / 2, cz = D / 2;
  const stem = new VoxelGrid(W, H, D), cap = split ? new VoxelGrid(W, H, D) : stem;
  const bx = rng.range(-1, 1), bz = rng.range(-1, 1);
  const axis = (y) => { const t = Math.max(0, y - BUR) / hV; return [cx + Math.sin(t * 2.3) * bx * r0 * 0.9, cz + Math.sin(t * 1.8 + 0.4) * bz * r0 * 0.9]; };
  const capBase = BUR + hV - Math.round(capH * 0.3);
  const [tx, tz] = axis(capBase);
  const ringY = BUR + Math.round(hV * 0.68);
  const nf = 9 + Math.round(r0);
  // ---- stem
  for (let y = 0; y <= capBase + Math.round(capH * 0.45); y++) {
    const yy = y - BUR, t = Math.max(0, yy) / hV;
    const [ax, az] = axis(y);
    let r = r0 * (1 - t * 0.2) + Math.pow(Math.max(0, 1 - yy / (0.5 * k)), 2) * r0 * 1.2;
    r *= 1 + 0.05 * Math.sin(y * 0.45 + G.seed);
    for (let z = Math.floor(az - r - 1); z <= Math.ceil(az + r + 1); z++) for (let x = Math.floor(ax - r - 1); x <= Math.ceil(ax + r + 1); x++) {
      const dx = x + 0.5 - ax, dz = z + 0.5 - az, d = Math.hypot(dx, dz);
      if (d > r) continue;
      const a = Math.atan2(dz, dx);
      const fib = Math.floor(((a + Math.PI) / TAU) * nf);
      let c = tone(STEM, 2.6 + (fib % 2 ? 0.7 : 0) + Math.floor(t * 3) * 0.45 - (yy < 0.35 * k ? 1 : 0));
      if (y % Math.round(0.55 * k) === 0) c = tone(STEM, 2);
      if (hash3(fib, y >> 3, 0, G.seed) < 0.06) c = tone(STEM, 1.6);
      let gl = 0;
      // glowing veins spiralling up
      if (Math.abs(Math.sin(a * 3 + y * 0.09 + G.seed)) < 0.08 && yy > 0.3 * k) { c = tone(CR, 4.5); gl = 1; }
      // damp moss low on the stem
      if (yy < 0.3 * k && hash3(x, y, z, G.seed + 1) < 0.55 - yy / (0.6 * k)) c = tone(MOSS, 1.5 + hash3(x, y, z, 3) * 2);
      stem.set(x, y, z, gl ? glowHex(c, gl) : lit(c));
    }
  }
  // roots flaring into the floor
  for (let j = 0; j < 7; j++) {
    const a = (j / 7) * TAU + rng.range(-0.3, 0.3), L = r0 * rng.range(2.4, 3.6);
    for (let s = 0; s < L; s += 0.5) {
      const rr = r0 * 0.8 + s, y = BUR + 1 - s * 0.35;
      const w = Math.max(0.6, 1.6 * (1 - s / L) * (r0 / 4));
      for (let dz = -w; dz <= w; dz++) for (let dx = -w; dx <= w; dx++) stem.set(cx + Math.cos(a) * rr + dx, y, cz + Math.sin(a) * rr + dz, lit(tone(STEM, 1.8 + (s / L) * -0.5)));
    }
  }
  // the ring skirt: a frilled ring drooping round the stem
  {
    const [ax, az] = axis(ringY);
    const rIn = r0 * 0.9, rOut = r0 + Math.max(2, r0 * 0.75);
    for (let z = Math.floor(az - rOut - 1); z <= Math.ceil(az + rOut + 1); z++) for (let x = Math.floor(ax - rOut - 1); x <= Math.ceil(ax + rOut + 1); x++) {
      const d = Math.hypot(x + 0.5 - ax, z + 0.5 - az), a = Math.atan2(z - az, x - ax);
      const ro = rOut * (1 + 0.12 * Math.sin(a * 7 + G.seed));
      if (d < rIn || d > ro) continue;
      const droop = Math.round(((d - rIn) / (ro - rIn)) ** 1.5 * 3);
      stem.set(x, ringY - droop, z, d > ro - 1 ? glowHex(tone(STEM, 5), 1) : lit(tone(STEM, 4)));
      if (droop > 1 && hash3(x, 0, z, G.seed + 4) < 0.3) stem.set(x, ringY - droop - 1, z, lit(tone(STEM, 3.5)));
    }
  }
  // ---- the cap
  const p1 = rng() * TAU, p2 = rng() * TAU, nG = Math.round(RV * 0.9);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - tx, dz = z + 0.5 - tz, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    const R = RV * (1 + 0.07 * Math.sin(3 * a + p1) + 0.045 * Math.sin(7 * a + p2));
    if (d > R) continue;
    const u = d / R;
    const yt = capBase + Math.round(capH * Math.pow(Math.max(0, 1 - u * u), 0.62));
    let yb = capBase + Math.round(capH * 0.32 * (1 - u));
    if (u > 0.9) yb = Math.max(capBase - 1, yt - 2);
    const gillA = ((a + Math.PI) / TAU) * nG;
    const gill = (gillA - Math.floor(gillA)) < 0.5;
    for (let y = yb - (gill && u < 0.9 && u > 0.12 ? 1 : 0); y <= yt; y++) {
      let c, gl = 1;
      if (y <= yb) {
        // the gills: glowing blades, darker between them
        c = gill ? tone(CR, 5 - u) : tone(CR, 2.6);
        gl = gill ? 3 : 2;
      } else if (u > 0.88) { c = tone(CR, 5.2); gl = 2; } // the bright rim
      else {
        const band = Math.floor(u * 5 + Math.sin(a * 3 + p1) * 0.3);
        c = tone(CR, 2.4 + u * 2 + (band % 2 ? 0.5 : 0) + (y === yt ? 0.4 : 0));
        if (y === yt && hash3(x >> 2, 0, z >> 2, G.seed + 7) < 0.13 && u > 0.18 && u < 0.82) { c = tone(CR, 6); gl = 2; }
      }
      cap.set(x, y, z, glowHex(c, gl));
    }
    // the spots stand proud of the cap
    if (hash3(x >> 2, 0, z >> 2, G.seed + 7) < 0.13 && u > 0.18 && u < 0.82 && ((x & 3) === 1 || (z & 3) === 2)) cap.set(x, yt + 1, z, glowHex(tone(CR, 6), 2));
  }
  // slime threads off the rim
  for (let j = 0; j < Math.round(RV * 0.35); j++) {
    const a = rng() * TAU, x = Math.round(tx + Math.cos(a) * (RV - 1.5)), z = Math.round(tz + Math.sin(a) * (RV - 1.5));
    const L = rng.int(2, Math.max(3, Math.round(k * 0.35)));
    for (let s = 1; s <= L; s++) cap.set(x, capBase - 1 - s, z, glowHex(s === L ? tone(CR, 6) : tone(CR, 4.5), s === L ? 3 : 2));
  }
  const pivot = [cx, BUR, cz];
  const capY = (capBase - BUR) / k;
  const light = new THREE.Vector3((tx - cx) / k, capY - 0.25, (tz - cz) / k);
  const axisAt = (ym) => { const [ax, az] = axis(BUR + ym * k); return [(ax - cx) / k, (az - cz) / k]; };
  if (!split) return { geo: meshGlow(stem, { scale: 1 / k, pivot }), capY, light, top: (capBase + capH - BUR) / k, axisAt, rStem: r0 / k };
  // the cap's mesh pivots at the top of the stem
  const cpv = [tx, capBase, tz];
  return { stem: meshGlow(stem, { scale: 1 / k, pivot }), cap: meshGlow(cap, { scale: 1 / k, pivot: cpv }), capAt: new THREE.Vector3((tx - cx) / k, capY, (tz - cz) / k), capY, light, top: (capBase + capH - BUR) / k };
}

// ------------------------------------------------------------------ crystals, shelves
/** A cluster of glowing crystals (hexagonal prisms with pointed tips) on a rough foot, 1/k m. */
function crystalGeo(seed, { h = 1.0, n = 6, ramp = RAMP.violet, k = 32 } = {}) {
  const rng = makeRng(seed * 31 + 7);
  const S = Math.ceil(h * k * 1.5) + 6, W = S, D = S, H = Math.ceil(h * k) + 4;
  const g = new VoxelGrid(W, H, D);
  const cx = W / 2, cz = D / 2;
  // the rocky foot it grows from
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / (W * 0.3);
    if (d > 1) continue;
    const top = Math.round((1 - d * d) * 3 + hash3(x >> 1, 0, z >> 1, seed) * 1.5);
    for (let y = 0; y <= top; y++) g.set(x, y, z, lit(tone(ROCK, 2 + (y === top ? 1.5 : 0))));
  }
  for (let i = 0; i < n; i++) {
    const big = i === 0;
    const a = rng() * TAU, tilt = big ? rng.range(0, 0.15) : rng.range(0.25, 0.7);
    const L = (big ? h : h * rng.range(0.35, 0.75)) * k, r = (big ? 0.11 : rng.range(0.05, 0.09)) * k * (h / 1.0) + 1;
    const ax = Math.sin(tilt) * Math.cos(a), ay = Math.cos(tilt), az = Math.sin(tilt) * Math.sin(a);
    const ox = cx + (big ? 0 : Math.cos(a) * rng.range(1, 3)), oz = cz + (big ? 0 : Math.sin(a) * rng.range(1, 3)), oy = 2;
    // a frame across the axis
    const ux = -az, uz = ax, ul = Math.hypot(ux, uz) || 1;
    const U = [ux / ul, 0, uz / ul], Vv = [ay * U[2] * 0 - az * 0, 0, 0];
    Vv[0] = ay * U[2]; Vv[1] = az * U[0] - ax * U[2]; Vv[2] = -ay * U[0];
    const ex = [ox, ox + ax * L], ey = [oy, oy + ay * L], ez = [oz, oz + az * L], pr = r + 2;
    for (let z = Math.floor(Math.min(...ez) - pr); z <= Math.ceil(Math.max(...ez) + pr); z++) for (let y = Math.max(0, Math.floor(Math.min(...ey) - pr)); y <= Math.min(H - 1, Math.ceil(Math.max(...ey) + pr)); y++) for (let x = Math.floor(Math.min(...ex) - pr); x <= Math.ceil(Math.max(...ex) + pr); x++) {
      const px = x + 0.5 - ox, py = y + 0.5 - oy, pz = z + 0.5 - oz;
      const t = px * ax + py * ay + pz * az;
      if (t < -1 || t > L) continue;
      const u = px * U[0] + pz * U[2], v = px * Vv[0] + py * Vv[1] + pz * Vv[2];
      const tipK = t > L * 0.72 ? 1 - (t - L * 0.72) / (L * 0.28) : 1;
      const rr = r * tipK;
      const hex = Math.max(Math.abs(u) * 0.87 + Math.abs(v) * 0.5, Math.abs(v));
      if (hex > rr) continue;
      const edge = hex > rr - 1;
      const face = (u > 0 ? 1 : 0) + (v > 0 ? 2 : 0);
      let c = tone(ramp, 3 + (face === 2 ? 1 : face === 1 ? -0.5 : 0) + t / L * 1.5 + (edge ? 1 : 0));
      let gl = edge ? 2 : 1;
      if (hex < rr * 0.4 && t > L * 0.15) { c = tone(ramp, 6); gl = 3; }
      if (t < 2) { c = tone(ramp, 2); gl = 0; }
      g.set(x, y, z, gl ? glowHex(c, gl) : lit(c));
    }
  }
  return meshGlow(g, { scale: 1 / k, pivot: [cx, 2, cz] });
}

/** Big shelf fungi stacked on a wall (they grow out along +z), gills glowing underneath, 1/k m. */
function shelfGeo(seed, { w = 0.9, ramp = RAMP.amber, k = 32 } = {}) {
  const rng = makeRng(seed * 13 + 1);
  const W = Math.ceil(w * k) + 6, H = Math.ceil(w * k * 1.1) + 4, D = Math.ceil(w * k * 0.6) + 3;
  const g = new VoxelGrid(W, H, D);
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const R0 = (w * k / 2) * (1 - i * 0.18) * rng.range(0.8, 1), out = R0 * rng.range(0.6, 0.78);
    const x0 = W / 2 + rng.range(-W * 0.18, W * 0.18), y0 = 2 + i * (H / (n + 0.6)) + rng.range(0, 2);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - x0) / R0, dz = (z + 0.5) / out, a = Math.atan2(dz, dx);
      const rr = 1 + 0.1 * Math.sin(a * 6 + i);
      const d = Math.hypot(dx, dz);
      if (d > rr) continue;
      const th = Math.max(1, Math.round((1 - d / rr) * 3));
      const rim = d > rr - 0.14;
      for (let t = 0; t < th; t++) {
        const y = Math.round(y0 + t - d * 1.2);
        const band = Math.floor(d * 5);
        g.set(x, y, z, rim ? glowHex(tone(ramp, 5), 2) : lit(tone(ramp, 2.2 + (band % 2) * 0.7 + t * 0.4)));
      }
      // the gills underneath
      if (!rim && d > 0.15) g.set(x, Math.round(y0 - d * 1.2) - 1, z, glowHex(tone(ramp, (Math.floor(a * 9) & 1) ? 4.5 : 3), (Math.floor(a * 9) & 1) ? 2 : 1));
    }
  }
  return meshGlow(g, { scale: 1 / k, pivot: [W / 2, 0, 0] });
}

// ------------------------------------------------------------------ water
const WATER_VERT = /* glsl */`
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uGlowA;
uniform vec3 uGlowB;
uniform vec4 uRip[4];
uniform vec3 fogColor;
uniform float fogDensity;
varying vec3 vW;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float wh(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5); }
void main() {
  vec2 c = floor(vW.xz * 16.0) / 16.0;
  vec3 V = normalize(cameraPosition - vW);
  float fr = pow(1.0 - clamp(V.y, 0.0, 1.0), 2.4);
  // the glowcaps' light lying on the water in slow-moving bands
  float b = sin(c.x * 3.1 + uTime * 0.35 + sin(c.y * 2.3 + uTime * 0.2) * 1.4) * 0.5 + 0.5;
  vec3 col = uDeep + mix(uGlowA, uGlowB, b) * (0.18 + fr * 0.9);
  float spark = step(0.985, wh(c + floor(uTime * 1.7))) * (0.6 + fr);
  col += uGlowA * spark * 0.8;
  for (int i = 0; i < 4; i++) {
    vec4 r = uRip[i];
    float age = uTime - r.z;
    if (age < 0.0 || age > 2.4 || r.w <= 0.0) continue;
    float rad = age * 0.55;
    float d = length(c - r.xy);
    float ring = (1.0 - smoothstep(0.0, 0.07, abs(d - rad))) + (1.0 - smoothstep(0.0, 0.05, abs(d - rad * 0.6))) * 0.5;
    col += uGlowA * ring * (1.0 - age / 2.4) * r.w * 0.9;
  }
  float q = floor(dot(col, vec3(0.3, 0.5, 0.2)) * 9.0 + bayer4(gl_FragCoord.xy)) / 9.0;
  col *= q / max(0.001, dot(col, vec3(0.3, 0.5, 0.2)));
  float dist = length(vW - cameraPosition);
  float f = 1.0 - exp(-fogDensity * fogDensity * dist * dist);
  f = floor(f * 12.0 + bayer4(gl_FragCoord.xy)) / 12.0;
  gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
}`;

// ------------------------------------------------------------------ build
/**
 * Build the cave. o: { lite, soft, view: { box(x0, y0, z0, x1, y1, z1) → bool, point(x, y, z, r) → bool },
 * cancel() → bool }.
 */
export async function buildCave(o = {}) {
  const t0 = performance.now();
  const lite = !!o.lite, soft = !!o.soft;
  const view = o.view || { box: () => true, point: () => true };
  const cancel = o.cancel || (() => false);
  const stats = { reliefQuads: 0, models: 0, ms: 0, tris: 0, giantsMs: 0 };
  const group = new THREE.Group();
  group.name = 'cave';
  const geos = [], mats = new Set();
  const matRock = caveToon({ key: 'rock' }), matPlant = caveToon({ key: 'plant' }), matHang = caveToon({ sway: 0.05, key: 'hang' });
  mats.add(matRock).add(matPlant).add(matHang);
  const addMesh = (geo, mat, outline = true, name = '') => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    if (outline) m.layers.enable(LAYER_OUTLINE);
    group.add(m);
    geos.push(geo);
    return m;
  };

  // ---- 1. the floor and the roof, culled to the 1 m cells the cameras can see
  const nest = CAVE.nest;
  const tr = performance.now();
  // (lite: no 1/16 m ground; the 1/8 m reaches right up to the cameras)
  const regions = lite ? REGIONS.filter((RG) => RG.vs > 1 / 16).map((RG) => (RG.kind === 'floor' && RG.vs === 1 / 8 ? { ...RG, z1: Z1 } : RG)) : REGIONS;
  for (const RG of regions) {
    // (out at the back the post's outlines have faded: the far rock stays off the outline pass)
    reliefRegion(RG, view, stats).forEach((g) => addMesh(g, matRock, RG.vs < 1 / 4, RG.kind));
    await tick();
    if (cancel()) return { cancelled: true };
  }

  stats.reliefMs = Math.round(performance.now() - tr);
  // ---- 2. the finer ground under the nest (1/32 m: the camera comes close)
  {
    const k = 32, R = 2.25, n = Math.ceil(R * 2 * k);
    const ox = nest.x - R, oz = nest.z - R;
    const h = new Int32Array(n * n), top = new Uint32Array(n * n);
    for (let kk = 0; kk < n; kk++) for (let i = 0; i < n; i++) {
      const x = ox + (i + 0.5) / k, z = oz + (kk + 0.5) / k;
      const d = Math.hypot(x - nest.x, z - nest.z);
      if (d > R - 0.02 * hash3(i, 0, kk, 3)) continue;
      const y = floorH(x, z) + 0.01;
      const q = i + n * kk;
      h[q] = Math.round((y + 1) * k);
      const nn = nA(x * 2.2, z * 2.2), cell = hash3(i >> 1, 0, kk >> 1, 5);
      let c = nE(x * 0.9, z * 0.9) > -0.1 ? tone(MOSS, 1.8 + nn * 2.2 + (cell < 0.15 ? 0.8 : 0)) : tone(SOIL, 1.8 + nn * 2);
      if (cell > 0.97) c = tone(ROCK, 4.5);
      let raw = lit(c);
      const a = Math.atan2(z - nest.z, x - nest.x);
      if (Math.abs(Math.sin(a * 5 + d * 2.4 + nB(x * 3, z * 3) * 0.6)) < 0.05 && d > 0.9) raw = glowHex(tone(RAMP.cyan, 4.5), 1);
      top[q] = raw;
    }
    const geo = meshRelief({ W: n, D: n, h, top, origin: [ox, -1, oz], U: [1 / k, 0, 0], V: [0, 0, 1 / k], N: [0, 1 / k, 0], side: (q, level) => { const i = q % n, kk = (q - i) / n; return lit(wallCol(ox + i / k, -1 + level / k, oz + kk / k) & 0xfffffc); } });
    // glow from the cap colours
    const P = geo.attributes.position.array, Nr = geo.attributes.normal.array, nv = P.length / 3, gA = new Float32Array(nv);
    for (let v = 0; v < nv; v += 4) {
      if (Nr[v * 3 + 1] < 0.9) continue;
      let cx = 0, cz = 0;
      for (let q = 0; q < 4; q++) { cx += P[(v + q) * 3]; cz += P[(v + q) * 3 + 2]; }
      const i = Math.floor((cx / 4 - ox) * k), kk = Math.floor((cz / 4 - oz) * k);
      const raw = top[i + n * kk] || 0;
      if (raw & 3) gA[v] = gA[v + 1] = gA[v + 2] = gA[v + 3] = GLOW[raw & 3];
    }
    geo.setAttribute('aGlow', new THREE.BufferAttribute(gA, 1));
    addMesh(geo, matRock, true, 'nest-ground');
  }

  // ---- 3. the giants (1/16 m), their lights
  const tg = performance.now();
  const lights = [];
  const giantInfo = [];
  for (const G of GIANTS) {
    const y0 = floorH(G.x, G.z);
    if (!view.box(G.x - G.R, y0, G.z - G.R, G.x + G.R, y0 + G.h + G.R * 0.6, G.z + G.R)) continue;
    // (out in the dark at the back a giant is built coarser: a 1/16 m voxel is a pixel there)
    const far = view.dist ? view.dist(G.x, y0 + G.h * 0.6, G.z) : Math.hypot(G.x - 0.6, G.z - 4.5);
    const m = giantGeo(G, far > 17 ? (lite ? 8 : 10) : lite ? 12 : 16);
    const mesh = addMesh(m.geo, matPlant, far < 24, 'giant');
    mesh.position.set(G.x, y0 - 0.02, G.z);
    mesh.rotation.y = (G.seed % 7) * 0.9;
    mesh.updateMatrixWorld(true);
    const lp = m.light.clone().applyMatrix4(mesh.matrixWorld);
    giantInfo.push({ G, mesh, light: lp, capY: y0 + m.capY, top: y0 + m.top, axisAt: m.axisAt, rStem: m.rStem, y0 });
    await tick();
    if (cancel()) return { cancelled: true };
  }
  stats.giantsMs = Math.round(performance.now() - tg);
  // the nearest giants get real lights (the rest glow on their own)
  const camGuess = new THREE.Vector3(0.6, 1.2, 4.5);
  const order = giantInfo.slice().sort((a, b) => a.light.distanceTo(camGuess) - b.light.distanceTo(camGuess));
  const nLights = soft ? 2 : lite ? 3 : 4;
  for (const gi of order.slice(0, nLights)) {
    const L = new THREE.PointLight(LIGHT_OF[gi.G.ramp], 9 * gi.G.R, gi.G.R * 7, 1.6);
    // under the gills, out from the stem toward the open cave (the stem itself isn't scorched white)
    const out = camGuess.clone().sub(gi.light).setY(0).normalize().multiplyScalar(gi.G.R * 0.55);
    L.position.copy(gi.light).add(out);
    L.position.y = gi.capY - gi.G.R * 0.35;
    lights.push(L);
    group.add(L);
  }

  const tm = performance.now();
  // ---- 4. models: crystals, shelves, boulders, roots, the mine's plants; merged per 6 m tile
  const buckets = new Map();
  stats.byTag = {};
  stats.tagMs = {};
  let tag = 'misc', tagT = performance.now();
  const mark = (next) => { stats.tagMs[tag] = Math.round(performance.now() - tagT); tag = next; tagT = performance.now(); };
  const put = (geo, x, y, z, ry = 0, s = 1, hang = false) => {
    stats.byTag[tag] = (stats.byTag[tag] || 0) + (geo.index ? geo.index.count / 3 : 0);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(s, s, s));
    const g = geo.clone().applyMatrix4(m);
    const key = (hang ? 'h' : 'p') + Math.floor((x - X0) / 6) + ',' + Math.floor((z - Z0) / 6);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { hang, list: [] }));
    b.list.push(g);
    stats.models++;
  };
  const protoCache = new Map();
  const modelCache = new Map();
  /** A cave plant's mesh; lod: the same plant at half the resolution (as the mine draws its far plants). */
  const proto = (name, v, scale, lod = false) => {
    const key = name + '|' + v + '|' + scale + (lod ? '|lod' : '');
    let g = protoCache.get(key);
    if (!g) {
      const mk = name + '|' + v;
      let m = modelCache.get(mk);
      if (!m) {
        let hsh = 77 + v * 7919;
        for (let i = 0; i < name.length; i++) hsh = Math.imul(hsh ^ name.charCodeAt(i), 16777619);
        m = MODELS[name](vrng(hsh));
        modelCache.set(mk, m);
      }
      g = lod ? vgGeo({ g: down2(m.g), pivot: m.pivot.map((q) => Math.round(q / 2)) }, scale * 2) : vgGeo(m, scale);
      protoCache.set(key, g);
    }
    return g;
  };
  const camDist = (x, y, z) => (view.dist ? view.dist(x, y, z) : Math.hypot(x - 0.6, y - 1.2, z - 4.5));
  const LOD_D = lite ? 6.5 : 9;
  const rr = makeRng(777);
  const okSpot = (x, z, pad = 0.9) => {
    if (Math.hypot(x - CAVE.sign.x, z - CAVE.sign.z) < 0.95 + pad * 0.3) return false;
    if (Math.hypot(x - nest.x, z - nest.z) < 1.0) return false;
    if (nearPath(x, z) < pad) return false;
    if (Math.hypot((x - CAVE.pool.x) / CAVE.pool.r, (z - CAVE.pool.z) / (CAVE.pool.r * 0.72)) < 1.0) return false;
    for (const G of GIANTS) if (Math.hypot(x - G.x, z - G.z) < 0.55 + G.R * 0.18) return false;
    for (const B of BREAK_SPOTS) if (Math.hypot(x - B.x, z - B.z) < 0.6) return false;
    return rimOf(x, z) < 0.86;
  };
  // crystals
  mark('crystal');
  const crystalSpots = [[-10.2, -13.5, 1.5, 'violet'], [10.8, -11.8, 1.3, 'cyan'], [-4.8, -20.5, 1.7, 'violet'], [4.2, -21.5, 1.4, 'blue'], [3.1, -0.4, 0.55, 'violet'], [-9.4, -3.2, 0.9, 'cyan'], [6.8, -2.8, 0.75, 'blue'], [-0.6, -13.6, 0.7, 'cyan'], [11.6, -6.5, 1.1, 'violet'], [-12.0, -8.0, 1.2, 'blue']];
  for (const [x, z, h, ramp] of crystalSpots) {
    const y = floorH(x, z);
    if (!view.point(x, y + h / 2, z, h)) continue;
    const k = camDist(x, y, z) < 10 ? Math.round(1 / voxelSizeFor(h * 1.2)) : 16;
    put(crystalGeo(Math.round(x * 13 + z * 7), { h, ramp: RAMP[ramp], k, n: h > 1 ? 7 : 5 }), x, y - 0.05, z, rr() * TAU);
  }
  // shelves on the giants' stems
  mark('shelf');
  for (const gi of giantInfo) {
    const G = gi.G, n = G.R > 2.5 ? 2 : 1;
    for (let j = 0; j < n; j++) {
      const a = (j ? 2.1 : -0.4) + G.seed, ym = G.h * (0.26 + j * 0.2);
      const [ax, az] = gi.axisAt(ym);
      const p = gi.mesh.localToWorld(new THREE.Vector3(ax + Math.sin(a) * gi.rStem * 0.85, ym, az + Math.cos(a) * gi.rStem * 0.85));
      put(shelfGeo(G.seed + j, { w: 0.55 + G.R * 0.12, ramp: j ? RAMP.amber : RAMP[G.ramp === 'cyan' ? 'amber' : 'cyan'] }), p.x, p.y, p.z, a + gi.mesh.rotation.y);
    }
  }
  mark('wall');
  // walls: shelves and the mine's wall plants where the floor turns steep
  for (let i = 0; i < 260; i++) {
    const x = rr.range(-15, 15), z = rr.range(-31, 3);
    const r = rimOf(x, z);
    if (r < 0.86 || r > 1.12) continue;
    const y = floorH(x, z) + rr.range(-0.2, 0.4);
    if (y < 0.6 || y > ceilH(x, z) - 0.6) continue;
    if (!view.point(x, y, z, 0.5) || camDist(x, y, z) > 17) continue;
    const gx = floorH(x + 0.3, z) - floorH(x - 0.3, z), gz = floorH(x, z + 0.3) - floorH(x, z - 0.3);
    const yaw = Math.atan2(-gx, -gz);
    const pick = rr();
    if (pick < 0.22) put(shelfGeo(i, { w: rr.range(0.5, 1.1), ramp: rr() < 0.5 ? RAMP.amber : RAMP.cyan }), x, y, z, yaw);
    else put(proto(pick < 0.5 ? 'wallMush' : pick < 0.72 ? 'wallFungus' : pick < 0.86 ? 'wallLichenCrystal' : 'wallMoss', i % 3, 1 / 48, camDist(x, y, z) > LOD_D), x, y, z, yaw);
  }
  mark('boulder');
  // boulders (furniture-sized: 1/32)
  for (let i = 0, nb = 0; i < 40 && nb < (lite ? 7 : 18); i++) {
    const x = rr.range(-12.5, 12.5), z = rr.range(-26, 3.5);
    if (!okSpot(x, z, 1.3)) continue;
    const w = rr.range(0.5, 1.5), y = floorH(x, z);
    if (!view.point(x, y, z, w)) continue;
    nb++;
    const kk = camDist(x, y, z) < 8 ? 32 : 16;
    put(withGlow(makeBoulderGeo(900 + i, { w, h: w * rr.range(0.45, 0.7), d: w * rr.range(0.7, 1), k: kk, moss: rr.range(0.3, 0.9), tone: [0x5a5466, 0x4e4a5a, 0x64606e][i % 3] })), x, y - 0.05, z, rr() * TAU);
  }
  mark('roots');
  // the roots across the routes, and a few more arching out of the floor
  {
    for (const R of ROOT_ARCS) {
      // across the nearer route
      let best = null, bd = 1e9;
      for (const P of CHASE_PATHS) for (let i = 0; i < P.length - 1; i++) {
        const mx = (P[i][0] + P[i + 1][0]) / 2, mz = (P[i][1] + P[i + 1][1]) / 2, d = Math.hypot(mx - R.x, mz - R.z);
        if (d < bd) { bd = d; best = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]]; }
      }
      const yaw = Math.atan2(-best[0], -best[1]);
      put(withGlow(makeRootArcGeo(31 + Math.round(R.x * 3), { span: R.span, r: 0.075, rise: 0.22, k: 48, moss: 0.5 })), R.x, floorH(R.x, R.z) - 0.02, R.z, yaw);
    }
    for (const [x, z, s, yaw] of [[-9.0, -5.8, 2.4, 0.3], [5.6, -3.0, 1.8, 1.2], [-1.2, -15.2, 2.2, 2.0], [9.4, -9.6, 2.0, 0.6]]) {
      if (view.point(x, floorH(x, z), z, s)) put(withGlow(makeRootArcGeo(40 + Math.round(x), { span: s, r: 0.09, rise: 0.3, k: 40, moss: 0.6 })), x, floorH(x, z) - 0.03, z, yaw);
    }
  }
  mark('floorPlants');
  // the mine's cave plants on the floor (1/56–1/64 m voxels)
  const FLOOR_SET = [
    ['glowShroom', 3, 1 / 56], ['mushTiny', 3, 1 / 60], ['fungusCyan', 2, 1 / 56], ['fungusViolet', 2, 1 / 56], ['fungusBlue', 2, 1 / 56], ['fungusPink', 1, 1 / 56],
    ['puffballs', 1, 1 / 56], ['flowerCyan', 2, 1 / 60], ['flowerViolet', 2, 1 / 60], ['fungusGrass', 4, 1 / 60], ['mossGrass', 4, 1 / 60], ['cloverGlow', 2, 1 / 60],
    ['inkcap', 1, 1 / 56], ['fern', 2, 1 / 56], ['pebbles', 2, 1 / 60], ['lichenCrystal', 1, 1 / 60], ['starMoss', 1, 1 / 60], ['fungusAmber', 1, 1 / 56],
  ];
  const wsum = FLOOR_SET.reduce((a, f) => a + f[1], 0);
  const nPlants = soft ? 90 : lite ? 150 : 300;
  for (let i = 0, placed = 0; i < nPlants * 4 && placed < nPlants; i++) {
    // more round the giants' feet and the pool, fewer out in the open
    let x, z;
    if (rr() < 0.55 && giantInfo.length) { const gi = giantInfo[rr.int(0, giantInfo.length - 1)].G; const a = rr() * TAU, d = rr.range(0.6, 3.6); x = gi.x + Math.cos(a) * d; z = gi.z + Math.sin(a) * d; }
    else { x = rr.range(-12.5, 12.5); z = rr.range(-27, 4); }
    if (!okSpot(x, z, 0.75)) continue;
    const y = floorH(x, z);
    if (!view.point(x, y + 0.2, z, 0.4)) continue;
    let w = rr() * wsum, f = FLOOR_SET[0];
    for (const F of FLOOR_SET) { w -= F[1]; if (w <= 0) { f = F; break; } }
    // (close to the camera: smaller things only)
    put(proto(f[0], rr.int(0, 2), f[2], camDist(x, y, z) > LOD_D), x, y - 0.02, z, rr() * TAU, rr.range(0.85, 1.25));
    placed++;
  }
  // the foreground (what's closest to the menu's camera) gets its own sprinkling
  for (let i = 0, placed = 0; i < 400 && placed < (soft ? 20 : 40); i++) {
    const x = rr.range(-6, 4.5), z = rr.range(-5.5, 3.2);
    if (!okSpot(x, z, 0.8)) continue;
    const y = floorH(x, z);
    if (!view.point(x, y + 0.2, z, 0.3)) continue;
    const f = FLOOR_SET[[0, 1, 2, 3, 7, 8, 9, 10, 11, 14, 16][rr.int(0, 10)]];
    put(proto(f[0], rr.int(0, 2), f[2], false), x, y - 0.02, z, rr() * TAU, rr.range(0.85, 1.2));
    placed++;
  }
  // round the signpost's foot and along the pool's edge: a few glowing ones
  for (const [x, z, nm] of [[2.35, 1.5, 'glowShroom'], [0.85, 0.55, 'mushTiny'], [2.4, 0.4, 'fungusGrass'], [0.7, 1.7, 'mossGrass'], [-0.9, -9.4, 'flowerCyan'], [-3.2, -10.6, 'fungusCyan'], [0.6, -11.6, 'flowerViolet'], [-2.4, -12.8, 'glowShroom']]) {
    if (view.point(x, floorH(x, z), z, 0.5)) put(proto(nm, 1, 1 / 60), x, floorH(x, z) - 0.02, z, rr() * TAU);
  }
  mark('hang');
  // hanging from the roof: roots and vines off the brow, mycelium and glowworm threads in the dome
  const HANG = [['roots', 3, 1 / 56], ['rootsShort', 3, 1 / 56], ['glowVine', 2, 1 / 56], ['mossDrape', 2, 1 / 52], ['mycelCyan', 3, 1 / 56], ['mycel', 2, 1 / 56], ['vineBerry', 1, 1 / 56]];
  const hsum = HANG.reduce((a, f) => a + f[1], 0);
  const dripTips = [];
  const nHang = soft ? 30 : lite ? 50 : 100;
  for (let i = 0, placed = 0; i < nHang * 6 && placed < nHang; i++) {
    const x = rr.range(-13, 13), z = rr.range(-29, 3);
    const y = ceilH(x, z);
    if (y < floorH(x, z) + 2.4) continue;
    if (Math.abs(x - CAVE.sign.x) < 1.2 && Math.abs(z - CAVE.sign.z) < 1.5) continue;
    if (!view.point(x, y - 0.6, z, 0.7)) continue;
    let w = rr() * hsum, f = HANG[0];
    for (const F of HANG) { w -= F[1]; if (w <= 0) { f = F; break; } }
    if (z < -12 && f[0].startsWith('root')) f = HANG[4];
    put(proto(f[0], rr.int(0, 2), f[2], camDist(x, y, z) > LOD_D), x, y + 0.05, z, rr() * TAU, rr.range(0.9, 1.3), true);
    placed++;
  }
  for (const s of STALACT) {
    const y = ceilH(s.x, s.z);
    if (s.h < 0.7 || y < floorH(s.x, s.z) + 0.6) continue;
    if (view.point(s.x, y, s.z, 0.3)) dripTips.push(new THREE.Vector3(s.x, y - 0.06, s.z));
  }
  mark('merge');
  // merge the tiles
  for (const [, b] of buckets) {
    const g = mergeGeometries(b.list);
    for (const x of b.list) x.dispose();
    if (!g) continue;
    g.computeBoundingSphere();
    const c = g.boundingSphere.center;
    addMesh(g, b.hang ? matHang : matPlant, camDist(c.x, c.y, c.z) - g.boundingSphere.radius < 22, b.hang ? 'hang' : 'plants');
  }
  for (const g of protoCache.values()) g.dispose();
  protoCache.clear();
  await tick();
  if (cancel()) return { cancelled: true };

  mark('done');
  stats.modelsMs = Math.round(performance.now() - tm);
  const tb = performance.now();
  // ---- 5. what the chase knocks about: mid-size glowcaps (1/32) and puffballs (1/48)
  const breakables = [];
  for (const B of BREAK_SPOTS) {
    const y = floorH(B.x, B.z);
    const root = new THREE.Group();
    root.position.set(B.x, y - 0.02, B.z);
    root.rotation.y = B.seed * 1.3;
    group.add(root);
    const sway = new THREE.Group();
    root.add(sway);
    if (B.kind === 'cap') {
      const m = giantGeo({ h: B.h, R: B.R, ramp: B.ramp, seed: 100 + B.seed }, lite ? 24 : 32, true);
      const stem = new THREE.Mesh(m.stem, matPlant), cap = new THREE.Mesh(m.cap, matPlant);
      stem.layers.enable(LAYER_OUTLINE); cap.layers.enable(LAYER_OUTLINE);
      const capHold = new THREE.Group();
      capHold.position.copy(m.capAt);
      cap.position.set(0, 0, 0);
      capHold.add(cap);
      sway.add(stem, capHold);
      geos.push(m.stem, m.cap);
      breakables.push({ ...B, y, root, sway, cap, capHold, capAt: m.capAt.clone(), top: m.top, ang: 0, angV: 0, axis: new THREE.Vector3(1, 0, 0), off: null, regrow: 1 });
    } else {
      const g = proto('puffballs', B.seed % 2, 1 / 44);
      const mesh = new THREE.Mesh(g.clone(), matPlant);
      mesh.layers.enable(LAYER_OUTLINE);
      sway.add(mesh);
      geos.push(mesh.geometry);
      breakables.push({ ...B, y, root, sway, mesh, pop: 1, popT: 0, ang: 0, angV: 0, axis: new THREE.Vector3(1, 0, 0) });
    }
  }
  for (const g of protoCache.values()) g.dispose();
  protoCache.clear();

  stats.breakMs = Math.round(performance.now() - tb);
  // ---- 6. the pool
  let water = null;
  {
    const P = CAVE.pool, k = 16, R = P.r * 1.4;
    const n = Math.ceil(R * 2 * k), ox = P.x - R, oz = P.z - R;
    const h = new Int32Array(n * n), top = new Uint32Array(n * n);
    let any = false;
    for (let kk = 0; kk < n; kk++) for (let i = 0; i < n; i++) {
      const x = ox + (i + 0.5) / k, z = oz + (kk + 0.5) / k;
      if (floorH(x, z) < P.level - 0.01) { h[i + n * kk] = 4; top[i + n * kk] = 0x203040; any = true; }
    }
    if (any && view.point(P.x, P.level, P.z, P.r)) {
      const geo = meshRelief({ W: n, D: n, h, top, origin: [ox, P.level - 4 / k, oz], U: [1 / k, 0, 0], V: [0, 0, 1 / k], N: [0, 1 / k, 0], walls: false, ao: false });
      const wm = new THREE.ShaderMaterial({
        uniforms: { uTime: CF.uTime, uDeep: { value: new THREE.Color(0x05080e) }, uGlowA: { value: new THREE.Color(0x3ad8d0) }, uGlowB: { value: new THREE.Color(0x7a5ae0) }, uRip: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -10, 0)) }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.03 } },
        vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
      });
      mats.add(wm);
      water = addMesh(geo, wm, false, 'pool');
      water.userData.rip = 0;
    }
  }

  // ---- 7. the air: glowworms, spores, drips, mist
  const glowPts = [];
  {
    const r = makeRng(55);
    for (let i = 0; i < 1600 && glowPts.length < (lite ? 160 : 300); i++) {
      const x = r.range(-14, 14), z = r.range(-31, -9);
      const y = ceilH(x, z) - 0.04;
      if (y < 6.5 || !view.point(x, y, z, 0.1)) continue;
      glowPts.push({ pos: [x, y - r() * 0.5, z], color: r() < 0.7 ? 0x9af4ff : 0x7aa8ff, size: r() < 0.2 ? 2 : 1, shape: SHAPE.square, speed: r.range(0.3, 1.2), phase: r() * 20, sharp: 1.5, amp: 0.6, base: 0.4 });
    }
  }
  const glowworms = new Twinkles(glowPts, { additive: true });
  glowworms.points.renderOrder = 4;
  group.add(glowworms.points);
  const spores = new Particles({ max: lite ? 160 : 320, additive: true, atten: true, renderOrder: 7 });
  group.add(spores.points);
  const drips = new Particles({ max: 60, additive: false, atten: true, renderOrder: 7 });
  group.add(drips.points);
  const falling = [];
  const mist = [];
  if (!soft) {
    for (const [x, z, w, d, y, c, s] of [[-1.5, -8.5, 16, 7, 0.22, 0x5ad8d0, 1], [1.0, -15.5, 20, 9, 0.35, 0x8a7ae8, 2], [-6, -4, 8, 5, 0.18, 0x5ad8d0, 3], [5.5, -5.5, 8, 6, 0.2, 0x9a78f0, 4], [-1.4, -11.2, 6.5, 4.5, 0.06, 0x7ae8e0, 5]]) {
      if (!view.point(x, y, z, Math.max(w, d) / 2)) continue;
      const m = makeMistSheet(x, y, z, w, d, { color: c, alpha: 0.55, seed: s });
      mist.push(m);
      group.add(m);
      mats.add(m.material);
      geos.push(m.geometry);
    }
  }

  stats.ms = Math.round(performance.now() - t0);
  group.traverse((m) => { if (m.isMesh && m.geometry.index) stats.tris += m.geometry.index.count / 3; });
  stats.tris = Math.round(stats.tris);

  // ---- per frame
  let sporeAcc = 0, dripT = 1.2, t = 0;
  const ripples = water ? water.material.uniforms.uRip.value : null;
  const C = {
    group, lights, stats, breakables, giants: giantInfo, water, dripTips,
    materials: [...mats],
    /** sfx(name, opts): drips call it as they land (pan from the screen, far by distance). */
    sfx: null,
    update(dt, cam, heightPx) {
      t += dt;
      CF.uTime.value += dt;
      if (water) {
        water.material.uniforms.fogColor.value.copy(group.parent?.fog?.color || water.material.uniforms.fogColor.value);
        water.material.uniforms.fogDensity.value = group.parent?.fog?.density ?? 0.03;
      }
      // spores sift down from under the caps and drift up again in the warm air
      sporeAcc += dt * (lite ? 14 : 26);
      while (sporeAcc >= 1 && giantInfo.length) {
        sporeAcc -= 1;
        const gi = giantInfo[(Math.random() * giantInfo.length) | 0];
        const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * gi.G.R * 0.9;
        const col = tone(RAMP[gi.G.ramp], 5 + Math.random());
        spores.spawn({ pos: [gi.light.x + Math.cos(a) * d, gi.capY - 0.1, gi.light.z + Math.sin(a) * d], vel: [(Math.random() - 0.5) * 0.12, -0.05 - Math.random() * 0.12, (Math.random() - 0.5) * 0.12], life: 6 + Math.random() * 6, color: col, color2: tone(RAMP[gi.G.ramp], 4), size: 0.022 + Math.random() * 0.02, shape: SHAPE.square, gravity: -0.018, drag: 0.15, flicker: 0.35, wobble: 0.06, fadeIn: 0.8 });
      }
      spores.setScaleFromCamera(cam, heightPx);
      spores.update(dt);
      glowworms.update(dt);
      // drips: a bead swells at a tip and falls; it splashes (and rings the pool)
      dripT -= dt;
      if (dripT <= 0 && dripTips.length) {
        dripT = 0.7 + Math.random() * 1.6;
        const tip = dripTips[(Math.random() * dripTips.length) | 0];
        const P = CAVE.pool;
        const inPool = Math.hypot((tip.x - P.x) / P.r, (tip.z - P.z) / (P.r * 0.72)) < 0.95;
        const gy = inPool ? P.level : floorH(tip.x, tip.z);
        falling.push({ x: tip.x, y: tip.y, z: tip.z, vy: 0, gy, pool: inPool, idx: drips.spawn({ pos: [tip.x, tip.y, tip.z], life: 9, color: 0xc8f4ff, size: 0.03, shape: SHAPE.square, fadeIn: 0.2 }) });
      }
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        f.vy -= 9.8 * dt;
        f.y += f.vy * dt;
        drips.pos[f.idx * 3 + 1] = f.y;
        drips.vel[f.idx * 3 + 1] = 0;
        if (f.y <= f.gy) {
          drips.maxLife[f.idx] = 0;
          falling.splice(i, 1);
          for (let k = 0; k < 4; k++) drips.spawn({ pos: [f.x, f.gy + 0.02, f.z], vel: [(Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5], life: 0.35 + Math.random() * 0.2, color: 0xd8f8ff, size: 0.018, shape: SHAPE.square, gravity: 7 });
          if (f.pool && ripples) { const r = ripples[(water.userData.rip++) % 4]; r.set(Math.floor(f.x * 16) / 16, Math.floor(f.z * 16) / 16, CF.uTime.value, 1); }
          if (C.sfx) {
            const v = new THREE.Vector3(f.x, f.gy, f.z);
            const d = v.distanceTo(cam.position);
            v.project(cam);
            if (Math.abs(v.x) < 1.4) C.sfx(f.pool ? 'cave_plink' : 'cave_drip', { pan: clamp(v.x * 0.8, -0.8, 0.8), vol: clamp(1.4 - d / 18, 0.15, 1), far: d > 9 });
          }
        }
      }
      drips.setScaleFromCamera(cam, heightPx);
      drips.update(dt);
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of mats) if (!m.userData?.shared && !String(m.customProgramCacheKey?.() || '').startsWith('cave-toon')) m.dispose();
      glowworms.points.geometry.dispose(); glowworms.points.material.dispose();
      spores.geo.dispose(); spores.mat.dispose();
      drips.geo.dispose(); drips.mat.dispose();
    },
  };
  return C;
}
