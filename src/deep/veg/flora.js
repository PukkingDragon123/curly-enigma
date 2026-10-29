// What grows where in the caves, and how each plant is put together from atlas cards.
//
// A plant is a few textured quads ("cards"): `cross` (n upright cards round the stem), `rosette`
// (fronds on tilted cards bent in 2–3 segments, so they arch and droop), `flat` (lying on the
// ground, seen from above), `hang` (cards hanging from a ceiling), `fan` (fronds out of a wall),
// `tuft` (a cross of cards growing out of a wall, tilted up) and `decal` (flat on a wall).
import { M } from '../materials.js';
import { PXM } from './paint.js';

// spr: atlas sprite name (its variants are picked at random) · lay: layout · n: cards (cross /
// hang / tuft) or fronds [min, max] (rosette / fan) · sc: size range (× the sprite's own size) ·
// len / tilt / droop / segs: fronds (m, radians from the axis, extra tilt per segment, bends) or
// the hanging length range (m) · sway: tip sway (m) · rank: distance cull (1 = always drawn, 'r' =
// thinned out with distance, 'r2' = later) · glow: × the sprite's glowing pixels · light: [r, g, b]
// of the faint glow a patch of these gives off (Vegetation.lights) · h: height to keep clear (m) ·
// r: footprint radius (m) · big: one per 1.6 m · ao: darkening at the root · hang: from a ceiling
export const KINDS = {
  // grasses (rank 'r': thinned out with distance)
  grass: { spr: 'grass', lay: 'cross', n: 3, sc: [0.75, 1.2], sway: 0.05, rank: 'r' },
  grassTall: { spr: 'grassTall', lay: 'cross', n: 3, sc: [0.8, 1.25], sway: 0.1, rank: 'r2', h: 0.5 },
  mossGrass: { spr: 'mossGrass', lay: 'cross', n: 3, sc: [0.7, 1.15], sway: 0.05, rank: 'r', glow: 0.7 },
  paleGrass: { spr: 'paleGrass', lay: 'cross', n: 3, sc: [0.7, 1.1], sway: 0.04, rank: 'r' },
  dryGrass: { spr: 'dryGrass', lay: 'cross', n: 3, sc: [0.75, 1.2], sway: 0.035, rank: 'r' },
  frostGrass: { spr: 'frostGrass', lay: 'cross', n: 3, sc: [0.7, 1.1], sway: 0.01, rank: 'r', glow: 0.6 },
  crystalGrass: { spr: 'crystalGrass', lay: 'cross', n: 3, sc: [0.7, 1.15], sway: 0.012, rank: 'r', glow: 0.8, light: [0.25, 0.55, 0.9] },
  ashGrass: { spr: 'ashGrass', lay: 'cross', n: 2, sc: [0.8, 1.2], sway: 0.025, rank: 'r', glow: 1 },
  voidGrass: { spr: 'voidGrass', lay: 'cross', n: 3, sc: [0.75, 1.2], sway: 0.03, rank: 'r', glow: 0.9, light: [0.5, 0.25, 0.9] },
  fungusGrass: { spr: 'fungusGrass', lay: 'cross', n: 3, sc: [0.75, 1.2], sway: 0.025, rank: 'r', glow: 0.8 },
  // ground cover (flat)
  clover: { spr: 'clover', lay: 'flat', sc: [0.7, 1.05], rank: 'r' },
  cloverGlow: { spr: 'cloverGlow', lay: 'flat', sc: [0.7, 1.0], rank: 'r', glow: 0.8 },
  lichenFrost: { spr: 'lichenFrost', lay: 'flat', sc: [0.6, 1.0], rank: 'r', glow: 0.7 },
  lichenRust: { spr: 'lichenRust', lay: 'flat', sc: [0.6, 1.0], rank: 'r' },
  lichenCrystal: { spr: 'lichenCrystal', lay: 'flat', sc: [0.6, 0.95], rank: 'r', glow: 0.8 },
  litter: { spr: 'litter', lay: 'flat', sc: [0.8, 1.15], rank: 'r' },
  starMoss: { spr: 'starMoss', lay: 'flat', sc: [0.7, 1.1], rank: 'r', glow: 1, light: [0.45, 0.3, 0.9] },
  // ferns and reeds (always drawn)
  fern: { spr: 'frond', lay: 'rosette', n: [5, 8], len: [0.3, 0.52], tilt: [0.5, 0.8], droop: 0.42, segs: 2, sway: 0.08, rank: 1, r: 0.4 },
  fernPale: { spr: 'frondPale', lay: 'rosette', n: [4, 6], len: [0.24, 0.4], tilt: [0.55, 0.85], droop: 0.4, segs: 2, sway: 0.06, rank: 1, r: 0.3 },
  giantFern: { spr: 'giantFrond', lay: 'rosette', n: [6, 9], len: [1.15, 1.75], tilt: [0.32, 0.58], droop: 0.32, segs: 3, sway: 0.13, rank: 1, r: 1.1, big: true },
  horsetail: { spr: 'horsetail', lay: 'cross', n: 2, sc: [0.75, 1.25], sway: 0.07, rank: 1, big: true },
  // fungus and flowers (they glow; patches of them light the rock round about)
  fungusCyan: { spr: 'fungusCyan', lay: 'cross', n: 2, sc: [0.7, 1.3], sway: 0.006, rank: 1, glow: 1, light: [0.2, 0.8, 0.75] },
  fungusViolet: { spr: 'fungusViolet', lay: 'cross', n: 2, sc: [0.7, 1.3], sway: 0.006, rank: 1, glow: 1, light: [0.6, 0.3, 1.0] },
  fungusPink: { spr: 'fungusPink', lay: 'cross', n: 2, sc: [0.7, 1.2], sway: 0.006, rank: 1, glow: 1, light: [1.0, 0.35, 0.7] },
  fungusBlue: { spr: 'fungusBlue', lay: 'cross', n: 2, sc: [0.7, 1.25], sway: 0.006, rank: 1, glow: 1, light: [0.3, 0.55, 1.0] },
  fungusAmber: { spr: 'fungusAmber', lay: 'cross', n: 2, sc: [0.7, 1.15], sway: 0.006, rank: 1, glow: 1, light: [1.0, 0.65, 0.25] },
  fungusBrown: { spr: 'fungusBrown', lay: 'cross', n: 2, sc: [0.7, 1.15], sway: 0.006, rank: 0.85 },
  puffballs: { spr: 'puffballs', lay: 'cross', n: 2, sc: [0.75, 1.2], sway: 0, rank: 0.8, glow: 0.4 },
  // wave 4: mushrooms everywhere (brown caps, red toadstools, ink caps, glowing stalks, buttons)
  brownCap: { spr: 'brownCap', lay: 'cross', n: 2, sc: [0.75, 1.3], sway: 0.004, rank: 0.9 },
  toadstool: { spr: 'toadstool', lay: 'cross', n: 2, sc: [0.7, 1.25], sway: 0.004, rank: 0.95 },
  inkcap: { spr: 'inkcap', lay: 'cross', n: 2, sc: [0.75, 1.2], sway: 0.008, rank: 0.9 },
  glowShroom: { spr: 'glowShroom', lay: 'cross', n: 2, sc: [0.8, 1.35], sway: 0.01, rank: 1, glow: 1, light: [0.3, 0.6, 1.0], h: 0.45 },
  mushTiny: { spr: 'mushTiny', lay: 'cross', n: 2, sc: [0.7, 1.1], sway: 0, rank: 'r', glow: 0.8, light: [0.9, 0.62, 0.3] },
  emberCap: { spr: 'emberCap', lay: 'cross', n: 2, sc: [0.75, 1.2], sway: 0.004, rank: 1, glow: 1, light: [1.0, 0.45, 0.12] },
  frostCap: { spr: 'frostCap', lay: 'cross', n: 2, sc: [0.75, 1.2], sway: 0.002, rank: 1, glow: 0.8, light: [0.45, 0.75, 1.0] },
  pebbles: { spr: 'pebbles', lay: 'flat', sc: [0.7, 1.15], rank: 'r' },
  flowerCyan: { spr: 'flowerCyan', lay: 'cross', n: 2, sc: [0.8, 1.25], sway: 0.06, rank: 1, glow: 1, light: [0.25, 0.8, 0.85] },
  flowerViolet: { spr: 'flowerViolet', lay: 'cross', n: 2, sc: [0.8, 1.25], sway: 0.06, rank: 1, glow: 1, light: [0.65, 0.35, 1.0] },
  flowerPink: { spr: 'flowerPink', lay: 'cross', n: 2, sc: [0.8, 1.2], sway: 0.06, rank: 1, glow: 1, light: [1.0, 0.4, 0.7] },
  flowerEmber: { spr: 'flowerEmber', lay: 'cross', n: 2, sc: [0.8, 1.2], sway: 0.04, rank: 1, glow: 1, light: [1.0, 0.45, 0.12] },
  flowerFrost: { spr: 'flowerFrost', lay: 'cross', n: 2, sc: [0.8, 1.2], sway: 0.02, rank: 1, glow: 1, light: [0.45, 0.75, 1.0] },
  // dry and strange
  thorn: { spr: 'thorn', lay: 'cross', n: 2, sc: [0.8, 1.3], sway: 0.012, rank: 1 },
  stoneRose: { spr: 'stoneRose', lay: 'cross', n: 3, sc: [0.8, 1.2], sway: 0, rank: 0.9 },
  ashWeed: { spr: 'ashWeed', lay: 'cross', n: 2, sc: [0.8, 1.25], sway: 0.03, rank: 1, glow: 1, light: [1.0, 0.4, 0.1] },
  voidTendril: { spr: 'voidTendril', lay: 'cross', n: 2, sc: [0.8, 1.3], sway: 0.05, rank: 1, glow: 1, light: [0.55, 0.3, 1.0] },
  // hanging (len: metres)
  roots: { spr: 'roots', lay: 'hang', n: 2, len: [0.55, 1.15], sway: 0.05, rank: 1, hang: true },
  rootsShort: { spr: 'rootsShort', lay: 'hang', n: 2, len: [0.3, 0.5], sway: 0.035, rank: 1, hang: true },
  vine: { spr: 'vine', lay: 'hang', n: 2, len: [0.6, 1.35], sway: 0.08, rank: 1, hang: true },
  vineBerry: { spr: 'vineBerry', lay: 'hang', n: 2, len: [0.6, 1.3], sway: 0.08, rank: 1, hang: true, glow: 1, light: [0.4, 0.8, 0.9] },
  vineDino: { spr: 'vineDino', lay: 'hang', n: 2, len: [0.8, 1.6], sway: 0.09, rank: 1, hang: true },
  glowVine: { spr: 'glowVine', lay: 'hang', n: 2, len: [0.7, 1.45], sway: 0.08, rank: 1, hang: true, glow: 1, light: [1.0, 0.66, 0.28] },
  mossDrape: { spr: 'mossDrape', lay: 'hang', n: 2, len: [0.3, 0.5], sway: 0.03, rank: 1, hang: true, glow: 0.6 },
  rootDrape: { spr: 'rootDrape', lay: 'hang', n: 2, len: [0.22, 0.36], sway: 0.025, rank: 1, hang: true },
  mycel: { spr: 'mycel', lay: 'hang', n: 2, len: [0.4, 0.85], sway: 0.05, rank: 1, hang: true, glow: 1, light: [0.6, 0.35, 1.0] },
  mycelCyan: { spr: 'mycelCyan', lay: 'hang', n: 2, len: [0.35, 0.65], sway: 0.05, rank: 1, hang: true, glow: 1, light: [0.25, 0.8, 0.8] },
  rime: { spr: 'rime', lay: 'hang', n: 2, len: [0.22, 0.36], sway: 0.004, rank: 1, hang: true, glow: 0.7 },
  voidHang: { spr: 'voidHang', lay: 'hang', n: 2, len: [0.4, 0.65], sway: 0.05, rank: 1, hang: true, glow: 1 },
  // walls
  wallFern: { spr: 'frond', lay: 'fan', n: [3, 5], len: [0.24, 0.4], tilt: [0.5, 0.85], droop: 0.5, segs: 2, sway: 0.06, rank: 1 },
  wallFernDino: { spr: 'giantFrond', lay: 'fan', n: [3, 4], len: [0.55, 0.85], tilt: [0.5, 0.8], droop: 0.45, segs: 3, sway: 0.09, rank: 1 },
  wallGrass: { spr: 'grass', lay: 'tuft', n: 2, sc: [0.45, 0.75], sway: 0.04, rank: 'r' },
  wallMoss: { spr: 'mossGrass', lay: 'tuft', n: 2, sc: [0.45, 0.75], sway: 0.04, rank: 'r', glow: 0.7 },
  wallPale: { spr: 'paleGrass', lay: 'tuft', n: 2, sc: [0.45, 0.7], sway: 0.03, rank: 'r' },
  wallFungus: { spr: 'fungusAmber', lay: 'tuft', n: 2, sc: [0.55, 0.85], sway: 0, rank: 1, glow: 1, light: [1.0, 0.65, 0.25] },
  wallMush: { spr: 'mushTiny', lay: 'tuft', n: 2, sc: [0.6, 0.9], sway: 0, rank: 1, glow: 0.8, light: [0.9, 0.62, 0.3] },
  wallBrown: { spr: 'brownCap', lay: 'tuft', n: 2, sc: [0.5, 0.75], sway: 0, rank: 0.9 },
  wallLichenRust: { spr: 'lichenRust', lay: 'decal', sc: [0.45, 0.7], rank: 'r' },
  wallLichenFrost: { spr: 'lichenFrost', lay: 'decal', sc: [0.45, 0.7], rank: 'r', glow: 0.7 },
  wallLichenCrystal: { spr: 'lichenCrystal', lay: 'decal', sc: [0.45, 0.7], rank: 'r', glow: 0.9 },
  wallStar: { spr: 'starMoss', lay: 'decal', sc: [0.45, 0.7], rank: 'r', glow: 1 },
};

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
/**
 * Lay a plant's cards into the writer w (Vegetation's staging buffer). The plant's constants go in
 * first (w.begin(glow, sway, rank, tint r, g, b, flutter phase)), then each card:
 * w.quad(base xyz, side xyz (full width), up xyz (root → tip), u0, v at the root, u1, v at the tip,
 * bend at the root, bend at the tip, ao at the root, ao at the tip).
 * P: { x, y, z, yaw, r (rng), nx, nz (wall normal), room (hanging length available, m), K (kind),
 * spr (atlas entry) }. Returns the plant's rough radius and height (out.rad, out.h).
 */
