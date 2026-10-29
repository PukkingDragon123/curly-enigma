// Life in Old Star's camp (mixed into HomeScene): everything you can use down the steps (Old
// Star, his forge and anvil, the bellows, the quench trough, the fire pit (the cooking spot), his
// armchair, the logs and the stool, the notes board, his chest, the Miners' Board, the lift, the
// door to Deep Town, the coal cart, the spring, the coins in what came down with you, the books, his
// slate), the camp's clock (an hour every 90 s of play since you got up: Old Star sleeps late at
// night), Old Star's paths across the floor, and the camp's ambience: the clock ticking, the spring
// dripping, embers, smoke and steam, dust motes in the lamplight, dirt trickling down the hole you
// fell through, the old planks creaking and the forge breathing.
import * as THREE from 'three';
import { HALL, HOLE, T } from './units.js';
import { SPOTS } from './house.js';
import { openNotes, readSet } from './notes.js';
import { starData } from './starData.js';
import { rand, pick, clamp } from '../core/util.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const CELL = 0.1;
const HOUR_SECS = 90;
const Y = HALL.y;

/** Books on Old Star's shelves (title, and what's inside). */
const BOOKS = [
  ['<b>Ores of the Deep</b>, vol. II', 'Copper sings, iron grumbles, gold says nothing at all. Pencil notes in every margin.'],
  ['<b>The Surface: A Traveller\'s Guide</b>', 'Chapter one: the sky. Chapter two: more sky. Dog-eared at "the sea".'],
  ['<b>One Hundred Soups</b>', 'Ninety-nine of them have glowcaps in. The hundredth is just glowcaps.'],
  ['<b>Hammer &amp; Heat</b>, a smith\'s almanac', '"Strike while it\'s cherry. Quench while it\'s proud. Sleep while you can."'],
  ['<b>The Old Ones</b>, a history', 'Somebody lived in these rocks before the moles. The book doesn\'t know who either.'],
  ['<b>Knitting for Miners</b>', 'A pattern for a scarf with a pocket for a candle. Someone has tried it. Twice.'],
  ['<b>Ledger, years 1 to 40</b>', 'Coins in, coins out. The coins-in column is much tidier.'],
  ['<b>Letters</b>, tied with a ribbon', 'All addressed to "Marigold". None of them sent. You put them back.'],
];

