// Home placement rules: footprints, occupancy, and what may go where.
import { FURNITURE } from '../data/furniture.js';
import { ROOM_SIZES } from '../data/weapons.js';

/** Kinds the player always keeps (movable, never storable). */
export const FUNCTIONAL = new Set(['bed', 'forge', 'stove', 'coop']);
/** Floor items tall enough to cover the wall behind them. */
export const TALL_WALL = new Set(['bookshelf', 'clock', 'fireplace']);
/** North-wall slots covered by the Surface Express poster. */
export const POSTER_SLOTS = [1, 2];
/** West-wall slot holding the round window into the crystal cave. */
export const WINDOW_SLOTS = [2];
/** Where the fall broke through the ceiling (the light shaft lands here). */
export const HOLE = { x: 3.25, z: 3.45 };

export function roomSize(level) {
  return ROOM_SIZES[Math.max(0, Math.min(ROOM_SIZES.length - 1, level | 0))];
}

export function footprint(id, r = 0) {
  const [w, d] = FURNITURE[id]?.size || [1, 1];
  return r % 2 ? [d, w] : [w, d];
}

export const isWallHung = (id) => FURNITURE[id]?.kind === 'wall';
export const isRug = (id) => FURNITURE[id]?.kind === 'rug';
export const isStorable = (id) => !FUNCTIONAL.has(FURNITURE[id]?.kind);

export function doorTile(W, D) { return { x: 0, y: D - 2 }; }
/** West-wall slots covered by the door. */
export function doorSlots(W, D) { return [D - 2, D - 1]; }
/** Wall slots holding tunnel mouths (filled in by the home scene from the save). */
export const TUNNEL_SLOTS = { n: new Set(), w: new Set() };
/** West-wall slots nothing else may use (door + crystal window + tunnel mouths). */
export function reservedW(W, D) { return [...doorSlots(W, D), ...WINDOW_SLOTS, ...TUNNEL_SLOTS.w]; }
/** North-wall slots nothing else may use (poster + tunnel mouths). */
export function reservedN() { return [...POSTER_SLOTS, ...TUNNEL_SLOTS.n]; }

/**
 * Wall spots the mole can dig from (DEEP.md: wall 'n' z=0, 's' z=D, 'w' x=0, 'e' x=W; t = tile
 * center along the wall, x for n/s and z for e/w). Skips the door, poster, window and anything
 * hung on (or standing tall against) the wall. Returns [{wall, t, k, x, z, nx, nz}] where (x, z)
 * is the floor point in front of the wall and (nx, nz) points into the room.
 */
export function digSpots(placed, W, D) {
  const occ = occupancy(placed);
  const out = [];
  const rw = reservedW(W, D);
  for (let k = 0; k < W; k++) {
    if (!POSTER_SLOTS.includes(k) && !occ.wallN.has(k)) out.push({ wall: 'n', t: k + 0.5, k, x: k + 0.5, z: 0.42, nx: 0, nz: 1 });
    out.push({ wall: 's', t: k + 0.5, k, x: k + 0.5, z: D - 0.42, nx: 0, nz: -1 });
  }
  for (let k = 0; k < D; k++) {
    if (!rw.includes(k) && !occ.wallW.has(k)) out.push({ wall: 'w', t: k + 0.5, k, x: 0.42, z: k + 0.5, nx: 1, nz: 0 });
    out.push({ wall: 'e', t: k + 0.5, k, x: W - 0.42, z: k + 0.5, nx: -1, nz: 0 });
  }
  return out;
}

/** The floor tile in front of a wall spot. */
export function spotTile(s) { return { x: Math.floor(s.x), y: Math.floor(s.z) }; }

/** Tunnels from the save (deep scene owns them), normalized and deduplicated by wall + tile. */
export function tunnelList(data, extra = null) {
  const list = (data?.deep?.tunnels || []).concat(extra ? [extra] : []);
  const seen = new Set(), out = [];
  for (const tn of list) {
    if (!tn || !'nsew'.includes(tn.wall)) continue;
    const t = Number(tn.t);
    if (!isFinite(t)) continue;
    const key = tn.wall + Math.floor(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ wall: tn.wall, t: Math.floor(t) + 0.5 });
  }
  return out;
}

const key = (x, y) => x + ',' + y;

