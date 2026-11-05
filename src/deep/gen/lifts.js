// The old miners' lifts, natural: each is a rope-and-cage drop. The cage hangs in a rough round
// shaft that rises out of the roof of a rock alcove off one of the network's chambers (its open
// side, +z, faces into the chamber). Nothing here is masonry: the alcove and the shaft are plain
// rock with the zone's own walls, the cage's plank floor sits on a slab of hard rock, and the town
// shaft is a natural chimney skinned in hard rock (unbreakable, so a cave that runs into it can't
// open a two-hundred-metre drop), its stops alcoves opening west onto it.
// The cage, its rope, the bell, the name board and the lantern are 3D models (src/deep/ruins/liftKit.js).
//
// Pure and deterministic (it runs in the chunk workers too). Plan features:
//   { kind: 'lift', id, x, y, z }       a lift (plan.lifts L*): floor centre at (x, y, z)
//   { kind: 'stop', id, x, y, z, sx, sz } a stop on the town shaft (plan.lifts s*), the shaft at (sx, sz)
//   { kind: 'shaft', x, z, y0, y1 }     the town shaft (Generator stamps it with stampShaft)
import { VOX, M } from '../materials.js';
import { h3 } from '../noise.js';
import { RM } from '../ruins/mats.js';

// sizes in voxels (1/16 m)
const RI = 28; // the alcove's half width (a rounded square: 3.5 m across)
const RH = 38; // its height in the middle (2.4 m)
const CI = 12; // the cage's half width (1.5 m across): its plank floor
const SR = 18; // the shaft over the cage: radius (1.1 m)
const TOP = RH + 58; // the shaft's top over the floor (6 m: it stops short of the burrow over L0)
const DW = 10, DHT = 27; // the way out (+z): half width, height
const OUT = 48; // how far the way out runs (3 m from the middle)
const SH = 8;

export const LIFT = { RI, RH, SH, CI, TOP, DW, DHT };
const HARD = RM.LIFTCOB; // hard rock: plain stone to look at, but no pick bites it

/** World bounding box (m) of a station feature. */
export function liftBB(f) {
  const r = (RI + 10) / VOX;
  if (f.kind === 'stop') return [Math.min(f.x - r, f.sx - 1.9), f.y - (SH + 1) / VOX, f.z - r, f.x + r, f.y + (RH + 12) / VOX, f.z + r];
  return [f.x - r, f.y - (SH + 1) / VOX, f.z - r, f.x + r, f.y + (TOP + 10) / VOX, f.z + Math.max(r, (OUT + 4) / VOX)];
}

// smooth value noise from the voxel hash (0..1), cell c voxels
function vn(x, y, z, c, s) {
  const fx = x / c, fy = y / c, fz = z / c, ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty), uz = tz * tz * (3 - 2 * tz);
  const a = h3(ix, iy, iz, s), b = h3(ix + 1, iy, iz, s), c0 = h3(ix, iy + 1, iz, s), d = h3(ix + 1, iy + 1, iz, s);
  const e = h3(ix, iy, iz + 1, s), f = h3(ix + 1, iy, iz + 1, s), g = h3(ix, iy + 1, iz + 1, s), h = h3(ix + 1, iy + 1, iz + 1, s);
  const k0 = a + (b - a) * ux, k1 = c0 + (d - c0) * ux, k2 = e + (f - e) * ux, k3 = g + (h - g) * ux;
  const l0 = k0 + (k1 - k0) * uy, l1 = k2 + (k3 - k2) * uy;
  return l0 + (l1 - l0) * uz;
}

// what the alcove may cut: rock and soil (not bedrock, the burrow, the folk's fittings, ruins)
const CUT = new Uint8Array(256);
for (let m = 1; m < 43; m++) CUT[m] = 1;
CUT[M.BEDROCK] = 0; CUT[M.BURROW] = 0; CUT[M.DOOR] = 0; CUT[M.WATER] = 0; CUT[M.LAVA] = 0;
for (let m = 128; m < 256; m++) CUT[m] = 1; // ore

