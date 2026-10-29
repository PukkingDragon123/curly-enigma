// Old Star's forging lesson (forge { from: 'home', tutorial: true }). He stands in the smithy with
// you and talks you through it on the tutor card as you go: smelting your copper ore (the bellows,
// the pour band, the pour), then your first blade (the dagger in copper: heat, hammer, grind,
// balance), reacting to what you do (a cold blow, burning metal, a good strike, how the melt and
// the blade turned out). Emits lesson { step: 'forge_smelt' } after the first ingot and
// lesson { step: 'forge_done' } with the first blade (the forge emits smelt / forge acts itself),
// moves state.data.oldstar.lesson on to 'cook' and sends you home to his hearth.
// The scene calls event(name, data) from the activities ('step', 'strike', 'melt', 'ingot',
// 'result') and update(dt) every frame; its debug: scene.lesson.debug.
import * as THREE from 'three';
import { pick, clamp } from '../core/util.js';

const starMods = import.meta.glob('../gfx/char/starmole.js');
const _v = new THREE.Vector3();

export class ForgeLesson {
  constructor(scene) {
    this.sc = scene;
    this.g = scene.game;
    this.st = scene.game.state;
    this.stage = 'intro';
    this.cool = {};
    this.t = 0;
    this.highlight = 'smelt_copper';
    this.debug = { stage: () => this.stage, say: (k) => this.cool[k] };
  }

  get ui() { return this.g.ui; }

  /** Say something as Old Star (card at the top: the work is low in the view). */
  say(html, mood = 'calm', o = {}) {
    this.star?.rig?.talk?.(Math.min(3, 0.8 + html.length / 30));
    if (this.star?.rig?.setExpression) { try { this.star.rig.setExpression(mood, { hold: 3 }); } catch (e) { /* older rig */ } }
    return this.ui.tutor?.say(html, { mood, place: 'top', ...o }) || Promise.resolve();
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
    // enough to learn with
    if (st.count('copper_ingot') < 1 && st.count('copper_ore') < 2) st.addItem('copper_ore', { spill: true, q: 70, n: 2 - st.count('copper_ore') });
    if (st.count('coal') < 1) st.addItem('coal', { spill: true, n: 3 });
    if (!st.owns('bp_dagger')) st.addItem('bp_dagger', { spill: true, n: 1 });
    await this.loadStar();
    this.sc.dock?.('here');
    await this.say('My forge! Mind the sparks, they bite. First we melt your copper into an <b>ingot</b>.', 'proud', { wait: true });
    if (this.sc.game.scene !== this.sc || this.stage !== 'intro') return;
    // already at it before he'd finished talking
    if (this.sc.activity) { this.stage = this.sc.activity.r ? 'smeltMenu' : 'forge'; return; }
    if (st.count('copper_ingot') > 0 && st.count('copper_ore') < 2) { this.toForging(true); return; }
    this.stage = 'smeltMenu';
    this.sc.menus.smeltList();
    this.say('Pick <b>Copper Ingot</b> in the list and press <b>Smelt</b>.', 'calm', { key: 'step', dur: Infinity });
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
      this.later(1.8, () => {
        this.say(line[0], line[1], { dur: 6 });
        this.star?.rig?.play?.(g === 'F' || g === 'D' ? 'laugh' : 'cheer');
      });
      this.later(8.2, () => {
        this.say('That\'s yours: sell it in town, or keep it for luck. Now come on, into the kitchen: all this hammering, I\'m starving. We\'ll <b>cook</b>.', 'happy', { key: 'step', dur: Infinity });
        this.stage = 'leave';
      });
    }
  }

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
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    this.t += dt;
    const sc = this.sc, a = sc.activity;
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
      if (T >= w[0] && !this.cool.workHot) { this.cool.workHot = this.t; this.say('<b>Working heat!</b> To the anvil with it, while it glows.', 'happy', { key: 'remark', dur: 4 }); }
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
    this.ui.tutor?.hide();
    if (this.star?.rig) { this.sc.scene.remove(this.star.rig.root); this.star.rig.dispose?.(); }
  }
}

void clamp; void _v;
