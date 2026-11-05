// High-detail pixel art for the backpack (and the hotbar that hangs off it): everything here is
// drawn pixel by pixel at one art pixel = one --px, big enough that the grain shows.
//   leather    a 96×96 tile of pebbled, worn brown leather: a bump per grain cell lit from the top
//              left, creases, scratches, paler scuffs where hands go, darker oiled patches
//   flapLeather the flap's darker, oiled leather (same grain)
//   canvas     a 64×64 tile of the lining: woven canvas, thick and thin threads, slubs, old stains
//   edge       a 9-slice (16) for the bag's edges: the leather rolled over a cord, double stitching,
//              a brass rivet in each corner
//   pocket     a 9-slice (20) for a compartment sewn into the lining: a stitched seam all round, the
//              mouth's shadow at the top, a fold, the lining's own weave
//   pocketOn   the same, lit (picked)
//   sleeve     a 9-slice (18) for a tool / gear sleeve: a leather pocket with its own stitching and a
//              rivet at each top corner
//   loop / loopOn  a 9-slice (16) hotbar loop: a leather strap loop with rivets (lit: a brass trim)
//   buckle     a brass buckle on a strap end (22×30)
//   rivet      a single brass rivet (6×6)
// installPackArt(node) publishes them as --pk-* custom properties.
import { Px, art } from './uiArt.js';

const h2 = (x, y, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Smooth value noise, tiling with period P. */
function vnoise(x, y, P, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const g = (i, j) => h2(((i % P) + P) % P, ((j % P) + P) % P, s);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (g(xi, yi) * (1 - u) + g(xi + 1, yi) * u) * (1 - v) + (g(xi, yi + 1) * (1 - u) + g(xi + 1, yi + 1) * u) * v;
}
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const hex = (r, g, b) => (Math.max(0, Math.min(255, r | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, b | 0));
const shadeC = (c, k) => { const [r, g, b] = rgb(c); return hex(r * k, g * k, b * k); };
const mixC = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
/** Quantize a brightness into one of a palette's tones (pixel art reads better in steps). */
const tone = (pal, k) => pal[Math.max(0, Math.min(pal.length - 1, Math.round(k * (pal.length - 1))))];

const LEATHER = [0x2e1a0e, 0x3e2414, 0x52301a, 0x643c20, 0x744828, 0x865632, 0x9a683e, 0xae7c4c];
const LEATHER_D = [0x24140a, 0x301c0e, 0x3e2414, 0x4c2c18, 0x5a361e, 0x684026, 0x784c2e, 0x8a5a38];
const CANVAS = [0x8e7650, 0xa08a62, 0xb29c72, 0xc2ac80, 0xd0bc8e, 0xdccaa0, 0xe8d8b2];
const THREAD = 0xe8d4a4, THREAD_S = 0x5a3a1e;
const BRASS = [0x3a2408, 0x6a4612, 0x9a6a1e, 0xc8902e, 0xe6b44a, 0xf8dc86, 0xfff4c8];

/** Pebbled leather (tiling). */
function leatherTile(pal = LEATHER, seed = 3, S = 96) {
  const p = new Px(S, S);
  const CELL = 4.2; // grain size
  // grain: a jittered cell per pebble; each lit like a little dome
  const cells = Math.round(S / CELL);
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.2 + h2(i, j, seed) * 0.6) * S / cells, (j + 0.2 + h2(i, j, seed + 1) * 0.6) * S / cells]);
  const near = (x, y) => {
    let d1 = 1e9, d2 = 1e9, bx = 0, by = 0;
    const ci = Math.floor(x / (S / cells)), cj = Math.floor(y / (S / cells));
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = ((ci + di) % cells + cells) % cells, jj = ((cj + dj) % cells + cells) % cells;
      const [px, py] = pts[jj * cells + ii];
      const qx = px + (ci + di - ii) * (S / cells), qy = py + (cj + dj - jj) * (S / cells);
      const d = (x - qx) ** 2 + (y - qy) ** 2;
      if (d < d1) { d2 = d1; d1 = d; bx = qx; by = qy; } else if (d < d2) d2 = d;
    }
    return { d1: Math.sqrt(d1), d2: Math.sqrt(d2), bx, by };
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = near(x + 0.5, y + 0.5);
    // the dome of the pebble, lit from the top left; the valleys between are dark
    const lx = (x + 0.5 - n.bx), ly = (y + 0.5 - n.by);
    let k = 0.52 - (lx + ly) * 0.06;
    const edge = n.d2 - n.d1;
    if (edge < 0.9) k -= 0.2;
    // large-scale wear: paler scuffs, darker oiled patches, a crease or two
    const w = vnoise(x / 24, y / 24, S / 24, seed + 4);
    k += (w - 0.5) * 0.5;
    const crease = Math.abs(vnoise(x / 12 + y / 30, y / 40, S / 12, seed + 7) - 0.5);
    if (crease < 0.025) k -= 0.22;
    k += (h2(x, y, seed + 9) - 0.5) * 0.08;
    p.set(x, y, tone(pal, k));
  }
  // scratches: short pale lines with a dark lip
  for (let i = 0; i < 9; i++) {
    let x = h2(i, 1, seed + 11) * S, y = h2(i, 2, seed + 11) * S;
    const a = h2(i, 3, seed + 11) * Math.PI, L = 5 + h2(i, 4, seed + 11) * 12;
    for (let t = 0; t < L; t++) {
      const X = ((Math.round(x) % S) + S) % S, Y = ((Math.round(y) % S) + S) % S;
      p.set(X, Y, mixC(p.get(X, Y), pal[pal.length - 1], 0.6));
      const Y2 = (Y + 1) % S;
      p.set(X, Y2, shadeC(p.get(X, Y2), 0.8));
      x += Math.cos(a); y += Math.sin(a) * 0.6;
    }
  }
  return p;
}

