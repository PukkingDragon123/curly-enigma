// Detailed 32×32 pixel-art icons for the skill tree: one per skill node (what it does: tools, ores,
// flames, anvils, pots, lanterns, packs, boots, shields...) and one emblem per skill line.
// Drawn with a tiny shape toolkit: every part is a mask (ellipse, capsule, polygon, rect...) lit by
// a fixed light from the top-left (round parts get real normals, flat parts a bevel), parts that
// overlap get a dark seam, and the finished icon a dark outline plus soft halos for glowing bits.
// Light comes from the top-left; one art pixel = one canvas pixel (shown at the board's scale).
//   skillIconURL(nodeId, mode)  mode: 'lit' | 'dim' (locked: dark, desaturated) | 'gray' (barred)
//   lineIconURL(lineId, mode)   the line's emblem (32×32)
//   ICON_IDS                    every node id with a recipe (for the contact sheet)
import { Px } from './px.js';
import { art } from './uiArt.js';

const N = 32;
const OUT = 0x150b06;

// ---------------------------------------------------------------- materials (dark → light)
export const MAT = {
  iron: [0x17161a, 0x2a292e, 0x403f46, 0x5a5862, 0x77757f, 0x99979f, 0xbdbbc3, 0xe2e0e6],
  steel: [0x141a24, 0x253142, 0x3a4a62, 0x566a86, 0x7a8ea8, 0xa2b4ca, 0xccd8e6, 0xf2f6fa],
  brass: [0x2e1a08, 0x4e3010, 0x7a5018, 0xa87420, 0xcc9a34, 0xe8be56, 0xf8dc86, 0xfff4c8],
  gold: [0x3a2004, 0x6a3c08, 0xa0640c, 0xd2961a, 0xf2be34, 0xffdc66, 0xfff09e, 0xfffbe2],
  copper: [0x2e1006, 0x52200c, 0x7e3614, 0xaa5220, 0xcc7238, 0xe8985a, 0xf8c08a, 0xffe2c4],
  wood: [0x22120a, 0x3a200e, 0x563216, 0x744620, 0x925c2c, 0xae763c, 0xc8924e, 0xe0b06a],
  dkwood: [0x160c06, 0x26150a, 0x3a2010, 0x4e2c16, 0x643a1e, 0x7a4a28, 0x925c32],
  leather: [0x241006, 0x3e1c0c, 0x5c2c14, 0x7c401e, 0x9a582a, 0xb8743a, 0xd2944e, 0xe8b46c],
  burlap: [0x2e2010, 0x4a361c, 0x6a4f2a, 0x8a6a3c, 0xa88650, 0xc2a068, 0xd8ba84, 0xeed6a6],
  cloth: [0x2a0808, 0x4a0e0e, 0x701816, 0x982620, 0xbc3a2c, 0xdc5a42, 0xf08a6a, 0xffbca0],
  blue: [0x0a1030, 0x141e52, 0x1e3078, 0x2c48a0, 0x4268c4, 0x6a92e0, 0x9cbcf4, 0xd4e4ff],
  flame: [0x4a0c02, 0x8a1e04, 0xc8400a, 0xee6c14, 0xfaa028, 0xffcc4a, 0xffec8a, 0xfffbe0],
  stone: [0x1c1816, 0x2c2622, 0x3e3630, 0x52483f, 0x685c50, 0x807264, 0x9a8a7a, 0xb6a694],
  coal: [0x0e0c0c, 0x1a1716, 0x272322, 0x36302e, 0x48403c, 0x5c534e],
  ruby: [0x30040c, 0x5a0818, 0x8e1028, 0xc41e3e, 0xe8405a, 0xff7a8a, 0xffb4bc, 0xffe8ea],
  emerald: [0x04261a, 0x08422a, 0x0e6640, 0x18905a, 0x2cb874, 0x5cdc96, 0x9cf4c0, 0xe0fff0],
  sapphire: [0x060e36, 0x0e1c5e, 0x182e8e, 0x2848c0, 0x4470e4, 0x72a0fa, 0xaccaff, 0xe8f0ff],
  amethyst: [0x200c36, 0x381658, 0x542280, 0x7434aa, 0x9652cc, 0xb880e8, 0xdcb6fa, 0xf6eaff],
  ice: [0x163040, 0x2a5468, 0x427e96, 0x62a8c0, 0x8ccce0, 0xb8e6f4, 0xe2f8ff, 0xffffff],
  skin: [0x3e1218, 0x68222a, 0x94383e, 0xbc5656, 0xdc7a76, 0xf4a49c, 0xffcac2, 0xffeae4],
  fur: [0x100c10, 0x1e1820, 0x2e2632, 0x403646, 0x54485a, 0x6c5e72, 0x86788c],
  bone: [0x3a3022, 0x5e5038, 0x867452, 0xac9a74, 0xcabc98, 0xe2d8ba, 0xf4eedc, 0xfffcf2],
  paper: [0x4a3418, 0x6e5230, 0x96784a, 0xbca06c, 0xd8c08a, 0xeedcaa, 0xfaeed0, 0xfffaec],
  water: [0x081a34, 0x10305c, 0x184c88, 0x2470b4, 0x3c96d8, 0x6ebcf0, 0xa8dcff, 0xe4f6ff],
  leaf: [0x0a2008, 0x143812, 0x20541a, 0x2e7224, 0x449230, 0x64b040, 0x92d05e, 0xc8ee90],
  glow: [0x062a24, 0x0a4a3c, 0x107858, 0x1ea67a, 0x3ed2a0, 0x7cf0c4, 0xbcffe2, 0xf0fff8],
  bread: [0x3e1c06, 0x66320c, 0x925014, 0xbc7222, 0xdc9638, 0xf0ba5c, 0xfcd88c, 0xfff2cc],
  meat: [0x300a08, 0x561410, 0x82241a, 0xaa3a26, 0xcc5a3a, 0xe8825a, 0xf8ac86, 0xffd6c0],
  egg: [0x4a4236, 0x7a705e, 0xa49a86, 0xc8c0ae, 0xe2dccc, 0xf2eee4, 0xfbf9f4, 0xffffff],
  purple: [0x1c0a26, 0x341444, 0x4e2066, 0x6c2e8a, 0x8c44ac, 0xae68cc, 0xcc94e4, 0xead0f8],
  night: [0x080a1a, 0x10142e, 0x1a2046, 0x262e5e, 0x343e78, 0x465294],
  silver: [0x1c1c22, 0x34343e, 0x50505c, 0x70707c, 0x94949e, 0xb8b8c0, 0xdadae0, 0xf8f8fc],
  orange: [0x3a1404, 0x662408, 0x94380c, 0xc05214, 0xe07224, 0xf49a44, 0xffc278, 0xffe6be],
  pink: [0x3a0a24, 0x601440, 0x8a225e, 0xb4387e, 0xd85a9e, 0xf088be, 0xffb8da, 0xffe6f2],
};
const M = MAT;
const C = (m, i) => m[Math.max(0, Math.min(m.length - 1, i))];
const LIGHT = (() => { const v = [-0.52, -0.62, 0.58], l = Math.hypot(...v); return v.map((x) => x / l); })();

