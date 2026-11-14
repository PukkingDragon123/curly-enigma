// Pictures for the forge's work HUD (wave 14: less text, more pictures): the step icons of the
// work trail (real item stills where the step *is* an item: the ore, the ingot, the weapon; the
// smithing skill icons for the work itself), the gold pointer that bounces over what to do next,
// and the little hand-drawn glyphs on the action plates (flame, poker, anvil, drop, door...).
// Glyphs are templates in art pixels: flat light/mid/dark planes lit from the top left, a tinted
// outline, a glint. Cached through uiArt's art().
import { Px, art } from '../ui/uiArt.js';
import { skillIconURL, lineIconURL } from '../ui/skillIcons.js';
import { itemVox } from '../ui/itemVox.js';

const OUT = 0x24150d;

/** The pointer: a chunky gold arrow pointing down (CSS turns it for the other ways). 13×13. */
function pointer() {
  const p = new Px(15, 15);
  p.tpl([
    '....hyyo.....',
    '....hyyo.....',
    '....hyyo.....',
    '....hyyo.....',
    'hhhhhyyoooooo',
    '.hyyyyyyyyoo.',
    '..hyyyyyyoo..',
    '...hyyyyoo...',
    '....hyyoo....',
    '.....hyo.....',
    '......o......',
  ], { h: 0xfff6c8, y: 0xffd04a, o: 0xc8841e }, 1, 2);
  p.set(5, 3, 0xffffff);
  p.outline(0x4a2a08);
  return p;
}

