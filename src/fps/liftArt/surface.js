// The top of the cross-section and the bottom of it. The top: a woodcut sky over the meadow (an old
// oak whose roots go down, the burrow's chimney pot smoking in the grass, the Surface Express shed),
// and under the turf two vignettes: Old Star's burrow (hearth and chimney, anvil, workbench and
// pegboard, herbs on the beam, the bed, shelves, a chalkboard, the round green door to the passage,
// the burrow's lift going down) and Deep Town (timbered houses with lit windows and chimneys, shop
// boards, a ledge street up a stair, one string of lamps, the town lift's headframe over its shaft).
// The bottom: the Core's crust and the lopsided glowing heart under everything.
import { makeNoise2D, makeRng, clamp } from '../../core/util.js';
import { Art, ZP, INK, INK2, CREAM, LAMP, WOOD, IRON, hash, mix, lump, lightPool, distField } from './kit.js';
import { ID, beam, cage, cable, sheave, lamp, board } from './props.js';
import { makeBands, rockPass, backPass } from './rock.js';

export const TOP_H = 156; // the meadow, home and Deep Town
export const CORE_H = 84; // the glowing heart under everything
export const GROUND = 46; // the grass line in the top section

const SKY = [0x3e4a78, 0x56658e, 0x7a86a2, 0xa8a8ac, 0xd2bc9c, 0xeccf98];
const LEAF = [0x1e2a24, 0x2e4632, 0x4a6a3c, 0x7a9450, 0xb4b866];
const GRASS = [0x2a3a22, 0x4a6a2c, 0x76943a, 0xa8b45a];
const ROOF = [0x3a1a1e, 0x7a2e26, 0xa84a32, 0xd0744a];
const PLASTER = [0x5a3a2a, 0x9a7a5a, 0xc4a478, 0xe6cc9a];
const STONE = [0x2e2832, 0x5a5258, 0x847a7a, 0xb4a89c];
const DOOR = [0x1e3a26, 0x2e5a32, 0x4a7e3e, 0x86a85a];

/** World x (m) → art x across the scene. */
export const ax = (W, x) => clamp(Math.round(((x + 96) / 192) * (W - 8) + 4), 3, W - 4);

/** A woodcut sky: flat bands, carved streaks where they meet, a lopsided sun, two rows of hills, far pines. */
function paintSky(W, h, gy, seed) {
  const pc = new Art(W, h);
  const n = makeNoise2D(seed * 3 + 1);
  const edges = SKY.map((_, i) => (gy * (i + 1)) / SKY.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) {
    let k = 0;
    const yy = y + n(x * 0.012, 0.5) * 3;
    while (k < SKY.length - 1 && yy > edges[k]) k++;
    // streaks: a band's colour runs into the next as long thin strokes
    const into = edges[k - 1] != null ? yy - edges[k - 1] : 99;
    let c = SKY[k];
    if (into < 3 && hash(Math.floor(x / (6 + (y % 3) * 3)), y, 5) < 0.55 - into * 0.15 && (y & 1)) c = SKY[k - 1];
    pc.p(x, y, c);
  }
  // the sun: lopsided, cut across by the sky's streaks
  const sx = Math.round(W * 0.78), sy = Math.round(gy * 0.42);
  for (let j = -8; j <= 8; j++) for (let i = -9; i <= 9; i++) {
    const d = Math.hypot(i * 0.95, j * 1.08) + (hash(i, j, 3) - 0.5) * 0.6;
    if (d > 8.2) continue;
    if ((sy + j) % 4 === 0 && Math.abs(j) > 2) continue; // carved lines through it
    pc.p(sx + i, sy + j, d < 5 ? CREAM : 0xf2d898);
  }
  // hills: far (cool, lit tops), near (green-grey, hatched)
  for (let x = 0; x < W; x++) {
    const h1 = Math.round(14 + n(x * 0.012, 4) * 9 + n(x * 0.05, 5) * 2);
    for (let k = 0; k < h1; k++) pc.p(x, gy - 2 - k, k === h1 - 1 ? 0xb8b4b0 : k > h1 - 3 ? 0x96989e : (x + k) % 4 === 0 && k < h1 - 5 ? 0x6a7486 : 0x7c8494);
    const h2 = Math.round(7 + n(x * 0.02 + 9, 6) * 6 + n(x * 0.09, 7) * 1.5);
    for (let k = 0; k < h2; k++) pc.p(x, gy - k, k === h2 - 1 ? 0x8a9a74 : (x - k) % 3 === 0 ? 0x4a5a48 : 0x5e6e56);
  }
  // far pines along the near hills
  for (let x = 4; x < W; x += 5 + ((hash(x, 1, 9) * 5) | 0)) {
    if (hash(x, 2, 9) < 0.35) continue;
    const base = gy - Math.round(5 + n(x * 0.02 + 9, 6) * 6) + 2, hh = 6 + ((hash(x, 3, 9) * 7) | 0);
    for (let r = 0; r < hh; r++) { const half = Math.floor(r * 0.3 + (r % 3 === 2 ? 0.6 : 0)); for (let i = -half; i <= half; i++) pc.p(x + i, base - hh + r, i <= -half + 0 && half ? 0x5e7464 : 0x3e5246); }
  }
  return pc;
}

/** A pine (carved silhouette, lopsided). */
function pine(pc, x, base, h, seed) {
  for (let y = base - 3; y < base; y++) { pc.p(x, y, WOOD[1]); pc.p(x + 1, y, INK); }
  for (let r = 0; r < h; r++) {
    const y = base - 3 - h + r;
    const half = Math.floor(r * 0.36 + (r % 4 === 3 ? 1 : 0) + (hash(seed, r, 2) < 0.3 ? 1 : 0));
    for (let i = -half; i <= half + (r % 4 === 3 ? 1 : 0); i++) {
      let c = i < -half * 0.35 ? LEAF[3] : i > half * 0.4 ? LEAF[1] : LEAF[2];
      if (r % 4 === 3) c = i > 0 ? INK : LEAF[1];
      pc.p(x + i, y, c);
    }
  }
  pc.p(x, base - 3 - h, LEAF[4]);
}

