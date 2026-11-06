// Crystal icons: clusters of faceted prisms growing from a host-rock base (quartz, lumite,
// echo, bioxide, magmaite, frostite, voidstone), halite cubes, the floating gravium bipyramid
// and the amethyst geode. Built on the facet renderer in facets.js; authored on the 32-unit
// design grid and rasterised natively at S× (res.js).
import { makeRng } from '../../core/util.js';
import { hash2, bayer, vnoise } from './shade.js';
import { Scene, material, rampOf, stoneTex, glint, prismUV, xf, ypr } from './facets.js';
import { ROCK, rockMat, hostRock, recolor, inPoly, cracks, patch } from './oreIcons.js';
import { S, dc, nc, np, grain } from './res.js';

/**
 * Translucent crystal material: darker toward the root, lighter toward the tip, faint inner
 * streaks; at S > 1 also fine horizontal growth striations across the prism faces and a
 * ghostly phantom (an earlier tip) inside the bigger crystals.
 */
function crystalMat(R, o = {}) {
  return material(R, {
    eq: 0.55, grad: 0.05, gap: 1.4, ridgeAll: true,
    tex: (c) => {
      const [u, v] = prismUV(c);
      let t = 0;
      if (u < 0.22) t += (0.22 - u) * (o.root ?? 5);
      if (u > 0.78) t -= 0.35;
      if (o.streak !== false && Math.abs(v + 0.15) < (S > 1 ? 0.1 : 0.16) && u > 0.18 && u < 0.85) t -= 0.9;
      if (S > 1 && o.streak !== false && Math.abs(v + 0.4) < 0.06 && u > 0.3 && u < 0.7) t -= 0.6;
      const fr = c.obj.o.frame;
      if (S > 1 && fr && o.striae !== false) {
        const a = u * fr.len, shaft = fr.len - (fr.r * 1.4);
        if (a > 1.2 && a < shaft && ((a * 1.15 + v * 0.25) % 1.6) < 0.28) t += 0.7;
        if (fr.len > 12 && Math.abs(a - fr.len * 0.62 + Math.abs(v) * fr.r * 0.9) < 0.22) t -= 0.7; // phantom
      }
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
      if (sc.objD(X + 0.25, Y + 0.25) === ob.id) { glint(pc, X, Y, i === 0 ? 2 : 1, 0xffffff, R[1], emit); break; }
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
  for (let Y = np(y0); Y < sc.h; Y++) for (let X = 0; X < sc.w; X++) {
    const i = Y * sc.w + X;
    if (!ids.has(sc.ob[i]) || sc.k[i] < 0 || sc.k[i] > 6) continue;
    if (S > 1 ? grain(X, Y, seed, 0.28 + (dc(Y) - y0) * 0.09) : hash2(X, Y, seed) < 0.18 + (dc(Y) - y0) * 0.05 && bayer(X, Y) < 0.7) {
      pc.set(X, Y, cols[sc.k[i] < 3 ? 0 : 1]);
      // at S > 1 the frost grows in little needles: a second crystal on top of some grains
      if (S > 1 && hash2(X, Y, seed + 1) < 0.3 && Y > 0 && ids.has(sc.ob[i - sc.w])) pc.set(X, Y - 1, cols[1]);
    }
  }
}

/** Jagged lightning bolt: bright 1px core + coloured fringe on its right. */
function bolt(pc, pts, core, fringe) {
  const seg = (x0, y0, x1, y1, c, dx) => {
    const n = (Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * S) | 0 || 1;
    for (let i = 0; i <= n; i++) { const x = nc(x0 + (x1 - x0) * i / n) + dx, y = nc(y0 + (y1 - y0) * i / n); if (x >= 0 && y >= 0 && x < pc.w && y < pc.h) { pc.set(x, y, c); pc.emit(x, y, 1); } }
  };
  for (let i = 0; i + 1 < pts.length; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], fringe, 1);
  if (S > 1) for (let i = 0; i + 1 < pts.length; i++) { seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0xc8a020, 2); seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], fringe, -1); }
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
  // hopper steps: smaller inset squares on each face (two terraces at S > 1), each terrace's
  // lit rim catching the light (face points are in native pixels)
  for (const ob of sc.objs) for (const f of ob.faces) {
    const cx = f.pts.reduce((s, p) => s + p[0], 0) / 4, cy = f.pts.reduce((s, p) => s + p[1], 0) / 4;
    const lit = f.n[1] < -0.3;
    const steps = S > 1 ? [0.7, 0.45, 0.22] : [0.45];
    steps.forEach((t, si) => {
      const inner = f.pts.map((p) => [cx + (p[0] - cx) * t, cy + (p[1] - cy) * t]);
      const inn = (X, Y) => sc.fb[Y * sc.w + X] === f.id && inPoly(inner, X + 0.5, Y + 0.5);
      sc.eachPx((X, Y, x, y, i) => {
        if (!inn(X, Y)) return;
        const k = sc.k[i];
        if (k <= 0 || k >= 7) return;
        let kk = Math.max(1, k + (lit ? -1 : 1) * (si === 0 || S === 1 ? 1 : si === 1 ? 0 : 1));
        if (S > 1 && (!inn(X - 1, Y) || !inn(X, Y - 1))) kk = Math.max(1, kk - 1);
        pc.set(X, Y, SR[Math.min(5, kk)]);
      });
    });
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
  recolor(pc, sc, rock, (x, y, k) => y < 27 && k >= 2 && patch(x, y, 5, 0.55), rampOf([LR[2], LR[3], LR[3], LR[4], LR[5], LR[5], LR[6]]));
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
      for (let a = -0.8 + i * 0.08; a <= 0.8 - i * 0.08; a += 0.05 / S) {
        const x = np(cx + side * Math.cos(a) * r), y = np(cy + Math.sin(a) * r);
        if (pc.alpha(x, y)) continue;
        pc.set(x, y, c); pc.emit(x, y, 0.6 - i * 0.15);
        // at S > 1 each ring has a dimmer outer edge (and the ends thin out)
        const x2 = np(cx + side * Math.cos(a) * (r + 0.5)), y2 = np(cy + Math.sin(a) * (r + 0.5));
        if (S > 1 && Math.abs(a) < 0.62 - i * 0.08 && !pc.alpha(x2, y2)) { pc.set(x2, y2, [0x9ac8ff, 0x6a90d8, 0x4a68b0][i], 210 - i * 40); pc.emit(x2, y2, 0.4 - i * 0.1); }
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
  for (let Y = 26 * S; Y < 31 * S; Y++) for (let X = 6 * S; X < 27 * S; X++) {
    const x = dc(X), y = dc(Y);
    const d = ((x + 0.5 - 16) / 9.5) ** 2 + ((y + 0.5 - 28.5) / 2) ** 2;
    if (d < 1 && (d < 0.45 || bayer(X, Y) < 0.5)) pc.set(X, Y, 0x2a1a40, d < 0.25 ? 150 : d < 0.45 ? 120 : 80);
  }
  const sc = new Scene(32);
  const m = material(GR, { eq: 0.65, ridgeAll: true, grad: 0.05, glow: 0.35 });
  // a broken double crystal: a long uneven point with a stubby twin fused to its side
  const main = sc.prism(m, { b: [12.5, 24, 0], d: [0.32, -1, 0.2], len: 21, r: 5.2, tip: 7.5, sides: 6, twist: 0.45, jit: [1, 0.82, 1.08, 0.9, 1.04, 0.86], skew: [0.35, 0.2], under: 2.5 });
  const twin = sc.prism(m, { b: [16.5, 22, 2], d: [0.95, -0.7, 0.35], len: 10.5, r: 3.2, tip: 4, sides: 6, twist: 0.1, jit: [1, 0.9, 1.06, 0.92, 1, 0.94] });
  main.g = twin.g = 9;
  // the snapped base: a jagged break across the bottom
  sc.carve((x, y) => y + 0.5 > 22.5 + Math.sin(x * 1.7) * 1.2 + (x - 12) * 0.25);
  sc.roughen([main, twin], { amount: 0.18, scale: 0.8, seed: 5 });
  // drifting chips: small irregular shards
  const chip = (cx, cy, l, r, a, seed) => sc.hull(m, ypr([[0, -l * 0.6, 0], [r, l * 0.35, 0.4], [-r * 0.9, l * 0.4, -0.3], [r * 0.2, l * 0.1, r * 1.1]], seed, 0.2, a + Math.PI / 2, [cx, cy, 2]));
  chip(2.5, 12, 7, 2, -1.1, 0.3);
  chip(25, 9.5, 6.5, 1.8, -2.0, 0.8);
  chip(24.5, 21, 5, 1.5, -1.35, 0.5);
  sc.render(pc);
  // upward drift streaks
  for (const [x, y, l] of [[4, 18, 3], [28, 13, 2], [8, 25, 2], [23, 2, 2], ...(S > 1 ? [[5.5, 4, 2], [27, 26, 1.5]] : [])]) {
    const X = nc(x), Y = nc(y), n = Math.round(l * S);
    for (let i = 0; i < n; i++) { pc.set(X, Y + i, GR[1 + Math.floor(i / S)], Math.round(220 - (i / n) * 170)); pc.emit(X, Y + i, 0.5); }
  }
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
    let v = rng.range(-0.3, 0.3), vv = v;
    for (let u = 0.05, n = 0; u < 0.9; u += 0.035 / S, n++) {
      if (n % S === 0) { v += rng.range(-0.18, 0.18); v = Math.max(-0.6, Math.min(0.6, v)); }
      vv += (v - vv) / S;
      const x = np(fr.b[0] + fr.d[0] * u * fr.len + fr.e1[0] * vv * fr.r), y = np(fr.b[1] + fr.d[1] * u * fr.len + fr.e1[1] * vv * fr.r);
      if (sc.objAt(x, y) !== ob.id) continue;
      const k = Math.min(3, Math.floor(u * 4.2));
      pc.set(x, y, lava[k]); pc.emit(x, y, 1);
      // at S > 1 the hot seam heats the glass beside it: a dim halo pixel on its shaded side
      if (S > 1 && k < 3 && sc.objAt(x + 1, y) === ob.id && sc.k[y * sc.w + x + 1] > 2) { pc.set(x + 1, y, lava[3]); pc.emit(x + 1, y, 0.5); }
    }
  }
  // glowing seam in the rock and embers
  recolor(pc, sc, rock, (x, y) => Math.abs(y - 26 - Math.sin(x * 0.55) * 1.3) < (S > 1 ? 0.4 : 0.6), rampOf([0xfff6c0, 0xffd04a, 0xff9a3a, 0xe0602a, 0xa83a1a, 0x6a2010, 0x2a0a06]));
  if (S > 1) recolor(pc, sc, rock, (x, y, k) => { const d = Math.abs(y - 26 - Math.sin(x * 0.55) * 1.3); return d >= 0.4 && d < 0.9 && hash2(Math.floor(x * 4), Math.floor(y * 4), 2) < 0.6; }, rampOf([0xffd04a, 0xff9a3a, 0xe0602a, 0xa83a1a, 0x6a2010, 0x4a1608, 0x2a0a06]));
  for (const [x, y] of [[5, 8], [27, 10], [22, 3], [9, 4], ...(S > 1 ? [[25, 5], [6, 14]] : [])]) {
    if (S === 1) { pc.set(x, y, 0xffb04a); pc.emit(x, y, 1); continue; }
    const X = nc(x), Y = nc(y);
    pc.set(X, Y, 0xfff0a0); pc.emit(X, Y, 1); pc.set(X, Y + 1, 0xffb04a); pc.emit(X, Y + 1, 1); pc.set(X, Y + 2, 0xd8481a, 180); pc.emit(X, Y + 2, 0.6);
  }
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
    const put = (X, Y, col, g = 0.7) => { pc.set(X, Y, col); pc.emit(X, Y, g); };
    if (S === 1) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { put(x + dx, y + dy, c2); put(x + dx * 2, y + dy * 2, c); }
      for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) put(x + dx * 2, y + dy * 2, c2);
      put(x, y, c, 0.8);
      return;
    }
    // a dendrite: four long arms with side branches near their tips, short diagonal spurs
    const X = nc(x), Y = nc(y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let k = 1; k <= 4; k++) put(X + dx * k, Y + dy * k, k === 4 ? c : c2);
      for (const s of [-1, 1]) put(X + dx * 3 + dy * s, Y + dy * 3 + dx * s, c2, 0.5);
    }
    for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) { put(X + dx, Y + dy, c2, 0.5); put(X + dx * 2, Y + dy * 2, c, 0.6); }
    put(X, Y, c, 0.9);
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
  const R2 = 2 * S;
  for (let Y = 0; Y < pc.h; Y++) for (let X = 0; X < pc.w; X++) {
    if (has(X, Y)) continue;
    let near = 99;
    for (let j = -R2; j <= R2; j++) for (let i = -R2; i <= R2; i++) if (has(X + i, Y + j)) near = Math.min(near, Math.hypot(i, j) / S);
    const y = dc(Y);
    if (near <= 1.5 && y < 25) add.push([X, Y, near <= 0.8 ? 0x14061f : 0x1a0a2e, 200]);
    else if (near <= 2.3 && y < 24 && bayer(X, Y) < 0.5) add.push([X, Y, 0x24103c, 120]);
  }
  for (const [x, y, c, a] of add) pc.set(x, y, c, a);
  for (const [x, y, dx, dy] of [[4, 8, 1, 1], [27, 6, -1, 1], [3, 18, 1, 0], [28, 17, -1, 0], ...(S > 1 ? [[7, 3, 1, 1], [25, 22, -1, 0]] : [])]) {
    if (S === 1) { pc.set(x, y, 0xc8a0ff); pc.set(x - dx, y - dy, 0x6a3ab0, 200); continue; }
    // a mote being dragged in: bright head, a fading streak behind it
    const X = nc(x), Y = nc(y);
    pc.set(X, Y, 0xe8d0ff); pc.set(X - dx, Y - dy, 0xa070e0, 220); pc.set(X - 2 * dx, Y - 2 * dy, 0x6a3ab0, 170); pc.set(X - 3 * dx, Y - 3 * dy, 0x4a2480, 110);
  }
  tipGlints(pc, sc, xs, VR, 1);
}

