// Gloom Wisp: a floating eye-orb with a ghostly tail. It eats light (a dark halo dims the rock
// around it), sneaks up behind the mole and drains energy on touch. Shine the lamp on it and it
// flinches, shuts its eye and flees — that's the moment to whack it.
import { Enemy, TAU, smooth } from './base.js';
import { VB, VS, mix, c01 } from './vox.js';
import { mote, stream, sparkle, puff } from './fx.js';
import { rand, clamp } from '../../core/util.js';
import { airBelow } from './physics.js';

const PAL = {
  2: { shell: [0x1e1430, 0x2e1e4a, 0x463068, 0x6a4a94], iris: 0xc89aff, tail: 0x5a3a9a, mote: [0.62, 0.45, 1] },
  3: { shell: [0x14182e, 0x1e2a4a, 0x2e406a, 0x4a6a9a], iris: 0x8ad0ff, tail: 0x3a5a9a, mote: [0.45, 0.7, 1] },
  5: { shell: [0x142430, 0x1e3a4a, 0x2e566a, 0x4a809a], iris: 0xa8f0ff, tail: 0x3a7a9a, mote: [0.5, 0.9, 1] },
  6: { shell: [0x1a0a26, 0x2a1240, 0x42205e, 0x683a8a], iris: 0xff8af0, tail: 0x7a2a9a, mote: [1, 0.5, 0.95] },
};
const palFor = (z) => PAL[z] || (z <= 2 ? PAL[2] : z === 4 ? PAL[6] : PAL[3]);

export function buildWisp(zone) {
  const P = palFor(zone);
  const orb = new VB(31);
  orb.ell(0, 0, 0, 5, 5, 5, (x, y, z, nx, ny, nz) => {
    const rim = nx * -0.4 + ny * 0.7 + nz * 0.5; // light from above-front
    const k = clamp(0.35 + rim * 0.45 + (orb.n(x, y, z) - 0.5) * 0.25, 0, 0.999);
    return P.shell[Math.floor(k * 4)];
  });
  // ghostly flames licking up from the crown
  for (const [x, z, h] of [[0, -1, 3], [2, -2, 2], [-3, -1, 2], [1, 1, 1]]) for (let i = 0; i < h; i++) orb.set(x, 5 + i, z, i === h - 1 ? P.shell[3] : P.shell[2]);
  // the big eye: sclera ring, glowing iris, pupil, highlight
  const eye = new VB(), red = new VB();
  for (const [vb, iris] of [[eye, P.iris], [red, 0xff4a5a]]) {
    for (let y = -3; y <= 2; y++) for (let x = -3; x <= 2; x++) {
      const corner = (x === -3 || x === 2) && (y === -3 || y === 2);
      if (corner) continue;
      const inIris = x >= -2 && x <= 1 && y >= -2 && y <= 1;
      const pupil = x >= -1 && x <= 0 && y >= -1 && y <= 0;
      let c = inIris ? iris : 0xeee6ff;
      if (inIris && y === -2) c = mix(iris, 0x000000, 0.3);
      if (pupil) c = 0x120818;
      if (x === -2 && y === 1) c = 0xffffff;
      vb.set(x, y, 5, c);
    }
  }
  const tails = [2.5, 1.9, 1.3].map((r, i) => {
    const t = new VB(40 + i);
    t.ell(0, 0, 0, r, r, r, (x, y, z, nx, ny) => mix(P.shell[1], P.tail, clamp(0.35 + ny * 0.4 - i * 0.1, 0, 1)));
    return t.geo(0, 0, 0);
  });
  return { orb: orb.geo(0, 0, 0), eye: eye.geo(0, -0.5, 5), red: red.geo(0, -0.5, 5), tails, mote: P.mote, glow: c01(P.iris) };
}

export class Wisp extends Enemy {
  static info = { id: 'gloom_wisp', name: 'Gloom Wisp', color: '#a87ae0', hits: 2, dmg: 4, flying: true, snd: 'crystal' };
  static tells = { charge: [0.55] };
  static resume = 'stalk';
  constructor(mgr, o) {
    super(mgr, o);
    this.rad = 0.2; this.cy = 0; this.hitR = 0.26;
    this.mass = 0.7; this.kb = 4.5;
    this.springK = 120; this.springC = 6;
    const G = this.G = mgr.geo('wisp|' + this.zone, () => buildWisp(this.zone));
    this.mat = this.material({ emissive: 0.35 });
    const eyeMat = this.material({ emissive: 1.5 });
    this.tailMat = this.material({ emissive: 0.55 });
    this.bob = this.group3();
    this.orb = this.part(G.orb, this.mat, this.bob);
    this.eyes = this.part(G.eye, eyeMat, this.bob, 0, -0.5 * VS, 5 * VS);
    // the tail lives in world space and trails behind
    this.tails = G.tails.map((g) => { const m = this.part(g, this.tailMat, mgr.root); m.position.copy(this.pos); return m; });
    this.home = this.pos.clone();
    this.target = this.pos.clone();
    this.state = 'drift';
    this.litT = 0;
    this.orbitA = Math.random() * TAU;
    this.floorT = 0; this.floor = 1;
    this.lost = 0;
  }

