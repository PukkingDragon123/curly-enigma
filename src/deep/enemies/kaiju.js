// The kaiju of the deep (wave 13): two truly huge creatures that wander the biggest caverns.
//
//   Crystal Titan     ~10 m: a knuckle-walking hill of living rock with a forest of glowing crystal
//                     growing from its back (tinted by the zone's crystal). Licks crystal off the
//                     floor. When it notices you (it turns its head, its eyes and crystals brighten),
//                     it may rear and ROAR: the cavern shakes, rubble rains from the roof and a
//                     shockwave rolls out along the floor (jump it).
//   Fungal Colossus   ~12 m: a walking toadstool on four root legs, its cap as wide as a house, gills
//                     glowing, spore tassels swaying. It roots into the floor to feed; its bellow is
//                     a storm of spores (sneeze, get out of the cloud).
//
// Mostly majesty: they wander and graze and you hide (crouch, keep out of sight) or sneak past. Each
// slow footfall thumps, shakes the view by distance, kicks up dust and shakes grit off the roof, and
// everything small near their path scatters. Hit one and it gets angry: it lifts a foot (red) and
// stomps where you stand (a shockwave). A long fight for a big hoard.
//
// Cheap: the brain ticks a few times a second, the ground is read from the generator's cave shapes
// (no chunk needed), there is no voxel collision (they can't block a tunnel or pin the mole), and each
// part has two meshes: an unrefined far copy (1/6 m voxels) and a refined near one (1/12 m; phones
// keep the far one). Models build a part per calm frame (Enemies.prewarm) before one may spawn.
import * as THREE from 'three';
import { Enemy, TAU, wrapA, smooth } from './base.js';
import { VB, mul, mix, c01 } from './vox.js';
import { puff, sparkle, shockRing, pebbles, spores } from './fx.js';
import { airAbove, solidAt } from './physics.js';
import { caveDensity, CS } from '../Generator.js';
import { VOX } from '../materials.js';
import { tonesOf } from './veil.js';
import { rand, clamp } from '../../core/util.js';

export const KV = 1 / 6; // meters per kaiju voxel as modelled
const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const NEAR_K = PHONE ? 1 : 2; // the near copy: refined 2× (1/12 m) on desktop
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ------------------------------------------------------------------ the ground
// The real rock where its chunk is built (pillars, features, the mole's digging), the generator's
// cave shapes where it isn't yet (the kaiju walks halls the mole hasn't seen). `plan` here is a
// { plan, world } pair (Kaiju.ground / ground(mgr)).
const open = (G, x, y, z) => {
  const w = G.world, ch = w && w.chunk(Math.floor(x * VOX / CS), Math.floor(y * VOX / CS), Math.floor(z * VOX / CS));
  if (ch && !ch.pending) return !solidAt(w, x, y, z);
  return caveDensity(G.plan, x, y, z) > 0;
};
/** The ground reader for a manager. */
export const ground = (mgr) => mgr.__ground || (mgr.__ground = { plan: mgr.plan, world: mgr.world });
/** The cave floor under (x, z) between y + up and y - down (m), or null. */
export function floorD(plan, x, y, z, up = 2.5, down = 6) {
  let prev = open(plan, x, y + up, z);
  for (let h = y + up - 0.25; h >= y - down; h -= 0.25) {
    const o = open(plan, x, h, z);
    if (prev && !o) return h + 0.125;
    prev = o;
  }
  return null;
}
/** Room for a body H tall and W wide standing at (x, fy, z). */
function clearAt(plan, x, fy, z, H, W) {
  for (const k of [0.15, 0.4, 0.7, 0.95]) if (!open(plan, x, fy + H * k, z)) return false;
  const y = fy + H * 0.55, r = W * 0.5;
  return open(plan, x + r, y, z) && open(plan, x - r, y, z) && open(plan, x, y, z + r) && open(plan, x, y, z - r);
}
/** A big hall around (x, fy, z): room to stand and to walk R m in most directions. */
export function hallAt(plan, x, fy, z, H, W, R) {
  if (!clearAt(plan, x, fy, z, H, W)) return 0;
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    let ok = true, y = fy;
    for (let d = R / 3; d <= R + 0.01 && ok; d += R / 3) {
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const f = floorD(plan, px, y, pz, 2, 3);
      ok = f !== null && Math.abs(f - y) < 2 && open(plan, px, f + H * 0.6, pz);
      if (ok) y = f;
    }
    if (ok) n++;
  }
  return n;
}

// ------------------------------------------------------------------ modelling helpers
const RAMP = (vb, ramp, k0, nk = 0.25) => (x, y, z, nx, ny) => ramp[Math.floor(clamp(k0 + (ny || 0) * 0.45 + (vb.n(x, y, z) - 0.5) * nk, 0, 0.999) * ramp.length)];
/** Living stone: plates with dark seams, a moss cap on top, flecks. */
function stone(vb, P, k0 = 0.4) {
  return (x, y, z, nx, ny, nz) => {
    if (typeof ny !== 'number') { ny = 0; nx = 0; nz = 0; }
    const n = vb.n(x, y, z), cell = vb.n(Math.floor((x + 64) / 4), Math.floor((y + 64) / 3), Math.floor((z + 64) / 4), 7);
    const seam = ((x + 64) % 4 === 0 && cell > 0.4) || ((y + 64) % 3 === 0 && cell < 0.55) || ((z + 64) % 4 === 0 && cell > 0.7);
    if (ny > 0.62 && vb.n(x >> 1, y >> 1, z >> 1, 3) > 0.45) return n > 0.7 ? P.moss[1] : P.moss[0];
    if (seam) return P.seam;
    if (n > 0.965) return P.fleck;
    return P.s[Math.floor(clamp(k0 + ny * 0.42 + (cell - 0.5) * 0.3 + (n - 0.5) * 0.12, 0, 0.999) * P.s.length)];
  };
}
/** A crystal: a six-sided prism from a to b that tapers to a point, banded light along its length. */
function crystal(vb, ax, ay, az, bx, by, bz, r, C) {
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps, rr = r * (i < steps - 2 ? 1 : i === steps - 2 ? 0.75 : 0.42);
    vb.cap(ax + (bx - ax) * t0, ay + (by - ay) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, ay + (by - ay) * t1, az + (bz - az) * t1, rr,
      (x, y, z) => C[Math.min(C.length - 1, Math.floor((t0 + 0.2) * C.length * 0.9 + (((x + y * 2 + z) % 3 + 3) % 3 === 0 ? 1 : 0)))]);
  }
  vb.set(Math.round(bx), Math.round(by), Math.round(bz), C[C.length - 1]);
}
/** Build both copies of a part: { hi, lo }. */
const LO = { only: false }; // (icons.js: portraits need only the far copy)
const two = (vb, px = 0, py = 0, pz = 0) => {
  const lo = vb.geo(px, py, pz, KV, 1);
  return { lo, hi: NEAR_K > 1 && !LO.only ? vb.geo(px, py, pz, KV, NEAR_K) : lo };
};
/** The far copies of a kaiju's parts (for its book portrait). */
export function kaijuLo(build) { LO.only = true; try { return build(); } finally { LO.only = false; } }

