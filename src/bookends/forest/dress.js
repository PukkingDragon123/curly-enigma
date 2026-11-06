// Set dressing laid over the built forest (wave 8): what the camera passes close to.
//   - a thick ground cover along the trail, round the clearing and on the forest floor near it
//     (the grass atlas: shade grass, woodrush, wild garlic, violets, primroses, leaf litter...)
//   - woodland flowers in fine voxels (1/40 m): bluebells, anemones, primroses, violets, campion,
//     wood sorrel; cones and acorns (1/48 m); fallen branches (1/24 m); flat mossy stones edging
//     the trail and stepping across the soft ground by the bridge (1/24 m)
//   - an understory of saplings (1/16 m) between the floor and the canopy
//   - toadstools on the fallen logs and stumps, ferns in front of the low tracking shots, roots
//     crossing the trail's edges by the gate giants
//   - leafy boughs hanging into chosen shots (frame(camPos, look, opts)), close to the lens
//   - more shafts of sun down the trail
// Everything is instanced and chunked; far chunks are hidden like the forest's own.
//
//   const D = dressForest(F, { lite, soft });  scene.add(D.group);  D.frame(pos, look, opts);
//   D.update(dt, camera);  D.dispose();  D.stats
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, makeNoise2D } from '../../core/util.js';
import { FOREST, groundH, CLEAR_R, HOLE_R, SUN_DIR } from '../forest.js';
import { forestToon } from '../forestfx.js';
import { instanceChunked } from '../foresttrees.js';
import { makeForestGrassChunked, FG } from './grass.js';
import { triCount } from './trees.js';
import {
  makeFernGeo, makeMushroomGeo, makeRootArcGeo, makeFoxgloveGeo,
  makeFlowerClumpGeo, makeBranchGeo, makeConesGeo, makeSlabGeo, makeSaplingGeo, makeBoughGeo,
} from './flora.js';

const n1 = makeNoise2D(811), n2 = makeNoise2D(812);

/** Several geometries as one (each moved by its offset [x, y, z]): one instanced draw for a mixed patch. */
function merged(parts) {
  const gs = parts.map(([g, o]) => (o ? g.clone().translate(o[0], o[1], o[2]) : g));
  const m = mergeGeometries(gs);
  for (const [g, o] of parts) { g.dispose(); void o; }
  for (const g of gs) g.dispose();
  return m;
}

/** Where the forest's trees stand (read back from its instanced trunks). */
function treeSpots(F) {
  const out = [];
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  F.group.traverse((o) => {
    if (!o.isInstancedMesh || !/-wood(-lod|-far)?$/.test(o.name)) return;
    const kind = o.name.split('-')[0];
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m4);
      m4.decompose(p, q, s);
      out.push({ x: p.x, z: p.z, kind, r: (kind === 'giant' ? 1.25 : kind === 'birch' ? 0.25 : 0.45) * s.x });
    }
  });
  return out;
}

