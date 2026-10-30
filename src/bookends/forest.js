// The old forest where the journey begins, at golden hour. A dirt trail winds north between
// ancient giants (buttress roots over the ground, moss coats, ivy, shelf fungi, hollows) and
// layers of beeches, oaks, spruces, pines, birches, a few autumn-touched maples and dead snags,
// over a stream on a log footbridge, into a sunny clearing where a strange old chest sits on a
// thin crust of turf over a hollow. Under the trees: carpets of ferns, bluebell drifts, moss
// cushions, foxgloves, bilberry, toadstools, mossy boulders, great fallen logs; the sun comes
// through the canopy in dapples and shafts; the forest goes on past the built ground as low-detail
// trees and then pixel-art silhouettes melting into a golden-green haze under a painted sky.
// Metres, y up, the hole (and the chest) at the origin; the trail comes in from the south (+z).
//
//   const F = await buildForest({ lite });  scene.add(F.group, F.sky);  F.update(dt, camera); F.dispose();
//   FOREST.trail.at(s) → { x, y, z, yaw, tx, tz } (s: metres along the trail), FOREST.trail.length
//   groundH(x, z), F.crust (pieces), F.cracks, F.chest, F.spill, F.glints, F.bridge, F.stream, F.spots
import * as THREE from 'three';
import { meshRelief, hash3, fshade } from './vox.js';
import { makeNoise2D, makeRng, clamp, lerp } from '../core/util.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { MF, initMF, updateMF, butterflySheet, swallowSheet, dragonflySheet, resetMeadowMaterials } from './meadowfx.js';
import { forestToon, makeOpenness, makeStream, makeMist, resetForestMaterials } from './forestfx.js';
import { makeStumpGeo, makeBridgeGeo, makeSignGeo, instanceChunked } from './foresttrees.js';
import { makeChest, makeSpill, makeCrust, makeCracks } from './chest.js';
import { makeSheetSprite, Twinkles, SHAPE, makeGlow } from './fx.js';
import { makePaintedSky } from './forest/atmos.js';
import { makeBroadleaf, makeConifer, makeSnag, triCount } from './forest/trees.js';
import { makeFernGeo, makeMushroomGeo, makeMossGeo, makeBoulderGeo, makeFallenLogGeo, makeFoxgloveGeo, makeShrubGeo, makeRootArcGeo, makePebblesGeo, makeTwigGeo, makeLeavesGeo } from './forest/flora.js';
import { makeForestGrassChunked, FG } from './forest/grass.js';
import { makeFarTrees } from './forest/far.js';

let VS = 1 / 8; // terrain voxel (across): 1/8 m, or 1/6 m for the light forest
const VY = 1 / 16; // terrain step (up)
const BASE = 48; // ground level 0 sits 48 steps (3 m) above the bottom of the terrain grid
const BOX = { x0: -26, x1: 26, z0: -22, z1: 50 };
const OUT_FULL = { x0: -100, x1: 100, z0: -96, z1: 124 }; // the coarse ground and far trees
const OUT_LITE = { x0: -72, x1: 72, z0: -68, z1: 96 };
let OUT = OUT_FULL;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const n1 = makeNoise2D(501), n2 = makeNoise2D(502), n3 = makeNoise2D(503), n4 = makeNoise2D(504), n5 = makeNoise2D(505);
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Toward the sun: low in the north-west, so looking up the trail the light pours through the trees. */
export const SUN_DIR = new THREE.Vector3(-0.36, 0.44, -0.82).normalize();

// ------------------------------------------------------------------ layout
function polyline(pts, step = 0.25) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const L = curve.getLength();
  const n = Math.ceil(L / step);
  const P = [];
  for (let i = 0; i <= n; i++) { const p = curve.getPointAt(i / n); P.push({ x: p.x, z: p.z, s: (i / n) * L }); }
  return { curve, L, P };
}
const TRAIL = polyline([[7.5, 47], [6.2, 39], [3.2, 31.5], [1.6, 25], [2.4, 20.3], [1.2, 15], [-1.4, 10], [-0.9, 5.4], [0, 1.25]]);
const STREAM = polyline([[-27, 15.5], [-16, 19.5], [-7, 17.6], [2.3, 20.2], [9.5, 22.6], [17, 19.4], [27, 21.5]], 0.3);
/** Where the trail crosses the stream (the footbridge). */
const CROSS = (() => {
  let best = null, bd = 1e9;
  for (const p of TRAIL.P) for (const q of STREAM.P) { const d = (p.x - q.x) ** 2 + (p.z - q.z) ** 2; if (d < bd) { bd = d; best = { s: p.s, x: p.x, z: p.z, ss: q.s }; } }
  return best;
})();
export const CLEAR_R = 7.2; // the clearing
export const HOLE_R = 1.5; // the crust over the hollow

/** A point on the trail (no height): x, z and the unit tangent. */
function tp(s) {
  const t = clamp(s / TRAIL.L, 0, 1);
  const p = TRAIL.curve.getPointAt(t), tg = TRAIL.curve.getTangentAt(t);
  return { x: p.x, z: p.z, tx: tg.x, tz: tg.z };
}
/** Beside the trail at s: off > 0 is on the walker's right, < 0 on his left. */
function beside(s, off) { const p = tp(s); return [p.x - p.tz * off, p.z + p.tx * off]; }

/** The ancient giants: two flank the trail like a gate, one by the stream, three round the clearing. */
const GIANTS = [
  { at: beside(8.6, -5.0), seed: 11, face: 'trail', s: 1.0 },
  { at: beside(12.2, 5.6), seed: 23, face: 'trail', s: 0.92 },
  { at: [-7.6, 25.6], seed: 37, face: 'trail', s: 0.95 },
  { at: [-11.8, -9.0], seed: 11, face: 'clear', s: 1.08 },
  { at: [12.6, -7.2], seed: 23, face: 'clear', s: 0.98 },
  { at: [-13.8, 5.6], seed: 37, face: 'clear', s: 0.9 },
].map((g) => ({ ...g, x: g.at[0], z: g.at[1] }));

/** Distances to the trail and stream, from a 0.5 m field (built once). */
const FIELD = (() => {
  const st = 0.5;
  const W = Math.ceil((BOX.x1 - BOX.x0) / st) + 1, D = Math.ceil((BOX.z1 - BOX.z0) / st) + 1;
  const td = new Float32Array(W * D), ts = new Float32Array(W * D), sd = new Float32Array(W * D), ss = new Float32Array(W * D);
  for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    const x = BOX.x0 + i * st, z = BOX.z0 + k * st;
    let b = 1e9, bs = 0;
    for (const p of TRAIL.P) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < b) { b = d; bs = p.s; } }
    td[i + W * k] = Math.sqrt(b); ts[i + W * k] = bs;
    b = 1e9; bs = 0;
    for (const p of STREAM.P) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < b) { b = d; bs = p.s; } }
    sd[i + W * k] = Math.sqrt(b); ss[i + W * k] = bs;
  }
  const sample = (arr, x, z) => {
    const fx = clamp((x - BOX.x0) / st, 0, W - 1.001), fz = clamp((z - BOX.z0) / st, 0, D - 1.001);
    const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k;
    const a = arr[i + W * k], b = arr[i + 1 + W * k], c = arr[i + W * (k + 1)], d = arr[i + 1 + W * (k + 1)];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  // outside the box the distances keep growing with the distance to the box
  const out = (x, z) => Math.hypot(Math.max(0, BOX.x0 - x, x - BOX.x1), Math.max(0, BOX.z0 - z, z - BOX.z1));
  return {
    trail: (x, z) => sample(td, x, z) + (z > BOX.z1 && Math.abs(x - 7.8) < 3 ? 0 : out(x, z)),
    trailS: (x, z) => sample(ts, x, z),
    stream: (x, z) => sample(sd, x, z) + out(x, z) * 3,
    streamS: (x, z) => sample(ss, x, z),
  };
})();

/** The stream's water level (it runs gently downhill to the east). */
const waterY = (s) => -0.42 - s * 0.004;
/** The trail's own height at s (a long, gentle descent to the clearing, dipping to the bridge). */
const trailY = (s) => {
  const L = TRAIL.L;
  let y = lerp(0.9, 0, sm(L * 0.15, L, s)) + Math.sin(s * 0.21) * 0.12;
  y -= 0.25 * Math.exp(-(((s - CROSS.s) / 3.2) ** 2));
  return y;
};

