// Pixel art for the skill tree: 13×13 glyphs (one per kind of skill), and the three ways a node is
// drawn on the page: a faint pencil sketch (locked), an inked medallion (on the path, ready to
// stamp) and a pressed wax seal in the line's colour (stamped). Also the small line seals for the
// tabs, the skill-point token and the red-ink "circled" mark for the selected node.
// Everything is cached data URLs (uiArt.art); shown at integer multiples of the art pixel.
import { Px, art, mixHex, PAL } from './uiArt.js';
import { makeRng, hashStr } from '../core/util.js';

const INK = 0x2e1a0e;
const INK2 = 0x5a3a20;
const PENCIL = 0x8a7458;
const PAPER = PAL.paper;

// ------------------------------------------------------------------ glyph builder
// mask values: 0 empty, 1 fill, 2 ink. Silhouettes are drawn as fill, edge() inks their rim, then
// details are inked on top.
class G {
  constructor(n = 13) { this.n = n; this.m = new Uint8Array(n * n); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.n && y < this.n; }
  get(x, y) { return this.in(x, y) ? this.m[y * this.n + x] : 0; }
  put(x, y, v = 1) {
    x = Math.round(x); y = Math.round(y);
    if (!this.in(x, y)) return this;
    const i = y * this.n + x;
    if (v === 0) this.m[i] = 0;
    else if (v === 2 || this.m[i] !== 2) this.m[i] = v;
    return this;
  }
  rows(rs, v = null) {
    rs.forEach((r, y) => [...r].forEach((ch, x) => {
      if (ch === '#') this.put(x, y, v ?? 1);
      else if (ch === 'x') this.put(x, y, 2);
      else if (ch === '-') this.put(x, y, 0);
    }));
    return this;
  }
  rect(x, y, w, h, v = 1) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.put(i, j, v); return this; }
  ell(cx, cy, rx, ry, v = 1) {
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.put(x, y, v);
    return this;
  }
  disk(cx, cy, r, v = 1) { return this.ell(cx, cy, r, r, v); }
  ring(cx, cy, r, v = 2) {
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (Math.abs(d - r) < 0.5) this.put(x, y, v); }
    return this;
  }
  line(x0, y0, x1, y1, v = 2, w = 1) {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (w <= 1) this.put(x, y, v);
      else for (let dy = -w / 2 + 0.5; dy <= w / 2 - 0.5 + 1e-6; dy++) for (let dx = -w / 2 + 0.5; dx <= w / 2 - 0.5 + 1e-6; dx++) this.put(x + dx, y + dy, v);
    }
    return this;
  }
  pts(list, v = 2) { for (const [x, y] of list) this.put(x, y, v); return this; }
  poly(P, v = 1) {
    for (let y = 0; y < this.n; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < P.length; i++) {
        const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.put(x, y, v);
    }
    return this;
  }
  /** Ink the rim of every filled area. */
  edge() {
    const out = [];
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) {
      if (this.get(x, y) !== 1) continue;
      if (!this.get(x - 1, y) || !this.get(x + 1, y) || !this.get(x, y - 1) || !this.get(x, y + 1)) out.push([x, y]);
    }
    for (const [x, y] of out) this.m[y * this.n + x] = 2;
    return this;
  }
}

/** A pickaxe, head arcing over a diagonal handle. */
function pickaxe(g, n = 13) {
  if (n === 13) {
    g.line(1.4, 11.6, 9, 4, 2, 2);
    const H = [[1.4, 4.2], [2.2, 2.4], [4, 1.2], [6.4, 1.1], [8.6, 2.1], [10.4, 3.6], [11.6, 5.6], [11.9, 8], [11.2, 10.4]];
    for (let i = 0; i + 1 < H.length; i++) g.line(H[i][0], H[i][1], H[i + 1][0], H[i + 1][1], 2, i > 1 && i < H.length - 3 ? 2 : 1);
    g.pts([[8, 4], [9, 5]], 1);
  } else {
    g.line(0.6, 8.4, 6, 3, 2);
    const H = [[1, 2.4], [2.6, 0.8], [4.8, 0.6], [6.8, 1.8], [8, 3.8], [8.2, 6], [7.4, 7.8]];
    for (let i = 0; i + 1 < H.length; i++) g.line(H[i][0], H[i][1], H[i + 1][0], H[i + 1][1], 2);
  }
  return g;
}

