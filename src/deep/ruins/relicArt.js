// Icons for the relics ({ k: 'relic', t }), hand-built on the shared icon kits (gfx/px/lifeKit,
// gearKit): organic silhouettes from hand-placed control points, forms painted in a few flat
// planes lit from the top-left, seams where parts overlap, an ink outline, then the detail that
// the 64-px grid has room for (engraving, patina, rivets, facets, glints). Authored on the
// 32-unit design grid and painted natively at S× (res.js). Hooked into gfx/PixelArt.js drawIconArt.
import {
  M, mat, mix, hash2, vnoise, ink, seam, form, loop, marks, speckle, line, glint, sparkle, twinkle, rivet, pits,
  step, isTop, isBot, clamp, gl, toneN, S, SZ, nc, np, dc,
} from '../../gfx/px/lifeKit.js';
import { dents, stick } from '../../gfx/px/gearKit.js';

const GOLD = () => mat(0xe2ae3a, { cont: 1.18, warm: 54 });
const BRONZE = () => mat(0x4e8a66, { cont: 1.1 });
const BRASS = () => mat(0xc8944a, { cont: 1.15, warm: 52 });

/** Seam + planes in one go. */
function part(pc, m, R, o = {}) {
  if (o.seam !== false) seam(pc, m, 'shadow');
  return form(pc, m, R, o);
}
/** A flat facet (poly in design px) toned by its normal. */
function facet(pc, pts, R, n, o = {}) {
  const m = M().poly(pts);
  if (o.clip) m.and(o.clip);
  const k = clamp(toneN(n[0], n[1], n[2], o.bias || 0), o.lo ?? 1, o.hi ?? 5);
  m.each((x, y) => { pc.set(x, y, R[k]); if (o.emit) pc.emit(x, y, o.emit); });
  return m;
}
/**
 * A carved groove between design points: the cut a ramp step darker (dk), its lower-right lip a
 * step lighter, both kept on pixels of ramp R inside mask.
 */
function carve(pc, R, x0, y0, x1, y1, mask = null, dk = 2) {
  const cut = [];
  line(pc, x0, y0, x1, y1, (i, X, Y) => { cut.push(X, Y); return null; }, mask);
  const on = new Set();
  for (let i = 0; i < cut.length; i += 2) on.add(cut[i + 1] * SZ + cut[i]);
  for (let i = 0; i < cut.length; i += 2) step(pc, R, cut[i], cut[i + 1], dk);
  for (let i = 0; i < cut.length; i += 2) {
    const X = cut[i] + 1, Y = cut[i + 1] + 1;
    if (on.has(Y * SZ + X) || (mask && !mask.get(X, Y))) continue;
    step(pc, R, X, Y, -1);
  }
}
/** Native pixel helpers. */
const P = (pc, X, Y, c) => pc.set(X, Y, c);
/** Verdigris / tarnish: patchy noise in a mask, one or two ramp steps toward a patina color. */
function patina(pc, m, R, PR, o = {}) {
  m.each((X, Y) => {
    const n = vnoise(dc(X) * (o.f ?? 0.45), dc(Y) * (o.f ?? 0.45), o.seed ?? 3);
    const k = R.indexOf(pc.get(X, Y));
    if (k < 1) return;
    if (n > (o.t ?? 0.62)) pc.set(X, Y, PR[clamp(k + (hash2(X, Y, 5) < 0.25 ? 1 : 0), 1, 5)]);
    else if (n > (o.t ?? 0.62) - 0.06 && hash2(X, Y, 6) < 0.45) pc.set(X, Y, PR[clamp(k + 1, 2, 5)]);
  });
}

