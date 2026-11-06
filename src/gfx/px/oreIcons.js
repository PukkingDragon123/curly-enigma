// Raw-ore icons: host-rock chunks (flat planes, mottled) with the ore embedded in them
// (nuggets, wire veins, crystals, bands), built on the facet renderer in facets.js. Authored
// on the 32-unit design grid, rasterised natively at S× (res.js): tests and geometry below take
// design coordinates, pixel loops run over the scene's native buffers.
import { makeRng } from '../../core/util.js';
import { hash2, vnoise, bayer } from './shade.js';
import { Scene, material, rampOf, stoneTex, glint } from './facets.js';
import { S, dc, nc, np } from './res.js';

// ---------------------------------------------------------------- shared helpers
/** Point-in-polygon (even-odd). */
export function inPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  }
  return c;
}

/**
 * Repaint pixels of the given objects whose test passes: test(x, y, k, X, Y) (design x, y;
 * native X, Y) → false | true (use R2) | ramp.
 */
export function recolor(pc, sc, objs, test, R2) {
  const ids = new Set(objs.map((o) => o.id));
  for (let y = 0; y < sc.h; y++) for (let x = 0; x < sc.w; x++) {
    const i = y * sc.w + x;
    if (!ids.has(sc.ob[i])) continue;
    const k = sc.k[i];
    if (k < 0 || k > 6) continue;
    const r = test(dc(x), dc(y), k, x, y);
    if (!r) continue;
    const R = r === true ? R2 : r;
    pc.set(x, y, R[Math.max(0, Math.min(6, k + (R.dk || 0)))]);
  }
}

/** Noisy round patch test: inside a wobbly circle of radius r around (cx, cy). */
export const blot = (cx, cy, r, seed = 1, wob = 0.45) => (x, y) => {
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  return d < r * (1 - wob / 2 + wob * vnoise(x * 0.45, y * 0.45, seed));
};

/** Pixels within w (design px; number or fn(x, y) of design coords) of a polyline (design pts) → Map(native index → {d, side}). */
function band(sc, pts, w) {
  const out = new Map();
  for (let y = 0; y < sc.h; y++) for (let x = 0; x < sc.w; x++) {
    const px = (x + 0.5) / S, py = (y + 0.5) / S;
    let best = 1e9, side = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2));
      const dx = px - ax - vx * t, dy = py - ay - vy * t;
      const d = Math.hypot(dx, dy);
      if (d < best) { best = d; side = dx * -vy + dy * vx; }
    }
    const ww = typeof w === 'function' ? w(dc(x), dc(y)) : w;
    if (best <= ww) out.set(y * sc.w + x, { d: best / Math.max(0.01, ww), side });
  }
  return out;
}

/**
 * A raised mineral vein over rock pixels: lit top-left lip, dark bottom-right lip, body tone
 * following the plane underneath, and (at S > 1) a thin bright crest along its middle.
 * pts in design px, w half-width (number or fn(x, y)). Returns [[X, Y, tone, isDarkLip], ...] (native).
 */
export function vein(pc, sc, objs, pts, w, R, o = {}) {
  const ids = new Set(objs.map((q) => q.id));
  const B = band(sc, pts, w);
  const inV = (x, y) => B.has(y * sc.w + x) && ids.has(sc.ob[y * sc.w + x]);
  const hit = [];
  for (const [i] of B) {
    const x = i % sc.w, y = (i / sc.w) | 0;
    if (!ids.has(sc.ob[i]) || sc.k[i] < 0 || sc.k[i] > 6) continue;
    const kRock = Math.min(5, sc.k[i]);
    let k = Math.max(1, Math.min(5, kRock + (o.lift ?? -1)));
    const tl = !inV(x - 1, y) || !inV(x, y - 1), br = !inV(x + 1, y) || !inV(x, y + 1);
    if (tl && !br) k = Math.max(o.minK ?? 1, k - 1);
    else if (br && !tl) k = Math.min(5, k + 1);
    if (S > 1 && !tl && !br && B.get(i).d < 0.28 && k > (o.minK ?? 1)) k -= 1; // crest catching the light
    hit.push([x, y, k, br && !tl]);
  }
  for (const [x, y, k] of hit) {
    pc.set(x, y, R[k]);
    if (o.emit) pc.emit(x, y, o.emit);
  }
  // the vein's lip shades the rock just below-right of it
  if (o.lip !== false) for (const [x, y, , br] of hit) {
    if (!br) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const X = x + dx, Y = y + dy, j = Y * sc.w + X;
      if (X < sc.w && Y < sc.h && ids.has(sc.ob[j]) && !inV(X, Y) && sc.k[j] >= 0 && sc.k[j] < 5) {
        const RR = objs.find((q) => q.id === sc.ob[j]).m.R;
        pc.set(X, Y, RR[Math.min(5, sc.k[j] + 1)]);
      }
    }
  }
  return hit;
}

