// SEASON: shake the salt by moving the mouse up and down (or clicking). The meter fills;
// stop inside the target zone with Space or the Done button. Too much is too salty.
import { Step, V3, THREE } from './base.js';
import { VESSEL } from '../vessels.js';
import { clamp } from '../../core/util.js';

export class SeasonStep extends Step {
  get station() { return this.opts.vessel || 'pot'; }
  get title() { return 'SEASON!'; }
  get hint() { return this.touch ? '<b>Tap</b> or drag up & down to shake · <b>Done</b> when it\'s just right' : 'Shake: move the mouse <kbd>up & down</kbd> or click · <kbd>Space</kbd> when it\'s just right'; }

  begin() {
    this.vessel = this.opts.vessel || 'pot';
    this.limit = 11;
    const prop = this.P[this.vessel];
    const c = this.cook.contents;
    const slot = c.slot(this.vessel);
    if (!slot.liquid && this.vessel !== 'pan') c.liquid(this.vessel, this.cook.food.liquid);
    if (this.vessel === 'bowl' && slot.extra.length && !slot.liquid) slot.g.position.y = VESSEL.bowl.floor;
    this.center = prop.getWorldPosition(new THREE.Vector3());
    this.surfaceY = this.center.y + slot.g.position.y;
    this.center.y = this.surfaceY;
    if (this.vessel === 'pot') { this.k.setBurner(0, 1); this.cook.loop('boil', true, 0.35); }
    this.shaker = this.borrow('shaker');
    this.shaker.scale.setScalar(0.95);
    const mid = 0.6 + (Math.random() - 0.5) * 0.14;
    this.zone = this.win(mid - 0.075, mid + 0.075, 0.05, 0.98);
    this.amount = 0;
    this.shakes = 0;
    this.jolt = 0;
    this.lastY = null;
    this.dirY = 0;
    this.travelY = 0;
    this.finishT = -1;
    this.gauge = null;
  }

  ensureGauge() {
    if (this.gauge) return;
    this.gauge = this.ui.gauge({ top: 'Too salty!', label: 'Salt', zone: this.zone, button: { text: 'Done', onClick: () => this.stop() } });
  }

  shake(power = 1) {
    if (this.finishT >= 0) return;
    this.shakes++;
    this.jolt = 1;
    this.amount += (0.045 + Math.random() * 0.02) * power;
    this.audio.play('shake');
    const cap = this.shaker.localToWorld(new THREE.Vector3(0, 11 * 0.025, 0));
    for (let i = 0; i < 7; i++) {
      this.fx.emit({ pos: [cap.x + (Math.random() - 0.5) * 0.05, cap.y, cap.z + (Math.random() - 0.5) * 0.05], vel: [(Math.random() - 0.5) * 0.3, -0.4 - Math.random() * 0.5, (Math.random() - 0.5) * 0.2], color: Math.random() < 0.3 ? 0xf6d8d8 : 0xffffff, size: 0.012, life: 0.7, gravity: 3, floor: this.surfaceY + 0.003, fade: 0.3 });
    }
    if (this.amount >= 1) {
      this.amount = 1;
      this.float('WAY too salty!', this.center.clone().add(V3(0, 0.25, 0)), '#ff9a8a');
      this.stop();
    }
  }

  stop() {
    if (this.finishT >= 0 || this.done || !this.liveOk) return;
    this.finishT = 0;
    const [lo, hi] = this.zone;
    const a = this.amount;
    const mid = (lo + hi) / 2;
    let s;
    if (a >= lo && a <= hi) s = 100 - (Math.abs(a - mid) / (hi - lo) * 2) * 16;
    else if (a < lo) s = clamp((a / lo) * 78 - 6, 0, 78);
    else s = clamp(78 - (a - hi) * 330, 0, 78);
    this.final = s;
    const word = a < lo ? (a < lo * 0.5 ? 'Bland...' : 'A bit bland') : a > hi ? 'Salty!' : 'Just right!';
    this.float(word, this.center.clone().add(V3(0, 0.2, 0)), a >= lo && a <= hi ? '#ffe066' : '#9fdcff');
    if (a >= lo && a <= hi) this.audio.play('ding');
  }

  tick(dt, live) {
    if (this.t > 0.5) this.ensureGauge();
    this.liveOk = live;
    const inp = this.input;
    if (live && this.finishT < 0) {
      if (inp.mousePressed(0)) this.shake(1);
      if (inp.pressed('Space', 'Enter')) this.stop();
      // vertical wiggle: a direction change after enough travel is one shake
      const y = inp.mouse.y;
      if (this.lastY !== null) {
        const dy = y - this.lastY;
        if (Math.abs(dy) > 0.5) {
          const dir = Math.sign(dy);
          if (dir !== this.dirY) {
            if (this.travelY > 28 && this.dirY !== 0) this.shake(clamp(this.travelY / 90, 0.7, 1.3));
            this.dirY = dir;
            this.travelY = 0;
          }
          this.travelY += Math.abs(dy);
        }
      }
      this.lastY = y;
    }
    if (this.gauge) {
      const [lo, hi] = this.zone;
      this.gauge.set(this.amount, this.amount > hi ? '#ff9a8a' : this.amount >= lo ? '#9af07a' : '#f3e2bf');
    }
    if (this.finishT >= 0) {
      this.finishT += dt;
      if (this.finishT > 0.45) this.finish(this.final);
    }
    // the shaker hangs over the food upside down, and jolts with each shake
    this.jolt = Math.max(0, this.jolt - dt * 7);
    const bob = Math.sin(this.jolt * Math.PI) * 0.07;
    const c = this.center;
    const m = this.input.mouse;
    this.follow = this.follow ?? 0;
    this.follow += ((live ? clamp(m.ny, -0.6, 0.6) : 0) - this.follow) * Math.min(1, dt * 18);
    this.shaker.position.set(c.x + 0.16, this.surfaceY + 0.26 - bob + this.follow * 0.09, c.z + 0.02);
    this.shaker.rotation.set(0.25, 0, Math.PI * 0.72 + Math.sin(this.jolt * Math.PI) * 0.25);
    const sp = this.shaker.position;
    this.R.goal.set(sp.x + 0.2, sp.y - 0.04, sp.z + 0.1);
    this.R.setPose({ pitch: 0.1, roll: 0.7, yaw: 1.2 });
    const lr = this.vessel === 'pot' ? 0.46 : 0.42;
    this.L.goal.set(c.x - lr, this.surfaceY + 0.05, c.z + 0.08);
    this.L.setPose({ pitch: 0.55, roll: 0.3, yaw: 0.55 });
  }

  timeout() {
    this.liveOk = true;
    this.stop();
    if (this.finishT < 0) this.finish(0);
  }

  end() {
    this.shaker.scale.setScalar(1);
    super.end();
  }
}
