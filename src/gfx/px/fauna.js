// Icons: caught critters (worm, glow beetle, blind fish, frost shrimp) and creature drops.
// Authored on the 32-unit design grid and painted natively at S× (res.js).
// Hand-pixel style on top of lifeKit / gearKit: organic silhouettes in a few flat planes, seams
// between body parts, segment rings, scales, fur fringes, wet sheens and glints; thin parts
// (legs, antennae, threads) are 1px strokes laid over the ink so they stay delicate.
import {
  M, mat, mix, hash2, vnoise, step, ink, inkOf, seam, glint, line, gl, clamp, isTop, isBot, blob, loop, fringe, form, sheen, marks, bumps,
  blade, tube, spline, twinkle, sparkle, shadowOf, liftOf, bead, sweep,
  S, SZ, dc, nc, np, dot, dotE, alphaD, getD, grain, glD, isTopD, isBotD, stepD,
} from './lifeKit.js';
import { CRITTER_DRAW } from '../critters32.js';

/** Center the opaque content of pc in the frame. */
function center(pc, dy = 0) {
  const b = pc.bounds(128);
  if (!b) return;
  const dx = Math.round((pc.w - (b.x1 - b.x0 + 1)) / 2) - b.x0;
  const ddy = Math.round((pc.h - (b.y1 - b.y0 + 1)) / 2) - b.y0 + dy;
  if (dx || ddy) pc.shift(dx, ddy);
}

/** A rotated local frame: u along angle a, v across (+ = right of the heading). */
function frameAt(cx, cy, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const f = {
    p: (u, v) => [cx + u * c - v * s, cy + u * s + v * c],
    uv: (x, y) => { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; return [dx * c + dy * s, -dx * s + dy * c]; },
    ell: (u0, v0, ru, rv) => M().fn((x, y) => { const [u, v] = f.uv(x, y); return ((u - u0) / ru) ** 2 + ((v - v0) / rv) ** 2 <= 1; }),
    fn: (g) => M().fn((x, y) => { const [u, v] = f.uv(x, y); return g(u, v); }),
  };
  return f;
}

/** Rings across a tube (segments): a dark groove with a lit lip just behind it. */
function rings(pc, sw, R, list, o = {}) {
  for (const s of list) {
    const [x, y] = sw.at(s), [x2, y2] = sw.at(Math.min(1, s + 0.01));
    const tx = x2 - x, ty = y2 - y, tl = Math.hypot(tx, ty) || 1;
    const nx = ty / tl, ny = -tx / tl, w = (o.r ? o.r(s) : 3) + 0.5;
    const ux = tx / tl, uy = ty / tl;
    line(pc, x - nx * w, y - ny * w, x + nx * w, y + ny * w, (i, X, Y) => (sw.mask.get(X, Y) ? (step(pc, R, X, Y, o.dk ?? 1, 1, 5), null) : null));
    if (o.lip !== false) line(pc, x - nx * w + ux, y - ny * w + uy, x + nx * w + ux, y + ny * w + uy, (i, X, Y) => (sw.mask.get(X, Y) && hash2(X, Y, 3) < 0.8 ? (step(pc, R, X, Y, -1, 1, 5), null) : null));
  }
}

// ---------------------------------------------------------------- caught critters
function wormItem(pc) {
  const R = mat(0xe8908e, { cont: 1.12 });
  // a plump earthworm looped into an S, head up
  const pts = [[4.5, 25.5], [9.5, 28.4], [16, 27.2], [18, 22], [13.6, 18.4], [9.6, 14], [11.4, 8.6], [17, 6.2], [22.6, 8], [25.6, 12.4], [26.2, 17]];
  const r = (s) => 2.35 + Math.sin(s * Math.PI) * 0.35 - (s > 0.94 ? (s - 0.94) * 10 : 0) - (s < 0.05 ? (0.05 - s) * 14 : 0);
  const sw = tube(pc, pts, r, R, { bias: 0.12, capStart: 0.6, capEnd: 0.9 });
  // segment rings, and the smooth saddle (clitellum) a third of the way from the head
  const segs = [];
  for (let s = 0.06; s < 0.95; s += 0.045) if (s < 0.62 || s > 0.74) segs.push(s);
  rings(pc, sw, R, segs, { r });
  const SD = mat(0xd86a72, { cont: 1.1 });
  sw.mask.eachD((X, Y, x, y) => { const i = Y * SZ + X, s = sw.S[i]; if (s > 0.62 && s < 0.74) pc.set(X, Y, SD[clamp(sw.K[i], 1, 5)]); });
  // wet sheen on the lit side of each loop
  sw.mask.eachD((X, Y, x, y) => {
    const i = Y * SZ + X, s = sw.S[i], v = sw.V[i] / Math.max(0.6, sw.Wd[i]);
    if (sw.K[i] <= 2 && Math.abs(v) > 0.2 && Math.abs(v) < 0.6 && hash2(X, Y, 4) < 0.45 && s > 0.08) pc.set(X, Y, R[0]);
  });
  ink(pc);
  // a happy face: two eye dots and a little smile
  if (S === 1) { pc.set(25, 16, 0x2a1220); pc.set(27, 16, 0x2a1220); pc.set(25, 15, 0xffffff); pc.set(26, 18, mix(R[4], 0x8a2a3a, 0.5)); }
  else {
    // two shiny bead eyes (catchlight up-left) and a little curved smile
    for (const ex of [25, 27]) { const X = ex * S, Y = 15.5 * S; pc.set(X, Y, 0x2a1220); pc.set(X + 1, Y, 0x2a1220); pc.set(X, Y + 1, 0x2a1220); pc.set(X + 1, Y + 1, 0x1a0810); pc.set(X, Y - 1, 0x4a2838); pc.set(X, Y, 0xffffff); }
    const M2 = mix(R[4], 0x8a2a3a, 0.5);
    for (const [dx, dy] of [[0, 0], [1, 1], [2, 1], [3, 1], [4, 0]]) pc.set(25 * S + dx, 18 * S + dy, M2);
  }
  // crumbs of soil clinging on
  for (const [x, y] of [[3, 29], [20, 29], [8, 19]]) { dot(pc, x, y, 0x6a4a32); }
}

