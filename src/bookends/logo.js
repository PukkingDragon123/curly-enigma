// The MOLEFORGE logo as real pixel art: chunky 10px-tall bitmap letters with a bevelled ramp,
// a 3px extrusion and a dark outline. "MOLE" is dug-up gold, "FORGE" is hot metal, and the
// first O holds a little gem. Each letter is its own image so the title can animate them.
import { PixelCanvas } from '../gfx/PixelArt.js';

const GLYPHS = {
  M: ['##......##', '###....###', '####..####', '##.####.##', '##..##..##', '##......##', '##......##', '##......##', '##......##', '##......##'],
  O: ['..####..', '.######.', '###..###', '##....##', '##....##', '##....##', '##....##', '###..###', '.######.', '..####..'],
  L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######', '#######'],
  E: ['#######', '#######', '##.....', '##.....', '######.', '######.', '##.....', '##.....', '#######', '#######'],
  F: ['#######', '#######', '##.....', '##.....', '######.', '######.', '##.....', '##.....', '##.....', '##.....'],
  R: ['######..', '#######.', '##...###', '##....##', '##...###', '#######.', '######..', '##..###.', '##...###', '##....##'],
  G: ['..#####.', '.#######', '###.....', '##......', '##..####', '##..####', '##....##', '###...##', '.#######', '..#####.'],
};

// face ramps, top row to bottom row (10 rows), then the extrusion (3 rows) and the outline
const GOLD = { face: [0xfff6c8, 0xffe48a, 0xffd65a, 0xffd24a, 0xf2c23a, 0xf2c23a, 0xe6ae32, 0xe0a42e, 0xc88a22, 0xb07018], hi: 0xfffbe8, ext: [0x9a5a1c, 0x7a4216, 0x5a2e12], line: 0x2a1430 };
const HOT = { face: [0xfffbe8, 0xfff2b0, 0xffe07a, 0xffcc58, 0xffb03c, 0xffa034, 0xff862a, 0xff7424, 0xe8541a, 0xc83c16], hi: 0xffffff, ext: [0xa8341a, 0x822414, 0x5a1810], line: 0x2a1018 };

const EXT = 3;

function letterCanvas(ch, pal, gem) {
  const rows = GLYPHS[ch];
  const gw = rows[0].length, gh = rows.length;
  const W = gw + 2, H = gh + EXT + 2;
  const pc = new PixelCanvas(W, H);
  const on = (x, y) => y >= 0 && y < gh && x >= 0 && x < gw && rows[y][x] === '#';
  // extrusion (drawn first so the face sits on top)
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (!on(x, y)) continue;
    for (let e = 1; e <= EXT; e++) if (!on(x, y + e)) pc.set(x + 1, y + 1 + e, pal.ext[Math.min(EXT - 1, e - 1)]);
  }
  // face with a bevel: lit top-left edges, shaded bottom-right edges
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (!on(x, y)) continue;
    let c = pal.face[y];
    if (!on(x, y - 1) || !on(x - 1, y)) c = y < 5 ? pal.hi : pal.face[Math.max(0, y - 3)];
    else if (!on(x + 1, y) && y > 1) c = pal.face[Math.min(gh - 1, y + 1)];
    pc.set(x + 1, y + 1, c);
  }
  // a tiny gem set into the O
  if (gem) {
    const cx = 1 + gw / 2, cy = 1 + gh / 2;
    pc.set(cx - 1, cy - 1, 0xbfeaff); pc.set(cx, cy - 1, 0x7fd0ff);
    pc.set(cx - 1, cy, 0x4a9ae0); pc.set(cx, cy, 0x2a6ab8);
    pc.set(cx - 1, cy - 2, 0xffffff);
  }
  // outline around everything
  pc.outline(pal.line, false);
  return { canvas: pc.commit(), w: W, h: H };
}

let cache = null;
/** [{ch, url, w, h, hot}] for M-O-L-E-F-O-R-G-E. */
export function logoLetters() {
  if (cache) return cache;
  const word = 'MOLEFORGE';
  cache = [...word].map((ch, i) => {
    const hot = i >= 4;
    const { canvas, w, h } = letterCanvas(ch, hot ? HOT : GOLD, i === 1);
    return { ch, url: canvas.toDataURL(), w, h, hot };
  });
  return cache;
}

/** A 7x7 four-point glint for the logo sparkle. */
export function glintURL() {
  const pc = new PixelCanvas(7, 7);
  for (let i = 0; i < 7; i++) { pc.set(3, i, i === 3 ? 0xffffff : 0xfff2b0); pc.set(i, 3, i === 3 ? 0xffffff : 0xfff2b0); }
  pc.set(2, 2, 0xfff8d8); pc.set(4, 4, 0xfff8d8); pc.set(4, 2, 0xfff8d8); pc.set(2, 4, 0xfff8d8);
  pc.clear(3, 0); pc.clear(3, 6); pc.clear(0, 3); pc.clear(6, 3);
  pc.set(3, 0, 0xffe08a); pc.set(3, 6, 0xffe08a); pc.set(0, 3, 0xffe08a); pc.set(6, 3, 0xffe08a);
  return pc.commit().toDataURL();
}