export function layPlant(w, P, out) {
  const { K, spr, r } = P;
  const sw = spr.w / PXM, sh = spr.h / PXM;
  const sc = K.sc ? lerp(K.sc[0], K.sc[1], r()) : 1;
  const tint = 0.9 + r() * 0.2;
  const rank = K.rank === 'r' ? r() * 0.92 : K.rank === 'r2' ? 0.35 + r() * 0.6 : K.rank;
  w.begin(K.glow || 0, K.sway || 0, rank, tint * (0.96 + r() * 0.08), tint * (0.96 + r() * 0.08), tint * (0.96 + r() * 0.08), r());
  const u0 = spr.u0, u1 = spr.u1, vb = spr.vb, vt = spr.vt;
  const ao = K.ao ?? 0.42;
  const { x, y, z } = P;
  const lay = K.lay;
  if (lay === 'cross' || lay === 'hang') {
    const hang = lay === 'hang';
    let W = sw * sc, H = sh * sc;
    if (hang) { const L = Math.min(P.room, lerp(K.len[0], K.len[1], r())); W = sw * (L / sh); H = L; }
    const n = K.n || 2;
    for (let i = 0; i < n; i++) {
      const a = P.yaw + (i * Math.PI) / n + (r() - 0.5) * 0.25;
      const tx = (r() - 0.5) * 0.12, tz = (r() - 0.5) * 0.12; // a little lean
      const ca = Math.cos(a) * W, sa = Math.sin(a) * W;
      // hanging sprites have their root on the top row
      if (hang) w.quad(x, y, z, ca, 0, sa, tx * H * 0.5, -H, tz * H * 0.5, u0, vt, u1, vb, 0, 1, 0.7, 1);
      else w.quad(x, y, z, ca, 0, sa, tx * H, H, tz * H, u0, vb, u1, vt, 0, 1, ao, 1);
    }
    out.rad = W * 0.5; out.h = H;
    return out;
  }
  if (lay === 'flat') {
    const W = sw * sc, a = P.yaw, c = Math.cos(a) * W, s = Math.sin(a) * W;
    // side (c, 0, s), up (-s, 0, c): centred on the spot, a hair above the ground
    w.quad(x + s * 0.5, y + 0.004 + r() * 0.004, z - c * 0.5, c, 0, s, -s, 0, c, u0, vb, u1, vt, 0, 0, 0.85, 0.85);
    out.rad = W * 0.5; out.h = 0.01;
    return out;
  }
  const nx = P.nx || 0, nz = P.nz || 0, tx = -nz, tz = nx; // wall normal and the way along the wall
  if (lay === 'decal') {
    // flat on a wall face with a random spin in its plane
    const W = sw * sc, a = r() * Math.PI * 2, c = Math.cos(a) * W, s = Math.sin(a) * W;
    const sx = tx * c, sy = s, sz = tz * c, ux = -tx * s, uy = c, uz = -tz * s;
    w.quad(x + nx * 0.004 - ux * 0.5, y - uy * 0.5, z + nz * 0.004 - uz * 0.5, sx, sy, sz, ux, uy, uz, u0, vb, u1, vt, 0, 0, 0.85, 0.85);
    out.rad = W * 0.5; out.h = W;
    return out;
  }
  if (lay === 'tuft') {
    // a cross of cards growing out of a wall, tilted up and out
    const W = sw * sc, H = sh * sc;
    for (let i = 0; i < (K.n || 2); i++) {
      const a = (i - 0.5) * 1.3 + (r() - 0.5) * 0.3;
      const sx = tx * Math.cos(a) + nx * Math.sin(a) * 0.5, sz = tz * Math.cos(a) + nz * Math.sin(a) * 0.5;
      const sl = W / (Math.hypot(sx, sz) || 1);
      w.quad(x - nx * 0.01, y - 0.02, z - nz * 0.01, sx * sl, 0, sz * sl, nx * 0.69 * H, 0.72 * H, nz * 0.69 * H, u0, vb, u1, vt, 0, 1, ao + 0.1, 1);
    }
    out.rad = W * 0.5; out.h = H;
    return out;
  }
  // rosette (floor) / fan (wall): fronds on cards bent in segments
  const n = K.n[0] + Math.floor(r() * (K.n[1] - K.n[0] + 1));
  const segs = K.segs || 2;
  let maxR = 0, maxH = 0;
  const wall = lay === 'fan';
  for (let i = 0; i < n; i++) {
    // the frond's heading round the axis (up, or leaning out of a wall)
    let dx, dz, ax = 0, ay = 1, az = 0;
    if (wall) {
      const a = ((i + 0.5) / n - 0.5) * 2.2 + (r() - 0.5) * 0.3;
      dx = nx * Math.cos(a) + tx * Math.sin(a); dz = nz * Math.cos(a) + tz * Math.sin(a);
      ax = nx * 0.55; ay = 0.83; az = nz * 0.55;
    } else {
      const a = P.yaw + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.5;
      dx = Math.cos(a); dz = Math.sin(a);
    }
    const len = lerp(K.len[0], K.len[1], r()) * (wall ? 1 : 0.85 + r() * 0.3);
    let tilt = lerp(K.tilt[0], K.tilt[1], r());
    const cw = len * (sw / sh); // the card's width follows the sprite's proportions
    let px = x, py = y, pz = z;
    // sideways: the tangent round the axis (axis × heading)
    let sxv = ay * dz, syv = az * dx - ax * dz, szv = -ay * dx;
    const sl = cw / (Math.hypot(sxv, syv, szv) || 1);
    sxv *= sl; syv *= sl; szv *= sl;
    const L = len / segs;
    for (let s = 0; s < segs; s++) {
      // grow along the axis tilted out toward the heading, drooping more each segment
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      let gx = ax * ct + dx * st, gy = ay * ct, gz = az * ct + dz * st;
      const gl = L / (Math.hypot(gx, gy, gz) || 1);
      gx *= gl; gy *= gl; gz *= gl;
      const t0 = s / segs, t1 = (s + 1) / segs;
      w.quad(px, py, pz, sxv, syv, szv, gx, gy, gz, u0, vb + (vt - vb) * t0, u1, vb + (vt - vb) * t1, t0, t1, s === 0 ? (wall ? 0.6 : ao) : 1, 1);
      px += gx; py += gy; pz += gz;
      tilt += K.droop * (0.8 + r() * 0.4);
      const rr = Math.hypot(px - x, pz - z);
      if (rr > maxR) maxR = rr;
      if (py - y > maxH) maxH = py - y;
    }
  }
  out.rad = maxR; out.h = maxH;
  return out;
}
