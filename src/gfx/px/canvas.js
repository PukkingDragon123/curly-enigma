// A tiny raster canvas for procedural pixel art (RGBA ImageData + an optional
// per-pixel emissive layer). Re-exported by gfx/PixelArt.js.

export class PixelCanvas {
  constructor(w, h = w) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.d = this.img.data;
    /** Emissive strength 0..1 per pixel (allocated on first emit). */
    this.glow = null;
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  /** Paint a pixel. a < 255 blends over an existing opaque pixel (keeps the max alpha). */
  set(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return;
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
  /** Raw write: color and alpha exactly as given (no blending). */
  put(x, y, c, a = 255) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = (c >> 16) & 255;
    this.d[i + 1] = (c >> 8) & 255;
    this.d[i + 2] = c & 255;
    this.d[i + 3] = a;
  }
  alpha(x, y) {
    if (!this.inb(x, y)) return 0;
    return this.d[(y * this.w + x) * 4 + 3];
  }
  getHex(x, y) {
    const i = (y * this.w + x) * 4;
    return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2];
  }
  /** Color at (x,y) or -1 when transparent / outside. */
  get(x, y) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return -1;
    const i = (y * this.w + x) * 4;
    return this.d[i + 3] ? (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2] : -1;
  }
  clear(x, y) {
    if (!this.inb(x, y)) return;
    const i = (y * this.w + x);
    this.d[i * 4 + 3] = 0;
    if (this.glow) this.glow[i] = 0;
  }
  /** Mark a pixel as emissive (0..1). Only meaningful on opaque pixels. */
  emit(x, y, g = 1) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return;
    if (!this.glow) this.glow = new Float32Array(this.w * this.h);
    const i = y * this.w + x;
    if (g > this.glow[i]) this.glow[i] = g;
  }
  /** Set a pixel and mark it emissive in one go. */
  lit(x, y, c, g = 1) { this.set(x, y, c); this.emit(x, y, g); }
  glowAt(x, y) {
    if (!this.glow || !this.inb(x, y)) return 0;
    return this.glow[(y | 0) * this.w + (x | 0)];
  }
  rect(x, y, w, h, c, a = 255) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }
  disk(cx, cy, r, c, a = 255) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c, a);
  }
  ellipse(cx, cy, rx, ry, c, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.set(x, y, c, a);
  }
  line(x0, y0, x1, y1, c, a = 255) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  poly(pts, c, a = 255) {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yc = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c, a);
    }
  }
  /** Shade every opaque pixel by position: brighter top-left, darker bottom-right. */
  shadeShape(r, bias = 0, x0 = 0, y0 = 0, x1 = this.w, y1 = this.h) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const span = Math.max(1, (x1 - x0 + y1 - y0) / 4);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        if (!this.alpha(x, y)) continue;
        const t = ((x - cx) + (y - cy)) / span + bias;
        const k = t < -1.3 ? 1 : t < -0.45 ? 2 : t < 0.55 ? 3 : t < 1.3 ? 4 : 5;
        this.set(x, y, r[k]);
      }
  }
  /** 1px outline around opaque pixels. */
  outline(c, diag = false) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y) > 40) continue;
        const n = this.alpha(x - 1, y) > 40 || this.alpha(x + 1, y) > 40 || this.alpha(x, y - 1) > 40 || this.alpha(x, y + 1) > 40 ||
          (diag && (this.alpha(x - 1, y - 1) > 40 || this.alpha(x + 1, y + 1) > 40 || this.alpha(x + 1, y - 1) > 40 || this.alpha(x - 1, y + 1) > 40));
        if (n) add.push([x, y]);
      }
    for (const [x, y] of add) this.set(x, y, c);
  }
  /** Soft glow halo around opaque pixels. */
  halo(c, a = 70) {
    const add = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alpha(x, y)) continue;
        let n = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (this.alpha(x + i, y + j) > 200) n++;
        if (n) add.push([x, y, Math.min(a, n * 14)]);
      }
    for (const [x, y, aa] of add) this.set(x, y, c, aa);
  }
  blit(src, dx = 0, dy = 0) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const a = src.alpha(x, y);
        if (!a) continue;
        this.set(x + dx, y + dy, src.getHex(x, y), a);
        const g = src.glowAt(x, y);
        if (g) this.emit(x + dx, y + dy, g);
      }
  }
  /** Copy (pixels + emissive layer). */
  clone() {
    const p = new PixelCanvas(this.w, this.h);
    p.d.set(this.d);
    if (this.glow) p.glow = this.glow.slice();
    return p;
  }
  /** Mirror horizontally in place. */
  flipX() {
    const { w, h, d } = this;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w >> 1; x++) {
        const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4;
        for (let k = 0; k < 4; k++) { const t = d[a + k]; d[a + k] = d[b + k]; d[b + k] = t; }
        if (this.glow) { const ga = y * w + x, gb = y * w + (w - 1 - x); const t = this.glow[ga]; this.glow[ga] = this.glow[gb]; this.glow[gb] = t; }
      }
    return this;
  }
  /** Shift all pixels by (dx, dy) in place (pixels shifted out are lost). */
  shift(dx, dy) {
    const src = this.clone();
    this.d.fill(0);
    if (this.glow) this.glow.fill(0);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const i = (y * this.w + x) * 4;
      if (!src.d[i + 3]) continue;
      const X = x + dx, Y = y + dy;
      if (!this.inb(X, Y)) continue;
      const j = (Y * this.w + X) * 4;
      this.d[j] = src.d[i]; this.d[j + 1] = src.d[i + 1]; this.d[j + 2] = src.d[i + 2]; this.d[j + 3] = src.d[i + 3];
      if (src.glow && src.glow[y * this.w + x]) this.emit(X, Y, src.glow[y * this.w + x]);
    }
    return this;
  }
  /** Opaque bounding box {x0, y0, x1, y1} (inclusive) or null. */
  bounds(minA = 1) {
    let x0 = this.w, y0 = this.h, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.d[(y * this.w + x) * 4 + 3] < minA) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
  commit() {
    this.ctx.putImageData(this.img, 0, 0);
    return this.canvas;
  }
}
