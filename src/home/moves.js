// The mole's scripted moves in the first-person burrow (mixed into HomeScene): digging out through
// a wall (hold E: three swings, dirt flying, then into the mine), walking into and out of tunnel
// mouths, and the old lift in the corner (into the cage, the gate rattles shut, the bell, the lever,
// down; and rising back up into the room when coming home).
import * as THREE from 'three';
import { openLiftPanel, rideTo } from '../fps/lifts.js';
import { T, MOUTH_HW } from './units.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const isTouch = () => document.documentElement.classList.contains('is-touch');

export class HomeMoves {
  // ------------------------------------------------------------ digging
  startDig(s) {
    if (this.dig || this.scripted) return;
    this.dig = { s, k: 0, swings: 0, it: this.rig.target };
    this.rig.setTool('pick', this.game.state.data.equip?.pick || 'pick_rusty');
    this.game.ui.setHints(null);
  }

  /** Hold E / the dig button on a wall spot: three swings, dirt flying, then out into the mine. */
  updateDig(dt) {
    const dg = this.dig;
    if (!dg || dg.done) return;
    const inp = this.game.input;
    const holding = inp.isDown('KeyE') || this.rig.primaryDown;
    if (!holding || this.rig.target !== dg.it) {
      dg.k = Math.max(0, dg.k - dt * 2);
      if (dg.k <= 0) { this.dig = null; this.rig.setTool('none'); }
      return;
    }
    dg.k = Math.min(1, dg.k + dt / 1.25);
    const s = dg.s;
    const n = Math.floor(dg.k * 3 + 0.65);
    if (n > dg.swings && dg.swings < 3) {
      dg.swings++;
      this.rig.vm?.swing('pick', 0.22);
      this.later(0.22, () => this.digHit(s, dg.swings));
    }
    if (dg.k >= 1 && dg.swings >= 3) { dg.done = true; this.later(0.32, () => this.digOut(s)); }
  }

  digHit(s, i) {
    const a = this.game.audio;
    a.play(i >= 3 ? 'debris' : 'hit', { snd: 'dirt', pitch: 0.9 + i * 0.08 });
    this.rig.vm?.impact('pick', 0.8);
    this.rig.shake(0.35);
    const p = this.wallHitPoint(s);
    const out = [s.nx, 0.3, s.nz];
    this.fx.chips(p.x, p.y, p.z, 9 + i * 3, [0.35, 0.24, 0.16], out);
    this.fx.dust(p.x, p.y, p.z, 6 + i * 2, [0.5, 0.38, 0.28], 0.1, out);
    if (i >= 3) this.fx.chips(p.x, p.y, p.z, 14, [0.48, 0.42, 0.38], out);
  }

  /** Where the crosshair meets a wall spot (meters). */
  wallHitPoint(s) {
    const eye = this.rig.eye(_v), f = this.rig.forward(_w);
    const h = this.world.raycast(eye.x, eye.y, eye.z, f.x, f.y, f.z, 3);
    if (h) return { x: h.x + s.nx * 0.04, y: h.y, z: h.z + s.nz * 0.04 };
    const W = this.W * T, D = this.D * T;
    return { x: s.wall === 'w' ? 0.04 : s.wall === 'e' ? W - 0.04 : s.t * T, y: 0.6, z: s.wall === 'n' ? 0.04 : s.wall === 's' ? D - 0.04 : s.t * T };
  }

  digOut(s) {
    this.game.goto('deep', { from: 'home', wall: s.wall, t: s.t }, { transition: 'fade', dur: 0.5 });
  }

  /** E on a tunnel mouth: walk in. */
  async walkIntoTunnel(s) {
    if (this.scripted) return;
    this.beginScript();
    const c = s.t * T, W = this.W * T, D = this.D * T;
    const pt = { n: [c, 0.35, c, -0.6], s: [c, D - 0.35, c, D + 0.6], w: [0.35, c, -0.6, c], e: [W - 0.35, c, W + 0.6, c] }[s.wall];
    await this.walkCam(pt[0], pt[1], 2);
    this.game.audio.play('step', { mat: 'dirt' });
    this.walkCam(pt[2], pt[3], 1.6);
    this.later(0.25, () => this.game.goto('deep', { from: 'home', wall: s.wall, t: s.t }, { transition: 'fade', dur: 0.45 }));
  }

  /** Walking into an open tunnel mouth takes you down it. */
  checkTunnels() {
    const p = this.rig.player.pos, W = this.W * T, D = this.D * T;
    for (const t of this.tunnels) {
      const c = t.t * T;
      const inside = t.wall === 'n' ? p.z < -0.2 && Math.abs(p.x - c) < MOUTH_HW : t.wall === 's' ? p.z > D + 0.2 && Math.abs(p.x - c) < MOUTH_HW
        : t.wall === 'w' ? p.x < -0.2 && Math.abs(p.z - c) < MOUTH_HW : p.x > W + 0.2 && Math.abs(p.z - c) < MOUTH_HW;
      if (inside && !this.leaving) { this.leaving = true; this.game.audio.play('step', { mat: 'dirt' }); this.game.goto('deep', { from: 'home', wall: t.wall, t: t.t }, { transition: 'fade', dur: 0.45 }); return; }
    }
  }

