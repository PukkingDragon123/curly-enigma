// The mole's scripted moves at home (mixed into HomeScene): the old cage lift (up to the portal,
// into the cage, the gate rattles shut, the bell, the lever, down into the dark; rising back up
// into the cave), and the old passage to Deep Town (through its door once the way is found, caved
// in until then). There is no digging out of the home: the lift is the way down.
import * as THREE from 'three';
import { openLiftPanel, rideTo } from '../fps/lifts.js';
import { T, HALL, SHAFT } from './units.js';
import { LIFT } from './lift.js';

const _v = new THREE.Vector3();
const ease = (k) => k * k * (3 - 2 * k);

export class HomeMoves {
  // ------------------------------------------------------------ the old passage
  async leave() {
    if (this.scripted) return;
    this.beginScript();
    const P = this.cave.passage;
    this.game.audio.play('door');
    await this.walkCam(P.x, P.z + 0.55, 1.8, 0);
    const leaf = this.cave.doorLeaf;
    this.tween(0.5, (k) => { if (leaf) leaf.rotation.y = -k * 1.3; });
    this.game.goto('town', { from: 'home' }, { transition: 'iris', dur: 0.6 });
  }

  blockedDoor() {
    const P = this.cave.passage;
    this.game.audio.play('debris', { vol: 0.5 });
    this.rig.shake(0.12);
    this.fx.dust(P.x, HALL.y + 0.7, P.z + 0.4, 8, [0.45, 0.34, 0.24], 0.2);
    this.fx.grain?.(P.x, HALL.y + 1.0, P.z + 0.3, [0.4, 0.3, 0.2]);
    this.think('Caved in solid. Deep Town\'s up there somewhere… I\'ll have to find the way round, down in the mine.');
    const star = this.star;
    if (star && !star.scripted && star.mode !== 'sleep' && this.lessonStage?.() === 'done') this.later(1.2, () => star.say('Came down the year the old shaft closed. Take the lift: the town gate\'s down in the mine somewhere. Find it from below and we\'ll have a road again.', { mood: 'worried' }));
  }

  // ------------------------------------------------------------ the lift
  inCage(pos = this.rig.player.pos) {
    return pos.x > SHAFT.x0 + 0.02 && pos.x < SHAFT.x1 && pos.z > SHAFT.z0 && pos.z < SHAFT.z1;
  }

  /** E at the lift: during the mining lesson straight down to his dig; otherwise the brass panel of destinations. */
  useLift() {
    if (this.scripted || this.riding) return null;
    const a = this.game.audio;
    if (!this.inCage()) {
      a.play('clunk', { vol: 0.5 });
      this.tween(0.3, (k) => this.lift.setLever(Math.sin(k * Math.PI)));
    } else a.play('click');
    if (this.lessonStage?.() === 'mine') { this.rideLift('L0'); return 'L0'; }
    return openLiftPanel(this.game, 'home', { title: 'The Old Lift', sub: 'A brass panel, worn smooth by sixty years of paws. Where to?', onRide: (id) => this.rideLift(id) });
  }

  /** Into the cage, the gate rattles shut, the bell, the lever, and down it goes. */
  async rideLift(id) {
    if (this.riding) return;
    this.riding = true;
    this.build?.toggle(false);
    this.beginScript();
    const a = this.game.audio;
    const lesson = this.lessonStage?.() === 'mine' && id === 'L0';
    if (lesson) this.onLessonRide?.();
    if (!this.inCage()) {
      const d = Math.hypot(this.cam.x - LIFT.outX, this.cam.z - LIFT.cz);
      if (d > 0.2) await this.walkCam(LIFT.outX, LIFT.cz, 2.2);
    }
    await this.walkCam(LIFT.cx, LIFT.cz, 1.6);
    // turn round to face out through the gate (west, into the cave)
    const yw0 = this.cam.yaw, dyw = Math.atan2(Math.sin(Math.PI / 2 - yw0), Math.cos(Math.PI / 2 - yw0));
    await this.tween(0.45, (k) => { this.cam.yaw = yw0 + dyw * ease(k); this.cam.pitch += (-0.05 - this.cam.pitch) * 0.2; });
    a.play('gate', { vol: 0.7 });
    await this.tween(0.55, (k) => this.lift.setGate(ease(k)));
    this.gateShut = true;
    a.play('clunk', { vol: 0.6 });
    this.rig.shake(0.15);
    await this.sleepFor(0.15);
    a.play('bell', { vol: 0.6 });
    this.rig.vm?.impact('none', 0.6);
    await this.tween(0.3, (k) => this.lift.setLever(ease(k)));
    await this.sleepFor(0.15);
    // down: a jolt, a rattle, the sheave turning
    const loop = a.loop?.('elevator', { vol: 0.4 });
    a.play('creak', { vol: 0.6 });
    this.lift.sway = 1;
    const y0 = this.cam.y;
    await this.tween(1.6, (k) => {
      const e = k < 0.15 ? (k / 0.15) ** 2 * 0.08 : 0.08 + (k - 0.15) / 0.85 * 0.92;
      const dy = e * 1.4;
      this.lift.setCage(-dy / T);
      this.lift.spin = dy * 9;
      this.cam.y = y0 - dy;
      if (k < 0.2) this.rig.shake(0.18);
      this.moveLiftLight();
    });
    loop?.stop?.(0.4);
    if (lesson) {
      a.play('creak', { vol: 0.6 });
      a.play('rumble_hit', { vol: 0.35 });
      this.game.goto('deep', { from: 'lift', lift: 'L0', lesson: 'mine' }, { transition: 'fade', dur: 0.8, color: 0x0a0605 });
    } else rideTo(this.game, id);
  }

  moveLiftLight() {
    const L = this.liftLight;
    if (!L) return;
    const p = this.lift.lanternPos(_v).multiplyScalar(T);
    L.y = p.y;
    for (const e of L.extras || []) e.y = p.y;
  }

  /** Coming up from the mine: the cage rises into its portal, the gate folds back, step out into the cave. */
  async arriveByLift() {
    this.beginScript();
    const a = this.game.audio;
    this.lift.setGate(1);
    this.gateShut = true;
    this.lift.setLever(1);
    this.rebuildCollision();
    const eye = this.rig.player.eyeY, dy0 = 1.2;
    const y0 = HALL.y + eye;
    this.cam.x = LIFT.cx;
    this.cam.z = LIFT.cz;
    this.cam.y = y0 - dy0;
    this.cam.yaw = Math.PI / 2;
    this.cam.pitch = -0.04;
    this.lift.setCage(-dy0 / T);
    const loop = a.loop?.('elevator', { vol: 0.35 });
    this.lift.sway = 1;
    await this.tween(1.4, (k) => {
      const e = 1 - (1 - k) ** 2;
      const dy = dy0 * (1 - e);
      this.lift.setCage(-dy / T);
      this.lift.spin = dy * 9;
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
    await this.tween(0.3, (k) => this.lift.setLever(1 - ease(k)));
    a.play('gate', { vol: 0.7 });
    await this.tween(0.5, (k) => this.lift.setGate(1 - ease(k)));
    this.gateShut = false;
    this.rebuildCollision();
    await this.walkCam(LIFT.outX - 0.15, LIFT.cz, 1.5, Math.PI / 2);
    this.endScript();
    if (this.lessonStage?.() === 'done') this.later(0.4, () => this.greet?.());
    else this.onLessonArrival?.('lift');
  }
}
