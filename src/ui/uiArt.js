// Procedural pixel art for the interface chrome. Everything is drawn at 1 art pixel =
// 1 canvas pixel and shown at an integer CSS scale (--px) with image-rendering: pixelated.
//  - Frames are 9-slice images used through CSS `border-image` (exposed as --a-* custom props).
//  - Tiles are seamless textures used as backgrounds (paper, leather grain, canvas, wood).
//  - Light always comes from the top-left.
import { makeRng, mixHex, shade } from '../core/util.js';

// ---------------------------------------------------------------- raster
export class Px {
  constructor(w, h = w) {
    this.w = w;
    this.h = h;
    this.c = document.createElement('canvas');
    this.c.width = w;
    this.c.height = h;
    this.ctx = this.c.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.d = this.img.data;
  }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (!this.in(x, y) || c === null || c === undefined) return;
    const i = (y * this.w + x) * 4;
    if (a < 255 && this.d[i + 3] > 0) {
      const t = a / 255;
      this.d[i] = this.d[i] * (1 - t) + ((c >> 16) & 255) * t;
      this.d[i + 1] = this.d[i + 1] * (1 - t) + ((c >> 8) & 255) * t;
      this.d[i + 2] = this.d[i + 2] * (1 - t) + (c & 255) * t;
      this.d[i + 3] = Math.max(this.d[i + 3], a);
      return;
    }
    this.d[i] = (c >> 16) & 255;
    this.d[i + 1] = (c >> 8) & 255;
    this.d[i + 2] = c & 255;
    this.d[i + 3] = a;
  }
  a(x, y) { return this.in(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
  get(x, y) { const i = (y * this.w + x) * 4; return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2]; }
  clear(x, y) { if (this.in(x, y)) this.d[(y * this.w + x) * 4 + 3] = 0; }
  rect(x, y, w, h, c, a) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a); }
  hl(x0, x1, y, c, a) { for (let x = x0; x <= x1; x++) this.set(x, y, c, a); }
  vl(x, y0, y1, c, a) { for (let y = y0; y <= y1; y++) this.set(x, y, c, a); }
  box(x, y, w, h, c) { this.hl(x, x + w - 1, y, c); this.hl(x, x + w - 1, y + h - 1, c); this.vl(x, y, y + h - 1, c); this.vl(x + w - 1, y, y + h - 1, c); }
  line(x0, y0, x1, y1, c, a) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  disk(cx, cy, r, c, a) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c, a);
  }
  ellipse(cx, cy, rx, ry, c, a) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx); x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(x, y, c, a);
  }
  /** Filled rounded rectangle (pixel corners). */
  rr(x, y, w, h, r, c, a) {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const dx = i < r ? r - i - 0.5 : i >= w - r ? i - (w - r) + 0.5 : 0;
        const dy = j < r ? r - j - 0.5 : j >= h - r ? j - (h - r) + 0.5 : 0;
        if (dx * dx + dy * dy <= r * r + 0.3) this.set(x + i, y + j, c, a);
      }
  }
  poly(pts, c, a) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c, a);
    }
  }
  /** Recolor every opaque pixel: fn(x, y, color, alpha) → new color | undefined. */
  each(fn) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const al = this.a(x, y);
        if (!al) continue;
        const n = fn(x, y, this.get(x, y), al);
        if (n !== undefined && n !== null) this.set(x, y, n, al);
      }
  }
  /** Distance (4-neighbour steps, capped) from each opaque pixel to the nearest transparent one. */
  dist(max = 4) {
    const D = new Uint8Array(this.w * this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) D[y * this.w + x] = this.a(x, y) > 40 ? max : 0;
    for (let pass = 0; pass < max; pass++)
      for (let y = 0; y < this.h; y++)
        for (let x = 0; x < this.w; x++) {
          const i = y * this.w + x;
          if (!D[i]) continue;
          const n = Math.min(x > 0 ? D[i - 1] : 0, x < this.w - 1 ? D[i + 1] : 0, y > 0 ? D[i - this.w] : 0, y < this.h - 1 ? D[i + this.w] : 0);
          if (n + 1 < D[i]) D[i] = n + 1;
        }
    return (x, y) => (this.in(x, y) ? D[y * this.w + x] : 0);
  }
  /** 1px outline around opaque pixels. */
  outline(c, diag = false) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.a(x, y) > 40) continue;
        const n = this.a(x - 1, y) > 40 || this.a(x + 1, y) > 40 || this.a(x, y - 1) > 40 || this.a(x, y + 1) > 40 ||
          (diag && (this.a(x - 1, y - 1) > 40 || this.a(x + 1, y + 1) > 40 || this.a(x + 1, y - 1) > 40 || this.a(x - 1, y + 1) > 40));
        if (n) add.push([x, y]);
      }
    for (const [x, y] of add) this.set(x, y, c);
  }
  /** ASCII template: rows of chars, pal maps char → color ('.' and ' ' = empty). */
  tpl(rows, pal, ox = 0, oy = 0, flip = false) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c === undefined) continue;
        this.set(ox + (flip ? row.length - 1 - x : x), oy + y, c);
      }
    }
  }
  blit(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const al = src.a(x, y);
        if (al) this.set(x + dx, y + dy, src.get(x, y), al);
      }
  }
  url() {
    this.ctx.putImageData(this.img, 0, 0);
    return this.c.toDataURL();
  }
}

