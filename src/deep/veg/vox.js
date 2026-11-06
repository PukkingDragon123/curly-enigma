// The cave plants' voxel toolkit: a small dense grid to model a plant in (y up, 1 cell = one fine
// voxel, 1/48–1/64 m once placed), a few organic brushes (tapered strands, flat leaf ribbons,
// lumpy blobs and caps whose outlines wander, never a clean circle) and boxify(), which turns a
// grid into the few axis-aligned boxes the vegetation shader draws (greedy in x, then z, then
// down; voxels buried on all six sides are wildcards a box may pass through, and are dropped).
//
// A prototype (proto) is the packed result: per box its offset from the plant's root (int8
// voxels), size (uint8 voxels), sRGB colour, glow level and the bend at its bottom and top (how
// much of the wind and the mole's push it takes), plus the plant's height, radius and colour.
import { ph } from './paint.js';

const FILLED = 1 << 27;
const RGB = 0xffffff;

export class VG {
  constructor(w, h, d) {
    this.w = w; this.h = h; this.d = d;
    this.data = new Uint32Array(w * h * d);
  }
  inb(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.w && y < this.h && z < this.d; }
  /** c: 0xRRGGBB (< 0 clears); g: glow level 0..3. */
  set(x, y, z, c, g = 0) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (!this.inb(x, y, z)) return;
    this.data[x + this.w * (y + this.h * z)] = c < 0 ? 0 : (c & RGB) | ((g & 3) << 24) | FILLED;
  }
  /** Only where empty. */
  add(x, y, z, c, g = 0) { if (!this.has(x, y, z)) this.set(x, y, z, c, g); }
  has(x, y, z) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    return this.inb(x, y, z) && this.data[x + this.w * (y + this.h * z)] !== 0;
  }
  col(x, y, z) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (!this.inb(x, y, z)) return -1;
    const v = this.data[x + this.w * (y + this.h * z)];
    return v ? v & RGB : -1;
  }
  /** Recolour a filled voxel (keeps it filled), e.g. a spot or a glint on a cap. */
  paint(x, y, z, c, g = 0) { if (this.has(x, y, z)) this.set(x, y, z, c, g); }

  /** A one-voxel line; c may be fn(t) → colour (< 0 skips). */
  line(x0, y0, z0, x1, y1, z1, c, g = 0) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const col = typeof c === 'function' ? c(t) : c;
      if (col >= 0) this.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, col, typeof g === 'function' ? g(t) : g);
    }
  }
  /**
   * A tapered strand along the quadratic curve p0 → (control c) → p1: width w0 → w1 voxels
   * (square sections, the corners of the wide ones cut), col(t, edge) → colour (edge: 1 on the
   * section's rim), glow(t) → level. Returns the end point.
   */
  strand(p0, c, p1, w0, w1, col, glow = 0) {
    const len = Math.hypot(c[0] - p0[0], c[1] - p0[1], c[2] - p0[2]) + Math.hypot(p1[0] - c[0], p1[1] - c[1], p1[2] - c[2]);
    const n = Math.max(2, Math.ceil(len * 1.6));
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0];
      const y = u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1];
      const z = u * u * p0[2] + 2 * u * t * c[2] + t * t * p1[2];
      const w = w0 + (w1 - w0) * t, g = typeof glow === 'function' ? glow(t) : glow;
      if (w < 1.5) { const cc = col(t, 0); if (cc >= 0) this.set(x, y, z, cc, g); continue; }
      const k = Math.round(w), o = (k - 1) / 2;
      for (let dz = 0; dz < k; dz++) for (let dx = 0; dx < k; dx++) {
        const ex = dx === 0 || dx === k - 1, ez = dz === 0 || dz === k - 1;
        if (k > 2 && ex && ez) continue; // cut the corners: no square posts
        const cc = col(t, ex || ez ? 1 : 0);
        if (cc >= 0) this.set(x + dx - o, y, z + dz - o, cc, g);
      }
    }
    return p1;
  }
  /**
   * A lumpy blob round (cx, cy, cz), radii rx, ry, rz: its outline wanders with the angle (three
   * low harmonics, seeded), so pebbles, puffballs and pods are never balls. col(dx, dy, dz, x, y, z).
   */
  blob(cx, cy, cz, rx, ry, rz, col, g = 0, seed = 1, lump = 0.22) {
    const p1 = ph(seed, 1, 7) * 6.28, p2 = ph(seed, 2, 7) * 6.28, p3 = ph(seed, 3, 7) * 6.28;
    for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz + 1); z++)
      for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
        for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          const a = Math.atan2(dz, dx), b = Math.atan2(dy, Math.hypot(dx, dz));
          const r = 1 + lump * (0.55 * Math.sin(2 * a + p1) + 0.35 * Math.sin(3 * a + p2 + b * 2) + 0.25 * Math.sin(5 * b + p3));
          if (dx * dx + dy * dy + dz * dz > r * r) continue;
          const cc = typeof col === 'function' ? col(dx, dy, dz, x, y, z) : col;
          if (cc >= 0) this.set(x, y, z, cc, typeof g === 'function' ? g(dx, dy, dz) : g);
        }
  }
  /**
   * A flat patch lying in the xz plane at height y: a lumpy outline round (cx, cz) (radii rx, rz),
   * col(dx, dz, x, z, rim) → colour; thick layers. Ground mats, lichen, clover leaflets.
   */
  patch(cx, y, cz, rx, rz, col, g = 0, seed = 1, lump = 0.25, thick = 1) {
    const p1 = ph(seed, 4, 9) * 6.28, p2 = ph(seed, 5, 9) * 6.28;
    const R = (a) => 1 + lump * (0.6 * Math.sin(2 * a + p1) + 0.4 * Math.sin(3 * a + p2) + 0.2 * Math.sin(5 * a + p1 * 2));
    for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz + 1); z++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x - cx) / rx, dz = (z - cz) / rz, d = Math.hypot(dx, dz), r = R(Math.atan2(dz, dx));
        if (d > r) continue;
        const rim = d > r - 1 / Math.max(1, Math.min(rx, rz)) * 1.2;
        const cc = col(dx, dz, x, z, rim);
        if (cc < 0) continue;
        for (let k = 0; k < thick; k++) this.set(x, y + k, z, cc, g);
      }
  }
  /**
   * A mushroom cap over (cx, y, cz): radius R, height H (voxels), shape 'dome' | 'cone' | 'flat';
   * every layer's outline wobbles (seeded) so it's a hand-made cap, not a lathe. col(h 0..1, d 0..1,
   * x, yy, z, rim) → colour; gill: colour of the underside ring (or < 0). Returns its top y.
   */
  cap(cx, y, cz, R, H, shape, col, glow = 0, seed = 1, gill = -1) {
    const p1 = ph(seed, 7, 3) * 6.28, p2 = ph(seed, 8, 3) * 6.28;
    const wob = (a) => 1 + 0.12 * Math.sin(3 * a + p1) + 0.08 * Math.sin(5 * a + p2);
    const top = Math.max(1, Math.round(H));
    for (let yy = 0; yy < top; yy++) {
      const h = (yy + 0.5) / top;
      const rr = shape === 'cone' ? R * Math.pow(Math.max(0, 1 - h), 0.9) + 0.35 : shape === 'flat' ? R * Math.sqrt(Math.max(0, 1 - h ** 4)) : R * Math.sqrt(Math.max(0, 1 - h * h)) + 0.25;
      if (rr < 0.45) { if (yy === top - 1 || h > 0.8) this.set(cx, y + yy, cz, col(1, 0, cx, y + yy, cz, false), typeof glow === 'function' ? glow(1, 0) : glow); continue; }
      for (let z = Math.floor(cz - rr - 1); z <= Math.ceil(cz + rr + 1); z++)
        for (let x = Math.floor(cx - rr - 1); x <= Math.ceil(cx + rr + 1); x++) {
          const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz), r = rr * wob(Math.atan2(dz, dx));
          if (d > r) continue;
          const rim = d > r - 1.05;
          if (yy === 0 && gill >= 0 && !rim) { this.set(x, y, z, (x + z) & 1 ? gill : shadeHex(gill, 1.3), 1); continue; }
          this.set(x, y + yy, z, col(h, d / Math.max(0.5, r), x, y + yy, z, rim), typeof glow === 'function' ? glow(h, d / Math.max(0.5, r)) : glow);
        }
    }
    return y + top - 1;
  }
  /**
   * A flat leaf, one voxel thick: from (x, y, z) heading (hx, hz) (horizontal unit vector, snapped
   * to 8 directions so its sides step cleanly), length L, width W, rising `rise` per voxel and
   * curling down at the tip. R: ramp; base: tone. Midrib darker, one half lit, tip lighter.
   */
  leaf(x, y, z, hx, hz, L, W, rise, R, base = 2, glow = 0, curl = 0.3) {
    const sx = -hz, sz = hx; // across the leaf (horizontal)
    for (let u = 0; u <= L; u++) {
      const t = u / Math.max(1, L);
      const half = (W / 2) * Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.7) * 0.98 + 0.02));
      const py = y + rise * u - curl * L * t * t;
      for (let v = -Math.round(half); v <= Math.round(half); v++) {
        const mid = v === 0;
        const c = tone(R, base + t * 1.4 + (mid ? -0.7 : v < 0 ? 0.6 : -0.2));
        this.set(x + hx * u + sx * v, py + Math.abs(v) * 0.15, z + hz * u + sz * v, c, glow);
      }
    }
  }
}

