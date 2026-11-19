// The hotbar (the belt at the bottom of the screen): the first HOTBAR_N slots of the carried
// inventory (core/inventory.js), Minecraft-like. A slot holds a tool from the rack ({ tool:
// 'pick' }), an item stack, or nothing. Scenes read it as tool kinds: hotbarOf(state)[i] is
// 'pick' | 'chisel' | 'brush' | 'drill' | 'xray' | 'build' (a hung tool), 'food' | 'dynamite' |
// 'stake' (a snack, a blast, glow stakes in that slot) or null (empty, or an item just carried
// there). heldItem() says which item a 'food'/'dynamite' slot holds.
import { ITEMS } from '../data/items.js';
import * as Inv from './inventory.js';

export const TOOL_KINDS = ['pick', 'chisel', 'brush', 'drill', 'xray', 'stake', 'build', 'dynamite', 'food'];
export const REF_KINDS = Inv.REF_KINDS;
export const HOTBAR_N = Inv.HOT;
export const HOTBAR_DEFAULT = Inv.HOT_DEFAULT;

const slotsOf = (st) => {
  const s = st.data?.inv?.slots;
  if (!Array.isArray(s)) return Inv.bag(st);
  return s;
};
/** The stack (or tool) in belt slot i, or null. */
export function hotStack(st, i) { return i >= 0 && i < HOTBAR_N ? slotsOf(st)[i] || null : null; }
/** The belt as tool kinds (length HOTBAR_N). */
export function hotbarOf(st) {
  const s = slotsOf(st), out = new Array(HOTBAR_N);
  for (let i = 0; i < HOTBAR_N; i++) out[i] = Inv.kindOf(s[i]);
  return out;
}
/** The item a 'food' / 'dynamite' / 'stake' belt slot holds (ITEMS entry), when slot i is that kind. */
export function heldItem(st, i, kind) {
  const s = hotStack(st, i);
  if (!s || s.tool || s.w || (kind && Inv.kindOf(s) !== kind)) return null;
  return ITEMS[s.id] || null;
}
/** Hang a tool kind on belt slot i (it leaves any other slot it was in). */
export function hotbarSet(st, i, kind) {
  Inv.hookTool(st, kind, i);
  return hotbarOf(st);
}

/** What each kind is called on the belt. */
export const KIND_LABEL = { pick: 'Pickaxe', chisel: 'Chisel', brush: 'Brush', drill: 'Drill', xray: 'X-Ray Lamp', stake: 'Glow Stakes', build: 'Building', dynamite: 'Explosives', food: 'Snack' };
/** A sample item for each kind's icon. */
export const KIND_ICON = { pick: 'pick_rusty', chisel: 'chisel_basic', brush: 'brush_basic', drill: 'drill_steam', xray: 'xray_lamp', stake: 'glow_stake', build: 'blk_ladder', dynamite: 'dynamite', food: 'grub_bar' };
/** The item a belt tool shows: the equipped one (the build kit: a ladder), else null. */
export function refItem(st, kind) {
  if (kind === 'build') return ITEMS.blk_ladder || null;
  return st.equipped?.(kind) || null;
}
