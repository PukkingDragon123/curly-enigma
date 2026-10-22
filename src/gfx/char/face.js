// Face parts drawn as tiny pixel templates: glossy eyes with lid variants for blinking and
// expressions, brows, mouths (rest, smile, frown, talk, laugh, grimace) and whiskers.
import { Vox, templateVox, cachedGeo, mix, dk, lt } from './vox.js';

const PUPIL = 0x160e1a;
const HI = 0xffffff;
const HI2 = 0xc8d2f0;
const SCLERA = 0xf6f2ea;
const LASH = 0x140c12;

// Templates are drawn for the eye on the character's +x side (screen right when facing the
// camera). Highlights stay top-left on both eyes; pupils of wide eyes look slightly inward.
// D pupil, W highlight, w soft highlight, I iris tint, S sclera.
const EYES = {
  dot: ['.W.', 'DDD', '.I.'],
  bead: ['.DDD.', 'DWWDD', 'DWDDD', 'DDDwD', '.DII.'],
  tall: ['.D.', 'WDD', 'WDD', 'DDD', 'DwD', '.I.'],
  wide: ['.SSS.', 'SWDDS', 'DDDDS', 'DIDDS', '.SSS.'],
  big: ['.DDD.', 'DWWDD', 'DWWDD', 'DDDDD', 'DDDwD', '.III.'],
};
const HAPPY = ['.DDD.', 'DD.DD', 'D...D'];
const SQUEEZE = ['DD...', '..DDD', 'DD...']; // ">" (for the -x eye; mirrored to "<" on +x)


function mirror(rows) { return rows.map((r) => r.split('').reverse().join('')); }

/** Cover part of an eye with lid (L); the first uncovered pixel under the lid becomes lash (K). */
function lidify(rows, cover) {
  const h = rows.length, w = rows[0].length;
  return rows.map((row, r) => row.split('').map((ch, x) => {
    if (ch === '.') return '.';
    if (cover(x, r, w, h)) return 'L';
    if (r > 0 && cover(x, r - 1, w, h)) return 'K';
    return ch;
  }).join(''));
}

function mirrorPupil(rows) {
  // -x eye: mirror the pupil layout of sclera eyes (looks inward), keep the highlight top-left
  if (!rows.some((r) => r.includes('S'))) return rows;
  return mirror(rows).map((r) => r.replace(/W/g, 'D')).map((r, i) => (i === 1 ? r.replace(/^(\.?S?)D/, '$1W') : r));
}

/** The open eye ringed with white (startled), one pixel bigger all round. */
function widen(rows) {
  const h = rows.length, w = rows[0].length;
  const out = [];
  for (let r = -1; r <= h; r++) {
    let row = '';
    for (let x = -1; x <= w; x++) {
      const ch = r >= 0 && r < h && x >= 0 && x < w ? rows[r][x] : '.';
      if (ch !== '.') { row += ch === 'S' ? 'S' : ch; continue; }
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
        const rr = r + dy, xx = x + dx;
        if (rr >= 0 && rr < h && xx >= 0 && xx < w && rows[rr][xx] !== '.' && (dx === 0 || dy === 0)) { near = true; break; }
      }
      row += near ? 'S' : '.';
    }
    out.push(row);
  }
  return out;
}

/** The eye shifted up a row (glancing up), the bottom row left to the socket. */
function glanceUp(rows) { return rows.slice(1).concat([rows[0].replace(/./g, '.')]); }

/**
 * Eye variants for one side: {w, h, variants: {open, half, sad, angry, shut, happy, squeeze,
 * smile, wide, smug, drowsy, up, squint}}. Each geometry is pivoted at the template center
 * with its back face at z = 0.
 */
