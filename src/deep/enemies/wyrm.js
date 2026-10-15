// Crystal Wyrmling: a little serpentine dragon of crystal segments. It swims through the air of
// big caverns (the body follows the head like a chain), circles the mole, coils back with a hiss
// and lunges for a bite. Defeated, it shatters into glittering crystal.
import * as THREE from 'three';
import { Enemy, TAU, smooth, wrapA } from './base.js';
import { VB, VS, mix, c01 } from './vox.js';
import { sparkle, puff } from './fx.js';
import { rand, clamp } from '../../core/util.js';
import { airBelow, solidAt } from './physics.js';

const PAL = {
  3: { t: [0x3a3aa0, 0x6464d8, 0x9a9af4, 0xdcdcff], belly: 0xb8a8ff, eye: 0xfff4a0, light: [0.55, 0.55, 1.25] },
  5: { t: [0x2a6a94, 0x52a4d0, 0x94d8f0, 0xecffff], belly: 0xc8f0ff, eye: 0xffffff, light: [0.5, 0.95, 1.25] },
  6: { t: [0x5a1a94, 0x9446d8, 0xc890ff, 0xffe0ff], belly: 0xffc8f0, eye: 0xfff0a0, light: [1.05, 0.5, 1.3] },
};
const palFor = (z) => PAL[z] || (z >= 6 ? PAL[6] : z === 5 ? PAL[5] : PAL[3]);
const RADII = [3.3, 3.1, 2.8, 2.4, 2.0, 1.6];

/** Faceted crystal colors: each facet (sign octant + noise) gets its own tone. */
function facet(vb, P, x, y, z, nx, ny, nz) {
  const f = (nx > 0 ? 1 : 0) + (ny > 0 ? 2 : 0) + (nz > 0 ? 4 : 0);
  const k = clamp(0.25 + ny * 0.45 + ((f * 0.37) % 1 - 0.5) * 0.5 + (vb.n(x, y, z) - 0.5) * 0.15, 0, 0.999);
  if (ny < -0.55) return P.belly;
  return P.t[Math.floor(k * 4)];
}

export function buildWyrm(zone) {
  const P = palFor(zone);
  // head (pivot at its center, +z = snout)
  const head = new VB(61);
  const fh = (x, y, z, nx, ny, nz) => facet(head, P, x, y, z, nx, ny, nz);
  head.ell(0, 0, 0, 3.4, 3, 3.6, fh);
  head.ell(0, -0.6, 3.6, 2.4, 2, 3, fh);
  head.box(-2, 1, 3, 1, 1, 4, P.t[2]); // snout ridge
  head.set(-2, 0, 6, P.t[0]); head.set(1, 0, 6, P.t[0]); // nostrils
  // horns sweeping back
  for (const sd of [1, -1]) {
    const X = (x) => (sd > 0 ? x : -1 - x);
    [[2, 2, -1], [2, 3, -2], [2, 4, -3], [3, 4, -4], [3, 5, -5]].forEach(([x, y, z], i) => head.set(X(x), y, z, i > 2 ? P.t[3] : P.t[2]));
    head.set(X(3), 0, -2, P.t[2]); head.set(X(4), 0, -3, P.t[3]); // cheek frills
  }
  // jaw (pivot at its hinge)
  const jaw = new VB(62);
  jaw.box(-2, -1, 0, 1, 0, 5, (x, y, z) => (y === 0 && (z === 2 || z === 4) && (x === -2 || x === 1) ? 0xffffff : z > 3 ? P.t[1] : P.belly));
  // eyes on the sides of the head
  const eyes = new VB(), angry = new VB();
  for (const [vb, col] of [[eyes, P.eye], [angry, 0xff4a6a]]) {
    for (const sd of [1, -1]) {
      const X = (x) => (sd > 0 ? x : -1 - x);
      vb.set(X(3), 1, 2, col); vb.set(X(3), 1, 1, col); vb.set(X(3), 2, 2, 0xffffff); vb.set(X(3), 2, 1, col);
    }
  }
  // body segments: faceted gems with a dorsal crystal; the first has little wings
  const segs = RADII.map((r, i) => {
    const s = new VB(70 + i);
    s.ell(0, 0, 0, r, r * 0.9, r * 1.15, (x, y, z, nx, ny, nz) => (Math.abs(nx) + Math.abs(ny) + Math.abs(nz) > 1.45 ? -1 : facet(s, P, x, y, z, nx, ny, nz)));
    const h = Math.max(1, Math.round(r * 0.7));
    for (let k = 0; k < h + 1; k++) s.set(0, Math.ceil(r * 0.9) + k - 1, k > 0 ? -1 : 0, k === h ? 0xffffff : P.t[3]);
    if (i === 0) {
      for (const sd of [1, -1]) {
        const X = (x) => (sd > 0 ? x : -1 - x);
        for (let u = 0; u < 5; u++) for (let v = 0; v < 4 - Math.floor(u * 0.7); v++) s.set(X(3 + u), 1 + Math.floor(u * 0.6), -v, v === 0 ? P.t[3] : P.t[1]);
      }
    }
    if (i === RADII.length - 1) { s.set(0, 0, -2, P.t[2]); s.set(0, 0, -3, P.t[3]); s.set(0, 1, -3, 0xffffff); }
    return s.geo(0, 0, 0);
  });
  return { head: head.geo(0, 0, 0), jaw: jaw.geo(0, 0, 0), eyes: eyes.geo(0, 1.5, 1.5), angry: angry.geo(0, 1.5, 1.5), segs, light: P.light, glit: c01(P.t[3]), mid: c01(P.t[2]) };
}

