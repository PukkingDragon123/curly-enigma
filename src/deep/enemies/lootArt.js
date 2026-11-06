// Item icons for creature loot ({ k: 'loot', t, c }): hides, tusks, fangs, claws, teeth, scales,
// plates, feathers, gel, ash, meat, eggs and kobold trinkets. Hand-built on the shared icon kits
// (gfx/px/lifeKit, gearKit) like the other drops: control-point silhouettes, planes lit from the
// top-left, seams, an ink outline, and real-pixel detail (growth rings, fur strokes, stitches,
// barbs, marbling, glints). Authored on the 32-unit design grid, painted natively at S× (res.js).
// Hooked into gfx/PixelArt.js drawIconArt.
import {
  M, mat, mix, hash2, vnoise, ink, seam, form, loop, blade, tube, marks, bumps, speckle, sheen, line, glint, sparkle, stitch,
  step, isTop, isBot, clamp, gl, toneN, S, SZ, nc, np, dc, pits,
} from '../../gfx/px/lifeKit.js';

const P = (pc, X, Y, c) => pc.set(X, Y, c);
function part(pc, m, R, o = {}) {
  if (o.seam !== false) seam(pc, m, 'shadow');
  return form(pc, m, R, o);
}
function facet(pc, pts, R, n, o = {}) {
  const m = M().poly(pts);
  if (o.clip) m.and(o.clip);
  const k = clamp(toneN(n[0], n[1], n[2], o.bias || 0), o.lo ?? 1, o.hi ?? 5);
  m.each((x, y) => { pc.set(x, y, R[k]); if (o.emit) pc.emit(x, y, o.emit); });
  return m;
}
/** A groove across a part: the cut a step darker on ramp R, the lip below-right a step lighter. */
function carve(pc, R, x0, y0, x1, y1, mask = null, dk = 1) {
  const cut = [];
  line(pc, x0, y0, x1, y1, (i, X, Y) => { cut.push(X, Y); return null; }, mask);
  const on = new Set();
  for (let i = 0; i < cut.length; i += 2) on.add(cut[i + 1] * SZ + cut[i]);
  for (let i = 0; i < cut.length; i += 2) step(pc, R, cut[i], cut[i + 1], dk);
  for (let i = 0; i < cut.length; i += 2) {
    const X = cut[i] + 1, Y = cut[i + 1] + 1;
    if (!on.has(Y * SZ + X) && (!mask || mask.get(X, Y))) step(pc, R, X, Y, -1);
  }
}

// ---------------------------------------------------------------- hides & bone
function hide(pc, c) {
  const R = mat(c, { cont: 1.05 }), IN = mat(mix(c, 0xe8d0b0, 0.55), { cont: 0.95 });
  // a pelt pegged out to dry: four leg flaps, a tail, a ragged edge
  const pelt = loop([[16, 3.4], [19.6, 5], [22.6, 4.4], [26.4, 2.8], [27.2, 5.6], [24.6, 9], [25.2, 13.6], [24.6, 18.6], [25.8, 23.2], [28.4, 26.4], [25.4, 27.8], [21.4, 25.6], [17.4, 27], [16, 29.8], [14.6, 27], [10.6, 25.6], [6.6, 27.8], [3.6, 26.4], [6.2, 23.2], [7.4, 18.6], [6.8, 13.6], [7.4, 9], [4.8, 5.6], [5.6, 2.8], [9.4, 4.4], [12.4, 5]], { jit: 0.35, seed: 5 });
  // ragged: little nibbles out of the edge
  pelt.edge().each((X, Y) => { if (hash2(X, Y, 7) < 0.2) pelt.set(X, Y, 0); });
  form(pc, pelt, R, { cx: 15, cy: 15, rx: 11, ry: 13, flatten: 0.5, dome: 0.55, round: 3, bias: 0.06 });
  // fur: short combed strokes running down and out from the spine
  marks(pc, pelt, R, { dens: 0.7, len: 1.6, seed: 3, dir: (X, Y) => [dc(X) < 16 ? -0.5 : 0.5, 1], dk: 1 });
  bumps(pc, pelt, R, { dens: 0.04, seed: 8 });
  // the darker stripe down the back
  pelt.each((X, Y) => { const x = dc(X); if (Math.abs(x - 16 + Math.sin(dc(Y) * 0.4) * 0.4) < 1.3 && dc(Y) > 5 && dc(Y) < 27) step(pc, R, X, Y, 1); });
  // the pale flesh side shows where the edge curls over
  const curl = pelt.clone().sub(pelt.clone().erode(nc(1.2))).and(M().fn((x, y) => x + y > 34));
  curl.each((X, Y) => pc.set(X, Y, IN[isBot(pelt, X, Y) ? 4 : 2]));
  // lacing round the rim
  const pts = [[9.6, 7], [16, 7.4], [22.4, 7], [22.6, 13.6], [22.2, 21.6], [16, 24.4], [9.8, 21.6], [9.4, 13.6], [9.6, 7]];
  stitch(pc, pts, (X, Y) => (pelt.get(X, Y) ? 0xe8d8b0 : null), { gap: 2.4 });
  stitch(pc, pts.map(([x, y]) => [x + 0.5, y + 0.5]), (X, Y) => (pelt.get(X, Y) ? R[5] : null), { gap: 2.4 });
  ink(pc);
}

