// 32×32 crystal icons: clusters of faceted prisms growing from a host-rock base (quartz,
// lumite, echo, bioxide, magmaite, frostite, voidstone), halite cubes, the floating gravium
// bipyramid and the amethyst geode. Built on the facet renderer in facets.js.
import { makeRng } from '../../core/util.js';
import { mix } from './color.js';
import { hash2, vnoise, bayer } from './shade.js';
import { Scene, material, rampOf, stoneTex, glint, prismUV, xf } from './facets.js';
import { ROCK, rockMat, hostRock, recolor, specks } from './oreIcons.js';

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

/** Grow prisms from a base: each spec {x, y (screen base), dx, dy, dz (axis), len, r, tip, tw, sk}. */
function grow(sc, m, specs, o = {}) {
  return specs.map((s) => {
    const z = s.z ?? (sc.zAt(Math.floor(s.x), Math.floor(s.y)) > -1e8 ? sc.zAt(Math.floor(s.x), Math.floor(s.y)) - (s.sink ?? 1.5) : 0);
    return sc.prism(m, { b: [s.x, s.y, z], d: [s.dx, s.dy, s.dz ?? 0.35], len: s.len, r: s.r, tip: s.tip ?? s.r * 1.5, sides: s.sides ?? 6, twist: s.tw ?? 0.35, skew: s.sk, taper: s.taper, squash: s.sq, ...o });
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
  base(sc, ROCK.grey(), 61);
  const QR = CR.quartz();
  const q = crystalMat(QR);
  grow(sc, q, [
    { x: 19.5, y: 23, dx: 0.42, dy: -1, dz: 0.2, len: 15, r: 2.6, tw: 0.9 },
    { x: 10.5, y: 24, dx: -0.55, dy: -1, dz: 0.3, len: 12, r: 2.4, tw: 0.2 },
    { x: 15, y: 25, dx: -0.06, dy: -1, dz: 0.42, len: 21, r: 3.3, tw: 0.55 },
    { x: 22.5, y: 25.5, dx: 1, dy: -0.75, dz: 0.5, len: 8, r: 1.9, tw: 0.1 },
    { x: 8, y: 26, dx: -1, dy: -0.55, dz: 0.55, len: 6, r: 1.6, tw: 0.8 },
  ]);
  sc.render(pc);
  glint(pc, 14, 6, 2, 0xffffff, QR[1]);
  glint(pc, 23, 11, 1, 0xffffff, QR[1]);
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
    const k0 = sc.k[f.pts.reduce((s, p) => s, 0)];
    void k0;
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

function inPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  }
  return c;
}

function lumite(pc) {
  const sc = new Scene(32);
  base(sc, ROCK.char(), 62, { y: 26 });
  const LR = CR.lumite();
  const m = crystalMat(LR, { glow: (c) => (c.k <= 2 ? 1 : 0.75), root: 3 });
  grow(sc, m, [
    { x: 10.5, y: 24.5, dx: -0.6, dy: -1, dz: 0.3, len: 13, r: 2.6, tw: 0.3 },
    { x: 21, y: 24, dx: 0.55, dy: -1, dz: 0.25, len: 14, r: 2.6, tw: 0.8 },
    { x: 15.5, y: 25.5, dx: 0.02, dy: -1, dz: 0.4, len: 22, r: 3.6, tw: 0.5 },
    { x: 24.5, y: 26.5, dx: 1, dy: -0.6, dz: 0.5, len: 6, r: 1.6, tw: 0.2 },
  ]);
  sc.render(pc);
  // light spill on the rock under the crystals
  recolor(pc, sc, sc.objs.filter((o) => o.m !== m), (x, y, k) => y < 26 && k >= 2 && hash2(x, y, 5) < 0.6, rampOf([LR[2], LR[3], LR[3], LR[4], LR[5], LR[5], LR[6]]));
  glint(pc, 15, 4, 2, 0xffffff, LR[1], 1);
  glint(pc, 7, 12, 1, 0xffffff, LR[1], 1);
}

function echo(pc) {
  const sc = new Scene(32);
  base(sc, ROCK.slate(), 63, { a: 9.5, y: 26 });
  const ER = CR.echo();
  const m = crystalMat(ER, { root: 4 });
  grow(sc, m, [
    { x: 12.5, y: 25, dx: -0.28, dy: -1, dz: 0.3, len: 17, r: 1.9, tip: 4, tw: 0.3 },
    { x: 19, y: 25, dx: 0.3, dy: -1, dz: 0.3, len: 16, r: 1.8, tip: 4, tw: 0.7 },
    { x: 15.5, y: 26, dx: 0, dy: -1, dz: 0.38, len: 23, r: 2.4, tip: 5, tw: 0.5 },
    { x: 22, y: 26, dx: 0.8, dy: -1, dz: 0.4, len: 7, r: 1.3, tip: 2.5, tw: 0.2 },
  ]);
  sc.render(pc);
  // resonance: ")))" arcs either side, fading outward, dithered
  const arcs = (cx, cy, side) => {
    for (let i = 0; i < 3; i++) {
      const r = 3.2 + i * 2.4;
      const c = [0xeaf6ff, 0xa8d0ff, 0x6a90d8][i];
      for (let a = -0.8 + i * 0.08; a <= 0.8 - i * 0.08; a += 0.05) {
        const x = Math.round(cx + side * Math.cos(a) * r - 0.5), y = Math.round(cy + Math.sin(a) * r - 0.5);
        if (pc.alpha(x, y) > 200 && !(i > 0)) continue;
        if (pc.alpha(x, y)) continue;
        pc.set(x, y, c); pc.emit(x, y, 0.6 - i * 0.15);
      }
    }
  };
  arcs(9, 10, -1);
  arcs(23, 10, 1);
  glint(pc, 15, 4, 1, 0xffffff, ER[1]);
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
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; ring.push([Math.cos(a) * 6.2, 0, Math.sin(a) * 6.2]); }
  const top = [0, -10.5, 0], bot = [0, 8, 0];
  const polys = [];
  for (let i = 0; i < n; i++) { polys.push([ring[i], ring[(i + 1) % n], top]); polys.push([ring[(i + 1) % n], ring[i], bot]); }
  const rot = (P) => xf(P, { ry: 0.35, rx: -0.32, rz: 0.22, t: [16, 14, 0] });
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
  grow(sc, m, [
    { x: 10, y: 24.5, dx: -0.7, dy: -1, dz: 0.3, len: 12, r: 2.3, tip: 6, sk: [0.6, 0], tw: 0.3 },
    { x: 21.5, y: 24, dx: 0.6, dy: -1, dz: 0.25, len: 13, r: 2.3, tip: 6.5, sk: [-0.6, 0.2], tw: 0.9 },
    { x: 15, y: 25.5, dx: -0.1, dy: -1, dz: 0.4, len: 20, r: 3.2, tip: 8, sk: [0.5, 0.3], tw: 0.5 },
    { x: 18.5, y: 25.5, dx: 0.25, dy: -1, dz: 0.5, len: 12, r: 2, tip: 5, sk: [-0.5, 0], tw: 0.1 },
  ]);
  sc.render(pc);
  bolt(pc, [[3, 4], [6, 7], [4, 9], [7, 13]], 0xffffff, 0xfff27a);
  bolt(pc, [[28, 2], [25, 6], [28, 8], [25, 12]], 0xffffff, 0xfff27a);
  bolt(pc, [[18, 0], [20, 2], [18, 4]], 0xffffff, 0xfff27a);
  glint(pc, 13, 6, 1, 0xffffff, BR[1], 1);
}

