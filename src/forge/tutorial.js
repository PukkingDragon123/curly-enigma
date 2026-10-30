// Old Star's forging lesson (forge { from: 'home', tutorial: true }). He stands in the smithy with
// you and talks you through it on the tutor card as you go: smelting your copper ore (the bellows,
// the pour band, the pour), then your first blade (the dagger in copper: heat, hammer, grind,
// balance), reacting to what you do (a cold blow, burning metal, a good strike, how the melt and
// the blade turned out). Emits lesson { step: 'forge_smelt' } after the first ingot and
// lesson { step: 'forge_done' } with the first blade (the forge emits smelt / forge acts itself),
// moves state.data.oldstar.lesson on to 'cook' and sends you home to his hearth.
// The scene calls event(name, data) from the activities ('step', 'strike', 'melt', 'ingot',
// 'result') and update(dt) every frame; its debug: scene.lesson.debug.
// The pickaxe lesson (forge { ..., pick: true }, stage 'pick'): before any mining, you forge your own
// pick (the forge piece pick_first: heat, hammer, quench; src/forge/parts.js). He gives the copper;
// the piece's 'piece' event emits lesson { step: 'pick_done' }, moves the lesson on to 'mine' and
// sends you home (where he walks you to the lift).
// The cinematic tutorial (src/ui/Onboard.js): it opens as a cutscene (letterbox, his first line
// through the cutscene talk when there is one, a hold skips it), and each new control gets a prompt
// card drawn for the device (the mouse and Space on a PC, the big button on a touch screen): pick
// the recipe, pump the bellows, start forging, carry it to the anvil, hammer, grind, balance.
import * as THREE from 'three';
import { pick, clamp } from '../core/util.js';

const starMods = import.meta.glob('../gfx/char/starmole.js');
const _v = new THREE.Vector3();

export class ForgeLesson {
  constructor(scene, o = {}) {
    this.sc = scene;
    this.pick = !!o.pick;
    this.g = scene.game;
    this.st = scene.game.state;
    this.stage = 'intro';
    this.cool = {};
    this.t = 0;
    this.highlight = 'smelt_copper';
    this.debug = { stage: () => this.stage, say: (k) => this.cool[k], prompt: () => this.obH?.id ?? null };
  }

  get ui() { return this.g.ui; }

  /** Say something as Old Star (card at the top: the work is low in the view; a line he waits on is cutscene talk). */
  say(html, mood = 'calm', o = {}) {
    if (this.g.scene !== this.sc) return Promise.resolve(); // (the forge has gone: nothing more to say)
    this.star?.rig?.talk?.(Math.min(3, 0.8 + html.length / 30));
    if (this.star?.rig?.setExpression) { try { this.star.rig.setExpression(mood, { hold: 3 }); } catch (e) { /* older rig */ } }
    const card = () => this.ui.tutor?.say(html, { mood, place: 'top', ...o }) || Promise.resolve();
    if (o.wait && this.ui.onboard) return this.ui.onboard.talk(html, { mood, wait: true, scene: this.sc }, card);
    return card();
  }

  /** A prompt card for a control (the one before goes). Low on the screen: the work is in the middle. */
  teach(id, o = {}) {
    this.obH?.close?.();
    if (this.g.scene !== this.sc) { this.obH = null; return null; }
    this.obH = this.ui.onboard?.teach(id, { place: 'low', ...o }) || null;
    return this.obH;
  }
  untaught() { if (this.obH && !this.obH.done) this.obH.close(); this.obH = null; }

  /** The opening cutscene ends (a hold, or work starting: nothing may wait behind it). */
  endCine() {
    const c = this.cine;
    if (!c) return;
    c.cut = true;
    this.cine = null;
    this.g.convo?.end?.();
    this.ui.tutor?.hide?.();
    this.ui.onboard?.cinema(false);
  }

  /** A remark at most every `gap` seconds per key. */
  remark(key, html, mood, gap = 6) {
    const now = this.t;
    if ((this.cool[key] ?? -1e9) > now - gap) return false;
    this.cool[key] = now;
    this.say(html, mood, { key: 'remark', dur: 3.2 });
    return true;
  }

