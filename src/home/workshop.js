// Life in Old Star's cave workshop (mixed into HomeScene): everything you can use down the steps
// (Old Star, his forge and anvil, the bellows, the quench trough, the cooking hearth, his armchair
// and the stools, the notes board, his chest, the Miners' Board, the lift, the old passage, the
// coal cart, the drip basin, the coins in the rubble, the ruins), the cave clock (an hour every
// 90 s of play since you got up: Old Star sleeps late at night), Old Star's paths across the floor,
// and the cave's ambience: drips and splashes, glow-worms twinkling, embers and smoke, dust motes
// in the lamplight, dirt trickling from the hole, distant creaks and the forge breathing.
import * as THREE from 'three';
import { HALL, HOLE, FRONT, STAIRS, T, floorAt } from './units.js';
import { SPOTS } from './cave.js';
import { liftBoxes } from './lift.js';
import { openNotes, readSet } from './notes.js';
import { starData } from './starData.js';
import { rand, pick, clamp } from '../core/util.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const CELL = 0.1;
const HOUR_SECS = 90;
const Y = HALL.y;

export class WorkshopLife {
  // ------------------------------------------------------------ interactables
  addCaveInteractions() {
    const c = this.cave, S = SPOTS, st = this.game.state;
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
    this.addIt({ box: [S.bellows.x - 0.5, Y + 0.2, S.bellows.z - 0.28, S.bellows.x + 0.5, Y + 0.75, S.bellows.z + 0.28], label: 'Pump the bellows', action: () => this.pumpBellows() });
    this.addIt({ box: [S.trough.x - 0.24, Y, S.trough.z - 0.55, S.trough.x + 0.24, Y + 0.45, S.trough.z + 0.55], label: 'Splash your face', action: () => this.splashFace() });
    // the hearth
    const cookLabel = () => (this.lessonStage?.() === 'cook' ? 'Cook with Old Star' : 'Cook at the hearth');
    this.addIt({ box: [S.fire.x - 0.45, Y, S.fire.z - 0.45, S.fire.x + 0.45, Y + 0.9, S.fire.z + 0.45], label: cookLabel, action: () => this.useHearth() });
    for (const f of c.furn) {
      if (f.id === 'stool') this.addIt({ box: f.box, label: 'Sit', action: () => this.sitAt(f) });
      if (f.id === 'armchair') this.addIt({ x: S.armchair.x, y: Y + 0.35, z: S.armchair.z, r: 0.3, label: 'Sit in Old Star\'s armchair', enabled: () => !star || star.spot !== 'armchair' || star.mode === 'walk', action: () => this.sitAt(f) });
    }
    // his notes and his chest
    const b = c.boardAt;
    this.addIt({ box: [b.x - 0.1, b.y, b.z - 0.55, b.x + 0.12, b.y + 0.95, b.z + 0.55], label: () => { const n = this.unreadNotes(); return n ? `Read Old Star's notes (${n} new)` : 'Read Old Star\'s notes'; }, action: () => this.readNotes(this.noteUnderCrosshair()) });
    this.addIt({ box: [S.chest.x - 0.33, Y, S.chest.z - 0.33, S.chest.x + 0.33, Y + 0.42, S.chest.z + 0.33], label: () => (this.chest?.hasLoot ? 'Open Old Star\'s chest' : 'Open the trunk'), action: () => this.chest?.use() });
    // the Miners' Board, the lift, the coal cart, the winch
    const m = c.minersAt;
    this.addIt({ box: [m.x - 0.6, m.y, m.z - 0.12, m.x + 0.6, m.y + 0.8, m.z + 0.05], label: 'Miners\' Board', action: () => this.useMinersBoard() });
    const liftLabel = () => (this.inCage() ? 'Pull the lever' : this.lessonStage?.() === 'mine' ? 'Ride down to the dig' : 'Ride the lift');
    const SH = this.shaftBox;
    this.addIt({ box: SH, label: liftLabel, action: () => this.useLift() });
    this.addIt({ box: [S.cart.x - 0.4, Y, S.cart.z - 0.3, S.cart.x + 0.4, Y + 0.62, S.cart.z + 0.3], label: () => (this.cartReady() ? 'Take coal from the cart' : 'The old mine cart'), action: () => this.useCart() });
    this.addIt({ box: [S.winch.x - 0.42, Y, S.winch.z - 0.3, S.winch.x + 0.42, Y + 0.95, S.winch.z + 0.3], label: 'Turn the winch', action: () => this.turnWinch() });
    // the old passage to Deep Town
    const P = c.passage;
    if (this.doorOpen) this.addIt({ box: [P.x - 0.45, Y, P.z - 0.1, P.x + 0.45, Y + 1.2, P.z + 0.35], label: 'Through to Deep Town', action: () => this.leave() });
    else this.addIt({ box: [P.x - 0.55, Y, P.z - 0.1, P.x + 0.55, Y + 1.2, P.z + 0.75], label: 'Caved in', action: () => this.blockedDoor() });
    // the drip basin, the coins in the rubble, the ruins, the hole
    this.addIt({ x: S.pool.x, y: Y + 0.05, z: S.pool.z, r: 0.55, label: () => (this.poolToday() ? 'The drip basin' : 'Drink from the basin'), action: () => this.drinkPool() });
    for (const [i, g] of (c.glints || []).entries()) this.addIt({ x: g.x, y: g.y, z: g.z, r: 0.14, label: g.gem ? 'Pick up the gem' : 'Pick up the coins', enabled: () => !this.glintTaken(i), action: () => this.takeGlint(i) });
    const look = (o, label, lines, after) => this.addIt({ ...o, label, reach: 2.6, action: () => { this.game.audio.play('glow', { vol: 0.4 }); this.think(pick(lines), 4.2); after?.(); } });
    look({ x: S.sealed.x, y: Y + 0.9, z: S.sealed.z + 0.2, r: 0.7 }, 'Look at the sealed doorway', [
      'Stones fitted so close you couldn\'t slip a whisker between them. And through the crack: a cold green glow.',
      'A star carved in the keystone. The same star as on Old Star\'s board.',
      'Somebody walled this up, a very long time ago, and meant it.',
    ], () => this.starAside('ruins'));
    look({ x: S.mosaic.x, y: Y + 0.05, z: S.mosaic.z, r: 0.8 }, 'Look at the mosaic', ['Tiny tiles: an eight-pointed star in ochre and teal. Older than the mine. Older than moles, maybe.', 'Cracked right across. A root has come up through the middle.']);
    look({ x: HOLE.x, y: Y + 2.4, z: HOLE.z, r: 0.7 }, 'Look up the hole', ['That\'s where I came in. Roots and dark, all the way up. No way back that way.', 'Dirt still trickles down now and then. It\'s all caved in up there.'], () => this.starAside('hole'));
    look({ x: S.cot.x, y: Y + 0.3, z: S.cot.z, r: 0.45 }, 'Old Star\'s cot', ['A patchwork quilt and a red nightcap. It smells of soot and peppermint.', 'Warm from the forge. No wonder he sleeps here.']);
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

  splashFace() {
    const a = this.game.audio, t = this.cave.dyn.troughAt;
    a.play('splash', { vol: 0.7 });
    this.rig.vm?.impact('none', 0.35);
    this.cave.ripple('trough', t.x, t.z, 1.4);
    for (let i = 0; i < 14; i++) this.fx.droplet(t.x + rand(-0.1, 0.1), t.y + 0.05, t.z + rand(-0.1, 0.1), rand(-0.4, 0.4), rand(0.8, 1.4), rand(-0.4, 0.4), 0.6, [0.75, 0.9, 1], 0.01);
    this.wetFace?.(0.5);
    this.think(pick(['Brrr! Cold as the deep.', 'Wide awake now. Very wide.', 'The water bites. Old Star swears by it.']), 2.6);
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
    if (this.lessonTalk?.()) return 'lesson';
    const line = this.nextTip();
    star.say(line.text, { mood: line.mood });
    return line.text;
  }

  /** A remark from Old Star about something you just did, when he's near and awake. */
  starAside(what) {
    const star = this.star;
    if (!star?.rig || star.scripted || star.mode === 'sleep') return;
    const d = Math.hypot(star.pos.x - this.rig.player.pos.x, star.pos.z - this.rig.player.pos.z);
    if (d > 6.5) return;
    const lines = {
      ruins: [['Built by whoever was here before the moles. Never could shift those stones. Never stopped trying, mind.', 'worried'], ['Don\'t touch that glow. Or do. Tell me what happens. From over there.', 'laugh']],
      hole: [['Came down like a sack of turnips, you did. Hen and all.', 'laugh'], ['That\'s sixty feet of loose dirt up there. We go out the proper way: the Surface Express.', 'calm']],
      bellows: [['Easy on my bellows! Long, steady pulls. You\'ll learn.', 'stern'], ['Hear that roar? That\'s the forge saying thank you.', 'happy']],
      coins: [['Fell in with you, those. Keep \'em. First coins toward the million.', 'happy']],
      pool: [['Best water in the deep, that. Sixty years and it\'s never once run dry.', 'proud']],
    }[what];
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
    if (!st.flag('escaped')) out.push({ text: 'Deep Town\'s just through the rock, up my old passage. Caved in years back. Find the town gate from below, in the mine, and we\'ll have a road again.', mood: 'worried' });
    else out.push({ text: 'Sell your ore and blades in town. The assay office pays for pristine stones: chisel and brush them free, don\'t smash them.', mood: 'calm' });
    out.push({ text: `A million gold for the Surface Express. You've ${st.gold >= 1000 ? 'a start' : 'a long way to go'}: <span class="gold-txt">${st.gold.toLocaleString()}</span>. Every blade counts.`, mood: st.gold > 100000 ? 'proud' : 'calm' });
    out.push({ text: 'Iron wants a quench. Copper doesn\'t care. Heat it to cherry, hammer it, and into my trough while it still glows.', mood: 'calm' });
    out.push({ text: 'There are old lifts all over the mine. Dig one out and ring its bell, and it\'ll bring you home any time.', mood: 'happy' });
    out.push({ text: 'Low on energy? Eat. The pot\'s always on, and your hen lays more when you pet her.', mood: 'happy' });
    out.push({ text: 'Better picks dig faster. The Miners\' Board by the lift: that\'s where the money goes. Better tools, bigger bags.', mood: 'calm' });
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

  /** Which note the crosshair is on (index), or the first unread one. (The board faces +x.) */
  noteUnderCrosshair() {
    const eye = this.rig.eye(_v), f = this.rig.forward(_w);
    const b = this.cave.boardAt;
    if (f.x < -0.05) {
      const t = (b.x + 0.06 - eye.x) / f.x;
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
    this.cave.ripple('pool', SPOTS.pool.x + rand(-0.1, 0.1), SPOTS.pool.z + rand(-0.1, 0.1), 1);
    this.rig.vm?.impact('none', 0.25);
    if (!this.poolToday()) {
      sd.poolDay = st.data.day;
      st.restoreEnergy?.(6);
      this.floatAt(SPOTS.pool.x, Y + 0.3, SPOTS.pool.z, '+6 energy', '#bff0a0');
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
  /** The walkable grid of the cave floor (flat rock, clear of things, Old Star's width round them). */
  buildStarGrid() {
    const { x0, x1, z0, z1 } = HALL;
    const nx = Math.ceil((x1 - x0) / CELL), nz = Math.ceil((z1 - z0) / CELL);
    const solid = new Uint8Array(nx * nz);
    const r = 0.2;
    const rock = this.cave.rock;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
      const g = rock.groundAt(x, z);
      let bad = Math.abs(g - Y) > 0.13 || rock.roofAt(x, z, g + 0.3) < g + 0.9;
      // keep a body's width off the rock
      if (!bad) for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (rock.solidAt(x + dx, g + 0.4, z + dz)) { bad = true; break; }
      if (bad) solid[i + j * nx] = 1;
    }
    const boxes = [...this.cave.boxes, ...liftBoxes(false)];
    for (const b of boxes) {
      const [bx0, by0, bz0, bx1, by1, bz1] = b;
      if (by1 <= Y + 0.12 || by0 >= Y + 0.8) continue; // low steps are walkable
      for (let j = Math.max(0, Math.floor((bz0 - r - z0) / CELL)); j <= Math.min(nz - 1, Math.floor((bz1 + r - z0) / CELL)); j++) {
        for (let i = Math.max(0, Math.floor((bx0 - r - x0) / CELL)); i <= Math.min(nx - 1, Math.floor((bx1 + r - x0) / CELL)); i++) solid[i + j * nx] = 1;
      }
    }
    // keep off the steps up to your room
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
      if (x > STAIRS.x0 - r && x < STAIRS.x1 + r && z > STAIRS.z0 - r) solid[i + j * nx] = 1;
    }
    this.starGrid = { nx, nz, solid };
  }

  /** A* across the cave floor: [{ x, z }] ending at (tx, tz), or null. */
  starPath(fx, fz, tx, tz) {
    const G = this.starGrid;
    if (!G) return [{ x: tx, z: tz }];
    const { nx, nz, solid } = G, { x0, z0 } = HALL;
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

  /** The floor under Old Star (meters): the cave's rock floor. */
  starFloor(x, z) { return z < STAIRS.z0 || x < STAIRS.x0 || x > STAIRS.x1 ? this.cave.ground(x, z) : floorAt(x, z); }

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
    // embers off the forge and the hearth, a pop of sparks now and then
    this.emberT = (this.emberT || 0) - dt;
    if (this.emberT <= 0) {
      this.emberT = 0.14 - this.forgeAir * 0.08;
      const f = c.dyn.forge.fire, h = c.dyn.hearth.fire;
      this.fx.ember(f.x + rand(-0.18, 0.18), f.y, f.z + rand(-0.1, 0.1));
      this.fx.ember(h.x + rand(-0.15, 0.15), h.y - 0.05, h.z + rand(-0.15, 0.15));
      if (Math.random() < 0.04) {
        for (let i = 0; i < 6; i++) this.fx.ember(h.x + rand(-0.08, 0.08), h.y, h.z + rand(-0.08, 0.08));
        if (Math.hypot(p.x - h.x, p.z - h.z) < 3) a.play('crack', { vol: 0.12 });
      }
    }
    // smoke curling up off the pot and the hearth, steam off the kettle
    this.smokeT = (this.smokeT || 0) - dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.32;
      const h = c.dyn.hearth.fire, k = c.dyn.hearth.kettle;
      this.fx.spawn({ x: h.x + rand(-0.1, 0.1), y: h.y + 0.5, z: h.z + rand(-0.1, 0.1), vx: rand(-0.03, 0.03), vy: rand(0.18, 0.3), vz: rand(-0.03, 0.03), life: rand(2.5, 3.5), size: 0.03, grow: 0.08, color: [0.5, 0.46, 0.44], alpha: 0.18, drag: 0.4, grav: -0.02 });
      if (Math.random() < 0.6) this.fx.spawn({ x: k.x + 0.08, y: k.y + 0.04, z: k.z, vx: 0.05, vy: rand(0.15, 0.25), vz: rand(-0.02, 0.02), life: 1.2, size: 0.012, grow: 0.03, color: [0.92, 0.92, 0.9], alpha: 0.28, drag: 0.8, grav: -0.08 });
    }
    // drips from the stalactites: a bead swells, falls, and splashes (rings on the basin)
    for (const d of c.drips) {
      d.t -= dt;
      if (d.t <= 0) {
        d.t = d.every * rand(0.8, 1.25);
        const gy = c.ground(d.x, d.z);
        const fall = Math.max(0.2, d.y - gy);
        this.fx.droplet(d.x, d.y, d.z, 0, -0.2, 0, Math.sqrt((2 * fall) / 9.8) + 0.1, [0.7, 0.88, 1], 0.009);
        this.later(Math.sqrt((2 * fall) / 9.8), () => {
          const inPool = Math.hypot(d.x - SPOTS.pool.x, d.z - SPOTS.pool.z) < 0.55;
          const y = inPool ? Y - 0.03 : gy;
          for (let i = 0; i < 5; i++) this.fx.droplet(d.x, y + 0.01, d.z, rand(-0.35, 0.35), rand(0.5, 0.9), rand(-0.35, 0.35), 0.35, [0.7, 0.88, 1], 0.006);
          if (inPool) c.ripple('pool', d.x, d.z, 1);
          const dist = Math.hypot(p.x - d.x, p.z - d.z);
          if (dist < 7) a.play('drip', { vol: clamp(1.1 - dist / 7, 0.05, 0.6) });
        });
      }
    }
    // glow-worms breathe in and out; once in a while one brightens
    for (const w of this.wormHalos || []) w.h.mul = (0.65 + 0.35 * Math.sin(this.time * 0.8 + w.ph)) * (1 + Math.max(0, Math.sin(this.time * 0.13 + w.ph * 3) - 0.92) * 9);
    // dirt trickling from the hole you fell through
    this.holeT = (this.holeT || 3) - dt;
    if (this.holeT <= 0) {
      this.holeT = rand(3, 9);
      const n = Math.random() < 0.25 ? 14 : 5;
      for (let i = 0; i < n; i++) this.fx.spawn({ x: HOLE.x + rand(-0.3, 0.3), y: this.holeTop - 0.05, z: HOLE.z + rand(-0.3, 0.3), vx: rand(-0.05, 0.05), vy: rand(-0.4, -0.1), vz: rand(-0.05, 0.05), life: 1.8, size: rand(0.008, 0.016), color: [0.36, 0.26, 0.18], alpha: 0.9, drag: 0.05, grav: 6, bounce: 0.1 });
      if (n > 10 && Math.hypot(p.x - HOLE.x, p.z - HOLE.z) < 6) a.play('trickle', { vol: 0.25 });
    }
    // dust motes drifting in the lamplight
    this.moteT = (this.moteT || 0) - dt;
    if (this.moteT <= 0) {
      this.moteT = 0.1;
      const l = pick(this.moteLights);
      if (l) this.fx.spawn({ x: l.x + rand(-0.7, 0.7), y: l.y + rand(-0.8, 0.2), z: l.z + rand(-0.7, 0.7), vx: rand(-0.015, 0.015), vy: rand(-0.01, 0.015), vz: rand(-0.015, 0.015), life: rand(3.5, 6), size: rand(0.005, 0.009), color: [1, 0.92, 0.72], alpha: 0.75, glow: true, drag: 0.05, grav: -0.002 });
    }
    // now and then the rock creaks, something drips far off, the old cart settles
    this.creakT = (this.creakT || rand(8, 14)) - dt;
    if (this.creakT <= 0) {
      this.creakT = rand(10, 22);
      const k = Math.random();
      if (k < 0.4) a.play('creak', { vol: 0.12 });
      else if (k < 0.7) a.play('drip', { vol: 0.1 });
      else a.tone({ f: rand(55, 75), f2: rand(40, 50), type: 'sine', dur: 1.6, vol: 0.05, a: 0.4, reverb: 0.6 });
    }
    // the rock's lights follow the fires and lanterns
    const eye = this.rig.eye(_v);
    this.cave.rock.setLights(this.cave.rockLights(eye, this.lightSrcs), { pos: this.camera.position, dir: this.camera.getWorldDirection(_w) }, dt);
  }
}
