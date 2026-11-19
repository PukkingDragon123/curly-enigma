// The slot inventory (Minecraft-like). What the mole carries is ONE array of slots: the hotbar
// first (HOT slots: the belt at the bottom of the screen, keys 1–9), then the pack (rows of nine).
// State keeps its public item API (addItem, count, removeItem, removeLot, lotsOf, inventory,
// addWeapon, removeWeapon, buy, sell*) and delegates the carried items to this module.
//
// A slot is null or:
//   { id, n }                                plain stackables (food, plants, supplies, blocks...)
//   { id, lots: [{ uid, id, q, p }, ...] }   quality items. Ingots stack; ore, gems and clumps
//                                            (cat 'mineral' / 'gem') never do: one per slot
//   { id: 'weapon', w: weapon }              a forged weapon (one per slot)
//   { tool: 'pick' }                         hotbar only: a tool from the rack hung on the belt.
//                                            Tools, gear, blueprints, floors, wall styles and key
//                                            items don't take slots (state.data.owned), nor does
//                                            unplaced furniture (state.data.furniture)
// New things go into the pack first, then into free belt slots; a snack, a blast or glow stakes go
// onto the belt first when nothing of their kind hangs there yet (handFirst).
//
// Save data:
//   data.inv   = { v: 2, slots: [...] }   belt (HOT) + pack (bagPockets()); v1 (a grid pack and a
//                                         kinds-only hotbar in data.hotbar) is migrated on load
//   data.stash = { slots: [...] }         the trunk at home: whatever doesn't fit lands here (it
//                                         grows as needed), so nothing is ever lost
// data.lots / data.counts / data.weapons stay as read-only mirrors of the carried items (rebuilt
// after every change), so code that reads them keeps working; never write to them directly.
import { ITEMS } from '../data/items.js';
import { uid as mkUid } from './util.js';
import * as W from './weight.js';

export const COLS = 9; // slots per row (pack, trunk, chests)
export const HOT = 9; // belt slots (the first HOT slots of the carried array)
export const PACK_BASE = 18; // a new mole's pack: two rows
export const MAX_PACK = 72;
/** Tool kinds that hang on the belt as references (the tool itself stays on the rack). */
export const REF_KINDS = ['pick', 'chisel', 'brush', 'drill', 'xray', 'build'];
/** A new game's belt. */
export const HOT_DEFAULT = ['pick', 'chisel', 'build'];

const OWNED = new Set(['tool', 'equip', 'blueprint', 'floor', 'wallpaper', 'key']);
const ONE = new Set(['mineral', 'gem']); // ore, gems, clumps: one per slot
const STACK_BY_CAT = { ingot: 4, plant: 16, critter: 8, drop: 16, ingredient: 16, food: 8, consumable: 10 };
/** Sort order of categories in a tidied container. */
const CAT_ORDER = ['weapon', 'gem', 'mineral', 'ingot', 'consumable', 'food', 'ingredient', 'plant', 'critter', 'drop'];

/** Does this item live in slots? (false for tools, gear, blueprints, floors, keys, furniture) */
export function slotted(id) {
  if (id === 'weapon') return true;
  const it = ITEMS[id];
  return !!it && !OWNED.has(it.cat) && it.cat !== 'furniture';
}
/** How many fit in one slot. Ore and gems: one. Other items may set `stack` in items.js. */
export function stackMax(id) {
  if (id === 'weapon') return 1;
  const it = ITEMS[id];
  if (ONE.has(it?.cat)) return 1;
  return it?.stack ?? STACK_BY_CAT[it?.cat] ?? 16;
}
export const isQ = (id) => !!ITEMS[id]?.q;
export const isRef = (s) => !!s?.tool;

/** What a slot does in the paw: a tool kind, 'food', 'dynamite', 'stake', or null (just held). */
export function kindOf(s) {
  if (!s) return null;
  if (s.tool) return s.tool;
  if (s.w) return null;
  const it = ITEMS[s.id];
  if (!it) return null;
  if (it.blast) return 'dynamite';
  if (s.id === 'glow_stake') return 'stake';
  if (it.cat === 'food' || it.food) return 'food';
  return null;
}

