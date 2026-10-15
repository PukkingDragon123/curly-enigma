// Assembles Deep Town's static world for the first-person TownScene: the cavern (walls, roof,
// rubble banks, waterfall), the cliff-side upper level, the roof's stalactites, crystals and
// glow-worms, the shops, the Surface Express booth, the burrow door, the boarded tunnel, the
// rails, the plaza with its fountain, benches and lamps, the market, the mushroom grove, the
// back-lane mound houses and all the clutter and lights. Town units throughout (see units.js).
import * as THREE from 'three';
import { TOWN } from '../iso/townLayout.js';
import * as P from '../iso/props.js';
import * as P2 from '../iso/props2.js';
import * as TW from '../iso/townWorld.js';
import { waterfall } from '../iso/waterfall.js';
import { tunnelFrame, tunnelBoards, brokenBoards, sealRubble, inTunnel, TUNNEL_W } from '../iso/tunnel.js';
import { VoxelGrid, C, wood, line, M32, G32, mulc, h3, lowRes } from '../iso/kit.js';
import { homeEntrance, markerArrow } from '../iso/props2.js';
import { makeRng, rand } from '../core/util.js';
import { buildWalls, buildCeiling, buildTalus, wallFrames, wallPoint, worldToU, ceilingAt, ceilingInfo, FACE_D } from './cave.js';
import { shopBuilding, FRONT } from './shops.js';
import { ticketBooth32 as boothFPS, velvetRope32 } from '../iso/booth.js';
import { moundHouse, mushroomTree, fountain } from './nature.js';
import { LID } from './build.js';
import { M } from './units.js';

const _v = new THREE.Vector3();
const LEDGE_Y = 4.36;

// ---------------------------------------------------------------- the cavern
export function buildCave(S) {
  const B = S.B, T = TOWN, Tu = T.tunnel, F = T.falls;
  const shopFlat = (s) => ({ a: s.a + 0.04, b: s.a + s.w - 0.04, top: 4.5, d: -1.75 });
  const flats = {
    N: T.shops.filter((s) => s.wall === 'N').map(shopFlat).concat([
      { a: T.booth.x0 - 0.1, b: T.booth.x0 + T.booth.w + 0.1, top: 1.2 },
      { a: T.lift.x0 - 0.3, b: T.lift.x0 + T.lift.w + 0.3, top: 1.0 },
      { a: T.home.x0 - 0.15, b: T.home.x0 + T.home.w + 0.15, top: 2.2, d: -0.02 },
      { a: Tu.cx - 1.25, b: Tu.cx + 1.25, top: 2.45, d: 0 },
    ]),
    W: T.shops.filter((s) => s.wall === 'W').map(shopFlat),
  };
  const holes = {
    N: [
      { a: Tu.cx - TUNNEL_W / 2, b: Tu.cx + TUNNEL_W / 2, y0: 0, y1: 2.05, depth: 1.6, shape: (du, y) => inTunnel(du, y) },
      { a: F.x - 0.36, b: F.x + 0.36, y0: 0.25, y1: F.top + 0.2, depth: 0.12, tint: [0.62, 0.72, 0.86] },
    ],
  };
  const walls = buildWalls({ flats, holes });
  for (const m of walls.meshes) B.addStatic(m);
  for (const m of buildCeiling()) B.addStatic(m);
  // rubble banks: clear of the house doors and the back lane
  const keep = (x, z) => !T.houses.some((h) => Math.hypot(x - h.x, z - h.z) < 2.6) && !(x > 34.6 && x < 37.8 && z > 11 && z < 32);
  for (const m of buildTalus(keep)) B.addStatic(m);
  // the waterfall between the booth and the assay office
  const wf = waterfall(F.x, T.northFace, F.top, F.basin);
  S.root.add(wf.obj);
  for (const o of wf.statics) B.addStatic(o);
  B.solidCircle(F.basin.x, F.basin.z, Math.max(F.basin.rx, F.basin.rz) * 0.92, 0.5);
  S.falls = wf;
  S.addLight({ x: F.x, y: 1.2, z: F.basin.z + 0.2, color: 0x8ad0ff, intensity: 2.5, distance: 4, real: true, pool: 1.2, poolOpacity: 0.18, poolZ: F.basin.z + 0.4, halo: 0, bakePower: 0.35, bakeRadius: 2.2 });
  // collision: the ground (with the lift pit left open under the cage), the four walls
  // (the tunnel mouth stays open until it is sealed)
  const c = T.lift.cage;
  S.world.add(-2, -3, -2, T.W * M + 2, 0, (c.z - 1) * M, 'ground');
  S.world.add(-2, -3, (c.z + 1) * M, T.W * M + 2, 0, T.H * M + 2, 'ground');
  S.world.add(-2, -3, (c.z - 1) * M, (c.x - 1) * M, 0, (c.z + 1) * M, 'ground');
  S.world.add((c.x + 1) * M, -3, (c.z - 1) * M, T.W * M + 2, 0, (c.z + 1) * M, 'ground');
  const NF = T.northFace + 0.08;
  B.solid(-2, -1, -2, Tu.cx - 0.85, 12, NF, 'wallN', { nav: false });
  B.solid(Tu.cx + 0.85, -1, -2, T.W + 2, 12, NF, 'wallN', { nav: false });
  B.solid(Tu.cx - 1, 2.05, -2, Tu.cx + 1, 12, NF, 'wallN', { nav: false });
  B.solid(Tu.cx - 1, -1, -2, Tu.cx + 1, 12, 0.9, 'tunnelBack', { nav: false });
  B.solid(-2, -1, -2, T.westFace + 0.08, 12, T.H + 2, 'wallW', { nav: false });
  B.solid(T.eastFace - 0.3, -1, -2, T.W + 2, 12, T.H + 2, 'wallE', { nav: false });
  B.solid(-2, -1, T.southFace - 0.3, T.W + 2, 12, T.H + 2, 'wallS', { nav: false });
  B.map.fill(0, 0, T.W, T.northFace, 1);
  B.map.fill(0, 0, T.westFace, T.H, 1);
  B.map.fill(Math.floor(T.eastFace - 0.3), 0, T.W, T.H, 1);
  B.map.fill(0, Math.floor(T.southFace - 0.3), T.W, T.H, 1);
  // the lid over the town: climbing stops here
  S.world.add(-2, LID * M, -2, T.W * M + 2, LID * M + 1, T.H * M + 2, 'lid');
  return walls.frames;
}

