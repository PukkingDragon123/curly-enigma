// Cave Drake: a wingless-at-heart cave dragon of the deep zones — four clawed legs that really
// step, a long neck, a spiked tail, leathery wings it keeps folded until it roars or hops a ledge.
// Magma drakes are soot and ember (their throats glow), frost drakes ice-blue, void drakes violet.
// It sleeps curled on a hoard nest (with eggs) and hunts kobolds, critters and young dinosaurs.
//   bite    the head draws back, jaws open, then a snap (yellow: block or parry)
//   tail    it twists and lashes its tail at whatever is beside or behind it (yellow)
//   breath  it rears and inhales, chest glowing brighter… then a cone of fire (red: a guard only
//           takes the edge off — get out of the cone)
import * as THREE from 'three';
import { Beast } from './beast.js';
import { Legs, Chain, look } from './rig.js';
import { VB, VS, mul, mix, c01 } from './vox.js';
import { puff, sparkle } from './fx.js';
import { rand, clamp } from '../../core/util.js';
import { clearLine } from './physics.js';

const LOOKS = {
  4: { s: [0x4a1a14, 0x6e2618, 0x94381e, 0xc0562a], belly: [0xd8803a, 0xf0b060], horn: 0x2a2220, mem: [0x5a1a12, 0x8a2e1a], eye: 0xffd040, fire: [[1, 0.85, 0.3], [1, 0.45, 0.1], [0.6, 0.15, 0.05]], light: [1.6, 0.6, 0.18], glow: 0xff7a1a },
  5: { s: [0x2e4a6a, 0x46688e, 0x6a90b8, 0x96b8dc], belly: [0xa8c8e0, 0xe0f0ff], horn: 0xe0eef8, mem: [0x2a4a6a, 0x4a7aa0], eye: 0x9affff, fire: [[0.85, 1, 1], [0.5, 0.85, 1], [0.25, 0.45, 0.8]], light: [0.6, 1.1, 1.6], glow: 0x9ae8ff },
  6: { s: [0x2e1a44, 0x46285e, 0x62387e, 0x844aa4], belly: [0x7a4aa0, 0xb07ae0], horn: 0x1a1220, mem: [0x3a1a5a, 0x6a2e9a], eye: 0xff8aff, fire: [[1, 0.8, 1], [0.8, 0.4, 1], [0.4, 0.15, 0.6]], light: [1.2, 0.6, 1.7], glow: 0xd07aff },
};
const lookFor = (z) => LOOKS[z >= 6 ? 6 : z >= 5 ? 5 : 4];
const HIP = 11;

