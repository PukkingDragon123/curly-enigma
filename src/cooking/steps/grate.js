// GRATE: the box grater stands on the board, the ingredient in your paw. Stroke it down the teeth
// (drag up and down, or tap ↓/S); each good stroke adds shavings to the pile. Stop (Space / Done)
// with the pile in the band. The ingredient shrinks as you go: keep grating a stub and you scrape
// your knuckles. Wild strokes fling the shavings off the board.
import { Step, V3, THREE } from './base.js';
import { spriteCells, standeeMesh, mainColor, chunkMesh } from '../food.js';
import { crumbs, sparkle } from '../fx.js';
import { BOARD_TOP } from '../kitchen.js';
import { clamp, damp, mixHex, shade } from '../../core/util.js';

export class GrateStep extends Step {
  get station() { return 'board'; }
  get title() { return 'GRATE!'; }
  get hint() { return this.touch ? '<b>Drag</b> up and down to grate · stop in the band · mind your knuckles!' : 'Move the mouse <kbd>up & down</kbd> (or tap <kbd>S</kbd>) to grate · <kbd>Space</kbd> to stop · mind your knuckles!'; }

  begin() {
    this.limit = 12;
    const S = this.S;
    this.item = this.opts.item || 'cave_carrot';
    this.color = mainColor(this.item);
    this.grater = this.borrow('grater');
    this.grater.position.set(S.x + 0.12, BOARD_TOP, S.z - 0.08);
    this.grater.rotation.set(0, 0, 0);
    this.face = V3(S.x + 0.12, BOARD_TOP, S.z - 0.08 + this.grater.userData.depth / 2 + 0.01); // the toothed front face
    this.top = BOARD_TOP + this.grater.userData.height;
    // the thing being grated, held upright against the face
    this.piece = this.temp(standeeMesh(this.item, { px: 0.013 }));
    this.size = 1;
    // a pile of shavings growing in front (a heap of tiny voxels drawn as a squashed sphere)
    const c = this.color;
    this.pile = this.temp(new THREE.Group());
    for (let i = 0; i < 3; i++) {
      const layer = chunkMesh([mixHex(c, 0xffffff, 0.2), c, shade(c, 0.8)], 10 - i * 3, 3.2 - i * 0.9, 7 + i, 0.022);
      layer.position.y = i * 0.025;
      this.pile.add(layer);
    }
    this.pile.position.set(S.x + 0.12, BOARD_TOP, S.z + 0.18);
    this.pile.scale.setScalar(0.001);
    const mid = 0.62 + (Math.random() - 0.5) * 0.1;
    this.zone = this.win(mid - 0.08, mid + 0.08, 0.1, 0.97);
    this.amount = 0; this.wasted = 0; this.scrapes = 0;
    this.y = this.top - 0.05; // where the paw is on the grater (world y)
    this.lastY = null; this.dir = 0; this.travel = 0; this.strokeV = 0;
    this.finishT = -1;
    this.gauge = null;
    this.cook.food.where = 'board';
  }

  ensureGauge() {
    if (this.gauge) return;
    this.gauge = this.ui.gauge({ top: 'Too much', label: 'Pile', zone: this.zone, button: { text: 'Done', onClick: () => this.stop() } });
  }

  stroke(power) {
    if (this.finishT >= 0) return;
    const fast = this.strokeV > 2600;
    this.audio.noise({ color: 'white', filter: 'bandpass', f: 2600 + Math.random() * 900, q: 1.2, dur: 0.12, vol: 0.09 });
    this.audio.tone({ f: 900, f2: 600, type: 'sawtooth', dur: 0.06, vol: 0.02, filter: 'highpass', ff: 1200 });
    const at = this.face.clone().setY(this.y - 0.1);
    if (this.size < 0.2) {
      // grating a stub: knuckles!
      this.scrapes++;
      this.audio.play('hurt', { vol: 0.4 });
      this.cook.shake(0.008);
      this.float('Ow, knuckles!', at.clone().add(V3(0, 0.2, 0.1)), '#ff9a8a');
      for (let i = 0; i < 5; i++) this.fx.emit({ pos: [at.x, at.y, at.z + 0.05], vel: [(Math.random() - 0.5) * 0.6, 0.4, 0.4], color: 0xd84a4a, size: 0.014, life: 0.4, gravity: 4, fade: 0.3 });
      if (this.scrapes >= 3) this.stop();
      return;
    }
    const add = (0.045 + Math.random() * 0.015) * power;
    if (fast) {
      this.wasted += add * 0.6;
      this.amount += add * 0.4;
      for (let i = 0; i < 10; i++) this.fx.emit({ pos: [at.x, at.y, at.z + 0.04], vel: [(Math.random() - 0.5) * 2, Math.random() * 1.2, 0.6 + Math.random()], color: this.color, size: 0.012, life: 0.7, gravity: 4, floor: 0, fade: 0.3 });
      if (Math.random() < 0.4) this.float('Too wild!', at.clone().add(V3(0.2, 0.15, 0.1)), '#ffb08a');
    } else {
      this.amount += add;
      crumbs(this.fx, at.clone().add(V3(0, -0.05, 0.05)), this.color, 6, BOARD_TOP);
    }
    this.size = Math.max(0.08, this.size - add * 0.85);
    if (this.amount >= 1) { this.amount = 1; this.float('Mountain of it!', this.pile.position.clone().add(V3(0, 0.3, 0)), '#ff9a8a'); this.stop(); }
  }

