// BAKE: slide it into Old Star's hearth oven on the peel and pull it out at golden. The fire dies
// down as it bakes: stoke it (F, right click, or the Stoke button) to keep the heat in the band, but
// a roaring oven scorches the crust. The smell tells you when it's nearly there. Click / Space pulls
// it out.
import { Step, V3, THREE } from './base.js';
import { standeeMesh } from '../food.js';
import { voxelMaterial } from '../../gfx/Voxel.js';
import { smoke, sparkle, steam } from '../fx.js';
import { SPOTS } from '../kitchen.js';
import { clamp } from '../../core/util.js';

const RAW = new THREE.Color(1.18, 1.16, 1.08);
const GOLD = new THREE.Color(1.0, 0.86, 0.66);
const BURNT = new THREE.Color(0.22, 0.15, 0.1);

export class BakeStep extends Step {
  get station() { return 'oven'; }
  get title() { return 'BAKE!'; }
  get hint() { return this.touch ? 'Tap <b>Stoke</b> to keep the fire up · <b>tap</b> the oven to pull it out when golden' : '<kbd>F</kbd> / <kbd>Right click</kbd> stokes the fire · <kbd>Click</kbd> / <kbd>Space</kbd> pulls it out at golden'; }

  begin() {
    this.limit = 0;
    const O = SPOTS.oven;
    this.oven = this.P.oven;
    this.floorY = this.oven.position.y + 0.005;
    this.inside = V3(O.x, this.floorY, O.z + 0.17); // just inside the arch, so you can watch the crust brown
    this.out = V3(O.x + 0.05, this.floorY + 0.02, O.z + 0.8);
    this.mat = voxelMaterial('toon', { unique: true });
    this.food = this.temp(standeeMesh(this.opts.dish || 'herb_bread', { px: 0.016, material: this.mat }));
    this.peel = this.borrow('peel');
    this.peel.rotation.set(0, 0, 0);
    this.peel.scale.setScalar(0.75);
    this.band = this.win(0.62, 0.84, 0, 1.2);
    this.heat = 0.55; this.d = 0; this.scorch = 0; this.inBand = 0; this.liveT = 0;
    this.slide = 0; // 0 out → 1 in
    this.state = 'in';
    this.finishT = -1;
    this.bar = null; this.gauge = null;
    this.smelled = false;
    this.sparkT = 0;
    this.cook.food.where = 'oven';
    if (this.cook.leftovers.length) this.cook.useLeftovers(this.out.clone());
    this.audio.play('whoosh');
    this.cook.loop('fire', true, 0.35);
  }

  ensureUi() {
    if (this.bar) return;
    this.bar = this.ui.hbar({ win: this.band, label: 'Crust' });
    this.bar.setWin(this.band[0], this.band[1]);
    this.gauge = this.ui.gauge({ top: 'Roaring', label: 'Fire', zone: [0.45, 0.82], button: { text: 'Stoke', onClick: () => this.stoke() } });
  }