// ---------------------------------------------------------------- the cliff-side upper level
export function buildUpper(S, fr) {
  const B = S.B;
  const rng = makeRng(404);
  const yL = LEDGE_Y + 0.02;
  const wp = (w, u, y, d) => wallPoint(w, u, y, d);
  const zU = (w, z) => worldToU(w, 0, z), xU = (w, x) => worldToU(w, x, 0);
  // walkways: N wall above the tools shop and the assay office, W wall above the first two shops
  const walks = [{ w: fr.N, a: xU(fr.N, 3.0), b: xU(fr.N, 9.25) }, { w: fr.W, a: zU(fr.W, 16.2), b: zU(fr.W, 3.0) }, { w: fr.N, a: xU(fr.N, 22.6), b: xU(fr.N, 28.4) }];
  for (const wk of walks) {
    const len = wk.b - wk.a;
    const ww = P2.walkway(len, 0.66, Math.round(wk.a * 7));
    ww.position.copy(wp(wk.w, wk.a, yL, -0.08));
    ww.rotation.y = wk.w.yaw;
    B.addStatic(ww, { outline: false });
    for (let u = 1.2; u < len - 0.6; u += 2.6 + rng() * 0.8) {
      const hlen = 0.25 + rng() * 0.3, hseed = Math.round(u * 13);
      const q = wp(wk.w, wk.a + u, yL - 0.02, 0.48);
      B.place(() => P.hangingLantern(hlen, hseed), q.x, q.z, wk.w.yaw, { y: q.y, solid: false, outline: false, light: { intensity: 3.2, distance: 4.2, pool: 0, halo: 0.55, flicker: 0.15, bakePower: 0.8, bakeRadius: 3.2 } });
    }
  }
  // round burrow doors and windows above the shops (and a few more round the back walls)
  const fronts = [
    [fr.N, 4.4, 'door'], [fr.N, 5.65, 'win'], [fr.N, 7.0, 'win'], [fr.N, 8.25, 'door'],
    [fr.N, 23.6, 'win'], [fr.N, 25.0, 'door'], [fr.N, 26.5, 'win'], [fr.N, 27.7, 'win'],
    [fr.W, 4.4, 'win'], [fr.W, 6.0, 'door'], [fr.W, 7.7, 'win'], [fr.W, 9.2, 'win'],
    [fr.W, 11.2, 'door'], [fr.W, 12.9, 'win'], [fr.W, 14.6, 'door'],
  ];
  fronts.forEach(([w, at, kind], i) => {
    const u = w.axis === 'N' ? xU(w, at) : zU(w, at);
    const p = wp(w, u, yL + (kind === 'win' ? 0.16 : 0.03), 0.02);
    const r = kind === 'door' ? P2.burrowDoor(i + 3) : P2.roundWindow(i + 5);
    r.obj.position.copy(p);
    r.obj.rotation.y = w.yaw;
    B.addStatic(r.obj, { outline: false });
    if (kind === 'door') {
      r.obj.updateMatrixWorld(true);
      _v.set(r.lights[0].x, r.lights[0].y, r.lights[0].z).applyMatrix4(r.obj.matrixWorld).multiplyScalar(1 / M);
      S.addLight({ x: _v.x, y: _v.y, z: _v.z, color: 0xffc070, intensity: 0, real: false, halo: 0.4, haloOpacity: 0.5, flicker: 0.15, bakePower: 0.7, bakeRadius: 2.2 });
    } else {
      const gp = wp(w, u, p.y + 15 / 32, 0.3);
      S.addLight({ x: gp.x, y: gp.y, z: gp.z, color: 0xffb860, intensity: 0, real: false, halo: 0.7, haloOpacity: 0.3, flicker: 0.08, bakePower: 0.55, bakeRadius: 2.0 });
    }
  });
  // burrows at street level round the back lanes (the townsfolk's front doors)
  for (const [w, at, seed] of [[fr.S, 12.6, 21], [fr.S, 21.4, 22], [fr.S, 31.2, 23], [fr.E, 18.2, 24], [fr.E, 29.0, 25], [fr.E, 7.6, 26]]) {
    const u = w.axis === 'S' ? xU(w, at) : zU(w, at);
    const p = wp(w, u, 0, -0.05);
    const r = P2.burrowDoor(seed);
    r.obj.position.copy(p);
    r.obj.rotation.y = w.yaw;
    B.addStatic(r.obj);
    r.obj.updateMatrixWorld(true);
    _v.set(r.lights[0].x, r.lights[0].y, r.lights[0].z).applyMatrix4(r.obj.matrixWorld).multiplyScalar(1 / M);
    S.addLight({ x: _v.x, y: _v.y, z: _v.z, color: 0xffc070, intensity: 2.2, distance: 3, real: true, pool: 0.8, poolOpacity: 0.22, halo: 0.45, haloOpacity: 0.5, flicker: 0.15, bakePower: 0.8, bakeRadius: 2.4 });
    for (const dx of [-1.6, 1.6]) {
      const q = wp(w, u + dx, 0.6, 0.12);
      const rw = P2.roundWindow(seed * 3 + (dx > 0 ? 1 : 0));
      rw.obj.position.copy(q);
      rw.obj.rotation.y = w.yaw;
      B.addStatic(rw.obj);
      S.addLight({ x: q.x, y: q.y + 0.47, z: q.z, color: 0xffb860, intensity: 0, real: false, halo: 0.6, haloOpacity: 0.3, flicker: 0.08, bakePower: 0.5, bakeRadius: 1.6 });
    }
  }
  // more lit windows and little balconies high in the back-lane walls: the cliff village all round
  for (const [w, at, y, seed] of [[fr.S, 9.6, 3.4, 31], [fr.S, 15.6, 4.6, 32], [fr.S, 27.4, 3.8, 33], [fr.S, 35.2, 4.9, 34], [fr.E, 9.2, 4.2, 35], [fr.E, 15.8, 3.2, 36], [fr.E, 24.0, 4.6, 37], [fr.E, 31.6, 3.6, 38], [fr.W, 30.6, 4.4, 39], [fr.N, 37.6, 4.0, 40]]) {
    const u = w.axis === 'N' || w.axis === 'S' ? xU(w, at) : zU(w, at);
    const q = wp(w, u, y, 0.1);
    const kind = seed % 3 === 0 ? 'door' : 'win';
    const r = kind === 'door' ? P2.burrowDoor(seed) : P2.roundWindow(seed);
    r.obj.position.copy(q);
    r.obj.rotation.y = w.yaw;
    B.addStatic(r.obj, { outline: false });
    if (kind === 'door') {
      // a little plank ledge to stand on
      const ledge = P2.walkway(1.7, 0.5, seed);
      ledge.position.copy(wp(w, u - 0.85, y - 0.02, -0.05));
      ledge.rotation.y = w.yaw;
      B.addStatic(ledge, { outline: false });
      r.obj.updateMatrixWorld(true);
      _v.set(r.lights[0].x, r.lights[0].y, r.lights[0].z).applyMatrix4(r.obj.matrixWorld).multiplyScalar(1 / M);
      S.addLight({ x: _v.x, y: _v.y, z: _v.z, color: 0xffc070, intensity: 0, real: false, halo: 0.45, haloOpacity: 0.5, flicker: 0.15, bakePower: 0.7, bakeRadius: 2.2 });
    } else {
      S.addLight({ x: q.x, y: q.y + 0.47, z: q.z, color: 0xffb860, intensity: 0, real: false, halo: 0.75, haloOpacity: 0.32, flicker: 0.08, bakePower: 0.55, bakeRadius: 1.8 });
    }
  }
  // ladders down from the walkways
  const lad = P.ladder(LEDGE_Y + 0.32, 3);
  lad.position.copy(wp(fr.W, zU(fr.W, 4.5), 0, 0.6));
  lad.rotation.y = fr.W.yaw;
  B.addStatic(lad);
  B.solidCircle(T().westFace + 0.62, 4.5, 0.26, 3);
  const lad2 = P.ladder(LEDGE_Y + 0.32, 4);
  lad2.position.set(28.5, 0, TOWN.northFace + 0.6);
  B.addStatic(lad2);
  // laundry lines
  for (const [w, at, span, y] of [[fr.N, 5.05, 2.0, 5.55], [fr.W, 8.6, 2.4, 5.5], [fr.N, 24.2, 2.1, 5.6]]) {
    const u = w.axis === 'N' ? xU(w, at) : zU(w, at);
    const ln = P2.laundryLine(span, Math.round(at * 3));
    ln.position.copy(wp(w, u, y, 0.22));
    ln.rotation.y = w.yaw;
    B.addStatic(ln, { outline: false });
  }
  // a pulley crane above the grocer
  const cr = P2.crane(1.9, 5);
  cr.position.copy(wp(fr.W, zU(fr.W, 7.3), LEDGE_Y + 0.65, 0));
  cr.rotation.y = fr.W.yaw;
  B.addStatic(cr, { outline: false });
  // chimney pipes with smoke
  S.chimneys = [];
  for (const [w, at, y] of [[fr.N, 6.3, 5.9], [fr.W, 13.7, 6.0], [fr.N, 25.8, 6.0], [fr.N, 15.8, 6.3], [fr.S, 21.4, 2.6], [fr.E, 18.2, 2.5]]) {
    const u = w.axis === 'N' || w.axis === 'S' ? xU(w, at) : zU(w, at);
    const cp = P2.chimneyPipe(0.55, Math.round(at));
    cp.obj.position.copy(wp(w, u + (w.axis === 'S' || w.axis === 'E' ? 0.9 : 0), y, 0));
    cp.obj.rotation.y = w.yaw;
    B.addStatic(cp.obj, { outline: false });
    cp.obj.updateMatrixWorld(true);
    S.chimneys.push(new THREE.Vector3(cp.smoke.x, cp.smoke.y, cp.smoke.z).applyMatrix4(cp.obj.matrixWorld).multiplyScalar(1 / M));
  }
  // timber supports bracing the rock
  for (const [w, at, h] of [[fr.N, 28.55, 3.3], [fr.W, 27.05, 3.1], [fr.N, 15.38, 2.9], [fr.E, 10.6, 3.6], [fr.S, 17.2, 3.4], [fr.S, 34.6, 3.2]]) {
    const u = w.axis === 'N' || w.axis === 'S' ? xU(w, at) : zU(w, at);
    const tf = P2.timberFrame(0.42, h, Math.round(at));
    tf.position.copy(wp(w, u, 0, 0.02));
    tf.rotation.y = w.yaw;
    B.addStatic(tf);
  }
  // roots, vines and glow-worm threads hanging off the overhangs
  S.glowWorms = [];
  const skip = (w, at) => (w.axis === 'N' && ((at > 3.0 && at < 9.4) || (at > 22.4 && at < 28.6))) || (w.axis === 'W' && at < 16.4);
  for (const w of [fr.N, fr.W, fr.E, fr.S]) {
    for (let u = w.u0 + 2.2; u < w.u1 - 2.2; u += 0.6 + rng() * 1.0) {
      const p0 = wp(w, u, 0, 0);
      const at = w.axis === 'N' || w.axis === 'S' ? p0.x : p0.z;
      const roll = rng();
      if (roll < 0.3) {
        const len = 0.5 + rng() * 1.3;
        const gt = P.glowThread(Math.round(u * 17), len);
        const p = wp(w, u, 6.6 + rng() * 0.5, 0.35 + rng() * 0.5);
        gt.position.copy(p);
        B.addStatic(gt, { outline: false });
        S.glowWorms.push({ x: p.x, y: p.y - len, z: p.z, len });
      } else if (roll < 0.55) {
        const rl = 0.5 + rng() * 1.0;
        const rt = lowRes(() => P.hangingRoot(Math.round(u * 5), rl));
        rt.position.copy(wp(w, u, 6.5 + rng() * 0.4, 0.22 + rng() * 0.25));
        rt.rotation.y = w.yaw;
        B.addStatic(rt, { outline: false });
      } else if (roll < 0.8 || skip(w, at)) {
        const vl = 0.8 + rng() * 1.6;
        const vn = lowRes(() => P.vine(Math.round(u * 9), vl));
        const low = skip(w, at);
        vn.position.copy(wp(w, u, low ? LEDGE_Y + 0.05 : 6.3, low ? 0.55 : 0.25));
        vn.rotation.y = w.yaw;
        B.addStatic(vn, { outline: false });
      }
    }
  }
  // crystals growing out of the rock, some casting light
  const spots = [[fr.N, 15.7, 4.6, 1], [fr.N, 19.6, 5.2, 3], [fr.N, 30.6, 5.0, 1], [fr.N, 35.0, 2.3, 2], [fr.W, 5.4, 0.45, 1], [fr.W, 19.0, 5.2, 0], [fr.W, 24.2, 4.9, 2], [fr.W, 28.4, 0.5, 3], [fr.N, 9.1, 5.6, 0], [fr.N, 3.4, 2.4, 2],
    [fr.E, 4.6, 0.4, 3], [fr.E, 14.6, 3.6, 0], [fr.E, 27.2, 4.2, 2], [fr.S, 6.4, 3.8, 1], [fr.S, 24.4, 4.6, 3], [fr.S, 38.6, 0.4, 0], [fr.E, 33.6, 1.8, 1]];
  spots.forEach(([w, at, y, hue], i) => {
    const u = w.axis === 'N' || w.axis === 'S' ? xU(w, at) : zU(w, at);
    const holder = new THREE.Group();
    const size = 0.65 + rng() * 0.35;
    const c = lowRes(() => P.crystals(i * 7 + 3, size, hue));
    // tilt out of the wall: the crystal grows along the wall's outward normal, leaning up
    holder.add(c.obj);
    c.obj.rotation.x = 0.62;
    holder.position.copy(wp(w, u, y, 0.02));
    holder.rotation.y = w.yaw;
    B.addStatic(holder, { outline: y < 2.5 });
    const l = wp(w, u, y + 0.15, 0.45);
    S.addLight({ x: l.x, y: l.y, z: l.z, color: c.color, intensity: y < 3 ? 3 : 0, distance: 4, flicker: 0.05, speed: 0.3, real: y < 3 && i % 2 === 0, pool: y < 3 ? 1.1 : 0, poolOpacity: 0.2, halo: 1.0, haloOpacity: 0.28, bakePower: 0.75, bakeRadius: 2.8 });
  });
}

