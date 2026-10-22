// Crystal Golem: a big, slow mountain of the local rock (mossy and rooty up in the Clayworks, cracked
// with magma in the Magma Deep, frosted in the Frost Vault) with a glowing crystal cluster growing out
// of its back. Its hide shrugs off the pick (sparks, a clang): the only way to beat it is to get
// behind or beside it and mine the crystal off its back, shard by shard. It keeps turning to face the
// mole (slowly: a nimble mole can circle it), telegraphs a two-fisted slam (a shockwave to jump),
// stomps when you linger behind it, staggers and roars each time a shard breaks off, and crumbles into
// rubble when the last one goes, dropping the crystals it carried.
//
// Hit spheres carry a `part` ('body' | 'crystal') and the shard index, so Enemies.hitTest can tell the
// pick (and the crosshair) what it is pointing at; Enemies.damage routes blows to pickHit().
import * as THREE from 'three';
import { Enemy, smooth, easeBack, wrapA } from './base.js';
import { VB, VS, mul, mix, c01, ramp } from './vox.js';
import { shockRing, puff, pebbles, sparkle } from './fx.js';
import { rockPalette } from './rock.js';
import { M } from '../materials.js';
import { rand, clamp } from '../../core/util.js';

const LEG = 13; // hip height when standing (model voxels)
const SHOULDER = [15, 18, 0.5];
const SIZE = 1.2; // the whole model is drawn a little larger than the other creatures
const EYE_Y = 19.5;

// per zone: crystal ramp (dark → white), eyes, body dressing, loot (better deeper), shard count
const LOOKS = {
  2: { cr: [0x1a48a8, 0x2a7ce4, 0x5abcff, 0xc8f2ff], eye: 0x7ad8ff, dress: 'moss', loot: ['quartz', 'quartz', 'quartz'], bonus: ['amethyst', 0.35], n: 4 },
  3: { cr: [0x52087e, 0x9214cc, 0xd04cff, 0xffc4ff], eye: 0xe070ff, dress: 'lichen', loot: ['amethyst', 'amethyst', 'quartz'], bonus: ['echo_crystal', 0.25], n: 5 },
  4: { cr: [0x8a1008, 0xd0301a, 0xff7a3a, 0xffd8a0], eye: 0xffa030, dress: 'magma', loot: ['ruby', 'magmaite'], bonus: ['ruby', 0.3], n: 5 },
  5: { cr: [0x103c98, 0x1e74dc, 0x5ab4fa, 0xd8f4ff], eye: 0x9ae8ff, dress: 'frost', loot: ['frostite', 'sapphire'], bonus: ['frostite', 0.3], n: 6 },
  6: { cr: [0x7a1aa0, 0xb03ad8, 0xe080f8, 0xffe0ff], eye: 0xff8af0, dress: 'core', loot: ['diamond', 'amethyst', 'amethyst'], bonus: ['diamond', 0.2], n: 6 },
};
export const golemLook = (zone) => LOOKS[clamp(zone | 0, 2, 6)];

// shards on the back: x, y (where they leave the back), length, radius, splay (x), backward tilt
const SPOTS = [
  [0.5, 18, 17, 3, 0.05, 0.5],
  [-6, 16, 13.5, 2.5, -0.6, 0.4],
  [6.5, 16.5, 14, 2.5, 0.65, 0.35],
  [-2, 11.5, 10.5, 2.2, -0.25, 1],
  [4.5, 11, 10, 2.1, 0.4, 1.05],
  [-10, 13, 9.5, 2, -0.95, 0.5],
];

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/** Darken creases: surface voxels with lots of rock around them (a cheap ambient occlusion). */
function ao(vb) {
  vb.paint((x, y, z, c) => {
    if (!(vb.open(x, y, z, 1, 0, 0) || vb.open(x, y, z, -1, 0, 0) || vb.open(x, y, z, 0, 1, 0) || vb.open(x, y, z, 0, -1, 0) || vb.open(x, y, z, 0, 0, 1) || vb.open(x, y, z, 0, 0, -1))) return undefined;
    let n = 0;
    for (let dz = -2; dz <= 2; dz += 2) for (let dy = -2; dy <= 2; dy += 2) for (let dx = -2; dx <= 2; dx += 2) if (vb.has(x + dx, y + dy, z + dz)) n++;
    return n >= 21 ? mul(c, 0.72) : n >= 19 ? mul(c, 0.86) : undefined;
  });
}

/** One crystal shard: a hexagonal prism with a pointed tip, faceted colors (voxels carry t = 0 base … 1 tip). */
function shardVox(a, d, len, R, cr, rock) {
  const [dx, dy, dz] = d;
  // a frame around the axis
  let ux = 0, uy = dz, uz = -dy;
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  const bx = [a[0], a[0] + dx * len], by = [a[1], a[1] + dy * len], bz = [a[2], a[2] + dz * len];
  const out = [];
  const x0 = Math.floor(Math.min(...bx) - R - 1), x1 = Math.ceil(Math.max(...bx) + R + 1);
  const y0 = Math.floor(Math.min(...by) - R - 1), y1 = Math.ceil(Math.max(...by) + R + 1);
  const z0 = Math.floor(Math.min(...bz) - R - 1), z1 = Math.ceil(Math.max(...bz) + R + 1);
  const STEP = Math.PI / 3;
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const qx = x + 0.5 - a[0], qy = y + 0.5 - a[1], qz = z + 0.5 - a[2];
    const t = (qx * dx + qy * dy + qz * dz) / len;
    if (t < -0.18 || t > 1) continue;
    const pu = qx * ux + qy * uy + qz * uz, pv = qx * vx + qy * vy + qz * vz;
    const hx = Math.max(Math.abs(pu), Math.abs(pu * 0.5 + pv * 0.866), Math.abs(pu * 0.5 - pv * 0.866));
    const rt = t < 0.58 ? R * (1 - 0.1 * Math.max(0, t)) : R * 0.94 * Math.max(0, (1 - t) / 0.42);
    if (hx > rt + 0.2) continue;
    // facets: lit faces, shaded faces, bright edges, a white tip, a dark root
    const ang = Math.atan2(pv, pu) / STEP, face = ((Math.round(ang) % 6) + 6) % 6, edge = Math.abs(ang - Math.round(ang)) > 0.38;
    let c = face === 0 || face === 1 ? cr[2] : face === 2 || face === 5 ? cr[1] : mix(cr[1], cr[0], 0.5);
    if (edge && (face === 0 || face === 1) && hx > rt - 0.7) c = mix(cr[2], cr[3], 0.7);
    if (t > 0.88) c = face === 3 || face === 4 ? cr[2] : cr[3];
    else if (t > 0.66 && (face === 0 || face === 1)) c = mix(cr[2], cr[3], 0.3);
    if (hx < rt - 1.2) c = cr[1]; // inside (only seen in the chunks)
    if (t < 0.08) c = mix(c, rock, 0.55);
    out.push({ x, y, z, c, t });
  }
  return out;
}