// ---------------------------------------------------------------- stacks
export function stackN(s) { return !s ? 0 : s.tool || s.w ? 1 : s.lots ? s.lots.length : s.n || 0; }
/** Average quality of a stack (quality items), else null. */
export function stackQ(s) {
  if (!s || !s.lots || !s.lots.length) return null;
  return Math.round(s.lots.reduce((a, l) => a + l.q, 0) / s.lots.length);
}
export function stackPristine(s) { return !!s?.lots?.some((l) => l.p); }
export const stackFull = (s) => stackN(s) >= stackMax(s.id);
export const sameKind = (a, b) => !!a && !!b && !a.w && !b.w && !a.tool && !b.tool && a.id === b.id;
const units = (s) => s.w || s.lots || s.n;
const leftN = (left) => (left == null ? 0 : Array.isArray(left) ? left.length : typeof left === 'number' ? left : 1);

/** A copy of a stack (lots are shared objects; weapons are moved, not copied). */
export function cloneStack(s) {
  if (!s) return null;
  if (s.tool) return { tool: s.tool };
  if (s.w) return { id: 'weapon', w: s.w };
  if (s.lots) return { id: s.id, lots: s.lots.slice() };
  return { id: s.id, n: s.n };
}

// ---------------------------------------------------------------- containers
const range = (a, b) => { const out = []; for (let i = a; i < b; i++) out.push(i); return out; };
/** Should a new stack of this item go onto the belt first? (a snack/blast/stakes with none there) */
function handFirst(slots, id) {
  const H = slots.hot || 0;
  if (!H) return false;
  const k = kindOf({ id });
  if (!k || (k === 'food' && ITEMS[id]?.cat !== 'food')) return false;
  for (let i = 0; i < H; i++) if (kindOf(slots[i]) === k) return false;
  return true;
}
/** Slot indices new stacks fill, in order: the pack, then the belt (hand items: the belt first). */
export function fillOrder(slots, cap, id) {
  const H = Math.min(slots.hot || 0, cap);
  if (!H) return range(0, cap);
  const hot = range(0, H), pack = range(H, cap);
  return handFirst(slots, id) ? hot.concat(pack) : pack.concat(hot);
}
/** Units of `id` that fit in the first `cap` slots (or just in the slots `idx`). */
export function roomFor(slots, id, cap = slots.length, idx = null) {
  const max = stackMax(id), probe = { id };
  let room = 0;
  const each = (i) => { const s = slots[i]; if (!s) room += max; else if (sameKind(s, probe)) room += Math.max(0, max - stackN(s)); };
  if (idx) idx.forEach(each); else for (let i = 0; i < cap; i++) each(i);
  return room;
}
/** A new stack goes into the first empty slot (in fill order): its index, or -1. */
function newStack(slots, cap, s, idx = fillOrder(slots, cap, s.id)) {
  for (const i of idx) if (!slots[i]) { slots[i] = s; return i; }
  return -1;
}
export function usedSlots(slots) { let n = 0; for (const s of slots) if (s && !s.tool) n++; return n; }
export function countIn(slots, id) { let n = 0; for (const s of slots) if (s && !s.tool && s.id === id) n += stackN(s); return n; }
export function lotsIn(slots, id) { const out = []; for (const s of slots) if (s && s.lots && s.id === id) out.push(...s.lots); return out; }

/**
 * Put units into a container: `units` is a count (plain items), an array of lots (quality items)
 * or a weapon object. Fills partial stacks first (belt first), then empty slots (fill order, or
 * just the slots in `idx`). Returns what didn't fit, in the same form (0 / [] / null when it all went in).
 */
export function putIn(slots, id, units, cap = slots.length, idx = null) {
  const max = stackMax(id);
  const order = idx || fillOrder(slots, cap, id);
  const merge = idx ? idx.slice().sort((a, b) => a - b) : range(0, Math.min(cap, slots.length));
  if (id === 'weapon') return newStack(slots, cap, { id: 'weapon', w: units }, order) >= 0 ? null : units;
  if (Array.isArray(units)) {
    let left = units.slice();
    for (const i of merge) {
      if (!left.length) break;
      const s = slots[i];
      if (s && s.lots && s.id === id && s.lots.length < max) { const k = Math.min(max - s.lots.length, left.length); s.lots.push(...left.splice(0, k)); }
    }
    while (left.length) {
      if (newStack(slots, cap, { id, lots: left.slice(0, max) }, order) < 0) break;
      left.splice(0, max);
    }
    return left;
  }
  let left = units;
  for (const i of merge) {
    if (left <= 0) break;
    const s = slots[i];
    if (s && !s.w && !s.tool && !s.lots && s.id === id && s.n < max) { const k = Math.min(max - s.n, left); s.n += k; left -= k; }
  }
  while (left > 0) {
    const k = Math.min(max, left);
    if (newStack(slots, cap, { id, n: k }, order) < 0) break;
    left -= k;
  }
  return left;
}

