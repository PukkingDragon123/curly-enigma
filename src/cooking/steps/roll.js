// ROLL: roll the dough out even. Drag up and down to roll the pin back and forth; where the mouse is
// left or right leans your weight on that end of the pin. The dough starts lumpy: lean into the thick
// side until every strip sits in the band. Roll a strip too thin and it tears.
import { Step, V3, THREE } from './base.js';
import { flourTex } from '../tex.js';
import { puff, sparkle } from '../fx.js';
import { BOARD_TOP } from '../kitchen.js';
import { setOutline } from '../../gfx/Voxel.js';
import { PixelCanvas, pixelTexture } from '../../gfx/PixelArt.js';
import { clamp, damp, mixHex, el } from '../../core/util.js';

const N = 7;

/** A little pixel texture of floury dough (lighter flecks, darker pocks). */
function doughTex(c) {
  const pc = new PixelCanvas(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const h = ((x * 73 + y * 151) % 97) / 97;
    pc.set(x, y, h < 0.12 ? mixHex(c, 0xffffff, 0.45) : h > 0.9 ? mixHex(c, 0x8a6a40, 0.25) : h > 0.6 ? mixHex(c, 0xffffff, 0.12) : c);
  }
  pc.commit();
  const t = pixelTexture(pc.canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const BAND = [0.34, 0.5];
const HALF = 0.34; // half width of the dough sheet (m)

export class RollStep extends Step {
  get station() { return 'board'; }
  get title() { return 'ROLL!'; }
  get hint() { return this.cook.lastPointer === 'touch' ? '<b>Drag</b> up & down to roll · drag left/right to lean on the thick side' : 'Move the mouse <kbd>up & down</kbd> to roll · left/right leans on that side (<kbd>W</kbd>/<kbd>S</kbd> + <kbd>A</kbd>/<kbd>D</kbd>)'; }

  begin() {
    this.B = this.win(BAND[0], BAND[1], 0.05, 1);
    this.limit = 14;
    const S = this.S;
    this.base = V3(S.x, BOARD_TOP, S.z - 0.02);
    const color = mixHex(0xf2e4c4, this.cook.food.liquid, 0.18);
    this.color = color;
    // a dusting of flour, then the dough as strips (each its own thickness)
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.75), new THREE.MeshBasicMaterial({ map: flourTex(), transparent: true, alphaTest: 0.5, depthWrite: false }));
    fl.rotation.x = -Math.PI / 2;
    fl.position.copy(this.base).setY(BOARD_TOP + 0.002);
    this.temp(fl);
    this.group = this.temp(new THREE.Group());
    this.group.position.copy(this.base);
    this.mat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: doughTex(color) });
    this.th = [];
    const lumpSide = Math.random() < 0.5 ? -1 : 1;
    this.strips = [];
    for (let i = 0; i < N; i++) {
      const u = (i / (N - 1)) * 2 - 1;
      this.th.push(clamp(0.82 + u * lumpSide * 0.22 + (Math.random() - 0.5) * 0.12, 0.6, 1.1));
      const m = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2 / N + 0.002, 1, 1), this.mat);
      setOutline(m, true);
      m.position.x = u * (HALF - HALF / N);
      this.group.add(m);
      this.strips.push(m);
    }
    this.pin = this.borrow('pin');
    this.pz = 0; // pin offset along z (rolling back and forth)
    this.lean = 0;
    this.tears = 0;
    this.torn = new Array(N).fill(false);
    this.lastY = null;
    this.rollSfx = 0;
    this.finishT = -1;
    this.okT = 0;
    this.widget = null;
    this.cook.food.dough = true;
    this.cook.food.where = 'board';
    if (this.cook.leftovers.length) this.cook.useLeftovers(this.base.clone().setY(BOARD_TOP + 0.05));
    puff(this.fx, this.base.clone().setY(BOARD_TOP + 0.05), 0xfffaf0, 12, 0.35);
  }

  ensureWidget() {
    if (this.widget) return;
    const bars = [];
    const row = el('div', { class: 'ck-rollbars' });
    for (let i = 0; i < N; i++) {
      const fill = el('i');
      const b = el('span', {}, [el('b', { style: { bottom: `${this.B[0] / 1.1 * 100}%`, height: `${(this.B[1] - this.B[0]) / 1.1 * 100}%` } }), fill]);
      row.append(b);
      bars.push({ b, fill });
    }
    const wrap = el('div', { class: 'ck-roll' }, [el('div', { class: 'lbl' }, 'Thickness'), row,
      el('button', { class: 'btn', onclick: () => this.stop() }, 'Done')]);
    this.ui.addWidget(wrap);
    this.widget = { wrap, bars };
  }

  stop() {
    if (this.finishT >= 0 || !this.liveOk) return;
    this.finishT = 0;
    const s = this.total();
    this.final = s;
    const at = this.base.clone().setY(BOARD_TOP + 0.25);
    this.float(s >= 85 ? 'Smooth as silk!' : s >= 55 ? 'Nice and flat' : 'Lumpy...', at, s >= 85 ? '#ffe066' : s >= 55 ? '#9af07a' : '#9fdcff');
    if (s >= 85) { sparkle(this.fx, at, 12); this.audio.play('ding'); }
  }

  total() {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const t = this.th[i];
      if (t >= this.B[0] && t <= this.B[1]) sum += 100;
      else if (t > this.B[1]) sum += clamp(100 - (t - this.B[1]) * 210, 0, 95);
      else sum += clamp(90 - (this.B[0] - t) * 300, 0, 90);
    }
    return sum / N - this.tears * 12;
  }

  tick(dt, live) {
    if (this.t > 0.45) this.ensureWidget();
    this.liveOk = live;
    const inp = this.input;
    let travel = 0;
    if (live && this.finishT < 0) {
      if (inp.pressed('Space', 'Enter')) this.stop();
      const m = inp.mouse;
      // lean from the mouse's x across the board (or A/D)
      const keyLean = (inp.isDown('KeyA', 'ArrowLeft') ? -1 : 0) + (inp.isDown('KeyD', 'ArrowRight') ? 1 : 0);
      const p = this.mouseAt(BOARD_TOP + 0.05);
      const want = keyLean ? keyLean : p ? clamp((p.x - this.base.x) / (HALF * 1.1), -1, 1) : 0;
      this.lean = damp(this.lean, want, 10, dt);
      if (this.lastY !== null) travel = Math.abs(m.y - this.lastY) * 0.004;
      this.pz = clamp(this.pz + (this.lastY !== null ? (m.y - this.lastY) * 0.0016 : 0), -0.16, 0.16);
      this.lastY = m.y;
      if (inp.pressed('KeyW', 'ArrowUp', 'KeyS', 'ArrowDown')) { this.kRoll = 0.25; this.kDir = inp.pressed('KeyW', 'ArrowUp') ? -1 : 1; }
      if (this.kRoll > 0) { this.kRoll -= dt; travel += dt * 0.7; this.pz = clamp(this.pz + this.kDir * dt * 1.2, -0.16, 0.16); }
      if (travel > 0) {
        for (let i = 0; i < N; i++) {
          const u = (i / (N - 1)) * 2 - 1;
          const w = clamp(1 + this.lean * u * 1.8, 0.08, 2.4);
          const before = this.th[i];
          this.th[i] = Math.max(0.12, this.th[i] - travel * w * 0.28 * Math.sqrt(this.th[i]));
          if (before >= 0.25 && this.th[i] < 0.25 && !this.torn[i]) {
            this.torn[i] = true; this.tears++;
            this.audio.noise({ color: 'pink', filter: 'lowpass', f: 900, dur: 0.15, vol: 0.15 });
            this.float('Torn!', this.strips[i].getWorldPosition(new THREE.Vector3()).add(V3(0, 0.2, 0)), '#ff9a8a');
            puff(this.fx, this.strips[i].getWorldPosition(new THREE.Vector3()), 0xfffaf0, 6, 0.08);
          }
        }
        this.rollSfx -= dt;
        if (this.rollSfx <= 0) { this.rollSfx = 0.12; this.audio.noise({ color: 'brown', filter: 'lowpass', f: 300, dur: 0.14, vol: 0.06 + Math.min(0.08, travel * 2) }); }
        if (Math.random() < travel * 30) this.fx.emit({ pos: [this.base.x + (Math.random() - 0.5) * 0.7, BOARD_TOP + 0.03, this.base.z + this.pz], vel: [(Math.random() - 0.5) * 0.3, 0.3, 0.1], color: 0xfffaf0, size: 0.016, life: 0.6, gravity: 1, fade: 0.5 });
      }
      // all strips at least down into the band: done by itself
      if (this.th.every((t) => t <= this.B[1])) { this.okT += dt; if (this.okT > 0.35) this.stop(); } else this.okT = 0;
    }
    if (this.finishT >= 0) { this.finishT += dt; if (this.finishT > 0.45) this.finish(this.final); }
    // the sheet: thinner strips spread longer
    for (let i = 0; i < N; i++) {
      const t = this.th[i], m = this.strips[i];
      const h = 0.012 + t * 0.07, d = 0.24 + (1.1 - t) * 0.42;
      m.scale.set(1, h, d);
      m.position.y = h / 2;
    }
    if (this.widget) this.widget.bars.forEach((b, i) => { const t = this.th[i]; b.fill.style.height = `${clamp(t / 1.1, 0, 1) * 100}%`; b.fill.style.background = t > this.B[1] ? '#f3e2bf' : t >= this.B[0] ? '#9af07a' : '#ff9a8a'; });
    // the pin rolls across the sheet, tilting with your weight
    const top = BOARD_TOP + Math.max(...this.th) * 0.07 + 0.045;
    this.pin.position.set(this.base.x, top, this.base.z + this.pz);
    this.pin.rotation.set(this.pz * 30, 0, -this.lean * 0.08);
    // paws on the handles, one pressing harder
    for (const p of [this.L, this.R]) {
      const press = Math.max(0, this.lean * p.side) * 0.03;
      p.speed = 26;
      p.goal.set(this.base.x + p.side * 0.5, top + 0.04 - press, this.base.z + this.pz + 0.04);
      p.setPose({ pitch: 0.6 + press * 8, roll: 0.3, yaw: 0.9 });
    }
  }

  timeout() { this.liveOk = true; this.stop(); if (this.finishT < 0) this.finish(this.total()); }

  end() {
    this.L.speed = 14; this.R.speed = 14;
    this.objs = this.objs.filter((o) => o !== this.group);
    this.cook.leftover(this.group);
    this.cook.own?.(() => { this.mat.map?.dispose(); this.mat.dispose(); });
    super.end();
  }
}
