// SKEWER: the pieces threaded on an iron skewer, held over the open burner. The side facing the
// flame browns; tap (click, Space or a finger) to give it a quarter turn. Every side golden and none
// charred: roasted. Leave one down too long and it blackens.
import { Step, V3, THREE } from './base.js';
import { skewerStick } from '../toolVox.js';
import { ingredientMesh } from '../ingVox.js';
import { chunkMesh, mainColor } from '../food.js';
import { smoke, sparkle } from '../fx.js';
import { voxelMaterial } from '../../gfx/Voxel.js';
import { clamp } from '../../core/util.js';

const SIDES = 4;
const RATE = 0.5; // doneness per second on the side facing the flame
const RAW = new THREE.Color(1.15, 1.12, 1.05), GOLD = new THREE.Color(1.0, 0.8, 0.55), BURNT = new THREE.Color(0.25, 0.17, 0.12);

export class SkewerStep extends Step {
  get station() { return 'pan'; }
  get title() { return 'ROAST!'; }
  get hint() { return this.touch ? 'Tap to turn' : 'Click to turn'; }

  begin() {
    this.limit = 14;
    const pan = this.borrow('pan');
    pan.visible = false; // off the burner: the skewer goes over the open flame
    const c = pan.getWorldPosition(new THREE.Vector3());
    this.fire = c;
    this.k.setBurner(1, 1);
    this.cook.loop('sizzle', true, 0.35);
    this.group = this.temp(new THREE.Group());
    this.group.position.set(c.x, c.y + 0.3, c.z + 0.04);
    this.roll = new THREE.Group(); // turns about the skewer (x axis)
    this.group.add(this.roll);
    const stick = skewerStick(64); stick.scale.set(1.25, 1.4, 1.4); this.roll.add(stick);
    // the pieces: whole little ingredients and hand-cut chunks, alternating along it
    const ings = (this.cook.ings || []).filter((id) => id !== 'salt_crystal');
    this.mats = [];
    for (let i = 0; i < 4; i++) {
      const id = ings[i % Math.max(1, ings.length)] || 'cave_carrot';
      const mat = voxelMaterial('toon', { unique: true });
      let m = i % 2 === 0 ? ingredientMesh(id, 0.22) : null;
      if (m) { m = m.clone(); m.material = m.material.clone(); m.material.userData = {}; m.position.y = -(m.userData.h || 0.1) / 2; this.mats.push(m.material); }
      else { m = chunkMesh([mainColor(id)], 3, 0.6, i + 2, 0.065); m.material = mat; this.mats.push(mat); }
      const holder = new THREE.Group();
      holder.position.x = -0.27 + i * 0.15;
      holder.add(m);
      this.roll.add(holder);
    }
    this.d = new Array(SIDES).fill(0);
    this.side = 0; // which side faces down
    this.turnT = 1; this.turnFrom = 0;
    this.burnt = 0;
    this.bar = null;
    this.finishT = -1;
    this.band = this.win(0.62, 0.9, 0, 1.25);
    this.smokeT = 0;
    this.cook.food.where = 'board';
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.bar) this.bar = this.ui.hbar({ win: this.band, label: '' });
    // the side over the flame cooks
    if (this.finishT < 0 && this.t > 0.6) {
      this.d[this.side] += RATE * dt * (0.85 + Math.sin(this.t * 7) * 0.15);
      if (this.d[this.side] > 1.0) {
        this.smokeT -= dt;
        if (this.smokeT <= 0) { this.smokeT = 0.15; smoke(this.fx, this.group.position.clone().add(V3(0, 0.05, 0)), 0.2); }
      }
    }
    if (live && this.finishT < 0 && this.pressed() && this.turnT >= 0.6) {
      this.turnFrom = this.side;
      this.side = (this.side + 1) % SIDES;
      this.turnT = 0;
      this.audio.play('flip', { vol: 0.5, pitch: 1.2 });
      const v = this.d[this.turnFrom];
      if (v >= this.band[0] && v <= this.band[1]) this.audio.play('ding', { vol: 0.25, pitch: 1.5 });
    }
    // done when every side has been past the window's start once and you turn back to the first
    if (live && this.finishT < 0 && this.d.every((v) => v >= this.band[0])) this.end1();
    this.turnT += dt;
    const k = clamp(this.turnT / 0.18, 0, 1), back = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2; // a quick turn with a little overshoot
    this.roll.rotation.x = (this.turnFrom + ((this.side - this.turnFrom + SIDES) % SIDES) * back) * (Math.PI / 2);
    this.group.position.y = this.fire.y + 0.3 + Math.sin(this.t * 3) * 0.006;
    // the pieces show how done they are overall (the flame side reddens with heat)
    const mean = this.d.reduce((a, b) => a + b, 0) / SIDES;
    const col = mean < 0.75 ? RAW.clone().lerp(GOLD, mean / 0.75) : GOLD.clone().lerp(BURNT, clamp((mean - 0.9) / 0.4, 0, 1));
    for (const m of this.mats) m.color.copy(col);
    if (this.bar) {
      this.bar.set(this.d[this.side]);
      this.bar.flips(this.d.map((v, i) => `<i class="ck-pip${i === this.side ? ' on' : ''}${v > this.band[1] ? ' burnt' : v >= this.band[0] ? ' gold' : ''}"></i>`).join(''));
    }
    if (this.finishT >= 0) { this.finishT += dt; if (this.finishT > 0.6) this.finish(this.final); }
    // paws: both hold the ends of the skewer
    const G = this.group.position;
    this.R.speed = 24; this.L.speed = 24;
    this.R.goal.set(G.x + 0.5, G.y - 0.02, G.z + 0.12);
    this.R.setPose({ pitch: 0.2, roll: 0.9 + Math.sin(this.roll.rotation.x) * 0.2, yaw: 0.9 });
    this.L.goal.set(G.x - 0.5, G.y - 0.04, G.z + 0.12);
    this.L.setPose({ pitch: 0.3, roll: 0.5, yaw: 0.6 });
  }

  end1() {
    this.finishT = 0;
    const c = (this.band[0] + this.band[1]) / 2, h = (this.band[1] - this.band[0]) / 2;
    let s = 0;
    for (const v of this.d) s += v > this.band[1] ? clamp(60 - (v - this.band[1]) * 160, 0, 60) : clamp(100 - Math.abs(v - c) / h * 25, 50, 100);
    this.final = s / SIDES;
    this.k.setBurner(1, 0);
    this.cook.loop('sizzle', false);
    this.audio.play(this.final > 85 ? 'sparkle' : 'good');
    if (this.final > 85) sparkle(this.fx, this.group.position.clone(), 14);
    this.float(this.final > 85 ? 'Golden all round!' : this.final > 55 ? 'Roasted!' : 'Charred!', this.group.position.clone().add(V3(0, 0.25, 0)), this.final > 85 ? '#ffe066' : this.final > 55 ? '#9af07a' : '#ff9a8a');
  }

  timeout() { if (this.finishT < 0) this.end1(); }

  end() { this.k.setBurner(1, 0); this.cook.loop('sizzle', false); this.R.speed = 14; this.L.speed = 14; super.end(); }
}