function beetleItem(pc) {
  const SH = mat(0x34408c, { cont: 1.15, warm: 290 });
  const GL = mat(0xc4f070, { cont: 1.05 });
  const f = frameAt(16, 17, -1.2);
  // glowing abdomen tip peeking out behind the wing cases
  const L2 = (pts) => loop(pts.map(([u, v, c]) => [...f.p(u, v), c]));
  const tip = L2([[-8.6, -3.2], [-12.4, -2.4], [-13.8, 0.4], [-12.2, 3.2], [-8.6, 3.4]]);
  form(pc, tip, GL, { emit: 1, bias: 0.15 });
  // elytra: two glossy halves with a dark seam and dotted striae
  const E = L2([[5.4, -5.4], [2, -6.6], [-3, -7], [-7.8, -5.8], [-10.6, -3.2], [-11.6, 0.2], [-10.2, 3.4], [-7.4, 6], [-2.6, 6.9], [2.2, 6.5], [5.2, 5.2], [5.8, 0, 1]]);
  const L = E.clone().and(f.fn((u, v) => v < -0.3)), Rt = E.clone().and(f.fn((u, v) => v >= -0.3));
  const [ex, ey] = f.p(-2.4, 0);
  seam(pc, E, 'shadow');
  const KL = form(pc, L, SH, { cx: ex - 2, cy: ey - 1, rx: 8, ry: 8, bias: 0.06 });
  const KR = form(pc, Rt, SH, { cx: ex - 2, cy: ey - 1, rx: 8, ry: 8, bias: 0.02 });
  void KL; void KR;
  E.eachD((X, Y, x, y) => {
    const [u, v] = f.uv(x, y);
    if (Math.abs(v + 0.3) < 0.55) pc.set(X, Y, SH[6]);
    else if (S === 1 ? Math.abs(Math.abs(v) - 3.4) < 0.45 && Math.round(u) % 2 === 0 && u < 4 : (Math.abs(Math.abs(v) - 3.4) < 0.28 || Math.abs(Math.abs(v) - 5.2) < 0.25) && Math.floor(u * 1.6) % 2 === 0 && u < 4 && u > -10) step(pc, SH, X, Y, 1, 1, 5);
  });
  // iridescent sheen: a violet-teal band near the top-left of each wing case
  for (const half of [L, Rt]) sheen(pc, half, (x, y) => ((x + y) % 3 ? 0x8a9aff : 0x7adcd8), { inset: 1, a0: -2.9, a1: -1.3, gap: 4 });
  // pronotum + head
  const pro = L2([[3.4, -4.8], [6, -5.6], [8.6, -4.2], [9.4, -0.4], [8.8, 4], [6.2, 5.4], [3.4, 4.6], [2.8, 0]]);
  seam(pc, pro, 'shadow');
  form(pc, pro, SH, { bias: 0.04 });
  const head = L2([[8.4, -2.6], [10.6, -3.2], [12.2, -1.6], [12.4, 1.4], [10.8, 3.2], [8.4, 2.6]]);
  seam(pc, head, 'shadow');
  form(pc, head, mat(0x262c5a, { cont: 1.15 }), { bias: 0.04 });
  ink(pc);
  // legs (three pairs, knee-jointed) and clubbed antennae as fine strokes
  const D = 0x1c1630, DL = 0x4a4a7a;
  for (const [u, du1, du2] of [[4.5, 2.5, 4.5], [0.5, 0, -0.5], [-4, -2.5, -4.5]]) for (const sd of [-1, 1]) {
    const [ax, ay] = f.p(u, sd * 6.6), [bx, by] = f.p(u + du1, sd * 9.6), [cx2, cy2] = f.p(u + du2, sd * 11.4);
    line(pc, ax, ay, bx, by, (i) => (i ? DL : null));
    line(pc, bx, by, cx2, cy2, D);
  }
  for (const sd of [-1, 1]) {
    const [ax, ay] = f.p(11.6, sd * 1.4), [bx, by] = f.p(14.2, sd * 3.2), [cx2, cy2] = f.p(15.4, sd * 5.2);
    line(pc, ax, ay, bx, by, D); line(pc, bx, by, cx2, cy2, D);
    dot(pc, cx2, cy2, DL);
  }
  const [hx, hy] = f.p(10.4, -1.6); dot(pc, hx, hy, 0xd8e0ff);
  glint(pc, ...f.p(-4, -3.4).map(Math.round), 0);
  for (const [x, y] of [[4, 29], [2, 25], [8, 30]]) glD(pc, x, y, 0xd8ff9a, 0.8);
}

