// Pixel art for the Wave 9 books (the Book, the Index Book, the skill tree's binding, the Miners'
// Board's notices, the survey, the pause chronicle): an illuminated manuscript kit. Everything is
// hand-built at the art grid (1 art px = one --px), drawn at 2× through uiArt's art() (fine
// half-pixels for hairlines, filigree and glints) and cached as data URLs.
//  - vellum: an aged calfskin page (hair-side follicles, a tide-lined water stain, foxing, a faint
//    dry-point ruling with the pricking down the margin)
//  - border(ink): the inked page frame (9-slice, slice 12 on 64): a hand-ruled triple rule
//    (sepia, vermilion, sepia) with gold bezants, a vine scroll with leaves and berries in each
//    corner, buds hanging off the rule along the edges
//  - cap(field): the frame of an illuminated initial: burnished, punched gold leaf round a lapis /
//    vermilion / verdigris / murex field with a diaper lattice and white filigree, ivy sprigs out of
//    two corners (the letter is set on top in the blackletter font)
//  - doodle(kind): marginalia in iron-gall ink with a little wash: a mole with his lantern, a raptor,
//    an ore crystal cluster, a toadstool, a snail, a pointing hand, a beetle, a pick
//  - ribbon(hex, vertical): a silk ribbon bookmark (9-slice) with a swallowtail end
//  - seal(hex, size): a wax seal with a rolled, dripped edge and a pressed sigil
//  - corner(): an iron corner piece for the covers (pierced quatrefoil, brass bosses)
//  - clasp(): a leather strap with a brass hook clasp
//  - edge(side): the browned, nicked fore-edge of a page; stain(): a tide-lined stain
//  - quill(), pilcrow(), manicule(), compass(), scaleBar(), knot()
// installTomeArt() publishes the shared pieces as --t-* custom properties on :root (idle, once).
import { Px, art, cssUrl } from './uiArt.js';
import * as CA from './craftArt.js';

const { hash, pnoise, fbm, quant, mix } = CA;
const G = CA.TONES.brass; // gold leaf, dark → light (10)
const INK = 0x2a170c, INK2 = 0x4e321c, INK3 = 0x7a5a3a;
const RUB = [0x3e0c06, 0x6a1a10, 0x962818, 0xb8402c, 0xd25a40, 0xe88464, 0xf6b49a];
export const FIELDS = {
  blue: [0x0a1230, 0x13204c, 0x1d3070, 0x284496, 0x3a5cb6, 0x5c80d4, 0x94b2ec],
  red: RUB,
  green: [0x0a1c10, 0x12301c, 0x1c4628, 0x2a5e38, 0x3e7a4c, 0x62a070, 0x9ccaa0],
  purple: [0x1a0820, 0x2c1238, 0x441e54, 0x5e2e70, 0x7c468e, 0xa270b4, 0xcaa4d8],
  gold: [0x3a2410, 0x5a3a14, 0x7a5418, 0xa0721e, 0xc08e30, 0xdcae4e, 0xf7d97c],
};
const VELLUM = [0xa48058, 0xb69468, 0xc6a679, 0xd4b78a, 0xe0c79c, 0xead5ad, 0xf1e0bd, 0xf7ead0];
const wrap = (v, n) => ((v % n) + n) % n;

/** A ramp (dark → light, 7) from one colour. */
export function rampOf(hex) {
  const c = typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex;
  return [mix(c, 0x000000, 0.72), mix(c, 0x000000, 0.52), mix(c, 0x000000, 0.3), c, mix(c, 0xfff0d8, 0.18), mix(c, 0xfff0d8, 0.4), mix(c, 0xfff6e8, 0.66)];
}

// ---------------------------------------------------------------- vellum
function vellum(W = 128, H = 128, seed = 211) {
  const p = new Px(W, H), r = p.r;
  const F = CA.paperField(W, H, { seed, base: 0.66, mottle: 0.34, grain: 0.06, fibres: 0.45, stains: 2, fox: 1.3, foxSize: 1.1, res: r });
  CA.paintPaper(p, F, VELLUM);
  // the hair side: follicle specks in little drifts (dark fine dots in threes)
  for (let i = 0; i < (W * H) / 260; i++) {
    const cx = hash(i, 1, seed + 5) * W, cy = hash(i, 2, seed + 5) * H;
    if (fbm(cx, cy, W, H, 24, 2, seed + 6) < 0.5) continue;
    for (let k = 0; k < 3; k++) {
      const x = cx + (hash(i, k + 3, seed + 7) - 0.5) * 2.4, y = cy + (hash(i, k + 6, seed + 7) - 0.5) * 2.4;
      p.dot(wrap(x, W), wrap(y, H), mix(p.fget(Math.floor(wrap(x, W) * r), Math.floor(wrap(y, H) * r)), 0x5a3a20, 0.32));
    }
  }
  // a large, faint tide line: a damp patch that dried with a darker rim (wobbly, organic)
  const cx = W * 0.68, cy = H * 0.34, R0 = W * 0.2;
  p.fine((X, Y, fx, fy) => {
    let dx = X - cx, dy = Y - cy;
    dx -= Math.round(dx / W) * W; dy -= Math.round(dy / H) * H;
    const a = Math.atan2(dy, dx), d = Math.hypot(dx, dy * 1.25);
    const R = R0 * (0.82 + pnoise((a / (Math.PI * 2)) * 9 + 9, 0.5, 9, 2, seed + 9) * 0.36);
    const c = p.fget(fx, fy);
    if (Math.abs(d - R) < 0.6) return mix(c, 0x8a5a2c, 0.1);
    if (Math.abs(d - R) < 1.4) return mix(c, 0x9a6a3a, 0.05);
    if (d < R) return mix(c, 0xc49a62, 0.03 + (fbm(X, Y, W, H, 10, 2, seed + 10) - 0.5) * 0.04);
    return undefined;
  });
  // dry-point ruling: a hairline groove every 12 rows, broken here and there
  for (let y = 11; y < H; y += 12)
    for (let fx = 0; fx < p.fw; fx++) {
      if (hash(fx >> 3, y, seed + 13) < 0.12) continue;
      const fy = y * r + r - 1;
      p.fset(fx, fy, mix(p.fget(fx, fy), 0x8a6a48, 0.16));
    }
  return p;
}