export function eyeSet(type, side, lid, iris, bake) {
  const base = EYES[type] || EYES.bead;
  const key = `eye|${type}|${side}|${lid}|${iris}|${bake}`;
  const pal = { D: PUPIL, W: HI, w: HI2, I: mix(PUPIL, iris, 0.75), S: SCLERA, L: lid, K: LASH };
  const open = side < 0 ? mirrorPupil(base) : base;
  const h = base.length;
  const k = Math.max(1, Math.floor(h * 0.3));
  const outer = (x, w) => (side > 0 ? x >= w - 1 - 0 : x <= 0);
  const outer2 = (x, w) => (side > 0 ? x >= w - 2 : x <= 1);
  const defs = {
    open,
    half: lidify(open, (x, r) => r < Math.ceil(h * 0.45)),
    sad: lidify(open, (x, r, w) => r < k || (r === k && outer2(x, w)) || (r === k + 1 && outer(x, w))),
    angry: lidify(open, (x, r, w) => r < k || (r === k && outer2(w - 1 - x, w)) || (r === k + 1 && outer(w - 1 - x, w))),
    shut: (() => {
      const s = lidify(open, (x, r, w, hh) => r < hh - 1);
      if (h >= 3) s[h - 2] = s[h - 2].replace(/^(\.*)L/, '$1K').replace(/L(\.*)$/, 'K$1');
      return s;
    })(),
    happy: HAPPY,
    squeeze: side > 0 ? mirror(SQUEEZE) : SQUEEZE,
    // the expression set: cheeks pushing up, popped wide, half-lidded, heavy, glancing, narrowed
    smile: lidify(open, (x, r, w, hh) => r >= hh - (hh >= 5 ? 2 : 1) && !(r === hh - 2 && (x === 0 || x === w - 1))),
    wide: widen(open),
    smug: lidify(open, (x, r, w, hh) => r < Math.ceil(hh * 0.45) || r === hh - 1),
    drowsy: lidify(open, (x, r, w, hh) => r < Math.ceil(hh * 0.62)),
    up: lidify(glanceUp(open), (x, r, w, hh) => r === hh - 1),
    squint: lidify(open, (x, r, w, hh) => r < Math.max(1, Math.floor(hh * 0.34)) || r >= hh - Math.max(1, Math.floor(hh * 0.3))),
  };
  const variants = {};
  for (const [name, rows] of Object.entries(defs)) {
    variants[name] = cachedGeo(`${key}|${name}`, () => {
      const v = templateVox(rows, pal, 1);
      return v.geometry(bake, [v.w / 2, v.h / 2, 0]);
    });
  }
  return { w: base[0].length, h, variants };
}

/** Footprint (w, h) of the eye socket for a type (big enough for every variant). */
export function eyeFootprint(type) {
  const base = EYES[type] || EYES.bead;
  return { w: Math.max(5, base[0].length), h: Math.max(3, base.length) };
}

// ---------------------------------------------------------------- brows
// drawn for the +x brow (outer end on the right)
const BROWS = {
  soft: ['.BBBB.', 'BBBBBB'], // everyone's brows (tone on tone) so every face can emote
  bushy: ['.BBBBB.', 'BBBBBBB', 'B.B.B.B'],
  angry: ['BB...', '.BBB.', '...BB'], // inner end low
  worried: ['...BB', '.BBB.', 'BB...'], // inner end high
  thin: ['.BBB.', 'B...B'],
};

export function browGeo(type, side, color, bake) {
  const rows = side > 0 ? BROWS[type] || BROWS.thin : mirror(BROWS[type] || BROWS.thin);
  return cachedGeo(`brow|${type}|${side}|${color}|${bake}`, () => {
    const v = templateVox(rows, { B: color }, 1);
    if (type === 'bushy') for (let x = 1; x < v.w - 1; x++) if (v.has(x, v.h - 2, 0)) v.set(x, v.h - 2, 1, lt(color, 0.12));
    return v.geometry(bake, [v.w / 2, v.h / 2, 0]);
  });
}

export function browSize(type) {
  const rows = BROWS[type] || BROWS.thin;
  return { w: rows[0].length, h: rows.length };
}

// ---------------------------------------------------------------- mouths
const MOUTH_IN = 0x5a1424;
const TONGUE = 0xe8707e;
const TOOTH = 0xfff8ec;

