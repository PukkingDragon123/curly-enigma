// Old Star's lines for the mining lesson. Short, warm and dry: one thought per line. Lines that
// name a control come in two flavours, desktop (d) and touch (t); <kbd> renders as the game's key
// caps. An array means "one of these". MOOD gives each line his face (the tutor's moods: calm,
// happy, stern, proud, worried, laugh); lines not listed are calm.

export const NAME = 'Old Star';
export const VOICE = { pitch: 175, wave: 'triangle' };

export const LINES = {
  // down the lift
  arrive: 'Mind the gap. That cage has eaten better boots than yours.',
  plug: 'My dig\'s behind this wall. I keep it plugged with loam: keeps the nibblers off the lift.',
  plugTip: { d: 'Pick\'s in your paw. Hold the <b>left mouse button</b> and swing at the loam.', t: 'Pick\'s in your paw. Hold the <b>big pick button</b> and swing at the loam.' },
  plugMore: ['That\'s it. Put your back into it.', 'Lovely. Again.', 'Loam\'s soft. So is my back, these days.'],
  plugDone: 'There. Your first hole. I\'m told they get easier.',
  again: 'Back for more? Come on, then. The dig\'s this way.',
  // the crawl
  follow: 'Follow me. Mind your head: I dug this crawl for a shorter mole.',
  walk: ['Nearly there.', 'Watch the step.', 'Don\'t touch the roof. It\'s shy.'],
  wait: ['Keep up! My knees are older than your whole family.', 'This way, dear!'],
  welcome: 'My practice dig. Forty years of holes, and only some of them on purpose.',
  // copper
  oreSee: 'See that glint in the west wall? Copper.',
  oreTip: 'Dig the loam <b>around</b> it, not the ore. A pick bites ore, and bitten ore sells cheap.',
  oreHit: ['Oi! Round it, not through it.', 'Easy! You\'re chipping it.'],
  oreClose: 'Good. Round the edges...',
  oreLoose: 'There she comes!',
  looseTip: { d: 'Pick it up: <kbd>E</kbd>.', t: 'Tap the <b>hand button</b> to pick it up.' },
  oreChisel: 'Here, my spare chisel. Gentler than a pick, and cheaper than regret.',
  heldTip: { d: 'Chisel is <kbd>2</kbd>. Right-drag turns it, the left button chips. <kbd>E</kbd> bags it.', t: 'Tap the <b>chisel</b> on your belt. Drag to turn it, the big button chips, the hand button bags it.' },
  heldPick: 'The pick works too, but it bites. The chisel\'s kinder.',
  oreBagged: 'Into the bag. Clean ore fetches the best price; dirty ore fetches sympathy.',
  oreDropped: 'Dropped it. Happens to the best of us. Mostly to me.',
  // the geode
  gemSee: 'Now hush. Look at the south wall, low down. See it wink?',
  gemTip: 'Something\'s winking in the <b>south wall</b>, low down. Dig in and see.',
  gemWhere: 'South wall, dear. Low down, near the tool barrel.',
  gemDig: 'Gently now...',
  gemOpen: 'A geode! Amethyst inside. Don\'t tell the taxman.',
  gemTake: { d: 'Reach in and take it: <kbd>E</kbd>.', t: 'Tap the <b>hand button</b> to take it.' },
  gemGot: 'Gems hide in hollow stones. If the rock winks at you, wink back with a pick.',
  // the ledge and the map
  ledge: 'My map\'s up on that ledge. These knees retired from ladders years ago.',
  ladderTip: { d: 'Build tool is <kbd>7</kbd>. Aim at the wall under the ledge and click: up goes a ladder.', t: 'Tap the <b>beam</b> on your belt, aim at the wall under the ledge, press the big button.' },
  ladderMode: { d: 'That\'s not a ladder, dear. <kbd>R</kbd> switches what you build.', t: 'That\'s not a ladder, dear. Tap the beam again to switch.' },
  ladderUp: 'Lovely joinery! Up you go: just walk into it.',
  claws: 'Claws! Fine. But a ladder costs you no puff.',
  mapTip: { d: 'The brass tube, that\'s my map. Take it: <kbd>E</kbd>.', t: 'The brass tube, that\'s my map. Tap the <b>hand button</b>.' },
  mapGot: { d: 'Keep it. Every lift, every burrow, every place I\'ve been lost. <kbd>M</kbd> opens it in your book.', t: 'Keep it. Every lift, every burrow, every place I\'ve been lost. Tap the dial to open it.' },
  // the critter
  scratch: 'Hear that? Scratching. A rock-nibbler. They\'re after the copper.',
  blockTip: { d: 'Guard up! <b>Hold the right mouse button</b> (or <kbd>F</kbd>) as it jumps.', t: 'Guard up! <b>Hold the shield button</b> as it jumps.' },
  blockLate: ['Guard UP, dear! Hold it as it jumps, not after.', 'Ow. That\'s what the guard is for.'],
  blocked: ['That\'s it! Again!', 'Good! It hates that.'],
  parried: 'Ha! Right on the jump! That stings them.',
  bonkTip: { d: 'Now give it a tap with the pick, while it\'s dizzy!', t: 'Now a tap with the pick, while it\'s dizzy!' },
  bonkEarly: 'Ha, or that. But guard first: that\'s the lesson.',
  fled: 'And off it goes. They always come back, mind. Like relatives.',
  shoo: 'Shoo! Go on! Back in your hole!',
  // home
  done: 'That\'s enough for one day. Back up we go. Bring the copper: I\'ve plans for it.',
  back: ['This way.', 'Up we go, nearly.'],
  cage: 'In you get. Mind the gap, it\'s still hungry.',
  bell: { d: 'Ring the bell: <kbd>E</kbd>.', t: 'Tap the <b>hand button</b> to ring the bell.' },
  ride: 'Up we go!',
  // anywhere
  excuse: ['Excuse me, dear.', 'Mind your feet, these boots are older than you.'],
  comeBack: ['Hoi! The lesson\'s this way.', 'Don\'t wander off. The dark\'s bigger than you.'],
  notWithout: 'Not without me, I hope!',
  skip: 'Right you are. Back up we go.',
  skipCopper: 'Here, take this lump of copper. I dug it last week. Don\'t ask how long that week was.',
};

