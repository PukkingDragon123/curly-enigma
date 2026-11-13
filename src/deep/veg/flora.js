// What grows where in the caves, and how each plant is placed from its voxel model.
//
// Every plant is a voxel model (./plants.js, packed into boxes by ./vox.js): a few variants per
// kind, built on first use. Layouts: `cross` (standing on the floor), `rosette` (a fern's fronds:
// standing, needs room round it), `flat` (lying on the ground), `hang` (from a ceiling, cut to the
// room below it), `fan` / `tuft` (out of a wall) and `decal` (a patch on a wall).
import { M } from '../materials.js';
import { protos } from './plants.js';

// lay: layout · sc: size range (the voxel shrinks or grows with it, within 1/48–1/64 m) · div:
// voxels per metre at size 1 (56; the giant ferns are coarser) · v: variants · len: rosette frond
// length (m, for the room check) or the hanging length range (m) · sway: tip sway (m) · push: how
// far the mole parts it (0..1) · rank: distance cull (1 = always drawn, 'r' = thinned out with
// distance, 'r2' = later) · glow: × the model's glowing voxels · light: [r, g, b] of the faint glow
// a patch of these gives off (Vegetation.lights) · h: height to keep clear (m) · r: footprint
// radius (m) · big: one per 1.6 m · hang: from a ceiling
export const KINDS = {
  // grasses (rank 'r': thinned out with distance)
  grass: { lay: 'cross', sc: [0.85, 1.15], v: 3, sway: 0.05, rank: 'r' },
  grassTall: { lay: 'cross', sc: [0.85, 1.15], sway: 0.1, rank: 'r2', h: 0.5 },
  mossGrass: { lay: 'cross', sc: [0.85, 1.15], v: 3, sway: 0.05, rank: 'r', glow: 0.7 },
  paleGrass: { lay: 'cross', sc: [0.85, 1.1], sway: 0.04, rank: 'r' },
  dryGrass: { lay: 'cross', sc: [0.85, 1.15], sway: 0.035, rank: 'r' },
  frostGrass: { lay: 'cross', sc: [0.85, 1.1], sway: 0.01, rank: 'r', glow: 0.6 },
  crystalGrass: { lay: 'cross', sc: [0.85, 1.15], sway: 0.012, rank: 'r', glow: 0.8, light: [0.25, 0.55, 0.9] },
  ashGrass: { lay: 'cross', sc: [0.9, 1.15], sway: 0.025, rank: 'r', glow: 1 },
  voidGrass: { lay: 'cross', sc: [0.85, 1.15], sway: 0.03, rank: 'r', glow: 0.9, light: [0.5, 0.25, 0.9] },
  fungusGrass: { lay: 'cross', sc: [0.85, 1.15], sway: 0.025, rank: 'r', glow: 0.8 },
  // ground cover (flat)
  clover: { lay: 'flat', sc: [0.85, 1.1], rank: 'r', push: 0.2 },
  cloverGlow: { lay: 'flat', sc: [0.85, 1.05], rank: 'r', glow: 0.8, push: 0.2 },
  lichenFrost: { lay: 'flat', sc: [0.8, 1.05], rank: 'r', glow: 0.7, push: 0 },
  lichenRust: { lay: 'flat', sc: [0.8, 1.05], rank: 'r', push: 0 },
  lichenCrystal: { lay: 'flat', sc: [0.8, 1.0], rank: 'r', glow: 0.8, push: 0 },
  litter: { lay: 'flat', sc: [0.85, 1.15], rank: 'r', push: 0.1 },
  starMoss: { lay: 'flat', sc: [0.85, 1.1], rank: 'r', glow: 1, light: [0.45, 0.3, 0.9], push: 0 },
  // ferns and reeds (always drawn)
  fern: { lay: 'rosette', len: [0.3, 0.52], sc: [0.9, 1.15], sway: 0.08, rank: 1, r: 0.4 },
  fernPale: { lay: 'rosette', len: [0.24, 0.4], sc: [0.9, 1.1], sway: 0.06, rank: 1, r: 0.3 },
  giantFern: { lay: 'rosette', len: [1.15, 1.75], sc: [0.9, 1.1], div: 32, sway: 0.13, rank: 1, r: 1.1, big: true },
  horsetail: { lay: 'cross', sc: [0.8, 1.2], div: 50, sway: 0.07, rank: 1, big: true },
  // fungus and flowers (they glow; patches of them light the rock round about)
  fungusCyan: { lay: 'cross', sc: [0.85, 1.15], sway: 0.006, rank: 1, glow: 1, light: [0.2, 0.8, 0.75], push: 0.3 },
  fungusViolet: { lay: 'cross', sc: [0.85, 1.15], sway: 0.006, rank: 1, glow: 1, light: [0.6, 0.3, 1.0], push: 0.3 },
  fungusPink: { lay: 'cross', sc: [0.85, 1.1], sway: 0.006, rank: 1, glow: 1, light: [1.0, 0.35, 0.7], push: 0.3 },
  fungusBlue: { lay: 'cross', sc: [0.85, 1.15], sway: 0.006, rank: 1, glow: 1, light: [0.3, 0.55, 1.0], push: 0.3 },
  fungusAmber: { lay: 'cross', sc: [0.85, 1.1], sway: 0.006, rank: 1, glow: 1, light: [1.0, 0.65, 0.25], push: 0.3 },
  fungusBrown: { lay: 'cross', sc: [0.85, 1.1], sway: 0.006, rank: 0.85, push: 0.3 },
  puffballs: { lay: 'cross', sc: [0.85, 1.15], sway: 0, rank: 0.8, glow: 0.4, push: 0.15 },
  // wave 4: mushrooms everywhere (brown caps, red toadstools, ink caps, glowing stalks, buttons)
  brownCap: { lay: 'cross', sc: [0.85, 1.15], v: 3, sway: 0.004, rank: 0.9, push: 0.25 },
  toadstool: { lay: 'cross', sc: [0.85, 1.15], v: 3, sway: 0.004, rank: 0.95, push: 0.25 },
  inkcap: { lay: 'cross', sc: [0.85, 1.1], sway: 0.008, rank: 0.9, push: 0.3 },
  glowShroom: { lay: 'cross', sc: [0.9, 1.15], v: 3, sway: 0.01, rank: 1, glow: 1, light: [0.3, 0.6, 1.0], h: 0.45, push: 0.35 },
  mushTiny: { lay: 'cross', sc: [0.85, 1.1], v: 3, sway: 0, rank: 'r', glow: 0.8, light: [0.9, 0.62, 0.3], push: 0.15 },
  emberCap: { lay: 'cross', sc: [0.85, 1.1], sway: 0.004, rank: 1, glow: 1, light: [1.0, 0.45, 0.12], push: 0.25 },
  frostCap: { lay: 'cross', sc: [0.85, 1.1], sway: 0.002, rank: 1, glow: 0.8, light: [0.45, 0.75, 1.0], push: 0.25 },
  pebbles: { lay: 'flat', sc: [0.85, 1.15], v: 3, rank: 'r', push: 0 },
  flowerCyan: { lay: 'cross', sc: [0.9, 1.15], sway: 0.06, rank: 1, glow: 1, light: [0.25, 0.8, 0.85] },
  flowerViolet: { lay: 'cross', sc: [0.9, 1.15], sway: 0.06, rank: 1, glow: 1, light: [0.65, 0.35, 1.0] },
  flowerPink: { lay: 'cross', sc: [0.9, 1.1], sway: 0.06, rank: 1, glow: 1, light: [1.0, 0.4, 0.7] },
  flowerEmber: { lay: 'cross', sc: [0.9, 1.1], sway: 0.04, rank: 1, glow: 1, light: [1.0, 0.45, 0.12] },
  flowerFrost: { lay: 'cross', sc: [0.9, 1.1], sway: 0.02, rank: 1, glow: 1, light: [0.45, 0.75, 1.0] },
  // dry and strange
  thorn: { lay: 'cross', sc: [0.9, 1.15], sway: 0.012, rank: 1, push: 0.4 },
  stoneRose: { lay: 'cross', sc: [0.9, 1.1], sway: 0, rank: 0.9, push: 0.1 },
  ashWeed: { lay: 'cross', sc: [0.9, 1.15], sway: 0.03, rank: 1, glow: 1, light: [1.0, 0.4, 0.1] },
  voidTendril: { lay: 'cross', sc: [0.9, 1.15], sway: 0.05, rank: 1, glow: 1, light: [0.55, 0.3, 1.0] },
  // hanging (len: metres)
  roots: { lay: 'hang', len: [0.55, 1.15], sway: 0.05, rank: 1, hang: true },
  rootsShort: { lay: 'hang', len: [0.3, 0.5], sway: 0.035, rank: 1, hang: true },
  vine: { lay: 'hang', len: [0.6, 1.35], sway: 0.08, rank: 1, hang: true },
  vineBerry: { lay: 'hang', len: [0.6, 1.3], sway: 0.08, rank: 1, hang: true, glow: 1, light: [0.4, 0.8, 0.9] },
  vineDino: { lay: 'hang', len: [0.8, 1.6], sway: 0.09, rank: 1, hang: true },
  glowVine: { lay: 'hang', len: [0.7, 1.45], sway: 0.08, rank: 1, hang: true, glow: 1, light: [1.0, 0.66, 0.28] },
  mossDrape: { lay: 'hang', len: [0.3, 0.5], sway: 0.03, rank: 1, hang: true, glow: 0.6 },
  rootDrape: { lay: 'hang', len: [0.22, 0.36], sway: 0.025, rank: 1, hang: true },
  mycel: { lay: 'hang', len: [0.4, 0.85], sway: 0.05, rank: 1, hang: true, glow: 1, light: [0.6, 0.35, 1.0] },
  mycelCyan: { lay: 'hang', len: [0.35, 0.65], sway: 0.05, rank: 1, hang: true, glow: 1, light: [0.25, 0.8, 0.8] },
  rime: { lay: 'hang', len: [0.22, 0.36], sway: 0.004, rank: 1, hang: true, glow: 0.7 },
  voidHang: { lay: 'hang', len: [0.4, 0.65], sway: 0.05, rank: 1, hang: true, glow: 1 },
  // walls
  wallFern: { lay: 'fan', sc: [0.9, 1.15], sway: 0.06, rank: 1 },
  wallFernDino: { lay: 'fan', sc: [0.9, 1.1], div: 40, sway: 0.09, rank: 1 },
  wallGrass: { lay: 'tuft', sc: [0.85, 1.15], sway: 0.04, rank: 'r' },
  wallMoss: { lay: 'tuft', sc: [0.85, 1.15], sway: 0.04, rank: 'r', glow: 0.7 },
  wallPale: { lay: 'tuft', sc: [0.85, 1.1], sway: 0.03, rank: 'r' },
  wallFungus: { lay: 'tuft', sc: [0.9, 1.15], sway: 0, rank: 1, glow: 1, light: [1.0, 0.65, 0.25], push: 0 },
  wallMush: { lay: 'tuft', sc: [0.9, 1.15], sway: 0, rank: 1, glow: 0.8, light: [0.9, 0.62, 0.3], push: 0.1 },
  wallBrown: { lay: 'tuft', sc: [0.85, 1.1], sway: 0, rank: 0.9, push: 0 },
  wallLichenRust: { lay: 'decal', sc: [0.75, 1.0], rank: 'r', push: 0 },
  wallLichenFrost: { lay: 'decal', sc: [0.75, 1.0], rank: 'r', glow: 0.7, push: 0 },
  wallLichenCrystal: { lay: 'decal', sc: [0.75, 1.0], rank: 'r', glow: 0.9, push: 0 },
  wallStar: { lay: 'decal', sc: [0.75, 1.0], rank: 'r', glow: 1, push: 0 },
};
for (const [k, K] of Object.entries(KINDS)) K.m = K.m || k;

