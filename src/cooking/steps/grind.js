// GRIND: the stone mortar on the board, the ingredient tumbled in. Circle the pestle round the bowl
// (drag in circles, like stirring): a steady pace grinds it down to a heap of powder; whirl it too
// fast and puffs of it fly out over the rim, too slow and it only rolls about.
import { Step, V3, THREE } from './base.js';
import { mortar, pestle, heap, FS } from '../toolVox.js';
import { ingredientMesh } from '../ingVox.js';
import { mainColor } from '../food.js';
import { puff, crumbs } from '../fx.js';
import { BOARD_TOP } from '../kitchen.js';
import { clamp, damp, mixHex } from '../../core/util.js';

const NEED = 4.2 * Math.PI * 2; // radians of steady grinding to finish

export class GrindStep extends Step {
  get station() { return 'board'; }
  get title() { return 'GRIND!'; }
  get hint() { return 'Circle steady'; }

  begin() {
    this.limit = 9;
    const S = this.S;
    this.item = this.opts.item || this.cook.ings?.[0] || 'stone_thyme';
    this.color = mainColor(this.item);
    this.group = this.temp(new THREE.Group());
    this.group.position.set(S.x, BOARD_TOP, S.z - 0.02);
    this.mortar = mortar();
    this.group.add(this.mortar);
    this.bowlY = this.mortar.userData.bowlY;
    this.r = this.mortar.userData.innerR * 0.62;
    this.pestle = pestle();
    this.group.add(this.pestle);
    // the ingredient tumbles in from above, then wears down into the powder
    this.ing = ingredientMesh(this.item, 0.2);
    if (this.ing) { this.ing.position.set(0, 0.6, 0); this.group.add(this.ing); }
    this.dropT = 0;
    this.heaps = [];
    this.heapK = -1;
    this.travel = 0; this.lastA = null; this.omega = 0; this.spills = 0; this.spillCd = 0; this.good = 0; this.total = 0;
    this.pt = V3(this.r * 0.6, 0, 0);
    this.gauge = null;
    this.finishT = -1;
    this.band = this.win(5.5, 12, 1, 30); // a steady pace (rad/s)
    this.cook.food.where = 'board';
  }

