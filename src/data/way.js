// The progression spine (docs/DESIGN_PROGRESSION.md): the pick ladder, the cards on Old Star's
// board (Community Center bundles: hand the ores in, a card fills, it pays out and unlocks the next
// step) and the two wardens that sleep by the lift stops between layers (Terraria's boss gates:
// each drops the heart the next pick is forged round).
//
// Save data: state.data.way = { cards: { id: { item: n handed in } }, done: { id: day },
//   wardens: { id: day beaten } } (State.defaultData; old saves get it empty).
import { ITEMS } from './items.js';

/** The pick ladder, lowest first: tier, the item, what it opens (for the doc, the board and tips). */
export const PICK_LADDER = ['pick_first', 'pick_copper', 'pick_iron', 'pick_steel', 'pick_mithril', 'pick_adamant', 'pick_starmetal'];

/**
 * The cards on the board, in order. Each is three slots of ore; when all are full it pays out.
 * doodle: the chalk picture of its layer (src/home/wayBoard.js) · unlock: what the payout opens
 * (a forge pattern, shown as that pick's icon on the card) · zone: the layer it belongs to.
 */
export const WAY_CARDS = [
  { id: 'rootsoil', zone: 1, doodle: 'roots', slots: { copper_ore: 5, tin_ore: 2, coal: 4 }, reward: { gold: 100, sp: 1 }, unlock: 'pick_copper' },
  { id: 'clayworks', zone: 2, doodle: 'pot', slots: { iron_ore: 4, lumite: 2, amber: 1 }, reward: { gold: 250, sp: 1 }, unlock: null },
  { id: 'grotto', zone: 3, doodle: 'crystal', slots: { silver_ore: 4, quartz: 3, amethyst: 1 }, reward: { gold: 700, sp: 1 }, unlock: null },
  { id: 'magma', zone: 4, doodle: 'flame', slots: { gold_ore: 3, magmaite: 2, ruby: 1 }, reward: { gold: 2500, sp: 2 }, unlock: null },
];
export const CARD = Object.fromEntries(WAY_CARDS.map((c) => [c.id, c]));

/**
 * The wardens: a creature that sleeps by a lift stop at the foot of a layer (Generator plan.stations
 * index `station`), tougher than its kind, and drops its heart once. Existing species only.
 */
export const WARDENS = {
  clay: { id: 'clay', kind: 'golem', name: 'Clay Warden', station: 2, hp: 3.2, heart: 'clay_heart', after: 'clayworks' },
  grotto: { id: 'grotto', kind: 'crystal_golem', name: 'Grotto Warden', station: 3, hp: 1.8, heart: 'grotto_heart', after: 'grotto' },
};

// ---------------------------------------------------------------- state helpers
export const wayData = (st) => (st.data.way ||= { cards: {}, done: {}, wardens: {} });
export const cardDone = (st, id) => !!wayData(st).done?.[id];
/** The first card not yet filled (null when the board is done). */
export const currentCard = (st) => WAY_CARDS.find((c) => !cardDone(st, c.id)) || null;
/** { have, need } across a card's slots, and per slot { id, have, need }. */
export function cardProgress(st, id) {
  const c = CARD[id], got = wayData(st).cards[id] || {};
  const slots = Object.entries(c.slots).map(([item, need]) => ({ id: item, need, have: Math.min(need, got[item] || 0) }));
  return { slots, have: slots.reduce((s, x) => s + x.have, 0), need: slots.reduce((s, x) => s + x.need, 0) };
}
/** Is a forge pattern open? (a pick that a card unlocks waits for it) */
export function patternOpen(st, pick) {
  const c = WAY_CARDS.find((k) => k.unlock === pick);
  return !c || cardDone(st, c.id);
}
export const wardenBeaten = (st, id) => !!wayData(st).wardens?.[id];
/** The tier of the pick in paw (1 for none). */
export const pickTier = (st) => st.equipped?.('pick')?.tier || 1;
/** The best pick tier the mole owns. */
export const bestTier = (st) => Math.max(1, ...PICK_LADDER.filter((id) => st.owns?.(id) || st.data.owned?.[id]).map((id) => ITEMS[id].tier || 1));

/**
 * Hand in what the bag holds for the current card (lowest quality first). Returns
 * { card, given: [{ id, n }], filled (the card just completed) } or null when nothing fits.
 */
export function handIn(st) {
  const c = currentCard(st);
  if (!c) return null;
  const w = wayData(st), got = (w.cards[c.id] ||= {});
  const given = [];
  for (const [item, need] of Object.entries(c.slots)) {
    const n = Math.min(need - (got[item] || 0), st.count(item));
    if (n <= 0) continue;
    st.removeItem(item, n, { lowFirst: true });
    got[item] = (got[item] || 0) + n;
    given.push({ id: item, n });
  }
  if (!given.length) return null;
  const p = cardProgress(st, c.id);
  const filled = p.have >= p.need;
  if (filled) w.done[c.id] = st.data.day || 1;
  st.dirty = true;
  st.emit('act', { type: 'way', card: c.id, filled, n: given.reduce((s, g) => s + g.n, 0) });
  return { card: c, given, filled };
}
