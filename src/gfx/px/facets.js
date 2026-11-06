// A tiny z-buffered, flat-faceted rasterizer for "hand-cut" mineral icons.
//
// Objects (convex hulls of jittered points, crystal prisms, boxes, cut-gem meshes) are
// written into a per-pixel depth / object / face buffer, then shaded the way a pixel
// artist would: one ramp tone per plane (top-left light), mottled texture, crisp lit
// ridges where two planes meet, contact shadows and cast shadows between objects, dark
// occlusion lines where one piece passes in front of another, a lighter rim on the lit
// edge and a selective (material-tinted) 1px outline.
//
// Space: x right, y down (screen pixels), z toward the viewer.
import { mat, mix, toHsl, fromHsl, towardHue } from './color.js';
import { LIGHT, hash2, vnoise, bayer, toneOf, Mask } from './shade.js';

// ---------------------------------------------------------------- vectors
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
/** Icon light: top-left and fairly frontal, so front planes sit on the base tone. */
export const FL = nrm([-0.55, -0.45, 0.7]);
const L = FL;
const HALF = nrm([L[0], L[1], L[2] + 1]);
/**
 * Intensity → tone band edges for planes lit by FL. In the 3/4 view (pitch ~0.7) this gives:
 * top-left bevel 1, top 2, front / left 3, front-right 4, right / underside 5.
 */
export const FBANDS = [0.98, 0.9, 0.7, 0.15, -0.4];
const tone = (I, b) => toneOf(I, b || FBANDS);
void LIGHT;
// one step toward the light in screen space, and how much higher a blocker must be per step
const LS = (() => { const l = Math.hypot(L[0], L[1]); return [L[0] / l, L[1] / l, L[2] / l]; })();

/** Rotate points around the origin (x, then y, then z axis; radians), then scale and translate. */
export function xf(pts, o = {}) {
  const ax = o.rx || 0, ay = o.ry || 0, az = o.rz || 0, s = o.s ?? 1, t = o.t || [0, 0, 0];
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  return pts.map(([x, y, z]) => {
    let y1 = y * cx - z * sx, z1 = y * sx + z * cx;
    let x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
    let x3 = x2 * cz - y1 * sz, y3 = x2 * sz + y1 * cz;
    return [x3 * s + t[0], y3 * s + t[1], z2 * s + t[2]];
  });
}

/** Convex hull of 3D points (brute force; fine for < 30 points). Faces as outward [i, j, k]. */
export function hull3(P) {
  const n = P.length, F = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    const N = cross(sub(P[j], P[i]), sub(P[k], P[i]));
    if (Math.hypot(N[0], N[1], N[2]) < 1e-9) continue;
    const d = dot(N, P[i]);
    let pos = 0, neg = 0;
    for (let m = 0; m < n && !(pos && neg); m++) {
      if (m === i || m === j || m === k) continue;
      const s = dot(N, P[m]) - d;
      if (s > 1e-7) pos++; else if (s < -1e-7) neg++;
    }
    if (pos && neg) continue;
    if (!pos && !neg) continue;
    F.push(pos ? [i, k, j] : [i, j, k]);
  }
  return F;
}

/**
 * Points for a chunky rock / nugget: jittered points on an ellipsoid around (cx, cy, cz).
 * o: n (points), jag (0..1 radial jitter), flat (flatten the bottom below cy + ry*flat),
 *    squash: [kx, ky, kz] extra scale, tilt (radians, leans the top), seed offsets.
 */
