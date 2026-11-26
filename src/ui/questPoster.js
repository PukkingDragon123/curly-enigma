// The quest poster's pieces (src/ui/Tracker.js), all drawn by hand as pixel maps: a torn handbill
// with a woodcut of the quest's goal (src/ui/posterPics.js), the cork patch and the forged nail it
// hangs on, the scroll under it (turned rods, a parchment strip, twine), progress pips, the ink
// tick, the scrap a poster leaves on the nail when it's torn off, the direction arrow. Code only
// stacks, recolours and rotates these maps (one art pixel = one --px, no smoothing, no noise).
// Also: which picture a quest gets, the step in a few words, the paper sounds.
import { Px, art } from './uiArt.js';
import { PICS, PIC_INK } from './posterPics.js';
import { ITEMS } from '../data/items.js';
import { nearest } from './palette.js';

export const INK = 0x1e1424; // plum-black, never pure black
const RIM = 0x4a2420;
export const POSTER_W = 37, PIC_X = 4, PIC_Y = 5, TITLE_Y = 26, MID_H = 6, SCROLL_W = 47, SHEET_W = 43;

/** Paint a pixel map (rows of characters) into a raster through a palette; ' ' stays clear. */
function paint(p, rows, pal, ox = 0, oy = 0) {
  for (let y = 0; y < rows.length; y++)
    for (let x = 0; x < rows[y].length; x++) {
      const c = pal[rows[y][x]];
      if (c !== undefined) p.set(ox + x, oy + y, c);
    }
  return p;
}
const sprite = (key, rows, pal) => art(key, () => paint(new Px(rows[0].length, rows.length), rows, pal), { res: 1 });
/** A map turned a quarter clockwise (the arrows). */
const turn = (rows) => rows[0].split('').map((_, x) => rows.map((r) => r[x]).reverse().join(''));

// ---------------------------------------------------------------- the poster
// p paper · q its shade · h the lit edge · r an old stain · x the torn rim · # print · a accent
// (a nail hole at the top, the paper pulled into a V under it; one rule round the edge, worn through
// in places; a little printed ornament under the picture; twine holes and a dog-ear at the bottom)
const TOP = [
  '   hhhhhhhhh   hhhhhhhhhh hhhhhhx    ',
  ' hppppppppppppppppxppppppppppppppqx  ',
  ' h##################pp#############x ',
  'hp#pppppppppppppqpppqppppppppppppp#qx',
  'hp#ppppppppppppqpppppqpppppppppppp#qx',
  'hp#ppppppppppppppppppppppppppppppp#x ',
  ' h#ppppppppppppppppppppppppppppppp#x ',
  ' h#ppppppppppppppppppppppppppppppp#x ',
  ' h#ppppppppppppppppppppppppppppppp#qx',
  ' h#ppppppppppppppppppppppppppppppppqx',
  'hp#ppppppppppppppppppppppppppppppp#qx',
  'hp#ppppppppppppppppppppppppppppppp#qx',
  ' h#ppppppppppppppppppppppppppppppp#x ',
  ' hpppppppppppppppppppppppppppppppp#x ',
  ' h#ppppppppppppppppppppppppppppppp#qx',
  'hp#ppppppppppppppppppppppppppppppp#qx',
  'hp#ppppppppppppppppppppppppppppppp#qx',
  'hp#ppppppppppppppppppppppppppppppp#x ',
  ' h#ppppppppppppppppppppppppppppppp#x ',
  ' h#ppppppppppppppppppppppppppppppp#x ',
  ' h#ppppppppppppppppppppppppppppppp#qx',
  ' h#ppppppppppppppppppppppppppppppp#qx',
  'hp#ppppppppppppppppppppppppppppppp#qx',
  'hp#ppppppppppppppp#ppppppppppppppp#qx',
  'hp#ppppppp######p#a#p######ppppppp#x ',
  ' h#ppppppppppppppp#ppppppppppppppp#x ',
  ' h#ppppppppppppppppppppppppppppppp#qx',
];
const MID = [
  ' h#ppppppppppppppppppppppppppppppp#qx',
  ' h#ppppppppppppppppppppppppppppppp#qx',
  'hp#ppppppppppppppppppppppppppppppp#qx',
  'hp#ppppppppppppppppppppppppppppppp#x ',
  'hp#ppppppppppppppppppppppppppppppp#x ',
  ' h#ppppppppppppppppppppppppppppppp#qx',
];
const BOT = [
  ' h#ppxpppppppppppppppppppppppppxpp#qx',
  'hp#####p#######p###########p#######qx',
  ' hppppppppppppppppppppppppppppphrrx  ',
  ' hqqqqqqqqqqqqqqqqqqqqqqqqqqqqhrrx   ',
  '  xxxxx xxxxxxxxxxx xxxxxxxxxxxxx    ',
  '      x        x                     ',
];
/** Poster stock by the kind of quest: Old Star's own on warm rag, his errands on buff, the burrow
 *  folk's on newsprint, the town's on ledger paper, lore on linen. */
