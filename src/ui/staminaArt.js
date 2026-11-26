// Pixel art for the stamina gauge (src/ui/Stamina.js), drawn by hand as pixel maps (wave 19, "hand-drawn
// first"): string grids with a small named palette each, one canvas pixel per art pixel, scaled up by
// whole numbers in CSS (one art pixel = one --px, like the rest of the HUD). Code only places, tiles,
// recolours and animates these maps; nothing is generated, no noise, no gradients, no glow.
//  - MEDALLION: a forged iron ring (lopsided on purpose, lit from the top left, three rivets) round a
//    plum recess that holds the mole's live 3D face (src/ui/staminaFace.js); its lower rim is drawn
//    again over the face (front) so the head sits in it and the neck sinks behind
//  - STAVE: a carved walnut stave with a trough cut along it (stamina, hunger and injury are tiled into
//    the trough each frame), two nicks in its top edge, a couple of grain cuts
//  - IRON: staples clamping the trough and an iron shoe nailed on the right end
//  - fill tiles: the amber (and its ember recolour when low), its sloshing edge, the pale hatching of
//    what was just spent, the biscuit of hunger with its bitten edge, the bandage of injury and its
//    blood, the tummy-rumble marks

/** Colours (0xRRGGBB). Shadows go to plum, highlights stop at cream. */
export const COL = { // (wave 20: all from the master palette, src/ui/palette.js)
  ink: 0x1e1424,
  ironL: 0xa2989a, ironM: 0x7a7174, ironD: 0x3a3438,
  rec: 0x2e1b33, recLit: 0x4a2b4a,
  walL: 0x86552e, walM: 0x5e3a22, walD: 0x3a2318, trough: 0x1e1424,
  ambL: 0xecc650, ambM: 0xf28e2e, ambD: 0xb45e30,
  embL: 0xde8a52, embM: 0xd4561e, embD: 0x9a2c2a,
  cream: 0xfff0d2,
  bisL: 0xdcbf8a, bisM: 0xb8945e, bisD: 0x86552e,
  linL: 0xfff0d2, linM: 0xf2dcae, linS: 0xa2989a,
  bloodM: 0x9a2c2a, bloodD: 0x5e1824,
};

/** Layout (art px): the canvas (4 rows of headroom over the medallion for a helmet or candle), where each map sits, the trough (inclusive), the face's box. */
export const GEO = {
  W: 98, H: 34,
  med: { x: 0, y: 4, cx: 14.5, cy: 18.5 },
  stave: { x: 20, y: 22 },
  ch: { x0: 31, x1: 89, y0: 26, y1: 30 },
  face: { x: 0, y: 0, w: 30, h: 34 },
};

// ---------------------------------------------------------------- the medallion (30 × 30)
// K ink · l iron, lit · m iron · d iron, shade · r recess · p lamplight pooling in the recess
const MEDALLION = {
  pal: { K: COL.ink, l: COL.ironL, m: COL.ironM, d: COL.ironD, r: COL.rec, p: COL.recLit },
  rows: [
    '...........KKKKKKKK...........',
    '........KKKlllmllllKKK........',
    '......KKlllmmmmmmmmlllKK......',
    '.....KllmmmmmmmmmmmmmmllK.....',
    '....KlmmmmmmKKKKKKmmmmmmlK....',
    '...KlmmmmKKKrrrrrrKKKmmmmmK...',
    '..KlmmmmKrrrrrrrrrrrrKmmmmmK..',
    '..KlmmmKrrrrrrrrrrrrrrKmmmmK..',
    '.KlmKmKrrrrrrrrrrrrrrrrKmmmmK.',
    '.KlmmKrrrrrrrrrrrrrrrrrKmmmdK.',
    '.KlmmKrrrrrrrrrrrrrrrrrrKmddK.',
    'KlmmKrrrrrrrrrrrrrrrrrrrKddddK',
    'KlmmKrrrrrrrrrrrrrrrrrrrKmdddK',
    'KmmmKrrrrrrrrrrrrrrrrrrrKmlmdK',
    'KlmmKrrrrrrrrrrrrrrrrrrrKmmKdK',
    'KlmmKrrrrrrrrrrrrrrrrrrrKmdddK',
    'KlmmKrrrrrrrrrrrrrrrrrrrKmdddK',
    'KlmmKrrrrrrrrrrrrrrrrrrrKmdddK',
    'KlmmmKrrrrrrrrrrrrrrpprrKmdddK',
    '.KlmmKrrrrrrrrrrrrpppppKmddddK',
    '.KlmmmKrrrrrrrrrrppppprKmdddK.',
    '.KlmmmKrrrrrrrrrrrppprKmddddK.',
    '..KmmmmKKrrrrrrrrrrprKmdddddK.',
    '..KmmmmmmKKrrrrrrrrKKmdddddK..',
    '...KmmmmddmKKKKKKKKmmddddddK..',
    '....KmmddddmmmmmmmmdddddddK...',
    '.....KdddddddddddlmddddddK....',
    '......KKdddddddddmKddddKK.....',
    '........KKKdddddddddKKK.......',
    '...........KKKKKKKKK..........',
  ],
};
/** The rim's lower part, drawn again over the face: rows from FRONT_Y down, ring pixels only. */
const FRONT_Y = 22;