export function chunkPts(rng, cx, cy, cz, rx, ry, rz, o = {}) {
  const n = o.n ?? 10, jag = o.jag ?? 0.28;
  const pts = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  const a0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const v = 1 - (i + 0.5) / n * 2; // -1..1
    const r = Math.sqrt(1 - v * v);
    const a = a0 + i * ga + rng.range(-0.35, 0.35);
    const k = 1 - rng.range(0, jag);
    let x = Math.cos(a) * r * k, z = Math.sin(a) * r * k, y = v * k;
    pts.push([x, y, z]);
  }
  let out = pts.map(([x, y, z]) => [cx + x * rx, cy + y * ry, cz + z * rz]);
  if (o.tilt) out = out.map(([x, y, z]) => [x + (cy - y) * o.tilt, y, z]);
  if (o.flat !== undefined) {
    const yb = cy + ry * o.flat;
    out = out.map(([x, y, z]) => [x, y > yb ? yb + (y - yb) * 0.15 : y, z]);
  }
  return out;
}

/**
 * World → screen for a 3/4 view: X right, Y up, Z toward the viewer (horizontal), camera pitched
 * down by p (radians). Screen point = (cx + X, cy - (Y cos p - Z sin p), Y sin p + Z cos p).
 */
export function view(pts, cx = 16, cy = 16, p = 0.62) {
  const c = Math.cos(p), s = Math.sin(p);
  return pts.map(([X, Y, Z]) => [cx + X, cy - (Y * c - Z * s), Y * s + Z * c]);
}

/**
 * Chunky stone / nugget points in world space (before view()): a jittered ellipsoid of half sizes
 * (a wide, b tall, c deep) with a flattened base and an optional lean, yawed by `yaw`.
 * o: n, jag, base (0..1: how far below centre the base plane sits, default 0.55), lean [dx, dz] per unit height,
 *    top (0..1 flattens the top into a plateau above that height), yaw.
 */
export function stonePts(rng, a, b, c, o = {}) {
  const n = o.n ?? 11, jag = o.jag ?? 0.25;
  const ga = Math.PI * (3 - Math.sqrt(5));
  const a0 = rng.range(0, Math.PI * 2);
  const out = [];
  const yaw = o.yaw ?? 0, cyw = Math.cos(yaw), syw = Math.sin(yaw);
  for (let i = 0; i < n; i++) {
    const v = 1 - ((i + 0.5) / n) * 2;
    const r = Math.sqrt(1 - v * v);
    const ang = a0 + i * ga + rng.range(-0.4, 0.4);
    const k = 1 - rng.range(0, jag);
    let x = Math.cos(ang) * r * k * a, z = Math.sin(ang) * r * k * c, y = v * k * b;
    const base = -b * (o.base ?? 0.55);
    if (y < base) y = base + (y - base) * 0.12;
    if (o.top !== undefined && y > b * o.top) y = b * o.top + (y - b * o.top) * 0.25;
    if (o.lean) { x += y * o.lean[0]; z += y * o.lean[1]; }
    out.push([x * cyw - z * syw, y, x * syw + z * cyw]);
  }
  return out;
}

/**
 * Cut-stone points in world space: rings of jittered vertices stacked from the base to a flat-ish
 * plateau. o: a (half width), c (half depth), h (height), n (vertices per ring), rings [[yFrac, rFrac]...],
 * lean [dx, dz] (plateau offset, world units), jag (radius jitter), yaw.
 */
export function slabPts(rng, o) {
  const a = o.a, c = o.c ?? o.a, h = o.h, n = o.n ?? 6, jag = o.jag ?? 0.15;
  const rings = o.rings || [[0, 0.9], [0.42, 1], [1, 0.6]];
  const yaw = o.yaw ?? 0, cy = Math.cos(yaw), sy = Math.sin(yaw);
  const out = [];
  rings.forEach(([yf, rf], ri) => {
    const a0 = rng.range(0, Math.PI * 2);
    const m = Array.isArray(n) ? n[ri] : n;
    for (let i = 0; i < m; i++) {
      const ang = a0 + (i / m) * Math.PI * 2 + rng.range(-0.3, 0.3) * (Math.PI * 2 / m);
      const k = rf * (1 - rng.range(0, jag));
      let x = Math.cos(ang) * a * k, z = Math.sin(ang) * c * k;
      const y = (yf - 0.45) * h + (yf > 0 && yf < 1 ? rng.range(-0.08, 0.08) * h : 0) + (yf === 1 ? rng.range(-0.06, 0.06) * h : 0);
      if (o.lean) { x += o.lean[0] * yf; z += o.lean[1] * yf; }
      out.push([x * cy - z * sy, y, x * sy + z * cy]);
    }
  });
  return out;
}