/**
 * Take n units of `id` out of a container. Quality items: the best lots first (lowFirst: the
 * worst), returns the lots; plain items: from the last stacks first (the pack before the belt),
 * returns the count.
 */
export function takeFrom(slots, id, n, { lowFirst = false } = {}) {
  if (isQ(id)) {
    const all = [];
    slots.forEach((s, i) => { if (s && s.lots && s.id === id) for (const l of s.lots) all.push([l, i]); });
    all.sort((a, b) => (lowFirst ? a[0].q - b[0].q : b[0].q - a[0].q));
    const take = all.slice(0, Math.max(0, n));
    const set = new Set(take.map(([l]) => l));
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s || !s.lots || s.id !== id) continue;
      s.lots = s.lots.filter((l) => !set.has(l));
      if (!s.lots.length) slots[i] = null;
    }
    return take.map(([l]) => l);
  }
  let left = n, got = 0;
  for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
    const s = slots[i];
    if (!s || s.w || s.tool || s.id !== id) continue;
    const k = Math.min(s.n, left);
    s.n -= k; left -= k; got += k;
    if (s.n <= 0) slots[i] = null;
  }
  return got;
}

/** Split a stack: take k units off slot i, returned as a new stack (the slot keeps the rest). */
export function splitStack(slots, i, k) {
  const s = slots[i];
  if (!s || s.w || s.tool) return null;
  const n = stackN(s);
  k = Math.max(1, Math.min(n, k | 0));
  if (k >= n) { slots[i] = null; return s; }
  if (s.lots) {
    // hand over a fair share of the qualities: alternate best/worst so both halves average the same
    const sorted = s.lots.slice().sort((a, b) => b.q - a.q);
    const out = [], keep = [];
    sorted.forEach((l, j) => ((j % 2 === 0 && out.length < k) || keep.length >= n - k ? out : keep).push(l));
    s.lots = keep;
    return { id: s.id, lots: out };
  }
  s.n -= k;
  return { id: s.id, n: k };
}

/**
 * Drop a held stack onto slot j of a container. Merges into the same item (up to the stack
 * size), swaps with a different item, fills an empty slot. Returns what's still held (null when
 * it all went in).
 */
export function dropOn(slots, j, held) {
  if (!held) return null;
  const t = slots[j];
  if (!t) { slots[j] = held; return null; }
  if (sameKind(t, held)) {
    const room = stackMax(t.id) - stackN(t);
    if (room <= 0) { slots[j] = held; return t; } // full: swap
    if (held.lots) {
      const k = Math.min(room, held.lots.length);
      t.lots.push(...held.lots.splice(0, k));
      return held.lots.length ? held : null;
    }
    const k = Math.min(room, held.n);
    t.n += k; held.n -= k;
    return held.n > 0 ? held : null;
  }
  slots[j] = held;
  return t;
}

/** Merge partial stacks and order them (category, value, quality). The belt stays as it is. */
export function tidy(slots, cap = slots.length) {
  const from = Math.min(slots.hot || 0, cap);
  const weapons = [], plain = new Map(), qual = new Map();
  for (let i = from; i < cap; i++) {
    const s = slots[i];
    if (!s) continue;
    if (s.tool) continue;
    if (s.w) weapons.push(s);
    else if (s.lots) { if (!qual.has(s.id)) qual.set(s.id, []); qual.get(s.id).push(...s.lots); }
    else plain.set(s.id, (plain.get(s.id) || 0) + s.n);
    slots[i] = null;
  }
  const order = (id) => {
    const it = ITEMS[id];
    const c = CAT_ORDER.indexOf(id === 'weapon' ? 'weapon' : it?.cat);
    return (c < 0 ? 99 : c) * 1e7 - Math.min(9.9e6, it?.value || 0);
  };
  const out = [];
  weapons.sort((a, b) => (b.w.value || 0) - (a.w.value || 0)).forEach((s) => out.push(s));
  const ids = [...new Set([...qual.keys(), ...plain.keys()])].sort((a, b) => order(a) - order(b));
  for (const id of ids) {
    const max = stackMax(id);
    if (qual.has(id)) {
      const lots = qual.get(id).sort((a, b) => b.q - a.q);
      for (let k = 0; k < lots.length; k += max) out.push({ id, lots: lots.slice(k, k + max) });
    } else {
      let n = plain.get(id);
      while (n > 0) { const k = Math.min(max, n); out.push({ id, n: k }); n -= k; }
    }
  }
  let j = from;
  const over = [];
  for (const s of out) {
    while (j < cap && slots[j]) j++;
    if (j < cap) slots[j++] = s; else over.push(s);
  }
  return over;
}

