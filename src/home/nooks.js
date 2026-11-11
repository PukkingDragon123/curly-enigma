// The alcoves round Old Star's hollow that you dig out for yourself (expansions). The cave starts
// small: his hollow, your bedroll on its floor. When the lessons are over he lets you have the soft
// rock behind your bedroll (your sleeping alcove: the bedroll and your trunk move in there), and the
// other chalk-marked soft walls can be dug out later, from the Miners' Board's Home tab or with E
// at the chalk marks themselves: a storage nook, a workshop bay, a pantry. Each alcove is a natural
// chamber on the save's tile grid (units.js GRID; 0.5 m tiles): its floor is a rectangle of tiles
// you furnish, its rock walls stand on the rectangle's edges (wall pieces hang on them) and vault
// over; a short neck joins it to the hollow or to another alcove.
//
// The open set lives in the upgrade levels (state.data.upgrades[id] = 1; data/upgrades.js has the
// cards). Placement here replaces iso/homeLayout canPlace for the home: same rules, but per alcove
// (r picks the wall: 0 north, 1 west, 2 south, 3 east of the alcove the piece stands in).
import { FURNITURE } from '../data/furniture.js';
import { footprint, isWallHung, isStorable, TALL_WALL, WALL_OF_R } from '../iso/homeLayout.js';
import { T, GRID } from './units.js';

/**
 * The alcoves. rect: [x0, z0, x1, z1] in tiles (x1, z1 exclusive). neck: [x0, z0, x1, z1] in m (the
 * passage dug through to it). dig: where the chalked soft rock is (m) on the wall of `parent` (null:
 * the hollow), with the way into the rock (nx, nz). open: { wall: [slots] } of this alcove's walls the
 * neck comes through; parentOpen: the same on the parent's walls. look: what it's for (words).
 */
export const NOOKS = [
  {
    id: 'nook_bed', name: 'your sleeping alcove', title: 'Sleeping Alcove', parent: null,
    rect: [6, 1, 12, 6], neck: [4.05, -1.05, 4.95, 0.62], dig: { x: 4.5, z: -0.6, nx: 0, nz: 1 },
    open: { n: [8, 9] }, parentOpen: null, icon: 'bed_straw', cost: 50,
    desc: 'The soft rock behind your bedroll. A corner of your own: your bedroll and trunk move in.',
  },
  {
    id: 'nook_store', name: 'the storage nook', title: 'Storage Nook', parent: 'nook_bed',
    rect: [1, 1, 5, 6], neck: [2.35, 1.05, 3.15, 1.95], dig: { x: 3.0, z: 1.5, nx: -1, nz: 0 },
    open: { e: [2, 3] }, parentOpen: { w: [2, 3] }, icon: 'crate', cost: 400,
    desc: 'A dry pocket west of your alcove. Room for crates, a rack, whatever you hoard.',
  },
  {
    id: 'nook_work', name: 'the workshop bay', title: 'Workshop Bay', parent: null,
    rect: [13, 1, 18, 6], neck: [6.95, -1.05, 7.85, 0.62], dig: { x: 7.4, z: -0.6, nx: 0, nz: 1 },
    open: { n: [14, 15] }, parentOpen: null, icon: 'weapon_rack', cost: 1500,
    desc: 'A bay off the hollow by the lift: room to lay out tools, racks and benches.',
  },
  {
    id: 'nook_pantry', name: 'the pantry', title: 'Pantry', parent: 'nook_bed',
    rect: [7, 7, 11, 10], neck: [4.1, 2.85, 4.9, 3.65], dig: { x: 4.5, z: 3.0, nx: 0, nz: 1 },
    open: { n: [8, 9] }, parentOpen: { s: [8, 9] }, icon: 'planter', cost: 3500,
    desc: 'Cool rock south of your alcove: planters, jars and sacks keep down here.',
  },
];
export const NOOK = Object.fromEntries(NOOKS.map((n) => [n.id, n]));

/** The tiles of your sleeping alcove your own things stand on (bedroll, trunk, the ledge): kept out of the furniture. */
export const BED_TILES = [[11, 2], [11, 3], [11, 4], [11, 5], [10, 5]];

// ---------------------------------------------------------------- the open set
/** The alcoves dug out in this save: a Set of ids. */
export function openNooks(state) {
  const up = state?.data?.upgrades || {};
  return new Set(NOOKS.filter((n) => (up[n.id] || 0) >= 1).map((n) => n.id));
}

/** A short key for an open set (build caches). */
export function nookKey(set) { return NOOKS.filter((n) => set.has(n.id)).map((n) => n.id.slice(5, 7)).join('') || '-'; }
/** The set back from its key. */
export function nooksFromKey(key) { return new Set(NOOKS.filter((n) => String(key || '').includes(n.id.slice(5, 7))).map((n) => n.id)); }

