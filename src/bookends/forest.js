// The forest trail on the surface, where the journey begins: a dirt trail winding north through
// tall pines, oaks and birches, over a stream on a log footbridge, into a sunny clearing where a
// strange old chest sits on a thin crust of turf over a hollow. Sun dapple drifts over the floor,
// light shafts fall through the canopy, low mist hangs over the stream, ferns, grass and flowers
// sway, swallows and butterflies cross, fireflies and pollen float in the beams.
// Metres, y up, the hole (and the chest) at the origin; the trail comes in from the south (+z).
//
//   const F = buildForest();  scene.add(F.group);  F.update(dt, camera, fog);  F.dispose();
//   FOREST.trail.at(s) → { x, y, z, yaw } (s: metres along the trail), FOREST.trail.length
//   groundH(x, z), F.crust (pieces), F.cracks, F.chest, F.spill, F.glints, F.bridge, F.stream
import * as THREE from 'three';
import { meshRelief, hash3, fshade, fmix } from './vox.js';
import { makeNoise2D, makeRng, clamp, lerp } from '../core/util.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { MF, initMF, updateMF, makeGrassField, GRASS, makeSky, butterflySheet, swallowSheet, resetMeadowMaterials } from './meadowfx.js';
import { FF, GLSL_DAPPLE, forestToon, makeOpenness, makeStream, makeMist, resetForestMaterials } from './forestfx.js';
import { makePineGeo, makeStumpGeo, makeBridgeGeo, makeSignGeo, instance, instanceChunked } from './foresttrees.js';
import { makeOak, makeBirch, makeBush } from './landscape.js';
import { makeRock, makeLog, makeMushrooms } from './props.js';
import { makeChest, makeSpill, makeCrust, makeCracks } from './chest.js';
import { makeSheetSprite, Twinkles, SHAPE, makeGlow } from './fx.js';
import { batchStatic } from './batch.js';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';

const VS = 1 / 8; // terrain voxel
const BASE = 16; // ground level 0 sits 16 voxels above the bottom of the terrain grid
const BOX = { x0: -26, x1: 26, z0: -22, z1: 50 };
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const n1 = makeNoise2D(501), n2 = makeNoise2D(502), n3 = makeNoise2D(503), n4 = makeNoise2D(504);

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
  return { trail: (x, z) => sample(td, x, z), trailS: (x, z) => sample(ts, x, z), stream: (x, z) => sample(sd, x, z), streamS: (x, z) => sample(ss, x, z) };
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
  H += sm(5, 20, td) * 1.5 * sm(8, 17, Math.hypot(x, z)); // the ground rises away from the trail (gently round the clearing)
  H = lerp(H, trailY(ts) - 0.05, sm(2.6, 0.9, td)); // the trail is a smooth, slightly sunken band
  // ruts and pebble bumps on the trail
  if (td < 0.8) H -= (Math.abs(Math.abs(td) - 0.38) < 0.08 ? 0.04 : 0);
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
  const L = TRAIL.L;
  const t = clamp(s / L, 0, 1);
  const p = TRAIL.curve.getPointAt(t), tg = TRAIL.curve.getTangentAt(t);
  out.x = p.x; out.z = p.z;
  out.y = groundH(p.x, p.z);
  out.yaw = Math.atan2(tg.x, tg.z);
  out.tx = tg.x; out.tz = tg.z;
  return out;
}

export const FOREST = {
  trail: { at: trailAt, length: TRAIL.L, curve: TRAIL.curve, cross: CROSS },
  stream: STREAM,
  box: BOX,
  bridgeY: 0,
};

// ------------------------------------------------------------------ colours
const GRASS_C = [0x5e9a3a, 0x6aa842, 0x78b84a, 0x528a34];
const MOSS_C = [0x4e7a34, 0x5a8a3a, 0x46702e, 0x6a9a42];
const LITTER = [0x6a5032, 0x7a5a38, 0x5a4228, 0x8a5a32];
const DIRT = [0xa8865a, 0x987650, 0xb8966a, 0x8a6a46];
const MUD = [0x5a4630, 0x4a3a28, 0x6a5238];