// ---------------------------------------------------------------- the inked page border (9-slice)
const ACCENT = { red: RUB, blue: FIELDS.blue, green: FIELDS.green, purple: FIELDS.purple, gold: FIELDS.gold };
function border(kind = 'red') {
  const s = 12, M = 40, W = s * 2 + M, p = new Px(W, W), r = p.r, A = ACCENT[kind] || RUB;
  const sd = 300 + kind.length * 7;
  const edge = (x, y) => CA.edgeOf(x, y, W, W);
  // the triple rule: sepia at d 1, vermilion at d 3 (doubled where the pen pressed), sepia at d 4
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const { d, u, e } = edge(x, y);
      const uu = u >= s && u < W - s ? wrap(u - s, M) : u + 100 * e;
      if (Math.min(x, y, W - 1 - x, W - 1 - y) !== d) continue;
      const corner = (x < 2 || x > W - 3) && (y < 2 || y > W - 3);
      if (corner) continue;
      if (d === 1) p.set(x, y, INK2, 170 + Math.floor(hash(uu, 1, sd) * 60));
      else if (d === 3) p.set(x, y, A === RUB ? RUB[3] : A[3], 215);
      else if (d === 4) p.set(x, y, INK2, 110 + Math.floor(hash(uu, 4, sd) * 50));
      // gold bezants between the rules, every 6 px
      else if (d === 2 && wrap(uu, 6) === 3) p.set(x, y, G[6]);
    }
  // fine: the vermilion rule's pen edge, a glint on each bezant, ink feathering into the vellum
  if (r > 1)
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const { d, u, e } = edge(x, y);
        if (Math.min(x, y, W - 1 - x, W - 1 - y) !== d) continue;
        const uu = u >= s && u < W - s ? wrap(u - s, M) : u + 100 * e;
        if (d === 2 && wrap(uu, 6) === 3) p.dot(x, y, G[9]);
        if (d === 3 && hash(uu, 7, sd) < 0.18) p.dot(x + (e === 1 ? 0 : 0.5), y + (e === 2 ? 0 : 0.5), A[1] ?? RUB[1], 160);
        if (d === 1 && hash(uu, 8, sd) < 0.1) p.dot(x + (e === 3 ? 0.5 : 0), y + (e === 0 ? 0.5 : 0), INK, 120);
      }
  // buds hanging off the vermilion rule along each edge (on the middle's period): a short stem and a
  // three-lobed bud, alternating accent and gold
  for (let e = 0; e < 4; e++)
    for (const [k, at] of [[0, s + 10], [1, s + 30]]) {
      const col = k ? G : A;
      // in local terms: along = at, inward depth 4..8
      const P = (along, dep) => (e === 0 ? [along, dep] : e === 2 ? [along, W - 1 - dep] : e === 3 ? [dep, along] : [W - 1 - dep, along]);
      // penwork: a hairline tendril leaves the rule and curls into a little spiral, a seed bead
      // at its eye and two pen dots beside it (fine half-pixels; one art pixel bead at 1×)
      const sgn = k ? 1 : -1;
      let lx = null, ly = null;
      for (let t = 0; t <= 1.0001; t += 0.035) {
        // along the rule a little, then inward, winding round (organic: radius shrinks unevenly)
        const ang = sgn * t * Math.PI * 2.1 - Math.PI / 2, rad = 2.2 - t * 1.6 + Math.sin(t * 9) * 0.12;
        const al = at + sgn * 1.5 + Math.cos(ang) * rad, dp = 7.2 + Math.sin(ang) * rad;
        const [x, y] = P(al, dp);
        if (lx !== null) { if (r > 1) p.fline(lx + 0.5, ly + 0.5, x + 0.5, y + 0.5, col[3], 230); else p.set(x, y, col[3]); }
        lx = x; ly = y;
      }
      { const [x0, y0] = P(at, 4.6), [x1, y1] = P(at + sgn * 0.6, 5.4); if (r > 1) p.fline(x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, col[3], 230); }
      { const [x, y] = P(at + sgn * 1.5, 7); p.set(x, y, col[Math.min(col.length - 1, 4)]); if (r > 1) p.dot(x, y, col[col.length - 1]); }
      if (r > 1) for (const [da, dep] of [[-sgn * 1.4, 6.2], [-sgn * 0.8, 8.4], [sgn * 4.2, 6.6]]) { const [x, y] = P(at + da, dep); p.dot(x + 0.5, y + 0.5, INK2, 200); }
    }
  // the corners: a gold boss where the rules cross, a vine curling inward with leaves and berries
  const LEAF = FIELDS.green;
  for (let c = 0; c < 4; c++) {
    const fx = c & 1, fy = c >> 1;
    const X = (x) => (fx ? W - 1 - x : x), Y = (y) => (fy ? W - 1 - y : y);
    // the boss: a little gilt quatrefoil on the crossing (hand-placed lobes)
    const boss = [
      '..kk..',
      '.kyGk.',
      'kygGGk',
      'kgGGdk',
      '.kGdk.',
      '..kk..'];
    const bp = { k: INK, y: G[9], g: G[7], G: G[5], d: G[3] };
    for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { const ch = boss[j][i]; if (ch !== '.') p.set(X(i), Y(j), fx || fy ? (ch === 'y' ? bp.g : bp[ch]) : bp[ch]); }
    // the vine: from the boss, a stem curling into the corner field (organic, hand-placed)
    const stem = [[5, 5], [6, 6], [7, 6], [8, 7], [9, 8], [9, 9], [8, 10], [7, 10], [6, 9], [6, 8]];
    for (const [x, y] of stem) p.set(X(x), Y(y), INK2);
    // leaves: two pointed leaves off the stem, verdigris wash with an ink edge and a vein
    const leaves = [
      { at: [7, 6], pts: [[8, 4], [9, 3], [10, 3], [11, 4]], vein: [[9, 4], [10, 4]] },
      { at: [6, 8], pts: [[4, 9], [3, 10], [3, 11], [4, 11]], vein: [[4, 10]] },
    ];
    for (const L of leaves) {
      for (const [x, y] of L.pts) { p.set(X(x), Y(y), LEAF[4]); }
      for (const [x, y] of L.vein) p.set(X(x), Y(y), LEAF[2]);
      const [ax, ay] = L.pts[L.pts.length - 1];
      p.set(X(ax), Y(ay), LEAF[5]);
    }
    // berries: a red triplet at the curl's eye, a gold dot at the tip
    for (const [x, y, t] of [[7, 8, 3], [8, 8, 5], [7, 9, 2]]) p.set(X(x), Y(y), RUB[t]);
    p.set(X(10), Y(8), G[6]);
    if (r > 1) { p.dot(X(8) + (fx ? 0.5 : 0), Y(8) + (fy ? 0.5 : 0), RUB[6]); p.dot(X(10) + 0.5, Y(8), G[9]); }
  }
  return p;
}

