// Coop parts at the home forge (data/coopParts.js): take the ingots, heat the bar in the coals
// into its working band, hammer it on the anvil with timed blows (the rune ring: let go in the
// green, the gold for a perfect blow) until it has taken `strikes` good blows, reheating when
// it cools (blows on cold metal crack it), quench the hard metals in the barrel, and you get
// the part (quality = how well it was made, a little of the ingots' quality) to carry to
// Nugget's coop and install there. The voxel model (partModel.js) morphs from the hot bar into
// the part with every blow.
//
//   partStatus(state, id) → { ok, why, done, next, installed, ins: [{id, n, have}], hot, carrying }
//   new PartRun(scene, id) → an activity (start, update, onEscape, dispose, touchAction, framePoints)
import * as THREE from 'three';
import { el, clamp, lerp } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { METALS, FORGE_MAX_TEMP, gradeFor } from '../data/weapons.js';
import { COOP_PARTS, partFor, pieceOf } from '../data/coopParts.js';
import { COOP_UP, coopLevels } from '../core/weight.js';
import { iconURL } from '../gfx/PixelArt.js';
import { qColor } from '../ui/UI.js';
import { fireIdleFor, widen, quenchResult, AMBIENT } from './bladeSim.js';
import { glowAmount } from './blackbody.js';
import { Thermo, Steps, StrikeMeter, bar, setText, setHtml, confirmText, certificate } from './ui.js';
import { Seq, ease, arcPoint } from './fx.js';
import { PartView } from './partModel.js';

const REST = 0.4; // hammer held up over the work
const WIND = 1.35; // fully raised
const SWING_T = 0.085; // release → contact
const ENERGY = 0.3; // per blow (÷ the Stamina skill)
const COOL = 0.05; // off the fire the metal sheds this share of its heat above the room each second
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _white = new THREE.Color(0xfff6ee);

/** Everything the parts list shows about one part, for the current save. */
export function partStatus(st, id) {
  const p = pieceOf(id);
  const m = METALS[p.metal];
  const lvl = st.data.forgeLevel || 0, maxT = FORGE_MAX_TEMP[lvl] ?? FORGE_MAX_TEMP[0];
  const installed = p.gives ? (st.owns(p.gives) ? 1 : 0) : coopLevels(st)[p.track] || 0; // a forge piece (your first pick): made once
  const ins = [...Object.entries(p.ingots || {}), ...Object.entries(p.extra || {})].map(([iid, n]) => ({ id: iid, n, have: st.count(iid) }));
  const hot = m.work[0] > maxT;
  const done = p.level <= installed;
  const next = p.level === installed + 1;
  let why = null;
  if (!done) {
    if (!next) {
      const want = partFor(p.track, installed + 1);
      why = `Install the ${COOP_PARTS[want]?.name || 'part before it'} first.`;
    } else if (hot) why = `Works at ${m.work[0]}°C+. Your hearth tops out at ${maxT}°C: it needs an upgrade from Inkwell Plans.`;
    else {
      const miss = ins.find((x) => x.have < x.n);
      if (miss) why = `Need ${miss.n} ${ITEMS[miss.id]?.name || miss.id} (you have ${miss.have}).`;
    }
  }
  const maxLevel = (COOP_UP[p.track]?.levels.length || 1) - 1;
  return { id, p, m, ins, installed, maxLevel, done, next, hot, why, ok: !done && next && !why, carrying: st.count(id), maxT };
}

/** The bar's heat and how the work went (kept free of three.js). */
class PartSim {
  constructor(part, level, skill) {
    const m = METALS[part.metal];
    this.m = m;
    this.skill = Math.max(1, skill || 1);
    this.workRange = widen(m.work, this.skill, AMBIENT + 60, m.burn - 10);
    this.quenchRange = m.quench ? widen(m.quench, this.skill, AMBIENT + 60, m.burn - 10) : null;
    this.maxT = FORGE_MAX_TEMP[level] ?? FORGE_MAX_TEMP[0];
    this.T = AMBIENT;
    this.need = part.strikes;
    this.good = 0; // blows of shaping done (soft / hard blows count part of one)
    this.blows = [];
    this.coldBlows = 0;
    this.cracks = 0;
    this.burnt = 0; // percentage points off the heat score
    this.heats = 0;
  }
  get progress() { return clamp(this.good / this.need, 0, 1); }
  accuracy() { return this.progress; }
  meanT() { return this.T; }
  zone(T = this.T) {
    const [w0, w1] = this.workRange;
    if (T > this.m.burn) return 'burn';
    if (T > w1) return 'hot';
    if (T >= w0) return 'work';
    return 'cold';
  }
  /** Heat in the coals (air 0..1 from the bellows) or cool off them. Returns how far over the burn line. */
  heatStep(dt, inFire, air, onAnvil = false) {
    const m = this.m;
    if (inFire) {
      const idle = fireIdleFor(m, this.maxT);
      const fireT = idle + (this.maxT - idle) * air;
      this.T += (fireT - this.T) * (0.09 + 0.13 * air) * m.heat * 1.3 * dt;
      this.T = Math.min(this.T, this.maxT);
    } else this.T -= (this.T - AMBIENT) * COOL * (onAnvil ? 1.15 : 1) * dt;
    const over = this.T - m.burn;
    if (over > 0 && inFire) this.burnt += dt * 3 * Math.min(2, over / 100 + 0.3);
    return over;
  }
  shapeScore() {
    let s = 0, w = 0;
    for (const b of this.blows) { s += b.q * b.gain; w += b.gain; }
    return w > 0 ? s / w : 0;
  }
  heatScore() { return clamp(1 - this.coldBlows * 0.06 - this.cracks * 0.1 - this.burnt / 100, 0, 1); }
}

