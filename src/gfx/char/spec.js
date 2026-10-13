// Character specs: palettes, random townsfolk, the player, and body proportions.
import { makeRng, hashStr, mixHex } from '../../core/util.js';

export const FUR = {
  mole: [0x3a2e2a, 0x45363a, 0x2c2428, 0x55443c, 0x6a5040, 0x4a4048],
  starnose: [0x2e2624, 0x3e302a, 0x4a3a30],
  golden: [0xd8a84a, 0xc89a3a, 0xe0b860],
  molerat: [0xe8b0a8, 0xf0c0b4, 0xe0a49a],
  hedgehog: [0xd8b890, 0xc8a47a, 0xe0c8a0],
  rabbit: [0xece4da, 0xc8a888, 0x8a7060, 0x9a9a9a],
  badger: [0x8a8a8c, 0x7a7a7c],
  armadillo: [0xb8a088, 0xa89078],
  fox: [0xe0782a, 0xd0682a],
  frog: [0x6ac04a, 0x5ab060, 0x8ac04a],
  shrew: [0x7a6050, 0x6a5246],
  vole: [0x8a6a4a, 0x9a7a5a, 0x7a5a3a],
};
export const SPECIES = Object.keys(FUR);
export const SKIN_PINK = 0xf0a0a8;
export const CLAW = 0xf2ead8;
export const OUTFIT_COLORS = [0x3a6a9a, 0x5a7a3a, 0x8a3a2a, 0x7a5a3a, 0x4a4a6a, 0xa86a2a, 0x2a5a5a, 0x6a3a6a, 0xb8a070, 0x9a2a3a];
export const PATCH_COLORS = [0xb8864a, 0x8a3a2a, 0x6a7a3a, 0xc8a070, 0x4a4a6a, 0xa85a3a, 0x7a5a8a];

/** Species with the big pink spade paws. */
export const DIGGERS = new Set(['mole', 'starnose', 'golden', 'molerat']);

/**
 * Character spec (all optional):
 * { species, age: baby|kid|adult|elder, body: slim|normal|chubby|tall|stocky, fur, eyes: dot|bead|tall|sleepy|happy|wide,
 *   outfit: none|overalls|apron|vest|suit|shirt|dress, outfitColor, hat: none|helmet|hardhat|tophat|cap|bandana|beanie|bow,
 *   hatColor, glasses: bool|'monocle', scarf: color|null, dirt: 0..1, blush: bool, brows: none|bushy|angry|worried, cane: bool,
 *   backpack: bool, seed,
 *   // optional extras (random defaults from randomSpec):
 *   patches: 0..3 sewn-on outfit patches, freckles: bool, earring: false|color, tuft: bool (a cowlick, hidden by hats),
 *   fabric: plain|stripe|dots|plaid, eyeColor: color tint of the iris reflection, player: bool }
 */
export function randomSpec(seed, overrides = {}) {
  const rng = makeRng(typeof seed === 'string' ? hashStr(seed) : seed);
  const species = overrides.species || (rng.chance(0.62) ? rng.pick(['mole', 'mole', 'mole', 'starnose', 'golden', 'molerat']) : rng.pick(['hedgehog', 'rabbit', 'badger', 'armadillo', 'frog', 'shrew', 'vole']));
  const age = overrides.age || rng.pick(['baby', 'kid', 'kid', 'adult', 'adult', 'adult', 'adult', 'elder', 'elder']);
  const spec = {
    seed: rng.int(1, 1e9),
    species,
    age,
    body: rng.pick(['slim', 'normal', 'normal', 'chubby', 'chubby', 'tall', 'stocky']),
    fur: rng.pick(FUR[species]),
    eyes: rng.pick(['dot', 'bead', 'bead', 'tall', 'sleepy', 'happy', 'wide']),
    outfit: rng.pick(['overalls', 'overalls', 'apron', 'vest', 'shirt', 'dress', 'none']),
    outfitColor: rng.pick(OUTFIT_COLORS),
    hat: rng.pick(['none', 'none', 'helmet', 'hardhat', 'cap', 'bandana', 'beanie', 'bow']),
    hatColor: rng.pick([0xe0b030, 0xd9582a, 0x3a5a3a, 0xc94a3a, 0x3a6ac9, 0xe0e0d8, 0x8a3a8a]),
    glasses: rng.chance(age === 'elder' ? 0.5 : 0.12),
    scarf: rng.chance(0.25) ? rng.pick([0xc94a3a, 0x3a7ac9, 0xe0b030, 0x5ab84a]) : null,
    dirt: rng.range(0.2, 0.9),
    blush: rng.chance(0.5),
    brows: age === 'elder' ? 'bushy' : rng.pick(['none', 'none', 'none', 'angry', 'worried']),
    cane: age === 'elder' && rng.chance(0.5),
    backpack: rng.chance(0.15),
  };
  if (age === 'baby') { spec.hat = rng.pick(['none', 'bow', 'beanie']); spec.outfit = rng.pick(['none', 'shirt', 'overalls']); spec.cane = false; }
  if (age === 'elder') spec.fur = mixHex(spec.fur, 0x9a9a9a, 0.35);
  // extras come from their own stream so existing seeds keep their old look
  const r2 = makeRng((spec.seed ^ 0x5bd1e995) >>> 0);
  spec.patches = r2.pick([0, 0, 0, 1, 1, 1, 2, 2, 3]);
  spec.freckles = r2.chance(0.18);
  spec.earring = age !== 'baby' && r2.chance(0.12) ? r2.pick([0xe8c050, 0xd0d4dc]) : false;
  spec.tuft = r2.chance(age === 'baby' || age === 'kid' ? 0.6 : 0.25);
  spec.fabric = r2.pick(['plain', 'plain', 'plain', 'plain', 'stripe', 'dots', 'plaid']);
  spec.eyeColor = r2.pick([0x5a3a2a, 0x6a4a2a, 0x2a3a6a, 0x3a5a3a, 0x5a2a4a]);
  return { ...spec, ...overrides };
}

