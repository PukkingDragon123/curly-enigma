// The slot inventory: what the mole carries is a grid of stacks (Minecraft-like), and so are
// the coop's shelves and the stash at home. State keeps its public item API (addItem, count,
// removeItem, removeLot, lotsOf, inventory, addWeapon, removeWeapon, buy, sell*) and delegates
// the carried items to this module.
//
// A container is an array of slots: null or a stack.
//   { id, n }                                plain stackables (food, plants, supplies, ...)
//   { id, lots: [{ uid, id, q, p }, ...] }   quality items (ores, gems, ingots): one stack per item,
//                                            showing the average quality
//   { id: 'weapon', w: weapon }              a forged weapon (one per slot)
// Tools, equipment, blueprints, floors, wall styles and key items don't take slots
// (state.data.owned), nor does unplaced furniture (state.data.furniture, it waits at home).
//
// Save data:
//   data.inv   = { v: 1, slots: [...] }                 the backpack (length = bagSlots())
//   data.coop  = { level, slots: [...], food, ... }     Nugget's coop (src/deep/Nugget.js)
//   data.stash = { slots: [...] }                       overflow kept at home (grows as needed)
// data.lots / data.counts / data.weapons stay as read-only mirrors of the backpack (rebuilt after
// every change), so code that reads them keeps working; never write to them directly.
import { ITEMS } from '../data/items.js';
import { uid as mkUid } from './util.js';

export const COLS = 6; // pockets per row in the backpack
export const MAX_SLOTS = 48;
/** The coop's shelves by level, and what the next level costs (gold). */
export const COOP_SLOTS = [4, 6, 9, 12];
export const COOP_COST = [0, 300, 1200, 4500];

const OWNED = new Set(['tool', 'equip', 'blueprint', 'floor', 'wallpaper', 'key']);
const STACK_BY_CAT = { mineral: 16, gem: 8, ingot: 8, plant: 16, critter: 8, drop: 16, ingredient: 16, food: 8, consumable: 10, feed: 24 };
/** Sort order of categories in a tidied container. */
const CAT_ORDER = ['weapon', 'gem', 'mineral', 'ingot', 'consumable', 'food', 'feed', 'ingredient', 'plant', 'critter', 'drop'];

/** Does this item live in slots? (false for tools, gear, blueprints, floors, keys, furniture) */
export function slotted(id) {
  if (id === 'weapon') return true;
  const it = ITEMS[id];
  return !!it && !OWNED.has(it.cat) && it.cat !== 'furniture';
}
/** How many fit in one slot. Items may set `stack` in items.js. */
export function stackMax(id) {
  if (id === 'weapon') return 1;
  const it = ITEMS[id];
  return it?.stack ?? STACK_BY_CAT[it?.cat] ?? 16;
}
export const isQ = (id) => !!ITEMS[id]?.q;

// ---------------------------------------------------------------- stacks
export function stackN(s) { return !s ? 0 : s.w ? 1 : s.lots ? s.lots.length : s.n || 0; }
/** Average quality of a stack (quality items), else null. */
export function stackQ(s) {
  if (!s || !s.lots || !s.lots.length) return null;
  return Math.round(s.lots.reduce((a, l) => a + l.q, 0) / s.lots.length);
}
export function stackPristine(s) { return !!s?.lots?.some((l) => l.p); }
export const stackFull = (s) => stackN(s) >= stackMax(s.id);
export const sameKind = (a, b) => !!a && !!b && !a.w && !b.w && a.id === b.id;

/** A copy of a stack (lots are shared objects; weapons are moved, not copied). */
export function cloneStack(s) {
  if (!s) return null;
  if (s.w) return { id: 'weapon', w: s.w };
  if (s.lots) return { id: s.id, lots: s.lots.slice() };
  return { id: s.id, n: s.n };
}

// ---------------------------------------------------------------- containers
/** Units of `id` that fit in the first `cap` slots. */
export function roomFor(slots, id, cap = slots.length) {
  const max = stackMax(id);
  let room = 0;
  for (let i = 0; i < cap; i++) {
    const s = slots[i];
    if (!s) room += max;
    else if (!s.w && s.id === id) room += Math.max(0, max - stackN(s));
  }
  return room;
}
export function usedSlots(slots) { let n = 0; for (const s of slots) if (s) n++; return n; }
export function countIn(slots, id) { let n = 0; for (const s of slots) if (s && s.id === id) n += stackN(s); return n; }
export function lotsIn(slots, id) { const out = []; for (const s of slots) if (s && s.lots && s.id === id) out.push(...s.lots); return out; }