// ---------------------------------------------------------------- the roof: stalactites, crystals, glow-worms
export function buildRoof(S) {
  const B = S.B, T = TOWN;
  const rng = makeRng(808);
  const info = ceilingInfo();
  const inside = (x, z, m = 1.2) => x > T.westFace + m && x < T.eastFace - m && z > T.northFace + m && z < T.southFace - m;
  const shaft = info.shaft;
  const clear = (x, z) => !(x > shaft.x0 - 0.8 && x < shaft.x1 + 0.8 && z > shaft.z0 - 0.8 && z < shaft.z1 + 0.8) && Math.hypot(x - info.sun.x, z - info.sun.z) > 2.2;
  // stalactites in clusters
  for (let k = 0; k < 40; k++) {
    const x = T.westFace + 1 + rng() * (T.eastFace - T.westFace - 2), z = T.northFace + 1 + rng() * (T.southFace - T.northFace - 2);
    if (!clear(x, z)) continue;
    const y = ceilingAt(x, z);
    const n = 1 + Math.floor(rng() * 2);
    for (let j = 0; j < n; j++) {
      const ox = x + (rng() - 0.5) * 1.4, oz = z + (rng() - 0.5) * 1.4;
      const h = 14 + Math.floor(rng() * 30);
      const st = lowRes(() => P.stalactite(Math.round(ox * 31 + oz), h));
      st.obj.position.set(ox, ceilingAt(ox, oz) + 0.1, oz);
      st.obj.scale.setScalar(1.4 + rng() * 1.2);
      B.addStatic(st.obj, { outline: false });
    }
    void y;
  }
  // glowing crystal clusters hanging upside down in pockets of the roof
  const crys = [];
  for (let k = 0; k < 12; k++) {
    const x = T.westFace + 2 + rng() * (T.eastFace - T.westFace - 4), z = T.northFace + 2 + rng() * (T.southFace - T.northFace - 4);
    if (!clear(x, z)) continue;
    const hue = k % 4;
    const c = lowRes(() => P.crystals(k * 13 + 7, 1.2 + rng() * 0.8, hue));
    c.obj.position.set(x, ceilingAt(x, z) + 0.12, z);
    c.obj.rotation.set(Math.PI, rng() * 6, 0);
    c.obj.scale.setScalar(1.6);
    B.addStatic(c.obj, { outline: false });
    crys.push({ x, y: ceilingAt(x, z) - 0.9, z, color: c.color });
    S.glow.add({ kind: 'cpool', x, y: ceilingAt(x, z) - 0.25, z, w: 6, h: 6, color: c.color, opacity: 0.32 });
    S.addLight({ x, y: ceilingAt(x, z) - 1.0, z, color: c.color, intensity: 0, real: false, halo: 2.4, haloOpacity: 0.32, flicker: 0.05, speed: 0.3, bakePower: 1.1, bakeRadius: 4.5 });
  }
  // glow-worm colonies: thousands of tiny lights on the roof, densest in the hollows
  const pts = [];
  const cols = [0x8affe0, 0x7ad8ff, 0xa8fff0, 0x6ac0ff];
  for (let k = 0; k < 64; k++) {
    const cx = T.westFace + 1 + rng() * (T.eastFace - T.westFace - 2), cz = T.northFace + 1 + rng() * (T.southFace - T.northFace - 2);
    if (!inside(cx, cz, 0.5)) continue;
    const n = 30 + Math.floor(rng() * 70), r = 0.8 + rng() * 2.6;
    S.B.bakeLight({ x: cx, y: ceilingAt(cx, cz) - 0.6, z: cz, color: 0x6ad8d0, bakePower: 0.35 + n / 260, bakeRadius: r + 2.2 });
    S.glow.add({ kind: 'cpool', x: cx, y: ceilingAt(cx, cz) - 0.35, z: cz, w: r * 3 + 2, h: r * 3 + 2, color: 0x5ac8d8, opacity: 0.07 + n / 1400 });
    for (let j = 0; j < n; j++) {
      const a = rng() * 6.28, d = Math.sqrt(rng()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (!clear(x, z)) continue;
      pts.push({ x, y: ceilingAt(x, z) - 0.04 - rng() * 0.25, z, color: cols[Math.floor(rng() * cols.length)], a: 0.45 + rng() * 0.55 });
    }
  }
  // along the overhangs of the walls
  for (const g of S.glowWorms || []) for (let j = 0; j < 12; j++) pts.push({ x: g.x + (rng() - 0.5) * 0.8, y: g.y + g.len + (rng() - 0.3) * 0.6, z: g.z + (rng() - 0.5) * 0.4, color: cols[j % 4], a: 0.6 + rng() * 0.4 });
  S.roofWorms = pts;
  S.roofCrystals = crys;
  // the sun crack: a sliver of daylight far above
  const sun = info.sun;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.2).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
  sky.position.set(sun.x, T.ceiling.base - 0.45, sun.z);
  sky.rotation.y = -0.64;
  S.root.add(sky);
  // the lift shaft's top: a faint lamp far up the hole
  const sh = info.shaft;
  S.addLight({ x: (sh.x0 + sh.x1) / 2, y: T.ceiling.base - 1.5, z: (sh.z0 + sh.z1) / 2, color: 0xffb860, intensity: 0, real: false, halo: 0.9, haloOpacity: 0.4, flicker: 0.2, bakePower: 0.8, bakeRadius: 3 });
}

