// Relics of the old ones (the Starfolk): one waits in the strongroom of each dungeon with a sealed
// door (plan.ruins: Generator's DUNGEONS order, the plan entry's `relic`). Items of
// category 'relic' (merged into ITEMS by data/items.js), recorded in the Index (state.discover
// ('relic', id)). Icons: ./relicArt.js. Pure data (data/items.js is imported by the chunk workers).

const R = (id, name, value, t, desc, where) => [id, { name, cat: 'relic', value, icon: { k: 'relic', t }, desc, where }];

export const RELIC_LIST = [
  R('relic_idol', 'Star-Nose Idol', 400, 'idol', 'Star nose. Like Old Star\'s.', 'a monster room in the Rootsoil'),
  R('relic_sundisc', 'Sun Disc', 900, 'disc', 'They never saw the sun. Drew it anyway.', 'a monster room in the Clayworks'),
  R('relic_ewer', 'Well-Keeper\'s Ewer', 1000, 'ewer', 'Spout like a snout. Still cold inside.', 'a flooded crypt in the Clayworks'),
  R('relic_lens', 'Seer\'s Lens', 2200, 'lens', 'Makes the dark look thinner.', 'a flooded crypt in the Crystal Grotto'),
  R('relic_tablet', 'Rune Tablet', 2400, 'tablet', 'Sun, moon, eye, wave. Maybe a shopping list.', 'a Starfolk vault in the Crystal Grotto'),
  R('relic_crown', 'Ember Crown', 4800, 'crown', 'Ember stones that never quite go out.', 'a deep fortress in the Magma Deep'),
  R('relic_mirror', 'Sunglass Mirror', 5200, 'mirror', 'Throws back more light than it gets.', 'a deep fortress in the Magma Deep'),
  R('relic_mask', 'Frost Mask', 8800, 'mask', 'Your breath frosts near it.', 'a monster room in the Frost Vault'),
  R('relic_key', 'Star Key', 9400, 'key', 'Nothing down here has a lock that small.', 'a Starfolk vault in the Frost Vault'),
  R('relic_orb', 'Void Orb', 15000, 'orb', 'A slow violet storm, turning.', 'a Starfolk vault in the Core'),
  R('relic_heart', 'Heartstone Amulet', 17500, 'amulet', 'It beats, if you hold it long enough.', 'a deep fortress in the Core'),
];

export const RELIC_ITEMS = Object.fromEntries(RELIC_LIST);
export const RELIC_IDS = RELIC_LIST.map((e) => e[0]);