/**
 * Put units into a container: `units` is a count (plain items), an array of lots (quality items)
 * or a weapon object. Fills partial stacks first, then empty slots (from `from` on).
 * Returns what didn't fit, in the same form (0 / [] / null when everything went in).
 */
export function putIn(slots, id, units, cap = slots.length) {
  const max = stackMax(id);
  if (id === 'weapon') {
    for (let i = 0; i < cap; i++) if (!slots[i]) { slots[i] = { id: 'weapon', w: units }; return null; }
    return units;
  }
  if (Array.isArray(units)) {
    let left = units.slice();
    for (let i = 0; i < cap && left.length; i++) {
      const s = slots[i];
      if (s && s.lots && s.id === id && s.lots.length < max) { const k = Math.min(max - s.lots.length, left.length); s.lots.push(...left.splice(0, k)); }
    }
    for (let i = 0; i < cap && left.length; i++) if (!slots[i]) slots[i] = { id, lots: left.splice(0, max) };
    return left;
  }
  let left = units;
  for (let i = 0; i < cap && left > 0; i++) {
    const s = slots[i];
    if (s && !s.w && !s.lots && s.id === id && s.n < max) { const k = Math.min(max - s.n, left); s.n += k; left -= k; }
  }
  for (let i = 0; i < cap && left > 0; i++) if (!slots[i]) { const k = Math.min(max, left); slots[i] = { id, n: k }; left -= k; }
  return left;
}

