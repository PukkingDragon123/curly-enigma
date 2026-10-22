// Kobold Miners: scaly little dog-folk who mine the upper caves in bands of two to four, a candle
// on every dented helmet and a lantern swinging from one paw (their light gives them away long
// before you see them). They chip at the walls, chatter, nibble mushrooms and pick at carcasses;
// they hunt dust bunnies. When they spot the mole the whole band yips and spreads out around it;
// one at a time they hop in with a pick swing (block it, or parry it in time and they reel), the
// others throw stones. Lose the chief or half the band and the rest scatter.
import * as THREE from 'three';
import { Beast } from './beast.js';
import { Legs, Chain, look } from './rig.js';
import { VB, mul, mix, c01 } from './vox.js';
import { sparkle, puff, pebbles } from './fx.js';
import { rand, clamp } from '../../core/util.js';

const KV = 1 / 40; // meters per kobold voxel (finer than the other creatures: they're small)
const HIP = 7.8;

const PAL = {
  1: { s: [0x8a3a1e, 0xb8562a, 0xd8783a, 0xf0a060], belly: 0xf0c890, eye: 0xffe24a },
  3: { s: [0x3a3a52, 0x52546e, 0x6e7290, 0x9aa0bc], belly: 0xc8c0b0, eye: 0x9affd0 },
  5: { s: [0x4a4e5a, 0x6a7080, 0x8e96a8, 0xc0c8d8], belly: 0xe0e4ec, eye: 0x9ad8ff },
};
const palFor = (z) => PAL[z >= 5 ? 5 : z >= 3 ? 3 : 1];

export const EYE_Y = 5.4; // eye height in the head (kobold voxels)