// ---------------------------------------------------------------- the canvas + toolkit
class Ico {
  constructor() {
    this.p = new Px(N, N);
    this.under = new Px(N, N); // halos, drawn under everything
    this.T = { ox: 0, oy: 0, sc: 1, fx: false };
    this.stack = [];
    this.noOutline = new Uint8Array(N * N); // pixels that keep no dark outline (glows, sparkles)
  }
  // ---- transforms (shapes are designed on a 32×32 grid; push() moves/scales them)
  push(ox = 0, oy = 0, sc = 1, fx = false) { this.stack.push(this.T); const t = this.T; this.T = { ox: t.ox + ox * t.sc, oy: t.oy + oy * t.sc, sc: t.sc * sc, fx: fx !== t.fx }; return this; }
  pop() { this.T = this.stack.pop() || { ox: 0, oy: 0, sc: 1, fx: false }; return this; }
  /** pixel centre → design coordinates */
  dc(px, py) {
    const t = this.T;
    let x = (px + 0.5 - t.ox) / t.sc, y = (py + 0.5 - t.oy) / t.sc;
    if (t.fx) x = 32 - x;
    return [x, y];
  }
  /** design point → pixel */
  pc(x, y) { const t = this.T; if (t.fx) x = 32 - x; return [Math.floor(t.ox + x * t.sc), Math.floor(t.oy + y * t.sc)]; }
  // ---- masks
  mask(test) {
    const m = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const [X, Y] = this.dc(x, y); if (test(X, Y)) m[y * N + x] = 1; }
    return m;
  }
  // ---- painting a mask with a material
  // normal(x, y) (design space) → [nx, ny, nz] for real shading; else a bevel on a flat face
  paint(m, mat, o = {}) {
    const p = this.p, has = (x, y) => x >= 0 && y >= 0 && x < N && y < N && m[y * N + x];
    const k0 = o.k ?? 0.56;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (!m[y * N + x]) continue;
        let k;
        if (o.normal) {
          const [X, Y] = this.dc(x, y);
          let [nx, ny, nz] = o.normal(X, Y);
          if (this.T.fx) nx = -nx;
          const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
          k = (o.amb ?? 0.28) + (1 - (o.amb ?? 0.28)) * Math.max(0, d);
          const spec = Math.pow(Math.max(0, d), o.shine ?? 9) * (o.spec ?? 0.35);
          k = k * (o.kmul ?? 1) + spec + (o.kadd ?? 0);
        } else {
          k = k0;
          if (o.grad) { const [X, Y] = this.dc(x, y); k += (o.grad[0] * (X - 16) + o.grad[1] * (Y - 16)) / 16; }
          const L = !has(x - 1, y), T = !has(x, y - 1), R = !has(x + 1, y), B = !has(x, y + 1);
          if (o.bevel !== false) {
            if (T || L) k += o.rim ?? 0.24;
            else if (B || R) k -= o.rim ?? 0.24;
            else if (!has(x - 2, y) || !has(x, y - 2)) k += (o.rim ?? 0.24) * 0.45;
          }
        }
        if (o.tex) k += (h2(x, y, o.seed ?? 3) - 0.5) * o.tex;
        if (o.fn) k = o.fn(k, x, y, ...this.dc(x, y));
        let c = C(mat, Math.round(Math.max(0, Math.min(1, k)) * (mat.length - 1)));
        // a dark seam where this part overlaps something drawn before it
        if (o.seam !== false) {
          const nb = (xx, yy) => !has(xx, yy) && p.a(xx, yy) > 0;
          if (nb(x + 1, y) || nb(x, y + 1) || nb(x - 1, y) || nb(x, y - 1)) c = C(mat, o.seamTone ?? 0);
        }
        p.set(x, y, c);
        if (o.glow) this.noOutline[y * N + x] = 1;
      }
    return this;
  }
  // ---- shapes (all in design space)
  ell(cx, cy, rx, ry, mat, o = {}) {
    const m = this.mask((X, Y) => ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1);
    if (o.flat) return this.paint(m, mat, o);
    return this.paint(m, mat, { normal: (X, Y) => { const nx = (X - cx) / rx, ny = (Y - cy) / ry, r2 = Math.min(1, nx * nx + ny * ny); const f = o.dome ?? 1; return [nx * f, ny * f, Math.sqrt(1 - r2) + (1 - f)]; }, ...o });
  }
  disk(cx, cy, r, mat, o) { return this.ell(cx, cy, r, r, mat, o); }
  /** A capsule from (x0, y0) to (x1, y1), width w: shaded as a cylinder. */
  line(x0, y0, x1, y1, w, mat, o = {}) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1, L = Math.sqrt(L2), r = w / 2;
    const px = -dy / L, py = dx / L;
    const m = this.mask((X, Y) => {
      let t = ((X - x0) * dx + (Y - y0) * dy) / L2;
      if (o.square) { if (t < 0 || t > 1) return false; } else t = Math.max(0, Math.min(1, t));
      const qx = x0 + dx * t - X, qy = y0 + dy * t - Y;
      return qx * qx + qy * qy <= r * r;
    });
    if (o.flat) return this.paint(m, mat, o);
    return this.paint(m, mat, { normal: (X, Y) => { const s = Math.max(-1, Math.min(1, ((X - x0) * px + (Y - y0) * py) / r)); return [px * s, py * s, Math.sqrt(1 - s * s)]; }, ...o });
  }
  rect(x, y, w, h, mat, o = {}) {
    const m = this.mask((X, Y) => X >= x && X < x + w && Y >= y && Y < y + h);
    if (o.cylX) return this.paint(m, mat, { normal: (X) => { const s = Math.max(-1, Math.min(1, ((X - x) / w) * 2 - 1)); return [s, 0, Math.sqrt(1 - s * s)]; }, ...o });
    if (o.cylY) return this.paint(m, mat, { normal: (X, Y) => { const s = Math.max(-1, Math.min(1, ((Y - y) / h) * 2 - 1)); return [0, s, Math.sqrt(1 - s * s)]; }, ...o });
    return this.paint(m, mat, o);
  }
  rr(x, y, w, h, r, mat, o = {}) {
    const m = this.mask((X, Y) => {
      if (X < x || Y < y || X >= x + w || Y >= y + h) return false;
      const qx = Math.max(x + r - X, 0, X - (x + w - r)), qy = Math.max(y + r - Y, 0, Y - (y + h - r));
      return qx * qx + qy * qy <= r * r;
    });
    if (o.cylX) return this.paint(m, mat, { normal: (X) => { const s = Math.max(-1, Math.min(1, ((X - x) / w) * 2 - 1)); return [s, 0, Math.sqrt(1 - s * s)]; }, ...o });
    return this.paint(m, mat, o);
  }
  poly(pts, mat, o = {}) {
    const m = this.mask((X, Y) => inPoly(pts, X, Y));
    return this.paint(m, mat, o);
  }
  /** A ring (annulus) between radii r0 and r1, optionally an arc a0..a1 (radians, clockwise from +x). */
  ring(cx, cy, r0, r1, mat, o = {}) {
    const m = this.mask((X, Y) => {
      const d = Math.hypot(X - cx, Y - cy);
      if (d < r0 || d > r1) return false;
      if (o.a0 === undefined) return true;
      let a = Math.atan2(Y - cy, X - cx); if (a < o.a0) a += Math.PI * 2;
      return a >= o.a0 && a <= o.a1;
    });
    if (o.flat !== false) return this.paint(m, mat, { normal: (X, Y) => { const d = Math.hypot(X - cx, Y - cy) || 1, s = ((d - r0) / (r1 - r0)) * 2 - 1; return [((X - cx) / d) * s, ((Y - cy) / d) * s, Math.sqrt(Math.max(0, 1 - s * s))]; }, ...o });
    return this.paint(m, mat, o);
  }
  /** A custom mask from a predicate (design space). */
  shape(test, mat, o = {}) { return this.paint(this.mask(test), mat, o); }
  // ---- pixels
  px(x, y, c, a = 255) { const [X, Y] = this.pc(x, y); this.p.set(X, Y, c, a); return this; }
  /** A 1-px line in design space (Bresenham on the pixel grid). */
  ln(x0, y0, x1, y1, c, a = 255) { const [a0, b0] = this.pc(x0, y0), [a1, b1] = this.pc(x1, y1); this.p.line(a0, b0, a1, b1, c, a); return this; }
  /** Recolour pixels already drawn inside a predicate region: fn(color) → color. */
  tint(test, fn) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!this.p.a(x, y)) continue;
      const [X, Y] = this.dc(x, y);
      if (test(X, Y)) this.p.set(x, y, fn(this.p.get(x, y), x, y));
    }
    return this;
  }
  /** A four-point twinkle (no outline). */
  spark(x, y, r = 2, c = 0xfffbe0, c2 = 0xffe27a) {
    const [X, Y] = this.pc(x, y);
    const put = (i, j, col) => { this.p.set(i, j, col); if (this.p.in(i, j)) this.noOutline[j * N + i] = 1; };
    put(X, Y, c);
    for (let k = 1; k <= r; k++) { const col = k === r ? c2 : c; put(X + k, Y, col); put(X - k, Y, col); put(X, Y + k, col); put(X, Y - k, col); }
    if (r >= 3) { put(X + 1, Y + 1, c2); put(X - 1, Y - 1, c2); put(X + 1, Y - 1, c2); put(X - 1, Y + 1, c2); }
    return this;
  }
  /** A soft halo (under the icon). */
  halo(cx, cy, r, c, a = 110) {
    const [X, Y] = this.pc(cx, cy), R = r * this.T.sc;
    for (let y = Math.floor(Y - R); y <= Y + R; y++) for (let x = Math.floor(X - R); x <= X + R; x++) {
      const d = Math.hypot(x + 0.5 - X - 0.5, y + 0.5 - Y - 0.5) / R;
      if (d > 1 || !this.under.in(x, y)) continue;
      const al = Math.round(a * (1 - d) * (1 - d) * (0.85 + 0.3 * (B4[(y & 3) * 4 + (x & 3)] / 16)));
      if (al > this.under.a(x, y)) this.under.set(x, y, c, al);
    }
    return this;
  }
  /** Motion arcs / speed lines (no outline). */
  arc(cx, cy, r, a0, a1, c, a = 255) {
    const steps = Math.ceil(Math.abs(a1 - a0) * r * 1.6) + 2;
    for (let i = 0; i <= steps; i++) {
      const t = a0 + (a1 - a0) * (i / steps);
      const [X, Y] = this.pc(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
      this.p.set(X, Y, c, a);
      if (this.p.in(X, Y)) this.noOutline[Y * N + X] = 1;
    }
    return this;
  }
  /** Final: dark outline round the silhouette, a drop of shadow, halos underneath. */
  finish(o = {}) {
    const p = this.p, add = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (p.a(x, y)) continue;
      const on = (i, j) => p.in(i, j) && p.a(i, j) > 40 && !this.noOutline[j * N + i];
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1) || (o.diag && (on(x - 1, y - 1) || on(x + 1, y + 1) || on(x - 1, y + 1) || on(x + 1, y - 1)))) add.push([x, y]);
    }
    for (const [x, y] of add) p.set(x, y, OUT);
    // contact shadow one pixel down-right of the outline
    const sh = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!p.a(x, y) && p.a(x - 1, y - 1) > 200 && p.get(x - 1, y - 1) === OUT) sh.push([x, y]);
    for (const [x, y] of sh) p.set(x, y, 0x000000, 90);
    const out = new Px(N, N);
    out.blit(this.under);
    out.blit(p);
    return out;
  }
}
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function h2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function inPoly(pts, x, y) {
  let ins = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

// ---------------------------------------------------------------- props (parts used by many icons)
// Each draws on the 32-grid; use D.push(ox, oy, scale, flip) to move/scale.
const P = {
  /** A pickaxe, handle bottom-left → head top-right. */
  pick(D, head = M.iron, o = {}) {
    D.line(5, 28, 21, 9, 3.2, M.wood, { shine: 6 });
    D.ln(7, 25, 9, 23, C(M.wood, 2)).ln(12, 20, 13, 19, C(M.wood, 2)); // grain
    D.line(4.5, 28.5, 7, 25.5, 3.6, M.leather, { spec: 0.1 }); // grip wrap
    D.ln(5, 27, 6, 26, C(M.leather, 1));
    // the head: a curved bar across the handle's tip, pointed both ends, tips bent toward the handle
    const hx = 8.2, hy = 24.4, hr = 20, a0 = -1.42, a1 = -0.34;
    D.shape((X, Y) => {
      const a = Math.atan2(Y - hy, X - hx);
      if (a < a0 || a > a1) return false;
      const t = (a - a0) / (a1 - a0);
      const w = 1.2 + 3.6 * Math.pow(Math.sin(t * Math.PI), 0.7);
      return Math.abs(Math.hypot(X - hx, Y - hy) - hr) <= w / 2;
    }, head, { k: 0.62, rim: 0.3, fn: (k, x, y, X, Y) => k + (Math.hypot(X - hx, Y - hy) < hr - 0.6 ? 0.1 : Math.hypot(X - hx, Y - hy) > hr + 0.9 ? -0.12 : 0) });
    D.rect(18.5, 8.5, 4, 4, M.brass, { cylX: true }); // collar
    if (o.glint !== false) D.px(14, 9, C(head, 7)).px(15, 8, C(head, 6));
  },
  hammer(D, head = M.iron, o = {}) {
    D.line(6, 28, 19, 12, 3, M.wood, { shine: 6 });
    D.ln(9, 24, 10, 23, C(M.wood, 2));
    D.line(5.5, 28.5, 8, 25.5, 3.4, M.leather, { spec: 0.1 });
    // head (a block across the handle's tip, tilted)
    D.poly([[12, 9], [20, 2], [27, 9], [19, 16]], head, { k: 0.5, rim: 0.28 });
    D.poly([[13, 9.5], [20, 3.5], [21.5, 5], [14.5, 11]], head, { k: 0.78, bevel: false, seam: false });
    D.poly([[17, 14], [25, 7], [27, 9], [19, 16]], head, { k: 0.25, bevel: false, seam: false });
    if (o.band !== false) D.poly([[15.5, 12.5], [22.5, 5.5], [23.5, 6.5], [16.5, 13.5]], M.brass, { k: 0.6, rim: 0.2, seam: false });
  },
  anvil(D, mat = M.iron) {
    D.poly([[3, 10], [9, 9], [28, 9], [28, 14], [22, 15], [20, 19], [24, 23], [24, 26], [7, 26], [7, 23], [11, 19], [10, 15], [7, 14], [3, 12]], mat, { k: 0.45, rim: 0.22, grad: [0, -0.18] });
    D.poly([[4, 10], [9, 9.2], [28, 9.2], [28, 10.4], [4, 11]], mat, { k: 0.85, bevel: false, seam: false }); // the face
    D.poly([[7, 24.5], [24, 24.5], [24, 26], [7, 26]], mat, { k: 0.2, bevel: false, seam: false });
    D.px(25, 10, C(mat, 7)).px(14, 9, C(mat, 7));
  },
  flame(D, cx = 16, base = 27, h = 22, w = 9, pal = M.flame) {
    D.halo(cx, base - h * 0.4, h * 0.62, C(pal, 4), 120);
    const tear = (s, k) => D.shape((X, Y) => {
      const t = (base - Y) / (h * s); if (t < 0 || t > 1) return false;
      const wob = Math.sin(t * 7 + cx) * 0.6 * t;
      const ww = w * s * (t < 0.35 ? Math.sqrt(t / 0.35) : Math.pow((1 - t) / 0.65, 0.8)) * 0.5;
      return Math.abs(X - cx - wob - (t * t) * 1.5) <= ww;
    }, pal, { k, bevel: false, glow: true, seam: false });
    tear(1, 0.36); tear(0.78, 0.55); tear(0.56, 0.78); tear(0.3, 1);
  },
  gem(D, cx, cy, r, mat = M.ruby, o = {}) {
    // a brilliant: table on top, crown facets, pavilion to a point
    const top = cy - r * 0.55, gird = cy - r * 0.05, bot = cy + r;
    D.poly([[cx - r, gird], [cx - r * 0.55, top], [cx + r * 0.55, top], [cx + r, gird], [cx, bot]], mat, { k: 0.45, rim: 0.18 });
    D.poly([[cx - r * 0.55, top], [cx + r * 0.55, top], [cx + r * 0.3, gird], [cx - r * 0.3, gird]], mat, { k: 0.86, bevel: false, seam: false });
    D.poly([[cx - r, gird], [cx - r * 0.3, gird], [cx, bot]], mat, { k: 0.66, bevel: false, seam: false });
    D.poly([[cx + r * 0.3, gird], [cx + r, gird], [cx, bot]], mat, { k: 0.22, bevel: false, seam: false });
    D.poly([[cx - r * 0.3, gird], [cx + r * 0.3, gird], [cx, bot]], mat, { k: 0.48, bevel: false, seam: false });
    D.ln(cx - r * 0.3, top + 1, cx - r * 0.1, top + 1, C(mat, 7));
    if (o.spark !== false) D.spark(cx - r * 0.55, top + 0.5, r > 5 ? 2 : 1);
  },
  coin(D, cx, cy, r, mat = M.gold, o = {}) {
    D.disk(cx, cy, r, mat, { shine: 14, spec: 0.5, dome: 0.55 });
    D.ring(cx, cy, r - 1.6, r - 0.8, mat, { kmul: 0.7, seam: false });
    if (o.mark !== false) {
      const [X, Y] = [cx, cy];
      D.shape((x, y) => Math.abs(x - X) + Math.abs(y - Y) * 1.3 <= r * 0.42, mat, { k: 0.28, bevel: false, seam: false });
      D.px(X - 1, Y - 1, C(mat, 7));
    }
  },
  /** A side-on coin (stack element). */
  coinEdge(D, cx, cy, w = 10, mat = M.gold) {
    D.ell(cx, cy, w / 2, 1.8, mat, { k: 0.5, flat: true, rim: 0.3 });
    D.rect(cx - w / 2, cy, w, 1.4, mat, { k: 0.3, bevel: false, seam: false });
  },
  bag(D, mat = M.burlap, o = {}) {
    D.ell(16, 21, 10.5, 9, mat, { tex: 0.12, shine: 5, spec: 0.12 });
    D.poly([[11, 13], [21, 13], [19, 9], [13, 9]], mat, { k: 0.5, tex: 0.1 });
    D.poly([[12.5, 9.5], [10, 4.5], [13, 6.5], [16, 3.5], [19, 6.5], [22, 4.5], [19.5, 9.5]], mat, { k: 0.62, rim: 0.2, tex: 0.1 }); // the gathered top
    D.line(11, 11.5, 21, 11.5, 2.2, o.tie || M.cloth, { spec: 0.2 }); // the tie
    D.line(21, 11.5, 24, 15, 1.6, o.tie || M.cloth, { spec: 0.1 });
    D.ln(13, 16, 12, 24, C(mat, 2)).ln(19, 15, 21, 22, C(mat, 2)); // folds
  },
  crown(D, mat = M.gold, gemMat = M.ruby, cy = 0) {
    D.push(0, cy);
    D.poly([[5, 23], [4, 11], [10, 16], [16, 7], [22, 16], [28, 11], [27, 23]], mat, { k: 0.6, rim: 0.26, grad: [0, -0.15] });
    D.rect(5, 21, 22, 4, mat, { cylY: true, shine: 12, spec: 0.45 });
    for (const [x, y] of [[4, 10.5], [16, 6.5], [28, 10.5]]) D.disk(x, y, 1.7, M.gold, { spec: 0.6 });
    D.disk(16, 17, 2.2, gemMat, { spec: 0.8, shine: 6 });
    D.disk(10, 23, 1.2, M.sapphire, { spec: 0.6, seam: false }).disk(22, 23, 1.2, M.emerald, { spec: 0.6, seam: false });
    D.pop();
  },
  shield(D, face = M.wood, rim = M.iron) {
    D.poly([[5, 5], [16, 3], [27, 5], [27, 15], [23, 23], [16, 29], [9, 23], [5, 15]], rim, { k: 0.5, rim: 0.3 });
    D.poly([[7.5, 7], [16, 5.5], [24.5, 7], [24.5, 15], [21, 21.5], [16, 26], [11, 21.5], [7.5, 15]], face, { k: 0.55, tex: 0.08, fn: (k, x, y, X) => k + (Math.abs(X - 16) < 0.6 ? -0.3 : 0) + (X < 16 ? 0.08 : -0.06) });
    D.disk(16, 14, 3.4, rim, { spec: 0.7, shine: 10 }); // the boss
    for (const [x, y] of [[9, 9], [23, 9], [16, 23]]) D.px(x, y, C(rim, 6)).px(x + 1, y + 1, C(rim, 1));
  },
  sword(D, blade = M.steel, o = {}) {
    // diagonal, point top-right
    D.poly([[8, 22], [25, 5], [28, 4], [27, 7], [10, 24]], blade, { k: 0.55, rim: 0.3 });
    D.ln(10, 22, 25, 7, C(blade, 7)); // fuller shine
    D.line(5, 19, 13, 27, 2.6, o.guard || M.brass, { spec: 0.5 });
    D.line(4, 28, 8.5, 23.5, 2.6, M.leather);
    D.disk(3.5, 28.5, 1.8, o.guard || M.brass, { spec: 0.6 });
  },
  mushroom(D, cap = M.cloth, o = {}) {
    D.rr(12.5, 15, 7, 13, 3, M.bone, { cylX: true, shine: 4, spec: 0.1 });
    D.shape((X, Y) => Y <= 17 && ((X - 16) / 12.5) ** 2 + ((Y - 17) / 11) ** 2 <= 1, cap, { normal: (X, Y) => { const nx = (X - 16) / 12.5, ny = (Y - 17) / 11, r2 = Math.min(1, nx * nx + ny * ny); return [nx, ny, Math.sqrt(1 - r2)]; }, shine: 7, spec: 0.3 });
    D.rect(4, 16, 24, 2, C(cap, 0) ? cap : cap, { k: 0.18, bevel: false, seam: false });
    if (o.dots !== false) for (const [x, y, r] of [[11, 10, 1.6], [19, 8, 1.3], [22, 13, 1.1], [14, 14, 1]]) D.disk(x, y, r, M.egg, { spec: 0.2, seam: false, dome: 0.4 });
  },
  leaf(D, cx, cy, len, ang, w = 0.38, mat = M.leaf) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    D.shape((X, Y) => {
      const u = (X - cx) * ca + (Y - cy) * sa, v = -(X - cx) * sa + (Y - cy) * ca;
      if (u < 0 || u > len) return false;
      const t = u / len;
      return Math.abs(v) <= Math.sin(t * Math.PI) * len * w * (1 - t * 0.25);
    }, mat, { normal: (X, Y) => { const v = -(X - cx) * sa + (Y - cy) * ca, u = (X - cx) * ca + (Y - cy) * sa; const s = Math.max(-1, Math.min(1, v / (len * w * 0.9 + 0.01))); return [-sa * s, ca * s, Math.sqrt(1 - s * s) * (0.8 + 0.2 * (u / len))]; }, spec: 0.15 });
    D.ln(cx + ca * 1, cy + sa * 1, cx + ca * len * 0.8, cy + sa * len * 0.8, C(mat, 2));
  },
  lantern(D, glass = M.flame, frame = M.brass) {
    D.halo(16, 18, 15, 0xffc050, 130);
    D.ring(16, 4.5, 2.2, 3.4, frame, { a0: Math.PI, a1: Math.PI * 2 }); // the bail
    D.rr(10, 7, 12, 3, 1, frame, { cylX: true }); // cap
    D.poly([[11, 10], [21, 10], [22.5, 23], [9.5, 23]], glass, { k: 0.86, bevel: false, glow: true });
    D.ell(16, 17, 2.4, 4, M.flame, { k: 1, flat: true, bevel: false, glow: true, seam: false });
    D.ell(16, 18, 1.2, 2.2, M.flame, { k: 1.2, flat: true, bevel: false, glow: true, seam: false });
    for (const x of [10.5, 15.5, 20.5]) D.rect(x + (x - 16) * 0.05, 10, 1.4, 13, frame, { cylX: true, spec: 0.5, seam: false });
    D.rr(8.5, 22.5, 15, 4, 1, frame, { cylX: true });
    D.ln(12, 12, 12, 20, 0xfff8e0);
  },
  boot(D, mat = M.leather, sole = M.dkwood) {
    D.poly([[9, 4], [19, 4], [19, 17], [27, 20], [28, 25], [8, 25], [8, 16]], mat, { k: 0.55, rim: 0.26, grad: [-0.05, 0] });
    D.rect(7, 24, 22, 4, sole, { k: 0.45, rim: 0.2 });
    D.rect(8.5, 4, 11, 3, mat, { k: 0.8, rim: 0.15, seam: false }); // cuff
    D.ln(10, 9, 18, 9, C(mat, 2)).ln(10, 13, 17, 13, C(mat, 2)); // laces / stitching
    for (const y of [9, 13]) D.px(13, y - 1, C(M.brass, 6)).px(15, y - 1, C(M.brass, 6));
  },
  compass(D, cx = 16, cy = 16, r = 12) {
    D.disk(cx, cy, r, M.brass, { spec: 0.5, shine: 12 });
    D.disk(cx, cy, r - 2.6, M.paper, { flat: true, k: 0.75, bevel: false });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; D.px(cx + Math.cos(a) * (r - 3.8), cy + Math.sin(a) * (r - 3.8), C(M.paper, 1)); }
    D.poly([[cx, cy - r + 3.5], [cx + 2, cy], [cx, cy + 1], [cx - 2, cy]], M.cloth, { k: 0.6, rim: 0.2, seam: false });
    D.poly([[cx, cy + r - 3.5], [cx + 2, cy], [cx, cy - 1], [cx - 2, cy]], M.steel, { k: 0.55, rim: 0.2, seam: false });
    D.disk(cx, cy, 1, M.brass, { seam: false });
    D.disk(cx, cy - r - 0.5, 2, M.brass, { spec: 0.4 }); // the bow
  },
  bottle(D, liquid = M.ruby, o = {}) {
    D.halo(16, 20, 12, C(liquid, 4), 70);
    D.disk(16, 20, 9, M.ice, { spec: 0.9, shine: 14, kmul: 0.7 });
    D.shape((X, Y) => Y >= 17 && Math.hypot(X - 16, Y - 20) <= 7.6, liquid, { normal: (X, Y) => { const nx = (X - 16) / 9, ny = (Y - 20) / 9; return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]; }, shine: 6, spec: 0.3, seam: false, glow: o.glow });
    D.rect(13, 6, 6, 6, M.ice, { cylX: true, kmul: 0.75 });
    D.rr(12.5, 3, 7, 4, 1, M.wood, { cylX: true });
    D.ln(10, 16, 11, 14, 0xffffff).px(12, 13, 0xe8f8ff);
  },
  heart(D, cx = 16, cy = 16, s = 1, mat = M.cloth) {
    D.push(cx - 16 * s, cy - 16 * s, s);
    D.shape((X, Y) => { const x = (X - 16) / 11, y = (Y - 17) / 11; return (x * x + y * y - 0.36) ** 3 - x * x * (-y) ** 3 * 1.1 <= 0 && Y > 5; }, mat, { normal: (X, Y) => { const nx = (X - 16) / 13, ny = (Y - 14) / 14; return [nx, ny, Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny))]; }, shine: 7, spec: 0.5 });
    D.pop();
  },
  ingot(D, cx = 16, cy = 18, w = 22, mat = M.gold) {
    const h = w * 0.36, t = w * 0.22;
    D.poly([[cx - w / 2, cy + h / 2], [cx - w / 2 + t, cy - h / 2], [cx + w / 2 - t, cy - h / 2], [cx + w / 2, cy + h / 2]], mat, { k: 0.5, rim: 0.2 });
    D.poly([[cx - w / 2 + t, cy - h / 2], [cx + w / 2 - t, cy - h / 2], [cx + w / 2 - t * 1.5, cy - h / 2 + h * 0.45], [cx - w / 2 + t * 1.5, cy - h / 2 + h * 0.45]], mat, { k: 0.88, bevel: false, seam: false });
    D.poly([[cx - w / 2, cy + h / 2], [cx - w / 2 + t, cy - h / 2], [cx - w / 2 + t * 1.5, cy - h / 2 + h * 0.45], [cx - w / 2 + t * 0.7, cy + h / 2]], mat, { k: 0.66, bevel: false, seam: false });
    D.poly([[cx + w / 2, cy + h / 2], [cx + w / 2 - t, cy - h / 2], [cx + w / 2 - t * 1.5, cy - h / 2 + h * 0.45], [cx + w / 2 - t * 0.7, cy + h / 2]], mat, { k: 0.26, bevel: false, seam: false });
    D.ln(cx - w / 2 + t + 1, cy - h / 2 + 1, cx - w / 2 + t + 3, cy - h / 2 + 1, C(mat, 7));
  },
  bomb(D, mat = M.iron) {
    D.disk(14, 19, 10, mat, { spec: 0.6, shine: 10 });
    D.rr(17, 6, 6, 5, 1, mat, { cylX: true });
    D.ring(14, 19, 10, 10.9, M.coal, { seam: false });
    D.line(20, 7, 25, 3.5, 1.6, M.burlap, { flat: true, k: 0.6 });
    D.halo(26, 3, 6, 0xffb040, 150);
    D.spark(26, 3, 2, 0xfffbe0, 0xffb030);
    D.px(28, 6, 0xffd060).px(24, 1, 0xff9a30);
  },
  clock(D, cx = 16, cy = 16, r = 12, rim = M.brass) {
    D.disk(cx, cy, r, rim, { spec: 0.5, shine: 12 });
    D.disk(cx, cy, r - 2.4, M.egg, { flat: true, k: 0.82, bevel: false });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const R = r - 3.6; D.px(cx + Math.cos(a) * R, cy + Math.sin(a) * R, i % 3 ? C(M.egg, 2) : C(M.iron, 1)); }
    D.ln(cx, cy, cx, cy - (r - 4.6), C(M.iron, 0)).ln(cx, cy, cx + (r - 6), cy + 1, C(M.iron, 0));
    D.px(cx, cy, C(M.cloth, 4));
  },
  hourglass(D, sand = M.bread) {
    D.rr(7, 3, 18, 3, 1, M.wood, { cylY: true });
    D.rr(7, 26, 18, 3, 1, M.wood, { cylY: true });
    D.shape((X, Y) => Y > 5.5 && Y < 26.5 && Math.abs(X - 16) <= 1.2 + Math.abs(Y - 16) * 0.68, M.ice, { normal: (X, Y) => { const w = 1.2 + Math.abs(Y - 16) * 0.68, s = Math.max(-1, Math.min(1, (X - 16) / w)); return [s, 0, Math.sqrt(1 - s * s)]; }, kmul: 0.75, spec: 0.8, shine: 16 });
    D.shape((X, Y) => ((Y > 9 && Y < 15) || (Y > 20.5 && Y < 26)) && Math.abs(X - 16) <= Math.abs(Y - 16) * 0.68 - 0.4, sand, { k: 0.66, rim: 0.2, seam: false });
    D.ln(16, 15, 16, 21, C(sand, 5));
    D.line(8.5, 6, 8.5, 26, 1.4, M.wood, { seam: false }).line(23.5, 6, 23.5, 26, 1.4, M.wood, { seam: false });
  },
  eye(D, cx = 16, cy = 16, w = 12, iris = M.sapphire) {
    D.shape((X, Y) => Math.abs(Y - cy) <= Math.cos(Math.min(1, Math.abs(X - cx) / w) * Math.PI / 2) * w * 0.55, M.egg, { k: 0.8, rim: 0.12 });
    D.disk(cx, cy, w * 0.42, iris, { spec: 0.2, seam: false, dome: 0.5 });
    D.disk(cx, cy, w * 0.2, M.coal, { flat: true, k: 0.1, bevel: false, seam: false });
    D.px(cx - w * 0.15, cy - w * 0.18, 0xffffff).px(cx - w * 0.15 + 1, cy - w * 0.18, 0xd0e0ff);
    D.shape((X, Y) => Math.abs(Y - cy + 0.6) <= Math.cos(Math.min(1, Math.abs(X - cx) / w) * Math.PI / 2) * w * 0.55 + 1 && Y < cy - Math.cos(Math.min(1, Math.abs(X - cx) / w) * Math.PI / 2) * w * 0.55 + 0.6, M.fur, { k: 0.35, bevel: false, seam: false });
  },
  /** The mole's star-nose: pink tentacles round a snout. */
  starNose(D, cx = 16, cy = 16, r = 9) {
    D.ell(cx - r * 0.9, cy + r * 0.25, r * 1.05, r * 0.8, M.fur, { spec: 0.15, shine: 5 });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 - Math.PI / 2;
      D.line(cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.45, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2.5, M.skin, { spec: 0.35, seam: false });
    }
    D.disk(cx, cy, r * 0.48, M.skin, { spec: 0.5 });
    D.disk(cx - 1.4, cy + 0.6, 0.9, M.meat, { flat: true, k: 0.05, bevel: false, seam: false });
    D.disk(cx + 1.4, cy + 0.6, 0.9, M.meat, { flat: true, k: 0.05, bevel: false, seam: false });
  },
  /** A mole's digging paw (pink palm, five ivory claws), pointing up. */
  paw(D, cx = 16, cy = 18, s = 1) {
    D.push(cx - 16 * s, cy - 18 * s, s);
    D.ell(16, 24, 9, 6, M.fur, { spec: 0.15 }); // the furry wrist
    D.ell(16, 18, 9.5, 7.5, M.skin, { spec: 0.3 });
    for (let i = 0; i < 5; i++) {
      const x = 8.4 + i * 3.8, top = 3 + Math.abs(i - 2) * 2;
      D.shape((X, Y) => { const t = (14 - Y) / (14 - top); if (t < 0 || t > 1) return false; const cx = x + (i - 2) * 0.6 * t + t * t * 1.4; return Math.abs(X - cx) <= 1.6 * (1 - t * 0.75) + 0.2; }, M.bone, { normal: (X, Y) => { const t = (14 - Y) / (14 - top), cx = x + (i - 2) * 0.6 * t + t * t * 1.4, s = Math.max(-1, Math.min(1, (X - cx) / (1.6 * (1 - t * 0.75) + 0.2))); return [s, -0.2, Math.sqrt(1 - s * s)]; }, spec: 0.7, shine: 10 });
    }
    D.ell(16, 19, 3.6, 2.6, M.skin, { k: 0.3, flat: true, bevel: false, seam: false, kadd: -0.2 });
    D.pop();
  },
  fist(D, mat = M.skin) {
    D.rr(8, 9, 17, 14, 4, mat, { k: 0.55, rim: 0.24 });
    for (let i = 0; i < 4; i++) D.ell(10.5 + i * 4, 10.5, 2.3, 2.6, mat, { spec: 0.3 });
    D.ell(9, 17, 3, 4.2, mat, { spec: 0.2 }); // thumb
    D.rr(10, 22, 13, 7, 2, M.fur, { cylX: true, spec: 0.1 }); // wrist fur
    for (let i = 1; i < 4; i++) D.ln(8.5 + i * 4, 9, 8.5 + i * 4, 13, C(mat, 1));
  },
  feather(D, mat = M.egg, vane = null) {
    vane = vane || mat;
    D.shape((X, Y) => {
      const u = ((X - 6) * 0.68 + (Y - 27) * -0.73), v = ((X - 6) * 0.73 + (Y - 27) * 0.68);
      if (u < 3 || u > 27) return false;
      const t = (u - 3) / 24;
      return Math.abs(v + Math.sin(t * 3) * 0.8) <= Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.95) * 5.2 + 0.3;
    }, vane, { k: 0.6, rim: 0.2, fn: (k, x, y, X, Y) => k + (((X - 6) * 0.73 + (Y - 27) * 0.68) > 0 ? -0.18 : 0.08) + (((Math.floor(X + Y)) % 4 === 0) ? -0.1 : 0) });
    D.ln(6, 27, 24, 6, C(M.bone, 2));
    D.ln(5, 28, 8, 25, C(M.bone, 1));
  },
  map(D, mat = M.paper) {
    D.poly([[3, 7], [11, 4], [20, 7], [29, 4], [29, 25], [20, 28], [11, 25], [3, 28]], mat, { k: 0.62, rim: 0.16, tex: 0.08, fn: (k, x, y, X) => k + (X < 11 ? 0.06 : X < 20 ? -0.08 : 0.04) });
    D.ln(11, 5, 11, 25, C(mat, 2)).ln(20, 8, 20, 27, C(mat, 2));
  },
  pot(D, mat = M.iron) {
    D.halo(16, 7, 8, 0xffffff, 40);
    D.ell(16, 19, 12, 9, mat, { spec: 0.4, shine: 8 });
    D.rr(4, 10, 24, 4, 1.5, mat, { cylY: true, kadd: 0.08 }); // the rim
    D.ell(16, 11, 10, 1.6, M.bread, { flat: true, k: 0.65, bevel: false, seam: false }); // stew
    D.line(2, 14, 5, 14, 2, mat).line(27, 14, 30, 14, 2, mat); // handles
  },
  steam(D, x = 16, y = 8, h = 7) {
    for (let i = -1; i <= 1; i++) for (let j = 0; j < h; j++) {
      const X = x + i * 4 + Math.sin(j * 0.9 + i * 2) * 1.2;
      if ((j + i) % 3 !== 2) { const [px, py] = D.pc(X, y - j); D.p.set(px, py, 0xfff4e6, 150 - j * 14); if (D.p.in(px, py)) D.noOutline[py * N + px] = 1; }
    }
  },
  knife(D, blade = M.steel) {
    D.poly([[5, 26], [21, 9], [26, 6], [24, 11], [8, 28]], blade, { k: 0.58, rim: 0.3 });
    D.ln(7, 26, 22, 10, C(blade, 7));
    D.line(19, 12, 26, 4.5, 3.2, M.dkwood, { flat: false });
    D.px(22, 9, C(M.brass, 6)).px(24, 7, C(M.brass, 6));
  },
  bowl(D, mat = M.wood, food = M.bread, o = {}) {
    D.ell(16, 17, 12.5, 3.2, food, { k: 0.66, flat: true, rim: 0.2 });
    D.shape((X, Y) => Y >= 17 && ((X - 16) / 13) ** 2 + ((Y - 17) / 10) ** 2 <= 1, mat, { normal: (X, Y) => { const nx = (X - 16) / 13, ny = (Y - 17) / 10; return [nx, ny * 0.5, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]; }, shine: 8, spec: 0.3 });
    D.rect(3, 16.5, 26, 1.2, mat, { k: 0.85, bevel: false, seam: false });
    if (o.stripe !== false) D.ln(6, 21, 26, 21, C(mat, 6));
  },
  spoon(D, mat = M.wood) {
    D.line(8, 28, 19, 13, 2.6, mat);
    D.ell(22.5, 8.5, 4.5, 6, mat, { spec: 0.3, shine: 8 });
    D.ell(22.5, 8.5, 2.8, 4.2, mat, { k: 0.3, flat: true, bevel: false, seam: false, kadd: -0.1 });
  },
  egg(D, cx = 16, cy = 17, s = 1, mat = M.egg) {
    D.shape((X, Y) => { const y = (Y - cy) / (10 * s), x = (X - cx) / (7.5 * s * (1 - y * 0.18)); return x * x + y * y <= 1; }, mat, { normal: (X, Y) => { const nx = (X - cx) / (7.5 * s), ny = (Y - cy) / (10 * s); return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]; }, shine: 9, spec: 0.5 });
  },
  star(D, cx = 16, cy = 16, R = 12, mat = M.gold, o = {}) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.45 : R; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    if (o.halo !== false) D.halo(cx, cy, R * 1.25, C(mat, 5), 90);
    D.poly(pts, mat, { k: 0.62, rim: 0.24, fn: (k, x, y, X, Y) => k + ((X - cx) * -0.02 + (Y - cy) * -0.02) + (Math.atan2(Y - cy, X - cx) % 0.63 > 0.31 ? 0.08 : -0.06) });
  },
  sprout(D, cx = 16, base = 28, mat = M.leaf) {
    D.line(cx, base, cx, base - 14, 2, mat, { spec: 0.2 });
    P.leaf(D, cx, base - 12, 11, -2.5, 0.42, mat);
    P.leaf(D, cx, base - 9, 10, -0.6, 0.42, mat);
  },
  plate(D, mat = M.iron) {
    // a breastplate
    D.poly([[6, 6], [11, 4], [16, 7], [21, 4], [26, 6], [27, 14], [24, 26], [16, 29], [8, 26], [5, 14]], mat, { k: 0.5, rim: 0.26, fn: (k, x, y, X, Y) => k + Math.cos((X - 13) / 9) * 0.18 - (Y - 6) * 0.008 });
    D.ln(16, 8, 16, 28, C(mat, 2)).ln(17, 8, 17, 28, C(mat, 6));
    D.ln(9, 16, 23, 16, C(mat, 2));
    for (const [x, y] of [[8, 8], [24, 8], [9, 19], [23, 19]]) D.disk(x, y, 1, M.brass, { spec: 0.6, seam: false });
  },
  drumstick(D) {
    D.line(6, 26, 13, 19, 2.6, M.bone, { spec: 0.5 });
    D.disk(5, 27.5, 1.8, M.bone, { spec: 0.4 }).disk(7, 29, 1.6, M.bone, { spec: 0.3 });
    D.shape((X, Y) => { const u = (X - 12) * 0.7 + (Y - 20) * -0.7, v = (X - 12) * 0.7 + (Y - 20) * 0.7; return u > 0 && u < 17 && Math.abs(v) <= Math.sin(Math.min(1, u / 15) * Math.PI * 0.62) * 8.5; }, M.bread, { normal: (X, Y) => { const nx = (X - 20) / 11, ny = (Y - 12) / 11; return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]; }, shine: 6, spec: 0.4, tex: 0.08 });
  },
  wind(D, mat = M.ice) {
    const gust = (y, len, r) => {
      D.line(3, y, 3 + len, y, 2, mat, { glow: true, seam: false });
      D.ring(3 + len, y - r, r - 1, r + 1, mat, { a0: -Math.PI / 2, a1: Math.PI * 0.5, glow: true, seam: false });
      D.ring(3 + len - r * 0.4, y - r - 0.2, r * 0.3, r * 0.3 + 1.6, mat, { a0: -Math.PI * 1.2, a1: -Math.PI * 0.45, glow: true, seam: false });
    };
    gust(13, 13, 4.5); gust(21, 16, 3.5); gust(28, 9, 2.6);
  },
  axe(D, head = M.steel) {
    D.line(9, 28, 20, 6, 3, M.wood, { shine: 6 });
    D.shape((X, Y) => { const dx = X - 19, dy = Y - 10; return dx > -2 && Math.hypot(dx + 3, dy) < 10 && dx < 9 && Math.abs(dy) < 2.5 + dx * 0.75; }, head, { k: 0.55, rim: 0.28, grad: [0.06, -0.1] });
    D.shape((X, Y) => { const dx = X - 19, dy = Y - 10; return dx > 5 && Math.hypot(dx + 3, dy) < 10 && Math.hypot(dx + 3, dy) >= 8.6; }, head, { k: 0.95, bevel: false, seam: false });
    D.poly([[18, 8], [21, 8], [20.5, 13], [17.5, 13]], M.brass, { k: 0.55, rim: 0.2 });
  },
  worm(D, mat = M.glow) {
    D.halo(17, 16, 14, C(mat, 5), 120);
    for (let i = 0; i < 9; i++) {
      const t = i / 8, x = 6 + t * 20, y = 18 + Math.sin(t * Math.PI * 1.6) * 5;
      D.disk(x, y, 3.1 - (i === 0 || i === 8 ? 0.6 : 0), mat, { spec: 0.6, shine: 8, glow: true, seam: i > 0 });
    }
    D.px(26, 14, OUT).px(27, 15, C(mat, 7));
  },
  tag(D, mat = M.paper) {
    D.poly([[13, 3], [28, 3], [28, 18], [15, 31], [1, 17]], mat, { k: 0.66, rim: 0.2, tex: 0.06 });
    D.disk(23, 8, 2.1, M.coal, { flat: true, k: 0.1, bevel: false, seam: false });
    D.ring(23, 8, 2.1, 3, M.brass, { seam: false });
  },
  scale(D, mat = M.brass) {
    D.rect(15, 6, 2.4, 20, mat, { cylX: true });
    D.rr(9, 25, 14, 3, 1, mat, { cylY: true });
    D.line(4, 9, 28, 9, 2, mat, { spec: 0.5 });
    D.disk(16, 5, 2, mat, { spec: 0.6 });
    D.ln(5, 10, 3, 17, C(mat, 2)).ln(5, 10, 8, 17, C(mat, 2)).ln(27, 10, 24, 17, C(mat, 2)).ln(27, 10, 30, 17, C(mat, 2));
    D.shape((X, Y) => Y >= 17 && Y <= 20 && Math.abs(X - 5.5) <= 4.5 - (Y - 17) * 0.6, mat, { k: 0.6 });
    D.shape((X, Y) => Y >= 17 && Y <= 20 && Math.abs(X - 26.5) <= 4.5 - (Y - 17) * 0.6, mat, { k: 0.6 });
  },
  mask(D, mat = M.leather) {
    D.shape((X, Y) => { const x = (X - 16) / 14, y = (Y - 15) / 8; return x * x + y * y * (1 + Math.max(0, -x * 0) ) <= 1 && !(Y > 18 && Math.abs(X - 16) < 3); }, mat, { normal: (X, Y) => { const nx = (X - 16) / 15, ny = (Y - 15) / 10; return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]; }, shine: 7, spec: 0.3 });
    D.ell(10, 14, 3.2, 2.2, M.coal, { flat: true, k: 0.05, bevel: false, seam: false });
    D.ell(22, 14, 3.2, 2.2, M.coal, { flat: true, k: 0.05, bevel: false, seam: false });
    D.line(1, 13, 4, 14, 1.4, M.cloth, { seam: false }).line(28, 14, 31, 13, 1.4, M.cloth, { seam: false });
  },
  jar(D, glass = M.ice, o = {}) {
    D.rr(7, 9, 18, 20, 5, glass, { cylX: true, kmul: 0.7, spec: 0.8, shine: 16 });
    D.rr(9, 5, 14, 5, 1, o.lid || M.iron, { cylX: true });
    D.ln(10, 12, 10, 24, 0xffffff, 170);
  },
  pouch(D, mat = M.leather) {
    D.ell(16, 21, 9, 8, mat, { spec: 0.2, shine: 5, tex: 0.08 });
    D.poly([[11, 14], [21, 14], [23, 8], [9, 8]], mat, { k: 0.55, tex: 0.08 });
    D.line(9.5, 13, 22.5, 13, 1.8, M.burlap, { spec: 0.2 });
  },
};

