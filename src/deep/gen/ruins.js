// Ruins of the old ones, built into the rock long before the miners came: a pillared hall, a
// domed shrine with its idol, a vault behind a round seal-door, a well with a spiral stair down
// to a flooded gallery. Each has a sealed door (seal-stone over bedrock) and a treasure room
// behind it, opened by the puzzle Ruins.js runs (levers, a hidden switch, dials, light beams,
// pressure plates, a drain valve). Layouts and voxels: ../ruins/{hall,shrine,vault,well}.js.
//
// Pure and deterministic (it runs in the chunk workers too). Plan feature:
// { kind: 'ruin', id, ruin: 'hall'|'shrine'|'vault'|'well', x, y, z, yaw, r, h, seed }
import { VOX } from '../materials.js';
import { frame, toLocal, toWorld, zoneOf, puzzleFor } from '../ruins/common.js';
import { hallLayout, hallVox } from '../ruins/hall.js';
import { shrineLayout, shrineVox } from '../ruins/shrine.js';
import { vaultLayout, vaultVox } from '../ruins/vault.js';
import { wellLayout, wellVox, wellSpan } from '../ruins/well.js';

const KIND = {
  hall: [hallLayout, hallVox],
  shrine: [shrineLayout, shrineVox],
  vault: [vaultLayout, vaultVox],
  well: [wellLayout, wellVox, wellSpan],
};

const cache = new WeakMap();

/**
 * The ruin's full layout (cached per feature): its grid (frame), sizes in voxels R/H, zone,
 * puzzle, and P (the kind's layout: door, room, chest, puzzle pieces, local bb...).
 */
export function ruinLayout(f) {
  let L = cache.get(f);
  if (L) return L;
  const kind = KIND[f.ruin] ? f.ruin : 'hall';
  const zone = zoneOf(f);
  L = { ...frame(f), id: f.id, kind, zone, seed: f.seed | 0, R: Math.round(f.r * VOX), H: Math.round((f.h || 4) * VOX), puzzle: puzzleFor(kind, zone) };
  L.P = KIND[kind][0](L);
  L.vox = KIND[kind][1];
  L.span = KIND[kind][2] || null; // optional: the y range a column can change in
  cache.set(f, L);
  return L;
}

/** World bounding box (metres) of everything a ruin stamps. */
export function ruinBB(f) {
  const L = ruinLayout(f), [a0, a1, y0, y1, b0, b1] = L.P.bb;
  const xs = [], zs = [];
  for (const a of [a0, a1]) for (const b of [b0, b1]) { const p = toWorld(L, a, 0, b); xs.push(p.x); zs.push(p.z); }
  return [Math.min(...xs) - 0.1, (L.CY + y0) / VOX - 0.1, Math.min(...zs) - 0.1, Math.max(...xs) + 0.1, (L.CY + y1) / VOX + 0.1, Math.max(...zs) + 0.1];
}

/** The way in: the end of the entrance corridor (metres) and the direction out of the ruin. */
export function ruinDoor(f) {
  const L = ruinLayout(f), e = L.P.entry;
  const p = toWorld(L, e.a + 0.5, 0, e.b + 0.5);
  const dx = e.dir[0] * L.F[0] + e.dir[1] * L.Rv[0], dz = e.dir[0] * L.F[1] + e.dir[1] * L.Rv[1];
  return { x: p.x, y: p.y, z: p.z, dx, dz };
}

/** Carve one ruin into a chunk (vox: Uint8Array CS³, chunk origin X0/Y0/Z0 in voxels). */
export function stampRuin(f, vox, X0, Y0, Z0, CS) {
  const bb = f.bb || ruinBB(f);
  const lx0 = Math.max(0, Math.floor(bb[0] * VOX) - X0), lx1 = Math.min(CS, Math.ceil(bb[3] * VOX) - X0);
  const ly0 = Math.max(0, Math.floor(bb[1] * VOX) - Y0), ly1 = Math.min(CS, Math.ceil(bb[4] * VOX) - Y0);
  const lz0 = Math.max(0, Math.floor(bb[2] * VOX) - Z0), lz1 = Math.min(CS, Math.ceil(bb[5] * VOX) - Z0);
  if (lx0 >= lx1 || ly0 >= ly1 || lz0 >= lz1) return;
  const L = ruinLayout(f), fn = L.vox, [a0, a1, y0, y1, b0, b1] = L.P.bb;
  const loc = [0, 0, 0], sp = [0, 0];
  const yA = Math.max(ly0, L.CY + y0 - Y0), yB = Math.min(ly1, L.CY + y1 - Y0);
  for (let z = lz0; z < lz1; z++) for (let x = lx0; x < lx1; x++) {
    const vx = X0 + x, vz = Z0 + z;
    toLocal(L, vx, L.CY, vz, loc);
    const a = loc[0], b = loc[2];
    if (a < a0 || a >= a1 || b < b0 || b >= b1) continue;
    let ya = yA, yb = yB;
    if (L.span) { L.span(L, a, b, sp); ya = Math.max(ya, L.CY + sp[0] - Y0); yb = Math.min(yb, L.CY + sp[1] - Y0); }
    for (let y = ya; y < yb; y++) {
      const vy = Y0 + y, ly = vy - L.CY;
      const vi = x + CS * (y + CS * z);
      const cur = vox[vi];
      if (cur === 17) continue; // bedrock: the world's shell stays
      const m = fn(L, a, ly, b, cur, vx, vy, vz);
      if (m >= 0) vox[vi] = m;
    }
  }
}

export { toLocal, toWorld };
