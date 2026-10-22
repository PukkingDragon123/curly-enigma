// NPC burrows in the mine: homes and shops dug by the folk who live down here (a trading post, an
// herbalist, Rocco the raccoon's storage burrow, a deep outpost). The characters/traders part owns
// this file and dresses them properly; this is the plain shell: a rounded room with a plank floor,
// timber posts, a framed doorway facing f.yaw and a lantern.
//
// Pure and deterministic (it runs in the chunk workers too). Plan feature:
// { kind: 'burrow', id, burrow: 'trader'|'herbalist'|'raccoon'|'outpost', x, y, z, yaw, rx, rz, h }
// (x, y, z) is the floor centre; yaw is the direction the door faces (0 = −z).
import { M, VOX } from '../materials.js';
import { h3 } from '../noise.js';

export function burrowBB(f) {
  const r = Math.max(f.rx, f.rz) + 1.6;
  return [f.x - r, f.y - 0.6, f.z - r, f.x + r, f.y + f.h + 0.8, f.z + r];
}

/** Where the doorway is (meters, outside the door) for trails to aim at. */
export function burrowDoor(f) {
  const d = Math.max(f.rx, f.rz) + 1.0;
  return { x: f.x - Math.sin(f.yaw) * d, y: f.y, z: f.z - Math.cos(f.yaw) * d };
}

export function stampBurrow(f, vox, X0, Y0, Z0, CS) {
  const bb = f.bb || burrowBB(f);
  const lx0 = Math.max(0, Math.floor(bb[0] * VOX) - X0), lx1 = Math.min(CS, Math.ceil(bb[3] * VOX) - X0);
  const ly0 = Math.max(0, Math.floor(bb[1] * VOX) - Y0), ly1 = Math.min(CS, Math.ceil(bb[4] * VOX) - Y0);
  const lz0 = Math.max(0, Math.floor(bb[2] * VOX) - Z0), lz1 = Math.min(CS, Math.ceil(bb[5] * VOX) - Z0);
  if (lx0 >= lx1 || ly0 >= ly1 || lz0 >= lz1) return;
  const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
  for (let z = lz0; z < lz1; z++) for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) {
    const vx = X0 + x, vy = Y0 + y, vz = Z0 + z;
    const xm = (vx + 0.5) / VOX - f.x, ym = (vy + 0.5) / VOX - f.y, zm = (vz + 0.5) / VOX - f.z;
    // room space: u across, v toward the door (−v is the back wall)
    const u = xm * cy - zm * sy, v = -(xm * sy + zm * cy);
    const vi = x + CS * (y + CS * z);
    const cur = vox[vi];
    if (cur === M.BEDROCK) continue;
    const e = (u / f.rx) ** 2 + (v / f.rz) ** 2;
    const dome = ym < f.h * Math.sqrt(Math.max(0, 1 - e * 0.85)) + (h3(vx >> 1, vy >> 1, vz >> 1, 61) - 0.5) * 0.08;
    if (e < 1 && ym >= 0 && dome) {
      vox[vi] = 0;
      // posts holding up the roof at the four quarters, a ring beam above them
      const post = Math.abs(Math.abs(u) - f.rx * 0.62) < 0.1 && Math.abs(Math.abs(v) - f.rz * 0.62) < 0.1;
      if (post) vox[vi] = M.TIMBER;
      if (ym > f.h - 0.55 && ym < f.h - 0.42 && Math.abs(e - 0.62 * 0.62 * 1.1) < 0.08) vox[vi] = M.TIMBER;
      if (Math.abs(u) < 0.06 && Math.abs(v) < 0.06 && ym > f.h - 0.62 && ym < f.h - 0.45) vox[vi] = M.LANTERN;
    } else if (e < 1.08 && ym < 0 && ym > -1 / VOX - 0.01) {
      vox[vi] = M.BOARDS; // plank floor
    } else if (v > f.rz - 0.4 && v < f.rz + 1.3 && Math.abs(u) < 0.62 && ym >= 0 && ym < 1.45) {
      // the doorway through the wall, framed in timber
      const frame = Math.abs(u) > 0.5 || ym > 1.33;
      vox[vi] = frame && v < f.rz + 0.15 ? M.TIMBER : 0;
    }
  }
}