/** The golem's voxel parts (model voxels, +z front): torso (pivot hips), legs (hip joint), arms (shoulder), shards (torso space). */
export function buildCrystalGolem(pal, zone, seed = 23) {
  const L = golemLook(zone), T = pal.tones;
  const dark = mul(T[0], 0.45);
  const tint = L.dress === 'frost' ? (c) => mix(c, 0x9ab8d8, 0.22) : (c) => c;
  const sh = (vb, k0 = 0.3) => (x, y, z, nx, ny, nz) => {
    const k = vb.n(x, y, z);
    if (k > 0.965) return pal.acc;
    if (ny > 0.7 && k < 0.5) return tint(mix(T[3], 0xffffff, 0.12));
    return tint(ramp(T, clamp(k0 + ny * 0.45 + (nz || 0) * 0.08 + (k - 0.5) * 0.75, 0, 0.999)));
  };
  const torso = new VB(seed), glow = new VB(seed + 5);
  const s = sh(torso);
  torso.ell(0, 3, 0, 8.5, 4.5, 6.5, s); // pelvis
  torso.ell(0, 10, 0.5, 10, 8.5, 8, s); // belly and chest
  torso.ell(0, 16.5, -2, 12, 7.5, 8.5, s); // the hunched back
  for (const sd of [1, -1]) torso.ell(sd * 12.5, 18.5, 0.5, 6.2, 5.6, 6.2, s); // boulder shoulders
  torso.ell(0, 18.5, 8.5, 6, 5, 5.5, s); // head, hunched forward
  torso.ell(0, 15, 10.5, 4.6, 2.6, 3.6, s); // jaw
  for (const [x, y, z, r] of [[6, 7, 5, 3.3], [-5.5, 12, 6, 3], [-7, 6, -5, 3.3], [5, 12, -7.5, 3.2], [-6, 9, -7, 2.8], [7, 4, -4.5, 2.8], [0, 6, -6.5, 3], [-9, 15, -6, 3], [9.5, 14, -5.5, 2.8], [-3, 20, -8, 2.6]]) torso.ell(x, y, z, r, r * 0.9, r, s);
  const front = (vb, x, y) => { for (let z = 24; z > -24; z--) if (vb.has(x, y, z)) return z; return 0; };
  const back = (vb, x, y) => { for (let z = -24; z < 24; z++) if (vb.has(x, y, z)) return z; return 0; };
  // a heavy brow, deep eye sockets, a grumpy mouth
  for (let x = -5; x <= 4; x++) { const z = front(torso, x, 21) + 1; torso.set(x, 21, z, mul(T[1], 0.9)); torso.set(x, 22, z - 1, T[2]); }
  for (const [x, y] of [[1, 19], [2, 19], [3, 19], [1, 20], [2, 20], [3, 20], [-2, 19], [-3, 19], [-4, 19], [-2, 20], [-3, 20], [-4, 20]]) torso.set(x, y, front(torso, x, y), dark);
  for (let x = -3; x <= 2; x++) { const y = x === -3 || x === 2 ? 16 : 15; torso.set(x, y, front(torso, x, y), dark); }
  // the crystal cluster: shards rooted in rocky collars on the back
  const shards = [];
  const rockC = mul(T[1], 0.8);
  for (let i = 0; i < L.n; i++) {
    const [sx, sy, len, R, splay, tilt] = SPOTS[i];
    const x = Math.round(sx), y = Math.round(sy), zb = back(torso, x, y);
    const dl = Math.hypot(splay, 1, tilt);
    const d = [splay / dl, 1 / dl, -tilt / dl];
    const a = [x + 0.5 - d[0] * 2, y + 0.5 - d[1] * 2, zb + 0.5 - d[2] * 2 - 0.5];
    // collar: a lump of rock where the shard comes out
    torso.ell(a[0] + d[0] * 2.2, a[1] + d[1] * 2.2, a[2] + d[2] * 2.2, R + 1.2, R * 0.7 + 0.6, R + 1.2, (x, y, z, nx, ny) => mul(s(x, y, z, nx, ny, 0), 0.82));
    const vox = shardVox(a, d, len, R, L.cr, rockC);
    for (const v of vox) torso.del(v.x, v.y, v.z); // the shard owns its voxels (a socket stays when it breaks)
    for (const o of shards) for (const v of vox) if (o.set.has(v.x + ',' + v.y + ',' + v.z)) v.dup = true;
    const own = vox.filter((v) => !v.dup);
    const set = new Set(own.map((v) => v.x + ',' + v.y + ',' + v.z));
    shards.push({ a, d, len, R, vox: own, set });
  }
  // zone dressing
  const top = (x, y, z) => y > 9 && torso.open(x, y, z, 0, 1, 0);
  if (L.dress === 'moss') {
    torso.paint((x, y, z, c) => (top(x, y, z) && torso.n(x, y, z, 9) < 0.7 ? (torso.n(x, y, z, 11) < 0.45 ? 0x3a7a3a : torso.n(x, y, z, 12) < 0.5 ? 0x5aa84a : 0x4a9040) : undefined));
    // roots dangling from the shoulders, jaw and belly
    for (const [x, z, n] of [[12, 3, 5], [-13, -1, 4], [10, -3, 3], [-11, 4, 6], [2, 12, 3], [-2, 11, 4], [6, 7, 4], [-7, 8, 3]]) {
      let y0 = -99;
      for (let y = 6; y < 24; y++) if (torso.has(x, y, z) && !torso.has(x, y - 1, z)) { y0 = y; break; }
      if (y0 < 0) continue;
      for (let i = 1; i <= n; i++) torso.set(x + (i > 2 && (x + i) % 3 === 0 ? 1 : 0), y0 - i, z, i === n ? 0x9a7048 : i % 2 ? 0x5a3a1e : 0x6e4a28);
    }
    // two little sprouts on the head and a shoulder
    for (const [x, z] of [[-2, 7], [11, 1]]) {
      let y = 30; while (y > 0 && !torso.has(x, y, z)) y--;
      torso.set(x, y + 1, z, 0x4a7a2a); torso.set(x, y + 2, z, 0x4a7a2a); torso.set(x + 1, y + 3, z, 0x8ad85a); torso.set(x - 1, y + 3, z, 0x5aa83a); torso.set(x + 2, y + 3, z, 0x8ad85a);
    }
  } else if (L.dress === 'lichen') {
    torso.paint((x, y, z, c) => (top(x, y, z) && torso.n(x, y, z, 9) < 0.35 ? (torso.n(x, y, z, 10) < 0.5 ? 0x8a9ac8 : 0xb4c4e8) : undefined));
  } else if (L.dress === 'frost') {
    torso.paint((x, y, z, c) => (top(x, y, z) ? (torso.n(x, y, z, 12) < 0.3 ? 0xd0e4f4 : 0xf2f8ff) : undefined));
    // icicles under the brow, jaw and shoulders
    for (const [x, z, n] of [[12, 3, 4], [-12, 2, 3], [9, -2, 2], [-9, 5, 3], [2, 12, 3], [-2, 12, 2], [-4, 13, 2], [4, 9, 3]]) {
      let y0 = -99;
      for (let y = 6; y < 24; y++) if (torso.has(x, y, z) && !torso.has(x, y - 1, z)) { y0 = y; break; }
      if (y0 < 0) continue;
      for (let i = 1; i <= n; i++) torso.set(x, y0 - i, z, i === n ? 0xe8f8ff : 0xa8d8f0);
    }
  }
  if (L.dress === 'magma' || L.dress === 'core') {
    // glowing cracks crawling over the front and the flanks
    const hot = L.dress === 'magma' ? [0xff6a1a, 0xffb040, 0xfff0a0] : [0xb060f0, 0xe0a0ff, 0xffffff];
    const side = (z, y, sd) => { for (let x = sd * 24; x !== 0; x -= sd) if (torso.has(x, y, z)) return x; return null; };
    const crack = (u, y, dir, n, sd) => {
      for (let i = 0; i < n; i++) {
        let x, z;
        if (sd === 0) { x = u; z = front(torso, x, y); if (!torso.has(x, y, z)) break; }
        else { z = u; x = side(z, y, sd); if (x === null) break; }
        torso.del(x, y, z);
        glow.set(x, y, z, hot[i % 4 === 0 ? 2 : torso.n(x, y, z, 3) < 0.5 ? 0 : 1]);
        y += dir;
        const r = torso.n(u, y, i, 5);
        u += r < 0.33 ? -1 : r > 0.66 ? 1 : 0;
      }
    };
    crack(3, 13, -1, 9, 0); crack(-4, 12, -1, 8, 0); crack(6, 6, 1, 6, 0); crack(-1, 7, -1, 6, 0);
    crack(0, 15, -1, 9, 1); crack(-2, 14, -1, 8, -1); crack(3, 8, -1, 6, 1); crack(2, 9, -1, 6, -1);
  }
  ao(torso);
  // legs (pivot at the hip): a boulder thigh, a stumpy shin, a wide flat foot
  const leg = new VB(seed + 2), sl = sh(leg, 0.2);
  leg.ell(0, -3.5, 0, 4.6, 5, 4.6, sl);
  leg.cap(0, -6, 0.3, 0, -10, 0.6, 3.7, (x, y, z) => mul(sl(x, y, z, 0, 0.1, 0), 0.88));
  leg.box(-4, -13, -3, 3, -11, 5, (x, y, z) => mul(ramp(T, 0.15 + leg.n(x, y, z) * 0.5), 0.82));
  for (const x of [-3, 0, 2]) leg.set(x, -12, 6, mul(T[0], 0.7));
  // arms (pivot at the shoulder): long knuckle-dragging arms with huge fists
  const arm = new VB(seed + 3), sa = sh(arm, 0.12);
  arm.cap(0, -1, 0, 0.5, -9, 0.5, 3.6, (x, y, z) => sa(x, y, z, 0, 0.2, 0));
  arm.ell(0.5, -10.5, 0.8, 4.2, 3.8, 4.2, sa);
  arm.cap(0.5, -12, 0.8, 1, -17, 1.5, 3.5, (x, y, z) => mul(sa(x, y, z, 0, 0.1, 0), 0.92));
  arm.ell(1, -20.5, 1.8, 5.4, 4.8, 5.6, sa);
  for (let x = -2; x <= 4; x++) arm.set(x, -20, front(arm, x, -20), mul(T[0], 0.7)); // knuckles
  if (L.dress === 'moss') arm.paint((x, y, z, c) => (y > -4 && arm.open(x, y, z, 0, 1, 0) ? 0x4a9040 : undefined));
  if (L.dress === 'frost') arm.paint((x, y, z, c) => (arm.open(x, y, z, 0, 1, 0) && y > -6 ? 0xf2f8ff : undefined));
  ao(arm); ao(leg);
  // eyes under the brow
  const eyes = new VB(), angry = new VB();
  const zf = Math.max(front(torso, 2, 19), front(torso, -3, 19)) + 1;
  for (const [vb, a, col] of [[eyes, false, L.eye], [angry, true, 0xff4a2a]]) {
    for (const [x0, sd] of [[1, 1], [-4, -1]]) for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
      const inner = sd > 0 ? x === 0 : x === 2;
      if (a && y === 1 && inner) continue;
      vb.set(x0 + x, 19 + y, zf, y === 1 && !inner ? 0xffffff : col);
    }
  }
  return {
    torso: torso.geo(0, 0, 0), glow: glow.size ? glow.geo(0, 0, 0) : null, leg: leg.geo(0, 0, 0), arm: arm.geo(0, 0, 0),
    eyes: eyes.geo(0, EYE_Y, 0), angry: angry.geo(0, EYE_Y, 0),
    shards: shards.map((S) => {
      const vb = new VB();
      for (const v of S.vox) vb.set(v.x, v.y, v.z, v.c);
      return { geo: vb.geo(0, 0, 0), vox: S.vox, a: S.a, d: S.d, len: S.len, R: S.R };
    }),
    dust: c01(T[1]), chip: c01(T[2]), eye: c01(L.eye), light: c01(L.cr[2]), glit: c01(L.cr[3]), mid: c01(L.cr[1]),
    hot: L.dress === 'magma' ? [1, 0.55, 0.15] : L.dress === 'core' ? [0.8, 0.5, 1] : null,
  };
}

