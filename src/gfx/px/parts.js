// Shared building blocks for the 32×32 icon drawers: outlined parts, faceted rocks,
// crystal prisms, cut gems and little texture painters.
import { mat, mix, toHsl, fromHsl, towardHue } from './color.js';
import { Mask, vol, facet, fill, hash2, vnoise, bayer, LIGHT, toneOf } from './shade.js';

export const S = 32;
export const M = (w = S, h = w) => new Mask(w, h);

/**
 * Paint a 1px ring just outside `mask` (the part's own outline): lit color on the
 * top-left, dark color elsewhere. Painted before the part so nearer parts cut cleanly.
 */
export function ring(pc, mask, R, o = {}) {
  const lit = o.lit ?? R[5], dark = o.dark ?? R[6];
  const out = mask.clone().dilate(1, !!o.diag).sub(mask);
  if (o.clip) out.and(o.clip);
  out.each((x, y) => {
    const tl = mask.get(x + 1, y) || mask.get(x, y + 1);
    const br = mask.get(x - 1, y) || mask.get(x, y - 1);
    pc.set(x, y, tl && !br ? lit : dark);
  });
}

/** Outline + lit volume in one go. */
export function part(pc, mask, R, o = {}) {
  if (o.ring !== false) ring(pc, mask, R, o.ringOpts || {});
  return vol(pc, mask, R, o);
}

const nrm3 = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };

/** Tone index (1..5) a flat face with this normal gets. */
export function toneFor(n, bias = 0) {
  const v = nrm3(...n);
  const I = v[0] * LIGHT[0] + v[1] * LIGHT[1] + v[2] * LIGHT[2] + bias;
  return Math.max(1, Math.min(5, Math.floor(toneOf(I))));
}

/**
 * Faceted rock lump: an irregular outline with a jittered top plateau; the bevel facets
 * between them are flat-shaded by direction, with crisp lit ridges on the top-left.
 * Returns the mask. o: {cx, cy, rx, ry, n (vertices), jag, plateau (0..1), peak:[dx,dy],
 * slope, pores, specks, seed, ring, flatBottom, ridges}
 */
export function facetRock(pc, rng, R, o = {}) {
  const cx = o.cx ?? 16, cy = o.cy ?? 17, rx = o.rx ?? 12, ry = o.ry ?? 10;
  const n = o.n ?? 9, jag = o.jag ?? 0.18;
  const pts = [];
  const a0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const r = 1 - rng.range(0, jag);
    pts.push([cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]);
  }
  if (o.flatBottom) for (const p of pts) if (p[1] > cy + ry * 0.55) p[1] = cy + ry * 0.55 + (p[1] - cy - ry * 0.55) * 0.3;
  const mask = M(pc.w, pc.h).poly(pts);
  if (o.ring !== false) ring(pc, mask, R);
  const pk = [cx + (o.peak?.[0] ?? -rx * 0.12), cy + (o.peak?.[1] ?? -ry * 0.18)];
  const k = o.plateau ?? 0.5;
  const inner = pts.map(([x, y]) => [pk[0] + (x - pk[0]) * k * rng.range(0.85, 1.15), pk[1] + (y - pk[1]) * k * rng.range(0.85, 1.15)]);
  const slope = o.slope ?? 1.1;
  const top = M(pc.w, pc.h).poly(inner).and(mask);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const q = M(pc.w, pc.h).poly([pts[i], pts[j], inner[j], inner[i]]).and(mask);
    const mx = (pts[i][0] + pts[j][0] - inner[i][0] - inner[j][0]) / 2, my = (pts[i][1] + pts[j][1] - inner[i][1] - inner[j][1]) / 2;
    const l = Math.hypot(mx, my) || 1;
    const s = slope * rng.range(0.8, 1.2);
    facet(pc, q, R, [(mx / l) * s, (my / l) * s, 1], { min: o.min ?? 1, max: 5 });
  }
  facet(pc, top, R, o.topNormal || [0, 0, 1], { min: o.min ?? 1, max: 5 });
  // lit ridges along the plateau edge facing the light, dark creases on the far side
  if (o.ridges !== false) {
    for (let i = 0; i < n; i++) {
      const A = inner[i], B = inner[(i + 1) % n];
      const ex = B[0] - A[0], ey = B[1] - A[1];
      const nx = ey, ny = -ex; // outward normal of this inner edge (polygon is CW in screen space)
      const lit = nx * -0.6 + ny * -0.8;
      if (Math.abs(lit) < 0.2 * Math.hypot(ex, ey)) continue;
      lineIn(pc, A[0], A[1], B[0], B[1], lit > 0 ? R[1] : R[4], mask);
    }
  }
  // texture: pores and pale specks
  const seed = o.seed ?? 7;
  mask.each((x, y) => {
    const h = hash2(x, y, seed);
    const kk = R.indexOf(pc.getHex(x, y));
    if (kk < 0) return;
    if (h < (o.pores ?? 0.05) && kk < 5 && kk > 1) pc.set(x, y, R[kk + 1]);
    else if (h > 1 - (o.specks ?? 0.025) && kk > 2) pc.set(x, y, R[kk - 1]);
  });
  mask.pts = pts;
  mask.top = top;
  return mask;
}

