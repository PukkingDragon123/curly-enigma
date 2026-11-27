// The loading screen (wave 20): a tiny 3D scene in a cave niche. The game's own voxel pickaxe, in
// the gloved fist, swings at a voxel ore clump: a wind-up, a snap, the hit held two frames, voxel
// chips, sparks and a little dust. As the load goes on, crust wedges come off until the ore is
// bare and gleams. No words. The scene itself is ./oreLoader3d.js (pick from fps/viewmodel, clump
// from deep/clumps); if WebGL can't be had (or the game's context is lost), the old 2D vignette
// below (two gloved mole paws chipping a clump) stands in, with the same API.
//
// It has to keep moving while the page is busy building a scene, so nothing here animates from
// script: the whole loop is drawn once (per page) into a sprite sheet, rows = how clean the ore
// is, columns = the frames of the strike. A CSS steps() transform walks the columns (the
// compositor runs it even while the main thread is stuck); set(k) picks the row, and a stage
// change pops a few flakes (CSS too). The 3D sheet's first row is baked at once (it shows in the
// first frame), the rest in small slices between the build's own steps; its WebGL context is let go
// as soon as the sheet is done, or when the last loader on screen ends.
//
//   const L = oreLoader(host, { mode: 'full' | 'dark' | 'corner', appear, delay, auto, label })
//   L.set(k)  progress 0..1 (never goes back)    L.bump()  a nudge (a build step with no count)
//   L.done()  clean the ore, gleam, fade out     L.remove()  same as done()    L.el  the element
// opts.appear: seconds before it fades in, as a CSS delay; opts.delay: ms before it is put up at
// all (a quick load never flashes it); opts.auto: false stops it creeping on by itself while nobody
// calls set() (opts.tau: how slowly, s); opts.through: clicks go through it.
import { el } from '../core/util.js';
import { Bake3D, G3 } from './oreLoader3d.js';
import { paintGrip } from './gripHand.js';
import { OUTLINE } from './palette.js';
const OUT_HEX = typeof OUTLINE === 'number' ? OUTLINE : parseInt(String(OUTLINE).replace('#', ''), 16);

const W = 96, H = 64, F = 12, S = 8; // frame size (art px), frames in the loop, cleanliness stages
const CX = 48, CY = 35, RX = 19, RY = 15, FLOOR = 50; // the clump
const PR = [63, 27], PL = [33, 27]; // where the claws bite (right paw, left paw)
const HIT_R = 2; // the frame the pick bites on

const C32 = (hex, a = 255) => (((a & 255) << 24) | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >>> 16) & 0xff)) >>> 0;
const P = (list) => list.map((h) => C32(h));
const ROCK = P([0x0b0706, 0x160f0c, 0x231813, 0x30221a, 0x403022, 0x56402c, 0x6e5236]);
const CRUST = P([0x17110f, 0x2e2622, 0x473b33, 0x615244, 0x7d6b56, 0x9c876a, 0xbca784]);
const ORE = P([0x3a1a06, 0x7a3a0a, 0xb86010, 0xe89624, 0xffc84a, 0xffe890, 0xfffbe0]);
const FUR = P([0x120c12, 0x281e26, 0x3e323a, 0x5a4c54, 0x84747a]); // (velvet grey: it reads against the brown rock)
const MOSS = P([0x1e2c10, 0x3c5a1a, 0x6a8a2a]);
const BLUE = P([0x0a2440, 0x16508a, 0x2e98da, 0x9ae6ff]);
const BRASS = P([0x3a2410, 0x7a5420, 0xc49440, 0xf0d070]);
const LINE = C32(0x0d0706), SPARK = P([0xfffbe0, 0xffd84a, 0xff9a2a, 0xc04a10]);

function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Nearest and second-nearest of a point set: [index, d1, d2]. */
const VR = [0, 0, 0];
function voro(pts, x, y) {
  let i0 = 0, d1 = 1e9, d2 = 1e9;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], dx = x - p[0], dy = (y - p[1]) * 1.15, d = dx * dx + dy * dy;
    if (d < d1) { d2 = d1; d1 = d; i0 = i; } else if (d < d2) d2 = d;
  }
  VR[0] = i0; VR[1] = Math.sqrt(d1); VR[2] = Math.sqrt(d2);
  return VR;
}