/** Each glyph: (g) => draw. 13×13, centre (6.5, 6.5). */
const GLYPHS = {
  pick: (g) => pickaxe(g),
  swing: (g) => { pickaxe(g); g.pts([[0, 8], [1, 7], [2, 6], [3, 10], [4, 9], [5, 8], [6, 12], [7, 11]]); },
  paw: (g) => {
    g.ell(2.3, 5.2, 1.6, 2.1).ell(4.9, 2.6, 1.6, 2.1).ell(8.1, 2.6, 1.6, 2.1).ell(10.7, 5.2, 1.6, 2.1).ell(6.5, 9.4, 4.3, 3.3).edge();
  },
  feather: (g) => {
    g.poly([[12.6, 0.2], [12.8, 2.4], [10.4, 6.6], [6.4, 10.2], [3, 11.2], [2.4, 9.6], [3.6, 6.4], [7.4, 2.6]]).edge();
    g.line(12, 1, 1.5, 11.5, 2).pts([[0, 12]]).pts([[6, 4], [8, 9]], 0).pts([[6, 5], [8, 8]]);
  },
  nose: (g) => {
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.ell(6.5 + Math.cos(a) * 4.4, 6.5 + Math.sin(a) * 4.4, 1.35, 1.35); }
    g.disk(6.5, 6.5, 2.6).edge();
    g.put(6, 6, 2); g.put(7, 7, 2);
  },
  bag: (g) => {
    g.ell(6.5, 8.6, 5.6, 4.3).rect(4, 2, 5, 4).poly([[2.5, 0.5], [6, 3], [5, 4]]).poly([[10.5, 0.5], [7, 3], [8, 4]]).edge();
    g.line(3.5, 4, 9.5, 4, 2).pts([[6, 6], [7, 6], [5, 7], [8, 7], [6, 8], [7, 8]]).pts([[6, 7], [7, 7]], 1);
  },
  bolt: (g) => g.poly([[8.5, 0], [2.5, 7.4], [6.2, 7.4], [4, 13], [10.8, 5], [7.2, 5], [9.6, 0]]).edge(),
  bomb: (g) => {
    g.rect(2, 4, 3, 9).rect(5, 4, 3, 9).rect(8, 4, 3, 9).edge();
    g.line(2, 8, 10, 8, 2).line(6.5, 4, 7.5, 1.5, 2).pts([[8, 1], [9, 0], [10, 1], [9, 2], [11, 0], [11, 2]]);
  },
  rock: (g) => {
    g.poly([[1.2, 6], [3.5, 2.2], [8, 1], [11.6, 3.2], [12.8, 8.2], [9.6, 11.8], [4, 12], [0.6, 9.4]]).edge();
    g.line(7, 1.5, 6, 4.5, 2).line(6, 4.5, 8, 6.5, 2).line(8, 6.5, 6.5, 9.5, 2).line(6, 4.5, 3.5, 6, 2).pts([[3, 4], [4, 3], [10, 5]], 2);
  },
  gem: (g) => {
    g.poly([[3, 1.5], [10, 1.5], [13, 5], [6.5, 12.6], [0, 5]]).edge();
    g.line(1, 5, 12, 5, 2).line(5, 2, 4, 5, 2).line(8, 2, 9, 5, 2).line(4, 5, 6.5, 11, 2).line(9, 5, 6.5, 11, 2);
  },
  crown: (g) => {
    g.poly([[0.8, 10], [0.8, 3.5], [4, 7], [6.5, 1.6], [9, 7], [12.2, 3.5], [12.2, 10]]).rect(1, 9, 11, 3).edge();
    g.disk(1, 2.3, 1.1).disk(6.5, 0.9, 1.1).disk(12, 2.3, 1.1);
    g.pts([[1, 2], [6, 1], [12, 2]], 2).pts([[3, 10], [6, 10], [9, 10]], 2).pts([[6, 6], [6, 7]], 2);
  },
  hourglass: (g) => {
    g.rect(1, 0, 11, 2).rect(1, 11, 11, 2).poly([[2.5, 2], [10.5, 2], [6.5, 6.6]]).poly([[6.5, 6.4], [10.5, 11], [2.5, 11]]).edge();
    g.pts([[4, 3], [5, 3], [6, 3], [7, 3], [8, 3]], 0).pts([[6, 7], [6, 8]], 2).rect(4, 9, 5, 2, 2);
  },
  anvil: (g) => g.rows([
    '.............',
    '.............',
    '.............',
    '############.',
    '.###########.',
    '...#########.',
    '.....#####...',
    '.....####....',
    '....######...',
    '...########..',
    '..##########.',
    '..##########.',
    '.............',
  ]).edge().pts([[4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4]], 1).pts([[11, 1], [10, 0], [12, 0]]),
  hammer: (g) => {
    g.line(1.4, 11.6, 7.6, 5.4, 1, 2).poly([[3.6, 3.4], [8.2, -0.6], [12.8, 4], [8.4, 8.6]]).edge();
    g.line(6.4, 1.4, 10.8, 5.8, 2).pts([[8, 2], [9, 3]], 1);
  },
  flame: (g) => g.rows([
    '......#......',
    '.....##......',
    '.....###.....',
    '....####..#..',
    '....#####.#..',
    '...#######...',
    '..####x####..',
    '..###x#x###..',
    '..##x###x##..',
    '..##x###x##..',
    '...##xxx##...',
    '....#####....',
    '.............',
  ]).edge(),
  eye: (g) => {
    g.poly([[0, 6.5], [3, 3.4], [6.5, 2.6], [10, 3.4], [13, 6.5], [10, 9.6], [6.5, 10.4], [3, 9.6]]).edge();
    g.ring(6.5, 6.5, 2.4).disk(6.5, 6.5, 1.3, 2).put(5, 5, 1);
    g.pts([[2, 1], [6, 0], [11, 1]]);
  },
  ingot: (g) => g.rows([
    '.............',
    '.............',
    '.............',
    '...#######...',
    '..#########..',
    '.###########.',
    '.xxxxxxxxxxx.',
    '#############',
    '#############',
    '#############',
    '#############',
    '.............',
    '.............',
  ]).edge().pts([[4, 8], [5, 8], [6, 9]], 1).pts([[4, 4], [5, 4]], 1),
  sword: (g) => {
    g.line(11.2, 1.8, 4.6, 8.4, 1, 3).edge();
    g.pts([[12, 0], [12, 1], [11, 0]]).line(1.6, 6.2, 6.6, 11.2, 2, 2).line(3.4, 9.6, 1.2, 11.8, 2, 2).disk(0.8, 12.2, 1.1, 2);
    g.line(10, 3, 5.6, 7.4, 1);
  },
  pot: (g) => {
    g.ell(6.5, 8.3, 5.8, 4.3).rect(1, 4, 11, 2).edge();
    g.pts([[0, 5], [12, 5], [3, 12], [9, 12]]).line(2, 6, 11, 6, 2);
    g.pts([[4, 3], [5, 2], [4, 1], [5, 0], [8, 3], [9, 2], [8, 1], [9, 0]]);
  },
  knife: (g) => {
    g.poly([[12.8, 0.2], [12.4, 3], [6.6, 8.6], [4.4, 6.6]]).edge();
    g.line(5, 8, 1.2, 11.8, 2, 2).pts([[5, 7], [6, 8]]).pts([[10, 3], [9, 4]], 1);
  },
  bowl: (g) => {
    g.ell(6.5, 5.6, 4.6, 2.8).ell(6.5, 6.6, 6.4, 4.8).rect(4, 11, 5, 2).edge();
    for (let x = 0; x < 13; x++) for (let y = 0; y < 6; y++) if (g.get(x, y) && !(((x + 0.5 - 6.5) / 4.6) ** 2 + ((y + 0.5 - 5.6) / 2.8) ** 2 <= 1)) g.put(x, y, 0);
    g.edge().line(0.5, 7, 12.5, 7, 2).pts([[4, 4], [8, 3], [6, 5]], 2);
  },
  spoon: (g) => { g.line(11.8, 0.8, 5.2, 7.4, 1, 2).ell(4, 9, 3.4, 3.2).edge(); g.pts([[3, 8], [4, 8]], 1); },
  heart: (g) => { g.disk(3.9, 4.4, 3.2).disk(9.1, 4.4, 3.2).poly([[0.9, 5.5], [12.1, 5.5], [6.5, 12]]).edge(); g.pts([[3, 3], [3, 4]], 1); },
  clock: (g) => {
    g.disk(6.5, 6.5, 6.3).edge();
    g.line(6, 6, 6, 2.5, 2).line(6, 6, 9, 8, 2).pts([[6, 11], [1, 6], [11, 6]]);
  },
  egg: (g) => { g.ell(6.5, 7.3, 4.6, 5.8).edge(); g.pts([[5, 5], [8, 7], [6, 9], [9, 10], [4, 8]]).pts([[4, 4], [4, 5]], 1); },
  star: (g) => {
    const P = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 2.8 : 6.6; P.push([6.5 + Math.cos(a) * r, 7.1 + Math.sin(a) * r]); }
    g.poly(P).edge();
  },
  shield: (g) => {
    g.poly([[0.6, 1], [12.4, 1], [12.4, 6.4], [6.5, 12.8], [0.6, 6.4]]).edge();
    g.line(6, 2, 6, 10, 2).line(2, 5, 11, 5, 2).pts([[3, 3], [9, 7]], 1);
  },
  claws: (g) => {
    g.line(4.4, 0.8, 1.2, 11.6, 2, 2).line(8, 0.8, 4.8, 11.6, 2, 2).line(11.6, 0.8, 8.4, 11.6, 2, 2);
    g.pts([[5, 0], [8, 0], [12, 0]], 0);
  },
  plate: (g) => {
    g.poly([[0.4, 1.6], [4.4, 0.6], [6.5, 2.6], [8.6, 0.6], [12.6, 1.6], [12.4, 5], [10.8, 6], [10.8, 11], [6.5, 12.8], [2.2, 11], [2.2, 6], [0.6, 5]]).edge();
    g.line(6.5, 3.4, 6.5, 11.4, 2).line(2.6, 6, 10.4, 6, 2).pts([[4, 8], [9, 8], [4, 10], [9, 10]]);
  },
  drumstick: (g) => {
    g.ell(5, 5, 4.4, 4.1).line(7, 7, 10.4, 10.4, 1, 2).disk(11.6, 10, 1.4).disk(10, 11.8, 1.4).edge();
    g.pts([[3, 3], [4, 3], [3, 4]], 1).pts([[6, 3], [4, 6]], 2);
  },
  wind: (g) => {
    g.line(0, 3, 7, 3, 2).pts([[8, 2], [9, 1], [8, 0], [7, 0]]);
    g.line(0, 6, 9, 6, 2).pts([[10, 5], [11, 4], [10, 3]]);
    g.line(2, 9, 7, 9, 2).pts([[8, 10], [8, 11], [7, 12], [6, 11]]);
  },
  axe: (g) => {
    g.line(2, 12.4, 8.4, 2, 1, 2);
    g.poly([[6, 1.6], [10.4, 0], [12.8, 3.2], [12, 7.4], [9.4, 4.8], [7.6, 4]]).edge();
    g.pts([[11, 3], [11, 4]], 1);
  },
  lamp: (g) => {
    g.ell(6.5, 9, 5.6, 5.4).rect(0, 9, 13, 2).edge();
    for (let x = 0; x < 13; x++) for (let y = 11; y < 13; y++) g.put(x, y, 0);
    g.line(0, 10, 12, 10, 2).disk(6.5, 6.4, 1.9, 2).put(6, 6, 1);
    g.pts([[6, 0], [6, 1], [2, 2], [3, 3], [11, 2], [10, 3]]);
  },
  map: (g) => {
    g.poly([[0, 2], [4.2, 0.8], [8.6, 2], [13, 0.8], [13, 11], [8.6, 12.2], [4.2, 11], [0, 12.2]]).edge();
    g.line(4.2, 1, 4.2, 11, 2).line(8.6, 2, 8.6, 12, 2);
    g.pts([[2, 9], [3, 8], [5, 7], [6, 6], [7, 6]]).pts([[9, 4], [11, 4], [10, 5], [9, 6], [11, 6]]);
  },
  boot: (g) => {
    g.poly([[2.6, 0], [8.4, 0], [8.4, 6.6], [12.6, 8], [12.6, 12.6], [0.6, 12.6], [0.6, 9.2], [2.6, 7]]).edge();
    g.line(4, 2, 7, 2, 2).line(4, 4, 7, 4, 2).line(1, 11, 12, 11, 2);
  },
  moon: (g) => {
    g.disk(5.6, 7, 5.6);
    g.disk(8.4, 5.4, 4.6, 0);
    g.edge().pts([[11, 9], [10, 11], [12, 11], [11, 12], [11, 10], [9, 1], [11, 2]]);
  },
  compass: (g) => {
    g.disk(6.5, 6.5, 6.3).edge();
    g.poly([[6.5, 1.6], [8.4, 6.5], [4.6, 6.5]], 2).poly([[4.6, 6.5], [8.4, 6.5], [6.5, 11.4]]);
    g.line(5, 7, 6.5, 11, 2).line(8, 7, 6.5, 11, 2).put(6, 6, 1).pts([[1, 6], [11, 6]]);
  },
  worm: (g) => {
    g.disk(2, 9.6, 1.7).disk(4.4, 8.4, 1.9).disk(7, 8.6, 1.9).disk(9.4, 7, 1.9).disk(10.8, 4.6, 1.9).edge();
    g.put(11, 4, 2).pts([[9, 1], [12, 1], [8, 3]]).pts([[4, 8], [7, 8]], 1);
  },
  mushroom: (g) => {
    g.ell(6.5, 6.2, 6.3, 5.2);
    for (let x = 0; x < 13; x++) for (let y = 7; y < 13; y++) g.put(x, y, 0);
    g.rect(4, 6, 5, 7).edge();
    g.line(1, 6, 12, 6, 2).pts([[4, 3], [8, 2], [9, 4], [3, 5]], 2).pts([[6, 10], [6, 11]], 2);
  },
  leaf: (g) => {
    g.poly([[0.6, 12.4], [1.6, 6.4], [4.6, 2.4], [9.6, 0.6], [12.6, 0.2], [12, 4], [9.6, 8.6], [4.6, 11.2]]).edge();
    g.line(1, 12, 10, 2.6, 2).line(5, 7.6, 4, 5, 2).line(7.4, 5.4, 9, 7.4, 2);
  },
  sprout: (g) => {
    g.poly([[6, 6.5], [3.6, 2.6], [0.4, 2.8], [2, 6.6]]).poly([[6.8, 5.6], [8.4, 1.2], [12.6, 0.8], [10.8, 5]]).edge();
    g.line(6.5, 12, 6.5, 5, 2).line(3, 12, 10, 12, 2).pts([[2, 5], [10, 3]], 2);
  },
  hen: (g) => {
    g.ell(5.6, 8.4, 5.2, 3.8).disk(9.6, 4.4, 2.6).poly([[0.2, 3.4], [3.4, 6.4], [1, 8.4]]).edge();
    g.pts([[9, 0], [10, 1], [8, 1], [9, 1]]).pts([[12, 4], [12, 5]]).put(10, 4, 2);
    g.line(3, 8, 7, 10, 2).pts([[4, 12], [7, 12]]);
  },
  coin: (g) => {
    g.disk(6.5, 6.5, 6.3).edge();
    g.ring(6.5, 6.5, 4.2).line(6.5, 4, 6.5, 9, 2).pts([[5, 5], [8, 8]]).pts([[3, 3], [3, 4]], 1);
  },
  scale: (g) => {
    g.line(6.5, 1.5, 6.5, 11, 1, 2).rect(3, 11, 7, 2).edge();
    g.line(0.5, 2.5, 12.5, 2.5, 2).line(1, 3, 0, 7, 2).line(1, 3, 3, 7, 2).line(12, 3, 10, 7, 2).line(12, 3, 13, 7, 2);
    g.line(0, 8, 3, 8, 2).line(10, 8, 13, 8, 2).pts([[6, 0], [7, 0]]);
  },
  tag: (g) => {
    g.poly([[6.6, 0.4], [12.6, 0.4], [12.6, 6.4], [5.6, 13], [0, 7.4]]).edge();
    g.disk(9.8, 3.2, 1.2, 0).ring(9.8, 3.2, 1.7).line(4, 9, 8, 5, 2).pts([[4, 6], [8, 9]]);
  },
  stack: (g) => {
    g.rect(1, 4, 11, 7).ell(6.5, 4.2, 5.5, 2.2).ell(6.5, 10.8, 5.5, 2.2).edge();
    g.ell(6.5, 4.2, 3.4, 1.1, 2).put(6, 4, 1);
    for (let x = 1; x < 12; x++) { g.put(x, 7 + (x > 2 && x < 10 ? 1 : 0), 2); }
  },
  mask: (g) => {
    g.ell(6.5, 7.6, 6.2, 4.8).poly([[0.6, 5.4], [1.2, 0.4], [4.8, 3.6]]).poly([[12.4, 5.4], [11.8, 0.4], [8.2, 3.6]]).edge();
    g.rect(1, 6, 11, 2, 2).pts([[4, 6], [9, 6]], 1).pts([[6, 10], [7, 10]]).pts([[2, 2], [11, 2]], 1);
  },
  jar: (g) => {
    g.rect(1, 4, 11, 8).rect(3, 2, 7, 2).rect(2, 0, 9, 2).edge();
    g.ring(6.5, 8, 2.2).line(6.5, 7, 6.5, 9, 2).line(3, 3, 10, 3, 2).pts([[2, 6], [2, 7]], 1);
  },
  potion: (g) => {
    g.disk(6.5, 8.6, 4.4).rect(5, 2, 3, 4).rect(4, 0, 5, 2).edge();
    g.line(3, 8, 10, 8, 2).pts([[5, 10], [8, 11], [7, 9]], 2).pts([[4, 6]], 1);
  },
  drop: (g) => {
    g.disk(6.5, 8.4, 4.3).poly([[6.5, 0], [10.4, 7], [2.6, 7]]).edge();
    g.pts([[4, 7], [4, 8], [5, 6]], 2);
  },
  fist: (g) => {
    g.rect(2, 3, 9, 8).ell(10.8, 7.5, 1.6, 3).edge();
    g.line(4.5, 3, 4.5, 6, 2).line(6.5, 3, 6.5, 6, 2).line(8.5, 3, 8.5, 6, 2).line(2, 7, 8, 7, 2).line(8, 7, 9, 9, 2);
  },
};
export const GLYPH_IDS = Object.keys(GLYPHS);

