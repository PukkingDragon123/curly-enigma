// Cave Slime: a wobbling dome of jelly you can half see through, with whatever it last swallowed
// floating inside (a bone, a lump of ore, a mushroom). Mossy green up top, amber in the clay,
// violet in the grotto, molten orange in the Magma Deep (glows, swims in lava), icy blue in the
// Frost Vault. It hops after anything edible: carcasses (it engulfs them), mushrooms, moss... and
// the mole. It quivers and squashes flat before it hops at you (block or parry it). Beat a big one
// and it splits in two, and those split again.
import * as THREE from 'three';
import { Beast } from './beast.js';
import { VB, VS, mul, mix, c01 } from './vox.js';
import { H, taper, eye, hramp } from './voxKit.js';
import { socketEye, mouth } from './face.js';
import { puff, sparkle } from './fx.js';
import { rand, clamp } from '../../core/util.js';

const LOOKS = {
  1: { c: [0x2a8a3a, 0x48b850, 0x7ae070, 0xc8ffb0], core: 0x1e6a2a, eye: 0x0a2a10, glow: 0 },
  2: { c: [0x9a5a1a, 0xc8842a, 0xeab050, 0xffe0a0], core: 0x7a4410, eye: 0x2a1404, glow: 0 },
  3: { c: [0x5a2aa0, 0x8a4ad8, 0xb880ff, 0xe8d0ff], core: 0x3e1a7a, eye: 0x1a0a30, glow: 0.35 },
  4: { c: [0xb02a0a, 0xe8601a, 0xffa040, 0xfff0a0], core: 0x8a1a06, eye: 0x2a0800, glow: 0.8 },
  5: { c: [0x2a7ab0, 0x50aee0, 0x8ad8ff, 0xe0f8ff], core: 0x1a5a8a, eye: 0x082030, glow: 0.2 },
  6: { c: [0x4a1a7a, 0x7a3ab0, 0xb070e8, 0xf0d0ff], core: 0x2e0e52, eye: 0x10041e, glow: 0.5 },
};
const SIZES = [0.55, 0.85, 1.35]; // small, medium, big

