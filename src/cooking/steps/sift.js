// SIFT: the sieve swings back and forth over the bowl in the right paw. Tap (click, Space or a
// finger) to give it a shake: a soft fall of flour drops through. Over the bowl it builds a fine
// heap; off to the side it dusts the counter. It swings a little quicker after every good shake.
import { Step, V3, THREE } from './base.js';
import { sieve, heap } from '../toolVox.js';
import { VESSEL } from '../vessels.js';
import { puff, sparkle } from '../fx.js';
import { clamp } from '../../core/util.js';

const NEED = 7; // good shakes to fill the bowl

export class SiftStep extends Step {
  get station() { return 'bowl'; }
  get title() { return 'SIFT!'; }
  get hint() { return 'Tap over bowl'; }

  begin() {
    this.limit = 11;
    const bowl = this.P.bowl;
    this.c = bowl.getWorldPosition(new THREE.Vector3());
    this.top = this.c.y + 0.42;
    this.sieve = this.temp(sieve());
    this.ph = Math.random() * Math.PI;
    this.speed = 1.6;
    this.amp = VESSEL.bowl.r * 1.35;
    this.good = 0; this.miss = 0; this.shakeT = 0;
    this.heaps = []; this.heapK = -1;
    this.spills = [];
    this.falls = [];
    this.gauge = null;
    this.finishT = -1;
    this.flour = this.cook.ings?.includes('flour') ? 0xf6eedc : 0xf0e4c8;
    this.cook.food.where = 'bowl';
    this.cook.food.dough = true;
  }

  setHeap(k) {
    const q = Math.round(clamp(k, 0, 1) * 7);
    if (q === this.heapK) return;
    this.heapK = q;
    for (const h of this.heaps) if (h) h.visible = false;
    if (!q) return;
    if (!this.heaps[q]) {
      const m = this.temp(heap(q / 7, this.flour, 16));
      m.position.set(this.c.x, this.c.y + VESSEL.bowl.floor, this.c.z);
      this.heaps[q] = m;
    }
    this.heaps[q].visible = true;
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.gauge) this.gauge = this.ui.gauge({ top: 'Full', label: 'Flour' });
    if (this.finishT < 0) this.ph += dt * this.speed;
    const x = Math.sin(this.ph) * this.amp;
    const over = Math.abs(x) < VESSEL.bowl.r * 0.55;
    this.shakeT = Math.max(0, this.shakeT - dt);
    const jig = this.shakeT > 0 ? Math.sin(this.shakeT * 70) * 0.012 * (this.shakeT / 0.25) : 0;
    this.sieve.position.set(this.c.x + x + jig, this.top + Math.abs(jig), this.c.z);
    this.sieve.rotation.z = Math.cos(this.ph) * 0.12;
    // the rim of the bowl glows warm while the sieve is over it (the cue to shake)
    this.sieve.scale.setScalar(over ? 1.04 : 1);
    if (live && this.finishT < 0 && this.pressed() && this.shakeT < 0.12) {
      this.shakeT = 0.25;
      this.audio.play('shake', { vol: 0.6 });
      const at = this.sieve.position.clone();
      this.falls.push({ x: at.x, y: at.y - 0.02, z: at.z, vy: 0, good: over, t: 0 });
      if (over) {
        this.good++;
        this.speed *= 1.1;
        if (this.good % 2 === 0) this.audio.play('ding', { vol: 0.2, pitch: 1.2 + this.good * 0.06 });
      } else {
        this.miss++;
        this.float('Missed!', at.clone().add(V3(0, 0.12, 0)), '#ff9a8a');
      }
    }
    // the flour falling: a soft column of voxel dust
    for (const f of this.falls) {
      f.t += dt;
      if (f.t < 0.35 && Math.random() < 0.8) puff(this.fx, V3(f.x + (Math.random() - 0.5) * 0.12, f.y - f.t * 0.8, f.z + (Math.random() - 0.5) * 0.08), this.flour, 1, 0.05);
      if (!f.landed && f.t > 0.3) {
        f.landed = true;
        if (!f.good) {
          const m = this.temp(heap(0.25, this.flour, 7));
          m.position.set(f.x, this.c.y + 0.002, f.z + 0.12);
          this.spills.push(m);
        }
      }
    }
    this.falls = this.falls.filter((f) => f.t < 0.6);
    this.setHeap(this.good / NEED);
    if (this.gauge) this.gauge.set(clamp(this.good / NEED, 0, 1), '#f6eedc');
    if (this.finishT < 0 && this.good >= NEED) {
      this.finishT = 0;
      this.final = clamp(100 - this.miss * 12, 20, 100);
      this.audio.play('sparkle');
      sparkle(this.fx, V3(this.c.x, this.c.y + 0.15, this.c.z), 10);
      this.float(this.miss ? 'Sifted!' : 'Light as air!', V3(this.c.x, this.c.y + 0.42, this.c.z), this.miss ? '#9af07a' : '#ffe066');
    }
    if (this.finishT >= 0) { this.finishT += dt; if (this.finishT > 0.55) this.finish(this.final); }
    // paws: right holds the sieve's handle, left taps its rim
    const S = this.sieve.position;
    this.R.speed = 28; this.L.speed = 28;
    this.R.goal.set(S.x + 0.42, S.y + 0.02, S.z + 0.08);
    this.R.setPose({ pitch: 0.2, roll: 0.6, yaw: 0.9 });
    this.L.goal.set(S.x - 0.28, S.y + 0.06 - (this.shakeT > 0.15 ? 0.04 : 0), S.z + 0.1);
    this.L.setPose({ pitch: 0.7, roll: 0.3, yaw: 0.6 });
  }

  timeout() {
    if (this.finishT >= 0) return;
    this.finishT = 0;
    this.final = clamp(this.good / NEED * 70 - this.miss * 8, 0, 70);
  }

  end() { this.R.speed = 14; this.L.speed = 14; super.end(); }
}