  act(step) { this.st.emit?.('act', { type: 'lesson', step }); }

  /** Run fn after `sec` seconds of the scene's time (stops with the scene, waits while paused). */
  later(sec, fn) { (this.timers ||= []).push({ t: this.t + sec, fn }); }

  async start() {
    const st = this.st;
    if (this.pick) return this.startPick();
    // enough to learn with
    if (st.count('copper_ingot') < 1 && st.count('copper_ore') < 2) st.addItem('copper_ore', { spill: true, q: 70, n: 2 - st.count('copper_ore') });
    if (st.count('coal') < 1) st.addItem('coal', { spill: true, n: 3 });
    if (!st.owns('bp_dagger')) st.addItem('bp_dagger', { spill: true, n: 1 });
    await this.loadStar();
    this.sc.dock?.('here');
    // a cutscene: the bars, his welcome (a hold skips it)
    const ob = this.ui.onboard;
    this.cine = { cut: false };
    ob?.cinema(true, { skip: () => this.endCine() });
    await this.say('My forge! Mind the sparks, they bite. First we melt your copper into an <b>ingot</b>.', 'proud', { wait: true });
    if (this.cine && !this.cine.cut && this.sc.game.scene === this.sc && !this.sc.activity) await this.say('Watch the paws, not the fire. I\'ll tell you when.', 'happy', { wait: true });
    this.endCine();
    if (this.sc.game.scene !== this.sc || this.stage !== 'intro') return;
    // already at it before he'd finished talking
    if (this.sc.activity) { this.stage = this.sc.activity.r ? 'smeltMenu' : 'forge'; return; }
    if (st.count('copper_ingot') > 0 && st.count('copper_ore') < 2) { this.toForging(true); return; }
    this.stage = 'smeltMenu';
    this.sc.menus.smeltList();
    this.say('Pick <b>Copper Ingot</b> in the list and press <b>Smelt</b>.', 'calm', { key: 'step', dur: Infinity });
    this.teach('click', { title: 'Smelt your copper', subPc: '<b>Click</b> Copper Ingot, then <b>Smelt</b>', subT: '<b>Tap</b> Copper Ingot, then <b>Smelt</b>', done: () => this.stage !== 'smeltMenu' });
  }

  /** The pickaxe lesson: his copper, a short cutscene, then the pick head on the forge. */
  async startPick() {
    const st = this.st;
    if (st.count('copper_ingot') < 2) st.addItem('copper_ingot', { spill: true, q: 80, n: 2 - st.count('copper_ingot') });
    st.data.energy = Math.max(st.data.energy || 0, 60);
    await this.loadStar();
    this.sc.dock?.('here');
    const ob = this.ui.onboard;
    this.cine = { cut: false };
    ob?.cinema(true, { skip: () => this.endCine() });
    await this.say('My forge! Mind the sparks, they bite. Here: <b>two copper ingots</b> I put by. A pick head wants both.', 'proud', { wait: true });
    if (this.cine && !this.cine.cut && this.sc.game.scene === this.sc && !this.sc.activity) await this.say('Heat it, hammer it into a curve, cool it off. Your own pick, made by your own paws. Nothing digs better.', 'happy', { wait: true });
    this.endCine();
    if (this.sc.game.scene !== this.sc || this.stage !== 'intro') return;
    this.stage = 'pick';
    if (!this.sc.activity && !this.sc.menus.startPart('pick_first')) {
      // (can't be made: say why, and let you try again from the menu)
      this.say('Hm. Something\'s not right with the fire. Try the <b>Coop parts</b> page of the forge book.', 'worried', { dur: 5 });
    }
  }

