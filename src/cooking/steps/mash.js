// MASH: lumps bob in the pot (or bowl). Aim the masher over a lump and press it down (click, Space or
// tap): each lump takes a couple of good presses. Steady presses work; hammering wildly splatters.
import { Step, V3, THREE } from './base.js';
import { masher as masherModel } from '../models.js';
import { chunkMesh, mainColor } from '../food.js';
import { VESSEL } from '../vessels.js';
import { droplets, sparkle } from '../fx.js';
import { clamp, damp, mixHex, shade } from '../../core/util.js';

export class MashStep extends Step {
  get station() { return this.vessel; }
  get title() { return 'MASH!'; }
  get hint() { return this.cook.lastPointer === 'touch' ? '<b>Tap</b> the lumps to mash them · steady, not frantic' : 'Aim at a lump and <kbd>Click</kbd> / <kbd>Space</kbd> to mash · steady, not frantic'; }

  constructor(cook, opts) {
    super(cook, opts);
    const w = cook.food.where;
    this.vessel = w === 'pot' ? 'pot' : 'bowl';
  }

  begin() {
    this.limit = 11;
    const V = VESSEL[this.vessel];
    const prop = this.P[this.vessel];
    const c = this.cook.contents;
    const f = this.cook.food;
    const item = (this.cook.ings || []).find((id) => id !== 'honey' && id !== 'butter' && id !== 'salt_crystal') || 'tunnel_tuber';
    this.color = f.chunks.length ? f.chunks[f.chunks.length - 1] : mainColor(item);
    const liquid = mixHex(this.color, f.liquid, 0.45);
    c.liquid(this.vessel, liquid);
    this.slot = c.slot(this.vessel);
    this.slot.g.position.y = V.surface;
    if (this.slot.chunks) this.slot.chunks.visible = false;
    this.liquidColor = liquid;
    this.center = prop.getWorldPosition(new THREE.Vector3());
    this.surfaceY = this.center.y + V.surface;
    this.r = V.r * 0.72;
    if (this.cook.leftovers.length) this.cook.useLeftovers(this.center.clone().setY(this.surfaceY));
    f.where = this.vessel;
    // the lumps
    this.lumps = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = (0.3 + Math.random() * 0.6) * this.r;
      const m = this.temp(chunkMesh([this.color, mixHex(this.color, 0xffffff, 0.2), shade(this.color, 0.8)], 3, 1.2, i + 3, 0.03));
      const lump = { m, x: this.center.x + Math.cos(a) * d, z: this.center.z + Math.sin(a) * d, hp: 2, s: 1, ph: Math.random() * 6 };
      m.position.set(lump.x, this.surfaceY, lump.z);
      this.lumps.push(lump);
    }
    this.tool = this.temp(masherModel());
    this.tool.scale.setScalar(0.48);
    this.aim = this.center.clone().setY(this.surfaceY);
    this.press = -1;
    this.lastPress = -9;
    this.splats = 0; this.hits = 0;
    this.finishT = -1;
    this.gauge = null;
    if (this.vessel === 'pot') { this.k.setBurner(0, 0.3); }
  }

  mash() {
    if (this.press >= 0 || this.finishT >= 0) return;
    const now = this.live;
    const frantic = now - this.lastPress < 0.16;
    this.lastPress = now;
    this.press = 0;
    this.frantic = frantic;
  }

  impact() {
    const at = this.aim.clone();
    this.audio.play('bloop', { pitch: 0.7 + Math.random() * 0.2 });
    this.audio.noise({ color: 'pink', filter: 'lowpass', f: 500, dur: 0.1, vol: 0.12 });
    this.cook.shake(0.004);
    if (this.frantic) {
      this.splats++;
      droplets(this.fx, at.clone().setY(this.surfaceY + 0.03), this.liquidColor, 12, this.surfaceY - 0.1, 1.2);
      this.float('Splat! Easy...', at.clone().add(V3(0, 0.2, 0)), '#ff9a8a');
      return;
    }
    let hit = null, bd = 0.09 * this.skill;
    for (const l of this.lumps) {
      if (l.hp <= 0) continue;
      const d = Math.hypot(l.x - at.x, l.z - at.z);
      if (d < bd) { bd = d; hit = l; }
    }
    droplets(this.fx, at.clone().setY(this.surfaceY + 0.02), this.liquidColor, hit ? 5 : 3, this.surfaceY - 0.05, 0.5);
    if (!hit) return;
    hit.hp--;
    this.hits++;
    hit.s = hit.hp > 0 ? 0.6 : 0;
    if (hit.hp <= 0) {
      this.audio.play('squeak', { vol: 0.25, pitch: 0.6 });
      this.float(['Squish!', 'Smooth!', 'Mashed!'][this.hits % 3], at.clone().add(V3(0, 0.18, 0)), '#9af07a');
      if (this.lumps.every((l) => l.hp <= 0)) {
        this.finishT = 0;
        this.audio.play('ding');
        sparkle(this.fx, this.center.clone().setY(this.surfaceY + 0.1), 12);
      }
    }
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.gauge) this.gauge = this.ui.gauge({ top: 'Smooth', label: 'Mash' });
    const inp = this.input;
    if (live && this.finishT < 0) {
      const m = this.mouseAt(this.surfaceY);
      const keys = [(inp.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (inp.isDown('KeyA', 'ArrowLeft') ? 1 : 0), (inp.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (inp.isDown('KeyW', 'ArrowUp') ? 1 : 0)];
      if (keys[0] || keys[1]) { this.aim.x += keys[0] * dt * 0.6; this.aim.z += keys[1] * dt * 0.6; this.keyMode = true; }
      else if (m && !this.keyMode) { this.aim.x = damp(this.aim.x, m.x, 18, dt); this.aim.z = damp(this.aim.z, m.z, 18, dt); }
      if (m && this.lastM && Math.hypot(m.x - this.lastM.x, m.z - this.lastM.z) > 0.01) this.keyMode = false;
      this.lastM = m ? m.clone() : null;
      const dx = this.aim.x - this.center.x, dz = this.aim.z - this.center.z, d = Math.hypot(dx, dz);
      if (d > this.r) { this.aim.x = this.center.x + dx / d * this.r; this.aim.z = this.center.z + dz / d * this.r; }
      if (inp.mousePressed(0) || inp.pressed('Space', 'Enter')) this.mash();
    }
    // the plunge
    let lift = 0.14;
    if (this.press >= 0) {
      this.press += dt;
      const p = this.press;
      if (p < 0.08) lift = 0.14 * (1 - p / 0.08);
      else if (p < 0.14) { lift = 0; if (!this.hitDone) { this.hitDone = true; this.impact(); } }
      else if (p < 0.3) lift = 0.14 * ((p - 0.14) / 0.16);
      else { this.press = -1; this.hitDone = false; }
    }
    this.tool.position.set(this.aim.x, this.surfaceY - 0.01 + lift, this.aim.z);
    this.tool.rotation.set(0.15, 0.3, 0);
    // lumps bob and flatten
    let left = 0;
    for (const l of this.lumps) {
      l.s = damp(l.s, l.hp > 0 ? 1 - (2 - l.hp) * 0.3 : 0, 6, dt);
      l.m.visible = l.s > 0.05;
      l.m.scale.set(1 + (1 - l.s) * 0.6, Math.max(0.05, l.s), 1 + (1 - l.s) * 0.6);
      l.m.position.set(l.x, this.surfaceY + Math.sin(this.t * 2 + l.ph) * 0.004, l.z);
      if (l.hp > 0) left += l.hp;
    }
    const total = this.lumps.length * 2;
    if (this.gauge) this.gauge.set(1 - left / total, '#9af07a');
    if (this.finishT >= 0) { this.finishT += dt; if (this.finishT > 0.45) this.finish(this.total()); }
    // paws: right on the masher handle, left steadying the vessel
    const top = this.tool.position;
    this.R.speed = 30;
    this.R.goal.set(top.x + 0.06, top.y + 0.3, top.z + 0.1);
    this.R.setPose({ pitch: 0.8, roll: 0.35, yaw: 0.8 });
    const lr = this.vessel === 'pot' ? 0.46 : 0.42;
    this.L.goal.set(this.center.x - lr, this.surfaceY + 0.05, this.center.z + 0.08);
    this.L.setPose({ pitch: 0.55, roll: 0.3, yaw: 0.55 });
  }

  total() {
    const done = this.lumps.filter((l) => l.hp <= 0).length / this.lumps.length;
    return done * 100 - this.splats * 9 + (done >= 1 ? 4 : 0);
  }

  timeout() { this.finish(this.total()); }

  end() {
    if (this.slot.chunks) this.slot.chunks.visible = true;
    if (this.vessel === 'pot') this.k.setBurner(0, 0);
    this.R.speed = 14;
    super.end();
  }
}

export { clamp };