/** Ground colour at a point: trail dirt, clearing grass, moss and litter under the trees, mud banks. */
export function groundColor(x, z, i = 0, k = 0, nearTree = 0) {
  const td = FIELD.trail(x, z), sd = FIELD.stream(x, z);
  const r = Math.hypot(x, z);
  const p1 = n3(x * 0.6, z * 0.6), p2 = n4(x * 1.7, z * 1.7);
  const h = hash3(i, 0, k, 7);
  if (sd < 0.75) return h < 0.12 ? 0x8a8278 : sd < 0.55 ? MUD[(h * 3) | 0] : 0xb8a070; // stones, mud, sand
  if (td < 0.62 + p2 * 0.12) {
    // the trail: packed dirt, pebbles, a root or two crossing, worn grass at the edges
    if (h < 0.05) return 0x8a8278;
    if (h > 0.97) return 0xc8b494;
    if (td > 0.5 && p1 > 0) return GRASS_C[3];
    return DIRT[((p1 * 2 + 2) | 0) % 4];
  }
  if (r < CLEAR_R + p1 * 1.2) {
    // the clearing: meadow grass in patches, sunny
    const c = GRASS_C[((p1 * 1.5 + p2 + 2) | 0) % 3];
    return h < 0.03 ? 0x8ac458 : c;
  }
  // the forest floor: moss and leaf litter in patches, pine needles near the trunks
  if (nearTree > 0.5 && p2 > -0.2) return LITTER[3];
  if (p1 + p2 * 0.4 > 0.15) return MOSS_C[((p2 * 2 + 2) | 0) % 4];
  if (td < 1.3) return h < 0.5 ? GRASS_C[3] : MOSS_C[1];
  return LITTER[((p2 * 2 + 2) | 0) % 3];
}

// ------------------------------------------------------------------ build
/**
 * Build the forest. Returns { group, sky, textures, crust, cracks, chest, spill, glints, update,
 * dispose, stats, bridge, stream, holeY }.
 */