// ---------------------------------------------------------------- palettes
export const INK = 0x24150d;
export const PAL = {
  paper: { hi: 0xfcf3dc, base: 0xf2e1b9, mid: 0xe7d0a2, dk: 0xd4b47e, burn: 0xb48c56, edge: 0x6e4a2a },
  leather: { hi: 0xa87444, lt: 0x8c5a32, base: 0x704628, dk: 0x56341b, dd: 0x3f2412, ol: 0x22130a, stitch: 0xe6c690, stitchDk: 0x2c180b },
  wood: { hi: 0xc08a52, lt: 0xa06c3c, base: 0x83552e, dk: 0x643e20, dd: 0x482b15, ol: 0x26160c },
  brass: { hi: 0xfff3c0, lt: 0xf7d97c, base: 0xdcae4e, dk: 0xa8772c, dd: 0x6e4a1a, ol: 0x3a2410 },
  slate: { hi: 0x58665f, base: 0x38443f, dk: 0x2a3330, dd: 0x1d2422 },
  canvas: { hi: 0xdcc69c, base: 0xcfb789, dk: 0xbca277, dd: 0x9c8258, thread: 0x7a5a36 },
  red: { hi: 0xff9a7a, lt: 0xe8604a, base: 0xc23c2c, dk: 0x8a2418, dd: 0x5a140c },
  green: { hi: 0xc8f08a, lt: 0x8ac85a, base: 0x5a9a3a, dk: 0x3a6a24, dd: 0x22421a },
  amber: { hi: 0xffe8a0, lt: 0xf6be4a, base: 0xd9901e, dk: 0x9a5c10, dd: 0x5e3608 },
  blue: { hi: 0xbfe6ff, lt: 0x7fc0f0, base: 0x3f7ec8, dk: 0x2a5490, dd: 0x18305a },
  purple: { hi: 0xe8c8ff, lt: 0xb58ae0, base: 0x8256b8, dk: 0x56347e, dd: 0x30184a },
  oxblood: { hi: 0xb05a40, lt: 0x8e3c2a, base: 0x74291c, dk: 0x561a12, dd: 0x3a0f0a, ol: 0x1c0806 },
  moss: { hi: 0x9acb5a, lt: 0x6f9c3e, base: 0x4f7a2c, dk: 0x36561f, dd: 0x223614 },
  stone: { hi: 0xa8a096, lt: 0x8a8278, base: 0x6e675f, dk: 0x544e48, dd: 0x3a3632, ol: 0x1c1a18 },
};

