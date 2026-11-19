// WHISK: the balloon whisk in the bowl. Wiggle it fast side to side (drag back and forth, or tap
// quickly) and the froth climbs; ease off and it sinks. Bring it up into the fluffy band and keep it
// there; beat it past the top and it goes stiff and grainy.
import { Step, V3, THREE } from './base.js';
import { whisk, foam } from '../toolVox.js';
import { VESSEL } from '../vessels.js';
import { droplets, sparkle } from '../fx.js';
import { clamp, damp, mixHex } from '../../core/util.js';

const HOLD = 1.6; // seconds in the band to finish

export class WhiskStep extends Step {
  get station() { return 'bowl'; }
  get title() { return 'WHISK!'; }
  get hint() { return this.touch ? 'Wiggle fast' : 'Wiggle fast'; }

  begin() {
    this.limit = 10;
    const bowl = this.P.bowl;
    this.c = bowl.getWorldPosition(new THREE.Vector3());
    this.floor = this.c.y + VESSEL.bowl.floor;
    const f = this.cook.food;
    this.color = mixHex(f.egg ? 0xffe090 : 0xf4ecd8, f.liquid, 0.25);
    const s = this.cook.contents.slot('bowl');
    for (const e of s.extra) e.visible = false; // the yolk beats into the froth
    this.cook.contents.liquid('bowl', this.color);
    this.foams = [];
    this.foamK = -1;
    this.whisk = this.temp(whisk());
    this.whisk.scale.setScalar(1.45);
    this.x = 0; this.vx = 0; this.lastMx = null; this.energy = 0;
    this.froth = 0.08; this.inBand = 0; this.over = 0; this.taps = 0;
    this.band = this.win(0.62, 0.86, 0, 1);
    this.gauge = null;
    this.finishT = -1;
    this.cook.food.where = 'bowl';
  }

  setFoam(k) {
    const q = Math.round(clamp(k, 0, 1) * 8);
    if (q === this.foamK) return;
    this.foamK = q;
    for (const m of this.foams) if (m) m.visible = false;
    if (!this.foams[q]) {
      const m = this.temp(foam(q / 8, mixHex(this.color, 0xffffff, 0.45)));
      m.position.set(this.c.x, this.c.y + VESSEL.bowl.surface - 0.01, this.c.z);
      this.foams[q] = m;
    }
    this.foams[q].visible = true;
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.gauge) this.gauge = this.ui.gauge({ top: 'Fluffy', label: 'Froth', zone: this.band, sweet: true });
    const R = VESSEL.bowl.r * 0.55;
    let push = 0;
    if (live && this.finishT < 0) {
      // drag: how fast the paw goes back and forth over the bowl
      const m = this.mouseAt(this.c.y + 0.2);
      if (m) {
        const tx = clamp(m.x - this.c.x, -R, R);
        if (this.lastMx !== null) push += Math.abs(tx - this.lastMx) / Math.max(dt, 1e-3) * 0.8;
        this.lastMx = tx;
        this.x = damp(this.x, tx, 30, dt);
      }
      // taps: each one flicks the whisk across
      if (this.pressed()) { this.taps++; this.vx = (this.taps % 2 ? 1 : -1) * 3.2; this.energy = Math.min(3, this.energy + 0.6); }
    }
    if (Math.abs(this.vx) > 0.01) { this.x = clamp(this.x + this.vx * dt * 0.06, -R, R); this.vx *= Math.exp(-dt * 10); }
    this.energy = damp(this.energy, clamp(push, 0, 3), 3, dt);
    if (this.finishT < 0 && this.t > 0.6) {
      // froth rises with brisk beating, sinks on its own
      this.froth = clamp(this.froth + (this.energy * 0.5 - 0.14) * dt, 0, 1.08);
      if (this.froth >= this.band[0] && this.froth <= this.band[1]) this.inBand += dt;
      if (this.froth > this.band[1] + 0.06) {
        this.over += dt;
        if (this.over > 0.3 && Math.floor((this.over - dt) / 0.6) !== Math.floor(this.over / 0.6)) this.float('Too stiff!', V3(this.c.x, this.c.y + 0.35, this.c.z), '#ff9a8a');
      }
      if (this.energy > 0.4 && (this.t * 12 | 0) % 2 === 0) this.audio.play('stir', { vol: 0.12, pitch: 1.6 + Math.random() * 0.4 });
      if (this.energy > 1.4 && Math.random() < dt * 5) droplets(this.fx, V3(this.c.x + this.x, this.c.y + 0.12, this.c.z), this.color, 2, this.c.y, 0.5);
      if (this.gauge) this.gauge.set(clamp(this.froth, 0, 1), '#fff4d8');
      if (this.inBand >= HOLD) {
        this.finishT = 0;
        this.final = clamp(100 - this.over * 22 - Math.max(0, this.live - 6) * 5, 25, 100);
        this.audio.play('sparkle');
        sparkle(this.fx, V3(this.c.x, this.c.y + 0.2, this.c.z), 12);
        this.float(this.final > 85 ? 'So fluffy!' : 'Whisked!', V3(this.c.x, this.c.y + 0.4, this.c.z), this.final > 85 ? '#ffe066' : '#9af07a');
      }
    }
    if (this.finishT >= 0) { this.finishT += dt; if (this.finishT > 0.5) this.finish(this.final); }
    this.setFoam(this.froth);
    // the whisk: tip in the bowl, handle up to the right paw, leaning with each stroke
    const lean = clamp(this.x / R, -1, 1);
    const W = this.whisk;
    W.position.set(this.c.x + this.x, this.floor + 0.01, this.c.z + Math.sin(this.t * 17) * 0.01 * this.energy);
    W.rotation.set(-0.3, 0, -0.5 - lean * 0.3);
    const top = V3(0, 52 * 0.0125 * 1.45, 0).applyEuler(W.rotation).add(W.position);
    this.R.speed = 30;
    this.R.goal.set(top.x + 0.04, top.y - 0.06, top.z + 0.08);
    this.R.setPose({ pitch: 0.35, roll: 0.45 + lean * 0.2, yaw: 0.9 });
    // the left paw hugs the bowl
    this.L.goal.set(this.c.x - 0.42, this.c.y + 0.22, this.c.z + 0.14);
    this.L.setPose({ pitch: 0.6, roll: 0.3, yaw: 0.7 });
  }

  timeout() {
    if (this.finishT >= 0) return;
    this.finishT = 0;
    this.final = clamp(this.inBand / HOLD * 70 - this.over * 15, 0, 70);
  }

  end() { this.R.speed = 14; super.end(); }
}