/**
 * Is local voxel (i, dy, k) (from the floor centre) inside the alcove? A rounded square in plan,
 * a dome over it, the walls a little ragged (only ever outward: what's inside stays clear).
 */
function inAlcove(i, dy, k, vx, vy, vz, s, open) {
  const ai = Math.abs(i + 0.5), ak = Math.abs(k + 0.5);
  const rag = vn(vx, vy, vz, 7, s) * 5 + vn(vx, vy, vz, 3, s + 1) * 2;
  const R = RI + rag;
  const p = (ai / R) ** 4 + (ak / R) ** 4;
  if (p >= 1) return false;
  const roof = RH * (1 - p * 0.55) + rag * 0.6;
  if (dy >= roof) return false;
  // the way out (+z): an arch running on into the rock
  void open;
  return true;
}

/** Carve one lift (L*) into a chunk. */
function stampRoom(f, vox, X0, Y0, Z0, CS) {
  const cx = Math.round(f.x * VOX), cy = Math.round(f.y * VOX), cz = Math.round(f.z * VOX);
  const R = RI + 10, s = (cx * 31 + cz * 17) | 0;
  const x0 = Math.max(0, cx - R - X0), x1 = Math.min(CS, cx + R - X0);
  const z0 = Math.max(0, cz - R - Z0), z1 = Math.min(CS, cz + Math.max(R, OUT + 4) - Z0);
  const y0 = Math.max(0, cy - SH - Y0), y1 = Math.min(CS, cy + TOP + 10 - Y0);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const i = X0 + x - cx, k = Z0 + z - cz;
    const ai = i < 0 ? -i - 1 : i, ak = k < 0 ? -k - 1 : k;
    const vx = X0 + x, vz = Z0 + z;
    const sh = Math.sqrt((i + 0.5) * (i + 0.5) + (k + 0.5) * (k + 0.5));
    for (let y = y0; y < y1; y++) {
      const dy = Y0 + y - cy, vy = Y0 + y;
      const vi = x + CS * (y + CS * z);
      const cur = vox[vi];
      if (cur === M.BEDROCK || cur === M.BURROW) continue; // the world's shell, the burrow
      if (dy < 0) {
        // the floor: the cage's planks on a slab of hard rock; the rest of the floor stays rock
        if (ai < CI && ak < CI) { vox[vi] = dy === -1 ? RM.LIFTPLANK : HARD; continue; }
        if (dy === -1 && ai < CI + 2 && ak < CI + 2) { vox[vi] = HARD; continue; }
        if (!cur && ai < RI + 6 && ak < RI + 6 && dy >= -3) vox[vi] = HARD; // never hanging over a hole
        continue;
      }
      if (dy < RH + 8) {
        // the alcove, and the way out toward +z
        let air = inAlcove(i, dy, k, vx, vy, vz, s, true);
        if (!air && k > 0 && k < OUT) {
          const w = DW + vn(vx, vy, vz, 5, s + 3) * 4, h = DHT + vn(vx, vy, vz, 6, s + 5) * 5;
          const u = (i + 0.5) / w, v = dy / h;
          air = u * u + v * v < 1;
        }
        if (air && CUT[cur]) { vox[vi] = 0; continue; }
      }
      // the shaft the cage hangs in: rough and round, up into the dark
      if (dy >= RH - 14 && dy < TOP) {
        const r = SR + vn(vx, vy, vz, 6, s + 7) * 4 - 1;
        if (sh < r && CUT[cur]) vox[vi] = 0;
      }
    }
  }
}

