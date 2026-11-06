// 32×32 ingot icons: every metal gets its own cast, built on the facet renderer: a rough
// sand-cast copper bar with a pour lip, a soft tin pig, a notched bronze trapezoid, a
// hammered iron bloom, a crisp folded steel bar, a small polished silver bar, a heavy
// stamped gold bar, a slim mithril leaf, a moonsilver crescent, an adamant wedge and a
// fused starmetal lump.
import { makeRng } from '../../core/util.js';
import { hash2, vnoise } from './shade.js';
import { Scene, material, rampOf, glint, view, slabPts, stonePts, stoneTex, gemTone } from './facets.js';

const RAMPS = {
  copper: [0xfff0dc, 0xffc496, 0xf08e56, 0xc8622e, 0x8e3e22, 0x5e2418, 0x2a0e0c],
  tin: [0xffffff, 0xe6e9ea, 0xc6cbcd, 0xa0a6aa, 0x787e86, 0x545866, 0x262834],
  bronze: [0xfff6d8, 0xf6d28e, 0xd8a452, 0xb07a34, 0x7e5224, 0x52341c, 0x24140c],
  iron: [0xd8dade, 0xa4a8b0, 0x7e838c, 0x5e636c, 0x454852, 0x30323c, 0x14161e],
  steel: [0xffffff, 0xe0eaf4, 0xaebdcc, 0x8293a6, 0x5c6a80, 0x3c4660, 0x1a1e32],
  silver: [0xffffff, 0xf4f6fa, 0xd6dce6, 0xaab3c2, 0x7e879a, 0x585e74, 0x262a3c],
  gold: [0xfffbe0, 0xffe88a, 0xf8c43c, 0xdc941c, 0xa8641a, 0x703e14, 0x34180a],
  mithril: [0xf4ffff, 0xc8f6f6, 0x96e0e6, 0x66b8c8, 0x4488a2, 0x2c5c7a, 0x122a42],
  moon: [0xffffff, 0xf0f0ff, 0xd6d6f4, 0xb0aee2, 0x8884c2, 0x5e5a98, 0x2a2652],
  adamant: [0xeafff4, 0xa2f2ca, 0x56d8a0, 0x2cae7c, 0x1a805c, 0x105444, 0x062620],
  star: [0xfffbe8, 0xfff0a8, 0xf8d066, 0xd8a03a, 0xa8702a, 0x6e4420, 0x30180c],
};

/** Octagonal ring (cut corners) at height y: half sizes a × c, corner cut k. */
const oct = (a, c, k, y) => [[-a + k, y, -c], [a - k, y, -c], [a, y, -c + k], [a, y, c - k], [a - k, y, c], [-a + k, y, c], [-a, y, c - k], [-a, y, -c + k]];
const yawPts = (pts, yaw) => { const cy = Math.cos(yaw), sy = Math.sin(yaw); return pts.map(([x, y, z]) => [x * cy - z * sy, y, x * sy + z * cy]); };

/** A cast bar: bottom ring, bevel ring just under the top, top plateau. */
function bar(o) {
  const { a, c, h } = o, t = o.top ?? 0.84, k = o.chamfer ?? 0.9, bv = o.bevel ?? 0.82;
  return [...oct(a, c, k, 0), ...oct(a * (1 - (1 - t) * 0.5), c * (1 - (1 - t) * 0.9), k, h * bv), ...oct(a * t, c * (t - 0.18), k * 0.9, h)];
}
/** Place world points on screen: yaw, centre, pitch; y re-centred on the bar's middle. */
const place = (pts, o) => view(yawPts(pts.map(([x, y, z]) => [x, y - (o.h ?? 6) / 2, z]), o.yaw ?? -0.38), o.x ?? 16, o.y ?? 17, o.p ?? 0.78);

const metal = (R, o = {}) => material(R, { eq: 0.6, q: [0.12, 0.42, 0.7, 0.9], grad: 0.08, ridgeAll: true, ...o });