// ---------------------------------------------------------------- the illuminated initial's frame
function cap(fieldKey = 'blue', seed = 1) {
  const S = 24, o = 3, Q = 18, p = new Px(S, S), r = p.r, F = FIELDS[fieldKey] || FIELDS.blue;
  const gold = fieldKey === 'gold';
  p.fine((X, Y, fx, fy) => {
    const x = Math.floor(X), y = Math.floor(Y);
    if (x < o || y < o || x >= o + Q || y >= o + Q) return undefined;
    const lx = x - o, ly = y - o, d = Math.min(lx, ly, Q - 1 - lx, Q - 1 - ly);
    const onTL = lx === d || ly === d; // the top or left side of its ring
    if (d === 0) return INK;
    if (d === 1) return onTL ? G[8] : G[3];
    if (d === 2) {
      const u = ly === d || Q - 1 - ly === d ? lx : ly;
      if (u % 3 === 1 && (fx + fy) % r === 0) return G[2]; // a punched dot in the burnished band
      return quant(G, 0.7 + (hash(fx, fy, seed) - 0.5) * 0.14 + (onTL ? 0.08 : -0.1), fx, fy, 0.4);
    }
    if (d === 3) return onTL ? G[1] : G[5]; // the band's sunken inner edge
    // the field: lit from the top-left, a fine diaper lattice with a white dot in each lozenge
    const FX = X - o - 4, FY = Y - o - 4, n = Q - 8;
    let k = 0.66 - ((FX + FY) / (2 * n)) * 0.34 + (fbm(X, Y, 48, 48, 6, 2, seed + 3) - 0.5) * 0.12;
    const P = 3 * r, a = wrap(fx + fy, P), b = wrap(fx - fy, P);
    if (a === 0 || b === 0) k += gold ? -0.14 : 0.1;
    else if (a === Math.floor(P / 2) && b === Math.floor(P / 2) && hash(fx, fy, seed + 5) < 0.5) return gold ? G[2] : F[5];
    return quant(gold ? G.slice(2, 9) : F, k, fx, fy, 0.5);
  });
  // white filigree: a hairline spiral tucked into each corner of the field
  const fil = gold ? INK2 : 0xf6f0e0;
  for (let c = 0; c < 4; c++) {
    const sx = c & 1 ? -1 : 1, sy = c >> 1 ? -1 : 1;
    const cx = (c & 1 ? o + Q - 4 : o + 4) + sx * 1.6, cy = (c >> 1 ? o + Q - 4 : o + 4) + sy * 1.6;
    let px0 = null, py0 = null;
    for (let t = 0; t <= 1.001; t += 0.04) {
      const ang = (sx * sy > 0 ? 1 : -1) * (t * Math.PI * 2.4) + Math.atan2(-sy, -sx), rad = 1.9 - t * 1.5;
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
      if (px0 !== null) p.fline(px0, py0, x, y, fil, 230);
      px0 = x; py0 = y;
    }
    // three seed dots fanning out of the spiral toward the centre
    for (const [dx, dy] of [[2.6, 0.6], [0.6, 2.6], [2, 2]]) p.dot(cx + dx * sx, cy + dy * sy, fil);
  }
  // ivy sprigs out of the top-left and bottom-right corners: an ink stem, a gold leaf, a red berry
  const sprig = (fx, fy) => {
    const X = (x) => (fx ? S - 1 - x : x), Y = (y) => (fy ? S - 1 - y : y);
    for (const [x, y] of [[2, 2], [1, 1]]) p.set(X(x), Y(y), INK);
    for (const [x, y, c] of [[0, 2, G[7]], [0, 3, G[5]], [1, 3, G[4]], [2, 0, RUB[3]], [3, 0, RUB[2]], [3, 1, INK]]) p.set(X(x), Y(y), c);
    if (r > 1) { p.dot(X(0) + (fx ? 0.5 : 0), Y(2) + (fy ? 0.5 : 0), G[9]); p.dot(X(2) + 0.5, Y(0), RUB[6]); }
  };
  sprig(false, false); sprig(true, true);
  // a vermilion bezant on the other two corners
  for (const [x, y] of [[S - 3, 1], [1, S - 3]]) { p.set(x, y, RUB[3]); p.set(x + 1, y, RUB[2]); p.set(x, y + 1, RUB[2]); p.set(x + 1, y + 1, RUB[1]); if (r > 1) p.dot(x, y, RUB[6]); }
  return p;
}