/** Woven canvas (tiling). */
function canvasTile(S = 64, seed = 5) {
  const p = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // over-under: warp up on even cells, weft up on odd; each thread rounded across its width
    const cx = x >> 1, cy = y >> 1;
    const warpUp = (cx + cy) % 2 === 0;
    const across = warpUp ? (x & 1) : (y & 1);
    let k = 0.62 + (across ? -0.08 : 0.06) + (warpUp ? 0.04 : -0.04);
    // thick and thin threads, slubs
    k += (h2(warpUp ? cx : 0, warpUp ? 0 : cy, seed) - 0.5) * 0.18;
    if (h2(cx, cy, seed + 1) < 0.02) k += 0.18;
    // old stains and dust, a pale wash
    const st = vnoise(x / 16, y / 16, S / 16, seed + 3);
    if (st > 0.7) k -= (st - 0.7) * 1.3;
    k += (vnoise(x / 8, y / 8, S / 8, seed + 5) - 0.5) * 0.12;
    p.set(x, y, tone(CANVAS, k));
  }
  return p;
}

/** A row of running stitches along a line (dashes of thread with a dark needle hole each end). */
function stitches(p, x0, y0, x1, y1, len = 3, gap = 2) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let t = 0; t <= n; t++) {
    const x = Math.round(x0 + (x1 - x0) * t / Math.max(1, n)), y = Math.round(y0 + (y1 - y0) * t / Math.max(1, n));
    const m = t % (len + gap);
    if (m < len) p.set(x, y, m === 0 ? mixC(THREAD, 0xffffff, 0.3) : THREAD);
    else if (m === len) p.set(x, y, THREAD_S);
  }
}

function rivet(p, x, y) {
  p.set(x + 1, y, BRASS[2]); p.set(x + 2, y, BRASS[3]);
  p.set(x, y + 1, BRASS[2]); p.set(x + 1, y + 1, BRASS[6]); p.set(x + 2, y + 1, BRASS[4]); p.set(x + 3, y + 1, BRASS[2]);
  p.set(x, y + 2, BRASS[1]); p.set(x + 1, y + 2, BRASS[4]); p.set(x + 2, y + 2, BRASS[3]); p.set(x + 3, y + 2, BRASS[1]);
  p.set(x + 1, y + 3, BRASS[0]); p.set(x + 2, y + 3, BRASS[1]);
}