// hit spheres in part space (model voxels): [x, y, z, r]
const BODY_S = [[0, 3, 0, 8.5], [0, 10, 0.5, 9.5], [0, 16.5, -1, 9], [12, 18, 0.5, 5.6], [-12, 18, 0.5, 5.6], [0, 18.5, 8, 6]];
const LEG_S = [[0, -4, 0, 4.6], [0, -10.5, 1, 4]];
const ARM_S = [[0.5, -10, 0.8, 4.2], [1, -20.5, 1.8, 5.4]];

export class CrystalGolem extends Enemy {
  static info = { id: 'crystal_golem', name: 'Crystal Golem', color: '#9ad8ff', hits: 99, dmg: 7, snd: 'stone', lavaProof: true, noStun: true, space: [0.48, 2.3], tier: 5 };
  static tells = { raise: [1.0, true], lift: [0.75, true] };
  static resume = 'chase';
  constructor(mgr, o) {
    super(mgr, o);
    this.hw = 0.45; this.h = 1.6; this.cy = 1.1; this.hitR = 0.8;
    this.mass = 8; this.kb = 1;
    this.size = SIZE;
    this.springK = 110; this.springC = 11;
    this.step = 0.3; this.friction = 12;
    const L = this.look = golemLook(this.zone);
    const pal = rockPalette(o.mat ?? M.STONE);
    const G = this.G = mgr.geo('cgolem|' + pal.key + '|' + clamp(this.zone, 2, 6), () => buildCrystalGolem(pal, this.zone, 23));
    this.mat = this.material({ texel: 48 });
    this.glowMat = this.material({ emissive: 1.1 });
    this.eyeMat = this.material({ emissive: 0.9 });
    this.crMat = this.material({ emissive: 0.5 });
    this.hips = this.group3(this.root, 0, LEG * VS, 0);
    this.torsoG = this.group3(this.hips);
    this.torso = this.part(G.torso, this.mat, this.torsoG);
    if (G.glow) this.glowPart = this.part(G.glow, this.glowMat, this.torsoG);
    this.eyes = this.part(G.eyes, this.eyeMat, this.torsoG, 0, EYE_Y * VS, 0);
    this.arms = [1, -1].map((sd) => {
      const a = this.part(G.arm, this.mat, this.torsoG, sd * SHOULDER[0] * VS, SHOULDER[1] * VS, SHOULDER[2] * VS);
      if (sd < 0) a.scale.x = -1;
      return a;
    });
    this.legs = [1, -1].map((sd) => this.part(G.leg, this.mat, this.hips, sd * 5.5 * VS, 0, 0));
    const hpEach = 1.5 * mgr.hpScale(this.zone); // two good blows per shard
    this.shards = G.shards.map((S, i) => ({ i, S, mesh: this.part(S.geo, this.crMat, this.torsoG), list: S.vox, cut: 1, hp: hpEach, maxHp: hpEach, gone: false, how: null, own: null }));
    this.hp = this.maxHp = 1e9; // it only falls apart when its crystal is gone
    // hit spheres: the hide (torso, legs, arms) and two per shard (weak points win near-ties)
    this.spheres = [];
    const add = (obj, list, part = 'body') => list.forEach(([x, y, z, r]) => this.spheres.push({ obj, lx: x * VS, ly: y * VS, lz: z * VS, lr: r * VS, x: 0, y: 0, z: 0, r: 0, part, idx: -1, prio: 0 }));
    add(this.torsoG, BODY_S);
    this.legs.forEach((l) => add(l, LEG_S));
    this.arms.forEach((a) => add(a, ARM_S));
    this.shards.forEach((s) => {
      s.sph = [0.3, 0.72].map((f) => ({ obj: this.torsoG, f, lx: 0, ly: 0, lz: 0, lr: (s.S.R + 1.4) * VS, x: 0, y: 0, z: 0, r: 0, part: 'crystal', idx: s.i, prio: 0.12 }));
      this.spheres.push(...s.sph);
      this.fitShard(s);
    });
    this.state = 'dormant';
    this.wakeK = 0;
    this.eyeOpen = 0;
    this.phase = 0;
    this.pose = { lean: 0.55, sway: 0, armX: 0.5, armZ: 0.08, legA: 0, legB: 0 };
    this.lost = 0;
    this.behindT = 0;
    this.angry = 0;
    this.flinch = 0;
    this.cflash = 0; this.bflash = 0;
    this.aimT = -9;
    this.tellT = rand(2, 5);
    this.sparkT = 0;
    this.toughT = -9;
    this.mined = 0;
    this.lootAt = new THREE.Vector3();
    this.place();
  }

