// In-rock ore deposits: one painter per ore habit. Each returns a PixelCanvas (sized to the
// deposit, transparent = host rock) plus a `stain` mask of pixels that are only discoloured
// rock (tarnish halos, frost rime, matrix specks) rather than part of the ore body.
// MineSprites.oreBlob() turns this into the indexed {w, h, pal, idx, glow} format.
import { makeRng, hashStr } from '../../core/util.js';
import { PixelCanvas } from './canvas.js';
import { mat } from './color.js';
import { Mask, vol, fill, sparkle, hash2, vnoise, bayer } from './shade.js';
import { ring, prism, lineIn, toneFor } from './parts.js';

const gl = (pc, x, y, c, g = 1) => { if (!pc.inb(x | 0, y | 0)) return; pc.set(x, y, c); pc.emit(x, y, g); };

/** Deposit canvas + helpers bound to it. */
function canvas(w, h) {
  const pc = new PixelCanvas(w, h);
  pc.stain = new Mask(w, h);
  pc.M = () => new Mask(w, h);
  return pc;
}
/** Paint stain (rock discolouration) pixels: dithered, never over the ore body. */
function stain(pc, x, y, c, g = 0) {
  x |= 0; y |= 0;
  if (!pc.inb(x, y) || pc.alpha(x, y)) return;
  pc.set(x, y, c);
  if (g) pc.emit(x, y, g);
  pc.stain.set(x, y);
}
/** Halo of stain pixels around the current ore body: density falls off over `r` px. */
function haloAround(pc, cols, r = 3, dens = 0.55, seed = 1, g = 0) {
  const body = new Mask(pc.w, pc.h).fn((x, y) => pc.alpha(x, y) > 0);
  const dist = new Float32Array(pc.w * pc.h).fill(99);
  body.each((x, y) => { dist[y * pc.w + x] = 0; });
  for (let k = 1; k <= r; k++) {
    for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
      if (dist[y * pc.w + x] < 99) continue;
      const n = (xx, yy) => (xx >= 0 && yy >= 0 && xx < pc.w && yy < pc.h ? dist[yy * pc.w + xx] : 99);
      if (Math.min(n(x - 1, y), n(x + 1, y), n(x, y - 1), n(x, y + 1)) === k - 1) dist[y * pc.w + x] = k;
    }
  }
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const d = dist[y * pc.w + x];
    if (d < 1 || d > r) continue;
    const p = dens * (1 - (d - 1) / r);
    if (hash2(x, y, seed) < p) stain(pc, x, y, cols[Math.floor(hash2(x, y, seed + 7) * cols.length)], g);
  }
}
/** Lumpy blob mask from overlapping ellipses around (cx, cy). */
function lumps(pc, rng, cx, cy, rx, ry, n = 4, k = 0.55) {
  const m = pc.M().ellipse(cx, cy, rx, ry);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    m.ellipse(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k, rx * rng.range(0.35, 0.6), ry * rng.range(0.35, 0.6));
  }
  return m;
}
const nugget = (pc, m, R, o = {}) => { ring(pc, m, R, o.ring || {}); vol(pc, m, R, { spec: o.spec ?? 0.78, shine: 12, bounce: true, emit: o.emit, round: o.round }); return m; };

