// Spore Puffer: a waddling mushroom of the mossy caves. It notices you, waddles closer, swells up
// (trembling, glowing) and PUFFS a cloud of glowing spores that sting while you stand in it.
// Step back while it inflates; whack it while it's deflated and wobbly.
import { Enemy, smooth, easeBack } from './base.js';
import { VB, VS, mix, mul, c01 } from './vox.js';
import { spores, puff, sparkle } from './fx.js';
import { rand, clamp } from '../../core/util.js';

const CAPS = {
  1: { cap: [0x8a1e22, 0xb82e2e, 0xd84a3a, 0xf06a4a], spot: 0xfff0c0, spore: [1, 0.86, 0.45], light: [0.6, 0.42, 0.18] },
  2: { cap: [0x8a4a12, 0xc06a1a, 0xe08a2a, 0xf8aa4a], spot: 0xfff4b0, spore: [1, 0.72, 0.3], light: [0.6, 0.4, 0.12] },
  3: { cap: [0x0e4a5a, 0x1a6e7e, 0x2a94a0, 0x4ab8b8], spot: 0xb0fff0, spore: [0.45, 1, 0.85], light: [0.2, 0.6, 0.55] },
};
const capFor = (z) => CAPS[Math.min(3, Math.max(1, z))];

export function buildPuffer(zone) {
  const P = capFor(zone);
  const stem = new VB(81);
  const cream = [0xb8a888, 0xd8c8a4, 0xf0e2c4, 0xfff4dc];
  stem.ell(0, 4.6, 0, 4.2, 4.6, 3.8, (x, y, z, nx, ny, nz) => cream[clamp(Math.floor((0.45 + ny * 0.3 + nz * 0.15 + (stem.n(x, y, z) - 0.5) * 0.2) * 4), 0, 3)]);
  stem.box(1, 0, 0, 2, 0, 2, 0xa89068); stem.box(-3, 0, 0, -2, 0, 2, 0xa89068); // feet
  const front = (x, y) => { for (let z = 8; z > -6; z--) if (stem.has(x, y, z)) return z; return 0; };
  stem.set(-1, 2, front(-1, 2), 0x5a3022); stem.set(0, 2, front(0, 2), 0x5a3022); // a little "o" mouth
  stem.set(3, 3, front(3, 3), 0xffa8a0); stem.set(-4, 3, front(-4, 3), 0xffa8a0); // blush
  const ez = Math.max(front(1, 5), front(-2, 5)) + 1;
  const eyes = new VB(), angry = new VB();
  for (const [vb, a] of [[eyes, false], [angry, true]]) {
    for (const [x0, sd] of [[1, 1], [-3, -1]]) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const inner = sd > 0 ? x === 0 : x === 1;
      if (a && y === 1 && inner) continue;
      vb.set(x0 + x, 4 + y, 0, y === 1 && !inner ? 0xffffff : a ? 0xff6a4a : 0x2a1a10);
    }
  }
  // the cap (pivot at its underside center) and its glowing spots
  const cap = new VB(82), spots = new VB(83);
  cap.ell(0, 0, 0, 7.6, 5.4, 7.6, (x, y, z, nx, ny) => {
    if (y < 0) return -1;
    const k = clamp(0.35 + ny * 0.5 + (cap.n(x, y, z) - 0.5) * 0.25, 0, 0.999);
    return P.cap[Math.floor(k * 4)];
  });
  for (let z = -8; z <= 7; z++) for (let x = -8; x <= 7; x++) {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r < 7.4) cap.set(x, -1, z, r > 6 ? P.cap[1] : (Math.floor(Math.atan2(z + 0.5, x + 0.5) * 4) & 1) ? 0xe8d4b0 : 0xc8b490); // lip + gills
  }
  // spots: a few round patches on the dome's surface, moved to the glowing layer
  const centers = [[0, 5, 0], [4, 3.5, 3], [-4, 3.5, 3], [5, 2.5, -2], [-5, 2.8, -2], [0, 3, -5.5], [2, 2, 6], [-2, 1.8, 6.2]];
  for (const [x, y, z, c] of cap.list().map((v) => [v.x, v.y, v.z, v.c])) {
    if (y < 0) continue;
    for (const [sx, sy, sz] of centers) {
      if (Math.hypot(x + 0.5 - sx, y + 0.5 - sy, z + 0.5 - sz) < 1.6 && (cap.open(x, y, z, 0, 1, 0) || cap.open(x, y, z, 1, 0, 0) || cap.open(x, y, z, -1, 0, 0) || cap.open(x, y, z, 0, 0, 1) || cap.open(x, y, z, 0, 0, -1))) {
        cap.del(x, y, z); spots.set(x, y, z, c === -1 ? P.spot : P.spot);
      }
    }
  }
  return { stem: stem.geo(0, 0, 0), eyes: eyes.geo(0, 4.5, 0), angry: angry.geo(0, 4.5, 0), ez, cap: cap.geo(0, 0, 0), spots: spots.geo(0, 0, 0), spore: P.spore, light: P.light, capCol: c01(P.cap[2]) };
}