export function buildSlime(zone) {
  // (wave 16) at half the old voxel: a jelly dome with a sagging lip and drips, a curled peak on top,
  // a lighter rim round its silhouette, a long wet highlight and bubbles rising inside; a big
  // readable face (shiny eyes, a smile with a tongue, blush)
  const L = LOOKS[clamp(zone, 1, 6)], C = L.c;
  const R = 16;
  const jelly = new VB(81);
  const bub = [];
  for (let i = 0; i < 9; i++) {
    const a = jelly.n(i, 1, 0, 3) * Math.PI * 2, h = 0.15 + jelly.n(i, 2, 0, 3) * 0.7;
    const rr = Math.sqrt(1 - h * h);
    bub.push([Math.cos(a) * rr * R * 0.98, R * 0.78 + h * R * 0.8, Math.sin(a) * rr * R * 0.98, 1.2 + jelly.n(i, 3, 0, 3) * 1.4]);
  }
  // (wave 17) a clean six-tone hue-shifted ramp, no static: light pools low in the body (light through
  // jelly), a bright rim round the silhouette, a darker heart, the long wet highlight and bubbles
  const J = hramp(C[1], 6, { step: 0.09 });
  const js = (x, y, z, nx, ny, nz) => {
    if (y < 0) return -1;
    const hl = ny > 0.42 && ny < 0.8 && nx < -0.05 && nx > -0.55 && nz > 0.25 && Math.abs(nx + 0.3 - (ny - 0.6) * 0.6) < 0.1;
    if (hl || Math.hypot(nx + 0.12, ny - 0.82, nz - 0.4) < 0.1) return 0xffffff;
    for (const [bx, by, bz, br] of bub) { const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by, z + 0.5 - bz); if (d < br) return d < br * 0.5 ? J[5] : J[4]; }
    const rim = 1 - Math.abs(nz) * 0.6 - Math.abs(ny) * 0.4;
    const low = y < R * 0.4 && ny < 0.2 ? 0.16 : 0; // (light caught in the lip)
    const k = clamp(0.22 + ny * 0.3 + low + (rim > 0.72 ? 0.2 : 0), 0, 0.999);
    return J[Math.floor(k * 6)];
  };
  jelly.ell(0, R * 0.78, 0, R, R * 0.82, R, js);
  jelly.ell(0, R * 0.4, 0, R + 0.8, R * 0.44, R + 0.8, js); // (wave 17) the sagging base: a dome, not a ball
  // a curled peak on the crown
  taper(jelly, 0, R * 1.5, 0, -1, R * 1.72, -1.5, 3.2, 1.6, C[2]); taper(jelly, -1, R * 1.72, -1.5, -3.2, R * 1.82, -2.2, 1.6, 0.7, C[3]);
  // the sagging lip round the bottom, and a few drips
  // (wave 17: a filled lip, not a ring floating round the foot)
  jelly.ell(0, 1.2, 0, R + 1, 2.2, R + 1, (x, y, z, nx, ny) => (y < 0 || jelly.has(x, y, z) ? undefined : ny > 0.2 ? J[2] : J[1]));
  for (let i = 0; i < 7; i++) { const t = jelly.n(i, 5, 5, 1) * Math.PI * 2; jelly.ell(Math.cos(t) * (R + 1.2), 1, Math.sin(t) * (R + 1.2), 1.6, 1.3, 1.6, C[1]); }
  // (no simple face) a face sculpted out of the jelly: thick jelly brow ridges, eyes sunk in deep
  // sockets (one bigger, rolling sideways: unsettling), a wide carved maw lined with translucent
  // jelly fangs over a dark gullet; the eyeballs are the opaque face part
  const face = new VB(82);
  const eyeCol = mix(C[3], 0xfff0a0, 0.4);
  socketEye(jelly, face, 5.5, R * 0.98, 1, { r: 3.4, depth: 0.55, iris: eyeCol, pupil: mul(L.eye, 0.5), slit: true, pr: 0.55, ir: 0.6, look: [0.25, -0.1], sclera: 0xf0f4e0, lid: 0.22, tilt: 0.25, skin: J[3], brow: J[4], browR: 1.8 });
  socketEye(jelly, face, -6, R * 0.94, -1, { r: 2.6, depth: 0.55, iris: eyeCol, pupil: mul(L.eye, 0.5), slit: true, pr: 0.55, ir: 0.6, look: [0.35, -0.15], sclera: 0xf0f4e0, lid: 0.34, tilt: 0.35, skin: J[3], brow: J[4], browR: 1.6 });
  mouth(jelly, 0, R * 0.56, { w: 14, h: 4.4, d: 4, curve: 0.28, asym: -0.6, gap: 3, fangs: [-0.6, -0.15, 0.4], fang: 3, lower: true, tooth: mix(J[5], 0xffffff, 0.4), gum: J[1], throat: J[0], tongue: J[2], lip: J[4] });
  // things it swallowed
  const items = [];
  const bone = new VB(83); bone.cap(-6, 0, 0, 6, 1, 0, 1.6, 0xe8dcc0); for (const sx of [-1, 1]) for (const dy of [-1, 1]) bone.ell(sx * 7, 0.5 + dy * 1.4, 0, 1.8, 1.8, 1.8, 0xf0e4c8); items.push(bone);
  const ore = new VB(84); ore.ell(0, 0, 0, 4.4, 3.6, 4, (x, y, z) => (ore.n(x, y, z) > 0.62 ? (ore.n(x, y, z, 2) > 0.5 ? 0xffb070 : 0xd9773f) : ore.n(x, y, z, 3) > 0.5 ? 0x6e5a4b : 0x54463a)); items.push(ore);
  const shroom = new VB(85); shroom.cap(0, -4, 0, 0, 2, 0, 1.6, 0xe8e0d0); shroom.ell(0, 3, 0, 4.8, 2.4, 4.8, (x, y, z, nx, ny) => (ny < -0.2 ? 0xd8c8a8 : shroom.n(x, y, z) > 0.78 ? 0xfff0c0 : ny > 0.6 ? 0xd84040 : 0xb82e2e)); items.push(shroom);
  return {
    jelly: jelly.geo(0, 0, 0, H), face: face.geo(0, 0, 0, H), items: items.map((v) => v.geo(0, 0, 0, H)), core: L.core,
    glow: L.glow, col: c01(C[1]), light: c01(C[2]), dark: c01(C[0]), shine: c01(C[3]),
  };
}

