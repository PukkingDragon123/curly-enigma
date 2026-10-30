// Old Star's lessons at home (mixed into HomeScene): a forced, cinematic tutorial. The chain (quest
// `lessons`, src/data/quests.js) moves on `act` events; this keeps its own stage in
// state.data.oldstar.lesson so the home knows what Old Star wants next:
//   wake   → the waking-up cutscene (wake.js); then, one control at a time: look round (mouse /
//            drag) → walk over to him (WASD / the stick) → talk to him (E / the hand) → he gives you
//            the first task (the quest strip comes in) → follow him to the cage lift (Shift to run,
//            on a PC) → ride down (E). You're held to the way there by a soft funnel (wander more than
//            a few steps off it and you're put back, he calls you back), the camera eases round to
//            what matters when you've lost it, and only what the lesson needs can be used.
//   pick   → you fell down here with nothing: no pick, no digging. After his talk you follow him
//            to his forge and make your own (forge { from: 'home', tutorial: true, pick: true }:
//            the forge piece pick_first, src/forge/tutorial.js); you come back with it on your belt
//            and he walks you to the cage lift
//   mine   → the cage goes straight to his practice dig (deep { from: 'lift', lift: 'L0', lesson:
//            'mine' }; deep/Prologue.js teaches there)
//   forge  → back with copper: a cutscene (he sniffs it, gives you coal), then to his forge
//            (forge { from: 'home', tutorial: true }; src/forge/tutorial.js)
//   cook   → back with your first blade: a cutscene, then to his fire pit
//            (cooking { from: 'home', tutorial: true }; src/cooking/lesson.js)
// The beats are written against the home's stations (questSpot('lift' | 'forge' | 'hearth'), his
// spots, the lift / forge / cooking functions), not against rooms: the home is his old cave camp.
//   done   → back with a meal in you: the graduation cutscene, the whole HUD, free play.
// While a lesson is on (the tutorial UI level below full: src/ui/Onboard.js) the lift and the front
// door wait (the lift opens for the mining lesson only). Talking to him offers "What now?" and
// "Skip the lessons" (lesson { step: 'skip' }: everything back as it was before the tutorial).
// Acts emitted here: lesson { step: wake | lift | copper_home | cook_done | skip }, talk { npc: 'oldstar' },
// reach { place: 'home' } (unchanged).
// Test hooks: scene.debug (HomeScene) as before; the tutorial's state is scene.homeTutor()
// ({ step, t, ... } or null), and ui.onboard.debug for the prompts.
import * as THREE from 'three';
import { pick, clamp } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { starData } from './starData.js';
import { starPortraitURL } from '../ui/Tutor.js';
import { openTalkMenu } from '../ui/choices.js';
import { TUT } from '../ui/Onboard.js';

const _v = new THREE.Vector3();
const ease = (k) => k * k * (3 - 2 * k);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** What he says the next step is, per stage. */
const NEXT = {
  pick: { text: 'No pick, no digging, and you\'re not borrowing mine: it knows my paws. Over to my <b>forge</b>: we\'ll make you your own. E on the forge.', mood: 'stern', where: 'anvil' },
  mine: { text: 'First lesson: mining. That rusty old cage in the rock shaft goes straight down to my practice dig. Bring me back some <b>copper ore</b>: the orange specks in the rock.', mood: 'calm', where: 'lift' },
  forge: { text: 'Copper\'s no good as rock. Over to my <b>forge</b>: we\'ll melt it into an ingot and hammer you out a blade. E on the forge.', mood: 'happy', where: 'anvil' },
  cook: { text: 'A smith who doesn\'t eat is a skeleton with a hammer. To the <b>fire pit</b> with you: the kettle\'s on, let\'s cook something. E at the fire.', mood: 'happy', where: 'fire' },
};

/**
 * The soft funnel per step: how far from its goal (a point) you may get beyond your closest approach
 * so far (m). Wander further and you're put back where you were; he calls you back.
 */
