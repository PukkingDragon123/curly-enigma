// Chibi voxel characters: procedural moles (and friends) with ages, body types, faces,
// fur, dirty outfits, hats and a procedural animation rig.
import * as THREE from 'three';
import { VoxelGrid, voxelMesh, voxelMaterial } from './Voxel.js';
import { makeRng, hashStr, mixHex, shade, clamp, lerp } from '../core/util.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

const V = 1 / 16; // world units per voxel at scale 1

// ---------------------------------------------------------------- palettes
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
const SKIN_PINK = 0xf0a0a8;
const CLAW = 0xf2ead8;
const OUTFIT_COLORS = [0x3a6a9a, 0x5a7a3a, 0x8a3a2a, 0x7a5a3a, 0x4a4a6a, 0xa86a2a, 0x2a5a5a, 0x6a3a6a, 0xb8a070, 0x9a2a3a];
const DIRT = [0x5a4028, 0x4a3420, 0x6a4a30];

/**
 * Character spec (all optional):
 * { species, age: baby|kid|adult|elder, body: slim|normal|chubby|tall|stocky, fur, eyes: dot|bead|tall|sleepy|happy|wide,
 *   outfit: none|overalls|apron|vest|suit|shirt|dress, outfitColor, hat: none|helmet|hardhat|tophat|cap|bandana|beanie|bow,
 *   hatColor, glasses: bool|'monocle', scarf: color|null, dirt: 0..1, blush: bool, brows: none|bushy|angry|worried, cane: bool,
 *   backpack: bool, seed }
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
  return { ...spec, ...overrides };
}

/** The player: a very dirty mole in patched overalls and a miner's cap with a lamp. */
export function playerSpec() {
  return {
    seed: 77, species: 'mole', age: 'adult', body: 'chubby', fur: 0x3a2e2a, eyes: 'bead', outfit: 'overalls',
    outfitColor: 0x3a6a9a, hat: 'helmet', hatColor: 0xe0b030, glasses: false, scarf: 0xc94a3a, dirt: 1, blush: true,
    brows: 'none', cane: false, backpack: false, player: true,
  };
}

// ---------------------------------------------------------------- helpers
function jitter(c, x, y, z, seed, amt = 0.07) {
  const h = (hashStr(`${x},${y},${z},${seed}`) % 1000) / 1000;
  return shade(c, 1 + (h - 0.5) * 2 * amt);
}