export function buildForest(opts = {}) {
  const t0 = performance.now();
  const lite = !!opts.lite; // phones: fewer, coarser trees and less undergrowth
  const textures = initMF();
  const group = new THREE.Group();
  group.name = 'forest';
  const stats = {};
  const rng = makeRng(77);
  MF.uSun.value.copy(SUN_DIR);

  // ---- trees: where they stand (decided first: the ground under them is littered with needles)
  const trees = [];
  const ok = (x, z, minTrail) => {
    if (x < BOX.x0 + 1 || x > BOX.x1 - 1 || z < BOX.z0 + 1 || z > BOX.z1 - 1) return false;
    if (FIELD.trail(x, z) < minTrail) return false;
    if (FIELD.stream(x, z) < 1.5) return false;
    if (Math.hypot(x, z) < CLEAR_R + 0.6) return false;
    for (const t of trees) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + 1.2) ** 2) return false;
    return true;
  };
  for (let gz = BOX.z0; gz < BOX.z1; gz += 2.2) for (let gx = BOX.x0; gx < BOX.x1; gx += 2.2) {
    const x = gx + rng.range(0, 2.2), z = gz + rng.range(0, 2.2);
    const td = FIELD.trail(x, z);
    if (!ok(x, z, 2.8 + rng.range(0, 1.4))) continue;
    if (rng() < (td < 9 ? 0.3 : lite ? 0.88 : 0.8)) continue;
    const near = td < 10 && Math.abs(x) < 16;
    const roll = rng();
    let kind;
    if (near) kind = roll < 0.55 ? 'pine' : roll < 0.75 ? 'oak' : roll < 0.9 ? 'birch' : 'fir';
    if (kind === 'oak' && td < 4.6) kind = 'pine'; // broad crowns stay back from the trail
    else kind = roll < 0.85 ? 'farpine' : 'oak';
    trees.push({ x, z, kind, r: kind === 'oak' ? 2.2 : kind === 'birch' ? 1.2 : 1.6, s: rng.range(0.85, 1.2), ry: rng.range(0, 6.28), v: rng.int(0, 2) });
  }
  const nearTree = (x, z) => {
    let m = 0;
    for (const t of trees) { const d = Math.hypot(t.x - x, t.z - z); if (d < 2.4) m = Math.max(m, 1 - d / 2.4); }
    return m;
  };

  // ---- canopy openness (for the sun dapple)
  textures.push(makeOpenness({ x0: BOX.x0, z0: BOX.z0, w: BOX.x1 - BOX.x0, d: BOX.z1 - BOX.z0 }, (x, z) => {
    const td = FIELD.trail(x, z), sd = FIELD.stream(x, z), r = Math.hypot(x, z);
    let o = 0.14;
    o = Math.max(o, 0.62 * (1 - sm(0.8, 4.5, td)));
    o = Math.max(o, 0.55 * (1 - sm(0.5, 3.5, sd)));
    o = Math.max(o, 1 - sm(CLEAR_R - 1.5, CLEAR_R + 2.5, r));
    return o;
  }));

  // ---- terrain
  const tt = performance.now();
  const W = Math.round((BOX.x1 - BOX.x0) / VS), D = Math.round((BOX.z1 - BOX.z0) / VS);
  const h = new Uint16Array(W * D), top = new Uint32Array(W * D);
  const inCrust = (ci, ck) => {
    const x = (ci + 0.5) * VS, z = (ck + 0.5) * VS;
    const a = Math.atan2(z, x);
    return Math.hypot(x, z) < HOLE_R + n1(Math.cos(a) * 1.7, Math.sin(a) * 1.7) * 0.18;
  };
  // the tree list is long; bin it for the litter test
  const bins = new Map();
  for (const t of trees) { const key = `${Math.floor(t.x / 4)},${Math.floor(t.z / 4)}`; if (!bins.has(key)) bins.set(key, []); bins.get(key).push(t); }
  const litter = (x, z) => {
    let m = 0;
    const bx = Math.floor(x / 4), bz = Math.floor(z / 4);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const t of bins.get(`${bx + dx},${bz + dz}`) || []) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < 2.4) m = Math.max(m, 1 - d / 2.4);
    }
    return m;
  };
  for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    const x = BOX.x0 + (i + 0.5) * VS, z = BOX.z0 + (k + 0.5) * VS;
    const q = i + W * k;
    const ci = Math.floor(x / VS), ck = Math.floor(z / VS);
    if (inCrust(ci, ck)) { h[q] = BASE - 8; top[q] = 0; continue; } // the hole: no floor (the crust pieces sit in it)
    const H = groundH(x, z);
    h[q] = Math.max(1, Math.round(H / VS) + BASE);
    top[q] = groundColor(x, z, i, k, litter(x, z));
  }
  const side = (q, level, dir) => {
    const lv = h[q] - level;
    if (lv <= 1) return fshade(top[q], 0.82);
    return (level + (q % 7)) % 5 === 0 ? 0x4a3422 : level % 3 === 0 ? 0x5a4028 : 0x6a4a30;
  };
  const terrainMat = forestToon({ dapple: true });
  const ROWS = 96;
  for (let k0 = 0; k0 < D; k0 += ROWS) {
    const geo = meshRelief({ W, D, h, top, side, U: [VS, 0, 0], V: [0, 0, VS], N: [0, VS, 0], origin: [BOX.x0, -BASE * VS, BOX.z0], rows: [k0, k0 + ROWS], wallAO: false });
    const m = new THREE.Mesh(geo, terrainMat);
    m.layers.enable(LAYER_OUTLINE);
    m.userData.noBatch = true;
    group.add(m);
  }
  stats.terrain = Math.round(performance.now() - tt);

  // ---- tree meshes (instanced per variant)
  const ti = performance.now();
  const woodMat = forestToon({ dapple: true });
  const leafMat = (k) => forestToon({ dapple: false, sway: 1, swayBase: 3, shimmer: 1, cell: k });
  const addInst = (geo, mat, items, name, outline = true) => { if (items.length) group.add(instanceChunked(geo, mat, items, { name, outline })); };
  const pines = [0, 1, 2].map((v) => makePineGeo(31 + v * 7, { height: 12 + v * 1.6, k: lite ? 5 : 6, crown: 0.36 + v * 0.03 }));
  const farPines = [0, 1].map((v) => makePineGeo(61 + v * 5, { height: 13 + v * 2, k: 3, crown: 0.35 }));
  for (let v = 0; v < 3; v++) {
    const items = trees.filter((t) => t.kind === 'pine' && t.v === v).map((t) => ({ x: t.x, y: groundH(t.x, t.z) - 0.05, z: t.z, ry: t.ry, s: t.s }));
    addInst(pines[v].wood, woodMat, items, 'pine-wood');
    addInst(pines[v].leaves, leafMat(pines[v].k), items, 'pine-leaves');
  }
  for (let v = 0; v < 2; v++) {
    const items = trees.filter((t) => t.kind === 'farpine' && t.v % 2 === v).map((t) => ({ x: t.x, y: groundH(t.x, t.z) - 0.05, z: t.z, ry: t.ry, s: t.s * 1.1 }));
    addInst(farPines[v].wood, woodMat, items, 'farpine-wood', false);
    addInst(farPines[v].leaves, leafMat(3), items, 'farpine-leaves', false);
  }
  // broadleaf trees from the meadow kit, re-dressed in the forest's materials
  const leafy = { oak: [makeOak(5, { apples: false }), makeOak(9, { apples: false })], birch: [makeBirch(3), makeBirch(8)] };
  for (const kind of ['oak', 'birch']) {
    leafy[kind].forEach((tg, v) => {
      const items = trees.filter((t) => t.kind === kind && t.v % leafy[kind].length === v).map((t) => ({ x: t.x, y: groundH(t.x, t.z) - 0.05, z: t.z, ry: t.ry, s: t.s * (kind === 'oak' ? 1.45 : 1.25) }));
      addInst(tg.userData.parts.wood.geometry, woodMat, items, kind + '-wood');
      addInst(tg.userData.parts.leaves.geometry, forestToon({ dapple: false, sway: kind === 'birch' ? 1.3 : 1, swayBase: 2, shimmer: 1, cell: 12 }), items, kind + '-leaves');
    });
  }
  // small firs (understory): the far pine at a smaller scale
  {
    const items = trees.filter((t) => t.kind === 'fir').map((t) => ({ x: t.x, y: groundH(t.x, t.z) - 0.05, z: t.z, ry: t.ry, s: t.s * 0.45 }));
    addInst(farPines[0].wood, woodMat, items, 'fir-wood');
    addInst(farPines[0].leaves, leafMat(3), items, 'fir-leaves');
  }
  stats.trees = trees.length;
  stats.treeMs = Math.round(performance.now() - ti);

  // ---- props: stumps, rocks, logs, toadstools, bushes, the bridge, a signpost
  const props = new THREE.Group();
  const place = (obj, x, z, ry = 0, s = 1, dy = 0) => { obj.position.set(x, groundH(x, z) + dy, z); obj.rotation.y = ry; obj.scale.setScalar(s); props.add(obj); return obj; };
  const stumpGeo = makeStumpGeo(3);
  const stumps = [];
  for (let i = 0; i < 9; i++) {
    const s = trailAt(rng.range(4, TRAIL.L - 6));
    const side = rng.chance(0.5) ? 1 : -1, off = rng.range(2.2, 4.5);
    const x = s.x + s.tz * side * off, z = s.z - s.tx * side * off;
    if (!ok(x, z, 2) || Math.hypot(x, z) < CLEAR_R - 1) continue;
    stumps.push({ x, y: groundH(x, z), z, ry: rng.range(0, 6), s: rng.range(0.9, 1.4) });
  }
  stumps.push({ x: -5.6, y: 0, z: 2.4, ry: 1, s: 1.5 }, { x: 4.8, y: 0, z: -4.3, ry: 2, s: 1.2 });
  props.add(instance(stumpGeo, woodMat, stumps, { name: 'stumps' }));
  const rockSpots = [];
  for (let i = 0; i < 26; i++) {
    const s = trailAt(rng.range(0, TRAIL.L - 2));
    const side = rng.chance(0.5) ? 1 : -1, off = rng.range(1.1, 6);
    const x = s.x + s.tz * side * off, z = s.z - s.tx * side * off;
    if (FIELD.stream(x, z) < 1.2 || Math.hypot(x, z) < HOLE_R + 1.2) continue;
    rockSpots.push([x, z]);
  }
  rockSpots.push([-4.4, -3.6], [5.6, 1.2], [-6.2, -1.2], [3.1, 5.8]);
  rockSpots.forEach(([x, z], i) => place(makeRock(20 + i, { w: 6 + (i % 4) * 3, h: 4 + (i % 3) * 2, d: 6 + (i % 5) * 2, color: i % 3 ? 0x7a7068 : 0x8a8478, moss: 0.6 }), x, z, i, 1, -0.05));
  // stepping stones in the stream by the bridge
  const streamRocks = [];
  for (let i = 0; i < 6; i++) {
    const q = STREAM.curve.getPointAt(clamp((CROSS.ss + (i - 2.5) * 2.1 + (i > 2 ? 1.5 : -1.5)) / STREAM.L, 0, 1));
    const x = q.x + rng.range(-0.3, 0.3), z = q.z + rng.range(-0.3, 0.3);
    streamRocks.push({ x, z, r: 0.22 });
    place(makeRock(60 + i, { w: 5, h: 4, d: 5, color: 0x6a6a64, moss: 0.4 }), x, z, i, 1, 0.05);
  }
  // fallen logs
  place(makeLog(40, 4.4), -4.2, 12.5, 0.6, 1);
  place(makeLog(30, 3.6), 5.4, 3.8, 2.2, 1);
  place(makeLog(46, 4.8), 5.2, 30.5, -0.4, 1);
  // toadstool clusters (red caps, white spots) and a ring of little brown ones
  const shroomGlows = [];
  for (const [x, z, s, red] of [[-2.6, 8.4, 1, 1], [3.4, 13.4, 0.8, 1], [-3.2, 27.5, 1.1, 1], [4.2, -2.6, 0.9, 0], [-5.3, 1.6, 0.7, 1], [2.7, 34.2, 1, 0]]) {
    const m = makeMushrooms(x * 13 + z, { n: 3 + (x > 0 ? 1 : 2), spread: 6, cap: red ? [0xd83a2a, 0xf05a3a, 0x9a2418] : [0xc8945a, 0xdcae74, 0x8a6038], stem: 0xf0e8d8, scale: s * 0.5, glow: false });
    place(m.group, x, z, x, 1);
    for (const g of m.glows) shroomGlows.push(g);
  }
  // bushes along the trail and the clearing's edge
  for (let i = 0; i < 22; i++) {
    const s = trailAt(rng.range(2, TRAIL.L - 8));
    const side = rng.chance(0.5) ? 1 : -1, off = rng.range(1.6, 3.8);
    let x = s.x + s.tz * side * off, z = s.z - s.tx * side * off;
    if (i > 15) { const a = rng.range(-2.6, -0.6); x = Math.cos(a) * rng.range(CLEAR_R - 0.3, CLEAR_R + 1.5); z = Math.sin(a) * rng.range(CLEAR_R - 0.3, CLEAR_R + 1.5); } // the far side of the clearing
    if (FIELD.stream(x, z) < 1.2 || FIELD.trail(x, z) < 1.3) continue;
    place(makeBush(i + 3, { r: 4.5 + (i % 4) * 1.2, berry: i % 5 === 0 ? 0xd83a5a : i % 7 === 0 ? 0x3a4ad8 : 0 }), x, z, i, 1, -0.03);
  }
  // the footbridge across the stream
  const bridgeGeo = makeBridgeGeo(3.4);
  const tgB = TRAIL.curve.getTangentAt(CROSS.s / TRAIL.L);
  const bx = CROSS.x, bz = CROSS.z;
  const by = Math.max(groundH(bx + tgB.x * 1.9, bz + tgB.z * 1.9), groundH(bx - tgB.x * 1.9, bz - tgB.z * 1.9)) + 0.02;
  const bridge = new THREE.Mesh(bridgeGeo, woodMat);
  bridge.layers.enable(LAYER_OUTLINE);
  bridge.position.set(bx, by, bz);
  bridge.rotation.y = Math.atan2(tgB.x, tgB.z);
  props.add(bridge);
  FOREST.bridgeY = by + 5 / 16;
  FOREST.bridge = { x: bx, z: bz, s: CROSS.s, half: 1.7, y: by + 5 / 16 - 0.03 };
  // a signpost where the trail forks toward the clearing
  {
    const s = trailAt(CROSS.s + 3.4);
    const sign = new THREE.Mesh(makeSignGeo(), woodMat);
    sign.layers.enable(LAYER_OUTLINE);
    place(sign, s.x + s.tz * 1.3, s.z - s.tx * 1.3, s.yaw + 2.2, 1.1);
  }
  group.add(props);
  batchStatic(props);

  // ---- the stream
  const streamPts = STREAM.P.filter((_, i) => i % 3 === 0).map((p) => new THREE.Vector3(p.x, waterY(p.s), p.z));
  const stream = makeStream(streamPts, 1.45, streamRocks);
  group.add(stream);

  // ---- undergrowth: grass, ferns, flowers, reeds
  const tg = performance.now();
  const items = [];
  const grassRng = makeRng(91);
  const add = (x, z, cell, size, tint = 1) => {
    if (x < BOX.x0 || x > BOX.x1 || z < BOX.z0 || z > BOX.z1) return;
    items.push({ x, y: groundH(x, z) - 0.02, z, rot: grassRng.range(0, 6.28), size, cell, tint });
  };
  const N = lite ? 5500 : 9000;
  for (let i = 0; i < N; i++) {
    const x = grassRng.range(BOX.x0 + 1, BOX.x1 - 1), z = grassRng.range(BOX.z0 + 1, BOX.z1 - 1);
    const td = FIELD.trail(x, z), sd = FIELD.stream(x, z), r = Math.hypot(x, z);
    if (r < HOLE_R + 0.22) continue; // the crust carries its own
    if (td < 0.62) { if (grassRng() < 0.05) add(x, z, GRASS.short, 0.14, 0.9); continue; } // the odd tuft on the trail
    if (sd < 0.62) continue;
    // keep the chest's spill and the walk up to it clear
    if (Math.abs(x) < 0.9 && z > -0.5 && z < 2.6) continue;
    const tint = 0.85 + grassRng() * 0.3;
    const roll = grassRng();
    if (sd < 1.3) { add(x, z, roll < 0.45 ? GRASS.reed : roll < 0.6 ? GRASS.cattail : GRASS.tall, grassRng.range(0.5, 0.8), tint); continue; }
    if (r < CLEAR_R + 0.5) {
      // the clearing: a meadow
      const fl = roll < 0.06 ? GRASS.daisy : roll < 0.1 ? GRASS.buttercup : roll < 0.12 ? GRASS.poppy : roll < 0.14 ? GRASS.cornflower : roll < 0.16 ? GRASS.dandelion : roll < 0.2 ? GRASS.clover : roll < 0.6 ? GRASS.mid : GRASS.short;
      add(x, z, fl, fl === GRASS.mid ? grassRng.range(0.28, 0.42) : grassRng.range(0.2, 0.32), tint);
      continue;
    }
    if (td < 2.2) {
      // the trail's verge: grass and flowers
      const fl = roll < 0.08 ? GRASS.buttercup : roll < 0.12 ? GRASS.daisy : roll < 0.3 ? GRASS.fern : roll < 0.7 ? GRASS.mid : GRASS.tall;
      add(x, z, fl, fl === GRASS.fern ? grassRng.range(0.4, 0.6) : grassRng.range(0.25, 0.45), tint);
      continue;
    }
    // the forest floor: ferns, a little grass, clover in the moss
    if (grassRng() < 0.45) continue;
    add(x, z, roll < 0.5 ? GRASS.fern : roll < 0.7 ? GRASS.clover : GRASS.short, roll < 0.5 ? grassRng.range(0.45, 0.8) : grassRng.range(0.16, 0.28), tint * 0.9);
  }
  const grass = makeGrassField(items, { bright: 0.92, sun: { glsl: GLSL_DAPPLE + 'float mfSunAt(vec3 w) { return ffSun(w); }', uniforms: { uOpen: FF.uOpen, uOpenBox: FF.uOpenBox, uDapple: FF.uDapple, uShade: FF.uShade } } });
  group.add(grass);
  stats.grass = items.length;
  stats.grassMs = Math.round(performance.now() - tg);

  // ---- mist over the stream and in the hollows; sky
  const mists = [];
  for (const [x, y, z, w, d, a] of [[-6, -0.15, 19, 16, 5, 0.9], [9, -0.1, 21, 14, 5, 0.9], [-12, 0.5, 30, 18, 12, 0.6], [12, 0.5, 8, 16, 14, 0.55], [-10, 0.4, -6, 16, 12, 0.6], [0, 0.9, 40, 22, 10, 0.5], [9, 0.6, -10, 16, 10, 0.5]]) {
    const m = makeMist(x, y, z, w, d, { alpha: a, seed: x * 0.13 + z * 0.07 });
    mists.push(m);
    group.add(m);
  }
  // the forest goes on: hazy treelines all round, past the edge of the built ground
  const bands = new THREE.Group();
  for (const [r, hgt, px, seed, pal] of [
    [74, 34, 96, 3, { back: 0xa8bcb0, mid: 0x8aa494, front: 0x6e8c7c, floor: 0x5a7466 }],
    [52, 26, 80, 7, { back: 0x7a9a82, mid: 0x5a7e62, front: 0x3e6048, floor: 0x34503c }],
  ]) {
    const tex = treelineTexture(seed, 1024, px, pal);
    textures.push(tex);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, 96, 1, true), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, alphaTest: 0.5, fog: false }));
    band.position.set(0, -4 + hgt / 2, 14);
    band.rotation.y = seed;
    band.renderOrder = -60;
    band.userData.noBatch = true;
    bands.add(band);
  }
  group.add(bands);
  const sky = makeSky(SUN_DIR);
  const su = sky.material.uniforms;
  su.uZenith.value.set(0x3a6ac0); su.uMid.value.set(0x86b0e0); su.uHorizon.value.set(0xe0e6dc); su.uWarm.value.set(0xffd8a0); su.uGlow.value.set(0xfff0c0);

  // ---- the clearing: the chest on its crust, the spill, the cracks
  const crust = makeCrust({ R: HOLE_R + 0.3, cell: VS, inCrust, colorAt: (x, z) => groundColor(x, z, Math.floor(x / VS), Math.floor(z / VS)), seed: 11, nPieces: 9 });
  const grassSun = { glsl: GLSL_DAPPLE + 'float mfSunAt(vec3 w) { return ffSun(w); }', uniforms: { uOpen: FF.uOpen, uOpenBox: FF.uOpenBox, uDapple: FF.uDapple, uShade: FF.uShade } };
  for (const p of crust) {
    group.add(p.mesh);
    const its = p.tufts.map((t) => ({ x: t.x, y: -0.01, z: t.z, rot: t.k * 40, size: 0.2 + t.k * 0.18, cell: t.k < 0.08 ? GRASS.daisy : t.k < 0.14 ? GRASS.buttercup : t.k < 0.6 ? GRASS.short : GRASS.mid, tint: 0.9 + t.k * 0.2 }));
    if (its.length) p.mesh.add(makeGrassField(its, { bright: 0.92, sun: grassSun }));
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
  // the underside of the crust (seen from the hollow below): soil and dangling roots
  const ceil = new THREE.Mesh(new THREE.RingGeometry(HOLE_R - 0.15, 4.8, 40, 1), new THREE.MeshBasicMaterial({ color: 0x1a120c, side: THREE.DoubleSide }));
  ceil.rotation.x = -Math.PI / 2;
  ceil.position.y = -(8 / 8) + 0.01;
  group.add(ceil);
  // glints over the treasure (sparkles that come and go)
  const glintPts = [];
  const chestPos = chest.group.position;
  for (const g of chest.glints) glintPts.push({ pos: [g.pos[0] + chestPos.x, g.pos[1] + chestPos.y, g.pos[2] + chestPos.z], color: g.color, size: 2, shape: SHAPE.plus, big: 4, bigShape: SHAPE.plus, speed: 1.4 + (glintPts.length % 5) * 0.4, phase: glintPts.length * 1.7, sharp: 10, amp: 1 });
  for (const g of spill.glints) glintPts.push({ pos: [g.pos[0] + spill.mesh.position.x, g.pos[1], g.pos[2] + spill.mesh.position.z], color: g.color, size: 2, shape: SHAPE.plus, big: g.gem ? 4 : 3, bigShape: SHAPE.plus, speed: 1.1 + (glintPts.length % 4) * 0.5, phase: glintPts.length * 2.3, sharp: 12, amp: 1 });
  const glints = new Twinkles(glintPts, { additive: true, atten: false });
  glints.points.renderOrder = 9;
  group.add(glints.points);
  const chestGlow = makeGlow({ color: 0xc890ff, size: 0.9, intensity: 0.55, falloff: 1.8, levels: 4 });
  chestGlow.position.copy(chest.glowPos).add(chestPos);
  group.add(chestGlow);

  // ---- light shafts through the canopy (beams re-face the camera every frame)
  const beams = [];
  const beamAt = (x, z, len, w, inten) => {
    const bottom = new THREE.Vector3(x, groundH(x, z), z);
    const topP = bottom.clone().addScaledVector(SUN_DIR, len);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), beamMaterial(inten));
    m.userData.beam = { top: topP, bottom, w, len: topP.distanceTo(bottom) };
    m.renderOrder = 7;
    m.frustumCulled = false;
    beams.push(m);
    group.add(m);
  };
  beamAt(0.3, 0.6, 14, 1.8, 0.42);
  beamAt(-1.8, -2.4, 13, 1.1, 0.3);
  beamAt(2.4, -1.8, 13, 0.9, 0.28);
  for (const s of [6, 13, 21, 29, 36]) { const p = trailAt(s); beamAt(p.x + 1.2, p.z - 0.8, 12, 0.9, 0.25); }

  // ---- birds and butterflies
  const sw = swallowSheet();
  const bf = butterflySheet();
  textures.push(sw.texture, bf.texture);
  const birds = [];
  for (let i = 0; i < 5; i++) {
    const m = makeSheetSprite(sw.texture, { cols: sw.cols, size: [0.42, 0.42 / sw.aspect], anchor: [0.5, 0.5], renderOrder: 6 });
    m.userData.bird = { ph: i * 1.7, r: 9 + i * 2.5, h: 7 + (i % 3) * 1.6, sp: 0.45 + (i % 2) * 0.15, cx: (i - 2) * 3, cz: 14 + (i % 2) * 10 };
    birds.push(m);
    group.add(m);
  }
  const flies = [];
  for (let i = 0; i < 7; i++) {
    const m = makeSheetSprite(bf.texture, { cols: bf.cols, size: [0.13, 0.115], anchor: [0.5, 0.5], renderOrder: 6 });
    const home = i < 4 ? [Math.cos(i * 1.6) * 3.6, Math.sin(i * 1.6) * 3.6] : [trailAt(10 + i * 6).x + 1, trailAt(10 + i * 6).z];
    m.userData.fly = { sp: (i % 4) * 4, ph: i * 2.1, home, y: 0.5 + (i % 3) * 0.2 };
    flies.push(m);
    group.add(m);
  }

  // ---- per-frame
  let time = 0;
  const _side = new THREE.Vector3(), _axis = new THREE.Vector3(), _to = new THREE.Vector3(), _n = new THREE.Vector3(), _mid = new THREE.Vector3();
  const _basis = new THREE.Matrix4();
  const update = (dt, camera, fog) => {
    time += dt;
    updateMF(dt, camera, fog);
    glints.update(dt);
    const cp = camera.position;
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
      b.material.uniforms.uTime.value = time;
      // fade out when the camera is in (or right by) the beam: it would wash over the screen
      _to.subVectors(cp, B.bottom);
      const along = clamp(_to.dot(_axis), 0, B.len);
      const d = _to.addScaledVector(_axis, -along).length();
      b.material.uniforms.uFade.value = sm(B.w * 0.6, B.w * 0.6 + 2.5, d);
    }
    for (const m of birds) {
      const B = m.userData.bird;
      const a = B.ph + time * B.sp;
      m.position.set(B.cx + Math.cos(a) * B.r, B.h + Math.sin(a * 2.3) * 0.8, B.cz + Math.sin(a) * B.r * 0.6);
      m.userData.sheet.uFrame.value = Math.floor(time * 9 + B.ph * 3) % 4;
    }
    for (const m of flies) {
      const F = m.userData.fly;
      const a = time * 0.7 + F.ph;
      const x = F.home[0] + Math.sin(a) * 1.2 + Math.sin(a * 2.7) * 0.3, z = F.home[1] + Math.cos(a * 0.8) * 1.0;
      m.position.set(x, groundH(x, z) + F.y + Math.sin(a * 5) * 0.12, z);
      m.userData.sheet.uFrame.value = F.sp + (Math.floor(time * 12 + F.ph * 5) % 4);
    }
  };

  const dispose = () => {
    for (const p of pines.concat(farPines)) { p.wood.dispose(); p.leaves.dispose(); }
    for (const t of [...leafy.oak, ...leafy.birch]) t.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    stumpGeo.dispose();
    resetMeadowMaterials();
    resetForestMaterials();
  };
  stats.ms = Math.round(performance.now() - t0);
  return {
    group, sky, textures, crust, cracks, chest, spill, glints, chestGlow, ceil, stream, mists, beams, bridge, stats, update, dispose,
    holeY: -1.0, shroomGlows,
  };
}