/** The bag's edge: leather rolled over a cord, double stitching, rivets in the corners. 9-slice 16. */
function edgeFrame() {
  const S = 48, B = 16;
  const tile = leatherTile(LEATHER, 13, 48);
  const p = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (d >= B) continue;
    let c = tile.get(x, y);
    // the rolled edge: a highlight along the outer lip, a shadow where it turns under
    if (d === 0) c = 0x1e0e06;
    else if (d === 1) c = mixC(c, 0xd8a06a, 0.35);
    else if (d === 2 || d === 3) c = mixC(c, 0xb07848, 0.18);
    else if (d === 5) c = shadeC(c, 0.72);
    else if (d === B - 1) c = 0x1e0e06;
    else if (d === B - 2) c = shadeC(c, 0.6);
    p.set(x, y, c);
  }
  // two rows of stitches
  for (const k of [7, 11]) {
    stitches(p, k, k, S - 1 - k, k); stitches(p, k, S - 1 - k, S - 1 - k, S - 1 - k);
    stitches(p, k, k, k, S - 1 - k); stitches(p, S - 1 - k, k, S - 1 - k, S - 1 - k);
  }
  for (const [x, y] of [[3, 3], [S - 7, 3], [3, S - 7], [S - 7, S - 7]]) rivet(p, x, y);
  return p;
}

/** A compartment sewn into the lining (the grid's cells). 9-slice 6 on a 20 square. */
function pocketFrame(on = false) {
  const S = 20;
  const cv = canvasTile(32, on ? 9 : 7);
  const p = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = cv.get(x + 4, y + 4);
    if (on) c = mixC(c, 0xfff0c0, 0.25);
    // the mouth's shadow along the top (it's a pocket: deeper at the top), lighter toward the bottom
    if (y < 4) c = shadeC(c, 0.62 + y * 0.08);
    if (x < 2) c = shadeC(c, 0.84);
    if (y > S - 3) c = mixC(c, 0xf0e2c0, 0.25);
    p.set(x, y, c);
  }
  // the seam: a dark fold, then the stitches
  for (let i = 0; i < S; i++) { p.set(i, 0, 0x4a3420); p.set(i, S - 1, 0x6a5234); p.set(0, i, 0x4a3420); p.set(S - 1, i, 0x6a5234); }
  stitches(p, 2, 2, S - 3, 2, 2, 2); stitches(p, 2, S - 3, S - 3, S - 3, 2, 2);
  stitches(p, 2, 2, 2, S - 3, 2, 2); stitches(p, S - 3, 2, S - 3, S - 3, 2, 2);
  if (on) for (let i = 1; i < S - 1; i++) { p.set(i, 1, BRASS[4]); p.set(1, i, BRASS[4]); }
  return p;
}

/** A tool / gear sleeve on the bag's side: a leather pocket, stitched, two rivets. 9-slice 6 on 18. */
function sleeveFrame(on = false) {
  const S = 18;
  const t = leatherTile(on ? LEATHER : LEATHER_D, on ? 17 : 15, 32);
  const p = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = t.get(x, y);
    if (y < 3) c = shadeC(c, 0.55 + y * 0.12); // the opening
    if (on) c = mixC(c, 0xffd890, 0.12);
    p.set(x, y, c);
  }
  for (let i = 0; i < S; i++) { p.set(i, S - 1, 0x1a0c06); p.set(0, i, 0x1a0c06); p.set(S - 1, i, 0x1a0c06); }
  for (let i = 1; i < S - 1; i++) p.set(i, 3, shadeC(p.get(i, 3), 1.25)); // the turned lip
  stitches(p, 2, 5, 2, S - 3, 2, 1); stitches(p, S - 3, 5, S - 3, S - 3, 2, 1); stitches(p, 2, S - 3, S - 3, S - 3, 2, 1);
  rivet(p, 1, 3); rivet(p, S - 5, 3);
  if (on) for (let i = 0; i < S; i++) { p.set(i, 0, BRASS[4]); }
  return p;
}

