// 32×32 crystal icons: clusters of faceted prisms growing from a host-rock base (quartz,
// lumite, echo, bioxide, magmaite, frostite, voidstone), halite cubes, the floating gravium
// bipyramid and the amethyst geode. Built on the facet renderer in facets.js.
import { makeRng } from '../../core/util.js';
import { hash2, bayer } from './shade.js';
import { Scene, material, rampOf, stoneTex, glint, prismUV, xf, ypr } from './facets.js';
import { ROCK, rockMat, hostRock, recolor, inPoly } from './oreIcons.js';

/** Translucent crystal material: darker toward the root, lighter toward the tip, faint inner streaks. */
function crystalMat(R, o = {}) {
  return material(R, {
    eq: 0.55, grad: 0.05, gap: 1.4, ridgeAll: true,
    tex: (c) => {
      const [u, v] = prismUV(c);
      let t = 0;
      if (u < 0.22) t += (0.22 - u) * (o.root ?? 5);
      if (u > 0.78) t -= 0.35;
      if (o.streak !== false && Math.abs(v + 0.15) < 0.16 && u > 0.18 && u < 0.85) t -= 0.9;
      return t;
    },
    ...o,
  });
}

/**
 * A druse: n crystals rooted over an elliptical patch (world rx × rz around the screen point
 * (cx, cy)), each pointing away from the patch centre and up, tallest near `peak`.
 * o: n, rx, rz, len [min, max], rk (radius per length), lean (world x tilt), spread, slim, tip, seed,
 *    sides, peak [u, w] (-1..1), p (view pitch).
 */
export function druse(sc, m, o) {
  const rng = makeRng(o.seed ?? 1);
  const p = o.p ?? 0.62, cp = Math.cos(p), sp = Math.sin(p);
  const toScr = ([X, Y, Z]) => [X, -(Y * cp - Z * sp), Y * sp + Z * cp];
  const n = o.n ?? 6, [lmin, lmax] = o.len || [6, 20];
  const pk = o.peak || [0, 0];
  const roots = [];
  for (let i = 0; i < n; i++) {
    // golden-angle disc sampling, jittered: even but not regular
    const t = (i + 0.5) / n, a = i * 2.39996 + rng.range(-0.5, 0.5), r = Math.sqrt(t) * rng.range(0.75, 1.05);
    roots.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const out = [];
  roots.forEach(([u, w], i) => {
    const dpk = Math.hypot(u - pk[0], w - pk[1]);
    const len = Math.max(lmin, lmax * (1 - 0.5 * dpk) * rng.range(0.72, 1.08) * (i === 0 ? 1.05 : 1));
    const spread = o.spread ?? 0.65;
    let dx = u * spread + (o.lean ?? 0) + rng.range(-0.15, 0.15), dz = w * spread * 0.8 + 0.15 + rng.range(-0.1, 0.1);
    const pd = o.pd ?? 0.22;
    const d = [dx, -Math.cos(pd) + dz * Math.sin(pd), Math.sin(pd) + dz * Math.cos(pd)];
    const root = toScr([u * o.rx, 0, w * (o.rz ?? o.rx * 0.6)]);
    const r = Math.max(1.2, (o.rk ?? 0.17) * len * (o.slim ? 0.75 : 1) * rng.range(0.85, 1.15));
    const tipL = r * (o.tip ?? 1.5) * rng.range(0.8, 1.25);
    out.push({ b: [o.cx + root[0], o.cy + root[1], root[2] - (o.sink ?? 1.2) + (o.z ?? 0)], d, len, r, tip: tipL, tw: rng.range(0, 1), sk: o.skew ? [rng.range(-o.skew, o.skew), rng.range(-o.skew, o.skew) * 0.5] : undefined });
  });
  return out.map((s) => sc.prism(m, { b: s.b, d: s.d, len: s.len, r: s.r, tip: s.tip, sides: o.sides ?? 6, twist: s.tw, skew: s.sk }));
}

/** Glints near the tips of the tallest crystals (screen-highest apexes). */
function tipGlints(pc, sc, xs, R, n = 2, emit = 0) {
  const tips = xs.map((ob) => { const f = ob.o.frame; return [f.b[0] + f.d[0] * f.len, f.b[1] + f.d[1] * f.len, ob]; }).sort((a, b) => a[1] - b[1]);
  tips.slice(0, n).forEach(([x, y, ob], i) => {
    for (let k = 2; k < 6; k++) {
      const X = Math.round(x - 0.5 - ob.o.frame.d[0] * k), Y = Math.round(y - 0.5 - ob.o.frame.d[1] * k);
      if (sc.objAt(X, Y) === ob.id) { glint(pc, X, Y, i === 0 ? 2 : 1, 0xffffff, R[1], emit); break; }
    }
  });
}

/** Low host-rock base for a cluster. */
function base(sc, R, seed, o = {}) {
  return hostRock(sc, rockMat(R, seed, { amp: 0.4 }), seed, [
    { x: 16, y: o.y ?? 25.5, a: o.a ?? 11.5, c: o.c ?? 6, h: o.h ?? 6.5, yaw: o.yaw ?? 0.3, n: [6, 5, 5] },
    ...(o.extra || []),
  ]);
}

/** Frost / rime: dither pale pixels over the lower parts of the given objects. */
function rime(pc, sc, objs, y0, cols, seed = 3) {
  const ids = new Set(objs.map((q) => q.id));
  for (let y = y0; y < sc.h; y++) for (let x = 0; x < sc.w; x++) {
    const i = y * sc.w + x;
    if (!ids.has(sc.ob[i]) || sc.k[i] < 0 || sc.k[i] > 6) continue;
    if (hash2(x, y, seed) < 0.18 + (y - y0) * 0.05 && bayer(x, y) < 0.7) pc.set(x, y, cols[sc.k[i] < 3 ? 0 : 1]);
  }
}

/** Jagged lightning bolt: bright 1px core + coloured fringe on its right. */
function bolt(pc, pts, core, fringe) {
  const seg = (x0, y0, x1, y1, c, dx) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0 || 1;
    for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n) + dx, y = Math.round(y0 + (y1 - y0) * i / n); if (x >= 0 && y >= 0 && x < 32 && y < 32) { pc.set(x, y, c); pc.emit(x, y, 1); } }
  };
  for (let i = 0; i + 1 < pts.length; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], fringe, 1);
  for (let i = 0; i + 1 < pts.length; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], core, 0);
}