/** A band of pine silhouettes in three hazy rows (pixel art, tiling round a cylinder). */
function treelineTexture(seed, W, H, pal) {
  const pc = new PixelCanvas(W, H);
  const rng = makeRng(seed);
  const rows = [[pal.back, 0.55, 0.3], [pal.mid, 0.4, 0.22], [pal.front, 0.22, 0.12]];
  for (const [col, base, jit] of rows) {
    const baseY = Math.round(H * (1 - base));
    let x = 0;
    while (x < W + 20) {
      const h = Math.round(H * rng.range(0.28, 0.5) * (1 - jit + rng.range(0, jit)));
      const w = Math.max(3, Math.round(h * rng.range(0.28, 0.36)));
      for (let r = 0; r < h; r++) {
        const y = baseY - h + r;
        const half = Math.floor((r / h) * w * 0.5 + ((r % 4) === 3 ? 1 : 0));
        for (let i = -half; i <= half; i++) {
          const xx = ((x + i) % W + W) % W;
          const lit = i > half * 0.35 && (r % 4) !== 3;
          pc.set(xx, y, lit ? fmix(col, 0xfff0c8, 0.12) : col);
        }
      }
      for (let y = baseY; y < H; y++) pc.set(((x % W) + W) % W, y, fshade(col, 0.8)); // trunk
      x += Math.round(w * rng.range(0.55, 0.95));
    }
    for (let y = baseY; y < H; y++) for (let xx = 0; xx < W; xx++) if (pc.alpha(xx, y) === 0 || y > baseY + 1) pc.set(xx, y, y === baseY ? col : fshade(col, 0.9));
  }
  for (let y = H - Math.round(H * 0.16); y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, pal.floor);
  const t = pixelTexture(pc.commit());
  t.wrapS = THREE.RepeatWrapping;
  return t;
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
  float shimmer = 0.8 + 0.2 * sin(v * 19.0 - uTime * 1.3 + sin(vUv.x * 7.0 + uTime * 0.7) * 1.5);
  float i = core * along * shimmer * uIntensity * uFade;
  float q = floor(i * 5.0 + bayer4(gl_FragCoord.xy)) / 5.0;
  if (q <= 0.0) discard;
  gl_FragColor = vec4(uColor * q, 1.0);
}`;
function beamMaterial(intensity) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0xffe6b0) }, uIntensity: { value: intensity }, uTime: { value: 0 }, uFade: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv + vec2(0.0, 0.5) * 0.0; vUv.y = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}