/** A hotbar loop: a leather strap loop, stitched, riveted; lit: a brass trim. 9-slice 6 on 16. */
function loopFrame(on = false) {
  const S = 16;
  const t = leatherTile(LEATHER, on ? 21 : 19, 32);
  const p = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = shadeC(t.get(x, y), 0.55);
    if (y > S - 4 || x < 2 || x > S - 3) c = t.get(x, y); // the strap's sides stand proud
    p.set(x, y, c);
  }
  const rim = on ? BRASS[4] : 0x1a0c06, rim2 = on ? BRASS[2] : 0x2a160a;
  for (let i = 0; i < S; i++) { p.set(i, 0, rim); p.set(i, S - 1, rim); p.set(0, i, rim); p.set(S - 1, i, rim); }
  for (let i = 1; i < S - 1; i++) { p.set(i, 1, rim2); p.set(1, i, rim2); }
  stitches(p, 3, S - 3, S - 4, S - 3, 2, 1);
  rivet(p, 1, S - 6); rivet(p, S - 5, S - 6);
  return p;
}

/** A brass buckle on a strap end (the flap's straps). */
function buckle() {
  const p = new Px(22, 30);
  const t = leatherTile(LEATHER_D, 23, 32);
  for (let y = 0; y < 30; y++) for (let x = 5; x < 17; x++) p.set(x, y, x === 5 || x === 16 ? 0x1a0c06 : x === 6 ? shadeC(t.get(x, y), 1.3) : t.get(x, y));
  stitches(p, 8, 0, 8, 10, 2, 1); stitches(p, 13, 0, 13, 10, 2, 1);
  // the buckle frame
  for (let y = 14; y < 26; y++) for (let x = 1; x < 21; x++) {
    const d = Math.min(x - 1, y - 14, 20 - x, 25 - y);
    if (d > 2) continue;
    p.set(x, y, tone(BRASS, d === 0 ? 0.25 : d === 1 ? (x + y < 30 ? 0.95 : 0.7) : 0.45));
  }
  for (let y = 15; y < 25; y++) { p.set(11, y, BRASS[y < 19 ? 5 : 3]); } // the prong
  rivet(p, 9, 8);
  p.outline(0x140a04);
  return p;
}

const sp = (key, fn) => art('pk:' + key, fn);
export const PACK_ART = {
  leather: () => sp('leather', () => leatherTile(LEATHER, 3)),
  flapLeather: () => sp('flapLeather', () => leatherTile(LEATHER_D, 29)),
  canvas: () => sp('canvas', () => canvasTile()),
  edge: () => sp('edge', edgeFrame),
  pocket: (on = false) => sp('pocket' + (on ? 1 : 0), () => pocketFrame(on)),
  sleeve: (on = false) => sp('sleeve' + (on ? 1 : 0), () => sleeveFrame(on)),
  loop: (on = false) => sp('loop' + (on ? 1 : 0), () => loopFrame(on)),
  buckle: () => sp('buckle', buckle),
  rivet: () => sp('rivet', () => { const p = new Px(4, 4); rivet(p, 0, 0); return p; }),
};

/** Publish the art as --pk-* custom properties on a node (the backpack root, or :root for the HUD). */
export function installPackArt(node) {
  const u = (k, v) => node.style.setProperty('--pk-' + k, `url("${v}")`);
  u('leather', PACK_ART.leather()); u('flap', PACK_ART.flapLeather()); u('canvas', PACK_ART.canvas()); u('edge', PACK_ART.edge());
  u('pocket', PACK_ART.pocket(false)); u('pocketOn', PACK_ART.pocket(true));
  u('sleeve', PACK_ART.sleeve(false)); u('sleeveOn', PACK_ART.sleeve(true));
  u('loop', PACK_ART.loop(false)); u('loopOn', PACK_ART.loop(true));
  u('buckle', PACK_ART.buckle()); u('rivet', PACK_ART.rivet());
}
