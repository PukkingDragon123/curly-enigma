// Ruin Wraith: a hooded shade that haunts the old ruins (and the deepest zones): a tattered robe that
// frays into smoke, bony hands with long claws, two cold eyes in the dark of the hood. It drifts
// through the air and hates light: keep the lamp on it and it shrieks, fades and slips away
// (sometimes to come at you from behind).
//   claw    it rises with a wail, arms spread, then swoops in slashing (yellow: block or parry)
//   grasp   a long rising wail while frost gathers in its hands, then it lunges to clutch you and
//           drink your warmth (red: unblockable — get out of reach)
import * as THREE from 'three';
import { Beast } from './beast.js';
import { VB, mul, mix, c01 } from './vox.js';
import { mote, puff, sparkle, stream } from './fx.js';
import { airBelow, solidAt } from './physics.js';
import { rand, clamp } from '../../core/util.js';

const WV = 1 / 28;
const LOOKS = {
  3: { robe: [0x1a1c2a, 0x262a3e, 0x363c56, 0x4a5272], trim: 0x6a7aa0, eye: 0x7affd8, mist: [0.55, 1, 0.85], bone: 0xc8d0c8 },
  5: { robe: [0x1a2430, 0x263446, 0x384a60, 0x50667e], trim: 0x8ab0d0, eye: 0x9ae0ff, mist: [0.6, 0.85, 1], bone: 0xd8e4ec },
  6: { robe: [0x1e1028, 0x2c183c, 0x402456, 0x5a3478], trim: 0x9a6ad0, eye: 0xff7aff, mist: [0.9, 0.55, 1], bone: 0xd8c8e0 },
};
const lookFor = (z) => LOOKS[z >= 6 ? 6 : z >= 5 ? 5 : 3];

export function buildWraith(zone) {
  const L = lookFor(zone), C = L.robe;
  const sh = (vb, k0) => (x, y, z, nx, ny) => {
    if (typeof ny !== 'number') ny = 0;
    // vertical folds
    const fold = Math.sin(Math.atan2(x, z) * 7) * 0.18;
    return C[Math.floor(clamp(k0 + ny * 0.3 + fold + (vb.n(x, y, z) - 0.5) * 0.2, 0, 0.999) * 4)];
  };
  // ---------------- robe (pivot at the waist): shoulders → flaring skirt that frays
  const robe = new VB(91);
  for (let y = 0; y <= 18; y++) {
    const r = 5.6 + (18 - y) * 0.18;
    robe.ell(0, y, 0, r, 0.6, r * 0.82, (x, yy, z, nx, ny) => sh(robe, 0.45)(x, y, z, nx, 0));
  }
  robe.ell(0, 18, 0, 7.5, 3.4, 5.2, sh(robe, 0.5)); // shoulders
  robe.paint((x, y, z, c) => {
    const inner = Math.hypot(x / 5, z / 4) < 0.85;
    if (inner && y < 17) return -1; // hollow inside (it's only a robe)
    if (y === 17 || y === 14) return Math.abs(x) < 7 ? L.trim : undefined;
    return undefined;
  });
  // the skirt: long tatters hanging below, frayed
  const tat = new VB(92);
  for (let a = 0; a < 40; a++) {
    const t = (a / 40) * Math.PI * 2, r = 9.2, len = 5 + Math.floor(tat.n(a, 0, 0) * 9);
    const x0 = Math.cos(t) * r * 0.98, z0 = Math.sin(t) * r * 0.82;
    for (let i = 0; i < len; i++) {
      if (i > 2 && tat.n(a, i, 1) < 0.18) continue;
      tat.set(Math.round(x0 * (1 - i * 0.03)), -i, Math.round(z0 * (1 - i * 0.03)), C[i > len - 3 ? 3 : i % 3 === 0 ? 1 : 2]);
    }
  }
  // ---------------- hood (pivot at the neck): a deep cowl, darkness inside, eyes
  const hood = new VB(93);
  hood.ell(0, 4, -0.5, 5.6, 6, 5.8, sh(hood, 0.55));
  hood.cap(0, 8, -2, 0, 11, -5.5, 1.6, sh(hood, 0.6)); // the point of the cowl
  hood.paint((x, y, z, c) => (z > 1.5 && Math.abs(x + 0.5) < 3.6 && y > 0 && y < 7.5 ? (z > 3.5 ? -1 : 0x05060a) : y === 0 || (z > 4 && Math.abs(x + 0.5) >= 3.6 && Math.abs(x + 0.5) < 4.6) ? L.trim : undefined));
  const eyes = new VB(), angry = new VB();
  for (const [vb, mad] of [[eyes, false], [angry, true]]) for (const sd of [1, -1]) {
    const x0 = sd > 0 ? 1 : -3;
    vb.set(x0, 0, 3, L.eye); vb.set(x0 + 1, 0, 3, mad ? (sd > 0 ? 0xffffff : L.eye) : L.eye);
    if (mad) vb.set(x0 + (sd > 0 ? 0 : 1), 1, 3, L.eye); else vb.set(x0 + (sd > 0 ? 1 : 0), 1, 3, 0xffffff);
  }
  // ---------------- arms: wide sleeves, bony hands, long claws (pivot at the shoulder)
  const arm = new VB(94);
  arm.cap(0, 0, 0, 0, -8, 2.5, 2.4, (x, y, z, t) => C[t > 0.7 ? 2 : 1]);
  arm.ell(0, -9, 3.4, 3.2, 2, 3.2, (x, y, z, nx, ny) => (ny < -0.3 ? -1 : L.trim)); // the cuff
  arm.cap(0, -9.5, 3.5, 0, -12, 5, 1, L.bone);
  for (const dx of [-1.2, 0, 1.2]) arm.cap(dx, -12, 5, dx * 1.6, -16, 8, 0.55, (x, y, z, t) => (t > 0.5 ? 0xf4f4f0 : L.bone));
  const V = (vb, px = 0, py = 0, pz = 0) => vb.geo(px, py, pz, WV);
  return { robe: V(robe), tat: V(tat), hood: V(hood), eyes: V(eyes, 0, 0, 0), angry: V(angry, 0, 0, 0), arm: V(arm), mist: L.mist, eye: c01(L.eye), dark: c01(C[1]) };
}