function tusk(pc) {
  const R = mat(0xeee2c4, { cont: 1.05 }), BR = mat(0x7a5a3a, { cont: 1.1 });
  const sp = [[8.4, 27], [9.6, 21.4], [12.6, 15.4], [17, 10.2], [22.4, 6.6], [27.6, 4.6]];
  const t = tube(pc, sp, (s) => 0.4 + 3.3 * Math.pow(1 - s, 0.8), R, { bias: 0.08, capEnd: 0.1 });
  // growth rings: grooves round the tusk, closer toward the root
  for (const s of [0.1, 0.18, 0.27, 0.37, 0.5, 0.64]) {
    const [x, y] = t.at(s), [x2, y2] = t.at(s + 0.02);
    const tx = x2 - x, ty = y2 - y, l = Math.hypot(tx, ty) || 1, w = 0.4 + 3.3 * Math.pow(1 - s, 0.8) + 0.4;
    carve(pc, R, x - (ty / l) * w, y + (tx / l) * w, x + (ty / l) * w, y - (tx / l) * w, t.mask, 1);
  }
  // age: a long hairline crack and a yellowed stain toward the root
  t.mask.each((X, Y) => { const s = t.S[Y * SZ + X]; if (s < 0.3 && vnoise(dc(X) * 0.6, dc(Y) * 0.6, 4) > 0.55) step(pc, R, X, Y, 1, 2, 5); });
  line(pc, 13.4, 16.2, 18.6, 11.4, (i, X, Y) => (t.mask.get(X, Y) && i % 7 !== 6 ? R[5] : null));
  // the broken root end, showing the pulp cavity
  const end = loop([[5.4, 26.4], [7.4, 24.2], [10.8, 24.4], [12, 27], [10.6, 29.4], [7, 29.6]]);
  part(pc, end, BR, { bias: 0.1 });
  const pulp = loop([[7.4, 26.2], [9.4, 25.6], [10.4, 27], [9.4, 28.4], [7.6, 28.2]]);
  pulp.each((X, Y) => pc.set(X, Y, isTop(pulp, X, Y) ? BR[6] : BR[5]));
  ink(pc);
  glint(pc, 21.8, 6.4, 1, R[0]);
}