function proportions(spec) {
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

// ---------------------------------------------------------------- part builders
function buildHead(spec, p) {
  const sp = spec.species || 'mole';
  const fur = spec.fur ?? FUR[sp][0];
  const seed = spec.seed || 1;
  const W = p.hw, H = p.hh, D = p.hd;
  // extra room around for ears, snout, hats are separate
  const g = new VoxelGrid(W + 2, H + 9, D + 6);
  const ox = 1, oy = 0, oz = 1;
  const light = mixHex(fur, 0xf6e8d8, sp === 'molerat' ? 0.15 : 0.35);
  g.rbox(ox, oy, oz, W, H, D, (x, y, z) => {
    let c = fur;
    // lighter muzzle / face mask on the lower front
    if (z >= oz + D - 3 && y < oy + H * 0.55) c = light;
    if (sp === 'badger') {
      const cx = ox + W / 2 - 0.5;
      if (Math.abs(x - cx) < 1.5 && y > oy + 2) c = 0xf0f0ea;
      else if (Math.abs(x - cx) < 3.8 && y > oy + 2) c = 0x2a2a2c;
      else c = 0xf0f0ea;
    }
    if (sp === 'fox' && z >= oz + D - 3 && y < oy + H * 0.5) c = 0xf6f0e6;
    if (sp === 'frog' && y < oy + 3) c = mixHex(fur, 0xf0f0c0, 0.5);
    if (sp === 'molerat' && (x + y * 3 + z) % 7 === 0) c = shade(fur, 0.88);
    return jitter(c, x, y, z, seed, 0.06);
  }, 2);

  const front = oz + D; // first z outside the head front
  const cx = ox + W / 2; // center line (between voxels when W even)
  // snout
  const nose = sp === 'molerat' ? 0xd88a88 : sp === 'frog' ? -1 : sp === 'fox' || sp === 'badger' || sp === 'hedgehog' || sp === 'armadillo' || sp === 'shrew' || sp === 'vole' ? 0x2a1a1a : SKIN_PINK;
  if (sp !== 'frog') {
    const sw = sp === 'shrew' ? 2 : 4, sh = sp === 'shrew' ? 2 : 3;
    const sl = sp === 'shrew' || sp === 'armadillo' ? 4 : sp === 'fox' ? 3 : sp === 'starnose' ? 2 : 2;
    const sy = oy + 2;
    const snoutFur = sp === 'mole' || sp === 'golden' || sp === 'starnose' ? light : sp === 'molerat' ? fur : light;
    g.box(Math.round(cx - sw / 2), sy, front, sw, sh, sl, (x, y, z) => jitter(snoutFur, x, y, z, seed));
    // nose tip
    const tz = front + sl;
    if (sp === 'starnose') {
      // the famous star: tentacles around the nose
      const scx = Math.round(cx - 1), scy = sy + 1;
      g.box(scx, scy, tz, 2, 2, 1, 0xf07a90);
      for (const [dx, dy] of [[-1, 0], [2, 0], [0, -1], [1, -1], [0, 2], [1, 2], [-1, 2], [2, 2], [-1, -1], [2, -1]]) g.set(scx + dx, scy + dy, tz, SKIN_PINK);
      for (const [dx, dy] of [[-2, 0], [3, 0], [-2, 1], [3, 1], [0, 3], [1, 3], [0, -2], [1, -2]]) g.set(scx + dx, scy + dy, tz, 0xf8b8c0);
    } else {
      const nw = sp === 'shrew' ? 2 : 2, nh = sp === 'shrew' ? 1 : 2;
      g.box(Math.round(cx - nw / 2), sy + sh - nh, tz - 1, nw, nh, 1, nose);
      if (sp === 'mole' || sp === 'golden' || sp === 'molerat') g.box(Math.round(cx - 1), sy + sh - 2, tz - 1, 2, 2, 1, nose);
    }
    // whiskers
    if (sp !== 'molerat' && sp !== 'armadillo') {
      const wc = sp === 'mole' || sp === 'starnose' ? 0xd8d0c8 : 0x2a2020;
      for (const side of [-1, 1]) {
        const wx = side < 0 ? Math.round(cx - sw / 2) - 1 : Math.round(cx + sw / 2);
        g.set(wx, sy + 1, front + 1, wc);
        g.set(wx + side, sy + 2, front + 1, wc);
        g.set(wx + side, sy, front + 1, wc);
      }
    }
    if (sp === 'molerat' || sp === 'rabbit' || sp === 'vole') {
      g.set(Math.round(cx - 1), sy - 1, front + 1, 0xfffff0);
      g.set(Math.round(cx), sy - 1, front + 1, 0xfffff0);
    }
  } else {
    // frog: wide mouth line
    g.box(ox + 2, oy + 2, front - 1, W - 4, 1, 1, 0x2a5a2a);
  }

  // ears
  const earY = oy + H - 1;
  if (sp === 'rabbit') {
    for (const sx of [ox + 2, ox + W - 4]) {
      g.box(sx, earY, oz + 4, 2, 8, 2, (x, y, z) => jitter(fur, x, y, z, seed));
      g.box(sx, earY + 1, oz + 6, 2, 6, 1, 0xf0b8c0);
    }
  } else if (sp === 'fox') {
    for (const sx of [ox + 1, ox + W - 4]) {
      g.box(sx, earY, oz + 4, 3, 2, 2, fur);
      g.box(sx + 0.5, earY + 2, oz + 4, 2, 2, 2, fur);
      g.set(sx + 1, earY + 4, oz + 4, 0x2a1a1a);
      g.set(sx + 1, earY + 4, oz + 5, 0x2a1a1a);
      g.box(sx + 1, earY + 1, oz + 6, 1, 2, 1, 0xf6f0e6);
    }
  } else if (sp === 'hedgehog' || sp === 'badger' || sp === 'shrew' || sp === 'vole' || sp === 'armadillo') {
    const ec = sp === 'badger' ? 0x2a2a2c : sp === 'armadillo' ? fur : shade(fur, 0.85);
    for (const sx of [ox + 1, ox + W - 3]) {
      g.box(sx, earY, oz + 4, 2, sp === 'armadillo' ? 3 : 2, 1, ec);
      if (sp === 'badger') g.set(sx, earY + 1, oz + 4, 0xf0f0ea);
    }
  }
  if (sp === 'hedgehog') {
    // spines over the back of the head
    const rng = makeRng(seed + 3);
    for (let z = oz; z < oz + D - 4; z++)
      for (let x = ox; x < ox + W; x++)
        for (let y = oy + 3; y < oy + H + 1; y++) {
          if (g.filled(x, y, z) && !g.filled(x, y + 1, z) && rng.chance(0.5)) {
            g.set(x, y + 1, z, rng.chance(0.4) ? 0xe8d8b8 : 0x5a3a22);
            if (rng.chance(0.4)) g.set(x, y + 2, z, 0xe8d8b8);
          }
          if (g.filled(x, y, z) && !g.filled(x, y, z - 1) && rng.chance(0.55)) g.set(x, y, z - 1, rng.chance(0.4) ? 0xe8d8b8 : 0x5a3a22);
        }
  }
  if (sp === 'frog') {
    // eye bumps on top
    for (const sx of [ox + 1, ox + W - 4]) g.box(sx, oy + H - 1, oz + D - 5, 3, 3, 3, (x, y, z) => jitter(fur, x, y, z, seed));
  }
  // blush
  if (spec.blush) {
    g.set(Math.round(cx - 4), oy + 3, front - 1 + 1, 0xf08a9a);
    g.set(Math.round(cx + 3), oy + 3, front - 1 + 1, 0xf08a9a);
  }
  return { grid: g, pivot: [ox + W / 2, 0, oz + D / 2], front, cx, ox, oy, oz };
}

function buildEyes(spec, head, p) {
  const type = spec.eyes || 'bead';
  const sp = spec.species;
  // eyes as their own tiny grids so they can blink
  const eyes = [];
  const ey = sp === 'frog' ? head.oy + p.hh + 1 : head.oy + Math.round(p.hh * 0.55);
  const spread = sp === 'frog' ? p.hw / 2 - 2.5 : 2.6;
  for (const side of [-1, 1]) {
    const g = new VoxelGrid(3, 3, 1);
    if (type === 'dot') g.set(1, 1, 0, 0x120c10);
    else if (type === 'bead') { g.box(0, 0, 0, 2, 2, 1, 0x120c10); g.set(0, 1, 0, 0xffffff); }
    else if (type === 'tall') { g.box(0, 0, 0, 1, 2, 1, 0x120c10); g.set(0, 1, 0, 0x8a8aa0); }
    else if (type === 'sleepy') g.box(0, 1, 0, 2, 1, 1, 0x120c10);
    else if (type === 'happy') { g.set(0, 0, 0, 0x120c10); g.set(1, 1, 0, 0x120c10); g.set(2, 0, 0, 0x120c10); }
    else if (type === 'wide') { g.box(0, 0, 0, 2, 3, 1, 0xffffff); g.box(side < 0 ? 1 : 0, 0, 0, 1, 2, 1, 0x120c10); }
    const ex = head.cx + side * spread;
    const ez = sp === 'frog' ? head.oz + p.hd - 2 : head.front;
    eyes.push({ grid: g, pos: [ex, ey, ez], side });
  }
  return eyes;
}

function buildBrows(spec, head, p) {
  if (!spec.brows || spec.brows === 'none') return null;
  const g = new VoxelGrid(p.hw + 2, 3, 1);
  const col = spec.age === 'elder' ? 0xf0ece4 : shade(spec.fur ?? 0x3a2e2a, 0.5);
  const cx = head.cx;
  const ey = head.oy + Math.round(p.hh * 0.55) + 2;
  for (const side of [-1, 1]) {
    const x0 = Math.round(cx + side * 2.6 - 1);
    if (spec.brows === 'bushy') { g.box(x0 - 1 + 1, 0, 0, 4, 2, 1, col); }
    else if (spec.brows === 'angry') { g.set(x0, side < 0 ? 1 : 0, 0, col); g.set(x0 + 1, side < 0 ? 0 : 1, 0, col); }
    else { g.set(x0, side < 0 ? 0 : 1, 0, col); g.set(x0 + 1, side < 0 ? 1 : 0, 0, col); }
  }
  return { grid: g, pos: [0, ey, head.front] };
}

function buildBody(spec, p) {
  const sp = spec.species || 'mole';
  const fur = spec.fur ?? FUR[sp][0];
  const seed = (spec.seed || 1) + 11;
  const rng = makeRng(seed);
  const W = p.bw, H = p.bh, D = p.bd;
  const g = new VoxelGrid(W + 4, H + 3, D + 6);
  const ox = 2, oy = 0, oz = 2;
  const belly = mixHex(fur, 0xf6e8d8, sp === 'molerat' ? 0.1 : 0.32);
  g.rbox(ox, oy, oz, W, H, D, (x, y, z) => {
    let c = fur;
    if (z >= oz + D - 2 && Math.abs(x - (ox + W / 2 - 0.5)) < W / 2 - 1.5 && y < oy + H - 1) c = belly;
    if (sp === 'badger') c = z < oz + D - 2 ? 0x7a7a7c : 0x2a2a2c;
    if (sp === 'fox' && z >= oz + D - 2) c = 0xf6f0e6;
    if (sp === 'armadillo' && z < oz + D - 2 && y > oy + 1) c = (Math.floor((z - oz) / 2) % 2) ? 0x9a8878 : 0xb8a898;
    return jitter(c, x, y, z, seed);
  }, 2);
  const cx = ox + W / 2;
  const front = oz + D;
  const outfit = spec.outfit || 'none';
  const oc = spec.outfitColor ?? 0x3a6a9a;
  const isFront = (z) => z >= oz + D - 2;
  const isBack = (z) => z <= oz + 1;
  if (outfit === 'overalls') {
    g.paint((x, y, z, c) => {
      if (y <= oy + Math.floor(H * 0.45)) return jitter(oc, x, y, z, seed, 0.05); // pants
      if (isFront(z) && Math.abs(x + 0.5 - cx) < W * 0.28 && y < oy + H - 1) return jitter(oc, x, y, z, seed, 0.05); // bib
      if ((isFront(z) || isBack(z) || y === oy + H - 1) && (Math.abs(x + 0.5 - cx - W * 0.3) < 0.8 || Math.abs(x + 0.5 - cx + W * 0.3) < 0.8)) return shade(oc, 0.85); // straps
      return undefined;
    });
    g.set(Math.round(cx - W * 0.28), oy + H - 2, front, 0xe0c040);
    g.set(Math.round(cx + W * 0.28) - 1, oy + H - 2, front, 0xe0c040);
    // patch
    g.box(Math.round(cx) + 1, oy + 1, front, 2, 2, 1, mixHex(oc, 0xc8a070, 0.5));
  } else if (outfit === 'apron') {
    g.box(Math.round(cx - W * 0.35), oy + 0, front, Math.round(W * 0.7), H - 1, 1, (x, y, z) => jitter(oc, x, y, z, seed, 0.05));
    g.box(Math.round(cx - 1), oy + 2, front + 1, 3, 2, 1, shade(oc, 0.8)); // pocket
  } else if (outfit === 'vest' || outfit === 'suit' || outfit === 'shirt' || outfit === 'dress') {
    g.paint((x, y, z, c) => {
      if (outfit === 'vest' && isFront(z) && Math.abs(x + 0.5 - cx) < 1.6) return undefined;
      if (outfit === 'suit' && isFront(z) && Math.abs(x + 0.5 - cx) < 1.6 && y > oy + H - 4) return y === oy + H - 1 ? 0xf6f6f0 : (Math.abs(x + 0.5 - cx) < 0.6 ? 0xc94a3a : 0xf6f6f0);
      if (y < oy + 1 && outfit === 'shirt') return undefined;
      return jitter(oc, x, y, z, seed, 0.05);
    });
    if (outfit === 'dress') {
      for (let x = ox - 1; x < ox + W + 1; x++) for (let z = oz - 1; z < oz + D + 1; z++) if (!g.filled(x, oy, z) && (x === ox - 1 || x === ox + W || z === oz - 1 || z === oz + D)) g.set(x, oy, z, shade(oc, 0.9));
    }
    if (outfit !== 'shirt') for (let y = oy + 1; y < oy + H - 1; y += 2) g.set(Math.round(cx + 1), y, front, 0xe0c040);
  }
  // scarf
  if (spec.scarf) {
    for (let x = ox; x < ox + W; x++) for (let z = oz; z < oz + D; z++) if (g.filled(x, oy + H - 1, z) && (x === ox || x === ox + W - 1 || z === oz || z === oz + D - 1)) g.set(x, oy + H - 1, z, spec.scarf);
    g.box(Math.round(cx + 1), oy + H - 4, front, 2, 3, 1, shade(spec.scarf, 0.85));
  }
  // dirt splotches (it's a dirty mole world)
  const dirt = spec.dirt ?? 0.4;
  const spots = Math.round(dirt * 8);
  for (let i = 0; i < spots; i++) {
    const x = rng.int(ox, ox + W - 1), y = rng.int(oy, oy + H - 2), z = rng.chance(0.5) ? front - 1 : rng.int(oz, oz + D - 1);
    const dc = rng.pick(DIRT);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0]]) if (g.filled(x + dx, y + dy, z) && rng.chance(0.75)) g.set(x + dx, y + dy, z, dc);
  }
  if (spec.backpack) g.box(Math.round(cx - 3), oy + 1, oz - 2, 6, H - 2, 2, 0x8a5a2a);
  if (sp === 'hedgehog') {
    for (let z = oz - 1; z < oz + D - 3; z++) for (let x = ox; x < ox + W; x++) for (let y = oy + 1; y < oy + H; y++) {
      if (!g.filled(x, y, z) && (g.filled(x, y, z + 1) || g.filled(x, y - 1, z)) && rng.chance(0.4)) g.set(x, y, z, rng.chance(0.3) ? 0xe8d8b8 : 0x5a3a22);
    }
  }
  // tail
  const tail = new VoxelGrid(7, 6, 9);
  if (sp === 'fox') { tail.ellipsoid(3.5, 3, 4.5, 2.6, 2.4, 4.4, (x, y, z) => (z < 2 ? 0xf6f0e6 : jitter(fur, x, y, z, seed))); }
  else if (sp === 'rabbit') tail.ellipsoid(3.5, 3, 4.5, 1.8, 1.8, 1.5, 0xf6f6f0);
  else if (sp === 'badger' || sp === 'armadillo' || sp === 'shrew' || sp === 'vole') tail.box(3, 2, 3, 1, 1, 4, shade(fur, 0.85));
  else if (sp !== 'frog' && sp !== 'hedgehog') tail.box(3, 2, 5, 1, 1, 2, SKIN_PINK);
  return { grid: g, pivot: [ox + W / 2, 0, oz + D / 2], tail, cx, ox, oz, front };
}