function T() { return TOWN; }

// ---------------------------------------------------------------- shops
export function buildShops(S) {
  const B = S.B, Tn = TOWN;
  S.shopInfo = {};
  for (const s of Tn.shops) {
    const b = shopBuilding(s.id, s.w);
    const o = b.obj;
    const N = s.wall === 'N';
    const back = (N ? Tn.northFace : Tn.westFace) + 1 - FRONT;
    const toWorld = (lx, lz) => (N ? { x: s.a + lx, z: back + lz } : { x: back + lz, z: s.a + s.w - lx });
    if (N) o.position.set(s.a, 0, back);
    else { o.position.set(back, 0, s.a + s.w); o.rotation.y = Math.PI / 2; }
    B.addStatic(o);
    o.updateMatrixWorld(true);
    for (const sg of b.signs) S.signs.add(sg.pc, sg.w, sg.h, sg.anchor);
    // collision: the building, the counter jutting out under the window
    const front = (N ? Tn.northFace : Tn.westFace) + 1;
    const c = b.counter;
    if (N) {
      B.solid(s.a - 0.05, 0, back, s.a + s.w + 0.05, 9, front, 'shop');
      B.solid(s.a + c.x0 - 0.2, 0, front - 0.1, s.a + c.x1 + 0.2, c.y0, front + 0.4, 'counter');
    } else {
      B.solid(back, 0, s.a - 0.05, front, 9, s.a + s.w + 0.05, 'shop');
      B.solid(front - 0.1, 0, s.a + s.w - c.x1 - 0.2, front + 0.4, c.y0, s.a + s.w - c.x0 + 0.2, 'counter');
    }
    for (const pr of b.props) {
      const w = toWorld(pr.x, pr.z);
      B.solidCircle(w.x, w.z, pr.r, 1.0);
      if (pr.shadow) B.shadows.push({ x: w.x, z: w.z, rx: pr.shadow.rx, rz: pr.shadow.rz, k: pr.shadow.k });
    }
    for (const l of b.lights) {
      const w = toWorld(l.x, l.z);
      if (l.kind === 'inside') S.addLight({ x: w.x, y: l.y, z: w.z, color: 0xffc070, intensity: 2.2, distance: 3.2, flicker: 0.08, real: true, halo: 0.5, haloOpacity: 0.4, bakePower: 0.75, bakeRadius: 2.2, priority: 1.5 });
      else S.addLight({ x: w.x, y: l.y, z: w.z, color: 0xffb860, intensity: 1.8, distance: 3.6, flicker: 0.16, pool: 1.0, poolOpacity: 0.2, halo: 0.5, haloOpacity: 0.5, bakePower: 0.55, bakeRadius: 2.4 });
    }
    // the warm light spilling out of the window onto the street
    const sp = toWorld((c.x0 + c.x1) / 2, FRONT + 0.9);
    S.addLight({ x: sp.x, y: 0.9, z: sp.z, color: 0xffb860, intensity: 0, real: false, pool: 1.5, poolOpacity: 0.16, bakePower: 0.3, bakeRadius: 2.0 });
    const k = toWorld(b.keeper.x, b.keeper.z);
    const cw0 = toWorld(c.x0, FRONT), cw1 = toWorld(c.x1, FRONT);
    S.shopInfo[s.id] = {
      wall: s.wall, yaw: N ? 0 : Math.PI / 2,
      keeper: { x: k.x, y: b.keeper.y, z: k.z },
      // the serving window: what the crosshair targets (TU box)
      win: N ? [s.a + c.x0, c.y0 - 0.1, front - 0.35, s.a + c.x1, c.y1, front + 0.45] : [front - 0.35, c.y0 - 0.1, Math.min(cw0.z, cw1.z), front + 0.45, c.y1, Math.max(cw0.z, cw1.z)],
      stand: toWorld((c.x0 + c.x1) / 2, FRONT + 1.15),
    };
    if (s.id === 'tools') S.grindstone = toWorld(s.w + 0.55, FRONT + 0.75);
  }
}