// ---------------------------------------------------------------- the stave (78 × 12)
// K ink · L walnut, lit · M walnut · D walnut, shade · T the empty trough
const STAVE = {
  pal: { K: COL.ink, L: COL.walL, M: COL.walM, D: COL.walD, T: COL.trough },
  rows: [
    '.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.....KKKKKKKKKKKKKKKKKKKKKKK....KKKKKKKKKKKK.',
    'KLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLKKKKKLLLLLLLLLLLLLLLLLLLLLLLKKKKLLLLLLLLLLLLK',
    'KMMMMMMMMMMMMMMMMMMMMDDDMMMMMMMMMLLLLLMMMMMMMMMMMMDDDDMMMMMMMMLLLLMMMMMMMMMMMK',
    'KDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDK',
    'KMMDDMMMLMMTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTKLMLMMK',
    'KMDLMDMMMMMTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTKLMLMLK',
    'KMDMDDMMMMMTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTKLMDMLK',
    'KMMDDMMMMMMTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTKDMMMLK',
    'KMMMMMMLMMMTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTKMMMMMK',
    'KLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLK',
    'KDDDDDDDDDDDDDKDDMMMDDDDDDDDDDDDDDDDDDDDDDDDDDDKDDDDDDDMMMMDDDDKDDDDDDDDDDDDDK',
    '.KKKKKKKKKKKKK.KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.KKKKKKKKKKKKKKK.KKKKKKKKKKKKK.',
  ],
};

// ---------------------------------------------------------------- iron (staples, the shoe)
// K ink · h iron, lit · i iron · j iron, shade
const IRON_PAL = { K: COL.ink, h: COL.ironL, i: COL.ironM, j: COL.ironD };
const STAPLE_TOP = { pal: IRON_PAL, rows: ['KKKKK', 'KhhiK', 'KhijK', 'KKKKK'] };
const STAPLE_BOT = { pal: IRON_PAL, rows: ['KhhiK', 'KijjK', 'KKKKK'] };
const SHOE = {
  pal: IRON_PAL,
  rows: [
    'KKKKKKK.',
    'KhhhhhiK',
    'KhiiiijK',
    'KhihKijK',
    'KhiKjijK',
    'KhiiiijK',
    'KhiiiijK',
    'KhiihKjK',
    'KhiiKjjK',
    'KhiiiijK',
    'KijjjjjK',
    '.KKKKKKK',
  ],
};
/** Where the iron goes, in stave coordinates (by eye, not at exact quarters). */
const STAPLES = [26, 41, 55];