  // ------------------------------------------------------------------ shards
  /** Place a shard's two hit spheres along what is left of it. */
  fitShard(s) {
    const S = s.S;
    s.sph.forEach((q, k) => {
      const f = Math.min(q.f, s.cut - (k ? 0.18 : 0.1));
      const alive = !s.gone && (k === 0 || s.cut > 0.5);
      q.lx = (S.a[0] + S.d[0] * S.len * f) * VS; q.ly = (S.a[1] + S.d[1] * S.len * f) * VS; q.lz = (S.a[2] + S.d[2] * S.len * f) * VS;
      q.lr = alive ? (S.R + 1.4) * VS : 0;
    });
  }
  shardsLeft() { let n = 0; for (const s of this.shards) if (!s.gone) n++; return n; }
  /** World position of a shard's middle. */
  shardPos(s, out = _w) {
    const S = s.S, f = Math.max(0.2, s.cut * 0.5);
    out.set((S.a[0] + S.d[0] * S.len * f) * VS, (S.a[1] + S.d[1] * S.len * f) * VS, (S.a[2] + S.d[2] * S.len * f) * VS);
    return out.applyMatrix4(this.torsoG.matrixWorld);
  }
  /** Where the crystal cluster is (world), for lights and sparkles. */
  crystalPos(out) {
    let n = 0;
    out.set(0, 0, 0);
    for (const s of this.shards) if (!s.gone) { out.add(this.shardPos(s, _v)); n++; }
    return n ? out.multiplyScalar(1 / n) : null;
  }

  /** Knock the top of a shard off (down to `cut`); returns the voxels that came off. */
  chipShard(s, cut) {
    const keep = [], lose = [];
    for (const v of s.list) (v.t > cut ? lose : keep).push(v);
    if (!lose.length) return lose;
    s.list = keep;
    s.cut = cut;
    const vb = new VB();
    for (const v of keep) vb.set(v.x, v.y, v.z, v.c);
    s.own?.dispose();
    s.own = vb.geo(0, 0, 0);
    s.mesh.geometry = s.own;
    this.fitShard(s);
    return lose;
  }