export function buildDrake(zone) {
  const L = lookFor(zone), S = L.s;
  const sc = (vb, k0 = 0.35) => (x, y, z, nx, ny, nz) => {
    if (typeof ny !== 'number') { ny = 0; nz = 0; }
    const n = vb.n(x, y, z);
    if (ny < -0.45) return (z & 1) ? L.belly[0] : L.belly[1]; // belly plates
    const k = clamp(k0 + ny * 0.45 + (n - 0.5) * 0.3, 0, 0.999);
    return ((x + y + z) & 3) === 0 && n < 0.5 ? mul(S[Math.floor(k * 4)], 0.85) : S[Math.floor(k * 4)];
  };
  const body = new VB(101), bs = sc(body);
  body.ell(0, 0, -0.5, 6.4, 5.8, 8.4, bs);
  body.ell(0, 1, 5, 5.6, 5.4, 4.6, bs); // chest
  for (let z = -8; z <= 8; z += 2) { const h = body.hitFrom(0, 12, z, 0, -1, 0); if (h) body.cap(0, h[1], z, 0, h[1] + 2.5 - Math.abs(z) * 0.12, z - 1.4, 0.7, L.horn); } // spine ridge
  const glow = new VB(102);
  // a glowing throat seam under the chest
  for (let z = 3; z <= 10; z++) { const h = body.hitFrom(0, -10, z, 0, 1, 0); if (h) { body.del(...h); glow.set(h[0], h[1], h[2], z % 3 ? L.glow : 0xffffff); } }
  // neck segments and head (pivots at their base, pointing +z)
  const neck = new VB(103); neck.cap(0, 0, 0, 0, 1, 4.2, 3.2, sc(neck, 0.4));
  for (let z = 1; z <= 4; z += 2) neck.set(0, 3 + Math.round(z * 0.2), z, L.horn);
  const head = new VB(104), hs = sc(head, 0.45);
  head.ell(0, 1.4, 1.6, 4.6, 4, 4.6, hs);
  head.ell(0, 0.4, 6, 3.3, 2.4, 3.6, hs); // snout
  for (const sd of [1, -1]) {
    head.cap(sd * 2.8 - (sd < 0 ? 1 : 0), 4.2, 0, sd * 4.4 - (sd < 0 ? 1 : 0), 8, -4.5, 1.1, (x, y, z, t) => (t > 0.7 ? mix(L.horn, 0xffffff, 0.3) : L.horn));
    head.cap(sd * 4 - (sd < 0 ? 1 : 0), 1, -1, sd * 6 - (sd < 0 ? 1 : 0), 1.6, -3.4, 0.7, L.horn); // cheek spikes
  }
  head.set(-2, 1, 9, 0x140a08); head.set(1, 1, 9, 0x140a08); head.set(-2, 1, 10, 0x140a08); head.set(1, 1, 10, 0x140a08); // nostrils
  const eyeAt = [];
  for (const sd of [1, -1]) { const h = head.hitFrom(sd * 2.4 - (sd < 0 ? 1 : 0), 2.6, 14, sd * -0.15, 0, -1); if (h) { eyeAt.push(h); head.set(...h, 0x100808); } }
  const jaw = new VB(105);
  jaw.ell(0, -0.8, 4.5, 2.3, 1, 3.6, (x, y, z, nx, ny) => (ny < -0.2 ? L.belly[0] : S[1]));
  for (let z = 2; z <= 8; z += 2) for (const sd of [1, -1]) jaw.set(sd > 0 ? 1 : -2, 0, z, 0xfff4e0);
  const eyes = new VB(), angry = new VB();
  for (const [vb, mad] of [[eyes, false], [angry, true]]) for (const [ex, ey, ez] of eyeAt) {
    const sd = ex > 0 ? 1 : -1;
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) vb.set(ex + dx * sd, ey + dy, ez + 1, dy === 1 && dx === 0 ? (mad ? -1 : 0xffffff) : dy === 0 && dx === 1 ? 0x100808 : L.eye);
  }
  // legs
  const thigh = new VB(106); thigh.cap(0, 0, 0, 0, -6.5, 0, 2.8, sc(thigh, 0.45));
  const shin = new VB(107); shin.cap(0, 0, 0, 0, -6.5, 0, 2.1, sc(shin, 0.3));
  const foot = new VB(108); foot.ell(0, 0.8, 1, 2.2, 1.2, 2.6, S[1]);
  for (const x of [-2, 0, 2]) { foot.set(x, 0, 4, L.horn); foot.set(x, 0, 5, 0xf0e8e0); }
  // tail segments (pivot at the base, pointing -z), the last with a spade of spikes
  const tail = [0, 1, 2, 3].map((i) => {
    const t = new VB(109 + i), r = 3 - i * 0.6;
    t.cap(0, 0, 0, 0, -0.3, -5.5, r, sc(t, 0.35));
    t.cap(0, r, -1, 0, r + 1.6 - i * 0.2, -2.6, 0.55, L.horn);
    if (i === 3) for (const sd of [1, -1]) t.cap(0, 0, -5, sd * 2.5, 0, -8, 0.7, L.horn);
    return t;
  });
  // a wing (pivot at the shoulder; the arm runs out along +x, the membrane hangs below it)
  const wing = new VB(113);
  const fingers = [[16, -2, -6], [13, -6, -9], [9, -8, -10]];
  wing.cap(0, 0, 0, 8, 1, -1, 1.1, S[2]); wing.cap(8, 1, -1, 15, 2, -3, 0.9, S[2]);
  for (const [fx, fy, fz] of fingers) wing.cap(15, 2, -3, fx, fy, fz, 0.6, S[1]);
  // membrane: fill between the arm and the fingers, ragged at the edge
  for (let x = 1; x <= 16; x++) for (let z = -10; z <= -1; z++) {
    const t = x / 16, top = -1 - t * 2;
    if (z > top) continue;
    const reach = -2 - t * 8 + (x > 14 ? (x - 14) * 2 : 0);
    if (z < reach) continue;
    if (wing.n(x, 0, z) < 0.07) continue; // tatters
    const y = Math.round(t * 1.5 - (top - z) * 0.35);
    if (!wing.has(x, y, z)) wing.set(x, y, z, (x + z) % 5 === 0 ? L.mem[1] : L.mem[0]);
  }
  return {
    body: body.geo(0, 0, 0), glow: glow.size ? glow.geo(0, 0, 0) : null, neck: neck.geo(0, 0, 0), head: head.geo(0, 0, 0), jaw: jaw.geo(0, 0, 0),
    eyes: eyes.geo(0, 2.6, 0), angry: angry.geo(0, 2.6, 0), thigh: thigh.geo(0, 0, 0), shin: shin.geo(0, 0, 0), foot: foot.geo(0, 0, 0),
    tail: tail.map((t) => t.geo(0, 0, 0)), wing: wing.geo(0, 0, 0), hide: c01(S[2]), fire: L.fire, light: L.light,
  };
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Drake extends Beast {
  static info = {
    id: 'cave_drake', name: 'Cave Drake', color: '#ff8a4a', hits: 9, dmg: 7, poise: 3, tier: 4, flesh: true, snd: 'flesh', lavaProof: true,
    diet: 'hunt', social: 'solo', aggro: 'territorial', territory: 11, sleepy: 0.6, sight: 13, hear: 1, deep: 2, walk: 1.2, run: 3.2,
    turn: 3, accel: 6, keep: 3.2, close: 1.6, agile: true, jump: 5.5, space: [0.5, 1.4], prey: ['critter', 'kobold', 'shellback', 'raptor'],
    wakeR: 3, snore: 'big_snore', snorePitch: 1.2, harvest: ['drake_scale'], metabolism: 0.003, depth: [92, 210], lie: 1, patience: 12, keepFar: 34,
  };
  static attacks = [
    { id: 'bite', range: [0, 2.1], arc: 0.6, tell: 0.55, dur: 0.3, hitAt: 0.08, rec: 0.55, cd: [1.2, 2], w: 2.4,
      start() { this.sound('snarl', { pitch: 1.1 }); },
      go() { this.vel.x += Math.sin(this.yaw) * 2.6; this.vel.z += Math.cos(this.yaw) * 2.6; this.sound('chomp', {}); },
      hit(A) { return this.strikeAt(A, this.mouthPos(_v), 0.42, { dmg: this.info.dmg, push: 3.4, kind: 'bite' }); } },
    { id: 'tail', range: [0, 2.4], arc: Math.PI, tell: 0.6, dur: 0.4, hitAt: 0.12, rec: 0.6, cd: [1.6, 2.6], w: 1.2,
      when(e) { const t = e.mgr.pc; return Math.abs(Math.atan2(t.x - e.pos.x, t.z - e.pos.z) - e.yaw) > 1.1; },
      start() { this.sound('growl', { pitch: 1.2, dur: 0.5 }); },
      hit(A) { this.tailTip(_w); return this.strikeAt(A, _w, 0.7, { dmg: this.info.dmg * 0.9, push: 5, up: 2.2, kind: 'tail' }); } },
    { id: 'breath', range: [1.8, 6.5], arc: 0.45, tell: 1.0, dur: 1.1, rec: 0.8, cd: [4, 6], w: 1.6, heavy: true,
      when(e) { return e.sees; },
      start() { this.sound('inhale', { dur: 0.95 }); },
      tick(A, dt) { if (A.phase === 'go') this.breathe(A, dt); else if (A.phase === 'tell') this.faceTarget(A, 2, dt); },
      go() { this.sound('fire_breath', { dur: 1.1 }); } },
  ];
  static nestStyle = (zone) => ({ style: 'hoard', r: 1.1, eggs: 2, eggR: 4, item: 'drake_egg', eggCols: zone >= 6 ? [0x2a1438, 0x6a3a9a, 0xb07ae0] : zone >= 5 ? [0x3a5a7a, 0x8ab8e0, 0xe0f4ff] : [0x3a1410, 0x8a2e1a, 0xe0703a] });
  /** A roost: the drake curls up on a hoard of glinting ore with eggs. */
  static roost(m, e) {
    const st = Drake.nestStyle(e.zone);
    const n = m.eco.addNest({ x: e.pos.x - Math.sin(e.yaw) * 0.6, y: e.pos.y, z: e.pos.z - Math.cos(e.yaw) * 0.6, kind: e.kind, ...st });
    e.nest = n;
    m.spawner.register(n, `roost:${Math.round(n.x)},${Math.round(n.z)}`, 'drake_roost', e.zone, [e]);
  }

  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.42; this.h = 1.1; this.cy = 0.6; this.hitR = 0.55;
    this.mass = 6; this.kb = 1.6;
    this.size = rand(0.95, 1.1);
    this.step = 0.32; this.friction = 10;
    this.springK = 140; this.springC = 10; this.sqScale = 0.4;
    const z = this.zone >= 6 ? 6 : this.zone >= 5 ? 5 : 4;
    const G = this.G = mgr.geo('drake|' + z, () => buildDrake(z));
    this.hitCol = G.hide;
    this.mat = this.material({});
    this.memMat = this.material({});
    this.eyeMat = this.material({ emissive: 1.3, rimK: 0 });
    this.glowMat = this.material({ emissive: 1 });
    this.hips = this.group3(this.root, 0, HIP * VS, 0);
    this.bodyG = this.group3(this.hips);
    this.part(G.body, this.mat, this.bodyG);
    if (G.glow) this.part(G.glow, this.glowMat, this.bodyG);
    // neck: two segments, then the head
    this.necks = [];
    let p = this.group3(this.bodyG, 0, 2.5 * VS, 8.5 * VS);
    this.part(G.neck, this.mat, p); this.necks.push(p);
    p = this.group3(p, 0, 1 * VS, 4.2 * VS); this.part(G.neck, this.mat, p); this.necks.push(p);
    this.head = this.group3(p, 0, 1 * VS, 4.2 * VS);
    this.part(G.head, this.mat, this.head);
    this.jaw = this.group3(this.head, 0, 0, 2 * VS);
    this.part(G.jaw, this.mat, this.jaw);
    this.eyes = this.part(G.eyes, this.eyeMat, this.head, 0, 2.6 * VS, 0);
    this.headObj = this.head; this.headTop = 4 * VS; this.headFwd = 3 * VS;
    // tail
    let tp = this.group3(this.bodyG, 0, 0, -8 * VS);
    this.tail = G.tail.map((g, i) => { const s = i ? this.group3(tp, 0, -0.3 * VS, -5.3 * VS) : tp; this.part(g, this.mat, s); tp = s; return s; });
    this.tailChain = new Chain(this.tail, { sway: 0.16, swayHz: 3, lag: 0.2, droop: 0.06 });
    // wings, folded along the back
    this.wings = [1, -1].map((sd) => { const w = this.group3(this.bodyG, sd * 4.5 * VS, 4 * VS, 4 * VS); const m = this.part(G.wing, this.memMat, w); if (sd < 0) m.scale.x = -1; return w; });
    // four legs, trotting in diagonal pairs
    const defs = [];
    for (const [front, sd] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const thigh = this.part(G.thigh, this.mat, this.bodyG), shin = this.part(G.shin, this.mat, this.bodyG);
      const foot3 = this.part(G.foot, this.mat, this.root);
      defs.push({ parent: this.bodyG, hip: [sd * 4.6 * VS, -2 * VS, front * 6 * VS], l1: 6.5 * VS, l2: 6.5 * VS, thigh, shin, foot3, knee: [0, 0, front > 0 ? -1 : 1], rest: [sd * 0.28, front * 0.28], group: (front > 0) === (sd > 0) ? 0 : 1, lift: 0.1 });
    }
    this.legs = new Legs(this, defs, { stride: 0.32, stepT: 0.24, lead: 0.18, onStep: (L, k) => { if (this.dist < 10) { this.sound('step', { vol: 0.2 }); if (k > 0.6) this.fx.dust(L.foot.x, L.foot.y + 0.03, L.foot.z, 2, this.mgr.dustCol(this.pos), 0.08); } } });
    this.wingK = 0; this.rearK = 0; this.jawK = 0; this.glowK = 0; this.whip = 0;
    this.burnT = 0;
    if (this.asleep) this.restK = 1;
  }

  mouthPos(out) { this.head.updateWorldMatrix(true, false); return this.head.localToWorld(out.set(0, 0.5 * VS, 8 * VS)); }
  tailTip(out) { const t = this.tail[this.tail.length - 1]; t.updateWorldMatrix(true, false); return t.localToWorld(out.set(0, 0, -5 * VS)); }

  /** Fire: a cone of flame particles; the mole in the cone burns (a guard only takes the edge off). */
  breathe(A, dt) {
    const m = this.mgr, mouth = this.mouthPos(_v);
    this.head.updateWorldMatrix(true, false);
    const d = _w.set(0, -0.15, 1).applyQuaternion(this.head.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const F = this.G.fire;
    for (let i = 0; i < 6; i++) {
      const sp = rand(4, 7), j = 0.22;
      const vx = (d.x + rand(-j, j)) * sp, vy = (d.y + rand(-j, j * 0.6)) * sp, vz = (d.z + rand(-j, j)) * sp;
      m.fx.spawn({ x: mouth.x, y: mouth.y, z: mouth.z, vx, vy, vz, life: rand(0.35, 0.6), size: rand(0.05, 0.1), grow: 0.25, color: F[i % 3], glow: true, drag: 1.6, grav: -1.5 });
    }
    if (Math.random() < dt * 20) m.fx.spawn({ x: mouth.x, y: mouth.y, z: mouth.z, vx: d.x * 3, vy: d.y * 3 + 0.5, vz: d.z * 3, life: 1, size: 0.12, grow: 0.3, color: [0.2, 0.17, 0.16], alpha: 0.5, drag: 1.5, grav: -0.4 });
    // the cone: 6 m, ~28°
    if (A.target !== 'player') return;
    const pc = m.pc, px = pc.x - mouth.x, py = pc.y - mouth.y, pz = pc.z - mouth.z, l = Math.hypot(px, py, pz) || 1;
    this.burnT -= dt;
    if (l < 6.2 && (px * d.x + py * d.y + pz * d.z) / l > 0.88 && this.burnT <= 0 && clearLine(this.w, mouth.x, mouth.y, mouth.z, pc.x, pc.y, pc.z)) {
      this.burnT = 0.3;
      this.hurtPlayer(this.info.dmg * 0.45, [px / l * 1.2, 0.3, pz / l * 1.2], 'fire', { heavy: true, noParry: true, from: [mouth.x, mouth.y, mouth.z] });
      this.mgr.say('drake_fire', 'Fire! Get <b>out of the cone</b>: your guard only takes the edge off.', 'bad', 60);
    }
  }

  // ------------------------------------------------------------------ behaviour flavour
  onNotice() { this.sound('roar_big', { pitch: 1.6, vol: 0.85 }); this.flareT = 1.2; }
  onWake() { this.sound('snarl', {}); this.flareT = 0.8; }
  onTaunt() { if (Math.random() < 0.4) { this.sound('snarl', { pitch: rand(0.9, 1.1), vol: 0.8 }); this.jawOpen = 0.6; } }
  onHit() { this.sound('snarl', { pitch: 1.3 }); }

  // ------------------------------------------------------------------ body
  animate(dt) {
    const A = this.atk, t = this.t, sp = Math.hypot(this.vel.x, this.vel.z);
    this.legs.update(dt);
    let wing = this.grounded ? 0 : 1, rear = 0, jaw = 0.05, glow = 0.2 + Math.sin(t * 2) * 0.1, neckUp = 0, whip = 0;
    this.flareT = Math.max(0, (this.flareT || 0) - dt);
    if (this.flareT > 0) { wing = 1; rear = 0.25; jaw = 0.5; }
    if (A) {
      const k = A.phase === 'tell' ? clamp(A.t / A.a.tell, 0, 1) : 0;
      if (A.a.id === 'bite') { if (A.phase === 'tell') { neckUp = -0.5 * k; jaw = 0.6 * k; } else if (A.phase === 'go') { neckUp = 0.35; jaw = 0.6 - 0.6 * clamp(A.t / 0.1, 0, 1); } }
      if (A.a.id === 'tail') { if (A.phase === 'tell') whip = -0.9 * k; else if (A.phase === 'go') whip = -0.9 + 2.6 * clamp(A.t / 0.2, 0, 1); }
      if (A.a.id === 'breath') {
        if (A.phase === 'tell') { rear = 0.35 * k; neckUp = -0.5 * k; glow = 0.3 + 2.2 * k; wing = 0.6 * k; jaw = 0.15 * k; }
        else if (A.phase === 'go') { rear = 0.2; neckUp = 0.1; jaw = 0.8; glow = 2.5; wing = 0.6; }
      }
    }
    const kk = Math.min(1, dt * 10);
    this.wingK += (wing - this.wingK) * Math.min(1, dt * 6);
    this.rearK += (rear - this.rearK) * kk; this.jawK += (jaw - this.jawK) * kk; this.glowK += (glow - this.glowK) * kk;
    this.whip += (whip - this.whip) * Math.min(1, dt * 14);
    // wings: folded along the back ↔ spread wide, flapping when spread
    const w = this.wingK, flap = w > 0.5 ? Math.sin(t * 9) * 0.35 * w : 0;
    this.wings.forEach((g, i) => { const sd = i ? -1 : 1; g.rotation.set(-0.2 * (1 - w), sd * (1.3 * (1 - w) + 0.1), sd * (-0.25 + 0.7 * w + flap)); });
    if (w > 0.5 && Math.sin(t * 9) > 0.95 && this.dist < 14) this.sound('flap', { vol: 0.5 });
    const rest = this.restK;
    this.bodyG.rotation.x = -this.rearK + Math.sin(t * 2) * 0.015;
    this.hips.position.y = (HIP - rest * 5) * VS + Math.abs(Math.sin(t * (4 + sp * 3))) * 0.4 * VS * clamp(sp, 0, 1);
    // neck and head: curled round when asleep, toward the mole / what it watches when awake
    if (rest > 0.5) { this.necks[0].rotation.set(0.5, 0.6, 0); this.necks[1].rotation.set(0.4, 0.7, 0); this.head.rotation.set(0.2, 0.4, 0.3); }
    else {
      this.necks[0].rotation.set(-0.25 + neckUp * 0.5, 0, 0);
      this.necks[1].rotation.set(-0.1 + neckUp * 0.5, 0, 0);
      if (this.headDown > 0.3) this.head.rotation.x += (0.9 - this.head.rotation.x) * Math.min(1, dt * 5);
      else look(this.head, this.mode === 'fight' || A ? this.mgr.eye : this.lookAt, dt, { yaw: 0.9, pitch: 0.6, rate: 6, basePitch: 0.35 + neckUp * 0.5 });
    }
    this.jawOpen = Math.max(0, (this.jawOpen || 0) - dt * 2);
    this.jaw.rotation.x = this.jawK + this.jawOpen * 0.5;
    this.tailChain.update(dt, this, { yaw: this.whip * 1.6 });
    this.glowMat.uniforms.emissive.value = 0.6 + this.glowK;
    this.eyes.geometry = this.mode === 'fight' || A ? this.G.angry : this.G.eyes;
    this.eyeOpen = this.asleep ? 0 : 1;
    // smoke curling from the nostrils
    if (this.dist < 12 && Math.random() < dt * (this.asleep ? 1.5 : 3)) {
      const p = this.mouthPos(_v);
      this.fx.spawn({ x: p.x, y: p.y + 0.03, z: p.z, vx: rand(-0.1, 0.1), vy: 0.35, vz: rand(-0.1, 0.1), life: 1.2, size: 0.03, grow: 0.08, color: [0.25, 0.22, 0.22], alpha: 0.5, drag: 1 });
    }
  }

  light() {
    if (this.dist > 20) return null;
    const c = this.G.light, k = 0.25 + this.glowK * 0.5;
    const p = this.atk?.a.id === 'breath' ? this.mouthPos(_v) : this.center;
    return { x: p.x, y: p.y, z: p.z, c: [c[0] * k, c[1] * k, c[2] * k], r: this.atk?.phase === 'go' ? 5 : 2.4 };
  }

  deathFx() {
    const c = this.center;
    this.sound('roar_big', { pitch: 1.8, vol: 0.7 });
    sparkle(this.fx, c.x, c.y, c.z, 14, this.G.fire[1], 2.2, 2, 0.02, 0.8);
    puff(this.fx, c.x, c.y, c.z, 10, [0.25, 0.22, 0.22], 0.4, 0.5, 0.1, 0.6);
  }
}