  /** Old Star himself, standing by the hearth, watching you work. */
  async loadStar() {
    const load = starMods['../gfx/char/starmole.js'];
    if (!load) return;
    try {
      const m = await load();
      const rig = m.makeStarMole({ height: 0.76 });
      const h = rig.height || 1;
      rig.root.scale.multiplyScalar(0.76 / h);
      const W = this.sc.W;
      const fp = W.firePos;
      const pos = new THREE.Vector3(fp.x - 0.78, 0, fp.z + 0.62);
      rig.root.position.copy(pos);
      this.sc.scene.add(rig.root);
      this.star = { rig, pos };
      rig.face(Math.atan2(2.3 - pos.x, 1.6 - pos.z), true);
      rig.play?.('idle');
    } catch (e) { console.warn('[forge] Old Star failed to load', e); }
  }

  // ------------------------------------------------------------ events from the activities
  event(name, d) {
    const sc = this.sc;
    if (name === 'pstep') { this.pickStep(d.step, d.run); return; }
    if (name === 'piece') {
      this.stage = 'done';
      const sd = this.st.data.oldstar ||= {};
      if (!sd.lesson || sd.lesson === 'pick' || sd.lesson === 'wake') sd.lesson = 'mine';
      this.act('pick_done');
      this.st.dirty = true;
      this.st.save?.();
      this.ui.tutor?.hide('step');
      this.untaught();
      const g = d.grade?.g || 'C';
      this.later(1.6, () => {
        this.say(g === 'S' || g === 'A' ? 'Now <b>that</b> is a pick. I\'d trade you mine for it, if mine didn\'t know my paws.' : g === 'B' || g === 'C' ? 'A good honest pick. It\'ll bite rock. Your granny would hang it over the fire.' : 'It\'s... pick-ish. It\'ll dig. You\'ll make a better one when you\'re rich.', g === 'F' || g === 'D' ? 'laugh' : 'proud', { dur: 6 });
        this.star?.rig?.play?.(g === 'F' || g === 'D' ? 'laugh' : 'cheer');
      });
      this.later(7.4, () => this.say('Hang it on your belt. Now come on: the cage lift. Time you dug something.', 'happy', { key: 'step', dur: Infinity }));
      this.stage = 'leave';
      return;
    }
    if (name === 'melt') {
      const a = d.acc;
      if (a >= 0.9) this.say('Ha! A <b>perfect</b> melt. Are you sure you\'ve never done this before?', 'laugh', { dur: 4 });
      else if (a >= 0.6) this.say('Good melt! Now watch it pour into the mould.', 'happy', { dur: 4 });
      else this.say('Lumpy, but it\'ll pour. Steadier on the bellows next time.', 'calm', { dur: 4 });
      this.star?.rig?.doEmote?.(a >= 0.6 ? 'nod' : 'shake', 1);
      return;
    }
    if (name === 'ingot') {
      if (!this.smelted) { this.smelted = true; this.act('forge_smelt'); }
      if (this.stage === 'smelt' || this.stage === 'smeltMenu' || this.stage === 'intro') this.stage = 'smelted';
      return;
    }
    if (name === 'step') {
      const run = d.run, k = run.sim?.workRange || run.m?.work || [550, 880];
      if (this.stage === 'planMenu' || this.stage === 'smelted' || this.stage === 'intro') this.stage = 'forge';
      this.stepPrompt(d.step, run);
      if (d.step === 'heat' && !this.cool.heatIntro) {
        this.cool.heatIntro = this.t;
        this.say(`Into the coals with it. Pump the bellows till it glows: copper works between <b>${Math.round(k[0])}°</b> and <b>${Math.round(k[1])}°</b>, the gold band on the thermometer.`, 'calm', { key: 'step', dur: Infinity });
      } else if (d.step === 'hammer') {
        if (!this.cool.hammerIntro) {
          this.cool.hammerIntro = this.t;
          this.say('Now hammer! Aim where it\'s fatter than the outline, <b>hold</b> to raise the hammer, <b>let go</b> to strike. Hard blows move a lot, soft ones tidy up.', 'happy', { key: 'step', dur: Infinity });
        }
      } else if (d.step === 'grind') this.say('Good shape. The grindstone cleans the edge: hold it to the wheel, nice and steady.', 'calm', { key: 'step', dur: 6 });
      else if (d.step === 'balance') this.say('Balance it: slide the weight along until the blade sits level on the fulcrum.', 'calm', { key: 'step', dur: Infinity });
      else if (d.step === 'quench') this.say('Iron wants a quench. Plunge it in the barrel while it\'s in the blue band: too hot and it cracks, too cold and it stays soft.', 'stern', { key: 'step', dur: Infinity });
      return;
    }
    if (name === 'strike') {
      this.strikes = (this.strikes || 0) + 1;
      const ev = d.ev;
      if (ev.crack) this.remark('crack', 'Crack! That\'s what cold metal does. <b>Back in the fire</b>, and only strike it glowing.', 'stern', 8);
      else if (ev.kind === 'cold') this.remark('cold', 'Too cold! It\'s just denting. Heat it up again first.', 'stern', 7);
      else if (ev.kind === 'burn') this.remark('burn', 'It\'s <b>burning</b>! Out of the fire, quick, before it\'s all sparks!', 'worried', 6);
      else if (d.gain > 0.035) this.remark('good', pick(['Good blow!', 'That\'s it, right there!', 'Ha! You\'ve got the wrist for it.', 'Lovely. Again.']), 'happy', 7);
      else if (d.gain < -0.03) this.remark('bad', pick(['Easy! You\'re thinning the wrong spot.', 'Watch the outline: you\'re making it too thin there.']), 'worried', 7);
      return;
    }
    if (name === 'result') {
      const g = d.grade.g;
      this.stage = 'done';
      this.act('forge_done');
      const sd = this.st.data.oldstar ||= {};
      if (!sd.lesson || sd.lesson === 'forge' || sd.lesson === 'mine') sd.lesson = 'cook';
      this.st.dirty = true;
      this.st.save?.();
      const line = g === 'S' ? ['A <b>legendary</b> blade, first time? I need to sit down.', 'laugh']
        : g === 'A' ? ['A <b>masterwork</b>! Sixty years and I\'ve not done better on a first go. Don\'t tell anyone.', 'proud']
          : g === 'B' ? ['That\'s a <b>fine</b> blade. Fine! It\'ll sell, and it\'ll cut.', 'proud']
            : g === 'C' ? ['A <b>sturdy</b> little dagger. Every smith\'s first. Mine was worse.', 'happy']
              : ['Well... it\'s pointy at one end. We all start somewhere. Mine looked like a spoon.', 'laugh'];
      this.ui.tutor?.hide('step');
      this.untaught();
      this.later(1.8, () => {
        this.say(line[0], line[1], { dur: 6 });
        this.star?.rig?.play?.(g === 'F' || g === 'D' ? 'laugh' : 'cheer');
      });
      this.later(8.2, () => {
        this.say('That\'s yours: sell it in town, or keep it for luck. Now come on, over to the fire pit: all this hammering, I\'m starving. We\'ll <b>cook</b>.', 'happy', { key: 'step', dur: Infinity });
        this.stage = 'leave';
      });
    }
  }

