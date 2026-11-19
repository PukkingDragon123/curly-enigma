// Old Star's cooking lesson: cooking { from: 'home', tutorial: true }. He talks you through one
// simple dish (LESSON in data/recipes.js: Glowcap Soup) at his hearth, one step at a time, through
// the tutor card (game.ui.tutor, owned by the home part; the lesson runs silently without it), and
// reacts to how each step went. When the dish is done: act { type: 'lesson', step: 'cook_done' }.
// Wave 18: no cards and no portrait. Old Star stands at the counter beside you (his real 3D model,
// kept at the right of whatever station the view is on) and shows each step before you do it
// (src/home/starDemo.js: chop, crack, stir, simmer, season...), then you copy him; at most a 2–4 word
// cue floats up over the work (teachWord). His lines float by his head (game.convo with his rig).
// The opening is still a short cutscene (letterbox; hold Esc or a click to skip; cooking starting ends it).
import { LESSON, DISHES } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';
import * as THREE from 'three';
import { pick } from '../core/util.js';
import { pantryCount, pantryGive } from './quality.js';
import { StarDemo } from '../home/starDemo.js';
import { teachWord } from '../home/tutorFx.js';

const starMods = import.meta.glob('../gfx/char/starmole.js');
const _p = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();
/** Which of his mimes shows a step (src/home/starDemo.js), and the few words that float up for it. */
const SHOW = {
  chop: ['chop', 'Click the lines'], crack: ['crack', 'Click in the gold'], simmer: ['simmer', 'Hold for flame'],
  stir: ['stir', 'Circle the mouse'], season: ['season', 'Space in the band'], fry: ['crack', 'Flip it golden'],
  flip: ['crack', 'Toss, then catch'], pour: ['quench', 'Let go early'], knead: ['chop', 'A, D on beat'],
  roll: ['grind', 'Drag the pin'], grate: ['grind', 'Long strokes down'], bake: ['pump', 'Out at golden'],
  mash: ['hammer', 'Press the lumps'], plate: ['quench', 'Drop it centred'],
};


/** His tip for each kind of step (with the controls, since the lesson hides the usual hint). */
function tipFor(kind) {
  return {
    chop: 'Knife first. Even pieces cook even.',
    simmer: 'A simmer. Not a boil.',
    season: 'Pinch of salt. Too much is worse than none.',
    stir: 'Round and round. Not too fast or it slops over.',
    crack: 'Gently does it.',
    fry: 'Flip it when it\'s <b>golden</b>, both sides.',
    flip: 'Toss it when it\'s golden, then get the pan <b>under</b> it!',
    pour: 'Let go just <b>before</b> the line: the jug keeps dribbling.',
    knead: 'Left paw, right paw, <b>on the beat</b>.',
    roll: 'Lean on the <b>thick</b> side.',
    grate: 'Stop before you grate your <b>knuckles</b>.',
    bake: 'Pull it out at <b>golden</b>. Your nose will tell you.',
    mash: '<b>Steady</b>, not frantic.',
    plate: 'Make it look nice. Someone has to eat it.',
  }[kind] || 'Easy does it.';
}

const REACT = [
  [90, 'proud', ['Clean as a cut gem.', 'That\'s a cook\'s paw.', 'You\'ve done this before.']],
  [75, 'happy', ['Good, good.', 'Nicely done.', 'That\'ll do nicely.']],
  [50, 'calm', ['Not bad. You\'ll get the feel of it.', 'Hm, alright. Keep going.', 'Bit rough, but it\'ll eat.']],
  [0, 'worried', ['Easy. We\'ll fix it in the pot.', 'Oof. Well, soup forgives a lot.', 'Hmph. Slower next time.']],
];

export class CookLesson {
  constructor(scene) {
    this.sc = scene;
    this.game = scene.game;
    this.stage = 'intro';
    this.done = false;
    this.dish = LESSON.dish;
    this.ids = Object.keys(LESSON.ing);
  }