// ---------------------------------------------------------------- frames (9-slice)
/** Parchment sheet with a burnt rim; optional dog-eared bottom-right corner. slice 8. */
function parchFrame(dog = false) {
  const P = PAL.paper;
  const p = new Px(24, 24);
  p.rect(1, 1, 22, 22, P.base);
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [22, 1], [21, 1], [22, 2], [1, 22], [1, 21], [2, 22], [22, 22], [21, 22], [22, 21], [22, 20]]) p.clear(x, y);
  if (dog) for (let y = 16; y <= 22; y++) for (let x = 16; x <= 22; x++) if (x + y >= 40) p.clear(x, y);
  const D = p.dist(3);
  p.each((x, y) => {
    const d = D(x, y);
    if (d === 1) return P.dk;
    if (d === 2) return (x + y) % 2 ? P.mid : P.base;
    return undefined;
  });
  // a few burnt nicks at the corners
  for (const [x, y] of [[3, 1], [1, 4], [20, 1], [22, 4], [1, 19], [4, 22]]) p.set(x, y, P.burn);
  if (dog) {
    // folded flap (back of the paper is lighter), shadow under it
    p.poly([[16, 16], [22, 16], [16, 22]], P.hi);
    for (let i = 0; i < 6; i++) { p.set(16 + i, 21 - i, P.dk); p.set(17 + i, 21 - i, P.mid); }
    p.hl(16, 21, 16, P.mid);
    p.vl(16, 16, 21, P.mid);
    for (let i = 0; i < 5; i++) p.set(18 + i, 22 - i - 0, P.burn);
  }
  p.outline(P.edge);
  return p;
}

/** Leather with a stitched seam and brass corner rivets. slice 10. */
function leatherFrame(R = PAL.leather, stitch = R.stitch, rivets = true) {
  const p = new Px(32, 32);
  p.rr(1, 1, 30, 30, 4, R.base);
  const D = p.dist(3);
  p.each((x, y) => {
    const d = D(x, y);
    if (d === 1) return x + y < 31 ? R.lt : R.dk;
    if (d === 2) return x + y < 31 ? mixHex(R.base, R.lt, 0.5) : mixHex(R.base, R.dk, 0.35);
    return undefined;
  });
  // groove + stitches at inset 5
  const s = 5, e = 26;
  for (let i = s; i <= e; i++) {
    const on = (i % 4) < 2;
    // top & bottom rows
    p.set(i, s - 1, R.dk);
    p.set(i, e + 1, R.dk);
    p.set(s - 1, i, R.dk);
    p.set(e + 1, i, R.dk);
    if (on) {
      p.set(i, s, stitch); p.set(i, s + 1, R.stitchDk ?? R.dd);
      p.set(i, e, stitch); p.set(i, e + 1, R.stitchDk ?? R.dd);
      p.set(s, i, stitch); p.set(s + 1, i, R.stitchDk ?? R.dd);
      p.set(e, i, stitch); p.set(e + 1, i, R.stitchDk ?? R.dd);
    }
  }
  if (rivets) {
    const B = PAL.brass;
    for (const [cx, cy] of [[4, 4], [27, 4], [4, 27], [27, 27]]) {
      p.rect(cx - 1, cy - 1, 3, 3, B.dk);
      p.set(cx - 1, cy - 1, B.hi); p.set(cx, cy - 1, B.lt); p.set(cx - 1, cy, B.lt); p.set(cx, cy, B.base);
      p.set(cx + 1, cy + 1, B.dd);
    }
  }
  p.outline(R.ol);
  return p;
}

/** Wooden frame (portraits, signs). slice 7. */
function woodFrame(R = PAL.wood, nails = true) {
  const p = new Px(22, 22);
  p.rect(1, 1, 20, 20, R.base);
  for (let y = 1; y <= 20; y++)
    for (let x = 1; x <= 20; x++) {
      const d = Math.min(x - 1, y - 1, 20 - x, 20 - y);
      if (d >= 5) { p.clear(x, y); continue; }
      let c = R.base;
      if (d === 0) c = x + y < 21 ? R.hi : R.dk;
      else if (d === 4) c = x + y < 21 ? R.dd : R.lt;
      else if (d === 2 && (x * 7 + y * 3) % 5 === 0) c = R.lt;
      else if ((x + y * 3) % 7 === 0) c = R.dk;
      p.set(x, y, c);
    }
  // mitre joints
  for (let i = 1; i <= 5; i++) { p.set(i, i, R.dd); p.set(21 - i, i, R.dd); p.set(i, 21 - i, R.dd); p.set(21 - i, 21 - i, R.dd); }
  if (nails) {
    const B = PAL.brass;
    for (const [x, y] of [[3, 3], [18, 3], [3, 18], [18, 18]]) { p.set(x, y, B.lt); p.set(x + 1, y, B.dk); p.set(x, y + 1, B.dk); p.set(x + 1, y + 1, B.dd); }
  }
  p.outline(R.ol);
  // inner lip outline
  for (let i = 6; i <= 15; i++) { p.set(i, 6, R.ol); p.set(i, 15, R.ol); p.set(6, i, R.ol); p.set(15, i, R.ol); }
  return p;
}