/** The player: a very dirty mole in patched overalls and a miner's helmet with a lamp. */
export function playerSpec() {
  return {
    seed: 77, species: 'mole', age: 'adult', body: 'chubby', fur: 0x3a2e2a, eyes: 'bead', outfit: 'overalls',
    outfitColor: 0x3a6a9a, hat: 'helmet', hatColor: 0xe0b030, glasses: false, scarf: 0xc94a3a, dirt: 1, blush: true,
    brows: 'none', cane: false, backpack: false, player: true,
    patches: 3, freckles: false, earring: false, tuft: false, fabric: 'plain', eyeColor: 0x4a3a6a,
  };
}

/**
 * Proportions in OLD units (1 unit = 1/16 world at scale 1); new voxels are half that,
 * so every dimension doubles in the hi-res grids. hw/hh/hd head, bw/bh/bd body (full
 * size), lh leg length, ah arm length. Kept identical to the classic rig so heights,
 * sockets and seat offsets are unchanged.
 */
export function proportions(spec) {
  const age = spec.age || 'adult';
  const body = spec.body || 'normal';
  const p = { hw: 12, hh: 10, hd: 11, bw: 9, bh: 7, bd: 8, lh: 3, lw: 3, aw: 3, ah: 4, scale: 1, hunch: 0 };
  if (body === 'slim') { p.bw = 7; p.bd = 7; }
  if (body === 'chubby') { p.bw = 11; p.bd = 10; p.bh = 8; }
  if (body === 'tall') { p.bh = 9; p.lh = 4; p.bw = 8; }
  if (body === 'stocky') { p.bw = 11; p.bh = 6; p.lh = 2; p.bd = 9; }
  if (age === 'baby') { p.scale = 0.58; p.bh = Math.max(5, p.bh - 3); p.bw = Math.max(7, p.bw - 2); p.lh = 2; p.ah = 3; }
  if (age === 'kid') { p.scale = 0.74; p.bh = Math.max(5, p.bh - 2); p.lh = 2; }
  if (age === 'elder') { p.scale = 0.95; p.hunch = 0.2; }
  if (spec.species === 'frog') { p.hw = 14; p.hh = 8; }
  if (spec.species === 'rabbit' || spec.species === 'fox') { p.lh += 1; }
  return p;
}

/** Fill in defaults for a (possibly partial) spec without mutating it. */
export function normSpec(spec) {
  const sp = FUR[spec.species] ? spec.species : 'mole';
  return {
    seed: 1, age: 'adult', body: 'normal', eyes: 'bead', outfit: 'none', outfitColor: 0x3a6a9a, hat: 'none', hatColor: 0xe0b030,
    glasses: false, scarf: null, dirt: 0.4, blush: false, brows: 'none', cane: false, backpack: false,
    patches: 0, freckles: false, earring: false, tuft: false, fabric: 'plain', eyeColor: 0x4a3a4a,
    ...spec,
    species: sp,
    fur: spec.fur ?? FUR[sp][0],
  };
}