export class PartRun {
  constructor(scene, id) {
    this.scene = scene;
    this.game = scene.game;
    this.st = scene.game.state;
    this.id = id;
    this.part = pieceOf(id);
    this.m = METALS[this.part.metal];
    this.level = this.st.data.forgeLevel || 0;
    this.maxT = FORGE_MAX_TEMP[this.level] ?? FORGE_MAX_TEMP[0];
    this.ok = !!this.part && partStatus(this.st, id).ok;
    this.seq = new Seq();
    this.time = 0;
    this.stepT = 0;
    this.nodes = [];
    this.step = 'none';
    this.done = [];
    this.scores = {};
    this.lastPop = {};
    this.theta = REST;
  }

  // ================================================================ lifecycle
  start() {
    const st = this.st, sc = this.scene, p = this.part;
    // the ingots (best first) and any extras
    this.taken = [];
    for (const [iid, n] of [...Object.entries(p.ingots || {}), ...Object.entries(p.extra || {})]) {
      const got = st.removeItem(iid, n);
      if (Array.isArray(got)) for (const l of got) this.taken.push({ id: iid, q: l.q, p: l.p, n: 1 });
      else if (got) this.taken.push({ id: iid, n: got });
    }
    const qs = this.taken.filter((t) => typeof t.q === 'number' && ITEMS[t.id]?.cat === 'ingot');
    this.matQ = qs.length ? Math.round(qs.reduce((s, t) => s + t.q, 0) / qs.length) : 80;
    this.skill = st.skill?.('forge') || 1;
    this.sim = new PartSim(p, this.level, this.skill);
    this.view = new PartView(this.id);
    sc.scene.add(this.view.group);
    sc.tool('smith'); // tongs in the left paw, the hammer in the right
    const fp = this.firePose();
    this.view.group.position.copy(fp.pos);
    this.view.group.rotation.copy(fp.rot);
    this.buildUI();
    this.game.audio.play('place');
    this.newZone();
    this.go('heat');
  }

  /** Put the ingots back (abandoned or interrupted). */
  refund() {
    if (this.refunded || this.finished || !this.taken) return;
    this.refunded = true;
    for (const t of this.taken) this.st.addItem(t.id, typeof t.q === 'number' ? { spill: true, q: t.q, p: t.p } : { spill: true, n: t.n });
  }

  onEscape() {
    if (this.step === 'result') { if (!this.busy) this.scene.endActivity('parts'); return true; }
    if (this.busy || this.asking) return true;
    this.asking = true;
    this.game.ui.confirm(confirmText('Leave this part?', 'The metal goes back into your bag as ingots.'), 'Leave it', 'Keep working').then((yes) => {
      this.asking = false;
      if (!yes || this.finished) return;
      this.refund();
      this.scene.endActivity('parts');
    });
    return true;
  }

  dispose() {
    const sc = this.scene;
    if (!this.finished) this.refund();
    for (const n of this.nodes) n.remove();
    this.thermo?.remove();
    this.meter?.el.remove();
    if (this.view) { sc.scene.remove(this.view.group); this.view.dispose(); }
    if (this.halo) { sc.scene.remove(this.halo); this.halo.material.map?.dispose(); this.halo.material.dispose(); }
    sc.extraLight = 0;
    if (this.savedPost) Object.assign(sc.post, this.savedPost);
    if (this.savedHemi) { sc.W.hemi.color.setHex(this.savedHemi.sky); sc.W.hemi.intensity = this.savedHemi.i; }
    sc.pumpAllowed = false;
    sc.workSrc = null;
    sc.displayLight = null;
    sc.paws.heat = 0;
    sc.freezeLook = false;
    this.game.ui.setHints(null);
  }

  // ================================================================ UI
  buildUI() {
    const sc = this.scene, p = this.part;
    const steps = [{ id: 'heat', label: 'Heat' }, { id: 'hammer', label: 'Shape' }];
    if (p.quench) steps.push({ id: 'quench', label: 'Quench' });
    steps.push({ id: 'result', label: 'Done' });
    this.title = el('h2', {}, p.name);
    this.stats = el('div', { class: 'fg-col', style: { gap: 'calc(var(--px) * 1.5)' } });
    this.status = el('div', { class: 'fg-note' });
    this.panel = el('div', { class: 'fg-side act fg-col' }, [
      el('div', { class: 'fg-kicker' }, `Coop part · ${COOP_UP[p.track]?.name || p.track} ${p.level}`),
      this.title,
    ]);
    this.steps = new Steps(this.panel, steps);
    this.panel.append(this.stats, this.status);
    sc.layer.append(this.panel);
    this.nodes.push(this.panel);
    const row = (label, cls) => { const b = bar(cls); const v = el('b'); const r = el('div', { class: 'fg-stat' }, [el('span', {}, label), v, b.el]); this.stats.append(r); return { row: r, bar: b, val: v }; };
    this.rShape = row('Shape', '');
    this.rCraft = row('Blows', '');
    this.rHeat = row('Heat', '');
    this.rQuench = row('Quench', 'cool');
    this.rQuench.row.hidden = true;
    this.actions = el('div', { class: 'fg-actions' });
    sc.layer.append(this.actions);
    this.nodes.push(this.actions);
    this.thermo = new Thermo(sc.layer, this.maxT);
    this.thermo.setTitle(this.m.name);
    this.setThermoMarks(false);
    this.meter = new StrikeMeter(sc.layer);
  }

  setThermoMarks(quench) {
    const m = this.m, sim = this.sim;
    const marks = [];
    if (quench && sim.quenchRange) marks.push({ kind: 'quench', range: sim.quenchRange, label: 'quench' });
    else marks.push({ kind: 'work', range: sim.workRange, label: 'work' });
    marks.push({ kind: 'burn', at: m.burn, label: 'burn' });
    if (m.burn < this.maxT - 60) marks.push({ kind: 'max', at: this.maxT, label: 'max' });
    this.thermo.setMarks(marks);
  }