const SLACK = { look: 1.2, walk: 2.2, 'walk-done': 2.2, talk: 2.2, follow: 3.2, lift: 3.2, forgeGo: 3.6, cookGo: 3.6 };
/** What the crosshair may use in each step (by label); null: anything but the lift and the door. */
const ALLOW = {
  look: /^$/, walk: /^$/, 'walk-done': /^$/, talk: /^talk to old star/i, follow: /^$/, lift: /lift|cage|dig|lever|^talk to old star/i,
};
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

  /** Old Star goes where the lesson is (at the lift, the anvil or the hearth) and waits there. */
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
    // the tutorial's "talk to him" step: his first task, as a cutscene
    if (this.tut?.step === 'talk') { this.tutTalkBeat(); return true; }
    const star = this.star, g = this.game;
    const n = NEXT[stage];
    const close = () => h?.close();
    const opt = (label, sub, fn, primary = false) => ({ label, sub, primary, onClick: () => { close(); fn(); } });
    const h = openTalkMenu(g, {
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
    if (stage === 'mine' || stage === 'wake' || stage === 'pick') { st.addItem('copper_ingot', { spill: true, q: 70, n: 1 }); gifts.push('copper_ingot'); }
    if (st.count('coal') < 3) { st.addItem('coal', { spill: true, n: 3 }); gifts.push('coal'); }
    if (stage !== 'done') { st.addItem('mushroom', { spill: true, n: 2 }); }
    this.setLesson('done');
    this.endHomeTutor();
    this.lessonAct('skip'); // (the tutorial UI level goes to full: src/ui/Onboard.js)
    this.game.ui.setTutorialLevel?.(TUT.FULL);
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

  /** Riding the lift down during the mining lesson. */
  onLessonRide() {
    this.lessonAct('lift');
    this.endHomeTutor();
    this.game.ui.setTutorialLevel?.(TUT.QUEST);
    this.game.ui.tutor?.say('Down you go. Mind the gate, and mind the copper: dig <b>round</b> it, not into it.', { mood: 'calm', dur: 4 });
  }

  // ------------------------------------------------------------ cutscenes at home
  /**
   * A short cutscene: letterbox bars (a hold skips), the camera eased round to Old Star and pushed in
   * a little while he talks. run({ line, go, tween, sleep, cut }) plays it; returns when it's over.
   */
  async cutscene(run, { face = true } = {}) {
    const ui = this.game.ui, ob = ui.onboard, star = this.star;
    const cut = { on: false };
    this.cine = cut;
    ob?.cinema(true, { skip: () => { cut.on = true; cut.fire?.(); ui.tutor?.hide(); this.game.convo?.end?.(); } });
    const wasScripted = this.scripted;
    if (!wasScripted) this.beginScript(false);
    const tools = this.cineTools(cut);
    const line = (html, mood, o = {}) => tools.go(this.starLine(html, { mood, wait: true, ...o }));
    const fov0 = this.camera.fov;
    try {
      // the view eases round to him (the cutscene talk then frames its own shots from there)
      if (face && star?.rig) await tools.go(this.faceStar(tools.tween, 0.8));
      await run({ ...tools, line, cut });
    } catch (e) {
      if (!e?.cut) console.warn('[lessons] cutscene', e);
    }
    if (cut.on) { this.game.ui.tutor?.hide(); }
    this.camera.fov = fov0;
    this.camera.updateProjectionMatrix();
    if (!wasScripted && this.scripted) this.endScript();
    ob?.cinema(false);
    this.cine = null;
    return !cut.on;
  }

  /** Ease the scripted camera round to look at Old Star's face, and push in a little. */
  faceStar(tween, secs = 0.8) {
    const c = this.cam, star = this.star;
    if (!c || !star?.rig) return Promise.resolve();
    const h = star.head(_v).clone();
    const yaw1 = Math.atan2(-(h.x - c.x), -(h.z - c.z));
    const pitch1 = Math.atan2(h.y - 0.08 - c.y, Math.hypot(h.x - c.x, h.z - c.z));
    const y0 = c.yaw, p0 = c.pitch, dy = wrap(yaw1 - y0);
    this.zoomTo?.(this.camera.fov - 10, secs + 0.6, tween);
    return tween(secs, (k) => { const e = ease(k); c.yaw = y0 + dy * e; c.pitch = p0 + (pitch1 - p0) * e; });
  }

  /** Back home in the middle of the lessons (from: 'lift' | 'forge' | 'cooking'). */
  async onLessonArrival(from) {
    const st = this.game.state, stage = this.lessonStage(), star = this.star;
    if (!star?.rig) return;
    const ob = this.game.ui.onboard;
    if (stage === 'mine' && from === 'lift') {
      if (st.count('copper_ore') > 0) {
        this.endHomeTutor();
        let done = false;
        await this.cutscene(async ({ line, go, sleep }) => {
          star.scripted = true;
          const p = this.cam || this.rig.player.pos;
          await go(star.walkTo(p.x - 0.75, p.z));
          star.faceTo(p.x, p.z);
          await go(this.faceStar((s, f) => this.tween(s, f), 0.5));
          star.scripted = false;
          star.sniff();
          this.sniffSound?.();
          await go(sleep(0.3));
          await line('Ooh. Let me sniff it. <i>*snff*</i> Copper! Good clean copper. You didn\'t smash it. I knew you had paws on you.', 'proud');
          this.copperHome();
          done = true;
          star.gesture('point', 2);
          await line(NEXT.forge.text, NEXT.forge.mood);
        }, { face: false });
        star.scripted = false;
        if (!done) this.copperHome();
        this.placeStarForLesson();
        this.startHomeTutor('forgeGo');
      } else {
        this.starLine('Back already? No copper? It\'s in my practice dig, the orange specks in the rock. Back down you go: the cage will take you.', { mood: 'stern' });
        this.startHomeTutor('lift');
      }
      return;
    }
    if (stage === 'pick' && from === 'forge') {
      this.starLine('No pick yet? You can\'t dig with your nose. Well, I can. Back to the forge with you.', { mood: 'stern' });
      this.placeStarForLesson();
      this.startHomeTutor('forgeGo');
      return;
    }
    if (stage === 'mine' && from === 'forge') {
      // back with the pick you forged: he admires it, then walks you to the cage
      const q = st.data.toolQ?.pick_first ?? 60;
      this.endHomeTutor();
      await this.cutscene(async ({ line }) => {
        star.gesture(q >= 70 ? 'cheer' : 'point', 1.6);
        await line(q >= 80 ? 'Look at that edge! First pick you ever made, and it\'d shame half of Deep Town\'s.' : q >= 55 ? 'A proper pick. Bit lumpy on the cheek, but it\'ll bite rock. That\'s what counts.' : 'Well, it\'s more or less pick-shaped. It\'ll dig. Make a better one when you\'re rich.', q >= 70 ? 'proud' : 'laugh');
        await line('Now, the lesson I meant to start with: <b>mining</b>. That rusty old cage goes straight down to my practice dig. Bring me some <b>copper ore</b>. Follow me!', 'happy');
      });
      if (this.lessonStage() === 'mine') this.startHomeTutor('follow');
      return;
    }
    if (stage === 'forge' && from === 'forge') {
      // the forge's tutorial moves the stage on when the blade is done (state.data.oldstar.lesson = 'cook')
      this.starLine('Still warm from the forge? Come on, back to it. The forge won\'t hammer itself. I\'ve asked.', { mood: 'stern' });
      this.startHomeTutor('forgeGo');
      return;
    }
    if (stage === 'cook' && from === 'forge') {
      const w = (st.data.weapons || []).slice(-1)[0];
      const g = w ? (w.grade || 'C') : 'C';
      const good = 'SAB'.includes(g);
      await this.cutscene(async ({ line }) => {
        star.gesture(good ? 'cheer' : 'point', 1.6);
        await line(good ? `Look at that. A ${w?.name || 'blade'}! First go, and it doesn't bend. Your granny would cry.` : `A ${w?.name || 'blade'}. Lumpy, but it's yours, and it'll sell. The second one's always better.`, good ? 'proud' : 'laugh');
        await line(NEXT.cook.text, NEXT.cook.mood);
      });
      this.placeStarForLesson();
      this.startHomeTutor('cookGo');
      return;
    }
    if (stage === 'cook' && (from === 'cooking' || from === 'stove')) {
      const cooked = this.arrivalLesson === 'cook_done' || (this.arrivalLesson !== 'cook' && ((st.data.stats?.dishes || 0) > (starData(st).dishesAtLesson ?? 0) || Object.keys(st.data.recipes || {}).length > 0));
      if (!cooked) { this.starLine('Nothing in the pan? Come on. Even I can boil an egg, and I\'m a hundred and four.', { mood: 'stern' }); this.startHomeTutor('cookGo'); return; }
      this.lessonAct('cook_done');
      this.setLesson('done');
      this.endHomeTutor();
      star.lessonSpot = null;
      await this.cutscene(async ({ line, go }) => {
        star.scripted = true;
        const p = this.cam || this.rig.player.pos;
        await go(star.walkTo(p.x + 0.6, p.z - 0.6));
        star.faceTo(p.x, p.z);
        star.scripted = false;
        await go(this.faceStar((s, f) => this.tween(s, f), 0.5));
        await line('Mm! That\'s proper food. Now you can dig, forge and cook. That\'s all I know, more or less.', 'happy');
        await line('The rest is a <span class="gold-txt">million gold</span> and a great deal of digging. Ore, gems, blades, dinners: sell the lot in Deep Town. Every coin brings us closer to the way up.', 'proud');
      }, { face: false });
      star.scripted = false;
      star.gesture('cheer', 1.6);
      this.game.audio.play('success');
      // the whole HUD: your gold, your lantern, everything (a flourish as each piece comes in)
      ob?.setLevel(TUT.FULL, { force: true });
      this.starLine('Off you go, then. I\'ll keep the fire in. Mind your lantern: when it runs low, <b>eat</b> something.', { mood: 'laugh' });
      // the last control: a snack (a tip that goes by itself if you don't need it yet)
      this.later(2.5, () => {
        const inp = this.game.input;
        const h = ob?.teach('snack', { optional: true, done: () => inp.pressed('KeyQ'), min: 0.4 });
        if (h) this.later(14, () => { if (!h.settled) h.close(); });
      });
      star.nextT = 8;
      st.save();
    }
  }

  /** The copper's handed over: the act, his coal, and the forge lesson is next (same outcome as ever). */
  copperHome() {
    const st = this.game.state;
    if (this.lessonStage() !== 'mine') return;
    this.lessonAct('copper_home');
    if (st.count('coal') < 2) { st.addItem('coal', { spill: true, n: 3 }); this.game.ui.toast('Old Star gives you <b>3 coal</b>', { icon: iconURL('coal'), kind: 'good' }); }
    this.setLesson('forge');
  }

  /** Before the forge lesson: make sure there's enough to learn with (two copper ore and coal). */
  prepForgeLesson() {
    const st = this.game.state;
    const gave = [];
    if (st.count('copper_ingot') < 1 && st.count('copper_ore') < 2) { st.addItem('copper_ore', { spill: true, q: 70, n: 2 - st.count('copper_ore') }); gave.push('copper ore'); }
    if (st.count('coal') < 2) { st.addItem('coal', { spill: true, n: 3 }); gave.push('coal'); }
    if (!st.owns('bp_dagger')) st.addItem('bp_dagger', { spill: true, n: 1 });
    if (gave.length) this.game.ui.toast(`Old Star tops you up: ${gave.join(' and ')}`, { icon: iconURL('coal'), kind: 'good' });
  }

  /** Before the cooking lesson: something to cook (an egg and mushrooms, if the pack's bare). */
  prepCookLesson() {
    const st = this.game.state, sd = starData(st);
    sd.dishesAtLesson = st.data.stats?.dishes || 0;
    const food = st.inventory((it) => it && (it.cat === 'food' || it.cat === 'plant' || it.cat === 'ingredient'));
    if (food.length < 2) {
      st.addItem('egg', { spill: true, n: 2 });
      st.addItem('mushroom', { spill: true, n: 2 });
      this.game.ui.toast('Old Star hands you <b>2 eggs</b> and <b>2 mushrooms</b>', { icon: iconURL('egg'), kind: 'good' });
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
    if (!this.tutorialOn()) { if (step === 'look' || step === 'walk' || step === 'talk') this.placeStarForLesson(); return; }
    const ui = this.game.ui, ob = ui.onboard, star = this.star;
    if (!this.tut) this.own(() => this.endHomeTutor());
    this.leaveStep();
    const pl = this.rig.player;
    const t = this.tut = { step, t: 0, look: 0, walked: 0, lookIdle: 0, yaw: pl.yaw, pitch: pl.pitch, px: pl.pos.x, pz: pl.pos.z, ok: { x: pl.pos.x, z: pl.pos.z }, cd: {}, h: null, mark: null };
    if (ob?.data) ob.data.home = step;
    t.best = Infinity; // the closest you've been to the step's goal (the funnel narrows as you go)
    this.gateItems();
    if (star?.rig) star.nextT = 999;
    switch (step) {
      case 'look': {
        ob?.setLevel(TUT.LOOK);
        this.later(0.5, () => { if (this.tut === t) this.starLine('Have a look round first. Get your bearings. The cave won\'t bite.', { mood: 'happy', dur: 5 }); });
        t.h = ob?.teach('look', { progress: () => t.look / 2.2, min: 1.2 });
        t.h?.promise.then((ok) => { if (ok && this.tut === t) this.later(0.3, () => this.tut === t && this.startHomeTutor('walk')); });
        break;
      }
      case 'walk': {
        ob?.setLevel(TUT.WALK);
        const spot = this.meetSpot();
        if (star?.rig) {
          star.scripted = true;
          star.walkTo(spot.x, spot.z, 1.0).then(() => { if (this.tut !== t) return; star.faceTo(pl.pos.x, pl.pos.z); star.gesture('beckon', 2.2); });
          this.starLine('Come on, then. Over here, by me. One paw after the other.', { mood: 'calm', dur: 5 });
        }
        t.target = () => (star?.rig ? star.head(_v).clone() : new THREE.Vector3(spot.x, 0.9, spot.z));
        t.goal = () => (star?.rig ? star.pos : spot);
        t.mark = ob?.mark(() => _v.copy(t.target()).add(new THREE.Vector3(0, 0.22, 0)), { label: 'Old Star' });
        t.h = ob?.teach('walk', { progress: () => t.walked / 2.4 });
        break;
      }
      case 'talk': {
        ob?.setLevel(TUT.USE);
        if (star?.rig) { star.scripted = false; star.faceTo(pl.pos.x, pl.pos.z); }
        t.target = () => star.head(_v).clone();
        t.goal = () => star.pos;
        t.mark = ob?.mark(() => _v.copy(t.target()).add(new THREE.Vector3(0, 0.22, 0)), { label: '' });
        t.h = ob?.teach('talk', { title: 'Talk to Old Star', done: () => !!t.talked, min: 0.5 });
        break;
      }
      case 'follow': {
        ob?.setLevel(TUT.QUEST);
        const L = this.liftSpot();
        if (star?.rig) {
          star.scripted = true;
          if (!star.goTo('lift')) star.walkTo(L.x, L.z, 1.05);
          star.speed = 1.05;
          star.lessonSpot = 'lift';
        }
        t.target = () => (star?.rig ? star.head(_v).clone() : new THREE.Vector3(L.x, L.y, L.z));
        t.goal = () => L;
        t.mark = ob?.mark(() => _v.copy(t.target()).add(new THREE.Vector3(0, 0.22, 0)), { label: 'Follow Old Star' });
        // a PC tip on the way: Shift runs
        if (!this.rig.isTouch()) this.later(2.5, () => { if (this.tut === t && !t.h) t.h = ob?.teach('run', { optional: true, progress: () => (t.ran || 0) / 0.9 }); });
        break;
      }
      case 'lift': {
        ob?.setLevel(TUT.QUEST);
        const liftPos = this.liftSpot();
        t.target = () => liftPos;
        t.goal = () => liftPos;
        t.mark = ob?.mark(() => liftPos, { label: 'The cage' });
        if (star?.rig && star.spot !== 'lift') { star.scripted = false; this.placeStarForLesson(); }
        t.h = ob?.teach('use', { title: 'Ride down', subPc: 'Look at the cage and press <kbd>E</kbd>', subT: 'Look at the cage, tap the hand button', done: () => !!this.riding });
        break;
      }
      case 'forgeGo': case 'cookGo': {
        const forge = step === 'forgeGo';
        const q = this.questSpot?.(forge ? 'forge' : 'hearth');
        const pos = q ? new THREE.Vector3(q.x, q.y, q.z) : this.rig.player.pos.clone();
        t.target = () => pos;
        t.goal = () => pos;
        t.mark = ob?.mark(() => pos, { label: forge ? 'The forge' : 'The fire pit' });
        t.near = 0;
        t.h = null;
        break;
      }
    }
  }

  /**
   * Where he waits for you to walk over: a couple of steps from where you stand, toward the fire
   * (the home's cooking spot), so the first walk is short and goes somewhere (meters).
   */
  meetSpot() {
    const p = this.rig.player.pos, f = this.questSpot?.('hearth') || this.questSpot?.('lift');
    const dx = f ? f.x - p.x : 1, dz = f ? f.z - p.z : -1, d = Math.hypot(dx, dz) || 1;
    const k = Math.min(2.4, Math.max(1.2, d - 1.1));
    return { x: p.x + (dx / d) * k, z: p.z + (dz / d) * k };
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
    t.h = null;
    t.mark = null;
  }

  /** The tutorial at home is over (the ride, a scene change, a skip): soft walls and gates go. */
  endHomeTutor() {
    if (!this.tut) return;
    this.leaveStep();
    this.tut = null;
    const star = this.star;
    if (star?.rig && star.scripted && !this.scripted && !this.cine) star.scripted = false;
  }

  /** The crosshair only finds what the lesson needs (the e2e's debug.interact still reaches anything). */
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
    const t = this.tut, re = t && ALLOW[t.step];
    if (re) return re.test(label);
    // any other time in the lessons: the lift and the front door wait (but the mining lesson rides it)
    if (LOCKED.test(label)) return this.lessonStage() === 'mine' && /lift|lever|dig/i.test(label);
    return true;
  }

  /** Per frame (from tickWakeFx): the step's checks, the soft walls, the camera nudge. */
  tickHomeTutor(dt) {
    // a game picked up mid-tutorial (a reload, waking from bed): the step comes back once you're free
    if (!this.tut && !this.tutResumed) { this.tutResumeT = (this.tutResumeT ?? 0.3) - dt; if (this.tutResumeT <= 0) { this.tutResumeT = 0.5; this.resumeHomeTutor(); } }
    const t = this.tut;
    if (!t || !this.rig) return;
    t.t += dt;
    const pl = this.rig.player, star = this.star, inp = this.game.input;
    if (this.scripted || this.cine || this.riding) { t.yaw = pl.yaw; t.pitch = pl.pitch; t.px = pl.pos.x; t.pz = pl.pos.z; return; }
    // what the player did this frame
    const dyaw = Math.abs(wrap(pl.yaw - t.yaw)), dp = Math.abs(pl.pitch - t.pitch);
    t.yaw = pl.yaw; t.pitch = pl.pitch;
    const looked = dyaw + dp > 0.0015;
    t.look += Math.min(0.5, dyaw + dp * 0.8);
    t.lookIdle = looked ? 0 : t.lookIdle + dt;
    const moved = Math.hypot(pl.pos.x - t.px, pl.pos.z - t.pz);
    if (moved < 0.5) t.walked += moved;
    t.px = pl.pos.x; t.pz = pl.pos.z;
    if (pl.speed > 2.6 && inp.isDown('ShiftLeft', 'ShiftRight')) t.ran = (t.ran || 0) + dt;
    // the soft funnel: no more than a few steps further from the goal than your closest approach
    // (the look step: from where you stood); past it you're put back, and he calls you back
    const goal = t.step === 'look' ? t.ok0 || (t.ok0 = { x: pl.pos.x, z: pl.pos.z }) : t.goal?.();
    const slack = SLACK[t.step];
    let out = false;
    if (goal && slack) {
      const d = Math.hypot(pl.pos.x - goal.x, pl.pos.z - goal.z);
      // (following him: running on ahead toward the cage is fine)
      if (t.step === 'follow' && star?.rig) { const L = this.liftSpot(); if (Math.hypot(pl.pos.x - L.x, pl.pos.z - L.z) < Math.hypot(star.pos.x - L.x, star.pos.z - L.z)) t.best = Math.min(t.best, d); }
      t.best = Math.min(t.best, Math.max(d, t.step === 'look' ? 0 : 0.8));
      out = d > t.best + slack;
    }
    if (!out) { t.ok.x = pl.pos.x; t.ok.z = pl.pos.z; }
    else {
      pl.pos.x = t.ok.x; pl.pos.z = t.ok.z;
      pl.vel.x = 0; pl.vel.z = 0;
      this.rig.syncCamera(0);
      t.lookIdle = 99; // and the view swings back to where the lesson is
      if (this.tutCd('wall', 5)) {
        this.game.audio.play('ui_error', { vol: 0.25 });
        this.starLine(pick(t.step === 'forgeGo' ? ['The forge, dear! It\'s this way.', 'Not that way. The forge is over here.'] : t.step === 'cookGo' ? ['The fire pit! The kettle\'s waiting.', 'This way, dear. The pot\'s calling.'] : t.step === 'look' ? ['Easy! Find your feet first.', 'Steady. Just look about for now.'] : ['Not that way! Stay with me.', 'This way, dear! The cage is over here.', 'Hoi! Stay with me.']), { mood: 'stern', key: 'tut-wall', dur: 3 });
      }
    }
    // the camera eases round to what matters when you've stopped looking for it
    if (t.target && t.lookIdle > 2.6 && t.step !== 'look') {
      const p = t.target(), e = this.rig.eye(_v);
      const want = Math.atan2(-(p.x - e.x), -(p.z - e.z));
      const d = wrap(want - pl.yaw);
      if (Math.abs(d) > 0.45) {
        pl.yaw += Math.sign(d) * Math.min(Math.abs(d) - 0.3, dt * 1.1);
        pl.pitch += (clamp(Math.atan2(p.y - e.y, Math.hypot(p.x - e.x, p.z - e.z)), -0.5, 0.5) - pl.pitch) * Math.min(1, dt * 1.5);
        this.rig.syncCamera(0);
        t.yaw = pl.yaw; t.pitch = pl.pitch;
      }
    }
    const dist = star?.rig ? Math.hypot(star.pos.x - pl.pos.x, star.pos.z - pl.pos.z) : 0;
    switch (t.step) {
      case 'walk':
        if (t.walked > 0.3 && dist < 1.6 && t.t > 1.2) { t.h?.complete?.(); this.later(0.6, () => this.tut === t && this.startHomeTutor('talk')); t.step = 'walk-done'; }
        break;
      case 'talk':
        // touch players needn't aim: the hand button near him is enough
        if (!t.talked && dist < 1.7 && inp.pressed('KeyE') && !this.rig.target) { inp.consume('KeyE'); this.tutTalkBeat(); }
        break;
      case 'follow': {
        if (star?.rig) {
          // he waits for you when you fall behind (not when you've run on ahead), and beckons
          const L = this.liftSpot();
          const ahead = Math.hypot(pl.pos.x - L.x, pl.pos.z - L.z) < Math.hypot(star.pos.x - L.x, star.pos.z - L.z);
          if (t.paused && ahead) { t.paused = false; star.mode = 'walk'; }
          if (star.path && !t.paused && !ahead && dist > 4.2) { t.paused = true; star.mode = 'idle'; star.faceTo(pl.pos.x, pl.pos.z); star.rig.play?.('idle'); star.gesture('beckon', 1.6); if (this.tutCd('keepup', 9)) this.starLine(pick(['Keep up! My knees are older than your whole family.', 'This way, dear!']), { mood: 'stern', dur: 3 }); }
          else if (t.paused && dist < 2.6) { t.paused = false; star.mode = 'walk'; }
          if (!star.path && !t.arrived) { t.arrived = true; star.faceTo(pl.pos.x, pl.pos.z); star.gesture('beckon', 2); }
        }
        if (t.h && t.h.id === 'run' && t.h.done) t.h = null;
        const LS = this.liftSpot();
        const nearLift = Math.hypot(pl.pos.x - LS.x, pl.pos.z - LS.z) < 2.6;
        if (nearLift && (t.arrived || dist < 2.4)) {
          if (t.h && !t.h.done) t.h.close();
          t.h = null;
          if (star?.rig) { star.scripted = false; if (!t.arrived) star.mode = 'walk'; }
          this.starLine('Here we are. In you get: it goes straight down to my dig. Mind the gap.', { mood: 'happy', dur: 5 });
          this.startHomeTutor('lift');
        }
        break;
      }
      case 'forgeGo': case 'cookGo': {
        const p = t.target();
        const near = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) < 2.4;
        if (near && !t.h) {
          const forge = t.step === 'forgeGo';
          t.h = this.game.ui.onboard?.teach('use', { title: forge ? 'Forge with Old Star' : 'Cook with Old Star', subPc: `Look at the ${forge ? 'forge' : 'fire'} and press <kbd>E</kbd>`, subT: `Look at the ${forge ? 'forge' : 'fire'}, tap the hand button` });
        }
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

  /** The tutorial's "talk to him" step: his first task, as a cutscene, then the quest strip comes in. */
  async tutTalkBeat() {
    const t = this.tut;
    if (!t || t.busy || t.talked) return;
    t.talked = true;
    t.busy = true;
    const star = this.star, ob = this.game.ui.onboard;
    this.act('talk', { npc: 'oldstar' });
    await this.sleepFor(0.5);
    if (this.tut !== t) return;
    t.mark?.remove?.();
    t.mark = null;
    if (this.lessonStage() === 'pick') {
      await this.cutscene(async ({ line }) => {
        star?.gesture?.('point', 2);
        await line('A miner, you say? Then where\'s your <b>pick</b>? Lost in the fall, I\'d guess. No pick, no digging.', 'stern');
        await line('And you\'re not having mine: it knows my paws. So your first lesson is the <b>forge</b>. We\'ll make you your own. Come on!', 'happy');
      });
      if (this.tut !== t) return;
      t.busy = false;
      ob?.setLevel(TUT.QUEST); // your first task: the quest strip comes in
      this.placeStarForLesson();
      this.startHomeTutor('forgeGo');
      return;
    }
    await this.cutscene(async ({ line }) => {
      star?.gesture?.('point', 2);
      await line('First lesson: <b>mining</b>. See that rusty old cage in the rock shaft? It goes straight down to my practice dig.', 'calm');
      await line('Bring me back some <b>copper ore</b>: the orange specks in the rock. I\'ll show you the way. Follow me!', 'happy');
    });
    if (this.tut !== t) return;
    t.busy = false;
    // your first task: the scroll unrolls (the quest strip comes in)
    this.startHomeTutor('follow');
  }

  /** Coming back to a game mid-tutorial (a reload, a sleep): pick the step up again. */
  resumeHomeTutor() {
    if (!this.tutorialOn()) { this.tutResumed = true; return; }
    if (this.tut || this.waking || this.scripted || this.riding || this.cine) return;
    this.tutResumed = true;
    const from = this.from, stage = this.lessonStage();
    if (from === 'fall' || from === 'newgame' || from === 'lift' || from === 'forge' || from === 'cooking' || from === 'stove') return; // the arrival has its own
    const ob = this.game.ui.onboard;
    if (stage === 'pick') {
      const h = ob?.data?.home;
      if (h === 'look' || h === 'walk') this.startHomeTutor('look');
      else if (h === 'talk') this.startHomeTutor('walk');
      else { this.placeStarForLesson(); this.startHomeTutor('forgeGo'); }
    } else if (stage === 'mine' && !this.game.state.flag('prologue')) {
      const h = ob?.data?.home;
      if (h === 'look' || h === 'walk') this.startHomeTutor('look');
      else if (h === 'talk') this.startHomeTutor('walk');
      else this.startHomeTutor('lift');
    } else if (stage === 'forge') this.startHomeTutor('forgeGo');
    else if (stage === 'cook') this.startHomeTutor('cookGo');
  }
}
