// Shade Bats: a little swarm that roosts upside down under cave ceilings. The lamp (or a mole
// walking right under them) wakes them; they whirl around the mole's head as a flock and take
// turns swooping at the lamp. One whack each.
import { Enemy, TAU } from './base.js';
import { VB, VS, c01 } from './vox.js';
import { puff, sparkle } from './fx.js';
import { rand, clamp } from '../../core/util.js';

const FUR = [0x2a1e3a, 0x3a2c52, 0x4e3e68, 0x6a5a8a];
const WING = 0x5a3e7a, BONE = 0x261a38, EAR = 0xa06a8a;

export function buildBat() {
  const body = () => {
    const b = new VB(91);
    b.ell(0, 0, 0, 2.6, 2.4, 2.4, (x, y, z, nx, ny, nz) => FUR[clamp(Math.floor((0.5 + ny * 0.35 + nz * 0.15 + (b.n(x, y, z) - 0.5) * 0.3) * 4), 0, 3)]);
    for (const sd of [1, -1]) {
      const X = (x) => (sd > 0 ? x : -1 - x);
      b.set(X(1), 2, 0, FUR[2]); b.set(X(1), 3, 0, FUR[3]); b.set(X(2), 3, 0, EAR); b.set(X(2), 4, 0, FUR[3]); b.set(X(1), 2, 1, EAR);
    }
    b.set(-1, -1, 2, 0xffffff); b.set(0, -2, 2, FUR[0]); // a fang
    return b;
  };
  // wing frames: up, mid, down, folded (for roosting)
  const wingAngles = [0.85, 0.1, -0.7];
  const frames = wingAngles.map((a) => {
    const b = body();
    for (const sd of [1, -1]) {
      for (let u = 0; u < 8; u++) {
        const chord = [3, 4, 4, 4, 3, 3, 2, 1][u];
        const x = 2 + Math.round(u * Math.cos(a)), y = Math.round(u * Math.sin(a));
        for (let v = 0; v < chord; v++) {
          if (v === chord - 1 && u % 2 === 1 && u > 1) continue; // scalloped trailing edge
          const X = sd > 0 ? x : -1 - x;
          b.set(X, y, 1 - v, v === 0 || u === 3 ? BONE : WING);
        }
      }
    }
    return b.geo(0, 0, 0);
  });
  const folded = body();
  for (const sd of [1, -1]) {
    const X = (x) => (sd > 0 ? x : -1 - x);
    for (let y = -2; y <= 1; y++) { folded.set(X(2), y, 1, WING); folded.set(X(2), y, 0, BONE); folded.set(X(2), y, -1, WING); }
    folded.set(X(1), -3, 1, WING); folded.set(X(1), -3, 0, WING);
  }
  frames.push(folded.geo(0, 0, 0));
  const eyes = new VB();
  eyes.set(1, 0, 0, 0xff5a8a); eyes.set(-2, 0, 0, 0xff5a8a);
  return { frames, eyes: eyes.geo(0, 0.5, 0), fur: c01(FUR[2]), eye: [1, 0.35, 0.55] };
}

/** Shared flock state for one group of bats. */
export class Swarm {
  constructor(roost) {
    this.roost = roost;
    this.members = [];
    this.awake = false;
    this.swoopT = rand(1.5, 2.5);
    this.orbit = Math.random() * TAU;
    this.lost = 0;
  }
  wake(mgr) {
    if (this.awake) return;
    this.awake = true;
    for (const b of this.members) if (b.alive) { b.awake = true; b.setState('fly'); b.vel.set(rand(-1.5, 1.5), rand(-1.6, -0.4), rand(-1.5, 1.5)); }
    mgr.sound('squeak', { pitch: 1.3 }, 3);
    mgr.sound('chirp', {}, 3);
    const lead = this.members.find((b) => b.alive);
    if (lead) mgr.alert(lead);
  }
}