// ---------------------------------------------------------------- habits
const HABITS = {
  coal(rng) {
    // a lenticular seam with bedding lines and glassy conchoidal glints
    const w = rng.int(20, 28), h = rng.int(9, 13);
    const pc = canvas(w + 2, h + 2);
    const R = [0xd8e0f8, 0x8a90ae, 0x55566c, 0x34323e, 0x24202c, 0x16121c, 0x0c080e];
    const m = pc.M().fn((x, y) => {
      const u = (x + 0.5 - (w + 2) / 2) / (w / 2), v = (y + 0.5 - (h + 2) / 2) / (h / 2);
      const t = 1 - u * u;
      return t > 0 && Math.abs(v + Math.sin(u * 2.4 + 1) * 0.15) < Math.pow(t, 0.6) * (0.85 + 0.15 * vnoise(x * 0.4, 0, 3));
    });
    ring(pc, m, R, { lit: R[5], dark: R[6] });
    vol(pc, m, R, { round: 3, max: 5, min: 2 });
    m.each((x, y) => { if ((y + Math.floor(x / 7)) % 4 === 0 && hash2(x, y, 2) < 0.8) pc.set(x, y, R[5]); });
    for (let i = 0; i < 4; i++) { const x = rng.int(3, w - 3), y = rng.int(2, h - 2); if (m.get(x, y) && m.get(x + 1, y)) { pc.set(x, y, R[1]); pc.set(x + 1, y, R[2]); pc.set(x, y + 1, R[3]); } }
    if (m.get(4, (h + 2) >> 1)) pc.set(4, (h + 2) >> 1, R[0]);
    return pc;
  },
  copper_ore(rng) {
    const s = rng.int(13, 19);
    const pc = canvas(s + 6, s + 6);
    const c = (s + 6) / 2;
    const CU = mat(0xd46f3c, { cont: 1.2, warm: 30 }); CU[0] = 0xffe2c8; CU[1] = 0xffad78;
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(0, 1), d = i === 0 ? 0 : rng.range(3, s * 0.36);
      const r = i === 0 ? rng.range(3.4, 4.6) : rng.range(1.6, 3);
      nugget(pc, lumps(pc, rng, c + Math.cos(a) * d, c + Math.sin(a) * d, r * 1.15, r, 2, 0.5), CU);
    }
    haloAround(pc, [0x3fae6a, 0x2f8a52, 0x5ac88a, 0x3a9a8a], 3, 0.6, 5);
    return pc;
  },
  tin_ore(rng) {
    const s = rng.int(15, 21);
    const pc = canvas(s + 4, s + 4);
    const TR = mat(0xc4c9cc, { cont: 1.15, hs: 0.5, sat: 0.6 });
    const c = (s + 4) / 2;
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, Math.PI * 2), d = i === 0 ? 0 : rng.range(1, s * 0.34), r = rng.range(2.4, 3.8);
      const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d, ang = rng.range(-0.8, 0.8);
      const m = pc.M().oval(x, y, r, r * 0.6, ang);
      ring(pc, m, TR, { lit: TR[4], dark: TR[5] });
      m.each((X, Y) => pc.set(X, Y, TR[(Y + 0.5 - y) < -r * 0.15 ? 2 : (X + 0.5 - x) > r * 0.3 ? 4 : 3]));
      pc.set(x - r * 0.3, y - r * 0.3, TR[1]);
    }
    haloAround(pc, [0x4a3424, 0x6a4c34], 2, 0.35, 9);
    return pc;
  },
  salt_crystal(rng) {
    const s = rng.int(12, 18);
    const pc = canvas(s + 4, s + 4);
    const SR = mat(0xf0cfcd, { cont: 1.25, hs: 1.1 });
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const k = rng.int(4, 7), x = rng.int(1, s + 3 - k), y = rng.int(1, s + 3 - k);
      const m = pc.M().rect(x, y, k, k);
      ring(pc, m, SR);
      m.each((X, Y) => {
        const u = X - x, v = Y - y;
        pc.set(X, Y, SR[u === 0 || v === 0 ? 1 : u === k - 1 || v === k - 1 ? 4 : (u + v) % 3 === 0 ? 2 : 3]);
      });
      pc.set(x, y, SR[0]);
    }
    haloAround(pc, [0xe8d8d8, 0xd8c0c0], 1, 0.3, 4);
    return pc;
  },
  fossil(rng) {
    const kind = rng.int(0, 2);
    if (kind === 0) {
      // ammonite
      const r = rng.range(8, 12);
      const W = Math.ceil(r * 2 + 3);
      const pc = canvas(W, W);
      const SH = mat(0xe2cca4, { cont: 1.35, hs: 0.6, sat: 0.9 });
      const cx = W / 2, cy = W / 2;
      const b = 0.115, a0 = r / Math.exp(b * Math.PI * 2 * 3.05);
      const m = pc.M().disk(cx, cy, r);
      ring(pc, m, SH);
      const flip = rng.chance(0.5) ? 1 : -1;
      m.each((x, y) => {
        const dx = (x + 0.5 - cx) * flip, dy = y + 0.5 - cy;
        const rr = Math.max(0.6, Math.hypot(dx, dy));
        const th = Math.atan2(dy, dx) + Math.PI;
        const w = Math.log(rr / a0) / b / (Math.PI * 2) - th / (Math.PI * 2);
        const u = w - Math.floor(w);
        const turn = Math.floor(w) + th / (Math.PI * 2);
        const rib = ((turn * 14) % 1 + 1) % 1 < 0.38;
        const lit = (x + 0.5 - cx) * -0.6 + dy * -0.8 > 0;
        let k = u < 0.16 ? 6 : u < 0.42 ? (lit ? 1 : 2) : u < 0.78 ? 3 : 4;
        if (rib && k > 1 && k < 6) k -= 1;
        pc.set(x, y, SH[k]);
      });
      return pc;
    }
    if (kind === 1) {
      // fish skeleton: spine, ribs, skull, tail
      const L = rng.int(24, 34), H = rng.int(11, 14);
      const pc = canvas(L + 2, H + 2);
      const B = mat(0xe8dcc0, { cont: 1.1, sat: 0.7 });
      const cy = (H + 2) / 2;
      const bone = pc.M();
      bone.capsule(5, cy, L - 5, cy, 0.8);
      for (let x = 8; x < L - 7; x += 2.5) { const t = (x - 8) / (L - 15); const hh = (1 - Math.abs(t - 0.35) * 1.3) * (H / 2 - 1.5); bone.line(x, cy, x - 1.5, cy - hh); bone.line(x, cy, x - 1.5, cy + hh); }
      bone.ellipse(L - 4.5, cy, 3.6, H * 0.32);
      bone.poly([[5, cy], [1, cy - H * 0.35], [2.5, cy], [1, cy + H * 0.35]]);
      ring(pc, bone, B, { lit: B[5] });
      fill(pc, bone, B[2]);
      bone.each((x, y) => { if (!bone.get(x, y - 1)) pc.set(x, y, B[1]); else if (!bone.get(x, y + 1)) pc.set(x, y, B[4]); });
      pc.set(L - 4, cy - 1, B[6]);
      return pc;
    }
    // trilobite: segmented oval with a head shield
    const W = rng.int(14, 18), Hh = rng.int(18, 24);
    const pc = canvas(W + 2, Hh + 2);
    const B = mat(0x8a7a62, { cont: 1.2 });
    const cx = (W + 2) / 2;
    const body = pc.M().ellipse(cx, (Hh + 2) / 2 + 1, W / 2, Hh / 2 - 1);
    const head = pc.M().ellipse(cx, 5, W / 2 + 0.5, 4.5);
    const all = body.clone().union(head);
    ring(pc, all, B);
    vol(pc, all, B, { round: 3 });
    for (let y = 9; y < Hh; y += 2) for (let x = 0; x < W + 2; x++) if (body.get(x, y)) pc.set(x, y, B[4]);
    for (let y = 3; y < Hh; y++) { if (all.get(cx - 2.5, y)) pc.set(cx - 2.5, y, B[2]); if (all.get(cx + 2, y)) pc.set(cx + 2, y, B[4]); }
    pc.set(cx - 3, 4, B[6]); pc.set(cx + 2, 4, B[6]);
    return pc;
  },
  quartz(rng) {
    const W = rng.int(16, 22), H = rng.int(16, 22);
    const pc = canvas(W, H);
    const QR = mat(0xe2e6f0, { cont: 1.3, hs: 0.6 });
    const up = -Math.PI / 2 + rng.range(-0.5, 0.5);
    const bx = W / 2, by = H - 3;
    const n = rng.int(3, 5);
    // white druzy base
    const base = pc.M().ellipse(bx, by, W * 0.38, 2.6);
    ring(pc, base, QR); base.each((x, y) => pc.set(x, y, hash2(x, y, 2) < 0.5 ? QR[1] : QR[2]));
    for (let i = 0; i < n; i++) {
      const a = up + (i - (n - 1) / 2) * 0.38 + rng.range(-0.12, 0.12);
      const len = (i === Math.floor(n / 2) ? 1 : rng.range(0.55, 0.85)) * (H - 4);
      prism(pc, { x: bx + (i - (n - 1) / 2) * 2.4, y: by, a, len, w: rng.range(3.6, 5), tip: 3.4, R: QR, base: 0.35 });
    }
    return pc;
  },
  iron_ore(rng) {
    const w = rng.int(16, 24), h = rng.int(12, 18);
    const pc = canvas(w + 2, h + 2);
    const HE = mat(0x5c5a66, { cont: 1.25 }), JA = mat(0xa8402c, { cont: 1 }), DK = mat(0x2e2226);
    const m = lumps(pc, rng, (w + 2) / 2, (h + 2) / 2, w / 2 - 1, h / 2 - 1, 4, 0.5);
    ring(pc, m, HE);
    const ph = rng.range(0, 6);
    vol(pc, m, HE, { round: 3 });
    m.each((x, y) => {
      const k = HE.indexOf(pc.getHex(x, y));
      const v = y * 0.9 + x * 0.3 + Math.sin(x * 0.45 + ph) * 1.4;
      const b = ((v % 6) + 6) % 6;
      const T = b < 0.9 ? DK : b < 3.2 ? HE : JA;
      if (k >= 0) pc.set(x, y, T[Math.max(1, Math.min(5, k))]);
      if (T === HE && k === 2 && hash2(x, y, 3) < 0.3) pc.set(x, y, HE[0]);
    });
    haloAround(pc, [0xc06a2c, 0xa0522a, 0xd88a40], 3, 0.55, 7);
    return pc;
  },
  amber(rng) { return amberBlob(rng, false); },
  amber_bug(rng) { return amberBlob(rng, true); },
};

