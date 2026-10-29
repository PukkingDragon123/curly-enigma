// Crafting for building: what makes what. Paw recipes work anywhere (the Craft tab of the block
// picker); bench recipes need a workbench within reach in the mine (or a crafting spot at home,
// when a scene opens the picker with { bench: true }).
//
//   recipe: { id, out: itemId, n (made), needs: { itemId: count }, bench: bool, hint }
import { ITEMS } from '../../data/items.js';

export const RECIPES = [
  { id: 'planks', out: 'blk_planks', n: 4, needs: { blk_log: 1 }, hint: 'Saw a log into boards' },
  { id: 'sticks', out: 'stick', n: 4, needs: { blk_planks: 1 }, hint: 'Split a plank' },
  { id: 'torch', out: 'blk_torch', n: 4, needs: { stick: 1, coal: 1 }, hint: 'Coal on a stick' },
  { id: 'workbench', out: 'blk_workbench', n: 1, needs: { blk_planks: 4 }, hint: 'Put it down, then craft at it' },
  { id: 'ladder', out: 'blk_ladder', n: 3, needs: { stick: 5 }, bench: true, hint: 'Rails and rungs' },
  { id: 'ladder_vine', out: 'blk_ladder', n: 3, needs: { stick: 2, vine_cut: 3 }, bench: true, hint: 'Vine-tied rungs' },
  { id: 'stonebrick', out: 'blk_stonebrick', n: 4, needs: { blk_cobble: 4 }, bench: true, hint: 'Dress cobble square' },
  { id: 'bricks', out: 'blk_bricks', n: 4, needs: { clay_lump: 4, coal: 1 }, bench: true, hint: 'Fire clay over coal' },
  { id: 'glass', out: 'blk_glass', n: 4, needs: { sand_pile: 4, coal: 1 }, bench: true, hint: 'Melt sand over coal' },
  { id: 'door', out: 'blk_door', n: 1, needs: { blk_planks: 4 }, bench: true, hint: 'Boards, braces, hinges' },
  { id: 'chest', out: 'blk_chest', n: 1, needs: { blk_planks: 6, stick: 2 }, bench: true, hint: 'A box with a lid' },
  { id: 'lantern', out: 'blk_lantern', n: 2, needs: { blk_torch: 1, iron_ingot: 1 }, bench: true, hint: 'A torch in an iron cage' },
  { id: 'axe_stone', out: 'axe_stone', n: 1, needs: { stick: 2, blk_cobble: 2 }, bench: true, hint: 'Cuts wood properly' },
  { id: 'spade_stone', out: 'spade_stone', n: 1, needs: { stick: 2, blk_cobble: 1 }, bench: true, hint: 'Digs soil in big bites' },
];

/** How many of an item the mole has (pockets; tools count as owned). */
export const have = (st, id) => st.count(id);

/** Can a recipe be made now? { ok, missing: [{ id, n, have }], bench } */
export function canCraft(st, r, { bench = false } = {}) {
  const missing = [];
  for (const [id, n] of Object.entries(r.needs)) { const h = have(st, id); if (h < n) missing.push({ id, n, have: h }); }
  const benchOk = !r.bench || bench;
  const toolOwned = ITEMS[r.out]?.cat === 'tool' && st.owns(r.out);
  return { ok: !missing.length && benchOk && !toolOwned, missing, bench: benchOk, owned: toolOwned };
}

/** Make a recipe once: takes the stuff, gives the result (spills to the stash when the pack is full). */
export function craft(st, r, opts = {}) {
  const c = canCraft(st, r, opts);
  if (!c.ok) return { ok: false, ...c };
  for (const [id, n] of Object.entries(r.needs)) st.removeItem(id, n, { lowFirst: true });
  const it = ITEMS[r.out];
  if (it?.cat === 'tool') st.addItem(r.out);
  else st.addItem(r.out, { n: r.n, spill: true });
  st.emit('act', { type: 'craft', id: r.out, n: r.n, recipe: r.id });
  return { ok: true, out: r.out, n: r.n };
}
