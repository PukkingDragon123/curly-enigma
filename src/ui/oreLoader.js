// The loading screen: a little pixel-art vignette in a cave niche. Two mole paws take turns
// chipping the rock crust off a glowing ore clump; chips fly, sparks pop, dust puffs, and as the
// load goes on the crust flakes away until the ore gleams clean. No words.
//
// It has to keep moving while the page is busy building a scene, so nothing here animates from
// script: the whole loop is drawn once (per page) into a sprite sheet, rows = how clean the ore
// is, columns = the frames of the chipping loop. A CSS steps() transform walks the columns (the
// compositor runs it even while the main thread is stuck); set(k) picks the row, and a stage
// change pops a few flakes (CSS too).
//
//   const L = oreLoader(host, { mode: 'full' | 'dark' | 'corner', appear, delay, auto, label })
//   L.set(k)  progress 0..1 (never goes back)    L.bump()  a nudge (a build step with no count)
//   L.done()  clean the ore, gleam, fade out     L.remove()  same as done()    L.el  the element
// opts.appear: seconds before it fades in, as a CSS delay; opts.delay: ms before it is put up at
// all (a quick load never flashes it); opts.auto: false stops it creeping on by itself while nobody
// calls set() (opts.tau: how slowly, s); opts.through: clicks go through it.
import { el } from '../core/util.js';

const W = 96, H = 64, F = 12, S = 8; // frame size (art px), frames in the loop, cleanliness stages
const CX = 48, CY = 35, RX = 19, RY = 15, FLOOR = 50; // the clump
const PR = [63, 27], PL = [33, 27]; // where the claws bite (right paw, left paw)
const HIT_R = 2, HIT_L = 8; // the frames they bite on

