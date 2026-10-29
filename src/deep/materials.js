// Voxel materials of the underground: palettes (packed into a texture for the terrain shader),
// hardness, granularity, glow, fluids, and ore materials (ORE_BASE + ore id).
import * as THREE from 'three';
import { ORES } from '../data/ores.js';
import { ITEMS } from '../data/items.js';
import { RM, RUIN_MATS } from './ruins/mats.js';
import { BM, BUILD_MATS } from './build/mats.js'; // building part: placed blocks (ids 80..95)

export const VOX = 16; // voxels per meter (6.25 cm voxels)
/** Plate and style scales in the tables below are authored for 1/8 m voxels. */
export const VK = VOX / 8;
export const ORE_BASE = 128;

export const M = {
  AIR: 0, DIRT: 1, LOAM: 2, CLAY: 3, STONE: 4, MUDSTONE: 5, LIMESTONE: 6, GRANITE: 7, CRYSTALROCK: 8,
  BASALT: 9, OBSIDIAN: 10, MAGMAROCK: 11, PERMAFROST: 12, ICE: 13, CORE: 14, STARROCK: 15, VOIDROCK: 16,
  BEDROCK: 17, ROOTS: 18, GRAVEL: 19, SAND: 20, TIMBER: 21, BOARDS: 22, BURROW: 23, CRYSTAL: 24,
  LANTERN: 25, RUBBLE: 26, SNOW: 27, ASH: 28, GEODE: 29, MOSS: 30, BRICK: 31, DOOR: 32, LADDER: 33,
  SANDSTONE: 34, GLOWCAP: 35, STEM: 36, MYCEL: 37, VINES: 38, BONE: 39,
  WATER: 40, LAVA: 41, FERN: 42,
};

/**
 * name, tones (dark → light), accent (specks/veins), hp (hits-ish), gran (pours when unsupported),
 * glow (0..1 emissive), snd, fluid, rough (how ragged its dug faces are, 0..1)
 */