/**
 * Crystal prism (hexagonal, 3 visible faces + pyramidal tip), any orientation.
 * o: x, y (base center), a (axis angle, -PI/2 = up), len, w, tip (termination length),
 *    R (ramp), skew (-1..1 apex offset), emit (glow 0..1), base (darken toward base 0..1),
 *    flatTip (true = flat termination, e.g. beryl), ring (outline), core (bright inner streak)
 */
export function prism(pc, o) {
  const { x, y, a, len, w, R } = o;
  const tip = Math.min(len, o.tip ?? w * 0.95);
  const dx = Math.cos(a), dy = Math.sin(a);
  const px = -dy, py = dx;
  const hw = w / 2;
  const shaft = Math.max(0, len - tip);
  const P = (u, v) => [x + dx * u + px * v, y + dy * u + py * v];
  const tv = (o.skew || 0) * hw * 0.5;
  const v1 = -hw * 0.38 + tv * 0.3, v2 = hw * 0.38 + tv * 0.3;
  const apex = o.flatTip ? null : P(len, tv);
  const full = M(pc.w, pc.h);
  const faces = [];
  const addFace = (pts, n) => { const m = M(pc.w, pc.h).poly(pts); full.union(m); faces.push([m, n]); };
  const N = (side, along) => [-px * side * 0.85 + dx * along, -py * side * 0.85 + dy * along, 0.62];
  // shaft faces: left (v<v1), front, right
  addFace([P(-0.6, -hw), P(shaft, -hw), P(shaft, v1), P(-0.6, v1)], N(1, 0));
  addFace([P(-0.6, v1), P(shaft, v1), P(shaft, v2), P(-0.6, v2)], [-px * 0.12, -py * 0.12, 1]);
  addFace([P(-0.6, v2), P(shaft, v2), P(shaft, hw), P(-0.6, hw)], N(-1, 0));
  if (o.flatTip) {
    const e = Math.max(1, tip);
    addFace([P(shaft, -hw), P(shaft + e, -hw * 0.75), P(shaft + e, v1), P(shaft, v1)], N(0.7, 0.8));
    addFace([P(shaft, v1), P(shaft + e, v1), P(shaft + e, v2), P(shaft, v2)], [dx * 0.8, dy * 0.8, 0.6]);
    addFace([P(shaft, v2), P(shaft + e, v2), P(shaft + e, hw * 0.75), P(shaft, hw)], N(-0.7, 0.8));
  } else {
    addFace([P(shaft, -hw), apex, P(shaft, v1)], N(0.9, 0.75));
    addFace([P(shaft, v1), apex, P(shaft, v2)], [dx * 0.7 - px * 0.1, dy * 0.7 - py * 0.1, 0.7]);
    addFace([P(shaft, v2), apex, P(shaft, hw)], N(-0.9, 0.75));
  }
  if (o.ring !== false) ring(pc, full, R, o.ringOpts || {});
  const emit = o.emit || 0;
  const tones = [];
  for (const [m, n] of faces) tones.push(facet(pc, m.and(full), R, n, { emit, min: o.min ?? 1, max: o.max ?? 5, bias: o.bias || 0 }));
  // darken toward the base (light dies inside the rock)
  const baseK = o.base ?? 0.35;
  if (baseK > 0) {
    full.each((X, Y) => {
      const u = (X + 0.5 - x) * dx + (Y + 0.5 - y) * dy;
      const t = u / Math.max(1, len);
      if (t < baseK && bayer(X, Y) > t / baseK) {
        const k = R.indexOf(pc.getHex(X, Y));
        if (k >= 0 && k < 5) pc.set(X, Y, R[k + 1]);
      }
    });
  }
  // crisp lit ridge between the left and front faces, glint at the apex
  const ridge = o.ridge ?? R[1];
  if (ridge !== null) {
    const r0 = P(len * 0.2, v1), r1 = P(shaft, v1);
    lineIn(pc, r0[0], r0[1], r1[0], r1[1], ridge, full);
  }
  if (o.core) {
    const c0 = P(len * 0.15, (v1 + v2) / 2 - 0.5), c1 = P(shaft + tip * 0.3, (v1 + v2) / 2 - 0.5);
    lineIn(pc, c0[0], c0[1], c1[0], c1[1], o.core, full, emit ? Math.min(1, emit + 0.2) : 0);
  }
  if (apex && o.glint !== false) {
    const g = P(len - 1.2, tv - 0.3);
    if (full.get(g[0], g[1])) { pc.set(g[0], g[1], R[0]); if (emit) pc.emit(g[0], g[1], 1); }
  }
  full.tones = tones;
  return full;
}

