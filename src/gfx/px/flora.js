// 32×32 icons: harvested cave plants (carrots, mushrooms, ferns, flowers, roots...).
import { mat, mix } from './color.js';
import { vol, fill, sparkle, hash2, vnoise } from './shade.js';
import { M, ring, lineIn } from './parts.js';

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };

/** Lens-shaped leaf from (x0,y0) to (x1,y1) with max half-width w; bend curves it sideways. */
export function leafMask(x0, y0, x1, y1, w, bend = 0) {
  const m = M();
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const b = Math.sin(t * Math.PI) * bend;
    const r = Math.max(0.3, Math.sin(Math.pow(t, 0.8) * Math.PI) * w);
    m.disk(x0 + dx * t + px * b, y0 + dy * t + py * b, r);
  }
  return m;
}
export function leaf(pc, x0, y0, x1, y1, w, R, o = {}) {
  const m = leafMask(x0, y0, x1, y1, w, o.bend || 0);
  if (o.ring !== false) ring(pc, m, R);
  vol(pc, m, R, { round: Math.max(1, w * 0.8), spec: o.spec });
  // midrib
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L;
  for (let i = 2; i < 38; i++) {
    const t = i / 40, b = Math.sin(t * Math.PI) * (o.bend || 0);
    const x = x0 + dx * t + px * b, y = y0 + dy * t + py * b;
    if (m.get(x, y)) pc.set(x, y, o.rib ?? R[1]);
  }
  return m;
}
/** Curvy stem through points. */
export function stem(pc, pts, r, R, o = {}) {
  const m = M().path(pts, r);
  if (o.ring !== false) ring(pc, m, R);
  vol(pc, m, R, { round: Math.max(0.8, r) });
  return m;
}

/** A fern frond: curved rachis with alternating leaflets. */
function frond(pc, x0, y0, len, ang, curl, R, o = {}) {
  const pts = [];
  let x = x0, y = y0, a = ang;
  for (let i = 0; i <= len; i++) { pts.push([x, y]); x += Math.cos(a); y += Math.sin(a); a += (curl * 2 * i) / (len * len); }
  const all = M();
  const leaflets = [];
  for (let i = 2; i < pts.length - 1; i += o.step ?? 3) {
    const [px, py] = pts[i];
    const t = i / pts.length;
    const la = Math.atan2(pts[i + 1][1] - py, pts[i + 1][0] - px);
    const l = (1 - t) * (o.leafLen ?? 4.2) + 1.2;
    for (const s of [-1, 1]) {
      const a2 = la + s * (Math.PI / 2 - 0.5);
      const m = leafMask(px, py, px + Math.cos(a2) * l, py + Math.sin(a2) * l, Math.max(0.6, l * 0.3), s * 0.5);
      leaflets.push(m); all.union(m);
    }
  }
  const rach = M().path(pts, 0.6);
  all.union(rach);
  ring(pc, all, R);
  for (const m of leaflets) vol(pc, m, R, { round: 1.2 });
  fill(pc, rach, R[4]);
  for (let i = 0; i < pts.length; i += 3) pc.set(pts[i][0], pts[i][1], R[2]);
  return all;
}

