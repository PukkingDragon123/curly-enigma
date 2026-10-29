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
  blk_cobble: blk('Cobblestone', 'cobble', { value: 1, stack: 32, kg: 0.3, desc: 'Rough stone knocked out of the rock. Every swing of the pick keeps a little.' }),
  blk_dirt: blk('Dirt Block', 'dirt', { value: 1, stack: 32, kg: 0.2, desc: 'Packed earth, cut square. Humble, warm, easy to dig out again.' }),
  blk_stonebrick: blk('Stone Bricks', 'stonebrick', { value: 3, stack: 32, kg: 0.32, desc: 'Cobble dressed square at a workbench. Proper walls for proper moles.' }),
  blk_bricks: blk('Clay Bricks', 'bricks', { value: 4, price: 14, stack: 32, kg: 0.3, desc: 'Red clay, fired over coal. Smells faintly of a bakery.' }),
  blk_planks: blk('Planks', 'planks', { value: 2, price: 6, stack: 32, kg: 0.12, desc: 'Sawn boards. Floors, walls, shelves, bridges over things you would rather not fall into.' }),
  blk_log: blk('Log', 'log', { value: 3, price: 10, stack: 32, kg: 0.35, desc: 'A length of timber or root. Beams and posts, or saw it into planks.' }),
  blk_glass: blk('Glass', 'glass', { value: 6, price: 18, stack: 32, kg: 0.15, desc: 'Sand melted clear over coal. A window in a cave is a very fine thing.' }),
  blk_ladder: blk('Ladder', 'ladder', { value: 2, price: 8, stack: 32, kg: 0.15, desc: 'Goes on a wall. Climbing it costs no puff at all.' }),
  blk_torch: blk('Torch', 'torch', { value: 2, price: 5, stack: 32, kg: 0.05, desc: 'A stick with a coal head. Stick it on a wall and the dark backs off.' }),
  blk_lantern: blk('Lantern', 'lantern', { value: 30, price: 80, stack: 8, kg: 0.4, desc: 'An iron lantern. Hang it from a ceiling or stand it on the floor: bright, warm, steady.' }),
  blk_door: blk('Door', 'door', { value: 12, price: 40, stack: 4, kg: 1.0, desc: 'A plank door on iron hinges. Two blocks tall. E (or tap) opens and shuts it.' }),
  blk_chest: blk('Chest', 'chest', { value: 15, price: 60, stack: 4, kg: 1.5, desc: 'An iron-banded chest. What you put in stays down here, and weighs nothing in your pack.' }),
  blk_workbench: blk('Workbench', 'workbench', { value: 20, price: 75, stack: 2, kg: 2.0, desc: 'A sturdy bench with a vise and a saw. Doors, glass, bricks and chests are made at one.' }),
  // ───────────── crafting stuff ─────────────
  stick: craft('Sticks', 'stick', { value: 1, stack: 32, kg: 0.02, desc: 'Split from a plank. Handles, ladders and torches start here.' }),
  sand_pile: craft('Sand', 'sand', { value: 1, stack: 32, kg: 0.25, desc: 'A pawful of cave sand. Melt it over coal at a workbench and you get glass.' }),
  clay_lump: craft('Clay', 'clay', { value: 1, stack: 32, kg: 0.25, desc: 'Sticky red clay. Fired over coal it makes bricks.' }),
  vine_cut: craft('Cave Vine', 'vine', { value: 2, stack: 32, kg: 0.05, desc: 'A length of hanging vine, cut clean with shears. Strong enough to tie a ladder.' }),
  // ───────────── tools ─────────────
  axe_stone: { name: 'Stone Hatchet', cat: 'tool', slot: 'axe', tier: 1, power: 1.1, value: 4, icon: { k: 'btool', t: 'axe', c: 0x8a8580 },
    desc: 'A sharp stone lashed to a stick. Cuts wood far better than a pick does.' },
  axe_copper: { name: 'Copper Hatchet', cat: 'tool', slot: 'axe', tier: 2, power: 1.6, price: 240, value: 60, icon: { k: 'btool', t: 'axe', c: 0xd9773f },
    desc: 'Chops roots, timber, planks and logs: the right tool for anything wooden.' },
  axe_iron: { name: 'Iron Axe', cat: 'tool', slot: 'axe', tier: 3, power: 2.4, price: 1600, value: 420, icon: { k: 'btool', t: 'axe', c: 0x9aa0a8 },
    desc: 'A woodcutter\'s axe. Mushroom stalks and old beams come down in a few strokes.' },
  axe_steel: { name: 'Steel Axe', cat: 'tool', slot: 'axe', tier: 4, power: 3.4, price: 8500, value: 2200, icon: { k: 'btool', t: 'axe', c: 0xc6d2de },
    desc: 'Holds an edge like nothing else. Wooden things barely argue.' },
  spade_stone: { name: 'Stone Spade', cat: 'tool', slot: 'spade', tier: 1, power: 1.1, value: 4, icon: { k: 'btool', t: 'spade', c: 0x8a8580 },
    desc: 'A flat stone on a stick. Shifts dirt, sand and gravel quicker than a pick.' },
  spade_copper: { name: 'Copper Spade', cat: 'tool', slot: 'spade', tier: 2, power: 1.7, price: 200, value: 50, icon: { k: 'btool', t: 'spade', c: 0xd9773f },
    desc: 'Digs soil, clay, sand and gravel in big clean bites, and keeps the blocks whole.' },
  spade_iron: { name: 'Iron Spade', cat: 'tool', slot: 'spade', tier: 3, power: 2.5, price: 1400, value: 380, icon: { k: 'btool', t: 'spade', c: 0x9aa0a8 },
    desc: 'A proper digging spade. Earth goes where it is told.' },
  spade_steel: { name: 'Steel Spade', cat: 'tool', slot: 'spade', tier: 4, power: 3.6, price: 8000, value: 2000, icon: { k: 'btool', t: 'spade', c: 0xc6d2de },
    desc: 'Cuts through clay like it was cake. Nice cake.' },
  shears: { name: 'Pruning Shears', cat: 'tool', slot: 'shears', tier: 2, power: 1.5, price: 180, value: 45, icon: { k: 'btool', t: 'shears', c: 0x9aa0a8 },
    desc: 'Snips vines and webs clean, so you keep them. Without them vines just tear.' },
};