// =====================================================================================
// Crystal Titan
// =====================================================================================
const TITAN = {
  s: [0x4a4252, 0x665c6e, 0x82788c, 0xa096aa, 0xbeb4c6], seam: 0x2a2232, fleck: 0xd8d0e0, moss: [0x3a5a32, 0x5a7a42],
  tusk: [0xd8ccb0, 0xf4ecd8],
  cry: {
    3: [0x5a2a9a, 0x8a4ad0, 0xb07aff, 0xd8b8ff, 0xf6eeff],
    5: [0x1a5a8a, 0x2a8ac8, 0x5ac0f0, 0xa8e8ff, 0xf0fcff],
    6: [0x4a1a6a, 0x7a2aa0, 0xc04ae0, 0xf08aff, 0xfff0ff],
  },
};
const cryFor = (z) => (z >= 6 ? 6 : z >= 5 ? 5 : 3);

const TITAN_PARTS = {
  body(z) {
    const P = TITAN, C = P.cry[z];
    const t = new VB(501), st = stone(t, P, 0.42);
    t.ell(0, 0, 0, 13, 11, 17, st);
    t.ell(0, 5, 7, 14, 11, 10, st); // the great shoulders
    t.ell(0, -3, -6, 11, 8, 11, st);
    t.ell(0, 3, 15, 8, 7, 5, st); // the neck socket
    // crystals bursting through the back in clusters, leaning out from the spine
    const cr = new VB(502);
    const R = (i, s) => t.n(i, s, 3, 11);
    for (let i = 0; i < 13; i++) {
      const x = Math.round((R(i, 1) - 0.5) * 16), zz = Math.round(-13 + R(i, 2) * 25);
      const h = t.hitFrom(x, 30, zz, 0, -1, 0, 40);
      if (!h) continue;
      const lean = x * 0.06 + (R(i, 3) - 0.5) * 0.5, L = 7 + R(i, 4) * 10 * (1 - Math.abs(x) / 14), r = 1.4 + R(i, 5) * 1.6;
      crystal(cr, h[0], h[1] - 2, h[2], h[0] + lean * L, h[1] + L, h[2] + (R(i, 6) - 0.6) * L * 0.5, r, C);
      // little ones round its foot
      for (let j = 0; j < 2; j++) { const a = R(i, 7 + j) * TAU; crystal(cr, h[0] + Math.cos(a) * r * 1.6, h[1] - 1, h[2] + Math.sin(a) * r * 1.6, h[0] + Math.cos(a) * (r * 1.6 + 2), h[1] + 3 + j * 2, h[2] + Math.sin(a) * (r * 1.6 + 2), r * 0.5, C); }
    }
    return { torso: two(t), crystals: two(cr), cry: c01(C[2]), glow: c01(C[3]), rock: c01(P.s[2]) };
  },
  head(z) {
    const P = TITAN, C = P.cry[z];
    const h = new VB(503), st = stone(h, P, 0.5);
    h.ell(0, 0, 3, 6.5, 6, 7, st);
    h.ell(0, 3, 6.5, 7, 2.4, 3, (x, y, zz) => P.s[1]); // the heavy brow
    h.ell(0, -2, 8, 5, 3.4, 3.5, st); // the snout
    for (const sd of [1, -1]) { crystal(h, sd * 3, 4, 3, sd * 6, 10, 0, 1.2, C); } // crystal horns
    const jaw = new VB(504);
    jaw.ell(0, -1.6, 4, 5.2, 2.2, 5.5, stone(jaw, P, 0.3));
    for (const sd of [1, -1]) jaw.cap(sd * 3.5, -0.5, 7.5, sd * 4, 3.5, 8.5, 0.9, (x, y, zz, tt) => P.tusk[tt > 0.5 ? 1 : 0]); // tusks
    const eyes = new VB(505);
    for (const sd of [1, -1]) eyes.box(sd > 0 ? 2 : -4, 1, 9, sd > 0 ? 3 : -3, 2, 9, C[4]);
    eyes.set(2, 2, 9, 0xffffff); eyes.set(-4, 2, 9, 0xffffff); // glints
    return { head: two(h), jaw: two(jaw), eyes: two(eyes) };
  },
  arm(z) {
    const P = TITAN, C = P.cry[z];
    const u = new VB(506), su = stone(u, P, 0.38);
    u.ell(0, -1, 0, 6.5, 6, 6.5, su); // the shoulder boulder
    u.cap(0, 0, 0, 0, -15, 1, 4.6, su);
    crystal(u, 3, 3, -1, 6, 9, -3, 1.3, C); crystal(u, 4, 1, 2, 7, 5, 4, 0.9, C);
    const f = new VB(507), sf = stone(f, P, 0.34);
    f.cap(0, 0, 0, 0, -11, 0, 3.9, sf);
    f.ell(0, -9, 0, 4.8, 4, 4.8, sf);
    const fist = new VB(508), sk = stone(fist, P, 0.3);
    fist.ell(0, -2.5, 1, 5.4, 3.8, 5.8, sk);
    for (let i = -2; i <= 2; i++) fist.ell(i * 2, -4.5, 5, 1.3, 1.3, 1.4, P.s[3]); // knuckles
    return { upper: two(u), fore: two(f), fist: two(fist) };
  },
  leg(z) {
    const P = TITAN;
    const th = new VB(509), s1 = stone(th, P, 0.36);
    th.ell(0, -1, 0, 6, 6, 6.5, s1);
    th.cap(0, 0, 0, 0, -12, 0, 5.2, s1);
    const sh = new VB(510), s2 = stone(sh, P, 0.32);
    sh.cap(0, 0, 0, 0, -11, 1, 4.4, s2);
    const ft = new VB(511), s3 = stone(ft, P, 0.28);
    ft.ell(0, -2.5, 2, 5.4, 2.8, 7, s3);
    for (const x of [-3, 0, 3]) ft.ell(x, -4, 8.5, 1.4, 1.2, 1.6, P.s[3]);
    return { thigh: two(th), shin: two(sh), foot: two(ft) };
  },
};