function buildArm(spec, p, side) {
  const sp = spec.species || 'mole';
  const fur = spec.fur ?? FUR[sp][0];
  const seed = (spec.seed || 1) + (side > 0 ? 21 : 22);
  const bigPaw = sp === 'mole' || sp === 'starnose' || sp === 'golden' || sp === 'molerat';
  const g = new VoxelGrid(6, p.ah + 3, 6);
  const sleeve = spec.outfit === 'suit' || spec.outfit === 'shirt' || spec.outfit === 'dress' ? spec.outfitColor : null;
  // upper arm (hangs down from the pivot at the top)
  g.box(1, 3, 1, 3, p.ah - 1, 3, (x, y, z) => (sleeve && y > 3 ? sleeve : jitter(fur, x, y, z, seed)));
  const pawC = bigPaw ? SKIN_PINK : sp === 'frog' ? mixHex(fur, 0xf0f0c0, 0.3) : sp === 'fox' || sp === 'badger' ? 0x2a2224 : shade(fur, 0.9);
  if (bigPaw) {
    // broad spade paw with claws
    g.box(0, 0, 1, 5, 3, 4, pawC);
    g.box(0, 2, 1, 5, 1, 4, shade(pawC, 0.92));
    for (let x = 0; x < 5; x += 2) g.set(x, 0, 5, CLAW);
    g.set(1, 0, 5, CLAW);
    g.set(3, 0, 5, CLAW);
  } else {
    g.box(1, 0, 1, 3, 3, 3, pawC);
  }
  return { grid: g, pivot: [2.5, p.ah + 2, 2.5] };
}

