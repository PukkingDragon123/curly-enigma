// The forest's animals, in voxels, each a little rig of parts with its own behaviour:
//   squirrel  nibbles on a fallen log by the trail; when the travellers come near it bounds along
//             the log, leaps to a tree and spirals up the trunk, tail flicking.
//   rabbit    sits in the ferns (ears twitching, nose going); hops off into the wood when they pass.
//   deer      a roe doe grazing at the clearing's far edge in the low sun; looks up when the chest
//             glints, bolts into the trees when the ground starts to crack.
//   birds     robins on the signpost, a stump and the bridge rail (hop, peck, fly off as he nears);
//             a woodpecker drumming on a giant's trunk.
//   frog      on a stone in the stream; puffs its throat, leaps in when the traveller comes near.
//   flyers    (wave 8) pixel-art butterflies over the verges and the clearing's flowers (they settle,
//             fan their wings, and lift off ahead of his boots), dragonflies darting over the
//             stream, swallows wheeling high over the clearing, and a songbird that flits across
//             the trail ahead of him in the opening shot.
//
//   const C = makeCritters(F, { lite }); scene.add(C.group);
//   C.update(dt, { t, hero: Vector3, cam: Camera, glint, crack, sfx(name, opts) }); C.dispose();
import * as THREE from 'three';
import { VoxelGrid, meshVoxGreedy, fshade, fmix } from '../vox.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { clamp, lerp } from '../../core/util.js';
import { forestToon } from '../forestfx.js';
import { groundH, FOREST, CLEAR_R } from '../forest.js';
import { butterflySheet, dragonflySheet, swallowSheet } from '../meadowfx.js';
import { makeSheetSprite } from '../fx.js';

const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

/** Build a part mesh from a grid painter: fn(g) fills the grid; pivot in voxels. */
function part(w, h, d, fn, scale, pivot, mat) {
  const g = new VoxelGrid(w, h, d);
  fn(g);
  const geo = meshVoxGreedy(g, { scale, pivot });
  const m = new THREE.Mesh(geo, mat);
  m.layers.enable(LAYER_OUTLINE);
  return m;
}

// ------------------------------------------------------------------ squirrel
const RUSSET = [0xd0703a, 0xb85e2c, 0x9a4a22], CREAM = 0xf2e2c4;
function makeSquirrel(mat) {
  const S = 1 / 80;
  const root = new THREE.Group();
  const body = new THREE.Group(); // pivot at the hips
  body.position.y = 4 * S;
  root.add(body);
  body.add(part(14, 16, 22, (g) => {
    g.ellipsoid(7, 5, 10, 4.2, 4.6, 7, (x, y, z) => (y < 4 && z > 9 ? CREAM : y > 7 ? RUSSET[0] : RUSSET[1]));
    g.ellipsoid(3.5, 3.5, 6, 2.6, 3.2, 3.6, RUSSET[1]); g.ellipsoid(10.5, 3.5, 6, 2.6, 3.2, 3.6, RUSSET[1]); // haunches
    for (const x of [3, 10]) for (let z = 4; z < 9; z++) g.set(x, 0, z, RUSSET[2]); // hind feet
  }, S, [7, 1, 6], mat));
  const head = new THREE.Group();
  head.position.set(0, 6 * S, 9.5 * S);
  body.add(head);
  head.add(part(12, 14, 12, (g) => {
    g.ellipsoid(6, 5, 5, 3.6, 3.6, 4.2, (x, y, z) => (y < 4 && z > 6 ? CREAM : RUSSET[0]));
    g.ellipsoid(6, 4, 8.5, 1.8, 1.6, 1.6, CREAM);
    g.set(6, 4.5, 10, 0x2a1a14); // nose
    for (const x of [3, 9]) { g.set(x, 6, 7.5, 0x140c08); g.set(x, 7, 7.5, 0xfff8f0); } // eyes with a glint
    for (const x of [3.5, 8.5]) for (let y = 8; y < 13; y++) g.set(x, y, 4, y > 10 ? 0x7a3a1a : RUSSET[0]); // ear tufts
  }, S, [6, 3, 5], mat));
  const legs = [];
  for (const x of [-1.8, 1.8]) {
    const l = new THREE.Group();
    l.position.set(x * S, 3 * S, 8 * S);
    l.add(part(3, 7, 3, (g) => { for (let y = 0; y < 6; y++) g.set(1, y, 1, y < 1 ? RUSSET[2] : CREAM); }, S, [1, 6, 1], mat));
    body.add(l);
    legs.push(l);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 6 * S, -5 * S);
  body.add(tail);
  tail.add(part(14, 26, 18, (g) => {
    // a bushy S: up and back, curling forward at the top
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const y = 2 + t * 19, z = 9 - Math.sin(t * Math.PI * 0.9) * 6 + t * t * 4;
      const r = 3.2 + Math.sin(t * Math.PI) * 1.6;
      g.ellipsoid(7, y, z, r, 2.6, r, (x, yy, zz) => (Math.hypot(x + 0.5 - 7, zz + 0.5 - z) > r - 1 ? fmix(RUSSET[0], 0xf0b070, 0.35) : RUSSET[2]));
    }
  }, S, [7, 2, 13], mat));
  return { root, body, head, legs, tail };
}

