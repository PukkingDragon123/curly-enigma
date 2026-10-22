// Movement against the voxel world for creatures (meters). Queries go through world.voxelAt (never
// generates chunks; unloaded space reads as rock, so nothing wanders off into the void).
import { OPAQUE } from '../Mesher.js';
import { VOX, MAT } from '../materials.js';

export function solidAt(w, x, y, z) { return OPAQUE[w.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX))] === 1; }
export function matAt(w, x, y, z) { return w.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX)); }
/** 0 none, 1 water, 2 lava */
export function fluidAt(w, x, y, z) { return MAT[matAt(w, x, y, z)]?.fluid || 0; }

/**
 * Any solid voxel inside [x0,x1]×[y0,y1]×[z0,z1]? s > 1 samples every s-th voxel (always
 * including the box edges): big creatures would otherwise read tens of thousands of voxels.
 */
export function boxHits(w, x0, y0, z0, x1, y1, z1, s = 1) {
  const a = Math.floor(x0 * VOX), b = Math.floor((x1 - 1e-4) * VOX);
  const c = Math.floor(y0 * VOX), d = Math.floor((y1 - 1e-4) * VOX);
  const e = Math.floor(z0 * VOX), f = Math.floor((z1 - 1e-4) * VOX);
  if (s <= 1) {
    for (let z = e; z <= f; z++) for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (OPAQUE[w.voxelAt(x, y, z)] === 1) return true;
    return false;
  }
  for (let z = e; ; z = Math.min(f, z + s)) {
    for (let y = c; ; y = Math.min(d, y + s)) {
      for (let x = a; ; x = Math.min(b, x + s)) { if (OPAQUE[w.voxelAt(x, y, z)] === 1) return true; if (x >= b) break; }
      if (y >= d) break;
    }
    if (z >= f) break;
  }
  return false;
}

/**
 * Walker physics: an AABB (half width b.hw, height b.h, feet at b.pos) with gravity, step-ups and
 * per-axis sliding (like the mole's). Fills b.ev = { landed (impact speed), bumped, ceil }.
 */
export function walk(w, b, dt, grav = 16) {
  const p = b.pos, v = b.vel, hw = b.hw, h = b.h;
  const ev = b.ev;
  ev.landed = 0; ev.bumped = false; ev.ceil = false;
  // big bodies sample their box sparsely (a stride of 2–3 voxels)
  const sd = b.stride ?? (hw > 0.55 ? 3 : hw > 0.28 ? 2 : 1);
  const hits = (x, y, z) => boxHits(w, x - hw, y, z - hw, x + hw, y + h, z + hw, sd);
  // the box was free where it stood: a move only has to check the slab its leading face sweeps
  const sweepX = (x0, x1) => (x1 > x0 ? boxHits(w, x0 + hw, p.y, p.z - hw, x1 + hw, p.y + h, p.z + hw, sd) : boxHits(w, x1 - hw, p.y, p.z - hw, x0 - hw, p.y + h, p.z + hw, sd));
  const sweepZ = (z0, z1) => (z1 > z0 ? boxHits(w, p.x - hw, p.y, z0 + hw, p.x + hw, p.y + h, z1 + hw, sd) : boxHits(w, p.x - hw, p.y, z1 - hw, p.x + hw, p.y + h, z0 - hw, sd));
  const sweepY = (dy) => (dy > 0 ? boxHits(w, p.x - hw, p.y + h, p.z - hw, p.x + hw, p.y + h + dy, p.z + hw, sd) : boxHits(w, p.x - hw, p.y + dy, p.z - hw, p.x + hw, p.y, p.z + hw, sd));
  // fluids: water floats, lava floats fire-folk (others sink in and burn — the caller decides)
  const fl = fluidAt(w, p.x, p.y + h * 0.4, p.z);
  b.inFluid = fl;
  if (fl) {
    v.y += (fl === 2 && !b.lavaProof ? 4 : 22) * dt;
    const k = Math.max(0, 1 - 3.5 * dt);
    v.x *= k; v.z *= k; v.y *= k;
  } else v.y -= grav * dt;
  if (v.y < -16) v.y = -16;
  // substeps so fast knockbacks never tunnel through a thin wall
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt / 0.09));
  const sdt = dt / n;
  const was = b.grounded;
  let grounded = false;
  for (let s = 0; s < n; s++) {
    for (const ax of [0, 2]) {
      const d = (ax === 0 ? v.x : v.z) * sdt;
      if (!d) continue;
      const nx = ax === 0 ? p.x + d : p.x, nz = ax === 2 ? p.z + d : p.z;
      if (!(ax === 0 ? sweepX(p.x, nx) : sweepZ(p.z, nz))) { p.x = nx; p.z = nz; continue; }
      let stepped = false;
      if (was || grounded) {
        for (let st = 1 / VOX; st <= (b.step ?? 0.26) + 1e-4; st += Math.max(1, sd - 1) / VOX) {
          if (!hits(nx, p.y + st, nz) && !hits(p.x, p.y + st, p.z)) { p.y += st; p.x = nx; p.z = nz; stepped = true; break; }
        }
      }
      if (!stepped) { if (ax === 0) v.x *= -0.15; else v.z *= -0.15; ev.bumped = true; }
    }
    const dy = v.y * sdt;
    if (dy && !sweepY(dy)) p.y += dy;
    else if (!dy) { /* resting */ }
    else {
      if (dy < 0) {
        const top = Math.floor((p.y + dy) * VOX + 1) / VOX;
        if (top < p.y - 1e-6 && !hits(p.x, top, p.z)) p.y = top;
        grounded = true;
        if (!was && !ev.landed) ev.landed = -v.y;
      } else ev.ceil = true;
      v.y = 0;
    }
  }
  if (!grounded && v.y <= 0 && boxHits(w, p.x - hw, p.y - 0.03, p.z - hw, p.x + hw, p.y, p.z + hw, sd)) grounded = true;
  // spawned or pushed into rock: nudge up (a full check now and then, or after a bump)
  b._fullT = (b._fullT || 0) + 1;
  if ((ev.bumped || ev.ceil || b._fullT > 8) && hits(p.x, p.y, p.z)) { p.y += 1 / VOX; v.y = Math.max(v.y, 0); }
  if (b._fullT > 8) b._fullT = 0;
  b.grounded = grounded;
  if (grounded) {
    const f = Math.max(0, 1 - (b.friction ?? 10) * dt);
    v.x *= f; v.z *= f;
  }
}