// ---------------------------------------------------------------- relics
/** A little golden Old Star idol sitting on a plum velvet cushion, a sky crystal on his cap. */
function idol(pc) {
  const G = GOLD(), V = mat(0x7a2e5c, { cont: 1.1, sat: 0.9 });
  const cush = loop([[4.6, 24.6], [8, 22.4], [16, 21.8], [24, 22.4], [27.4, 24.6], [27.8, 26.8], [24.6, 28.8], [16, 29.4], [7.4, 28.8], [4.2, 26.8]]);
  form(pc, cush, V, { flatten: 0.7, bias: 0.06 });
  // velvet nap: a seam round the cushion's welt, and soft folds
  for (const [x0, y0, x1, y1] of [[7, 26.2], [25, 26.2]].map(([x, y], i) => [x, y, i ? 22 : 10, y + 1.2])) line(pc, x0, y0, x1, y1, V[4], cush);
  line(pc, 6, 25, 26, 25, (i, X, Y) => (i % 3 === 2 ? null : V[2]), cush);
  // gold tassels at the corners
  for (const [x, y, d] of [[4.6, 25.6, -1], [27.4, 25.6, 1]]) {
    line(pc, x, y, x + d * 1.2, y + 3, G[2]); line(pc, x + d * 0.6, y, x + d * 1.8, y + 3, G[4]);
    pc.set(nc(x + d * 1.4), nc(y + 3.4), G[5]);
  }
  // body: a round little seated mole
  const body = loop([[11.2, 23.4], [10, 19.6], [10.8, 15.8], [13, 13.6], [16, 13], [19.2, 13.6], [21.2, 15.8], [22, 19.6], [20.8, 23.4], [16, 24.2]]);
  part(pc, body, G, { cx: 15, cy: 17.5, rx: 6.4, ry: 6.4, bias: 0.04 });
  // the belly fur, chased into the gold in little ticks
  marks(pc, body, G, { dens: 0.5, len: 1.2, dir: [0.4, 1], seed: 4, only: (X, Y) => Math.abs(dc(X) - 16) < 3.4 && dc(Y) > 16 });
  // folded paws
  for (const [cx, sx] of [[13.4, -1], [18.6, 1]]) {
    const paw = loop([[cx - 1.8, 17.6], [cx, 16.8], [cx + 1.8, 17.6], [cx + 1.6, 19.6], [cx, 20.4], [cx - 1.6, 19.6]]);
    part(pc, paw, G, { bias: 0.08 });
    for (let k = -1; k <= 1; k++) pc.set(nc(cx + k * 0.9), nc(20) + 1, G[5]); // claws
    void sx;
  }
  // feet poking out at the bottom
  for (const cx of [12, 20]) part(pc, loop([[cx - 2, 23.4], [cx, 22.6], [cx + 2, 23.4], [cx + 1.6, 24.8], [cx - 1.6, 24.8]]), G, { bias: 0.02 });
  // head with a miner's cap
  const head = loop([[10.4, 10.4], [11.2, 7], [13.6, 5.2], [16, 4.8], [18.4, 5.2], [20.8, 7], [21.6, 10.4], [20.2, 13], [16, 14.2], [11.8, 13]]);
  part(pc, head, G, { cx: 15.2, cy: 8.6, rx: 6, ry: 5.6, bias: 0.06 });
  const cap = loop([[10.6, 8.6], [11.6, 5.6], [14, 4], [16, 3.6], [18, 4], [20.4, 5.6], [21.4, 8.6], [16, 7.6]]);
  part(pc, cap, G, { cx: 15, cy: 5, rx: 6, ry: 3.4, bias: 0.14 });
  line(pc, 10.8, 8.4, 21.2, 8.4, (i, X, Y) => (cap.get(X, Y) ? G[i % 4 === 0 ? 2 : 4] : null)); // the brim
  // the crystal lamp on the cap
  const C = mat(0x58c8e0, { cont: 1.1 });
  facet(pc, [[16, 2], [17.6, 4], [16, 6.2], [14.4, 4]], C, [-0.5, -0.6, 1], { emit: 0.6 });
  facet(pc, [[16, 2], [17.6, 4], [16, 6.2]], C, [0.6, 0.2, 1], { emit: 0.6 });
  pc.set(nc(15.4), nc(3.2), 0xffffff); pc.emit(nc(15.4), nc(3.2), 1);
  // eyes: little bead eyes behind tiny spectacles
  for (const ex of [13.4, 18.6]) {
    const X = np(ex) - 1, Y = np(9.6);
    for (const [dx, dy, c] of [[0, 0, 0x2a1408], [1, 0, 0x2a1408], [0, 1, 0x2a1408], [1, 1, 0x4a2a10]]) P(pc, X + dx, Y + dy, c);
    P(pc, X, Y, 0xfff4d8);
    for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [2, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [-1, 2], [0, 2], [1, 2], [2, 2]]) if (head.get(X + dx, Y + dy)) P(pc, X + dx, Y + dy, G[5]);
  }
  line(pc, 15.2, 10.2, 16.8, 10.2, G[5]); // the spectacles' bridge
  // the star nose: fleshy pink rays round a little disc
  const ncx = nc(16) + 0.5, ncy = nc(12) + 0.5;
  const PK = [0xffd8e0, 0xffa8bc, 0xf07898, 0xc04c70];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3, L = 4 + (k % 2) * 1.2;
    for (let r = 2; r <= L; r++) {
      const X = Math.floor(ncx + Math.cos(a) * r), Y = Math.floor(ncy + Math.sin(a) * r);
      const lit = Math.cos(a) * -0.6 + Math.sin(a) * -0.8;
      P(pc, X, Y, PK[r === L ? 2 : lit > 0.2 ? 1 : lit < -0.4 ? 3 : 2]);
    }
  }
  for (const [dx, dy, k] of [[-1, -1, 0], [0, -1, 1], [-1, 0, 1], [0, 0, 1], [1, 0, 2], [0, 1, 2], [1, 1, 3], [1, -1, 2], [-1, 1, 2]]) P(pc, Math.floor(ncx) + dx, Math.floor(ncy) + dy, PK[k]);
  // hammer-marks in the gold, then the ink
  dents(pc, body, G, { dens: 0.05, seed: 3, only: (X, Y) => dc(X) > 17 && dc(Y) > 15 });
  ink(pc);
  glint(pc, 12.4, 15.6, 1, G[1]);
  glint(pc, 12.6, 6.2, 0, G[1]);
}