  say(html, o = {}) {
    if (this.game.scene !== this.sc) return Promise.resolve(); // (the kitchen has gone: nothing more to say)
    // (wave 18: by his head at the counter, no card, no portrait)
    const rig = this.star?.rig, cv = this.game.convo;
    if (rig && cv?.say) {
      try { return Promise.resolve(cv.say(html, { who: 'oldstar', rig, head: (out) => rig.headWorld(out), mood: o.mood, key: o.key, wait: !!o.wait, dur: o.dur === Infinity || o.dur == null ? 4 : o.dur })); } catch (e) { /* the old line */ }
    }
    const t = this.game.ui.tutor;
    const card = () => { if (!t?.say) return Promise.resolve(); try { return Promise.resolve(t.say(html, { key: 'cook-lesson', ...o })); } catch (e) { return Promise.resolve(); } };
    // a line he waits on is a little cutscene (game.convo) when there is one
    if (o.wait && this.game.ui.onboard) return this.game.ui.onboard.talk(html, { mood: o.mood, wait: true, scene: this.sc }, card);
    return card();
  }

  /** He shows a step (a mime of it at the counter) and a few words float up over the work. */
  show(kind) {
    if (this.game.scene !== this.sc) return;
    const sh = SHOW[kind];
    if (!sh) return;
    this.demo?.play(sh[0], 2.8);
    setTimeout(() => this.cue(sh[1]), 450);
  }

  /** A few words floating up over the work, once. */
  cue(word) {
    if (this.game.scene !== this.sc || this.done) return;
    const L = this.sc.camLook;
    if (!L) return;
    _p.copy(L);
    _p.y += 0.22;
    teachWord(this.game, word, _p.clone(), { life: 2.6, size: 0.5 });
  }

  /** Old Star himself, at the counter beside you (his own model, as in the forge lesson). */
  async loadStar() {
    const load = starMods['../gfx/char/starmole.js'];
    if (!load || this.star) return;
    try {
      const m = await load();
      if (this.game.scene !== this.sc) return;
      const rig = m.makeStarMole({ height: 0.76 });
      rig.root.scale.multiplyScalar(0.6 / (rig.height || 1));
      this.sc.scene.add(rig.root);
      this.star = { rig, pos: new THREE.Vector3(), ready: false };
      this.demo = new StarDemo(rig, { audio: this.game.audio });
      rig.play?.('idle');
      // (per frame with the kitchen: the scene's own update, then his)
      const up = this.sc.update.bind(this.sc);
      this.sc.update = (dt) => { up(dt); this.tick(dt); };
      this.sc.own?.(() => { rig.root.parent?.remove(rig.root); rig.dispose?.(); });
    } catch (e) { console.warn('[cook] Old Star failed to load', e); }
  }

  /** Per frame: he keeps to the right of the station in view, at the counter, facing the work. */
  tick(dt) {
    const S = this.star;
    if (!S?.rig) return;
    const cam = this.sc.camera;
    cam.getWorldDirection(_f);
    _f.y = 0;
    _f.normalize();
    _r.set(-_f.z, 0, _f.x);
    _p.copy(cam.position).addScaledVector(_f, 1.15).addScaledVector(_r, 0.72);
    _p.y = -0.12; // (his feet in the counter: he reads as standing behind it)
    if (!S.ready) { S.pos.copy(_p); S.ready = true; } else S.pos.lerp(_p, 1 - Math.exp(-dt * 3));
    const r = S.rig;
    r.root.position.copy(S.pos);
    const L = this.sc.camLook || cam.position;
    r.face(Math.atan2((L.x * 0.2 + cam.position.x * 0.8) - S.pos.x, (L.z * 0.2 + cam.position.z * 0.8) - S.pos.z)); // (to you, a little toward the work)
    r.update(dt);
    this.demo?.apply(dt);
  }

  /** The opening cutscene is over the moment cooking starts (nothing waits behind it). */
  endCine() {
    if (!this.cine) return;
    this.cine = false;
    this.game.convo?.end?.();
    this.game.ui.tutor?.hide?.('cook-lesson');
    this.game.ui.onboard?.cinema(false);
  }

