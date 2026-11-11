// The raster every piece of interface pixel art is drawn into. Coordinates are art pixels (one --px
// on screen); a raster has a resolution r: each art pixel is an r×r block of fine pixels, so the
// art is drawn at r× resolution and shown at the same size (crisp, image-rendering: pixelated).
//  - Everything that takes art coordinates (set, rect, disk, poly, outline, each...) paints whole
//    blocks, so art written for r = 1 draws the same picture at any r.
//  - The fine pixels are reachable on their own (fset/fget, dot, fline, fdisk, fine) for the extra
//    detail a higher resolution can carry: grain, fibres, stitches, hammer marks, glints.
// New rasters take Px.R (1 by default; uiArt's art() raises it while drawing interface art).
// (Re-exported by uiArt.js.)
export class Px {
  /** Resolution of new rasters (fine pixels per art pixel). */
  static R = 1;
  constructor(w, h = w, r = Px.R) {
    this.w = w;
    this.h = h;
    this.r = r = Math.max(1, r | 0);
    this.fw = w * r;
    this.fh = h * r;
    this.c = document.createElement('canvas');
    this.c.width = this.fw;
    this.c.height = this.fh;
    this.ctx = this.c.getContext('2d', { willReadFrequently: true });
    this.img = this.ctx.createImageData(this.fw, this.fh);
    this.d = this.img.data;
  }
  /** Write one fine pixel by byte index (a < 255 blends over an opaque one, keeping the max alpha). */
  _put(i, c, a) {
    const d = this.d;
    if (a < 255 && d[i + 3] > 0) {
      const t = a / 255;
      d[i] = d[i] * (1 - t) + ((c >> 16) & 255) * t;
      d[i + 1] = d[i + 1] * (1 - t) + ((c >> 8) & 255) * t;
      d[i + 2] = d[i + 2] * (1 - t) + (c & 255) * t;
      d[i + 3] = Math.max(d[i + 3], a);
      return;
    }
    d[i] = (c >> 16) & 255;
    d[i + 1] = (c >> 8) & 255;
    d[i + 2] = c & 255;
    d[i + 3] = a;
  }
  /** Byte index of an art pixel's top-left fine pixel. */
  _i(x, y) { return (y * this.r * this.fw + x * this.r) * 4; }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (!this.in(x, y) || c === null || c === undefined) return;
    const r = this.r;
    if (r === 1) { this._put((y * this.w + x) * 4, c, a); return; }
    for (let j = 0; j < r; j++) {
      let i = ((y * r + j) * this.fw + x * r) * 4;
      for (let k = 0; k < r; k++, i += 4) this._put(i, c, a);
    }
  }
  a(x, y) { return this.in(x, y) ? this.d[this._i(x, y) + 3] : 0; }
  get(x, y) { const i = this._i(x, y); return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2]; }
  clear(x, y) {
    if (!this.in(x, y)) return;
    const r = this.r;
    for (let j = 0; j < r; j++) for (let k = 0; k < r; k++) this.d[((y * r + j) * this.fw + x * r + k) * 4 + 3] = 0;
  }
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
  /**
   * Recolor every opaque pixel: fn(x, y, color, alpha) → new color | undefined. At r > 1 the fine
   * pixels of a block are recoloured one by one (fn still gets the art coordinates), so a tint or
   * a burn keeps the fine texture under it.
   */
  each(fn) {
    const r = this.r;
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (r === 1 || this.flat(x, y)) {
          const al = this.a(x, y);
          if (!al) continue;
          const n = fn(x, y, this.get(x, y), al);
          if (n !== undefined && n !== null) this.set(x, y, n, al);
          continue;
        }
        for (let j = 0; j < r; j++)
          for (let k = 0; k < r; k++) {
            const i = ((y * r + j) * this.fw + x * r + k) * 4, al = this.d[i + 3];
            if (!al) continue;
            const n = fn(x, y, (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2], al);
            if (n !== undefined && n !== null) this._put(i, n, al);
          }
      }
  }
  /** Is the art pixel one flat block (all its fine pixels equal)? */
  flat(x, y) {
    const r = this.r;
    if (r === 1) return true;
    const d = this.d, i0 = this._i(x, y);
    for (let j = 0; j < r; j++)
      for (let k = 0; k < r; k++) {
        const i = i0 + (j * this.fw + k) * 4;
        if (d[i] !== d[i0] || d[i + 1] !== d[i0 + 1] || d[i + 2] !== d[i0 + 2] || d[i + 3] !== d[i0 + 3]) return false;
      }
    return true;
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
  /** Copy another raster in (art offset). Same resolution: fine pixel for fine pixel. */
  blit(src, dx = 0, dy = 0) {
    if (src.r === this.r && src.d && this.r > 1) {
      const ox = Math.floor(dx) * this.r, oy = Math.floor(dy) * this.r;
      for (let y = 0; y < src.fh; y++)
        for (let x = 0; x < src.fw; x++) {
          const i = (y * src.fw + x) * 4, al = src.d[i + 3];
          if (al) this.fset(x + ox, y + oy, (src.d[i] << 16) | (src.d[i + 1] << 8) | src.d[i + 2], al);
        }
      return;
    }
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const al = src.a(x, y);
        if (al) this.set(x + dx, y + dy, src.get(x, y), al);
      }
  }

  // ---------------------------------------------------------------- fine pixels
  fin(fx, fy) { return fx >= 0 && fy >= 0 && fx < this.fw && fy < this.fh; }
  /** One fine pixel (fine coordinates). */
  fset(fx, fy, c, a = 255) {
    fx |= 0; fy |= 0;
    if (!this.fin(fx, fy) || c === null || c === undefined) return;
    this._put((fy * this.fw + fx) * 4, c, a);
  }
  fa(fx, fy) { return this.fin(fx, fy) ? this.d[(fy * this.fw + fx) * 4 + 3] : 0; }
  fget(fx, fy) { const i = (fy * this.fw + fx) * 4; return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2]; }
  fclear(fx, fy) { if (this.fin(fx, fy)) this.d[(fy * this.fw + fx) * 4 + 3] = 0; }
  /** One fine pixel at art coordinates (fractions pick the sub-pixel: dot(3.5, 2, c) is the right half's top). */
  dot(x, y, c, a) { this.fset(Math.floor(x * this.r + 1e-6), Math.floor(y * this.r + 1e-6), c, a); }
  /** Tint one fine pixel toward c by t (keeps its alpha), at art coordinates. */
  tint(x, y, c, t) {
    const fx = Math.floor(x * this.r + 1e-6), fy = Math.floor(y * this.r + 1e-6);
    if (!this.fa(fx, fy)) return;
    this.fset(fx, fy, c, Math.round(255 * t) || 1);
  }
  /** Tint every fine pixel of an art pixel toward c by t (its texture stays). */
  tintBlock(x, y, c, t) {
    if (!this.in(x, y)) return;
    const r = this.r;
    for (let j = 0; j < r; j++) for (let k = 0; k < r; k++) if (this.fa(x * r + k, y * r + j)) this.fset(x * r + k, y * r + j, c, Math.round(255 * t) || 1);
  }
  /** A hairline one fine pixel wide, between art coordinates. */
  fline(x0, y0, x1, y1, c, a) {
    const r = this.r, n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * r));
    let lx = null, ly = null;
    for (let i = 0; i <= n; i++) {
      const fx = Math.floor((x0 + ((x1 - x0) * i) / n) * r + 1e-6), fy = Math.floor((y0 + ((y1 - y0) * i) / n) * r + 1e-6);
      if (fx === lx && fy === ly) continue;
      lx = fx; ly = fy;
      this.fset(fx, fy, c, a);
    }
  }
  /** A disk rasterised on the fine grid (art-coordinate centre and radius). */
  fdisk(cx, cy, rad, c, a) {
    const r = this.r;
    for (let y = Math.floor((cy - rad - 1) * r); y <= Math.ceil((cy + rad) * r); y++)
      for (let x = Math.floor((cx - rad - 1) * r); x <= Math.ceil((cx + rad) * r); x++)
        if (((x + 0.5) / r - cx) ** 2 + ((y + 0.5) / r - cy) ** 2 <= rad * rad) this.fset(x, y, c, a);
  }
  /**
   * Shade every fine pixel: fn(X, Y, fx, fy) → color | undefined, where X, Y are the art
   * coordinates of the fine pixel's corner (fractional at r > 1) and fx, fy its fine coordinates.
   * At r = 1 this is a plain per-pixel loop, so a painter written with it draws the same art at r = 1.
   */
  fine(fn, x0 = 0, y0 = 0, w = this.w, h = this.h) {
    const r = this.r;
    for (let fy = y0 * r; fy < (y0 + h) * r; fy++)
      for (let fx = x0 * r; fx < (x0 + w) * r; fx++) {
        const c = fn(fx / r, fy / r, fx, fy);
        if (c !== undefined && c !== null) this.fset(fx, fy, c);
      }
  }
  url() {
    this.ctx.putImageData(this.img, 0, 0);
    return this.c.toDataURL();
  }
}