function fang(pc, c) {
  const R = mat(0x3a2820, { cont: 1.2 }), EN = mat(0xd8c8b0, { cont: 1 }), V = mat(c || 0x8ae05a, { cont: 1.05 });
  // a spider's chelicera fang: a thick jointed base hooking down to a needle point
  const f = loop([[5.4, 6.6], [9, 3.6], [14.4, 3.4], [19.4, 5.6], [23.4, 10], [25.6, 15.6], [25.8, 21.4], [24.6, 26.6], [22.8, 29.6, 1], [22.4, 25.6], [21.6, 20.6], [19.6, 16.2], [16.4, 13], [12.2, 11.4], [7.6, 11.2]]);
  part(pc, f, R, { cx: 14, cy: 10, rx: 10, ry: 9, bias: 0.04 });
  // the base joint: a darker collar with a hairy socket
  const jt = loop([[3.4, 7.2], [6, 4.4], [9.8, 4.6], [11, 8.4], [9.6, 11.6], [6, 12], [3.4, 10.2]]);
  part(pc, jt, mat(0x2a1c18, { cont: 1.2 }), { bias: 0.02 });
  for (let i = 0; i < 7; i++) { const a = -2.4 + i * 0.5, x = 6.6 + Math.cos(a) * 3.4, y = 8.2 + Math.sin(a) * 3.4; line(pc, x, y, x + Math.cos(a) * 1.4, y + Math.sin(a) * 1.4, 0x1a1210); }
  // glossy enamel along the outer curve, a venom groove inside it
  f.each((X, Y) => {
    if (jt.get(X, Y)) return;
    const x = dc(X), y = dc(Y);
    const ox = 13 + (x - 13) * 1, oy = 17 + (y - 17);
    const d = Math.hypot(ox - 12.6, (oy - 17.4) * 1.05);
    if (d > 11.4 && d < 12.6 && x > 13) pc.set(X, Y, EN[d < 12 ? 3 : 2]);
    if (d > 9.6 && d < 10.2 && x > 15 && y > 8) pc.set(X, Y, V[5]);
  });
  marks(pc, f, R, { dens: 0.3, len: 1.4, seed: 4, dir: [1, 0.6], only: (X, Y) => dc(X) < 16 });
  // venom: a bead on the point, a drip, and the groove glistening
  const bead = loop([[21.6, 27.8], [23.8, 27.6], [25, 29.4], [23.8, 31.2], [21.8, 31], [21, 29.4]]);
  form(pc, bead, V, { bias: 0.15, emit: 0.7 });
  f.each((X, Y) => { const x = dc(X), y = dc(Y), d = Math.hypot(x - 12.6, (y - 17.4) * 1.05); if (d > 9.6 && d < 10.2 && x > 19 && y > 14 && hash2(X, Y, 3) < 0.5) gl(pc, X, Y, V[2], 0.6); });
  ink(pc);
  sheen(pc, f, EN[1], { a0: -2.6, a1: -1.2, inset: 1 });
  glint(pc, 17.6, 6, 1, EN[0]);
  gl(pc, np(22.4), np(28.4), 0xffffff, 1);
}

function claw(pc) {
  const R = mat(0xf0e4cc, { cont: 1.05 }), BR = mat(0x6a3a22, { cont: 1.1 });
  const sp = [[8.6, 25.6], [9.4, 18.6], [12.6, 12], [18, 7.4], [24.2, 5.6], [28, 6.6]];
  const t = tube(pc, sp, (s) => 0.35 + 3.1 * Math.pow(1 - s, 0.75), R, { bias: 0.1 });
  // keratin ridges along the curve and the sharp inner edge
  t.mask.each((X, Y) => {
    const i = Y * SZ + X, v = t.V[i], s = t.S[i];
    if (Math.abs(v - 1) < 0.18 && s > 0.15 && s < 0.9) step(pc, R, X, Y, 1);
    if (v > 0 && Math.abs(v) > t.Wd[i] - 0.5 && s > 0.3) pc.set(X, Y, R[4]);
  });
  for (const s of [0.2, 0.32, 0.46]) {
    const [x, y] = t.at(s);
    carve(pc, R, x - 1.6, y - 1.6, x + 1.4, y + 1.4, t.mask, 1);
  }
  // the knuckle it was set in: dark, with a leather tie
  const kn = loop([[4.4, 24.4], [6.6, 21.6], [10.6, 21.6], [13, 24.4], [12.6, 28], [9, 29.8], [5.4, 28.6]]);
  part(pc, kn, BR, { bias: 0.04 });
  marks(pc, kn, BR, { dens: 0.6, len: 1.4, seed: 5, dir: [1, 0.2] });
  line(pc, 5.4, 25.4, 12.4, 23.6, 0xd8b890, kn); line(pc, 5.6, 26, 12.6, 24.2, BR[5], kn);
  ink(pc);
  glint(pc, 19.4, 7.4, 1, R[0]);
}

