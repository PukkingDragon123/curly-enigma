// The dino caverns: big-headed, chunky cave dinosaurs.
//
//   Raptor     pack hunters (3–5): they circle at a distance, spread out to flank, and one at a time
//              dart in for a bite or leap with their sickle claws (yellow: block or parry). They bark
//              to each other, hunt young shellbacks and critters, guard a twig nest of eggs, and a
//              pack that loses half its members runs.
//   Tyrant     the cave tyrant: one per great hall, often asleep. Its roar shakes the cave and wakes
//              everything. Its bite is too heavy to block (red: dodge sideways), it stomps (a
//              shockwave to jump) and sweeps its tail at anything beside it. Hunts shellbacks.
//   Shellback  armoured grazers in herds with their young: they crop ferns and moss and mind their
//              own business — threaten the herd (or its nest) and they turn: a lowered-head charge
//              (yellow) and a swing of the tail club (red).
//   Pterosaur  wheels under tall cavern roofs in pairs, screeches, folds its wings and dives at
//              small things like you (yellow); it lands on carcasses to pick at them.
import * as THREE from 'three';
import { Beast } from './beast.js';
import { Legs, Chain, look } from './rig.js';
import { VB, VS, mul, mix, c01 } from './vox.js';
import { puff, sparkle, shockRing, pebbles } from './fx.js';
import { airBelow, airAbove, solidAt } from './physics.js';
import { rand, clamp } from '../../core/util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// shading with soft bands: (x, y, z, nx, ny, nz) for ell fills, (x, y, z, t) for caps
const shader = (vb, ramp, o = {}) => (x, y, z, nx, ny, nz) => {
  if (typeof ny !== 'number') { ny = 0; nz = 0; }
  if (o.belly && ny < -0.35) return o.belly;
  const n = vb.n(x, y, z);
  if (o.stripe && ny > 0.1 && (((z + Math.round(x * 0.3)) % o.stripe[0]) + o.stripe[0]) % o.stripe[0] === 0) return o.stripe[1];
  if (o.spot && n > 0.88) return o.spot;
  return ramp[Math.floor(clamp((o.k0 ?? 0.35) + ny * 0.45 + (n - 0.5) * 0.25, 0, 0.999) * ramp.length)];
};
/** Big round cartoon eyes on the head surface (pivot at eye height): [eyes, angry]. */
function bigEyes(head, sides, y, z0, col, size = 2) {
  const eyes = new VB(), angry = new VB(), at = [];
  for (const sd of [1, -1]) {
    const h = head.hitFrom(sd * sides - (sd < 0 ? 1 : 0), y, z0, -sd * 0.6, 0, -0.8);
    if (!h) continue;
    at.push(h);
    for (const [vb, mad] of [[eyes, false], [angry, true]]) for (let a = 0; a < size; a++) for (let b = 0; b < size + 1; b++) {
      const top = b === size, hi = b === size && a === (sd > 0 ? 0 : size - 1);
      if (mad && top && a === (sd > 0 ? size - 1 : 0)) continue; // a frown
      vb.set(h[0] + sd * 0, h[1] - 1 + b, h[2] - a, hi && !mad ? 0xffffff : b === 0 ? mul(col, 0.7) : col);
      vb.set(h[0] + sd, h[1] - 1 + b, h[2] - a, a === Math.floor(size / 2) && b === 1 ? 0x100808 : hi && !mad ? 0xffffff : col);
    }
  }
  return [eyes, angry, at];
}

// =====================================================================================
// Raptor
// =====================================================================================
const RAPTOR = [
  { s: [0x7a4a22, 0xa86e34, 0xd09a4e, 0xecc074], belly: 0xf4e4c0, stripe: 0x5a3418, crest: [0x1a9a8a, 0x5ae0c8], eye: 0xffd040 },
  { s: [0x4a5a2a, 0x6a823a, 0x92a852, 0xbcd078], belly: 0xece8c0, stripe: 0x34401c, crest: [0xd83a2a, 0xff8a5a], eye: 0xffe060 },
  { s: [0x5a4a6a, 0x7a6890, 0xa08cb8, 0xc8b8e0], belly: 0xf0e8f4, stripe: 0x3a2e4a, crest: [0xe8b83a, 0xfff07a], eye: 0x9affd0 },
];

export function buildRaptor(v) {
  const P = RAPTOR[v % RAPTOR.length], S = P.s;
  const body = new VB(121);
  const bs = shader(body, S, { belly: P.belly, stripe: [4, P.stripe] });
  body.ell(0, 0, 0, 3.8, 3.8, 5.6, bs);
  body.ell(0, 1.4, 4.2, 3.4, 3.6, 3.2, bs); // chest
  body.cap(0, 2.5, 5.5, 0, 6, 7.5, 2.3, shader(body, S, { belly: P.belly, k0: 0.45 })); // neck
  for (let z = -4; z <= 5; z += 2) body.set(0, 4 + (z > 2 ? 1 : 0), z, P.crest[0]); // a ridge of quills
  const head = new VB(122), hs = shader(head, S, { k0: 0.5 });
  head.ell(0, 2.2, 1.5, 4, 3.6, 4.2, hs);
  head.ell(0, 1, 5.6, 2.8, 2.1, 3.4, hs); // snout
  head.paint((x, y, z) => (y <= 0 && z > 2 ? P.belly : undefined));
  head.set(-2, 2, 8, 0x2a1810); head.set(1, 2, 8, 0x2a1810);
  for (let i = 0; i < 4; i++) head.cap(0, 5 + i * 0.2, 1 - i * 1.6, (i % 2 ? 1 : -1) * 0.5, 8 - i * 0.8, -1 - i * 2, 0.7, i % 2 ? P.crest[1] : P.crest[0]); // the crest
  const [eyes, angry] = bigEyes(head, 6, 3, 2.4, P.eye, 2);
  const jaw = new VB(123);
  jaw.ell(0, -0.8, 4.2, 2.4, 1, 3.4, P.belly);
  for (let z = 2; z <= 7; z += 2) for (const sd of [1, -1]) jaw.set(sd > 0 ? 1 : -2, 0, z, 0xffffff);
  const arm = new VB(124); // small feathered arm (pivot at the shoulder), folded
  arm.cap(0, 0, 0, 0, -3.5, 1.5, 1.1, S[2]);
  for (let i = 0; i < 4; i++) arm.set(0, -1 - i, -1 - (i > 1 ? 1 : 0), i % 2 ? P.crest[0] : P.crest[1]);
  for (const x of [-1, 0]) arm.set(x, -4.5, 2.5, 0xf4ecd8);
  const tail = [0, 1, 2].map((i) => {
    const t = new VB(125 + i), r = 2.6 - i * 0.6;
    t.cap(0, 0, 0, 0, 0.2, -5, r, shader(t, S, { belly: P.belly, stripe: [3, P.stripe] }));
    if (i === 2) for (let k = 0; k < 4; k++) t.set(k % 2 ? 1 : -1, 1, -5 - k, k % 2 ? P.crest[0] : P.crest[1]); // feather tuft
    return t;
  });
  const thigh = new VB(128); thigh.cap(0, 0, 0, 0, -5.5, 0, 2.4, shader(thigh, S, { k0: 0.45 }));
  const shin = new VB(129); shin.cap(0, 0, 0, 0, -6, 0, 1.4, shader(shin, S, { k0: 0.3 }));
  const foot = new VB(130);
  foot.box(-1, 0, -1, 1, 1, 2, S[1]);
  for (const x of [-1, 1]) { foot.set(x, 0, 3, S[0]); foot.set(x, 0, 4, 0xf0e8d8); }
  foot.set(0, 1, 2, S[0]); foot.set(0, 2, 3, 0xf8f0e0); foot.set(0, 2, 4, 0xffffff); // the sickle claw, raised
  const G = (vb, py = 0) => vb.geo(0, py, 0);
  return { body: G(body), head: G(head), jaw: G(jaw), eyes: G(eyes, 3), angry: G(angry, 3), arm: G(arm), tail: tail.map((t) => G(t)), thigh: G(thigh), shin: G(shin), foot: G(foot), hide: c01(S[2]), crest: c01(P.crest[1]) };
}

