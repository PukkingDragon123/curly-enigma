// Title screen diorama: a cozy nook deep underground, where the mole has been trapped by a
// cave-in. The tunnel he came through is a heap of rubble and splintered timbers (dust still
// trickles from the ceiling); he warms his paws by a campfire while Nugget dozes in her nest,
// mushrooms and crystals glow, roots dangle, ore glints in the walls, and far above a crack lets
// one thin beam of golden sunlight in. That beam is the dream - and the way out.
import * as THREE from 'three';
import { VoxelGrid, voxMesh, hash3 } from './vox.js';
import { makeCampfire, makeRock, makeLog, makeMushrooms, makeFlower, makePickaxe, makeRoot, makeNest, makeSack, makeLantern, cyl, bar, pj, pp, S32 } from './props.js';
import { Particles, Twinkles, SHAPE, makeGlow, makeSheetSprite, makeBeam, makeLightPool, makeBlobShadow, flameSheet } from './fx.js';
import { makeMole, makeChicken } from './actors.js';
import { batchStatic } from './batch.js';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { makeNoise2D, makeRng, shade, mixHex, clamp } from '../core/util.js';

const VS = 1 / 16;
const BOUNDS = { x0: -7.5, x1: 7.5, y0: -0.5, y1: 6.25, z0: -5.0, z1: 3.0 };
const CH = { cx: 0.5, cy: 1.4, cz: 0.4, rx: 6.6, ry: 4.4, rz: 4.0 };
const FRONT_Z = 2.6;
const CRACK = { x: 5.15, z: -2.55 };
// the collapsed tunnel the mole came in through
const TUN = { x: -0.55, hw: 0.85, top: 1.15, arch: 0.62, mouthZ: -2.35 };

export const BURROW = {
  fire: new THREE.Vector3(0.95, 0, 1.15),
  mole: new THREE.Vector3(2.25, 0, 0.35),
  hen: new THREE.Vector3(3.08, 0, 0.98),
  beamTop: new THREE.Vector3(5.1, 5.0, -2.5),
  beamBottom: new THREE.Vector3(3.95, 0.02, -0.75),
  rubble: new THREE.Vector3(TUN.x, 0, TUN.mouthZ),
};

const ORE_PAL = {
  gold: [0xf2c23a, 0xffe08a, 0xb07a14, 0xfff6c8],
  copper: [0xd9773f, 0xf2a35e, 0x9c4a24, 0xffd0a0],
  gem: [0x7fd0ff, 0xbfe6ff, 0x4a86c9, 0xffffff],
  gem2: [0xff7ab0, 0xffc0dc, 0xc04a80, 0xffffff],
};

const STRATA = [
  [0x6a4a30, 0x634429, 0x71503a], // dirt
  [0x4a3022, 0x432b1e, 0x523626], // dark loam
  [0x7a4a34, 0x704430, 0x83523a], // red clay
  [0x5e5248, 0x564a42, 0x675a50], // grey stone
  [0x5e4430, 0x56402c, 0x664a34], // dirt
  [0x6e5644, 0x665040, 0x765c48], // sandy
  [0x4e3628, 0x463024, 0x563c2c], // dark
];
const DIRT = [0x6b4a32, 0x5e4029, 0x74503a, 0x624330];
const MOSS = [0x5a7a34, 0x6e8e3e, 0x4a6a2e];

const tunnelTop = (x) => {
  const d = (x - TUN.x) / TUN.hw;
  return d * d >= 1 ? -1 : TUN.top + TUN.arch * Math.sqrt(1 - d * d);
};

/** A little deposit of ore nuggets / gem points poking out of a wall (faces +z). */
function makeOreCluster(kind, seed) {
  const rng = makeRng(seed);
  const p = ORE_PAL[kind];
  const g = new VoxelGrid(20, 20, 8);
  const gem = kind.startsWith('gem');
  const n = gem ? 4 : 5 + rng.int(0, 3);
  for (let i = 0; i < n; i++) {
    const x = rng.int(3, 15), y = rng.int(3, 15);
    if (gem) {
      // hexagonal-ish points leaning out of the rock
      const h = rng.int(4, 7), lx = rng.range(-0.25, 0.25), ly = rng.range(-0.15, 0.3);
      for (let k = 0; k < h; k++) {
        const r = k > h - 3 ? 0.6 : 1.2;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          if (dx * dx + dy * dy > r * r + 0.3) continue;
          const c = k === h - 1 ? p[3] : dx < 0 ? p[1] : dy < 0 ? p[2] : p[0];
          g.set(x + dx + lx * k, y + dy + ly * k, k, c);
        }
      }
    } else {
      const w = rng.int(2, 4), hh = rng.int(2, 3);
      g.ellipsoid(x, y, 1, w * 0.7, hh * 0.7, 1.6, (xx, yy, zz, dx, dy) => (dy > 0.4 ? p[1] : dx < -0.3 ? p[3] : dy < -0.4 ? p[2] : p[0]));
      g.set(x - 1, y + 1, 2, p[3]);
    }
  }
  return voxMesh(g, { pivot: [10, 10, 0], scale: S32, kind: 'basic' });
}

/** A cluster of glowing crystal prisms growing out of a wall along +z (leaning outward). */
function makeCrystals(seed, pal, n = 7, len = 30) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(52, 56, 44);
  const base = new VoxelGrid(52, 56, 44);
  base.ellipsoid(26, 14, 3, 13, 8, 4.5, (x, y, z) => pp([0x3a3040, 0x443a4a, 0x2e2834], x, y, z, seed, 2));
  for (let i = 0; i < n; i++) {
    const big = i < 2;
    const a = big ? rng.range(-0.35, 0.35) : rng.range(-1.1, 1.1);
    const L = big ? rng.int(Math.round(len * 0.8), len) : rng.int(Math.round(len * 0.35), Math.round(len * 0.7));
    const r = big ? rng.range(2.6, 3.4) : rng.range(1.5, 2.4);
    const from = [26 + rng.range(-8, 8), 13 + rng.range(-3, 4), 3];
    const up = big ? rng.range(0.45, 0.8) : rng.range(0.15, 0.75);
    const dir = [Math.sin(a) * 0.6, up, 0.8];
    const dl = Math.hypot(...dir);
    const to = [from[0] + dir[0] / dl * L, from[1] + dir[1] / dl * L, from[2] + dir[2] / dl * L];
    cyl(g, from, to, r, (t, ang, d) => {
      const tip = 0.72;
      if (t > tip && d > (1 - t) / (1 - tip)) return -1; // pointed tip
      if (t > 0.9) return pal[3];
      const facet = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 6 + 0.5) % 6;
      if (d < 0.35 && t > 0.15) return mixHex(pal[1], 0xffffff, 0.35); // bright core
      return facet === 0 || facet === 1 ? pal[1] : facet === 2 || facet === 5 ? pal[0] : pal[2];
    });
  }
  const grp = new THREE.Group();
  grp.add(voxMesh(base, { pivot: [26, 14, 0], scale: S32 }));
  grp.add(voxMesh(g, { pivot: [26, 14, 0], scale: S32, kind: 'basic' }));
  return grp;
}

