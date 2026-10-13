// KNEAD: alternate paws in rhythm. Notes scroll toward the marker; press the matching paw
// (left / right mouse button, or A / D) on the beat. The dough squishes flatter as you go.
import { Step, V3, THREE } from './base.js';
import { dough as doughModel } from '../models.js';
import { flourTex } from '../tex.js';
import { puff } from '../fx.js';
import { BOARD_TOP } from '../kitchen.js';
import { mixHex } from '../../core/util.js';

const BEAT = 0.5;
const COUNT = 12;
const WINDOW = 0.26;

export class KneadStep extends Step {
  get station() { return 'board'; }
  get title() { return 'KNEAD!'; }
  get hint() { return 'On the beat: <kbd>Left click</kbd>/<kbd>A</kbd> and <kbd>Right click</kbd>/<kbd>D</kbd>, alternating'; }

  begin() {
    const S = this.S;
    const color = mixHex(0xf2e4c4, this.cook.food.liquid, 0.22);
    this.group = this.temp(new THREE.Group());
    this.group.position.set(S.x, BOARD_TOP, S.z - 0.02);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.75), new THREE.MeshBasicMaterial({ map: flourTex(), transparent: true, alphaTest: 0.5, depthWrite: false }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.y = 0.002;
    this.group.add(fl);
    this.dough = doughModel(color);
    this.dough.scale.setScalar(1.2);
    this.group.add(this.dough);
    this.notes = [];
    for (let i = 0; i < COUNT; i++) this.notes.push({ t: 1.0 + i * BEAT, side: i % 2 ? 'R' : 'L', hit: false, res: null });
    this.flat = 0;
    this.squash = 0;
    this.press = { L: 0, R: 0 };
    this.tickI = 0;
    this.finishT = -1;
    this.lane = null;
    this.color = color;
    this.cook.food.dough = true;
    this.cook.food.where = 'board';
    puff(this.fx, this.group.position.clone().add(V3(0, 0.05, 0)), 0xfffaf0, 14, 0.4);
  }

  judge(side) {
    const now = this.live;
    let best = null, bd = 1e9;
    for (const n of this.notes) {
      if (n.hit) continue;
      const d = Math.abs(n.t - now);
      if (d < bd) { bd = d; best = n; }
    }
    this.squish(side);
    if (!best || bd > WINDOW) return;
    best.hit = true;
    const at = this.dough.getWorldPosition(new THREE.Vector3()).add(V3(side === 'L' ? -0.18 : 0.18, 0.35, 0));
    if (best.side !== side) { best.res = 'miss'; best.score = 0; this.float('Wrong paw!', at, '#ff9a8a'); return; }
    const s = bd < 0.075 ? 100 : bd < 0.15 ? 75 : 45;
    best.res = s === 100 ? 'perfect' : 'ok';
    best.score = s;
    this.float(s === 100 ? 'Perfect!' : s === 75 ? 'Good' : 'Late', at, s === 100 ? '#ffe066' : s === 75 ? '#9af07a' : '#9fdcff');
    this.lane?.flash();
  }

  squish(side) {
    this.press[side] = 1;
    this.squash = 1;
    this.flat = Math.min(1, this.flat + 0.06);
    this.audio.tone({ f: 170, f2: 110, type: 'triangle', dur: 0.09, vol: 0.12 });
    this.audio.noise({ color: 'pink', filter: 'lowpass', f: 700, dur: 0.07, vol: 0.08 });
    const at = this.dough.getWorldPosition(new THREE.Vector3()).add(V3(side === 'L' ? -0.15 : 0.15, 0.05, 0.05));
    puff(this.fx, at, 0xfffaf0, 5, 0.12);
  }

  tick(dt, live) {
    if (this.t > 0.4 && !this.lane) this.lane = this.ui.lane();
    const inp = this.input;
    const now = this.live;
    if (live && this.finishT < 0) {
      const touch = this.cook.lastPointer === 'touch';
      const half = inp.mouse.x > (this.cook.game.canvas.clientWidth || 0) / 2;
      if (inp.mousePressed(0) && touch) this.judge(half ? 'R' : 'L');
      else if (inp.mousePressed(0) || inp.pressed('KeyA', 'ArrowLeft')) this.judge('L');
      if (inp.mousePressed(2) || inp.pressed('KeyD', 'ArrowRight')) this.judge('R');
      // metronome tick on every beat
      while (this.tickI < this.notes.length && now >= this.notes[this.tickI].t) {
        this.audio.tone({ f: this.tickI % 2 ? 900 : 1200, type: 'sine', dur: 0.03, vol: 0.05 });
        this.tickI++;
      }
      for (const n of this.notes) {
        if (!n.hit && now - n.t > WINDOW) { n.hit = true; n.res = 'miss'; n.score = 0; this.float('Miss', this.dough.getWorldPosition(new THREE.Vector3()).add(V3(n.side === 'L' ? -0.2 : 0.2, 0.3, 0)), '#ff9a8a'); }
      }
      if (this.notes.every((n) => n.hit)) {
        this.finishT = 0;
        this.audio.play('ding');
      }
    }
    if (this.lane) this.lane.draw(this.notes, now, 1 / 2.4);
    if (this.finishT >= 0) {
      this.finishT += dt;
      if (this.finishT > 0.5) this.finish(this.notes.reduce((s, n) => s + (n.score || 0), 0) / this.notes.length);
    }
    // squishy dough
    this.squash = Math.max(0, this.squash - dt * 5);
    const sq = Math.sin(this.squash * Math.PI) * 0.25;
    const base = 1.2 * (1 - this.flat * 0.32);
    this.dough.scale.set(1.2 * (1 + this.flat * 0.2) * (1 + sq * 0.5), base * (1 - sq), 1.2 * (1 + this.flat * 0.15) * (1 + sq * 0.4));
    // paws rest beside the dough and squash it from the sides/top on a press
    const top = BOARD_TOP + 0.3 * this.dough.scale.y;
    for (const p of [this.L, this.R]) {
      const k = p.side < 0 ? 'L' : 'R';
      this.press[k] = Math.max(0, this.press[k] - dt * 5);
      const dip = Math.sin(this.press[k] * Math.PI);
      const c = this.group.position;
      p.speed = 26;
      p.goal.set(c.x + p.side * (0.44 - dip * 0.22), BOARD_TOP + 0.17 + dip * (top - BOARD_TOP - 0.12), c.z + 0.1);
      p.setPose({ pitch: 0.45 + dip * 0.5, roll: 0.3, yaw: 0.8 - dip * 0.35 });
    }
  }

  end() {
    this.L.speed = 14;
    this.R.speed = 14;
    // the kneaded dough waits at the back of the board
    this.objs = this.objs.filter((o) => o !== this.group);
    this.cook.leftover(this.group);
    super.end();
  }

  timeout() {}
}