// ---------------------------------------------------------------- the plants
function carrot(pc, pale = true, pepper = false) {
  const R = pepper ? mat(0xd83a26, { cont: 1.2, warm: 40 }) : mat(0xf0b884, { cont: 1.1 });
  const LR = mat(0x5aa84a, { cont: 1.1 });
  if (!pepper) {
    // feathery greens at the top-right
    leaf(pc, 19, 13, 27, 2, 2.4, LR, { bend: -1.5 });
    leaf(pc, 19, 13, 30, 9, 2.2, LR, { bend: 1.2 });
    leaf(pc, 18, 12, 21, 1.5, 2, LR, { bend: 1 });
  } else {
    leaf(pc, 20, 11, 28, 6, 2.2, LR, { bend: -1 });
  }
  // tapered root pointing to the bottom-left
  const body = M();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = 19 - t * 15, y = 13 + t * 15 + (pepper ? Math.sin(t * 3) * 2 : 0);
    body.disk(x, y, Math.max(0.5, (pepper ? 4.2 : 4.6) * Math.pow(1 - t, pepper ? 0.6 : 0.8)));
  }
  ring(pc, body, R);
  vol(pc, body, R, { round: 3, spec: pepper ? 0.75 : false, bounce: true });
  // growth rings / creases
  if (!pepper) for (const [x, y, l] of [[15, 16, 3], [12, 20, 2.5], [9, 23, 2], [17, 13.5, 2]]) lineIn(pc, x - l * 0.5, y - l * 0.6, x + l * 0.4, y + l * 0.5, R[4], body);
  // stem cap
  const cap = M().ellipse(19.5, 12.5, 3, 2);
  const CR = mat(0x4a8a3a);
  fill(pc, cap.and(body.clone().dilate(1)), CR[3]);
  pc.set(18, 11, CR[1]);
  if (pepper) {
    for (const [x, y] of [[14, 17], [10, 22]]) pc.set(x, y, R[0]);
    for (const [x, y] of [[6, 26], [4, 28]]) gl(pc, x, y, 0xffb040, 0.6);
  }
}

function glowcap(pc) {
  const ST = mat(0xe8e0d0, { cont: 1 });
  const CP = mat(0x4ab0ff, { cont: 1.05 });
  const GI = 0xbff0ff;
  // mossy clump they grow from
  const MO = mat(0x3e6a3a, { cont: 1 });
  const base = M().ellipse(15, 28.5, 11, 3.2);
  ring(pc, base, MO); vol(pc, base, MO, { round: 2 });
  base.each((x, y) => { if (hash2(x, y, 3) < 0.25) pc.set(x, y, MO[2]); });
  const shroom = (cx, cy, r, h) => {
    const stem2 = M().poly([[cx - r * 0.22, cy], [cx + r * 0.22, cy], [cx + r * 0.36, cy + h], [cx - r * 0.3, cy + h]]);
    ring(pc, stem2, ST); vol(pc, stem2, ST, { mode: 'cyl', axis: Math.PI / 2 });
    // gills: luminous underside band
    const gills = M().ellipse(cx, cy + 0.5, r * 0.95, r * 0.32);
    const cap = M().ellipse(cx, cy - r * 0.1, r, r * 0.72).sub(M().rect(0, Math.round(cy + 0.5), 32, 32));
    ring(pc, gills.clone().union(cap), CP);
    gills.each((x, y) => { gl(pc, x, y, (x % 2) ? GI : 0x7fd8ff, 0.9); });
    vol(pc, cap, CP, { emit: 0.85, spec: 0.85, round: r * 0.6 });
    // spots
    for (const [dx, dy] of [[-0.4, -0.35], [0.25, -0.5], [0.5, -0.1], [-0.1, -0.1]]) gl(pc, cx + dx * r, cy + dy * r, 0xe0f8ff, 1);
  };
  shroom(21.5, 15, 5.2, 13);
  shroom(11.5, 9.5, 7.8, 18.5);
  shroom(26.5, 23, 2.6, 5);
  for (const [x, y] of [[4, 6], [27, 5], [25, 23]]) gl(pc, x, y, 0xbff0ff, 0.9);
}

function blindfern(pc) {
  const R = mat(0xd4dcc4, { cont: 1.2, sat: 0.8 });
  frond(pc, 14, 31, 28, -1.45, 1.25, R, { leafLen: 6, step: 2 });
  frond(pc, 12, 31, 21, -2.0, -0.9, R, { leafLen: 4.8, step: 2 });
}

