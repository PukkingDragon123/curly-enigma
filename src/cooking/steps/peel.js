// PEEL: the left paw turns the ingredient against the peeler in the right. Hold (mouse, Space or a
// finger) and the blade runs round it, a curling ribbon of peel growing off it in one piece. Dark
// knots come round toward the blade: let go before one reaches it, or the ribbon snaps off.
import { Step, V3, THREE } from './base.js';
import { peeler } from '../toolVox.js';
import { ingredientMesh } from '../ingVox.js';
import { mainColor } from '../food.js';
import { sparkle, crumbs } from '../fx.js';
import { BOARD_TOP } from '../kitchen.js';
import { clamp, shade } from '../../core/util.js';

const TURNS = 2.2 * Math.PI * 2; // how far the blade runs round to finish
const SPEED = 4.4; // rad/s while held
const KNOT_W = 0.32; // rad either side of a knot that snaps the ribbon
const MAXSEG = 160;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

export class PeelStep extends Step {
  get station() { return 'board'; }
  get title() { return 'PEEL!'; }
  get hint() { return this.touch ? 'Hold, skip knots' : 'Hold, skip knots'; }

  begin() {
    this.limit = 10;
    const S = this.S;
    this.item = this.opts.item || this.cook.ings?.[0] || 'cave_carrot';
    this.color = mainColor(this.item);
    this.skin = shade(this.color, 0.72);
    this.group = this.temp(new THREE.Group());
    this.group.position.set(S.x - 0.02, BOARD_TOP + 0.2, S.z - 0.04);
    this.spin = new THREE.Group();
    this.group.add(this.spin);
    this.ing = ingredientMesh(this.item, 0.5);
    if (this.ing) { this.ing.position.y = -(this.ing.userData.h || 0.2) * 0.45; this.spin.add(this.ing); }
    this.rad = Math.max(0.06, (this.ing?.userData.w || 0.2) * 0.42);
    // knots: little dark eyes set round it; each reaches the blade when u = its angle
    this.knots = [];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const u = 1.6 + i * ((TURNS - 2.4) / (n - 1)) + (Math.random() - 0.5) * 0.5;
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.034, 0.034), new THREE.MeshLambertMaterial({ color: 0x3a2414 }));
      k.position.set(Math.cos(u) * this.rad, i % 2 ? 0.02 : -0.03, Math.sin(u) * this.rad); // meets the blade (+x) when the turn reaches u
      const pip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), new THREE.MeshLambertMaterial({ color: 0x8a5a2a }));
      pip.position.set(0.008, 0.012, 0.004);
      k.add(pip);
      this.spin.add(k);
      this.knots.push({ u, m: k, gone: false });
    }
    for (const k of this.knots) this.objs.push(k.m); // (geometries disposed on end)
    this.peeler = this.temp(peeler(), this.group);
    this.peeler.scale.setScalar(1.5);
    this.peeler.position.set(this.rad + 0.03, 0, 0.02);
    this.peeler.rotation.set(0, 0, -0.35);
    // the ribbon: voxel bits laid as it peels, curling away
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.strip = this.temp(new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXSEG), this.cook.scene);
    this.strip.count = 0;
    this.strip.frustumCulled = false;
    this.segs = [];
    this.falling = [];
    this.u = 0; this.holding = false; this.snaps = 0; this.stun = 0; this.lastSeg = 0; this.longest = 0; this.run = 0;
    this.gauge = null;
    this.finishT = -1;
  }

  held() {
    const i = this.input;
    return i.mouseDown(0) || i.isDown('Space', 'Enter');
  }

  tick(dt, live) {
    if (this.t > 0.5 && !this.gauge) this.gauge = this.ui.gauge({ top: 'Peeled', label: 'Hold' });
    this.stun = Math.max(0, this.stun - dt);
    this.holding = live && this.finishT < 0 && this.stun <= 0 && this.held();
    if (this.holding) {
      const du = SPEED * dt;
      this.u += du;
      this.run += du;
      this.longest = Math.max(this.longest, this.run);
      if (this.u - this.lastSeg > 0.07) { this.lastSeg = this.u; this.addSeg(); }
      if ((this.t * 20 | 0) % 3 === 0) this.audio.play('chop', { vol: 0.08, pitch: 1.8 + Math.random() * 0.3 });
      // a knot under the blade snaps the ribbon
      for (const k of this.knots) {
        if (k.gone || Math.abs(this.u - k.u) > KNOT_W) continue;
        k.gone = true; k.m.visible = false;
        this.snap();
      }
      if (this.u >= TURNS) this.done1();
    } else {
      // a knot that passes the blade while you wait just pops off cleanly
      for (const k of this.knots) if (!k.gone && this.u > k.u + KNOT_W) { k.gone = true; k.m.visible = false; }
      // let go right after a knot passed: the next hold carries on from here
    }
    // knots coming up glint a warning as they near the blade
    for (const k of this.knots) if (!k.gone) { const d = k.u - this.u; k.m.scale.setScalar(d > 0 && d < 1.1 ? 1.2 + Math.sin(this.t * 24) * 0.25 : 1); }
    if (this.gauge) this.gauge.set(clamp(this.u / TURNS, 0, 1), '#e8b070');
    this.spin.rotation.y = this.u + (this.holding ? Math.sin(this.t * 40) * 0.01 : 0);
    this.spin.rotation.z = Math.sin(this.t * 2) * 0.05;
    this.peeler.rotation.x = this.holding ? Math.sin(this.t * 30) * 0.06 : 0;
    this.drawStrip(dt);
    if (this.finishT >= 0) { this.finishT += dt; if (this.finishT > 0.55) this.finish(this.final); }
    if (this.popT !== undefined && this.ing) { this.popT += dt; const k = Math.min(1, this.popT / 0.35); this.spin.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.18); }
    // paws: left turns the ingredient from the left, right holds the peeler at the blade
    const G = this.group.position;
    this.L.speed = 22; this.R.speed = 22;
    this.L.goal.set(G.x - this.rad - 0.3, G.y - 0.08, G.z + 0.12);
    this.L.setPose({ pitch: 0.2, roll: 0.9 + Math.sin(this.u * 2) * 0.1, yaw: 0.4 });
    this.R.goal.set(G.x + this.rad + 0.34, G.y - 0.12 + (this.holding ? Math.sin(this.t * 30) * 0.004 : 0), G.z + 0.14);
    this.R.setPose({ pitch: 0.25, roll: 0.5, yaw: 1.0 });
  }

  addSeg() {
    if (this.segs.length >= MAXSEG) return;
    // a ribbon bit at the blade (world), curling out and down from there
    const G = this.group.position;
    const i = this.segs.length - this.segBase();
    const curl = i * 0.22;
    this.segs.push({ x: G.x + this.rad + 0.03 + Math.min(0.12, i * 0.004), y: G.y + 0.03 - i * 0.004, z: G.z + 0.02, a: curl, i, fall: false, vy: 0, c: (this.segs.length % 5 === 0) ? shade(this.skin, 0.85) : this.skin });
  }
  segBase() { return this.base || 0; }

  snap() {
    this.snaps++;
    this.run = 0;
    this.stun = 0.35;
    this.audio.play('crack', { vol: 0.5 });
    this.cook.shake(0.004);
    const G = this.group.position;
    for (const s of this.segs) if (!s.fall) { s.fall = true; s.vy = 0.2; }
    this.base = this.segs.length;
    crumbs(this.fx, V3(G.x + this.rad, G.y, G.z + 0.05), this.skin, 6, BOARD_TOP);
    this.float('Snap!', V3(G.x + this.rad, G.y + 0.2, G.z), '#ff9a8a');
  }

  done1() {
    this.finishT = 0;
    const clean = this.snaps === 0;
    this.final = clamp(100 - this.snaps * 18 - (this.live > 7 ? (this.live - 7) * 6 : 0), 15, 100);
    for (const s of this.segs) if (!s.fall) { s.fall = true; s.vy = 0.5; }
    this.audio.play(clean ? 'sparkle' : 'good');
    const G = this.group.position;
    if (clean) sparkle(this.fx, V3(G.x + this.rad, G.y + 0.1, G.z), 12);
    this.float(clean ? 'One long curl!' : 'Peeled!', V3(G.x, G.y + 0.3, G.z), clean ? '#ffe066' : '#9af07a');
    this.popT = 0;
  }

  drawStrip(dt) {
    const S = this.strip;
    let n = 0;
    for (const s of this.segs) {
      if (s.fall) {
        s.vy -= 3.5 * dt;
        s.y = Math.max(BOARD_TOP + 0.01, s.y + s.vy * dt);
        s.x += 0.15 * dt;
      } else {
        // the hanging ribbon sways and curls a little more as it grows
        const age = this.segs.length - s.i;
        s.a += dt * 0.15;
        s.y -= dt * 0.004 * Math.min(1, age * 0.05);
      }
      const w = 0.042, h = 0.012;
      _p.set(s.x + Math.cos(s.a) * 0.02, s.y, s.z + Math.sin(s.a) * 0.03);
      _q.setFromAxisAngle(_s.set(0, 0, 1), s.a * 0.6);
      _m.compose(_p, _q, _s.set(w, h, 0.05));
      S.setMatrixAt(n, _m);
      S.setColorAt(n, _c.set(s.c));
      n++;
    }
    S.count = n;
    S.instanceMatrix.needsUpdate = true;
    if (S.instanceColor) S.instanceColor.needsUpdate = true;
  }

  timeout() { if (this.finishT < 0) { this.final = clamp((this.u / TURNS) * 70 - this.snaps * 12, 0, 70); this.finishT = 0; } }

  end() { this.L.speed = 14; this.R.speed = 14; super.end(); }
}