/** Translate world points. */
export const at3 = (pts, X, Y, Z) => pts.map(([x, y, z]) => [x + X, y + Y, z + Z]);

// ---------------------------------------------------------------- materials
/**
 * Material: ramp R (7 tones, see color.mat) + shading options.
 *   bands      intensity → tone band edges (toneOf)
 *   bias       added light
 *   min/max    tone clamp for the plane tones
 *   tex(c)     → tone offset (c: {x, y, z, n, k: float tone, obj, face, u, v})
 *   ridge      lit 1px line on the lighter side where two planes meet (default true)
 *   rim        lighter pixels just inside the top-left silhouette (default true)
 *   bounce     reflected light: deepest tone on the bottom-right rim steps up (default true)
 *   spec/shine smooth specular (only for smooth objects)
 *   ol/olLit   outline colours (dark side / lit side); inner: occlusion-line colour
 *   glow       emissive strength (number or fn(c) → 0..1)
 *   cast       how much a shadow cast onto this material darkens it (tones)
 */
export function material(R, o = {}) {
  const m = { R, ridge: true, rim: true, bounce: true, cast: 1, ...o };
  if (m.ol === undefined) m.ol = olOf(R[6], 0.55);
  if (m.olLit === undefined) m.olLit = olOf(R[5], 0.3);
  if (m.inner === undefined) m.inner = R[6];
  return m;
}

/** Near-black, slightly saturated version of a dark tone (outline ink). */
export function olOf(c, k = 0.5) {
  const [h, s, l] = toHsl(c);
  return fromHsl(towardHue(h, 250, 18), Math.min(1, s * 0.9 + 0.12), Math.max(0.05, l * k));
}

/** Ramp helper: mat() plus optional hand overrides {0: hex, 1: hex, ...}. */
export function ramp(base, o = {}, over = {}) {
  const R = mat(base, o);
  for (const k of Object.keys(over)) R[+k] = over[k];
  R.o = R[6];
  return R;
}

/** Ramp from an explicit list of 7 colours (light → dark). */
export function rampOf(list) {
  const R = list.slice();
  R.o = R[6];
  R.base = R[3];
  return R;
}

// ---------------------------------------------------------------- scene
export class Scene {
  constructor(w = 32, h = w) {
    this.w = w; this.h = h;
    this.z = new Float32Array(w * h).fill(-1e9);
    this.ob = new Int16Array(w * h).fill(-1);
    this.fb = new Int32Array(w * h).fill(-1);
    this.objs = [];
    this.faces = [];
    this.k = null; // final tone per pixel after render
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  objAt(x, y) { return this.inb(x, y) ? this.ob[y * this.w + x] : -1; }
  zAt(x, y) { return this.inb(x, y) ? this.z[y * this.w + x] : -1e9; }

  /**
   * Add an object made of planar polygons ([[x,y,z], ...] each).
   * o: smooth {c:[x,y,z], r:[rx,ry,rz], k} blends an ellipsoid normal in (rounded nuggets),
   *    tag (any), frame (local axes for textures), zb (depth bias), shadow (casts shadows, default true),
   *    noFlip (trust polygon winding)
   */
  add(m, polys, o = {}) {
    const id = this.objs.length;
    const obj = { id, m, o, g: o.group ?? 1000 + id, faces: [], mask: new Mask(this.w, this.h) };
    this.objs.push(obj);
    let C = [0, 0, 0], cnt = 0;
    for (const p of polys) for (const q of p) { C[0] += q[0]; C[1] += q[1]; C[2] += q[2]; cnt++; }
    C = C.map((v) => v / Math.max(1, cnt));
    obj.c = o.center || C;
    for (const P of polys) {
      if (P.length < 3) continue;
      // Newell normal (robust for any planar polygon)
      let N = [0, 0, 0];
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        N[0] += (a[1] - b[1]) * (a[2] + b[2]);
        N[1] += (a[2] - b[2]) * (a[0] + b[0]);
        N[2] += (a[0] - b[0]) * (a[1] + b[1]);
      }
      N = nrm(N);
      const fc = P.reduce((s, q) => [s[0] + q[0] / P.length, s[1] + q[1] / P.length, s[2] + q[2] / P.length], [0, 0, 0]);
      if (!o.noFlip && dot(N, sub(fc, obj.c)) < 0) N = [-N[0], -N[1], -N[2]];
      if (N[2] <= 1e-4) continue;
      const fid = this.faces.length;
      const face = { id: fid, obj: id, n: N, p0: P[0], pts: P, tone: null, ...(o.faceProps ? o.faceProps(P, N) : {}) };
      this.faces.push(face);
      obj.faces.push(face);
      this.raster(face, o.zb || 0);
    }
    return obj;
  }