// ---------------------------------------------------------------- marginalia (hand-drawn templates)
// k ink · m pale ink · a/b/c wash (light → dark) · r/R vermilion · y/g/d gold · w white · s/S steel
// e/E green · p/P pink · o/O ore · u/U blue
const DOODLE_PAL = {
  k: INK, m: INK3, a: 0xd8c09a, b: 0xb89670, c: 0x8e6c4a, r: RUB[3], R: RUB[1], y: G[8], g: G[6], d: G[3],
  w: 0xfbf3e2, s: 0xc8c4bc, S: 0x7e7a74, e: 0x7ab07a, E: 0x3e7a4c, p: 0xe8a090, P: 0xb86a5a, o: 0xd8743a, O: 0x8a3a1a,
  u: 0x7e9ee0, U: 0x2e50a0, n: 0x6a4a2a, N: 0x4a2e18, t: 0xf2c060,
};
const DOODLES = {
  // Old Star's mole, upright, holding his lantern out on a stick
  mole: [
    '..........................',
    '..............kk..........',
    '.............k..k.........',
    '.............k..kkkkkkk...',
    '..............kk......k...',
    '......kkkkk...........kk..',
    '....kkbbbbbkk........kyyk.',
    '...kbbaaaaabbk......kytyyk',
    '..kbaaaaaaaaabk.....kyttyk',
    '..kbaaaaaaaakabk....kyyyyk',
    '.kbaaaaaaaaaaaabkk...kddk.',
    '.kbaaaaaaaaaaaaapPk...kk..',
    '.kbaaaaaaaaaaaakppPk......',
    '.kcbaaaaaaaaaabk.kkk......',
    '.kcbbaaaaaaaabbkk.........',
    'kcccbbbaaaaabbkppk........',
    'kccbbbbbbbbbbbkPpk........',
    'kccbbbbbbbbbbbbkk.........',
    'kcccbbbbbbbbbbck..........',
    '.kcccbbbbbbbbcck..........',
    '..kcccccccccccck..........',
    '...kkpPkkkkkpPkk..........',
    '..kppPk....kppPk..........',
    '...kkk......kkk...........'],
  // a raptor striding right: jaws open, little clawed arm, stiff tail out behind
  raptor: [
    '......................kkkkk.......',
    '.....................kaaaaakk.....',
    '....................kaaaaakaakk...',
    '....................kaaaaaaaaaak..',
    '...................kbaaaakkkkkkk..',
    '...................kbaaak.wkwkw...',
    '..................kbaaakkkkkkk....',
    '.................kbaaak...........',
    'kk..............kbaaak............',
    'kbkk...........kbaaaak............',
    '.kbbkkk.......kbaaaaak............',
    '..kkbbbkkkkkkkbaaaaaak.kk.........',
    '....kkbbbbbbbbbaaaaaabkbbk........',
    '......kkkcbbbbbbbbbbbbkkkbk.......',
    '.........kkcccbbbbbbbbk..kwk......',
    '...........kkcccccbbbk............',
    '............kccck.kccbk...........',
    '...........kccbk...kccbk..........',
    '..........kcbk......kcbk..........',
    '.........kcbk........kcbk.........',
    '........kwkk.........kwkkk........'],
  // a cluster of ore crystals on a lump of rock
  ore: [
    '..............k.......',
    '.............kwk......',
    '........k...kuuk......',
    '.......kwk..kuUk......',
    '.......kuUk.kuUk..k...',
    '......kuuUk.kuUk.kwk..',
    '......kuuUk.kuUUkkuUk.',
    '......kuuUUkkuUUkkuUk.',
    '...kk.kuuUUkkuuUkuuUk.',
    '..kwUkkuuuUkkuuUkuUUk.',
    '..kuUUkkuuUkkuuUkuUk..',
    '.kkuuUUkkuUkkuuUkkkkk.',
    'kbbkuuUkbkkkkkkkkbbbbk',
    'kbaakkkbbaabbbbbbbccbk',
    'kbaaaabbbaaaabbbbcccck',
    'kcbaaabbbbaabbbbccccck',
    '.kcbbbbbccbbbbcccccck.',
    '..kkcccccccccccckkkk..',
    '....kkkkkkkkkkkk......'],
  // a toadstool (glowcap) with a smaller one leaning on it
  mushroom: [
    '.......kkkkkkk.........',
    '.....kkuuwuuuukk.......',
    '....kuuwwuuuuuuuk......',
    '...kuuuuuuuwuuuuuk.....',
    '..kuuuwuuuuuuuuuuUk....',
    '..kuuuuuuuuuwuuuUUk....',
    '.kUUuuuuuuuuuuuUUUUk...',
    '.kkkkUUUUUUUUUUUkkkk...',
    '.....kkkkkkkkkkk.......',
    '.......kaaabk..........',
    '.......kaaabk...kkkk...',
    '.......kaaabk.kkuwuuk..',
    '.......kaaabk.kuuuuUUk.',
    '.......kaaabkkkkUUUkkk.',
    '......kaaaabk...kabk...',
    '......kaaabbk...kabk...',
    '...kkkkbbbbbkkkkkbbkk..',
    '..keeeeEeeeeEEeeeeeEEk.',
    '...kkkkkkkkkkkkkkkkkk..'],
  // a garden snail, shell spiralled
  snail: [
    '........kkkkkk........',
    '......kkoooooOkk......',
    '.....koookkkkooOk.....',
    '....kookOOOOkkoOk.....',
    '....kokOkkkkOkkoOk....',
    '...kookOkook.kkoOk....',
    '...kokOkOkOk.kkoOk.k.k',
    '...kokOkkOk.kkooOk.k.k',
    '...kookOOkkkoooOOk.k.k',
    '....kookkkkoooOOk.kaak',
    '.....kooooooOOkk.kaaak',
    '.kkkkkkOOOOOkkkkkaabk.',
    'kaaaaaaaaaaaaaaaaabk..',
    '.kbbbbbbbbbbbbbbbbk...',
    '..kkkkkkkkkkkkkkkk....'],
  // the scribe's pointing hand (a manicule), a vermilion cuff
  hand: [
    '..kkkk..................',
    '.kRrrk.kkkkkkkkkkkkkkk..',
    '.kRrrkkaaaaaaaaaaaaaaaak',
    '.kRrrkaaaaaaaaaaaaaaaabk',
    '.kRrrkaaaakkkkkkkkkkkkk.',
    '.kRrrkaaaaaaakb.........',
    '.kRrrkaaaakkkkb.........',
    '.kRrrkaaaaaaakb.........',
    '.kRrrkbaaaaakk..........',
    '..kkkkkkkkkk............'],
  // a glow beetle, from above
  beetle: [
    '...k.......k...',
    '....k.....k....',
    '.....kkkkk.....',
    '....kkuwukk....',
    '.k.kkuUkUukk.k.',
    '..kUuwukuwuUk..',
    'k.kUuuukuuuUk.k',
    '.kkUUuukuuUUkk.',
    '..kUUuukuuUUk..',
    'k.kkUUUkUUUkk.k',
    '...kkUUkUUkk...',
    '.....kkkkk.....'],
  // a pick, hand-sketched
  pick: [
    '....kkkkkkk.........',
    '..kkssssssskk.......',
    '.kssSkkkkkSSsk......',
    'ksSkk..knk..kSsk....',
    'kSk....kNnk...kSk...',
    'kk.....kNnk....kk...',
    '........kNnk........',
    '.........kNnk.......',
    '..........kNnk......',
    '...........kNnk.....',
    '............kNnk....',
    '.............kNnk...',
    '..............kNnk..',
    '...............kkk..'],
};
export const DOODLE_KINDS = Object.keys(DOODLES);
function doodle(kind) {
  const rows = DOODLES[kind] || DOODLES.mole;
  const W = Math.max(...rows.map((r) => r.length)), H = rows.length, p = new Px(W + 2, H + 2), r = p.r;
  p.tpl(rows, DOODLE_PAL, 1, 1);
  if (r > 1) {
    // pen hatching on the darker wash (fine diagonal strokes), a lighter ink edge where the pen lifted
    p.fine((X, Y, fx, fy) => {
      const c = p.fget(fx, fy), a = p.fa(fx, fy);
      if (!a) return undefined;
      if (c === DOODLE_PAL.c && wrap(fx - fy, 3) === 0) return mix(c, INK, 0.45);
      if (c === DOODLE_PAL.b && wrap(fx - fy, 5) === 0) return mix(c, INK, 0.25);
      if (c === DOODLE_PAL.k && hash(fx, fy, kind.length) < 0.12) return INK2;
      return undefined;
    });
  }
  return p;
}