/**
 * The flora of a place: { floor, ceil, wall } weighted lists and the chance per placement cell
 * (f: floor cell of 3×3 voxels, c: ceiling cell, w: wall cell) at full fertility.
 * bio: Generator BIOMES (1 mossy grotto, 2 sandstone hollows, 3 mushroom hollow, 4 dino caverns).
 */
const FLORA = new Map();
export function floraOf(zone, bio, depth) {
  const key = zone * 100 + bio * 10 + (depth < 12 ? 1 : 0) + (depth < 20 ? 2 : 0) + (depth < 6 ? 4 : 0);
  let F = FLORA.get(key);
  if (!F) { F = floraTable(zone, bio, depth); F.bio = bio; FLORA.set(key, F); }
  return F;
}
// Wave 4: caves grow mushrooms, not grass. Floors are bare dirt, gravel and pebbles with clumps of
// mushrooms of many kinds (brown caps, red toadstools, ink caps, glowing stalks, buttons); vines
// and roots hang from the roofs (cave vines with glow berries further down); grass only near the
// surface (the first few metres) and, thin, in the lush biomes (the mossy grotto, the dino caverns).
function floraTable(zone, bio, depth) {
  const near = depth < 6; // close to the surface, a little light gets in: a few grass tufts
  if (bio === 1) return {
    floor: [['mossGrass', 2.4], ['clover', 1.2], ['cloverGlow', 1.4], ['fern', 2.2], ['flowerCyan', 1.1], ['flowerViolet', 0.8], ['flowerPink', 0.3], ['fungusCyan', 1.6], ['mushTiny', 2], ['glowShroom', 1.2], ['toadstool', 0.8], ['brownCap', 0.8], ['litter', 0.3]],
    ceil: [['vine', 5], ['vineBerry', 2], ['glowVine', 2], ['mossDrape', 3], ['roots', depth < 20 ? 1 : 0.2]],
    wall: [['wallMoss', 3], ['wallFern', 2.2], ['wallMush', 1.2]],
    f: 0.75, c: 0.26, w: 0.12, rock: 0.75,
  };
  if (bio === 2) return {
    floor: [['pebbles', 3.5], ['dryGrass', 1], ['thorn', 1.3], ['stoneRose', 1.6], ['brownCap', 1], ['inkcap', 0.6]],
    ceil: [['rootsShort', 1], ['rootDrape', 0.6]],
    wall: [['wallLichenRust', 2], ['wallBrown', 0.4]],
    f: 0.2, c: 0.025, w: 0.035,
  };
  if (bio === 3) return {
    floor: [['fungusGrass', 2.5], ['fungusViolet', 3], ['fungusCyan', 2.4], ['fungusBlue', 2], ['fungusPink', 1], ['puffballs', 2], ['glowShroom', 3], ['inkcap', 1.4], ['mushTiny', 2.4], ['toadstool', 1], ['flowerViolet', 0.5], ['fungusAmber', 0.7]],
    ceil: [['mycel', 3], ['mycelCyan', 1.5], ['glowVine', 0.8]],
    wall: [['wallFungus', 2], ['wallMush', 2], ['wallMoss', 0.4]],
    f: 0.8, c: 0.12, w: 0.07, rock: 0.5,
  };
  if (bio === 4) return {
    floor: [['giantFern', 1.6], ['fern', 3], ['horsetail', 2.4], ['grassTall', 1.2], ['grass', 0.8], ['clover', 1.2], ['litter', 1.6], ['flowerPink', 0.45], ['fungusBrown', 1], ['brownCap', 1], ['toadstool', 0.6], ['pebbles', 1]],
    ceil: [['vineDino', 4], ['roots', 1.4], ['vine', 1.2], ['glowVine', 0.6]],
    wall: [['wallFernDino', 2], ['wallFern', 2], ['wallBrown', 0.6]],
    f: 0.75, c: 0.13, w: 0.08, rock: 0.65,
  };
  switch (zone) {
    case 1: return {
      floor: [['brownCap', 3], ['toadstool', 1.5], ['fungusBrown', 2], ['mushTiny', 2.4], ['inkcap', 1], ['fungusBlue', 0.7], ['glowShroom', 0.5], ['puffballs', 1], ['pebbles', 3.2], ['litter', 0.4], ['fern', near ? 1 : 0.35], ['grass', near ? 2.5 : 0.15], ['clover', near ? 0.8 : 0]],
      ceil: depth < 12 ? [['roots', 6], ['rootsShort', 3], ['rootDrape', 1.2], ['vine', 2.6], ['glowVine', 0.5]] : [['roots', 2.5], ['rootsShort', 2.5], ['rootDrape', 1], ['vine', 2.6], ['vineBerry', 0.8], ['glowVine', 0.9]],
      wall: [['wallMush', 1.2], ['wallBrown', 1], ['wallFern', 0.5], ['wallLichenRust', 0.4], ['wallGrass', near ? 1 : 0]],
      f: 0.42, c: depth < 12 ? 0.2 : 0.14, w: 0.05, rock: 0.42,
    };
    case 2: return {
      floor: [['fungusBrown', 2], ['fungusAmber', 1.2], ['brownCap', 2.2], ['mushTiny', 2], ['inkcap', 1.4], ['toadstool', 0.6], ['puffballs', 0.8], ['fernPale', 0.5], ['pebbles', 3.4], ['paleGrass', 0.25]],
      ceil: [['rootsShort', 2], ['roots', 0.8], ['rootDrape', 1], ['vine', 1.4], ['glowVine', 0.7]],
      wall: [['wallLichenRust', 2], ['wallMush', 1.2], ['wallBrown', 0.6], ['wallPale', 0.2]],
      f: 0.3, c: 0.09, w: 0.055,
    };
    case 3: return {
      floor: [['crystalGrass', 1.6], ['fungusCyan', 2], ['fungusBlue', 1.6], ['glowShroom', 1.8], ['mushTiny', 1.2], ['flowerCyan', 0.8], ['flowerViolet', 0.6], ['cloverGlow', 0.4], ['lichenCrystal', 1], ['pebbles', 1.6]],
      ceil: [['mycelCyan', 1.5], ['mycel', 0.5], ['glowVine', 0.8]],
      wall: [['wallLichenCrystal', 2], ['wallMush', 0.5]],
      f: 0.26, c: 0.05, w: 0.04,
    };
    case 4: return {
      floor: [['ashWeed', 3], ['emberCap', 2.2], ['ashGrass', 1], ['flowerEmber', 0.8], ['pebbles', 1]],
      ceil: [],
      wall: [],
      f: 0.18, c: 0, w: 0,
    };
    case 5: return {
      floor: [['lichenFrost', 3], ['frostCap', 2], ['frostGrass', 1.2], ['flowerFrost', 0.7], ['pebbles', 1]],
      ceil: [['rime', 3]],
      wall: [['wallLichenFrost', 2]],
      f: 0.24, c: 0.08, w: 0.05,
    };
    default: return {
      floor: [['voidGrass', 2], ['voidTendril', 2.5], ['starMoss', 2.5]],
      ceil: [['voidHang', 2]],
      wall: [['wallStar', 1]],
      f: 0.2, c: 0.04, w: 0.03,
    };
  }
}

