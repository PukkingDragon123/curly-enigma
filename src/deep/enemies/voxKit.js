// Wave 16 creature modelling kit: the redesigned species are drawn at half the old creature voxel
// (H = VS / 2 = 1/48 m) and meshed through VB.geo(…, H), so a desktop refines them 2× to 1/96 m and a
// phone keeps them at 1/48 m (the density it had). Coordinates here are in H voxels.
//
//   taper(vb, a, b, r0, r1, c)          a capsule whose radius runs r0 → r1 (c: colour or fn(x, y, z, t))
//   eye(vb, cx, cy, z, o)               a readable eye on the plane facing +z (or hugging a surface
//                                       when o.on is a VB): lid shadow, iris ramp, pupil, two glints
//   tufts(vb, n, o)                     fur clumps / strands sticking out of a model's skin
//   spots(vb, list, c)                  round patches painted onto a model's surface
//   ramp4(tones, k)                     a tone from a ramp by k in 0..1
import { VS, mul, mix } from './vox.js';
import { clamp } from '../../core/util.js';

export const H = VS / 2;

export const ramp4 = (T, k) => T[clamp(Math.floor(k * T.length), 0, T.length - 1)];

/** Capsule from a to b with its radius running r0 → r1. c: colour or fn(x, y, z, t). */
export function taper(vb, ax, ay, az, bx, by, bz, r0, r1, c) {
  const r = Math.max(r0, r1);
  const x0 = Math.floor(Math.min(ax, bx) - r), x1 = Math.ceil(Math.max(ax, bx) + r);
  const y0 = Math.floor(Math.min(ay, by) - r), y1 = Math.ceil(Math.max(ay, by) + r);
  const z0 = Math.floor(Math.min(az, bz) - r), z1 = Math.ceil(Math.max(az, bz) + r);
  const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1;
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5 - ax, py = y + 0.5 - ay, pz = z + 0.5 - az;
    const t = clamp((px * dx + py * dy + pz * dz) / L2, 0, 1);
    const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t, rr = r0 + (r1 - r0) * t;
    if (qx * qx + qy * qy + qz * qz > rr * rr) continue;
    const col = typeof c === 'function' ? c(x, y, z, t) : c;
    if (col !== undefined && col >= 0) vb.set(x, y, z, col);
  }
  return vb;
}

/**
 * An eye: an ellipse rx × ry (voxels) round (cx, cy) on the plane z (facing +z). With o.on (a VB)
 * each voxel sits just outside that model's surface instead, so the eye hugs a round head.
 * o: { iris, pupil, sclera (0 = none), lid (a darker top row), glint, slit (vertical pupil),
 *      pr (pupil radius 0..1 of the iris), look: [dx, dy] (the pupil's offset) }
 */
export function eye(vb, cx, cy, z, rx, ry, o = {}) {
  const iris = o.iris ?? 0x3a2a1a, pupil = o.pupil ?? 0x0c0808, sclera = o.sclera ?? 0, glint = o.glint ?? 0xffffff;
  const irisR = sclera ? (o.ir ?? 0.68) : 1, pr = o.pr ?? 0.42, [lx, ly] = o.look || [0, 0];
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
    const d = u * u + v * v;
    if (d > 1) continue;
    const iu = (u - lx) / irisR, iv = (v - ly) / irisR, id = Math.sqrt(iu * iu + iv * iv);
    let c;
    if (id > 1) c = v > 0.55 ? mul(sclera, 0.8) : sclera; // (white, shadowed under the lid)
    else {
      // iris: a dark rim, lighter low down (light pooled in the lens), darker under the lid
      c = id > 0.82 ? mul(iris, 0.55) : iv < -0.25 ? mix(iris, 0xffffff, 0.22) : iv > 0.45 ? mul(iris, 0.72) : iris;
      const inP = o.slit ? Math.abs(iu) < pr * 0.45 && Math.abs(iv) < 0.92 : id < pr;
      if (inP) c = pupil;
    }
    if (o.lid && v > 0.62) c = o.lid;
    // two glints: a big one up-left, a small one down-right
    const g1 = Math.hypot(u + 0.36, v - 0.38) < (o.gr ?? Math.max(0.3, 1.1 / Math.min(rx, ry))); // (o.gr: the big glint's radius)
    const g2 = Math.hypot(u - 0.4, v + 0.36) < Math.max(0.16, 0.6 / Math.min(rx, ry));
    if ((g1 || (g2 && Math.min(rx, ry) >= 2)) && !(o.lid && v > 0.62)) c = glint;
    let zz = z;
    if (o.on) { const h = o.on.hitFrom(x, y, z + 30, 0, 0, -1, 60); if (!h) continue; zz = h[2] + 1; }
    vb.set(x, y, zz, c);
  }
  return vb;
}