/** Ornate brass frame (ticket window). slice 8. */
function brassFrame() {
  const B = PAL.brass;
  const p = new Px(24, 24);
  p.rr(1, 1, 22, 22, 3, B.base);
  const D = p.dist(6);
  p.each((x, y) => {
    const d = D(x, y);
    if (d >= 6) return null;
    if (d === 1) return x + y < 23 ? B.hi : B.dk;
    if (d === 2) return x + y < 23 ? B.lt : B.base;
    if (d === 4) return x + y < 23 ? B.dk : B.lt;
    if (d === 5) return B.dd;
    return B.base;
  });
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (D(x, y) >= 6) p.clear(x, y);
  // rivets
  for (const [x, y] of [[3, 3], [19, 3], [3, 19], [19, 19]]) { p.set(x, y, B.hi); p.set(x + 1, y, B.lt); p.set(x, y + 1, B.lt); p.set(x + 1, y + 1, B.dd); }
  p.outline(B.ol);
  for (let i = 6; i <= 17; i++) { p.set(i, 6, B.ol); p.set(i, 17, B.ol); p.set(6, i, B.ol); p.set(17, i, B.ol); }
  return p;
}

/** Slate board in a thin wooden frame (prompts). slice 5. */
function slateFrame() {
  const S = PAL.slate, W = PAL.wood;
  const p = new Px(16, 16);
  p.rr(1, 1, 14, 14, 1, W.base);
  p.hl(2, 13, 1, W.hi); p.vl(1, 2, 13, W.lt); p.hl(2, 13, 14, W.dk); p.vl(14, 2, 13, W.dk);
  p.hl(2, 13, 2, W.lt); p.vl(2, 3, 12, W.base);
  p.rect(3, 3, 10, 10, S.base);
  p.hl(3, 12, 3, S.dk); p.vl(3, 3, 12, S.dk);
  p.set(4, 4, S.hi); p.set(11, 11, S.hi);
  p.outline(INK);
  return p;
}

/** Small pinned paper note (toasts). slice 5. */
function noteFrame() {
  const P = PAL.paper;
  const p = new Px(16, 16);
  p.rect(1, 1, 14, 14, 0xf8ecd2);
  for (let x = 1; x <= 14; x++) if (x % 3 === 1) p.clear(x, 14);
  p.clear(1, 1); p.clear(14, 1);
  const D = p.dist(2);
  p.each((x, y) => (D(x, y) === 1 ? (y >= 13 ? P.dk : P.mid) : undefined));
  p.outline(P.edge);
  return p;
}

/** Key cap for <kbd>: ivory top, darker front face. slice 2/2/3/2 (fill = top face). */
function keyFrame(down = false) {
  const p = new Px(10, 10);
  const top = 0xf4e9cc, hi = 0xfffbf0, side = 0xd8c69e, front = 0xae9068, frontDk = 0x86694a;
  p.rect(1, 1, 8, 8, top);
  if (!down) { p.hl(1, 8, 1, hi); p.vl(1, 1, 6, hi); }
  p.vl(8, 2, 6, side);
  p.hl(1, 8, 7, down ? top : front);
  p.hl(1, 8, 8, down ? front : frontDk);
  p.set(1, 1, top); p.set(8, 1, side);
  p.outline(INK);
  p.clear(0, 0); p.clear(9, 0); p.clear(0, 9); p.clear(9, 9);
  return p;
}

/** 3×3 edge used by .btn: ink outline with cut corners (slice 1). */
function cutEdge() {
  const p = new Px(3, 3);
  p.set(1, 0, INK); p.set(0, 1, INK); p.set(2, 1, INK); p.set(1, 2, INK);
  return p;
}

