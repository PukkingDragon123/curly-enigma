// The raster every piece of interface pixel art is drawn into: 1 art pixel = 1 canvas pixel,
// shown at an integer CSS scale (--px) with image-rendering: pixelated. (Re-exported by uiArt.js.)
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