function tooth(pc) {
  const R = mat(0xf2ead8, { cont: 1.02 }), RR = mat(0xb07a5a, { cont: 1.05 });
  // root: two prongs at the top, stained
  const root = loop([[8.4, 3.2], [12.6, 2.4], [16, 4], [19.4, 2.4], [23.6, 3.2], [23.2, 8.6], [8.8, 8.6]]);
  part(pc, root, RR, { bias: 0.06 });
  marks(pc, root, RR, { dens: 0.5, len: 1.6, seed: 2, dir: [0.1, 1] });
  carve(pc, RR, 16, 4.4, 16, 8, root, 2);
  // the crown: a fat blade with serrated edges
  const pts = [[8.6, 7.6], [23.4, 7.6], [22.6, 12], [21, 17], [18.6, 22.6], [16, 29.4], [13.4, 22.6], [11, 17], [9.4, 12]];
  const cr = loop(pts.map((p, i) => [...p, i < 2 ? 1 : 0]));
  // serrations: little notches every 2.6 px down both edges
  const crown = cr.clone();
  cr.edge().each((X, Y) => { const y = dc(Y); if (y > 9 && y < 24 && (y % 2.6) < 0.8) crown.set(X, Y, 0); });
  part(pc, crown, R, { cx: 15, cy: 15, rx: 7, ry: 11, bias: 0.06 });
  // enamel ridge down the middle (lit left plane, shaded right), a few age lines
  crown.each((X, Y) => { const x = dc(X), y = dc(Y); const mx = 16 + (y - 8) * 0.02; if (x > mx + 0.2 && x < mx + 4 && !isTop(crown, X, Y)) step(pc, R, X, Y, 1, 1, 4); });
  line(pc, 16, 9, 16, 27, (i, X, Y) => (crown.get(X, Y) ? R[1] : null));
  for (const [x, y] of [[12.6, 12], [19.4, 16], [13.6, 19]]) carve(pc, R, x, y, x + 1.6, y + 0.6, crown, 1);
  // gum line
  line(pc, 9, 8.4, 23, 8.4, (i, X, Y) => (i % 5 === 4 ? null : RR[4]));
  ink(pc);
  glint(pc, 12.4, 10.6, 1, R[0]);
}

function scale(pc, c) {
  const R = mat(c, { cont: 1.15 }), H = mat(mix(c, 0xffd060, 0.5), { cont: 1 });
  // a drake's scale: broad and rounded where it overlapped, thick at the root, a keel down it
  const sh = loop([[16, 2.8], [21.6, 3.6], [25.8, 6.6], [27.6, 11.6], [26.6, 17.2], [23.2, 22.6], [19.4, 26.6], [16, 29.4, 1], [12.6, 26.6], [8.8, 22.6], [5.4, 17.2], [4.4, 11.6], [6.2, 6.6], [10.4, 3.6]]);
  seam(pc, sh, 'shadow');
  // domed in two planes either side of the keel
  sh.each((X, Y) => {
    const x = dc(X), y = dc(Y), u = (x - 16) / 11.5, v = (y - 13) / 14;
    const nx = u * 0.8 + (x < 16 ? -0.25 : 0.25), ny = v * 0.8 - 0.1;
    pc.set(X, Y, R[clamp(toneN(nx, ny, 1, -0.06), 1, 5)]);
  });
  // growth rings: bands following the rounded top, like a shell's, each with a lit lip
  for (const k of [0.84, 0.68, 0.52]) {
    sh.each((X, Y) => {
      const x = dc(X), y = dc(Y);
      const d = Math.hypot((x - 16) / 11.6, (y - 16.4) / 13.4);
      if (Math.abs(d - k) < 0.022 && y < 22) step(pc, R, X, Y, 1);
      else if (Math.abs(d - k + 0.04) < 0.018 && y < 22) step(pc, R, X, Y, -1);
    });
  }
  // the keel: a raised ridge on the lower half, lit on its left
  line(pc, 16, 13, 16, 27.4, (i, X, Y) => (sh.get(X, Y) ? R[1] : null));
  line(pc, 16.5, 13, 16.5, 27.4, (i, X, Y) => (sh.get(X, Y) ? R[5] : null));
  // heat: the root end glows, little embers caught in the rings
  sh.each((X, Y) => { const y = dc(Y); if (y > 25 && !isTop(sh, X, Y)) gl(pc, X, Y, H[y > 27 ? 2 : 3], 0.5); });
  pits(pc, sh, R, 0.025, 4, 0.01);
  ink(pc);
  sheen(pc, sh, R[0], { a0: -2.8, a1: -1.7, inset: 1 });
  glint(pc, 10.6, 7.4, 1, R[1]);
}

