// 32×32 icons: caught critters (reusing the creature sprites) and creature drops.
import { mat, mix } from './color.js';
import { vol, fill, sparkle, hash2 } from './shade.js';
import { M, ring, lineIn } from './parts.js';
import { CRITTER_DRAW } from '../critters32.js';

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };

/** Center the opaque content of pc in the 32×32 frame. */
function center(pc, dy = 0) {
  const b = pc.bounds(128);
  if (!b) return;
  const dx = Math.round((32 - (b.x1 - b.x0 + 1)) / 2) - b.x0;
  const ddy = Math.round((32 - (b.y1 - b.y0 + 1)) / 2) - b.y0 + dy;
  if (dx || ddy) pc.shift(dx, ddy);
}

// ---------------------------------------------------------------- caught critters
function wormItem(pc) {
  // a happy worm curled into an S
  const R = mat(0xe89a9a, { cont: 1.05 });
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * Math.PI * 2.1;
    pts.push([16 + Math.sin(a) * 8 * (1 - t * 0.2), 5 + t * 22]);
  }
  const m = M();
  pts.forEach(([x, y], i) => m.disk(x, y, i > 36 ? 2.9 : 2.5 - (i < 4 ? (4 - i) * 0.3 : 0)));
  ring(pc, m, R);
  vol(pc, m, R, { round: 2.4, spec: 0.86 });
  for (let i = 3; i < 36; i += 3) { const [x, y] = pts[i]; pc.set(x + 1, y, R[4]); }
  for (let i = 24; i <= 28; i++) { const [x, y] = pts[i]; pc.set(x, y, mix(R[3], 0xc8606a, 0.5)); pc.set(x - 1, y, mix(R[2], 0xc8606a, 0.4)); }
  const [hx, hy] = pts[40];
  pc.set(hx + 1, hy - 1, 0x1a1220); pc.set(hx - 1, hy - 1, 0x1a1220);
  pc.set(hx, hy + 1, 0xb85a64);
}

function critterItem(pc, id, frame) {
  CRITTER_DRAW[id](pc, frame);
  center(pc);
}

// ---------------------------------------------------------------- drops
function dustFluff(pc) {
  const R = mat(0xd6cbbc, { cont: 1 });
  // a puffball made of overlapping round tufts
  const m = M();
  const tufts = [[16, 17, 8], [9, 19, 5], [23, 19, 5], [12, 12, 5], [20, 11.5, 5.2], [16, 23, 5.5], [8, 14, 3.4], [25, 14, 3.4]];
  for (const [x, y, r] of tufts) m.disk(x, y, r);
  ring(pc, m, R, { lit: R[4], dark: R[5] });
  vol(pc, m, R, { round: 7 });
  // each tuft gets its own soft rim so the fluff reads as clumps
  for (const [x, y, r] of tufts) M().disk(x, y, r).and(m).edge().each((X, Y) => { if (m.get(X + 1, Y + 1) && (X - x) + (Y - y) > r * 0.6) pc.set(X, Y, R[4]); });
  m.each((x, y) => { if (hash2(x, y, 4) < 0.1) { const k = R.indexOf(pc.getHex(x, y)); if (k > 1) pc.set(x, y, R[k - 1]); } });
  for (const pts of [[[4, 12], [2, 9], [3, 6]], [[28, 12], [30, 9]], [[22, 28], [25, 30]]]) for (let i = 0; i + 1 < pts.length; i++) lineIn(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], R[3]);
  sparkle(pc, 13, 10, 1, 0xffffff, R[1]);
}

function batGuano(pc) {
  const R = mat(0x6a5236, { cont: 1.05 });
  // a little heap of pellets
  const pel = [[9, 24, 4], [16, 25, 4.4], [23, 24, 4], [12, 19, 3.8], [20, 19, 3.8], [16, 14, 3.4]];
  for (const [x, y, r] of pel) {
    const m = M().ellipse(x, y, r, r * 0.8);
    ring(pc, m, R); vol(pc, m, R, { round: 2, spec: 0.9 });
  }
  // chalky white specks
  for (const [x, y] of [[8, 23], [15, 24], [22, 22], [12, 18], [19, 18], [16, 13], [25, 25]]) pc.set(x, y, 0xf0eadc);
  // tiny fly buzzing about
  pc.set(26, 8, 0x2a2a30); pc.set(25, 7, 0xc8d8f0, 200); pc.set(27, 7, 0xc8d8f0, 200);
  for (let i = 0; i < 4; i++) pc.set(22 - i * 1.5, 10 + (i % 2), 0x8a7a5a, 140);
}

