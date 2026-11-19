// Building (wave 4, building part): the blocks the mole places, what they're crafted from, and the
// tools that break things properly. Merged into ITEMS by items.js.
//
//   block  placeable (src/deep/build/blocks.js says what each one puts up); stack and kg set here
//   craft  crafting stuff (sticks, sand, clay, vines)
//   tool   axes (wood), spades (soil, sand, gravel), shears (vines): slot axe | spade | shears,
//          tier like the picks (1 stone … 4 steel), power like a pick of that tier
//
// Icons: { k: 'block', b } and { k: 'btool', t, c } are drawn by src/deep/build/art.js.

const blk = (name, b, o) => ({ name, cat: 'block', icon: { k: 'block', b }, ...o });
const craft = (name, b, o) => ({ name, cat: 'craft', icon: { k: 'block', b }, ...o });

export const BUILD_ITEMS = {
  // ───────────── blocks ─────────────
  blk_cobble: blk('Cobblestone', 'cobble', { value: 1, stack: 32, kg: 0.3, desc: 'Rough stone. The pick saves a bit.' }),
  blk_dirt: blk('Dirt Block', 'dirt', { value: 1, stack: 32, kg: 0.2, desc: 'Packed earth, cut square.' }),
  blk_stonebrick: blk('Stone Bricks', 'stonebrick', { value: 3, stack: 32, kg: 0.32, desc: 'Cobble squared up at a workbench.' }),
  blk_bricks: blk('Clay Bricks', 'bricks', { value: 4, price: 14, stack: 32, kg: 0.3, desc: 'Fired clay. Smells like a bakery.' }),
  blk_planks: blk('Planks', 'planks', { value: 2, price: 6, stack: 32, kg: 0.12, desc: 'Sawn boards. Bridges, mostly.' }),
  blk_log: blk('Log', 'log', { value: 3, price: 10, stack: 32, kg: 0.35, desc: 'Timber or root. Saw it into planks.' }),
  blk_glass: blk('Glass', 'glass', { value: 6, price: 18, stack: 32, kg: 0.15, desc: 'Sand melted clear. A window, in a cave.' }),
  blk_ladder: blk('Ladder', 'ladder', { value: 2, price: 8, stack: 32, kg: 0.15, desc: 'Goes on a wall. Climbing it costs no puff.' }),
  blk_torch: blk('Torch', 'torch', { value: 2, price: 5, stack: 32, kg: 0.05, desc: 'Put it on a wall. The dark backs off.' }),
  blk_lantern: blk('Lantern', 'lantern', { value: 30, price: 80, stack: 8, kg: 0.4, desc: 'Hang it or stand it. Steady light.' }),
  blk_door: blk('Door', 'door', { value: 12, price: 40, stack: 4, kg: 1.0, desc: 'Two blocks tall. E or tap to open.' }),
  blk_chest: blk('Chest', 'chest', { value: 15, price: 60, stack: 4, kg: 1.5, desc: 'What\'s in it stays put, off your back.' }),
  blk_workbench: blk('Workbench', 'workbench', { value: 20, price: 75, stack: 2, kg: 2.0, desc: 'Doors, glass, bricks and chests get made here.' }),
  // ───────────── crafting stuff ─────────────
  stick: craft('Sticks', 'stick', { value: 1, stack: 32, kg: 0.02, desc: 'Split from a plank.' }),
  sand_pile: craft('Sand', 'sand', { value: 1, stack: 32, kg: 0.25, desc: 'Melt it at a workbench for glass.' }),
  clay_lump: craft('Clay', 'clay', { value: 1, stack: 32, kg: 0.25, desc: 'Fire it over coal for bricks.' }),
  vine_cut: craft('Cave Vine', 'vine', { value: 2, stack: 32, kg: 0.05, desc: 'Cut clean. Ties a ladder.' }),
  // ───────────── tools ─────────────
  axe_stone: { name: 'Stone Hatchet', cat: 'tool', slot: 'axe', tier: 1, power: 1.1, value: 4, icon: { k: 'btool', t: 'axe', c: 0x8a8580 },
    desc: 'Cuts wood better than a pick.' },
  axe_copper: { name: 'Copper Hatchet', cat: 'tool', slot: 'axe', tier: 2, power: 1.6, price: 240, value: 60, icon: { k: 'btool', t: 'axe', c: 0xd9773f },
    desc: 'For anything wooden.' },
  axe_iron: { name: 'Iron Axe', cat: 'tool', slot: 'axe', tier: 3, power: 2.4, price: 1600, value: 420, icon: { k: 'btool', t: 'axe', c: 0x9aa0a8 },
    desc: 'Old beams come down in a few strokes.' },
  axe_steel: { name: 'Steel Axe', cat: 'tool', slot: 'axe', tier: 4, power: 3.4, price: 8500, value: 2200, icon: { k: 'btool', t: 'axe', c: 0xc6d2de },
    desc: 'Wooden things barely argue.' },
  spade_stone: { name: 'Stone Spade', cat: 'tool', slot: 'spade', tier: 1, power: 1.1, value: 4, icon: { k: 'btool', t: 'spade', c: 0x8a8580 },
    desc: 'Shifts dirt and sand faster than a pick.' },
  spade_copper: { name: 'Copper Spade', cat: 'tool', slot: 'spade', tier: 2, power: 1.7, price: 200, value: 50, icon: { k: 'btool', t: 'spade', c: 0xd9773f },
    desc: 'Big clean bites. Keeps blocks whole.' },
  spade_iron: { name: 'Iron Spade', cat: 'tool', slot: 'spade', tier: 3, power: 2.5, price: 1400, value: 380, icon: { k: 'btool', t: 'spade', c: 0x9aa0a8 },
    desc: 'Earth goes where it\'s told.' },
  spade_steel: { name: 'Steel Spade', cat: 'tool', slot: 'spade', tier: 4, power: 3.6, price: 8000, value: 2000, icon: { k: 'btool', t: 'spade', c: 0xc6d2de },
    desc: 'Goes through clay like cake.' },
  // the belt's build slot (wave 16): the hammer that puts up pieces at home and blocks below
  builder_hammer: { name: 'Builder\'s Hammer', cat: 'tool', slot: 'build', tier: 1, value: 0, icon: { k: 'btool', t: 'hammer', c: 0x9aa0a8 },
    desc: 'Builds at home and below. Hold Q to choose.' },
  shears: { name: 'Pruning Shears', cat: 'tool', slot: 'shears', tier: 2, power: 1.5, price: 180, value: 45, icon: { k: 'btool', t: 'shears', c: 0x9aa0a8 },
    desc: 'Snips vines whole. Without, they tear.' },
};