function plate(pc, c) {
  const R = mat(c, { cont: 1.08 }), KR = mat(0xe8dcc0, { cont: 1.02 });
  const hex = [[16, 3.6], [27.2, 9.6], [27.2, 22.4], [16, 28.6], [4.8, 22.4], [4.8, 9.6]];
  const pl = loop(hex.map((p) => [...p, 1]));
  seam(pc, pl, 'shadow');
  // bevelled hex: six rim facets round a flat top
  const top = [[16, 7.6], [23.4, 11.6], [23.4, 20.4], [16, 24.6], [8.6, 20.4], [8.6, 11.6]];
  for (let i = 0; i < 6; i++) {
    const a = hex[i], b = hex[(i + 1) % 6], ta = top[i], tb = top[(i + 1) % 6];
    const mx = (a[0] + b[0] - ta[0] - tb[0]) / 2, my = (a[1] + b[1] - ta[1] - tb[1]) / 2, l = Math.hypot(mx, my) || 1;
    facet(pc, [a, b, tb, ta], R, [(mx / l) * 1.1, (my / l) * 1.1, 1], { clip: pl, bias: 0.04 });
  }
  facet(pc, top, R, [-0.1, -0.15, 1], { clip: pl, bias: 0.02 });
  // shell texture: horn grain swirls and pits on the flat top
  const tm = M().poly(top);
  tm.each((X, Y) => { const n = vnoise(dc(X) * 0.7, dc(Y) * 0.35, 6); if (n > 0.68) step(pc, R, X, Y, 1); else if (n < 0.12) step(pc, R, X, Y, -1); });
  for (let i = 0; i < 6; i++) line(pc, top[i][0], top[i][1], top[(i + 1) % 6][0], top[(i + 1) % 6][1], i < 2 || i === 5 ? R[1] : R[5], pl);
  // the bone knob in the middle
  const kn = loop([[16, 11], [19.4, 12.6], [20.4, 16], [19, 19.6], [16, 20.8], [12.8, 19.4], [11.6, 16], [12.8, 12.6]]);
  part(pc, kn, KR, { bias: 0.08 });
  marks(pc, kn, KR, { dens: 0.4, len: 1, seed: 3, dir: [1, 1] });
  // studs at the corners of the top
  for (const [x, y] of top) {
    const X = np(x) - 1, Y = np(y) - 1;
    for (const [dx, dy, k] of [[0, 0, 1], [1, 0, 2], [0, 1, 3], [1, 1, 4]]) P(pc, X + dx, Y + dy, KR[k]);
    P(pc, X + 2, Y + 1, R[6]); P(pc, X + 1, Y + 2, R[6]); P(pc, X + 2, Y + 2, R[6]);
  }
  ink(pc);
  glint(pc, 14.2, 13, 1, KR[0]);
}

function feather(pc, c) {
  const R = mat(c, { cont: 1.08 }), Q = mat(0xf4ecd8, { cont: 1 }), D = mat(mix(c, 0x3a1810, 0.55), { cont: 1.05 });
  // the vane, curving a little, notched where barbs split apart
  const v = blade(pc, 6.4, 26, 26.6, 4.6, 7, R, { bend: -1.8, curl: 1.2, asym: 0.2, pow: 0.55, veins: 0, rib: false, bias: -0.1, lo: 2 });
  // dark bars across the vane, then fine barbs angled toward the tip
  v.each((X, Y) => {
    const x = dc(X), y = dc(Y), s = x - y, w = x + y;
    const bar = (((s + w * 0.3) % 5.2) + 5.2) % 5.2;
    if (bar < 1.5 && s > -14 && s < 17) { const k = R.indexOf(pc.get(X, Y)); pc.set(X, Y, D[clamp(k < 0 ? 3 : k + 1, 3, 5)]); }
    if ((((X * 2 + Y * 3) % 5) + 5) % 5 === 0) step(pc, R, X, Y, 1) || step(pc, D, X, Y, 1);
  });
  for (const [x, y, d] of [[10.2, 17.6, 1], [18.8, 12.4, -1], [21, 7.4, 1], [12.8, 23.4, -1], [24.2, 8.8, -1]]) {
    const X = np(x), Y = np(y);
    for (let k = 0; k < 5; k++) if (v.get(X + k * d, Y - k)) pc.clear(X + k * d, Y - k);
  }
  // rachis (the quill) down the middle and the bare calamus
  line(pc, 3.2, 29.2, 7.4, 25, Q[2]); line(pc, 3.6, 29.6, 7.8, 25.4, Q[4]);
  line(pc, 7.4, 25, 25.8, 5.4, (i, X, Y) => (v.get(X, Y) ? Q[1] : null));
  line(pc, 7.8, 25.4, 25.8, 6, (i, X, Y) => (v.get(X, Y) ? D[5] : null));
  // downy fluff at the base
  for (let i = 0; i < 9; i++) {
    const x = 6.4 + hash2(i, 1, 3) * 3, y = 22.4 + hash2(i, 2, 3) * 3.4;
    line(pc, x, y, x - 1.2 - hash2(i, 3, 3), y + 0.4 - hash2(i, 4, 3) * 1.6, mix(c, 0xffffff, 0.5));
  }
  ink(pc);
  glint(pc, 14.6, 12.6, 0, R[0]);
}