// ------------------------------------------------------------------ cave shell
// the rock buttress the tunnel portal is cut into: its face recedes toward the wall above the timbers
function portalFaceZ(x, y, n) {
  const lat = Math.abs(x - TUN.x) - (TUN.hw + 0.1);
  let z = TUN.mouthZ - 0.04 + n * 0.1;
  if (lat > 0) z -= lat * lat * 0.9 + lat * 0.25;
  if (y > 1.95) z -= (y - 1.95) * 1.25;
  return z;
}

// colour of rock voxels that are fully enclosed: the mesher skips them outright
const DEEP_ROCK = 0x30241d;
let FILLED = 0;
function filledBit() {
  if (!FILLED) { const t = new VoxelGrid(1, 1, 1); t.set(0, 0, 0, 0); FILLED = t.data[0]; }
  return FILLED;
}

function caveGrid() {
  const nx = Math.round((BOUNDS.x1 - BOUNDS.x0) / VS);
  const ny = Math.round((BOUNDS.y1 - BOUNDS.y0) / VS);
  const nz = Math.round((BOUNDS.z1 - BOUNDS.z0) / VS);
  const g = new VoxelGrid(nx, ny, nz);
  const data = g.data;
  const FB = filledBit();
  const n1 = makeNoise2D(11), n2 = makeNoise2D(23), n3 = makeNoise2D(37), n4 = makeNoise2D(53);
  const wx = (i) => BOUNDS.x0 + (i + 0.5) * VS;
  const wy = (j) => BOUNDS.y0 + (j + 0.5) * VS;
  const wz = (k) => BOUNDS.z0 + (k + 0.5) * VS;
  const beam = BURROW.beamBottom;
  const fire = BURROW.fire;
  const DEEP = DEEP_ROCK;
  // ---- pass 1: shape. The wall noise is cached per 2x2x2 block (it varies over ~1 unit anyway).
  const bxn = (nx + 1) >> 1, byn = (ny + 1) >> 1, bzn = (nz + 1) >> 1;
  const bnoise = new Float32Array(bxn * byn * bzn).fill(NaN);
  const solid = new Uint8Array(nx * ny * nz);
  const frontCuts = new Float32Array(nx);
  for (let i = 0; i < nx; i++) frontCuts[i] = FRONT_Z + n2(wx(i) * 0.6, 3.3) * 0.25;
  const crackX = new Float32Array(ny);
  for (let j = 0; j < ny; j++) { const y = wy(j); crackX[j] = CRACK.x + Math.sin(y * 2.1) * 0.1 + (y - 4.5) * 0.25; }
  for (let k = 0; k < nz; k++) {
    const z = wz(k);
    for (let i = 0; i < nx; i++) {
      const x = wx(i);
      const clear = Math.hypot(x - 1.75, (z - 0.7) * 1.2) < 2.4 || Math.hypot(x - beam.x, z - beam.z) < 0.7 || Math.hypot(x - 4.7, z + 0.6) < 1.1;
      const bump = !clear && n1(x * 0.7, z * 0.7) > 0.22 ? VS : 0;
      const frontCut = frontCuts[i];
      const tTop = z < TUN.mouthZ + 0.06 ? tunnelTop(x) : -1;
      const nearPortal = Math.abs(x - TUN.x) < TUN.hw + 1.6 && z < TUN.mouthZ + 0.2;
      const pn = nearPortal ? n4(x * 2.2, z * 2.2) : 0;
      for (let j = 0; j < ny; j++) {
        const y = wy(j);
        if (z > frontCut + (y < 0 ? 0.3 : 0)) continue;
        let inside = false;
        let core = false;
        if (!(y < bump)) {
          const dx = (x - CH.cx) / CH.rx, dy = (y - CH.cy) / CH.ry, dz = (z - CH.cz) / CH.rz;
          const e0 = dx * dx + dy * dy + dz * dz;
          if (e0 < 0.55) inside = true;
          else if (e0 > 1.95) core = true;
          else if (e0 <= 1.75) {
            const bi = (i >> 1) + bxn * ((j >> 1) + byn * (k >> 1));
            let nn = bnoise[bi];
            if (nn !== nn) {
              const ledge = (Math.floor((y + n2(x * 0.3, z * 0.3) * 0.35) / 0.42) % 3 === 0) ? -0.05 : 0;
              nn = n1(x * 0.45 + z * 0.33, y * 0.5) * 0.22 + n3(y * 1.3 + x * 0.5, z * 1.1 + x * 0.4) * 0.1 + ledge;
              bnoise[bi] = nn;
            }
            inside = e0 + nn < 1;
          }
          // the crack: a narrow wobbling slot through the ceiling above the beam
          if (y > 2.6 && Math.abs(x - crackX[j]) < 0.3) {
            core = false;
            if (Math.abs(x - crackX[j]) < 0.14 && Math.abs(z - CRACK.z - (y - 4) * 0.05) < 0.3) inside = true;
          }
          // a rock buttress around the tunnel portal...
          if (nearPortal && inside && y < 3.4 && z < portalFaceZ(x, y, pn)) inside = false;
          // ...and the collapsed tunnel itself running back from it
          if (tTop > 0 && y < tTop + 0.2) { core = false; if (y < tTop) inside = true; }
        }
        // core cells are deep inside the rock: no neighbour of theirs can be empty
        if (!inside) solid[i + nx * (j + ny * k)] = core && !nearPortal && z < frontCut - 0.25 ? 2 : 1;
      }
    }
  }
  // ---- pass 2: colour, only for voxels that can be seen (next to an empty cell)
  const NXY = nx * ny;
  for (let k = 0; k < nz; k++) {
    const z = wz(k);
    for (let j = 0; j < ny; j++) {
      const y = wy(j);
      for (let i = 0; i < nx; i++) {
        const id = i + nx * (j + ny * k);
        const sv = solid[id];
        if (!sv) continue;
        if (sv === 2) { data[id] = DEEP | FB; continue; }
        const exposed = (i > 0 && !solid[id - 1]) || (i < nx - 1 && !solid[id + 1]) || (j > 0 && !solid[id - nx]) || (j < ny - 1 && !solid[id + nx])
          || (k > 0 && !solid[id - NXY]) || (k === nz - 1 || !solid[id + NXY]);
        if (!exposed) { data[id] = DEEP | FB; continue; }
        const x = wx(i);
        let c;
        const front = z > frontCuts[i] - VS * 1.5;
        if (y < 0.2) {
          const dFire = Math.hypot(x - fire.x, z - fire.z);
          const dbx = x - beam.x, dbz = z - beam.z;
          const dBeam = dbx * dbx + dbz * dbz * 1.6;
          c = pp(DIRT, i, j, k, 1, 2);
          if (dFire < 1.35 && hash3(i >> 1, 0, k >> 1, 2) < 0.6 - dFire * 0.3) c = pp([0x4a3426, 0x423020, 0x52382a], i, j, k, 6, 2); // trodden, sooty ring
          if (dBeam < 0.55 && hash3(i, 0, k, 3) < 0.9 - dBeam) c = pp(MOSS, i, j, k, 4, 1); // moss in the light
          else if (hash3(i >> 1, j, k >> 1, 5) < 0.035) c = 0x8a8278; // pebbles
          else if (hash3(i, j, k, 6) < 0.04) c = 0x4a3020;
        } else {
          const warp = n2(x * 0.25, z * 0.25) * 0.5 + n4(x * 0.9, z * 0.9) * 0.08;
          const by = (y + warp) / 0.5;
          const b = Math.floor(by);
          const bi = ((b % STRATA.length) + STRATA.length) % STRATA.length;
          c = pp(STRATA[bi], i, j, k, bi + 3, 2);
          const fr = by - b;
          if (fr < 0.07) c = shade(c, 0.72); // seam between strata
          else if (fr > 0.93) c = shade(c, 1.08);
          const h = hash3(i >> 1, j >> 1, k >> 1, 7);
          if (h < 0.035) c = bi === 3 ? 0x9a9288 : 0x8a8278; // pebbles
          else if (h > 0.975) c = shade(c, 0.78);
          if (Math.abs(n3(x * 1.7 + z * 0.6, y * 1.4)) < 0.018) c = shade(c, 0.6); // hairline cracks
          if (y > 3.0 && Math.abs(n4(x * 1.3 + 7, z * 1.3 + y * 0.2)) < 0.03) c = hash3(i, j, k, 8) < 0.5 ? 0x8a6a48 : 0x9a7652; // root threads
          if (y > 2.2 && n3(x * 0.9 + 4, z * 0.9 + y * 0.6) > 0.18 && hash3(i >> 1, j >> 1, k >> 1, 10) < 0.7) c = pp(MOSS, i, j, k, 12, 1); // mossy patches
          // tally marks scratched by a bored mole: days trapped
          if (z < -2.0 && z > -3.9 && y > 1.0 && y < 1.5 && x > -3.4 && x < -2.65) {
            const u = Math.round((x + 3.4) / VS);
            const v = (y - 1.0) / 0.5;
            if (u % 3 === 0 && u < 12) c = 0xc8aa88;
            if (Math.abs(u - (1 + v * 10)) < 0.6 && u < 12) c = 0xc8aa88;
          }
        }
        if (front) c = shade(c, 0.55);
        data[id] = (c & 0xffffff) | FB;
      }
    }
  }
  // ore deposits embedded in the walls (meshed separately at prop scale)
  const ores = [];
  const oreSpots = [
    [-4.6, 2.4, 'gold'], [-2.3, 3.4, 'gem'], [-2.1, 1.6, 'copper'], [0.6, 3.7, 'gold'], [1.8, 2.5, 'gem2'],
    [5.6, 2.6, 'gold'], [6.3, 1.2, 'copper'], [-5.6, 0.9, 'gem'], [3.5, 3.9, 'copper'], [-3.4, 2.1, 'gold'],
    [2.6, 1.3, 'gold'], [0.9, 2.9, 'gem'], [4.6, 1.5, 'gem'], [1.4, 4.2, 'gold'], [-1.0, 3.3, 'copper'],
  ];
  const surface = (ox, oy) => {
    const i0 = Math.round((ox - BOUNDS.x0) / VS - 0.5);
    const j0 = Math.round((oy - BOUNDS.y0) / VS - 0.5);
    for (let k = nz - 1; k >= 0; k--) {
      if (wz(k) > FRONT_Z - 0.6) continue;
      if (g.filled(i0, j0, k)) return { i0, j0, k };
    }
    return null;
  };
  const rng = makeRng(77);
  for (const [ox, oy, kind] of oreSpots) {
    const s = surface(ox, oy);
    if (!s) continue;
    // darken the host rock around the deposit a little
    for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
      if (di * di + dj * dj > 5) continue;
      if (g.filled(s.i0 + di, s.j0 + dj, s.k)) g.set(s.i0 + di, s.j0 + dj, s.k, (di + dj) % 2 ? 0x2e2420 : 0x3a2c26);
    }
    ores.push({ pos: new THREE.Vector3(wx(s.i0), wy(s.j0), wz(s.k) + VS * 0.5), kind, color: ORE_PAL[kind][3], seed: rng.int(1, 1e6) });
  }
  const crystalSpots = [];
  for (const [ox, oy, pal, sc] of [[-4.75, 0.75, 'blue', 1.15], [5.75, 0.9, 'pink', 1.0], [-2.25, 0.45, 'blue', 0.7], [3.2, 2.9, 'pink', 0.7]]) {
    const s = surface(ox, oy);
    if (s) crystalSpots.push({ pos: new THREE.Vector3(wx(s.i0), wy(s.j0), wz(s.k) + VS * 0.4), pal, sc });
  }
  return { g, ores, crystalSpots, nx, ny, nz };
}