const DEF = {
  [M.DIRT]: { name: 'Packed Dirt', tones: [0x4a2e1c, 0x5e3b24, 0x6e472c, 0x7d5536], accent: 0x9a7048, hp: 1, snd: 'dirt' },
  [M.LOAM]: { name: 'Rooty Loam', tones: [0x3a2618, 0x4b3120, 0x5a3c27, 0x684630], accent: 0x8a6a3a, hp: 0.8, snd: 'dirt' },
  [M.CLAY]: { name: 'Clay', tones: [0x7a3e24, 0x8e4a2c, 0xa05634, 0xb2643e], accent: 0xc87a50, hp: 1.3, snd: 'dirt' },
  [M.STONE]: { name: 'Stone', tones: [0x4a4644, 0x5c5754, 0x6c6662, 0x7c7672], accent: 0x948c86, hp: 2.2, snd: 'stone' },
  [M.MUDSTONE]: { name: 'Mudstone', tones: [0x4e3a2e, 0x5e4636, 0x6c5240, 0x7a5e4a], accent: 0x8e7058, hp: 1.8, snd: 'stone' },
  [M.LIMESTONE]: { name: 'Limestone', tones: [0x8a8070, 0x9c9282, 0xaea494, 0xbeb4a4], accent: 0xd0c8b8, hp: 1.9, snd: 'stone' },
  [M.GRANITE]: { name: 'Granite', tones: [0x4a4450, 0x5c5462, 0x6e6474, 0x807688], accent: 0xc8a8b8, hp: 3, snd: 'stone' },
  [M.CRYSTALROCK]: { name: 'Crystal Rock', tones: [0x3a3a5a, 0x4a4a70, 0x5a5a86, 0x6a6a9a], accent: 0xb8b8ff, hp: 3, snd: 'crystal', glow: 0.1 },
  [M.BASALT]: { name: 'Basalt', tones: [0x26222a, 0x322c36, 0x3e3842, 0x4a4450], accent: 0x6a5a6a, hp: 3.4, snd: 'stone' },
  [M.OBSIDIAN]: { name: 'Obsidian', tones: [0x120c1a, 0x1e1428, 0x2a1e38, 0x3a2a4a], accent: 0x8a7ab0, hp: 4.5, snd: 'crystal' },
  [M.MAGMAROCK]: { name: 'Magma Rock', tones: [0x3a1a14, 0x5a2618, 0x7a301c, 0x9a3a20], accent: 0xff8a3a, hp: 3.2, snd: 'stone', glow: 0.25 },
  [M.PERMAFROST]: { name: 'Permafrost', tones: [0x4a6a7a, 0x5a7c8c, 0x6a8e9e, 0x7aa0b0], accent: 0xd8f0ff, hp: 2.6, snd: 'ice' },
  [M.ICE]: { name: 'Ice', tones: [0x6aa8c8, 0x82bcd8, 0x9ad0e6, 0xb4e2f2], accent: 0xffffff, hp: 2, snd: 'ice', glow: 0.08 },
  [M.CORE]: { name: 'Core Rock', tones: [0x2a1a3a, 0x3a2650, 0x4a3266, 0x5a3e7a], accent: 0xc89aff, hp: 4, snd: 'crystal', glow: 0.12 },
  [M.STARROCK]: { name: 'Star Rock', tones: [0x1a1a34, 0x24244a, 0x2e2e5e, 0x3a3a72], accent: 0xffe08a, hp: 4.2, snd: 'crystal', glow: 0.15 },
  [M.VOIDROCK]: { name: 'Void Rock', tones: [0x0e0618, 0x180c28, 0x221238, 0x2c1848], accent: 0x8a5ae0, hp: 4.6, snd: 'crystal', glow: 0.1 },
  [M.BEDROCK]: { name: 'Bedrock', tones: [0x141012, 0x1c181a, 0x242022, 0x2c282a], accent: 0x3a3438, hp: 9999, snd: 'stone' },
  [M.ROOTS]: { name: 'Tangled Roots', tones: [0x3a2414, 0x4e321c, 0x624026, 0x7a5232], accent: 0xa07848, hp: 0.9, snd: 'wood' },
  [M.GRAVEL]: { name: 'Gravel', tones: [0x4a4440, 0x5e5650, 0x726a62, 0x867c74], accent: 0xa0968c, hp: 0.6, snd: 'gravel', gran: true },
  [M.SAND]: { name: 'Sand', tones: [0x9a7a4a, 0xae8c58, 0xc09e68, 0xd0b078], accent: 0xe0c890, hp: 0.4, snd: 'sand', gran: true },
  [M.TIMBER]: { name: 'Old Timber', tones: [0x4a2c16, 0x5e3a1e, 0x724828, 0x865834], accent: 0x9aa0a8, hp: 2.5, snd: 'wood' },
  [M.BOARDS]: { name: 'Boards', tones: [0x5a3a1e, 0x704a28, 0x865a32, 0x9a6c3e], accent: 0xc8c8d0, hp: 1.6, snd: 'wood' },
  [M.LADDER]: { name: 'Ladder', tones: [0x5e3a1c, 0x74482a, 0x8a5a34, 0x9e6c40], accent: 0xb0b4bc, hp: 0.8, snd: 'wood' },
  [M.DOOR]: { name: 'Burrow Door', tones: [0x6a4424, 0x80542e, 0x966438, 0xaa7644], accent: 0xffd890, hp: 9999, snd: 'wood', glow: 0.06 },
  [M.BURROW]: { name: 'Burrow Wall', tones: [0x5a3820, 0x6e4628, 0x825432, 0x96643c], accent: 0xd8a860, hp: 9999, snd: 'wood' },
  [M.CRYSTAL]: { name: 'Crystal Cluster', tones: [0x6a6ac8, 0x8a8ae0, 0xaaaaf2, 0xd0d0ff], accent: 0xffffff, hp: 2.2, snd: 'crystal', glow: 0.55 },
  [M.LANTERN]: { name: 'Lantern', tones: [0xc87a2a, 0xe8a040, 0xffc860, 0xffe8a0], accent: 0xffffff, hp: 9999, snd: 'wood', glow: 1 },
  [M.RUBBLE]: { name: 'Rubble', tones: [0x4a4440, 0x5a524c, 0x6a625a, 0x7a7068], accent: 0x948a80, hp: 0.5, snd: 'gravel', gran: true },
  [M.SNOW]: { name: 'Snow', tones: [0xb0c4d8, 0xc4d6e8, 0xd8e6f4, 0xecf4ff], accent: 0xffffff, hp: 0.3, snd: 'sand', gran: true },
  [M.ASH]: { name: 'Ash', tones: [0x3a3634, 0x4a4644, 0x5a5654, 0x6a6664], accent: 0xff7a2a, hp: 0.4, snd: 'sand', gran: true },
  [M.GEODE]: { name: 'Geode Shell', tones: [0x4a3a5a, 0x5a4a6a, 0x6a5a7a, 0x7a6a8a], accent: 0xc89aff, hp: 3, snd: 'crystal' },
  [M.MOSS]: { name: 'Glow Moss', tones: [0x1e4a2a, 0x2a6a36, 0x368a44, 0x48a852], accent: 0x9affb0, hp: 0.5, snd: 'dirt', glow: 0.35 },
  [M.SANDSTONE]: { name: 'Sandstone', tones: [0x8a6440, 0x9e744a, 0xb08454, 0xc29660], accent: 0xdcb47a, hp: 1.5, snd: 'stone' },
  [M.GLOWCAP]: { name: 'Glowcap', tones: [0x3a6a9a, 0x4e8ac0, 0x66aadc, 0x8ad0f4], accent: 0xd8f4ff, hp: 0.35, snd: 'dirt', glow: 0.75 },
  [M.STEM]: { name: 'Mushroom Stem', tones: [0x9a8a7a, 0xb0a08e, 0xc4b4a2, 0xd6c8b6], accent: 0xe8dccc, hp: 0.6, snd: 'wood' },
  [M.MYCEL]: { name: 'Mycelium', tones: [0x4a3a4e, 0x5a4860, 0x6a5672, 0x7a6684], accent: 0xb89ad0, hp: 0.6, snd: 'dirt', glow: 0.08 },
  [M.VINES]: { name: 'Hanging Vines', tones: [0x1e4224, 0x2a5a30, 0x367240, 0x448a4e], accent: 0x8ae09a, hp: 0.2, snd: 'dirt', glow: 0.18 },
  [M.BONE]: { name: 'Ancient Bone', tones: [0xa89a80, 0xbcae94, 0xd0c4aa, 0xe2d8c0], accent: 0xf2ecdc, hp: 1.6, snd: 'stone' },
  [M.FERN]: { name: 'Cave Fern', tones: [0x1a4a2a, 0x266a36, 0x348a44, 0x46a858], accent: 0xa8ffb0, hp: 0.15, snd: 'dirt', glow: 0.22 },
  [M.BRICK]: { name: 'Old Brick', tones: [0x5a2a1e, 0x6e3424, 0x823e2a, 0x964a32], accent: 0xb8a890, hp: 4, snd: 'stone' },
  [M.WATER]: { name: 'Water', tones: [0x14325a, 0x1a4270, 0x225488, 0x2c66a0], accent: 0xa8d8ff, hp: 0, fluid: 1 },
  [M.LAVA]: { name: 'Lava', tones: [0xa82a08, 0xd8460c, 0xff7a1a, 0xffb43a], accent: 0xfff0a0, hp: 0, fluid: 2, glow: 1 },
};

