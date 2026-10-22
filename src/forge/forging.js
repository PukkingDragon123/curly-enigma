// Forging a weapon: plan → heat ⇄ hammer → grind → balance → quench? → infusion? → result.
// The run owns the blade (simulation + 3D views), its HUD and the step machine.
import * as THREE from 'three';
import { el, clamp, lerp, formatGoldFull } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { METALS, WEAPON_TYPES, INFUSIONS, FORGE_MAX_TEMP, gradeFor } from '../data/weapons.js';
import { iconURL } from '../gfx/PixelArt.js';
import { COIN, qColor } from '../ui/UI.js';
import { BladeSim, balanceScore, balanceTolerance, quenchResult, fireIdleFor, AMBIENT } from './bladeSim.js';
import { BladeView, buildWeapon, COL } from './bladeView.js';
import { applyHeat, glowAmount } from './blackbody.js';
import { Thermo, Steps, StrikeMeter, bar, setText, setHtml, confirmText } from './ui.js';
import { Seq, ease, arcPoint, Lightning, INFUSION_FX } from './fx.js';
import { makeCrystal } from './models.js';
import { disposeTree } from './smelt.js';

// the right paw's hammer, as an angle about the elbow: 0 = the face on the metal
const REST = 0.4; // held up over the aimed spot, ready
const WIND = 1.35; // full wind-up: the wrist cocked, the head high over the work
const SWING_T = 0.085; // seconds from release to contact
const ENERGY_PER_STRIKE = 0.35;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const _white = new THREE.Color(0xfff6ee);

/** Soft round glow behind the revealed weapon (the post pass dithers it into pixels). */
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

const GEM_COLORS = { quartz: 0xf2f2f8, amber: 0xf2a32c, amber_bug: 0xf2a32c, amethyst: 0xa05ad9, ruby: 0xe02a3a, emerald: 0x2ad96a, sapphire: 0x2a5ae0, diamond: 0xd8f6ff };

export class ForgeRun {
  constructor(scene, sel) {
    this.scene = scene;
    this.game = scene.game;
    this.st = scene.game.state;
    this.sel = sel;
    const st = this.st;
    const wt = WEAPON_TYPES[sel.type], m = METALS[sel.metal];
    this.level = st.data.forgeLevel || 0;
    this.maxT = FORGE_MAX_TEMP[this.level];
    const inf = sel.infusion ? INFUSIONS[sel.infusion] : null;
    this.ok = !!(wt && m && st.owns('bp_' + sel.type) && st.count(m.ingot) >= wt.ingots && m.work[0] <= this.maxT
      && (!inf || (st.count(sel.infusion) > 0 && (!inf.needs || st.protects(inf.needs))))
      && (!sel.gem || st.count(sel.gem) > 0));
    this.wt = wt; this.m = m; this.inf = inf;
    this.seq = new Seq();
    this.time = 0;
    this.nodes = [];
    this.step = 'none';
    this.done = [];
    this.scores = {};
    this.lastPop = {};
  }

  // ================================================================ lifecycle
  start() {
    const st = this.st, sc = this.scene, sel = this.sel;
    this.lots = st.removeItem(this.m.ingot, this.wt.ingots);
    this.matQ = Math.round(this.lots.reduce((s, l) => s + l.q, 0) / Math.max(1, this.lots.length));
    this.infLot = sel.infusion ? st.removeItem(sel.infusion, 1)[0] : null;
    this.gemLot = sel.gem ? st.removeItem(sel.gem, 1)[0] : null;
    this.gemQ = this.gemLot ? this.gemLot.q : undefined;
    this.skill = st.skill?.('forge') || 1; // the Smithing skill widens the good windows
    this.sim = new BladeSim(sel.type, sel.metal, this.level, this.skill);
    this.view = new BladeView(this.sim);
    this.view.buildDots();
    this.view.setDotsVisible(false);
    sc.scene.add(this.view.group);
    this.theta = REST;
    sc.tool('smith'); // tongs in the left paw, the hammer in the right
    this.placeInFire(true);
    this.buildUI();
    this.game.audio.play('place');
    this.go('heat');
  }

  /** Put the ingots, infusion mineral and gem back (abandon / interrupted). */
  refund() {
    if (this.refunded || this.finished) return;
    this.refunded = true;
    const st = this.st;
    for (const l of this.lots || []) st.addItem(l.id, { q: l.q, p: l.p });
    if (this.infLot) st.addItem(this.infLot.id, { q: this.infLot.q, p: this.infLot.p });
    if (this.gemLot) st.addItem(this.gemLot.id, { q: this.gemLot.q, p: this.gemLot.p });
  }

  onEscape() {
    if (this.step === 'result') { this.scene.endActivity('main'); return true; }
    if (this.busy || this.step === 'grind') return true;
    this.game.ui.confirm(confirmText('Abandon this blade?', 'The metal goes back into your bag as ingots.'), 'Abandon', 'Keep forging').then((yes) => {
      if (!yes || this.finished) return;
      this.refund();
      this.scene.endActivity('plan');
    });
    return true;
  }

  dispose() {
    const sc = this.scene;
    if (!this.finished) this.refund();
    for (const n of this.nodes) n.remove();
    this.thermo?.remove();
    this.meter?.el.remove();
    this.grindLoop?.stop();
    if (this.view) { sc.scene.remove(this.view.group); this.view.dispose(); }
    if (this.carrier) { sc.scene.remove(this.carrier); disposeTree(this.carrier); }
    if (this.crystal) { sc.scene.remove(this.crystal.mesh); disposeTree(this.crystal.mesh); }
    this.lightning?.dispose();
    if (this.halo) { sc.scene.remove(this.halo); this.halo.material.map.dispose(); this.halo.material.dispose(); }
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
    const sc = this.scene;
    const steps = [{ id: 'heat', label: 'Heat' }, { id: 'hammer', label: 'Hammer' }, { id: 'balance', label: 'Balance' }];
    if (this.m.quench) steps.push({ id: 'quench', label: 'Quench' });
    if (this.inf) steps.push({ id: 'infuse', label: 'Infuse' });
    steps.push({ id: 'result', label: 'Done' });
    this.stepList = steps.map((s) => s.id);
    this.title = el('h2', {}, `${this.inf ? this.inf.name + ' ' : ''}${this.m.name} ${this.wt.name}`);
    this.stats = el('div', { class: 'fg-col', style: { gap: 'calc(var(--px) * 1.5)' } });
    this.status = el('div', { class: 'fg-note' });
    this.panel = el('div', { class: 'panel fg-side act fg-col' }, [el('div', { class: 'fg-kicker' }, 'Forging'), this.title]);
    this.steps = new Steps(this.panel, steps);
    this.panel.append(this.stats, this.status);
    sc.layer.append(this.panel);
    this.nodes.push(this.panel);
    // stat rows
    const row = (label, cls) => { const b = bar(cls); const v = el('b'); const r = el('div', { class: 'fg-stat' }, [el('span', {}, label), v, b.el]); this.stats.append(r); return { row: r, bar: b, val: v }; };
    this.rShape = row('Shape', '');
    this.rTemper = row('Temper', '');
    this.rBalance = row('Balance', '');
    this.rQuench = row('Quench', 'cool');
    this.rBalance.row.hidden = true;
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
    const m = this.m;
    const marks = [];
    if (quench && m.quench) marks.push({ kind: 'quench', range: this.sim?.quenchRange || m.quench, label: 'quench' });
    else marks.push({ kind: 'work', range: this.sim?.workRange || m.work, label: 'work' });
    marks.push({ kind: 'burn', at: m.burn, label: 'burn' });
    if (m.burn < this.maxT - 60) marks.push({ kind: 'max', at: this.maxT, label: 'max' });
    this.thermo.setMarks(marks);
  }

  /** actions: [{label, key, fn, alt}] */
  setActions(list) {
    this.actions.innerHTML = '';
    this.actionKeys = {};
    for (const a of list) {
      const b = el('button', { class: 'btn' + (a.alt ? ' alt' : '') + (a.big ? ' big' : ''), onclick: () => { this.game.audio.play('ui_click'); a.fn(); } }, [a.label, a.keyLabel ? el('kbd', {}, a.keyLabel) : null]);
      this.actions.append(b);
      if (a.key) for (const k of [].concat(a.key)) this.actionKeys[k] = a.fn;
    }
  }