  /** actions: [{label, key, keyLabel, fn, alt}] */
  setActions(list) {
    this.actions.innerHTML = '';
    this.actionKeys = {};
    for (const a of list) {
      const b = el('button', { class: 'btn' + (a.alt ? ' alt' : ''), onclick: () => { this.game.audio.play('ui_click'); a.fn(); } }, [a.label, a.keyLabel ? el('kbd', {}, a.keyLabel) : null]);
      this.actions.append(b);
      if (a.key) for (const k of [].concat(a.key)) this.actionKeys[k] = a.fn;
    }
  }

  pollActionKeys() {
    if (!this.actionKeys || this.busy) return;
    const inp = this.game.input;
    for (const [k, fn] of Object.entries(this.actionKeys)) if (inp.pressed(k)) { inp.consume(k); fn(); return; }
  }

  updateUI() {
    const sim = this.sim;
    const k = sim.progress;
    this.rShape.bar.set(k, k >= 1 ? '' : 'warm');
    setText(this.rShape.val, `${Math.floor(sim.good + 1e-6)} / ${sim.need} blows`);
    const c = sim.blows.length ? sim.shapeScore() : 1;
    this.rCraft.bar.set(c, c > 0.85 ? '' : c > 0.6 ? 'warm' : 'bad');
    setText(this.rCraft.val, sim.blows.length ? Math.round(c * 100) + '%' : '-');
    const h = sim.heatScore();
    this.rHeat.bar.set(h, h > 0.85 ? '' : h > 0.6 ? 'warm' : 'bad');
    const why = sim.cracks ? `${sim.cracks} crack${sim.cracks > 1 ? 's' : ''}` : sim.burnt > 1 ? 'burnt' : sim.coldBlows ? 'cold blows' : '';
    setText(this.rHeat.val, Math.round(h * 100) + '%' + (why ? ' · ' + why : ''));
    if (this.scores.quench !== undefined) { this.rQuench.row.hidden = false; this.rQuench.bar.set(this.scores.quench); setText(this.rQuench.val, Math.round(this.scores.quench * 100) + '%'); }
    this.steps.set([this.step], this.done);
  }

  setStatus(html) { setHtml(this.status, html); }

  popOnce(key, text, pos, color, size = 1, gap = 1.6) {
    if (this.lastPop[key] && this.time - this.lastPop[key] < gap) return;
    this.lastPop[key] = this.time;
    this.scene.pop(text, pos, color, size);
  }

  // ================================================================ placement
  firePose() {
    const fp = this.scene.W.firePos;
    return { pos: fp.clone().add(_v2.set(0, 0.004, 0.03)), rot: new THREE.Euler(0, Math.PI / 2, 0) };
  }

  anvilPose() {
    const af = this.scene.W.anvilFace;
    return { pos: af.clone().add(_v2.set(0, 0.001, 0)), rot: new THREE.Euler(0, -Math.PI / 2, 0) };
  }

  /** Held up over the hearth, cooling in the air (the quench). */
  holdPose() {
    const fp = this.scene.W.firePos;
    return { pos: fp.clone().add(_v2.set(0.14, 0.19, 0.24)), rot: new THREE.Euler(0.65, 0.25, 0) };
  }

  /** What the view keeps in frame at a station (ForgeScene.dockPose). */
  framePoints(name) {
    if (name === 'anvil' && this.view) {
      const p = this.anvilPose().pos, ax = this.scene.W.anvilAxis, e = this.view.extent;
      const L = Math.max(e.x, 0.09);
      return [p.clone().addScaledVector(ax, -L - 0.04), p.clone().addScaledVector(ax, L + 0.02), p.clone().add(_v2.set(0, Math.min(0.16, e.y), 0))];
    }
    return [];
  }

  /** The tongs' bite (world). */
  gripWorld(out = new THREE.Vector3()) {
    const g = this.view.group;
    g.updateMatrixWorld(true);
    return g.localToWorld(this.view.gripLocal(out));
  }

  /** Where the next blow lands (world). */
  spotWorld(out = new THREE.Vector3()) {
    const g = this.view.group;
    g.updateMatrixWorld(true);
    return g.localToWorld(out.copy(this.spot || _v2.set(0, 0.02, 0)));
  }

  center(out = new THREE.Vector3()) {
    const g = this.view.group;
    g.updateMatrixWorld(true);
    return g.localToWorld(out.set(0, Math.min(0.05, this.view.extent.y * 0.4), 0));
  }

  moveObj(obj, to, dur = 0.7, lift = 0.3, then = null) {
    const p0 = obj.position.clone(), q0 = obj.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(to.rot);
    this.moving = true;
    this.seq.add(dur, (k) => {
      const e = ease.inOut(k);
      arcPoint(p0, to.pos, lift, e, obj.position);
      obj.quaternion.slerpQuaternions(q0, q1, e);
    }).call(() => { this.moving = false; if (then) then(); });
  }

  /** The touch screen's big button. */
  touchAction() {
    if (this.busy) return null;
    if (this.step === 'heat' || (this.step === 'quench' && this.inFire)) return { kind: 'pump', label: 'Pump' };
    if (this.step === 'hammer') return { kind: 'strike', label: 'Hold · let go in the green' };
    return null;
  }

  workLight(pos = null) {
    const sc = this.scene;
    sc.workSrc = { pos: pos || this.center(), T: this.sim.T };
    sc.paws.heat = Math.min(0.85, glowAmount(this.sim.T) * 0.55);
  }

  // ================================================================ steps
  go(step) {
    const prev = this.step;
    if (prev !== step && prev !== 'none' && !this.done.includes(prev) && !(prev === 'heat' && step === 'hammer') && !(prev === 'hammer' && step === 'heat')) this.done.push(prev);
    this.step = step;
    this.stepT = 0;
    this.meter.hide();
    this.view.showMarker(null);
    const fn = this['enter_' + step];
    if (fn) fn.call(this);
    this.scene.lesson?.event?.('pstep', { step, run: this });
  }