const glyphCache = new Map();
export function glyph(id, n = 13) {
  const key = id + ':' + n;
  if (!glyphCache.has(key)) {
    const g = new G(n);
    try { ((n === 13 ? GLYPHS : MINI)[id] || (n === 13 ? GLYPHS.star : MINI.star))(g); } catch (e) { console.warn('skill glyph', id, e); }
    glyphCache.set(key, g);
  }
  return glyphCache.get(key);
}

// 9×9 versions for the line tabs
const MINI = {
  pick: (g) => pickaxe(g, 9),
  anvil: (g) => g.rows(['.........', '.........', '#######..', '.########', '...#####.', '...####..', '..######.', '..######.', '.........']).edge(),
  pot: (g) => { g.rows(['.........', '.........', '#########', '.#######.', '#########', '#########', '.#######.', '..#####..', '.........']).edge(); g.pts([[3, 0], [2, 1], [6, 0], [5, 1]]); },
  sword: (g) => { g.line(8, 0, 2.6, 5.4, 2, 2).line(0.6, 3.8, 4.4, 7.6, 2).line(2, 6.6, 0.4, 8.4, 2); },
  compass: (g) => { g.disk(4.5, 4.5, 4.4).edge(); g.poly([[4.5, 1.2], [5.8, 4.5], [3.2, 4.5]], 2).pts([[4, 5], [4, 6], [4, 7]]); },
  mushroom: (g) => { g.rows(['..#####..', '.#######.', '#########', '#########', 'xxxxxxxxx', '...###...', '...###...', '...###...', '.........']).edge(); g.pts([[3, 2], [6, 1]], 2); },
  coin: (g) => { g.disk(4.5, 4.5, 4.4).edge(); g.line(4.5, 2.5, 4.5, 6.5, 2).pts([[2, 2]], 1); },
  nose: (g) => { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.ell(4.5 + Math.cos(a) * 3.2, 4.5 + Math.sin(a) * 3.2, 1.05, 1.05); } g.disk(4.5, 4.5, 1.8).edge(); },
  star: (g) => { const P = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 1.9 : 4.5; P.push([4.5 + Math.cos(a) * r, 4.9 + Math.sin(a) * r]); } g.poly(P).edge(); },
};

