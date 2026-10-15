// Home placement rules: footprints, occupancy, and what may go where. The burrow is a grid of
// tiles (W × D, see roomSize); in first person every one of its four walls is real, so wall
// pieces hang on any wall: rotation r picks the wall (0 north, 1 west, 2 south, 3 east), and
// floor pieces that stand against a wall (fireplace, bookshelf, clock) do the same. A few tiles
// are kept clear: the door to town, the lift in the south-east corner, the build bench and the
// floor in front of every tunnel mouth.
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
/** The lift cage: 2 × 2 tiles in the south-east corner. */
export function liftTiles(W, D) { return { x: W - 2, y: D - 2, w: 2, d: 2 }; }
/** The build bench against the east wall. */
export function benchTiles(W, D) { return { x: W - 1, y: 2, w: 1, d: 2 }; }
/** Wall slots holding tunnel mouths (filled in by the home scene from the save). */
export const TUNNEL_SLOTS = { n: new Set(), w: new Set(), s: new Set(), e: new Set() };
/** Slots nothing else may use, per wall. */
export function reservedW(W, D) { return [...doorSlots(W, D), ...WINDOW_SLOTS, ...TUNNEL_SLOTS.w]; }
export function reservedN() { return [...POSTER_SLOTS, ...TUNNEL_SLOTS.n]; }
export function reservedS(W, D) { return [W - 2, W - 1, ...TUNNEL_SLOTS.s]; }
export function reservedE(W, D) { const b = benchTiles(W, D); return [D - 2, D - 1, b.y, b.y + 1, ...TUNNEL_SLOTS.e]; }
const RESERVED = { n: (W, D) => reservedN(), w: reservedW, s: reservedS, e: reservedE };
/** Wall for a wall-piece rotation, and the rotation that faces into the room from a wall. */
export const WALL_OF_R = ['n', 'w', 's', 'e'];
export const R_OF_WALL = { n: 0, w: 1, s: 2, e: 3 };

/** Floor tiles nothing may stand on: door, lift, bench and the tiles in front of tunnel mouths. */
export function fixedTiles(W, D) {
  const out = new Map();
  const put = (x, y, why) => out.set(x + ',' + y, why);
  put(0, D - 2, 'Keep the door clear'); put(0, D - 1, 'Keep the door clear');
  const L = liftTiles(W, D);
  for (let y = L.y; y < L.y + L.d; y++) for (let x = L.x; x < L.x + L.w; x++) put(x, y, 'That\'s the lift');
  for (let x = L.x; x < L.x + L.w; x++) put(x, L.y - 1, 'Keep the lift gate clear');
  const B = benchTiles(W, D);
  for (let y = B.y; y < B.y + B.d; y++) put(B.x, y, 'That\'s the build bench');
  for (const k of TUNNEL_SLOTS.n) put(k, 0, 'Keep the tunnel clear');
  for (const k of TUNNEL_SLOTS.s) put(k, D - 1, 'Keep the tunnel clear');
  for (const k of TUNNEL_SLOTS.w) put(0, k, 'Keep the tunnel clear');
  for (const k of TUNNEL_SLOTS.e) put(W - 1, k, 'Keep the tunnel clear');
  return out;
}

/**
 * Wall spots the mole can dig from (DEEP.md: wall 'n' z=0, 's' z=D, 'w' x=0, 'e' x=W; t = tile
 * centre along the wall, x for n/s and z for e/w). Skips the corners, the door, poster, window,
 * lift, bench, anything hung on (or standing tall against) the wall, and the slots right next to a
 * tunnel mouth. Returns [{wall, t, k, x, z, nx, nz}] where (x, z) is the floor point in front of
 * the wall (tiles) and (nx, nz) points into the room. tunnels: [{wall, t}] (existing mouths are
 * included, flagged `tunnel: true`).
 */