function fishItem(pc) {
  const R = mat(0xf2bcb2, { cont: 1.12 });
  const FN = mat(0xe896ae, { cont: 1.12 });
  const f = frameAt(16.2, 16.6, -0.3);
  const arch = (u) => -0.035 * (u + 2) * (u + 2) + 1.2;
  const hh = (u) => (u >= 0 ? 6.2 * Math.sqrt(Math.max(0, 1 - (u / 10.6) ** 2)) : Math.max(1.4, 6.2 * (1 - Math.pow(-u / 10, 1.7))));
  // forked tail, dorsal and anal fins behind the body, with rays
  const tail = f.fn((u, v) => u < -8.4 && u > -15 && Math.abs(v - arch(u)) < (-8.4 - u) * 0.95 + 1.3 && !(u < -12 && Math.abs(v - arch(u)) < (-12 - u) * 1.5));
  const dorsal = f.fn((u, v) => u > -5 && u < 3.5 && v - arch(u) < -hh(u) + 0.8 && v - arch(u) > -hh(u) - 3.6 + Math.abs(u + 2.6) * 0.5 - (u > 0 ? u * 0.5 : 0));
  const anal = f.fn((u, v) => u > -7.5 && u < -1.5 && v - arch(u) > hh(u) - 0.8 && v - arch(u) < hh(u) + 2.6 - Math.abs(u + 4.5) * 0.7);
  for (const fin of [dorsal, anal, tail]) {
    fin.eachD((X, Y, x, y) => { const [u, v] = f.uv(x, y); const ray = Math.round(fin === tail ? v * 0.8 : u * 0.9) % 2 === 0; pc.set(X, Y, FN[clamp((ray ? 3 : 2) + (v - arch(u) > 0 ? 1 : 0), 1, 5)]); });
  }
  // the body: plump, slightly arched, blunt head
  const body = f.fn((u, v) => u > -10 && u < 10.6 && Math.abs(v - arch(u)) < hh(u));
  seam(pc, body, 'shadow');
  const [bx, by] = f.p(0, 0);
  form(pc, body, R, { cx: bx - 1, cy: by - 1, rx: 11, ry: 8, bias: 0.06, tex: (x, y) => (f.uv(dc(x), dc(y))[1] - 1) * 0.015 });
  // scales: offset rows of little arcs on the flank
  body.clone().erode(1).eachD((X, Y, x, y) => {
    const [u] = f.uv(x, y);
    if (u > 5 || u < -7) return;
    // a scale's dark rim and lit centre (smaller scales at S > 1: 4 px across, rows 3 px apart)
    if (S === 1) { if ((X + (Math.floor(Y / 2) % 2) * 2) % 4 === 0 && Y % 2 === 0) { step(pc, R, X, Y, 1, 1, 5); step(pc, R, X + 1, Y + 1, -1, 1, 5); } return; }
    const row = Math.floor(Y / 3), c = (X + (row % 2) * 2) % 4;
    if (Y % 3 === 0 && c < 2) step(pc, R, X, Y, 1, 1, 5);
    else if (Y % 3 === 1 && c === 2) step(pc, R, X, Y, 1, 1, 5);
    else if (Y % 3 === 1 && c === 0 && hash2(X, Y, 2) < 0.6) step(pc, R, X, Y, -1, 1, 5);
  });
  // gill arc, milky blind eye
  for (let v = -4; v <= 4; v += 1 / S) {
    const [x, y] = f.p(5.4 - v * v * 0.1, v + arch(5)), X = np(x), Y = np(y);
    if (body.get(X, Y) && !isBot(body, X, Y)) { step(pc, R, X, Y, 2, 1, 5); if (S > 1 && body.get(X - 1, Y)) step(pc, R, X - 1, Y, -1, 1, 5); }
  }
  const [ex, ey] = f.p(7.8, arch(8) - 2.2).map(Math.floor);
  if (S === 1) { pc.set(ex, ey, 0xeef2fa); pc.set(ex + 1, ey, 0xcad4e8); pc.set(ex, ey + 1, 0xb4c0d8); pc.set(ex + 1, ey + 1, 0x8a98b8); }
  else {
    // the blind eye: a milky, domed lens in a dark socket ring
    const X = ex * S, Y = ey * S;
    const E = [[-1, 0x6a5a78, 0x6a5a78, 0x6a5a78, -1], [0x6a5a78, 0xffffff, 0xeef2fa, 0xcad4e8, 0x6a5a78], [0x6a5a78, 0xeef2fa, 0xcad4e8, 0xb4c0d8, 0x5a4a66], [0x6a5a78, 0xcad4e8, 0xb4c0d8, 0x8a98b8, 0x5a4a66], [-1, 0x5a4a66, 0x5a4a66, 0x5a4a66, -1]];
    E.forEach((row, j) => row.forEach((c, i) => { if (c >= 0) pc.set(X + i - 1, Y + j - 1, c); }));
  }
  // pectoral fin over the flank
  blade(pc, ...f.p(3.6, arch(3) + 2), ...f.p(-1.8, arch(-2) + 5), 1.8, FN, { veins: 1, rib: false, fold: 0.6 });
  ink(pc);
  const [mx, my] = f.p(10.4, arch(10) + 0.6).map(Math.floor); dot(pc, mx, my, inkOf(R[4]));
  glint(pc, ...f.p(2, arch(2) - 3.6).map(Math.floor), 0);
  for (const [x, y, a] of [[28, 7, 200], [30, 4, 150], [27, 3, 110]]) dot(pc, x, y, 0xe8f6ff, a);
}