function gel(pc, c) {
  const R = mat(c, { cont: 1.1 });
  const g = loop([[16, 6.4], [19.8, 7.4], [23.4, 11.4], [25.6, 16.4], [27.4, 21], [26.4, 24.8], [21.6, 26.8], [16, 27.2], [10.4, 26.8], [5.6, 24.8], [4.6, 21], [6.4, 16.4], [8.6, 11.4], [12.2, 7.4]], { jit: 0.3, seed: 4 });
  // a puddle foot, slightly see-through
  const foot = loop([[5, 24.6], [10, 23.4], [22, 23.4], [27.6, 24.6], [28.6, 27], [24, 28.6], [8, 28.6], [3.4, 27]]);
  foot.each((X, Y) => pc.set(X, Y, R[isBot(foot, X, Y) ? 5 : 4], 210));
  form(pc, g, R, { cx: 15, cy: 15.6, rx: 10, ry: 10, bias: 0.1 });
  // translucency: the inside is a little see-through, with a denser core and bubbles
  g.each((X, Y) => { const k = R.indexOf(pc.get(X, Y)); if (k >= 2 && !isTop(g, X, Y)) pc.set(X, Y, R[k], 225); });
  const core = loop([[16, 13.4], [20, 15.6], [21, 19.6], [17.6, 22.4], [13, 22], [11, 18.6], [12.4, 15]]);
  core.each((X, Y) => pc.set(X, Y, R[isTop(core, X, Y) ? 2 : 3], 240));
  for (const [x, y, big] of [[19.4, 18.6, 1], [13.4, 19.6, 0], [21.8, 13.4, 0], [10.6, 23.4, 1], [17, 24.4, 0]]) {
    const X = np(x), Y = np(y);
    if (big) { P(pc, X, Y, R[0]); P(pc, X + 1, Y, R[1]); P(pc, X, Y + 1, R[1]); P(pc, X + 1, Y + 1, R[2]); P(pc, X + 2, Y + 1, R[4]); P(pc, X + 1, Y + 2, R[4]); }
    else { P(pc, X, Y, R[0]); P(pc, X + 1, Y + 1, R[3]); }
  }
  ink(pc);
  // a wet highlight arc and a fat glint
  sheen(pc, g, 0xffffff, { a0: -2.8, a1: -1.5, inset: 1.2 });
  glint(pc, 11.6, 11, 1, R[1]);
}