// ---------------------------------------------------------------- recipes
// Each icon: D => draw. Kept readable rather than short: what each skill *does* is what you see.
const R = {
  // ---------------- Mining
  m_paws: (D) => {
    // a pick bitten deep into a boulder, cracks running out from the blow
    D.shape((X, Y) => Math.hypot((X - 19) / 1.15, Y - 23) < 10.5 && Y < 31, M.stone, { k: 0.5, tex: 0.22, seed: 4 });
    D.ln(17, 17, 13, 21, OUT).ln(13, 21, 14, 26, OUT).ln(19, 18, 24, 21, OUT).ln(24, 21, 27, 20, OUT).ln(18, 19, 19, 25, OUT).ln(19, 25, 17, 29, OUT);
    D.push(-6, 3, 1.02); P.pick(D, M.steel); D.pop();
    D.tint((X, Y) => Math.hypot((X - 19) / 1.15, Y - 23) < 10.5 && X > 17.5 && Y > 16.5 && Y < 22 && X < 24, () => C(M.stone, 3));
    for (const [x, y] of [[29, 11], [30, 16], [25, 9], [10, 12]]) D.px(x, y, C(M.stone, 6)).px(x + 1, y + 1, C(M.stone, 2));
    D.spark(23, 13, 2, 0xfffbe0, 0xffc050);
  },
  m_swing: (D) => {
    for (let i = 0; i < 3; i++) D.arc(23, 23, 18 - i * 3, -Math.PI * 0.95, -Math.PI * 0.6, [0xfff6d8, 0xe8d4a0, 0xb8a070][i]);
    D.push(3, 3, 0.85); P.pick(D, M.steel); D.pop();
  },
  m_steady: (D) => {
    D.push(-2, 2, 0.95); P.pick(D, M.iron, { glint: false }); D.pop();
    D.push(10, -6, 0.62); P.feather(D, M.egg); D.pop();
  },
  m_tunnel: (D) => {
    D.shape((X, Y) => Y > 4 && (Y > 15 || Math.hypot(X - 16, Y - 15) < 12.5) && X > 3.5 && X < 28.5, M.stone, { k: 0.5, tex: 0.25, seed: 5 });
    D.shape((X, Y) => Y > 9 && (Y > 17 || Math.hypot(X - 16, Y - 17) < 8) && X > 8 && X < 24 && Y < 29, M.coal, { k: 0.15, bevel: false, seam: false, fn: (k, x, y, X, Y) => k + (Y - 10) * 0.012 });
    D.rect(6, 8, 3, 21, M.wood, { cylX: true }).rect(23, 8, 3, 21, M.wood, { cylX: true });
    D.rect(5, 6.5, 22, 3, M.wood, { cylY: true });
    D.halo(16, 20, 5, 0xffc050, 120);
    D.push(10.5, 16, 0.32); P.lantern(D); D.pop();
    D.push(16, -3, 0.5); D.poly([[14, 2], [9, 15], [15, 15], [11, 28], [23, 11], [17, 11], [21, 2]], M.gold, { k: 0.75, rim: 0.2, glow: true }); D.pop();
  },
  m_pockets: (D) => {
    P.bag(D, M.leather, { tie: M.burlap });
    D.rr(8, 17, 8, 8, 1.5, M.burlap, { k: 0.6, tex: 0.12 });
    D.rr(17, 18, 8, 7, 1.5, M.burlap, { k: 0.5, tex: 0.12 });
    for (let x = 9; x < 16; x += 2) D.px(x, 18, C(M.bone, 5));
    for (let x = 18; x < 25; x += 2) D.px(x, 19, C(M.bone, 5));
    D.ln(8, 16, 8, 24, C(M.bone, 4));
    D.disk(12, 15.5, 2, M.copper, { spec: 0.4 }); D.disk(21, 16.5, 1.8, M.emerald, { spec: 0.6 });
  },
  m_nose: (D) => {
    D.push(-3, 3); P.starNose(D, 13, 17, 10); D.pop();
    D.shape((X, Y) => Math.hypot(X - 26, Y - 7) < 5.5, M.stone, { k: 0.5, tex: 0.25 });
    D.disk(26, 7, 2.2, M.copper, { spec: 0.7 });
    D.spark(27, 2, 2); D.spark(30, 12, 1);
    D.arc(18, 12, 6, -1.2, -0.4, 0xfff0c0).arc(18, 12, 8.5, -1.25, -0.35, 0xc8a870);
  },
  m_blast: (D) => {
    P.bomb(D);
    for (const [x, y, a] of [[3, 6, 0], [1, 14, 0], [5, 2, 0]]) D.px(x, y, 0xffc050, 200 + a);
    D.arc(14, 19, 13, -2.6, -1.9, 0xffd27a).arc(14, 19, 14.5, -2.5, -2.0, 0xff9a30);
  },
  m_brute: (D) => {
    D.shape((X, Y) => Y > 18 && Math.hypot((X - 16) / 1.4, Y - 30) < 11, M.stone, { k: 0.5, tex: 0.2, seed: 9 });
    D.ln(16, 19, 13, 24, OUT).ln(13, 24, 15, 29, OUT).ln(16, 19, 20, 25, OUT).ln(20, 25, 19, 30, OUT);
    D.push(0, -5, 0.9); P.fist(D, M.skin); D.pop();
    for (const [x, y] of [[3, 17], [28, 18], [5, 23], [27, 24]]) D.px(x, y, C(M.stone, 6)).px(x + 1, y + 1, C(M.stone, 3));
    D.arc(16, 12, 14, Math.PI * 1.1, Math.PI * 1.35, 0xffe8a8).arc(16, 12, 14, -Math.PI * 0.35, -Math.PI * 0.1, 0xffe8a8);
  },
  m_finesse: (D) => {
    D.shape((X, Y) => Math.hypot((X - 14) / 1.15, Y - 20) < 10.5, M.stone, { k: 0.5, tex: 0.22, seed: 12 });
    P.gem(D, 14, 19, 6, M.sapphire);
    D.push(9, -9, 0.7); D.line(6, 26, 20, 10, 2, M.wood); D.line(19, 11, 26, 4, 1.4, M.steel, { spec: 0.8 }); D.pop();
    D.spark(25, 26, 2);
  },
  m_rhythm: (D) => {
    D.push(-3, 0, 0.88); P.hourglass(D, M.gold); D.pop();
    D.push(12, 10, 0.6); P.pick(D, M.steel, { glint: false }); D.pop();
    D.arc(16, 16, 15, -2.6, -2.1, 0xfff0c0).arc(16, 16, 15, 0.5, 1.0, 0xfff0c0);
  },
  m_mother: (D) => {
    D.shape((X, Y) => Y > 17 && Math.hypot((X - 16) / 1.5, Y - 31) < 13, M.stone, { k: 0.48, tex: 0.25, seed: 15 });
    P.gem(D, 9, 22, 4, M.ruby, { spark: false }); P.gem(D, 23, 23, 3.5, M.emerald, { spark: false });
    D.disk(16, 26, 2.6, M.gold, { spec: 0.8 }); D.disk(12, 28, 1.8, M.copper, { spec: 0.6 }); D.disk(21, 28.5, 1.6, M.silver, { spec: 0.7 });
    D.push(4, -1, 0.75); P.crown(D, M.gold, M.sapphire); D.pop();
    D.spark(4, 6, 2); D.spark(28, 4, 1);
  },
  m_mule: (D) => {
    // a big hauler's pack with a bedroll on top
    D.rr(6, 8, 20, 21, 4, M.leather, { k: 0.52, rim: 0.24, tex: 0.08 });
    D.rr(5, 3, 22, 6, 3, M.burlap, { cylY: true, tex: 0.1 }); // bedroll
    D.ln(10, 3, 10, 8, C(M.leather, 2)).ln(22, 3, 22, 8, C(M.leather, 2));
    D.rr(9, 14, 14, 10, 2, M.leather, { k: 0.66, rim: 0.2 }); // the flap pocket
    D.rect(15, 18, 2, 3, M.brass, { spec: 0.6 });
    D.line(3, 11, 3, 27, 2.2, M.burlap).line(29, 11, 29, 27, 2.2, M.burlap); // straps
    D.push(14, -1, 0.42); P.pick(D, M.iron, { glint: false }); D.pop();
  },

  // ---------------- Smithing
  s_bellows: (D) => {
    P.flame(D, 25, 30, 17, 9);
    // the leather pleats between two boards, side-on, nozzle to the right
    D.poly([[3, 9], [15, 11], [21, 15], [15, 19], [3, 22]], M.leather, { k: 0.5, rim: 0.2, fn: (k, x) => k + (x % 3 === 0 ? -0.22 : x % 3 === 1 ? 0.12 : 0) });
    D.poly([[1, 6], [14, 9], [21, 14.5], [14, 11.5], [1, 9.5]], M.wood, { k: 0.62, rim: 0.24 });
    D.poly([[1, 21], [14, 19.5], [21, 16], [14, 23], [1, 25]], M.wood, { k: 0.45, rim: 0.24 });
    D.line(20, 15.5, 25, 18.5, 2.6, M.brass, { spec: 0.6 });
    D.disk(8, 8.4, 1.2, M.brass, { spec: 0.6, seam: false }).disk(8, 22.6, 1.2, M.brass, { spec: 0.6, seam: false });
    D.line(0, 5, 3, 7, 1.8, M.wood).line(0, 26, 3, 24, 1.8, M.wood);
    for (let i = 0; i < 4; i++) D.px(27 - i, 9 + i * 2, [0xffd060, 0xff9a30, 0xffc050, 0xff7a20][i]);
  },
  s_eye: (D) => {
    D.halo(16, 16, 15, 0xff8a30, 110);
    P.eye(D, 16, 16, 13, M.flame);
    D.disk(16, 16, 2.4, M.coal, { flat: true, k: 0.1, bevel: false, seam: false });
    D.spark(25, 6, 2, 0xfffbe0, 0xff9a30); D.px(6, 25, 0xff9a30).px(26, 24, 0xffc050);
  },
  s_thrift: (D) => {
    P.ingot(D, 14, 21, 22, M.copper);
    P.ingot(D, 22, 12, 13, M.copper);
    D.spark(27, 5, 2); D.spark(5, 10, 1);
    D.line(25, 23, 25, 29, 1.6, M.gold, { flat: true, k: 0.9, glow: true }); D.line(22, 26, 28, 26, 1.6, M.gold, { flat: true, k: 0.9, glow: true, seam: false });
  },
  s_arm: (D) => {
    // an iron-gauntleted fist round a hammer's handle, an energy bolt that barely flickers
    P.hammer(D, M.iron);
    D.push(-4, 7, 0.62); P.fist(D, M.steel); D.pop();
    D.push(15, 13, 0.45); P.bolt(D, M.leaf); D.pop();
  },
  s_finish: (D) => {
    P.sword(D, M.silver);
    D.spark(20, 11, 3); D.spark(27, 3, 1); D.spark(13, 19, 1);
    D.arc(18, 14, 9, -2.4, -1.4, 0xffffff, 160);
  },
  s_crucible: (D) => {
    D.halo(20, 24, 10, 0xffa030, 140);
    D.poly([[3, 6], [17, 6], [15, 18], [5, 18]], M.stone, { k: 0.55, rim: 0.25, tex: 0.1 });
    D.ell(10, 7, 6.5, 1.6, M.flame, { flat: true, k: 0.95, bevel: false, glow: true, seam: false });
    D.line(16, 7, 21, 4, 2, M.iron);
    D.shape((X, Y) => X > 15 && X < 19 && Y > 7 && Y < 24 && Math.abs(X - 16.5 - (Y - 7) * 0.12) < 1.2, M.flame, { k: 0.85, bevel: false, glow: true });
    D.poly([[11, 23], [29, 23], [27, 28], [13, 28]], M.iron, { k: 0.4, rim: 0.2 });
    D.ell(20, 23.5, 7.5, 1.4, M.flame, { flat: true, k: 0.9, bevel: false, glow: true, seam: false });
  },
  s_quench: (D) => {
    D.rr(5, 17, 22, 12, 3, M.wood, { cylX: true, tex: 0.08 });
    D.rect(5, 20, 22, 2, M.iron, { cylY: true, seam: false }).rect(5, 25, 22, 2, M.iron, { cylY: true, seam: false });
    D.ell(16, 17.5, 10, 1.8, M.water, { flat: true, k: 0.7, bevel: false });
    D.push(6, -8, 0.8); D.poly([[8, 22], [21, 9], [24, 8], [23, 11], [10, 24]], M.flame, { k: 0.75, rim: 0.2, glow: true }); D.line(4, 26, 9, 21, 2.4, M.leather); D.pop();
    P.steam(D, 15, 13, 9);
  },
  s_master: (D) => {
    D.push(0, 4); P.anvil(D, M.iron); D.pop();
    D.push(10, -6, 0.62); P.hammer(D, M.steel); D.pop();
    D.spark(10, 9, 2, 0xfffbe0, 0xff9a30); D.px(6, 7, 0xffc050).px(13, 5, 0xff9a30).px(4, 11, 0xff7a20);
    D.disk(16, 21, 2, M.gold, { spec: 0.7, seam: false }); // the maker's mark
  },
  s_sure: (D) => {
    // tongs holding a glowing bar, a hammer behind
    D.push(4, -4, 0.75); P.hammer(D, M.iron, { band: false }); D.pop();
    D.line(3, 27, 17, 16, 1.8, M.iron).line(5, 29, 18, 18, 1.8, M.iron);
    D.halo(22, 13, 8, 0xff8a30, 130);
    D.line(17, 17, 27, 9, 3.2, M.flame, { flat: true, k: 0.8, glow: true });
    D.ln(18, 15, 26, 9, 0xfff4c0);
  },
  s_jewel: (D) => {
    // a sword hilt: crossguard, grip, and a big pommel gem
    D.line(16, 3, 16, 13, 4, M.steel);
    D.line(5, 14, 27, 14, 3, M.gold, { spec: 0.6 });
    D.line(16, 16, 16, 23, 3.4, M.leather);
    for (let y = 17; y < 23; y += 2) D.ln(15, y, 17, y + 1, C(M.leather, 1));
    D.disk(16, 26.5, 4.6, M.gold, { spec: 0.6 });
    P.gem(D, 16, 26, 3.2, M.emerald, { spark: false });
    D.spark(23, 23, 2); D.spark(8, 6, 1);
  },
  s_legend: (D) => {
    D.push(0, 7, 1); P.anvil(D, M.iron); D.pop();
    D.push(-2, -4, 0.72); P.sword(D, M.steel, { guard: M.gold }); D.pop();
    D.push(13, -2, 0.55); P.crown(D); D.pop();
    D.spark(4, 4, 2);
  },

  // ---------------- Cooking
  c_nose: (D) => {
    D.push(0, 4); P.pot(D, M.iron); D.pop();
    P.steam(D, 16, 11, 9);
    D.arc(16, 4, 5, 0.2, 2.9, 0xffe8c0, 200);
  },
  c_knife: (D) => {
    // a carrot chopped into coins
    D.line(3, 22, 13, 26, 5, M.orange, { spec: 0.3 });
    D.leaf(3, 21, 4, -2.6, 0.4); D.leaf(3, 22, 4, 3.4, 0.4);
    for (const [x, y] of [[17, 27], [22, 28], [27, 27.5]]) { D.ell(x, y, 2.4, 1.6, M.orange, { spec: 0.3 }); D.px(x, y, C(M.orange, 6)); }
    D.push(4, -6, 0.85); P.knife(D); D.pop();
  },
  c_helping: (D) => {
    P.bowl(D, M.wood, M.bread);
    D.disk(12, 15, 2.2, M.meat, { spec: 0.4, seam: false }).disk(18, 14.5, 2, M.leaf, { spec: 0.3, seam: false }).disk(22, 15.5, 1.8, M.orange, { spec: 0.3, seam: false });
    // a ladle tipping in a second helping
    D.line(26, 2, 21, 10, 1.6, M.iron);
    D.ell(19, 11, 3.6, 2.4, M.iron, { spec: 0.6 });
    D.disk(18, 13.6, 1, M.bread, { flat: true, k: 0.7, seam: false });
    D.shape((X, Y) => X > 26 && X < 31 && Y > 22 && Y < 30 && (Math.abs(X - 28.5) < 0.9 || Math.abs(Y - 26) < 0.9), M.gold, { k: 0.9, bevel: false, glow: true });
  },
  c_hearty: (D) => {
    P.heart(D, 16, 17, 1.05, M.meat);
    D.ell(11, 11, 2.4, 1.5, M.egg, { flat: true, k: 0.9, bevel: false, seam: false });
    D.line(23, 22, 29, 28, 2.4, M.bone, { spec: 0.4 }); D.disk(29.5, 27.5, 1.6, M.bone).disk(28, 29.5, 1.5, M.bone);
    P.steam(D, 16, 5, 4);
  },
  c_instinct: (D) => {
    D.push(-4, 2, 0.95); P.spoon(D, M.wood); D.pop();
    D.ell(18.5, 10.5, 2.2, 3, M.bread, { flat: true, k: 0.85, bevel: false, seam: false });
    D.spark(25, 4, 3); D.spark(28, 14, 1); D.spark(6, 6, 1);
    D.push(14, 16, 0.42); P.star(D, 16, 16, 12, M.gold, { halo: false }); D.pop();
  },
  c_simmer: (D) => {
    D.push(0, -1); P.pot(D, M.copper); D.pop();
    D.push(0, 3); P.flame(D, 9, 30, 8, 6); P.flame(D, 16, 30, 10, 7); P.flame(D, 23, 30, 8, 6); D.pop();
    D.push(17, -2, 0.42); P.clock(D, 16, 16, 12); D.pop();
  },
  c_egg: (D) => {
    // an iron pan with a fried egg — "you could eat a rock"
    D.line(2, 25, 9, 21, 2.6, M.dkwood);
    D.ell(19, 20, 12, 7, M.iron, { spec: 0.3 });
    D.ell(19, 19, 9.6, 5, M.coal, { flat: true, k: 0.4, bevel: false, seam: false });
    D.shape((X, Y) => { const a = Math.atan2(Y - 18.5, X - 19); return Math.hypot((X - 19) / 1.5, Y - 18.5) < 4.6 + Math.sin(a * 5) * 0.6; }, M.egg, { k: 0.82, rim: 0.12 });
    D.disk(19.5, 18, 2.4, M.gold, { spec: 0.7, shine: 6 });
    D.disk(5, 9, 3.2, M.stone, { spec: 0.15, tex: 0.2 }); D.disk(11, 6, 2.2, M.stone, { spec: 0.15 });
  },
  c_feast: (D) => {
    D.ell(16, 23, 14, 5.5, M.silver, { spec: 0.6, dome: 0.4 });
    D.ell(16, 22, 11, 3.6, M.egg, { flat: true, k: 0.7, bevel: false, seam: false });
    D.ell(16, 17, 9, 6.5, M.bread, { spec: 0.4, shine: 6, tex: 0.08 }); // a roast
    D.line(22, 14, 27, 9, 2.2, M.bone, { spec: 0.4 }); D.disk(27.5, 8.5, 1.6, M.bone);
    D.disk(7, 20, 2, M.leaf, { spec: 0.3 }).disk(25, 21, 2, M.cloth, { spec: 0.4 }).disk(10, 22, 1.6, M.orange, { spec: 0.3 });
    P.steam(D, 15, 9, 6);
  },
  c_gourmet: (D) => {
    D.halo(16, 19, 13, 0xfff0b0, 70);
    D.ell(16, 25, 14, 4, M.silver, { spec: 0.6, dome: 0.4 });
    D.shape((X, Y) => Y <= 23 && Math.hypot((X - 16) / 1.2, Y - 23) <= 11, M.silver, { normal: (X, Y) => { const nx = (X - 16) / 13.2, ny = (Y - 23) / 11; return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]; }, shine: 14, spec: 0.8 });
    D.disk(16, 11, 2, M.silver, { spec: 0.6 });
    D.push(17, 9, 0.38); P.star(D, 16, 16, 12, M.gold, { halo: false }); D.pop();
    D.spark(6, 13, 2);
  },
  c_spice: (D) => {
    D.rect(2, 25, 28, 3, M.wood, { cylY: true });
    const jar = (x, h, sp) => { D.rr(x, 25 - h, 7, h, 2, M.ice, { cylX: true, kmul: 0.75, spec: 0.7 }); D.rr(x + 1, 25 - h + 3, 5, h - 4, 1, sp, { k: 0.6, rim: 0.15, seam: false }); D.rr(x, 25 - h - 2, 7, 3, 1, M.wood, { cylX: true }); };
    jar(3, 12, M.cloth); jar(12, 16, M.leaf); jar(21, 10, M.gold);
    D.push(17, -2, 0.36); P.leaf(D, 4, 20, 14, -0.9); P.leaf(D, 6, 22, 12, -0.3); D.pop();
  },
  c_chef: (D) => {
    // a tall chef's toque, a ladle and a wooden spoon crossed behind it
    D.line(4, 28, 26, 6, 2, M.wood).line(28, 28, 6, 6, 2, M.iron);
    D.ell(5.5, 5.5, 2.8, 2, M.iron, { spec: 0.5 });
    D.rr(9, 19, 14, 7, 2, M.egg, { k: 0.75, rim: 0.15 });
    D.disk(10, 13, 5.5, M.egg, { spec: 0.15 }).disk(22, 13, 5.5, M.egg, { spec: 0.15 }).disk(16, 10, 6.5, M.egg, { spec: 0.2 });
    D.rect(9, 18, 14, 2, M.egg, { k: 0.45, bevel: false, seam: false });
    D.push(8, 13, 0.5); P.crown(D); D.pop();
  },

  // ---------------- Combat
  f_guard: (D) => { P.shield(D, M.wood, M.iron); D.arc(16, 16, 15, -2.5, -0.65, 0xfff4c0, 200); },
  f_claws: (D) => {
    // three red slashes, and the claws that made them
    for (let i = 0; i < 3; i++) D.shape((X, Y) => { const u = X - 4 - i * 6, v = Y - 3; const t = (u + v * 0.15) / 22; if (t < 0 || t > 1) return false; return Math.abs(v - t * 22 - Math.sin(t * 3) * 1.5) <= Math.sin(t * Math.PI) * 1.4; }, M.cloth, { k: 0.75, bevel: false, glow: true });
    D.ell(9, 26, 8, 5.5, M.fur, { spec: 0.15 });
    for (let i = 0; i < 3; i++) {
      const bx = 6 + i * 4.5, by = 23 - i * 1.2;
      D.shape((X, Y) => { const t = (bx - X + (Y - by) * 0) ; const u = (X - bx), v = (by - Y); if (u < -1 || v < 0 || v > 11) return false; const cx = bx + v * 0.9 - v * v * 0.04; return Math.abs(X - cx) <= 1.7 * (1 - v / 11.5) + 0.25; }, M.bone, { k: 0.66, rim: 0.3 });
    }
  },
  f_hide: (D) => {
    D.shape((X, Y) => { const a = Math.atan2(Y - 16, X - 16), r = 12 + Math.sin(a * 4) * 1.6 + Math.sin(a * 7) * 0.6; return Math.hypot(X - 16, (Y - 16) * 1.1) < r; }, M.leather, { k: 0.56, rim: 0.24, tex: 0.12, seed: 8 });
    for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 4 + (i % 3) * 2.6; D.px(16 + Math.cos(a) * r, 16 + Math.sin(a) * r, C(M.leather, 1)); }
    D.line(6, 12, 12, 9, 1.2, M.burlap, { seam: false }).line(20, 23, 26, 20, 1.2, M.burlap, { seam: false });
    for (const x of [7, 9, 11]) D.px(x, 12 - (x - 7) * 0.5, C(M.burlap, 1));
    D.push(17, 15, 0.45); P.shield(D, M.iron, M.iron); D.pop();
  },
  f_hunger: (D) => { P.drumstick(D); D.push(18, -2, 0.42); P.bolt(D); D.pop(); },
  f_parry: (D) => {
    D.push(0, 0); P.sword(D, M.steel); D.pop();
    D.push(0, 0, 1, true); P.sword(D, M.steel, { guard: M.iron }); D.pop();
    D.halo(16, 13, 8, 0xfff0a0, 160);
    D.spark(16, 13, 3); D.px(12, 9, 0xffd060).px(20, 9, 0xffd060).px(19, 17, 0xffa030);
  },
  f_wind: (D) => { P.wind(D); D.push(15, 12, 0.5); P.heart(D, 16, 16, 1, M.cloth); D.pop(); D.spark(26, 4, 2); },
  f_riposte: (D) => {
    // the sword, and the stars circling the thing that ran into it
    P.sword(D, M.steel);
    D.ring(19, 9, 7, 8.4, M.gold, { glow: true, seam: false, a0: -Math.PI, a1: Math.PI * 0.15 });
    for (const [x, y] of [[11, 8], [20, 2], [26, 12]]) { D.push(x - 16 * 0.32, y - 16 * 0.32, 0.32); P.star(D, 16, 16, 12, M.gold, { halo: false }); D.pop(); }
  },
  f_berserk: (D) => {
    D.halo(16, 16, 16, 0xff3020, 110);
    D.push(-3, 1, 1.12); P.axe(D, M.steel); D.pop();
    D.arc(16, 16, 14, 2.2, 3.2, 0xff6040).arc(16, 16, 12, 2.4, 3.0, 0xffa060);
    D.px(4, 4, 0xff5030).px(28, 26, 0xff5030).px(6, 28, 0xffa060);
  },
  f_bulwark: (D) => {
    // a tower shield, iron banded, studded
    D.rr(6, 2, 20, 28, 3, M.iron, { k: 0.5, rim: 0.28 });
    D.rr(8.5, 4.5, 15, 23, 2, M.wood, { k: 0.55, tex: 0.08, fn: (k, x) => k + (x % 4 === 0 ? -0.14 : 0) });
    D.rect(8, 10, 16, 2.2, M.iron, { cylY: true, seam: false }).rect(8, 20, 16, 2.2, M.iron, { cylY: true, seam: false });
    D.disk(16, 16, 3.4, M.iron, { spec: 0.8 });
    for (const [x, y] of [[10, 11], [22, 11], [10, 21], [22, 21]]) D.px(x, y, C(M.iron, 7));
  },
  f_tough: (D) => {
    P.fist(D, M.skin);
    for (const [a, b, c, d] of [[3, 30, 10, 21], [29, 29, 22, 20], [6, 6, 10, 12]]) D.line(a, b, c, d, 1.8, M.wood, { spec: 0.1 });
    D.line(10, 12, 22, 20, 1.6, M.wood, { seam: false });
    D.leaf(3, 28, 5, -1.4, 0.45); D.leaf(28, 27, 5, -2.0, 0.45);
  },
  f_champ: (D) => {
    // a gold trophy cup with a crown etched on it
    D.halo(16, 13, 14, 0xffe080, 100);
    D.shape((X, Y) => Y >= 4 && Y <= 17 && Math.abs(X - 16) <= 10 - Math.pow((Y - 4) / 13, 2) * 7, M.gold, { normal: (X, Y) => { const w = 10 - Math.pow((Y - 4) / 13, 2) * 7, s = Math.max(-1, Math.min(1, (X - 16) / w)); return [s, 0.1, Math.sqrt(1 - s * s)]; }, shine: 12, spec: 0.6 });
    D.ring(5, 9, 2.4, 4, M.gold, { a0: Math.PI * 0.5, a1: Math.PI * 1.5 }).ring(27, 9, 2.4, 4, M.gold, { a0: -Math.PI * 0.5, a1: Math.PI * 0.5 });
    D.rect(14.5, 17, 3, 5, M.gold, { cylX: true });
    D.rr(9, 22, 14, 3, 1, M.gold, { cylY: true }).rr(7, 25, 18, 4, 1, M.dkwood, { cylY: true });
    D.ell(16, 4.5, 9.5, 1.4, M.gold, { flat: true, k: 0.3, bevel: false, seam: false });
    D.push(10, 6, 0.38); P.crown(D, M.gold, M.ruby); D.pop();
  },

  // ---------------- Exploring
  e_lamp: (D) => { P.lantern(D, M.flame, M.brass); D.spark(27, 7, 2); D.spark(4, 10, 1); },
  e_ink: (D) => {
    P.map(D);
    D.ln(6, 22, 10, 15, C(M.cloth, 3)).ln(10, 15, 15, 19, C(M.cloth, 3)).ln(15, 19, 19, 12, C(M.cloth, 3));
    D.px(19, 11, C(M.cloth, 2)).px(18, 12, C(M.cloth, 5)).px(20, 12, C(M.cloth, 5));
    // a quill dipping in
    D.push(10, -10, 0.72); P.feather(D, M.egg); D.pop();
    D.disk(24, 25, 4, M.coal, { spec: 0.6 }); D.rect(22, 20, 4, 3, M.coal, { cylX: true });
  },
  e_feet: (D) => {
    D.push(-1, 2, 0.95); P.boot(D, M.leather); D.pop();
    D.push(-6, -10, 0.55); P.feather(D, M.egg); D.pop();
    D.ln(0, 22, 5, 22, 0xfff4d8).ln(1, 26, 6, 26, 0xe8d4a8).ln(2, 18, 6, 18, 0xc8b488);
  },
  e_sleeper: (D) => {
    D.halo(14, 14, 13, 0xfff0b0, 90);
    D.shape((X, Y) => Math.hypot(X - 14, Y - 15) < 11 && Math.hypot(X - 19, Y - 11) > 9, M.gold, { normal: (X, Y) => { const nx = (X - 14) / 12, ny = (Y - 15) / 12; return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))]; }, spec: 0.3 });
    // a little night cap on the moon's horn
    D.poly([[13, 5], [6, 1], [3, 7]], M.blue, { k: 0.55, rim: 0.2 }); D.disk(3, 7, 1.4, M.egg);
    D.px(23, 18, 0xe8e8ff).px(26, 7, 0xffffff).px(28, 22, 0xc8d0ff);
    // "z"s
    D.ln(22, 2, 25, 2, 0xfff4d8).ln(25, 2, 22, 5, 0xfff4d8).ln(22, 5, 25, 5, 0xfff4d8);
    D.ln(27, 9, 29, 9, 0xe0d8c0).ln(29, 9, 27, 11, 0xe0d8c0).ln(27, 11, 29, 11, 0xe0d8c0);
    D.push(15, 16, 0.45); P.clover(D); D.pop();
  },
  e_sure: (D) => {
    D.shape((X, Y) => Y > 23 && X < 29, M.stone, { k: 0.5, tex: 0.25, seed: 21 });
    D.shape((X, Y) => Y > 26 && X >= 29, M.stone, { k: 0.4, tex: 0.25, seed: 21 });
    D.push(-2, -3, 0.9); P.boot(D, M.leather, M.iron); D.pop();
    for (let x = 8; x < 25; x += 4) D.px(x, 24, C(M.steel, 7)); // hobnails
    D.arc(16, 10, 13, Math.PI * 0.95, Math.PI * 1.25, 0xfff4d8);
  },
  e_path: (D) => { P.compass(D, 16, 17, 12); D.spark(28, 5, 2); },
  e_breath: (D) => {
    // a big bubble of breath leaving a mole snout
    D.push(-7, 8, 0.7); P.starNose(D, 16, 16, 9); D.pop();
    for (const [x, y, r] of [[18, 14, 7], [26, 6, 3.6], [27, 15, 2.4], [12, 4, 2]]) {
      D.disk(x, y, r, M.ice, { glow: true, seam: false, kmul: 0.55, spec: 0.9, shine: 20 });
      D.ring(x, y, r - 1, r, M.ice, { glow: true, seam: false, kadd: 0.2 });
      D.px(x - r * 0.45, y - r * 0.45, 0xffffff).px(x - r * 0.45 + 1, y - r * 0.45, 0xffffff);
    }
    D.arc(18, 14, 4, -2.6, -1.6, 0xe8f8ff);
  },
  e_carto: (D) => {
    // a rolled map, a pair of brass dividers stepping across it
    D.rr(3, 8, 26, 17, 2, M.paper, { k: 0.65, tex: 0.08 });
    D.rect(2, 7, 4, 19, M.paper, { cylX: true }).rect(26, 7, 4, 19, M.paper, { cylX: true });
    D.ln(8, 20, 12, 13, C(M.paper, 2)).ln(12, 13, 17, 17, C(M.paper, 2)).ln(17, 17, 23, 11, C(M.paper, 2));
    D.ln(9, 12, 10, 13, C(M.leaf, 3)).ln(20, 20, 22, 19, C(M.water, 4)).ln(21, 21, 23, 20, C(M.water, 4));
    D.line(16, 3, 10, 27, 1.6, M.brass, { spec: 0.6 }).line(16, 3, 22, 27, 1.6, M.brass, { spec: 0.6 });
    D.disk(16, 3.5, 2, M.brass, { spec: 0.7 });
    D.px(10, 28, C(M.steel, 6)).px(22, 28, C(M.steel, 6));
  },
  e_glow: (D) => {
    P.worm(D, M.glow);
    D.spark(6, 6, 2, 0xf0fff8, 0x7cf0c4); D.spark(26, 26, 1, 0xf0fff8, 0x7cf0c4); D.spark(24, 5, 1, 0xf0fff8, 0x7cf0c4);
  },
  e_star: (D) => {
    // a brass spyglass pointed at a twinkling star
    D.push(-6, -6, 0.6); P.star(D, 16, 16, 12, M.gold); D.pop();
    D.line(3, 29, 10, 24, 4.2, M.leather, { square: true });
    D.line(9, 24.7, 18, 18.4, 5.4, M.brass, { square: true, spec: 0.6 });
    D.line(17, 19.1, 27, 12, 7, M.brass, { square: true, spec: 0.7 });
    D.line(9, 24.7, 10.2, 23.9, 6, M.brass, { square: true, kadd: -0.25 });
    D.line(17, 19.1, 18.4, 18.1, 7.6, M.brass, { square: true, kadd: -0.25 });
    D.line(26.4, 12.4, 28, 11.3, 8, M.brass, { square: true, kadd: 0.1 });
    D.ell(28.6, 10.9, 1.4, 3.2, M.ice, { flat: true, k: 0.9, bevel: false, glow: true, seam: false });
    D.spark(25, 3, 2); D.spark(5, 16, 1);
  },
  e_deep: (D) => {
    // a deep shaft going down, a lantern hanging in it, the crown above
    D.shape((X, Y) => Y > 9, M.stone, { k: 0.45, tex: 0.25, seed: 31 });
    D.shape((X, Y) => Y > 11 && Math.abs(X - 16) < 7 - (Y - 11) * 0.12, M.night, { k: 0.2, bevel: false, seam: false, fn: (k, x, y, X, Y) => k - (Y - 11) * 0.02 });
    D.ln(16, 9, 16, 18, C(M.burlap, 4));
    D.push(10.6, 16, 0.34); P.lantern(D); D.pop();
    D.push(4, -6, 0.75); P.crown(D, M.gold, M.amethyst); D.pop();
  },

  // ---------------- Foraging
  g_eye: (D) => {
    D.push(-3, 2, 0.85); P.mushroom(D, M.cloth); D.pop();
    // a magnifying glass over it
    D.line(21, 21, 29, 29, 3, M.dkwood);
    D.ring(17, 17, 5.6, 7.4, M.brass, { spec: 0.6 });
    D.disk(17, 17, 5.6, M.ice, { flat: true, k: 0.75, bevel: false, glow: true, seam: false, fn: (k, x, y) => k + ((x + y) % 7 === 0 ? 0.25 : 0) });
    D.ln(14, 14, 15, 13, 0xffffff);
  },
  g_gentle: (D) => {
    // a whole carrot-root lifted out, earth falling off
    D.shape((X, Y) => Y > 25, M.coal, { k: 0.4, tex: 0.3, seed: 41 });
    D.shape((X, Y) => { const t = (Y - 9) / 17; if (t < 0 || t > 1) return false; return Math.abs(X - 16 - t * 1.5) <= 4.5 * (1 - t) + 0.5; }, M.orange, { normal: (X, Y) => { const t = (Y - 9) / 17, w = 4.5 * (1 - t) + 0.5, s = Math.max(-1, Math.min(1, (X - 16 - t * 1.5) / w)); return [s, 0, Math.sqrt(1 - s * s)]; }, spec: 0.3 });
    for (let y = 12; y < 22; y += 3) D.ln(14 + (y - 9) * 0.1, y, 16, y, C(M.orange, 2));
    P.leaf(D, 16, 9, 8, -2.0, 0.35); P.leaf(D, 16, 9, 8, -1.2, 0.35); P.leaf(D, 16, 9, 7, -2.7, 0.35);
    D.ln(17, 26, 18, 30, C(M.orange, 3));
    D.px(10, 22, C(M.coal, 4)).px(22, 20, C(M.coal, 4)).px(9, 18, C(M.coal, 3));
    D.px(23, 14, C(M.coal, 4)).px(24, 17, C(M.coal, 3)).px(8, 13, C(M.coal, 4));
  },
  g_double: (D) => {
    D.push(-6, 4, 0.7); P.mushroom(D, M.leather); D.pop();
    D.push(10, 6, 0.7); P.mushroom(D, M.leather); D.pop();
    D.shape((X, Y) => (Math.abs(X - 16) < 1.1 && Math.abs(Y - 7) < 4) || (Math.abs(Y - 7) < 1.1 && Math.abs(X - 16) < 4), M.gold, { k: 0.85, glow: true });
  },
  g_pouch: (D) => {
    P.pouch(D, M.leaf);
    P.leaf(D, 12, 8, 7, -2.0, 0.38); P.leaf(D, 18, 8, 7, -1.0, 0.38); P.leaf(D, 15, 8, 8, -1.55, 0.3, M.emerald);
    D.disk(16, 22, 2.4, M.gold, { spec: 0.5 }); // a brass button
  },
  g_snout: (D) => {
    D.push(-5, 4, 0.8); P.starNose(D, 16, 16, 10); D.pop();
    D.ell(23, 23, 6.5, 5.5, M.dkwood, { spec: 0.2, tex: 0.35, seed: 44 }); // a truffle
    for (let i = 0; i < 6; i++) D.px(20 + (i * 7) % 7, 20 + ((i * 3) % 6), C(M.dkwood, 0));
    D.arc(18, 14, 6, -1.5, -0.4, 0xfff0c0).arc(18, 14, 8.5, -1.5, -0.3, 0xc8a870);
    D.spark(28, 13, 1);
  },
  g_sense: (D) => {
    D.push(0, 2, 0.95); P.mushroom(D, M.glow, { dots: false }); D.pop();
    D.halo(16, 10, 14, 0x7cf0c4, 130);
    D.spark(4, 5, 2, 0xf0fff8, 0x7cf0c4); D.spark(27, 4, 3, 0xf0fff8, 0x7cf0c4); D.spark(29, 18, 1, 0xf0fff8, 0x7cf0c4); D.spark(3, 18, 1, 0xf0fff8, 0x7cf0c4);
    D.tint((X, Y) => Y < 17, (c, x, y) => ((x * 3 + y) % 11 === 0 ? 0xe8fff6 : c));
  },
  g_larder: (D) => {
    // a stocked shelf: jars and a bundle of herbs
    D.rect(1, 26, 30, 3, M.wood, { cylY: true });
    D.push(-4, 7, 0.6); P.jar(D); D.pop(); D.rr(2, 16, 6, 9, 1, M.cloth, { seam: false, k: 0.6 });
    D.push(7, 5, 0.65); P.jar(D, M.ice, { lid: M.cloth }); D.pop(); D.rr(13, 13, 7, 11, 1, M.gold, { seam: false, k: 0.6 });
    D.line(24, 4, 24, 25, 1.4, M.burlap);
    P.leaf(D, 24, 10, 9, 1.9, 0.35); P.leaf(D, 24, 10, 9, 1.2, 0.35); P.leaf(D, 24, 10, 8, 2.6, 0.35);
    D.line(22, 9, 26, 9, 1.6, M.cloth, { seam: false });
  },
  g_bounty: (D) => {
    // an overflowing woven basket
    D.shape((X, Y) => Y > 15 && Y < 29 && Math.abs(X - 16) < 13 - (Y - 15) * 0.25, M.burlap, { k: 0.55, rim: 0.2, fn: (k, x, y) => k + (((x + (y >> 1)) % 4 < 2) !== (y % 4 < 2) ? 0.12 : -0.08) });
    D.line(3.5, 15.5, 28.5, 15.5, 2.4, M.wood);
    D.disk(9, 12, 4, M.cloth, { spec: 0.5 }); D.disk(16, 10, 4.6, M.leather, { spec: 0.3 }); D.disk(23, 12, 4, M.gold, { spec: 0.5 });
    P.leaf(D, 16, 8, 7, -1.3, 0.4);
    D.disk(12, 15, 2.4, M.leaf, { spec: 0.3 }); D.disk(20, 15, 2.6, M.orange, { spec: 0.3 });
    D.ring(16, 15, 9, 10.8, M.wood, { a0: Math.PI, a1: Math.PI * 2 });
  },
  g_care: (D) => {
    // a perfect berry held up in brass tweezers
    P.leaf(D, 3, 28, 14, -0.5, 0.36, M.leaf);
    D.line(28, 3, 17, 19, 2, M.brass, { spec: 0.6 }).line(30, 6, 19, 20.5, 2, M.brass, { spec: 0.6 });
    D.disk(14.5, 21.5, 5.4, M.cloth, { spec: 0.8, shine: 10 });
    D.line(15.5, 15, 17, 13, 1.4, M.leaf, { seam: false });
    D.spark(8, 12, 2); D.spark(24, 26, 1);
  },
  g_lore: (D) => {
    P.bottle(D, M.purple, { glow: true });
    P.leaf(D, 18, 3, 9, -0.6, 0.35); P.leaf(D, 17, 4, 7, -1.4, 0.35);
    D.push(18, 15, 0.42); D.rect(4, 4, 24, 24, M.paper, { k: 0.7 }); D.ln(8, 10, 24, 10, C(M.paper, 2)); D.ln(8, 16, 24, 16, C(M.paper, 2)); D.ln(8, 22, 18, 22, C(M.paper, 2)); D.pop();
  },
  g_root: (D) => {
    // the great mushroom with roots, crowned
    D.shape((X, Y) => Y > 26, M.coal, { k: 0.4, tex: 0.3, seed: 51 });
    for (const [a, b] of [[8, 31], [24, 31], [12, 31], [20, 31]]) D.line(16, 25, a, b, 1.2, M.wood, { seam: false });
    D.push(0, 5, 0.85); P.mushroom(D, M.amethyst); D.pop();
    D.push(8, -2, 0.5); P.crown(D); D.pop();
    D.spark(4, 6, 2); D.spark(28, 10, 1);
  },

  // ---------------- Trading
  t_tongue: (D) => {
    // a speech bubble with a coin in it
    D.shape((X, Y) => Math.hypot((X - 16) / 1.25, Y - 13) < 10.5 || inPoly([[9, 19], [6, 29], [16, 21]], X, Y), M.paper, { k: 0.72, rim: 0.18 });
    P.coin(D, 16, 13, 6, M.gold);
    D.spark(27, 4, 2);
  },
  t_haggle: (D) => {
    P.tag(D, M.paper);
    D.ln(8, 18, 16, 10, C(M.cloth, 3)); D.ln(9, 18, 17, 10, C(M.cloth, 4)); // a slashed price
    D.ln(11, 21, 13, 21, C(M.coal, 3)).ln(15, 17, 19, 17, C(M.coal, 3));
    D.line(25, 6, 30, 1, 1.2, M.burlap, { seam: false });
    D.shape((X, Y) => Y > 22 && Y < 30 && X > 20 && X < 30 && Math.abs((X - 25) - (Y - 26) * 0) < 5 && Y - 22 >= Math.abs(X - 25), M.leaf, { k: 0.7, glow: true });
  },
  t_appraise: (D) => {
    P.gem(D, 12, 17, 9, M.emerald);
    D.line(23, 23, 29, 29, 3, M.dkwood);
    D.ring(21, 21, 4, 5.6, M.brass, { spec: 0.6 });
    D.disk(21, 21, 4, M.ice, { flat: true, k: 0.8, bevel: false, glow: true, seam: false });
    D.ln(19, 19, 20, 18, 0xffffff);
  },
  t_tips: (D) => {
    for (let i = 0; i < 6; i++) P.coinEdge(D, 11, 27 - i * 2.6, 13, M.gold);
    P.coin(D, 23, 11, 6.5, M.gold);
    D.arc(23, 11, 9.5, -2.6, -1.2, 0xfff4c0);
    D.spark(28, 3, 2);
  },
  t_rocco: (D) => { P.mask(D, M.night); D.push(12, 14, 0.5); P.coin(D, 16, 16, 9, M.gold); D.pop(); D.spark(26, 4, 2); },
  t_jar: (D) => {
    P.jar(D, M.ice, { lid: M.iron });
    for (let i = 0; i < 5; i++) P.coinEdge(D, 16 + (i % 2) * 2 - 1, 27 - i * 2.4, 12, M.gold);
    D.rect(13, 5.5, 6, 1.2, M.coal, { flat: true, k: 0.1, bevel: false, seam: false }); // the slot
    D.push(16, -5, 0.4); P.coin(D, 16, 16, 9, M.gold); D.pop();
  },
  t_bulk: (D) => {
    // a mine cart full of crates and sacks
    D.poly([[3, 14], [29, 14], [26, 26], [6, 26]], M.iron, { k: 0.5, rim: 0.26 });
    D.rect(4, 15.5, 24, 1.4, M.iron, { k: 0.8, bevel: false, seam: false });
    D.disk(10, 27, 3, M.iron, { spec: 0.5 }).disk(22, 27, 3, M.iron, { spec: 0.5 });
    D.rr(5, 6, 10, 9, 1, M.wood, { k: 0.6, rim: 0.22 }); D.ln(5, 10, 14, 10, C(M.wood, 2));
    D.ell(21, 10, 6.5, 5, M.burlap, { spec: 0.15, tex: 0.1 });
    D.disk(14, 5, 2, M.gold, { spec: 0.7 }); D.disk(18, 4, 1.6, M.gold, { spec: 0.7 });
  },
  t_shark: (D) => {
    // a coin squeezed in a bench vise
    D.rect(2, 26, 28, 4, M.wood, { cylY: true });
    D.rr(3, 9, 8, 17, 1, M.iron, { k: 0.5, rim: 0.26 });
    D.rr(21, 9, 8, 17, 1, M.iron, { k: 0.5, rim: 0.26 });
    D.rect(3, 9, 8, 3, M.steel, { cylY: true, seam: false }).rect(21, 9, 8, 3, M.steel, { cylY: true, seam: false });
    D.ell(16, 13, 4.6, 7, M.gold, { spec: 0.6, shine: 10, fn: (k) => k });
    D.ln(16, 8, 16, 18, C(M.gold, 2));
    D.line(11, 20, 21, 20, 2, M.steel, { spec: 0.6 });
    D.line(28, 16, 28, 24, 1.6, M.iron).disk(28, 15.5, 1.3, M.iron).disk(28, 24.5, 1.3, M.iron);
    for (const [x, y] of [[13, 4], [19, 4], [16, 2]]) D.px(x, y, 0xfff4c0);
  },
  t_charm: (D) => {
    P.gem(D, 13, 17, 9, M.pink);
    D.push(14, -2, 0.5); P.heart(D, 16, 16, 1, M.cloth); D.pop();
    D.spark(5, 6, 2); D.spark(26, 25, 1);
  },
  t_vault: (D) => {
    D.rr(3, 4, 26, 25, 3, M.iron, { k: 0.48, rim: 0.28 });
    D.rr(6, 7, 20, 19, 2, M.iron, { k: 0.58, rim: 0.2 });
    D.disk(16, 16.5, 5.5, M.brass, { spec: 0.6, shine: 12 });
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; D.line(16, 16.5, 16 + Math.cos(a) * 5, 16.5 + Math.sin(a) * 5, 1, M.brass, { flat: true, k: 0.3, seam: false }); }
    D.disk(16, 16.5, 1.4, M.brass, { spec: 0.8 });
    for (const [x, y] of [[5, 6], [26, 6], [5, 26], [26, 26]]) D.disk(x + 0.5, y + 0.5, 1, M.iron, { spec: 0.7 });
    D.rect(24, 12, 2, 9, M.iron, { cylX: true });
  },
  t_magnate: (D) => {
    // a fat money sack on a pile of coins, crowned
    for (const [x, y] of [[5, 27], [27, 27], [9, 29], [23, 29]]) P.coinEdge(D, x, y, 8, M.gold);
    P.bag(D, M.gold, { tie: M.cloth });
    D.shape((X, Y) => Math.abs(X - 16) < 3 && Math.abs(Y - 21) < 4 && !(Math.abs(X - 16) < 1.2 && Math.abs(Y - 21) < 2.2), M.brass, { k: 0.25, bevel: false, seam: false });
    D.push(9, -6, 0.45); P.crown(D); D.pop();
    D.spark(4, 10, 2);
  },
};
// more props used above
P.bolt = (D, mat = M.gold) => { D.halo(16, 16, 12, C(mat, 5), 100); D.poly([[18, 2], [8, 17], [15, 17], [12, 30], [24, 13], [17, 13], [21, 2]], mat, { k: 0.72, rim: 0.24, glow: true }); };
P.clover = (D) => { for (const [x, y] of [[12, 12], [20, 12], [12, 20], [20, 20]]) D.disk(x, y, 5, M.leaf, { spec: 0.4 }); D.line(16, 16, 22, 29, 1.8, M.leaf, { seam: false }); };
// recipes call D.leaf / D.star shorthands
Ico.prototype.leaf = function (cx, cy, len, ang, w, mat) { P.leaf(this, cx, cy, len, ang, w, mat); return this; };