/** Grouped view of a container: [{ id, n, avgQ?, lots? }] like state.inventory(). */
export function groups(slots, filter = () => true) {
  const map = new Map();
  for (const s of slots) {
    if (!s || s.w || s.tool) continue;
    const it = ITEMS[s.id];
    if (!filter(it)) continue;
    let g = map.get(s.id);
    if (!g) { g = { id: s.id, n: 0 }; if (s.lots) g.lots = []; map.set(s.id, g); }
    if (s.lots) g.lots.push(...s.lots);
    g.n += stackN(s);
  }
  const out = [...map.values()];
  for (const g of out) if (g.lots) g.avgQ = Math.round(g.lots.reduce((a, l) => a + l.q, 0) / Math.max(1, g.lots.length));
  return out;
}

// ---------------------------------------------------------------- the backpack on the state
// Test URLs: `?bag=N` gives the pack N slots, and `?give=...` (which hands out 5 of each item at
// start) lifts it to the maximum, so test setups never lose items to a full bag.
let DEV_BAG = 0;
try {
  const q = new URLSearchParams(globalThis.location?.search || '');
  if (q.has('bag')) DEV_BAG = Math.max(1, Math.min(MAX_PACK, parseInt(q.get('bag'), 10) || 0));
  else if (q.has('give')) DEV_BAG = MAX_PACK;
} catch (e) { /* no location (worker) */ }

/**
 * The pack's slots (not counting the belt): two rows for the Burlap Sack and a row more for each
 * bigger bag (items.js `slots` + 9), + Deeper Pockets (a slot a level), + the Carry skill, + a
 * packed lunch. bagIt: price a bag you might equip instead.
 */
export function bagPockets(state, bagIt = state.equipped?.('bag')) {
  if (DEV_BAG) return DEV_BAG;
  let n = COLS + (bagIt?.slots ?? 9);
  n += Math.floor((state.upEffect?.('bag') || 0) / 2);
  const carry = state.skill?.('carry') || 1;
  if (carry > 1) n += Math.round((carry - 1) * COLS);
  if (state.hasBuff?.('pack')) n += 1; // a packed lunch tied on: one more slot while it lasts
  return Math.max(1, Math.min(MAX_PACK, n));
}
/** Every carried slot: the belt + the pack (the slot array is this long). */
export function bagSlots(state) { return HOT + bagPockets(state); }

function markHot(s) {
  if (s.hot !== HOT) Object.defineProperty(s, 'hot', { value: HOT, configurable: true, writable: true, enumerable: false });
  return s;
}
/** The carried slot array (belt first, then the pack; grown to the current bag size). */
export function bag(state) {
  const d = state.data;
  if (!d.inv || !Array.isArray(d.inv.slots)) d.inv = defaultInv();
  const s = d.inv.slots;
  const cap = bagSlots(state);
  while (s.length < cap) s.push(null);
  // empty slots past the bag's size go away (anything still in them is moved in by sync())
  while (s.length > cap && !s[s.length - 1]) s.pop();
  return markHot(s);
}
export function stash(state) {
  const d = state.data;
  if (!d.stash || !Array.isArray(d.stash.slots)) d.stash = { slots: [] };
  return d.stash.slots;
}

/** Rebuild the read-only mirrors (data.lots, data.counts, data.weapons) from the carried slots. */
export function sync(state) {
  const d = state.data;
  const lots = [], counts = {}, weapons = [];
  const b = bag(state);
  if (b.length > bagSlots(state)) settle(state, b);
  for (const s of b) {
    if (!s || s.tool) continue;
    if (s.w) weapons.push(s.w);
    else if (s.lots) lots.push(...s.lots);
    else counts[s.id] = (counts[s.id] || 0) + s.n;
  }
  d.lots = lots; d.counts = counts; d.weapons = weapons;
}