/** Amber: a glossy golden blob with an inner glow and bubbles (or a trapped beetle). */
function amberBlob(rng, bug) {
  const w = rng.int(10, 15), h = rng.int(11, 16);
  const pc = canvas(w + 2, h + 2);
  const R = mat(0xf0a028, { cont: 1.1, warm: 55 });
  const m = lumps(pc, rng, (w + 2) / 2, (h + 2) / 2, w / 2 - 0.5, h / 2 - 0.5, 2, 0.35);
  nugget(pc, m, R, { spec: 0.84, round: 3 });
  // inner glow from the far side + tiny bubbles (or a trapped bug)
  const edge = m.edge();
  m.each((x, y) => { if (x + y > w * 0.7 + h * 0.7 && !edge.get(x, y)) { const k = R.indexOf(pc.getHex(x, y)); if (k > 2) pc.set(x, y, R[k - 1]); } });
  const cx = Math.floor((w + 2) / 2), cy = Math.floor((h + 2) / 2);
  if (bug) {
    // a tiny beetle trapped inside: body, head, legs
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]) pc.set(cx + dx, cy + dy, 0x3a1c0c);
    pc.set(cx, cy - 1, 0x5a2c10); pc.set(cx + 1, cy - 1, 0x5a2c10);
    for (const [dx, dy] of [[-1, 0], [2, 0], [-1, 2], [2, 2]]) pc.set(cx + dx, cy + dy, 0x7a4418);
  } else for (const [dx, dy] of [[-2, -1], [2, 1], [0, 2]]) { if (m.get(cx + dx, cy + dy)) { pc.set(cx + dx, cy + dy, R[1]); pc.set(cx + dx + 1, cy + dy, R[2]); } }
  return pc;
}