/** Sewn canvas pocket (item slots). slice 6. */
function pocketFrame(on = false) {
  const C = PAL.canvas, B = PAL.brass;
  const p = new Px(18, 18);
  const fill = on ? 0xe2cfa4 : C.dk;
  p.rr(1, 1, 16, 16, 2, fill);
  // hem along the opening
  p.hl(2, 15, 1, on ? 0xf4e6c4 : C.hi);
  p.hl(1, 16, 2, on ? 0xf0e0ba : C.base);
  p.hl(1, 16, 3, on ? B.dk : C.dd);
  p.hl(2, 15, 4, mixHex(fill, C.dd, 0.35));
  // stitches
  const th = on ? B.dk : C.thread;
  for (let i = 3; i <= 14; i++) {
    if (i % 3 !== 2) { p.set(2, i + 1, th); p.set(15, i + 1, th); }
    if (i % 3 !== 2) p.set(i, 15, th);
  }
  p.vl(16, 4, 15, mixHex(fill, C.dd, 0.55));
  p.hl(2, 15, 16, mixHex(fill, C.dd, 0.55));
  p.outline(on ? B.dd : C.dd);
  return p;
}

/** Leather tool loop on the belt. slice 5. */
function loopFrame(on = false) {
  const L = PAL.leather, B = PAL.brass;
  const p = new Px(16, 18);
  p.rr(1, 1, 14, 16, 3, on ? L.lt : L.dk);
  const D = p.dist(3);
  p.each((x, y) => {
    const d = D(x, y);
    if (d === 1) return x + y < 16 ? (on ? L.hi : L.base) : L.dd;
    return undefined;
  });
  p.rect(3, 3, 10, 12, on ? mixHex(L.base, L.lt, 0.5) : mixHex(L.dk, L.dd, 0.4));
  p.hl(3, 12, 3, on ? L.dk : L.dd);
  const st = on ? B.lt : L.stitch;
  for (let i = 3; i <= 14; i += 2) { p.set(2, i, st); p.set(13, i, st); }
  p.outline(on ? B.dd : L.ol);
  return p;
}

/** Hand-drawn ink frame for field-notebook sketches. slice 4. */
function sketchFrame() {
  const ink = 0x5a3a20, wash = 0x6e4a2a;
  const p = new Px(16, 16);
  // double line (uniform in the middle so it repeats)
  for (let i = 1; i <= 14; i++) {
    p.set(i, 1, ink); p.set(1, i, ink); p.set(i, 14, ink); p.set(14, i, ink);
  }
  for (let i = 3; i <= 12; i++) { p.set(i, 3, wash, 90); p.set(3, i, wash, 90); p.set(i, 12, wash, 90); p.set(12, i, wash, 90); }
  // overshoots at the corners, like a quick pen stroke
  p.set(0, 1, ink); p.set(1, 0, ink); p.set(15, 14, ink); p.set(14, 15, ink); p.set(15, 1, ink); p.set(0, 14, ink);
  p.set(2, 2, wash, 120); p.set(13, 13, wash, 120);
  return p;
}

/** Book cover: oxblood leather with an embossed border and brass corner guards. slice 12. */
function coverFrame(R = PAL.oxblood) {
  const B = PAL.brass;
  const p = new Px(36, 36);
  p.rr(1, 1, 34, 34, 2, R.base);
  const D = p.dist(3);
  p.each((x, y) => {
    const d = D(x, y);
    if (d === 1) return x + y < 35 ? R.lt : R.dk;
    if (d === 2) return x + y < 35 ? mixHex(R.base, R.lt, 0.4) : mixHex(R.base, R.dk, 0.4);
    return undefined;
  });
  // embossed groove
  for (let i = 6; i <= 29; i++) { p.set(i, 6, R.dd); p.set(i, 7, R.lt); p.set(6, i, R.dd); p.set(7, i, R.lt); p.set(i, 29, R.lt); p.set(29, i, R.lt); p.set(i, 28, R.dd); p.set(28, i, R.dd); }
  // brass corner guards
  const corner = (fx, fy) => {
    const X = (x) => (fx ? 35 - x : x), Y = (y) => (fy ? 35 - y : y);
    for (let y = 1; y <= 10; y++) for (let x = 1; x <= 10; x++) {
      if (x + y > 12) continue;
      const edge = x + y === 12 || x === 1 || y === 1;
      let c = B.base;
      if (edge) c = x + y === 12 ? B.dd : B.lt;
      else if (x + y < 6) c = B.lt;
      else if (x + y > 9) c = B.dk;
      p.set(X(x), Y(y), c);
    }
    p.set(X(4), Y(4), B.hi); p.set(X(5), Y(4), B.dd); p.set(X(4), Y(5), B.dd);
  };
  corner(false, false); corner(true, false); corner(false, true); corner(true, true);
  p.outline(R.ol);
  return p;
}

