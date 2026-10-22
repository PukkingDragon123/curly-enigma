// The rock-nibbler for the guard lesson: a pebble-shelled beetle that lives in a hole in the east
// wall of Old Star's dig. It scuttles out, squares up to the mole, rears up (a hiss, its eyes flare:
// the tell), and lunges. Held guard as it lands = blocked (raised just before = a perfect parry):
// it bounces off. Two blocks (or a parry) and it's dizzy; a tap of the pick then sends it running
// home. It reads the scene's block state (owner.blocking, owner.blockT) and raises the same events
// creatures do: { damage, kind, push } unguarded, { blocked } / { parried } guarded (DigScene rings
// the clang and emits act 'block').
import * as THREE from 'three';
import { Vox, mix, dk, lt, h3 } from '../../gfx/char/vox.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { makeObjectMaterial } from '../TerrainMaterial.js';
import { floorAt } from './oldstar.js';

const S = 1 / 32;
const SHELL = [0x6a625c, 0x7c746c, 0x8e867c, 0x5a524c];
const _v = new THREE.Vector3();

function bodyGeo() {
  const v = new Vox(-8, 8, -1, 10, -9, 12);
  // the shell: a pebble dome of plates with pale specks and a mossy dab
  v.fill(-6, 6, 2, 9, -8, 6, (x, y, z) => (x / 5.2) ** 2 + ((y - 3) / 4.2) ** 2 + ((z + 0.5) / 6.6) ** 2 <= 1 && y >= 2.5, (x, y, z) => {
    const plate = (Math.floor((z + 20) / 3) + Math.floor((x + 20) / 4)) & 1;
    let c = SHELL[(plate + (y > 5 ? 2 : 0)) % 4];
    if (h3(x, y, z, 7) < 0.1) c = lt(c, 0.35);
    if (y >= 6 && x > -2 && x < 2 && z > -3 && z < 0 && h3(x, y, z, 9) < 0.6) c = 0x4a6a3a;
    if ((z + 20) % 3 === 0) c = dk(c, 0.2); // seams between the plates
    return c;
  });
  // the belly and the head
  v.ell(0, 2.4, -0.5, 4.2, 1.2, 5.6, 0x3a2e2a);
  v.ell(0, 3, 6.2, 3, 2.3, 2.4, (x, y, z) => (y > 3.5 ? 0x4a3a32 : 0x3a2c26));
  // mandibles and antennae
  for (const s of [-1, 1]) {
    v.line(s * 1.6, 2.4, 7.6, s * 0.5, 2.1, 10, 0xe8dcc0, 0.5);
    v.line(s * 0.9, 4.6, 7.4, s * 2.6, 7.4, 10.6, 0x2a201c, 0.45);
  }
  return v.geometry(false);
}

function legsGeo(side) {
  const v = new Vox(-9, 9, -2, 5, -6, 7);
  for (const z of [-3.5, 0, 3.5]) {
    v.line(side * 3.6, 2.6, z, side * 6.2, 2.4, z + side * 0.3, 0x2e241e, 0.55);
    v.line(side * 6.2, 2.4, z + side * 0.3, side * 7.4, 0.2, z + (z > 0 ? 1 : z < 0 ? -1 : 0), 0x2e241e, 0.5);
  }
  return v.geometry(false);
}

function eyesGeo() {
  const v = new Vox(-3, 3, 2, 6, 6, 9);
  for (const s of [-1, 1]) { v.set(s > 0 ? 1 : -2, 4, 7, 0xffb030); v.set(s > 0 ? 1 : -2, 5, 7, 0xffe080); }
  return v.geometry(false);
}

export class Nibbler {
  /** ctx: the DigScene context; L: the layout. */
  constructor(ctx, L) {
    this.c = ctx;
    this.L = L;
    this.w = ctx.world;
    this.mat = makeObjectMaterial(ctx.U, {});
    this.eyeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const mk = (geo, mat, outline = true) => { geo.scale(S, S, S); const m = new THREE.Mesh(geo, mat); if (outline) m.layers.enable(LAYER_OUTLINE); return m; };
    this.shell = mk(bodyGeo(), this.mat);
    this.legL = mk(legsGeo(-1), this.mat);
    this.legR = mk(legsGeo(1), this.mat);
    this.eyes = mk(eyesGeo(), this.eyeMat, false);
    this.legL.position.y = this.legR.position.y = 0.06;
    this.legL.geometry.translate(0, -0.06, 0); this.legR.geometry.translate(0, -0.06, 0);
    this.body.add(this.shell, this.legL, this.legR, this.eyes);
    this.root.visible = false;
    ctx.scene3.add(this.root);
    this.pos = new THREE.Vector3(L.den.x, L.den.y - 0.18, L.den.z);
    this.vel = new THREE.Vector3();
    this.yaw = -Math.PI / 2;
    this.state = 'den';
    this.t = 0;
    this.st = 0;
    this.blocks = 0;
    this.hits = 0;
    this.bonks = 0;
    this.first = true;
    this.ev = [];
  }