const _v = new THREE.Vector3();

export class Wraith extends Beast {
  static info = {
    id: 'ruin_wraith', name: 'Ruin Wraith', color: '#8ad8c8', hits: 3, dmg: 6, poise: 2, tier: 3, flesh: false, snd: 'crystal', flying: true,
    diet: 'none', social: 'band', aggro: 'hostile', sleepy: 0, sight: 13, hear: 1.2, walk: 1.2, run: 2.6, turn: 4, accel: 3,
    keep: 2.6, close: 1.5, space: [0.3, 1.6], lightShy: 6, territory: 12, depth: [60, 200], hover: 0.5, noEmerge: true, glowBits: true,
    lavaProof: true, inedible: true, patience: 14,
  };
  static attacks = [
    { id: 'claw', range: [0, 1.9], arc: 0.7, tell: 0.7, dur: 0.4, hitAt: 0.12, rec: 0.6, cd: [1.3, 2.2], w: 2.5,
      start() { this.sound('wail', { pitch: 1.3, vol: 0.6 }); },
      go() { this.vel.x += Math.sin(this.yaw) * 4; this.vel.z += Math.cos(this.yaw) * 4; this.sound('whoosh', { vol: 0.6 }); },
      hit(A) { return this.strikeAt(A, this.reachPoint(0.25, 0.1), 0.42, { dmg: this.info.dmg, push: 2.8, kind: 'claw' }); } },
    { id: 'grasp', range: [0, 2.4], arc: 0.6, tell: 1.15, dur: 0.5, hitAt: 0.1, rec: 1, cd: [3.5, 5], w: 1, heavy: true,
      start() { this.sound('wail', { pitch: 0.85, vol: 1 }); },
      tick(A, dt) { if (A.phase === 'tell' && this.dist < 14) { const p = this.handPos(_v); mote(this.fx, p.x, p.y, p.z, this.G.mist, 0.035, 0.6); } },
      go() { this.vel.x += Math.sin(this.yaw) * 5; this.vel.z += Math.cos(this.yaw) * 5; },
      hit(A) {
        const p = this.reachPoint(0.2, 0.1);
        if (A.target === 'player' && this.gapToPlayer(p.x, p.y, p.z, 0.45) < 0) {
          const [dx, dz] = this.dirToPlayer();
          if (this.hurtPlayer(this.info.dmg * 1.6, [dx * 1.5, 0.5, dz * 1.5], 'drain_touch', { heavy: true, unblockable: true })) {
            const e = this.mgr.eye;
            stream(this.fx, e.x, e.y - 0.1, e.z, this.center.x, this.center.y, this.center.z, 16, this.G.mist);
            this.mgr.say('wraith_grasp', 'Its touch drinks your warmth! When it glows <b>red</b>, back away.', 'bad', 90);
          }
          return true;
        }
        return A.t > 0.4;
      } },
  ];

