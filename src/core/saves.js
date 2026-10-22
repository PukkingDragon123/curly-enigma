// Three save slots in localStorage, and how far along a save is (its completion %).
//
// Slot keys: slot 0 is the original single-save key ('moleforge.save.v1'), so an old save simply
// *is* slot 1 (the migration costs nothing, and older builds still find it); slots 1 and 2 live
// at 'moleforge.save.v1.slot2' / '.slot3'. A small meta record ('moleforge.slots.v1') remembers
// the slot in use ({ current, world }).
//
// The mine keeps its dug tunnels under its own key ('moleforge.world.v1', World.js). It belongs to
// whichever slot played last (meta.world): switching slots parks those edits under
// 'moleforge.world.v1.slotN' and brings the new slot's back, so every slot keeps its own holes.
//
// State (core/State.js) reads and writes the current slot through slotKey(state.slot), so every
// save() / load() / hasSave() / wipeSave() / reset() path works on the slot in use. Its slot
// helpers (state.slot, state.listSlots(), state.useSlot(i), state.deleteSlot(i),
// state.completion()) call into this module.
//
// Completion (0-100), see completionOf() and docs/REMAKE.md:
//   gold    60%  sqrt(min(1, max(gold, earned / 2) / 1,000,000))  (the square root shows early
//                progress; half of everything ever earned counts, so buying upgrades never
//                makes the stone shrink much)
//   lessons 10%  Old Star's lessons: the step reached in the `lessons` quest (old saves: mined,
//                forged, cooked, a third each)
//   zones   10%  deepest lift zone reached, (zoneMax - 1) / 5
//   index   10%  Index Book entries known / all entries
//   quests  10%  quests done / all quests (data/quests.js, once the quest part ships it)
// A part whose data is missing hands its weight to the others. Seeing the ending = 100.
import { ITEMS } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { WEAPON_TYPES } from '../data/weapons.js';
import { DISHES } from '../data/recipes.js';
import { MECHANICS } from '../data/mechanics.js';

export const SLOTS = 3;
export const GOAL = 1000000;
const LEGACY_KEY = 'moleforge.save.v1';
const META_KEY = 'moleforge.slots.v1';
const WORLD_KEY = 'moleforge.world.v1';

// the quest list, if the quest part has shipped it (optional at build time)
const QUEST_MODS = import.meta.glob('../data/quests.js', { eager: true });

/** localStorage key of slot i (0-based). */
export function slotKey(i) { return i > 0 ? `${LEGACY_KEY}.slot${i + 1}` : LEGACY_KEY; }
const worldStash = (i) => `${WORLD_KEY}.slot${i + 1}`;

function ls() { try { return window.localStorage; } catch (e) { return null; } }
function readMeta() {
  try {
    const m = JSON.parse(ls()?.getItem(META_KEY) || 'null');
    if (m && typeof m === 'object') return { current: 0, world: 0, ...m };
  } catch (e) { /* corrupt meta: start over */ }
  return { current: 0, world: 0 };
}
function writeMeta(m) { try { ls()?.setItem(META_KEY, JSON.stringify(m)); } catch (e) { /* storage blocked */ } }
const clampSlot = (i) => Math.max(0, Math.min(SLOTS - 1, i | 0));

/** The slot the game last used (State starts on it). */
export function currentSlot() { return clampSlot(readMeta().current); }

/** Raw JSON of slot i, or null. */
export function slotRaw(i) { try { return ls()?.getItem(slotKey(i)) || null; } catch (e) { return null; } }

/** Does slot i hold a save? */
export function slotUsed(i) { return !!slotRaw(i); }

/** Make the mine's saved edits (World.js reads WORLD_KEY) belong to slot i. */
function swapWorld(i) {
  const s = ls();
  if (!s) return;
  const m = readMeta();
  const owner = clampSlot(m.world ?? 0);
  if (owner === i) return;
  try {
    const live = s.getItem(WORLD_KEY);
    if (live) s.setItem(worldStash(owner), live); else s.removeItem(worldStash(owner));
  } catch (e) { console.warn('[saves] could not park the mine of slot', owner + 1, e); }
  try {
    const mine = s.getItem(worldStash(i));
    if (mine) s.setItem(WORLD_KEY, mine); else s.removeItem(WORLD_KEY);
    s.removeItem(worldStash(i));
  } catch (e) { console.warn('[saves] could not restore the mine of slot', i + 1, e); }
  m.world = i;
  writeMeta(m);
}

/** Forget the mine edits of slot i (new game / delete). */
function wipeWorld(i) {
  const s = ls();
  if (!s) return;
  try {
    s.removeItem(worldStash(i));
    if (clampSlot(readMeta().world ?? 0) === i) s.removeItem(WORLD_KEY);
  } catch (e) { /* noop */ }
}

/**
 * Switch `state` to slot i. Loads its save (keeping the current settings, which are global in
 * spirit), or starts fresh data when the slot is empty or opts.fresh is set (a new game: the
 * slot's old save and mine are wiped). Returns true when a save was loaded.
 */
export function useSlot(state, i, { fresh = false } = {}) {
  i = clampSlot(i);
  const settings = state.data?.settings;
  swapWorld(i);
  state.slot = i;
  const m = readMeta();
  m.current = i;
  writeMeta(m);
  let loaded = false;
  if (fresh) {
    try { ls()?.removeItem(slotKey(i)); } catch (e) { /* noop */ }
    wipeWorld(i);
  } else loaded = state.load();
  if (!loaded) state.reset();
  if (settings) state.data.settings = { ...state.data.settings, ...settings };
  return loaded;
}