// ------------------------------------------------------------------ the still parts
function makeScene() {
  const N = W * H;
  const sc = { wall: new Float32Array(N), inNiche: new Uint8Array(N), floor: new Uint8Array(N), glow: new Float32Array(N), blue: new Float32Array(N), deco: new Uint32Array(N),
    outer: new Uint8Array(N), ore: new Uint8Array(N), cell: new Int16Array(N), crack: new Uint8Array(N), crustTone: new Float32Array(N), oreTone: new Uint8Array(N), thr: [] };
  const rng = (i, k) => hash(i, k, 917);
  // the niche: a ragged hole in the dark
  const plates = []; for (let i = 0; i < 40; i++) plates.push([rng(i, 1) * W, rng(i, 2) * H, rng(i, 3)]);
  const pebbles = []; for (let i = 0; i < 70; i++) pebbles.push([rng(i, 4) * W, FLOOR - 2 + rng(i, 5) * 16, rng(i, 6)]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, dx = (x - CX) / 46, dy = (y - 33) / (y > 33 ? 34 : 30);
    const a = Math.atan2(dy, dx);
    const e = 1 - Math.hypot(dx, dy) + (vnoise(Math.cos(a) * 3 + 9, Math.sin(a) * 3 + 9, 3) - 0.5) * 0.22 + (hash(x >> 1, y >> 1, 5) - 0.5) * 0.04;
    if (e <= 0) continue;
    sc.inNiche[i] = e < 0.035 ? 2 : 1;
    const fl = FLOOR - 1 + Math.round(vnoise(x * 0.18, 1, 8) * 3);
    let t;
    if (y >= fl) { // the rubble floor: pebbles lit from the top left
      sc.floor[i] = 1;
      const [k, d1, d2] = voro(pebbles, x, y);
      t = 0.28 + pebbles[k][2] * 0.22 - (d2 - d1 < 0.9 ? 0.18 : 0) + (d1 < 1.2 && x < pebbles[k][0] ? 0.12 : 0) - (y - fl) * 0.012;
    } else { // the back wall: plates with one-pixel cracks, darker into the rock
      const [k, d1, d2] = voro(plates, x, y);
      t = 0.2 + plates[k][2] * 0.2 + (vnoise(x * 0.3, y * 0.3, 11) - 0.5) * 0.12 - (d2 - d1 < 1.0 ? 0.16 : 0) + (d2 - d1 < 2.0 && x - plates[k][0] < 0 ? 0.06 : 0);
    }
    t *= 0.45 + Math.min(1, e * 4) * 0.55;
    sc.wall[i] = t;
    const lx = x - 23, ly = y - 12; // the lantern's light, and the clump's
    sc.glow[i] = Math.max(0, 1 - Math.hypot(lx, ly * 1.2) / 20) * 0.5;
    for (const [bx, by] of [[40, 56], [57, 57]]) sc.blue[i] = Math.max(sc.blue[i], Math.max(0, 1 - Math.hypot(x - bx, (y - by) * 1.3) / 9));
  }
  // roots hanging from the roof, a mossy lip
  for (let r = 0; r < 9; r++) {
    let x = 8 + rng(r, 7) * 80, len = 4 + rng(r, 8) * 11;
    let y = 0; while (y < H && !sc.inNiche[y * W + Math.round(x)]) y++;
    for (let k = 0; k < len && y < H; k++, y++) {
      x += (hash(r, k, 9) - 0.5) * 0.9;
      const i = y * W + Math.round(x);
      if (sc.inNiche[i]) sc.deco[i] = k === len - 1 ? FUR[2] : (k & 1 ? FUR[3] : FUR[2]);
      if (k < 3 && sc.inNiche[i + 1]) sc.deco[i + 1] = MOSS[k === 0 ? 2 : 1];
    }
  }
  // the lantern on a root: chain, brass cap, glowing panes
  for (let y = 3; y < 9; y++) sc.deco[y * W + 23] = y & 1 ? BRASS[1] : BRASS[0];
  for (let y = 9; y < 17; y++) for (let x = 20; x < 27; x++) {
    const i = y * W + x, edge = x === 20 || x === 26 || y === 9 || y === 16;
    sc.deco[i] = edge ? (y === 9 || x === 20 ? BRASS[3] : BRASS[1]) : (x === 23 ? BRASS[2] : y < 12 ? ORE[6] : y < 14 ? ORE[5] : ORE[4]);
  }
  sc.deco[8 * W + 22] = BRASS[2]; sc.deco[8 * W + 24] = BRASS[2]; sc.deco[17 * W + 23] = BRASS[1]; sc.deco[17 * W + 22] = BRASS[0];
  // two blue glowcaps on the floor
  for (const [bx, by, w, h] of [[39, 57, 4, 3], [46, 59, 2, 2], [57, 58, 3, 3], [63, 57, 2, 2]]) {
    for (let y = by - 1; y <= by + 3; y++) for (let x = bx; x < bx + 2; x++) sc.deco[y * W + x] = x === bx ? C32(0xe0d8c4) : C32(0x9a9080);
    for (let r = 0; r < h; r++) for (let x = bx - w + r; x <= bx + 1 + w - r; x++) {
      const y = by - 1 - r, i = y * W + x;
      if (r === h - 1 && (x === bx - w + r || x === bx + 1 + w - r) && w > 2) continue;
      sc.deco[i] = r === 0 ? (x === bx - w || x === bx + 1 + w ? BLUE[0] : BLUE[1]) : x < bx ? BLUE[3] : BLUE[2];
      if (r > 0 && hash(x, y, 4) < 0.22) sc.deco[i] = C32(0xe8fbff);
    }
  }
  // the clump: an outer crust and the ore inside it (2 px in), crust plates with a bite order
  const cells = [];
  for (let i = 0; i < 26; i++) {
    const a = rng(i, 10) * Math.PI * 2, r = Math.sqrt(rng(i, 11));
    cells.push([CX + Math.cos(a) * r * RX, CY + Math.sin(a) * r * RY * 0.9, rng(i, 12)]);
  }
  // the crust nearest the claws goes first; the middle of the face last but one
  sc.thr = cells.map((c, i) => {
    const dR = Math.hypot(c[0] - PR[0], c[1] - PR[1]), dL = Math.hypot(c[0] - PL[0], c[1] - PL[1]);
    return clamp(0.06 + Math.min(dR, dL) / 34 * 0.7 + rng(i, 13) * 0.3, 0.06, 0.97);
  });
  // (a slit of ore already shows at the start: the glow is the first thing you see)
  const near = cells.map((c, i) => [Math.hypot(c[0] - PR[0], c[1] - PR[1]), i]).sort((a, b) => a[0] - b[0]);
  sc.thr[near[0][1]] = 0;
  const facets = []; for (let i = 0; i < 12; i++) { const a = rng(i, 14) * 6.283, r = Math.sqrt(rng(i, 15)); facets.push([CX + Math.cos(a) * r * RX, CY + Math.sin(a) * r * RY, rng(i, 16)]); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, dx = (x - CX) / RX, dy = (y - CY) / RY, a = Math.atan2(dy, dx);
    const lump = (vnoise(Math.cos(a) * 2.2 + 4, Math.sin(a) * 2.2 + 4, 21) - 0.5) * 0.34 + (hash(Math.round(a * 9), 0, 22) - 0.5) * 0.06;
    const d = Math.hypot(dx, dy) - lump;
    if (d >= 1 || y > FLOOR + 1) continue;
    sc.outer[i] = 1;
    if (d < 1 - 2.2 / RX) {
      sc.ore[i] = 1;
      const [k, d1, d2] = voro(facets, x, y);
      const nx = Math.cos(facets[k][2] * 6.283), ny = Math.sin(facets[k][2] * 6.283);
      let t = 3 + Math.round(clamp(-nx * 0.7 - ny * 0.7, -1, 1) * 1.2) + (d < 0.35 ? 1 : 0);
      if (d2 - d1 < 0.9) t = 1; else if (d2 - d1 < 1.8 && x < facets[k][0]) t += 1;
      sc.oreTone[i] = clamp(t, 0, 6);
    }
    const [k, d1, d2] = voro(cells, x, y);
    sc.cell[i] = k;
    sc.crack[i] = d2 - d1 < 1.0 ? 1 : 0;
    const lit = (x - cells[k][0]) < 0 && (y - cells[k][1]) < 0 ? 0.12 : 0;
    sc.crustTone[i] = 0.32 + cells[k][2] * 0.22 + lit - Math.max(0, dx + dy) * 0.16 + (vnoise(x * 0.5, y * 0.5, 23) - 0.5) * 0.12 + (hash(x, y, 24) < 0.05 ? 0.12 : 0);
  }
  return sc;
}