export class WorkshopLife {
  // ------------------------------------------------------------ interactables
  addCaveInteractions() {
    const c = this.cave, S = SPOTS;
    const star = this.star;
    if (star?.rig) {
      this.addIt({
        r: 0.34, label: () => (star.mode === 'sleep' ? 'Old Star is asleep' : 'Talk to Old Star'),
        sphereFn: (v) => (star.mode === 'sleep' ? v.copy(star.pos).add(_w.set(0, 0.35, 0)) : star.head(v).add(_w.set(0, -0.16, 0))), enabled: () => !star.scripted, action: () => this.talkStar(),
      });
    }
    // his forge: the anvil and the forge itself both take you to work
    const forgeLabel = () => (this.lessonStage?.() === 'forge' ? 'Forge with Old Star' : 'Work the forge');
    this.addIt({ box: [S.forge.x - 0.6, Y, S.forge.z - 0.42, S.forge.x + 0.6, Y + 0.62, S.forge.z + 0.45], label: forgeLabel, action: () => this.useForge() });
    this.addIt({ box: [S.anvil.x - 0.32, Y, S.anvil.z - 0.3, S.anvil.x + 0.32, Y + 0.75, S.anvil.z + 0.3], label: forgeLabel, action: () => this.useForge() });
    this.addIt({ box: [S.bellows.x - 0.48, Y + 0.2, S.bellows.z - 0.26, S.bellows.x + 0.48, Y + 0.75, S.bellows.z + 0.26], label: 'Pump the bellows', action: () => this.pumpBellows() });
    this.addIt({ box: [S.trough.x - 0.22, Y, S.trough.z - 0.52, S.trough.x + 0.22, Y + 0.45, S.trough.z + 0.52], label: 'The quench trough', action: () => this.lookTrough() });
    // the fire pit (the cooking spot: the old label kept for the lessons and the tests)
    const cookLabel = () => (this.lessonStage?.() === 'cook' ? 'Cook with Old Star' : 'Cook at the range');
    const F = S.fire;
    this.addIt({ box: [F.x - 0.45, Y, F.z - 0.45, F.x + 0.45, Y + 0.95, F.z + 0.45], label: cookLabel, action: () => this.useHearth() });
    for (const f of c.furn) {
      if (f.id === 'chair') this.addIt({ box: f.box, label: 'Sit', action: () => this.sitAt(f) });
      if (f.id === 'sofa') this.addIt({ x: S.sofa.x, y: Y + 0.3, z: S.sofa.z, r: 0.4, label: 'Sit on the settee', action: () => this.sitAt(f) });
      if (f.id === 'armchair') this.addIt({ x: S.armchair.x, y: Y + 0.35, z: S.armchair.z, r: 0.3, label: 'Sit in Old Star\'s armchair', enabled: () => !star || star.spot !== 'armchair' || star.mode === 'walk', action: () => this.sitAt(f) });
    }
    // his notes and his chest
    const b = c.boardAt;
    this.addIt({ box: [b.x - (b.nx > 0 ? 0.04 : 0.12), b.y, b.z - 0.55, b.x + (b.nx > 0 ? 0.14 : 0.1), b.y + 0.95, b.z + 0.55], label: () => { const n = this.unreadNotes(); return n ? `Read Old Star's notes (${n} new)` : 'Read Old Star\'s notes'; }, action: () => this.readNotes(this.noteUnderCrosshair()) });
    this.addIt({ box: [S.chest.x - 0.33, Y, S.chest.z - 0.3, S.chest.x + 0.33, Y + 0.42, S.chest.z + 0.3], label: () => (this.chest?.hasLoot ? 'Open Old Star\'s chest' : 'Open the trunk'), action: () => this.chest?.use() });
    // the Miners' Board, the lift, the coal cart
    const m = c.minersAt;
    this.addIt({ box: [m.x - 0.05, m.y, m.z - 0.6, m.x + 0.12, m.y + 0.8, m.z + 0.6], label: 'Miners\' Board', action: () => this.useMinersBoard() });
    const liftLabel = () => (this.inCage() ? 'Pull the lever' : this.lessonRide?.() ? 'Ride down to the dig' : 'Ride the lift');
    const SH = this.shaftBox;
    this.addIt({ box: SH, label: liftLabel, action: () => this.useLift() });
    this.addIt({ box: [S.cart.x - 0.3, Y, S.cart.z - 0.4, S.cart.x + 0.3, Y + 0.62, S.cart.z + 0.4], label: () => (this.cartReady() ? 'Take coal from the cart' : 'The old mine cart'), action: () => this.useCart() });
    // the old door to Deep Town
    const P = c.passage;
    if (this.doorOpen) this.addIt({ box: [P.x - 0.45, Y, P.z - 0.1, P.x + 0.45, Y + 1.2, P.z + 0.35], label: 'Through to Deep Town', action: () => this.leave() });
    else this.addIt({ box: [P.x - 0.55, Y, P.z - 0.1, P.x + 0.55, Y + 1.2, P.z + 0.55], label: 'The front door: caved in', action: () => this.blockedDoor() });
    // the spring, the coins in what came down with you
    const pump = c.dyn.pump;
    this.addIt({ x: pump.x, y: pump.y - 0.12, z: pump.z + 0.05, r: 0.24, label: () => (this.poolToday() ? 'The spring' : 'Drink from the spring'), action: () => this.drinkPool() });
    for (const [i, g] of (c.glints || []).entries()) this.addIt({ x: g.x, y: g.y, z: g.z, r: 0.14, label: g.gem ? 'Pick up the gem' : 'Pick up the coins', enabled: () => !this.glintTaken(i), action: () => this.takeGlint(i) });
    // things to look at
    for (const o of c.looks) {
      if (o.special) continue; // (the gramophone, the bath, the telescope...: houseLife.js)
      const it = { label: o.label, reach: 2.6 };
      if (o.box) it.box = o.box; else Object.assign(it, { x: o.x, y: o.y, z: o.z, r: o.r });
      it.action = () => {
        this.game.audio.play(o.books ? 'page' : 'glow', { vol: 0.4 });
        // his shelf of books: the lore reader (his ledger among them) when the quests part is loaded
        if (o.books) { if (this.game.lore?.readShelf) this.game.lore.readShelf('oldstar'); else { const [t, txt] = pick(BOOKS); this.think(`${t}: ${txt}`, 5); } }
        else if (o.clock) this.lookClock();
        else if (o.window) this.lookOut();
        else this.think(pick(o.lines), 4.2);
        if (o.aside) this.later(0.9, () => this.starAside(o.aside));
      };
      this.addIt(it);
    }
  }

  lookTrough() {
    const a = this.game.audio, t = this.cave.dyn.troughAt;
    a.play('drip', { vol: 0.5 });
    this.cave.ripple('trough', t.x + rand(-0.2, 0.2), t.z + rand(-0.1, 0.1), 1);
    this.think(pick(['Black water, cold as the deep. Old Star quenches his blades in it.', 'A ladle hung over the side, and a skin of soot on the water.']), 3);
  }

