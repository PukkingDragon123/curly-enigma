// Rock folk: the Pebble Mimic (a pebble that hops at you) and the Rubble Golem (a boulder that
// unfolds, lumbers after you and slams the ground). Both are painted from the rock they sit on, so
// asleep they look just like part of the cave until you get close.
import { Enemy, smooth, easeBack, TAU } from './base.js';
import { VB, VS, mul, mix, c01, ramp } from './vox.js';
import { shockRing, puff, pebbles, sparkle } from './fx.js';
import { MAT, M } from '../materials.js';
import { rand, clamp } from '../../core/util.js';

// glow colors per zone (golem cores, cracks)
const CORE = [null, 0xffc860, 0xffb040, 0xb8a0ff, 0xff7a1a, 0x9ae8ff, 0xd8a0ff];

/** Rock palette from a terrain material id (falls back to stone). */
export function rockPalette(m) {
  if (m === M.MOSS || m === M.ROOTS) m = M.DIRT;
  const d = MAT[m];
  const ok = d && !d.fluid && d.tones && m !== M.LANTERN && m !== M.DOOR && m !== M.BURROW && !d.ore;
  const src = ok ? d : MAT[M.STONE];
  return { tones: src.tones, acc: src.accent, key: ok ? m : M.STONE, moss: m === M.MOSS };
}

function eyeVox(vb, x0, y0, z, col, hi, angry, side) {
  // a 2×3 glowing eye with a highlight; angry eyes lose their inner top corner (a frown)
  for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) {
    const inner = side > 0 ? x === 0 : x === 1;
    if (angry && y === 2 && inner) continue;
    const top = y === 2 && !inner;
    vb.set(x0 + x, y0 + y, z, top ? hi : y === 0 ? mul(col, 0.8) : col);
  }
}

// ------------------------------------------------------------------ Pebble Mimic
export function buildMimic(pal, zone, seed) {
  const T = pal.tones, dark = mul(T[0], 0.55);
  const body = new VB(seed);
  const shadeAt = (x, y, z, nx, ny) => {
    const k = body.n(x, y, z);
    if (k > 0.94) return pal.acc;
    return ramp(T, clamp(0.25 + ny * 0.35 + (k - 0.5) * 0.6, 0, 0.999));
  };
  body.ell(0, 4.4, 0, 5.6, 4.4, 5.2, shadeAt);
  body.ell(2.5, 6.5, -1.5, 2.6, 2.2, 2.6, shadeAt); // lumps
  body.ell(-3, 5.5, 1, 2.2, 2, 2.2, shadeAt);
  // eye sockets and a crack of a mouth on the front
  const front = (x, y) => { for (let z = 8; z > -8; z--) if (body.has(x, y, z)) return z; return 0; };
  for (const [x, y] of [[1, 4], [2, 4], [1, 5], [2, 5], [1, 6], [2, 6], [-2, 4], [-3, 4], [-2, 5], [-3, 5], [-2, 6], [-3, 6]]) body.set(x, y, front(x, y), dark);
  for (const [x, y] of [[-2, 2], [-1, 3], [0, 2], [1, 3]]) body.set(x, y, front(x, y), dark);
  const zf = Math.max(front(1, 5), front(-2, 5)) + 1;
  const eyes = new VB(), angry = new VB();
  const ec = 0xffd04a, hi = 0xfffbe0;
  for (const [vb, a, col] of [[eyes, false, ec], [angry, true, 0xff6a3a]]) {
    eyeVox(vb, 1, 4, zf, col, hi, a, 1);
    eyeVox(vb, -3, 4, zf, col, hi, a, -1);
  }
  // stubby feet
  const foot = new VB(seed + 1);
  foot.box(-1, -2, -1, 0, -1, 1, mul(T[0], 0.8));
  foot.box(-1, -2, 2, 0, -2, 2, mul(T[0], 0.7));
  // a sprout on top (shallow zones): the pebble's pride
  let sprout = null;
  if (zone <= 2) {
    sprout = new VB();
    const g1 = 0x5aa83a, g2 = 0x8ad85a, st = 0x4a7a2a;
    sprout.box(0, 0, 0, 0, 1, 0, st);
    sprout.box(1, 2, 0, 2, 2, 0, g1); sprout.set(3, 3, 0, g2); sprout.set(2, 3, 0, g2);
    sprout.box(-2, 2, 0, -1, 2, 0, g1); sprout.set(-3, 3, 0, g2); sprout.set(-2, 3, 0, g1);
  }
  return {
    body: body.geo(0, 0, 0), eyes: eyes.geo(0, 5.5, 0), angry: angry.geo(0, 5.5, 0), foot: foot.geo(-0.5, 0, 0),
    sprout: sprout ? sprout.geo(0.5, 0, 0.5) : null, dust: c01(T[1]), chip: c01(T[2]),
  };
}