function shrimpItem(pc) {
  const R = mat(0xf2846e, { cont: 1.15, warm: 30 });
  const ICE = 0xa8ecff;
  // long whiskers sweeping back over the body
  const pts = [[22, 9.5], [25.8, 14], [25, 20.4], [20, 24.6], [13.2, 25.6], [8.6, 23]];
  const r = (s) => (s < 0.22 ? 4.1 : 4.1 - (s - 0.22) * 3.4);
  // tail fan (behind the last segment)
  for (const [x1, y1] of [[2.6, 20], [3, 25.6], [5.6, 28.6]]) blade(pc, 9.4, 23.4, x1, y1, 2, R, { veins: 0, rib: R[1], fold: 0.8, pow: 1.1 });
  // walking legs and swimmerets on the inner curve
  const LG = mat(0xe86a5a, { cont: 1.1 });
  for (const [x0, y0, x1, y1] of [[21, 14, 17, 16.5], [22, 17, 18, 19.6], [20.5, 20.4, 17.5, 22], [17, 22, 14.6, 21.6]]) tube(pc, [[x0, y0], [x1, y1]], 0.7, LG, { seam: false });
  const sw = tube(pc, pts, r, R, { bias: 0.1, capStart: 0.8, capEnd: 0.3 });
  rings(pc, sw, R, [0.3, 0.42, 0.53, 0.64, 0.75, 0.86], { r });
  // carapace: smooth shell with a ridge, rostrum spike and a stalked eye
  const ros = M().poly([[22, 6.4], [28.6, 2.6], [23.8, 8.6]]);
  seam(pc, ros, 'shadow');
  ros.eachD((X, Y, x, y) => pc.set(X, Y, R[(X + Y) % 2 ? 2 : 3]));
  sw.mask.eachD((X, Y, x, y) => { const i = Y * SZ + X; if (sw.S[i] < 0.2 && Math.abs(sw.V[i]) < 0.6) pc.set(X, Y, R[1]); });
  // frosty tips: the shell edges glaze pale blue
  sw.mask.eachD((X, Y, x, y) => { if (isTop(sw.mask, X, Y) && hash2(X, Y, 5) < 0.35) pc.set(X, Y, mix(ICE, R[1], 0.3)); });
  ink(pc);
  if (S === 1) { pc.set(20, 8, 0x1a1020); pc.set(21, 8, 0x1a1020); pc.set(20, 7, 0x3a2a3a); pc.set(20, 8, 0xffffff); }
  else {
    // a beady stalked eye: glossy black with a white catchlight and a rim of shell colour
    const X = 20 * S, Y = 7 * S;
    for (const [dx, dy, c] of [[0, 0, 0x3a2a3a], [1, 0, 0x2a1a2a], [2, 0, 0x3a2a3a], [-1, 1, 0x3a2a3a], [0, 1, 0xffffff], [1, 1, 0x1a1020], [2, 1, 0x1a1020], [3, 1, 0x2a1a2a], [-1, 2, 0x2a1a2a], [0, 2, 0x1a1020], [1, 2, 0x1a1020], [2, 2, 0x0e0812], [3, 2, 0x2a1a2a], [0, 3, 0x2a1a2a], [1, 3, 0x2a1a2a], [2, 3, 0x2a1a2a]]) pc.set(X + dx, Y + dy, c);
  }
  line(pc, 23, 7, 14, 2, (i) => (i % 5 === 4 ? null : 0xb8443a));
  line(pc, 22, 8, 8, 6, (i) => (i % 6 === 5 ? null : 0xa83a34));
  dot(pc, 14, 2, ICE); dot(pc, 8, 6, ICE);
  glint(pc, 19, 11, 0);
  for (const [x, y] of [[29, 9], [4, 15], [27, 27]]) twinkle(pc, x, y, 0xffffff, ICE, 1, 0.7);
}

function critterItem(pc, id, frame) {
  // the creature sprites are drawn on their own 32-px grid (critters32.js): drawn there, doubled
  if (S === 1) { CRITTER_DRAW[id](pc, frame); center(pc); return; }
  const sm = new pc.constructor(32);
  CRITTER_DRAW[id](sm, frame);
  center(sm);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const a = sm.alpha(x, y);
    if (!a) continue;
    const c = sm.getHex(x, y), g = sm.glowAt(x, y);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { pc.set(x * S + i, y * S + j, c, a); if (g) pc.emit(x * S + i, y * S + j, g); }
  }
}

