// 32×32 icons: raw ores, crystals, cut gems, coal, fossils, obsidian and ingots.
import { makeRng } from '../../core/util.js';
import { mat, mat3, mix } from './color.js';
import { Mask, vol, fill, sparkle, hash2, vnoise, bayer } from './shade.js';
import { M, ring, facetRock, prism, pores, lineIn } from './parts.js';
import { camera, drawSolid, boxFaces, frustumFaces } from './solid.js';

// ---------------------------------------------------------------- small helpers
/** Lumpy metal nugget: union of blobs, dome-lit with a hot specular. */
export function nugget(pc, blobs, R, o = {}) {
  const m = M(pc.w, pc.h);
  for (const [x, y, rx, ry] of blobs) m.ellipse(x, y, rx, ry ?? rx);
  if (o.clip) m.and(o.clip);
  if (o.ring !== false) ring(pc, m, R, o.ringOpts || {});
  vol(pc, m, R, { spec: o.spec ?? 0.8, shine: o.shine ?? 14, emit: o.emit, bounce: true, round: o.round });
  return m;
}

/** Recolor existing pixels of a mask: tone index taken from `from` ramp, painted with `to` ramp. */
function remap(pc, mask, from, to, pick) {
  mask.each((x, y) => {
    const k = from.indexOf(pc.getHex(x, y));
    if (k < 0) return;
    const T = pick ? pick(x, y, k) : to;
    if (T) pc.set(x, y, T[k]);
  });
}

const gl = (pc, x, y, c, g = 1) => { pc.set(x, y, c); pc.emit(x, y, g); };

// ---------------------------------------------------------------- raw ores in rock
function copperOre(pc, rng) {
  const RR = mat(0x7d6a5a, { cont: 0.95 });
  const rock = facetRock(pc, rng, RR, { cx: 16, cy: 17.5, rx: 13.5, ry: 11.5, n: 9, jag: 0.15, seed: 11 });
  // malachite crusts: banded greens
  const MA = mat(0x2f9a5c, { cont: 1.05 });
  for (const [x, y, rx, ry] of [[8.5, 20.5, 3.6, 2.8], [23, 12.5, 3.2, 2.6], [20.5, 23, 2.6, 2], [10, 11, 2.2, 1.8]]) {
    const m = M().ellipse(x, y, rx, ry).and(rock);
    ring(pc, m, MA, { lit: MA[4], dark: MA[5], clip: rock });
    m.each((X, Y) => {
      const d = Math.hypot((X + 0.5 - x) / rx, (Y + 0.5 - y) / ry);
      const band = Math.floor(d * 3.2) % 2;
      const lit = (X - x) + (Y - y) < 0;
      pc.set(X, Y, MA[band ? (lit ? 2 : 3) : (lit ? 1 : 4)]);
    });
  }
  const CU = mat(0xd46f3c, { cont: 1.2, warm: 30 });
  CU[0] = 0xffe2c8; CU[1] = 0xffad78;
  nugget(pc, [[15, 15.5, 4.2, 3.4], [18.5, 13, 2.6, 2.2], [12.5, 18, 2.4, 2]], CU);
  nugget(pc, [[21.5, 19.5, 2.6, 2.2], [23, 21, 1.6]], CU);
  nugget(pc, [[9.5, 15.5, 1.8, 1.6]], CU);
  for (const [x, y] of [[13, 24], [25, 16], [7, 13]]) { pc.set(x, y, CU[2]); pc.set(x + 1, y + 1, CU[4]); }
  sparkle(pc, 13, 13, 1, 0xffffff, CU[0]);
}

function tinOre(pc, rng) {
  const RR = mat(0x6a5c50, { cont: 0.95 });
  const rock = facetRock(pc, rng, RR, { cx: 16, cy: 17.5, rx: 13.5, ry: 11.5, n: 9, jag: 0.15, seed: 12 });
  const TR = mat(0xc8ccd0, { cont: 1.25, hs: 0.5, sat: 0.6 });
  const flakes = [[11, 13, 4.2, -0.5], [18.5, 11.5, 3.8, 0.4], [21.5, 17, 3.8, -0.25], [13.5, 19.5, 4.4, 0.3], [20, 22.5, 3.2, 0.6]];
  for (const [x, y, r, a] of flakes) {
    const m = M().oval(x, y, r, r * 0.6, a).and(rock);
    ring(pc, m, TR, { lit: TR[5], dark: TR[6], clip: rock });
    m.each((X, Y) => {
      const u = (X + 0.5 - x) * Math.cos(a) + (Y + 0.5 - y) * Math.sin(a);
      const v = -(X + 0.5 - x) * Math.sin(a) + (Y + 0.5 - y) * Math.cos(a);
      pc.set(X, Y, TR[v < -r * 0.25 ? 2 : u + v * 1.5 > r * 0.4 ? 4 : 3]);
    });
    m.edge().each((X, Y) => { if (!m.get(X, Y - 1) || !m.get(X - 1, Y)) pc.set(X, Y, TR[1]); });
    const hx = x - Math.cos(a) * r * 0.4 + Math.sin(a) * r * 0.25, hy = y - Math.sin(a) * r * 0.4 - Math.cos(a) * r * 0.25;
    if (m.get(hx, hy)) pc.set(hx, hy, TR[0]);
  }
  // dark cassiterite grains
  for (const [x, y] of [[7, 15], [24, 11], [12, 24], [25, 20]]) { pc.set(x, y, 0x3a2a24); pc.set(x + 1, y, 0x5a4434); pc.set(x, y - 1, 0x7a6a5a); }
}

function ironOre(pc, rng) {
  const RR = mat(0x6e5a54, { cont: 1 });
  const rock = facetRock(pc, rng, RR, { cx: 16, cy: 17.5, rx: 13.5, ry: 11.5, n: 8, jag: 0.14, seed: 13, pores: 0.02, specks: 0.01 });
  const HE = mat(0x5c5a66, { cont: 1.25 }), JA = mat(0xa8402c, { cont: 1 }), DK = mat(0x2e2226);
  remap(pc, rock, RR, null, (x, y) => {
    const v = y * 0.85 + x * 0.32 + Math.sin(x * 0.42 + 1) * 1.6;
    const b = ((v % 7) + 7) % 7;
    if (b < 0.9) return DK;
    if (b < 3.6) return HE;
    return JA;
  });
  // metallic glints along the grey bands, rust bleeding from the top
  const RU = mat(0xc06a2c);
  rock.each((x, y) => {
    const c = pc.getHex(x, y);
    if (HE.indexOf(c) === 2 && hash2(x, y, 3) < 0.25) pc.set(x, y, HE[0]);
    if (y < 14 && vnoise(x * 0.3, y * 0.3, 8) > 0.6 && hash2(x, y, 5) < 0.55) pc.set(x, y, RU[2 + (hash2(x, y, 9) < 0.5 ? 1 : 2)]);
  });
  sparkle(pc, 11, 16, 1, 0xffffff, HE[0]);
}