// ------------------------------------------------------------------ shading helpers
const hash = (x, y, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
const pal5 = (p) => ({ hi: p[0], lt: p[1], base: p[2], dk: p[3], dd: p[4] });

/** A pressed wax seal: an irregular blob with drips, a stamped groove and the raised glyph. */
function waxSeal(n, gid, pal, seed, { glyphN = 13, ring = true } = {}) {
  const P = pal5(pal);
  const p = new Px(n, n);
  const c = n / 2;
  const R = n * 0.455;
  const r = makeRng(seed);
  p.disk(c, c, R - 0.9, P.base);
  const bumps = 7 + r.int(0, 2);
  for (let k = 0; k < bumps; k++) {
    const a = (k / bumps) * Math.PI * 2 + r() * 0.6;
    const d = R - 1.4 - r() * 0.6;
    p.disk(c + Math.cos(a) * d, c + Math.sin(a) * d, 1.2 + r() * (n > 16 ? 1.2 : 0.6), P.base);
  }
  if (n > 16) {
    const a = Math.PI * (0.35 + r() * 0.3);
    p.ellipse(c + Math.cos(a) * (R - 0.6), c + Math.sin(a) * (R - 0.2) + 0.8, 1.1, 1.7, P.base);
  }
  const D = p.dist(3);
  p.each((x, y) => {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, len = Math.hypot(dx, dy) || 1;
    const l = -(dx + dy) / (len * 1.414);
    const d = D(x, y);
    if (d === 1) return l > 0.25 ? P.lt : l < -0.35 ? P.dd : P.dk;
    if (d === 2) return l > 0.45 ? P.hi : l < -0.45 ? P.dk : P.base;
    const m = hash(x, y, seed);
    return m < 0.07 ? mixHex(P.base, P.lt, 0.5) : m > 0.95 ? mixHex(P.base, P.dk, 0.4) : P.base;
  });
  // the stamp's pressed groove
  if (ring) {
    const rr = R - (n > 16 ? 2.9 : 2.0);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!p.a(x, y)) continue;
      const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
      const ul = dx + dy < 0;
      if (Math.abs(d - rr) < 0.5) p.set(x, y, P.dk);
      else if (Math.abs(d - (rr - 1)) < 0.5) p.set(x, y, ul ? P.dk : P.lt);
      else if (Math.abs(d - (rr + 1)) < 0.5 && !ul) p.set(x, y, mixHex(P.base, P.lt, 0.5));
    }
  }
  // the pressed field inside the groove sits a shade deeper
  const field = R - (n > 16 ? 3.9 : 2.6);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!p.a(x, y) || Math.hypot(x + 0.5 - c, y + 0.5 - c) > field) continue;
    const m = hash(x, y, seed + 3);
    p.set(x, y, mixHex(P.base, P.dk, m < 0.1 ? 0.15 : 0.32));
  }
  // the raised glyph: lit top-left edges, a cast shadow down-right
  if (gid) {
    const g = glyph(gid, glyphN);
    const o = Math.round(c - glyphN / 2);
    const on = (x, y) => g.get(x, y) > 0;
    for (let y = 0; y < glyphN; y++) for (let x = 0; x < glyphN; x++) {
      if (on(x, y)) continue;
      if (on(x - 1, y - 1) || on(x - 1, y) || on(x, y - 1)) p.set(o + x, o + y, on(x - 1, y - 1) ? P.dd : mixHex(P.dk, P.dd, 0.5));
    }
    // ink lines inside a shape (facets, cracks, seams) are cut into the relief; the rim is raised
    const fillNear = (x, y) => g.get(x - 1, y) === 1 || g.get(x + 1, y) === 1 || g.get(x, y - 1) === 1 || g.get(x, y + 1) === 1;
    for (let y = 0; y < glyphN; y++) for (let x = 0; x < glyphN; x++) {
      const v = g.get(x, y);
      if (!v) continue;
      const lit = !on(x - 1, y) || !on(x, y - 1) || !on(x - 1, y - 1);
      const shade = !on(x + 1, y) || !on(x, y + 1);
      const rim = !on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1);
      let col;
      if (v === 2 && !rim && fillNear(x, y)) col = g.get(x - 1, y - 1) === 1 ? P.dk : mixHex(P.dk, P.base, 0.4);
      else if (v === 2) col = lit ? P.hi : shade ? mixHex(P.lt, P.base, 0.5) : P.lt;
      else col = lit ? P.hi : mixHex(P.lt, P.hi, 0.25);
      p.set(o + x, o + y, col);
    }
  }
  // glint
  const ga = -Math.PI * 0.75;
  for (let i = -1; i <= 1; i++) { const a = ga + i * 0.22; p.set(Math.round(c + Math.cos(a) * (R - 2.2) - 0.5), Math.round(c + Math.sin(a) * (R - 2.2) - 0.5), 0xffffff, 150); }
  p.outline(P.dd);
  return p;
}