function amethyst(pc) {
  const sc = new Scene(32);
  // geode: a rounded shell cut flat; the cut faces up toward the viewer
  const RI = ROCK.grey();
  const shell = material(RI, { tex: stoneTex(70, { amp: 0.4 }) });
  const rng = makeRng(71);
  const pts = [];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rng.range(-0.2, 0.2), r = 1 - rng.range(0, 0.16);
    pts.push([Math.cos(a) * 15 * r, Math.sin(a) * 14.4 * r, 0]); // cut rim
    if (i % 2 === 0) { const r2 = 1 - rng.range(0, 0.15); pts.push([Math.cos(a) * 13.4 * r2, Math.sin(a) * 12.4 * r2, -7.5 * r2]); }
  }
  pts.push([0, 0, -13], [5, 3, -11.5], [-5, 2, -11.5], [0, 6, -10]);
  const P = xf(pts, { rx: 0.72, t: [15.6, 13.4, 0] });
  const geo = sc.hull(shell, P);
  sc.chunk(shell, makeRng(72), { x: 26.4, y: 25.4, a: 3.4, c: 3.2, h: 3.6, n: [5, 5, 4], jag: 0.3, p: 0.7, z: -2, group: 7 });
  geo.g = 7;
  sc.roughen(sc.objs, { amount: 0.3, scale: 0.6, seed: 21, depth: 1 });
  sc.render(pc);
  // the cut face: the face whose normal is closest to the cut plane normal
  const cutN = xf([[0, 0, 1]], { rx: 0.72 })[0];
  let cut = null, best = -1;
  for (const f of geo.faces) { const d = f.n[0] * cutN[0] + f.n[1] * cutN[1] + f.n[2] * cutN[2]; if (d > best) { best = d; cut = f; } }
  const onFace = (X, Y) => sc.pidAt(X, Y) === cut.pid;
  const W = sc.w, H = sc.h, NB = 48 * S;
  let fx = 0, fy = 0, fn = 0;
  sc.eachPx((X, Y, x, y) => { if (onFace(X, Y)) { fx += x + 0.5; fy += y + 0.5; fn++; } });
  fx /= fn; fy /= fn;
  // the break is ragged: the opened face is a jagged inset of the cut plane
  const ext = new Float32Array(NB);
  const bin = (x, y) => Math.floor(((Math.atan2(y + 0.5 - fy, x + 0.5 - fx) + Math.PI) / (Math.PI * 2)) * NB) % NB;
  sc.eachPx((X, Y, x, y) => { if (onFace(X, Y)) { const b = bin(x, y); ext[b] = Math.max(ext[b], Math.hypot(x + 0.5 - fx, y + 0.5 - fy)); } });
  const jag = (b) => 0.9 + 0.07 * vnoise(b * 0.7 / S, 0, 8) + (hash2(Math.floor(b / S), 9, 3) < 0.25 ? -0.07 : 0) + (S > 1 ? (hash2(b, 4, 7) - 0.5) * 0.03 : 0);
  const inCutA = new Uint8Array(W * H);
  sc.eachPx((X, Y, x, y, i) => {
    if (!onFace(X, Y)) return;
    const b = bin(x, y);
    const e = Math.min(ext[b] || 99, ext[(b + 1) % NB] || 99, ext[(b + NB - 1) % NB] || 99);
    if (Math.hypot(x + 0.5 - fx, y + 0.5 - fy) < e * jag(b) - 0.3) inCutA[i] = 1;
  });
  const inCut = (X, Y) => X >= 0 && Y >= 0 && X < W && Y < H && inCutA[Y * W + X] === 1;
  const D = new Float32Array(W * H).fill(99); // design px in from the break
  // the nearest outside pixel is always one bordering the cut: measure to those only
  const rimPx = [];
  for (let Y = -1; Y <= H; Y++) for (let X = -1; X <= W; X++) if (!inCut(X, Y) && (inCut(X - 1, Y) || inCut(X + 1, Y) || inCut(X, Y - 1) || inCut(X, Y + 1) || inCut(X - 1, Y - 1) || inCut(X + 1, Y + 1) || inCut(X + 1, Y - 1) || inCut(X - 1, Y + 1))) rimPx.push(X, Y);
  const R6 = 6 * S;
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    if (!inCut(X, Y)) continue;
    let d2 = 1e9;
    for (let k = 0; k < rimPx.length; k += 2) {
      const i = rimPx[k] - X, j = (rimPx[k + 1] - Y) * 1.2;
      if (i > R6 || i < -R6 || j > R6 * 1.2 || j < -R6 * 1.2) continue;
      const q = i * i + j * j;
      if (q < d2) d2 = q;
    }
    D[Y * W + X] = Math.min(Math.sqrt(d2) / S, 8); // deep inside the face: still the hollow
  }
  const AR = CR.amethyst();
  // agate rind: a white chalcedony skin, a grey-blue band, then the violet root of the crystals;
  // at S > 1 the rind shows its fine concentric banding (milky / blue-grey / milky / lavender)
  const RIND = [0xf6f2fa, 0xb8b4cc, 0xd8d4e6, 0x8a84a8, 0xe8e4f2, 0x9c96b8, 0xb6a0d8];
  let cx = 0, cy = 0, n = 0;
  sc.eachPx((X, Y, x, y, i) => {
    const d = D[i];
    if (d > 90) return;
    const lit = (x + 0.5 - fx) * 0.6 + (y + 0.5 - fy) * 0.8 < 0;
    if (S === 1) {
      if (d < 1.1) pc.set(X, Y, lit ? RIND[0] : RIND[3]);
      else if (d < 1.7) pc.set(X, Y, RIND[1]);
      else if (d < 2.3) pc.set(X, Y, RIND[2]);
      else { pc.set(X, Y, AR[5]); cx += x + 0.5; cy += y + 0.5; n++; }
      return;
    }
    if (d < 0.6) pc.set(X, Y, lit ? RIND[0] : RIND[3]);
    else if (d < 1.0) pc.set(X, Y, lit ? RIND[4] : RIND[5]);
    else if (d < 1.3) pc.set(X, Y, RIND[1]);
    else if (d < 1.6) pc.set(X, Y, RIND[4]);
    else if (d < 1.95) pc.set(X, Y, RIND[2]);
    else if (d < 2.3) pc.set(X, Y, RIND[6]);
    else { pc.set(X, Y, AR[5]); cx += x + 0.5; cy += y + 0.5; n++; }
  });
  cx /= n; cy /= n;
  const hollow = (X, Y) => X >= 0 && Y >= 0 && X < W && Y < H && D[Y * W + X] >= 2.3 && D[Y * W + X] < 90;
  // the hollow itself: dark violet, deepest just below the middle
  sc.eachPx((X, Y, x, y) => {
    if (!hollow(X, Y)) return;
    const r = Math.hypot((x + 0.5 - cx) / 1.25, y + 0.5 - cy - 0.6);
    pc.set(X, Y, r < 2.2 ? 0x16081f : r < 3.6 ? AR[6] : AR[5]);
  });
  // a ring of distinct crystal points rooted in the rind, leaning in over the hollow and up at
  // the viewer: real little faceted prisms (a second scene, clipped to the hollow)
  const sc2 = new Scene(32);
  const XM = crystalMat(AR, { root: 3, streak: false, striae: false });
  const NK = S > 1 ? 15 : 11;
  for (let k = 0; k < NK; k++) {
    const th = (k / NK) * Math.PI * 2 + 0.25 + (hash2(k, 1, 5) - 0.5) * 0.3;
    const ux = Math.cos(th) * 1.3, uy = Math.sin(th);
    let r = 0.5;
    while (r < 16 && hollow(np(cx + ux * r), np(cy + uy * r))) r += 0.25;
    const bx = cx + ux * (r + 0.6), by = cy + uy * (r + 0.6);
    const len = (3.6 + hash2(k, 2, 5) * 2.2) * (S > 1 && k % 2 ? 0.8 : 1);
    sc2.prism(XM, { b: [bx, by, -1], d: [-Math.cos(th) * 0.8, -Math.sin(th) * 0.8, 0.75], len, r: (1.35 + hash2(k, 3, 5) * 0.5) * (S > 1 ? 0.85 : 1), tip: 2.2, sides: 5, twist: k * 0.7 });
  }
  for (const [x, y, l] of [[cx - 2.4, cy + 1.6, 3], [cx + 2, cy + 0.6, 2.6], [cx - 0.2, cy - 1, 2.2], ...(S > 1 ? [[cx + 0.8, cy + 2.6, 1.8], [cx - 3.2, cy - 0.6, 1.6]] : [])]) sc2.prism(XM, { b: [x, y, -4], d: [0.1, -0.35, 1], len: l, r: 1.1, tip: 1.6, sides: 5, twist: x });
  const tmp = new pc.constructor(pc.w);
  sc2.render(tmp);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) if (hollow(X, Y) && tmp.alpha(X, Y) > 0) pc.set(X, Y, tmp.getHex(X, Y));
  // the shell's outside: a few hairline cracks in the rough rind
  cracks(pc, sc, [geo], [[[3.6, 20], [5.4, 22.6], [5.2, 25]], [[27.6, 11], [26, 13.4]]]);
  glint(pc, Math.round(cx) - 5, Math.round(cy) - 3, 1, 0xffffff, AR[1]);
  glint(pc, Math.round(cx) + 4, Math.round(cy) + 2, 0, 0xffffff, AR[1]);
  if (S > 1) glint(pc, Math.round(cx) - 1, Math.round(cy) - 4, 0, 0xffffff, AR[1]);
}

const DRAW = { quartz, salt_crystal: salt, lumite, echo_crystal: echo, gravium, bioxide, magmaite, frostite, voidstone, amethyst };

/** Draw a crystal icon by item id; false if unknown. */
export function drawCrystal(pc, id) {
  const f = DRAW[id];
  if (!f) return false;
  f(pc);
  return true;
}

