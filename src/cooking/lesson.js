// Old Star's cooking lesson: cooking { from: 'home', tutorial: true }. He talks you through one
// simple dish (LESSON in data/recipes.js: Glowcap Soup) at his hearth, one step at a time, through
// the tutor card (game.ui.tutor, owned by the home part; the lesson runs silently without it), and
// reacts to how each step went. When the dish is done: act { type: 'lesson', step: 'cook_done' }.
// The cinematic tutorial (src/ui/Onboard.js): it opens as a cutscene (letterbox, his first line
// through the cutscene talk when there is one, a hold skips it; cooking starting ends it), and each
// step's control gets a prompt card drawn for the device (click / tap, hold, drag, circles).
import { LESSON, DISHES } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';
import { pick } from '../core/util.js';
import { pantryCount, pantryGive } from './quality.js';

const touch = () => document.documentElement.classList.contains('is-touch');

/** His tip for each kind of step (with the controls, since the lesson hides the usual hint). */
function tipFor(kind) {
  const t = touch();
  return {
    chop: t ? 'Knife first. Slide it over a <b>dotted line</b> and <b>tap</b>. Even pieces cook even.' : 'Knife first. Move it over a <b>dotted line</b> and <b>click</b>. Even pieces cook even.',
    simmer: t ? 'Now the pot. <b>Hold</b> your paw down to turn the flame up, let go to ease off. The pot is slow to follow, so lead it. Keep it in the <b>green</b>: a simmer, not a boil!' : 'Now the pot. <b>Hold</b> the mouse (or <kbd>Space</kbd>) to turn the flame up, let go to ease off. The pot is slow to follow, so lead it. Keep it in the <b>green</b>: a simmer, not a boil!',
    season: t ? 'A pinch of salt. <b>Tap</b> to shake it in, then <b>Done</b> when the gauge is in the band. Bland is sad; too salty is worse.' : 'A pinch of salt. Shake it in (mouse <b>up and down</b>, or click), then <kbd>Space</kbd> when it\'s in the band. Bland is sad; too salty is worse.',
    stir: 'Stir in <b>circles</b>, round and round. Not too fast or it slops over.',
    crack: 'Crack it on the rim when the swing is in the <b>gold</b>. Gently does it.',
    fry: 'Flip it when it\'s <b>golden</b>, both sides.',
    flip: 'Toss it when it\'s golden, then get the pan <b>under</b> it!',
    pour: 'Hold to pour, let go just <b>before</b> the line: the jug keeps dribbling.',
    knead: 'Left paw, right paw, <b>on the beat</b>.',
    roll: 'Roll it out even: lean on the <b>thick</b> side.',
    grate: 'Long strokes down the teeth. Stop before you grate your <b>knuckles</b>.',
    bake: 'Keep the fire fed and pull it out at <b>golden</b>. Your nose will tell you.',
    mash: 'Aim at a lump and press. <b>Steady</b>, not frantic.',
    plate: 'Drop it in the <b>middle</b> of the plate. Presentation, apprentice!',
  }[kind] || 'Easy does it.';
}

/** The control each kind of step wants, its card's title, and the words for a PC and a touch screen. */
const STEP_CONTROL = {
  chop: ['click', 'Chop', 'Move the knife over a <b>dotted line</b>, <b>click</b>', 'Slide the knife to a <b>dotted line</b>, <b>tap</b>'],
  simmer: ['hold', 'Simmer', '<b>Hold</b> the button (or <kbd>Space</kbd>) for flame', '<b>Hold</b> for flame, let go to ease off'],
  season: ['click', 'Season', 'Shake it in, <kbd>Space</kbd> when it\'s in the band', '<b>Tap</b> to shake, then <b>Done</b>'],
  stir: ['circle', 'Stir', 'Move the mouse in <b>circles</b>', 'Draw <b>circles</b> with your finger'],
  crack: ['click', 'Crack the egg', '<b>Click</b> when the swing is in the gold', '<b>Tap</b> when the swing is in the gold'],
  fry: ['click', 'Fry', '<b>Click</b> to flip it when it\'s golden', '<b>Tap</b> to flip it when it\'s golden'],
  flip: ['click', 'Toss', '<b>Click</b> to toss, then catch it', '<b>Tap</b> to toss, then catch it'],
  pour: ['hold', 'Pour', '<b>Hold</b> to pour, let go before the line', '<b>Hold</b> to pour, let go before the line'],
  knead: ['click', 'Knead', '<kbd>A</kbd> <kbd>D</kbd> on the beat', 'Left, right, <b>on the beat</b>'],
  roll: ['drag', 'Roll it out', '<b>Drag</b> the pin, lean on the thick side', '<b>Drag</b> the pin, lean on the thick side'],
  grate: ['drag', 'Grate', 'Long <b>strokes</b> down the teeth', 'Long <b>strokes</b> down the teeth'],
  bake: ['hold', 'Bake', 'Feed the fire, pull it out at golden', 'Feed the fire, pull it out at golden'],
  mash: ['click', 'Mash', 'Aim at a lump and <b>press</b>', 'Aim at a lump and <b>tap</b>'],
  plate: ['click', 'Plate up', '<b>Click</b> to drop it in the middle', '<b>Tap</b> to drop it in the middle'],
};

