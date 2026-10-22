// The old ones' symbols: 7×7 pixel glyphs carved in friezes, laid in mosaics, lit as runes,
// painted on the puzzle dials and levers. One table for the stamps (voxels) and the models.
// Pure data + lookups (it runs in the chunk workers too).

const ROWS = {
  sun: ['o..o..o', '..ooo..', '.ooooo.', 'ooooooo', '.ooooo.', '..ooo..', 'o..o..o'],
  moon: ['..oooo.', '.oo....', 'oo.....', 'oo.....', 'oo.....', '.oo....', '..oooo.'],
  star: ['...o...', '...o...', '..ooo..', 'ooooooo', '..ooo..', '...o...', '...o...'],
  eye: ['.......', '..ooo..', '.o...o.', 'o..o..o', '.o...o.', '..ooo..', '.......'],
  paw: ['o.o.o.o', 'o.o.o.o', '.ooooo.', '.ooooo.', '.ooooo.', '..ooo..', '.......'],
  wave: ['.......', '.oo..oo', 'o..oo..', '.......', '.oo..oo', 'o..oo..', '.......'],
  flame: ['...o...', '..oo...', '..ooo..', '.oo.oo.', '.o...o.', '.oo.oo.', '..ooo..'],
  peak: ['.......', '...o...', '..ooo..', '..o.oo.', '.o...oo', 'oo....o', 'ooooooo'],
  hammer: ['.ooooo.', '.ooooo.', '...o...', '...o...', '...o...', '...o...', '...o...'],
  arrow: ['...o...', '....o..', '.....o.', 'ooooooo', '.....o.', '....o..', '...o...'],
  weight: ['..ooo..', '..o.o..', 'ooooooo', 'ooooooo', 'ooooooo', 'ooooooo', '.......'],
  drop: ['...o...', '..ooo..', '..ooo..', '.ooooo.', '.ooooo.', '.ooooo.', '..ooo..'],
  mole: ['.o...o.', 'ooooooo', 'o.ooo.o', 'ooooooo', '.ooooo.', 'o.o.o.o', '.o...o.'],
};

/** Glyph names in a fixed order (index = id). */
export const GLYPHS = Object.keys(ROWS);
export const G = Object.fromEntries(GLYPHS.map((n, i) => [n, i]));
/** The symbols the dials and levers use. */
export const SYMBOLS = [G.sun, G.moon, G.star, G.eye, G.wave, G.flame];

const BITS = GLYPHS.map((n) => {
  const rows = ROWS[n], b = new Uint8Array(49);
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) b[x + (6 - y) * 7] = rows[y][x] === 'o' ? 1 : 0; // y up
  return b;
});

/** Is pixel (x, y) of glyph g set? x right, y up, 0..6 (outside → false). */
export function glyphAt(g, x, y) {
  if (x < 0 || y < 0 || x > 6 || y > 6) return false;
  return BITS[g][x + y * 7] === 1;
}

/** Is (x, y) on the 1-pixel outline just outside the glyph (8-neighbours)? */
export function glyphEdge(g, x, y) {
  if (glyphAt(g, x, y)) return false;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && glyphAt(g, x + dx, y + dy)) return true;
  return false;
}