export const MOOD = {
  arrive: 'laugh', plugMore: 'happy', plugDone: 'proud', again: 'happy', walk: 'calm', wait: 'stern', welcome: 'proud',
  oreHit: 'stern', oreClose: 'happy', oreLoose: 'happy', oreChisel: 'happy', oreBagged: 'proud', oreDropped: 'laugh',
  gemSee: 'calm', gemOpen: 'laugh', gemGot: 'proud', ledge: 'calm', ladderMode: 'stern', ladderUp: 'happy', claws: 'laugh',
  mapGot: 'proud', scratch: 'worried', blockTip: 'worried', blockLate: 'stern', blocked: 'happy', parried: 'laugh',
  bonkTip: 'happy', bonkEarly: 'laugh', fled: 'laugh', shoo: 'stern', done: 'proud', cage: 'laugh', ride: 'happy',
  comeBack: 'stern', notWithout: 'worried', skip: 'calm', skipCopper: 'laugh',
};

/** The objective (shown only while the quests part has no tracker of its own). */
export const GOALS = {
  arrive: '', plug: 'Dig through the loam plug', walk: 'Follow Old Star into his dig', ore: 'Dig around the copper (not on it)',
  loose: 'Pick up the copper clump', held: 'Chip the clump clean and bag it', gem: 'Find what winks in the south wall',
  gemfound: 'Take the gem', ledge: 'Build a ladder up to the ledge', climb: 'Climb up to the ledge', map: 'Take Old Star\'s map',
  critter: 'Hold your guard as the nibbler jumps', back: 'Follow Old Star back to the lift', cage: 'Ride up with Old Star', ride: '',
};

/** Pick the desktop or touch flavour. */
export const pickLine = (l, touch) => (l && typeof l === 'object' && !Array.isArray(l) ? (touch ? l.t : l.d) : l);
