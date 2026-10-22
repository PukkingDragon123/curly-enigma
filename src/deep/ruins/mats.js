// Voxel materials of the ruins (registered into MAT by ../materials.js; ids 96..115, all made by
// someone: `made: true`, so props and clumps can tell them from natural rock). The old ones built
// in fitted polygonal stone (big Voronoi plates with crisp seams), dressed dark basalt, carved
// friezes, tesserae mosaics (one voxel a tile), gold leaf, bronze gone green, glowing runes and
// warded seal-stone. Pure data (it runs in the chunk workers too).

export const RM = {
  RSTONE: 96, RDARK: 97, FRIEZE: 98, FLAG: 99,
  MOS_W: 100, MOS_R: 101, MOS_B: 102, MOS_G: 103, MOS_K: 104, MOS_T: 105,
  RUNE: 106, RUNEOFF: 107, WARD: 108, CRACKED: 109, GILT: 110, HOARD: 111, MARBLE: 112, BRONZE: 113,
  RUNE_R: 114, // a warm red rune (fire, ember shrines)
};

// style: [shader style name, plate scale (1/8 m voxels), seam strength]
export const RUIN_MATS = {
  [RM.RSTONE]: { name: 'Fitted Stone', tones: [0x6a6052, 0x7e7464, 0x928876, 0xa69c88], accent: 0xc4baa2, hp: 3.2, snd: 'stone', style: ['ROCK', 3.6, 1.0], made: true },
  [RM.RDARK]: { name: 'Dressed Basalt', tones: [0x2e2c34, 0x3a3842, 0x46444e, 0x54525c], accent: 0x8a8698, hp: 3.6, snd: 'stone', style: ['ROCK', 2.6, 0.95], made: true },
  [RM.FRIEZE]: { name: 'Carved Frieze', tones: [0x5e5444, 0x6e6450, 0x7e745e, 0x8e846c], accent: 0xb0a486, hp: 3, snd: 'stone', style: ['ROCK', 0.8, 0.45], made: true },
  [RM.FLAG]: { name: 'Worn Flagstone', tones: [0x5a5248, 0x6a6256, 0x7a7264, 0x8a8272], accent: 0xa89e8c, hp: 3, snd: 'stone', style: ['ROCK', 4.4, 0.9], made: true },
  [RM.MOS_W]: { name: 'Mosaic', tones: [0xb8ab8c, 0xc6ba9a, 0xd2c6a6, 0xdcd2b4], accent: 0xeee4c8, hp: 2.6, snd: 'stone', style: ['ROCK', 0.55, 0.85], made: true },
  [RM.MOS_R]: { name: 'Mosaic', tones: [0x7e3424, 0x8e3c2a, 0x9c4430, 0xa84c36], accent: 0xc86a4a, hp: 2.6, snd: 'stone', style: ['ROCK', 0.55, 0.85], made: true },
  [RM.MOS_B]: { name: 'Mosaic', tones: [0x1e3e72, 0x24487e, 0x2a528a, 0x325c94], accent: 0x5a86c0, hp: 2.6, snd: 'stone', style: ['ROCK', 0.55, 0.85], made: true },
  [RM.MOS_G]: { name: 'Gold Mosaic', tones: [0xa87a22, 0xbc8a2a, 0xcc9a32, 0xdaaa3c], accent: 0xffe08a, hp: 2.6, snd: 'stone', style: ['ROCK', 0.55, 0.8], glow: 0.1, made: true },
  [RM.MOS_K]: { name: 'Mosaic', tones: [0x1a1618, 0x221e20, 0x2a2628, 0x322e30], accent: 0x4a4448, hp: 2.6, snd: 'stone', style: ['ROCK', 0.55, 0.85], made: true },
  [RM.MOS_T]: { name: 'Jade Mosaic', tones: [0x1e5a4c, 0x246a58, 0x2a7a64, 0x32886e], accent: 0x6ac0a0, hp: 2.6, snd: 'stone', style: ['ROCK', 0.55, 0.85], made: true },
  [RM.RUNE]: { name: 'Glowing Rune', tones: [0x1ea8bc, 0x3cc8d8, 0x6ae4ec, 0xa8fcff], accent: 0xffffff, hp: 3, snd: 'crystal', style: ['GLOW', 1, 0.2], glow: 1, made: true },
  [RM.RUNE_R]: { name: 'Ember Rune', tones: [0xc04018, 0xe06020, 0xf88a30, 0xffc070], accent: 0xfff0c0, hp: 3, snd: 'crystal', style: ['GLOW', 1, 0.2], glow: 1, made: true },
  [RM.RUNEOFF]: { name: 'Carved Rune', tones: [0x1e2a30, 0x24343a, 0x2c3e44, 0x34484e], accent: 0x4a8a94, hp: 3, snd: 'stone', style: ['ROCK', 1, 0.3], glow: 0.06, made: true },
  [RM.WARD]: { name: 'Warded Seal', tones: [0x221830, 0x2c2040, 0x36284c, 0x42305a], accent: 0xb48aff, hp: 9999, snd: 'crystal', style: ['CRYSTAL', 2.4, 0.9], glow: 0.22, made: true, ward: true },
  [RM.CRACKED]: { name: 'Cracked Stone', tones: [0x5e5548, 0x726858, 0x867c6a, 0x9a907c], accent: 0x3a3228, hp: 0.9, snd: 'stone', style: ['ROCK', 1.3, 1.0], made: true },
  [RM.GILT]: { name: 'Gilded Stone', tones: [0x8a5e18, 0xae7c24, 0xd09c34, 0xeec060], accent: 0xfff2b8, hp: 3, snd: 'crystal', style: ['ROCK', 1.6, 0.5], glow: 0.14, made: true },
  [RM.HOARD]: { name: 'Gold Hoard', tones: [0x9a6a14, 0xc08a20, 0xe2ae36, 0xfad260], accent: 0xfffbe0, hp: 0.35, snd: 'gravel', style: ['GRAIN', 1, 0.2], glow: 0.3, made: true, hoard: true },
  [RM.MARBLE]: { name: 'Weathered Marble', tones: [0x8a867e, 0xa09c92, 0xb6b2a6, 0xcac6ba], accent: 0xe4e0d4, hp: 2.8, snd: 'stone', style: ['ROCK', 4.6, 0.25], made: true },
  [RM.BRONZE]: { name: 'Verdigris Bronze', tones: [0x2a5444, 0x367058, 0x4a8c68, 0x6eaa80], accent: 0xc8944a, hp: 3, snd: 'crystal', style: ['ROCK', 0.9, 0.35], made: true },
};
