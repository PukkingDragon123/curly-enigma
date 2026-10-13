// Assembles Deep Town's static world for TownScene: the cavern walls and rims, the
// cliff-side upper level, shops, the booth, the burrow door, the boarded tunnel, the lift
// with its rails, the plaza, market stalls, street furniture, nature and all the lights.
// Everything static is handed to the scene's Batch (merged, baked, camera-culled).
import * as THREE from 'three';
import { TOWN, trackDist } from './townLayout.js';
import { wallFrames, buildWall, buildRims, wallToWorld, worldToU, LEDGE_Y, localView } from './townCave.js';
import * as P from './props.js';
import * as P2 from './props2.js';
import * as TW from './townWorld.js';
import { waterfall } from './waterfall.js';
import { tunnelFrame, inTunnel, TUNNEL_W } from './tunnel.js';
import { VoxelGrid, C, wood, line, M32, iron, mulc, h3, lowRes } from './kit.js';
import { withView, viewForYaw } from './mesher.js';
import { makeRng } from '../core/util.js';

const _v = new THREE.Vector3();
const LAMP = { color: 0xffc070, intensity: 6, distance: 6.5, flicker: 0.12, pool: 1.9, poolOpacity: 0.28, halo: 0.75, haloOpacity: 0.55 };

/** Place a prop result {obj, shadow, r, lights} at world x,z with yaw; registers collision, shadow and lights. */
export function place(S, make, x, z, yaw = 0, o = {}) {
  // builders passed as functions are meshed with only the faces the camera can see at this yaw
  // o.low: small background decor is meshed at 1/16 (see lowRes)
  const res = typeof make === 'function' ? withView(viewForYaw(yaw), o.low ? () => lowRes(make) : make) : make;
  const obj = res.obj || res;
  obj.position.set(x, o.y ?? 0, z);
  obj.rotation.y = yaw;
  if (o.scale) obj.scale.setScalar(o.scale);
  S.addStatic(obj);
  const sc = o.scale ?? 1;
  if (res.shadow && o.shadow !== false) S.shadows.push({ x, z, rx: res.shadow.rx * sc, rz: (res.shadow.rz ?? res.shadow.rx) * sc, k: res.shadow.k });
  if (res.r && o.solid !== false) { S.map.addCircle(x, z, res.r * sc); S.map.navCircle(x, z, res.r * sc + 0.25); }
  if (res.lights && o.lights !== false) {
    obj.updateMatrixWorld(true);
    for (const l of res.lights) {
      const w = _v.set(l.x, l.y, l.z).applyMatrix4(obj.matrixWorld);
      S.addLight({ ...LAMP, ...(o.light || {}), x: w.x, y: w.y, z: w.z });
    }
  }
  return obj;
}

