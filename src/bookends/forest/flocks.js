// The forest's flocks (wave 10, the player: "add birds"): small voxel birds that come in together.
// A flock drops out of the canopy onto the trail (or the bridge's rope rail, a fallen log, the
// clearing's turf), the birds spread out, hop, peck at the litter, look about and chatter; when the
// traveller comes close they all go up at once (a whirr of wings, a few alarm calls) in a loose,
// bounding flight and settle again further on, until there's nowhere left ahead of him and they
// go off over the trees. Higher up, a flock now and then crosses the sky over the trail.
// Every flock is three InstancedMeshes (bodies, left wings, right wings: the songbirds' own voxel
// parts, critters.js birdGeos), so a flock of seven costs three draw calls.
//
//   const B = makeFlocks(F, { lite }); scene.add(B.group);
//   B.update(dt, { t, hero, cam, crack, sfx(name, opts) })  (sfx: 'chirp', 'peck', 'takeoff', 'song')
//   B.dispose(); B.list (flocks: { name, birds, state })
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { clamp, lerp, makeRng } from '../../core/util.js';
import { forestToon } from '../forestfx.js';
import { groundH, FOREST, CLEAR_R } from '../forest.js';
import { birdGeos } from './critters.js';

/** The flocks' plumages: house sparrows, goldfinches, bullfinches, long-tailed tits. */
const LOOKS = {
  sparrow: { back: 0x8a6440, breast: 0xb8a284, belly: 0xd8ccb4, cap: 0x7a7468, cheek: 0xe0d8c8 },
  goldfinch: { back: 0xb8945a, breast: 0xe0cfa0, belly: 0xf2ead8, cap: 0x1c1a1c, cheek: 0xd8382a },
  bullfinch: { back: 0x6c6c7a, breast: 0xe0684e, belly: 0xe8806a, cap: 0x1a1a20 },
  tit: { back: 0x5a4a50, breast: 0xe8c8c8, belly: 0xf4ece8, cap: 0xf4f0ea, cheek: 0x2a2228 },
};
const _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _w = new THREE.Matrix4(), _t = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _r = new THREE.Vector3();
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