function silverOre(pc, rng) {
  const RR = mat(0x4c4c5a, { cont: 1 });
  const rock = facetRock(pc, rng, RR, { cx: 16, cy: 17.5, rx: 13.5, ry: 11.5, n: 9, jag: 0.15, seed: 14 });
  const SR = mat(0xd8dde8, { cont: 1.3, hs: 1.2 });
  const r2 = makeRng(1414);
  const branch = (x, y, a, len, th, depth) => {
    let X = x, Y = y;
    for (let i = 0; i < len; i++) {
      X += Math.cos(a) * 0.9; Y += Math.sin(a) * 0.9;
      a += r2.range(-0.28, 0.28);
      if (!rock.get(X, Y)) return;
      if (th > 1 && rock.get(X + 0.7, Y + 0.7)) pc.set(X + 0.7, Y + 0.7, SR[4]);
      pc.set(X, Y, th > 1 ? SR[2] : SR[3]);
      if (th > 1 && rock.get(X - 0.6, Y - 0.6)) pc.set(X - 0.6, Y - 0.6, SR[1]);
      if (depth < 3 && i > 2 && r2.chance(0.22)) branch(X, Y, a + r2.pick([-0.85, 0.85]), Math.floor(len * 0.55), 1, depth + 1);
    }
    pc.set(X, Y, SR[0]);
  };
  branch(6, 23, -0.55, 18, 2, 0);
  branch(13, 26, -1.25, 13, 2, 1);
  branch(27, 20, -2.6, 11, 1, 1);
  nugget(pc, [[16.5, 14.5, 2.6, 2.2], [18.5, 13, 1.6]], SR);
  for (const [x, y] of [[9, 12], [22, 24], [24, 13]]) pc.set(x, y, 0x1a1820);
  sparkle(pc, 21, 10, 2, 0xffffff, SR[0]);
}

function goldOre(pc, rng) {
  const QZ = mat(0xd8d4cc, { cont: 0.9 });
  const rock = facetRock(pc, rng, QZ, { cx: 16, cy: 17.5, rx: 13.5, ry: 11.5, n: 9, jag: 0.15, seed: 15, pores: 0.03 });
  const LI = mat(0xb07a3a);
  rock.each((x, y) => { if (vnoise(x * 0.35, y * 0.35, 3) > 0.64 && hash2(x, y, 4) < 0.6) pc.set(x, y, LI[2 + (hash2(x, y, 6) < 0.5 ? 1 : 2)]); });
  const AU = mat(0xf2bc2c, { cont: 1.2, warm: 58 });
  AU[0] = 0xfffbe0;
  nugget(pc, [[13, 15, 5, 4], [16.5, 13, 2.8, 2.4], [10.5, 17.5, 2.6, 2.2]], AU, { spec: 0.72 });
  nugget(pc, [[21.5, 20, 3.4, 2.8]], AU, { spec: 0.72 });
  nugget(pc, [[21, 11, 2.2, 1.9]], AU, { spec: 0.72 });
  nugget(pc, [[8.5, 22.5, 1.8, 1.6]], AU, { spec: 0.72 });
  sparkle(pc, 11, 12, 2, 0xffffff, AU[0]);
}

function mithrilOre(pc, rng) {
  const RR = mat(0x3c4658, { cont: 1 });
  const rock = facetRock(pc, rng, RR, { cx: 16, cy: 17.5, rx: 13.5, ry: 11.5, n: 9, jag: 0.15, seed: 16 });
  const MR = mat(0x9be0e6, { cont: 1.3, hs: 1.2 });
  const vein = (y0, amp, ph, w) => {
    const m = M();
    for (let x = 0; x < 32; x += 0.25) {
      const y = y0 + Math.sin(x * 0.32 + ph) * amp + x * -0.18;
      m.disk(x, y, w);
    }
    m.and(rock);
    ring(pc, m, MR, { lit: MR[5], dark: MR[6], clip: rock });
    m.each((X, Y) => {
      const y = y0 + Math.sin((X + 0.5) * 0.32 + ph) * amp + (X + 0.5) * -0.18;
      const d = Y + 0.5 - y;
      pc.set(X, Y, MR[d < -w * 0.35 ? 1 : d < w * 0.25 ? 2 : 4]);
      if (hash2(X, Y, 7) < 0.12) pc.set(X, Y, hash2(X, Y, 8) < 0.5 ? 0xffd0f4 : 0xd0fff0);
    });
  };
  vein(17, 2.2, 0.5, 1.7);
  vein(25, 1.6, 2.4, 1.2);
  vein(10.5, 1.4, 4, 1.0);
  sparkle(pc, 12, 14, 2, 0xffffff, 0xd8fff8);
  sparkle(pc, 22, 21, 1, 0xffffff, 0xd8fff8);
}

function moonsilverOre(pc, rng) {
  const RR = mat(0x3a3656, { cont: 1 });
  const rock = facetRock(pc, rng, RR, { cx: 16, cy: 17.5, rx: 13.5, ry: 11.5, n: 9, jag: 0.15, seed: 17 });
  // moonlit halo in the rock
  rock.each((x, y) => {
    const d = Math.hypot(x + 0.5 - 14, y + 0.5 - 15.5);
    if (d < 9) { const k = RR.indexOf(pc.getHex(x, y)); if (k > 1) pc.set(x, y, mix(RR[k], 0x8a88c8, d < 6 ? 0.45 : 0.25)); }
  });
  const MR = mat(0xe2e4ff, { cont: 1, hs: 0.6, sat: 0.7 });
  const crescent = (x, y, r, a) => {
    const m = M().disk(x, y, r).sub(M().disk(x + Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, r * 0.8)).and(rock);
    ring(pc, m, MR, { lit: MR[4], dark: MR[6], clip: rock });
    vol(pc, m, MR, { spec: 0.8, emit: 0.6, round: 2 });
    return m;
  };
  crescent(14, 15.5, 7.5, -0.75);
  crescent(23, 22, 3.6, -0.75);
  sparkle(pc, 21, 11, 1, 0xffffff, MR[1], 1);
  gl(pc, 6, 15, 0xe8e8ff, 0.8);
}

