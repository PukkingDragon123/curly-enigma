// Quality helpers for cooking and foraging.
//  - kitchenData(state): the cooking part's save data (state.data.kitchen, filled in lazily so
//    old saves work): { buffFrom: { buffId: itemId }, lesson: bool, cooked: n }.
//  - fixQualityStacks(state): plants and dishes became quality items (they remember how well
//    they were pulled / cooked). Older saves hold them as plain stacks ({ id, n }); turn those into
//    lots so the backpack, the pantry and selling all treat them alike.
//  - ingredientQ(lots): average quality of what went into the pot.
import { ITEMS } from '../data/items.js';
import { uid } from '../core/util.js';
import * as Inv from '../core/inventory.js';

export function kitchenData(state) {
  const d = state.data;
  if (!d.kitchen || typeof d.kitchen !== 'object') d.kitchen = {};
  const k = d.kitchen;
  k.buffFrom ||= {};
  k.cooked ||= 0;
  return k;
}

const OLD_Q = 72; // what an old plain stack is worth: decent, not great

export function fixQualityStacks(state) {
  const d = state?.data;
  if (!d) return 0;
  let changed = 0;
  for (const slots of [d.inv?.slots, d.stash?.slots, d.coop?.slots]) {
    if (!Array.isArray(slots)) continue;
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s || s.w || !ITEMS[s.id]) continue;
      if (ITEMS[s.id].q && !s.lots && s.n > 0) {
        slots[i] = { id: s.id, lots: Array.from({ length: s.n }, () => ({ uid: uid(), id: s.id, q: OLD_Q, p: false })) };
        changed++;
      } else if (!ITEMS[s.id].q && s.lots) {
        slots[i] = s.lots.length ? { id: s.id, n: s.lots.length } : null;
        changed++;
      }
    }
  }
  // pre-slot saves still keep plain counts of things that now have a quality
  if (!d.inv && d.counts) {
    for (const [id, n] of Object.entries(d.counts)) {
      if (!ITEMS[id]?.q || !(n > 0)) continue;
      for (let k = 0; k < n; k++) (d.lots ||= []).push({ uid: uid(), id, q: OLD_Q, p: false });
      delete d.counts[id];
      changed++;
    }
  }
  if (changed && d.inv) { try { Inv.sync(state); } catch (e) { /* inventory module changed shape: leave it */ } }
  if (changed) state.emit?.('items', { id: null, n: 0 });
  return changed;
}

/** Average quality (0..100) of the lots used; plain shop basics count as `plain`. */
export function ingredientQ(used, plain = 85) {
  if (!used.length) return plain;
  let s = 0;
  for (const u of used) s += u.q ?? plain;
  return s / used.length;
}

// ---------------------------------------------------------------- the pantry: backpack + the stash at home
// Cooking happens at home, so the pantry is everything in the backpack plus what waits in the stash
// (core/inventory.js). Taking prefers the best quality, from the backpack first.
const containers = (state) => [Inv.bag(state), Inv.stash(state)];

/** Grouped [{ id, n, lots?, avgQ? }] over the backpack and the stash. */
export function pantryItems(state, filter = () => true) {
  const map = new Map();
  for (const slots of containers(state)) for (const g of Inv.groups(slots, filter)) {
    const m = map.get(g.id);
    if (!m) map.set(g.id, { ...g, lots: g.lots ? g.lots.slice() : undefined });
    else { m.n += g.n; if (g.lots) (m.lots ||= []).push(...g.lots); }
  }
  return [...map.values()];
}
export function pantryCount(state, id) { let n = 0; for (const slots of containers(state)) n += Inv.countIn(slots, id); return n; }
export function pantryLots(state, id) { const out = []; for (const slots of containers(state)) out.push(...Inv.lotsIn(slots, id)); return out; }

/** Take one: the best lot (quality items) from wherever it is. Returns { id, q?, p? } or null. */
export function pantryTake(state, id) {
  if (ITEMS[id]?.q) {
    let best = null, where = null;
    for (const slots of containers(state)) for (const l of Inv.lotsIn(slots, id)) if (!best || l.q > best.q) { best = l; where = slots; }
    if (!best) return null;
    for (let i = 0; i < where.length; i++) {
      const s = where[i];
      if (!s || !s.lots || s.id !== id) continue;
      const k = s.lots.indexOf(best);
      if (k < 0) continue;
      s.lots.splice(k, 1);
      if (!s.lots.length) where[i] = null;
      break;
    }
    Inv.sync(state);
    state.emit('items', { id, n: -1 });
    return { id, q: best.q, p: !!best.p };
  }
  for (const slots of containers(state)) {
    if (Inv.countIn(slots, id) > 0) { Inv.takeFrom(slots, id, 1); Inv.sync(state); state.emit('items', { id, n: -1 }); return { id }; }
  }
  return null;
}

/** Give the cook something; what doesn't fit in the backpack goes to the stash at home. */
export function pantryGive(state, id, opts = {}) {
  return state.addItem(id, { ...opts, spill: true });
}