function magmaite(pc) {
  const sc = new Scene(32);
  const rock = base(sc, ROCK.char(), 65, { y: 26 });
  const MR = CR.magma();
  const m = crystalMat(MR, { streak: false, root: 2, eq: 0.6 });
  const xs = grow(sc, m, [
    { x: 9.5, y: 24.5, dx: -0.65, dy: -1, dz: 0.3, len: 13, r: 3, tip: 4.5, tw: 0.4 },
    { x: 22, y: 24, dx: 0.55, dy: -1, dz: 0.25, len: 14, r: 3, tip: 4.5, tw: 0.9 },
    { x: 15.5, y: 25.5, dx: -0.05, dy: -1, dz: 0.4, len: 21, r: 4, tip: 6, tw: 0.6 },
  ]);
  sc.render(pc);
  // molten cracks: wandering glowing seams up each crystal, hottest near the core
  const lava = [0xfff6c0, 0xffd04a, 0xff8a2a, 0xd8481a];
  const rng = makeRng(66);
  for (const ob of xs) {
    const fr = ob.o.frame;
    for (const off of [-0.25, 0.35]) {
      let v = off;
      for (let u = 0.1; u < 0.92; u += 0.04) {
        v += rng.range(-0.12, 0.12);
        v = Math.max(-0.55, Math.min(0.55, v));
        const p = [fr.b[0] + fr.d[0] * u * fr.len + fr.e1[0] * v * fr.r, fr.b[1] + fr.d[1] * u * fr.len + fr.e1[1] * v * fr.r];
        const x = Math.floor(p[0]), y = Math.floor(p[1]);
        if (sc.objAt(x, y) !== ob.id) continue;
        const k = Math.min(3, Math.floor((1 - u) * 3.5));
        pc.set(x, y, lava[k]); pc.emit(x, y, 1);
      }
    }
  }
  // glowing seam in the rock and embers
  recolor(pc, sc, rock, (x, y) => Math.abs(y - 25.5 - Math.sin(x * 0.6) * 1.2) < 0.6, rampOf([0xfff6c0, 0xffd04a, 0xff9a3a, 0xe0602a, 0xa83a1a, 0x6a2010, 0x2a0a06]));
  for (const [x, y] of [[6, 7], [26, 9], [21, 2], [11, 4]]) { pc.set(x, y, 0xffb04a); pc.emit(x, y, 1); }
}

