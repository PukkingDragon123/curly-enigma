// The mole's scripted moves at home (mixed into HomeScene): the old cage lift in the hall (up to
// the portal, into the cage, the gate rattles shut, the bell, the lever, down into the dark; rising
// back up into the hall), and the front door to Deep Town (through it once the way is found, caved
// in until then). There is no digging out of the home: the lift is the way down. The first ride
// down (the mining lesson) is a cutscene of its own (lessonDrop: the lurch, the guttering lantern,
// the long drop into the dark; a hold skips it).
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
    this.think('The door opens on a wall of rubble. Deep Town\'s up there somewhere… I\'ll have to find the way round, down in the mine.');
    const star = this.star;
    if (star && !star.scripted && star.mode !== 'sleep' && this.lessonStage?.() === 'done') this.later(1.2, () => star.say('Came down the year the old passage fell in. Take the lift: the town gate\'s down in the mine somewhere. Find it from below and we\'ll have a road again.', { mood: 'worried' }));
  }

  // ------------------------------------------------------------ the lift
  inCage(pos = this.rig.player.pos) {
    return pos.x > SHAFT.x0 + 0.02 && pos.x < SHAFT.x1 && pos.z > SHAFT.z0 && pos.z < SHAFT.z1;
  }

  /** The cage goes straight to his practice dig: the mining lesson is on and not done yet down there. */
  lessonRide() { return this.lessonStage?.() === 'mine' && !this.game.state.flag('prologue'); }

  /** E at the lift: during the mining lesson straight down to his dig; otherwise the brass panel of destinations. */
  useLift() {
    if (this.scripted || this.riding) return null;
    const a = this.game.audio;
    if (!this.inCage()) {
      a.play('clunk', { vol: 0.5 });
      this.tween(0.3, (k) => this.lift.setLever(Math.sin(k * Math.PI)));
    } else a.play('click');
    if (this.lessonRide()) { this.rideLift('L0'); return 'L0'; }
    return openLiftPanel(this.game, 'home', { title: 'The Old Lift', sub: 'A brass panel, worn smooth by sixty years of paws. Where to?', onRide: (id) => this.rideLift(id) });
  }

  /** Into the cage, the gate rattles shut, the bell, the lever, and down it goes. */
  async rideLift(id) {
    if (this.riding) return;
    this.riding = true;
    this.build?.toggle(false);
    this.beginScript();
    const a = this.game.audio;
    const lesson = this.lessonRide() && id === 'L0';
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
    if (lesson) this.game.ui.onboard?.cinema(true); // the first ride down is a cutscene (lessonDrop)
    await this.tween(0.55, (k) => this.lift.setGate(ease(k)));
    this.gateShut = true;
    a.play('clunk', { vol: 0.6 });
    this.rig.shake(0.15);
    await this.sleepFor(0.15);
    a.play('bell', { vol: 0.6 });
    this.rig.vm?.impact('none', 0.6);
    await this.tween(0.3, (k) => this.lift.setLever(ease(k)));
    await this.sleepFor(0.15);
    if (lesson) { await this.lessonDrop(); return; }
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
    rideTo(this.game, id);
  }

  /**
   * The first ride down (the mining lesson), as a cutscene: the bars, a lurch as the old brake lets
   * go (the cage drops a hand's width and catches, the lantern gutters, grit sifts down from the
   * shaft), a moment hanging there creaking, then down into the dark faster and faster, the lantern
   * flickering, and black. A hold skips straight to the mine.
   */
  async lessonDrop() {
    const a = this.game.audio, ob = this.game.ui.onboard, L = this.liftLight, c = this.cam;
    const I0 = L ? L.intensity : 0;
    const flick = (k) => { if (L) L.intensity = I0 * k; };
    const y0 = c.y;
    const loop = a.loop?.('elevator', { vol: 0.25 });
    let cut = false, gone = false;
    const go = () => {
      if (gone) return;
      gone = true;
      loop?.stop?.(0.3);
      if (L) L.intensity = I0;
      a.play('rumble_hit', { vol: 0.35 });
      this.game.goto('deep', { from: 'lift', lift: 'L0', lesson: 'mine' }, { transition: 'fade', dur: 0.8, color: 0x0a0605 });
    };
    ob?.cinema(true, { skip: () => { cut = true; go(); } });
    const grit = (n) => { for (let i = 0; i < n; i++) this.fx.dust?.(c.x + (Math.random() - 0.5) * 0.5, c.y + 0.7, c.z + (Math.random() - 0.5) * 0.5, 2, [0.42, 0.33, 0.25], 0.12); this.fx.grain?.(c.x, c.y + 0.8, c.z, [0.4, 0.3, 0.2]); };
    // the brake lets go: a lurch, the chain bangs taut
    a.play('creak', { vol: 0.8 });
    this.lift.sway = 1;
    await this.tween(0.16, (k) => { const dy = 0.16 * k * k; this.lift.setCage(-dy / T); c.y = y0 - dy; this.moveLiftLight(); });
    if (cut) return;
    a.play('clunk', { vol: 0.9 });
    a.play('rumble_hit', { vol: 0.5 });
    a.play('debris', { vol: 0.45 });
    this.rig.shake(0.6);
    this.rig.vm?.impact?.('none', 0.8);
    c.pitch -= 0.06;
    grit(5);
    // the lantern gutters... and catches
    await this.tween(0.75, (k) => { flick(k < 0.12 ? 0.15 : k < 0.22 ? 0.9 : k < 0.3 ? 0.05 : k < 0.62 ? 0.25 + Math.random() * 0.2 : 0.4 + 0.6 * ((k - 0.62) / 0.38)); c.pitch += (-0.02 - c.pitch) * 0.06; });
    if (cut) return;
    // hanging there, creaking, looking up the shaft at the chain
    a.play('creak', { vol: 0.5, pitch: 0.8 });
    const p0 = c.pitch;
    await this.tween(0.9, (k) => { c.pitch = p0 + (0.32 - p0) * ease(k); flick(0.85 + Math.sin(k * 40) * 0.1); });
    if (cut) return;
    // and down, faster and faster, into the dark
    a.play('creak', { vol: 0.7 });
    a.play('whoosh', { vol: 0.4, pitch: 0.6 });
    loop?.set?.({ vol: 0.5 });
    const y1 = c.y, p1 = c.pitch;
    await this.tween(2.2, (k) => {
      const dy = 2.6 * k * k;
      this.lift.setCage(-(dy + 0.16) / T);
      this.lift.spin = dy * 9;
      c.y = y1 - dy;
      c.pitch = p1 + (-0.12 - p1) * ease(Math.min(1, k * 1.6));
      this.rig.shake(0.08 + k * 0.22);
      flick(Math.random() < 0.12 * k ? 0.1 : 1 - k * 0.5);
      if (Math.random() < 0.08) grit(1);
      this.post.fade = Math.max(0, (k - 0.55) / 0.45) * 0.85;
      this.moveLiftLight();
    });
    if (cut) return;
    go();
  }

  moveLiftLight() {
    const L = this.liftLight;
    if (!L) return;
    const p = this.lift.lanternPos(_v).multiplyScalar(T);
    L.y = p.y;
    for (const e of L.extras || []) e.y = p.y;
  }

  /** Coming up from the mine: the cage rises into its portal, the gate folds back, step out into the hall. */
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
    // (cut short when the script is ended from outside, e.g. a test standing you somewhere: the lift just arrives)
    const cut = () => {
      if (this.cam) return false;
      loop?.stop?.(0.1);
      this.lift.sway = 0; this.lift.spin = 0; this.lift.setCage(0); this.lift.setLever(0); this.lift.setGate(0);
      this.gateShut = false;
      this.moveLiftLight();
      this.rebuildCollision();
      return true;
    };
    await this.tween(1.4, (k) => {
      const e = 1 - (1 - k) ** 2;
      const dy = dy0 * (1 - e);
      this.lift.setCage(-dy / T);
      this.lift.spin = dy * 9;
      if (this.cam) this.cam.y = y0 - dy;
      this.moveLiftLight();
    });
    if (cut()) return;
    loop?.stop?.(0.3);
    this.lift.sway = 0;
    this.lift.setCage(0);
    this.moveLiftLight();
    this.cam.y = y0;
    a.play('clunk', { vol: 0.7 });
    a.play('bell', { vol: 0.5 });
    this.rig.shake(0.25);
    await this.tween(0.3, (k) => this.lift.setLever(1 - ease(k)));
    if (cut()) return;
    a.play('gate', { vol: 0.7 });
    await this.tween(0.5, (k) => this.lift.setGate(1 - ease(k)));
    if (cut()) return;
    this.gateShut = false;
    this.rebuildCollision();
    await this.walkCam(LIFT.outX - 0.15, LIFT.cz, 1.5, Math.PI / 2);
    if (cut()) return;
    this.endScript();
    if (this.lessonStage?.() === 'done') this.later(0.4, () => this.greet?.());
    else this.onLessonArrival?.('lift');
  }
}