  think(dt) {
    const m = this.mgr, pc = m.pc;
    // how long the lamp has been on it
    const lit = this.awake && this.litBy(7.5, 0.94);
    this.litT = lit ? this.litT + dt : Math.max(0, this.litT - dt * 1.5);
    this.floorT -= dt;
    if (this.floorT <= 0) { this.floorT = 0.25; this.floor = airBelow(this.w, this.pos.x, this.pos.y, this.pos.z, 3); }
    const hover = (y) => y + clamp(1.15 - this.floor, -0.6, 0.8); // keep about a meter off the floor
    this.sqT = 0; this.squint = 1; this.eyeOpen = 1;
    let red = false;
    switch (this.state) {
      case 'drift': {
        if (this.pos.distanceTo(this.target) < 0.4 || this.st > 4) {
          this.st = 0;
          this.target.set(this.home.x + rand(-2.5, 2.5), this.home.y + rand(-0.5, 0.6), this.home.z + rand(-2.5, 2.5));
        }
        this.steer(this.target.x, hover(this.target.y), this.target.z, 0.6, 1.5, dt);
        if (this.dist < 9 && this.sees && !m.safe) { this.wake(); this.setState('stalk'); this.sound('wisp', {}); }
        break;
      }
      case 'stalk': {
        if (m.safe || this.dist > 16) { this.lost += dt; if (this.lost > 5) { this.awake = false; this.lost = 0; this.home.copy(this.pos); this.setState('drift'); break; } }
        else this.lost = 0;
        // drift around toward the mole's back
        const back = Math.atan2(-m.fwd.x, -m.fwd.z) + Math.PI;
        const da = Math.atan2(Math.sin(back - this.orbitA), Math.cos(back - this.orbitA));
        this.orbitA += clamp(da, -0.9 * dt, 0.9 * dt) + 0.15 * dt;
        const R = 2.6 + Math.sin(this.t * 0.7) * 0.4;
        const tx = pc.x + Math.sin(this.orbitA) * R, tz = pc.z + Math.cos(this.orbitA) * R;
        this.steer(tx, m.eye.y + Math.sin(this.t * 1.7) * 0.25, tz, 1.7, 1.8, dt);
        this.face(pc.x, pc.z, 4, dt);
        if (this.litT > 0.45) { this.setState('dazzled'); break; }
        if (this.atkCd <= 0 && this.dist < 3.6 && this.sees && !lit && this.lost === 0) { this.setState('charge'); this.sound('hiss', { vol: 0.5 }); }
        break;
      }
      case 'charge': {
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 5));
        this.face(pc.x, pc.z, 6, dt);
        this.sqT = 0.32; this.shiver = 0.6; this.squint = 0.65; red = true;
        if (this.litT > 0.3) { this.setState('dazzled'); break; }
        if (this.st > 0.55) {
          const dx = m.eye.x - this.pos.x, dy = m.eye.y - 0.15 - this.pos.y, dz = m.eye.z - this.pos.z, d = Math.hypot(dx, dy, dz) || 1;
          this.dash = [dx / d, dy / d, dz / d];
          this.setState('dash'); this.hitDone = false;
          this.sqv += 6; this.sound('whoosh', { vol: 0.5 });
        }
        break;
      }
      case 'dash': {
        red = true; this.squint = 0.65;
        this.vel.set(this.dash[0] * 5.5, this.dash[1] * 5.5, this.dash[2] * 5.5);
        this.sqT = 0.25;
        if (!this.hitDone && this.touches(0.05)) {
          this.hitDone = true;
          if (this.hurtPlayer(this.info.dmg, [this.dash[0] * 2, 1, this.dash[2] * 2], 'drain')) {
            stream(this.fx, m.eye.x, m.eye.y - 0.2, m.eye.z, this.pos.x, this.pos.y, this.pos.z, 24, this.G.mote);
            this.sound('wisp', {});
            this.mgr.say('drain', 'A <b>Gloom Wisp</b> drank some of your energy! Shine your lamp on it.', 'bad', 30);
          }
          this.setState('flee');
          this.sqv += 5;
        } else if (this.st > 0.7) this.setState('flee');
        break;
      }
      case 'dazzled': {
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
        this.eyeOpen = 1; this.squint = 0.12; this.shiver = 1; this.sqT = -0.2;
        if (this.st < dt * 1.5) { this.sound('squeak', { pitch: 1.4 }); sparkle(this.fx, this.pos.x, this.pos.y, this.pos.z, 6, this.G.mote, 1.2, 0, 0.02, 0.5); }
        if (this.st > 0.85) { this.setState('flee'); this.litT = 0; }
        break;
      }
      case 'flee': {
        const dx = this.pos.x - pc.x, dz = this.pos.z - pc.z, d = Math.hypot(dx, dz) || 1;
        this.steer(this.pos.x + (dx / d) * 2, hover(this.pos.y + 0.3), this.pos.z + (dz / d) * 2, 2.8, 3, dt);
        this.face(this.pos.x + dx, this.pos.z + dz, 5, dt);
        if (this.st > 1.8) { this.setState('stalk'); this.atkCd = rand(1.2, 2.2); }
        break;
      }
      case 'hurt': {
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
        this.squint = 0.4;
        if (this.st > 0.4) this.setState(Math.random() < 0.6 ? 'flee' : 'stalk');
        break;
      }
    }
    this.eyes.geometry = red ? this.G.red : this.G.eye;
  }

  onHit() { this.setState('hurt'); this.sound('squeak', { pitch: 1.2 }); }

  animate(dt) {
    this.bob.position.y = Math.sin(this.t * 2.2) * 0.05;
    this.bob.rotation.z = Math.sin(this.t * 1.3) * 0.12;
    this.bob.rotation.x = clamp(Math.hypot(this.vel.x, this.vel.z) * 0.08, 0, 0.35);
    // tail chain trails from the back of the orb
    const back = 0.17 * this.size;
    let px = this.pos.x - Math.sin(this.yaw) * back, py = this.pos.y + this.bob.position.y - 0.03, pz = this.pos.z - Math.cos(this.yaw) * back;
    const s = (0.4 + 0.6 * smooth(this.emerge)) * this.size;
    this.tails.forEach((t, i) => {
      const L = (0.09 + i * 0.01) * s;
      const p = t.position;
      p.y += (0.25 - i * 0.05) * dt; // ghostly drift up
      p.x -= Math.sin(this.yaw) * 0.6 * dt; p.z -= Math.cos(this.yaw) * 0.6 * dt; // and streams out behind
      const dx = p.x - px, dy = p.y - py, dz = p.z - pz, d = Math.hypot(dx, dy, dz) || 1;
      if (d > L) { p.set(px + (dx / d) * L, py + (dy / d) * L, pz + (dz / d) * L); }
      t.scale.setScalar(s * (1 + Math.sin(this.t * 6 - i) * 0.12));
      t.rotation.y = this.t * (1 + i * 0.4);
      px = p.x; py = p.y; pz = p.z;
    });
    // ghostly trail
    const tl = this.tails[2].position;
    if (Math.random() < dt * 30) mote(this.fx, tl.x, tl.y, tl.z, this.G.mote, 0.035, 0.8);
    if (Math.random() < dt * 6) mote(this.fx, this.pos.x + rand(-0.15, 0.15), this.pos.y + 0.2, this.pos.z + rand(-0.15, 0.15), this.G.mote, 0.02, 1.2);
  }

  updateSpheres() {
    super.updateSpheres();
    this.spheres[0].y += this.bob.position.y;
  }

  /** It eats light: a dark halo that dims the rock around it. */
  light() { return { x: this.pos.x, y: this.pos.y, z: this.pos.z, c: [-0.55, -0.5, -0.32], r: this.state === 'dazzled' ? 1.5 : 3.2, dark: true }; }

  dispose() {
    for (const t of this.tails) t.removeFromParent();
    super.dispose();
  }

  deathFx() {
    sparkle(this.fx, this.pos.x, this.pos.y, this.pos.z, 26, this.G.mote, 2.4, -0.5, 0.025, 1.1);
    puff(this.fx, this.pos.x, this.pos.y, this.pos.z, 10, this.G.mote.map((k) => k * 0.4), 0.2, 0.5, 0.08, 0.5);
    for (const t of this.tails) puff(this.fx, t.position.x, t.position.y, t.position.z, 3, this.G.mote.map((k) => k * 0.5), 0.1, 0.4, 0.06, 0.5);
  }
}