/**
 * Take n units of `id` out of a container. Quality items: the best lots first (lowFirst: the
 * worst), returns the lots; plain items: from the last stacks first, returns the count.
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
    if (!s || s.w || s.id !== id) continue;
    const k = Math.min(s.n, left);
    s.n -= k; left -= k; got += k;
    if (s.n <= 0) slots[i] = null;
  }
  return got;
}

/** Split a stack: take k units off slot i, returned as a new stack (the slot keeps the rest). */
export function splitStack(slots, i, k) {
  const s = slots[i];
  if (!s || s.w) return null;
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
 * Drop a held stack onto slot j of a container (drag & drop). Merges into the same item (up to
 * the stack size), swaps with a different item, fills an empty slot. Returns what's still held
 * (null when it all went in).
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

/** Merge partial stacks and order them (category, value, quality). Keeps the length. */
export function tidy(slots, cap = slots.length) {
  const weapons = [], plain = new Map(), qual = new Map();
  for (let i = 0; i < cap; i++) {
    const s = slots[i];
    if (!s) continue;
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
  out.forEach((s, i) => { if (i < cap) slots[i] = s; });
  // anything that didn't fit back (can't happen when tidying in place) is returned
  return out.slice(cap);
}

/** Grouped view of a container: [{ id, n, avgQ?, lots? }] like state.inventory(). */
export function groups(slots, filter = () => true) {
  const map = new Map();
  for (const s of slots) {
    if (!s || s.w) continue;
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
/** Backpack pockets: the bag's slots + Deeper Pockets (1 per 2 levels) + the Carry skill. */
// Test URLs: `?bag=N` gives the backpack N pockets, and `?give=...` (which hands out 5 of each
// item at start) lifts it to the maximum, so test setups never lose items to a full bag.
let DEV_BAG = 0;
try {
  const q = new URLSearchParams(globalThis.location?.search || '');
  if (q.has('bag')) DEV_BAG = Math.max(1, Math.min(MAX_SLOTS, parseInt(q.get('bag'), 10) || 0));
  else if (q.has('give')) DEV_BAG = MAX_SLOTS;
} catch (e) { /* no location (worker) */ }

export function bagSlots(state) {
  if (DEV_BAG) return DEV_BAG;
  const bag = state.equipped?.('bag');
  let n = bag?.slots ?? 6;
  n += Math.floor((state.upEffect?.('bag') || 0) / 4);
  const carry = state.skill?.('carry') || 1;
  if (carry > 1) n += Math.round((carry - 1) * 6);
  if (state.hasBuff?.('pack')) n += 1; // a packed lunch tied on: one more pocket while it lasts
  return Math.max(1, Math.min(MAX_SLOTS, n));
}

/** The backpack's slot array (grown to the current bag size; never shrinks under items). */
export function bag(state) {
  const d = state.data;
  if (!d.inv || !Array.isArray(d.inv.slots)) d.inv = { v: 1, slots: [] };
  const s = d.inv.slots;
  const cap = bagSlots(state);
  while (s.length < cap) s.push(null);
  // trailing empty slots past the bag's size go away
  while (s.length > cap && !s[s.length - 1]) s.pop();
  return s;
}
export function stash(state) {
  const d = state.data;
  if (!d.stash || !Array.isArray(d.stash.slots)) d.stash = { slots: [] };
  return d.stash.slots;
}
/** The coop's shelves (sized by its level). */
export function coopSlots(state) {
  const d = state.data;
  if (!d.coop || typeof d.coop !== 'object') d.coop = defaultCoop();
  if (!Array.isArray(d.coop.slots)) d.coop.slots = [];
  const cap = COOP_SLOTS[Math.min(COOP_SLOTS.length - 1, d.coop.level || 0)];
  const s = d.coop.slots;
  while (s.length < cap) s.push(null);
  while (s.length > cap && !s[s.length - 1]) s.pop();
  return s;
}
export function defaultCoop() {
  // food: 0..1 how full Nugget is; laid: eggs laid so far; layT: seconds until the next egg
  return { level: 0, slots: [], food: 0.8, laid: 0, layT: 240, lastFed: 0 };
}

/** Rebuild the read-only mirrors (data.lots, data.counts, data.weapons) from the backpack. */
export function sync(state) {
  const d = state.data;
  const lots = [], counts = {}, weapons = [];
  for (const s of bag(state)) {
    if (!s) continue;
    if (s.w) weapons.push(s.w);
    else if (s.lots) lots.push(...s.lots);
    else counts[s.id] = (counts[s.id] || 0) + s.n;
  }
  d.lots = lots; d.counts = counts; d.weapons = weapons;
}

/** Will n of this item fit in the backpack right now? (always true for things without slots) */
export function canAdd(state, id, n = 1) {
  if (!slotted(id)) return !!ITEMS[id];
  const s = bag(state);
  return roomFor(s, id, bagSlots(state)) >= n;
}
/** { used, slots, free, full } of the backpack (full = no empty pocket left). */
export function bagFill(state) {
  const s = bag(state), cap = bagSlots(state);
  let used = 0;
  for (let i = 0; i < cap; i++) if (s[i]) used++;
  return { used, slots: cap, free: cap - used, full: used >= cap };
}

const lotOf = (id, q, p) => ({ uid: mkUid(), id, q: Math.round(Math.max(0, Math.min(100, q ?? 100))), p: !!p });

/**
 * Put a slotted item into the backpack. Returns the last lot (quality items) or the new count,
 * or null (+ state.emit('full', {id, n})) when it doesn't fit. opts.spill sends what doesn't fit
 * to the stash at home instead (state.emit('stash', {id, n})); opts.lots adds those exact lots.
 */
export function addToBag(state, id, opts = {}) {
  const n = Math.max(0, opts.n ?? (opts.lots ? opts.lots.length : 1));
  const s = bag(state), cap = bagSlots(state);
  const fits = roomFor(s, id, cap) >= n;
  if (!fits && !opts.spill) {
    state.emit('full', { id, n });
    return null;
  }
  let last = null, units;
  if (isQ(id)) {
    units = opts.lots ? opts.lots.map((l) => ({ ...l, id })) : Array.from({ length: n }, () => lotOf(id, opts.q, opts.p));
    last = units[units.length - 1] || null;
  } else units = n;
  const left = putIn(s, id, units, cap);
  const nl = Array.isArray(left) ? left.length : left;
  if (nl > 0) {
    stashPut(state, id, left);
    state.emit('stash', { id, n: nl });
    state.emit('full', { id, n: nl, spilled: true });
  }
  sync(state);
  state.emit('items', { id, n });
  return isQ(id) ? last : state.count(id);
}

/** Put units into the stash at home (it grows as needed). */
export function stashPut(state, id, units) {
  const st = stash(state);
  let left = putIn(st, id, units, st.length);
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

/** A forged weapon goes into a free pocket, or to the stash at home when the bag is full. */
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

/**
 * Move up to k units of stack i of `from` onto slot j of `to` (or wherever they fit when j < 0;
 * toCap limits the target to its first slots). A whole stack swaps with a different item; part of
 * a stack only goes onto an empty slot or the same item; nothing is ever lost. Returns the
 * units moved. Always re-syncs the backpack mirrors and emits 'items'.
 */
export function transfer(state, from, i, to, j = -1, k = Infinity, toCap = to.length) {
  const src = from[i];
  if (!src || (from === to && i === j)) return 0;
  const n = stackN(src);
  const take = Math.max(1, Math.min(n, k));
  const cut = (kk) => (kk >= n ? ((from[i] = null), src) : splitStack(from, i, kk));
  let moved = 0;
  if (j >= 0) {
    const t = to[j];
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
    putIn(to, part.id, part.w || part.lots || part.n, toCap);
    moved = kk;
  }
  sync(state);
  state.emit('items', { id: src.id, n: 0, moved });
  return moved;
}

/**
 * Old saves (no data.inv): pack the old lots / counts / weapons into the backpack; whatever
 * doesn't fit waits in the stash at home. Returns the number of stacks that went to the stash.
 */
export function migrate(state, old) {
  const d = state.data;
  d.inv = { v: 1, slots: [] };
  const s = bag(state), cap = bagSlots(state);
  const st = stash(state);
  let stashed = 0;
  const place = (id, units) => {
    const left = putIn(s, id, units, cap);
    const nl = left == null ? 0 : Array.isArray(left) ? left.length : typeof left === 'number' ? left : 1;
    if (nl > 0) {
      const before = st.length;
      stashPut(state, id, left);
      stashed += st.length - before;
    }
  };
  // what you'd want at hand first: food, supplies, then the valuable finds
  const counts = { ...(old.counts || {}) };
  const ids = Object.keys(counts).filter((id) => counts[id] > 0 && ITEMS[id]);
  const pri = (id) => ({ food: 0, consumable: 1, feed: 2 }[ITEMS[id].cat] ?? 5);
  ids.sort((a, b) => pri(a) - pri(b));
  for (const id of ids) {
    if (!slotted(id)) { if (ITEMS[id].cat === 'furniture') d.furniture[id] = (d.furniture[id] || 0) + counts[id]; else d.owned[id] = 1; continue; }
    place(id, counts[id]);
  }
  const byId = new Map();
  for (const l of old.lots || []) if (ITEMS[l.id]) { if (!byId.has(l.id)) byId.set(l.id, []); byId.get(l.id).push({ uid: l.uid || mkUid(), id: l.id, q: l.q ?? 100, p: !!l.p }); }
  const qids = [...byId.keys()].sort((a, b) => (ITEMS[b].value || 0) - (ITEMS[a].value || 0));
  for (const id of qids) place(id, byId.get(id).sort((a, b) => b.q - a.q));
  for (const w of old.weapons || []) place('weapon', w);
  sync(state);
  return stashed;
}

/** Fill in missing inventory data on load (and run the migration for old saves). */
export function loadInventory(state, raw) {
  const d = state.data;
  let stashed = 0;
  if (!raw || !raw.inv || !Array.isArray(raw.inv.slots)) stashed = migrate(state, raw || {});
  else {
    d.inv = raw.inv;
    // drop stacks of items that no longer exist
    d.inv.slots = d.inv.slots.map((s) => (s && (s.w || ITEMS[s.id]) && stackN(s) > 0 ? s : null));
  }
  if (!d.coop || typeof d.coop !== 'object' || Array.isArray(d.coop)) d.coop = defaultCoop();
  else d.coop = { ...defaultCoop(), ...d.coop };
  coopSlots(state);
  stash(state);
  sync(state);
  return stashed;
}

/** The starting backpack for a new game. */
export function defaultInv() {
  return { v: 1, slots: [{ id: 'grub_bar', n: 2 }, { id: 'support_beam', n: 3 }, ITEMS.chicken_feed ? { id: 'chicken_feed', n: 6 } : null, null, null, null] };
}

// ---------------------------------------------------------------- Nugget's care (data.coop)
/** Below this Nugget is hungry: she sits down and sulks and won't follow. */
export const HUNGRY = 0.15;
/** Nugget's mood from how fed she is: 'happy' | 'ok' | 'peckish' | 'hungry'. */
export function henMood(state) {
  const f = state.data.coop?.food ?? 0.8;
  return f < HUNGRY ? 'hungry' : f < 0.35 ? 'peckish' : f > 0.65 ? 'happy' : 'ok';
}
const henName = (state) => state.data.chicken?.name || 'Nugget';

/**
 * Feed Nugget one helping: item `id` (or the most filling hen food you carry) taken from the
 * backpack (from = 'bag') or the coop's shelves ('coop'), whichever has it first. Emits
 * 'act' { type: 'feed', who: 'nugget', id }. Returns { ok, id, food, mood } or { ok: false, reason }.
 */
export function feedHen(state, id = null, from = 'bag') {
  const d = state.data;
  if (!d.coop || typeof d.coop !== 'object') d.coop = defaultCoop();
  const c = d.coop;
  if ((c.food ?? 0) >= 0.96) return { ok: false, reason: `${henName(state)} is full. She fluffs up and looks away.` };
  const pools = from === 'coop' ? [coopSlots(state), bag(state)] : [bag(state), coopSlots(state)];
  if (!id) {
    let best = null;
    for (const p of pools) {
      for (const s of p) if (s && !s.w && ITEMS[s.id]?.hen > 0 && (!best || ITEMS[s.id].hen > ITEMS[best].hen)) best = s.id;
      if (best) break;
    }
    id = best;
  }
  const it = ITEMS[id];
  if (!it || !(it.hen > 0)) return { ok: false, reason: `No hen food packed. Worms, grubs, seeds or chicken feed.` };
  let took = 0;
  for (const p of pools) {
    const got = takeFrom(p, id, 1);
    took = Array.isArray(got) ? got.length : got;
    if (took) break;
  }
  if (!took) return { ok: false, reason: `You have no ${it.name} left.` };
  c.food = Math.min(1, (c.food ?? 0) + it.hen);
  c.lastFed = d.playTime || 0;
  c.fed = (c.fed || 0) + 1;
  sync(state);
  state.emit('items', { id, n: -1 });
  state.emit('act', { type: 'feed', who: 'nugget', id });
  return { ok: true, id, food: c.food, mood: henMood(state) };
}

/** Nail another shelf on the coop: { ok, slots, added } or { ok: false, reason }. */
export function upgradeCoop(state) {
  const c = state.data.coop || (state.data.coop = defaultCoop());
  const lvl = c.level || 0;
  if (lvl >= COOP_SLOTS.length - 1) return { ok: false, reason: 'The coop can\'t take another shelf.' };
  const cost = COOP_COST[lvl + 1];
  if (!state.spend(cost, 'coop')) return { ok: false, reason: `A shelf costs ${cost}g.` };
  c.level = lvl + 1;
  const slots = coopSlots(state).length;
  state.emit('items', { id: null, n: 0, coop: true });
  return { ok: true, slots, added: COOP_SLOTS[lvl + 1] - COOP_SLOTS[lvl] };
}

/**
 * Nugget's hunger and laying, per frame. o.rate: food lost per second (default: a full hen gets
 * hungry after ~12 minutes along on a dig); o.lay: false stops laying; o.layK speeds laying up.
 * Returns 'egg' when she lays.
 */
export function tickHen(state, dt, o = {}) {
  const c = state.data.coop || (state.data.coop = defaultCoop());
  c.food = Math.max(0, (c.food ?? 0.8) - dt * (o.rate ?? 1 / 720));
  if (o.lay === false || c.food < 0.45) return null;
  c.layT = (c.layT ?? 240) - dt * (c.food > 0.75 ? 1.3 : 1) * (o.layK ?? 1);
  if (c.layT > 0) return null;
  c.layT = 200 + Math.random() * 160;
  c.laid = (c.laid || 0) + 1;
  return 'egg';
}

/** Something Nugget scratched up onto the coop's shelves (id, n, q): true, or false when full. */
export function findToCoop(state, id, n = 1, q = 100) {
  const units = isQ(id) ? Array.from({ length: n }, () => lotOf(id, q, false)) : n;
  const left = putIn(coopSlots(state), id, units);
  if (Array.isArray(left) ? left.length : left > 0) return false;
  state.emit('items', { id, n: 0, coop: true });
  return true;
}

/** A fresh egg onto the coop's shelves: true, or false when the shelves are full. */
export function eggToCoop(state) {
  const left = putIn(coopSlots(state), 'egg', 1);
  if (left > 0) return false;
  if (state.data.stats) state.data.stats.eggs = (state.data.stats.eggs || 0) + 1;
  state.emit('items', { id: 'egg', n: 0, coop: true });
  return true;
}
