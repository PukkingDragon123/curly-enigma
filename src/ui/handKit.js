// The hand-drawn panel kit (wave 20: "one consistent 2D style"). Every frame, button, tile and
// small piece of panel chrome is a hand-authored pixel map: a string grid plus the shared legend
// below, which names colours of the master palette (src/ui/palette.js). Code only tiles, flips and
// recolours them; nothing here is noise, gradient or procedural texture.
//
// Rules the maps follow (docs/DEV_GUIDE.md, "ONE CONSISTENT 2D STYLE" and "HAND-DRAWN FIRST"):
//  - drawn on the 16 / 24 / 32 grid, shown at 1 art pixel = one --px (no fine half pixels)
//  - a 1px dark-plum outline (k), lighter plum on the lit top-left edges (l on paper, m on dark stuff)
//  - light from the top left, 3-4 tones per material, hand-placed highlights
//  - nine-slice frames keep the slice the CSS already uses (noted per map)
//
// API: kitPx(name, recolor?) → a Px raster (r = 1); kitURL(name, recolor?) → cached data URL;
//      KIT_SLICE[name]; LEGEND; MAPS (for previews); tileFrom(names, layout) composes bigger tiles.
import { PAL, snapHex } from './palette.js';
import { Px } from './px.js';
import { M1 } from './handMaps1.js';
import { M2 } from './handMaps2.js';
import { M3 } from './handMaps3.js';
import { M4 } from './handMaps4.js';
import { M5 } from './handMaps5.js';
import { M6 } from './handMaps6.js';

/** One character per palette colour. '.' is transparent. */
export const LEGEND = {
  k: 'ink', p: 'plum', m: 'plumMid', l: 'plumLt', a: 'mauve',
  i: 'indigo', h: 'slate', H: 'steel', j: 'mist',
  C: 'cream', c: 'creamDk', s: 'sand', t: 'tan',
  B: 'bark', w: 'wood', W: 'woodMid', L: 'woodLt',
  D: 'leatherDk', e: 'leather', E: 'leatherLt', K: 'skin',
  x: 'rust', X: 'copper', O: 'copperLt', P: 'peach',
  u: 'umber', b: 'brass', g: 'gold', G: 'goldLt', Y: 'goldPale',
  1: 'stoneDk', 2: 'stone', 3: 'stoneMid', 4: 'stoneLt', 5: 'stonePale',
  v: 'mossDk', V: 'moss', n: 'mossMid', N: 'leaf', y: 'lime',
  R: 'wine', r: 'red', f: 'flame', F: 'flameLt', o: 'rose',
  q: 'deepSea', Q: 'sea', z: 'ice', Z: 'frost',
  9: 'violet', 8: 'lilac',
};

export const MAPS = { ...M1, ...M2, ...M3, ...M4, ...M5, ...M6 };

/** The nine-slice each frame is cut at (art px). */
export const KIT_SLICE = {
  parch: 8, parchDog: 8, leather: 10, wood: 7, brass: 8, cover: 12, timber: 8,
  tomeBorder: 12, note: 5, sketch: 4, sign: 6, signT: 6, ticket: 6, slate: 5, iron: 5, plank: 6,
};

/** Common recolourings (character → character), e.g. the green journal cover. */
export const RECOLOR = {
  journal: { R: 'V', r: 'n', p: 'v', m: 'v' },
  woodDk: { L: 'W', W: 'w', w: 'B', B: 'p' },
  blueRib: { R: 'q', r: 'Q', o: 'z' },
  greenRib: { R: 'v', r: 'V', o: 'n' },
  kraft: { C: 's', c: 's', s: 't', t: 'W' },
  ledger: { C: 'C', c: 'C', s: 'c', t: 's' },
};
/** Accent fields for the manuscript pieces (the maps are drawn red / blue). */
export const ACCENT = {
  red: {}, blue: { r: 'Q', o: 'z', R: 'q' }, green: { r: 'n', o: 'N', R: 'v' }, gold: { r: 'b', o: 'G', R: 'u' }, purple: { r: '9', o: '8', R: 'm' },
};
export const FIELD = {
  blue: {}, red: { q: 'R', Q: 'r', z: 'o', Z: 'C' }, green: { q: 'v', Q: 'V', z: 'N', Z: 'y' }, purple: { q: 'm', Q: '9', z: '8', Z: 'C' }, gold: { q: 'u', Q: 'b', z: 'G', Z: 'Y' },
};