  setHeap(k) {
    const q = Math.round(clamp(k, 0, 1) * 6);
    if (q === this.heapK) return;
    this.heapK = q;
    for (const h of this.heaps) h.visible = false;
    if (!this.heaps[q]) {
      const m = heap(q / 6, mixHex(this.color, 0xf6eedc, 0.35), 9);
      m.position.y = this.bowlY - FS * 2;
      this.group.add(m);
      this.heaps[q] = m;
    }
    this.heaps[q].visible = q > 0;
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.gauge) this.gauge = this.ui.gauge({ top: 'Fine', label: 'Pace', zone: [this.band[0] / 18, this.band[1] / 18], sweet: true });
    const G = this.group.position;
    // the ingredient drops in with a bounce, then shrinks as it's ground
    if (this.ing) {
      this.dropT += dt;
      const k = clamp(this.dropT / 0.45, 0, 1);
      const y = this.bowlY + (0.6 - this.bowlY) * (1 - k * k) + (k >= 1 ? Math.abs(Math.sin(this.dropT * 9)) * 0.01 * Math.exp(-this.dropT * 3) : 0);
      const wear = 1 - clamp(this.travel / NEED, 0, 1);
      this.ing.position.set(this.pt.x * 0.3, y, this.pt.z * 0.3);
      this.ing.scale.setScalar((0.2 / 64) * (0.25 + 0.75 * wear));
      this.ing.rotation.y += this.omega * dt * 0.3;
      if (k >= 1 && this.dropT - dt < 0.45) { this.audio.play('thud', { vol: 0.4 }); this.cook.shake(0.003); }
    }
    if (live && this.finishT < 0) {
      const m = this.mouseAt(G.y + this.bowlY);
      if (m) {
        const dx = m.x - G.x, dz = m.z - G.z, d = Math.hypot(dx, dz), k = d > this.r ? this.r / d : 1;
        this.pt.x = damp(this.pt.x, dx * k, 22, dt);
        this.pt.z = damp(this.pt.z, dz * k, 22, dt);
      }
      const rad = Math.hypot(this.pt.x, this.pt.z), a = Math.atan2(this.pt.z, this.pt.x);
      if (this.lastA !== null && rad > this.r * 0.2) {
        let da = a - this.lastA;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        this.omega = damp(this.omega, Math.abs(da) / Math.max(dt, 1e-3), 7, dt);
        const inBand = this.omega >= this.band[0] && this.omega <= this.band[1];
        // steady grinding counts in full; slow rolling a little; whirling spills
        this.travel += Math.abs(da) * (inBand ? 1 : this.omega < this.band[0] ? 0.35 : 0.6);
        this.total += dt; if (inBand) this.good += dt;
        if (Math.floor(this.travel / Math.PI) > Math.floor((this.travel - Math.abs(da)) / Math.PI)) this.audio.play('chisel', { vol: 0.25, pitch: 0.6 + Math.random() * 0.2 });
      } else this.omega = damp(this.omega, 0, 4, dt);
      this.lastA = a;
      this.cook.loop('grind', this.omega > 2, clamp(this.omega / 14, 0.15, 0.6));
      this.spillCd -= dt;
      if (this.omega > this.band[1] * 1.15 && this.spillCd <= 0) {
        this.spillCd = 0.5;
        this.spills++;
        const at = V3(G.x + this.pt.x * 1.8, G.y + this.mortar.userData.rimY, G.z + this.pt.z * 1.8);
        puff(this.fx, at, mixHex(this.color, 0xffffff, 0.4), 8, 0.12);
        this.float('Easy!', at.clone().add(V3(0, 0.12, 0)), '#ff9a8a');
      }
      if (this.gauge) { this.gauge.set(clamp(this.travel / NEED, 0, 1), '#e8dcc0'); this.gauge.mark(clamp(this.omega / 18, 0, 1)); }
      if (this.travel >= NEED) {
        this.finishT = 0;
        this.cook.loop('grind', false);
        const steady = this.total ? this.good / this.total : 0;
        this.final = clamp(45 + steady * 60 - this.spills * 10, 10, 100);
        this.audio.play('sparkle');
        crumbs(this.fx, V3(G.x, G.y + this.bowlY + 0.05, G.z), mixHex(this.color, 0xffffff, 0.3), 8, G.y + this.bowlY);
        this.float(steady > 0.7 ? 'Fine powder!' : 'Ground!', V3(G.x, G.y + 0.45, G.z), steady > 0.7 ? '#ffe066' : '#9af07a');
        if (!this.cook.food.chunks.includes(this.color)) this.cook.food.chunks.push(this.color);
      }
    }
    if (this.finishT >= 0) { this.finishT += dt; if (this.finishT > 0.5) this.finish(this.final); }
    this.setHeap(this.travel / NEED);
    // the pestle: head in the bowl at the point, handle leaning out toward the right paw
    const P = this.pestle;
    const lean = V3(0.45 + this.pt.x * 2, 1, 0.5 + this.pt.z * 2).normalize();
    P.position.set(this.pt.x, this.bowlY + Math.abs(Math.sin(this.travel * 2)) * 0.006, this.pt.z);
    P.quaternion.setFromUnitVectors(V3(0, 1, 0), lean);
    const top = P.position.clone().addScaledVector(lean, 0.36).add(G);
    this.R.speed = 26;
    this.R.goal.set(top.x + 0.06, top.y - 0.04, top.z + 0.12);
    this.R.setPose({ pitch: 0.3, roll: 0.5, yaw: 0.9 });
    // the left paw steadies the mortar
    this.L.goal.set(G.x - 0.32, G.y + 0.16, G.z + 0.12);
    this.L.setPose({ pitch: 0.55, roll: 0.25, yaw: 0.6 });
  }

  timeout() {
    if (this.finishT >= 0) return;
    this.cook.loop('grind', false);
    this.finish(clamp((this.travel / NEED) * 70 - this.spills * 8, 0, 70));
  }

  end() { this.cook.loop('grind', false); this.R.speed = 14; super.end(); }
}