/** Wandering polyline from (x, y) heading a, n steps of length l, turning by up to `bend`. */
export function wander(rng, x, y, a, n, l = 1.6, bend = 0.45) {
  const pts = [[x, y]];
  for (let i = 0; i < n; i++) { a += rng.range(-bend, bend); x += Math.cos(a) * l; y += Math.sin(a) * l; pts.push([x, y]); }
  return pts;
}

/**
 * Scatter specks (colours or fn(tone)) over objs where test(x, y, k) (design coords) passes.
 * dens is per design pixel; at S > 1 each speck is a real pixel, and one in three is a tiny
 * raised grain (a darker pixel tucked under its bottom-right).
 */
export function specks(pc, sc, objs, dens, cols, seed = 1, test = null, emit = 0) {
  const ids = new Set(objs.map((q) => q.id));
  const d = S > 1 ? dens * 0.6 : dens;
  for (let y = 0; y < sc.h; y++) for (let x = 0; x < sc.w; x++) {
    const i = y * sc.w + x;
    if (!ids.has(sc.ob[i]) || sc.k[i] < 0 || sc.k[i] > 6) continue;
    if (hash2(x, y, seed) >= d || (test && !test(dc(x), dc(y), sc.k[i], x, y))) continue;
    const c = cols[Math.floor(hash2(x, y, seed + 5) * cols.length)];
    pc.set(x, y, typeof c === 'function' ? c(sc.k[i]) : c);
    if (emit) pc.emit(x, y, emit);
    const j = i + sc.w + 1;
    if (S > 1 && hash2(x, y, seed + 9) < 0.33 && x + 1 < sc.w && y + 1 < sc.h && sc.ob[j] === sc.ob[i] && sc.k[j] >= 0 && sc.k[j] < 5) {
      const R = sc.objs[sc.ob[j]].m.R;
      pc.set(x + 1, y + 1, R[Math.min(5, sc.k[j] + 1)]);
    }
  }
}

/**
 * Hairline fractures across rock objects (S > 1 only): wandering 1px dark cracks with a lit
 * lower lip, following design-space polylines. Each crack: [[x, y], ...].
 */
export function cracks(pc, sc, objs, list) {
  if (S === 1) return;
  const ids = new Set(objs.map((q) => q.id));
  for (const pts of list) {
    let last = -1;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) * S * 2);
      for (let t = 0; t <= n; t++) {
        const X = np(ax + (bx - ax) * t / n), Y = np(ay + (by - ay) * t / n), j = Y * sc.w + X;
        if (j === last || X < 0 || Y < 0 || X >= sc.w || Y >= sc.h || !ids.has(sc.ob[j]) || sc.k[j] < 0 || sc.k[j] > 6) continue;
        last = j;
        const R = sc.objs[sc.ob[j]].m.R;
        pc.set(X, Y, R[Math.min(6, sc.k[j] + 2)]);
        const jb = j + sc.w;
        if (Y + 1 < sc.h && ids.has(sc.ob[jb]) && sc.k[jb] > 1 && sc.k[jb] < 6 && pc.getHex(X, Y + 1) !== R[Math.min(6, sc.k[j] + 2)]) pc.set(X, Y + 1, R[sc.k[jb] - 1]);
      }
    }
  }
}

