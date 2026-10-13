// Mine block materials (the voxel "rock" you dig through).
// hp: hits-worth of health (pick power 1 ≈ 1 hp per hit); tier: minimum pickaxe tier;
// snd: hit/break sound family; phys: 'solid' | 'granular' (falls) | 'none' (not solid);
// span: how wide an unsupported ceiling of this material can stay up; debris: chunk colors.

export const B = {
  AIR: 0, DIRT: 1, LOAM: 2, CLAY: 3, SAND: 4, GRAVEL: 5, STONE: 6, MUDSTONE: 7, GRANITE: 8, CRYSTALROCK: 9,
  BASALT: 10, OBSIDIAN: 11, MAGMAROCK: 12, ASH: 13, PERMAFROST: 14, ICE: 15, SNOW: 16, CORE: 17, STARROCK: 18,
  VOIDROCK: 19, BEDROCK: 20, ROOTS: 21, QUAKE: 22, RUBBLE: 23, TIMBER: 24, GEODE: 25, LIMESTONE: 26,
};

export const BLOCKS = [];
function def(id, o) { BLOCKS[id] = { id, ...o }; }

def(B.AIR, { name: 'Air', phys: 'none' });
def(B.DIRT, { name: 'Dirt', hp: 1.2, tier: 0, snd: 'dirt', phys: 'solid', span: 3, color: 0x6b4a32, debris: [0x6b4a32, 0x5a3c28, 0x7a5a3a], dust: 0x8a6a4a });
def(B.LOAM, { name: 'Rooty Loam', hp: 1.6, tier: 0, snd: 'dirt', phys: 'solid', span: 4, color: 0x4a3424, debris: [0x4a3424, 0x3a2818, 0x6a4a2a], dust: 0x6a4a32 });
def(B.CLAY, { name: 'Clay', hp: 2.6, tier: 0, snd: 'clay', phys: 'solid', span: 5, color: 0xb06a3a, debris: [0xb06a3a, 0x9a5a30, 0xc87a48], dust: 0xc89070, bounce: 0.05 });
def(B.SAND, { name: 'Sand', hp: 0.8, tier: 0, snd: 'sand', phys: 'granular', span: 0, color: 0xd8b878, debris: [0xd8b878, 0xc8a868, 0xe8c888], dust: 0xe8d0a0 });
def(B.GRAVEL, { name: 'Gravel', hp: 1.4, tier: 0, snd: 'stone', phys: 'granular', span: 0, color: 0x8a8480, debris: [0x8a8480, 0x6a6460, 0xa8a4a0], dust: 0xa8a098 });
def(B.STONE, { name: 'Stone', hp: 3.2, tier: 1, snd: 'stone', phys: 'solid', span: 7, color: 0x8a8480, debris: [0x8a8480, 0x6e6864, 0xa09a96], dust: 0xb0aaa4 });
def(B.LIMESTONE, { name: 'Limestone', hp: 2.6, tier: 1, snd: 'stone', phys: 'solid', span: 6, color: 0xc8bca0, debris: [0xc8bca0, 0xb0a488, 0xe0d4b8], dust: 0xe0d8c8 });
def(B.MUDSTONE, { name: 'Mudstone', hp: 3.0, tier: 1, snd: 'stone', phys: 'solid', span: 6, color: 0x7a6250, debris: [0x7a6250, 0x5a4838, 0x8a7260], dust: 0x9a8270 });
def(B.GRANITE, { name: 'Granite', hp: 5.5, tier: 2, snd: 'hard', phys: 'solid', span: 9, color: 0x9a8a88, debris: [0x9a8a88, 0x6a5a5a, 0xc8b8b8], dust: 0xc0b4b0 });
def(B.CRYSTALROCK, { name: 'Crystal Rock', hp: 5.0, tier: 2, snd: 'crystal', phys: 'solid', span: 8, color: 0x5a5a7a, debris: [0x5a5a7a, 0x8a8ac8, 0xc8c8ff], dust: 0x9a9ad0 });
def(B.BASALT, { name: 'Basalt', hp: 8, tier: 3, snd: 'hard', phys: 'solid', span: 10, color: 0x3a3a40, debris: [0x3a3a40, 0x2a2a30, 0x5a5a60], dust: 0x6a6a70 });
def(B.OBSIDIAN, { name: 'Obsidian', hp: 13, tier: 4, snd: 'crystal', phys: 'solid', span: 12, color: 0x1e1626, debris: [0x1e1626, 0x3a2a4a, 0x6a5a8a], dust: 0x4a3a5a, drop: 'obsidian_shard', dropChance: 0.3 });
def(B.MAGMAROCK, { name: 'Magma Rock', hp: 9, tier: 3, snd: 'hard', phys: 'solid', span: 9, color: 0x3a1a14, debris: [0x3a1a14, 0xd9582a, 0x5a2a1a], dust: 0x6a3a2a, hot: true, glow: 0xff5a1a });
def(B.ASH, { name: 'Ash', hp: 0.7, tier: 0, snd: 'sand', phys: 'granular', span: 0, color: 0x6a6460, debris: [0x6a6460, 0x5a5450, 0x8a8480], dust: 0x9a948e });
def(B.PERMAFROST, { name: 'Permafrost', hp: 12, tier: 4, snd: 'ice', phys: 'solid', span: 10, color: 0x9ab8c8, debris: [0x9ab8c8, 0xd8f0ff, 0x6a8a9a], dust: 0xe0f4ff, cold: true });
def(B.ICE, { name: 'Ice', hp: 3, tier: 2, snd: 'ice', phys: 'solid', span: 6, color: 0x9ae0f0, debris: [0x9ae0f0, 0xe0f8ff, 0x6ac0e0], dust: 0xe0f8ff, slippery: true });
def(B.SNOW, { name: 'Packed Snow', hp: 0.8, tier: 0, snd: 'sand', phys: 'granular', span: 0, color: 0xe8f4ff, debris: [0xe8f4ff, 0xc8d8f0, 0xffffff], dust: 0xffffff });
def(B.CORE, { name: 'Coreite', hp: 17, tier: 5, snd: 'hard', phys: 'solid', span: 14, color: 0x2a1a3a, debris: [0x2a1a3a, 0x5a3a7a, 0xc89aff], dust: 0x7a5a9a, hot: true });
def(B.STARROCK, { name: 'Star Rock', hp: 20, tier: 5, snd: 'crystal', phys: 'solid', span: 14, color: 0x1a1a3a, debris: [0x1a1a3a, 0x3a3a6a, 0xffe08a], dust: 0x5a5a8a });
def(B.VOIDROCK, { name: 'Void Rock', hp: 22, tier: 6, snd: 'hard', phys: 'solid', span: 16, color: 0x100818, debris: [0x100818, 0x2a1440, 0x6a3ab0], dust: 0x3a2050 });
def(B.BEDROCK, { name: 'Bedrock', hp: Infinity, tier: 99, snd: 'hard', phys: 'solid', span: 999, color: 0x1a1618, debris: [0x1a1618], dust: 0x3a3438 });
def(B.ROOTS, { name: 'Tangled Roots', hp: 2, tier: 0, snd: 'wood', phys: 'solid', span: 4, color: 0x7a5030, debris: [0x7a5030, 0x5a3820, 0x9a6a40], dust: 0x8a6a4a, flammable: true });
def(B.QUAKE, { name: 'Quakestone', hp: 3.5, tier: 1, snd: 'stone', phys: 'solid', span: 3, color: 0x8a4a3a, debris: [0x8a4a3a, 0x6a3a2a, 0xb06a5a], dust: 0xa87a6a, quake: true });
def(B.RUBBLE, { name: 'Rubble', hp: 1.0, tier: 0, snd: 'stone', phys: 'granular', span: 0, color: 0x7a706a, debris: [0x7a706a, 0x5a524c, 0x9a908a], dust: 0xa09890 });
def(B.TIMBER, { name: 'Shaft Timber', hp: Infinity, tier: 99, snd: 'wood', phys: 'solid', span: 999, color: 0x8a5a32, debris: [0x8a5a32], dust: 0x9a7a5a });
def(B.GEODE, { name: 'Geode Shell', hp: 4, tier: 2, snd: 'crystal', phys: 'solid', span: 8, color: 0x7a6a8a, debris: [0x7a6a8a, 0xc89aff, 0xe8d8ff], dust: 0xc8b8e0 });

