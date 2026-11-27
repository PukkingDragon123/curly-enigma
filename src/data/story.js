// The story and daily life of Deep Town (wave 21). Data only: the engine is
// src/core/daily.js. Writing rules: docs/DEV_GUIDE.md (short, specific, said by a person).
//
// STAGES: the spine's milestones in order (data/way.js), 0 = just arrived. A stage-keyed table
// ({ 0: [...], 3: [...] }) reads the highest key at or below the current stage.

/** Stage ids by index (what each one means is in BEATS below). */
export const STAGES = ['arrived', 'rootsoil', 'clayworks', 'clay', 'grotto', 'grottoWarden', 'magma'];

/**
 * Old Star's chapter beats: said the next time you talk to him after a milestone (a cutscene that
 * waits for you), then written into the book (lore id). The slate is his old route out of the deep:
 * he chalked it the year he crawled home and never got past the clay.
 */
export const BEATS = {
  1: { lore: 'st_root', lines: [
    ['First card on that slate filled since I chalked it.', 'proud'],
    ['My paws shake on the fine work now. Yours don\'t. That\'s why the bronze is yours to hit.', 'calm'],
  ] },
  2: { lore: 'st_clay', lines: [
    ['Clay card. Good.', 'calm'],
    ['Something sleeps at the foot of the Clayworks. Made of the dig itself.', 'worried'],
    ['The old folk built them to mind doors. Then they forgot which doors. So did the golems.', 'calm'],
  ] },
  3: { lore: 'st_warden1', lines: [
    ['You put the Clay Warden down.', 'proud'],
    ['Forty years back it put me down. Right there by stop two. I lay a week before I crawled home.', 'worried'],
    ['Grubb\'ll get iron again. Town\'s been short since the Rumble.', 'happy'],
  ] },
  4: { lore: 'st_grotto', lines: [
    ['You smell of the Grotto. Wet stone and a hum.', 'calm'],
    ['Go and see Hollis. He hums when he\'s nervous. He\'s been humming forty years.', 'calm'],
  ] },
  5: { lore: 'st_warden2', lines: [
    ['Both of them down.', 'proud'],
    ['I never got this far. Not once. I used to dream the crystal one was sat on my chest.', 'worried'],
    ['One card left. Go and finish my slate.', 'calm'],
  ] },
  6: { lore: 'st_full', lines: [
    ['That\'s the slate full.', 'proud'],
    ['Truth is, when I had the million, I was scared of the Express. Glad the tunnel took it, some days.', 'worried'],
    ['Get your million. I\'ll make mine at the anvil. We\'ll go up the same day.', 'happy'],
  ] },
};

/** Book entries for the beats (added to the Lore chapter, Old Star's shelf). */
export const STORY_LORE = [
  ['st_root', 'The Slate', 'Old Star chalked four cards on a slate the year he crawled home from the deep: one for each layer he\'d have to climb through to bring ore up again.\nHe never filled one. You filled the first.'],
  ['st_clay', 'Doors Nobody Remembers', 'The Starfolk left guardians on the way down, golems of the rock they stood in. They were told to be patient. Nobody told them how long.'],
  ['st_warden1', 'The Clay Warden', 'It sat by the second lift stop since before the Long Rumble. Old Star met it once. He doesn\'t say much about the week after.\nThe iron in Grubb\'s window came up the lift the next morning.'],
  ['st_grotto', 'The Humming Walls', 'Hollis worked the Grotto the night Shaft Seven fell. He hums when the walls hum. Forty years, and he still can\'t stop.'],
  ['st_warden2', 'The Crystal on His Chest', 'Old Star never got past the Grotto Warden. He dreamt about it for forty years. You beat it on a weekday.'],
  ['st_full', 'Two Seats', 'The slate is full. Old Star stamped it with his red star and hung it back on its nail.\n"When you\'ve your million, I\'ll have mine," he said. "Same car. I\'ll take the window."'],
];