/** Pause-journal cover (moss-green leather). */
function journalFrame() {
  return coverFrame({ hi: 0x7aa060, lt: 0x56804a, base: 0x3c6236, dk: 0x2a4626, dd: 0x1a2e18, ol: 0x0e1a0c });
}

/** Hanging wooden sign (two planks, nails). slice 6. */
function signFrame() {
  const W = PAL.wood, B = PAL.brass;
  const p = new Px(20, 18);
  p.rr(1, 1, 18, 16, 2, W.base);
  p.hl(2, 17, 1, W.hi); p.hl(2, 17, 2, W.lt);
  p.hl(1, 18, 8, W.dd); p.hl(1, 18, 9, W.lt);
  p.hl(2, 17, 15, W.dk); p.hl(2, 17, 16, W.dd);
  p.vl(18, 2, 15, W.dk);
  for (const [x, y] of [[3, 4], [16, 4], [3, 12], [16, 12]]) { p.set(x, y, B.lt); p.set(x, y + 1, B.dd); }
  p.outline(W.ol);
  return p;
}

/** Golden ticket with notched (perforated) sides. slice 6. */
function ticketFrame() {
  const B = PAL.brass;
  const p = new Px(20, 16);
  p.rect(1, 1, 18, 14, B.lt);
  for (let y = 2; y <= 13; y += 3) { p.clear(1, y); p.clear(18, y); }
  p.hl(1, 18, 1, B.hi); p.hl(1, 18, 14, B.dk);
  for (let x = 3; x <= 16; x++) { p.set(x, 3, x % 2 ? B.dk : B.base); p.set(x, 12, x % 2 ? B.dk : B.base); }
  for (let y = 3; y <= 12; y++) { p.set(3, y, y % 2 ? B.dk : B.base); p.set(16, y, y % 2 ? B.dk : B.base); }
  p.outline(B.dd);
  return p;
}

/** Carved wooden slider track. slice 4. */
function trackFrame() {
  const W = PAL.wood;
  const p = new Px(12, 8);
  p.rr(1, 1, 10, 6, 2, W.dd);
  p.hl(2, 9, 1, W.ol); p.hl(2, 9, 6, W.lt); p.hl(2, 9, 2, mixHex(W.dd, W.ol, 0.5));
  p.outline(W.lt);
  return p;
}

/** Twine-tied cloth wrap (weapons in the backpack). slice 6. */
function clothFrame() {
  const c = 0xd8ccb0, c2 = 0xc4b694, c3 = 0xa8987a;
  const p = new Px(18, 18);
  p.rr(1, 1, 16, 16, 2, c);
  for (let y = 2; y < 16; y++) for (let x = 2; x < 16; x++) if ((x + y) % 5 === 0) p.set(x, y, c2);
  p.hl(2, 15, 15, c3); p.vl(15, 2, 15, c3);
  p.outline(0x6a5a44);
  return p;
}

/** Paper label with a punched, twine-tied end (pouch gold tag). slice 3/3/3/8, fixed 13 rows tall. */
function goldTagFrame() {
  const P = PAL.paper;
  const p = new Px(20, 13);
  p.poly([[5, 1], [19, 1], [19, 12], [5, 12], [1, 7], [1, 6]], 0xf7ead0);
  p.hl(5, 18, 11, P.mid); p.vl(18, 2, 11, P.mid);
  p.outline(P.edge);
  // twine knotted through the tip
  p.set(0, 6, 0xd8bb88); p.set(1, 6, 0xa8875a); p.set(0, 7, 0x7a5a36); p.set(2, 6, 0x7a5a36);
  return p;
}