const IRON = { h: 0xdcd8e0, l: 0xa8a0a6, b: 0x6c6470, d: 0x3a343c };
const FIRE = { w: 0xfff8d8, y: 0xffd04a, o: 0xf07a1a, r: 0xb8301a, h: 0xffeaa0 };
const WOOD = { h: 0xe0ae78, l: 0xb47640, b: 0x7c4a24, d: 0x462812 };
const GLYPHS = {
  flame: [[
    '......h......',
    '.....hy......',
    '.....hyo.....',
    '....hyyo..h..',
    '...hyyyoo.yo.',
    '...hyywyoyyo.',
    '..hyywwyyyoo.',
    '..hyywwwyyoo.',
    '.hyywwwwyyyo.',
    '.hyywwwwwyyoo',
    '.ryywwwwwyyor',
    '.rryywwwyyorr',
    '..rryyyyyorr.',
    '...rrrrrrrr..',
  ], FIRE],
  poker: [[
    'h.............',
    'lh............',
    '.lh....y......',
    '..lh..yo......',
    '...lh.yoy.....',
    '....lhyyoo....',
    '.....lyyo.....',
    '....ccldcc....',
    '...cCccqCcc...',
    '..cCcqcccCqc..',
    '.cCcccqccqcCc.',
    'cccqcccccqcccc',
  ], { ...IRON, c: 0x2a2629, C: 0x5c5458, q: 0xf07a1a, y: 0xffd04a, o: 0xf07a1a }],
  anvil: [[
    '....hhhhhhhhhh',
    '.hhhllllllllld',
    'hllllllllllldd',
    '..bbbbbbbbbdd.',
    '.....bbbbd....',
    '.....bbbbd....',
    '....bbbbbbd...',
    '...lbbbbbbbd..',
    '..dddddddddd..',
  ], IRON],
  turn: [[
    '....hhhh.....',
    '..hh....bb...',
    '.h........b..',
    'h..........b.',
    'h.........bbb',
    'h..........b.',
    '.............',
    '.d...........',
    'ddd.........d',
    '.d..........d',
    '..d........d.',
    '...dd....dd..',
    '.....dddd....',
  ], { h: 0xfff3c0, b: 0xdcae4e, d: 0xa8772c }],
  drop: [[
    '.....b.....',
    '....hb.....',
    '....hbb....',
    '...hbbbd...',
    '...hbbbd...',
    '..hlbbbbd..',
    '..hlbbbbd..',
    '.hlwbbbbbd.',
    '.hlwbbbbbd.',
    '.hlbbbbbbd.',
    '..lbbbbbd..',
    '..dbbbbbd..',
    '...ddddd...',
  ], { h: 0xd8f4ff, l: 0x9cd4f8, w: 0xffffff, b: 0x3f8ad8, d: 0x1e4a8a }],
  hammer: [[
    '.hhhhhhh.....',
    'hllllllbd....',
    'hllllllbd....',
    '.bbbbbbdd....',
    '...hwd.......',
    '...hwd.......',
    '....hwd......',
    '....hwd......',
    '.....hwd.....',
    '.....hwd.....',
    '......hwd....',
    '......hwd....',
  ], { ...IRON, w: 0xb47640, d: 0x5a3418, h: 0xe0ae78 }],
  door: [[
    '...dddddd...',
    '..dlllllld..',
    '.dllwlllwld.',
    '.dlwwlllwwd.',
    '.dlwwlllwwd.',
    '.diiiiiiiid.',
    '.dlwwlllwwd.',
    '.dlwwllkwwd.',
    '.dlwwlllwwd.',
    '.diiiiiiiid.',
    '.dlwwlllwwd.',
    '.dddddddddd.',
  ], { d: 0x462812, l: 0xb47640, w: 0x7c4a24, i: 0x544d52, k: 0xffd04a }],
  quick: [[
    'h.....h.....',
    'lh....lh....',
    'llh...llh...',
    'lllh..lllh..',
    'llllh.llllh.',
    'lllllhlllllh',
    'lllld.lllld.',
    'llld..llld..',
    'lld...lld...',
    'ld....ld....',
    'd.....d.....',
  ], { h: 0xfff3c0, l: 0xf7d97c, d: 0xa8772c }],
  eye: [[
    '....dddddd....',
    '..ddllllllddd.',
    '.dlllbbbblllld',
    'dlllbkkwbllld.',
    '.dlllbkkbllld.',
    '..ddllbblldd..',
    '....dddddd....',
  ], { d: 0x3a2410, l: 0xfcf3dc, b: 0x3f7ec8, k: 0x10141c, w: 0xffffff }],
  lock: [[
    '...dddd...',
    '..d....d..',
    '.d......d.',
    '.d......d.',
    'hhhhhhhhhh',
    'hllllllllb',
    'hlllkkllbb',
    'hlllkkllbb',
    'hllllkllbb',
    'hllllllbbb',
    'bbbbbbbbbb',
  ], { d: 0x6c6470, h: 0xfff3c0, l: 0xdcae4e, b: 0xa8772c, k: 0x3a2410 }],
  coin: [[
    '..hhhh..',
    '.hllllb.',
    'hlhbblbd',
    'hlhlllbd',
    'hlhlllbd',
    'hllbblbd',
    '.bllllb.',
    '..dddd..',
  ], { h: 0xfff3c0, l: 0xf2c23a, b: 0xc8841e, d: 0x7a4a10 }],
  back: [[
    '....h........',
    '...hy........',
    '..hyy........',
    '.hyyyyyyyyyyo',
    'hyyyyyyyyyyyo',
    '.oyyyyyyyyyyo',
    '..oyy........',
    '...oy........',
    '....o........',
  ], { h: 0xfff6c8, y: 0xffd04a, o: 0xc8841e }],
  glass: [[
    'wwwwwwwwwww',
    '.hllllllld.',
    '.h.yyyyy.d.',
    '..h.yyy.d..',
    '...h.y.d...',
    '....h.d....',
    '...h.y.d...',
    '..h..y..d..',
    '.h..yyy..d.',
    '.hyyyyyyyd.',
    'WWWWWWWWWWW',
  ], { w: 0xb47640, W: 0x7c4a24, h: 0xe8f8ff, l: 0xb8e0f0, d: 0x6aa0b4, y: 0xf2c23a }],
  scale: [[
    '......h......',
    'lllllllllllll',
    '.l....b....d.',
    'l.l...b...d.d',
    'lllll.b.ddddd',
    '......b......',
    '.....hbb.....',
    '...bbbbbbb...',
  ], { h: 0xfff3c0, l: 0xf7d97c, b: 0xdcae4e, d: 0xa8772c }],
};