  stop() {
    if (this.finishT >= 0 || this.done || !this.liveOk) return;
    this.finishT = 0;
    const [lo, hi] = this.zone, a = this.amount, mid = (lo + hi) / 2;
    let s;
    if (a >= lo && a <= hi) s = 100 - (Math.abs(a - mid) / (hi - lo) * 2) * 14;
    else if (a < lo) s = clamp((a / lo) * 78 - 6, 0, 78);
    else s = clamp(78 - (a - hi) * 300, 0, 78);
    s -= this.wasted * 40 + this.scrapes * 12;
    this.final = s;
    const ok = a >= lo && a <= hi;
    this.float(ok ? 'Perfect pile!' : a < lo ? 'Need a bit more' : 'Too much!', this.pile.position.clone().add(V3(0, 0.3, 0)), ok ? '#ffe066' : '#9fdcff');
    if (ok) { this.audio.play('ding'); sparkle(this.fx, this.pile.position.clone().add(V3(0, 0.1, 0)), 10); }
  }

  tick(dt, live) {
    if (this.t > 0.5) this.ensureGauge();
    this.liveOk = live;
    const inp = this.input;
    if (live && this.finishT < 0) {
      if (inp.pressed('Space', 'Enter')) this.stop();
      if (inp.pressed('KeyS', 'ArrowDown')) { this.kStroke = 0.2; }
      // vertical strokes: the mouse drives the paw up and down the grater face
      const m = inp.mouse;
      if (this.lastY !== null) {
        const dy = m.y - this.lastY;
        this.strokeV = damp(this.strokeV, Math.abs(dy) / Math.max(dt, 1e-3), 10, dt);
        if (Math.abs(dy) > 0.5) {
          const dir = Math.sign(dy);
          if (dir !== this.dir) {
            if (this.dir > 0 && this.travel > 30) this.stroke(clamp(this.travel / 100, 0.7, 1.3)); // a downward stroke finished
            this.dir = dir; this.travel = 0;
          }
          this.travel += Math.abs(dy);
        }
        this.y = clamp(this.y - dy * 0.0011, BOARD_TOP + 0.06, this.top - 0.01);
      }
      this.lastY = m.y;
      if (this.kStroke > 0) {
        this.kStroke -= dt;
        this.y = BOARD_TOP + 0.06 + (this.top - BOARD_TOP - 0.08) * (this.kStroke / 0.2);
        if (this.kStroke <= 0) { this.strokeV = 800; this.stroke(1); this.y = this.top - 0.02; }
      }
    }
    if (this.gauge) {
      const [lo, hi] = this.zone;
      this.gauge.set(this.amount, this.amount > hi ? '#ff9a8a' : this.amount >= lo ? '#9af07a' : '#f3e2bf');
    }
    if (this.finishT >= 0) { this.finishT += dt; if (this.finishT > 0.45) this.finish(this.final); }
    // the piece rides the paw down the face, shrinking; the pile grows
    const k = this.size;
    this.piece.scale.setScalar(Math.max(0.15, k));
    this.piece.position.set(this.face.x - 0.02, this.y - 0.05 * k, this.face.z + 0.03);
    this.piece.rotation.set(-0.25, 0, 0.2);
    const pa = this.amount;
    this.pile.scale.set(0.35 + pa * 1.1, 0.2 + pa * 1.5, 0.35 + pa * 1.0);
    this.pile.children.forEach((l, i) => { l.visible = pa > i * 0.3; });
    // paws: right holds the piece, left steadies the grater's handle
    this.R.speed = 26;
    this.R.goal.set(this.face.x + 0.14, this.y + 0.04, this.face.z + 0.18);
    this.R.setPose({ pitch: 0.3, roll: 0.6, yaw: 1.1 });
    this.L.goal.set(this.grater.position.x - 0.3, this.top + 0.05, this.grater.position.z + 0.12);
    this.L.setPose({ pitch: 0.75, roll: 0.3, yaw: 0.8 });
  }

  timeout() { this.liveOk = true; this.stop(); if (this.finishT < 0) this.finish(0); }

  end() {
    // the shavings wait on the board for the next step
    this.cook.food.chunks.push(this.color);
    this.objs = this.objs.filter((o) => o !== this.pile);
    this.cook.leftover(this.pile);
    super.end();
  }
}

export { spriteCells, shade };