export class Raptor extends Beast {
  static info = {
    id: 'raptor', name: 'Cave Raptor', color: '#e0a050', hits: 2.6, dmg: 4, poise: 1, tier: 2, flesh: true, snd: 'flesh',
    diet: 'hunt', social: 'pack', aggro: 'hostile', morale: true, sleepy: 0.25, sight: 14, hear: 1.3, walk: 1.6, run: 4.4, turn: 7, accel: 8,
    keep: 3.2, close: 1.3, agile: true, jump: 4.6, space: [0.28, 0.9], prey: ['critter', 'shellback', 'kobold', 'cave_slime'],
    harvest: ['dino_meat'], metabolism: 0.007, depth: [30, 200], lie: 1, wakeR: 3, wander: 0.3, patience: 10, keepFar: 34,
  };
  static attacks = [
    { id: 'snap', range: [0, 1.5], arc: 0.6, tell: 0.45, dur: 0.28, hitAt: 0.07, rec: 0.5, cd: [1.1, 1.9], w: 2,
      start() { this.sound('screech', { pitch: rand(1.2, 1.4), vol: 0.6 }); },
      go() { this.vel.x += Math.sin(this.yaw) * 3; this.vel.z += Math.cos(this.yaw) * 3; this.sound('chomp', {}); },
      hit(A) { return this.strikeAt(A, this.reachPoint(0.3, 0.15), 0.32, { dmg: this.info.dmg, push: 2.6, kind: 'bite' }); } },
    { id: 'leap', range: [1.8, 4.2], arc: 0.45, tell: 0.5, dur: 0.6, hitAt: 0.05, rec: 0.6, cd: [1.8, 2.8], w: 1.6,
      start() { this.sound('bark', { pitch: 1.2, n: 1 }); },
      go(A) { const t = this.targetPos(A); const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz) || 1; const v = Math.min(8, Math.max(0, d - 0.5) / 0.48); this.vel.set(dx / d * v, 3.8, dz / d * v); this.sqv += 6; this.sound('screech', { pitch: 1.5, vol: 0.7 }); },
      hit(A) { return A.t > 0.55 || this.strikeAt(A, this.reachPoint(0.15, -0.1), 0.38, { dmg: this.info.dmg * 1.3, push: 3.4, kind: 'claw' }); } },
  ];
  static nestStyle = () => ({ style: 'twigs', r: 0.75, eggs: 3, eggR: 3, item: 'dino_egg', eggCols: [0x7a5a3a, 0xe0caa0, 0xfff4dc] });

  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.24; this.h = 0.85; this.cy = 0.55; this.hitR = 0.36;
    this.mass = 1.8; this.kb = 2.6;
    this.size = rand(0.92, 1.08);
    this.step = 0.28; this.friction = 10; this.springK = 220; this.springC = 10; this.sqScale = 0.5;
    const G = this.G = mgr.geo('raptor|' + (this.zone % 3), () => buildRaptor(this.zone % 3));
    this.hitCol = G.hide;
    this.mat = this.material({});
    this.eyeMat = this.material({ emissive: 0.7, rimK: 0 });
    this.hips = this.group3(this.root, 0, 12 * VS, 0);
    this.bodyG = this.group3(this.hips);
    this.part(G.body, this.mat, this.bodyG);
    this.neck = this.group3(this.bodyG, 0, 6.5 * VS, 8 * VS);
    this.part(G.head, this.mat, this.neck);
    this.jaw = this.group3(this.neck, 0, 0.8 * VS, 1.5 * VS); this.part(G.jaw, this.mat, this.jaw);
    this.eyes = this.part(G.eyes, this.eyeMat, this.neck, 0, 3 * VS, 0);
    this.headObj = this.neck; this.headTop = 6 * VS; this.headFwd = 3 * VS;
    this.arms = [1, -1].map((sd) => { const g = this.group3(this.bodyG, sd * 3 * VS, 0.5 * VS, 5.5 * VS); const a = this.part(G.arm, this.mat, g); if (sd < 0) a.scale.x = -1; return g; });
    let tp = this.group3(this.bodyG, 0, 0.5 * VS, -5 * VS);
    this.tail = G.tail.map((g, i) => { const s = i ? this.group3(tp, 0, 0.2 * VS, -4.8 * VS) : tp; this.part(g, this.mat, s); tp = s; return s; });
    this.tailChain = new Chain(this.tail, { sway: 0.1, swayHz: 6, lag: 0.15, droop: -0.04 });
    const defs = [1, -1].map((sd, i) => {
      const thigh = this.part(G.thigh, this.mat, this.hips), shin = this.part(G.shin, this.mat, this.hips), foot3 = this.part(G.foot, this.mat, this.root);
      return { parent: this.hips, hip: [sd * 2.6 * VS, 0, -0.5 * VS], l1: 5.5 * VS, l2: 6 * VS, thigh, shin, foot3, knee: [0, 0, 1], rest: [sd * 0.1, 0.03], group: i, lift: 0.1 };
    });
    this.legs = new Legs(this, defs, { stride: 0.3, stepT: 0.2, lead: 0.15, speedK: 0.3, onStep: (L, k) => { if (this.dist < 9 && k > 0.5) this.sound('step', { vol: 0.12 }); } });
    this.leanK = 0; this.jawK = 0; this.crouch = 0;
    if (this.asleep) this.restK = 1;
  }
  onNotice() { this.sound('screech', { pitch: rand(1, 1.2) }); this.jawOpen = 1; }
  onTaunt() { if (Math.random() < 0.6) { this.sound('bark', { pitch: rand(1, 1.3), n: 2 }); this.jawOpen = 0.8; } }
  onFlee() { this.sound('screech', { pitch: 1.6, vol: 0.7 }); }
  onWake() { this.sound('bark', { pitch: 1.1, n: 1 }); }
  onHit() { this.sound('screech', { pitch: 1.7, vol: 0.6 }); this.jawOpen = 1; }

  animate(dt) {
    const A = this.atk, t = this.t, sp = Math.hypot(this.vel.x, this.vel.z);
    this.legs.update(dt);
    let lean = clamp(sp * 0.06, 0, 0.25), jaw = 0.05, crouch = 0, tailUp = 0;
    if (A) {
      const k = A.phase === 'tell' ? clamp(A.t / A.a.tell, 0, 1) : 0;
      if (A.a.id === 'snap') { if (A.phase === 'tell') { lean = -0.25 * k; jaw = 0.7 * k; } else if (A.phase === 'go') { lean = 0.35; jaw = 0.7 - 0.7 * clamp(A.t / 0.08, 0, 1); } }
      if (A.a.id === 'leap') { if (A.phase === 'tell') { crouch = k; tailUp = 0.5 * k; lean = 0.2 * k; jaw = 0.3 * k; } else if (A.phase === 'go') { lean = -0.2; jaw = 0.8; tailUp = 0.3; } }
    }
    if (!this.grounded) lean -= 0.15;
    const kk = Math.min(1, dt * 12);
    this.leanK += (lean - this.leanK) * kk; this.jawK += (jaw - this.jawK) * kk; this.crouch += (crouch - this.crouch) * kk;
    const rest = this.restK;
    this.bodyG.rotation.x = this.leanK + rest * 0.15 + Math.sin(t * 2.4) * 0.02;
    this.hips.position.y = (12 - this.crouch * 3 - rest * 6) * VS + Math.abs(Math.sin(t * (6 + sp * 2.5))) * 0.4 * VS * clamp(sp / 2, 0, 1);
    this.arms.forEach((a, i) => { a.rotation.x = -0.3 + Math.sin(t * 5 + i) * 0.1 + (A ? -0.6 : 0); });
    if (rest > 0.5) this.neck.rotation.set(0.6, 0.5, 0.2);
    else if (this.headDown > 0.3) this.neck.rotation.x += (1 - this.neck.rotation.x) * Math.min(1, dt * 6);
    else look(this.neck, this.mode === 'fight' || A ? this.mgr.eye : this.lookAt, dt, { yaw: 1, pitch: 0.6, rate: 9, basePitch: 0.15 });
    this.jawOpen = Math.max(0, (this.jawOpen || 0) - dt * 3);
    this.jaw.rotation.x = this.jawK + this.jawOpen * 0.4 * (0.6 + 0.4 * Math.sin(t * 25));
    this.tailChain.update(dt, this, { pitch: -tailUp });
    this.eyes.geometry = this.mode === 'fight' || A ? this.G.angry : this.G.eyes;
    this.eyeOpen = this.asleep ? 0 : 1;
  }
  deathFx() { this.sound('screech', { pitch: 0.9, vol: 0.8 }); puff(this.fx, this.center.x, this.center.y, this.center.z, 6, this.G.hide, 0.15, 0.3, 0.06, 0.5); }
}