function adamantOre(pc, rng) {
  const RR = mat(0x36363e, { cont: 1.05 });
  const rock = facetRock(pc, rng, RR, { cx: 16, cy: 18.5, rx: 13.5, ry: 10.5, n: 9, jag: 0.15, seed: 18 });
  const AR = mat(0x3ccf94, { cont: 1.35, hs: 1.3 });
  AR[0] = 0xe8fff4;
  // angular blades of green metal jutting out of the rock
  const shards = [
    [[9, 22], [13, 6], [16, 9], [15, 22]],
    [[15, 22], [21, 9], [24, 13], [21, 23]],
    [[5, 22], [6, 13], [9, 15], [9, 22]],
  ];
  for (const s of shards) {
    const m = M().poly(s);
    ring(pc, m, AR);
    // split along the ridge from the base center to the tip: lit left, dark right
    const [b0, t, t2, b1] = s;
    const left = M().poly([b0, t, [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2]]).and(m);
    m.each((x, y) => pc.set(x, y, AR[left.get(x, y) ? 2 : 4]));
    M().poly([t, t2, [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2]]).and(m).each((x, y) => pc.set(x, y, AR[3]));
    lineIn(pc, b0[0] + 1, b0[1] - 1, t[0], t[1] + 1, AR[1], m);
    pc.set(t[0], t[1] + 1, AR[0]);
  }
  sparkle(pc, 13, 8, 1, 0xffffff, AR[0]);
}

function meteorite(pc, rng) {
  const CR = mat(0x4a3c38, { cont: 1.05 });
  const m = facetRock(pc, rng, CR, { cx: 16, cy: 17, rx: 14, ry: 12, n: 10, jag: 0.12, seed: 19, plateau: 0.6, pores: 0.01, specks: 0.01 });
  // regmaglypts: thumbprint dimples on the crust
  for (const [x, y] of [[8, 22], [23, 9], [25, 20], [14, 26], [6, 14]]) {
    if (!m.get(x, y)) continue;
    pc.set(x, y, CR[5]); pc.set(x + 1, y, CR[4]); pc.set(x - 1, y - 1, CR[2]); pc.set(x, y + 1, CR[3]);
  }
  // polished cut face with a Widmanstätten pattern (crossed kamacite bands)
  const face = M().poly([[8, 9], [20, 7], [24, 17], [11, 20]]).and(m);
  const FR = mat(0xd0ccc4, { cont: 1.15, hs: 0.5 });
  ring(pc, face, FR, { lit: CR[2], dark: CR[6] });
  face.each((x, y) => {
    const a = ((x * 0.5 + y * 0.87) % 3.4 + 3.4) % 3.4, b = ((x * 0.5 - y * 0.87 + 60) % 3.4 + 3.4) % 3.4;
    let k = (x + y) < 26 ? 1 : 2;
    if (a < 0.75) k = 3;
    if (b < 0.75) k = a < 0.75 ? 4 : 3;
    pc.set(x, y, FR[k]);
  });
  face.edge().each((x, y) => { if (x + y < 26) pc.set(x, y, FR[0]); });
  // star specks in the crust and on the face
  for (const [x, y, r] of [[13, 11, 2], [20, 14, 1], [25, 23, 1], [7, 17, 1]]) sparkle(pc, x, y, r, 0xfffbe8, 0xffd060, 1);
  for (let i = 0; i < 7; i++) { const x = rng.int(5, 27), y = rng.int(7, 27); if (m.get(x, y) && !face.get(x, y)) gl(pc, x, y, 0xffe08a, 1); }
}

// ---------------------------------------------------------------- crystals
function crystalBase(pc, rng, rockC = 0x5a4e48, o = {}) {
  return facetRock(pc, rng, mat(rockC, { cont: 0.95 }), { cx: 16, cy: o.cy ?? 26.5, rx: o.rx ?? 11.5, ry: o.ry ?? 4.6, n: 8, jag: 0.12, flatBottom: true, plateau: 0.45, ridges: false });
}

function cluster(pc, R, spikes, o = {}) {
  for (const s of spikes) prism(pc, { R, base: o.base ?? 0.4, emit: o.emit, core: o.core, ...s });
}

/** ")))" sound-wave arcs. */
function arcs(pc, cx, cy, side, c, n = 3) {
  for (let i = 0; i < n; i++) {
    const r = 3 + i * 2.5;
    for (let a = -0.75; a <= 0.75; a += 0.06) {
      const x = cx + side * Math.cos(a) * r, y = cy + Math.sin(a) * r;
      pc.set(x, y, i === 0 ? c : mix(c, 0x7aa0d8, i * 0.25));
    }
  }
}

/** Jagged lightning bolt (polyline, 1px bright core + dim fringe). */
function bolt(pc, pts, core = 0xfffbd0, fringe = 0xffe060) {
  for (let i = 0; i + 1 < pts.length; i++) {
    lineIn(pc, pts[i][0] + 1, pts[i][1], pts[i + 1][0] + 1, pts[i + 1][1], fringe, null, 0.9);
    lineIn(pc, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], core, null, 1);
  }
}

function snowflake(pc, x, y, c = 0xffffff, c2 = 0xbff6ff, g = 0.8) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { gl(pc, x + dx, y + dy, c2, g); gl(pc, x + dx * 2, y + dy * 2, c, g); }
  for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) gl(pc, x + dx * 2, y + dy * 2, c2, g);
  gl(pc, x, y, c, g);
}

