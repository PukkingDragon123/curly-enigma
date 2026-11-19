// (wave 19) How big everything down the mine is, seen from a mole's eye ("animals and monsters a
// lot smaller, worms super tiny"). Every creature is still modelled at its own voxel and size; this
// table scales the whole body (base.js applyScale, called by Enemies.add) and everything tied to its
// size goes with it: hitbox and collider, attack reach, body-relative AI distances, spawn spacing,
// marker heights, particle sizes, camera shake, pick and catch reach, loot drops.
//
//   species id     h      target height in m (worms: their length; bats: hanging, wings folded)
//                  base   the model's height at scale 1 (measured in the game, wave 19)
//                  → K = h / base, and rel = h / the mole's eye height (0.72 m)
//
//   tiny   (a few cm: worms, grubs, beetles, little crawlers)         rel ≈ 0.05–0.1
//   small  (a mole's paw to a mole's head: bats, spiders, slimes, …)  rel ≈ 0.15–0.45
//   mid    (mole-sized or a bit bigger: kobolds, imps, raptors, …)    rel ≈ 1–2.3   K = 1
//   big    (troll, golems, mole-bear, elk, tyrant, the kaiju)          rel ≈ 1.4–17  K = 1
//
// Distances in the code fall in two kinds. Body lengths (a bite's reach, a hop, a hitbox, spacing
// in a band, a marker over the head, a puff of dust) scale with K. Distances about the mole (how
// far it sees, when it notices you, how far it flees) stay, because the mole didn't shrink; melee
// ranges measured centre to centre keep the mole's half width (gapK).
//
// The voxel side of it (src/gfx/voxRes.js, creature rule): a scaled creature keeps its voxel count,
// so a 4 cm beetle is built of as many voxels as when it was drawn, each K times finer, and its
// level of detail goes by how big it looks (hires.js: distance / K). Hand-drawn first: those finer
// voxels keep the flat colours it was drawn in (no fur, scale or crack jitter on its near copy, no
// texel grain), and its dust is fewer, smaller bits, not sparkle.

/** The mole (deep/Player.js): standing height and eye height, m. */
export const MOLE = { h: 0.86, eye: 0.72, r: 0.24 };

export const SIZE_CLASS = { tiny: 'tiny', small: 'small', mid: 'mid', big: 'big' };

/** species id → { h (target m), base (model m at scale 1), cls } */
export const SIZE_TABLE = {
  // tiny: a few cm
  earthworm: { h: 0.09, base: 0.627, cls: 'tiny' }, // length out of the wall
  glow_beetle: { h: 0.035, base: 0.221, cls: 'tiny' },
  ore_slug: { h: 0.045, base: 0.271, cls: 'tiny' },
  crystal_spider: { h: 0.04, base: 0.25, cls: 'tiny' },
  blind_fish: { h: 0.07, base: 0.356, cls: 'tiny' },
  frost_shrimp: { h: 0.06, base: 0.3, cls: 'tiny' },
  rock_crab: { h: 0.07, base: 0.334, cls: 'tiny' },
  // small: a mole's paw to a mole's head
  dust_bunny: { h: 0.15, base: 0.516, cls: 'small' }, // ears up
  shade_bat: { h: 0.13, base: 0.397, cls: 'small' }, // hanging, wings folded (≈ 0.26 m wingspan)
  gem_tortoise: { h: 0.14, base: 0.416, cls: 'small' },
  void_wisp: { h: 0.15, base: 0.479, cls: 'small' },
  pebble_mimic: { h: 0.17, base: 0.549, cls: 'small' },
  cave_spider: { h: 0.2, base: 0.78, cls: 'small' }, // body; its knees ride up to ≈ 0.3 m, ≈ 0.4 m across the legs
  cave_slime: { h: 0.22, base: 0.633, cls: 'small' }, // per unit of its own size: 0.12 / 0.19 / 0.3 m by tier
  gloom_wisp: { h: 0.2, base: 0.593, cls: 'small' },
  spore_puffer: { h: 0.3, base: 0.618, cls: 'small' },
  crystal_wyrm: { h: 0.26, base: 0.4, cls: 'small' }, // ≈ 0.55 m long
  // mid: mole-sized or a bit bigger (as they were)
  kobold: { h: 0.87, base: 0.87, cls: 'mid' },
  ember_imp: { h: 0.81, base: 0.81, cls: 'mid' },
  raptor: { h: 1.26, base: 1.26, cls: 'mid' }, // (the tame raptor too: tame/body.js)
  pterosaur: { h: 0.77, base: 0.77, cls: 'mid' },
  shellback: { h: 0.86, base: 0.86, cls: 'mid' },
  ruin_wraith: { h: 1.61, base: 1.61, cls: 'mid' },
  cave_drake: { h: 1.27, base: 1.27, cls: 'mid' },
  // big: meant to loom
  rubble_golem: { h: 0.98, base: 0.98, cls: 'big' },
  crystal_golem: { h: 1.86, base: 1.86, cls: 'big' },
  cave_troll: { h: 2.33, base: 2.33, cls: 'big' },
  mole_bear: { h: 1.81, base: 1.81, cls: 'big' },
  cave_elk: { h: 3.19, base: 3.19, cls: 'big' },
  tyrant: { h: 2.92, base: 2.92, cls: 'big' },
  crystal_titan: { h: 9, base: 9, cls: 'big' },
  fungal_colossus: { h: 12, base: 12, cls: 'big' },
};