export function buildKobold(zone, chief = false) {
  const P = palFor(zone);
  const S = P.s;
  // shading for ell (x, y, z, nx, ny, nz) and cap (x, y, z, t) fills alike
  const sc = (vb, k0 = 0.35) => (x, y, z, nx, ny, nz) => {
    if (typeof ny !== 'number') { ny = 0; nz = 0; }
    const n = vb.n(x, y, z);
    const k = clamp(k0 + ny * 0.42 + (nz || 0) * 0.08 + (n - 0.5) * 0.3, 0, 0.999);
    // a scale pattern: darker scale edges in staggered rows
    if (((x + (y & 1) * 2 + z * 3) & 3) === 0 && n < 0.55) return mul(S[Math.floor(k * 4)], 0.84);
    return S[Math.floor(k * 4)];
  };
  // ---------------- head (pivot at the neck)
  const head = new VB(31), hs = sc(head, 0.45);
  head.ell(0, 5, -0.6, 4.3, 3.8, 4.1, hs); // cranium
  head.ell(0, 3.8, 3.6, 2.8, 2.3, 3.7, hs); // muzzle
  head.ell(0, 4.5, 6.8, 1.7, 1.3, 1.1, (x, y, z, nx, ny) => (ny > 0.3 ? S[2] : S[1])); // nose
  head.set(-2, 5, 7, 0x2a1410); head.set(1, 5, 7, 0x2a1410); // nostrils
  head.paint((x, y, z, c) => (y <= 2 && z > 1 ? P.belly : undefined)); // pale chin
  // eye sockets, brows
  const eyeAt = [];
  for (const sd of [1, -1]) {
    const h = head.hitFrom(sd * 3.2 - (sd < 0 ? 1 : 0), EYE_Y, 12, -sd * 0.12, 0, -1);
    if (!h) continue;
    eyeAt.push(h);
    head.set(h[0], h[1], h[2], 0x2a1410);
    for (let i = -1; i <= 1; i++) { const b = head.hitFrom(h[0] + i, EYE_Y + 2, h[2] + 6, 0, 0, -1); if (b) head.set(b[0], b[1], b[2] + 1, mul(S[0], 0.9)); }
  }
  // ear frills: membrane fans with dark spines, sweeping back
  for (const sd of [1, -1]) {
    const X = (x) => (sd > 0 ? x : -1 - x);
    for (let i = 0; i < 4; i++) for (let j = -1; j <= Math.min(2, i); j++) {
      const spine = j === Math.min(2, i) || i === 3;
      for (const w of [0, 1]) head.set(X(4 + Math.floor(i * 0.6) + w), 4 + j, -1 - i, spine ? S[0] : i % 2 ? 0xff8a4a : 0xffa860);
    }
  }
  // helmet: a dented iron dome, a brim, rivets, a candle on top; little horns poke out of the sides
  const iron = chief ? [0x5a4422, 0x8a6a32, 0xb89040, 0xe8c868] : [0x34363e, 0x50545e, 0x747a86, 0x9ea4b0];
  head.ell(0, 7.3, -0.9, 4.5, 2.7, 4.4, (x, y, z, nx, ny) => (y < 7 ? -1 : iron[clamp(Math.floor(1.4 + ny * 2 + (head.n(x, y, z, 4) - 0.5) * 0.8), 0, 3)]));
  for (let a = 0; a < 36; a++) { const ang = (a / 36) * Math.PI * 2; for (const rr of [4.7, 5.3]) head.set(Math.round(Math.cos(ang) * rr - 0.5), 7, Math.round(Math.sin(ang) * rr - 0.9), rr > 5 ? iron[0] : a % 4 === 0 ? iron[3] : iron[1]); }
  for (let a = 0; a < 8; a++) { const ang = (a / 8) * Math.PI * 2 + 0.2; const h = head.hitFrom(Math.cos(ang) * 8 - 0.5, 8, Math.sin(ang) * 8 - 0.9, -Math.cos(ang), 0, -Math.sin(ang)); if (h) head.set(h[0], h[1], h[2], 0xd8d4c8); }
  head.set(1, 10, 1, iron[0]); head.set(2, 9, 1, iron[0]); // a dent
  for (const sd of [1, -1]) head.cap(sd * 4 - (sd < 0 ? 1 : 0), 8, -1.4, sd * 6 - (sd < 0 ? 1 : 0), 10.4, -3.2, 0.9, (x, y, z, t) => (t > 0.6 ? 0xf8f0dc : 0xc8b490));
  head.box(-2, 10, -2, 1, 10, 0, iron[1]); // candle cup
  head.box(-1, 11, -2, 0, 13, -1, (x, y) => (y === 13 ? 0xfffaf0 : 0xf0e4c8)); // candle
  head.set(-1, 12, -2, 0xe8d8b8); head.set(1, 11, -1, 0xf8f0e0); // a drip of wax
  if (chief) for (const sd of [1, -1]) head.ell(sd * 1.8 - 0.5, 8.2, 2.4, 1.2, 1.2, 0.8, (x, y, z, nx) => (Math.abs(nx) > 0.5 ? 0x2a2a30 : 0x8ae0ff)); // goggles up on the helmet
  // jaw (pivot at the hinge) with little teeth
  const jaw = new VB(32), js = sc(jaw, 0.2);
  jaw.ell(0, -0.7, 3, 2.5, 1.1, 3.3, js);
  jaw.paint((x, y, z) => (y < -0.5 ? P.belly : undefined));
  for (let z = 1; z <= 5; z += 2) for (const sd of [1, -1]) jaw.set(sd > 0 ? 1 : -2, 0, z, 0xfff4e0);
  // eyes (glowing, slit pupils) at the sockets
  const eyes = new VB(), angry = new VB();
  for (const [vb, mad] of [[eyes, false], [angry, true]]) for (const [ex, ey, ez] of eyeAt) {
    const sd = ex > 0 ? 1 : -1;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) {
      if (Math.abs(dz) + Math.abs(dy) === 2 && dy < 0) continue;
      vb.set(ex + dz * sd, ey + dy, ez + 1, dy === 1 ? (mad ? (dz === -sd ? -1 : mul(P.eye, 0.7)) : dz === -1 ? 0xffffff : P.eye) : dy === -1 ? mul(P.eye, 0.75) : P.eye);
    }
    vb.set(ex, ey, ez + 1, 0x1a1008); vb.set(ex, ey + 1, ez + 1, mad ? -1 : 0x1a1008); // slit pupil
  }
  // ---------------- torso (pivot at the hips): scales, a leather vest, a belt with a pouch
  const torso = new VB(33), ts = sc(torso, 0.35);
  torso.ell(0, 4.6, 0.3, 4.2, 4.8, 3.6, ts); // pot belly
  torso.ell(0, 8.8, 0, 3.9, 2.6, 3, ts); // chest and shoulders
  const vest = [0x5a3a20, 0x7a5030, 0x9a683c];
  torso.paint((x, y, z, c) => {
    if (z > 1.2 && Math.abs(x + 0.5) < 1.8 && y < 9) return y % 2 ? P.belly : mul(P.belly, 0.93); // belly scutes
    if (y >= 4 && y <= 10 && !(z > 0.6 && Math.abs(x + 0.5) < 2.4)) return vest[torso.n(x, y, z, 7) < 0.25 ? 0 : (y + x) % 4 ? 1 : 2];
    if (y === 3 || y === 2) return z > 2.2 && (x === 0 || x === -1) ? 0xe0b84a : 0x2a1a10; // belt + buckle
    return undefined;
  });
  for (const [x, y] of [[2, 6], [-3, 6], [2, 8], [-3, 8]]) { const h = torso.hitFrom(x, y, 8, 0, 0, -1); if (h) torso.set(h[0], h[1], h[2], 0xb89040); } // vest studs
  torso.ell(3.6, 2.6, 0.8, 1.3, 1.5, 1.3, (x, y, z, nx, ny) => (ny > 0.5 ? 0x4a2e18 : 0x6a4426)); // pouch
  torso.set(4, 3, 2, 0xe0b84a);
  // ---------------- tail segments
  const tailSeg = (r0, tip) => { const t = new VB(34); t.cap(0, 0, 0, 0, -0.4, -3.6, r0, (x, y, z) => (y > 0 ? S[2] : y < -r0 * 0.5 ? P.belly : S[1])); if (tip) t.set(0, 0, -4, S[0]); return t; };
  // ---------------- limbs (thigh/shin hang down from their joint; feet flat at the ankle)
  const thigh = new VB(35); thigh.cap(0, 0, 0, 0, -4.2, 0, 2.1, sc(thigh, 0.5));
  const shin = new VB(36); shin.cap(0, 0, 0, 0, -4.2, 0, 1.5, sc(shin, 0.3));
  const foot = new VB(37);
  foot.box(-2, 0, -1, 1, 1, 2, S[1]); foot.box(-2, 1, -1, 1, 2, 0, S[2]);
  for (const x of [-2, 0, 1]) { foot.set(x, 0, 3, S[0]); foot.set(x, 0, 4, 0xf4ecd8); }
  // arms: shoulder → elbow → paw (hanging, a little bent)
  const arm = new VB(38);
  arm.cap(0, 0, 0, 0, -3.4, -0.2, 1.6, sc(arm, 0.5));
  arm.cap(0, -3.4, -0.2, 0, -5.6, 1.6, 1.35, sc(arm, 0.3));
  arm.ell(0, -6, 2, 1.7, 1.5, 1.7, S[2]);
  for (const x of [-1, 0, 1]) arm.set(x, -7.2, 2.8, 0xf4ecd8);
  // a pick (in the right paw; handle along +y from the grip)
  const pick = new VB(39);
  pick.cap(0, -2, 0, 0, 10, 0, 0.8, (x, y, z) => (y % 4 === 0 ? 0x4a2e16 : 0x8a5a2e));
  pick.cap(0, 10, -5, 0, 10.4, 5.6, 1.1, (x, y, z, t) => (t < 0.12 || t > 0.88 ? 0xe8ecf4 : t < 0.3 || t > 0.7 ? 0xa0a6b0 : 0x6a7078));
  pick.box(-1, 9, -1, 0, 11, 0, 0x3e424a);
  // a lantern on a bail
  const lant = new VB(40), glass = new VB();
  const fr = chief ? 0x8a6a32 : 0x34363e, fr2 = chief ? 0xc89a4a : 0x5a5e68;
  lant.box(-2, -7, -2, 1, -7, 1, fr); lant.box(-2, -2, -2, 1, -2, 1, fr2); lant.box(-1, -1, -1, 0, -1, 0, fr);
  for (const [x, z] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) lant.box(x, -6, z, x, -3, z, fr);
  lant.set(-1, 0, 0, fr2); lant.set(0, 0, 0, fr2); lant.set(-1, 1, 0, fr2); lant.set(0, 1, 0, fr2);
  glass.box(-1, -6, -1, 0, -3, 0, (x, y, z) => (y === -5 || y === -4 ? 0xfff6c0 : 0xffb848));
  const flame = new VB(); flame.set(0, 0, 0, 0xfff0a0); flame.set(-1, 0, 0, 0xffc050); flame.set(0, 1, 0, 0xffa030); flame.set(-1, 1, -1, 0xff8020);
  const V = (vb, px = 0, py = 0, pz = 0) => vb.geo(px, py, pz, KV);
  return {
    head: V(head), jaw: V(jaw), eyes: V(eyes, 0, EYE_Y, 0), angry: V(angry, 0, EYE_Y, 0), torso: V(torso),
    tail: [tailSeg(1.6), tailSeg(1.15), tailSeg(0.75, true)].map((t) => V(t)), thigh: V(thigh), shin: V(shin), foot: V(foot), arm: V(arm),
    pick: V(pick), lant: V(lant), glass: V(glass), flame: V(flame),
    hide: c01(S[1]), light: chief ? [1.6, 0.95, 0.4] : [1.3, 0.75, 0.3],
  };
}