/** A verdigris bronze sun disc: twelve gold rays round a smiling sun boss, a worn raised rim. */
function disc(pc) {
  const B = BRONZE(), G = GOLD(), VG = mat(0x6cc8a4, { cont: 0.9 });
  const rim = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2, r = 12.4 - (hash2(i, 1, 9) < 0.3 ? 0.6 : 0) - hash2(i, 2, 9) * 0.3;
    rim.push([16 + Math.cos(a) * r, 16 + Math.sin(a) * r * 0.96]);
  }
  const d = loop(rim, { seg: 4 });
  form(pc, d, B, { cx: 16, cy: 16, rx: 12.4, ry: 12, flatten: 0.55, dome: 0.25, bias: 0.08 });
  // the raised rim: a lit top-left lip and a shaded inner step
  const inner = d.clone().erode(nc(1.6));
  d.each((X, Y) => {
    if (inner.get(X, Y)) return;
    const t = (dc(X) - 16) * -0.6 + (dc(Y) - 16) * -0.8;
    const k = B.indexOf(pc.get(X, Y));
    if (k < 0) return;
    if (!inner.get(X - 2, Y - 2) && inner.get(X + 2, Y + 2)) pc.set(X, Y, B[clamp(k - (t > 0 ? 1 : 0), 1, 5)]);
  });
  inner.edge().each((X, Y) => { const t = (dc(X) - 16) * -0.6 + (dc(Y) - 16) * -0.8; pc.set(X, Y, t > 0 ? B[5] : B[2]); });
  // verdigris in the low places, worn bright bronze on the high ones
  patina(pc, inner, B, VG, { seed: 11, t: 0.6, f: 0.38 });
  // twelve rays, long and short, each a two-plane ridge
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 - Math.PI / 2, L = k % 2 ? 9 : 10.6, w = k % 2 ? 1.1 : 1.5;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const b0 = [16 + ca * 5, 16 + sa * 5], tip = [16 + ca * L, 16 + sa * L];
    const half1 = [[b0[0] + px * w, b0[1] + py * w], tip, b0], half2 = [[b0[0] - px * w, b0[1] - py * w], tip, b0];
    const m = M().poly([half1[0], tip, half2[0]]);
    seam(pc, m, 'shadow', { soft: false });
    facet(pc, half1, G, [px * 0.9, py * 0.9, 1], { bias: 0.04 });
    facet(pc, half2, G, [-px * 0.9, -py * 0.9, 1], { bias: 0.04 });
  }
  // ring of punched dots between the rays
  for (let k = 0; k < 12; k++) {
    const a = ((k + 0.5) / 12) * Math.PI * 2 - Math.PI / 2;
    const X = np(16 + Math.cos(a) * 8.6), Y = np(16 + Math.sin(a) * 8.6);
    step(pc, B, X, Y, 2); step(pc, B, X + 1, Y + 1, -1);
  }
  // the sun boss with a little face
  const boss = loop([[16, 11], [19.2, 12.4], [20.8, 15.6], [19.8, 19.2], [16, 20.8], [12.4, 19.4], [11.2, 16], [12.6, 12.6]]);
  part(pc, boss, G, { cx: 15.2, cy: 15, rx: 5, ry: 5, bias: 0.06 });
  for (const ex of [14.2, 17.6]) { const X = np(ex), Y = np(15); P(pc, X, Y, G[6]); P(pc, X + 1, Y, G[6]); P(pc, X, Y - 1, G[5]); P(pc, X + 1, Y + 1, G[3]); }
  line(pc, 14, 17.6, 18, 17.6, (i, X, Y) => (i === 0 || i === 8 ? G[4] : G[5]));
  for (const ex of [13.2, 18.8]) P(pc, np(ex), np(17), mix(G[3], 0xe06040, 0.5)); // rosy cheeks
  dents(pc, boss, G, { dens: 0.05, seed: 8 });
  ink(pc);
  glint(pc, 13.4, 12.8, 1, G[1]);
  glint(pc, 8.6, 7.6, 0, B[1]);
}

/** A bronze ewer: a round belly on a foot, a long spout, a gold loop handle and banded neck. */
function ewer(pc) {
  const B = BRONZE(), G = GOLD(), VG = mat(0x6cc8a4, { cont: 0.9 });
  // the handle goes behind the body
  const hdl = M().path([[12, 8.6], [8.4, 8], [5.6, 10.4], [5.4, 14.4], [7.4, 18], [10, 20]], 1.1);
  part(pc, hdl, G, { bias: 0.1, round: 1.2 });
  line(pc, 8.4, 8.4, 6, 11, G[1], hdl); line(pc, 6, 11, 6, 14.2, G[1], hdl);
  // the spout, behind the body's shoulder
  const sp = loop([[18.4, 13.6], [21.4, 11.6], [24.6, 8.4], [27.2, 5.2], [28.4, 5.6], [26.4, 9.4], [23.4, 13.6], [20.4, 16.6]]);
  part(pc, sp, B, { cx: 23, cy: 9, rx: 4, ry: 4, bias: 0.06 });
  line(pc, 21.6, 12, 27, 5.8, B[1], sp);
  const body = loop([[12.6, 6.2], [17.8, 6.2], [17.4, 9.4], [19.6, 12], [21.8, 15.4], [22.6, 19.4], [21.4, 23], [18.6, 25], [19.4, 27.2], [20, 28.8], [10.4, 28.8], [11, 27.2], [11.8, 25], [9, 23], [7.8, 19.4], [8.6, 15.4], [10.8, 12], [13, 9.4]]);
  part(pc, body, B, { cx: 14, cy: 16, rx: 7.6, ry: 9, bias: 0.06 });
  patina(pc, body, B, VG, { seed: 5, t: 0.64 });
  // lip of the mouth: an opening seen from a little above
  const lip = loop([[12, 6.6], [13.6, 5.2], [16.8, 5.2], [18.4, 6.6], [16.8, 7.8], [13.6, 7.8]]);
  part(pc, lip, G, { bias: 0.1 });
  const hole = loop([[13.2, 6.5], [14.4, 5.8], [16.2, 5.8], [17.2, 6.5], [16.2, 7.1], [14.4, 7.1]]);
  hole.each((X, Y) => pc.set(X, Y, Y > nc(6.4) ? B[5] : B[6]));
  // gold bands at the neck and round the belly, the belly band with a chased zigzag
  for (const [y0, y1, zig] of [[9.6, 11, false], [17.6, 20, true], [25, 26, false]]) {
    const band = body.clone().and(M().fn((x, y) => y >= y0 && y < y1));
    seam(pc, band, G[6], { soft: false, only: (X, Y) => body.get(X, Y) });
    form(pc, band, G, { cx: 14, cy: 16, rx: 7.6, ry: 9, bias: 0.08, tidy: false, lip: false });
    band.each((X, Y) => { if (Y === np(y0)) step(pc, G, X, Y, -1); });
    if (zig) for (let x = 9; x < 22; x += 0.5) {
      const X = np(x), Y = np(y0 + 0.6) + (Math.floor(x * 2) % 4 < 2 ? Math.floor(x * 2) % 2 : 1 - Math.floor(x * 2) % 2);
      if (band.get(X, Y)) step(pc, G, X, Y, 2);
    }
  }
  dents(pc, body, B, { dens: 0.04, seed: 6 });
  ink(pc);
  glint(pc, 11.6, 14.4, 1, B[1]);
  glint(pc, 26.8, 6, 0, B[1]);
}

