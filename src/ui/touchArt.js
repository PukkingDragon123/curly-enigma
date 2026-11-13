// Touch controls art: the buttons' forged frames and the little animated scenes inside them, the
// mole DOING what each button does (swinging the pick, jumping, crouching, pulling a lever, munching
// a snack, juggling tools, raising the shield, hammering a beam...).
//  - Faces: TART.face(down) 30×31 (the small buttons), TART.bigFace(down) 40×41 (hold to dig): a
//    hammered iron roundel with a ragged forged edge and brass rivets, a turned brass bezel with
//    engraved notches, and a vellum window like a miniature in a book of hours.
//  - Scenes: TART.frames(action, big) → data URLs, one per frame (26×26 small, 34×34 big, the window
//    centred in them; the mole and his tools may break out over the bezel, the ground and props are
//    clipped to the window). The mole is a puppet of hand-built parts (head, torso, arms, legs, tools,
//    props) posed per frame; every part is lit from the top left with its own tinted outline, then
//    finished with half-pixel detail (whiskers, claw tips, glints, stitches, motion smears, rock chips
//    and dust as tiny voxels).
//  - TOUCH_ACTS: per action the frames for idle, press and hold (src/ui/TouchControls.js plays them).
import { Px, art } from './uiArt.js';
import { RAMP, tone, h2, vnoise, rimLight, mixC, shadeC, paperK, rivet } from './hudArt.js';

// ---------------------------------------------------------------- ramps (darkest first)
const FUR = [0x120a08, 0x1e1410, 0x2a1e1a, 0x382a24, 0x46362e, 0x56443a, 0x6a5648, 0x826c5c, 0x9c8472];
const PINK = [0x4a1e22, 0x7a3438, 0xa84c52, 0xcc6a72, 0xe68a92, 0xf4a8ae, 0xfcc8cc, 0xffe6e8];
const CLAW = [0x4a3e30, 0x7a6c56, 0xaa9c80, 0xd2c8ac, 0xeee6d2, 0xfffaf0];
const SHIRT = [0x220806, 0x3e120c, 0x5c1e14, 0x7a2c1e, 0x96402c, 0xb2563c, 0xcc7454, 0xe29a78];
const WOOD = [0x1c0e06, 0x2e1a0c, 0x462812, 0x60381a, 0x7c4a24, 0x985e30, 0xb47640, 0xcc9258, 0xe0ae78];
const STONE = [0x16141a, 0x24222a, 0x34313a, 0x47434c, 0x5c5760, 0x736d74, 0x8c8588, 0xa8a09e, 0xc4bcb6];
const ORE = [0x3a1a0a, 0x6a3214, 0x9a4e1e, 0xc8702c, 0xe8944a, 0xffc080, 0xfff0d0];
const GLASS = [0x0e1c26, 0x1e3a4a, 0x3a6a80, 0x6aa0b4, 0xb0e0ee, 0xffffff];
const CAP = [0x0e2a3a, 0x1a4a5e, 0x2a6e86, 0x3e94ac, 0x62bcd0, 0x9ae2ee, 0xd8fbff];
const CREAM = [0x5a4a36, 0x8a7a5e, 0xb8a882, 0xdcceac, 0xf2e8d0, 0xfffaf0];
const LE = RAMP.leather, BR = RAMP.brass, ST = RAMP.steel, IR = RAMP.iron, VEL = RAMP.paper, TW = RAMP.twine;
const INK = 0x1a0e08, SEPIA = 0x5a3a20;

// template chars → [ramp, brightness] (or { ink } for flat ink): lower case plain, upper case lit, a few dark
const DEF = {
  f: [FUR, 0.44], F: [FUR, 0.66], d: [FUR, 0.24], t: [FUR, 0.58],
  p: [PINK, 0.56], P: [PINK, 0.8], n: [PINK, 0.3],
  c: [CLAW, 0.66], C: [CLAW, 0.9],
  s: [SHIRT, 0.5], S: [SHIRT, 0.72],
  l: [LE, 0.48], L: [LE, 0.7], q: [LE, 0.22],
  b: [BR, 0.62], B: [BR, 0.86],
  w: [WOOD, 0.5], W: [WOOD, 0.72],
  r: [STONE, 0.5], R: [STONE, 0.72], x: [STONE, 0.26],
  o: [ORE, 0.62], g: [GLASS, 0.45],
  u: [CAP, 0.55], U: [CAP, 0.82], k: [CREAM, 0.62],
  i: [IR, 0.5], I: [IR, 0.76], m: [ST, 0.6], M: [ST, 0.86],
  e: { ink: 0x0c0606 }, h: { ink: 0x3a1a1a },
};

// ---------------------------------------------------------------- a part: a little layer of template chars
class Part {
  constructor(W, H) { this.W = W; this.H = H; this.m = new Array(W * H).fill(null); this.k = new Float32Array(W * H); }
  in(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  put(x, y, ch, k = 0) {
    x = Math.round(x); y = Math.round(y);
    if (!this.in(x, y)) return;
    this.m[y * this.W + x] = ch;
    this.k[y * this.W + x] = k;
  }
  get(x, y) { return this.in(x, y) ? this.m[y * this.W + x] : null; }
  a(x, y) { return this.in(x, y) && this.m[y * this.W + x] ? 255 : 0; }
  tpl(rows, ox, oy, flip = false) {
    for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][flip ? rows[j].length - 1 - i : i];
      if (ch !== '.' && ch !== ' ') this.put(ox + i, oy + j, ch);
    }
  }
  /** A line with a w×w brush (w 1 or 2). */
  line(x0, y0, x1, y1, ch, w = 1, k = 0) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) this.put(x + a, y + b, ch, k);
    }
  }
}

/** Paint a part onto the frame: per-pixel tone (rim light from the top left, a little grain), then a tinted outline. */
function paint(p, part, { rim = 0.24, dark = 0, ol = true, seed = 1 } = {}) {
  const { W, H } = part;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = part.m[y * W + x];
    if (!ch) continue;
    const D = DEF[ch];
    if (!D) continue;
    if (D.ink !== undefined) { p.set(x, y, D.ink); continue; }
    const k = D[1] + part.k[y * W + x] + rimLight(part, x, y, 2) * rim - dark + (h2(x, y, seed) - 0.5) * 0.07;
    p.set(x, y, tone(D[0], k));
  }
  if (!ol) return;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (part.a(x, y)) continue;
    const r = part.get(x - 1, y) || part.get(x, y - 1), l = part.get(x + 1, y) || part.get(x, y + 1);
    if (!r && !l) continue;
    const D = DEF[r || l], ramp = D && D[0] ? D[0] : FUR;
    p.set(x, y, r ? mixC(ramp[0], INK, 0.4) : mixC(ramp[1], INK, 0.25));
  }
}

// ---------------------------------------------------------------- the mole's parts
// head facing right, 11×7; the neck (anchor) is at (3, 6). q is the goggles' strap, b their brass lens
const HEAD = {
  level: [
    '...tt......',
    '.fqqbbf....',
    'fffqbbffe..',
    'fffffffffpn',
    '.fffffffhpp',
    '..ffffff...',
    '...fff.....',
  ],
  down: [
    '...tt......',
    '.fqqbbf....',
    'fffqbbfff..',
    'ffffffffef.',
    '.ffffffffpp',
    '..ffffffhpn',
    '...fff.....',
  ],
  up: [
    '...tt...pn.',
    '.fqqbbffp..',
    'fffqbbffe..',
    'ffffffffh..',
    '.ffffffff..',
    '..ffffff...',
    '...fff.....',
  ],
};
/** Where the eye, the nose tip and the whisker roots sit in each head. */
const EYE = { level: [8, 2], down: [8, 3], up: [8, 2] };
const NOSE = { level: [10, 3], down: [10, 5], up: [9, 0] };
const WHISK = { level: [9, 4], down: [9, 5], up: [8, 1] };