/** One cleanliness stage (c 0..1): the niche, the crust left, the ore showing. */
function drawStage(sc, c) {
  const out = new Uint32Array(W * H), vis = new Uint8Array(W * H);
  const glowAmt = 0.25 + c * 0.75;
  const crustOn = (i) => sc.outer[i] && sc.thr[sc.cell[i]] > c + 0.001 && c < 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!sc.inNiche[i]) continue;
    const dc = Math.hypot(x - CX, (y - CY) * 1.25);
    const warm = Math.max(0, 1 - dc / 44) * glowAmt * 0.55 + sc.glow[i];
    let col = ROCK[clamp(Math.round((sc.wall[i] + warm * 0.55) * 7), 0, 6)];
    if (sc.inNiche[i] === 2) col = ROCK[0];
    if (sc.deco[i]) col = sc.deco[i];
    else if (sc.blue[i] > 0.35 && !sc.floor[i] && hash(x, y, 30) < sc.blue[i] * 0.25) col = BLUE[1];
    else if (sc.blue[i] > 0.5 && sc.floor[i]) col = sc.wall[i] > 0.3 ? BLUE[1] : col;
    if (sc.outer[i]) {
      if (crustOn(i)) {
        let t = sc.crustTone[i] + glowAmt * 0.06;
        if (sc.crack[i]) t -= 0.22;
        // a broken lip where a neighbour plate has come away (lit on its open side)
        const open = (j) => sc.outer[j] && !crustOn(j);
        if (open(i - 1) || open(i - W)) t += 0.2; else if (open(i + 1) || open(i + W)) t -= 0.12;
        if (!sc.crack[i]) {
          t += Math.sin(y * 1.3 + sc.cell[i] * 2.1) > 0.75 ? 0.06 : 0; // strata in each plate
          if (sc.crack[i - W] || sc.crack[i - 1]) t += 0.1; // the crack's far lip catches the light
          if (hash(x - 1, y - 1, 33) < 0.05) t += 0.12; // just under a pit: its lit rim
        }
        if (hash(x, y, 33) < 0.05 && !sc.crack[i]) t = 0.12; // pits and chip scars
        col = CRUST[clamp(Math.round(t * 7), 0, 6)];
        if (!sc.crack[i] && hash(x, y, 31) < 0.03 && y < CY) col = MOSS[1 + (hash(x, y, 32) < 0.5 ? 1 : 0)];
        vis[i] = 1;
      } else if (sc.ore[i]) {
        let t = sc.oreTone[i] - 1 + Math.round(glowAmt * 1.4);
        if (crustOn(i - 1 - W) || crustOn(i - W)) t -= 2; // the crust's shadow
        col = ORE[clamp(t, 0, 6)];
        vis[i] = 2;
      }
    }
    out[i] = col;
  }
  // a dark outline round what is left of the clump
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (vis[i] || !sc.inNiche[i]) continue;
    if (vis[i - 1] || vis[i + 1] || vis[i - W] || vis[i + W]) out[i] = LINE;
  }
  return { px: out, vis };
}

