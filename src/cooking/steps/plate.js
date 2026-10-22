// PLATE: the finished food slides back and forth on the spatula above the plate.
// Click to let it drop; the closer to the center, the better.
import { Step, V3, THREE } from './base.js';
import { standeeMesh } from '../food.js';
import { sparkle, puff } from '../fx.js';
import { clamp } from '../../core/util.js';

const UPV = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const PLATE_TOP = 0.075;
const PLATE_R = 0.32;

export class PlateStep extends Step {
  get station() { return 'plate'; }
  get title() { return 'PLATE IT!'; }
  get hint() { return this.touch ? '<b>Tap</b> to drop it in the middle of the plate' : '<kbd>Click</kbd> to drop it in the middle of the plate'; }

  begin() {
    this.limit = 8;
    const S = this.S;
    this.food = standeeMesh(this.opts.dish, { px: 0.028 });
    this.temp(this.food);
    this.spat = this.borrow('spatula');
    this.phaseA = Math.random() * Math.PI * 2;
    this.y0 = PLATE_TOP + 0.36;
    this.x = S.x;
    this.dropped = false;
    this.vy = 0;
    this.landed = false;
    this.bounce = 0;
    this.after = 0;
    this.tiltT = 0;
    // food leaving the pan / board ends up here
    const pan = this.cook.contents.v.pan;
    if (pan) pan.g.visible = false;
    if (this.cook.leftovers.length) this.cook.useLeftovers(S.clone().setY(this.y0));
    this.cook.food.where = 'plate';
  }

  placeSpatula(x, roll) {
    const S = this.S;
    const B = V3(x, this.y0 - 0.012, S.z);
    const dir = V3(-0.85, -0.2, -0.5).normalize();
    _x.crossVectors(UPV, dir).normalize();
    _y.crossVectors(dir, _x);
    _m.makeBasis(_x, _y, dir);
    this.spat.quaternion.setFromRotationMatrix(_m);
    this.spat.rotateZ(roll);
    this.spat.position.copy(B).addScaledVector(dir, -0.41);
    this.handle = this.spat.position.clone().addScaledVector(dir, -0.14);
  }

  tick(dt, live) {
    const S = this.S;
    if (!this.dropped) {
      const speed = 2.2 + Math.min(1.4, this.live * 0.22);
      if (live) this.phaseA += dt * speed;
      else this.phaseA += dt * 1.2;
      this.x = S.x + Math.sin(this.phaseA) * 0.36;
      this.food.position.set(this.x, this.y0, S.z);
      this.food.rotation.set(0, 0, Math.sin(this.phaseA * 2) * 0.05);
      if (live && this.pressed()) this.drop();
    } else {
      this.tiltT = Math.min(1, this.tiltT + dt * 6);
      if (!this.landed) {
        this.vy -= 5.5 * dt;
        this.food.position.y += this.vy * dt;
        const dx = Math.abs(this.food.position.x - S.x);
        const floor = dx <= PLATE_R ? PLATE_TOP : 0.0;
        if (this.food.position.y <= floor) {
          this.food.position.y = floor;
          this.landed = true;
          this.bounce = 1;
          this.onLand(dx);
        }
      } else {
        this.after += dt;
        this.bounce = Math.max(0, this.bounce - dt * 4);
        const b = Math.sin(this.bounce * Math.PI * 2) * this.bounce;
        this.food.scale.set(1 + b * 0.25, 1 - b * 0.3, 1);
        if (this.after > 0.55) this.finish(this.final);
      }
    }
    this.placeSpatula(this.dropped ? this.x : this.x, this.dropped ? -this.tiltT * 0.9 : 0);
    const h = this.handle;
    this.R.speed = 30;
    this.R.goal.set(h.x + 0.08, h.y + 0.02, h.z + 0.06);
    this.R.setPose({ pitch: 0.2, roll: 0.45 + (this.dropped ? this.tiltT * 0.4 : 0), yaw: 1.05 });
    this.L.goal.set(S.x - 0.42, PLATE_TOP + 0.08, S.z + 0.1);
    this.L.setPose({ pitch: 0.6, roll: 0.3, yaw: 0.6 });
  }

  drop() {
    if (this.dropped) return;
    this.dropped = true;
    this.vy = 0.3;
    this.audio.play('whoosh');
  }

  onLand(dx) {
    const S = this.S;
    const at = this.food.position.clone();
    if (dx > PLATE_R) {
      this.final = 5;
      this.audio.play('thud');
      this.float('On the counter!', at.clone().add(V3(0, 0.3, 0)), '#ff9a8a');
      puff(this.fx, at.clone().add(V3(0, 0.02, 0)), 0xd8c8a8, 8, 0.15);
      return;
    }
    const bull = 0.04 * this.skill;
    this.final = dx < bull ? 100 : clamp(100 - ((dx - bull) / (PLATE_R - bull)) * 100, 0, 100);
    this.audio.play('plate');
    this.cook.shake(0.003);
    if (this.final >= 85) { sparkle(this.fx, at.clone().add(V3(0, 0.12, 0)), 14); this.float('Bullseye!', at.clone().add(V3(0, 0.38, 0)), '#ffe066'); }
    else this.float(this.final >= 50 ? 'Nice!' : 'Off-center', at.clone().add(V3(0, 0.38, 0)), this.final >= 50 ? '#9af07a' : '#9fdcff');
    void S;
  }

  timeout() { this.drop(); }

  end() {
    this.R.speed = 14;
    // the plated food becomes the dish shown in the finale
    this.objs = this.objs.filter((o) => o !== this.food);
    this.food.scale.set(1, 1, 1);
    this.cook.dishModel = this.food;
    super.end();
  }
}