// ---------------------------------------------------------------- walls, rims, waterfall
export function buildCave(S) {
  const fr = wallFrames();
  const shopTop = (id) => (id === 'tools' || id === 'assay' ? 3.6 : 3.5);
  const T = TOWN.tunnel, F = TOWN.falls;
  const flatsN = TOWN.shops.filter((s) => s.wall === 'N').map((s) => ({ a: s.a - 0.1, b: s.a + s.w + 0.1, top: shopTop(s.id) }))
    .concat([{ a: TOWN.booth.x0 - 0.1, b: TOWN.booth.x0 + TOWN.booth.w + 0.1, top: 1.2 }, { a: TOWN.lift.x0 - 0.2, b: TOWN.lift.x0 + TOWN.lift.w + 0.2, top: 1.0 },
      { a: TOWN.home.x0 - 0.15, b: TOWN.home.x0 + TOWN.home.w + 0.15, top: 2.2, d: -0.02 }, { a: T.cx - 1.25, b: T.cx + 1.25, top: 2.45, d: 0 }]);
  const flatsW = TOWN.shops.filter((s) => s.wall === 'W').map((s) => ({ a: s.a - 0.1, b: s.a + s.w + 0.1, top: shopTop(s.id) }));
  const holesN = [
    { a: T.cx - TUNNEL_W / 2, b: T.cx + TUNNEL_W / 2, y0: 0, y1: 2.05, depth: 1.6, shape: (u, y) => inTunnel(u - T.cx, y) },
    { a: F.x - 0.36, b: F.x + 0.36, y0: 0.25, y1: F.top + 0.2, depth: 0.12, tint: [0.62, 0.72, 0.86] },
  ];
  for (const m of buildWall(fr.N, { flats: flatsN, holes: holesN })) S.addStatic(m);
  for (const m of buildWall(fr.W, { flats: flatsW })) S.addStatic(m);
  for (const m of buildRims()) S.addStatic(m);
  // the waterfall between the booth and the assay office
  const wf = waterfall(F.x, TOWN.northFace, F.top, F.basin);
  S.scene.add(wf.obj);
  for (const o of wf.statics) S.addStatic(o);
  S.map.fill(Math.floor(F.basin.x - F.basin.rx), TOWN.northFace, 2, 1, 1);
  S.map.addCircle(F.basin.x, F.basin.z, Math.max(F.basin.rx, F.basin.rz) * 0.92);
  S.map.navCircle(F.basin.x, F.basin.z, 1.0);
  S.falls = wf;
  S.addLight({ x: F.x, y: 1.2, z: F.basin.z + 0.2, color: 0x8ad0ff, intensity: 0, real: false, pool: 1.2, poolOpacity: 0.18, poolZ: F.basin.z + 0.4, halo: 0, bakePower: 0.35, bakeRadius: 2.2 });
}

