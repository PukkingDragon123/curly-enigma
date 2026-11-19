// Ember Imp: a horned fire sprite from the Magma Deep. Never stops bouncing, keeps its distance,
// giggles, and lobs ember blobs that arc, bounce off the rock and fizzle in a shower of sparks.
import { Enemy } from './base.js';
import { VB, VS, mul, mix, c01 } from './vox.js';
import { H, taper, eye } from './voxKit.js';
import { sparkle, puff, fireSpray } from './fx.js';
import { rand, clamp } from '../../core/util.js';

const PAL = {
  4: { skin: 0xe0502a, dark: 0xa8321a, light: 0xff8a4a, belly: 0xffb868, flame: [0xd8401a, 0xff7a1a, 0xffb43a, 0xfff0a0], eye: 0xfff070, light3: [1.5, 0.62, 0.2] },
  6: { skin: 0x8a3ad8, dark: 0x5a2098, light: 0xb070ff, belly: 0xe0b0ff, flame: [0x6a2ad8, 0xa060ff, 0xe0a0ff, 0xffffff], eye: 0xfff4b0, light3: [0.9, 0.5, 1.5] },
};
const palFor = (z) => (z >= 6 ? PAL[6] : PAL[4]);

export function buildImp(zone) {
  // (wave 16) at half the old voxel: a pot-bellied ember imp with a scaly belly plate, a big round
  // head, ridged horns curling back, long pointed ears, a heavy brow, a toothy grin, three-toed
  // clawed feet, clawed hands, a whip tail with a flame tip, and a crown of layered flame tongues
  const P = palFor(zone);
  const b = new VB(51);
  const skin = (x, y, z, nx, ny, nz) => {
    const k = ny * 0.6 + nz * 0.3 + (b.n(x, y, z) - 0.5) * 0.25 + ((x * 7 + y * 3 + z * 5) % 9 === 0 ? -0.25 : 0);
    return k > 0.5 ? P.light : k < -0.35 ? P.dark : P.skin;
  };
  b.ell(0, 7.2, 0, 6.4, 6.6, 5.6, (x, y, z, nx, ny, nz) => (nz > 0.5 && ny < 0.5 ? (((y + 40) % 3 === 0) ? mix(P.belly, P.dark, 0.3) : P.belly) : skin(x, y, z, nx, ny, nz)));
  b.ell(0, 18, 0.6, 9.4, 8.4, 8.6, skin);
  b.ell(0, 16, 6.6, 4.2, 2.6, 2.6, skin); // muzzle
  for (const sd of [1, -1]) {
    // feet: three toes with dark claws
    for (const dz of [-1.2, 0, 1.2]) taper(b, sd * 3.2, 0.8, 1, sd * (3.2 + dz * 0.6), 0.6, 4.2 + Math.abs(dz) * -0.6, 1.2, 0.9, P.dark);
    for (const dz of [-1, 0, 1]) b.set(Math.round(sd * (3.2 + dz * 0.8)), 0, 5, 0x2a1410);
    // ears: long and pointed, swept out and back, a darker inside
    taper(b, sd * 8.6, 18.5, 0, sd * 15, 21, -2.5, 2.2, 0.4, (x, y, z, t) => (z > -0.5 && t > 0.2 && t < 0.85 ? P.dark : P.skin));
    // horns: ridged rings, curling back and up
    let hx = 4.5, hy = 24.5, hz = 0;
    for (let i = 0; i < 6; i++) {
      const nx = hx + 0.8 + i * 0.15, ny = hy + 1.8 - i * 0.15, nz = hz - 1 - i * 0.35;
      taper(b, sd * hx, hy, hz, sd * nx, ny, nz, 1.9 - i * 0.25, 1.7 - i * 0.25, (i & 1) ? 0x3a2420 : i > 3 ? 0x8a6a52 : 0x5a3a2c);
      hx = nx; hy = ny; hz = nz;
    }
    // cheeks
    b.ell(sd * 5.6, 15.5, 5.6, 1.6, 1.2, 1, mix(P.skin, 0xff9a9a, 0.55));
  }
  // heavy brow ridge over the eyes
  for (let x = -8; x <= 7; x++) { const y = 21 + (Math.abs(x + 0.5) > 5 ? -1 : 0); const h = b.hitFrom(x, y, 20, 0, 0, -1); if (h) b.set(h[0], h[1], h[2] + 1, P.dark); }
  // face: nostrils, a wide grin with a row of teeth and two fangs
  const front = (x, y) => { for (let z = 18; z > -12; z--) if (b.has(x, y, z)) return z; return 0; };
  b.set(-1, 17, front(-1, 17), 0x2a0a08); b.set(0, 17, front(0, 17), 0x2a0a08);
  for (let x = -5; x <= 4; x++) {
    const up = Math.abs(x + 0.5) > 3.5 ? 1 : 0, y = 13 + up;
    b.set(x, y, front(x, y), 0x3a0e0a);
    if (!up) b.set(x, y + 1, front(x, y + 1), (x & 1) ? 0xfff4e0 : 0xe8dcc8);
  }
  b.set(-3, 12, front(-3, 12) , 0xfff4e0); b.set(2, 12, front(2, 12), 0xfff4e0); // fangs
  // whip tail with a flame tip
  taper(b, 0, 4, -4.5, 0, 5, -9, 1.3, 1, P.dark); taper(b, 0, 5, -9, 0, 9, -12, 1, 0.8, P.dark); taper(b, 0, 9, -12, 0, 12, -11.5, 0.8, 0.6, P.dark);
  b.ell(0, 13.5, -11.5, 1.6, 2, 1.4, P.flame[2]); b.set(0, 15, -11, P.flame[3]); b.set(0, 16, -12, P.flame[3]); b.set(0, 13, -13, P.flame[1]);
  // eyes (big, glowing; placed at (0, 9, ez) VS)
  const eyes = new VB(), angry = new VB();
  for (const [vb, col, a] of [[eyes, P.eye, false], [angry, 0xff3a2a, true]]) {
    for (const sd of [1, -1]) eye(vb, sd * 3.6, 18.5, 0, 2.2, 2.9, { iris: col, pupil: mul(col, 0.25), slit: true, pr: 0.5, lid: a ? P.dark : undefined, on: b });
  }
  const ez = (Math.max(front(3, 18), front(-4, 18)) + 1) / 2;
  // arm (pivot at the shoulder): a tapered limb and three claws
  const arm = new VB(52);
  taper(arm, 0, -1, 0, 1, -5, 1, 2.2, 1.6, P.skin);
  for (const dx of [-1, 0, 1]) taper(arm, 1 + dx, -5.5, 1.5, 1 + dx * 1.5, -7, 3, 0.8, 0.4, dx ? P.light : 0x2a1410);
  // flame tuft (pivot at its base): layered tongues, dark at the root, white-hot at the tips
  const fl = new VB(53);
  fl.ell(0, 1.5, 0, 5, 3, 4.6, (x, y) => (y <= 0 ? P.flame[0] : P.flame[1]));
  for (const [x, z, h, l] of [[0, -1, 11, 0], [2.5, 0, 8, 0.25], [-2.5, 0.5, 8, -0.25], [1.2, 2.5, 6, 0.1], [-1.5, -2.5, 7, -0.1]]) {
    taper(fl, x, 2, z, x + l * h, 2 + h, z - h * 0.25, 2.4, 0.4, (xx, yy, zz, t) => P.flame[Math.min(3, 1 + Math.floor(t * 3))]);
  }
  // ember blob (the thing it throws): a cracked coal, glowing in the cracks
  const blob = new VB(54);
  blob.ell(0, 0, 0, 3.4, 3.4, 3.4, (x, y, z, nx, ny) => ((x + y * 2 + z) % 4 === 0 ? P.flame[3] : ny > 0.45 ? P.flame[2] : ny > -0.2 ? P.flame[1] : P.flame[0]));
  blob.set(0, 4, 0, P.flame[3]); blob.set(-1, 3, 2, 0xffffff);
  return {
    body: b.geo(0, 0, 0, H), eyes: eyes.geo(0, 18, ez * 2, H), angry: angry.geo(0, 18, ez * 2, H), ez, arm: arm.geo(0, 0, 0, H), flame: fl.geo(0, 0, 0, H), blob: blob.geo(0, 0, 0, H),
    light3: P.light3, ember: c01(P.flame[2]), hot: c01(P.flame[1]), smoke: [0.2, 0.17, 0.16],
  };
}

