// Smelting: keep the crucible inside its heat band with the bellows, then pour an ingot.
import * as THREE from 'three';
import { el } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { METALS, FORGE_MAX_TEMP } from '../data/weapons.js';
import { iconURL } from '../gfx/PixelArt.js';
import { qColor } from '../ui/UI.js';
import { CrucibleSim } from './bladeSim.js';
import { applyHeat, glowColor, glowHex, glowAmount } from './blackbody.js';
import { makeCrucible, makeIngot, V, P as PV } from './models.js';
import { S, MS } from './world.js';
import { Thermo, bar, setText, setHtml, confirmText } from './ui.js';
import { Seq, ease, arcPoint } from './fx.js';

const QUICK_ACC = 0.8;

/** Availability of a smelting recipe for the current save. */
export function smeltStatus(st, r) {
  const lvl = st.data.forgeLevel || 0;
  const known = Object.keys(r.inputs).every((id) => st.known('mineral', id) || st.count(id) > 0) || st.count(r.out) > 0;
  let why = null;
  if ((r.forge || 0) > lvl) why = r.forge === 1 ? 'Too hot for this hearth: needs the Double Bellows plans from Inkwell Plans.' : 'Too hot for this hearth: needs the Magma Hearth plans from Inkwell Plans.';
  else {
    for (const [id, n] of Object.entries(r.inputs)) {
      if (st.count(id) < n) { why = `Need ${n} ${known ? ITEMS[id].name : 'unknown ore'}.`; break; }
    }
    if (!why && st.count('coal') < r.coal) why = `Need ${r.coal} coal.`;
  }
  let batches = Math.floor(st.count('coal') / r.coal);
  for (const [id, n] of Object.entries(r.inputs)) batches = Math.min(batches, Math.floor(st.count(id) / n));
  return { ok: !why, why, known, batches: Math.max(0, Math.min(99, batches)), learned: !!st.flag('forge.smelted.' + r.id) };
}

/** Remove one batch of inputs (best-quality ore lots first) and its coal. */
export function takeInputs(st, r) {
  const ores = [];
  for (const [id, n] of Object.entries(r.inputs)) {
    const lots = st.lotsOf(id).slice().sort((a, b) => b.q - a.q).slice(0, n);
    for (const l of lots) { const got = st.removeLot(l.uid); if (got) ores.push(got); }
  }
  const c = st.removeItem('coal', r.coal);
  const coal = Array.isArray(c) ? c : [];
  const avgQ = ores.length ? ores.reduce((s, l) => s + l.q, 0) / ores.length : 100;
  return { ores, coal, avgQ };
}

export function refundInputs(st, taken) {
  for (const l of [...taken.ores, ...taken.coal]) st.addItem(l.id, { spill: true, q: l.q, p: l.p });
}

export function ingotQuality(avgQ, acc) {
  return Math.max(1, Math.round(avgQ * (0.7 + 0.3 * acc)));
}

function learnFor(st, r) {
  st.learn('smelting');
  if (r.out === 'bronze_ingot' || r.out === 'steel_ingot') st.learn('alloys');
}

/** Resolve n batches instantly at a steady 80% accuracy. Returns {count, avgQ} or null. */
export function quickSmelt(st, r, n) {
  let count = 0, qsum = 0;
  for (let i = 0; i < n; i++) {
    if (!smeltStatus(st, r).ok) break;
    const t = takeInputs(st, r);
    const q = ingotQuality(t.avgQ, QUICK_ACC);
    st.addItem(r.out, { spill: true, q, n: r.n });
    st.emit?.('act', { type: 'smelt', id: r.out, recipe: r.id, q, quick: true });
    count += r.n; qsum += q * r.n;
  }
  if (!count) return null;
  learnFor(st, r);
  return { count, avgQ: Math.round(qsum / count) };
}

const _v = new THREE.Vector3();
const GRIP = new THREE.Vector3(0, 15 * PV, -8.6 * PV); // where the tongs hold the crucible's rim (local)
const CS = 0.3; // crucible model scale (× the room's): a pot about 13 cm across

/**
 * Smelting at the hearth, in first person: the crucible sits in the coals with the tongs resting
 * on its rim (left paw); the right paw works the bellows pull to hold the melt in its heat band.
 * Then the tongs lift the crucible over to the ingot mold and pour.
 */