// ------------------------------------------------------------------ rabbit
const FUR = [0xa88a6c, 0x8e7458, 0x6e5a44];
function makeRabbit(mat) {
  const S = 1 / 64;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(part(16, 18, 22, (g) => {
    g.ellipsoid(8, 7, 9, 5, 5.6, 7.4, (x, y, z) => (y < 5 && z > 8 ? 0xe8dcc8 : y > 9 ? FUR[0] : FUR[1]));
    g.ellipsoid(4, 5, 6, 2.8, 4, 4.2, FUR[1]); g.ellipsoid(12, 5, 6, 2.8, 4, 4.2, FUR[1]);
    g.ellipsoid(8, 8, 1.5, 2.4, 2.4, 2, 0xf8f4ec); // cotton tail
    for (const x of [4, 12]) for (let z = 3; z < 11; z++) g.set(x, 0, z, FUR[2]);
    for (const x of [6, 10]) for (let y = 0; y < 5; y++) g.set(x, y, 14, FUR[1]);
  }, S, [8, 0, 9], mat));
  const head = new THREE.Group();
  head.position.set(0, 11 * S, 6.5 * S);
  body.add(head);
  head.add(part(14, 14, 14, (g) => {
    g.ellipsoid(7, 5, 6, 4, 4, 4.6, (x, y, z) => (y < 4 && z > 8 ? 0xe8dcc8 : FUR[0]));
    g.set(7, 4.5, 10.5, 0xd88a8a); // nose
    for (const x of [4, 10]) { g.set(x, 6, 9, 0x140c08); g.set(x, 7, 9, 0xfff8f0); }
  }, S, [7, 3, 6], mat));
  const ears = [];
  for (const x of [-1.6, 1.6]) {
    const e = new THREE.Group();
    e.position.set(x * S, 7.5 * S, -0.5 * S);
    e.add(part(5, 14, 5, (g) => { g.ellipsoid(2.5, 6.5, 2.5, 1.3, 6.5, 2, (xx, y, z) => (z > 2.5 && y > 1 && y < 11 ? 0xe8b0a8 : y > 11 ? 0x5a4636 : FUR[0])); }, S, [2.5, 0, 2.5], mat));
    e.rotation.x = -0.35;
    e.rotation.z = x * 0.08;
    head.add(e);
    ears.push(e);
  }
  return { root, body, head, ears };
}

// ------------------------------------------------------------------ deer
const DEER = [0xb27444, 0x9a6038, 0x7a4a2c];
function makeDeer(mat) {
  const S = 1 / 32;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 21 * S;
  root.add(body);
  body.add(part(16, 18, 34, (g) => {
    g.ellipsoid(8, 9, 17, 5.6, 6.6, 14, (x, y, z) => (y < 5 ? 0xd8b890 : y > 11 ? DEER[0] : DEER[1]));
    g.ellipsoid(8, 10, 4, 4.8, 5, 3.4, 0xf4ece0); // the white rump
  }, S, [8, 9, 17], mat));
  const neck = new THREE.Group();
  neck.position.set(0, 3 * S, 12 * S);
  body.add(neck);
  neck.add(part(10, 20, 12, (g) => {
    for (let i = 0; i < 12; i++) g.ellipsoid(5, 2 + i * 1.2, 4 + i * 0.35, 2.4, 1.6, 2.6, (x, y, z) => (z > 5 + i * 0.35 && y < 8 ? 0xd8b890 : DEER[0]));
  }, S, [5, 2, 4], mat));
  const head = new THREE.Group();
  head.position.set(0, 15 * S, 8 * S);
  neck.add(head);
  head.add(part(12, 14, 16, (g) => {
    g.ellipsoid(6, 6, 6, 3.2, 3.4, 4.2, DEER[0]);
    g.ellipsoid(6, 4.5, 10, 2.2, 2.2, 3.4, (x, y, z) => (z > 12 ? 0x2a1e18 : DEER[1]));
    for (const x of [3, 9]) { g.set(x, 7, 8, 0x140c08); g.set(x, 8, 8, 0x3a2a20); }
    for (const x of [1.5, 10.5]) g.ellipsoid(x, 11, 4, 1.4, 2.6, 1, (xx, y) => (y > 12 ? 0x5a3a24 : DEER[0]));
  }, S, [6, 5, 5], mat));
  const legs = [];
  for (const [x, z] of [[-3, 11], [3, 11], [-3, -11], [3, -11]]) {
    const l = new THREE.Group();
    l.position.set(x * S, -2 * S, z * S);
    l.add(part(4, 24, 4, (g) => { for (let y = 0; y < 22; y++) { g.set(1, y, 1, y < 2 ? 0x2a1e18 : y > 16 ? DEER[1] : DEER[2]); g.set(2, y, 1, y < 2 ? 0x2a1e18 : y > 16 ? DEER[1] : DEER[2]); } }, S, [1.5, 21, 1], mat));
    body.add(l);
    legs.push(l);
  }
  return { root, body, neck, head, legs };
}