/** Can it be dug now? (its parent is open and it isn't). */
export function diggable(id, set) { const n = NOOK[id]; return !!n && !set.has(id) && (!n.parent || set.has(n.parent)); }

/** Open an alcove in the save (no cost: the board or the dig pays). */
export function grantNook(state, id) {
  const d = state.data;
  d.upgrades ||= {};
  if ((d.upgrades[id] || 0) >= 1) return false;
  d.upgrades[id] = 1;
  state.dirty = true;
  return true;
}

// ---------------------------------------------------------------- the tiles
const R = (n) => ({ x0: n.rect[0], z0: n.rect[1], x1: n.rect[2], z1: n.rect[3] });

/** The open alcove whose floor holds tile (x, y), or null. */
export function nookAtTile(x, y, set) {
  for (const n of NOOKS) {
    if (!set.has(n.id)) continue;
    const r = R(n);
    if (x >= r.x0 && x < r.x1 && y >= r.z0 && y < r.z1) return n;
  }
  return null;
}

/** The open alcove (or its neck) at (x, z) meters, or null. */
export function nookAt(x, z, set, neck = true) {
  const n = nookAtTile(Math.floor(x / T), Math.floor(z / T), set);
  if (n) return n;
  if (neck) for (const q of NOOKS) if (set.has(q.id) && x >= q.neck[0] && x <= q.neck[2] && z >= q.neck[1] && z <= q.neck[3]) return q;
  return null;
}

/** Reserved slots on alcove n's wall `w` (the openings of its own neck and of the necks off it). */
function reserved(n, w) {
  const out = [...(n.open?.[w] || [])];
  for (const q of NOOKS) if (q.parent === n.id && q.parentOpen?.[w]) out.push(...q.parentOpen[w]);
  return out;
}

/** Floor tiles kept clear: in front of each opening (and the soft rock still to dig), your bedroll's corner. */
export function fixedTilesNooks() {
  const out = new Map();
  const put = (x, y, why) => out.set(x + ',' + y, why);
  for (const n of NOOKS) {
    const r = R(n);
    const front = (w, slots, why) => {
      for (const s of slots) {
        if (w === 'n') put(s, r.z0, why); else if (w === 's') put(s, r.z1 - 1, why);
        else if (w === 'w') put(r.x0, s, why); else put(r.x1 - 1, s, why);
      }
    };
    for (const [w, slots] of Object.entries(n.open || {})) front(w, slots, 'Keep the way through clear');
    for (const q of NOOKS) if (q.parent === n.id) for (const [w, slots] of Object.entries(q.parentOpen || {})) front(w, slots, 'Keep the chalked rock clear');
  }
  for (const [x, y] of BED_TILES) put(x, y, 'That\'s your bedroll\'s corner');
  return out;
}
const FIXED = fixedTilesNooks();

const key = (x, y) => x + ',' + y;

/** Which wall of alcove n a floor piece at (x, y) of size fw × fd stands against for rotation r (or null). */
function againstWall(r, x, y, fw, fd, n) {
  const q = R(n);
  if (r === 0 && y === q.z0) return 'n';
  if (r === 1 && x === q.x0) return 'w';
  if (r === 2 && y + fd === q.z1) return 's';
  if (r === 3 && x + fw === q.x1) return 'e';
  return null;
}

/** The line (fixed coordinate) of alcove n's wall w. */
function wallLine(n, w) { const q = R(n); return w === 'n' ? q.z0 : w === 's' ? q.z1 - 1 : w === 'w' ? q.x0 : q.x1 - 1; }

/** What covers what: floor tiles, rug tiles, and the walls' slots (keyed `${n.id}:${wall}:${slot}`). */
export function occupancyNooks(placed, set, ignoreUid = null) {
  const floor = new Map(), rugs = new Map(), walls = new Map();
  for (const p of placed) {
    if (p.uid === ignoreUid) continue;
    const f = FURNITURE[p.id];
    if (!f) continue;
    const r = ((p.r || 0) % 4 + 4) % 4;
    if (f.kind === 'wall') {
      const n = nookAtTile(p.x, p.y, set) || nookAtTile(p.x, p.y, ALL);
      if (!n) continue;
      const w = WALL_OF_R[r];
      for (let k = 0; k < f.size[0]; k++) walls.set(`${n.id}:${w}:${(w === 'n' || w === 's' ? p.x : p.y) + k}`, p);
      continue;
    }
    const [fw, fd] = footprint(p.id, r);
    const m = f.kind === 'rug' ? rugs : floor;
    for (let dy = 0; dy < fd; dy++) for (let dx = 0; dx < fw; dx++) m.set(key(p.x + dx, p.y + dy), p);
    if (TALL_WALL.has(p.id)) {
      const n = nookAtTile(p.x, p.y, ALL);
      const w = n && againstWall(r, p.x, p.y, fw, fd, n);
      if (w === 'n' || w === 's') for (let k = 0; k < fw; k++) walls.set(`${n.id}:${w}:${p.x + k}`, p);
      if (w === 'w' || w === 'e') for (let k = 0; k < fd; k++) walls.set(`${n.id}:${w}:${p.y + k}`, p);
    }
  }
  return { floor, rugs, walls };
}
const ALL = new Set(NOOKS.map((n) => n.id));