export class SmeltGame {
  constructor(scene, recipe) {
    this.scene = scene;
    this.game = scene.game;
    this.st = scene.game.state;
    this.r = recipe;
    this.seq = new Seq();
    this.phase = 'idle';
    this.elapsed = 0;
    this.nodes = [];
  }

  start() {
    const sc = this.scene, st = this.st, r = this.r, W = sc.W;
    const lvl = st.data.forgeLevel || 0;
    this.taken = takeInputs(st, r);
    this.sim = new CrucibleSim(r, lvl, st.skill?.('forge') || 1); // the Smithing skill widens the pouring band
    const firstOre = Object.keys(r.inputs)[0];
    const metal = METALS[ITEMS[r.out].metal];
    this.metalColor = metal?.color ?? 0xd9773f;
    const oreCol = ITEMS[firstOre]?.icon?.ore?.[0] ?? this.metalColor;
    this.cru = makeCrucible(oreCol);
    this.cru.group.scale.setScalar(CS * S);
    this.cru.group.rotation.y = Math.PI; // spout toward the mold (west), the rim the tongs hold toward the smith
    this.home = W.firePos.clone().add(new THREE.Vector3(0.0, -0.03, 0.04));
    this.cru.group.position.copy(this.home);
    sc.scene.add(this.cru.group);
    // first person: at the hearth, tongs on the crucible's rim, the other paw on the bellows pull
    sc.dock('hearth');
    sc.tool('tongs');
    sc.paws.set('R', { mode: 'pull' });
    sc.paws.set('L', { mode: 'tongs', at: () => this.gripWorld() });
    sc.paws.jaw = 0.45;
    sc.pumpAllowed = true;
    // UI
    this.thermo = new Thermo(sc.layer, FORGE_MAX_TEMP[lvl]);
    this.thermo.setTitle('Crucible');
    this.thermo.setMarks([
      { kind: 'melt', range: this.sim.band, label: 'pour heat' },
      { kind: 'burn', at: this.sim.slagT, label: 'slag' },
    ]);
    this.timeBar = bar('warm');
    this.meltBar = bar();
    this.slagBar = bar('bad');
    this.timeTxt = el('b');
    this.meltTxt = el('b');
    this.slagTxt = el('b');
    this.status = el('div', { class: 'fg-note' });
    const out = ITEMS[r.out];
    this.panel = el('div', { class: 'panel fg-side act fg-col' }, [
      el('div', { class: 'fg-kicker' }, 'Smelting'),
      el('h2', {}, out.name + (r.n > 1 ? ' ×' + r.n : '')),
      el('p', { class: 'sub', html: `${Object.entries(r.inputs).map(([id, n]) => `${n}× ${ITEMS[id].name}`).join(' + ')} + ${r.coal} coal · ore quality <b style="color:${qColor(this.taken.avgQ)}">${Math.round(this.taken.avgQ)}%</b>` }),
      el('div', { class: 'fg-stat' }, [el('span', {}, 'Melted'), this.meltTxt, this.meltBar.el]),
      el('div', { class: 'fg-stat' }, [el('span', {}, 'Time'), this.timeTxt, this.timeBar.el]),
      el('div', { class: 'fg-stat' }, [el('span', {}, 'Slag'), this.slagTxt, this.slagBar.el]),
      this.status,
    ]);
    sc.layer.append(this.panel);
    this.nodes.push(this.panel);
    this.bigHint = el('div', { class: 'fg-big-hint' }, document.documentElement.classList.contains('is-touch') ? 'Hold the button to pump' : 'Hold to pump the bellows');
    sc.layer.append(this.bigHint);
    this.nodes.push(this.bigHint);
    this.game.ui.setHints('<span class="fg-nolig">Hold the mouse or <kbd>Space</kbd>: pump the bellows<br><kbd>Esc</kbd> stop smelting</span>');
    this.phase = 'heat';
    this.wasInBand = false;
    this.game.audio.play('place');
  }

  /** The touch screen's big button. */
  touchAction() { return this.phase === 'heat' ? { kind: 'pump', label: 'Pump' } : null; }