// =====================================================================================
// Fungal Colossus
// =====================================================================================
const COLO = {
  stalk: [0x8a7a62, 0xa8987a, 0xc8b898, 0xe2d4b6, 0xf4ead4], ridge: 0x6e604c, lichen: [0x6a8a5a, 0x9ab07a],
  cap: [0x3a2252, 0x56307a, 0x7442a0, 0x9a5ac0], spot: 0x8afff0, gill: [0x2ad0c0, 0x8afff0, 0xd8fff8], gillDark: 0x1a3a44,
  root: [0x6a5440, 0x8a6e52, 0xae9068], eye: 0xb8fff4, mouth: 0x140c18,
};
const COLO_PARTS = {
  stalk() {
    const P = COLO;
    const s = new VB(521);
    const fib = (x, y, z, t) => {
      const n = s.n(x, y, z), a = Math.atan2(z, x);
      if (((Math.floor((a + Math.PI) * 4) % 3) === 0) && n > 0.3) return P.ridge;
      if (s.n(x >> 1, y >> 2, z >> 1, 5) > 0.82) return P.lichen[n > 0.5 ? 1 : 0];
      return P.stalk[Math.floor(clamp(0.35 + Math.cos(a - 0.8) * 0.25 + (n - 0.5) * 0.3 + y * 0.004, 0, 0.999) * 5)];
    };
    s.cap(0, 2, 0, 0, 40, 0, 6.6, fib);
    s.ell(0, 4, 0, 9.5, 6, 9.5, fib); // the base flares out
    s.ell(0, 37, 0, 8, 5, 8, fib); // and into the cap
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; s.cap(Math.cos(a) * 6.4, 4, Math.sin(a) * 6.4, Math.cos(a) * 6, 37, Math.sin(a) * 6, 1.2, P.stalk[3]); }
    // a face: two deep eye hollows and a gaping mouth (the glow sits in its own mesh)
    for (const sx of [3, -4]) for (let y = 31; y <= 33; y++) for (let x = sx; x <= sx + 1; x++) { const h = s.hitFrom(x, y, 14, 0, 0, -1, 16); if (h) { s.set(h[0], h[1], h[2], P.mouth); s.set(h[0], h[1], h[2] - 1, P.mouth); } }
    for (let x = -2; x <= 1; x++) for (let y = 25; y <= 27; y++) { const h = s.hitFrom(x, y, 14, 0, 0, -1, 16); if (h) s.set(h[0], h[1], h[2], P.mouth); }
    const eyes = new VB(522);
    for (const sx of [3, -4]) { const h = s.hitFrom(sx, 32, 14, 0, 0, -1, 16); if (h) { eyes.set(h[0], h[1], h[2] - 1, P.eye); eyes.set(h[0] + 1, h[1], h[2] - 1, P.eye); eyes.set(h[0], h[1] + 1, h[2] - 1, 0xffffff); } }
    return { stalk: two(s), eyes: two(eyes) };
  },
  cap() {
    const P = COLO;
    const c = new VB(523), glow = new VB(524);
    c.ell(0, 0, 0, 27, 13, 27, (x, y, z, nx, ny) => (y < 0 ? -1 : P.cap[Math.floor(clamp(0.3 + ny * 0.55 + (c.n(x, y, z) - 0.5) * 0.25, 0, 0.999) * 4)]));
    // glowing spots on the dome
    const spots = [];
    for (let i = 0; i < 26; i++) { const a = c.n(i, 1, 2, 9) * TAU, e = 0.15 + c.n(i, 2, 3, 9) * 0.8; spots.push([Math.cos(a) * Math.cos(e) * 26, Math.sin(e) * 12.5, Math.sin(a) * Math.cos(e) * 26, 1.6 + c.n(i, 3, 4, 9) * 2.2]); }
    for (const v of c.list()) for (const [sx, sy, sz, r] of spots) if (Math.hypot(v.x + 0.5 - sx, (v.y + 0.5 - sy) * 1.4, v.z + 0.5 - sz) < r) { c.del(v.x, v.y, v.z); glow.set(v.x, v.y, v.z, P.spot); break; }
    // the underside: radial gills (bright and dark), a lip
    for (let z = -26; z <= 26; z++) for (let x = -26; x <= 26; x++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > 26.5 || r < 7) continue;
      const a = Math.atan2(z + 0.5, x + 0.5), g = Math.floor((a + Math.PI) * 9) % 2;
      if (r > 25) { c.set(x, -1, z, P.cap[1]); continue; }
      if (g) glow.set(x, -1, z, r > 18 ? P.gill[0] : P.gill[1]); else c.set(x, -1, z, P.gillDark);
      if (g && c.n(x, 0, z, 6) > 0.6) glow.set(x, -2, z, P.gill[2]);
    }
    // spore tassels hanging from the rim
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + c.n(i, 0, 0, 12) * 0.3, r = 21 + c.n(i, 1, 0, 12) * 4, L = 4 + c.n(i, 2, 0, 12) * 6;
      glow.cap(Math.cos(a) * r, -2, Math.sin(a) * r, Math.cos(a) * r, -2 - L, Math.sin(a) * r, 0.6, P.gill[1]);
      glow.ell(Math.cos(a) * r, -3 - L, Math.sin(a) * r, 1.2, 1.4, 1.2, P.gill[2]);
    }
    return { cap: two(c), gills: two(glow), spore: c01(P.gill[1]), capCol: c01(P.cap[2]), light: c01(P.gill[0]) };
  },
  leg() {
    const P = COLO;
    const bark = (vb) => (x, y, z, t) => P.root[Math.floor(clamp(0.4 + (vb.n(x, y >> 1, z) - 0.5) * 0.9 - (t || 0) * 0.2, 0, 0.999) * 3)];
    const th = new VB(525); th.cap(0, 0, 0, 0, -11, 0, 4.2, bark(th)); th.ell(0, -1, 0, 5.5, 5, 5.5, bark(th));
    const sh = new VB(526); sh.cap(0, 0, 0, 0, -10, 0, 3.2, bark(sh));
    const ft = new VB(527);
    ft.ell(0, -1.5, 0, 4, 2, 4, bark(ft));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; ft.cap(0, -2, 0, Math.cos(a) * 7, -3.5, Math.sin(a) * 7, 1.1, bark(ft)); } // root toes
    return { thigh: two(th), shin: two(sh), foot: two(ft) };
  },
};

/** Build one missing part set of a kaiju per call (Enemies.prewarm); true once all are built. */
function warmParts(mgr, key, parts, all = false) {
  for (const [name, fn] of Object.entries(parts)) {
    const k = key + '|' + name;
    if (mgr.geos.has(k)) continue;
    mgr.geo(k, fn);
    if (!all) return Object.keys(parts).every((n) => mgr.geos.has(key + '|' + n));
  }
  return true;
}