  // ---------------------------------------------------------------- heat
  enter_heat() {
    const sc = this.scene;
    sc.dock('hearth');
    sc.paws.set('R', { mode: 'pull' });
    sc.paws.set('L', { mode: 'tongs', at: () => this.gripWorld() });
    sc.paws.jaw = 0;
    sc.pumpAllowed = true;
    this.sim.heats++;
    this.setThermoMarks(false);
    this.thermo.el.hidden = false;
    this.setActions([{ label: 'To the anvil ', keyLabel: 'E', key: ['KeyE'], fn: () => this.toAnvil() }]);
    this.game.ui.setHints('<span class="fg-nolig">Hold the mouse or <kbd>Space</kbd>: pump the bellows<br><kbd>E</kbd> carry it to the anvil · <kbd>Esc</kbd> stop</span>');
  }

  update_heat(dt) {
    const sc = this.scene, sim = this.sim;
    const over = sim.heatStep(dt, !this.moving, sc.fire.air);
    this.workLight();
    this.thermo.set(sim.T, dt);
    const [w0, w1] = sim.workRange;
    if (sim.T >= w0 && !this.wasWorkHot) { this.wasWorkHot = true; this.game.audio.play('glow'); this.popOnce('workheat', 'Working heat', this.center().add(_v.set(0, 0.1, 0)), '#ffd34a', 0.8, 4); }
    if (sim.T < w0 - 30) this.wasWorkHot = false;
    if (over > 0) {
      const P = sc.particles;
      if (Math.random() < dt * (6 + over / 20)) P.burnSpray(this.center(), 6);
      if (Math.random() < dt * 2) this.game.audio.play('sizzle');
      this.popOnce('burn', 'Burning!', this.center().add(_v.set(0, 0.18, 0)), '#ffffff', 0.9, 3);
      this.setStatus('<span class="fg-warn">It is burning! Out of the fire with it.</span>');
    } else if (sim.T > w1) this.setStatus('<span class="fg-warn">Hotter than it needs to be.</span>');
    else if (sim.T >= w0) this.setStatus('<span class="fg-good">Glowing at working heat: to the anvil!</span>');
    else if (this.m.work[1] < 400) this.setStatus(`${this.m.name} wants only a little heat: let the coals do it, don't pump.`);
    else if (sim.T > 450) this.setStatus('Starting to glow.');
    else this.setStatus('Sitting in the coals. Pump the bellows.');
  }

  toAnvil() {
    if (this.moving || this.step !== 'heat') return;
    this.game.audio.play('whoosh');
    this.moveObj(this.view.group, this.anvilPose(), 0.7, 0.14, () => this.game.audio.play('place'));
    this.go('hammer');
  }

  toFire() {
    if (this.moving || this.swing || this.charge || this.step !== 'hammer') return;
    this.game.audio.play('whoosh');
    this.moveObj(this.view.group, this.firePose(), 0.7, 0.14, () => { this.scene.puff(); this.game.audio.play('ignite'); });
    this.go('heat');
  }

  // ---------------------------------------------------------------- hammer
  /** A new timing zone on the rune ring for the next blow (narrower for the finer parts). */
  newZone() {
    const lv = this.part.level, k = Math.max(1, this.skill || 1);
    const w = clamp((0.25 - lv * 0.025) * k, 0.12, 0.42), pw = clamp(0.075 * k, 0.05, 0.16);
    const c = 0.5 + Math.random() * 0.26;
    this.zoneR = [clamp(c - w / 2, 0.2, 0.9), clamp(c + w / 2, 0.3, 0.94)];
    this.perfR = [c - pw / 2, c + pw / 2];
    this.rise = 0.92 - lv * 0.045;
    this.meter?.zone(this.zoneR, this.perfR);
  }

  enter_hammer() {
    const sc = this.scene;
    sc.dock('anvil', { dur: 0.75 });
    sc.pumpAllowed = false;
    this.charge = null;
    this.swing = null;
    sc.paws.set('L', { mode: 'tongs', at: () => this.gripWorld() });
    sc.paws.set('R', { mode: 'hammer', at: () => this.spotWorld(), theta: () => this.theta });
    sc.paws.jaw = 0;
    this.spotT = 0;
    this.setActions([{ label: 'Reheat ', keyLabel: 'E', key: ['KeyE'], fn: () => this.toFire(), alt: true }]);
    this.game.ui.setHints('<span class="fg-nolig">Hold the mouse or <kbd>Space</kbd> to raise the hammer,<br>let go when the runes reach the green (gold: perfect)<br><kbd>E</kbd> reheat in the coals · <kbd>Esc</kbd> stop</span>');
  }

  /** Energy a blow costs (the Stamina skill makes it less). */
  blowEnergy() { return ENERGY / Math.max(1, this.st.skill?.('stamina') || 1); }