export function digSpots(placed, W, D, tunnels = []) {
  const occ = occupancy(placed, null, W, D);
  const out = [];
  const near = (wall, k) => tunnels.some((tn) => tn.wall === wall && Math.abs(Math.floor(tn.t) - k) === 1);
  const isT = (wall, k) => tunnels.some((tn) => tn.wall === wall && Math.floor(tn.t) === k);
  const add = (wall, len, mk) => {
    const res = RESERVED[wall](W, D);
    const used = occ['wall' + wall.toUpperCase()];
    for (let k = 0; k < len; k++) {
      const tunnel = isT(wall, k);
      if (!tunnel && (k === 0 || k === len - 1 || res.includes(k) || used.has(k) || near(wall, k))) continue;
      out.push({ wall, t: k + 0.5, k, tunnel, ...mk(k + 0.5) });
    }
  };
  add('n', W, (t) => ({ x: t, z: 0.42, nx: 0, nz: 1 }));
  add('s', W, (t) => ({ x: t, z: D - 0.42, nx: 0, nz: -1 }));
  add('w', D, (t) => ({ x: 0.42, z: t, nx: 1, nz: 0 }));
  add('e', D, (t) => ({ x: W - 0.42, z: t, nx: -1, nz: 0 }));
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

/** Which wall a floor piece stands against for rotation r (or null). */
function againstWall(r, x, y, fw, fd, W, D) {
  if (r === 0 && y === 0) return 'n';
  if (r === 1 && x === 0) return 'w';
  if (r === 2 && W !== undefined && y + fd === D) return 's';
  if (r === 3 && W !== undefined && x + fw === W) return 'e';
  return null;
}

/**
 * What covers what: floor tiles, rug tiles and the four walls' slots. W, D let pieces against the
 * south and east walls count (older callers without them only see the north and west walls).
 */
export function occupancy(placed, ignoreUid = null, W, D) {
  const floor = new Map(), rugs = new Map(), wallN = new Map(), wallW = new Map(), wallS = new Map(), wallE = new Map();
  const walls = { n: wallN, w: wallW, s: wallS, e: wallE };
  for (const p of placed) {
    if (p.uid === ignoreUid) continue;
    const f = FURNITURE[p.id];
    if (!f) continue;
    const r = p.r || 0;
    if (f.kind === 'wall') {
      const wall = WALL_OF_R[r % 4];
      for (let k = 0; k < f.size[0]; k++) walls[wall].set(wall === 'n' || wall === 's' ? p.x + k : p.y + k, p);
      continue;
    }
    const [fw, fd] = footprint(p.id, r);
    const m = f.kind === 'rug' ? rugs : floor;
    for (let dy = 0; dy < fd; dy++) for (let dx = 0; dx < fw; dx++) m.set(key(p.x + dx, p.y + dy), p);
    if (TALL_WALL.has(p.id)) {
      const wall = againstWall(r, p.x, p.y, fw, fd, W, D);
      if (wall === 'n' || wall === 's') for (let k = 0; k < fw; k++) walls[wall].set(p.x + k, p);
      if (wall === 'w' || wall === 'e') for (let k = 0; k < fd; k++) walls[wall].set(p.y + k, p);
    }
  }
  return { floor, rugs, wallN, wallW, wallS, wallE };
}

/** Can `id` go at (x,y) with rotation r? Returns {ok, reason}. */
export function canPlace(placed, W, D, id, x, y, r, ignoreUid = null) {
  const f = FURNITURE[id];
  if (!f) return { ok: false, reason: '?' };
  r = ((r || 0) % 4 + 4) % 4;
  const occ = occupancy(placed, ignoreUid, W, D);
  const walls = { n: occ.wallN, w: occ.wallW, s: occ.wallS, e: occ.wallE };
  if (f.kind === 'wall') {
    const w = f.size[0], wall = WALL_OF_R[r];
    const along = wall === 'n' || wall === 's';
    const at = along ? x : y, len = along ? W : D;
    const fixedOK = wall === 'n' ? y === 0 : wall === 's' ? y === D - 1 : wall === 'w' ? x === 0 : x === W - 1;
    if (!fixedOK || at < 0 || at + w > len) return { ok: false, reason: 'Hang it on a wall' };
    const res = RESERVED[wall](W, D);
    for (let k = 0; k < w; k++) if (walls[wall].has(at + k) || res.includes(at + k)) return { ok: false, reason: 'Wall space taken' };
    return { ok: true };
  }
  const [fw, fd] = footprint(id, r);
  if (x < 0 || y < 0 || x + fw > W || y + fd > D) return { ok: false, reason: 'Out of the room' };
  const fixed = fixedTiles(W, D);
  for (let dy = 0; dy < fd; dy++) for (let dx = 0; dx < fw; dx++) {
    const tx = x + dx, ty = y + dy;
    const k = key(tx, ty);
    if (fixed.has(k)) return { ok: false, reason: fixed.get(k) };
    if (f.kind === 'rug' ? occ.rugs.has(k) : occ.floor.has(k)) return { ok: false, reason: 'Something is in the way' };
  }
  if (f.onWall) {
    const wall = againstWall(r, x, y, fw, fd, W, D);
    if (!wall) return { ok: false, reason: 'Goes against a wall' };
    if (TALL_WALL.has(id)) {
      const res = RESERVED[wall](W, D);
      const along = wall === 'n' || wall === 's';
      const n = along ? fw : fd, at = along ? x : y;
      for (let k = 0; k < n; k++) if (walls[wall].has(at + k) || res.includes(at + k)) return { ok: false, reason: 'Wall space taken' };
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

/** Wall-hung item at a wall slot. wall: 'N' | 'W' | 'S' | 'E' (or lower case). */
export function wallItemAt(placed, wall, slot) {
  const w0 = String(wall).toLowerCase();
  for (const p of placed) {
    const f = FURNITURE[p.id];
    if (!f || f.kind !== 'wall') continue;
    if (WALL_OF_R[(p.r || 0) % 4] !== w0) continue;
    const at = w0 === 'n' || w0 === 's' ? p.x : p.y;
    if (slot >= at && slot < at + f.size[0]) return p;
  }
  return null;
}
