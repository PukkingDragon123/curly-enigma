// The hotbar: five slots (Minecraft-like) at the bottom of the screen in the mine, each holding one
// tool kind. Saved as state.data.hotbar; set from the backpack (the Hotbar row under the pockets).
export const TOOL_KINDS = ['pick', 'chisel', 'brush', 'drill', 'xray', 'stake', 'build', 'dynamite', 'food'];
export const HOTBAR_N = 5;
export const HOTBAR_DEFAULT = ['pick', 'chisel', 'build', 'food', 'dynamite'];
/** The player's 5-slot bar (repaired to known kinds, no duplicates). */
export function hotbarOf(st) {
  const d = st.data;
  let bar = Array.isArray(d.hotbar) ? d.hotbar.slice(0, HOTBAR_N) : HOTBAR_DEFAULT.slice();
  bar = bar.map((k) => (TOOL_KINDS.includes(k) ? k : null));
  for (let i = 0; i < HOTBAR_N; i++) if (bar[i] === undefined) bar[i] = null;
  bar = bar.map((k, i) => (k && bar.indexOf(k) === i ? k : null));
  d.hotbar = bar;
  return bar;
}
/** Put a tool kind in hotbar slot i (it leaves any other slot it was in). */
export function hotbarSet(st, i, kind) {
  const bar = hotbarOf(st);
  const j = bar.indexOf(kind);
  if (j >= 0) bar[j] = bar[i] ?? null;
  bar[i] = kind;
  st.data.hotbar = bar;
  st.emit?.('items', { id: null, n: 0, hotbar: true });
  return bar;
}

/** What each kind is called on the hotbar row. */
export const KIND_LABEL = { pick: 'Pickaxe', chisel: 'Chisel', brush: 'Brush', drill: 'Drill', xray: 'X-Ray Lamp', stake: 'Glow Stakes', build: 'Building', dynamite: 'Explosives', food: 'Snack' };
/** A sample item for each kind's icon. */
export const KIND_ICON = { pick: 'pick_rusty', chisel: 'chisel_basic', brush: 'brush_basic', drill: 'drill_steam', xray: 'xray_lamp', stake: 'glow_stake', build: 'blk_ladder', dynamite: 'dynamite', food: 'grub_bar' };