// ------------------------------------------------------------------ the cave-in
const RUBBLE_ROCKS = [[0x9a968e, 0x8a867e, 0xa6a096], [0x84807a, 0x76726c, 0x908a84], [0xa09282, 0x908474, 0xaa9c8c], [0x7a7680, 0x6c6872, 0x86828c]];
const RUBBLE_EARTH = [0x4e3628, 0x44301f, 0x58402e, 0x4a3224];

/** Rubble choking the tunnel and spilling into the nook as a talus cone. */
function makeRubble(seed = 4) {
  const rng = makeRng(seed);
  const X0 = TUN.x - 1.6, X1 = TUN.x + 1.6, Z0 = TUN.mouthZ - 1.2, Z1 = TUN.mouthZ + 1.8, Y1 = 1.95;
  const nx = Math.round((X1 - X0) / S32), nz = Math.round((Z1 - Z0) / S32), ny = Math.round(Y1 / S32);
  const g = new VoxelGrid(nx, ny, nz);
  const n = makeNoise2D(seed);
  const wx = (i) => X0 + (i + 0.5) * S32, wz = (k) => Z0 + (k + 0.5) * S32;
  const m = TUN.mouthZ;
  // an earth bank underneath: fills the tunnel to two-thirds, then a low talus fan
  const height = (x, z) => {
    const lat = Math.abs(x - TUN.x);
    if (z < m + 0.04) {
      // the heap climbs to the roof a little way in: the passage is sealed
      const tt = tunnelTop(x);
      return tt > 0 ? tt * clamp(0.62 + ((m - z) / 0.4) * 0.45, 0.62, 1.08) + n(x * 3, z * 3) * 0.06 : 0;
    }
    const f = clamp(1 - (z - m) / 1.5, 0, 1);
    return 0.62 * Math.pow(f, 1.3) * clamp(1.1 - (lat / 1.45) ** 2, 0, 1) + n(x * 2.6, z * 2.6) * 0.05 * f;
  };
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const x = wx(i), z = wz(k);
    const top = Math.min(ny, Math.round(height(x, z) / S32));
    for (let j = 0; j < top; j++) g.set(i, j, k, j > top - 3 ? pp(RUBBLE_EARTH, i, j, k, 2, 2) : shade(pp(RUBBLE_EARTH, i, j, k, 3, 2), 0.85));
  }
  // faceted rock chunks: an ellipsoid trimmed by a few random planes, each cut face its own tone
  const chunk = (x, y, z, r, pal) => {
    const ci = (x - X0) / S32, cj = y / S32, ck = (z - Z0) / S32, rv = r / S32;
    const planes = [];
    const np = 3 + rng.int(0, 2);
    for (let i = 0; i < np; i++) {
      const th = rng.range(0, Math.PI * 2), ph = rng.range(-0.3, 1.2);
      const nrm = [Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph)];
      planes.push({ nrm, d: rng.range(0.5, 0.78), tone: 0.86 + nrm[1] * 0.22 + nrm[2] * 0.08 });
    }
    const ry = rng.range(0.7, 0.92), rz = rng.range(0.8, 1.05);
    g.ellipsoid(ci, cj, ck, rv, rv * ry, rv * rz, (xx, yy, zz, dx, dy, dz) => {
      let tone = 0.9 + dy * 0.2, near = 99;
      for (const p of planes) {
        const v = dx * p.nrm[0] + dy * p.nrm[1] + dz * p.nrm[2];
        if (v > p.d) return -1;
        const gap = p.d - v;
        if (gap < near) { near = gap; if (gap < 0.16) tone = p.tone; }
      }
      let c = shade(pp(pal, xx, yy, zz, 9, 2), tone);
      if (hash3(xx, yy, zz, 12) < 0.03) c = shade(c, 0.7);
      return c;
    });
  };
  // big blocks wedged in the mouth, piled up toward the cap (with dark gaps between)
  const big = [[-0.45, 0.3, -0.2, 0.36], [0.32, 0.3, -0.15, 0.34], [-0.08, 0.82, -0.32, 0.34], [0.5, 0.85, -0.42, 0.26], [-0.6, 0.95, -0.5, 0.28],
    [0.12, 1.25, -0.62, 0.24], [-0.36, 1.32, -0.75, 0.2], [0.05, 0.22, 0.32, 0.27], [-0.68, 0.2, 0.4, 0.19], [0.62, 0.18, 0.45, 0.18]];
  for (const [dx, y, dz, r] of big) chunk(TUN.x + dx, y, m + dz, r, rng.pick(RUBBLE_ROCKS));
  // the plug: big blocks jammed right up under the roof
  for (let i = 0; i < 9; i++) {
    const dx = rng.range(-0.7, 0.7);
    const tt = tunnelTop(TUN.x + dx);
    chunk(TUN.x + dx, tt - rng.range(0.15, 0.35), m - rng.range(0.25, 0.75), rng.range(0.22, 0.34), rng.pick(RUBBLE_ROCKS));
  }
  // a slab of the fallen roof leaning across the opening
  chunk(TUN.x + 0.15, 0.95, m + 0.1, 0.42, RUBBLE_ROCKS[1]);
  for (let i = 0; i < 34; i++) {
    const z = m + rng.range(0.0, 1.35);
    const x = TUN.x + rng.range(-1.25, 1.25) * (0.5 + (1 - (z - m) / 1.5) * 0.5);
    const y = Math.max(0.03, height(x, z) - 0.03);
    chunk(x, y, z, rng.range(0.06, 0.17), rng.pick(RUBBLE_ROCKS));
  }
  for (let i = 0; i < 56; i++) {
    const a = rng.range(-1.35, 1.35), d = rng.range(1.15, 1.75);
    const x = TUN.x + Math.sin(a) * d, z = m + Math.cos(a) * d;
    if (z > Z1 - 0.06 || x < X0 + 0.06 || x > X1 - 0.06) continue;
    const r = rng.range(0.025, 0.065);
    chunk(x, r * 0.45, z, r, rng.chance(0.35) ? RUBBLE_EARTH.slice(0, 3) : rng.pick(RUBBLE_ROCKS));
  }
  return voxMesh(g, { pivot: [-X0 / S32, 0, -Z0 / S32], scale: S32 });
}