  /** The prompt card for a forging step (each control once: heat, hammer, grind, balance, quench). */
  stepPrompt(step, run) {
    const seen = (this.taught ||= new Set());
    if (seen.has(step)) return;
    seen.add(step);
    const live = () => this.sc.activity === run && run.step === step;
    if (step === 'heat') this.teach('hold', { title: 'Heat it', subPc: '<b>Hold</b> the left button (or <kbd>Space</kbd>) to pump', subT: '<b>Hold</b> the big button to pump', spot: this.touchSpot(), progress: () => { const a = this.sc.activity, s = a?.sim; if (!s?.meanT) return 0; const w = s.workRange || [600, 900]; return clamp((s.meanT() - 300) / Math.max(1, w[0] - 300), 0, 1); }, done: () => !live() });
    else if (step === 'hammer') this.teach('hold', { title: 'Hammer it', subPc: 'Point at a thick spot · <b>hold</b> to raise, <b>let go</b> to strike', subT: 'Point at a thick spot · <b>hold</b> the button, <b>let go</b> to strike', spot: this.touchSpot(), done: () => !live() || (this.strikes || 0) >= 3 });
    else if (step === 'grind') this.teach('hold', { title: 'Grind the edge', subPc: '<b>Hold</b> it to the wheel, steady', subT: '<b>Hold</b> it to the wheel, steady', done: () => !live() });
    else if (step === 'balance') this.teach('drag', { title: 'Balance it', subPc: '<b>Drag</b> the slider till the blade sits level', subT: '<b>Drag</b> the slider till the blade sits level', done: () => !live() });
    else if (step === 'quench') this.teach('hold', { title: 'Quench it', subPc: 'Plunge it in the barrel: <kbd>Q</kbd>', subT: 'Tap <b>Plunge</b> in the blue band', done: () => !live() });
  }