/**
 * Fur clumps and strands on a model's skin (the voxels open upward or outward): n tufts, each a
 * short run of voxels leaning out of the surface along its normal, lighter at the tip.
 * o: { tones (dark → light), seed, len: [a, b], filter(x, y, z) }
 */
export function tufts(vb, n, o) {
  const T = o.tones, L = vb.list(), len = o.len || [1, 3];
  if (!L.length) return vb;
  let cx = 0, cy = 0, cz = 0;
  for (const v of L) { cx += v.x; cy += v.y; cz += v.z; }
  cx /= L.length; cy /= L.length; cz /= L.length;
  let made = 0;
  for (let i = 0; i < n * 6 && made < n; i++) {
    const v = L[Math.floor(vb.n(i, 7, 3, o.seed || 0) * L.length)];
    if (o.filter && !o.filter(v.x, v.y, v.z)) continue;
    let dx = v.x - cx, dy = (v.y - cy) * 1.2 + 0.6, dz = v.z - cz;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    if (!vb.open(v.x, v.y, v.z, Math.round(dx), Math.round(dy), Math.round(dz))) continue;
    const k = len[0] + Math.floor(vb.n(i, 3, 9, o.seed || 0) * (len[1] - len[0] + 1));
    for (let s = 1; s <= k; s++) {
      const x = Math.round(v.x + dx * s), y = Math.round(v.y + dy * s), z = Math.round(v.z + dz * s);
      if (!vb.has(x, y, z)) vb.set(x, y, z, T[Math.min(T.length - 1, T.length - 1 - (k - s))]);
    }
    made++;
  }
  return vb;
}

/** Paint round patches [x, y, z, r] (and an optional rim colour) onto the voxels near them. */
export function spots(vb, list, c, rim) {
  vb.paint((x, y, z) => {
    for (const [sx, sy, sz, r] of list) {
      const d = Math.hypot(x + 0.5 - sx, y + 0.5 - sy, z + 0.5 - sz);
      if (d < r) return rim !== undefined && d > r - 1 ? rim : c;
    }
    return undefined;
  });
  return vb;
}

/**
 * An eye on the side of a head (facing sd = +1 → +x, -1 → -x), hugging the surface of `on`: an
 * ellipse rz (along z) × ry round (cz, cy). Same options as eye(); the big glint sits toward the front.
 */
export function sideEye(vb, on, sd, cy, cz, rz, ry, o = {}) {
  const iris = o.iris ?? 0x3a2a1a, pupil = o.pupil ?? 0x0c0808, glint = o.glint ?? 0xffffff, pr = o.pr ?? 0.42;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
    const u = (z + 0.5 - cz) / rz, v = (y + 0.5 - cy) / ry, d = Math.sqrt(u * u + v * v);
    if (d > 1) continue;
    let c = d > 0.8 ? mul(iris, 0.5) : v < -0.25 ? mix(iris, 0xffffff, 0.22) : iris;
    if (o.slit ? Math.abs(u) < pr * 0.4 && Math.abs(v) < 0.9 : d < pr) c = pupil;
    if (o.lid && v > 0.55) c = o.lid;
    if (Math.hypot(u - 0.35, v - 0.38) < Math.max(0.3, 1.1 / Math.min(rz, ry)) && !(o.lid && v > 0.55)) c = glint;
    const h = on.hitFrom(sd * 40, y, z, -sd, 0, 0, 80);
    if (!h) continue;
    vb.set(h[0] + sd, y, z, c);
  }
  return vb;
}

// ---------------------------------------------------------------- wave 17: the "Pinterest" kit
// Readable voxel creatures: hue-shifted ramps, structured light (no per-voxel static), low-frequency
// clumps and patches, baked cavity AO and edge rim light, fur clumps, gloss and seeded variety.
//
//   hramp(base, n, o)        n tones dark → light round a base: darks cooler and richer, lights warmer
//   lit(T, o)                a shade fn(x, y, z, nx, ny, nz) for ell/cap: key light from up-front-left,
//                            banded on the ramp, optional low-frequency clumps (o.clump, o.cs)
//   vnoise(x, y, z, s, seed) smooth value noise 0..1 at a scale of s voxels
//   bake(vb, o)              cavity AO (crevices, under chins, where limbs join) and a lit top-edge rim
//   clumps(vb, n, o)         fur clumps: short tapered locks leaning out of the skin and drooping
//   gloss(vb, o)             a specular band on the surfaces facing the key light (chitin, slime, eyes)
//   variant(seed, n)         a seeded pick 0..n-1 (per individual: geometry variants by cache key)
import { h3 } from '../noise.js';