export class Bat extends Enemy {
  static info = { id: 'shade_bat', name: 'Shade Bat', color: '#c86aa8', hits: 0.9, dmg: 2, flying: true, snd: 'flesh' };
  static tells = { aim: [0.4] };
  static resume = 'fly';
  constructor(mgr, o) {
    super(mgr, o);
    this.rad = 0.1; this.cy = 0; this.hitR = 0.19;
    this.mass = 0.5; this.kb = 5;
    this.swarm = o.swarm;
    this.idx = this.swarm.members.length;
    this.swarm.members.push(this);
    const G = this.G = mgr.geo('bat', buildBat);
    this.mat = this.material({ emissive: 0.22 });
    this.body = this.part(G.frames[3], this.mat);
    this.eyes = this.part(G.eyes, this.material({ emissive: 1.6 }), this.root, 0, 0.5 * VS, 2 * VS);
    this.hang = this.pos.clone();
    this.state = 'roost';
    this.flapT = Math.random();
    this.size = rand(0.9, 1.1);
  }

  think(dt) {
    const m = this.mgr, sw = this.swarm;
    this.squint = 1;
    if (this.state === 'roost') {
      this.vel.set(0, 0, 0);
      this.pos.set(this.hang.x + Math.sin(this.t * 1.3 + this.idx) * 0.02, this.hang.y, this.hang.z);
      if (!m.safe && ((this.dist < 4.5 && this.sees) || this.litBy(8, 0.93))) sw.wake(m);
      return;
    }
    if (m.safe || this.dist > 16) { sw.lost += dt / Math.max(1, sw.members.length); if (sw.lost > 6) { sw.awake = false; sw.lost = 0; } }
    else sw.lost = 0;
    switch (this.state) {
      case 'fly': {
        // flock around the mole's head (or back to the roost when bored)
        const home = !sw.awake;
        const a = sw.orbit + this.idx * (TAU / Math.max(3, sw.members.length)) + Math.sin(this.t * 0.9 + this.idx) * 0.4;
        const R = 2.3 + Math.sin(this.t * 1.1 + this.idx * 2) * 0.5;
        const tx = home ? this.hang.x : m.pc.x + Math.sin(a) * R;
        const ty = home ? this.hang.y : m.eye.y + 0.35 + Math.sin(this.t * 1.7 + this.idx) * 0.35;
        const tz = home ? this.hang.z : m.pc.z + Math.cos(a) * R;
        this.steer(tx, ty, tz, 3.4, 2.6, dt);
        // keep apart from flock mates
        for (const o of sw.members) {
          if (o === this || !o.alive || o.state === 'roost') continue;
          const dx = this.pos.x - o.pos.x, dy = this.pos.y - o.pos.y, dz = this.pos.z - o.pos.z, d = Math.hypot(dx, dy, dz);
          if (d < 0.45 && d > 1e-3) { const k = (0.45 - d) * 12 * dt / d; this.vel.x += dx * k; this.vel.y += dy * k; this.vel.z += dz * k; }
        }
        this.vel.x += rand(-1, 1) * dt * 6; this.vel.y += rand(-1, 1) * dt * 4; this.vel.z += rand(-1, 1) * dt * 6;
        if (home && this.pos.distanceTo(this.hang) < 0.15) { this.setState('roost'); this.awake = false; }
        if (this.idx === sw.members.findIndex((b) => b.alive)) {
          sw.orbit += dt * 0.9;
          sw.swoopT -= dt;
          if (sw.swoopT <= 0 && sw.awake && !m.safe) {
            sw.swoopT = rand(1.3, 2.4);
            // the bat nearest the front of the mole takes a turn
            let best = null, bd = -1e9;
            for (const b of sw.members) {
              if (!b.alive || b.state !== 'fly' || !b.sees) continue;
              const s = (b.pos.x - m.eye.x) * m.fwd.x + (b.pos.z - m.eye.z) * m.fwd.z - b.dist * 0.3;
              if (s > bd) { bd = s; best = b; }
            }
            if (best) best.setState('aim');
          }
        }
        break;
      }
      case 'aim': {
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
        this.squint = 0.6;
        this.shiver = 0.4;
        if (this.st < dt * 1.5) this.sound('squeak', { pitch: 1.5 });
        if (this.st > 0.4) {
          const tx = m.eye.x + m.pl.vel.x * 0.1, ty = m.eye.y - 0.05, tz = m.eye.z + m.pl.vel.z * 0.1;
          const dx = tx - this.pos.x, dy = ty - this.pos.y, dz = tz - this.pos.z, d = Math.hypot(dx, dy, dz) || 1;
          this.dash = [dx / d, dy / d, dz / d];
          this.setState('dive'); this.hitDone = false;
          this.sound('whoosh', { vol: 0.35 });
        }
        break;
      }
      case 'dive': {
        this.squint = 0.6;
        this.vel.set(this.dash[0] * 6.2, this.dash[1] * 6.2, this.dash[2] * 6.2);
        if (!this.hitDone && this.touches(0.04)) {
          this.hitDone = true;
          this.hurtPlayer(this.info.dmg, [this.dash[0] * 1.5, 0.6, this.dash[2] * 1.5], 'bat');
          this.setState('pull');
        } else if (this.st > 0.65 || this.bumped) this.setState('pull');
        break;
      }
      case 'pull': {
        const dx = this.pos.x - m.pc.x, dz = this.pos.z - m.pc.z, d = Math.hypot(dx, dz) || 1;
        this.steer(this.pos.x + dx / d * 2, m.eye.y + 1.2, this.pos.z + dz / d * 2, 4, 4, dt);
        if (this.st > 0.6) this.setState('fly');
        break;
      }
      case 'hurt':
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
        if (this.st > 0.3) this.setState('fly');
        break;
    }
  }

