// SIMMER: keep the pot at a gentle simmer with the heat knob. Hold (mouse, Space, a finger) to turn
// the burner up, let go and it eases down. The pot lags behind the flame, so lead it. In the band the
// dish cooks; too cold and nothing happens; too hot and foam climbs the pot until it boils over.
import { Step, V3, THREE } from './base.js';
import { VESSEL } from '../vessels.js';
import { droplets, smoke, steam, sparkle } from '../fx.js';
import { STOVE, WALL_Z } from '../kitchen.js';
import { clamp, damp, mixHex } from '../../core/util.js';
import { DISHES } from '../../data/recipes.js';

const BAND = [0.46, 0.7];

export class SimmerStep extends Step {
  get station() { return 'pot'; }
  get title() { return 'SIMMER!'; }
  get hint() { return this.touch ? '<b>Hold</b> to turn the heat up · let go to ease off · keep it in the band' : '<kbd>Hold</kbd> click / <kbd>Space</kbd> to turn the heat up · let go to ease off'; }

  begin() {
    this.B = this.win(BAND[0], BAND[1], 0.05, 1);
    this.limit = 15;
    const f = this.cook.food;
    const c = this.cook.contents;
    const dish = DISHES[this.opts.dish];
    const glow = dish?.buff === 'glow' || dish?.buff === 'sense';
    const color = f.where === 'bowl' && f.egg ? mixHex(0xf0e8d0, f.liquid, 0.4) : f.liquid;
    c.liquid('pot', color, glow);
    if (f.chunks.length) c.chunks('pot', f.chunks, 16);
    this.liquidColor = color;
    this.slot = c.slot('pot');
    this.slot.g.position.y = VESSEL.pot.surface;
    this.center = this.P.pot.getWorldPosition(new THREE.Vector3());
    this.surfaceY = this.center.y + VESSEL.pot.surface;
    if (this.cook.leftovers.length) { this.cook.useLeftovers(this.center.clone().setY(this.surfaceY)); this.splashAt = 0.5; }
    f.where = 'pot';
    this.heat = 0.3; this.temp = 0.18; this.foam = 0; this.cooked = 0; this.inBand = 0; this.live2 = 0;
    this.spills = 0; this.need = 5.2; this.bubbleT = 0; this.finishT = -1; this.gauge = null;
    this.gust = 0; this.gustT = 3 + Math.random() * 2;
    this.knobPos = V3(this.k.burners[0].x, STOVE.top + 0.16, WALL_Z + 0.16);
    this.k.setBurner(0, this.heat);
    this.cook.loop('boil', true, 0.15);
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.gauge) this.gauge = this.ui.gauge({ top: 'Boil!', label: 'Heat', zone: this.B });
    const inp = this.input;
    const hold = live && this.finishT < 0 && (inp.mouseDown(0) || inp.isDown('Space') || inp.isDown('ArrowUp') || inp.isDown('KeyW'));
    if (this.splashAt !== undefined && this.t > this.splashAt) {
      delete this.splashAt;
      this.audio.play('bloop');
      droplets(this.fx, this.center.clone().setY(this.surfaceY + 0.02), this.liquidColor, 10, this.surfaceY - 0.05, 0.8);
    }
    // the knob and the flame
    if (live && this.finishT < 0) this.heat = clamp(this.heat + (hold ? 0.75 : -0.5) * dt, 0.05, 1);
    if (hold && !this.wasHold) this.audio.play('click', { vol: 0.4 });
    this.wasHold = hold;
    this.k.setBurner(0, this.heat);
    // the pot follows the flame slowly; now and then a cold splash or a hot spot nudges it
    if (live) {
      this.gustT -= dt;
      if (this.gustT <= 0) { this.gustT = 2.5 + Math.random() * 2.5; this.gust = (Math.random() < 0.5 ? -1 : 1) * (0.1 + Math.random() * 0.08); }
    }
    this.gust = damp(this.gust, 0, 1.2, dt);
    this.temp = damp(this.temp, this.heat * 1.08 + this.gust, 1.25, dt);
    const T = this.temp;
    const ok = T >= this.B[0] && T <= this.B[1];
    if (live && this.finishT < 0) {
      this.live2 += dt;
      if (ok) { this.cooked += dt / this.need; this.inBand += dt; }
      else if (T > this.B[1]) this.cooked += dt / this.need * 0.55;
      else if (T > 0.3) this.cooked += dt / this.need * 0.25;
      // foam climbs when it's too hot
      if (T > 0.82) this.foam += (T - 0.82) * dt * 3.2;
      else this.foam = Math.max(0, this.foam - dt * 0.45);
      if (this.foam >= 1) this.boilOver();
      if (ok && !this.wasOk) this.audio.tone({ f: 660, f2: 880, type: 'sine', dur: 0.08, vol: 0.05 });
      this.wasOk = ok;
      if (this.cooked >= 1) {
        this.finishT = 0;
        this.audio.play('ding');
        sparkle(this.fx, this.center.clone().setY(this.surfaceY + 0.1), 12);
        this.float(this.spills ? 'Cooked through' : 'Lovely simmer!', this.center.clone().setY(this.surfaceY + 0.25), '#9af07a');
      }
    }
    if (this.finishT >= 0) {
      this.finishT += dt;
      this.heat = Math.max(0.15, this.heat - dt * 0.8);
      if (this.finishT > 0.5) this.finish(this.total());
    }
    // pot life: bubbles, steam, foam and a rattle when it's roaring
    this.cook.loop('boil', true, 0.08 + T * 0.55);
    this.slot.g.position.y = VESSEL.pot.surface + this.foam * 0.05 + Math.sin(this.t * 14) * 0.003 * T;
    if (this.slot.liquid) this.slot.liquid.material.color.setRGB(1 + this.foam * 0.25, 1 + this.foam * 0.25, 1 + this.foam * 0.25);
    this.bubbleT -= dt;
    if (this.bubbleT <= 0 && T > 0.25) {
      this.bubbleT = Math.max(0.025, 0.28 - T * 0.25);
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * VESSEL.pot.r * 0.85;
      const big = T > 0.75;
      this.fx.emit({ pos: [this.center.x + Math.cos(a) * d, this.surfaceY + 0.008 + this.foam * 0.05, this.center.z + Math.sin(a) * d], vel: [0, 0.03, 0], color: big ? 0xffffff : 0xfff8f0, size: big ? 0.02 : 0.012, life: big ? 0.4 : 0.28, grow: 1.6, alpha: 0.9, fade: 0.25 });
      if (Math.random() < 0.25 * T) this.audio.play('bubble', { vol: 0.25 + T * 0.3 });
      if (T > 0.35) steam(this.fx, this.center.clone().setY(this.surfaceY + 0.03), VESSEL.pot.r * 0.7);
    }
    if (T > 0.86) this.P.pot.rotation.z = Math.sin(this.t * 40) * 0.01 * (T - 0.86) * 6;
    else this.P.pot.rotation.z = 0;
    if (this.gauge) this.gauge.set(T, T > this.B[1] + 0.12 ? '#ff9a8a' : ok ? '#9af07a' : T > this.B[1] ? '#ffd27a' : '#9fdcff');
    if (this.gauge) this.gauge.mark(this.heat);
    // paws: right on the heat knob (it turns), left steadying the pot handle
    const kp = this.knobPos;
    this.R.speed = 22;
    this.R.goal.set(kp.x + 0.12, kp.y + 0.06, kp.z + 0.12);
    this.R.setPose({ pitch: 0.2 + this.heat * 0.2, roll: 0.3 + this.heat * 0.8, yaw: 0.9 });
    const c = this.center;
    this.L.goal.set(c.x - 0.46, this.surfaceY + 0.06, c.z + 0.08);
    this.L.setPose({ pitch: 0.55, roll: 0.3, yaw: 0.55 });
  }

  boilOver() {
    this.spills++;
    this.foam = 0.25;
    this.audio.play('hiss');
    this.audio.play('splash', { vol: 0.6 });
    this.cook.shake(0.008);
    const c = this.center;
    droplets(this.fx, c.clone().setY(this.surfaceY + 0.06), 0xfff8f0, 16, c.y - 0.02, 1.3);
    for (let i = 0; i < 8; i++) smoke(this.fx, c.clone().add(V3((Math.random() - 0.5) * 0.4, 0.05, (Math.random() - 0.5) * 0.3)), 0.2);
    this.float('Boiled over!', c.clone().setY(this.surfaceY + 0.3), '#ff9a8a');
  }

  total() {
    const frac = this.inBand / Math.max(1, this.live2);
    return 45 + frac * 58 - this.spills * 16 - (this.cooked < 1 ? (1 - this.cooked) * 60 : 0);
  }

  timeout() { this.finish(this.total()); }

  end() {
    this.P.pot.rotation.z = 0;
    if (this.slot.liquid) this.slot.liquid.material.color.setRGB(1, 1, 1);
    this.k.setBurner(0, 0.35);
    super.end();
  }
}