/** Stacks past the bag's size (a smaller bag, a lunch eaten) move into free slots, else to the trunk. */
function settle(state, b) {
  const cap = bagSlots(state);
  const out = b.splice(cap);
  for (const s of out) {
    if (!s || s.tool) continue;
    const left = putIn(b, s.id, units(s), cap);
    const n = leftN(left);
    if (n > 0) { stashPut(state, s.id, left); state.emit?.('stash', { id: s.id, n }); }
  }
}

/** Will n of this item fit in the backpack right now? (always true for things without slots) */
export function canAdd(state, id, n = 1) {
  if (!slotted(id)) return !!ITEMS[id];
  return roomFor(bag(state), id, bagSlots(state)) >= n;
}
/** The mole's load: { kg, carry, r, speed, jump, run, tier, max } (core/weight.js). */
export function bagLoad(state) { return W.moleLoad(state, bag(state).slice(0, bagSlots(state))); }
/** Can the mole lift n more of this item (by weight: up to twice what it carries comfortably)? */
export function canLift(state, id, n = 1) { return !slotted(id) || W.canLift(state, bag(state), id, n); }
/** { used, slots, free, full } of every carried slot (belt + pack; full = not one free slot left). */
export function bagFill(state) {
  const s = bag(state), cap = bagSlots(state);
  let used = 0;
  for (let i = 0; i < cap; i++) if (s[i]) used++;
  return { used, slots: cap, free: cap - used, full: used >= cap };
}
/** Would everything carried fit with this bag on? (a smaller bag can't hold what it has no slots for) */
export function fitsBag(state, bagIt) {
  const s = bag(state), cap = HOT + bagPockets(state, bagIt);
  let items = 0;
  for (const x of s) if (x && !x.tool) items++;
  let refs = 0;
  for (let i = 0; i < HOT; i++) if (s[i]?.tool) refs++;
  return items + refs <= cap;
}

const lotOf = (id, q, p) => ({ uid: mkUid(), id, q: Math.round(Math.max(0, Math.min(100, q ?? 100))), p: !!p });

/**
 * Put a slotted item into the backpack. Returns the last lot (quality items) or the new count,
 * or null (+ state.emit('full', {id, n})) when it doesn't fit. opts.spill sends what doesn't fit
 * to the trunk at home instead (state.emit('stash', {id, n})); opts.lots adds those exact lots.
 */
export function addToBag(state, id, opts = {}) {
  const n = Math.max(0, opts.n ?? (opts.lots ? opts.lots.length : 1));
  const s = bag(state), cap = bagSlots(state);
  const fits = roomFor(s, id, cap) >= n;
  if (!fits && !opts.spill) {
    state.emit('full', { id, n });
    return null;
  }
  let last = null, u;
  if (isQ(id)) {
    u = opts.lots ? opts.lots.map((l) => ({ ...l, id })) : Array.from({ length: n }, () => lotOf(id, opts.q, opts.p));
    last = u[u.length - 1] || null;
  } else u = n;
  const left = putIn(s, id, u, cap);
  const nl = leftN(left);
  if (nl > 0) {
    stashPut(state, id, left);
    state.emit('stash', { id, n: nl });
    state.emit('full', { id, n: nl, spilled: true });
  }
  sync(state);
  state.emit('items', { id, n });
  return isQ(id) ? last : state.count(id);
}

/** Put units into the trunk at home (it grows as needed). */
export function stashPut(state, id, u) {
  const st = stash(state);
  let left = putIn(st, id, u, st.length);
  if (id === 'weapon') { if (left) st.push({ id: 'weapon', w: left }); return; }
  const max = stackMax(id);
  if (Array.isArray(left)) { left = left.slice(); while (left.length) st.push({ id, lots: left.splice(0, max) }); return; }
  while (left > 0) { const k = Math.min(max, left); st.push({ id, n: k }); left -= k; }
}