const toHsl = (c) => {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
};
const fromHsl = (h, s, l) => {
  h = ((h % 1) + 1) % 1; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
};
/** Shift a colour: dh in turns, ds / dl added. */
export const hsl = (c, dh = 0, ds = 0, dl = 0) => { const [h, s, l] = toHsl(c); return fromHsl(h + dh, s + ds, l + dl); };
/**
 * A hue-shifted ramp of n tones round `base` (which sits at index o.at, default the middle): each
 * step down is darker, a little more saturated and turned toward cool violet; each step up lighter,
 * less saturated and turned toward warm yellow (the classic pixel-art ramp).
 * o: { at, step (lightness per step), shift (hue turn per step), sat }
 */
export function hramp(base, n = 5, o = {}) {
  const [h, s, l] = toHsl(base), at = o.at ?? Math.floor((n - 1) / 2), step = o.step ?? 0.11, sh = o.shift ?? 0.022, sat = o.sat ?? 0.05;
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = i - at;
    // hue toward ~0.13 (warm) going up, toward ~0.72 (violet) going down, the shortest way round
    const tgt = d > 0 ? 0.13 : 0.72;
    let dh = tgt - h; if (dh > 0.5) dh -= 1; if (dh < -0.5) dh += 1;
    out.push(fromHsl(h + Math.sign(dh) * Math.min(Math.abs(dh), Math.abs(d) * sh), s + (d < 0 ? -d * sat : -d * sat * 1.3), l + d * step * (d > 0 ? 0.85 : 1)));
  }
  return out;
}
/** Smooth value noise 0..1 (trilinear over a lattice s voxels apart). */
export function vnoise(x, y, z, s = 4, seed = 0) {
  const fx = x / s, fy = y / s, fz = z / s, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz);
  let v = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2;
    v += h3(ix + dx, iy + dy, iz + dz, seed + 77) * (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
  }
  return v;
}
/**
 * Structured light on a ramp: fn(x, y, z, nx, ny, nz) for VB.ell / taper. Lit from up-front-left
 * (a soft key), the terminator banded on the ramp; o.clump adds low-frequency patches o.cs voxels
 * wide (fur clumps, mottling), never per-voxel static. o: { bias, clump, cs, seed, k (light strength) }
 */
export function lit(T, o = {}) {
  const b = o.bias ?? 0, cl = o.clump ?? 0, cs = o.cs ?? 4, sd = o.seed ?? 0, k = o.k ?? 1;
  return (x, y, z, nx = 0, ny = 0, nz = 0) => {
    if (typeof nx !== 'number') { nx = 0; ny = 0; nz = 0; }
    let v = 0.5 + b + k * (ny * 0.34 + nz * 0.12 - nx * 0.05);
    if (cl) v += (vnoise(x, y, z, cs, sd) - 0.5) * cl;
    return T[clamp(Math.floor(v * T.length), 0, T.length - 1)];
  };
}
/** Eyes, teeth, claws, glints (near white or near black) are never baked. */
const keepAsIs = (c) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
  return (l > 0.84 && (mx - mn) / (mx || 1) < 0.22) || l < 0.055;
};
/** A seeded pick 0..n-1. */
export const variant = (seed, n) => Math.floor(h3(seed | 0, 17, 29, 5) * n) % n;

/**
 * Bake light into a model's colours: cavity AO (surface voxels with many filled voxels round them
 * darken, cooler: under the chin, where a leg meets the body, between clumps) and a rim on lit top
 * edges (a voxel open above and to a side gets a step lighter). o: { ao (0..1), rim (0..1), skip(c),
 * r (probe radius), aoCol, rimCol }
 */