function buildLeg(spec, p) {
  const sp = spec.species || 'mole';
  const fur = spec.fur ?? FUR[sp][0];
  const g = new VoxelGrid(4, p.lh + 1, 5);
  const pants = spec.outfit === 'overalls' || spec.outfit === 'suit' ? spec.outfitColor : null;
  g.box(0, 1, 0, 3, p.lh, 3, (x, y, z) => (pants ? jitter(pants, x, y, z, spec.seed) : jitter(fur, x, y, z, spec.seed)));
  const foot = sp === 'mole' || sp === 'starnose' || sp === 'golden' || sp === 'molerat' ? SKIN_PINK : sp === 'fox' || sp === 'badger' ? 0x2a2224 : shade(fur, 0.8);
  g.box(0, 0, 0, 3, 1, 4, foot);
  return { grid: g, pivot: [1.5, p.lh + 1, 1.5] };
}

function buildHat(spec, p) {
  const hat = spec.hat || 'none';
  if (hat === 'none') return null;
  const W = p.hw, D = p.hd;
  const g = new VoxelGrid(W + 6, 12, D + 6);
  const hc = spec.hatColor ?? 0xe0b030;
  const cx = (W + 6) / 2;
  const cz = (D + 6) / 2;
  let lamp = null;
  if (hat === 'helmet' || hat === 'hardhat') {
    // dome that hugs the top of the head (base sits 3 voxels below the crown)
    g.ellipsoid(cx, 1, cz, W / 2 + 1, 6, D / 2 + 1, (x, y, z) => (y < 1 ? -1 : jitter(hc, x, y, z, 5, 0.05)));
    // band around the base
    for (let x = 0; x < W + 6; x++) for (let z = 0; z < D + 6; z++) if (g.filled(x, 1, z) && !g.filled(x, 1, z + 1) || g.filled(x, 1, z) && !g.filled(x, 1, z - 1)) g.set(x, 1, z, shade(hc, 0.82));
    // ridge over the top, front to back
    for (let z = 2; z < D + 4; z++) for (let y = 11; y > 1; y--) if (g.filled(Math.floor(cx), y, z)) { g.set(Math.floor(cx), y + 1, z, shade(hc, 0.85)); g.set(Math.floor(cx) - 1, y + 1, z, shade(hc, 0.85)); break; }
    // short front brim
    g.box(Math.round(cx) - 4, 1, D + 4, 8, 1, 2, shade(hc, 0.75));
    if (hat === 'helmet') {
      g.box(Math.round(cx) - 2, 2, D + 4, 4, 3, 2, 0x4a4a52);
      g.box(Math.round(cx) - 1, 3, D + 5, 2, 1, 1, 0xfff8c0);
      lamp = [Math.round(cx), 3.5, D + 6];
    }
  } else if (hat === 'tophat') {
    g.box(1, 0, 3, W + 4, 1, D, 0x1a1a1a);
    g.cylinderY(cx, (D + 6) / 2, 4, 1, 9, (x, y) => (y === 2 ? 0xc94a3a : 0x1a1a1e));
  } else if (hat === 'cap') {
    g.ellipsoid(cx, 1, cz, W / 2 + 0.6, 4.5, D / 2 + 0.6, (x, y, z) => (y < 1 ? -1 : jitter(hc, x, y, z, 6, 0.05)));
    g.box(Math.round(cx) - 4, 1, D + 3, 8, 1, 3, shade(hc, 0.8));
    g.set(Math.round(cx), 6, Math.round(cz), shade(hc, 0.7));
  } else if (hat === 'bandana') {
    for (let x = 2; x < W + 4; x++) for (let z = 2; z < D + 4; z++) if (x === 2 || x === W + 3 || z === 2 || z === D + 3) g.set(x, 0, z, hc);
    g.box(Math.round(cx) - 1, 0, 0, 2, 2, 2, hc);
    g.set(Math.round(cx) + 2, 0, D + 3, 0xffffff);
    g.set(Math.round(cx) - 3, 0, D + 3, 0xffffff);
  } else if (hat === 'beanie') {
    g.ellipsoid(cx, 1, cz, W / 2 + 0.6, 5, D / 2 + 0.6, (x, y) => (y < 1 ? -1 : y < 3 ? shade(hc, 0.8) : y % 2 ? hc : shade(hc, 0.9)));
    g.ellipsoid(cx, 6.5, cz, 1.8, 1.8, 1.8, 0xf6f6f0);
  } else if (hat === 'bow') {
    g.box(Math.round(cx) + 2, 0, (D + 6) / 2 - 1, 5, 3, 2, hc);
    g.box(Math.round(cx) + 4, 0, (D + 6) / 2 - 1, 1, 3, 3, shade(hc, 0.8));
  }
  return { grid: g, pivot: [cx, 0, (D + 6) / 2], lamp };
}