/** The pixels of the top-most plane of an object (by normal), with their bounds. */
function topPlane(sc, ob) {
  let top = null, best = -2;
  for (const f of ob.faces) if (-f.n[1] > best) { best = -f.n[1]; top = f; }
  const inT = (x, y) => sc.pidAt(x, y) === top.pid;
  let x0 = 99, x1 = -1, y0 = 99, y1 = -1;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (inT(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { inT, x0, x1, y0, y1 };
}

/** Diagonal cast sheen across a plane: a glint stripe and a softer one beside it. */
function sheen(pc, T, R, o = {}) {
  for (let y = T.y0; y <= T.y1; y++) for (let x = T.x0; x <= T.x1; x++) {
    if (!T.inT(x, y)) continue;
    const u = (x - T.x0) / Math.max(1, T.x1 - T.x0), v = (y - T.y0) / Math.max(1, T.y1 - T.y0);
    const d = u - v * 0.5 + (o.off ?? 0);
    let k = o.base ?? 2;
    if (d > 0.14 && d < 0.2) k = 0;
    else if (d > 0.08 && d < 0.3) k = 1;
    else if (o.second && d > 0.5 && d < 0.56) k = 1;
    else if (d > 0.68) k = (o.base ?? 2) + 1;
    pc.set(x, y, R[k]);
  }
}

// ---------------------------------------------------------------- the eleven casts
function copper(pc) {
  const R = rampOf(RAMPS.copper);
  const sc = new Scene(32);
  const m = metal(R, { tex: stoneTex(4, { amp: 0.3, pit: 0.1, speck: 0.03, sx: 0.8, sy: 0.8 }), eqShare: true });
  const o = { a: 10.5, c: 5.5, h: 5.5, top: 0.8, yaw: -0.25, x: 15, y: 18.5 };
  sc.hull(m, place(bar(o), o), { group: 1 });
  // the pour lip: a tongue of metal that ran over the mould's end
  const lip = [[o.a - 1.5, 0.6, -2.2], [o.a + 3.2, 0.2, -1.4], [o.a + 3.4, 0.4, 1.2], [o.a - 1.5, 0.6, 2.4], [o.a - 2, o.h * 0.95, -1.8], [o.a - 1, o.h * 0.95, 1.6], [o.a + 1.6, 2.2, 0]];
  sc.hull(m, place(lip, o), { group: 1 });
  sc.roughen(sc.objs, { amount: 0.2, scale: 0.7, seed: 3 });
  sc.render(pc);
  // pits from the sand: dark pixel, lit lower-right lip
  for (const [x, y] of [[10, 14], [14, 13], [19, 15], [8, 18], [13, 19], [21, 20], [17, 22]]) {
    if (sc.objAt(x, y) < 0 || sc.objAt(x + 1, y + 1) < 0) continue;
    pc.set(x, y, R[5]); pc.set(x + 1, y + 1, R[1]);
  }
  glint(pc, 9, 12, 1, 0xffffff, R[1]);
}

function tin(pc) {
  const R = rampOf(RAMPS.tin);
  const sc = new Scene(32);
  const m = metal(R, { eq: 0.45, grad: 0.06, ridgeAll: false, ridge: false, clean: true, tex: (c) => (vnoise(c.x * 0.5, c.y * 0.5, 7) - 0.5) * 0.6 });
  // a soft, round-shouldered pig, sagging a little to one end
  const pts = slabPts(makeRng(5), { a: 11, c: 5, h: 6, n: [8, 8, 8], jag: 0.08, rings: [[0, 0.78], [0.35, 1], [1, 0.82]], lean: [1, 0] });
  const P = view(yawPts(pts, 0.32), 15.5, 18, 0.72);
  const body = sc.hull(m, P, { smooth: { c: [15.5, 18, 0], r: [11, 4.5, 5], k: 0.3 }, group: 1 });
  // the sprue nub where the runner was knocked off, and a sag where it cooled last
  const nub = [[0, 0, -1.6], [2.6, 0.4, -1.2], [2.8, 0.3, 1.2], [0, 0, 1.6], [0, 2.6, 0], [2.2, 2, 0.2]].map(([x, y, z]) => [x + 10.3, y - 2.6, z]);
  sc.hull(m, view(yawPts(nub, 0.32), 15.5, 18, 0.72), { group: 1 });
  m.eqShare = true;
  sc.carve((x, y, oi) => oi === body.id && Math.hypot((x + 0.5 - 13) / 3, (y + 0.5 - 13.2) / 0.9) < 1);
  sc.render(pc);
  // dull bloom of oxide on the shoulders
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (sc.objAt(x, y) >= 0 && hash2(x, y, 5) < 0.06 && sc.k[y * 32 + x] < 4) pc.set(x, y, R[sc.k[y * 32 + x] + 1]);
  glint(pc, 11, 13, 0, 0xffffff, R[1]);
}

function bronze(pc) {
  const R = rampOf(RAMPS.bronze);
  const sc = new Scene(32);
  const o = { a: 10, c: 6, h: 7.5, top: 0.66, yaw: -0.45, x: 16, y: 17.5, p: 0.72, chamfer: 0.6 };
  const ob = sc.hull(metal(R), place(bar(o), o));
  // the maker's notch: a V cut into the far top edge
  const T0 = (() => { let ty = 99; for (let y = 0; y < 32; y++) for (let x = 14; x < 18; x++) if (sc.objAt(x, y) >= 0) ty = Math.min(ty, y); return ty; })();
  sc.carve((x, y) => y < T0 + 1.8 - Math.abs(x + 0.5 - 16.5) * 1.4);
  sc.render(pc);
  const T = topPlane(sc, ob);
  sheen(pc, T, R, { off: -0.05 });
  // maker's mark: three dots like a mole's paw print, sunk into the top
  const mx = Math.round((T.x0 + T.x1) / 2) + 2, my = Math.round((T.y0 + T.y1) / 2) + 1;
  for (const [dx, dy] of [[0, 0], [2, 0], [1, 1], [-1, 1], [3, 1]]) if (T.inT(mx + dx, my + dy)) { pc.set(mx + dx, my + dy, dy ? R[4] : R[3]); if (T.inT(mx + dx, my + dy + 1)) pc.set(mx + dx, my + dy + 1, R[1]); }
  glint(pc, T.x0 + 2, T.y0 + 1, 1, 0xffffff, R[1]);
}

function iron(pc) {
  const R = rampOf(RAMPS.iron);
  const sc = new Scene(32);
  const m = metal(R, { eq: 0.65, grad: 0.05, tex: stoneTex(9, { amp: 0.35, pit: 0.12, speck: 0.04, sx: 0.9, sy: 0.9 }) });
  // a hammered bloom bar: lumpy, many flat hammer faces, ragged edges
  const pts = [...oct(11.5, 5.4, 2.2, 0), ...oct(12, 5.8, 1.4, 3.2), ...oct(10.5, 4.4, 1.8, 6.4)].map(([x, y, z], i) => { const r = makeRng(100 + i); return [x + r.range(-1.1, 1.1), y + r.range(-0.8, 0.8), z + r.range(-0.8, 0.8)]; });
  sc.hull(m, view(yawPts(pts.map(([x, y, z]) => [x, y - 3.2, z]), -0.3), 15.5, 17.5, 0.74));
  sc.roughen(sc.objs, { amount: 0.26, scale: 0.65, seed: 8 });
  sc.render(pc);
  // hammer dents: a dark crescent with a lit far rim; scale flecks
  for (const [x, y] of [[11, 14], [17, 13], [21, 16], [13, 19], [8, 17]]) {
    if (sc.objAt(x, y) < 0 || sc.objAt(x + 2, y + 1) < 0) continue;
    pc.set(x, y, R[5]); pc.set(x + 1, y, R[4]); pc.set(x + 1, y + 1, R[2]); pc.set(x + 2, y + 1, R[1]);
  }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (sc.objAt(x, y) >= 0 && hash2(x, y, 33) < 0.04) pc.set(x, y, 0x6a4a3a);
  glint(pc, 10, 11, 0, 0xffffff, R[1]);
}

function steel(pc) {
  const R = rampOf(RAMPS.steel);
  const sc = new Scene(32);
  // a crisp, long, slim bar, steeply angled; sharp arrises
  const o = { a: 12.5, c: 3.8, h: 4.2, top: 0.94, yaw: -0.62, x: 16, y: 17, p: 0.8, chamfer: 0.3, bevel: 0.9 };
  const ob = sc.hull(metal(R, { eq: 0.7, q: [0.1, 0.38, 0.66, 0.88] }), place(bar(o), o));
  sc.render(pc);
  // folded layers: wavy damascus lines along the long faces
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = y * 32 + x;
    if (sc.ob[i] !== ob.id) continue;
    const k = sc.k[i];
    const w = (x * 0.62 + y * 0.78 + Math.sin(x * 0.9 + y * 0.3) * 1.1) % 3.2;
    if (k >= 2 && k <= 4 && w < 0.8) pc.set(x, y, R[k + 1]);
  }
  const T = topPlane(sc, ob);
  sheen(pc, T, R, { base: 1, off: 0.05 });
  glint(pc, T.x0 + 3, T.y0 + 1, 2, 0xffffff, R[1]);
}

function silver(pc) {
  const R = rampOf(RAMPS.silver);
  const sc = new Scene(32);
  // small and bright, rounded bevels, turned the other way
  const o = { a: 8, c: 4.6, h: 4.6, top: 0.82, yaw: 0.42, x: 16, y: 19, p: 0.82, chamfer: 1.3, bevel: 0.72 };
  const ob = sc.hull(metal(R, { q: [0.1, 0.34, 0.62, 0.86], eq: 0.75 }), place(bar(o), o));
  sc.render(pc);
  const T = topPlane(sc, ob);
  sheen(pc, T, R, { base: 2, second: true, off: -0.02 });
  glint(pc, T.x0 + 2, T.y0 + 1, 2, 0xffffff, R[1]);
  glint(pc, T.x1 - 1, T.y1 + 3, 0, 0xffffff, R[1]);
}

function gold(pc) {
  const R = rampOf(RAMPS.gold);
  const sc = new Scene(32);
  // heavy: big, deep trapezoid with a stamped cartouche on the top
  const o = { a: 12, c: 7, h: 8, top: 0.74, yaw: -0.3, x: 16, y: 17, p: 0.76, chamfer: 0.8 };
  const ob = sc.hull(metal(R), place(bar(o), o));
  sc.render(pc);
  const T = topPlane(sc, ob);
  sheen(pc, T, R, { off: 0.02 });
  // the stamp: a raised border (lit top-left, dark bottom-right) round a sunk field with a sun mark
  const sx0 = T.x0 + 3, sx1 = T.x1 - 3, sy0 = T.y0 + 1, sy1 = T.y1 - 1;
  for (let y = sy0; y <= sy1; y++) for (let x = sx0; x <= sx1; x++) {
    if (!T.inT(x, y) || !T.inT(x - 1, y - 1) || !T.inT(x + 1, y + 1)) continue;
    const edge = x === sx0 || y === sy0 || x === sx1 || y === sy1;
    if (edge) pc.set(x, y, x === sx0 || y === sy0 ? R[1] : R[4]);
    else if (x === sx0 + 1 || y === sy0 + 1) pc.set(x, y, R[4]);
    else pc.set(x, y, R[3]);
  }
  const cx = Math.round((sx0 + sx1) / 2), cy = Math.round((sy0 + sy1) / 2);
  for (const [dx, dy, k] of [[0, 0, 1], [1, 0, 2], [0, 1, 2], [1, 1, 2], [-1, 0, 4], [2, 1, 4], [0, -1, 4], [1, 2, 4]]) if (T.inT(cx + dx, cy + dy)) pc.set(cx + dx, cy + dy, R[k]);
  glint(pc, T.x0 + 1, T.y0, 1, 0xffffff, R[1]);
  glint(pc, 25, 25, 0, 0xffffff, R[1]);
}

function mithril(pc) {
  const R = rampOf(RAMPS.mithril);
  const sc = new Scene(32);
  // a slim leaf ingot: pointed ends, a raised mid-rib, laid on the diagonal
  const a = 13.5, c = 4.4, h = 3.2, pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, x = (t - 0.5) * 2 * a, w = c * Math.pow(Math.sin(Math.PI * t), 0.75);
    pts.push([x, 0, w], [x, 0, -w], [x * 0.96, h * 0.55, w * 0.62], [x * 0.96, h * 0.55, -w * 0.62]);
  }
  pts.push([-a * 0.85, h, 0], [a * 0.85, h, 0]);
  const ob = sc.hull(metal(R, { eq: 0.65, glow: 0.15 }), view(yawPts(pts.map(([x, y, z]) => [x, y - h / 2, z]), 0.62), 16, 16.5, 0.85));
  sc.render(pc);
  // iridescent sheen: a pink and a mint ripple across the planes
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = y * 32 + x;
    if (sc.ob[i] !== ob.id) continue;
    const b = (x * 0.8 + y + 40) % 11, k = sc.k[i];
    if (b < 1 && k >= 1 && k <= 3) pc.set(x, y, 0xf2d8ff);
    else if (b > 5 && b < 6 && k >= 2 && k <= 4) pc.set(x, y, 0xc8fff0);
  }
  glint(pc, 11, 12, 2, 0xffffff, R[1], 0.6);
}

