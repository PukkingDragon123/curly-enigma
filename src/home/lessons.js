// Old Star's lessons at home (mixed into HomeScene): the tutorial, cinematic but light. The chain
// (quest `lessons`, src/data/quests.js) moves on `act` events; this keeps its own stage in
// state.data.oldstar.lesson so the home knows what Old Star wants next:
//   wake   → the waking-up cutscene (wake.js); then one control at a time, each taught when it's
//            first needed: look round (mouse / drag) → walk over to him (WASD / the stick) → talk to
//            him (E / the hand). You can wander: nothing pulls you back, nothing is locked but the
//            cage and the way out.
//   pick   → you fell down here with nothing: no pick, no digging. After his talk he heads for his
//            forge and you make your own (forge { from: 'home', tutorial: true, pick: true }: the
//            forge piece pick_first, src/forge/tutorial.js)
//   mine   → back with the pick he admires it (the forge flares up) and gives you his spare chisel;
//            the cage drops to the real mine entrance (deep { from: 'lift', lift: 'L0', lesson:
//            'mine' }): find copper ore in the caves there (src/deep/FirstDig.js: his old copper dig
//            is a short walk from the cage) and ride home with it
//   forge  → back with copper: he takes the lump in his paws, sniffs it, gives you coal; to his forge
//            (forge { from: 'home', tutorial: true }; src/forge/tutorial.js)
//   cook   → back with your first blade: a word, then to his fire pit (cooking { from: 'home',
//            tutorial: true }; src/cooking/lesson.js)
//   done   → back with a meal in you: the graduation (the fire roars up, he cheers), the whole HUD.
// What to do now is one short line at the top (ui.onboard.goal) and the thing to use glints in the
// world (gold motes rising off it: src/home/tutorFx.js; an arrow at the screen edge when it's off
// screen); near it, a small prompt says what to press. Big moments are 3D: his gestures, a flare of
// embers off the fire, the copper in his paws. No cards, stamps or confetti.
// The beats are written against the home's stations (questSpot('lift' | 'forge' | 'hearth'), his
// spots, the lift / forge / cooking functions), not against rooms.
// While a lesson is on (the tutorial UI level below full: src/ui/Onboard.js) the cage and the way
// out wait (the cage opens for the mining lesson). Talking to him offers "What now?" and "Skip the
// lessons" (lesson { step: 'skip' }: everything back as it was before the tutorial).
// Acts emitted here: lesson { step: wake | lift | copper_home | cook_done | skip }, talk { npc: 'oldstar' },
// reach { place: 'home' } (unchanged).
// Test hooks: scene.debug (HomeScene) as before; the tutorial's state is scene.homeTutor()
// ({ step, t, ... } or null), and ui.onboard.debug for the prompts.
import * as THREE from 'three';
import { pick } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { starData } from './starData.js';
import { starPortraitURL } from '../ui/Tutor.js';
import { openTalkMenu } from '../ui/choices.js';
import { TUT } from '../ui/Onboard.js';
import { Glint, flare, copperLump } from './tutorFx.js';

const _v = new THREE.Vector3();
const ease = (k) => k * k * (3 - 2 * k);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** What he says the next step is, per stage (his "What now?"), and where he waits. */
const NEXT = {
  pick: { text: 'No pick, no digging. To my <b>forge</b>: we\'ll make you your own.', mood: 'stern', where: 'anvil' },
  mine: { text: 'Copper! The cage drops to the mine entrance. Look for <b>orange specks</b> in the rock and bring me a lump.', mood: 'calm', where: 'lift' },
  forge: { text: 'Copper\'s no good as rock. To the <b>forge</b>: we melt it and hammer you a blade.', mood: 'happy', where: 'anvil' },
  cook: { text: 'A smith who doesn\'t eat is a skeleton with a hammer. To the <b>fire pit</b>!', mood: 'happy', where: 'fire' },
};

