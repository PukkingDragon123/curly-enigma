// FRY: the food in the pan goes raw → golden → burnt. Click (or flick the mouse up) to toss
// it when golden; do both sides. The left paw works the pan handle.
import { Step, V3, THREE } from './base.js';
import { flatFood } from '../models.js';
import { slabMesh, spriteCells, mainColor, chunkMesh } from '../food.js';
import { voxelMaterial } from '../../gfx/Voxel.js';
import { droplets, smoke, sparkle } from '../fx.js';
import { clamp } from '../../core/util.js';

const SIDE_TIME = 3.4;
const WIN = [0.55, 0.8]; // the golden window (widened by the cook skill: this.W)
const RAW = new THREE.Color(1, 1, 1);
const GOLD = new THREE.Color(1.0, 0.78, 0.46);
const BURNT = new THREE.Color(0.14, 0.1, 0.08);
const HANDLE = new THREE.Vector3(-0.0125, 0.075, 0.68); // pan-local grip on the handle

export class FryStep extends Step {
  get station() { return 'pan'; }
  get title() { return 'FRY!'; }
  get hint() { return '<kbd>Click</kbd> or flick the mouse up to flip when it\'s golden · both sides'; }

  begin() {
    this.W = this.win(WIN[0], WIN[1], 0.3, 1);
    const f = this.cook.food;
    this.pan = this.borrow('pan');
    this.panRest = this.pan.position.clone();
    this.k.setBurner(1, 1);
    this.cook.loop('sizzle', true, 0.35);
    this.mat = voxelMaterial('toon', { unique: true });
    this.food = new THREE.Group();
    this.food.position.y = 0.05;
    this.pan.add(this.food);
    this.objs.push(this.food);
    const egg = f.egg && (f.where === 'bowl' || this.opts.dish === 'spicy_omelette' || this.opts.dish === 'grub_pancakes');
    if (egg) {
      const pancake = this.opts.dish === 'grub_pancakes';
      const disc = flatFood(pancake ? 0xf0d0a0 : 0xffd860, 10);
      disc.material = this.mat;
      this.food.add(disc);
      // chopped bits on top (pepper in the omelette...)
      if (f.chunks.length) { const ch = chunkMesh(f.chunks.slice(-1), 7, 6, 3); ch.position.y = 0.06; ch.material = this.mat; this.food.add(ch); }
      const slot = this.cook.contents.slot('bowl');
      slot.g.visible = false; // the batter went into the pan
      this.color = pancake ? 0xf0d0a0 : 0xffd860;
    } else {
      const pc = f.pieces || { item: this.opts.item || f.chopped[0], cuts: [] };
      const item = pc.item || 'mushroom';
      const sprite = pc.sprite || spriteCells(item, { horizontal: true });
      const cuts = (pc.cuts || []).slice().sort((a, b) => a - b);
      const bounds = [sprite.x0, ...cuts, sprite.x1 + 1];
      const n = bounds.length - 1;
      for (let i = 0; i < n; i++) {
        if (bounds[i + 1] <= bounds[i]) continue;
        const m = slabMesh(sprite, { px: 0.03, depth: 3, cols: [bounds[i], bounds[i + 1]], material: this.mat });
        m.position.x = (i - (n - 1) / 2) * 0.03;
        this.food.add(m);
      }
      this.color = mainColor(item);
    }
    if (this.cook.leftovers.length) this.cook.useLeftovers(this.pan.getWorldPosition(new THREE.Vector3()).add(V3(0, 0.06, 0)));
    f.where = 'pan';
    this.side = 0;
    this.d = 0;
    this.scores = [];
    this.flipT = -1;
    this.hist = [];
    this.smokeT = 0;
    this.finishT = -1;
    this.bar = null;
    this.limit = 0;
  }

  colorFor(d) {
    const c = new THREE.Color();
    if (d <= 0.68) c.copy(RAW).lerp(GOLD, clamp(d / 0.68, 0, 1));
    else c.copy(GOLD).lerp(BURNT, clamp((d - 0.68) / 0.45, 0, 1));
    return c;
  }

