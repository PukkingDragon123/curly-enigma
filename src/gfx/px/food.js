// 32×32 icons: cooking ingredients, shop snacks and every dish from the stove.
import { mat } from './color.js';
import { vol, fill, sparkle, hash2, vnoise } from './shade.js';
import { M, ring, lineIn } from './parts.js';
import { leaf } from './flora.js';

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };

// ---------------------------------------------------------------- tableware
const WOODB = () => mat(0x9a6438, { cont: 1.05 });
const CERAMIC = () => mat(0xece4d4, { cont: 0.95 });
const CLAY = () => mat(0xc0663a, { cont: 1.05 });

/**
 * Bowl in 3/4 view. Returns the mask of the contents surface so callers can paint food in it.
 * o: cx, y (rim center y), rx, ry (rim radii), h (depth below rim), R (bowl ramp), foot
 */
function bowl(pc, o) {
  const { cx = 16, y = 16, rx = 13, ry = 5, h = 10 } = o;
  const R = o.R || WOODB();
  const body = M().ellipse(cx, y, rx, ry).union(M().ellipse(cx, y + 1, rx, h).sub(M().rect(0, 0, 32, Math.round(y))));
  if (o.foot) body.union(M().rect(cx - rx * 0.45, y + h - 1, rx * 0.9, 2));
  ring(pc, body, R);
  vol(pc, body, R, { mode: 'cyl', axis: Math.PI / 2, flat: 0.2, spec: o.spec });
  // rim: lighter lip, inner wall darker
  const inner = M().ellipse(cx, y, rx - 1.2, ry - 1);
  M().ellipse(cx, y, rx, ry).sub(inner).each((x, yy) => pc.set(x, yy, yy < y ? R[2] : R[1]));
  fill(pc, inner, R[5]);
  if (o.band) for (let x = 0; x < 32; x++) for (let yy = Math.round(y + 2); yy < y + h; yy++) if (body.get(x, yy) && !M().ellipse(cx, y, rx, ry).get(x, yy)) { if (Math.abs(yy - (y + h * 0.45)) < 0.8) pc.set(x, yy, o.band); }
  // the food surface sits a little below the rim
  return M().ellipse(cx, y + 0.6, rx - 1.6, ry - 1.4);
}

/** Flat plate (ellipse) with a raised rim. Returns the inner area mask. */
function plate(pc, o = {}) {
  const { cx = 16, y = 21, rx = 14.5, ry = 6.5 } = o;
  const R = o.R || CERAMIC();
  const base = M().ellipse(cx, y + 1, rx, ry);
  ring(pc, base, R);
  fill(pc, base, R[4]);
  const top = M().ellipse(cx, y, rx, ry);
  fill(pc, top, R[2]);
  const inner = M().ellipse(cx, y + 0.4, rx * 0.72, ry * 0.68);
  fill(pc, inner, R[3]);
  inner.edge().each((x, yy) => { if (yy < y) pc.set(x, yy, R[4]); });
  M().ellipse(cx, y, rx, ry).edge().each((x, yy) => { if (yy < y - 1) pc.set(x, yy, R[1]); });
  if (o.trim) M().ellipse(cx, y, rx - 1.3, ry - 1).edge().each((x, yy) => { if ((x + yy) % 2) pc.set(x, yy, o.trim); });
  return inner;
}

/** Wavy semi-transparent steam wisps. */
function steam(pc, xs, y0 = 9, h = 7) {
  for (const x0 of xs) for (let i = 0; i < h; i++) {
    const x = x0 + Math.sin(i * 0.9 + x0) * 1.2, y = y0 - i;
    pc.set(x, y, 0xffffff, Math.round(200 - i * 22));
  }
}

/** Fill a liquid/food surface with a ramp: lit back edge, darker front, glossy band. */
function surface(pc, m, R, o = {}) {
  const b = m.bounds();
  if (!b) return;
  m.each((x, y) => {
    const v = (y - b.y0) / Math.max(1, b.h), u = (x - b.x0) / Math.max(1, b.w);
    let k = v < 0.25 ? 4 : v < 0.7 ? 3 : 2;
    if (o.gloss && v > 0.3 && v < 0.55 && u > 0.15 && u < 0.45) k = 1;
    pc.set(x, y, R[k]);
    if (o.emit) pc.emit(x, y, o.emit);
  });
}

