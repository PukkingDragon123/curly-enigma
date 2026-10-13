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
import { applyHeat } from './blackbody.js';
import { Thermo, Steps, StrikeMeter, bar, setText, setHtml } from './ui.js';
import { Seq, ease, arcPoint, Lightning, INFUSION_FX } from './fx.js';
import { makeCrystal } from './models.js';
import { disposeTree } from './smelt.js';

const REST_PH = 0.62; // hammer held up, ready (out of the close-up)
const IMPACT_PH = 0.74; // swing phase where the face meets the blade (measured)
const WIND_PH = 0.55; // full overhead windup
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
    this.sim = new BladeSim(sel.type, sel.metal, this.level);
    this.view = new BladeView(this.sim);
    this.view.buildDots();
    this.view.setDotsVisible(false);
    sc.scene.add(this.view.group);
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
    this.game.ui.confirm('<b>Abandon this blade?</b><br>The metal goes back into your bag as ingots.', 'Abandon', 'Keep forging').then((yes) => {
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
    sc.W.grind.hub.rotation.x = 0;
    sc.pumpAllowed = false;
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
    if (quench && m.quench) marks.push({ kind: 'quench', range: m.quench, label: 'quench' });
    else marks.push({ kind: 'work', range: m.work, label: 'work' });
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
    for (const [k, fn] of Object.entries(this.actionKeys)) if (inp.pressed(k)) { fn(); return; }
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
  firePose() {
    const fp = this.scene.W.firePos;
    const len = this.sim.length * COL;
    return { pos: new THREE.Vector3(fp.x + len / 2 + 0.02, fp.y + 0.015, fp.z + 0.12), rot: new THREE.Euler(0.55, Math.PI, 0.05) };
  }

  anvilPose() {
    const af = this.scene.W.anvilFace;
    return { pos: new THREE.Vector3(af.x - (this.sim.N * COL) / 2 - 0.02, af.y + 0.001, af.z), rot: new THREE.Euler(0, 0, 0) };
  }

  placeInFire(instant = false) {
    const p = this.firePose();
    if (instant) { this.view.group.position.copy(p.pos); this.view.group.rotation.copy(p.rot); return; }
    this.moveObj(this.view.group, p, 0.7, 0.35);
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
  }

  // ---------------------------------------------------------------- heat
  enter_heat() {
    const sc = this.scene;
    this.scene.allowMenus = false;
    sc.setShot('hearth');
    sc.hammer.visible = false;
    sc.walkTo('bellows', 'pump');
    sc.pumpAllowed = true;
    this.view.setDotsVisible(false);
    this.view.hover = -1;
    this.setThermoMarks(false);
    this.thermo.el.hidden = false;
    this.setActions([{ label: 'To the anvil ', keyLabel: 'E', key: ['KeyE'], fn: () => this.toAnvil() }]);
    this.game.ui.setHints('<span class="fg-nolig"><kbd>Space</kbd> or hold the bellows: pump<br><kbd>E</kbd> carry it to the anvil · <kbd>Esc</kbd> abandon</span>');
  }

  update_heat(dt) {
    const sc = this.scene, sim = this.sim;
    const burning = sim.heatStep(dt, !this.moving, sc.fire.air);
    const T = sim.meanT();
    this.thermo.set(T, dt);
    this.burnFx(burning, dt);
    const [w0, w1] = this.m.work;
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
    return this.view.group.localToWorld(new THREE.Vector3(this.sim.length * COL * 0.5, 0.02, 0));
  }

  toAnvil() {
    if (this.moving || this.step !== 'heat') return;
    this.game.audio.play('whoosh');
    this.moveObj(this.view.group, this.anvilPose(), 0.65, 0.45, () => this.game.audio.play('place'));
    this.go('hammer');
  }

  // ---------------------------------------------------------------- hammer
  enter_hammer() {
    const sc = this.scene;
    sc.setShot('anvil');
    sc.pumpAllowed = false;
    sc.hammer.visible = true;
    sc.walkTo('anvil', 'hammer', () => this.measureSwing());
    this.view.setDotsVisible(true);
    this.selCol = this.selCol ?? 0;
    this.charge = null;
    this.swing = null;
    this.swingPh = REST_PH;
    this.mole = sc.mole;
    this.setActions([
      { label: 'Reheat ', keyLabel: 'E', key: ['KeyE'], fn: () => this.toFire(), alt: true },
      { label: 'Done shaping ', keyLabel: 'Enter', key: ['Enter', 'NumpadEnter'], fn: () => this.finishShaping() },
    ]);
    this.game.ui.setHints('<span class="fg-nolig">Press and hold on the blade, release to strike<br><kbd>A</kbd><kbd>D</kbd> pick a spot · hold <kbd>Space</kbd> to strike<br><kbd>E</kbd> reheat in the coals · <kbd>Esc</kbd> abandon</span>');
  }

  /** Measure where the hammer face lands relative to the mole at the impact pose. */
  measureSwing() {
    const rig = this.scene.mole;
    rig.face(this.scene.W.stations.anvil.yaw, true);
    rig.play('hammer');
    rig.swingPhase = IMPACT_PH;
    rig.update(0);
    rig.root.updateMatrixWorld(true);
    const f = this.scene.hammer.userData.face.getWorldPosition(new THREE.Vector3());
    this.swingOff = f.sub(rig.root.position);
  }

  toFire() {
    if (this.moving || this.swing || this.charge) return;
    const lost = this.sim.scaleInFire();
    this.game.audio.play('whoosh');
    const p = this.firePose();
    this.moveObj(this.view.group, p, 0.65, 0.45, () => { this.scene.puff(); this.game.audio.play('ignite'); });
    if (lost > 0.01) this.popOnce('scale', 'scale flakes off', this.scene.W.firePos.clone().add(_v2.set(0, 0.35, 0)), '#c8b8a8', 0.6, 20);
    this.go('heat');
  }

  update_hammer(dt) {
    const sc = this.scene, sim = this.sim, view = this.view, inp = this.game.input;
    sim.heatStep(dt, false, 0);
    const ready = !this.moving && !sc.moleWalk;
    // hover from the mouse
    let mouseCol = -1;
    if (ready && !this.charge && !this.swing) {
      const hit = sc.mouseOnPlane(view.group.position.y + 0.03, _v);
      if (hit) {
        const local = view.group.worldToLocal(_v.clone());
        mouseCol = view.pick(local.x, local.z);
        if (mouseCol >= 0 && inp.mouse.moved) this.selCol = mouseCol;
      }
      if (inp.pressed('KeyA', 'ArrowLeft')) this.selCol = Math.max(0, this.selCol - 1);
      if (inp.pressed('KeyD', 'ArrowRight')) this.selCol = Math.min(sim.length - 1, this.selCol + 1);
    }
    this.selCol = clamp(this.selCol, 0, sim.w.length - 1);
    view.hover = ready ? (this.charge ? this.charge.col : this.selCol) : -1;
    // start a blow
    if (ready && !this.charge && !this.swing) {
      let src = null, col = -1;
      if (inp.mousePressed(0) && mouseCol >= 0) { src = 'mouse'; col = mouseCol; }
      else if (inp.pressed('Space')) { src = 'key'; col = this.selCol; }
      if (src) {
        if (this.st.energy < ENERGY_PER_STRIKE) {
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
      this.swingPh = lerp(REST_PH, WIND_PH, ease.out(c.power));
      const s = sc.toScreen(this.colWorld(c.col));
      this.meter.show(s.x, s.y - 30, c.power, c.power >= 0.99 ? 'full' : '');
      const released = c.src === 'mouse' ? !inp.mouseDown(0) : !inp.isDown('Space');
      if (released) {
        this.view.ghost(-1);
        this.swing = { t: 0, from: this.swingPh, col: c.col, power: c.power, hit: false };
        this.charge = null;
        this.meter.hide();
        this.game.audio.play('whoosh');
      }
    }
    if (this.swing) {
      const s = this.swing;
      s.t += dt;
      if (s.t < 0.08) this.swingPh = lerp(s.from, IMPACT_PH, (s.t / 0.08) ** 2);
      else {
        if (!s.hit) { s.hit = true; this.resolveStrike(s.col, s.power); }
        const r = (s.t - 0.08) / 0.22;
        this.swingPh = IMPACT_PH - Math.sin(Math.min(1, r) * Math.PI) * (0.05 + 0.06 * s.power);
        if (r >= 1) { this.swing = null; this.swingPh = lerp(IMPACT_PH, REST_PH, 0.6); }
      }
    } else if (!this.charge) this.swingPh = lerp(this.swingPh, REST_PH, Math.min(1, dt * 6));
    // drive the mole
    const rig = sc.mole;
    if (!sc.moleWalk && sc.moleStation === 'anvil') {
      sc.molePose = 'hammer';
      rig.swingPhase = this.swingPh;
      if (this.swingOff) {
        const col = this.charge ? this.charge.col : this.swing ? this.swing.col : this.selCol;
        const target = this.colWorld(col);
        const st = sc.W.stations.anvil.pos;
        const tx = clamp(target.x - this.swingOff.x, st.x - 0.75, st.x + 0.75);
        const tz = clamp(target.z - this.swingOff.z, st.z - 0.2, st.z + 0.12);
        const kk = Math.min(1, dt * 10);
        rig.root.position.x += (tx - rig.root.position.x) * kk;
        rig.root.position.z += (tz - rig.root.position.z) * kk;
      }
    }
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

  colWorld(i) {
    const t = this.sim.w[i] ?? 0;
    return this.view.group.localToWorld(new THREE.Vector3((i + 0.5) * COL, 0.02 + t * 0.0045, 0));
  }

  resolveStrike(i, power) {
    const sc = this.scene, st = this.st, sim = this.sim, P = sc.particles;
    const ev = sim.strike(i, power);
    if (!ev) return;
    st.useEnergy(ENERGY_PER_STRIKE);
    st.learn('hammering');
    if (ev.kind === 'work') st.learn('working_heat');
    const pos = this.colWorld(i);
    this.view.squash(i, 0.5 + power * 0.5);
    const thin = clamp(1 - sim.w[i] / 6, 0, 1);
    if (ev.kind === 'cold') {
      this.game.audio.play('clunk', { vol: 0.6 + power * 0.6 });
      P.flakes(pos, 4 + Math.round(power * 6));
      sc.addShake(0.006 + power * 0.01);
      if (ev.crack) { this.game.audio.play('crack'); this.popOnce('crack', 'Crack!', pos.clone().add(_v2.set(0, 0.12, 0)), '#ff7a5a', 1, 0.5); }
      else this.popOnce('cold', 'Too cold!', pos.clone().add(_v2.set(0, 0.12, 0)), '#9ad0ff', 0.9, 1.4);
    } else {
      this.game.audio.play('clang', { pitch: 0.8 + thin * 0.45 + Math.random() * 0.06, vol: 0.55 + power * 0.6 });
      const n = 10 + Math.round(power * 28);
      P.sparks(pos, n, power, ev.kind === 'hot' || ev.kind === 'burn' ? 0xffffff : 0xfff0b0);
      sc.addShake(0.01 + power * 0.03);
      sc.extraLight = 2.5 + power * 4;
      if (ev.kind === 'burn') {
        P.burnSpray(pos, 26);
        this.game.audio.play('sizzle');
        this.popOnce('burn', 'Burning!', pos.clone().add(_v2.set(0, 0.14, 0)), '#ffffff', 0.9, 1.4);
        if (Math.random() < 0.3) sc.henReact('startle');
      }
    }
    const gain = ev.after - ev.before;
    if (Math.abs(gain) >= 0.02) this.popOnce('gain', (gain > 0 ? '+' : '') + Math.round(gain * 100) + '%', pos.clone().add(_v2.set(0.08, 0.06, 0)), gain > 0 ? '#8af07a' : '#ff8a6a', 0.6, 0.15);
    if (ev.grown.length) this.game.audio.play('creak');
  }

  finishShaping() {
    if (this.moving || this.swing || this.charge || this.asking) return;
    const acc = this.sim.accuracy();
    if (acc < 0.4) {
      // a cheap guard against an early Enter: a barely-shaped blade wastes the ingots
      this.asking = true;
      this.game.ui.confirm(`<b>Only ${Math.round(acc * 100)}% shaped.</b><br>The grindstone can only take off a little. Finish it anyway?`, 'Finish', 'Keep hammering').then((yes) => {
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
    sc.setShot('grind');
    sc.molePose = 'idle';
    sc.hammer.visible = false;
    this.rawShape = this.sim.accuracy();
    const c = W.grindContact;
    // the blade lies across the rim (along the axle), hilt toward the mole, and is drawn
    // sideways so the stone runs along the edge; sparks fly off the top toward the camera
    const axle = W.grindAxle, tan = W.grindTan;
    const rotY = Math.atan2(-axle.z, axle.x);
    const len = this.sim.length * COL;
    const reach = Math.min(0.5, len * 0.8);
    // hilt on the mole's right (-axle), tip out to its left; slide it so the stone runs along the edge
    const pose = (u) => ({ pos: c.clone().addScaledVector(axle, -(0.12 + (reach - 0.12) * u)).add(_v2.set(0, 0.012, 0)), rot: new THREE.Euler(0, rotY, 0) });
    for (const st of ['heat', 'hammer']) if (!this.done.includes(st)) this.done.push(st);
    sc.walkTo('grind', 'carry');
    this.moveObj(this.view.group, pose(0), 0.7, 0.4);
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
        const sp = 1.4 + Math.random() * 2.2, side = (Math.random() - 0.5) * 0.12;
        P.glow.spawn({ x: c.x + axle.x * side, y: c.y + 0.01, z: c.z + axle.z * side, vx: tan.x * sp + (Math.random() - 0.5) * 0.45, vy: 0.25 + Math.random() * 0.9, vz: tan.z * sp + (Math.random() - 0.5) * 0.45, life: 0.3 + Math.random() * 0.35, size: 0.018, size1: 0.005, color: 0xfff0b0, color1: 0xff7a1a, gravity: 4, drag: 1 });
      }
    });
    this.seq.call(() => {
      this.grindLoop?.stop();
      this.grindLoop = null;
      const r = this.grindRes;
      this.scores.shape = r.after;
      const msg = r.after - r.before >= 0.005 ? `Ground true: ${Math.round(r.before * 100)}% → ${Math.round(r.after * 100)}%` : `Shape ${Math.round(r.after * 100)}%`;
      sc.pop(msg, c.clone().add(_v2.set(0, 0.35, 0)), '#ffd34a', 0.8);
      this.game.audio.play(r.after > 0.85 ? 'good' : 'ding');
    }).wait(0.9).call(() => { this.busy = false; this.go('balance'); });
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
    this.orient.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
    this.bal = this.sim.balanceSetup();
    this.balW = 0;
    this.tiltAng = 0;
    this.tiltVel = 0;
    this.weapon.group.position.y = -this.bal.target * this.bladeLen;
    sc.setShot('bench');
    sc.walkTo('bench', 'idle');
    this.busy = true;
    this.moveObj(this.carrier, { pos: W.fulcrumTop.clone().add(_v2.set(0, 0.01, 0)), rot: new THREE.Euler(0, 0, 0) }, 0.9, 0.5, () => {
      this.busy = false;
      this.game.audio.play('place');
    });
    const assist = !!this.inf?.balanceAssist;
    this.balTol = balanceTolerance(assist);
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
    const s = balanceScore(this.balFrac, this.bal.target, !!this.inf?.balanceAssist);
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
    sc.setShot('hearth');
    sc.walkTo('bellows', 'pump');
    sc.pumpAllowed = true;
    this.inFire = true;
    this.plunged = false;
    this.busy = true;
    this.moveObj(this.carrier, this.quenchFirePose(), 0.8, 0.45, () => { this.busy = false; this.game.audio.play('ignite'); sc.puff(); });
    this.setQuenchActions();
    this.game.ui.setHints('<span class="fg-nolig"><kbd>Space</kbd> or hold the bellows: pump · <kbd>E</kbd> in/out of the fire<br><kbd>Q</kbd> or click the barrel: plunge · <kbd>Esc</kbd> abandon</span>');
  }

  setQuenchActions() {
    this.setActions([
      { label: this.inFire ? 'Pull it out ' : 'Back in the fire ', keyLabel: 'E', key: ['KeyE'], fn: () => this.toggleQuenchFire(), alt: true },
      { label: 'Plunge! ', keyLabel: 'Q', key: ['KeyQ'], fn: () => this.plunge() },
    ]);
  }

  quenchFirePose() {
    const fp = this.scene.W.firePos;
    return { pos: new THREE.Vector3(fp.x - 0.05, fp.y + 0.06, fp.z + 0.06), rot: new THREE.Euler(0.75, Math.PI, 0) };
  }

  quenchHoldPose() {
    const fp = this.scene.W.firePos;
    return { pos: new THREE.Vector3(fp.x + 0.2, fp.y + 0.32, fp.z + 0.62), rot: new THREE.Euler(0.9, Math.PI, 0.12) };
  }

  toggleQuenchFire() {
    if (this.busy || this.plunged) return;
    this.inFire = !this.inFire;
    this.busy = true;
    this.moveObj(this.carrier, this.inFire ? this.quenchFirePose() : this.quenchHoldPose(), 0.45, 0.15, () => { this.busy = false; });
    this.game.audio.play('whoosh');
    this.setQuenchActions();
  }

  update_quench(dt) {
    const sc = this.scene, inp = this.game.input;
    const T = this.coolWeapon(dt, this.inFire && !this.busy, sc.fire.air);
    this.thermo.set(T, dt);
    const [q0, q1] = this.m.quench;
    if (T > this.m.burn && !this.plunged) {
      this.sim.burnt += dt * 3 * Math.min(2, (T - this.m.burn) / 100 + 0.3);
      if (Math.random() < dt * 8) sc.particles.burnSpray(this.carrier.position, 5);
      this.popOnce('qburn', 'Burning!', this.carrier.position.clone().add(_v2.set(0, 0.25, 0)), '#ffffff', 0.9, 3);
    }
    if (!this.plunged) {
      if (T >= q0 && T <= q1) this.setStatus('<span class="fg-good">Right in the hardening window!</span>');
      else if (T > q1) this.setStatus('<span class="fg-warn">Too hot to quench safely.</span>');
      else this.setStatus(this.inFire ? 'Heating up for the quench.' : 'Cooling in the air.');
      if (inp.mousePressed(0) && !this.busy && sc.raycast([sc.W.barrel.group])) this.plunge();
    }
  }

  plunge() {
    if (this.busy || this.plunged) return;
    const sc = this.scene, W = sc.W, P = sc.particles;
    this.plunged = true;
    this.busy = true;
    sc.pumpAllowed = false;
    sc.walkTo('barrel', 'carry');
    sc.setShot('quench');
    const Tp = this.weaponT;
    const res = quenchResult(this.m, Tp);
    this.setActions([]);
    this.game.ui.setHints(null);
    const top = W.barrelTop.clone();
    const above = { pos: top.clone().add(_v2.set(0, 0.42 + this.bladeLen * 0.5, 0)), rot: new THREE.Euler(0, 0, -Math.PI / 2) };
    const dunk = { pos: top.clone().add(_v2.set(0, 0.05 + this.bladeLen * 0.5 - this.bladeLen * 0.85, 0)), rot: new THREE.Euler(0, 0, -Math.PI / 2) };
    this.game.audio.play('whoosh');
    this.moveObj(this.carrier, above, 0.55, 0.3);
    this.seq.add(0.22, (k) => { this.carrier.position.lerpVectors(above.pos, dunk.pos, ease.in(k)); })
      .call(() => {
        this.game.audio.play('quench');
        this.game.audio.play('steam');
        P.steam(top, 70, 0.35, 1.3);
        P.bubbles(top, 14, 0.4);
        W.water.splash(1.4);
        sc.waterEnergy = 1.2;
        sc.addShake(0.02);
        this.st.learn('quenching');
        if (res.crack) { this.game.audio.play('crack'); setTimeout(() => this.game.audio.play('crack'), 160); }
      })
      .add(1.1, (k, dt) => {
        this.weaponT = lerp(Tp, 60, ease.out(k));
        applyHeat(this.weapon.mat, 0xffffff, this.weaponT, 0.9);
        if (Math.random() < dt * 30) P.steam(top, 2, 0.3, 0.8);
        if (Math.random() < dt * 20) P.bubbles(top, 2, 0.3);
      })
      .add(0.45, (k) => { this.carrier.position.lerpVectors(dunk.pos, above.pos, ease.out(k)); })
      .call(() => {
        this.scores.quench = res.score;
        if (res.crack) this.sim.cracks[Math.floor(this.sim.length * 0.4)] = Math.max(1, this.sim.cracks[Math.floor(this.sim.length * 0.4)] || 0);
        const words = res.kind === 'good' ? (res.score > 0.95 ? ['Perfect temper!', '#ffd34a'] : ['Hardened!', '#8af07a']) : res.kind === 'hot' ? (res.crack ? ['Cracked!', '#ff7a5a'] : ['Too hot, brittle', '#ffb07a']) : ['Too cold, soft', '#9ad0ff'];
        sc.pop(words[0], top.clone().add(_v2.set(0, 0.6, 0)), words[1], 1);
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
    sc.walkTo('anvil', 'idle');
    sc.hammer.visible = true;
    sc.setShot('infuse');
    const af = W.anvilFace;
    this.busy = true;
    this.infPhase = 'wait';
    this.moveObj(this.carrier, { pos: new THREE.Vector3(af.x + 0.05, af.y + 0.03, af.z), rot: new THREE.Euler(0, 0, 0) }, 0.8, 0.4, () => {
      this.busy = false;
      this.game.audio.play('place');
      this.startRing();
    });
    this.crystal = makeCrystal(this.inf.color, 0.5);
    this.crystal.mesh.position.set(af.x + 0.05, af.y + 0.2, af.z + 0.12);
    sc.scene.add(this.crystal.mesh);
    this.lightning = new Lightning(sc.scene, INFUSION_FX[this.sel.infusion]?.color ?? this.inf.color);
    this.setActions([]);
    this.setStatus(`${ITEMS[this.sel.infusion].name} hums above the blade.`);
    this.game.ui.setHints('<span class="fg-nolig">Tap <kbd>Space</kbd> or click when the rings meet</span>');
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
    if (c && c.mesh.visible) {
      c.mesh.rotation.y += dt * 2;
      c.mesh.position.y += Math.sin(this.time * 3) * 0.0008;
      c.mat.color.setScalar(0.8 + Math.sin(this.time * 6) * 0.2);
    }
    if (this.infPhase === 'ring') {
      this.ringT += dt;
      const R0 = 48, k = this.ringT / 1.5;
      const r = R0 * (3 - 3 * k);
      const s = sc.toScreen(c.mesh.position);
      for (const n of [this.ringTarget, this.ringMove]) { n.style.left = s.x + 'px'; n.style.top = s.y + 'px'; }
      this.ringMove.style.width = this.ringMove.style.height = Math.max(0, r * 2) + 'px';
      const tap = inp.pressed('Space') || inp.mousePressed(0);
      if (tap || r <= 2) {
        const e = Math.abs(r - R0) / R0;
        const q = tap ? (e < 0.12 ? 'perfect' : e < 0.3 ? 'good' : 'ok') : 'ok';
        this.infuseBonus = q === 'perfect' ? 4 : q === 'good' ? 2 : 0.5;
        this.infQ = q;
        this.ringTarget.remove(); this.ringMove.remove();
        this.releaseInfusion();
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
      if (this.sel.infusion === 'gravium') this.carrier.position.y = this.infBaseY + Math.sin(Math.min(1, this.fxT / 2.4) * Math.PI) * 0.12;
      if (this.fxT > 2.6 && !this.infEnded) { this.infEnded = true; this.go('result'); }
    }
  }

  releaseInfusion() {
    const sc = this.scene, P = sc.particles;
    const c = this.crystal;
    const pos = c.mesh.position.clone();
    const fx = INFUSION_FX[this.sel.infusion];
    const words = { perfect: ['Perfect infusion!', '#ffd34a'], good: ['Infused!', '#8af07a'], ok: ['Infused', '#e6dcc8'] }[this.infQ];
    sc.pop(words[0], pos.clone().add(_v2.set(0, 0.2, 0)), words[1], 1);
    this.game.audio.play(this.infQ === 'perfect' ? 'perfect' : 'good');
    if (fx?.sound) this.game.audio.play(fx.sound);
    this.game.audio.play('sparkle');
    P.sparkle(pos, this.inf.color, 30, 0.3, 0.3);
    c.mesh.visible = false;
    this.st.learn('infusion');
    this.infPhase = 'fx';
    this.fxT = 0;
    this.infBaseY = this.carrier.position.y;
    sc.extraLight = 4;
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
    // reveal: the blade floats in front of the camera, slowly turning and glowing
    sc.setShot('reveal');
    sc.walkTo('idle', 'idle');
    this.savedPost = { vignette: sc.post.vignette, brightness: sc.post.brightness };
    this.savedHemi = { sky: sc.W.hemi.color.getHex(), i: sc.W.hemi.intensity };
    const shot = sc.W.shots.reveal;
    const fwd = shot.look.clone().sub(shot.pos).normalize();
    const right = fwd.clone().cross(UP).normalize();
    const spot = shot.pos.clone().addScaledVector(fwd, 1.7).addScaledVector(right, -0.42).add(_v2.set(0, -0.06, 0));
    const total = this.bladeLen + this.weapon.hiltLength;
    const scale = clamp(0.95 / total, 0.5, 1.6);
    this.weapon.mat.color.setRGB(1, 1, 1);
    this.weapon.mat.emissive.setRGB(0, 0, 0);
    this.weapon.group.position.y = -(this.bladeLen - this.weapon.hiltLength) / 2;
    this.orient.rotation.set(0, 0, 0);
    this.carrier.rotation.set(0, 0, 0);
    this.carrier.scale.setScalar(scale);
    this.revealSpin = 0;
    this.revealFrom = this.carrier.position.clone();
    this.revealSpot = spot;
    this.revealBack = fwd.clone();
    this.revealT = 0;
    this.gradeCol = new THREE.Color(grade.color);
    this.halo = makeHalo(grade.color);
    sc.scene.add(this.halo);
    this.game.audio.play('whoosh');
    const later = (ms, fn) => setTimeout(() => { if (sc.game.scene === sc && sc.activity === this) fn(); }, ms);
    later(350, () => this.game.audio.play('fanfare'));
    later(1450, () => this.game.audio.play('success'));
    if (grade.g === 'S' || grade.g === 'A') { later(900, () => sc.henReact('great')); sc.molePose = 'cheer'; }
    else if (grade.g === 'F') later(900, () => sc.henReact('bad'));
    this.buildCard(w, grade, { shape, temper, balance, quench: hasQ ? quench : null, bonus });
  }

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
    const sc = this.scene, P = sc.particles;
    this.revealT += dt;
    const k = Math.min(1, this.revealT / 0.9);
    arcPoint(this.revealFrom, this.revealSpot, 0.4, ease.out(k), this.carrier.position);
    this.carrier.position.y += Math.sin(this.time * 1.6) * 0.012 * k;
    this.revealSpin += dt * (1.2 - 0.6 * k);
    this.carrier.rotation.y = this.revealSpin;
    this.carrier.rotation.z = Math.sin(this.time * 0.9) * 0.05;
    const glow = 0.07 + 0.05 * Math.sin(this.time * 3);
    this.weapon.mat.emissive.copy(this.gradeCol).multiplyScalar(glow * k);
    if (this.weapon.veinMat) this.weapon.veinMat.color.setScalar(0.8 + 0.3 * Math.sin(this.time * 5));
    if (Math.random() < dt * 14) P.sparkle(this.carrier.position, this.gradeCol.getHex(), 1, 0.5, 0.15);
    if (this.halo) {
      this.halo.position.copy(this.carrier.position).addScaledVector(this.revealBack, 0.35);
      this.halo.material.opacity = (0.4 + 0.1 * Math.sin(this.time * 2.4)) * k;
      this.halo.scale.setScalar(0.95 + 0.05 * Math.sin(this.time * 1.7));
    }
    sc.post.vignette = lerp(this.savedPost.vignette ?? 0.38, 0.75, k);
    sc.W.hemi.color.setHex(this.savedHemi.sky).lerp(_white, 0.55 * k);
    sc.W.hemi.intensity = lerp(this.savedHemi.i, this.savedHemi.i * 1.25, k);
    sc.post.brightness = lerp(this.savedPost.brightness ?? 1, 0.92, k);
    sc.extraLight = 2 * k;
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
    this.scene.extraLight = Math.max(0, (this.scene.extraLight || 0) - dt * 14);
  }
}