export class Puffer extends Enemy {
  static info = { id: 'spore_puffer', name: 'Spore Puffer', color: '#ff8a6a', hits: 2.5, dmg: 1.2, snd: 'flesh' };
  static tells = { inflate: [0.95, true] };
  static resume = 'approach';
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.17; this.h = 0.5; this.cy = 0.3; this.hitR = 0.3;
    this.mass = 0.9;
    this.springK = 200; this.springC = 6;
    const G = this.G = mgr.geo('puffer|' + Math.min(3, this.zone), () => buildPuffer(this.zone));
    this.mat = this.material({ emissive: 0.08 });
    this.capMat = this.material({ emissive: 0.3 });
    this.glowMat = this.material({ emissive: 1.2 });
    this.body = this.part(G.stem, this.mat);
    this.eyes = this.part(G.eyes, this.glowMat, this.root, 0, 4.5 * VS, G.ez * VS);
    this.capG = this.group3(this.root, 0, 8.2 * VS, -0.3 * VS);
    this.cap = this.part(G.cap, this.capMat, this.capG);
    this.spots = this.part(G.spots, this.glowMat, this.capG);
    this.state = 'wander';
    this.walkT = rand(1, 3);
    this.heading = Math.random() * Math.PI * 2;
    this.phase = 0;
    this.inflate = 0;
    this.lost = 0;
  }

  think(dt) {
    const m = this.mgr;
    this.squint = 1;
    this.sqT = 0;
    let walk = 0, angry = false;
    switch (this.state) {
      case 'wander': {
        this.walkT -= dt;
        if (this.walkT <= 0) { this.walkT = rand(1.5, 4); this.heading = Math.random() < 0.35 ? null : Math.random() * Math.PI * 2; }
        if (this.heading != null) { this.yaw += Math.atan2(Math.sin(this.heading - this.yaw), Math.cos(this.heading - this.yaw)) * Math.min(1, dt * 3); walk = 0.4; }
        if (this.ev.bumped) this.heading = Math.random() * Math.PI * 2;
        this.inflate = Math.max(0, this.inflate - dt);
        if (this.dist < 4.6 && this.sees && !m.safe) { this.wake(); this.setState('notice'); this.vel.y = 2.2; this.sqv += 6; }
        break;
      }
      case 'notice': {
        this.facePlayer(8, dt);
        if (this.st > 0.55) this.setState('approach');
        break;
      }
      case 'approach': {
        if (m.safe || this.dist > 12) { this.lost += dt; if (this.lost > 3) { this.awake = false; this.lost = 0; this.setState('wander'); break; } }
        else this.lost = 0;
        const off = this.facePlayer(4, dt);
        walk = this.hd > 1.5 && off < 0.8 ? 0.7 : 0;
        if (this.hd < 2.0 && this.atkCd <= 0 && this.sees && this.lost === 0) { this.setState('inflate'); this.sound('bubble', {}); }
        break;
      }
      case 'inflate': {
        this.facePlayer(3, dt);
        this.inflate = smooth(this.st / 0.9);
        this.shiver = 0.4 + this.inflate * 0.6;
        this.sqT = -0.12 * this.inflate;
        angry = true;
        if (Math.random() < dt * 8) this.sound('bubble', {});
        if (Math.random() < dt * 20) spores(this.fx, this.pos.x, this.pos.y + 0.45, this.pos.z, 1, this.G.spore, 0.25, 0.3);
        if (this.st > 0.95) this.puff();
        break;
      }
      case 'recharge': {
        // deflated and dizzy: waddles back a little
        this.inflate = Math.max(-0.35, this.inflate - dt * 5);
        if (this.st > 0.4) this.inflate += (0 - this.inflate) * Math.min(1, dt * 1.2);
        this.squint = 0.4;
        const [dx, dz] = this.dirToPlayer();
        if (this.st > 0.6 && this.hd < 2.4) { this.yaw += Math.atan2(Math.sin(Math.atan2(-dx, -dz) - this.yaw), Math.cos(Math.atan2(-dx, -dz) - this.yaw)) * Math.min(1, dt * 3); walk = 0.35; }
        if (this.st > 3.2) { this.setState('approach'); this.atkCd = rand(0.4, 1.2); }
        break;
      }
      case 'hurt':
        this.inflate = Math.max(0, this.inflate - dt * 4);
        if (this.st > 0.4) this.setState('approach');
        break;
    }
    // waddle: little hops from foot to foot
    if (walk && this.grounded) {
      this.push(Math.sin(this.yaw) * walk, Math.cos(this.yaw) * walk, 8, dt);
      const ph = this.phase;
      this.phase += dt * 9;
      if (Math.floor(ph / Math.PI) !== Math.floor(this.phase / Math.PI)) { this.vel.y = 1.1; this.sqv += 2.5; }
    }
    this.walking = walk > 0;
    this.eyes.geometry = angry ? this.G.angry : this.G.eyes;
  }

  puff() {
    const m = this.mgr;
    const x = this.pos.x + Math.sin(this.yaw) * 0.5, y = this.pos.y + 0.55, z = this.pos.z + Math.cos(this.yaw) * 0.5;
    spores(this.fx, x, y, z, 110, this.G.spore, 0.6, 2.6);
    puff(this.fx, x, y, z, 22, this.G.spore.map((k) => k * 0.5), 0.4, 0.25, 0.16, 0.4);
    m.addHazard({ kind: 'spores', x, y: y - 0.2, z, r: 1.8, life: 3.2, sting: this.info.dmg, zone: this.zone, color: this.G.spore });
    this.sound('sneeze', {});
    this.sound('whoosh', { vol: 0.4 });
    this.sqv += 9;
    this.setState('recharge');
  }

  onHit() { this.setState('hurt'); this.sound('squish', {}); spores(this.fx, this.center.x, this.center.y + 0.2, this.center.z, 6, this.G.spore, 0.2, 0.8); }

  animate(dt) {
    const inf = this.inflate;
    const wob = this.state === 'recharge' ? Math.sin(this.t * 13) * 0.08 * Math.max(0, 1 - this.st / 2) : 0;
    this.capG.scale.set(1 + inf * 0.4 + wob, 1 + inf * 0.3 - wob, 1 + inf * 0.4 + wob);
    this.capG.position.y = (8.2 + inf * 1.2) * VS;
    this.capG.rotation.z = Math.sin(this.t * 2.1) * 0.06 + (this.walking ? Math.sin(this.phase) * 0.12 : 0);
    this.root.rotation.z = this.walking ? Math.sin(this.phase) * 0.13 : 0;
    this.capMat.uniforms.emissive.value = 0.3 + inf * 0.6;
    if (Math.random() < dt * 1.5) spores(this.fx, this.pos.x, this.pos.y + 0.6, this.pos.z, 1, this.G.spore, 0.3, 0.15); // a lazy spore now and then
  }

  light() {
    const c = this.G.light, k = 1 + this.inflate * 1.2;
    return { x: this.pos.x, y: this.pos.y + 0.55, z: this.pos.z, c: [c[0] * k, c[1] * k, c[2] * k], r: 2.4 };
  }

  deathFx() {
    const p = this.center;
    spores(this.fx, p.x, p.y + 0.2, p.z, 40, this.G.spore, 0.4, 1.6);
    puff(this.fx, p.x, p.y, p.z, 8, this.G.spore.map((k) => k * 0.5), 0.2, 0.3, 0.1, 0.4);
    sparkle(this.fx, p.x, p.y + 0.2, p.z, 8, this.G.spore, 2, 2, 0.02, 0.6);
    this.sound('squish', {});
    this.sound('bloop', {});
  }
}