// =====================================================================================
// The shared body and brain
// =====================================================================================
export class Kaiju extends Enemy {
  constructor(mgr, o) {
    super(mgr, o);
    this.awake = true;
    this.mass = 400; this.kb = 0; this.size = 1;
    this.plan = ground(mgr); // (floorD / clearAt read the rock through it)
    this.home = this.pos.clone();
    this.goal = this.pos.clone();
    this.state = 'graze'; this.st = rand(2, 5);
    this.speed = 0; this.gait = Math.random(); this.limbs = [];
    this.lod = -1; this.lodParts = [];
    this.watchT = 0; this.roarCd = rand(10, 18); this.angryT = 0;
    this.floorY = this.pos.y; this.floorT = 0; this.aheadT = 0;
    this.scatterT = 0; this.thinkT = 0;
    this.spheres = [];
    this.hitDefs = [];
    this.stompAt = new THREE.Vector3();
    this.hitR = 2;
  }
  piece(G, parent, x, y, z, mat) {
    const m = this.part(G.lo, mat, parent, x, y, z);
    this.lodParts.push([m, G.hi, G.lo]);
    return m;
  }
  sphere(obj, x, y, z, r, part) { this.hitDefs.push({ obj, p: new THREE.Vector3(x, y, z), r, part }); this.spheres.push({ x: 0, y: 0, z: 0, r, part }); }
  setLod(l) { if (l === this.lod) return; this.lod = l; for (const [m, hi, lo] of this.lodParts) m.geometry = l ? hi : lo; }
  limb(top, mid, low, off, len, front) { this.limbs.push({ top, mid, low, off, len, front, prev: 0 }); }

