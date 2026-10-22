// POUR: hold the mouse to tip the jug; release so the cup's level settles in the target band.
// The jug keeps dribbling for a moment after you let go, so let go a little early.
import { Step, V3, THREE } from './base.js';
import { VESSEL } from '../vessels.js';
import { droplets, sparkle } from '../fx.js';
import { clamp, damp } from '../../core/util.js';

const SPOUT = new THREE.Vector3(-0.25, 0.49, 0); // jug-local spout tip
const GRIP = new THREE.Vector3(0.22, 0.3, 0); // jug-local handle
const JUG_S = 0.68;

export class PourStep extends Step {
  get station() { return 'cup'; }
  get title() { return 'POUR!'; }
  get hint() { return this.touch ? '<b>Hold</b> to pour · let go when the level is in the band' : '<kbd>Hold</kbd> to pour · let go when the level is in the band'; }

  begin() {
    this.limit = 11;
    const c = this.cook.contents;
    this.color = this.cook.food.liquid;
    c.liquid('cup', this.color);
    c.setLevel('cup', 0);
    this.level = 0;
    this.mug = this.P.mug;
    this.cup = this.mug.getWorldPosition(new THREE.Vector3());
    this.rimY = this.cup.y + VESSEL.cup.rim;
    this.jug = this.borrow('jug');
    this.jug.scale.setScalar(JUG_S);
    this.tilt = 0.15;
    this.flow = 0;
    const mid = 0.78 + (Math.random() - 0.5) * 0.08;
    this.band = this.win(mid - 0.075, mid + 0.075, 0.1, 0.97);
    this.poured = false;
    this.idleT = 0;
    this.pourSfx = 0;
    this.finishT = -1;
    this.gauge = null;
    const m = new THREE.MeshLambertMaterial({ color: this.color });
    this.stream = this.temp(new THREE.Mesh(new THREE.BoxGeometry(0.028, 1, 0.028), m));
    this.stream.visible = false;
    this.cook.food.where = 'cup';
    if (this.cook.leftovers.length) this.cook.useLeftovers(this.cup.clone().setY(this.rimY));
  }

  levelScore() {
    const [lo, hi] = this.band;
    const l = this.level;
    const mid = (lo + hi) / 2;
    if (l >= lo && l <= hi) return 100 - (Math.abs(l - mid) / ((hi - lo) / 2)) * 15;
    if (l < lo) return clamp(84 - (lo - l) * 260, 0, 84);
    return clamp(84 - (l - hi) * 480, 0, 84);
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.gauge) this.gauge = this.ui.gauge({ top: 'Full', label: 'Level', zone: this.band });
    const inp = this.input;
    const holding = live && this.finishT < 0 && (inp.mouseDown(0) || inp.isDown('Space'));
    this.tilt = damp(this.tilt, holding ? 1.3 : 0.15, holding ? 3.2 : 5, dt);
    const rate = clamp((this.tilt - 0.72) / 0.5, 0, 1);
    this.flow = rate;
    if (rate > 0.01 && this.finishT < 0) {
      this.level += rate * 0.3 * dt;
      this.poured = true;
      this.pourSfx -= dt;
      if (this.pourSfx <= 0) { this.pourSfx = 0.5; this.audio.play('pour'); }
      if (Math.random() < dt * 8) this.fx.emit({ pos: [this.cup.x + (Math.random() - 0.5) * 0.06, this.cup.y + VESSEL.cup.floor + this.level * 0.27, this.cup.z], vel: [(Math.random() - 0.5) * 0.4, 0.5, 0.1], color: this.color, size: 0.012, life: 0.4, gravity: 4, fade: 0.3 });
    }
    if (this.level >= 1 && this.finishT < 0) {
      this.level = 1;
      this.finishT = 0;
      this.final = 10;
      this.audio.play('splash', { vol: 0.6 });
      droplets(this.fx, this.cup.clone().setY(this.rimY + 0.02), this.color, 14, 0.01, 1);
      this.float('Overflow!', this.cup.clone().setY(this.rimY + 0.2), '#ff9a8a');
    }
    // stop once the pouring is over (released and the jug is back up)
    if (live && this.poured && !holding && rate <= 0.001 && this.finishT < 0) {
      this.idleT += dt;
      if (this.idleT > 0.25 && this.level > 0.15) {
        this.finishT = 0;
        this.final = this.levelScore();
        const [lo, hi] = this.band;
        const ok = this.level >= lo && this.level <= hi;
        this.float(ok ? 'Right on the line!' : this.level < lo ? 'A bit short' : 'A tad much', this.cup.clone().setY(this.rimY + 0.2), ok ? '#ffe066' : '#9fdcff');
        if (ok) { sparkle(this.fx, this.cup.clone().setY(this.rimY), 10); this.audio.play('ding'); }
      }
    } else this.idleT = 0;
    if (this.finishT >= 0) {
      this.finishT += dt;
      if (this.finishT > 0.4) this.finish(this.final);
    }
    this.cook.contents.setLevel('cup', this.level);
    if (this.gauge) {
      const [lo, hi] = this.band;
      this.gauge.set(this.level, this.level > hi ? '#ff9a8a' : this.level >= lo ? '#9af07a' : '#9fdcff');
    }
    // jug pivots around its spout, which hangs over the cup's rim
    const P = V3(this.cup.x + 0.05, this.rimY + 0.06, this.cup.z + 0.01);
    this.jug.rotation.set(0, 0, this.tilt);
    this.jug.updateMatrix();
    const off = SPOUT.clone().multiplyScalar(JUG_S).applyQuaternion(this.jug.quaternion);
    this.jug.position.copy(P).sub(off);
    // stream from the spout to the liquid surface
    const surf = this.cup.y + VESSEL.cup.floor + this.level * (VESSEL.cup.rim - VESSEL.cup.floor - 0.025);
    this.stream.visible = rate > 0.02;
    if (this.stream.visible) {
      const len = Math.max(0.01, P.y - surf);
      this.stream.scale.set(0.6 + rate * 0.6 + Math.sin(this.t * 40) * 0.1, len, 0.6 + rate * 0.6);
      this.stream.position.set(P.x - 0.02, surf + len / 2, P.z);
    }
    // paws: right on the jug handle, left steadying the mug
    this.jug.updateMatrixWorld(true);
    const g = this.jug.localToWorld(GRIP.clone());
    this.R.speed = 30;
    this.R.goal.set(g.x + 0.12, g.y - 0.02, g.z + 0.08);
    this.R.setPose({ pitch: 0.15, roll: 0.55 + this.tilt * 0.35, yaw: 1.1 });
    this.L.goal.set(this.cup.x - 0.2, this.cup.y + 0.2, this.cup.z + 0.06);
    this.L.setPose({ pitch: 0.4, roll: 0.35, yaw: 0.9 });
  }

  timeout() {
    if (this.finishT < 0) { this.finishT = 0; this.final = this.poured ? this.levelScore() : 0; }
  }

  end() {
    this.R.speed = 14;
    super.end();
  }
}