/** Remove from the backpack (see takeFrom). Emits 'items'. */
export function removeFromBag(state, id, n = 1, opts = {}) {
  const got = takeFrom(bag(state), id, n, opts);
  sync(state);
  const k = Array.isArray(got) ? got.length : got;
  state.emit('items', { id, n: -k });
  return got;
}
export function removeLotFromBag(state, lotUid) {
  const s = bag(state);
  for (let i = 0; i < s.length; i++) {
    const st = s[i];
    if (!st || !st.lots) continue;
    const j = st.lots.findIndex((l) => l.uid === lotUid);
    if (j < 0) continue;
    const [l] = st.lots.splice(j, 1);
    if (!st.lots.length) s[i] = null;
    sync(state);
    state.emit('items', { id: l.id, n: -1 });
    return l;
  }
  return null;
}

/** A forged weapon goes into a free slot, or to the trunk at home when the bag is full. */
export function addWeaponToBag(state, weapon) {
  const s = bag(state);
  const left = putIn(s, 'weapon', weapon, bagSlots(state));
  if (left) { stashPut(state, 'weapon', weapon); state.emit('stash', { id: 'weapon', n: 1, weapon }); }
  sync(state);
  return !left;
}
export function removeWeaponFromBag(state, wuid) {
  const s = bag(state);
  const i = s.findIndex((x) => x && x.w && x.w.uid === wuid);
  if (i < 0) return null;
  const w = s[i].w;
  s[i] = null;
  sync(state);
  return w;
}

const done = (state, id, moved) => { sync(state); state.emit('items', { id, n: 0, moved }); return moved; };

/**
 * Move up to k units of stack i of `from` onto slot j of `to` (or wherever they fit when j < 0;
 * toCap limits the target to its first slots). A whole stack swaps with a different item; part of
 * a stack only goes onto an empty slot or the same item; nothing is ever lost. A tool on the belt
 * only moves along the belt; an item put on a belt tool sends the tool back to its rack. Returns
 * the units moved. Always re-syncs the backpack mirrors and emits 'items'.
 */
export function transfer(state, from, i, to, j = -1, k = Infinity, toCap = to.length) {
  const src = from[i];
  if (!src || (from === to && i === j)) return 0;
  const H = from.hot || 0;
  if (src.tool) {
    if (from !== to || j < 0 || j >= H) return 0;
    from[i] = to[j] || null; to[j] = src;
    return done(state, null, 1);
  }
  const n = stackN(src);
  const take = Math.max(1, Math.min(n, k));
  const cut = (kk) => (kk >= n ? ((from[i] = null), src) : splitStack(from, i, kk));
  let moved = 0;
  if (j >= 0) {
    let t = to[j];
    // a belt tool swaps along the belt; anything else knocks it back onto the rack
    if (t && t.tool && !(from === to && i < H && take >= n)) { to[j] = null; t = null; }
    if (t && !sameKind(t, src)) {
      if (take < n) return 0;
      to[j] = src; from[i] = t;
      moved = n;
    } else {
      const kk = Math.min(take, stackMax(src.id) - stackN(t));
      if (kk <= 0) return 0;
      const part = cut(kk);
      if (!t) to[j] = part; else dropOn(to, j, part);
      moved = kk;
    }
  } else {
    const kk = Math.min(take, roomFor(to, src.id, toCap));
    if (kk <= 0) return 0;
    const part = cut(kk);
    putIn(to, part.id, units(part), toCap);
    moved = kk;
  }
  return done(state, src.id, moved);
}

/**
 * Shift-click: a stack on the belt goes into the pack, one in the pack onto the belt (merging
 * first, then the first free slot). A belt tool goes back to its rack. Returns units moved.
 */
export function quickMove(state, i) {
  const b = bag(state), cap = bagSlots(state), H = b.hot;
  const s = b[i];
  if (!s) return 0;
  if (s.tool) { b[i] = null; return done(state, null, 1); }
  const idx = i < H ? range(H, cap) : range(0, H);
  const room = roomFor(b, s.id, cap, idx);
  if (room <= 0) return 0;
  const n = stackN(s), kk = Math.min(n, room);
  const part = kk >= n ? ((b[i] = null), s) : splitStack(b, i, kk);
  putIn(b, part.id, units(part), cap, idx);
  return done(state, s.id, kk);
}

/**
 * Hang a tool kind on belt slot j (-1: the first free one). It leaves any other belt slot it was
 * in; an item in slot j moves into the pack (false if there's no room for it).
 */
