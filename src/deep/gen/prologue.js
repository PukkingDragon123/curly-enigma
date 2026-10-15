// Old Star's dig: the cave chamber the mole tumbles into at the start, near the mine entrance lift.
// Called by ChunkGen.stamp for the plan feature { kind: 'prologue', x, y, z } (meters); fills the
// chunk's voxels (Uint8Array CS³, index x + CS*(y + CS*z), chunk origin X0/Y0/Z0 in voxels).
// Owned by the story (src/deep/Prologue.js); keep it deterministic (no Math.random).
import { M, VOX } from '../materials.js';

export const PROLOGUE_BB = 7; // meters around the centre this feature may touch

export function stampPrologue(f, vox, X0, Y0, Z0, CS) {
  for (let z = 0; z < CS; z++) for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++) {
    const xm = (X0 + x + 0.5) / VOX, ym = (Y0 + y + 0.5) / VOX, zm = (Z0 + z + 0.5) / VOX;
    const vi = x + CS * (y + CS * z);
    if (vox[vi] === M.BEDROCK || vox[vi] === M.BURROW) continue;
    // a low dome of a chamber
    const dx = (xm - f.x) / 3.2, dy = (ym - (f.y + 0.9)) / 1.6, dz = (zm - f.z) / 3.2;
    if (dx * dx + dy * dy + dz * dz < 1 && ym > f.y) vox[vi] = 0;
    // a crawlway toward the mine entrance lift (f.to)
    if (f.to) {
      const ax = f.to.x - f.x, az = f.to.z - f.z, len = Math.hypot(ax, az) || 1;
      const t = ((xm - f.x) * ax + (zm - f.z) * az) / (len * len);
      if (t > 0 && t < 1) {
        const px = f.x + ax * t, pz = f.z + az * t, py = f.y + (f.to.y - f.y) * t;
        const d = Math.hypot(xm - px, zm - pz);
        if (d < 0.55 && ym > py && ym < py + 1.05) vox[vi] = 0;
      }
    }
  }
}