export const isSolid = (id) => BLOCKS[id] && BLOCKS[id].phys !== 'none';
export const isGranular = (id) => BLOCKS[id] && BLOCKS[id].phys === 'granular';

/**
 * Ores embedded in blocks. item: what drops. hardMul: matrix hp multiplier.
 * frag: how much quality a direct pick hit chips (per hit, scaled by tool power);
 * vib: sensitivity to nearby strikes; tags: special behaviors.
 */
export const ORES = [null];
export const ORE_ID = {};
function ore(item, o) {
  const id = ORES.length;
  ORES.push({ id, item, hardMul: 1.4, frag: 12, vib: 1, tier: 0, tags: [], ...o });
  ORE_ID[item] = id;
}
ore('coal', { hardMul: 1.0, frag: 8, tags: ['flammable'] });
ore('copper_ore', { frag: 10 });
ore('tin_ore', { frag: 10 });
ore('salt_crystal', { hardMul: 1.0, frag: 14, tags: ['soluble'] });
ore('fossil', { hardMul: 1.2, frag: 30, vib: 2.2 });
ore('quartz', { frag: 14 });
ore('iron_ore', { hardMul: 1.5, frag: 9 });
ore('amber', { hardMul: 1.1, frag: 16 });
ore('lumite', { frag: 12, tags: ['glow'], glow: 0x9dff9a });
ore('silver_ore', { hardMul: 1.5, frag: 10 });
ore('echo_crystal', { frag: 18, vib: 5, tags: ['resonant'] });
ore('gravium', { frag: 12, tags: ['float'] });
ore('bioxide', { frag: 14, tags: ['electric', 'explosive', 'glow'], glow: 0x7fe7ff });
ore('amethyst', { frag: 14 });
ore('gold_ore', { hardMul: 1.6, frag: 11 });
ore('ruby', { hardMul: 1.8, frag: 13 });
ore('magmaite', { frag: 12, tags: ['hot', 'glow'], glow: 0xff7a2a });
ore('emerald', { hardMul: 1.8, frag: 13 });
ore('frostite', { frag: 12, tags: ['cold', 'glow'], glow: 0xaef4ff });
ore('sapphire', { hardMul: 1.9, frag: 13 });
ore('mithril_ore', { hardMul: 1.8, frag: 10, tier: 4 });
ore('moonsilver_ore', { hardMul: 1.4, frag: 12, tags: ['tarnish', 'glow'], glow: 0xd8dcff });
ore('diamond', { hardMul: 2.6, frag: 0, vib: 0, tier: 4 });
ore('voidstone', { hardMul: 2.0, frag: 10, tags: ['void'], tier: 5 });
ore('adamant_ore', { hardMul: 2.2, frag: 8, tier: 6 });
ore('starmetal_ore', { hardMul: 2.0, frag: 9, tags: ['magnet', 'glow'], glow: 0xffe7b0, tier: 5 });
ore('sunstone', { hardMul: 1.8, frag: 12, tags: ['hot', 'glow'], glow: 0xffd34a, tier: 5 });
ore('truffle', { hardMul: 0.6, frag: 25, vib: 1.5, tags: ['scent'] });
ore('frostbloom_seed', { hardMul: 1, frag: 10 }); // placeholder slot (unused)