const TIMBER = { base: 0x9a7046, dark: 0x5e3e22, lite: 0xb88a58, end: 0xe8c890 };

/** The portal's timber frame: one post standing, one cracked and leaning, the cap snapped in two. */
function makeTimbers() {
  const X0 = TUN.x - 1.35, Z0 = TUN.mouthZ - 0.25;
  const nx = Math.round(2.7 / S32), ny = Math.round(2.15 / S32), nz = Math.round(1.25 / S32);
  const g = new VoxelGrid(nx, ny, nz);
  const v = (x, y, z) => [(x - X0) / S32, y / S32, (z - Z0) / S32];
  const wood = (t, s, vv, x, y, z, along) => {
    const grain = (Math.floor(along * 0.45 + s * 2.2 + vv * 1.3) % 5 === 0);
    let c = grain ? TIMBER.dark : pj(TIMBER.base, x, y, z, 3, 0.07, 2);
    if (vv > 0.72) c = shade(c, 1.12); else if (vv < -0.72 || Math.abs(s) > 0.75) c = shade(c, 0.84);
    if (hash3(x >> 1, y >> 1, z >> 1, 4) < 0.04) c = 0x3a2416; // knots & rot
    return c;
  };
  const P = 3.4;
  const zz = TUN.mouthZ + 0.1;
  const xl = TUN.x - TUN.hw - 0.04, xr = TUN.x + TUN.hw + 0.04;
  // left post: upright, with an iron band
  bar(g, v(xl, 0, zz), v(xl, 1.84, zz), P, P, (t, s, vv, x, y, z, al) => (Math.abs(t - 0.86) < 0.02 ? 0x4a4448 : wood(t, s, vv, x, y, z, al)));
  // right post: cracked and leaning in toward the rubble
  bar(g, v(xr + 0.04, 0, zz), v(xr - 0.24, 1.62, zz + 0.16), P, P, (t, s, vv, x, y, z, al) => {
    if (Math.abs(t - 0.5 - s * 0.05) < 0.02) return 0x1e140c; // the crack
    if (t > 0.97) return hash3(x, y, z, 5) < 0.6 ? TIMBER.end : -1; // splintered top
    return wood(t, s, vv, x, y, z, al);
  });
  // cap: left half still on its post, the snapped end sagging
  bar(g, v(xl - 0.2, 1.92, zz), v(TUN.x + 0.22, 1.76, zz + 0.03), P * 0.95, P, (t, s, vv, x, y, z, al) => (t > 0.95 ? (hash3(x, y, z, 6) < 0.6 ? TIMBER.end : -1) : wood(t, s, vv, x, y, z, al)));
  // right half fallen across the heap
  bar(g, v(TUN.x + 0.3, 1.2, zz + 0.45), v(xr + 0.32, 0.36, zz + 0.86), P * 0.95, P, (t, s, vv, x, y, z, al) => (t < 0.05 ? (hash3(x, y, z, 7) < 0.6 ? TIMBER.end : -1) : wood(t, s, vv, x, y, z, al)));
  // a loose plank on the floor
  bar(g, v(TUN.x - 1.25, 0.05, zz + 0.95), v(TUN.x - 0.45, 0.12, zz + 1.12), 3.2, 0.9, (t, s, vv, x, y, z, al) => wood(t, s, vv, x, y, z, al * 2));
  // nails and a hook for the lantern
  for (const y of [1.25, 1.52]) g.set((xl + 0.11 - X0) / S32, y / S32, (zz + 0.03 - Z0) / S32, 0x9a9aa2);
  const hx = (TUN.x - 0.45 - X0) / S32, hz = (zz + 0.12 - Z0) / S32, hy = 1.68 / S32;
  for (let k = 0; k < 4; k++) g.set(hx, hy - k, hz, 0x4a4448);
  g.set(hx + 1, hy - 4, hz, 0x4a4448); g.set(hx + 2, hy - 3, hz, 0x4a4448);
  return { mesh: voxMesh(g, { pivot: [-X0 / S32, 0, -Z0 / S32], scale: S32 }), hook: new THREE.Vector3(TUN.x - 0.45, 1.68 - 4 * S32, zz + 0.12) };
}