function crabShell(pc) {
  const R = mat(0xc06a3c, { cont: 1.15 });
  // carapace from above: wide front with spiky rim, rounded back
  const m = M().fn((x, y) => {
    const dx = (x + 0.5 - 16) / 13, dy = (y + 0.5 - 17) / 10;
    return dy > -0.55 ? dx * dx + dy * dy <= 1 : Math.abs(dx) < 0.85 - (-0.55 - dy) * 1.2;
  });
  for (let i = 0; i < 5; i++) { const x = 7 + i * 4.5; m.poly([[x - 1.5, 9], [x, 5.5], [x + 1.5, 9]]); }
  ring(pc, m, R);
  vol(pc, m, R, { round: 5, spec: 0.85, tex: (x, y) => (hash2(Math.floor(x / 2), Math.floor(y / 2), 3) - 0.5) * 0.25 });
  // eye notches, groove lines, rocky lichen patches
  for (const x of [12, 20]) { pc.set(x, 9, R[6]); pc.set(x + 1, 9, R[5]); }
  lineIn(pc, 16, 11, 16, 25, R[4], m);
  for (const [x0, y0, x1, y1] of [[8, 14, 13, 17], [24, 14, 19, 17], [9, 21, 13, 19], [23, 21, 19, 19]]) lineIn(pc, x0, y0, x1, y1, R[4], m);
  for (const [x, y] of [[11, 22], [21, 12], [22, 23]]) { pc.set(x, y, 0x8a8478); pc.set(x + 1, y, 0x6a645c); }
  pc.set(10, 13, 0x6a9a4a); pc.set(11, 13, 0x8ac06a);
}

function slugSlime(pc) {
  const R = mat(0x7ad890, { cont: 1.1 });
  // glossy droplet puddle
  const m = M().ellipse(16, 23, 12, 5.5).union(M().ellipse(16, 15, 6.5, 8)).union(M().poly([[12, 10], [16, 2], [20, 10]]));
  ring(pc, m, R);
  vol(pc, m, R, { spec: 0.72, shine: 8, round: 4 });
  // metal flecks
  for (const [x, y, c] of [[14, 15, 0xf2c23a], [18, 19, 0xd8dde6], [11, 23, 0xd9773f], [21, 24, 0xf2c23a], [16, 25, 0xd8dde6]]) { pc.set(x, y, c); pc.set(x + 1, y, mix(c, 0x2a6a3a, 0.4)); }
  sparkle(pc, 13, 9, 1, 0xffffff, R[0]);
  pc.set(9, 21, R[0]); pc.set(10, 21, R[1]);
}

function spiderSilk(pc) {
  // wooden spool wound with glittering silk + a loose strand
  const WD = mat(0xa87444, { cont: 1.05 });
  const SK = mat(0xf2f6fa, { cont: 0.85, hs: 0.4, sat: 0.6 });
  const top = M().ellipse(16, 7, 9, 3), bot = M().ellipse(16, 26, 9, 3);
  const core = M().rect(9, 8, 14, 17);
  ring(pc, bot, WD); vol(pc, bot, WD, { round: 1.5 });
  ring(pc, core, SK);
  vol(pc, core, SK, { mode: 'cyl', axis: Math.PI / 2, spec: 0.8 });
  core.each((x, y) => { if ((y + (x % 3 === 0 ? 1 : 0)) % 2 === 0) { const k = SK.indexOf(pc.getHex(x, y)); if (k >= 0 && k < 5) pc.set(x, y, SK[k + 1]); } });
  ring(pc, top, WD); vol(pc, top, WD, { round: 1.5 });
  const hole = M().ellipse(16, 7, 2, 0.8); fill(pc, hole, WD[6]);
  // loose strand
  for (let i = 0; i < 14; i++) pc.set(23 + i * 0.4, 14 + i + Math.sin(i * 0.8) * 1.2, i % 3 === 0 ? 0xffffff : SK[2]);
  for (const [x, y] of [[12, 12], [19, 18], [14, 21]]) gl(pc, x, y, 0xffffff, 0.5);
  sparkle(pc, 6, 15, 1, 0xffffff, 0xd8ecff);
}