/** A sky-glass lens in a riveted brass ring on a turned handle. */
function lens(pc) {
  const B = BRASS(), C = mat(0x8ad0f0, { cont: 0.95 }), W = mat(0x6a3f24, { cont: 1.1 });
  stick(pc, 21.4, 21.4, 28, 28, [1.5, 1.8], W, { grain: true, seed: 5, tones: [1, 2, 3, 3, 4, 5] });
  const fer = M().capsule(20.2, 20.2, 23, 23, 2);
  part(pc, fer, B, { bias: 0.1 });
  line(pc, 20.8, 22.8, 22.8, 20.8, B[5], fer);
  // the ring: a 14-gon, slightly hand-beaten, then the glass inside
  const pts = [], ptsIn = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2, j = (hash2(i, 3, 7) - 0.5) * 0.35;
    pts.push([14.6 + Math.cos(a) * (11 + j), 14.6 + Math.sin(a) * (11 + j)]);
    ptsIn.push([14.6 + Math.cos(a) * 8.2, 14.6 + Math.sin(a) * 8.2]);
  }
  const ring = loop(pts, { seg: 4 });
  part(pc, ring, B, { cx: 14.6, cy: 14.6, rx: 11, ry: 11, bias: 0.1, dome: 0.6, round: 1.4 });
  const glass = loop(ptsIn, { seg: 4 });
  seam(pc, glass, B[6], { soft: false });
  form(pc, glass, C, { cx: 13, cy: 13, rx: 9, ry: 9, bias: 0.1, emit: 0.25, lip: false });
  // the glass: a bright reflected window, a sweep of sky, a darker rim where it meets the brass
  glass.edge().each((X, Y) => { if (!isTop(glass, X, Y) || isBot(glass, X, Y)) pc.set(X, Y, C[4]); });
  glass.each((X, Y) => {
    const x = dc(X), y = dc(Y), u = (x - 14.6) + (y - 14.6);
    if (Math.abs(u + 5.2) < 0.55 && x > 7.4 && y > 7.4) pc.set(X, Y, C[0]);
    else if (Math.abs(u + 3.6) < 0.32 && x > 8 && y > 8) pc.set(X, Y, C[1]);
    else if (Math.abs(u - 4) < 0.4 && x < 20 && y < 20) pc.set(X, Y, C[2]);
  });
  // rivets at the quarters, a little maker's mark
  for (const a of [-2.36, -0.79, 0.79, 2.36]) rivet(pc, 14.6 + Math.cos(a) * 9.6 - 0.5, 14.6 + Math.sin(a) * 9.6 - 0.5, B);
  dents(pc, ring, B, { dens: 0.05, seed: 2, only: (X, Y) => !glass.get(X, Y) });
  ink(pc);
  sparkle(pc, 10, 9, 2, 0xffffff, C[1], 0.6);
}

/** A cracked stone tablet: carved runes, the deepest ones laid with gold, a chipped corner, moss. */
function tablet(pc) {
  const ST = mat(0x8a8274, { cont: 1.05 }), G = GOLD(), MO = mat(0x5a8a3a, { cont: 1.1 });
  // the slab's right side and bottom (its thickness), then the face
  const side = loop([[24.6, 6], [26.6, 7.6], [26.8, 29], [9, 29.6], [7.4, 28.6], [24.6, 27.4]], { seg: 2 });
  form(pc, side, ST, { bias: -0.28, flatten: 0.4, dome: 0.1, lip: false, lo: 3 });
  const face = loop([[7, 6.4], [9.4, 3.8], [12.6, 2.8], [16, 2.4], [19.6, 2.8], [22.6, 3.8], [24.8, 6.4], [24.8, 27.8, 1], [21.2, 28, 1], [19.6, 26.2, 1], [18.4, 28.2, 1], [7.2, 28.4, 1]], { seg: 4 });
  // (the bottom-right corner broke off: the notch above)
  seam(pc, face, 'shadow');
  face.each((X, Y) => {
    const x = dc(X), y = dc(Y);
    const t = isTop(face, X, Y) && !isBot(face, X, Y) ? 1 : isBot(face, X, Y) ? 4 : 3;
    const n = vnoise(x * 0.55, y * 0.55, 3);
    pc.set(X, Y, ST[clamp(t + (n > 0.7 ? 1 : n < 0.2 ? -1 : 0), 1, 5)]);
  });
  // the arch's raised border
  const brd = face.clone().erode(nc(1.6));
  brd.edge().each((X, Y) => pc.set(X, Y, isTop(brd, X, Y) ? ST[5] : ST[2]));
  // runes: carved in rows, the ones on the middle row laid with gold
  const glyphs = [
    [[0, 0, 0, 3], [0, 0, 2, 1]], [[0, 3, 1, 0], [1, 0, 2, 3]], [[0, 1, 2, 1], [1, 0, 1, 3]], [[0, 0, 2, 3], [2, 0, 0, 3]],
    [[1, 0, 1, 3], [0, 2, 2, 2]], [[0, 0, 2, 0], [2, 0, 0, 3]], [[0, 0, 0, 3], [0, 3, 2, 2]], [[1, 0, 0, 3], [1, 0, 2, 3]],
  ];
  let gi = 0;
  for (const [row, y] of [[0, 7.6], [1, 13.8], [2, 20]]) for (const x of [9.6, 14.6, 19.6]) {
    const gph = glyphs[(gi++ * 5 + row) % glyphs.length].map(([a, b, c, d]) => [a * 1.4, b * 1.4, c * 1.4, d * 1.4]);
    for (const [a, b, c, d] of gph) {
      if (row === 1) {
        line(pc, x + a, y + b, x + c, y + d, (i, X, Y) => (brd.get(X, Y) ? G[i % 3 ? 2 : 1] : null));
        line(pc, x + a + 0.5, y + b + 0.5, x + c + 0.5, y + d + 0.5, (i, X, Y) => (brd.get(X, Y) && ST.indexOf(pc.get(X, Y)) >= 0 ? ST[5] : null));
      } else carve(pc, ST, x + a, y + b, x + c, y + d, brd);
    }
  }
  // a crack from the chipped corner, moss in the bottom-left
  let cx = 19.6, cy = 26;
  for (let i = 0; i < 9; i++) { const nx = cx - 1.1 - hash2(i, 1, 4) * 0.8, ny = cy - 1.2 - hash2(i, 2, 4) * 0.6; carve(pc, ST, cx, cy, nx, ny, face, 3); cx = nx; cy = ny; }
  face.each((X, Y) => {
    const x = dc(X), y = dc(Y);
    if (x > 13 || y < 22) return;
    const n = vnoise(x * 0.8, y * 0.8, 9) + (y - 22) * 0.05 - (x - 7) * 0.03;
    if (n > 0.72) pc.set(X, Y, MO[hash2(X, Y, 3) < 0.3 ? 2 : isTop(face, X, Y) ? 2 : 3]);
  });
  pits(pc, face, ST, 0.04, 7, 0.02);
  ink(pc);
  glint(pc, 14, 14, 0, G[1], 0.4);
}