// crystal ramps (0 = glint)
const CR = {
  quartz: () => rampOf([0xffffff, 0xf6f8ff, 0xdfe5f5, 0xbcc4de, 0x939bc0, 0x6a6f98, 0x2e3052]),
  lumite: () => rampOf([0xf4fff0, 0xc6ffc4, 0x82f08e, 0x46c66c, 0x2a9058, 0x1a5e44, 0x0a2a22]),
  echo: () => rampOf([0xffffff, 0xe2f2ff, 0xa8d6ff, 0x72a8f0, 0x4c78d0, 0x3450a0, 0x161e50]),
  gravium: () => rampOf([0xffffff, 0xf0e2ff, 0xd2b2ff, 0xae84f2, 0x8458d0, 0x5a38a0, 0x26164e]),
  bioxide: () => rampOf([0xf6ffff, 0xc6fbff, 0x7deaff, 0x3ec2e6, 0x2690bc, 0x1a5e88, 0x0a2840]),
  magma: () => rampOf([0x8a7a86, 0x5a4c5a, 0x3e3240, 0x2e2430, 0x221a24, 0x170f18, 0x08040a]),
  frost: () => rampOf([0xffffff, 0xf0fdff, 0xc8f2ff, 0x96d8f2, 0x68aed6, 0x4680aa, 0x1c3a5e]),
  void: () => rampOf([0xeedcff, 0xb48ef0, 0x7a50c0, 0x4c2c86, 0x321a5c, 0x200e3e, 0x0c0418]),
  amethyst: () => rampOf([0xfff0ff, 0xeac6ff, 0xc890f4, 0xa060dc, 0x7a3eb4, 0x52267e, 0x220c3a]),
  salt: () => rampOf([0xffffff, 0xfff0f0, 0xfad2d4, 0xeeaab4, 0xcc8296, 0x94587a, 0x42243c]),
};