const PAPERS = { // (wave 20: the master palette's paper tones, src/ui/palette.js)
  main: { p: 0xf2dcae, q: 0xdcbf8a, h: 0xfff0d2, r: 0xb8945e },
  story: { p: 0xdcbf8a, q: 0xb8945e, h: 0xf2dcae, r: 0xab7a42 },
  request: { p: 0xc9bfbb, q: 0xa2989a, h: 0xf2dcae, r: 0x7a7174 },
  village: { p: 0xf2dcae, q: 0xb8945e, h: 0xfff0d2, r: 0xab7a42 },
  lore: { p: 0xc9bfbb, q: 0xb8945e, h: 0xf2dcae, r: 0x7a7174 },
};

/** The poster for a quest, k middle bands tall (room for the title): a data URL (cached). */
export function posterArt(id, look, k) {
  return art(`qp2:${id}:${k}`, () => {
    const rows = [...TOP];
    for (let i = 0; i < k; i++) rows.push(...MID);
    rows.push(...BOT);
    const p = paint(new Px(POSTER_W, rows.length), rows, { ...look.paper, x: RIM, '#': INK, a: look.acc[0] });
    paint(p, PICS[look.motif].rows, { ...PIC_INK, a: look.acc[0], A: look.acc[1] }, PIC_X, PIC_Y);
    return p;
  }, { res: 1 });
}
export const posterRows = (k) => TOP.length + k * MID_H + BOT.length;

/** The bit of a torn-off poster left on the nail (its own paper). */
const SCRAP = [
  ' hhh hhhh ',
  'hpppxppppx',
  'hppppppqqx',
  ' pp ppqqx ',
  '  p  pq   ',
];
export const scrapArt = (look) => sprite('qp2:scrap:' + look.kind, SCRAP, { ...look.paper, x: RIM });

// ---------------------------------------------------------------- the cork patch and the nail
// o edge · c, k, d cork light to dark (its cut edge shows below) · b, B, w a brass tack someone left
const CORK = [
  '      oooooooooooo        ',
  '   oooccckkkkkckkkooo     ',
  ' ookkcckkkkdkkkkkkkkkkoo  ',
  'okkoookkkkkkkkkcckkkkkkkoo',
  'okobwbokkdkkkkkkkkkdkkkkko',
  'okobBBokkkkkcckkkkkkkkkddo',
  ' oddooodddkkkkkkkkkdddddo ',
  '   oooodddddddddddddoooo  ',
  '        oooooooooooo      ',
];
export const corkArt = () => sprite('qp2:cork', CORK, { o: 0x3a2318, c: 0xb8945e, k: 0xab7a42, d: 0x5e3a22, b: 0xc8962a, B: 0x86552e, w: 0xfff0d2 });
// a hand-forged nail head, lit top left, a rust tear under it
const NAIL = [
  ' xxx ',
  'xhqrx',
  'xqqrx',
  'xrrrx',
  ' xxx ',
  '  u  ',
];
export const nailArt = () => sprite('qp2:nail', NAIL, { x: 0x1e1424, h: 0xc9bfbb, q: 0x7a7174, r: 0x3a3438, u: 0x7e3a1e });