/** Height of the ground (m) at x, z. */
export function groundH(x, z) {
  const td = FIELD.trail(x, z), ts = FIELD.trailS(x, z);
  const sd = FIELD.stream(x, z), ss = FIELD.streamS(x, z);
  let H = n1(x * 0.05, z * 0.05) * 0.8 + n2(x * 0.16, z * 0.16) * 0.22 + 0.35;
  H += n5(x * 0.42, z * 0.42) * 0.07; // hummocks
  H += sm(5, 20, td) * 1.5 * sm(8, 17, Math.hypot(x, z)); // the ground rises away from the trail (gently round the clearing)
  // past the built ground: long wooded slopes rising into hills
  const ob = Math.hypot(Math.max(0, BOX.x0 - x, x - BOX.x1), Math.max(0, BOX.z0 - z, z - BOX.z1));
  if (ob > 0) H += sm(0, 40, ob) * (2.2 + n3(x * 0.025, z * 0.025) * 3.5) + n4(x * 0.06, z * 0.06) * 0.6 * sm(0, 10, ob);
  // the giants stand on mounds of their own roots
  for (const g of GIANTS) { const d2 = (x - g.x) ** 2 + (z - g.z) ** 2; if (d2 < 30) H += 0.42 * Math.exp(-d2 / 5.5); }
  H = lerp(H, trailY(ts) - 0.05, sm(2.6, 0.9, td)); // the trail is a smooth, slightly sunken band
  if (td < 0.8) H -= (Math.abs(Math.abs(td) - 0.38) < 0.08 ? 0.03 : 0); // ruts
  // the clearing: flat
  const r = Math.hypot(x, z);
  H = lerp(0, H, sm(5.2, 9.5, r));
  // the stream bed and its banks
  const wy = waterY(ss);
  const bed = wy - 0.18 - (1 - sm(0, 0.7, sd)) * 0.12;
  H = lerp(bed, H, sm(0.55, 1.9, sd));
  return H;
}

/** Trail sampler: point at s metres from the start. */
function trailAt(s, out = {}) {
  const t = clamp(s / TRAIL.L, 0, 1);
  const p = TRAIL.curve.getPointAt(t), tg = TRAIL.curve.getTangentAt(t);
  out.x = p.x; out.z = p.z;
  out.y = groundH(p.x, p.z);
  out.yaw = Math.atan2(tg.x, tg.z);
  out.tx = tg.x; out.tz = tg.z;
  return out;
}

export const FOREST = {
  trail: { at: trailAt, length: TRAIL.L, curve: TRAIL.curve, cross: CROSS, beside },
  stream: STREAM,
  box: BOX,
  giants: GIANTS,
  bridgeY: 0,
  dist: { trail: (x, z) => FIELD.trail(x, z), stream: (x, z) => FIELD.stream(x, z) },
};

// ------------------------------------------------------------------ colours
const GRASS_C = [0x6e9a3a, 0x7ea444, 0x8aac4a, 0x628e36];
const MOSS_C = [0x4e7634, 0x5a8238, 0x46682e, 0x668e40];
const LITTER = [0x6e5232, 0x7e5e38, 0x5e4428, 0x8e6a3c, 0xa0602e, 0x8a7a3a];
const DIRT = [0xa8865a, 0x987650, 0xb8966a, 0x8a6a46];
const MUD = [0x5a4630, 0x4a3a28, 0x6a5238];

/** Ground colour at a point: trail dirt, clearing grass, moss and litter under the trees, mud banks. */
export function groundColor(x, z, i = 0, k = 0, nearTree = 0) {
  const td = FIELD.trail(x, z), sd = FIELD.stream(x, z);
  const r = Math.hypot(x, z);
  const p1 = n3(x * 0.6, z * 0.6), p2 = n4(x * 1.7, z * 1.7), p3 = n5(x * 0.18, z * 0.18);
  const h = hash3(i >> 1, 0, k >> 1, 7);
  if (sd < 0.75) return h < 0.12 ? 0x8a8278 : sd < 0.55 ? MUD[(h * 3) | 0] : 0xb8a070; // stones, mud, sand
  if (td < 0.62 + p2 * 0.12) {
    // the trail: packed dirt, pebbles, worn grass at the edges, a fallen leaf or two
    if (h < 0.05) return 0x8a8278;
    if (h > 0.975) return 0xc8b494;
    if (h > 0.955) return LITTER[4];
    if (td > 0.5 && p1 > 0) return GRASS_C[3];
    return DIRT[((p1 * 2 + 2) | 0) % 4];
  }
  if (r < CLEAR_R + p1 * 1.2) {
    // the clearing: meadow grass in patches
    const c = GRASS_C[((p1 * 1.5 + p2 + 2) | 0) % 3];
    return h < 0.03 ? 0x9ac458 : h > 0.985 ? 0xd8c070 : c;
  }
  // the forest floor: moss carpets, leaf litter (with autumn flecks), needles near the trunks
  if (nearTree > 0.55 && p2 > -0.25) return h < 0.2 ? LITTER[3] : LITTER[0];
  if (p1 + p2 * 0.4 + p3 * 0.5 > 0.12) return h < 0.04 ? 0x8aac48 : MOSS_C[((p2 * 2 + 2) | 0) % 4];
  if (td < 1.3) return h < 0.5 ? GRASS_C[3] : MOSS_C[1];
  if (h < 0.06) return LITTER[4];
  if (h > 0.96) return LITTER[5];
  return LITTER[((p2 * 2 + 2) | 0) % 4];
}

// ------------------------------------------------------------------ build
/**
 * Build the forest (async: it yields between the heavy steps so the page stays responsive).
 * opts.lite: phones and 'Simple' shaders (fewer, coarser trees, less undergrowth); opts.soft: a software
 * rasterizer (the light forest, thinner still, with a short draw distance).
 * Returns { group, sky, textures, crust, cracks, chest, spill, glints, chestGlow, update, dispose,
 * stats, bridge, stream, beams, spots, holeY }.
 */