/** Bare rock (where a lush place's moss spreads over it: flora.rock lifts its fertility). */
export const ROCK = new Uint8Array(256);
for (const m of [M.STONE, M.LIMESTONE, M.GRANITE, M.MUDSTONE, M.CLAY, M.BASALT, M.SANDSTONE, M.GRAVEL]) if (m !== undefined) ROCK[m] = 1;

/** How well things grow on a material (floor / ceiling / wall), 0 = never. */
export const FERT = new Float32Array(256);
for (const [m, k] of [
  [M.MOSS, 1], [M.DIRT, 0.8], [M.LOAM, 0.85], [M.ROOTS, 0.6], [M.CLAY, 0.5], [M.MUDSTONE, 0.38], [M.GRAVEL, 0.3], [M.SAND, 0.65],
  [M.MYCEL, 1], [M.STONE, 0.28], [M.LIMESTONE, 0.28], [M.GRANITE, 0.22], [M.SANDSTONE, 0.4], [M.CRYSTALROCK, 0.7], [M.BASALT, 0.45],
  [M.MAGMAROCK, 0.4], [M.ASH, 0.85], [M.OBSIDIAN, 0.15], [M.PERMAFROST, 0.65], [M.SNOW, 0.85], [M.ICE, 0.3], [M.CORE, 0.55],
  [M.STARROCK, 0.65], [M.VOIDROCK, 0.55], [M.GEODE, 0.1], [M.RUBBLE, 0.2],
  // the dungeons' mossy blocks: a little grows on them (moss and vines hang from the roofs)
  [M.DMOSSCOB, 0.3], [M.DMOSSBRICK, 0.25],
]) if (m !== undefined) FERT[m] = k;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** The variants of a kind's model (built on first use), or null. */
export const modelsOf = (K) => protos(K.m, K.v || 2);