function whisperweed(pc) {
  const R = mat(0xa684c8, { cont: 1.1 });
  // root tuft
  const SO = mat(0x6b4a32);
  const soil = M().ellipse(16, 28, 7, 2.6);
  ring(pc, soil, SO); vol(pc, soil, SO, { round: 1.5 });
  const tendril = (pts, r) => { const m = M().path(pts, r); ring(pc, m, R); vol(pc, m, R, { round: 1 }); return m; };
  tendril([[13, 27], [11, 21], [7, 17], [5, 11], [8, 6], [11, 8]], 1.2);
  tendril([[16, 27], [17, 19], [15, 12], [17, 5], [21, 3], [22, 6]], 1.3);
  tendril([[19, 27], [23, 21], [26, 15], [24, 10], [27, 7]], 1.1);
  // tiny leaves and glowing tips
  for (const [x0, y0, x1, y1] of [[10, 20, 6, 22], [16, 15, 20, 14], [24, 18, 28, 19], [16, 22, 12, 24]]) leaf(pc, x0, y0, x1, y1, 1.4, mat(0x8a70b0), { bend: 0.5 });
  for (const [x, y] of [[11, 8], [22, 6], [27, 7]]) { gl(pc, x, y, 0xf0e0ff, 0.9); gl(pc, x + 1, y, 0xd0b8f8, 0.7); }
}

function rubberSap(pc) {
  // a tapped vine with a long stretchy strand of pale latex pooling into a glossy glob
  const VR = mat(0x4a7a3a, { cont: 1.1 });
  const vine = M().capsule(2, 7, 29, 4, 2.6);
  ring(pc, vine, VR); vol(pc, vine, VR, { mode: 'cyl', axis: -0.11 });
  for (const x of [6, 13, 23]) { pc.set(x, 5, VR[1]); pc.set(x + 1, 7, VR[5]); }
  leaf(pc, 24, 4, 30, 11, 2, mat(0x5aa84a), { bend: -1 });
  leaf(pc, 4, 6, 2, 13, 1.6, mat(0x5aa84a), { bend: 1 });
  const SR = mat(0xf2e4b6, { cont: 1.15 });
  // strand: thick at the cut, thins in the middle, widens into the glob
  const strand = M();
  for (let i = 0; i <= 30; i++) { const t = i / 30; const y = 8 + t * 14; const x = 15 + Math.sin(t * 3.2) * 1.6; strand.disk(x, y, 1.6 - Math.sin(t * Math.PI) * 0.9); }
  const glob = M().ellipse(15.5, 25, 8, 4.6).union(M().ellipse(13, 23, 4, 3.2));
  const all = strand.clone().union(glob);
  ring(pc, all, SR);
  vol(pc, strand, SR, { mode: 'cyl', axis: Math.PI / 2, spec: 0.8 });
  vol(pc, glob, SR, { spec: 0.75, shine: 10, round: 3, bounce: true });
  // cut notch on the vine, a fresh bead forming
  pc.set(14, 6, SR[1]); pc.set(15, 6, SR[2]); pc.set(16, 6, SR[1]);
  const bead = M().disk(22, 11, 1.6); ring(pc, bead, SR); vol(pc, bead, SR, { spec: 0.7 });
  sparkle(pc, 12, 22, 1, 0xffffff, SR[0]);
}

function sparkmoss(pc) {
  const R = mat(0x3a86d8, { cont: 1.1 });
  // rock pebble base
  const RK = mat(0x6a6460);
  const rock = M().ellipse(16, 25, 12, 5);
  ring(pc, rock, RK); vol(pc, rock, RK, { round: 3 });
  // moss cushion made of little round tufts
  const moss = M();
  const tufts = [[8, 21, 3.4], [13, 18, 4], [19, 17.5, 4.2], [24, 20.5, 3.4], [16, 21.5, 4], [10, 23, 3], [22, 23, 3]];
  for (const [x, y, r] of tufts) moss.disk(x, y, r);
  ring(pc, moss, R);
  vol(pc, moss, R, { round: 3.5 });
  for (const [x, y, r] of tufts) { const t = M().disk(x, y, r).and(moss); t.edge().each((X, Y) => { if (X + Y > x + y + r * 0.8) pc.set(X, Y, R[4]); }); }
  moss.each((x, y) => { if (hash2(x, y, 4) < 0.18) { const k = R.indexOf(pc.getHex(x, y)); if (k > 1) pc.set(x, y, R[k - 1]); } });
  // sparks
  const sp = (pts) => { for (let i = 0; i + 1 < pts.length; i++) lineIn(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0xfff27a, null, 1); };
  sp([[9, 13], [11, 10], [9, 8], [11, 5]]);
  sp([[21, 12], [19, 9], [22, 7], [20, 4]]);
  sp([[26, 15], [28, 12], [27, 10]]);
  for (const [x, y] of [[15, 10], [5, 16], [13, 6]]) gl(pc, x, y, 0xffffff, 1);
}