// ---------------------------------------------------------------- drops
function dustFluff(pc) {
  const R = mat(0xc8c2bc, { cont: 1.02, sat: 0.6, cool: 250 });
  // a dust bunny: a soft, lopsided clump of three puffs in clean flat planes, fuzzy all round,
  // a few wisps drifting off it, one thread of lint caught in it
  const core = loop([[3.6, 21.6], [4.4, 17.6], [7.6, 15.4], [8.6, 11.6], [11.6, 8.6], [15.6, 8.2], [18.6, 10], [21.6, 8.8], [25.4, 10], [27.4, 13.4], [27, 16.6], [29.2, 19.4], [28.4, 23.6], [25, 26.2], [19.6, 26.8], [15.4, 25.8], [11.4, 27], [6.8, 26.2], [4.2, 24.4]]);
  const m = fringe(core, 16, 17, { dens: 0.4, seed: 5, len: 1.3, lean: 0.4 });
  form(pc, m, R, { cx: 14, cy: 15, rx: 14, ry: 11, bias: 0.1, dome: 0.55, hi: 4 });
  // the fuzz: the outermost pixels a touch lighter on the lit side, softer on the shaded side
  m.eachD((X, Y, x, y) => { if (!core.get(X, Y)) step(pc, R, X, Y, isBot(m, X, Y) ? -1 : -1, 1, 5); });
  // the creases between the puffs: soft grooves with a lit lip above them
  for (const P of [[[8.6, 16], [11, 17.6], [13, 20.4], [13.6, 24.4]], [[18.4, 10.6], [18.6, 14], [20.4, 17], [24.6, 18.4]]]) {
    const at = spline(P);
    let last = '';
    for (let i = 0; i <= 30 * S; i++) {
      const [x, y] = at(i / (30 * S)), X = np(x), Y = np(y), k = X + ',' + Y;
      if (k === last || !m.get(X, Y) || isBot(m, X, Y)) continue;
      last = k;
      step(pc, R, X, Y, 1, 1, 5);
      if (m.get(X - 1, Y - 1)) step(pc, R, X - 1, Y - 1, -1, 1, 5);
    }
  }
  ink(pc);
  // wisps: fine combed strands leaving the edge, fading out
  for (const P of [[[8.6, 11.6], [6.4, 9], [5.6, 6.6]], [[12.6, 8.4], [12, 5.6], [13.4, 3.4]], [[25.6, 10.4], [27.6, 8], [29.6, 7.6]], [[28.8, 20.6], [30.6, 21.6]], [[4, 19.6], [1.6, 18.6]], [[22.6, 9], [23.6, 6.4]]]) {
    const at = spline(P);
    for (let i = 0; i <= 12; i++) { const [x, y] = at(i / 12); if (alphaD(pc, Math.floor(x), Math.floor(y)) < 100) dot(pc, x, y, 0xe8e0d4, Math.round(220 - i * 12)); }
  }
  line(pc, 5, 27, 10, 24, 0x7a6ab0); line(pc, 3, 28, 5, 27, 0x7a6ab0); dot(pc, 10, 23, 0x9a8ad0);
  glint(pc, 11, 11, 0); dot(pc, 10, 12, R[0]); dot(pc, 23, 12, R[1]);
}

function batGuano(pc) {
  const R = mat(0x5e4630, { cont: 1.1 });
  // a heap of little rice-shaped pellets, back to front, each with a chalky white cap
  const P = [[11, 18, 0.6, 3.4], [19, 17.5, -0.5, 3.4], [15.5, 14, 0.15, 3], [7, 23.6, 0.25, 3.6], [14, 23, -0.3, 3.8], [21.6, 23.2, 0.4, 3.6], [26, 25.6, -0.2, 2.8], [10.5, 27, -0.1, 3.4], [18.5, 27.4, 0.15, 3.6]];
  P.forEach(([x, y, a, l], i) => {
    const dx = Math.cos(a) * l, dy = Math.sin(a) * l;
    const sw = tube(pc, [[x - dx, y - dy], [x + dx, y + dy]], (s) => 1.9 - Math.abs(s - 0.5) * 0.9, R, { bias: 0.06 });
    marks(pc, sw.mask, R, { dens: 0.2, seed: i + 2, len: 1, lit: false, edge: true });
    // uric cap on one end
    const [cx, cy] = [Math.round(x + dx * 0.9 - 0.5), Math.round(y + dy * 0.9 - 1)];
    if (sw.mask.at(cx, cy)) dot(pc, cx, cy, 0xf2ece0);
    if (sw.mask.at(cx + 1, cy) && i % 2) dot(pc, cx + 1, cy, 0xd8d0c4);
  });
  ink(pc);
  // a fly buzzing about
  dot(pc, 26, 9, 0x1e1a22); dot(pc, 27, 9, 0x2e2a36); dot(pc, 26, 8, 0xd8e8ff, 210); dot(pc, 27, 7, 0xc0d4f0, 170);
  for (let i = 0; i < 5; i++) dot(pc, 24 - i * 1.4, 11 + Math.sin(i * 1.3) * 1.2, 0x8a7a5a, 120);
  glint(pc, 14, 12, 0);
}