/** The ember crown: a copper-red circlet with five points, fire opals and a big ember stone. */
function crown(pc) {
  const C = mat(0xd8783a, { cont: 1.15, warm: 40 }), E = mat(0xff6a2a, { cont: 1.05 }), GR = GOLD();
  // the back of the band (inside of the crown) shows behind the points
  const back = loop([[7, 17.4], [16, 15.6], [25, 17.4], [25, 19.4], [16, 18], [7, 19.4]]);
  back.each((X, Y) => pc.set(X, Y, C[Y < nc(17.4) ? 5 : 6]));
  const tips = [[7.4, 9.6], [11.8, 7.2], [16, 5.4], [20.2, 7.2], [24.6, 9.6]];
  // band front: bows toward you
  const band = loop([[5.4, 17.2], [16, 19.8], [26.6, 17.2], [26.6, 24], [16, 27.2], [5.4, 24]], { seg: 6 });
  const spikes = M();
  const by = (x) => 17.4 + (1 - Math.abs(x - 16) / 10.6) * 2.4;
  for (let k = 0; k < 5; k++) {
    const [tx, ty] = tips[k], b0 = 5.4 + k * 4.24, b1 = b0 + 4.24;
    spikes.poly([[b0 - 0.2, by(b0) + 0.6], [tx - 0.5, ty + 1.2], [tx, ty + 0.6], [tx + 0.5, ty + 1.2], [b1 + 0.2, by(b1) + 0.6]]);
  }
  const front = spikes.union(band);
  part(pc, front, C, { cx: 15, cy: 15, rx: 11, ry: 11, bias: 0.06 });
  // spikes in two planes (a fold down each one's middle)
  for (let k = 0; k < 5; k++) {
    const [tx, ty] = tips[k], bx = 5.4 + k * 4.24 + 2.12, yb = by(bx);
    front.each((X, Y) => {
      const x = dc(X), y = dc(Y);
      if (y > yb || y < ty + 0.6) return;
      const mx = tx + (bx - tx) * ((y - ty) / (yb - ty));
      if (x > mx + 0.3 && x < mx + 2.4) step(pc, C, X, Y, 1); // the shaded plane right of the fold
      else if (Math.abs(x - mx) <= 0.3) pc.set(X, Y, C[1]); // the fold catches the light
    });
  }
  // the band's raised top and bottom ridges and a row of beads
  band.each((X, Y) => {
    const x = dc(X), y = dc(Y), top = 17.2 + (1 - Math.abs(x - 16) / 10.6) * 2.6, bot = 24 + (1 - Math.abs(x - 16) / 10.6) * 3.2;
    if (y < top + 0.8) pc.set(X, Y, C[x < 16 ? 1 : 2]);
    else if (y > bot - 1.1) pc.set(X, Y, C[y > bot - 0.5 ? 5 : 4]);
  });
  for (let x = 7; x <= 25; x += 1.5) {
    const y = 18.4 + (1 - Math.abs(x - 16) / 10.6) * 2.6 + 3.4;
    if (Math.abs(x - 16) < 2.8) continue;
    const X = np(x), Y = np(y);
    P(pc, X, Y, GR[1]); P(pc, X + 1, Y, GR[3]); P(pc, X, Y + 1, GR[3]); P(pc, X + 1, Y + 1, GR[5]);
  }
  // fire opals on the tips: little cut stones (a lit facet, a deep facet, an ember core)
  for (const [tx, ty] of tips) {
    const X = np(tx) - 1, Y = np(ty) - 1;
    const D = [[-1, 1, 2, -1], [1, 0, 2, 3], [2, 2, 3, 4], [-1, 3, 4, -1]];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (D[j][i] >= 0) { P(pc, X + i, Y + j, E[D[j][i]]); pc.emit(X + i, Y + j, 0.8); }
    P(pc, X - 1, Y + 1, C[6]); P(pc, X - 1, Y + 2, C[6]); P(pc, X + 4, Y + 1, C[6]); P(pc, X + 4, Y + 2, C[6]); P(pc, X + 1, Y - 1, C[6]); P(pc, X + 2, Y - 1, C[6]);
  }
  // the ember stone in a gold bezel
  const bez = loop([[16, 19.2], [19, 20.6], [19.6, 23.2], [16, 25.8], [12.4, 23.2], [13, 20.6]]);
  part(pc, bez, GR, { bias: 0.1 });
  const st = [[16, 20.2], [18.2, 21.2], [18.6, 23], [16, 24.8], [13.4, 23], [13.8, 21.2]];
  const stone = M().poly(st);
  facet(pc, [[16, 20.2], [13.8, 21.2], [13.4, 23], [16, 22.6]], E, [-0.7, -0.5, 1], { emit: 0.8 });
  facet(pc, [[16, 20.2], [18.2, 21.2], [18.6, 23], [16, 22.6]], E, [0.5, -0.6, 1], { emit: 0.8 });
  facet(pc, [[13.4, 23], [16, 24.8], [18.6, 23], [16, 22.6]], E, [0.1, 0.9, 1], { emit: 0.8 });
  stone.edge().each((X, Y) => { if (isBot(stone, X, Y)) pc.set(X, Y, E[5]); });
  dents(pc, front, C, { dens: 0.05, seed: 7, only: (X, Y) => !bez.get(X, Y) });
  ink(pc);
  P(pc, np(15), np(21), 0xffffff); P(pc, np(15) + 1, np(21), E[0]);
  sparkle(pc, 9.4, 21.6, 1, 0xffffff, C[1]);
  glint(pc, 16, 6, 0, E[0], 0.9);
}