  lookClock() {
    const h = this.clockHours(), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const say = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'in the morning' : hh < 18 ? 'in the afternoon' : 'in the evening'}`;
    this.game.audio.play('click', { vol: 0.3 });
    this.think(`A battered alarm clock, one bell bent flat. It says ${say}, give or take. Old Star winds it every Sunday, whichever day that is.`, 4.2);
  }

  lookOut() {
    this.think(pick([
      'A cavern so big it has weather. Crystals glow down the cliffs like lanterns, and far off, somebody\'s windows are lit.',
      'Waterfalls fall into the mist. Glowcaps light the ledges teal and violet. No way down from here: it\'s a sheer drop.',
      'Glow-worms all over the roof of the cavern, like the stars Old Star talks about.',
    ]), 4.6);
    const p = this.rig.player.pos;
    for (let i = 0; i < 6; i++) this.fx.mote?.(p.x + rand(-0.4, 0.4), p.y + 0.9 + rand(-0.2, 0.2), p.z + rand(-0.4, 0.4), [0.6, 1, 0.9]);
  }

  // ------------------------------------------------------------ the forge, the hearth
  useForge() {
    if (this.scripted) return;
    this.rig.vm?.impact('none', 0.25);
    const tut = this.lessonStage?.() === 'forge';
    if (tut) this.prepForgeLesson?.();
    this.beginScript();
    this.game.audio.play('clunk', { vol: 0.5 });
    this.game.goto('forge', { from: 'home', ...(tut ? { tutorial: true } : {}) }, { transition: 'iris', dur: 0.5 });
  }

  useHearth() {
    if (this.scripted) return;
    this.rig.vm?.impact('none', 0.25);
    const tut = this.lessonStage?.() === 'cook';
    if (tut) this.prepCookLesson?.();
    this.beginScript();
    this.game.audio.play('stir');
    this.game.goto('cooking', { from: 'home', ...(tut ? { tutorial: true } : {}) }, { transition: 'iris', dur: 0.5 });
  }

  pumpBellows() {
    const a = this.game.audio;
    a.play('bellows', { vol: 0.8 });
    this.rig.vm?.impact('none', 0.3);
    this.bellowsT = 0.9;
    this.forgeAir = 1;
    const f = this.cave.dyn.forge.fire;
    for (let i = 0; i < 16; i++) this.fx.ember(f.x + rand(-0.15, 0.15), f.y + 0.05, f.z + rand(-0.1, 0.1));
    if (this.star && this.star.mode !== 'sleep' && !this.star.scripted && Math.random() < 0.5) this.later(0.6, () => this.starAside('bellows'));
  }

  // ------------------------------------------------------------ Old Star
  /** E on Old Star: the lessons have their own talk (lessons.js); otherwise a tip for where you are. */
  talkStar() {
    const star = this.star;
    if (!star?.rig) return null;
    this.rig.vm?.impact('none', 0.2);
    this.game.state.emit('act', { type: 'talk', npc: 'oldstar' });
    if (star.mode === 'sleep') {
      star.say(pick(['Zzz… hm? Oh… it\'s you. Mind the fire, it\'s… zzz…', 'Mmf… sixty years… in the rock… zzz.', 'Zzz… a million… and one… zzz.']), { card: false, life: 3.2 });
      this.game.audio.play('snore', { vol: 0.3 });
      return null;
    }
    star.attend();
    // back from the dig with his copper (but not by the cage): hand it over now
    if (this.lessonStage?.() === 'mine' && this.game.state.count('copper_ore') > 0 && !star.scripted) { this.onLessonArrival('lift'); return 'copper'; }
    if (this.lessonTalk?.()) return 'lesson';
    const line = this.nextTip();
    star.say(line.text, { mood: line.mood, convo: true }); // a cutscene: he turns to you, the words float by him
    return line.text;
  }

  /** A remark from Old Star about something you just did, when he's near and awake. */
  starAside(what) {
    const star = this.star;
    if (!star?.rig || star.scripted || star.mode === 'sleep') return;
    const d = Math.hypot(star.pos.x - this.rig.player.pos.x, star.pos.z - this.rig.player.pos.z);
    if (d > 6.5) return;
    const lines = {
      dream: [['Four hundred and eighty thousand. I had it in a sack under that bed. Then I trusted a raccoon. Long story.', 'worried'], ['We\'ll chalk it up again, you and me. From the bottom. It\'s the only way anybody ever climbs.', 'proud']],
      suitcase: [['Packed it the week I had half the fare. Never unpacked it. Bad luck, unpacking.', 'worried'], ['There\'s a clean shirt in there for the day we go. Folded. Sixty years folded.', 'laugh']],
      trinkets: [['That ticket was for the 9:15 up. Tore it in half the day the money went. Glued it the day after.', 'worried'], ['The shell? Marigold\'s. She said if you hold it to your ear you hear the sea. I hear the forge. Same thing, nearly.', 'calm']],
      portrait: [['Marigold. Best cook in Deep Town, worst singer. She\'d have liked you.', 'calm']],
      sea: [['That\'s the sea. Blue all the way to the edge. One day I\'ll tell you if the painting\'s any good.', 'happy']],
      books: [['Borrow anything you like. Bring it back with fewer jam stains than I would.', 'laugh'], ['I\'ve read every one twice. The soup book three times.', 'happy']],
      hole: [['Came down through my roof like a sack of turnips, you did. Hen and all. Landed on my good dirt.', 'laugh'], ['That\'s sixty feet of loose rock up there. We go out the proper way: the Surface Express.', 'calm']],
      bellows: [['Easy on my bellows! Long, steady pulls. You\'ll learn.', 'stern'], ['Hear that roar? That\'s the forge saying thank you.', 'happy']],
      coins: [['Fell in with you, those. Keep \'em. First coins toward the million.', 'happy']],
      pool: [['Best water in the deep, that spring. Sixty years and it\'s never once run dry.', 'proud']],
    }[what] || this.houseAsides?.(what);
    if (!lines) return;
    const [text, mood] = pick(lines);
    star.say(text, { mood, key: 'aside' });
  }

  /** Tips that rotate, depending on how far you've got. */
  nextTip() {
    const st = this.game.state, d = st.data, sd = starData(st);
    const out = [];
    const unread = this.unreadNotes();
    if (unread) out.push({ text: `I've pinned ${unread === 1 ? 'a note' : unread + ' notes'} on my board you haven't read. Sixty years of digging, scribbled down for whoever came next.`, mood: 'calm' });
    if (!st.flag('escaped')) out.push({ text: 'Deep Town\'s just out of my front door and up the old passage. Caved in years back. Find the town gate from below, in the mine, and we\'ll have a road again.', mood: 'worried' });
    else out.push({ text: 'Sell your ore and blades in town. The assay office pays for pristine stones: chisel and brush them free, don\'t smash them.', mood: 'calm' });
    out.push({ text: `A million gold for the Surface Express. You've ${st.gold >= 1000 ? 'a start' : 'a long way to go'}: <span class="gold-txt">${st.gold.toLocaleString()}</span>. Every blade counts.`, mood: st.gold > 100000 ? 'proud' : 'calm' });
    out.push({ text: 'Iron wants a quench. Copper doesn\'t care. Heat it to cherry, hammer it, and into my trough while it still glows.', mood: 'calm' });
    out.push({ text: 'There are old lifts all over the mine. Dig one out and ring its bell, and it\'ll bring you home any time.', mood: 'happy' });
    out.push({ text: 'Low on energy? Eat. The pot\'s always on, and your hen lays more when you pet her.', mood: 'happy' });
    out.push({ text: 'Better picks dig faster. The Miners\' Board in the hall: that\'s where the money goes. Better tools, bigger bags.', mood: 'calm' });
    out.push({ text: 'The coal cart by the lift fills up again overnight. Don\'t ask me how. Don\'t ask anyone how.', mood: 'laugh' });
    out.push({ text: 'Mind the deep water and the hot rock lower down. The mine gets meaner the deeper you go.', mood: 'worried' });
    out.push({ text: 'Sleep in your own bed up the steps. A tired mole digs crooked, and a crooked tunnel caves in.', mood: 'stern' });
    if ((d.weapons || []).length) out.push({ text: `${d.weapons.length} blade${d.weapons.length > 1 ? 's' : ''} in your pack. Not bad. Not bad at all. Your granny would be proud. Probably.`, mood: 'proud' });
    const i = (sd.talkI || 0) % out.length;
    sd.talkI = i + 1;
    st.dirty = true;
    return out[i];
  }

  // ------------------------------------------------------------ notes
  unreadNotes() { const r = readSet(this.game.state); return this.notes.filter((n) => !r.has(n.id)).length; }

  /** Which note the crosshair is on (index), or the first unread one. (The board faces along x: nx.) */
  noteUnderCrosshair() {
    const eye = this.rig.eye(_v), f = this.rig.forward(_w);
    const b = this.cave.boardAt, nx = b.nx ?? 1;
    if (f.x * nx < -0.05) {
      const t = (b.x + nx * 0.06 - eye.x) / f.x;
      const y = eye.y + f.y * t, z = eye.z + f.z * t;
      let best = -1, bd = 0.14;
      this.cave.notePins.forEach((p, i) => { const d = Math.hypot(p.y - y - 0.08, p.z - z); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) return best;
    }
    const r = readSet(this.game.state);
    return Math.max(0, this.notes.findIndex((n) => !r.has(n.id)));
  }

  readNotes(i = 0) {
    if (!this.notes.length) return null;
    this.rig.vm?.impact('none', 0.2);
    return openNotes(this.game, this.notes, i, { onChange: () => this.refreshPins(), onClose: () => { this.refreshPins(); this.game.state.save(); } });
  }

  /** The pin heads on the board: red until read. */
  refreshPins() {
    const d = this.cave.dyn.board;
    const r = readSet(this.game.state);
    const flags = this.notes.map((n) => r.has(n.id));
    const key = flags.join();
    if (key === this.pinKey) return;
    this.pinKey = key;
    if (this.pinMesh) { this.room.remove(this.pinMesh); this.pinMesh.geometry.dispose(); }
    const m = d.pins(flags);
    const b = this.cave.boardObj;
    m.position.copy(b.position);
    m.rotation.copy(b.rotation);
    this.room.add(m);
    this.pinMesh = m;
  }

  // ------------------------------------------------------------ the board, the cart, the winch, the basin, the coins
  useMinersBoard(tab) {
    const ui = this.game.ui;
    this.rig.vm?.impact('none', 0.2);
    if (typeof ui.openUpgrades === 'function') { this.game.audio.play('page'); return ui.openUpgrades(tab); }
    this.game.audio.play('click');
    this.think('Notices: "Tools wanted." "Better pick. Bigger bag. Brighter lamp." Someday.', 4);
    return null;
  }

  cartReady() { return (starData(this.game.state).cartDay ?? 0) < this.game.state.data.day; }

  useCart() {
    const st = this.game.state, sd = starData(st);
    this.rig.vm?.impact('none', 0.25);
    if (!this.cartReady()) { this.game.audio.play('clunk', { vol: 0.4 }); this.think(pick(['Just coal dust and a lost button. It fills again overnight, Old Star says.', 'Empty. Tomorrow.']), 2.6); return 0; }
    sd.cartDay = st.data.day;
    const n = 3;
    st.addItem('coal', { spill: true, n });
    this.game.audio.play('debris', { vol: 0.5 });
    this.later(0.3, () => this.game.audio.play('pickup'));
    const p = SPOTS.cart;
    this.fx.dust(p.x, Y + 0.6, p.z, 10, [0.18, 0.17, 0.2], 0.12);
    this.floatAt(p.x, Y + 0.85, p.z, `+${n} coal`, '#d8d0c8');
    st.save();
    return n;
  }

  turnWinch() {
    const a = this.game.audio;
    a.play('creak', { vol: 0.6 });
    this.later(0.25, () => a.play('click', { vol: 0.5 }));
    this.later(0.5, () => a.play('creak', { vol: 0.4 }));
    this.rig.vm?.impact('none', 0.3);
    this.rig.shake(0.05);
    this.think(pick(['Click, click, click. The rope runs up into the dark and does nothing much.', 'It still turns. Old Star greases it every spring, whatever spring means down here.']), 2.8);
  }

  poolToday() { return (starData(this.game.state).poolDay ?? 0) >= this.game.state.data.day; }

  drinkPool() {
    const st = this.game.state, a = this.game.audio, sd = starData(st);
    a.play('slurp');
    const w = this.cave.dyn.poolWater, pump = this.cave.dyn.pump;
    a.play('creak', { vol: 0.35 });
    this.later(0.25, () => a.play('splash', { vol: 0.25 }));
    if (w) for (let i = 0; i < 3; i++) this.later(0.2 + i * 0.12, () => this.cave.ripple('pool', w.x + rand(-0.05, 0.05), w.z + rand(-0.05, 0.05), 1.2));
    for (let i = 0; i < 10; i++) this.fx.droplet(pump.x + rand(-0.01, 0.01), pump.y - 0.02, pump.z + rand(-0.01, 0.01), rand(-0.05, 0.05), rand(-0.6, -0.2), rand(-0.05, 0.05), 0.4, [0.7, 0.88, 1], 0.008);
    this.rig.vm?.impact('none', 0.25);
    if (!this.poolToday()) {
      sd.poolDay = st.data.day;
      st.restoreEnergy?.(6);
      this.floatAt(pump.x, pump.y + 0.1, pump.z, '+6 energy', '#bff0a0');
      this.later(0.8, () => this.starAside('pool'));
    }
    this.think(pick(['Cold and clean. It tastes of stone.', 'Ahh. Better than any tea in town.']), 2.4);
  }

  glintTaken(i) { return !!(starData(this.game.state).glints || [])[i]; }

  takeGlint(i) {
    const st = this.game.state, sd = starData(st);
    sd.glints ||= [];
    if (sd.glints[i]) return;
    sd.glints[i] = 1;
    const g = this.cave.glints[i];
    if (g.gem) { st.addItem('quartz', { spill: true, q: 70, n: 1 }); this.game.audio.play('pickup_gem'); this.floatAt(g.x, g.y + 0.15, g.z, '+1 Quartz', '#bff6ff'); }
    else { const n = 5 + i * 3; st.addGold(n, 'rubble'); this.game.audio.play('coins', { n: 3 }); this.floatAt(g.x, g.y + 0.15, g.z, `+${n} gold`, '#ffd34a'); }
    if (this.glintHalos?.[i]) { this.glow.remove(this.glintHalos[i]); this.glintHalos[i] = null; }
    this.hideGlint?.(i);
    st.save();
    if (sd.glints.filter(Boolean).length === 1) this.later(0.7, () => this.starAside('coins'));
  }

  // ------------------------------------------------------------ the cave clock
  /** Hours on the cave clock (7 when you get up, an hour every 90 s of play). */
  clockHours() {
    const d = this.game.state.data, t = starData(this.game.state);
    if (t.wakeDay !== d.day || t.wake === undefined) { t.wakeDay = d.day; t.wake = d.playTime; }
    return Math.min(23.9, 7 + (d.playTime - t.wake) / HOUR_SECS);
  }

  setClock(h) {
    const d = this.game.state.data, t = starData(this.game.state);
    t.wakeDay = d.day;
    t.wake = d.playTime - (h - 7) * HOUR_SECS;
  }

  // ------------------------------------------------------------ Old Star's way about
  /**
   * The walkable grid of the home's floors (the house, its doorways, the steps and your room),
   * clear of every solid thing at shin height with Old Star's width round them. Rebuilt with the
   * collision (your room's furniture moves).
   */
  buildStarGrid() {
    const x0 = HALL.x0, x1 = Math.max(HALL.x1, this.W * T + 0.2), z0 = HALL.z0, z1 = this.D * T + 0.1;
    const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL);
    const solid = new Uint8Array(nx * nz);
    const w = this.world;
    // pass 1: a floor to stand on and nothing at shin and chest height (Old Star's own box aside)
    const hasStar = this.starBoxAt;
    if (hasStar) w.remove('star');
    const blocked = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
      if (!this.onFloor(x, z) || this.inCage({ x, z })) { solid[i + j * nx] = 1; continue; }
      const f = this.floorY(x, z);
      if (w.solidAt(x, f + 0.22, z) || w.solidAt(x, f + 0.55, z)) blocked[i + j * nx] = 1;
    }
    if (hasStar) { this.starBoxAt = null; this.moveStarBox(); }
    // pass 2: keep a body's width off whatever is solid
    const R = 2;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!blocked[i + j * nx]) continue;
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < nx && jj < nz && di * di + dj * dj <= R * R + 1) solid[ii + jj * nx] = 1;
      }
    }
    this.starGrid = { nx, nz, solid, x0, z0 };
  }

  /** A* across the cave floor: [{ x, z }] ending at (tx, tz), or null. */
  starPath(fx, fz, tx, tz) {
    const G = this.starGrid;
    if (!G) return [{ x: tx, z: tz }];
    const { nx, nz, solid, x0, z0 } = G;
    const cellOf = (x, z) => [clamp(Math.floor((x - x0) / CELL), 0, nx - 1), clamp(Math.floor((z - z0) / CELL), 0, nz - 1)];
    const free = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && !solid[i + j * nx];
    const nearestFree = ([i, j]) => {
      if (free(i, j)) return [i, j];
      for (let rr = 1; rr < 14; rr++) for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) if (Math.max(Math.abs(di), Math.abs(dj)) === rr && free(i + di, j + dj)) return [i + di, j + dj];
      return null;
    };
    const s = nearestFree(cellOf(fx, fz)), e = nearestFree(cellOf(tx, tz));
    if (!s || !e) return null;
    const N = nx * nz, si = s[0] + s[1] * nx, ei = e[0] + e[1] * nx;
    const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [];
    const h = (k) => { const i = k % nx, j = (k / nx) | 0; const dx = Math.abs(i - e[0]), dz = Math.abs(j - e[1]); return dx + dz - 0.586 * Math.min(dx, dz); };
    const push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    g[si] = 0;
    push(si, h(si));
    let found = false;
    while (heap.length) {
      const [, k] = pop();
      if (closed[k]) continue;
      closed[k] = 1;
      if (k === ei) { found = true; break; }
      const i = k % nx, j = (k / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (!free(ni, nj)) continue;
        if (di && dj && (!free(i + di, j) || !free(i, j + dj))) continue;
        const nk = ni + nj * nx, ng = g[k] + (di && dj ? 1.414 : 1);
        if (ng < g[nk]) { g[nk] = ng; came[nk] = k; push(nk, ng + h(nk)); }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let k = ei; k !== -1; k = came[k]) cells.push(k);
    cells.reverse();
    const sight = (a, b) => {
      const ai = a % nx, aj = (a / nx) | 0, bi = b % nx, bj = (b / nx) | 0;
      const n = Math.max(Math.abs(bi - ai), Math.abs(bj - aj)) * 2;
      for (let t = 0; t <= n; t++) { const i = Math.round(ai + (bi - ai) * t / n), j = Math.round(aj + (bj - aj) * t / n); if (!free(i, j)) return false; }
      return true;
    };
    const pts = [];
    let cur = 0;
    while (cur < cells.length - 1) {
      let nxt = cells.length - 1;
      while (nxt > cur + 1 && !sight(cells[cur], cells[nxt])) nxt--;
      pts.push(cells[nxt]);
      cur = nxt;
    }
    const out = pts.map((k) => ({ x: x0 + ((k % nx) + 0.5) * CELL, z: z0 + (((k / nx) | 0) + 0.5) * CELL }));
    if (out.length) out[out.length - 1] = { x: tx, z: tz };
    else out.push({ x: tx, z: tz });
    return out;
  }

  /** The floor under Old Star (meters): the house, the steps, your room. */
  starFloor(x, z) { return this.floorY(x, z); }

  /** Old Star is solid: a box where he stands (refreshed as he moves). */
  moveStarBox() {
    const s = this.star;
    if (!s?.rig || !this.world) return;
    const p = s.pos;
    if (this.starBoxAt && Math.hypot(p.x - this.starBoxAt.x, p.z - this.starBoxAt.z) < 0.06 && this.starBoxAt.mode === s.mode) return;
    this.world.remove('star');
    this.starBoxAt = { x: p.x, z: p.z, mode: s.mode };
    if (s.scripted && s.mode === 'walk') return;
    if (s.mode === 'sleep' || s.mode === 'sit') return; // (the cot and the chair are solid already)
    this.world.add(p.x - 0.17, p.y, p.z - 0.17, p.x + 0.17, p.y + 0.7, p.z + 0.17, 'star');
  }

  // ------------------------------------------------------------ ambience
  /** The anvil face flashes when he strikes (a quick light). */
  flashAnvil() {
    const l = this.anvilFlash;
    if (l) l.intensity = 1.6;
  }

  tickCave(dt) {
    const c = this.cave, a = this.game.audio, p = this.rig.player.pos;
    this.forgeAir = Math.max(0, (this.forgeAir || 0) - dt * 0.9);
    c.update(dt, this.time, this.forgeAir);
    if (this.bellowsT > 0) { this.bellowsT -= dt; c.dyn.bellows.setCompress(Math.sin(Math.max(0, 1 - this.bellowsT / 0.9) * Math.PI)); }
    if (this.forgeLight) this.forgeLight.intensity = 2.2 + this.forgeAir * 2.4;
    if (this.anvilFlash) this.anvilFlash.intensity = Math.max(0, this.anvilFlash.intensity - dt * 9);
    // embers off the forge and the fireplace, a pop of sparks now and then
    this.emberT = (this.emberT || 0) - dt;
    if (this.emberT <= 0) {
      this.emberT = 0.16 - this.forgeAir * 0.08;
      const f = c.dyn.forge.fire, h = c.dyn.fireplace.fire;
      this.fx.ember(f.x + rand(-0.18, 0.18), f.y, f.z + rand(-0.1, 0.1));
      if (Math.random() < 0.6) this.fx.ember(h.x + rand(-0.2, 0.2), h.y - 0.05, h.z + rand(-0.08, 0.1));
      if (Math.random() < 0.04) {
        for (let i = 0; i < 6; i++) this.fx.ember(h.x + rand(-0.1, 0.1), h.y, h.z + rand(-0.05, 0.08));
        if (Math.hypot(p.x - h.x, p.z - h.z) < 3) a.play('crack', { vol: 0.12 });
      }
    }
    // steam curling up off the stew pot and the kettle
    this.smokeT = (this.smokeT || 0) - dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.32;
      const pt = c.dyn.hearth.pot, k = c.dyn.hearth.kettle;
      this.fx.spawn({ x: pt.x + rand(-0.06, 0.06), y: pt.y, z: pt.z + rand(-0.06, 0.06), vx: rand(-0.02, 0.02), vy: rand(0.12, 0.22), vz: rand(-0.02, 0.02), life: rand(1.6, 2.4), size: 0.02, grow: 0.05, color: [0.92, 0.9, 0.88], alpha: 0.16, drag: 0.5, grav: -0.03 });
      if (Math.random() < 0.6) this.fx.spawn({ x: k.x, y: k.y + 0.02, z: k.z, vx: 0.05, vy: rand(0.15, 0.25), vz: rand(-0.02, 0.02), life: 1.2, size: 0.012, grow: 0.03, color: [0.92, 0.92, 0.9], alpha: 0.28, drag: 0.8, grav: -0.08 });
    }
    // the spring drips into its basin, the roof drips onto the floor and into its puddles (rings on the water)
    for (const d of c.drips) {
      d.t -= dt;
      if (d.t <= 0) {
        d.t = d.every * rand(0.8, 1.25);
        const w = d.pool ? c.dyn.poolWater : (c.waters || []).find((q) => q.name.startsWith('puddle') && Math.hypot(q.x - d.x, q.z - d.z) < 0.3);
        const gy = w ? w.y : c.ground(d.x, d.z);
        const fall = Math.max(0.05, d.y - gy);
        if (Math.hypot(p.x - d.x, p.z - d.z) > 9) continue;
        this.fx.droplet(d.x, d.y, d.z, 0, -0.2, 0, Math.sqrt((2 * fall) / 9.8) + 0.05, [0.7, 0.88, 1], 0.008);
        this.later(Math.sqrt((2 * fall) / 9.8), () => {
          if (w) c.ripple(w.name, d.pool ? w.x + rand(-0.04, 0.04) : d.x, d.pool ? w.z + rand(-0.04, 0.04) : d.z, 0.8);
          const dist = Math.hypot(p.x - d.x, p.z - d.z);
          if (dist < 4) a.play('drip', { vol: clamp(0.5 - dist / 8, 0.03, 0.35) });
        });
      }
    }
    // the alarm clock ticks (on its crate by the shack)
    this.tickT = (this.tickT || 0) - dt;
    if (this.tickT <= 0) {
      this.tickT = 1;
      const C = SPOTS.clock, dist = Math.hypot(p.x - C.x, p.z - C.z);
      if (dist < 3.5 && p.z < 0) { this.tock = !this.tock; a.tone({ f: this.tock ? 1900 : 2300, type: 'square', dur: 0.012, vol: clamp(0.03 - dist / 160, 0.004, 0.03), filter: 'bandpass', ff: 2400 }); }
    }
    // dirt trickling through the boards over the hole you fell through, now and then
    this.holeT = (this.holeT || 6) - dt;
    if (this.holeT <= 0) {
      this.holeT = rand(7, 16);
      const n = Math.random() < 0.2 ? 9 : 3;
      for (let i = 0; i < n; i++) this.fx.spawn({ x: HOLE.x + rand(-0.25, 0.25), y: this.holeTop - 0.03, z: HOLE.z + rand(-0.25, 0.25), vx: rand(-0.03, 0.03), vy: rand(-0.3, -0.1), vz: rand(-0.03, 0.03), life: 1.6, size: rand(0.006, 0.012), color: [0.36, 0.26, 0.18], alpha: 0.9, drag: 0.05, grav: 6, bounce: 0.1 });
      if (n > 5 && Math.hypot(p.x - HOLE.x, p.z - HOLE.z) < 4) a.play('trickle', { vol: 0.15 });
    }
    // dust motes drifting in the lamplight and the windows' glow
    this.moteT = (this.moteT || 0) - dt;
    if (this.moteT <= 0) {
      this.moteT = 0.08;
      const l = pick(this.moteLights);
      if (l && Math.hypot(l.x - p.x, l.z - p.z) < 7) {
        const cool = l.kind === 'window';
        this.fx.spawn({ x: l.x + rand(-0.7, 0.7), y: l.y + rand(-0.8, 0.3), z: l.z + rand(-0.7, 0.7), vx: rand(-0.015, 0.015), vy: rand(-0.01, 0.015), vz: rand(-0.015, 0.015), life: rand(3.5, 6), size: rand(0.004, 0.008), color: cool ? [0.7, 1, 0.95] : [1, 0.92, 0.72], alpha: 0.7, glow: true, drag: 0.05, grav: -0.002 });
      }
    }
    // now and then the old timbers creak, a log settles, the kettle sings
    this.creakT = (this.creakT || rand(8, 14)) - dt;
    if (this.creakT <= 0) {
      this.creakT = rand(12, 26);
      const k = Math.random();
      if (k < 0.45) a.play('creak', { vol: 0.08 });
      else if (k < 0.65) a.play('crack', { vol: 0.06 });
      else a.tone({ f: rand(55, 75), f2: rand(40, 50), type: 'sine', dur: 1.6, vol: 0.035, a: 0.4, reverb: 0.6 });
    }
  }
}