export class Mimic extends Enemy {
  static info = { id: 'pebble_mimic', name: 'Pebble Mimic', color: '#d8b070', hits: 2, dmg: 2, snd: 'stone' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.18; this.h = 0.34; this.cy = 0.2; this.hitR = 0.27;
    this.mass = 1;
    this.springK = 300; this.springC = 8;
    const pal = rockPalette(o.mat ?? M.STONE);
    const G = this.G = mgr.geo('mimic|' + pal.key + '|' + Math.min(this.zone, 3), () => buildMimic(pal, this.zone, 7));
    this.mat = this.material({ texel: 48 });
    const eyeMat = this.material({ emissive: 1.4 });
    this.bodyG = this.group3();
    this.body = this.part(G.body, this.mat, this.bodyG);
    this.eyes = this.part(G.eyes, eyeMat, this.bodyG, 0, 5.5 * VS, 0);
    this.feet = [this.part(G.foot, this.mat, this.root, 2 * VS, 2 * VS, 0), this.part(G.foot, this.mat, this.root, -1 * VS, 2 * VS, 0)];
    if (G.sprout) this.sprout = this.part(G.sprout, this.mat, this.bodyG, -0.5 * VS, 9 * VS, -0.5 * VS);
    this.wakeK = 0;
    this.eyeOpen = 0;
    this.hopT = 0.5;
    this.state = 'dormant';
    this.tellT = rand(2, 5);
    this.lost = 0;
  }

