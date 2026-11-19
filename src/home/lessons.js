// Old Star's lessons at home (mixed into HomeScene): the tutorial, led by him, quiet on screen. The
// chain (quest `lessons`, src/data/quests.js) moves on `act` events; this keeps its own stage in
// state.data.oldstar.lesson so the home knows what Old Star wants next:
//   wake   → the waking-up cutscene (wake.js: he's at his anvil, comes over to your cot, talks).
//            No look / walk / talk teaching: on your feet you can just move (one tiny hint, once).
//   pick   → you fell down here with nothing. He goes back to his forge and you follow: the forge
//            glints, E there (forge { from: 'home', tutorial: true, pick: true }: the forge piece
//            pick_first, src/forge/tutorial.js; the pick goes on your belt: unlocks belt + dig).
//   mine   → back with the pick he admires it (the forge flares) and hands you his old satchel with
//            his spare chisel in it (unlocks pack + tools: the backpack comes in); the cage glints and
//            drops to the real mine entrance (deep { from: 'lift', lift: 'L0', lesson: 'mine' }): find
//            copper (src/deep/FirstDig.js) and ride home with it
//   forge  → back with copper: he takes the lump in his paws, sniffs it, gives you coal and his old
//            notebook (unlocks book: quests + index; the radar and the lift layers too, now you've
//            been down); to his forge (forge { from: 'home', tutorial: true }; src/forge/tutorial.js)
//   cook   → back with your first blade: a word, then to his fire pit (cooking { from: 'home',
//            tutorial: true }; src/cooking/lesson.js)
//   done   → back with a meal in you: the graduation (the fire roars up, he cheers), everything
//            else unlocks (skills, gold, the quest strip, building, shops...: ui.onboard.unlockAll).
// On screen: nothing (wave 18). The thing to use glints in the world (gold motes rising off it:
// src/home/tutorFx.js), he goes there and works at it, beckons when you come near and calls you over
// in a few words if you dawdle; what he hands over he holds out in his paws first; the crosshair
// names things. The cutscenes are letterboxed, the HUD tucked away, and hold Esc / a click skips.
// The beats are written against the home's stations (questSpot('lift' | 'forge' | 'hearth'), his
// spots, the lift / forge / cooking functions), not against rooms.
// While a lesson is on the cage (until the mining lesson), the way out, the build bench and the bed
// wait; things you haven't been given yet (your trunk, the Index Book, the Miners' Board) wait for
// their unlock. Talking to him offers "What now?" and "Skip the lessons" (lesson { step: 'skip' }:
// everything handed over and unlocked).
// Acts emitted here: lesson { step: wake | lift | copper_home | cook_done | skip }, talk { npc: 'oldstar' },
// reach { place: 'home' } (unchanged).
// Test hooks: scene.debug (HomeScene) as before; the tutorial's state is scene.homeTutor()
// ({ step, t, ... } or null), and ui.onboard.debug for the unlocks and prompts.
import * as THREE from 'three';
import { pick } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { starData } from './starData.js';
import { starPortraitURL } from '../ui/Tutor.js';
import { openTalkMenu } from '../ui/choices.js';
import { TUT } from '../ui/Onboard.js';
import { Glint, flare, copperLump, satchel, notebook, rockyLump, chipLump, teachWord } from './tutorFx.js';
import { grantNook } from './nooks.js';

const _v = new THREE.Vector3();
const ease = (k) => k * k * (3 - 2 * k);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** What he says the next step is, per stage (his "What now?"), and where he waits. */
const NEXT = {
  pick: { text: 'A miner without a pick is just a mole with ideas. No pick, no digging. To my <b>forge</b>: we\'ll make you your own.', mood: 'stern', where: 'anvil' },
  mine: { text: 'Copper! The cage drops to the mine entrance. Look for <b>orange specks</b> in the rock and bring me a lump.', mood: 'calm', where: 'lift' },
  forge: { text: 'Copper\'s no good as rock. To the <b>forge</b>: we melt it and hammer you a blade.', mood: 'happy', where: 'anvil' },
  cook: { text: 'A smith who doesn\'t eat is a skeleton with a hammer. To the <b>fire pit</b>!', mood: 'happy', where: 'fire' },
};

/**
 * Wave 18: no objective line on screen. If you dawdle he calls you over himself (a passing line by
 * his head, a beckon or a point), a few words, never the same twice running.
 */
const CALL = {
  pick: ['Forge. Over here.', 'This way. Mind the bucket.', 'Picks don\'t make themselves.'],
  lift: ['Cage is here.', 'Down you go. It only creaks.', 'Copper\'s not coming up on its own.'],
  forge: ['Forge. Bring the copper.', 'Over here. It\'s warm.'],
  cook: ['Fire pit. I\'m starving.', 'Over here. Bring an appetite.'],
};