/** Delete slot i (its save and its mine). If it's the slot in use, `state` starts over in memory. */
export function deleteSlot(state, i) {
  i = clampSlot(i);
  try { ls()?.removeItem(slotKey(i)); } catch (e) { /* noop */ }
  wipeWorld(i);
  if (state && state.slot === i) state.reset();
}

// ------------------------------------------------------------------ completion
let INDEX_IDS = null;
function indexIds() {
  if (INDEX_IDS) return INDEX_IDS;
  const ids = [];
  for (const [id, it] of Object.entries(ITEMS)) if (it.cat === 'mineral' || it.cat === 'gem' || it.cat === 'plant') ids.push(`${it.cat}:${id}`);
  for (const id of Object.keys(CREATURES)) ids.push(`critter:${id}`);
  for (const id of Object.keys(WEAPON_TYPES)) ids.push(`weapon:${id}`);
  for (const id of Object.keys(DISHES)) ids.push(`recipe:${id}`);
  for (const id of Object.keys(MECHANICS)) ids.push(`mechanic:${id}`);
  INDEX_IDS = ids;
  return ids;
}

/** The quest definitions (data/quests.js QUESTS), or null. */
function questDefs() {
  const mod = Object.values(QUEST_MODS)[0];
  const q = mod && (mod.QUESTS || mod.quests || mod.default);
  return q && typeof q === 'object' ? q : null;
}

/** Every quest id the quest part defines ([] until data/quests.js exists). */
function questIds() {
  const q = questDefs();
  if (!q) return [];
  if (Array.isArray(q)) return q.map((x) => x && (x.id ?? x)).filter((x) => typeof x === 'string');
  if (q && typeof q === 'object') return Object.keys(q);
  return [];
}

/** Is quest `id` done in save data `d`? Reads the common shapes a quest log takes. */
function questDone(d, id) {
  const q = d.quests;
  if (!q || typeof q !== 'object') return false;
  const done = q.done || q.completed;
  if (Array.isArray(done) ? done.includes(id) : done && done[id]) return true;
  const e = q[id] ?? q.list?.[id] ?? q.state?.[id] ?? q.log?.[id];
  if (!e) return false;
  if (e === 'done' || e === true) return true;
  return !!(e.done || e.state === 'done' || e.status === 'done' || e.completed);
}

/**
 * Old Star's lessons, 0..1: the step reached in the `lessons` quest (core/quests.js keeps
 * data.quests.active.lessons.s), 1 once it's done; old saves without a quest log count what the
 * mole has already done (mined, forged, cooked).
 */
function lessonsFrac(d) {
  if (questDone(d, 'lessons')) return 1;
  let f = 0;
  const def = questDefs()?.lessons;
  const a = d.quests?.active?.lessons;
  if (def && Array.isArray(def.steps) && a && typeof a.s === 'number') f = Math.min(1, a.s / def.steps.length);
  const st = d.stats || {};
  const did = ((st.ores || 0) > 0 || (st.blocks || 0) >= 20 ? 1 : 0) + ((st.weapons || 0) > 0 ? 1 : 0) + ((st.dishes || 0) > 0 ? 1 : 0);
  return Math.max(f, did / 3);
}

/**
 * How far along save data `d` is, 0..100 (an integer; 100 only once the ending has been seen
 * or every part is full). See the formula at the top of this file.
 */
export function completionOf(d) {
  if (!d || typeof d !== 'object') return 0;
  if (d.flags?.endingSeen) return 100;
  const parts = [];
  const gold = Math.max(d.gold || 0, ((d.stats && d.stats.earned) || 0) / 2);
  parts.push([0.6, Math.sqrt(Math.min(1, Math.max(0, gold) / GOAL))]);
  parts.push([0.1, lessonsFrac(d)]);
  parts.push([0.1, Math.min(1, Math.max(0, ((d.zoneMax || 1) - 1) / 5))]);
  const ids = indexIds();
  if (ids.length) {
    const idx = d.index || {};
    let n = 0;
    for (const k of ids) if (idx[k]) n++;
    parts.push([0.1, n / ids.length]);
  }
  const qs = questIds();
  if (qs.length) parts.push([0.1, qs.filter((id) => questDone(d, id)).length / qs.length]);
  let w = 0, s = 0;
  for (const [wt, v] of parts) { w += wt; s += wt * v; }
  const pct = w > 0 ? (s / w) * 100 : 0;
  return pct >= 99.999 ? 100 : Math.max(0, Math.min(99, Math.floor(pct)));
}

/**
 * One summary per slot for the save stones:
 * { i, used, completion, gold, day, playTime, scene, fallen, saved, current }.
 * `state` (optional) lets the slot in use report live, unsaved numbers.
 */
export function listSlots(state) {
  const cur = state ? state.slot : currentSlot();
  const out = [];
  for (let i = 0; i < SLOTS; i++) {
    let d = null;
    const raw = slotRaw(i);
    if (raw) { try { d = JSON.parse(raw); } catch (e) { d = null; } }
    if (!d) { out.push({ i, used: false, broken: !!raw, current: i === cur }); continue; }
    out.push({
      i, used: true, current: i === cur,
      completion: completionOf(d),
      gold: Math.max(0, Math.floor(d.gold || 0)),
      day: d.day || 1,
      playTime: d.playTime || 0,
      scene: d.flags?.lastScene || null,
      fallen: !!d.flags?.fallen,
      saved: d.saved || 0,
    });
  }
  return out;
}

/** "3h 12m" / "42m" / "<1m" */
export function formatPlayTime(sec) {
  const m = Math.floor((sec || 0) / 60);
  if (m < 1) return '<1m';
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}