// D lip line, M mouth interior, T tongue, W tooth. Even widths center on the head's seam.
const MOUTHS = {
  rest: ['D.DD.D', '.D..D.'],
  restT: ['D.DD.D', '.DWWD.'],
  bunny: ['..DD..', '.D..D.', 'D....D'],
  line: ['.DDDD.'],
  smile: ['D....D', '.DDDD.'],
  frown: ['.DDDD.', 'D....D'],
  talk: ['.MMMM.', 'MMTTMM', '.MTTM.'],
  talkT: ['.MWWM.', 'MMMMMM', 'MMTTMM', '.MTTM.'],
  laugh: ['DMMMMD', 'MMMMMM', 'MMTTMM', '.MTTM.'],
  laughT: ['DMWWMD', 'MMMMMM', 'MMTTMM', '.MTTM.'],
  grimace: ['DDDDDD', 'DWWWWD', 'DDDDDD'],
  oh: ['.MMMM.', 'MMMMMM', 'MMTTMM', '.MMMM.'],
  frogRest: ['D..........D', '.DDDDDDDDDD.'],
  frogSmile: ['D..........D', 'DD........DD', '.DDDDDDDDDD.'],
  frogTalk: ['DMMMMMMMMMMD', '.MMMTTTTMMM.', '..MMTTTTMM..'],
  frogFrown: ['.DDDDDDDDDD.', 'D..........D'],
  // the expression set
  grin: ['D......D', '.DWWWWD.', '..DDDD..'],
  smirk: ['......D', 'DDDDDD.'],
  wobble: ['.D..D.', 'D.DD.D'],
  hmm: ['..DDDD', 'DD....'],
  talkS: ['DMMMMD', '.MTTM.'],
  grinO: ['DWWWWD', 'MMMMMM', '.MTTM.'],
  ohS: ['.MM.', 'MTTM', '.MM.'],
  snarl: ['.MWWM.', 'MMMMMM', 'D....D'],
  wail: ['..MM..', '.MMMM.', 'MMTTMM', 'D....D'],
  yawn: ['.MMMM.', 'MMMMMM', 'MMMMMM', 'MMTTMM', '.MMMM.'],
  // bigger shapes for the grown-up faces (old rigs keep the small ones)
  smileB: ['D......D', '.D....D.', '..DDDD..'],
  frownB: ['..DDDD..', '.D....D.', 'D......D'],
  laughB: ['DMMMMMMD', 'MMMMMMMM', 'MMMTTMMM', '.MMTTMM.', '..MMMM..'],
  laughBT: ['DMWWWWMD', 'MMMMMMMM', 'MMMTTMMM', '.MMTTMM.', '..MMMM..'],
  ohB: ['..MM..', '.MMMM.', 'MMMMMM', 'MMTTMM', '.MMMM.'],
  grinB: ['DWWWWWWD', '.MMMMMM.', '..MTTM..'],
  wailB: ['..MMMM..', '.MMMMMM.', 'MMMTTMMM', 'D......D'],
  frogGrin: ['D..........D', '.DWWWWWWWWD.', '..DDDDDDDD..'],
  frogOh: ['...MMMMMM...', '..MMTTTTMM..', '...MMMMMM...'],
};

export function mouthGeo(name, lip, bake) {
  const rows = MOUTHS[name] || MOUTHS.rest;
  return cachedGeo(`mouth|${name}|${lip}|${bake}`, () => {
    const pal = { D: lip, M: MOUTH_IN, T: TONGUE, W: TOOTH };
    const v = templateVox(rows, pal, 1);
    // deeper shadow at the bottom of open mouths
    for (let x = 0; x < v.w; x++) if (v.get(x, 0, 0) === MOUTH_IN) v.set(x, 0, 0, dk(MOUTH_IN, 0.25));
    return v.geometry(bake, [v.w / 2, v.h / 2, 0]);
  });
}

export function mouthSize(name) {
  const rows = MOUTHS[name] || MOUTHS.rest;
  return { w: rows[0].length, h: rows.length };
}

// ---------------------------------------------------------------- expression extras
// little flat pieces that sit in front of the face: cheek blush, a tear, a sweat drop, an anger mark
const FX = {
  blush: { rows: ['.PPPP', 'PpPP.'], pal: { P: 0xf47a92, p: 0xffb0c0 } },
  tear: { rows: ['W', 'B', 'B', 'b'], pal: { W: 0xf4fcff, B: 0x8ad0f8, b: 0x5aa8e8 } },
  sweat: { rows: ['.B.', 'BWB', 'BBB', '.b.'], pal: { W: 0xf4fcff, B: 0x9ad8f8, b: 0x6ab0e8 } },
  vein: { rows: ['.R.R.', 'RR.RR', '.....', 'RR.RR', '.R.R.'], pal: { R: 0xe8303a } },
};

/** Geometry of an expression extra ('blush' | 'tear' | 'sweat' | 'vein'), pivoted at its center. */
export function fxGeo(kind, bake) {
  const f = FX[kind];
  return cachedGeo(`fx|${kind}|${bake}`, () => {
    const v = templateVox(f.rows, f.pal, 1);
    return v.geometry(bake, [v.w / 2, v.h / 2, 0]);
  });
}

// ---------------------------------------------------------------- whiskers
/** Whiskers fanning out from (0,0,0) toward +x, drawn at double y/z density (the mesh is
 * squashed to half thickness so they read as fine hairlines). */
export function whiskerGeo(color, len, bake) {
  return cachedGeo(`whisk|${color}|${len}|${bake}`, () => {
    const v = new Vox(0, len + 2, -8, 9, -1, 6);
    const tip = lt(color, 0.3);
    const lines = [[1.6, 0.62, 0.34], [-0.4, 0.06, 0.4], [-2.2, -0.5, 0.26]];
    for (const [y0, slope, zs] of lines) {
      const L = len - (y0 < -1 ? 1 : 0);
      for (let i = 0; i < L; i++) {
        const y = Math.round(y0 + i * slope);
        const z = Math.floor(i * zs);
        v.set(i, y, z, i > L - 3 ? tip : color);
      }
    }
    return v.geometry(bake, [0, 0, 0]);
  });
}
