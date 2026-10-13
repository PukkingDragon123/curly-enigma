// High-res pixel-art floor materials for the iso scenes. A Surf is a texel buffer
// (packed sRGB color + relief height + wetness) that painters draw cobbles, setts,
// flagstones, planks, packed dirt, moss, pebbles, roots, footprints, ruts and
// contact shadows into. toTextures() turns it into a color map, a normal map (from
// the relief, so lantern light rakes across every stone) and a wetness/specular map.
import * as THREE from 'three';

// ---------------------------------------------------------------- tiny helpers
export function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const R = (c) => (c >> 16) & 255;
export const G = (c) => (c >> 8) & 255;
export const B = (c) => c & 255;
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export function mul(c, k) { return (cl(R(c) * k) << 16) | (cl(G(c) * k) << 8) | cl(B(c) * k); }
export function mix(a, b, t) { return (cl(R(a) + (R(b) - R(a)) * t) << 16) | (cl(G(a) + (G(b) - G(a)) * t) << 8) | cl(B(a) + (B(b) - B(a)) * t); }
export function tint(c, r, g, b) { return (cl(R(c) * r) << 16) | (cl(G(c) * g) << 8) | cl(B(c) * b); }
export const hyp = (a, b) => Math.sqrt(a * a + b * b);
const sstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Smooth value-noise field (Float32Array w*h in [-1,1]) from a lattice of `cell` texels. */
export function noiseField(w, h, cell, seed, octaves = 1, gain = 0.5) {
  const out = new Float32Array(w * h);
  let amp = 1, tot = 0;
  const IX = new Int32Array(w), TX = new Float32Array(w);
  for (let o = 0; o < octaves; o++) {
    const c = Math.max(2, cell / (1 << o));
    const LW = Math.ceil(w / c) + 2, LH = Math.ceil(h / c) + 2;
    const lat = new Float32Array(LW * LH);
    for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) lat[i + j * LW] = (hash2(i, j, seed + o * 101) * 2 - 1) * amp;
    for (let x = 0; x < w; x++) { const fx = x / c; IX[x] = fx | 0; TX[x] = sstep(fx - (fx | 0)); }
    for (let y = 0; y < h; y++) {
      const fy = y / c, iy = fy | 0, ty = sstep(fy - iy);
      const r0 = iy * LW, r1 = r0 + LW, row = y * w;
      for (let x = 0; x < w; x++) {
        const ix = IX[x], tx = TX[x];
        const p00 = lat[r0 + ix], p10 = lat[r0 + ix + 1], p01 = lat[r1 + ix], p11 = lat[r1 + ix + 1];
        const a = p00 + (p10 - p00) * tx;
        out[row + x] += a + (p01 + (p11 - p01) * tx - a) * ty;
      }
    }
    tot += amp;
    amp *= gain;
  }
  if (tot !== 1) { const k = 1 / tot; for (let i = 0; i < out.length; i++) out[i] *= k; }
  return out;
}

/** Point-sampled value noise in [-1,1] (same look as noiseField) for sparse lookups over a w×h texel area. */
export function noiseSampler(cell, seed, octaves = 1, gain = 0.5, w = 4096, h = 4096) {
  const L = [];
  let amp = 1, tot = 0;
  for (let o = 0; o < octaves; o++) {
    const c = Math.max(2, cell / (1 << o));
    const LW = Math.ceil(w / c) + 3, LH = Math.ceil(h / c) + 3;
    const lat = new Float32Array(LW * LH);
    for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) lat[i + j * LW] = hash2(i, j, seed + o * 101) * 2 - 1;
    L.push({ inv: 1 / c, amp, lat, LW, LH });
    tot += amp;
    amp *= gain;
  }
  const k = 1 / tot;
  return (x, y) => {
    let v = 0;
    for (let o = 0; o < L.length; o++) {
      const q = L[o];
      let fx = x * q.inv, fy = y * q.inv;
      if (fx < 0) fx = 0; if (fy < 0) fy = 0;
      let ix = fx | 0, iy = fy | 0;
      if (ix > q.LW - 2) ix = q.LW - 2; if (iy > q.LH - 2) iy = q.LH - 2;
      const tx = sstep(fx - ix), ty = sstep(fy - iy);
      const r0 = iy * q.LW + ix, r1 = r0 + q.LW, lat = q.lat;
      const a = lat[r0] + (lat[r0 + 1] - lat[r0]) * tx;
      const b = lat[r1] + (lat[r1 + 1] - lat[r1]) * tx;
      v += (a + (b - a) * ty) * q.amp;
    }
    return v * k;
  };
}