function crystalIcon(pc, id, spec, seed) {
  const rng = makeRng(seed);
  switch (id) {
    case 'quartz': {
      crystalBase(pc, rng, 0x7a6e66);
      const QR = mat(0xdfe2ee, { cont: 1.3, hs: 0.7 });
      cluster(pc, QR, [
        { x: 8.5, y: 26, a: -2.1, len: 13, w: 5.5, tip: 4.5 },
        { x: 23.5, y: 26, a: -1.0, len: 14, w: 5.5, tip: 4.5 },
        { x: 19, y: 26, a: -1.3, len: 19, w: 6.5, tip: 5.5, skew: 0.3 },
        { x: 13, y: 27, a: -1.72, len: 23, w: 7.5, tip: 6.5, skew: -0.2 },
      ], { base: 0.3 });
      sparkle(pc, 11, 6, 2, 0xffffff, 0xeef0ff);
      break;
    }
    case 'salt_crystal': {
      // halite: translucent pink cubes in 3/4 view, each outlined
      const SR = mat(0xf0cfcd, { cont: 1.25, hs: 1.1 });
      const cam = camera({ yaw: -0.6, tilt: 0.6, cx: 16, cy: 21 });
      const cube = (x, y, z, s) => {
        const faces = boxFaces(x - s, y, z - s, x + s, y + s * 2, z + s, SR, {
          paintAll: (p, m, tone) => {
            m.each((X, Y) => p.set(X, Y, SR[tone]));
            // translucent inner glow: lighter core one pixel in from the edges
            m.clone().erode(1).each((X, Y) => { if (bayer(X, Y) < 0.5 || tone > 3) p.set(X, Y, SR[Math.max(1, tone - 1)]); });
          },
        });
        const tmp = new Mask(32, 32);
        const all = drawSolid(pc, cam, faces);
        ring(pc, all, SR, { lit: SR[5], dark: SR[6] });
        drawSolid(pc, cam, faces);
        // crisp top edges
        const e = [cam.p(x - s, y + s * 2, z + s), cam.p(x + s, y + s * 2, z + s), cam.p(x + s, y + s * 2, z - s)];
        lineIn(pc, e[0][0], e[0][1], e[1][0], e[1][1], SR[0], all);
        lineIn(pc, e[1][0], e[1][1], e[2][0], e[2][1], SR[1], all);
        return tmp;
      };
      cube(0, 3.5, -4, 5);
      cube(-7.5, 0, 3, 3.6);
      cube(6.5, 0, 4, 3.2);
      sparkle(pc, 13, 4, 2, 0xffffff, 0xffe8f0);
      break;
    }
    case 'amethyst': {
      const RI = mat(0x8a8494, { cont: 0.95 });
      const rind = M().ellipse(16, 15, 14, 13).sub(M().rect(0, 0, 32, 9));
      ring(pc, rind, RI);
      vol(pc, rind, RI, { round: 4 });
      const cav = M().ellipse(16, 15, 10.5, 9.5).sub(M().rect(0, 0, 32, 9));
      fill(pc, M().ellipse(16, 15, 12.2, 11.2).sub(M().rect(0, 0, 32, 9)).sub(cav), 0xece6f2);
      fill(pc, M().ellipse(16, 15, 11.3, 10.3).sub(M().rect(0, 0, 32, 9)).sub(cav), 0xb4a4c8);
      fill(pc, cav, 0x2e1844);
      const AR = mat3(spec.c, { cont: 1.1 });
      for (const [x, y, a, l] of [[8, 18, -1.1, 8], [24, 18, -2.0, 8], [12, 22, -1.35, 9], [20, 22, -1.8, 9], [16, 23, -1.57, 11], [10, 14, -0.8, 5], [22, 14, -2.3, 5]])
        prism(pc, { x, y, a, len: l, w: 4.2, tip: 3.4, R: AR, base: 0.45, ringOpts: { lit: AR[6] } });
      prism(pc, { x: 13, y: 10, a: -1.75, len: 9, w: 5, tip: 4, R: AR, base: 0.3 });
      prism(pc, { x: 19, y: 10, a: -1.3, len: 7, w: 4.6, tip: 3.6, R: AR, base: 0.3 });
      sparkle(pc, 14, 3, 1, 0xffffff, AR[0]);
      sparkle(pc, 21, 16, 1, 0xffffff, AR[0]);
      break;
    }
    case 'lumite': {
      crystalBase(pc, rng, 0x4a4440);
      cluster(pc, mat3(spec.c, { cont: 1.05 }), [
        { x: 8.5, y: 26, a: -2.1, len: 12, w: 5.5, tip: 4.5 },
        { x: 23.5, y: 26, a: -1.0, len: 13, w: 5.5, tip: 4.5 },
        { x: 16, y: 27, a: -1.57, len: 24, w: 8, tip: 7, skew: 0.1 },
      ], { emit: 0.8, core: 0xf4fff0, base: 0.25 });
      sparkle(pc, 16, 4, 2, 0xffffff, 0xd9ffd6, 1);
      break;
    }
    case 'echo_crystal': {
      crystalBase(pc, rng, 0x52505e);
      const ER = mat(0xb4c4ff, { cont: 1.1, hs: 0.6 });
      cluster(pc, ER, [
        { x: 11.5, y: 26.5, a: -1.86, len: 18, w: 4, tip: 4 },
        { x: 20.5, y: 26.5, a: -1.28, len: 18, w: 4, tip: 4 },
        { x: 16, y: 27, a: -1.57, len: 24, w: 5, tip: 5 },
      ], { base: 0.3, core: 0xf0f8ff });
      arcs(pc, 9.5, 11, -1, 0xeaf6ff);
      arcs(pc, 22.5, 11, 1, 0xeaf6ff);
      break;
    }
    case 'gravium': {
      const GR = mat3(spec.c, { cont: 1.1 });
      M().ellipse(16, 28.5, 7.5, 1.8).each((x, y) => pc.set(x, y, 0x2a1a40, Math.abs(x + 0.5 - 16) < 4.5 ? 120 : 70));
      prism(pc, { x: 16, y: 15, a: -1.45, len: 11, w: 9, tip: 6, R: GR, base: 0 });
      prism(pc, { x: 16, y: 15, a: 1.69, len: 9, w: 9, tip: 6, R: GR, base: 0, glint: false });
      prism(pc, { x: 7, y: 9, a: -1.2, len: 5, w: 3.5, tip: 2.5, R: GR, base: 0 });
      prism(pc, { x: 25, y: 7, a: -1.9, len: 4, w: 3, tip: 2, R: GR, base: 0 });
      for (const [x, y] of [[11, 3], [21, 2], [5, 16], [27, 15]]) { pc.set(x, y, GR[1]); pc.set(x, y + 1, GR[3]); }
      // upward drift lines
      for (const [x, y] of [[4, 24], [27, 23], [24, 26]]) { pc.set(x, y, GR[2], 160); pc.set(x, y - 1, GR[1], 200); }
      sparkle(pc, 13, 7, 1, 0xffffff, GR[0]);
      break;
    }
    case 'bioxide': {
      crystalBase(pc, rng, 0x34404a);
      const BR = mat(0x3fe0c8, { cont: 1.15, hs: 0.8 });
      BR[0] = 0xf0fffb;
      cluster(pc, BR, [
        { x: 9, y: 26, a: -2.25, len: 13, w: 5, tip: 7.5, skew: 0.9 },
        { x: 23, y: 26, a: -0.9, len: 14, w: 5, tip: 7.5, skew: -0.9 },
        { x: 15.5, y: 27, a: -1.66, len: 22, w: 7.5, tip: 10, skew: 0.7 },
        { x: 19.5, y: 26, a: -1.22, len: 15, w: 5, tip: 6.5, skew: -0.6 },
      ], { emit: 0.85, core: 0xeafff8, base: 0.25 });
      bolt(pc, [[3, 5], [6, 8], [4, 10], [8, 14]]);
      bolt(pc, [[28, 3], [25, 6], [28, 8], [24, 12]]);
      bolt(pc, [[19, 1], [21, 3], [19, 5]]);
      break;
    }
    case 'magmaite': {
      crystalBase(pc, rng, 0x3a2a26);
      const CR = mat(0x2e2226, { cont: 0.75 });
      const lava = mat3(spec.c, { cont: 1 });
      for (const s of [
        { x: 9, y: 26, a: -2.1, len: 13, w: 6.5, tip: 5 },
        { x: 23, y: 26, a: -1.0, len: 14, w: 6.5, tip: 5 },
        { x: 16, y: 27, a: -1.57, len: 22, w: 9, tip: 7, skew: -0.2 },
      ]) {
        const m = prism(pc, { R: CR, base: 0.15, min: 2, max: 5, ridge: CR[1], ...s });
        const dx = Math.cos(s.a), dy = Math.sin(s.a);
        for (let u = 1.5; u < s.len - 1.5; u += 0.4) {
          const wob = Math.sin(u * 1.25 + s.x) * s.w * 0.17;
          const X = s.x + dx * u - dy * wob, Y = s.y + dy * u + dx * wob;
          if (m.get(X, Y)) gl(pc, X, Y, u > s.len * 0.6 ? lava[1] : u > s.len * 0.3 ? lava[2] : lava[3]);
        }
      }
      for (const [x, y] of [[6, 7], [26, 9], [21, 2], [11, 4]]) gl(pc, x, y, 0xffb04a);
      break;
    }
    case 'frostite': {
      crystalBase(pc, rng, 0x7a8a98);
      const FR = mat(0xd4f6ff, { cont: 1.3, hs: 0.8 });
      cluster(pc, FR, [
        { x: 9, y: 26, a: -2.15, len: 14, w: 5, tip: 4.5 },
        { x: 23, y: 26, a: -0.98, len: 15, w: 5, tip: 4.5 },
        { x: 16, y: 27, a: -1.57, len: 23, w: 7, tip: 6 },
        { x: 12.5, y: 27, a: -1.85, len: 17, w: 4.5, tip: 4 },
      ], { emit: 0.45, base: 0.3 });
      for (let x = 4; x < 29; x++) for (let y = 20; y < 29; y++) if (pc.alpha(x, y) > 200 && hash2(x, y, 9) < 0.3 + (y - 20) * 0.04) pc.set(x, y, 0xffffff);
      snowflake(pc, 5, 9);
      snowflake(pc, 26, 6);
      break;
    }
    case 'voidstone': {
      crystalBase(pc, rng, 0x2a2430);
      const VR = mat3(spec.c, { cont: 0.85 });
      VR[1] = 0x9a6ad9; VR[0] = 0xe0c8ff;
      cluster(pc, VR, [
        { x: 10, y: 26, a: -2.05, len: 14, w: 6, tip: 5, ridge: 0x9a6ad9 },
        { x: 22, y: 26, a: -1.05, len: 15, w: 6, tip: 5, ridge: 0x9a6ad9 },
        { x: 16, y: 27, a: -1.57, len: 23, w: 8, tip: 6.5, ridge: 0xb890f0 },
      ], { base: 0.2 });
      for (const [x, y] of [[16, 5], [9, 13], [24, 12]]) pc.set(x, y, 0xe0c8ff);
      // light-drinking aura: a dark violet rim around the silhouette and motes being pulled in
      const sil = new Mask(32, 32).fn((x, y) => pc.alpha(x, y) > 200);
      const r1 = sil.clone().dilate(1, true).sub(sil), r2 = sil.clone().dilate(2, true).sub(sil).sub(r1);
      r1.each((x, y) => pc.set(x, y, 0x1c0a30, 210));
      r2.each((x, y) => { if (bayer(x, y) < 0.5) pc.set(x, y, 0x24103c, 120); });
      for (const [x, y, dx, dy] of [[4, 8, 1, 1], [27, 6, -1, 1], [3, 19, 1, 0], [28, 18, -1, 0]]) { pc.set(x, y, 0xb890f0); pc.set(x - dx, y - dy, 0x6a3ab0, 200); }
      break;
    }
    default:
      crystalBase(pc, rng);
      cluster(pc, mat3(spec.c), [
        { x: 10, y: 26, a: -2.05, len: 13, w: 6, tip: 5 },
        { x: 22, y: 26, a: -1.05, len: 14, w: 6, tip: 5 },
        { x: 16, y: 27, a: -1.57, len: 22, w: 8, tip: 6.5 },
      ]);
  }
}