function crabShell(pc) {
  const R = mat(0xd0623a, { cont: 1.2, warm: 30 });
  const L = mat(0xd87448, { cont: 1.15 });
  // a whole moulted crab shell: jointed legs, two claws, the broad carapace on top
  const legs = [
    [[8, 17], [4, 16.4], [1.8, 20.4]], [[8.4, 19.6], [4.6, 20.6], [3.4, 25]], [[9.6, 21.6], [7, 24.4], [6.6, 28.6]],
    [[24, 16.6], [28, 15.6], [30.2, 19.6]], [[23.6, 19.4], [27.4, 20.4], [28.8, 24.6]], [[22.4, 21.6], [25, 24.6], [25.6, 28.4]],
  ];
  for (const pts of legs) {
    const sw = tube(pc, pts, (s) => 1.25 - s * 0.45, L, { bias: 0.06, capEnd: 0.2 });
    const [kx, ky] = pts[1];
    if (sw.mask.at(kx, ky)) dot(pc, kx, ky, L[4]);
  }
  // arms and claws reaching forward
  for (const sd of [-1, 1]) {
    const x0 = 16 + sd * 6.4, xc = 16 + sd * 10.6;
    tube(pc, [[x0, 13.4], [16 + sd * 9.4, 11], [xc, 8.6]], 1.6, R, { bias: 0.06 });
    const palm = blob(xc, 7.2, 3.4, 2.7, { seed: 3 + sd, rot: sd * 0.5 });
    seam(pc, palm, 'shadow');
    form(pc, palm, R, { bias: 0.08 });
    blade(pc, xc - sd * 1.6, 5.6, xc - sd * 3.4, 1.4, 1.3, R, { bend: sd * 0.6, rib: false, veins: 0 });
    blade(pc, xc + sd * 1, 5.4, xc + sd * 0.6, 0.8, 1.2, R, { bend: -sd * 0.6, rib: false, veins: 0 });
  }
  // carapace: broad oval, teeth along the front edges, the H of the back plates
  const cx = 16, cy = 17.4, rx = 9.6, ry = 6.8;
  const body = blob(cx, cy, rx, ry, { seed: 5, lump: 0.03, rot: -0.05 });
  for (const a of [3.5, 3.85, 4.2, 5.22, 5.57, 5.92]) {
    const bx = cx + Math.cos(a) * rx * 0.85, by = cy + Math.sin(a) * ry * 0.85;
    const tx = cx + Math.cos(a) * (rx + 2), ty = cy + Math.sin(a) * (ry + 1.8);
    const nx = -Math.sin(a), ny = Math.cos(a);
    body.poly([[bx - nx * 1.4, by - ny * 1.4], [tx, ty], [bx + nx * 1.4, by + ny * 1.4]]);
  }
  seam(pc, body, 'shadow');
  form(pc, body, R, { cx: cx - 1.5, cy: cy - 1, rx: rx + 1, ry: ry + 2, bias: 0.06 });
  bumps(pc, body, R, { dens: 0.08, seed: 3 });
  const g = (pts) => { for (let i = 0; i + 1 < pts.length; i++) line(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], (n, X, Y) => (body.get(X, Y) && body.get(X + 1, Y + 1) ? (step(pc, R, X, Y, 2, 1, 5), step(pc, R, X + 1, Y + 1, -1, 1, 5), null) : null)); };
  g([[13, 13], [14, 17], [13, 21]]); g([[19, 13], [18, 17], [19.4, 21]]); g([[14, 17], [18, 17]]);
  // eye stalks in the front notch
  for (const x of [14, 18]) { dot(pc, x, 11, R[2]); dot(pc, x, 10, 0x1a1018); }
  ink(pc);
  dot(pc, 14, 10, 0x2a1a20); dot(pc, 18, 10, 0x2a1a20);
  glint(pc, 11, 14, 0); dot(pc, 5, 6, R[0]); dot(pc, 25, 6, R[0]);
}

function slugSlime(pc) {
  const R = mat(0x5ccc80, { cont: 1.2 });
  // a goopy dollop: a puddle, a plump body and a drooping curl on top, drips running down
  const m = blob(15.5, 25.6, 13.4, 4.2, { seed: 5, lump: 0.12, flat: 0.8 })
    .union(blob(15, 19.4, 8.6, 7, { seed: 3, lump: 0.1 }))
    .union(blob(17.4, 12.4, 4.6, 3.8, { seed: 8, lump: 0.08, rot: 0.4 }))
    .union(blob(20.6, 9.4, 2, 2.4, { seed: 2, lump: 0.1, rot: 0.6 }))
    .union(blob(22, 12.2, 1.4, 1.6, { seed: 9 }));
  for (const [x, y0, y1, r] of [[7.6, 19, 24.6, 1.2], [23.6, 17.6, 22.6, 1.1], [12, 22, 27, 0.9]]) m.union(M().capsule(x, y0, x - 0.3, y1, [r * 0.8, r * 1.25]));
  seam(pc, m, 'shadow');
  form(pc, m, R, { cx: 14, cy: 19, rx: 12, ry: 11, bias: 0.12 });
  sheen(pc, m, R[0], { inset: 1, a0: -2.95, a1: -1.5, gap: 4 });
  // the curl folds over itself: a dark crease under it
  if (S === 1) { for (const [x, y] of [[14, 15], [15, 16], [16, 16], [17, 16], [18, 16], [19, 15]]) if (m.get(x, y)) step(pc, R, x, y, 2, 1, 5); }
  else line(pc, 13.8, 15.2, 19.4, 15.4, (i, X, Y) => (m.get(X, Y) ? (step(pc, R, X, Y + (Math.abs(i - 5.5) < 3 ? 1 : 0), 2, 1, 5), step(pc, R, X, Y + (Math.abs(i - 5.5) < 3 ? 2 : 1), 1, 1, 5), null) : null));
  // bubbles and swallowed metal flecks
  for (const [x, y, r] of [[12.5, 20, 1.6], [19, 22.5, 1.2], [6.5, 26, 1.1], [24.5, 26.4, 0.9]]) {
    blob(x, y, r + 0.2, r, { seed: (x * 3) | 0, lump: 0.25 }).edge().each((X, Y) => { if (m.get(X, Y)) pc.set(X, Y, (X + 0.5) / S - x + (Y + 0.5) / S - y < 0 ? R[1] : R[4]); });
  }
  for (const [x, y, c] of [[17, 19, 0xf2c23a], [15, 25, 0xd8dde6], [21, 26, 0xd9773f], [9, 22, 0xf2c23a]]) { dot(pc, x, y, c); dot(pc, x + 1, y + 1, mix(c, 0x1a4a2a, 0.55)); }
  ink(pc);
  glint(pc, 11, 15, 0); dot(pc, 12, 16, R[0]); dot(pc, 15, 10, R[0]);
  glint(pc, 4, 24, 0);
}

