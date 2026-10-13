// CRACK: an egg above the bowl and a swinging power meter. Click inside the sweet zone.
// Too gentle just dents it (try again, costs points); too hard smashes shell into the bowl.
import { Step, V3, THREE } from './base.js';
import { egg, eggShell, yolk, shellBit } from '../models.js';
import { droplets, sparkle } from '../fx.js';
import { VESSEL } from '../vessels.js';
import { clamp } from '../../core/util.js';

export class CrackStep extends Step {
  get station() { return 'bowl'; }
  get title() { return 'CRACK!'; }
  get hint() { return '<kbd>Click</kbd> when the swinging power is in the gold zone'; }

  begin() {
    this.limit = 9;
    const S = this.S;
    this.rimY = 12 * 0.025;
    this.bowlTop = V3(S.x, this.rimY, S.z);
    this.egg = this.temp(egg(false));
    this.egg.scale.setScalar(1.45);
    this.eggPos = V3(S.x + 0.26, this.rimY + 0.17, S.z + 0.02);
    this.egg.position.copy(this.eggPos);
    const mid = 0.68 + (Math.random() - 0.5) * 0.12;
    this.zone = [mid - 0.085, mid + 0.085];
    this.power = 0;
    this.phaseP = Math.random() * 2;
    this.speed = 1.15;
    this.tries = 0;
    this.swingT = -1;
    this.result = null;
    this.after = 0;
    this.gauge = null;
  }

  ensureGauge() {
    if (this.gauge) return;
    this.gauge = this.ui.gauge({ top: 'Smash!', label: 'Tap', zone: this.zone, sweet: true });
  }

  tick(dt, live) {
    const S = this.S;
    if (this.t > 0.6) this.ensureGauge();
    // swinging power (ping-pong with ease)
    if (!this.result && this.swingT < 0) {
      this.phaseP += dt * this.speed;
      const u = this.phaseP % 2;
      const tri = u < 1 ? u : 2 - u;
      this.power = 0.5 - Math.cos(tri * Math.PI) * 0.5;
      if (this.gauge) { this.gauge.mark(this.power); this.gauge.set(this.power, this.power > this.zone[1] ? '#ff9a8a' : this.power >= this.zone[0] ? '#ffe066' : '#f3e2bf'); }
      if (live && this.pressed()) { this.swingT = 0; this.hitPower = this.power; this.hitDone = false; }
    }
    // egg: hovers with a wind-up, then swings onto the rim
    const rim = V3(S.x + 0.3, this.rimY + 0.03, S.z + 0.02);
    if (this.swingT >= 0) {
      this.swingT += dt;
      const t = this.swingT;
      const dur = 0.22 - this.hitPower * 0.1;
      if (t < dur) {
        const k = t / dur;
        this.egg.position.lerpVectors(this.eggPos, rim, k * k);
        this.egg.rotation.z = -k * 0.6;
      } else if (!this.result || this.result === 'weak') {
        if (!this.hitDone) { this.hitDone = true; this.impact(); }
        if (this.result === 'weak') {
          // bounce back up and keep swinging
          const k = clamp((t - dur) / 0.3, 0, 1);
          this.egg.position.lerpVectors(rim, this.eggPos, k);
          this.egg.rotation.z = -0.6 * (1 - k);
          if (k >= 1) { this.swingT = -1; this.result = null; }
        }
      }
    } else if (!this.result) {
      this.egg.position.copy(this.eggPos);
      this.egg.position.y += Math.sin(this.t * 3) * 0.01 + (this.power - 0.5) * 0.06;
      this.egg.rotation.z = (this.power - 0.5) * 0.4;
    }
    // shells & yolk falling after a crack
    if (this.result === 'good' || this.result === 'smash') {
      this.after += dt;
      const k = clamp(this.after / 0.35, 0, 1);
      for (const h of this.halves) {
        h.m.position.lerpVectors(h.from, h.to, k);
        h.m.rotation.z = h.rz * k;
      }
      if (this.drop) {
        const d = this.drop;
        d.vy -= 6 * dt;
        d.m.position.y = Math.max(d.floor, d.m.position.y + d.vy * dt);
        if (d.m.position.y <= d.floor && !d.landed) {
          d.landed = true;
          this.audio.play('bloop');
          droplets(this.fx, d.m.position.clone().setY(d.floor + 0.02), 0xffd84a, 5, d.floor, 0.5);
        }
      }
      for (const b of this.bits) {
        b.vy -= 6 * dt;
        b.m.position.addScaledVector(b.v, dt);
        b.m.position.y = Math.max(b.floor, b.m.position.y + b.vy * dt);
        if (b.m.position.y <= b.floor) b.v.multiplyScalar(0.8);
      }
      if (this.after > 0.95 && !this.done) this.finish(this.final);
    }
    // paws: right holds the egg, left steadies the bowl
    const e = this.halves ? this.halves[1].m.position : this.egg.position;
    this.R.speed = 24;
    this.R.goal.set(e.x + (this.halves ? 0.2 : 0.17), e.y - 0.02, e.z + 0.1);
    this.R.setPose({ pitch: 0.25, roll: 0.55, yaw: 1.15 });
    if (this.halves) {
      const l = this.halves[0].m.position;
      this.L.goal.set(l.x - 0.2, l.y - 0.02, l.z + 0.1);
      this.L.setPose({ pitch: 0.25, roll: 0.55, yaw: 1.15 });
    } else {
      this.L.goal.set(S.x - 0.42, this.rimY + 0.02, S.z + 0.14);
      this.L.setPose({ pitch: 0.6, roll: 0.3, yaw: 0.7 });
    }
  }

