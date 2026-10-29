// Lore: the history of the caves, Deep Town and the old miners, the Old Ones who built the ruins,
// Old Star's past and his almost-escape, the star-nosed moles and the creatures. Found in the world
// and written into the book's Lore chapter as you go (src/core/lore.js, state.data.lore).
//
// LORE = [{ id, shelf, src, title, text, by?, ruin?, page?, relic? }]
//   shelf: a SHELVES id (the book's sections)
//   src:   where it's found:
//     'carving'  ruin walls: E on the carved frieze in a ruin (src/deep/Ruins.js) reads the next
//                carving of that ruin's kind (`ruin`), or any carving left
//     'journal'  pages of a foreman's journal, tucked into the tools left at trail cave-ins
//                (src/deep/ruins/trailDress.js), read in page order
//     'tale'     told by Deep Town's folk when you chat with them (`by`: a VILLAGERS id)
//     'relic'    learnt when a ruin's relic comes out of its chest (`relic`: the item id)
//     'book'     books: quest rewards and shelves (game.lore.readShelf(id))
//     'quest'    written in when a quest ends (its reward's `lore`)
//   text: \n splits paragraphs. Carvings are translations of raised runes (read with a paw).
// Old Star's pinned notes (src/data/notes.js) are their own shelf, 'notes'.

export const SHELVES = [
  { id: 'notes', label: "Old Star's Notes", sub: 'Pinned on the board in his workshop', ink: '#8a3a1a' },
  { id: 'oldstar', label: 'Old Star', sub: 'Who he was, and the million he almost had', ink: '#8a3a1a' },
  { id: 'town', label: 'Deep Town', sub: 'Tales from the plaza benches', ink: '#7a5a14' },
  { id: 'miners', label: 'The Old Miners', sub: 'The Lantern & Pick Company, and Hobb\'s journal', ink: '#5a4a2a' },
  { id: 'oldones', label: 'The Old Ones', sub: 'Carvings and relics from the ruins', ink: '#3a5a6a' },
  { id: 'starnose', label: 'Star-Noses', sub: 'Twenty-two fingers on the end of a nose', ink: '#a04a6a' },
  { id: 'creatures', label: 'Creatures', sub: 'What lives in the dark, and why', ink: '#3d6a2a' },
  { id: 'surface', label: 'Up Top', sub: 'The sun, the Express, and the chest in the clearing', ink: '#b07a1a' },
];

const L = (id, shelf, src, title, text, extra = {}) => ({ id, shelf, src, title, text, ...extra });