// ---------------------------------------------------------------- cut gems & organic gems
/**
 * Faceted top view for any convex outline: table, 8 star facets and 8 kite facets,
 * toned by their direction to the light with internal-reflection flares opposite it.
 * outline(t) → [x, y] for t in [0, 1) around the girdle; (cx, cy) = table center.
 */
export function facetedGem(pc, R, outline, o = {}) {
  const N = 8;
  const cx = o.cx ?? 16, cy = o.cy ?? 16;
  const G = [], Gm = [], Tb = [];
  for (let i = 0; i < N; i++) { G.push(outline(i / N)); Gm.push(outline((i + 0.5) / N)); }
  const tk = o.table ?? 0.5;
  for (let i = 0; i < N; i++) Tb.push([cx + (G[i][0] - cx) * tk, cy + (G[i][1] - cy) * tk]);
  const girdle = [];
  for (let i = 0; i < N; i++) girdle.push(G[i], Gm[i]);
  const all = M().poly(girdle);
  ring(pc, all, R);
  const LA = Math.atan2(-0.68, -0.52);
  const toneAt = (px, py, star) => {
    const a = Math.atan2(py - cy, px - cx);
    let d = Math.abs(((a - LA) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI); // 0 = facing light
    let t = 1 + Math.round(d / (Math.PI / 4));
    if (star) t += 1;
    if (d > Math.PI * 0.8) t = star ? 4 : 2; // reflection flare opposite the light
    return Math.max(1, Math.min(5, t));
  };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, h = (i + N - 1) % N;
    fill(pc, M().poly([Tb[i], Gm[h], G[i], Gm[i]]).and(all), R[toneAt(G[i][0], G[i][1], false)]);
    fill(pc, M().poly([Tb[i], Gm[i], Tb[j]]).and(all), R[toneAt(Gm[i][0], Gm[i][1], true)]);
  }
  const table = M().poly(Tb);
  table.each((x, y) => {
    const d = (x + 0.5 - cx) + (y + 0.5 - cy);
    pc.set(x, y, R[d < -4 ? 1 : d < 0 ? 2 : d < 4.5 ? 3 : 2]);
  });
  table.edge().each((x, y) => pc.set(x, y, (x + 0.5 - cx) + (y + 0.5 - cy) > 0 ? R[4] : R[1]));
  if (o.emit) all.each((x, y) => pc.emit(x, y, o.emit));
  return all;
}

