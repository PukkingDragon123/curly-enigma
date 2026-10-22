// A hand-painted 3×5 pixel alphabet for the old trail signs (capitals, digits, a little
// punctuation). Pure data.
const F = {
  A: ['.o.', 'o.o', 'ooo', 'o.o', 'o.o'], B: ['oo.', 'o.o', 'oo.', 'o.o', 'oo.'], C: ['.oo', 'o..', 'o..', 'o..', '.oo'],
  D: ['oo.', 'o.o', 'o.o', 'o.o', 'oo.'], E: ['ooo', 'o..', 'oo.', 'o..', 'ooo'], F: ['ooo', 'o..', 'oo.', 'o..', 'o..'],
  G: ['.oo', 'o..', 'o.o', 'o.o', '.oo'], H: ['o.o', 'o.o', 'ooo', 'o.o', 'o.o'], I: ['ooo', '.o.', '.o.', '.o.', 'ooo'],
  J: ['..o', '..o', '..o', 'o.o', '.o.'], K: ['o.o', 'o.o', 'oo.', 'o.o', 'o.o'], L: ['o..', 'o..', 'o..', 'o..', 'ooo'],
  M: ['o.o', 'ooo', 'ooo', 'o.o', 'o.o'], N: ['oo.', 'o.o', 'o.o', 'o.o', 'o.o'], O: ['.o.', 'o.o', 'o.o', 'o.o', '.o.'],
  P: ['oo.', 'o.o', 'oo.', 'o..', 'o..'], Q: ['.o.', 'o.o', 'o.o', 'oo.', '.oo'], R: ['oo.', 'o.o', 'oo.', 'o.o', 'o.o'],
  S: ['.oo', 'o..', '.o.', '..o', 'oo.'], T: ['ooo', '.o.', '.o.', '.o.', '.o.'], U: ['o.o', 'o.o', 'o.o', 'o.o', 'ooo'],
  V: ['o.o', 'o.o', 'o.o', 'o.o', '.o.'], W: ['o.o', 'o.o', 'ooo', 'ooo', 'o.o'], X: ['o.o', 'o.o', '.o.', 'o.o', 'o.o'],
  Y: ['o.o', 'o.o', '.o.', '.o.', '.o.'], Z: ['ooo', '..o', '.o.', 'o..', 'ooo'],
  0: ['ooo', 'o.o', 'o.o', 'o.o', 'ooo'], 1: ['.o.', 'oo.', '.o.', '.o.', 'ooo'], 2: ['oo.', '..o', '.o.', 'o..', 'ooo'],
  3: ['oo.', '..o', '.o.', '..o', 'oo.'], 4: ['o.o', 'o.o', 'ooo', '..o', '..o'], 5: ['ooo', 'o..', 'oo.', '..o', 'oo.'],
  6: ['.oo', 'o..', 'ooo', 'o.o', 'ooo'], 7: ['ooo', '..o', '.o.', '.o.', '.o.'], 8: ['ooo', 'o.o', 'ooo', 'o.o', 'ooo'],
  9: ['ooo', 'o.o', 'ooo', '..o', 'oo.'], "'": ['.o.', '.o.', '...', '...', '...'], '.': ['...', '...', '...', '...', '.o.'],
  '-': ['...', '...', 'ooo', '...', '...'], ' ': ['...', '...', '...', '...', '...'], '?': ['oo.', '..o', '.o.', '...', '.o.'],
  '<': ['..o', '.o.', 'o..', '.o.', '..o'], '>': ['o..', '.o.', '..o', '.o.', 'o..'], M2: [],
};

/** Width in pixels of a line (3 per letter, 1 between; a space is 2). */
export function textWidth(s) {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += (s[i] === ' ' ? 2 : 3) + (i ? 1 : 0);
  return w;
}

/** Is pixel (px, row) of the line painted? row 0 = top. */
export function textPixel(s, px, row) {
  let x = 0;
  for (let i = 0; i < s.length; i++) {
    if (i) x += 1;
    const cw = s[i] === ' ' ? 2 : 3;
    if (px < x + cw) {
      const g = F[s[i]] || F['?'];
      return px >= x && cw === 3 && g[row] && g[row][px - x] === 'o';
    }
    x += cw;
  }
  return false;
}