  think(dt) {
    const m = this.mgr;
    this.sqT = 0;
    this.squint = 1;
    switch (this.state) {
      case 'dormant': {
        this.wakeK = Math.max(0, this.wakeK - dt * 2);
        this.eyeOpen = Math.max(0, this.eyeOpen - dt * 4);
        if (this.awake || (this.dist < 3.3 && this.sees && !m.safe)) { this.setState('wake'); this.wake(); this.sound('click', { vol: 0.6 }); break; }
        // a tell for the observant: a little wiggle and a trickle of grit
        this.tellT -= dt;
        if (this.tellT <= 0 && this.dist < 9) { this.tellT = rand(3, 7); this.sqv += 3.5; pebbles(this.fx, this.pos.x, this.pos.y + 0.3, this.pos.z, 2, this.G.chip, 0.12, 0.6); }
        break;
      }
      case 'wake': {
        this.shiver = 0.8;
        this.sqT = -0.18;
        if (Math.random() < dt * 14) pebbles(this.fx, this.pos.x, this.pos.y + 0.32, this.pos.z, 1, this.G.chip, 0.18, 1);
        this.facePlayer(4, dt);
        if (this.st > 0.55) {
          this.setState('hop');
          this.vel.y = 3;
          this.sqv += 9;
          this.sound('squeak', { pitch: 0.7 });
          pebbles(this.fx, this.pos.x, this.pos.y + 0.3, this.pos.z, 6, this.G.chip, 0.2, 1.6);
          this.fx.dust(this.pos.x, this.pos.y + 0.05, this.pos.z, 6, this.G.dust, 0.15);
        }
        break;
      }
      case 'hop': {
        this.wakeK = Math.min(1, this.wakeK + dt * 5);
        this.eyeOpen = Math.min(1, this.eyeOpen + dt * 6);
        this.facePlayer(5, dt);
        if (m.safe || this.dist > 14) { this.lost += dt; if (this.lost > 4) { this.awake = false; this.lost = 0; this.setState('dormant'); } }
        else this.lost = 0;
        if (!this.grounded) { this.sqT = clamp(this.vel.y * 0.05, -0.1, 0.25); break; }
        this.hopT -= dt;
        if (this.hopT < 0.16) this.sqT = -0.28; // crouch before the hop
        if (this.hopT <= 0) {
          if (this.hd < 1.7 && this.atkCd <= 0 && !m.safe && this.lost === 0) { this.setState('windup'); this.sound('emote', { kind: 'angry' }); break; }
          const [dx, dz] = this.dirToPlayer();
          const away = this.lost > 0 ? -1 : 1;
          const side = (Math.random() - 0.5) * 0.8;
          const sp = this.hd > 1.2 ? rand(1.4, 2.1) : 0.3;
          this.vel.set((dx * away - dz * side) * sp, rand(3.2, 4), (dz * away + dx * side) * sp);
          this.sqv += 8;
          this.hopT = rand(0.3, 0.55);
          this.sound('clunk', { vol: 0.25 });
        }
        break;
      }
      case 'windup': {
        this.facePlayer(6, dt);
        this.sqT = -0.42;
        this.shiver = 1;
        this.squint = 0.7;
        if (this.st > 0.45) {
          const [dx, dz] = this.dirToPlayer();
          const sp = clamp(this.hd * 2.4, 2, 4.4);
          this.vel.set(dx * sp, 4.4, dz * sp);
          this.sqv += 12;
          this.hitDone = false;
          this.setState('lunge');
          this.sound('whoosh', { vol: 0.6 });
        }
        break;
      }
      case 'lunge': {
        this.squint = 0.7;
        if (!this.hitDone && this.touches(0.05)) {
          this.hitDone = true;
          const [dx, dz] = this.dirToPlayer();
          this.hurtPlayer(this.info.dmg, [dx * 3.5, 2.2, dz * 3.5]);
          this.vel.x *= -0.4; this.vel.z *= -0.4;
          this.sound('thud', { vol: 0.5 });
        }
        if (this.grounded && this.st > 0.1) { this.setState('recover'); this.atkCd = rand(1.1, 1.8); }
        break;
      }
      case 'recover':
        if (this.st > 0.7) this.setState('hop');
        break;
      case 'hurt':
        if (this.st > 0.35) this.setState('hop');
        break;
    }
    if (this.state !== 'dormant' && this.state !== 'wake') this.eyes.geometry = (this.state === 'windup' || this.state === 'lunge') ? this.G.angry : this.G.eyes;
  }

  onHit() { if (this.state !== 'dormant' && this.state !== 'wake') { this.setState('hurt'); this.wakeK = 1; this.eyeOpen = 1; } else this.setState('wake'); this.sound('squeak', { pitch: 0.8 }); }

  animate(dt) {
    const k = easeBack(this.wakeK);
    this.bodyG.position.y = k * 2 * VS;
    for (const [i, f] of this.feet.entries()) {
      f.scale.setScalar(Math.max(0.001, k));
      f.rotation.x = this.grounded ? Math.sin(this.t * 14 + i * 3) * 0.1 * Math.hypot(this.vel.x, this.vel.z) : -0.5;
    }
    if (this.sprout) { this.sprout.rotation.z = Math.sin(this.t * 3) * 0.15 - this.sqv * 0.02; this.sprout.rotation.x = this.vel.y * 0.06; }
    // lean into hops
    this.bodyG.rotation.x = this.grounded ? 0 : clamp(-this.vel.y * 0.05, -0.25, 0.25);
  }
}