  impact() {
    const p = this.hitPower;
    const [lo, hi] = this.zone;
    const S = this.S;
    const at = this.egg.position.clone();
    this.cook.shake(0.004 + p * 0.01);
    if (p < lo - 0.02) {
      this.result = 'weak';
      this.tries++;
      this.audio.play('click');
      this.float(this.tries > 1 ? 'Still too gentle!' : 'Too gentle!', at.clone().add(V3(0, 0.1, 0)), '#9fdcff');
      // dented egg
      if (!this.dented) {
        const pos = this.egg.position.clone();
        this.egg.parent.remove(this.egg);
        this.egg = this.temp(egg(true));
        this.egg.scale.setScalar(1.45);
        this.egg.position.copy(pos);
        this.dented = true;
      }
      this.speed *= 1.12;
      return;
    }
    const mid = (lo + hi) / 2;
    this.audio.play('crack_egg');
    this.cook.food.egg = true;
    this.cook.food.where = 'bowl';
    // split into two shell halves, drop the yolk in
    this.egg.visible = false;
    this.halves = [-1, 1].map((sd) => {
      const m = this.temp(eggShell());
      m.scale.setScalar(1.25);
      m.rotation.x = Math.PI; // open side down
      m.position.copy(at);
      return { m, from: at.clone(), to: at.clone().add(V3(sd * 0.2 - 0.04, 0.1, -0.02)), rz: sd * 1.3 };
    });
    const y = yolk(true);
    y.scale.setScalar(1.25);
    y.position.set(at.x - S.x - 0.02, 0.18, at.z - S.z);
    const slot = this.cook.contents.slot('bowl');
    this.cook.contents.addExtra('bowl', y);
    slot.g.position.y = VESSEL.bowl.floor;
    this.drop = { m: y, vy: 0, floor: 0.005, landed: false };
    // pull it toward the bowl center as it falls
    y.position.x *= 0.4;
    this.bits = [];
    if (p > hi + 0.02) {
      this.result = 'smash';
      this.final = clamp(62 - (p - hi) * 220 - this.tries * 12, 5, 60);
      this.audio.play('crack');
      for (let i = 0; i < 6; i++) {
        const b = shellBit(i + 1);
        b.scale.setScalar(1.6);
        b.position.set(y.position.x + (Math.random() - 0.5) * 0.1, 0.16 + Math.random() * 0.06, y.position.z + (Math.random() - 0.5) * 0.08);
        this.cook.contents.addExtra('bowl', b);
        this.bits.push({ m: b, vy: 0.4, v: V3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.3), floor: 0.025 });
      }
      droplets(this.fx, at, 0xffd84a, 8, this.rimY - 0.1, 0.8);
      this.float('Shell everywhere!', at.clone().add(V3(0, 0.12, 0)), '#ff9a8a');
    } else {
      this.result = 'good';
      const k = clamp(Math.abs(p - mid) / ((hi - lo) / 2), 0, 1.3);
      this.final = clamp(100 - k * 22 - this.tries * 14, 20, 100);
      if (k < 0.35) sparkle(this.fx, at, 10);
      this.float(k < 0.35 ? 'Clean crack!' : 'Crack!', at.clone().add(V3(0, 0.12, 0)), '#ffe066');
    }
  }

  timeout() {
    if (this.swingT < 0 && !this.result) { this.swingT = 0; this.hitPower = this.power; this.hitDone = false; }
  }

  end() {
    // the shell halves go away, yolk stays in the bowl (contents)
    this.R.speed = 14;
    super.end();
  }
}

export { THREE };