export async function buildForest(opts = {}) {
  const t0 = performance.now();
  const soft = !!opts.soft;
  const lite = !!opts.lite || soft;
  VS = soft ? 1 / 5 : lite ? 1 / 6 : 1 / 7;
  OUT = lite ? OUT_LITE : OUT_FULL;
  // the fine ground: the whole built box, or on phones just the corridor round the trail and the clearing
  const TB = lite ? { x0: -19, x1: 21, z0: -17, z1: 50 } : BOX;
  const textures = initMF();
  const geos = []; // everything we built, to dispose
  const G = (g) => { if (g) geos.push(g); return g; };
  const group = new THREE.Group();
  group.name = 'forest';
  const stats = { tris: {} };
  // opts.cancel(): true when the player skipped while we were still building (stop early)
  const cancelled = () => !!(opts.cancel && opts.cancel());
  const bail = () => ({ cancelled: true, group, textures, stats, dispose: () => { for (const g of geos) { try { g.dispose(); } catch (e) { /* shared */ } } resetMeadowMaterials(); resetForestMaterials(); } });
  const rng = makeRng(77);
  MF.uSun.value.copy(SUN_DIR);
  MF.uKey.value.set(0xffc888);
  MF.uSky.value.set(0x9cc0e4);
  MF.uGround.value.set(0x4a5428);

  // ---- where the trees stand (decided first: the ground under them is littered, the canopy shades it)
  const trees = [];
  const giantClear = (x, z, pad) => GIANTS.every((g) => (g.x - x) ** 2 + (g.z - z) ** 2 > (3.2 * g.s + pad) ** 2);
  const ok = (x, z, minTrail, r) => {
    if (FIELD.trail(x, z) < minTrail) return false;
    if (FIELD.stream(x, z) < 1.6) return false;
    if (Math.hypot(x, z) < CLEAR_R + 1.2) return false;
    if (!giantClear(x, z, r)) return false;
    for (const t of trees) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + r) ** 2) return false;
    return true;
  };
  // near: a mixed wood along the trail and round the clearing
  for (let gz = BOX.z0; gz < BOX.z1; gz += 1.9) for (let gx = BOX.x0; gx < BOX.x1; gx += 1.9) {
    const x = gx + rng.range(0, 1.9), z = gz + rng.range(0, 1.9);
    const td = FIELD.trail(x, z);
    const near = td < 13;
    if (!ok(x, z, 2.7 + rng.range(0, 1.2), near ? 1.15 : 1.4)) continue;
    if (rng() < (near ? (soft ? 0.6 : lite ? 0.45 : 0.3) : (lite ? 0.8 : 0.62))) continue;
    const roll = rng();
    let kind = roll < 0.34 ? 'beech' : roll < 0.52 ? 'oak' : roll < 0.66 ? 'spruce' : roll < 0.74 ? 'pine' : roll < 0.88 ? 'birch' : roll < 0.95 ? 'maple' : 'snag';
    if ((kind === 'oak' || kind === 'beech' || kind === 'maple') && td < 4.2) kind = rng.chance(0.65) ? 'birch' : 'spruce'; // broad crowns stay back from the trail
    if ((kind === 'spruce' || kind === 'pine') && td < 3.8) kind = 'birch'; // skirts would hang over the trail
    // the clearing keeps its sky: broad crowns stand well back from it
    const rc = Math.hypot(x, z);
    if (rc < CLEAR_R + (kind === 'spruce' || kind === 'pine' ? 3.0 : kind === 'birch' ? 3.6 : 5.4)) continue;
    trees.push({ x, z, kind, near, r: kind === 'birch' ? 1.0 : kind === 'snag' ? 0.8 : 1.5, s: rng.range(0.85, 1.18), ry: rng.range(0, 6.28), v: rng.int(0, 3) });
  }
  // the outer ring: far trees on the slopes all round (voxel ones close in, silhouettes beyond)
  const far = [];
  for (let gz = OUT.z0; gz < OUT.z1; gz += 3.1) for (let gx = OUT.x0; gx < OUT.x1; gx += 3.1) {
    const x = gx + rng.range(0, 3.1), z = gz + rng.range(0, 3.1);
    if (x > BOX.x0 - 0.5 && x < BOX.x1 + 0.5 && z > BOX.z0 - 0.5 && z < BOX.z1 + 0.5) continue;
    if (z > BOX.z1 && Math.abs(x - 8) < 3.5 && z < BOX.z1 + 30) continue; // the trail runs on south
    if (rng() < 0.18) continue;
    const ob = Math.hypot(Math.max(0, BOX.x0 - x, x - BOX.x1), Math.max(0, BOX.z0 - z, z - BOX.z1));
    far.push({ x, z, ob, roll: rng(), s: rng.range(0.85, 1.25) });
  }
  const crownR = (t) => (t.kind === 'oak' ? 4.2 : t.kind === 'beech' ? 4.2 : t.kind === 'maple' ? 3.6 : t.kind === 'birch' ? 2.4 : t.kind === 'spruce' ? 2.2 : t.kind === 'pine' ? 2.0 : 0) * t.s;

  // ---- the canopy: how open the sky is over each spot (for the sun dapple and the shade)
  const cover = (() => {
    const N = 128, w = BOX.x1 - BOX.x0, d = BOX.z1 - BOX.z0;
    const c = new Float32Array(N * N);
    const splat = (x, z, R, k) => {
      const i0 = Math.max(0, Math.floor(((x - R - BOX.x0) / w) * N)), i1 = Math.min(N - 1, Math.ceil(((x + R - BOX.x0) / w) * N));
      const j0 = Math.max(0, Math.floor(((z - R - BOX.z0) / d) * N)), j1 = Math.min(N - 1, Math.ceil(((z + R - BOX.z0) / d) * N));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = BOX.x0 + ((i + 0.5) / N) * w, pz = BOX.z0 + ((j + 0.5) / N) * d;
        // the crown's shade falls a little away from the sun
        const e = Math.hypot(px - x + SUN_DIR.x * 2.5, pz - z + SUN_DIR.z * 2.5) / R;
        if (e < 1) c[j * N + i] = Math.min(1, c[j * N + i] + k * (1 - e * e));
      }
    };
    for (const t of trees) splat(t.x, t.z, crownR(t) * 1.05, t.kind === 'birch' ? 0.55 : t.kind === 'snag' ? 0.1 : 0.9);
    for (const g of GIANTS) splat(g.x, g.z, 7.5 * g.s, 1);
    return { N, c, at: (x, z) => { const i = clamp(Math.floor(((x - BOX.x0) / w) * N), 0, N - 1), j = clamp(Math.floor(((z - BOX.z0) / d) * N), 0, N - 1); return c[j * N + i]; } };
  })();
  textures.push(makeOpenness({ x0: BOX.x0, z0: BOX.z0, w: BOX.x1 - BOX.x0, d: BOX.z1 - BOX.z0 }, (x, z) => {
    const td = FIELD.trail(x, z), sd = FIELD.stream(x, z), r = Math.hypot(x, z);
    let o = 0.95 - cover.at(x, z) * 0.85;
    o = Math.max(o, 0.5 * (1 - sm(0.6, 3.2, td)));
    o = Math.max(o, 0.55 * (1 - sm(0.5, 3.0, sd)));
    o = Math.max(o, 1 - sm(CLEAR_R - 1.0, CLEAR_R + 2.5, r));
    return clamp(o, 0.05, 1);
  }, 128));
  await tick();
  if (cancelled()) return bail();

  // ---- terrain: fine voxels over the built ground
  const tt = performance.now();
  const nearTree = (() => {
    const bins = new Map();
    for (const t of trees) { const key = `${Math.floor(t.x / 4)},${Math.floor(t.z / 4)}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(t); }
    return (x, z) => {
      let m = 0;
      const bx = Math.floor(x / 4), bz = Math.floor(z / 4);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const t of bins.get(`${bx + dx},${bz + dz}`) || []) {
        if (t.kind !== 'spruce' && t.kind !== 'pine') continue;
        const d = Math.hypot(t.x - x, t.z - z);
        if (d < 2.4) m = Math.max(m, 1 - d / 2.4);
      }
      for (const g of GIANTS) { const d = Math.hypot(g.x - x, g.z - z); if (d < 4.5) m = Math.max(m, 0.6 * (1 - d / 4.5)); }
      return m;
    };
  })();
  const W = Math.round((TB.x1 - TB.x0) / VS), D = Math.round((TB.z1 - TB.z0) / VS);
  const h = new Uint16Array(W * D), top = new Uint32Array(W * D);
  const inCrust = (ci, ck) => {
    const x = (ci + 0.5) * VS, z = (ck + 0.5) * VS;
    const a = Math.atan2(z, x);
    return Math.hypot(x, z) < HOLE_R + n1(Math.cos(a) * 1.7, Math.sin(a) * 1.7) * 0.18;
  };
  for (let k = 0; k < D; k++) {
    if (k % 64 === 63) { await tick(); if (cancelled()) return bail(); }
    for (let i = 0; i < W; i++) {
    const x = TB.x0 + (i + 0.5) * VS, z = TB.z0 + (k + 0.5) * VS;
    const q = i + W * k;
    const ci = Math.floor(x / VS), ck = Math.floor(z / VS);
    if (inCrust(ci, ck)) { h[q] = BASE - 16; top[q] = 0; continue; } // the hole: no floor (the crust pieces sit in it)
    const H = groundH(x, z);
    const td = FIELD.trail(x, z), sd = FIELD.stream(x, z);
    const terr = td > 2.8 && sd > 2.4 && Math.hypot(x, z) > CLEAR_R + 1.5 ? (td > 6 ? 3 : 2) : 1;
    h[q] = Math.max(1, Math.round(H / (VY * terr)) * terr + BASE);
    top[q] = groundColor(x, z, i, k, nearTree(x, z));
    }
  }
  const side = (q, level) => {
    const lv = h[q] - level;
    if (lv <= 1) return fshade(top[q], 0.8);
    if (lv <= 2) return fshade(top[q], 0.62);
    return (level + (q % 7)) % 5 === 0 ? 0x4a3422 : level % 3 === 0 ? 0x5a4028 : 0x6a4a30;
  };
  const terrainMat = forestToon({ dapple: true });
  const ROWS = 96;
  for (let k0 = 0; k0 < D; k0 += ROWS) {
    const geo = G(meshRelief({ W, D, h, top, side, U: [VS, 0, 0], V: [0, 0, VS], N: [0, VY, 0], origin: [TB.x0, -BASE * VY, TB.z0], rows: [k0, k0 + ROWS], wallAO: false }));
    const m = new THREE.Mesh(geo, terrainMat);
    if (!lite) m.layers.enable(LAYER_OUTLINE); // (phones skip the ground's outline pass)
    m.userData.noBatch = true;
    group.add(m);
    stats.tris.terrain = (stats.tris.terrain || 0) + triCount(geo);
  }
  // ---- the outer ground: coarse voxels out to the hills (under the built ground it ducks down)
  {
    const OS = 1;
    const OW = Math.round((OUT.x1 - OUT.x0) / OS), OD = Math.round((OUT.z1 - OUT.z0) / OS);
    const oh = new Uint16Array(OW * OD), otop = new Uint32Array(OW * OD);
    for (let k = 0; k < OD; k++) for (let i = 0; i < OW; i++) {
      const x = OUT.x0 + (i + 0.5) * OS, z = OUT.z0 + (k + 0.5) * OS;
      const q = i + OW * k;
      const inside = x > TB.x0 + 0.1 && x < TB.x1 - 0.1 && z > TB.z0 + 0.1 && z < TB.z1 - 0.1;
      if (inside) { oh[q] = 1; otop[q] = 0; continue; } // the fine ground covers it (and the hole must stay open)
      const H = groundH(x, z);
      oh[q] = Math.max(1, Math.round(H / (VY * 3)) * 3 + BASE); // (coarse steps: neighbours share heights, caps merge)
      const p = n3(x * 0.3, z * 0.3) + n4(x * 0.9, z * 0.9) * 0.4;
      const hh = hash3(i, 1, k, 9);
      otop[q] = FIELD.trail(x, z) < 0.8 ? DIRT[(hh * 4) | 0] : p > 0.15 ? MOSS_C[(hh * 4) | 0] : LITTER[(hh * 4) | 0];
    }
    const oside = (q, level) => (oh[q] - level <= 1 ? fshade(otop[q], 0.8) : 0x5a4028);
    const outerMat = terrainMat;
    const OR = 64;
    for (let k0 = 0; k0 < OD; k0 += OR) {
      const geo = G(meshRelief({ W: OW, D: OD, h: oh, top: otop, side: oside, U: [OS, 0, 0], V: [0, 0, OS], N: [0, VY, 0], origin: [OUT.x0, -BASE * VY - 0.01, OUT.z0], rows: [k0, k0 + OR], wallAO: false }));
      const m = new THREE.Mesh(geo, outerMat);
      m.userData.noBatch = true;
      group.add(m);
      stats.tris.outer = (stats.tris.outer || 0) + triCount(geo);
    }
  }
  stats.terrainMs = Math.round(performance.now() - tt);
  await tick();
  if (cancelled()) return bail();

  // ---- tree meshes (instanced per variant, chunked so the ones off screen are culled)
  const ti = performance.now();
  const woodMat = forestToon({ dapple: true });
  const leafMat = (kl) => forestToon({ dapple: false, sway: 1, swayBase: 3, shimmer: 1, cell: kl, backlit: 0.9 });
  const add = (geo, mat, items, name, outline = true, cell = 14) => {
    if (!geo || !items.length) return;
    group.add(instanceChunked(geo, mat, items, { name, outline, cell }));
    stats.tris[name] = (stats.tris[name] || 0) + triCount(geo) * items.length;
  };
  const K = soft ? { w: 4, l: 2.6, c: 3.5, g: 4, gl: 2 } : lite ? { w: 4, l: 3, c: 4, g: 5, gl: 2.5 } : { w: 5, l: 3.6, c: 5, g: 6, gl: 3 };
  const near = {};
  for (const [kind, makers] of Object.entries({
    beech: lite ? [() => makeBroadleaf(101, { kind: 'beech', k: K.w, kl: K.l })] : [() => makeBroadleaf(101, { kind: 'beech', k: K.w, kl: K.l }), () => makeBroadleaf(117, { kind: 'beech', k: K.w, kl: K.l, height: 14.5, crownR: 4.6 })],
    oak: [() => makeBroadleaf(131, { kind: 'oak', k: K.w, kl: K.l })],
    birch: lite ? [() => makeBroadleaf(141, { kind: 'birch', k: K.w, kl: K.l })] : [() => makeBroadleaf(141, { kind: 'birch', k: K.w, kl: K.l }), () => makeBroadleaf(149, { kind: 'birch', k: K.w, kl: K.l, height: 10, leaf: [0xe8d868, 0xc8bc4c, 0xa49c3c, 0x7a7a30, 0x50542a] })],
    maple: [() => makeBroadleaf(151, { kind: 'maple', k: K.w, kl: K.l, height: 11, crownR: 3.6 })],
    spruce: lite ? [() => makeConifer(161, { kind: 'spruce', k: K.c, height: 14 })] : [() => makeConifer(161, { kind: 'spruce', k: K.c, height: 14 }), () => makeConifer(167, { kind: 'spruce', k: K.c, height: 16.5, spread: 2.7 })],
    pine: [() => makeConifer(171, { kind: 'pine', k: K.c, height: 17, spread: 2.2 })],
    snag: [() => makeSnag(181, { height: 7.5, k: 7 })],
  })) {
    near[kind] = [];
    for (const make of makers) { near[kind].push(make()); await tick(); if (cancelled()) return bail(); }
  }
  await tick();
  if (cancelled()) return bail();
  const mid = lite ? { spruce: [makeConifer(161, { kind: 'spruce', k: 3, height: 14, lod: true })] } : {
    beech: [makeBroadleaf(101, { kind: 'beech', k: 2.5, kl: 2, lod: true })],
    oak: [makeBroadleaf(131, { kind: 'oak', k: 2.5, kl: 2, lod: true })],
    birch: [makeBroadleaf(141, { kind: 'birch', k: 2.5, kl: 2, lod: true })],
    maple: [makeBroadleaf(151, { kind: 'maple', k: 2.5, kl: 2, lod: true, height: 11, crownR: 3.6 })],
    spruce: [makeConifer(161, { kind: 'spruce', k: 3, height: 14, lod: true })],
    pine: [makeConifer(171, { kind: 'pine', k: 2, height: 17, spread: 2.2, lod: true })],
    snag: [makeSnag(181, { height: 7.5, k: 3 })],
  };
  for (const set of [near, mid]) for (const list of Object.values(set)) for (const t of list) { G(t.wood); G(t.leaves); }
  for (const [kind, list] of Object.entries(near)) {
    const pick = (t) => t.v % list.length;
    list.forEach((geo, v) => {
      const its = (lod) => trees.filter((t) => t.kind === kind && t.near === !lod && (lod ? 0 : pick(t)) === (lod ? 0 : v)).map((t) => ({ x: t.x, y: groundH(t.x, t.z) - 0.06, z: t.z, ry: t.ry, s: t.s }));
      add(geo.wood, woodMat, its(false), kind + '-wood', true, 28);
      add(geo.leaves, leafMat(K.l), its(false), kind + '-leaves', false, 28);
      if (v === 0 && !lite) {
        const m = mid[kind][0];
        add(m.wood, woodMat, its(true), kind + '-wood-lod', false, 30);
        add(m.leaves, leafMat(2), its(true), kind + '-leaves-lod', false, 30);
      }
    });
  }
  await tick();
  if (cancelled()) return bail();
  // the giants
  const giantGeos = new Map();
  for (const g of GIANTS) {
    if (!giantGeos.has(g.seed)) {
      giantGeos.set(g.seed, makeBroadleaf(g.seed, { kind: 'giant', k: K.g, kl: K.gl, height: 17 + (g.seed % 3), crownR: 7.2 + (g.seed % 5) * 0.2 }));
      await tick();
  if (cancelled()) return bail();
    }
    const geo = giantGeos.get(g.seed);
    G(geo.wood); G(geo.leaves);
    // turn the hollow (local +z) toward the trail or the middle of the clearing
    let fx, fz;
    if (g.face === 'clear') { fx = -g.x; fz = -g.z; } else { const p = tp(TRAIL.P.reduce((b, q) => ((q.x - g.x) ** 2 + (q.z - g.z) ** 2 < (b.x - g.x) ** 2 + (b.z - g.z) ** 2 ? q : b), TRAIL.P[0]).s); fx = p.x - g.x; fz = p.z - g.z; }
    g.ry = Math.atan2(fx, fz);
    g.y = groundH(g.x, g.z) - 0.2;
  }
  for (const [seed, geo] of giantGeos) {
    const its = GIANTS.filter((g) => g.seed === seed).map((g) => ({ x: g.x, y: g.y, z: g.z, ry: g.ry, s: g.s }));
    add(geo.wood, woodMat, its, 'giant-wood', true, 40);
    add(geo.leaves, leafMat(K.gl), its, 'giant-leaves', false, 40);
  }
  // the far ring: voxel trees close in, silhouettes beyond
  {
    const midKinds = ['spruce', 'beech', 'spruce', 'oak', 'pine', 'birch', 'spruce', 'beech'];
    const lodItems = {};
    const bill = [];
    if (lite) for (const t of trees) if (!t.near) far.push({ x: t.x, z: t.z, ob: 99, roll: ({ spruce: 0, beech: 1, oak: 3, pine: 4, birch: 5 }[t.kind] ?? 1) / 8 + 0.01, s: t.s });
    for (const t of far) {
      const y = groundH(t.x, t.z) - 0.1;
      const kind = midKinds[Math.floor(t.roll * midKinds.length)];
      if (t.ob < (lite ? 0 : 3) && kind === 'spruce') (lodItems[kind] = lodItems[kind] || []).push({ x: t.x, y, z: t.z, ry: t.roll * 40, s: t.s });
      else bill.push({ x: t.x, y: y - 0.3, z: t.z, h: (kind === 'pine' ? 19 : kind === 'spruce' ? 16 : 13) * t.s, frame: kind === 'spruce' ? (t.roll * 7 | 0) % 2 : kind === 'pine' ? 2 + ((t.roll * 11 | 0) % 2) : kind === 'birch' ? 6 : 4 + ((t.roll * 13 | 0) % 2), tint: 0.85 + t.roll * 0.3 });
    }
    for (const [kind, its] of Object.entries(lodItems)) {
      const m = mid[kind][0];
      add(m.wood, woodMat, its, kind + '-wood-far', false, 40);
      add(m.leaves, leafMat(2), its, kind + '-leaves-far', false, 40);
    }
    const ft = makeFarTrees(bill, { key: MF.uKey.value });
    G(ft.geometry);
    group.add(ft);
    stats.far = bill.length;
  }
  stats.trees = trees.length;
  stats.treeMs = Math.round(performance.now() - ti);
  stats.giantMs = stats.giantMs || 0;
  await tick();
  if (cancelled()) return bail();

  // ---- the forest floor: logs, boulders, stumps, roots, the bridge, a signpost
  const tf = performance.now();
  const props = new THREE.Group();
  const spots = { logs: [], rocks: [], stumps: [] }; // for the critters
  const blocked = []; // footprints the undergrowth keeps off: [x, z, r]
  const plantMat = forestToon({ dapple: true, swayLocal: 0.6, swayAmp: 0.07 });
  const stiffMat = forestToon({ dapple: true });
  // great fallen logs (along the trail and in the forest)
  const logGeos = [G(makeFallenLogGeo(301, { len: 5.5, r: 0.5, k: lite ? 10 : 12 })), G(makeFallenLogGeo(307, { len: 4.2, r: 0.38, k: lite ? 10 : 12, hollow: false }))];
  const logs = [
    { at: beside(13.6, -2.4), ry: 0.25, v: 0 }, { at: beside(36, 3.2), ry: -0.5, v: 1 },
    { at: [6.8, 3.2], ry: 2.2, v: 1 }, { at: beside(4.5, 3.0), ry: 1.4, v: 0 }, { at: [-14, 30], ry: 0.9, v: 0 }, { at: [13, 34], ry: -1.1, v: 1 },
  ];
  const logItems = [[], []];
  logs.forEach((l, i) => {
    const [x, z] = l.at;
    const ry = l.ry + Math.atan2(tp(10).tx, tp(10).tz) * (i < 2 ? 1 : 0);
    const len = l.v ? 4.2 : 5.5;
    logItems[l.v].push({ x, y: groundH(x, z) - 0.12, z, ry });
    for (let s = -0.5; s <= 0.5; s += 0.25) blocked.push([x + Math.cos(ry) * s * len, z - Math.sin(ry) * s * len, 0.75]);
    spots.logs.push({ x, z, ry, len, top: groundH(x, z) + (l.v ? 0.62 : 0.85) });
  });
  logItems.forEach((its, v) => add(logGeos[v], stiffMat, its, 'logs', true, 40));
  // mossy boulders
  const rockGeos = [
    G(makeBoulderGeo(401, { w: 1.6, h: 1.0, d: 1.3 })), G(makeBoulderGeo(409, { w: 1.0, h: 0.7, d: 0.9, tone: 0x7e7a70 })),
    G(makeBoulderGeo(417, { w: 2.4, h: 1.5, d: 1.9, moss: 0.85 })), G(makeBoulderGeo(421, { w: 0.6, h: 0.4, d: 0.5, moss: 0.4, tone: 0x928a7c })),
  ];
  const rockItems = [[], [], [], []];
  const putRock = (x, z, v, s = 1, ry = 0) => {
    rockItems[v].push({ x, y: groundH(x, z) - 0.08, z, ry, s });
    const r = [0.8, 0.5, 1.2, 0.3][v] * s;
    blocked.push([x, z, r]);
    spots.rocks.push({ x, z, r, top: groundH(x, z) + [0.75, 0.5, 1.1, 0.3][v] * s });
  };
  for (let i = 0; i < (lite ? 16 : 30); i++) {
    const s = rng.range(0, TRAIL.L - 2);
    const off = rng.range(1.6, 9) * (rng.chance(0.5) ? 1 : -1);
    const [x, z] = beside(s, off);
    if (FIELD.stream(x, z) < 1.4 || Math.hypot(x, z) < HOLE_R + 2.2 || !giantClear(x, z, 0.4)) continue;
    putRock(x, z, rng.int(0, 3), rng.range(0.8, 1.25), rng.range(0, 6));
  }
  putRock(-5.0, -3.4, 2, 1, 0.5); putRock(5.8, 1.6, 0, 1, 2); putRock(-6.4, -0.8, 1, 1.1); putRock(3.4, 6.2, 3, 1.2);
  // stepping stones in the stream by the bridge
  const streamRocks = [];
  for (let i = 0; i < 7; i++) {
    const q = STREAM.curve.getPointAt(clamp((CROSS.ss + (i - 3) * 2.0 + (i > 3 ? 1.5 : -1.5)) / STREAM.L, 0, 1));
    const x = q.x + rng.range(-0.3, 0.3), z = q.z + rng.range(-0.3, 0.3);
    streamRocks.push({ x, z, r: 0.24 });
    rockItems[i % 2 ? 1 : 3].push({ x, y: waterY(CROSS.ss) - 0.25, z, ry: i, s: i % 2 ? 0.7 : 1.3 });
    spots.rocks.push({ x, z, r: 0.3, top: waterY(CROSS.ss) + 0.12, wet: true });
  }
  rockItems.forEach((its, v) => add(rockGeos[v], stiffMat, its, 'rocks', true, 30));
  // stumps
  const stumpGeo = G(makeStumpGeo(3));
  const stumps = [];
  for (let i = 0; i < 10; i++) {
    const s = trailAt(rng.range(4, TRAIL.L - 6));
    const sd = rng.chance(0.5) ? 1 : -1, off = rng.range(2.0, 4.5);
    const x = s.x + s.tz * sd * off, z = s.z - s.tx * sd * off;
    if (!ok(x, z, 1.8, 0.6) || Math.hypot(x, z) < CLEAR_R - 1) continue;
    stumps.push({ x, y: groundH(x, z), z, ry: rng.range(0, 6), s: rng.range(1.0, 1.5) });
    blocked.push([x, z, 0.4]);
    spots.stumps.push({ x, z, top: groundH(x, z) + 0.45 });
  }
  stumps.push({ x: -5.6, y: groundH(-5.6, 2.4), z: 2.4, ry: 1, s: 1.5 });
  spots.stumps.push({ x: -5.6, z: 2.4, top: groundH(-5.6, 2.4) + 0.5 });
  add(stumpGeo, stiffMat, stumps, 'stumps', true, 30);
  // roots arching out of the ground beside (and across the edge of) the trail near the giants
  {
    const rootGeos = [G(makeRootArcGeo(501, { span: 1.8, r: 0.08, rise: 0.18 })), G(makeRootArcGeo(509, { span: 1.3, r: 0.06, rise: 0.12 }))];
    const its = [[], []];
    for (const g of GIANTS) {
      for (let i = 0; i < 4; i++) {
        const a = g.ry + (i - 1.5) * 0.55 + rng.range(-0.2, 0.2);
        const d = 3.2 + rng.range(0, 1.5);
        const x = g.x + Math.sin(a) * d, z = g.z + Math.cos(a) * d;
        if (FIELD.trail(x, z) < 0.5 || FIELD.stream(x, z) < 1 || Math.hypot(x, z) < HOLE_R + 1.5) continue;
        its[i % 2].push({ x, y: groundH(x, z) - 0.03, z, ry: a + Math.PI / 2 });
      }
    }
    its.forEach((l, v) => add(rootGeos[v], stiffMat, l, 'roots', true, 30));
  }
  // the footbridge across the stream
  const bridgeGeo = G(makeBridgeGeo(3.4));
  const tgB = TRAIL.curve.getTangentAt(CROSS.s / TRAIL.L);
  const bx = CROSS.x, bz = CROSS.z;
  const by = Math.max(groundH(bx + tgB.x * 1.9, bz + tgB.z * 1.9), groundH(bx - tgB.x * 1.9, bz - tgB.z * 1.9)) + 0.02;
  const bridge = new THREE.Mesh(bridgeGeo, stiffMat);
  bridge.layers.enable(LAYER_OUTLINE);
  bridge.position.set(bx, by, bz);
  bridge.rotation.y = Math.atan2(tgB.x, tgB.z);
  props.add(bridge);
  FOREST.bridgeY = by + 5 / 16;
  FOREST.bridge = { x: bx, z: bz, s: CROSS.s, half: 1.7, y: by + 5 / 16 - 0.03 };
  // a signpost where the trail bends toward the clearing
  {
    const s = trailAt(CROSS.s + 3.4);
    const sign = new THREE.Mesh(G(makeSignGeo()), stiffMat);
    sign.layers.enable(LAYER_OUTLINE);
    sign.position.set(s.x + s.tz * 1.3, groundH(s.x + s.tz * 1.3, s.z - s.tx * 1.3), s.z - s.tx * 1.3);
    sign.rotation.y = s.yaw + 2.2;
    sign.scale.setScalar(1.1);
    props.add(sign);
    spots.sign = { x: sign.position.x, z: sign.position.z, top: sign.position.y + 1.75 };
  }
  group.add(props);
  await tick();
  if (cancelled()) return bail();

  // ---- undergrowth in voxels: ferns, moss cushions, mushrooms, foxgloves, shrubs
  const free = (x, z, r = 0.3) => {
    for (const [bx2, bz2, br] of blocked) if ((bx2 - x) ** 2 + (bz2 - z) ** 2 < (br + r) ** 2) return false;
    for (const t of trees) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (0.45 * t.s + r) ** 2) return false;
    for (const g of GIANTS) if ((g.x - x) ** 2 + (g.z - z) ** 2 < (1.3 * g.s + r) ** 2) return false;
    return true;
  };
  const urng = makeRng(313);
  const scatter = (n, place) => {
    for (let i = 0; i < n * 6 && n > 0; i++) {
      const x = urng.range(BOX.x0 + 1, BOX.x1 - 1), z = urng.range(BOX.z0 + 1, BOX.z1 - 1);
      if (place(x, z, FIELD.trail(x, z), FIELD.stream(x, z), Math.hypot(x, z))) n--;
    }
  };
  const fernGeos = [G(makeFernGeo(601, { r: 0.55, k: lite ? 12 : 14 })), G(makeFernGeo(607, { r: 0.4, k: lite ? 12 : 14 })), G(makeFernGeo(613, { r: 0.7, k: lite ? 11 : 13 })), G(makeFernGeo(619, { r: 0.5, k: 12, dry: 0.55 }))];
  const fernIts = [[], [], [], []];
  scatter(soft ? 80 : lite ? 150 : 400, (x, z, td, sd, r) => {
    if (td < 1.15 || sd < 1.1 || (r < CLEAR_R + 0.4 && r > HOLE_R + 0.6 && urng() > 0.12) || r < HOLE_R + 0.6) return false;
    // thickest along the verges and in the hollows; patchy deeper in
    const want = (td < 6 ? 0.85 : 0.45) * (0.6 + 0.4 * n3(x * 0.25, z * 0.25) + 0.3);
    if (urng() > want || !free(x, z, 0.35)) return false;
    const v = urng() < 0.08 ? 3 : urng() < 0.25 ? 2 : urng() < 0.55 ? 1 : 0;
    fernIts[v].push({ x, y: groundH(x, z) - 0.03, z, ry: urng.range(0, 6.28), s: urng.range(0.75, 1.25) });
    return true;
  });
  fernIts.forEach((its, v) => add(fernGeos[v], plantMat, its, 'ferns', false, 26));
  const mossGeos = [G(makeMossGeo(701)), G(makeMossGeo(709, { r: 0.7, h: 0.22 }))];
  const mossIts = [[], []];
  scatter(lite ? 70 : 170, (x, z, td, sd, r) => {
    if (td < 1.2 || sd < 1.0 || r < CLEAR_R - 0.5 || !free(x, z, 0.3)) return false;
    mossIts[urng() < 0.4 ? 1 : 0].push({ x, y: groundH(x, z) - 0.04, z, ry: urng.range(0, 6.28), s: urng.range(0.7, 1.4) });
    return true;
  });
  // moss round the foot of every boulder
  for (const r of spots.rocks) if (!r.wet && urng() < 0.7) { const a = urng.range(0, 6.28); mossIts[0].push({ x: r.x + Math.cos(a) * r.r, y: groundH(r.x, r.z) - 0.04, z: r.z + Math.sin(a) * r.r, ry: a, s: 1 }); }
  mossIts.forEach((its, v) => add(mossGeos[v], stiffMat, its, 'moss', false, 30));
  const shroomKinds = ['agaric', 'porcini', 'chanterelle', 'inkcap', 'puffball', 'brown'];
  const shroomGeos = shroomKinds.map((kind, i) => G(makeMushroomGeo(801 + i * 7, { kind, n: kind === 'agaric' ? 3 : kind === 'brown' ? 5 : 4, scale: kind === 'agaric' ? 1.15 : 1 })));
  const shroomIts = shroomKinds.map(() => []);
  const shroomNear = [...trees.filter((t) => t.near).map((t) => [t.x, t.z, 0.6 * t.s]), ...GIANTS.map((g) => [g.x, g.z, 1.6]), ...spots.logs.map((l) => [l.x, l.z, 0.8]), ...spots.stumps.map((s) => [s.x, s.z, 0.45])];
  for (let i = 0; i < (lite ? 40 : 95); i++) {
    const [cx, cz, cr] = shroomNear[urng.int(0, shroomNear.length - 1)];
    const a = urng.range(0, 6.28), d = cr + urng.range(0.1, 0.6);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    if (FIELD.trail(x, z) < 0.9 || FIELD.stream(x, z) < 1) continue;
    const v = urng() < 0.3 ? 0 : urng.int(1, shroomKinds.length - 1);
    shroomIts[v].push({ x, y: groundH(x, z) - 0.02, z, ry: urng.range(0, 6.28), s: urng.range(0.55, 0.9) });
  }
  // a fairy ring of little brown mushrooms round the clearing's crust
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + urng.range(-0.08, 0.08), r = 2.55 + urng.range(-0.12, 0.12);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 0.7 && z > 0) continue; // where he walks in
    shroomIts[5].push({ x, y: -0.01, z, ry: a, s: urng.range(0.4, 0.55) });
  }
  // a few toadstools by the trail where the camera passes close
  for (const s of [5.5, 14.2, 19.5, 33, 41]) { const [x, z] = beside(s, urng.chance(0.5) ? 1.25 : -1.35); shroomIts[0].push({ x, y: groundH(x, z) - 0.02, z, ry: s, s: 0.8 }); }
  shroomIts.forEach((its, v) => add(shroomGeos[v], stiffMat, its, 'mushrooms', true, 30));
  const fox = [G(makeFoxgloveGeo(901)), G(makeFoxgloveGeo(907, { h: 1.1, color: 0xe8a0d0 })), G(makeFoxgloveGeo(911, { h: 0.75, color: 0xa860c8 }))];
  const foxIts = [[], [], []];
  scatter(lite ? 25 : 60, (x, z, td, sd, r) => {
    if (!((td > 1.1 && td < 3.6) || (r > CLEAR_R - 1.5 && r < CLEAR_R + 1.5)) || sd < 1.2 || !free(x, z, 0.2)) return false;
    foxIts[urng.int(0, 2)].push({ x, y: groundH(x, z) - 0.02, z, ry: urng.range(0, 6.28), s: urng.range(0.85, 1.2) });
    return true;
  });
  foxIts.forEach((its, v) => add(fox[v], plantMat, its, 'foxgloves', false, 30));
  const shrubGeos = [G(makeShrubGeo(1001, { berry: 0x4a5ad0 })), G(makeShrubGeo(1009, { r: 0.7, h: 0.6, berry: 0xd82a2a, leaf: [0x5a7a3a, 0x46682e, 0x345626, 0x26421e] })), G(makeShrubGeo(1013, { r: 0.6, h: 0.5 }))];
  const shrubIts = [[], [], []];
  scatter(lite ? 35 : 80, (x, z, td, sd, r) => {
    if (td < 1.6 || sd < 1.3 || r < CLEAR_R - 0.6 || !free(x, z, 0.5)) return false;
    shrubIts[urng.int(0, 2)].push({ x, y: groundH(x, z) - 0.04, z, ry: urng.range(0, 6.28), s: urng.range(0.8, 1.3) });
    return true;
  });
  shrubIts.forEach((its, v) => add(shrubGeos[v], plantMat, its, 'shrubs', false, 30));
  // the trail's own litter: pebbles, twigs and fallen leaves (what a camera at boot height sees)
  {
    const geos = [G(makePebblesGeo(1101)), G(makePebblesGeo(1107)), G(makeTwigGeo(1111)), G(makeTwigGeo(1117)), G(makeLeavesGeo(1121)), G(makeLeavesGeo(1127, { n: 10 }))];
    const its = geos.map(() => []);
    const lr = makeRng(1131);
    for (let i = 0; i < (lite ? 120 : 260); i++) {
      const s = lr.range(0, TRAIL.L - 1.5);
      const off = lr.range(-1.8, 1.8);
      const [x, z] = beside(s, off);
      if (FIELD.stream(x, z) < 0.9 || Math.hypot(x, z) < HOLE_R + 0.5) continue;
      const v = Math.abs(off) < 0.7 ? lr.int(0, 5) : lr.int(2, 5);
      its[v].push({ x, y: groundH(x, z) - 0.005, z, ry: lr.range(0, 6.28), s: lr.range(0.8, 1.3) });
    }
    its.forEach((l, v) => add(geos[v], stiffMat, l, 'litter', false, 30));
  }
  stats.floorMs = Math.round(performance.now() - tf);
  await tick();
  if (cancelled()) return bail();

  // ---- the stream
  const streamPts = STREAM.P.filter((_, i) => i % 3 === 0).map((p) => new THREE.Vector3(p.x, waterY(p.s), p.z));
  const stream = makeStream(streamPts, 1.45, streamRocks);
  G(stream.geometry);
  group.add(stream);

  // ---- grass and flowers (pixel quads): the meadow in the clearing, the verges, the forest floor
  const tg = performance.now();
  const items = [];
  const grng = makeRng(91);
  const put = (x, z, cell, size, tint = 1) => items.push({ x, y: groundH(x, z) - 0.02, z, rot: grng.range(0, 6.28), size, cell, tint });
  const N = soft ? 3200 : lite ? 5200 : 16000;
  for (let i = 0; i < N; i++) {
    const x = grng.range(BOX.x0 + 0.5, BOX.x1 - 0.5), z = grng.range(BOX.z0 + 0.5, BOX.z1 - 0.5);
    const td = FIELD.trail(x, z), sd = FIELD.stream(x, z), r = Math.hypot(x, z);
    if (r < HOLE_R + 0.22) continue; // the crust carries its own
    if (td < 0.62) { if (grng() < 0.05) put(x, z, FG.short, 0.14, 0.9); continue; }
    if (sd < 0.62) continue;
    if (Math.abs(x) < 0.9 && z > -0.5 && z < 2.6) continue; // the walk up to the chest
    const tint = 0.85 + grng() * 0.3;
    const roll = grng();
    if (sd < 1.35) { put(x, z, roll < 0.45 ? FG.reed : roll < 0.6 ? FG.cattail : roll < 0.8 ? FG.tall : FG.forgetme, roll < 0.8 ? grng.range(0.5, 0.85) : 0.3, tint); continue; }
    if (r < 2.9) {
      // round the chest the turf is short (it was grazed): daisies and clover
      put(x, z, roll < 0.08 ? FG.daisy : roll < 0.14 ? FG.clover : roll < 0.18 ? FG.buttercup : roll < 0.6 ? FG.short : FG.mid, grng.range(0.16, 0.26), tint);
      continue;
    }
    if (r < CLEAR_R + 0.6) {
      // the clearing: a tall summer meadow
      const fl = roll < 0.05 ? FG.daisy : roll < 0.09 ? FG.buttercup : roll < 0.12 ? FG.campion : roll < 0.14 ? FG.seed : roll < 0.17 ? FG.clover : roll < 0.19 ? FG.forgetme : roll < 0.55 ? FG.tall : roll < 0.85 ? FG.mid : FG.short;
      put(x, z, fl, fl === FG.tall ? grng.range(0.42, 0.62) : fl === FG.mid ? grng.range(0.3, 0.45) : grng.range(0.22, 0.34), tint);
      continue;
    }
    if (!free(x, z, 0.05)) continue;
    // bluebell drifts and anemone carpets under the broadleaves
    const drift = n4(x * 0.11 + 3, z * 0.11);
    if (td > 1.4 && drift > 0.28) { if (grng() < 0.85) put(x, z, drift > 0.4 && roll < 0.7 ? FG.bluebell : roll < 0.5 ? FG.bluebell : FG.short, grng.range(0.22, 0.32), tint); continue; }
    if (td > 1.4 && drift < -0.32) { if (grng() < 0.7) put(x, z, roll < 0.6 ? FG.anemone : FG.sorrel, grng.range(0.16, 0.24), tint); continue; }
    if (td < 2.4) {
      const fl = roll < 0.06 ? FG.buttercup : roll < 0.1 ? FG.campion : roll < 0.14 ? FG.strawberry : roll < 0.2 ? FG.fern : roll < 0.6 ? FG.mid : roll < 0.8 ? FG.tall : FG.dry;
      put(x, z, fl, fl === FG.fern ? grng.range(0.4, 0.6) : grng.range(0.25, 0.45), tint);
      continue;
    }
    if (grng() < 0.4) continue;
    const fl = roll < 0.25 ? FG.sorrel : roll < 0.45 ? FG.moss : roll < 0.6 ? FG.fern : roll < 0.7 ? FG.bracken : roll < 0.8 ? FG.strawberry : FG.short;
    put(x, z, fl, fl === FG.fern || fl === FG.bracken ? grng.range(0.4, 0.7) : grng.range(0.14, 0.26), tint * 0.92);
  }
  const grass = makeForestGrassChunked(items, { bright: 0.95, cell: 16 });
  grass.traverse((o) => { if (o.geometry) G(o.geometry); });
  group.add(grass);
  stats.grass = items.length;
  stats.grassMs = Math.round(performance.now() - tg);

  // ---- low mist over the stream and in the hollows; the sky
  const mists = [];
  for (const [x, y, z, w, d, a] of [[-6, -0.2, 19, 16, 5, 0.85], [9, -0.15, 21, 14, 5, 0.85], [-12, 0.4, 30, 18, 12, 0.5], [12, 0.6, 8, 16, 14, 0.45], [-10, 0.3, -6, 16, 12, 0.5], [0, 0.9, 40, 22, 10, 0.4]]) {
    const m = makeMist(x, y, z, w, d, { alpha: a, seed: x * 0.13 + z * 0.07, color: 0xf4ecd8 });
    G(m.geometry);
    mists.push(m);
    group.add(m);
  }
  const sky = makePaintedSky();
  G(sky.geometry);

  // ---- the clearing: the chest on its crust, the spill, the cracks
  const crust = makeCrust({ R: HOLE_R + 0.3, cell: VS, inCrust, colorAt: (x, z) => groundColor(x, z, Math.floor(x / VS), Math.floor(z / VS)), seed: 11, nPieces: 9 });
  for (const p of crust) {
    group.add(p.mesh);
    const its = p.tufts.map((t) => ({ x: t.x, y: -0.01, z: t.z, rot: t.k * 40, size: 0.15 + t.k * 0.12, cell: t.k < 0.08 ? FG.daisy : t.k < 0.14 ? FG.buttercup : t.k < 0.2 ? FG.clover : FG.short, tint: 0.9 + t.k * 0.2 }));
    if (its.length) { const gm = makeForestGrassChunked(its, { bright: 0.95, cell: 99 }); p.mesh.add(gm); }
  }
  const chest = makeChest(7);
  chest.group.position.set(0, 0, -0.12);
  group.add(chest.group);
  const spill = makeSpill(3);
  spill.mesh.position.set(0, 0, -0.12 + chest.size[2] / 2);
  spill.mesh.userData.dynamic = true;
  group.add(spill.mesh);
  const cracks = makeCracks({ size: 9.6, R0: HOLE_R + 0.05, n: 13, seed: 5 });
  cracks.mesh.visible = false;
  textures.push(cracks.texture);
  group.add(cracks.mesh);
  // the underside of the crust (seen from the hollow below)
  const ceil = new THREE.Mesh(new THREE.RingGeometry(HOLE_R - 0.15, 4.8, 40, 1), new THREE.MeshBasicMaterial({ color: 0x1a120c, side: THREE.DoubleSide }));
  G(ceil.geometry);
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.y = -(16 / 16) + 0.01;
  group.add(ceil);
  // glints over the treasure
  const glintPts = [];
  const chestPos = chest.group.position;
  for (const g of chest.glints) glintPts.push({ pos: [g.pos[0] + chestPos.x, g.pos[1] + chestPos.y, g.pos[2] + chestPos.z], color: g.color, size: 2, shape: SHAPE.plus, big: 4, bigShape: SHAPE.plus, speed: 1.4 + (glintPts.length % 5) * 0.4, phase: glintPts.length * 1.7, sharp: 10, amp: 1 });
  for (const g of spill.glints) glintPts.push({ pos: [g.pos[0] + spill.mesh.position.x, g.pos[1], g.pos[2] + spill.mesh.position.z], color: g.color, size: 2, shape: SHAPE.plus, big: g.gem ? 4 : 3, bigShape: SHAPE.plus, speed: 1.1 + (glintPts.length % 4) * 0.5, phase: glintPts.length * 2.3, sharp: 12, amp: 1 });
  const glints = new Twinkles(glintPts, { additive: true, atten: false });
  glints.points.renderOrder = 9;
  group.add(glints.points);
  const chestGlow = makeGlow({ color: 0xffc860, size: 1.1, intensity: 0.5, falloff: 1.8, levels: 4 });
  chestGlow.position.copy(chest.glowPos).add(chestPos);
  group.add(chestGlow);

  // ---- light shafts through the canopy (beams re-face the camera every frame)
  const beams = [];
  /** A shaft of light from top to bottom (Vector3s), w wide; it turns to face the camera. */
  const addBeam = (topP, bottom, w, inten, color = 0xffe2b0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), beamMaterial(inten, color));
    G(m.geometry);
    m.userData.beam = { top: topP, bottom, w, len: topP.distanceTo(bottom), base: inten, ph: bottom.x * 1.7 + bottom.z };
    m.renderOrder = 7;
    m.frustumCulled = false;
    beams.push(m);
    group.add(m);
    return m;
  };
  const beamAt = (x, z, len, w, inten, color = 0xffe2b0) => {
    const bottom = new THREE.Vector3(x, groundH(x, z), z);
    return addBeam(bottom.clone().addScaledVector(SUN_DIR, len), bottom, w, inten, color);
  };
  beamAt(0.2, 0.4, 16, 2.6, 0.36, 0xffdca0); // the big one, on the chest
  beamAt(-1.9, -2.6, 14, 1.1, 0.24);
  beamAt(2.6, -1.9, 14, 0.9, 0.22);
  beamAt(-3.2, 2.6, 13, 0.7, 0.2);
  for (const s of soft ? [7.5, 16.5, 31, 40] : [3, 7.5, 12, 16.5, 21, 25.5, 31, 35.5, 40, 44]) { const [x, z] = beside(s, (s * 7) % 3 - 1.2); beamAt(x + 0.8, z - 0.6, 13, 0.6 + ((s * 13) % 5) * 0.12, 0.18 + ((s * 3) % 4) * 0.02); }
  if (!soft) for (const [x, z] of [[-5, 14], [6, 27], [-3, 36], [9, 12], [-9, 20]]) beamAt(x, z, 14, 0.8, 0.16);

  // ---- no wildlife in the forest (birds, butterflies and dragonflies are left out; the lists stay empty)
  const sw = swallowSheet();
  const bf = butterflySheet();
  const df = dragonflySheet();
  textures.push(sw.texture, bf.texture, df.texture);
  const birds = [];
  for (let i = 0; i < 0; i++) {
    const m = makeSheetSprite(sw.texture, { cols: sw.cols, size: [0.42, 0.42 / sw.aspect], anchor: [0.5, 0.5], renderOrder: 6 });
    m.userData.bird = { ph: i * 1.7, r: 6 + i * 1.6, h: 6 + (i % 3) * 1.4, sp: 0.45 + (i % 2) * 0.15, cx: (i - 2) * 1.5, cz: i < 3 ? 0 : 20 };
    birds.push(m);
    group.add(m);
  }
  const flies = [];
  for (let i = 0; i < 0; i++) {
    const m = makeSheetSprite(bf.texture, { cols: bf.cols, size: [0.13, 0.115], anchor: [0.5, 0.5], renderOrder: 6 });
    const home = i < 5 ? [Math.cos(i * 1.3) * 3.8, Math.sin(i * 1.3) * 3.8] : beside(6 + i * 4, i % 2 ? 1.4 : -1.6);
    m.userData.fly = { sp: (i % 4) * 4, ph: i * 2.1, home, y: 0.45 + (i % 3) * 0.22 };
    flies.push(m);
    group.add(m);
  }
  const dflies = [];
  for (let i = 0; i < 0; i++) {
    const m = makeSheetSprite(df.texture, { cols: df.cols, size: [0.16, 0.09], anchor: [0.5, 0.5], renderOrder: 6 });
    const q = STREAM.curve.getPointAt(clamp((CROSS.ss + (i - 1.5) * 3) / STREAM.L, 0, 1));
    m.userData.df = { x: q.x, z: q.z, ph: i * 2.7, y: waterY(CROSS.ss) + 0.35 + i * 0.08 };
    dflies.push(m);
    group.add(m);
  }

  // ---- far chunks are hidden (the fog has them by then)
  const cullDist = soft ? 32 : lite ? 44 : 68;
  const cullable = [];
  group.traverse((o) => {
    if (o.isInstancedMesh && o.boundingSphere) cullable.push({ m: o, c: o.boundingSphere.center, r: o.boundingSphere.radius });
    else if (soft && o.isMesh && o.frustumCulled && o.geometry && o.geometry.isInstancedBufferGeometry && o.geometry.boundingSphere) cullable.push({ m: o, c: o.geometry.boundingSphere.center, r: o.geometry.boundingSphere.radius - 8 });
  });

  // ---- per-frame
  let time = 0;
  const _side = new THREE.Vector3(), _axis = new THREE.Vector3(), _to = new THREE.Vector3(), _n = new THREE.Vector3(), _mid = new THREE.Vector3();
  const _basis = new THREE.Matrix4();
  const F = {};
  const update = (dt, camera, fog) => {
    time += dt;
    updateMF(dt, camera, fog);
    glints.update(dt, F.glintGain ?? 1);
    const cp = camera.position;
    for (const c of cullable) c.m.visible = c.c.distanceTo(cp) - c.r < cullDist;
    for (const b of beams) {
      const B = b.userData.beam;
      _axis.subVectors(B.top, B.bottom).normalize();
      _mid.addVectors(B.top, B.bottom).multiplyScalar(0.5);
      _to.subVectors(cp, _mid);
      _side.crossVectors(_axis, _to).normalize();
      _n.crossVectors(_side, _axis).normalize();
      _basis.makeBasis(_side, _axis, _n);
      b.quaternion.setFromRotationMatrix(_basis);
      b.position.copy(_mid);
      b.scale.set(B.w, B.len, 1);
      const u = b.material.uniforms;
      u.uTime.value = time;
      // the canopy moves: each shaft breathes a little
      u.uIntensity.value = B.base * (0.8 + 0.2 * Math.sin(time * 0.6 + B.ph) * Math.sin(time * 0.23 + B.ph * 0.5));
      b.visible = B.base > 0.001;
      // fade out when the camera is in (or right by) the beam: it would wash over the screen
      _to.subVectors(cp, B.bottom);
      const along = clamp(_to.dot(_axis), 0, B.len);
      const d = _to.addScaledVector(_axis, -along).length();
      u.uFade.value = sm(B.w * 0.6, B.w * 0.6 + 2.5, d);
    }
    for (const m of birds) {
      const B = m.userData.bird;
      const a = B.ph + time * B.sp;
      m.position.set(B.cx + Math.cos(a) * B.r, B.h + Math.sin(a * 2.3) * 0.8, B.cz + Math.sin(a) * B.r * 0.6);
      m.userData.sheet.uFrame.value = Math.floor(time * 9 + B.ph * 3) % 4;
    }
    for (const m of flies) {
      if (m.userData.pinned) { m.userData.sheet.uFrame.value = m.userData.fly.sp + (Math.floor(time * 14) % 4); continue; }
      const F = m.userData.fly;
      const a = time * 0.7 + F.ph;
      const x = F.home[0] + Math.sin(a) * 1.2 + Math.sin(a * 2.7) * 0.3, z = F.home[1] + Math.cos(a * 0.8) * 1.0;
      m.position.set(x, groundH(x, z) + F.y + Math.sin(a * 5) * 0.12, z);
      m.userData.sheet.uFrame.value = F.sp + (Math.floor(time * 12 + F.ph * 5) % 4);
    }
    for (const m of dflies) {
      const F = m.userData.df;
      const a = time * 0.9 + F.ph;
      // dart, hover, dart
      const k = Math.floor(a), f = a - k, ease = f < 0.25 ? f / 0.25 : 1;
      const ox = Math.sin(k * 2.1 + F.ph) * 1.2, oz = Math.cos(k * 1.7) * 0.6, px = Math.sin((k - 1) * 2.1 + F.ph) * 1.2, pz = Math.cos((k - 1) * 1.7) * 0.6;
      m.position.set(F.x + lerp(px, ox, ease), F.y + Math.sin(a * 7) * 0.03, F.z + lerp(pz, oz, ease));
      m.userData.sheet.uFrame.value = Math.floor(time * 30) % 2;
    }
  };

  const dispose = () => {
    for (const g of geos) { try { g.dispose(); } catch (e) { /* shared */ } }
    // our own materials (the voxel kit's shared ones are flagged userData.shared and stay)
    const mats = new Set();
    group.traverse((o) => { if (o.material && !o.material.userData?.shared) mats.add(o.material); });
    mats.add(sky.material);
    for (const m of mats) { try { m.dispose(); } catch (e) { /* noop */ } }
    resetMeadowMaterials();
    resetForestMaterials();
  };
  stats.ms = Math.round(performance.now() - t0);
  let total = 0;
  for (const v of Object.values(stats.tris)) total += v;
  stats.trisTotal = total;
  return Object.assign(F, {
    group, sky, textures, crust, cracks, chest, spill, glints, chestGlow, ceil, stream, mists, beams, bridge, stats, update, dispose,
    holeY: -1.0, spots, birds, flies, giants: GIANTS, addBeam,
  });
}

// a beam material with a fade (the fx.js beam, plus uFade)
const BEAM_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
uniform float uFade;
varying vec2 vUv;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  float x = abs(vUv.x * 2.0 - 1.0);
  float core = pow(1.0 - x, 1.6);
  float v = vUv.y;
  float along = smoothstep(0.0, 0.25, v) * smoothstep(1.0, 0.6, v);
  // motes and the canopy's flicker drifting down the shaft
  float shimmer = 0.78 + 0.22 * sin(v * 19.0 - uTime * 1.3 + sin(vUv.x * 7.0 + uTime * 0.7) * 1.5);
  float i = core * along * shimmer * uIntensity * uFade;
  float q = floor(i * 6.0 + bayer4(gl_FragCoord.xy)) / 6.0;
  if (q <= 0.0) discard;
  gl_FragColor = vec4(uColor * q, 1.0);
}`;
function beamMaterial(intensity, color = 0xffe6b0) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}
