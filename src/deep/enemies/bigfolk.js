// The big folk (wave 13): the size range's middle, between a kobold and a kaiju.
//
//   Cave Elk   herds of tall, skittish grazers with antlers of living crystal (they glow the colour
//              of the zone's crystal). They crop moss and fungus with their young close by; at the
//              first sign of a hunter (or a running mole) one stamps and its antlers flash, and the
//              whole herd bolts. Raptors, drakes and tyrants hunt them.
//   Mole-Bear  a huge velvet digger with a pink star of feelers on its nose and spade claws. Nearly
//              blind, it hears everything; it sleeps curled in its burrow, scavenges carcasses, eats
//              grubs and roots, and guards a small territory. It swipes (yellow), rears up and
//              slams (red: a shockwave to jump), and dives into the rock to tunnel toward you: the
//              ground bulges and a fountain of dirt marks where it will burst out.
import * as THREE from 'three';
import { Beast } from './beast.js';
import { Legs, Chain, look } from './rig.js';
import { VB, mul, mix, c01 } from './vox.js';
import { puff, sparkle, shockRing, pebbles } from './fx.js';
import { rand, clamp } from '../../core/util.js';

const EV = 1 / 16; // both are modelled at 1/16 m (refined finer when meshed)
const _v = new THREE.Vector3();

const band = (vb, ramp, k0 = 0.4, belly) => (x, y, z, nx, ny, nz) => {
  if (typeof ny !== 'number') { ny = 0; nz = 0; }
  if (belly && ny < -0.45) return belly;
  const n = vb.n(x, y, z);
  return ramp[Math.floor(clamp(k0 + ny * 0.45 + (n - 0.5) * 0.22, 0, 0.999) * ramp.length)];
};
/** Two small round eyes on a head's surface at height y, toward +z: { eyes } (pivot at y). */
function smallEyes(head, x, y, z0, col = 0x16100c, glint = true) {
  const eyes = new VB();
  for (const sd of [1, -1]) {
    const h = head.hitFrom(sd * x - (sd < 0 ? 1 : 0), y, z0, -sd, 0, -0.4, 20);
    if (!h) continue;
    const ex = h[0] + (sd > 0 ? 1 : -1) * 0;
    eyes.set(ex, h[1] - y, h[2], col); eyes.set(ex, h[1] + 1 - y, h[2], glint ? 0xffffff : col);
    eyes.set(ex, h[1] - y, h[2] - 1, col); eyes.set(ex, h[1] + 1 - y, h[2] - 1, col);
  }
  return eyes;
}

// =====================================================================================
// Cave Elk
// =====================================================================================
const ELK = { fur: [0x4a3424, 0x664630, 0x88643f, 0xa8845a], belly: 0xe2d2b2, rump: 0xf2e6ce, mane: 0x2e2018, hoof: 0x2a2420, nose: 0x1e1612 };
const ANTLER = {
  3: [0x2a8a9a, 0x5ad0e0, 0x9af0ff, 0xe8ffff],
  5: [0x6a3ab8, 0x9a6ae0, 0xc8a0ff, 0xf4e8ff],
};
const antlerFor = (z) => (z >= 5 ? ANTLER[5] : ANTLER[3]);

