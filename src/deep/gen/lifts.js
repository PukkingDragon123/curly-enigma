// The lift stations, Minecraft-plain: a room of dressed stone blocks (0.5 m) with a cobbled floor,
// a plank platform in the middle (the car stops here) framed in iron, iron guide rails up four
// corner posts and on into the shaft over it, a doorway in the +z wall (the way the car opens),
// and the town shaft lined in the same stone with its rails, its stops opening off it.
// Everything a station is made of is unbreakable (MAT.unbreakable: Dig.breakable and blasts leave
// it alone), and the shell is laid even where a cave runs through, so no station is ever dug out
// or blown open. The lever, the name sign and the torches are 3D models (src/deep/ruins/liftKit.js).
//
// Pure and deterministic (it runs in the chunk workers too). Plan features:
//   { kind: 'lift', id, x, y, z }       a lift station (plan.lifts L*): floor centre at (x, y, z)
//   { kind: 'stop', id, x, y, z, sx, sz } a stop on the town shaft (plan.lifts s*), the shaft at (sx, sz)
//   { kind: 'shaft', x, z, y0, y1 }     the town shaft (Generator stamps it with stampShaft)
import { VOX } from '../materials.js';
import { RM } from '../ruins/mats.js';

// sizes in voxels (1/16 m): the room, its shell, the shaft over the car
const RI = 24; // room half width (inside): 3 m across
const RH = 36; // room height (inside): 2.25 m
const SH = 8; // shell thickness: one 0.5 m block
const CI = 12; // the car / shaft half width (inside): 1.5 m
const TOP = RH + 60; // the shaft's inside top (6 m over the floor: it stops short of the burrow over L0)
const DW = 8, DHT = 24; // doorway half width, height (1 m × 1.5 m)

export const LIFT = { RI, RH, SH, CI, TOP, DW, DHT };

/** World bounding box (m) of a station feature. */
export function liftBB(f) {
  if (f.kind === 'stop') {
    const r = (RI + SH + 1) / VOX;
    return [Math.min(f.x - r, f.sx - 1.7), f.y - (SH + 1) / VOX, f.z - r, f.x + r, f.y + (RH + SH + 1) / VOX, f.z + r];
  }
  const r = (RI + SH + 1) / VOX;
  return [f.x - r, f.y - (SH + 1) / VOX, f.z - r, f.x + r, f.y + (TOP + SH + 1) / VOX, f.z + r];
}

/** The walls: cobblestone, smooth stone at the corners and in a band under the ceiling. */
function wallMat(ai, dy, ak) {
  if (dy >= RH - 8) return RM.LIFTBRICK;
  if (ai >= RI && ak >= RI) return RM.LIFTBRICK; // the corner columns
  return RM.LIFTCOB;
}

/** Carve one lift station (L*) into a chunk. */
function stampRoom(f, vox, X0, Y0, Z0, CS) {
  const cx = Math.round(f.x * VOX), cy = Math.round(f.y * VOX), cz = Math.round(f.z * VOX);
  const R = RI + SH;
  const x0 = Math.max(0, cx - R - X0), x1 = Math.min(CS, cx + R - X0);
  const z0 = Math.max(0, cz - R - Z0), z1 = Math.min(CS, cz + R - Z0);
  const y0 = Math.max(0, cy - SH - Y0), y1 = Math.min(CS, cy + TOP + SH - Y0);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const i = X0 + x - cx, k = Z0 + z - cz; // i, k ∈ [-32, 32)
    const ai = i < 0 ? -i - 1 : i, ak = k < 0 ? -k - 1 : k; // 0.. from the middle (symmetric)
    const inRoom = ai < RI && ak < RI, inShell = ai < RI + SH && ak < RI + SH;
    const inShaft = ai < CI && ak < CI, inShaftShell = ai < CI + SH && ak < CI + SH;
    for (let y = y0; y < y1; y++) {
      const dy = Y0 + y - cy;
      const vi = x + CS * (y + CS * z);
      if (vox[vi] === 17 || vox[vi] === 23) continue; // bedrock (the world's shell), the burrow
      let m = -1;
      if (dy < 0) {
        // the floor: cobble, the car's planks framed in iron
        if (!inShell) continue;
        if (dy === -1 && ai < CI && ak < CI) m = RM.LIFTPLANK;
        else if (dy === -1 && ai < CI + 2 && ak < CI + 2) m = RM.LIFTRAIL;
        else m = dy === -1 ? (((i >> 3) + (k >> 3)) & 1 ? RM.LIFTCOB : RM.LIFTBRICK) : RM.LIFTCOB;
      } else if (dy < RH) {
        if (!inShell) continue;
        if (inRoom) {
          m = 0;
          // iron guide posts at the car's four corners, up to the shaft
          if (ai >= CI && ai < CI + 2 && ak >= CI && ak < CI + 2) m = RM.LIFTRAIL;
        } else {
          // the walls, and the doorway out (+z)
          const door = k >= RI && ai < DW && dy < DHT;
          m = door ? 0 : wallMat(ai, dy, ak);
        }
      } else if (dy < RH + SH) {
        // the ceiling, open over the car
        if (!inShell) continue;
        m = inShaft ? 0 : (ai >= CI && ai < CI + 2 && ak >= CI && ak < CI + 2) ? RM.LIFTRAIL : RM.LIFTBRICK;
      } else if (dy < TOP) {
        // the shaft: stone walls with an iron rail up each side (-x / +x) and the car's posts
        if (!inShaftShell) continue;
        if (inShaft) {
          const rail = (ai === CI - 1) && (ak === 4 || ak === 5);
          m = rail ? RM.LIFTRAIL : 0;
        } else m = (ai >= CI && ai < CI + 2 && ak >= CI && ak < CI + 2) ? RM.LIFTRAIL : (dy - RH) % 32 < 8 ? RM.LIFTBRICK : RM.LIFTCOB;
      } else if (dy < TOP + SH) {
        if (!inShaftShell) continue;
        m = RM.LIFTBRICK; // the shaft's cap (it goes up into the dark)
      } else continue;
      vox[vi] = m;
    }
  }
}