// ---------------------------------------------------------------- the Surface Express booth
export function buildBooth(S) {
  const B = S.B, Bo = TOWN.booth;
  const b = boothFPS();
  b.obj.position.set(Bo.x0, 0, Bo.z0);
  b.obj.remove(b.ticket);
  b.ticket.position.add(b.obj.position);
  S.root.add(b.ticket);
  B.addStatic(b.obj);
  S.ticketSign = b.ticket;
  for (const l of b.lights) S.addLight({ x: Bo.x0 + l.x, y: l.y, z: Bo.z0 + l.z, color: 0xffd890, intensity: 3, distance: 4.5, flicker: 0.08, pool: 1.0, poolOpacity: 0.22, halo: 0.45, haloOpacity: 0.5 });
  S.addLight({ x: Bo.x0 + b.inside.x, y: b.inside.y, z: Bo.z0 + b.inside.z, color: 0xffc070, intensity: 2.4, distance: 3, real: true, pool: 0, halo: 0.3, haloOpacity: 0.35, bakePower: 0.9, bakeRadius: 1.8, priority: 1 });
  // two velvet ropes make a little queue lane up to the ticket window
  for (const x of [Bo.x0 + 1.05, Bo.x0 + 3.95]) {
    const rope = velvetRope32();
    rope.position.set(x, 0, Bo.z0 + Bo.d + 1.75);
    rope.rotation.y = Math.PI / 2;
    B.addStatic(rope);
    B.solidRot(x, Bo.z0 + Bo.d + 1.75, 0.16, 3.0, 0, 0, 1.0);
  }
  B.shadows.push({ x: Bo.x0 + Bo.w / 2, z: Bo.z0 + Bo.d - 0.1, rx: 2.8, rz: 0.4, k: 0.55 });
  // collision: the kiosk, the counter shelf under the ticket window
  B.solid(Bo.x0 - 0.15, 0, Bo.z0 - 0.5, Bo.x0 + Bo.w + 0.15, 9, Bo.z0 + 3.02, 'booth');
  B.solid(Bo.x0 + 1.3, 0, Bo.z0 + 2.9, Bo.x0 + 3.7, 1.03, Bo.z0 + 3.28, 'booth');
  S.shopInfo.ticket = {
    yaw: 0,
    keeper: { x: Bo.x0 + Bo.w / 2, y: 0.62, z: Bo.z0 + 2.45 },
    win: [Bo.x0 + 1.4, 0.95, Bo.z0 + 2.7, Bo.x0 + 3.6, 1.95, Bo.z0 + 3.4],
    stand: { x: Bo.x0 + Bo.w / 2, z: Bo.z0 + 4.2 },
  };
}

// ---------------------------------------------------------------- the burrow door, the boarded tunnel
export function buildHomeDoor(S) {
  const B = S.B, h = TOWN.home;
  const d = homeEntrance();
  const ox = h.x0 + h.w / 2, oz = TOWN.northFace - 0.1;
  d.obj.position.set(ox, 0, oz);
  B.addStatic(d.obj);
  B.solid(h.x0 - 0.2, 0, TOWN.northFace - 0.5, h.x0 + h.w + 0.2, 9, TOWN.northFace + 0.2, 'home');
  B.solidCircle(ox + d.pot.x, oz + d.pot.z, 0.26, 0.6);
  B.solidCircle(ox + d.mailbox.x, oz + d.mailbox.z, 0.2, 1.3);
  B.shadows.push({ x: ox + d.pot.x + 0.04, z: oz + d.pot.z + 0.05, rx: 0.3, rz: 0.22, k: 0.6 }, { x: ox + d.mailbox.x + 0.04, z: oz + d.mailbox.z + 0.03, rx: 0.22, rz: 0.2, k: 0.65 });
  const lan = d.lights[0], peep = d.lights[1];
  S.addLight({ x: ox + lan.x, y: lan.y, z: oz + lan.z, color: 0xffc070, intensity: 2.5, distance: 3.5, flicker: 0.12, real: true, pool: 1.0, poolOpacity: 0.26, poolZ: h.door.z + 0.75, poolX: ox + lan.x - 0.35, halo: 0.42, haloOpacity: 0.5 });
  S.addLight({ x: ox + peep.x, y: peep.y, z: oz + peep.z + 0.1, color: 0xffd27a, intensity: 0, real: false, pool: 0.7, poolOpacity: 0.12, poolZ: h.door.z + 0.55, halo: 0.25, haloOpacity: 0.35, bakePower: 0.3, bakeRadius: 1.6 });
  S.homeDoor = { x: h.door.x, y: 0.9, z: TOWN.northFace + 0.15, box: [h.x0 + 0.25, 0, TOWN.northFace - 0.2, h.x0 + h.w - 0.25, 1.8, TOWN.northFace + 0.45] };
}

export function makeHomeMarker(S) {
  const h = TOWN.home;
  const ring = S.glow.add({ kind: 'pool', x: h.door.x, y: 0.04, z: h.door.z + 0.75, w: 1.5, h: 1.2, color: 0xffd27a, opacity: 0.4 });
  const halo = S.glow.add({ kind: 'halo', x: h.door.x, y: 1.2, z: h.door.z - 0.25, w: 0.8, color: 0xffe0a0, opacity: 0.32 });
  const gem = markerArrow();
  gem.position.set(h.door.x, 2.2, h.door.z + 0.3);
  S.root.add(gem);
  return { ring, halo, gem, t: 0 };
}