// ------------------------------------------------------------------ songbird
function makeBird(mat, { back = 0x7a6248, breast = 0xe8783a, belly = 0xf4ece0, cap = null } = {}) {
  const S = 1 / 96;
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 2 * S;
  root.add(body);
  body.add(part(10, 14, 16, (g) => {
    g.ellipsoid(5, 5, 7, 3.4, 3.6, 4.6, (x, y, z) => (z > 8 && y < 7 ? breast : y < 3 ? belly : back));
    g.ellipsoid(5, 9, 10, 2.8, 2.8, 2.8, (x, y, z) => (cap && y > 10 ? cap : z > 10.5 && y < 9.5 ? breast : back));
    g.set(5, 9, 13, 0x2a2018); g.set(5, 9, 14, 0x2a2018); // beak
    g.set(3, 10, 11.5, 0x0e0a08); g.set(7, 10, 11.5, 0x0e0a08);
    for (let z = 0; z < 4; z++) g.set(5, 6 + z * 0.5, 2 - z * 0.4, fshade(back, 0.8)); // tail
    for (const x of [4, 6]) for (let y = 0; y < 2; y++) g.set(x, y, 7, 0x3a2a20);
  }, S, [5, 0, 7], mat));
  const wings = [];
  for (const sd of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sd * 3 * S, 6 * S, 0);
    w.add(part(9, 3, 9, (g) => { for (let x = 0; x < 8; x++) for (let z = 0; z < 7 - x * 0.4; z++) g.set(sd > 0 ? x : 8 - x, 1, z + 1, x > 5 ? fshade(back, 0.75) : back); }, S, [sd > 0 ? 0 : 8, 1, 5], mat));
    w.visible = false;
    body.add(w);
    wings.push(w);
  }
  return { root, body, wings };
}

// ------------------------------------------------------------------ frog
function makeFrog(mat) {
  const S = 1 / 64;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(part(14, 10, 14, (g) => {
    g.ellipsoid(7, 3.5, 7, 4.6, 3, 5, (x, y, z) => (y < 2 ? 0xd8d070 : (x + z) % 5 === 0 ? 0x3a6a2a : 0x5a9a3a));
    for (const x of [4, 10]) { g.ellipsoid(x, 6, 9.5, 1.5, 1.5, 1.5, 0x5a9a3a); g.set(x, 6.5, 10.8, 0x140c08); g.set(x, 7, 10.5, 0xf0d040); }
    for (const x of [1.5, 12.5]) g.ellipsoid(x, 1.5, 4, 1.6, 1.2, 3, 0x4a8a34);
  }, S, [7, 0, 7], mat));
  const throat = part(6, 4, 4, (g) => { g.ellipsoid(3, 2, 2, 2.2, 1.6, 1.6, 0xf0e890); }, S, [3, 2, 2], mat);
  throat.position.set(0, 1.5 * S, 9 * S);
  body.add(throat);
  return { root, body, throat };
}

// ------------------------------------------------------------------ the cast
/**
 * Place the forest's animals. F: the built forest (its spots). Returns { group, update, dispose, list }.
 */