function gemIcon(pc, id, spec) {
  const R = mat3(spec.c, { cont: 1.15 });
  const cut = spec.cut;
  if (id === 'diamond' || cut === 'brilliant') return brilliant(pc, mat(0xd8f2ff, { cont: 1.2, hs: 0.8 }));
  if (id === 'emerald' || cut === 'square') return emeraldCut(pc, mat(0x22c063, { cont: 1.25 }));
  if (id === 'sapphire') {
    const SR = mat(0x2a5ade, { cont: 1.2 });
    const rot = 0.5;
    facetedGem(pc, SR, (u) => {
      const t = u * Math.PI * 2;
      const x = 12.5 * Math.sin(t) * Math.sin(t / 2), y = -12.5 * Math.cos(t);
      return [16 + x * Math.cos(rot) - y * Math.sin(rot), 17 + x * Math.sin(rot) + y * Math.cos(rot)];
    }, { cx: 14.6, cy: 18.6, table: 0.5 });
    sparkle(pc, 11, 14, 2, 0xffffff, SR[0]);
    return;
  }
  if (id === 'ruby') {
    const RR = mat(0xd8243a, { cont: 1.2, hs: 1.3 });
    facetedGem(pc, RR, (u) => {
      const a = u * Math.PI * 2 - Math.PI / 2;
      const c = Math.cos(a), s2 = Math.sin(a);
      const r = 1 / Math.pow(Math.pow(Math.abs(c), 2.6) + Math.pow(Math.abs(s2), 2.6), 1 / 2.6);
      return [16 + c * r * 12.5, 16 + s2 * r * 11];
    }, { table: 0.52 });
    sparkle(pc, 10, 10, 2, 0xffffff, RR[0]);
    return;
  }
  if (id === 'sunstone') return sunstone(pc, mat3(spec.c, { cont: 1.1 }));
  if (cut === 'blob') return amberIcon(pc, mat(0xf0a028, { cont: 1.1, warm: 55 }), !!spec.bug);
  facetedGem(pc, R, (t) => { const a = t * Math.PI * 2 - Math.PI * 0.75; return [16 + Math.cos(a) * 12, 16 + Math.sin(a) * 10]; });
}

function brilliant(pc, R) {
  const crown = M().poly([[9, 5], [23, 5], [29, 12], [3, 12]]);
  const pav = M().poly([[3, 12], [29, 12], [16, 29]]);
  const all = crown.clone().union(pav);
  ring(pc, all, R);
  for (const [pts, t] of [
    [[[9, 5], [16, 5], [12, 12], [3, 12]], 1],
    [[[16, 5], [23, 5], [20, 12], [12, 12]], 2],
    [[[23, 5], [29, 12], [20, 12]], 3],
  ]) fill(pc, M().poly(pts).and(crown), R[t]);
  for (const [pts, t] of [
    [[[3, 12], [9, 12], [16, 29]], 2],
    [[[9, 12], [16, 12], [16, 29]], 4],
    [[[16, 12], [23, 12], [16, 29]], 3],
    [[[23, 12], [29, 12], [16, 29]], 5],
  ]) fill(pc, M().poly(pts).and(pav), R[t]);
  for (let x = 4; x < 29; x++) pc.set(x, 12, R[0]);
  for (let x = 10; x < 23; x++) pc.set(x, 5, R[0]);
  lineIn(pc, 12.5, 12.5, 16.5, 28, R[1], pav);
  for (const [x, y, c] of [[20, 9, 0xffb0d0], [7, 15, 0xfff0a0], [22, 17, 0xa0e0ff], [13, 20, 0xc0ffd0], [18, 24, 0xffc8e8]]) pc.set(x, y, c);
  sparkle(pc, 11, 8, 2, 0xffffff, R[0]);
  sparkle(pc, 24, 15, 1, 0xffffff, R[0]);
}

function emeraldCut(pc, R) {
  const outer = [[8, 4], [24, 4], [28, 8], [28, 24], [24, 28], [8, 28], [4, 24], [4, 8]];
  const all = M().poly(outer);
  ring(pc, all, R);
  const step = (k) => outer.map(([x, y]) => [16 + (x - 16) * k, 16 + (y - 16) * k]);
  const s1 = step(0.78), s2 = step(0.56);
  // each step band: 4 trapezoids (top, right, bottom, left) + corner facets
  const band = (A, B, inv) => {
    const sides = [[0, 1, 1], [2, 3, 3], [4, 5, 4], [6, 7, 2]]; // top, right, bottom, left → tones
    for (const [i0, i1, t] of sides) {
      const m = M().poly([A[i0], A[i1], B[i1], B[i0]]);
      fill(pc, m, R[inv ? 6 - t : t]);
    }
    for (const [i0, i1, t] of [[1, 2, 2], [3, 4, 4], [5, 6, 3], [7, 0, 1]]) fill(pc, M().poly([A[i0], A[i1], B[i1], B[i0]]), R[inv ? Math.max(1, 6 - t) : t]);
  };
  band(outer, s1, false);
  band(s1, s2, true);
  const table = M().poly(s2);
  table.each((x, y) => pc.set(x, y, R[(x + y) < 28 ? 2 : (x + y) < 36 ? 3 : 4]));
  for (const [x, y] of [[14, 17], [18, 14], [17, 19], [13, 14]]) pc.set(x, y, R[5]);
  sparkle(pc, 12, 11, 2, 0xffffff, R[0]);
  for (let x = 9; x < 23; x++) pc.set(x, 5, R[1]);
}