export class Imp extends Enemy {
  static info = { id: 'ember_imp', name: 'Ember Imp', color: '#ff7a3a', hits: 2, dmg: 4, lavaProof: true, fire: true, snd: 'flesh' };
  static tells = { windup: [0.55], belch: [0.5] };
  static resume = 'kite';
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
        // (wave 13) crowd it and it puffs its cheeks and belches a spray of fire sparks
        else if (this.grounded && this.atkCd <= 0 && this.sees && this.hd < 1.9 && this.lost === 0 && !m.safe) { this.setState('belch'); this.sound('imp_inhale', {}); }
        break;
      }
      case 'belch': {
        // the tell: cheeks swell, the head flame roars up, embers are sucked into its mouth
        this.facePlayer(8, dt);
        this.sqT = -0.1 - this.st * 0.25;
        this.shiver = 0.25 + this.st;
        this.squint = 0.6;
        if (Math.random() < dt * 30) { const mo = this.mouth(); this.fx.spawn({ x: mo.x + rand(-0.25, 0.25), y: mo.y + rand(-0.1, 0.25), z: mo.z + rand(-0.25, 0.25), vx: 0, vy: 0, vz: 0, life: 0.18, size: 0.016, color: this.G.ember, glow: true, drag: 0 }); }
        if (this.st > 0.5) { this.setState('spew'); this.spitFire(); }
        break;
      }
      case 'spew': {
        // a short gout of sparks (0.3 s), the recoil hops it back
        const mo = this.mouth(), f = this.spewDir;
        if (this.st < 0.3) fireSpray(this.fx, mo.x, mo.y, mo.z, f[0], f[1], f[2], Math.max(2, Math.round(80 * dt * (this.fx.lod || 1) * 3)), this.G.hot, this.G.ember, 0.28, 5.5);
        if (this.st > 0.3) { this.setState('kite'); this.atkCd = rand(1.8, 2.8); }
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
    this.eyes.geometry = this.state === 'windup' || this.state === 'throw' || this.state === 'belch' || this.state === 'spew' ? this.G.angry : this.G.eyes;
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

  /** Where its mouth is (world). */
  mouth() {
    const s = this.size;
    return { x: this.pos.x + Math.sin(this.yaw) * 0.16 * s, y: this.pos.y + 0.24 * s, z: this.pos.z + Math.cos(this.yaw) * 0.16 * s };
  }

  /** The belch: sparks along a cone at the mole's chest; it burns if you're still in the cone. */
  spitFire() {
    const m = this.mgr, mo = this.mouth();
    const dx = m.pc.x - mo.x, dy = m.pc.y + 0.1 - mo.y, dz = m.pc.z - mo.z, d = Math.hypot(dx, dy, dz) || 1;
    // aimed when the tell started (the yaw it faces): sidestep and it misses
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.spewDir = [fx, clamp(dy / d, -0.5, 0.4), fz];
    fireSpray(this.fx, mo.x, mo.y, mo.z, fx, this.spewDir[1], fz, Math.round(40 * (this.fx.lod || 1)), this.G.hot, this.G.ember, 0.3, 6);
    puff(this.fx, mo.x + fx * 0.2, mo.y + 0.05, mo.z + fz * 0.2, 6, this.G.smoke, 0.1, 0.5, 0.07, 0.5);
    this.sound('fire_spit', {});
    this.sqv += 10;
    this.vel.x -= fx * 2.2; this.vel.z -= fz * 2.2; this.vel.y = 2; // the recoil
    const inCone = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) > 0.8;
    if (d < 2.4 && inCone) this.hurtPlayer(this.info.dmg * 0.6, [fx * 2.4, 1.2, fz * 2.4], 'burn');
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
    const belch = this.state === 'belch' ? Math.min(1, this.st / 0.45) : this.state === 'spew' ? Math.max(0, 1 - this.st / 0.3) : 0;
    const f = this.flick * (1 + throwK * 0.6 + belch * 0.9);
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