// ---------------------------------------------------------------- the buffer
export class Surf {
  /** w, h in texels; tpx = texels per world unit. */
  constructor(w, h, tpx = 32) {
    this.w = w;
    this.h = h;
    this.tpx = tpx;
    this.c = new Uint32Array(w * h);
    this.ht = new Float32Array(w * h);
    this.wet = new Uint8Array(w * h); // 0..255 extra shine (puddles, damp moss)
    this.own = new Uint8Array(w * h); // which painter owns the texel (0 = base)
    this.fields = new Map();
  }
  field(key, cell, seed, oct = 1) {
    let f = this.fields.get(key);
    if (!f) this.fields.set(key, (f = noiseField(this.w, this.h, cell, seed, oct)));
    return f;
  }
  /** Sparse noise lookups (cached sampler). */
  sampler(key, cell, seed, oct = 1) {
    let f = this.fields.get(key);
    if (!f) this.fields.set(key, (f = noiseSampler(cell, seed, oct, 0.5, this.w, this.h)));
    return f;
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  put(x, y, c, h) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = x + y * this.w;
    this.c[i] = c;
    if (h !== undefined) this.ht[i] = h;
  }
  /** Multiply a soft ellipse of texels by k (contact shadows, AO). Coordinates in texels. */
  darken(cx, cy, rx, ry, k, soft = 0.6) {
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = hyp((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      if (d >= 1) continue;
      const t = d < soft ? 1 : 1 - (d - soft) / (1 - soft);
      const dith = ((x & 1) ^ (y & 1)) * 0.06;
      const i = x + y * this.w;
      this.c[i] = mul(this.c[i], 1 - (1 - k) * Math.min(1, t + dith * (t > 0.05 && t < 0.95 ? 1 : 0)));
    }
  }
  wetEllipse(cx, cy, rx, ry, v) {
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(this.w - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(this.h - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = hyp((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      if (d < 1) { const i = x + y * this.w; this.wet[i] = Math.max(this.wet[i], v * 255 * (1 - d * d)); }
    }
  }
}

// ---------------------------------------------------------------- stone profile
/** Rounded-rect signed distance (negative inside). */
function rrect(px, py, hw, hh, r) {
  const qx = Math.abs(px) - hw + r, qy = Math.abs(py) - hh + r;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
  return hyp(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Shade one stone texel. d = signed distance to the stone edge (texels, negative inside),
 * dome = 0..1 from center, base color, i = texel index. Writes color + height.
 */
function stoneTexel(S, i, x, y, d, dome, base, o) {
  const bevel = o.bevel ?? 2.6;
  const t = sstep(-d / bevel);
  const h = (o.height ?? 2.2) * (t * 0.82 + 0.18 * t * (1 - dome * dome));
  // light grain inside the stone + tiny speckles
  const n = hash2(x, y, o.seed ?? 3);
  let k = 0.94 + n * 0.1;
  if (n > 0.965) k = 1.18;
  else if (n < 0.03) k = 0.78;
  // worn top edge highlight (top-left) / shadow lip (bottom-right) baked lightly
  S.c[i] = mul(base, k);
  S.ht[i] = h;
}

// ---------------------------------------------------------------- setts (running bond)
/**
 * Rectangular setts in rows. reg: {x0,y0,x1,y1 (texels), inside(cxTex, cyTex) → bool}.
 * o: {axis:'x'|'y', rowH, minL, maxL, gap, palette:[hex], mortar, seed, moss, crack, bevel, height}
 */
export function setts(S, reg, o) {
  const axX = o.axis !== 'y';
  const rowH = o.rowH ?? 9, gap = o.gap ?? 2;
  const seed = o.seed ?? 1;
  const pal = o.palette;
  const mortar = o.mortar ?? 0x3a3028;
  const mossC = o.mossColor ?? 0x4f7a34;
  // per-row stone boundaries along the run
  const span = axX ? reg.x1 - reg.x0 + 64 : reg.y1 - reg.y0 + 64;
  const rows = new Map();
  const rowBounds = (r) => {
    let b = rows.get(r);
    if (b) return b;
    b = [];
    let u = -Math.floor(hash2(r, 7, seed) * (o.maxL ?? 16));
    while (u < span) { b.push(u); u += (o.minL ?? 9) + Math.floor(hash2(r, b.length, seed + 1) * ((o.maxL ?? 16) - (o.minL ?? 9) + 1)); }
    b.push(u);
    rows.set(r, b);
    return b;
  };
  const okCache = new Map();
  const mossF = o.moss ? S.sampler('mossSett' + seed, 40, seed + 9, 2) : null;
  for (let y = Math.max(0, reg.y0); y < Math.min(S.h, reg.y1); y++) {
    for (let x = Math.max(0, reg.x0); x < Math.min(S.w, reg.x1); x++) {
      const u = (axX ? x - reg.x0 : y - reg.y0) + 32, v = axX ? y : x;
      const r = Math.floor(v / rowH);
      const b = rowBounds(r);
      // find stone (rows are short; linear scan from a hint)
      let k = Math.min(b.length - 2, Math.max(0, Math.floor(u / ((o.minL ?? 9) + (o.maxL ?? 16)) * 2) - 2));
      while (k > 0 && b[k] > u) k--;
      while (k < b.length - 2 && b[k + 1] <= u) k++;
      const s0 = b[k], s1 = b[k + 1];
      const key = r * 100000 + k;
      let ok = okCache.get(key);
      if (ok === undefined) {
        const cu = (s0 + s1) / 2 - 32, cv = (r + 0.5) * rowH;
        const cx = axX ? reg.x0 + cu : cv, cy = axX ? cv : reg.y0 + cu;
        ok = reg.inside(cx, cy, r, k);
        okCache.set(key, ok);
      }
      if (!ok) continue;
      const i = x + y * S.w;
      const L = s1 - s0;
      const lu = u - s0 - L / 2, lv = v - r * rowH - rowH / 2;
      const hw = L / 2 - gap / 2, hh = rowH / 2 - gap / 2;
      const chip = hash2(r, k, seed + 5);
      const d = rrect(lu, lv, hw, hh, chip < 0.3 ? 3 : 2);
      S.own[i] = o.owner ?? 2;
      if (d > 0) {
        // mortar: dark, slightly lower, moss creeping in the damp joints
        const m = mossF && mossF(x, y) > (o.moss ?? 0.3) && hash2(x, y, seed + 2) < 0.75;
        S.c[i] = m ? mul(mossC, 0.85 + hash2(x, y, 4) * 0.35) : mul(mortar, 0.85 + hash2(x, y, seed) * 0.3);
        S.ht[i] = m ? 0.5 : -0.3;
        continue;
      }
      const base = mul(pal[Math.floor(hash2(r, k, seed + 3) * pal.length)], 0.88 + hash2(k, r, seed + 4) * 0.22);
      const dome = Math.min(1, hyp(lu / Math.max(1, hw), lv / Math.max(1, hh)));
      stoneTexel(S, i, x, y, d, dome, base, o);
      // a crack across some stones
      if (o.crack && chip > 1 - o.crack) {
        const cxk = lu * 0.6 + lv * (chip > 0.96 ? -1.3 : 1.1);
        if (Math.abs(cxk + (hash2(r, k, 9) - 0.5) * 4) < 0.8 && d < -1.5) { S.c[i] = mul(base, 0.55); S.ht[i] -= 1; }
      }
    }
  }
}

// ---------------------------------------------------------------- concentric ring setts (plaza)
/** o: {cx, cy (texels), r0, r1 (texels), rowH, L, gap, palette, mortar, seed, inside?(x,y)} */
export function ringSetts(S, o) {
  const rowH = o.rowH ?? 9, gap = o.gap ?? 2, seed = o.seed ?? 2;
  const pal = o.palette, mortar = o.mortar ?? 0x3a3028;
  const x0 = Math.max(0, Math.floor(o.cx - o.r1 - 2)), x1 = Math.min(S.w, Math.ceil(o.cx + o.r1 + 2));
  const y0 = Math.max(0, Math.floor(o.cy - o.r1 - 2)), y1 = Math.min(S.h, Math.ceil(o.cy + o.r1 + 2));
  const mossF = o.moss ? S.sampler('mossRing' + seed, 36, seed + 9, 2) : null;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const dx = x + 0.5 - o.cx, dy = y + 0.5 - o.cy;
    const r = hyp(dx, dy);
    if (r < o.r0 || r >= o.r1) continue;
    if (o.inside && !o.inside(x, y)) continue;
    const ring = Math.floor((r - o.r0) / rowH);
    const rc = o.r0 + (ring + 0.5) * rowH;
    const n = Math.max(6, Math.round((2 * Math.PI * rc) / (o.L ?? 13)));
    const a = (Math.atan2(dy, dx) / (2 * Math.PI) + 1 + hash2(ring, 0, seed)) % 1;
    const k = Math.floor(a * n);
    const arcL = (2 * Math.PI * rc) / n;
    const lu = (a * n - k - 0.5) * arcL, lv = r - rc;
    const i = x + y * S.w;
    const d = rrect(lu, lv, arcL / 2 - gap / 2, rowH / 2 - gap / 2, 2);
    S.own[i] = o.owner ?? 3;
    if (d > 0) {
      const m = mossF && mossF(x, y) > (o.moss ?? 0.3) && hash2(x, y, seed + 2) < 0.7;
      S.c[i] = m ? mul(0x4f7a34, 0.85 + hash2(x, y, 4) * 0.35) : mul(mortar, 0.85 + hash2(x, y, seed) * 0.3);
      S.ht[i] = m ? 0.5 : -0.3;
      continue;
    }
    const base = mul(pal[Math.floor(hash2(ring, k, seed + 3) * pal.length)], 0.86 + hash2(k, ring, seed + 4) * 0.24);
    const dome = Math.min(1, hyp(lu / (arcL / 2), lv / (rowH / 2)));
    stoneTexel(S, i, x, y, d, dome, base, o);
  }
}

// ---------------------------------------------------------------- voronoi cobbles / flagstones
/**
 * Irregular stones from a jittered grid. reg: {x0,y0,x1,y1, inside(cx,cy) for the stone center}.
 * o: {cell, gap, palette, mortar, seed, jitter, height, bevel, moss}
 */
export function cobbles(S, reg, o) {
  const cell = o.cell ?? 11, seed = o.seed ?? 4, jit = o.jitter ?? 0.8, gap = o.gap ?? 1.6;
  const pal = o.palette, mortar = o.mortar ?? 0x3a3028;
  const GW = Math.ceil(S.w / cell) + 2, GH = Math.ceil(S.h / cell) + 2;
  const SX = new Float32Array(GW * GH), SY = new Float32Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    SX[gx + gy * GW] = (gx - 1 + 0.5 + (hash2(gx - 1, gy - 1, seed) - 0.5) * jit) * cell;
    SY[gx + gy * GW] = (gy - 1 + 0.5 + (hash2(gx - 1, gy - 1, seed + 1) - 0.5) * jit) * cell;
  }
  const okCache = new Map();
  const mossF = o.moss ? S.sampler('mossCob' + seed, 30, seed + 9, 2) : null;
  for (let y = Math.max(0, reg.y0); y < Math.min(S.h, reg.y1); y++) {
    const gy0 = Math.floor(y / cell);
    for (let x = Math.max(0, reg.x0); x < Math.min(S.w, reg.x1); x++) {
      const gx0 = Math.floor(x / cell);
      let d1 = 1e9, d2 = 1e9, bx = 0, by = 0, sx = 0, sy = 0;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const si = gx0 + k + 1 + (gy0 + j + 1) * GW;
        const px = SX[si], py = SY[si];
        const ex = px - x - 0.5, ey = py - y - 0.5;
        const dd = ex * ex + ey * ey;
        if (dd < d1) { d2 = d1; d1 = dd; bx = gx0 + k; by = gy0 + j; sx = px; sy = py; } else if (dd < d2) d2 = dd;
      }
      const key = bx * 65536 + by;
      let ok = okCache.get(key);
      if (ok === undefined) { ok = reg.inside(sx, sy); okCache.set(key, ok); }
      if (!ok) continue;
      const i = x + y * S.w;
      const e = (Math.sqrt(d2) - Math.sqrt(d1)) / 2; // distance to the cell edge
      S.own[i] = o.owner ?? 4;
      const shrink = hash2(bx, by, seed + 6) * 1.2;
      if (e < gap / 2 + shrink) {
        const m = mossF && mossF(x, y) > (o.moss ?? 0.25) && hash2(x, y, seed + 2) < 0.8;
        S.c[i] = m ? mul(0x4f7a34, 0.85 + hash2(x, y, 4) * 0.35) : mul(mortar, 0.85 + hash2(x, y, seed) * 0.3);
        S.ht[i] = m ? 0.5 : -0.3;
        continue;
      }
      const base = mul(pal[Math.floor(hash2(bx, by, seed + 3) * pal.length)], 0.86 + hash2(by, bx, seed + 4) * 0.24);
      const r = Math.sqrt(d1) / (cell * 0.6);
      stoneTexel(S, i, x, y, -(e - gap / 2 - shrink), Math.min(1, r), base, o);
    }
  }
}

// ---------------------------------------------------------------- planks
/**
 * Plank boards. reg: {x0,y0,x1,y1 (texels), inside(x,y)?}. o: {axis:'x'|'y', bw (board width),
 * minL, maxL, color, seed, gap, nails, worn}
 */
export function planks(S, reg, o) {
  const axX = o.axis !== 'y';
  const bw = o.bw ?? 9, seed = o.seed ?? 5, gap = o.gap ?? 1;
  const base = o.color ?? 0x8a5a32;
  const rows = new Map();
  const bounds = (r) => {
    let b = rows.get(r);
    if (b) return b;
    b = [];
    let u = -Math.floor(hash2(r, 3, seed) * (o.maxL ?? 90));
    while (u < 4096) { b.push(u); u += (o.minL ?? 48) + Math.floor(hash2(r, b.length, seed + 1) * ((o.maxL ?? 90) - (o.minL ?? 48))); }
    b.push(u);
    rows.set(r, b);
    return b;
  };
  for (let y = Math.max(0, reg.y0); y < Math.min(S.h, reg.y1); y++) for (let x = Math.max(0, reg.x0); x < Math.min(S.w, reg.x1); x++) {
    if (reg.inside && !reg.inside(x, y)) continue;
    const u = axX ? x - reg.x0 : y - reg.y0, v = axX ? y - reg.y0 : x - reg.x0;
    const r = Math.floor(v / bw), lv = v - r * bw;
    const b = bounds(r);
    let k = 0;
    while (k < b.length - 2 && b[k + 1] <= u) k++;
    const lu = u - b[k], L = b[k + 1] - b[k];
    const i = x + y * S.w;
    S.own[i] = o.owner ?? 5;
    if (lv < gap || lu < 1) { S.c[i] = mul(0x22160e, 0.9 + hash2(x, y, 2) * 0.2); S.ht[i] = -1.5; continue; }
    const pk = hash2(r, k, seed + 2);
    let c = mul(base, 0.84 + pk * 0.3);
    // grain: wavy streaks along the board
    const gr = Math.sin((lv + Math.sin(lu * 0.09 + pk * 20) * 1.4) * 1.9 + pk * 9);
    if (gr > 0.82) c = mul(c, 0.84);
    else if (gr < -0.9) c = mul(c, 1.08);
    if (hash2(x, y, seed) < 0.05) c = mul(c, 0.9);
    // knots
    const kx = Math.floor(pk * 997) % Math.max(8, L - 16) + 8, ky = bw / 2;
    if (pk > 0.55) {
      const dk = hyp((lu - kx) / 2.2, (lv - ky) / 1.3);
      if (dk < 1) c = mul(base, dk < 0.5 ? 0.45 : 0.68);
      else if (dk < 1.6) c = mul(c, 0.85);
    }
    // worn middle of the board, darker ends
    if (o.worn) c = mul(c, 1 + 0.08 * Math.max(0, 1 - Math.abs(lv - bw / 2) / (bw / 2)));
    if (lu < 3 || L - lu < 3) c = mul(c, 0.86);
    // nails near both ends
    if (o.nails !== false && (lu === 3 || lu === L - 4) && (lv === gap + 1 || lv === bw - 2)) { c = 0x8a8a90; S.ht[i] = 1.6; S.c[i] = c; continue; }
    if (o.nails !== false && (lu === 4 || lu === L - 3) && (lv === gap + 1 || lv === bw - 2)) { S.c[i] = 0x3a3a40; S.ht[i] = 0.8; continue; }
    S.c[i] = c;
    S.ht[i] = 1.0 - Math.abs(lv - bw / 2) / bw * 0.6;
  }
}

// ---------------------------------------------------------------- packed dirt
/**
 * Packed earth over a texel rect (skips texels already owned when o.under is false).
 * o: {colors:[a,b,c] (light→dark), seed, pebbles, moss(fn(x,y)→0..1), mossColors}
 */
export function dirt(S, reg, o = {}) {
  const seed = o.seed ?? 11;
  const [ca, cb, cc] = o.colors ?? [0x6a4c34, 0x5a3f2b, 0x4a3324];
  const big = S.field('dirtBig' + seed, 96, seed, 2);
  const mid = S.field('dirtMid' + seed, 14, seed + 5, 1);
  const fine = S.field('dirtFine' + seed, 4, seed + 7, 1);
  const x0 = Math.max(0, reg.x0 ?? 0), x1 = Math.min(S.w, reg.x1 ?? S.w), y0 = Math.max(0, reg.y0 ?? 0), y1 = Math.min(S.h, reg.y1 ?? S.h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = x + y * S.w;
    if (reg.inside && !reg.inside(x, y)) continue;
    const n = big[i], m = mid[i];
    const h = hash2(x, y, seed);
    // band edges break up into organic clumps (small-scale noise), never an ordered dither
    const jn = n + fine[i] * 0.16 + m * 0.05;
    let c = jn > 0.17 ? ca : jn < -0.19 ? cc : cb;
    let k = 0.95 + m * 0.07 + fine[i] * 0.03;
    if (h < 0.025) k *= 0.82; else if (h > 0.982) k *= 1.12;
    S.c[i] = mul(c, k);
    S.ht[i] = m * 0.6 + (h > 0.96 ? 0.4 : 0);
    S.own[i] = 0;
  }
}

/** Scatter small pebbles (jittered grid). inside(x,y) gates by position. */
export function pebbles(S, reg, o = {}) {
  const cell = o.cell ?? 14, seed = o.seed ?? 21, p = o.chance ?? 0.3;
  const pal = o.palette ?? [0x8a8078, 0x7a6e64, 0x9a8c7c, 0x6a5e54, 0xa89a88];
  for (let gy = Math.floor((reg.y0 ?? 0) / cell); gy * cell < (reg.y1 ?? S.h); gy++) for (let gx = Math.floor((reg.x0 ?? 0) / cell); gx * cell < (reg.x1 ?? S.w); gx++) {
    if (hash2(gx, gy, seed) > p) continue;
    const cx = (gx + 0.2 + hash2(gx, gy, seed + 1) * 0.6) * cell, cy = (gy + 0.2 + hash2(gx, gy, seed + 2) * 0.6) * cell;
    if (reg.inside && !reg.inside(cx | 0, cy | 0)) continue;
    const rx = 1.4 + hash2(gx, gy, seed + 3) * (o.size ?? 2.4), ry = rx * (0.6 + hash2(gx, gy, seed + 4) * 0.3);
    const c = pal[Math.floor(hash2(gx, gy, seed + 5) * pal.length)];
    pebble(S, cx, cy, rx, ry, c);
  }
}

/** One pebble: domed, lit top-left, shadow bottom-right (texel coords). */
export function pebble(S, cx, cy, rx, ry, c) {
  // shadow first
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx + 1); x++) {
    if (!S.inb(x, y)) continue;
    const ds = hyp((x + 0.5 - cx - 0.8) / rx, (y + 0.5 - cy - 1) / ry);
    if (ds < 1) { const i = x + y * S.w; S.c[i] = mul(S.c[i], 0.72); }
  }
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    if (!S.inb(x, y)) continue;
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const d = dx * dx + dy * dy;
    if (d >= 1) continue;
    const i = x + y * S.w;
    const lit = -dx * 0.6 - dy * 0.8;
    S.c[i] = mul(c, 0.86 + lit * 0.22 + (d < 0.15 && lit > 0.2 ? 0.2 : 0));
    S.ht[i] = Math.max(S.ht[i], 1.6 * Math.sqrt(1 - d));
  }
}

