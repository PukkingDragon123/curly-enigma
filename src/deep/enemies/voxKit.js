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
    const g1 = Math.hypot(u + 0.36, v - 0.38) < Math.max(0.3, 1.1 / Math.min(rx, ry));
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