const hexInt = (name) => parseInt((PAL[name] || '#ff00ff').slice(1), 16);
const COL = Object.fromEntries(Object.entries(LEGEND).map(([ch, n]) => [ch, hexInt(n)]));
/** A recolour target: a legend character, or a '#rrggbb' colour (snapped to the master palette). */
const colOf = (ch) => (typeof ch === 'string' && ch[0] === '#' ? parseInt(snapHex(ch).slice(1), 16) : COL[ch] ?? 0xff00ff);

function rowsOf(name) {
  const m = MAPS[name];
  if (!m) throw new Error('handKit: no map ' + name);
  return Array.isArray(m) ? m : m.rows;
}

/** Paint a map into a 1× Px. recolor: { ch: ch } or a RECOLOR key; flip: 'h' | 'v' | 'hv'. */
export function kitPx(name, recolor = null, flip = '') {
  const rows = rowsOf(name), w = rows[0].length, h = rows.length;
  const rc = typeof recolor === 'string' ? RECOLOR[recolor] : recolor;
  const p = new Px(w, h, 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let ch = rows[y][x];
    if (ch === '.' || ch === ' ') continue;
    if (rc && rc[ch]) ch = rc[ch];
    const X = flip.includes('h') ? w - 1 - x : x, Y = flip.includes('v') ? h - 1 - y : y;
    p.set(X, Y, colOf(ch));
  }
  return p;
}

/** Lay maps out in a grid ([[name|[name, flip, recolor]]...]) into one bigger tile. */
export function tileFrom(layout, recolor = null) {
  const cell = (c) => (Array.isArray(c) ? c : [c, '', null]);
  const first = rowsOf(cell(layout[0][0])[0]);
  const cw = first[0].length, ch = first.length;
  const p = new Px(cw * layout[0].length, ch * layout.length, 1);
  layout.forEach((row, j) => row.forEach((c, i) => { const [n, f, r] = cell(c); p.blit(kitPx(n, r || recolor, f || ''), i * cw, j * ch); }));
  return p;
}

const urls = new Map();
/** A cached data URL of a map. */
export function kitURL(name, recolor = null, flip = '') {
  const k = name + '|' + (typeof recolor === 'string' ? recolor : JSON.stringify(recolor)) + '|' + flip;
  if (!urls.has(k)) urls.set(k, kitPx(name, recolor, flip).url());
  return urls.get(k);
}
export const kitCss = (name, recolor, flip) => `url("${kitURL(name, recolor, flip)}")`;

