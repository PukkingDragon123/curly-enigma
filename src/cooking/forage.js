// Foraging: how each harvestable cave plant comes out of the ground (the 3D close-ups in
// src/deep/gather play it: sims.js has the rules, models.js / stage*.js the plant in the world).
//
// tech (the hands-on minigame):
//   pull   grip the stem and drag up (ceiling plants: down). The tension needle must sit in the
//          green band: too soft and nothing moves, too hard and the stem strains, then snaps.
//          Wiggling left/right first loosens the roots; pull before they're loose and they tear.
//   peel   moss and lichen mats on a wall: grip the edge and drag sideways, slow and steady.
//   pick   a berry bush, a timing game: a ring closes on one berry at a time; tap as it touches
//          a ripe (red) one, leave the green ones alone.
//   dig    something buried: scrub the soil away (wiggle), then ease it out gently.
//   lift   an egg in a nest: lift it slowly and keep it balanced (lean against the wobble).
//
// form (the close-up model, src/deep/gather/models.js): cap · root · herb · flower · bulb ·
// hang · mat · bush · buried · egg. Quality (q) comes from how cleanly it came out; pristine (p)
// is a whole plant with intact roots.
//
// Pull tuning: band [lo, hi] is the good tension, snap the strain limit (above it the stem strains
// fast), hold the work needed (seconds of good pull, less once loose), needLoose how loose the
// roots must be to come out whole, depth how many pixels sit underground at first.

export const TECH_WORD = { pull: 'PULL!', twist: 'TWIST & PULL!', peel: 'PEEL!', pick: 'PICK!', dig: 'DIG!', lift: 'LIFT!' };

const P = (o) => ({ tech: 'pull', band: [0.3, 0.66], snap: 0.95, hold: 1.4, needLoose: 0.45, depth: 8, ...o });