function spiderSilk(pc) {
  const SK = mat(0xdce4ee, { cont: 1.18, hs: 0.5, sat: 0.5, cool: 235 });
  const W = mat(0x7a5232, { cont: 1.1 });
  // crystal-spider silk wound onto a twig: a spindle-shaped hank of silvery thread crossed in
  // diagonal windings, the twig's ends poking out, a loose thread trailing with a dew bead
  tube(pc, [[4.4, 27.2], [10, 21.6], [22, 10.4], [27.6, 5]], (s) => 1.25 - Math.abs(s - 0.5) * 0.5, W, { bias: 0.06 });
  // the hank: an elongated, lumpy spindle along the twig (local u along, v across)
  const ax = [0.73, -0.68], nx = [0.68, 0.73], cx = 15.8, cy = 15.8;
  const P = [];
  const prof = [[-10.6, 0.6], [-9, 2.6], [-6.4, 4.8], [-3, 6.2], [0.4, 6.6], [3.6, 6], [6.6, 4.4], [9, 2.4], [10.4, 0.5]];
  for (const [u, w] of prof) P.push([cx + ax[0] * u + nx[0] * w, cy + ax[1] * u + nx[1] * w]);
  for (const [u, w] of prof.slice().reverse()) P.push([cx + ax[0] * u - nx[0] * w * 0.92, cy + ax[1] * u - nx[1] * w * 0.92]);
  const m = loop(P.map(([x, y], i) => [x + (hash2(i, 1, 6) - 0.5) * 0.8, y + (hash2(i, 2, 6) - 0.5) * 0.8]));
  seam(pc, m, 'shadow');
  const K = form(pc, m, SK, { cx: 13, cy: 13, rx: 10, ry: 10, bias: 0.04, lo: 2 });
  // windings: two families of crossing threads, each a raised strand with a shadow under it
  m.eachD((X, Y, x, y) => {
    if (isTop(m, X, Y) || isBot(m, X, Y)) return;
    const u = (x + 0.5 - cx) * ax[0] + (y + 0.5 - cy) * ax[1], v = (x + 0.5 - cx) * nx[0] + (y + 0.5 - cy) * nx[1];
    const p1 = ((u * 0.7 + v * 0.9) % 3.4 + 3.4) % 3.4, p2 = ((u * 0.7 - v * 0.9) % 3.4 + 3.4) % 3.4;
    const k = K[Y * SZ + X], top = (u > -1 && u < 5) ? p2 : p1;
    if (top < 0.8) pc.set(X, Y, SK[clamp(k - 1, 1, 5)]);
    else if (top < 1.6) pc.set(X, Y, SK[clamp(k + 1, 2, 5)]);
  });
  // crystal glitter caught in the thread
  m.eachD((X, Y, x, y) => { const h = hash2(X, Y, 41); if (h < 0.03 && !isBot(m, X, Y)) pc.set(X, Y, h < 0.015 ? 0xe8f8ff : 0xf8e8ff); });
  ink(pc);
  const th = spline([[11.6, 23.4], [12.6, 26.6], [16, 28.2], [19.6, 27], [22.6, 29.4]]);
  let last = '';
  for (let i = 0; i <= 40; i++) { const [x, y] = th(i / 40); const k = Math.floor(x) + ',' + Math.floor(y); if (k === last || m.at(x, y)) continue; last = k; dot(pc, x, y, i % 9 === 4 ? 0xffffff : 0xa8b4c8); }
  dot(pc, 23, 30, 0xe0f4ff); dot(pc, 24, 30, 0x8ab0d8); dot(pc, 23, 31, 0x6a8ab8);
  glint(pc, 11, 10, 1, 0xffffff, 0xe8f4ff);
  for (const [x, y] of [[24, 15], [5, 13]]) twinkle(pc, x, y, 0xffffff, 0xd8ecff, 1, 0.5);
}

function sparkDust(pc) {
  const R = mat(0x4aa8e8, { cont: 1.1 });
  // a little heap of static dust: lumpy, settled, with spilled grains around it
  const heap = blob(15.5, 26.5, 12.6, 6.6, { seed: 3, lump: 0.1, flat: 0.45 })
    .union(blob(11, 22.6, 5, 4, { seed: 5, lump: 0.12 })).union(blob(18.6, 21.4, 5.4, 4.6, { seed: 6, lump: 0.12 })).union(blob(15, 18.6, 3.4, 3.2, { seed: 7 }));
  form(pc, heap, R, { cx: 14, cy: 23, rx: 12, ry: 9, bias: 0.06, emit: 0.55 });
  heap.eachD((X, Y, x, y) => { const h = hash2(X, Y, 5); if (h < 0.1) gl(pc, X, Y, 0xe8faff, 1); else if (h < 0.17) gl(pc, X, Y, 0xfff6a0, 0.9); else if (h > 0.88) step(pc, R, X, Y, 1, 1, 5); });
  for (const [x, y] of [[2, 28], [29, 28], [27, 26], [4, 26]]) { dot(pc, x, y, R[2]); dotE(pc, x, y, 0.5); }
  ink(pc);
  const arc = (pts, c = 0xfff6a0) => { for (let i = 0; i + 1 < pts.length; i++) line(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], (n, X, Y) => (gl(pc, X, Y, n === 0 ? 0xffffff : c, 1), null)); };
  arc([[10, 17], [8, 13], [10, 10], [8, 6]]);
  arc([[21, 16], [24, 12], [22, 9], [25, 5]]);
  arc([[15, 15], [16, 11], [14.6, 9]], 0xbff0ff);
  for (const [x, y] of [[5, 10], [28, 14], [17, 4]]) twinkle(pc, x, y, 0xffffff, 0xfff6a0, 1, 1);
}

