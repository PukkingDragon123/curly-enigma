// The kitchen at home. Pick 1–3 ingredients from the pantry, then cook them in first person
// (the mole's own paws, Cooking-Mama style) through the recipe's minigame steps, and see what
// comes out. Unknown combos make Mystery Mush. Recipes are recorded in the Index Book.
import * as THREE from 'three';
import { Scene, disposeObject } from '../core/Scene.js';
import { Kitchen, SPOTS, BOARD_TOP } from '../cooking/kitchen.js';
import { Paws } from '../cooking/paws.js';
import { Particles, sparkle, puff, steam } from '../cooking/fx.js';
import { CookUI, gradeOf, STEP_LABEL } from '../cooking/ui.js';
import { Contents, VESSEL } from '../cooking/vessels.js';
import { makeStep } from '../cooking/steps/index.js';
import { chopQueue, dishColor, slabMesh, spriteCells, standeeMesh } from '../cooking/food.js';
import { findRecipe, DISHES } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';
import { makeChicken } from '../gfx/characters.js';
import { pick } from '../core/util.js';

// camera per station: offset from the station point, and look-at offset
const CAM = {
  board: { off: [0, 1.3, 1.15], look: [0, 0, -0.15] },
  bowl: { off: [0, 1.5, 1.3], look: [0, 0.06, -0.18] },
  cup: { off: [0, 1.35, 1.2], look: [0, 0.1, -0.15] },
  plate: { off: [0, 1.45, 1.3], look: [0, 0.05, -0.2] },
  pot: { off: [0, 1.62, 1.3], look: [0, 0.18, -0.16] },
  pan: { off: [0, 1.5, 1.3], look: [0, 0.06, -0.2] },
  pantry: { at: 'board', off: [0.6, 1.6, 2.15], look: [0.6, 0.36, -0.6] },
  result: { at: 'plate', off: [-0.45, 1.45, 1.75], look: [-0.45, 0.24, -0.25] },
};