Object.assign(HABITS, {
  lumite(rng) { return crystalCluster(rng, mat(0x7bf08a, { cont: 1.05 }), { glow: 0.85, core: 0xf4fff0, size: [14, 22] }); },
  silver_ore(rng) {
    const w = rng.int(18, 28), h = rng.int(12, 20);
    const pc = canvas(w, h);
    const SR = mat(0xd8dde8, { cont: 1.3, hs: 1.2 });
    const r2 = makeRng(rng.int(0, 1e6));
    const branch = (x, y, a, len, th, depth) => {
      let X = x, Y = y;
      for (let i = 0; i < len; i++) {
        X += Math.cos(a) * 0.9; Y += Math.sin(a) * 0.9;
        a += r2.range(-0.3, 0.3);
        if (X < 1 || Y < 1 || X > w - 2 || Y > h - 2) return;
        if (th > 1) pc.set(X + 0.7, Y + 0.7, SR[4]);
        pc.set(X, Y, th > 1 ? SR[2] : SR[3]);
        if (th > 1) pc.set(X - 0.6, Y - 0.6, SR[1]);
        if (depth < 3 && i > 2 && r2.chance(0.24)) branch(X, Y, a + r2.pick([-0.9, 0.9]), Math.floor(len * 0.55), 1, depth + 1);
      }
      pc.set(X, Y, SR[0]);
    };
    branch(2, h * 0.7, -0.35 + rng.range(-0.2, 0.2), w - 4, 2, 0);
    branch(w * 0.4, h - 2, -1.2, h - 3, 1, 1);
    haloAround(pc, [0x2a2830, 0x3a3844, 0x1e1c24], 2, 0.4, 3);
    return pc;
  },
  echo_crystal(rng) {
    const pc = crystalCluster(rng, mat(0xb4c4ff, { cont: 1.1, hs: 0.6 }), { core: 0xf0f8ff, size: [16, 24], slim: true });
    // faint resonance rings in the rock
    const cx = pc.w / 2, cy = pc.h - 3;
    for (let r = 4; r < Math.max(pc.w, pc.h); r += 3) for (let a = 0; a < Math.PI * 2; a += 0.04) {
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8;
      if (bayer(x | 0, y | 0) < 0.35) stain(pc, x, y, 0x9ab8d8);
    }
    return pc;
  },
  gravium(rng) {
    const pc = crystalCluster(rng, mat(0xc9a6ff, { cont: 1.1 }), { size: [14, 20], dir: -Math.PI / 2, pad: 6 });
    // chips that broke free and drift upward (still embedded higher up)
    const GR = mat(0xc9a6ff, { cont: 1.1 });
    for (let i = 0; i < 3; i++) {
      const x = rng.int(2, pc.w - 4), y = rng.int(1, 4);
      const m = pc.M().poly([[x, y + 2], [x + 1.5, y], [x + 3, y + 2], [x + 1.5, y + 3.5]]);
      ring(pc, m, GR); m.each((X, Y) => pc.set(X, Y, GR[X < x + 1.5 ? 1 : 3]));
    }
    return pc;
  },
  bioxide(rng) {
    const pc = crystalCluster(rng, mat(0x3fe0c8, { cont: 1.15, hs: 0.8 }), { glow: 0.9, core: 0xeafff8, size: [16, 24], jagged: true });
    // electric crackle in the surrounding rock
    for (let i = 0; i < 3; i++) {
      let x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1);
      for (let k = 0; k < 4; k++) { stain(pc, x, y, k % 2 ? 0xfff6a0 : 0xffffff, 1); x += rng.pick([-1, 1]); y += rng.pick([-1, 0, 1]); }
    }
    return pc;
  },
  amethyst(rng) {
    // geode: agate rind around a hollow full of violet points
    const r = rng.range(10, 15);
    const W = Math.ceil(r * 2 + 3);
    const pc = canvas(W, W);
    const c = W / 2;
    const rind = pc.M().ellipse(c, c, r, r * 0.92);
    const RI = mat(0x8a8494, { cont: 0.95 });
    ring(pc, rind, RI);
    vol(pc, rind, RI, { round: 3 });
    fill(pc, pc.M().ellipse(c, c, r - 1.4, r * 0.92 - 1.4), 0xece6f2);
    fill(pc, pc.M().ellipse(c, c, r - 2.3, r * 0.92 - 2.3), 0xb4a4c8);
    const cav = pc.M().ellipse(c, c, r - 3.2, r * 0.92 - 3.2);
    fill(pc, cav, 0x2a1440);
    const AR = mat(0xa05ad9, { cont: 1.1 });
    const n = Math.floor(r * 1.2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const rr = r - 3;
      prism(pc, { x: c + Math.cos(a) * rr, y: c + Math.sin(a) * rr * 0.92, a: a + Math.PI + rng.range(-0.25, 0.25), len: rng.range(3.5, r * 0.55), w: rng.range(2.6, 3.6), tip: 2.6, R: AR, base: 0.4, ringOpts: { lit: AR[6] }, glint: rng.chance(0.4) });
    }
    for (let i = 0; i < 3; i++) { const x = c + rng.range(-r * 0.4, r * 0.4), y = c + rng.range(-r * 0.4, r * 0.4); if (cav.get(x, y)) gl(pc, x, y, 0xffffff, 0.4); }
    return pc;
  },
  gold_ore(rng) {
    // fat nuggets in a white quartz vein, rusty limonite stain
    const w = rng.int(18, 26), h = rng.int(12, 18);
    const pc = canvas(w + 2, h + 2);
    const QZ = mat(0xe8e4dc, { cont: 0.9 });
    const vein = pc.M();
    const ang = rng.range(-0.5, 0.5);
    for (let t = -w / 2; t <= w / 2; t += 0.5) vein.disk((w + 2) / 2 + t, (h + 2) / 2 + t * ang * 0.5 + Math.sin(t * 0.5) * 1.2, h * 0.24 + Math.sin(t * 0.8) * 0.8);
    ring(pc, vein, QZ, { lit: QZ[4], dark: QZ[5] });
    vol(pc, vein, QZ, { round: 2 });
    const AU = mat(0xf2bc2c, { cont: 1.2, warm: 58 }); AU[0] = 0xfffbe0;
    const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * w * 0.7 + rng.range(-1.5, 1.5);
      const x = (w + 2) / 2 + t, y = (h + 2) / 2 + t * ang * 0.5 + rng.range(-1.5, 1.5);
      const r = i === Math.floor(n / 2) ? rng.range(3.2, 4.2) : rng.range(1.8, 3);
      nugget(pc, lumps(pc, rng, x, y, r * 1.1, r, 2, 0.45), AU, { spec: 0.72 });
    }
    haloAround(pc, [0xb07a3a, 0x9a6430, 0xc8904a], 2, 0.45, 11);
    return pc;
  },
  ruby(rng) { return corundum(rng, mat(0xd8243a, { cont: 1.2, hs: 1.3 }), [0xe8e0d8, 0xd0c8c0]); },
  sapphire(rng) { return corundum(rng, mat(0x2a5ade, { cont: 1.2 }), [0x9aa4b8, 0x7a8498]); },
  emerald(rng) {
    const W = rng.int(12, 18), H = rng.int(16, 22);
    const pc = canvas(W + 4, H + 4);
    const ER = mat(0x22c063, { cont: 1.25 });
    const a = -Math.PI / 2 + rng.range(-0.6, 0.6);
    prism(pc, { x: (W + 4) / 2, y: H + 2, a, len: H - 2, w: W * 0.55, tip: 2, flatTip: true, R: ER, base: 0.25, core: 0x9af0c0 });
    if (rng.chance(0.6)) prism(pc, { x: (W + 4) / 2 + 3, y: H + 2, a: a + 0.5, len: H * 0.55, w: W * 0.35, tip: 1.5, flatTip: true, R: ER, base: 0.25 });
    haloAround(pc, [0xc8c8d0, 0xe8e8f0, 0xa8a8b4], 2, 0.3, 13);
    return pc;
  },
  magmaite(rng) {
    const w = rng.int(14, 20), h = rng.int(12, 18);
    const pc = canvas(w + 4, h + 4);
    const CR = mat(0x3a2420, { cont: 0.85 });
    const m = lumps(pc, rng, (w + 4) / 2, (h + 4) / 2, w / 2 - 1, h / 2 - 1, 4, 0.5);
    ring(pc, m, CR);
    vol(pc, m, CR, { round: 3, min: 2 });
    // glowing crack network + molten heart
    const lava = [0xfff0a0, 0xffc040, 0xff7a2a, 0xd8481a];
    const cx = (w + 4) / 2, cy = (h + 4) / 2;
    for (let i = 0; i < 5; i++) {
      let a = rng.range(0, Math.PI * 2), x = cx, y = cy;
      for (let k = 0; k < Math.max(w, h) * 0.6; k++) {
        if (!m.get(x, y)) break;
        gl(pc, x, y, lava[Math.min(3, Math.floor(k / 3))], 1);
        x += Math.cos(a); y += Math.sin(a); a += rng.range(-0.6, 0.6);
      }
    }
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) gl(pc, cx + dx, cy + dy, dx || dy ? 0xffc040 : 0xfff8c0, 1);
    haloAround(pc, [0x6a2a1a, 0x8a3a1a], 2, 0.4, 3, 0.35);
    return pc;
  },
  frostite(rng) {
    const pc = crystalCluster(rng, mat(0xd4f6ff, { cont: 1.3, hs: 0.8 }), { glow: 0.45, size: [14, 22] });
    haloAround(pc, [0xffffff, 0xe0f6ff, 0xc8ecf8], 3, 0.6, 21, 0.2);
    return pc;
  },
  mithril_ore(rng) {
    const w = rng.int(20, 30), h = rng.int(10, 16);
    const pc = canvas(w, h);
    const MR = mat(0x9be0e6, { cont: 1.3, hs: 1.2 });
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const y0 = (i + 0.7) * h / (n + 0.4), amp = rng.range(1, 2.2), ph = rng.range(0, 6), wd = i === 0 ? 1.6 : 1.1;
      const m = pc.M();
      for (let x = 1; x < w - 1; x += 0.25) m.disk(x, y0 + Math.sin(x * 0.35 + ph) * amp, wd * (0.6 + 0.4 * Math.sin((x / w) * Math.PI)));
      ring(pc, m, MR, { lit: MR[5], dark: MR[6] });
      m.each((X, Y) => {
        const d = Y + 0.5 - (y0 + Math.sin((X + 0.5) * 0.35 + ph) * amp);
        pc.set(X, Y, MR[d < -wd * 0.3 ? 1 : d < wd * 0.3 ? 2 : 4]);
        if (hash2(X, Y, 7 + i) < 0.12) pc.set(X, Y, hash2(X, Y, 8) < 0.5 ? 0xffd0f4 : 0xd0fff0);
      });
    }
    for (let i = 0; i < 2; i++) { const x = rng.int(3, w - 4), y = rng.int(2, h - 3); if (pc.alpha(x, y)) gl(pc, x, y, 0xffffff, 0.5); }
    return pc;
  },
  moonsilver_ore(rng) {
    const s = rng.int(14, 20);
    const pc = canvas(s + 4, s + 4);
    const MR = mat(0xe2e4ff, { cont: 1, hs: 0.6, sat: 0.7 });
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const r = i === 0 ? rng.range(4.5, 6) : rng.range(2.4, 3.6);
      const pa = rng.range(0, Math.PI * 2);
      const x = (s + 4) / 2 + (i ? Math.cos(pa) * s * 0.33 : -1), y = (s + 4) / 2 + (i ? Math.sin(pa) * s * 0.33 : -1);
      const a = rng.range(-2.4, -0.8);
      const m = pc.M().disk(x, y, r).sub(pc.M().disk(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.8));
      ring(pc, m, MR, { lit: MR[4], dark: MR[6] });
      vol(pc, m, MR, { spec: 0.8, emit: 0.65, round: 2 });
    }
    haloAround(pc, [0x2a2838, 0x3a3650], 2, 0.45, 17);
    return pc;
  },
  diamond(rng) {
    // octahedron in blue-grey kimberlite
    const s = rng.int(10, 15);
    const pc = canvas(s + 6, s + 6);
    const R = mat(0xd8f2ff, { cont: 1.2, hs: 0.8 });
    const cx = (s + 6) / 2, cy = (s + 6) / 2, r = s / 2;
    const m = pc.M().poly([[cx, cy - r], [cx + r * 0.85, cy], [cx, cy + r], [cx - r * 0.85, cy]]);
    ring(pc, m, R);
    m.each((x, y) => { const L = x + 0.5 < cx, U = y + 0.5 < cy; pc.set(x, y, R[U ? (L ? 1 : 2) : (L ? 3 : 4)]); });
    for (let x = Math.ceil(cx - r * 0.85); x < cx + r * 0.85; x++) if (m.get(x, cy)) pc.set(x, cy, R[0]);
    pc.set(cx - 1, cy - r * 0.5, 0xffffff); pc.emit(cx - 1, cy - r * 0.5, 0.6);
    for (const c of [0xffb0d0, 0xa0e0ff]) { const x = rng.int(Math.floor(cx - r * 0.4), Math.ceil(cx + r * 0.4)), y = rng.int(Math.floor(cy - 1), Math.ceil(cy + r * 0.4)); if (m.get(x, y)) pc.set(x, y, c); }
    haloAround(pc, [0x5a6a7a, 0x4a5868, 0x6a7a8a], 3, 0.6, 23);
    return pc;
  },
  voidstone(rng) {
    const VR = mat(0x2a1240, { cont: 0.85 }); VR[1] = 0x9a6ad9; VR[0] = 0xe0c8ff;
    const pc = crystalCluster(rng, VR, { size: [14, 22], ridge: 0xb890f0 });
    haloAround(pc, [0x0c0612, 0x140a1e, 0x1a0c28], 3, 0.75, 29);
    return pc;
  },
  adamant_ore(rng) {
    const s = rng.int(14, 22);
    const pc = canvas(s + 2, s + 2);
    const AR = mat(0x3ccf94, { cont: 1.35, hs: 1.3 }); AR[0] = 0xe8fff4;
    const n = rng.int(3, 4);
    const cx = (s + 2) / 2, cy = (s + 2) / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(0, 0.8);
      const L = rng.range(s * 0.3, s * 0.5), wd = rng.range(2, 3.2);
      const tx = cx + Math.cos(a) * L, ty = cy + Math.sin(a) * L;
      const px = -Math.sin(a) * wd, py = Math.cos(a) * wd;
      const pts = [[cx + px, cy + py], [tx + px * 0.3, ty + py * 0.3], [tx + Math.cos(a) * 1.5, ty + Math.sin(a) * 1.5], [tx - px * 0.3, ty - py * 0.3], [cx - px, cy - py]];
      const m = pc.M().poly(pts);
      ring(pc, m, AR);
      const t1 = toneFor([px, py, 0.8]), t2 = toneFor([-px, -py, 0.8]);
      m.each((x, y) => { const side = (x + 0.5 - cx) * Math.cos(a + Math.PI / 2) + (y + 0.5 - cy) * Math.sin(a + Math.PI / 2); pc.set(x, y, AR[side > 0 ? t1 : t2]); });
      lineIn(pc, cx, cy, tx, ty, AR[1], m);
    }
    const hub = pc.M().disk(cx, cy, 2.4); ring(pc, hub, AR); vol(pc, hub, AR, { spec: 0.8 });
    return pc;
  },
  starmetal_ore(rng) {
    const s = rng.int(16, 24);
    const pc = canvas(s + 6, s + 6);
    const CR = mat(0x4a3c38, { cont: 1.05 });
    const cx = (s + 6) / 2, cy = (s + 6) / 2;
    const m = lumps(pc, rng, cx, cy, s / 2 - 1, s / 2 - 1.5, 4, 0.45);
    ring(pc, m, CR);
    vol(pc, m, CR, { round: 4, tex: (x, y) => (vnoise(x * 0.5, y * 0.5, 12) - 0.5) * 0.4 });
    // polished face with Widmanstätten lattice
    const FR = mat(0xd0ccc4, { cont: 1.15, hs: 0.5 });
    for (let i = 0; i < 6; i++) { const x = rng.int(3, s + 2), y = rng.int(3, s + 2); if (m.get(x, y) && m.get(x + 1, y + 1)) { pc.set(x, y, CR[5]); pc.set(x + 1, y, CR[4]); pc.set(x, y - 1, CR[2]); } }
    const fa = rng.range(0, Math.PI * 2);
    const face = pc.M().poly([0, 1, 2, 3, 4].map((i) => { const a = fa + i * 1.257 + rng.range(-0.3, 0.3), r = s * rng.range(0.16, 0.24); return [cx - 1.5 + Math.cos(a) * r, cy - 1.5 + Math.sin(a) * r]; })).and(m);
    ring(pc, face, CR, { lit: CR[1], dark: CR[6] });
    face.each((x, y) => {
      const a = ((x * 0.5 + y * 0.87) % 3.4 + 3.4) % 3.4, b = ((x * 0.5 - y * 0.87 + 60) % 3.4 + 3.4) % 3.4;
      pc.set(x, y, FR[a < 0.75 || b < 0.75 ? 3 : (x + y) < cx + cy - 2 ? 1 : 2]);
    });
    for (let i = 0; i < 5; i++) { const x = rng.int(2, s + 3), y = rng.int(2, s + 3); if (m.get(x, y)) gl(pc, x, y, 0xffe08a, 1); }
    sparkle(pc, cx - 3, cy - 3, 1, 0xfffbe8, 0xffd060, 1);
    // shocked rock: radial hairline cracks
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng.range(0, 0.5);
      for (let r = s / 2; r < s / 2 + 3; r++) stain(pc, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0x2a2228);
    }
    return pc;
  },
  sunstone(rng) {
    const r = rng.range(5, 7.5);
    const W = Math.ceil(r * 2 + 8);
    const pc = canvas(W, W);
    const R = mat(0xffcf3a, { cont: 1.1 });
    const c = W / 2;
    const m = pc.M().disk(c, c, r);
    ring(pc, m, R);
    vol(pc, m, R, { spec: 0.86, emit: 0.75, bounce: true });
    m.each((x, y) => { if (hash2(x, y, 21) < 0.1) pc.set(x, y, hash2(x, y, 4) < 0.5 ? 0xfff8d0 : 0xff9a2a); });
    gl(pc, c - r * 0.4, c - r * 0.4, 0xffffff, 1);
    // heat-baked rock rays
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; for (let k = 1.5; k < 4; k++) stain(pc, c + Math.cos(a) * (r + k), c + Math.sin(a) * (r + k), k < 2.5 ? 0xffa040 : 0xb05a20, k < 2.5 ? 0.6 : 0.25); }
    return pc;
  },
  truffle(rng) {
    const w = rng.int(10, 15), h = rng.int(9, 13);
    const pc = canvas(w + 6, h + 6);
    const R = mat(0x5a3a2c, { cont: 1.1 });
    const m = lumps(pc, rng, (w + 6) / 2, (h + 6) / 2, w / 2 - 0.5, h / 2 - 0.5, 3, 0.45);
    ring(pc, m, R);
    vol(pc, m, R, { round: 3, tex: (x, y) => (vnoise(x * 0.9, y * 0.9, 3) - 0.5) * 0.45 });
    m.each((x, y) => { if (hash2(x, y, 7) < 0.12) pc.set(x, y, R[1]); });
    // fine root hairs
    for (let i = 0; i < 5; i++) {
      let a = rng.range(0, Math.PI * 2), x = (w + 6) / 2 + Math.cos(a) * w * 0.5, y = (h + 6) / 2 + Math.sin(a) * h * 0.5;
      for (let k = 0; k < 4; k++) { stain(pc, x, y, 0xb89a78); x += Math.cos(a); y += Math.sin(a); a += rng.range(-0.5, 0.5); }
    }
    return pc;
  },
  frostbloom_seed(rng) {
    const pc = canvas(10, 12);
    const R = mat(0xbdf2ff, { cont: 1.2 });
    const m = pc.M().ellipse(5, 6, 3.4, 4.4);
    ring(pc, m, R); vol(pc, m, R, { emit: 0.4, spec: 0.8 });
    return pc;
  },
});