/** An old wooden crate with a lid, rope handles and a few apples. */
function makeCrate() {
  const g = new VoxelGrid(30, 26, 22);
  g.box(0, 0, 0, 30, 20, 22, (x, y, z) => {
    const frame = ((x < 2 || x > 27) && (y < 2 || y > 17)) || ((z < 2 || z > 19) && (y < 2 || y > 17)) || ((x < 2 || x > 27) && (z < 2 || z > 19));
    if (frame) return pj(0x5a3a20, x, y, z, 2, 0.05);
    const plank = Math.floor(y / 5);
    if (y % 5 === 0) return 0x3a2414;
    return pj(plank % 2 ? 0x8a5a34 : 0x7a5030, x, y, z, 3, 0.05, 2);
  });
  for (let x = 2; x < 28; x++) for (let z = 2; z < 20; z++) for (let y = 14; y < 20; y++) g.clear(x, y, z);
  // apples inside
  for (const [x, z] of [[8, 7], [14, 10], [20, 6], [11, 14], [19, 14], [24, 11]]) g.ellipsoid(x, 15, z, 3, 2.8, 3, (xx, yy) => (yy > 16 ? 0xe05a3a : 0xc0402a));
  g.set(8, 18, 7, 0x5a3a20); g.set(14, 18, 10, 0x5a3a20);
  return voxMesh(g, { pivot: [15, 0, 11], scale: S32 });
}

/** A rug of woven rings. */
function makeRug() {
  const r = 26;
  const g = new VoxelGrid(r * 2 + 2, 1, r * 2 + 2);
  for (let x = 0; x < g.w; x++) for (let z = 0; z < g.d; z++) {
    const d = Math.hypot(x + 0.5 - g.w / 2, (z + 0.5 - g.d / 2) * 1.25);
    if (d > r) continue;
    if (d > r - 1.2 && (x + z) % 2) continue; // frayed edge
    const ring = Math.floor(d / 3.2);
    let c = [0xc94a3a, 0xe8b050, 0xa83a30, 0xe0d0a0, 0xb84030, 0xd88a3a, 0x6a4a8a][ring % 7];
    const ang = Math.atan2(z - g.d / 2, x - g.w / 2);
    if ((Math.floor(ang * 8 + d * 0.5) % 2) && ring % 2) c = shade(c, 0.9); // weave
    g.set(x, 0, z, c);
  }
  return voxMesh(g, { pivot: [g.w / 2, 0, g.d / 2], scale: S32 });
}

/** Bigger zzz for a dozing hen (pixel sprite). */
function zzzTex() {
  const pc = new PixelCanvas(9, 9);
  const rows = ['#######..', '#######..', '....##...', '...##....', '..##.....', '.##......', '#######..', '#######..', '.........'];
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') pc.set(x, y, y < 2 ? 0xffffff : 0xdce8ff); });
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (!pc.alpha(x, y) && ((pc.alpha(x - 1, y) || pc.alpha(x, y - 1)))) pc.set(x, y, 0x3a3a6a);
  return pixelTexture(pc.commit());
}

/**
 * Build the burrow into `scene`. Returns an object with update(dt) and the parts the title
 * scene animates.
 */