/** A stop on the town shaft: an alcove opening west onto the shaft, a way out east. */
function stampStop(f, vox, X0, Y0, Z0, CS) {
  const cx = Math.round(f.x * VOX), cy = Math.round(f.y * VOX), cz = Math.round(f.z * VOX);
  const sx = f.sx * VOX, sz = f.sz * VOX, rS = 1.1 * VOX; // the shaft (voxels)
  const R = RI + 10, s = (cx * 13 + cz * 7) | 0;
  const x0 = Math.max(0, cx - R - X0), x1 = Math.min(CS, cx + R - X0);
  const z0 = Math.max(0, cz - R - Z0), z1 = Math.min(CS, cz + R - Z0);
  const y0 = Math.max(0, cy - SH - Y0), y1 = Math.min(CS, cy + RH + 10 - Y0);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const i = X0 + x - cx, k = Z0 + z - cz;
    const ai = i < 0 ? -i - 1 : i, ak = k < 0 ? -k - 1 : k;
    const vx = X0 + x, vz = Z0 + z;
    const dS = Math.hypot(X0 + x + 0.5 - sx, Z0 + z + 0.5 - sz);
    for (let y = y0; y < y1; y++) {
      const dy = Y0 + y - cy, vy = Y0 + y;
      const vi = x + CS * (y + CS * z);
      const cur = vox[vi];
      if (cur === M.BEDROCK || cur === M.BURROW) continue;
      if (dS < rS) { if (dy >= 0) continue; } // the shaft itself stays open above the floor
      if (dy < 0) {
        // the landing: planks at the shaft's edge on hard rock
        if (dy === -1 && ai < RI - 6 && ak < 14 && i < 4) vox[vi] = RM.LIFTPLANK;
        else if (dy >= -2 || !cur) vox[vi] = HARD;
        continue;
      }
      let air = inAlcove(i, dy, k, vx, vy, vz, s, false);
      // the way out east (+x) and the gap onto the shaft (west)
      if (!air && i > 0 && i < OUT && ak < DW + 4) { const u = (k + 0.5) / (DW + vn(vx, vy, vz, 5, s + 3) * 4), v = dy / (DHT + vn(vx, vy, vz, 6, s) * 4); air = u * u + v * v < 1; }
      if (!air && i < 0 && dS < rS + SH + 2 && dy < DHT + 4) air = true;
      if (air) { if (CUT[cur] || cur === HARD) vox[vi] = 0; }
      else if (dS < rS + SH + 3 && dy < RH + 6 && ai < RI + 4 && ak < RI + 4 && !CUT[cur] && cur !== HARD) vox[vi] = HARD;
    }
  }
}

/** Carve a station feature ('lift' | 'stop') into a chunk (vox: Uint8Array CS³). */
export function stampLift(f, vox, X0, Y0, Z0, CS) {
  if (f.kind === 'stop') stampStop(f, vox, X0, Y0, Z0, CS);
  else stampRoom(f, vox, X0, Y0, Z0, CS);
}

/**
 * The town shaft: a rough natural chimney, skinned in hard rock where caves run into it (nobody
 * falls in from the side, and no pick opens it).
 */
export function stampShaft(f, vox, X0, Y0, Z0, CS) {
  const bb = f.bb;
  const lx0 = Math.max(0, Math.floor(bb[0] * VOX) - X0), lx1 = Math.min(CS, Math.ceil(bb[3] * VOX) - X0);
  const ly0 = Math.max(0, Math.floor(bb[1] * VOX) - Y0), ly1 = Math.min(CS, Math.ceil(bb[4] * VOX) - Y0);
  const lz0 = Math.max(0, Math.floor(bb[2] * VOX) - Z0), lz1 = Math.min(CS, Math.ceil(bb[5] * VOX) - Z0);
  const sx = f.x * VOX, sz = f.z * VOX, r0 = 1.1 * VOX, r1 = 1.6 * VOX;
  for (let z = lz0; z < lz1; z++) for (let x = lx0; x < lx1; x++) {
    const dx = X0 + x + 0.5 - sx, dz = Z0 + z + 0.5 - sz;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d >= r1) continue;
    for (let y = ly0; y < ly1; y++) {
      const vi = x + CS * (y + CS * z);
      const cur = vox[vi];
      if (cur === M.BEDROCK) continue;
      const vx = X0 + x, vy = Y0 + y, vz = Z0 + z;
      // ragged walls: the open core wobbles, the skin of hard rock goes where a cave would break in
      const rr = r0 - 2 + vn(vx, vy, vz, 6, 77) * 3.5;
      if (d < rr) vox[vi] = 0;
      else if (!cur || !CUT[cur]) vox[vi] = HARD;
    }
  }
}