export const FORAGE = {
  // ---- mushrooms: delicate stems, twist the mycelium loose first
  glowcap: P({ form: 'cap', twist: true, delicate: true, roots: 6, band: [0.22, 0.52], snap: 0.78, hold: 1.0, needLoose: 0.5, depth: 5,
    col: { cap: 0x4ab0ff, hi: 0xbff0ff, gill: 0x7fd8ff, stem: 0xe8e0d0, spot: 0xe0f8ff }, glow: 0x7fd8ff, caps: 2,
    tip: 'Mushrooms tear easily: <b>wiggle</b> them loose, then lift gently.' }),
  gloomshroom: P({ form: 'cap', twist: true, delicate: true, roots: 6, band: [0.25, 0.55], snap: 0.8, hold: 1.1, needLoose: 0.5, depth: 5, spores: true,
    col: { cap: 0x5a2a7a, hi: 0xc8a0e8, gill: 0x3a1a52, stem: 0x6a5a7a, spot: 0xc8a0e8 }, glow: 0x9a70c8, caps: 2,
    tip: 'Yank it and it puffs sleepy spores. <b>Smooth</b> and steady.' }),
  // ---- roots: deep and stubborn, loosen the soil, then a strong steady heave
  cave_carrot: P({ form: 'root', body: 'taper', roots: 5, band: [0.45, 0.8], snap: 1.05, hold: 1.9, needLoose: 0.55, depth: 20,
    col: { body: 0xf0b884, leaf: 0x5aa84a }, leaves: 'feather', tip: 'Roots grip hard: <b>wiggle</b> to loosen the soil, then <b>heave</b>.' }),
  pepperroot: P({ form: 'root', body: 'chili', roots: 4, band: [0.4, 0.72], snap: 0.95, hold: 1.5, needLoose: 0.45, depth: 14,
    col: { body: 0xd83a26, leaf: 0x4a9a3a }, leaves: 'blade', spicy: true }),
  tunnel_tuber: P({ form: 'root', body: 'tuber', roots: 7, band: [0.55, 0.88], snap: 1.12, hold: 2.4, needLoose: 0.65, depth: 22,
    col: { body: 0xb08a5a, leaf: 0x4a8a3a }, leaves: 'blade', tip: 'It\'s a big one. <b>Dig around it</b> (wiggle) before you heave.' }),
  cave_garlic: P({ form: 'root', body: 'bulb', twist: true, roots: 8, band: [0.35, 0.68], snap: 0.92, hold: 1.4, needLoose: 0.6, depth: 13,
    col: { body: 0xf0e8d8, leaf: 0x7aa85a }, leaves: 'blade', tip: '<b>Twist</b> the bulb loose or it tears.' }),
  // ---- herbs and ferns: shallow roots, light touch
  blindfern: P({ form: 'herb', roots: 5, band: [0.18, 0.46], snap: 0.66, hold: 0.8, needLoose: 0.25, depth: 5,
    col: { leaf: 0xd4dcc4, stem: 0x8a9c7c }, fronds: 5 }),
  ashfern: P({ form: 'herb', roots: 5, band: [0.22, 0.5], snap: 0.7, hold: 0.9, needLoose: 0.3, depth: 5,
    col: { leaf: 0x9a9894, stem: 0x5e5e5c }, fronds: 5 }),
  stone_thyme: P({ form: 'herb', roots: 4, band: [0.12, 0.36], snap: 0.52, hold: 0.8, needLoose: 0.3, depth: 4, small: true,
    col: { leaf: 0x86a06a, stem: 0x6a5a3a }, fronds: 7, tip: 'Thyme is tiny: the <b>gentlest</b> tug you can.' }),
  // ---- flowers
  crystal_lily: P({ form: 'flower', delicate: true, roots: 4, band: [0.3, 0.46], snap: 0.6, hold: 1.3, needLoose: 0.4, depth: 7, glass: true,
    col: { petal: 0xb4ecff, hi: 0xffffff, stem: 0x8ac0a8, heart: 0x60c8ff }, glow: 0xb4ecff, petals: 5, tip: 'Glass petals: keep the needle <b>dead steady</b> in the band.' }),
  emberbloom: P({ form: 'flower', roots: 4, band: [0.32, 0.64], snap: 0.9, hold: 1.2, needLoose: 0.35, depth: 7, hot: true,
    col: { petal: 0xffa030, hi: 0xfff0a0, stem: 0x3a2a20, heart: 0xfff4c0 }, glow: 0xffa030, petals: 6, tip: 'It\'s <b>on fire</b>. Be quick about it.' }),
  frostbloom: P({ form: 'flower', roots: 4, band: [0.3, 0.6], snap: 0.85, hold: 1.2, needLoose: 0.35, depth: 7, cold: true,
    col: { petal: 0xd0f2ff, hi: 0xffffff, stem: 0x9ab8c8, heart: 0x80c8ff }, glow: 0xd0f2ff, petals: 6, tip: 'Freezing cold: your paw goes numb if you dawdle.' }),
  core_lotus: P({ form: 'flower', delicate: true, roots: 7, band: [0.38, 0.56], snap: 0.78, hold: 2.4, needLoose: 0.8, depth: 9, lotus: true,
    col: { petal: 0xff7ac0, hi: 0xffd8ee, stem: 0x4a2a5a, heart: 0xffe060 }, glow: 0xff9ad0, petals: 8, tip: 'Legendary. Loosen it <b>all the way</b>, then the softest steady pull.' }),
  bubblebulb: P({ form: 'bulb', roots: 3, band: [0.1, 0.32], snap: 0.48, hold: 1.0, needLoose: 0.3, depth: 6, float: true,
    col: { bulb: 0x7adcd4, hi: 0xb4fff4, stem: 0x5a7a4a }, glow: 0x7adcd4, tip: 'Full of floaty gas. It wants to come up: <b>barely</b> pull.' }),
  // ---- hanging from the ceiling: pull down
  whisperweed: P({ form: 'hang', roots: 4, band: [0.2, 0.5], snap: 0.72, hold: 1.0, needLoose: 0.35, depth: 6,
    col: { strand: 0x9a70c8, tip: 0xe8c8ff, base: 0x4a2e62 }, glow: 0xe8c8ff, tip: 'It hangs from the ceiling: <b>pull down</b>.' }),
  rubber_sap: P({ form: 'hang', roots: 4, band: [0.45, 0.95], snap: 1.25, hold: 2.0, needLoose: 0.3, depth: 6, stretchy: true,
    col: { strand: 0x3e7a34, tip: 0x5aa040, base: 0x3a4820, sap: 0xf8e0a0 }, tip: 'Stretchy vine: pull down <b>long and hard</b>.' }),
  // ---- mats on the wall: peel
  sparkmoss: { tech: 'peel', form: 'mat', zap: true, speed: [0.14, 0.42], col: { a: 0x2a6aa0, b: 0x3a8ad0, spark: 0xc8f4ff, under: 0x1e4a70 }, glow: 0x7fd8ff,
    tip: 'It <b>sparks</b>! Let go when it crackles, peel slowly between.' },
  glow_moss: { tech: 'peel', form: 'mat', speed: [0.12, 0.4], col: { a: 0x3a8a3a, b: 0x5ab84a, spark: 0xb8ffb0, under: 0x2a4a22 }, glow: 0x9af08a,
    tip: 'Grip the edge and <b>peel slowly</b>: too fast and the mat tears.' },
  // ---- the rest
  cave_berry: { tech: 'pick', form: 'bush', ripe: 0xd02a40, unripe: 0x9ac85a, col: { leaf: 0x4e8a3a, stem: 0x6a4a2a }, berries: 11,
    tip: 'Pick the <b>red</b> ones. Green ones aren\'t ready: leave them.' },
  truffle: { tech: 'dig', form: 'buried', fragile: true, band: [0.2, 0.5], snap: 0.7, hold: 1.0, col: { body: 0x3a2a24, hi: 0x6a5048 },
    tip: 'Follow your nose: <b>scrub</b> the soil away, then ease it out.' },
  grub: { tech: 'dig', form: 'buried', wriggle: true, band: [0.25, 0.55], snap: 0.8, hold: 1.1, col: { body: 0xf0e0c0, hi: 0xffffff, head: 0xc8782a },
    tip: 'It wriggles! Dig it out and <b>follow its tug</b> as you pull.' },
  dino_egg: { tech: 'lift', form: 'egg', col: { shell: 0xd8e0c0, spot: 0x6a8a4a, nest: 0x8a6a3a },
    tip: 'Lift it <b>slowly</b> and lean against the wobble.' },
  // creatures' nests (Enemies' eco nests can open the same close-up: see docs/REMAKE.md, 3D gathering)
  drake_egg: { tech: 'lift', form: 'egg', col: { shell: 0xe0703a, spot: 0x8a2e1a, nest: 0x5a3a2a }, heavy: true,
    tip: 'Heavy and warm. Lift it <b>slowly</b>, lean against the wobble.' },
};

/** Spec for an item (or a gentle generic pull for plants without one). */
export function forageSpec(id) {
  return FORAGE[id] || P({ form: 'herb', col: { leaf: 0x6aa84a, stem: 0x5a7a3a }, fronds: 4 });
}

export const PULL_TIP = 'Hold and <b>drag up</b> to pull. Keep the needle in the <b>green</b>. <b>Wiggle</b> sideways to loosen roots.';