function ash(pc, c) {
  // a little drawstring pouch, cold glowing ash spilling out of its mouth
  const BR = mat(0x5a4a5a, { cont: 1.05 }), CORD = mat(0xc8b890, { cont: 1 });
  const bag = loop([[11.6, 11.6], [20.4, 11.6], [22.6, 14.4], [25.4, 18.6], [25.6, 23.6], [22.6, 27.6], [16, 29], [9.4, 27.6], [6.4, 23.6], [6.6, 18.6], [9.4, 14.4]]);
  part(pc, bag, BR, { cx: 15, cy: 20, rx: 9.6, ry: 9, bias: 0.04 });
  // gathered folds up to the neck
  for (const [x0, x1] of [[12, 10.4], [14.8, 14], [17.6, 18.4], [20, 22]]) carve(pc, BR, x0, 13.4, x1, 20, bag, 1);
  // the neck ruffle and the cord, knotted with two tails
  const neck = loop([[10.8, 9.4], [13, 8.4], [16, 9], [19, 8.4], [21.2, 9.4], [20.6, 12.4], [11.4, 12.4]]);
  part(pc, neck, BR, { bias: 0.1 });
  const cord = M().path([[10.6, 12.6], [16, 13.4], [21.4, 12.6]], 0.7);
  part(pc, cord, CORD, { bias: 0.1, round: 0.8 });
  line(pc, 19, 13.4, 20.6, 17.4, CORD[3]); line(pc, 19.6, 13.4, 22.6, 16.6, CORD[2]);
  stitch(pc, [[8.4, 24.4], [12, 27], [20, 27], [23.6, 24.4]], BR[1], { gap: 2, mask: bag });
  // the ash heaped in the mouth and drifting up
  const pile = loop([[10.4, 9], [12.4, 6.4], [16, 5.2], [19.6, 6.4], [21.6, 9], [16, 10]]);
  pile.each((X, Y) => { const h = hash2(X, Y, 2); gl(pc, X, Y, h > 0.7 ? mix(c, 0xffffff, 0.6) : h > 0.3 ? c : mix(c, 0x203040, 0.35), 0.8); });
  for (const [x, y, r] of [[8, 4.6, 1], [24, 3.6, 1], [20.6, 1.8, 0], [12, 2.6, 0], [26.4, 7, 0], [5.4, 8, 0]]) sparkle(pc, x, y, r, 0xffffff, c, 0.9);
  ink(pc);
}

function meat(pc) {
  const R = mat(0xc8463a, { cont: 1.05 }), FAT = mat(0xf0d8c0, { cont: 1 }), BN = mat(0xf0e8d8, { cont: 1.02 });
  // the bone, sticking out of the haunch to the top-right
  const bone = M().path([[19.4, 12.6], [24.4, 7.6]], 1.5);
  const knob = loop([[23, 6.6], [24, 3.6], [26.4, 3], [27.6, 4.4], [29.2, 5], [29.2, 7.6], [27, 8.6], [25, 8.4]]);
  const b = bone.union(knob);
  part(pc, b, BN, { bias: 0.1 });
  line(pc, 20, 11.6, 24.4, 7.2, BN[1], b);
  line(pc, 26.6, 4.6, 28, 6.2, BN[4], b);
  // the haunch with its fat rind
  const h = loop([[4.6, 16.4], [7.4, 11.6], [12.6, 9], [17.6, 9.6], [21.6, 12.4], [23.4, 17], [22, 22.4], [17.6, 26.2], [11, 27.2], [6, 25], [3.8, 20.6]]);
  seam(pc, h, 'shadow');
  form(pc, h, R, { cx: 13, cy: 17, rx: 10, ry: 9, bias: 0.04, tex: (X, Y) => (Math.sin((dc(X) + dc(Y) * 0.6) * 1.1) > 0.82 ? 0.18 : 0) });
  // the rind round the top-left and the cut face's marbling
  const inner = h.clone().erode(nc(1.5));
  h.each((X, Y) => { if (!inner.get(X, Y) && dc(X) + dc(Y) < 30) pc.set(X, Y, FAT[isTop(h, X, Y) ? 1 : 2]); });
  inner.edge().each((X, Y) => { if (dc(X) + dc(Y) < 29) pc.set(X, Y, FAT[3]); });
  // marbling: thin wandering streaks of fat through the meat
  inner.each((X, Y) => {
    const x = dc(X), y = dc(Y);
    const n = Math.abs(Math.sin(x * 0.55 + y * 0.9 + vnoise(x * 0.35, y * 0.35, 7) * 5));
    if (n < 0.07 && vnoise(x * 0.3, y * 0.3, 2) > 0.45) pc.set(X, Y, FAT[isTop(inner, X, Y) ? 2 : 3]);
  });
  // a sear of char where it hit the fire
  h.each((X, Y) => { if (dc(X) + dc(Y) > 34 && hash2(X, Y, 4) < 0.25) step(pc, R, X, Y, 2); });
  ink(pc);
  sheen(pc, h, FAT[0], { a0: -2.6, a1: -1.8, inset: 2 });
  glint(pc, 9.4, 13.4, 0, FAT[0]);
}