  get active() { return this.state !== 'den' && this.state !== 'gone'; }

  /** Out of its hole. */
  emerge() { if (this.state === 'den' || this.state === 'gone') { this.root.visible = true; this.set('emerge'); this.pos.set(this.L.den.x, this.L.den.y - 0.18, this.L.den.z); } }

  set(s) { this.state = s; this.st = 0; }

  /** A tap of the pick (from the lesson, when a swing lands on it). Returns what happened. */
  bonk(dir) {
    if (!this.active || this.state === 'flee') return null;
    this.c.audio?.play('squeak', { pitch: 1.4 });
    this.c.fx?.dust(this.pos.x, this.pos.y + 0.1, this.pos.z, 6, [0.5, 0.45, 0.4], 0.1);
    this.bonks++;
    if (this.state === 'dizzy') { this.flee(); return 'fled'; }
    this.vel.set(dir.x * 2.5, 1.6, dir.z * 2.5);
    this.arcY = 0.05;
    this.set('recoil');
    return 'recoil';
  }

  /** Back into the hole. */
  flee() { if (this.active) this.set('flee'); }

  /** Is the ray (eye, dir) on it within reach? Returns the distance or null. */
  hit(eye, dir, reach) {
    if (!this.active) return null;
    _v.set(this.pos.x - eye.x, this.pos.y + 0.12 - eye.y, this.pos.z - eye.z);
    const along = _v.dot(dir);
    if (along < 0 || along > reach + 0.2) return null;
    const d2 = _v.lengthSq() - along * along;
    return d2 < 0.2 * 0.2 ? along : null;
  }

  floor(x, z, y) { return floorAt(this.w, x, y, z, 0.3, 0.6); }