// ---------------------------------------------------------------- icons
function quartz(pc) {
  const sc = new Scene(32);
  base(sc, ROCK.grey(), 61, { y: 25.5, a: 12.5 });
  const QR = CR.quartz();
  const xs = druse(sc, crystalMat(QR), { cx: 16, cy: 24, rx: 8.5, rz: 4, n: 7, len: [6, 22], seed: 2, lean: 0.12, peak: [-0.3, 0.2] });
  sc.render(pc);
  tipGlints(pc, sc, xs, QR, 2);
}

function salt(pc) {
  const sc = new Scene(32);
  const SR = CR.salt();
  const m = material(SR, { eq: 0.6, ridgeAll: true, gap: 1.2, tex: (c) => (hash2(c.x, c.y, 4) < 0.08 ? -1 : 0) });
  const tilt = { rx: -0.62 };
  sc.box(m, [15.5, 15.5, 0], 6.2, 6.2, 6.2, { ...tilt, ry: 0.62 });
  sc.box(m, [7.5, 22.5, 4], 4, 4, 4, { ...tilt, ry: -0.35 });
  sc.box(m, [24, 22.5, 4], 3.6, 3.6, 3.6, { ...tilt, ry: 0.15 });
  sc.box(m, [20, 26.5, 6], 2.2, 2.2, 2.2, { ...tilt, ry: 0.9 });
  sc.render(pc);
  // hopper steps: a smaller lighter square inset on each lit face
  for (const ob of sc.objs) for (const f of ob.faces) {
    const cx = f.pts.reduce((s, p) => s + p[0], 0) / 4, cy = f.pts.reduce((s, p) => s + p[1], 0) / 4;
    const inner = f.pts.map((p) => [cx + (p[0] - cx) * 0.45, cy + (p[1] - cy) * 0.45]);
    const lit = f.n[1] < -0.3;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (sc.fb[y * 32 + x] !== f.id) continue;
      if (!inPoly(inner, x + 0.5, y + 0.5)) continue;
      const k = sc.k[y * 32 + x];
      if (k > 0 && k < 7) pc.set(x, y, SR[Math.max(1, k - (lit ? 1 : 0) + (lit ? 0 : 1))]);
    }
  }
  glint(pc, 12, 9, 2, 0xffffff, SR[1]);
  glint(pc, 6, 18, 1, 0xffffff, SR[1]);
}

function lumite(pc) {
  const sc = new Scene(32);
  const rock = base(sc, ROCK.char(), 62, { y: 26, a: 11 });
  const LR = CR.lumite();
  const m = crystalMat(LR, { glow: (c) => (c.k <= 2 ? 1 : 0.75), root: 3 });
  const xs = druse(sc, m, { cx: 16, cy: 24.5, rx: 7.5, rz: 3.5, n: 6, len: [6, 23], seed: 6, rk: 0.19, peak: [0, 0] });
  sc.render(pc);
  // light spill on the rock under the crystals
  recolor(pc, sc, rock, (x, y, k) => y < 27 && k >= 2 && hash2(x, y, 5) < 0.55, rampOf([LR[2], LR[3], LR[3], LR[4], LR[5], LR[5], LR[6]]));
  tipGlints(pc, sc, xs, LR, 2, 1);
}

function echo(pc) {
  const sc = new Scene(32);
  base(sc, ROCK.slate(), 63, { a: 10, y: 26 });
  const ER = CR.echo();
  const m = crystalMat(ER, { root: 4 });
  const xs = druse(sc, m, { cx: 16, cy: 24.5, rx: 6, rz: 3, n: 6, len: [7, 23], seed: 4, rk: 0.11, tip: 2.4, lean: -0.05, spread: 0.45, peak: [0.2, 0] });
  sc.render(pc);
  // resonance: ")))" arcs either side, fading outward
  const arcs = (cx, cy, side) => {
    for (let i = 0; i < 3; i++) {
      const r = 3.2 + i * 2.4;
      const c = [0xeaf6ff, 0xa8d0ff, 0x6a90d8][i];
      for (let a = -0.8 + i * 0.08; a <= 0.8 - i * 0.08; a += 0.05) {
        const x = Math.round(cx + side * Math.cos(a) * r - 0.5), y = Math.round(cy + Math.sin(a) * r - 0.5);
        if (pc.alpha(x, y)) continue;
        pc.set(x, y, c); pc.emit(x, y, 0.6 - i * 0.15);
      }
    }
  };
  arcs(8.5, 11, -1);
  arcs(23.5, 11, 1);
  tipGlints(pc, sc, xs, ER, 1);
}