  /** Where the tongs bite the crucible's rim (world). */
  gripWorld(out = new THREE.Vector3()) {
    this.cru.group.updateMatrixWorld(true);
    return this.cru.group.localToWorld(out.copy(GRIP));
  }

  onEscape() {
    if (this.phase !== 'heat') return true;
    this.game.ui.confirm(confirmText('Stop smelting?', 'The ore and coal go back in your bag.'), 'Stop', 'Keep going').then((yes) => {
      if (!yes || this.phase !== 'heat') return;
      refundInputs(this.st, this.taken);
      this.phase = 'done';
      this.scene.endActivity('smelt');
    });
    return true;
  }

  update(dt) {
    const sc = this.scene, sim = this.sim;
    this.elapsed += dt;
    if (this.phase === 'heat') {
      if (!sim.started && (sc.fire.pumping || this.elapsed > 2.5)) sim.started = true;
      sim.step(dt, sc.fire.air);
      this.updateVisuals(dt);
      this.updateUI(dt);
      if (this.bigHint && (sim.started || sc.fire.pumping)) { this.bigHint.remove(); this.bigHint = null; }
      if (sim.done) this.finish();
    } else if (this.phase === 'pour') {
      this.thermo.set(sim.T, dt);
      sim.T = Math.max(25, sim.T - dt * 120);
    }
    sc.workSrc = this.phase === 'done' ? null : { pos: this.cru.group.position, T: this.phase === 'heat' ? sim.T : this.pourT ?? sim.T };
    sc.paws.heat = Math.min(1, glowAmount(sim.T) * 0.6);
    this.seq.update(dt);
    this.cru.group.visible = this.phase !== 'done';
  }

  updateVisuals(dt) {
    const sim = this.sim, cru = this.cru, P = this.scene.particles;
    applyHeat(cru.mat, 0xffffff, sim.T, 0.42);
    const k = sim.progress;
    cru.melt.scale.set(0.55 + k * 0.45, 1, 0.55 + k * 0.45);
    cru.melt.position.y = (1.6 + k * 3.6) * V;
    cru.melt.visible = k > 0.02 || sim.T > this.r.temp[0] - 100;
    glowColor(Math.max(sim.T, 700), cru.meltMat.color, 1.2);
    if (sim.overheat) cru.meltMat.color.lerp(new THREE.Color(0x3a2a20), 0.5);
    for (let i = 0; i < cru.chunks.length; i++) {
      const s = Math.max(0, 1 - k * 1.4 + i * 0.06);
      cru.chunks[i].scale.setScalar(s);
      cru.chunks[i].visible = s > 0.05;
    }
    const top = _v.copy(cru.group.position).add(new THREE.Vector3(0, 5 * V * CS * S, 0));
    if (sim.inBandNow && Math.random() < dt * 8) P.sparkle(top, 0xffd27a, 1, 0.12, 0.2);
    if (sim.T > this.r.temp[0] - 150 && Math.random() < dt * 5) P.glow.spawn(P.w({ x: top.x + (Math.random() - 0.5) * 0.04, y: top.y, z: top.z + (Math.random() - 0.5) * 0.04, vx: 0, vy: 0.25, vz: 0, life: 0.5, size: 0.012, size1: 0.004, color: 0xffe08a, color1: 0xff6a1a, gravity: -0.2 }));
    if (sim.overheat) {
      if (Math.random() < dt * 14) P.flakes(top, 1);
      if (Math.random() < dt * 3) this.game.audio.play('hiss');
    }
    if (sim.inBandNow && !this.wasInBand) this.game.audio.play('glow');
    this.wasInBand = sim.inBandNow;
  }