// surface styles for the terrain shader
export const STYLE = { ROCK: 0, SOIL: 1, CRYSTAL: 2, WOOD: 3, BRICK: 4, MOSS: 5, ORE: 6, GLOW: 7, ICE: 8, FLUID: 9, GRAIN: 10 };
const STYLE_OF = {
  [M.DIRT]: [STYLE.SOIL, 1.6, 0.5], [M.LOAM]: [STYLE.SOIL, 1.5, 0.45], [M.CLAY]: [STYLE.SOIL, 2, 0.55], [M.STONE]: [STYLE.ROCK, 2.6, 0.8],
  [M.MUDSTONE]: [STYLE.ROCK, 2.4, 0.7], [M.LIMESTONE]: [STYLE.ROCK, 3, 0.6], [M.GRANITE]: [STYLE.ROCK, 2.8, 0.85], [M.CRYSTALROCK]: [STYLE.CRYSTAL, 2.6, 0.9],
  [M.BASALT]: [STYLE.ROCK, 2.4, 0.9], [M.OBSIDIAN]: [STYLE.CRYSTAL, 3, 0.8], [M.MAGMAROCK]: [STYLE.ROCK, 2.4, 0.9], [M.PERMAFROST]: [STYLE.ICE, 2.6, 0.6],
  [M.ICE]: [STYLE.ICE, 3.2, 0.4], [M.CORE]: [STYLE.CRYSTAL, 2.6, 0.85], [M.STARROCK]: [STYLE.CRYSTAL, 2.6, 0.85], [M.VOIDROCK]: [STYLE.CRYSTAL, 2.6, 0.9],
  [M.BEDROCK]: [STYLE.ROCK, 3, 1], [M.ROOTS]: [STYLE.SOIL, 1.4, 0.7], [M.GRAVEL]: [STYLE.GRAIN, 1, 0.8], [M.SAND]: [STYLE.GRAIN, 1, 0.3],
  [M.TIMBER]: [STYLE.WOOD, 8, 0.7], [M.BOARDS]: [STYLE.WOOD, 8, 0.7], [M.BURROW]: [STYLE.WOOD, 8, 0.5], [M.DOOR]: [STYLE.WOOD, 8, 0.9], [M.LADDER]: [STYLE.WOOD, 8, 0.9], [M.CRYSTAL]: [STYLE.CRYSTAL, 2, 0.6],
  [M.LANTERN]: [STYLE.GLOW, 2, 0.2], [M.RUBBLE]: [STYLE.GRAIN, 1.5, 0.8], [M.SNOW]: [STYLE.GRAIN, 1, 0.2], [M.ASH]: [STYLE.GRAIN, 1, 0.4],
  [M.GEODE]: [STYLE.ROCK, 2.2, 0.8], [M.MOSS]: [STYLE.MOSS, 2.2, 0.5],
  [M.SANDSTONE]: [STYLE.ROCK, 2.2, 0.3], [M.GLOWCAP]: [STYLE.GLOW, 1.5, 0.25], [M.STEM]: [STYLE.SOIL, 1.2, 0.3], [M.MYCEL]: [STYLE.MOSS, 2, 0.5], [M.VINES]: [STYLE.MOSS, 1.4, 0.4], [M.BONE]: [STYLE.SOIL, 1.6, 0.35], [M.FERN]: [STYLE.MOSS, 1.2, 0.3], [M.BRICK]: [STYLE.BRICK, 4, 0.9], [M.WATER]: [STYLE.FLUID, 4, 0], [M.LAVA]: [STYLE.FLUID, 4, 0],
};

