// STIR: move the mouse in circles around the pot (or bowl / cup). Angular travel fills the
// meter before time runs out; whirling too fast slops liquid over the rim.
import { Step, V3, THREE } from './base.js';
import { VESSEL } from '../vessels.js';
import { droplets } from '../fx.js';
import { clamp, damp, mixHex } from '../../core/util.js';
import { DISHES } from '../../data/recipes.js';

const UPV = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();

export class StirStep extends Step {
  get station() { return this.opts.vessel || 'pot'; }
  get title() { return 'STIR!'; }
  get hint() { return `Move the mouse in <kbd>circles</kbd> around the ${this.vessel === 'cup' ? 'cup' : this.vessel}`; }

  begin() {
    this.vessel = this.opts.vessel || 'pot';
    this.limit = 9;
    const f = this.cook.food;
    const c = this.cook.contents;
    const prop = this.P[this.vessel === 'cup' ? 'mug' : this.vessel];
    const V = VESSEL[this.vessel];
    this.r = V.r;
    const dish = DISHES[this.opts.dish];
    const glow = dish?.buff === 'glow' || dish?.buff === 'sense';
    let color = f.liquid;
    if (this.vessel === 'bowl') color = mixHex(f.egg ? 0xffd860 : 0xf0e0c0, f.liquid, 0.35);
    c.liquid(this.vessel, color, glow);
    if (this.vessel !== 'cup' && f.chunks.length) c.chunks(this.vessel, f.chunks, this.vessel === 'pot' ? 16 : 10);
    if (this.vessel === 'bowl') {
      const s = c.slot('bowl');
      s.g.position.y = VESSEL.bowl.surface;
      for (const e of s.extra) e.visible = false; // yolk & shell bits disappear into the batter
    }
    this.liquidColor = color;
    this.center = prop.getWorldPosition(new THREE.Vector3());
    this.surfaceY = this.center.y + c.slot(this.vessel).g.position.y;
    this.center.y = this.surfaceY;
    if (this.vessel === 'pot') {
      this.k.setBurner(0, 1);
      this.cook.loop('boil', true, 0.5);
      if (this.cook.leftovers.length) { this.cook.useLeftovers(this.center.clone()); this.splashAt = 0.5; }
    } else if (this.cook.leftovers.length && this.vessel === 'bowl') {
      this.cook.useLeftovers(this.center.clone());
      this.splashAt = 0.5;
    }
    this.cook.food.where = this.vessel;
    this.spoon = this.borrow('spoon');
    this.need = (this.vessel === 'pot' ? 5 : this.vessel === 'bowl' ? 4 : 3) * Math.PI * 2;
    this.travel = 0;
    this.spills = 0;
    this.spillCd = 0;
    this.omega = 0;
    this.lastA = null;
    this.halfTurns = 0;
    this.pt = new THREE.Vector3(this.center.x + this.r * 0.45, this.surfaceY, this.center.z + this.r * 0.2);
    this.gauge = null;
    this.finishT = -1;
    this.placeSpoon();
  }

