// Shade Bats: a little swarm that roosts upside down under cave ceilings. The lamp (or a mole
// walking right under them) wakes them; they whirl around the mole's head as a flock and take
// turns swooping at the lamp. One whack each.
import { Enemy, TAU } from './base.js';
import { VB, VS, c01 } from './vox.js';
import { H, taper, eye, hramp, lit, bake, clumps } from './voxKit.js';
import { socketEye, mouth, nostrils } from './face.js';
import { puff, sparkle } from './fx.js';
import { rand, clamp } from '../../core/util.js';

const FUR = [0x1e1529, 0x2c2040, 0x3d2f58, 0x544476, 0x6e5e94];
const WING = [0x2e1c40, 0x45295e, 0x5e3a7a, 0x7a5296], BONE = 0x1c1228, EAR = [0x7a4a6a, 0xb47896, 0xe0a0b8];

// (wave 16) redrawn at half the old voxel (voxKit H): a furry body with a ruff, a round head with
// big veined ears and a pug snout with a nose-leaf, fangs; wings of real membrane stretched between
// an arm and three finger bones, scalloped between the tips, with a thumb claw at the wrist.
export function buildBat() {
  // (wave 17) structured light in soft clumps (no per-voxel static), a pale chest, baked AO and rim
  const FR = hramp(FUR[3], 6, { step: 0.1 });
  const furSh = () => lit(FR, { clump: 0.3, cs: 2.6, seed: 4, bias: -0.05 });
  const body = (ev = new VB()) => {
    const b = new VB(91), sh = furSh(b);
    b.ell(0, -1, -1, 4.6, 5.2, 4.4, sh); // body
    b.ell(0, 3.2, 2.4, 4, 3.6, 3.6, sh); // head
    b.ell(0, 0.6, 1.2, 4.4, 2.4, 3.6, lit(FR, { bias: 0.18 })); // the ruff
    b.ell(0, -1.6, 2.2, 2.8, 3.2, 1.8, lit(FR, { bias: 0.1 })); // chest
    clumps(b, 10, { tones: FR.slice(2, 5), seed: 6, len: [1.2, 2], r: 1, droop: 0.5, filter: (x, y, z) => y < 2 && y > -2 && z > -1 });
    for (const sd of [1, -1]) {
      const X = (x) => (sd > 0 ? x : -1 - x);
      // ears: tall, tilted out, a pink inside with dark veins
      taper(b, 2.2, 5, 2.4, 4.6, 11.5, 1.4, 1.8, 0.5, (x, y, z, t) => (z > 2.6 && t > 0.15 && t < 0.92 ? ((y % 3) ? EAR[1] : EAR[0]) : t > 0.9 ? EAR[2] : FUR[2]));
      // feet: little hooked claws under the body
      b.set(X(1), -6, 0, FUR[1]); b.set(X(2), -7, 0, BONE); b.set(X(2), -7, 1, 0xd8ccd8);
    }
    b.mirrorX();
    // pug snout, nose-leaf, mouth
    b.ell(0, 2.2, 5.4, 2.2, 1.6, 1.4, FUR[3]);
    bake(b, { ao: 0.4, rim: 0.25 });
    // (no simple face) a sculpted spear of a nose-leaf with a dark rim, flared nostrils, a snarling
    // open mouth with gums, needle teeth and two long fangs; eyes deep in sockets under fur brows
    taper(b, 0, 2.6, 6.6, 0, 5.8, 6.4, 1.2, 0.35, (x, y, z, t) => (t > 0.75 ? EAR[2] : Math.abs(x + 0.5) > 0.6 ? EAR[0] : EAR[1]));
    nostrils(b, 0, 2.4, 1.8, { r: 0.55, col: 0x1a0a12, rim: EAR[1] });
    mouth(b, 0, 0.4, { w: 4.8, h: 2.4, d: 2, curve: 0.2, gap: 1, fangs: [-0.6, 0.6], fang: 2, lower: true, tooth: 0xf4eef0, gum: 0xa04060, throat: 0x1a0610, tongue: 0xe06a8a, lip: FR[1] });
    for (const sd of [1, -1]) socketEye(b, ev, sd * 1.9, 3.9, sd, { r: 1.25, depth: 0.45, iris: 0xff5a8a, pupil: 0x1a0410, slit: true, pr: 0.55, ir: 0.55, sclera: 0x3a2030, lid: 0.26, tilt: 0.45, skin: FR[2], brow: FR[4], browR: 0.8 }); // (dark beady balls, a pink ring: no red visor)
    return b;
  };
  /** One wing (sd = 1 right, -1 left) raised to angle a (radians up from level). */
  const wing = (b, a, sd) => {
    const SH = [0, 0], WR = [7, -1], TIPS = [[17, 0], [15.5, 6.5], [11, 10.5]], TR = [0.5, 8.5];
    const poly = [SH, WR, ...TIPS, TR];
    const inPoly = (u, v) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [ui, vi] = poly[i], [uj, vj] = poly[j];
        if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) c = !c;
      }
      return c;
    };
    const seg = (u, v, p, q) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], t = clamp(((u - p[0]) * dx + (v - p[1]) * dy) / (dx * dx + dy * dy), 0, 1);
      return Math.hypot(u - p[0] - dx * t, v - p[1] - dy * t);
    };
    // scallops: a bite out of the trailing edge between each pair of tips
    const trail = [[TIPS[0], TIPS[1]], [TIPS[1], TIPS[2]], [TIPS[2], TR]];
    const bitten = (u, v) => trail.some(([p, q]) => {
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, L = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const nx = (q[1] - p[1]) / L, ny = -(q[0] - p[0]) / L; // outward (away from the wrist)
      const s = (mx - WR[0]) * nx + (my - WR[1]) * ny > 0 ? 1 : -1;
      return Math.hypot(u - (mx + nx * s * L * 0.42), v - (my + ny * s * L * 0.42)) < L * 0.5;
    });
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let u = 0; u <= 18; u += 0.5) for (let v = -2; v <= 11; v += 0.5) {
      const arm = seg(u, v, SH, WR) < 1.1, fing = TIPS.some((t) => seg(u, v, WR, t) < 0.55);
      if (!arm && !fing && (!inPoly(u, v) || bitten(u, v))) continue;
      const x = 4.2 + u * ca, y = 0.5 + u * sa, z = 1 - v;
      let c;
      if (arm || fing) c = BONE;
      else {
        const vein = TIPS.some((t) => Math.abs(seg(u, v, [0, 3], t) - 0) < 0.4) && u > 2;
        const edge = !inPoly(u + 1, v + 1) || !inPoly(u - 1, v + 1);
        c = vein ? WING[0] : edge ? WING[3] : u < 4 ? WING[1] : WING[2];
      }
      const X = Math.round(x);
      b.set(sd > 0 ? X : -1 - X, Math.round(y), Math.round(z), c);
    }
    // thumb claw at the wrist
    const wx = Math.round(4.2 + 7 * ca), wy = Math.round(0.5 + 7 * sa);
    b.set(sd > 0 ? wx : -1 - wx, wy + 1, 2, 0xd8ccd8);
  };
  const wingAngles = [0.85, 0.1, -0.7];
  const frames = wingAngles.map((a) => { const b = body(); wing(b, a, 1); wing(b, a, -1); return b.geo(0, 0, 0, H); });
  const folded = body();
  for (const sd of [1, -1]) {
    const X = (x) => (sd > 0 ? x : -1 - x);
    // wings wrapped round like a cloak, the wrist claws up by the ears
    for (let y = -7; y <= 3; y++) for (let z = -3; z <= 3; z++) {
      const xx = 5 + (Math.abs(z) > 2 ? -1 : 0) + (y < -4 ? -1 : 0);
      folded.set(X(xx), y, z, z === 3 ? BONE : z % 2 === 0 ? WING[0] : y < -4 ? WING[2] : WING[1]); // (wave 17: fold ribs, not a diagonal hatch)
    }
    folded.set(X(5), 4, 2, BONE); folded.set(X(5), 5, 2, 0xd8ccd8);
  }
  frames.push(folded.geo(0, 0, 0, H));
  // eyes: glowing, with a slit pupil and a glint (placed at (0, 0.5, 2) VS = (0, 1, 4) H)
  const eyes = new VB();
  body(eyes); // (the eyeballs, as seated in the sockets every frame's body carves)
  return { frames, eyes: eyes.geo(0, 1, 4, H), fur: c01(FUR[2]), eye: [1, 0.35, 0.55] };
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
    // (wave 13) they drop off the roost in a shower of grit and fur
    const r = this.roost || lead?.hang;
    if (r) { puff(mgr.fx, r.x, r.y - 0.05, r.z, 8, [0.32, 0.27, 0.36], 0.35, -0.3, 0.06, 0.55); for (let i = 0; i < 10; i++) mgr.fx.spawn({ x: r.x + rand(-0.4, 0.4), y: r.y - 0.02, z: r.z + rand(-0.4, 0.4), vx: rand(-0.3, 0.3), vy: rand(-0.6, 0), vz: rand(-0.3, 0.3), life: rand(0.6, 1.1), size: rand(0.012, 0.02), color: [0.35, 0.3, 0.28], drag: 0.6, grav: 9, bounce: 0.3, fade: false }); }
  }
  /**
   * (wave 13) A flockmate is struck: the whole flock bursts apart from that point with a screech,
   * shedding fur, and wheels back together a moment later (a breather before the next swoop).
   */
  scatter(mgr, from) {
    if (mgr.time - (this.scatterT ?? -9) < 0.6) return;
    this.scatterT = mgr.time;
    let n = 0;
    for (const b of this.members) {
      if (!b.alive || b.state === 'roost' || b.state === 'hurt') continue;
      let dx = b.pos.x - from.x, dy = b.pos.y - from.y, dz = b.pos.z - from.z;
      const l = Math.hypot(dx, dy, dz);
      if (l < 1e-3) { dx = rand(-1, 1); dz = rand(-1, 1); dy = 0.3; } else { dx /= l; dy /= l; dz /= l; }
      const sp = rand(4.5, 6);
      b.vel.set(dx * sp + rand(-1, 1), dy * sp + rand(1, 2.2), dz * sp + rand(-1, 1));
      b.setState('scatter');
      b.sqv += 6;
      puff(mgr.fx, b.pos.x, b.pos.y, b.pos.z, 2, b.G.fur.map((k) => k * 0.7), 0.06, 0.2, 0.05, 0.6);
      n++;
    }
    // the burst itself: a ring of fur and dust thrown out from the blow
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU, sp = rand(1.6, 2.6);
      mgr.fx.spawn({ x: from.x, y: from.y, z: from.z, vx: Math.cos(a) * sp, vy: rand(-0.4, 0.8), vz: Math.sin(a) * sp, life: rand(0.5, 0.8), size: rand(0.025, 0.04), grow: 0.05, color: FURC[i % 4], alpha: 0.8, drag: 3, grav: 0.4, lit: 0.6 });
    }
    if (n) { mgr.sound('scatter', {}, 2); this.swoopT = Math.max(this.swoopT, 1.8); }
  }
}
const FURC = FUR.map(c01);

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
      case 'scatter': {
        // flung out, braking hard, wings beating fast, fur flying
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 2.6));
        this.vel.y += dt * 1.5;
        this.squint = 0.55;
        if (Math.random() < dt * 14) this.fx.spawn({ x: this.pos.x, y: this.pos.y, z: this.pos.z, vx: rand(-0.3, 0.3), vy: rand(-0.2, 0.2), vz: rand(-0.3, 0.3), life: rand(0.5, 0.9), size: rand(0.01, 0.016), color: FURC[(Math.random() * 4) | 0], drag: 1.5, grav: 1.2, swirl: 1, lit: 0.5 });
        if (this.st > 0.7) this.setState('fly');
        break;
      }
    }
  }

  onHit() {
    this.swarm.wake(this.mgr);
    this.setState('hurt');
    this.sound('squeak', { pitch: 1.2 });
    this.swarm.scatter(this.mgr, this.pos);
  }

  animate(dt) {
    const r = this.state === 'roost';
    this.root.rotation.z = r ? Math.PI : clamp(-this.vel.x * Math.cos(this.yaw) * 0.15 + this.vel.z * Math.sin(this.yaw) * 0.15, -0.6, 0.6);
    this.root.rotation.x = r ? 0 : clamp(-this.vel.y * 0.1, -0.5, 0.5);
    if (!r) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0.2) this.yaw += Math.atan2(Math.sin(Math.atan2(this.vel.x, this.vel.z) - this.yaw), Math.cos(Math.atan2(this.vel.x, this.vel.z) - this.yaw)) * Math.min(1, dt * 8);
      if (this.state === 'aim') this.facePlayer(10, dt);
      this.flapT += dt * (this.state === 'dive' ? 6 : this.state === 'aim' || this.state === 'scatter' ? 24 : 14);
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
    this.swarm.scatter(this.mgr, p);
  }
}