  pollActionKeys() {
    if (!this.actionKeys || this.busy) return;
    const inp = this.game.input;
    for (const [k, fn] of Object.entries(this.actionKeys)) if (inp.pressed(k)) { inp.consume(k); fn(); return; }
  }

  updateUI(dt) {
    const sim = this.sim;
    const acc = this.scores.shape ?? sim.accuracy();
    this.rShape.bar.set(acc, acc > 0.85 ? '' : acc > 0.6 ? 'warm' : 'bad');
    setText(this.rShape.val, Math.round(acc * 100) + '%');
    const tmp = sim.temperScore();
    this.rTemper.bar.set(tmp, tmp > 0.85 ? '' : tmp > 0.6 ? 'warm' : 'bad');
    const why = sim.stress > 0.5 && sim.burnt > 0.5 ? 'stressed + burnt' : sim.stress > 0.5 ? 'stressed' : sim.burnt > 0.5 ? 'burnt' : '';
    setText(this.rTemper.val, Math.round(tmp * 100) + '%' + (why ? ' · ' + why : ''));
    if (this.scores.balance !== undefined) { this.rBalance.row.hidden = false; this.rBalance.bar.set(this.scores.balance); setText(this.rBalance.val, Math.round(this.scores.balance * 100) + '%'); }
    if (this.scores.quench !== undefined) { this.rQuench.row.hidden = false; this.rQuench.bar.set(this.scores.quench); setText(this.rQuench.val, Math.round(this.scores.quench * 100) + '%'); }
    const active = this.step === 'grind' ? ['hammer'] : [this.step];
    this.steps.set(active, this.done);
  }

  setStatus(html) { setHtml(this.status, html); }

  popOnce(key, text, pos, color, size = 1, gap = 1.6) {
    if (this.lastPop[key] && this.time - this.lastPop[key] < gap) return;
    this.lastPop[key] = this.time;
    this.scene.pop(text, pos, color, size);
  }