// ------------------------------------------------------------------ the moving parts
function drawBite(buf, sc, vis, c, px, py, t, seed) {
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < W && y < H && sc.inNiche[y * W + x]) buf[y * W + x] = col; };
  if (t === 0) { // the flash: a white core, yellow rays
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(px + dx, py + dy, SPARK[0]);
    for (let r = 2; r < 5; r++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(px + 0.5 + dx * r, py + 0.5 + dy * r, r < 3 ? SPARK[1] : SPARK[2]);
    for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) put(px + 0.5 + dx * 2, py + 0.5 + dy * 2, SPARK[1]);
    return;
  }
  const out = px < CX ? -1 : 1;
  // dust: a soft grey puff that grows and thins
  if (t <= 4) for (let k = 0; k < 10; k++) {
    const a = hash(k, seed, 51) * 6.283, r = (1 + t * 1.3) * Math.sqrt(hash(k, seed, 52));
    if (hash(k, t, seed) < t * 0.18) continue;
    put(px + out * t * 0.8 + Math.cos(a) * r, py - t * 0.6 + Math.sin(a) * r * 0.7, CRUST[t < 3 ? 4 : 3]);
  }
  // chips: little two-pixel bits of crust (and of ore, the cleaner it gets), arcing off
  for (let k = 0; k < 11; k++) {
    const a = -Math.PI / 2 + out * (0.25 + hash(k, seed, 53) * 1.25), v = 2.2 + hash(k, seed, 54) * 2.4;
    const x = Math.round(px + Math.cos(a) * v * t), y = Math.round(py + Math.sin(a) * v * t + 0.55 * t * t);
    if (y > FLOOR + 6 || t > 6) continue;
    const oreChip = hash(k, seed, 55) < c * 0.6;
    const pal = oreChip ? ORE : CRUST, big = k % 4 === 0 ? 3 : k % 3 === 0 ? 1 : 2, spin = (t + k) & 3;
    // a tumbling chunk: lit top-left, shaded bottom-right, an outline on its underside
    for (let j = 0; j < big; j++) for (let i = 0; i < big + (spin & 1); i++) {
      if (big === 3 && ((i === 0 && j === 0 && spin > 1) || (i === big && j === big - 1))) continue;
      put(x + i, y + j, pal[i + j === 0 ? 6 : i + j >= big ? 2 : 4]);
    }
    for (let i = 0; i < big + (spin & 1); i++) put(x + i, y + big, LINE);
  }
  // sparks: quick and bright, a plus at first, a dot after
  if (t <= 3) for (let k = 0; k < 7; k++) {
    const a = -Math.PI / 2 + out * (hash(k, seed, 56) * 1.9 - 0.4), v = 3.4 + hash(k, seed, 57) * 2.6;
    const x = px + Math.cos(a) * v * t, y = py + Math.sin(a) * v * t + 0.35 * t * t;
    put(x, y, SPARK[t - 1]);
    if (t === 1) { put(x + 1, y, SPARK[1]); put(x - 1, y, SPARK[1]); put(x, y + 1, SPARK[1]); put(x, y - 1, SPARK[1]); }
  }
}


