// The title's chase: in the background of the menu, over and over, the mole comes sprinting out
// of the dark at one side of the cave (the hero model of the cutscenes, his lantern swinging on
// his pack), glancing back over his shoulder; a cave raptor (the mine's model and its rig: legs
// that plant and step with IK, a swinging tail, a head that tracks him) bursts out after him
// through a clump of glowcaps, spores puffing. It gains; it leaps, jaws snapping where he just
// was; he jinks aside, hops a root; it skids, barges through more mushrooms (a cap goes flying),
// and they're gone into the dark on the far side. A pause; the knocked caps regrow; again. Each
// loop varies: the direction, the raptor's colours, speeds, where it lunges, which way he jinks.
// He's terrified: eyes popped wide, brows shot up and tilted together, gulping air and trembling
// between gasps, his head jerking with each one; sweat streams down his brow and cheeks in fat
// drops that leave wet, glinting trails and sprays off him at every gasp (tiny voxels, 1/170 m,
// flashing in the light, splashing in the grass); the grass parts round both of them (titleVeg.js).
// The title's opening (titleIntro.js) is run 0 on a fixed script (startIntro): the raptor keeps
// its distance, then closes on cue; after that it's an ordinary run.
//
//   const ch = makeChase({ cave, lite, sfx });  scene.add(ch.group)
//   ch.update(dt, camera)   ch.hold = true (no new run starts: the nest is open)
//   ch.startIntro()  ch.live() → { mole, raptor } head positions (or null between runs)
//   ch.jump(t, loop)        (debug) restart a run and play it to t seconds
//   ch.dispose()
import * as THREE from 'three';
import { makeHeroMole } from '../gfx/char/hero.js';
import { buildRaptor } from '../deep/enemies/dinos.js';
import { Legs, Chain, look } from '../deep/enemies/rig.js';
import { VS as RVS } from '../deep/enemies/vox.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { clamp } from '../core/util.js';
import { Particles, SHAPE } from './fx.js';
import { CHASE_PATHS, ROOT_ARCS, floorH, route } from './titleCave.js';
import { caveToon, glowHex, lit, meshGlow } from './titleCaveFx.js';
import { RAMP } from '../deep/veg/plants.js';
import { VoxelGrid } from './vox.js';
import { INTRO, introGap } from './titleIntro.js';

const TAU = Math.PI * 2;
const smooth = (t) => t * t * (3 - 2 * t);
const R = (a, b) => a + Math.random() * (b - a);

/**
 * The mine's raptor model in colouring v (0..2), built once and shared (the chase and the nest's
 * hatchlings use the same geometry); release() frees them all.
 */
const RAPTORS = new Map();
export function raptorModel(v) {
  v %= 3;
  let G = RAPTORS.get(v);
  if (!G) { G = buildRaptor(v); RAPTORS.set(v, G); }
  return G;
}
export function releaseRaptorModels() {
  for (const M of RAPTORS.values()) for (const g of Object.values(M)) { if (g && g.isBufferGeometry) g.dispose(); else if (Array.isArray(g)) g.forEach((x) => x.isBufferGeometry && x.dispose()); }
  RAPTORS.clear();
}

/** The raptor, assembled from the mine's model the way Raptor (src/deep/enemies/dinos.js) does it. */
function raptorRig(G, mat, eyeMat) {
  const VS = RVS;
  const g3 = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const part = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.layers.enable(LAYER_OUTLINE); parent.add(o); return o; };
  const root = new THREE.Group();
  root.name = 'raptor';
  const hips = g3(root, 0, 12 * VS, 0), bodyG = g3(hips);
  const body = part(G.body, mat, bodyG);
  const neck = g3(bodyG, 0, 6.5 * VS, 8 * VS);
  const head = part(G.head, mat, neck);
  const jaw = g3(neck, 0, 0.8 * VS, 1.5 * VS);
  const jawM = part(G.jaw, mat, jaw);
  const eyes = part(G.angry, eyeMat, neck, 0, 3 * VS, 0);
  const arms = [1, -1].map((sd) => { const g = g3(bodyG, sd * 3 * VS, 0.5 * VS, 5.5 * VS); const a = part(G.arm, mat, g); if (sd < 0) a.scale.x = -1; return g; });
  let tp = g3(bodyG, 0, 0.5 * VS, -5 * VS);
  const tail = G.tail.map((g, i) => { const s = i ? g3(tp, 0, 0.2 * VS, -4.8 * VS) : tp; part(g, mat, s); tp = s; return s; });
  const legParts = [1, -1].map((sd) => ({ sd, thigh: part(G.thigh, mat, hips), shin: part(G.shin, mat, hips), foot3: part(G.foot, mat, root) }));
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return { root, hips, bodyG, neck, jaw, eyes, arms, tail, legParts, meshes, body, head, jawM };
}

