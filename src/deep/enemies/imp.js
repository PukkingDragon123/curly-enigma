// Ember Imp: a horned fire sprite from the Magma Deep. Never stops bouncing, keeps its distance,
// giggles, and lobs ember blobs that arc, bounce off the rock and fizzle in a shower of sparks.
import { Enemy } from './base.js';
import { VB, VS, mul, mix, c01 } from './vox.js';
import { sparkle, puff } from './fx.js';
import { rand, clamp } from '../../core/util.js';

const PAL = {
  4: { skin: 0xe0502a, dark: 0xa8321a, light: 0xff8a4a, belly: 0xffb868, flame: [0xd8401a, 0xff7a1a, 0xffb43a, 0xfff0a0], eye: 0xfff070, light3: [1.5, 0.62, 0.2] },
  6: { skin: 0x8a3ad8, dark: 0x5a2098, light: 0xb070ff, belly: 0xe0b0ff, flame: [0x6a2ad8, 0xa060ff, 0xe0a0ff, 0xffffff], eye: 0xfff4b0, light3: [0.9, 0.5, 1.5] },
};
const palFor = (z) => (z >= 6 ? PAL[6] : PAL[4]);

export function buildImp(zone) {
  const P = palFor(zone);
  const b = new VB(51);
  const skin = (x, y, z, nx, ny, nz) => {
    const k = ny * 0.6 + nz * 0.3 + (b.n(x, y, z) - 0.5) * 0.3;
    return k > 0.45 ? P.light : k < -0.35 ? P.dark : P.skin;
  };
  b.ell(0, 3.6, 0, 3.2, 3.2, 2.8, (x, y, z, nx, ny, nz) => (nz > 0.45 && ny < 0.5 ? P.belly : skin(x, y, z, nx, ny, nz)));
  b.ell(0, 9, 0.3, 4.7, 4.2, 4.3, skin);
  // feet
  b.box(1, 0, -1, 2, 0, 2, P.dark); b.box(-3, 0, -1, -2, 0, 2, P.dark);
  // pointy ears and curly horns
  for (const sd of [1, -1]) {
    const X = (x) => (sd > 0 ? x : -1 - x);
    b.set(X(5), 9, 0, P.skin); b.set(X(6), 10, 0, P.skin); b.set(X(5), 10, 0, P.light);
    const horn = [[3, 12, 0], [3, 13, 0], [4, 13, -1], [4, 14, -1], [5, 15, -1], [5, 16, -2]];
    horn.forEach(([x, y, z], i) => b.set(X(x), y, z, i > 3 ? 0x6a4a3a : 0x3a2420));
  }
  // face: grin, a fang, rosy cheeks
  const front = (x, y) => { for (let z = 9; z > -6; z--) if (b.has(x, y, z)) return z; return 0; };
  for (let x = -2; x <= 1; x++) b.set(x, 6, front(x, 6), 0x3a0e0a);
  b.set(-3, 7, front(-3, 7), 0x3a0e0a); b.set(2, 7, front(2, 7), 0x3a0e0a);
  b.set(0, 6, front(0, 6), 0xfff4e0);
  b.set(3, 7, front(3, 7), mix(P.skin, 0xff9a9a, 0.6)); b.set(-4, 7, front(-4, 7), mix(P.skin, 0xff9a9a, 0.6));
  // tail with a flame tip
  for (const [x, y, z] of [[0, 2, -3], [0, 2, -4], [0, 3, -5], [0, 4, -6], [0, 5, -6]]) b.set(x, y, z, P.dark);
  b.set(0, 6, -6, P.flame[2]); b.set(0, 6, -7, P.flame[1]); b.set(0, 7, -6, P.flame[3]);
  // eyes (big, glowing)
  const eyes = new VB(), angry = new VB();
  for (const [vb, col, a] of [[eyes, P.eye, false], [angry, 0xff3a2a, true]]) {
    for (const [x0, sd] of [[1, 1], [-3, -1]]) {
      for (let y = 0; y < 3; y++) for (let x = 0; x < 2; x++) {
        const inner = sd > 0 ? x === 0 : x === 1;
        if (a && y === 2 && inner) continue;
        vb.set(x0 + x, 8 + y, 0, y === 2 && !inner ? 0xffffff : col);
      }
    }
  }
  const ez = Math.max(front(1, 9), front(-2, 9)) + 1;
  // arm (pivot at the shoulder)
  const arm = new VB(52);
  arm.cap(0, -0.5, 0, 0.5, -2.5, 0.5, 1.1, P.skin);
  arm.set(0, -3, 1, P.light); arm.set(1, -3, 1, P.light);
  // flame tuft (pivot at its base)
  const fl = new VB(53);
  fl.ell(0, 1, 0, 2.6, 2, 2.4, (x, y) => (y <= 0 ? P.flame[0] : P.flame[1]));
  fl.ell(0, 3, -0.5, 1.8, 1.8, 1.6, (x, y) => (y >= 4 ? P.flame[3] : P.flame[2]));
  fl.set(0, 5, -1, P.flame[3]); fl.set(-1, 6, -1, P.flame[3]); fl.set(1, 4, 1, P.flame[2]);
  // ember blob (the thing it throws)
  const blob = new VB(54);
  blob.ell(0, 0, 0, 1.7, 1.7, 1.7, (x, y, z, nx, ny) => (ny > 0.45 ? P.flame[3] : ny > -0.2 ? P.flame[2] : ny > -0.6 ? P.flame[1] : P.flame[0]));
  blob.set(0, 2, 0, P.flame[3]); blob.set(-1, 1, 1, 0xffffff);
  return {
    body: b.geo(0, 0, 0), eyes: eyes.geo(0, 9, 0), angry: angry.geo(0, 9, 0), ez, arm: arm.geo(0, 0, 0), flame: fl.geo(0, 0, 0), blob: blob.geo(0, 0, 0),
    light3: P.light3, ember: c01(P.flame[2]), hot: c01(P.flame[1]), smoke: [0.2, 0.17, 0.16],
  };
}