function gravium(pc) {
  const GR = CR.gravium();
  // ground shadow (soft, dithered)
  for (let y = 26; y < 31; y++) for (let x = 6; x < 27; x++) {
    const d = ((x + 0.5 - 16) / 9.5) ** 2 + ((y + 0.5 - 28.5) / 2) ** 2;
    if (d < 1 && (d < 0.45 || bayer(x, y) < 0.5)) pc.set(x, y, 0x2a1a40, d < 0.45 ? 130 : 80);
  }
  const sc = new Scene(32);
  const m = material(GR, { eq: 0.65, ridgeAll: true, grad: 0.05, glow: 0.35 });
  // hexagonal bipyramid
  const ring = [], n = 6;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push([Math.cos(a) * 7, 0, Math.sin(a) * 7]); }
  const top = [0, -12.5, 0], bot = [0, 9.5, 0];
  const polys = [];
  for (let i = 0; i < n; i++) { polys.push([ring[i], ring[(i + 1) % n], top]); polys.push([ring[(i + 1) % n], ring[i], bot]); }
  const rot = (P) => ypr(P, 0.5, 0.22, 0.14, [16, 14.5, 0]);
  sc.add(m, polys.map(rot));
  // drifting chips
  const chip = (cx, cy, s, a) => {
    const P = [[0, -s * 1.6, 0], [s, 0, 0], [0, s * 1.2, 0], [-s, 0, 0], [0, 0, s * 0.9], [0, 0, -s * 0.9]];
    const F = [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [1, 0, 5], [2, 1, 5], [3, 2, 5], [0, 3, 5]];
    const Q = xf(P, { rz: a, rx: -0.3, t: [cx, cy, 2] });
    sc.add(m, F.map((f) => f.map((i) => Q[i])));
  };
  chip(5.5, 8, 1.8, -0.4);
  chip(26.5, 6, 1.5, 0.5);
  chip(25, 19, 1.2, 0.2);
  sc.render(pc);
  // upward drift streaks
  for (const [x, y, l] of [[4, 18, 3], [28, 13, 2], [8, 25, 2], [23, 2, 2]]) for (let i = 0; i < l; i++) { pc.set(x, y + i, GR[1 + i], 220 - i * 60); pc.emit(x, y + i, 0.5); }
  glint(pc, 13, 6, 2, 0xffffff, GR[1], 1);
}

function bioxide(pc) {
  const sc = new Scene(32);
  base(sc, ROCK.slate(), 64, { y: 26 });
  const BR = CR.bioxide();
  const m = crystalMat(BR, { glow: (c) => (c.k <= 2 ? 1 : 0.7), root: 3 });
  const xs = druse(sc, m, { cx: 16, cy: 24.5, rx: 8, rz: 4, n: 6, len: [6, 21], seed: 9, tip: 2.6, skew: 0.7, peak: [0.2, 0.2] });
  sc.render(pc);
  bolt(pc, [[3, 4], [6, 7], [4, 9], [7, 13]], 0xffffff, 0xfff27a);
  bolt(pc, [[28, 2], [25, 6], [28, 8], [25, 12]], 0xffffff, 0xfff27a);
  tipGlints(pc, sc, xs, BR, 1, 1);
}