  // ------------------------------------------------------------------ brain (a few times a second)
  think(dt) {
    const m = this.mgr;
    this.angryT = Math.max(0, this.angryT - dt);
    this.roarCd -= dt;
    // noticing the mole: in sight, not crouched in the shadows (it turns its head and its eyes brighten)
    const seen = this.sees && !m.safe && (this.dist < (m.pl.crouched ? 11 : 26));
    this.watchT = seen ? Math.min(4, this.watchT + dt) : Math.max(0, this.watchT - dt * 0.6);
    // the moving body: everything small near its path runs for it
    this.scatterT -= dt;
    if (this.scatterT <= 0) { this.scatterT = 0.6; if (this.speed > 0.2 || this.state === 'roar') this.scatter(this.state === 'roar' ? 30 : 13); }
    switch (this.state) {
      case 'wander': {
        if (this.turnWalk(this.goal.x, this.goal.z, dt) < this.walkR) { this.setState(Math.random() < 0.8 ? 'graze' : 'rest'); this.st = 0; this.dur = rand(6, 14); }
        this.aheadT -= dt;
        if (this.aheadT <= 0) { this.aheadT = 0.5; if (!this.pathOK(this.pos.x, this.pos.z, this.pos.x + Math.sin(this.yaw) * 3.5, this.pos.z + Math.cos(this.yaw) * 3.5)) { this.setState('graze'); this.dur = rand(1, 3); } }
        if (this.st > 40) this.setState('graze');
        this.maybeRoar();
        break;
      }
      case 'graze': case 'rest': {
        this.speed = Math.max(0, this.speed - dt * 0.6);
        if (this.watchT > 0.5) this.face(m.pc.x, m.pc.z, 0.12, dt);
        if (this.st > (this.dur ?? 8)) { if (!this.pickGoal()) { this.dur = rand(3, 6); this.st = 0; this.yaw += rand(-1, 1); } }
        this.maybeRoar();
        break;
      }
      case 'roarTell': {
        // rears up, glows, a rumble building: get behind something or get ready to jump
        this.speed = Math.max(0, this.speed - dt * 2);
        this.face(m.pc.x, m.pc.z, 0.5, dt);
        this.tell(this.st / this.roarTell, true);
        if (this.st > this.roarTell) { this.setState('roar'); this.roar(); }
        break;
      }
      case 'roar': if (this.st > 1.6) { this.setState(this.angryT > 0 ? 'hunt' : 'graze'); this.dur = rand(4, 8); } break;
      case 'hunt': {
        // angry: lumbers toward the mole and stomps where it stands
        if (this.angryT <= 0 || m.safe || this.dist > 34) { this.setState('graze'); this.dur = 4; break; }
        const d = this.hd;
        this.aheadT -= dt;
        if (this.aheadT <= 0) { this.aheadT = 0.5; this.blocked = !this.pathOK(this.pos.x, this.pos.z, this.pos.x + Math.sin(this.yaw) * 3.5, this.pos.z + Math.cos(this.yaw) * 3.5); }
        if (d > this.stompR * 0.8 && !this.blocked) this.turnWalk(m.pc.x, m.pc.z, dt, 1.2);
        else { this.speed = Math.max(0, this.speed - dt); this.face(m.pc.x, m.pc.z, 0.5, dt); }
        if (d < this.stompR && this.atkCd <= 0) {
          // the foot nearest the mole comes down where it stands (as far as that foot reaches)
          this.setState('stompTell'); this.stompLimb = this.nearLimb();
          this.stompLimb.low.getWorldPosition(_v);
          const dx = m.pc.x - _v.x, dz = m.pc.z - _v.z, l = Math.hypot(dx, dz), k = l > 3.5 ? 3.5 / l : 1;
          this.stompAt.set(_v.x + dx * k, this.pos.y, _v.z + dz * k);
          this.sound2('golem_roar', 0.5, 0.7);
        }
        this.maybeRoar();
        break;
      }
      case 'stompTell': {
        // a foot lifts high, glowing red: move!
        this.speed = 0;
        this.tell(this.st / 1.35, true);
        if (this.st > 1.35) { this.setState('stomp'); this.stomp(); }
        break;
      }
      case 'stomp': if (this.st > 1.6) { this.setState('hunt'); this.atkCd = rand(2.5, 4); } break; // stuck a moment: hit it now
    }
  }
  maybeRoar() {
    if (this.roarCd > 0 || this.watchT < 2.4 || this.dist > 28) return;
    this.roarCd = rand(40, 70);
    this.setState('roarTell');
    this.sound2('golem_roar', 0.6, 0.45);
  }
  /** Turn toward (x, z) and walk; returns the distance left. */
  turnWalk(x, z, dt, k = 1) {
    const off = this.face(x, z, this.turnRate * k, dt);
    const want = off < 0.5 ? this.walkSpeed * k : this.walkSpeed * 0.15;
    this.speed += (want - this.speed) * Math.min(1, dt * 0.8);
    return Math.hypot(x - this.pos.x, z - this.pos.z);
  }
  /** A walkable line for its bulk (generator shapes: no digging, no chunks needed). */
  pathOK(x0, z0, x1, z1) {
    let y = this.floorY;
    for (let i = 1; i <= 5; i++) {
      const t = i / 5, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const f = floorD(this.plan, x, y, z, 1.8, 2.5);
      if (f === null || Math.abs(f - y) > 1.5 || !clearAt(this.plan, x, f, z, this.H, this.W)) return false;
      if (this.mgr.excluded(x, f, z, 6)) return false;
      y = f;
    }
    return true;
  }
  pickGoal() {
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * TAU, d = rand(8, 20);
      const x = this.home.x + Math.cos(a) * d, z = this.home.z + Math.sin(a) * d;
      if (Math.hypot(x - this.pos.x, z - this.pos.z) < 5) continue;
      if (!this.pathOK(this.pos.x, this.pos.z, x, z)) continue;
      this.goal.set(x, this.pos.y, z);
      this.setState('wander');
      return true;
    }
    return false;
  }
  nearLimb() {
    let best = this.limbs[0], bd = 1e9;
    for (const L of this.limbs) { L.low.getWorldPosition(_v); const d = Math.hypot(_v.x - this.mgr.pc.x, _v.z - this.mgr.pc.z); if (L.front && d < bd) { bd = d; best = L; } }
    return best;
  }

  // ------------------------------------------------------------------ body
  move(dt) {
    // walk along its heading, riding the cave floor (no voxel collision: nothing can wedge it, or the mole)
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    this.floorT -= dt;
    if (this.floorT <= 0) {
      this.floorT = 0.25;
      const f = floorD(this.plan, this.pos.x, this.floorY, this.pos.z, 2, 3);
      if (f !== null) this.floorY = f;
    }
    this.pos.y += (this.floorY - this.pos.y) * Math.min(1, dt * 2);
    this.vel.set(0, 0, 0);
    this.grounded = true;
    // the gait: each limb thumps down once per cycle
    this.gait += (this.speed * dt) / this.stride;
    for (const L of this.limbs) {
      const ph = ((this.gait + L.off) % 1 + 1) % 1;
      if (L.prev < 0.75 && ph >= 0.75 && this.speed > 0.05) this.footfall(L);
      L.prev = ph;
    }
  }
  /** A footfall: thump, shake (by distance), dust round the foot, grit from the roof over the mole. */
  footfall(L, k = 1) {
    const m = this.mgr;
    L.low.getWorldPosition(_v);
    const fy = this.pos.y;
    const d = Math.hypot(m.pc.x - _v.x, m.pc.z - _v.z);
    const near = clamp(1 - d / 42, 0, 1);
    if (near > 0.05) m.queueEv({ shake: near * near * 0.4 * k });
    if (d < 40) {
      shockRing(this.fx, _v.x, fy, _v.z, 0.8, 2.2, m.dustCol(this.pos), Math.round(16 * (this.fx.lod || 1)));
      this.fx.dust(_v.x, fy + 0.2, _v.z, 6, m.dustCol(this.pos), 0.8);
      this.sound2('stomp', 0.9 * k, 0.55);
      if (near > 0.4) this.sound2('rumble_hit', 0.4 * k, 1);
    }
    if (near > 0.2) this.roofGrit(near * k);
    // right under a foot: shoved clear (never pinned)
    if (d < 1.6 && Math.abs(m.pc.y - fy) < 1.5) { const ux = (m.pc.x - _v.x) / (d || 1), uz = (m.pc.z - _v.z) / (d || 1); m.pl.vel.x += ux * 4; m.pl.vel.z += uz * 4; m.pl.vel.y = Math.max(m.pl.vel.y, 2.5); }
  }
  /** Grit and pebbles shaken off the roof right over the mole. */
  roofGrit(k) {
    const m = this.mgr, pc = m.pc;
    const a = airAbove(m.world, pc.x, pc.y + 0.6, pc.z, 14);
    if (a >= 13.5) return;
    const top = pc.y + 0.6 + a - 0.05, col = m.dustCol({ x: pc.x, y: top + 0.3, z: pc.z });
    const n = Math.round(26 * k * (this.fx.lod || 1));
    for (let i = 0; i < n; i++) {
      const x = pc.x + rand(-3.5, 3.5), z = pc.z + rand(-3.5, 3.5);
      this.fx.spawn({ x, y: top - rand(0, 0.2), z, vx: rand(-0.1, 0.1), vy: rand(-0.6, 0), vz: rand(-0.1, 0.1), life: rand(1.6, 2.6), size: rand(0.01, 0.026), color: col, alpha: 0.85, drag: 0.8, grav: 3.2, lit: 0.7, swirl: 0.2 });
    }
    if (k > 0.5) pebbles(this.fx, pc.x + rand(-2, 2), top - 0.1, pc.z + rand(-2, 2), Math.round(4 * k), col.map((c) => c * 0.8), 1.2, 0);
  }
  /** Everything small near it runs (critters scatter, the timid flee, a dust bunny bursts). */
  scatter(R) {
    const m = this.mgr;
    for (const c of m.list) {
      if (c === this || !c.alive || c.info.kaiju) continue;
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      if (d > R || Math.abs(c.pos.y - this.pos.y) > 8) continue;
      if (c.passive) { c.scared = 3; if (c.kind === 'dust_bunny' && d < R * 0.45) c.onPoke?.(); continue; }
      if (c.swarm) { c.swarm.wake(m); if (c.state !== 'scatter') c.swarm.scatter?.(m, this.center); continue; }
      if (c.setMode && c.mode !== 'fight') { c.scare = 4; c.scareAt = { x: this.pos.x, z: this.pos.z, k: 1 }; if (c.asleep && d < R * 0.6) c.wakeUp?.(true); }
    }
  }
  /** A sound heard much further than a creature's (the kaiju is big). */
  sound2(name, vol, pitch = 1) {
    const k = clamp(1 - this.dist / 55, 0, 1);
    if (k > 0.04) this.mgr.audio?.play?.(name, { vol: vol * k, pitch });
  }
  roar() {
    const m = this.mgr;
    this.sound2('roar_big', 1, 0.55);
    this.sound2('golem_roar', 0.9, 0.5);
    const near = clamp(1 - this.dist / 45, 0, 1);
    m.queueEv({ shake: 0.4 + near * 0.6 });
    this.roofGrit(1.4 * near + 0.3);
    this.scatter(30);
    this.roarFx?.(near);
  }
  stomp() {
    const m = this.mgr, p = this.stompAt;
    this.footfall(this.stompLimb, 2.2);
    shockRing(this.fx, p.x, this.pos.y, p.z, 0.6, 6, m.dustCol(this.pos), 64);
    pebbles(this.fx, p.x, this.pos.y + 0.3, p.z, 22, m.dustCol(this.pos), 0.8, 3.5);
    m.addHazard({ kind: 'ring', x: p.x, y: this.pos.y, z: p.z, r: 0.6, speed: 6.5, rMax: 10, dmg: this.info.dmg * 0.6, src: this });
    this.sound2('smash', 1, 0.6);
    if (Math.hypot(m.pc.x - p.x, m.pc.z - p.z) < 1.8) this.hurtPlayer(this.info.dmg, [Math.sign(m.pc.x - p.x) * 4, 4, Math.sign(m.pc.z - p.z) * 4], this.kind, { heavy: true, unblockable: true });
  }
  takeHit(power, dir, o = {}) {
    if (!this.alive) return;
    if (o.by === 'player' || !o.by) { this.angryT = 30; if (this.state === 'graze' || this.state === 'rest' || this.state === 'wander') { this.setState('hunt'); this.atkCd = 1.5; } }
    if (this.hp - power <= 0) this.setLod(0); // crumbles from the light copy
    super.takeHit(power, dir, o);
    this.sound2('thud', 0.7, 0.6);
  }
  onHit() {}
  stun() {}

  // ------------------------------------------------------------------ frame extras
  common(dt) {
    super.common(dt);
    // detail by distance (phones see the far copy): and hidden past the fog with the rock
    const fog = this.mgr.U?.fogDist?.value ?? 40;
    this.root.visible = this.dist < fog + 6;
    this.setLod(this.dist < (PHONE ? 16 : 36) ? 1 : 0);
  }
  place() {
    const r = this.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    r.scale.setScalar(this.size);
  }
  updateSpheres() {
    this.root.updateMatrixWorld(true);
    let i = 0;
    for (const h of this.hitDefs) {
      _w.copy(h.p); h.obj.localToWorld(_w);
      const s = this.spheres[i++];
      s.x = _w.x; s.y = _w.y; s.z = _w.z; s.r = h.r * this.size;
    }
    const b = this.spheres[0];
    this.center.set(b.x, b.y, b.z);
  }
  /** Limbs swing in the gait; a lifted limb (the stomp tell) rises high. */
  animateLimbs(dt, amp, bend) {
    const lift = this.state === 'stompTell' ? smooth(this.st / 0.6) : this.state === 'stomp' ? Math.max(0, 1 - this.st * 6) : 0;
    const move = clamp(this.speed / this.walkSpeed, 0, 1);
    for (const L of this.limbs) {
      const ph = ((this.gait + L.off) % 1 + 1) % 1, a = ph * TAU;
      let swing = Math.sin(a) * amp * move, knee = Math.max(0, Math.cos(a)) * bend * move;
      if (L === this.stompLimb && lift > 0) { swing = -1.1 * lift * (L.front ? 1 : 0.6); knee = 0.9 * lift; }
      L.top.rotation.x += (swing - L.top.rotation.x) * Math.min(1, dt * 6);
      L.mid.rotation.x += ((L.front ? -knee : knee) - L.mid.rotation.x) * Math.min(1, dt * 6);
    }
  }
  partLabel(p) { return p === 'crystals' ? 'Crystals' : ''; }
}