export class Imp extends Enemy {
  static info = { id: 'ember_imp', name: 'Ember Imp', color: '#ff7a3a', hits: 2, dmg: 4, lavaProof: true, fire: true, snd: 'flesh' };
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.14; this.h = 0.42; this.cy = 0.3; this.hitR = 0.27;
    this.lavaProof = true;
    this.mass = 0.6; this.kb = 3.5;
    this.springK = 320; this.springC = 7; // very bouncy
    const G = this.G = mgr.geo('imp|' + (this.zone >= 6 ? 6 : 4), () => buildImp(this.zone));
    this.mat = this.material({ emissive: 0.22 });
    this.hot = this.material({ emissive: 1.4 });
    this.body = this.part(G.body, this.mat);
    this.eyes = this.part(G.eyes, this.hot, this.root, 0, 9 * VS, G.ez * VS);
    this.arms = [1, -1].map((sd) => { const a = this.part(G.arm, this.mat, this.root, sd * 3.3 * VS, 5.2 * VS, 0); if (sd < 0) a.scale.x = -1; return a; });
    this.flame = this.part(G.flame, this.hot, this.root, 0, 12.5 * VS, -0.5 * VS);
    this.state = 'idle';
    this.hopT = rand(0.2, 0.8);
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.lost = 0;
    this.flick = 1;
  }

  think(dt) {
    const m = this.mgr;
    this.squint = 1;
    if (this.grounded) this.sqT = 0; else this.sqT = clamp(this.vel.y * 0.07, -0.15, 0.32);
    switch (this.state) {
      case 'idle': {
        this.hopLoop(dt, 0, 0.3, [2.4, 3]);
        if (this.dist < 10 && this.sees && !m.safe) { this.wake(); this.setState('kite'); this.sound('laugh', { pitch: 760 }); }
        break;
      }
      case 'kite': {
        if (m.safe || this.dist > 16) { this.lost += dt; if (this.lost > 5) { this.awake = false; this.lost = 0; this.setState('idle'); break; } }
        else this.lost = 0;
        this.facePlayer(7, dt);
        const [dx, dz] = this.dirToPlayer();
        let mx = 0, mz = 0;
        if (this.hd < 3.4) { mx = -dx; mz = -dz; } else if (this.hd > 6.5) { mx = dx; mz = dz; }
        if (Math.random() < dt * 0.4) this.side = -this.side;
        mx += -dz * this.side * 0.8; mz += dx * this.side * 0.8;
        const n = Math.hypot(mx, mz) || 1;
        this.hopLoop(dt, mx / n, mz / n, [3.6, 4.6], this.hd < 2 ? 2.8 : 1.8);
        if (this.grounded && this.atkCd <= 0 && this.sees && this.hd > 2.2 && this.hd < 9 && this.lost === 0 && !m.safe) { this.setState('windup'); this.sound('laugh', { pitch: 880 }); }
        break;
      }
      case 'windup': {
        this.facePlayer(9, dt);
        this.sqT = -0.18 - this.st * 0.2;
        this.shiver = 0.3;
        this.squint = 0.8;
        if (Math.random() < dt * 20) this.fx.ember(this.pos.x, this.pos.y + 0.6, this.pos.z);
        if (this.st > 0.55) { this.throwBlob(); this.setState('throw'); this.sqv += 9; this.vel.y = 2.2; }
        break;
      }
      case 'throw':
        this.squint = 0.8;
        if (this.st > 0.35) { this.setState('kite'); this.atkCd = rand(1.7, 2.7); }
        break;
      case 'hurt':
        if (this.st > 0.35) this.setState('kite');
        break;
    }
    this.eyes.geometry = this.state === 'windup' || this.state === 'throw' ? this.G.angry : this.G.eyes;
    // water is bad news for a fire sprite
    if (this.inFluid === 1) {
      this.hp -= dt * 2;
      if (Math.random() < dt * 20) puff(this.fx, this.pos.x, this.pos.y + 0.4, this.pos.z, 1, [0.8, 0.8, 0.85], 0.1, 1, 0.06, 0.5);
      if (Math.random() < dt * 3) this.sound('steam', {});
      if (this.hp <= 0) this.mgr.kill(this, { x: 0, y: 1, z: 0 });
    }
  }

  /** Bounce, bounce, bounce: crouch, hop toward (mx, mz). */
  hopLoop(dt, mx, mz, vy, sp = 1.8) {
    if (!this.grounded) return;
    this.hopT -= dt;
    if (this.hopT < 0.12) this.sqT = -0.32;
    if (this.hopT <= 0) {
      const s = (mx || mz) ? rand(sp * 0.7, sp * 1.2) : 0;
      this.vel.set(mx * s + rand(-0.2, 0.2), rand(vy[0], vy[1]), mz * s + rand(-0.2, 0.2));
      this.sqv += 10;
      this.hopT = rand(0.18, 0.45);
      if (this.dist < 7 && Math.random() < 0.3) this.sound('squish', {});
    }
  }

  onLand(sp) {
    super.onLand(sp);
    this.sqv -= 3;
    if (sp > 2) { this.fx.sparks(this.pos.x, this.pos.y + 0.02, this.pos.z, 3, this.G.hot, [0, 1, 0], 1.5); }
  }

  throwBlob() {
    const m = this.mgr, pl = m.pl;
    const hx = this.pos.x + Math.sin(this.yaw) * 0.12 + Math.cos(this.yaw) * 0.14, hy = this.pos.y + 0.55, hz = this.pos.z + Math.cos(this.yaw) * 0.12 - Math.sin(this.yaw) * 0.14;
    // aim where the mole is going to be (a fair lead, and a wobble)
    const T = clamp(this.dist / 6.5, 0.45, 1.1);
    const tx = pl.pos.x + pl.vel.x * T * 0.6 + rand(-0.25, 0.25), ty = pl.pos.y + 0.45, tz = pl.pos.z + pl.vel.z * T * 0.6 + rand(-0.25, 0.25);
    const g = 9;
    const v = [(tx - hx) / T, (ty - hy + 0.5 * g * T * T) / T, (tz - hz) / T];
    m.addShot({ x: hx, y: hy, z: hz, v, g, geo: this.G.blob, dmg: this.info.dmg, zone: this.zone, src: this, ember: this.G.ember, hot: this.G.hot, light: this.G.light3 });
    this.sound('whoosh', { vol: 0.5 });
    this.sound('ignite', { vol: 0.5 });
  }

  onHit() { this.setState('hurt'); this.sound('squeak', { pitch: 1.1 }); this.fx.sparks(this.center.x, this.center.y, this.center.z, 8, this.G.hot, [0, 1, 0], 2.5); }

  animate(dt) {
    const throwK = this.state === 'windup' ? Math.min(1, this.st / 0.4) : 0;
    const th = this.state === 'throw' ? Math.max(0, 1 - this.st / 0.3) : 0;
    // right arm winds back over the head and flings forward; the left one flails while hopping
    this.arms[0].rotation.x = -throwK * 2.6 + th * 1.2 + (this.grounded ? 0 : -0.6);
    this.arms[0].rotation.z = 0.25 + throwK * 0.2;
    this.arms[1].rotation.x = this.grounded ? Math.sin(this.t * 9) * 0.2 : -1.2;
    this.arms[1].rotation.z = -0.3 - (this.grounded ? 0 : 0.5);
    // flickering flame (grows when about to throw)
    this.flick += (rand(0.85, 1.2) - this.flick) * Math.min(1, dt * 18);
    const f = this.flick * (1 + throwK * 0.6);
    this.flame.scale.set(1 / Math.sqrt(f), f * (1 + Math.sin(this.t * 23) * 0.08), 1 / Math.sqrt(f));
    this.flame.rotation.z = Math.sin(this.t * 7) * 0.12 - this.vel.x * 0.04;
    this.flame.rotation.x = -this.vel.y * 0.04;
    if (Math.random() < dt * 9) this.fx.ember(this.pos.x, this.pos.y + 0.62 * this.size, this.pos.z);
  }

  light() {
    const k = (this.state === 'windup' ? 1.5 : 1) * this.flick;
    const c = this.G.light3;
    return { x: this.pos.x, y: this.pos.y + 0.55, z: this.pos.z, c: [c[0] * k, c[1] * k, c[2] * k], r: 3.6 };
  }

  deathFx() {
    const p = this.center;
    for (let i = 0; i < 18; i++) this.fx.ember(p.x, p.y, p.z);
    this.fx.sparks(p.x, p.y, p.z, 26, this.G.hot, [0, 1, 0], 4);
    sparkle(this.fx, p.x, p.y, p.z, 12, this.G.ember, 2.5, 3, 0.022, 0.8);
    puff(this.fx, p.x, p.y + 0.1, p.z, 10, this.G.smoke, 0.18, 0.7, 0.09, 0.55);
    this.sound('ignite', {});
  }
}