// ---------------------------------------------------------------- the upper level along the cliffs
export function buildUpper(S) {
  const fr = wallFrames();
  const rng = makeRng(404);
  const yL = LEDGE_Y + 0.02;
  // walkways: N wall above the tools shop, W wall above grocer & furniture, joined at the corner
  const walks = [{ w: fr.N, a: 3.0, b: 9.25 }, { w: fr.W, a: 3.0, b: 16.2 }, { w: fr.N, a: 22.6, b: 28.4 }];
  for (const wk of walks) {
    const u0 = wk.w.axis === 'N' ? wk.a : worldToU(wk.w, 0, wk.b);
    const len = wk.b - wk.a;
    const ww = withView(viewForYaw(wk.w.yaw), () => P2.walkway(len, 0.66, Math.round(wk.a * 7)));
    const p = wallToWorld(wk.w, u0, yL, -0.08);
    ww.position.copy(p);
    ww.rotation.y = wk.w.axis === 'N' ? 0 : Math.PI / 2;
    S.addStatic(ww);
    // lanterns hanging under the walkway
    for (let u = 1.2; u < len - 0.6; u += 2.6 + rng() * 0.8) {
      const hlen = 0.25 + rng() * 0.3, hseed = Math.round(u * 13);
      const hl = () => P.hangingLantern(hlen, hseed);
      const q = wallToWorld(wk.w, u0 + u, yL - 0.02, 0.48);
      place(S, hl, q.x, q.z, wk.w.yaw, { y: q.y, light: { intensity: 3.2, distance: 4.2, pool: 0, halo: 0.55, flicker: 0.15, bakePower: 0.8, bakeRadius: 3.2 } });
    }
  }
  // round burrow doors + windows above the shops
  const fronts = [
    { w: fr.N, u: 4.4, kind: 'door' }, { w: fr.N, u: 5.65, kind: 'win' }, { w: fr.N, u: 7.0, kind: 'win' }, { w: fr.N, u: 8.25, kind: 'door' },
    { w: fr.N, u: 23.6, kind: 'win' }, { w: fr.N, u: 25.0, kind: 'door' }, { w: fr.N, u: 26.5, kind: 'win' }, { w: fr.N, u: 27.7, kind: 'win' },
    { w: fr.W, z: 4.4, kind: 'win' }, { w: fr.W, z: 6.0, kind: 'door' }, { w: fr.W, z: 7.7, kind: 'win' }, { w: fr.W, z: 9.2, kind: 'win' },
    { w: fr.W, z: 11.2, kind: 'door' }, { w: fr.W, z: 12.9, kind: 'win' }, { w: fr.W, z: 14.6, kind: 'door' },
  ];
  fronts.forEach((f, i) => {
    const u = f.u ?? worldToU(f.w, 0, f.z);
    const p = wallToWorld(f.w, u, yL + (f.kind === 'win' ? 0.16 : 0.03), 0.02);
    // up on the ledge these read small: meshed at 1/16
    const r = withView(viewForYaw(f.w.yaw), () => lowRes(() => (f.kind === 'door' ? P2.burrowDoor(i + 3) : P2.roundWindow(i + 5))));
    r.obj.position.copy(p);
    r.obj.rotation.y = f.w.yaw;
    S.addStatic(r.obj);
    if (f.kind === 'door') {
      r.obj.updateMatrixWorld(true);
      const l = _v.set(r.lights[0].x, r.lights[0].y, r.lights[0].z).applyMatrix4(r.obj.matrixWorld);
      S.addLight({ x: l.x, y: l.y, z: l.z, color: 0xffc070, intensity: 0, real: false, halo: 0.4, haloOpacity: 0.5, flicker: 0.15, bakePower: 0.7, bakeRadius: 2.2 });
    } else {
      const g = wallToWorld(f.w, u, p.y + 15 / 32, 0.3);
      S.addLight({ x: g.x, y: g.y, z: g.z, color: 0xffb860, intensity: 0, real: false, halo: 0.7, haloOpacity: 0.3, flicker: 0.08, bakePower: 0.55, bakeRadius: 2.0 });
    }
  });
  // ladders down from the corner walkway, and one by the lift
  const lad = withView(viewForYaw(Math.PI / 2), () => P.ladder(LEDGE_Y + 0.32, 3));
  lad.position.copy(wallToWorld(fr.W, worldToU(fr.W, 0, 4.5), 0, 0.6));
  lad.rotation.y = Math.PI / 2;
  S.addStatic(lad);
  S.map.addCircle(TOWN.westFace + 0.62, 4.5, 0.26);
  const lad2 = withView(viewForYaw(0), () => P.ladder(LEDGE_Y + 0.32, 4));
  lad2.position.set(28.5, 0, TOWN.northFace + 0.6);
  S.addStatic(lad2);
  S.map.addCircle(28.5, TOWN.northFace + 0.62, 0.26);
  // laundry lines strung between burrows
  for (const [w, u, span, y] of [[fr.N, 5.05, 2.0, 5.55], [fr.W, worldToU(fr.W, 0, 8.6), 2.4, 5.5], [fr.N, 24.2, 2.1, 5.6]]) {
    const ln = withView(viewForYaw(w.yaw), () => P2.laundryLine(span, Math.round(u * 3)));
    ln.position.copy(wallToWorld(w, u, y, 0.22));
    ln.rotation.y = w.yaw;
    S.addStatic(ln);
  }
  // a pulley crane above the grocer with its basket swinging over the street
  const cr = withView(viewForYaw(fr.W.yaw), () => P2.crane(1.9, 5));
  cr.position.copy(wallToWorld(fr.W, worldToU(fr.W, 0, 7.3), LEDGE_Y + 0.65, 0));
  cr.rotation.y = fr.W.yaw;
  S.addStatic(cr);
  // chimney pipes with smoke
  S.chimneys = [];
  for (const [w, u, y] of [[fr.N, 6.3, 5.9], [fr.W, worldToU(fr.W, 0, 13.7), 6.0], [fr.N, 25.8, 6.0], [fr.N, 15.8, 6.3]]) {
    const cp = withView(viewForYaw(w.yaw), () => P2.chimneyPipe(0.55, Math.round(u)));
    cp.obj.position.copy(wallToWorld(w, u, y, 0));
    cp.obj.rotation.y = w.yaw;
    S.addStatic(cp.obj);
    cp.obj.updateMatrixWorld(true);
    S.chimneys.push(new THREE.Vector3(cp.smoke.x, cp.smoke.y, cp.smoke.z).applyMatrix4(cp.obj.matrixWorld));
  }
  // timber supports bracing the rock
  for (const [w, u, h] of [[fr.N, 28.55, 3.3], [fr.W, worldToU(fr.W, 0, 27.05), 3.1], [fr.N, 15.38, 2.9]]) {
    const tf = withView(viewForYaw(w.yaw), () => P2.timberFrame(0.42, h, Math.round(u)));
    tf.position.copy(wallToWorld(w, u, 0, 0.02));
    tf.rotation.y = w.yaw;
    S.addStatic(tf);
  }
  // stalactites, roots and glow-worm threads hanging from the overhang
  S.glowWorms = [];
  const skip = (w, u) => (w.axis === 'N' && ((u > 3.0 && u < 9.4) || (u > 22.4 && u < 28.6))) || (w.axis === 'W' && u > worldToU(w, 0, 16.4));
  for (const w of [fr.N, fr.W]) {
    for (let u = w.u0 + 0.5; u < w.u1 - 0.4; u += 0.55 + rng() * 0.9) {
      const roll = rng();
      if (roll < 0.34) {
        const sh = 8 + Math.floor(rng() * 14);
        const st = withView(viewForYaw(0), () => lowRes(() => P.stalactite(Math.round(u * 11), sh)));
        st.obj.position.copy(wallToWorld(w, u, 6.75 + rng() * 0.5, 0.34 + rng() * 0.3));
        S.addStatic(st.obj);
      } else if (roll < 0.6 && !skip(w, u)) {
        const len = 0.5 + rng() * 1.3;
        const gt = withView(viewForYaw(0), () => P.glowThread(Math.round(u * 17), len));
        const p = wallToWorld(w, u, 6.6 + rng() * 0.5, 0.35 + rng() * 0.5);
        gt.position.copy(p);
        S.addStatic(gt);
        S.glowWorms.push({ x: p.x, y: p.y - len, z: p.z, len });
      } else if (roll < 0.8) {
        const rl = 0.5 + rng() * 1.0;
        const rt = withView(viewForYaw(w.yaw), () => lowRes(() => P.hangingRoot(Math.round(u * 5), rl)));
        rt.position.copy(wallToWorld(w, u, 6.5 + rng() * 0.4, 0.22 + rng() * 0.25));
        rt.rotation.y = w.yaw;
        S.addStatic(rt);
      } else {
        const vl = 0.8 + rng() * 1.6;
        const vn = withView(viewForYaw(w.yaw), () => lowRes(() => P.vine(Math.round(u * 9), vl)));
        vn.position.copy(wallToWorld(w, u, (skip(w, u) ? LEDGE_Y + 0.05 : 6.3), skip(w, u) ? 0.55 : 0.25));
        vn.rotation.y = w.yaw;
        S.addStatic(vn);
      }
    }
  }
  // crystals growing out of the rock, some casting light
  const spots = [[fr.N, 15.7, 4.6, 1], [fr.N, 19.6, 5.2, 3], [fr.N, 30.6, 5.0, 1], [fr.N, 33.0, 2.3, 2], [fr.W, worldToU(fr.W, 0, 5.4), 0.45, 1], [fr.W, worldToU(fr.W, 0, 19.0), 5.2, 0], [fr.W, worldToU(fr.W, 0, 24.2), 4.9, 2], [fr.W, worldToU(fr.W, 0, 27.0), 0.5, 3], [fr.N, 9.1, 5.6, 0], [fr.N, 2.9 + 0.4, 2.4, 2]];
  spots.forEach(([w, u, y, hue], i) => {
    const holder = new THREE.Object3D();
    if (w.axis === 'W') holder.rotation.set(0, 0, -0.62); else holder.rotation.set(0.62, 0, 0);
    const size = 0.65 + rng() * 0.35;
    const c = withView(localView(holder), () => lowRes(() => P.crystals(i * 7 + 3, size, hue)));
    c.obj.position.copy(wallToWorld(w, u, y, 0.02));
    c.obj.rotation.copy(holder.rotation);
    S.addStatic(c.obj);
    const l = wallToWorld(w, u, y + 0.15, 0.45);
    S.addLight({ x: l.x, y: l.y, z: l.z, color: c.color, intensity: y < 3 ? 3 : 0, distance: 4, flicker: 0.05, speed: 0.3, real: y < 3 && i % 2 === 0, pool: y < 3 ? 1.1 : 0, poolOpacity: 0.2, halo: 1.0, haloOpacity: 0.28, bakePower: 0.75, bakeRadius: 2.8 });
  });
}

