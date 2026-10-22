// Old Star's practice dig: the chamber where he gives the mining lesson, a crawl away from the mine
// entrance lift. One layout (prologueLayout) is shared by the stamp below (voxels, run by the chunk
// generator, maybe in a web worker: pure, deterministic, no DOM, imports only materials/noise) and
// by the lesson (src/deep/Prologue.js: the plug, the copper, the geode, the ledge, the critter's
// burrow, where he stands).
//
// Everything is in meters relative to the feature { kind: 'prologue', x, y, z, to?, lift? } (the
// chamber's floor centre); the lift room (plan.lifts L0) comes from f.lift, or from f.to, which the
// generator puts 1.4 m in from the lift room's north-east corner. Voxel maths goes through VOX.
//
// From the lift: out of the cage south into the old trail (the lead's trails to the trading post
// and the herbalist start there), and on its east side the mouth of his crawl, shut with a plug of
// loam (the first thing you dig); the crawl runs east past the lift room, round and down into the
// chamber. The chamber (≈ 6.2 × 5.2 m, 2.2–2.6 m high, flat floor): a copper lump in the west wall
// in a pocket of soft loam, a geode in the south wall behind a hand's width of loam (its crystals
// glint through), a ledge (niche) 1.5 m up in the flat east wall with his map on it, a critter's
// burrow low in the east wall, and flat stretches of wall for his workbench, notes and tally marks.
// A shell around it all is kept solid, so random caves never break the layout.
import { M, MAT, VOX, ORE_BASE, granM } from '../materials.js';
import { makeNoise3D, h3 } from '../noise.js';

export const PROLOGUE_BB = 10; // meters around the centre this feature may touch (the crawl reaches ~9.5)

const NOISE = makeNoise3D(4242);
const oreM = (item, def) => { for (let m = ORE_BASE; m < 256; m++) if (MAT[m]?.item === item) return m; return def; };
const ORE_M = oreM('copper_ore', ORE_BASE + 1);

const LAYOUTS = new Map();

/**
 * The layout in world meters (cached per feature position). Points are { x, y, z }.
 *  ore {x,y,z,r,item,m,face}, geode {x,y,z,r,item,face}, gem {x,y,z} (inside the geode), burrow {x,y,z}
 *  (the critter's hole mouth) + den (its far end), ledge {x0,x1,y,y1,z0,z1,wallX}, ladderZone, map,
 *  candle, table, lantern, bedroll, tally, notes, pile, ladder, tools, stool, mouth (the crawl's
 *  chamber end), corner, nook (the lift end), crawl [mouth → corner], plug {x0..z1} (between the lift
 *  room and the nook), door (in front of the cage), cage, room (the lift room box), box (the chamber),
 *  spots { arrive, plug, ore, gem, ledge, critter } (where Old Star stands for each part).
 */