  constructor(mgr, o) {
    super(mgr, o);
    this.rad = 0.26; this.hw = 0.25; this.h = 1.3; this.cy = 0.8; this.hitR = 0.45;
    this.mass = 1.2; this.kb = 2.6;
    this.size = rand(0.95, 1.08);
    const z = this.zone >= 6 ? 6 : this.zone >= 5 ? 5 : 3;
    const G = this.G = mgr.geo('wraith|' + z, () => buildWraith(z));
    this.hitCol = G.dark;
    this.mat = this.material({ alpha: 0.9 });
    this.tatMat = this.material({ alpha: 0.6, wobble: 0.012 });
    this.eyeMat = this.material({ emissive: 1.6, rimK: 0 });
    this.boneMat = this.material({});
    this.body = this.group3(this.root, 0, 0.25, 0);
    this.part(G.robe, this.mat, this.body);
    this.part(G.tat, this.tatMat, this.body);
    this.neck = this.group3(this.body, 0, 19 * WV, 0.5 * WV);
    this.part(G.hood, this.mat, this.neck);
    this.eyes = this.part(G.eyes, this.eyeMat, this.neck, 0, 4 * WV, 0);
    this.headObj = this.neck; this.headTop = 8 * WV; this.headFwd = 2 * WV;
    this.shoulders = [1, -1].map((sd) => this.group3(this.body, sd * 6.6 * WV, 18 * WV, 0.5 * WV));
    this.arms = this.shoulders.map((s, i) => { const a = this.part(G.arm, this.boneMat, s); if (i) a.scale.x = -1; return a; });
    this.home = o.haunt ? new THREE.Vector3(o.haunt.x, o.haunt.y, o.haunt.z) : this.pos.clone();
    this.floorT = 0; this.floor = 1;
    this.fade = 1; this.fadeT = 0; this.blinkTo = null;
    this.armK = 0; this.riseK = 0;
    this.awake = true;
  }

  handPos(out) { this.shoulders[0].updateWorldMatrix(true, false); return this.shoulders[0].localToWorld(out.set(0, -13 * WV, 6 * WV)); }

  /** Beast steering → floating: hold a hover height over the floor, drift. */
  push(vx, vz, accel, dt) {
    const k = Math.min(1, accel * dt);
    this.vel.x += (vx - this.vel.x) * k;
    this.vel.z += (vz - this.vel.z) * k;
  }
  move(dt) {
    this.floorT -= dt;
    if (this.floorT <= 0) { this.floorT = 0.2; this.floor = airBelow(this.w, this.pos.x, this.pos.y, this.pos.z, 3); }
    const want = (this.atk?.a.id === 'claw' && this.atk.phase === 'tell' ? 0.6 : 0.3) + Math.sin(this.t * 1.3) * 0.06;
    this.vel.y += ((want - this.floor) * 2.2 - this.vel.y) * Math.min(1, dt * 3);
    super.move(dt);
  }

  think(dt) {
    super.think(dt);
    // fading out and slipping somewhere else (lit too long, or a trick)
    if (this.fadeT > 0) {
      this.fadeT -= dt;
      this.fade = Math.max(0.05, this.fade - dt * 3);
      if (this.fadeT <= 0 && this.blinkTo) { this.pos.copy(this.blinkTo); this.blinkTo = null; this.vel.set(0, 0, 0); puff(this.fx, this.pos.x, this.pos.y + 0.6, this.pos.z, 10, this.G.dark, 0.3, 0.3, 0.1, 0.6); this.sound('whisper', {}); }
    } else this.fade = Math.min(1, this.fade + dt * 2);
  }

  onNotice() { this.sound('wail', { vol: 0.8 }); }
  onTaunt() { if (Math.random() < 0.5) this.sound('whisper', { vol: 0.7 }); }
  onHit() { this.sound('wail', { pitch: 1.6, vol: 0.5 }); }
  onLit() {
    // shrieks and slips away from the light — sometimes to just behind the mole
    this.sound('wail', { pitch: 1.8, vol: 0.8 });
    this.stun(0.5, 'recoil');
    const m = this.mgr, f = m.fwd;
    const behind = Math.random() < 0.5 && this.mode === 'fight';
    for (let k = 0; k < 6; k++) {
      const a = behind ? Math.atan2(-f.x, -f.z) + rand(-0.6, 0.6) : Math.random() * Math.PI * 2;
      const d = behind ? rand(2, 3) : rand(4, 7);
      const x = m.pc.x + Math.sin(a) * d, z = m.pc.z + Math.cos(a) * d, y = m.pl.pos.y + 0.2;
      if (solidAt(this.w, x, y + 0.6, z) || solidAt(this.w, x, y + 1.2, z)) continue;
      this.blinkTo = new THREE.Vector3(x, y, z);
      this.fadeT = 0.45;
      puff(this.fx, this.center.x, this.center.y, this.center.z, 10, this.G.dark, 0.3, 0.3, 0.1, 0.6);
      if (behind) m.say('wraith_blink', 'It <b>vanished</b>... check behind you!', 'warn', 120);
      return;
    }
  }