export function makeCritters(F, { lite = false } = {}) {
  const group = new THREE.Group();
  group.name = 'critters';
  const mat = forestToon({ dapple: true });
  const list = [];
  const _v = new THREE.Vector3();
  const tr = FOREST.trail;

  // ---- the squirrel on the log by the trail
  {
    const log = F.spots.logs[0];
    const sq = makeSquirrel(mat);
    const dir = new THREE.Vector3(Math.cos(log.ry), 0, -Math.sin(log.ry)); // along the log
    const p0 = new THREE.Vector3(log.x - dir.x * 0.6, log.top, log.z - dir.z * 0.6);
    // the tree it flees to: the nearest giant
    const giant = FOREST.giants.reduce((b, g) => ((g.x - log.x) ** 2 + (g.z - log.z) ** 2 < (b.x - log.x) ** 2 + (b.z - log.z) ** 2 ? g : b), FOREST.giants[0]);
    const trunkR = 1.25 * giant.s;
    const toG = new THREE.Vector3(giant.x - p0.x, 0, giant.z - p0.z);
    const dG = toG.length(); toG.normalize();
    const base = new THREE.Vector3(giant.x - toG.x * trunkR, 0, giant.z - toG.z * trunkR);
    base.y = groundH(base.x, base.z);
    sq.root.position.copy(p0);
    sq.root.scale.setScalar(1.15);
    group.add(sq.root);
    let state = 'sit', st = 0, climbA = Math.atan2(-toG.z, -toG.x);
    const s0 = Math.random() * 3;
    list.push({
      name: 'squirrel', obj: sq,
      update(dt, c) {
        st += dt;
        const t = st + s0;
        if (state === 'sit') {
          // upright on its haunches, nibbling, looking round
          sq.root.rotation.y = Math.atan2(toG.x, toG.z) + 1.4;
          sq.body.rotation.x = -0.95;
          sq.head.rotation.x = 0.85 + Math.sin(t * 9) * 0.06 * (Math.sin(t * 0.7) > 0 ? 1 : 0);
          sq.head.rotation.y = Math.sin(t * 0.8) > 0.6 ? 0.6 : Math.sin(t * 0.8) < -0.7 ? -0.5 : 0;
          sq.legs.forEach((l, i) => { l.rotation.x = -1.6 + Math.sin(t * 9 + i) * 0.15; });
          sq.tail.rotation.x = 0.35 + Math.sin(t * 2.3) * 0.08 + (Math.sin(t * 5.1) > 0.92 ? 0.3 : 0);
          if (c.hero && c.hero.distanceTo(sq.root.position) < 3.6) { state = 'run'; st = 0; c.sfx?.('squirrel'); }
        } else if (state === 'run') {
          // bound along the ground to the giant
          const u = clamp(st / (dG / 2.6), 0, 1);
          _v.copy(p0).lerp(base, smooth(u));
          const hop = Math.abs(Math.sin(st * 14)) * 0.08;
          const gy = lerp(p0.y, base.y, smooth(u * 1.4));
          sq.root.position.set(_v.x, gy + hop + Math.sin(u * Math.PI) * 0.25, _v.z);
          sq.root.rotation.set(0, Math.atan2(toG.x, toG.z), 0);
          sq.body.rotation.x = Math.sin(st * 14) * 0.25;
          sq.head.rotation.set(-Math.sin(st * 14) * 0.2, 0, 0);
          sq.legs.forEach((l) => { l.rotation.x = Math.sin(st * 14) * 0.9; });
          sq.tail.rotation.x = 0.9 + Math.sin(st * 14 + 1) * 0.3;
          if (u >= 1) { state = 'climb'; st = 0; }
        } else {
          // spiral up the trunk, stopping now and then
          const up = Math.min(4.2, st * 1.1 * (Math.sin(st * 2.2) > -0.5 ? 1 : 0.15));
          climbA += dt * 0.35 * (up < 4.2 ? 1 : 0);
          const r = trunkR * (1 - up * 0.03) + 0.06;
          sq.root.position.set(giant.x + Math.cos(climbA) * r, base.y + 0.1 + up, giant.z + Math.sin(climbA) * r);
          // belly to the bark, head up
          sq.root.rotation.set(0, Math.atan2(-Math.cos(climbA), -Math.sin(climbA)), 0);
          sq.body.rotation.x = -1.45;
          sq.head.rotation.x = up >= 4.2 ? 1.0 + Math.sin(st * 3) * 0.2 : 0.6;
          sq.legs.forEach((l, i) => { l.rotation.x = Math.sin(st * 12 + i * 3) * 0.6; });
          sq.tail.rotation.x = 0.4 + Math.sin(st * 4) * 0.25;
        }
      },
    });
  }

  // ---- the rabbit in the ferns before the bridge
  {
    const s = 17.8;
    const [x, z] = tr.beside(s, 2.0);
    const rb = makeRabbit(mat);
    rb.root.position.set(x, groundH(x, z), z);
    group.add(rb.root);
    const P = tr.at(s);
    const away = new THREE.Vector3(-P.tz, 0, P.tx); // to his right, away from the trail
    let state = 'sit', st = 0, hops = 0;
    const start = rb.root.position.clone();
    let from = start.clone(), to = start.clone();
    list.push({
      name: 'rabbit', obj: rb,
      update(dt, c) {
        st += dt;
        if (state === 'sit') {
          rb.root.rotation.y = Math.atan2(P.tx, P.tz) + 2.2;
          rb.body.rotation.x = -0.2;
          rb.head.rotation.x = Math.sin(st * 23) * 0.015;
          rb.head.rotation.y = Math.sin(st * 0.6) * 0.3;
          rb.ears.forEach((e, i) => { e.rotation.x = -0.35 + (Math.sin(st * 1.7 + i * 2) > 0.85 ? 0.25 : 0); e.rotation.z = (i ? 1 : -1) * (0.08 + (Math.sin(st * 2.3 + i) > 0.9 ? 0.2 : 0)); });
          if (c.hero && c.hero.distanceTo(rb.root.position) < 2.9) { state = 'hop'; st = 0; }
        } else if (state === 'hop') {
          // a few long hops away, then sit and watch
          const dur = 0.42;
          if (st >= dur || hops === 0) {
            if (hops >= 5) { state = 'watch'; st = 0; return; }
            from.copy(rb.root.position);
            const a = (hops % 2 ? 0.35 : -0.25);
            to.set(from.x + (away.x * Math.cos(a) - away.z * Math.sin(a)) * 0.9, 0, from.z + (away.z * Math.cos(a) + away.x * Math.sin(a)) * 0.9);
            to.y = groundH(to.x, to.z);
            hops++; st = 0;
          }
          const u = st / dur;
          rb.root.position.lerpVectors(from, to, u);
          rb.root.position.y += Math.sin(u * Math.PI) * 0.28;
          rb.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
          rb.body.rotation.x = Math.sin(u * Math.PI * 2) * 0.35;
          rb.ears.forEach((e) => { e.rotation.x = -0.9; });
        } else {
          rb.root.rotation.y = Math.atan2(start.x - rb.root.position.x, start.z - rb.root.position.z);
          rb.body.rotation.x = -0.35;
          rb.ears.forEach((e) => { e.rotation.x = -0.15; });
        }
      },
    });
  }

  // ---- a roe doe at the far edge of the clearing, in the low sun
  {
    const dr = makeDeer(mat);
    const home = new THREE.Vector3(-4.6, 0, -7.6);
    home.y = groundH(home.x, home.z);
    dr.root.position.copy(home);
    dr.root.rotation.y = 0.4;
    group.add(dr.root);
    let state = 'graze', st = 0;
    const flee = new THREE.Vector3(-12, 0, -16);
    list.push({
      name: 'deer', obj: dr,
      update(dt, c) {
        st += dt;
        const t = c.t;
        if (state !== 'bolt' && c.crack) { state = 'bolt'; st = 0; c.sfx?.('deer'); }
        if (state === 'graze') {
          // head down nibbling, now and then up for a look round
          const look = Math.sin(t * 0.45) > 0.55;
          dr.neck.rotation.x = lerp(dr.neck.rotation.x, look ? -0.1 : 1.35, Math.min(1, dt * 3));
          dr.head.rotation.x = look ? 0 : 0.3 + Math.sin(t * 6) * 0.05;
          dr.head.rotation.y = look ? Math.sin(t * 0.9) * 0.4 : 0;
          dr.legs.forEach((l) => { l.rotation.x = 0; });
          if (c.glint) { state = 'alert'; st = 0; }
        } else if (state === 'alert') {
          // head up, ears forward, staring at the glint
          dr.neck.rotation.x = lerp(dr.neck.rotation.x, -0.25, Math.min(1, dt * 5));
          dr.head.rotation.y = lerp(dr.head.rotation.y, 0.9, Math.min(1, dt * 3));
          dr.head.rotation.x = 0.1;
        } else {
          // bound away into the trees
          const u = clamp(st / 2.4, 0, 1);
          const p = _v.copy(home).lerp(flee, u);
          const gait = st * 9;
          dr.root.position.set(p.x, groundH(p.x, p.z) + Math.abs(Math.sin(gait)) * 0.3, p.z);
          dr.root.rotation.y = Math.atan2(flee.x - home.x, flee.z - home.z);
          dr.body.rotation.x = Math.sin(gait) * 0.18;
          dr.neck.rotation.x = -0.35;
          dr.head.rotation.set(0, 0, 0);
          dr.legs.forEach((l, i) => { l.rotation.x = (i < 2 ? -1 : 1) * (0.6 + Math.sin(gait) * 0.6); });
          if (u >= 1) dr.root.visible = false;
        }
      },
    });
  }

  // ---- robins: on the signpost, a stump, a rock by the trail; they fly off as he nears
  const perches = [];
  if (F.spots.sign) perches.push({ x: F.spots.sign.x, z: F.spots.sign.z, y: F.spots.sign.top });
  const stumps = F.spots.stumps.filter((s) => FOREST.dist.trail(s.x, s.z) < 5).slice(0, 2);
  for (const s of stumps) perches.push({ x: s.x, z: s.z, y: s.top });
  const rocks = F.spots.rocks.filter((r) => !r.wet && FOREST.dist.trail(r.x, r.z) < 4).slice(0, lite ? 1 : 3);
  for (const r of rocks) perches.push({ x: r.x, z: r.z, y: r.top });
  if (lite) perches.length = Math.min(perches.length, 2);
  perches.forEach((p, i) => {
    const b = makeBird(mat, i % 3 === 2 ? { back: 0x6a6a72, breast: 0xd8c0a8, belly: 0xf0e8e0, cap: 0x2a2a30 } : {});
    b.root.position.set(p.x, p.y, p.z);
    b.root.scale.setScalar(1.25);
    group.add(b.root);
    let state = 'perch', st = Math.random() * 4;
    const home = b.root.position.clone();
    const fly = new THREE.Vector3((Math.random() - 0.5) * 8, 5 + Math.random() * 3, (Math.random() - 0.5) * 8);
    list.push({
      name: 'bird', obj: b,
      update(dt, c) {
        st += dt;
        if (state === 'perch') {
          // hop round, peck, look
          const ph = Math.floor(st * 0.8);
          b.root.rotation.y = ph * 1.7 + i;
          b.body.rotation.x = (Math.sin(st * 13) > 0.7 && ph % 3 === 0) ? 0.6 : 0;
          b.root.position.y = home.y + (st % 1.25 < 0.12 ? 0.04 : 0);
          if (c.hero && c.hero.distanceTo(home) < 2.4) { state = 'fly'; st = 0; c.sfx?.('flutter'); }
        } else {
          const u = clamp(st / 3, 0, 1);
          b.wings.forEach((w, k) => { w.visible = true; w.rotation.z = (k ? -1 : 1) * Math.sin(st * 40) * 0.9; });
          b.root.position.set(home.x + fly.x * u, home.y + fly.y * u * u + Math.sin(st * 6) * 0.1, home.z + fly.z * u);
          b.root.rotation.y = Math.atan2(fly.x, fly.z);
          if (u >= 1) b.root.visible = false;
        }
      },
    });
  });
  // a woodpecker drumming on the right-hand gate giant
  {
    const g = FOREST.giants[1];
    const b = makeBird(mat, { back: 0x2a2a2e, breast: 0xf0ece4, belly: 0xf0ece4, cap: 0xd82a2a });
    const a = g.ry + 0.4;
    const r = 1.18 * g.s;
    b.root.position.set(g.x + Math.sin(a) * r, g.y + 3.1, g.z + Math.cos(a) * r);
    b.root.rotation.y = a + Math.PI;
    b.root.scale.setScalar(1.4);
    group.add(b.root);
    let next = 1.5, drum = 0;
    list.push({
      name: 'woodpecker', obj: b,
      update(dt, c) {
        b.body.rotation.x = -1.3;
        next -= dt;
        if (next <= 0) { drum = 0.7; next = 3 + Math.random() * 3; if (c.hero && c.hero.distanceTo(b.root.position) < 22) c.sfx?.('woodpecker'); }
        if (drum > 0) { drum -= dt; b.body.rotation.x = -1.3 + (Math.sin(drum * 70) > 0 ? 0.25 : 0); }
      },
    });
  }
  // ---- the frog on a stone by the bridge
  {
    const rock = F.spots.rocks.filter((r) => r.wet).sort((a, b2) => Math.abs(a.x - FOREST.bridge.x) - Math.abs(b2.x - FOREST.bridge.x))[1];
    if (rock) {
      const fr = makeFrog(mat);
      fr.root.position.set(rock.x, rock.top, rock.z);
      fr.root.rotation.y = 2.2;
      fr.root.scale.setScalar(1.3);
      group.add(fr.root);
      let state = 'sit', st = 0;
      const start = fr.root.position.clone();
      list.push({
        name: 'frog', obj: fr,
        update(dt, c) {
          st += dt;
          if (state === 'sit') {
            const puff = Math.max(0, Math.sin(st * 3.2)) ** 3;
            fr.throat.scale.setScalar(1 + puff * 0.9);
            if (puff > 0.95 && !this.croaked) { this.croaked = true; c.sfx?.('frog'); } else if (puff < 0.5) this.croaked = false;
            if (c.hero && c.hero.distanceTo(start) < 2.2) { state = 'leap'; st = 0; }
          } else {
            const u = clamp(st / 0.5, 0, 1);
            fr.root.position.set(start.x + u * 0.9, start.y + Math.sin(u * Math.PI) * 0.35 - u * 0.25, start.z + u * 0.4);
            fr.body.rotation.x = -0.6 * Math.sin(u * Math.PI);
            if (u >= 1 && fr.root.visible) { fr.root.visible = false; c.splash?.(fr.root.position); }
          }
        },
      });
    }
  }

  addFlyers(group, list, { lite, makeBird: () => makeBird(mat, { back: 0x6a5a48, breast: 0xd8a070, belly: 0xf0e8dc }) });

  const update = (dt, c) => { for (const k of list) k.update(dt, c); };
  const textures = [];
  group.traverse((o) => { const u = o.userData?.sheet; if (u?.uMap?.value && !textures.includes(u.uMap.value)) textures.push(u.uMap.value); });
  const dispose = () => {
    group.traverse((o) => { if (o.isMesh) { if (!o.userData.sheet) o.geometry.dispose(); else o.material.dispose(); } });
    for (const t of textures) t.dispose();
  };
  return { group, update, dispose, list };
}