// ------------------------------------------------------------------ Crystal Titan
export class CrystalTitan extends Kaiju {
  static info = { id: 'crystal_titan', name: 'Crystal Titan', color: '#c8a0ff', hits: 46, dmg: 12, poise: 99, noStun: true, tier: 9, kaiju: true, snd: 'stone', keepFar: 95, sight: 34, glowBits: true };
  static H = 9; static W = 5.5; static zones = [3, 4, 5, 6];
  static key(zone) { return 'titan' + cryFor(zone); }
  static ready(mgr, zone) { const k = CrystalTitan.key(zone); return ['body', 'head', 'arm', 'leg'].every((n) => mgr.geos.has(k + '|' + n)); }
  static warm(mgr, zone, all = false) { const z = cryFor(zone); return warmParts(mgr, 'titan' + z, { body: () => TITAN_PARTS.body(z), head: () => TITAN_PARTS.head(z), arm: () => TITAN_PARTS.arm(z), leg: () => TITAN_PARTS.leg(z) }, all); }
  constructor(mgr, o) {
    const C = CrystalTitan;
    super(mgr, o);
    this.H = C.H; this.W = C.W; this.cy = 5.2; this.walkSpeed = 0.75; this.turnRate = 0.32; this.stride = 3.2; this.walkR = 1.5; this.stompR = 6.5; this.roarTell = 1.9;
    C.warm(mgr, this.zone, true);
    const key = C.key(this.zone);
    const B = mgr.geo(key + '|body'), Hd = mgr.geo(key + '|head'), A = mgr.geo(key + '|arm'), Lg = mgr.geo(key + '|leg');
    this.G = B;
    this.hitCol = B.rock;
    this.mat = this.material({ texel: 48, emissive: 0.3 }); // (a faint glow of its own: a silhouette even past the lamp)
    this.cryMat = this.material({ emissive: 1.1, rimK: 0.5 });
    this.eyeMat = this.material({ emissive: 1.6, rimK: 0 });
    this.bodyG = this.group3(this.root, 0, 31 * KV, 0);
    this.bodyG.rotation.x = -0.14;
    this.piece(B.torso, this.bodyG, 0, 0, 0, this.mat);
    this.piece(B.crystals, this.bodyG, 0, 0, 0, this.cryMat);
    this.headG = this.group3(this.bodyG, 0, 4 * KV, 18 * KV);
    this.piece(Hd.head, this.headG, 0, 0, 0, this.mat);
    this.jawG = this.group3(this.headG, 0, -2 * KV, 2 * KV);
    this.piece(Hd.jaw, this.jawG, 0, 0, 0, this.mat);
    this.piece(Hd.eyes, this.headG, 0, 0, 0, this.eyeMat);
    this.headObj = this.headG; this.headTop = 7 * KV; this.headFwd = 6 * KV;
    for (const sd of [1, -1]) {
      // arms (it walks on its knuckles), then hind legs
      const sh = this.group3(this.root, sd * 13 * KV, 34 * KV, 10 * KV);
      const up = this.piece(A.upper, sh, 0, 0, 0, this.mat); if (sd < 0) up.scale.x = -1;
      const el = this.group3(sh, 0, -15 * KV, 1 * KV);
      this.piece(A.fore, el, 0, 0, 0, this.mat);
      const wr = this.group3(el, 0, -11 * KV, 0);
      this.piece(A.fist, wr, 0, 0, 0, this.mat);
      this.limb(sh, el, wr, sd > 0 ? 0 : 0.5, 31 * KV, true);
      this.sphere(sh, 0, -6 * KV, 0, 1.1, 'arm'); this.sphere(el, 0, -7 * KV, 0, 0.95, 'arm');
      const hp = this.group3(this.root, sd * 9 * KV, 27 * KV, -12 * KV);
      this.piece(Lg.thigh, hp, 0, 0, 0, this.mat);
      const kn = this.group3(hp, 0, -12 * KV, 0);
      this.piece(Lg.shin, kn, 0, 0, 0, this.mat);
      const an = this.group3(kn, 0, -11 * KV, 1 * KV);
      this.piece(Lg.foot, an, 0, 0, 0, this.mat);
      this.limb(hp, kn, an, sd > 0 ? 0.75 : 0.25, 27 * KV, false);
      this.sphere(hp, 0, -6 * KV, 0, 1.2, 'leg'); this.sphere(kn, 0, -6 * KV, 0, 1, 'leg');
    }
    this.hitDefs.unshift({ obj: this.bodyG, p: new THREE.Vector3(0, 0, 0), r: 2.6, part: 'body' });
    this.spheres.unshift({ x: 0, y: 0, z: 0, r: 2.6, part: 'body' });
    this.sphere(this.headG, 0, 0, 4 * KV, 1.3, 'head');
    this.sphere(this.bodyG, 0, 14 * KV, -2 * KV, 2.2, 'crystals');
    this.setLod(0);
    this.place(); this.updateSpheres();
  }
  animate(dt) {
    const t = this.t, s = this.state;
    this.animateLimbs(dt, 0.32, 0.5);
    const rear = s === 'roarTell' ? smooth(this.st / this.roarTell) : s === 'roar' ? Math.max(0, 1 - this.st / 1.6) : 0;
    const graze = (s === 'graze' && this.watchT < 0.5) ? 1 : 0, rest = s === 'rest' ? Math.min(1, this.st / 2) : 0;
    const move = clamp(this.speed / this.walkSpeed, 0, 1);
    this.bodyG.position.y = (31 - rest * 6) * KV - Math.abs(Math.sin(this.gait * TAU * 2)) * 0.16 * move + rear * 0.9;
    this.bodyG.rotation.x += ((-0.14 - rear * 0.32 + graze * 0.12) - this.bodyG.rotation.x) * Math.min(1, dt * 2);
    this.bodyG.rotation.z = Math.sin(this.gait * TAU) * 0.035 * move;
    // the head: looks at the mole when it has noticed it, licks crystal off the floor when grazing
    const m = this.mgr;
    let hx = 0, hy = 0;
    if (s === 'hunt' || s === 'stompTell' || this.watchT > 0.4 || rear > 0) {
      this.headG.updateWorldMatrix(true, false); this.headG.getWorldPosition(_v);
      hy = wrapA(Math.atan2(m.eye.x - _v.x, m.eye.z - _v.z) - this.yaw);
      hx = -Math.atan2(m.eye.y - _v.y, Math.hypot(m.eye.x - _v.x, m.eye.z - _v.z));
    } else if (graze) { hx = 0.9 + Math.sin(t * 1.4) * 0.12; hy = Math.sin(t * 0.5) * 0.3; }
    this.headG.rotation.y += (clamp(hy, -0.8, 0.8) - this.headG.rotation.y) * Math.min(1, dt * 1.6);
    this.headG.rotation.x += (clamp(hx - rear * 0.6, -0.9, 1.1) - this.headG.rotation.x) * Math.min(1, dt * 1.6);
    this.jawG.rotation.x = rear * 0.7 + graze * Math.max(0, Math.sin(t * 2.2)) * 0.2;
    if (graze && Math.random() < dt * 6) { this.headG.localToWorld(_v.set(0, -4 * KV, 10 * KV)); sparkle(this.fx, _v.x, _v.y, _v.z, 2, this.G.glow, 0.8, 1.5, 0.02, 0.5); }
    // eyes and crystals: brighter the more it watches you, blazing before a roar
    this.eyeMat.uniforms.emissive.value = 1.2 + this.watchT * 0.4 + rear * 2;
    this.cryMat.uniforms.emissive.value = 0.9 + Math.sin(t * 0.8) * 0.15 + this.watchT * 0.12 + rear * 1.8;
    if (Math.random() < dt * 4 && this.dist < 40) { this.bodyG.localToWorld(_v.set(rand(-8, 8) * KV, rand(10, 22) * KV, rand(-12, 10) * KV)); this.fx.spawn({ x: _v.x, y: _v.y, z: _v.z, vy: 0.3, life: 1.5, size: 0.035, color: this.G.glow, glow: true, drag: 0.6, swirl: 0.3 }); }
  }
  roarFx(near) {
    // a shockwave rolls out along the floor (jump it) and the crystals shed glitter
    const m = this.mgr;
    if (this.dist < 30) m.addHazard({ kind: 'ring', x: this.pos.x, y: this.pos.y, z: this.pos.z, r: 3, speed: 7, rMax: 22, dmg: this.info.dmg * 0.5, src: this });
    shockRing(this.fx, this.pos.x, this.pos.y, this.pos.z, 3, 7, this.G.rock, 80);
    this.bodyG.localToWorld(_v.set(0, 16 * KV, 0));
    sparkle(this.fx, _v.x, _v.y, _v.z, 40, this.G.glow, 4, 2, 0.03, 1.2);
  }
  light() {
    if (this.dist > 45) return null;
    this.bodyG.localToWorld(_v.set(0, 16 * KV, 0));
    const c = this.G.cry, k = 1.2 + this.watchT * 0.2 + (this.state === 'roarTell' ? 1.5 : 0);
    return { x: _v.x, y: _v.y, z: _v.z, c: [c[0] * k, c[1] * k, c[2] * k], r: 9 };
  }
  deathFx() { this.sound2('golem_crumble', 1, 0.5); this.sound2('crystal_ring', 1, 0.6); sparkle(this.fx, this.center.x, this.center.y + 2, this.center.z, 60, this.G.glow, 5, 3, 0.03, 1.4); }
}

