// FLIP: a pancake / omelette in the pan. It browns from raw to golden; toss it (click, Space, or flick
// the mouse up) while it's golden, then slide the pan under it (the pan follows the mouse; A/D or
// arrows) to catch it as it falls. Twice. Timing and the catch both count; a miss lands on the stove.
import { Step, V3, THREE } from './base.js';
import { flatFood } from '../models.js';
import { chunkMesh } from '../food.js';
import { voxelMaterial } from '../../gfx/Voxel.js';
import { droplets, smoke, sparkle, puff } from '../fx.js';
import { clamp, damp } from '../../core/util.js';

const SIDE_TIME = 3.2;
const WIN = [0.55, 0.8]; // the golden window (widened by the cook skill: this.W)
const RAW = new THREE.Color(1, 1, 1);
const GOLD = new THREE.Color(1.0, 0.76, 0.44);
const BURNT = new THREE.Color(0.16, 0.11, 0.08);
const HANDLE = new THREE.Vector3(-0.0125, 0.075, 0.68);
const G = 4.2;

export class FlipStep extends Step {
  get station() { return 'pan'; }
  get title() { return 'FLIP!'; }
  get hint() { return this.touch ? '<b>Tap</b> to toss when it\'s golden · <b>drag</b> the pan under it to catch' : '<kbd>Click</kbd> to toss when golden · move the mouse (or <kbd>A</kbd>/<kbd>D</kbd>) to catch it'; }

  begin() {
    this.W = this.win(WIN[0], WIN[1], 0.3, 1);
    const f = this.cook.food;
    this.pan = this.borrow('pan');
    this.panRest = this.pan.position.clone();
    this.k.setBurner(1, 1);
    this.cook.loop('sizzle', true, 0.3);
    this.mat = voxelMaterial('toon', { unique: true });
    const pancake = this.opts.dish === 'grub_pancakes';
    const color = pancake ? 0xf0d0a0 : 0xffd860;
    this.food = new THREE.Group();
    const disc = flatFood(color, pancake ? 9 : 10);
    disc.material = this.mat;
    this.food.add(disc);
    if (f.chunks.length && !pancake) { const ch = chunkMesh(f.chunks.slice(-1), 6, 6, 3); ch.position.y = 0.06; ch.material = this.mat; this.food.add(ch); }
    this.temp(this.food);
    const bowl = this.cook.contents.v.bowl;
    if (bowl) bowl.g.visible = false;
    if (this.cook.leftovers.length) this.cook.useLeftovers(this.panRest.clone().add(V3(0, 0.06, 0)));
    f.where = 'pan';
    this.color = color;
    this.side = 0; this.d = 0; this.lastD = 0;
    this.px = this.panRest.x; // pan x (follows the mouse)
    this.air = null; // the toss in flight
    this.scores = [];
    this.finishT = -1;
    this.bar = null;
    this.hist = [];
    this.missT = -1;
    this.food.position.copy(this.panRest).add(V3(0, 0.07, 0));
  }

  colorFor(d) {
    const c = new THREE.Color();
    if (d <= 0.68) c.copy(RAW).lerp(GOLD, clamp(d / 0.68, 0, 1));
    else c.copy(GOLD).lerp(BURNT, clamp((d - 0.68) / 0.45, 0, 1));
    return c;
  }