function magmaite(pc) {
  const sc = new Scene(32);
  const rock = base(sc, ROCK.char(), 65, { y: 26, a: 12 });
  const MR = CR.magma();
  const m = crystalMat(MR, { streak: false, root: 2, eq: 0.6 });
  const xs = druse(sc, m, { cx: 16, cy: 24.5, rx: 8, rz: 3.5, n: 7, len: [7, 22], seed: 11, rk: 0.17, tip: 1.7, peak: [0, 0] });
  sc.render(pc);
  // molten cracks: wandering glowing seams up each crystal, hottest near the root
  const lava = [0xfff6c0, 0xffd04a, 0xff8a2a, 0xd8481a];
  const rng = makeRng(66);
  for (const ob of xs) {
    const fr = ob.o.frame;
    let v = rng.range(-0.3, 0.3);
    for (let u = 0.05; u < 0.9; u += 0.035) {
      v += rng.range(-0.18, 0.18);
      v = Math.max(-0.6, Math.min(0.6, v));
      const x = Math.floor(fr.b[0] + fr.d[0] * u * fr.len + fr.e1[0] * v * fr.r), y = Math.floor(fr.b[1] + fr.d[1] * u * fr.len + fr.e1[1] * v * fr.r);
      if (sc.objAt(x, y) !== ob.id) continue;
      const k = Math.min(3, Math.floor(u * 4.2));
      pc.set(x, y, lava[k]); pc.emit(x, y, 1);
    }
  }
  // glowing seam in the rock and embers
  recolor(pc, sc, rock, (x, y) => Math.abs(y - 26 - Math.sin(x * 0.55) * 1.3) < 0.6, rampOf([0xfff6c0, 0xffd04a, 0xff9a3a, 0xe0602a, 0xa83a1a, 0x6a2010, 0x2a0a06]));
  for (const [x, y] of [[5, 8], [27, 10], [22, 3], [9, 4]]) { pc.set(x, y, 0xffb04a); pc.emit(x, y, 1); }
}

function frostite(pc) {
  const sc = new Scene(32);
  const rock = base(sc, ROCK.blue(), 67, { y: 26 });
  const FR = CR.frost();
  const m = crystalMat(FR, { glow: 0.35, root: 3 });
  const xs = druse(sc, m, { cx: 16, cy: 24.5, rx: 8, rz: 4, n: 7, len: [6, 22], seed: 11, rk: 0.15, tip: 1.8, peak: [0.1, 0] });
  sc.render(pc);
  rime(pc, sc, [...rock, ...xs], 21, [0xffffff, 0xd8f4ff], 7);
  const flake = (x, y, c = 0xffffff, c2 = 0xbff0ff) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { pc.set(x + dx, y + dy, c2); pc.set(x + dx * 2, y + dy * 2, c); pc.emit(x + dx, y + dy, 0.7); pc.emit(x + dx * 2, y + dy * 2, 0.7); }
    for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) { pc.set(x + dx * 2, y + dy * 2, c2); pc.emit(x + dx * 2, y + dy * 2, 0.7); }
    pc.set(x, y, c); pc.emit(x, y, 0.8);
  };
  flake(4, 7);
  flake(27, 5);
  tipGlints(pc, sc, xs, FR, 1, 1);
}

function voidstone(pc) {
  const sc = new Scene(32);
  base(sc, ROCK.char(), 68, { y: 26 });
  const VR = CR.void();
  const m = crystalMat(VR, { root: 2, eq: 0.6 });
  const xs = druse(sc, m, { cx: 16, cy: 24.5, rx: 7.5, rz: 3.5, n: 5, len: [7, 21], seed: 3, rk: 0.2, tip: 1.4, peak: [0, 0] });
  sc.render(pc);
  // light-drinking aura: dark violet fringe round the silhouette, motes being pulled in
  const has = (x, y) => pc.alpha(x, y) > 200;
  const add = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (has(x, y)) continue;
    let near = 99;
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (has(x + i, y + j)) near = Math.min(near, Math.hypot(i, j));
    if (near <= 1.5 && y < 25) add.push([x, y, 0x1a0a2e, 200]);
    else if (near <= 2.3 && y < 24 && bayer(x, y) < 0.5) add.push([x, y, 0x24103c, 120]);
  }
  for (const [x, y, c, a] of add) pc.set(x, y, c, a);
  for (const [x, y, dx, dy] of [[4, 8, 1, 1], [27, 6, -1, 1], [3, 18, 1, 0], [28, 17, -1, 0]]) { pc.set(x, y, 0xc8a0ff); pc.set(x - dx, y - dy, 0x6a3ab0, 200); }
  tipGlints(pc, sc, xs, VR, 1);
}