/** Legs whose feet find the cave's floor (no voxel world here). */
class FloorLegs extends Legs {
  floorY(x, z) {
    const e = this.e, s = e.size;
    return clamp(floorH(x, z), e.pos.y - 0.3 * s, e.pos.y + 0.3 * s);
  }
}

export function makeChase({ cave, lite = false, sfx = null } = {}) {
  const group = new THREE.Group();
  group.name = 'chase';
  const routes = CHASE_PATHS.map(route);
  // ---- the mole
  const mole = makeHeroMole({ height: 0.86, pack: true, hammer: true });
  mole.root.traverse((o) => { if (o.isMesh) o.layers.enable(LAYER_OUTLINE); });
  group.add(mole.root);
  // his lantern's light (not under the mole: a light that comes and goes with him would change
  // the scene's light count, and every material would recompile)
  const lantern = new THREE.PointLight(0xffb45a, 0, 4.5, 1.4);
  const LANTERN = new THREE.Vector3(0.12, 0.62, -0.2);
  group.add(lantern);
  // ---- the raptor (its three colourings, swapped run to run)
  const mat = caveToon({ emissive: 0.06, key: 'raptor' }), eyeMat = caveToon({ emissive: 2.4, key: 'raptor-eye' });
  // (the first colouring now; the others are built when a run first needs them)
  const rap = raptorRig(raptorModel(0), mat, eyeMat);
  group.add(rap.root);
  const SIZE = 1.45;
  const e = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, size: SIZE, grounded: true, info: {}, airT: 0, root: rap.root, emergeK: 1 };
  const VS = RVS;
  const defs = rap.legParts.map((L, i) => ({ parent: rap.hips, hip: [L.sd * 2.6 * VS, 0, -0.5 * VS], l1: 5.5 * VS, l2: 6 * VS, thigh: L.thigh, shin: L.shin, foot3: L.foot3, knee: [0, 0, 1], rest: [L.sd * 0.1, 0.03], group: i, lift: 0.12 }));
  let stepSnd = null;
  const legs = new FloorLegs(e, defs, { stride: 0.34, stepT: 0.2, lead: 0.15, speedK: 0.3, onStep: (L, k) => stepSnd?.(L, k) });
  const tailChain = new Chain(rap.tail, { sway: 0.12, swayHz: 6, lag: 0.15, droop: -0.04 });
  const setColours = (v) => {
    const G = raptorModel(v);
    rap.body.geometry = G.body; rap.head.geometry = G.head; rap.jawM.geometry = G.jaw; rap.eyes.geometry = G.angry;
    rap.root.traverse((o) => {
      if (!o.isMesh || o === rap.body || o === rap.head || o === rap.jawM || o === rap.eyes) return;
      const p = o.parent;
      if (rap.arms.includes(p)) o.geometry = G.arm;
      else if (rap.tail.includes(p)) o.geometry = G.tail[rap.tail.indexOf(p)];
    });
    for (const L of rap.legParts) { L.thigh.geometry = G.thigh; L.shin.geometry = G.shin; L.foot3.geometry = G.foot; }
  };

  // ---- fx: spore puffs, dust, cap chips
  const puffs = new Particles({ max: lite ? 160 : 260, additive: true, atten: true, renderOrder: 7 });
  const dust = new Particles({ max: 120, additive: false, atten: true, renderOrder: 6 });
  group.add(puffs.points, dust.points);
  const sporeBurst = (x, y, z, ramp, n = 26, up = 1) => {
    const RR = RAMP[ramp] || RAMP.cyan;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = R(0.2, 1.1);
      puffs.spawn({ pos: [x + R(-0.15, 0.15), y + R(-0.1, 0.2), z + R(-0.15, 0.15)], vel: [Math.cos(a) * sp, R(0.2, 1.0) * up, Math.sin(a) * sp], life: R(1.4, 3.2), color: RR[6], color2: RR[4], size: R(0.02, 0.045), size2: 0.015, shape: SHAPE.square, drag: 1.6, gravity: -0.12, flicker: 0.3, wobble: 0.08 });
    }
  };
  const kickDust = (x, y, z, n = 4, k = 1) => {
    for (let i = 0; i < n; i++) dust.spawn({ pos: [x + R(-0.08, 0.08), y + 0.02, z + R(-0.08, 0.08)], vel: [R(-0.5, 0.5) * k, R(0.2, 0.7) * k, R(-0.5, 0.5) * k], life: R(0.4, 0.8), color: [0x3a3028, 0x4a3e32, 0x2e2620][i % 3], size: R(0.018, 0.03), shape: SHAPE.square, gravity: 3, drag: 2 });
  };

  // ---- sweat (tiny voxels, 1/170 m): fat drops that well up on his brow and temples and stream
  // down past his eyes and cheeks, leaving a wet, glinting trail; beads flung off him on every
  // gasping bob of his head, flashing as they tumble through the light; then splashes in the grass
  const SWEAT_N = lite ? 48 : 80, GLINT_N = lite ? 70 : 120;
  const sweatGeo = (() => {
    const g = new VoxelGrid(3, 5, 3);
    const D = lit(0x4a9ad8), B = lit(0x8ad0f6), L = lit(0xc4ecff), W = glowHex(0xf6feff, 2);
    g.set(1, 0, 1, D);
    for (const [x, z] of [[1, 1], [0, 1], [2, 1], [1, 0], [1, 2]]) g.set(x, 1, z, B);
    g.set(0, 2, 1, W); g.set(1, 2, 1, B); g.set(1, 2, 0, L); g.set(2, 1, 1, D);
    g.set(1, 3, 1, L);
    return meshGlow(g, { scale: 1 / 170, pivot: [1.5, 1.5, 1.5] });
  })();
  const glintGeo = (() => { const g = new VoxelGrid(1, 1, 1); g.set(0, 0, 0, glowHex(0xeefaff, 3)); return meshGlow(g, { scale: 1 / 170, pivot: [0.5, 0.5, 0.5] }); })();
  const sweatMat = caveToon({ emissive: 0.6, key: 'sweat' }), glintMat = caveToon({ emissive: 0.9, key: 'sweat-glint' });
  const sweat = new THREE.InstancedMesh(sweatGeo, sweatMat, SWEAT_N);
  const glints = new THREE.InstancedMesh(glintGeo, glintMat, GLINT_N);
  const _dc = new THREE.Color(1, 1, 1);
  for (let i = 0; i < SWEAT_N; i++) sweat.setColorAt(i, _dc); // (each bead flashes on its own)
  for (const m of [sweat, glints]) { m.frustumCulled = false; m.count = 0; m.name = 'sweat'; group.add(m); }
  const drops = [], trail = [];
  const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _dv = new THREE.Vector3(), _ds = new THREE.Vector3(), _dp = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let sweatAcc = 0, streamAcc = 0, bobN = -1;
  const A = mole.anchors;
  const hx = A.headW / 2, ex = A.eyes;
  // where on his face (head frame) a stream runs: [start, end] for a side; brow → past the eye → cheek, or down the temple
  const streamPath = (side, temple) => (temple
    ? [new THREE.Vector3(side * (hx * 0.9 + 0.008), ex.y + A.headH * 0.24, ex.z * 0.35), new THREE.Vector3(side * (hx * 0.88 + 0.008), ex.y - A.headH * 0.26, ex.z * 0.42)]
    : [new THREE.Vector3(side * hx * 0.5, ex.y + A.headH * 0.3, ex.z + 0.008), new THREE.Vector3(side * hx * 0.8, ex.y - A.headH * 0.28, ex.z * 0.84 + 0.008)]);
  const spawnDrop = (kind = 'bead') => {
    if (drops.length >= SWEAT_N) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    const d = { kind, t: 0, side, p: new THREE.Vector3(), v: new THREE.Vector3(), fly: false, ph: Math.random() * 6.28, trailT: 0 };
    if (kind === 'stream') {
      // a fat drop welling up and streaming slowly down his face
      d.path = streamPath(side, Math.random() < 0.45);
      d.cling = R(0.75, 1.2); d.s = R(2.4, 3.0); d.l = d.path[0].clone();
    } else if (kind === 'bead') {
      d.cling = R(0.12, 0.4); d.s = R(1.2, 1.7);
      d.l = Math.random() < 0.55 ? new THREE.Vector3(side * hx * R(0.1, 0.55), ex.y + A.headH * R(0.12, 0.3), ex.z * 0.86 + 0.012)
        : new THREE.Vector3(side * (hx * 0.9 + 0.008), ex.y + A.headH * R(-0.05, 0.25), ex.z * R(0.1, 0.5));
    } else {
      // flung off as his head jerks with a gasp: straight into the air
      d.cling = 0; d.s = R(1.1, 1.8);
      d.l = new THREE.Vector3(side * hx * R(0.4, 0.95), ex.y + A.headH * R(-0.1, 0.32), ex.z * R(0.2, 0.8));
    }
    drops.push(d);
  };
  const stepSweat = (dt, k, vx, vz, gaspN) => {
    sweatAcc += dt * 8 * k;
    while (sweatAcc >= 1) { sweatAcc -= 1; spawnDrop('bead'); }
    // a couple of fat streams always on his face (more in the close-up)
    streamAcc += dt * 2.2 * k;
    while (streamAcc >= 1) { streamAcc -= 1; if (drops.filter((d) => d.kind === 'stream' && !d.fly).length < 2 + Math.round(k)) spawnDrop('stream'); }
    // every gasp jerks his head: a spray of beads
    if (gaspN !== bobN) { if (bobN >= 0) for (let i = 0, n = Math.round(2 + 2.5 * k); i < n; i++) spawnDrop('fling'); bobN = gaspN; }
    mole.root.updateMatrixWorld(true);
    _ds.set(-vz, 0, vx).normalize(); // (his left, in the world)
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t += dt;
      if (!d.fly) {
        if (d.kind === 'stream') {
          // it swells, then runs: slow, then quicker, wobbling across the brow's curve
          const u = Math.max(0, (d.t - 0.15) / (d.cling - 0.15));
          d.l.lerpVectors(d.path[0], d.path[1], u * u * (3 - 2 * u));
          d.l.x += Math.sin(d.t * 9 + d.ph) * 0.003;
          d.trailT -= dt;
          if (d.trailT <= 0 && u > 0.02 && trail.length < GLINT_N) { d.trailT = 0.025; trail.push({ l: d.l.clone(), t: 0, life: R(0.6, 1.0) }); }
        } else d.l.y -= dt * 0.16;
        d.p.copy(d.l);
        mole.neck.localToWorld(d.p);
        if (d.t >= d.cling) {
          // flung off: his own speed, out to the side, up, back a little
          d.fly = true;
          const out = d.kind === 'fling' ? R(1.0, 1.7) : R(0.4, 1.0);
          d.v.set(vx * R(0.6, 0.85), R(0.6, 1.4) * (d.kind === 'fling' ? 1.3 : 1), vz * R(0.6, 0.85)).addScaledVector(_ds, -d.side * out);
        }
      } else {
        d.v.y -= 9.8 * dt;
        d.v.multiplyScalar(Math.exp(-0.6 * dt));
        d.p.addScaledVector(d.v, dt);
        const gy = floorH(d.p.x, d.p.z);
        if (d.p.y < gy + 0.01) {
          for (let q = 0; q < 3; q++) dust.spawn({ pos: [d.p.x, gy + 0.03, d.p.z], vel: [R(-0.35, 0.35), R(0.3, 0.8), R(-0.35, 0.35)], life: R(0.2, 0.35), color: 0xd8f4ff, size: 0.012, shape: SHAPE.square, gravity: 6 });
          drops.splice(i, 1);
          continue;
        }
      }
      if (d.t > 3) drops.splice(i, 1);
    }
    let n = 0;
    for (const d of drops) {
      if (n >= SWEAT_N) break;
      if (d.fly) { _dv.copy(d.v).normalize().negate(); _dq.setFromUnitVectors(UP, _dv); } else _dq.identity();
      const sc = d.s * (d.t < 0.12 ? 0.35 + 0.65 * d.t / 0.12 : 1) * (d.kind === 'stream' && !d.fly ? 1 + 0.08 * Math.sin(d.t * 14) : 1);
      _dm.compose(d.p, _dq, _dv.set(sc, sc * (d.fly ? 1.3 : 1.15), sc));
      sweat.setMatrixAt(n, _dm);
      // tumbling through the air they flash as they catch the light
      const f = d.fly ? 1 + 1.4 * Math.max(0, Math.sin(d.t * 26 + d.ph)) ** 4 : 1.15;
      sweat.setColorAt(n++, _dc.setRGB(f, f, f));
    }
    sweat.count = n;
    sweat.instanceMatrix.needsUpdate = true;
    if (sweat.instanceColor) sweat.instanceColor.needsUpdate = true;
    // the wet trails: glinting beads of damp in the head's frame, drying away
    let g = 0;
    for (let i = trail.length - 1; i >= 0; i--) { const T = trail[i]; T.t += dt; if (T.t > T.life) trail.splice(i, 1); }
    for (const T of trail) {
      if (g >= GLINT_N) break;
      _dp.copy(T.l);
      mole.neck.localToWorld(_dp);
      const k2 = 1 - T.t / T.life, sc = (0.9 + 0.8 * k2) * (0.85 + 0.35 * Math.max(0, Math.sin(T.t * 19 + T.l.y * 900)));
      _dm.compose(_dp, _dq.identity(), _dv.set(sc, sc * 1.6, sc));
      glints.setMatrixAt(g++, _dm);
    }
    glints.count = g;
    glints.instanceMatrix.needsUpdate = true;
  };
  /** Fear on his face (after the rig's own update): brows high and tilted up in the middle, quivering; a gasping, trembling mouth. */
  const _mouthRest = mole.mouth.position.clone();
  const fearFace = (tt) => {
    const lift = 2.1 + Math.sin(tt * 31) * 0.22, q = Math.sin(tt * 23) * 0.05;
    for (const b of mole.brows || []) {
      const side = b.userData.side;
      b.rotation.z = side * (-0.92 + q * side);
      b.position.y = b.userData.y + lift * mole.vs;
    }
    // gulping air (the open "oh") and between gasps a clenched, trembling grimace
    const ov = mole.mouth.userData.variants;
    const inhale = Math.sin(tt * 8.5) > -0.35;
    if (ov && ov.oh && ov.grimace) {
      for (const k in ov) ov[k].visible = k === (inhale ? 'oh' : 'grimace');
      mole.mouth.visible = true;
      mole.curOpen = null; // (the rig sets its own again next frame)
    }
    mole.mouth.position.set(_mouthRest.x + Math.sin(tt * 47) * mole.vs * 0.35, _mouthRest.y + Math.sin(tt * 39) * mole.vs * 0.25, _mouthRest.z);
  };

  // ---- what gets knocked about
  const breaks = cave?.breakables || [];
  const flying = [];
  const knock = (B, dirX, dirZ, hard) => {
    B.axis.set(dirZ, 0, -dirX).normalize();
    B.angV += hard ? 5.5 : 2.6;
    const top = B.y + (B.top || 0.4) * 0.7;
    if (B.kind === 'cap') {
      sporeBurst(B.x, top, B.z, B.ramp, hard ? 34 : 14);
      if (hard && B.regrow >= 1) {
        // the cap comes off and tumbles away
        B.capHold.updateWorldMatrix(true, false);
        const fly = B.cap.clone();
        fly.matrixAutoUpdate = true;
        B.capHold.getWorldPosition(fly.position);
        B.capHold.getWorldQuaternion(fly.quaternion);
        group.add(fly);
        flying.push({ o: fly, v: new THREE.Vector3(dirX * R(2.2, 3.2), R(1.8, 2.6), dirZ * R(2.2, 3.2)), w: new THREE.Vector3(R(-6, 6), R(-3, 3), R(-6, 6)), rest: false, sink: 0, B });
        B.regrow = 0;
        sfx?.('chase_squish', { at: B, vol: 1 });
      } else sfx?.('chase_brush', { at: B, vol: 0.7 });
    } else {
      B.pop = 0; B.popT = 0;
      sporeBurst(B.x, B.y + 0.15, B.z, 'pink', hard ? 30 : 16, 1.3);
      sfx?.('chase_puff', { at: B, vol: 1 });
    }
  };

  // ---- the runs
  let loopN = 0, run = null, t = 0, waitT = 1.4, disposed = false;
  const _p = {}, _q = {};
  const newRun = (n, intro = false) => {
    const variant = intro ? 0 : n % 2;
    const rt = routes[variant];
    const vm = intro ? INTRO.vm : R(3.3, 3.8);
    const vr0 = vm + R(0.7, 1.0);
    // where it lunges (and which way he jinks); where he hops the root
    const lungeAt = rt.L * R(0.38, 0.5);
    const arc = ROOT_ARCS.map((A) => rt.nearest(A.x, A.z)).sort((a, b) => a.d - b.d)[0];
    // the clumps it barges through: arc length and the side they stand on
    const hits = [];
    for (const B of breaks) {
      const near = rt.nearest(B.x, B.z);
      if (near.d > 1.6) continue;
      const p = rt.at(near.s);
      const side = Math.sign((B.x - p.x) * -p.tz + (B.z - p.z) * p.tx) || 1;
      hits.push({ B, s: near.s, off: side * near.d, hit: false });
    }
    if (intro) {
      return {
        n, variant, rt, vm, vr0: vm + 0.85, lungeAt: INTRO.lungeAt, jinkDir: 1, hopS: arc.d < 1.2 ? arc.s : -99, hits, intro: true, visFrom: -7,
        colour: 0, t: 0, sm: INTRO.s0, gap: introGap(0), lunge: null, glances: [...INTRO.glances, (INTRO.lungeAt - INTRO.s0) / vm + 0.5], burst: false, ended: false,
        skid: 0, stepPh: 0,
      };
    }
    return {
      n, variant, rt, vm, vr0, lungeAt, jinkDir: Math.random() < 0.5 ? 1 : -1, hopS: arc.d < 1.2 ? arc.s : -99, hits, visFrom: -1.2,
      colour: n % 3, t: 0, sm: -1.2, gap: R(3.4, 4.2), lunge: null, glances: [R(2.2, 3.5), lungeAt / vm + R(1.6, 2.6)], burst: false, ended: false,
      skid: 0, stepPh: 0,
    };
  };
  const startRun = (intro = false) => {
    run = newRun(loopN++, intro);
    setColours(run.colour);
    legs.inited = false;
    e.vel.set(0, 0, 0);
    mole.root.visible = false; rap.root.visible = false;
    mole.play('run', run.vm / 1.45);
    // terrified: eyes wide, gasping for breath
    mole.setExpression('surprised', { body: false });
    mole.talk(false); // (the panting mouth is fearFace's)
    drops.length = 0; trail.length = 0; bobN = -1;
  };
  const endRun = () => {
    // (the next run's colouring is built now, in the quiet between runs)
    const next = loopN % 3;
    setTimeout(() => { if (!disposed) raptorModel(next); }, 400);
    run = null;
    mole.root.visible = false; rap.root.visible = false;
    mole.talk(false);
    mole.curOpen = null;
    mole.mouth.position.copy(_mouthRest);
    drops.length = 0; trail.length = 0; sweat.count = 0; glints.count = 0;
    if (cave) cave.pushers = [];
    lantern.intensity = 0;
    waitT = R(3.5, 6.5);
  };
  mole.root.visible = false; rap.root.visible = false;
  const _look = new THREE.Vector3();

  // footsteps
  let moleStepPh = 0;
  stepSnd = (L, k) => { if (run && sfx) sfx('chase_rstep', { at: e.pos, vol: 0.6 + k * 0.4 }); if (k > 0.5) kickDust(L.foot.x, L.foot.y, L.foot.z, 3, 0.8); };

  function stepRun(dt) {
    const r = run;
    r.t += dt;
    const rt = r.rt;
    // ---- the mole: a steady sprint, a jink at the lunge, a hop over the root
    r.sm += r.vm * dt * (r.lunge && r.lunge.t < 0.5 ? 1.12 : 1);
    let lat = 0, hopY = 0;
    if (r.lunge) {
      const k = r.lunge.t;
      lat = r.jinkDir * 0.62 * Math.sin(clamp(k / 1.4, 0, 1) * Math.PI) ** 0.8;
    }
    const dh = r.sm - r.hopS;
    if (Math.abs(dh) < 0.75) hopY = Math.sin(((dh + 0.75) / 1.5) * Math.PI) * 0.34;
    rt.at(r.sm, _p);
    const mx = _p.x - _p.tz * lat, mz = _p.z + _p.tx * lat;
    const my = floorH(mx, mz);
    mole.root.position.set(mx, my + hopY, mz);
    let yaw = Math.atan2(_p.tx, _p.tz);
    if (r.lunge) yaw += r.jinkDir * 0.35 * Math.cos(clamp(r.lunge.t / 1.4, 0, 1) * Math.PI) * (r.lunge.t < 1.4 ? 1 : 0);
    mole.face(yaw);
    mole.play(hopY > 0.02 ? 'jump' : 'run', r.vm / 1.45);
    // glancing back over his shoulder
    let glance = 0;
    for (const g of r.glances) if (r.t > g && r.t < g + 0.6) glance = Math.sin(((r.t - g) / 0.6) * Math.PI);
    if (r.lunge && r.lunge.t > 0.6 && r.lunge.t < 1.2) glance = Math.max(glance, 0.8);
    const gside = (r.n % 2 ? 1 : -1);
    mole.look(gside * 1.05 * glance, 0.12 * glance);
    const twist = gside * 0.28 * glance;
    mole.root.visible = r.sm > -1;
    // ---- the raptor: it gains, it lunges, it skids, it gains
    if (!r.burst && r.sm - r.gap > -0.6) { r.burst = true; sfx?.('chase_screech', { at: e.pos, vol: 1 }); }
    if (!r.lunge && r.sm >= r.lungeAt && r.gap < 2.2) { r.lunge = { t: 0, snapped: false }; sfx?.('chase_bark', { at: e.pos, vol: 1 }); }
    let jumpY = 0, crouch = 0, jaw = 0.12, lean = 0, tailUp = 0;
    if (r.lunge) {
      const L = r.lunge;
      L.t += dt;
      if (L.t < 0.18) { crouch = L.t / 0.18; tailUp = 0.4 * crouch; r.gap -= dt * 0.5; }
      else if (L.t < 0.62) {
        const k = (L.t - 0.18) / 0.44;
        jumpY = Math.sin(k * Math.PI) * 0.55; lean = -0.2; jaw = 0.85 * (1 - k * 0.3); tailUp = 0.35;
        r.gap = Math.max(0.35, r.gap - dt * 6.5);
        if (k > 0.75 && !L.snapped) { L.snapped = true; sfx?.('chase_snap', { at: mole.root.position, vol: 1 }); }
      } else if (L.t < 1.3) {
        // landed: it skids, dust flying, and loses ground
        const k = (L.t - 0.62) / 0.68;
        r.gap += dt * 3.2;
        lean = 0.3 * (1 - k); jaw = 0.3 * (1 - k);
        if (Math.random() < dt * 30) kickDust(e.pos.x, e.pos.y, e.pos.z, 2, 1.2);
        if (!L.landed) { L.landed = true; sfx?.('chase_skid', { at: e.pos, vol: 1 }); kickDust(e.pos.x, e.pos.y, e.pos.z, 10, 1.5); }
      } else r.gap -= dt * (r.vr0 - r.vm) * 0.6;
    } else if (r.burst) r.gap -= dt * (r.vr0 - r.vm);
    if (r.intro && r.t < INTRO.hold) r.gap = introGap(r.t); // (the opening's script)
    r.gap = Math.max(0.3, r.gap);
    const sr = r.sm - r.gap;
    // its line bends through the clumps near the route (it barges straight through them)
    let rlat = 0;
    for (const h of r.hits) {
      const d = Math.abs(sr - h.s);
      if (d < 1.8) rlat += h.off * smooth(1 - d / 1.8) * 0.85;
    }
    rt.at(sr, _q);
    const rx = _q.x - _q.tz * rlat, rz = _q.z + _q.tx * rlat;
    const ry = floorH(rx, rz) + jumpY;
    const px = e.pos.x, pz = e.pos.z;
    e.pos.set(rx, ry, rz);
    if (r.t > dt) e.vel.set((rx - px) / Math.max(dt, 1e-3), 0, (rz - pz) / Math.max(dt, 1e-3));
    e.yaw = Math.atan2(_q.tx, _q.tz);
    e.grounded = jumpY < 0.02; e.airT = e.grounded ? 0 : e.airT + dt;
    rap.root.position.copy(e.pos);
    rap.root.rotation.y = e.yaw;
    rap.root.scale.setScalar(SIZE);
    rap.root.visible = sr > r.visFrom;
    if (!legs.inited) legs.reset();
    legs.update(dt);
    // its pose (as the mine's Raptor.animate)
    const sp = Math.hypot(e.vel.x, e.vel.z), tt = r.t;
    lean += clamp(sp * 0.06, 0, 0.25);
    if (!e.grounded) lean -= 0.15;
    rap.bodyG.rotation.x = lean + Math.sin(tt * 2.4) * 0.02;
    rap.hips.position.y = (12 - crouch * 3) * VS + Math.abs(Math.sin(tt * (6 + sp * 2.5))) * 0.4 * VS * clamp(sp / 2, 0, 1);
    rap.arms.forEach((a, i) => { a.rotation.x = -0.9 + Math.sin(tt * 5 + i) * 0.15; });
    mole.root.updateMatrixWorld(true);
    _look.set(mole.root.position.x, mole.root.position.y + 0.55, mole.root.position.z);
    look(rap.neck, _look, dt, { yaw: 1, pitch: 0.6, rate: 9, basePitch: 0.1 });
    rap.jaw.rotation.x = jaw + (r.lunge && r.lunge.t < 0.7 ? 0 : 0.18 * (0.6 + 0.4 * Math.sin(tt * 25)) * (r.gap < 2 ? 1 : 0));
    tailChain.update(dt, e, { pitch: -tailUp });
    // the clumps it barges through (and the ones he brushes past)
    for (const h of r.hits) {
      if (h.hit) continue;
      const B = h.B;
      if (Math.hypot(rx - B.x, rz - B.z) < 0.75 && rap.root.visible) { h.hit = true; knock(B, _q.tx, _q.tz, true); }
      else if (Math.hypot(mx - B.x, mz - B.z) < 0.55) knock(B, _p.tx, _p.tz, false);
    }
    // his lantern, his feet
    lantern.intensity = mole.root.visible ? 1.0 * clamp(r.t * 2, 0, 1) : 0;
    mole.update(dt);
    if (mole.stepN !== moleStepPh) { moleStepPh = mole.stepN; if (hopY < 0.02) { sfx?.('chase_step', { at: mole.root.position, vol: 0.8 }); if (Math.random() < 0.5) kickDust(mx, my, mz, 2, 0.6); } } // (his footfalls: gait.js)
    mole.root.rotation.y = mole.facing + twist;
    // heaving for breath: the head bobs with each gasp, the shoulders hunch; fear all over his face
    const gasp = Math.sin(r.t * 8.5);
    mole.neck.rotation.x += gasp * 0.07 - 0.05;
    mole.hip.rotation.x += 0.08 + gasp * 0.025;
    fearFace(r.t);
    mole.root.updateMatrixWorld(true);
    lantern.position.copy(LANTERN).applyMatrix4(mole.root.matrixWorld);
    // sweat pouring off him (more in the opening's close-up)
    if (mole.root.visible) stepSweat(dt, r.intro && r.t < INTRO.dur ? 2.4 : 1, _p.tx * r.vm, _p.tz * r.vm, Math.floor((r.t * 8.5 + 1.2) / (Math.PI * 2)));
    // the grass parts round them
    if (cave) {
      const P = cave.pushers || (cave.pushers = []);
      P.length = 0;
      if (mole.root.visible) P.push({ x: mx, y: my, z: mz, r: 0.42 });
      if (rap.root.visible) P.push({ x: rx, y: ry - jumpY, z: rz, r: 0.75 });
    }
    // gone into the dark on the far side
    if (sr > rt.L + 1.5) endRun();
  }

  /** Knocked caps tumble and lie; they sink away and grow back while nobody's running. */
  function stepBits(dt) {
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      if (!f.rest) {
        f.v.y -= 9.8 * dt;
        f.o.position.addScaledVector(f.v, dt);
        f.o.rotation.x += f.w.x * dt; f.o.rotation.y += f.w.y * dt; f.o.rotation.z += f.w.z * dt;
        const gy = floorH(f.o.position.x, f.o.position.z) + 0.06;
        if (f.o.position.y < gy) {
          f.o.position.y = gy;
          if (f.v.y < -1.5) { f.v.y *= -0.3; f.v.x *= 0.5; f.v.z *= 0.5; f.w.multiplyScalar(0.4); kickDust(f.o.position.x, gy, f.o.position.z, 4, 0.7); sfx?.('chase_thud', { at: f.o.position, vol: 0.6 }); }
          else { f.rest = true; f.o.rotation.x = Math.round(f.o.rotation.x / Math.PI) * Math.PI + R(-0.5, 0.5); f.o.rotation.z = R(-0.6, 0.6); }
        }
      } else if (!run) {
        f.sink += dt;
        if (f.sink > 1.5) f.o.position.y -= dt * 0.12;
        if (f.sink > 5) { f.o.removeFromParent(); flying.splice(i, 1); }
      }
    }
    for (const B of breaks) {
      // the spring that wobbles a mushroom back upright
      B.angV += (-55 * B.ang - 3.2 * B.angV) * dt;
      B.ang += B.angV * dt;
      B.sway.quaternion.setFromAxisAngle(B.axis, clamp(B.ang, -0.6, 0.6) * 0.35);
      if (B.kind === 'cap') {
        if (B.regrow < 1 && !run) B.regrow = Math.min(1, B.regrow + dt / 3.2);
        const k = B.regrow;
        B.capHold.scale.setScalar(Math.max(0.001, k < 1 ? smooth(k) * (1 + Math.sin(k * Math.PI) * 0.12) : 1));
        B.capHold.visible = k > 0.01;
      } else {
        B.popT += dt;
        if (B.pop < 1) B.pop = Math.min(1, B.pop + dt / (run ? 9 : 4.5));
        const p = B.pop;
        const sq = p < 0.08 ? 1 - p / 0.08 * 0.6 : 0.4 + 0.6 * smooth((p - 0.08) / 0.92);
        B.mesh.scale.set(1 + (1 - sq) * 0.35, Math.max(0.3, sq), 1 + (1 - sq) * 0.35);
      }
    }
  }

  const _lm = new THREE.Vector3(), _lr = new THREE.Vector3();
  return {
    group, mole, raptor: rap,
    hold: false,
    get running() { return !!run; },
    get intro() { return !!run?.intro; },
    /** The opening's run (run 0 on its script), from its first moment. */
    startIntro() { waitT = 0; startRun(true); stepRun(1 / 60); },
    /** Where their heads are now (for the opening's camera), or null between runs. */
    live() {
      if (!run) return null;
      rap.neck.updateWorldMatrix(true, false);
      return { mole: mole.neck.localToWorld(_lm.copy(mole.anchors.eyes)), raptor: rap.neck.localToWorld(_lr.set(0, 3 * RVS, 4 * RVS)), t: run.t };
    },
    update(dt, camera, heightPx = 600) {
      t += dt;
      if (run) stepRun(dt);
      else if (!this.hold) { waitT -= dt; if (waitT <= 0) startRun(); }
      stepBits(dt);
      puffs.setScaleFromCamera(camera, heightPx);
      dust.setScaleFromCamera(camera, heightPx);
      puffs.update(dt);
      dust.update(dt);
    },
    /** (debug) start run n afresh and play it to t seconds. */
    jump(time = 3, n = loopN, intro = false) {
      loopN = n;
      startRun(intro);
      const step = 1 / 30;
      for (let s = 0; s < time && run; s += step) { stepRun(step); stepBits(step); puffs.update(step); dust.update(step); }
    },
    /** End the current run at once (the nest is opening and wants a quiet cave). */
    stop() { if (run) endRun(); },
    lights: [lantern],
    materials: [mat, eyeMat, sweatMat, glintMat],
    dispose() {
      disposed = true;
      mole.dispose?.();
      releaseRaptorModels();
      puffs.geo.dispose(); puffs.mat.dispose(); dust.geo.dispose(); dust.mat.dispose();
      sweatGeo.dispose(); glintGeo.dispose();
      for (const f of flying) f.o.removeFromParent();
    },
  };
}