export function hookTool(state, kind, j = -1) {
  if (!REF_KINDS.includes(kind)) return false;
  const b = bag(state), cap = bagSlots(state), H = b.hot;
  const at = b.findIndex((s, i) => i < H && s?.tool === kind);
  if (j < 0) { if (at >= 0) return true; j = b.findIndex((s, i) => i < H && !s); if (j < 0) return false; }
  if (j >= H || at === j) return at === j;
  const t = b[j];
  if (t && !t.tool) {
    // the item hanging there goes into the pack (only if all of it fits)
    const idx = range(H, cap);
    if (roomFor(b, t.id, cap, idx) < stackN(t)) return false;
    b[j] = null;
    putIn(b, t.id, units(t), cap, idx);
  }
  if (at >= 0) b[at] = t?.tool ? t : null; // a tool in slot j swaps to where this one hung
  b[j] = { tool: kind };
  done(state, null, 1);
  return true;
}
/** A newly owned tool hangs itself on the belt if it isn't there and a slot is free. */
export function hookNew(state, kind) {
  const b = bag(state);
  if (!REF_KINDS.includes(kind) || b.some((s, i) => i < b.hot && s?.tool === kind)) return false;
  return hookTool(state, kind, -1);
}

// ---------------------------------------------------------------- saves
/** Over-stacked stacks (ore from before ore stopped stacking) are split into separate stacks. */
function restack(list) {
  const out = [];
  for (const s of list) {
    if (!s) continue;
    if (s.tool || s.w) { out.push(s); continue; }
    const max = stackMax(s.id);
    if (s.lots) for (let k = 0; k < s.lots.length; k += max) out.push({ id: s.id, lots: s.lots.slice(k, k + max) });
    else for (let n = s.n; n > 0; n -= max) out.push({ id: s.id, n: Math.min(max, n) });
  }
  return out;
}

/**
 * Make the carried slots valid: belt tools only on the belt (once each), no stack over its size,
 * nothing past the bag's size. What has to move goes into free slots, the rest into the trunk.
 * Returns the number of stacks sent to the trunk.
 */
export function normalize(state) {
  const b = bag(state), cap = bagSlots(state), H = b.hot;
  const extra = [], seen = new Set();
  for (let i = 0; i < b.length; i++) {
    const s = b[i];
    if (!s) continue;
    if (s.tool) { if (i >= H || seen.has(s.tool) || !REF_KINDS.includes(s.tool)) b[i] = null; else seen.add(s.tool); continue; }
    if (i >= cap) { extra.push(s); b[i] = null; continue; }
    if (s.w) continue;
    const max = stackMax(s.id), n = stackN(s);
    if (n > max) extra.push(splitStack(b, i, n - max));
  }
  b.length = Math.min(b.length, cap);
  let stashed = 0;
  for (const s of restack(extra)) {
    const left = putIn(b, s.id, units(s), cap);
    if (leftN(left) > 0) { stashPut(state, s.id, left); stashed++; }
  }
  return stashed;
}

const realStack = (s) => {
  if (!s) return null;
  if (s.tool) return REF_KINDS.includes(s.tool) ? { tool: s.tool } : null;
  if (!(s.w || ITEMS[s.id]) || stackN(s) <= 0) return null;
  const c = cloneStack(s);
  if (c.lots) c.lots = c.lots.filter((l) => l && ITEMS[l.id || s.id]).map((l) => ({ ...l, id: l.id || s.id }));
  return stackN(c) > 0 ? c : null;
};
/** How good a stack is to hold on the belt (best snack, strongest blast...). */
const beltScore = (s) => { const it = ITEMS[s.id] || {}; return (it.blast || 0) * 100 + (it.energy ?? it.food ?? 0) + stackN(s) * 0.01; };

/** Fill a fresh belt + pack from a list of stacks (and the old kinds-only hotbar); returns stacks sent to the trunk. */
function rebuild(state, stacks, kinds) {
  const d = state.data;
  d.inv = { v: 2, slots: [] };
  const b = bag(state), cap = bagSlots(state);
  const pool = restack(stacks.filter((s) => s && !s.tool));
  (kinds || HOT_DEFAULT).slice(0, HOT).forEach((k, i) => {
    if (REF_KINDS.includes(k)) { if (!b.some((s) => s?.tool === k)) b[i] = { tool: k }; return; }
    if (k !== 'food' && k !== 'dynamite' && k !== 'stake') return;
    // the best stack of that kind rides on the belt where the old loop was
    let best = -1;
    pool.forEach((s, j) => { if (kindOf(s) === k && (best < 0 || beltScore(s) > beltScore(pool[best]))) best = j; });
    if (best >= 0) b[i] = pool.splice(best, 1)[0];
  });
  let stashed = 0;
  for (const s of pool) {
    const left = putIn(b, s.id, units(s), cap);
    if (leftN(left) > 0) { stashPut(state, s.id, left); stashed++; }
  }
  return stashed;
}