  breakShard(s, dir, how) {
    if (s.gone) return;
    const m = this.mgr;
    s.gone = true; s.how = how;
    s.mesh.updateMatrixWorld(true);
    const p = this.shardPos(s, new THREE.Vector3());
    this.lootAt.copy(p); // the crystal's last stand: loot pops out from here
    if (how === 'blast') {
      // shattered: nothing left but glitter
      sparkle(this.fx, p.x, p.y, p.z, 22, this.G.light, 3.5, 4, 0.024, 1);
      for (let k = 0; k < 6; k++) this.fx.glints(p.x, p.y, p.z, this.G.glit);
    } else {
      this.mined++;
      // the shard snaps off and tumbles down the golem's back
      const out = { x: p.x - this.pos.x, z: p.z - this.pos.z };
      const ol = Math.hypot(out.x, out.z) || 1;
      m.chunk(s.mesh, s.list, { K: s.list.length > 90 ? 2 : 1, glow: true, vel: [out.x / ol * 1.6 - dir.x * 0.5, 2.4, out.z / ol * 1.6 - dir.z * 0.5], speed: [0.2, 0.8], life: 2.6, bounce: 0.5 });
      sparkle(this.fx, p.x, p.y, p.z, 16, this.G.light, 2.8, 3, 0.022, 0.9);
      for (let k = 0; k < 4; k++) this.fx.glints(p.x, p.y, p.z, this.G.glit);
    }
    s.list = [];
    s.mesh.visible = false;
    this.fitShard(s);
    this.sound('break', { snd: 'crystal', vol: 1 });
    this.sound('crystal_ring', { pitch: 0.7, vol: 1 });
    this.cflash = 1;
    if (!this.shardsLeft()) { this.setState('crumble'); this.sound('golem_roar', { pitch: 0.75, vol: 1 }); return; }
    // a roar and a stagger every time a piece breaks off
    this.setState('stagger');
    this.sqv -= 5; this.shiver = 1;
    this.sound('golem_roar', { pitch: rand(0.95, 1.1), vol: 0.9 });
  }

  // ------------------------------------------------------------------ being hit
  /** Crosshair hint for the part under it. */
  partLabel(part) { return part === 'crystal' ? 'Crystal' : 'Too tough'; }

  /** A pick blow on the part Enemies.hitTest found ('body' | 'crystal'). */
  pickHit(power, dir, part, idx) {
    if (!this.alive || this.state === 'crumble') return;
    const s = part === 'crystal' ? this.shards[idx] : null;
    if (s && !s.gone) this.crystalHit(s, power, dir);
    else this.hideHit(power, dir);
    if (this.state === 'dormant') { this.setState('wake'); this.wake(true); }
  }

  hideHit(power, dir) {
    const m = this.mgr, p = this.lastHit;
    // the pick bounces off: sparks, a clang, a jolt up the arm
    this.fx.sparks(p.x, p.y, p.z, 12, [1, 0.88, 0.6], [-dir.x, -dir.y, -dir.z], 3.4);
    this.fx.dust(p.x, p.y, p.z, 3, this.G.dust, 0.05);
    pebbles(this.fx, p.x, p.y, p.z, 2, this.G.chip, 0.05, 1);
    this.sound('clang', { pitch: 0.55, vol: 0.8 });
    this.sound('hit', { snd: 'hard', vol: 0.6 });
    this.bflash = 0.4; this.sqv -= 1.2; this.shiver = Math.max(this.shiver, 0.25);
    this.angry = Math.max(this.angry, 1.2);
    m.pickHint(this, p);
  }

  crystalHit(s, power, dir) {
    const m = this.mgr, p = this.lastHit;
    s.hp -= power;
    sparkle(this.fx, p.x, p.y, p.z, 10, this.G.light, 2.2, 3, 0.02, 0.6);
    this.fx.sparks(p.x, p.y, p.z, 6, this.G.glit, [-dir.x, -dir.y, -dir.z], 2.4);
    for (let k = 0; k < 2; k++) this.fx.glints(p.x, p.y, p.z, this.G.glit);
    this.sound('crystal_ring', { pitch: 1 + s.i * 0.08, vol: 0.9 });
    this.sound('hit', { snd: 'crystal', vol: 0.8 });
    this.cflash = Math.max(this.cflash, 0.8);
    this.flinch = 1; this.shiver = Math.max(this.shiver, 0.45); this.sqv -= 2.5;
    m.crystalHint(this);
    if (s.hp <= 0.001) { this.breakShard(s, dir, 'pick'); return; }
    // chip: the top of the shard breaks away, the rest holds (for now)
    const cut = clamp(0.12 + 0.62 * (s.hp / s.maxHp), 0.2, s.cut - 0.15);
    const lose = this.chipShard(s, cut);
    if (lose.length) m.chunk(s.mesh, lose, { K: 1, glow: true, vel: [-dir.x * 1.6, 2, -dir.z * 1.6], speed: [0.3, 1.2], life: 2, bounce: 0.5 });
    this.sound('emote', { kind: 'angry' });
  }

  /** An explosion nearby: k = 1 at the heart of it. Close blasts shatter the crystal (less loot). */
  blastHit(k, power, dir, x, y, z, r) {
    const m = this.mgr;
    this.vel.x += dir.x * 6 * k * power / this.mass; this.vel.z += dir.z * 6 * k * power / this.mass; this.vel.y += 2.5 * k;
    this.bflash = Math.max(this.bflash, 0.6 * k);
    if (this.state === 'dormant') { this.setState('wake'); this.wake(true); }
    let shattered = 0;
    for (const s of this.shards) {
      if (s.gone) continue;
      const p = this.shardPos(s);
      const d = Math.hypot(p.x - x, p.y - y, p.z - z);
      if (d < r * 0.85 * power) { s.hp = 0; this.breakShard(s, dir, 'blast'); shattered++; if (this.state === 'crumble') break; continue; }
      if (d < r * 1.5) {
        s.hp -= s.maxHp * 1.1 * power * (1 - d / (r * 1.5));
        if (s.hp <= 0.001) { this.breakShard(s, dir, 'blast'); shattered++; if (this.state === 'crumble') break; }
        else {
          const lose = this.chipShard(s, clamp(0.25 + 0.7 * (s.hp / s.maxHp), 0.25, s.cut - 0.1));
          if (lose.length) m.chunk(s.mesh, lose, { K: 1, glow: true, vel: [dir.x * 2, 2.5, dir.z * 2], speed: [0.5, 1.6] });
        }
      }
    }
    if (shattered) m.say('cgolem_blast', 'Boom! The blast <b>shattered</b> crystal off the golem. Less loot that way: mining it is gentler.', 'warn', 60);
    else if (k > 0.25 && this.state !== 'crumble' && this.state !== 'stagger') { this.setState('stagger'); this.sound('golem_roar', { vol: 0.8 }); }
  }