/** The one-line objective per step. */
const GOAL = {
  walk: 'Talk to <b>Old Star</b>',
  talk: 'Talk to <b>Old Star</b>',
  pick: 'Forge a pickaxe at <b>the forge</b>',
  lift: 'Ride <b>the cage</b> down to the mine',
  forge: 'Smelt your copper at <b>the forge</b>',
  cook: 'Cook a meal at <b>the fire pit</b>',
};

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
    else if (star.spot !== n.where) star.goTo(n.where);
    star.nextT = 999;
  }

  /** E on Old Star while there are lessons: a little talk menu. Returns true if it handled the talk. */
  lessonTalk() {
    const stage = this.lessonStage();
    if (stage === 'done' || stage === 'wake') return false;
    // the first talk (any time before it's had: you needn't wait for the prompt)
    const s = this.tut?.step;
    if (s === 'talk' || s === 'walk' || s === 'look') { this.tutTalkBeat(); return true; }
    const n = NEXT[stage];
    const close = () => h?.close();
    const opt = (label, sub, fn, primary = false) => ({ label, sub, primary, onClick: () => { close(); fn(); } });
    const h = openTalkMenu(this.game, {
      name: 'Old Star', face: starPortraitURL(n?.mood || 'calm'), who: 'oldstar',
      line: 'Old Star squints at you over his spectacles. <i>"Well?"</i>',
      options: [
        opt('What do I do next?', null, () => this.starLine(n.text, { mood: n.mood }), true),
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

  /** The lessons are over: hand over what they would have given, and say so. */
  skipLessons() {
    const st = this.game.state, sd = starData(st);
    const stage = sd.lesson;
    sd.skipped = true;
    const gifts = [];
    if ((stage === 'pick' || stage === 'wake') && !st.equipped('pick')) this.givePick(60);
    this.giveChisel();
    if (stage === 'mine' || stage === 'wake' || stage === 'pick') { st.addItem('copper_ingot', { spill: true, q: 70, n: 1 }); gifts.push('copper_ingot'); }
    if (st.count('coal') < 3) { st.addItem('coal', { spill: true, n: 3 }); gifts.push('coal'); }
    if (stage !== 'done') { st.addItem('mushroom', { spill: true, n: 2 }); }
    st.flag('prologue', true);
    this.setLesson('done');
    this.endHomeTutor();
    this.lessonAct('skip'); // (the tutorial UI level goes to full: src/ui/Onboard.js)
    this.game.ui.setTutorialLevel?.(TUT.FULL);
    this.game.ui.onboard?.goal(null);
    this.game.audio.play('page');
    this.game.ui.toast(`Old Star shrugs and hands you ${gifts.map((id) => ITEMS[id]?.name || id).join(' and ') || 'a pat on the back'}.`, { icon: gifts[0] ? iconURL(gifts[0]) : undefined, kind: 'good', dur: 3600 });
    const star = this.star;
    if (star) {
      star.lessonSpot = null;
      star.scripted = false;
      star.nextT = 6;
      this.starLine('A know-it-all, eh? Fine by me. Off you go and earn that million: the lift goes down, the coins come up. And come home to sleep.', { mood: 'laugh' });
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
    this.game.ui.setTutorialLevel?.(TUT.QUEST);
    // (a word over his shoulder as the gate shuts: it floats by him, the cutscene's bars stay clear)
    if (this.star?.rig) this.starLine('Dig the rock <b>round</b> the ore, not the ore. Ring the bell to come home!', { mood: 'happy', dur: 3.2 });
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
    this.camera.fov = fov0;
    this.camera.updateProjectionMatrix();
    if (!wasScripted && this.scripted) this.endScript();
    ob?.cinema(false);
    this.cine = null;
    return !cut.on;
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

  /** Back home in the middle of the lessons (from: 'lift' | 'forge' | 'cooking'). */
  async onLessonArrival(from) {
    const st = this.game.state, stage = this.lessonStage(), star = this.star;
    if (!star?.rig) return;
    if (stage === 'mine' && from === 'lift') {
      if (st.count('copper_ore') > 0) {
        this.endHomeTutor();
        let done = false;
        const lump = copperLump();
        await this.cutscene(async ({ line, go, sleep }) => {
          star.scripted = true;
          const p = this.cam || this.rig.player.pos;
          // he hurries over and holds out his paws; the lump goes into them
          const at = this.approachSpot(0.9);
          await go(Promise.race([star.walkTo(at.x, at.z, 1.25), sleep(3.2)]));
          star.faceTo(p.x, p.z);
          await go(this.faceStar((s, f) => this.tween(s, f), 0.45));
          star.scripted = false;
          star.carry(lump);
          this.game.audio.play('pickup', { vol: 0.5 });
          await go(sleep(0.3));
          star.sniff();
          this.sniffSound?.();
          await go(sleep(0.45));
          const h = star.head(new THREE.Vector3());
          flare(this.fx, h.add(new THREE.Vector3(0, -0.3, 0)), { n: 12, speed: 1.6 });
          this.game.audio.play('sparkle', { vol: 0.4 });
          const coal = this.copperHome(true);
          done = true;
          await line('<i>*snff*</i> Copper! And you didn\'t smash it. ' + (coal ? 'Here, coal for the fire. ' : '') + 'Now we melt it: to the <b>forge</b>!', 'proud');
        }, { face: false });
        star.drop();
        lump.userData.dispose?.();
        star.scripted = false;
        if (!done) this.copperHome();
        this.placeStarForLesson();
        this.startHomeTutor('forgeGo');
      } else {
        this.starLine('No copper? Orange specks in the rock, just past the cage. Back down you go.', { mood: 'stern' });
        this.startHomeTutor('lift');
      }
      return;
    }
    if (stage === 'pick' && from === 'forge') {
      this.starLine('No pick yet? You can\'t dig with your nose. Well, I can. Back to the forge.', { mood: 'stern' });
      this.placeStarForLesson();
      this.startHomeTutor('forgeGo');
      return;
    }
    if (stage === 'mine' && from === 'forge') {
      // back with the pick you forged: he admires it (the forge roars up), hands you his chisel
      const q = st.data.toolQ?.pick_first ?? 60;
      this.endHomeTutor();
      await this.cutscene(async ({ line, go, sleep }) => {
        star.sniff();
        this.sniffSound?.();
        await go(sleep(0.4));
        star.gesture(q >= 55 ? 'cheer' : 'point', 1.6);
        this.flareAt(this.firePos('forge'), { n: 30 });
        flare(this.fx, star.head(new THREE.Vector3()).add(new THREE.Vector3(0, -0.25, 0)), { n: 14, speed: 1.6 });
        await line(q >= 80 ? 'Look at that edge! It\'d shame half of Deep Town.' : q >= 55 ? 'A proper pick! Lumpy on the cheek, but it\'ll bite rock.' : 'Well, it\'s more or less pick-shaped. It\'ll dig.', q >= 55 ? 'proud' : 'laugh');
        if (this.giveChisel()) this.game.audio.play('pickup', { vol: 0.5 });
        star.gesture('point', 1.6);
        await line('Take my spare <b>chisel</b> too. Now: <b>copper</b>. The cage drops to the mine. Orange specks in the rock: bring me a lump.', 'happy');
      });
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
      await this.cutscene(async ({ line }) => {
        star.gesture(good ? 'cheer' : 'point', 1.6);
        await line(`${good ? 'A fine' : 'A lumpy'} ${w?.name || 'blade'}, and it's yours. ${good ? 'Your granny would cry.' : 'It\'ll sell.'} Now I'm starving: to the <b>fire pit</b>!`, good ? 'proud' : 'laugh');
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
        await line('Mm! Proper food. Now you can dig, forge and cook. That\'s all I know, more or less.', 'happy');
        // the fire roars up behind him: the lessons are over
        star.gesture('cheer', 2);
        const fire = this.firePos('hearth');
        this.flareAt(fire, { n: 46, speed: 3.2, fanfare: true });
        this.later(0.35, () => this.flareAt(fire, { n: 24, speed: 2.4 }));
        this.post.flashColor = 0xffb060;
        this.tween(0.9, (k) => { this.post.flash = 0.18 * (1 - k); }).then(() => { this.post.flash = 0; });
        await go(sleep(1.2));
        await line('The rest is a <span class="gold-txt">million gold</span> and a lot of digging. Sell the lot in Deep Town. Off you go!', 'proud');
      }, { face: false });
      star.scripted = false;
      // the whole HUD fades in: your gold, your lantern, your tasks
      ob?.setLevel(TUT.FULL, { force: true });
      this.later(2.0, () => {
        const inp = this.game.input;
        const h = ob?.teach('snack', { optional: true, done: () => inp.pressed('KeyQ'), min: 0.4 });
        if (h) this.later(9, () => { if (!h.settled) h.close(); });
      });
      star.nextT = 8;
      st.save();
    }
  }

  /**
   * The copper's handed over: the act, his coal, and the forge lesson is next (same outcome as ever).
   * quiet: no toast for the coal. Returns true if he gave coal.
   */
  copperHome(quiet = false) {
    const st = this.game.state;
    if (this.lessonStage() !== 'mine') return false;
    st.flag('prologue', true); // (the mining lesson is done)
    this.lessonAct('copper_home');
    let gave = false;
    if (st.count('coal') < 2) { st.addItem('coal', { spill: true, n: 3 }); gave = true; if (!quiet) this.game.ui.toast('Old Star gives you <b>3 coal</b>', { icon: iconURL('coal'), kind: 'good' }); }
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

  /** Before the cooking lesson: something to cook (an egg and mushrooms, if the pack's bare). */
  prepCookLesson() {
    const st = this.game.state, sd = starData(st);
    sd.dishesAtLesson = st.data.stats?.dishes || 0;
    const food = st.inventory((it) => it && (it.cat === 'food' || it.cat === 'plant' || it.cat === 'ingredient'));
    if (food.length < 2) {
      st.addItem('egg', { spill: true, n: 2 });
      st.addItem('mushroom', { spill: true, n: 2 });
    }
  }

  // ------------------------------------------------------------ the tutorial at home (step by step)
  /** The tutorial's state right now (tests): { step, t, ... } or null. */
  homeTutor() { const t = this.tut; return t ? { step: t.step, t: +t.t.toFixed(2), look: +(t.look || 0).toFixed(2), walked: +(t.walked || 0).toFixed(2), busy: !!t.busy } : null; }

  /** Is the tutorial still on (a new game whose lessons aren't over)? */
  tutorialOn() {
    const ob = this.game.ui.onboard;
    return !!ob?.data && ob.level < TUT.FULL;
  }

  /** Start (or move on to) a step of the tutorial at home. */
  startHomeTutor(step) {
    if (step === 'follow') step = 'lift'; // (the old "follow him to the cage": you know the way now)
    if (!this.tutorialOn()) { if (step === 'look' || step === 'walk' || step === 'talk') this.placeStarForLesson(); return; }
    const ui = this.game.ui, ob = ui.onboard, star = this.star;
    if (!this.tut) this.own(() => this.endHomeTutor());
    this.leaveStep();
    const pl = this.rig.player;
    const t = this.tut = { step, t: 0, look: 0, walked: 0, yaw: pl.yaw, pitch: pl.pitch, px: pl.pos.x, pz: pl.pos.z, cd: {}, h: null, mark: null, glint: null };
    if (ob?.data) ob.data.home = step;
    this.gateItems();
    if (star?.rig) star.nextT = 999;
    const starHead = () => (star?.rig ? star.head(new THREE.Vector3()).add(new THREE.Vector3(0, 0.2, 0)) : null);
    switch (step) {
      case 'look': {
        ob?.setLevel(TUT.LOOK);
        t.h = ob?.teach('look', { progress: () => t.look / 1.6, min: 0.8 });
        t.h?.promise.then((ok) => { if (ok && this.tut === t) this.later(0.2, () => this.tut === t && this.startHomeTutor('walk')); });
        break;
      }
      case 'walk': {
        ob?.setLevel(TUT.WALK);
        ob?.goal(GOAL.walk);
        if (star?.rig) { star.scripted = false; star.faceTo(pl.pos.x, pl.pos.z); star.gesture('wave', 1.6); }
        t.mark = ob?.mark(starHead, { edgeOnly: true, near: 5 });
        t.h = ob?.teach('walk', { progress: () => t.walked / 1.6 });
        break;
      }
      case 'talk': {
        ob?.setLevel(TUT.USE);
        ob?.goal(GOAL.talk);
        if (star?.rig) { star.scripted = false; star.faceTo(pl.pos.x, pl.pos.z); }
        t.mark = ob?.mark(starHead, { edgeOnly: true, near: 5 });
        t.h = ob?.teach('talk', { title: 'Talk to Old Star', done: () => !!t.talked, min: 0.4 });
        break;
      }
      case 'lift': {
        ob?.setLevel(TUT.QUEST);
        ob?.goal(GOAL.lift);
        const L = this.liftSpot();
        t.target = () => L;
        t.glint = new Glint(this.fx, () => L, { r: 0.3 });
        t.mark = ob?.mark(() => L, { edgeOnly: true, near: 4.5, label: 'The cage' });
        if (star?.rig && star.spot !== 'lift') { star.scripted = false; this.placeStarForLesson(); }
        break;
      }
      case 'forgeGo': case 'cookGo': {
        ob?.setLevel(TUT.QUEST);
        const forge = step === 'forgeGo';
        ob?.goal(forge ? (this.lessonStage() === 'pick' ? GOAL.pick : GOAL.forge) : GOAL.cook);
        const fire = this.firePos(forge ? 'forge' : 'hearth');
        const q = this.questSpot?.(forge ? 'forge' : 'hearth');
        const pos = q ? new THREE.Vector3(q.x, q.y, q.z) : fire || pl.pos.clone();
        t.target = () => pos;
        t.glint = new Glint(this.fx, () => fire || pos, { r: 0.28 });
        t.mark = ob?.mark(() => pos, { edgeOnly: true, near: 4.5, label: forge ? 'The forge' : 'The fire pit' });
        break;
      }
    }
  }

  /** The cage lift's spot (meters, from questSpot('lift')): where you stand to ride it. */
  liftSpot() {
    const q = this.questSpot?.('lift');
    return q ? new THREE.Vector3(q.x, q.y, q.z) : this.rig.player.pos.clone();
  }

  leaveStep() {
    const t = this.tut;
    if (!t) return;
    t.h?.close?.();
    t.mark?.remove?.();
    t.glint?.remove();
    t.h = null;
    t.mark = null;
    t.glint = null;
  }

  /** The tutorial at home is over (the ride, a scene change, a skip): prompts and glints go. */
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
    if (!this.tutorialOn()) return true;
    // (most labels are functions of the moment: 'Talk to Old Star', 'Ride down to the dig'…)
    let label = '';
    try { label = String((typeof it.label === 'function' ? it.label(it) : it.label) || ''); } catch (e) { /* noop */ }
    if (LOCKED.test(label)) return this.lessonStage() === 'mine' && /lift|lever|dig/i.test(label);
    return true;
  }

  /** Per frame (from tickWakeFx): the step's checks and its glint. */
  tickHomeTutor(dt) {
    // a game picked up mid-tutorial (a reload, waking from bed): the step comes back once you're free
    if (!this.tut && !this.tutResumed) { this.tutResumeT = (this.tutResumeT ?? 0.3) - dt; if (this.tutResumeT <= 0) { this.tutResumeT = 0.5; this.resumeHomeTutor(); } }
    const t = this.tut;
    if (!t || !this.rig) return;
    t.t += dt;
    const pl = this.rig.player, star = this.star, inp = this.game.input;
    if (this.scripted || this.cine || this.riding) { t.yaw = pl.yaw; t.pitch = pl.pitch; t.px = pl.pos.x; t.pz = pl.pos.z; return; }
    t.glint?.update(dt);
    // what the player did this frame
    const dyaw = Math.abs(wrap(pl.yaw - t.yaw)), dp = Math.abs(pl.pitch - t.pitch);
    t.yaw = pl.yaw; t.pitch = pl.pitch;
    t.look += Math.min(0.5, dyaw + dp * 0.8);
    const moved = Math.hypot(pl.pos.x - t.px, pl.pos.z - t.pz);
    if (moved < 0.5) t.walked += moved;
    t.px = pl.pos.x; t.pz = pl.pos.z;
    const dist = star?.rig ? Math.hypot(star.pos.x - pl.pos.x, star.pos.z - pl.pos.z) : 0;
    const ob = this.game.ui.onboard;
    switch (t.step) {
      case 'look':
        // already walking about: the look's learned
        if (t.walked > 0.8 && t.t > 1) t.h?.complete?.();
        break;
      case 'walk':
        if (dist < 1.9 && t.t > 0.6) { t.h?.complete?.(); t.step = 'walk-done'; this.later(0.5, () => this.tut === t && this.startHomeTutor('talk')); }
        break;
      case 'talk':
        // near him, E talks without aiming (touch: the hand button)
        if (!t.talked && dist < 1.7 && inp.pressed('KeyE') && !this.rig.target) { inp.consume('KeyE'); this.tutTalkBeat(); }
        // walked off: the walk prompt again is noise; just the line and the arrow
        break;
      case 'lift': case 'forgeGo': case 'cookGo': {
        const p = t.target();
        const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
        if (d < 2.4 && !t.h) {
          const what = t.step === 'lift' ? 'cage' : t.step === 'forgeGo' ? 'forge' : 'fire';
          const title = t.step === 'lift' ? 'Ride down' : t.step === 'forgeGo' ? 'Use the forge' : 'Cook';
          t.h = ob?.teach('use', { title, subPc: `Look at the ${what}, press <kbd>E</kbd>`, subT: `Look at the ${what}, tap the hand`, done: () => (t.step === 'lift' ? !!this.riding : false) }) || null;
        } else if (d > 3.4 && t.h && !t.h.done) { t.h.close(); t.h = null; }
        break;
      }
    }
  }

  tutCd(key, secs) {
    const t = this.tut;
    if (!t) return false;
    if (t.cd[key] !== undefined && t.t - t.cd[key] < secs) return false;
    t.cd[key] = t.t;
    return true;
  }

  /** The tutorial's "talk to him" step: his first task, as a short cutscene. */
  async tutTalkBeat() {
    const t = this.tut;
    if (!t || t.busy || t.talked) return;
    t.talked = true;
    t.busy = true;
    t.h?.complete?.();
    const star = this.star, ob = this.game.ui.onboard;
    this.act('talk', { npc: 'oldstar' });
    t.mark?.remove?.();
    t.mark = null;
    ob?.goalDone();
    ob?.setLevel(TUT.USE);
    if (this.lessonStage() === 'pick') {
      await this.cutscene(async ({ line, go, sleep }) => {
        star?.gesture?.('point', 2);
        await line('Where\'s your <b>pick</b>? Lost in the fall, I\'d guess. No pick, no digging.', 'stern');
        if (star?.rig) star.sniff();
        await go(sleep(0.3));
        await line('And mine knows my paws. So: my <b>forge</b>. You\'ll make your own. Come on!', 'happy');
      });
      if (this.tut !== t) return;
      t.busy = false;
      this.placeStarForLesson();
      this.startHomeTutor('forgeGo');
      return;
    }
    await this.cutscene(async ({ line }) => {
      star?.gesture?.('point', 2);
      await line(NEXT.mine.text, 'calm');
    });
    if (this.tut !== t) return;
    t.busy = false;
    this.startHomeTutor('lift');
  }

  /** Coming back to a game mid-tutorial (a reload, a sleep): pick the step up again. */
  resumeHomeTutor() {
    if (!this.tutorialOn()) { this.tutResumed = true; return; }
    if (this.tut || this.waking || this.scripted || this.riding || this.cine) return;
    this.tutResumed = true;
    const from = this.from, stage = this.lessonStage();
    if (from === 'fall' || from === 'newgame' || from === 'lift' || from === 'forge' || from === 'cooking' || from === 'stove') return; // the arrival has its own
    const h = this.game.ui.onboard?.data?.home;
    if (stage === 'pick') {
      if (h === 'look' || h === 'walk' || h === 'talk') this.startHomeTutor('walk');
      else { this.placeStarForLesson(); this.startHomeTutor('forgeGo'); }
    } else if (stage === 'mine') this.startHomeTutor('lift');
    else if (stage === 'forge') this.startHomeTutor('forgeGo');
    else if (stage === 'cook') this.startHomeTutor('cookGo');
  }
}