export function buildElk(zone = 3) {
  const F = ELK.fur, A = antlerFor(zone);
  const body = new VB(401);
  const bs = band(body, F, 0.42, ELK.belly);
  body.ell(0, 0, 0, 5.2, 6, 11.5, bs);
  body.ell(0, 0.8, 6.5, 5.8, 6.6, 6, bs); // deep chest
  body.ell(0, 0.4, -7, 5.4, 5.8, 5.6, bs); // haunches
  body.paint((x, y, z, c) => (z < -9 && y > -4 && Math.abs(x) < 4 ? ELK.rump : undefined)); // the pale rump patch
  body.paint((x, y, z, c) => (y > 4 && z > 2 && body.open(x, y, z, 0, 1, 0) ? (body.n(x, y, z, 3) < 0.5 ? ELK.mane : F[0]) : undefined)); // a dark mane on the withers
  body.ell(0, 1, -12.4, 1.6, 2, 1.4, ELK.rump); // the tail
  body.set(0, 2, -13, F[0]);
  // the neck rises forward from the chest (pivot at its base)
  const neck = new VB(402);
  const ns = band(neck, F, 0.45, ELK.belly);
  neck.cap(0, 0, 0, 0, 7, 4, 3.4, ns);
  neck.cap(0, 0, -1, 0, 7, 3, 2.4, (x, y, z) => (z < 1 ? ELK.mane : undefined)); // mane down the back of the neck
  for (let y = -2; y < 4; y++) neck.set(0, y, 4, mix(ELK.belly, F[2], 0.4)); // the throat ruff
  // the head (pivot at the top of the neck)
  const head = new VB(403);
  const hs = band(head, F, 0.5);
  head.ell(0, 0.5, 1.5, 3, 3.2, 4, hs);
  head.ell(0, -0.8, 5.5, 2.2, 2.2, 3.2, hs); // the long muzzle
  head.ell(0, -1.2, 8.2, 1.9, 1.7, 1.2, ELK.nose);
  head.set(-1, -0.5, 9, 0x0a0806); head.set(0, -0.5, 9, 0x0a0806); // nostrils
  for (const sd of [1, -1]) {
    const X = (x) => (sd > 0 ? x : -1 - x);
    head.cap(X(2), 3, 0, X(5), 5, -2, 1.1, (x, y, z, t) => (t > 0.3 && head.n(x, y, z) < 0.5 ? 0xd8b8a0 : F[2])); // ears
  }
  const eyes = smallEyes(head, 3, 1.5, 3);
  // antlers of living crystal: a beam each side with tines, faceted points at the tips
  const ant = new VB(404);
  const tc = (x, y, z, t) => A[Math.min(3, Math.floor(t * 3.2 + ant.n(x, y, z) * 0.6))];
  for (const sd of [1, -1]) {
    const pts = [[sd * 1.5, 2.5, 0], [sd * 4, 6, -1], [sd * 6, 10, -2.5], [sd * 6.5, 14, -1.5], [sd * 5.5, 17, 0.5]];
    for (let i = 0; i < pts.length - 1; i++) ant.cap(...pts[i], ...pts[i + 1], 1.05 - i * 0.12, (x, y, z, t) => A[Math.min(2, 1 + (i > 2 ? 1 : 0))]);
    // tines forward and up off the beam
    for (const [i, len] of [[1, 4.5], [2, 5.5], [3, 4]]) {
      const [bx, by, bz] = pts[i];
      ant.cap(bx, by, bz, bx + sd * 1.2, by + len * 0.7, bz + len * 0.75, 0.7, tc);
      ant.set(Math.round(bx + sd * 1.2), Math.round(by + len * 0.7) + 1, Math.round(bz + len * 0.75), A[3]);
    }
    ant.cap(...pts[4], sd * 5, 19, 1.5, 0.6, tc);
    ant.set(sd * 5, 20, 1, A[3]);
  }
  // long slim legs: modelled hanging from the pivot
  const thigh = new VB(405); thigh.cap(0, 0, 0, 0, -8, 0, 2.3, band(thigh, F, 0.35));
  thigh.ell(0, -1, 0, 2.8, 3, 2.8, band(thigh, F, 0.35));
  const shin = new VB(406); shin.cap(0, 0, 0, 0, -8.5, 0, 1.2, (x, y, z, t) => (t > 0.75 ? ELK.mane : F[1]));
  const foot = new VB(407); foot.box(-1, 0, -1, 0, 1, 1, ELK.hoof); foot.set(-1, 0, 2, ELK.hoof); foot.set(0, 0, 2, ELK.hoof);
  return {
    body: body.geo(0, 0, 0, EV), neck: neck.geo(0, 0, 0, EV), head: head.geo(0, 0, 0, EV), eyes: eyes.geo(0, 0, 0, EV), antlers: ant.geo(0, 0, 0, EV),
    thigh: thigh.geo(0, 0, 0, EV), shin: shin.geo(0, 0, 0, EV), foot: foot.geo(0, 0, 0, EV), hide: c01(F[2]), glow: c01(A[2]), light: c01(A[1]),
  };
}