const REACT = [
  [90, 'proud', ['Ha! Clean as a fresh-cut gem.', 'Now that\'s a cook\'s paw!', 'Perfect! You\'ve done this before, haven\'t you?']],
  [75, 'happy', ['Good, good.', 'Nicely done.', 'That\'ll do nicely.']],
  [50, 'calm', ['Not bad. You\'ll get the feel of it.', 'Hm, alright. Keep going.', 'Bit rough, but it\'ll eat.']],
  [0, 'worried', ['Easy, easy... we\'ll fix it in the pot.', 'Oof. Well, soup forgives a lot.', 'Hmph. Slower next time.']],
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
    const t = this.game.ui.tutor;
    const card = () => { if (!t?.say) return Promise.resolve(); try { return Promise.resolve(t.say(html, { key: 'cook-lesson', ...o })); } catch (e) { return Promise.resolve(); } };
    // a line he waits on is a little cutscene (game.convo) when there is one
    if (o.wait && this.game.ui.onboard) return this.game.ui.onboard.talk(html, { mood: o.mood, wait: true, scene: this.sc }, card);
    return card();
  }

  /** A prompt card for a control (the one before goes): top left, clear of the pantry and the pot. */
  teach(id, o = {}) {
    this.obH?.close?.();
    if (this.game.scene !== this.sc) { this.obH = null; return null; }
    this.obH = this.game.ui.onboard?.teach(id, { place: 'left', ...o }) || null;
    return this.obH;
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
    let gave = false;
    for (const [id, n] of Object.entries(LESSON.ing)) {
      for (let k = pantryCount(st, id); k < n; k++) { pantryGive(st, id, ITEMS[id]?.q ? { q: 82 } : {}); gave = true; }
    }
    const names = this.ids.map((id) => `<b>${ITEMS[id]?.name || id}</b>`).join(' and ');
    // a cutscene: the bars and his welcome (a hold skips it; so does starting to cook)
    this.cine = true;
    this.game.ui.onboard?.cinema(true, { skip: () => this.endCine() });
    await this.say(`Right, apprentice. A miner who can't cook is a miner who faints halfway down a shaft. We'll make my <b>${DISHES[this.dish].name}</b>${gave ? `. Here, take a ${names} off my shelf` : ''}.`, { mood: 'happy', wait: true });
    this.endCine();
    if (this.game.scene === this.sc && this.sc.phase === 'pantry' && !this.done) this.pantryTip();
  }

  pantryTip() {
    this.stage = 'pantry';
    const names = this.ids.map((id) => `<b>${ITEMS[id]?.name || id}</b>`).join(' and the ');
    this.say(`Pick the ${names} from the pantry, then <b>Cook!</b>`, { mood: 'calm', dur: Infinity });
    this.teach('click', { title: 'Into the pot', subPc: `<b>Click</b> the ${names}, then <b>Cook!</b>`, subT: `<b>Tap</b> the ${names}, then <b>Cook!</b>`, done: () => this.stage !== 'pantry' });
  }

  /** Only the lesson's dish while he's teaching. */
  allow(ids) {
    if (this.done) return true;
    const ok = ids.length === this.ids.length && this.ids.every((id) => ids.includes(id));
    if (!ok) {
      this.say(`Not that! Just the ${this.ids.map((id) => `<b>${ITEMS[id]?.name || id}</b>`).join(' and the ')}. Experiment later.`, { mood: 'stern', dur: 4 });
      this.game.audio.play('ui_error');
    }
    return ok;
  }

  onStart() {
    this.endCine();
    if (this.done) return;
    this.stage = 'cooking';
    this.say('Good. Every dish is a few jobs, one after another. Watch the paws.', { mood: 'happy', dur: 2.6 });
  }

  onStep(kind) {
    if (this.done) return;
    this.stage = 'step:' + kind;
    // a beat after the big title, the tip stays up while the step runs
    setTimeout(() => { if (this.sc.step && this.sc.steps?.[this.sc.stepI] === kind && !this.done) this.say(tipFor(kind), { mood: 'calm', dur: Infinity }); }, 650);
    const c = STEP_CONTROL[kind];
    if (c) {
      const i = this.sc.stepI;
      this.teach(c[0], { title: c[1], subPc: c[2], subT: c[3], done: () => this.done || this.sc.stepI !== i || !this.sc.step });
    }
  }

  onStepDone(kind, score) {
    if (this.done) return;
    if (this.obH && !this.obH.done) this.obH.complete();
    const [, mood, lines] = REACT.find(([min]) => score >= min);
    this.say(pick(lines), { mood, dur: 2.4 });
  }

  async onResult(res) {
    if (this.done) return;
    this.done = true;
    this.obH?.close?.();
    this.stage = 'result';
    // the lesson's done the moment the dish is (quests listen for this)
    this.game.state.emit('act', { type: 'lesson', step: 'cook_done' });
    const g = res.grade;
    const first = g === 'Perfect' ? ['Look at that! Better than mine, and I\'ve been at it sixty years.', 'proud']
      : g === 'Great' ? ['That smells like home. Well done.', 'happy']
        : g === 'Good' ? ['Good honest soup. You\'ll do.', 'happy']
          : g === 'Okay' ? ['It\'s... soup. Of a sort. We all start somewhere.', 'laugh']
            : ['Burnt. Ha! My first one was worse. Much worse.', 'laugh'];
    await this.say(first[0], { mood: first[1], wait: true });
    await this.say('Eat it now or take it down the mine. When you eat, look up: that little card is a <b>buff</b>. Glowing Whiskers, your lamp shines wider. Better cooking, longer buffs.', { mood: 'calm', wait: true });
    await this.say('That\'s my lesson. Cook what you find down there: mushrooms, roots, berries, the odd grub. Every new recipe goes in your <b>Index</b>. Now off you go!', { mood: 'proud', wait: true });
    this.stage = 'free';
  }

  leave() { this.endCine(); this.obH?.close?.(); this.game.ui.tutor?.hide?.('cook-lesson'); }
}