// ---------------------------------------------------------------- silk ribbon bookmark (9-slice)
// horizontal: slices top 3, right 8 (the swallowtail), bottom 3, left 2; the middle repeats (period 12)
function ribbon(hex, vertical = false) {
  const R = rampOf(hex), L = 2, T = 8, Wm = 24, W = L + Wm + T, H = 16, p = new Px(vertical ? H : W, vertical ? W : H), r = p.r;
  const put = (a, b, c, al) => (vertical ? p.set(b, W - 1 - a, c, al) : p.set(a, b, c, al));
  const dot = (a, b, c, al) => (vertical ? p.dot(b, W - 1 - a, c, al) : p.dot(a, b, c, al));
  for (let a = 0; a < W; a++)
    for (let b = 0; b < H; b++) {
      // the swallowtail: a V notch cut into the free end
      const tail = a - (L + Wm);
      if (tail >= 0) { const notch = Math.abs(b - (H - 1) / 2); if (tail > 1 && notch < (tail - 1) * 0.95) continue; }
      let k;
      if (b === 0 || b === H - 1) k = 0; // selvedge
      else if (b === 1) k = 4; else if (b === H - 2) k = 1;
      else if (b === 3 || b === 4) k = 5; // the satin sheen
      else if (b >= H - 5) k = 2;
      else k = 3;
      // twill diagonal (period 4 → tiles in 12)
      if (b > 1 && b < H - 2 && wrap(a + b, 4) === 0) k = Math.max(1, k - 1);
      // an embroidered gold stitch line down the middle of the tail half
      put(a, b, R[Math.max(0, Math.min(6, k))]);
      if (b === H - 4 && wrap(a, 3) !== 0 && a > 1 && tail < 1) put(a, b, G[6]);
    }
  // the cut ends: a darker fray along the V
  for (let a = L + Wm; a < W; a++)
    for (let b = 0; b < H; b++) {
      const nb = (vertical ? p.a(b, W - 1 - (a + 1)) : p.a(a + 1, b));
      const me = vertical ? p.a(b, W - 1 - a) : p.a(a, b);
      if (me && !nb) put(a, b, R[1]);
    }
  if (r > 1)
    for (let a = 0; a < L + Wm; a++) { if (wrap(a, 4) === 1) dot(a + 0.5, 3, R[6], 200); if (wrap(a, 6) === 2) dot(a, 6.5, R[5], 140); }
  // the tucked end is in the cover's shadow
  for (let b = 0; b < H; b++) for (let a = 0; a < L; a++) put(a, b, mix(R[Math.min(6, 2 + (b > 2 && b < H - 3 ? 1 : 0))], 0x000000, 0.35 - a * 0.1));
  return p;
}

// ---------------------------------------------------------------- wax seal (rolled rim, pressed sigil)
const SIGILS = {
  star: ['..k..', '..k..', 'kkkkk', '.kkk.', 'k...k'],
  mole: ['.k.k.', 'kkkkk', 'k.k.k', '.kkk.', '..k..'],
  pick: ['kkkk.', 'k..kk', '..k.k', '.k...', 'k....'],
  check: ['....k', '...kk', 'k.kk.', 'kkk..', '.k...'],
  crown: ['k.k.k', 'kkkkk', 'k.k.k', 'kkkkk', '.....'],
};
function seal(hex = 0xb8402c, size = 14, sigil = 'star', seed = 7) {
  const R = rampOf(hex), S = size, p = new Px(S, S), r = p.r, c0 = (S - 1) / 2;
  const rad = S / 2 - 1.1;
  p.fine((X, Y, fx, fy) => {
    const dx = X - c0 - 0.25, dy = Y - c0 - 0.25, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    // the blob's edge wobbles where the wax ran (organic: low-frequency noise round the rim + a drip)
    let R0 = rad * (0.88 + pnoise((a / (Math.PI * 2)) * 7 + 7, 0.3, 7, 2, seed) * 0.2);
    if (a > 0.5 && a < 1.2) R0 += Math.max(0, 1.4 - Math.abs(a - 0.85) * 5) * (S / 14);
    if (d > R0) return undefined;
    const lit = -(dx + dy) / Math.max(0.01, d);
    const rimW = Math.max(1, S / 9);
    let k;
    if (d > R0 - 0.6) k = 0.12 + lit * 0.08;
    else if (d > R0 - rimW) k = 0.6 + lit * 0.22; // the rolled rim
    else if (d > R0 - rimW - 0.6) k = 0.28 - lit * 0.1; // the die's edge, sunk
    else k = 0.46 + (hash(fx, fy, seed + 2) - 0.5) * 0.06;
    return quant(R, k, fx, fy, 0.3);
  });
  // the sigil, raised and lit from the top-left
  const sg = SIGILS[sigil] || SIGILS.star, sc = S >= 20 ? 2 : 1, sw = 5 * sc, ox = Math.round(c0 - sw / 2 + 0.5), oy = Math.round(c0 - sw / 2 + 0.5);
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 5; i++) {
      if (sg[j][i] !== 'k') continue;
      for (let v = 0; v < sc; v++) for (let u = 0; u < sc; u++) {
        const x = ox + i * sc + u, y = oy + j * sc + v;
        const up = j === 0 || sg[j - 1][i] !== 'k', lf = i === 0 || sg[j][i - 1] !== 'k';
        p.set(x, y, (up && v === 0) || (lf && u === 0) ? R[6] : R[4]);
        if (!(j < 4 && sg[j + 1][i] === 'k') && v === sc - 1) p.set(x, y + 1, R[1]);
      }
    }
  if (r > 1) { p.dot(c0 - rad * 0.55, c0 - rad * 0.5, 0xffffff, 170); p.dot(c0 - rad * 0.45, c0 - rad * 0.62, R[6]); }
  p.outline(mix(R[0], 0x000000, 0.4));
  return p;
}