  updateUI(dt) {
    const sim = this.sim;
    this.thermo.set(sim.T, dt);
    this.meltBar.set(sim.progress);
    setText(this.meltTxt, Math.round(sim.progress * 100) + '%');
    const left = Math.max(0, sim.limit - sim.time);
    this.timeBar.set(left / sim.limit, left < 4 ? 'bad' : 'warm');
    setText(this.timeTxt, sim.started ? left.toFixed(1) + 's' : 'ready');
    this.slagBar.set(Math.min(1, sim.impurity / 0.6));
    setText(this.slagTxt, sim.impurity > 0.005 ? '−' + Math.round(sim.impurity * 100) + '%' : 'clean');
    let s;
    if (!sim.started) s = 'The crucible sits in the coals.';
    else if (sim.overheat) s = '<span class="fg-warn">Too hot! Slag is forming.</span>';
    else if (sim.inBandNow) s = '<span class="fg-good">Melting nicely.</span>';
    else if (sim.T < sim.band[0]) s = 'Not hot enough to melt.';
    else s = 'Above pouring heat.';
    setHtml(this.status, s);
  }

  finish() {
    const sc = this.scene, sim = this.sim, cru = this.cru, W = sc.W;
    this.phase = 'pour';
    sc.pumpAllowed = false;
    this.acc = sim.accuracy;
    this.q = ingotQuality(this.taken.avgQ, this.acc);
    this.game.ui.setHints(null);
    this.updateUI(0);
    setHtml(this.status, this.acc >= 0.3 ? '<span class="fg-good">Molten! Pouring the ingot...</span>' : 'Pouring what melted...');
    const mold = W.mold;
    const moldTop = W.moldTop.clone();
    const start = cru.group.position.clone();
    const spoutK = 4.5 * V * CS * S; // the spout sits this far west of the crucible's middle
    const over = moldTop.clone().add(new THREE.Vector3(spoutK + 0.01, 0.1, 0.0));
    const pourT = Math.max(1000, sim.T);
    this.pourT = pourT;
    const stream = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: glowHex(pourT) }));
    stream.visible = false;
    sc.scene.add(stream);
    this.stream = stream;
    const ingot = makeIngot(this.metalColor);
    ingot.scale.setScalar(MS * S);
    ingot.visible = false;
    sc.scene.add(ingot);
    this.ingot = ingot;
    const fillMat = mold.fillMat;
    fillMat.color.setHex(this.metalColor);
    const P = sc.particles;
    const spout = new THREE.Vector3();
    const verdict = this.acc >= 0.9 ? ['Perfect melt!', '#ffd34a'] : this.acc >= 0.6 ? ['Good melt', '#8af07a'] : this.acc >= 0.3 ? ['Lumpy melt', '#e6dcc8'] : ['Barely melted', '#d96a5a'];
    sc.lesson?.event('melt', { acc: this.acc, run: this });
    sc.pop(verdict[0], start.clone().add(new THREE.Vector3(0, 0.18, 0)), verdict[1], 1);
    this.game.audio.play(this.acc >= 0.9 ? 'perfect' : this.acc >= 0.6 ? 'good' : 'oops');
    this.thermo.el.hidden = true;
    // the tongs clamp the rim, the right paw lets go of the pull and comes round under the pot
    sc.paws.jaw = 0;
    sc.paws.set('R', null);
    const blockTop = 13 * PV * S + 0.002; // the top of the stone block
    const land = moldTop.clone().add(new THREE.Vector3(0.02, 0, 0.13));
    land.y = blockTop;
    const rest = moldTop.clone().add(new THREE.Vector3(0.06, 0, -0.14));
    rest.y = blockTop;
    this.seq
      .wait(0.35)
      .call(() => sc.dock('mold', { dur: 0.9 }))
      .add(0.8, (k) => { arcPoint(start, over, 0.12, ease.inOut(k), cru.group.position); })
      .call(() => { this.game.audio.play('pour'); })
      .add(0.35, (k) => { cru.group.rotation.z = -ease.out(k) * 1.15; })
      .call(() => { mold.fill.visible = true; })
      .add(1.4, (k, dt) => {
        cru.group.updateMatrixWorld();
        spout.set(4.5 * V, 6.5 * V, 0).applyMatrix4(cru.group.matrixWorld);
        const a = spout, b = moldTop;
        stream.visible = k < 0.92;
        stream.position.set(b.x, (a.y + b.y) / 2, b.z);
        stream.scale.set(0.008, Math.max(0.005, a.y - b.y), 0.008);
        stream.material.color.setHex(glowHex(pourT - k * 120));
        mold.fill.scale.y = Math.max(0.001, ease.out(k));
        applyFill(fillMat, this.metalColor, pourT);
        if (Math.random() < dt * 40) P.glow.spawn(P.w({ x: b.x + (Math.random() - 0.5) * 0.025, y: b.y + 0.005, z: b.z + (Math.random() - 0.5) * 0.02, vx: (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.4, life: 0.4, size: 0.014, size1: 0.004, color: 0xffe08a, color1: 0xff6a1a, gravity: 4 }));
        if (Math.random() < dt * 6) P.smoke(b, 0.1, 0.6);
        sc.workSrc = { pos: b, T: pourT };
      })
      .call(() => { stream.visible = false; })
      .add(0.35, (k) => { cru.group.rotation.z = -1.15 * (1 - ease.inOut(k)); })
      .call(() => sc.paws.set('R', { mode: 'low' }))
      // set the hot pot down on the block beside the mold
      .add(0.6, (k) => { arcPoint(over, rest, 0.05, ease.inOut(k), cru.group.position); applyHeat(cru.mat, 0xffffff, 1100 * (1 - k * 0.5), 0.42); })
      .call(() => { sc.paws.jaw = 0.6; this.game.audio.play('place', { vol: 0.6 }); })
      .add(1.0, (k) => { applyFill(fillMat, this.metalColor, pourT - (pourT - 380) * ease.out(k)); if (Math.random() < 0.15) P.smoke(moldTop, 0.12, 0.5); })
      .call(() => {
        mold.fill.visible = false;
        ingot.visible = true;
        ingot.position.copy(moldTop).add(new THREE.Vector3(0, -0.012, 0));
        this.game.audio.play('ding');
        P.sparkle(moldTop, 0xfff0b0, 14, 0.2, 0.4);
      })
      .add(0.55, (k) => {
        arcPoint(moldTop, land, 0.08, k, ingot.position);
        ingot.rotation.y = k * 4.5;
        ingot.rotation.z = Math.sin(k * Math.PI) * 0.8;
        applyHeat(ingot.userData.mat, 0xffffff, 380 * (1 - k), 1);
      })
      .call(() => { this.game.audio.play('place'); this.reward(); })
      .wait(1.6)
      .call(() => { this.phase = 'done'; sc.endActivity('smelt'); });
  }

  reward() {
    const st = this.st, r = this.r, sc = this.scene;
    st.addItem(r.out, { spill: true, q: this.q, n: r.n });
    st.emit?.('act', { type: 'smelt', id: r.out, recipe: r.id, q: this.q });
    sc.lesson?.event('ingot', { id: r.out, q: this.q, run: this });
    const first = !st.flag('forge.smelted.' + r.id);
    st.flag('forge.smelted.' + r.id, true);
    learnFor(st, r);
    const out = ITEMS[r.out];
    const msg = `+${r.n} ${out.name} <b style="color:${qColor(this.q)}">${this.q}%</b>`;
    this.game.ui.toast(msg, { icon: iconURL(r.out), kind: 'good' });
    sc.pop(`+${r.n} ${out.name}`, this.ingot.position.clone().add(new THREE.Vector3(0, 0.12, 0)), '#ffd34a', 0.8);
    sc.menus.lastSmelt = `Last pour: <b>${r.n}× ${out.name}</b> at <b style="color:${qColor(this.q)}">${this.q}%</b> (heat control ${Math.round(this.acc * 100)}%).` + (first ? ' Quick smelting unlocked for this recipe.' : '');
    if (this.acc >= 0.9) sc.henReact('great');
  }

  dispose() {
    const sc = this.scene;
    for (const n of this.nodes) n.remove();
    this.thermo?.remove();
    if (this.cru) { sc.scene.remove(this.cru.group); disposeTree(this.cru.group); }
    if (this.stream) { sc.scene.remove(this.stream); this.stream.geometry.dispose(); this.stream.material.dispose(); }
    if (this.ingot) { sc.scene.remove(this.ingot); disposeTree(this.ingot); }
    sc.W.mold.fill.visible = false;
    sc.pumpAllowed = false;
    sc.workSrc = null;
    sc.paws.heat = 0;
  }
}

function applyFill(mat, base, T) {
  applyHeat(mat, base, T, 1.3);
}

export function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    if (o.material && !o.material.userData?.shared) o.material.dispose();
  });
}