/** A bronze hand mirror: a scalloped frame, a pale silvered glass, a wrapped grip and a finial. */
function mirror(pc) {
  const B = mat(0xc8944a, { cont: 1.15, warm: 50 }), C = mat(0xd8eaf4, { cont: 0.9 }), L = mat(0x6a2a3a, { cont: 1.05 });
  // grip and finial
  const grip = loop([[14.2, 22], [17.8, 22], [17.4, 27.4], [18.4, 28.6], [16, 30], [13.6, 28.6], [14.6, 27.4]]);
  part(pc, grip, B, { bias: 0.06 });
  const wrap = grip.clone().and(M().fn((x, y) => y > 23 && y < 27.2));
  wrap.each((X, Y) => {
    const f = (Y + Math.floor(X / 2)) % 4;
    pc.set(X, Y, L[f === 0 ? 5 : f === 1 ? 2 : isBot(wrap, X, Y) ? 4 : 3]);
  });
  // the frame: scalloped edge (eight lobes)
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 10.6 + (i % 3 === 0 ? 0.9 : 0);
    pts.push([16 + Math.cos(a) * r * 0.92, 12.6 + Math.sin(a) * r]);
  }
  const fr = loop(pts, { seg: 3 });
  part(pc, fr, B, { cx: 15, cy: 11.6, rx: 10, ry: 11, bias: 0.08, dome: 0.55, round: 1.6 });
  // a chased leaf on the frame at the bottom, rivet beads round it
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    rivet(pc, 16 + Math.cos(a) * 9.3 * 0.92 - 0.5, 12.6 + Math.sin(a) * 9.3 - 0.5, B);
  }
  // glass
  const gp = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; gp.push([16 + Math.cos(a) * 7.4 * 0.92, 12.6 + Math.sin(a) * 7.6]); }
  const gl2 = loop(gp, { seg: 3 });
  seam(pc, gl2, B[6], { soft: false });
  gl2.each((X, Y) => {
    const x = dc(X), y = dc(Y), u = (x - 16) + (y - 12.6);
    let k = u < -4 ? 1 : u < 1 ? 2 : u < 5 ? 3 : 4;
    if (Math.abs(u + 2.4) < 0.7) k = 0;
    if (Math.abs(u - 2) < 0.35) k = 1;
    pc.set(X, Y, C[k]); pc.emit(X, Y, 0.3);
  });
  gl2.edge().each((X, Y) => { if (isBot(gl2, X, Y)) pc.set(X, Y, C[4]); else pc.set(X, Y, B[5]); });
  dents(pc, fr, B, { dens: 0.04, seed: 9, only: (X, Y) => !gl2.get(X, Y) });
  ink(pc);
  sparkle(pc, 12.6, 9, 2, 0xffffff, C[1], 0.8);
}

/** A crystal mask cut in planes: almond eye holes, a star on the brow, a faint inner light. */
function mask(pc) {
  const C = mat(0x8acff0, { cont: 1.05 });
  const face = loop([[16, 2.8], [21.6, 4], [25.2, 7.6], [26, 12.6], [24.8, 18.4], [21.6, 23.6], [18.4, 27.6], [16, 28.8], [13.6, 27.6], [10.4, 23.6], [7.2, 18.4], [6, 12.6], [6.8, 7.6], [10.4, 4]]);
  seam(pc, face, 'shadow');
  // facets: brow (two), cheeks (two each side), nose ridge, chin
  const F = [
    [[[16, 2.8], [10.4, 4], [6.8, 7.6], [6, 12.6], [16, 11]], [-0.5, -0.7, 1]],
    [[[16, 2.8], [21.6, 4], [25.2, 7.6], [26, 12.6], [16, 11]], [0.45, -0.6, 1]],
    [[[6, 12.6], [16, 11], [13.6, 19.6], [7.2, 18.4]], [-0.8, 0.1, 1]],
    [[[26, 12.6], [16, 11], [18.4, 19.6], [24.8, 18.4]], [0.8, 0.15, 1]],
    [[[16, 11], [13.6, 19.6], [16, 21], [18.4, 19.6]], [0, -0.2, 1]],
    [[[7.2, 18.4], [13.6, 19.6], [16, 21], [16, 28.8], [13.6, 27.6], [10.4, 23.6]], [-0.5, 0.6, 1]],
    [[[24.8, 18.4], [18.4, 19.6], [16, 21], [16, 28.8], [18.4, 27.6], [21.6, 23.6]], [0.5, 0.7, 1]],
  ];
  for (const [pts, n] of F) facet(pc, pts, C, n, { clip: face, emit: 0.25 });
  // crisp ridges between facets
  for (const [a, b, k] of [[[16, 2.8], [16, 11], 1], [[16, 11], [13.6, 19.6], 1], [[16, 11], [18.4, 19.6], 3], [[6, 12.6], [16, 11], 2], [[13.6, 19.6], [16, 21], 1], [[16, 21], [16, 28.8], 2], [[7.2, 18.4], [13.6, 19.6], 2]]) line(pc, a[0], a[1], b[0], b[1], C[k], face);
  // eye holes: almonds, cut through (the inside of the hole is the crystal's dark thickness)
  for (const s of [-1, 1]) {
    const ex = 16 + s * 5;
    const eye = loop([[ex - 3 * s, 12.4], [ex - 1 * s, 10.8], [ex + 2 * s, 11.2], [ex + 3.2 * s, 12.6], [ex + 1 * s, 13.8], [ex - 1.6 * s, 13.6]]);
    seam(pc, eye, C[1], { soft: false, only: (X, Y) => Y > nc(12.4) });
    eye.each((X, Y) => pc.clear(X, Y));
    eye.edge().each((X, Y) => { if (Y < nc(12.4)) { pc.set(X, Y, C[5]); } });
  }
  // the star on the brow, glowing
  const sx = nc(16), sy = nc(7);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, L = k % 2 ? 2 : 4;
    for (let r = 1; r <= L; r++) gl(pc, sx + Math.round(Math.cos(a) * r), sy + Math.round(Math.sin(a) * r), r === L ? C[1] : 0xffffff, 0.9);
  }
  gl(pc, sx, sy, 0xffffff, 1);
  // a hairline fracture and frost speckle
  carve(pc, C, 22, 6, 20.6, 8.6, face, 1);
  speckle(pc, face, [C[0], C[1]], 0.025, 8, (X, Y) => !isTop(face, X, Y));
  ink(pc);
  sparkle(pc, 10, 7.4, 2, 0xffffff, C[1], 0.5);
}

