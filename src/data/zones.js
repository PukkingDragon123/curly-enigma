// Mine depth zones. The lift stops at every zone the player has reached the bottom of.
export const ZONES = [
  null,
  { id: 1, name: 'Rootsoil', depth: [0, 40], color: '#9a6a3a', desc: 'Soft dirt and roots. Copper, tin, coal.', hazard: 'Loose dirt. The odd cave-in.' },
  { id: 2, name: 'Clayworks', depth: [40, 90], color: '#b8603a', desc: 'Stiff clay. Iron, amber, lumite, rubber vines.', hazard: 'Water pockets. Ore slugs.' },
  { id: 3, name: 'Crystal Grotto', depth: [90, 150], color: '#7a8ad9', desc: 'Granite and crystal. Silver, gravium, bioxide.', hazard: 'Bioxide bites. Wear rubber.' },
  { id: 4, name: 'Magma Deep', depth: [150, 220], color: '#d9582a', desc: 'Basalt and lava. Gold, rubies, magmaite.', hazard: 'Heat. Get a heat suit.' },
  { id: 5, name: 'Frost Vault', depth: [220, 300], color: '#7ad0f0', desc: 'Frozen. Mithril, moonsilver, sapphires, diamonds.', hazard: 'Cold that bites. Dress warm.' },
  { id: 6, name: 'The Core', depth: [300, 400], color: '#c89aff', desc: 'Starmetal, adamant, sunstone, voidstone. Worse.', hazard: 'Everything. Bring everything.' },
];
export const MAX_ZONE = 6;