const LINES = {
  Perfect: ['Grandma Mole would be proud!', 'Chef\'s kiss! Mwah!', 'The surface folks would line up for this.', 'Nugget is doing a little happy dance.'],
  Great: ['Smells just like home.', 'Your whiskers are tingling. Good sign!', 'Nugget approves wholeheartedly.', 'That one goes in the family cookbook.'],
  Good: ['Tasty! A little rustic.', 'Solid cooking, little digger.', 'Not bad for a mole with spade paws.'],
  Okay: ['Edible. Mostly.', 'Well... it\'s food.', 'It has a certain underground charm.'],
  Burnt: ['Crispy. Very crispy.', 'Smoke means flavor, right?', 'Nugget slowly backs away.'],
  mush: ['What... is it?', 'It wobbled. Was it supposed to wobble?', 'Technically food.', 'Nugget refuses to make eye contact with it.'],
};

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export default class CookingScene extends Scene {
  async enter(params) {
    this.params = params;
    this.hud = 'mini';
    this.music = 'cooking';
    this.allowMenus = false;
    this.scene.background = new THREE.Color(0x1a1010);
    this.camera.fov = 42;
    this.camera.near = 0.1;
    this.camera.far = 40;
    this.camera.updateProjectionMatrix();
    this.post = { innerThresh: 0.15, vignette: 0.42, tint: 0xfff2e2, saturation: 1.1 };

    this.kitchen = new Kitchen(this.scene);
    const ks = this.kitchen.stats;
    console.log(`[cooking] kitchen built in ${ks.ms.toFixed(0)} ms (${ks.batched} props → ${ks.batches} batches)`);
    this.own(() => { for (const t of this.kitchen.flameTextures || []) t.dispose(); });
    this.paws = new Paws(this.scene);
    this.fx = new Particles(this.scene);
    this.contents = new Contents(this.kitchen);
    this.ui = new CookUI(this.game);
    this.own(() => this.ui.destroy());

    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(UP, 0);
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camGoal = new THREE.Vector3();
    this.lookGoal = new THREE.Vector3();
    this.shakeAmp = 0;
    this.tweens = [];
    this.leftovers = [];
    this.previews = [];
    this.loops = {};
    this.selected = [];
    this.phase = 'pantry';
    this.phaseT = 0;

    // remember whether the last press was a finger (touch kneading uses screen halves)
    const onDown = (e) => { this.lastPointer = e.pointerType; };
    this.game.canvas.addEventListener('pointerdown', onDown, true);
    this.own(() => this.game.canvas.removeEventListener('pointerdown', onDown, true));

    // keep the pantry honest if the inventory changes while it's open (eating from the bag...)
    this.own(this.game.state.on('items', () => { if (this.phase === 'pantry' && this.ui.pantryRender) this.ui.pantryRender(); }));

    this.setView('pantry', true);
    this.updateCamera(0);
    this.pawIdle(0, true);

    // dev/test shortcuts: ?cook=a,b&steps=chop,stir
    const pre = (params.cook || '').split(',').filter((id) => ITEMS[id] && this.game.state.count(id) > 0).slice(0, 3);
    if (pre.length) this.startCooking(pre);
    else this.openPantry();
  }

  // ------------------------------------------------------------------ helpers
  spot(name) { return SPOTS[name] || SPOTS.board; }

  mouseOnPlane(h, out = new THREE.Vector3()) {
    const m = this.game.input.mouse;
    this.ray.setFromCamera({ x: m.nx, y: m.ny }, this.camera);
    this.plane.constant = -h;
    return this.ray.ray.intersectPlane(this.plane, out);
  }

  shake(a) { this.shakeAmp = Math.max(this.shakeAmp, a * (this.game.state.data.settings.shake ?? 1)); }

  tween(dur, fn, done) { this.tweens.push({ t: 0, dur, fn, done }); }

  loop(name, on, vol = 0.6) {
    const audio = this.game.audio;
    if (on && !this.loops[name]) this.loops[name] = audio.loop(name, { vol });
    else if (on) this.loops[name].set({ vol });
    else if (!on && this.loops[name]) { this.loops[name].stop(0.4); delete this.loops[name]; }
  }

  setView(name, instant = false) {
    const c = CAM[name] || CAM.board;
    const at = this.spot(c.at || name);
    this.camGoal.copy(at).add(v3(c.off));
    this.lookGoal.copy(at).add(v3(c.look));
    if (instant) { this.camPos.copy(this.camGoal); this.camLook.copy(this.lookGoal); }
    this.view = name;
  }

  updateCamera(dt) {
    const k = dt ? 1 - Math.exp(-4.5 * dt) : 1;
    this.camPos.lerp(this.camGoal, k);
    this.camLook.lerp(this.lookGoal, k);
    this.camera.position.copy(this.camPos);
    if (this.shakeAmp > 0.0005) {
      const a = this.shakeAmp;
      this.camera.position.x += (Math.random() - 0.5) * 2 * a;
      this.camera.position.y += (Math.random() - 0.5) * 2 * a;
      this.shakeAmp *= Math.exp(-14 * dt);
    }
    this.camera.lookAt(this.camLook);
    this.camera.updateMatrixWorld();
    this.paws.anchor(this.camera);
  }

  /** Paws resting on the counter near what the camera looks at, drifting a little with the mouse. */
  pawIdle(dt, snap = false) {
    const m = this.game.input.mouse;
    const c = this.view === 'result' ? SPOTS.plate : SPOTS.board;
    const wide = this.view === 'pantry' || this.view === 'result';
    for (const p of [this.paws.L, this.paws.R]) {
      const sx = this.view === 'result' ? c.x + (p.side > 0 ? 0.62 : -1.35) : c.x + p.side * (wide ? 0.62 : 0.5);
      p.goal.set(sx + m.nx * 0.03, 0.22 + m.ny * 0.015 + Math.sin(this.time * 2 + p.side) * 0.01, c.z + (wide ? 0.62 : 0.42));
      p.setPose({ pitch: 0.45, roll: 0.3, yaw: 0.45 });
      // celebrate (or sulk) over the finished dish
      if (this.view === 'result' && this.cheer) {
        const t = this.time - this.cheer.t0;
        const a = this.cheer.amp;
        if (a > 0 && t < 4) {
          p.goal.y += 0.08 * a + Math.abs(Math.sin(t * 9 + (p.side > 0 ? 1.2 : 0))) * 0.08 * a;
          p.setPose({ pitch: 0.05, roll: 0.25, yaw: 0.3 + Math.sin(t * 9) * 0.15 });
        } else if (a < 0) {
          p.goal.y -= 0.05;
          p.setPose({ pitch: 0.95, roll: 0.4, yaw: 0.55 });
        }
      }
      if (p.reach) {
        p.reach.t += dt;
        const k = Math.sin(Math.min(1, p.reach.t / 0.5) * Math.PI);
        p.goal.lerp(p.reach.to, k * 0.85);
        if (p.reach.t > 0.5) p.reach = null;
      }
      if (snap) p.snap();
    }
  }

  toScreen(v) { return this.game.engine.toScreen(v, this.camera); }

  // ------------------------------------------------------------------ pantry
  openPantry() {
    this.phase = 'pantry';
    this.phaseT = 0;
    this.step = null;
    this.setView('pantry');
    const st = this.game.state;
    this.selected = this.selected.filter((id) => st.count(id) > 0);
    this.ui.openPantry({
      selected: this.selected,
      onChange: (ids) => { this.selected = ids; this.syncPreviews(); },
      onCook: (ids) => this.startCooking(ids),
      onLeave: () => this.leave(),
      matchInfo: (ids) => this.matchInfo(ids),
    });
    this.syncPreviews();
  }

  matchInfo(ids) {
    if (!ids.length) return '<span>Nothing in the pot yet.</span>';
    const r = findRecipe(Object.fromEntries(ids.map((id) => [id, 1])));
    const names = ids.map((id) => ITEMS[id]?.name).join(' + ');
    const st = this.game.state;
    if (r && st.data.recipes[r.dish] !== undefined) {
      const g = gradeOf(st.data.recipes[r.dish]);
      return `<b>${DISHES[r.dish].name}</b> · recipe card, best <b style="color:${g.color}">${g.g}</b>`;
    }
    return `${names} · <i>who knows what this makes?</i>`;
  }

  /** The chosen ingredients sit on the board while you decide. */
  syncPreviews() {
    const want = this.selected.slice();
    for (const p of this.previews.slice()) {
      if (!want.includes(p.id)) {
        puff(this.fx, p.mesh.position.clone().setY(BOARD_TOP + 0.05), 0xfff4e0, 6, 0.1);
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.previews.splice(this.previews.indexOf(p), 1);
      }
    }
    for (const id of want) {
      if (this.previews.some((p) => p.id === id)) continue;
      const mesh = slabMesh(spriteCells(id, { horizontal: true }), { px: 0.028, depth: 3 });
      this.scene.add(mesh);
      this.previews.push({ id, mesh, drop: 0, x: SPOTS.board.x });
      this.game.audio.play('place');
      const paw = this.previews.length % 2 ? this.paws.R : this.paws.L;
      paw.reach = { t: 0, to: new THREE.Vector3(0, 0.25, 0), id };
    }
    this.previews.forEach((p, i) => {
      p.x = SPOTS.board.x + (i - (this.previews.length - 1) / 2) * 0.36;
      for (const paw of [this.paws.L, this.paws.R]) if (paw.reach && paw.reach.id === p.id) paw.reach.to.set(p.x, BOARD_TOP + 0.2, SPOTS.board.z + 0.1);
    });
  }

  clearPreviews() {
    for (const p of this.previews) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); }
    this.previews = [];
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.game.audio.play('door');
    this.game.goto('home', { from: 'stove' });
  }

  // ------------------------------------------------------------------ cooking flow
  startCooking(ids) {
    if (this.phase !== 'pantry' || !ids.length) return false; // ignore double clicks while the panel slides out
    const st = this.game.state;
    if (ids.some((id) => st.count(id) < 1)) { this.game.ui.toast('Missing an ingredient!', { kind: 'warn' }); return false; }
    for (const id of ids) st.removeItem(id, 1);
    const r = findRecipe(Object.fromEntries(ids.map((id) => [id, 1])));
    this.dish = r ? r.dish : 'mystery_mush';
    this.steps = r ? r.steps.slice() : ['chop', 'stir'];
    if (this.params.steps) this.steps = this.params.steps.split(',').filter((s) => STEP_LABEL[s]);
    this.ings = ids.slice();
    this.chopQ = chopQueue(ids);
    this.chopI = 0;
    this.food = { where: 'board', chunks: [], pieces: null, chopped: [], egg: false, dough: false, liquid: dishColor(this.dish) };
    this.results = [];
    this.stepI = -1;
    this.contents.clear();
    this.clearPreviews();
    this.clearLeftovers();
    this.clearDishModel();
    this.hideNugget();
    this.ui.closeSide();
    const known = st.data.recipes[this.dish] !== undefined;
    this.ui.stepHud(known ? DISHES[this.dish].name : '???', this.steps);
    this.ui.title('LET\'S COOK!', ids.map((id) => ITEMS[id].name).join(' + '));
    this.game.audio.play('ding');
    this.phase = 'start';
    this.phaseT = 0;
    this.setView('board');
    return true;
  }

  stepOpts(kind) {
    const f = this.food;
    const o = { food: f, dish: this.dish };
    if (kind === 'chop') o.item = this.chopQ[this.chopI++ % this.chopQ.length];
    if (kind === 'stir') o.vessel = f.where === 'bowl' || f.where === 'cup' ? f.where : 'pot';
    if (kind === 'season') o.vessel = ['pot', 'bowl', 'pan'].includes(f.where) ? f.where : 'bowl';
    return o;
  }

  nextStep() {
    this.stepI++;
    if (this.stepI >= this.steps.length) { this.finale(); return; }
    const kind = this.steps[this.stepI];
    this.step = makeStep(kind, this, this.stepOpts(kind));
    this.step.begin();
    this.setView(this.step.station);
    this.ui.setStep(this.stepI);
    this.ui.title(this.step.title, `Step ${this.stepI + 1} of ${this.steps.length}`);
    this.ui.hint(null);
    this.ui.timer(null);
    this.phase = 'intro';
    this.phaseT = 0;
  }

  askStop() {
    if (this.asking) return;
    this.asking = true;
    this.game.ui.confirm('Stop cooking? The ingredients are already in the pot, so they will be lost.', 'Stop cooking', 'Keep cooking').then((yes) => {
      this.asking = false;
      if (!yes || this.phase === 'pantry' || this.phase === 'result') return;
      this.abandon();
    });
  }

  abandon() {
    if (this.step) { this.step.end(); this.step = null; }
    this.ui.clearWidgets();
    this.ui.clearHud();
    this.stopHeat();
    this.resetKitchen();
    this.game.ui.toast('Into the compost it goes...', { kind: 'warn' });
    this.openPantry();
  }

  stopHeat() {
    this.kitchen.setBurner(0, 0);
    this.kitchen.setBurner(1, 0);
    this.loop('boil', false);
    this.loop('sizzle', false);
  }

  leftover(group) {
    const i = this.leftovers.length;
    this.leftovers.push(group);
    const from = group.position.clone(), s0 = group.scale.x;
    const to = new THREE.Vector3(SPOTS.board.x - 0.4 + (i % 3) * 0.16, 0.001, SPOTS.board.z - 0.27);
    this.tween(0.45, (k) => {
      group.position.lerpVectors(from, to, k).setY(from.y + Math.sin(k * Math.PI) * 0.12);
      group.scale.setScalar(s0 + (0.42 - s0) * k);
    });
  }

  clearLeftovers() {
    for (const g of this.leftovers) { this.scene.remove(g); disposeObject(g); }
    this.leftovers = [];
  }

  /** Food leaves the board for a vessel: leftovers hop off toward it and vanish. */
  useLeftovers(to) {
    for (const g of this.leftovers) {
      const from = g.position.clone();
      this.tween(0.5, (k) => {
        g.position.lerpVectors(from, to, k).setY(from.y + Math.sin(k * Math.PI) * 0.35 + (to.y - from.y) * k);
        g.scale.setScalar(0.42 * (1 - k * 0.6));
      }, () => {
        this.scene.remove(g);
        disposeObject(g);
      });
    }
    this.leftovers = [];
  }

  // ------------------------------------------------------------------ finale & result
  finale() {
    this.phase = 'finale';
    this.phaseT = 0;
    this.step = null;
    this.ui.clearHud();
    this.stopHeat();
    const n = this.results.length;
    this.score = n ? this.results.reduce((s, r) => s + r.score, 0) / n : 0;
    this.useLeftovers(SPOTS.plate.clone().setY(0.1));
    this.setView('result');
    this.showDishModel();
    this.game.audio.play('success');
  }

  showDishModel() {
    if (this.dishModel) return;
    const m = standeeMesh(this.dish, { px: 0.03 });
    m.position.copy(SPOTS.plate).setY(0.06);
    m.scale.setScalar(0.01);
    this.scene.add(m);
    this.dishModel = m;
    this.tween(0.55, (k) => { const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); m.scale.setScalar(Math.max(0.01, e)); });
    sparkle(this.fx, SPOTS.plate.clone().setY(0.25), 18);
  }

  clearDishModel() {
    if (!this.dishModel) return;
    this.scene.remove(this.dishModel);
    disposeObject(this.dishModel);
    this.dishModel = null;
  }

  commit() {
    const st = this.game.state;
    const d = this.dish;
    const score = Math.round(this.score);
    const grade = gradeOf(score).g;
    const made = d === 'mystery_mush' ? 1 : grade === 'Perfect' ? 2 : 1;
    const isNew = !st.known('recipe', d);
    st.addItem(d, { n: made });
    if (d !== 'mystery_mush') st.data.recipes[d] = Math.max(st.data.recipes[d] || 0, score);
    st.discover('recipe', d);
    st.learn('recipes');
    st.data.stats.dishes = (st.data.stats.dishes || 0) + 1;
    st.save();
    return { score, grade, made, isNew };
  }

  showResult() {
    const res = this.commit();
    this.phase = 'result';
    this.phaseT = 0;
    const line = pick(this.dish === 'mystery_mush' ? LINES.mush : LINES[res.grade]);
    this.ui.openResult({
      dish: this.dish, score: res.score, isNew: res.isNew, made: res.made, line,
      steps: this.results,
      onEat: () => { if (this.game.eat(this.dish)) this.nuggetSay('Cluck!', 1.5); },
      onAgain: () => { this.game.audio.play('ui_click'); this.resetKitchen(); this.openPantry(); },
      onDone: () => this.leave(),
    });
    this.showNugget(res.grade);
    this.cheer = { t0: this.time, amp: { Perfect: 1, Great: 0.7, Good: 0.35, Okay: 0, Burnt: -1 }[res.grade] ?? 0 };
  }

  resetKitchen() {
    this.cheer = null;
    this.hideNugget();
    this.clearDishModel();
    this.clearLeftovers();
    this.contents.clear();
    for (const name of Object.keys(this.kitchen.props)) this.kitchen.restore(name);
  }

  // ------------------------------------------------------------------ Nugget
  showNugget(grade) {
    if (!this.nugget) {
      this.nugget = makeChicken({ hat: 'straw', scale: 0.62 });
      this.scene.add(this.nugget.root);
    }
    const n = this.nugget;
    n.root.visible = true;
    n.grade = this.dish === 'mystery_mush' ? 'mush' : grade;
    n.home = new THREE.Vector3(SPOTS.plate.x - 0.32, 0, SPOTS.plate.z - 0.45);
    n.root.position.copy(n.home).setY(1.5);
    n.vy = 0;
    n.landed = false;
    n.landT = 0;
    n.face(0.35, true);
    n.flap(2);
  }

  hideNugget() {
    if (this.nugget) this.nugget.root.visible = false;
    this.game.ui.hideBubble('nugget');
  }

  nuggetSay(text, life = 2.2) {
    const n = this.nugget;
    if (!n || !n.root.visible) return;
    const p = this.toScreen(n.root.position.clone().add(new THREE.Vector3(0, 0.56, 0)));
    this.game.ui.bubble('nugget', text, p.x, p.y, { life });
  }

  updateNugget(dt) {
    const n = this.nugget;
    if (!n || !n.root.visible) return;
    const audio = this.game.audio;
    if (!n.landed) {
      n.vy -= 3.2 * dt;
      n.root.position.y += n.vy * dt;
      if (n.root.position.y <= 0) {
        n.root.position.y = 0;
        n.landed = true;
        n.landT = 0;
        audio.play('land', { vol: 0.5 });
        puff(this.fx, n.root.position.clone().setY(0.03), 0xf6f0e4, 6, 0.15);
        const g = n.grade;
        if (g === 'Perfect' || g === 'Great') { audio.play('bawk'); n.flap(1.2); this.nuggetSay(g === 'Perfect' ? 'BAWK!! ♥' : 'Bawk bawk!'); }
        else if (g === 'Good') { audio.play('cluck', { n: 2 }); this.nuggetSay('Cluck!'); }
        else if (g === 'Okay') { audio.play('cluck', { n: 1, pitch: 0.9 }); n.peck(); this.nuggetSay('...cluck?'); }
        else if (g === 'mush') { audio.play('cluck', { n: 1, pitch: 1.2 }); this.nuggetSay('?'); }
        else { audio.play('bawk', { pitch: 0.8 }); this.nuggetSay('Bwaaak...'); }
      }
    } else {
      n.landT += dt;
      const g = n.grade;
      if (g === 'Perfect' || g === 'Great') {
        const h = Math.max(0, Math.sin(n.landT * (g === 'Perfect' ? 9 : 6)));
        n.root.position.y = h * (g === 'Perfect' ? 0.07 : 0.04) * (n.landT < 4 ? 1 : 0.3);
        if (g === 'Perfect' && Math.random() < dt * 0.8) n.flap(0.5);
      }
      if (n.landT > 2.5 && Math.random() < dt * 0.12) { n.peck(); if (Math.random() < 0.5) audio.play('cluck', { n: 1 + ((Math.random() * 2) | 0) }); }
      else if (n.landT > 1.5 && Math.random() < dt * 0.2) audio.play('cluck', { n: 1, pitch: 1.1 });
      n.face(0.35 + Math.sin(n.landT * 0.7) * 0.4);
    }
    n.update(dt);
    if (n.landed && (n.grade === 'Burnt' || n.grade === 'mush') && n.landT < 2.5) n.head.rotation.y = Math.sin(n.landT * (n.grade === 'Burnt' ? 10 : 2)) * (n.grade === 'Burnt' ? 0.4 : 0.6);
    const p = this.toScreen(n.root.position.clone().add(new THREE.Vector3(0, 0.56, 0)));
    this.game.ui.moveBubble('nugget', p.x, p.y, true);
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    super.update(dt);
    const paused = this.game.ui.isPanelOpen();
    this.handleKeys();
    for (const tw of this.tweens.slice()) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done?.(); }
    }
    if (!paused) this.updateFlow(dt);
    this.updateCamera(dt);
    if (!this.step) this.pawIdle(dt);
    this.paws.update(dt);
    this.kitchen.update(dt);
    this.contents.update(dt);
    this.boil(dt);
    // previews bob in on the board
    for (const p of this.previews) {
      p.drop = Math.min(1, p.drop + dt * 2.2);
      const k = p.drop;
      const bounce = k < 1 ? Math.abs(Math.sin(k * Math.PI * 2.2)) * (1 - k) * 0.35 : 0;
      p.mesh.position.set(p.x, BOARD_TOP + bounce, SPOTS.board.z - 0.02);
      p.mesh.rotation.y = Math.sin(this.time * 1.5 + p.x * 5) * 0.06;
    }
    if (this.dishModel && (this.phase === 'result' || this.phase === 'finale')) this.dishModel.rotation.y = Math.sin(this.time * 1.2) * 0.5;
    this.updateNugget(dt);
    this.fx.update(dt, this.camera, this.game.engine.height);
  }

  /** A hot pot with something in it bubbles and steams, whatever step is running. */
  boil(dt) {
    const pot = this.contents.v.pot;
    const heat = this.kitchen.burnerHeat[0];
    if (!pot || !pot.liquid || heat < 0.25) return;
    pot.g.position.y = VESSEL.pot.surface + Math.sin(this.time * 9) * 0.003 * heat;
    this.boilT = (this.boilT || 0) - dt;
    if (this.boilT > 0) return;
    this.boilT = 0.07;
    const c = this.kitchen.props.pot.getWorldPosition(this._bp || (this._bp = new THREE.Vector3()));
    const y = c.y + VESSEL.pot.surface;
    const r = VESSEL.pot.r;
    steam(this.fx, new THREE.Vector3(c.x, y + 0.02, c.z), r * 0.8);
    if (Math.random() < 0.8 * heat) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.85;
      this.fx.emit({ pos: [c.x + Math.cos(a) * d, y + 0.008, c.z + Math.sin(a) * d], vel: [0, 0.02, 0], color: 0xfff8f0, size: 0.012, life: 0.28, grow: 1.6, alpha: 0.9, fade: 0.25 });
      if (Math.random() < 0.15) this.game.audio.play('bubble');
    }
  }

  handleKeys() {
    const inp = this.game.input;
    if (this.game.ui.isPanelOpen() || this.leaving) return;
    const ph = this.phase;
    if (inp.pressed('Escape')) {
      if (ph === 'pantry' || ph === 'result') this.leave();
      else if (ph !== 'finale') this.askStop();
    }
    if (ph === 'pantry' || ph === 'result') {
      if (inp.pressed('KeyB')) this.game.ui.openIndex();
      else if (inp.pressed('KeyI', 'Tab')) this.game.ui.openInventory();
    }
  }

  updateFlow(dt) {
    this.phaseT += dt;
    const ph = this.phase;
    if (ph === 'start') {
      if (this.phaseT > 1.25) this.nextStep();
    } else if (ph === 'intro') {
      this.step.update(dt, false);
      if (this.phaseT > 1.15) {
        this.phase = 'live';
        this.phaseT = 0;
        this.ui.hint(this.step.hint);
      }
    } else if (ph === 'live') {
      this.step.update(dt, true);
      this.ui.timer(this.step.timeLeft());
      if (this.step.done) {
        const s = this.step.score;
        this.results.push({ kind: this.steps[this.stepI], score: s });
        this.ui.markStep(this.stepI, s);
        this.ui.hint(null);
        this.ui.timer(null);
        const kind = this.ui.feedback(s);
        this.game.audio.play(kind === 'perfect' ? 'perfect' : kind === 'oops' ? 'oops' : 'good');
        if (kind === 'perfect') sparkle(this.fx, this.camLook.clone().setY(0.3), 14);
        this.phase = 'feedback';
        this.phaseT = 0;
      }
    } else if (ph === 'feedback') {
      this.step.update(dt, false);
      if (this.phaseT > 1.45) {
        this.step.end();
        this.ui.clearWidgets();
        this.nextStep();
      }
    } else if (ph === 'finale') {
      if (this.phaseT > 1.25 && !this.resultShown) {
        this.resultShown = true;
        this.showResult();
      }
    }
    if (ph !== 'finale') this.resultShown = false;
  }

  exit() {
    this.stopHeat();
    this.game.ui.hideBubble('nugget');
    super.exit();
  }
}