export function bake(vb, o = {}) {
  const ao = o.ao ?? 0.38, rim = o.rim ?? 0.22, R = o.r ?? 2, aoCol = o.aoCol ?? 0x1a1030, rimCol = o.rimCol ?? 0xfff2d8;
  const L = vb.list(), out = [];
  for (const v of L) {
    if (o.skip ? o.skip(v.c) : keepAsIs(v.c)) continue;
    const { x, y, z } = v;
    const up = !vb.has(x, y + 1, z), dn = !vb.has(x, y - 1, z);
    const sx = !vb.has(x + 1, y, z) || !vb.has(x - 1, y, z), sz = !vb.has(x, y, z + 1) || !vb.has(x, y, z - 1);
    if (!up && !dn && !sx && !sz) continue; // inside
    let f = 0, t = 0;
    for (let dz = -R; dz <= R; dz += R) for (let dy = -R; dy <= R; dy += R) for (let dx = -R; dx <= R; dx += R) {
      if (!dx && !dy && !dz) continue;
      t++; if (vb.has(x + dx, y + dy, z + dz)) f++;
    }
    const o0 = clamp((f / t - 0.5) / 0.32, 0, 1); // a flat face is ~0.5 filled, a crevice 0.8+
    const occ = o0 < 0.2 ? 0 : o0 < 0.6 ? 0.5 : 1; // (two steps: flat bands that still mesh greedy)
    let c = v.c;
    if (occ > 0.05) c = mix(c, aoCol, occ * ao);
    if (dn && !up) c = mix(c, aoCol, ao * 0.35); // undersides a touch cooler
    if (up && (sx || sz) && occ < 0.3) c = mix(c, rimCol, rim);
    if (c !== v.c) out.push(x, y, z, c);
  }
  for (let i = 0; i < out.length; i += 4) vb.set(out[i], out[i + 1], out[i + 2], out[i + 3]);
  return vb;
}

/**
 * Fur clumps: n locks spread over the skin (a jittered pick), each a short taper leaning out along
 * the surface normal and drooping (o.droop), root dark → tip light. o: { tones, seed, len: [a, b],
 * r (root radius), droop, filter(x, y, z) }
 */
export function clumps(vb, n, o) {
  const T = o.tones, L = vb.list(), len = o.len || [2, 4], r0 = o.r ?? 1.3, dr = o.droop ?? 0.5;
  if (!L.length) return vb;
  let cx = 0, cy = 0, cz = 0;
  for (const v of L) { cx += v.x; cy += v.y; cz += v.z; }
  cx /= L.length; cy /= L.length; cz /= L.length;
  const add = [];
  let made = 0;
  for (let i = 0; i < n * 8 && made < n; i++) {
    const v = L[Math.floor(h3(i, 7, 3, (o.seed || 0) + 11) * L.length)];
    if (o.filter && !o.filter(v.x, v.y, v.z)) continue;
    if (vb.has(v.x, v.y + 1, v.z) && vb.has(v.x + 1, v.y, v.z) && vb.has(v.x - 1, v.y, v.z) && vb.has(v.x, v.y, v.z + 1) && vb.has(v.x, v.y, v.z - 1) && vb.has(v.x, v.y - 1, v.z)) continue;
    let dx = v.x - cx, dy = (v.y - cy) * (o.sy ?? 1), dz = v.z - cz;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const k = len[0] + h3(i, 3, 9, o.seed || 0) * (len[1] - len[0]);
    const ex = v.x + 0.5 + dx * k, ey = v.y + 0.5 + dy * k - dr * k * (1 - Math.max(0, dy)), ez = v.z + 0.5 + dz * k;
    add.push([v.x + 0.5 - dx, v.y + 0.5 - dy, v.z + 0.5 - dz, ex, ey, ez, r0 * (0.8 + h3(i, 5, 1, o.seed || 0) * 0.4)]);
    made++;
  }
  for (const [ax, ay, az, bx, by, bz, r] of add) taper(vb, ax, ay, az, bx, by, bz, r, 0.45, (x, y, z, t) => (vb.has(x, y, z) && t < 0.3 ? undefined : T[clamp(Math.floor((0.25 + t * 0.75) * T.length), 0, T.length - 1)]));
  return vb;
}

/**
 * A gloss band: surface voxels whose open faces look toward the key light (up, a little front-left)
 * get o.col mixed in by o.k (chitin, slime, horn, wet noses). o: { k, col, min (0..1 alignment), filter }
 */
export function gloss(vb, o = {}) {
  const k = o.k ?? 0.45, col = o.col ?? 0xffffff, min = o.min ?? 0.82;
  const hx = -0.25, hy = 0.85, hz = 0.46, out = [];
  for (const v of vb.list()) {
    if (o.filter && !o.filter(v.x, v.y, v.z, v.c)) continue;
    let nx = 0, ny = 0, nz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy || dz) && !vb.has(v.x + dx, v.y + dy, v.z + dz)) { nx += dx; ny += dy; nz += dz; }
    const l = Math.hypot(nx, ny, nz);
    if (l < 0.5) continue;
    const a = (nx * hx + ny * hy + nz * hz) / l;
    if (a > min) out.push(v.x, v.y, v.z, mix(v.c, col, k * Math.min(1, (a - min) / (1 - min) * 1.6)));
  }
  for (let i = 0; i < out.length; i += 4) vb.set(out[i], out[i + 1], out[i + 2], out[i + 3]);
  return vb;
}
