// Mine depth zones. The lift stops at every zone the player has reached the bottom of.
export const ZONES = [
  null,
  { id: 1, name: 'Rootsoil', depth: [0, 40], color: '#9a6a3a', desc: 'Soft dirt, tangled roots and clay pockets. Copper, tin and coal.', hazard: 'Loose dirt and the odd cave-in.' },
  { id: 2, name: 'Clayworks', depth: [40, 90], color: '#b8603a', desc: 'Stiff clay and mudstone. Iron, amber and glowing lumite. Rubber vines hang here.', hazard: 'Water pockets, ore slugs.' },
  { id: 3, name: 'Crystal Grotto', depth: [90, 150], color: '#7a8ad9', desc: 'Granite and crystal caves. Silver, gravium, echo crystals and crackling Bioxide.', hazard: 'Bioxide shocks and explosions. Rubber gloves advised.' },
  { id: 4, name: 'Magma Deep', depth: [150, 220], color: '#d9582a', desc: 'Basalt and lava. Gold, rubies and burning magmaite.', hazard: 'Lava and heat. A heat suit is strongly advised.' },
  { id: 5, name: 'Frost Vault', depth: [220, 300], color: '#7ad0f0', desc: 'A frozen abyss. Mithril, moonsilver, sapphires and diamonds.', hazard: 'Biting cold. Thermal gear advised.' },
  { id: 6, name: 'The Core', depth: [300, 400], color: '#c89aff', desc: 'The planet\'s strange heart. Starmetal, adamant, sunstone and voidstone.', hazard: 'Everything. Bring everything.' },
];
export const MAX_ZONE = 6;