export class CaveElk extends Beast {
  static info = {
    id: 'cave_elk', name: 'Cave Elk', color: '#9af0ff', hits: 5, dmg: 5, poise: 2, tier: 2.5, flesh: true, snd: 'flesh', grazer: true,
    diet: 'graze', social: 'herd', aggro: 'timid', sleepy: 0.3, sight: 15, hear: 1.6, walk: 1.1, run: 4.6, turn: 3.2, accel: 6,
    keep: 3, close: 1.8, space: [0.4, 1.9], harvest: ['dino_meat', 'beast_hide'], metabolism: 0.007, depth: [14, 200], young: true,
    flee: 7, fleeHp: 1, lie: 0.6, wander: 0.3, anyFood: true, keepFar: 36,
  };
  static attacks = [
    // cornered (a calf hurt, nowhere to run): a lowered-antler butt
    { id: 'butt', range: [0, 2.2], arc: 0.6, tell: 0.7, dur: 0.45, hitAt: 0.12, rec: 0.8, cd: [2, 3], w: 1,
      when(e) { return !e.baby; },
      start() { this.sound('grunt', { pitch: 1.7 }); },
      tick(A, dt) { if (A.phase === 'go') this.push(Math.sin(this.yaw) * 4, Math.cos(this.yaw) * 4, 12, dt); },
      hit(A) { return this.strikeAt(A, this.reachPoint(0.3, 0.3), 0.5, { dmg: this.info.dmg, push: 4, up: 2 }); } },
  ];
  static warm(mgr, zone = 3) { const z = zone >= 5 ? 5 : 3; return mgr.geo('elk|' + z, () => buildElk(z)); }
  constructor(mgr, o) {
    super(mgr, o);
    this.baby = !!o.baby;
    this.hw = 0.34; this.h = 1.6; this.cy = 1.05; this.hitR = 0.62;
    this.mass = 4; this.kb = 1.4;
    this.size = this.baby ? rand(0.5, 0.58) : rand(0.94, 1.08);
    if (this.baby) { this.hp = this.maxHp *= 0.35; this.mass = 1.4; this.hw = 0.2; this.h = 0.9; }
    this.step = 0.34; this.friction = 9; this.springK = 140; this.springC = 10; this.sqScale = 0.3;
    const G = this.G = CaveElk.warm(mgr, this.zone);
    this.hitCol = G.hide;
    this.mat = this.material({});
    this.eyeMat = this.material({ emissive: 0.4, rimK: 0 });
    this.antMat = this.material({ emissive: 0.9, rimK: 0.4 });
    this.hips = this.group3(this.root, 0, 15.5 * EV, 0);
    this.bodyG = this.group3(this.hips);
    this.part(G.body, this.mat, this.bodyG);
    this.neckG = this.group3(this.bodyG, 0, 3 * EV, 9.5 * EV);
    this.part(G.neck, this.mat, this.neckG);
    this.headG = this.group3(this.neckG, 0, 7 * EV, 4 * EV);
    this.part(G.head, this.mat, this.headG);
    this.eyes = this.part(G.eyes, this.eyeMat, this.headG, 0, 1.5 * EV, 0);
    this.antlers = this.part(G.antlers, this.antMat, this.headG, 0, 2 * EV, 0);
    if (this.baby) this.antlers.scale.setScalar(0.35);
    this.headObj = this.headG; this.headTop = 3 * EV; this.headFwd = 4 * EV;
    const defs = [];
    for (const [front, sd] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const thigh = this.part(G.thigh, this.mat, this.bodyG), shin = this.part(G.shin, this.mat, this.bodyG), foot3 = this.part(G.foot, this.mat, this.root);
      defs.push({ parent: this.bodyG, hip: [sd * 3.4 * EV, -2.5 * EV, front * 8 * EV], l1: 8 * EV, l2: 8.5 * EV, thigh, shin, foot3, knee: [0, 0, front > 0 ? 1 : -1], rest: [sd * 0.2, front * 0.5], group: (front > 0) === (sd > 0) ? 0 : 1, lift: 0.09 });
    }
    this.legs = new Legs(this, defs, { stride: 0.55, stepT: 0.2, lead: 0.12, onStep: () => { if (this.dist < 9 && !this.baby) this.sound('step', { vol: 0.12 }); } });
    this.flashK = 0; this.chewK = 0;
    if (this.asleep) this.restK = 1;
  }
  /** The alarm: a stamp, a snort, the antlers flash (the herd reads it and bolts). */
  onFlee() {
    if (this.mgr.time - (this.group?.alarmT ?? -9) < 1.5) return;
    if (this.group) this.group.alarmT = this.mgr.time;
    this.flashK = 1;
    this.sound('grunt', { pitch: this.baby ? 2.3 : 1.8 });
    this.sound('stomp', { vol: 0.35 });
    const h = this.headPos(_v);
    sparkle(this.fx, h.x, h.y + 0.25, h.z, 12, this.G.glow, 1.4, 0.4, 0.02, 0.6);
    this.fx.dust(this.pos.x, this.pos.y + 0.05, this.pos.z, 5, this.mgr.dustCol(this.pos), 0.15);
    // the herd hears it
    for (const c of this.group?.members || []) if (c !== this && c.alive && c.mode !== 'flee') { c.fleeFrom = this.fleeFrom; c.setMode('flee'); c.flashK = 0.6; }
  }
  onHit() { this.sound('grunt', { pitch: this.baby ? 2.4 : 1.9 }); if (this.baby && this.group) for (const c of this.group.members) if (c.alive && !c.baby) { c.lastHitT = this.mgr.time; c.lastHitBy = 'player'; } }
  onNotice() { this.flashK = Math.max(this.flashK, 0.4); }
  animate(dt) {
    const t = this.t, A = this.atk;
    this.legs.update(dt);
    const rest = this.restK, sp = Math.hypot(this.vel.x, this.vel.z);
    this.hips.position.y = (15.5 - rest * 8) * EV + Math.abs(Math.sin(t * (4 + sp * 3))) * 0.3 * EV * clamp(sp / 2, 0, 1);
    this.bodyG.rotation.x = sp > 3 ? -0.06 : 0;
    // grazing: the long neck reaches down; running: stretched out; otherwise ears up, looking about
    const down = this.headDown > 0.3 ? 1 : 0, low = A && A.phase !== 'rec' ? 1 : 0;
    const want = down ? 1.25 : low ? 0.7 : sp > 3 ? 0.55 : rest > 0.5 ? 0.5 : 0;
    this.neckG.rotation.x += (want - this.neckG.rotation.x) * Math.min(1, dt * 5);
    if (!down && !low && this.mode !== 'flee') look(this.headG, this.lookAt, dt, { yaw: 0.9, pitch: 0.4, rate: 6 });
    else if (!down && !low) { const k = Math.min(1, dt * 6); this.headG.rotation.y -= this.headG.rotation.y * k; this.headG.rotation.x += (0.15 - this.headG.rotation.x) * k; } // bolting: head forward
    else this.headG.rotation.set(down ? 0.2 + Math.sin(t * 7) * 0.06 : 0.3, 0, 0);
    this.flashK = Math.max(0, this.flashK - dt * 1.6);
    this.antMat.uniforms.emissive.value = 0.8 + Math.sin(t * 1.3 + this.pos.x) * 0.15 + this.flashK * 2.2;
    this.eyeOpen = this.asleep ? 0 : 1;
    if (this.flashK > 0.5 && Math.random() < dt * 30) { const h = this.headPos(_v); this.fx.spawn({ x: h.x + rand(-0.3, 0.3), y: h.y + rand(0.1, 0.6), z: h.z + rand(-0.3, 0.3), vy: 0.4, life: 0.5, size: 0.02, color: this.G.glow, glow: true, drag: 1 }); }
  }
  light() {
    if (this.dist > 18 || this.baby) return null;
    const h = this.headPos(_v), c = this.G.light, k = 0.35 + this.flashK * 0.9;
    return { x: h.x, y: h.y + 0.3, z: h.z, c: [c[0] * k, c[1] * k, c[2] * k], r: 2.2 };
  }
  deathFx() { this.sound('grunt', { pitch: 1.2 }); sparkle(this.fx, this.center.x, this.center.y + 0.6, this.center.z, 10, this.G.glow, 1.6, 2, 0.02, 0.6); }
}