/** A colour from a ramp (dark → light) at a fractional tone, clamped. */
export const tone = (R, t) => R[Math.max(0, Math.min(R.length - 1, Math.round(t)))];
export function shadeHex(hex, k) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k)), g = Math.min(255, Math.round(((hex >> 8) & 255) * k)), b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}
/** 8 horizontal headings (unit-ish, so diagonal leaves and fronds step x and z together). */
export const DIR8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
export const dir8 = (a) => DIR8[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];

/**
 * Pack a grid into a proto: boxes greedy in x, then z, then down (from the top so cap layers run
 * down through their buried middles). pivot [px, py, pz] (voxels) becomes the root; mode: 'up'
 * (standing: bend grows with height), 'down' (hanging), 'out' (from a wall: grows with distance
 * from the root), 'flat' (ground cover: a little), 'none' (wall patches).
 */
export function boxify(g, pivot, mode = 'up') {
  const { w, h, d, data } = g, wh = w * h;
  const at = (x, y, z) => data[x + w * (y + h * z)];
  // voxels buried on all six sides: wildcards (any box may cover them; on their own they're dropped)
  const WILD = 0xffffffff;
  const v = data.slice();
  for (let z = 1; z < d - 1; z++) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = x + w * (y + h * z);
    if (data[i] && data[i - 1] && data[i + 1] && data[i - w] && data[i + w] && data[i - wh] && data[i + wh]) v[i] = WILD;
  }
  const done = new Uint8Array(w * h * d);
  const ok = (i, k) => (v[i] === k && !done[i]) || v[i] === WILD;
  const box = [];
  for (let y = h - 1; y >= 0; y--) for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    const i0 = x + w * (y + h * z), k = v[i0];
    if (!k || k === WILD || done[i0]) continue;
    let sx = 1;
    while (x + sx < w && ok(i0 + sx, k)) sx++;
    let sz = 1;
    zx: while (z + sz < d) {
      for (let q = 0; q < sx; q++) if (!ok(i0 + q + wh * sz, k)) break zx;
      sz++;
    }
    let sy = 1;
    yx: while (y - sy >= 0) {
      for (let c = 0; c < sz; c++) for (let q = 0; q < sx; q++) if (!ok(i0 + q + wh * c - w * sy, k)) break yx;
      sy++;
    }
    for (let yy = 0; yy < sy; yy++) for (let c = 0; c < sz; c++) for (let q = 0; q < sx; q++) done[i0 + q + wh * c - w * yy] = 1;
    box.push([x, y - sy + 1, z, sx, sy, sz, k]);
  }
  const [px, py, pz] = pivot;
  const n = box.length;
  const off = new Int8Array(n * 3), size = new Uint8Array(n * 3), rgb = new Uint8Array(n * 3), glow = new Uint8Array(n), bend = new Uint8Array(n * 2);
  let H = 1, rad = 0, R = 0, G = 0, B = 0, wsum = 0, lit = 0;
  for (const b of box) {
    const y0 = b[1] - py, y1 = y0 + b[4];
    H = Math.max(H, mode === 'down' ? -y0 : mode === 'out' ? Math.max(y1, b[2] + b[5] - pz) : y1);
    for (const xx of [b[0] - px, b[0] + b[3] - px]) for (const zz of [b[2] - pz, b[2] + b[5] - pz]) rad = Math.max(rad, Math.hypot(xx, zz));
  }
  const clamp8 = (q) => Math.max(-128, Math.min(127, q));
  const bendAt = (x, y, z) => {
    let k;
    if (mode === 'down') k = Math.max(0, -y) / H;
    else if (mode === 'out') k = Math.hypot(Math.max(0, y), Math.max(0, z)) / H;
    else if (mode === 'flat') k = Math.min(1, Math.max(0, y) / 3) * 0.25;
    else if (mode === 'none') k = 0;
    else k = Math.max(0, y) / H;
    return Math.round(Math.pow(Math.min(1, k), 1.35) * 255);
  };
  box.forEach((b, i) => {
    const ox = b[0] - px, oy = b[1] - py, oz = b[2] - pz;
    off[i * 3] = clamp8(ox); off[i * 3 + 1] = clamp8(oy); off[i * 3 + 2] = clamp8(oz);
    size[i * 3] = b[3]; size[i * 3 + 1] = b[4]; size[i * 3 + 2] = b[5];
    const k = b[6];
    rgb[i * 3] = (k >> 16) & 255; rgb[i * 3 + 1] = (k >> 8) & 255; rgb[i * 3 + 2] = k & 255;
    glow[i] = (k >> 24) & 3;
    const cx = ox + b[3] / 2, cz = oz + b[5] / 2;
    // bottom and top of the box (for a hanging plant its bottom is the far end)
    bend[i * 2] = bendAt(cx, oy, cz);
    bend[i * 2 + 1] = bendAt(cx, oy + b[4], cz);
    const wv = b[3] * b[4] * b[5];
    R += rgb[i * 3] * wv; G += rgb[i * 3 + 1] * wv; B += rgb[i * 3 + 2] * wv; wsum += wv;
    if (glow[i]) lit += wv;
  });
  wsum = Math.max(1, wsum);
  return { n, off, size, rgb, glow, bend, H, rad, col: [R / wsum / 255, G / wsum / 255, B / wsum / 255], glowK: lit / wsum, mode };
}
