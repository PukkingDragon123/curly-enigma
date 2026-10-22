// Old Star in the mine: his rig (src/gfx/char/starmole.js) standing in the voxel world, lit like
// Nugget (three.js lights: his own warm glow, plus an ambient + helmet-lamp pair when Nugget isn't
// around to bring hers), walking a path of waypoints on the voxel floor at an old mole's pace,
// turning his head to whatever he is talking about, pulling faces (rig.setExpression when the rig
// has it, else the classic emotes), swinging his walking pick, and a hit test for the crosshair.
import * as THREE from 'three';
import { makeStarMole } from '../../gfx/char/starmole.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { VOX } from '../materials.js';
import { OPAQUE } from '../Mesher.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/** The top of the floor under (x, z) near height y (meters; searches up..down around it), or y. */
export function floorAt(world, x, y, z, up = 0.45, down = 0.7) {
  const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
  const v0 = Math.floor((y + up) * VOX), v1 = Math.floor((y - down) * VOX);
  for (let vy = v0; vy >= v1; vy--) {
    if (OPAQUE[world.voxelAt(vx, vy, vz)] === 1 && OPAQUE[world.voxelAt(vx, vy + 1, vz)] !== 1 && OPAQUE[world.voxelAt(vx, vy + 2, vz)] !== 1) return (vy + 1) / VOX;
  }
  return y;
}

// tutor moods → the classic emotes, for rigs without setExpression
const EMOTE = { happy: 'happy', laugh: 'happy', proud: 'nod', stern: 'angry', worried: 'sad', calm: null };

export class OldStarActor {
  /** ctx: the Prologue's DigScene context; at: { x, y, z, yaw }. */
  constructor(ctx, at) {
    this.c = ctx;
    this.w = ctx.world;
    this.rig = makeStarMole({ height: 0.8 });
    this.root = this.rig.root;
    this.root.traverse((o) => { if (o.isMesh && o !== this.rig.skin?.detail) o.layers.enable(LAYER_OUTLINE); });
    ctx.scene3.add(this.root);
    this.pos = new THREE.Vector3(at.x, at.y, at.z);
    this.yaw = at.yaw || 0;
    this.rig.face(this.yaw, true);
    this.path = null;
    this.speed = 1.05;
    this.moving = false;
    this.lookAt = null; // a world point his head turns to
    this.state = 'idle';
    this.swingT = -1;
    this.blockedT = 0;
    this.avoid = null;
    this.rig.play('idle');
    this.syncRoot();
  }

  /** Lights for the toon materials: added once we know whether Nugget brought hers. */
  light(nugget) {
    if (this.lamp) return;
    const s = this.c.scene3;
    this.lamp = new THREE.PointLight(0xffc888, 2.2, 7, 1.3);
    s.add(this.lamp);
    if (!nugget) {
      this.amb = new THREE.AmbientLight(0xffffff, 0.6);
      this.eye = new THREE.PointLight(0xffd8a8, 3, 9, 1.4);
      s.add(this.amb, this.eye);
    }
  }

  play(state, speed = 1) {
    this.state = state;
    if (!this.moving && this.swingT < 0) this.rig.play(state, speed);
  }

  /** His face for a mood ('calm' 'happy' 'laugh' 'proud' 'stern' 'worried'), for hold seconds. */
  mood(m, hold = 2.5) {
    const rig = this.rig;
    rig.faceMood = m === 'laugh' ? 'happy' : m;
    clearTimeout(this.moodT);
    this.moodT = setTimeout(() => { if (rig.faceMood === (m === 'laugh' ? 'happy' : m)) rig.faceMood = null; }, hold * 1000);
    if (typeof rig.setExpression === 'function') { rig.setExpression(m === 'calm' ? 'neutral' : m, { hold }); return; }
    const e = EMOTE[m];
    if (e) rig.doEmote(e, Math.min(hold, 1.6));
    if (m === 'worried' || m === 'laugh') rig.sniff?.(0.8);
  }

  /** A swing of his walking pick (shooing a critter). */
  swing() { this.swingT = 0; this.rig.play('swing'); }

  face(yaw, instant = false) { this.yaw = yaw; this.rig.face(yaw, instant); }
  faceTo(p) { this.face(Math.atan2(p.x - this.pos.x, p.z - this.pos.z)); }