  onHit() {
    this.swarm.wake(this.mgr);
    this.setState('hurt');
    this.sound('squeak', { pitch: 1.2 });
  }

  animate(dt) {
    const r = this.state === 'roost';
    this.root.rotation.z = r ? Math.PI : clamp(-this.vel.x * Math.cos(this.yaw) * 0.15 + this.vel.z * Math.sin(this.yaw) * 0.15, -0.6, 0.6);
    this.root.rotation.x = r ? 0 : clamp(-this.vel.y * 0.1, -0.5, 0.5);
    if (!r) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0.2) this.yaw += Math.atan2(Math.sin(Math.atan2(this.vel.x, this.vel.z) - this.yaw), Math.cos(Math.atan2(this.vel.x, this.vel.z) - this.yaw)) * Math.min(1, dt * 8);
      if (this.state === 'aim') this.facePlayer(10, dt);
      this.flapT += dt * (this.state === 'dive' ? 6 : this.state === 'aim' ? 22 : 14);
      const f = Math.floor(this.flapT * 3) % 4;
      this.body.geometry = this.G.frames[f === 3 ? 1 : f];
      this.sqT = f === 0 ? 0.1 : f === 2 ? -0.08 : 0;
    } else {
      this.body.geometry = this.G.frames[3];
      this.sqT = Math.sin(this.t * 2 + this.idx) * 0.04; // sleepy breathing
    }
  }

  place() {
    super.place();
    // hanging bats dangle from their feet
    if (this.state === 'roost') this.root.position.y = this.pos.y - 0.04;
  }

  deathFx() {
    const p = this.center;
    puff(this.fx, p.x, p.y, p.z, 6, this.G.fur.map((k) => k * 0.6), 0.1, 0.3, 0.06, 0.6);
    sparkle(this.fx, p.x, p.y, p.z, 6, this.G.eye, 1.6, 2, 0.018, 0.5);
    this.sound('squeak', { pitch: 0.8 });
  }
}