function drawFrame(buf, sc, st, c, f) {
  const { vis } = st;
  // the ore breathes; a gleam runs over it once a loop; glints twinkle on its facets
  const pulse = f % 6 < 3 ? 1 : 0;
  const band = f >= 9 ? 18 + (f - 9) * 14 : -99;
  for (let y = CY - RY - 4; y <= FLOOR + 1; y++) for (let x = CX - RX - 4; x <= CX + RX + 4; x++) {
    const i = y * W + x;
    if (vis[i] !== 2) continue;
    const g = x + y * 0.6 - CX + RX;
    if (Math.abs(g - band) < 1.2) buf[i] = ORE[6];
    else if (Math.abs(g - band) < 3) buf[i] = ORE[5];
    else if (pulse && sc.oreTone[i] >= 4 && hash(x, y, f) < 0.08) buf[i] = ORE[5];
  }
  for (const [gx, gy, ph] of [[44, 31, 0], [53, 38, 4], [40, 40, 8], [57, 29, 2]]) {
    if (vis[gy * W + gx] !== 2 || (f + ph) % 12 > 2) continue;
    const big = (f + ph) % 12 === 1;
    buf[gy * W + gx] = ORE[6];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) buf[(gy + dy) * W + gx + dx] = big ? ORE[6] : ORE[5];
    if (big) for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) buf[(gy + dy) * W + gx + dx] = ORE[5];
  }
  // the bite, then the pick in the gloved fist over it
  const [idx, col] = pickLayer(f);
  const t = (f - HIT_R + F) % F;
  if (t <= 6) drawBite(buf, sc, vis, c, TIP[0], TIP[1], t, 1);
  for (let j = 0; j < idx.length; j++) buf[idx[j]] = col[j];
}
// The pick, swung from a shoulder off the bottom-right corner: the arm's angle (deg) by frames since
// the hit (the hit, a rebound, the wind-up slowing, held, the snap); the wrist cocks the head back further.
const SWING = [0, -4, 5, 13, 21, 27, 31, 33, 34, 34, 22, 7];
const SHO = [118, 96], GRIP = [73, 41], HDIR = [-0.3, -0.95], HLEN = 13; // the impact pose
const WOOD = [0x24120a, 0x3e2210, 0x5c3418, 0x7a4822, 0x96602e]; // the handle (darker than the glove's tan)
const IRON = [0x221e28, 0x3c3844, 0x5c5864, 0x85818c, 0xb4b0ba, 0xe8e4ee];
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
/** Where the pick's point is in the pose for arm angle a (deg). */
function pickPose(a) {
  const r = a * Math.PI / 180, [gx, gy] = rot(GRIP[0] - SHO[0], GRIP[1] - SHO[1], r * 0.22), [dx, dy] = rot(HDIR[0], HDIR[1], r * 1.6);
  const g = [SHO[0] + gx, SHO[1] + gy], hd = [g[0] + dx * HLEN, g[1] + dy * HLEN], p = [dy, -dx]; // (p: the point's side, toward the ore)
  const tip = [hd[0] + p[0] * 8 - dx * 2.2, hd[1] + p[1] * 8 - dy * 2.2];
  return { g, d: [dx, dy], hd, p, tip };
}
const TIP = pickPose(0).tip.map(Math.round);
const PICKS = [];
/** The pick and the fist in frame f (the same at every stage: drawn once): [indices, colours]. */
function pickLayer(f) {
  if (PICKS[f]) return PICKS[f];
  const { g, d, hd, p } = pickPose(SWING[(f - HIT_R + F) % F]);
  const px = new Map();
  // the pick, per pixel: an ash handle with its grain, an iron head (a collar, the curved point, a
  // short butt), lit from the top left, then the plum outline round it
  const own = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rx = x + 0.5 - g[0], ry = y + 0.5 - g[1], u = rx * d[0] + ry * d[1], v = rx * p[0] + ry * p[1];
    let c = -1;
    const hx = x + 0.5 - hd[0], hy = y + 0.5 - hd[1], hu = hx * d[0] + hy * d[1], hv = hx * p[0] + hy * p[1];
    // the head: the point curving down toward the ore, the butt behind, the collar round the eye
    if (hv > -0.5 && hv < 8.5) {
      const t = hv / 8.5, mid = -2.2 * t * t, half = 1.9 * (1 - t) + 0.35;
      if (Math.abs(hu - mid) < half) c = hu - mid > half * 0.35 ? IRON[5 - (t > 0.8 ? 1 : 0)] : hu - mid > -half * 0.3 ? IRON[3] : IRON[1];
    } else if (hv <= -0.5 && hv > -4.6) {
      const half = 1.5 - (-hv - 0.5) * 0.12;
      if (Math.abs(hu) < half) c = hu > half * 0.3 ? IRON[4] : hu > -half * 0.4 ? IRON[2] : IRON[1];
    }
    if (c < 0 && Math.abs(hu) < 2.3 && Math.abs(hv) < 1.9) c = hu > 0.8 ? IRON[3] : IRON[2]; // the collar
    // the handle, from below the fist up into the head; a lit stripe, grain dashes
    if (c < 0 && u > -9 && u < HLEN - 1 && Math.abs(v) < 1.25) {
      const side = v * (p[0] * -0.62 + p[1] * -0.78) > 0 ? 1 : 0;
      c = side ? WOOD[4] : Math.abs(v) < 0.45 ? WOOD[3] : WOOD[2];
      if (!side && ((Math.round(u) % 5) === 0)) c = WOOD[1];
      if (u < -8) c = WOOD[1]; // the butt end
    }
    if (c >= 0) own.set(y * W + x, c);
  }
  for (const [i, c] of own) px.set(i, c);
  for (const i of own.keys()) for (const o of [1, -1, W, -W]) {
    const j = i + o;
    if (j >= 0 && j < W * H && !own.has(j) && Math.abs((j % W) - (i % W)) <= 1) px.set(j, OUT_HEX);
  }