// ---------------------------------------------------------------- the scroll
// a turned rod with knobs and brass rings; two frames (the grain rolls round as it turns)
const ROD_A = [
  ' oo                                         oo ',
  'olmooooooooooooooooooooooooooooooooooooooooolmo',
  'olmdbhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhBlmdo',
  'olmdbmmmddmmmmmmmdddmmmmmmmddmmmmmmmdddmmmBlmdo',
  'olmdBdddddddddddddddddddddddddddddddddddddBlmdo',
  'oldoooooooooooooooooooooooooooooooooooooooooldo',
  ' oo                                         oo ',
];
const ROD_B = [
  ROD_A[0], ROD_A[1], ROD_A[2],
  'olmdbdmmmmmmddmmmmmmmdddmmmmmmmddmmmmmmmddBlmdo',
  ROD_A[4], ROD_A[5], ROD_A[6],
];
const ROD_PAL = { o: 0x1e1424, h: 0xb8945e, l: 0xab7a42, m: 0x86552e, d: 0x5e3a22, b: 0xc8962a, B: 0x86552e };
export const rodArt = () => sprite('qp2:rod', [...ROD_A, ...ROD_B], ROD_PAL);

/** The scroll's parchment: one strip that tiles down, hand-cut at the sides. */
const SHEET = [
  'xhpppppppppppppppppppppppppppppppppppppppqx',
  'xhpppppppppppppppppppppppppppppppppppppppqx',
  ' hpppppppppppppppppppppppppppppppppppppppqx',
  ' hppppppppppppppppppppppppppppppppppppppqx ',
  ' hppppppppppppppppppppppppppppppppppppppqx ',
  'xhpppppppppppppppppppppppppppppppppppppppqx',
];
const SHEET_PAL = { x: RIM, ...PAPERS.main };
export const sheetArt = () => sprite('qp2:sheet', SHEET, SHEET_PAL);
/** Where the paper bends round a rod: two rows of shade (flipped for the bottom). */
export const curlArt = () => sprite('qp2:curl', ['r'.repeat(SHEET_W), 'q'.repeat(SHEET_W)], SHEET_PAL);
/** Two lengths of twisted twine, from the poster's holes down to the top rod. */
const TWIST = ['h', 'm', 'm', 'd', 'h', 'm'];
export const twineArt = () => art('qp2:twine', () => {
  const H = 14, p = new Px(SCROLL_W, H);
  for (const x of [10, 36]) for (let y = 0; y < H; y++) p.set(x, y, { h: 0xdcbf8a, m: 0xab7a42, d: 0x5e3a22 }[TWIST[y % TWIST.length]]);
  return p;
}, { res: 1 });

// ---------------------------------------------------------------- little inked marks
const PIP_E = [' xxxx ', 'x    x', 'x    x', ' xxxx '];
const PIP_F = [' xxxx ', 'xhaaAx', 'xaaAAx', ' xxxx '];
/** A progress pip: an inked nugget, empty or filled with the poster's accent. */
export const pipArt = (full, acc = [0xb45e30, 0x74382a]) => sprite(`qp2:pip:${full ? 1 : 0}:${acc[0]}`, full ? PIP_F : PIP_E, { x: INK, a: acc[0], A: acc[1], h: 0xf2dcae });
const TICK = [
  '        aa',
  '       aa ',
  '      aa  ',
  'a    aa   ',
  'aa  aa    ',
  ' aaaa     ',
  '  aA      ',
  '   A      ',
];
/** A brushed tick in vermilion. */
export const tickArt = () => sprite('qp2:tick', TICK, { a: 0x9a2c2a, A: 0x5e1824 });
const ARROW_N = ['    x    ', '   xax   ', '  xaaax  ', ' xaaaaax ', 'xxxaaaxxx', '  xaaax  ', '  xaaax  ', '  xaAax  ', '  xxxxx  '];
const ARROW_NE = ['   xxxxxx', '    xaaax', '     xaax', '    xaaax', '   xaaxax', '  xaaa xx', ' xaaa    ', 'xaAa     ', ' xx      '];
/** The way to go, eight ways round (k: 0 = straight ahead, clockwise). */
export function arrowArt(k) {
  let rows = k % 2 ? ARROW_NE : ARROW_N;
  for (let i = 0; i < Math.floor(k / 2); i++) rows = turn(rows);
  return sprite('qp2:arrow:' + k, rows, { x: 0x2e1b33, a: 0xb45e30, A: 0x74382a });
}