function bubblebulb(pc) {
  // leaves + stem, then a translucent bulb full of bubbles
  const LR = mat(0x5a9a4a);
  leaf(pc, 16, 28, 7, 24, 2.4, LR, { bend: 1 });
  leaf(pc, 16, 28, 25, 24, 2.4, LR, { bend: -1 });
  stem(pc, [[16, 28], [16, 22]], 1.2, mat(0x4a8a3a));
  const R = mat(0xc8a8f8, { cont: 1.1 });
  const bulb = M().ellipse(16, 13, 9.5, 9.5).poly([[13, 20], [19, 20], [16, 24]]);
  ring(pc, bulb, R);
  vol(pc, bulb, R, { spec: 0.8, shine: 10, round: 5 });
  // inner bubbles (lighter rings)
  for (const [x, y, r] of [[13, 15, 2.4], [19, 11, 1.8], [18, 17, 1.4], [12, 9, 1.2], [21, 15, 1]]) {
    const b = M().disk(x, y, r);
    b.edge().each((X, Y) => pc.set(X, Y, (X - x) + (Y - y) < 0 ? R[1] : R[4]));
    pc.set(x - r * 0.4, y - r * 0.4, 0xffffff);
  }
  sparkle(pc, 11, 7, 1, 0xffffff, R[0]);
}

function crystalLily(pc) {
  const LR = mat(0x6aa8a0, { cont: 1.05 });
  stem(pc, [[17, 30], [16, 22], [15, 16]], 1, LR);
  leaf(pc, 16, 27, 25, 21, 2.2, LR, { bend: -1.2 });
  const R = mat(0xc8ecff, { cont: 1.25, hs: 0.7 });
  // trumpet of glassy petals opening upward
  const petals = [
    [[15, 16], [6, 6], 3.2, 1.2],
    [[15, 16], [24, 5], 3.2, -1.2],
    [[15, 16], [15, 2], 3.4, 0],
    [[15, 16], [9, 13], 2.6, 0.5],
    [[15, 16], [22, 13], 2.6, -0.5],
  ];
  for (const [[x0, y0], [x1, y1], w, b] of petals) {
    const m = leaf(pc, x0, y0, x1, y1, w, R, { bend: b, rib: R[0], spec: 0.8 });
    m.edge().each((x, y) => { if (hash2(x, y, 1) < 0.4) pc.set(x, y, 0xffffff); });
  }
  // glowing stamens
  for (const [x, y] of [[14, 10], [16, 9], [18, 11]]) gl(pc, x, y, 0xfff2b0, 0.9);
  sparkle(pc, 24, 18, 1, 0xffffff, 0xd8f4ff);
}