/** An inked medallion: a hand-drawn ink circle, hatched shade, glyph in ink over a wash of the line's colour. */
function inkMedallion(n, gid, pal, seed, { faint = false } = {}) {
  const P = pal5(pal);
  const p = new Px(n, n);
  const c = n / 2, R = n * 0.43;
  const r = makeRng(seed);
  const ink = faint ? INK2 : INK;
  const wash = mixHex(PAPER.hi, P.lt, 0.32);
  p.disk(c, c, R - 0.4, wash, faint ? 70 : 120);
  // hatching in the lower right
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
    if (d < R - 1.2 && d > R - 4.4 && dx + dy > 3 && (x + y) % 3 === 0) p.set(x, y, ink, faint ? 45 : 85);
  }
  // the pen ring: starts with a blot, wobbles, overshoots its start
  const ph = r() * Math.PI * 2, wob = 0.35 + r() * 0.25, a0 = r() * Math.PI * 2;
  const steps = 160;
  for (let i = 0; i <= steps * 1.08; i++) {
    const a = a0 + (i / steps) * Math.PI * 2;
    const rad = R + Math.sin(a * 3 + ph) * wob + (i > steps ? (i - steps) * 0.06 : 0);
    p.set(Math.floor(c + Math.cos(a) * rad), Math.floor(c + Math.sin(a) * rad), ink);
  }
  p.set(Math.floor(c + Math.cos(a0) * R), Math.floor(c + Math.sin(a0) * R) + 1, ink, 200);
  // glyph
  const g = glyph(gid, 13);
  const o = Math.round(c - 6.5);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    const v = g.get(x, y);
    if (v === 2) p.set(o + x, o + y, ink);
    else if (v === 1) p.set(o + x, o + y, mixHex(PAPER.hi, P.lt, 0.55));
  }
  return p;
}