/** Can `id` go at tile (x, y) with rotation r in the open alcoves? { ok, reason }. */
export function canPlaceNooks(placed, set, id, x, y, r, ignoreUid = null) {
  const f = FURNITURE[id];
  if (!f) return { ok: false, reason: '?' };
  r = ((r || 0) % 4 + 4) % 4;
  const n = nookAtTile(x, y, set);
  if (!n) return { ok: false, reason: set.size ? 'Only in your own alcoves' : 'Dig yourself an alcove first' };
  const q = R(n);
  const occ = occupancyNooks(placed, set, ignoreUid);
  if (f.kind === 'wall') {
    const w = WALL_OF_R[r], along = w === 'n' || w === 's';
    if ((along ? y : x) !== wallLine(n, w)) return { ok: false, reason: 'Hang it on a wall' };
    const at = along ? x : y, lo = along ? q.x0 : q.z0, hi = along ? q.x1 : q.z1;
    if (at < lo || at + f.size[0] > hi) return { ok: false, reason: 'Hang it on a wall' };
    const res = reserved(n, w);
    for (let k = 0; k < f.size[0]; k++) if (occ.walls.has(`${n.id}:${w}:${at + k}`) || res.includes(at + k)) return { ok: false, reason: 'Wall space taken' };
    return { ok: true };
  }
  const [fw, fd] = footprint(id, r);
  if (x < q.x0 || y < q.z0 || x + fw > q.x1 || y + fd > q.z1) return { ok: false, reason: 'It won\'t fit in there' };
  for (let dy = 0; dy < fd; dy++) for (let dx = 0; dx < fw; dx++) {
    const k = key(x + dx, y + dy);
    if (FIXED.has(k)) return { ok: false, reason: FIXED.get(k) };
    if (f.kind === 'rug' ? occ.rugs.has(k) : occ.floor.has(k)) return { ok: false, reason: 'Something is in the way' };
  }
  if (f.onWall) {
    const w = againstWall(r, x, y, fw, fd, n);
    if (!w) return { ok: false, reason: 'Goes against a wall' };
    if (TALL_WALL.has(id)) {
      const res = reserved(n, w), along = w === 'n' || w === 's';
      const cnt = along ? fw : fd, at = along ? x : y;
      for (let k = 0; k < cnt; k++) if (occ.walls.has(`${n.id}:${w}:${at + k}`) || res.includes(at + k)) return { ok: false, reason: 'Wall space taken' };
    }
  }
  return { ok: true };
}

/** The nearest spot (to x0, y0) in the open alcoves where `id` fits, its rotation first; or null. */
export function findSpotNooks(placed, set, id, r0, uid, x0 = 0, y0 = 0) {
  const rs = isWallHung(id) ? [0, 1, 2, 3] : [r0, (r0 + 1) % 4, (r0 + 2) % 4, (r0 + 3) % 4];
  let best = null, bd = Infinity;
  for (const r of rs) for (let y = 0; y < GRID.D; y++) for (let x = 0; x < GRID.W; x++) {
    const d = Math.hypot(x - x0, y - y0) + (r === r0 ? 0 : 0.5);
    if (d >= bd) continue;
    if (canPlaceNooks(placed, set, id, x, y, r, uid).ok) { best = { x, y, r }; bd = d; }
  }
  return best;
}

/** The placed wall piece on alcove wall `w` at slot `slot` (the alcove holding tile (tx, ty)). */
export function wallItemAtNooks(placed, set, tx, ty, w, slot) {
  const n = nookAtTile(tx, ty, set);
  if (!n) return null;
  for (const p of placed) {
    const f = FURNITURE[p.id];
    if (!f || f.kind !== 'wall' || WALL_OF_R[((p.r || 0) % 4 + 4) % 4] !== w) continue;
    if (nookAtTile(p.x, p.y, set) !== n) continue;
    const at = w === 'n' || w === 's' ? p.x : p.y;
    if (slot >= at && slot < at + f.size[0]) return p;
  }
  return null;
}