function frostite(pc) {
  const sc = new Scene(32);
  const rock = base(sc, ROCK.blue(), 67, { y: 26 });
  const FR = CR.frost();
  const m = crystalMat(FR, { glow: 0.35, root: 3 });
  const xs = grow(sc, m, [
    { x: 9.5, y: 24.5, dx: -0.7, dy: -1, dz: 0.3, len: 14, r: 2.4, tip: 4, tw: 0.3 },
    { x: 22, y: 24, dx: 0.6, dy: -1, dz: 0.25, len: 15, r: 2.4, tip: 4, tw: 0.8 },
    { x: 15.5, y: 25.5, dx: 0, dy: -1, dz: 0.4, len: 22, r: 3.2, tip: 5.5, tw: 0.5 },
    { x: 12, y: 26, dx: -0.3, dy: -1, dz: 0.5, len: 15, r: 2, tip: 3.5, tw: 0.2 },
  ]);
  sc.render(pc);
  rime(pc, sc, [...rock, ...xs], 20, [0xffffff, 0xd8f4ff], 7);
  const flake = (x, y, c = 0xffffff, c2 = 0xbff0ff) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { pc.set(x + dx, y + dy, c2); pc.set(x + dx * 2, y + dy * 2, c); pc.emit(x + dx, y + dy, 0.7); pc.emit(x + dx * 2, y + dy * 2, 0.7); }
    for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) { pc.set(x + dx * 2, y + dy * 2, c2); pc.emit(x + dx * 2, y + dy * 2, 0.7); }
    pc.set(x, y, c); pc.emit(x, y, 0.8);
  };
  flake(5, 8);
  flake(27, 6);
  glint(pc, 15, 5, 1, 0xffffff, FR[1], 1);
}