  /** The pick lesson's prompts, one per forging step (heat, hammer, quench). */
  pickStep(step, run) {
    const seen = (this.taught ||= new Set());
    const live = () => this.sc.activity === run && run.step === step;
    if (step === 'heat') {
      if (seen.has('p-heat')) { this.remark('reheat', 'Back in the coals. Pump till it glows orange again.', 'calm', 10); return; }
      seen.add('p-heat');
      const w = run.sim?.workRange || [550, 880];
      this.say(`The bar's in the coals. <b>Pump the bellows</b> till it glows: copper works between <b>${Math.round(w[0])}°</b> and <b>${Math.round(w[1])}°</b>.`, 'calm', { key: 'step', dur: Infinity });
      this.teach('hold', { title: 'Heat the bar', subPc: '<b>Hold</b> the left button (or <kbd>Space</kbd>) to pump', subT: '<b>Hold</b> the big button to pump', spot: this.touchSpot(), progress: () => { const s = run.sim; if (!s?.workRange) return 0; return clamp((s.T - 300) / Math.max(1, s.workRange[0] - 300), 0, 1); }, done: () => !live() });
    } else if (step === 'hammer') {
      if (seen.has('p-hammer')) return;
      seen.add('p-hammer');
      this.say('Now <b>hammer</b> it into a curve! Hold to raise the hammer, and let go when the swing\'s in the <b>green</b>. The gold strip is a perfect blow.', 'happy', { key: 'step', dur: Infinity });
      this.teach('hold', { title: 'Hammer the head', subPc: '<b>Hold</b> to raise · <b>let go</b> in the green', subT: '<b>Hold</b> the button · <b>let go</b> in the green', spot: this.touchSpot(), done: () => !live() });
    } else if (step === 'quench') {
      if (seen.has('p-quench')) return;
      seen.add('p-quench');
      this.say('Into the water barrel while it\'s hot: that sets the edge hard. Mind the steam.', 'stern', { key: 'step', dur: Infinity });
    }
  }

  /** The forge's big touch button (it pumps and strikes), for the paw to point at. */
  touchSpot() { return this.sc.layer?.querySelector?.('.fg-tbtn') || null; }

