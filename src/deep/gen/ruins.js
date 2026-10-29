// Dungeons (they were the old ones' ruins): rare rooms hidden in the rock, Minecraft-like, built of
// cobble, stone bricks, the Starfolk's fitted stone or dark deep bricks on a 0.5 m block grid, each
// with a spawner or guardians, chests, cobwebs, a trap, and (all but the plain monster rooms) a
// sealed door to a strongroom opened by a puzzle Ruins.js runs (a hidden switch, levers, symbol
// drums, light beams, pressure plates, a drain valve). Layouts and voxels: ../ruins/dungeon.js.
//
// Pure and deterministic (it runs in the chunk workers too). Plan feature:
// { kind: 'ruin', id, ruin: 'cell'|'crypt'|'vault'|'fortress', x, y, z, yaw, r, h, seed,
//   puzzle?, plain?, entry? (the crawl's length to the cave, voxels) }
import { VOX, M, MAT } from '../materials.js';

const LOOSE = new Uint8Array(256);
for (let m = 1; m < 256; m++) if (MAT[m]?.gran) LOOSE[m] = 1;
import { frame, toLocal, toWorld, zoneOf, puzzleFor } from '../ruins/common.js';
import { dungeonLayout, dungeonVox } from '../ruins/dungeon.js';

const KIND = {
  cell: [dungeonLayout, dungeonVox],
  crypt: [dungeonLayout, dungeonVox],
  vault: [dungeonLayout, dungeonVox],
  fortress: [dungeonLayout, dungeonVox],
};

const cache = new WeakMap();

/**
 * The ruin's full layout (cached per feature): its grid (frame), sizes in voxels R/H, zone,
 * puzzle, and P (the kind's layout: door, room, chest, puzzle pieces, local bb...).
 */
export function ruinLayout(f) {
  let L = cache.get(f);
  if (L) return L;
  const kind = KIND[f.ruin] ? f.ruin : 'cell';
  const zone = zoneOf(f);
  L = { ...frame(f), id: f.id, kind, zone, seed: f.seed | 0, R: Math.round(f.r * VOX), H: Math.round((f.h || 4) * VOX), plain: !!f.plain, entry: f.entry };
  L.puzzle = f.plain ? null : f.puzzle || puzzleFor(kind, zone);
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
      else if (cur < 40 && LOOSE[cur]) vox[vi] = M.DIRT; // loose rock round the ruin is packed (it would pour in)
    }
  }
}

export { toLocal, toWorld };

const FOOT = new Map();
/**
 * A dungeon kind's footprint for the generator's placing (local voxels, without the crawl):
 * { a0, a1, y0, y1, b0, b1 } round its rooms, walls and strongroom, and front (where the crawl starts).
 */
export function dungeonFootprint(kind, puzzle, plain) {
  const key = kind + ':' + puzzle + ':' + !!plain;
  let F = FOOT.get(key);
  if (F) return F;
  const P = dungeonLayout({ kind, puzzle, plain: !!plain, zone: 3, seed: 1, entry: 8, R: 64, H: 64 });
  F = { a0: P.front, a1: P.bb[1], y0: P.bb[2], y1: P.bb[3], b0: Math.min(P.bb[4], -16), b1: Math.max(P.bb[5], 16) };
  // the bb's b range includes the crawl's wobble: the rooms' own is what matters here
  let b0 = 0, b1 = 0;
  for (const S of [...P.spaces, ...P.holes, ...P.solids]) { b0 = Math.min(b0, S.b0 - 8); b1 = Math.max(b1, S.b1 + 8); }
  if (P.room) { b0 = Math.min(b0, P.room.b0 - 6); b1 = Math.max(b1, P.room.b1 + 6); }
  F.b0 = b0; F.b1 = b1;
  FOOT.set(key, F);
  return F;
}