function voidstone(pc) {
  const sc = new Scene(32);
  base(sc, ROCK.char(), 68, { y: 26 });
  const VR = CR.void();
  const m = crystalMat(VR, { root: 2, eq: 0.6 });
  grow(sc, m, [
    { x: 10, y: 24.5, dx: -0.6, dy: -1, dz: 0.3, len: 13, r: 2.8, tip: 4.5, tw: 0.3 },
    { x: 21.5, y: 24, dx: 0.55, dy: -1, dz: 0.25, len: 14, r: 2.8, tip: 4.5, tw: 0.9 },
    { x: 15.5, y: 25.5, dx: 0, dy: -1, dz: 0.4, len: 21, r: 3.8, tip: 6, tw: 0.55 },
  ]);
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
  glint(pc, 15, 5, 1, 0xf0e0ff, VR[1]);
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
    pts.push([Math.cos(a) * 13 * r, Math.sin(a) * 11.5 * r, 0]); // cut rim
    if (i % 2 === 0) { const r2 = 1 - rng.range(0, 0.15); pts.push([Math.cos(a) * 11.5 * r2, Math.sin(a) * 10 * r2, -5.5 * r2]); }
  }
  pts.push([0, 0, -8]);
  const P = xf(pts, { rx: -0.85, t: [16, 16.5, 0] });
  const geo = sc.hull(shell, P);
  sc.render(pc);
  // the cut face: the face whose normal is closest to the cut plane normal
  const cutN = xf([[0, 0, 1]], { rx: -0.85 })[0];
  let cut = null, best = -1;
  for (const f of geo.faces) { const d = f.n[0] * cutN[0] + f.n[1] * cutN[1] + f.n[2] * cutN[2]; if (d > best) { best = d; cut = f; } }
  const inCut = (x, y) => sc.inb(x, y) && sc.fb[y * 32 + x] === cut.id;
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
    if (d < 1.2) pc.set(x, y, x + y < 30 ? rind[0] : rind[3]);
    else if (d < 2.2) pc.set(x, y, rind[1]);
    else if (d < 3) pc.set(x, y, rind[2]);
    else pc.set(x, y, AR[6]);
  }
  // crystal teeth growing inward from the rim of the cavity
  const cav = (x, y) => D[y * 32 + x] >= 3 && D[y * 32 + x] < 90;
  let cx = 0, cy = 0, n = 0;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (cav(x, y)) { cx += x + 0.5; cy += y + 0.5; n++; }
  cx /= n; cy /= n;
  const teeth = [];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (cav(x, y) && D[y * 32 + x] < 4 && hash2(x, y, 9) < 0.45) teeth.push([x + 0.5, y + 0.5]);
  teeth.sort((a, b) => b[1] - a[1]);
  for (const [bx, by] of teeth) {
    const dx = cx - bx, dy = cy - by, l = Math.hypot(dx, dy) || 1;
    const len = Math.min(l * 0.85, 3 + hash2(bx | 0, by | 0, 3) * 3.5), w = 1.6;
    const ux = dx / l, uy = dy / l, px = -uy, py = ux;
    const tip = [bx + ux * len, by + uy * len];
    const left = [bx + px * w, by + py * w], right = [bx - px * w, by - py * w];
    const litLeft = px * -0.6 + py * -0.8 > 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (!cav(x, y)) continue;
      const X = x + 0.5, Y = y + 0.5;
      if (!inPoly([left, tip, right], X, Y)) continue;
      const s = (X - bx) * px + (Y - by) * py;
      const lit = (s > 0) === litLeft;
      const u = ((X - bx) * ux + (Y - by) * uy) / len;
      pc.set(x, y, AR[lit ? (u > 0.6 ? 1 : 2) : (u > 0.6 ? 3 : 4)]);
    }
  }
  // depth: darken the cavity floor (centre)
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (cav(x, y) && pc.getHex(x, y) === AR[6] && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 2.2) pc.set(x, y, 0x12061e);
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

export { mix, vnoise, specks };