  // ================================================================ blade placement
  /** In the coals: the blade points from the smith into the fire (long ones lie across it). */
  firePose() {
    const fp = this.scene.W.firePos;
    const len = this.sim.length * COL;
    const yaw = Math.PI / 2 + clamp((len - 0.42) * 1.2, 0, 0.55);
    const dir = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)); // local +x (toward the tip)
    const pos = fp.clone().addScaledVector(dir, -(len * 0.5 + 0.04)).add(new THREE.Vector3(0, 0.006, 0));
    return { pos, rot: new THREE.Euler(0, yaw, -0.07) };
  }

  /** On the anvil's face: tang toward the horn (left in view), tip toward the heel. */
  anvilPose() {
    const W = this.scene.W, af = W.anvilFace;
    const pos = af.clone().addScaledVector(W.anvilAxis, -(this.sim.N * COL) / 2 - 0.012).add(new THREE.Vector3(0, 0.001, 0));
    return { pos, rot: new THREE.Euler(0, -Math.PI / 2, 0) };
  }

  placeInFire(instant = false) {
    const p = this.firePose();
    if (instant) { this.view.group.position.copy(p.pos); this.view.group.rotation.copy(p.rot); return; }
    this.moveObj(this.view.group, p, 0.7, 0.12);
  }

  /** The touch screen's big button: { kind: 'pump' | 'strike', label } or null. */
  touchAction() {
    if (this.busy && this.step !== 'infuse') return null;
    if (this.step === 'heat' || (this.step === 'quench' && !this.plunged && this.inFire)) return { kind: 'pump', label: 'Pump' };
    if (this.step === 'hammer') return { kind: 'strike', label: 'Hold · strike' };
    if (this.step === 'infuse' && this.infPhase === 'ring') return { kind: 'strike', label: 'Strike!' };
    return null;
  }

  /** What the view should keep in frame at a station (ForgeScene.dockPose). */
  framePoints(name) {
    if (name === 'anvil') {
      const p = this.anvilPose(), ax = this.scene.W.anvilAxis;
      const L = Math.max(this.sim.N, this.sim.length) * COL;
      return [p.pos.clone().addScaledVector(ax, -0.1), p.pos.clone().addScaledVector(ax, L + 0.02)];
    }
    if (name === 'bench' && this.bladeLen) {
      const ft = this.scene.W.fulcrumTop;
      return [ft.clone().add(_v2.set(-this.bladeLen * 0.6, 0, 0)), ft.clone().add(_v2.set(this.bladeLen * 0.6, 0, 0))];
    }
    return [];
  }

  /** The tongs' bite on the billet's tang (world). */
  tangWorld(out = new THREE.Vector3()) {
    this.view.group.updateMatrixWorld(true);
    return this.view.group.localToWorld(this.view.tangPoint(out));
  }

  /** The tongs' bite on the finished weapon: just under the guard (world). */
  hiltWorld(out = new THREE.Vector3()) {
    const g = this.weapon.group;
    g.updateMatrixWorld(true);
    return g.localToWorld(out.set(0, -this.weapon.hiltLength * 0.22, 0));
  }

  /** Arc an object to a pose {pos, rot} (or {pos, quat}). */
  moveObj(obj, to, dur = 0.7, lift = 0.35, then = null) {
    const p0 = obj.position.clone(), q0 = obj.quaternion.clone();
    const q1 = to.quat ? to.quat.clone() : new THREE.Quaternion().setFromEuler(to.rot);
    this.moving = true;
    this.seq.add(dur, (k) => {
      const e = ease.inOut(k);
      arcPoint(p0, to.pos, lift, e, obj.position);
      obj.quaternion.slerpQuaternions(q0, q1, e);
    }).call(() => { this.moving = false; if (then) then(); });
  }

  // ================================================================ steps
  go(step) {
    const prev = this.step;
    if (prev !== step && prev !== 'none' && !this.done.includes(prev) && !(prev === 'heat' && step === 'hammer') && !(prev === 'hammer' && step === 'heat')) this.done.push(prev);
    this.step = step;
    this.stepT = 0;
    this.meter.hide();
    const fn = this['enter_' + step];
    if (fn) fn.call(this);
    this.scene.lesson?.event('step', { step, run: this });
  }

  // ---------------------------------------------------------------- heat
  enter_heat() {
    const sc = this.scene;
    this.scene.allowMenus = false;
    sc.dock('hearth');
    sc.paws.set('R', { mode: 'pull' });
    sc.paws.set('L', { mode: 'tongs', at: () => this.tangWorld() });
    sc.paws.jaw = 0;
    sc.pumpAllowed = true;
    this.view.setDotsVisible(false);
    this.view.hover = -1;
    this.setThermoMarks(false);
    this.thermo.el.hidden = false;
    this.setActions([{ label: 'To the anvil ', keyLabel: 'E', key: ['KeyE'], fn: () => this.toAnvil() }]);
    this.game.ui.setHints('<span class="fg-nolig">Hold the mouse or <kbd>Space</kbd>: pump the bellows<br><kbd>E</kbd> carry it to the anvil · <kbd>Esc</kbd> abandon</span>');
  }

  update_heat(dt) {
    const sc = this.scene, sim = this.sim;
    const burning = sim.heatStep(dt, !this.moving, sc.fire.air);
    const T = sim.meanT();
    this.workLight(sim.maxTemp());
    this.thermo.set(T, dt);
    this.burnFx(burning, dt);
    const [w0, w1] = this.sim.workRange;
    if (T >= w0 && !this.wasWorkHot) { this.wasWorkHot = true; this.game.audio.play('glow'); this.popOnce('workheat', 'Working heat', this.bladeCenter(), '#ffd34a', 0.8, 4); }
    if (T < w0 - 30) this.wasWorkHot = false;
    if (burning > 0) this.setStatus('<span class="fg-warn">It is burning! Sparks are its grain giving way.</span>');
    else if (T > w1) this.setStatus('<span class="fg-warn">Hotter than it needs to be.</span>');
    else if (T >= w0) this.setStatus('<span class="fg-good">Glowing at working heat.</span>');
    else if (T > 450) this.setStatus('Starting to glow.');
    else this.setStatus('Sitting in the coals.');
  }

  burnFx(burning, dt) {
    if (burning <= 0) return;
    const P = this.scene.particles;
    if (Math.random() < dt * (6 + burning / 20)) P.burnSpray(this.bladeCenter(), 6);
    if (Math.random() < dt * 2) this.game.audio.play('sizzle');
    this.popOnce('burnfire', 'Burning!', this.bladeCenter().add(_v2.set(0, 0.2, 0)), '#ffffff', 0.9, 3);
  }

  bladeCenter() {
    return this.view.group.localToWorld(new THREE.Vector3(this.sim.length * COL * 0.5, 0.012, 0));
  }

  /** Hot metal lights the room and the paws; the tong bits glow with it. */
  workLight(T, pos = null) {
    const sc = this.scene;
    sc.workSrc = { pos: pos || this.bladeCenter(), T };
    sc.paws.heat = Math.min(0.85, glowAmount(T) * 0.55);
  }

  /** Energy a hammer blow costs (the Stamina skill makes it less). */
  strikeEnergy() { return ENERGY_PER_STRIKE / Math.max(1, this.st.skill?.('stamina') || 1); }

  toAnvil() {
    if (this.moving || this.step !== 'heat') return;
    this.game.audio.play('whoosh');
    this.moveObj(this.view.group, this.anvilPose(), 0.7, 0.14, () => this.game.audio.play('place'));
    this.go('hammer');
  }

  // ---------------------------------------------------------------- hammer
  enter_hammer() {
    const sc = this.scene;
    sc.dock('anvil', { dur: 0.75 });
    sc.pumpAllowed = false;
    this.view.setDotsVisible(true);
    this.selCol = this.selCol ?? Math.min(1, this.sim.w.length - 1);
    this.charge = null;
    this.swing = null;
    this.theta = this.theta ?? REST;
    sc.paws.set('L', { mode: 'tongs', at: () => this.tangWorld() });
    sc.paws.set('R', { mode: 'hammer', at: () => this.hammerAt(), theta: () => this.theta });
    sc.paws.jaw = 0;
    this.setActions([
      { label: 'Reheat ', keyLabel: 'E', key: ['KeyE'], fn: () => this.toFire(), alt: true },
      { label: 'Done shaping ', keyLabel: 'Enter', key: ['Enter', 'NumpadEnter'], fn: () => this.finishShaping() },
    ]);
    this.game.ui.setHints('<span class="fg-nolig">Point at a spot · hold the mouse to raise the hammer, let go to strike<br><kbd>A</kbd><kbd>D</kbd> move along · hold <kbd>Space</kbd> to strike<br><kbd>E</kbd> reheat in the coals · <kbd>Esc</kbd> abandon</span>');
  }

  /** Where the hammer face comes down: the top of the aimed column (world). */
  hammerAt(out = new THREE.Vector3()) {
    const col = this.swing ? this.swing.col : this.charge ? this.charge.col : this.selCol;
    this.view.group.updateMatrixWorld(true);
    return this.view.group.localToWorld(this.view.colTop(clamp(col, 0, this.sim.w.length - 1), out));
  }

  toFire() {
    if (this.moving || this.swing || this.charge) return;
    const lost = this.sim.scaleInFire();
    this.game.audio.play('whoosh');
    const p = this.firePose();
    this.moveObj(this.view.group, p, 0.7, 0.14, () => { this.scene.puff(); this.game.audio.play('ignite'); });
    if (lost > 0.01) this.popOnce('scale', 'scale flakes off', this.scene.W.firePos.clone().add(_v2.set(0, 0.2, 0)), '#c8b8a8', 0.6, 20);
    this.go('heat');
  }

  update_hammer(dt) {
    const sc = this.scene, sim = this.sim, view = this.view, inp = this.game.input;
    sim.heatStep(dt, false, 0);
    this.workLight(sim.maxTemp());
    const ready = !this.moving && sc.docked;
    // aim: the spot under the pointer (or A/D)
    let mouseCol = -1;
    if (ready && !this.charge && !this.swing) {
      const hit = sc.mouseOnPlane(view.group.position.y + view.maxTh, _v);
      if (hit) {
        const local = view.group.worldToLocal(_v.clone());
        mouseCol = view.pick(local.x, local.z);
        if (mouseCol >= 0 && inp.mouse.moved) this.selCol = mouseCol;
      }
      if (inp.pressed('KeyA', 'ArrowLeft')) this.selCol = Math.max(0, this.selCol - 1);
      if (inp.pressed('KeyD', 'ArrowRight')) this.selCol = Math.min(sim.length - 1, this.selCol + 1);
    }
    this.selCol = clamp(this.selCol, 0, sim.w.length - 1);
    view.hover = ready ? (this.charge ? this.charge.col : this.swing ? this.swing.col : this.selCol) : -1;
    // start a blow: anywhere on the view swings at the aimed spot
    if (ready && !this.charge && !this.swing) {
      let src = null, col = -1;
      if (inp.mousePressed(0)) { src = 'mouse'; col = mouseCol >= 0 ? mouseCol : this.selCol; }
      else if (inp.pressed('Space')) { src = 'key'; col = this.selCol; }
      if (src) {
        if (this.st.energy < this.strikeEnergy()) {
          this.game.audio.play('oops');
          this.popOnce('tired', 'Too tired to swing', this.colWorld(col), '#ffb0a0', 0.8, 2);
          this.game.ui.toast('You are out of energy. Eat something (bag) or rest.', { kind: 'warn' });
        } else {
          this.charge = { col, src, t: 0, power: 0 };
          this.selCol = col;
        }
      }
    }
    if (this.charge) {
      const c = this.charge;
      c.t += dt;
      const k = clamp(c.t / 0.9, 0, 1);
      c.power = Math.max(0.05, k * k * (3 - 2 * k));
      this.view.ghost(c.col, sim.predict(c.col, c.power));
      this.theta = lerp(REST, WIND, ease.out(c.power));
      const s = sc.toScreen(this.colWorld(c.col));
      this.meter.show(s.x, s.y - 30, c.power, c.power >= 0.99 ? 'full' : '');
      const released = c.src === 'mouse' ? !inp.mouseDown(0) : c.src === 'hold' ? false : !inp.isDown('Space');
      if (released) this.release();
    }
    this.updateSwing(dt);
    // readouts
    const show = view.hover >= 0 ? sim.T[view.hover] : sim.meanT();
    this.thermo.set(show, dt);
    const z = sim.zone(show);
    if (view.hover >= 0) {
      const d = sim.w[view.hover] - (sim.target[view.hover] ?? 0);
      const shape = d > 0.3 ? 'too thick here' : d < -0.3 ? 'too thin here' : 'on the line';
      const heat = z === 'cold' ? '<span class="fg-warn">too cold to move</span>' : z === 'burn' ? '<span class="fg-warn">burning</span>' : z === 'hot' ? 'very hot' : '<span class="fg-good">workable</span>';
      this.setStatus(`Spot ${view.hover + 1}: ${shape}, ${heat}.`);
    } else this.setStatus('On the anvil.');
  }

  /** Let the charged blow go: the hammer comes down on the aimed spot. */
  release() {
    const c = this.charge;
    if (!c) return;
    this.view.ghost(-1);
    this.swing = { t: 0, from: this.theta, col: c.col, power: c.power, hit: false };
    this.charge = null;
    this.meter.hide();
    this.game.audio.play('whoosh');
  }

  /** The swing: accelerate onto the metal, strike, bounce, settle back to ready. */
  updateSwing(dt) {
    const s = this.swing;
    if (s) {
      s.t += dt;
      if (s.t < SWING_T) this.theta = s.from * (1 - (s.t / SWING_T) ** 2);
      else {
        if (!s.hit) { s.hit = true; this.theta = 0; (s.onHit || ((col, p) => this.resolveStrike(col, p)))(s.col, s.power); }
        const r = (s.t - SWING_T) / 0.26;
        this.theta = Math.sin(Math.min(1, r) * Math.PI) * (0.1 + 0.16 * s.power) + (r > 0.6 ? (REST * (r - 0.6) / 0.4) : 0);
        if (r >= 1) { this.swing = null; this.theta = Math.min(REST, this.theta); }
      }
    } else if (!this.charge) this.theta += (REST - this.theta) * Math.min(1, dt * 7);
  }

  /** Test hook: aim at a column and hold the hammer up (charging) until debugRelease(). */
  debugCharge(col, t = 0.6) {
    if (this.step !== 'hammer' || this.swing) return false;
    this.selCol = clamp(col ?? this.selCol, 0, this.sim.w.length - 1);
    this.charge = { col: this.selCol, src: 'hold', t, power: 0 };
    return true;
  }

  /** Test hook: aim at a column and strike with power 0..1. */
  debugStrike(col, power = 0.8) {
    if (this.step !== 'hammer' || this.swing) return false;
    this.selCol = clamp(col ?? this.selCol, 0, this.sim.w.length - 1);
    this.theta = lerp(REST, WIND, ease.out(power));
    this.charge = { col: this.selCol, src: 'debug', t: 0, power };
    this.release();
    return true;
  }

  colWorld(i) {
    this.view.group.updateMatrixWorld(true);
    return this.view.group.localToWorld(this.view.colTop(clamp(i, 0, this.sim.w.length - 1), new THREE.Vector3()));
  }

  resolveStrike(i, power) {
    const sc = this.scene, st = this.st, sim = this.sim, P = sc.particles;
    const ev = sim.strike(i, power);
    if (!ev) return;
    sc.rig.vm?.impact('hammer', 0.25 + power * 0.35);
    st.useEnergy(this.strikeEnergy());
    st.learn('hammering');
    if (ev.kind === 'work') st.learn('working_heat');
    const pos = this.colWorld(i);
    this.view.squash(i, 0.5 + power * 0.5);
    const thin = clamp(1 - sim.w[i] / 6, 0, 1);
    if (ev.kind === 'cold') {
      this.game.audio.play('clunk', { vol: 0.6 + power * 0.6 });
      P.flakes(pos, 4 + Math.round(power * 6));
      sc.addShake(0.006 + power * 0.01);
      if (ev.crack) { this.game.audio.play('crack'); this.popOnce('crack', 'Crack!', pos.clone().add(_v2.set(0, 0.08, 0)), '#ff7a5a', 1, 0.5); }
      else this.popOnce('cold', 'Too cold!', pos.clone().add(_v2.set(0, 0.08, 0)), '#9ad0ff', 0.9, 1.4);
    } else {
      this.game.audio.play('clang', { pitch: 0.8 + thin * 0.45 + Math.random() * 0.06, vol: 0.55 + power * 0.6 });
      const n = 10 + Math.round(power * 28);
      const white = ev.kind === 'hot' || ev.kind === 'burn';
      P.sparks(pos, n, power, white ? 0xffffff : 0xfff0b0);
      P.streaks(pos, 8 + Math.round(power * 26), power, white ? 0xffffff : 0xfff6d0);
      P.scaleFlakes(pos, 3 + Math.round(power * 7), 0.45);
      sc.addShake(0.01 + power * 0.03);
      sc.impact(pos, power, this.sim.T[i] ?? 900);
      sc.extraLight = 1.5 + power * 2.5;
      if (ev.kind === 'burn') {
        P.burnSpray(pos, 26);
        this.game.audio.play('sizzle');
        this.popOnce('burn', 'Burning!', pos.clone().add(_v2.set(0, 0.09, 0)), '#ffffff', 0.9, 1.4);
        if (Math.random() < 0.3) sc.henReact('startle');
      }
    }
    const gain = ev.after - ev.before;
    if (Math.abs(gain) >= 0.02) this.popOnce('gain', (gain > 0 ? '+' : '') + Math.round(gain * 100) + '%', pos.clone().add(_v2.set(0, 0.06, 0.03)), gain > 0 ? '#8af07a' : '#ff8a6a', 0.6, 0.15);
    if (ev.grown.length) this.game.audio.play('creak');
    this.scene.lesson?.event('strike', { ev, gain, run: this });
  }

  finishShaping() {
    if (this.moving || this.swing || this.charge || this.asking) return;
    const acc = this.sim.accuracy();
    if (acc < 0.5) {
      // a cheap guard against an early Enter: a barely-shaped blade wastes the ingots
      this.asking = true;
      this.game.ui.confirm(confirmText(`Only ${Math.round(acc * 100)}% shaped.`, 'Grinding only trims a little. Finish it anyway?'), 'Finish', 'Keep hammering').then((yes) => {
        this.asking = false;
        if (yes && this.step === 'hammer' && !this.finished) { this.view.hover = -1; this.go('grind'); }
      });
      return;
    }
    this.view.hover = -1;
    this.go('grind');
  }

  // ---------------------------------------------------------------- grind (finishing pass)
  enter_grind() {
    const sc = this.scene, W = sc.W;
    this.busy = true;
    this.setActions([]);
    this.game.ui.setHints(null);
    this.view.setDotsVisible(false);
    this.thermo.el.hidden = true;
    sc.dock('grind', { dur: 0.8 });
    sc.paws.set('R', { mode: 'low' });
    this.rawShape = this.sim.accuracy();
    const c = W.grindContact;
    // the blade lies across the rim (along the axle), drawn sideways so the stone runs along the
    // edge; the tongs hold its tang, sparks fly off the far side of the wheel
    const axle = W.grindAxle, tan = W.grindTan;
    const rotY = Math.atan2(-axle.z, axle.x) + Math.PI; // the tang toward the smith's left paw
    const len = this.sim.length * COL;
    const reach = Math.min(0.3, len * 0.8);
    const pose = (u) => ({ pos: c.clone().addScaledVector(axle, 0.05 + (reach - 0.05) * u).add(_v2.set(0, 0.008, 0)), rot: new THREE.Euler(0, rotY, 0) });
    for (const st of ['heat', 'hammer']) if (!this.done.includes(st)) this.done.push(st);
    this.moveObj(this.view.group, pose(0), 0.75, 0.12);
    this.seq.call(() => {
      this.grindLoop = this.game.audio.loop('grind', { vol: 0.35 });
      this.grindRes = this.sim.grind();
    });
    const P = sc.particles;
    this.seq.add(2.0, (k, dt) => {
      W.grind.hub.rotation.x += dt * 18;
      const u = 0.5 - 0.5 * Math.cos(k * Math.PI * 4);
      this.view.group.position.copy(pose(u).pos);
      for (let i = 0; i < 4; i++) {
        const sp = 1.4 + Math.random() * 2.2, side = (Math.random() - 0.5) * 0.08;
        P.glow.spawn(P.w({ x: c.x + axle.x * side, y: c.y + 0.006, z: c.z + axle.z * side, vx: tan.x * sp + (Math.random() - 0.5) * 0.45, vy: 0.25 + Math.random() * 0.9, vz: tan.z * sp + (Math.random() - 0.5) * 0.45, life: 0.3 + Math.random() * 0.35, size: 0.018, size1: 0.005, color: 0xfff0b0, color1: 0xff7a1a, gravity: 4, drag: 1 }));
      }
      sc.extraLight = 0.6;
    });
    this.seq.call(() => {
      this.grindLoop?.stop();
      this.grindLoop = null;
      const r = this.grindRes;
      this.scores.shape = r.after;
      const msg = r.after - r.before >= 0.005 ? `Ground true: ${Math.round(r.before * 100)}% → ${Math.round(r.after * 100)}%` : `Shape ${Math.round(r.after * 100)}%`;
      sc.pop(msg, c.clone().add(_v2.set(0, 0.16, 0)), '#ffd34a', 0.8);
      this.game.audio.play(r.after > 0.85 ? 'good' : 'ding');
    }).wait(0.9).call(() => { this.busy = false; this.go('balance'); });
  }

  update_grind(dt) {
    this.workLight(this.sim.maxTemp());
  }

  // ---------------------------------------------------------------- balance
  enter_balance() {
    const sc = this.scene, W = sc.W;
    this.thermo.el.hidden = true;
    this.buildWeaponModel();
    // hand over from the billet view to the finished weapon
    const startPos = this.view.group.position.clone();
    sc.scene.remove(this.view.group);
    this.carrier.position.copy(startPos);
    this.carrier.rotation.set(0, this.view.group.rotation.y, 0);
    this.orient.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); // blade along the carrier's +x, lying flat
    this.bal = this.sim.balanceSetup();
    this.balW = 0;
    this.tiltAng = 0;
    this.tiltVel = 0;
    this.weapon.group.position.y = -this.bal.target * this.bladeLen;
    sc.dock('bench', { dur: 0.9 });
    sc.paws.set('L', { mode: 'tongs', at: () => this.hiltWorld() });
    sc.paws.set('R', { mode: 'low' });
    this.busy = true;
    this.moveObj(this.carrier, { pos: W.fulcrumTop.clone().add(_v2.set(0, 0.006, 0)), rot: new THREE.Euler(0, 0, 0) }, 0.9, 0.15, () => {
      this.busy = false;
      this.game.audio.play('place');
      sc.paws.jaw = 0.8; // let go: it rests on the fulcrum
      sc.paws.set('L', { mode: 'low' });
    });
    const assist = !!this.inf?.balanceAssist;
    this.balTol = balanceTolerance(assist, this.skill);
    const label = this.bal.mode === 'pommel' ? (this.sim.type === 'spear' ? 'Butt-cap weight' : 'Pommel weight') : 'Head weight';
    this.balLabel = el('span', {}, label);
    this.balVal = el('b');
    this.slider = el('input', { type: 'range', min: 0, max: 1000, value: 0, class: 'fg-slider interactive', 'aria-label': label, oninput: (e) => { this.balW = parseInt(e.target.value, 10) / 1000; } });
    this.balBox = el('div', { class: 'fg-col', style: { gap: 'var(--px)' } }, [el('div', { class: 'fg-stat' }, [this.balLabel, this.balVal]), this.slider]);
    this.stats.append(this.balBox);
    // ruler overlay
    this.rZone = el('div', { class: 'zone' });
    this.rMark = el('div', { class: 'mark' });
    this.rLabT = el('div', { class: 'lab', style: { color: '#a8f49a' } }, 'target');
    this.ruler = el('div', { class: 'fg-ruler', hidden: true }, [el('div', { class: 'track' }), this.rZone, this.rMark, this.rLabT]);
    sc.layer.append(this.ruler);
    this.nodes.push(this.ruler, this.balBox);
    this.setActions([{ label: 'Set balance ', keyLabel: 'Enter', key: ['Enter', 'NumpadEnter'], fn: () => this.confirmBalance() }]);
    this.game.ui.setHints(`<span class="fg-nolig">Drag the slider to level the blade<br><kbd>←</kbd><kbd>→</kbd> adjust · <kbd>Enter</kbd> set${assist ? '<br>Gravium makes it forgiving' : ''}</span>`);
  }

  buildWeaponModel() {
    const sc = this.scene;
    const gemColor = this.sel.gem ? GEM_COLORS[this.sel.gem] : undefined;
    this.weapon = buildWeapon(this.sim, { infusion: this.sel.infusion, gem: this.sel.gem, gemColor });
    this.bladeLen = this.sim.length * COL;
    this.carrier = new THREE.Group();
    this.orient = new THREE.Group();
    this.carrier.add(this.orient);
    this.orient.add(this.weapon.group);
    sc.scene.add(this.carrier);
    this.metalColor = this.m.color;
    applyHeat(this.weapon.mat, 0xffffff, this.sim.meanT(), 0.9);
    this.weapon.mat.color.setRGB(1, 1, 1);
    this.weaponT = this.sim.meanT();
  }

  update_balance(dt) {
    const sc = this.scene, inp = this.game.input;
    this.coolWeapon(dt);
    this.workLight(this.weaponT, this.carrier.position);
    if (inp.isDown('ArrowLeft', 'KeyA')) this.balW = clamp(this.balW - dt * 0.25, 0, 1);
    if (inp.isDown('ArrowRight', 'KeyD')) this.balW = clamp(this.balW + dt * 0.25, 0, 1);
    if (document.activeElement !== this.slider) this.slider.value = String(Math.round(this.balW * 1000));
    const W = this.balW * this.bal.Wmax;
    const b = this.sim.balanceAt(W, this.bal.mode);
    this.balFrac = b.frac;
    const off = b.frac - this.bal.target;
    const goal = -clamp(off * 2.6, -0.3, 0.3);
    for (let t = dt; t > 1e-6; t -= 1 / 60) {
      const h = Math.min(1 / 60, t);
      this.tiltVel += ((goal - this.tiltAng) * 55 - this.tiltVel * 7) * h;
      this.tiltAng += this.tiltVel * h;
    }
    if (!this.busy) this.carrier.rotation.z = this.tiltAng;
    // weight visuals
    const rel = Math.cbrt(W / Math.max(0.01, this.sim.targetSum * 0.35));
    if (this.bal.mode === 'pommel') { this.weapon.pommel.scale.setScalar(0.8 + rel * 0.55); this.weapon.headCap.visible = false; }
    else { this.weapon.headCap.visible = W > 0.01; this.weapon.headCap.scale.setScalar(0.6 + rel * 0.7); }
    setText(this.balVal, `${this.sim.grams(W)} g`);
    const inZone = Math.abs(off) <= this.balTol;
    if (inZone && !this.wasLevel && !this.busy) { this.game.audio.play('ding'); this.wasLevel = true; }
    if (!inZone) this.wasLevel = false;
    this.setStatus(`Balance point ${Math.round(b.frac * 100)}% along the blade · aim for ${Math.round(this.bal.target * 100)}%` + (inZone ? ' <span class="fg-good">· level!</span>' : off > 0 ? ' · tip-heavy' : ' · hilt-heavy'));
    // ruler under the blade
    if (!this.busy) {
      const g = this.weapon.group;
      const a = sc.toScreen(g.localToWorld(_v.set(0, 0, 0))), t = sc.toScreen(g.localToWorld(_v2.set(0, this.bladeLen, 0)));
      const x0 = Math.min(a.x, t.x), x1 = Math.max(a.x, t.x), y = Math.max(a.y, t.y) + 44;
      const dir = t.x >= a.x ? 1 : -1;
      const px = (f) => (dir > 0 ? a.x + (t.x - a.x) * f : a.x + (t.x - a.x) * f) - x0;
      this.ruler.hidden = false;
      Object.assign(this.ruler.style, { left: x0 + 'px', top: y + 'px', width: (x1 - x0) + 'px' });
      const z0 = px(this.bal.target - this.balTol), z1 = px(this.bal.target + this.balTol);
      Object.assign(this.rZone.style, { left: Math.min(z0, z1) + 'px', width: Math.abs(z1 - z0) + 'px' });
      this.rMark.style.left = clamp(px(b.frac), -20, x1 - x0 + 20) + 'px';
      this.rLabT.style.left = px(this.bal.target) + 'px';
      this.rMark.style.borderTopColor = inZone ? '#8af07a' : '#ffd34a';
    }
  }

  confirmBalance() {
    if (this.busy) return;
    const s = balanceScore(this.balFrac, this.bal.target, !!this.inf?.balanceAssist, this.skill);
    this.scores.balance = s;
    this.st.learn('balance');
    this.game.audio.play(s > 0.9 ? 'perfect' : s > 0.6 ? 'good' : 'oops');
    const words = s > 0.9 ? ['Perfectly balanced', '#ffd34a'] : s > 0.6 ? ['Well balanced', '#8af07a'] : s > 0.3 ? ['A bit off', '#e6dcc8'] : ['Wobbly', '#ff8a6a'];
    this.scene.pop(words[0], this.carrier.position.clone().add(_v2.set(0, 0.3, 0)), words[1], 0.9);
    this.ruler.hidden = true;
    this.balBox.remove();
    this.weapon.group.position.y = -0.5 * this.bladeLen;
    this.carrier.position.add(_v2.set((0.5 - this.bal.target) * this.bladeLen, 0, 0));
    this.carrier.rotation.z = 0;
    this.go(this.m.quench ? 'quench' : this.inf ? 'infuse' : 'result');
  }

  coolWeapon(dt, inFire = false, air = 0) {
    const m = this.m;
    if (inFire) {
      const idle = fireIdleFor(m, this.maxT);
      const fireT = idle + (this.maxT - idle) * air;
      this.weaponT += (fireT - this.weaponT) * (0.09 + 0.13 * air) * m.heat * dt;
      this.weaponT = Math.min(this.weaponT, this.maxT);
    } else this.weaponT -= (this.weaponT - AMBIENT) * 0.035 * dt;
    applyHeat(this.weapon.mat, 0xffffff, this.weaponT, 0.9);
    return this.weaponT;
  }

  // ---------------------------------------------------------------- quench
  enter_quench() {
    const sc = this.scene;
    this.thermo.el.hidden = false;
    this.thermo.setTitle(this.m.name);
    this.setThermoMarks(true);
    sc.dock('hearth');
    sc.paws.jaw = 0;
    sc.paws.set('L', { mode: 'tongs', at: () => this.hiltWorld() });
    sc.paws.set('R', { mode: 'pull' });
    sc.pumpAllowed = true;
    this.inFire = true;
    this.plunged = false;
    this.busy = true;
    this.moveObj(this.carrier, this.quenchFirePose(), 0.85, 0.15, () => { this.busy = false; this.game.audio.play('ignite'); sc.puff(); });
    this.setQuenchActions();
    this.game.ui.setHints('<span class="fg-nolig">Hold the mouse or <kbd>Space</kbd>: pump · <kbd>E</kbd> in/out of the fire<br><kbd>Q</kbd> plunge it in the barrel · <kbd>Esc</kbd> abandon</span>');
  }

  setQuenchActions() {
    this.setActions([
      { label: this.inFire ? 'Pull it out ' : 'Back in the fire ', keyLabel: 'E', key: ['KeyE'], fn: () => this.toggleQuenchFire(), alt: true },
      { label: 'Plunge! ', keyLabel: 'Q', key: ['KeyQ'], fn: () => this.plunge() },
    ]);
  }

  /** The finished blade in the coals (the carrier's +x runs along the blade). */
  quenchFirePose() {
    const fp = this.scene.W.firePos;
    const yaw = Math.PI / 2 + clamp((this.bladeLen - 0.42) * 1.2, 0, 0.55);
    const dir = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    return { pos: fp.clone().addScaledVector(dir, 0.03).add(_v2.set(0, 0.012, 0)), rot: new THREE.Euler(0, yaw, -0.06) };
  }

  /** Held up out of the fire, tip raised, cooling in the air. */
  quenchHoldPose() {
    const fp = this.scene.W.firePos;
    return { pos: fp.clone().add(_v2.set(0.06, 0.16, 0.2)), rot: new THREE.Euler(0, Math.PI / 2 + 0.25, 0.35) };
  }

  toggleQuenchFire() {
    if (this.busy || this.plunged) return;
    this.inFire = !this.inFire;
    this.busy = true;
    this.moveObj(this.carrier, this.inFire ? this.quenchFirePose() : this.quenchHoldPose(), 0.45, 0.06, () => { this.busy = false; });
    this.game.audio.play('whoosh');
    this.setQuenchActions();
  }

  update_quench(dt) {
    const sc = this.scene, inp = this.game.input;
    const T = this.coolWeapon(dt, this.inFire && !this.busy, sc.fire.air);
    this.thermo.set(T, dt);
    this.workLight(T, this.carrier.position);
    const [q0, q1] = this.sim.quenchRange || this.m.quench;
    if (T > this.m.burn && !this.plunged) {
      this.sim.burnt += dt * 3 * Math.min(2, (T - this.m.burn) / 100 + 0.3);
      if (Math.random() < dt * 8) sc.particles.burnSpray(this.carrier.position, 5);
      this.popOnce('qburn', 'Burning!', this.carrier.position.clone().add(_v2.set(0, 0.14, 0)), '#ffffff', 0.9, 3);
    }
    if (!this.plunged) {
      if (T >= q0 && T <= q1) this.setStatus('<span class="fg-good">Right in the hardening window!</span>');
      else if (T > q1) this.setStatus('<span class="fg-warn">Too hot to quench safely.</span>');
      else this.setStatus(this.inFire ? 'Heating up for the quench.' : 'Cooling in the air.');
    }
  }

  plunge() {
    if (this.busy || this.plunged) return;
    const sc = this.scene, W = sc.W, P = sc.particles;
    this.plunged = true;
    this.busy = true;
    sc.pumpAllowed = false;
    sc.dock('barrel', { dur: 0.6 });
    sc.paws.set('R', { mode: 'low' });
    const Tp = this.weaponT;
    const res = quenchResult(this.m, Tp, this.skill);
    this.setActions([]);
    this.game.ui.setHints(null);
    const top = W.barrelTop.clone();
    const L = this.bladeLen;
    // tip down over the water (the carrier's +x, along the blade, turns to point at the floor)
    const down = new THREE.Euler(0, 0, -Math.PI / 2); // broad side toward the smith
    const above = { pos: top.clone().add(_v2.set(0.02, 0.06 + L * 0.5, 0)), rot: down };
    const dunk = { pos: top.clone().add(_v2.set(0.02, 0.03 + L * 0.5 - L * 0.85, 0)), rot: down };
    this.game.audio.play('whoosh');
    this.moveObj(this.carrier, above, 0.7, 0.04);
    this.seq.add(0.2, (k) => { this.carrier.position.lerpVectors(above.pos, dunk.pos, ease.in(k)); })
      .call(() => {
        this.game.audio.play('quench');
        this.game.audio.play('steam');
        P.steam(top, 70, 0.3, 1.3);
        P.billow(top, 26, 0.3, 1.4);
        P.bubbles(top, 14, 0.3);
        for (let k = 0; k < 12; k++) P.streak.spawn(P.w({ x: top.x, y: top.y + 0.01, z: top.z, vx: (Math.random() - 0.5) * 1.6, vy: 1 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 1.2, life: 0.4, color: 0xd8f4ff, color1: 0x5a8a98, gravity: 6, drag: 0.6, len: 0.02 }));
        W.water.splash(1.4);
        sc.waterEnergy = 1.2;
        sc.addShake(0.02);
        sc.post.flash = Math.max(sc.post.flash || 0, 0.16);
        sc.post.flashColor = 0xe8f2f4;
        this.st.learn('quenching');
        if (res.crack) { this.game.audio.play('crack'); setTimeout(() => this.game.audio.play('crack'), 160); }
      })
      .add(1.2, (k, dt) => {
        this.weaponT = lerp(Tp, 60, ease.out(k));
        applyHeat(this.weapon.mat, 0xffffff, this.weaponT, 0.9);
        if (Math.random() < dt * 30) P.steam(top, 2, 0.25, 0.8);
        if (Math.random() < dt * 9 * (1 - k)) P.billow(top, 2, 0.22, 0.9);
        if (Math.random() < dt * 20) P.bubbles(top, 2, 0.25);
        this.carrier.position.x = dunk.pos.x + Math.sin(k * 30) * 0.004 * (1 - k); // the tongs tremble in the boil
      })
      .add(0.45, (k) => { this.carrier.position.lerpVectors(dunk.pos, above.pos, ease.out(k)); })
      .call(() => {
        this.scores.quench = res.score;
        if (res.crack) this.sim.cracks[Math.floor(this.sim.length * 0.4)] = Math.max(1, this.sim.cracks[Math.floor(this.sim.length * 0.4)] || 0);
        const words = res.kind === 'good' ? (res.score > 0.95 ? ['Perfect temper!', '#ffd34a'] : ['Hardened!', '#8af07a']) : res.kind === 'hot' ? (res.crack ? ['Cracked!', '#ff7a5a'] : ['Too hot, brittle', '#ffb07a']) : ['Too cold, soft', '#9ad0ff'];
        sc.pop(words[0], top.clone().add(_v2.set(0, 0.3, 0)), words[1], 1);
        this.game.audio.play(res.kind === 'good' ? 'good' : 'oops');
        if (res.kind === 'good' && res.score > 0.95) sc.henReact('startle');
      })
      .wait(0.8)
      .call(() => { this.busy = false; this.go(this.inf ? 'infuse' : 'result'); });
  }

  // ---------------------------------------------------------------- infusion
  enter_infuse() {
    const sc = this.scene, W = sc.W;
    this.thermo.el.hidden = true;
    sc.pumpAllowed = false;
    sc.dock('anvil', { dur: 0.8 });
    const af = W.anvilFace;
    this.busy = true;
    this.infPhase = 'wait';
    // on the anvil like the billet was: the carrier's +x (the blade) along the face
    this.moveObj(this.carrier, { pos: af.clone().add(_v2.set(0, 0.016, 0.02)), rot: new THREE.Euler(0, -Math.PI / 2, 0) }, 0.85, 0.12, () => {
      this.busy = false;
      this.game.audio.play('place');
      this.startRing();
    });
    this.crystal = makeCrystal(this.inf.color, 0.5);
    this.crystal.mesh.scale.multiplyScalar(0.36);
    this.crystalBase = af.clone().add(_v2.set(0, 0.1, 0.02));
    this.crystal.mesh.position.copy(this.crystalBase);
    sc.scene.add(this.crystal.mesh);
    this.lightning = new Lightning(sc.scene, INFUSION_FX[this.sel.infusion]?.color ?? this.inf.color);
    sc.paws.set('L', { mode: 'tongs', at: () => this.hiltWorld() });
    sc.paws.set('R', { mode: 'hammer', at: () => this.crystal.mesh.position.clone().add(_v2.set(0, 0.03, 0)), theta: () => this.theta });
    this.theta = REST + 0.25;
    this.setActions([]);
    this.setStatus(`${ITEMS[this.sel.infusion].name} hums above the blade.`);
    this.game.ui.setHints('<span class="fg-nolig">Strike (click or <kbd>Space</kbd>) when the rings meet</span>');
  }

  startRing() {
    const sc = this.scene;
    const s = sc.toScreen(this.crystal.mesh.position);
    const col = '#' + (this.inf.color >>> 0).toString(16).padStart(6, '0');
    this.ringTarget = el('div', { class: 'fg-ring', style: { left: s.x + 'px', top: s.y + 'px', width: '96px', height: '96px', borderColor: col, opacity: 0.9 } });
    this.ringMove = el('div', { class: 'fg-ring', style: { left: s.x + 'px', top: s.y + 'px', borderColor: '#fff' } });
    sc.layer.append(this.ringTarget, this.ringMove);
    this.nodes.push(this.ringTarget, this.ringMove);
    this.infPhase = 'ring';
    this.ringT = 0;
    this.game.audio.play('glow');
  }

  update_infuse(dt) {
    const sc = this.scene, inp = this.game.input;
    const c = this.crystal;
    this.workLight(this.weaponT, this.carrier.position);
    if (c && c.mesh.visible) {
      c.mesh.rotation.y += dt * 2;
      c.mesh.position.y = this.crystalBase.y + Math.sin(this.time * 3) * 0.008;
      c.mat.color.setScalar(0.8 + Math.sin(this.time * 6) * 0.2);
    }
    this.updateSwing(dt);
    if (this.infPhase === 'ring') {
      this.ringT += dt;
      const R0 = 48, k = this.ringT / 1.5;
      const r = R0 * (3 - 3 * k);
      const s = sc.toScreen(c.mesh.position);
      for (const n of [this.ringTarget, this.ringMove]) { n.style.left = s.x + 'px'; n.style.top = s.y + 'px'; }
      this.ringMove.style.width = this.ringMove.style.height = Math.max(0, r * 2) + 'px';
      const tap = inp.pressed('Space') || inp.mousePressed(0) || this.debugTap;
      this.debugTap = false;
      if (tap || r <= 2) {
        const e = Math.abs(r - R0) / R0;
        const k = this.skill || 1;
        const q = tap ? (e < 0.12 * k ? 'perfect' : e < 0.3 * k ? 'good' : 'ok') : 'ok';
        this.infuseBonus = q === 'perfect' ? 4 : q === 'good' ? 2 : 0.5;
        this.infQ = q;
        this.ringTarget.remove(); this.ringMove.remove();
        this.infPhase = 'strike';
        // the hammer comes down on the crystal: the infusion goes in with the blow
        this.swing = { t: 0, from: Math.max(this.theta, 1.1), col: 0, power: 0.7, hit: false, onHit: () => this.releaseInfusion() };
        this.game.audio.play('whoosh');
      }
    } else if (this.infPhase === 'fx') {
      this.fxT += dt;
      const g = this.weapon.group;
      const base = g.localToWorld(new THREE.Vector3(0, 0, 0)), tip = g.localToWorld(new THREE.Vector3(0, this.bladeLen, 0));
      const fx = INFUSION_FX[this.sel.infusion];
      const k = this.fxT < 1.8 ? 1 : Math.max(0, 1 - (this.fxT - 1.8) / 0.6);
      if (fx) fx.tick(sc.particles, this.lightning, base, tip, this.time, dt, k);
      this.lightning.update(dt);
      if (this.weapon.veinMat) this.weapon.veinMat.color.setScalar(0.6 + 0.5 * Math.abs(Math.sin(this.time * 8)) * k + 0.3);
      if (this.sel.infusion === 'gravium') this.carrier.position.y = this.infBaseY + Math.sin(Math.min(1, this.fxT / 2.4) * Math.PI) * 0.07;
      if (this.fxT > 2.6 && !this.infEnded) { this.infEnded = true; this.go('result'); }
    }
  }

  releaseInfusion() {
    const sc = this.scene, P = sc.particles;
    const c = this.crystal;
    const pos = c.mesh.position.clone();
    const fx = INFUSION_FX[this.sel.infusion];
    const words = { perfect: ['Perfect infusion!', '#ffd34a'], good: ['Infused!', '#8af07a'], ok: ['Infused', '#e6dcc8'] }[this.infQ];
    sc.pop(words[0], pos.clone().add(_v2.set(0, 0.1, 0)), words[1], 1);
    this.game.audio.play(this.infQ === 'perfect' ? 'perfect' : 'good');
    this.game.audio.play('clang', { pitch: 1.4, vol: 0.5 });
    if (fx?.sound) this.game.audio.play(fx.sound);
    this.game.audio.play('sparkle');
    P.sparkle(pos, this.inf.color, 30, 0.3, 0.3);
    sc.impact(pos, 0.6, 1400);
    c.mesh.visible = false;
    this.st.learn('infusion');
    this.infPhase = 'fx';
    this.fxT = 0;
    this.infBaseY = this.carrier.position.y;
    sc.extraLight = 3;
    sc.post.flash = 0.25;
    setTimeout(() => { sc.post.flash = 0; }, 90);
  }

  // ---------------------------------------------------------------- result
  enter_result() {
    const sc = this.scene, st = this.st, sim = this.sim;
    this.busy = true;
    sc.pumpAllowed = false;
    this.thermo.el.hidden = true;
    this.panel.hidden = true;
    this.setActions([]);
    this.game.ui.setHints(null);
    const shape = this.scores.shape ?? sim.accuracy();
    const temper = sim.temperScore();
    const balance = this.scores.balance ?? 0;
    const hasQ = !!this.m.quench;
    const quench = this.scores.quench ?? 0;
    const parts = hasQ ? [[shape, 0.4], [temper, 0.2], [balance, 0.2], [quench, 0.2]] : [[shape, 0.5], [temper, 0.25], [balance, 0.25]];
    const base = parts.reduce((s, [v, w]) => s + v * w, 0) * 100;
    const bonus = this.infuseBonus || 0;
    const score = clamp(Math.round(base + bonus), 0, 100);
    const w = st.addWeapon({ type: this.sel.type, metal: this.sel.metal, matQ: this.matQ, score, infusion: this.sel.infusion || undefined, gem: this.sel.gem || undefined, gemQ: this.gemQ });
    this.finished = true;
    this.weaponRec = w;
    const grade = gradeFor(score);
    st.emit?.('act', { type: 'forge', weapon: this.sel.type, metal: this.sel.metal, grade: grade.g, score });
    this.scene.lesson?.event('result', { grade, score, weapon: w, run: this });
    // the reveal: you hold the new blade up in front of you, turning it in the firelight
    sc.dock('reveal', { dur: 0.9 });
    sc.freezeLook = true;
    this.savedPost = { vignette: sc.post.vignette, brightness: sc.post.brightness };
    this.savedHemi = { sky: sc.W.hemi.color.getHex(), i: sc.W.hemi.intensity };
    const total = this.bladeLen + this.weapon.hiltLength;
    this.revealScale = clamp(0.36 / total, 0.42, 1.25);
    this.weapon.mat.color.setRGB(1, 1, 1);
    this.weapon.mat.emissive.setRGB(0, 0, 0);
    this.weapon.group.position.y = 0;
    this.orient.rotation.set(0, 0, 0);
    this.revealFrom = this.carrier.position.clone();
    this.revealFromQ = this.carrier.quaternion.clone();
    this.revealT = 0;
    this.gradeCol = new THREE.Color(grade.color);
    // the blade glows in its own metal's tint, nudged toward the grade color (the halo carries the grade)
    this.glowCol = new THREE.Color(this.m.color).lerp(this.gradeCol, 0.35);
    this.halo = makeHalo(grade.color);
    this.halo.scale.setScalar(0.5);
    sc.scene.add(this.halo);
    sc.paws.jaw = 0.8;
    sc.paws.set('L', { mode: 'low' });
    sc.paws.set('R', { mode: 'hold', at: () => this.gripWorld(), up: () => this.bladeUp(), fwd: () => this.knuckles(), snap: true });
    this.game.audio.play('whoosh');
    const later = (ms, fn) => setTimeout(() => { if (sc.game.scene === sc && sc.activity === this) fn(); }, ms);
    later(350, () => this.game.audio.play('fanfare'));
    later(1450, () => this.game.audio.play('success'));
    if (grade.g === 'S' || grade.g === 'A') later(900, () => sc.henReact('great'));
    else if (grade.g === 'F') later(900, () => sc.henReact('bad'));
    this.buildCard(w, grade, { shape, temper, balance, quench: hasQ ? quench : null, bonus });
  }

  /** The middle of the grip, where the fist closes (world). */
  gripWorld(out = new THREE.Vector3()) {
    const g = this.weapon.group;
    g.updateMatrixWorld(true);
    return g.localToWorld(out.set(0, -this.weapon.hiltLength * 0.5, 0));
  }

  bladeUp(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.carrier.quaternion); }

  knuckles(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.carrier.quaternion).add(_v2.set(0, -0.25, 0)); }

  buildCard(w, grade, s) {
    const sc = this.scene;
    const row = (label, v, extra = '') => {
      const b = bar(v > 0.85 ? '' : v > 0.6 ? 'warm' : 'bad');
      b.set(v);
      return [el('span', {}, label), b.el, el('b', {}, Math.round(v * 100) + '%' + extra)];
    };
    const brk = el('div', { class: 'fg-break' }, [
      ...row('Shape', s.shape),
      ...row('Temper', s.temper),
      ...row('Balance', s.balance),
      ...(s.quench !== null ? row('Quench', s.quench) : []),
    ]);
    const card = el('div', { class: 'panel fg-result' }, [
      el('div', { class: 'fg-stamp', style: { color: grade.color } }, [grade.g, el('small', {}, grade.word)]),
      el('div', { class: 'fg-kicker' }, 'Forged · craft score ' + Math.round(w.score)),
      el('h2', { style: { marginRight: 'calc(var(--px) * 30)' } }, w.name),
      el('div', { class: 'fg-value' }, [el('img', { class: 'pix', src: COIN(), alt: '' }), formatGoldFull(w.value) + ' g']),
      el('div', { class: 'fg-note', html: `Material quality <b style="color:${qColor(w.matQ)}">${w.matQ}%</b>` + (w.gem ? ` · ${ITEMS[w.gem].name} pommel` : '') + (s.bonus ? ` · infusion +${s.bonus}` : '') }),
      brk,
      el('div', { class: 'row' }, [
        el('button', { class: 'btn', onclick: () => { this.game.audio.play('ui_click'); sc.endActivity('plan'); } }, ['Forge another ', el('kbd', { style: { marginLeft: 'calc(var(--px)*1.5)', marginRight: 0 } }, 'Enter')]),
        el('button', { class: 'btn alt', onclick: () => sc.leave() }, 'Leave'),
      ]),
    ]);
    card.hidden = true;
    sc.layer.append(card);
    this.nodes.push(card);
    this.card = card;
    this.seq.wait(0.8).call(() => { card.hidden = false; this.busy = false; this.game.audio.play('ui_open'); });
    this.actionKeys = { Enter: () => sc.endActivity('plan'), NumpadEnter: () => sc.endActivity('plan') };
  }

  update_result(dt) {
    const sc = this.scene, P = sc.particles, cam = sc.camera;
    this.revealT += dt;
    const k = Math.min(1, this.revealT / 0.9);
    // held up in front: a little right of centre, tilted toward the light, turning slowly
    cam.updateMatrixWorld();
    const fwd = _v.set(0, 0, -1).transformDirection(cam.matrixWorld);
    const right = new THREE.Vector3(1, 0, 0).transformDirection(cam.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(cam.matrixWorld);
    const total = (this.bladeLen + this.weapon.hiltLength) * this.revealScale;
    const spot = cam.position.clone().addScaledVector(fwd, 0.4).addScaledVector(right, 0.06).addScaledVector(up, -total * 0.18);
    const s = this.revealScale;
    const turn = Math.sin(this.time * 0.8) * 0.55 + 0.25;
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, spot, up));
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI + turn, -0.18 + Math.sin(this.time * 1.3) * 0.04)));
    arcPoint(this.revealFrom, spot, 0.08, ease.out(k), this.carrier.position);
    this.carrier.quaternion.slerpQuaternions(this.revealFromQ, q, ease.out(k));
    this.carrier.scale.setScalar(lerp(1, s, ease.out(k)));
    this.carrier.position.y += Math.sin(this.time * 1.6) * 0.004 * k;
    const glow = 0.07 + 0.05 * Math.sin(this.time * 3);
    this.weapon.mat.emissive.copy(this.glowCol).multiplyScalar(glow * k);
    if (this.weapon.veinMat) this.weapon.veinMat.color.setScalar(0.8 + 0.3 * Math.sin(this.time * 5));
    const mid = this.weapon.group.localToWorld(new THREE.Vector3(0, this.bladeLen * 0.5, 0));
    if (Math.random() < dt * 14) P.sparkle(mid, this.gradeCol.getHex(), 1, 0.25, 0.1);
    if (this.halo) {
      this.halo.position.copy(mid).addScaledVector(fwd, 0.3);
      this.halo.material.opacity = (0.4 + 0.1 * Math.sin(this.time * 2.4)) * k;
      this.halo.scale.setScalar(0.42 + 0.03 * Math.sin(this.time * 1.7));
    }
    sc.post.vignette = lerp(this.savedPost.vignette ?? 0.38, 0.7, k);
    sc.W.hemi.color.setHex(this.savedHemi.sky).lerp(_white, 0.55 * k);
    sc.W.hemi.intensity = lerp(this.savedHemi.i, this.savedHemi.i * 1.3, k);
    sc.post.brightness = lerp(this.savedPost.brightness ?? 1, 0.95, k);
    sc.extraLight = 0.6 * k;
    sc.workSrc = null;
    // a cool display light from over your shoulder so the metal reads as metal in the firelight
    sc.displayLight = { pos: cam.position.clone().addScaledVector(up, 0.25).addScaledVector(right, -0.2), color: 0xdce6ff, intensity: 0.9 * k };
    if (this.sel.infusion && INFUSION_FX[this.sel.infusion] && this.lightning) {
      const g = this.weapon.group;
      INFUSION_FX[this.sel.infusion].tick(P, this.lightning, g.localToWorld(new THREE.Vector3(0, 0, 0)), g.localToWorld(new THREE.Vector3(0, this.bladeLen, 0)), this.time, dt, 0.35);
      this.lightning.update(dt);
    }
  }

  // ================================================================ frame
  update(dt) {
    this.time += dt;
    this.stepT += dt;
    this.seq.update(dt);
    const fn = this['update_' + this.step];
    if (fn) fn.call(this, dt);
    if (this.view && this.view.group.parent) this.view.update(dt, this.time);
    if (this.step !== 'result') this.updateUI(dt);
    this.pollActionKeys();
  }
}