/**
 * The oldest saves (no data.inv): pack the old lots / counts / weapons in; whatever doesn't fit
 * waits in the trunk at home. Returns the number of stacks that went to the trunk.
 */
export function migrate(state, old) {
  const d = state.data;
  const stacks = [];
  const counts = { ...(old.counts || {}) };
  const ids = Object.keys(counts).filter((id) => counts[id] > 0 && ITEMS[id]);
  const pri = (id) => ({ food: 0, consumable: 1 }[ITEMS[id].cat] ?? 5);
  ids.sort((a, b) => pri(a) - pri(b));
  for (const id of ids) {
    if (!slotted(id)) { if (ITEMS[id].cat === 'furniture') d.furniture[id] = (d.furniture[id] || 0) + counts[id]; else d.owned[id] = 1; continue; }
    stacks.push({ id, n: counts[id] });
  }
  const byId = new Map();
  for (const l of old.lots || []) if (ITEMS[l.id]) { if (!byId.has(l.id)) byId.set(l.id, []); byId.get(l.id).push({ uid: l.uid || mkUid(), id: l.id, q: l.q ?? 100, p: !!l.p }); }
  const qids = [...byId.keys()].sort((a, b) => (ITEMS[b].value || 0) - (ITEMS[a].value || 0));
  for (const id of qids) stacks.push({ id, lots: byId.get(id).sort((a, b) => b.q - a.q) });
  for (const w of old.weapons || []) stacks.push({ id: 'weapon', w });
  const n = rebuild(state, stacks, old.hotbar);
  sync(state);
  return n;
}

/** v1 saves: a grid pack (stacks with footprints, ore in eights) + a kinds-only hotbar. */
function migrateV1(state, raw) {
  const cols = raw.inv.slots.length > 24 ? 9 : 6;
  // keep the old pack's reading order (top row first)
  const at = (s) => (s.g ? s.g.y * cols + s.g.x : 1e6);
  const src = raw.inv.slots.map((s, i) => [s, i, realStack(s)]).filter((e) => e[2]);
  src.sort((a, b) => at(a[0]) - at(b[0]) || a[1] - b[1]);
  return rebuild(state, src.map((e) => e[2]), Array.isArray(raw.hotbar) ? raw.hotbar : ['pick', 'chisel', 'build', 'food', 'dynamite']);
}

/** Fill in missing inventory data on load (and run the migrations for old saves). */
export function loadInventory(state, raw) {
  const d = state.data;
  let stashed = 0;
  if (!raw || !raw.inv || !Array.isArray(raw.inv.slots)) stashed = migrate(state, raw || {});
  else if (!(raw.inv.v >= 2)) stashed = migrateV1(state, raw);
  else {
    d.inv = raw.inv;
    d.inv.slots = d.inv.slots.map(realStack);
  }
  delete d.hotbar; // (v1's kinds-only hotbar: the belt is d.inv.slots[0..HOT) now)
  // the trunk: dead stacks go, over-stacked ore is split into single stacks
  const st = stash(state);
  d.stash.slots = restack(st.map(realStack).filter((s) => s && !s.tool));
  // older saves kept a second container (a walking hut's shelves, `data.coop`): whatever was on
  // it waits in the trunk at home now
  const old = raw?.coop?.slots;
  if (Array.isArray(old)) for (const s of old.map(realStack)) if (s && !s.tool) { stashPut(state, s.id, units(s)); stashed++; }
  delete d.coop;
  stashed += normalize(state);
  sync(state);
  return stashed;
}

/** The starting backpack for a new game: an empty pack, the pick and chisel loops on the belt. */
export function defaultInv() {
  const slots = HOT_DEFAULT.map((k) => ({ tool: k }));
  return { v: 2, slots };
}
/** What a new game keeps in the trunk at home: a few grub bars and support beams. */
export function defaultStash() {
  return { slots: [{ id: 'grub_bar', n: 2 }, { id: 'support_beam', n: 3 }] };
}