// host-rock ramps: light planes lean warm, shadows lean violet
export const ROCK = {
  grey: () => rampOf([0xeef1f2, 0xc6ced6, 0x9da8b7, 0x7a8497, 0x5a6179, 0x40445c, 0x1f2134]),
  taupe: () => rampOf([0xf2e8da, 0xcdbda9, 0xa59484, 0x7f6f68, 0x5c4f56, 0x403644, 0x1f1824]),
  brown: () => rampOf([0xeadccb, 0xc2a88e, 0x957b68, 0x6e5852, 0x4f3e44, 0x372a36, 0x1a121c]),
  slate: () => rampOf([0xcfd4e4, 0x949bb5, 0x6c7290, 0x51546f, 0x3c3c56, 0x2a2940, 0x131224]),
  blue: () => rampOf([0xd2e0ec, 0x93a8c0, 0x6a7f9e, 0x4e5f80, 0x3a4664, 0x2a314b, 0x131828]),
  indigo: () => rampOf([0xc9c4ea, 0x8d86bd, 0x645e96, 0x4a4576, 0x36325c, 0x262244, 0x110f24]),
  night: () => rampOf([0x9a94c8, 0x6a6498, 0x4c4778, 0x39345e, 0x2a264a, 0x1d1a36, 0x0b0a1c]),
  char: () => rampOf([0xb8bcc4, 0x7c808c, 0x55585f, 0x3c3e46, 0x2b2c34, 0x1d1e25, 0x0c0c12]),
  quartz: () => rampOf([0xffffff, 0xf3f0ec, 0xddd6d0, 0xbdb3b0, 0x968a90, 0x6e6272, 0x332838]),
  red: () => rampOf([0xf6d0b8, 0xd88a6a, 0xb25844, 0x8a3c36, 0x63282e, 0x441c26, 0x200c14]),
};

export const rockMat = (R, seed, o = {}) => material(R, { tex: stoneTex(seed, { amp: o.amp ?? 0.5, sx: 0.55, sy: 1.15, pit: o.pit ?? 0.05, speck: o.speck ?? 0.03 }), ...o });

/** Host rock: a big cut-stone chunk plus smaller ones (same group: no lines between them). */
export function hostRock(sc, m, seed, parts) {
  const rng = makeRng(seed);
  return parts.map((p) => sc.chunk(m, rng, { p: 0.7, n: [5, 5, 4], jag: 0.22, group: 1, ...p }));
}

// metal / mineral ramps (index 0 = specular)
export const RAMP = {
  copper: () => rampOf([0xfff3dc, 0xffc08a, 0xf28c4c, 0xc95e2d, 0x8f3b22, 0x5c2219, 0x2a0d10]),
  malachite: () => rampOf([0xe8ffe8, 0x9cf2b2, 0x4fd18a, 0x2a9e68, 0x1c6f54, 0x134a3e, 0x09221f]),
  tin: () => rampOf([0xffffff, 0xe4e8ec, 0xbfc6cd, 0x959ea8, 0x6c7480, 0x4b5160, 0x232634]),
  hematite: () => rampOf([0xf0f2fa, 0xa9adbe, 0x787c90, 0x55586c, 0x3c3c50, 0x29283a, 0x14121e]),
  jasper: () => rampOf([0xffd6bc, 0xf08a64, 0xc85240, 0x9a3434, 0x6e2230, 0x481626, 0x220a14]),
  rust: () => rampOf([0xffe0b0, 0xf0a860, 0xd07a36, 0xa85628, 0x7a3a20, 0x52261a, 0x28100c]),
  silver: () => rampOf([0xffffff, 0xf2f5fa, 0xd2d9e4, 0xa8b1c2, 0x7c8498, 0x555b70, 0x262a3a]),
  gold: () => rampOf([0xfffbe0, 0xffe680, 0xf7c23a, 0xd9901c, 0xa6621a, 0x6e3c16, 0x33180c]),
  mithril: () => rampOf([0xf4ffff, 0xc4f6f6, 0x8de0e6, 0x5cb6c8, 0x3e86a0, 0x2a5a78, 0x122a40]),
  moon: () => rampOf([0xffffff, 0xf2f0ff, 0xd8d6f6, 0xb0aee0, 0x8682c0, 0x5e5896, 0x2a2650]),
  adamant: () => rampOf([0xeafff4, 0x9ef5c8, 0x4fdc9a, 0x22b077, 0x167e5a, 0x0f5442, 0x062620]),
  crust: () => rampOf([0xb8a49a, 0x7e6a64, 0x5a4a48, 0x423638, 0x30262a, 0x21191e, 0x0e0a0e]),
  kamacite: () => rampOf([0xffffff, 0xeceef0, 0xcfd2d6, 0xa9adb4, 0x80848e, 0x5a5e6a, 0x2a2c36]),
};