/** Which zones each ore spawns in, with weights (relative abundance) and vein size. */
export const ORE_SPAWN = {
  1: [['coal', 14, 4], ['copper_ore', 12, 3], ['tin_ore', 8, 3], ['salt_crystal', 5, 2], ['fossil', 2.4, 1], ['quartz', 3, 2], ['truffle', 1.3, 1]],
  2: [['coal', 10, 4], ['iron_ore', 12, 3], ['copper_ore', 4, 3], ['amber', 3, 1], ['lumite', 4, 2], ['salt_crystal', 3, 2], ['fossil', 1.5, 1], ['truffle', 1.3, 1], ['quartz', 3, 2]],
  3: [['silver_ore', 10, 3], ['iron_ore', 5, 3], ['amethyst', 4, 2], ['echo_crystal', 3, 2], ['gravium', 3, 1], ['bioxide', 4, 2], ['lumite', 3, 2], ['coal', 4, 3], ['quartz', 4, 2]],
  4: [['gold_ore', 10, 3], ['ruby', 3, 1], ['magmaite', 4, 2], ['silver_ore', 4, 3], ['bioxide', 2, 2], ['emerald', 2, 1], ['coal', 3, 3], ['truffle', 0.8, 1]],
  5: [['mithril_ore', 8, 3], ['moonsilver_ore', 6, 2], ['sapphire', 3, 1], ['frostite', 4, 2], ['diamond', 1.6, 1], ['emerald', 2, 1], ['gold_ore', 3, 2]],
  6: [['starmetal_ore', 6, 2], ['adamant_ore', 6, 2], ['sunstone', 2.5, 1], ['voidstone', 2.5, 1], ['diamond', 2, 1], ['moonsilver_ore', 3, 2], ['mithril_ore', 3, 2]],
};
