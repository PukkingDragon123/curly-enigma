// Pictures for the cooking steps (wave 14: the order ticket, the recipe cards and the result show
// the steps as pictures, not words): the cooking skill icons where one shows the work (the knife and
// carrot, the simmering pot, the spice jars, the pan...), the real ingredient where the step is
// about it (an egg to crack, the flour to knead), and a few kitchen glyphs drawn here (the rolling
// pin, the grater, the masher) in the same lit-from-the-top-left, outlined style.
import { Px, art } from '../ui/uiArt.js';
import { skillIconURL } from '../ui/skillIcons.js';
import { itemVox } from '../ui/itemVox.js';

const OUT = 0x24150d;
const N = 32;

/** A kitchen tool as a 32×32 picture: rows of letters → colours, then outline and a drop. */
function tool(rows, pal, extra) {
  const p = new Px(N, N);
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  p.tpl(rows, pal, Math.floor((N - w) / 2), Math.floor((N - h) / 2));
  extra?.(p);
  p.outline(OUT);
  return p;
}

const WOOD = { h: 0xf0c890, l: 0xd8a868, b: 0xae763c, d: 0x744620 };
const STEEL = { s: 0xf2f6fa, t: 0xb8c4d2, u: 0x7a8ea8, v: 0x4a5a72 };
const DOUGH = { a: 0xfff4dc, c: 0xf2dcb0, e: 0xd8b880, f: 0xb08850 };

const TOOLS = {
  // a rolling pin across a sheet of dough
  roll: () => tool([
    '.hh.......................',
    'hllh......................',
    'hlbd......................',
    '.dd.hhhhhhhhhhhhhhhh......',
    '....hlllllllllllllllh.....',
    '....lbbbbbbbbbbbbbbbbd.hh.',
    '....dbbbbbbbbbbbbbbbbdhllh',
    '.....ddddddddddddddddd.hlbd',
    '.......................dd..',
    '..aaaaaaaaaaaaaaaaaaaaaa...',
    '.acccccccccccccccccccccce..',
    'acccccccccccccccccccccccce.',
    '.eeeeeeeeeeeeeeeeeeeeeeeef.',
    '..ffffffffffffffffffffffff.',
  ], { ...WOOD, ...DOUGH }),
  // a box grater, something orange grated off it
  grate: () => tool([
    '......hhhhhhh.......',
    '......hlllllld......',
    '......h.....ld......',
    '....sssssssssu......',
    '....stststststu.....',
    '....sttttttttu......',
    '....stststststu.....',
    '....sttttttttu......',
    '....stststststu.....',
    '....sttttttttu......',
    '....stststststu.....',
    '....sttttttttu......',
    '....uuuuuuuuuv......',
    '..o.....o...........',
    '.oO..o.....oO.......',
    '..........o.........',
  ], { ...STEEL, h: 0xb8c4d2, l: 0x7a8ea8, d: 0x4a5a72, o: 0xe07224, O: 0xffc278 }),
  // a wooden masher over a bowl of lumps
  mash: () => tool([
    '..........hh..........',
    '..........hl..........',
    '..........hl..........',
    '..........hl..........',
    '..........hb..........',
    '......hhhhllllhh......',
    '......lbbbbbbbbd......',
    '......lb.b.b.bbd......',
    '.......dddddddd.......',
    '....c.a.c...ca..c.....',
    '..wwwwwwwwwwwwwwwwww..',
    '..WaacaaccaaacaaacaW..',
    '...WaaaaaaaaaaaaaaW...',
    '....WWWWWWWWWWWWWW....',
  ], { ...WOOD, ...DOUGH, w: 0xd8a868, W: 0x744620 }),
  // a pan, the pancake in the air over it with a little arc
  flip: () => tool([
    '........aaaaaa.......',
    '......acccccccce.....',
    '.......eeeeeeef......',
    '...y.............y...',
    '..y...............y..',
    '..y...............y..',
    '.....................',
    '..ssssssssssssssssu..',
    '.sttttttttttttttttuu.....',
    '..uuuuuuuuuuuuuuuu.hhhhh',
    '...vvvvvvvvvvvvvv...lllb',
  ], { ...STEEL, ...DOUGH, ...WOOD, y: 0xfff4b0 }),
  // paws kneading a dough ball
  knead: () => tool([
    '.........aaaaaa.........',
    '......aacccccccaa.......',
    '....accccpcccpcccca.....',
    '...accccppcccppccccce...',
    '..acccccccccccccccccce..',
    '..accccccccccccccccce...',
    '..ecccccccccccccccceef..',
    '...eeeeccccccccceeeef...',
    '....ffeeeeeeeeeeeeff....',
    '......ffffffffffff......',
  ], { ...DOUGH, p: 0xc89a60 }),
};

/** The picture for a cooking step kind (o.item: the ingredient a chop/grate/fry step works on). */
export function stepIcon(kind) {
  switch (kind) {
    case 'chop': return skillIconURL('c_knife');
    case 'crack': return itemVox.src('egg');
    case 'stir': return skillIconURL('c_nose');
    case 'season': return skillIconURL('c_spice');
    case 'fry': return skillIconURL('c_egg');
    case 'pour': return skillIconURL('c_helping');
    case 'plate': return skillIconURL('c_gourmet');
    case 'simmer': return skillIconURL('c_simmer');
    case 'bake': return skillIconURL('c_feast');
    case 'roll': case 'grate': case 'mash': case 'flip': case 'knead': return art('ck:step:' + kind, TOOLS[kind]);
    default: return skillIconURL('c_chef');
  }
}