export class Slime extends Beast {
  static info = {
    id: 'cave_slime', name: 'Cave Slime', color: '#6ad07a', hits: 2.2, dmg: 3, poise: 1, tier: 2, flesh: false, snd: 'flesh',
    diet: 'omni', social: 'band', aggro: 'hostile', sleepy: 0.3, sight: 7, hear: 0.9, walk: 1.1, run: 2.1, turn: 6, accel: 6,
    keep: 1.9, close: 1.2, space: [0.32, 0.8], smell: 20, anyFood: true, metabolism: 0.008, depth: [5, 200], wakeR: 2, inedible: true,
    prey: ['critter'],
  };
  static attacks = [
    { id: 'slam', range: [0, 2.4], leap: true, arc: 0.7, tell: 0.6, dur: 0.55, hitAt: 0.05, rec: 0.6, cd: [1.2, 2.2], w: 1,
      start() { this.sound('blorp', { pitch: 0.7 / this.tierSize }); },
      go(A) { const t = this.targetPos(A); const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz) || 1; const v = Math.min(5, Math.max(0, d - 0.35 * this.K) / 0.45); this.vel.set(dx / d * v, 3.6 * this.walkK, dz / d * v); this.sqv += 12; this.hopping = true; },
      // (its damage goes by its tier, not by how small the whole species is: wave 19)
      hit(A) { return A.t > 0.5 || this.strikeAt(A, this.center, this.hitR * this.size * 0.9, { dmg: this.info.dmg * this.tierSize, push: 3, up: 2 }); } },
  ];

  /** The shared model for a zone; Enemies' prewarm builds it before a first sighting. */
  static warm(mgr, zone) {
    const z = clamp(zone, 1, 6);
    return mgr.geo('slime|' + z, () => buildSlime(z));
  }
  constructor(mgr, o) {
    super(mgr, o);
    this.tierN = o.split ?? (Math.random() < 0.25 ? 2 : Math.random() < 0.6 ? 1 : 0);
    if (o.big) this.tierN = 2;
    this.size = SIZES[this.tierN] * rand(0.92, 1.06);
    this.big = this.tierN === 2;
    this.hw = 0.28; this.h = 0.55; this.cy = 0.27; this.hitR = 0.34;
    this.mass = 0.8 + this.tierN * 0.7; this.kb = 2.6;
    this.hp = this.maxHp = this.info.hits * mgr.hpScale(this.zone) * (0.5 + this.tierN * 0.45);
    this.springK = 90; this.springC = 4;
    this.step = 0.15;
    const z = clamp(this.zone, 1, 6);
    if (z === 4) this.lavaProof = true;
    const G = this.G = Slime.warm(mgr, this.zone);
    this.hitCol = G.col;
    this.mat = this.material({ blend: 0.84, emissive: G.glow, wobble: 0.006 }); // (wave 17: blended, not dithered)
    this.coreMat = this.material({ emissive: G.glow * 0.5, rimK: 0 });
    this.faceMat = this.material({ rimK: 0 });
    this.body = this.group3(this.root);
    this.part(G.jelly, this.mat, this.body);
    this.faceM = this.part(G.face, this.faceMat, this.body);
    // whatever it swallowed, bobbing inside
    const pick = Math.floor(Math.random() * G.items.length);
    this.inside = new THREE.Mesh(G.items[pick], this.coreMat);
    this.inside.position.set(rand(-2, 2) * VS, 5 * VS, rand(-2, 2) * VS);
    this.inside.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    this.body.add(this.inside);
    this.swallowed = pick === 1 ? ['copper_ore', 'tin_ore', 'iron_ore', 'iron_ore', 'silver_ore', 'gold_ore'][Math.min(5, this.zone)] : pick === 2 ? 'glowcap' : null;
    this.hopT = rand(0.2, 0.6);
    this.wantX = 0; this.wantZ = 0;
    this.hopping = false;
  }

  /** Beast steering lands here: remember where it wants to go, then hop there. */
  push(vx, vz, accel, dt) {
    this.wantX = vx; this.wantZ = vz;
    if (!this.grounded) return;
    if (this.hopping) return;
    const k = Math.min(1, 10 * dt);
    this.vel.x -= this.vel.x * k; this.vel.z -= this.vel.z * k;
  }

  think(dt) {
    super.think(dt);
    if (this.grounded && this.airT === 0 && this.hopping && this.st > 0.1) this.hopping = false;
    if (this.atk || !this.grounded) { this.sqT = this.grounded ? 0 : clamp(this.vel.y * 0.06, -0.15, 0.3); return; }
    const want = Math.hypot(this.wantX, this.wantZ);
    this.hopT -= dt;
    this.sqT = this.hopT < 0.15 && want > 0.1 ? -0.3 : 0;
    if (this.hopT <= 0 && want > 0.1) {
      const sp = Math.min(2.6, want * 1.6);
      this.vel.set(this.wantX / want * sp, rand(2.4, 3.2) * this.walkK, this.wantZ / want * sp); // (wave 19: little hops)
      this.sqv += 9;
      this.hopping = true;
      this.hopT = rand(0.25, 0.5) * (0.8 + this.tierN * 0.2);
      if (this.dist < 9) this.sound('blorp', { pitch: rand(0.8, 1.2) / this.tierSize, vol: 0.5 });
    }
  }

  onLand(sp) {
    super.onLand(sp);
    this.hopping = false;
    this.sqv -= 6;
    if (sp > 2 && this.dist < 10) {
      this.sound('splat', { vol: 0.25 * this.tierSize });
      for (let i = 0; i < 6; i++) this.fx.spawn({ x: this.pos.x + rand(-0.2, 0.2) * this.size, y: this.pos.y + 0.03, z: this.pos.z + rand(-0.2, 0.2) * this.size, vx: rand(-1, 1), vy: rand(0.5, 1.4), vz: rand(-1, 1), life: rand(0.3, 0.6), size: rand(0.014, 0.024), color: this.G.col, drag: 0.6, grav: 9, bounce: 0.2, fade: false });
    }
  }

  onNotice() { this.sound('blorp', { pitch: 1.3 / this.tierSize }); this.sqv += 8; }
  /** Its size within the species (the tier: small, medium, big), whatever the species' scale. */
  get tierSize() { return this.size / this.K; }
  onHit() { this.sound('splat', { vol: 0.6 }); this.sqv -= 10; }

  animate(dt) {
    const t = this.t, A = this.atk;
    let quiver = 0;
    if (A && A.phase === 'tell') { const k = clamp(A.t / A.a.tell, 0, 1); this.sqT = -0.35 * k; quiver = k; }
    if (this.headDown > 0.3) quiver = 0.3; // gulping
    this.body.scale.set(1 + Math.sin(t * 40) * 0.03 * quiver, 1 + Math.sin(t * 3) * 0.03, 1 + Math.cos(t * 40) * 0.03 * quiver);
    this.inside.position.y = (4.5 + Math.sin(t * 1.7) * 1.2 + this.sq * 3) * VS;
    this.inside.rotation.y += dt * 0.6;
    this.eyeOpen = this.asleep ? 0.3 : 1;
    this.faceM.scale.y = this.blinkD > 0 ? 0.3 : 1;
    if (this.G.glow > 0.3 && Math.random() < dt * 3 && this.dist < 12) this.fx.spawn({ x: this.center.x + rand(-0.2, 0.2) * this.size, y: this.pos.y + this.size * 0.5, z: this.center.z + rand(-0.2, 0.2) * this.size, vy: 0.3, life: 0.8, size: 0.02, color: this.G.light, glow: true, drag: 1 });
  }

  light() {
    if (this.G.glow < 0.2 || this.dist > 16) return null;
    const c = this.G.light, k = this.G.glow * 0.9;
    return { x: this.center.x, y: this.center.y, z: this.center.z, c: [c[0] * k, c[1] * k, c[2] * k], r: 2 + this.size };
  }

  deathFx() {
    const c = this.center, m = this.mgr;
    this.sound('splat', { vol: 1 });
    for (let i = 0; i < 24; i++) this.fx.spawn({ x: c.x, y: c.y, z: c.z, vx: rand(-2.5, 2.5), vy: rand(0.5, 3), vz: rand(-2.5, 2.5), life: rand(0.5, 1), size: rand(0.02, 0.04) * this.size, color: i % 3 ? this.G.col : this.G.shine, drag: 0.4, grav: 9, bounce: 0.25, fade: false });
    // a big one splits in two
    if (this.tierN > 0) {
      for (let i = 0; i < 2; i++) {
        const k = this.K, kv = this.walkK;
        const out = m.spawnGroup(['cave_slime'], this.pos.x + (i ? 0.25 : -0.25) * k, this.pos.y + 0.05 * k, this.pos.z, this.zone, { hidden: false, r: 0.6 * k, split: this.tierN - 1 });
        for (const e of out) { e.awake = true; e.lastHitT = m.time; e.lastHitBy = 'player'; e.vel.set(rand(-2, 2) * kv, 3 * kv, rand(-2, 2) * kv); e.emerge = 0.4; }
      }
      m.say('slime_split', '<b>It split!</b>', 'warn', 120);
    }
  }
}