export function prologueLayout(f) {
  const key = `${f.x},${f.y},${f.z},${f.lift ? f.lift.x + ',' + f.lift.z : f.to ? f.to.x + ',' + f.to.z : ''}`;
  let L = LAYOUTS.get(key);
  if (L) return L;
  const o = { x: f.x, y: f.y, z: f.z };
  const P = (x, y, z) => ({ x: o.x + x, y: o.y + y, z: o.z + z });
  const lift = f.lift ? { x: f.lift.x, y: f.lift.y, z: f.lift.z } : f.to ? { x: f.to.x - 1.4, y: f.to.y, z: f.to.z + 1.4 } : { x: o.x - 6, y: o.y + 1.5, z: o.z + 6 };
  const LP = (x, y, z) => ({ x: lift.x + x, y: lift.y + y, z: lift.z + z });
  // the crawl: from the chamber's south-west out past the lift room's east side, then west into the nook
  const mouth = P(-2.25, 0, 2.45);
  const corner = LP(2.75, 0, 2.6);
  const nook = LP(0, 0, 2.6);
  const crawl = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, s = t * t * (3 - 2 * t);
    crawl.push({ x: mouth.x + (corner.x - mouth.x) * t, y: mouth.y + (corner.y - mouth.y) * s, z: mouth.z + (corner.z - mouth.z) * t });
  }
  const geode = { ...P(0.9, 0.74, 3.0), r: 0.3, item: 'amethyst', face: [0, 0, -1], wallZ: o.z + 2.6 };
  L = {
    o, lift,
    box: { x0: o.x - 3.1, x1: o.x + 3.1, y0: o.y, y1: o.y + 2.6, z0: o.z - 2.6, z1: o.z + 2.6 },
    ore: { ...P(-3.19, 0.52, 0.45), r: 0.2, item: 'copper_ore', m: ORE_M, wallX: o.x - 3.1, face: [1, 0, 0] },
    geode,
    gem: { x: geode.x, y: geode.y - geode.r * 0.42, z: geode.z },
    burrow: P(3.05, 0.17, 1.3),
    den: P(3.75, 0.2, 1.3),
    ledge: { x0: o.x + 3.1, x1: o.x + 4.15, y: o.y + 1.5, y1: o.y + 2.5, z0: o.z - 1.45, z1: o.z + 0.25, wallX: o.x + 3.1 },
    ladderZone: { x0: o.x + 2.75, x1: o.x + 3.1, y0: o.y, y1: o.y + 1.55, z0: o.z - 1.5, z1: o.z + 0.3 },
    map: P(3.42, 1.5, -0.62),
    candle: P(3.62, 1.5, -1.15),
    table: { ...P(-2.72, 0, -1.2), yaw: Math.PI / 2 },
    lantern: P(-2.8, 0.62, -1.42),
    bedroll: { ...P(0.95, 0, -2.18), yaw: 0 },
    tally: { x0: o.x - 0.45, x1: o.x + 2.05, y0: o.y + 0.75, y1: o.y + 1.65, z: o.z - 2.6 },
    notes: { x: o.x - 3.1, y0: o.y + 0.75, y1: o.y + 1.55, z0: o.z - 1.85, z1: o.z - 0.55 },
    pile: P(-2.45, 0, -2.05),
    ladder: { ...P(2.05, 0, -1.7), yaw: 0 },
    tools: P(2.55, 0, 2.05),
    stool: P(-2.1, 0, -0.55),
    mouth, corner, nook, crawl,
    plug: { x0: lift.x + 0.85, x1: lift.x + 1.45, y0: lift.y, y1: lift.y + 1.3, z0: lift.z + 1.9, z1: lift.z + 3.3 },
    door: LP(0, 0, 1.12),
    cage: LP(0, 0, 0.05),
    room: { x0: lift.x - 1.5, x1: lift.x + 1.5, y0: lift.y, y1: lift.y + 2.3, z0: lift.z - 1.5, z1: lift.z + 1.5 },
    spots: {
      arrive: { ...LP(0.38, 0, -0.25), yaw: Math.PI }, // in the cage beside you
      plug: { ...LP(0.12, 0, 3.15), yaw: Math.PI / 2 - 0.35 }, // in the trail by the plug, watching
      nook: { ...LP(-0.55, 0, 2.75), yaw: 0 },
      ore: { ...P(-2.15, 0, 1.15), yaw: -Math.PI / 2 - 0.45 },
      gem: { ...P(-0.15, 0, 1.75), yaw: 0.6 },
      ledge: { ...P(1.85, 0, 0.9), yaw: Math.PI / 2 + 0.5 },
      critter: { ...P(-0.6, 0, 0.6), yaw: Math.PI / 2 },
    },
  };
  LAYOUTS.set(key, L);
  return L;
}