/** Crystal cluster growing from a point: shared by lumite, echo, gravium, bioxide, frostite, voidstone. */
function crystalCluster(rng, R, o = {}) {
  const [a0, a1] = o.size || [14, 22];
  const H = rng.int(a0, a1), W = Math.round(H * rng.range(0.85, 1.15));
  const pad = o.pad ?? 1;
  const pc = canvas(W + 2, H + pad + 1);
  const dir = o.dir ?? (-Math.PI / 2 + rng.range(-0.7, 0.7));
  const bx = (W + 2) / 2 - Math.cos(dir) * H * 0.3, by = pad + H - 2 - (Math.sin(dir) + 1) * H * 0.18;
  const n = rng.int(3, 5);
  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  order.sort((p, q) => Math.abs(q - (n - 1) / 2) - Math.abs(p - (n - 1) / 2));
  for (const i of order) {
    const spread = (i - (n - 1) / 2);
    const a = dir + spread * (o.slim ? 0.22 : 0.34) + rng.range(-0.1, 0.1);
    const main = Math.abs(spread) < 0.6;
    const len = (main ? 1 : rng.range(0.5, 0.78)) * H * 0.95;
    const w = (o.slim ? rng.range(2.6, 3.4) : rng.range(3.6, 5.2)) * (main ? 1.15 : 1);
    prism(pc, {
      x: bx + Math.cos(a + Math.PI / 2) * spread * 1.6, y: by + Math.sin(a + Math.PI / 2) * spread * 1.6, a, len, w,
      tip: o.jagged ? w * 1.4 : w * 0.85, skew: o.jagged ? rng.range(-0.9, 0.9) : rng.range(-0.3, 0.3), R, base: 0.35,
      emit: o.glow, core: o.core, ridge: o.ridge,
    });
  }
  return pc;
}