function drawHead(p, W, H, hx, hy, o = {}) {
  const look = o.look || 'level';
  const pt = new Part(W, H);
  const ox = hx - 3, oy = hy - 6;
  pt.tpl(HEAD[look], ox, oy);
  const [ex, ey] = EYE[look];
  // the eye: open (a bead), shut (a lid line), happy (an arc), strain (a squint under a low brow), wide
  const eye = o.eye || 'o';
  if (eye !== 'o' && eye !== 'O') pt.put(ox + ex, oy + ey, 'd');
  // cheeks puffed (chewing); the mouth open (a dark gap under the snout, a pink tongue)
  if (o.cheek) { pt.put(ox + 7, oy + 5, 'F'); pt.put(ox + 8, oy + 5, 'f'); }
  if (o.mouth === 'open') { pt.put(ox + 8, oy + 4, 'e'); pt.put(ox + 9, oy + 4, 'h'); pt.put(ox + 9, oy + 5, 'p'); }
  paint(p, pt, { rim: 0.3, seed: 11 });
  const fx = ox + ex, fy = oy + ey;
  // fine detail: an eye glint, the lids, brows; the nose's wet highlight; whiskers; fur fluff on the crown
  if (eye === 'o') { p.dot(fx, fy, 0xffffff); p.dot(fx + 0.5, fy + 0.5, 0x2a1a22); }
  else if (eye === 'O') { p.set(fx, fy, 0xfff6ea); p.dot(fx + 0.5, fy + 0.5, 0x0c0606); p.dot(fx, fy, 0xffffff); }
  else if (eye === '-') { p.dot(fx, fy + 0.5, 0x0c0606); p.dot(fx + 0.5, fy + 0.5, 0x0c0606); }
  else if (eye === '^') { p.dot(fx, fy + 0.5, 0x0c0606); p.dot(fx + 0.5, fy, 0x0c0606); p.dot(fx + 1, fy + 0.5, 0x0c0606); }
  else if (eye === 'x') { p.dot(fx, fy + 0.5, 0x0c0606); p.dot(fx + 0.5, fy + 0.5, 0x0c0606); p.dot(fx - 0.5, fy, 0x0c0606); }
  // the brow: a determined slant over the eye (lower when straining)
  const by = eye === 'x' ? fy - 0.5 : fy - 1;
  p.dot(fx - 0.5, by, FUR[0]); p.dot(fx, by + (eye === 'x' ? 0.5 : 0), FUR[0]); p.dot(fx + 0.5, by + 0.5, FUR[1]);
  // the goggles pushed up: a round lens of glass in its brass ring, a glint, the strap's buckle
  const lx = ox + 4, ly = oy + 1;
  p.dot(lx + 0.5, ly + 0.5, GLASS[4]); p.dot(lx + 1, ly + 0.5, GLASS[2]); p.dot(lx + 0.5, ly + 1, GLASS[3]); p.dot(lx + 1, ly + 1, GLASS[1]);
  p.dot(lx + 0.5, ly + 0.5, 0xffffff); p.dot(lx, ly, BR[8]); p.dot(lx + 1.5, ly + 1.5, BR[2]);
  p.dot(ox + 2, oy + 1, BR[6]);
  // nose tip highlight, whiskers fanning forward from the snout
  const [nx, ny] = NOSE[look], [wx, wy] = WHISK[look];
  p.dot(ox + nx, oy + ny, PINK[7]);
  p.fline(ox + wx, oy + wy, ox + wx + 2.5, oy + wy - 0.5, 0xd8ccc0, 200);
  p.fline(ox + wx, oy + wy + 0.5, ox + wx + 2.5, oy + wy + 1, 0xb8aca0, 180);
  // the cowlick and a few fine hairs on the crown
  p.dot(ox + 3.5, oy - 0.5, FUR[6]); p.dot(ox + 4.5, oy - 0.5, FUR[4]);
  p.dot(ox + 1, oy + 0.5, FUR[6]); p.dot(ox + 0.5, oy + 1.5, FUR[5]);
}

/** Torso profile half-widths per row (top → bottom) by build: normal, squashed (landing, crouch), stretched (jumping). */
const TORSO = {
  n: [1.5, 3, 3.5, 3.5, 3.5, 3],
  s: [2.5, 3.5, 4, 4, 3.5],
  t: [1.5, 2.5, 3, 3, 3, 2.5, 2],
};
/** The torso's rows: bottom row at y = by, centred on bx; lean shifts the upper rows forward (+) or back (−). */
function torsoRows(bx, by, build = 'n', lean = 0) {
  const prof = TORSO[build], h = prof.length, rows = [];
  for (let j = 0; j < h; j++) {
    const y = by - (h - 1) + j, hw = prof[j], sh = Math.round(lean * (1 - j / (h - 1)));
    rows.push({ y, x0: Math.round(bx - hw + 0.01) + sh, x1: Math.round(bx + hw - 0.01) + sh, j, h });
  }
  return rows;
}
function drawTorso(p, W, H, bx, by, o = {}) {
  const rows = torsoRows(bx, by, o.build || 'n', o.lean || 0);
  const pt = new Part(W, H);
  const h = rows.length, belt = h - 3;
  for (const r of rows) {
    const mid = (r.x0 + r.x1) / 2;
    for (let x = r.x0; x <= r.x1; x++) {
      let ch = 's';
      if (r.j === 0) ch = Math.abs(x - mid) < 1 ? 'f' : 'S'; // the neck's fur, the collar
      else if (r.j === belt) ch = x === r.x1 - 1 ? 'B' : x === r.x1 - 2 ? 'b' : 'q'; // the belt and its buckle
      else if (x >= mid - 0.5 && r.j >= 1) ch = r.j === 1 ? 'L' : 'l'; // the apron: bib and skirt down the front
      if (r.j > belt && x < mid - 0.5) ch = 's';
      pt.put(x, r.y, ch);
    }
  }
  paint(p, pt, { rim: 0.28, seed: 21, dark: o.dark || 0 });
  // fine detail: the apron's stitched edge, a rivet at the bib's corner, a burn mark, the buckle's prong
  const r1 = rows[1], rB = rows[belt];
  if (r1) { const mx = Math.ceil((r1.x0 + r1.x1) / 2 - 0.5); p.dot(mx + 0.5, r1.y + 0.5, BR[8]); p.dot(mx, r1.y, BR[5]); }
  for (let j = 2; j < h; j++) { const r = rows[j]; if (j === belt) continue; const mx = Math.ceil((r.x0 + r.x1) / 2 - 0.5); p.dot(mx, r.y + (j & 1 ? 0.5 : 0), 0xe8d4a8, 210); }
  if (rB) { p.dot(rB.x1 - 1.5, rB.y + 0.5, BR[1]); p.dot(rB.x1 - 1, rB.y, BR[8]); }
  const rl = rows[h - 2];
  if (rl) p.dot(rl.x1 - 0.5, rl.y + 0.5, 0x2a160a, 200);
}