/** Things at home that wait for an unlock (src/ui/Onboard.js UNLOCKS), by label. */
const NEEDS = [[/your trunk/i, 'pack'], [/index book/i, 'book'], [/miners' board/i, 'upgrades']];

/** What waits while a lesson is on (by label): the cage, the way out, the build bench, bed. */
const LOCKED = /lift|cage|lever|ride down|deep town|front door|passage|build bench|^sleep$/i;

export class HomeLessons {
  lessonStage() { return starData(this.game.state).lesson; }

  setLesson(stage) {
    const sd = starData(this.game.state);
    if (sd.lesson === stage) return;
    sd.lesson = stage;
    this.game.state.dirty = true;
    this.game.state.save?.();
  }

  act(type, data = {}) { this.game.state.emit('act', { ...data, type }); }
  lessonAct(step) { this.act('lesson', { step }); }

  /** Old Star goes where the lesson is (at the lift, the anvil or the fire) and waits there. */
  placeStarForLesson(instant = false) {
    const star = this.star;
    if (!star?.rig) return;
    const n = NEXT[this.lessonStage()];
    if (!n) return;
    star.lessonSpot = n.where;
    if (instant) star.placeAt(n.where);
    else if (star.spot !== n.where || star.mode === 'walk') star.goTo(n.where);
    star.nextT = 999;
  }

  /** E on Old Star while there are lessons: a little talk menu. Returns true if it handled the talk. */
  lessonTalk() {
    const stage = this.lessonStage();
    if (stage === 'done' || stage === 'wake') return false;
    const n = NEXT[stage];
    const close = () => h?.close();
    const opt = (label, sub, fn, primary = false) => ({ label, sub, primary, onClick: () => { close(); fn(); } });
    const h = openTalkMenu(this.game, {
      name: 'Old Star', face: starPortraitURL(n?.mood || 'calm'), who: 'oldstar',
      line: 'Old Star squints at you over his spectacles. <i>"Well?"</i>',
      options: [
        opt('What now?', null, () => this.starLine(n.text, { mood: n.mood }), true),
        opt('Skip the lessons', 'I know my way round a mine, a forge and a pan.', () => this.confirmSkip()),
        opt('Never mind', null, () => this.starLine(pick(['Hmph. Mind the fire, then.', 'Go on, go on.', 'Sixty years I\'ve waited. I can wait a bit longer.']), { mood: 'calm' })),
      ],
    });
    return true;
  }

  async confirmSkip() {
    const ok = await this.game.ui.confirm('Skip Old Star\'s lessons? You\'ll get what he would have given you, and go your own way.', 'Skip them', 'Keep learning');
    if (!ok) { this.starLine('Good. Patience is half of smithing. The other half is hitting things.', { mood: 'happy' }); return; }
    this.skipLessons();
  }

  /** The lessons are over: hand over what they would have given, unlock everything, and say so. */
  skipLessons() {
    const st = this.game.state, sd = starData(st);
    const stage = sd.lesson;
    sd.skipped = true;
    if ((stage === 'pick' || stage === 'wake') && !st.equipped('pick')) this.givePick(60);
    this.giveChisel();
    if (stage === 'mine' || stage === 'wake' || stage === 'pick') st.addItem('copper_ingot', { spill: true, q: 70, n: 1 });
    if (st.count('coal') < 3) st.addItem('coal', { spill: true, n: 3 });
    if (stage !== 'done') st.addItem('mushroom', { spill: true, n: 2 });
    st.flag('prologue', true);
    // the soft rock behind your bedroll is yours now (nooks.js): dig it out when you like, no charge
    grantNook(st, 'nook_bed');
    this.setLesson('done');
    this.endHomeTutor();
    this.lessonAct('skip'); // (src/ui/Onboard.js: everything unlocks)
    this.game.ui.setTutorialLevel?.(TUT.FULL);
    this.game.ui.onboard?.goal(null);
    this.game.audio.play('pickup', { vol: 0.5 });
    const star = this.star;
    if (star) {
      star.lessonSpot = null;
      star.scripted = false;
      star.nextT = 6;
      this.starLine(this.nooks?.has('nook_bed') ? 'A know-it-all, eh? Fine by me. Here: a pick, my spare chisel, a bit of coal. Off you go and earn that million: the cage goes down, the coins come up. And come home to sleep.' : 'A know-it-all, eh? Fine by me. Here: a pick, my spare chisel, a bit of coal. Off you go and earn that million. And that chalked rock behind your bedroll is yours: dig yourself a corner.', { mood: 'laugh' });
    }
    st.save();
  }

  /** A new game: you fell down here with nothing. Your first pick is the one you forge (stage 'pick'). */
  takeStartPick() {
    const st = this.game.state, d = st.data;
    if (d.equip?.pick !== 'pick_rusty' || d.owned?.pick_first) return;
    delete d.owned.pick_rusty;
    d.equip.pick = null;
    st.dirty = true;
  }

  /** Your first pick in your paw (the forge lesson makes it; a skip hands one over). */
  givePick(q = 60) {
    const st = this.game.state, d = st.data;
    d.owned.pick_first = 1;
    d.toolQ = { ...(d.toolQ || {}), pick_first: d.toolQ?.pick_first ?? q };
    st.equip?.('pick_first');
    st.dirty = true;
  }

  /** His spare chisel, for chipping the rock off ore (once). Returns true if he gave it. */
  giveChisel() {
    const st = this.game.state;
    if (!ITEMS.chisel_basic || st.owns?.('chisel_basic') || st.equipped('chisel')) return false;
    st.addItem('chisel_basic');
    st.equip?.('chisel_basic');
    st.dirty = true;
    return true;
  }

  /** Riding the lift down during the mining lesson. */
  onLessonRide() {
    this.lessonAct('lift');
    this.endHomeTutor();
    this.game.ui.onboard?.goal(null);
    // (a word over his shoulder as the gate shuts)
    if (this.star?.rig) this.starLine('Dig <b>round</b> the ore, not the ore!', { mood: 'happy', dur: 3.2 });
  }

  // ------------------------------------------------------------ cutscenes at home
  /**
   * A short cutscene: letterbox bars (a hold skips), the camera eased round to Old Star while he
   * talks. run({ line, go, tween, sleep, cut }) plays it; returns true if it played to its end.
   */
  async cutscene(run, { face = true } = {}) {
    const ui = this.game.ui, ob = ui.onboard, star = this.star;
    const cut = { on: false };
    this.cine = cut;
    ob?.cinema(true, { skip: () => { cut.on = true; cut.fire?.(); ui.tutor?.hide(); this.game.convo?.end?.(); } });
    const wasScripted = this.scripted;
    if (!wasScripted) this.beginScript(false);
    const tools = this.cineTools(cut);
    const line = (html, mood, o = {}) => tools.go(this.starLine(html, { mood, wait: true, camera: 'close', ...o }));
    const fov0 = this.camera.fov;
    // (a cutscene can never hold the player for good: a minute at most, then it's cut)
    const guard = setTimeout(() => { if (this.cine === cut && !cut.on) { cut.on = true; cut.fire?.(); this.game.convo?.end?.(); } }, 60000);
    try {
      if (face && star?.rig) await tools.go(this.faceStar(tools.tween, 0.7));
      await run({ ...tools, line, cut });
    } catch (e) {
      if (!e?.cut) console.warn('[lessons] cutscene', e);
    }
    clearTimeout(guard);
    if (cut.on) { this.game.ui.tutor?.hide(); }
    // (whatever he was holding out goes back where it belongs)
    if (star?.carrying) { const o = star.drop(); o?.userData?.dispose?.(); }
    this.camera.fov = fov0;
    this.camera.updateProjectionMatrix();
    if (!wasScripted && this.scripted) this.endScript();
    ob?.cinema(false);
    this.cine = null;
    return !cut.on;
  }

  /**
   * Inside a cutscene: he walks over to you (a few seconds at most), the view following him, and
   * faces you, so the talk that follows is a proper close two-shot rather than a shout across the cave.
   */
  async comeOver({ go, sleep, tween }, d = 0.95) {
    const star = this.star;
    if (!star?.rig) return;
    const p = this.cam || this.rig.player.pos;
    if (Math.hypot(star.pos.x - p.x, star.pos.z - p.z) > d + 0.35) {
      star.scripted = true;
      const at = this.approachSpot(d);
      const walk = star.walkTo(at.x, at.z, 1.15);
      // (the view turns with him as he comes: a slow pan, not a snap)
      const follow = (dt) => { if (!this.cam || !star.rig) return; const h = star.head(_v); const yaw1 = Math.atan2(-(h.x - this.cam.x), -(h.z - this.cam.z)); this.cam.yaw += wrap(yaw1 - this.cam.yaw) * Math.min(1, dt * 3); };
      this.tickers.push(follow);
      try { await go(Promise.race([walk, sleep(3.4)])); } finally { const i = this.tickers.indexOf(follow); if (i >= 0) this.tickers.splice(i, 1); }
      star.mode = 'idle';
      star.path = null;
    }
    star.faceTo(p.x, p.z, true);
    star.scripted = false;
    await go(this.faceStar(tween, 0.45));
  }

  /** Ease the scripted camera round to look at Old Star's face. */
  faceStar(tween, secs = 0.8) {
    const c = this.cam, star = this.star;
    if (!c || !star?.rig) return Promise.resolve();
    const h = star.head(_v).clone();
    const yaw1 = Math.atan2(-(h.x - c.x), -(h.z - c.z));
    const pitch1 = Math.atan2(h.y - 0.08 - c.y, Math.hypot(h.x - c.x, h.z - c.z));
    const y0 = c.yaw, p0 = c.pitch, dy = wrap(yaw1 - y0);
    return tween(secs, (k) => { const e = ease(k); c.yaw = y0 + dy * e; c.pitch = p0 + (pitch1 - p0) * e; });
  }

  /** Where he comes to stand to talk to you (meters): `d` from you, on the side he's coming from. */
  approachSpot(d = 0.95) {
    const p = this.cam || this.rig.player.pos, star = this.star;
    let dx = star.pos.x - p.x, dz = star.pos.z - p.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.05) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
    if (l < d) return { x: star.pos.x, z: star.pos.z };
    return { x: p.x + dx * d, z: p.z + dz * d };
  }

  /** The fires (meters): the forge's coals and the fire pit, for flares and glints. */
  firePos(which) {
    const d = this.cave?.dyn?.[which === 'forge' ? 'forge' : 'hearth']?.fire;
    if (d) return new THREE.Vector3(d.x, d.y, d.z);
    const q = this.questSpot?.(which === 'forge' ? 'forge' : 'hearth');
    return q ? new THREE.Vector3(q.x, q.y - 0.4, q.z) : null;
  }

  /** A flare off a fire (or a point): embers and sparks, a whoosh of the flames. */
  flareAt(p, o = {}) {
    if (!p) return;
    flare(this.fx, p, o);
    const a = this.game.audio;
    a.play('ignite', { vol: 0.45 });
    a.play('sparkle', { vol: 0.3 });
    if (o.fanfare) a.play('fanfare', { vol: 0.55 });
  }

  /**
   * Inside a cutscene: he holds something out in both paws (a voxel model from tutorFx.js), up where
   * the close shot sees it, while he says the line; then it's yours. Returns when the line's done.
   */
  async holdOut(model, html, mood, { line, go, sleep }) {
    const star = this.star;
    if (!star?.rig) { await line(html, mood); return; }
    if (star.carrying) { const o = star.drop(); o?.userData?.dispose?.(); }
    star.carry(model);
    model.position.set(0, 0.52, 0.3);
    this.game.audio.play('pickup', { vol: 0.45 });
    await go(sleep(0.25));
    // (a two-shot from the side, wider than his close-up, so what's in his paws is in it and nothing's on the lens)
    await line(html, mood, { camera: 'two' });
    const o = star.drop();
    o?.userData?.dispose?.();
    this.game.audio.play('pickup', { vol: 0.5, pitch: 1.15 });
  }

  /**
   * Inside a cutscene: Old Star shows how ore is cleaned. He holds up a lump still in its crust of
   * rock and chisels at it: tink, tink, the rock flies off in chips, the copper comes out bright.
   * Two floating words say it; he says one. (Test hook: scene.debug.chipDemo().)
   */
  async chipDemo({ go, sleep, tween }) {
    const star = this.star, fx = this.fx, a = this.game.audio;
    if (!star?.rig) return;
    if (star.carrying) { const o = star.drop(); o?.userData?.dispose?.(); }
    const lump = rockyLump(1);
    star.carry(lump);
    lump.rotation.set(0.2, 0.5, 0);
    lump.scale.setScalar(2.0); // (he's up close now: wave 18 has him come over first)
    // (held up between you, just under his eyes and toward the camera: never behind his snout)
    // (your own eyes are the camera here: the scripted view this.cam, not a talk shot round his side)
    const eyeAt = () => (this.cam ? new THREE.Vector3(this.cam.x, this.cam.y, this.cam.z) : this.camera.getWorldPosition(new THREE.Vector3()));
    const hold = (bob = 0) => {
      const h = star.head(new THREE.Vector3()), c = eyeAt();
      const to = c.clone().sub(h); to.y = 0;
      const d = to.length() || 1;
      // (well out in front of his snout, a little under your eye line, so it sits below his star nose)
      const w = h.add(to.multiplyScalar(Math.min(0.6, d * 0.42) / d));
      w.y = Math.min(h.y, c.y) - 0.26 + bob;
      if (lump.parent) { lump.parent.updateMatrixWorld(true); lump.position.copy(lump.parent.worldToLocal(w)); }
    };
    hold();
    // look at it: the view eases down onto the lump in his paws
    if (this.cam) {
      const c = this.cam, p = lump.getWorldPosition(new THREE.Vector3());
      const yaw1 = Math.atan2(-(p.x - c.x), -(p.z - c.z)), pitch1 = Math.atan2(p.y + 0.12 - c.y, Math.hypot(p.x - c.x, p.z - c.z));
      const y0 = c.yaw, p0 = c.pitch, dy = wrap(yaw1 - y0);
      await go(tween(0.35, (k) => { const e = ease(k); c.yaw = y0 + dy * e; c.pitch = p0 + (pitch1 - p0) * e; hold(); }));
    }
    this.chipLump = lump;
    a.play('pickup', { vol: 0.45 });
    const at = () => lump.getWorldPosition(new THREE.Vector3());
    const eye = () => this.cam ? new THREE.Vector3(this.cam.x, this.cam.y, this.cam.z) : null;
    // the blows play out on scene time while he says his one word (a skip cuts them short)
    let left = 1, n = 0, jolt = 0;
    const blows = tween(2.6, (k) => {
      const want = Math.min(7, Math.floor(k * 7.2));
      while (n < want && left > 0) {
        n++;
        left = chipLump(fx, lump, 9, eye());
        lump.rotation.y += 0.55;
        jolt = 0.015;
        star.rig.doEmote?.('nod', 0.3);
        a.play('chisel', { vol: 0.55, pitch: 0.95 + Math.random() * 0.15 });
        if (n === 2) teachWord(this.game, 'Chip the rock off', at().add(new THREE.Vector3(0, 0.14, 0)), { life: 2.4, size: 0.42 });
      }
      jolt *= 0.75;
      hold(jolt);
    });
    // (one passing word by his head: it doesn't take the camera away from the lump)
    this.starLine('<i>Tink, tink.</i> Like so.', { mood: 'happy', dur: 2.8 });
    await go(blows);
    // the last of the crust lets go: the copper's bare, and it shines
    for (const b of lump.children) if (b.userData.rock) b.visible = false;
    const p = at();
    flare(fx, p, { n: 10, speed: 1.2 });
    a.play('sparkle', { vol: 0.45 });
    teachWord(this.game, 'Clean ore sells', p.add(new THREE.Vector3(0, 0.3, 0)), { kind: 'gold', life: 2.2, size: 0.42 });
    await go(sleep(1.1));
    star.drop();
    lump.userData.dispose?.();
    this.chipLump = null;
  }

  /** Back home in the middle of the lessons (from: 'lift' | 'forge' | 'cooking'). */
  async onLessonArrival(from) {
    const st = this.game.state, stage = this.lessonStage(), star = this.star, ui = this.game.ui;
    if (!star?.rig) return;
    if (stage === 'mine' && from === 'lift') {
      if (st.count('copper_ore') > 0) {
        this.endHomeTutor();
        let done = false;
        const lump = copperLump();
        await this.cutscene(async (tools) => {
          const { line, go, sleep } = tools;
          star.scripted = true;
          const p = this.cam || this.rig.player.pos;
          // he hurries over and holds out his paws; the lump goes into them
          const at = this.approachSpot(0.9);
          await go(Promise.race([star.walkTo(at.x, at.z, 1.25), sleep(3.2)]));
          star.faceTo(p.x, p.z);
          await go(this.faceStar((s, f) => this.tween(s, f), 0.45));
          star.scripted = false;
          star.carry(lump);
          // (held up to his nose for a sniff, where the close shot can see it)
          lump.position.set(0, 0.54, 0.3);
          lump.scale.setScalar(1.6);
          this.game.audio.play('pickup', { vol: 0.5 });
          await go(sleep(0.3));
          star.sniff();
          this.sniffSound?.();
          await go(sleep(0.45));
          const h = star.head(new THREE.Vector3());
          flare(this.fx, h.add(new THREE.Vector3(0, -0.3, 0)), { n: 12, speed: 1.6 });
          this.game.audio.play('sparkle', { vol: 0.4 });
          this.copperHome();
          done = true;
          await line('<i>Snff.</i> Copper. Not bad for a first go. Coal\'s in your bag.', 'proud');
          star.drop();
          lump.userData.dispose?.();
          await this.holdOut(notebook(), 'My <b>notebook</b>. Don\'t read the back pages.', 'happy', tools);
          ui.unlock?.(['book', 'radar', 'layers']);
          star.gesture('point', 1.6);
          await line('<b>Forge</b>. Go on.', 'happy');
        }, { face: false });
        if (star.carrying) star.drop();
        lump.userData.dispose?.();
        star.scripted = false;
        if (!done) this.copperHome();
        ui.unlock?.(['book', 'radar', 'layers']);
        this.placeStarForLesson();
        this.startHomeTutor('forgeGo');
      } else {
        this.starLine('No copper? Orange flecks, just past the cage. Back down.', { mood: 'stern' });
        this.startHomeTutor('lift');
      }
      return;
    }
    if (stage === 'pick' && from === 'forge') {
      this.starLine('No pick? You can\'t dig with your nose. I can, mind. Forge.', { mood: 'stern' });
      this.placeStarForLesson();
      this.startHomeTutor('forgeGo');
      return;
    }
    if (stage === 'mine' && from === 'forge') {
      // back with the pick you forged: he admires it (the forge roars up), hands you his old satchel
      // with his spare chisel in it
      const q = st.data.toolQ?.pick_first ?? 60;
      this.endHomeTutor();
      ui.unlock?.(['belt', 'dig']);
      await this.cutscene(async (tools) => {
        const { line, go, sleep } = tools;
        // (wave 18: he comes over to see it, sniffing the air on the way; you turn to him as he comes)
        await this.comeOver(tools, 1.0);
        star.sniff();
        this.sniffSound?.();
        await go(sleep(0.4));
        star.gesture(q >= 55 ? 'cheer' : 'point', 1.6);
        this.flareAt(this.firePos('forge'), { n: 30 });
        await line(q >= 80 ? 'Huh. Look at that edge. Who taught you that?' : q >= 55 ? 'Lumpy on the cheek. It\'ll bite rock, though.' : 'It\'s pick-shaped. Mostly. It\'ll dig.', q >= 55 ? 'proud' : 'laugh');
        await this.holdOut(satchel(), 'My old <b>satchel</b>. Spare <b>chisel</b> in it. Mind the hole.', 'happy', tools);
        this.giveChisel();
        ui.unlock?.(['pack', 'tools']);
        // (he shows you what the chisel's for: ore comes out of the wall in a crust of rock)
        await this.chipDemo(tools);
        star.gesture('point', 1.6);
        await line('<b>Copper</b> next. Down the cage. Look for orange.', 'happy');
      });
      this.giveChisel();
      ui.unlock?.(['pack', 'tools']);
      if (this.lessonStage() === 'mine') { this.placeStarForLesson(); this.startHomeTutor('lift'); }
      return;
    }
    if (stage === 'forge' && from === 'forge') {
      // the forge's tutorial moves the stage on when the blade is done (state.data.oldstar.lesson = 'cook')
      this.starLine('Still warm? Back to it. The forge won\'t hammer itself. I\'ve asked.', { mood: 'stern' });
      this.startHomeTutor('forgeGo');
      return;
    }
    if (stage === 'cook' && from === 'forge') {
      const w = (st.data.weapons || []).slice(-1)[0];
      const good = 'SAB'.includes(w ? (w.grade || 'C') : 'C');
      await this.cutscene(async (tools) => {
        const { line } = tools;
        await this.comeOver(tools, 1.0);
        star.gesture(good ? 'cheer' : 'point', 1.6);
        await line(good ? `That's a ${w?.name || 'blade'}. A real one. Now feed me: <b>fire pit</b>.` : 'Lumpy. It\'ll sell. Now feed me: <b>fire pit</b>.', good ? 'proud' : 'laugh');
      });
      this.placeStarForLesson();
      this.startHomeTutor('cookGo');
      return;
    }
    if (stage === 'cook' && (from === 'cooking' || from === 'stove')) {
      const cooked = this.arrivalLesson === 'cook_done' || (this.arrivalLesson !== 'cook' && ((st.data.stats?.dishes || 0) > (starData(st).dishesAtLesson ?? 0) || Object.keys(st.data.recipes || {}).length > 0));
      if (!cooked) { this.starLine('Nothing in the pan? Even I can boil an egg, and I\'m a hundred and four.', { mood: 'stern' }); this.startHomeTutor('cookGo'); return; }
      this.lessonAct('cook_done');
      this.setLesson('done');
      this.endHomeTutor();
      star.lessonSpot = null;
      const ob = this.game.ui.onboard;
      ob?.goal(null);
      await this.cutscene(async ({ line, go, sleep }) => {
        star.scripted = true;
        const p = this.cam || this.rig.player.pos;
        const at = this.approachSpot(1.0);
        await go(Promise.race([star.walkTo(at.x, at.z), sleep(3)]));
        star.faceTo(p.x, p.z);
        star.scripted = false;
        await go(this.faceStar((s, f) => this.tween(s, f), 0.5));
        await line('Mm. That\'s proper food. Right. That\'s everything I know.', 'happy');
        // the fire roars up behind him: the lessons are over
        star.gesture('cheer', 2);
        const fire = this.firePos('hearth');
        this.flareAt(fire, { n: 46, speed: 3.2, fanfare: true });
        this.later(0.35, () => this.flareAt(fire, { n: 24, speed: 2.4 }));
        this.post.flashColor = 0xffb060;
        this.tween(0.9, (k) => { this.post.flash = 0.18 * (1 - k); }).then(() => { this.post.flash = 0; });
        await go(sleep(1.2));
        await line('The rest is a <span class="gold-txt">million</span> and a sore back. Deep Town\'s down there somewhere. They buy anything.', 'proud');
      }, { face: false });
      star.scripted = false;
      // everything else comes in now: your gold, your skills, your tasks, building
      ob?.setLevel(TUT.FULL, { force: true });
      star.nextT = 8;
      st.save();
    }
  }

  /** The copper's handed over: the act, his coal, and the forge lesson is next (same outcome as ever). Returns true if he gave coal. */
  copperHome() {
    const st = this.game.state;
    if (this.lessonStage() !== 'mine') return false;
    st.flag('prologue', true); // (the mining lesson is done)
    this.lessonAct('copper_home');
    let gave = false;
    if (st.count('coal') < 2) { st.addItem('coal', { spill: true, n: 3 }); gave = true; }
    this.setLesson('forge');
    return gave;
  }

  /** Before the forge lesson: make sure there's enough to learn with (two copper ore and coal). */
  prepForgeLesson() {
    const st = this.game.state;
    if (st.count('copper_ingot') < 1 && st.count('copper_ore') < 2) st.addItem('copper_ore', { spill: true, q: 70, n: 2 - st.count('copper_ore') });
    if (st.count('coal') < 2) st.addItem('coal', { spill: true, n: 3 });
    if (!st.owns('bp_dagger')) st.addItem('bp_dagger', { spill: true, n: 1 });
  }

  /** Before the cooking lesson. (wave 16: no free eggs and mushrooms any more; Old Star hands over
   *  just the lesson's glowcap and salt (cooking/lesson.js); the rest you gather: deep/veg/harvest.js) */
  prepCookLesson() {
    const st = this.game.state, sd = starData(st);
    sd.dishesAtLesson = st.data.stats?.dishes || 0;
  }

  // ------------------------------------------------------------ the tutorial at home (step by step)
  /** The tutorial's state right now (tests): { step, t, ... } or null. */
  homeTutor() { const t = this.tut; return t ? { step: t.step, t: +t.t.toFixed(2), walked: +(t.walked || 0).toFixed(2), busy: !!t.busy } : null; }

  /** Is the tutorial still on (a new game whose lessons aren't over)? */
  tutorialOn() {
    const ob = this.game.ui.onboard;
    return !!ob?.data && ob.level < TUT.FULL;
  }

  /**
   * Start (or move on to) a step of the tutorial at home: 'forgeGo' (the pick, the smelting) |
   * 'lift' (down to the mine) | 'cookGo'. One quiet line, the thing glints; he waits there.
   */
  startHomeTutor(step) {
    // (old names from saves and tests: the look / walk / talk steps are gone, you just move)
    if (step === 'follow') step = 'lift';
    if (step === 'look' || step === 'walk' || step === 'talk') step = this.lessonStage() === 'mine' ? 'lift' : this.lessonStage() === 'cook' ? 'cookGo' : 'forgeGo';
    if (!this.tutorialOn()) { this.placeStarForLesson(); return; }
    const ui = this.game.ui, ob = ui.onboard, star = this.star;
    if (!this.tut) this.own(() => this.endHomeTutor());
    this.leaveStep();
    const pl = this.rig.player;
    const t = this.tut = { step, t: 0, walked: 0, px: pl.pos.x, pz: pl.pos.z, cd: {}, mark: null, glint: null };
    if (ob?.data) ob.data.home = step;
    this.gateItems();
    if (star?.rig) star.nextT = 999;
    let pos, glintAt, call;
    if (step === 'lift') {
      const L = this.liftSpot();
      pos = L; glintAt = L; call = CALL.lift;
    } else {
      const forge = step === 'forgeGo';
      const fire = this.firePos(forge ? 'forge' : 'hearth');
      const q = this.questSpot?.(forge ? 'forge' : 'hearth');
      pos = q ? new THREE.Vector3(q.x, q.y, q.z) : fire || pl.pos.clone();
      glintAt = fire || pos;
      call = forge ? (this.lessonStage() === 'pick' ? CALL.pick : CALL.forge) : CALL.cook;
    }
    t.target = () => pos;
    t.call = call;
    t.calls = 0;
    // (wave 18: nothing on screen. The thing glints in the world, he goes there and works, and he
    // calls you over if you dawdle: tickHomeTutor)
    t.glint = new Glint(this.fx, () => glintAt, { r: step === 'lift' ? 0.3 : 0.28 });
    ob?.goal(null);
    if (star?.rig && step === 'lift' && star.spot !== 'lift') { star.scripted = false; this.placeStarForLesson(); }
  }

  /** The cage lift's spot (meters, from questSpot('lift')): where you stand to ride it. */
  liftSpot() {
    const q = this.questSpot?.('lift');
    return q ? new THREE.Vector3(q.x, q.y, q.z) : this.rig.player.pos.clone();
  }

  leaveStep() {
    const t = this.tut;
    if (!t) return;
    t.mark?.remove?.();
    t.glint?.remove();
    t.mark = null;
    t.glint = null;
  }

  /** The tutorial at home is over (the ride, a scene change, a skip): the line and the glints go. */
  endHomeTutor() {
    if (!this.tut) return;
    this.leaveStep();
    this.tut = null;
    const star = this.star;
    if (star?.rig && star.scripted && !this.scripted && !this.cine) star.scripted = false;
  }

  /** While a lesson is on, the cage and the way out wait (the e2e's debug.interact still reaches anything). */
  gateItems() {
    for (const it of this.rig.items) {
      if (it._tutGate) continue;
      const en = it.enabled;
      it._tutGate = true;
      it.enabled = () => (!en || en()) && this.tutAllows(it);
    }
  }

  tutAllows(it) {
    // (most labels are functions of the moment: 'Talk to Old Star', 'Ride down to the dig'…)
    let label = '';
    try { label = String((typeof it.label === 'function' ? it.label(it) : it.label) || ''); } catch (e) { /* noop */ }
    // things you haven't been given yet (src/ui/Onboard.js UNLOCKS)
    const st = this.game.state;
    for (const [re, id] of NEEDS) if (re.test(label) && !st.unlocked(id)) return false;
    if (!this.tutorialOn()) return true;
    if (LOCKED.test(label)) return this.lessonStage() === 'mine' && /lift|lever|dig/i.test(label);
    return true;
  }

  /** Per frame (from tickWakeFx): the step's glint, how far you've walked, and Old Star beckoning. */
  tickHomeTutor(dt) {
    // a game picked up mid-tutorial (a reload, waking from bed): the step comes back once you're free
    if (!this.tut && !this.tutResumed) { this.tutResumeT = (this.tutResumeT ?? 0.3) - dt; if (this.tutResumeT <= 0) { this.tutResumeT = 0.5; this.resumeHomeTutor(); } }
    const t = this.tut;
    if (!t || !this.rig) return;
    t.t += dt;
    const pl = this.rig.player, star = this.star;
    if (this.scripted || this.cine || this.riding) { t.px = pl.pos.x; t.pz = pl.pos.z; return; }
    t.glint?.update(dt);
    const moved = Math.hypot(pl.pos.x - t.px, pl.pos.z - t.pz);
    if (moved < 0.5) t.walked += moved;
    t.px = pl.pos.x; t.pz = pl.pos.z;
    // coming near: he looks up from his work and beckons you on (no words)
    const p = t.target();
    const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
    if (star?.rig && !star.scripted && star.mode !== 'walk' && d < 3.2 && this.tutCd('beckon', 9)) {
      star.pauseT = Math.max(star.pauseT || 0, 2.5);
      star.faceTo(pl.pos.x, pl.pos.z);
      star.gesture(t.step === 'lift' ? 'point' : 'beckon', 1.6);
    }
    // dawdling: he looks up from his work and calls you over (a few words by his head, no card)
    if (star?.rig && !star.scripted && star.mode !== 'walk' && d > 2.4 && t.t > 12 && t.call?.length && this.tutCd('call', 16)) {
      star.pauseT = Math.max(star.pauseT || 0, 2.8);
      star.faceTo(pl.pos.x, pl.pos.z);
      star.gesture(t.step === 'lift' ? 'point' : 'beckon', 1.8);
      this.starLine(t.call[t.calls++ % t.call.length], { mood: 'calm', dur: 2.8 });
    }
  }

  tutCd(key, secs) {
    const t = this.tut;
    if (!t) return false;
    if (t.cd[key] !== undefined && t.t - t.cd[key] < secs) return false;
    t.cd[key] = t.t;
    return true;
  }

  /** Coming back to a game mid-tutorial (a reload, a sleep): pick the step up again. */
  resumeHomeTutor() {
    if (!this.tutorialOn()) { this.tutResumed = true; return; }
    if (this.tut || this.waking || this.scripted || this.riding || this.cine) return;
    this.tutResumed = true;
    const from = this.from, stage = this.lessonStage();
    if (from === 'fall' || from === 'newgame' || from === 'lift' || from === 'forge' || from === 'cooking' || from === 'stove') return; // the arrival has its own
    if (stage === 'pick') { this.placeStarForLesson(); this.startHomeTutor('forgeGo'); } else if (stage === 'mine') this.startHomeTutor('lift');
    else if (stage === 'forge') this.startHomeTutor('forgeGo');
    else if (stage === 'cook') this.startHomeTutor('cookGo');
  }
}