// ------------------------------------------------------------------ Rubble Golem
export function buildGolem(pal, zone, seed) {
  const T = pal.tones, dark = mul(T[0], 0.5), core = CORE[zone] || 0xffc860;
  const sh = (vb) => (x, y, z, nx, ny, nz) => {
    const k = vb.n(x, y, z);
    if (k > 0.95) return pal.acc;
    if (ny > 0.72 && k < 0.55) return mix(T[3], 0xffffff, 0.14); // a rim of light on top
    return ramp(T, clamp(0.32 + ny * 0.5 + (nz || 0) * 0.1 + (k - 0.5) * 0.5, 0, 0.999));
  };
  // torso (pivot at the hips) with a head hunched into it and boulder shoulders
  const torso = new VB(seed), glow = new VB(seed + 5);
  const s = sh(torso);
  torso.ell(0, 8, -0.5, 9.5, 8.5, 7, s);
  torso.ell(7.5, 13, 0, 4.6, 4.2, 4.6, s);
  torso.ell(-7.5, 13, 0, 4.6, 4.2, 4.6, s);
  torso.ell(0, 13.5, 5.5, 5.6, 4.6, 4.6, s);
  torso.ell(-3, 4, 3, 4, 3.6, 4, s);
  torso.ell(3.5, 3.5, 2.5, 3.6, 3.2, 4, s);
  const front = (vb, x, y) => { for (let z = 14; z > -12; z--) if (vb.has(x, y, z)) return z; return 0; };
  // a heavy brow, eye sockets, a grumpy mouth
  for (let x = -5; x <= 4; x++) { const z = front(torso, x, 16) + 1; torso.set(x, 16, z, mul(T[1], 0.9)); torso.set(x, 15, z, mul(T[0], 0.9)); }
  const sockets = [[1, 12], [2, 12], [3, 12], [1, 13], [2, 13], [3, 13], [-2, 12], [-3, 12], [-4, 12], [-2, 13], [-3, 13], [-4, 13]];
  for (const [x, y] of sockets) torso.set(x, y, front(torso, x, y), dark);
  for (let x = -3; x <= 2; x++) torso.set(x, 9 + (x === -3 || x === 2 ? 1 : 0), front(torso, x, 9 + (x === -3 || x === 2 ? 1 : 0)), dark);
  // glowing seam down the chest
  let cx = 0;
  for (let y = 2; y <= 8; y++) { cx += torso.n(0, y, 0, 3) < 0.5 ? -1 : 1; cx = clamp(cx, -2, 2); const z = front(torso, cx, y); torso.del(cx, y, z); glow.set(cx, y, z, y % 3 === 0 ? 0xffffff : core); }
  // zone dressing
  torso.paint((x, y, z, c) => {
    if (zone <= 2 && y > 9 && torso.open(x, y, z, 0, 1, 0) && torso.n(x, y, z, 9) < 0.55) return torso.n(x, y, z, 11) < 0.5 ? 0x3a7a3a : 0x5aa84a; // moss
    if (zone === 5 && torso.open(x, y, z, 0, 1, 0) && y > 8) return torso.n(x, y, z, 12) < 0.3 ? 0xd8e8f4 : 0xf4faff; // snow
    return undefined;
  });
  if (zone === 4 || zone === 6) {
    for (const [x, y, z] of torso.list().map((v) => [v.x, v.y, v.z])) {
      if (torso.n(x, y, z, 13) < 0.06 && (torso.open(x, y, z, 0, 0, 1) || torso.open(x, y, z, 1, 0, 0) || torso.open(x, y, z, -1, 0, 0))) { torso.del(x, y, z); glow.set(x, y, z, zone === 4 ? (torso.n(x, y, z, 14) < 0.5 ? 0xff7a1a : 0xffc040) : 0xffe08a); }
    }
  }
  if (zone === 3 || zone === 5 || zone === 6) {
    // crystals growing out of the shoulders and back
    const cc = zone === 3 ? [0x8a8ae8, 0xc8c8ff, 0xffffff] : zone === 5 ? [0x8ad0f0, 0xd8f4ff, 0xffffff] : [0xb070f0, 0xe0b0ff, 0xffffff];
    const spike = (x, y, z, dx, dy, dz, len) => { for (let i = 0; i < len; i++) { const px = Math.round(x + dx * i), py = Math.round(y + dy * i), pz = Math.round(z + dz * i); glow.set(px, py, pz, cc[Math.min(2, (i * 3 / len) | 0)]); if (i < len / 2) { glow.set(px + 1, py, pz, cc[0]); glow.set(px, py, pz - 1, cc[0]); } } };
    spike(7, 16, -1, 0.3, 1, -0.3, 6); spike(-8, 16, 0, -0.3, 1, -0.2, 5); spike(-1, 15, -6, 0, 1, -0.6, 7); spike(3, 14, -6, 0.3, 0.8, -0.7, 5);
  }
  // legs (pivot at the hip)
  const leg = new VB(seed + 2);
  const sl = sh(leg);
  leg.ell(0, -3.2, 0, 3.4, 4.2, 3.4, (x, y, z, nx, ny) => mul(sl(x, y, z, nx, ny), 0.85));
  leg.box(-3, -7, -2, 2, -6, 4, (x, y, z) => mul(ramp(T, leg.n(x, y, z) * 0.5), 0.8));
  // arms (pivot at the shoulder): a boulder upper arm and a big fist
  const arm = new VB(seed + 3);
  const sa = sh(arm);
  arm.cap(0, -1, 0, 1, -6, 0.5, 2.8, (x, y, z) => sa(x, y, z, 0, 0.2));
  arm.ell(1.5, -10.5, 1, 4.4, 4.2, 4.4, sa);
  for (let x = -1; x <= 4; x++) arm.set(x, -10, front(arm, x, -10), mul(T[0], 0.7)); // knuckles
  // eyes
  const eyes = new VB(), angry = new VB();
  for (const [vb, a, col] of [[eyes, false, core], [angry, true, 0xff4a2a]]) {
    eyeVox(vb, 2, 12, front(torso, 2, 12) + 1, col, 0xffffff, a, 1);
    eyeVox(vb, -4, 12, front(torso, -3, 12) + 1, col, 0xffffff, a, -1);
  }
  return {
    torso: torso.geo(0, 0, 0), glow: glow.size ? glow.geo(0, 0, 0) : null, leg: leg.geo(0, 0, 0), arm: arm.geo(0, 0, 0),
    eyes: eyes.geo(0, 13, 0), angry: angry.geo(0, 13, 0), dust: c01(T[1]), chip: c01(T[2]), core: c01(core),
  };
}