/** Little chunks scattered on a surface. */
function chunks(pc, m, items, seed = 1) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const b = m.bounds();
  for (const [c, n, size = 1] of items) {
    const R = mat(c, { cont: 1 });
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 12; t++) {
        const x = Math.floor(b.x0 + 1 + rnd() * (b.w - 2)), y = Math.floor(b.y0 + 1 + rnd() * (b.h - 2));
        if (!m.get(x, y) || !m.get(x + size, y + size)) continue;
        pc.set(x, y, R[2]); if (size > 1) { pc.set(x + 1, y, R[3]); pc.set(x, y + 1, R[3]); pc.set(x + 1, y + 1, R[4]); } else pc.set(x + 1, y, R[4]);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- ingredients
function flourSack(pc) {
  const R = mat(0xeee2c4, { cont: 1 });
  const m = M().ellipse(16, 20, 11, 10).poly([[10, 8], [22, 8], [26, 15], [6, 15]]);
  ring(pc, m, R);
  vol(pc, m, R, { round: 6 });
  // flour spilling from the open top
  const top = M().ellipse(16, 8.5, 6.5, 2.4);
  ring(pc, top, R); fill(pc, top, 0xfcf8f0);
  for (const [x, y] of [[13, 8], [17, 7], [19, 9]]) pc.set(x, y, 0xe8dcc0);
  const TW = mat(0xa07040);
  for (let x = 9; x <= 23; x++) { pc.set(x, 11, TW[2]); pc.set(x, 12, TW[4]); }
  // stamped wheat-root mark
  const ST = mat(0xb08a50);
  for (let y = 16; y < 25; y++) pc.set(16, y, ST[3]);
  for (const [x, y] of [[14, 17], [18, 17], [14, 20], [18, 20], [15, 18], [17, 18], [15, 21], [17, 21]]) pc.set(x, y, ST[3]);
  // little flour puff
  for (const [x, y] of [[4, 26], [5, 27], [27, 27], [26, 28]]) pc.set(x, y, 0xffffff, 200);
}

function butter(pc) {
  // butter block on a paper wrapper
  const PP = mat(0xf2ecdc, { cont: 0.9 });
  const paper = M().poly([[2, 20], [18, 13], [30, 18], [14, 26]]);
  ring(pc, paper, PP); fill(pc, paper, PP[2]);
  paper.edge().each((x, y) => { if (y > 18) pc.set(x, y, PP[4]); });
  const R = mat(0xffe07a, { cont: 1.05, warm: 55 });
  const top = M().poly([[7, 14], [17, 9.5], [25, 13], [15, 17.5]]);
  const front = M().poly([[7, 14], [15, 17.5], [15, 23], [7, 19.5]]);
  const side = M().poly([[15, 17.5], [25, 13], [25, 18.5], [15, 23]]);
  ring(pc, top.clone().union(front).union(side), R);
  fill(pc, top, R[1]); fill(pc, front, R[3]); fill(pc, side, R[4]);
  // knife curl and gloss
  lineIn(pc, 8, 14, 16, 17.5, R[0]);
  const curl = M().ellipse(19, 11.5, 2.6, 1.4);
  fill(pc, curl, R[0]); pc.set(20, 12, R[2]);
  sparkle(pc, 11, 12, 1, 0xffffff, R[0]);
}

function buttonMushroom(pc) {
  const ST = mat(0xf0e4cc, { cont: 1 });
  const CP = mat(0xd8b88c, { cont: 1.05 });
  const shroom = (cx, cy, r, h) => {
    const s = M().poly([[cx - r * 0.38, cy], [cx + r * 0.38, cy], [cx + r * 0.44, cy + h], [cx - r * 0.44, cy + h]]);
    ring(pc, s, ST); vol(pc, s, ST, { mode: 'cyl', axis: Math.PI / 2 });
    const g = M().ellipse(cx, cy + 0.4, r * 0.85, r * 0.28);
    const cap = M().ellipse(cx, cy - r * 0.15, r, r * 0.8).sub(M().rect(0, Math.round(cy + 0.4), 32, 32));
    ring(pc, g.clone().union(cap), CP);
    g.each((x, y) => pc.set(x, y, (x % 2) ? 0x9a7a5a : 0x7a5a40));
    vol(pc, cap, CP, { round: r * 0.7, spec: 0.88 });
  };
  shroom(21.5, 15.5, 6, 11);
  shroom(11, 11, 8.5, 17);
}

function rootBeer(pc) {
  const GR = mat(0x7a3a14, { cont: 1.1 });
  const bottle = M().poly([[13, 2], [19, 2], [19, 9], [23, 14], [23, 29], [9, 29], [9, 14], [13, 9]]);
  ring(pc, bottle, GR);
  vol(pc, bottle, GR, { mode: 'cyl', axis: Math.PI / 2, spec: 0.75 });
  // cork + label + foam line
  const CK = mat(0xc89a5a);
  const ck = M().rect(13, 1, 6, 3); ring(pc, ck, CK); fill(pc, ck, CK[2]); pc.set(14, 1, CK[1]);
  const LB = mat(0xf0e0b8, { cont: 0.95 });
  const lb = M().rect(9, 17, 14, 8);
  fill(pc, lb, LB[2]);
  for (let x = 9; x < 23; x++) { pc.set(x, 17, LB[1]); pc.set(x, 24, LB[4]); }
  // little root logo
  for (const [x, y] of [[16, 19], [16, 20], [15, 21], [17, 21], [14, 22], [18, 22]]) pc.set(x, y, 0x8a4a20);
  for (let x = 10; x < 23; x += 2) pc.set(x, 18, 0xc84a3a);
  // reflection streak
  for (let y = 5; y < 28; y++) if (!lb.get(11, y) && bottle.get(11, y)) pc.set(11, y, GR[1]);
  pc.set(14, 11, 0xffffff);
}

function honeyJar(pc) {
  const GL = mat(0xf2a020, { cont: 1.1, warm: 52 });
  const jar = M().ellipse(16, 19, 11, 10).rect(8, 9, 16, 8);
  ring(pc, jar, GL);
  vol(pc, jar, GL, { round: 5, spec: 0.78 });
  // glowing honey glass with drips
  M().ellipse(19, 21, 5, 5).and(jar).each((x, y) => { const k = GL.indexOf(pc.getHex(x, y)); if (k > 1) pc.set(x, y, GL[k - 1]); });
  // cloth lid tied with string
  const CL = mat(0xd84a3a, { cont: 1 });
  const lid = M().ellipse(16, 8.5, 10, 3.6).rect(6, 8, 20, 3);
  ring(pc, lid, CL); vol(pc, lid, CL, { round: 2 });
  for (let x = 6; x < 26; x += 2) pc.set(x, 11, CL[4]);
  for (let x = 7; x < 26; x++) pc.set(x, 12, 0xe8d8b0);
  // honey dipper leaning in
  const DP = mat(0xb08050);
  lineIn(pc, 22, 2, 25, 9, DP[3]); lineIn(pc, 23, 2, 26, 9, DP[4]);
  const head = M().ellipse(22.5, 2.5, 2.2, 1.6); fill(pc, head, DP[2]);
  // drip over the rim
  for (let y = 12; y < 17; y++) pc.set(10, y, GL[2]);
  pc.set(10, 17, GL[1]);
  sparkle(pc, 12, 16, 1, 0xffffff, GL[0]);
  // label
  const lb = M().rect(12, 18, 8, 6); fill(pc, lb, 0xf4ead0);
  for (const [x, y] of [[14, 20], [15, 20], [16, 20], [17, 20], [15, 21], [16, 21], [14, 22], [17, 22]]) pc.set(x, y, 0xc88a20);
}

function egg(pc) {
  const R = mat(0xeedcbc, { cont: 1.05, hs: 0.35, sat: 0.75 });
  const m = M().fn((x, y) => {
    const dx = (x + 0.5 - 16) / 9.5, dy = (y + 0.5 - 17.5) / 12;
    return dx * dx * (1 + dy * 0.35) + dy * dy <= 1;
  });
  ring(pc, m, R);
  vol(pc, m, R, { spec: 0.92, bounce: true });
  for (const [x, y] of [[13, 13], [19, 18], [15, 22], [20, 11], [11, 19]]) pc.set(x, y, R[4]);
  pc.set(12, 10, 0xffffff); pc.set(12, 11, R[0]); pc.set(13, 9, R[0]);
  // a wisp of straw from the nest
  lineIn(pc, 4, 28, 12, 27, 0xd8b050); lineIn(pc, 20, 29, 28, 26, 0xc8a040);
}

// ---------------------------------------------------------------- shop snacks
function grubBar(pc) {
  const WR = mat(0x4a8ac8, { cont: 1.05 });
  const bar = M().poly([[3, 17], [22, 7], [29, 13], [10, 24]]);
  ring(pc, bar, WR);
  vol(pc, bar, WR, { round: 2.5 });
  // torn-open end showing the oat-grub bar
  const BR = mat(0xc89a5a, { cont: 1.05 });
  const open = M().poly([[3, 17], [10, 13.5], [16.5, 20.5], [10, 24]]);
  fill(pc, open, BR[3]);
  open.each((x, y) => { if (hash2(x, y, 4) < 0.3) pc.set(x, y, hash2(x, y, 6) < 0.5 ? BR[1] : BR[5]); });
  for (const [x, y] of [[7, 18], [11, 19], [9, 21]]) { pc.set(x, y, 0xf0e0c0); pc.set(x + 1, y, 0xe0c8a0); }
  // crinkled seam + label stripe
  for (let i = 0; i < 9; i++) pc.set(10 + i * 0.7 + (i % 2), 13.5 + i * 0.75, WR[1]);
  const lb = M().poly([[15, 13], [22, 9.5], [25, 12], [18, 16]]);
  fill(pc, lb, 0xf2c23a);
  lineIn(pc, 17, 13, 22, 11, 0xc84a3a);
}

function teaFlask(pc) {
  const R = mat(0x5a8a5a, { cont: 1.15 });
  const body = M().rect(9, 9, 14, 20).ellipse(16, 28.5, 7, 2).ellipse(16, 9, 7, 2);
  ring(pc, body, R);
  vol(pc, body, R, { mode: 'cyl', axis: Math.PI / 2, spec: 0.72 });
  // cap-cup on top
  const CP = mat(0xc8ccd4, { cont: 1.2 });
  const cap = M().rect(10, 3, 12, 6).ellipse(16, 3, 6, 1.6);
  ring(pc, cap, CP); vol(pc, cap, CP, { mode: 'cyl', axis: Math.PI / 2, spec: 0.8 });
  for (let x = 10; x < 22; x++) pc.set(x, 8, CP[5]);
  // mushroom label band
  for (let x = 9; x < 23; x++) for (let y = 15; y < 22; y++) if (body.get(x, y)) pc.set(x, y, y === 15 || y === 21 ? 0xe8d8b0 : 0xf4ead0);
  const mm = M().ellipse(16, 17.5, 3, 1.6); fill(pc, mm, 0xc89060); pc.set(15, 17, 0xe0b080);
  for (let y = 18; y < 21; y++) pc.set(16, y, 0xe8dcc8);
  steam(pc, [13, 19], 2, 0);
  for (const [x, y] of [[12, 1], [14, 0], [19, 1]]) pc.set(x, y, 0xffffff, 170);
}

function pie(pc, color = 0xc8384a) {
  const CR = mat(0xd89a50, { cont: 1.1 });
  const dish = M().ellipse(16, 21, 14.5, 7.5);
  ring(pc, dish, CR);
  vol(pc, dish, mat(0xb06a3a), { round: 2 });
  const top = M().ellipse(16, 18, 13.5, 7.5);
  vol(pc, top, CR, { round: 3 });
  // lattice with filling peeking through
  const FR = mat(color, { cont: 1.1 });
  M().ellipse(16, 18, 11, 6).each((x, y) => {
    const vx = ((x - 1) % 5 + 5) % 5, hy = ((y - 13) % 3 + 3) % 3;
    if (vx < 2) { pc.set(x, y, vx === 0 ? CR[1] : CR[3]); return; }
    if (hy === 0) { pc.set(x, y, CR[2]); return; }
    pc.set(x, y, FR[hy === 1 ? 2 : 4]);
  });
  // crimped crust edge
  M().ellipse(16, 18, 13.5, 7.5).edge().each((x, y) => pc.set(x, y, (x % 2) ? CR[1] : CR[3]));
  steam(pc, [11, 17, 22], 10, 6);
  sparkle(pc, 9, 15, 1, 0xfff4e0, CR[0]);
}

// ---------------------------------------------------------------- dishes
function dish(pc, id, spec) {
  const c = spec.c || 0xe0a060;
  switch (id) {
    case 'glowcap_soup': {
      const s = bowl(pc, { R: WOODB(), y: 15, h: 11 });
      surface(pc, s, mat(0x5ac8ff, { cont: 1 }), { gloss: true, emit: 0.7 });
      // floating glowcap slices
      for (const [x, y] of [[11, 15], [18, 14], [21, 17]]) { const m = M().ellipse(x, y, 2.2, 1.2); fill(pc, m, 0x2a8ad8, 0); m.each((X, Y) => gl(pc, X, Y, Y < y ? 0xd8f6ff : 0x8ae0ff, 0.9)); }
      for (const [x, y] of [[8, 6], [24, 5], [16, 3]]) gl(pc, x, y, 0xbff0ff, 0.8);
      steam(pc, [12, 20], 10, 6);
      return;
    }
    case 'carrot_stew': {
      const s = bowl(pc, { R: CLAY(), y: 14, h: 12, band: 0xf0d090 });
      surface(pc, s, mat(0xe08a3a, { cont: 1 }));
      chunks(pc, s, [[0xf2a35e, 5, 2], [0xe8d8b0, 3, 2], [0x6aa84a, 3, 1]], 3);
      steam(pc, [10, 16, 22], 9, 7);
      return;
    }
    case 'worm_noodles': {
      const s = bowl(pc, { R: mat(0xd8504a, { cont: 1.05 }), y: 15, h: 11, band: 0xf4e8d0 });
      surface(pc, s, mat(0xe8c890));
      // pink wavy noodles
      for (let k = 0; k < 4; k++) for (let x = 5; x < 28; x++) { const y = 14 + k * 1.3 + Math.sin(x * 0.9 + k * 2) * 0.8; if (s.get(x, y)) pc.set(x, y, k % 2 ? 0xf0a8a8 : 0xe08890); }
      // chopsticks
      lineIn(pc, 14, 15, 27, 1, 0x8a5a30); lineIn(pc, 15, 15, 28, 1, 0xb07a40);
      lineIn(pc, 17, 15, 30, 4, 0x8a5a30); lineIn(pc, 18, 15, 31, 4, 0xb07a40);
      steam(pc, [8, 12], 10, 6);
      return;
    }
    case 'fern_salad': {
      const s = bowl(pc, { R: mat(0x7ab0c8, { cont: 1 }), y: 16, h: 10 });
      // heap of pale fern leaves rising above the rim
      const LR = mat(0xd0dcb8, { cont: 1.1 });
      for (const [x0, y0, x1, y1, b] of [[8, 16, 4, 9, 1], [12, 15, 10, 5, -1], [16, 15, 18, 4, 1], [20, 15, 25, 6, -1], [24, 16, 28, 11, 1], [14, 17, 9, 12, 0], [19, 17, 23, 11, 0]]) leaf(pc, x0, y0, x1, y1, 2.2, LR, { bend: b });
      chunks(pc, M().ellipse(16, 13, 9, 4), [[0xf2a35e, 5, 1], [0xc83a3a, 2, 1]], 7);
      return;
    }
    case 'fried_fish': {
      plate(pc, { trim: 0x6a9ad0 });
      const R = mat(0xe0a848, { cont: 1.1, warm: 50 });
      const fish = M().ellipse(15, 18, 10, 4.5).poly([[23, 18], [30, 13], [29, 23]]);
      ring(pc, fish, R);
      vol(pc, fish, R, { round: 3, spec: 0.8 });
      // crispy batter crumbs + scored lines
      fish.each((x, y) => { if (hash2(x, y, 3) < 0.15) pc.set(x, y, R[1]); });
      for (const x of [11, 15, 19]) lineIn(pc, x, 15, x - 1.5, 20, R[4], fish);
      pc.set(7, 17, 0x2a1a10);
      // herb sprig
      leaf(pc, 4, 24, 9, 21, 1.6, mat(0x5aa84a));
      steam(pc, [13, 18], 12, 6);
      return;
    }
    case 'spicy_omelette': {
      plate(pc, { trim: 0xd8504a });
      const R = mat(0xffd848, { cont: 1.05, warm: 55 });
      const om = M().fn((x, y) => { const dx = (x + 0.5 - 16) / 12, dy = (y + 0.5 - 18) / 6; return dx * dx + dy * dy <= 1 && y + 0.5 < 18 + 3 - Math.abs(dx) * 2 + 3; });
      ring(pc, om, R);
      vol(pc, om, R, { round: 3, spec: 0.85 });
      // fold line + browned spots + chili bits
      for (let x = 6; x < 27; x++) { const y = 17 + Math.sin(x * 0.2) * 0.5; if (om.get(x, y)) pc.set(x, y, R[4]); }
      om.each((x, y) => { if (hash2(x, y, 9) < 0.06) pc.set(x, y, 0xd89a3a); });
      for (const [x, y] of [[10, 15], [15, 14], [20, 15], [13, 19], [22, 19]]) { pc.set(x, y, 0xd8302a); pc.set(x + 1, y, 0x9a1a1a); }
      leaf(pc, 20, 13, 26, 11, 1.3, mat(0x5aa84a));
      return;
    }
    case 'bubble_tea':
    case 'crystal_tea': {
      const crystal = id === 'crystal_tea';
      if (crystal) {
        // teacup on a saucer
        const SC = CERAMIC();
        const sau = M().ellipse(16, 25, 14, 4.5);
        ring(pc, sau, SC); vol(pc, sau, SC, { round: 2 });
        const cup = M().ellipse(15, 13, 10, 3.6).union(M().ellipse(15, 14, 9.5, 10).sub(M().rect(0, 0, 32, 13)));
        ring(pc, cup, SC);
        vol(pc, cup, SC, { mode: 'cyl', axis: Math.PI / 2, flat: 0.2, spec: 0.85 });
        const handle = M().ellipse(26, 17, 3.4, 3.6).sub(M().ellipse(26, 17, 1.8, 2));
        ring(pc, handle, SC); fill(pc, handle, SC[3]);
        const tea = M().ellipse(15, 13, 8.5, 2.6);
        tea.each((x, y) => gl(pc, x, y, y < 13 ? 0xd8f4ff : 0xa8dcf0, 0.5));
        for (let x = 6; x < 25; x++) if (cup.get(x, 20)) pc.set(x, 20, 0x9ad0f0);
        // crystal lily garnish petal
        leaf(pc, 18, 12, 24, 5, 1.8, mat(0xc8ecff, { cont: 1.2 }), { rib: 0xffffff });
        for (const [x, y] of [[6, 6], [10, 3]]) sparkle(pc, x, y, 1, 0xffffff, 0xd8f4ff);
      } else {
        // tall glass with tea, pearls and a fat straw
        const GLR = mat(0xe8eef4, { cont: 0.9 });
        const glass = M().poly([[8, 6], [24, 6], [22, 29], [10, 29]]);
        ring(pc, glass, GLR);
        fill(pc, glass, GLR[2]);
        const tea = M().poly([[8.6, 10], [23.4, 10], [22, 29], [10, 29]]);
        const TR = mat(c, { cont: 1.05 });
        tea.each((x, y) => pc.set(x, y, TR[x < 12 ? 2 : x > 20 ? 4 : 3]));
        // tapioca pearls at the bottom
        for (const [x, y] of [[12, 26], [15, 27], [18, 26], [20, 27], [13, 23], [17, 24], [11, 28], [19, 23]]) { pc.set(x, y, 0x3a2030); pc.set(x + 1, y, 0x5a3a4a); pc.set(x, y - 1, 0x8a6a7a); }
        for (let y = 8; y < 28; y++) pc.set(9 + y * 0.05, y, GLR[0]);
        // foam top + straw
        for (let x = 9; x < 24; x++) pc.set(x, 10, 0xf4ecf8);
        const ST = mat(0xf26aa0, { cont: 1.1 });
        const straw = M().capsule(15, 20, 21, 1, 1.4);
        ring(pc, straw, ST); vol(pc, straw, ST, { mode: 'cyl', axis: -1.25 });
        for (const [x, y] of [[5, 12], [27, 14], [26, 8]]) { pc.set(x, y, 0xe0d0ff); pc.set(x, y - 1, 0xffffff, 180); }
      }
      return;
    }
    case 'zippy_skewer':
    case 'shrimp_skewer': {
      const shrimp = id === 'shrimp_skewer';
      lineIn(pc, 3, 29, 29, 3, 0xc8a070); lineIn(pc, 4, 29, 29, 4, 0x8a6a40);
      const bits = shrimp ? [[9, 23, 0xff9a8a], [15, 17, 0xff8a7a], [21, 11, 0xff9a8a]] : [[9, 23, 0x4a9ae0], [15, 17, 0xe8a0a0], [21, 11, 0x4a9ae0]];
      for (const [x, y, col] of bits) {
        const R = mat(col, { cont: 1.1 });
        const m = shrimp ? M().disk(x, y, 4).sub(M().disk(x + 1.5, y - 1.5, 2)) : M().ellipse(x, y, 4, 3.4);
        ring(pc, m, R);
        vol(pc, m, R, { round: 2.2, spec: 0.85 });
        if (shrimp) for (let k = -2; k <= 2; k += 2) pc.set(x + k, y + 1 + Math.abs(k) * 0.3, R[4]);
        else m.each((X, Y) => { if (hash2(X, Y, 3) < 0.2) pc.set(X, Y, R[1]); });
      }
      if (shrimp) { for (const [x, y] of [[26, 22], [5, 10]]) sparkle(pc, x, y, 1, 0xffffff, 0xbff6ff, 0.6); }
      else { for (const pts of [[[5, 13], [7, 11], [6, 9]], [[25, 18], [27, 16], [26, 14]]]) for (let i = 0; i + 1 < pts.length; i++) lineIn(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0xfff27a, null, 1); }
      return;
    }
    case 'truffle_risotto': {
      const s = plate(pc, { R: mat(0x2e3440, { cont: 1.1 }), y: 20 });
      const RR = mat(0xf2e6c4, { cont: 1.05 });
      const heap = M().ellipse(16, 17, 9.5, 5.5);
      ring(pc, heap, RR); vol(pc, heap, RR, { round: 3 });
      heap.each((x, y) => { if (hash2(x, y, 2) < 0.35) pc.set(x, y, hash2(x, y, 3) < 0.5 ? RR[1] : RR[4]); });
      // truffle shavings
      for (const [x, y] of [[11, 15], [16, 13], [20, 16], [14, 18], [19, 19]]) { const m = M().ellipse(x, y, 1.8, 1); fill(pc, m, 0x5a3a28); pc.set(x - 1, y, 0x8a6a4a); }
      leaf(pc, 21, 13, 25, 9, 1.2, mat(0x5aa84a));
      sparkle(pc, 9, 14, 1, 0xffffff, RR[0]);
      return;
    }
    case 'ember_curry': {
      const s = bowl(pc, { R: mat(0x3a3a44, { cont: 1.1 }), y: 15, h: 11, band: 0xd8a040 });
      surface(pc, s, mat(0xd8501e, { cont: 1 }), { gloss: true });
      // rice mound on one side
      const rice = M().ellipse(20, 13.5, 6, 3.2);
      ring(pc, rice, mat(0xf4f0e4)); fill(pc, rice, 0xf8f4ea);
      rice.each((x, y) => { if (hash2(x, y, 5) < 0.3) pc.set(x, y, 0xe0d8c8); });
      chunks(pc, M().ellipse(10, 16, 5, 2.5), [[0xffb040, 3, 1]], 9);
      // fiery steam
      for (const x0 of [8, 14]) for (let i = 0; i < 7; i++) gl(pc, x0 + Math.sin(i * 0.9 + x0) * 1.2, 9 - i, i < 3 ? 0xff7a2a : 0xffc070, 0.6);
      return;
    }
    case 'frost_parfait': {
      const GLR = mat(0xe8f4f8, { cont: 0.9 });
      const glass = M().poly([[7, 7], [25, 7], [19, 20], [13, 20]]).rect(15, 20, 2, 6).ellipse(16, 27.5, 6, 1.8);
      ring(pc, glass, GLR);
      fill(pc, glass, GLR[2]);
      // layers
      const lay = [[8, 0xffffff], [11, 0x9adcf0], [14, 0xf4f8ff], [17, 0x6ab8e0]];
      for (let y = 8; y < 20; y++) {
        let col = lay[0][1];
        for (const [yy, cc] of lay) if (y >= yy) col = cc;
        for (let x = 8; x < 25; x++) if (glass.get(x, y) && glass.get(x - 1, y) && glass.get(x + 1, y)) pc.set(x, y, col);
      }
      // whipped top + frostbloom garnish
      const top = M().ellipse(16, 6.5, 8.5, 3).ellipse(14, 4.5, 4, 2.5);
      ring(pc, top, mat(0xf0f4f8)); vol(pc, top, mat(0xffffff, { cont: 0.6 }), { round: 2 });
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; gl(pc, 19 + Math.cos(a) * 2, 3 + Math.sin(a) * 2, 0xbff6ff, 0.6); }
      gl(pc, 19, 3, 0xffffff, 0.8);
      for (let y = 8; y < 19; y++) pc.set(9 + (y - 8) * 0.38, y, GLR[0]);
      return;
    }
    case 'sleepy_stew': {
      const s = bowl(pc, { R: WOODB(), y: 16, h: 10 });
      surface(pc, s, mat(0x6a5a8a, { cont: 1 }), { gloss: true });
      chunks(pc, s, [[0x9a7ac0, 4, 2], [0xf0c8a0, 3, 1]], 5);
      // drowsy "z z" wisps
      const Z = (x, y, k) => { lineIn(pc, x, y, x + k, y, 0xd0c0f0); lineIn(pc, x + k, y, x, y + k, 0xd0c0f0); lineIn(pc, x, y + k, x + k, y + k, 0xd0c0f0); };
      Z(18, 6, 3); Z(23, 2, 2); Z(13, 9, 2);
      return;
    }
    case 'whisper_wrap': {
      plate(pc, { R: mat(0xc89060), y: 22 });
      const TR = mat(0xe8c890, { cont: 1.05 });
      // two wrap halves, cut faces showing lavender filling
      for (const [x, y] of [[11, 15], [21, 16]]) {
        const body = M().ellipse(x, y, 6, 5.2);
        ring(pc, body, TR); vol(pc, body, TR, { round: 3 });
        const face = M().ellipse(x + 1, y + 0.5, 4.2, 3.6);
        fill(pc, face, 0xf4ead0);
        face.each((X, Y) => { const d = Math.hypot(X + 0.5 - x - 1, Y + 0.5 - y - 0.5); if (d < 2.6) pc.set(X, Y, d < 1.3 ? 0xd8c0f0 : 0xa080c8); });
        pc.set(x - 2, y - 3, TR[1]);
      }
      for (const [x, y] of [[6, 7], [26, 6], [16, 4]]) gl(pc, x, y, 0xe8d8ff, 0.6);
      return;
    }
    case 'lotus_feast': {
      plate(pc, { R: mat(0xe8c050, { cont: 1.15 }), y: 21, trim: 0xfff0b0 });
      // lotus centerpiece with little dishes around
      const R = mat(0xff8ac8, { cont: 1.15 });
      for (const [a, l] of [[-2.4, 9], [-0.74, 9], [-1.57, 10], [-2.0, 7], [-1.14, 7]]) leaf(pc, 16, 18, 16 + Math.cos(a) * l, 18 + Math.sin(a) * l, 2.6, R, { rib: R[1] });
      const h = M().ellipse(16, 16, 2.6, 2);
      vol(pc, h, mat(0xffd84a), { emit: 1 });
      // truffle slices + honey drizzle
      for (const [x, y] of [[7, 21], [25, 21]]) { const m = M().ellipse(x, y, 2.6, 1.6); fill(pc, m, 0x5a3a28); pc.set(x - 1, y - 1, 0x8a6a4a); }
      for (let x = 10; x < 23; x++) pc.set(x, 23 + Math.sin(x) * 0.6, 0xf2a020);
      for (const [x, y] of [[5, 6], [27, 5], [16, 2]]) sparkle(pc, x, y, 1, 0xffffff, 0xffe08a, 0.9);
      return;
    }
    case 'grub_pancakes': {
      plate(pc, { y: 24 });
      const R = mat(0xe0b070, { cont: 1.05 });
      for (let i = 0; i < 4; i++) {
        const y = 21 - i * 3.2;
        const pk = M().ellipse(16, y, 11 - i * 0.4, 3.4);
        ring(pc, pk, R);
        pk.each((x, yy) => pc.set(x, yy, yy < y - 0.5 ? R[2] : yy < y + 1 ? R[3] : R[4]));
        pk.edge().each((x, yy) => { if (yy > y) pc.set(x, yy, R[5]); });
      }
      // butter pat + honey dripping down the stack
      const bt = M().rect(14, 8, 5, 3); fill(pc, bt, 0xfff0a0); pc.set(14, 8, 0xffffff); pc.set(18, 10, 0xe0c060);
      const HN = mat(0xf2a020, { cont: 1.1 });
      for (const [x, y0, y1] of [[8, 11, 17], [22, 10, 20], [12, 12, 15]]) { for (let y = y0; y < y1; y++) pc.set(x, y, HN[2]); pc.set(x, y1, HN[1]); }
      M().ellipse(16, 10.5, 8, 2).each((x, y) => { if (!bt.get(x, y)) pc.set(x, y, HN[(x + y) % 3 ? 2 : 1]); });
      return;
    }
    case 'deviled_egg': {
      plate(pc, { y: 22, trim: 0x8ac0e0 });
      for (const [x, y] of [[10, 18], [22, 18]]) {
        const W = mat(0xf8f2e6, { cont: 0.9 });
        const half = M().ellipse(x, y, 6, 4.2);
        ring(pc, half, W); vol(pc, half, W, { round: 2.5, spec: 0.9 });
        const yolk = M().ellipse(x, y - 0.8, 3.4, 2.2).ellipse(x - 0.5, y - 2, 2, 1.4);
        ring(pc, yolk, mat(0xd8a020)); vol(pc, yolk, mat(0xffd84a), { round: 1.5 });
        pc.set(x - 1, y - 1, 0xd83a2a); pc.set(x + 1, y - 2, 0xd83a2a);
      }
      leaf(pc, 15, 13, 18, 8, 1.2, mat(0x5aa84a));
      return;
    }
    case 'mystery_mush': {
      const s = bowl(pc, { R: mat(0x8a8a8a, { cont: 1 }), y: 15, h: 11 });
      const MR = mat(0x8a9a5a, { cont: 1.05 });
      const heap = M().ellipse(16, 14, 10, 4).ellipse(14, 12, 5, 3);
      ring(pc, heap, MR); vol(pc, heap, MR, { round: 2.5, tex: (x, y) => (vnoise(x * 0.8, y * 0.8, 4) - 0.5) * 0.5 });
      // bubbles + spoon stuck in + a curious fly
      for (const [x, y] of [[11, 12], [19, 13]]) { pc.set(x, y, MR[1]); pc.set(x + 1, y, MR[0]); }
      const SP = mat(0xb8bcc4, { cont: 1.2 });
      lineIn(pc, 20, 12, 27, 2, SP[2]); lineIn(pc, 21, 12, 28, 2, SP[4]);
      const sp = M().ellipse(27.5, 2, 1.8, 1.4); fill(pc, sp, SP[1]);
      pc.set(6, 5, 0x2a2a30); pc.set(5, 4, 0xc8d8f0, 200); pc.set(7, 4, 0xc8d8f0, 200);
      for (let i = 0; i < 4; i++) pc.set(7 + i, 7 + (i % 2), 0x8a9a6a, 150);
      return;
    }
    default: {
      // generic: colored stew in a bowl
      const s = bowl(pc, { y: 15, h: 11 });
      surface(pc, s, mat(c, { cont: 1 }), { gloss: true });
    }
  }
}

// ---------------------------------------------------------------- dispatcher
export function drawFood(pc, spec, id) {
  switch (spec.k) {
    case 'ingr': {
      const t = spec.t;
      if (t === 'flour') flourSack(pc);
      else if (t === 'butter') butter(pc);
      else if (t === 'mushroom') buttonMushroom(pc);
      else if (t === 'rootbeer') rootBeer(pc);
      else if (t === 'honey') honeyJar(pc);
      else return false;
      return true;
    }
    case 'egg': egg(pc); return true;
    case 'food': {
      const t = spec.t;
      if (id === 'grub_bar' || (!id && t === 'bar')) grubBar(pc);
      else if (id === 'tea_flask' || (!id && t === 'flask')) teaFlask(pc);
      else if (id === 'hearty_pie' || (!id && t === 'pie')) pie(pc, spec.c ? spec.c : 0xc8384a);
      else dish(pc, id, spec);
      return true;
    }
    default: return false;
  }
}