/** The old oak over the burrow: a lumpy canopy in flat greens, a gnarled trunk. */
function oak(pc, x, gy, seed) {
  const rng = makeRng(seed * 11 + 3);
  for (let y = gy - 22; y < gy + 1; y++) {
    const w = 3 + (y > gy - 4 ? (y - gy + 4) : 0);
    for (let i = -w; i <= w + 1; i++) pc.p(x + i, y, i === -w ? WOOD[3] : i >= w ? INK : (y + i) % 5 === 0 ? WOOD[0] : WOOD[1]);
  }
  for (let k = 0; k < 9; k++) {
    const cx = x + rng.int(-17, 17), cy = gy - 30 + rng.int(-9, 6);
    lump(pc, cx - 7, cy - 5, rng.int(11, 16), rng.int(8, 11), [INK2, LEAF[1], LEAF[2], LEAF[3]], seed + k, INK);
  }
  for (let k = 0; k < 26; k++) { const cx = x + rng.int(-18, 18), cy = gy - 34 + rng.int(-6, 10); if (pc.a(cx, cy)) pc.p(cx, cy, k % 3 ? LEAF[4] : LEAF[3]); }
  // a branch peeking out of the leaves
  for (let k = 0; k < 6; k++) { pc.p(x + 6 + k, gy - 18 - (k >> 1), WOOD[1]); pc.p(x + 6 + k, gy - 17 - (k >> 1), INK); }
}

/** A Deep Town house: half-timbered walls, a shingled roof, a door, lit windows, maybe a chimney and a shop board. */
function house(pc, x, fy, w, h, seed, anim) {
  const rng = makeRng(seed);
  const cur = pc.cur; pc.cur = ID.house;
  const Wl = rng() < 0.3 ? STONE : PLASTER;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let c = Wl[1];
    if (Wl === STONE) { const row = j >> 2, off = (row & 1) * 3; if (j % 4 === 3 || (i + off) % 6 === 5) c = Wl[0]; else if (j % 4 === 0 && (i + off) % 6 === 0) c = Wl[2]; }
    else if (i === 0 || i === w - 1 || j === 0 || (j === (h >> 1) && h > 12)) c = WOOD[1]; // the timbers
    else if ((i === (w >> 1)) && w > 12) c = WOOD[1];
    if (i === 0) c = Wl === STONE ? Wl[2] : WOOD[2];
    if (i === w - 1) c = INK;
    pc.p(x + i, fy - 1 - j, c);
  }
  // the roof: pitched, shingled rows, an overhang and a lit ridge
  const rh = Math.ceil((w + 4) / 2.6);
  for (let r = 0; r < rh; r++) {
    const y = fy - h - 1 - r, half = (w + 4) / 2 - r * 1.3;
    const a = Math.round(x + w / 2 - half - 0.5), b = Math.round(x + w / 2 + half - 0.5);
    for (let i = a; i <= b; i++) {
      let c = ((i + (r & 1) * 2) % 4 === 0) ? ROOF[1] : ROOF[2];
      if (r % 2 === 0 && i < (a + b) / 2) c = ROOF[3];
      if (i === b || r === 0) c = r === 0 ? (i < (a + b) / 2 ? ROOF[1] : INK) : INK;
      if (i === a && r > 0) c = ROOF[3];
      pc.p(i, y, c);
    }
  }
  // chimney
  if (rng() < 0.7) {
    const cx = x + Math.round(w * 0.7), top = fy - h - rh + 1;
    for (let y = top - 4; y < top + 4; y++) { pc.p(cx, y, STONE[2]); pc.p(cx + 1, y, STONE[1]); pc.p(cx + 2, y, INK); }
    pc.p(cx, top - 5, STONE[3]); pc.p(cx + 1, top - 5, STONE[2]); pc.p(cx + 2, top - 5, STONE[1]);
    anim.smoke.push({ x: cx + 1, y: top - 6, ph: rng() });
  }
  // door: an arched plank door with a step
  const dx = x + (rng() < 0.5 ? 2 : w - 7);
  pc.stamp(dx, fy - 8, ['.000.', '01120', '01120', '01a20', '01120', '01120', '01120', '33333'], { 0: INK, 1: WOOD[2], 2: WOOD[1], a: LAMP[2], 3: STONE[2] });
  // windows, lit (or shuttered)
  const nw = Math.max(1, Math.floor((w - 8) / 6));
  for (let k = 0; k < nw; k++) {
    const wx = x + 2 + k * 6 + (dx === x + 2 ? 6 : 0);
    if (wx + 4 > x + w - 1 || (wx >= dx - 4 && wx <= dx + 5)) continue;
    const wy = fy - h + 3 + (h > 14 && k % 2 ? 0 : 0);
    const lit = hash(seed, k, 5) < 0.8;
    pc.stamp(wx, wy, ['0000', '0lh0', '0000', '0hl0', '1111'], { 0: INK, l: lit ? LAMP[2] : IRON[0], h: lit ? LAMP[3] : IRON[1], 1: WOOD[2] });
    if (lit) anim.windows.push({ x: wx + 1, y: wy + 1, ph: hash(seed, k, 6) });
    if (h > 18) { pc.stamp(wx, wy + 9, ['0000', '0lh0', '0hl0', '1111'], { 0: INK, l: LAMP[1], h: LAMP[2], 1: WOOD[2] }); }
  }
  // a shop board on a bracket
  if (rng() < 0.6) {
    const bx = dx < x + w / 2 ? x - 4 : x + w;
    pc.p(bx, fy - h + 2, WOOD[2]); pc.p(bx + 1, fy - h + 2, WOOD[2]); pc.p(bx + 2, fy - h + 2, WOOD[2]); pc.p(bx + 3, fy - h + 2, INK);
    board(pc, bx - 1, fy - h + 4, 6, [WOOD[0], ROOF[1], ROOF[2], ROOF[3]]);
    pc.cur = ID.house;
  }
  pc.cur = cur;
}