//  // the gloved fist round the handle, the arm in from the corner (./gripHand.js, the same as the 3D)
//  paintGrip((x, y, c) => px.set(y * W + x, c), { gx: g[0], gy: g[1], dx: d[0], dy: d[1], ax: SHO[0], ay: SHO[1], k: 0.85, w: W, h: H });
  const idx = [], col = [];
  for (const [i, c] of px) { idx.push(i); col.push(C32(c)); }
  return (PICKS[f] = [Int32Array.from(idx), Uint32Array.from(col)]);
}

// The sheet: the first row (the crusted ore) is drawn at once, the cleaner rows bit by bit after
// (between the build's own steps), and every loader on screen gets each row as it's done.
const G2 = { W, H, F, S, dur: 1.05, cx: CX, cy: CY, rx: RX, ry: RY };
let SHEET = null, SC = null, G = G2, KIND = '', BAKE = null, built = 0, br = 0, bf = 0, building = 0; // (br, bf: the 3D frame baked next)
const LIVE = new Set();
const rowDone = (s) => { built = Math.max(built, s + 1); for (const L of LIVE) L.row(s); };
function drawRow(s) {
  const c = SHEET, cl = s / (S - 1), st = drawStage(SC, cl);
  const img = c.getContext('2d').createImageData(W * F, H);
  const out = new Uint32Array(img.data.buffer), buf = new Uint32Array(W * H);
  for (let f = 0; f < F; f++) {
    buf.set(st.px);
    drawFrame(buf, SC, st, cl, f);
    for (let y = 0; y < H; y++) out.set(buf.subarray(y * W, y * W + W), y * W * F + f * W);
  }
  c.getContext('2d').putImageData(img, 0, s * H);
  rowDone(s);
}
/**
 * The 3D scene can be had: not switched off (?loader3d=0), the game's own WebGL isn't lost, and it
 * isn't a software rasterizer (SwiftShader, llvmpipe: there the bake would slow the very load it
 * shows; ?loader3d=1 forces it on for shots).
 */
function want3d() {
  try {
    if (/[?&]loader3d=0\b/.test(location.search)) return false;
    const eng = window.__game?.engine;
    if (eng && (eng.contextLost || eng.renderer?.getContext?.()?.isContextLost?.())) return false;
    return !eng?.softwareGL || /[?&]loader3d=1\b/.test(location.search);
  } catch (e) { return false; }
}
/** Let the 3D scene's GPU resources and context go. */
function dropBake() {
  const b = BAKE;
  BAKE = null;
  if (b) b.dispose();
}
/** Bake 3D frames for about `ms`; on any failure the rows left become copies of the last good one. */
function bake3d(ms) {
  const t0 = performance.now(), ctx = SHEET.getContext('2d');
  try {
    if (!BAKE) BAKE = new Bake3D();
    do {
      BAKE.frame(ctx, br, bf, bf * G.W, br * G.H);
      if (++bf >= G.F) { bf = 0; rowDone(br++); }
    } while (br < G.S && performance.now() - t0 < ms);
  } catch (e) {
    console.warn('[loader]', e);
    dropBake();
    bf = 0; br = G.S;
    while (built < G.S) {
      ctx.drawImage(SHEET, 0, (built - 1) * G.H, G.W * G.F, G.H, 0, built * G.H, G.W * G.F, G.H);
      rowDone(built);
    }
  }
  if (br >= G.S) dropBake();
}
function sheet() {
  if (!SHEET && want3d()) {
    try {
      BAKE = new Bake3D();
      G = G3; KIND = '3d';
      SHEET = document.createElement('canvas');
      SHEET.width = G.W * G.F; SHEET.height = G.H * G.S;
      const ctx = SHEET.getContext('2d');
      // the first frame now (it's on screen this frame), standing in for the whole loop until the
      // rest of the first row is baked a moment later
      BAKE.frame(ctx, 0, 0, 0, 0);
      for (let f = 1; f < G.F; f++) ctx.drawImage(SHEET, 0, 0, G.W, G.H, f * G.W, 0, G.W, G.H);
      br = 0; bf = 1;
      rowDone(0);
    } catch (e) {
      console.warn('[loader] no 3D loader, the 2D one instead:', e);
      dropBake();
      SHEET = null; built = 0; br = 0; bf = 0;
    }
  }
  if (!SHEET) {
    G = G2; KIND = '2d';
    SHEET = document.createElement('canvas');
    SHEET.width = W * F; SHEET.height = H * S;
    SC = makeScene();
    drawRow(0);
  }
  if ((KIND === '3d' ? br : built) < G.S && !building) {
    const next = () => {
      building = 0;
      if (KIND === '3d') {
        if (!LIVE.size) { dropBake(); return; } // nobody watching: the next loader picks it up again
        bake3d(10);
      } else {
        try { drawRow(built); } catch (e) { console.warn('[loader]', e); while (built < S) { SHEET.getContext('2d').drawImage(SHEET, 0, (built - 1) * H, W * F, H, 0, built * H, W * F, H); rowDone(built); } return; }
      }
      if ((KIND === '3d' ? br : built) < G.S) building = setTimeout(next, 0);
    };
    building = setTimeout(next, 0);
  }
  return SHEET;
}