function buildGlasses(spec, head, p) {
  if (!spec.glasses) return null;
  const g = new VoxelGrid(p.hw + 2, 5, 1);
  const col = 0xc8a050;
  const cx = head.cx;
  const sides = spec.glasses === 'monocle' ? [1] : [-1, 1];
  for (const side of sides) {
    const x0 = Math.round(cx + side * 2.6 - 1.5);
    for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2], [2, 1], [2, 2], [0, 3], [1, 3], [2, 3]]) g.set(x0 + dx, dy, 0, col);
  }
  if (sides.length === 2) g.set(Math.round(cx) - 1, 2, 0, col), g.set(Math.round(cx), 2, 0, col);
  return { grid: g, pos: [0, head.oy + Math.round(p.hh * 0.55) - 1, head.front + 1] };
}

// ---------------------------------------------------------------- rig
function part(grid, pivot, kind, s) {
  return voxelMesh(grid, { pivot, scale: s, kind, outline: true });
}

/**
 * Build a character. Returns a CharacterRig with .root (THREE.Group) you add to a scene.
 * opts.kind: material kind ('toon' | 'lambert' | 'basic'); opts.scale extra scale.
 */
export function makeCharacter(spec, opts = {}) {
  const p = proportions(spec);
  const s = V * p.scale * (opts.scale ?? 1);
  const kind = opts.kind || 'toon';
  const bake = kind === 'basic';
  const mk = (grid, pivot) => voxelMesh(grid, { pivot, scale: s, kind, shade: bake, outline: true });

  const root = new THREE.Group();
  root.name = 'character';
  const hip = new THREE.Group(); // body bob happens here
  root.add(hip);

  const head = buildHead(spec, p);
  const body = buildBody(spec, p);
  const arm = [buildArm(spec, p, -1), buildArm(spec, p, 1)];
  const leg = buildLeg(spec, p);

  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-p.bw * 0.27 * s, p.lh * s + s, 0);
  legR.position.set(p.bw * 0.27 * s, p.lh * s + s, 0);
  legL.add(mk(leg.grid, leg.pivot));
  legR.add(mk(leg.grid, leg.pivot));
  root.add(legL, legR);

  hip.position.y = p.lh * s + s * 0.5;
  const bodyMesh = mk(body.grid, body.pivot);
  hip.add(bodyMesh);
  const tailMesh = mk(body.tail, [3.5, 2, 9 + (p.bd / 2 - 4)]);
  tailMesh.position.set(0, s * 1.5, -p.bd / 2 * s + s);
  hip.add(tailMesh);

  const neck = new THREE.Group();
  neck.position.set(0, (p.bh - 1) * s, s * 0.5);
  hip.add(neck);
  const headMesh = mk(head.grid, head.pivot);
  neck.add(headMesh);

  // face parts
  const eyes = buildEyes(spec, head, p).map((e) => {
    const m = mk(e.grid, [1, 1, 0]);
    m.position.set((e.pos[0] - head.pivot[0]) * s, (e.pos[1] + 1 - head.pivot[1]) * s, (e.pos[2] - head.pivot[2]) * s + s * 0.02);
    neck.add(m);
    return m;
  });
  const mouthG = new VoxelGrid(2, 2, 1);
  mouthG.box(0, 0, 0, 2, 2, 1, 0x6a1a2a);
  mouthG.set(0, 0, 0, 0xf07a8a);
  const mouth = mk(mouthG, [1, 2, 0]);
  const sp = spec.species;
  const snoutLen = sp === 'frog' ? 0 : 2;
  mouth.position.set(0, (head.oy + 2 - head.pivot[1]) * s, (head.front + (sp === 'frog' ? 0 : 0.5) - head.pivot[2]) * s + snoutLen * s * 0.2);
  mouth.visible = false;
  neck.add(mouth);
  const brows = buildBrows(spec, head, p);
  if (brows) {
    const m = mk(brows.grid, [head.pivot[0], 0, 0]);
    m.position.set(0, (brows.pos[1] - head.pivot[1]) * s, (brows.pos[2] - head.pivot[2]) * s + s * 0.02);
    neck.add(m);
  }
  const glasses = buildGlasses(spec, head, p);
  if (glasses) {
    const m = mk(glasses.grid, [head.pivot[0], 0, 0]);
    m.position.set(0, (glasses.pos[1] - head.pivot[1]) * s, (glasses.pos[2] - head.pivot[2]) * s);
    neck.add(m);
  }
  const hat = buildHat(spec, p);
  let lampPos = null;
  if (hat) {
    const m = mk(hat.grid, hat.pivot);
    const sink = spec.hat === 'helmet' || spec.hat === 'hardhat' || spec.hat === 'cap' ? 3 : spec.hat === 'beanie' ? 4 : spec.hat === 'bandana' ? 3 : 1;
    m.position.set(0, (p.hh - sink) * s, 0);
    neck.add(m);
    if (hat.lamp) {
      lampPos = new THREE.Object3D();
      lampPos.position.set((hat.lamp[0] - hat.pivot[0]) * s, (p.hh - sink + hat.lamp[1]) * s, (hat.lamp[2] - hat.pivot[2]) * s);
      neck.add(lampPos);
    }
  }

  const armL = new THREE.Group(), armR = new THREE.Group();
  const shoulderY = (p.bh - 1.5) * s;
  armL.position.set(-(p.bw / 2 + 1.2) * s, shoulderY, s * 0.5);
  armR.position.set((p.bw / 2 + 1.2) * s, shoulderY, s * 0.5);
  armL.add(mk(arm[0].grid, arm[0].pivot));
  armR.add(mk(arm[1].grid, arm[1].pivot));
  hip.add(armL, armR);
  // sockets at the paws for held items
  const handL = new THREE.Group(), handR = new THREE.Group();
  handL.position.set(0, -(p.ah + 1) * s, s);
  handR.position.set(0, -(p.ah + 1) * s, s);
  armL.add(handL);
  armR.add(handR);

  let cane = null;
  if (spec.cane) {
    const cg = new VoxelGrid(3, 18, 3);
    cg.box(1, 0, 1, 1, 16, 1, 0x7a5030);
    cg.box(0, 15, 1, 3, 1, 1, 0x7a5030);
    cane = mk(cg, [1.5, 15, 1.5]);
    handR.add(cane);
  }

  const height = (p.lh + p.bh + p.hh + 1) * s;
  const rig = new CharacterRig({ root, hip, neck, headMesh, armL, armR, legL, legR, handL, handR, eyes, mouth, tail: tailMesh, lamp: lampPos, height, s, spec, p });
  root.userData.rig = rig;
  return rig;
}