  placeSpoon() {
    const B = V3(this.pt.x, this.surfaceY - 0.015, this.pt.z);
    const reach = this.vessel === 'cup' ? 0.42 : 0.5;
    const H = B.clone().add(V3(0.55, 0.62, 0.28).normalize().multiplyScalar(reach));
    const dir = B.clone().sub(H).normalize();
    _x.crossVectors(UPV, dir).normalize();
    _y.crossVectors(dir, _x);
    _m.makeBasis(_x, _y, dir);
    this.spoon.quaternion.setFromRotationMatrix(_m);
    this.spoon.position.copy(B).addScaledVector(dir, -0.4);
    const s = this.vessel === 'cup' ? 0.78 : 1;
    this.spoon.scale.setScalar(s);
    if (s !== 1) this.spoon.position.copy(B).addScaledVector(dir, -0.4 * s);
    this.handle = this.spoon.position.clone().addScaledVector(dir, -0.2 * s);
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.gauge) this.gauge = this.ui.gauge({ top: 'Done!', label: 'Stir' });
    const c = this.center;
    if (this.splashAt !== undefined && this.t > this.splashAt) {
      delete this.splashAt;
      this.audio.play('bloop');
      droplets(this.fx, c.clone().setY(this.surfaceY + 0.02), this.liquidColor, 10, this.surfaceY - 0.05, 0.8);
    }
    if (live && this.finishT < 0) {
      const m = this.mouseAt(this.surfaceY);
      if (m) {
        const dx = m.x - c.x, dz = m.z - c.z;
        const d = Math.hypot(dx, dz);
        const R = this.r * 0.7;
        const k = d > R ? R / d : 1;
        this.pt.x = damp(this.pt.x, c.x + dx * k, 20, dt);
        this.pt.z = damp(this.pt.z, c.z + dz * k, 20, dt);
      }
      const ox = this.pt.x - c.x, oz = this.pt.z - c.z;
      const rad = Math.hypot(ox, oz);
      const a = Math.atan2(oz, ox);
      if (this.lastA !== null && rad > this.r * 0.18) {
        let da = a - this.lastA;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        this.travel += Math.abs(da);
        this.omega = damp(this.omega, da / Math.max(dt, 1e-3), 6, dt);
        const half = Math.floor(this.travel / Math.PI);
        if (half > this.halfTurns) { this.halfTurns = half; this.audio.play('stir'); }
      } else this.omega = damp(this.omega, 0, 4, dt);
      this.lastA = a;
      // too fast → slosh over the rim
      this.spillCd -= dt;
      const tps = Math.abs(this.omega) / (Math.PI * 2);
      if (tps > 2.3 && this.spillCd <= 0) {
        this.spills++;
        this.spillCd = 0.55;
        this.audio.play('splash', { vol: 0.5 });
        const out = V3(this.pt.x + ox * 0.6, this.surfaceY + 0.03, this.pt.z + oz * 0.6);
        droplets(this.fx, out, this.liquidColor, 9, 0.02, 1.1);
        this.float('Too fast!', out.clone().add(V3(0, 0.12, 0)), '#ff9a8a');
        this.cook.shake(0.004);
      }
      const fill = this.travel / this.need;
      if (this.gauge) this.gauge.set(fill, tps > 1.8 ? '#ffb08a' : '#9af07a');
      if (fill >= 1) {
        this.finishT = 0;
        this.audio.play('ding');
        this.float('Smooth!', c.clone().add(V3(0, 0.15, 0)), '#9af07a');
      }
    } else if (!live) {
      // idle swirl during intro/feedback
      const a = this.t * 1.5;
      this.pt.x = damp(this.pt.x, c.x + Math.cos(a) * this.r * 0.4, 6, dt);
      this.pt.z = damp(this.pt.z, c.z + Math.sin(a) * this.r * 0.4, 6, dt);
      this.omega = damp(this.omega, 0, 3, dt);
    }
    if (this.finishT >= 0) {
      this.finishT += dt;
      if (this.finishT > 0.3) this.finish(100 - this.spills * 12);
    }
    const slot = this.cook.contents.slot(this.vessel);
    slot.spin = clamp(this.omega * 0.6, -6, 6);
    this.placeSpoon();
    // paws: right on the spoon handle, left holding the vessel
    const h = this.handle;
    this.R.goal.set(h.x + 0.03, h.y + 0.04, h.z + 0.05);
    this.R.setPose({ pitch: 0.35, roll: 0.3, yaw: 0.35 });
    const lr = this.vessel === 'cup' ? 0.27 : this.vessel === 'pot' ? 0.46 : 0.42;
    this.L.goal.set(c.x - lr, this.surfaceY + (this.vessel === 'pot' ? 0.06 : 0.04), c.z + 0.08);
    this.L.setPose({ pitch: 0.55, roll: 0.3, yaw: 0.55 });
  }

  timeout() {
    const fill = clamp(this.travel / this.need, 0, 1);
    this.finish(fill * 82 - this.spills * 12);
  }

  end() {
    this.cook.contents.slot(this.vessel).spin = 0;
    super.end();
  }
}
