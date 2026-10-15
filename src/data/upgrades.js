// The upgrade board (tavern) and milestones: small upgrades with levels and rising costs, so the
// numbers keep going up between tool tiers. State reads them (state.upgrade(id), upEffect(id),
// mineBonus(), bagCapacity(), lightRadius(), tavernIncome()); the board is src/ui/Upgrades.js.
//
// UPGRADES[id]: { tab, name, desc, icon, badge, max, effect(level) → value, fmt(value) → text,
//   cost: { gold: [base, growth], items: { level: { itemId: n } } }, req?: { zone, flag, up: [id, lvl] } }
// Level L costs cost.gold[0] · growth^L gold (rounded to two significant figures) plus the items
// listed for that level. Effects are pure numbers; State turns them into bonuses.
import { ITEMS } from './items.js';
import { formatGoldFull } from '../core/util.js';

/** Two significant figures (5s below 100): 1234 → 1200, 167 → 170, 42 → 40. */
export function niceRound(n) {
  if (n < 100) return Math.max(5, Math.round(n / 5) * 5);
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
const TAVERN = [0, 25, 60, 110, 180, 280, 420, 600, 850, 1200];
export const TAVERN_BASE = 12;

export const UPGRADE_TABS = [
  { id: 'dig', name: 'Digging' },
  { id: 'haul', name: 'Hauling' },
  { id: 'blast', name: 'Blasting' },
  { id: 'home', name: 'Tavern' },
  { id: 'gear', name: 'Tools' },
  { id: 'ms', name: 'Milestones' },
];

export const UPGRADES = {
  // ───────────── digging ─────────────
  power: {
    tab: 'dig', name: 'Strong Paws', icon: 'pick_steel', badge: 'up', max: 12,
    desc: 'Every pick blow lands harder. Rock cracks in fewer swings.',
    effect: (l) => 1 + 0.06 * l, fmt: (v) => `${pct(v - 1)} pick power`,
    cost: { gold: [120, 1.62], items: { 3: { copper_ingot: 2 }, 5: { iron_ingot: 2 }, 7: { steel_ingot: 2 }, 9: { silver_ingot: 2 }, 11: { gold_ingot: 1 } } },
  },
  swing: {
    tab: 'dig', name: 'Quick Swing', icon: 'pick_copper', badge: 'fast', max: 8,
    desc: 'A looser grip and a shorter wind-up. More swings a minute.',
    effect: (l) => 1 - 0.04 * l, fmt: (v) => `${Math.round((1 / v - 1) * 100)}% faster swings`,
    cost: { gold: [180, 1.78], items: { 2: { quartz: 2 }, 5: { amethyst: 1 }, 7: { ruby: 1 } } },
  },
  nose: {
    tab: 'dig', name: 'Prospector\'s Nose', icon: 'whisperweed', badge: 'eye', max: 6,
    desc: 'Buried ore glints through the rock from farther away.',
    effect: (l) => 1 + 0.15 * l, fmt: (v) => `${pct(v - 1)} glint range`,
    cost: { gold: [200, 1.9], items: { 3: { lumite: 1 }, 5: { echo_crystal: 1 } } },
  },
  steady: {
    tab: 'dig', name: 'Steady Paws', icon: 'chisel_fine', badge: 'shield', max: 6,
    desc: 'Cleaner clump work: tools that slip onto the ore scratch it less.',
    effect: (l) => 1 - 0.08 * l, fmt: (v) => `${Math.round((1 - v) * 100)}% fewer scratches`,
    cost: { gold: [250, 1.85], items: { 2: { tin_ingot: 2 }, 4: { silver_ingot: 1 } } },
    req: { zone: 2 },
  },
  appraise: {
    tab: 'dig', name: 'Keen Appraisal', icon: 'gold_ore', badge: 'coin', max: 10,
    desc: 'You learn what Old Vex looks for. Ore and gems sell for more.',
    effect: (l) => 0.04 * l, fmt: (v) => `${pct(v)} ore & gem value`,
    cost: { gold: [400, 1.8], items: { 3: { amber: 1 }, 6: { sapphire: 1 }, 9: { diamond: 1 } } },
    req: { zone: 2 },
  },

  // ───────────── hauling ─────────────
  bag: {
    tab: 'haul', name: 'Deeper Pockets', icon: 'bag_large', badge: 'plus', max: 10,
    desc: 'Extra pouches stitched inside the bag. More finds per trip.',
    effect: (l) => 2 * l, fmt: (v) => `+${v} bag space`,
    cost: { gold: [150, 1.7], items: { 2: { rubber_sap: 3 }, 6: { spider_silk: 2 }, 9: { spider_silk: 4 } } },
  },
  stamina: {
    tab: 'haul', name: 'Stamina', icon: 'hearty_pie', badge: 'up', max: 10,
    desc: 'Longer shifts before the paws give out. Permanent, and fills you up on the spot.',
    effect: (l) => 10 * l, fmt: (v) => `+${v} max energy`,
    cost: { gold: [200, 1.7], items: { 4: { hearty_pie: 1 }, 8: { hearty_pie: 2 } } },
  },
  rest: {
    tab: 'haul', name: 'Second Wind', icon: 'tea_flask', badge: 'clock', max: 5,
    desc: 'Stand still for a breath in the mine and energy trickles back.',
    effect: (l) => 0.4 * l, fmt: (v) => `+${v.toFixed(1)} energy/s resting`,
    cost: { gold: [300, 2.1], items: { 1: { glowcap: 3 }, 3: { frostbloom: 1 } } },
    req: { zone: 2 },
  },
  lamp: {
    tab: 'haul', name: 'Brighter Wick', icon: 'helmet_brass', badge: 'star', max: 6,
    desc: 'A trimmed wick and a polished reflector. Your lamp reaches farther.',
    effect: (l) => 0.6 * l, fmt: (v) => `+${v.toFixed(1)} m light`,
    cost: { gold: [160, 1.9], items: { 2: { lumite: 1 }, 4: { lumite: 2 } } },
  },

  // ───────────── blasting ─────────────
  blast: {
    tab: 'blast', name: 'Bigger Bangs', icon: 'dynamite_bundle', badge: 'up', max: 6,
    desc: 'Tighter packing, better powder. Every charge digs a wider crater.',
    effect: (l) => 1 + 0.08 * l, fmt: (v) => `${pct(v - 1)} blast radius`,
    cost: { gold: [300, 1.9], items: { 1: { coal: 4 }, 3: { coal: 8 }, 5: { bioxide: 1 } } },
  },
  throw: {
    tab: 'blast', name: 'Long Throw', icon: 'dynamite', badge: 'fast', max: 4,
    desc: 'A proper overarm toss. Sticks fly farther from your paw.',
    effect: (l) => 1 + 0.15 * l, fmt: (v) => `${pct(v - 1)} throw distance`,
    cost: { gold: [220, 2] },
  },
  spare: {
    tab: 'blast', name: 'Spare Sticks', icon: 'dynamite', badge: 'plus', max: 5,
    desc: 'Grubb throws in extras. Sometimes a thrown stick turns out to be one of them.',
    effect: (l) => 0.08 * l, fmt: (v) => `${Math.round(v * 100)}% chance to keep a stick`,
    cost: { gold: [500, 2] },
    req: { up: ['blast', 1] },
  },
  sticky: {
    tab: 'blast', name: 'Sticky Fuse', icon: 'slug_slime', badge: 'star', max: 1,
    desc: 'A dab of slug slime: charges stick to the first wall or ceiling they hit.',
    effect: (l) => l, fmt: (v) => (v ? 'Charges stick where they land' : 'Charges bounce and roll'),
    cost: { gold: [1500, 1], items: { 0: { slug_slime: 3 } } },
    req: { up: ['blast', 2] },
  },

  // ───────────── the tavern & Nugget ─────────────
  tavern: {
    tab: 'home', name: 'Tavern Taps', icon: 'rootbeer', badge: 'coin', max: 9,
    desc: 'New taps, a warmer hearth, a few more stools. The tavern earns a little more every day.',
    effect: (l) => TAVERN_BASE + TAVERN[l], fmt: (v) => `${v} gold a day`,
    cost: { gold: [500, 2.05], items: { 0: { rootbeer: 4 }, 2: { honey: 4 }, 4: { copper_ingot: 4 }, 6: { silver_ingot: 2 }, 8: { gold_ingot: 2 } } },
  },
  nugget: {
    tab: 'home', name: 'Nugget\'s Nose', icon: 'egg', badge: 'eye', max: 5,
    desc: 'Treats and training. Now and then Nugget scratches up an ore nugget for your bag.',
    effect: (l) => l, fmt: (v) => (v ? `finds ore about every ${Math.round(150 / (0.5 + v * 0.5))} s` : 'Nugget only clucks at ore'),
    cost: { gold: [400, 2.2], items: { 0: { worm: 5 }, 2: { worm: 10 }, 4: { glow_beetle: 2 } } },
    req: { flag: 'nugget' },
  },
};

/** Effect value of an upgrade at a level. */
export function upgradeEffect(id, level) {
  const u = UPGRADES[id];
  return u ? u.effect(Math.max(0, Math.min(u.max, level || 0))) : 0;
}

/** What level `level` → level+1 costs: { gold, items: {id: n} }, or null when maxed. */
export function upgradeCost(id, level) {
  const u = UPGRADES[id];
  if (!u || level >= u.max) return null;
  const [base, growth] = u.cost.gold;
  return { gold: niceRound(base * growth ** level), items: { ...(u.cost.items?.[level] || {}) } };
}

/** null when unlocked, else a short reason ("Reach Clayworks"). zoneNames: ZONES[n].name. */
export function upgradeLock(id, st, zoneNames = []) {
  const r = UPGRADES[id]?.req;
  if (!r) return null;
  if (r.zone && (st.data.zoneMax || 1) < r.zone) return `Reach ${zoneNames[r.zone] || 'zone ' + r.zone}`;
  if (r.flag && !st.flag(r.flag)) return r.flag === 'nugget' ? 'Find Nugget first' : 'Not yet';
  if (r.up && (st.data.upgrades?.[r.up[0]] || 0) < r.up[1]) return `${UPGRADES[r.up[0]].name} level ${r.up[1]}`;
  return null;
}

// ───────────── milestones ─────────────
// stat: a key of state.data.stats, 'deepest', or a function (state) → number. Reached when ≥ at.
// reward: { gold, items: { id: n } }; paid once, the moment it's reached.
const upLevels = (st) => Object.values(st.data.upgrades || {}).reduce((s, n) => s + n, 0);

export const MILESTONES = [
  { id: 'ore_1', name: 'First Find', desc: 'Bag your first ore or gem.', stat: 'ores', at: 1, reward: { gold: 25 } },
  { id: 'ore_10', name: 'Pocketful', desc: 'Bag 10 finds.', stat: 'ores', at: 10, reward: { gold: 80 } },
  { id: 'ore_50', name: 'Sackful', desc: 'Bag 50 finds.', stat: 'ores', at: 50, reward: { gold: 350, items: { dynamite: 3 } } },
  { id: 'ore_200', name: 'Cartload', desc: 'Bag 200 finds.', stat: 'ores', at: 200, reward: { gold: 2000, items: { dynamite_bundle: 2 } } },
  { id: 'ore_1000', name: 'Motherlode', desc: 'Bag 1,000 finds.', stat: 'ores', at: 1000, reward: { gold: 15000 } },
  { id: 'pristine_1', name: 'Not a Scratch', desc: 'Bag a pristine find.', stat: 'pristine', at: 1, reward: { gold: 60 } },
  { id: 'pristine_25', name: 'Gentle Paws', desc: 'Bag 25 pristine finds.', stat: 'pristine', at: 25, reward: { gold: 1500 } },
  { id: 'pristine_100', name: 'Museum Quality', desc: 'Bag 100 pristine finds.', stat: 'pristine', at: 100, reward: { gold: 9000 } },
  { id: 'depth_25', name: 'Into the Clay', desc: 'Dig down to 25 m.', stat: 'deepest', at: 25, reward: { gold: 100, items: { dynamite: 2 } } },
  { id: 'depth_55', name: 'Glimmering', desc: 'Reach the Crystal Grotto (55 m).', stat: 'deepest', at: 55, reward: { gold: 500, items: { dynamite_bundle: 1 } } },
  { id: 'depth_90', name: 'Feel the Heat', desc: 'Reach the Magma Deep (90 m).', stat: 'deepest', at: 90, reward: { gold: 2500, items: { blasting_charge: 1 } } },
  { id: 'depth_130', name: 'Cold Feet', desc: 'Reach the Frost Vault (130 m).', stat: 'deepest', at: 130, reward: { gold: 8000 } },
  { id: 'depth_170', name: 'Heart of the World', desc: 'Reach the Core (170 m).', stat: 'deepest', at: 170, reward: { gold: 25000 } },
  { id: 'golem_1', name: 'Rock Bottom', desc: 'Topple a rubble golem.', stat: 'golems', at: 1, reward: { gold: 500 } },
  { id: 'kills_25', name: 'Pest Control', desc: 'See off 25 cave creatures.', stat: 'kills', at: 25, reward: { gold: 1200 } },
  { id: 'blast_1', name: 'Kaboom!', desc: 'Set off your first charge.', stat: 'blasts', at: 1, reward: { gold: 40, items: { dynamite: 2 } } },
  { id: 'blast_50', name: 'Demolition Mole', desc: 'Set off 50 charges.', stat: 'blasts', at: 50, reward: { gold: 2500, items: { blasting_charge: 2 } } },
  { id: 'tier_3', name: 'Iron Bite', desc: 'Dig with an iron pickaxe or better.', stat: (st) => st.equipped('pick')?.tier || 0, at: 3, reward: { gold: 300 } },
  { id: 'tier_5', name: 'Featherweight', desc: 'Dig with a mithril pickaxe or better.', stat: (st) => st.equipped('pick')?.tier || 0, at: 5, reward: { gold: 6000 } },
  { id: 'weapon_1', name: 'Smith', desc: 'Forge your first weapon.', stat: 'weapons', at: 1, reward: { gold: 150 } },
  { id: 'trips_10', name: 'Regular', desc: 'Come back up from 10 trips.', stat: 'trips', at: 10, reward: { gold: 200 } },
  { id: 'up_10', name: 'Tinkerer', desc: 'Buy 10 upgrade levels.', stat: upLevels, at: 10, reward: { gold: 600 } },
  { id: 'up_40', name: 'Master Miner', desc: 'Buy 40 upgrade levels.', stat: upLevels, at: 40, reward: { gold: 20000 } },
  { id: 'earned_10k', name: 'Pocket Money', desc: 'Earn 10,000 gold in total.', stat: 'earned', at: 10000, reward: { gold: 500 } },
  { id: 'earned_100k', name: 'Nest Egg', desc: 'Earn 100,000 gold in total.', stat: 'earned', at: 100000, reward: { gold: 5000 } },
  { id: 'earned_500k', name: 'Halfway to the Sky', desc: 'Earn 500,000 gold in total.', stat: 'earned', at: 500000, reward: { gold: 25000 } },
];

/** Current value of a milestone's stat. */
export function milestoneValue(m, st) {
  if (typeof m.stat === 'function') return m.stat(st) || 0;
  if (m.stat === 'deepest') return st.data.deepest || 0;
  return st.data.stats?.[m.stat] || 0;
}

/** Toast text for a milestone reached: 'Milestone: <b>Name</b> · +80 gold, 2× Dynamite'. */
export function milestoneText(m) {
  const bits = [];
  if (m.reward?.gold) bits.push(`+${formatGoldFull(m.reward.gold)} gold`);
  for (const [id, n] of Object.entries(m.reward?.items || {})) bits.push(`${n}× ${ITEMS[id]?.name || id}`);
  return `Milestone: <b>${m.name}</b>${bits.length ? ' · ' + bits.join(', ') : ''}`;
}