/** The alcove's rect in tiles: { x0, z0, x1, z1 }. */
export function nookRect(n) { return R(n); }

// ---------------------------------------------------------------- old saves
/**
 * [home6] Home used to be a camp plus a whole bedroom (10×8 tiles and up). On the first visit with
 * this version: the straw bed is your bedroll now (it comes off the floor plan), saves past the
 * lessons get your sleeping alcove, a save that had furnished its room gets the alcoves its room
 * was worth (and as many more as its furniture needs), every piece is set back down in them, and
 * whatever still won't fit goes into storage (build mode's strip), never lost. Returns what it did.
 */
export function migrateHome(state, { lessonsOver }) {
  const d = state.data, home = d.home;
  if (!home || state.flag('home6')) return null;
  state.flag('home6', true);
  const log = { granted: [], moved: 0, stored: [] };
  home.placed = (home.placed || []).filter((p) => p && FURNITURE[p.id]);
  // the straw bed: you sleep on the bedroll on the floor now; the bed goes into storage (nothing is lost)
  for (const p of home.placed.filter((q) => q.id === 'bed_straw')) { d.furniture ||= {}; d.furniture[p.id] = (d.furniture[p.id] || 0) + 1; log.stored.push(p.id); }
  home.placed = home.placed.filter((p) => p.id !== 'bed_straw');
  const decorated = home.placed.filter((p) => !['forge', 'stove'].includes(FURNITURE[p.id]?.kind));
  // the old room's size in alcoves: a furnished room was worth your alcove and the storage nook, an
  // extension (home.level) more digging; a save past the lessons gets your alcove at least
  const lvl = home.level | 0;
  const want = [];
  if (lessonsOver || decorated.length || lvl) want.push('nook_bed');
  if (decorated.length || lvl) want.push('nook_store');
  if (lvl >= 1) want.push('nook_work');
  if (lvl >= 2) want.push('nook_pantry');
  for (const id of want) if (grantNook(state, id)) log.granted.push(id);
  const set = openNooks(state);
  // set every piece down where it fits (the old room's tiles don't mean anything in the cave)
  const keep = [];
  const order = [...decorated].sort((a, b) => sizeOf(b) - sizeOf(a));
  for (const p of order) {
    let spot = canPlaceNooks(keep, set, p.id, p.x, p.y, p.r || 0, p.uid).ok ? { x: p.x, y: p.y, r: p.r || 0 } : findSpotNooks(keep, set, p.id, p.r || 0, p.uid, 8, 3);
    // still no room: another alcove (for an old save that had a lot), then storage
    while (!spot) {
      const next = NOOKS.find((n) => diggable(n.id, set));
      if (!next) break;
      grantNook(state, next.id); set.add(next.id); log.granted.push(next.id);
      spot = findSpotNooks(keep, set, p.id, p.r || 0, p.uid, 8, 3);
    }
    if (spot) { p.x = spot.x; p.y = spot.y; p.r = spot.r; keep.push(p); log.moved++; continue; }
    d.furniture ||= {};
    d.furniture[p.id] = (d.furniture[p.id] || 0) + 1;
    log.stored.push(p.id);
    if (home.planters?.[p.uid]) { const pl = home.planters[p.uid]; if (pl?.id) state.addItem?.(pl.id, { spill: true, n: 1 }); delete home.planters[p.uid]; }
  }
  // (the forge and the stove have been Old Star's for a long time)
  home.placed = keep;
  state.dirty = true;
  return log;
}
const sizeOf = (p) => { const s = FURNITURE[p.id]?.size || [1, 1]; return s[0] * s[1]; };

/** Re-seat placed pieces that no longer fit the open alcoves (to storage if there's no room). Returns true if anything moved. */
export function reseatNooks(state, set) {
  const home = state.data.home;
  let changed = false;
  for (const p of [...home.placed]) {
    if (!FURNITURE[p.id]) continue;
    if (canPlaceNooks(home.placed, set, p.id, p.x, p.y, p.r || 0, p.uid).ok) continue;
    const spot = findSpotNooks(home.placed, set, p.id, p.r || 0, p.uid, p.x, p.y);
    if (spot) { p.x = spot.x; p.y = spot.y; p.r = spot.r; changed = true; continue; }
    home.placed.splice(home.placed.indexOf(p), 1);
    state.data.furniture ||= {};
    state.data.furniture[p.id] = (state.data.furniture[p.id] || 0) + 1;
    changed = true;
  }
  return changed;
}

export { isStorable };