function sparkDust(pc) {
  // a little heap of glowing static dust with arcs jumping off it
  const R = mat(0x5ab8f0, { cont: 1.05 });
  // a little cone of grains with a ragged skyline
  const m = M().fn((x, y) => { const top = 28 - (11 - Math.abs(x + 0.5 - 16)) * 0.95 + (hash2(x, 0, 3) - 0.5) * 2.2; return y < 29 && y >= top && Math.abs(x + 0.5 - 16) < 12.5; });
  ring(pc, m, R);
  vol(pc, m, R, { round: 4, emit: 0.6 });
  m.each((x, y) => { const h = hash2(x, y, 5); if (h < 0.15) gl(pc, x, y, 0xe8faff, 1); else if (h < 0.25) gl(pc, x, y, 0xfff6a0, 0.9); });
  const arc = (pts) => { for (let i = 0; i + 1 < pts.length; i++) lineIn(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0xfff6a0, null, 1); };
  arc([[10, 16], [8, 12], [10, 9], [8, 5]]);
  arc([[21, 15], [24, 11], [22, 8], [25, 4]]);
  for (const [x, y] of [[16, 8], [5, 10], [27, 12]]) gl(pc, x, y, 0xffffff, 1);
}

function emberScale(pc) {
  const R = mat(0xf0642a, { cont: 1.15, warm: 40 });
  // shield-shaped scale, ridged, still warm
  const m = M().poly([[16, 3], [27, 9], [26, 20], [16, 30], [6, 20], [5, 9]]);
  ring(pc, m, R);
  vol(pc, m, R, { round: 6, spec: 0.8, emit: 0.35 });
  for (let i = 0; i < 4; i++) {
    const y = 9 + i * 5;
    for (let x = 7; x < 26; x++) { const yy = y + Math.abs(x - 16) * 0.35; if (m.get(x, yy)) pc.set(x, yy, i % 2 ? R[4] : R[1]); }
  }
  // glowing core line
  for (let y = 6; y < 27; y++) gl(pc, 16, y, y < 14 ? 0xffe08a : 0xffb04a, 1);
  for (const [x, y] of [[4, 4], [28, 6], [27, 26]]) gl(pc, x, y, 0xffb04a, 0.9);
}

function wispEssence(pc) {
  // corked glass vial with a swirling violet wisp
  const GLR = mat(0xd8e4ec, { cont: 0.9 });
  const vial = M().ellipse(16, 21, 9, 9).rect(12, 6, 8, 10);
  ring(pc, vial, GLR);
  vial.each((x, y) => pc.set(x, y, GLR[2], 170));
  // swirl inside, glowing
  const sw = M().ellipse(16, 21, 7, 7);
  sw.each((x, y) => {
    const dx = x + 0.5 - 16, dy = y + 0.5 - 21;
    const a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
    const v = Math.sin(a * 2 + r * 0.9);
    gl(pc, x, y, v > 0.4 ? 0xe8d0ff : v > -0.2 ? 0x9a6ad9 : 0x5a2a9a, 0.85);
  });
  gl(pc, 15, 20, 0xffffff, 1);
  // highlight on the glass + cork
  for (let y = 15; y < 26; y++) pc.set(9 + (y - 15) * 0.1, y, 0xffffff, 200);
  const CK = mat(0xb08050);
  const ck = M().rect(12, 2, 8, 5);
  ring(pc, ck, CK); vol(pc, ck, CK, { mode: 'cyl', axis: Math.PI / 2 });
  for (let x = 12; x < 20; x++) pc.set(x, 7, 0x8a4ab8);
  for (const [x, y] of [[5, 9], [27, 12], [25, 5]]) sparkle(pc, x, y, 1, 0xf0e0ff, 0x9a6ad9, 0.8);
}

// ---------------------------------------------------------------- dispatcher
export function drawFauna(pc, spec) {
  if (spec.k === 'critter') {
    if (spec.t === 'worm') wormItem(pc);
    else if (spec.t === 'beetle') critterItem(pc, 'glow_beetle', 0);
    else if (spec.t === 'fish') critterItem(pc, 'blind_fish', 1);
    else if (spec.t === 'shrimp') critterItem(pc, 'frost_shrimp', 0);
    else return false;
    return true;
  }
  if (spec.k === 'drop') {
    const t = spec.t;
    if (t === 'fluff') dustFluff(pc);
    else if (t === 'guano') batGuano(pc);
    else if (t === 'shell') crabShell(pc);
    else if (t === 'slime') slugSlime(pc);
    else if (t === 'silk') spiderSilk(pc);
    else if (t === 'spark') sparkDust(pc);
    else if (t === 'scale') emberScale(pc);
    else if (t === 'wisp') wispEssence(pc);
    else return false;
    return true;
  }
  return false;
}
