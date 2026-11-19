// Spore Puffer: a waddling mushroom of the mossy caves. It notices you, waddles closer, swells up
// (trembling, glowing) and PUFFS a cloud of glowing spores that sting while you stand in it.
// Step back while it inflates; whack it while it's deflated and wobbly.
import { Enemy, smooth, easeBack } from './base.js';
import { VB, VS, mix, mul, c01 } from './vox.js';
import { H, taper, eye, hramp, lit, vnoise } from './voxKit.js';
import { socketEye, mouth, nostrils } from './face.js';
import { spores, puff, sparkle, quills } from './fx.js';
import { rand, clamp } from '../../core/util.js';

const CAPS = {
  1: { cap: [0x8a1e22, 0xb82e2e, 0xd84a3a, 0xf06a4a], spot: 0xfff0c0, spore: [1, 0.86, 0.45], light: [0.6, 0.42, 0.18] },
  2: { cap: [0x8a4a12, 0xc06a1a, 0xe08a2a, 0xf8aa4a], spot: 0xfff4b0, spore: [1, 0.72, 0.3], light: [0.6, 0.4, 0.12] },
  3: { cap: [0x0e4a5a, 0x1a6e7e, 0x2a94a0, 0x4ab8b8], spot: 0xb0fff0, spore: [0.45, 1, 0.85], light: [0.2, 0.6, 0.55] },
};
const capFor = (z) => CAPS[Math.min(3, Math.max(1, z))];