/** Leather belt strap (horizontal tile, 14 rows). */
function beltTile() {
  const L = PAL.leather;
  const p = new Px(16, 14);
  p.rect(0, 0, 16, 14, L.base);
  p.hl(0, 15, 0, L.ol); p.hl(0, 15, 13, L.ol);
  p.hl(0, 15, 1, L.lt); p.hl(0, 15, 12, L.dd); p.hl(0, 15, 11, L.dk);
  for (let x = 0; x < 16; x++) { if (x % 4 < 2) { p.set(x, 3, L.stitch); p.set(x, 10, L.stitch); } p.set(x, 4, x % 4 < 2 ? L.dk : L.base); }
  for (const [x, y] of [[3, 6], [9, 7], [13, 5], [6, 8], [1, 7]]) p.set(x, y, L.dk);
  for (const [x, y] of [[5, 6], [11, 8]]) p.set(x, y, L.lt);
  return p;
}

// ---------------------------------------------------------------- tiles
function paperTile(lines = false) {
  const P = PAL.paper;
  const p = new Px(32, 32);
  p.rect(0, 0, 32, 32, P.base);
  const r = makeRng(77);
  for (let i = 0; i < 46; i++) {
    const x = r.int(0, 31), y = r.int(0, 31);
    p.set(x, y, r.chance(0.6) ? P.mid : P.hi);
  }
  for (let i = 0; i < 7; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), len = r.int(2, 3);
    for (let k = 0; k < len; k++) p.set((x + k) % 32, (y + (r.chance(0.3) ? 1 : 0)) % 32, P.mid);
  }
  if (lines) for (let x = 0; x < 32; x += 1) if (x % 2 === 0) { p.set(x, 15, 0xe2c99a); p.set(x, 31, 0xe2c99a); }
  return p;
}

function leatherTile(R = PAL.leather) {
  const p = new Px(24, 24);
  p.rect(0, 0, 24, 24, R.base);
  const r = makeRng(31);
  for (let i = 0; i < 60; i++) {
    const x = r.int(0, 23), y = r.int(0, 23);
    p.set(x, y, mixHex(R.base, R.dk, 0.6));
    if (r.chance(0.5)) p.set((x + 1) % 24, y, mixHex(R.base, R.dk, 0.35));
  }
  for (let i = 0; i < 18; i++) p.set(r.int(0, 23), r.int(0, 23), mixHex(R.base, R.lt, 0.55));
  // a couple of soft scratches
  for (let i = 0; i < 3; i++) {
    const x = r.int(0, 23), y = r.int(0, 23);
    for (let k = 0; k < 4; k++) p.set((x + k) % 24, (y + (k >> 1)) % 24, mixHex(R.base, R.lt, 0.3));
  }
  return p;
}

function canvasTile() {
  const C = PAL.canvas;
  const p = new Px(8, 8);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      let c = C.base;
      if (x % 2 === 0 && y % 2 === 0) c = mixHex(C.base, C.hi, 0.7);
      else if (x % 2 === 1 && y % 2 === 1) c = mixHex(C.base, C.dk, 0.5);
      p.set(x, y, c);
    }
  p.set(5, 2, C.dk); p.set(6, 2, C.dk); p.set(1, 6, mixHex(C.base, C.dk, 0.8));
  return p;
}