/** The top section: { back (sky, taller for parallax), mid, anim, homeR, townR, homeStop, townStop, art (Art) }. */
export function paintTop(T) {
  const { W, seed, town, M } = T;
  const H = TOP_H;
  const rng = makeRng(seed * 41 + 9);
  const anim = { smoke: [], windows: [], fires: [], clouds: [], lights: [], lamps: [], dust: [] };
  const sky = paintSky(W, H + M * 2, M + GROUND, seed);
  for (let k = 0; k < Math.max(3, W / 110); k++) anim.clouds.push({ x: hash(k, 3, seed) * W, y: 5 + hash(k, 4, seed) * (GROUND * 0.5), w: 6 + hash(k, 5, seed) * 9, sp: 1.2 + hash(k, 6, seed) * 1.8, seed: k });

  // ---- the ground: an air mask (9 = sky), the burrow, the passage, Deep Town's cavern
  const air = new Uint8Array(W * H);
  const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : air[(y | 0) * W + (x | 0)]);
  const n = makeNoise2D(seed * 11 + 3), n2 = makeNoise2D(seed * 5 + 1);
  for (let x = 0; x < W; x++) { const g = GROUND + Math.round(n(x * 0.03, 2) * 1.2); for (let y = 0; y < g; y++) air[y * W + x] = 9; }
  const homeR = { x0: Math.round(W * 0.16), x1: Math.round(W * 0.6), y0: GROUND + 40, y1: H - 14 };
  const townR = { x0: Math.round(W * 0.645), x1: W - 6, y0: GROUND + 13, y1: H - 10 };
  const room = (R, k, flat) => {
    const cx = (R.x0 + R.x1) / 2, rx = (R.x1 - R.x0) / 2, hh = R.y1 - R.y0;
    for (let x = R.x0; x < R.x1; x++) {
      const u = (x - cx) / rx;
      const dome = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), u < 0 ? flat : flat * 0.7)), u < 0 ? 0.42 : 0.6);
      const top = Math.round(R.y1 - hh * dome + n(x * 0.06, k) * 3 + n(x * 0.19, k + 4) * 1.6 + (u > 0 ? u * 4 : 0));
      const bot = R.y1 + Math.round(n2(x * 0.08, k) * 0.8);
      for (let y = top; y < bot; y++) if (y > GROUND + 3) air[y * W + x] = 1;
    }
  };
  room(homeR, 1, 3.2);
  room(townR, 2, 2.4);
  // the passage from the burrow's round door to the town
  const pY = homeR.y1 - 11;
  for (let x = homeR.x1 - 6; x < townR.x0 + 8; x++) for (let y = pY; y < homeR.y1 - 1 + (x > (homeR.x1 + townR.x0) / 2 ? 3 : 0); y++) air[y * W + x] = 1;
  // a ledge street up the town's right end
  const ledge = W - townR.x0 > 150 ? { x0: townR.x1 - Math.round((townR.x1 - townR.x0) * 0.26), y: townR.y1 - 30 } : null;
  if (ledge) for (let x = ledge.x0; x < townR.x1; x++) for (let y = ledge.y; y < townR.y1; y++) air[y * W + x] = 0;

  // ---- paint the soil like the Rootsoil below it (same woodcut rock), the back walls of the caves
  const P = ZP[1];
  const pc = new Art(W, H);
  const BD = makeBands(W, H, P, rng, makeNoise2D(seed * 3 + 7), GROUND - 2);
  const dRock = distField(W, H, (k) => air[k] !== 0);
  const dOpen = distField(W, H, (k) => air[k] === 0);
  rockPass(pc, { W, H, z: 1, P, air, A, dRock, ...BD });
  const HOMEB = [0x3a1e1c, 0x5a3024, 0x7a4630, 0x9a6440];
  const TOWNB = [0x2a161c, 0x442422, 0x5e3628, 0x7c4c30];
  backPass(pc, { W, H, air, Bk: HOMEB, n2, dOpen, ceilBot: null });
  for (let y = 0; y < H; y++) for (let x = townR.x0 - 2; x < W; x++) if (air[y * W + x] === 1 && x > (homeR.x1 + townR.x0) / 2) {
    const d = dOpen[y * W + x] + n2(x * 0.06, y * 0.06) * 2.2;
    let t = d < 2.5 ? 0 : d < 7 ? 1 : d < 15 ? 2 : 3;
    if (t > 0 && d - [0, 2.5, 7, 15][t] < 2.2 && x % 3 === 0) t--;
    pc.p(x, y, TOWNB[t]);
    pc.id[y * W + x] = 1;
  }
  // the burrow's walls: planks up to the beam (a cabin under the ground); Deep Town's: dressed stone behind the houses
  {
    const bTop = homeR.y0 + 10;
    for (let y = bTop; y < homeR.y1; y++) for (let x = homeR.x0; x < homeR.x1; x++) {
      if (air[y * W + x] !== 1 || dOpen[y * W + x] < 2) continue;
      const r = Math.floor((y - bTop) / 4), ry = (y - bTop) % 4;
      const joint = ((x + r * 7 + ((hash(r, 1, 3) * 9) | 0)) % 19) === 0;
      let c = ry === 0 ? 0x80583a : ry === 3 ? 0x3e2420 : (x + y * 3) % 23 === 0 ? 0x5a3828 : 0x6a4430;
      if (joint) c = 0x3e2420;
      if (ry === 1 && ((x + r * 7 + ((hash(r, 1, 3) * 9) | 0)) % 19) === 2) c = 0xb0a8a4; // a nail
      pc.p(x, y, c);
    }
    const sTop = townR.y1 - 26;
    for (let y = sTop; y < townR.y1; y++) for (let x = townR.x0; x < townR.x1; x++) {
      if (air[y * W + x] !== 1 || dOpen[y * W + x] < 2) continue;
      const r = Math.floor((y - sTop) / 5), ry = (y - sTop) % 5, off = (r & 1) * 5;
      const jx = (x + off) % 10;
      let c = ry === 4 || jx === 9 ? 0x241418 : ry === 0 || jx === 0 ? 0x5e4440 : 0x483236;
      if (ry === 2 && jx === 4 && hash(x, r, 3) < 0.3) c = 0x3a2830;
      pc.p(x, y, c);
    }
  }
  // pebbles in the soil
  for (let gy = GROUND + 6; gy < H; gy += 10) for (let gx = 0; gx < W; gx += 10) {
    const x = gx + ((hash(gx, gy, 3) * 7) | 0), y = gy + ((hash(gx, gy, 4) * 6) | 0);
    if (hash(gx, gy, 5) > 0.3 || dRock[y * W + x] < 4) continue;
    lump(pc, x, y, 3 + ((hash(gx, gy, 6) * 3) | 0), 2, P.mats[3], gx + gy, INK);
  }

  // ---- the meadow: grass, tufts, a few flowers, the oak, pines, the staff's pennant
  const gl = (x) => { let y = 0; while (y < H - 1 && A(x, y) === 9) y++; return y; };
  for (let x = 0; x < W; x++) {
    const y = gl(x);
    pc.cur = ID.plant;
    pc.p(x, y, GRASS[2]); pc.p(x, y + 1, GRASS[1]); if (hash(x, 1, 5) < 0.5) pc.p(x, y + 2, GRASS[0]);
    const tuft = hash(x, 2, 5);
    if (tuft < 0.55) pc.p(x, y - 1, tuft < 0.2 ? GRASS[3] : GRASS[2]);
    if (tuft < 0.16) pc.p(x + (hash(x, 3, 5) < 0.5 ? 1 : 0), y - 2, GRASS[2]);
    if (hash(x, 4, 5) < 0.035) { pc.p(x, y - 2, [CREAM, LAMP[2], 0xc8503a][(x * 7) % 3]); pc.p(x, y - 1, GRASS[1]); }
    pc.cur = 0;
  }
  pc.cur = ID.plant;
  for (let x = Math.round(W * 0.66); x < W - 4; x += 13 + ((hash(x, 7, 2) * 10) | 0)) if (hash(x, 8, 2) < 0.6) pine(pc, x, gl(x), 12 + ((hash(x, 9, 2) * 9) | 0), x);
  oak(pc, Math.round(W * 0.09) + 8, gl(Math.round(W * 0.09) + 8), seed);
  pc.cur = 0;
  // oak roots down through the soil: thick at the trunk, splitting, tapering out
  {
    const ox = Math.round(W * 0.09) + 8, g0 = gl(ox) + 1;
    const rr = makeRng(seed + 77);
    const grow = (x, y, w, len, dx) => {
      for (let j = 0; j < len; j++) {
        x += dx * 0.7 + (rr() - 0.5) * 0.8;
        const ww = Math.max(1, Math.round(w * (1 - j / len)));
        if (A(Math.round(x), y + j) !== 0) return;
        for (let i = 0; i < ww; i++) pc.p(Math.round(x) + i, y + j, i === ww - 1 ? INK : i === 0 ? 0xcaa474 : (y + j) % 4 === 0 ? 0x6e4a32 : 0x9c7450);
        if (ww > 2 && rr() < 0.07) grow(x, y + j, ww - 1, Math.round((len - j) * 0.6), dx > 0 ? -0.4 : 0.4);
      }
    };
    pc.cur = ID.root;
    for (const [dx, w, len] of [[-1.1, 5, 26], [-0.3, 6, 40], [0.5, 5, 34], [1.2, 4, 24]]) grow(ox + dx * 3, g0, w, len, dx);
    pc.cur = 0;
  }
  // the staff: its top and a pennant above the grass
  pc.cur = ID.support;
  for (let y = gl(4) - 10; y < H; y++) { pc.p(2, y, INK); pc.p(3, y, 0xece0b8); pc.p(4, y, y < gl(4) ? WOOD[2] : 0xe4cc98); pc.p(5, y, y < gl(4) ? WOOD[1] : 0xe4cc98); pc.p(6, y, INK); }
  pc.stamp(6, gl(4) - 10, ['rrrr', 'rrr.', 'rr..', 'r...'], { r: 0xa8402c });
  pc.cur = 0;

  // ---- HOME: Old Star's burrow
  const hx0 = homeR.x0, hw = homeR.x1 - homeR.x0, fy = homeR.y1;
  const floorAt = (x) => { let y = homeR.y1 - 3; while (y < H - 1 && A(x, y) === 1) y++; return y; };
  const lx = clamp(ax(W, 5), hx0 + 16, homeR.x1 - 18);
  const busy = [[lx - 12, lx + 12]];
  const free = (a, b) => !busy.some(([c, d]) => b > c && a < d);
  const take = (a, b) => busy.push([a, b]);
  // plank floor and a rug
  pc.cur = ID.furn;
  for (let x = hx0 + 2; x < homeR.x1 - 2; x++) { const y = floorAt(x); if (y !== fy) continue; pc.p(x, y, (x - hx0) % 9 === 0 ? WOOD[1] : WOOD[3]); pc.p(x, y + 1, WOOD[1]); pc.p(x, y + 2, INK); }
  // timber: posts at both ends and a beam across under the roof
  const beamY = homeR.y0 + 10;
  for (const px of [hx0 + 7, homeR.x1 - 9]) { beam(pc, px, beamY, 3, fy - beamY, WOOD, true); }
  for (let x = hx0 + 4; x < homeR.x1 - 4; x++) if (A(x, beamY) === 1 || A(x, beamY + 2) === 1) { pc.p(x, beamY, WOOD[2]); pc.p(x, beamY + 1, (x % 7) ? WOOD[1] : WOOD[0]); pc.p(x, beamY + 2, INK); }
  // hearth and its stone chimney up to the meadow
  const hh = hx0 + 14;
  take(hh - 2, hh + 16);
  for (let j = 0; j < 14; j++) for (let i = 0; i < 15; i++) {
    const inside = i > 2 && i < 12 && j < 8;
    if (inside) { pc.p(hh + i, fy - 1 - j, j < 2 ? INK2 : INK); continue; }
    const row = j >> 1, off = (row & 1) * 2;
    pc.p(hh + i, fy - 1 - j, i === 14 ? INK : ((i + off) % 4 === 3 || j % 2 === 1) ? STONE[1] : i < 3 || j === 13 ? STONE[3] : STONE[2]);
  }
  for (let i = -1; i < 16; i++) { pc.p(hh + i, fy - 15, WOOD[2]); pc.p(hh + i, fy - 14, INK); } // mantel
  pc.stamp(hh + 2, fy - 18, ['.ab.c', '.ab.c', 'dddde'], { a: 0x5ac0c0, b: 0x2e7a8a, c: 0xc89a3a, d: WOOD[2], e: INK }); // jars on the mantel
  const chx = hh + 4;
  pc.cur = ID.house;
  for (let y = gl(chx) - 6; y < fy - 15; y++) for (let i = 0; i < 7; i++) {
    const row = Math.floor(y / 3), ry = ((y % 3) + 3) % 3, jx = (i + (row & 1) * 2) % 4;
    pc.p(chx + i, y, i === 6 ? INK : ry === 2 || jx === 3 ? STONE[0] : i === 0 || ry === 0 ? STONE[3] : STONE[2]);
  }
  for (let i = -1; i < 8; i++) { pc.p(chx + i, gl(chx) - 7, STONE[3]); pc.p(chx + i, gl(chx) - 6, i === 7 ? INK : STONE[1]); }
  pc.cur = 0;
  anim.smoke.push({ x: chx + 3, y: gl(chx) - 9, ph: 0.3, big: true });
  anim.fires.push({ x: hh + 7, y: fy - 2, w: 7 });
  // the kettle on its hook
  pc.stamp(hh + 5, fy - 12, ['...0..', '.0110.', '012220', '012220', '.0000.'], { 0: INK, 1: IRON[2], 2: IRON[1] });
  // the anvil on its stump
  let ax0 = hh + 22;
  if (free(ax0 - 2, ax0 + 12)) {
    take(ax0 - 2, ax0 + 12);
    pc.stamp(ax0, fy - 10, ['3222222110', '.0111110..', '...010....', '..01110...', '.4555554..', '.4566654..', '.4555554..', '.4566554..', '.4555554..', '.0000000..'], { 0: INK, 1: IRON[1], 2: IRON[2], 3: IRON[3], 4: WOOD[3], 5: WOOD[2], 6: WOOD[1] });
    pc.stamp(ax0 + 1, fy - 13, ['..0', '.0.', '11.'], { 0: WOOD[2], 1: IRON[2] }); // a hammer leaning
  } else ax0 = hh + 8;
  // the workbench, its pegboard of tools
  const wb = ax0 + 18;
  if (free(wb - 2, wb + 24)) {
    take(wb - 2, wb + 24);
    for (let i = 0; i < 22; i++) { pc.p(wb + i, fy - 9, i === 0 ? WOOD[3] : WOOD[2]); pc.p(wb + i, fy - 8, WOOD[1]); pc.p(wb + i, fy - 7, INK); }
    for (const lx2 of [wb + 1, wb + 19]) for (let y = fy - 7; y < fy; y++) { pc.p(lx2, y, WOOD[1]); pc.p(lx2 + 1, y, INK); }
    for (let j = 0; j < 12; j++) for (let i = 0; i < 18; i++) pc.p(wb + 2 + i, fy - 26 + j, i === 17 || j === 11 ? INK : (i % 4 === 1 && j % 4 === 1) ? WOOD[0] : WOOD[1]);
    pc.stamp(wb + 4, fy - 25, ['1..2...3.3', '1..2..33.3', '1.222.3...', '0..2..3...', '0..2.......', '0...........'], { 0: WOOD[2], 1: IRON[3], 2: IRON[2], 3: IRON[1] });
    pc.stamp(wb + 4, fy - 12, ['.ab..cc.', 'dddd.ccd'], { a: 0xc8503a, b: CREAM, c: IRON[2], d: WOOD[3] }); // a candle, a vice
  }
  // the bed with a patched quilt, shelves of jars above it
  let bx = homeR.x1 - 50;
  if (!free(bx - 2, bx + 24)) bx = Math.min(...busy.map((b) => b[0])) - 28;
  if (bx > hx0 + 10 && free(bx - 2, bx + 24)) {
    take(bx - 2, bx + 24);
    pc.stamp(bx, fy - 9, [
      '3.....................',
      '3w....................',
      '3ww...................',
      '3wwqqrrqqrrqqrrqqrrqq3',
      '3qqrrqqrrqqrrqqrrqqrr3',
      '3333333333333333333333',
      '3.2..................3',
      '3.2..................3',
      '0000000000000000000000',
    ], { 3: WOOD[2], 2: WOOD[1], w: CREAM, q: 0xc4a478, r: 0x9a3a2e, 0: INK });
    for (let k = 0; k < 2; k++) {
      const sy = fy - 24 - k * 9;
      for (let i = 0; i < 20; i++) { pc.p(bx + 1 + i, sy, WOOD[2]); pc.p(bx + 1 + i, sy + 1, INK); }
      for (let m = 0; m < 5; m++) {
        const jx = bx + 2 + m * 4, col = [0x5ac0c0, LAMP[2], 0x7aa04a, 0xc8503a, 0x8e66b8][(m + k * 2) % 5];
        if (hash(m, k, 3) < 0.25) { pc.p(jx, sy - 1, WOOD[1]); pc.p(jx + 1, sy - 1, WOOD[1]); pc.p(jx, sy - 2, WOOD[2]); pc.p(jx, sy - 3, WOOD[2]); continue; } // a book
        pc.stamp(jx, sy - 4, ['ww', 'cd', 'cd'], { w: 0xc4b498, c: col, d: mix(col, INK, 0.5) });
      }
    }
  }
  // a chalkboard on the back wall
  const cbx = Math.round(hx0 + hw * 0.5) - 9;
  if (free(cbx, cbx + 18)) {
    for (let j = 0; j < 11; j++) for (let i = 0; i < 18; i++) pc.p(cbx + i, fy - 30 + j, i === 0 || j === 0 ? WOOD[2] : i === 17 || j === 10 ? INK : 0x2e3a34);
    for (let i = 2; i < 15; i++) if (hash(i, 1, 4) < 0.6) pc.p(cbx + i, fy - 27, 0xc8ccbc);
    for (let i = 3; i < 11; i++) if (hash(i, 2, 4) < 0.6) pc.p(cbx + i, fy - 24, 0xc8ccbc);
    pc.stamp(cbx + 11, fy - 26, ['.1.', '1.1', '.1.'], { 1: 0xc8ccbc });
  }
  // a table with a mug and a candle, a stool; barrels and a sack; a rug; the hen in her basket
  const slot = (w, pref) => { for (let d = 0; d < hw; d += 3) for (const xx of [pref + d, pref - d]) if (xx > hx0 + 10 && xx + w < homeR.x1 - 12 && free(xx - 2, xx + w + 2)) { take(xx - 2, xx + w + 2); return xx; } return null; };
  let tx = slot(16, Math.round(hx0 + hw * 0.5));
  if (tx != null) {
    pc.stamp(tx, fy - 9, [
      '.....a.....m....',
      '.....b....mmn...',
      '33333333333333334',
      '0222222222222220.',
      '.21..........21.',
      '.21..........21.',
      '.21..ss......21.',
      '.21.sSSs.....21.',
      '.00..0.0.....00.',
    ], { 0: INK, 1: WOOD[1], 2: WOOD[2], 3: WOOD[3], 4: INK, a: LAMP[3], b: CREAM, m: 0x8a5a3a, n: INK, s: WOOD[2], S: WOOD[1] });
  }
  let bx2 = slot(14, hx0 + 12);
  if (bx2 != null) {
    const barrel = ['.0000.', '012210', '0q22q0', '012210', '012210', '0q22q0', '.0000.'];
    pc.stamp(bx2, fy - 7, barrel, { 0: INK, 1: WOOD[3], 2: WOOD[2], q: IRON[2] });
    pc.stamp(bx2 + 6, fy - 6, ['..hl..', '.hlll.', 'hllmm0', 'hlmmm0', '.0000.', '......'].slice(0, 5), { h: 0xe6d6b4, l: 0xc4b498, m: 0x9a8a70, 0: INK });
  }
  let hen = slot(8, Math.round(hx0 + hw * 0.36));
  if (hen != null) pc.stamp(hen, fy - 6, ['..rr....', '.wwww.yy', 'wwwwwwe.', 'wwwwww..', 'bbbbbbb.', '.bbbbb..'], { r: 0xc8402a, w: 0xece0c8, y: LAMP[2], e: INK, b: 0x9a7a44 });
  // a rug along the planks
  { const rx = Math.round(hx0 + hw * 0.42), rw = Math.round(hw * 0.2); for (let i = 0; i < rw; i++) if (A(rx + i, fy - 1) === 1) pc.p(rx + i, fy - 1, (i % 4 < 2) ? 0x9a3a2e : 0xc4a478); }
  // a peg with Old Star's hat and coat by the door
  { const px2 = homeR.x1 - 16; pc.p(px2, fy - 22, WOOD[2]); pc.p(px2 + 1, fy - 22, INK); pc.stamp(px2 - 3, fy - 26, ['..000..', '.01120.', '0011220'], { 0: INK, 1: 0x5a4a3a, 2: 0x3a2e28 }); pc.stamp(px2 - 2, fy - 21, ['.33.', '3443', '3443', '3443', '.33.'], { 3: 0x5a3a2a, 4: 0x7a5232 }); }

  // herbs drying on the beam, a lantern
  for (let k = 0; k < 5; k++) {
    const x = Math.round(hx0 + hw * (0.3 + k * 0.07));
    if (A(x, beamY + 3) !== 1) continue;
    pc.stamp(x - 1, beamY + 3, ['.1.', '.1.', '232', '323', '232', '.3.'], { 1: 0xc4b498, 2: [GRASS[2], 0x9a6aa0, GRASS[3], LAMP[1], GRASS[2]][k], 3: GRASS[1] });
  }
  const lnx = Math.round(hx0 + hw * 0.66);
  lamp(pc, lnx, beamY + 3);
  anim.lamps.push({ x: lnx, y: beamY + 7 });
  // a patched hole in the roof where you fell in, and the hole in the meadow over it
  {
    const px = Math.round(hx0 + hw * 0.44);
    let top = homeR.y0; while (top < H && A(px, top) !== 1) top++;
    for (let i = -6; i <= 6; i++) { pc.p(px + i, top, i % 3 === 0 ? INK : WOOD[2]); pc.p(px + i, top - 1, WOOD[1]); }
    const g = gl(px);
    for (let i = -5; i <= 5; i++) { pc.p(px + i, g, i * i < 10 ? 0x3a2228 : GRASS[1]); if (i * i < 16) pc.p(px + i, g + 1, 0x4a2e26); }
    pc.stamp(px - 6, g - 4, ['0..........0', '1..........1', '122222222221', '1..........1'], { 0: WOOD[2], 1: WOOD[1], 2: WOOD[3] });
  }
  // the round green door to the passage
  {
    const dx = homeR.x1 - 7, dy = homeR.y1 - 12;
    pc.stamp(dx - 2, dy - 1, ['..000..', '.03330.', '0332210', '0332210', '03a2210', '0332210', '0332210', '0332210', '0332210', '0332210', '0000000'], { 0: INK, 3: DOOR[3], 2: DOOR[2], 1: DOOR[1], a: LAMP[2] });
  }
  // the passage's timbers
  for (let x = homeR.x1 + 2; x < townR.x0 + 4; x += 7) { const y0 = pY - 1, y1 = homeR.y1 + (x > (homeR.x1 + townR.x0) / 2 ? 2 : -1); if (A(x, y0 + 2) !== 1) continue; for (let y = y0; y < y1; y++) { pc.p(x, y, WOOD[2]); pc.p(x + 1, y, INK); } for (let i = -1; i < 3; i++) pc.p(x + i, y0, WOOD[1]); }
  // the burrow's lift: a cage on the floor, its shaft down out of the section
  for (let y = fy + 2; y < H; y++) for (let i = -4; i <= 4; i++) pc.p(lx + i, y, Math.abs(i) === 4 ? INK : i < -1 ? HOMEB[1] : HOMEB[0]);
  for (let y = fy + 2; y < H; y++) { pc.p(lx - 5, y, WOOD[2]); pc.p(lx + 5, y, WOOD[1]); }
  cable(pc, lx, fy + 2, H - 1);
  const hc = cage(pc, lx, fy, true);
  anim.lamps.push({ x: hc.x, y: hc.y + 4 });
  for (let y = fy - 17; y > homeR.y0 + 4; y--) if (A(lx, y) === 1) pc.p(lx, y, (y & 1) ? IRON[2] : IRON[3]); else break;
  const homeStop = { x: lx, fy };

  // ---- DEEP TOWN
  const tfy = townR.y1;
  const tFloor = (x) => { let y = A(x, townR.y1 - 3) === 1 ? townR.y1 - 3 : (ledge && x >= ledge.x0 ? ledge.y - 3 : townR.y1 - 3); while (y < H - 1 && A(x, y) === 1) y++; return y; };
  const shx = ax(W, 38.5);
  // cobbled street
  pc.cur = ID.house;
  for (let x = townR.x0; x < townR.x1; x++) { const y = tFloor(x); if (y < tfy - 1) continue; pc.p(x, y, (x % 5) === 0 ? STONE[1] : STONE[3]); pc.p(x, y + 1, (x % 5) === 2 ? STONE[0] : STONE[2]); pc.p(x, y + 2, INK); }
  pc.cur = 0;
  // houses along the street (not over the shaft)
  const tbusy = [[shx - 14, shx + 14]];
  let hxp = townR.x0 + 8, hk = 0;
  while (hxp < (ledge ? ledge.x0 - 6 : townR.x1 - 10)) {
    const w = 14 + ((hash(hxp, 1, seed) * 3) | 0) * 4, h = 10 + ((hash(hxp, 2, seed) * 3) | 0) * 5;
    if (tbusy.some(([a, b]) => hxp + w > a && hxp < b)) { hxp = Math.max(...tbusy.filter(([a, b]) => hxp + w > a && hxp < b).map((q) => q[1])) + 2; continue; }
    if (hxp + w > (ledge ? ledge.x0 - 4 : townR.x1 - 6)) break;
    const fyy = tFloor(hxp + (w >> 1));
    let ok = true; for (let i = 0; i < w; i++) if (Math.abs(tFloor(hxp + i) - fyy) > 2) ok = false;
    if (ok && fyy - h - w / 2 - 6 > townR.y0) { house(pc, hxp, fyy, w, h, seed * 7 + hk * 13, anim); hk++; }
    hxp += w + 4 + ((hash(hxp, 3, seed) * 6) | 0);
  }
  if (ledge) {
    // the ledge: a stair up to it, a house on it
    for (let k = 0; k < 10; k++) for (let i = 0; i < 3; i++) { const x = ledge.x0 - 12 + k * 1 + i, y = tfy - 3 - k * 3; pc.p(x, y, WOOD[2]); pc.p(x, y + 1, INK); }
    const w = Math.min(26, townR.x1 - ledge.x0 - 6);
    if (w > 13) house(pc, ledge.x0 + 3, ledge.y, w, 12, seed * 5 + 3, anim);
  }
  // a timber walkway along the back wall, shacks on it, a ladder down (the town climbs)
  {
    const wy = tfy - 40, wx0 = townR.x0 + 16, wx1 = Math.min(shx - 16, wx0 + 72);
    if (wx1 - wx0 > 34 && A(wx0, wy - 20) === 1 && A(wx1, wy - 20) === 1) {
      pc.cur = ID.house;
      for (let x = wx0; x <= wx1; x++) { pc.p(x, wy, x === wx0 ? WOOD[3] : WOOD[2]); pc.p(x, wy + 1, (x - wx0) % 5 === 0 ? INK : WOOD[1]); pc.p(x, wy + 2, INK); if ((x - wx0) % 6 === 0) { pc.p(x, wy - 1, WOOD[1]); pc.p(x, wy - 2, WOOD[1]); pc.p(x, wy - 3, WOOD[2]); } }
      for (let x = wx0; x <= wx1; x++) if ((x - wx0) % 6 !== 0) pc.p(x, wy - 3, WOOD[1]); // the rail
      for (let px = wx0 + 4; px < wx1 - 2; px += 12) for (let j = 0; j < 5; j++) { pc.p(px + j, wy + 3 + j, WOOD[1]); pc.p(px + j, wy + 4 + j, INK); pc.p(px, wy + 3 + j, WOOD[2]); } // brackets into the wall
      pc.cur = 0;
      house(pc, wx0 + 6, wy, 16, 9, seed * 3 + 11, anim);
      if (wx1 - wx0 > 52) house(pc, wx0 + 30, wy, 13, 8, seed * 3 + 17, anim);
      // the ladder down to the street
      for (let y = wy + 1; y < tfy; y++) { pc.p(wx1 - 1, y, WOOD[2]); pc.p(wx1 + 3, y, WOOD[1]); pc.p(wx1 + 4, y, INK); if ((y - wy) % 3 === 0) for (let i = 0; i < 3; i++) pc.p(wx1 + i, y, WOOD[2]); }
    }
  }
  // the town lift's headframe over its shaft, the shaft going down
  let townTag = null;
  {
    const top = Math.max(townR.y0 + 6, tfy - 46);
    townTag = { x: shx, y: top - 6 };
    for (let y = top; y < tfy; y++) {
      const t = (y - top) / (tfy - top), spread = Math.round(3 + t * 8);
      pc.p(shx - spread, y, WOOD[2]); pc.p(shx - spread - 1, y, WOOD[1]); pc.p(shx + spread, y, WOOD[1]); pc.p(shx + spread + 1, y, INK);
      if ((y - top) % 10 === 5) for (let i = -spread; i <= spread; i++) pc.p(shx + i, y, i < 0 ? WOOD[2] : WOOD[1]);
    }
    sheave(pc, shx, top - 1);
    for (let i = -6; i <= 6; i++) { pc.p(shx + i, top + 3, WOOD[2]); pc.p(shx + i, top + 4, INK); }
    for (let y = top + 4; y < H; y++) if (y >= tfy || A(shx, y) === 1) pc.p(shx, y, (y & 1) ? IRON[2] : IRON[3]);
    for (let y = tfy + 2; y < H; y++) for (let i = -4; i <= 4; i++) if (i !== 0) pc.p(shx + i, y, Math.abs(i) === 4 ? INK : i < -1 ? TOWNB[1] : TOWNB[0]);
    for (let y = tfy + 2; y < H; y++) { pc.p(shx - 5, y, WOOD[2]); pc.p(shx + 5, y, WOOD[1]); if (y % 9 === 0) for (let i = -5; i <= 5; i++) pc.p(shx + i, y, WOOD[2]); }
    lamp(pc, shx - 8, top + 5);
    anim.lamps.push({ x: shx - 8, y: top + 9 });
  }
  // one string of lamps across the cavern
  {
    const x0 = townR.x0 + 10, x1 = (ledge ? ledge.x0 : townR.x1) - 6, y0 = townR.y0 + 16;
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0), y = Math.round(y0 + Math.sin(t * Math.PI) * 9 + Math.sin(t * Math.PI * 3) * 1.5);
      if (A(x, y) !== 1) continue;
      pc.p(x, y, INK2);
      if ((x - x0) % 6 === 3) { pc.p(x, y + 1, INK); anim.lights.push({ x, y: y + 2, blink: hash(x, 3, 7) }); }
    }
  }
  const townStop = { x: shx + 26, fy: tFloor(shx + 26) };

  // ---- lamplight
  const lights = [{ x: hh + 7, y: fy - 5, r: 44, k: 0.65 }, { x: lnx, y: beamY + 7, r: 30, k: 0.5 }, { x: hc.x, y: hc.y + 2, r: 24, k: 0.45 }];
  for (let x = townR.x0 + 14; x < townR.x1 - 6; x += 26) lights.push({ x, y: townR.y0 + 26, r: 34, k: 0.4 });
  for (const l of lights) lightPool(pc, l.x, l.y, l.r * 0.8, LAMP[2], l.k * 0.6, (x, y) => pc.id[y * W + x] === 1);

  // the town is only drawn in pencil until you've reached it (liftLayers.js sketches townR)
  return { back: sky.commit(), art: pc, anim, homeR, townR, homeStop, townStop, townTag, shx, air };
}