function gloomshroom(pc) {
  const ST = mat(0x9a8aa8, { cont: 1 });
  const CP = mat(0x5a3478, { cont: 1.1 });
  const s = M().poly([[14, 15], [17, 15], [18.5, 29], [12.5, 29]]).union(M().ellipse(15.5, 28.5, 4.2, 1.8));
  ring(pc, s, ST); vol(pc, s, ST, { mode: 'cyl', axis: Math.PI / 2 });
  // ring skirt on the stem
  const sk = M().ellipse(15.5, 19.5, 3.6, 1.4); ring(pc, sk, ST); vol(pc, sk, ST, { round: 1 });
  // drooping bell cap
  const cap = M().ellipse(15.5, 12, 11, 7.5).sub(M().rect(0, 15, 32, 20)).union(M().ellipse(6, 14.5, 2.4, 2.4)).union(M().ellipse(25, 14.5, 2.4, 2.4));
  ring(pc, cap, CP);
  vol(pc, cap, CP, { round: 5, spec: 0.85 });
  for (const [x, y, r] of [[10, 9, 1.6], [17, 7, 1.3], [21, 11, 1.4], [13, 12.5, 1]]) { const m = M().disk(x, y, r); fill(pc, m, CP[1]); pc.set(x - 0.5, y - 0.5, 0xd8b8f0); }
  // sleepy spores drifting up
  for (const [x, y, c] of [[4, 5, 0xc8a8e8], [8, 2, 0xb090d8], [26, 4, 0xc8a8e8], [23, 1, 0xa080c8], [28, 9, 0xb090d8]]) { pc.set(x, y, c); pc.set(x + 1, y, mix(c, 0x5a3478, 0.4)); }
}

function ashfern(pc) {
  const R = mat(0x9a948e, { cont: 1.15 });
  frond(pc, 14, 31, 28, -1.45, 1.25, R, { leafLen: 6, step: 2 });
  frond(pc, 12, 31, 21, -2.0, -0.9, R, { leafLen: 4.8, step: 2 });
  // smouldering tips
  for (const [x, y] of [[25, 6], [26, 8], [5, 11], [22, 4]]) gl(pc, x, y, 0xff7a2a, 0.9);
  for (const [x, y] of [[24, 2], [27, 3]]) gl(pc, x, y, 0xffc070, 0.8);
}

function emberbloom(pc) {
  const LR = mat(0x4a5a2a);
  stem(pc, [[16, 31], [15, 25], [16, 19]], 1, LR);
  leaf(pc, 16, 27, 7, 23, 2, LR, { bend: 1 });
  // petals: deep red-orange cup
  const R = mat(0xe8501e, { cont: 1.15, warm: 40 });
  const cup = M();
  for (const a of [-2.6, -2.0, -1.57, -1.14, -0.54]) cup.union(leafMask(16, 20, 16 + Math.cos(a) * 9, 20 + Math.sin(a) * 9, 3, 0));
  ring(pc, cup, R);
  vol(pc, cup, R, { round: 2.5, emit: 0.5 });
  // flames licking up from the center
  const fl = M().poly([[11, 14], [13, 5], [15, 10], [17, 1], [19, 9], [21, 4], [22, 14], [16, 17]]);
  fl.each((x, y) => { const t = y / 17; gl(pc, x, y, t < 0.4 ? 0xfff2a0 : t < 0.7 ? 0xffc040 : 0xff7a20, 1); });
  fl.edge().each((x, y) => { if (!fl.get(x, y - 1)) gl(pc, x, y, 0xffe080, 1); });
  for (const [x, y] of [[8, 6], [24, 8], [20, 0]]) gl(pc, x, y, 0xffb04a, 0.9);
}

function truffle(pc) {
  const R = mat(0x5a3a2c, { cont: 1.1 });
  const m = M().ellipse(13.5, 17, 10, 9).ellipse(9, 13, 5, 5).ellipse(17, 23, 6, 4.5);
  ring(pc, m, R);
  vol(pc, m, R, { round: 5, tex: (x, y) => (vnoise(x * 0.9, y * 0.9, 3) - 0.5) * 0.45 });
  // warty bumps
  m.each((x, y) => { if (hash2(x, y, 7) < 0.12) { pc.set(x, y, R[1]); if (m.get(x + 1, y + 1)) pc.set(x + 1, y + 1, R[5]); } });
  // a cut slice showing the marbled inside
  const SL = mat(0x7a5038, { cont: 1 });
  const sl = M().ellipse(24, 21, 5.2, 6.5);
  ring(pc, sl, R);
  fill(pc, sl, SL[3]);
  sl.each((x, y) => {
    const v = Math.sin((x * 0.9 + vnoise(x * 0.5, y * 0.5, 9) * 4) * 1.4 + y * 0.6);
    if (v > 0.55) pc.set(x, y, 0xe8d8b8); else if (v > 0.3) pc.set(x, y, 0xb89878);
  });
  sl.edge().each((x, y) => pc.set(x, y, R[3]));
  sparkle(pc, 8, 11, 1, 0xffeedd, R[1]);
}