function woodTile(R = PAL.wood, plank = 8) {
  const p = new Px(32, plank * 2);
  const r = makeRng(9);
  for (let y = 0; y < plank * 2; y++)
    for (let x = 0; x < 32; x++) {
      const row = y % plank;
      let c = R.base;
      if (row === 0) c = R.lt;
      else if (row === plank - 1) c = R.dd;
      else if (Math.sin((x + y * 13 + (y >= plank ? 11 : 0)) * 0.45) > 0.85) c = R.dk;
      p.set(x, y, c);
    }
  for (let i = 0; i < 26; i++) {
    const x = r.int(0, 31), y = r.int(1, plank * 2 - 2);
    if (y % plank === 0 || y % plank === plank - 1) continue;
    const len = r.int(2, 6);
    for (let k = 0; k < len; k++) p.set((x + k) % 32, y, r.chance(0.5) ? R.dk : mixHex(R.base, R.lt, 0.5));
  }
  // plank seams
  p.vl(9, 1, plank - 2, R.dd); p.vl(25, plank + 1, plank * 2 - 2, R.dd);
  // knot
  p.set(18, 3, R.dd); p.set(19, 3, R.dk); p.set(18, 4, R.dk);
  return p;
}

function slateTile() {
  const S = PAL.slate;
  const p = new Px(24, 24);
  p.rect(0, 0, 24, 24, S.base);
  const r = makeRng(5);
  for (let i = 0; i < 26; i++) p.set(r.int(0, 23), r.int(0, 23), r.chance(0.5) ? S.hi : S.dk);
  return p;
}

/** Gutter shadow strip for book pages (dithered, darkest at the spine). */
function gutterTile(right = false) {
  const p = new Px(10, 4);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 10; x++) {
      const d = right ? x : 9 - x; // distance from spine
      const t = 1 - d / 10;
      const bay = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y][x % 4] / 16;
      if (t * t * 1.1 > bay) p.set(x, y, 0x6e4a2a, Math.round(40 + 70 * t));
    }
  return p;
}

/** Charcoal smudge for undiscovered sketches. */
function smudgeTile() {
  const p = new Px(16, 16);
  const r = makeRng(12);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 7;
    p.set(Math.round(8 + Math.cos(a) * d), Math.round(8 + Math.sin(a) * d * 0.8), 0x4a3a30, 60 + r.int(0, 50));
  }
  return p;
}

// ---------------------------------------------------------------- registry
const cache = new Map();
export function art(key, fn) {
  if (!cache.has(key)) {
    let url = '';
    try { url = fn().url(); } catch (e) { console.warn('uiArt', key, e); }
    cache.set(key, url);
  }
  return cache.get(key);
}

const ASSETS = {
  parch: () => parchFrame(false),
  parchDog: () => parchFrame(true),
  leather: () => leatherFrame(),
  wood: () => woodFrame(),
  brass: () => brassFrame(),
  slate: () => slateFrame(),
  note: () => noteFrame(),
  key: () => keyFrame(false),
  cut: () => cutEdge(),
  pocket: () => pocketFrame(false),
  pocketOn: () => pocketFrame(true),
  loop: () => loopFrame(false),
  loopOn: () => loopFrame(true),
  sketch: () => sketchFrame(),
  cover: () => coverFrame(),
  journal: () => journalFrame(),
  sign: () => signFrame(),
  ticket: () => ticketFrame(),
  track: () => trackFrame(),
  goldTag: () => goldTagFrame(),
  beltT: () => beltTile(),
  cloth: () => clothFrame(),
  paperT: () => paperTile(false),
  pageT: () => paperTile(true),
  leatherT: () => leatherTile(),
  coverT: () => leatherTile(PAL.oxblood),
  journalT: () => leatherTile({ hi: 0x7aa060, lt: 0x56804a, base: 0x3c6236, dk: 0x2a4626, dd: 0x1a2e18 }),
  canvasT: () => canvasTile(),
  woodT: () => woodTile(),
  woodDkT: () => woodTile({ hi: 0x8a5a32, lt: 0x6a4224, base: 0x52321a, dk: 0x3e2412, dd: 0x2a180c }, 10),
  slateT: () => slateTile(),
  gutterL: () => gutterTile(false),
  gutterR: () => gutterTile(true),
  smudge: () => smudgeTile(),
};

export function asset(key) { return ASSETS[key] ? art(key, ASSETS[key]) : ''; }

/** Publish every frame/tile as a CSS custom property (--a-<key>) on :root. */
export function installArt(root = document.documentElement) {
  for (const k of Object.keys(ASSETS)) {
    const u = asset(k);
    if (u) root.style.setProperty('--a-' + k, `url("${u}")`);
  }
}

export { mixHex, shade };