  update(dt, o) {
    this.ev = [];
    if (!this.active) return this.ev;
    this.t += dt;
    this.st += dt;
    const pl = o.player, p = this.pos, v = this.vel;
    const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z, dist = Math.hypot(dx, dz) || 1e-3;
    const ux = dx / dist, uz = dz / dist;
    const audio = this.c.audio;
    let walk = 0, rear = 0, shakeK = 0, arc = 0;
    const free = (x, z) => !this.w.solidAt(x, p.y + 0.12, z);
    const toward = (tx, tz, speed) => {
      const ex = tx - p.x, ez = tz - p.z, d = Math.hypot(ex, ez);
      if (d < 0.03) return true;
      const step = Math.min(d, speed * dt);
      const nx = p.x + (ex / d) * step, nz = p.z + (ez / d) * step;
      if (free(nx, nz)) { p.x = nx; p.z = nz; } else if (free(nx, p.z)) p.x = nx; else if (free(p.x, nz)) p.z = nz;
      this.yaw = Math.atan2(ex, ez);
      walk = speed;
      return d < 0.05;
    };
    const L = this.L;
    switch (this.state) {
      case 'emerge': {
        // along the hole, then a little way out into the room
        const out = { x: L.burrow.x - 0.55, z: L.burrow.z };
        const mid = p.x > L.burrow.x + 0.02;
        if (mid ? toward(L.burrow.x, L.burrow.z, 0.9) : toward(out.x, out.z, 1.1)) { if (!mid) this.set('approach'); }
        if (this.st < 0.1) audio?.play('click', { vol: 0.5 });
        break;
      }
      case 'approach': {
        this.yaw = Math.atan2(ux, uz);
        if (dist > 1.05) toward(pl.pos.x - ux * 1.0, pl.pos.z - uz * 1.0, 1.4);
        else if (this.st > 0.35) this.set('windup');
        if (Math.random() < dt * 3) audio?.play('click', { vol: 0.25, pitch: 1.6 });
        break;
      }
      case 'windup': {
        // the tell: it rears up, shivers and hisses; the first time is slow so you can read it
        const dur = this.first ? 1.5 : 0.8;
        this.yaw = Math.atan2(ux, uz);
        rear = Math.min(1, this.st / 0.25);
        shakeK = 1;
        if (this.st < dt * 1.5) { audio?.play('hiss', { vol: 0.6 }); this.ev.push({ tell: true }); }
        if (dist > 1.6) this.set('approach');
        else if (this.st > dur) { this.first = false; this.lunge = { x: ux, z: uz, t: 0 }; this.set('lunge'); audio?.play('whoosh', { vol: 0.4, pitch: 1.8 }); }
        break;
      }
      case 'lunge': {
        const Lg = this.lunge;
        Lg.t += dt;
        const sp = 4.2, nx = p.x + Lg.x * sp * dt, nz = p.z + Lg.z * sp * dt;
        if (free(nx, nz)) { p.x = nx; p.z = nz; }
        arc = Math.sin(Math.min(1, Lg.t / 0.32) * Math.PI) * 0.28;
        rear = 0.4;
        const near = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
        if (near < 0.4 || Lg.t > 0.45) {
          if (near < 0.55) this.contact(o, Lg);
          else this.set('approach'); // missed (you stepped aside)
        }
        break;
      }
      case 'recoil': case 'bounce': {
        v.y -= 9 * dt;
        if (free(p.x + v.x * dt, p.z + v.z * dt)) { p.x += v.x * dt; p.z += v.z * dt; } else { v.x = 0; v.z = 0; }
        arc = Math.max(0, (this.arcY || 0) + v.y * dt);
        this.arcY = arc;
        if (arc <= 0) { this.arcY = 0; v.y = 0; v.x *= 0.85; v.z *= 0.85; }
        if (this.st > 0.8) this.set(this.blocks >= 2 ? 'dizzy' : 'approach');
        break;
      }
      case 'dizzy': {
        // wobbling, little stars round it
        this.yaw += dt * 3;
        if (Math.random() < dt * 14) {
          const a = this.t * 6 + Math.random() * 6;
          this.c.fx?.spawn?.({ x: p.x + Math.cos(a) * 0.14, y: p.y + 0.3, z: p.z + Math.sin(a) * 0.14, vx: -Math.sin(a) * 0.4, vz: Math.cos(a) * 0.4, life: 0.45, size: 0.016, color: [1, 0.9, 0.4], glow: true });
        }
        break;
      }
      case 'flee': {
        const mouth = { x: L.burrow.x - 0.25, z: L.burrow.z };
        const inHole = p.x > L.burrow.x - 0.3;
        if (!inHole) toward(mouth.x, mouth.z, 3.2);
        else if (toward(L.den.x + 0.1, L.den.z, 2.4)) { this.set('gone'); this.root.visible = false; }
        if (Math.random() < dt * 5) audio?.play('squeak', { vol: 0.3, pitch: 1.6 + Math.random() * 0.4 });
        break;
      }
    }
    // stay on the floor (the room is flat; the hole's floor is the room's)
    const fy = this.floor(p.x, p.z, p.y + 0.1);
    p.y += (fy - p.y) * Math.min(1, dt * 18);
    // pose
    this.root.position.set(p.x, p.y + arc, p.z);
    this.root.rotation.y = this.yaw;
    const k = this.t * (walk > 0 ? 26 : 6);
    this.legL.rotation.x = Math.sin(k) * (walk > 0 ? 0.5 : 0.08);
    this.legR.rotation.x = -Math.sin(k) * (walk > 0 ? 0.5 : 0.08);
    this.body.rotation.x = -rear * 0.55;
    this.body.position.y = rear * 0.05 + Math.abs(Math.sin(k * 0.5)) * (walk > 0 ? 0.012 : 0.004);
    this.body.rotation.z = shakeK ? Math.sin(this.t * 60) * 0.06 : this.state === 'dizzy' ? Math.sin(this.t * 7) * 0.2 : 0;
    // the eyes flare during the tell
    const g = this.state === 'windup' || this.state === 'lunge' ? 1.6 : this.state === 'dizzy' ? 0.5 : 1;
    this.eyeMat.color.setRGB(g, g, g);
    return this.ev;
  }

  /** It reaches the mole: guarded (blocked / parried) or not. */
  contact(o, Lg) {
    const owner = this.c.owner;
    const blocking = !!owner?.blocking, blockT = owner?.blockT || 0;
    if (blocking) {
      const perfect = blockT < 0.35;
      this.blocks += perfect ? 2 : 1;
      this.ev.push(perfect ? { parried: true, kind: 'nibbler' } : { blocked: true, kind: 'nibbler' });
      this.ev.push({ guarded: perfect ? 'parried' : 'blocked' });
      this.vel.set(-Lg.x * 2.6, 2.2, -Lg.z * 2.6);
      this.c.fx?.sparks?.(o.player.pos.x - Lg.x * 0.3, o.player.pos.y + 0.4, o.player.pos.z - Lg.z * 0.3, 8, [1, 0.85, 0.5], [-Lg.x, 0.3, -Lg.z], 2.5);
      this.c.audio?.play('squeak', { pitch: 1.2 });
      this.arcY = 0.1;
      this.set('bounce');
    } else {
      this.hits++;
      this.ev.push({ damage: 3, kind: 'nibbler', push: [Lg.x * 2.2, 1.2, Lg.z * 2.2] });
      this.ev.push({ guarded: false });
      this.vel.set(-Lg.x * 1.6, 1.4, -Lg.z * 1.6);
      this.arcY = 0.1;
      this.set('recoil');
    }
  }

  dispose() {
    this.c.scene3.remove(this.root);
    for (const m of [this.shell, this.legL, this.legR, this.eyes]) m.geometry.dispose();
    this.mat.dispose();
    this.eyeMat.dispose();
  }
}