// ---------------------------------------------------------------- the townsfolk
/**
 * The core cast: a small arc each (lines by stage, said the first time you chat each day), what
 * they like, and two heart events (at HEART_AT hearts). Everybody else in VILLAGERS gets TASTES_ANY.
 * Tastes: love / like / hate are item ids or a category prefixed with '@' ('@food').
 */
export const HEART_AT = [2, 5];
export const CAST = {
  hollis: {
    arc: {
      0: ['That tunnel\'s boarded for a reason. Sit, if you like. Don\'t ask.'],
      2: ['The clay\'s restless. I can hear it through the boards.'],
      3: ['Clay went quiet this morning. First time in forty years. Was that you?'],
      5: ['Astor told you about that night, then. I was on his cart. When the roof went, I ran.'],
      6: ['Went and knocked on Astor\'s door. He made tea. Neither of us said much. Best talk I\'ve had.'],
    },
    love: ['crystal_tea', 'thyme_tea'], like: ['@food', 'echo_crystal'], hate: ['dynamite', 'bat_guano'],
    events: [
      { lines: [['Can you hear it? Put your ear to the boards.', 'calm'], ['Tap. Tap. That\'s the rock settling. The kids say it\'s a ghost.', 'calm'], ['It\'s me. I come back at night and tap. So the tunnel knows somebody\'s still waiting.', 'worried']] },
      { lines: [['I kept this forty years.', 'calm'], ['Astor\'s cart bell. It came off when the roof dropped. Give it back to him, would you? I can\'t.', 'worried']], gift: { echo_crystal: 1 } },
    ],
  },
  lark: {
    arc: {
      0: ['♪ A new face fell down a hole... ♪ Working on it.'],
      1: ['♪ ...and filled a card with copper ore... ♪ Rhymes with "more". Everything does.'],
      3: ['I wrote you a verse about the Clay Warden. It\'s mostly the word "thud".'],
      5: ['Two wardens. I\'ve run out of words for big rocks. "Boulder" is doing a lot of work.'],
      6: ['The song\'s done. I\'ll sing it the day you go up. Don\'t cry, it puts me off.'],
    },
    love: ['amber', 'honey'], like: ['@food', '@gem'], hate: ['salted_fish', 'slug_slime'],
    events: [
      { lines: [['I\'ve never seen the sun. You have.', 'calm'], ['What colour is it? Really. Not the song colour.', 'thinking'], ['Warmer than that? Huh. I\'ve been singing it wrong.', 'happy']] },
      { lines: [['I tuned the lute to the fountain\'s hum. Listen.', 'happy'], ['That\'s yours. Your tune. Everybody in town gets one eventually. You got yours early.', 'happy']] },
    ],
  },
  nubs: {
    arc: {
      0: ['Is it true you came through the roof? Did it hurt? Can I see the hole?'],
      1: ['You filled a card! Digby says nobody fills cards. Digby\'s wrong.'],
      3: ['Iron\'s coming up the lift again! I hauled six crates. My nose is sore. Worth it.'],
      4: ['I felt the Grotto on your pack. Crystal leaves a fizz. Did you know that? You do now.'],
      6: ['When I grow up I\'m going to fill a slate. My own slate. I\'ve chalked one already.'],
    },
    love: ['quartz', 'amethyst'], like: ['@gem', '@mineral', 'grub_bar'], hate: ['fried_fish', 'salted_fish'],
    events: [
      { lines: [['Close your eyes.', 'happy'], ['Now touch the wall. Nose, not paws. Feel that bump? Copper. That one? Tin.', 'happy'], ['You\'re rubbish at this. It\'s fine. Took me a week.', 'laugh']] },
      { lines: [['I went down to the Clayworks on my own.', 'worried'], ['Don\'t tell Digby. I only went to stop one. Then I came straight back up.', 'worried'], ['I wanted to see what you see. It\'s very dark. You\'re very brave. Or daft.', 'happy']] },
    ],
  },
  mabel: {
    arc: {
      0: ['You\'re thin, dear. Astor doesn\'t feed you. He never fed himself either.'],
      2: ['Tuck says the clay\'s singing. Tuck says a lot of things.'],
      3: ['Grubb has iron in the window! I\'ve not seen that since my wedding.'],
      6: ['I\'m doing a supper for you. Don\'t argue, I\'ve already bought the butter.'],
    },
    love: ['berry_jam', 'cave_berry'], like: ['@food', 'flour', 'butter', 'egg'], hate: ['dino_meat', 'spore_puff'],
    events: [
      { lines: [['Tuck forgets things now. My name, some days.', 'worried'], ['Then he remembers the colour of my scarf at the first festival. Blue. It was blue.', 'calm'], ['Sit with him sometimes. He likes you. He thinks you\'re his old shift partner.', 'happy']] },
      { lines: [['Here. Pie. The good tin.', 'happy'], ['Don\'t give any to Astor. Well. A slice.', 'laugh']], gift: { hearty_pie: 2 } },
    ],
  },
  tuck: {
    arc: {
      0: ['Did you know Astor when he was a pup? No? Funny. You look like somebody.'],
      1: ['Copper card! In my day we filled those with a spoon. Or was that soup.'],
      3: ['The Clay Warden! I fought that. Or I watched somebody fight it. Or I read it.'],
      5: ['You\'ve done what my whole shift couldn\'t. Don\'t tell them. They\'re mostly dead, but still.'],
    },
    love: ['tea_flask', 'root_pie'], like: ['@food', 'coal'], hate: ['frost_parfait'],
    events: [
      { lines: [['Hobb gave me this pick when I was shorter than it.', 'calm'], ['Kept it under the bench. Mabel thinks I threw it out.', 'laugh'], ['Don\'t tell her.', 'calm']] },
      { lines: [['You\'re not my shift partner, are you.', 'thinking'], ['No. He went up on the Express. You stayed. That\'s better.', 'happy']] },
    ],
  },
  snorri: {
    arc: {
      0: ['Zzz... the new one... zzz.'],
      2: ['Something big turned over down there last night. I felt it in the bench.'],
      3: ['Quiet night. Too quiet. I slept through it. Lovely.'],
      6: ['Night shift\'s dull now. Nothing shakes. I might take up knitting.'],
    },
    love: ['tea_flask', 'bubble_tea'], like: ['@food'], hate: ['sleepy_stew'],
    events: [
      { lines: [['I don\'t sleep at night. I watch.', 'calm'], ['Somebody has to. Deep Town\'s small. One bad night and it\'s smaller.', 'worried'], ['Now let me sleep.', 'sleepy']] },
      { lines: [['I saw your lamp come up the lift at two in the morning.', 'calm'], ['Go to bed. That\'s an order. I\'m not in charge of anything, but it\'s still an order.', 'stern']] },
    ],
  },
};