function moonsilver(pc) {
  const R = rampOf(RAMPS.moon);
  const sc = new Scene(32);
  const m = metal(R, { eqShare: true, glow: 0.35, eq: 0.55 });
  // a crescent ingot: thick in the middle, tapering to horns, lying on its back
  const N = 8, A0 = 0.55, A1 = 3.6, RA = 10;
  for (let i = 0; i < N; i++) {
    const a0 = A0 + (A1 - A0) * (i / N), a1 = A0 + (A1 - A0) * ((i + 1) / N);
    const tk = (s) => 0.6 + 3 * Math.sin(Math.PI * s);
    const s0 = i / N, s1 = (i + 1) / N;
    const pts = [];
    for (const [a, s] of [[a0, s0], [a1, s1]]) {
      const ox = Math.cos(a) * RA, oz = Math.sin(a) * RA, nx = Math.cos(a), nz = Math.sin(a), w = tk(s), hh = 1.2 + w * 0.6;
      pts.push([ox - nx * w, 0, oz - nz * w], [ox + nx * w, 0, oz + nz * w], [ox - nx * w * 0.6, hh, oz - nz * w * 0.6], [ox + nx * w * 0.6, hh, oz + nz * w * 0.6]);
    }
    sc.hull(m, view(yawPts(pts, -0.4), 16.5, 15, 0.95), { group: 2 });
  }
  sc.render(pc);
  glint(pc, 9, 12, 1, 0xffffff, R[1], 1);
  glint(pc, 25, 21, 0, 0xffffff, R[1], 1);
}