  animate(dt) {
    const A = this.atk, t = this.t;
    let arm = -0.4 + Math.sin(t * 1.7) * 0.15, spread = 0.25, rise = 0, lean = 0.15;
    if (A) {
      const k = A.phase === 'tell' ? clamp(A.t / A.a.tell, 0, 1) : 0;
      if (A.a.id === 'claw') {
        if (A.phase === 'tell') { arm = -0.4 - 1.6 * k; spread = 0.25 + 0.9 * k; rise = k; lean = -0.2 * k; }
        else if (A.phase === 'go') { const g = clamp(A.t / 0.15, 0, 1); arm = -2 + 1.8 * g; spread = 1.15 - 1.2 * g; lean = 0.5 * g; }
      } else if (A.a.id === 'grasp') {
        if (A.phase === 'tell') { arm = -1.3 * k; spread = 0.15 + 0.2 * Math.sin(t * 20) * k; rise = 0.5 * k; lean = -0.15 * k; }
        else if (A.phase === 'go') { arm = -1.5; spread = -0.1; lean = 0.6; }
      }
    }
    if (this.stunT > 0) { arm = -1.8; spread = -0.4; lean = -0.3; }
    const kk = Math.min(1, dt * (A && A.phase === 'go' ? 22 : 8));
    this.armK += (arm - this.armK) * kk;
    this.spreadK = (this.spreadK ?? 0.25) + (spread - (this.spreadK ?? 0.25)) * kk;
    this.shoulders[0].rotation.set(this.armK + Math.sin(t * 2.3) * 0.05, 0, this.spreadK);
    this.shoulders[1].rotation.set(this.armK + Math.sin(t * 2.1 + 1) * 0.05, 0, -this.spreadK);
    this.body.rotation.x = lean + Math.sin(t * 1.1) * 0.04;
    this.body.rotation.z = Math.sin(t * 0.9) * 0.05;
    this.body.position.y = 0.25 + Math.sin(t * 1.6) * 0.04;
    this.neck.rotation.set(-0.15, Math.sin(t * 0.7) * 0.2, 0);
    this.eyes.geometry = this.mode === 'fight' ? this.G.angry : this.G.eyes;
    const a = this.fade;
    this.mat.uniforms.alpha.value = 0.9 * a;
    this.tatMat.uniforms.alpha.value = 0.6 * a;
    this.boneMat.uniforms.alpha.value = a < 0.98 ? a : 1;
    this.eyeMat.uniforms.emissive.value = (1.4 + this.tellK * 1.2) * a;
    // smoke trailing off the hem
    if (this.dist < 16 && Math.random() < dt * 14 * a) {
      const ang = Math.random() * Math.PI * 2;
      this.fx.spawn({ x: this.pos.x + Math.cos(ang) * 0.25, y: this.pos.y + 0.2 + Math.random() * 0.2, z: this.pos.z + Math.sin(ang) * 0.25, vx: -this.vel.x * 0.3, vy: -0.1, vz: -this.vel.z * 0.3, life: rand(0.6, 1.2), size: rand(0.04, 0.08), grow: 0.06, color: this.G.dark, alpha: 0.5, drag: 1.5 });
      if (Math.random() < 0.3) mote(this.fx, this.pos.x + rand(-0.2, 0.2), this.pos.y + rand(0.3, 1.2), this.pos.z + rand(-0.2, 0.2), this.G.mist, 0.02, 0.8);
    }
  }

  light() {
    if (this.dist > 18) return null;
    const c = this.G.eye, k = (0.5 + this.tellK) * this.fade;
    return { x: this.center.x, y: this.center.y + 0.4, z: this.center.z, c: [c[0] * k, c[1] * k, c[2] * k], r: 2.4 };
  }

  deathFx() {
    const c = this.center;
    this.sound('wail', { pitch: 2, vol: 0.9 });
    sparkle(this.fx, c.x, c.y, c.z, 20, this.G.mist, 2, -0.5, 0.022, 1.2);
    puff(this.fx, c.x, c.y, c.z, 16, this.G.dark, 0.4, 0.6, 0.12, 0.6);
  }
}