/** Anybody without their own: liked and hated by kind. */
export const TASTES_ANY = { love: [], like: ['@food', '@gem'], hate: ['bat_guano', 'slug_slime', 'dust_fluff', 'slime_gel'] };

/** What they say to a gift, by how they took it. */
export const GIFT_SAYS = {
  love: ['For me? Oh. I\'ll keep this.', 'How did you know?', 'That\'s my favourite. Nobody remembers that.'],
  like: ['Thank you. Really.', 'That\'s kind.', 'Ooh. Nice.'],
  meh: ['Oh. Thanks.', 'I\'ll find a use for it.', 'Right. Ta.'],
  hate: ['Why would you give me this.', 'No. Take it back. No, keep it, I mean, I\'ll... no.', 'Ugh.'],
  again: ['You already gave me something today. Save it.', 'One a day, love. I\'ve no more shelf.'],
};

/** Friendship points: a heart is HEART points; a quest done for them counts as one heart. */
export const HEART = 100, MAX_HEARTS = 8;
export const POINTS = { chat: 20, love: 80, like: 45, meh: 15, hate: -30 };

// ---------------------------------------------------------------- the daily rhythm
/**
 * The cave's mood for the day (Stardew's weather): one per day, from the day and the save.
 * Effects are read by the mine (src/core/daily.js `cave`): forage n+1, ore quality +, dig stamina ×.
 * star: what Old Star says in the morning · lift: what Bramble says.
 */