/**
 * Lay a plant's boxes into the writer w (Vegetation's staging buffer): the plant's constants first
 * (w.begin(root x, y, z, yaw, rank, flutter, gust, sway, push, voxels per metre, hanging, tint r,
 * g, b, glow)), then each box (w.box(offset xyz, size xyz, r, g, b, glow level, bend at the bottom,
 * at the top)). P: { x, y, z, yaw, r (rng), nx, nz (wall normal), room (hanging length available,
 * m), K (kind) }. Returns the plant's rough radius and height (m) and its colour (out.rad, out.h,
 * out.col).
 */
export function layPlant(w, P, out) {
  const { K, r } = P;
  const list = modelsOf(K);
  const pf = list[Math.floor(r() * list.length)];
  // far chunks (w.lod) take the half-resolution copy: the same plant, the same size, coarser voxels
  const far = !!(w.lod && pf.lod);
  // near: wave 12's twice-as-fine copy once its worker has built it (out.pend: still coarse)
  const pr = far ? pf.lod : pf.fine || pf;
  out.pend = !far && !!pf.wantFine && !pf.fine;
  const sc = K.sc ? lerp(K.sc[0], K.sc[1], r()) : 1;
  const base = K.div || 56;
  // the voxel follows the plant's size: fine plants stay within 1/48–1/64 m
  const lo = base >= 48 ? 48 : base * 0.85, hi = base >= 48 ? 64 : base * 1.2;
  let div = clamp(Math.round(base / sc), lo, hi);
  const tint = 0.9 + r() * 0.2;
  const rank = K.rank === 'r' ? r() * 0.92 : K.rank === 'r2' ? 0.35 + r() * 0.6 : K.rank;
  const wall = K.lay === 'fan' || K.lay === 'tuft' || K.lay === 'decal';
  const yaw = wall ? Math.atan2(P.nx || 0, P.nz || 1) : P.yaw;
  let cut = -1e9, H = pr.H;
  // (a model's copies differ in resolution: rk = voxels per modelled voxel; the far copy is half
  // as fine, wave 12's near copy twice)
  const rk = far ? 0.5 : pr.res || 1;
  if (pr.mode === 'down') {
    // hanging: the voxel picked so the model fits the room under it (cut short where it can't)
    const L = Math.min(P.room ?? 9, lerp(K.len[0], K.len[1], r()));
    div = Math.round(clamp(Math.round(pf.H / L), 48, 64) * rk);
    cut = -Math.round(L * div);
    H = Math.min(pr.H, -cut);
  } else div = Math.round(div * rk);
  let y = P.y;
  if (K.lay === 'flat') y += 0.002;
  w.begin(P.x + (P.nx || 0) * (K.lay === 'decal' ? 0.002 : 0), y, P.z + (P.nz || 0) * (K.lay === 'decal' ? 0.002 : 0), yaw, rank, r(), P.gust ?? 0, K.sway || 0, K.push ?? 1, div, !!K.hang,
    tint * (0.96 + r() * 0.08), tint * (0.96 + r() * 0.08), tint * (0.96 + r() * 0.08), K.glow || 0);
  const { off, size, rgb, glow, bend } = pr;
  for (let i = 0, n = pr.n; i < n; i++) {
    const i3 = i * 3;
    let oy = off[i3 + 1], sy = size[i3 + 1];
    if (oy < cut) {
      if (oy + sy <= cut) continue;
      sy = oy + sy - cut; oy = cut;
    }
    w.box(off[i3], oy, off[i3 + 2], size[i3], sy, size[i3 + 2], rgb[i3], rgb[i3 + 1], rgb[i3 + 2], glow[i], bend[i * 2], bend[i * 2 + 1]);
  }
  out.rad = pr.rad / div; out.h = H / div; out.col = pr.col;
  return out;
}