export function dressForest(F, { lite = false, soft = false } = {}) {
  const t0 = performance.now();
  const group = new THREE.Group();
  group.name = 'forest-dress';
  const geos = [];
  const G = (g) => { if (g) geos.push(g); return g; };
  const stats = { tris: {} };
  const tr = FOREST.trail, L = tr.length;
  const rng = makeRng(8801);
  const trees = treeSpots(F);
  const tier = soft ? 0 : lite ? 1 : 2;
  const pick3 = (a, b, c) => [a, b, c][tier];

  // ---- what not to grow through
  const bins = new Map();
  const binKey = (x, z) => `${Math.floor(x / 4)},${Math.floor(z / 4)}`;
  const addBlock = (x, z, r) => { const k = binKey(x, z); if (!bins.has(k)) bins.set(k, []); bins.get(k).push([x, z, r]); };
  for (const t of trees) addBlock(t.x, t.z, t.r);
  for (const l of F.spots.logs) for (let s = -0.5; s <= 0.5; s += 0.2) addBlock(l.x + Math.cos(l.ry) * s * l.len, l.z - Math.sin(l.ry) * s * l.len, 0.55);
  for (const r of F.spots.rocks) addBlock(r.x, r.z, r.r * 0.9);
  for (const s of F.spots.stumps) addBlock(s.x, s.z, 0.35);
  const B = FOREST.bridge;
  const free = (x, z, r = 0.1) => {
    const bx = Math.floor(x / 4), bz = Math.floor(z / 4);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const [px, pz, pr] of bins.get(`${bx + dx},${bz + dz}`) || []) if ((px - x) ** 2 + (pz - z) ** 2 < (pr + r) ** 2) return false;
    return true;
  };
  const onWalk = (x, z) => Math.abs(x) < 0.9 && z > -0.5 && z < 2.6; // the walk up to the chest
  // the lane the low tracking shot looks across (his left, 0.4-2.4 m out): only low things there
  const inLane = (s, off) => s > 11.5 && s < 21 && off < -0.4 && off > -2.5;
  const inBox = (x, z) => x > FOREST.box.x0 + 0.5 && x < FOREST.box.x1 - 0.5 && z > FOREST.box.z0 + 0.5 && z < FOREST.box.z1 - 0.5;

  // ---- materials (the forest's own toon: dappled sun, its fog, wind in the vertex shader)
  const stiffMat = forestToon({ dapple: true });
  const plantMat = forestToon({ dapple: true, swayLocal: 0.6, swayAmp: 0.07 });
  const flowerMat = forestToon({ dapple: true, swayLocal: 0.25, swayAmp: 0.025 });
  const saplingLeafMat = forestToon({ dapple: true, swayLocal: 1.2, swayAmp: 0.06, backlit: 0.7 });
  const add = (geo, mat, items, name, { outline = false, cell = 16, cull = 0 } = {}) => {
    if (!geo || !items.length) return null;
    const m = instanceChunked(geo, mat, items, { name, outline, cell });
    if (cull) m.traverse((o) => { o.userData.cull = cull; });
    group.add(m);
    stats.tris[name] = (stats.tris[name] || 0) + triCount(geo) * items.length;
    return m;
  };

  // ---- ground cover: a thick weave of grass, flowers and litter where the camera looks
  const items = [];
  const put = (x, z, cell, size, tint = 1) => items.push({ x, y: groundH(x, z) - 0.02, z, rot: rng.range(0, 6.28), size, cell, tint });
  const NG = pick3(2600, 6400, 12000);
  let tries = 0;
  for (let placed = 0; placed < NG && tries < NG * 6; tries++) {
    // most of it along the trail (where every shot looks), the rest round the clearing
    const zone = rng();
    let x, z;
    if (zone < 0.66) { const s = rng.range(0, L - 0.5); const off = (rng() < 0.5 ? -1 : 1) * (0.5 + Math.pow(rng(), 1.25) * 7.5); [x, z] = tr.beside(s, off); }
    else if (zone < 0.76) { const s = rng.range(L - 9, L - 1.6); const off = (rng() < 0.5 ? -1 : 1) * rng.range(0.45, 2.6); [x, z] = tr.beside(s, off); } // the way in through the meadow
    else { const a = rng.range(0, 6.28), r = HOLE_R + 0.3 + Math.sqrt(rng()) * (CLEAR_R + 2.5 - HOLE_R); x = Math.cos(a) * r; z = Math.sin(a) * r; }
    if (!inBox(x, z) || onWalk(x, z)) continue;
    const td = FOREST.dist.trail(x, z), sd = FOREST.dist.stream(x, z), r = Math.hypot(x, z);
    if (r < HOLE_R + 0.3 || sd < 0.65 || td < 0.5) continue;
    if (!free(x, z, 0.04)) continue;
    const tint = 0.85 + rng() * 0.3, roll = rng();
    const drift = n1(x * 0.13, z * 0.13), damp = n2(x * 0.3 + 4, z * 0.3);
    placed++;
    if (sd < 1.4) { put(x, z, roll < 0.4 ? FG.reed : roll < 0.55 ? FG.garlic : roll < 0.75 ? FG.shade : FG.forgetme, roll < 0.4 ? rng.range(0.45, 0.8) : rng.range(0.22, 0.35), tint); continue; }
    if (r < CLEAR_R + 0.4) {
      // the clearing: a summer meadow, short and flowery round the chest and trodden down along
      // the path to it (so the way in stays clear)
      const near = r < 3.2 || td < 1.25;
      const fl = roll < 0.06 ? FG.daisy : roll < 0.11 ? FG.buttercup : roll < 0.14 ? FG.clover : roll < 0.17 ? FG.campion : roll < 0.19 ? FG.primrose : roll < 0.21 ? FG.seed : roll < 0.23 ? FG.violet : near ? (roll < 0.7 ? FG.short : FG.mid) : roll < 0.55 ? FG.mid : roll < 0.8 ? FG.tall : FG.woodrush;
      put(x, z, fl, near ? rng.range(0.15, 0.26) : fl === FG.tall ? rng.range(0.38, 0.58) : rng.range(0.22, 0.4), tint);
      continue;
    }
    if (td < 1.4) {
      // the trail's verge: worn grass, clover, sorrel, plantain-short tufts and fallen leaves
      const fl = roll < 0.18 ? FG.litter : roll < 0.3 ? FG.sorrel : roll < 0.38 ? FG.clover : roll < 0.44 ? FG.violet : roll < 0.48 ? FG.primrose : roll < 0.52 ? FG.strawberry : roll < 0.75 ? FG.short : FG.mid;
      put(x, z, fl, rng.range(0.14, 0.3), tint);
      continue;
    }
    // the forest floor: bluebell and garlic drifts, shade grass, woodrush, moss, litter
    if (drift > 0.3) { put(x, z, roll < 0.75 ? FG.bluebell : FG.shade, rng.range(0.2, 0.32), tint); continue; }
    if (drift < -0.35 && damp > 0) { put(x, z, roll < 0.7 ? FG.garlic : FG.anemone, rng.range(0.18, 0.3), tint); continue; }
    const fl = roll < 0.22 ? FG.litter : roll < 0.4 ? FG.shade : roll < 0.52 ? FG.woodrush : roll < 0.62 ? FG.moss : roll < 0.7 ? FG.sorrel : roll < 0.78 ? FG.fern : roll < 0.84 ? FG.anemone : roll < 0.88 ? FG.violet : FG.mid;
    put(x, z, fl, fl === FG.fern ? rng.range(0.35, 0.55) : fl === FG.woodrush ? rng.range(0.28, 0.42) : rng.range(0.16, 0.3), tint * 0.94);
  }
  const cover = makeForestGrassChunked(items, { bright: 0.95, cell: 22 });
  cover.traverse((o) => { if (o.geometry) G(o.geometry); });
  group.add(cover);
  stats.cover = items.length;

  // ---- woodland flowers in fine voxels, in little colonies along the verges and round the clearing
  {
    // two mixed colonies (one instanced draw each): the shade's (bluebells, anemones, violets) and
    // the verge's (primroses, wood sorrel, violets, an anemone); the campion stays in the meadow's grass
    const clump = (kind, seed, n) => makeFlowerClumpGeo(seed, { kind, n });
    const geoV = [
      G(merged([[clump('bluebell', 9001, 6), [0, 0, 0]], [clump('bluebell', 9003, 4), [0.22, 0, 0.12]], [clump('anemone', 9005, 5), [-0.18, 0, 0.16]], [clump('violet', 9007, 4), [0.05, 0, -0.22]]])),
      G(merged([[clump('primrose', 9011, 5), [0, 0, 0]], [clump('wood_sorrel', 9013, 5), [0.2, 0, -0.1]], [clump('violet', 9015, 3), [-0.12, 0, 0.2]], [clump('anemone', 9017, 3), [0.16, 0, 0.2]]])),
    ];
    const its = [[], []];
    const N = pick3(30, 60, 150);
    let n = 0;
    for (let i = 0; i < N * 8 && n < N; i++) {
      const s = rng.range(0, L - 1);
      const off = (rng() < 0.5 ? -1 : 1) * rng.range(1.05, 4);
      const onTrail = rng() < 0.75;
      if (onTrail && inLane(s, off)) continue;
      const [cx, cz] = onTrail ? tr.beside(s, off) : (() => { const a = rng.range(0, 6.28), r = rng.range(CLEAR_R - 2.2, CLEAR_R + 1.2); return [Math.cos(a) * r, Math.sin(a) * r]; })();
      if (!inBox(cx, cz) || FOREST.dist.stream(cx, cz) < 1 || FOREST.dist.trail(cx, cz) < 1.0 || Math.hypot(cx, cz) < HOLE_R + 0.8 || onWalk(cx, cz)) continue;
      const rc = Math.hypot(cx, cz);
      const v = rc < CLEAR_R + 1 || FOREST.dist.trail(cx, cz) < 1.6 ? 1 : n1(cx * 0.13, cz * 0.13) > -0.1 ? 0 : rng.int(0, 1);
      if (!free(cx, cz, 0.25)) continue;
      its[v].push({ x: cx, y: groundH(cx, cz) - 0.015, z: cz, ry: rng.range(0, 6.28), s: rng.range(0.85, 1.25) });
      n++;
    }
    its.forEach((l, v) => add(geoV[v], flowerMat, l, 'flowers', { cell: 20, cull: pick3(14, 16, 22) }));
  }

  // ---- the understory: saplings and young holly between the floor and the crowns
  {
    const one = (g) => merged([[g.wood], [g.leaves]]);
    const vars = [
      G(one(makeSaplingGeo(9101, { h: 1.6, leaf: [0xb8c866, 0x94b450, 0x6e983e, 0x4c7832, 0x325626], bark: 0x9a948a }))), // young beech
      G(one(makeSaplingGeo(9113, { h: 1.15, leaf: [0x6a9a4a, 0x4a7a3a, 0x365e2e, 0x264a24, 0x1a3618], bark: 0x6a5a48 }))), // holly, dark and glossy
    ];
    const its = vars.map(() => []);
    const N = pick3(8, 22, 46);
    let n = 0;
    for (let i = 0; i < N * 10 && n < N; i++) {
      const s = rng.range(2, L - 4), off = (rng() < 0.5 ? -1 : 1) * rng.range(2.2, 9);
      const [x, z] = tr.beside(s, off);
      if (!inBox(x, z) || FOREST.dist.stream(x, z) < 1.4 || Math.hypot(x, z) < CLEAR_R + 0.5 || !free(x, z, 0.5)) continue;
      its[rng() < 0.6 ? 0 : 1].push({ x, y: groundH(x, z) - 0.04, z, ry: rng.range(0, 6.28), s: rng.range(0.8, 1.25) });
      addBlock(x, z, 0.3);
      n++;
    }
    vars.forEach((g, v) => add(g, saplingLeafMat, its[v], 'saplings', { cell: 26, cull: pick3(26, 30, 40) }));
  }

  // ---- the floor's small change: fallen branches, cones and acorns
  {
    const bg = [G(merged([[makeBranchGeo(9201, { len: 1.6 })], [makeBranchGeo(9203, { len: 1.0, r: 0.035 }), [0.2, 0, 0.5]]]))];
    const bi = [[]];
    for (let i = 0; i < pick3(10, 18, 34); i++) {
      const s = rng.range(0, L - 1), off = (rng() < 0.5 ? -1 : 1) * rng.range(0.8, 6);
      const [x, z] = tr.beside(s, off);
      if (!inBox(x, z) || FOREST.dist.stream(x, z) < 1.1 || Math.hypot(x, z) < HOLE_R + 1.5 || !free(x, z, 0.4)) continue;
      bi[0].push({ x, y: groundH(x, z) - 0.01, z, ry: rng.range(0, 6.28), s: rng.range(0.85, 1.2) });
    }
    bi.forEach((l, v) => add(bg[v], stiffMat, l, 'branches', { cell: 26, cull: pick3(18, 20, 28) }));
    const cg = [G(makeConesGeo(9211, { pine: true, n: 9 }))];
    const ci = [[]];
    if (tier === 2) for (const t of trees) {
      if (rng() > 0.55 || t.kind === 'birch' || t.kind === 'snag') continue;
      const a = rng.range(0, 6.28), d = t.r + rng.range(0.4, 1.4);
      const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
      if (!inBox(x, z) || FOREST.dist.trail(x, z) < 0.6 || FOREST.dist.stream(x, z) < 1) continue;
      ci[0].push({ x, y: groundH(x, z) - 0.005, z, ry: a });
    }
    ci.forEach((l, v) => add(cg[v], stiffMat, l, 'cones', { cell: 26, cull: 20 }));
  }

  // ---- the trail itself: flat mossy stones along its edges, stepping stones over the soft
  // ground either side of the bridge, roots crossing its edges by the gate giants
  {
    const sg = [G(makeSlabGeo(9301)), G(merged([[makeSlabGeo(9307, { w: 0.55, d: 0.38, tone: 0x8a8478 })], [makeSlabGeo(9311, { w: 0.3, d: 0.26, tone: 0xa49a88 }), [0.42, 0, 0.12]]]))];
    const si = [[], []];
    const slab = (s, off, v) => { const [x, z] = tr.beside(s, off); const P = tr.at(s); si[v].push({ x, y: groundH(x, z) - 0.035, z, ry: P.yaw + rng.range(-0.4, 0.4), s: rng.range(0.85, 1.15) }); };
    for (let s = 2; s < L - 6; s += rng.range(0.7, 2.2)) {
      if (Math.abs(s - B.s) < B.half + 0.6) continue;
      if (rng() < 0.65) slab(s, (rng() < 0.5 ? -1 : 1) * rng.range(0.6, 0.85), rng.int(0, 1));
    }
    // over the damp ground before and after the bridge: stepping stones down the middle
    for (const d of [-3.4, -2.75, -2.15, 2.15, 2.7, 3.3]) slab(B.s + d, rng.range(-0.12, 0.12), d < 0 ? 1 : 0);
    sg.forEach((g, v) => add(g, stiffMat, si[v], 'slabs', { cell: 26, cull: pick3(20, 24, 32) }));
    // roots creeping out across the trail's edge where the gate giants stand over it
    const rg = [G(makeRootArcGeo(9321, { span: 1.5, r: 0.07, rise: 0.12 }))];
    const ri = [[]];
    for (const g of FOREST.giants.slice(0, 3)) {
      let best = 0, bd = 1e9;
      for (let s = 0; s < L; s += 0.5) { const P = tr.at(s); const d = (P.x - g.x) ** 2 + (P.z - g.z) ** 2; if (d < bd) { bd = d; best = s; } }
      for (let i = 0; i < 3; i++) {
        const s = best + (i - 1) * 1.1 + rng.range(-0.2, 0.2);
        const P = tr.at(s);
        const side = Math.sign((g.x - P.x) * -P.tz + (g.z - P.z) * P.tx) || 1; // the giant's side of the trail
        const [x, z] = tr.beside(s, side * rng.range(0.75, 1.0));
        ri[0].push({ x, y: groundH(x, z) - 0.03, z, ry: P.yaw + Math.PI / 2 + rng.range(-0.35, 0.35), s: rng.range(0.75, 1.1) });
      }
    }
    ri.forEach((l, v) => add(rg[v], stiffMat, l, 'roots', { outline: true }));
  }

  // ---- toadstools on the fallen logs and the stumps (not on phones: a draw each for little)
  if (tier === 2) {
    const mg = [G(makeMushroomGeo(9401, { kind: 'brown', n: 5, scale: 0.8, k: 40 })), G(merged([[makeMushroomGeo(9407, { kind: 'agaric', n: 2, scale: 0.7, k: 40 })], [makeMushroomGeo(9413, { kind: 'inkcap', n: 4, scale: 0.8, k: 40 }), [0.18, 0, 0.06]]]))];
    const mi = [[], []];
    for (const l of F.spots.logs) for (let i = 0; i < (tier ? 3 : 1); i++) {
      const s = rng.range(-0.35, 0.35) * l.len;
      mi[rng.int(0, 1)].push({ x: l.x + Math.cos(l.ry) * s, y: l.top - 0.06, z: l.z - Math.sin(l.ry) * s, ry: rng.range(0, 6.28), s: rng.range(0.7, 1.0) });
    }
    for (const st of F.spots.stumps) if (rng() < 0.6) mi[rng() < 0.5 ? 0 : 1].push({ x: st.x + rng.range(-0.1, 0.1), y: st.top - 0.08, z: st.z + rng.range(-0.1, 0.1), ry: rng.range(0, 6.28), s: 0.7 });
    mi.forEach((l, v) => add(mg[v], stiffMat, l, 'log-mushrooms', { cell: 30, cull: 28 }));
  }

  // ---- ferns and foxgloves in front of the low tracking shots (they slide past the lens)
  {
    const fg = [G(makeFernGeo(9501, { r: 0.42, k: 16 })), G(makeFernGeo(9507, { r: 0.34, k: 16, dry: 0.35 })), G(makeFoxgloveGeo(9511, { h: 0.85 }))];
    const fi = [[], [], []];
    // his left side, between him and the camera that tracks him from 1.7-2.1 m out (shot B)
    for (let s = 13.2; s < 19.8; s += rng.range(0.9, 1.5)) {
      const [x, z] = tr.beside(s, -rng.range(1.0, 1.2));
      if (FOREST.dist.stream(x, z) < 1.2) continue;
      fi[rng() < 0.6 ? 0 : 1].push({ x, y: groundH(x, z) - 0.03, z, ry: rng.range(0, 6.28), s: rng.range(0.8, 0.95) }); // (low: nothing tall in the lane)
    }
    // and banks of fern along both verges the whole way, so he walks between walls of green
    for (let i = 0; i < pick3(30, 70, 140); i++) {
      const s = rng.range(1, L - 5), off = (rng() < 0.5 ? -1 : 1) * rng.range(1.0, 3.6);
      if (inLane(s, off)) continue;
      const [x, z] = tr.beside(s, off);
      if (!inBox(x, z) || FOREST.dist.stream(x, z) < 1.2 || FOREST.dist.trail(x, z) < 0.95 || Math.hypot(x, z) < CLEAR_R - 0.5 || !free(x, z, 0.3)) continue;
      fi[rng() < 0.12 ? 2 : rng() < 0.6 ? 0 : 1].push({ x, y: groundH(x, z) - 0.03, z, ry: rng.range(0, 6.28), s: rng.range(0.8, 1.2) });
    }
    // the clearing's edge: a thicket of fern and foxglove where the wood gives way to the meadow
    // (a forest edge is always thick: the light reaches the ground there)
    for (let i = 0; i < pick3(20, 45, 90); i++) {
      const a = rng.range(0, 6.28), r = CLEAR_R + rng.range(0.2, 4.2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!inBox(x, z) || FOREST.dist.trail(x, z) < 1.1 || FOREST.dist.stream(x, z) < 1.2 || !free(x, z, 0.3)) continue;
      fi[rng() < 0.18 ? 2 : rng() < 0.65 ? 0 : 1].push({ x, y: groundH(x, z) - 0.03, z, ry: rng.range(0, 6.28), s: rng.range(0.9, 1.35) });
    }
    fi.forEach((l, v) => add(fg[v], v === 2 ? flowerMat : plantMat, l, 'verge-ferns', { cell: 30, cull: pick3(28, 34, 46) }));
  }

  // ---- more shafts of sun down the trail and over the stream (the canopy opens there)
  if (!soft) {
    const beam = (x, z, len, w, inten) => { const b = new THREE.Vector3(x, groundH(x, z), z); F.addBeam(b.clone().addScaledVector(SUN_DIR, len), b, w, inten, 0xffdcaa); };
    for (const s of tier === 2 ? [5.2, 9.6, 14, 18.8, 23.4, 27.6, 33.4] : [9.6, 18.8, 27.6]) {
      const [x, z] = tr.beside(s, ((s * 5.3) % 4) - 2);
      beam(x, z, 15, 0.45 + ((s * 7) % 3) * 0.15, 0.13 + ((s * 3) % 4) * 0.02);
    }
  }

  // ---- far chunks are hidden (the fog has them by then)
  const cullDist = soft ? 30 : lite ? 40 : 60;
  const cullable = [];
  group.traverse((o) => {
    if (o.isInstancedMesh && o.boundingSphere) cullable.push({ m: o, c: o.boundingSphere.center, r: o.boundingSphere.radius, d: o.userData.cull || cullDist });
    else if (o.isMesh && o.geometry?.isInstancedBufferGeometry && o.geometry.boundingSphere) cullable.push({ m: o, c: o.geometry.boundingSphere.center, r: o.geometry.boundingSphere.radius, d: cullDist });
  });

  // ---- boughs hanging into a shot, close to the lens
  const boughGeos = [];
  const boughs = [];
  const boughLeafMat = forestToon({ dapple: false, sway: 1, swayBase: 0.5, shimmer: 1, cell: 24, backlit: 0.9 });
  const woodMat = stiffMat;
  /**
   * Hang a leafy bough into the view from camera pos toward look: it comes in from one top corner
   * (side -1 left, 1 right), dist metres out, and droops across the frame's upper edge.
   */
  const frame = (pos, look, { side = -1, dist = 2.2, up = 0.55, len = 3.0, seed = 9601, leaf, yaw = 0 } = {}) => {
    const f = new THREE.Vector3().subVectors(look, pos).normalize();
    const r = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const u = new THREE.Vector3().crossVectors(r, f).normalize();
    const geo = makeBoughGeo(seed, { len, kw: 24, kl: 24, ...(leaf ? { leaf } : {}) });
    G(geo.wood); G(geo.leaves);
    boughGeos.push(geo);
    const anchor = pos.clone().addScaledVector(f, dist).addScaledVector(r, side * (dist * 0.95 + len * 0.45)).addScaledVector(u, dist * up);
    const g = new THREE.Group();
    const w = new THREE.Mesh(geo.wood, woodMat), l = new THREE.Mesh(geo.leaves, boughLeafMat);
    w.layers.enable(1);
    g.add(w, l);
    g.position.copy(anchor);
    // its +x runs in toward the middle of the frame (and a little away from the lens)
    const dir = r.clone().multiplyScalar(-side).addScaledVector(f, 0.35).setY(0).normalize();
    g.rotation.y = Math.atan2(-dir.z, dir.x) + yaw;
    g.name = 'bough';
    group.add(g);
    boughs.push(g);
    stats.tris.boughs = (stats.tris.boughs || 0) + triCount(geo.wood) + triCount(geo.leaves);
    return g;
  };

  const update = (dt, camera) => {
    const cp = camera.position;
    for (const c of cullable) c.m.visible = c.c.distanceTo(cp) - c.r < c.d;
  };
  const dispose = () => {
    for (const g of geos) { try { g.dispose(); } catch (e) { /* shared */ } }
    // (our own materials; the toon ones shared with the forest are disposed again by it: harmless)
    const mats = new Set();
    group.traverse((o) => { if (o.material) mats.add(o.material); });
    for (const m of mats) { try { m.dispose(); } catch (e) { /* noop */ } }
  };
  stats.ms = Math.round(performance.now() - t0);
  let total = 0;
  for (const v of Object.values(stats.tris)) total += v;
  stats.trisTotal = total + items.length * 4;
  return { group, update, dispose, frame, stats, boughs };
}