// ---------------------------------------------------------------- ores
export function copperOre(pc) {
  const sc = new Scene(32);
  const RR = ROCK.taupe();
  const rock = hostRock(sc, rockMat(RR, 5, { amp: 0.4, pit: 0.035, speck: 0.02 }), 101, [
    { x: 17, y: 18, a: 12, c: 8, h: 12, yaw: 0.35 },
    { x: 7.5, y: 22.5, a: 5.5, c: 4.5, h: 6.5, z: 3, yaw: 0.9 },
  ]);
  const CU = RAMP.copper();
  const cu = material(CU, { spec: 0.93, shine: 14, grad: 0.05, tex: stoneTex(9, { amp: 0.25, pit: 0.05, speck: 0 }) });
  const nug = (x, y, a, b, c, seed, yaw = 0, n = 9) => sc.chunk(cu, makeRng(seed), { x, y, a, b, c, n, jag: 0.3, base: 0.75, yaw, on: true, embed: c * 0.12, smooth: 0.2 });
  nug(13, 11.5, 6, 4.4, 4.6, 7, 0.5, 12);
  nug(21.5, 14, 4, 3.2, 3.4, 8, -0.4, 10);
  nug(7.5, 19, 3, 2.4, 2.6, 9, 0.2, 8);
  nug(24.5, 21, 2.3, 2, 2.1, 10, 0.8, 7);
  sc.render(pc);
  // malachite crusts (banded) on the rock
  const MA = RAMP.malachite();
  const MB = rampOf([MA[1], MA[1], MA[2], MA[3], MA[4], MA[5], MA[6]]);
  recolor(pc, sc, rock, (x, y) => {
    const inA = blot(10, 16.5, 3.4, 3)(x, y), inB = blot(19.5, 20.5, 3.4, 4)(x, y), inC = blot(13, 24, 2.2, 6)(x, y);
    if (!(inA || inB || inC)) return false;
    const cx = inA ? 10 : inB ? 19.5 : 13, cy = inA ? 16.5 : inB ? 20.5 : 24;
    return Math.floor(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) * (S > 1 ? 1.5 : 0.9)) % 2 ? MA : MB;
  });
  specks(pc, sc, rock, 0.035, [CU[2], CU[3]], 13);
  glint(pc, 10, 8, 1, 0xffffff, CU[1]);
}

export function tinOre(pc) {
  const sc = new Scene(32);
  const RR = ROCK.brown();
  const rock = hostRock(sc, rockMat(RR, 6), 202, [
    { x: 15.5, y: 18.5, a: 12.5, c: 8, h: 11, yaw: -0.3 },
    { x: 24, y: 22, a: 5.5, c: 5, h: 7, z: 3, yaw: 0.6 },
  ]);
  // tin: blocky silver crystals with pyramid caps
  const TN = RAMP.tin();
  const tin = material(TN, { grad: 0.04, gap: 1.2 });
  const xtal = (x, y, ang, len, r, tw = 0.5) => {
    const z = sc.zD(x, y);
    sc.prism(tin, { b: [x, y, z - 1.2], d: [Math.cos(ang) * 0.75, Math.sin(ang) * 0.75, 0.66], len, r, tip: r * 1.1, sides: 4, twist: tw });
  };
  xtal(11.5, 13.5, -2.25, 9, 2.7, 0.3);
  xtal(16, 12.5, -1.45, 12, 3.1, 0.8);
  xtal(21, 14, -0.75, 8.5, 2.5, 0.1);
  xtal(8.5, 19.5, -2.7, 6, 2, 0.6);
  xtal(24, 19.5, -0.35, 5.5, 1.8, 0.2);
  sc.render(pc);
  // dark cassiterite grains and a tarnish halo
  const DK = rampOf([0x8a7468, 0x6a5450, 0x4e3c3c, 0x3a2a2e, 0x2a1e24, 0x1c1418, 0x0c080c]);
  recolor(pc, sc, rock, (x, y) => hash2(x, y, 31) < 0.06 || (blot(16, 17, 6.5, 5)(x, y) && hash2(x, y, 32) < 0.25), DK);
  glint(pc, 15, 4, 1, 0xffffff, TN[1]);
}