export function occupancy(placed, ignoreUid = null) {
  const floor = new Map(), rugs = new Map(), wallN = new Map(), wallW = new Map();
  for (const p of placed) {
    if (p.uid === ignoreUid) continue;
    const f = FURNITURE[p.id];
    if (!f) continue;
    if (f.kind === 'wall') {
      for (let k = 0; k < f.size[0]; k++) (p.r % 2 ? wallW : wallN).set(p.r % 2 ? p.y + k : p.x + k, p);
      continue;
    }
    const [fw, fd] = footprint(p.id, p.r);
    const m = f.kind === 'rug' ? rugs : floor;
    for (let dy = 0; dy < fd; dy++) for (let dx = 0; dx < fw; dx++) m.set(key(p.x + dx, p.y + dy), p);
    if (TALL_WALL.has(p.id)) {
      if (p.r === 0 && p.y === 0) for (let k = 0; k < fw; k++) wallN.set(p.x + k, p);
      if (p.r === 1 && p.x === 0) for (let k = 0; k < fd; k++) wallW.set(p.y + k, p);
    }
  }
  return { floor, rugs, wallN, wallW };
}

/** Can `id` go at (x,y) with rotation r? Returns {ok, reason}. */
export function canPlace(placed, W, D, id, x, y, r, ignoreUid = null) {
  const f = FURNITURE[id];
  if (!f) return { ok: false, reason: '?' };
  const occ = occupancy(placed, ignoreUid);
  const door = doorTile(W, D);
  if (f.kind === 'wall') {
    const w = f.size[0];
    if (r === 0) {
      if (y !== 0 || x < 0 || x + w > W) return { ok: false, reason: 'Hang it on a back wall' };
      const rn = reservedN();
      for (let k = 0; k < w; k++) if (occ.wallN.has(x + k) || rn.includes(x + k)) return { ok: false, reason: 'Wall space taken' };
      return { ok: true };
    }
    if (r === 1) {
      if (x !== 0 || y < 0 || y + w > D) return { ok: false, reason: 'Hang it on a back wall' };
      const ds = reservedW(W, D);
      for (let k = 0; k < w; k++) if (occ.wallW.has(y + k) || ds.includes(y + k)) return { ok: false, reason: 'Wall space taken' };
      return { ok: true };
    }
    return { ok: false, reason: 'Hang it on a back wall' };
  }
  const [fw, fd] = footprint(id, r);
  if (x < 0 || y < 0 || x + fw > W || y + fd > D) return { ok: false, reason: 'Out of the room' };
  for (let dy = 0; dy < fd; dy++) for (let dx = 0; dx < fw; dx++) {
    const tx = x + dx, ty = y + dy;
    if (tx === door.x && ty === door.y) return { ok: false, reason: 'Keep the door clear' };
    const k = key(tx, ty);
    if (f.kind === 'rug' ? occ.rugs.has(k) : occ.floor.has(k)) return { ok: false, reason: 'Something is in the way' };
  }
  if (f.onWall) {
    if (!(r === 0 && y === 0) && !(r === 1 && x === 0)) return { ok: false, reason: 'Goes against a back wall' };
    if (TALL_WALL.has(id)) {
      if (r === 0) { const rn = reservedN(); for (let k = 0; k < fw; k++) if (occ.wallN.has(x + k) || rn.includes(x + k)) return { ok: false, reason: 'Wall space taken' }; }
      if (r === 1) { const ds = reservedW(W, D); for (let k = 0; k < fd; k++) if (occ.wallW.has(y + k) || ds.includes(y + k)) return { ok: false, reason: 'Wall space taken' }; }
    }
  }
  return { ok: true };
}

/** Which placed item covers floor tile (x,y)? Non-rugs first. */
export function itemAt(placed, x, y) {
  let rug = null;
  for (const p of placed) {
    const f = FURNITURE[p.id];
    if (!f || f.kind === 'wall') continue;
    const [fw, fd] = footprint(p.id, p.r);
    if (x >= p.x && x < p.x + fw && y >= p.y && y < p.y + fd) {
      if (f.kind === 'rug') rug = rug || p;
      else return p;
    }
  }
  return rug;
}

/** Wall-hung item at a wall slot. wall: 'N' | 'W' */
export function wallItemAt(placed, wall, slot) {
  for (const p of placed) {
    const f = FURNITURE[p.id];
    if (!f) continue;
    const w = f.size[0];
    if (f.kind === 'wall') {
      if (wall === 'N' && p.r === 0 && slot >= p.x && slot < p.x + w) return p;
      if (wall === 'W' && p.r === 1 && slot >= p.y && slot < p.y + w) return p;
    }
  }
  return null;
}