function frostbloom(pc) {
  const LR = mat(0x7aa8b8);
  stem(pc, [[16, 31], [16, 22]], 1, LR);
  leaf(pc, 16, 28, 25, 25, 2, LR, { bend: -1 });
  const R = mat(0xbdf2ff, { cont: 1.2, hs: 0.6 });
  // six pointed icy petals
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 3;
    leaf(pc, 16, 14, 16 + Math.cos(a) * 11, 14 + Math.sin(a) * 11, 2.6, R, { rib: 0xffffff, spec: 0.85 });
  }
  const c = M().disk(16, 14, 2.6);
  vol(pc, c, mat(0xe8fbff), { emit: 0.7 });
  gl(pc, 15, 13, 0xffffff);
  for (const [x, y] of [[4, 4], [28, 26], [27, 3]]) sparkle(pc, x, y, 1, 0xffffff, 0xbff6ff, 0.7);
}

function coreLotus(pc) {
  // lily pad
  const PD = mat(0x3a8a5a, { cont: 1.05 });
  const pad = M().ellipse(16, 25.5, 14, 4.5).sub(M().poly([[16, 25.5], [27, 29], [29, 26]]));
  ring(pc, pad, PD); vol(pc, pad, PD, { round: 2 });
  for (let i = 0; i < 5; i++) lineIn(pc, 16, 25.5, 16 + Math.cos(i * 1.2 + 2) * 10, 25.5 + Math.sin(i * 1.2 + 2) * 3.5, PD[2], pad);
  const R = mat(0xff8ac8, { cont: 1.15 });
  const back = mat(0xe0609a, { cont: 1.1 });
  // back petals, side petals, front petals
  for (const [a, l, w, Rr] of [[-2.2, 13, 3.6, back], [-0.94, 13, 3.6, back], [-1.57, 14, 3.8, back], [-2.75, 11, 3.2, R], [-0.4, 11, 3.2, R], [-2.0, 9, 3.4, R], [-1.14, 9, 3.4, R]]) {
    leaf(pc, 16, 21, 16 + Math.cos(a) * l, 21 + Math.sin(a) * l, w, Rr, { rib: Rr[1] });
  }
  // glowing golden heart
  const h = M().ellipse(16, 18, 3.4, 2.6);
  vol(pc, h, mat(0xffd84a, { cont: 1 }), { emit: 1 });
  for (const [x, y] of [[15, 17], [17, 17], [16, 16]]) gl(pc, x, y, 0xfff8c0);
  for (const [x, y] of [[6, 6], [26, 5], [16, 2]]) sparkle(pc, x, y, 1, 0xffffff, 0xffc8e8, 0.8);
}

// ---------------------------------------------------------------- dispatcher
const PLANTS = {
  carrot: (pc) => carrot(pc), glowcap, fern: blindfern, whisper: whisperweed, sap: rubberSap, pepper: (pc) => carrot(pc, false, true),
  sparkmoss, bubble: bubblebulb, lily: crystalLily, gloom: gloomshroom, ashfern, ember: emberbloom, truffle,
  frost: frostbloom, lotus: coreLotus,
};

export function drawFlora(pc, spec) {
  if (spec.k !== 'plant') return false;
  const f = PLANTS[spec.t];
  if (!f) return false;
  f(pc);
  return true;
}