/** ?sizes=0 turns the table off (A/B shots): every creature at the size it was modelled at. */
export const SIZES_ON = !(typeof location !== 'undefined' && /[?&]sizes=0/.test(location.search || ''));

const K_OF = {};
for (const [id, s] of Object.entries(SIZE_TABLE)) K_OF[id] = SIZES_ON ? s.h / s.base : 1;

/** The scale a species is drawn at (1 for anything not in the table). */
export function scaleOf(id) { return K_OF[id] ?? 1; }

/** Model key prefix (Enemies.geo) → species id, for the models built outside a creature. */
const KEY_SPECIES = {
  worm: 'earthworm', bunny: 'dust_bunny', beetle: 'glow_beetle', fish: 'blind_fish', shrimp: 'frost_shrimp',
  tortoise: 'gem_tortoise', crab: 'rock_crab', slug: 'ore_slug', voidwisp: 'void_wisp', bat: 'shade_bat',
  slime: 'cave_slime', mimic: 'pebble_mimic', wisp: 'gloom_wisp', puffer: 'spore_puffer', wyrm: 'crystal_wyrm',
};
/** The scale of the creature a model key belongs to ('spider' alone is the crystal spider, 'spider|…' the cave spider). */
export function scaleOfKey(key) {
  const k = String(key);
  if (k === 'spider') return scaleOf('crystal_spider');
  const p = k.split('|')[0];
  if (p === 'spider') return scaleOf('cave_spider');
  return KEY_SPECIES[p] ? scaleOf(KEY_SPECIES[p]) : 1;
}

/**
 * A melee distance measured from the creature's centre to the mole's (an attack's range, how close
 * it comes before it swings): the gap between the two bodies scales, the mole's half width doesn't.
 * kk: how much of the scale to apply (1 = all of it; leaps and lunges use √K: small things jump far).
 */
export function gapK(d, K, kk = 1) {
  if (K >= 1 || !(d > MOLE.r)) return d;
  const k = kk === 1 ? K : Math.pow(K, kk);
  return MOLE.r + (d - MOLE.r) * k;
}

/** Particle size factor for a creature at scale K (never below a visible voxel). */
export function fxSizeK(K) { return K >= 1 ? 1 : Math.max(0.2, K); }
/** Particle speed factor: small bodies throw their bits slower (Froude: √K). */
export function fxSpeedK(K) { return K >= 1 ? 1 : Math.sqrt(K); }
/** How hard its blows, slams and blocked hits shake the camera (a beetle doesn't jolt the world). */
export function heftK(K) { return K >= 1 ? 1 : 0.25 + 0.75 * K; }
/** Marker scale: how far over its head a "!" or a word floats, and how big. */
export function markK(K) { return K >= 1 ? 1 : 0.45 + 0.55 * K; }
/**
 * The pick radius for aiming at it (pick blows, grab, net, brush): tiny things get a generous one so
 * they stay clickable, catchable and hittable (m, on top of its hit sphere).
 */
export function pickR(K) { return K >= 1 ? 0 : Math.min(0.16, 0.1 + 0.06 * (1 - K) / 0.85); }

/** Smallest particle edge (m) a scaled creature throws: still a visible voxel. */
export const FX_MIN = 0.004;

/**
 * A particle system seen through a creature's scale: every particle it spawns (directly or through
 * the presets: dust, sparks, embers…) is K× the size and √K× the speed. Everything else (lod, the
 * other presets' own fields) reads through to the shared system.
 */
export function scaledFx(fx, K) {
  if (!fx || K >= 1) return fx;
  const ks = fxSizeK(K), kv = fxSpeedK(K);
  const p = Object.create(fx);
  p.k = ks;
  p.spawn = (o) => {
    o.size = Math.max(FX_MIN, (o.size || 0.03) * ks);
    if (o.grow) o.grow *= ks;
    if (o.vx) o.vx *= kv;
    if (o.vy) o.vy *= kv;
    if (o.vz) o.vz *= kv;
    return fx.spawn(o);
  };
  return p;
}

/** The size table as rows (docs, tests, the report): [{ id, cls, h, rel, K }]. */
export function sizeRows() {
  return Object.entries(SIZE_TABLE).map(([id, s]) => ({ id, cls: s.cls, h: s.h, rel: +(s.h / MOLE.eye).toFixed(3), K: +(s.h / s.base).toFixed(3) }));
}

/** Speed factor for a small body walking, hopping, swimming (√K: small legs, small strides). */
export function walkK(K) { return K >= 1 ? 1 : Math.sqrt(K); }