export class Golem extends Enemy {
  static info = { id: 'rubble_golem', name: 'Rubble Golem', color: '#c8a070', hits: 4.5, dmg: 5, snd: 'stone' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.3; this.h = 0.9; this.cy = 0.5; this.hitR = 0.5;
    this.mass = 4; this.kb = 4;
    this.springK = 160; this.springC = 10;
    this.step = 0.26;
    const pal = rockPalette(o.mat ?? M.STONE);
    const G = this.G = mgr.geo('golem|' + pal.key + '|' + this.zone, () => buildGolem(pal, this.zone, 11));
    this.mat = this.material({ texel: 48 });
    this.glowMat = this.material({ emissive: 1.1 });
    this.hips = this.group3(this.root, 0, 7 * VS, 0);
    this.torsoG = this.group3(this.hips);
    this.torso = this.part(G.torso, this.mat, this.torsoG);
    if (G.glow) this.glow = this.part(G.glow, this.glowMat, this.torsoG);
    this.eyes = this.part(G.eyes, this.glowMat, this.torsoG, 0, 13 * VS, 0);
    this.arms = [1, -1].map((sd) => {
      const a = this.part(G.arm, this.mat, this.torsoG, sd * 10 * VS, 13 * VS, 0);
      if (sd < 0) a.scale.x = -1;
      return a;
    });
    this.legs = [1, -1].map((sd) => this.part(G.leg, this.mat, this.hips, sd * 4.6 * VS, 0, 0));
    this.state = 'dormant';
    this.wakeK = 0;
    this.eyeOpen = 0;
    this.phase = 0;
    this.pose = { lean: 0, arm: 0, armOut: 0 };
    this.lost = 0;
    this.tellT = rand(2, 6);
  }