// =====================================================================================
// Mole-Bear
// =====================================================================================
const BEAR = { fur: [0x1c1820, 0x2a2430, 0x3c3444, 0x544a5e], belly: 0x5a4636, nose: [0xd85a7a, 0xff8aa8, 0xffc0d0], claw: [0xc8b898, 0xe8dcc0, 0xfff4e0] };

export function buildMoleBear() {
  const F = BEAR.fur;
  const body = new VB(411);
  const bs = (x, y, z, nx, ny) => {
    if (typeof ny !== 'number') ny = 0;
    if (ny < -0.5) return BEAR.belly;
    const n = body.n(x, y, z), n2 = body.n(x >> 1, y >> 1, z >> 1, 4);
    // velvet: soft lengthwise bands, a sheen on top
    if (ny > 0.55 && n2 > 0.72) return F[3];
    return F[Math.floor(clamp(0.35 + ny * 0.4 + (n - 0.5) * 0.2 + ((z & 3) === 0 ? -0.08 : 0), 0, 0.999) * 4)];
  };
  body.ell(0, 0, -1, 8.5, 8, 13, bs);
  body.ell(0, 2.5, 5, 9, 8.5, 7.5, bs); // the great digging shoulders
  body.ell(0, 0, -11, 6, 6, 4, bs);
  body.cap(0, 1, -14, 0, 0, -17, 1.2, BEAR.nose[0]); // a pink stub tail
  // the head: a small skull, a tapering snout, the pink star of feelers
  const head = new VB(412);
  const hs = (x, y, z, nx, ny) => F[Math.floor(clamp(0.4 + (ny || 0) * 0.4 + (head.n(x, y, z) - 0.5) * 0.2, 0, 0.999) * 4)];
  head.ell(0, 0, 1, 5.2, 4.8, 5.2, hs);
  head.ell(0, -0.8, 5.5, 3, 2.8, 3.6, hs);
  const star = new VB(413);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.15, r = 2.6 + (i % 2) * 0.6;
    star.cap(0, -0.5, 0, Math.cos(a) * r, -0.5 + Math.sin(a) * r * 0.9, 1.2, 0.75, (x, y, z, t) => BEAR.nose[t > 0.7 ? 2 : 1]);
  }
  star.ell(0, -0.5, 0.4, 1.4, 1.3, 1, BEAR.nose[0]);
  const eyes = new VB();
  for (const sd of [1, -1]) { const h = head.hitFrom(sd * 3, 1.5, 4, -sd, 0, -0.3, 12); if (h) eyes.set(h[0], h[1] - 1, h[2], 0x0c0a10); } // tiny, nearly blind
  // limbs: thick fore-arms with spade paws and long claws, shorter hind legs
  const arm = new VB(414); arm.cap(0, 0, 0, 0, -7, 0, 3.4, (x, y, z, t) => F[t < 0.3 ? 2 : 1]);
  const fore = new VB(415); fore.cap(0, 0, 0, 0, -7, 0, 2.8, F[1]);
  const paw = new VB(416);
  paw.ell(0, 1, 1.5, 3.4, 1.6, 3.4, mix(BEAR.nose[0], F[2], 0.55));
  for (let i = -2; i <= 2; i++) paw.cap(i * 1.3, 1, 3.5, i * 1.6, 0, 8 - Math.abs(i) * 0.8, 0.7, (x, y, z, t) => BEAR.claw[t > 0.7 ? 2 : t > 0.3 ? 1 : 0]);
  const leg = new VB(417); leg.cap(0, 0, 0, 0, -5, 0, 3, F[1]);
  const shin = new VB(418); shin.cap(0, 0, 0, 0, -5, 0, 2.4, F[1]);
  const hfoot = new VB(419); hfoot.ell(0, 0.8, 1, 2.6, 1.2, 3, mix(BEAR.nose[0], F[2], 0.55)); for (const x of [-1, 0, 1]) hfoot.set(x * 1.5 | 0, 0, 4, BEAR.claw[1]);
  return {
    body: body.geo(0, 0, 0, EV), head: head.geo(0, 0, 0, EV), star: star.geo(0, 0, 0, EV), eyes: eyes.geo(0, 0, 0, EV),
    arm: arm.geo(0, 0, 0, EV), fore: fore.geo(0, 0, 0, EV), paw: paw.geo(0, 0, 0, EV), leg: leg.geo(0, 0, 0, EV), shin: shin.geo(0, 0, 0, EV), hfoot: hfoot.geo(0, 0, 0, EV),
    hide: c01(F[2]), pink: c01(BEAR.nose[1]),
  };
}