/** Bresenham line limited to a mask. */
export function lineIn(pc, x0, y0, x1, y1, c, mask, emit = 0) {
  x0 = Math.round(x0 - 0.5); y0 = Math.round(y0 - 0.5); x1 = Math.round(x1 - 0.5); y1 = Math.round(y1 - 0.5);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 200; n++) {
    if (!mask || mask.get(x0, y0)) { pc.set(x0, y0, c); if (emit) pc.emit(x0, y0, emit); }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/**
 * Faceted gem seen from above: girdle shape mask + table, radial facets.
 * shape: 'oval' | 'round' | 'pear' | 'cushion'. Returns the mask.
 */
export function cutGem(pc, R, o = {}) {
  const cx = o.cx ?? 16, cy = o.cy ?? 16, rx = o.rx ?? 12, ry = o.ry ?? 10;
  const shape = o.shape || 'oval';
  const g = M(pc.w, pc.h);
  if (shape === 'pear') {
    // round bottom, pointed top-right
    g.ellipse(cx - 1, cy + 2, rx * 0.86, ry * 0.86);
    g.poly([[cx - rx * 0.78, cy + 0.5], [cx + rx * 0.55, cy - ry * 1.2], [cx + rx * 0.84, cy + 1.5]]);
  } else if (shape === 'cushion') {
    g.fn((x, y) => Math.abs((x + 0.5 - cx) / rx) ** 3 + Math.abs((y + 0.5 - cy) / ry) ** 3 <= 1);
  } else g.ellipse(cx, cy, rx, ry);
  if (o.ring !== false) ring(pc, g, R);
  const tcx = shape === 'pear' ? cx - 0.5 : cx, tcy = shape === 'pear' ? cy + 0.5 : cy;
  const tk = o.table ?? 0.5;
  // radial facets: 8 sectors (alternating star/kite facets)
  const sectors = o.sectors ?? 8;
  g.each((x, y) => {
    const dx = (x + 0.5 - tcx) / rx, dy = (y + 0.5 - tcy) / ry;
    const r = Math.hypot(dx, dy);
    let ang = Math.atan2(dy, dx);
    const k = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * sectors + 0.5) % sectors;
    const ca = (k / sectors) * Math.PI * 2 - Math.PI;
    let tone;
    if (r < tk) tone = 2 + (dx + dy < -0.15 ? -1 : dx + dy > 0.3 ? 1 : 0);
    else {
      const outer = r > (1 + tk) / 2 + 0.06;
      const tilt = outer ? 0.85 : 0.5;
      tone = toneFor([Math.cos(ca) * tilt, Math.sin(ca) * tilt, 0.7]);
      // internal reflection: facets opposite the light flare up
      const opp = Math.cos(ca - Math.atan2(-LIGHT[1], -LIGHT[0]));
      if (!outer && opp > 0.6) tone = Math.max(1, tone - 3);
      if (outer && opp > 0.85) tone = Math.max(2, tone - 1);
    }
    pc.set(x, y, R[Math.max(1, Math.min(5, tone))]);
    if (o.emit) pc.emit(x, y, o.emit);
  });
  // table outline + glints
  const tm = M(pc.w, pc.h).fn((x, y) => g.get(x, y) && Math.hypot((x + 0.5 - tcx) / rx, (y + 0.5 - tcy) / ry) < tk);
  tm.edge().each((x, y) => { if ((x + 0.5 - tcx) + (y + 0.5 - tcy) > 0) pc.set(x, y, R[4]); else pc.set(x, y, R[1]); });
  return g;
}

/** Small "hammered" or porous texture: darken some pixels inside mask by one ramp step. */
export function pores(pc, mask, R, dens = 0.08, seed = 3, lighten = 0.02) {
  mask.each((x, y) => {
    const k = R.indexOf(pc.getHex(x, y));
    if (k < 0) return;
    const h = hash2(x, y, seed);
    if (h < dens && k < 5) pc.set(x, y, R[k + 1]);
    else if (h > 1 - lighten && k > 1) pc.set(x, y, R[k - 1]);
  });
}

/** Wood grain along an axis: streaks of darker tone following value noise. */
export function grain(pc, mask, R, o = {}) {
  const vertical = o.vertical ?? true, seed = o.seed ?? 1;
  mask.each((x, y) => {
    const k = R.indexOf(pc.getHex(x, y));
    if (k < 1 || k > 4) return;
    const u = vertical ? x : y, v = vertical ? y : x;
    const n = vnoise(u * 0.9 + vnoise(v * 0.18, u * 0.3, seed) * 2.2, v * 0.12, seed + 5);
    if (n > 0.66) pc.set(x, y, R[k + 1]);
    else if (n < 0.12 && k > 2) pc.set(x, y, R[k - 1]);
  });
}

/** Dark shade of an arbitrary color for interior strokes. */
export function darkOf(c, k = 0.45) {
  const [h, s, l] = toHsl(c);
  return fromHsl(towardHue(h, 255, 14), Math.min(1, s * 1.05 + 0.05), l * k);
}

export { mat, mix, vol, facet, fill, hash2, vnoise, bayer };