// ---------------------------------------------------------------- rails with sleepers
export function buildRails(S) {
  // densify the polyline with a rounded corner
  const pts = TOWN.track;
  const path = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 8));
    for (let k = 0; k < n; k++) path.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
  }
  path.push(pts[pts.length - 1]);
  // smooth (chaikin)
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
  const V = (x, z) => [(x - x0) * 32, (z - z0) * 32];
  // walk the path laying sleepers every 0.3 units
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
        // sleeper: 0.62 long, 0.1 wide, rasterized
        for (let q = -0.31; q <= 0.31; q += 1 / 64) for (let w = -0.05; w <= 0.05; w += 1 / 64) {
          const [vx, vz] = V(x + nx * q + tx * w, z + nz * q + tz * w);
          const xi = Math.floor(vx), zi = Math.floor(vz);
          // one tone per sleeper (with darker worn ends) so each tie meshes as a few big faces
          for (let y = 0; y < 2; y++) g.set(xi, y, zi, mulc(0x5e4028, 0.84 + Math.floor(h3(0, Math.floor((acc + s) / 0.3), 0, 3) * 3) * 0.1 - (Math.abs(q) > 0.28 ? 0.15 : 0)));
        }
      }
      for (const side of [-1, 1]) {
        const [vx, vz] = V(x + nx * gauge * side, z + nz * gauge * side);
        const xi = Math.floor(vx), zi = Math.floor(vz);
        g.set(xi, 2, zi, 0x4a4a54); g.set(xi, 3, zi, 0x9aa0aa);
        // spikes
        if ((acc + s) % 0.3 < 0.02) { const [sx, sz] = V(x + nx * (gauge + 0.04) * side, z + nz * (gauge + 0.04) * side); g.set(Math.floor(sx), 2, Math.floor(sz), 0x6a6a74); }
      }
    }
    acc += L;
  }
  const m = M32(g, [0, 0, 0]);
  m.position.set(x0, 0, z0);
  S.addStatic(m);
  // buffer stop at the end
  const e = pts[pts.length - 1];
  const bs = new VoxelGrid(24, 18, 10);
  bs.box(1, 0, 2, 22, 3, 6, wood(C.woodD, { axis: 'x', across: 'z', pw: 99, seed: 2 }));
  bs.box(2, 3, 3, 3, 9, 4, C.woodD); bs.box(19, 3, 3, 3, 9, 4, C.woodD);
  bs.box(0, 10, 2, 24, 5, 5, (x) => (Math.floor(x / 4) % 2 ? 0xc0402a : 0xe8d8b0));
  const bm = M32(bs, [12, 0, 5]);
  bm.position.set(e.x - 0.18, 0, e.z);
  bm.rotation.y = Math.PI / 2;
  S.addStatic(bm);
  S.map.addCircle(e.x - 0.18, e.z, 0.3);
}

export { trackDist };