  /** Walk through points [{x, y, z}] (y is found on the floor). onArrive() when done. */
  walk(points, onArrive = null, speed = 1.05) {
    this.path = points.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    this.onArrive = onArrive;
    this.speed = speed;
    this.paused = false;
  }
  stop() { this.path = null; this.moving = false; this.rig.play(this.state); }

  floorAt(x, y, z) { return floorAt(this.w, x, y, z); }

  /** Is the mole (this.avoid, a position) just ahead of him, along (ux, uz)? */
  inTheWay(ux, uz) {
    const a = this.avoid;
    if (!a || Math.abs(a.y - this.pos.y) > 0.8) return false;
    const px = a.x - this.pos.x, pz = a.z - this.pos.z, d = Math.hypot(px, pz);
    return d < 0.62 && (px * ux + pz * uz) / (d || 1) > 0.35;
  }

  update(dt, eye) {
    const rig = this.rig;
    // walking the path
    this.moving = false;
    if (this.squeeze > 0) this.squeeze -= dt;
    if (this.path && this.path.length && !this.paused) {
      const t = this.path[0];
      const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.08) {
        this.path.shift();
        if (!this.path.length) {
          this.path = null;
          const cb = this.onArrive;
          this.onArrive = null;
          rig.play(this.state);
          cb?.();
        }
      } else if (!(this.squeeze > 0) && this.inTheWay(dx / d, dz / d)) {
        // the mole is standing right where he's going: he waits a moment (then squeezes past)
        this.blockedT += dt;
        if (this.blockedT > 0.3) rig.play('idle');
        if (this.blockedT > 2.5) { this.squeeze = 1.2; this.blockedT = 0; }
      } else {
        this.blockedT = 0;
        const step = Math.min(d, this.speed * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.yaw = Math.atan2(dx, dz);
        rig.face(this.yaw);
        this.moving = true;
        rig.play('walk', this.speed / 1.05);
      }
    }
    // the swing of his pick (a shoo): wind up, whack, back to what he was doing
    if (this.swingT >= 0) {
      this.swingT += dt;
      rig.swingPhase = Math.min(1, this.swingT / 0.55);
      if (this.swingT > 0.7) { this.swingT = -1; rig.play(this.state); }
    }
    // stand on the floor (steps and slopes); smooth so step-ups don't pop
    const fy = this.floorAt(this.pos.x, this.pos.y, this.pos.z);
    this.pos.y += (fy - this.pos.y) * Math.min(1, dt * (this.moving ? 14 : 12));
    // the head turns toward what he's looking at (within reach of his neck)
    if (this.lookAt) {
      this.rig.headWorld(_v);
      const dx = this.lookAt.x - _v.x, dy = this.lookAt.y - _v.y, dz = this.lookAt.z - _v.z;
      const yaw = wrap(Math.atan2(dx, dz) - rig.facing);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      rig.look(Math.abs(yaw) < 2.2 ? yaw : 0, pitch * 0.8);
    } else rig.look(0, 0);
    this.syncRoot();
    rig.update(dt);
    if (this.eye && eye) this.eye.position.copy(eye);
    if (this.amb) this.amb.color.copy(this.c.U.ambient.value).multiplyScalar(5);
  }

  syncRoot() { this.root.position.copy(this.pos); }

  headWorld(out = new THREE.Vector3()) { return this.rig.headWorld(out); }

  /** Distance along a ray to his body (a capsule round him), or null. */
  hit(eye, dir, reach) {
    const a = _v.set(this.pos.x, this.pos.y + 0.12, this.pos.z);
    const b = _w.set(this.pos.x, this.pos.y + 0.92, this.pos.z);
    const r = 0.27;
    let best = null;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8; // samples along his body
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t, pz = a.z + (b.z - a.z) * t;
      const ox = px - eye.x, oy = py - eye.y, oz = pz - eye.z;
      const along = ox * dir.x + oy * dir.y + oz * dir.z;
      if (along < 0 || along > reach + r) continue;
      const qx = ox - dir.x * along, qy = oy - dir.y * along, qz = oz - dir.z * along;
      const d2 = qx * qx + qy * qy + qz * qz;
      if (d2 < r * r && (best === null || along < best)) best = along;
    }
    return best;
  }

  dispose() {
    const s = this.c.scene3;
    s.remove(this.root);
    for (const l of [this.lamp, this.amb, this.eye]) if (l) { s.remove(l); l.dispose?.(); }
    this.rig.dispose();
  }
}