/** The star key: a five-pointed bow round a sky crystal, a long shaft and a stepped bit. */
function key(pc) {
  const G = GOLD(), C = mat(0x58c8e0, { cont: 1.1 });
  // shaft and bit
  const sh = M().capsule(12.4, 12.4, 27, 27, 1.4);
  const bit = M().poly([[22.6, 25.4], [25.4, 22.6], [29.2, 26.4], [27.6, 28], [26.4, 26.8], [25.2, 28], [24, 26.8]]);
  const sb = sh.clone().union(bit);
  part(pc, sb, G, { cx: 19, cy: 19, rx: 8, ry: 8, bias: 0.06, dome: 0.6, round: 1.2 });
  line(pc, 13, 12.2, 26.4, 25.6, G[1], sb); // the shaft's lit crest
  for (const t of [0.42, 0.5]) { const x = 12.4 + (27 - 12.4) * t; line(pc, x - 1.4, x + 1.4, x + 1.4, x - 1.4, G[5], sb); } // collar grooves
  // the bow: a star with rounded tips
  const star = [];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2 - 0.25, r = k % 2 ? 3.4 : 7.4;
    star.push([10 + Math.cos(a) * r, 10 + Math.sin(a) * r]);
  }
  const bow = loop(star, { seg: 3 });
  part(pc, bow, G, { cx: 9, cy: 9, rx: 7, ry: 7, bias: 0.08 });
  // each arm in two planes: a ridge from the centre to the tip
  for (let k = 0; k < 10; k += 2) {
    const [tx, ty] = star[k];
    line(pc, 10, 10, tx, ty, (i, X, Y) => (bow.get(X, Y) && !isTop(bow, X, Y) ? G[1] : null));
  }
  // the crystal in the middle (a cut stone: four facets)
  facet(pc, [[10, 7.6], [12.4, 10], [10, 10]], C, [0.5, -0.6, 1], { emit: 0.7 });
  facet(pc, [[10, 7.6], [7.6, 10], [10, 10]], C, [-0.6, -0.6, 1], { emit: 0.7 });
  facet(pc, [[7.6, 10], [10, 12.4], [10, 10]], C, [-0.5, 0.6, 1], { emit: 0.7 });
  facet(pc, [[12.4, 10], [10, 12.4], [10, 10]], C, [0.6, 0.6, 1], { emit: 0.7 });
  const st = M().poly([[10, 7.6], [12.4, 10], [10, 12.4], [7.6, 10]]);
  st.edge().each((X, Y) => pc.set(X, Y, isTop(st, X, Y) ? G[5] : G[4]));
  dents(pc, sb, G, { dens: 0.05, seed: 4 });
  ink(pc);
  gl(pc, np(9.4), np(9), 0xffffff, 1);
  sparkle(pc, 5, 4.4, 2, 0xffffff, G[1]);
}