export function ironOre(pc) {
  const sc = new Scene(32);
  const RR = ROCK.red();
  const rock = hostRock(sc, rockMat(RR, 7, { amp: 0.35 }), 303, [
    { x: 15.5, y: 17.5, a: 13, c: 8.5, h: 13, yaw: 0.25, n: [6, 5, 4] },
    { x: 8, y: 23, a: 5.5, c: 4.5, h: 6, z: 3.5, yaw: -0.5 },
  ]);
  sc.render(pc);
  // banded iron formation: steel-grey hematite and red jasper layers
  const HE = RAMP.hematite(), JA = RAMP.jasper();
  const HD = rampOf([HE[2], HE[3], HE[4], HE[5], HE[5], HE[6], HE[6]]);
  recolor(pc, sc, rock, (x, y) => {
    const v = y * 0.95 - x * 0.28 + Math.sin(x * 0.38 + 1.3) * 1.5 + (vnoise(x * 0.3, y * 0.3, 2) - 0.5) * 2.2;
    const b = ((v % 6.5) + 6.5) % 6.5;
    if (b < 0.9) return HD;
    if (b < 3.4) return HE;
    return JA;
  });
  // metallic glints in the grey bands, rust weeping from the top
  const RU = RAMP.rust();
  specks(pc, sc, rock, 0.07, [HE[0], HE[1]], 41, (x, y, k, X, Y) => k <= 3 && HE.includes(pc.getHex(X, Y)));
  recolor(pc, sc, rock, (x, y) => blot(20, 10, 4.5, 8)(x, y) && hash2(x, y, 9) < 0.55, RU);
  glint(pc, 10, 13, 1, 0xffffff, HE[1]);
  glint(pc, 23, 17, 1, 0xffffff, HE[1]);
}

export function silverOre(pc) {
  const sc = new Scene(32);
  const RR = ROCK.slate();
  const rock = hostRock(sc, rockMat(RR, 8), 404, [
    { x: 16, y: 18, a: 13, c: 8.5, h: 12, yaw: -0.2 },
    { x: 25, y: 22.5, a: 5, c: 4.5, h: 6, z: 3, yaw: 0.7 },
  ]);
  const SR = RAMP.silver();
  const ag = material(SR, { spec: 0.9, shine: 12, grad: 0.05 });
  sc.chunk(ag, makeRng(5), { x: 19, y: 12, a: 4.6, b: 3.4, c: 3.8, n: 11, jag: 0.35, base: 0.75, on: true, embed: 0.5, smooth: 0.3 });
  sc.chunk(ag, makeRng(6), { x: 23.5, y: 15.5, a: 2.4, b: 2, c: 2.2, n: 8, jag: 0.3, base: 0.75, on: true, embed: 0.3, smooth: 0.25 });
  sc.render(pc);
  // native silver wires: forked, curling veins
  const rng = makeRng(77);
  vein(pc, sc, rock, [[3.5, 22], [7, 19.5], [10, 18.5], [12.5, 16], [15.5, 15], [17.5, 13]], (x) => (x < 8 ? 0.9 : 1.25), SR, { lift: -2 });
  vein(pc, sc, rock, [[10, 18.5], [11, 21.5], [13.5, 23.5], [16.5, 24.5]], 0.8, SR, { lift: -2 });
  vein(pc, sc, rock, [[12.5, 16], [10.5, 13], [11.5, 10.5]], 0.75, SR, { lift: -2 });
  vein(pc, sc, rock, wander(rng, 22, 18, 0.5, 4, 1.5, 0.5), 0.7, SR, { lift: -2 });
  vein(pc, sc, rock, [[16.5, 24.5], [19, 22.5], [21, 22.5]], 0.6, SR, { lift: -2 });
  specks(pc, sc, rock, 0.03, [SR[2]], 17);
  glint(pc, 17, 9, 2, 0xffffff, SR[1]);
  glint(pc, 7, 19, 1, 0xffffff, SR[1]);
}