/** An arm: shoulder → elbow (rolled sleeve), elbow → paw (furry forearm), the paw with its claws. */
function drawArm(p, W, H, s, e, w, o = {}) {
  const pt = new Part(W, H);
  pt.line(s[0], s[1], e[0], e[1], o.back ? 's' : 'S', 2);
  pt.line(e[0], e[1], w[0], w[1], 'f', 2);
  pt.put(e[0], e[1], 'S'); // the rolled cuff
  // the paw: a pink pad, claws reaching the way the forearm points
  const dx = w[0] - e[0], dy = w[1] - e[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  pt.put(w[0], w[1], 'p'); pt.put(w[0] + 1, w[1], 'p'); pt.put(w[0], w[1] + 1, 'p'); pt.put(w[0] + 1, w[1] + 1, 'P');
  const cx = w[0] + 0.5 + ux * 1.8, cy = w[1] + 0.5 + uy * 1.8;
  if (!o.fist) { pt.put(cx + uy * 0.6, cy - ux * 0.6, 'c'); pt.put(cx - uy * 0.6, cy + ux * 0.6, 'C'); }
  paint(p, pt, { rim: 0.26, seed: 31, dark: o.back ? 0.16 : 0 });
  if (!o.fist) { p.dot(cx + ux * 0.8 + uy * 0.6, cy + uy * 0.8 - ux * 0.6, CLAW[5]); p.dot(cx + ux * 0.8 - uy * 0.6, cy + uy * 0.8 + ux * 0.6, CLAW[4]); }
}

/** A leg: hip → foot, wrapped in leather, a clawed foot facing right. */
function drawLeg(p, W, H, hip, foot, o = {}) {
  const pt = new Part(W, H);
  pt.line(hip[0], hip[1], foot[0], foot[1] - 1, 'f', 2);
  const my = Math.round((hip[1] + foot[1]) / 2), mx = Math.round((hip[0] + foot[0]) / 2);
  if (Math.abs(foot[1] - hip[1]) > 1) { pt.put(mx, my, 'l'); pt.put(mx + 1, my, 'L'); }
  pt.tpl(o.tip ? ['ff.', 'ppc'] : ['dff.', 'pppc'], foot[0] - 1, foot[1] - 1);
  paint(p, pt, { rim: 0.24, seed: 41, dark: o.back ? 0.16 : 0 });
  p.dot(foot[0] + (o.tip ? 1.5 : 2.5), foot[1] + 0.5, CLAW[5]);
}

// ---------------------------------------------------------------- tools and props
const rad = (d) => (d * Math.PI) / 180;
/** A tool held at grip g, pointing ang° (0 right, 90 down), its head len px away. */
function drawTool(p, W, H, kind, g, ang, len = 8, o = {}) {
  const pt = new Part(W, H);
  const ux = Math.cos(rad(ang)), uy = Math.sin(rad(ang)), nx = -uy, ny = ux;
  const ex = g[0] + ux * len, ey = g[1] + uy * len;
  if (kind !== 'shield' && kind !== 'snack') pt.line(g[0] - ux * 2, g[1] - uy * 2, ex, ey, 'w');
  if (kind === 'pick') {
    // a curved iron head: a sharp point (one way) and a chisel end (the other), tips curving back
    for (let t = -1; t <= 1.001; t += 0.125) {
      const hw = t > 0 ? 4 : 3, bow = t * t * 1.6;
      pt.put(ex + nx * t * hw - ux * bow, ey + ny * t * hw - uy * bow, Math.abs(t) < 0.4 ? 'M' : 'm');
      if (Math.abs(t) < 0.55) pt.put(ex + nx * t * hw + ux, ey + ny * t * hw + uy, 'i');
    }
    pt.put(ex, ey, 'b'); // the brass wedge through the eye
  } else if (kind === 'hammer') {
    for (let t = -1; t <= 1.001; t += 0.25) for (let k = 0; k <= 1.5; k += 0.75) pt.put(ex + nx * t * 2.2 + ux * k, ey + ny * t * 2.2 + uy * k, t < -0.6 ? 'M' : 'i');
    pt.put(ex - ux * 0.6, ey - uy * 0.6, 'b');
  } else if (kind === 'shovel') {
    for (let t = -1; t <= 1.001; t += 0.25) for (let k = 0; k <= 3.5 - Math.abs(t) * 1.6; k += 0.5) pt.put(ex + nx * t * 2 + ux * k, ey + ny * t * 2 + uy * k, t < -0.4 ? 'M' : 'm');
  } else if (kind === 'shield') {
    // a heater shield face-on: an iron rim, the field quartered red and cream, a brass boss
    const rows = [
      'IiiiiiI',
      'iSSkkki',
      'iSSbkki',
      'iSbBbki',
      'ikkbSSi',
      '.ikkSi.',
      '.ikkSi.',
      '..iSi..',
      '...i...',
    ];
    pt.tpl(rows, Math.round(g[0] - 3), Math.round(g[1] - 4));
  } else if (kind === 'snack') {
    // a roasted glowcap on a twig: a glowing cap with cream spots, a stubby stem
    const rows = ['.uuu.', 'uUkuu', 'uuuku', '.kkk.', '..k..'];
    pt.tpl(rows, Math.round(g[0] - 2), Math.round(g[1] - 5));
  }
  paint(p, pt, { rim: 0.3, seed: 51 });
  // fine: a glint on the steel, the wood's lit edge
  if (kind === 'pick') { p.dot(ex + nx * 3.2 - ux * 1.2, ey + ny * 3.2 - uy * 1.2, 0xffffff); p.fline(g[0] + nx * 0.3, g[1] + ny * 0.3, ex - ux * 1.5 + nx * 0.3, ey - uy * 1.5 + ny * 0.3, WOOD[8], 120); }
  if (kind === 'hammer') p.dot(ex - nx * 2 + ux * 0.4, ey - ny * 2 + uy * 0.4, 0xffffff);
  if (kind === 'shovel') p.dot(ex - nx * 1.2 + ux * 1.5, ey - ny * 1.2 + uy * 1.5, 0xffffff);
  if (kind === 'shield') { p.dot(g[0] - 1.5, g[1] - 3.5, 0xffffff); p.dot(g[0], g[1] - 1, BR[8]); }
  if (kind === 'snack') { p.dot(g[0] - 1, g[1] - 4.5, 0xffffff); p.dot(g[0] + 0.5, g[1] - 4, CAP[6]); }
  return { ex, ey, ux, uy, nx, ny };
}

/** A rock with a copper seam: cracks 0..3 (3 = split, the top chunk knocked aside). */
function drawRock(p, W, H, x, y, cracks = 0, o = {}) {
  const pt = new Part(W, H);
  const rows = o.big
    ? ['...RR....', '..RRrR...', '.RRrrrrx.', 'RRrorrrxx', 'Rrroorrrx', 'rrrrrorxx', 'rrxrrrrxx', '.rrrrrxx.']
    : ['..RR...', '.RRrR..', 'RRrorrx', 'Rrroorx', 'rrrrorx', 'rrxrrxx', '.rrrxx.'];
  const lift = cracks >= 3 ? 1 : 0;
  y -= o.big ? 1 : 1;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const top = j < 2 && i < row.length - 2;
      pt.put(x + i + (top ? -lift : 0), y + j - (top ? lift : 0), ch);
    }
  });
  paint(p, pt, { rim: 0.26, seed: 61 });
  // the ore's glints, the cracks (fine dark lines with a lit lip)
  p.dot(x + 3, y + 2, ORE[6]); p.dot(x + 2.5, y + 3.5, ORE[5]);
  const ck = [[[x + 3.5, y], [x + 3, y + 1.5], [x + 4, y + 2.5]], [[x + 4, y + 2.5], [x + 5, y + 3.5], [x + 4.5, y + 5]], [[x + 1, y + 1.5], [x + 2.5, y + 2], [x + 3, y + 1.5]]];
  for (let c = 0; c < Math.min(3, cracks); c++) for (let i = 0; i + 1 < ck[c].length; i++) {
    const [a, b] = [ck[c][i], ck[c][i + 1]];
    p.fline(a[0], a[1], b[0], b[1], 0x0c0a0e);
    p.fline(a[0] + 0.5, a[1], b[0] + 0.5, b[1], STONE[7], 160);
  }
}

/** Tiny voxels flying: [x, y, color] (chips, crumbs, sparks, dust), each a fine 1×1 or an art pixel. */
function bits(p, list) {
  for (const [x, y, c, big, a] of list) {
    if (big) { p.set(Math.round(x), Math.round(y), c, a ?? 255); p.dot(Math.round(x), Math.round(y), mixC(c, 0xffffff, 0.4), a ?? 255); }
    else p.dot(x, y, c, a ?? 255);
  }
}
/** A dust puff: an irregular clump of little cubes (seeded), spreading and fading with t 0..1. */
function dust(p, x, y, t, seed = 1, n = 9, spread = 4) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = h2(i, 1, seed) * Math.PI - Math.PI, d = (0.4 + h2(i, 2, seed) * 0.6) * spread * (0.35 + t * 0.9);
    const xx = x + Math.cos(a) * d * 1.3, yy = y + Math.sin(a) * d * 0.6 - t * h2(i, 3, seed) * 2;
    const c = h2(i, 4, seed) > 0.5 ? 0xd8c09a : 0xb89c76;
    out.push([xx, yy, c, h2(i, 5, seed) > 0.55 && t < 0.6, Math.round(255 * (1 - t * 0.75))]);
  }
  bits(p, out);
}
/** A motion smear: fine light dots along an arc around (cx, cy) from a0° to a1° at radius r. */
function smear(p, cx, cy, r, a0, a1, c = 0xfff6e0) {
  const n = Math.ceil(Math.abs(a1 - a0) / 6);
  for (let i = 0; i <= n; i++) {
    const a = rad(a0 + ((a1 - a0) * i) / n), al = Math.round(60 + 150 * (i / n));
    p.dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, c, al);
    if (i % 2 === 0) p.dot(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), c, Math.round(al * 0.6));
  }
}
/** A spark: a bright cross of fine pixels. */
function spark(p, x, y, s = 1, c = 0xffe08a) {
  p.dot(x, y, 0xffffff);
  for (let k = 0.5; k <= s; k += 0.5) { p.dot(x + k, y, c); p.dot(x - k, y, c); p.dot(x, y + k, c); p.dot(x, y - k, c); }
}