  /** What it drops: the crystal you mined (blasted shards are lost to glitter). */
  lootList() {
    const L = this.look, total = this.shards.length;
    const n = Math.max(1, Math.round(L.loot.length * this.mined / total));
    const out = L.loot.slice(0, n);
    if (this.mined === total && Math.random() < L.bonus[1]) out.push(L.bonus[0]);
    return out;
  }

  // ------------------------------------------------------------------ brain
  relAngle() { return Math.abs(wrapA(Math.atan2(this.pdx, this.pdz) - this.yaw)); }

  think(dt) {
    const m = this.mgr;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const rel = this.relAngle();
    this.squint = 1;
    this.angry = Math.max(0, this.angry - dt);
    const turn = 0.95 + (this.angry > 0 ? 0.3 : 0);
    switch (this.state) {
      case 'dormant': {
        this.wakeK = Math.max(0, this.wakeK - dt * 0.6);
        this.eyeOpen = Math.max(0, this.eyeOpen - dt * 2);
        this.push(0, 0, 8, dt);
        // sneaking up from behind gets you closer before it notices
        const r = rel > 1.9 ? 2.1 : rel > 1.1 ? 3 : 4.3;
        if (this.awake || (this.dist < r && this.sees && !m.safe)) { this.setState('wake'); this.wake(); break; }
        this.tellT -= dt;
        if (this.tellT <= 0 && this.dist < 12) { this.tellT = rand(4, 8); this.shiver = 0.5; pebbles(this.fx, this.pos.x, this.pos.y + 0.9, this.pos.z, 3, this.G.chip, 0.3, 0.4); this.sound('rumble_hit', { vol: 0.3 }); }
        break;
      }
      case 'wake': {
        this.shiver = 0.6;
        this.wakeK = smooth(this.st / 1.5);
        this.eyeOpen = clamp(this.st * 2 - 1.4, 0, 1);
        if (this.st < dt * 1.5) this.sound('rumble_hit', { vol: 0.9 });
        if (Math.random() < dt * 22) pebbles(this.fx, this.pos.x + rand(-0.5, 0.5), this.pos.y + 1.1, this.pos.z + rand(-0.5, 0.5), 1, this.G.chip, 0.1, 0.3);
        if (Math.random() < dt * 10) this.fx.dust(this.pos.x + rand(-0.4, 0.4), this.pos.y + 0.1, this.pos.z + rand(-0.4, 0.4), 2, this.G.dust, 0.35);
        this.facePlayer(0.6, dt);
        if (this.st > 1.1 && !this.roared) { this.roared = true; this.sound('golem_roar', { vol: 1 }); this.sqv += 3; }
        if (this.st > 1.7) { this.setState('chase'); this.atkCd = Math.max(this.atkCd, 0.8); }
        break;
      }
      case 'chase': {
        this.wakeK = 1; this.eyeOpen = 1;
        if (m.safe || this.dist > 16) { this.lost += dt; if (this.lost > 7) { this.awake = false; this.lost = 0; this.roared = false; this.setState('dormant'); this.sound('rumble_hit', { vol: 0.3 }); break; } }
        else this.lost = 0;
        const off = this.facePlayer(turn, dt);
        const want = this.lost > 0 || this.hd < 1.45 ? 0 : off < 0.6 ? 0.72 : off < 1.2 ? 0.22 : 0;
        this.push(Math.sin(this.yaw) * want, Math.cos(this.yaw) * want, 4, dt);
        // the mole lingering behind it: a stomp to shake it off
        if (rel > 1.9 && this.hd < 2.2) this.behindT += dt; else this.behindT = Math.max(0, this.behindT - dt * 0.5);
        if (this.behindT > 1.5 && this.atkCd <= 0 && !m.safe) { this.behindT = 0; this.setState('lift'); this.sound('emote', { kind: 'angry' }); this.sound('rumble_hit', { vol: 0.5 }); break; }
        if (this.hd < 2.4 && Math.abs(this.pdy) < 1.2 && this.atkCd <= 0 && off < 0.45 && !m.safe) { this.setState('raise'); this.sound('rumble_hit', { vol: 0.6 }); this.sound('golem_roar', { pitch: 1.15, vol: 0.6 }); }
        this.footfalls(sp, dt);
        break;
      }
      case 'raise': {
        this.push(0, 0, 10, dt);
        this.facePlayer(0.45, dt);
        this.shiver = 0.35;
        this.squint = 0.75;
        if (Math.random() < dt * 12) pebbles(this.fx, this.pos.x + rand(-0.4, 0.4), this.pos.y + 1.6, this.pos.z + rand(-0.4, 0.4), 1, this.G.chip, 0.3, 0.2);
        if (this.st > 1.0) { this.setState('slam'); this.slammed = false; this.sound('whoosh', { vol: 0.8 }); }
        break;
      }
      case 'slam': {
        this.squint = 0.75;
        if (!this.slammed && this.st > 0.1) { this.slammed = true; this.impact(); }
        if (this.st > 0.22) this.setState('stuck');
        break;
      }
      case 'stuck': {
        // fists in the ground, hunched over: the moment to run around it
        this.push(0, 0, 10, dt);
        if (this.st < 1.1 && Math.random() < dt * 5) this.fx.dust(this.pos.x + Math.sin(this.yaw) * 0.8, this.pos.y + 0.05, this.pos.z + Math.cos(this.yaw) * 0.8, 1, this.G.dust, 0.3);
        if (this.st > 1.7) { this.setState('chase'); this.atkCd = rand(1.6, 2.4); }
        break;
      }
      case 'lift': {
        // one foot up (the tell), then down
        this.push(0, 0, 10, dt);
        this.shiver = 0.2;
        if (this.st > 0.75) { this.setState('stomp'); this.stomped = false; }
        break;
      }
      case 'stomp': {
        if (!this.stomped && this.st > 0.08) { this.stomped = true; this.stompImpact(); }
        if (this.st > 0.6) { this.setState('chase'); this.atkCd = rand(1.2, 1.8); }
        break;
      }
      case 'stagger': {
        this.push(0, 0, 3, dt);
        this.squint = 0.6;
        if (Math.random() < dt * 16) pebbles(this.fx, this.pos.x + rand(-0.4, 0.4), this.pos.y + 1.2, this.pos.z + rand(-0.4, 0.4), 1, this.G.chip, 0.2, 0.5);
        if (this.st > 1.15) { this.setState('chase'); this.angry = 2.5; this.atkCd = Math.max(this.atkCd, 0.7); }
        break;
      }
      case 'crumble': {
        this.push(0, 0, 6, dt);
        this.shiver = 1;
        this.eyeOpen = Math.max(0, 1 - this.st * 1.6);
        if (Math.random() < dt * 30) pebbles(this.fx, this.pos.x + rand(-0.5, 0.5), this.pos.y + rand(0.3, 1.4), this.pos.z + rand(-0.5, 0.5), 2, this.G.chip, 0.15, 0.6);
        if (Math.random() < dt * 14) this.fx.dust(this.pos.x + rand(-0.5, 0.5), this.pos.y + rand(0.1, 1.2), this.pos.z + rand(-0.5, 0.5), 2, this.G.dust, 0.2);
        if (this.st > 0.9) { this.wakeK = 1; m.kill(this, { x: 0, y: 0, z: 0 }); }
        break;
      }
    }
    this.eyes.geometry = this.state === 'raise' || this.state === 'slam' || this.state === 'lift' || this.angry > 1.5 ? this.G.angry : this.G.eyes;
    this.flinch = Math.max(0, this.flinch - dt * 4);
    this.cflash = Math.max(0, this.cflash - dt * 3);
    this.bflash = Math.max(0, this.bflash - dt * 5);
    this.flash = 0; // per-part flashes (animate)
    this.shove(dt);
  }