// ---------------------------------------------------------------- fill tiles (the trough is 5 rows)
/** The amber, one column (top row lit, then mid, then shade), and a lit dash that drifts along row 1. */
export const FILL = { rows: ['a', 'b', 'b', 'c', 'c'], dash: 4, period: 19 };
/** The amber's cut edge, three slosh frames: per row, how far the edge sits back (0 = flush). */
export const EDGE = [[0, 0, 0, 1, 1], [1, 0, 0, 0, 1], [1, 1, 0, 0, 0]];
/** What was just spent: pale cream hatching. */
export const GHOST = ['e...', '...e', '..e.', '.e..', 'e...'];
/** Hunger: a biscuit with docking holes (g lit, f, k shade), and its bitten front edge ('.' = leave). */
export const BISCUIT = ['gggggggggg', 'ffffffffff', 'ffkfffffff', 'ffgffffkff', 'kkkkkkkgkk'];
export const BITE = ['Kgg', '.Kf', 'Kff', 'Kff', '.Kk'];
/** Injury: a linen bandage wound round the stave (12 rows: it covers the rails too). n lit, o shade, s seam. */
export const BANDAGE = ['KKKKK', 'nnnns', 'nnnsn', 'nnsnn', 'nsnnn', 'snnnn', 'nnnns', 'nnnso', 'oosoo', 'osooo', 'soooo', 'KKKKK'];
/** Blood soaking through, three sizes (x blood, y its dark core). */
export const BLOOD = [
  ['.x.', 'xyx', '.x.'],
  ['.xx.', 'xyyx', 'xyx.', '.x..'],
  ['..xx..', '.xyyx.', 'xyyyxx', '.xyyx.', '..x.x.'],
];
/** The tummy rumbling: a cut mark beside the medallion. */
export const RUMBLE = ['e.', '.e', '.e', '.e', 'e.'];

// colours as 0xRRGGBB; the canvas buffer wants 0xAABBGGRR
export const pk = (c, a = 255) => ((a << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255)) >>> 0;

/** Tile keys → packed colours (the trough's fills; Stamina.js swaps the amber for ember when low). */
export const TONE = {
  amber: { a: pk(COL.ambL), b: pk(COL.ambM), c: pk(COL.ambD) },
  ember: { a: pk(COL.embL), b: pk(COL.embM), c: pk(COL.embD) },
  e: pk(COL.cream), K: pk(COL.ink), T: pk(COL.trough),
  g: pk(COL.bisL), f: pk(COL.bisM), k: pk(COL.bisD),
  n: pk(COL.linL), o: pk(COL.linM), s: pk(COL.linS),
  x: pk(COL.bloodM), y: pk(COL.bloodD),
};

/** Stamp a pixel map into a W-wide packed buffer at (x0, y0). */
function stamp(buf, W, H, map, x0, y0) {
  map.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = map.pal[row[i]];
      if (c === undefined) continue;
      const x = x0 + i, y = y0 + j;
      if (x >= 0 && y >= 0 && x < W && y < H) buf[y * W + x] = pk(c);
    }
  });
}

let layers = null;
/**
 * The static layers, made once: { W, H, base, front (the rim's lower part, drawn over the face),
 * clip (where the face may draw), rec (the recess, where the face's shadow falls) }.
 */
export function gaugeLayers() {
  if (layers) return layers;
  const { W, H } = GEO;
  const base = new Uint32Array(W * H), front = new Uint32Array(W * H), clip = new Uint8Array(W * H), rec = new Uint8Array(W * H);
  const S = GEO.stave, M = GEO.med;
  stamp(base, W, H, STAVE, S.x, S.y);
  for (const x of STAPLES) { stamp(base, W, H, STAPLE_TOP, S.x + x, S.y); stamp(base, W, H, STAPLE_BOT, S.x + x + 1, S.y + 9); }
  stamp(base, W, H, SHOE, S.x + STAVE.rows[0].length - SHOE.rows[0].length, S.y);
  stamp(base, W, H, MEDALLION, M.x, M.y);
  for (let y = 0; y < M.y; y++) for (let x = M.x; x < M.x + MEDALLION.rows[0].length; x++) clip[y * W + x] = 1; // the headroom
  MEDALLION.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i], x = M.x + i, y = M.y + j, k = y * W + x;
      if (ch === '.') { if (y < S.y) clip[k] = 1; continue; } // above the stave the face may poke out
      clip[k] = 1;
      if (ch === 'r' || ch === 'p') rec[k] = 1;
      else if (j >= FRONT_Y) front[k] = base[k];
    }
  });
  layers = { W, H, base, front, clip, rec };
  return layers;
}