// ---------------------------------------------------------------- the stamp
// distance (xz) from a point to a segment; the parameter lands in SEG_T (no allocations: this runs
// for every voxel of every chunk the layout touches)
let SEG_T = 0;
function d2seg(px, pz, a, b) {
  const ax = b.x - a.x, az = b.z - a.z, l2 = ax * ax + az * az || 1;
  let t = ((px - a.x) * ax + (pz - a.z) * az) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  SEG_T = t;
  const qx = a.x + ax * t - px, qz = a.z + az * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

/** The geode at a point: -1 outside, 0 hollow, else its material (lining crystals, shell). */
function geodeAt(G, x, y, z) {
  const dx = x - G.x, dy = y - G.y, dz = z - G.z;
  const q = (dx * dx + dy * dy + dz * dz) / (G.r * G.r);
  if (q > 1.1) return -1;
  const vx = Math.floor(x * VOX), vy = Math.floor(y * VOX), vz = Math.floor(z * VOX);
  const d = Math.sqrt(q) + (h3(vx, vy, vz, 29) - 0.5) * 0.08;
  if (d < 0.55) return 0;
  if (d < 0.8) return h3(vx >> 1, vy >> 1, vz >> 1, 33) < 0.35 + (d - 0.55) * 2.2 ? M.CRYSTAL : 0;
  if (d < 1) return M.GEODE;
  return -1;
}

/**
 * What the layout wants at a point (world meters): -1 = leave as generated, 0 = air, else a material.
 * out.shell = true when the point is in the solid shell round the carved space (filled if it is air).
 */
function classify(L, x, y, z, out) {
  const o = L.o;
  const lx = x - o.x, ly = y - o.y, lz = z - o.z;
  out.shell = false;
  const R = L.room;
  if (x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1 && y > R.y0 - 0.2 && y < R.y1 + 0.3) return -1; // the lift room is the generator's
  // the copper lump (lumpy, in the west wall)
  const ore = L.ore;
  const dox = x - ore.x, doy = y - ore.y, doz = z - ore.z;
  const dOre2 = dox * dox + doy * doy * 1.15 + doz * doz;
  if (dOre2 < ore.r * ore.r * 1.6 && Math.sqrt(dOre2) < ore.r * (0.85 + NOISE.n(x * 9, y * 9, z * 9) * 0.35)) return ore.m;
  // the geode in the south wall
  const g = geodeAt(L.geode, x, y, z);
  if (g >= 0) return g;
  // the plug between the lift room and the nook
  const pg = L.plug;
  if (x > pg.x0 && x < pg.x1 && y > pg.y0 && y < pg.y1 && z > pg.z0 && z < pg.z1) return M.LOAM;
  // carved space
  if (carved(L, x, y, z, lx, ly, lz)) return 0;
  // pockets of soft loam round the ore and the geode (quick to dig round)
  if (dOre2 < 0.46 * 0.46) return M.LOAM;
  const G = L.geode, gx = x - G.x, gy = y - G.y, gz = z - G.z;
  if (gx * gx + gy * gy + gz * gz < (G.r + 0.2) * (G.r + 0.2)) return M.LOAM;
  // the solid shell round everything carved
  out.shell = carvedNear(L, x, y, z, lx, ly, lz);
  return -1;
}

/** Is the point inside the dug-out space? */
function carved(L, x, y, z, lx, ly, lz) {
  // the room: a rounded box with a flat floor and a low vault, roughly hewn up high
  if (ly > 0 && ly < 2.8 && lx > -3.2 && lx < 3.2 && lz > -2.7 && lz < 2.7) {
    const nx = lx / 3.1, nz = lz / 2.6;
    const nx2 = nx * nx, nz2 = nz * nz;
    const se = nx2 * nx2 * nx2 + nz2 * nz2 * nz2;
    if (se < 1.15) {
      let lim = 1 - (ly > 1.9 ? (ly - 1.9) * 0.35 : 0);
      if (ly > 1.5 && se > lim - 0.16) lim -= NOISE.fbm(x * 1.7, y * 1.7, z * 1.7, 2) * 0.14; // hewn roughly up high
      if (se < lim) {
        if (ly < 2.0) return true; // the vault is never lower than that
        const ceil = 2.15 + 0.45 * Math.max(0, 1 - nx2 - nz2) + NOISE.n(x * 0.9, 7.3, z * 0.9) * 0.12;
        if (ly < ceil) return true;
      }
    }
    // flat stretches of wall: the ledge wall (east), the tally wall (north), the table wall and the ore (west)
    if (lx > 2.5 && lx < 3.1 && lz > -1.75 && lz < 0.55 && ly < 2.25) return true;
    if (lz < -2.15 && lz > -2.6 && lx > -0.7 && lx < 2.3 && ly < 2.0) return true;
    if (lx < -2.6 && lx > -3.1 && lz > -1.95 && lz < 1.05 && ly < 1.95) return true;
  }
  // the ledge (a niche in the east wall)
  const G = L.ledge;
  if (x >= G.x0 - 0.01 && x < G.x1 && y > G.y && y < G.y1 && z > G.z0 && z < G.z1) {
    const back = (x - G.x0) / (G.x1 - G.x0);
    return !(back > 0.75 && (y > G.y1 - 0.18 || z < G.z0 + 0.12 || z > G.z1 - 0.12));
  }
  // the critter's burrow: a round hole low in the east wall, a little den at its end
  if (lx > 2.8 && lx < 4.1 && ly > 0 && ly < 0.55 && lz > 0.9 && lz < 1.7) {
    const B = L.burrow, D = L.den;
    const dy = y - B.y, dz = z - B.z;
    if (x < D.x && dy * dy + dz * dz < 0.15 * 0.15) return true;
    const ex = x - D.x, ey = y - D.y, ez = z - D.z;
    if (ex * ex + ey * ey * 1.6 + ez * ez < 0.26 * 0.26) return true;
  }
  // the crawl: a low tunnel rising toward the lift, then west into the nook
  if (lz > 2.0) {
    const C = L.crawl;
    for (let i = 0; i < C.length - 1; i++) {
      const a = C[i], b = C[i + 1];
      if (y < Math.min(a.y, b.y) - 0.1 || y > Math.max(a.y, b.y) + 1.3) continue;
      const d = d2seg(x, z, a, b);
      if (d > 0.62) continue;
      const fy = a.y + (b.y - a.y) * SEG_T;
      const yy = y - fy;
      if (yy <= 0 || yy > 1.2) continue;
      if (d > 0.44 && d > 0.52 + NOISE.n(x * 2.3, y * 2.3, z * 2.3) * 0.07) continue;
      const roof = yy + Math.max(0, d - 0.25) * 0.5;
      if (roof < 0.99 || roof < 1.08 + NOISE.n(x * 1.9, 5.1, z * 1.9) * 0.08) return true;
    }
    const a = L.corner, N = L.nook;
    const yy = y - a.y;
    if (yy > 0 && yy < 1.35) {
      const d = d2seg(x, z, a, N);
      if (d < 0.62 && d < 0.52 + NOISE.n(x * 2.3, y * 2.3, z * 2.3) * 0.07 && yy < 1.08 - Math.max(0, d - 0.25) * 0.5) return true;
      // the nook: a little wider and taller
      const nx = (x - N.x) / 1.0, nz = (z - (N.z + 0.1)) / 0.62;
      if (yy < 1.3 && nx * nx * nx * nx + nz * nz * nz * nz < 1 - (yy > 1 ? (yy - 1) * 1.5 : 0)) return true;
    }
  }
  return false;
}

/** Within the shell (0.45 m) round the carved space? (bounding shapes, not exact) */
function carvedNear(L, x, y, z, lx, ly, lz) {
  const pad = 0.45;
  if (ly > -pad && ly < 3.0 && lx > -3.1 - pad && lx < 4.15 + pad && lz > -2.6 - pad && lz < 2.6 + pad) return true;
  if (lz > 2.0) {
    const C = L.crawl;
    for (let i = 0; i < C.length - 1; i++) {
      const a = C[i], b = C[i + 1];
      if (y < Math.min(a.y, b.y) - pad || y > Math.max(a.y, b.y) + 1.1 + pad) continue;
      const d = d2seg(x, z, a, b);
      const fy = a.y + (b.y - a.y) * SEG_T;
      if (d < 0.55 + pad && y > fy - pad && y < fy + 1.1 + pad) return true;
    }
    if (d2seg(x, z, L.corner, L.nook) < 1.05 + pad && y > L.nook.y - pad && y < L.nook.y + 1.3 + pad) return true;
  }
  return false;
}

/** Bounding boxes (world meters) of everything the stamp may touch, for quick chunk rejection. */
function boxes(L) {
  if (L.boxes) return L.boxes;
  const o = L.o, out = [];
  out.push([o.x - 3.7, o.y - 0.6, o.z - 3.2, o.x + 4.7, o.y + 3.1, o.z + 3.45]);
  const C = [...L.crawl, L.corner, L.nook];
  for (let i = 0; i < C.length - 1; i++) {
    const a = C[i], b = C[i + 1];
    const p = i === C.length - 2 ? 1.6 : 1.1; // the nook is wider
    out.push([Math.min(a.x, b.x) - p, Math.min(a.y, b.y) - 0.5, Math.max(Math.min(a.z, b.z) - p, L.o.z + 2.0), Math.max(a.x, b.x) + p, Math.max(a.y, b.y) + 1.8, Math.max(a.z, b.z) + p]);
  }
  const pg = L.plug;
  out.push([pg.x0 - 0.1, pg.y0 - 0.1, pg.z0 - 0.1, pg.x1 + 0.1, pg.y1 + 0.1, pg.z1 + 0.1]);
  L.boxes = out;
  return out;
}

const _out = { shell: false };

/**
 * Called by ChunkGen.stamp for the plan feature { kind: 'prologue', x, y, z, to?, lift? }: fills the
 * chunk's voxels (Uint8Array CS³, index x + CS*(y + CS*z), chunk origin X0/Y0/Z0 in voxels).
 */
export function stampPrologue(f, vox, X0, Y0, Z0, CS) {
  const L = prologueLayout(f);
  const cx0 = X0 / VOX, cy0 = Y0 / VOX, cz0 = Z0 / VOX, cx1 = (X0 + CS) / VOX, cy1 = (Y0 + CS) / VOX, cz1 = (Z0 + CS) / VOX;
  // each of the layout's boxes this chunk touches (a voxel in two boxes is classified twice: harmless)
  for (const bx of boxes(L)) {
    if (bx[3] < cx0 || bx[0] > cx1 || bx[4] < cy0 || bx[1] > cy1 || bx[5] < cz0 || bx[2] > cz1) continue;
    const a0 = Math.max(0, Math.floor(bx[0] * VOX) - X0), a1 = Math.min(CS, Math.ceil(bx[3] * VOX) - X0);
    const b0 = Math.max(0, Math.floor(bx[1] * VOX) - Y0), b1 = Math.min(CS, Math.ceil(bx[4] * VOX) - Y0);
    const c0 = Math.max(0, Math.floor(bx[2] * VOX) - Z0), c1 = Math.min(CS, Math.ceil(bx[5] * VOX) - Z0);
    for (let z = c0; z < c1; z++) for (let y = b0; y < b1; y++) for (let x = a0; x < a1; x++) {
      const vi = x + CS * (y + CS * z);
      const cur = vox[vi];
      if (cur === M.BEDROCK || cur === M.BURROW || cur === M.TIMBER || cur === M.BOARDS || cur === M.LANTERN) continue;
      const xm = (X0 + x + 0.5) / VOX, ym = (Y0 + y + 0.5) / VOX, zm = (Z0 + z + 0.5) / VOX;
      const m = classify(L, xm, ym, zm, _out);
      if (m >= 0) vox[vi] = m;
      // the shell: air, fluids and anything that pours (sand, gravel) become earth, so nothing
      // runs or trickles into the dig
      else if (_out.shell && cur < ORE_BASE && (cur === 0 || cur >= 40 || granM(cur))) vox[vi] = ym - L.o.y > 1.4 ? M.LOAM : M.DIRT;
    }
  }
  // round the lift room (the generator's) and the start of its trail: sand and gravel there would
  // pour onto the floor the lesson starts on, so they become earth (air and everything else stays)
  const F = firmBox(L);
  if (F[3] < cx0 || F[0] > cx1 || F[4] < cy0 || F[1] > cy1 || F[5] < cz0 || F[2] > cz1) return;
  const a0 = Math.max(0, Math.floor(F[0] * VOX) - X0), a1 = Math.min(CS, Math.ceil(F[3] * VOX) - X0);
  const b0 = Math.max(0, Math.floor(F[1] * VOX) - Y0), b1 = Math.min(CS, Math.ceil(F[4] * VOX) - Y0);
  const c0 = Math.max(0, Math.floor(F[2] * VOX) - Z0), c1 = Math.min(CS, Math.ceil(F[5] * VOX) - Z0);
  for (let z = c0; z < c1; z++) for (let y = b0; y < b1; y++) for (let x = a0; x < a1; x++) {
    const vi = x + CS * (y + CS * z);
    if (granM(vox[vi])) vox[vi] = (Y0 + y + 0.5) / VOX - L.lift.y > 1.4 ? M.LOAM : M.DIRT;
  }
}

/** The box round the lift room where nothing may pour (world meters). */
function firmBox(L) {
  const f = L.lift, o = L.o;
  // kept inside the feature's bounds (the generator's f.bb: y from o.y - 2 to o.y + 4)
  return L.firm ||= [f.x - 2.6, Math.max(o.y - 1.9, f.y - 0.4), f.z - 1.6, f.x + 2.6, Math.min(o.y + 3.9, f.y + 4.2), f.z + 4.2];
}

/** World voxels [vx, vy, vz] of a region where the layout wants material m (cached per key). */
function voxelsWhere(L, key, cx, cy, cz, r, test) {
  L.vox ||= {};
  if (L.vox[key]) return L.vox[key];
  const out = [];
  for (let vz = Math.floor((cz - r) * VOX); vz <= Math.ceil((cz + r) * VOX); vz++)
    for (let vy = Math.floor((cy - r) * VOX); vy <= Math.ceil((cy + r) * VOX); vy++)
      for (let vx = Math.floor((cx - r) * VOX); vx <= Math.ceil((cx + r) * VOX); vx++) {
        if (test(classify(L, (vx + 0.5) / VOX, (vy + 0.5) / VOX, (vz + 0.5) / VOX, _out))) out.push([vx, vy, vz]);
      }
  L.vox[key] = out;
  return out;
}

/** The voxels of the copper lump (world voxel coords), for the lesson's "is it free yet?" checks. */
export function prologueOreVoxels(L) { return voxelsWhere(L, 'ore', L.ore.x, L.ore.y, L.ore.z, L.ore.r * 1.3, (m) => m === L.ore.m); }

/** The voxels of the geode's shell (world voxel coords): when enough are gone, it is open. */
export function prologueGeodeVoxels(L) { return voxelsWhere(L, 'geode', L.geode.x, L.geode.y, L.geode.z, L.geode.r * 1.1, (m) => m === M.GEODE); }

/** Is the point in the dug-out space (ignoring the plug and the pockets)? */
export function prologueCarved(L, x, y, z) { const o = L.o; return carved(L, x, y, z, x - o.x, y - o.y, z - o.z); }

/** What the layout wants at a point (world meters): -1 untouched rock, 0 dug-out air, else a material. */
export function prologueWants(L, x, y, z) { return classify(L, x, y, z, _out); }

/** The layout's bounding boxes [x0, y0, z0, x1, y1, z1] (world meters). */
export function prologueBoxes(L) { return boxes(L); }

/** Is a point in (or within pad of) the chamber, the crawl or the nook? (keeps props and cave dressing out) */
export function prologueInside(L, x, y, z, pad = 0.3) {
  const o = L.o, lx = x - o.x, ly = y - o.y, lz = z - o.z;
  if (ly > -0.5 - pad && ly < 3.2 + pad && lx > -3.2 - pad && lx < 4.2 + pad && lz > -2.7 - pad && lz < 3.35 + pad) return true;
  if (lz > 2.0 - pad) {
    const C = L.crawl;
    for (let i = 0; i < C.length - 1; i++) {
      const d = d2seg(x, z, C[i], C[i + 1]);
      const fy = C[i].y + (C[i + 1].y - C[i].y) * SEG_T;
      if (d < 0.75 + pad && y > fy - 0.4 - pad && y < fy + 1.4 + pad) return true;
    }
    const d = d2seg(x, z, L.corner, L.nook);
    if (d < 0.75 + pad && y > L.nook.y - 0.4 - pad && y < L.nook.y + 1.4 + pad) return true;
    if (Math.abs(x - L.nook.x) < 1.1 + pad && Math.abs(z - L.nook.z) < 0.9 + pad && Math.abs(y - L.nook.y - 0.6) < 1 + pad) return true;
  }
  return false;
}