/**
 * A wandering line (roots, cracks, ruts). pts generated from a start, a heading and a length.
 * o: {width, color, height, seed, wander, taper, dark (multiply instead of color)}
 */
export function worm(S, x, y, ang, len, o = {}) {
  const seed = o.seed ?? 31;
  let a = ang;
  const w0 = o.width ?? 2;
  for (let s = 0; s < len; s += 0.7) {
    const k = s / len;
    const w = o.taper ? w0 * (1 - k * 0.75) : w0;
    a += (hash2(Math.floor(s * 3), 0, seed) - 0.5) * (o.wander ?? 0.35);
    x += Math.cos(a) * 0.7;
    y += Math.sin(a) * 0.7;
    const r = w / 2;
    for (let j = Math.floor(y - r); j <= Math.ceil(y + r); j++) for (let i = Math.floor(x - r); i <= Math.ceil(x + r); i++) {
      if (!S.inb(i, j)) continue;
      const d = hyp(i + 0.5 - x, j + 0.5 - y);
      if (d > r) continue;
      const q = i + j * S.w;
      if (o.dark) { if (!o.mark || !S.own[q] || o.anyOwner) { S.c[q] = mul(S.c[q], o.dark); S.ht[q] += o.height ?? -0.6; } continue; }
      const side = (Math.cos(a + Math.PI / 2) * (i + 0.5 - x) + Math.sin(a + Math.PI / 2) * (j + 0.5 - y)) / Math.max(0.5, r);
      S.c[q] = mul(o.color ?? 0x6a4a2a, 0.9 - side * 0.18 + hash2(i, j, seed) * 0.1);
      S.ht[q] = (o.height ?? 1.2) * (1 - (d / r) * (d / r) * 0.6);
    }
    if (o.branch && hash2(Math.floor(s), 9, seed) < o.branch && w > 1.4) worm(S, x, y, a + (hash2(Math.floor(s), 3, seed) < 0.5 ? -0.9 : 0.9), len * (1 - k) * 0.45, { ...o, width: w * 0.6, branch: 0, seed: seed + Math.floor(s) });
  }
}