export function buildTunnel(S, escape) {
  const B = S.B, Tu = TOWN.tunnel, NF = TOWN.northFace;
  const fr = tunnelFrame();
  fr.position.set(Tu.cx, 0, NF);
  // arriving through it, the frame stays its own mesh so the dark of the tunnel can lift off it
  if (escape) S.root.add(fr); else B.addStatic(fr);
  B.map.fill(Math.floor(Tu.x0), 0, Math.ceil(Tu.x1 - Tu.x0) + 1, NF, 1);
  const seal = sealRubble();
  seal.position.set(Tu.cx, 0, NF - 0.32);
  const stubs = brokenBoards();
  stubs.position.set(Tu.cx, 0, NF);
  S.tunnel = { seal, stubs };
  if (escape) {
    S.root.add(seal, stubs);
    seal.visible = false;
    stubs.visible = false;
    const bd = tunnelBoards();
    const holder = new THREE.Group();
    holder.position.set(Tu.cx, 0, NF + 0.1);
    for (const b of bd.boards) holder.add(b);
    holder.add(bd.sign);
    S.root.add(holder);
    S.tunnel.boards = bd.boards;
    S.tunnel.sign = bd.sign;
    S.tunnel.holder = holder;
    // unique materials, tinted dark while the mole is still inside the tunnel
    const mats = new Map();
    for (const root of [fr, holder]) root.traverse((m) => {
      if (!m.isMesh) return;
      if (!mats.has(m.material)) { const c = m.material.clone(); c.userData.shared = false; mats.set(m.material, c); }
      m.material = mats.get(m.material);
    });
    S.tunnel.tint = [...mats.values()];
  } else {
    B.addStatic(seal);
    B.addStatic(stubs);
    const bd = tunnelBoards();
    bd.sign.position.set(Tu.cx + 0.55, 0.18, NF + 0.28);
    bd.sign.rotation.set(-1.05, 0.2, 0.1);
    S.root.add(bd.sign);
    for (const b of bd.boards) b.geometry.dispose();
    B.solid(Tu.cx - 1, 0, -2, Tu.cx + 1, 3, NF + 0.08, 'sealed', { nav: false });
  }
  B.shadows.push({ x: Tu.cx, z: NF + 0.25, rx: 1.1, rz: 0.35, k: 0.6 });
}

// ---------------------------------------------------------------- rails with sleepers
export function buildRails(S) {
  const pts = TOWN.track;
  const path = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 8));
    for (let k = 0; k < n; k++) path.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  path.push(pts[pts.length - 1]);
  let sm = path;
  for (let it = 0; it < 3; it++) {
    const o = [sm[0]];
    for (let i = 0; i < sm.length - 1; i++) { const a = sm[i], b = sm[i + 1]; o.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 }); }
    o.push(sm[sm.length - 1]);
    sm = o;
  }
  const x0 = Math.min(...sm.map((p) => p.x)) - 0.6, x1 = Math.max(...sm.map((p) => p.x)) + 0.6;
  const z0 = Math.min(...sm.map((p) => p.z)) - 0.6, z1 = Math.max(...sm.map((p) => p.z)) + 0.6;
  const g = new VoxelGrid(Math.ceil((x1 - x0) * 32), 5, Math.ceil((z1 - z0) * 32));
  const Vv = (x, z) => [(x - x0) * 32, (z - z0) * 32];
  let acc = 0;
  const gauge = 0.3;
  for (let i = 0; i < sm.length - 1; i++) {
    const a = sm[i], b = sm[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const tx = (b.x - a.x) / L, tz = (b.z - a.z) / L;
    const nx = -tz, nz = tx;
    for (let s = 0; s < L; s += 0.02) {
      const x = a.x + tx * s, z = a.z + tz * s;
      if ((acc + s) % 0.3 < 0.02) {
        for (let q = -0.31; q <= 0.31; q += 1 / 64) for (let w = -0.05; w <= 0.05; w += 1 / 64) {
          const [vx, vz] = Vv(x + nx * q + tx * w, z + nz * q + tz * w);
          for (let y = 0; y < 2; y++) g.set(Math.floor(vx), y, Math.floor(vz), mulc(0x5e4028, 0.84 + Math.floor(h3(0, Math.floor((acc + s) / 0.3), 0, 3) * 3) * 0.1 - (Math.abs(q) > 0.28 ? 0.15 : 0)));
        }
      }
      for (const side of [-1, 1]) {
        const [vx, vz] = Vv(x + nx * gauge * side, z + nz * gauge * side);
        g.set(Math.floor(vx), 2, Math.floor(vz), 0x4a4a54); g.set(Math.floor(vx), 3, Math.floor(vz), 0x9aa0aa);
        if ((acc + s) % 0.3 < 0.02) { const [sx, sz] = Vv(x + nx * (gauge + 0.04) * side, z + nz * (gauge + 0.04) * side); g.set(Math.floor(sx), 2, Math.floor(sz), 0x6a6a74); }
      }
    }
    acc += L;
  }
  const m = M32(g, [0, 0, 0]);
  m.position.set(x0, 0, z0);
  S.B.addStatic(m);
  const e = pts[pts.length - 1];
  const bs = new VoxelGrid(24, 18, 10);
  bs.box(1, 0, 2, 22, 3, 6, wood(C.woodD, { axis: 'x', across: 'z', pw: 99, seed: 2 }));
  bs.box(2, 3, 3, 3, 9, 4, C.woodD); bs.box(19, 3, 3, 3, 9, 4, C.woodD);
  bs.box(0, 10, 2, 24, 5, 5, (x) => (Math.floor(x / 4) % 2 ? 0xc0402a : 0xe8d8b0));
  const bm = M32(bs, [12, 0, 5]);
  bm.position.set(e.x - 0.18, 0, e.z);
  bm.rotation.y = Math.PI / 2;
  S.B.addStatic(bm);
  S.B.solidCircle(e.x - 0.18, e.z, 0.3, 0.5);
}

// ---------------------------------------------------------------- the plaza
export function buildPlaza(S) {
  const B = S.B, F = TOWN.fountain;
  const f = fountain(F);
  f.obj.position.set(F.x, 0, F.z);
  B.addStatic(f.obj);
  S.fountainInfo = f;
  B.solidCircle(F.x, F.z, F.r + 0.05, 0.75);
  B.solidCircle(F.x, F.z, 0.7, 2.6);
  B.shadows.push({ x: F.x, z: F.z, rx: F.r + 0.25, rz: F.r + 0.25, k: 0.7, ox: 0.1, oz: 0.12 });
  S.addLight({ x: F.x, y: f.crystal.y + 0.3, z: F.z, color: 0x7fd0ff, intensity: 7, distance: 7.5, flicker: 0.04, speed: 0.3, pool: 3.0, poolOpacity: 0.2, halo: 1.3, hy: f.crystal.y + 0.25, haloOpacity: 0.45, priority: 1 });
  // benches
  S.benchSeats = [];
  TOWN.benches.forEach((b, i) => {
    B.place(() => P.bench(), b.x, b.z, b.yaw, { solid: false });
    B.solidRot(b.x, b.z, 1.9, 0.62, b.yaw, 0, 0.45);
    const taken = { 0: [-1, 1], 1: [-1], 2: [1], 4: [1] }[i] || [];
    for (const side of [-1, 1]) {
      if (taken.includes(side)) continue;
      const sx = b.x + Math.cos(b.yaw) * 0.42 * side, sz = b.z - Math.sin(b.yaw) * 0.42 * side;
      S.benchSeats.push({ x: sx, z: sz, yaw: b.yaw });
    }
  });
  // lamp posts
  TOWN.lamps.forEach((l, i) => B.place(() => P.lampPost(i), l.x, l.z, i % 2 ? Math.PI / 2 : 0, { h: 3, light: { intensity: 6, distance: 6.5, pool: 1.9, poolOpacity: 0.3, halo: 0.75, haloOpacity: 0.6 } }));
  // giant glowing mushroom trees
  S.trees = [];
  for (const t of TOWN.trees) {
    const tr = mushroomTree(t);
    tr.obj.position.set(t.x, 0, t.z);
    B.addStatic(tr.obj);
    B.solidCircle(t.x, t.z, 0.42, t.h);
    B.shadows.push({ x: t.x, z: t.z, rx: t.r * 0.9, rz: t.r * 0.8, k: 0.72 });
    S.addLight({ x: t.x, y: tr.light.y, z: t.z, color: tr.light.color, intensity: 5, distance: 7, flicker: 0.05, speed: 0.25, pool: t.r + 0.9, poolOpacity: 0.26, halo: 0, real: true, bakePower: 1.0, bakeRadius: 4.2 });
    S.trees.push({ ...t, light: tr.light });
  }
  B.place(() => P.noticeBoard(), 11.6, 13.9, Math.PI / 2 - 0.35, { solid: false });
  B.solidRot(11.6, 13.9, 1.7, 0.3, Math.PI / 2 - 0.35, 0, 2);
  B.place(() => P.well(), 9.15, 10.85, 0.3, { h: 1.2 });
  S.well = { x: 9.15, z: 10.85 };
}