const C32 = (hex, a = 255) => (((a & 255) << 24) | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >>> 16) & 0xff)) >>> 0;
const P = (list) => list.map((h) => C32(h));
const ROCK = P([0x0b0706, 0x160f0c, 0x231813, 0x30221a, 0x403022, 0x56402c, 0x6e5236]);
const CRUST = P([0x17110f, 0x2e2622, 0x473b33, 0x615244, 0x7d6b56, 0x9c876a, 0xbca784]);
const ORE = P([0x3a1a06, 0x7a3a0a, 0xb86010, 0xe89624, 0xffc84a, 0xffe890, 0xfffbe0]);
const FUR = P([0x120c12, 0x281e26, 0x3e323a, 0x5a4c54, 0x84747a]); // (velvet grey: it reads against the brown rock)
// the work glove (gfx/char/glove.js): tan hide, the darker gauntlet, the oiled knuckle patch, strap, thread
const GLV = P([0x24140a, 0x382012, 0x4e2e19, 0x684022, 0x84542c, 0x9e6a38, 0xb88248, 0xd09e62, 0xe4bc84]);
const CUF = P([0x150c07, 0x21130b, 0x2f1b10, 0x3e2416, 0x50301d, 0x623c24, 0x784c2e]);
const PAT = P([0x20130b, 0x311d12, 0x452a1a, 0x5b3a24, 0x734c30, 0x8e6242, 0xc89e7a]);
const STR = P([0x100906, 0x1c110a, 0x2a1910, 0x3a2416, 0x4c311e]);
const THR = P([0xc8b48a, 0xe8d8b0]);
const CLAW = P([0x4a3a2a, 0x8e7e62, 0xcfc3a3, 0xf6eedc]);
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
/** A mole paw in a leather work glove: dark fur arm from the corner, the gauntlet, five pale claws out of the cut-open fingertips; tips at (ax, ay). */
const PAD = 24, BW = W + PAD * 2, BH = H + PAD * 2; // (a paw is drawn once on a padded sheet, then slid about)
function drawPaw(buf, ax, ay, dir, squash) {
  // Drawn per pixel (each pixel asks which part of the paw it is in), lit from the top left:
  // a furry arm with strands and a rim of lantern light, spilling out of the glove's darker
  // gauntlet (a rolled rim, a stitched seam, a strap with a brass buckle); the glove's back in tan
  // hide with sooty blotches; an oiled knuckle patch rubbed pale; five
  // gloved fingers whose cut-open tips let the long hooked claws out, each claw with a lit edge,
  // a shade side and a dark gap between them. (gfx/char/glove.js has the 3D glove.)
  const mask = new Uint8Array(BW * BH), cols = new Uint32Array(BW * BH);
  const ux = 0.76 * dir, uy = 0.65, vx = -0.65 * dir, vy = 0.76;
  const lit = (nu, nv) => -((nu * ux + nv * vx) + (nu * uy + nv * vy)) * 0.7; // a local normal → light
  const CLAWS = [];
  for (let k = 0; k < 5; k++) CLAWS.push({ v0: (k - 2) * 3.2, len: 8.6 - Math.abs(k - 2) * 0.9 - squash * 1.8 });
  const sooty = (u, v) => vnoise(u * 0.35, v * 0.35, 47) > 0.7;
  const x0 = Math.max(0, Math.floor(ax - 36)), x1 = Math.min(BW - 1, Math.ceil(ax + 36)), y0 = Math.max(0, Math.floor(ay - 14)), y1 = Math.min(BH - 1, Math.ceil(ay + 44));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x - ax, dy = y - ay;
    const u = dx * ux + dy * uy - 4.6, v = dx * vx + dy * vy;
    let col = 0;
    // the claws (on top): from the cut fingertips out along -u, curling a little, tapering to a hook
    for (const c of CLAWS) {
      const sc = 2.4 - u;
      if (sc < 0 || sc > c.len) continue;
      const k = sc / c.len, mid = c.v0 * (1 + k * 0.32) + k * k * 1.3 * dir;
      const hw = 1.05 - k * 0.6, d = v - mid;
      if (Math.abs(d) > hw) continue;
      const side = lit(0, Math.sign(d) || 1);
      col = k > 0.86 ? CLAW[3] : side > 0.2 ? CLAW[3] : side < -0.2 && Math.abs(d) > hw - 0.7 ? CLAW[1] : CLAW[2];
      if (k < 0.12) col = LINE; // the dark opening the claw comes out of
      break;
    }
    if (!col) {
      // the gloved fingers: five short digits from the knuckles to the cut tips, lit on top
      for (const c of CLAWS) {
        if (u < 1.6 || u > 6.2 || Math.abs(v - c.v0) > 1.4) continue;
        const d = v - c.v0, side = lit(0, Math.sign(d) || 1);
        if (Math.abs(d) > 1.05) { col = side > 0 ? GLV[4] : GLV[1]; break; } // the seam between fingers
        col = u < 2.9 ? (side > 0 ? GLV[7] : GLV[5]) // the rolled edge of the cut tip
          : u < 5.2 ? (side > 0.2 ? GLV[6] : side < -0.2 ? GLV[3] : GLV[5])
            : (side > 0 ? PAT[5] : PAT[3]); // the knuckle patch's front edge
        if (u >= 2.9 && u < 3.6) col = GLV[2]; // a crease under the rolled edge
        break;
      }
    }
    if (!col && u > 12.2 && u < 19.6) {
      // the gauntlet: a darker flared cuff, a strap with a brass buckle, a stitched rolled rim
      const w = 7.8 + (u - 12.2) * 0.16;
      if (Math.abs(v) <= w) {
        const side = lit(0, Math.sign(v) || 1) * (Math.abs(v) / w);
        let t = 3 + (side > 0.45 ? 2 : side > 0.1 ? 1 : side < -0.45 ? -2 : 0);
        col = CUF[clamp(t, 0, 6)];
        if (u > 13.6 && u < 15.8) { // the strap, and its buckle on the lit side
          col = STR[clamp(t - 1, 0, 4)];
          if (Math.abs(u - 13.7) < 0.35 || Math.abs(u - 15.7) < 0.35) col = STR[clamp(t, 0, 4)];
          const bv = v + 3.8; // (the -v side faces the light for both paws)
          if (Math.abs(bv) < 1.8 && u > 13.1 && u < 16.3) col = Math.abs(bv) < 0.6 && Math.abs(u - 14.7) < 0.7 ? BRASS[0] : bv < -0.6 && u < 14.2 ? BRASS[3] : BRASS[2]; // the buckle: lit corner, dark prong slot
        } else if (u > 18.2) col = side > 0.3 ? CUF[6] : CUF[4]; // the rolled rim
        else if (Math.abs(u - 17.6) < 0.4 && (Math.round(v) & 1)) col = THR[0]; // its stitched seam
        else if (sooty(u, v + 9)) col = CUF[clamp(t - 2, 0, 6)];
        if (Math.abs(v) > w - 0.8) col = side > 0 ? CUF[5] : CUF[1]; // the cuff's edge: a lit rim, a dark side
      }
    }
    if (!col) {
      // the glove's back: broad across the knuckles, narrowing to the wrist
      const ru = (u - 9.2) / 5.4, rv = v / (8.4 - Math.max(0, u - 9) * 0.8);
      const r = ru * ru + rv * rv * (1 + squash * 0.3), edge = 1 + (vnoise(u, v, 43) - 0.5) * 0.18;
      if (r <= edge) {
        let t = 4 + Math.round(lit(ru, rv) * 2);
        const knuckle = u < 7.6;
        if (knuckle && CLAWS.some((c) => Math.abs(v - c.v0) < 0.9)) t = u < 6.8 ? 7 : 3; // knuckles rubbed pale, a shade under each
        col = knuckle ? PAT[clamp(t - 1, 0, 6)] : GLV[clamp(t, 0, 8)];
        if (Math.abs(u - 7.9) < 0.5 && (Math.round(v) & 1)) col = THR[1]; // the patch's stitched edge
        else if (!knuckle && sooty(u, v)) col = GLV[clamp(t - 3, 0, 8)];
        if (r > edge - 0.12) col = GLV[1]; // the rounded edge in shade
      }
    }
    if (!col && u > 9.5 && u < 52) {
      // the arm: velvet fur in strands, shaggy at the edge, a rim of light, a ruff out of the cuff
      const tuft = hash(Math.round(u), Math.sign(v), 45) > 0.62 ? 0.9 : 0;
      const w = 6.4 + Math.min(1.4, (u - 10) * 0.1) + tuft + (u < 22 ? 0.9 : 0);
      if (Math.abs(v) <= w) {
        const side = lit(0, Math.sign(v) || 1) * (Math.abs(v) / w);
        const strand = vnoise(u * 0.22 + v * 0.12, v * 1.1, 42);
        let t = 2 + (strand > 0.64 ? 1 : strand < 0.32 ? -1 : 0);
        if (side > 0.45) t = Math.abs(v) > w - 1.2 ? 4 : 3; // the lit edge
        else if (side < -0.45) t = 0; // the shadow edge
        if (u < 22) t = Math.min(4, t + 1); // the lighter ruff spilling out of the gauntlet
        if (hash(Math.round(u * 1.5), Math.round(v * 1.5), 46) < 0.04) t = 4; // stray glinting hairs
        col = FUR[clamp(t, 0, 4)];
      }
    }
    if (col) { mask[y * BW + x] = 1; cols[y * BW + x] = col; }
  }
  // a tinted outline (and so a dark gap between the claws), then onto the frame
  for (let y = 1; y < BH - 1; y++) for (let x = 1; x < BW - 1; x++) {
    const i = y * BW + x;
    if (mask[i]) { buf[i] = cols[i]; continue; }
    if (mask[i - 1] || mask[i + 1] || mask[i - BW] || mask[i + BW]) buf[i] = LINE;
  }
}