  toss(auto = false) {
    if (this.air || this.side > 1 || this.missT >= 0) return;
    const d = this.d;
    let s;
    if (d >= this.W[0] && d <= this.W[1]) s = 100 - (Math.abs(d - (this.W[0] + this.W[1]) / 2) / ((this.W[1] - this.W[0]) / 2)) * 15;
    else if (d < this.W[0]) s = clamp(80 - (this.W[0] - d) * 240, 0, 80);
    else s = clamp(80 - (d - this.W[1]) * 230, 0, 80);
    if (auto) s = 0;
    const p = this.food.position;
    // the toss drifts a little sideways: you have to chase it
    const vx = (Math.random() - 0.5) * 0.5 + (this.px - this.panRest.x) * -0.4;
    this.air = { t: 0, vx, vy: 2.1, tScore: s, x: p.x, y: p.y, spin: Math.PI * (Math.random() < 0.5 ? 1 : 3) };
    this.lastD = d;
    this.audio.play('whoosh');
    this.audio.play('flip');
    this.cook.shake(0.004);
    const word = auto ? 'Burnt!' : d < this.W[0] ? (d < 0.3 ? 'Still raw!' : 'A bit pale') : d > this.W[1] ? 'Too dark!' : 'Golden!';
    this.float(word, p.clone().add(V3(0, 0.25, 0)), s >= 80 ? '#ffe066' : s >= 45 ? '#9fdcff' : '#ff9a8a');
    if (auto) for (let i = 0; i < 5; i++) smoke(this.fx, p.clone(), 0.12);
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.bar) { this.bar = this.ui.hbar({ win: this.W, label: 'Side 1' }); this.bar.setWin(this.W[0], this.W[1]); }
    const inp = this.input;
    // the pan follows the mouse along x (and A/D)
    if (live) {
      const m = this.mouseAt(this.panRest.y + 0.05);
      const keys = (inp.isDown('KeyA', 'ArrowLeft') ? -1 : 0) + (inp.isDown('KeyD', 'ArrowRight') ? 1 : 0);
      if (keys) { this.kx = clamp((this.keyMode ? this.kx : this.px) + keys * 1.4 * dt, this.panRest.x - 0.45, this.panRest.x + 0.45); this.keyMode = true; }
      if (this.lastMx !== undefined && Math.abs(inp.mouse.x - this.lastMx) > 2) this.keyMode = false;
      this.lastMx = inp.mouse.x;
      const want = this.keyMode ? this.kx : m ? m.x : this.px;
      this.px = damp(this.px, clamp(want, this.panRest.x - 0.45, this.panRest.x + 0.45), 14, dt);
    }
    // cooking the side facing down
    if (!this.air && this.missT < 0 && this.side < 2 && live) {
      this.d += dt / SIDE_TIME;
      if (this.d >= 1.25) this.toss(true);
      const y = inp.mouse.y;
      this.hist.push([this.t, y]);
      while (this.hist.length && this.t - this.hist[0][0] > 0.16) this.hist.shift();
      const rise = Math.max(...this.hist.map((h) => h[1])) - y;
      if (inp.mousePressed(0) || inp.pressed('Space', 'Enter', 'KeyW', 'ArrowUp') || rise > 60) { this.hist = []; this.toss(false); }
    }
    const panY = this.panRest.y;
    // the toss: up, spin, down; catch it in the pan or it lands on the stove
    if (this.air) {
      const a = this.air;
      a.t += dt;
      a.x += a.vx * dt;
      a.y = this.panRest.y + 0.07 + a.vy * a.t - 0.5 * G * a.t * a.t;
      this.food.position.set(a.x, a.y, this.panRest.z);
      this.food.rotation.x = Math.PI * this.side + Math.min(a.spin, a.t * a.spin * 1.6);
      if (a.t > 0.25 && a.y <= panY + 0.07) {
        const off = Math.abs(a.x - this.px);
        this.air = null;
        this.side++;
        this.d = 0;
        this.food.rotation.x = Math.PI * this.side;
        if (off < 0.16) {
          const cScore = off < 0.04 ? 100 : clamp(100 - (off - 0.04) * 520, 30, 100);
          this.scores.push(a.tScore * 0.55 + cScore * 0.45);
          this.audio.play('sizzle'); this.audio.play('plate', { vol: 0.4 });
          this.cook.shake(0.005);
          const at = this.food.position.clone();
          droplets(this.fx, at, 0xffe8a0, 7, at.y - 0.02, 0.6);
          if (cScore >= 90) { sparkle(this.fx, at.clone().add(V3(0, 0.08, 0)), 10); this.float('Caught it!', at.clone().add(V3(0, 0.3, 0)), '#ffe066'); }
          else this.float('Caught!', at.clone().add(V3(0, 0.3, 0)), '#9af07a');
        } else {
          this.scores.push(a.tScore * 0.35);
          this.missT = 0;
          this.food.position.y = panY + 0.01;
          this.audio.play('thud'); this.audio.play('oops', { vol: 0.5 });
          this.cook.shake(0.01);
          puff(this.fx, this.food.position.clone(), 0xd8c8a8, 8, 0.15);
          this.float('On the stove!', this.food.position.clone().add(V3(0, 0.3, 0)), '#ff9a8a');
        }
        if (this.bar) this.bar.side(this.side < 2 ? 'Side 2' : 'Done');
        if (this.side >= 2) this.finishT = 0;
      }
    } else if (this.missT >= 0) {
      // scoop it back into the pan
      this.missT += dt;
      const k = clamp((this.missT - 0.5) / 0.35, 0, 1);
      this.food.position.x = damp(this.food.position.x, this.px, k * 12, dt);
      this.food.position.y = panY + 0.01 + Math.sin(k * Math.PI) * 0.15 + k * 0.06;
      if (this.missT > 0.9) this.missT = -1;
    } else {
      this.food.position.set(this.px, panY + 0.07, this.panRest.z);
    }
    this.pan.position.set(this.px, panY + (this.air && this.air.t < 0.12 ? Math.sin(this.air.t / 0.12 * Math.PI) * 0.05 : 0), this.panRest.z);
    this.pan.rotation.set(this.air && this.air.t < 0.18 ? -Math.sin(this.air.t / 0.18 * Math.PI) * 0.35 : 0, -0.35, 0);
    // colour, smoke, meters
    const shown = this.side >= 2 ? this.lastD : this.d;
    this.mat.color.copy(this.colorFor(this.air ? this.lastD : shown));
    if (this.bar) { this.bar.set(this.air ? this.lastD : shown); this.bar.flips(`Flips: <b>${this.scores.length}</b> / 2`); }
    if (this.d > 0.85 && !this.air && this.side < 2 && Math.random() < dt * 6) smoke(this.fx, this.food.position.clone().add(V3(0, 0.04, 0)), 0.12);
    if (this.finishT >= 0) {
      this.finishT += dt;
      if (this.finishT > 0.4) this.finish(this.scores.reduce((a, b) => a + b, 0) / Math.max(1, this.scores.length));
    }
    // paws: left on the pan handle, right ready beside the stove
    this.pan.updateMatrixWorld(true);
    const h = this.pan.localToWorld(HANDLE.clone());
    this.L.speed = 30;
    this.L.goal.set(h.x - 0.02, h.y + 0.06, h.z + 0.04);
    this.L.setPose({ pitch: 0.45, roll: 0.45, yaw: 0.9 });
    const S = this.S;
    this.R.goal.set(S.x + 0.55, 0.26 + Math.sin(this.t * 3) * 0.01, S.z + 0.35);
    this.R.setPose({ pitch: 0.45, roll: 0.3, yaw: 0.45 });
  }

  end() {
    this.L.speed = 14;
    this.pan.position.copy(this.panRest);
    this.pan.rotation.set(0, -0.35, 0);
    // the cooked food stays in the pan for plating
    this.objs = this.objs.filter((o) => o !== this.food);
    this.cook.contents.addExtra('pan', this.food);
    this.food.position.set(0, 0.07 - this.cook.contents.slot('pan').g.position.y, 0);
    this.food.rotation.set(Math.PI * this.side, 0, 0);
    this.cook.food.fried = this.color;
    this.cook.loop('sizzle', false);
    this.k.setBurner(1, 0);
    super.end();
  }
}