export const CONDITIONS = [
  { id: 'quiet', w: 4, star: ['Quiet in the rock today.', 'Nothing in the air. Good day for honest digging.'], lift: ['Nice and steady today.'] },
  { id: 'glowcaps', w: 2, forage: 1, star: ['Glowcaps are up. I can smell them from here.', 'Damp night. The glowcaps will be out down there.'], lift: ['Smell that? Mushroom day.'] },
  { id: 'vein', w: 2, oreQ: 12, star: ['Rock\'s been shifting. Fresh faces on the ore today. Clean ones.', 'My nose is itching. Good ore day.'], lift: ['Haulers came up grinning. Good veins showing.'] },
  { id: 'still', w: 2, dig: 0.75, star: ['Still air. The rock\'s soft when it\'s like this.', 'Cool and still. You\'ll dig easy today.'], lift: ['Cool down there. Easy going.'] },
];

/** The day's rumour (said by the plaza gossips, pinned on the notice board). Quiet, specific, small. */
export const RUMOURS = [
  'Pip\'s lost a chair leg. He swears it walked off.',
  'Hazel and Clover aren\'t speaking. Begonias again.',
  'Somebody fed a glow-worm. The Council is "looking into it".',
  'Mr. Fennimore was seen smiling. Nobody knows why. Everyone\'s worried.',
  'Puddle caught something in the fountain. He put it back before anyone saw.',
  'Grubb sneezed on a pick and sold it as "tempered".',
  'Burdock\'s been humming. Burdock doesn\'t hum.',
  'Bristle found a coin in the gutter and handed it in. To herself.',
  'The twins dug a hole in the plaza. Bean says it\'s a cellar.',
  'Dilly\'s mitten turned up in the bread. Hazel says that\'s not her problem.',
  'Talpa\'s been up all night with a carving. He\'s calling it "a sentence, possibly".',
  'Lark sang the sun song in a minor key. Three people cried. One was Snorri, asleep.',
  'Old Vex weighed a cake for a bet. It was exactly what she said.',
  'Somebody painted a star on the lift. Bramble says she likes it.',
];

/** Vex pays more for one ore each day (the daily special). */
export const SPECIAL_BONUS = 1.3;

/** Letters: the Council's welcome, a friend's note at a heart threshold, the milestone letters. */
export const LETTERS = {
  welcome: { from: 'The Council', seal: 'r', text: 'Heard about the hole in Astor\'s roof.\nWelcome to Deep Town. Please don\'t feed the glow-worms.' },
  stage: {
    1: { from: 'Grubb', seal: 'b', text: 'Heard you filled a card. Hrm.\nWhen you\'ve a bronze pick, show me. I want to see the edge.' },
    3: { from: 'Bramble', seal: 'n', text: 'The lift went to stop two and came back full. First time since I was a girl.\nDrinks on me. I don\'t drink. Tea on me.' },
    4: { from: 'Prof. Talpa', seal: 'q', text: 'You were in the Grotto! Did the walls hum in thirds or fifths?\nIt matters. Come by. Mind the ink.' },
    5: { from: 'The Council', seal: 'r', text: 'Both wardens. The Council has voted you the freedom of Deep Town.\nIt doesn\'t mean anything. We voted anyway.' },
    6: { from: 'Granny Mabel', seal: 'o', text: 'Supper at the fountain tonight. For you.\nWear something clean. Astor won\'t, but you can.', gift: { hearty_pie: 1 } },
  },
  /** A friend's note the morning after they reach a heart threshold (name filled in). */
  friend: [
    { text: 'Thought of you today. Don\'t let it go to your head.\n{name}', gift: null },
    { text: 'Left something on your step. It\'s nothing. It\'s a bit something.\n{name}', gift: 'roast_nuts' },
    { text: 'You never sit down. Come and sit down.\n{name}', gift: null },
  ],
};
