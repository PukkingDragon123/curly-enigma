// Old Star's lessons at home (mixed into HomeScene). The chain (quest `lessons`, src/data/quests.js)
// moves on `act` events; this keeps its own stage in state.data.oldstar.lesson so the home knows
// what Old Star wants next:
//   wake   → the waking-up scene (wake.js): he throws the quench water, tells you his plan
//   mine   → "ride the lift down to my practice dig, bring me copper" (the lift goes straight to
//            the dig: deep { from: 'lift', lift: 'L0', lesson: 'mine' }; the mine part teaches)
//   forge  → back with copper: he sniffs it, gives you coal, and you smelt and forge with him
//            (forge { from: 'home', tutorial: true }; the forge's guided mode, src/forge/tutorial.js)
//   cook   → back with your first blade: to his hearth (cooking { from: 'home', tutorial: true })
//   done   → back with a meal in you: he sends you off to earn the million. Free play.
// Talking to him during the lessons offers "What now?" and "Skip the lessons" (lesson { step: 'skip' }).
// Acts emitted here: lesson { step: wake | lift | copper_home | cook_done | skip }, talk { npc: 'oldstar' },
// reach { place: 'home' }.
import { el, pick } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { starData } from './starData.js';
import { starPortraitURL } from '../ui/Tutor.js';