  /** At the hearth: hand over what's missing, explain, then point at the pantry. */
  async start() {
    const st = this.game.state;
    await this.loadStar();
    let gave = false;
    for (const [id, n] of Object.entries(LESSON.ing)) {
      for (let k = pantryCount(st, id); k < n; k++) { pantryGive(st, id, ITEMS[id]?.q ? { q: 82 } : {}); gave = true; }
    }
    const names = this.ids.map((id) => `<b>${ITEMS[id]?.name || id}</b>`).join(' and ');
    // a cutscene: the bars and his welcome (a hold skips it; so does starting to cook); what he
    // hands you off his shelf flies into your paws
    this.cine = true;
    const ob = this.game.ui.onboard;
    ob?.cinema(true, { skip: () => this.endCine() });
    await this.say(`My <b>${DISHES[this.dish].name}</b>: easy, and it keeps a miner going.${gave ? ` Take a ${names} off my shelf.` : ''}`, { mood: 'happy', wait: true });
    this.endCine();
    if (this.game.scene === this.sc && this.sc.phase === 'pantry' && !this.done) this.pantryTip();
  }

  pantryTip() {
    this.stage = 'pantry';
    const names = this.ids.map((id) => `<b>${ITEMS[id]?.name || id}</b>`).join(' and the ');
    this.say(`The ${names}. Then cook.`, { mood: 'calm', dur: 5 });
    this.star?.rig?.play?.('point');
    setTimeout(() => { if (this.star?.rig && this.stage === 'pantry') this.star.rig.play?.('idle'); }, 1800);
  }

  /** Only the lesson's dish while he's teaching. */
  allow(ids) {
    if (this.done) return true;
    const ok = ids.length === this.ids.length && this.ids.every((id) => ids.includes(id));
    if (!ok) {
      this.say(`Not that! The ${this.ids.map((id) => `<b>${ITEMS[id]?.name || id}</b>`).join(' and ')}.`, { mood: 'stern', dur: 4 });
      this.game.audio.play('ui_error');
    }
    return ok;
  }

  onStart() {
    this.endCine();
    if (this.done) return;
    this.stage = 'cooking';
    this.say('Good. Next.', { mood: 'happy', dur: 2.4 });
  }

  onStep(kind) {
    if (this.done) return;
    this.stage = 'step:' + kind;
    // he shows it first (a mime at the counter, a few words over the work), then one short tip
    this.show(kind);
    setTimeout(() => { if (this.sc.step && this.sc.steps?.[this.sc.stepI] === kind && !this.done) this.say(tipFor(kind), { mood: 'calm', dur: 3.6, key: 'cook-tip' }); }, 3000);
  }

  onStepDone(kind, score) {
    if (this.done) return;
    this.demo?.stop();
    const [, mood, lines] = REACT.find(([min]) => score >= min);
    this.say(pick(lines), { mood, dur: 2.4 });
  }

  async onResult(res) {
    if (this.done) return;
    this.done = true;
    this.demo?.stop();
    this.stage = 'result';
    // the lesson's done the moment the dish is (quests listen for this)
    this.game.state.emit('act', { type: 'lesson', step: 'cook_done' });
    const g = res.grade;
    const first = g === 'Perfect' ? ['Better than mine. Don\'t let it go to your head.', 'proud']
      : g === 'Great' ? ['Smells like home.', 'happy']
        : g === 'Good' ? ['Good honest soup. You\'ll do.', 'happy']
          : g === 'Okay' ? ['It\'s soup. Of a sort.', 'laugh']
            : ['Burnt. My first was worse.', 'laugh'];
    await this.say(first[0], { mood: first[1], wait: true });
    await this.say('Eat it down the mine for a <b>buff</b>.', { mood: 'proud', wait: true });
    this.stage = 'free';
  }

  leave() { this.endCine(); this.demo?.stop(); this.game.ui.tutor?.hide?.('cook-lesson'); }
}