  think(dt) {
    const m = this.mgr;
    this.squint = 1;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    switch (this.state) {
      case 'dormant': {
        this.wakeK = Math.max(0, this.wakeK - dt * 0.8);
        this.eyeOpen = Math.max(0, this.eyeOpen - dt * 2);
        this.push(0, 0, 8, dt);
        if (this.awake || (this.dist < 3.6 && this.sees && !m.safe)) { this.setState('wake'); this.wake(); this.sound('rumble_hit', { vol: 0.7 }); break; }
        this.tellT -= dt;
        if (this.tellT <= 0 && this.dist < 10) { this.tellT = rand(4, 8); this.shiver = 0.5; pebbles(this.fx, this.pos.x, this.pos.y + 0.6, this.pos.z, 3, this.G.chip, 0.3, 0.4); }
        break;
      }
      case 'wake': {
        this.shiver = 0.7;
        this.wakeK = smooth(this.st / 1.1);
        this.eyeOpen = clamp(this.st * 3 - 1.2, 0, 1);
        if (Math.random() < dt * 18) pebbles(this.fx, this.pos.x + rand(-0.4, 0.4), this.pos.y + 0.7, this.pos.z + rand(-0.4, 0.4), 1, this.G.chip, 0.1, 0.3);
        if (Math.random() < dt * 8) this.fx.dust(this.pos.x, this.pos.y + 0.1, this.pos.z, 2, this.G.dust, 0.35);
        this.facePlayer(1.2, dt);
        if (this.st > 1.1) { this.setState('chase'); this.sqv += 4; this.sound('emote', { kind: 'angry' }); }
        break;
      }
      case 'chase': {
        this.wakeK = 1; this.eyeOpen = 1;
        if (m.safe || this.dist > 15) { this.lost += dt; if (this.lost > 6) { this.awake = false; this.lost = 0; this.setState('dormant'); this.sound('rumble_hit', { vol: 0.3 }); break; } }
        else this.lost = 0;
        const off = this.facePlayer(2.2, dt);
        const want = this.lost > 0 || this.hd < 1.3 ? 0 : off < 0.7 ? 0.85 : 0.2;
        this.push(Math.sin(this.yaw) * want, Math.cos(this.yaw) * want, 6, dt);
        if (this.hd < 1.9 && Math.abs(this.pdy) < 1.1 && this.atkCd <= 0 && off < 0.5 && !m.safe) { this.setState('raise'); this.sound('rumble_hit', { vol: 0.5 }); this.sound('emote', { kind: 'angry' }); }
        // footfalls
        const ph = this.phase;
        this.phase += sp * dt * 6.5;
        if (Math.floor(ph / Math.PI) !== Math.floor(this.phase / Math.PI) && sp > 0.2) {
          const side = Math.floor(this.phase / Math.PI) % 2 ? 1 : -1;
          const fx = this.pos.x + Math.cos(this.yaw) * side * 0.2, fz = this.pos.z - Math.sin(this.yaw) * side * 0.2;
          this.fx.dust(fx, this.pos.y + 0.03, fz, 3, this.G.dust, 0.08);
          this.sound('thud', { vol: 0.22 });
          this.sqv -= 1.5;
        }
        break;
      }
      case 'raise': {
        this.push(0, 0, 10, dt);
        this.facePlayer(1.1, dt);
        this.shiver = 0.35;
        this.squint = 0.75;
        if (Math.random() < dt * 10) pebbles(this.fx, this.pos.x, this.pos.y + 1.0, this.pos.z, 1, this.G.chip, 0.4, 0.2);
        if (this.st > 0.8) { this.setState('slam'); this.slammed = false; this.sound('whoosh', { vol: 0.7 }); }
        break;
      }
      case 'slam': {
        this.squint = 0.75;
        if (!this.slammed && this.st > 0.1) { this.slammed = true; this.impact(); }
        if (this.st > 0.2) this.setState('stuck');
        break;
      }
      case 'stuck': {
        if (this.st > 0.95) { this.setState('chase'); this.atkCd = rand(1.4, 2.2); }
        break;
      }
      case 'hurt': if (this.st > 0.3) this.setState('chase'); break;
    }
    this.eyes.geometry = this.state === 'raise' || this.state === 'slam' ? this.G.angry : this.G.eyes;
    this.h = 0.45 + this.wakeK * 0.45;
  }