  footfalls(sp, dt) {
    const ph = this.phase;
    this.phase += sp * dt * 5.5;
    if (Math.floor(ph / Math.PI) !== Math.floor(this.phase / Math.PI) && sp > 0.15) {
      const side = Math.floor(this.phase / Math.PI) % 2 ? 1 : -1;
      const fx = this.pos.x + Math.cos(this.yaw) * side * 0.23, fz = this.pos.z - Math.sin(this.yaw) * side * 0.23;
      this.fx.dust(fx, this.pos.y + 0.03, fz, 4, this.G.dust, 0.1);
      pebbles(this.fx, fx, this.pos.y + 0.05, fz, 2, this.G.chip, 0.1, 0.8);
      this.sound('thud', { vol: 0.45 });
      this.sqv -= 2.2;
    }
  }

  /** The mole can't walk through it. */
  shove(dt) {
    const pl = this.mgr.pl;
    if (!pl) return;
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z, d = Math.hypot(dx, dz);
    const min = 0.78;
    if (d >= min || pl.pos.y > this.pos.y + 1.3 || pl.pos.y + 0.8 < this.pos.y) return;
    const ux = d > 1e-3 ? dx / d : Math.sin(this.yaw), uz = d > 1e-3 ? dz / d : Math.cos(this.yaw);
    const k = Math.min(1, (min - d) * 14 * dt * 8);
    pl.vel.x += ux * k * 3; pl.vel.z += uz * k * 3;
    const vn = pl.vel.x * ux + pl.vel.z * uz;
    if (vn < 0) { pl.vel.x -= vn * ux; pl.vel.z -= vn * uz; }
  }

  impact() {
    const m = this.mgr;
    const fx = this.pos.x + Math.sin(this.yaw) * 1, fz = this.pos.z + Math.cos(this.yaw) * 1, y = this.pos.y;
    shockRing(this.fx, fx, y, fz, 0.3, 4.6, this.G.dust, 64);
    pebbles(this.fx, fx, y + 0.1, fz, 16, this.G.chip, 0.4, 4);
    this.fx.sparks(fx, y + 0.1, fz, 12, [1, 0.8, 0.45], [0, 1, 0], 3);
    puff(this.fx, fx, y + 0.1, fz, 14, this.G.dust, 0.45, 0.4, 0.1, 0.7);
    if (this.G.hot) sparkle(this.fx, fx, y + 0.15, fz, 10, this.G.hot, 2.4, 3);
    this.sound('thud', { vol: 1 });
    this.sound('rumble_hit', { vol: 1 });
    this.sound('break', { snd: 'stone', vol: 0.7 });
    this.sqv -= 7;
    m.addHazard({ kind: 'ring', x: fx, y, z: fz, r: 0.3, speed: 4.6, rMax: 3.6, dmg: this.info.dmg, src: this });
    m.shake(this, 0.8);
    // fists landing right on the mole
    if (this.gapToPlayer(fx, y + 0.3, fz, 0.6) < 0) {
      const [dx, dz] = this.dirToPlayer();
      this.hurtPlayer(this.info.dmg * 1.3, [dx * 5, 3.2, dz * 5], this.kind, { heavy: true });
    }
  }

  stompImpact() {
    const m = this.mgr, x = this.pos.x, y = this.pos.y, z = this.pos.z;
    shockRing(this.fx, x, y, z, 0.5, 4.2, this.G.dust, 56);
    pebbles(this.fx, x, y + 0.1, z, 10, this.G.chip, 0.5, 3);
    puff(this.fx, x, y + 0.1, z, 10, this.G.dust, 0.5, 0.3, 0.09, 0.6);
    this.sound('thud', { vol: 1 });
    this.sound('rumble_hit', { vol: 0.8 });
    this.sqv -= 6;
    m.addHazard({ kind: 'ring', x, y, z, r: 0.5, speed: 4.2, rMax: 2.9, dmg: this.info.dmg * 0.8, src: this });
    m.say('cgolem_stomp', 'It <b>stomps</b> when you stay behind it. Jump the shockwave!', 'warn', 90);
  }