export class CharacterRig {
  constructor(parts) {
    Object.assign(this, parts);
    this.state = 'idle';
    this.speed = 1;
    this.t = Math.random() * 10;
    this.blinkT = 2 + Math.random() * 3;
    this.talkT = 0;
    this.emoteT = 0;
    this.emote = null;
    this.facing = 0;
    this.targetFacing = 0;
    this.lean = 0;
    this.swingPhase = 0;
    this.hold = null;
    this.baseHunch = parts.p.hunch || 0;
  }

  /** States: idle walk run jump fall climb dig swing chisel brush drill wave talk cheer sit sleep laugh sneeze hammer swim carry sad hurt peck */
  play(state, speed = 1) {
    if (this.state !== state) { this.state = state; this.stateT = 0; }
    this.speed = speed;
  }

  doEmote(kind, dur = 1.2) { this.emote = kind; this.emoteT = dur; }

  talk(seconds = 1.5) { this.talkT = seconds; }

  /** Face a yaw angle (radians, 0 = +z toward camera). */
  face(yaw, instant = false) {
    this.targetFacing = yaw;
    if (instant) this.facing = yaw;
  }

  /** Put an object in one paw (replacing only what that paw held). */
  holdItem(obj, hand = 'R') {
    this.holds = this.holds || { L: null, R: null };
    const h = hand === 'R' ? this.handR : this.handL;
    const prev = this.holds[hand];
    if (prev && prev.parent) prev.parent.remove(prev);
    this.holds[hand] = obj || null;
    if (hand === 'R') this.hold = obj || null;
    if (obj) h.add(obj);
  }

  update(dt) {
    this.t += dt * this.speed;
    this.stateT = (this.stateT || 0) + dt;
    const t = this.t;
    const { hip, neck, armL, armR, legL, legR, eyes, mouth, tail } = this;
    // smooth facing
    let d = this.targetFacing - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * 14);
    this.root.rotation.y = this.facing;

    // reset pose
    hip.position.y = this.p.lh * this.s + this.s * 0.5;
    hip.rotation.set(this.baseHunch, 0, 0);
    neck.rotation.set(-this.baseHunch * 0.8, 0, 0);
    armL.rotation.set(0, 0, 0.12);
    armR.rotation.set(0, 0, -0.12);
    legL.rotation.set(0, 0, 0);
    legR.rotation.set(0, 0, 0);
    if (tail) tail.rotation.set(0, Math.sin(t * 3) * 0.2, 0);
    const s = this.s;
    const breathe = Math.sin(t * 2.2);

    switch (this.state) {
      case 'walk': case 'run': {
        const f = this.state === 'run' ? 14 : 9;
        const a = this.state === 'run' ? 0.9 : 0.6;
        const w = Math.sin(t * f);
        legL.rotation.x = w * a;
        legR.rotation.x = -w * a;
        armL.rotation.x = -w * a * 0.9;
        armR.rotation.x = w * a * 0.9;
        hip.position.y += Math.abs(Math.cos(t * f)) * s * (this.state === 'run' ? 1.6 : 1);
        hip.rotation.x += this.state === 'run' ? 0.18 : 0.06;
        hip.rotation.z = w * 0.05;
        neck.rotation.z = -w * 0.04;
        break;
      }
      case 'jump': case 'fall': {
        armL.rotation.set(-2.4, 0, 0.5);
        armR.rotation.set(-2.4, 0, -0.5);
        legL.rotation.x = this.state === 'jump' ? -0.6 : 0.3;
        legR.rotation.x = this.state === 'jump' ? 0.4 : -0.3;
        break;
      }
      case 'climb': {
        const w = Math.sin(t * 10);
        armL.rotation.set(-2.6 + w * 0.5, 0, 0.2);
        armR.rotation.set(-2.6 - w * 0.5, 0, -0.2);
        legL.rotation.x = -0.4 + w * 0.4;
        legR.rotation.x = -0.4 - w * 0.4;
        hip.rotation.x = -0.15;
        break;
      }
      case 'swim': {
        const w = Math.sin(t * 6);
        armL.rotation.set(-1.5 + w * 0.8, 0, 0.6);
        armR.rotation.set(-1.5 - w * 0.8, 0, -0.6);
        legL.rotation.x = w * 0.6;
        legR.rotation.x = -w * 0.6;
        hip.rotation.x = 0.4;
        break;
      }
      case 'swing': case 'hammer': {
        // pickaxe/hammer strike: phase 0 = windup, 1 = impact
        const ph = this.swingPhase;
        const k = ph < 0.55 ? ph / 0.55 : 1 - (ph - 0.55) / 0.45;
        armR.rotation.x = lerp(0.2, -2.6, k);
        armL.rotation.x = lerp(0.1, -2.2, k) * 0.9;
        armL.rotation.z = 0.3;
        hip.rotation.x += lerp(0.25, -0.15, k);
        neck.rotation.x += lerp(0.15, -0.1, k);
        break;
      }
      case 'dig': case 'chisel': case 'brush': case 'drill': {
        const sp = this.state === 'brush' ? 14 : this.state === 'drill' ? 40 : this.state === 'chisel' ? 18 : 12;
        const w = Math.sin(t * sp);
        const amp = this.state === 'drill' ? 0.05 : this.state === 'brush' ? 0.35 : 0.45;
        armR.rotation.x = -1.4 + w * amp;
        armL.rotation.x = -1.3 - w * amp * (this.state === 'dig' ? 1 : 0.3);
        armR.rotation.z = this.state === 'brush' ? w * 0.3 - 0.1 : -0.1;
        hip.rotation.x += 0.2;
        if (this.state === 'drill') hip.position.x = Math.sin(t * 60) * s * 0.4;
        break;
      }
      case 'wave': {
        armR.rotation.set(-2.7, 0, -0.3 + Math.sin(t * 10) * 0.5);
        neck.rotation.z = Math.sin(t * 5) * 0.08;
        break;
      }
      case 'cheer': {
        armL.rotation.set(-2.9, 0, 0.4 + Math.sin(t * 12) * 0.2);
        armR.rotation.set(-2.9, 0, -0.4 - Math.sin(t * 12) * 0.2);
        hip.position.y += Math.abs(Math.sin(t * 8)) * s * 4;
        break;
      }
      case 'sit': {
        legL.rotation.x = -1.45;
        legR.rotation.x = -1.45;
        hip.position.y = this.s * 2;
        armL.rotation.x = -0.4;
        armR.rotation.x = -0.4;
        break;
      }
      case 'sleep': {
        hip.rotation.x = 0.1;
        neck.rotation.x = 0.35 + breathe * 0.03;
        neck.rotation.z = 0.2;
        armL.rotation.x = -0.6;
        armR.rotation.x = -0.6;
        break;
      }
      case 'laugh': {
        hip.rotation.x += -0.2 + Math.sin(t * 25) * 0.05;
        neck.rotation.x = -0.3;
        armL.rotation.set(-0.6, 0, 0.6);
        armR.rotation.set(-0.6, 0, -0.6);
        hip.position.y += Math.abs(Math.sin(t * 16)) * s;
        break;
      }
      case 'sad': {
        neck.rotation.x = 0.45;
        hip.rotation.x += 0.15;
        armL.rotation.z = 0.05;
        armR.rotation.z = -0.05;
        break;
      }
      case 'carry': {
        armL.rotation.set(-1.3, 0, 0.1);
        armR.rotation.set(-1.3, 0, -0.1);
        break;
      }
      case 'peck': {
        hip.rotation.x = 0.35 + Math.max(0, Math.sin(t * 9)) * 0.3;
        break;
      }
      case 'hurt': {
        hip.rotation.x = -0.3;
        neck.rotation.x = -0.25;
        armL.rotation.set(-0.8, 0, 0.9);
        armR.rotation.set(-0.8, 0, -0.9);
        break;
      }
      case 'sneeze': {
        const k = this.stateT < 0.5 ? this.stateT / 0.5 : Math.max(0, 1 - (this.stateT - 0.5) * 6);
        neck.rotation.x = this.stateT < 0.5 ? -0.5 * k : 0.5 * k;
        hip.rotation.x += this.stateT < 0.5 ? -0.2 * k : 0.25 * k;
        break;
      }
      default: { // idle
        hip.position.y += breathe * s * 0.25;
        armL.rotation.x = Math.sin(t * 1.3) * 0.05;
        armR.rotation.x = -Math.sin(t * 1.3) * 0.05;
        neck.rotation.z = Math.sin(t * 0.7) * 0.05;
        neck.rotation.x += Math.sin(t * 0.9) * 0.03;
      }
    }

