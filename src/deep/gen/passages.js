// Natural passages: winding cave tunnels the generator adds where a place needs a way in that the
// noise caves didn't happen to give it (the folk's burrows; the mine entrance to the trading post).
// They are shaped like the rest of the caves (rounded, lumpy, a flattish floor, never timbered or
// trodden), so nobody built them: they're just how you find a burrow by exploring.
//
// Pure and deterministic (it runs in the chunk workers too). Plan feature:
//   { kind: 'passage', id, pts: [{ x, y, z, r }], seed }   (meters; r = the tunnel's radius there)
// planPassage() finds where a place's way out meets the open caves (caveDensity) and lays the path.
import { VOX } from '../materials.js';
import { h3 } from '../noise.js';

/** World bounding box (m) of a passage. */
export function passageBB(f) {
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (const p of f.pts) {
    const r = (p.r || 0.9) * 1.25 + 0.2;
    x0 = Math.min(x0, p.x - r); y0 = Math.min(y0, p.y - 0.3); z0 = Math.min(z0, p.z - r);
    x1 = Math.max(x1, p.x + r); y1 = Math.max(y1, p.y + r * 2.1 + 0.2); z1 = Math.max(z1, p.z + r);
  }
  return [x0, y0, z0, x1, y1, z1];
}

// smooth value noise from the voxel hash (0..1), cell size c voxels
function vnoise(x, y, z, c, s) {
  const fx = x / c, fy = y / c, fz = z / c;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty), uz = tz * tz * (3 - 2 * tz);
  const a = h3(ix, iy, iz, s), b = h3(ix + 1, iy, iz, s), cc = h3(ix, iy + 1, iz, s), d = h3(ix + 1, iy + 1, iz, s);
  const e = h3(ix, iy, iz + 1, s), f = h3(ix + 1, iy, iz + 1, s), g = h3(ix, iy + 1, iz + 1, s), h = h3(ix + 1, iy + 1, iz + 1, s);
  const k0 = a + (b - a) * ux, k1 = cc + (d - cc) * ux, k2 = e + (f - e) * ux, k3 = g + (h - g) * ux;
  const l0 = k0 + (k1 - k0) * uy, l1 = k2 + (k3 - k2) * uy;
  return l0 + (l1 - l0) * uz;
}

// what a passage never cuts: bedrock, the burrow walls and doors, lanterns, anything built
// (ruins and dungeons, lift stations, the folk's burrows: ids 43+), and lakes (it stops at the water)
const KEEP = new Uint8Array(256);
for (const m of [17, 23, 25, 32, 40, 41]) KEEP[m] = 1;
for (let m = 43; m < 128; m++) KEEP[m] = 1;
export const PASSAGE_KEEP = KEEP;

/** Carve one passage into a chunk (vox: Uint8Array CS³, chunk origin X0/Y0/Z0 in voxels). */
export function stampPassage(f, vox, X0, Y0, Z0, CS) {
  const bb = f.bb || passageBB(f);
  const lx0 = Math.max(0, Math.floor(bb[0] * VOX) - X0), lx1 = Math.min(CS, Math.ceil(bb[3] * VOX) - X0);
  const ly0 = Math.max(0, Math.floor(bb[1] * VOX) - Y0), ly1 = Math.min(CS, Math.ceil(bb[4] * VOX) - Y0);
  const lz0 = Math.max(0, Math.floor(bb[2] * VOX) - Z0), lz1 = Math.min(CS, Math.ceil(bb[5] * VOX) - Z0);
  if (lx0 >= lx1 || ly0 >= ly1 || lz0 >= lz1) return;
  const P = f.pts, n = P.length, s = f.seed | 0;
  // the segments that reach into this chunk
  const cx0 = X0 / VOX, cy0 = Y0 / VOX, cz0 = Z0 / VOX, cm = CS / VOX;
  const segs = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = P[i], b = P[i + 1], r = Math.max(a.r, b.r) * 1.25 + 0.2;
    if (Math.max(a.x, b.x) + r < cx0 || Math.min(a.x, b.x) - r > cx0 + cm) continue;
    if (Math.max(a.z, b.z) + r < cz0 || Math.min(a.z, b.z) - r > cz0 + cm) continue;
    if (Math.max(a.y, b.y) + r * 2.2 < cy0 || Math.min(a.y, b.y) - 0.4 > cy0 + cm) continue;
    segs.push(i);
  }
  if (!segs.length) return;
  for (let z = lz0; z < lz1; z++) for (let x = lx0; x < lx1; x++) {
    const xm = (X0 + x + 0.5) / VOX, zm = (Z0 + z + 0.5) / VOX;
    for (let y = ly0; y < ly1; y++) {
      const vi = x + CS * (y + CS * z);
      const cur = vox[vi];
      if (!cur || KEEP[cur]) continue;
      const vx = X0 + x, vy = Y0 + y, vz = Z0 + z, ym = (vy + 0.5) / VOX;
      let inside = false;
      for (const i of segs) {
        const a = P[i], b = P[i + 1];
        // nearest point on the segment's floor line (the tunnel's floor runs along it)
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const L2 = dx * dx + dz * dz || 1e-6;
        let t = ((xm - a.x) * dx + (zm - a.z) * dz) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const r = a.r + (b.r - a.r) * t;
        const fx = a.x + dx * t, fy = a.y + dy * t, fz = a.z + dz * t;
        const hx = xm - fx, hz = zm - fz, up = ym - fy;
        if (up < -0.05 || up > r * 2.1) continue;
        // a rounded section, a little taller than wide, on a flattish floor; lumpy walls
        const cyc = r * 0.95;
        const lump = (vnoise(vx, vy, vz, 7, s) - 0.5) * 0.36 + (vnoise(vx, vy, vz, 3, s + 9) - 0.5) * 0.12;
        const e = (hx * hx + hz * hz) / (r * r) + ((up - cyc) * (up - cyc)) / (cyc * cyc * 1.15);
        // the floor is cut flat (a little rubble left on it here and there)
        if (up < 0.04 + (vnoise(vx, 0, vz, 5, s + 3) - 0.5) * 0.08) continue;
        if (e < 1 + lump) { inside = true; break; }
      }
      if (inside) vox[vi] = 0;
    }
  }
}