export function goldOre(pc) {
  const sc = new Scene(32);
  const QZ = ROCK.quartz();
  const rock = hostRock(sc, rockMat(QZ, 9, { amp: 0.4, pit: 0.03 }), 505, [
    { x: 16, y: 18.5, a: 12.5, c: 8, h: 11.5, yaw: 0.4 },
    { x: 7.5, y: 21.5, a: 5.5, c: 5, h: 7.5, z: 3, yaw: -0.4 },
  ]);
  const AU = RAMP.gold();
  const au = material(AU, { spec: 0.88, shine: 10, grad: 0.05, tex: stoneTex(4, { amp: 0.25, pit: 0.04, speck: 0 }) });
  const nug = (x, y, a, b, c, seed, yaw = 0, n = 9) => sc.chunk(au, makeRng(seed), { x, y, a, b, c, n, jag: 0.34, base: 0.75, yaw, on: true, embed: c * 0.14, smooth: 0.32 });
  nug(13.5, 12, 6, 4.4, 4.6, 21, 0.3, 13);
  nug(22, 17, 4, 3.2, 3.4, 22, -0.6, 11);
  nug(7.5, 18.5, 2.8, 2.3, 2.5, 23, 0.4, 8);
  nug(20.5, 9.5, 2.2, 1.8, 2, 24, 0.1, 7);
  sc.render(pc);
  // limonite (rusty) staining in the quartz and a scatter of gold flecks
  const LI = rampOf([0xfff0d8, 0xf0c890, 0xd29a5a, 0xae7240, 0x84522e, 0x5a3622, 0x2a1810]);
  recolor(pc, sc, rock, (x, y) => (blot(10, 21, 4, 3)(x, y) || blot(24, 22, 3.4, 5)(x, y)) && hash2(x, y, 6) < 0.7, LI);
  specks(pc, sc, rock, 0.045, [AU[1], AU[2]], 19);
  glint(pc, 11, 9, 2, 0xffffff, AU[1]);
  glint(pc, 20, 15, 1, 0xffffff, AU[1]);
}

export function mithrilOre(pc) {
  const sc = new Scene(32);
  const RR = ROCK.blue();
  const rock = hostRock(sc, rockMat(RR, 10), 606, [
    { x: 16, y: 18.5, a: 13, c: 8.5, h: 12, yaw: 0.2 },
    { x: 7.5, y: 23, a: 5, c: 4.5, h: 6, z: 3, yaw: 0.9 },
  ]);
  const MR = RAMP.mithril();
  const mi = material(MR, { eq: 0.55, grad: 0.05, ridgeAll: true, gap: 1.4, glow: (c) => (c.k <= 2 ? 0.6 : 0.3) });
  for (const [x, y, dx, dy, len, r, tw] of [[18, 12, 0.35, -1, 9, 2.1, 0.4], [21, 13.5, 0.9, -0.8, 6.5, 1.7, 0.1], [15, 12.5, -0.45, -1, 6, 1.6, 0.7], [19.5, 15, 0.2, -0.6, 4, 1.3, 0.2]]) {
    const z = sc.zD(x, y);
    sc.prism(mi, { b: [x, y, z - 1.2], d: [dx, dy, 0.45], len, r, tip: r * 1.7, sides: 6, twist: tw });
  }
  sc.render(pc);
  // one glassy cyan vein winding round the rock, with iridescent flecks
  const iri = (x, y) => (hash2(x, y, 7) < 0.16 ? (hash2(x, y, 8) < 0.5 ? 0xffd2f4 : 0xd2fff0) : null);
  const h1 = vein(pc, sc, rock, [[3, 20], [7, 21], [10.5, 19], [13.5, 20.5], [17, 19.5], [20, 21.5], [23.5, 20], [28, 21.5]], (x) => 0.75 + 0.45 * Math.sin(x * 0.45 + 1), MR, { lift: -1, emit: 0.35 });
  const h2 = vein(pc, sc, rock, [[10.5, 19], [9, 16], [10, 13.5]], 0.6, MR, { lift: -1, emit: 0.35 });
  for (const [x, y] of [...h1, ...h2]) { const c = iri(x, y); if (c) { pc.set(x, y, c); pc.emit(x, y, 0.5); } }
  glint(pc, 19, 5, 1, 0xffffff, MR[1], 0.8);
  glint(pc, 7, 20, 1, 0xffffff, MR[1], 0.8);
}