function glyph(name) {
  const [rows, pal] = GLYPHS[name] || GLYPHS.flame;
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const S = 16, ox = Math.floor((S - w) / 2), oy = Math.floor((S - h) / 2);
  const p = new Px(S, S);
  p.tpl(rows, pal, ox, oy);
  p.outline(OUT);
  return p;
}

/** The balance step: a blade laid across a fulcrum, level, with a weight at its hilt. 32×32. */
function balanceIcon() {
  const p = new Px(32, 32);
  const st = { h: 0xf2f6fa, l: 0xccd8e6, b: 0x7a8ea8, d: 0x3a4a62 };
  // the fulcrum: a wooden wedge on a block
  p.poly([[13, 18], [19, 18], [22, 26], [10, 26]], 0x7c4a24);
  p.line(13, 18, 10, 26, 0xb47640); p.line(14, 19, 11, 26, 0x985e30);
  p.rect(6, 26, 20, 3, 0x563216); p.line(6, 26, 25, 26, 0x925c2c);
  // the blade, edge-on and level: tip right, hilt left
  for (let x = 9; x <= 29; x++) { p.set(x, 15, st.h); p.set(x, 16, st.l); p.set(x, 17, st.b); }
  p.set(30, 16, st.l); p.set(29, 17, st.d);
  for (let x = 12; x <= 26; x += 3) p.set(x, 16, st.h);
  // guard and grip, and the pommel weight
  p.rect(7, 12, 2, 9, 0xdcae4e); p.line(7, 12, 7, 20, 0xfff3c0);
  p.rect(3, 15, 4, 3, 0x7c401e); p.line(3, 15, 6, 15, 0xb8743a);
  p.rect(0, 14, 3, 5, 0xdcae4e); p.set(0, 14, 0xfff3c0); p.line(2, 15, 2, 18, 0xa8772c);
  // level marks: little green ticks either end
  for (const x of [11, 27]) { p.set(x, 10, 0x8ae05a); p.set(x, 11, 0x8ae05a); p.set(x, 12, 0x3a7a2a); }
  p.outline(OUT);
  return p;
}

export const wart = {
  pointer: () => art('fw:pointer', pointer),
  glyph: (name) => art('fw:g:' + name, () => glyph(name)),
  balance: () => art('fw:balance', balanceIcon),
};

/**
 * The picture for a step of the work. o: { ore, out (item ids), type, metal (weapon), infusion }.
 * heat → the bellows and fire · hammer → anvil and hammer · grind → the bright blade · balance →
 * the blade on its fulcrum · quench → the steaming barrel · infuse → the mineral itself · pour → the
 * crucible pouring · ore / ingot / result → the item.
 */
export function stepIcon(id, o = {}) {
  switch (id) {
    case 'ore': return itemVox.src(o.ore || 'copper_ore');
    case 'heat': return skillIconURL('s_bellows');
    case 'pour': return skillIconURL('s_crucible');
    case 'ingot': return itemVox.src(o.out || 'copper_ingot');
    case 'hammer': case 'shape': return lineIconURL('smithing');
    case 'grind': return skillIconURL('s_finish');
    case 'balance': return wart.balance();
    case 'quench': return skillIconURL('s_quench');
    case 'infuse': return o.infusion ? itemVox.src(o.infusion) : skillIconURL('s_jewel');
    case 'result': return o.type ? itemVox.weapon(o.type, o.metal, o.infusion) : itemVox.src(o.out || 'copper_ingot');
    default: return skillIconURL('s_master');
  }
}