export function buildPuffer(zone) {
  // (wave 16) at half the old voxel: a squat cream stem with a frilled ring skirt and stubby feet, a
  // shy face (big glossy eyes, blush, a little "o" mouth); a domed cap with a curled lip, real gills
  // radiating underneath, raised glowing warts, and quills folded inside that bristle as it swells
  const P = capFor(zone);
  const stem = new VB(81);
  const cream = [0xb8a888, 0xd8c8a4, 0xf0e2c4, 0xfff4dc];
  // (wave 17) fibrous flesh: vertical fibres and soft mottles, not stripes
  const CR = hramp(0xe0d0b0, 6, { step: 0.08 });
  stem.ell(0, 9.2, 0, 8.4, 9.2, 7.6, (x, y, z, nx, ny, nz) => CR[clamp(Math.floor((0.45 + ny * 0.28 + nz * 0.12 + (vnoise(x * 2.5, y * 0.4, z * 2.5, 3, 4) - 0.5) * 0.3) * 6), 0, 5)]);
  for (const sd of [1, -1]) stem.ell(sd * 5, 7.6, 5.2, 2.6, 2, 2, lit(CR, { bias: 0.1 })); // cheekbones
  stem.ell(0, 7.8, 7.4, 1.8, 2.2, 1.6, lit(CR, { bias: 0.14 })); // a knobbly nose
  // the ring skirt round the stem's top, frilled
  for (let a = 0; a < 96; a++) {
    const t = (a / 96) * Math.PI * 2, r = 8.4 + (a % 4 < 2 ? 0.8 : 0);
    for (let d = 0; d < 2; d++) stem.set(Math.round(Math.cos(t) * (r - d)), 14 - (a % 4 < 2 ? 1 : 0) - d, Math.round(Math.sin(t) * (r - d) * 0.92), d ? cream[1] : cream[2]);
  }
  for (const sd of [1, -1]) { stem.ell(sd * 3.2, 1, 2, 2.6, 1.6, 3.2, 0xa89068); stem.set(sd > 0 ? 3 : -4, 0, 5, 0x8a7050); } // feet
  const front = (x, y) => { for (let z = 16; z > -12; z--) if (stem.has(x, y, z)) return z; return 0; };
  // (no simple face) a gnarled fungal face: nostrils in the knobbly nose, a crooked mouth of peg
  // teeth and gums, eyes deep in sockets under a cap-coloured brow, one lid heavier than the other
  const ez = (Math.max(front(3, 9), front(-4, 9)) + 1) / 2;
  nostrils(stem, 0, 7.4, 1.6, { r: 0.55, col: 0x3a2014 });
  mouth(stem, 0, 4.2, { w: 7.5, h: 2.6, d: 2, curve: -0.12, asym: 0.5, gap: 2, fangs: [-0.6, 0.35], fang: 2, lower: true, tooth: 0xf4ecd0, gum: 0xa85a4a, throat: 0x2a1008, lip: CR[1] });
  const eyes = new VB(), angry = new VB();
  for (const sd of [1, -1]) {
    const at = socketEye(stem, eyes, sd * 3.4, 10.4, sd, { r: 2, depth: 0.45, iris: 0x4a8a3a, pupil: 0x0a0604, pr: 0.45, look: [sd * 0.08, 0], lid: sd > 0 ? 0.26 : 0.36, tilt: 0.1, skin: CR[2], brow: P.cap[1], browR: 1.1 });
    socketEye(stem, angry, sd * 3.4, 10.4, sd, { r: 2, cz: at[2], ballOnly: true, iris: 0xff6a3a, pupil: 0x3a0a04, slit: true, pr: 0.5, ballLid: 0.45, tilt: 0.7, lidCol: P.cap[1] });
  }
  // the cap (pivot at its underside center), its gills and its glowing warts
  const cap = new VB(82), spots = new VB(83);
  cap.ell(0, 0, 0, 15.2, 10.8, 15.2, (x, y, z, nx, ny) => {
    if (y < 0) return -1;
    const k = clamp(0.3 + ny * 0.5 + (cap.n(x, y, z) - 0.5) * 0.14 + (Math.hypot(x, z) > 13 ? -0.15 : 0), 0, 0.999);
    return P.cap[Math.floor(k * 4)];
  });
  for (let z = -16; z <= 15; z++) for (let x = -16; x <= 15; x++) {
    const r = Math.hypot(x + 0.5, z + 0.5);
    if (r > 15.6) continue;
    if (r > 13.2) { cap.set(x, -1, z, P.cap[1]); cap.set(x, -2, z, r > 14.4 ? P.cap[0] : P.cap[1]); continue; } // a curled lip
    const a = Math.atan2(z + 0.5, x + 0.5), gill = Math.floor(((a / (Math.PI * 2)) + 1) * 44) % 2;
    if (r < 3) continue;
    cap.set(x, -1, z, gill ? 0xe8d4b0 : 0xb8a080);
    if (gill && r > 5 && r < 12.5) cap.set(x, -2, z, 0xd8c4a0);
  }
  // warts: raised round patches on the dome, on the glowing layer
  const centers = [[0, 10.5, 0, 3], [8, 7.5, 6, 2.6], [-8, 7.5, 6, 2.6], [10, 5.5, -4, 2.4], [-10, 6, -4, 2.4], [0, 6.5, -11, 2.6], [4, 4, 12.5, 2], [-4, 3.8, 12.6, 2], [6, 9.5, -3, 1.6], [-5, 9.8, 2.5, 1.4], [12.5, 3, 4, 1.6], [-12.5, 3, 4, 1.6]];
  for (const [x, y, z] of cap.list().map((v) => [v.x, v.y, v.z])) {
    if (y < 0) continue;
    for (const [sx, sy, sz, sr] of centers) {
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy, z + 0.5 - sz);
      if (d < sr && (cap.open(x, y, z, 0, 1, 0) || cap.open(x, y, z, 1, 0, 0) || cap.open(x, y, z, -1, 0, 0) || cap.open(x, y, z, 0, 0, 1) || cap.open(x, y, z, 0, 0, -1))) {
        cap.del(x, y, z); spots.set(x, y, z, d < sr * 0.45 ? mix(P.spot, 0xffffff, 0.45) : P.spot);
        const ox = Math.round((sx) / 15), oy = 1, oz = Math.round(sz / 15);
        if (d < sr * 0.6) spots.set(x + ox, y + oy, z + oz, mix(P.spot, 0xffffff, 0.25)); // raised
      }
    }
  }
  // (wave 13) quills folded inside the cap: they bristle out as it swells, and shoot off when it bursts
  const spines = new VB(84);
  const N = 16;
  for (let i = 0; i < N; i++) {
    const y = 0.22 + 0.74 * ((i + 0.5) / N), r = Math.sqrt(1 - y * y), a = i * 2.39996;
    const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
    const bx = dx * 14, by = y * 10, bz = dz * 14; // just under the dome's skin
    taper(spines, bx, by, bz, bx + dx * 8.4, by + y * 9.2, bz + dz * 8.4, 1.1, 0.4, (xx, yy, zz, t) => (t > 0.8 ? P.spot : t > 0.45 ? P.cap[3] : P.cap[1]));
  }
  return { stem: stem.geo(0, 0, 0, H), eyes: eyes.geo(0, 9, ez * 2, H), angry: angry.geo(0, 9, ez * 2, H), ez, cap: cap.geo(0, 0, 0, H), spots: spots.geo(0, 0, 0, H), spines: spines.geo(0, 0, 0, H), spore: P.spore, light: P.light, capCol: c01(P.cap[2]), capDark: c01(P.cap[1]) };
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
    this.spines = this.part(G.spines, this.capMat, this.capG);
    this.spineK = 0; // 0 folded inside the cap, 1 bristling
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
        // swells, then strains past full for a beat (quills bristling) before it bursts
        this.inflate = smooth(this.st / 0.75) + smooth((this.st - 0.75) / 0.2) * 0.18;
        this.spineK = smooth((this.st - 0.3) / 0.45);
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
    // the quills shoot off in a ring (just for show: the spores are what sting)
    const cy = this.pos.y + (8.2 + this.inflate * 1.2) * VS * this.size + 0.06;
    quills(this.fx, this.pos.x, cy, this.pos.z, Math.round(16 * (this.fx.lod || 1)), this.G.capDark, this.G.spore, 3.4);
    this.spineK = 0;
    this.sound('quill_burst', {});
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
    if (this.state !== 'inflate') this.spineK = Math.max(0, this.spineK - dt * 4);
    // quills: tucked under the dome's skin (scaled in), out to full length as they bristle, trembling
    const sk = this.spineK;
    this.spines.visible = sk > 0.02;
    this.spines.scale.setScalar(0.72 + sk * 0.3 + (sk > 0.9 ? Math.sin(this.t * 50) * 0.015 : 0));
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