// ---------------------------------------------------------------- which picture, which paper
const snapC = (c) => parseInt(nearest('#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6)).hex.slice(1), 16);
const ACC_ORE = (id) => { const o = ITEMS[id]?.icon?.ore; return Array.isArray(o) && o.length > 2 ? [snapC(o[0]), snapC(o[2])] : null; };
const QUEST_MOTIF = {
  lessons: 'star', million: 'coins', os_town: 'town', os_neighbours: 'town', os_gem: 'gem', os_rocco: 'blade', os_lifts: 'lift',
  os_pristine: 'ore', os_blade: 'anvil', os_cook: 'pot', os_dynamite: 'ore', os_ruin: 'ruin', os_tenth: 'coins',
};
function itemMotif(id) {
  const it = ITEMS[id];
  if (!it) return { m: 'parcel' };
  if (it.cat === 'mineral') return { m: 'ore', acc: id === 'coal' ? [0x7a7174, 0x3a3438] : ACC_ORE(id) };
  if (it.cat === 'gem') return { m: 'gem' };
  if (it.cat === 'ingot') return { m: 'anvil' };
  if (it.cat === 'plant' || it.cat === 'ingredient') return { m: 'plant' };
  if (it.cat === 'food' || it.cat === 'consumable') return { m: 'pot' };
  if (it.cat === 'drop' || it.cat === 'critter') return { m: 'beast' };
  return { m: 'parcel' };
}
/** The picture for a step: what it asks for. */
function stepMotif(st, giver) {
  if (!st) return null;
  if (st.gold) return { m: 'coins' };
  if (st.deliver) return itemMotif(Object.keys(st.deliver.items || {})[0]);
  if (st.where?.zone) return { m: 'lift' };
  const on = [].concat(st.on || [])[0] || {}, t = on.type;
  if (t === 'ore' || t === 'blast' || t === 'axe' || t === 'explore') return { m: 'ore', acc: ACC_ORE(on.id) };
  if (t === 'forge' || t === 'smelt') return { m: 'anvil' };
  if (t === 'sell') return { m: 'blade' };
  if (t === 'cook') return { m: 'pot' };
  if (t === 'kill' || t === 'nest' || t === 'tame') return { m: 'beast' };
  if (t === 'puzzle' || t === 'lore' || t === 'relic' || t === 'look') return { m: 'ruin' };
  if (t === 'forage') return { m: 'plant' };
  if (t === 'gem') return { m: 'gem' };
  if (t === 'buy') return { m: /ticket/.test(on.id || '') ? 'coins' : 'town' };
  if (t === 'talk') return { m: (on.npc || giver) === 'oldstar' ? 'star' : 'town' };
  if (t === 'reach') return { m: /^lift/.test(on.place || '') ? 'lift' : /^ruin/.test(on.place || '') ? 'ruin' : 'town' };
  if (st.count) return { m: 'lift' };
  return null;
}
/** The poster's look for a quest: { motif, acc: [light, dark], paper, kind }. */
export function posterLook(def, id) {
  let pick = QUEST_MOTIF[id] ? { m: QUEST_MOTIF[id] } : /^os_deeper/.test(id) ? { m: 'lift' } : null;
  for (let i = def.steps.length - 1; i >= 0 && !pick; i--) pick = stepMotif(def.steps[i], def.giver);
  pick ||= { m: def.giver === 'oldstar' ? 'star' : 'parcel' };
  const m = PICS[pick.m] ? pick.m : 'parcel';
  return { motif: m, acc: pick.acc || PICS[m].acc, paper: PAPERS[def.kind] || PAPERS.story, kind: PAPERS[def.kind] ? def.kind : 'story' };
}

// ---------------------------------------------------------------- the step in a few words
const CUT_AT = new Set(['to', 'at', 'in', 'into', 'from', 'for', 'with', 'on', 'down', 'past', 'through', 'by', 'near', 'under', 'inside']);
/** "Forge your own pickaxe at his forge" → "Forge your own pickaxe" (2–6 words; the book has the rest). */
export function brief(text) {
  const s = String(text || '').replace(/\s*\([^)]*\)/g, '').split(/[,;:—–]| - /)[0].trim();
  let w = s.split(/\s+/).filter(Boolean);
  while (w.length > 5) {
    let k = -1;
    for (let i = w.length - 1; i >= 2; i--) if (CUT_AT.has(w[i].toLowerCase())) { k = i; break; }
    if (k < 0) break;
    w = w.slice(0, k);
  }
  if (w.length > 6) w = w.slice(0, 6);
  return w.join(' ');
}
/** "12k / 1M": gold short enough for the scroll. */
export function shortGold(n) {
  const v = Math.max(0, n);
  return v >= 1e6 ? +(v / 1e6).toFixed(v % 1e6 ? 1 : 0) + 'M' : v >= 1e4 ? Math.floor(v / 1e3) + 'k' : v >= 1e3 ? +(v / 1e3).toFixed(1) + 'k' : String(Math.floor(v));
}

// ---------------------------------------------------------------- paper sounds
const live = (a) => a && a.ctx && a.ctx.state === 'running';
export const PSFX = {
  /** A sheet of paper fluttering down: quick flaps slowing, a soft rush of air. */
  flutter(audio, { n = 6, vol = 1, delay = 0 } = {}) {
    if (!live(audio)) return;
    audio.noise({ color: 'pink', filter: 'lowpass', f: 900, dur: 0.32, vol: 0.05 * vol, a: 0.08, delay });
    let t = delay;
    for (let i = 0; i < n; i++) {
      audio.noise({ filter: 'bandpass', f: 1600 + Math.random() * 1800, f2: 1100 + Math.random() * 900, q: 1.3, dur: 0.035 + Math.random() * 0.03, vol: (0.07 - i * 0.008) * vol, a: 0.004, delay: t });
      t += 0.045 + i * 0.012 + Math.random() * 0.02;
    }
  },
  /** The poster catching on its nail: a dull tap and the paper snapping taut. */
  catch(audio) {
    if (!live(audio)) return;
    audio.tone({ f: 260, f2: 150, type: 'triangle', dur: 0.07, vol: 0.09, a: 0.002, release: 0.05 });
    audio.noise({ filter: 'bandpass', f: 2600, q: 1.6, dur: 0.05, vol: 0.08, a: 0.002, delay: 0.01 });
    audio.noise({ filter: 'highpass', f: 4200, q: 0.8, dur: 0.03, vol: 0.04, delay: 0.06 });
  },
  /** Paper tearing off a nail: a ragged rising rip. */
  rip(audio) {
    if (!live(audio)) return;
    audio.noise({ filter: 'bandpass', f: 900, f2: 3200, q: 2.2, dur: 0.26, vol: 0.1, a: 0.01 });
    for (let i = 0; i < 6; i++) audio.noise({ filter: 'bandpass', f: 1800 + i * 300, q: 3, dur: 0.02, vol: 0.06, delay: 0.02 + i * 0.035 + Math.random() * 0.015 });
  },
};