export function buildBurrow(scene, textures) {
  const t0 = performance.now();
  scene.background = new THREE.Color(0x0e0a10);
  const root = new THREE.Group();
  scene.add(root);

  // ---------------------------------------------------------------- cave shell
  const cave = caveGrid();
  const tGrid = performance.now();
  const shell = voxMesh(cave.g, { scale: VS, pivot: [-BOUNDS.x0 / VS, -BOUNDS.y0 / VS, -BOUNDS.z0 / VS], solid: { nx: true, px: true, ny: true, py: true, nz: true }, interior: DEEP_ROCK });
  shell.userData.noBatch = true;
  // the cave is the backdrop: props still outline against it, so it can skip the outline mask pass
  shell.layers.disable(1);
  root.add(shell);
  const tShell = performance.now();
  for (const o of cave.ores) {
    const m = makeOreCluster(o.kind, o.seed);
    m.position.copy(o.pos);
    root.add(m);
  }

  // sky glow above the crack
  const skyBit = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), new THREE.MeshBasicMaterial({ color: 0xfff2c0 }));
  skyBit.rotation.x = Math.PI / 2;
  skyBit.position.set(CRACK.x + 0.2, BOUNDS.y1 - 0.05, CRACK.z + 0.1);
  root.add(skyBit);

  // ---------------------------------------------------------------- lights
  // toon materials keep ~35% of every light even on faces turned away, so keep these modest
  const hemi = new THREE.HemisphereLight(0x9a86c8, 0x4a2a1a, 2.2);
  scene.add(hemi);
  const fireLight = new THREE.PointLight(0xffa050, 6.5, 12, 1.8);
  fireLight.position.copy(BURROW.fire).add(new THREE.Vector3(0, 0.75, 0.1));
  scene.add(fireLight);
  const sunLight = new THREE.PointLight(0xffd890, 4, 3.6, 2);
  sunLight.position.copy(BURROW.beamBottom).add(new THREE.Vector3(0.1, 0.9, 0));
  scene.add(sunLight);

  // ---------------------------------------------------------------- rug, fire, seat
  const rug = makeRug();
  rug.position.set(1.7, 0.005, 0.75);
  root.add(rug);
  const fire = makeCampfire(5);
  fire.position.copy(BURROW.fire);
  root.add(fire);
  const coalMat = fire.userData.coals.material;
  // layered flames: a big red-orange back sheet, the main flame, and a white-hot core in front
  const sheetBack = flameSheet(8, 36, 52, 7, [0xffe066, 0xffa62a, 0xf07a1a, 0xd8481a, 0x9a2a14]);
  const sheetMid = flameSheet(8, 36, 52, 3);
  const sheetCore = flameSheet(8, 24, 36, 11, [0xffffff, 0xfffbe0, 0xffe88a, 0xffc040, 0xff9a2a]);
  textures.push(sheetBack.texture, sheetMid.texture, sheetCore.texture);
  const flames = [
    { s: makeSheetSprite(sheetBack.texture, { cols: 8, size: [0.86, 1.24], anchor: [0.5, 0] }), off: [0.02, 0.06, -0.06], rate: 9, ph: 2, sway: 0.06 },
    { s: makeSheetSprite(sheetMid.texture, { cols: 8, size: [0.62, 0.92], anchor: [0.5, 0], renderOrder: 1 }), off: [0, 0.07, 0.04], rate: 11, ph: 0, sway: 0.05 },
    { s: makeSheetSprite(sheetMid.texture, { cols: 8, size: [0.44, 0.6], anchor: [0.5, 0], renderOrder: 1 }), off: [0.16, 0.06, 0.12], rate: 13, ph: 5, sway: 0.08, flip: true },
    { s: makeSheetSprite(sheetCore.texture, { cols: 8, size: [0.32, 0.46], anchor: [0.5, 0], renderOrder: 2 }), off: [0.02, 0.07, 0.14], rate: 14, ph: 3, sway: 0.04 },
  ];
  for (const f of flames) {
    f.s.position.copy(BURROW.fire).add(new THREE.Vector3(...f.off));
    if (f.flip) f.s.userData.sheet.uFlipX.value = 1;
    f.s.userData.dynamic = true;
    root.add(f.s);
  }
  const fireGlow = makeGlow({ color: 0xff8a30, size: 3.6, intensity: 0.55, falloff: 1.5, levels: 6 });
  fireGlow.position.copy(BURROW.fire).add(new THREE.Vector3(0, 0.45, 0));
  root.add(fireGlow);
  const firePool = makeLightPool({ color: 0xff8a3a, rx: 2.0, rz: 1.6, intensity: 0.34, levels: 5 });
  firePool.position.copy(BURROW.fire).add(new THREE.Vector3(0, 0.02, 0));
  root.add(firePool);

  const log = makeLog(22, 3.2);
  log.position.set(BURROW.mole.x, 0, BURROW.mole.z - 0.05);
  log.rotation.y = -0.3;
  root.add(log);

  // ---------------------------------------------------------------- characters
  const mole = makeMole();
  const seatTop = 0.415;
  mole.play('sit');
  mole.update(0);
  const sitHip = mole.hip.position.y;
  const moleY = seatTop - sitHip + 0.01;
  mole.root.position.set(BURROW.mole.x, moleY, BURROW.mole.z);
  mole.face(-0.3, true);
  mole.root.userData.dynamic = true;
  root.add(mole.root);
  const moleShadow = makeBlobShadow(0.75, 0.5, 0.5);
  moleShadow.position.set(BURROW.mole.x, 0.012, BURROW.mole.z + 0.1);
  root.add(moleShadow);

  const nest = makeNest(3);
  nest.position.set(BURROW.hen.x + 0.05, 0, BURROW.hen.z - 0.02);
  nest.rotation.y = -0.5;
  nest.scale.setScalar(0.62);
  root.add(nest);
  const hen = makeChicken();
  hen.root.position.copy(BURROW.hen).add(new THREE.Vector3(0, 0.05, 0));
  hen.face(-1.0, true);
  hen.play('sit');
  hen.root.userData.dynamic = true;
  root.add(hen.root);

  // ---------------------------------------------------------------- the cave-in
  const rubble = makeRubble(4);
  root.add(rubble);
  const timbers = makeTimbers();
  root.add(timbers.mesh);
  // the mole's pickaxe, left leaning on the heap where he tried to dig his way back
  const pick = makePickaxe();
  pick.position.set(TUN.x - 0.95, 0.0, TUN.mouthZ + 1.1);
  pick.rotation.set(-0.42, 0.5, 0.28);
  root.add(pick);
  // the lantern he hung on the frame while digging
  const lantern = makeLantern({ post: 0 });
  lantern.group.position.set(0, -25 * S32 - 0.01, 0);
  const lanternPivot = new THREE.Group();
  lanternPivot.position.copy(timbers.hook);
  lanternPivot.add(lantern.group);
  lanternPivot.userData.dynamic = true;
  root.add(lanternPivot);
  const lanternLight = new THREE.PointLight(0xffc070, 2.6, 4.5, 1.6);
  lanternLight.position.copy(timbers.hook).add(new THREE.Vector3(0, -0.55, 0.4));
  scene.add(lanternLight);
  const lanternGlow = makeGlow({ color: 0xffc060, size: 1.6, intensity: 0.5, levels: 5 });
  lanternGlow.position.copy(timbers.hook).add(new THREE.Vector3(0, -0.55, 0.05));
  root.add(lanternGlow);

  // ---------------------------------------------------------------- props
  const rock = makeRock(9, { w: 16, h: 11, d: 13, color: 0x7a7068, moss: 0.35 });
  rock.position.set(4.75, 0, -0.75);
  root.add(rock);
  const rock2 = makeRock(21, { w: 10, h: 7, d: 9, color: 0x6e655e, moss: 0.2 });
  rock2.position.set(-3.1, 0, 0.9);
  root.add(rock2);
  const sack = makeSack(2);
  sack.position.set(-2.55, 0, -1.65);
  root.add(sack);
  const sack2 = makeSack(4, 0xb89060);
  sack2.position.set(-2.05, 0, -2.05);
  sack2.scale.setScalar(0.8);
  root.add(sack2);
  const crate = makeCrate();
  crate.position.set(-3.45, 0, -1.25);
  crate.rotation.y = 0.35;
  root.add(crate);
  const flower = makeFlower();
  flower.position.copy(BURROW.beamBottom);
  root.add(flower);
  // crystals growing out of the walls
  const glows = [];
  const CRYS = { blue: [0x6ad0ff, 0xbfeaff, 0x3a86c9, 0xffffff], pink: [0xff7ab0, 0xffc0dc, 0xc04a80, 0xffffff] };
  cave.crystalSpots.forEach((c, i) => {
    const m = makeCrystals(500 + i, CRYS[c.pal], 6, 26);
    m.position.copy(c.pos);
    m.scale.setScalar(c.sc);
    m.lookAt(c.pos.clone().add(new THREE.Vector3(0.35 * (c.pos.x < 0 ? 1 : -1), 0.15, 1)));
    root.add(m);
    const halo = makeGlow({ color: c.pal === 'blue' ? 0x3aa8ff : 0xff5aa0, size: 1.9 * c.sc, intensity: 0.32, falloff: 1.7, levels: 5 });
    halo.position.copy(c.pos).add(new THREE.Vector3(0, 0.25 * c.sc, 0.3));
    root.add(halo);
    glows.push({ mesh: halo, base: 0.32, ph: i * 2.3 });
  });

  // mushrooms + halos
  const shroomSpots = [
    { p: [-3.55, 0, 0.2], seed: 4, n: 5, sc: 1 },
    { p: [-5.2, 0.2, -1.0], seed: 8, n: 3, sc: 0.9 },
    { p: [5.55, 0, 0.4], seed: 12, n: 4, sc: 1 },
    { p: [1.2, 0, -2.75], seed: 15, n: 3, sc: 0.8 },
    { p: [-2.1, 0, 2.05], seed: 19, n: 3, sc: 1.1 },
    { p: [6.2, 0.3, -1.6], seed: 22, n: 3, sc: 0.85, cap: [0x7af0a0, 0xc0ffd0, 0x3aa070] },
    { p: [TUN.x + 1.45, 0, TUN.mouthZ + 1.2], seed: 31, n: 2, sc: 0.75 },
  ];
  for (const s of shroomSpots) {
    const m = makeMushrooms(s.seed, { n: s.n, scale: s.sc, cap: s.cap });
    m.group.position.set(...s.p);
    m.group.rotation.y = s.seed;
    root.add(m.group);
    for (const gl of m.glows) {
      const p = gl.pos.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), s.seed).add(m.group.position);
      const halo = makeGlow({ color: s.cap ? 0x5ae08a : 0x3a98ff, size: gl.size * 2.1, intensity: 0.3, falloff: 1.8, levels: 5 });
      halo.position.copy(p);
      root.add(halo);
      glows.push({ mesh: halo, base: 0.3, ph: Math.random() * 6 });
    }
  }

  // hanging roots
  const roots = [];
  const rootSpots = [[-3.2, -1.2, 26], [-1.6, -2.6, 34], [-0.2, -0.6, 22], [1.4, -2.2, 30], [2.6, -2.9, 38], [4.9, -1.6, 24], [5.8, -2.6, 30], [-5.0, -2.4, 24], [0.9, 0.6, 18], [-2.6, 0.4, 16]];
  rootSpots.forEach(([x, z, len], i) => {
    const dx = (x - CH.cx) / CH.rx, dz = (z - CH.cz) / CH.rz;
    const rem = Math.max(0.05, 1 - dx * dx - dz * dz);
    const top = CH.cy + Math.sqrt(rem) * CH.ry - 0.05;
    const r = makeRoot(100 + i * 7, len);
    const pivot = new THREE.Group();
    pivot.position.set(x, top, z);
    pivot.add(r);
    pivot.userData.dynamic = true;
    root.add(pivot);
    roots.push({ pivot, ph: i * 1.7, amp: 0.025 + (i % 3) * 0.01 });
  });

  // merge every static prop into a handful of meshes
  const batches = batchStatic(root);

  // ---------------------------------------------------------------- the sunbeam
  const camGuess = new THREE.Vector3(1.0, 2.6, 11);
  const beamFrom = BURROW.beamTop.clone().add(new THREE.Vector3(0.45, 1.6, -0.1));
  const beam = makeBeam(beamFrom, BURROW.beamBottom, 0.85, camGuess, { color: 0xffc860, intensity: 0.75, levels: 10 });
  root.add(beam);
  const beamCore = makeBeam(beamFrom, BURROW.beamBottom, 0.26, camGuess, { color: 0xfff0c0, intensity: 0.55, levels: 8 });
  root.add(beamCore);
  const pool = makeLightPool({ color: 0xffd27a, rx: 0.7, rz: 0.42, intensity: 0.85, levels: 6 });
  pool.position.copy(BURROW.beamBottom).add(new THREE.Vector3(0, 0.01, 0));
  root.add(pool);
  const crackGlow = makeGlow({ color: 0xffe0a0, size: 1.2, intensity: 0.7, levels: 5 });
  crackGlow.position.copy(BURROW.beamTop).add(new THREE.Vector3(0.05, 0.1, 0));
  root.add(crackGlow);

  // dust motes drifting in the beam
  const motes = new Particles({ max: 110, additive: true });
  root.add(motes.points);
  const beamAxis = new THREE.Vector3().subVectors(BURROW.beamTop, BURROW.beamBottom);
  const moteSpawn = () => {
    const t = Math.random();
    const p = BURROW.beamBottom.clone().addScaledVector(beamAxis, t);
    p.x += (Math.random() - 0.5) * 0.4;
    p.z += (Math.random() - 0.5) * 0.3;
    motes.spawn({ pos: [p.x, p.y, p.z], vel: [(Math.random() - 0.5) * 0.06, -0.03 - Math.random() * 0.05, (Math.random() - 0.5) * 0.04], life: 4 + Math.random() * 5,
      color: Math.random() < 0.3 ? 0xffffff : 0xffe6a0, size: Math.random() < 0.25 ? 2 : 1, alpha: 0.9, fadeIn: 1.2, flicker: 0.5, wobble: 0.05 });
  };
  for (let i = 0; i < 70; i++) { moteSpawn(); motes.life[(motes.next - 1 + motes.max) % motes.max] = Math.random() * 4; }

  // embers rising from the fire, and a thin curl of smoke
  const embers = new Particles({ max: 140, additive: true });
  root.add(embers.points);
  const smoke = new Particles({ max: 60, additive: false, renderOrder: 4 });
  root.add(smoke.points);

  // dust and grit still trickling from the broken ceiling over the cave-in
  const dust = new Particles({ max: 120, additive: false, renderOrder: 4 });
  root.add(dust.points);
  const dustTop = new THREE.Vector3(TUN.x, 2.85, TUN.mouthZ + 0.3);

  // a few fireflies wandering the nook
  const flies = new Particles({ max: 16, additive: true });
  root.add(flies.points);
  const flyHome = [];
  const frng = makeRng(5);
  for (let i = 0; i < 14; i++) {
    const p = [frng.range(-5.5, 6), frng.range(0.6, 3.6), frng.range(-3, 1.8)];
    flyHome.push({ p, ph: frng.range(0, 9), sp: frng.range(0.25, 0.55) });
    flies.spawn({ pos: p.slice(), life: 1e9, color: frng.chance(0.5) ? 0xd8ff7a : 0xfff0a0, size: frng.chance(0.3) ? 2 : 1, fadeIn: 0 });
  }

  // ore sparkles
  const twinkles = new Twinkles(cave.ores.map((o, i) => ({ pos: [o.pos.x + 0.06, o.pos.y + 0.08, o.pos.z + 0.2], color: o.color, size: 1, big: 4, bigShape: SHAPE.plus, speed: 0.7 + (i % 4) * 0.3, phase: i * 2.1, sharp: 12, base: 0 })));
  root.add(twinkles.points);

  // zzz over Nugget
  const zTex = zzzTex();
  textures.push(zTex);
  const zs = [0, 1, 2].map((i) => {
    const s = makeSheetSprite(zTex, { cols: 1, size: [0.17, 0.17], anchor: [0.5, 0.5] });
    root.add(s);
    return { s, t: i * 1.1 };
  });

  const stats = { grid: tGrid - t0, shell: tShell - tGrid, total: performance.now() - t0, batches: batches.length, batched: batches.reduce((n, b) => n + b.userData.batched, 0), shellTris: shell.geometry.index.count / 3 };

  // ---------------------------------------------------------------- update
  let t = 0;
  let emberAcc = 0, moteAcc = 0, smokeAcc = 0, dustAcc = 0;
  let trickleT = 2.5;
  let rubWait = 4;
  let rubT = 0;
  const tmp = new THREE.Vector3();
  const update = (dt) => {
    t += dt;
    // fire flicker
    const fl = 0.82 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 23.7 + 1) + 0.05 * Math.sin(t * 5.3);
    fireLight.intensity = 6.5 * fl;
    fireLight.position.x = BURROW.fire.x + Math.sin(t * 7.3) * 0.04;
    fireGlow.userData.glow.uIntensity.value = 0.5 * fl;
    firePool.userData.glow.uIntensity.value = 0.32 * fl;
    coalMat.color.setScalar(0.78 + 0.22 * fl + Math.sin(t * 3.1) * 0.05);
    for (const f of flames) {
      f.s.userData.sheet.uFrame.value = Math.floor(t * f.rate + f.ph) % 8;
      f.s.scale.set(1 + Math.sin(t * 9 + f.ph) * f.sway, 1 + Math.sin(t * 7.1 + f.ph * 1.7) * f.sway * 1.6, 1);
    }

    emberAcc += dt * 11;
    while (emberAcc > 1) {
      emberAcc -= 1;
      embers.spawn({
        pos: [BURROW.fire.x + (Math.random() - 0.5) * 0.35, 0.25 + Math.random() * 0.2, BURROW.fire.z + (Math.random() - 0.5) * 0.3],
        vel: [(Math.random() - 0.5) * 0.25, 0.7 + Math.random() * 0.8, (Math.random() - 0.5) * 0.2],
        life: 1.2 + Math.random() * 1.8, color: Math.random() < 0.4 ? 0xffe080 : 0xffa040, color2: 0xd9401a,
        size: Math.random() < 0.2 ? 2 : 1, gravity: -0.05, drag: 0.4, wobble: 0.35, flicker: 0.3,
      });
    }
    embers.update(dt);
    smokeAcc += dt * 3;
    while (smokeAcc > 1) {
      smokeAcc -= 1;
      smoke.spawn({ pos: [BURROW.fire.x + (Math.random() - 0.5) * 0.15, 1.0 + Math.random() * 0.2, BURROW.fire.z], vel: [(Math.random() - 0.5) * 0.08 + 0.04, 0.32 + Math.random() * 0.12, -0.03],
        life: 3.2 + Math.random(), color: 0x3a2e2e, color2: 0x241c22, size: 2, size2: 6, alpha: 0.35, fadeIn: 0.6, wobble: 0.12, drag: 0.15, shape: SHAPE.round });
    }
    smoke.update(dt);
    // dust over the collapse: a slow drizzle and, now and then, a little trickle of grit
    dustAcc += dt * 7;
    while (dustAcc > 1) {
      dustAcc -= 1;
      dust.spawn({ pos: [dustTop.x + (Math.random() - 0.5) * 2.2, dustTop.y + Math.random() * 0.3, dustTop.z + (Math.random() - 0.5) * 1.0],
        vel: [(Math.random() - 0.5) * 0.05, -0.1 - Math.random() * 0.12, 0], life: 5 + Math.random() * 3, color: Math.random() < 0.5 ? 0x8a7a68 : 0x6a5a4a,
        size: 1, alpha: 0.75, fadeIn: 0.8, wobble: 0.08 });
    }
    trickleT -= dt;
    if (trickleT < 0) {
      trickleT = 3 + Math.random() * 5;
      const x = dustTop.x + (Math.random() - 0.5) * 1.2, z = dustTop.z + (Math.random() - 0.5) * 0.5;
      for (let i = 0; i < 14; i++) dust.spawn({ pos: [x + (Math.random() - 0.5) * 0.06, dustTop.y + 0.1 + i * 0.03, z], vel: [(Math.random() - 0.5) * 0.08, -0.5 - Math.random() * 0.4, 0], life: 1.8, color: i % 3 ? 0x7a6a58 : 0x9a8a74, size: i % 4 ? 1 : 2, gravity: 1.6, alpha: 0.9, fadeIn: 0 });
    }
    dust.update(dt);
    for (let i = 0; i < flyHome.length; i++) {
      const f = flyHome[i];
      const a = t * f.sp + f.ph;
      flies.pos[i * 3] = f.p[0] + Math.sin(a) * 0.6 + Math.sin(a * 2.3) * 0.15;
      flies.pos[i * 3 + 1] = f.p[1] + Math.sin(a * 1.7) * 0.25;
      flies.pos[i * 3 + 2] = f.p[2] + Math.cos(a * 0.8) * 0.4;
      flies.col[i * 4 + 3] = clamp(Math.sin(t * 1.3 + f.ph * 3) * 1.6 - 0.4, 0, 1) * 0.9;
    }
    flies.geo.attributes.position.needsUpdate = true;
    flies.geo.attributes.aColor.needsUpdate = true;
    moteAcc += dt * 10;
    while (moteAcc > 1) { moteAcc -= 1; moteSpawn(); }
    motes.update(dt);
    twinkles.update(dt);

    beam.userData.beam.uTime.value = t;
    beamCore.userData.beam.uTime.value = t * 1.3;
    const breathe = 0.9 + 0.1 * Math.sin(t * 0.7);
    beam.userData.beam.uIntensity.value = 0.75 * breathe;
    pool.userData.glow.uIntensity.value = 0.85 * breathe;
    for (const g of glows) g.mesh.userData.glow.uIntensity.value = g.base * (0.85 + 0.15 * Math.sin(t * 1.3 + g.ph));
    for (const r of roots) {
      r.pivot.rotation.z = Math.sin(t * 0.6 + r.ph) * r.amp;
      r.pivot.rotation.x = Math.sin(t * 0.47 + r.ph * 1.3) * r.amp * 0.7;
    }
    lanternPivot.rotation.z = Math.sin(t * 0.6) * 0.05;
    lanternPivot.rotation.x = Math.sin(t * 0.43 + 1) * 0.03;
    lanternLight.intensity = 2.6 * (0.92 + Math.sin(t * 9.3) * 0.04 + Math.sin(t * 17.1) * 0.04);

    // the mole warms his paws (rubbing them now and then) and glances up at the light
    mole.update(dt);
    rubWait -= dt;
    if (rubWait < 0) { rubWait = 6 + Math.random() * 6; rubT = 1.4; }
    let rub = 0;
    if (rubT > 0) { rubT -= dt; rub = Math.sin(t * 19) * 0.16 * Math.min(1, rubT * 3); }
    const look = clamp(Math.sin(t * 0.21) * 2.2 - 1.2, 0, 1); // occasionally looks up at the beam
    mole.armL.rotation.x = -0.95 + Math.sin(t * 1.1) * 0.06;
    mole.armR.rotation.x = -0.95 + Math.sin(t * 1.1 + 0.6) * 0.06;
    mole.armL.rotation.z = 0.25 + rub;
    mole.armR.rotation.z = -0.25 + rub;
    mole.neck.rotation.x = -0.05 + Math.sin(t * 0.8) * 0.03 - look * 0.55;
    mole.neck.rotation.y = look * -0.5;
    mole.hip.position.y += Math.sin(t * 2) * 0.004;

    // Nugget dozes: eyes shut, head nodding slowly
    hen.update(dt);
    const nod = Math.sin(t * 0.9);
    hen.head.rotation.x = 0.25 + nod * 0.12;
    const peek = Math.sin(t * 0.37) > 0.97;
    for (const e of hen.eyes) e.scale.y = peek ? 1 : 0.2;
    for (const z of zs) {
      z.t += dt;
      const k = (z.t % 3.3) / 3.3;
      hen.head.getWorldPosition(tmp);
      z.s.position.set(tmp.x + 0.15 + k * 0.35 + Math.sin(k * 6) * 0.05, tmp.y + 0.25 + k * 0.7, tmp.z);
      z.s.userData.sheet.uOpacity.value = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
      const sc = 0.7 + k * 0.6;
      z.s.scale.set(sc, sc, 1);
    }
  };

  return { root, update, mole, hen, fireLight, stats };
}