export function moonsilverOre(pc) {
  const sc = new Scene(32);
  const RR = ROCK.night();
  const rock = hostRock(sc, rockMat(RR, 11), 707, [
    { x: 16, y: 18, a: 14, c: 9, h: 14, yaw: -0.35 },
    { x: 26, y: 23.5, a: 4.5, c: 4, h: 5.5, z: 3, yaw: 0.4 },
  ]);
  const MR = RAMP.moon();
  const mo = material(MR, { spec: 0.9, shine: 10, grad: 0.05, glow: 0.5 });
  sc.chunk(mo, makeRng(48), { x: 22, y: 12.5, a: 3, b: 2.4, c: 2.6, n: 9, jag: 0.25, base: 0.75, on: true, embed: 0.4, smooth: 0.5 });
  sc.chunk(mo, makeRng(49), { x: 8, y: 22, a: 2.1, b: 1.7, c: 1.9, n: 8, jag: 0.2, base: 0.75, on: true, embed: 0.3, smooth: 0.5 });
  sc.render(pc);
  // a crescent of moon-metal set into the rock face: thick in the middle, tapering to points
  const arc = [];
  const CX = 18, CY = 17.5, RA = 5.6, A0 = 1.75, SPAN = 2.9;
  for (let i = 0; i <= 14; i++) { const a = A0 + (i / 14) * SPAN; arc.push([CX + Math.cos(a) * RA, CY + Math.sin(a) * RA * 0.92]); }
  const wid = (x, y) => { const a = Math.atan2(y + 0.5 - CY, x + 0.5 - CX); const t = (((a - A0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / SPAN; return 0.35 + 1.9 * Math.sin(Math.max(0, Math.min(1, t)) * Math.PI); };
  vein(pc, sc, rock, arc, wid, MR, { lift: -2, emit: 0.85 });
  // moonlight spilling onto the rock beside it
  recolor(pc, sc, rock, (x, y, k) => {
    const d = Math.abs(Math.hypot(x + 0.5 - CX, y + 0.5 - CY) - RA);
    const a = Math.atan2(y + 0.5 - CY, x + 0.5 - CX);
    const inArc = ((a - A0 + Math.PI * 4) % (Math.PI * 2)) < SPAN;
    return inArc && d > 2 && d < 3.4 && k > 1 && hash2(x, y, 3) < 0.45;
  }, rampOf([RR[0], RR[0], RR[0], RR[1], RR[2], RR[3], RR[6]]));
  specks(pc, sc, rock, 0.025, [MR[2]], 29, null, 0.6);
  glint(pc, 13, 14, 1, 0xffffff, MR[1], 1);
  glint(pc, 21, 10, 1, 0xffffff, MR[1], 1);
  glint(pc, 27, 7, 0, 0xe8e8ff, MR[2], 0.8);
}

export function adamantOre(pc) {
  const sc = new Scene(32);
  const RR = ROCK.char();
  const rock = hostRock(sc, rockMat(RR, 12), 808, [
    { x: 16, y: 21, a: 13, c: 8, h: 10, yaw: 0.3 },
  ]);
  const AR = RAMP.adamant();
  const ad = material(AR, { grad: 0.05, ridgeAll: true });
  // sharp green blades jutting from the rock at angles
  const blade = (x, y, ax, ay, az, len, r, tw) => {
    const z = sc.zD(x, y);
    sc.prism(ad, { b: [x, y, z - 1.5], d: [ax, ay, az], len, r, tip: len * 0.45, sides: 4, twist: tw, squash: 0.55 });
  };
  blade(13.5, 18, -0.15, -1, 0.35, 17, 2.8, 0.2);
  blade(19, 18.5, 0.45, -1, 0.3, 12, 2.3, 0.9);
  blade(8.5, 20.5, -0.75, -1, 0.4, 9, 1.9, 0.5);
  blade(23, 21.5, 1, -0.55, 0.5, 6.5, 1.6, 0.1);
  sc.render(pc);
  specks(pc, sc, rock, 0.03, [AR[3]], 23);
  glint(pc, 12, 3, 1, 0xffffff, AR[1]);
}

export function starmetalOre(pc) {
  const sc = new Scene(32);
  const CR = RAMP.crust();
  const crust = material(CR, { tex: stoneTex(14, { amp: 0.45, sx: 0.6, sy: 0.6, pit: 0.08, speck: 0.04 }) });
  const rng = makeRng(909);
  const body = sc.chunk(crust, rng, { x: 16, y: 16.5, a: 15.5, b: 13.5, c: 11, n: 11, jag: 0.1, base: 0.62, p: 0.7, yaw: 0.4 });
  sc.render(pc);
  // regmaglypts: thumbprint dimples (dark lip top-left, lit lip bottom-right)
  for (const [x, y, r] of [[6, 21, 1.6], [25, 8, 1.4], [26, 17, 1.7], [15, 25.5, 1.5], [5, 13, 1.3], [21, 25, 1.4], [9, 6.5, 1.2]]) {
    if (sc.objD(x, y) !== body.id) continue;
    for (let Y = np(y - r - 1); Y <= np(y + r + 1); Y++) for (let X = np(x - r - 1); X <= np(x + r + 1); X++) {
      if (sc.objAt(X, Y) !== body.id) continue;
      const dx = (X + 0.5) / S - x, dy = (Y + 0.5) / S - y, d = Math.hypot(dx, dy * 1.25);
      if (d > r) continue;
      const side = dx * 0.6 + dy * 0.8; // + = toward the bottom-right
      const k = sc.k[Y * sc.w + X];
      if (d > r - 0.6) pc.set(X, Y, CR[side < 0 ? 5 : 2]);
      else pc.set(X, Y, CR[Math.min(5, Math.max(3, k + (side < 0 ? 1 : 0)))]);
    }
  }
  // the polished, etched window: a sawn face with a Widmanstätten lattice and bevelled lips
  const win = [[10, 11.5], [17, 9.5], [22.5, 12.5], [20.5, 19.5], [12.5, 20]];
  const inW = (X, Y) => sc.objAt(X, Y) === body.id && inPoly(win, (X + 0.5) / S, (Y + 0.5) / S);
  const KA = RAMP.kamacite();
  const lw = S > 1 ? 0.75 : 1.1; // lamella width (design px): finer bands at higher resolution
  for (let Y = 0; Y < sc.h; Y++) for (let X = 0; X < sc.w; X++) {
    if (!inW(X, Y)) continue;
    const x = dc(X), y = dc(Y);
    const a = ((x * 0.5 + y * 0.87 + 0.3) % 4.2 + 4.2) % 4.2, b = ((x * 0.5 - y * 0.87 + 60.3) % 4.2 + 4.2) % 4.2;
    const c3 = ((x * 1.0 + 0.1) % 4.2 + 4.2) % 4.2; // third lamella set (only visible at S > 1)
    let k = (x + y) < 31 ? 3 : 4;
    if (a < lw && b < lw) k = 0;
    else if (a < lw) k = 1;
    else if (b < lw) k = 2;
    else if (S > 1 && c3 < 0.5) k = Math.max(1, k - 1);
    else if (S > 1 && hash2(X, Y, 61) < 0.05) k = Math.min(5, k + 1); // plessite grain
    const tl = !inW(X - 1, Y) || !inW(X, Y - 1), br = !inW(X + 1, Y) || !inW(X, Y + 1);
    if (tl && !br) k = 1;
    else if (br) k = 5;
    else if (S > 1 && (!inW(X + 2, Y) || !inW(X, Y + 2))) k = 4; // a second step on the shaded bevel
    pc.set(X, Y, KA[k]);
  }
  // star-hot specks
  for (let i = 0; i < 40 * S; i++) {
    const x = rng.range(3, 29), y = rng.range(5, 29), X = np(x), Y = np(y);
    if (sc.objAt(X, Y) !== body.id || inW(X, Y) || hash2(X, Y, 3) > 0.35) continue;
    pc.set(X, Y, hash2(X, Y, 4) < 0.5 ? 0xffe08a : 0xffb040); pc.emit(X, Y, 1);
    if (S > 1 && hash2(X, Y, 5) < 0.3 && sc.objAt(X + 1, Y) === body.id) { pc.set(X + 1, Y, 0xc86a20); pc.emit(X + 1, Y, 0.6); }
  }
  glint(pc, 11, 12, 2, 0xffffff, 0xffe8a0, 1);
  glint(pc, 25, 21, 1, 0xfffbe8, 0xffd060, 1);
}