/** What he says the next step is, per stage. */
const NEXT = {
  mine: { text: 'First lesson: mining. The cage lift is over there by the cart. It goes straight down to my practice dig. Bring me back some <b>copper ore</b>: the orange specks in the rock.', mood: 'calm', where: 'lift' },
  forge: { text: 'Copper\'s no good as rock. Come to my <b>forge</b>: we\'ll melt it into an ingot and hammer you out a blade. E on the anvil.', mood: 'happy', where: 'anvil' },
  cook: { text: 'A smith who doesn\'t eat is a skeleton with a hammer. To the <b>hearth</b> with you: let\'s cook something. E on the fire.', mood: 'happy', where: 'fire' },
};

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
    const star = this.star, g = this.game;
    const n = NEXT[stage];
    const close = () => h?.close();
    const opt = (label, sub, fn, alt = true) => el('button', { class: 'btn ' + (alt ? 'alt' : '') + ' ls-opt', onclick: () => { g.audio.play('ui_click'); close(); fn(); } }, [el('b', {}, label), sub ? el('small', {}, sub) : null]);
    const body = el('div', { class: 'ls-talk' }, [
      el('div', { class: 'ls-head' }, [el('img', { class: 'pix ls-face', src: starPortraitURL(n?.mood || 'calm'), alt: '' }), el('p', { html: 'Old Star squints at you over his spectacles. <i>"Well?"</i>' })]),
      opt('What do I do next?', null, () => star.say(n.text, { mood: n.mood }), false),
      opt('Skip the lessons', 'I know my way round a mine, a forge and a pan.', () => this.confirmSkip()),
      opt('Never mind', null, () => star.say(pick(['Hmph. Mind the fire, then.', 'Go on, go on.', 'Sixty years I\'ve waited. I can wait a bit longer.']), { mood: 'calm' })),
    ]);
    const h = g.ui.openPanel({ title: 'Old Star', body, className: 'ls-panel', width: 'min(calc(var(--px) * 150), calc(100vw - 32px))' });
    this.injectLessonCss();
    return true;
  }

  async confirmSkip() {
    const ok = await this.game.ui.confirm('Skip Old Star\'s lessons? You\'ll get what he would have given you, and go your own way.', 'Skip them', 'Keep learning');
    if (!ok) { this.star?.say('Good. Patience is half of smithing. The other half is hitting things.', { mood: 'happy' }); return; }
    this.skipLessons();
  }

  /** The lessons are over: hand over what they would have given, and say so. */
  skipLessons() {
    const st = this.game.state, sd = starData(st);
    const stage = sd.lesson;
    sd.skipped = true;
    const gifts = [];
    if (stage === 'mine' || stage === 'wake') { st.addItem('copper_ingot', { q: 70, n: 1 }); gifts.push('copper_ingot'); }
    if (st.count('coal') < 3) { st.addItem('coal', { n: 3 }); gifts.push('coal'); }
    if (stage !== 'done') { st.addItem('mushroom', { n: 2 }); }
    this.setLesson('done');
    this.lessonAct('skip');
    this.game.audio.play('page');
    this.game.ui.toast(`Old Star shrugs and hands you ${gifts.map((id) => ITEMS[id]?.name || id).join(' and ') || 'a pat on the back'}.`, { icon: gifts[0] ? iconURL(gifts[0]) : undefined, kind: 'good', dur: 3600 });
    const star = this.star;
    if (star) {
      star.lessonSpot = null;
      star.nextT = 6;
      star.say('A know-it-all, eh? Fine by me. Off you go and earn that million: the lift goes down, the coins come up. And come home to sleep.', { mood: 'laugh' });
    }
    st.save();
  }

  /** Riding the lift down during the mining lesson. */
  onLessonRide() {
    this.lessonAct('lift');
    this.game.ui.tutor?.say('Down you go. Mind the gate, and mind the copper: dig <b>round</b> it, not into it.', { mood: 'calm', dur: 4 });
  }

  /** Back home in the middle of the lessons (from: 'lift' | 'forge' | 'cooking'). */
  async onLessonArrival(from) {
    const st = this.game.state, stage = this.lessonStage(), star = this.star;
    if (!star?.rig) return;
    if (stage === 'mine' && from === 'lift') {
      if (st.count('copper_ore') > 0) {
        star.scripted = true;
        await star.walkTo(this.rig.player.pos.x - 0.75, this.rig.player.pos.z);
        star.faceTo(this.rig.player.pos.x, this.rig.player.pos.z);
        star.scripted = false;
        star.sniff();
        this.sniffSound?.();
        await star.say('Ooh. Let me sniff it. <i>*snff*</i> Copper! Good clean copper. You didn\'t smash it. I knew you had paws on you.', { mood: 'proud', wait: true });
        this.lessonAct('copper_home');
        if (st.count('coal') < 2) { st.addItem('coal', { n: 3 }); this.game.ui.toast('Old Star gives you <b>3 coal</b>', { icon: iconURL('coal'), kind: 'good' }); }
        this.setLesson('forge');
        star.say(NEXT.forge.text, { mood: NEXT.forge.mood });
        this.placeStarForLesson();
      } else {
        star.say('Back already? No copper? It\'s in my practice dig, the orange specks in the rock. Back down you go. The lift will take you.', { mood: 'stern' });
      }
      return;
    }
    if (stage === 'forge' && from === 'forge') {
      // the forge's tutorial moves the stage on when the blade is done (state.data.oldstar.lesson = 'cook')
      star.say('Still warm from the forge? Come on, back to it. The anvil won\'t hammer itself. I\'ve asked.', { mood: 'stern' });
      return;
    }
    if (stage === 'cook' && from === 'forge') {
      const w = (st.data.weapons || []).slice(-1)[0];
      const g = w ? (w.grade || 'C') : 'C';
      const good = 'SAB'.includes(g);
      await star.say(good ? `Look at that. A ${w?.name || 'blade'}! First go, and it doesn't bend. Your granny would cry.` : `A ${w?.name || 'blade'}. Lumpy, but it's yours, and it'll sell. The second one's always better.`, { mood: good ? 'proud' : 'laugh', wait: true });
      star.say(NEXT.cook.text, { mood: NEXT.cook.mood });
      this.placeStarForLesson();
      return;
    }
    if (stage === 'cook' && (from === 'cooking' || from === 'stove')) {
      const cooked = this.arrivalLesson === 'cook_done' || (this.arrivalLesson !== 'cook' && ((st.data.stats?.dishes || 0) > (starData(st).dishesAtLesson ?? 0) || Object.keys(st.data.recipes || {}).length > 0));
      if (!cooked) { star.say('Nothing in the pot? Come on. Even I can boil an egg, and I\'m a hundred and four.', { mood: 'stern' }); return; }
      this.lessonAct('cook_done');
      this.setLesson('done');
      star.lessonSpot = null;
      star.scripted = true;
      await star.walkTo(this.rig.player.pos.x + 0.6, this.rig.player.pos.z - 0.6);
      star.faceTo(this.rig.player.pos.x, this.rig.player.pos.z);
      star.scripted = false;
      await star.say('Mm! That\'s proper food. Now you can dig, forge and cook. That\'s all I know, more or less.', { mood: 'happy', wait: true });
      await star.say('The rest is a <span class="gold-txt">million gold</span> and a great deal of digging. Ore, gems, blades, dinners: sell the lot in Deep Town. Every coin brings us closer to the way up.', { mood: 'proud', wait: true });
      star.gesture('cheer', 1.6);
      this.game.audio.play('success');
      star.say('Off you go, then. I\'ll keep the fire in.', { mood: 'laugh' });
      star.nextT = 8;
      st.save();
    }
  }

  /** Before the forge lesson: make sure there's enough to learn with (two copper ore and coal). */
  prepForgeLesson() {
    const st = this.game.state;
    const gave = [];
    if (st.count('copper_ingot') < 1 && st.count('copper_ore') < 2) { st.addItem('copper_ore', { q: 70, n: 2 - st.count('copper_ore') }); gave.push('copper ore'); }
    if (st.count('coal') < 2) { st.addItem('coal', { n: 3 }); gave.push('coal'); }
    if (!st.owns('bp_dagger')) st.addItem('bp_dagger', { n: 1 });
    if (gave.length) this.game.ui.toast(`Old Star tops you up: ${gave.join(' and ')}`, { icon: iconURL('coal'), kind: 'good' });
  }

  /** Before the cooking lesson: something to cook (an egg and mushrooms, if the pack's bare). */
  prepCookLesson() {
    const st = this.game.state, sd = starData(st);
    sd.dishesAtLesson = st.data.stats?.dishes || 0;
    const food = st.inventory((it) => it && (it.cat === 'food' || it.cat === 'plant' || it.cat === 'ingredient'));
    if (food.length < 2) {
      st.addItem('egg', { n: 2 });
      st.addItem('mushroom', { n: 2 });
      this.game.ui.toast('Old Star hands you <b>2 eggs</b> and <b>2 mushrooms</b>', { icon: iconURL('egg'), kind: 'good' });
    }
  }

  injectLessonCss() {
    if (document.getElementById('ls-css')) return;
    document.head.append(el('style', { id: 'ls-css' }, `
      .ls-talk { display: flex; flex-direction: column; gap: calc(var(--px) * 2); }
      .ls-head { display: flex; gap: calc(var(--px) * 3); align-items: center; margin-bottom: calc(var(--px) * 1); }
      .ls-face { width: calc(var(--px) * 40); height: calc(var(--px) * 40); flex: none; box-shadow: 0 0 0 var(--px) #4a3010, 0 0 0 calc(var(--px) * 2) #c89a3a; }
      .ls-head p { margin: 0; line-height: 1.35; }
      .ls-opt { display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: calc(var(--px) * .5); }
      .ls-opt b { font-weight: 400; }
      .ls-opt small { color: var(--ink-soft); font-size: .85em; }
    `));
  }
}