const _v = new THREE.Vector3();

export class Kobold extends Beast {
  static info = {
    id: 'kobold', name: 'Kobold Miner', color: '#e08a4a', hits: 1.6, dmg: 3, poise: 1, tier: 1, flesh: true, snd: 'flesh',
    diet: 'omni', social: 'band', aggro: 'hostile', morale: true, sleepy: 0.25, sight: 11, hear: 1.2, walk: 1.1, run: 2.7,
    turn: 7, accel: 10, keep: 2.4, close: 1.05, agile: true, jump: 3.8, space: [0.2, 0.9], prey: ['critter'], wakeR: 2.2,
    harvest: [], metabolism: 0.006, depth: [8, 60], lie: 1,
  };
  static attacks = [
    { id: 'swing', range: [0, 1.35], arc: 0.6, tell: 0.5, dur: 0.24, hitAt: 0.07, rec: 0.45, cd: [0.9, 1.6], w: 3,
      start() { this.sound('yip', { pitch: rand(1.1, 1.3) }); },
      tick(A, dt) { if (A.phase === 'go') this.push(Math.sin(this.yaw) * 1.6, Math.cos(this.yaw) * 1.6, 12, dt); },
      hit(A) { return this.strikeAt(A, this.reachPoint(0.25, 0.1), 0.3, { dmg: this.info.dmg, push: 2.6 }); } },
    { id: 'leap', range: [1.3, 2.8], arc: 0.5, tell: 0.45, dur: 0.45, hitAt: 0.05, rec: 0.55, cd: [1.4, 2.2], w: 1.5,
      start() { this.sound('yip', { pitch: 1.4, n: 1 }); },
      go(A) { const t = this.targetPos(A); const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz) || 1; const v = Math.min(5.5, Math.max(0, d - 0.42) / 0.42); this.vel.set(dx / d * v, 3.4, dz / d * v); this.sqv += 8; this.sound('whoosh', { vol: 0.4 }); },
      hit(A) { return A.t > 0.38 || this.strikeAt(A, this.reachPoint(0.2, 0.05), 0.32, { dmg: this.info.dmg * 1.2, push: 3 }); } },
    { id: 'throw', range: [3, 9], arc: 0.4, tell: 0.55, dur: 0.2, rec: 0.5, cd: [1.6, 2.8], w: 1.2, noPrey: true,
      when(e) { return e.sees; },
      go() { this.throwRock(); } },
  ];
  static nestStyle = null;

  /** The shared model for a zone; Enemies' prewarm builds it before a first sighting. */
  static warm(mgr, zone, chief = false) {
    const z = zone >= 5 ? 5 : zone >= 3 ? 3 : 1;
    return mgr.geo('kobold|' + z + '|' + (chief ? 1 : 0), () => buildKobold(z, chief));
  }
  constructor(mgr, o) {
    super(mgr, o);
    this.chief = !!o.chief;
    this.hw = 0.16; this.h = 0.7; this.cy = 0.42; this.hitR = 0.27;
    this.mass = 1.1; this.kb = 3;
    this.size = this.chief ? 1.18 : rand(0.92, 1.06);
    this.step = 0.2;
    this.springK = 260; this.springC = 10;
    const G = this.G = Kobold.warm(mgr, this.zone, this.chief);
    this.hitCol = G.hide;
    this.mat = this.material({});
    this.eyeMat = this.material({ emissive: 1.3, rimK: 0 });
    this.glowMat = this.material({ emissive: 1.6, rimK: 0 });
    // skeleton: hips → torso → neck → head (+jaw, eyes); arms at the shoulders; legs at the hips
    this.hips = this.group3(this.root, 0, HIP * KV, 0);
    this.torsoG = this.group3(this.hips);
    this.part(G.torso, this.mat, this.torsoG);
    this.neck = this.group3(this.torsoG, 0, 10 * KV, 0.6 * KV);
    this.headObj = this.neck; this.headTop = 10 * KV; this.headFwd = 1 * KV;
    this.part(G.head, this.mat, this.neck);
    this.jaw = this.group3(this.neck, 0, 2.9 * KV, 0.6 * KV);
    this.part(G.jaw, this.mat, this.jaw);
    this.eyes = this.part(G.eyes, this.eyeMat, this.neck, 0, EYE_Y * KV, 0);
    this.flame = this.part(G.flame, this.glowMat, this.neck, 0, 13 * KV, -1.5 * KV);
    this.shoulders = [1, -1].map((sd) => this.group3(this.torsoG, sd * 4.1 * KV, 9 * KV, 0.2 * KV));
    this.arms = this.shoulders.map((s, i) => { const a = this.part(G.arm, this.mat, s); if (i) a.scale.x = -1; return a; });
    this.hand = this.group3(this.shoulders[0], 0, -6 * KV, 2 * KV);
    this.pick = this.part(G.pick, this.mat, this.hand);
    this.lhand = this.group3(this.shoulders[1], 0, -6 * KV, 2 * KV);
    this.lantern = this.group3(this.lhand, 0, -0.5 * KV, 0);
    this.part(G.lant, this.mat, this.lantern);
    this.part(G.glass, this.glowMat, this.lantern);
    this.lantSwing = { a: 0, v: 0, b: 0, w: 0 };
    // tail
    let p = this.torsoG;
    this.tail = G.tail.map((g, i) => { const s = this.group3(p, 0, i ? -0.3 * KV : 2.5 * KV, i ? -3.6 * KV : -2.4 * KV); this.part(g, this.mat, s); p = s; return s; });
    this.tailChain = new Chain(this.tail, { sway: 0.22, swayHz: 6, lag: 0.12, droop: 0.15 });
    // legs (IK)
    const legDefs = [1, -1].map((sd, i) => {
      const thigh = this.part(G.thigh, this.mat, this.hips), shin = this.part(G.shin, this.mat, this.hips);
      const foot3 = this.part(G.foot, this.mat, this.root);
      return { parent: this.hips, hip: [sd * 2.2 * KV, 0, 0], l1: 4.3 * KV, l2: 4.3 * KV, thigh, shin, foot3, knee: [0, 0.2, 1], rest: [sd * 0.065, 0.02], group: i, lift: 0.07 };
    });
    this.legs = new Legs(this, legDefs, { stride: 0.17, stepT: 0.2, lead: 0.12, onStep: (L, k) => { if (this.dist < 9 && k > 0.6) this.sound('step', { vol: 0.12 }); } });
    this.chatT = rand(2, 6);
    this.mineT = rand(3, 8);
    this.mining = 0;
    this.flick = 1;
    this.swingK = 0;
    this.hurtK = 0;
    if (this.asleep) this.restK = 1;
  }

  pickTip(out) { this.pick.updateWorldMatrix(true, false); return this.pick.localToWorld(out.set(0, 9 * KV, 3 * KV)); }

  throwRock() {
    const m = this.mgr, pl = m.pl;
    this.hand.updateWorldMatrix(true, false);
    const h = this.hand.getWorldPosition(new THREE.Vector3());
    const T = clamp(this.dist / 7, 0.4, 1);
    const tx = pl.pos.x + pl.vel.x * T * 0.5, ty = pl.pos.y + 0.5, tz = pl.pos.z + pl.vel.z * T * 0.5;
    const g = 9;
    const v = [(tx - h.x) / T, (ty - h.y + 0.5 * g * T * T) / T, (tz - h.z) / T];
    const geo = m.geo('kobold_rock', () => { const r = new VB(41); r.ell(0, 0, 0, 1.6, 1.4, 1.6, (x, y, z, nx, ny) => (ny > 0.3 ? 0x9a8a7a : 0x6a5e52)); return r.geo(0, 0, 0, KV); });
    m.addShot({ x: h.x, y: h.y + 0.05, z: h.z, v, g, geo, dmg: this.info.dmg * 0.7, zone: this.zone, src: this, kind: 'rock', mat: this.mat, bounces: 0, trail: [0.5, 0.45, 0.4], spin: 1.5 });
    this.sound('whoosh', { vol: 0.4 });
  }

  // ------------------------------------------------------------------ behaviour flavour
  onNotice() { this.sound('yip', { pitch: rand(1, 1.3) }); this.jawOpen = 1; this.vel.y = Math.max(this.vel.y, 2.2); this.sqv += 6; }
  onTaunt() { if (Math.random() < 0.5) { this.sound('babble', { pitch: rand(1.5, 1.9), n: 3 }); this.jawOpen = 1; } }
  onFlee() { this.sound('yip', { pitch: 1.6 }); }
  onWake() { this.sound('yip', { pitch: 1.2 }); }
  onHit() { this.hurtK = 1; this.sound('yip', { pitch: rand(1.5, 1.8) }); this.jawOpen = 1; }

  think(dt) {
    super.think(dt);
    if (this.asleep || this.atk) return;
    // chatter, and chip at the wall when idle beside one
    this.chatT -= dt;
    if (this.chatT <= 0) { this.chatT = rand(3, 8); if (this.dist < 12 && this.mode !== 'fight') { this.sound('babble', { pitch: rand(1.4, 1.8), n: 2 + (Math.random() * 3 | 0) }); this.jawOpen = 1; } }
    if (this.mode === 'idle') {
      this.mineT -= dt;
      if (this.mineT <= 0) {
        this.mineT = rand(4, 9);
        const f = this.yaw;
        const hit = this.w.raycast(this.pos.x, this.pos.y + 0.4, this.pos.z, Math.sin(f), 0, Math.cos(f), 0.8);
        if (hit) this.mining = 2.2;
      }
    }
    if (this.mode !== 'idle') this.mining = 0;
    if (this.mining > 0) {
      this.mining -= dt;
      const ph = (this.mining * 2.2) % 1;
      if (ph < 0.05 && this.dist < 10) {
        const p = this.pickTip(_v);
        this.fx.sparks(p.x, p.y, p.z, 4, [1, 0.85, 0.5], [0, 0.5, 0], 1.6);
        pebbles(this.fx, p.x, p.y, p.z, 2, this.mgr.dustCol(this.pos), 0.05, 0.6);
        this.sound('chisel', { vol: 0.35 });
      }
    }
  }

  // ------------------------------------------------------------------ body
  animate(dt) {
    const A = this.atk, sp = Math.hypot(this.vel.x, this.vel.z), t = this.t;
    this.legs.update(dt);
    this.tailChain.update(dt, this, { whip: this.atk ? 0.15 : 0 });
    const walk = clamp(sp / 2, 0, 1);
    const ph = t * (6 + sp * 3);
    // pick arm: shoulder angle (θ: negative = raised forward) and the pick in the paw (φ)
    // carry: the pick rests over the shoulder; swing: up over the head, then down in front
    let th = -0.95 + Math.sin(ph) * 0.12 * walk, phi = 0.45, armL = -0.25 - Math.sin(ph) * 0.3 * walk, lean = 0.1 + walk * 0.14;
    if (this.mining > 0) { const k = (this.mining * 2.2) % 1; const up = k < 0.7 ? k / 0.7 : 1 - (k - 0.7) / 0.3; th = -0.6 - 1.9 * up; phi = 2.9 - 1.3 * up; lean = 0.3; }
    if (A) {
      const id = A.a.id, k = A.phase === 'tell' ? clamp(A.t / A.a.tell, 0, 1) : 0;
      if (id === 'swing' || id === 'leap') {
        if (A.phase === 'tell') { th = -0.95 - 1.75 * k; phi = 0.45 + 1.2 * k; lean = 0.1 - 0.32 * k; }
        else if (A.phase === 'go') { const g = clamp(A.t / 0.12, 0, 1); th = -2.7 + 2.3 * g; phi = 1.65 + 1.4 * g; lean = -0.22 + 0.7 * g; }
        else { const r = clamp(A.t / A.a.rec, 0, 1); th = -0.4 - 0.55 * r; phi = 3.05 - 2.6 * r; lean = 0.48 - 0.38 * r; }
        if (id === 'leap' && A.phase === 'tell') this.sqT = -0.25 * k;
      } else if (id === 'throw') {
        if (A.phase === 'tell') { th = -0.95 - 1.9 * k; armL = -0.25 - 0.4 * k; }
        else th = -2.85 + 2.6 * clamp(A.t / 0.15, 0, 1);
      }
    }
    if (this.stunT > 0) { th = -0.3 + Math.sin(t * 9) * 0.3; phi = 1.2; armL = 0.1; lean = 0.25; }
    const kk = Math.min(1, dt * (A && A.phase === 'go' ? 30 : 12));
    this.swingK += (th - this.swingK) * kk;
    this.phiK = (this.phiK ?? phi) + (phi - (this.phiK ?? phi)) * kk;
    this.shoulders[0].rotation.x = this.swingK;
    this.shoulders[0].rotation.z = 0.2;
    this.pick.rotation.x = this.phiK;
    this.shoulders[1].rotation.x = armL;
    this.shoulders[1].rotation.z = -0.5;
    // lantern: a pendulum hanging from the paw
    const L = this.lantSwing;
    // the paw's acceleration (in the body's frame) kicks the pendulum
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const fv = this.vel.x * s + this.vel.z * c, sv = this.vel.x * c - this.vel.z * s;
    const fa = (fv - (L.fv ?? fv)) / Math.max(dt, 1e-3), sa = (sv - (L.sv ?? sv)) / Math.max(dt, 1e-3);
    L.fv = fv; L.sv = sv;
    L.v += (-L.a * 45 - L.v * 2.5 + fa * 0.4) * dt;
    L.a = clamp(L.a + L.v * dt, -0.9, 0.9);
    L.w += (-L.b * 45 - L.w * 2.5 - sa * 0.4) * dt;
    L.b = clamp(L.b + L.w * dt, -0.9, 0.9);
    this.lantern.rotation.x = -armL + L.a;
    this.lantern.rotation.z = 0.5 + L.b + Math.sin(t * 1.3) * 0.05;
    // torso and head
    this.hurtK = Math.max(0, this.hurtK - dt * 4);
    const rest = this.restK;
    this.torsoG.rotation.x = lean + this.hurtK * -0.4 + rest * 0.9 + Math.sin(ph * 2) * 0.03 * walk;
    this.torsoG.rotation.z = Math.sin(ph) * 0.05 * walk;
    this.hips.position.y = (HIP - rest * 4) * KV + Math.abs(Math.sin(ph)) * 0.6 * KV * walk;
    if (this.headDown > 0.05 || rest > 0.5) { this.neck.rotation.x += ((0.6 * this.headDown + rest * 0.4) - this.neck.rotation.x) * Math.min(1, dt * 6); }
    else look(this.neck, this.mode === 'fight' || A ? this.mgr.eye : this.lookAt, dt, { yaw: 1, pitch: 0.6, rate: 8 });
    this.jawOpen = Math.max(0, (this.jawOpen || 0) - dt * 3);
    this.jaw.rotation.x = 0.1 + this.jawOpen * 0.5 * (0.6 + 0.4 * Math.sin(t * 30)) + (A && A.phase === 'tell' ? 0.35 : 0);
    // candle and lantern flicker
    this.flick += (rand(0.8, 1.25) - this.flick) * Math.min(1, dt * 16);
    this.flame.scale.set(1, this.flick * (this.asleep ? 0.5 : 1), 1);
    this.glowMat.uniforms.emissive.value = 1.3 + this.flick * 0.4;
    this.eyes.geometry = this.mode === 'fight' || A ? this.G.angry : this.G.eyes;
    if (this.asleep) this.eyeOpen = 0; else this.eyeOpen = Math.min(1, this.eyeOpen + dt * 4);
  }

  light() {
    if (this.dist > 22) return null;
    this.lantern.updateWorldMatrix(true, false);
    const p = this.lantern.localToWorld(_v.set(0, -3.5 * KV, 0));
    const k = this.flick * (this.asleep ? 0.6 : 1);
    const c = this.G.light;
    return { x: p.x, y: p.y, z: p.z, c: [c[0] * k, c[1] * k, c[2] * k], r: this.chief ? 4 : 3.2 };
  }

  deathFx() {
    const c = this.center;
    this.sound('yip', { pitch: 0.9 });
    puff(this.fx, c.x, c.y, c.z, 6, this.G.hide, 0.12, 0.4, 0.06, 0.5);
    sparkle(this.fx, c.x, c.y + 0.3, c.z, 6, [1, 0.7, 0.3], 1.5, 3, 0.018, 0.6);
  }
}