function emberScale(pc) {
  const R = mat(0x9a2a24, { cont: 1.15, warm: 20 });
  // a teardrop dragon scale, tipped and curved, with concentric growth ridges and glowing cracks
  const inside = (x, y, k) => {
    const dx = x + 0.5 - 15.5, dy = y + 0.5 - 16 - (1 - k) * 4;
    const u = dx * 0.94 + dy * 0.34, v = -dx * 0.34 + dy * 0.94;
    const t = (v + 13 * k) / (26 * k);
    if (t < 0 || t > 1) return false;
    return Math.abs(u + Math.sin(t * 3) * 0.8) < 11 * k * Math.sin(Math.pow(t, 0.62) * Math.PI) * (1 - t * 0.1);
  };
  const m = M().fn((x, y) => inside(x, y, 1));
  form(pc, m, R, { cx: 13, cy: 14, rx: 12, ry: 13, bias: 0.06, emit: 0.2 });
  for (const k of [0.78, 0.56, 0.34]) {
    const inner = M().fn((x, y) => inside(x, y, k));
    // a raised growth ridge: dark groove just outside each inner contour, lit crest on it
    inner.clone().dilate(1).sub(inner).eachD((X, Y, x, y) => { if (m.get(X, Y) && !isBot(m, X, Y) && !isTop(m, X, Y)) step(pc, R, X, Y, 2, 1, 5); });
    inner.edge().eachD((X, Y, x, y) => { if (!inner.get(X, Y - 1) || !inner.get(X - 1, Y)) step(pc, R, X, Y, -1, 1, 5); });
  }
  ink(pc);
  // molten cracks along the keel
  const crack = [[15, 5], [15, 8], [16, 10], [15, 13], [16, 15], [17, 18], [16, 21], [17, 24]];
  for (let i = 0; i + 1 < crack.length; i++) line(pc, crack[i][0], crack[i][1], crack[i + 1][0], crack[i + 1][1], (n, X, Y) => (gl(pc, X, Y, Y < 12 ? 0xffe08a : 0xffa040, 1), null));
  for (const [x, y] of [[14, 11], [18, 16], [17, 19], [13, 14]]) glD(pc, x, y, 0xff7a2a, 1);
  glint(pc, 10, 10, 0);
  for (const [x, y, c] of [[5, 4, 0xffb04a], [27, 6, 0xffd070], [26, 27, 0xff8a3a]]) glD(pc, x, y, c, 0.9);
}

function wispEssence(pc) {
  const GLR = mat(0xd8e4f0, { cont: 1.05 });
  // round-bellied vial: glass body, swirl of violet wisp inside, cork tied with twine
  const vial = loop([[12.4, 7, 1], [19.6, 7, 1], [19.8, 11.6], [22.6, 13.6], [25.4, 17.2], [25.8, 21.8], [24.2, 26.4], [20.4, 29.4], [15.6, 30.2], [10.6, 29.2], [7.4, 26], [6.4, 21.2], [7.6, 16.4], [10.4, 13.4], [12.2, 11.6]]);
  const lip = loop([[11, 6, 1], [21, 5.8, 1], [21.2, 7.8, 1], [10.8, 8, 1]]);
  vial.union(lip);
  vial.eachD((X, Y, x, y) => pc.set(X, Y, GLR[(x < 13 ? 2 : x > 21 ? 4 : 3)], 185));
  const sw = vial.clone().erode(S === 1 ? 2 : 3).and(M().rect(0, 14, 32, 18));
  sw.eachD((X, Y, x, y) => {
    const dx = x + 0.5 - 16, dy = y + 0.5 - 21.5, a = Math.atan2(dy, dx), r = Math.hypot(dx, dy);
    const v = Math.sin(a * 2 + r * 0.95);
    gl(pc, X, Y, v > 0.55 ? 0xead6ff : v > 0 ? 0xa676e2 : v > -0.5 ? 0x7444b8 : 0x4a2484, 0.85);
  });
  // glass: crisp rim lights, a reflected window, shadowed base
  for (let y = 15; y < 27; y++) { const x = Math.round(16 - Math.sqrt(Math.max(0, 1 - ((y - 21) / 8.8) ** 2)) * 9.4 + 1.2); if (vial.at(x, y) && y % 5) dot(pc, x, y, 0xffffff); }
  for (const [x, y] of [[19, 15], [20, 16], [21, 17]]) dot(pc, x, y, 0xf4f8ff, 230);
  lip.eachD((X, Y, x, y) => pc.set(X, Y, GLR[Math.round(y) === 6 ? 1 : 3]));
  const CK = mat(0xb08050, { cont: 1.1 });
  const ck = M().rect(12, 1, 8, 6).union(M().rect(13, 0, 6, 1));
  seam(pc, ck, 'shadow');
  ck.eachD((X, Y, x, y) => pc.set(X, Y, CK[Math.round(x) === 12 ? 2 : Math.round(x) === 19 ? 4 : hash2(X, Y, 3) < 0.25 ? 4 : 3]));
  for (let x = 11; x < 21; x++) dot(pc, x, 8, (x % 2) ? 0xc8a46a : 0x8a6a40);
  ink(pc, { minA: 150 });
  glD(pc, 14, 19, 0xffffff, 1);
  dot(pc, 22, 9, 0x8a6a40); dot(pc, 23, 10, 0xc8a46a); dot(pc, 23, 11, 0x8a6a40);
  for (const [x, y] of [[5, 9], [27, 12], [26, 4]]) twinkle(pc, x, y, 0xf0e0ff, 0x9a6ad9, 1, 0.8);
}

// ---------------------------------------------------------------- dispatcher
export function drawFauna(pc, spec) {
  if (spec.k === 'critter') {
    if (spec.t === 'worm') wormItem(pc);
    else if (spec.t === 'beetle') beetleItem(pc);
    else if (spec.t === 'fish') fishItem(pc);
    else if (spec.t === 'shrimp') shrimpItem(pc);
    else if (CRITTER_DRAW[spec.t]) critterItem(pc, spec.t, 0);
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