// ------------------------------------------------------------------ the DOM
let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const css = `
.ol-back{position:absolute;inset:0;z-index:7;pointer-events:auto;background:radial-gradient(ellipse at 50% 46%,#24150e 0,#100906 55%,#060304 100%);display:grid;place-items:center;transition:opacity .3s ease}
.ol-back.d3{background:var(--pal-ink, #1e1424)}
.ol-back.out,.ol-back.thru{pointer-events:none}.ol-back.out{opacity:0}
.ol-view{position:relative;overflow:hidden;width:var(--ol-w);height:var(--ol-h);animation:olPop .32s cubic-bezier(.3,1.6,.5,1) both;filter:drop-shadow(0 0 calc(var(--ol-s) * 8) #ff9a3a2a)}
.d3 .ol-view{filter:none}
.ol-row{position:absolute;left:0;top:0;transform:translateY(calc(var(--ol-h) * var(--ol-r, 0) * -1))}
.ol-strip{display:block;width:calc(var(--ol-w) * var(--ol-f));height:calc(var(--ol-h) * var(--ol-n));image-rendering:pixelated;animation:olRun var(--ol-dur) steps(var(--ol-f)) infinite;will-change:transform}
.ol-flake{position:absolute;left:var(--x);top:var(--y);width:calc(var(--ol-s) * 2);height:calc(var(--ol-s) * 2);background:var(--c);box-shadow:var(--ol-s) var(--ol-s) 0 #0d0706;animation:olFlake .6s cubic-bezier(.3,.6,.6,1) forwards;pointer-events:none}
.ol-view.gleam .ol-row{animation:olGleam .4s ease-out both}
.ol-back.dark{background:#000}
.ol-back.dark .ol-view{position:absolute;bottom:calc(var(--sab, 0px) + var(--px) * 12);filter:brightness(.55) saturate(.8)}
.ol-back.corner{background:none;pointer-events:none;display:block}
.ol-back.corner .ol-view{position:absolute;right:calc(var(--sar, 0px) + var(--px) * 8);bottom:calc(var(--sab, 0px) + var(--px) * 8);filter:drop-shadow(0 0 calc(var(--ol-s) * 3) #000a)}
.is-touch .ol-back.corner .ol-view{right:auto;bottom:auto;left:50%;top:calc(var(--sat, 0px) + var(--px) * 8);margin-left:calc(var(--ol-w) * -.5)}
.ol-back.late{opacity:0;animation:olIn .2s ease-out var(--ol-in, .5s) forwards}
.ol-back.late.out{animation:none;opacity:0}
@keyframes olIn{to{opacity:1}}
@keyframes olRun{to{transform:translateX(-100%)}}
@keyframes olPop{0%{transform:scale(.6,.4)}60%{transform:scale(1.06,.96)}100%{transform:none}}
@keyframes olFlake{0%{transform:none;opacity:1}40%{transform:translate(calc(var(--dx) * .5),calc(var(--ol-s) * -7)) rotate(90deg)}100%{transform:translate(var(--dx),calc(var(--ol-s) * 14)) rotate(200deg);opacity:0}}
@keyframes olGleam{0%{filter:none}25%{filter:brightness(1.6) saturate(1.15)}100%{filter:none}}
@media (prefers-reduced-motion:reduce){.ol-strip{animation-duration:calc(var(--ol-dur) * 2.3)}}`;
  document.head.append(el('style', { 'data-ui': 'ore-loader' }, css));
}

/** Art px → CSS px: whole device pixels per art pixel, sized to the screen. */
function artScale(mode) {
  const dpr = window.devicePixelRatio || 1, vw = window.innerWidth || 800, vh = window.innerHeight || 600;
  const { W, H } = G; // (the 3D scene is finer: about the game's own pixel size)
  const fit = mode === 'corner' ? Math.min(vw * 0.24 / W, vh * 0.18 / H, 2) : mode === 'dark' ? Math.min(vw * 0.5 / W, vh * 0.3 / H, 3)
    : KIND === '3d' ? Math.min(vh * 0.42 / H, vw * 0.6 / W) : Math.min(Math.min(vw, vh) * 0.6 / H, vw * 0.92 / W, vh * 0.8 / H);
  return Math.max(1, Math.floor(fit * dpr)) / dpr;
}

