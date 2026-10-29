// Voxel materials of the things the mole builds (registered into MAT and M by ../materials.js; ids 80..95, keys B_* so they never clash with M's own,
// claimed in docs/REMAKE.md). All `built: true` (placed by the player: they break whole, a block at a
// time, and give themselves back) and `made: true` (props and clumps leave them alone). Their faces
// are drawn by the terrain shader with block patterns on the 0.5 m build grid (./shader.js patches
// the terrain material at runtime). Pure data (it runs in the chunk workers too).
//
//   family   what breaking any voxel of it takes out and gives back (blocks.js FAMILY)
//   tool     the tool that breaks it properly ('pick' | 'axe' | 'shovel' | 'any'), see Dig.js
//   hp       how many good blows a block takes (with the right tool of tier 1, power 1)

export const BM = {
  B_COBBLE: 80, B_STONEBRICK: 81, B_CLAYBRICK: 82, B_PLANKS: 83, B_LOG_Y: 84, B_LOG_X: 85, B_LOG_Z: 86, B_GLASS: 87,
  B_DIRT: 88, B_TORCH: 89, B_LANTERN: 90, B_DOOR: 91, B_DOOR_CW: 92, B_DOOR_CCW: 93, B_CHEST: 94, B_BENCH: 95,
};

// style: [shader style name, plate scale (1/8 m voxels), seam strength]; the build shader replaces
// the look of every id here, BRICK keeps the generic chamfers off
const B = { built: true, made: true };
export const BUILD_MATS = {
  [BM.B_COBBLE]: { name: 'Cobblestone', tones: [0x44403e, 0x5a5552, 0x6f6965, 0x857e78], accent: 0x2a2624, hp: 2.2, snd: 'stone', style: ['BRICK', 2, 0.9], ...B },
  [BM.B_STONEBRICK]: { name: 'Stone Bricks', tones: [0x4c4a48, 0x625f5b, 0x77736e, 0x8d8882], accent: 0x34302e, hp: 2.6, snd: 'stone', style: ['BRICK', 4, 0.9], ...B },
  [BM.B_CLAYBRICK]: { name: 'Clay Bricks', tones: [0x6a2c1e, 0x833826, 0x98452e, 0xad5638], accent: 0xb9a68c, hp: 2.4, snd: 'stone', style: ['BRICK', 4, 0.9], ...B },
  [BM.B_PLANKS]: { name: 'Planks', tones: [0x6a4424, 0x81552e, 0x98683a, 0xae7c48], accent: 0x3c2614, hp: 1.4, snd: 'wood', style: ['BRICK', 8, 0.7], ...B },
  [BM.B_LOG_Y]: { name: 'Log', tones: [0x3e2616, 0x52341e, 0x6a4428, 0xb08a58], accent: 0xd2b07a, hp: 1.8, snd: 'wood', style: ['BRICK', 8, 0.7], ...B },
  [BM.B_LOG_X]: { name: 'Log', tones: [0x3e2616, 0x52341e, 0x6a4428, 0xb08a58], accent: 0xd2b07a, hp: 1.8, snd: 'wood', style: ['BRICK', 8, 0.7], ...B },
  [BM.B_LOG_Z]: { name: 'Log', tones: [0x3e2616, 0x52341e, 0x6a4428, 0xb08a58], accent: 0xd2b07a, hp: 1.8, snd: 'wood', style: ['BRICK', 8, 0.7], ...B },
  [BM.B_GLASS]: { name: 'Glass', tones: [0x9cc4cc, 0xbcdce0, 0xd8eef0, 0xf2fcfc], accent: 0xffffff, hp: 0.5, snd: 'ice', style: ['BRICK', 8, 0.2], ...B },
  [BM.B_DIRT]: { name: 'Dirt Block', tones: [0x4a2e1c, 0x5e3b24, 0x6e472c, 0x7d5536], accent: 0x9a7048, hp: 0.8, snd: 'dirt', style: ['BRICK', 2, 0.5], ...B },
  [BM.B_TORCH]: { name: 'Torch', tones: [0x1e1a1a, 0x2c2726, 0x3c3534, 0x4e4644], accent: 0x6a5a50, hp: 0.2, snd: 'wood', style: ['BRICK', 2, 0.3], ...B },
  [BM.B_LANTERN]: { name: 'Lantern', tones: [0x1e1a1a, 0x2c2726, 0x3c3534, 0x4e4644], accent: 0x6a5a50, hp: 0.4, snd: 'metal', style: ['BRICK', 2, 0.3], ...B },
  [BM.B_DOOR]: { name: 'Door', tones: [0x5e3a1e, 0x744828, 0x8a5832, 0x9e6a3e], accent: 0x2a2220, hp: 1.4, snd: 'wood', style: ['BRICK', 8, 0.7], ...B },
  [BM.B_DOOR_CW]: { name: 'Door', tones: [0x5e3a1e, 0x744828, 0x8a5832, 0x9e6a3e], accent: 0x2a2220, hp: 1.4, snd: 'wood', style: ['BRICK', 8, 0.7], ...B },
  [BM.B_DOOR_CCW]: { name: 'Door', tones: [0x5e3a1e, 0x744828, 0x8a5832, 0x9e6a3e], accent: 0x2a2220, hp: 1.4, snd: 'wood', style: ['BRICK', 8, 0.7], ...B },
  [BM.B_CHEST]: { name: 'Chest', tones: [0x5a3418, 0x744422, 0x8c562c, 0xa26a38], accent: 0xd8a83a, hp: 1.4, snd: 'wood', style: ['BRICK', 8, 0.7], ...B },
  [BM.B_BENCH]: { name: 'Workbench', tones: [0x5e3c20, 0x7a4e2a, 0x946436, 0xae7c46], accent: 0x8a9096, hp: 1.6, snd: 'wood', style: ['BRICK', 8, 0.7], ...B },
};