  flip(auto = false) {
    if (this.flipT >= 0 || this.side > 1) return;
    const d = this.d;
    let s;
    if (d >= this.W[0] && d <= this.W[1]) s = 100 - (Math.abs(d - (this.W[0] + this.W[1]) / 2) / ((this.W[1] - this.W[0]) / 2)) * 18;
    else if (d < this.W[0]) s = clamp(82 - (this.W[0] - d) * 240, 0, 82);
    else s = clamp(82 - (d - this.W[1]) * 230, 0, 82);
    if (auto) s = 0;
    this.scores.push(s);
    this.flipT = 0;
    this.flipScore = s;
    this.audio.play('flip');
    this.audio.play('whoosh');
    const at = this.food.getWorldPosition(new THREE.Vector3());
    const word = auto ? 'Burnt!' : d < this.W[0] ? (d < 0.3 ? 'Still raw!' : 'A bit pale') : d > this.W[1] ? 'Too dark!' : 'Golden!';
    this.float(word, at.clone().add(V3(0, 0.3, 0)), s >= 80 ? '#ffe066' : s >= 45 ? '#9fdcff' : '#ff9a8a');
    if (s >= 90) sparkle(this.fx, at.clone().add(V3(0, 0.1, 0)), 10);
    if (auto || d > 1) for (let i = 0; i < 6; i++) smoke(this.fx, at.clone().add(V3(0, 0.05, 0)), 0.15);
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.bar) { this.bar = this.ui.hbar({ win: this.W, label: 'Side 1' }); this.bar.setWin(this.W[0], this.W[1]); }
    const inp = this.input;
    // cook the side facing down (only while it's in the pan and the step is running)
    if (this.flipT < 0 && this.side < 2 && live) {
      this.d += dt / SIDE_TIME;
      if (this.d >= 1.25) this.flip(true);
    }
    if (live && this.flipT < 0 && this.side < 2) {
      // mouse flick up = toss
      const now = this.t, y = inp.mouse.y;
      this.hist.push([now, y]);
      while (this.hist.length && now - this.hist[0][0] > 0.16) this.hist.shift();
      const rise = Math.max(...this.hist.map((h) => h[1])) - y;
      if (inp.mousePressed(0) || inp.pressed('Space', 'Enter') || rise > 55) { this.hist = []; this.flip(false); }
    }
    // toss animation
    let lift = 0, tilt = 0;
    if (this.flipT >= 0) {
      this.flipT += dt;
      const T = 0.62;
      const k = clamp(this.flipT / T, 0, 1);
      lift = Math.sin(clamp(this.flipT / 0.14, 0, 1) * Math.PI) * 0.05;
      tilt = -Math.sin(clamp(this.flipT / 0.18, 0, 1) * Math.PI) * 0.35;
      this.food.position.y = 0.05 + Math.sin(k * Math.PI) * 0.5;
      this.food.rotation.x = Math.PI * this.side + Math.PI * Math.min(1, k * 1.1);
      if (k > 0.5 && !this.swapped) {
        this.swapped = true;
        this.side++;
        this.d = 0;
        if (this.bar) this.bar.side(this.side < 2 ? 'Side 2' : 'Done');
      }
      if (k >= 1) {
        this.flipT = -1;
        this.swapped = false;
        this.food.position.y = 0.05;
        this.food.rotation.x = Math.PI * this.side;
        this.audio.play('sizzle');
        this.cook.shake(0.004);
        const at = this.food.getWorldPosition(new THREE.Vector3());
        droplets(this.fx, at, 0xffe8a0, 6, at.y - 0.02, 0.6);
        if (this.side >= 2) this.finishT = 0;
      }
    }
    this.pan.position.copy(this.panRest).add(V3(0, lift, 0));
    this.pan.rotation.set(tilt, -0.35, 0);
    // color & smoke
    const shown = this.side >= 2 ? this.lastD ?? 0.68 : this.d;
    if (this.side < 2) this.lastD = this.d;
    this.mat.color.copy(this.colorFor(shown));
    if (this.bar) this.bar.set(this.side < 2 ? this.d : this.lastD);
    if (this.bar) this.bar.flips(`Flips: <b>${this.scores.length}</b> / 2`);
    this.smokeT -= dt;
    if (this.d > 0.82 && this.smokeT <= 0 && this.side < 2 && this.flipT < 0) {
      this.smokeT = Math.max(0.03, 0.14 - (this.d - 0.82) * 0.3);
      smoke(this.fx, this.food.getWorldPosition(new THREE.Vector3()).add(V3(0, 0.05, 0)), 0.14);
    }
    if (this.d > 0.92 && !this.hissed && this.side < 2) { this.hissed = true; this.audio.play('hiss'); }
    if (this.d < 0.5) this.hissed = false;
    if (this.finishT >= 0) {
      this.finishT += dt;
      if (this.finishT > 0.35) this.finish(this.scores.reduce((a, b) => a + b, 0) / Math.max(1, this.scores.length));
    }
    // paws: left on the pan handle, right ready with a spatula-less wave over the stove
    this.pan.updateMatrixWorld(true);
    const h = this.pan.localToWorld(HANDLE.clone());
    this.L.speed = 30;
    this.L.goal.set(h.x - 0.02, h.y + 0.06, h.z + 0.04);
    this.L.setPose({ pitch: 0.45, roll: 0.45, yaw: 0.9 });
    const S = this.S;
    this.R.goal.set(S.x + 0.52, 0.26 + Math.sin(this.t * 3) * 0.01, S.z + 0.35);
    this.R.setPose({ pitch: 0.45, roll: 0.3, yaw: 0.45 });
  }

  end() {
    this.L.speed = 14;
    this.pan.rotation.set(0, -0.35, 0);
    // keep the cooked food in the pan for later (plate / finale)
    this.food.parent?.remove(this.food);
    this.objs = this.objs.filter((o) => o !== this.food);
    this.cook.contents.addExtra('pan', this.food);
    this.food.position.y = 0.05 - this.cook.contents.slot('pan').g.position.y;
    this.cook.food.fried = this.color;
    this.cook.loop('sizzle', false);
    this.k.setBurner(1, 0);
    super.end();
  }
}