/**
 * A natural way from a place out to the open caves. A: { x, y, z } (just outside the place's door),
 * d: [dx, dz] (out of the door), open(x, y, z) → is that point open cave (the generator's
 * caveDensity > 0). Options: { rng, to: {x,y,z} (go there instead of the nearest cave), min, max,
 * r: [r0, r1] (radius range), r0 (the first 1.4 m's radius) }. Returns the points [{ x, y, z, r }] or null if there is no cave near enough.
 */
export function planPassage(A, d, open, o = {}) {
  const rng = o.rng || Math.random;
  const rr = () => (o.r ? o.r[0] + rng() * (o.r[1] - o.r[0]) : 0.78 + rng() * 0.22);
  let T = o.to || null;
  if (!T) {
    // the nearest roomy, floored open cave in front of the door (or round about, if nothing is)
    let best = null, bc = 1e9;
    const min = o.min ?? 3.5, max = o.max ?? 26;
    for (let dist = min; dist <= max && !(best && dist > bc); dist += 0.75) {
      const n = Math.max(8, Math.round(dist * 2.2));
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const ux = Math.cos(ang), uz = Math.sin(ang);
        const fw = ux * d[0] + uz * d[1];
        if (fw < -0.2) continue; // not back through the place
        for (const dy of [0, 0.6, -0.6, 1.2, -1.2, 2, -2, 3, -3]) {
          const x = A.x + ux * dist, y = A.y + dy, z = A.z + uz * dist;
          if (!open(x, y + 0.45, z) || !open(x, y + 0.95, z) || open(x, y - 0.25, z)) continue;
          const cost = dist * (1.25 - fw * 0.25) + Math.abs(dy) * 1.6;
          if (cost < bc) { bc = cost; best = { x, y, z }; }
          break;
        }
      }
    }
    T = best;
  }
  if (!T) return null;
  // out of the door first, then winding over to the cave, rising or sinking gently
  // (o.r0: a narrower start, to squeeze past something beside the way out)
  const s0 = { x: A.x, y: A.y, z: A.z, r: o.r0 ?? rr() };
  const s1 = { x: A.x + d[0] * 1.4, y: A.y, z: A.z + d[1] * 1.4, r: o.r0 ?? rr() };
  const pts = [s0, s1];
  const H = Math.hypot(T.x - s1.x, T.z - s1.z), n = Math.max(1, Math.round(H / 2.4));
  const nx = -(T.z - s1.z) / (H || 1), nz = (T.x - s1.x) / (H || 1);
  const wob = (rng() - 0.5) * 2.4, ph = rng() * 6.28;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const side = i < n ? Math.sin(t * Math.PI) * wob + Math.sin(t * 9 + ph) * 0.45 : 0;
    const ey = t * t * (3 - 2 * t); // ease the height change in and out
    pts.push({ x: s1.x + (T.x - s1.x) * t + nx * side, y: s1.y + (T.y - s1.y) * ey + (i < n ? Math.sin(t * 5 + ph) * 0.2 : 0), z: s1.z + (T.z - s1.z) * t + nz * side, r: rr() });
  }
  // and a little way on into the cave, so the mouth is open whatever the cave's wall does there
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const ex = last.x - prev.x, ez = last.z - prev.z, el = Math.hypot(ex, ez) || 1;
  pts.push({ x: last.x + (ex / el) * 0.8, y: last.y, z: last.z + (ez / el) * 0.8, r: last.r * 0.9 });
  return pts;
}