  update_hammer(dt) {
    const sc = this.scene, sim = this.sim, inp = this.game.input;
    sim.heatStep(dt, false, 0, true);
    this.workLight();
    this.thermo.set(sim.T, dt);
    const ready = !this.moving && sc.docked && !this.shaped;
    // the spot the next blow shapes (the metal still moving from the last one keeps it updating)
    this.spotT -= dt;
    if (this.spotT <= 0 || !this.spot) { this.spotT = 0.12; this.spot = this.view.spotLocal(this.spot || new THREE.Vector3(), sim.progress, Math.min(1, sim.progress + 1 / sim.need)); }
    this.view.showMarker(ready && !this.swing ? this.spot : null);
    if (ready && !this.charge && !this.swing) {
      if (inp.mousePressed(0) || inp.pressed('Space')) {
        if (this.st.energy < this.blowEnergy()) {
          this.game.audio.play('oops');
          this.popOnce('tired', 'Too tired to swing', this.spotWorld(), '#ffb0a0', 0.8, 2);
          this.game.ui.toast('You are out of energy. Eat something (bag) or rest.', { kind: 'warn' });
        } else this.charge = { t: 0, src: inp.isDown('Space') ? 'key' : 'mouse', v: 0 };
      }
    }
    if (this.charge) {
      const c = this.charge;
      c.t += dt;
      c.v = clamp(c.t / this.rise, 0, 1);
      this.theta = lerp(REST, WIND, ease.out(c.v));
      const s = sc.toScreen(this.spotWorld(_v));
      const inZ = c.v >= this.zoneR[0] && c.v <= this.zoneR[1];
      this.meter.show(s.x, s.y - 34, c.v, c.v >= 0.99 ? 'too high!' : inZ ? (c.v >= this.perfR[0] && c.v <= this.perfR[1] ? 'NOW!' : 'now') : '');
      if (inZ && !c.chimed) { c.chimed = true; this.game.audio.play('click', { pitch: 1.6, vol: 0.5 }); }
      const released = c.src === 'mouse' ? !inp.mouseDown(0) : c.src === 'key' ? !inp.isDown('Space') : false;
      if (released) this.release();
    } else if (!this.swing && ready) {
      const s = sc.toScreen(this.spotWorld(_v));
      this.meter.show(s.x, s.y - 34, 0, '');
    }
    this.updateSwing(dt);
    const z = sim.zone();
    const left = sim.need - sim.good;
    const heat = z === 'cold' ? '<span class="fg-warn">too cold to shape: reheat it (E)</span>' : z === 'burn' ? '<span class="fg-warn">burning!</span>' : z === 'hot' ? 'very hot' : '<span class="fg-good">workable</span>';
    if (!this.shaped) this.setStatus(`${Math.ceil(left - 1e-6)} more blow${Math.ceil(left - 1e-6) === 1 ? '' : 's'} to shape it · ${heat}.`);
  }

  /** Let the blow go: the hammer comes down on the marked spot. */
  release() {
    const c = this.charge;
    if (!c) return;
    this.swing = { t: 0, from: this.theta, v: c.v, hit: false };
    this.charge = null;
    this.game.audio.play('whoosh');
  }

  updateSwing(dt) {
    const s = this.swing;
    if (s) {
      s.t += dt;
      if (s.t < SWING_T) this.theta = s.from * (1 - (s.t / SWING_T) ** 2);
      else {
        if (!s.hit) { s.hit = true; this.theta = 0; this.resolveBlow(s.v); }
        const r = (s.t - SWING_T) / 0.26;
        this.theta = Math.sin(Math.min(1, r) * Math.PI) * (0.1 + 0.16 * s.v) + (r > 0.6 ? (REST * (r - 0.6) / 0.4) : 0);
        if (r >= 1) { this.swing = null; this.theta = Math.min(REST, this.theta); }
      }
    } else if (!this.charge) this.theta += (REST - this.theta) * Math.min(1, dt * 7);
  }

  /** Test hook: a blow with the ring at v (0..1; default: the middle of the gold). */
  debugStrike(col, v) {
    if (this.step !== 'hammer' || this.swing || this.moving || this.shaped) return false;
    const val = typeof v === 'number' ? v : (this.perfR[0] + this.perfR[1]) / 2;
    this.theta = lerp(REST, WIND, ease.out(val));
    this.charge = { t: val * this.rise, src: 'debug', v: val };
    this.release();
    return true;
  }
  /** Test hook: hold the hammer up at v (until release()). */
  debugCharge(col, v = 0.6) {
    if (this.step !== 'hammer' || this.swing) return false;
    this.charge = { t: v * this.rise, src: 'hold', v };
    return true;
  }

  resolveBlow(v) {
    const sc = this.scene, st = this.st, sim = this.sim, P = sc.particles;
    const pos = this.spotWorld(new THREE.Vector3());
    const T = sim.T, zone = sim.zone();
    const kind = v >= this.perfR[0] && v <= this.perfR[1] ? 'perfect' : v >= this.zoneR[0] && v <= this.zoneR[1] ? 'good' : v < this.zoneR[0] ? 'soft' : 'hard';
    const power = 0.35 + v * 0.65;
    st.useEnergy(this.blowEnergy());
    st.learn?.('hammering');
    sc.rig.vm?.impact('hammer', 0.25 + power * 0.35);
    this.view.squash(0.4 + power * 0.6);
    this.view.dent(this.spot, kind === 'hard' ? 1.4 : 0.8);
    if (zone === 'cold') {
      // cold metal doesn't move: it rings, flakes and cracks
      sim.coldBlows++;
      const cold = clamp((sim.workRange[0] - T) / 250, 0.25, 1);
      this.game.audio.play('clunk', { vol: 0.6 + power * 0.6 });
      P.flakes(pos, 4 + Math.round(power * 6));
      sc.addShake(0.006 + power * 0.01);
      this.meter.flash('bad');
      if (v > 0.35 && Math.random() < v * cold * 0.65) {
        sim.cracks++;
        this.view.crack(this.spot);
        this.game.audio.play('crack');
        this.popOnce('crack', 'Crack!', pos.clone().add(_v.set(0, 0.08, 0)), '#ff7a5a', 1, 0.4);
      } else this.popOnce('cold', 'Too cold!', pos.clone().add(_v.set(0, 0.08, 0)), '#9ad0ff', 0.9, 1.2);
      this.newZone();
      return;
    }
    const gain = { perfect: 1, good: 1, soft: 0.4, hard: 0.6 }[kind];
    let q = { perfect: 1, good: 0.86, soft: 0.6, hard: 0.42 }[kind];
    if (zone === 'burn') { sim.burnt += 4; q *= 0.8; }
    sim.good = Math.min(sim.need, sim.good + gain);
    sim.blows.push({ kind, q, gain });
    sim.T += 4 + gain * 3; // working the metal warms it a touch
    this.view.setProgress(sim.progress);
    // the clang: pitch climbs as the part takes shape, sparks by the power
    this.game.audio.play('clang', { pitch: 0.82 + sim.progress * 0.35 + Math.random() * 0.05, vol: 0.5 + power * 0.6 });
    const white = zone === 'hot' || zone === 'burn';
    P.sparks(pos, 10 + Math.round(power * 26), power, white ? 0xffffff : 0xfff0b0);
    P.streaks(pos, 8 + Math.round(power * 22), power, white ? 0xffffff : 0xfff6d0);
    P.scaleFlakes(pos, 3 + Math.round(power * 6), 0.45);
    sc.addShake(0.01 + power * 0.03);
    sc.impact(pos, kind === 'perfect' ? 1 : power, T);
    sc.extraLight = 1.5 + power * 2.5;
    if (zone === 'burn') { P.burnSpray(pos, 22); this.game.audio.play('sizzle'); }
    const words = { perfect: ['Perfect!', '#ffd34a'], good: ['Good', '#8af07a'], soft: ['Too soft', '#e6dcc8'], hard: ['Too hard!', '#ff9a6a'] }[kind];
    this.popOnce('blow', words[0], pos.clone().add(_v.set(0, 0.07, 0)), words[1], kind === 'perfect' ? 1 : 0.8, 0.1);
    this.meter.flash(kind === 'perfect' ? 'perfect' : kind === 'good' ? 'good' : 'bad');
    if (kind === 'perfect') { this.game.audio.play('sparkle', { vol: 0.5 }); P.sparkle(pos, 0xffe08a, 8, 0.15, 0.25); }
    if (kind === 'hard') this.game.audio.play('crack', { vol: 0.35, pitch: 1.6 });
    this.newZone();
    if (sim.progress >= 1 - 1e-6) this.finishShaping();
  }