  raster(face, zb) {
    const P = face.pts, N = face.n;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of P) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(this.w - 1, Math.ceil(x1)); y1 = Math.min(this.h - 1, Math.ceil(y1));
    // signed area to orient the edge tests
    let A = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; }
    const sg = A >= 0 ? 1 : -1;
    const [px, py, pz] = face.p0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5, cy = y + 0.5;
      let inside = true;
      for (let i = 0; i < P.length && inside; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        const e = ((b[0] - a[0]) * (cy - a[1]) - (b[1] - a[1]) * (cx - a[0])) * sg;
        if (e < -1e-6) inside = false;
      }
      if (!inside) continue;
      const z = pz - (N[0] * (cx - px) + N[1] * (cy - py)) / N[2] + zb;
      const i = y * this.w + x;
      if (z > this.z[i]) { this.z[i] = z; this.ob[i] = face.obj; this.fb[i] = face.id; }
    }
  }

  /**
   * A stone / nugget hull from stonePts(), seen in 3/4 view, centred on screen (x, y).
   * z: explicit depth of its centre, or `on: true` to sit it on whatever is already drawn there
   * (its centre `embed` px below that surface). o.smooth (0..1) rounds it; other o → stonePts.
   */
  chunk(m, rng, o) {
    const pts = o.h ? slabPts(rng, o) : stonePts(rng, o.a, o.b, o.c ?? o.a, o);
    if (o.b === undefined) o = { ...o, b: o.h / 2 };
    let z = o.z ?? 0;
    if (o.on) {
      let best = -1e9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) best = Math.max(best, this.zAt(Math.floor(o.x) + dx, Math.floor(o.y) + dy));
      z = (best > -1e8 ? best : 0) - (o.embed ?? o.b * 0.6);
    }
    const P = view(pts, o.x, o.y, o.p ?? 0.62).map(([x, y, zz]) => [x, y, zz + z]);
    const opts = { group: o.group, shadow: o.shadow, occlude: o.occlude, tag: o.tag };
    if (o.smooth) opts.smooth = { c: [o.x, o.y, z], r: [o.a, o.b * 0.9 + (o.c ?? o.a) * 0.3, o.c ?? o.a], k: o.smooth };
    return this.hull(m, P, opts);
  }

  /** Convex hull object from points. */
  hull(m, pts, o = {}) {
    const F = hull3(pts);
    return this.add(m, F.map((f) => f.map((i) => pts[i])), o);
  }

  /**
   * Crystal prism: base point b [x,y,z], axis direction d (3D, normalised here), length, radius r,
   * tip (termination length; 0 = flat), sides (default 6), twist (radians around the axis),
   * taper (top radius factor), skew [u, v] apex offset (in radii), squash (cross-section flattening).
   */
  prism(m, o) {
    const d = nrm(o.d);
    // any vector not parallel to d → frame (e1, e2) across the axis
    const ref = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let e1 = nrm(cross(d, ref)), e2 = nrm(cross(d, e1));
    const tw = o.twist || 0, ct = Math.cos(tw), st = Math.sin(tw);
    [e1, e2] = [[e1[0] * ct + e2[0] * st, e1[1] * ct + e2[1] * st, e1[2] * ct + e2[2] * st], [e2[0] * ct - e1[0] * st, e2[1] * ct - e1[1] * st, e2[2] * ct - e1[2] * st]];
    const n = o.sides ?? 6, len = o.len, r = o.r, tip = Math.min(len * 0.9, o.tip ?? r * 1.2), taper = o.taper ?? 1;
    const sq = o.squash ?? 1;
    const at = (u, ang, rr) => {
      const c = Math.cos(ang) * rr, s = Math.sin(ang) * rr * sq;
      return [o.b[0] + d[0] * u + e1[0] * c + e2[0] * s, o.b[1] + d[1] * u + e1[1] * c + e2[1] * s, o.b[2] + d[2] * u + e1[2] * c + e2[2] * s];
    };
    const shaft = len - tip;
    const jit = o.jit || null; // per-side radius jitter
    const rs = (i) => r * (jit ? jit[i % jit.length] : 1);
    const bot = [], top = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      bot.push(at(o.under ?? -1, a, rs(i)));
      top.push(at(shaft, a, rs(i) * taper));
    }
    const polys = [];
    for (let i = 0; i < n; i++) polys.push([bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]]);
    if (tip > 0.05) {
      const sk = o.skew || [0, 0];
      const apex = [o.b[0] + d[0] * len + (e1[0] * sk[0] + e2[0] * sk[1]) * r, o.b[1] + d[1] * len + (e1[1] * sk[0] + e2[1] * sk[1]) * r, o.b[2] + d[2] * len + (e1[2] * sk[0] + e2[2] * sk[1]) * r];
      for (let i = 0; i < n; i++) polys.push([top[i], top[(i + 1) % n], apex]);
    } else polys.push(top.slice());
    polys.push(bot.slice());
    const obj = this.add(m, polys, { ...o, frame: { b: o.b, d, e1, e2, len, r } });
    return obj;
  }

  /** Axis-aligned-then-rotated box (half sizes hx, hy, hz) centered at c with rotation rot {rx, ry, rz}. */
  box(m, c, hx, hy, hz, rot = {}, o = {}) {
    const V = xf([[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], { ...rot, t: c });
    const F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]];
    return this.add(m, F.map((f) => f.map((i) => V[i])), o);
  }

  /** Per-pixel normal of an object at a pixel (face normal, optionally blended with an ellipsoid). */
  normalAt(x, y) {
    const i = y * this.w + x;
    const f = this.faces[this.fb[i]], obj = this.objs[f.obj];
    const sm = obj.o.smooth;
    if (!sm) return f.n;
    const [cx, cy, cz] = sm.c, [rx, ry, rz] = sm.r;
    const z = this.z[i];
    const ns = nrm([(x + 0.5 - cx) / (rx * rx), (y + 0.5 - cy) / (ry * ry), Math.max(0, z - cz) / (rz * rz) + 0.02]);
    const k = sm.k ?? 0.5;
    return nrm([f.n[0] * (1 - k) + ns[0] * k, f.n[1] * (1 - k) + ns[1] * k, f.n[2] * (1 - k) + ns[2] * k]);
  }

  /** Remove 1-pixel spurs and fill 1-pixel notches in the silhouette (cleaner hand-drawn edge). */
  tidy() {
    const W = this.w, H = this.h;
    const on = (x, y) => this.inb(x, y) && this.ob[y * W + x] >= 0;
    for (let pass = 0; pass < 2; pass++) {
      const kill = [], fillp = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const n4 = on(x - 1, y) + on(x + 1, y) + on(x, y - 1) + on(x, y + 1);
        if (on(x, y) && n4 <= 1) kill.push(x, y);
        else if (!on(x, y) && n4 >= 3) {
          // copy the deepest-z neighbour
          let best = -1, bz = -1e9;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (on(x + dx, y + dy) && this.z[(y + dy) * W + x + dx] > bz) { bz = this.z[(y + dy) * W + x + dx]; best = (y + dy) * W + x + dx; }
          fillp.push(x, y, best);
        }
      }
      for (let i = 0; i < kill.length; i += 2) { const j = kill[i + 1] * W + kill[i]; this.ob[j] = -1; this.fb[j] = -1; this.z[j] = -1e9; }
      for (let i = 0; i < fillp.length; i += 3) { const j = fillp[i + 1] * W + fillp[i], s = fillp[i + 2]; this.ob[j] = this.ob[s]; this.fb[j] = this.fb[s]; this.z[j] = this.z[s]; }
    }
  }

  /**
   * Shade everything into pc. o.outline (default true), o.tidy (default true), o.shadow (default true).
   * Afterwards: this.k[i] = tone index per pixel (-1 empty), obj masks are filled.
   */
  render(pc, o = {}) {
    if (o.tidy !== false) this.tidy();
    const W = this.w, H = this.h, N = W * H;
    const T = new Float32Array(N).fill(NaN);
    const K = new Int8Array(N).fill(-1);
    for (const ob of this.objs) ob.mask = new Mask(W, H);
    // 1. plane tone (absolute, blended with a per-object equalised tone) + texture + smooth spec
    const specPix = new Uint8Array(N);
    const I = new Float32Array(N).fill(NaN);
    const per = this.objs.map(() => []);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, oi = this.ob[i];
      if (oi < 0) continue;
      const obj = this.objs[oi], m = obj.m, f = this.faces[this.fb[i]];
      obj.mask.set(x, y);
      const n = this.normalAt(x, y);
      let v = dot(n, L) + (m.bias || 0) + (f.bias || 0);
      if (m.flare) v += m.flare * Math.max(0, -dot(n, [L[0], L[1], -L[2] * 0.2]) - 0.15);
      I[i] = v;
      per[obj.m.eqShare ? obj.g : oi].push(v);
      if (m.spec && obj.o.smooth && Math.pow(Math.max(0, dot(n, HALF)), m.shine ?? 16) > m.spec) specPix[i] = 1;
    }
    const sorted = per.map((a) => Float32Array.from(a).sort());
    const rankOf = (arr, v) => {
      // mean rank of v (0 = darkest .. 1 = brightest)
      let lo = 0, hi = arr.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < v - 1e-6) lo = mid + 1; else hi = mid; }
      let lo2 = lo, hi2 = arr.length;
      while (lo2 < hi2) { const mid = (lo2 + hi2) >> 1; if (arr[mid] <= v + 1e-6) lo2 = mid + 1; else hi2 = mid; }
      return arr.length ? ((lo + lo2) / 2) / arr.length : 0.5;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, oi = this.ob[i];
      if (oi < 0) continue;
      const obj = this.objs[oi], m = obj.m, f = this.faces[this.fb[i]];
      let t;
      if (f.tone != null) t = f.tone;
      else {
        const tAbs = tone(I[i], m.bands);
        const eq = m.eq ?? 0.7;
        if (eq > 0) {
          // target share of each tone, brightest first
          const q = m.q || [0.08, 0.3, 0.62, 0.86];
          const r = 1 - rankOf(sorted[m.eqShare ? obj.g : oi], I[i]); // 0 = brightest
          let te;
          if (r < q[0]) te = 1 + r / q[0];
          else if (r < q[1]) te = 2 + (r - q[0]) / (q[1] - q[0]);
          else if (r < q[2]) te = 3 + (r - q[1]) / (q[2] - q[1]);
          else if (r < q[3]) te = 4 + (r - q[2]) / (q[3] - q[2]);
          else te = 5;
          t = tAbs * (1 - eq) + te * eq;
        } else t = tAbs;
      }
      // gentle gradient across big planes: brighter toward the lit edge
      if (m.grad !== 0) {
        if (!f.ctr) { let cx = 0, cy = 0; for (const q of f.pts) { cx += q[0]; cy += q[1]; } f.ctr = [cx / f.pts.length, cy / f.pts.length]; }
        t += ((x + 0.5 - f.ctr[0]) * -LS[0] + (y + 0.5 - f.ctr[1]) * -LS[1]) * (m.grad ?? 0.07);
      }
      if (m.tex) t += m.tex({ x, y, z: this.z[i], n: f.n, k: t, obj, face: f, sc: this }) || 0;
      T[i] = t;
    }
    // 2. cast shadows + contact occlusion between objects
    if (o.shadow !== false) {
      const add = new Float32Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, oi = this.ob[i];
        if (oi < 0) continue;
        const m = this.objs[oi].m;
        const zp = this.z[i];
        let sh = 0;
        for (let s = 1; s <= 9 && !sh; s++) {
          const qx = Math.floor(x + 0.5 + LS[0] * s), qy = Math.floor(y + 0.5 + LS[1] * s);
          if (!this.inb(qx, qy)) break;
          const j = qy * W + qx, oq = this.ob[j];
          if (oq < 0 || this.objs[oq].g === this.objs[oi].g || this.objs[oq].o.shadow === false) continue;
          if (this.z[j] > zp + s * 0.62 + 0.4) sh = 1;
        }
        let ao = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const oq = this.objAt(x + dx, y + dy);
          if (oq >= 0 && this.objs[oq].g !== this.objs[oi].g && this.objs[oq].o.shadow !== false && this.zAt(x + dx, y + dy) > zp - 0.3) ao = 1;
        }
        add[i] = sh * (m.cast ?? 1) + ao * (m.ao ?? 0.75);
      }
      for (let i = 0; i < N; i++) if (!isNaN(T[i])) T[i] += add[i];
    }
    // 3. quantise (with optional ordered dither between tones)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (isNaN(T[i])) continue;
      const m = this.objs[this.ob[i]].m;
      let t = T[i];
      if (m.dither) t += (bayer(x, y) - 0.5) * m.dither;
      K[i] = Math.max(m.min ?? 1, Math.min(m.max ?? 5, Math.floor(t)));
      if (specPix[i]) K[i] = 0;
    }
    // 4. ridges, rim light, bounce light, occlusion lines (from the quantised tones)
    const K0 = K.slice();
    const at = (x, y) => (this.inb(x, y) ? y * W + x : -1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, oi = this.ob[i];
      if (oi < 0) continue;
      const obj = this.objs[oi], m = obj.m, fi = this.fb[i];
      let k = K0[i];
      let occl = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = at(x + dx, y + dy);
        if (j < 0 || this.ob[j] < 0) continue;
        if (this.ob[j] !== oi && this.objs[this.ob[j]].g !== obj.g) {
          if (this.z[j] > this.z[i] + (m.gap ?? 1.6) && this.objs[this.ob[j]].o.occlude !== false) occl = true;
          continue;
        }
        if (this.fb[j] === fi || !m.ridge) continue;
        // lighter plane next to a darker one: lit ridge on the lighter side
        const fj = this.faces[this.fb[j]];
        if (fj.obj !== oi && this.objs[fj.obj].m !== m) continue;
        if (K0[j] > K0[i] && (m.ridgeAll || dot(this.faces[fi].n, L) > dot(fj.n, L))) k = Math.min(k, Math.max(m.ridgeMin ?? 1, K0[i] - 1));
      }
      // silhouette rim (lit side) and bounce (dark side)
      const outL = at(x - 1, y) < 0 || this.ob[at(x - 1, y)] < 0, outT = at(x, y - 1) < 0 || this.ob[at(x, y - 1)] < 0;
      const outR = at(x + 1, y) < 0 || this.ob[at(x + 1, y)] < 0, outB = at(x, y + 1) < 0 || this.ob[at(x, y + 1)] < 0;
      if (m.rim && (outL || outT) && !(outR || outB) && k >= 2 && k <= 4) k -= 1;
      if (m.bounce && (outR || outB) && !(outL || outT) && k === 5) k = 4;
      K[i] = k;
      if (occl) K[i] = 7; // occlusion line marker
    }
    // 5. write pixels
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, oi = this.ob[i];
      if (oi < 0) continue;
      const obj = this.objs[oi], m = obj.m;
      const k = K[i];
      const c = k === 7 ? m.inner : m.R[k];
      pc.set(x, y, c);
      if (m.glow) {
        const g = typeof m.glow === 'function' ? m.glow({ x, y, k, obj }) : m.glow;
        if (g) pc.emit(x, y, g);
      }
    }
    this.k = K;
    // 6. outline
    if (o.outline !== false) this.outline(pc, o);
    return this;
  }

  /** Selective 1px outline around the union of all objects. */
  outline(pc, o = {}) {
    const W = this.w, H = this.h;
    const add = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (this.ob[y * W + x] >= 0) continue;
      let best = -1, bz = -1e9, lit = false, dark = false;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const oq = this.objAt(x + dx, y + dy);
        if (oq < 0) continue;
        if (dx > 0 || dy > 0) lit = true; else dark = true;
        const z = this.zAt(x + dx, y + dy);
        if (z > bz) { bz = z; best = oq; }
      }
      if (best < 0) continue;
      const m = this.objs[best].m;
      add.push(x, y, lit && !dark ? m.olLit : m.ol);
    }
    for (let i = 0; i < add.length; i += 3) pc.set(add[i], add[i + 1], add[i + 2]);
  }
}