// ---------------------------------------------------------------- iron corner piece (covers)
function corner() {
  const S = 22, p = new Px(S, S), r = p.r;
  const IR = [0x141216, 0x221e24, 0x302a32, 0x403a44, 0x524a56, 0x665e6a, 0x7e7682, 0x9a92a0, 0xbab2c0];
  // an L of iron strap, 6 wide, with a lobed (trefoil) end on each arm and a pierced quatrefoil
  const inL = (x, y) => (x < 7 && y < S - 3) || (y < 7 && x < S - 3);
  const lobe = (x, y, cx, cy) => Math.abs(x - cx) + Math.abs(y - cy) * 1.2 < 3.4;
  p.fine((X, Y, fx, fy) => {
    const x = Math.floor(X), y = Math.floor(Y);
    const ok = inL(x, y) || lobe(X, Y, 3.5, S - 3.5) || lobe(Y, X, 3.5, S - 3.5) || (x + y < 13 && x < 12 && y < 12);
    if (!ok) return undefined;
    // pierced quatrefoil in the corner plate
    const qx = X - 6.5, qy = Y - 6.5;
    if ((Math.abs(qx) < 0.9 && Math.abs(qy) < 2.6) || (Math.abs(qy) < 0.9 && Math.abs(qx) < 2.6)) return undefined;
    let k = 0.55 + (fbm(X, Y, 32, 32, 5, 2, 401) - 0.5) * 0.3 - (X + Y) * 0.008;
    if (hash(fx, fy, 402) < 0.05) k -= 0.3; // pitting
    return quant(IR, k, fx, fy, 0.5);
  });
  // lit edges / shade: top-left catch the light
  const D = p.dist(2);
  p.each((x, y, c) => {
    if (D(x, y) !== 1) return undefined;
    const lit = !p.a(x - 1, y) || !p.a(x, y - 1);
    return lit ? IR[8] : IR[1];
  });
  // the quatrefoil's inner edge (shade top-left, light bottom-right: it's a hole)
  for (const [x, y] of [[6, 4], [5, 6], [6, 5]]) p.set(x, y, IR[1]);
  for (const [x, y] of [[7, 8], [8, 7], [7, 9]]) p.set(x, y, IR[7]);
  // brass bosses (hand-placed domes)
  const boss = (x, y) => {
    const t = ['.dd.', 'dyGd', 'dGgd', '.dd.'], pal = { d: G[2], y: G[9], G: G[7], g: G[4] };
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (t[j][i] !== '.') p.set(x + i, y + j, pal[t[j][i]]);
    if (r > 1) p.dot(x + 1, y + 1, 0xffffff, 200);
  };
  boss(2, S - 6); boss(S - 6, 2); boss(9, 2); boss(2, 9);
  p.outline(0x0a080a);
  return p;
}

// ---------------------------------------------------------------- leather strap with a brass clasp
function clasp() {
  const W = 14, H = 26, p = new Px(W, H), r = p.r, L = CA.TONES.oxblood;
  // the strap (vertical band of leather crossing the edge), stitched
  p.fine((X, Y, fx, fy) => {
    const x = Math.floor(X);
    if (x < 3 || x > 10 || Y > H - 1) return undefined;
    let k = 0.55 + (fbm(X, Y, 16, 32, 3, 2, 411) - 0.5) * 0.3;
    if (x === 3) k = 0.75; else if (x === 10) k = 0.15; else if (x === 4) k = 0.62;
    if ((x === 4 || x === 9) && wrap(Math.floor(Y), 3) === 1) return 0xe6c690; // saddle stitch
    return quant(L, k, fx, fy, 0.4);
  });
  // the brass hook plate: a shield shape with a pin and a lip
  const plate = [
    '..dddddddd..',
    '.dyyyyyyyGd.',
    'dyGGGGGGGGgd',
    'dyGgggggggGd',
    'dyGgkkkkgGgd',
    'dyGgkddkgGgd',
    'dyGgkkkkgGgd',
    'dyGgggggggGd',
    '.dGGGGGGGGd.',
    '..dGGGGGGd..',
    '...dGggGd...',
    '....dGGd....',
    '.....dd.....'];
  const pal = { d: G[1], y: G[8], G: G[6], g: G[4], k: 0x1a0c06 };
  for (let j = 0; j < plate.length; j++) for (let i = 0; i < 12; i++) { const ch = plate[j][i]; if (ch !== '.') p.set(1 + i, 8 + j, pal[ch]); }
  if (r > 1) { p.dot(3, 10, 0xffffff, 200); p.dot(3.5, 10, G[9]); p.dot(6.5, 13.5, G[7]); }
  p.outline(0x1a0c06);
  return p;
}

// ---------------------------------------------------------------- page fore-edge (browned, nicked)
function edge(right = true) {
  const W = 8, H = 64, p = new Px(W, H), r = p.r;
  p.fine((X, Y, fx, fy) => {
    const d = right ? W - X : X; // distance from the page edge
    const n = fbm(0, Y, 4, H, 10, 2, 421);
    const reach = 2 + n * 5;
    if (d > reach) return undefined;
    const t = 1 - d / reach;
    return mix(0xc4955a, 0x7a4a22, t * 0.6);
  });
  // alpha the browning (it's a wash over the vellum)
  for (let fy = 0; fy < p.fh; fy++)
    for (let fx = 0; fx < p.fw; fx++) {
      const i = (fy * p.fw + fx) * 4;
      if (!p.d[i + 3]) continue;
      const d = right ? (p.fw - fx) / r : fx / r;
      p.d[i + 3] = Math.max(0, Math.min(255, Math.round(150 - d * 22)));
    }
  // nicks: little tears at the very edge, dark with a pale torn fibre
  for (let i = 0; i < 4; i++) {
    const y = Math.floor(hash(i, 1, 423) * (H - 6)) + 2, len = 1 + Math.floor(hash(i, 2, 423) * 3);
    for (let k = 0; k < len; k++) { const x = right ? W - 1 - k : k; p.set(x, y + (k > 1 ? 1 : 0), 0x3a2010, 230); }
    if (r > 1) p.dot(right ? W - len - 0.5 : len, y + 0.5, 0xf6e6c4, 220);
  }
  return p;
}