// ---------------------------------------------------------------- the interface's shared art (--a-*)
// uiArt.js asks here first (asset(key)): each entry returns a 1× Px drawn from the maps above.
const P3 = (a, b) => [[a, b, [a, 'h']], [[b, 'v'], [a, 'hv'], b], [[b, 'h'], a, [b, 'hv']]]; // 3×3 of two sheets, flipped about
export const KIT_ASSETS = {
  // frames (the slice each stylesheet cuts them at is unchanged: KIT_SLICE)
  parch: () => kitPx('parch'),
  parchDog: () => kitPx('parchDog'),
  leather: () => kitPx('leather'),
  wood: () => kitPx('wood'),
  brass: () => kitPx('brass'),
  slate: () => kitPx('slate'),
  note: () => kitPx('note'),
  sketch: () => kitPx('sketch'),
  cover: () => kitPx('cover'),
  journal: () => kitPx('cover', 'journal'),
  sign: () => kitPx('sign'),
  signT: () => kitPx('signT'),
  ticket: () => kitPx('ticket'),
  timber: () => kitPx('timber'),
  iron: () => kitPx('iron'),
  // buttons
  btnGold: () => kitPx('btnGold'), btnGoldDn: () => kitPx('btnGoldDn'),
  btnAlt: () => kitPx('btnAlt'), btnAltDn: () => kitPx('btnAltDn'),
  btnDanger: () => kitPx('btnDanger'), btnDangerDn: () => kitPx('btnDangerDn'),
  btnWood: () => kitPx('btnWood'), btnWoodDn: () => kitPx('btnWoodDn'),
  // small pieces
  eyelet: () => kitPx('eyelet'),
  waxSeal: () => kitPx('waxSeal'),
  grainA: () => kitPx('grain'),
  ribbonV: () => kitPx('ribbonV'),
  gutterL: () => kitPx('gutter'),
  gutterR: () => kitPx('gutter', null, 'h'),
  smudge: () => kitPx('smudge'),
  // tiles (sizes as the stylesheets expect them)
  paperT: () => kitPx('paperA'),
  pageT: () => kitPx('pageA'),
  noteT: () => kitPx('paperB', { c: 'C', s: 'c', t: 's' }),
  leatherT: () => kitPx('leather24'),
  coverT: () => kitPx('leather24', { e: 'R', E: 'r', D: 'p' }),
  journalT: () => kitPx('leather24', { e: 'V', E: 'n', D: 'v' }),
  canvasT: () => kitPx('canvas'),
  woodT: () => kitPx('planks'),
  woodDkT: () => kitPx('planksDk', 'woodDk'),
  slateT: () => kitPx('slate24'),
  paperL: () => tileFrom(P3('paperA', 'paperB')),
  pageL: () => tileFrom(P3('pageA', 'pageB')),
  coverL: () => tileFrom([['leather32', ['leather32', 'h']], [['leather32', 'v'], ['leather32', 'hv']]], { e: 'R', E: 'r', D: 'p' }),
  journalL: () => tileFrom([['leather32', ['leather32', 'h']], [['leather32', 'v'], ['leather32', 'hv']]], { e: 'V', E: 'n', D: 'v' }),
  woodL: () => tileFrom([['planks', 'planksLong', ['planksLong', 'h']], [['planksLong', 'h'], 'planksLong', ['planks', 'h']]]),
  woodDkL: () => tileFrom([['planksDk', ['planksDk', 'h'], 'planksDk'], [['planksDk', 'h'], 'planksDk', ['planksDk', 'h']]], 'woodDk'),
  // a carved wooden slider track (12×8, slice 3)
  track: () => mapPx(['.kkkkkkkkkk.', 'kBBBBBBBBBBk', 'kBppppppppWk', 'kBppppppppWk', 'kBppppppppWk', 'kBppppppppWk', 'kWWWWWWWWWLk', '.kkkkkkkkkk.']),
  // the Miners' Board's slate: the paper's hand marks become chalk dust and scratches
  chalkL: () => tileFrom([['paperA', ['paperB', 'h'], ['paperA', 'v']], [['paperB', 'v'], 'paperA', ['paperB', 'hv']]], { c: 'v', C: 'V', s: 'k', t: 'k' }),
  ledge: () => mapPx(['WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', 'LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL', 'WWWWwWWWWWWWWWWWWWWwwWWWWWWWWWWW', 'WWWWWWWWWWWWwWWWWWWWWWWWWWWWWWWW', 'WWWWWWWWWWWWWWWWWWWWWWWWWWwWWWWW', 'wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww', 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', 'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk', '................................']),
  chalk: () => mapPx(['.kkkkkkkkkkk.', 'kCCCCCCCCCCck', 'kCcccccccccsk', 'kcsssssssssjk', '.kkkkkkkkkkk.']),
  eraser: () => mapPx(['..kkkkkkkkkkkkkkkkkk..', '.kLLLLLLLLLLLLLLLLLLWk.', 'kLWWWWWWWWWWWWWWWWWWwk', 'kWwwwwwwwwwwwwwwwwwwBk', 'kkkkkkkkkkkkkkkkkkkkkk', 'kjjjjjjjjjjjjjjjjjjjHk', 'kjHHHHHHHHHHHHHHHHHHhk', 'khhhhhhhhhhhhhhhhhhhik', '.kkkkkkkkkkkkkkkkkkkk.']),
};

// ---------------------------------------------------------------- the manuscript kit (tomeArt.js asks here first)
const V4 = [['paperA', 'paperB', ['paperA', 'h'], ['paperB', 'v']], [['paperB', 'h'], ['paperA', 'v'], 'paperB', 'paperA'],
  [['paperA', 'hv'], 'paperB', 'paperA', ['paperB', 'h']], ['paperB', ['paperA', 'h'], ['paperB', 'v'], 'paperA']];
const stack = (name, flip = '') => { const a = kitPx(name, null, flip), p = new Px(a.w, a.h * 2, 1); p.blit(a, 0, 0); p.blit(kitPx(name, null, flip + 'v'), 0, a.h); return p; };
export const TOME_KIT = {
  vellum: () => tileFrom(V4),
  vellumDk: () => tileFrom(V4.slice(0, 3).map((r) => r.slice(0, 3)), { c: 's', C: 'c', s: 't' }),
  'border-red': () => kitPx('tomeBorder', ACCENT.red),
  'border-blue': () => kitPx('tomeBorder', ACCENT.blue),
  'border-green': () => kitPx('tomeBorder', ACCENT.green),
  'border-gold': () => kitPx('tomeBorder', ACCENT.gold),
  'border-purple': () => kitPx('tomeBorder', ACCENT.purple),
  corner: () => kitPx('ironCorner'),
  clasp: () => kitPx('clasp'),
  edgeR: () => stack('foreEdge'),
  edgeL: () => stack('foreEdge', 'h'),
  stain: () => new Px(1, 1, 1),
  stainB: () => new Px(1, 1, 1),
  pilcrow: () => kitPx('pilcrow'),
  pilcrowB: () => kitPx('pilcrow', ACCENT.blue),
  knot: () => kitPx('knot'),
  knotB: () => kitPx('knot', ACCENT.blue),
};
export const capKit = (field) => kitPx('capField', FIELD[field] || {});

/** Paint an inline map (a module's own hand-drawn sprite) with the shared legend. */
export function mapPx(rows, recolor = null, flip = '') {
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const rc = typeof recolor === 'string' ? RECOLOR[recolor] : recolor;
  const p = new Px(w, h, 1);
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    let ch = rows[y][x];
    if (ch === '.' || ch === ' ') continue;
    if (rc && rc[ch]) ch = rc[ch];
    const X = flip.includes('h') ? w - 1 - x : x, Y = flip.includes('v') ? h - 1 - y : y;
    p.set(X, Y, colOf(ch));
  }
  return p;
}

// ---------------------------------------------------------------- dialogue boards (dialogArt.js asks here first)
const SOOT = { c: 's', C: 'c', s: 't', t: 'W' }, LEDGER = { c: 'C', s: 'c', t: 's' }, KRAFT = { C: 's', c: 't', s: 'W', t: 'w', l: 'm' };
export const DIALOG_KIT = {
  board: () => kitPx('board'),
  parch: () => kitPx('sheet'),
  parchJournal: () => kitPx('sheet'),
  parchForge: () => kitPx('sheet', { c: 's', C: 'c', s: 't', t: 'w' }),
  parchLedger: () => kitPx('sheet', LEDGER),
  parchKraft: () => kitPx('sheet', KRAFT),
  pframe: () => kitPx('pframe'),
  plaque: () => kitPx('plaque'),
  tube: () => kitPx('tube'),
  ribbon: () => kitPx('ribbon'),
  ribbonBlue: () => kitPx('ribbon', RECOLOR.blueRib),
  ribbonGreen: () => kitPx('ribbon', RECOLOR.greenRib),
  sootT: () => tileFrom(P3('paperA', 'paperB'), SOOT),
  ledgerT: () => tileFrom(P3('paperA', 'paperB'), LEDGER),
  kraftT: () => tileFrom(P3('paperA', 'paperB'), KRAFT),
  rule8: () => kitPx('rule8'),
  rule11: () => kitPx('rule11'),
  pencil8: () => kitPx('rule8', { s: 'a', t: 'l' }),
  pencil11: () => kitPx('rule11', { s: 'a', t: 'l' }),
  margin: () => kitPx('margin'),
  glint: () => kitPx('glint'),
};

// ---------------------------------------------------------------- the skill board (skillChrome.js asks here first)
/** Widen a map by repeating column `at` n more times (buttons whose side slices are wider). */
const widen = (rows, at, n) => rows.map((r) => r.slice(0, at) + r[at].repeat(n) + r.slice(at));
const KNOB = [
  '....kkkkkkk....',
  '..kkGGGGGGGkk..',
  '.kGGYYGGGGGGbk.',
  '.kGYYGGGGGGGbk.',
  'kGGYGgggggGGbbk',
  'kGGGgguuugggbbk',
  'kGGGguGGGugGbbk',
  'kGGGguGYGugGbbk',
  'kGGGguGGGugGbbk',
  'kGGGgguuuggbbbk',
  'kbGGGgggggbbbuk',
  '.kbGGGGGGbbbuk.',
  '.kbbbbbbbbbuuk.',
  '..kkuuuuuuukk..',
  '....kkkkkkk....',
];
const INSET = [
  '.pppppppppppppp.',
  'pBBBBBBBBBBBBBBp',
  'pBpppppppppppppW',
  'pBpwwwwwwwwwwwWW',
  'pBpwwwwwwwwwwwWW',
  'pBpwwwwwwwwwwwWW',
  'pBpwwwwwwwwwwwWW',
  'pBpwwwwwwwwwwwWW',
  'pBpwwwwwwwwwwwWW',
  'pBpwwwwwwwwwwwWW',
  'pBpwwwwwwwwwwwWW',
  'pBpwwwwwwwwwwwWW',
  'pBpwwwwwwwwwwwWW',
  'pBWWWWWWWWWWWWWW',
  'pWWWWWWWWWWWWWWL',
  '.pLLLLLLLLLLLLL.',
];
const BTN20 = () => widen(MAPS.btnGold, 3, 4);
const BTN20D = () => widen(MAPS.btnGoldDn, 3, 4);
const GREEN = { Y: 'y', G: 'N', g: 'n', b: 'V', u: 'v' };
const IRONB = { Y: '5', G: '4', g: '3', b: '2', u: '1' };
export const SKILL_KIT = {
  panel: () => kitPx('cover', { R: 'w', r: 'W', p: 'B', m: 'B' }),
  leather: () => tileFrom([['leather32', ['leather32', 'h']], [['leather32', 'v'], ['leather32', 'hv']]], { e: 'D', E: 'e', D: 'p' }),
  inset: () => mapPx(INSET),
  knob: () => mapPx(KNOB),
  knobH: () => mapPx(KNOB, { G: 'Y', g: 'G', b: 'g' }),
  btn: () => mapPx(BTN20()),
  btnDn: () => mapPx(BTN20D()),
  btnGo: () => mapPx(BTN20(), GREEN),
  btnGoDn: () => mapPx(BTN20D(), GREEN),
  btnOff: () => mapPx(BTN20(), IRONB),
};

// ---------------------------------------------------------------- the forge (forgeArt.js / forgeBookArt.js ask here first)
// a screwed plate for `stretch` (16, slice 5): the edge rows / columns constant, a screw in each corner
const PLATE = [
  '.kkkkkkkkkkkkkk.',
  'kYYYYYYYYYYYYYGk',
  'kYuGGGGGGGGGGubk',
  'kYGYGGGGGGGGGgbk',
  'kYGGgggggggggGbk',
  'kYGGgggggggggGbk',
  'kYGGgggggggggGbk',
  'kYGGgggggggggGbk',
  'kYGGgggggggggGbk',
  'kYGGgggggggggGbk',
  'kYGGgggggggggGbk',
  'kYGGgggggggggGbk',
  'kYGgbbbbbbbbbgbk',
  'kYubbbbbbbbbbubk',
  'kbbuuuuuuuuuuuuk',
  '.kkkkkkkkkkkkkk.',
];
const PLATE_DN = PLATE.map((r, y) => (y === 1 ? 'kuuuuuuuuuuuuuuk' : y === 14 ? 'kGGGGGGGGGGGGGGk' : r.replace(/^kY/, 'ku')));
// a wax seal pressed straight (14): a lumpy blob, the rim proud, a mole-star sunk into it
const SEAL = [
  '....kkkkk.....',
  '..kkoorrrkk...',
  '.kooorrrrrRk..',
  '.korrRrRrrRRk.',
  'korrrRoRrrrRk.',
  'korRRoooRRrRpk',
  'korrRoRoRrrRpk',
  'kRrrrRoRrrrRpk',
  'kRrrrRrRrrRRpk',
  '.kRrrrrrrRRpk.',
  '.kRRrrrrRRppk.',
  '..kpRRRRppkk..',
  '...kkppppkRk..',
  '.....kkkk.kk..',
];
const TACK = ['..kkkk..', '.kooork.', 'kooorrRk', 'korrrrRk', 'krrrrRRk', '.kRRRRk.', '..kkkk..', '...k2...', '...k1...'];
const RULE_ORN = ['................', 'wwwwwww.r.wwwwww', '.......rrr......', 'WwwwwWw.r.wWwwwW', '................'];
const SLATE_PAPER = { c: 'v', C: 'V', s: 'k', t: 'k' }; // a green-black chalkboard, the paper's marks as chalk dust
export const FORGE_KIT = {
  board: () => kitPx('timber'),
  chalkT: () => kitPx('paperA', SLATE_PAPER),
  ironBoard: () => kitPx('cover'),
  vellumT: () => kitPx('paperA'),
  plate: () => mapPx(PLATE), plateDn: () => mapPx(PLATE_DN),
  plateBlue: () => mapPx(PLATE, { Y: 'Z', G: 'z', g: 'Q', b: 'q', u: 'i' }), plateBlueDn: () => mapPx(PLATE_DN, { Y: 'Z', G: 'z', g: 'Q', b: 'q', u: 'i' }),
  plateGreen: () => mapPx(PLATE, { Y: 'y', G: 'N', g: 'n', b: 'V', u: 'v' }), plateGreenDn: () => mapPx(PLATE_DN, { Y: 'y', G: 'N', g: 'n', b: 'V', u: 'v' }),
  plateInk: () => mapPx(PLATE, { Y: 'l', G: 'm', g: 'p', b: 'k', u: 'k' }), plateInkDn: () => mapPx(PLATE_DN, { Y: 'l', G: 'm', g: 'p', b: 'k', u: 'k' }),
  forgeSeal: () => mapPx(SEAL),
  soot: () => kitPx('smudge'),
  ruleOrn: () => mapPx(RULE_ORN),
  tackRed: () => mapPx(TACK), tackBlue: () => mapPx(TACK, { o: 'z', r: 'Q', R: 'q' }), tackGold: () => mapPx(TACK, { o: 'Y', r: 'G', R: 'b' }), tackGreen: () => mapPx(TACK, { o: 'y', r: 'n', R: 'V' }),
};