/** The ground: an inked line with pebbles and grass ticks, clipped to the window. */
function ground(p, cx, gy, r, seed = 3) {
  for (let x = Math.ceil(cx - r); x <= cx + r; x++) {
    const dx = x + 0.5 - cx, dy = gy + 1.5 - (cx);
    void dy;
    p.set(x, gy + 1, mixC(VEL[2], SEPIA, 0.35), 200);
    if (h2(x, 1, seed) > 0.72) p.dot(x + 0.5, gy + 1.5, SEPIA, 200);
    if (h2(x, 2, seed) > 0.8 && Math.abs(dx) < r - 3) { p.dot(x, gy + 0.5, 0x6a7a3a); p.dot(x + 0.5, gy, 0x8aa04a); }
  }
}
/** Clear every pixel outside the window disc (props and ground only; the mole is drawn after). */
function clipWindow(p, cx, cy, r) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) p.clear(x, y);
}

// ---------------------------------------------------------------- the mole, posed
/**
 * pose: { bx, gy (feet row), lift (px up off the ground), build, lean, look, eye, mouth, cheek,
 *   fa: [ex, ey, px, py] front arm (elbow, paw; relative to the front shoulder), ba: back arm,
 *   fl / bl: [dx, dy] feet relative to the hips, tool: { kind, ang, len, paw: 'f'|'b', front }, fist }
 */
function drawMole(p, W, H, P) {
  const lift = P.lift || 0;
  const build = P.build || 'n', lean = P.lean || 0;
  const th = TORSO[build].length;
  const by = P.gy - 3 - lift + (build === 's' ? 0 : 0), bx = P.bx;
  const top = by - th + 1;
  const sF = [bx + 1 + lean, top + 2], sB = [bx - 2 + lean, top + 2];
  const hipF = [bx + 1, by + 1], hipB = [bx - 2, by + 1];
  const rel = (s, a) => (a ? [[s[0] + a[0], s[1] + a[1]], [s[0] + a[2], s[1] + a[3]]] : null);
  const fa = rel(sF, P.fa || [1, 3, 3, 3]), ba = rel(sB, P.ba || [-1, 3, 0, 5]);
  const fl = P.fl || [1, 2], bl = P.bl || [-1, 2];
  const footF = [hipF[0] + fl[0], hipF[1] + fl[1]], footB = [hipB[0] + bl[0], hipB[1] + bl[1]];
  const grip = P.tool ? (P.tool.paw === 'b' ? ba[1] : fa[1]) : null;
  let tool = null;
  const toolAt = () => { tool = drawTool(p, W, H, P.tool.kind, [grip[0] + 0.5, grip[1] + 0.5], P.tool.ang, P.tool.len || 8); };
  if (P.tool && P.tool.behind) toolAt();
  drawArm(p, W, H, sB, ba[0], ba[1], { back: true, fist: P.tool && P.tool.paw === 'b' });
  drawLeg(p, W, H, hipB, footB, { back: true, tip: P.tipB });
  drawTorso(p, W, H, bx, by, { build, lean });
  drawLeg(p, W, H, hipF, footF, { tip: P.tipF });
  const hx = bx + 1 + lean + (P.hdx || 0), hy = top + 1 + (P.hdy || 0);
  drawHead(p, W, H, hx, hy, P);
  if (P.tool && !P.tool.behind) toolAt();
  drawArm(p, W, H, sF, fa[0], fa[1], { fist: !!P.tool && P.tool.paw !== 'b' });
  return { tool, sF, sB, fa, ba, hx, hy, by, top };
}

// ---------------------------------------------------------------- the scenes
// frame geometry: the window centred at (C, C), radius R; the ground row
const GEO = { small: { S: 26, C: 13, R: 10.5 }, big: { S: 34, C: 17, R: 14.5 } };

/**
 * One frame: the scene painter gets (p, g) where g = { S, C, R, gy, x(dx) }: the frame, the window,
 * the ground row (window centre + 7) and x(dx) = C + dx. Props are drawn and clipped, then the mole.
 */
function frame(big, back, front, seed = 1) {
  const G = GEO[big ? 'big' : 'small'];
  const g = { ...G, gy: G.C + 7, x: (dx) => G.C + dx, y: (dy) => G.C + dy, big };
  const p = new Px(G.S, G.S);
  if (back) back(p, g);
  ground(p, G.C, g.gy, G.R - 1.5, seed);
  clipWindow(p, G.C, G.C, G.R);
  if (front) front(p, g);
  return p;
}

const STAND = { fa: [1, 3, 3, 3], ba: [-1, 3, 0, 5], fl: [1, 2], bl: [-1, 2] };
const idleBreath = (P, k) => ({ ...P, hdy: (P.hdy || 0) + (k ? -0 : 0), lift: P.lift || 0, fa: P.fa, breath: k });

/** The big window's cave: stalactites along its top, a lantern on a chain, a glowcap by the wall. */
function caveDecor(p, g) {
  const pt = new Part(g.S, g.S), C = g.C;
  for (const [x, y, rows] of [[C - 11, C - 9, ['RRr', 'Rr.', 'r..']], [C + 3, C - 14, ['RRr', '.Rr', '.r.']]]) pt.tpl(rows, x, y);
  pt.tpl(['.i.', 'bBb', 'oko', 'oko', 'bbb'], C + 8, C - 9);
  pt.tpl(['.uu', 'uUu', '.k.', '.k.'], C - 11, g.gy - 3);
  paint(p, pt, { seed: 91, rim: 0.3 });
  p.fline(C + 9.5, C - 14, C + 9.5, C - 9, IR[5]);
  for (let k = 0; k < 6; k++) { const a = rad(k * 60 + 15); p.dot(C + 9.5 + Math.cos(a) * 3, C - 6.5 + Math.sin(a) * 2.6, 0xffe9a0, 120); }
  p.dot(C + 9, C - 7, 0xffffff); p.dot(C - 9.5, g.gy - 2.5, 0xffffff);
}