function egg(pc, c) {
  const R = mat(c || 0xe0caa0, { cont: 1.05 });
  const e = loop([[16, 3.2], [20.2, 4.6], [23.4, 8.6], [25.2, 14], [25.4, 19.4], [23.6, 24.6], [20, 28], [16, 29], [12, 28], [8.4, 24.6], [6.6, 19.4], [6.8, 14], [8.6, 8.6], [11.8, 4.6]]);
  form(pc, e, R, { cx: 14.6, cy: 14, rx: 10, ry: 13, bias: 0.06 });
  // scaly blotches and fine speckle, denser toward the bottom
  e.each((X, Y) => {
    const x = dc(X), y = dc(Y), n = vnoise(x * 0.5, y * 0.5, 9);
    if (n > 0.68 && !isTop(e, X, Y)) step(pc, R, X, Y, 1);
    if (hash2(X, Y, 3) < 0.04 + (y - 4) * 0.003) step(pc, R, X, Y, 2);
  });
  // a crack, a warm glow seeping out of it
  let x = 21.4, y = 9.6;
  for (let i = 0; i < 6; i++) {
    const nx = x - 0.9 - hash2(i, 1, 2) * 0.6, ny = y + 1.3 + hash2(i, 2, 2) * 0.5;
    line(pc, x, y, nx, ny, (j, X, Y) => (e.get(X, Y) ? mix(c || 0xe0caa0, 0xffc040, 0.6) : null), null, 0.7);
    x = nx; y = ny;
  }
  ink(pc);
  sheen(pc, e, R[1], { a0: -2.6, a1: -1.7, inset: 1.2 });
  glint(pc, 11.4, 8.6, 1, R[0]);
}

function trinket(pc) {
  // a carved bone charm with a little red bead, on a string
  const R = mat(0xe8dcc0, { cont: 1.05 }), RB = mat(0xd8402a, { cont: 1.05 });
  for (const s of [-1, 1]) {
    line(pc, 16 + s * 10.4, 3.4, 16 + s * 1.6, 10.2, (i) => (i % 4 === 3 ? 0x8a6a40 : 0xc8a870));
    line(pc, 16 + s * 10.4 + 0.5, 3.6, 16 + s * 1.6 + 0.5, 10.4, (i) => (i % 4 === 1 ? 0x6a4a2a : null));
  }
  const m = loop([[16, 9.6, 1], [20.4, 13.4], [24.4, 18.4, 1], [20.4, 24], [16, 30, 1], [11.6, 24], [7.6, 18.4, 1], [11.6, 13.4]]);
  part(pc, m, R, { cx: 15, cy: 18, rx: 7, ry: 9, bias: 0.06 });
  // carved spirals and notches, each groove with its lit lip
  carve(pc, R, 16, 12, 16, 15, m, 2);
  carve(pc, R, 16, 23, 16, 27.4, m, 2);
  carve(pc, R, 10, 18.4, 12.8, 18.4, m, 2);
  carve(pc, R, 19.2, 18.4, 22, 18.4, m, 2);
  for (const [x, y] of [[13, 14.6], [19, 14.6], [13, 22.4], [19, 22.4]]) { const X = np(x), Y = np(y); step(pc, R, X, Y, 2); step(pc, R, X + 1, Y + 1, -1); }
  // the bead on its knot
  const b = loop([[16, 16.4], [17.8, 17.4], [18.2, 19.4], [16.8, 21], [15, 21], [13.8, 19.4], [14.2, 17.4]]);
  part(pc, b, RB, { bias: 0.1 });
  ink(pc);
  P(pc, np(15.2), np(17.6), 0xffe0d0);
  glint(pc, 11.6, 16, 0, R[0]);
}

const DRAW = { hide, tusk, fang, claw, tooth, scale, plate, feather, gel, ash, meat, egg, trinket };

/** Draws { k: 'loot', t, c } item icons; false for anything else. */
export function drawLootIcon(pc, spec) {
  if (!spec || spec.k !== 'loot') return false;
  const f = DRAW[spec.t];
  if (!f) return false;
  f(pc, spec.c);
  return true;
}