function adamant(pc) {
  const R = rampOf(RAMPS.adamant);
  const sc = new Scene(32);
  const m = metal(R, { eq: 0.4, grad: 0.03 });
  m.toneFn = (f, n) => gemTone(n, { phase: 0.4, waves: 2 }) + (hash2(f.pid, 1, 4) - 0.5) * 0.6;
  // a faceted wedge: a sharp keel along the top, cut facets down the flanks
  const a = 11.5, c = 6, h = 7.5;
  const pts = [[-a, 0, -c], [a, 0, -c * 0.7], [a * 0.9, 0, c], [-a * 0.95, 0, c * 0.9], [-a * 0.7, h, -0.3], [a * 0.75, h * 0.9, 0.3],
    [-a * 1.05, h * 0.45, 0], [a * 1.08, h * 0.4, 0.3], [0, h * 0.62, c * 1.05], [0.5, h * 0.6, -c * 1.02], [-a * 0.5, h * 0.55, c * 0.85], [a * 0.5, h * 0.5, c * 0.9]];
  sc.hull(m, view(yawPts(pts.map(([x, y, z]) => [x, y - h / 2, z]), -0.5), 16, 17, 0.72));
  sc.render(pc);
  glint(pc, 11, 10, 2, 0xffffff, R[1]);
}