// =====================================================================================
// Tyrant
// =====================================================================================
const TV = 1 / 16;
const TYR = { s: [0x3e5030, 0x5a7040, 0x7a9256, 0xa0b878], belly: 0xd8c898, stripe: 0x24301a, eye: 0xffb030, teeth: 0xfff4e0, claw: 0x2a2018 };

export function buildTyrant() {
  const P = TYR, S = P.s;
  const body = new VB(141), bs = shader(body, S, { belly: P.belly, stripe: [5, P.stripe] });
  body.ell(0, 0, 0, 8.5, 9, 13, bs);
  body.ell(0, 3, 9, 8, 9, 7.5, bs); // chest
  body.cap(0, 6, 13, 0, 11, 16, 5.5, shader(body, S, { belly: P.belly, k0: 0.45 })); // neck
  for (let z = -10; z <= 12; z += 3) { const h = body.hitFrom(0, 20, z, 0, -1, 0); if (h) body.set(0, h[1] + 1, z, S[3]); }
  body.hollow();
  const head = new VB(142), hs = shader(head, S, { k0: 0.5, stripe: [6, P.stripe] });
  head.ell(0, 4, 2, 8.5, 7.5, 9, hs); // a big round head
  head.ell(0, 2, 10, 6.5, 5, 6.5, hs); // muzzle
  head.paint((x, y, z) => (y <= -1 && z > 3 ? P.belly : undefined));
  for (const sd of [1, -1]) { head.set(sd > 0 ? 2 : -3, 4, 16, 0x1a1008); head.ell(sd * 6 - (sd < 0 ? 1 : 0), 9, 4, 2.4, 1.6, 2.8, (x, y, z, nx, ny) => mul(hs(x, y, z, nx, ny, 0), 0.85)); } // nostrils, brow bumps
  for (let z = 4; z <= 15; z += 2) for (const sd of [1, -1]) head.set(sd * 5 - (sd < 0 ? 1 : 0), -2, z, P.teeth); // upper teeth
  head.hollow();
  const [eyes, angry] = bigEyes(head, 12, 7, 6, P.eye, 3);
  const jaw = new VB(143);
  jaw.ell(0, -2, 8, 6.5, 2.6, 8.5, (x, y, z, nx, ny) => (ny < -0.2 ? P.belly : S[1]));
  for (let z = 3; z <= 15; z += 2) for (const sd of [1, -1]) jaw.set(sd * 5 - (sd < 0 ? 1 : 0), 0, z, P.teeth);
  const arm = new VB(144);
  arm.cap(0, 0, 0, 0, -4, 2, 1.6, S[2]); arm.cap(0, -4, 2, 0, -5, 4.5, 1.3, S[2]);
  arm.set(0, -6, 5, P.teeth); arm.set(-1, -6, 5, P.teeth);
  const tail = [0, 1, 2, 3].map((i) => {
    const t = new VB(145 + i), r = 6.5 - i * 1.4;
    t.cap(0, 0, 0, 0, 0.5, -8, r, shader(t, S, { belly: P.belly, stripe: [4, P.stripe] }));
    return t.hollow();
  });
  const thigh = new VB(149); thigh.cap(0, 0, 0, 0, -9.5, 1, 6, shader(thigh, S, { k0: 0.45 })); thigh.hollow();
  const shin = new VB(150); shin.cap(0, 0, 0, 0, -10, -1, 3.8, shader(shin, S, { k0: 0.3 }));
  const foot = new VB(151);
  foot.ell(0, 1.4, 2, 5, 2, 6, S[1]);
  for (const x of [-3, 0, 3]) { foot.set(x, 0, 8, P.claw); foot.set(x, 1, 8, P.claw); foot.set(x, 0, 9, P.teeth); }
  const G = (vb, py = 0) => vb.geo(0, py, 0, TV);
  return { body: G(body), head: G(head), jaw: G(jaw), eyes: G(eyes, 7), angry: G(angry, 7), arm: G(arm), tail: tail.map((t) => G(t)), thigh: G(thigh), shin: G(shin), foot: G(foot), hide: c01(S[2]), dust: [0.5, 0.44, 0.36] };
}

