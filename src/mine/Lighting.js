// Per-cell colored light grid with ray-occlusion, uploaded as a small linear-filtered
// texture that every mine shader samples. Gives soft, shadowed, colored lighting.
import * as THREE from 'three';
import { isSolid } from './blocks.js';

export class Lighting {
  constructor(world) {
    this.w = world;
    const n = world.W * world.H;
    this.rgb = new Float32Array(n * 3);
    this.staticRgb = new Float32Array(n * 3);
    this.bytes = new Uint8Array(n * 4);
    this.tex = new THREE.DataTexture(this.bytes, world.W, world.H, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.needsUpdate = true;
    this.win = [0, 0, 0, 0];
    this.staticWin = [-1, -1, -1, -1];
  }

  /** Count solid cells strictly between two cells (Bresenham). Returns early past maxCount. */
  occlusion(x0, y0, x1, y1, maxCount) {
    const w = this.w;
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0, y = y0, n = 0;
    for (;;) {
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
      if (x === x1 && y === y1) break;
      if (isSolid(w.get(x, y))) { n++; if (n > maxCount) return n; }
    }
    return n;
  }

  /**
   * Splat one source into buf. s: {x, y (cell coords, float), r, g, b, radius, pierce, near, neg}
   * pierce: how many solid cells light may pass through (each dims it).
   * near: radius around the source that ignores occlusion.
   */
  splat(buf, s, x0, y0, x1, y1) {
    const w = this.w;
    const R = s.radius;
    const cx = Math.floor(s.x), cy = Math.floor(s.y);
    const minX = Math.max(x0, Math.floor(s.x - R)), maxX = Math.min(x1, Math.ceil(s.x + R));
    const minY = Math.max(y0, Math.floor(s.y - R)), maxY = Math.min(y1, Math.ceil(s.y + R));
    const pierce = s.pierce || 0;
    const near = s.near || 0;
    const sign = s.neg ? -1 : 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const ddx = x + 0.5 - s.x, ddy = y + 0.5 - s.y;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d >= R) continue;
        let att = 1 - d / R;
        att *= att * (3 - 2 * att);
        if (d > near && !s.noOcc) {
          const occ = this.occlusion(cx, cy, x, y, pierce);
          if (occ > pierce) continue;
          if (occ) att *= Math.pow(0.42, occ);
        }
        const k = (y * w.W + x) * 3;
        buf[k] += s.r * att * sign;
        buf[k + 1] += s.g * att * sign;
        buf[k + 2] += s.b * att * sign;
      }
    }
  }

  /**
   * Recompute lighting in the window [x0,x1]×[y0,y1].
   * staticSources are re-splatted only when `staticDirty` or the window moved.
   */
  compute(staticSources, dynamicSources, x0, y0, x1, y1, staticDirty) {
    const w = this.w;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w.W - 1, x1); y1 = Math.min(w.H - 1, y1);
    const sw = this.staticWin;
    const moved = sw[0] !== x0 || sw[1] !== y0 || sw[2] !== x1 || sw[3] !== y1;
    if (staticDirty || moved) {
      // only recompute static when the window changed a lot or something changed
      for (let y = y0; y <= y1; y++) this.staticRgb.fill(0, (y * w.W + x0) * 3, (y * w.W + x1 + 1) * 3);
      for (const s of staticSources) if (s.x >= x0 - s.radius && s.x <= x1 + s.radius && s.y >= y0 - s.radius && s.y <= y1 + s.radius) this.splat(this.staticRgb, s, x0, y0, x1, y1);
      sw[0] = x0; sw[1] = y0; sw[2] = x1; sw[3] = y1;
    }
    const rgb = this.rgb;
    for (let y = y0; y <= y1; y++) {
      const a = (y * w.W + x0) * 3, b = (y * w.W + x1 + 1) * 3;
      for (let k = a; k < b; k++) rgb[k] = this.staticRgb[k];
    }
    for (const s of dynamicSources) this.splat(rgb, s, x0, y0, x1, y1);
    // encode window (light value 0..2 → 0..255)
    const bytes = this.bytes;
    const pw = this.win;
    // clear the previous window region that is now outside (keeps stale edges dark)
    if (pw[2] > 0) {
      for (let y = pw[1]; y <= pw[3]; y++) for (let x = pw[0]; x <= pw[2]; x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
        const o = (y * w.W + x) * 4;
        bytes[o] = bytes[o + 1] = bytes[o + 2] = 0;
      }
    }
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const k = (y * w.W + x) * 3, o = (y * w.W + x) * 4;
        bytes[o] = Math.max(0, Math.min(255, rgb[k] * 127.5));
        bytes[o + 1] = Math.max(0, Math.min(255, rgb[k + 1] * 127.5));
        bytes[o + 2] = Math.max(0, Math.min(255, rgb[k + 2] * 127.5));
        bytes[o + 3] = 255;
      }
    pw[0] = x0; pw[1] = y0; pw[2] = x1; pw[3] = y1;
    this.tex.needsUpdate = true;
  }

  /** Light at a fractional cell position (bilinear-ish nearest), for CPU tinting. */
  sample(x, y) {
    const w = this.w;
    const cx = Math.max(0, Math.min(w.W - 1, Math.floor(x))), cy = Math.max(0, Math.min(w.H - 1, Math.floor(y)));
    const k = (cy * w.W + cx) * 3;
    return [this.rgb[k], this.rgb[k + 1], this.rgb[k + 2]];
  }
}