function amethyst(pc) {
  const sc = new Scene(32);
  // geode: a rounded shell cut flat; the cut faces up toward the viewer
  const RI = ROCK.grey();
  const shell = material(RI, { tex: stoneTex(70, { amp: 0.4 }) });
  const rng = makeRng(71);
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, r = 1 - rng.range(0, 0.12);
    pts.push([Math.cos(a) * 14 * r, Math.sin(a) * 12.5 * r, 0]); // cut rim
    if (i % 2 === 0) { const r2 = 1 - rng.range(0, 0.15); pts.push([Math.cos(a) * 12 * r2, Math.sin(a) * 10.5 * r2, -7.5 * r2]); }
  }
  pts.push([0, 0, -13], [5, 3, -11.5], [-5, 2, -11.5], [0, 6, -10]);
  const P = xf(pts, { rx: 0.95, t: [16, 12.5, 0] });
  const geo = sc.hull(shell, P);
  sc.render(pc);
  // the cut face: the face whose normal is closest to the cut plane normal
  const cutN = xf([[0, 0, 1]], { rx: 0.95 })[0];
  let cut = null, best = -1;
  for (const f of geo.faces) { const d = f.n[0] * cutN[0] + f.n[1] * cutN[1] + f.n[2] * cutN[2]; if (d > best) { best = d; cut = f; } }
  const inCut = (x, y) => sc.pidAt(x, y) === cut.pid;
  // distance from the rim inside the cut face (chamfer)
  const D = new Float32Array(1024).fill(99);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!inCut(x, y)) continue;
    let d = 99;
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) if (!inCut(x + i, y + j)) d = Math.min(d, Math.hypot(i, j * 1.25));
    D[y * 32 + x] = d;
  }
  const AR = CR.amethyst();
  const rind = [0xf4f0f8, 0xc9c2d6, 0xe8e2ee, 0x9d94b4];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = D[y * 32 + x];
    if (d > 90) continue;
    if (d < 1.1) pc.set(x, y, x + y < 28 ? rind[0] : rind[3]);
    else if (d < 1.8) pc.set(x, y, rind[1]);
    else if (d < 2.4) pc.set(x, y, rind[2]);
    else pc.set(x, y, AR[6]);
  }
  // crystal lining: a ring of jittered sawtooth points round a dark hollow
  const cav = (x, y) => D[y * 32 + x] >= 2.4 && D[y * 32 + x] < 90;
  let cx = 0, cy = 0, n = 0, dmax = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (cav(x, y)) { cx += x + 0.5; cy += y + 0.5; n++; dmax = Math.max(dmax, D[y * 32 + x]); }
  cx /= n; cy /= n;
  const NT = 13;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (!cav(x, y)) continue;
    const th = Math.atan2(y + 0.5 - cy, (x + 0.5 - cx) * 0.8) + Math.PI;
    const f = (th / (Math.PI * 2)) * NT, ti = Math.floor(f), ph = f - ti;
    const depth = (dmax - 2.4) * (0.6 + hash2(ti, 3, 7) * 0.45);
    const rho = D[y * 32 + x] - 2.4; // 0 at the rind
    const tri = 1 - Math.abs(ph * 2 - 1);
    if (rho < depth * tri + 0.6) {
      // which flank faces the light: the tooth's flanks turn round the ring
      const tang = th + (ph < 0.5 ? -Math.PI / 2 : Math.PI / 2);
      const lit = Math.cos(tang) * -0.55 + Math.sin(tang) * -0.8 > 0;
      const tipward = rho > depth * tri * 0.55;
      pc.set(x, y, AR[lit ? (tipward ? 1 : 2) : (tipward ? 3 : 4)]);
    } else pc.set(x, y, rho > depth + 0.8 ? 0x12061e : AR[5]);
  }
  glint(pc, Math.round(cx) - 3, Math.round(cy) - 2, 1, 0xffffff, AR[1]);
  glint(pc, Math.round(cx) + 3, Math.round(cy) + 2, 0, 0xffffff, AR[1]);
}

const DRAW = { quartz, salt_crystal: salt, lumite, echo_crystal: echo, gravium, bioxide, magmaite, frostite, voidstone, amethyst };

/** Draw a crystal icon by item id; false if unknown. */
export function drawCrystal(pc, id) {
  const f = DRAW[id];
  if (!f) return false;
  f(pc);
  return true;
}