/** A trail of small paw prints (two-by-two) from (x,y) along angle ang (texels). */
export function pawTrail(S, x, y, ang, steps, o = {}) {
  const seed = o.seed ?? 41;
  const stride = o.stride ?? 9, side = o.side ?? 3;
  for (let k = 0; k < steps; k++) {
    if (hash2(k, 0, seed) < (o.skip ?? 0.15)) continue;
    const s = k * stride;
    const off = (k % 2 ? 1 : -1) * side;
    const px = x + Math.cos(ang) * s - Math.sin(ang) * off, py = y + Math.sin(ang) * s + Math.cos(ang) * off;
    paw(S, px, py, ang, o.k ?? 0.8);
  }
}

function paw(S, x, y, ang, k) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const dots = [[0, 0, 1.3], [2.6, -1.4, 0.7], [3.0, 0, 0.7], [2.6, 1.4, 0.7]];
  for (const [fx, fy, r] of dots) {
    const cx = x + fx * ca - fy * sa, cy = y + fx * sa + fy * ca;
    for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) {
      if (!S.inb(i, j) || hyp(i + 0.5 - cx, j + 0.5 - cy) > r + 0.2) continue;
      const q = i + j * S.w;
      S.c[q] = mul(S.c[q], k);
      S.ht[q] -= 0.5;
    }
  }
}