  /** On to forging: the plan with the dagger in copper. */
  toForging(skipLine = false) {
    this.stage = 'planMenu';
    this.highlight = 'dagger';
    const m = this.sc.menus;
    m.sel.type = 'dagger';
    m.sel.metal = 'copper';
    m.sel.infusion = null;
    m.sel.gem = null;
    m.plan();
    if (!skipLine) this.say('That\'s an ingot! Now the fun part: a blade. The <b>Dagger</b> plan, in <b>copper</b>. Press <b>Start forging</b>.', 'proud', { key: 'step', dur: Infinity });
    else this.say('You\'ve an ingot already: let\'s make a blade. The <b>Dagger</b> plan, in <b>copper</b>. Press <b>Start forging</b>.', 'calm', { key: 'step', dur: Infinity });
    this.teach('click', { title: 'Forge a dagger', subPc: '<b>Click</b> Start forging', subT: '<b>Tap</b> Start forging', done: () => this.stage !== 'planMenu' });
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    this.t += dt;
    const sc = this.sc, a = sc.activity;
    if (this.cine && a) this.endCine();
    if (this.timers?.length) {
      const due = this.timers.filter((x) => x.t <= this.t);
      if (due.length) { this.timers = this.timers.filter((x) => x.t > this.t); for (const x of due) { try { x.fn(); } catch (e) { console.warn(e); } } }
    }
    // Old Star: looks at you, talks while his card types
    const r = this.star?.rig;
    if (r) {
      const cam = sc.camera.position;
      const p = this.star.pos;
      if (typeof r.look === 'function') r.look(0, Math.atan2(cam.y - 0.6, Math.max(0.4, Math.hypot(cam.x - p.x, cam.z - p.z))) * 0.6);
      r.face(Math.atan2(cam.x - p.x, cam.z - p.z));
      r.update(dt);
    }
    if (this.stage === 'smeltMenu' && a && a.r) {
      this.stage = 'smelt';
      this.said = 0;
      this.teach('hold', { title: 'Pump the bellows', subPc: '<b>Hold</b> the left button (or <kbd>Space</kbd>)', subT: '<b>Hold</b> the big button', spot: this.touchSpot(), progress: () => { const s = this.sc.activity?.sim; return s ? clamp((s.inBand || 0) / (s.required || 6), 0, 1) : 1; }, done: () => this.stage !== 'smelt' });
      this.say('Hold the mouse (or <b>Space</b>) to pump the bellows. Bring the crucible up into the <b>pour heat</b> band and keep it there till it\'s all melted.', 'calm', { key: 'step', dur: Infinity });
    }
    if (this.stage === 'smelt' && a && a.sim && a.r) {
      const sim = a.sim;
      if (sim.overheat) this.remark('slag', 'Too hot! Let go of the bellows, you\'re making slag!', 'worried', 5);
      else if (sim.inBandNow && !this.cool.inBand) { this.cool.inBand = this.t; this.say('There! Hold it right there. Ease off if it climbs, pump if it sinks.', 'happy', { key: 'remark', dur: 4 }); }
      else if (sim.started && !sim.inBandNow && sim.T < sim.band[0] - 120 && !sc.fire.pumping && a.elapsed > 4) this.remark('pump', 'Pump! Long, steady pulls. The fire wants air.', 'stern', 7);
    }
    if (this.stage === 'smelted' && !a && sc.menus.mode !== 'plan') this.toForging();
    if (this.stage === 'forge' && a && a.step === 'heat' && a.sim) {
      const T = a.sim.meanT(), w = a.sim.workRange;
      if (T >= w[0] && !this.cool.workHot) {
        this.cool.workHot = this.t;
        this.say('<b>Working heat!</b> To the anvil with it, while it glows.', 'happy', { key: 'remark', dur: 4 });
        if (!(this.taught ||= new Set()).has('anvil')) { this.taught.add('anvil'); this.teach('use', { title: 'To the anvil', subPc: 'Press <kbd>E</kbd> while it glows', subT: 'Tap <b>To the anvil</b>', done: () => !(this.sc.activity && this.sc.activity.step === 'heat') }); }
      }
      if (T < w[0] - 60) this.cool.workHot = undefined;
    }
    if (this.stage === 'forge' && a && a.step === 'hammer' && a.sim) {
      const T = a.sim.meanT(), w = a.sim.workRange;
      if (T < w[0] - 40) this.remark('cooling', 'It\'s cooling off: back in the coals for a heat, then hammer again.', 'calm', 9);
    }
    if (this.stage === 'leave' && !a) {
      this.stage = 'gone';
      this.later(2.6, () => { if (!sc.leaving) sc.leave(); });
    }
  }

  dispose() {
    this.endCine();
    this.untaught();
    this.ui.tutor?.hide();
    if (this.star?.rig) { this.sc.scene.remove(this.star.rig.root); this.star.rig.dispose?.(); }
  }
}

void clamp; void _v;
