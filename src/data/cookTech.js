// Cooking techniques: skill-tree nodes (laid out by the skills tree, ui/SkillTree.js) that open
// the advanced recipes and the minigame steps that go with them. A technique is "known" when its
// node is stamped (state.data.skills.nodes[id], the same check as core/skills.js `has`).
//
//   COOK_TECH[i] = { id: 'cook_xxx', name, icon (skill glyph), desc (≤ 6 words), unlocks: [dish or step ids] }
//
// Gating (src/cooking/gate.js): a recipe whose dish is in some technique's `unlocks` can't be
// cooked until that technique is known (the pantry shows the technique's cue instead of Cook); a
// step listed here falls back to its plain cousin (STEP_FALLBACK) until it is known.
export const COOK_TECH = [
  { id: 'cook_roast', name: 'Roasting', icon: 'flame', desc: 'Turn it over the flame', unlocks: ['skewer', 'zippy_skewer', 'shrimp_skewer', 'root_roast'] },
  { id: 'cook_bake', name: 'Baking', icon: 'bread', desc: 'Bread, pies, a hot oven', unlocks: ['bake', 'sift', 'herb_bread', 'root_pie', 'fish_pie', 'jam_toast'] },
  { id: 'cook_whisk', name: 'Whisking', icon: 'egg', desc: 'Beat it till it\'s light', unlocks: ['whisk', 'grub_pancakes', 'truffle_omelette', 'frost_parfait'] },
  { id: 'cook_grind', name: 'Grinding', icon: 'mortar', desc: 'Pound it to dust', unlocks: ['grind', 'glow_pesto', 'ember_curry'] },
  { id: 'cook_brine', name: 'Brining', icon: 'drop', desc: 'Salt it so it keeps', unlocks: ['salted_fish', 'brined_egg'] },
  { id: 'cook_smoke', name: 'Smoking', icon: 'smoke', desc: 'Low fire, long wait', unlocks: ['drake_jerky', 'smoked_grubs'] },
  { id: 'cook_ferment', name: 'Fermenting', icon: 'jar', desc: 'Leave it. Let it fizz.', unlocks: ['bubble_tea', 'spore_kraut'] },
  { id: 'cook_candy', name: 'Candying', icon: 'honey', desc: 'Honey, boiled till it sets', unlocks: ['berry_jam', 'nut_brittle', 'crystal_tea'] },
];

export const COOK_TECH_BY_ID = Object.fromEntries(COOK_TECH.map((t) => [t.id, t]));

/** Which technique opens this dish or step id (null when it needs none). */
const NEED = {};
for (const t of COOK_TECH) for (const u of t.unlocks) if (!NEED[u]) NEED[u] = t;
export const techFor = (id) => NEED[id] || null;

/** A gated step's plain cousin, used until its technique is known. */
export const STEP_FALLBACK = { skewer: 'fry', bake: 'simmer', sift: 'stir', whisk: 'stir', grind: 'mash' };

/** Is this technique known? (the skill node is stamped; tests can force it with ?tech=all) */
export function techKnown(state, techId) {
  if (!techId) return true;
  if (state?._techAll) return true;
  return !!state?.data?.skills?.nodes?.[techId];
}

/** May this dish or step be used now? */
export const canUse = (state, id) => techKnown(state, techFor(id)?.id);