// ------------------------------------------------------------------ flyers (wave 8)
/** Butterflies, dragonflies, swallows and a songbird crossing the trail: all cheap, all near the camera's path. */
function addFlyers(group, list, { lite, makeBird }) {
  const tr = FOREST.trail;
  const bf = butterflySheet(), df = dragonflySheet(), sw = swallowSheet();
  const near = (m, cam, d) => { m.visible = !cam || m.position.distanceToSquared(cam.position) < d * d; };
  // ---- butterflies: each has a patch of flowers it works over; settles, fans, lifts off ahead of him
  const homes = [
    ...[3.5, 8.5, 12.4, 16.2, 21.6, 27, 33].map((s, i) => { const [x, z] = tr.beside(s, (i % 2 ? 1 : -1) * (1.3 + (i % 3) * 0.4)); return { x, z, s }; }),
    ...[0.6, 2.1, 3.7, 5.2].map((a) => ({ x: Math.cos(a) * (CLEAR_R - 2.4), z: Math.sin(a) * (CLEAR_R - 2.4) - 0.5 })),
  ].slice(0, lite ? 7 : 11);
  homes.forEach((h, i) => {
    const m = makeSheetSprite(bf.texture, { cols: bf.cols, size: [0.11, 0.1], anchor: [0.5, 0.5], renderOrder: 6 });
    const sp = [0, 1, 1, 3, 2, 1, 3, 0, 1, 3, 2][i % 11] * 4;
    group.add(m);
    let st = i * 1.37, rest = 0, flee = 0;
    const p = new THREE.Vector3(h.x, groundH(h.x, h.z) + 0.5, h.z), tgt = p.clone();
    const away = new THREE.Vector3();
    m.position.copy(p);
    list.push({
      name: 'butterfly', obj: m,
      update(dt, c) {
        st += dt;
        near(m, c.cam, 22);
        if (!m.visible && !flee) return;
        if (c.hero && !flee && c.hero.distanceTo(p) < 1.4) { flee = 1; rest = 0; away.subVectors(p, c.hero).setY(0).normalize(); }
        if (flee) {
          // up and away, tumbling
          flee += dt;
          p.addScaledVector(away, dt * 1.1);
          p.y += dt * (0.7 + Math.sin(st * 9) * 0.6);
          if (flee > 3.2) { flee = 0; h.x = p.x; h.z = p.z; tgt.copy(p); } // settles to a new patch out of his way
          m.userData.sheet.uFrame.value = sp + (Math.floor(st * 16) % 4);
        } else if (rest > 0) {
          // settled on a flower: wings slowly open and close
          rest -= dt;
          m.userData.sheet.uFrame.value = sp + (Math.sin(st * 2.2) > 0.3 ? 0 : Math.sin(st * 2.2) > -0.3 ? 1 : 2);
        } else {
          // the erratic flight: wander toward a new flower, bobbing with every wingbeat
          if (p.distanceToSquared(tgt) < 0.02) {
            if (Math.random() < 0.35) rest = 1 + Math.random() * 2.5;
            const a = Math.random() * 6.28, r = Math.random() * 1.6;
            tgt.set(h.x + Math.cos(a) * r, 0, h.z + Math.sin(a) * r);
            tgt.y = groundH(tgt.x, tgt.z) + (rest > 0 ? 0.22 : 0.3 + Math.random() * 0.7);
          }
          const k = Math.min(1, dt * 1.4);
          p.x += (tgt.x - p.x) * k + Math.sin(st * 7.3 + i) * dt * 0.5;
          p.z += (tgt.z - p.z) * k + Math.cos(st * 6.1 + i) * dt * 0.5;
          p.y += (tgt.y - p.y) * k + Math.sin(st * 14) * dt * 0.35;
          m.userData.sheet.uFrame.value = sp + (Math.floor(st * 14 + i) % 4);
        }
        m.position.copy(p);
      },
    });
  });
  // ---- dragonflies over the stream by the bridge: dart, hover, dart
  const st0 = FOREST.stream, B = FOREST.bridge;
  // (between the bridge and the low camera downstream of it, never right at the lens)
  for (let i = 0; i < (lite ? 2 : 3); i++) {
    const q = st0.curve.getPointAt(Math.min(1, Math.max(0, (FOREST.trail.cross.ss + [1.6, 3.0, -1.8][i]) / st0.L)));
    const m = makeSheetSprite(df.texture, { cols: df.cols, size: [0.15, 0.085], anchor: [0.5, 0.5], renderOrder: 6 });
    group.add(m);
    const y0 = B.y - 0.05 + i * 0.12;
    let st = i * 2.1;
    list.push({
      name: 'dragonfly', obj: m,
      update(dt, c) {
        st += dt;
        near(m, c.cam, 24);
        if (!m.visible) return;
        const a = st * 0.9 + i * 2.7, k = Math.floor(a), f = a - k, e = f < 0.22 ? f / 0.22 : 1;
        const ox = Math.sin(k * 2.1 + i) * 0.8, oz = Math.cos(k * 1.7 + i) * 0.45, px = Math.sin((k - 1) * 2.1 + i) * 0.8, pz = Math.cos((k - 1) * 1.7 + i) * 0.45;
        m.position.set(q.x + px + (ox - px) * e, y0 + Math.sin(a * 7) * 0.03, q.z + pz + (oz - pz) * e);
        m.userData.sheet.uFrame.value = Math.floor(st * 30) % 2;
      },
    });
  }
  // ---- swallows wheeling high over the clearing and the trail's open stretch
  for (let i = 0; i < (lite ? 3 : 5); i++) {
    const m = makeSheetSprite(sw.texture, { cols: sw.cols, size: [0.36, 0.36 / sw.aspect], anchor: [0.5, 0.5], renderOrder: 6, tint: 0xd8d0c8 });
    group.add(m);
    const cx = i < 3 ? 0 : 3, cz = i < 3 ? -1 : 26, R = 5 + i * 1.3, h = 9 + (i % 3) * 1.6, sp = (0.42 + (i % 2) * 0.15) * (i % 2 ? -1 : 1);
    let st = i * 2.3;
    list.push({
      name: 'swallow', obj: m,
      update(dt, c) {
        st += dt;
        if (c.crack) return; // (the flock that bursts out takes over the sky)
        const a = st * sp + i;
        m.position.set(cx + Math.cos(a) * R + Math.sin(a * 2.7) * 1.2, h + Math.sin(a * 2.3) * 1.1, cz + Math.sin(a) * R * 0.7);
        m.userData.sheet.uFrame.value = Math.sin(st * 3 + i) > -0.2 ? Math.floor(st * 11 + i) % 4 : 1; // flap, glide
      },
    });
  }
  // ---- a songbird that flits across the trail ahead of him as the opening shot cranes down
  {
    const b = makeBird();
    b.root.scale.setScalar(1.3);
    b.wings.forEach((w) => { w.visible = true; });
    group.add(b.root);
    const P0 = tr.at(13), P1 = tr.at(16);
    const from = new THREE.Vector3(P0.x - P0.tz * 4.5, groundH(P0.x, P0.z) + 2.6, P0.z + P0.tx * 4.5);
    const to = new THREE.Vector3(P1.x + P1.tz * 5, groundH(P1.x, P1.z) + 3.4, P1.z - P1.tx * 5);
    const t0 = 2.2, dur = 2.0;
    b.root.visible = false;
    list.push({
      name: 'crossing-bird', obj: b,
      update(dt, c) {
        const u = (c.t - t0) / dur;
        b.root.visible = u > 0 && u < 1;
        if (!b.root.visible) return;
        b.root.position.lerpVectors(from, to, u);
        b.root.position.y += Math.sin(u * Math.PI) * 0.6 - Math.abs(Math.sin(u * Math.PI * 5)) * 0.18; // the bounding flight of a finch
        b.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
        const flap = Math.sin(c.t * 46) * (Math.sin(u * Math.PI * 5) > 0 ? 1 : 0.15);
        b.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * flap * 0.9; });
      },
    });
  }
}