function sunstone(pc, R) {
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const l = i % 2 ? 14.5 : 13;
    for (let r = 11; r < l; r += 0.5) gl(pc, 16 + Math.cos(a) * r, 16 + Math.sin(a) * r, i % 2 ? 0xffe9a0 : 0xffc040, 0.8);
  }
  const m = M().disk(16, 16, 10);
  ring(pc, m, R);
  vol(pc, m, R, { spec: 0.86, emit: 0.7, bounce: true });
  m.each((x, y) => { if (hash2(x, y, 21) < 0.09) pc.set(x, y, hash2(x, y, 4) < 0.5 ? 0xfff8d0 : 0xff9a2a); });
  sparkle(pc, 12, 11, 2, 0xffffff, 0xfffbd0, 1);
}

function amberIcon(pc, R, bug) {
  const m = M().ellipse(16, 17, 11, 10).ellipse(13, 12.5, 7, 6).ellipse(20, 21, 8, 6);
  ring(pc, m, R);
  // translucent: dark rim, glowing core lit from the far side
  vol(pc, m, R, { spec: 0.84, shine: 10, round: 4 });
  M().ellipse(18.5, 19.5, 6, 5).and(m).each((x, y) => { const k = R.indexOf(pc.getHex(x, y)); if (k > 2) pc.set(x, y, R[k - 1]); });
  m.edge().each((x, y) => { if (x + y > 30) pc.set(x, y, R[5]); });
  if (bug) {
    const K = 0x3a1c0c, K2 = 0x6a3410;
    fill(pc, M().ellipse(16.5, 18.5, 3.4, 4.2), K);
    fill(pc, M().ellipse(16.5, 13.6, 2.2, 1.7), K);
    for (let i = 0; i < 3; i++) { pc.set(12.5, 16 + i * 2.2, K); pc.set(11.5, 16.6 + i * 2.2, K2); pc.set(20.5, 16 + i * 2.2, K); pc.set(21.5, 16.6 + i * 2.2, K2); }
    pc.set(15, 11.5, K2); pc.set(14, 10.5, K2); pc.set(18, 11.5, K2); pc.set(19, 10.5, K2);
    lineIn(pc, 16.5, 15.5, 16.5, 22, K2);
    pc.set(15, 16, 0x8a5a24); pc.set(15, 17, 0x7a4a1c);
  } else {
    for (const [x, y] of [[19, 19], [12, 20], [21, 13], [16, 23]]) { pc.set(x, y, R[1]); pc.set(x + 1, y + 1, R[3]); }
  }
  sparkle(pc, 11, 10, 2, 0xffffff, R[0]);
}

// ---------------------------------------------------------------- coal / fossil / shard
const COAL = [0xe0e8ff, 0x8c94b8, 0x565870, 0x363442, 0x262230, 0x18141e, 0x0c080e];

function coalIcon(pc) {
  const R = COAL.slice(); R.o = R[6];
  const rng = makeRng(77);
  const o = { n: 6, jag: 0.32, slope: 2.2, plateau: 0.34, pores: 0.015, specks: 0.05 };
  facetRock(pc, rng, R, { cx: 10, cy: 21.5, rx: 8.5, ry: 7.2, ...o });
  facetRock(pc, rng, R, { cx: 22.5, cy: 22, rx: 8, ry: 6.8, ...o });
  facetRock(pc, rng, R, { cx: 16, cy: 13, rx: 9.5, ry: 8.5, ...o, n: 7 });
  sparkle(pc, 12, 9, 1, 0xf0f4ff, COAL[1]);
  pc.set(21, 19, COAL[0]);
}

function fossilIcon(pc) {
  const SL = mat(0x9a948a, { cont: 0.9 });
  const rng = makeRng(31);
  const slab = facetRock(pc, rng, SL, { cx: 16, cy: 17, rx: 14.5, ry: 13, n: 10, jag: 0.08, plateau: 0.75, pores: 0.06, ridges: false });
  // ammonite: logarithmic spiral with ribbed whorls
  const SH = mat(0xe2cca4, { cont: 1.35, hs: 0.6, sat: 0.9 });
  const cx = 16.5, cy = 17, R0 = 10.5;
  const b = 0.115, a0 = R0 / Math.exp(b * Math.PI * 2 * 3.05);
  const shell = M().disk(cx, cy, R0);
  ring(pc, shell, SH, { lit: SL[4], dark: SH[6] });
  shell.each((x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    const r = Math.max(0.6, Math.hypot(dx, dy));
    const th = Math.atan2(dy, dx) + Math.PI;
    const w = Math.log(r / a0) / b / (Math.PI * 2) - th / (Math.PI * 2);
    const u = w - Math.floor(w); // position across the whorl tube (0 inner suture .. 1 outer)
    const turn = Math.floor(w) + th / (Math.PI * 2);
    const rib = ((turn * 14) % 1 + 1) % 1 < 0.38;
    const lit = dx * -0.6 + dy * -0.8 > 0;
    let k = u < 0.16 ? 6 : u < 0.42 ? (lit ? 1 : 2) : u < 0.78 ? 3 : 4;
    if (rib && k > 1 && k < 6) k -= 1;
    if (!rib && k === 3 && !lit) k = 4;
    pc.set(x, y, SH[k]);
  });
  pc.set(cx - 0.5, cy - 0.5, SH[6]);
  sparkle(pc, 9, 10, 1, 0xffffff, SH[1]);
}

function obsidianShard(pc) {
  const R = [0xf0e8ff, 0xa898d8, 0x5a4a7e, 0x2e2440, 0x1e1630, 0x120c1c, 0x08040c];
  R.o = R[6];
  const pts = [[14, 1], [22, 8], [27, 19], [19, 30], [10, 27], [5, 15]];
  const m = M().poly(pts);
  ring(pc, m, R, { lit: R[4], dark: R[6] });
  // big conchoidal facets
  fill(pc, m, R[4]);
  fill(pc, M().poly([[14, 1], [22, 8], [16, 15]]).and(m), R[3]);
  fill(pc, M().poly([[14, 1], [16, 15], [10, 27], [5, 15]]).and(m), R[5]);
  fill(pc, M().poly([[16, 15], [27, 19], [19, 30], [10, 27]]).and(m), R[4]);
  // ripple arcs of the fracture surface
  for (let k = 0; k < 4; k++) {
    const r = 4 + k * 3.2;
    for (let a = -1.0; a < 1.1; a += 0.06) {
      const x = 19 + Math.cos(a + 2.3) * r, y = 23 + Math.sin(a + 2.3) * r;
      if (m.get(x, y) && !M().poly([[14, 1], [22, 8], [16, 15]]).get(x, y)) pc.set(x, y, k % 2 ? R[2] : R[3]);
    }
  }
  // glassy reflections: a long streak and edge glints
  lineIn(pc, 14, 3, 21, 9, R[1], m);
  lineIn(pc, 13, 4, 7, 15, R[2], m);
  lineIn(pc, 22, 10, 26, 19, R[2], m);
  sparkle(pc, 16, 6, 2, 0xffffff, R[1]);
}