export class Tyrant extends Beast {
  static info = {
    id: 'tyrant', name: 'Cave Tyrant', color: '#a0b070', hits: 20, dmg: 12, poise: 5, tier: 5, flesh: true, snd: 'flesh',
    diet: 'hunt', social: 'solo', aggro: 'territorial', territory: 16, sleepy: 0.7, sight: 18, hear: 0.8, deep: 3, walk: 1.2, run: 3.4,
    turn: 1.9, accel: 3, keep: 3.4, close: 2.4, space: [0.75, 3.2], prey: ['shellback', 'raptor', 'cave_troll', 'kobold'],
    wakeR: 4.5, snore: 'big_snore', snorePitch: 0.6, harvest: ['dino_meat', 'dino_meat', 'beast_hide'], metabolism: 0.0025, depth: [40, 200],
    lie: 1, keepFar: 40, patience: 16, parryStun: 1.4,
  };
  static attacks = [
    { id: 'bite', range: [0, 3.4], arc: 0.45, tell: 1.0, dur: 0.4, hitAt: 0.12, rec: 1.1, cd: [2, 3.2], w: 2.2, heavy: true,
      start() { this.sound('roar_big', { pitch: 1.1, vol: 0.9 }); },
      go() { this.vel.x += Math.sin(this.yaw) * 3; this.vel.z += Math.cos(this.yaw) * 3; this.sound('chomp', { vol: 1 }); this.mgr.shake(this, 0.3); },
      hit(A) { return this.strikeAt(A, this.reachPoint(1.2, -0.9), 0.85, { dmg: this.info.dmg * 1.4, push: 6, up: 3, heavy: true, unblockable: true, kind: 'bite' }); } },
    { id: 'stomp', range: [0, 3], arc: Math.PI, tell: 0.85, dur: 0.5, hitAt: 0.1, rec: 1, cd: [3, 4.5], w: 1, heavy: true,
      start() { this.sound('grunt', { pitch: 0.5 }); },
      hit(A) {
        const m = this.mgr, x = this.pos.x + Math.sin(this.yaw) * 0.8, z = this.pos.z + Math.cos(this.yaw) * 0.8;
        shockRing(this.fx, x, this.pos.y, z, 0.6, 5, this.G.dust, 72);
        pebbles(this.fx, x, this.pos.y + 0.1, z, 16, this.G.dust, 0.5, 4);
        this.sound('stomp', { vol: 1 }); this.sound('smash', { vol: 0.8 });
        m.addHazard({ kind: 'ring', x, y: this.pos.y, z, r: 0.6, speed: 5, rMax: 4.6, dmg: this.info.dmg * 0.7, src: this });
        m.shake(this, 1);
        return true;
      } },
    { id: 'tail', range: [0, 3.6], arc: Math.PI, tell: 0.7, dur: 0.45, hitAt: 0.15, rec: 0.8, cd: [2, 3], w: 1.4,
      when(e, d, tg) { const t = tg && tg !== 'player' ? tg.pos : e.mgr.pc; return Math.abs(((Math.atan2(t.x - e.pos.x, t.z - e.pos.z) - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 1.2; },
      start() { this.sound('growl', { pitch: 0.6, dur: 0.6 }); },
      hit(A) { this.tailTip(_w); return this.strikeAt(A, _w, 1.1, { dmg: this.info.dmg * 0.8, push: 7, up: 2.5, kind: 'tail' }); } },
  ];

  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.62; this.h = 2.6; this.cy = 1.7; this.hitR = 0.95;
    this.mass = 16; this.kb = 0.8;
    this.size = rand(0.95, 1.05);
    this.step = 0.42; this.friction = 8; this.springK = 90; this.springC = 10; this.sqScale = 0.25;
    const G = this.G = mgr.geo('tyrant', () => buildTyrant());
    this.hitCol = G.hide;
    this.mat = this.material({});
    this.eyeMat = this.material({ emissive: 0.8, rimK: 0 });
    this.hips = this.group3(this.root, 0, 21 * TV, 0);
    this.bodyG = this.group3(this.hips);
    this.part(G.body, this.mat, this.bodyG);
    this.neck = this.group3(this.bodyG, 0, 11 * TV, 16 * TV);
    this.part(G.head, this.mat, this.neck);
    this.jaw = this.group3(this.neck, 0, 0, 2 * TV); this.part(G.jaw, this.mat, this.jaw);
    this.eyes = this.part(G.eyes, this.eyeMat, this.neck, 0, 7 * TV, 0);
    this.headObj = this.neck; this.headTop = 12 * TV; this.headFwd = 8 * TV;
    this.arms = [1, -1].map((sd) => { const g = this.group3(this.bodyG, sd * 6.5 * TV, 2 * TV, 12 * TV); const a = this.part(G.arm, this.mat, g); if (sd < 0) a.scale.x = -1; return g; });
    let tp = this.group3(this.bodyG, 0, 1 * TV, -12 * TV);
    this.tail = G.tail.map((g, i) => { const s = i ? this.group3(tp, 0, 0.4 * TV, -7.6 * TV) : tp; this.part(g, this.mat, s); tp = s; return s; });
    this.tailChain = new Chain(this.tail, { sway: 0.08, swayHz: 2.4, lag: 0.25, droop: 0.02 });
    const defs = [1, -1].map((sd, i) => {
      const thigh = this.part(G.thigh, this.mat, this.hips), shin = this.part(G.shin, this.mat, this.hips), foot3 = this.part(G.foot, this.mat, this.root);
      return { parent: this.hips, hip: [sd * 6.5 * TV, 0, 0], l1: 9.5 * TV, l2: 10 * TV, thigh, shin, foot3, knee: [0, 0, 1], rest: [sd * 0.42, 0.1], group: i, lift: 0.22 };
    });
    this.legs = new Legs(this, defs, { stride: 0.75, stepT: 0.45, lead: 0.3, speedK: 0.2, onStep: (L) => this.footfall(L) });
    this.leanK = 0; this.jawK = 0; this.rearK = 0;
    if (this.asleep) this.restK = 1;
  }
  mouthPos(out) { this.neck.updateWorldMatrix(true, false); return this.neck.localToWorld(out.set(0, 1 * TV, 15 * TV)); }
  tailTip(out) { const t = this.tail[this.tail.length - 1]; t.updateWorldMatrix(true, false); return t.localToWorld(out.set(0, 0, -6 * TV)); }
  footfall(L) {
    if (this.dist > 26) return;
    this.fx.dust(L.foot.x, L.foot.y + 0.04, L.foot.z, 5, this.G.dust, 0.2);
    pebbles(this.fx, L.foot.x, L.foot.y + 0.05, L.foot.z, 3, this.G.dust, 0.2, 1);
    this.sound('stomp', { vol: 0.7 });
    this.mgr.shake(this, 0.22);
  }
  onNotice() {
    // the roar: the cave shakes, everything for a long way around hears it
    this.roarT = 1.6;
    this.sound('roar_big', { pitch: 0.75, vol: 1 });
    this.mgr.shake(this, 1);
    this.mgr.noise(this.pos.x, this.pos.y + 2, this.pos.z, 30, 'roar');
    this.mgr.say('tyrant_roar', 'The whole cave shakes... A <b>Cave Tyrant</b>! Its bite is too heavy to block: <b>dodge</b>.', 'bad', 9999);
  }
  onWake() { this.sound('grunt', { pitch: 0.5, vol: 1 }); }
  onTaunt() { if (Math.random() < 0.3) { this.sound('growl', { pitch: 0.5, dur: 1.2, vol: 1 }); this.jawOpen = 0.6; } }
  onHit() { this.sound('growl', { pitch: 0.7, dur: 0.5 }); }

  animate(dt) {
    const A = this.atk, t = this.t, sp = Math.hypot(this.vel.x, this.vel.z);
    this.legs.update(dt);
    let lean = 0.12 + clamp(sp * 0.05, 0, 0.15), jaw = 0.08, rear = 0, whip = 0, neckP = 0;
    this.roarT = Math.max(0, (this.roarT || 0) - dt);
    if (this.roarT > 0) { rear = 0.25; jaw = 1; neckP = -0.5; }
    if (A) {
      const k = A.phase === 'tell' ? clamp(A.t / A.a.tell, 0, 1) : 0;
      if (A.a.id === 'bite') { if (A.phase === 'tell') { rear = 0.3 * k; neckP = -0.6 * k; jaw = 0.9 * k; } else if (A.phase === 'go') { lean = 0.5; neckP = 0.4; jaw = 0.9 - 0.9 * clamp(A.t / 0.12, 0, 1); } }
      if (A.a.id === 'stomp') { if (A.phase === 'tell') { rear = 0.15 * k; this.sqT = 0.04 * k; } else this.sqT = 0; }
      if (A.a.id === 'tail') { if (A.phase === 'tell') whip = -0.8 * k; else if (A.phase === 'go') whip = -0.8 + 2.6 * clamp(A.t / 0.25, 0, 1); }
    }
    const kk = Math.min(1, dt * 6);
    this.leanK += (lean - this.leanK) * kk; this.jawK += (jaw - this.jawK) * Math.min(1, dt * 12); this.rearK += (rear - this.rearK) * kk;
    const rest = this.restK;
    this.bodyG.rotation.x = this.leanK - this.rearK + rest * 0.1 + Math.sin(t * 1.4) * 0.012;
    this.hips.position.y = (21 - rest * 12) * TV + Math.abs(Math.sin(t * (3 + sp * 2))) * 0.6 * TV * clamp(sp, 0, 1);
    this.arms.forEach((a, i) => { a.rotation.x = Math.sin(t * 3 + i * 2) * 0.2 - 0.2; });
    if (rest > 0.5) this.neck.rotation.set(0.35, 0.4, 0.15);
    else if (this.headDown > 0.3) this.neck.rotation.x += (0.8 - this.neck.rotation.x) * Math.min(1, dt * 4);
    else look(this.neck, this.mode === 'fight' || A ? this.mgr.eye : this.lookAt, dt, { yaw: 0.7, pitch: 0.5, rate: 4, basePitch: 0.1 + neckP });
    this.jawOpen = Math.max(0, (this.jawOpen || 0) - dt * 1.5);
    this.jaw.rotation.x = this.jawK * 0.7 + this.jawOpen * 0.4 + (this.asleep ? 0.05 + Math.sin(t * 1.2) * 0.03 : 0);
    this.tailChain.update(dt, this, { yaw: whip * 1.4 });
    this.eyes.geometry = this.mode === 'fight' || A ? this.G.angry : this.G.eyes;
    this.eyeOpen = this.asleep ? 0 : 1;
  }
  deathFx() { this.sound('roar_big', { pitch: 0.6, vol: 1 }); this.mgr.shake(this, 1); puff(this.fx, this.center.x, this.pos.y + 0.5, this.center.z, 18, this.G.dust, 1, 0.4, 0.15, 0.6); }
}

// =====================================================================================
// Shellback
// =====================================================================================
const SHELL = { s: [0x4a5a3a, 0x667a4c, 0x869a62, 0xaabc82], plate: [0x6a5236, 0x8e7048, 0xb0905e, 0xd4b47c], belly: 0xd8d0a8, eye: 0x2a1a10, knob: 0xe8dcc0 };

export function buildShellback() {
  const P = SHELL, S = P.s;
  const shell = new VB(161);
  shell.ell(0, 0, 0, 8.5, 6, 10.5, (x, y, z, nx, ny) => {
    if (ny < -0.3) return P.belly;
    // hexagonal-ish plates with darker seams and bony knobs on top
    const u = x + (Math.floor(z / 3) & 1) * 1.5;
    if (((Math.floor(u / 3) + Math.floor(z / 3)) & 1) === 0 && (Math.abs(u % 3) < 0.6 || Math.abs(z % 3) < 0.6)) return P.plate[0];
    return P.plate[Math.floor(clamp(0.4 + ny * 0.5 + (shell.n(x, y, z) - 0.5) * 0.3, 0, 0.999) * 4)];
  });
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const h = shell.hitFrom(Math.cos(a) * 5, 12, Math.sin(a) * 7, 0, -1, 0); if (h) shell.set(h[0], h[1] + 1, h[2], P.knob); }
  for (let z = -8; z <= 8; z += 3) { const h = shell.hitFrom(0, 12, z, 0, -1, 0); if (h) { shell.set(0, h[1] + 1, z, P.knob); shell.set(0, h[1] + 2, z, P.knob); } }
  shell.paint((x, y, z) => (y > -1 && y < 1 && (Math.abs(x) > 7 || Math.abs(z) > 9) ? (((x + z) & 1) ? P.knob : P.plate[1]) : undefined)); // a frill of spikes at the rim
  const head = new VB(162), hs = shader(head, S, { k0: 0.5 });
  head.ell(0, 1.5, 2, 3.8, 3.2, 3.8, hs);
  head.ell(0, 0.5, 5, 2.6, 2.2, 2.4, hs); // a blunt beaked face
  head.ell(0, 2.5, 0.5, 4.4, 1.6, 3, (x, y, z) => P.plate[2]); // a bony cap
  head.set(-2, 1, 7, P.eye); head.set(1, 1, 7, P.eye);
  const [eyes, angry] = bigEyes(head, 6, 2.5, 3, 0x2a1a10, 2);
  eyes.paint((x, y, z, c) => (c === 0x2a1a10 ? 0x3a2a1a : undefined));
  const jaw = new VB(163);
  jaw.ell(0, -0.6, 4.4, 2.2, 0.9, 2.4, P.belly);
  jaw.set(-1, 0, 6, 0x5a4a30); jaw.set(0, 0, 6, 0x5a4a30);
  const tail = [0, 1, 2].map((i) => {
    const t = new VB(164 + i), r = 3 - i * 0.7;
    t.cap(0, 0, 0, 0, 0.3, -5, r, shader(t, S, { belly: P.belly }));
    for (let z = -1; z >= -4; z -= 2) t.set(0, Math.round(r) + 1, z, P.plate[1]);
    if (i === 2) { t.ell(0, 0, -7, 3.6, 2.6, 3.2, (x, y, z, nx, ny) => (t.n(x, y, z) > 0.75 ? P.knob : P.plate[Math.floor(clamp(0.4 + ny * 0.4, 0, 0.99) * 4)])); for (const sd of [1, -1]) t.cap(sd * 3, 0, -7, sd * 5, 0, -8, 0.8, P.knob); }
    return t;
  });
  const thigh = new VB(167); thigh.cap(0, 0, 0, 0, -3.6, 0, 2.6, shader(thigh, S, { k0: 0.4 }));
  const shin = new VB(168); shin.cap(0, 0, 0, 0, -3.6, 0, 2.2, shader(shin, S, { k0: 0.3 }));
  const foot = new VB(169); foot.ell(0, 0.8, 0.6, 2.6, 1.2, 2.8, S[1]);
  for (const x of [-2, 0, 2]) foot.set(x, 0, 3, P.knob);
  return { shell: shell.geo(0, 0, 0), head: head.geo(0, 0, 0), jaw: jaw.geo(0, 0, 0), eyes: eyes.geo(0, 2.5, 0), angry: angry.geo(0, 2.5, 0), tail: tail.map((t) => t.geo(0, 0, 0)), thigh: thigh.geo(0, 0, 0), shin: shin.geo(0, 0, 0), foot: foot.geo(0, 0, 0), hide: c01(S[2]) };
}

export class Shellback extends Beast {
  static info = {
    id: 'shellback', name: 'Shellback', color: '#9ab070', hits: 6, dmg: 6, poise: 3, tier: 3, flesh: true, snd: 'stone', grazer: true,
    diet: 'graze', social: 'herd', aggro: 'defensive', sleepy: 0.35, sight: 9, hear: 1.1, walk: 0.8, run: 2.6, turn: 2.6, accel: 5,
    keep: 2.6, close: 1.8, space: [0.48, 1.1], harvest: ['dino_meat', 'armor_plate'], metabolism: 0.006, depth: [30, 200], young: true,
    flee: 4, fleeHp: 0.35, lie: 0.5, wander: 0.25, anyFood: true, keepFar: 34,
  };
  static attacks = [
    { id: 'charge', range: [0, 3], arc: 0.5, tell: 0.75, dur: 0.6, hitAt: 0.1, rec: 0.8, cd: [2, 3], w: 1.5,
      when(e) { return !e.baby; },
      start() { this.sound('grunt', { pitch: 1.3 }); this.sound('growl', { pitch: 1.4, dur: 0.4 }); },
      tick(A, dt) { if (A.phase === 'go') this.push(Math.sin(this.yaw) * 4.5, Math.cos(this.yaw) * 4.5, 12, dt); },
      hit(A) { return this.strikeAt(A, this.reachPoint(0.2, -0.1), 0.45, { dmg: this.info.dmg, push: 5, up: 2.5 }); } },
    { id: 'club', range: [0, 2.8], arc: Math.PI, tell: 0.9, dur: 0.5, hitAt: 0.18, rec: 0.8, cd: [2.4, 3.4], w: 1.5, heavy: true,
      when(e, d, tg) { const t = tg && tg !== 'player' ? tg.pos : e.mgr.pc; return !e.baby && Math.abs(((Math.atan2(t.x - e.pos.x, t.z - e.pos.z) - e.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 1; },
      start() { this.sound('grunt', { pitch: 1.1 }); },
      hit(A) { this.tailTip(_w); const ok = this.strikeAt(A, _w, 0.8, { dmg: this.info.dmg * 1.4, push: 6.5, up: 3, heavy: true, kind: 'tail' }); if (ok) this.sound('smash', { vol: 0.9 }); return ok; } },
  ];
  static nestStyle = () => ({ style: 'twigs', r: 0.9, eggs: 3, eggR: 3.6, item: 'dino_egg', eggCols: [0x4a6a3a, 0xb8d098, 0xe8f4d8] });

  constructor(mgr, o) {
    super(mgr, o);
    this.baby = !!o.baby;
    this.hw = 0.42; this.h = 0.85; this.cy = 0.5; this.hitR = 0.55;
    this.mass = 6; this.kb = 1.2;
    this.size = this.baby ? rand(0.42, 0.5) : rand(0.92, 1.08);
    if (this.baby) { this.hp = this.maxHp *= 0.3; this.mass = 1.5; this.hw = 0.2; this.h = 0.45; }
    this.step = 0.3; this.friction = 10; this.springK = 130; this.springC = 10; this.sqScale = 0.4;
    const G = this.G = mgr.geo('shellback', () => buildShellback());
    this.hitCol = G.hide;
    this.mat = this.material({});
    this.eyeMat = this.material({ rimK: 0 });
    this.hips = this.group3(this.root, 0, 9 * VS, 0);
    this.bodyG = this.group3(this.hips);
    this.part(G.shell, this.mat, this.bodyG);
    this.neck = this.group3(this.bodyG, 0, -0.5 * VS, 9.5 * VS);
    this.part(G.head, this.mat, this.neck);
    this.jaw = this.group3(this.neck, 0, 0.3 * VS, 1.5 * VS); this.part(G.jaw, this.mat, this.jaw);
    this.eyes = this.part(G.eyes, this.eyeMat, this.neck, 0, 2.5 * VS, 0);
    this.headObj = this.neck; this.headTop = 4 * VS; this.headFwd = 3 * VS;
    let tp = this.group3(this.bodyG, 0, -1 * VS, -9.5 * VS);
    this.tail = G.tail.map((g, i) => { const s = i ? this.group3(tp, 0, 0.3 * VS, -4.8 * VS) : tp; this.part(g, this.mat, s); tp = s; return s; });
    this.tailChain = new Chain(this.tail, { sway: 0.12, swayHz: 2.5, lag: 0.2, droop: 0.08 });
    const defs = [];
    for (const [front, sd] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const thigh = this.part(G.thigh, this.mat, this.bodyG), shin = this.part(G.shin, this.mat, this.bodyG), foot3 = this.part(G.foot, this.mat, this.root);
      defs.push({ parent: this.bodyG, hip: [sd * 6 * VS, -3 * VS, front * 6 * VS], l1: 3.6 * VS, l2: 3.6 * VS, thigh, shin, foot3, knee: [0, 0, front > 0 ? 1 : -1], rest: [sd * 0.26, front * 0.24], group: (front > 0) === (sd > 0) ? 0 : 1, lift: 0.07 });
    }
    this.legs = new Legs(this, defs, { stride: 0.22, stepT: 0.26, lead: 0.15, onStep: (L, k) => { if (this.dist < 10 && !this.baby) this.sound('step', { vol: 0.18 }); } });
    this.whip = 0; this.jawK = 0; this.lowK = 0;
    if (this.asleep) this.restK = 1;
  }
  tailTip(out) { const t = this.tail[this.tail.length - 1]; t.updateWorldMatrix(true, false); return t.localToWorld(out.set(0, 0, -7 * VS)); }
  /** Babies stay by the grown-ups, and the grown-ups turn on anything that harms a baby. */
  decide() {
    super.decide();
    if (this.baby && this.mode === 'fight') { this.setMode('flee'); this.fleeFrom = { x: this.mgr.pc.x, z: this.mgr.pc.z, k: 1 }; }
  }
  onHit() {
    this.sound('grunt', { pitch: this.baby ? 2 : 1.2 });
    if (this.baby && this.group) for (const c of this.group.members) if (c.alive && !c.baby) { c.lastHitT = this.mgr.time; c.lastHitBy = 'player'; }
  }
  onNotice() { this.sound('growl', { pitch: this.baby ? 2.2 : 1.3, dur: 0.5 }); }
  onFlee() { this.sound('grunt', { pitch: this.baby ? 2.2 : 1.5 }); }

  animate(dt) {
    const A = this.atk, t = this.t;
    this.legs.update(dt);
    let whip = 0, low = 0, jaw = this.headDown > 0.3 ? 0.25 + Math.sin(t * 9) * 0.2 : 0.05;
    if (A) {
      const k = A.phase === 'tell' ? clamp(A.t / A.a.tell, 0, 1) : 0;
      if (A.a.id === 'charge') low = A.phase === 'tell' ? k : A.phase === 'go' ? 1 : 0;
      if (A.a.id === 'club') { if (A.phase === 'tell') whip = -1 * k; else if (A.phase === 'go') whip = -1 + 2.8 * clamp(A.t / 0.3, 0, 1); }
    }
    const kk = Math.min(1, dt * 10);
    this.whip += (whip - this.whip) * kk; this.lowK += (low - this.lowK) * kk; this.jawK += (jaw - this.jawK) * kk;
    const rest = this.restK;
    this.hips.position.y = (9 - rest * 4) * VS + Math.sin(t * 1.6) * 0.15 * VS;
    this.bodyG.rotation.x = 0.04 + this.lowK * 0.12;
    if (rest > 0.5) this.neck.rotation.set(0.5, 0.2, 0);
    else if (this.headDown > 0.3 || low > 0.1) this.neck.rotation.x += ((low > 0.1 ? 0.5 : 0.75) - this.neck.rotation.x) * Math.min(1, dt * 5);
    else look(this.neck, this.mode === 'fight' || A ? this.mgr.eye : this.lookAt, dt, { yaw: 0.8, pitch: 0.4, rate: 5 });
    this.jaw.rotation.x = this.jawK;
    this.tailChain.update(dt, this, { yaw: this.whip * 1.5, pitch: -Math.abs(this.whip) * 0.4 });
    this.eyes.geometry = this.mode === 'fight' || A ? this.G.angry : this.G.eyes;
    this.eyeOpen = this.asleep ? 0 : 1;
  }
  deathFx() { this.sound('grunt', { pitch: 0.8 }); puff(this.fx, this.center.x, this.center.y, this.center.z, 8, this.G.hide, 0.3, 0.3, 0.08, 0.5); }
}

// =====================================================================================
// Pterosaur
// =====================================================================================
const PTERO = { s: [0x6a3a2a, 0x8e5a3a, 0xb47e52, 0xd8a670], mem: [0x8a4a32, 0xb8704a], crest: [0xd83a2a, 0xff8a4a], belly: 0xf0dcc0, eye: 0xffe060 };

export function buildPtero() {
  const P = PTERO, S = P.s;
  const body = new VB(181), bs = shader(body, S, { belly: P.belly });
  body.ell(0, 0, 0, 2.6, 2.6, 4.2, bs);
  body.cap(0, 1, 3.5, 0, 2.5, 6, 1.5, bs); // neck
  const head = new VB(182), hs = shader(head, S, { k0: 0.5 });
  head.ell(0, 1, 1, 2.6, 2.4, 2.8, hs);
  head.cap(0, 0.4, 3, 0, -0.2, 11, 1.2, (x, y, z, t) => (t > 0.8 ? 0x3a2a1a : mix(S[2], P.belly, 0.4))); // the long beak
  head.cap(0, 2.5, 0, 0, 5.5, -6, 1, (x, y, z, t) => (t > 0.5 ? P.crest[1] : P.crest[0])); // the crest
  const [eyes, angry] = bigEyes(head, 5, 1.5, 1.5, P.eye, 2);
  // a wing: the arm along +x, membrane trailing back, a little clawed hand at the bend
  const wing = new VB(183);
  wing.cap(0, 0, 0, 10, 0.5, 1, 0.9, S[1]); wing.cap(10, 0.5, 1, 24, 0, -2, 0.7, S[1]);
  for (let x = 1; x <= 24; x++) for (let z = -9; z <= 0; z++) {
    const t = x / 24, lead = x <= 10 ? 0.1 * x : 1 - (x - 10) * 0.21, trail = -9 + Math.abs(t - 0.4) * 9;
    if (z > lead || z < trail) continue;
    if (wing.n(x, 0, z) < 0.04) continue;
    wing.set(x, 0, z, (x + z) % 6 === 0 ? P.mem[1] : P.mem[0]);
  }
  wing.set(10, -1, 2, 0xf0e8d8); wing.set(11, -1, 2, 0xf0e8d8);
  const leg = new VB(184); leg.cap(0, 0, 0, 0, -3, -1, 0.8, S[2]); leg.set(0, -3, 0, 0xf0e8d8);
  return { body: body.geo(0, 0, 0), head: head.geo(0, 0, 0), eyes: eyes.geo(0, 1.5, 0), angry: angry.geo(0, 1.5, 0), wing: wing.geo(0, 0, 0), leg: leg.geo(0, 0, 0), hide: c01(S[2]) };
}

export class Pterosaur extends Beast {
  static info = {
    id: 'pterosaur', name: 'Pterosaur', color: '#e09060', hits: 2, dmg: 4, poise: 1, tier: 2, flesh: true, snd: 'flesh', flying: true,
    diet: 'scavenge', social: 'flock', aggro: 'hostile', sleepy: 0.2, sight: 16, hear: 1.2, walk: 2.4, run: 4.2, turn: 3.5, accel: 2.5,
    keep: 4.5, close: 2.5, space: [0.3, 3], harvest: ['dino_meat'], metabolism: 0.006, depth: [30, 200], hover: 2.6, noEmerge: true, lie: 1,
    smell: 28, keepFar: 36,
  };
  static attacks = [
    { id: 'dive', range: [0, 7], arc: 0.8, tell: 0.55, dur: 0.9, hitAt: 0.05, rec: 0.7, cd: [2, 3.2], w: 1, root: false,
      start() { this.sound('screech', { pitch: rand(0.9, 1.1) }); },
      tick(A, dt) {
        const t = this.targetPos(A);
        if (A.phase === 'tell') this.steer(this.pos.x, Math.max(this.pos.y, t.y + 1.6), this.pos.z, 1, 3, dt);
        else if (A.phase === 'go') { this.steer(t.x, t.y + 0.1, t.z, 7.5, 6, dt); this.diving = true; }
        else { this.diving = false; this.steer(this.pos.x, t.y + 2.5, this.pos.z, 3, 3, dt); }
      },
      hit(A) { return A.t > 0.85 || this.strikeAt(A, this.reachPoint(0.25, 0), 0.4, { dmg: this.info.dmg, push: 3, up: 1, kind: 'bite' }); },
      done() { this.diving = false; } },
  ];

  constructor(mgr, o) {
    super(mgr, o);
    this.rad = 0.25; this.hw = 0.25; this.h = 0.4; this.cy = 0; this.hitR = 0.36;
    this.mass = 1.2; this.kb = 3;
    this.size = rand(0.95, 1.08);
    const G = this.G = mgr.geo('ptero', () => buildPtero());
    this.hitCol = G.hide;
    this.mat = this.material({});
    this.eyeMat = this.material({ emissive: 0.5, rimK: 0 });
    this.bodyG = this.group3(this.root);
    this.part(G.body, this.mat, this.bodyG);
    this.neck = this.group3(this.bodyG, 0, 2.5 * VS, 6 * VS);
    this.part(G.head, this.mat, this.neck);
    this.eyes = this.part(G.eyes, this.eyeMat, this.neck, 0, 1.5 * VS, 0);
    this.headObj = this.neck; this.headTop = 3 * VS; this.headFwd = 4 * VS;
    this.wings = [1, -1].map((sd) => { const g = this.group3(this.bodyG, sd * 2 * VS, 1 * VS, 1.5 * VS); const w = this.part(G.wing, this.mat, g); if (sd < 0) w.scale.x = -1; return g; });
    this.legs2 = [1, -1].map((sd) => { const g = this.group3(this.bodyG, sd * 1.2 * VS, -1.5 * VS, -3 * VS); this.part(G.leg, this.mat, g); return g; });
    this.orbitA = Math.random() * Math.PI * 2; this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    this.floorT = 0; this.floor = 2; this.ceil = 3;
    this.flapT = 0; this.landed = false;
    this.awake = true;
  }

  /** Beast steering → gliding: hold a cruising height between floor and roof, circle. */
  push(vx, vz, accel, dt) {
    const k = Math.min(1, accel * dt * 0.6);
    this.vel.x += (vx - this.vel.x) * k;
    this.vel.z += (vz - this.vel.z) * k;
  }
  move(dt) {
    this.floorT -= dt;
    if (this.floorT <= 0) { this.floorT = 0.25; this.floor = airBelow(this.w, this.pos.x, this.pos.y, this.pos.z, 5); this.ceil = airAbove(this.w, this.pos.x, this.pos.y, this.pos.z, 5); }
    const eating = this.mode === 'eat' && this.meal && Math.hypot(this.meal.pos.x - this.pos.x, this.meal.pos.z - this.pos.z) < 0.6;
    this.landed = eating || this.asleep;
    if (!this.atk) {
      const cruise = this.landed ? 0.25 : clamp((this.floor + this.ceil) * 0.55, 1.2, 3.4);
      this.vel.y += ((cruise - this.floor) * 1.6 - this.vel.y) * Math.min(1, dt * 2);
      // soar in wide circles when idling
      if (!this.landed && (this.mode === 'idle' || this.mode === 'roam' || this.mode === 'fight')) {
        this.orbitA += dt * 0.6 * this.orbitDir;
        const c = this.mode === 'fight' ? this.mgr.pc : this.home, r = this.mode === 'fight' ? 3.5 : 4;
        this.steer(c.x + Math.cos(this.orbitA) * r, this.pos.y, c.z + Math.sin(this.orbitA) * r, this.I.walk, 1.5, dt);
      }
    }
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.3 && !this.landed) this.yaw += clamp(((Math.atan2(this.vel.x, this.vel.z) - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -dt * 4, dt * 4);
    super.move(dt);
  }

  onNotice() { this.sound('screech', { pitch: 0.9 }); }
  onTaunt() { if (Math.random() < 0.5) this.sound('screech', { pitch: rand(0.8, 1), vol: 0.6 }); }
  onHit() { this.sound('screech', { pitch: 1.4 }); }

  animate(dt) {
    const t = this.t;
    let flap = 0, fold = 0;
    if (this.landed) fold = 0.9;
    else if (this.diving) fold = 0.75;
    else { this.flapT += dt * (this.vel.y > 0.3 ? 9 : 4); flap = Math.sin(this.flapT) * (this.vel.y > 0.3 ? 0.7 : 0.25); if (Math.sin(this.flapT) > 0.97 && this.dist < 14 && this.vel.y > 0.3) this.sound('flap', { vol: 0.4 }); }
    if (this.atk?.phase === 'tell') fold = 0.3 * clamp(this.atk.t / this.atk.a.tell, 0, 1);
    this.foldK = (this.foldK ?? 0) + (fold - (this.foldK ?? 0)) * Math.min(1, dt * 8);
    this.wings.forEach((g, i) => { const sd = i ? -1 : 1; g.rotation.set(0, sd * this.foldK * 1.2, sd * (flap + this.foldK * 0.4)); });
    this.bodyG.rotation.x = this.diving ? 0.6 : this.landed ? -0.3 : clamp(-this.vel.y * 0.12, -0.4, 0.4);
    this.bodyG.rotation.z = clamp(-(this.orbitDir * 0.3), -0.4, 0.4) * (this.landed ? 0 : 1);
    this.legs2.forEach((g) => { g.rotation.x = this.landed ? 0.2 : 1.2; });
    if (this.headDown > 0.3) this.neck.rotation.x += (1 - this.neck.rotation.x) * Math.min(1, dt * 6);
    else look(this.neck, this.mode === 'fight' || this.atk ? this.mgr.eye : this.lookAt, dt, { yaw: 0.7, pitch: 0.6, rate: 6 });
    this.eyes.geometry = this.mode === 'fight' || this.atk ? this.G.angry : this.G.eyes;
  }
  deathFx() { this.sound('screech', { pitch: 0.8, vol: 0.8 }); for (let i = 0; i < 8; i++) this.fx.spawn({ x: this.center.x, y: this.center.y, z: this.center.z, vx: rand(-1, 1), vy: rand(0, 1), vz: rand(-1, 1), life: rand(1.2, 2), size: 0.025, color: [0.85, 0.55, 0.35], drag: 2, grav: 0.6 }); }
}