/** Flyer physics: a sphere (radius b.rad around b.pos) that slides along rock, axis by axis. */
export function fly(w, b, dt) {
  const p = b.pos, v = b.vel, r = b.rad;
  let bumped = false;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt / 0.08));
  const sdt = dt / n;
  for (let s = 0; s < n; s++) {
    const nx = p.x + v.x * sdt;
    if (solidAt(w, nx + Math.sign(v.x) * r, p.y, p.z) || solidAt(w, nx + Math.sign(v.x) * r, p.y - r * 0.6, p.z)) { v.x *= -0.4; bumped = true; } else p.x = nx;
    const nz = p.z + v.z * sdt;
    if (solidAt(w, p.x, p.y, nz + Math.sign(v.z) * r) || solidAt(w, p.x, p.y - r * 0.6, nz + Math.sign(v.z) * r)) { v.z *= -0.4; bumped = true; } else p.z = nz;
    const ny = p.y + v.y * sdt;
    if (solidAt(w, p.x, ny + Math.sign(v.y) * r, p.z)) { v.y *= -0.4; bumped = true; } else p.y = ny;
  }
  if (solidAt(w, p.x, p.y, p.z)) p.y += 1 / VOX;
  b.bumped = bumped;
  return bumped;
}

/** Height of open air below a point (meters, up to max). */
export function airBelow(w, x, y, z, max = 4) {
  const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
  let vy = Math.floor(y * VOX);
  const end = vy - Math.ceil(max * VOX);
  for (; vy > end; vy--) if (OPAQUE[w.voxelAt(vx, vy, vz)] === 1) return y - (vy + 1) / VOX;
  return max;
}
/** Height of open air above a point (meters, up to max). */
export function airAbove(w, x, y, z, max = 4) {
  const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
  let vy = Math.floor(y * VOX);
  const end = vy + Math.ceil(max * VOX);
  for (; vy < end; vy++) if (OPAQUE[w.voxelAt(vx, vy, vz)] === 1) return vy / VOX - y;
  return max;
}

/** Clear line between two points (meters)? */
export function clearLine(w, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const d = Math.hypot(dx, dy, dz);
  if (d < 1e-3) return true;
  return !w.raycast(ax, ay, az, dx / d, dy / d, dz / d, d - 0.05);
}