// ---------------------------------------------------------------- ingots
const INGOT_LOOK = {
  copper_ingot: { base: 0xd4703a, cont: 1.2, warm: 30, hi: 0xffc8a0 },
  tin_ingot: { base: 0xb2b6b8, cont: 0.75, hs: 0.4, matte: true },
  bronze_ingot: { base: 0xbf8a3c, cont: 1.1, warm: 52, hi: 0xffe0a0 },
  iron_ingot: { base: 0x7c828c, cont: 1.0, rough: true },
  steel_ingot: { base: 0x98aabb, cont: 1.35, hs: 1.3 },
  silver_ingot: { base: 0xc8cfdb, cont: 1.35, hs: 1.2 },
  gold_ingot: { base: 0xf0b428, cont: 1.2, warm: 58, hi: 0xfff6c8 },
  mithril_ingot: { base: 0x8cd6dc, cont: 1.25, irid: true },
  moonsilver_ingot: { base: 0xd0d2ea, cont: 1.05, sat: 0.6, glow: 0.35 },
  adamant_ingot: { base: 0x34bf86, cont: 1.35, hs: 1.2 },
  starmetal_ingot: { base: 0xf0c860, cont: 1.2, star: true, glow: 0.3, hi: 0xfffbe0 },
};

function ingotIcon(pc, id, spec) {
  const L = INGOT_LOOK[id] || { base: spec.c[0], cont: 1 };
  const R = mat(L.base, { cont: L.cont, hs: L.hs ?? 1, warm: L.warm ?? 50, sat: L.sat ?? 1 });
  if (L.hi) R[0] = L.hi;
  const cam = camera({ yaw: -0.38, tilt: 0.78, cx: 16, cy: 19, scale: 1.08 });
  const top = (p, m, tone) => {
    const b = m.bounds();
    m.each((x, y) => {
      const u = (x - b.x0) / b.w, v = (y - b.y0) / Math.max(1, b.h);
      let k = 2;
      const d = u - v * 0.45;
      if (!L.matte && d > 0.16 && d < 0.24) k = 0;
      else if (!L.matte && d > 0.1 && d < 0.34) k = 1;
      else if (d > 0.7) k = 3;
      if (L.matte) k = d > 0.5 ? 3 : 2;
      p.set(x, y, R[k]);
    });
  };
  const front = (p, m) => {
    const b = m.bounds();
    m.each((x, y) => {
      const v = (y - b.y0) / Math.max(1, b.h);
      let k = v < 0.22 ? 2 : v < 0.55 ? 3 : v < 0.8 ? 4 : 3;
      if (L.matte) k = v < 0.4 ? 3 : 4;
      p.set(x, y, R[k]);
    });
  };
  const end = (p, m) => m.each((x, y) => p.set(x, y, R[(y + x) % 7 === 0 && !L.matte ? 4 : 5]));
  const faces = frustumFaces(0, 0, 12.5, 5.2, 10, 3.2, 0, 6.5, R, { paint: { top, front, right: end, left: end } });
  const all = drawSolid(pc, cam, faces);
  ring(pc, all, R);
  // crisp lit edge along the top-front rim
  const e0 = cam.p(-10, 6.5, 3.2), e1 = cam.p(10, 6.5, 3.2);
  lineIn(pc, e0[0], e0[1], e1[0], e1[1], L.matte ? R[2] : R[0], all);
  // stamp mark
  const s = cam.p(-2, 6.5, 0);
  if (!L.matte) { for (let i = 0; i < 4; i++) pc.set(s[0] + i, s[1], R[2]); pc.set(s[0] - 1, s[1] + 1, R[2]); pc.set(s[0] + 4, s[1] + 1, R[2]); for (let i = 0; i < 4; i++) pc.set(s[0] + i, s[1] + 1, R[3]); }
  if (L.rough) pores(pc, all, R, 0.08, 4, 0.02);
  if (L.irid) all.each((x, y) => { const k = R.indexOf(pc.getHex(x, y)); const b = (x - y * 0.6 + 40) % 11; if (k >= 1 && k <= 4 && b < 2) pc.set(x, y, mix(R[k], b < 1 ? 0xffb8f0 : 0xc8b0ff, 0.45)); });
  if (L.glow) all.each((x, y) => pc.emit(x, y, L.glow));
  if (L.star) {
    sparkle(pc, 23, 6, 2, 0xffffff, 0xfff0a0, 1);
    sparkle(pc, 6, 22, 1, 0xffffff, 0xfff0a0, 1);
    for (const [x, y] of [[11, 20], [18, 22], [24, 19]]) gl(pc, x, y, 0xfffbe0);
  } else if (!L.matte) sparkle(pc, 9, 13, 1, 0xffffff, R[0]);
}

// ---------------------------------------------------------------- dispatcher
const ORE_DRAW = {
  copper_ore: copperOre, tin_ore: tinOre, iron_ore: ironOre, silver_ore: silverOre, gold_ore: goldOre,
  mithril_ore: mithrilOre, moonsilver_ore: moonsilverOre, adamant_ore: adamantOre, starmetal_ore: meteorite,
};

export function drawMineral(pc, spec, id, seed) {
  switch (spec.k) {
    case 'ore': {
      const f = ORE_DRAW[id];
      if (f) f(pc, makeRng(seed));
      else { const R = mat(spec.rock || 0x6a5a4a); const rock = facetRock(pc, makeRng(seed), R, { cx: 16, cy: 17.5, rx: 13.5, ry: 11.5 }); nugget(pc, [[16, 16, 4, 3.4]], mat3(spec.ore || [0xd9773f, 0xf2a35e, 0x9c4a24]), { clip: rock }); }
      break;
    }
    case 'crystal': crystalIcon(pc, id, spec, seed); break;
    case 'gem': gemIcon(pc, id, spec); break;
    case 'coal': coalIcon(pc); break;
    case 'fossil': fossilIcon(pc); break;
    case 'shard': obsidianShard(pc); break;
    case 'ingot': ingotIcon(pc, id, spec); break;
    default: return false;
  }
  return true;
}