export function buildMarket(S) {
  const B = S.B;
  S.stallSpots = [];
  const Y = new THREE.Vector3(0, 1, 0);
  TOWN.stalls.forEach((s, i) => {
    B.place(() => P.marketStall(s.kind, i + 2), s.x, s.z, s.yaw, { solid: false });
    // the counter and the back posts block; the keeper stands in between
    _v.set(0, 0, 0.3).applyAxisAngle(Y, s.yaw);
    B.solidRot(s.x + _v.x, s.z + _v.z, 1.62, 0.36, s.yaw, 0, 0.8);
    _v.set(0, 0, -0.45).applyAxisAngle(Y, s.yaw);
    B.solidRot(s.x + _v.x, s.z + _v.z, 1.5, 0.3, s.yaw, 0, 0.5);
    _v.set(0.7, 0, 0.6).applyAxisAngle(Y, s.yaw);
    S.addLight({ x: s.x + _v.x, y: 1.55, z: s.z + _v.z, color: 0xffc070, intensity: 2, distance: 3, real: true, pool: 1.3, poolOpacity: 0.16, halo: 0.45, haloOpacity: 0.45, flicker: 0.14, bakePower: 0.7, bakeRadius: 2.6 });
    _v.set(0, 0, -0.12).applyAxisAngle(Y, s.yaw);
    S.stallSpots.push({ x: s.x + _v.x, z: s.z + _v.z, yaw: s.yaw, kind: s.kind });
    _v.set(1.05, 0, 0.1).applyAxisAngle(Y, s.yaw);
    B.place(() => (i % 2 ? P.sack({ color: 0xa88a5a }) : P.crate(i + 11)), s.x + _v.x, s.z + _v.z, s.yaw + 0.3);
    _v.set(-1.05, 0, 0.25).applyAxisAngle(Y, s.yaw);
    B.place(() => P.barrel(i + 21, { fill: s.kind === 'fish' ? 'water' : s.kind === 'gems' ? 'ore' : 'shrooms' }), s.x + _v.x, s.z + _v.z, s.yaw);
  });
}

// ---------------------------------------------------------------- the lift's surroundings (cart, ore)
export function buildLiftYard(S) {
  const B = S.B;
  B.place(() => P.oreCart(2), TOWN.cart.x, TOWN.cart.z, 0, { solid: false });
  B.solidRot(TOWN.cart.x, TOWN.cart.z, 0.62, 1.2, 0, 0, 1.0);
  const pile = TW.orePile();
  pile.position.set(TOWN.orePile.x, 0, TOWN.orePile.z);
  pile.scale.setScalar(1.15);
  B.addStatic(pile);
  B.shadows.push({ x: TOWN.orePile.x, z: TOWN.orePile.z, rx: 0.75, rz: 0.7, k: 0.6 });
  B.solidCircle(TOWN.orePile.x, TOWN.orePile.z, 0.62, 0.8);
  B.place(() => P.crate(8), 33.4, 7.85, 0.2);
  B.place(() => P.barrel(9, { fill: 'coal' }), 33.5, 8.65);
  B.place(() => P.ropeCoil(2), 28.4, 8.2, 0, { solid: false });
  B.place(() => P.bucket(true), 33.3, 9.4, 0.4);
}

