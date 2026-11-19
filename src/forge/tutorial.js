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
// sends you home (where he walks you to the lift). The pick on your belt unlocks the hotbar and the
// touch dig button (ui.unlock: src/ui/Onboard.js UNLOCKS).
// Wave 18: no cards. He opens with a short cutscene (letterbox, a hold of Esc / a click skips it),
// then teaches by example: at each new step he comes round to stand across the work from you and
// shows it (src/home/starDemo.js: pumping the bellows, hammering, the quench, the grind, levelling the
// blade), and you copy him; at most a 2–4 word cue floats up by the work (teachWord). His remarks
// float by his head (game.convo with his rig), not on a card.
import * as THREE from 'three';
import { pick, clamp } from '../core/util.js';
import { StarDemo } from '../home/starDemo.js';
import { teachWord } from '../home/tutorFx.js';

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
    this.debug = { stage: () => this.stage, say: (k) => this.cool[k], prompt: () => this.demo?.kind ?? null, demo: () => ({ kind: this.demo?.kind ?? null, at: this.star?.at ?? null }) };
  }

  get ui() { return this.g.ui; }

  /** Say something as Old Star (card at the top: the work is low in the view; a line he waits on is cutscene talk). */
  say(html, mood = 'calm', o = {}) {
    if (this.g.scene !== this.sc) return Promise.resolve(); // (the forge has gone: nothing more to say)
    this.star?.rig?.talk?.(Math.min(3, 0.8 + html.length / 30));
    if (this.star?.rig?.setExpression) { try { this.star.rig.setExpression(mood, { hold: 3 }); } catch (e) { /* older rig */ } }
    const card = () => this.ui.tutor?.say(html, { mood, place: 'top', ...o }) || Promise.resolve();
    if (o.wait && this.ui.onboard) return this.ui.onboard.talk(html, { mood, wait: true, scene: this.sc }, card);
    // (wave 18: a passing remark floats by his head, no card)
    const rig = this.star?.rig, cv = this.g.convo;
    if (rig && cv?.say) {
      try { return Promise.resolve(cv.say(html, { who: 'oldstar', rig, head: (out) => rig.headWorld(out), mood, key: o.key, dur: o.dur === Infinity || o.dur == null ? 4 : o.dur, wait: false })); } catch (e) { /* fall back to the line */ }
    }
    return card();
  }

  /**
   * He shows the step (src/home/starDemo.js) and a few words float up by the work. kind: pump |
   * hammer | quench | grind | balance; word: 2–4 words or null.
   */
  show(kind, word, secs = 2.8) {
    if (this.g.scene !== this.sc) return;
    // (once he's got round to the work: he walks over first when the view moves)
    if (kind && this.demo) this.pendingDemo = { kind, secs, t: 0.25 };
    if (word) this.later(kind ? 0.9 : 0, () => this.cue(word));
  }

  /** A few words floating up by the work (between it and him), once. */
  cue(word) {
    if (this.g.scene !== this.sc) return;
    const d = this.sc.W?.docks?.[this.sc.view?.name];
    const p = d?.look ? d.look.clone() : this.star ? this.star.pos.clone().setY(0.7) : null;
    if (!p) return;
    if (d?.look && this.star) p.lerp(_v.copy(this.star.pos).setY(d.look.y + 0.1), 0.35);
    p.y += 0.1;
    // (a second cue soon after the first floats above it, not on it)
    if (this.t - (this.cueT ?? -9) < 2.8) p.y += d?.look ? 0.09 : 0.15;
    this.cueT = this.t;
    teachWord(this.g, word, p, { life: 2.6, size: d?.look ? 0.32 : 0.5 });
  }

  /** A gesture of his for a moment ('point', 'beckon', 'cheer'...). */
  gesture(state, secs = 1.6) {
    const r = this.star?.rig;
    if (!r?.play) return;
    r.play(state);
    this.gestT = secs;
  }

  /** (wave 18: no prompt cards; kept for old callers) */
  untaught() { this.demo?.stop(); }

  /** The opening cutscene ends (a hold, or work starting: nothing may wait behind it). */
  endCine() {
    this.banked = false;
    const c = this.cine;
    if (!c) return;
    c.cut = true;
    this.cine = null;
    for (const r of c.waiters || []) r();
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

  /** A pause in the opening cutscene (scene time; over at once when it's cut short). */
  wait(sec) {
    const c = this.cine;
    if (!c || c.cut) return Promise.resolve();
    return new Promise((res) => { (c.waiters ||= []).push(res); this.later(sec, res); });
  }
  get cut() { return !this.cine || this.cine.cut || this.sc.game.scene !== this.sc || !!this.sc.activity; }

  /**
   * The opening shot's end: a little way in from the door toward the hearth, looking between the
   * fire and him (a dock of the scene's, added for the lesson). Returns its name ('hearth' without).
   */
  introDock() {
    const W = this.sc.W, sp = W?.docks?.spawn, h = W?.docks?.hearth, fp = W?.firePos;
    if (!sp || !h || !fp) return 'hearth';
    const eye = sp.eye.clone().lerp(h.eye, 0.3);
    eye.y += 0.06;
    const look = fp.clone();
    if (this.star?.pos) look.lerp(_v.copy(this.star.pos).setY(0.42), 0.55);
    // (the dock steps back until these fit: on a phone held upright he and his fire both stay in the shot)
    const pts = [fp.clone()];
    if (this.star?.pos) pts.push(this.star.pos.clone().setY(0.8), this.star.pos.clone().setY(0.1));
    W.docks.tutIntro = { name: 'tutIntro', stand: sp.stand.clone().lerp(h.stand, 0.3), eye, look, fov: 70, pts };
    return 'tutIntro';
  }

  /**
   * The bellows: a few long pulls and the banked coals roar up (sparks, a warm flash, a shiver of
   * the room). The scene's own bellows and fire do the rest.
   */
  async wakeFire() {
    const sc = this.sc, f = sc.fire, a = this.g.audio;
    this.star?.rig?.play?.('cheer');
    for (let i = 0; i < 3 && !this.cut; i++) {
      a.play('bellows', { vol: 0.8 });
      f.nudge = 0.8;
      sc.puff?.();
      if (i === 2) {
        this.banked = false;
        f.air = 1;
        f.nudge = 1.6;
        a.play('ignite', { vol: 0.8 });
        a.play('whoosh', { vol: 0.5, pitch: 0.7 });
        const fp = sc.W?.firePos;
        if (fp) { sc.particles?.sparks?.(fp.clone().setY(fp.y + 0.05), 46, 1.4); sc.particles?.sparkle?.(fp.clone().setY(fp.y + 0.2), 0xffd27a, 16, 0.5, 0.6); }
        sc.post.flash = Math.max(sc.post.flash || 0, 0.22);
        sc.post.flashColor = 0xffb060;
        sc.addShake?.(0.02);
      }
      await this.wait(i === 2 ? 0.9 : 0.55);
    }
    this.banked = false;
    this.star?.rig?.play?.('idle');
  }

  async start() {
    const st = this.st;
    if (this.pick) return this.startPick();
    // enough to learn with
    if (st.count('copper_ingot') < 1 && st.count('copper_ore') < 2) st.addItem('copper_ore', { spill: true, q: 70, n: 2 - st.count('copper_ore') });
    if (st.count('coal') < 1) st.addItem('coal', { spill: true, n: 3 });
    if (!st.owns('bp_dagger')) st.addItem('bp_dagger', { spill: true, n: 1 });
    await this.loadStar();
    this.sc.dock?.('here');
    // a cutscene: the bars, his welcome (a hold skips it), the fire woken with the bellows
    const ob = this.ui.onboard;
    this.cine = { cut: false };
    ob?.cinema(true, { skip: () => this.endCine() });
    this.banked = true;
    await this.wait(0.6);
    if (!this.cut) await this.wakeFire();
    if (!this.cut) await this.say('Melt it to an <b>ingot</b>. Then a blade.', 'proud', { wait: true });
    this.endCine();
    if (this.sc.game.scene !== this.sc || this.stage !== 'intro') return;
    // already at it before he'd finished talking
    if (this.sc.activity) { this.stage = this.sc.activity.r ? 'smeltMenu' : 'forge'; return; }
    if (st.count('copper_ingot') > 0 && st.count('copper_ore') < 2) { this.toForging(true); return; }
    this.stage = 'smeltMenu';
    this.sc.menus.smeltList();
    this.gesture('point', 1.8);
    this.cue('Smelt the copper');
  }

  /** The pickaxe lesson: the forge woken, his copper tossed to you, then the pick head on the forge. */
  async startPick() {
    const st = this.st;
    if (st.count('copper_ingot') < 2) st.addItem('copper_ingot', { spill: true, q: 80, n: 2 - st.count('copper_ingot') });
    st.data.energy = Math.max(st.data.energy || 0, 60);
    // the coals are banked low: the smithy is dark when you come in
    this.banked = true;
    await this.loadStar();
    const ob = this.ui.onboard;
    this.cine = { cut: false };
    ob?.cinema(true, { skip: () => this.endCine() });
    // a slow glide in from the door toward the hearth, him and his fire in the frame
    if (this.sc.view?.mode === 'walk' && !this.sc.activity) this.sc.dock?.(this.introDock(), { dur: 3.4 });
    await this.wait(1.0);
    if (!this.cut) await this.wakeFire();
    if (!this.cut) await this.say('Two <b>copper ingots</b>. Heat, hammer, cool: a pick.', 'happy', { wait: true });
    this.endCine();
    if (this.sc.game.scene !== this.sc || this.stage !== 'intro') return;
    this.stage = 'pick';
    if (!this.sc.activity && !this.sc.menus.startPart('pick_first')) {
      // (can't be made: say why, and let you try again from the menu)
      if (this.sc.view?.mode === 'dock' && !this.sc.activity && this.sc.menus.mode === 'hidden') this.sc.undock?.();
      this.say('Hm. Something\'s not right with the fire. Try the <b>parts</b> page of the forge book.', 'worried', { dur: 5 });
    }
  }

  /**
   * Where he stands for a view of the work: by the hearth for the fire; for the anvil, the barrel or
   * the wheel, across the work from you and a little to the side, where he can show you.
   */
  spotFor(name) {
    const S = this.star, d = this.sc.W?.docks?.[name];
    if (!S) return null;
    if (!d || !d.stand || !d.look || !['anvil', 'barrel', 'grind'].includes(name)) return S.home;
    let fx = d.look.x - d.stand.x, fz = d.look.z - d.stand.z;
    const L = Math.hypot(fx, fz) || 1;
    fx /= L; fz /= L;
    return (S.spots ||= {})[name] ||= new THREE.Vector3(d.look.x + fx * 0.62 + fz * 0.3, 0, d.look.z + fz * 0.62 - fx * 0.3);
  }

  /** He walks over to the spot for the view you're in (a few steps, not a jump). */
  follow(dt) {
    const S = this.star, r = S?.rig;
    if (!r) return;
    const name = this.sc.view?.mode === 'dock' ? this.sc.view.name : 'hearth';
    const to = this.spotFor(name) || S.home;
    S.at = name;
    const dx = to.x - S.pos.x, dz = to.z - S.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.03) {
      const step = Math.min(d, dt * 1.5);
      S.pos.x += (dx / d) * step; S.pos.z += (dz / d) * step;
      if (!S.walking) { S.walking = true; r.play?.('walk'); }
      r.face(Math.atan2(dx, dz));
    } else if (S.walking) { S.walking = false; r.play?.('idle'); }
    r.root.position.copy(S.pos);
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
      this.star = { rig, pos, home: pos.clone(), at: 'hearth' };
      rig.face(Math.atan2(2.3 - pos.x, 1.6 - pos.z), true);
      rig.play?.('idle');
      // his example (src/home/starDemo.js): sparks off his blows, a puff of the bellows, steam off the quench
      this.demo = new StarDemo(rig, {
        audio: this.g.audio,
        onBeat: (kind) => {
          const sc = this.sc, hp = rig.handR?.getWorldPosition?.(new THREE.Vector3());
          if (!hp) return;
          if (kind === 'hammer') sc.particles?.sparks?.(hp, 14, 0.6);
          else if (kind === 'pump') { sc.puff?.(); if (sc.fire) sc.fire.nudge = Math.max(sc.fire.nudge || 0, 0.7); } // (off to the side at the bellows: the coals flare with each of his pulls)
          else if (kind === 'quench') { this.g.audio.play('steam', { vol: 0.35 }); sc.particles?.sparkle?.(hp, 0xdfe8ff, 6, 0.2, 0.3); }
          else if (kind === 'grind') sc.particles?.sparks?.(hp, 5, 0.35);
        },
      });
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
      this.ui.unlock?.(['belt', 'dig']); // (your first tool: the hotbar comes in with it)
      this.st.dirty = true;
      this.st.save?.();
      this.ui.tutor?.hide('step');
      this.untaught();
      const g = d.grade?.g || 'C';
      this.pushIn = true; // the reveal pushes in slowly on your pick
      this.later(1.2, () => {
        this.say(g === 'S' || g === 'A' ? 'Now <b>that</b> is a pick. I\'d trade you mine for it, if mine didn\'t know my paws.' : g === 'B' || g === 'C' ? 'Good honest pick. It\'ll bite.' : 'It\'s pick-ish. It\'ll dig.', g === 'F' || g === 'D' ? 'laugh' : 'proud', { dur: 6 });
        this.star?.rig?.play?.(g === 'F' || g === 'D' ? 'laugh' : 'cheer');
      });
      this.later(5.0, () => this.say('On your belt. Home.', 'happy', { key: 'step', dur: 3 }));
      this.stage = 'leave';
      return;
    }
    if (name === 'melt') {
      const a = d.acc;
      if (a >= 0.9) this.say('A <b>perfect</b> melt. You\'ve done this before.', 'laugh', { dur: 4 });
      else if (a >= 0.6) this.say('Good melt.', 'happy', { dur: 4 });
      else this.say('Lumpy, but it\'ll pour.', 'calm', { dur: 4 });
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
      // (he shows it: src/home/starDemo.js; one word from him on the hammering, where to hit)
      this.stepPrompt(d.step, run);
      if (d.step === 'hammer' && !this.cool.hammerIntro) { this.cool.hammerIntro = this.t; this.later(3.4, () => this.say('Hit the fat bits.', 'happy', { key: 'step', dur: 3 })); }
      void k;
      return;
    }
    if (name === 'strike') {
      this.strikes = (this.strikes || 0) + 1;
      const ev = d.ev;
      if (ev.crack) this.remark('crack', 'Crack. That\'s cold metal. <b>Back in the fire</b>.', 'stern', 8);
      else if (ev.kind === 'cold') this.remark('cold', 'Too cold. You\'re just denting it.', 'stern', 7);
      else if (ev.kind === 'burn') this.remark('burn', 'It\'s <b>burning</b>. Out, quick!', 'worried', 6);
      else if (d.gain > 0.035) this.remark('good', pick(['Good.', 'There.', 'You\'ve the wrist for it.', 'Lovely. Again.']), 'happy', 7);
      else if (d.gain < -0.03) this.remark('bad', pick(['Easy. Wrong spot.', 'Too thin there. Watch the outline.']), 'worried', 7);
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
        : g === 'A' ? ['A <b>masterwork</b>. First go. Don\'t tell anyone.', 'proud']
          : g === 'B' ? ['That\'s a <b>fine</b> blade. It\'ll sell.', 'proud']
            : g === 'C' ? ['A <b>sturdy</b> little dagger. Every smith\'s first. Mine was worse.', 'happy']
              : ['Pointy at one end. Mine looked like a spoon.', 'laugh'];
      this.ui.tutor?.hide('step');
      this.untaught();
      this.pushIn = true;
      this.later(1.4, () => {
        this.say(line[0], line[1], { dur: 6 });
        this.star?.rig?.play?.(g === 'F' || g === 'D' ? 'laugh' : 'cheer');
      });
      this.later(4.4, () => {
        this.say('Yours. Now we <b>cook</b>.', 'happy', { key: 'step', dur: 3 });
        this.stage = 'leave';
      });
    }
  }

  /** He shows a forging step the first time it comes up (heat, hammer, grind, balance, quench), and you copy him. */
  stepPrompt(step, run) {
    const seen = (this.taught ||= new Set());
    if (seen.has(step)) return;
    seen.add(step);
    void run;
    if (step === 'heat') this.show('pump', 'Hold to pump');
    else if (step === 'hammer') this.show('hammer', 'Hold, then let go', 3.2);
    else if (step === 'grind') this.show('grind', 'Hold it steady');
    else if (step === 'balance') this.show('balance', 'Drag till level');
    else if (step === 'quench') this.show('quench', 'Q to plunge');
  }

  /** The pick lesson: he shows each forging step (heat, hammer, quench) as it comes up. */
  pickStep(step, run) {
    const seen = (this.taught ||= new Set());
    void run;
    if (step === 'heat') {
      if (seen.has('p-heat')) { this.remark('reheat', 'Back in the coals. Pump.', 'calm', 10); return; }
      seen.add('p-heat');
      this.show('pump', 'Hold to pump');
    } else if (step === 'hammer') {
      if (seen.has('p-hammer')) return;
      seen.add('p-hammer');
      this.show('hammer', 'Let go in green', 3.2);
    } else if (step === 'quench') {
      if (seen.has('p-quench')) return;
      seen.add('p-quench');
      this.show('quench', 'In it goes, hot');
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
    if (!skipLine) this.say('An ingot. Now a <b>dagger</b>.', 'proud', { key: 'step', dur: 4 });
    this.gesture('point', 1.6);
    this.cue('Forge a dagger');
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    this.t += dt;
    const sc = this.sc, a = sc.activity;
    if (this.cine && a) this.endCine();
    // banked coals: a dull glow till he works the bellows
    if (this.banked && sc.fire) { sc.fire.glow = Math.min(sc.fire.glow, 0.12); sc.fire.air = 0; }
    // the reveal of what you made: the view creeps in on it
    const v = sc.view;
    if (this.pushIn && v?.mode === 'dock' && v.name === 'reveal' && v.t >= 1 && v.to) {
      v.to.fov0 ??= v.to.fov;
      v.to.fov = Math.max(v.to.fov0 * 0.8, v.to.fov - dt * 1.6);
    }
    if (this.timers?.length) {
      const due = this.timers.filter((x) => x.t <= this.t);
      if (due.length) { this.timers = this.timers.filter((x) => x.t > this.t); for (const x of due) { try { x.fn(); } catch (e) { console.warn(e); } } }
    }
    // Old Star: walks round to the work you're at, looks at you, shows you the step
    const r = this.star?.rig;
    if (r) {
      this.follow(dt);
      const cam = sc.camera.position;
      const p = this.star.pos;
      if (typeof r.look === 'function') r.look(0, Math.atan2(cam.y - 0.6, Math.max(0.4, Math.hypot(cam.x - p.x, cam.z - p.z))) * 0.6);
      if (!this.star.walking) r.face(Math.atan2(cam.x - p.x, cam.z - p.z));
      if (this.gestT > 0 && (this.gestT -= dt) <= 0 && !this.star.walking) r.play?.('idle');
      const pd = this.pendingDemo;
      if (pd && (pd.t -= dt) <= 0 && !this.star.walking) { this.pendingDemo = null; this.demo?.play(pd.kind, pd.secs); }
      r.update(dt);
      this.demo?.apply(dt);
    }
    if (this.stage === 'smeltMenu' && a && a.r) {
      this.stage = 'smelt';
      this.said = 0;
      this.show('pump', 'Hold in the band');
    }
    if (this.stage === 'smelt' && a && a.sim && a.r) {
      const sim = a.sim;
      if (sim.overheat) this.remark('slag', 'Too hot. Let go, you\'re making slag.', 'worried', 5);
      else if (sim.inBandNow && !this.cool.inBand) { this.cool.inBand = this.t; this.say('There! Hold it.', 'happy', { key: 'remark', dur: 4 }); }
      else if (sim.started && !sim.inBandNow && sim.T < sim.band[0] - 120 && !sc.fire.pumping && a.elapsed > 4) this.remark('pump', 'Long, steady pulls. The fire wants air.', 'stern', 7);
    }
    if (this.stage === 'smelted' && !a && sc.menus.mode !== 'plan') this.toForging();
    if (this.stage === 'forge' && a && a.step === 'heat' && a.sim) {
      const T = a.sim.meanT(), w = a.sim.workRange;
      if (T >= w[0] && !this.cool.workHot) {
        this.cool.workHot = this.t;
        this.say('<b>Working heat!</b> Anvil!', 'happy', { key: 'remark', dur: 4 });
        if (!(this.taught ||= new Set()).has('anvil')) { this.taught.add('anvil'); this.gesture('point', 1.4); this.cue('E to the anvil'); }
      }
      if (T < w[0] - 60) this.cool.workHot = undefined;
    }
    if (this.stage === 'forge' && a && a.step === 'hammer' && a.sim) {
      const T = a.sim.meanT(), w = a.sim.workRange;
      if (T < w[0] - 40) this.remark('cooling', 'Cooling off. Back in the coals.', 'calm', 9);
    }
    if (this.stage === 'leave' && !a) {
      this.stage = 'gone';
      this.later(2.2, () => { if (!sc.leaving) sc.leave(); });
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