  finishShaping() {
    if (this.shaped) return;
    this.shaped = true;
    this.busy = true;
    const sc = this.scene;
    this.scores.shape = this.sim.shapeScore();
    this.setActions([]);
    this.game.ui.setHints(null);
    this.view.showMarker(null);
    this.meter.hide();
    this.seq.wait(0.45).call(() => {
      this.game.audio.play(this.scores.shape > 0.85 ? 'good' : 'ding');
      sc.pop('Shaped!', this.center().add(_v.set(0, 0.16, 0)), '#ffd34a', 1);
      sc.particles.sparkle(this.center(), 0xffe08a, 16, 0.2, 0.3);
      if (this.part.extra) this.view.setDone(true); // the lumite goes into the cage now
    }).wait(0.8).call(() => { this.busy = false; this.go(this.part.quench ? 'quench' : 'result'); });
  }

  // ---------------------------------------------------------------- quench
  enter_quench() {
    const sc = this.scene;
    this.thermo.el.hidden = false;
    this.setThermoMarks(true);
    sc.dock('hearth');
    sc.paws.jaw = 0;
    sc.paws.set('L', { mode: 'tongs', at: () => this.gripWorld() });
    sc.paws.set('R', { mode: 'pull' });
    sc.pumpAllowed = true;
    this.inFire = false;
    this.plunged = false;
    this.busy = true;
    this.moveObj(this.view.group, this.holdPose(), 0.85, 0.12, () => { this.busy = false; });
    this.setQuenchActions();
    this.game.ui.setHints('<span class="fg-nolig">Let it cool (or heat it) into the blue band<br><kbd>E</kbd> in/out of the fire · <kbd>Q</kbd> plunge it in the barrel</span>');
  }

  setQuenchActions() {
    this.setActions([
      { label: this.inFire ? 'Pull it out ' : 'Back in the fire ', keyLabel: 'E', key: ['KeyE'], fn: () => this.toggleQuenchFire(), alt: true },
      { label: 'Plunge! ', keyLabel: 'Q', key: ['KeyQ'], fn: () => this.plunge() },
    ]);
  }

  toggleQuenchFire() {
    if (this.busy || this.plunged) return;
    this.inFire = !this.inFire;
    this.busy = true;
    this.moveObj(this.view.group, this.inFire ? this.firePose() : this.holdPose(), 0.45, 0.06, () => { this.busy = false; if (this.inFire) this.game.audio.play('ignite'); });
    this.game.audio.play('whoosh');
    this.setQuenchActions();
  }

  update_quench(dt) {
    const sc = this.scene, sim = this.sim;
    if (!this.plunged) {
      const over = sim.heatStep(dt, this.inFire && !this.busy, sc.fire.air);
      if (over > 0 && this.inFire) { if (Math.random() < dt * 8) sc.particles.burnSpray(this.center(), 5); this.popOnce('qburn', 'Burning!', this.center().add(_v.set(0, 0.14, 0)), '#ffffff', 0.9, 3); }
      const [q0, q1] = sim.quenchRange;
      if (sim.T >= q0 && sim.T <= q1) { this.setStatus('<span class="fg-good">Right in the hardening window: plunge it (Q)!</span>'); if (!this.wasQ) { this.wasQ = true; this.game.audio.play('glow'); } }
      else if (sim.T > q1) { this.setStatus('Too hot to quench: let it cool a little.'); this.wasQ = false; }
      else { this.setStatus(this.inFire ? 'Heating it back up.' : '<span class="fg-warn">Too cold to harden: back in the fire (E).</span>'); this.wasQ = false; }
    }
    this.thermo.set(sim.T, dt);
    this.workLight();
  }

  /** debug.quench sets the temperature through this. */
  set weaponT(T) { this.sim.T = T; }
  get weaponT() { return this.sim.T; }