  /** Coming back up a tunnel: appear in its mouth and step into the room. */
  async stepOutOfTunnel(tn) {
    if (!tn) return;
    this.beginScript();
    const c = tn.t * T, W = this.W * T, D = this.D * T;
    const to = { n: [c, 0.75], s: [c, D - 0.75], w: [0.75, c], e: [W - 0.75, c] }[tn.wall];
    this.fx.dust(this.cam.x, 0.3, this.cam.z, 10, [0.42, 0.32, 0.24], 0.2);
    this.game.audio.play('step', { mat: 'dirt' });
    await this.walkCam(to[0], to[1], 1.3, this.cam.yaw);
    this.endScript();
  }

  showDigHint() {
    if (this.game.state.flag('escaped') || this.scripted || this.build?.active) return;
    this.game.ui.setHints(isTouch() ? 'Look at a wall and hold <b>dig</b> to tunnel out · or ride the old lift' : 'Look at a wall and hold <kbd>E</kbd> to dig out · or ride the old lift in the corner');
    this.hintT = 16;
  }

  // ------------------------------------------------------------ the lift
  inCage(pos = this.rig.player.pos) {
    const L = this.liftT;
    return pos.x > L.x * T + 0.12 && pos.z > L.y * T + 0.08 && pos.x < (L.x + L.w) * T && pos.z < (L.y + L.d) * T;
  }

  useLift() {
    if (this.scripted || this.riding) return;
    const here = 'home';
    this.game.audio.play('click');
    openLiftPanel(this.game, here, { title: 'The Old Lift', sub: 'A brass panel, worn smooth. Where to?', onRide: (id) => this.rideLift(id) });
  }

  /** Into the cage, the gate rattles shut, the bell, the lever, and down it goes. */
  async rideLift(id) {
    if (this.riding) return;
    this.riding = true;
    this.build?.toggle(false);
    this.beginScript();
    const L = this.liftT, a = this.game.audio;
    const cx = (L.x + 1.05) * T, cz = (L.y + 1.1) * T;
    if (!this.inCage()) {
      const fx = (L.x + 1.05) * T, fz = (L.y - 0.35) * T;
      if (Math.hypot(this.cam.x - fx, this.cam.z - fz) > 0.2 && this.cam.z < L.y * T) await this.walkCam(fx, fz, 2);
    }
    await this.walkCam(cx, cz, 1.6);
    // turn round to face out through the gate
    const yw0 = this.cam.yaw, dyw = Math.atan2(Math.sin(-yw0), Math.cos(-yw0));
    await this.tween(0.45, (k) => { this.cam.yaw = yw0 + dyw * k * k * (3 - 2 * k); });
    a.play('gate', { vol: 0.7 });
    await this.tween(0.55, (k) => this.lift.setGate(k * k * (3 - 2 * k)));
    this.gateShut = true;
    a.play('clunk', { vol: 0.6 });
    this.rig.shake(0.15);
    await this.sleepFor(0.15);
    a.play('bell', { vol: 0.6 });
    this.rig.vm?.impact('none', 0.6);
    await this.sleepFor(0.35);
    // down: a jolt, a rattle, the drum turning
    const loop = a.loop?.('elevator', { vol: 0.4 });
    a.play('creak', { vol: 0.6 });
    this.lift.sway = 1;
    const y0 = this.cam.y;
    await this.tween(1.5, (k) => {
      const e = k < 0.15 ? (k / 0.15) ** 2 * 0.08 : 0.08 + (k - 0.15) / 0.85 * 0.92;
      const dy = e * 1.3;
      this.lift.setCage(-dy / T);
      this.lift.spin = -dy / T * 2.2;
      this.cam.y = y0 - dy;
      if (k < 0.2) this.rig.shake(0.18);
      this.moveLiftLight();
    });
    loop?.stop?.(0.4);
    rideTo(this.game, id);
  }

  moveLiftLight() {
    const p = this.lift.lanternPos(_v).multiplyScalar(T);
    this.liftLight.y = p.y;
    for (const e of this.liftLight.extras) e.y = p.y;
  }

  /** Coming up from the mine: the cage rises into the room, the gate folds back, step out. */
  async arriveByLift() {
    this.beginScript();
    const a = this.game.audio;
    this.lift.setGate(1);
    this.gateShut = true;
    this.rebuildCollision();
    const y0 = this.cam.y, dy0 = 1.1;
    this.lift.setCage(-dy0 / T);
    this.cam.y = y0 - dy0;
    this.cam.yaw = 0;
    this.cam.pitch = -0.05;
    const loop = a.loop?.('elevator', { vol: 0.35 });
    this.lift.sway = 1;
    await this.tween(1.3, (k) => {
      const e = 1 - (1 - k) ** 2;
      const dy = dy0 * (1 - e);
      this.lift.setCage(-dy / T);
      this.lift.spin = -dy / T * 2.2;
      this.cam.y = y0 - dy;
      this.moveLiftLight();
    });
    loop?.stop?.(0.3);
    this.lift.sway = 0;
    this.lift.setCage(0);
    this.moveLiftLight();
    this.cam.y = y0;
    a.play('clunk', { vol: 0.7 });
    a.play('bell', { vol: 0.5 });
    this.rig.shake(0.25);
    await this.sleepFor(0.3);
    a.play('gate', { vol: 0.7 });
    await this.tween(0.5, (k) => this.lift.setGate(1 - k * k * (3 - 2 * k)));
    this.gateShut = false;
    this.rebuildCollision();
    const L = this.liftT;
    await this.walkCam((L.x + 1.05) * T, (L.y - 0.45) * T, 1.5, 0);
    this.endScript();
  }
}