export function makeFlocks(F, { lite = false } = {}) {
  const group = new THREE.Group();
  group.name = 'flocks';
  const mat = forestToon({ dapple: true });
  const tr = FOREST.trail, L = tr.length;
  const rng = makeRng(7707);
  const geos = [];
  const list = [];
  /** A sound placed where p is, heard from the camera: pan by the camera's right, quieter far off. */
  const placed = (c, p) => {
    if (!c.cam) return { pan: 0, k: 1 };
    _d.subVectors(p, c.cam.position);
    const dist = _d.length();
    _r.set(1, 0, 0).applyQuaternion(c.cam.quaternion);
    return { pan: clamp(_d.dot(_r) / Math.max(1, dist), -0.9, 0.9), k: clamp(1.4 - dist / 14, 0, 1) };
  };

  // ---- where they come down: patches of trail and verge, the rope rail, a fallen log, the clearing's turf
  const ground = (s, off, r) => { const [x, z] = tr.beside(s, off); return { kind: 'ground', x, z, r }; };
  const turf = (x, z, r) => ({ kind: 'ground', x, z, r });
  const nearLog = (s0, s1) => {
    let best = null, bd = 1e9;
    for (const l of F.spots.logs) {
      // (the log's own place along the trail must be in s0..s1, and it must be close by)
      let ls = 0, ld = 1e9;
      for (let s = 0; s <= L; s += 0.5) { const P = tr.at(s); const d = (P.x - l.x) ** 2 + (P.z - l.z) ** 2; if (d < ld) { ld = d; ls = s; } }
      if (ls >= s0 && ls <= s1 && ld < 20 && ld < bd) { bd = ld; best = l; }
    }
    if (!best) return null;
    const pts = [];
    for (let u = -0.3; u <= 0.31; u += 0.6 / 7) pts.push(new THREE.Vector3(best.x + Math.cos(best.ry) * u * best.len, best.top, best.z - Math.sin(best.ry) * u * best.len));
    return { kind: 'line', pts, x: best.x, z: best.z };
  };
  const B = FOREST.bridge;
  const rail = B?.railAt ? { kind: 'line', pts: Array.from({ length: 9 }, (_, i) => { const q = B.railAt(0.1 + i * 0.1); return new THREE.Vector3(q.x, q.y, q.z); }), x: B.x, z: B.z, flee: 1.9, near: 1.1 } : null;
  const X = tr.cross.s;
  const defs = [
    // the opening: a flock of sparrows working the trail ahead of him, up the slope into the light
    { name: 'sparrows', look: LOOKS.sparrow, n: lite ? 5 : 7, arrive: 0.4, s: 1.35, spots: [ground(12.6, 0.1, 0.9), nearLog(15, 24) || ground(19, 1.8, 0.8), ground(23.5, -1.4, 1.0)].filter(Boolean) },
    // goldfinches along the footbridge's rope rail, then the far bank
    { name: 'goldfinches', look: LOOKS.goldfinch, n: lite ? 4 : 6, arrive: 12.5, s: 1.3, spots: [rail, ground(X + 3.4, 1.2, 0.8), ground(X + 7.5, -1.5, 1.0)].filter(Boolean) },
    // bullfinches in the clearing's turf, on his left (the nest is on his right)
    { name: 'bullfinches', look: LOOKS.bullfinch, n: lite ? 4 : 6, arrive: 17.5, s: 1.4, spots: [{ ...ground(L - 5.0, -2.3, 0.9), flee: 1.6, near: 1.3 }, turf(-4.6, 2.6, 1.1), turf(-3.6, -3.4, 1.2)] },
  ];
  // the flock that crosses the sky now and then (over the trail as the opening shot looks up it, over
  // the bridge, over the clearing)
  const sky = { name: 'sky', look: LOOKS.tit, n: lite ? 6 : 9, s: 1.5, crossings: [[1.4, 18, 5.8], [15.9, X + 1, 3.8], [34.2, L - 2.5, 3.3]] };

  // ---- the rigs: three instanced meshes a flock
  const makeRig = (look, n) => {
    const G = birdGeos(look);
    geos.push(G.body, ...G.wings);
    const mk = (geo) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.layers.enable(LAYER_OUTLINE);
      m.frustumCulled = false; // (the birds move about; a hidden flock isn't drawn at all)
      m.userData.noBatch = true;
      m.visible = false;
      group.add(m);
      return m;
    };
    return { body: mk(G.body), wl: mk(G.wings[0]), wr: mk(G.wings[1]), S: G.S };
  };
  /** Write bird i's matrices: root at p, heading yaw, body pitch, wings open (0 folded .. 1 out) and beating. */
  const pose = (R, i, p, yaw, pitch, wing, beat, sc) => {
    const S = R.S;
    _m.compose(p, _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(sc, sc, sc));
    _b.multiplyMatrices(_m, _t.makeTranslation(0, 2 * S, 0)).multiply(_t.makeRotationX(pitch));
    R.body.setMatrixAt(i, _b);
    const hidden = wing <= 0.01;
    for (const [m, sd] of [[R.wl, -1], [R.wr, 1]]) {
      if (hidden) { _w.makeScale(0, 0, 0); m.setMatrixAt(i, _w); continue; }
      _w.multiplyMatrices(_b, _t.makeTranslation(sd * 3 * S, 6 * S, 0)).multiply(_t.makeRotationZ(-sd * beat * wing));
      m.setMatrixAt(i, _w);
    }
  };
  const flush = (R) => { R.body.instanceMatrix.needsUpdate = true; R.wl.instanceMatrix.needsUpdate = true; R.wr.instanceMatrix.needsUpdate = true; };
  const show = (R, on) => { R.body.visible = R.wl.visible = R.wr.visible = on; };

  // ---- the ground flocks
  for (const D of defs) {
    const R = makeRig(D.look, D.n);
    const birds = Array.from({ length: D.n }, (_, i) => ({
      p: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), mid: new THREE.Vector3(),
      yaw: rng.range(0, 6.28), pitch: 0, hop: 0, hopT: rng.range(0.2, 1.2), peck: 0, peckT: rng.range(0.4, 2), lookT: rng.range(0.5, 2),
      ph: rng.range(0, 6.28), delay: 0, dur: 1, u: 0, air: false, k: i, sc: D.s * rng.range(0.92, 1.08),
    }));
    const F2 = { name: D.name, def: D, R, birds, state: 'wait', spot: -1, st: 0, chatT: rng.range(1, 3) };
    /** Where bird b goes in spot k (a scatter in a ground patch, its own place along a rail or log). */
    const placeIn = (b, k) => {
      const sp = D.spots[k];
      if (sp.kind === 'line') { const q = sp.pts[(b.k * 3 + k) % sp.pts.length]; b.to.copy(q); b.to.x += rng.range(-0.03, 0.03); b.to.z += rng.range(-0.03, 0.03); b.perch = true; return; }
      const a = rng.range(0, 6.28), r = Math.sqrt(rng()) * sp.r;
      b.to.set(sp.x + Math.cos(a) * r, 0, sp.z + Math.sin(a) * r);
      b.to.y = groundH(b.to.x, b.to.z);
      b.perch = false;
    };
    /** Everyone up and off to spot k (or away over the trees when k is past the last). */
    const takeOff = (c, k, first = false) => {
      const away = k >= D.spots.length;
      let cx = 0, cz = 0;
      for (const b of birds) { cx += b.p.x; cz += b.p.z; }
      cx /= birds.length; cz /= birds.length;
      for (const b of birds) {
        b.from.copy(b.p);
        if (away) {
          // off over the trees, away from him
          const hx = c.hero ? cx - c.hero.x : 1, hz = c.hero ? cz - c.hero.z : 0, hl = Math.hypot(hx, hz) || 1;
          b.to.set(cx + (hx / hl) * 14 + rng.range(-3, 3), b.p.y + 9 + rng.range(0, 3), cz + (hz / hl) * 14 + rng.range(-3, 3));
        } else placeIn(b, k);
        const d = b.from.distanceTo(b.to);
        b.mid.lerpVectors(b.from, b.to, 0.5);
        b.mid.y = Math.max(b.from.y, b.to.y) + (first ? 0.6 : 0.5 + d * 0.12) + rng.range(-0.15, 0.25);
        b.dur = (first ? 1.1 : 0.55) + d / rng.range(3.4, 4.4);
        b.delay = first ? b.k * 0.07 + rng.range(0, 0.25) : rng.range(0, 0.22);
        b.u = 0; b.air = true; b.hop = 0; b.peck = 0;
      }
      F2.state = away ? 'away' : 'fly';
      F2.spot = k;
      F2.st = 0;
      if (!first && c.sfx) {
        const s = placed(c, _p.set(cx, birds[0].p.y, cz));
        if (s.k > 0.05) { c.sfx('takeoff', { pan: s.pan, vol: s.k, n: Math.min(5, birds.length) }); c.sfx('chirp', { pan: s.pan, vol: 0.8 * s.k, pitch: 1.15 }); }
      }
    };
    F2.update = (dt, c) => {
      F2.st += dt;
      if (F2.state === 'wait') {
        if (c.t < D.arrive) return;
        // in from the canopy, high on the side away from him
        const sp = D.spots[0];
        for (const b of birds) { b.p.set(sp.x + rng.range(-2, 2) - 7, groundH(sp.x, sp.z) + 6 + rng.range(0, 1.5), sp.z + rng.range(-2, 2) + 3); }
        show(R, true);
        takeOff(c, 0, true);
      }
      if (c.crack && (F2.state === 'fly' || F2.state === 'down')) takeOff(c, 99);
      let landed = 0, cx = 0, cz = 0;
      for (const b of birds) {
        if (b.air) {
          if (b.delay > 0) { b.delay -= dt; poseBird(b, 0); continue; }
          b.u = Math.min(1, b.u + dt / b.dur);
          const u = F2.state === 'away' ? b.u : smooth(b.u * 0.85 + 0.15 * b.u * b.u);
          const a = 1 - u;
          _p.set(a * a * b.from.x + 2 * a * u * b.mid.x + u * u * b.to.x, a * a * b.from.y + 2 * a * u * b.mid.y + u * u * b.to.y, a * a * b.from.z + 2 * a * u * b.mid.z + u * u * b.to.z);
          _p.y -= Math.abs(Math.sin(b.u * Math.PI * 4 + b.ph)) * 0.08 * (1 - b.u); // the bounding flight of small birds
          _d.subVectors(_p, b.p);
          if (_d.lengthSq() > 1e-8) b.yaw = Math.atan2(_d.x, _d.z);
          b.pitch = clamp(-_d.y / Math.max(1e-4, Math.hypot(_d.x, _d.z)) * 0.6, -0.5, 0.5);
          b.p.copy(_p);
          b.ph += dt * 46;
          const glide = b.u > 0.8 && F2.state !== 'away';
          poseBird(b, glide ? 0.35 : 1, glide ? 0.25 : Math.sin(b.ph) * 0.95);
          if (b.u >= 1) {
            b.air = false;
            if (F2.state === 'away') b.gone = true;
            b.yaw += rng.range(-1.5, 1.5);
          }
          continue;
        }
        if (b.gone) continue;
        landed++; cx += b.p.x; cz += b.p.z;
        // on the ground (or the rail): hops, pecks, a look about
        b.hopT -= dt; b.peckT -= dt; b.lookT -= dt;
        if (b.hopT <= 0 && !b.perch) { b.hopT = rng.range(0.35, 1.3); b.hop = 0.14; b.yaw += rng.range(-0.8, 0.8); }
        if (b.hop > 0) {
          b.hop = Math.max(0, b.hop - dt);
          const k = 1 - b.hop / 0.14;
          b.p.x += Math.sin(b.yaw) * dt * 0.6; b.p.z += Math.cos(b.yaw) * dt * 0.6;
          b.p.y = groundH(b.p.x, b.p.z) + Math.sin(k * Math.PI) * 0.045;
        } else if (!b.perch) b.p.y = groundH(b.p.x, b.p.z);
        if (b.peckT <= 0) {
          b.peckT = rng.range(0.6, 2.2); b.peck = 0.32;
          if (!b.perch && c.sfx && rng() < 0.5) { const s = placed(c, b.p); if (s.k > 0.55) c.sfx('peck', { pan: s.pan, vol: s.k }); }
        }
        if (b.lookT <= 0) { b.lookT = rng.range(0.6, 2); b.yaw += rng.range(-1.6, 1.6); }
        b.peck = Math.max(0, b.peck - dt);
        b.pitch = b.peck > 0 && !b.perch ? (Math.sin((b.peck / 0.32) * Math.PI * 2) > 0 ? 0.85 : 0.15) : b.perch ? -0.08 : Math.sin(F2.st * 3 + b.k) * 0.06;
        poseBird(b, 0);
      }
      if (F2.state === 'fly' && birds.every((b) => !b.air)) F2.state = 'down';
      if (F2.state === 'away' && birds.every((b) => b.gone || !b.air)) { F2.state = 'gone'; show(R, false); }
      if (F2.state === 'down' && landed) {
        cx /= landed; cz /= landed;
        // he's coming: up they go (a little earlier the faster he comes on)
        if (c.hero) {
          const sp = D.spots[F2.spot];
          let near = Math.hypot(c.hero.x - cx, c.hero.z - cz) < (sp.flee ?? 3.0);
          for (const b of birds) if (!near && Math.hypot(c.hero.x - b.p.x, c.hero.z - b.p.z) < (sp.near ?? 2.0)) near = true;
          if (near) takeOff(c, F2.spot + 1);
        }
        // chatter
        F2.chatT -= dt;
        if (F2.chatT <= 0 && c.sfx && !c.quiet) {
          F2.chatT = rng.range(1.2, 3.2);
          const s = placed(c, _p.set(cx, birds[0].p.y, cz));
          if (s.k > 0.15) c.sfx('chirp', { pan: s.pan, vol: 0.55 * s.k, pitch: rng.range(0.95, 1.25) });
        }
      }
      if (F2.state !== 'gone') flush(R);
    };
    function poseBird(b, wing, beat = 0) { pose(R, b.k, b.p, b.yaw, b.pitch, wing, beat, b.sc); }
    list.push(F2);
  }

  // ---- the sky flock
  {
    const R = makeRig(sky.look, sky.n);
    const birds = Array.from({ length: sky.n }, (_, i) => ({ k: i, ph: rng.range(0, 6.28), off: new THREE.Vector3(rng.range(-1.6, 1.6), rng.range(-0.6, 0.6), rng.range(-2.2, 2.2) - i * 0.25), sc: sky.s * rng.range(0.9, 1.1), lag: rng.range(0, 0.35) }));
    let cur = -1;
    const from = new THREE.Vector3(), to = new THREE.Vector3();
    const F2 = { name: 'sky', R, birds, state: 'wait' };
    F2.update = (dt, c) => {
      // which crossing (each ~5 s) is under way
      let k = -1;
      for (let i = 0; i < sky.crossings.length; i++) { const [t0] = sky.crossings[i]; if (c.t >= t0 && c.t < t0 + 5.5) k = i; }
      if (c.crack) k = -1;
      if (k < 0) { if (cur >= 0) { show(R, false); cur = -1; F2.state = 'wait'; } return; }
      const [t0, s, h] = sky.crossings[k];
      if (k !== cur) {
        cur = k;
        const P = tr.at(s);
        // across the trail, from his left to his right, high over it
        const y = groundH(P.x, P.z) + h;
        from.set(P.x + P.tz * 16, y - 0.6, P.z - P.tx * 16);
        to.set(P.x - P.tz * 16, y + 0.8, P.z + P.tx * 16);
        show(R, true);
        F2.state = 'cross';
        if (c.sfx) { const sp = placed(c, _p.lerpVectors(from, to, 0.5)); if (sp.k > 0) c.sfx('chirp', { pan: -0.5, vol: 0.35 + 0.3 * sp.k, pitch: 1.3 }); }
      }
      const yaw = Math.atan2(to.x - from.x, to.z - from.z);
      for (const b of birds) {
        const u = clamp((c.t - t0 - b.lag) / 5, 0, 1);
        _p.lerpVectors(from, to, u);
        // the flock's own loose shape, turned to its heading, and a rise and dip as they beat and glide
        const cs = Math.cos(yaw), sn = Math.sin(yaw);
        _p.x += b.off.x * cs + b.off.z * sn; _p.z += -b.off.x * sn + b.off.z * cs; _p.y += b.off.y + Math.sin(u * 14 + b.ph) * 0.18;
        b.ph += dt * 40;
        const beat = Math.sin(c.t * 2.4 + b.ph * 0.02) > -0.3 ? Math.sin(b.ph) * 0.95 : 0.2;
        pose(R, b.k, _p, yaw, -0.05, 1, beat, b.sc);
      }
      flush(R);
    };
    list.push(F2);
  }

  const update = (dt, c) => { for (const f of list) f.update(dt, c); };
  const dispose = () => { for (const g of geos) g.dispose(); };
  return { group, update, dispose, list };
}