/** Corundum (ruby/sapphire): a hexagonal barrel with flat ends and growth bands, in pale matrix. */
function corundum(rng, R, matrix) {
  const W = rng.int(10, 14), H = rng.int(13, 18);
  const pc = canvas(W + 6, H + 6);
  const cx = (W + 6) / 2, cy = (H + 6) / 2;
  const pts = [[cx - W * 0.3, cy - H / 2], [cx + W * 0.3, cy - H / 2], [cx + W / 2, cy - H * 0.25], [cx + W / 2, cy + H * 0.25], [cx + W * 0.3, cy + H / 2], [cx - W * 0.3, cy + H / 2], [cx - W / 2, cy + H * 0.25], [cx - W / 2, cy - H * 0.25]];
  const m = pc.M().poly(pts);
  ring(pc, m, R);
  m.each((x, y) => {
    const u = (x + 0.5 - cx) / (W / 2), v = (y + 0.5 - cy) / (H / 2);
    let k = u < -0.45 ? 2 : u > 0.45 ? 4 : 3;
    if (v < -0.62) k = 1;
    if ((Math.floor((y + 0.5 - cy) * 0.6 + 20) % 4) === 0 && k === 3) k = 4;
    pc.set(x, y, R[Math.max(1, Math.min(5, k))]);
  });
  for (let y = Math.ceil(cy - H * 0.35); y < cy + H * 0.3; y++) pc.set(cx - W * 0.28, y, R[1]);
  pc.set(cx - W * 0.25, cy - H * 0.38, R[0]);
  haloAround(pc, matrix, 3, 0.5, 31);
  return pc;
}

/**
 * Raw deposit art for an ore item: PixelCanvas (emissive flags on .glow) with a .stain mask.
 * Deterministic for (itemId, seed).
 */
export function oreArt(itemId, seed = 1) {
  const f = HABITS[itemId] || HABITS.copper_ore;
  const rng = makeRng((hashStr(itemId) ^ Math.imul(seed | 0, 2654435761)) >>> 0);
  return f(rng);
}

export const ORE_HABIT_IDS = Object.keys(HABITS);