    // emote overlays
    if (this.emoteT > 0) {
      this.emoteT -= dt;
      if (this.emote === 'nod') neck.rotation.x += Math.sin(this.emoteT * 18) * 0.2;
      if (this.emote === 'shake') neck.rotation.y = Math.sin(this.emoteT * 18) * 0.3;
      if (this.emote === 'hop') hip.position.y += Math.abs(Math.sin(this.emoteT * 10)) * s * 3;
      if (this.emote === 'wave') armR.rotation.set(-2.7, 0, -0.3 + Math.sin(this.emoteT * 12) * 0.5);
    }

    // blink & talk
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 || this.state === 'sleep' || this.state === 'laugh';
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 3.5;
    for (const e of eyes) e.scale.y = blink ? 0.2 : 1;
    if (this.talkT > 0) {
      this.talkT -= dt;
      mouth.visible = Math.sin(this.t * 22) > 0;
      neck.rotation.x += Math.sin(this.t * 11) * 0.04;
    } else mouth.visible = this.state === 'laugh' || this.state === 'cheer' || this.state === 'hurt';
  }

  /** Tint all character materials (mine lighting). Requires a unique 'basic' material. */
  setTint(color) {
    this.root.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.copy(color); });
  }
}

/** Give a character its own (non-shared) material so it can be tinted individually. */
export function uniqueMaterial(rig, kind = 'basic') {
  const m = voxelMaterial(kind, { unique: true });
  rig.root.traverse((o) => { if (o.isMesh) o.material = m; });
  rig.material = m;
  return m;
}

// ---------------------------------------------------------------- chicken
export function makeChicken(opts = {}) {
  const s = V * (opts.scale ?? 1);
  const kind = opts.kind || 'toon';
  const bake = kind === 'basic';
  const mk = (grid, pivot) => voxelMesh(grid, { pivot, scale: s, kind, shade: bake, outline: true });
  const feather = opts.color ?? 0xf6f0e4;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bg = new VoxelGrid(10, 9, 12);
  bg.ellipsoid(5, 4.5, 6, 4.2, 3.8, 5, (x, y, z) => jitter(z < 3 && y > 4 ? shade(feather, 0.94) : feather, x, y, z, 9, 0.05));
  // tail feathers
  bg.box(4, 6, 0, 2, 3, 2, shade(feather, 0.9));
  bg.box(3, 7, 1, 4, 2, 1, shade(feather, 0.85));
  body.position.y = s * 4;
  const bodyMesh = mk(bg, [5, 2, 6]);
  body.add(bodyMesh);
  const head = new THREE.Group();
  head.position.set(0, s * 5.5, s * 4);
  const hg = new VoxelGrid(7, 9, 7);
  hg.box(1, 0, 1, 5, 6, 5, (x, y, z) => jitter(feather, x, y, z, 4, 0.05));
  hg.box(2, 6, 2, 3, 1, 3, 0xe0302a); // comb
  hg.set(2, 7, 3, 0xe0302a); hg.set(4, 7, 2, 0xe0302a); hg.set(3, 7, 4, 0xe0302a);
  hg.box(2, 2, 6, 3, 1, 1, 0xf0b030); // beak
  hg.set(3, 3, 6, 0xf0b030);
  hg.box(3, 0, 6, 1, 2, 1, 0xe0302a); // wattle
  head.add(mk(hg, [3.5, 0, 3.5]));
  const eyeG = new VoxelGrid(1, 1, 1);
  eyeG.set(0, 0, 0, 0x120c10);
  const eyes = [-1, 1].map((side) => {
    const e = mk(eyeG, [0.5, 0.5, 0.5]);
    e.position.set(side * 2.5 * s, 4 * s, 2.2 * s);
    head.add(e);
    return e;
  });
  body.add(head);
  const wingG = new VoxelGrid(2, 4, 6);
  wingG.box(0, 0, 0, 1, 4, 6, shade(feather, 0.9));
  wingG.box(0, 0, 0, 1, 1, 6, shade(feather, 0.82));
  const wings = [-1, 1].map((side) => {
    const w = mk(wingG, [0.5, 3.5, 3]);
    w.position.set(side * 4.3 * s, s * 4, -s * 0.5);
    body.add(w);
    return w;
  });
  const legG = new VoxelGrid(3, 4, 3);
  legG.box(1, 1, 1, 1, 3, 1, 0xf0a030);
  legG.box(0, 0, 0, 3, 1, 3, 0xf0a030);
  const legs = [-1, 1].map((side) => {
    const l = new THREE.Group();
    l.position.set(side * 1.8 * s, 4 * s, 0);
    l.add(mk(legG, [1.5, 4, 1.5]));
    root.add(l);
    return l;
  });
  let hat = null;
  if (opts.hat === 'straw') {
    const g = new VoxelGrid(11, 4, 11);
    g.box(0, 0, 0, 11, 1, 11, 0xe8c870);
    g.box(3, 1, 3, 5, 2, 5, 0xe0c060);
    g.box(3, 1, 3, 5, 1, 5, 0xc94a3a);
    hat = mk(g, [5.5, 0, 5.5]);
    hat.position.set(0, 6.5 * s, 0);
    head.add(hat);
  }
  const rig = new ChickenRig({ root, body, head, wings, legs, eyes, s });
  root.userData.rig = rig;
  return rig;
}