function starmetal(pc) {
  const R = rampOf(RAMPS.star);
  const sc = new Scene(32);
  const m = metal(R, { eqShare: true, glow: 0.3, tex: stoneTex(12, { amp: 0.3, pit: 0.06, speck: 0.04 }) });
  // a fused meteor bar: two lumps run together, ragged and blistered
  const rng = makeRng(23);
  const A = stonePts(rng, 10, 7.5, 6.5, { n: 12, jag: 0.25, base: 0.7, yaw: 0.3 }).map(([x, y, z]) => [x - 4, y, z]);
  const B = stonePts(rng, 7.5, 6.5, 6, { n: 10, jag: 0.3, base: 0.7, yaw: -0.4 }).map(([x, y, z]) => [x + 7, y - 0.5, z + 1]);
  sc.hull(m, view(yawPts(A, -0.2), 15.5, 17, 0.75), { group: 1 });
  sc.hull(m, view(yawPts(B, -0.2), 15.5, 17, 0.75), { group: 1 });
  sc.roughen(sc.objs, { amount: 0.25, scale: 0.7, seed: 4 });
  sc.render(pc);
  // the seam where the lumps fused glows, and star-hot specks
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (sc.objAt(x, y) < 0) continue;
    if (Math.abs(x + 0.5 - 19 - (y - 17) * 0.35 - Math.sin(y * 1.1) * 0.6) < 0.55) { pc.set(x, y, y % 3 ? 0xffd860 : 0xfffbe0); pc.emit(x, y, 1); }
    else if (hash2(x, y, 7) < 0.02) { pc.set(x, y, 0xfffbe0); pc.emit(x, y, 1); }
  }
  glint(pc, 24, 7, 2, 0xffffff, 0xfff0a0, 1);
  glint(pc, 6, 24, 1, 0xffffff, 0xfff0a0, 1);
  glint(pc, 11, 12, 1, 0xffffff, R[1], 1);
}

const DRAW = {
  copper_ingot: copper, tin_ingot: tin, bronze_ingot: bronze, iron_ingot: iron, steel_ingot: steel, silver_ingot: silver,
  gold_ingot: gold, mithril_ingot: mithril, moonsilver_ingot: moonsilver, adamant_ingot: adamant, starmetal_ingot: starmetal,
};

/** Draw an ingot icon by item id (unknown ids: a plain cast bar in the spec colour). */
export function drawIngot(pc, id, base) {
  const f = DRAW[id];
  if (f) { f(pc); return; }
  const c = base ?? 0xa0a0a0;
  const R = rampOf([0xffffff, 0xe8e8e8, 0xc8c8c8, c, 0x707070, 0x484848, 0x202020]);
  const sc = new Scene(32);
  const o = { a: 11, c: 5.6, h: 6.5 };
  const ob = sc.hull(metal(R), place(bar(o), o));
  sc.render(pc);
  sheen(pc, topPlane(sc, ob), R);
}