// --- dig: swing the pick into a rock with a copper seam
function digFrames(big) {
  const F = [];
  const rockAt = (g) => [g.x(big ? 4 : 3), g.gy - (big ? 6 : 5)];
  const base = { bx: 0, gy: 0, look: 'level' };
  const S = (o, fx) => F.push((g) => frame(big, (p) => { if (big) caveDecor(p, g); drawRock(p, g.S, g.S, ...rockAt(g), o.crack || 0, { big }); }, (p) => {
    const P = { ...base, ...o, bx: g.x(o.bx ?? -4), gy: g.gy };
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 3));
  // 0 idle: the pick on his shoulder · 1 breath · 2 blink
  const rest = { fa: [1, 3, 3, 3], ba: [0, 2, 1, 0], tool: { kind: 'pick', ang: -122, len: 8, paw: 'b', behind: true } };
  S({ ...rest });
  S({ ...rest, fa: [1, 2, 3, 2], ba: [0, 1, 1, -1] });
  S({ ...rest, eye: '-' });
  // 3 wind up: lean back, both paws high behind the head
  S({ fa: [0, -3, -1, -5], ba: [-1, -3, -2, -5], lean: -1, look: 'up', eye: 'x', tool: { kind: 'pick', ang: -160, len: 8, paw: 'f', behind: true }, fl: [2, 2], bl: [-2, 2] });
  // 4 overhead: the pick high and forward, stretched tall
  S({ build: 't', fa: [1, -3, 2, -5], ba: [0, -3, 1, -5], look: 'level', eye: 'x', tool: { kind: 'pick', ang: -62, len: 7 }, fl: [2, 2], bl: [-2, 2] }, (p, g, r) => smear(p, r.fa[1][0] + 0.5, r.fa[1][1] + 0.5, 7.5, -165, -70));
  // 5 strike: lean in, paws forward and down, the point bites into the rock
  S({ build: 's', lean: 2, fa: [2, -1, 3, -2], ba: [1, 0, 2, -1], look: 'down', eye: 'x', tool: { kind: 'pick', ang: 12, len: 5 }, fl: [3, 2], bl: [-2, 2], crack: 1 }, (p, g, r) => {
    smear(p, r.fa[1][0] + 0.5, r.fa[1][1] + 0.5, 6, -75, 5);
    const [rx, ry] = rockAt(g);
    spark(p, rx + 2, ry + 0.5, 1.5); spark(p, rx + 0.5, ry + 2, 1);
  });
  // 6 chips fly
  S({ build: 'n', lean: 1, fa: [2, 0, 3, -1], ba: [1, 1, 2, 0], look: 'down', eye: '-', tool: { kind: 'pick', ang: 22, len: 5 }, fl: [2, 2], bl: [-2, 2], crack: 2 }, (p, g) => {
    const [rx, ry] = rockAt(g);
    bits(p, [[rx + 2, ry - 3, STONE[6], true], [rx + 5, ry - 2, STONE[5], true], [rx + 7, ry - 4, ORE[5]], [rx + 3.5, ry - 5, STONE[7]], [rx + 6.5, ry, STONE[4], true], [rx + 1, ry - 1.5, ORE[4]]]);
    dust(p, rx + 3, g.gy - 1, 0.3, 7, 7, 3);
  });
  // 7 recover: the pick swings back up, chips land
  S({ fa: [2, 1, 3, -1], lean: 0, eye: 'o', tool: { kind: 'pick', ang: -100, len: 7 }, crack: 2 }, (p, g) => {
    const [rx, ry] = rockAt(g);
    bits(p, [[rx + 7, ry + 3, STONE[5], true], [rx + 8.5, ry + 1, ORE[5]], [rx + 6, ry + 4, STONE[6]]]);
    dust(p, rx + 3, g.gy - 1, 0.7, 7, 7, 3);
  });
  return F;
}

// --- jump: crouch, spring up with paws high, tuck at the top, land in a puff
function jumpFrames(big) {
  const F = [];
  const S = (o, fx) => F.push((g) => frame(big, null, (p) => {
    const P = { bx: g.x(-1), gy: g.gy, ...o };
    if (o.bx !== undefined) P.bx = g.x(o.bx);
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 5));
  S({ ...STAND });
  S({ ...STAND, fa: [1, 2, 3, 2] });
  S({ ...STAND, eye: '-' });
  // 3 crouch to spring
  S({ build: 's', fa: [2, 2, 4, 3], ba: [0, 3, 2, 4], fl: [2, 1], bl: [-2, 1], look: 'down', eye: 'x' });
  // 4 launch: stretched, paws up, dust kicked
  S({ build: 't', lift: 3, fa: [1, -3, 2, -6], ba: [-1, -3, -1, -6], fl: [0, 3], bl: [-1, 3], tipF: 1, tipB: 1, look: 'up', eye: 'O' }, (p, g) => { dust(p, g.x(-1), g.gy, 0.25, 11, 10, 4); for (let i = 0; i < 3; i++) p.fline(g.x(-4 + i * 2.5), g.gy - 2 - i * 0.3, g.x(-4 + i * 2.5), g.gy + 0.5, 0xfff6e0, 120); });
  // 5 apex: tucked, cheeks puffed, legs up
  S({ build: 's', lift: 6, fa: [2, 0, 4, -2], ba: [0, 0, 2, -2], fl: [2, 0], bl: [0, 0], tipF: 1, tipB: 1, look: 'level', eye: '^', mouth: 'open' }, (p, g) => dust(p, g.x(-1), g.gy, 0.7, 11, 10, 4));
  // 6 falling: paws out, legs reaching for the ground
  S({ build: 'n', lift: 3, fa: [2, -1, 4, -3], ba: [-2, -1, -4, -3], fl: [1, 3], bl: [-1, 3], tipF: 1, look: 'down', eye: 'O' }, (p, g) => { for (let i = 0; i < 3; i++) p.fline(g.x(-3 + i * 2.5), g.y(-8 + i), g.x(-3 + i * 2.5), g.y(-5 + i), 0xfff6e0, 110); });
  // 7 land: squash, a puff each side
  S({ build: 's', fa: [2, 2, 4, 2], ba: [-1, 2, -3, 2], fl: [2, 1], bl: [-2, 1], look: 'level', eye: '^' }, (p, g) => { dust(p, g.x(-5), g.gy, 0.3, 13, 6, 3); dust(p, g.x(3), g.gy, 0.3, 17, 6, 3); });
  return F;
}

// --- crouch / dive: down low, sneaking (ripples when he would dive)
function crouchFrames(big) {
  const F = [];
  const S = (o, fx) => F.push((g) => frame(big, null, (p) => {
    const P = { bx: g.x(-1), gy: g.gy, ...o };
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 7));
  S({ ...STAND });
  S({ ...STAND, fa: [1, 2, 3, 2] });
  S({ ...STAND, eye: '-' });
  // 3 bending, 4 low, 5 low sneaking (paw forward), 6 low blink
  S({ build: 's', lean: 1, fa: [2, 2, 4, 3], ba: [0, 3, 2, 4], fl: [2, 1], bl: [-2, 1], look: 'down' });
  S({ build: 's', lift: -2, lean: 2, fa: [2, 2, 5, 3], ba: [1, 3, 3, 4], fl: [2, 0], bl: [-3, 0], look: 'down', eye: 'o' }, (p, g) => { p.dot(g.x(5), g.y(-3), 0xfff6e0, 180); p.dot(g.x(6), g.y(-4), 0xfff6e0, 140); });
  S({ build: 's', lift: -2, lean: 2, fa: [3, 1, 6, 2], ba: [1, 3, 3, 4], fl: [3, 0], bl: [-3, 0], look: 'down', eye: 'o' }, (p, g) => { dust(p, g.x(-3), g.gy, 0.4, 19, 4, 2); });
  S({ build: 's', lift: -2, lean: 2, fa: [2, 2, 5, 3], ba: [1, 3, 3, 4], fl: [2, 0], bl: [-3, 0], look: 'down', eye: '-' });
  return F;
}

// --- use (E): reach for a strongbox, lift its lid, gold light spills out, a sparkle of luck
function useFrames(big) {
  const F = [];
  // the strongbox (its front with the lock faces the mole; the hinge at the back): open 0 shut, 1 ajar, 2 up
  const chest = (p, g, open) => {
    const pt = new Part(g.S, g.S), x = g.x(big ? 4 : 3), y = g.gy - 4;
    // oak boards in iron bands; the lock plate on the front (the side facing the mole)
    pt.tpl(['iWWWWWWi', 'bBWwwwWi', 'bbwwwwwi', 'iwwwwwwi', 'iiiiiiii'], x, y);
    if (open === 0) pt.tpl(['.iiiiii.', 'iWWWWWWi'], x, y - 2);
    else if (open === 1) pt.tpl(['...iiiii', '.iiWWWWi', 'iWWWw...'], x, y - 3);
    else pt.tpl(['......ii', '......iW', '......iW', '......iw', '......iW', '......ii'], x + 1, y - 6);
    paint(p, pt, { seed: 71, rim: 0.32 });
    // the keyhole, the bands' rivets, the boards' seams; gold light and coins when it opens
    p.dot(x + 0.5, y + 1.5, 0x1a0e08); p.dot(x + 0.5, y + 2, 0x1a0e08); p.dot(x, y + 1, BR[8]);
    for (const xx of [2, 5]) { p.dot(x + xx + 0.5, y + 4.5, IR[7]); p.fline(x + xx + 0.5, y + 1, x + xx + 0.5, y + 3.5, WOOD[2], 150); }
    if (open) {
      const n = open === 2 ? 1 : 0.55;
      for (let i = 1; i < 7; i++) { p.set(x + i, y, i % 2 ? 0xf8d050 : 0xe8b232); p.dot(x + i + 0.5, y, 0xfff6c0, Math.round(255 * n)); }
      if (open === 2) for (let i = 0; i < 5; i++) p.fline(x + 1.5 + i * 1.1, y - 0.5, x + i * 1.6 - 0.5, y - 4.5 - (i % 2) * 1.5, 0xfff0b0, 110);
    }
  };
  const S = (o, open, fx) => F.push((g) => frame(big, (p) => chest(p, g, open), (p) => {
    const P = { bx: g.x(-5), gy: g.gy, ...o };
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 9));
  S({ ...STAND }, 0);
  S({ ...STAND, fa: [1, 2, 3, 2] }, 0);
  S({ ...STAND, eye: '-' }, 0);
  // 3 reach for the lid, 4 lift it (straining), 5 lid up: gold light, 6 a sparkle of luck, a grin
  S({ lean: 1, fa: [2, 1, 5, 2], ba: [-1, 3, 0, 5], look: 'down', eye: 'O' }, 0);
  S({ lean: 2, build: 's', fa: [2, 0, 5, 0], ba: [1, 2, 3, 2], look: 'level', eye: 'x' }, 1);
  S({ lean: 1, fa: [2, -1, 5, -3], ba: [1, 2, 3, 2], look: 'level', eye: 'O' }, 2, (p, g) => spark(p, g.x(big ? 8 : 7), g.gy - 8, 1.5));
  S({ lean: 0, fa: [2, -1, 4, -4], ba: [-1, 2, -2, 0], look: 'up', eye: '^' }, 2, (p, g) => { spark(p, g.x(big ? 9 : 8), g.gy - 10, 1.5); spark(p, g.x(big ? 6 : 5), g.gy - 12, 1); bits(p, [[g.x(7), g.gy - 7, 0xffe08a], [g.x(9), g.gy - 6, 0xffc84a]]); });
  return F;
}

// --- snack (Q): lift a roasted glowcap, chomp, chew with puffed cheeks, crumbs, a happy hum
function snackFrames(big) {
  const F = [];
  const S = (o, fx) => F.push((g) => frame(big, null, (p) => {
    const P = { bx: g.x(-2), gy: g.gy, ...o };
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 13));
  const hold = { fa: [2, 2, 3, 0], tool: { kind: 'snack', ang: 0, len: 0 } };
  S({ ...STAND, ...hold });
  S({ ...STAND, ...hold, fa: [2, 1, 3, -1] });
  S({ ...STAND, ...hold, eye: '-' });
  // 3 up to the snout, 4 chomp (a bite gone), 5 chew, 6 chew + crumbs, 7 happy
  S({ ...STAND, fa: [2, 0, 4, -2], tool: { kind: 'snack', ang: 0, len: 0 }, eye: 'O', mouth: 'open' });
  S({ ...STAND, fa: [2, 0, 4, -2], tool: { kind: 'snack', ang: 0, len: 0 }, eye: '-', cheek: 1 }, (p, g, r) => { const [x, y] = r.fa[1]; p.clear(x + 1, y - 5); p.clear(x + 2, y - 4); bits(p, [[x + 3, y - 4, CAP[5]], [x + 4, y - 2.5, CAP[4]]]); });
  S({ ...STAND, fa: [2, 2, 3, 0], eye: '^', cheek: 1 }, (p, g) => bits(p, [[g.x(5), g.y(-2), CREAM[4]], [g.x(4.5), g.y(1), CAP[5]]]));
  S({ ...STAND, fa: [2, 2, 3, 1], eye: '^', mouth: 'open' }, (p, g) => bits(p, [[g.x(5.5), g.y(0), CREAM[3]], [g.x(4), g.y(3), CAP[4]], [g.x(6), g.y(4), CREAM[4]]]));
  S({ ...STAND, fa: [2, 1, 4, 3], eye: '^' }, (p, g) => {
    // a little heart of warm motes over his head
    const hx = g.x(4), hy = g.y(-10);
    for (const [dx, dy] of [[0, 0], [1, -0.5], [2, 0], [0.5, 1], [1.5, 1], [1, 1.5]]) p.dot(hx + dx, hy + dy, 0xff7a6a);
    p.dot(hx, hy, 0xffd0c0);
  });
  return F;
}

// --- next tool: toss the pick up, it spins, catch the hammer as it comes down
function toolFrames(big) {
  const F = [];
  const S = (o, fx) => F.push((g) => frame(big, null, (p) => {
    const P = { bx: g.x(-2), gy: g.gy, ...o };
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 17));
  const fly = (kind, x, y, ang) => (p, g) => drawTool(p, g.S, g.S, kind, [g.x(x), g.y(y)], ang, 4);
  const rest = { fa: [2, 2, 3, 0], tool: { kind: 'pick', ang: -128, len: 8 } };
  S({ ...STAND, ...rest });
  S({ ...STAND, ...rest, fa: [2, 1, 3, -1] });
  S({ ...STAND, ...rest, eye: '-' });
  // 3 toss, 4 spinning (looking up), 5 spinning the other way, 6 caught: the hammer
  S({ ...STAND, fa: [2, -2, 3, -5], look: 'up', eye: 'O' }, fly('pick', 3, -10, -60));
  S({ ...STAND, fa: [2, 0, 3, -3], look: 'up', eye: 'o' }, (p, g) => { fly('pick', 3, -12, 60)(p, g); smear(p, g.x(3), g.y(-12), 5, 120, 250); });
  S({ ...STAND, fa: [2, -1, 3, -4], look: 'up', eye: 'O' }, (p, g) => { fly('hammer', 3, -9, 160)(p, g); smear(p, g.x(3), g.y(-9), 4, 250, 360); });
  S({ ...STAND, fa: [2, 1, 3, -2], tool: { kind: 'hammer', ang: -110, len: 6 }, eye: '^' }, (p, g) => spark(p, g.x(4), g.y(-11), 1));
  return F;
}

// --- block: raise the shield, a blow glances off it in sparks, brace
function blockFrames(big) {
  const F = [];
  const S = (o, fx) => F.push((g) => frame(big, null, (p) => {
    const P = { bx: g.x(-2), gy: g.gy, ...o };
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 23));
  const low = { fa: [2, 2, 3, 3], tool: { kind: 'shield', ang: 0, len: 0, front: true } };
  S({ ...STAND, ...low });
  S({ ...STAND, ...low, fa: [2, 2, 3, 2] });
  S({ ...STAND, ...low, eye: '-' });
  // 3 up, 4 guard (braced), 5 struck: sparks off the rim, 6 holding firm
  S({ ...STAND, lean: 1, fa: [3, 0, 4, -1], tool: { kind: 'shield', ang: 0, len: 0 }, look: 'level', eye: 'x', fl: [2, 2], bl: [-2, 2] });
  S({ build: 's', lean: 1, fa: [3, -1, 4, -2], tool: { kind: 'shield', ang: 0, len: 0 }, look: 'level', eye: 'x', fl: [2, 1], bl: [-3, 1] });
  S({ build: 's', lean: 0, fa: [3, -1, 3, -2], tool: { kind: 'shield', ang: 0, len: 0 }, look: 'level', eye: '-', fl: [2, 1], bl: [-3, 1] }, (p, g, r) => {
    const [x, y] = r.fa[1];
    spark(p, x + 4, y - 3, 2); spark(p, x + 5, y + 1, 1.5); spark(p, x + 6.5, y - 1, 1);
    smear(p, x + 10, y - 2, 4, 150, 230, 0xffe8b0);
  });
  S({ build: 's', lean: 1, fa: [3, -1, 4, -2], tool: { kind: 'shield', ang: 0, len: 0 }, look: 'level', eye: 'x', fl: [2, 1], bl: [-3, 1] }, (p, g, r) => { const [x, y] = r.fa[1]; bits(p, [[x + 6, y + 3, 0xffd06a], [x + 7.5, y + 5, 0xff9a3a]]); });
  return F;
}

// --- build: hammer a nail into a support beam
function buildFrames(big) {
  const F = [];
  const beam = (p, g, nail) => {
    const pt = new Part(g.S, g.S), x0 = g.x(2), y0 = g.gy - 3;
    pt.tpl(['WWWWWWWw', 'wwwwwwww', 'wwwwwwwd'.replace('d', 'w')], x0, y0);
    pt.tpl(['ii.....i', 'ww.....w', 'ww.....w'], x0, y0 + 3 - 0);
    paint(p, pt, { seed: 81 });
    p.fline(x0 + 1, y0 + 1, x0 + 7, y0 + 1, WOOD[3], 160);
    const nh = [3, 2, 1][nail];
    for (let k = 0; k < nh; k++) p.set(x0 + 4, y0 - 1 - k, k === nh - 1 ? IR[6] : ST[5]);
    p.dot(x0 + 4, y0 - nh, 0xffffff);
  };
  const S = (o, nail, fx) => F.push((g) => frame(big, (p) => { if (big) caveDecor(p, g); beam(p, g, nail); }, (p) => {
    const P = { bx: g.x(-4), gy: g.gy, ...o };
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 29));
  const rest = { fa: [2, 2, 3, 0], tool: { kind: 'hammer', ang: -110, len: 6 } };
  S({ ...STAND, ...rest }, 0);
  S({ ...STAND, ...rest, fa: [2, 1, 3, -1] }, 0);
  S({ ...STAND, ...rest, eye: '-' }, 0);
  // 3 raise, 4 bang (the nail goes in), 5 raise, 6 bang (flush), sparks
  S({ fa: [1, -2, 2, -5], ba: [1, 3, 3, 4], look: 'level', eye: 'x', tool: { kind: 'hammer', ang: -150, len: 6, behind: true } }, 0);
  S({ build: 's', lean: 2, fa: [3, 0, 6, 1], ba: [2, 2, 5, 3], look: 'down', eye: '-', tool: { kind: 'hammer', ang: 10, len: 5 } }, 1, (p, g) => { spark(p, g.x(6), g.gy - 5, 1.5); smear(p, g.x(1), g.y(-4), 5, -100, 0); });
  S({ fa: [1, -2, 2, -5], ba: [1, 3, 3, 4], look: 'level', eye: 'x', tool: { kind: 'hammer', ang: -150, len: 6, behind: true } }, 1);
  S({ build: 's', lean: 2, fa: [3, 0, 6, 1], ba: [2, 2, 5, 3], look: 'down', eye: '^', tool: { kind: 'hammer', ang: 10, len: 5 } }, 2, (p, g) => { spark(p, g.x(6), g.gy - 4, 2); bits(p, [[g.x(8), g.gy - 6, WOOD[6]], [g.x(4), g.gy - 6, WOOD[5]]]); });
  return F;
}

// --- rotate: turn a crate a quarter with both paws
function rotateFrames(big) {
  const F = [];
  const crate = (p, g, a) => {
    const pt = new Part(g.S, g.S), cx = g.x(4), cy = g.gy - 4;
    const rows = [['WWWWW', 'wiwiw', 'wwWww', 'wiwiw', 'wwwww'], ['.WWW.', 'WwiwW', 'wiWiw', 'wwiww', '.www.']][a & 1];
    pt.tpl(rows, cx - 2, cy - 2);
    paint(p, pt, { seed: 83 });
  };
  const S = (o, a, fx) => F.push((g) => frame(big, (p) => crate(p, g, a), (p) => {
    const P = { bx: g.x(-4), gy: g.gy, ...o };
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 31));
  S({ ...STAND }, 0); S({ ...STAND, fa: [1, 2, 3, 2] }, 0); S({ ...STAND, eye: '-' }, 0);
  S({ lean: 1, fa: [3, 0, 6, -1], ba: [2, 2, 5, 3], eye: 'x' }, 0);
  S({ lean: 1, fa: [3, 1, 6, 1], ba: [2, 1, 5, 0], eye: 'x' }, 1, (p, g) => smear(p, g.x(4), g.gy - 4, 4, -60, 60));
  S({ lean: 1, fa: [3, 0, 6, -1], ba: [2, 2, 5, 3], eye: '^' }, 0);
  return F;
}

// --- done: dust off the paws, a nod
function doneFrames(big) {
  const F = [];
  const S = (o, fx) => F.push((g) => frame(big, null, (p) => {
    const P = { bx: g.x(-1), gy: g.gy, ...o };
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 37));
  S({ ...STAND }); S({ ...STAND, fa: [1, 2, 3, 2] }); S({ ...STAND, eye: '-' });
  S({ fa: [2, 1, 4, 0], ba: [1, 1, 3, 1], eye: '^' }, (p, g) => dust(p, g.x(3), g.y(-2), 0.3, 41, 6, 2));
  S({ fa: [2, 1, 4, 1], ba: [1, 1, 3, 0], eye: '^' }, (p, g) => dust(p, g.x(3), g.y(-2), 0.7, 41, 6, 3));
  S({ fa: [2, 0, 3, -3], ba: [-1, 3, 0, 5], look: 'up', eye: '^' }, (p, g) => { spark(p, g.x(5), g.y(-9), 1.5); });
  return F;
}

// --- back: hop backwards out of the close-up
function backFrames(big) {
  const F = [];
  const S = (o, fx) => F.push((g) => frame(big, null, (p) => {
    const P = { bx: g.x(o.dx ?? 1), gy: g.gy, ...o };
    const r = drawMole(p, g.S, g.S, P);
    if (fx) fx(p, g, r);
  }, 43));
  S({ ...STAND }); S({ ...STAND, fa: [1, 2, 3, 2] }); S({ ...STAND, eye: '-' });
  S({ dx: 0, lean: -1, lift: 2, fa: [2, 1, 4, 0], ba: [-2, 1, -3, -1], fl: [1, 2], bl: [-2, 2], tipF: 1, eye: 'O' }, (p, g) => dust(p, g.x(3), g.gy, 0.3, 43, 6, 3));
  S({ dx: -2, lean: -1, fa: [2, 2, 4, 1], ba: [-2, 1, -3, 0], fl: [2, 2], bl: [-1, 2], eye: 'o' }, (p, g) => dust(p, g.x(2), g.gy, 0.7, 43, 6, 3));
  S({ dx: -3, ...STAND, eye: '-' });
  return F;
}

// --- running (the stick's knob): a 6-frame run cycle
function runFrames() {
  const F = [];
  const cyc = [
    { fl: [2, 1], bl: [-3, 2], fa: [2, 2, 4, 1], ba: [-2, 2, -3, 4], lift: 1 },
    { fl: [1, 2], bl: [-1, 1], fa: [1, 3, 3, 3], ba: [-1, 3, -1, 5], lift: 0 },
    { fl: [-1, 2], bl: [1, 1], fa: [0, 3, -1, 5], ba: [1, 2, 3, 2], lift: 1 },
    { fl: [-2, 2], bl: [2, 1], fa: [-1, 3, -2, 5], ba: [2, 2, 4, 1], lift: 2 },
    { fl: [0, 1], bl: [0, 2], fa: [1, 3, 2, 4], ba: [0, 3, 1, 5], lift: 0 },
    { fl: [2, 1], bl: [-2, 2], fa: [2, 2, 4, 2], ba: [-1, 3, -2, 4], lift: 1 },
  ];
  for (const c of cyc) F.push(c);
  return F;
}

const SCENES = { dig: digFrames, jump: jumpFrames, crouch: crouchFrames, use: useFrames, snack: snackFrames, tool: toolFrames, block: blockFrames, build: buildFrames, rotate: rotateFrames, done: doneFrames, back: backFrames };

/**
 * Timing per action (src/ui/TouchControls.js): idle frames 0 (rest), 1 (breath), 2 (blink); act = the
 * press loop (frame index, ms); mode: 'loop' (repeats while held), 'once' (plays through), 'hold'
 * (plays to its last frame and stays there while held).
 */
export const TOUCH_ACTS = {
  dig: { act: [[3, 110], [4, 90], [5, 140], [6, 110], [7, 120]], mode: 'loop' },
  jump: { act: [[3, 90], [4, 90], [5, 150], [6, 110], [7, 160]], mode: 'once' },
  crouch: { act: [[3, 90], [4, 120]], low: [[4, 700], [5, 500], [4, 600], [6, 140]], mode: 'toggle' },
  use: { act: [[3, 110], [4, 110], [5, 120], [6, 260]], mode: 'once' },
  snack: { act: [[3, 140], [4, 160], [5, 150], [6, 150], [5, 150], [7, 360]], mode: 'once' },
  tool: { act: [[3, 90], [4, 100], [5, 100], [6, 260]], mode: 'once' },
  block: { act: [[3, 80], [4, 120]], hold: [[4, 420], [5, 120], [6, 160], [4, 600]], mode: 'hold' },
  build: { act: [[3, 110], [4, 130], [5, 110], [6, 200]], mode: 'once' },
  rotate: { act: [[3, 110], [4, 130], [5, 220]], mode: 'once' },
  done: { act: [[3, 110], [4, 110], [5, 280]], mode: 'once' },
  back: { act: [[3, 110], [4, 130], [5, 220]], mode: 'once' },
};

const OPT = { detail: false };
const lists = new Map();
const listOf = (action, big) => {
  const k = action + (big ? ':1' : ':0');
  if (!lists.has(k)) lists.set(k, (SCENES[action] || SCENES.use)(big));
  return lists.get(k);
};
/** How many frames an action's scene has. */
export const sceneCount = (action, big = false) => listOf(action, big).length;
/** One frame's data URL (drawn on first use, then cached). big: the hold-to-dig button's larger window. */
export function sceneFrame(action, big = false, i = 0) {
  const fn = listOf(action, big)[i];
  if (!fn) return null;
  return art(`tsc:${action}:${big ? 1 : 0}:${i}`, () => {
    const G = GEO[big ? 'big' : 'small'];
    return fn({ ...G, gy: G.C + 7, x: (dx) => G.C + dx, y: (dy) => G.C + dy, big });
  }, OPT);
}
/** Every frame of an action (drawn now). */
export function sceneFrames(action, big = false) {
  return listOf(action, big).map((_, i) => sceneFrame(action, big, i));
}

// ---------------------------------------------------------------- the stick's knob: a brass boss with the mole running on it
/** One 24×24 knob frame: 0 standing, 1..6 the run cycle (facing right; mirrored for left). */
export function knobFrame(i = 0, left = false) {
  const cyc = runFrames();
  if (i > cyc.length) return null;
  return art(`tknob:${left ? 1 : 0}:${i}`, () => {
    const p = knobBase();
    const m = new Px(24, 24);
    const pose = i === 0 ? { ...STAND } : { lean: 1, look: 'level', eye: i % 3 ? 'o' : 'x', ...cyc[i - 1] };
    drawMole(m, 24, 24, { bx: 11, gy: 19, ...pose, lift: pose.lift || 0 });
    // the mole inlaid on the medallion (kept inside its rim), mirrored when running left; speed lines
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      if (!m.a(x, y)) continue;
      const sx = left ? 23 - x : x;
      if ((sx + 0.5 - 11.5) ** 2 + (y + 0.5 - 11.5) ** 2 > 9.2 * 9.2) continue;
      for (let j = 0; j < m.r; j++) for (let k = 0; k < m.r; k++) {
        const fx = x * m.r + k, fy = y * m.r + j;
        if (!m.fa(fx, fy)) continue;
        p.fset(left ? 24 * m.r - 1 - fx : fx, fy, m.fget(fx, fy), m.fa(fx, fy));
      }
    }
    if (i > 0) for (let k = 0; k < 3; k++) p.fline(left ? 19 - k * 0.5 : 4 + k * 0.5, 9 + k * 2.5, left ? 21 - k * 0.5 : 2 + k * 0.5, 9 + k * 2.5, 0xfff6cc, 150);
    return p;
  }, OPT);
}
/** All knob frames for one direction. */
export function knobFrames(left = false) {
  const out = [];
  for (let i = 0; i <= runFrames().length; i++) out.push(knobFrame(i, left));
  return out;
}
function knobBase() {
  // a turned brass boss with a recessed vellum medallion and a knurled rim
  const p = new Px(24, 24);
  const c = 11.5;
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, a = Math.atan2(dy, dx);
    const R = 10.6 + Math.sin(a * 7 + 1.3) * 0.25 + (h2(Math.round(a * 9), 1, 77) - 0.5) * 0.3;
    const d = Math.hypot(dx, dy);
    if (d > R) continue;
    const lit = -(dx + dy) / (d * Math.SQRT2 || 1);
    let col;
    if (d > R - 1.3) col = tone(BR, 0.42 + lit * 0.3 + ((Math.floor((a + Math.PI) * 10) & 1) ? 0.12 : -0.08));
    else if (d > 9.6) col = tone(BR, 0.55 + lit * 0.4);
    else if (d > 8.9) col = tone(BR, 0.3 - lit * 0.2);
    else col = tone(VEL, paperK(x, y, 5) + 0.12 - Math.max(0, d - 6) * 0.06 - (lit > 0.3 && d > 7 ? 0.1 : 0));
    p.set(x, y, col);
  }
  p.outline(INK);
  return p;
}

// ---------------------------------------------------------------- button faces
/**
 * A forged roundel S×S (+1 row for its drop): hammered iron with a ragged edge and hammer facets,
 * brass rivets round it, (big: an oxblood leather wrap, saddle-stitched), a turned brass bezel with
 * engraved notches, and the vellum window (radius R) the scene shows through.
 */
function roundel(S, R, down, big) {
  const c = S / 2, oy = down ? 1 : 0;
  const p = new Px(S, S + 1);
  // from the outside in: iron (rIron..the ragged edge), the big one's leather wrap (rBez..rIron),
  // the brass bezel (rLip..rBez), its inner lip (R..rLip), the vellum
  const rOut = c - 0.6, rLip = R + 0.8, rBez = R + (big ? 2 : 2.1), rIron = big ? R + 3.5 : rBez;
  const edge = (a) => rOut - 0.55 + Math.sin(a * 9 + 0.7) * 0.25 + (vnoise(a * 4 + 9, 1, 91) - 0.5) * 0.9;
  for (let y = 0; y < S + 1; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c - oy, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    const lit = -(dx + dy) / (d * Math.SQRT2 || 1);
    if (!down) { const dd = Math.hypot(dx, dy - 1.4); if (d > edge(a) && dd <= edge(a)) { p.set(x, y, 0x0c0806, 150); continue; } }
    if (d > edge(a)) continue;
    let col;
    if (d > rIron) {
      // hammered iron: facets from a coarse noise, the outer lip catching the light
      const fac = vnoise(x / 2.3, y / 2.3, big ? 93 : 92);
      let k = 0.36 + lit * 0.2 + (fac - 0.5) * 0.36;
      if (d > edge(a) - 0.9) k = lit > 0.2 ? 0.8 : lit > -0.3 ? 0.48 : 0.16;
      else if (d < rIron + 0.7) k = lit > 0 ? 0.14 : 0.62;
      col = tone(IR, k + (down ? -0.08 : 0));
    } else if (d > rBez) {
      // (big) the oxblood leather wrap, saddle-stitched round its middle
      let k = 0.46 + lit * 0.16 + (vnoise(x / 1.4, y / 1.4, 95) - 0.5) * 0.18;
      if (d > rIron - 0.6) k -= 0.18;
      else if (d < rBez + 0.6) k += lit > 0 ? -0.2 : 0.1;
      col = tone(RAMP.ox, k);
      const st = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 56);
      if (Math.abs(d - (rBez + rIron) / 2) < 0.5 && st % 2 === 0) col = st % 4 === 0 ? 0xf4e2b4 : 0xd8c08a;
    } else if (d > rLip) {
      // the brass bezel: a convex turned ring, notched every 30°
      const t = (d - rLip) / (rBez - rLip);
      let k = 0.32 + lit * 0.3 + Math.sin(t * Math.PI) * 0.3;
      const deg = (((a * 180) / Math.PI) + 450) % 30;
      if (deg < 5 && t > 0.15 && t < 0.9) k = 0.14;
      col = tone(BR, k + (down ? -0.06 : 0));
    } else if (d > R) {
      col = tone(BR, lit > 0 ? 0.14 : 0.72); // the bezel's inner lip (in shade where it faces the light)
    } else {
      // the vellum: fibrous, darker under the bezel's top-left lip, foxed toward the rim
      let k = paperK(x, y, big ? 7 : 6) + 0.16 - Math.max(0, d - R + 3) * 0.05;
      if (lit > 0.2 && d > R - 1.6) k -= 0.18;
      if (down) k -= 0.1;
      col = tone(VEL, k);
    }
    p.set(x, y, col);
  }
  // rivets round the iron (brass), set between the notches
  const n = big ? 8 : 4, rr = (rIron + rOut) / 2 - 0.2;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2 - Math.PI / 2;
    rivet(p, Math.round(c - 1 + Math.cos(a) * rr), Math.round(c - 1 + oy + Math.sin(a) * rr), false, BR);
  }
  // fine: a bright arris on the iron's lit lip, a scratch, glints on the bezel
  for (let k = 0; k < 9; k++) { const a = rad(200 + k * 6); p.dot(c + Math.cos(a) * (rOut - 0.9), c + oy + Math.sin(a) * (rOut - 0.9), 0xd8d6e0, 180); }
  p.dot(c - (R + 1) * 0.7, c + oy - (R + 1) * 0.7, 0xffffff);
  p.fline(c + rIron * 0.4, c + oy + rIron * 0.85, c + rIron * 0.6, c + oy + rIron * 0.75, IR[6], 140);
  return p;
}

const FACE_O = { detail: false, edges: true };
export const TART = {
  face: (down = false) => art('tface' + (down ? 1 : 0), () => roundel(30, 10.5, down, false), FACE_O),
  bigFace: (down = false) => art('tbig' + (down ? 1 : 0), () => roundel(40, 14.5, down, true), FACE_O),
  frames: sceneFrames,
  frame: sceneFrame,
  count: sceneCount,
  knob: knobFrames,
  knobFrame,
};
export { shadeC };