/** The Core's heart under everything: crust above, a lopsided glow in flat carved bands, rays. */
export function paintCore(C) {
  const { W, seed } = C;
  const H = CORE_H;
  const P = ZP[6];
  const rng = makeRng(seed * 19 + 2);
  const n = makeNoise2D(seed * 19);
  const air = new Uint8Array(W * H);
  const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : air[(y | 0) * W + (x | 0)]);
  const cx = W / 2 + n(3, 1) * W * 0.1, cy = H + 26;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const crust = 24 + n(x * 0.04, 3) * 8 + Math.abs(x - cx) * 0.06;
    if (y > crust) air[y * W + x] = 1;
  }
  const pc = new Art(W, H);
  const BD = makeBands(W, H, P, rng, makeNoise2D(seed * 23));
  rockPass(pc, { W, H, z: 6, P, air, A, dRock: distField(W, H, (k) => air[k] !== 0), ...BD });
  const RING = [0x1c0e2e, 0x341a50, 0x56307a, 0x8a52a0, 0xc488b8, 0xecc4c4, CREAM];
  const anim = { rays: [] };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (air[y * W + x] !== 1) continue;
    const a = Math.atan2(y - cy, x - cx);
    const d = Math.hypot((x - cx) * 0.55, y - cy) + n(a * 3, 2) * 7 + n(x * 0.05, y * 0.05) * 2;
    let k = d < 34 ? 6 : d < 42 ? 5 : d < 50 ? 4 : d < 60 ? 3 : d < 72 ? 2 : d < 86 ? 1 : 0;
    // carved rays out from the heart
    const ray = ((a + Math.PI) * 18 / Math.PI) % 2;
    if (k > 0 && k < 6 && ray < 0.18 && hash(Math.floor(d / 4), Math.floor(a * 30), 4) < 0.7) k--;
    // hatch where bands meet
    const edges = [34, 42, 50, 60, 72, 86];
    if (k < 6 && k > 0 && Math.abs(d - edges[6 - k]) < 1.6 && (x + y) % 3 === 0) k--;
    pc.p(x, y, RING[k]);
    pc.id[y * W + x] = k <= 1 ? 5 : k <= 3 ? 6 : k <= 5 ? 7 : 8;
  }
  // floating shards round the heart
  for (let k = 0; k < Math.max(3, W / 90); k++) {
    const x = rng.int(10, W - 14), y = rng.int(34, H - 12);
    if (A(x, y) !== 1) continue;
    lump(pc, x, y, rng.int(4, 8), rng.int(3, 5), [INK, 0x2a1640, 0x4a2a6a, 0x8a6aa8], k + seed, INK);
  }
  return { art: pc, anim };
}