// ---------------------------------------------------------------- line emblems
const LINES = {
  mining: (D) => { D.push(0, 0, 1, true); P.pick(D, M.iron); D.pop(); P.pick(D, M.steel); D.spark(16, 4, 2); },
  smithing: (D) => { D.push(0, 6); P.anvil(D); D.pop(); D.push(8, -6, 0.7); P.hammer(D); D.pop(); D.spark(9, 7, 2, 0xfffbe0, 0xff9a30); },
  cooking: (D) => { D.push(0, 2); P.pot(D, M.copper); D.pop(); P.steam(D, 16, 9, 7); D.push(0, 5); P.flame(D, 16, 30, 7, 10); D.pop(); },
  combat: (D) => { D.push(-3, 2, 0.8); P.shield(D, M.cloth, M.iron); D.pop(); D.push(6, -1, 0.85); P.sword(D, M.steel); D.pop(); },
  exploring: (D) => { P.compass(D, 13, 18, 11); D.push(15, -2, 0.55); P.lantern(D); D.pop(); },
  foraging: (D) => { P.mushroom(D, M.cloth); D.leaf(3, 27, 9, -0.9, 0.38); D.leaf(29, 27, 9, -2.2, 0.38); },
  trading: (D) => { for (let i = 0; i < 4; i++) P.coinEdge(D, 9, 28 - i * 2.6, 13, M.gold); P.coin(D, 20, 15, 9, M.gold); D.spark(27, 4, 2); },
};