// ---------------------------------------------------------------- decor, back lanes
export function buildDecor(S) {
  const B = S.B;
  const rng = makeRng(5);
  // mound houses in the back lanes, with chimney smoke and glowing windows
  S.chimneys = S.chimneys || [];
  S.houseDoors = [];
  TOWN.houses.forEach((h, i) => {
    const hs = moundHouse(40 + i);
    hs.obj.position.set(h.x, 0, h.z);
    hs.obj.rotation.y = h.yaw;
    B.addStatic(hs.obj);
    hs.obj.updateMatrixWorld(true);
    const W = (p) => new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(hs.obj.matrixWorld).multiplyScalar(1 / M);
    S.chimneys.push(W(hs.chimney));
    for (const w of hs.windows) { const p = W(w); S.addLight({ x: p.x, y: p.y, z: p.z, color: 0xffb860, intensity: 0, real: false, halo: 0.8, haloOpacity: 0.38, flicker: 0.1, bakePower: 0.7, bakeRadius: 1.8 }); }
    const d = W(hs.lamp);
    S.addLight({ x: d.x, y: d.y, z: d.z, color: 0xffc070, intensity: 1.4, distance: 2.8, real: true, flicker: 0.14, pool: 1.0, poolOpacity: 0.2, halo: 0.45, haloOpacity: 0.5, bakePower: 0.5, bakeRadius: 2.2 });
    const fz = hs.foot.z;
    B.solidRot(h.x + Math.sin(h.yaw) * fz, h.z + Math.cos(h.yaw) * fz, hs.foot.w, hs.foot.d, h.yaw, 0, 2.6);
    S.houseDoors.push(W(hs.door));
  });
  // glowing mushroom clumps along the edges and the lanes
  const clumps = [[3.6, 27.4, 0], [10.0, 27.4, 2], [28.6, 27.2, 0], [33.4, 20.0, 1], [33.2, 11.0, 2], [8.6, 4.0, 1], [27.9, 4.25, 0], [32.8, 15.0, 3], [15.2, 28.4, 0], [23.4, 28.0, 1],
    [5.6, 34.6, 1], [13.8, 35.0, 2], [24.0, 35.2, 0], [34.6, 34.8, 3], [40.6, 28.2, 2], [40.8, 17.4, 0], [40.4, 6.6, 1], [37.4, 4.6, 2], [30.0, 34.6, 1], [19.8, 34.9, 3]];
  clumps.forEach(([x, z, hue], i) => {
    let c = null;
    B.place(() => (c = P.glowShrooms(i * 5 + 2, hue, 0.85 + (i % 3) * 0.2)), x, z, rng() * 6, { solid: false, low: true });
    S.addLight({ x, y: 0.4, z, color: c.color, intensity: 0, real: false, pool: 0.9, poolOpacity: 0.24, halo: 0.6, haloOpacity: 0.28, flicker: 0.04, speed: 0.3, bakePower: 0.55, bakeRadius: 1.8 });
  });
  // stalagmites, crystals and rubble round the edges
  for (const [x, z, h] of [[4.3, 33.6, 22], [40.6, 7.0, 26], [12.0, 35.2, 18], [22.5, 35.6, 24], [40.4, 19.4, 20], [28.2, 35.3, 16], [40.6, 31.6, 28], [7.4, 35.2, 14], [41.0, 25.6, 30], [36.6, 35.4, 24]]) B.place(() => P.stalagmite(Math.round(x * z), h), x, z, rng() * 6, { low: true, scale: 1.3, r: 0.3, h: 1.5 });
  for (const [x, z, s, hue] of [[3.8, 3.75, 1.1, 1], [40.8, 3.9, 1.0, 0], [40.6, 35.4, 1.15, 2], [4.0, 35.4, 0.95, 3], [17.6, 35.6, 0.8, 1], [33.2, 27.4, 0.9, 0]]) {
    let c = null;
    B.place(() => (c = P.crystals(Math.round(x * 13 + z), s, hue)), x, z, rng() * 6, { low: true, r: 0.4, h: 1.2 });
    S.addLight({ x, y: 0.8, z, color: c.color, intensity: 3.5, distance: 4.5, flicker: 0.05, speed: 0.3, pool: 1.5, poolOpacity: 0.26, halo: 1.2, hy: 0.7, haloOpacity: 0.3 });
  }
  for (const [x, z, w, d] of [[30.6, 35.0, 1.3, 0.8], [9.6, 35.2, 1.0, 0.7], [40.6, 22.3, 0.8, 1.2]]) B.place(() => P.rubble(Math.round(x + z), w, d), x, z, 0, { solid: false, low: true });
  // barrels, crates & sacks
  const clutter = [[22.2, 4.6, 'b', 0], [21.7, 5.15, 'c', 0.3], [33.4, 10.3, 'c', 0.1], [33.3, 11.1, 'b', 0], [9.0, 4.4, 's', 0], [8.95, 5.0, 'b', 0], [3.75, 10.25, 'c', 0.2], [3.7, 15.9, 's', 0], [3.75, 21.25, 'b', 0], [15.6, 4.1, 'c', 0.15], [11.9, 4.15, 's', 0.4],
    [6.6, 32.4, 'b', 0], [11.0, 32.6, 'c', 0.3], [24.0, 32.8, 's', 0], [28.9, 32.7, 'b', 0.2], [37.9, 21.0, 'c', 0.1], [37.6, 15.0, 'b', 0], [37.8, 26.2, 's', 0.3]];
  for (const [x, z, k, ry] of clutter) {
    const fill = rng() < 0.3 ? 'water' : null, sc = rng() < 0.5 ? 0xc8b08a : 0xa88a5a, yaw = ry + rng() * 0.4;
    B.place(() => (k === 'b' ? P.barrel(Math.round(x * 3 + z), { fill }) : k === 'c' ? P.crate(Math.round(z * 5)) : P.sack({ color: sc })), x, z, yaw, { h: 0.9, low: z > 27 || x > 33 });
  }
  B.place(() => P.handCart(3), 26.9, 15.6, -0.35, { box: [1.4, 0.8] });
  B.place(() => P.woodpile(2), 14.3, 4.05, 0, { box: [1.3, 0.6] });
  B.place(() => P.pottedFern(1), 16.1, 6.6, 0, { r: 0.25 });
  B.place(() => P.pottedFern(2), 20.9, 6.6, 0, { r: 0.25 });
  B.place(() => P.mailboxes(3, 2), 8.95, 6.35, 0, { r: 0.25, h: 1.4 });
  B.place(() => P.woodpile(5), 30.6, 33.6, Math.PI, { box: [1.3, 0.6] });
  B.place(() => P.handCart(6), 37.8, 9.4, 1.4, { box: [1.4, 0.8] });
  // string lights: from the booth's roof to the plaza lamps, along the promenades, over the back lanes
  const Bo = TOWN.booth;
  const top = 2.82; // lamp-post tops: the strings hang well over the mole's head
  const strands = [
    [{ x: Bo.x0 + 0.15, y: 3.3, z: Bo.z0 + Bo.d + 0.1 }, { x: 14.3, y: top, z: 11.2 }],
    [{ x: Bo.x0 + Bo.w - 0.15, y: 3.3, z: Bo.z0 + Bo.d + 0.1 }, { x: 22.7, y: top, z: 11.2 }],
    [{ x: 6.7, y: top, z: 7.2 }, { x: 15.35, y: top, z: 5.35 }],
    [{ x: 6.7, y: top, z: 18.4 }, { x: 14.3, y: top, z: 19.8 }],
    [{ x: 14.3, y: top, z: 19.8 }, { x: 22.7, y: top, z: 19.8 }],
    [{ x: 14.3, y: top, z: 11.2 }, { x: 22.7, y: top, z: 11.2 }],
    [{ x: 8.0, y: top, z: 29.5 }, { x: 20.1, y: top, z: 29.6 }],
    [{ x: 20.1, y: top, z: 29.6 }, { x: 31.2, y: top, z: 29.7 }],
    [{ x: 31.6, y: top, z: 17.2 }, { x: 34.9, y: top, z: 18.6 }],
  ];
  S.bunting = [];
  strands.forEach(([a, b], i) => {
    const gl = garland32(a, b, i * 2);
    for (const o of gl.parts) B.addStatic(o);
    for (const bl of gl.bulbs) S.glow.add({ kind: 'halo', x: bl.x, y: bl.y - 0.02, z: bl.z, w: 0.2, color: bl.c, opacity: 0.35 });
    const mid = gl.points[Math.floor(gl.points.length / 2)];
    S.addLight({ x: mid.x, y: mid.y, z: mid.z, color: 0xffc080, intensity: 0, real: false, pool: 1.6, poolOpacity: 0.1, poolX: mid.x, poolZ: mid.z, flicker: 0.05, bakePower: 0.3, bakeRadius: 2 });
    S.bunting.push({ a, b });
  });
  S.drips = [[12.4, 3.4], [25.2, 3.4], [3.4, 17.6], [32.8, 13.5], [17.2, 3.5], [6.0, 3.4], [20, 20], [30, 25], [10, 30]];
}

/** String lights at 1/32: a sagging dark wire with small glowing bulbs (and their points for halos). */
function garland32(a, b, seed = 0) {
  const span = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(8, Math.round(span * 2.4));
  const sagD = 0.22 + span * 0.035;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sagD, a.z + (b.z - a.z) * t));
  }
  const parts = [], bulbs = [];
  const cols = [0xffd060, 0xff7a5a, 0x8ae07a, 0x7ac8ff, 0xffa0d0];
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[i + 1];
    const L = Math.max(1, Math.round(p.distanceTo(q) * 32));
    const wg = new VoxelGrid(1, 1, L);
    wg.box(0, 0, 0, 1, 1, L, 0x2a1a12);
    const wm = M32(wg, [0.5, 0.5, 0], { outline: false });
    wm.position.copy(p);
    wm.lookAt(q);
    parts.push(wm);
    if (i > 0) {
      const c = cols[(i + seed) % cols.length];
      const bg = new VoxelGrid(2, 4, 2);
      bg.box(0, 0, 0, 2, 3, 2, c); bg.set(0, 3, 0, 0x3a3a3a);
      const bm = G32(bg, [1, 4, 1]);
      bm.position.copy(p);
      parts.push(bm);
      bulbs.push({ x: p.x, y: p.y - 0.08, z: p.z, c });
    }
  }
  return { parts, bulbs, points: pts };
}

export { G32, line, LEDGE_Y, FACE_D };