/** Moss patch: noise-edged blob with highlights, tiny flowers and clover. */
export function moss(S, cx, cy, rx, ry, o = {}) {
  const seed = o.seed ?? 51;
  const f = S.sampler('mossEdge', 9, 77, 2);
  const cols = o.colors ?? [0x3f6a2c, 0x4f7f34, 0x66983e, 0x2f5222];
  const flowers = o.flowers ?? [0xf0e070, 0xf0a0c0, 0xe8e8ff, 0xc8a0f0];
  for (let y = Math.floor(cy - ry - 3); y <= Math.ceil(cy + ry + 3); y++) for (let x = Math.floor(cx - rx - 3); x <= Math.ceil(cx + rx + 3); x++) {
    if (!S.inb(x, y)) continue;
    const i = x + y * S.w;
    const d = hyp((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry) + f(x, y) * 0.35;
    if (d >= 1) continue;
    if (o.onlyOwner !== undefined && S.own[i] !== o.onlyOwner && !(o.alsoMortar && S.ht[i] < 0)) continue;
    const h = hash2(x, y, seed);
    let c = cols[h < 0.35 ? 1 : h < 0.6 ? 0 : h < 0.82 ? 2 : 3];
    if (d > 0.8 && ((x + y) & 1)) continue; // ragged dithered edge
    if (h > 0.985) c = flowers[Math.floor(hash2(y, x, seed) * flowers.length)];
    S.c[i] = c;
    S.ht[i] = Math.max(S.ht[i], 0.8 + hash2(x >> 1, y >> 1, seed) * 0.8);
    S.wet[i] = Math.max(S.wet[i], 38);
  }
}

// ---------------------------------------------------------------- finishing
/**
 * Cavity darkening from the relief (blurred height vs height) + baked raking light. Stored as
 * a per-texel multiplier that writeTexels applies (so partial repaints can recompute it).
 */
export function finish(S, o = {}) {
  S.finishOpts = { ao: o.ao ?? 0.12, rake: o.rake ?? 0.1, aoRadius: o.aoRadius ?? 3 };
}

function blurHeights(S, x0, y0, x1, y1, R2) {
  const { w, h, ht } = S;
  const bw = x1 - x0, bh = y1 - y0;
  const tmp = new Float32Array(bw * bh), blur = new Float32Array(bw * bh);
  const inv = 1 / (2 * R2 + 1);
  for (let y = y0; y < y1; y++) {
    let acc = 0;
    for (let x = x0 - R2; x <= x0 + R2; x++) acc += ht[Math.min(w - 1, Math.max(0, x)) + y * w];
    for (let x = x0; x < x1; x++) {
      tmp[x - x0 + (y - y0) * bw] = acc * inv;
      acc += ht[Math.min(w - 1, x + R2 + 1) + y * w] - ht[Math.max(0, x - R2) + y * w];
    }
  }
  for (let x = 0; x < bw; x++) {
    let acc = 0;
    for (let y = -R2; y <= R2; y++) acc += tmp[x + Math.min(bh - 1, Math.max(0, y)) * bw];
    for (let y = 0; y < bh; y++) {
      blur[x + y * bw] = acc * inv;
      acc += tmp[x + Math.min(bh - 1, y + R2 + 1) * bw] - tmp[x + Math.max(0, y - R2) * bw];
    }
  }
  return blur;
}

/** Encode a texel rect of the Surf into RGBA byte arrays {col, nor, spe} (applies finish()'s cavity/rake shading). */
export function writeTexels(S, data, x0, y0, x1, y1, o = {}) {
  const { w, h, c, ht, wet } = S;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
  const { col, nor, spe } = data;
  const strength = o.normal ?? 0.55;
  const fo = S.finishOpts;
  const blur = fo ? blurHeights(S, x0, y0, x1, y1, fo.aoRadius) : null;
  const bw = x1 - x0;
  const baseSpec = (o.baseSpec ?? 0.06) * 255, topSpec = o.topSpec ?? 8;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = x + y * w, k = i * 4;
    const hc = ht[i];
    const hl = ht[x > 0 ? i - 1 : i], hr = ht[x < w - 1 ? i + 1 : i], hu = ht[y > 0 ? i - w : i], hd = ht[y < h - 1 ? i + w : i];
    const gx = hr - hl, gy = hd - hu;
    let m = 1;
    if (blur) {
      const cav = (hc - blur[x - x0 + (y - y0) * bw]) * fo.ao;
      const rk = (gx * 0.8 + gy * 0.45) * fo.rake;
      m = 1 + (cav < -0.3 ? -0.3 : cav > 0.18 ? 0.18 : cav) + (rk < -0.22 ? -0.22 : rk > 0.22 ? 0.22 : rk);
    }
    const v = c[i];
    const r = ((v >> 16) & 255) * m, g = ((v >> 8) & 255) * m, b = (v & 255) * m;
    col[k] = r > 255 ? 255 : r; col[k + 1] = g > 255 ? 255 : g; col[k + 2] = b > 255 ? 255 : b; col[k + 3] = 255;
    // tangent space: +x along u (world +x), +y along v (= texel +y = world +z)
    const nx = -gx * strength, ny = -gy * strength;
    const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
    nor[k] = (nx * l * 0.5 + 0.5) * 255; nor[k + 1] = (ny * l * 0.5 + 0.5) * 255; nor[k + 2] = (l * 0.5 + 0.5) * 255; nor[k + 3] = 255;
    const sp = baseSpec + wet[i] + (hc > 0 ? hc * topSpec : 0);
    spe[k] = spe[k + 1] = spe[k + 2] = sp > 255 ? 255 : sp; spe[k + 3] = 255;
  }
}

/** Build THREE textures: {map (sRGB), normalMap, specularMap, data}. Row 0 = texel y 0 (use uv v = y / h). */
export function toTextures(S, o = {}) {
  const { w, h } = S;
  const data = { col: new Uint8Array(w * h * 4), nor: new Uint8Array(w * h * 4), spe: new Uint8Array(w * h * 4) };
  writeTexels(S, data, 0, 0, w, h, o);
  const mk = (arr, srgb) => {
    const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(data.col, true), normalMap: mk(data.nor, false), specularMap: mk(data.spe, false), data, opts: o };
}

/** Re-encode a texel rect into existing textures (partial repaint, e.g. home floor painting). */
export function updateTextures(S, tex, x0, y0, x1, y1) {
  writeTexels(S, tex.data, x0 - 1, y0 - 1, x1 + 1, y1 + 1, tex.opts || {});
  tex.map.needsUpdate = true;
  tex.normalMap.needsUpdate = true;
  tex.specularMap.needsUpdate = true;
}

/** Dispose the textures made by toTextures. */
export function disposeTextures(tex) {
  if (!tex) return;
  tex.map.dispose();
  tex.normalMap.dispose();
  tex.specularMap.dispose();
}