/** Chips, sparks, dust and the flash of one bite, t frames after it. */
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

const POSE = (f, hit) => { const t = (f - hit + F) % F; return [[0, 0, 1], [3, 3, 1], [6, 5, 0], [8, 7, 0], [9, 8, 0], [10, 9, 0], [10, 10, 0], [10, 9, 0], [9, 8, 0], [8, 7, 0], [6, 5, 0], [3, 2, 0]][t]; };

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
  // the bites (older one first), then the paws over them
  for (const [hit, p, seed] of [[HIT_L, PL, 2], [HIT_R, PR, 1]]) {
    const t = (f - hit + F) % F;
    if (t <= 6) drawBite(buf, sc, vis, c, p[0], p[1], t, seed + f * 0);
  }
  const [idx, col] = pawLayer(f);
  for (let j = 0; j < idx.length; j++) buf[idx[j]] = col[j];
}
const PAWS = [], SPRITES = {};
/** One paw (dir 1: the right), pressed flat by `sq`, on the padded sheet: its pixels. */
function pawSprite(dir, sq) {
  const key = dir + ':' + sq;
  if (SPRITES[key]) return SPRITES[key];
  const b = new Uint32Array(BW * BH), p = dir > 0 ? PR : PL;
  drawPaw(b, PAD + p[0], PAD + p[1] + 1, dir, sq);
  const pts = [];
  for (let i = 0; i < BW * BH; i++) if (b[i]) pts.push(i % BW - PAD, Math.floor(i / BW) - PAD, b[i]);
  return (SPRITES[key] = pts);
}
/** Both paws in frame f (the same at every stage: drawn once): [indices, colours]. */
function pawLayer(f) {
  if (PAWS[f]) return PAWS[f];
  const idx = [], col = [];
  for (const [dir, hit] of [[-1, HIT_L], [1, HIT_R]]) {
    const [u, v, sq] = POSE(f, hit), dx = Math.round(dir * (u * 0.62 + v * 0.1)), dy = Math.round(v * 0.78);
    const pts = pawSprite(dir, sq);
    for (let j = 0; j < pts.length; j += 3) {
      const x = pts[j] + dx, y = pts[j + 1] + dy;
      if (x >= 0 && y >= 0 && x < W && y < H) { idx.push(y * W + x); col.push(pts[j + 2]); }
    }
  }
  return (PAWS[f] = [Int32Array.from(idx), Uint32Array.from(col)]);
}