  impact() {
    const m = this.mgr;
    const fx = this.pos.x + Math.sin(this.yaw) * 0.75, fz = this.pos.z + Math.cos(this.yaw) * 0.75, y = this.pos.y;
    shockRing(this.fx, fx, y, fz, 0.25, 5.2, this.G.dust, 48);
    pebbles(this.fx, fx, y + 0.1, fz, 12, this.G.chip, 0.3, 3.5);
    this.fx.sparks(fx, y + 0.1, fz, 10, [1, 0.8, 0.45], [0, 1, 0], 3);
    sparkle(this.fx, fx, y + 0.15, fz, 6, this.G.core, 2.2, 3);
    puff(this.fx, fx, y + 0.1, fz, 10, this.G.dust, 0.35, 0.4, 0.09, 0.7);
    this.sound('thud', { vol: 1 });
    this.sound('rumble_hit', { vol: 0.9 });
    this.sound('break', { snd: 'stone', vol: 0.5 });
    this.sqv -= 6;
    m.addHazard({ kind: 'ring', x: fx, y, z: fz, r: 0.25, speed: 5.2, rMax: 3.1, dmg: this.info.dmg, src: this });
    // fists landing right on the mole
    if (this.gapToPlayer(fx, y + 0.3, fz, 0.45) < 0) {
      const [dx, dz] = this.dirToPlayer();
      this.hurtPlayer(this.info.dmg * 1.2, [dx * 4.5, 3, dz * 4.5]);
    }
  }

  onHit() {
    this.sound('hit', { snd: 'stone', vol: 0.8 });
    if (this.state === 'dormant' || this.state === 'wake') { if (this.state === 'dormant') this.setState('wake'); }
    else if (this.state === 'chase') this.setState('hurt');
    pebbles(this.fx, this.center.x, this.center.y + 0.2, this.center.z, 4, this.G.chip, 0.3, 1.5);
  }

  animate(dt) {
    const k = easeBack(this.wakeK), sp = Math.hypot(this.vel.x, this.vel.z);
    const P = this.pose;
    let lean = 0.32 * (1 - k), armX = 0.45 * (1 - k), armZ = -0.28 * (1 - k) + 0.12;
    const ph = this.phase;
    if (this.state === 'raise') { const r = smooth(this.st / 0.55); lean = -0.22 * r; armX = -3.3 * r; armZ = 0.12 * r; }
    else if (this.state === 'slam') { const r = smooth(this.st / 0.1); lean = -0.22 + 0.62 * r; armX = -3.3 + 2.15 * r; armZ = 0.1; }
    else if (this.state === 'stuck') { const r = smooth((this.st - 0.55) / 0.4); lean = 0.4 * (1 - r); armX = -1.15 * (1 - r); armZ = 0.1 * (1 - r); }
    else if (this.state === 'chase' || this.state === 'hurt') { armX = -Math.sin(ph) * 0.35 * Math.min(1, sp * 1.5); lean = 0.08; }
    const f = Math.min(1, dt * (this.state === 'slam' ? 40 : 10));
    P.lean += (lean - P.lean) * f; P.arm += (armX - P.arm) * f; P.armOut += (armZ - P.armOut) * f;
    this.hips.position.y = (0.6 + 6.4 * k) * VS + Math.abs(Math.sin(ph)) * VS * 0.8 * Math.min(1, sp * 2);
    this.torsoG.rotation.x = P.lean;
    this.torsoG.rotation.z = Math.sin(ph) * 0.07 * Math.min(1, sp * 2);
    this.arms[0].rotation.set(P.arm, 0, P.armOut);
    this.arms[1].rotation.set(this.state === 'chase' ? Math.sin(ph) * 0.35 * Math.min(1, sp * 1.5) : P.arm, 0, -P.armOut);
    this.legs.forEach((l, i) => {
      l.scale.set(1, Math.max(0.05, k), 1);
      l.rotation.x = Math.sin(ph + i * Math.PI) * 0.5 * Math.min(1, sp * 2);
    });
    if (this.glow) this.glow.visible = this.wakeK > 0.3 || (this.t % 5 < 0.3); // the glow seam flickers in its sleep
    this.glowMat.userData.e0 = 1.1;
  }

  light() {
    if (this.wakeK < 0.5) return null;
    const c = this.G.core, k = this.state === 'raise' ? 1.2 : 0.55;
    return { x: this.center.x, y: this.center.y + 0.1, z: this.center.z, c: [c[0] * k, c[1] * k, c[2] * k], r: 2.6 };
  }
}

export { CORE };