const _v = new THREE.Vector3();

export class Wyrm extends Enemy {
  static info = { id: 'crystal_wyrm', name: 'Crystal Wyrmling', color: '#a8a8ff', hits: 3.5, dmg: 6, flying: true, snd: 'crystal' };
  constructor(mgr, o) {
    super(mgr, o);
    this.rad = 0.16; this.cy = 0; this.hitR = 0.19;
    this.mass = 1.4; this.kb = 3.5;
    const G = this.G = mgr.geo('wyrm|' + this.zone, () => buildWyrm(this.zone));
    this.mat = this.material({ emissive: 0.32 });
    this.eyeMat = this.material({ emissive: 1.5 });
    this.headG = this.group3(this.root);
    this.head = this.part(G.head, this.mat, this.headG);
    this.jaw = this.part(G.jaw, this.mat, this.headG, 0, -1.6 * VS, 0.5 * VS);
    this.eyes = this.part(G.eyes, this.eyeMat, this.headG, 0, 1.5 * VS, 1.5 * VS);
    this.segs = G.segs.map((g, i) => {
      const mesh = this.part(g, this.mat, this.root);
      const L = (RADII[i] + (i ? RADII[i - 1] : 3.4)) * VS * 0.95;
      mesh.position.set(this.pos.x, this.pos.y, this.pos.z - (i + 1) * 0.12);
      return { mesh, L, r: RADII[i] * VS * 1.15 };
    });
    for (let i = 0; i < this.segs.length; i++) this.spheres.push({ x: 0, y: 0, z: 0, r: 0.1 });
    this.home = this.pos.clone();
    this.target = this.pos.clone();
    this.state = 'roam';
    this.orbitA = Math.random() * TAU;
    this.orbitDir = Math.random() < 0.5 ? 1 : -1;
    this.floorT = 0; this.floor = 1;
    this.lost = 0;
    this.glowK = 0;
    this.pitch = 0;
  }