/** A stop on the town shaft: a stone room opening west onto the shaft, a doorway east. */
function stampStop(f, vox, X0, Y0, Z0, CS) {
  const cx = Math.round(f.x * VOX), cy = Math.round(f.y * VOX), cz = Math.round(f.z * VOX);
  const sx = f.sx * VOX, sz = f.sz * VOX, rS = 1.1 * VOX; // the shaft (voxels)
  const R = RI + SH;
  const x0 = Math.max(0, cx - R - X0), x1 = Math.min(CS, cx + R - X0);
  const z0 = Math.max(0, cz - R - Z0), z1 = Math.min(CS, cz + R - Z0);
  const y0 = Math.max(0, cy - SH - Y0), y1 = Math.min(CS, cy + RH + SH - Y0);
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const i = X0 + x - cx, k = Z0 + z - cz;
    const ai = i < 0 ? -i - 1 : i, ak = k < 0 ? -k - 1 : k;
    const inRoom = ai < RI && ak < RI;
    const dS = Math.hypot(X0 + x + 0.5 - sx, Z0 + z + 0.5 - sz);
    for (let y = y0; y < y1; y++) {
      const dy = Y0 + y - cy;
      const vi = x + CS * (y + CS * z);
      if (vox[vi] === 17 || vox[vi] === 23) continue;
      if (dS < rS) { if (dy >= 0) continue; } // the shaft itself stays open above the floor
      let m;
      if (dy < 0) m = dy === -1 && ai < RI && ak < 14 && i < 4 ? RM.LIFTPLANK : dy === -1 && ai < RI && ak < 16 && i < 6 ? RM.LIFTRAIL : RM.LIFTCOB;
      else if (dy < RH) {
        if (inRoom) m = 0;
        else {
          // the doorway out (east, +x) and the way onto the shaft (west)
          const door = i >= RI && ak < DW && dy < DHT;
          const toShaft = i < 0 && dS < rS + SH + 2;
          m = door || toShaft ? 0 : wallMat(ai, dy, ak);
        }
      } else m = RM.LIFTBRICK; // ceiling
      vox[vi] = m;
    }
  }
}

/** Carve a station feature ('lift' | 'stop') into a chunk (vox: Uint8Array CS³). */
export function stampLift(f, vox, X0, Y0, Z0, CS) {
  if (f.kind === 'stop') stampStop(f, vox, X0, Y0, Z0, CS);
  else stampRoom(f, vox, X0, Y0, Z0, CS);
}

/** The town shaft: open, lined with stone (unbreakable, even through caves), an iron rail each side. */
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
    // the rails: two strips on the inside of the lining, east and west
    const rail = d >= r0 - 1 && Math.abs(dz) < 2.2 && Math.abs(dz) >= 0.2 && d < r0 + 0.5;
    for (let y = ly0; y < ly1; y++) {
      const vi = x + CS * (y + CS * z);
      if (vox[vi] === 17) continue;
      if (d < r0 - 1) vox[vi] = 0;
      else if (rail) vox[vi] = RM.LIFTRAIL;
      else if (d < r0) vox[vi] = 0;
      else vox[vi] = ((Y0 + y) & 31) < 8 ? RM.LIFTBRICK : RM.LIFTCOB; // cobble, a band of smooth stone every 2 m
    }
  }
}