  plunge() {
    if (this.busy || this.plunged || this.step !== 'quench') return;
    const sc = this.scene, W = sc.W, P = sc.particles, g = this.view.group;
    this.plunged = true;
    this.busy = true;
    sc.pumpAllowed = false;
    sc.dock('barrel', { dur: 0.6 });
    sc.paws.set('R', { mode: 'low' });
    const Tp = this.sim.T;
    const res = quenchResult(this.m, Tp, this.skill);
    this.setActions([]);
    this.game.ui.setHints(null);
    const top = W.barrelTop.clone();
    const H = Math.max(0.06, this.view.extent.y);
    const above = { pos: top.clone().add(_v2.set(0.02, 0.1, 0)), rot: new THREE.Euler(0, 0, 0) };
    const dunk = { pos: top.clone().add(_v2.set(0.02, -H - 0.03, 0)), rot: new THREE.Euler(0, 0, 0) };
    this.game.audio.play('whoosh');
    this.moveObj(g, above, 0.7, 0.05);
    this.seq.add(0.2, (k) => { g.position.lerpVectors(above.pos, dunk.pos, ease.in(k)); })
      .call(() => {
        this.game.audio.play('quench');
        this.game.audio.play('steam');
        P.steam(top, 60, 0.28, 1.2);
        P.billow(top, 22, 0.28, 1.3);
        P.bubbles(top, 14, 0.25);
        W.water.splash(1.3);
        sc.waterEnergy = 1.2;
        sc.addShake(0.02);
        sc.post.flash = Math.max(sc.post.flash || 0, 0.14);
        sc.post.flashColor = 0xe8f2f4;
        this.st.learn?.('quenching');
        if (res.crack) { this.game.audio.play('crack'); this.view.crack(_v.set(0, 0.02, 0)); }
      })
      .add(1.1, (k, dt) => {
        this.sim.T = lerp(Tp, 60, ease.out(k));
        if (Math.random() < dt * 28) P.steam(top, 2, 0.22, 0.8);
        if (Math.random() < dt * 18) P.bubbles(top, 2, 0.22);
        g.position.x = dunk.pos.x + Math.sin(k * 30) * 0.004 * (1 - k);
      })
      .add(0.45, (k) => { g.position.lerpVectors(dunk.pos, above.pos, ease.out(k)); })
      .call(() => {
        this.scores.quench = res.score;
        const words = res.kind === 'good' ? (res.score > 0.95 ? ['Perfect temper!', '#ffd34a'] : ['Hardened!', '#8af07a']) : res.kind === 'hot' ? (res.crack ? ['Cracked!', '#ff7a5a'] : ['Too hot, brittle', '#ffb07a']) : ['Too cold, soft', '#9ad0ff'];
        sc.pop(words[0], top.clone().add(_v.set(0, 0.3, 0)), words[1], 1);
        this.game.audio.play(res.kind === 'good' ? 'good' : 'oops');
      })
      .wait(0.7)
      .call(() => { this.busy = false; this.go('result'); });
  }

  // ---------------------------------------------------------------- result
  enter_result() {
    const sc = this.scene, st = this.st, sim = this.sim, p = this.part;
    this.busy = true;
    sc.pumpAllowed = false;
    this.thermo.el.hidden = true;
    this.panel.hidden = true;
    this.setActions([]);
    this.game.ui.setHints(null);
    const shape = this.scores.shape ?? sim.shapeScore();
    const heat = sim.heatScore();
    const quench = p.quench ? (this.scores.quench ?? 0) : null;
    const craft = quench !== null ? shape * 0.55 + heat * 0.25 + quench * 0.2 : shape * 0.65 + heat * 0.35;
    let score = clamp(Math.round(100 * craft * (0.85 + 0.15 * this.matQ / 100)), 1, 100);
    if (typeof this.forceScore === 'number') score = clamp(Math.round(this.forceScore), 1, 100);
    this.score = score;
    const grade = gradeFor(score);
    this.grade = grade;
    const before = st.count(this.id);
    if (p.gives) {
      // a forge piece (your first pickaxe): it's a tool now, in your paw; how well you made it stays with it
      st.data.owned[p.gives] = 1;
      st.data.toolQ = { ...(st.data.toolQ || {}), [p.gives]: score };
      st.equip?.(p.gives);
      st.emit?.('items', { id: p.gives, n: 1 });
    } else st.addItem(this.id, { q: score, spill: true });
    this.finished = true;
    const carrying = st.count(this.id);
    this.toStash = !p.gives && carrying <= before;
    st.emit?.('act', { type: 'part', part: this.id, track: p.track, level: p.level, grade: grade.g, score }); // its own act: weapon quests count 'forge'
    this.game.ui.toast(`${p.gives ? '' : '+1 '}${p.name} <b style="color:${qColor(score)}">${score}%</b>${this.toStash ? ' · to the trunk at home' : p.gives ? ' · on your belt' : ''}`, { icon: iconURL(p.gives || this.id), kind: 'good' });
    this.scene.lesson?.event?.('piece', { id: this.id, score, grade, run: this });
    // the reveal: you hold it up in the tongs, turning it in the firelight
    sc.dock('reveal', { dur: 0.9 });
    sc.freezeLook = true;
    this.savedPost = { vignette: sc.post.vignette, brightness: sc.post.brightness };
    this.savedHemi = { sky: sc.W.hemi.color.getHex(), i: sc.W.hemi.intensity };
    const g = this.view.group;
    this.revealFrom = g.position.clone();
    this.revealFromQ = g.quaternion.clone();
    this.revealT = 0;
    const span = Math.max(this.view.extent.x, this.view.extent.z, this.view.finalH * 0.6);
    this.revealScale = clamp(0.085 / span, 0.6, 1.6);
    this.view.setDone(true);
    this.view.base = this.m.color;
    this.gradeCol = new THREE.Color(grade.color);
    this.halo = makeHalo(grade.color);
    this.halo.scale.setScalar(0.42);
    sc.scene.add(this.halo);
    sc.paws.jaw = 0;
    sc.paws.set('L', { mode: 'tongs', at: () => this.gripWorld() });
    sc.paws.set('R', { mode: 'low' });
    this.game.audio.play('whoosh');
    const later = (ms, fn) => setTimeout(() => { if (sc.game.scene === sc && sc.activity === this) fn(); }, ms);
    later(350, () => this.game.audio.play('fanfare'));
    later(1450, () => this.game.audio.play('success'));
    if (grade.g === 'S' || grade.g === 'A') later(900, () => sc.henReact('great'));
    else if (grade.g === 'F') later(900, () => sc.henReact('bad'));
    this.buildCard(grade, { shape, heat, quench });
  }

