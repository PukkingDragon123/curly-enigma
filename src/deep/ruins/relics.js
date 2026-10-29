// Relics of the old ones (the Starfolk): one waits in the strongroom of each dungeon with a sealed
// door (plan.ruins: Generator's DUNGEONS order, the plan entry's `relic`). Items of
// category 'relic' (merged into ITEMS by data/items.js), recorded in the Index (state.discover
// ('relic', id)). Icons: ./relicArt.js. Pure data (data/items.js is imported by the chunk workers).

const R = (id, name, value, t, desc, where) => [id, { name, cat: 'relic', value, icon: { k: 'relic', t }, desc, where }];

export const RELIC_LIST = [
  R('relic_idol', 'Star-Nose Idol', 400, 'idol', 'A little gilded figure with a star of feelers for a nose. Whoever built the shrines had noses like Old Star\'s.', 'a monster room in the Rootsoil'),
  R('relic_sundisc', 'Sun Disc', 900, 'disc', 'A bronze disc rayed with gold. The old ones never saw the sun, and drew it everywhere.', 'a monster room in the Clayworks'),
  R('relic_ewer', 'Well-Keeper\'s Ewer', 1000, 'ewer', 'A tall jug with a spout like a snout. Still cold inside, and still faintly smells of the deep water.', 'a flooded crypt in the Clayworks'),
  R('relic_lens', 'Seer\'s Lens', 2200, 'lens', 'A disc of clear crystal in a bronze ring. Look through it and the dark seems a little thinner.', 'a flooded crypt in the Crystal Grotto'),
  R('relic_tablet', 'Rune Tablet', 2400, 'tablet', 'A slab of carved signs: sun, moon, eye, wave. A list of rules, or a song, or a shopping list.', 'a Starfolk vault in the Crystal Grotto'),
  R('relic_crown', 'Ember Crown', 4800, 'crown', 'A circlet of red gold set with ember stones that never quite go out.', 'a deep fortress in the Magma Deep'),
  R('relic_mirror', 'Sunglass Mirror', 5200, 'mirror', 'A polished bronze mirror that throws back more light than falls on it.', 'a deep fortress in the Magma Deep'),
  R('relic_mask', 'Frost Mask', 8800, 'mask', 'A face of pale blue crystal with a star at the nose. Your breath frosts when you hold it close.', 'a monster room in the Frost Vault'),
  R('relic_key', 'Star Key', 9400, 'key', 'A heavy gold key with a star for a bow. Nothing down here has a lock that small. Something up there might.', 'a Starfolk vault in the Frost Vault'),
  R('relic_orb', 'Void Orb', 15000, 'orb', 'A ball of dark glass with a slow violet storm turning inside.', 'a Starfolk vault in the Core'),
  R('relic_heart', 'Heartstone Amulet', 17500, 'amulet', 'A warm red stone on a gold chain. It beats, very slowly, if you hold it long enough.', 'a deep fortress in the Core'),
];

export const RELIC_ITEMS = Object.fromEntries(RELIC_LIST);
export const RELIC_IDS = RELIC_LIST.map((e) => e[0]);