  think(dt) {
    const m = this.mgr, pc = m.pc;
    this.floorT -= dt;
    if (this.floorT <= 0) { this.floorT = 0.25; this.floor = airBelow(this.w, this.pos.x, this.pos.y, this.pos.z, 3); }
    const hover = (y, h = 0.85) => y + clamp(h - this.floor, -0.5, 0.7);
    this.squint = 1;
    let angry = false, jawT = 0.08;
    const wig = Math.sin(this.t * 4.2) * 0.9;
    switch (this.state) {
      case 'roam': {
        if (this.pos.distanceTo(this.target) < 0.5 || this.st > 5) {
          this.st = 0;
          for (let k = 0; k < 6; k++) {
            const a = Math.random() * TAU, d = rand(1.5, 4.5);
            const tx = this.home.x + Math.cos(a) * d, tz = this.home.z + Math.sin(a) * d, ty = this.home.y + rand(-0.4, 0.6);
            if (!solidAt(this.w, tx, ty, tz)) { this.target.set(tx, ty, tz); break; }
          }
        }
        this.slither(this.target.x, hover(this.target.y), this.target.z, 1.5, wig, dt);
        if (this.dist < 10 && this.sees && !m.safe) { this.wake(); this.setState('circle'); this.sound('hiss', { vol: 0.6 }); }
        break;
      }
      case 'circle': {
        if (m.safe || this.dist > 17) { this.lost += dt; if (this.lost > 5) { this.awake = false; this.lost = 0; this.home.copy(this.pos); this.setState('roam'); break; } }
        else this.lost = 0;
        this.orbitA += this.orbitDir * 0.75 * dt;
        if (this.ev.bumped || Math.random() < dt * 0.1) this.orbitDir = -this.orbitDir;
        const R = 3.1 + Math.sin(this.t * 0.6) * 0.5;
        this.slither(pc.x + Math.sin(this.orbitA) * R, hover(m.eye.y - 0.1, 0.9), pc.z + Math.cos(this.orbitA) * R, 2.5, wig * 0.7, dt);
        if (this.atkCd <= 0 && this.dist < 5 && this.sees && this.lost === 0) { this.setState('coil'); this.sound('hiss', {}); this.sound('emote', { kind: 'angry' }); }
        break;
      }
      case 'coil': {
        // rear back, glow up, open the jaw: here it comes
        const dx = pc.x - this.pos.x, dz = pc.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
        this.steer(this.pos.x - (dx / d) * 0.5, m.eye.y + 0.25, this.pos.z - (dz / d) * 0.5, 0.9, 4, dt);
        this.lookYaw = Math.atan2(dx, dz);
        this.shiver = 0.5; angry = true; jawT = 0.25 + this.st * 0.4; this.squint = 0.7;
        this.glowK = Math.min(1, this.st / 0.6);
        if (Math.random() < dt * 25) sparkle(this.fx, this.pos.x, this.pos.y, this.pos.z, 1, this.G.glit, 0.8, 0, 0.02, 0.5);
        if (this.st > 0.75) {
          const tx = m.eye.x + m.pl.vel.x * 0.12, ty = m.eye.y - 0.25, tz = m.eye.z + m.pl.vel.z * 0.12;
          const lx = tx - this.pos.x, ly = ty - this.pos.y, lz = tz - this.pos.z, ld = Math.hypot(lx, ly, lz) || 1;
          this.dash = [lx / ld, ly / ld, lz / ld];
          this.setState('lunge'); this.hitDone = false;
          this.sound('whoosh', { vol: 0.8 });
        }
        break;
      }
      case 'lunge': {
        angry = true; jawT = 0.75; this.glowK = 1;
        this.vel.set(this.dash[0] * 7.2, this.dash[1] * 7.2, this.dash[2] * 7.2);
        if (!this.hitDone && this.touches(0.06)) {
          this.hitDone = true;
          this.hurtPlayer(this.info.dmg, [this.dash[0] * 4, 2, this.dash[2] * 4], 'bite');
          this.sound('crack', {});
          sparkle(this.fx, this.pos.x, this.pos.y, this.pos.z, 10, this.G.glit, 2, 2, 0.02, 0.5);
          this.vel.multiplyScalar(-0.3);
          this.setState('recover');
        } else if (this.st > 0.5 || this.ev.bumped) this.setState('recover');
        break;
      }
      case 'recover': {
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 2.5));
        this.glowK = Math.max(0, this.glowK - dt * 2);
        this.squint = 0.5;
        if (this.st > 1.1) { this.setState('circle'); this.atkCd = rand(1.8, 3); }
        break;
      }
      case 'hurt': {
        this.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
        this.glowK = Math.max(0, this.glowK - dt * 3);
        if (this.st > 0.35) this.setState('circle');
        break;
      }
    }
    if (this.state !== 'coil') this.lookYaw = null;
    this.jawK = (this.jawK || 0) + (jawT - (this.jawK || 0)) * Math.min(1, dt * 12);
    this.eyes.geometry = angry ? this.G.angry : this.G.eyes;
    this.mat.userData.e0 = 0.32 + this.glowK * 0.5; // glows brighter as it coils
    this.mat.uniforms.emissive.value = this.mat.userData.e0;
  }

  /** Swim toward a point with a sideways wiggle. */
  slither(tx, ty, tz, speed, wig, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz) || 1;
    const ox = (-dz / d) * wig * 0.6, oz = (dx / d) * wig * 0.6;
    this.steer(tx + ox, ty + Math.sin(this.t * 2.3) * 0.15, tz + oz, speed, 2.5, dt);
  }

  onHit() {
    if (this.state !== 'lunge') this.setState('hurt');
    this.sound('hit', { snd: 'crystal' });
    sparkle(this.fx, this.center.x, this.center.y, this.center.z, 8, this.G.glit, 2, 3, 0.02, 0.6);
  }

  place() {
    // the root stays at the origin; head and segments are placed in world space
    const s = (0.3 + 0.7 * smooth(this.emerge)) * this.size;
    const hg = this.headG;
    hg.position.set(this.pos.x, this.pos.y, this.pos.z);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (this.lookYaw != null) this.yaw += wrapA(this.lookYaw - this.yaw) * 0.25;
    else if (sp > 0.15) this.yaw += wrapA(Math.atan2(this.vel.x, this.vel.z) - this.yaw) * 0.2;
    const pt = clamp(-Math.atan2(this.vel.y, Math.max(0.3, sp)) * 0.8, -0.7, 0.7);
    this.pitch += (pt - this.pitch) * 0.15;
    hg.rotation.set(this.pitch, this.yaw, Math.sin(this.t * 4.2) * 0.12, 'YXZ');
    const j = this.shiver * 0.02;
    if (j) hg.position.x += (Math.random() - 0.5) * j;
    hg.scale.setScalar(s * (1 + this.sq * 0.3));
    this.jaw.rotation.x = this.jawK || 0;
    // chain: each segment hangs on to the one in front
    let px = this.pos.x, py = this.pos.y, pz = this.pos.z;
    this.segs.forEach((g, i) => {
      const p = g.mesh.position;
      const L = g.L * s;
      const dx = p.x - px, dy = p.y - py, dz = p.z - pz, d = Math.hypot(dx, dy, dz) || 1;
      if (d > L) p.set(px + (dx / d) * L, py + (dy / d) * L, pz + (dz / d) * L);
      else if (d < L * 0.6) p.set(px + (dx / d) * L * 0.6, py + (dy / d) * L * 0.6, pz + (dz / d) * L * 0.6);
      if (solidAt(this.w, p.x, p.y, p.z)) p.lerp(_v.set(px, py, pz), 0.5);
      g.mesh.lookAt(px, py, pz);
      g.mesh.scale.setScalar(s * (1 + Math.sin(this.t * 7 - i * 0.9) * 0.07 + (this.state === 'coil' ? 0.06 : 0)));
      px = p.x; py = p.y; pz = p.z;
    });
  }

  updateSpheres() {
    this.center.copy(this.pos);
    const s0 = this.spheres[0];
    s0.x = this.pos.x; s0.y = this.pos.y; s0.z = this.pos.z; s0.r = this.hitR * this.size;
    this.segs.forEach((g, i) => { const s = this.spheres[i + 1], p = g.mesh.position; s.x = p.x; s.y = p.y; s.z = p.z; s.r = g.r * this.size; });
  }

  animate() {}

  light() {
    const c = this.G.light, k = 0.8 + this.glowK * 0.9;
    return { x: this.pos.x, y: this.pos.y, z: this.pos.z, c: [c[0] * k, c[1] * k, c[2] * k], r: 3.6 + this.glowK };
  }

  deathFx() {
    for (const g of [{ mesh: this.headG }, ...this.segs]) {
      const p = g.mesh.position;
      sparkle(this.fx, p.x, p.y, p.z, 8, this.G.glit, 2.6, 4, 0.022, 1);
      for (let k = 0; k < 3; k++) this.fx.glints(p.x, p.y, p.z, this.G.glit);
    }
    puff(this.fx, this.pos.x, this.pos.y, this.pos.z, 6, this.G.mid.map((k) => k * 0.6), 0.2, 0.3, 0.07, 0.4);
    this.sound('break', { snd: 'crystal' });
    this.sound('sparkle', {});
  }
}