/** A loader over `host` (see the top of this file). */
export function oreLoader(host, opts = {}) {
  const mode = opts.mode || 'full';
  let root = null, view = null, shown = false, gone = false, k = 0, row = -1, auto = 0, s = 2, live = null;
  const t0 = performance.now();
  const setRow = (r) => {
    r = Math.min(r, built - 1);
    if (!view || r <= row) return;
    const first = row < 0;
    row = r;
    view.style.setProperty('--ol-r', String(r));
    if (!first) flakes(r);
  };
  // a stage came away: a few bits of crust tumble off the clump
  const flakes = (r) => {
    try {
      for (let j = 0; j < 4 + (r >> 1); j++) {
        const a = Math.random() * Math.PI - Math.PI, rr = 0.7 + Math.random() * 0.3;
        const f = el('i', { class: 'ol-flake' });
        f.style.setProperty('--x', `${((G.cx + Math.cos(a) * G.rx * rr) * s).toFixed(1)}px`);
        f.style.setProperty('--y', `${((G.cy + Math.sin(a) * G.ry * rr) * s).toFixed(1)}px`);
        f.style.setProperty('--dx', `${(Math.cos(a) * (6 + Math.random() * 10) * s).toFixed(1)}px`);
        f.style.setProperty('--c', ['#7d6b56', '#9c876a', '#615244', '#e89624'][j & 3]);
        f.style.animationDelay = `${(j * 0.03).toFixed(2)}s`;
        view.append(f);
        setTimeout(() => f.remove(), 900);
      }
    } catch (e) { /* cosmetic */ }
  };
  const apply = () => setRow(Math.min(G.S - 1, Math.floor(k * (G.S - 1) + 0.0001)));
  const show = () => {
    if (shown || gone) return;
    shown = true;
    try {
      style();
      const strip = sheetCanvas();
      s = artScale(mode);
      const { W, H, F } = G;
      live = { row: (r) => { try { strip.getContext('2d').drawImage(SHEET, 0, r * H, W * F, H, 0, r * H, W * F, H); } catch (e) { /* lost */ } apply(); } };
      LIVE.add(live);
      view = el('div', { class: 'ol-view', 'aria-hidden': 'true' }, [el('div', { class: 'ol-row' }, [strip])]);
      view.style.setProperty('--ol-s', `${s}px`);
      view.style.setProperty('--ol-w', `${W * s}px`);
      view.style.setProperty('--ol-h', `${H * s}px`);
      view.style.setProperty('--ol-f', String(F));
      view.style.setProperty('--ol-n', String(G.S));
      view.style.setProperty('--ol-dur', `${G.dur}s`);
      root = el('div', { class: `ol-back ${mode}${KIND === '3d' ? ' d3' : ''}${opts.appear ? ' late' : ''}${opts.through ? ' thru' : ''}`, role: 'status', 'aria-label': opts.label || 'Loading' }, [view]);
      if (opts.appear) root.style.setProperty('--ol-in', `${opts.appear}s`);
      (host || document.body).append(root);
      apply();
    } catch (e) { console.warn('[loader]', e); }
  };
  const timerShow = opts.appear || !opts.delay ? (show(), 0) : setTimeout(show, opts.delay);
  // with nothing counting, the ore still comes clean bit by bit (never quite all the way)
  // (and a loader whose layer was cleared away under it lets go of its timer)
  auto = setInterval(() => {
    if (gone) return;
    if (shown && root && !root.isConnected) { api.done(); return; }
    if (opts.auto === false) return;
    const t = (performance.now() - t0) / 1000;
    const want = 0.82 * (1 - Math.exp(-t / (opts.tau || 6)));
    if (want > k) { k = want; apply(); }
  }, 250);
  const api = {
    get el() { return root; },
    set(p) {
      if (gone) return;
      const v = typeof p === 'number' ? p : p?.k;
      if (!(v >= 0)) return;
      if (!shown && performance.now() - t0 > 100) show();
      if (v > k) { k = Math.min(1, v); apply(); }
    },
    bump(n = 0.05) { api.set(k + (1 - k) * n); },
    done() {
      if (gone) return;
      gone = true;
      clearTimeout(timerShow); clearInterval(auto);
      LIVE.delete(live);
      if (!LIVE.size) dropBake(); // (the GPU side goes with the last loader; the sheet stays for the next)
      if (!root) return;
      try {
        setRow(G.S - 1);
        view.classList.add('gleam');
      } catch (e) { /* noop */ }
      // (it never stands in the way once done: clicks and touches go through at once, gone soon after)
      root.style.pointerEvents = 'none';
      root.setAttribute('aria-hidden', 'true');
      root.classList.add('out');
      const rm = () => root.remove();
      root.addEventListener('transitionend', rm, { once: true });
      setTimeout(rm, 380);
    },
    remove() { api.done(); },
  };
  return api;
}

/** A canvas showing the sheet (each loader its own copy; the drawing is shared). */
function sheetCanvas() {
  const src = sheet();
  const c = el('canvas', { class: 'ol-strip' });
  c.width = src.width; c.height = src.height;
  c.getContext('2d').drawImage(src, 0, 0);
  return c;
}

/** Debug / shots: the whole sheet's canvas (drawn now). */
export function oreSheet() {
  sheet();
  if (KIND === '3d') { while (br < G.S) bake3d(1e9); } else while (built < S) drawRow(built);
  return SHEET;
}
/** Debug: which loader this page has ('3d' | '2d' | '' before the first) and whether it still holds a WebGL context. */
export function oreLoaderInfo() { return { kind: KIND, built, rows: G.S, gpu: !!BAKE }; }