  buildCard(grade, s) {
    const sc = this.scene, p = this.part;
    const n = this.st.count(this.id);
    const rows = [{ label: 'Shape', v: s.shape }, { label: 'Heat', v: s.heat }];
    if (s.quench !== null) rows.push({ label: 'Quench', v: s.quench });
    const where = p.gives ? 'It\'s on your belt (slot 1). Swing it in the mine: how well you made it shows in every blow.'
      : this.toStash
        ? 'Your pack was full: it went to the <b>trunk at home</b>.'
        : `In your pack${n > 1 ? ` (${n})` : ''}. Install it on Nugget's coop: the coop side of your backpack (<kbd>I</kbd>), or <kbd>E</kbd> at the coop.`;
    const card = certificate({
      kicker: p.gives ? `Forged by your own paws · quality ${this.score}%` : `Forged for Nugget's coop · quality ${this.score}%`,
      title: p.name,
      grade,
      value: `<img class="pix" src="${iconURL(p.gives || this.id)}" alt=""><span style="font-size:.6em;color:var(--sepia)">${p.gives ? 'Pick power ' + (1.1 * (0.85 + 0.3 * this.score / 100)).toFixed(2) : `${COOP_UP[p.track]?.name || p.track} · level ${p.level}`}</span>`,
      note: `Ingots <b style="color:${qColor(this.matQ)}">${this.matQ}%</b> · ${where}`,
      rows,
      buttons: p.gives ? [{ label: 'To the mine!', key: 'Enter', fn: () => { this.game.audio.play('ui_click'); sc.leave(); } }] : [
        { label: 'More parts', key: 'Enter', fn: () => { this.game.audio.play('ui_click'); sc.endActivity('parts'); } },
        { label: 'Leave', alt: true, fn: () => sc.leave() },
      ],
    });
    sc.layer.append(card);
    this.nodes.push(card);
    this.card = card;
    this.seq.wait(0.8).call(() => { card.hidden = false; this.busy = false; this.game.audio.play('ui_open'); });
    const next = p.gives ? () => sc.leave() : () => sc.endActivity('parts');
    this.actionKeys = { Enter: next, NumpadEnter: next };
  }

  update_result(dt) {
    const sc = this.scene, P = sc.particles, cam = sc.camera, g = this.view.group;
    this.revealT += dt;
    const k = Math.min(1, this.revealT / 0.9);
    this.sim.T += (25 - this.sim.T) * Math.min(1, dt * 2);
    cam.updateMatrixWorld();
    const fwd = _v.set(0, 0, -1).transformDirection(cam.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).transformDirection(cam.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(cam.matrixWorld);
    const s = this.revealScale;
    const spot = cam.position.clone().addScaledVector(fwd, 0.36).addScaledVector(right, -0.03).addScaledVector(up, -0.05 - this.view.finalH * s * 0.4);
    // upright, facing you, turning slowly
    const yaw = Math.atan2(-fwd.x, -fwd.z) + Math.sin(this.time * 0.8) * 0.7 + 0.5;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, yaw, 0, 'YXZ'));
    arcPoint(this.revealFrom, spot, 0.06, ease.out(k), g.position);
    g.quaternion.slerpQuaternions(this.revealFromQ, q, ease.out(k));
    g.scale.setScalar(lerp(1, s, ease.out(k)));
    g.position.y += Math.sin(this.time * 1.6) * 0.003 * k;
    const mid = g.localToWorld(_v2.set(0, this.view.finalH * 0.5, 0));
    if (Math.random() < dt * 12) P.sparkle(mid, this.gradeCol.getHex(), 1, 0.12, 0.08);
    if (this.halo) {
      this.halo.position.copy(mid).addScaledVector(fwd, 0.25);
      this.halo.material.opacity = (0.4 + 0.1 * Math.sin(this.time * 2.4)) * k;
    }
    sc.post.vignette = lerp(this.savedPost.vignette ?? 0.38, 0.7, k);
    sc.W.hemi.color.setHex(this.savedHemi.sky).lerp(_white, 0.55 * k);
    sc.W.hemi.intensity = lerp(this.savedHemi.i, this.savedHemi.i * 1.3, k);
    sc.post.brightness = lerp(this.savedPost.brightness ?? 1, 0.95, k);
    sc.extraLight = 0.6 * k;
    sc.workSrc = null;
    sc.displayLight = { pos: cam.position.clone().addScaledVector(up, 0.25).addScaledVector(right, -0.2), color: 0xdce6ff, intensity: 0.9 * k };
  }

  // ================================================================ frame
  update(dt) {
    this.time += dt;
    this.stepT += dt;
    this.seq.update(dt);
    const fn = this['update_' + this.step];
    if (fn) fn.call(this, dt);
    if (this.view) {
      this.view.update(dt, this.sim.T, this.time);
      // the finished part shines a little in its grade's color
      if (this.step === 'result' && this.gradeCol) this.view.mat.emissive.add(_tmpC.copy(this.gradeCol).multiplyScalar((0.025 + 0.02 * Math.sin(this.time * 3)) * Math.min(1, this.revealT / 0.9)));
    }
    if (this.step !== 'result') this.updateUI();
    this.pollActionKeys();
  }
}

const _tmpC = new THREE.Color();

/** Soft round glow behind the revealed part (the post pass dithers it into pixels). */
function makeHalo(color) {
  const n = 64;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(color);
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  g.addColorStop(0, `rgba(${rgb},0.9)`);
  g.addColorStop(0.35, `rgba(${rgb},0.4)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const s = new THREE.Sprite(mat);
  s.renderOrder = -1;
  return s;
}
