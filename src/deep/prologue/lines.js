// Old Star's lines for the opening. Short and warm: one thought per bubble. Lines that name a
// control come in two flavours, desktop (d) and touch (t); <kbd> renders as the game's key caps.
// Picked by key in src/deep/Prologue.js (say(key)); arrays are said one after another.

export const NAME = 'Old Star';
export const VOICE = { pitch: 175, wave: 'triangle' };

export const LINES = {
  // the landing
  hello: 'Hello? Did somebody just... fall in?',
  overHere: 'Over here, by the crawl! Mind the rocks.',
  again: 'Down the hole again? You\'ll wear it smooth. Now, where were we...',
  // pinned
  rocks: { d: 'Be a dear and dig these rocks off my legs? Hold the mouse button to swing your pick.', t: 'Be a dear and dig these rocks off my legs? Hold the big pick button to swing.' },
  rocksAgain: ['The rocks, dear, on my legs!', 'Swing at the rocks, not at me!', 'My toes have gone to sleep...'],
  rockCheer: ['That\'s one!', 'Oh, lighter already!', 'Nearly there...', 'Careful, those are my toes!'],
  comeBack: ['Hoi! Don\'t leave an old mole under a rockfall!', 'Back this way, young one!'],
  // free
  free: 'Free! Oh, my poor old knees.',
  name: 'I\'m Old Star. Forty years I\'ve been digging my way out of here!',
  hen: 'And a hen! Down a mine! What a day.',
  // ore
  oreSee: 'Now, a miner\'s first lesson. See that glint in the wall? Copper!',
  oreDig: 'Dig the earth around it, not the ore. A pick chips ore, and chipped ore sells cheap.',
  oreHit: 'Easy! Round the edges, not on it.',
  oreClose: 'That\'s it, round the edges...',
  oreLoose: { d: 'There she comes! Pick it up, <kbd>E</kbd>.', t: 'There she comes! Tap the hand button to pick it up.' },
  oreChisel: 'Here, my spare chisel. Chip the rock off it, gently.',
  oreHeld: { d: 'Chisel is <kbd>2</kbd>. Turn it with <kbd>R</kbd> <kbd>F</kbd>, chip with the mouse. <kbd>E</kbd> bags it.', t: 'Tap the chisel on your belt, drag to turn it, the big button chips. The hand button bags it.' },
  orePick: 'The pick works too, but it bites the ore. The chisel\'s kinder.',
  oreBagged: 'Into the bag! Clean ore fetches the best price.',
  oreDropped: { d: 'You dropped it! Pick it up again, <kbd>E</kbd>.', t: 'You dropped it! Tap the hand button to pick it up.' },
  // ladder
  ledge: 'My old map\'s up on that ledge. These knees won\'t do ladders any more.',
  ladder: { d: 'Put up a ladder. Build tool, <kbd>7</kbd>: aim at the wall under the ledge and click.', t: 'Put up a ladder: tap the beam on your belt, aim at the wall under the ledge, press the big button.' },
  ladderMode: { d: 'That\'s not a ladder, dear. <kbd>R</kbd> switches what you build.', t: 'That\'s not a ladder, dear. Tap the beam again to switch.' },
  ladderUp: 'Lovely joinery! Up you go. Just walk into it.',
  claws: 'Ha, claws! But a ladder costs you no puff. Remember that.',
  mapTake: { d: 'The brass tube, that\'s my map. Take it, <kbd>E</kbd>.', t: 'The brass tube, that\'s my map. Tap the hand button.' },
  mapGot: { d: 'It\'s yours now. It shows the way home and every lift you find. <kbd>M</kbd> unfolds it.', t: 'It\'s yours now. It shows the way home and every lift you find. Tap it to unfold.' },
  // lifts
  lifts: 'Old lifts are buried all over the mine. Ring one\'s bell and it carries you home, and back down.',
  follow: 'And the old mine-entrance lift is just through my crawl. Follow me!',
  walk: ['This way, dear!', 'Mind your head.', 'Not far now.'],
  wait: ['Keep up, young one!', 'This way!'],
  plug: 'One last plug of earth between me and that lift. Forty years! Will you do the honours?',
  plugGo: { d: 'Go on, swing!', t: 'Go on, hold the pick button!' },
  out: 'Lamplight! We\'re out!',
  cage: 'In you get. Up top there\'s my old tavern. It\'ll be home for both of us.',
  bell: { d: 'Ring the bell when you\'re ready, <kbd>E</kbd>.', t: 'Tap the hand button to ring the bell.' },
  ride: 'Hold on to your helmet!',
  notWithout: 'Not without me, I hope!',
  skip: 'Right you are. Straight up to the tavern, then!',
};

/** What to do next, for the objective tag (and the talk panel). */
export const GOALS = {
  intro: '',
  rocks: 'Dig the rocks off Old Star',
  freed: 'Listen to Old Star',
  ore: 'Dig around the copper (not on it)',
  loose: 'Pick up the copper clump',
  held: 'Chip the clump clean and bag it',
  ledge: 'Build a ladder up to the ledge',
  climb: 'Climb up to the ledge',
  map: 'Take Old Star\'s map',
  lifts: 'Listen to Old Star',
  walk: 'Follow Old Star to the lift',
  plug: 'Break through to the lift',
  cage: 'Ride the lift with Old Star',
  ride: '',
};

/** Pick the desktop or touch flavour. */
export const pickLine = (l, touch) => (l && typeof l === 'object' && !Array.isArray(l) ? (touch ? l.t : l.d) : l);