// ---------------------------------------------------------------- rendering + variants
function render(fn, key) {
  const D = new Ico();
  try { fn(D); } catch (e) { console.warn('skill icon', key, e); }
  return D.finish();
}
const lum = (c) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
/** Locked: sunk in shadow, a little colour left. Gray: barred, ashen. */
function variant(src, mode) {
  const p = new Px(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const a = src.a(x, y);
    if (!a) continue;
    const c = src.get(x, y), l = lum(c);
    let out;
    if (mode === 'dim') {
      const g = Math.round(22 + l * 96);
      const r = ((c >> 16) & 255) * 0.22 + g * 0.8, gg = ((c >> 8) & 255) * 0.22 + g * 0.72, b = (c & 255) * 0.22 + g * 0.6;
      out = (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(b);
    } else {
      const g = Math.round(30 + l * 120);
      out = (g << 16) | (Math.round(g * 0.94) << 8) | Math.round(g * 0.86);
    }
    p.set(x, y, out, mode === 'dim' && a < 255 ? Math.round(a * 0.4) : a);
  }
  return p;
}
const cacheP = new Map();
function iconPx(key, fn) {
  if (!cacheP.has(key)) cacheP.set(key, render(fn, key));
  return cacheP.get(key);
}
const fallback = (D) => { P.star(D, 16, 16, 11, M.brass); };

export const ICON_IDS = Object.keys(R);
/** A skill node's icon. mode: 'lit' | 'dim' | 'gray'. */
export function skillIconURL(id, mode = 'lit') {
  return art(`ski:${mode}:${id}`, () => {
    const base = iconPx('n:' + id, R[id] || fallback);
    return mode === 'lit' ? base : variant(base, mode);
  });
}
/** A line's emblem (32×32). */
export function lineIconURL(id, mode = 'lit') {
  return art(`skli:${mode}:${id}`, () => {
    const base = iconPx('l:' + id, LINES[id] || fallback);
    return mode === 'lit' ? base : variant(base, mode);
  });
}
/** The raw canvas (for art that embeds an icon, e.g. the header medallion). */
export function lineIconPx(id) { return iconPx('l:' + id, LINES[id] || fallback); }
export function skillIconPx(id) { return iconPx('n:' + id, R[id] || fallback); }