export class MoleBear extends Beast {
  static info = {
    id: 'mole_bear', name: 'Mole-Bear', color: '#ff8aa8', hits: 9, dmg: 7, poise: 4, tier: 4, flesh: true, snd: 'flesh',
    diet: 'omni', social: 'solo', aggro: 'territorial', territory: 6, sleepy: 0.55, sight: 6.5, hear: 2, smell: 26, walk: 1, run: 3.8, turn: 2.6, accel: 5,
    keep: 2.6, close: 1.5, space: [0.6, 1.4], harvest: ['beast_hide', 'dino_meat'], metabolism: 0.008, depth: [8, 200], deep: 2.2,
    prey: ['critter', 'kobold', 'cave_slime', 'cave_elk', 'pebble_mimic'], fleeHp: 0.25, lie: 0.9, keepFar: 34,
  };
  static attacks = [
    { id: 'swipe', range: [0, 1.9], arc: 0.7, tell: 0.6, dur: 0.35, hitAt: 0.12, rec: 0.6, cd: [1.3, 2.1], w: 2.4,
      start() { this.sound('growl', { pitch: 1.1, dur: 0.4 }); this.side = -(this.side || 1); },
      hit(A) { return this.strikeAt(A, this.reachPoint(0.35, -0.3), 0.55, { dmg: this.info.dmg, push: 3.6, kind: 'claw' }); } },
    { id: 'slam', range: [0, 3], arc: 1.2, tell: 1.05, heavy: true, dur: 0.5, hitAt: 0.22, rec: 1, cd: [3.5, 5], w: 1,
      start() { this.sound('roar_big', { pitch: 1.6, vol: 0.6 }); },
      hit(A) {
        const p = this.reachPoint(0.6, -this.center.y + this.pos.y, _v);
        shockRing(this.fx, p.x, this.pos.y, p.z, 0.3, 4.5, this.G.hide.map((k) => k * 2.2), 36);
        pebbles(this.fx, p.x, this.pos.y + 0.1, p.z, 12, this.mgr.dustCol(this.pos), 0.4, 2.6);
        this.mgr.addHazard({ kind: 'ring', x: p.x, y: this.pos.y, z: p.z, r: 0.3, speed: 5, rMax: 4.5, dmg: this.info.dmg * 0.8, src: this });
        this.mgr.shake(this, 0.45);
        this.sound('stomp', { vol: 0.9 });
        if (A.target === 'player') this.strikeAt(A, p, 0.9, { dmg: this.info.dmg * 1.3, push: 5, up: 3, heavy: true });
        return true;
      } },
    // dives into the rock and tunnels at you: the bulge travels, a dirt fountain warns where it bursts out
    { id: 'burrow', range: [3.5, 11], arc: Math.PI, tell: 0.6, dur: 0.1, rec: 0.1, cd: [6, 9], w: 0.8,
      when(e, d, tg) { return tg === 'player' && e.mgr.time - (e.burrowEnd ?? -99) > 8; },
      go() { this.dive('hunt'); } },
  ];
  static warm(mgr) { return mgr.geo('molebear', () => buildMoleBear()); }
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.5; this.h = 1.35; this.cy = 0.85; this.hitR = 0.75;
    this.mass = 10; this.kb = 0.9;
    this.size = rand(0.94, 1.08);
    this.step = 0.4; this.friction = 9; this.springK = 120; this.springC = 10; this.sqScale = 0.3;
    const G = this.G = MoleBear.warm(mgr);
    this.hitCol = G.hide;
    this.mat = this.material({});
    this.eyeMat = this.material({ emissive: 0.2, rimK: 0 });
    this.starMat = this.material({ emissive: 0.25 });
    this.hips = this.group3(this.root, 0, 13 * EV, 0);
    this.bodyG = this.group3(this.hips);
    this.part(G.body, this.mat, this.bodyG);
    this.headG = this.group3(this.bodyG, 0, 2 * EV, 12.5 * EV);
    this.part(G.head, this.mat, this.headG);
    this.star = this.part(G.star, this.starMat, this.headG, 0, -0.8 * EV, 8.6 * EV);
    this.eyes = this.part(G.eyes, this.eyeMat, this.headG);
    this.headObj = this.headG; this.headTop = 5 * EV; this.headFwd = 5 * EV;
    const defs = [];
    for (const [front, sd] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const fr = front > 0;
      const thigh = this.part(fr ? G.arm : G.leg, this.mat, this.bodyG), shin = this.part(fr ? G.fore : G.shin, this.mat, this.bodyG), foot3 = this.part(fr ? G.paw : G.hfoot, this.mat, this.root);
      defs.push({ parent: this.bodyG, hip: [sd * 6 * EV, fr ? -1 * EV : -3 * EV, fr ? 7 * EV : -8 * EV], l1: (fr ? 7 : 5) * EV, l2: (fr ? 7 : 5) * EV, thigh, shin, foot3, knee: [sd * 0.3, 0, fr ? -1 : 1], rest: [sd * 0.42, fr ? 0.5 : -0.5], group: fr === (sd > 0) ? 0 : 1, lift: 0.12 });
    }
    this.legs = new Legs(this, defs, { stride: 0.5, stepT: 0.3, lead: 0.15, onStep: () => { if (this.dist < 10) this.sound('step', { vol: 0.2 }); } });
    this.rearK = 0; this.sniffK = 0;
    this.burrow = null; // { phase: 'dive' | 'tunnel' | 'warn' | 'rise', t, to: Vector3, why }
    if (this.asleep) this.restK = 1;
  }
  // ------------------------------------------------------------------ burrowing
  /** Into the rock: why = 'hunt' (comes up beside the mole) or 'flee' (comes up far away). */
  dive(why) {
    if (this.burrow) return;
    this.endAttack?.(true);
    this.burrow = { phase: 'dive', t: 0, why, to: new THREE.Vector3() };
    this.sound('golem_crumble', { vol: 0.35 });
    this.sound('growl', { pitch: 0.9, dur: 0.6 });
  }
  /** Where it comes up: beside the mole (not under it), or well away. */
  exitSpot(why) {
    const m = this.mgr;
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2;
      const [cx, cz, r] = why === 'flee' ? [this.pos.x, this.pos.z, rand(6, 9)] : [m.pc.x, m.pc.z, rand(1.6, 2.4)];
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const f = m.floorAt(x, this.pos.y + 0.8, z, 1.2, 2.5, 1.5);
      if (f && !m.excluded(x, f.y, z, 0.8) && m.spawner.roomy(x, f.y, z, 1.4, 1.2) >= 5) return [x, f.y, z];
    }
    return null;
  }
  think(dt) {
    if (!this.burrow) {
      super.think(dt);
      // badly hurt: dig away
      if (this.mode === 'flee' && this.hp < this.maxHp * 0.5 && !this.atk && this.mgr.time - (this.burrowEnd ?? -99) > 6) this.dive('flee');
      return;
    }
    const B = this.burrow, m = this.mgr;
    B.t += dt;
    this.vel.set(0, 0, 0);
    this.headDown = 1;
    if (B.phase === 'dive') {
      // claws whirl, dirt flies, it sinks into the floor
      if (Math.random() < dt * 40) pebbles(this.fx, this.pos.x + rand(-0.5, 0.5), this.pos.y + 0.1, this.pos.z + rand(-0.5, 0.5), 1, m.dustCol(this.pos), 0.2, 2.4);
      if (Math.random() < dt * 14) this.fx.dust(this.pos.x, this.pos.y + 0.1, this.pos.z, 2, m.dustCol(this.pos), 0.4);
      if (B.t > 0.9) {
        const s = this.exitSpot(B.why);
        if (!s) { this.burrow = null; this.burrowEnd = m.time; return; }
        B.to.set(...s); B.phase = 'tunnel'; B.t = 0;
        this.mgr.shake(this, 0.2);
      }
    } else if (B.phase === 'tunnel') {
      // a bulge of rubble runs along the floor toward the exit
      const dx = B.to.x - this.pos.x, dz = B.to.z - this.pos.z, d = Math.hypot(dx, dz);
      const sp = Math.min(d, dt * 3.2);
      if (d > 0.05) { this.pos.x += dx / d * sp; this.pos.z += dz / d * sp; this.pos.y += (B.to.y - this.pos.y) * Math.min(1, dt * 3); }
      if (Math.random() < dt * 24) pebbles(this.fx, this.pos.x + rand(-0.3, 0.3), this.pos.y + 0.05, this.pos.z + rand(-0.3, 0.3), 1, m.dustCol(this.pos), 0.15, 1.6);
      if (Math.random() < dt * 8) this.fx.dust(this.pos.x, this.pos.y + 0.05, this.pos.z, 2, m.dustCol(this.pos), 0.3);
      if (Math.random() < dt * 1.2) this.sound('golem_crumble', { vol: 0.15 });
      if (d < 0.1 || B.t > 4) { B.phase = 'warn'; B.t = 0; this.pos.copy(B.to); this.sound('rumble_hit', { vol: 0.6 }); }
    } else if (B.phase === 'warn') {
      // the tell: the ground shudders and a fountain of dirt marks the spot (get clear!)
      if (Math.random() < dt * 50) pebbles(this.fx, this.pos.x + rand(-0.25, 0.25), this.pos.y + 0.05, this.pos.z + rand(-0.25, 0.25), 1, m.dustCol(this.pos), 0.1, rand(2.5, 4.5));
      if (Math.random() < dt * 10) this.fx.dust(this.pos.x, this.pos.y + 0.1, this.pos.z, 2, m.dustCol(this.pos), 0.5);
      this.tell(B.t / 0.85, true);
      if (B.t > 0.85) {
        B.phase = 'rise'; B.t = 0;
        this.emerge = 0.15; this.sqv += 12; this.vel.y = 3.2;
        shockRing(this.fx, this.pos.x, this.pos.y, this.pos.z, 0.2, 3.2, m.dustCol(this.pos), 30);
        pebbles(this.fx, this.pos.x, this.pos.y + 0.3, this.pos.z, 18, m.dustCol(this.pos), 0.5, 3.4);
        this.sound('smash', { vol: 0.9 }); this.sound('growl', { pitch: 1.2, dur: 0.6 });
        m.shake(this, 0.5);
        // bursting out right under the mole knocks it flying
        if (B.why === 'hunt' && Math.hypot(m.pc.x - this.pos.x, m.pc.z - this.pos.z) < 1.3) { const [dx, dz] = this.dirToPlayer(); this.hurtPlayer(this.info.dmg * 1.2, [dx * 4, 3.5, dz * 4], 'claw', { heavy: true }); }
      }
    } else if (B.phase === 'rise') {
      if (B.t > 0.5) { this.burrow = null; this.burrowEnd = m.time; this.atkCd = rand(1, 1.6); this.facePlayer(99, 1); }
    }
  }
  move(dt) {
    if (this.burrow && this.burrow.phase !== 'rise') return; // under the rock: no walking
    super.move(dt);
  }
  place() {
    super.place();
    const B = this.burrow;
    if (!B) { this.root.visible = true; return; }
    // sinking in, gone below, coming up
    const sink = B.phase === 'dive' ? clamp(B.t / 0.9, 0, 1) : B.phase === 'rise' ? 0 : 1;
    this.root.position.y -= sink * 1.6 * this.size;
    this.root.visible = sink < 0.98;
  }
  updateSpheres() { super.updateSpheres(); if (this.burrow && this.burrow.phase !== 'rise') this.spheres[0].r = 0; }
  onHit() { this.sound('growl', { pitch: 1.3, dur: 0.3 }); this.sniffK = 1; }
  onNotice() { this.sound('growl', { pitch: 1, dur: 0.8 }); this.rearK = 0.6; }
  animate(dt) {
    const t = this.t, A = this.atk;
    this.legs.update(dt);
    const rest = this.restK, sp = Math.hypot(this.vel.x, this.vel.z);
    let rear = 0, lunge = 0;
    if (A) {
      const k = A.phase === 'tell' ? clamp(A.t / A.a.tell, 0, 1) : 0;
      if (A.a.id === 'slam') rear = A.phase === 'tell' ? k : A.phase === 'go' ? 1 - clamp(A.t / 0.2, 0, 1) * 1.2 : 0;
      if (A.a.id === 'swipe') lunge = A.phase === 'tell' ? k * 0.4 : A.phase === 'go' ? -0.3 : 0;
    }
    if (this.burrow) rear = this.burrow.phase === 'dive' ? -0.5 : this.burrow.phase === 'rise' ? 0.6 * (1 - this.burrow.t * 2) : 0;
    this.rearK += (Math.max(rear, this.rearK * 0.9) - this.rearK) * Math.min(1, dt * 8);
    if (!A && !this.burrow) this.rearK = Math.max(0, this.rearK - dt * 1.5);
    this.hips.position.y = (13 - rest * 7) * EV + this.rearK * 7 * EV + Math.abs(Math.sin(t * (3 + sp * 2))) * 0.3 * EV * clamp(sp, 0, 1);
    this.bodyG.rotation.x = -this.rearK * 0.9 + lunge * 0.3;
    if (this.headDown > 0.3) this.headG.rotation.set(0.45 + Math.sin(t * 6) * 0.08, Math.sin(t * 2.3) * 0.3, 0);
    else look(this.headG, this.mode === 'fight' || A ? this.mgr.eye : this.lookAt, dt, { yaw: 0.8, pitch: 0.5, rate: 4 });
    // the star nose never stops feeling the air (faster when it smells something)
    this.sniffK = Math.max(0, this.sniffK - dt * 0.5);
    const f = 1 + Math.sin(t * (9 + this.sniffK * 10)) * 0.08 + (this.mode === 'hunt' || this.mode === 'eat' ? 0.06 : 0);
    this.star.scale.set(f, f, 1 + (f - 1) * 2);
    this.star.rotation.z = Math.sin(t * 3.1) * 0.12;
    this.eyeOpen = this.asleep ? 0 : 1;
  }
  deathFx() { this.sound('growl', { pitch: 0.7, dur: 0.9 }); puff(this.fx, this.center.x, this.center.y, this.center.z, 8, this.G.hide, 0.3, 0.3, 0.08, 0.5); }
}

export const BIG_SPECIES = { cave_elk: CaveElk, mole_bear: MoleBear };