/** A light pencil sketch (not reachable yet); barred = crossed out in red ink. */
function pencilSketch(n, gid, seed, barred = false) {
  const p = new Px(n, n);
  const c = n / 2, R = n * 0.43;
  const r = makeRng(seed);
  const a0 = r() * Math.PI * 2;
  for (let i = 0; i < 140; i++) {
    if (i % 3 === 2) continue;
    const a = a0 + (i / 140) * Math.PI * 2;
    p.set(Math.floor(c + Math.cos(a) * R), Math.floor(c + Math.sin(a) * R), PENCIL, 130);
  }
  const g = glyph(gid, 13);
  const o = Math.round(c - 6.5);
  for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
    const v = g.get(x, y);
    if (v === 2) p.set(o + x, o + y, PENCIL, 150);
    else if (v === 1) p.set(o + x, o + y, PENCIL, 38);
  }
  if (barred) {
    const red = 0x9a3a26;
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const w = Math.sin(t * Math.PI) * 0.6;
      p.set(Math.round(4 + t * (n - 9)), Math.round(5 + t * (n - 10) + w), red, 220);
      p.set(Math.round(n - 5 - t * (n - 9)), Math.round(4 + t * (n - 9) - w), red, 220);
    }
  }
  return p;
}

// ------------------------------------------------------------------ public URLs
const NODE_N = 24;
export const NODE_PX = NODE_N;
/** A node's picture. kind: 'done' | 'ink' | 'faint' | 'pencil' | 'barred'. */
export function nodeURL(node, line, kind) {
  const seed = hashStr(node.id);
  return art(`sk:${kind}:${node.id}`, () => {
    if (kind === 'done') return waxSeal(NODE_N, node.glyph, line.pal, seed);
    if (kind === 'ink') return inkMedallion(NODE_N, node.glyph, line.pal, seed);
    if (kind === 'faint') return inkMedallion(NODE_N, node.glyph, line.pal, seed, { faint: true });
    return pencilSketch(NODE_N, node.glyph, seed, kind === 'barred');
  });
}
/** The 13×13 line seal for tabs and toasts. */
export function lineSealURL(line, dim = false) {
  return art(`skl:${line.id}:${dim ? 1 : 0}`, () => {
    const pal = dim ? line.pal.map((c) => mixHex(c, 0xb8a888, 0.55)) : line.pal;
    return waxSeal(13, line.glyph, pal, hashStr(line.id), { glyphN: 9, ring: false });
  });
}
/** A big (24) wax seal of a line's own glyph (detail headers). */
export function lineBigURL(line) { return art(`sklb:${line.id}`, () => waxSeal(NODE_N, line.glyph, line.pal, hashStr(line.id) + 7)); }
/** The skill point token: a blank red seal with Old Star's star-nose. */
export function tokenURL(empty = false) {
  return art('sktok' + (empty ? 0 : 1), () => {
    const pal = empty ? [0xd8ccb4, 0xc0b090, 0xa89474, 0x86735a, 0x5a4c3a] : [0xffa080, 0xe8604a, 0xc23c2c, 0x8a2418, 0x50120a];
    return waxSeal(13, 'nose', pal, 99, { glyphN: 9, ring: false });
  });
}
/** Red-ink circle drawn around the picked node (34×34). */
export function selRingURL() {
  return art('sksel', () => {
    const n = 34, p = new Px(n, n), c = n / 2, red = 0xb8402c;
    for (let i = 0; i <= 230; i++) {
      const t = i / 200, a = -2.2 + t * Math.PI * 2;
      const R = 15 + Math.sin(t * 9) * 0.35 + (t > 1 ? (t - 1) * 3 : 0);
      p.set(Math.floor(c + Math.cos(a) * R), Math.floor(c + Math.sin(a) * R * 0.97), red, t > 1.06 ? 140 : 235);
    }
    return p;
  });
}
/** A tiny 5×5 cost pip (wax drop). */
export function pipURL(on = true) {
  return art('skpip' + (on ? 1 : 0), () => {
    const p = new Px(5, 5);
    p.disk(2.5, 2.5, 2.2, on ? 0xc23c2c : 0xb8a888);
    p.set(1, 1, on ? 0xff9a7a : 0xe0d4bc);
    p.outline(on ? 0x50120a : 0x6e5e48);
    return p;
  });
}

/** Debug: every glyph as wax, ink and pencil on one sheet (for screenshots). */
export function glyphSheet(line) {
  const ids = GLYPH_IDS;
  const cols = 8, cell = 26;
  const rows = Math.ceil(ids.length / cols);
  const p = new Px(cols * cell * 3 + 4, rows * cell + 4);
  p.rect(0, 0, p.w, p.h, PAPER.base);
  ids.forEach((id, i) => {
    const x = (i % cols) * cell * 3 + 2, y = Math.floor(i / cols) * cell + 2;
    const node = { id: 'sheet' + id, glyph: id };
    p.blit(waxSeal(NODE_N, id, line.pal, i + 3), x, y);
    p.blit(inkMedallion(NODE_N, id, line.pal, i + 3), x + cell, y);
    p.blit(pencilSketch(NODE_N, id, i + 3, i % 5 === 4), x + cell * 2, y);
    void node;
  });
  return p.url();
}