// ---------------------------------------------------------------- a stain (tide-lined, organic)
function stain(seed = 431) {
  const S = 40, p = new Px(S, S), c = S / 2;
  p.fine((X, Y) => {
    const dx = X - c, dy = Y - c, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy * 1.1);
    const R = S * 0.36 * (0.78 + pnoise((a / (Math.PI * 2)) * 6 + 6, 0.2, 6, 2, seed) * 0.42);
    if (d > R + 0.5) return undefined;
    if (d > R - 0.7) return 0x7a4a1e;
    return 0xa0703a;
  });
  for (let i = 0; i < p.d.length; i += 4) if (p.d[i + 3]) p.d[i + 3] = p.d[i] < 0x90 ? 70 : 26;
  return p;
}

// ---------------------------------------------------------------- a goose quill (writes the ink in)
function quill() {
  const W = 20, H = 22, p = new Px(W, H);
  // the vane: a curved goose feather from the top-right down toward the nib, one side narrower,
  // barbs combed at a slant, a split or two; the bare quill below it
  const ax = 19, ay = 0.6, bx = 4.6, by = 17, L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
  const half = (t, side) => {
    if (t < 0 || t > 0.8) return 0;
    const w = Math.pow(Math.sin(Math.min(1, t / 0.8) * Math.PI), 0.7) * 3.9 * (t < 0.12 ? t / 0.12 : 1);
    return side < 0 ? w * 0.62 : w;
  };
  p.fine((X, Y) => {
    const dx = X - ax, dy = Y - ay, t = (dx * ux + dy * uy) / L;
    // the feather bows a little (its axis is a curve)
    const k = -dx * uy + dy * ux - Math.sin(t * Math.PI) * 0.9;
    const w = half(t, Math.sign(k) || 1);
    if (Math.abs(k) > w) return undefined;
    const e = w - Math.abs(k);
    if (e < 0.45) return k < 0 ? 0x8a7c6a : 0x6a5c4c; // its edge
    const barb = Math.floor((t * L - Math.abs(k) * 0.9) * 2.2);
    if ((barb === 9 || barb === 17) && k > 0) return undefined; // a split in the vane
    const shade = k < 0 ? 0xf8f2e4 : Math.abs(k) < 1.4 ? 0xece2d0 : 0xd2c6b2;
    return barb % 2 ? shade : mix(shade, 0x8a7c6a, 0.18);
  });
  // the rachis (the shaft through the vane) and the bare quill
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const X = ax + ux * L * t, Y = ay + uy * L * t, b = Math.sin(t * Math.PI) * 0.9;
    p.dot(X - uy * b, Y + ux * b, t < 0.8 ? 0xb4a68e : 0xd8ccb4);
    if (t > 0.78) p.dot(X - uy * b + 0.5, Y + ux * b, 0x8a7c6a);
  }
  // the cut nib, dipped in ink
  p.fline(bx, by, 2.2, 20.4, 0x5a4430);
  p.fline(bx + 0.5, by, 2.7, 20.4, 0x3a2414);
  for (const [x, y] of [[1.5, 21], [2, 21], [1.5, 20.5], [2, 20.5], [2.5, 21]]) p.dot(x, y, INK);
  p.dot(2.5, 20, 0x8aa0c8); // a wet glint on the ink
  return p;
}

// ---------------------------------------------------------------- small inked pieces
function pilcrow(hex = RUB[3]) {
  const t = ['.kkkk', 'kkk.k', 'kkk.k', '.kk.k', '..k.k', '..k.k', '..k.k', '..k.k'];
  const p = new Px(5, 8);
  p.tpl(t, { k: hex });
  return p;
}
function manicule() { return doodle('hand'); }
/** A compass rose (32): eight points in gold and ink, a fleur-de-lis north, a vermilion ring of ticks. */
function compass() {
  const S = 34, c = 17, p = new Px(S, S), r = p.r;
  // the ring of ticks (hand-ruled: a wobbly circle of dashes, not a stamp)
  for (let k = 0; k < 64; k++) {
    const a = (k / 64) * Math.PI * 2, rr = 13.2 + (hash(k, 1, 441) - 0.5) * 0.4;
    p.dot(c + Math.cos(a) * rr, c + Math.sin(a) * rr, k % 4 === 0 ? RUB[2] : INK2, k % 2 ? 140 : 230);
    if (k % 8 === 0) p.dot(c + Math.cos(a) * (rr - 0.6), c + Math.sin(a) * (rr - 0.6), RUB[3]);
  }
  // eight points: long ones gold, short ones ink-washed; each point split light/dark down its spine
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2, long = k % 2 === 0, L = long ? 12 : 7.5, w = long ? 2.6 : 2;
    const tip = [c + Math.cos(a) * L, c + Math.sin(a) * L];
    const l = [c + Math.cos(a - Math.PI / 2) * w, c + Math.sin(a - Math.PI / 2) * w];
    const rr = [c + Math.cos(a + Math.PI / 2) * w, c + Math.sin(a + Math.PI / 2) * w];
    pts.push({ k, long, tip, l, rr });
  }
  for (const q of pts.filter((x) => !x.long)) { p.poly([[c, c], q.l, q.tip], 0xc8a878); p.poly([[c, c], q.tip, q.rr], 0x8a6a48); }
  for (const q of pts.filter((x) => x.long)) { p.poly([[c, c], q.l, q.tip], G[7]); p.poly([[c, c], q.tip, q.rr], G[4]); }
  p.outline(INK);
  // the hub
  for (const [x, y, col] of [[16, 16, G[8]], [17, 16, G[6]], [16, 17, G[5]], [17, 17, G[3]]]) p.set(x, y, col);
  // north: a little vermilion fleur over the top point
  for (const [x, y] of [[16, 1], [17, 1], [16, 0], [15, 2], [18, 2], [14, 3], [19, 3]]) p.set(x, y, RUB[3]);
  if (r > 1) { p.dot(16, 0, RUB[6]); p.dot(16.5, 4, G[9]); }
  return p;
}
/** A scale bar: alternating ink and vellum blocks between ticks. */
function scaleBar() {
  const W = 40, H = 6, p = new Px(W, H);
  for (let x = 0; x < W; x++) { p.set(x, 2, INK2); p.set(x, 4, INK2); if (Math.floor(x / 8) % 2 === 0) p.set(x, 3, INK2); else p.set(x, 3, 0xf0dcb4); }
  for (let x = 0; x <= W; x += 8) { p.set(Math.min(W - 1, x), 0, INK); p.set(Math.min(W - 1, x), 1, INK); p.set(Math.min(W - 1, x), 5, INK); }
  return p;
}
/** A knotwork band (interlace), for headers: tiles horizontally (period 12). */
function knot(hex = RUB[3]) {
  // a guilloche: two strands (gold and the accent) weaving over and under, period 12
  const W = 12, H = 9, p = new Px(W, H), r = p.r, R = rampOf(hex);
  const yA = (X) => 4.5 + 2.6 * Math.sin((X / W) * Math.PI * 2), yB = (X) => 4.5 - 2.6 * Math.sin((X / W) * Math.PI * 2);
  const strand = (fy, X, f, cols) => {
    const d = fy / r + 0.5 / r - f(X);
    if (Math.abs(d) > 1.35) return undefined;
    if (Math.abs(d) > 0.9) return INK;
    return d < -0.2 ? cols[5] : d > 0.4 ? cols[2] : cols[4];
  };
  const GA = [G[1], G[2], G[4], G[5], G[6], G[8]], RB = [R[0], R[1], R[2], R[3], R[4], R[5]];
  p.fine((X, Y, fx, fy) => {
    // which strand is over: A over B on the first crossing of the repeat, B over A on the second
    const aOver = wrap(X, W) < W / 2;
    const a = strand(fy, X, yA, GA), b = strand(fy, X, yB, RB);
    if (a !== undefined && b !== undefined) return aOver ? a : b;
    return a ?? b;
  });
  return p;
}