export class ChickenRig {
  constructor(parts) {
    Object.assign(this, parts);
    this.state = 'idle';
    this.t = Math.random() * 5;
    this.facing = 0;
    this.targetFacing = 0;
    this.peckT = 0;
    this.flapT = 0;
    this.blinkT = 2;
  }
  play(state) { if (this.state !== state) { this.state = state; this.stateT = 0; } }
  face(yaw, instant) { this.targetFacing = yaw; if (instant) this.facing = yaw; }
  peck() { this.peckT = 0.5; }
  flap(d = 0.8) { this.flapT = d; }
  update(dt) {
    this.t += dt;
    let d = this.targetFacing - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * 10);
    this.root.rotation.y = this.facing;
    const { body, head, wings, legs, s } = this;
    body.position.y = s * 4;
    body.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    head.position.set(0, s * 5.5, s * 4);
    legs[0].rotation.x = 0;
    legs[1].rotation.x = 0;
    wings[0].rotation.z = 0;
    wings[1].rotation.z = 0;
    const t = this.t;
    if (this.state === 'walk' || this.state === 'run') {
      const f = this.state === 'run' ? 18 : 11;
      legs[0].rotation.x = Math.sin(t * f) * 0.7;
      legs[1].rotation.x = -Math.sin(t * f) * 0.7;
      body.rotation.z = Math.sin(t * f) * 0.12;
      head.position.z = s * 4 + Math.sin(t * f * 2) * s * 0.8;
      body.position.y += Math.abs(Math.sin(t * f)) * s * 0.6;
    } else if (this.state === 'sit') {
      body.position.y = s * 2.2;
      legs[0].visible = legs[1].visible = false;
    } else {
      head.rotation.z = Math.sin(t * 1.7) * 0.15;
      head.rotation.y = Math.sin(t * 0.6) * 0.4;
    }
    if (this.state !== 'sit') legs[0].visible = legs[1].visible = true;
    if (this.peckT > 0) {
      this.peckT -= dt;
      const k = Math.sin((0.5 - this.peckT) / 0.5 * Math.PI * 2);
      head.rotation.x = Math.max(0, k) * 1.1;
      body.rotation.x = Math.max(0, k) * 0.35;
    }
    if (this.flapT > 0) {
      this.flapT -= dt;
      const f = Math.sin(t * 40) * 0.9 + 0.6;
      wings[0].rotation.z = -f;
      wings[1].rotation.z = f;
      body.position.y += s * 1.2;
    }
    this.blinkT -= dt;
    const blink = this.blinkT < 0.1 || this.state === 'sit' && Math.sin(t * 0.5) > 0.6;
    if (this.blinkT < 0) this.blinkT = 1.5 + Math.random() * 3;
    for (const e of this.eyes) e.scale.y = blink ? 0.2 : 1;
  }
  setTint(color) {
    this.root.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.copy(color); });
  }
}

// ---------------------------------------------------------------- first-person paws (cooking)
/** A big mole paw for first-person views. side: -1 left, 1 right. Pivot at the wrist. */
export function makePaw(side = 1, opts = {}) {
  const s = (opts.scale ?? 1) * V;
  const fur = opts.fur ?? 0x3a2e2a;
  const g = new VoxelGrid(14, 10, 22);
  // furry forearm (sleeve optional)
  g.box(3, 2, 0, 8, 7, 10, (x, y, z) => jitter(opts.sleeve ?? fur, x, y, z, 31 + side, 0.08));
  // fur cuff
  g.box(2, 1, 9, 10, 9, 3, (x, y, z) => jitter(fur, x, y, z, 32 + side, 0.1));
  // broad pink palm
  g.rbox(1, 1, 12, 12, 6, 7, (x, y, z) => jitter(y < 3 ? 0xe8909a : SKIN_PINK, x, y, z, 33 + side, 0.05), 1);
  // fingers / claws
  for (let i = 0; i < 5; i++) {
    const x = 1 + i * 2.5;
    g.box(Math.round(x), 2, 19, 2, 3, 2, SKIN_PINK);
    g.box(Math.round(x), 2, 21, 2, 2, 1, CLAW);
  }
  // dirt under claws, of course
  g.set(3, 2, 21, 0x6a4a30);
  g.set(8, 2, 21, 0x6a4a30);
  const mesh = voxelMesh(g, { pivot: [7, 5, 0], scale: s, kind: opts.kind || 'toon', outline: true });
  if (side < 0) mesh.scale.x = -1;
  const root = new THREE.Group();
  root.add(mesh);
  return root;
}

/** Quick portrait renderer: draws a character head-and-shoulders into a 2D canvas. */
export function renderPortrait(renderer, spec, size = 96) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x4a3050, 1.4));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2);
  dl.position.set(1, 2, 3);
  scene.add(dl);
  const rig = makeCharacter({ ...spec }, { kind: 'toon' });
  rig.update(0.016);
  scene.add(rig.root);
  const h = rig.height;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  cam.position.set(h * 0.35, h * 0.75, h * 2.6);
  cam.lookAt(0, h * 0.68, 0);
  const rt = new THREE.WebGLRenderTarget(size, size);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x221a2a, 1);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(prevRT);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
    img.data[di] = px[si]; img.data[di + 1] = px[si + 1]; img.data[di + 2] = px[si + 2]; img.data[di + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  rt.dispose();
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  return c;
}

export { LAYER_OUTLINE, clamp };