// ------------------------------------------------------------------ Fungal Colossus
export class FungalColossus extends Kaiju {
  static info = { id: 'fungal_colossus', name: 'Fungal Colossus', color: '#8afff0', hits: 40, dmg: 10, poise: 99, noStun: true, tier: 9, kaiju: true, snd: 'flesh', keepFar: 95, sight: 30, glowBits: true };
  static H = 12; static W = 7; static zones = [1, 2, 3];
  static key() { return 'colossus'; }
  static ready(mgr) { return ['stalk', 'cap', 'leg'].every((n) => mgr.geos.has('colossus|' + n)); }
  static warm(mgr, zone, all = false) { return warmParts(mgr, 'colossus', { stalk: COLO_PARTS.stalk, cap: COLO_PARTS.cap, leg: COLO_PARTS.leg }, all); }
  constructor(mgr, o) {
    const C = FungalColossus;
    super(mgr, o);
    this.H = C.H; this.W = C.W; this.cy = 7; this.walkSpeed = 0.6; this.turnRate = 0.28; this.stride = 3; this.walkR = 1.5; this.stompR = 6; this.roarTell = 2.1;
    C.warm(mgr, this.zone, true);
    const S = mgr.geo('colossus|stalk'), Cp = mgr.geo('colossus|cap'), Lg = mgr.geo('colossus|leg');
    this.G = Cp;
    this.hitCol = Cp.capCol;
    this.mat = this.material({ emissive: 0.12 });
    this.glowMat = this.material({ emissive: 1.2, rimK: 0.4 });
    this.eyeMat = this.material({ emissive: 1.8, rimK: 0 });
    this.bodyG = this.group3(this.root, 0, 19 * KV, 0);
    this.piece(S.stalk, this.bodyG, 0, 0, 0, this.mat);
    this.piece(S.eyes, this.bodyG, 0, 0, 0, this.eyeMat);
    this.capG = this.group3(this.bodyG, 0, 41 * KV, 0);
    this.piece(Cp.cap, this.capG, 0, 0, 0, this.mat);
    this.piece(Cp.gills, this.capG, 0, 0, 0, this.glowMat);
    this.headObj = this.bodyG; this.headTop = 32 * KV; this.headFwd = 6 * KV;
    const legs = [[1, 1, 0], [-1, 1, 0.5], [1, -1, 0.25], [-1, -1, 0.75]];
    for (const [sx, sz, off] of legs) {
      const base = this.group3(this.root, sx * 7.5 * KV, 21 * KV, sz * 7.5 * KV);
      base.rotation.set(-sz * 0.36, 0, sx * 0.36); // splayed out, like roots
      const hp = this.group3(base);
      this.piece(Lg.thigh, hp, 0, 0, 0, this.mat);
      const kn = this.group3(hp, 0, -11 * KV, 0);
      this.piece(Lg.shin, kn, 0, 0, 0, this.mat);
      const an = this.group3(kn, 0, -10 * KV, 0);
      const ft = this.piece(Lg.foot, an, 0, 0, 0, this.mat);
      ft.rotation.set(sz * 0.36, 0, -sx * 0.36);
      this.limb(hp, kn, an, off, 22 * KV, sz > 0);
      this.sphere(hp, 0, -6 * KV, 0, 0.9, 'leg');
    }
    this.hitDefs.unshift({ obj: this.bodyG, p: new THREE.Vector3(0, 14 * KV, 0), r: 1.4, part: 'body' });
    this.spheres.unshift({ x: 0, y: 0, z: 0, r: 1.4, part: 'body' });
    this.sphere(this.bodyG, 0, 2 * KV, 0, 1.6, 'body');
    this.sphere(this.bodyG, 0, 28 * KV, 0, 1.3, 'body');
    this.sphere(this.capG, 0, 4 * KV, 0, 3.8, 'cap');
    this.setLod(0);
    this.place(); this.updateSpheres();
  }
  animate(dt) {
    const t = this.t, s = this.state;
    this.animateLimbs(dt, 0.28, 0.6);
    const swell = s === 'roarTell' ? smooth(this.st / this.roarTell) : s === 'roar' ? Math.max(0, 1 - this.st / 0.5) : 0;
    const graze = s === 'graze' || s === 'rest' ? 1 : 0, move = clamp(this.speed / this.walkSpeed, 0, 1);
    this.bodyG.position.y = (19 - graze * 3) * KV - Math.abs(Math.sin(this.gait * TAU * 2)) * 0.12 * move;
    this.bodyG.rotation.z = Math.sin(this.gait * TAU) * 0.05 * move + Math.sin(t * 0.4) * 0.015;
    this.bodyG.rotation.x = Math.sin(t * 0.33) * 0.02 - swell * 0.12;
    // the cap: wobbles with the gait, swells before the bellow
    const w = Math.sin(this.gait * TAU * 2) * 0.025 * move;
    this.capG.scale.set(1 + swell * 0.12 + w, 1 + swell * 0.18 - w, 1 + swell * 0.12 + w);
    this.capG.rotation.z = -this.bodyG.rotation.z * 0.6;
    this.glowMat.uniforms.emissive.value = 1 + Math.sin(t * 0.9) * 0.2 + swell * 2.2 + this.watchT * 0.1;
    this.eyeMat.uniforms.emissive.value = 1.4 + this.watchT * 0.5 + swell * 2;
    // a slow snow of glowing spores from the gills (feeding: more)
    if (this.dist < 45 && Math.random() < dt * (graze ? 14 : 6)) {
      const a = Math.random() * TAU, r = rand(1.5, 4.2);
      this.capG.localToWorld(_v.set(Math.cos(a) * r, -2 * KV, Math.sin(a) * r));
      this.fx.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: rand(-0.1, 0.1), vy: rand(-0.35, -0.1), vz: rand(-0.1, 0.1), life: rand(3, 5), size: rand(0.02, 0.035), color: this.G.spore, glow: true, drag: 0.6, swirl: 0.25 });
    }
  }
  roarFx(near) {
    // the bellow: a storm of spores rolls out from under the cap
    const m = this.mgr;
    this.capG.localToWorld(_v.set(0, -2 * KV, 0));
    spores(this.fx, _v.x, _v.y, _v.z, Math.round(260 * (this.fx.lod || 1)), this.G.spore, 4.5, 4.2);
    puff(this.fx, _v.x, _v.y - 1, _v.z, 30, this.G.spore.map((k) => k * 0.45), 2.2, -0.3, 0.3, 0.45);
    const fx = this.pos.x + Math.sin(this.yaw) * 4, fz = this.pos.z + Math.cos(this.yaw) * 4;
    m.addHazard({ kind: 'spores', x: fx, y: this.pos.y + 1, z: fz, r: 6, life: 5, sting: this.info.dmg * 0.25, zone: this.zone, color: this.G.spore });
    if (this.dist < 16) m.veil.hit(clamp((16 - this.dist) / 10, 0.2, 0.9), { tones: tonesOf(this.G.spore) });
  }
  light() {
    if (this.dist > 45) return null;
    this.capG.localToWorld(_v.set(0, -4 * KV, 0));
    const c = this.G.light, k = 1 + (this.state === 'roarTell' ? 1.6 : 0) + this.watchT * 0.1;
    return { x: _v.x, y: _v.y, z: _v.z, c: [c[0] * k, c[1] * k, c[2] * k], r: 10 };
  }
  deathFx() { this.sound2('golem_crumble', 1, 0.7); this.capG.localToWorld(_v.set(0, 0, 0)); spores(this.fx, _v.x, _v.y, _v.z, 200, this.G.spore, 4, 3); }
}

export const KAIJU = { crystal_titan: CrystalTitan, fungal_colossus: FungalColossus };
export { TITAN_PARTS, COLO_PARTS };