  stoke() {
    if (this.done || this.state !== 'in' || this.finishT >= 0) return;
    this.heat = Math.min(1.05, this.heat + 0.22);
    this.audio.play('ignite', { vol: 0.6 });
    this.audio.noise({ color: 'brown', filter: 'lowpass', f: 500, dur: 0.35, vol: 0.18 });
    const m = this.mouth();
    for (let i = 0; i < 16; i++) this.fx.emit({ pos: [m.x + (Math.random() - 0.5) * 0.3, m.y + 0.05, m.z], vel: [(Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.8, 0.4], color: Math.random() < 0.5 ? 0xffb040 : 0xff7a20, size: 0.016, life: 0.7, gravity: -0.3, fade: 0.4 });
    this.cook.shake(0.004);
  }

  mouth() { return V3(SPOTS.oven.x, this.floorY + 0.1, SPOTS.oven.z + 0.43); }

  pull() {
    if (this.state !== 'in' || this.done) return;
    this.state = 'out';
    this.audio.play('whoosh');
    this.audio.play('clunk', { vol: 0.5 });
    const d = this.d, [lo, hi] = this.band;
    let s;
    if (d >= lo && d <= hi) s = 100 - (Math.abs(d - (lo + hi) / 2) / ((hi - lo) / 2)) * 14;
    else if (d < lo) s = clamp(80 - (lo - d) * 220, 0, 80);
    else s = clamp(80 - (d - hi) * 230, 0, 80);
    s = s * 0.75 + (this.inBand / Math.max(1, this.liveT)) * 25 - this.scorch * 30;
    this.final = s;
    const word = d < lo ? (d < 0.35 ? 'Still doughy!' : 'A bit pale') : d > hi ? (d > 1.05 ? 'Charcoal!' : 'Too dark!') : 'Golden brown!';
    this.float(word, this.out.clone().add(V3(0, 0.35, 0)), d >= lo && d <= hi ? '#ffe066' : '#9fdcff');
    if (d >= lo && d <= hi && this.scorch < 0.2) { this.audio.play('ding'); this.perfectAt = 0.45; }
  }

  tick(dt, live) {
    if (this.t > 0.5) this.ensureUi();
    const inp = this.input;
    if (live && this.state === 'in' && this.slide >= 1) {
      this.liveT += dt;
      if (inp.pressed('KeyF') || inp.mousePressed(2)) this.stoke();
      else if (inp.mousePressed(0) || inp.pressed('Space', 'Enter')) this.pull();
      // the fire dies down; the crust bakes faster the hotter it is, and scorches when it roars
      this.heat = Math.max(0.05, this.heat - dt * 0.075);
      const h = this.heat;
      const rate = h < 0.35 ? 0.25 : h < 0.85 ? 0.25 + (h - 0.35) * 1.9 : 1.6;
      this.d += dt * 0.15 * rate;
      if (h > 0.88) { this.scorch += (h - 0.88) * dt * 2.2; if (Math.random() < dt * 8) smoke(this.fx, this.mouth(), 0.12); }
      if (h >= 0.45 && h <= 0.82) this.inBand += dt;
      if (!this.smelled && this.d > this.band[0] - 0.06) { this.smelled = true; this.audio.play('sparkle', { vol: 0.4 }); this.float('Smells nearly done...', this.mouth().add(V3(0, 0.3, 0)), '#ffe8a0'); }
      if (this.d >= 1.25) { this.float('Burning!', this.mouth().add(V3(0, 0.3, 0)), '#ff9a8a'); this.pull(); }
    }
    // the peel slides in, then back out with the bake
    if (this.state === 'in') this.slide = Math.min(1, this.slide + dt * 2.2);
    else this.slide = Math.max(0, this.slide - dt * 2.4);
    const k = this.slide * this.slide * (3 - 2 * this.slide);
    const pos = this.out.clone().lerp(this.inside, k);
    this.food.position.copy(pos).setY(pos.y + 0.012);
    const rise = 0.82 + Math.min(1, this.d / 0.6) * 0.18;
    this.food.scale.set(1, rise, 1);
    this.peel.position.set(pos.x, pos.y, pos.z + 0.02);
    this.peel.rotation.set(0, 0, 0);
    // crust colour
    const c = new THREE.Color();
    if (this.d <= 0.72) c.copy(RAW).lerp(GOLD, clamp(this.d / 0.72, 0, 1));
    else c.copy(GOLD).lerp(BURNT, clamp((this.d - 0.72) / 0.5 + this.scorch * 0.3, 0, 1));
    this.mat.color.copy(c);
    // fire light, sparks and the smell drifting out
    this.k.ovenHeat = this.state === 'in' ? this.heat : this.heat * 0.5;
    this.cook.loop('fire', true, 0.2 + this.heat * 0.4);
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.25 - this.heat * 0.15;
      const m = this.mouth();
      this.fx.emit({ pos: [m.x + (Math.random() - 0.5) * 0.25, m.y - 0.05, m.z - 0.1], vel: [(Math.random() - 0.5) * 0.2, 0.3 + Math.random() * 0.4, 0.25], color: 0xffa040, size: 0.012, life: 0.6, gravity: -0.2, fade: 0.5 });
      if (this.d > 0.4 && this.state === 'in') steam(this.fx, m.clone().add(V3(0, 0.12, 0.05)), 0.12, this.d > this.band[0] ? 0xffe8c0 : 0xf4f0ec);
    }
    if (this.bar) { this.bar.set(this.d); this.bar.flips(this.scorch > 0.05 ? `<b style="color:#ff9a8a">Scorching!</b>` : this.d > this.band[0] - 0.06 && this.d < this.band[1] ? '<b style="color:#ffe066">Smells golden</b>' : ''); }
    if (this.gauge) this.gauge.set(Math.min(1, this.heat), this.heat > 0.88 ? '#ff7a4a' : this.heat >= 0.45 ? '#ffb040' : '#9fdcff');
    if (this.perfectAt !== undefined) { this.perfectAt -= dt; if (this.perfectAt <= 0) { delete this.perfectAt; sparkle(this.fx, this.food.position.clone().add(V3(0, 0.2, 0)), 14); } }
    if (this.state === 'out' && this.slide <= 0) {
      if (this.finishT < 0) this.finishT = 0;
      this.finishT += dt;
      if (this.finishT > 0.35) this.finish(this.final);
    }
    // paws: right on the peel's handle, left fanning the fire
    const h = this.peel.position;
    this.R.speed = 24;
    this.R.goal.set(h.x + 0.32, h.y + 0.06, h.z + 0.58);
    this.R.setPose({ pitch: 0.5, roll: 0.4, yaw: 0.6 });
    const m = this.mouth();
    this.L.goal.set(m.x - 0.62, m.y + 0.06 + Math.sin(this.t * 6) * 0.01, m.z + 0.3);
    this.L.setPose({ pitch: 0.5, roll: 0.3, yaw: 0.7 });
  }

  end() {
    this.k.ovenHeat = 0;
    this.cook.loop('fire', false);
    // the baked thing goes on to plating as the dish itself
    this.objs = this.objs.filter((o) => o !== this.food);
    this.food.scale.set(1, 1, 1);
    this.cook.food.baked = true;
    const last = this.cook.stepI >= this.cook.steps.length - 1;
    if (last && !this.cook.dishModel) {
      // straight from the oven onto the plate: this is the dish
      const f = this.food, from = f.position.clone(), to = SPOTS.plate.clone().setY(0.075);
      this.cook.tween(0.6, (k) => f.position.lerpVectors(from, to, k).setY(from.y + Math.sin(k * Math.PI) * 0.3 + (to.y - from.y) * k));
      this.cook.dishModel = f;
    } else this.cook.leftover(this.food);
    super.end();
  }
}