// ---------------------------------------------------------------- registry
const ART = {
  vellum: () => vellum(),
  vellumDk: () => { const p = vellum(96, 96, 233); p.each((x, y, c) => mix(c, 0x8a6a48, 0.14)); return p; },
  'border-red': () => border('red'),
  'border-blue': () => border('blue'),
  'border-green': () => border('green'),
  'border-gold': () => border('gold'),
  'border-purple': () => border('purple'),
  corner: () => corner(),
  clasp: () => clasp(),
  edgeL: () => edge(false),
  edgeR: () => edge(true),
  stain: () => stain(),
  stainB: () => stain(437),
  quill: () => quill(),
  pilcrow: () => pilcrow(),
  pilcrowB: () => pilcrow(FIELDS.blue[3]),
  manicule: () => manicule(),
  compass: () => compass(),
  scale: () => scaleBar(),
  knot: () => knot(),
  knotB: () => knot(FIELDS.blue[3]),
  sealR: () => seal(0xb8402c, 14),
  sealBig: () => seal(0xb8402c, 26, 'star', 11),
};
// finishing pass options: inked frames and the vellum keep their own fine work (no material texture)
const OPT = { detail: false };
/** One of the kit's pieces as a data URL (cached). */
export function tart(key) { return ART[key] ? art('tome:' + key, ART[key], OPT) : ''; }
/** An illuminated initial's frame for a field colour ('blue' | 'red' | 'green' | 'purple' | 'gold'). */
export const capURL = (field = 'blue') => art('tome:cap:' + field, () => cap(field, field.length * 13), OPT);
/** A marginal doodle ('mole' | 'raptor' | 'ore' | 'mushroom' | 'snail' | 'hand' | 'beetle' | 'pick'). */
export const doodleURL = (kind) => art('tome:doodle:' + kind, () => doodle(kind), OPT);
/** A silk ribbon bookmark 9-slice in a colour ('#rrggbb'). */
export const ribbonURL = (hex, vertical = false) => art(`tome:rib:${hex}:${vertical ? 'v' : 'h'}`, () => ribbon(hex, vertical), { detail: false, edges: false });
/** A wax seal in a colour. */
export const sealURL = (hex = '#b8402c', size = 14, sigil = 'star') => art(`tome:seal:${hex}:${size}:${sigil}`, () => seal(typeof hex === 'string' ? parseInt(hex.replace('#', ''), 16) : hex, size, sigil, size + sigil.length), OPT);
export { cssUrl };

let installed = false;
/** Publish the kit as --t-<key> custom properties on :root (once; drawn while the game idles). */
export function installTomeArt(root = document.documentElement) {
  if (installed) return;
  installed = true;
  const keys = Object.keys(ART);
  const put = (k) => { const u = tart(k); if (u) root.style.setProperty('--t-' + k, cssUrl(u)); };
  const caps = ['blue', 'red', 'green', 'purple', 'gold'];
  const work = [...keys.map((k) => () => put(k)), ...caps.map((c) => () => { const u = capURL(c); if (u) root.style.setProperty('--t-cap-' + c, cssUrl(u)); })];
  const idle = (f) => (window.requestIdleCallback ? window.requestIdleCallback(f, { timeout: 500 }) : setTimeout(f, 40));
  const step = () => { const t0 = performance.now(); while (work.length && performance.now() - t0 < 8) work.shift()(); if (work.length) idle(step); };
  idle(step);
}
/** Draw everything now (a panel that opens before the idle pass got there). */
export function ensureTomeArt(root = document.documentElement) {
  installTomeArt(root);
  for (const k of Object.keys(ART)) if (!root.style.getPropertyValue('--t-' + k)) { const u = tart(k); if (u) root.style.setProperty('--t-' + k, cssUrl(u)); }
  for (const c of ['blue', 'red', 'green', 'purple', 'gold']) if (!root.style.getPropertyValue('--t-cap-' + c)) root.style.setProperty('--t-cap-' + c, cssUrl(capURL(c)));
}