/** A storm orb: violet glass with a slow swirl and stars inside, on a three-clawed gold stand. */
function orb(pc) {
  const V = mat(0x4a2a7a, { cont: 1.2 }), G = GOLD(), SW = 0xc89aff;
  // the stand's base
  const base = loop([[8.4, 25.4], [12, 23.8], [20, 23.8], [23.6, 25.4], [24, 27.8], [20.4, 29.2], [11.6, 29.2], [8, 27.8]]);
  part(pc, base, G, { flatten: 0.6, bias: 0.08 });
  line(pc, 9, 26.4, 23, 26.4, (i, X, Y) => (base.get(X, Y) ? G[i % 6 === 0 ? 1 : 4] : null));
  // the orb
  const pts = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; pts.push([16 + Math.cos(a) * 9.8, 14.4 + Math.sin(a) * 9.8]); }
  const ball = loop(pts, { seg: 3 });
  form(pc, ball, V, { cx: 15, cy: 13.4, rx: 10, ry: 10, bias: 0.04, emit: 0.25 });
  // the swirl: a spiral arm of light, brighter toward its heart
  for (let t = 0; t < 160; t++) {
    const a = t * 0.075, r = 0.6 + t * 0.052;
    const X = np(16 + Math.cos(a) * r), Y = np(14.4 + Math.sin(a) * r * 0.9);
    if (!ball.get(X, Y)) continue;
    const c = t < 40 ? 0xf4e8ff : t < 100 ? SW : mix(SW, V[3], 0.45);
    gl(pc, X, Y, c, t < 100 ? 0.8 : 0.5);
    if (t < 70 && ball.get(X + 1, Y)) gl(pc, X + 1, Y, mix(c, V[2], 0.3), 0.6);
  }
  // stars inside
  for (let i = 0; i < 14; i++) {
    const X = np(9 + hash2(i, 1, 5) * 14), Y = np(7.6 + hash2(i, 2, 5) * 13);
    if (ball.clone().erode(2).get(X, Y)) gl(pc, X, Y, i % 3 ? 0xe8d8ff : 0xffffff, 0.9);
  }
  // the glass catches the light: a bright window top-left, a pale rim on the far side
  ball.each((X, Y) => {
    const x = dc(X), y = dc(Y);
    const d = Math.hypot(x - 11.6, y - 9.6);
    if (d < 1.6 && (x - 11.6) * 0.7 - (y - 9.6) < 1.2) pc.set(X, Y, d < 0.8 ? 0xffffff : V[0]);
    const e = Math.hypot(x - 16, y - 14.4);
    if (e > 8.3 && e < 9.2 && x + y > 33) pc.set(X, Y, V[2]);
  });
  // three claws gripping it
  for (const [x0, y0, x1, y1, x2, y2] of [[10.4, 24.2, 7.6, 21, 8.4, 18.2], [21.6, 24.2, 24.4, 21, 23.6, 18.2], [16, 24.4, 16, 23, 16, 21.6]]) {
    const cl = M().path([[x0, y0], [x1, y1], [x2, y2]], 1.1);
    part(pc, cl, G, { bias: 0.1, round: 1 });
    line(pc, x0, y0, x1, y1, G[1], cl);
  }
  ink(pc);
  glint(pc, 12, 9.6, 1, V[1], 0.6);
}

/** A gold amulet on a fine chain: a diamond frame with filigree round a heart-cut ruby. */
function amulet(pc) {
  const G = GOLD(), H = mat(0xd8283a, { cont: 1.1 });
  // the chain: little links alternating face-on and edge-on along an arc
  for (let t = 0; t <= 24; t++) {
    const a = Math.PI * (0.06 + 0.88 * (t / 24));
    const x = 16 + Math.cos(a) * 11.4, y = 14.6 - Math.sin(a) * 11.4;
    const X = np(x), Y = np(y);
    if (t % 2 === 0) { P(pc, X, Y - 1, G[2]); P(pc, X - 1, Y, G[2]); P(pc, X + 1, Y, G[4]); P(pc, X, Y + 1, G[5]); }
    else { P(pc, X, Y, G[1]); P(pc, X + (x < 16 ? 1 : -1), Y, G[3]); }
  }
  // the bail
  const bail = loop([[14.6, 11.6], [16, 10.6], [17.4, 11.6], [17.2, 14], [14.8, 14]]);
  part(pc, bail, G, { bias: 0.1 });
  bail.clone().erode(nc(0.9)).each((X, Y) => pc.set(X, Y, G[6]));
  // the frame
  const fr = M().poly([[16, 13.4], [24.6, 20.6], [16, 29.6], [7.4, 20.6]]);
  part(pc, fr, G, { cx: 15, cy: 20, rx: 8, ry: 8, bias: 0.06 });
  facet(pc, [[16, 13.4], [7.4, 20.6], [16, 20.6]], G, [-0.5, -0.6, 1], { clip: fr });
  facet(pc, [[16, 13.4], [24.6, 20.6], [16, 20.6]], G, [0.5, -0.5, 1], { clip: fr });
  facet(pc, [[7.4, 20.6], [16, 29.6], [16, 20.6]], G, [-0.4, 0.6, 1], { clip: fr });
  facet(pc, [[24.6, 20.6], [16, 29.6], [16, 20.6]], G, [0.55, 0.6, 1], { clip: fr });
  // filigree: tiny curls in the frame's corners
  for (const [cx, cy, s] of [[10, 20.6, 1], [22, 20.6, -1]]) {
    const X = np(cx), Y = np(cy);
    for (const [dx, dy] of [[0, -1], [1, -2], [2, -2], [3, -1], [3, 0], [2, 1], [1, 1]]) step(pc, G, X + dx * s, Y + dy, 2);
  }
  // the heart ruby
  const ht = loop([[16, 19], [17.4, 17.4], [19.4, 17], [20.6, 18.6], [20.2, 20.8], [18, 23.4], [16, 25.4], [14, 23.4], [11.8, 20.8], [11.4, 18.6], [12.6, 17], [14.6, 17.4]]);
  seam(pc, ht, G[6], { soft: false });
  ht.each((X, Y) => {
    const x = dc(X), y = dc(Y);
    let k = x < 16 ? (y < 20 ? 1 : 3) : (y < 20 ? 2 : 4);
    if (Math.abs(x - 16) < 0.45 && y > 19.4) k = 2;
    if (Math.hypot(x - 16, y - 20.4) < 1.6) k = x < 16 ? 2 : 3;
    pc.set(X, Y, H[k]); pc.emit(X, Y, 0.6);
  });
  ht.edge().each((X, Y) => { if (isBot(ht, X, Y)) pc.set(X, Y, H[5]); });
  dents(pc, fr, G, { dens: 0.05, seed: 6, only: (X, Y) => !ht.get(X, Y) });
  ink(pc);
  P(pc, np(13.6), np(18.4), 0xffffff); P(pc, np(13.6) + 1, np(18.4), H[0]);
  sparkle(pc, 9.4, 18.8, 1, 0xffffff, G[1]);
}

const DRAW = { idol, disc, ewer, lens, tablet, crown, mirror, mask, key, orb, amulet };

/** drawIconArt hook: true when it drew the spec. */
export function drawRelic(pc, spec) {
  if (!spec || spec.k !== 'relic') return false;
  const fn = DRAW[spec.t] || DRAW.idol;
  fn(pc);
  return true;
}