// The sheet: the first row (the crusted ore) is drawn at once, the cleaner rows one per tick after
// (between the build's own steps), and every loader on screen gets each row as it's done.
let SHEET = null, SC = null, built = 0, building = 0;
const LIVE = new Set();
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
  built = s + 1;
  for (const L of LIVE) L.row(s);
}
function sheet() {
  if (!SHEET) {
    SHEET = document.createElement('canvas');
    SHEET.width = W * F; SHEET.height = H * S;
    SC = makeScene();
    drawRow(0);
  }
  if (built < S && !building) {
    const next = () => { building = 0; try { drawRow(built); } catch (e) { console.warn('[loader]', e); built = S; return; } if (built < S) building = setTimeout(next, 0); };
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
.ol-back.out,.ol-back.thru{pointer-events:none}.ol-back.out{opacity:0}
.ol-view{position:relative;overflow:hidden;width:var(--ol-w);height:var(--ol-h);animation:olPop .32s cubic-bezier(.3,1.6,.5,1) both;filter:drop-shadow(0 0 calc(var(--ol-s) * 8) #ff9a3a2a)}
.ol-row{position:absolute;left:0;top:0;transform:translateY(calc(var(--ol-h) * var(--ol-r, 0) * -1))}
.ol-strip{display:block;width:calc(var(--ol-w) * ${F});height:calc(var(--ol-h) * ${S});image-rendering:pixelated;animation:olRun 1.05s steps(${F}) infinite;will-change:transform}
.ol-flake{position:absolute;left:var(--x);top:var(--y);width:calc(var(--ol-s) * 2);height:calc(var(--ol-s) * 2);background:var(--c);box-shadow:var(--ol-s) var(--ol-s) 0 #0d0706;animation:olFlake .6s cubic-bezier(.3,.6,.6,1) forwards;pointer-events:none}
.ol-view.gleam:after{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%,#fff6c8 0,#ffd25a55 22%,transparent 46%);mix-blend-mode:screen;animation:olGleam .45s ease-out forwards;pointer-events:none}
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
@keyframes olGleam{0%{opacity:0}25%{opacity:1}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){.ol-strip{animation-duration:2.4s}}`;
  document.head.append(el('style', { 'data-ui': 'ore-loader' }, css));
}

/** Art px → CSS px: whole device pixels per art pixel, sized to the screen. */
function artScale(mode) {
  const dpr = window.devicePixelRatio || 1, vw = window.innerWidth || 800, vh = window.innerHeight || 600;
  const fit = mode === 'corner' ? Math.min(vw * 0.24 / W, vh * 0.18 / H, 2) : mode === 'dark' ? Math.min(vw * 0.5 / W, vh * 0.3 / H, 3) : Math.min(Math.min(vw, vh) * 0.6 / H, vw * 0.92 / W, vh * 0.8 / H);
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
        f.style.setProperty('--x', `${((CX + Math.cos(a) * RX * rr) * s).toFixed(1)}px`);
        f.style.setProperty('--y', `${((CY + Math.sin(a) * RY * rr) * s).toFixed(1)}px`);
        f.style.setProperty('--dx', `${(Math.cos(a) * (6 + Math.random() * 10) * s).toFixed(1)}px`);
        f.style.setProperty('--c', ['#7d6b56', '#9c876a', '#615244', '#e89624'][j & 3]);
        f.style.animationDelay = `${(j * 0.03).toFixed(2)}s`;
        view.append(f);
        setTimeout(() => f.remove(), 900);
      }
    } catch (e) { /* cosmetic */ }
  };
  const apply = () => setRow(Math.min(S - 1, Math.floor(k * (S - 1) + 0.0001)));
  const show = () => {
    if (shown || gone) return;
    shown = true;
    try {
      style();
      s = artScale(mode);
      const strip = sheetCanvas();
      live = { row: (r) => { try { strip.getContext('2d').drawImage(SHEET, 0, r * H, W * F, H, 0, r * H, W * F, H); } catch (e) { /* lost */ } apply(); } };
      LIVE.add(live);
      view = el('div', { class: 'ol-view', 'aria-hidden': 'true' }, [el('div', { class: 'ol-row' }, [strip])]);
      view.style.setProperty('--ol-s', `${s}px`);
      view.style.setProperty('--ol-w', `${W * s}px`);
      view.style.setProperty('--ol-h', `${H * s}px`);
      root = el('div', { class: `ol-back ${mode}${opts.appear ? ' late' : ''}${opts.through ? ' thru' : ''}`, role: 'status', 'aria-label': opts.label || 'Loading' }, [view]);
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
      if (!root) return;
      try {
        setRow(S - 1);
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
export function oreSheet() { sheet(); while (built < S) drawRow(built); return SHEET; }
