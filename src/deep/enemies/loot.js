// What a creature leaves when the mole beats it (Enemies.loot pops each item out as a little glowing
// gem that flies into the backpack). Harvesting a carcass (E) gives info.harvest instead.
import { ORE_SPAWN } from '../../data/ores.js';
import { ITEMS } from '../../data/items.js';

const has = (id) => !!ITEMS[id];

/** Item ids dropped by `e` (zone-aware). */
export function lootFor(e) {
  const z = e.zone, ch = Math.random();
  const ore = (n) => { const l = (ORE_SPAWN[z] || ORE_SPAWN[1]).slice(0, n); let r = Math.random() * l.reduce((s, x) => s + x[1], 0); for (const [id, w] of l) { r -= w; if (r <= 0) return id; } return l[0][0]; };
  const out = [];
  const add = (id, p = 1) => { if (id && has(id) && Math.random() < p) out.push(id); };
  switch (e.kind) {
    case 'pebble_mimic': if (ch < 0.55) out.push(ore(3)); break;
    case 'rubble_golem': out.push(ore(3)); if (Math.random() < 0.3) out.push(ore(4)); break;
    case 'gloom_wisp': add('wisp_essence', 0.18); break;
    case 'ember_imp': add('ember_scale', 0.45); break;
    case 'crystal_wyrm': if (ch < 0.65) out.push(z >= 6 ? (Math.random() < 0.12 ? 'diamond' : 'amethyst') : z === 5 ? (Math.random() < 0.18 ? 'sapphire' : 'quartz') : (Math.random() < 0.5 ? 'amethyst' : 'quartz')); break;
    case 'spore_puffer': add('glowcap', 0.6); break;
    case 'shade_bat': add('bat_guano', 0.3); break;
    case 'crystal_golem': out.push(...e.lootList()); break;
    // the newer folk
    case 'kobold': add('kobold_trinket', e.chief ? 1 : 0.35); if (Math.random() < 0.55) out.push(ore(e.chief ? 4 : 3)); if (e.chief) add('gold_ore', 0.25); break;
    case 'cave_troll': add('troll_tusk', 0.8); add('beast_hide', 1); if (Math.random() < 0.5) out.push(ore(4)); break;
    case 'cave_spider': add('spider_fang', 0.75); add('spider_silk', 0.8); break;
    case 'ruin_wraith': add('wraith_ash', 0.7); if (Math.random() < 0.25) out.push(z >= 5 ? 'sapphire' : 'amethyst'); break;
    case 'cave_slime': add('slime_gel', e.big ? 1 : 0.7); if (e.swallowed) add(e.swallowed, 1); break;
    case 'cave_drake': add('drake_scale', 1); add('drake_scale', 0.5); add(z >= 6 ? 'voidstone' : z === 5 ? 'frostite' : 'magmaite', 0.3); break;
    case 'raptor': add('raptor_claw', 0.65); break;
    case 'tyrant': add('tyrant_tooth', 1); add('tyrant_tooth', 0.4); break;
    case 'shellback': add('armor_plate', e.baby ? 0 : 0.8); break;
    case 'pterosaur': add('ptero_feather', 0.8); break;
  }
  return out;
}