  // ------------------------------------------------------------------ body
  animate(dt) {
    const k = easeBack(this.wakeK), sp = Math.hypot(this.vel.x, this.vel.z), st = this.st, P = this.pose;
    const walkK = Math.min(1, sp * 2.2), ph = this.phase;
    let lean = 0.12, sway = Math.sin(ph) * 0.06 * walkK, armX = 0, armZ = 0.1, legA = Math.sin(ph) * 0.42 * walkK, legB = -legA, armSwing = Math.sin(ph) * 0.3 * walkK;
    switch (this.state) {
      case 'raise': { const r = smooth(st / 0.7); lean = 0.12 - 0.42 * r; armX = -2.9 * r; armZ = 0.1 + 0.12 * r; armSwing = 0; break; }
      case 'slam': { const r = smooth(st / 0.1); lean = -0.3 + 0.78 * r; armX = -2.9 + 1.9 * r; armSwing = 0; break; }
      case 'stuck': { const r = smooth((st - 1.1) / 0.6); lean = 0.48 * (1 - r) + 0.12 * r; armX = -1 * (1 - r); armSwing = 0; break; }
      case 'lift': { const r = smooth(st / 0.6); legA = -0.95 * r; legB = 0.12 * r; sway = -0.13 * r; lean = 0.05; armZ = 0.1 + 0.35 * r; armSwing = 0; break; }
      case 'stomp': { const r = smooth(st / 0.08); legA = -0.95 * (1 - r); legB = 0.12 * (1 - r); sway = -0.13 * (1 - r) + Math.sin(st * 30) * 0.03 * (1 - st); armSwing = 0; break; }
      case 'stagger': { const e = Math.exp(-st * 2.2); lean = 0.12 - 0.42 * Math.sin(Math.min(1, st / 0.2) * Math.PI / 2) * e; sway = Math.sin(st * 13) * 0.12 * e; armZ = 0.1 + 0.75 * e; armX = -0.9 * e; armSwing = Math.sin(st * 17) * 0.4 * e; break; }
      case 'crumble': { const r = smooth(st / 0.9); lean = 0.12 + 0.35 * r; sway = Math.sin(st * 25) * 0.05; armX = 0.25 * r; armZ = 0.1 - 0.05 * r; armSwing = 0; break; }
    }
    // asleep: curled up into a boulder, crystal on top
    lean = lean * k + 0.6 * (1 - k);
    armX = armX * k + 0.55 * (1 - k);
    armZ = armZ * k + 0.02 * (1 - k);
    lean += this.flinch * 0.1 * Math.sin(this.t * 40);
    const f = Math.min(1, dt * (this.state === 'slam' || this.state === 'stomp' ? 40 : 9));
    P.lean += (lean - P.lean) * f; P.sway += (sway - P.sway) * f; P.armX += (armX - P.armX) * f; P.armZ += (armZ - P.armZ) * f;
    P.legA += (legA - P.legA) * f; P.legB += (legB - P.legB) * f;
    const bob = Math.abs(Math.sin(ph)) * VS * 0.9 * walkK;
    this.hips.position.y = (2.5 + (LEG - 2.5) * k) * VS + bob + (this.state === 'lift' ? smooth(st / 0.6) * VS * 1.5 : 0);
    this.torsoG.rotation.x = P.lean;
    this.torsoG.rotation.z = P.sway;
    this.arms[0].rotation.set(P.armX + armSwing * k, 0, P.armZ);
    this.arms[1].rotation.set(P.armX - armSwing * k, 0, -P.armZ);
    this.legs[0].rotation.x = P.legA * k; this.legs[1].rotation.x = P.legB * k;
    this.legs.forEach((l) => l.scale.set(1, Math.max(0.12, k), 1));
    // the crystal breathes (brighter when you look at it, flares when hit)
    const aim = clamp(1 - (this.mgr.time - this.aimT) * 3, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.4);
    this.crMat.uniforms.emissive.value = (this.wakeK > 0.3 ? 0.55 : 0.4) + pulse * 0.3 + aim * 0.25 + this.cflash * 0.9;
    this.crMat.uniforms.flash.value = this.cflash * 0.45;
    this.mat.uniforms.flash.value = this.bflash * 0.5;
    this.glowMat.uniforms.flash.value = this.bflash * 0.4;
    this.eyeMat.uniforms.flash.value = 0;
    if (this.glowPart) this.glowMat.uniforms.emissive.value = 0.9 + (this.state === 'raise' ? 0.8 : 0) + pulse * 0.3;
    // sparkles drifting off the crystal
    this.sparkT -= dt;
    if (this.sparkT <= 0 && this.dist < 14) {
      this.sparkT = (this.wakeK > 0.3 ? 0.09 : 0.2) * (aim > 0 ? 0.5 : 1);
      const live = this.shards.filter((s) => !s.gone);
      if (live.length) {
        const s = live[(Math.random() * live.length) | 0], v = s.list[(Math.random() * s.list.length) | 0];
        if (v) {
          _v.set((v.x + 0.5) * VS, (v.y + 0.5) * VS, (v.z + 0.5) * VS).applyMatrix4(this.torsoG.matrixWorld);
          this.fx.spawn({ x: _v.x, y: _v.y, z: _v.z, vx: rand(-0.1, 0.1), vy: rand(0.15, 0.45), vz: rand(-0.1, 0.1), life: rand(0.6, 1.2), size: rand(0.014, 0.026), grow: -0.01, color: Math.random() < 0.5 ? this.G.light : this.G.glit, glow: true, drag: 1.2, grav: -0.1 });
          // and a soft halo hanging around the cluster
          if (Math.random() < 0.45) this.fx.spawn({ x: _v.x, y: _v.y, z: _v.z, vy: 0.05, life: rand(0.7, 1.1), size: rand(0.12, 0.2), grow: 0.05, color: this.G.mid.map((q) => q * 0.5), alpha: 0.22 + aim * 0.15, glow: true, drag: 2 });
        }
      }
    }
    if (this.G.hot && this.wakeK > 0.3 && Math.random() < dt * 5) this.fx.ember(this.center.x + rand(-0.3, 0.3), this.center.y + rand(-0.2, 0.4), this.center.z + rand(-0.3, 0.3));
  }

  updateSpheres() {
    this.root.updateMatrixWorld(true);
    const sc = this.size;
    for (const s of this.spheres) {
      _v.set(s.lx, s.ly, s.lz).applyMatrix4(s.obj.matrixWorld);
      s.x = _v.x; s.y = _v.y; s.z = _v.z; s.r = s.lr * sc;
    }
    const c = this.spheres[1];
    this.center.set(c.x, c.y, c.z);
  }

  light() {
    const p = this.crystalPos(_w);
    if (!p) return null;
    const c = this.G.light, k = (this.wakeK > 0.3 ? 1.1 : 0.75) + 0.3 * Math.sin(this.t * 2.4) + this.cflash * 1.2;
    return { x: p.x, y: p.y + 0.15, z: p.z, c: [c[0] * k, c[1] * k, c[2] * k], r: 3.6 };
  }

  deathFx() {
    const c = this.center;
    puff(this.fx, c.x, this.pos.y + 0.4, c.z, 18, this.G.dust, 0.6, 0.5, 0.12, 0.7);
    pebbles(this.fx, c.x, c.y, c.z, 24, this.G.chip, 0.5, 2.5);
    sparkle(this.fx, c.x, c.y + 0.3, c.z, 16, this.G.light, 2.4, 3, 0.022, 1);
    this.sound('golem_crumble', { vol: 1 });
    this.sound('thud', { vol: 1 });
  }

  dispose() {
    for (const s of this.shards) s.own?.dispose();
    super.dispose();
  }
}
