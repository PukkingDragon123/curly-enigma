// Home placement rules: footprints, occupancy, and what may go where.
import { FURNITURE } from '../data/furniture.js';
import { ROOM_SIZES } from '../data/weapons.js';

/** Kinds the player always keeps (movable, never storable). */
export const FUNCTIONAL = new Set(['bed', 'forge', 'stove', 'coop']);
/** Floor items tall enough to cover the wall behind them. */
export const TALL_WALL = new Set(['bookshelf', 'clock', 'fireplace']);
/** North-wall slots covered by the Surface Express poster. */
export const POSTER_SLOTS = [1, 2];

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
      for (let k = 0; k < w; k++) if (occ.wallN.has(x + k) || POSTER_SLOTS.includes(x + k)) return { ok: false, reason: 'Wall space taken' };
      return { ok: true };
    }
    if (r === 1) {
      if (x !== 0 || y < 0 || y + w > D) return { ok: false, reason: 'Hang it on a back wall' };
      const ds = doorSlots(W, D);
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
      if (r === 0) for (let k = 0; k < fw; k++) if (occ.wallN.has(x + k) || POSTER_SLOTS.includes(x + k)) return { ok: false, reason: 'Wall space taken' };
      if (r === 1) { const ds = doorSlots(W, D); for (let k = 0; k < fd; k++) if (occ.wallW.has(y + k) || ds.includes(y + k)) return { ok: false, reason: 'Wall space taken' }; }
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
