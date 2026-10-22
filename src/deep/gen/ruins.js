// Ruins of something older than the mine: halls of fitted stone with pillars, collapsed in places.
// The ruins/puzzles part owns this file and builds the real thing (shrines, vaults, sunken halls,
// lever doors, pressure plates, rune dials); this is the plain shell: an oval hall with a brick
// floor, a ring of pillars (some broken) and rubble.
//
// Pure and deterministic (it runs in the chunk workers too). Plan feature:
// { kind: 'ruin', id, ruin: 'hall'|'shrine'|'vault'|'well', x, y, z, yaw, r, h, seed }
import { M, VOX } from '../materials.js';
import { h3 } from '../noise.js';

export function ruinBB(f) {
  const r = f.r + 1;
  return [f.x - r, f.y - 0.6, f.z - r, f.x + r, f.y + f.h + 0.8, f.z + r];
}

export function stampRuin(f, vox, X0, Y0, Z0, CS) {
  const bb = f.bb || ruinBB(f);
  const lx0 = Math.max(0, Math.floor(bb[0] * VOX) - X0), lx1 = Math.min(CS, Math.ceil(bb[3] * VOX) - X0);
  const ly0 = Math.max(0, Math.floor(bb[1] * VOX) - Y0), ly1 = Math.min(CS, Math.ceil(bb[4] * VOX) - Y0);
  const lz0 = Math.max(0, Math.floor(bb[2] * VOX) - Z0), lz1 = Math.min(CS, Math.ceil(bb[5] * VOX) - Z0);
  if (lx0 >= lx1 || ly0 >= ly1 || lz0 >= lz1) return;
  const N = 8; // pillars
  for (let z = lz0; z < lz1; z++) for (let y = ly0; y < ly1; y++) for (let x = lx0; x < lx1; x++) {
    const vx = X0 + x, vy = Y0 + y, vz = Z0 + z;
    const xm = (vx + 0.5) / VOX - f.x, ym = (vy + 0.5) / VOX - f.y, zm = (vz + 0.5) / VOX - f.z;
    const vi = x + CS * (y + CS * z);
    if (vox[vi] === M.BEDROCK) continue;
    const d = Math.hypot(xm, zm) / f.r;
    if (d > 1.06) continue;
    if (ym < 0) {
      // fitted stone floor, cracked and missing here and there
      if (ym > -2 / VOX && d < 1) vox[vi] = h3(vx >> 2, 0, vz >> 2, f.seed) < 0.12 ? M.RUBBLE : M.BRICK;
      continue;
    }
    const roof = f.h * Math.sqrt(Math.max(0, 1 - d * d * 0.7));
    if (ym > roof) continue;
    vox[vi] = 0;
    // a ring of pillars; every few one has fallen (only a stump stands)
    const a = Math.atan2(zm, xm), k = Math.round(a / (Math.PI * 2) * N);
    const pa = k / N * Math.PI * 2, pr = f.r * 0.7;
    const px = Math.cos(pa) * pr, pz = Math.sin(pa) * pr;
    const broken = h3(k, f.seed, 3, 7) < 0.3;
    if (Math.hypot(xm - px, zm - pz) < 0.28 && (!broken || ym < 0.5 + h3(k, f.seed, 5, 9))) vox[vi] = M.BRICK;
    // the wall: a brick lining just inside the cut
    else if (d > 0.96) vox[vi] = M.BRICK;
    // rubble heaps where the roof came down
    else if (ym < 0.35 * h3(vx >> 3, 0, vz >> 3, f.seed + 1) - 0.1) vox[vi] = M.RUBBLE;
  }
}