export const MAT = [];
for (let i = 0; i < 256; i++) MAT.push(null);
for (const [id, d] of Object.entries(DEF)) MAT[id] = { id: +id, hp: 1, glow: 0, gran: false, fluid: 0, style: STYLE_OF[id] || [STYLE.ROCK, 4, 0.7], ...d };
// the ruins' carved stone, mosaics, runes and seals (ids 96+, src/deep/ruins/mats.js)
Object.assign(M, RM);
for (const [id, d] of Object.entries(RUIN_MATS)) MAT[id] = { id: +id, hp: 1, glow: 0, gran: false, fluid: 0, ...d, style: [STYLE[d.style[0]], d.style[1], d.style[2]] };
// what the mole builds: blocks, logs, glass, torches, doors, chests (ids 80-95, src/deep/build/mats.js)
Object.assign(M, BM);
for (const [id, d] of Object.entries(BUILD_MATS)) MAT[id] = { id: +id, hp: 1, glow: 0, gran: false, fluid: 0, ...d, style: [STYLE[d.style[0]], d.style[1], d.style[2]] };

// The folk's burrows (gen/burrows.js, NPC burrows part): fittings a pick doesn't dig (unbreakable),
// ids 120-127 (the ruins have 96-119) so ore deposits (< 40 only) and trail floors leave them alone.
Object.assign(M, { FLOORBOARD: 120, PLASTER: 121, TARP: 122, IRONPLATE: 123, FLAGSTONE: 124, STAINED: 125, COMPOST: 126, CRATEWOOD: 127 });
for (const [id, d] of Object.entries({
  [M.FLOORBOARD]: { name: 'Floorboards', tones: [0x6a4424, 0x7e5430, 0x94663a, 0xa87846], accent: 0xd8b07a, snd: 'wood', style: [STYLE.WOOD, 8, 0.6] },
  [M.PLASTER]: { name: 'Limewash', tones: [0xa89878, 0xbcac8a, 0xccbe9c, 0xdad0b0], accent: 0x8a7a5a, snd: 'dirt', style: [STYLE.SOIL, 3, 0.25] },
  [M.TARP]: { name: 'Oilcloth Tarp', tones: [0x3a3c26, 0x4a4c30, 0x5a5c3a, 0x6a6c46], accent: 0x8a7a4a, snd: 'dirt', style: [STYLE.SOIL, 4, 0.5] },
  [M.IRONPLATE]: { name: 'Iron Plate', tones: [0x2c2e34, 0x3a3d44, 0x484c54, 0x585c66], accent: 0x9aa0aa, snd: 'metal', style: [STYLE.ROCK, 6, 0.9] },
  [M.FLAGSTONE]: { name: 'Flagstones', tones: [0x4a4642, 0x58534e, 0x66605a, 0x746d66], accent: 0x8c847a, snd: 'stone', style: [STYLE.ROCK, 3.4, 1] },
  [M.STAINED]: { name: 'Stained Wood', tones: [0x3a2414, 0x4a2e1a, 0x5a3820, 0x6a4428], accent: 0xb08850, snd: 'wood', style: [STYLE.WOOD, 8, 0.8] },
  [M.COMPOST]: { name: 'Compost', tones: [0x2a1c14, 0x34241a, 0x3e2c20, 0x4a3626], accent: 0x6a5a3a, snd: 'dirt', style: [STYLE.SOIL, 1.4, 0.4] },
  [M.CRATEWOOD]: { name: 'Crate Wood', tones: [0x6a4a26, 0x80592e, 0x966a38, 0xaa7c44], accent: 0x4a3018, snd: 'wood', style: [STYLE.WOOD, 8, 0.9] },
})) MAT[id] = { id: +id, hp: 9999, unbreakable: true, glow: 0, gran: false, fluid: 0, ...d };