// ---------------------------------------------------------------- texture helpers
/** Mottled stone: clustered horizontal-ish blotches of the neighbouring tones, pits and specks. */
export function stoneTex(seed = 1, o = {}) {
  const amp = o.amp ?? 0.9, sx = o.sx ?? 0.42, sy = o.sy ?? 0.85, pit = o.pit ?? 0.05, speck = o.speck ?? 0.035;
  return (c) => {
    const { x, y } = c;
    let v = (vnoise(x * sx, y * sy, seed) - 0.5) * amp * 1.6;
    v += (vnoise(x * sx * 2.3, y * sy * 2.3, seed + 9) - 0.5) * amp * 0.7;
    const h = hash2(x, y, seed + 3);
    if (h < pit) v += 1;
    else if (h > 1 - speck) v -= 1;
    return v;
  };
}

/** Combine several texture functions (sum of offsets). */
export const texSum = (...fs) => (c) => fs.reduce((s, f) => s + (f ? f(c) || 0 : 0), 0);

/** Local prism coordinates of a pixel: u along the axis (0 base .. 1 tip), v across (-1..1). */
export function prismUV(c) {
  const fr = c.obj.o.frame;
  if (!fr) return [0.5, 0];
  const p = [c.x + 0.5 - fr.b[0], c.y + 0.5 - fr.b[1], c.z - fr.b[2]];
  return [dot(p, fr.d) / fr.len, dot(p, fr.e1) / fr.r];
}

/** Draw a small glint: centre + 4 arms (len 1..3) with fading colours. */
export function glint(pc, x, y, len = 1, c = 0xffffff, c2 = null, emit = 0) {
  const m = c2 ?? mix(c, 0xfff0c8, 0.4);
  const put = (X, Y, col) => { if (X < 0 || Y < 0 || X >= pc.w || Y >= pc.h) return; pc.set(X, Y, col); if (emit) pc.emit(X, Y, emit); };
  put(x, y, c);
  for (let k = 1; k <= len; k++) {
    const col = k === 1 && len > 1 ? c : m;
    put(x + k, y, col); put(x - k, y, col); put(x, y + k, col); put(x, y - k, col);
  }
}

export { dot, cross, sub };