export const LORE = [
  // ============================================================ the Old Ones: carvings
  L('c_hall_1', 'oldones', 'carving', 'The First Hall', 'WE CAME DOWN FROM THE COLD WITH OUR NOSES TO THE STONE.\nTHE STONE WAS WARM. THE STONE WAS KIND. HERE WE BUILT, AND CALLED IT HOME, AND CALLED OURSELVES THE STARFOLK.', { ruin: 'hall' }),
  L('c_hall_2', 'oldones', 'carving', 'The Pillar Song', 'ONE PILLAR FOR EACH FAMILY. ONE FAMILY FOR EACH PILLAR.\nWHEN A PILLAR FALLS, SING ITS NAME, AND BUILD IT AGAIN A LITTLE TALLER.', { ruin: 'hall' }),
  L('c_shrine_1', 'oldones', 'carving', 'Before the Idol', 'TWENTY-TWO FINGERS HAS THE NOSE, AND EACH FINGER KNOWS A STONE.\nTOUCH THE IDOL\'S FACE AND KNOW YOUR OWN.', { ruin: 'shrine' }),
  L('c_shrine_2', 'oldones', 'carving', 'The Warm Above', 'ABOVE THE STONE IS THE WARM ABOVE, WHERE THE GREAT LAMP HANGS AND NEVER NEEDS OIL.\nNONE OF US HAS SEEN IT. ALL OF US HAVE CARVED IT.', { ruin: 'shrine' }),
  L('c_vault_1', 'oldones', 'carving', 'The Sealing', 'WHEN THE LONG COLD CAME DOWN THE SKY STAIR, WE SHUT THE SKY DOOR BEHIND US\nAND GAVE ITS KEY TO THE DEEPEST VAULT, TO KEEP UNTIL THE STONE GROWS WARM AGAIN.', { ruin: 'vault' }),
  L('c_vault_2', 'oldones', 'carving', 'Rules of the Vault', 'TAKE ONE. LEAVE ONE. SPEAK SOFTLY.\nTHE GUARDIANS ARE PATIENT, BUT THEY ARE NOT DEAF.', { ruin: 'vault' }),
  L('c_well_1', 'oldones', 'carving', 'The Well-Keepers', 'THE KEEPERS OF THE WELLS CARRY LAMPS, AND WALK THEIR ROUNDS, AND DO NOT STOP.\nIF YOU MEET ONE, STEP ASIDE. THEY HAVE BEEN WALKING A VERY LONG TIME.', { ruin: 'well' }),
  L('c_well_2', 'oldones', 'carving', 'Water Remembers', 'WATER GOES DOWN AND COMES UP AGAIN AND GOES DOWN.\nSO WILL WE.', { ruin: 'well' }),
  L('c_any_1', 'oldones', 'carving', 'Gifts Above', 'WE LEFT GIFTS IN THE WARM ABOVE: GOLD IN A BOX, BRIGHT STONES ON THE LID,\nSO THAT THOSE WHO FIND THEM FIND US.', { ruin: '*' }),
  L('c_any_2', 'oldones', 'carving', 'To Whoever Reads This', 'IF YOU READ THIS WITH YOUR PAWS, YOU ARE ONE OF US.\nIF YOU READ IT WITH YOUR EYES, WELCOME ANYWAY. MIND THE FLOOR.', { ruin: '*' }),

  // ============================================================ the Old Ones: relics (the archive's labels)
  L('r_idol', 'oldones', 'relic', 'The Star-Nose Idol', 'A seated figure with a star of feelers for a nose, worn smooth on the face where paws have touched it for centuries.\nProfessor Talpa\'s label: "Note the nose. NOTE THE NOSE."', { relic: 'relic_idol' }),
  L('r_sundisc', 'oldones', 'relic', 'The Sun Disc', 'The Starfolk never saw the sun, and drew it everywhere: rays of gold on bronze, always twelve.\nTwelve rays, twelve months? Nobody down here has ever counted a month.', { relic: 'relic_sundisc' }),
  L('r_ewer', 'oldones', 'relic', 'The Well-Keeper\'s Ewer', 'Carried by the keepers of the wells. The spout is shaped like a snout so the water "knows the way home".\nIt is still cold inside, and still smells of deep water.', { relic: 'relic_ewer' }),
  L('r_lens', 'oldones', 'relic', 'The Seer\'s Lens', 'Crystal ground so true that the dark looks thinner through it. The Starfolk read by touch;\nthis, Talpa thinks, was for whoever came after, with eyes.', { relic: 'relic_lens' }),
  L('r_tablet', 'oldones', 'relic', 'The Rune Tablet', 'Sun, moon, eye, wave, star, key. Read with a paw, the raised signs make a little tune.\nLark has learnt it. It goes up at the end, like a question.', { relic: 'relic_tablet' }),
  L('r_crown', 'oldones', 'relic', 'The Ember Crown', 'Red gold set with ember stones that never quite go out. The Starfolk of the Magma Deep had kings;\nthe others thought this was very funny.', { relic: 'relic_crown' }),
  L('r_mirror', 'oldones', 'relic', 'The Sunglass Mirror', 'A bronze mirror that throws back more light than falls on it. The shrines used them to carry a crystal\'s glow\naround corners, so the idols would always have a sun to look at.', { relic: 'relic_mirror' }),
  L('r_mask', 'oldones', 'relic', 'The Frost Mask', 'A face of blue crystal with a star at the nose. Worn on the Sky Stair, the carvings say,\nwhen the Long Cold came down it.', { relic: 'relic_mask' }),
  L('r_key', 'oldones', 'relic', 'The Star Key', 'The key to the Sky Door, given to the deepest vault "until the stone grows warm again".\nNothing down here has a lock that small. Something up there might.', { relic: 'relic_key' }),
  L('r_orb', 'oldones', 'relic', 'The Void Orb', 'Dark glass with a slow violet storm inside. The Core carvings call it "the dark we came from".\nHold it up to the lamp: the storm leans toward the light.', { relic: 'relic_orb' }),
  L('r_heart', 'oldones', 'relic', 'The Heartstone Amulet', 'A warm red stone that beats, very slowly, if you hold it long enough.\nThe Starfolk said the deep has a heart. They said it was asleep, not gone.', { relic: 'relic_heart' }),

  // ============================================================ the old miners: Hobb's journal (read in page order)
  L('j_1', 'miners', 'journal', 'Hobb\'s Journal, page 1', 'Lantern & Pick Company, Deep Workings. W. Hobb, shift foreman. Day one below.\nThe shaft goes down further than the plans say. The plans were drawn by somebody who never went down. I am starting my own.', { page: 1 }),
  L('j_2', 'miners', 'journal', 'Hobb\'s Journal, page 2', 'Built the first lift today. Hung a bell in it so the lads can ring for home.\nThe rock here is soft and full of copper. The lads are singing. They won\'t be, by the Clayworks.', { page: 2 }),
  L('j_3', 'miners', 'journal', 'Hobb\'s Journal, page 3', 'The walls sing in the third level. Crystal, humming. Young Pell hummed back at it\nand it went off like a firework. Pell is fine. Pell\'s eyebrows are in a better place.', { page: 3 }),
  L('j_4', 'miners', 'journal', 'Hobb\'s Journal, page 4', 'Kobolds took four lanterns from the night shift. Didn\'t touch the gold. Didn\'t touch the food.\nJust the lanterns. Left a little pile of shiny stones where they\'d been, like payment.', { page: 4 }),
  L('j_5', 'miners', 'journal', 'Hobb\'s Journal, page 5', 'Broke into a hall today. Fitted stone, pillars, carvings. Nobody built this. Somebody built this.\nThe smith\'s boy, Astor, ran his nose along the carvings and went very quiet. He has a nose like the ones in the pictures.', { page: 5 }),
  L('j_6', 'miners', 'journal', 'Hobb\'s Journal, page 6', 'Found a cavern you could fit the whole Company in, with a crack in the roof and real daylight pouring down it.\nThe lads stood in it for an hour without a word. We\'re calling it Deep Town. It\'ll need a town to go with it.', { page: 6 }),
  L('j_7', 'miners', 'journal', 'Hobb\'s Journal, page 7', 'A fellow called Augustus Fennimore says the old stair by the town goes all the way up, and he\'ll hang a cable car in it.\nHe says the fare will be very reasonable. He has never said a true word in his life.', { page: 7 }),
  L('j_8', 'miners', 'journal', 'Hobb\'s Journal, page 8', 'The Long Rumble. Three days of it. The Company shaft is gone; the old lifts jammed.\nThe bosses paid Fennimore and went up. The rest of us couldn\'t pay. The rest of us are still here.', { page: 8 }),
  L('j_9', 'miners', 'journal', 'Hobb\'s Journal, page 9', 'Astor went down for one last look at his carvings before we sealed the lower workings. The lift jammed behind him.\nWe tapped on the rock for a week. On the eighth day, he tapped back. Stubborn boy.', { page: 9 }),
  L('j_10', 'miners', 'journal', 'Hobb\'s Journal, last page', 'I\'m staying. Deep Town needs a foreman more than the Company needs a dead one.\nIf you\'re reading this, the trails are yours now. Ring the bells. Mind the clay. — W. Hobb', { page: 10 }),
  L('m_company', 'miners', 'tale', 'The Lantern & Pick Company', '"The Company came down for copper and stayed for gold. Lanterns on every hat, a bell in every lift, a song for every shift.\nThen the Long Rumble came, and the bosses went up the Express, and we stayed down. Best thing that ever happened to us. Don\'t tell the bosses."', { by: 'tuck' }),

  // ============================================================ Old Star
  L('os_astor', 'oldstar', 'tale', 'Astor', '"Old Star? His name\'s Astor. He was the Company smith\'s boy, with that nose on him, always sniffing at the old carvings.\nWhen the lower workings were sealed he went down for one last look, and the lift jammed behind him. Forty years, he was down there on his own. That does something to a mole."', { by: 'tuck' }),
  L('os_shaft7', 'oldstar', 'quest', 'The Night of Shaft Seven', 'Forty years of digging, and Astor had his million. He loaded it into an ore cart, stamped every bag with his red star,\nand pushed it along the old Shaft Seven rail to Deep Town to buy his ticket.\nHalfway, the tunnel gave. The cart went down a crack into the dark. Three cart-hands were buried with it.\nHe dug them out with his paws. Hollis was one of them. Then he went home, and never came back to town.'),
  L('os_stamp', 'oldstar', 'tale', 'The Red Star', '"He stamps everything with that red star of his. Bags, crates, notes, your quest list, probably.\nSays it\'s so he knows what\'s his. I think it\'s so he knows he did it."', { by: 'hollis' }),
  L('os_million', 'oldstar', 'quest', 'What Became of the Million', 'The cart came to rest far below Shaft Seven, in the dark, and lay there until a raccoon found it.\nRocco\'s grandfather built a business on a cart of star-stamped gold. Most of it is long spent. Some of it never was.'),
  L('os_sorry', 'oldstar', 'quest', 'A Purse for Old Star', 'Rocco sent what was left: a purse of star-stamped coins and a note in terrible handwriting.\nOld Star read it twice, laughed once, and put the purse on his mantel. "Not for spending," he said. "For remembering."'),

  // ============================================================ Deep Town
  L('t_sunbeam', 'town', 'tale', 'The Sunbeam', '"There\'s a crack in the roof, and once a day the sun finds it. Only for a little while.\nThe Company men stood in it and wept. Their grandchildren stand in it and say \'warm, isn\'t it\'. That\'s progress, I suppose."', { by: 'mabel' }),
  L('t_festival', 'town', 'quest', 'The Sunbeam Festival', 'Once a year the sun shines straight down the crack, and the whole town stands in the plaza with its eyes shut.\nThere are pies. There are lanterns. Lark sings the Sun Hymn, which was carved in the ruins long before anybody could sing it.'),
  L('t_council', 'town', 'tale', 'The Council of Three', '"Deep Town is run by a council of three: the oldest, the wisest and the loudest.\nIt\'s been the same mole for all three since the Long Rumble. The glow-worm rule was his. Nobody knows why. Don\'t feed them."', { by: 'burdock' }),
  L('t_lift', 'town', 'tale', 'The Town Lift', '"Fifty-one years I cranked that lift. Up, down, up, down. Never dropped a soul.\nBramble says the same. Bramble also says \'twice\'. I have asked. I do not want to know."', { by: 'burdock' }),
  L('t_assay', 'town', 'tale', 'An Honest Scale', '"My great-grandmother built that scale for the Company, and the Company tried to bribe it for sixty years.\nIt never took a coin. Neither do we. Well, we take coins. We don\'t take bribes."', { by: 'assay' }),
  L('t_fountain', 'town', 'tale', 'The Wishing Crystal', '"The crystal in the fountain came up from the Grotto on Burdock\'s lift. It hums when someone wishes.\nI fish here because a wish is the only thing in this town that\'s ever got away from me."', { by: 'puddle' }),
  L('t_letters', 'town', 'tale', 'Letters Up', '"Twice a year the Express sends the mailbag up with the cleaning crew.\nMy granddaughter went up forty years ago. I write to her every time. She writes back about clouds. I don\'t know what clouds are. I love them anyway."', { by: 'loam' }),
  L('t_express', 'town', 'quest', 'The Fennimore Line', 'Augustus Fennimore hung his cable car in the old stair of the Starfolk, which goes up and up through the rock to the light.\nOne way only: the car comes down empty. A million gold a seat, "to cover the rope". Nobody has ever seen the rope.'),
  L('k_tunnel', 'town', 'tale', 'The Ghost of Shaft Seven', '"Everybody knows Shaft Seven\'s haunted. At night you can hear tapping. Tap. Tap. Tap.\nSnorri says it\'s the rock settling. Snorri\'s asleep, though, so how would he know?"', { by: 'tilly' }),

  // ============================================================ star-noses
  L('s_noses', 'starnose', 'tale', 'Twenty-Two Fingers', '"A star-nose has twenty-two little fingers on the end of their nose, and every one of them feels the rock.\nI can tell clay from copper in the dark. Grubb can tell good iron from bad. Old Star, they say, can tell what the rock is thinking."', { by: 'nubs' }),
  L('s_read', 'starnose', 'quest', 'Reading by Nose', 'The runes in the ruins are raised, not cut. Professor Talpa spent forty years trying to read them with his eyes,\nthen watched Nubs read one aloud with his nose in four seconds. The Old Ones wrote for touch. They wrote for noses like theirs.'),
  L('s_kin', 'starnose', 'quest', 'The Starfolk\'s Children', 'The idols have star noses. The carvings say "Starfolk". Grubb, Nubs, Twitch and Old Star have star noses.\nProfessor Talpa\'s conclusion, underlined three times: the Old Ones never left. They had grandchildren.'),
  L('s_return', 'starnose', 'quest', 'Until the Stone Grows Warm', 'The Starfolk shut the Sky Door against the Long Cold and promised to open it "when the stone grows warm again".\nThe sun has been shining down the crack in Deep Town\'s roof for a hundred years. Talpa thinks the stone is warm enough.'),

  // ============================================================ creatures
  L('cr_nibbler', 'creatures', 'tale', 'Rock-Nibblers', '"Rock-nibblers eat clay, mostly. Sometimes fingers. Hold your pick up and they bounce off it, then they sulk.\nOld Star taught you that, didn\'t he? He teaches everyone that. He learnt it the hard way."', { by: 'digby' }),
  L('cr_kobolds', 'creatures', 'tale', 'Kobolds and Their Lanterns', '"Kobolds love lanterns. Not the light: the lanterns. They steal them, polish them, carry them about in little bands.\nThey leave shiny stones where they took one. It\'s payment. It\'s also very annoying."', { by: 'bristle' }),
  L('cr_trolls', 'creatures', 'tale', 'Why Trolls Hate Lamps', '"Trolls sleep in the dark, and they sleep for years. Shine a lamp in a troll\'s eye and it\'s like someone opening the curtains on you.\nYou\'d be cross too. I am, every morning. That\'s why I work nights."', { by: 'snorri' }),
  L('cr_wraiths', 'creatures', 'tale', 'The Lantern-Souls', '"♪ They walk the wells with lamps held high, the keepers who forgot to die... ♪\nThat\'s the ruin wraiths. Old Starfolk well-keepers, still on their rounds. Step aside and they\'ll mostly step past."', { by: 'lark' }),
  L('cr_golems', 'creatures', 'book', 'The Stone Guardians', 'Crystal golems are not animals. The Starfolk built them to guard the vaults and gave them one rule: be patient.\nThey are still being patient. They have been patient for a thousand years. Do not test it.'),
  L('cr_drakes', 'creatures', 'tale', 'Drakes and Their Hoards', '"A drake sleeps on its gold to keep it warm, and the gold keeps the drake warm, and neither of them will move for anybody.\nBring water, bring a shield, and never, ever say \'nice gold\' out loud."', { by: 'garnet' }),
  L('cr_garden', 'creatures', 'quest', 'The Deep Garden', 'Below the Clayworks lie caverns so huge they have weather: ferns, giant bones, and beasts the surface forgot.\nTalpa\'s survey calls it the Deep Garden. The shellbacks graze. The raptors don\'t.'),
  L('cr_fish', 'creatures', 'tale', 'The Blind Fish', '"Blind fish have no eyes because they\'ve never needed them. They can taste a worm across a lake.\nThey don\'t mind being caught. Well. They don\'t say they mind."', { by: 'finn' }),
  L('cr_glow', 'creatures', 'tale', 'Glow-Worms', '"Don\'t feed the glow-worms. The Council says. If you feed them they get fat and dim, and then where are we?\nIn the dark, that\'s where. With fat worms."', { by: 'clover' }),
  L('cr_spiders', 'creatures', 'tale', 'Spinners in the Dark', '"Cave spider silk is the strongest thread there is. It\'s also attached to a cave spider.\nThat\'s the trouble with the best things down here: they all come with something attached."', { by: 'outfitter' }),
  L('cr_hollow', 'creatures', 'tale', 'The Mushroom Hollow', '"Somewhere below, the mushrooms grow taller than houses and glow like lamps.\nThe Hollow breathes, they say. In and out, very slowly. I\'ve heard it. I sell what grows on its doorstep."', { by: 'morel' }),

  // ============================================================ books on shelves (game.lore.readShelf)
  L('b_ledger', 'oldstar', 'book', "Old Star's Ledger", 'A fat ledger with a red star stamped on every page. Forty years of sums in a cramped hand:\nYear 1: 212 g. Year 9: 31,400 g. Year 25: 410,050 g. Year 39: 998,700 g.\nYear 40: 1,000,000 g. Ticket! Then one line, pressed so hard it tore the page: "Shaft Seven." Nothing after it.'),
  L('b_smith', 'miners', 'book', "The Company Smith's Companion", 'Lantern & Pick Company, for the use of its smiths. Rule one: hit it while it\'s hot. Rule two: see rule one.\nIn the margin, in a younger version of Old Star\'s hand: "Rule three: the carvings in the lower halls are LETTERS. Ask Mr. Hobb."'),
  L('b_talpa1', 'oldones', 'book', 'On the Builders of the Halls, vol. I', 'By Prof. A. Talpa. The builders of the halls were, in my estimation, very tidy, very short, and very fond of stairs.\nThey drew the sun everywhere and never once got its colour right. I believe they had never seen it. I believe they wanted to.'),
  L('b_guide', 'town', 'book', 'Deep Town for Newcomers', 'Issued by the Council. Welcome! Please stand in the sunbeam only when it is your turn. Do not feed the glow-worms.\nThe town lift goes down; it also comes up. The Surface Express goes up. It does not come down. Plan accordingly.'),

  // ============================================================ up top
  L('u_chest', 'surface', 'tale', 'You\'re Not the First', '"A box of gold in a clearing, and the ground gives way? You\'re not the first, youngster.\nEvery few years somebody falls through with a box of gold. The box never comes down with them. Funny, that."', { by: 'hollis' }),
  L('u_coop', 'surface', 'tale', 'Houses on Chicken Legs', '"My granny told of huts that walked about on chicken legs, up in the forests, carrying witches and their hens.\nI said she was making it up. Then your hen walked into town in one. I owe Granny an apology."', { by: 'mabel' }),
  L('u_sun', 'surface', 'quest', 'What the Sun Is', 'Mr. Fennimore says the sun is a lamp that never needs oil, so big that it lights the whole sky at once.\nThe town doesn\'t believe him. Lark wrote a song about it anyway. It\'s the most popular song in Deep Town.'),
];

export const LORE_BY_ID = Object.fromEntries(LORE.map((e) => [e.id, e]));
/** Hobb's journal pages in order. */
export const JOURNAL = LORE.filter((e) => e.src === 'journal').sort((a, b) => a.page - b.page);
/** Carvings by ruin kind ('*' fits any ruin). */
export const CARVINGS = LORE.filter((e) => e.src === 'carving');
/** The relic's lore entry. */
export const RELIC_LORE = Object.fromEntries(LORE.filter((e) => e.relic).map((e) => [e.relic, e.id]));