// ore voxels: colors from the item art
for (let o = 1; o < ORES.length; o++) {
  const ore = ORES[o];
  const it = ITEMS[ore.item];
  if (!it) continue;
  const ic = it.icon || {};
  const c = ic.ore || ic.c || [0x202020, 0x404040, 0x101010];
  const main = c[0], light = c[1] ?? c[0], dark = c[2] ?? c[0];
  MAT[ORE_BASE + o] = {
    id: ORE_BASE + o, name: it.name, ore: o, item: ore.item, hp: 2.4 * ore.hardMul,
    tones: [dark, main, main, light], accent: light, glow: ore.glow ? 0.7 : (ic.glow ? 0.5 : 0.12), snd: 'crystal',
    style: [STYLE.ORE, 1.5, 0.7],
  };
}

export const isOreM = (m) => m >= ORE_BASE;
export const solidM = (m) => m !== 0 && !(MAT[m] && MAT[m].fluid);
export const fluidM = (m) => !!(MAT[m] && MAT[m].fluid);
export const granM = (m) => !!(MAT[m] && MAT[m].gran);

const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

/**
 * 256 x 8 palette texture: columns 0..3 tones, 4 accent, 5 (r = glow, g = fluid, b = granular).
 * Stored linear so the shader can light it directly.
 */
export function makePaletteTexture() {
  const W = 8, H = 256;
  const data = new Uint8Array(W * H * 4);
  for (let m = 0; m < 256; m++) {
    const d = MAT[m];
    if (!d) continue;
    const put = (col, hex) => {
      const o = (m * W + col) * 4;
      data[o] = Math.round(srgbToLin((hex >> 16) & 255) * 255);
      data[o + 1] = Math.round(srgbToLin((hex >> 8) & 255) * 255);
      data[o + 2] = Math.round(srgbToLin(hex & 255) * 255);
      data[o + 3] = 255;
    };
    d.tones.forEach((t, i) => put(i, t));
    put(4, d.accent);
    const o = (m * W + 5) * 4;
    data[o] = Math.round((d.glow || 0) * 255);
    data[o + 1] = (d.fluid || 0) * 100;
    data[o + 2] = d.gran ? 255 : 0;
    data[o + 3] = 255;
    // column 6: style id, plate scale (voxels × 16), seam strength, dirt base for moss
    const st = d.style || [0, 4, 0.7];
    const o6 = (m * W + 6) * 4;
    data[o6] = st[0];
    data[o6 + 1] = Math.min(255, Math.round(st[1] * VK * 16));
    data[o6 + 2] = Math.round(st[2] * 255);
    data[o6 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** sRGB hex color of a voxel (for debris and pickups), with per-voxel variation. */
export function voxelColor(m, x, y, z, h) {
  const d = MAT[m];
  if (!d) return 0x808080;
  const k = h < 0.12 ? 4 : h < 0.35 ? 0 : h < 0.6 ? 1 : h < 0.85 ? 2 : 3;
  return k === 4 ? d.accent : d.tones[k];
}
