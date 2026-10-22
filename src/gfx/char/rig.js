// The character animation rig: procedural poses for every state, plus secondary motion
// (breathing belly, squash on landing, ear/tail springs, whisker twitches) and a face that
// blinks with lids and changes expression for emotes, talking, laughing, hurting and sneezing.
// It only moves plain Object3D groups; the skinned mesh follows them (see skin.js). Face
// variants are part bones whose .visible drives their scale.
//
// Expressions (expr.js): rig.setExpression(name, { hold, body }), rig.setMood(name),
// rig.expression / rig.mood, rig.talk(on | seconds), rig.lookAt(worldVector3 | Object3D | null),
// rig.blink(). The tall build adds elbows and knees (rig.elbowL/R, rig.kneeL/R): the base poses
// bend them and the legs follow the hips; classic rigs (no joints) move exactly as before.
import * as THREE from 'three';
import { lerp } from '../../core/util.js';
import { mergeSkinned, rebindDispose } from './skin.js';
import { EXPR, exprName, MOUTH_FALLBACK, BLINKS, gesture } from './expr.js';

const GROUNDED = new Set(['idle', 'walk', 'run', 'carry', 'talk']);
/** States the expression gestures play over (sitting: arms and head only). */
const GESTURE = new Set(['idle', 'talk', 'sit']);
const _lv = new THREE.Vector3();

export class CharacterRig {
  constructor(parts) {
    Object.assign(this, parts);
    this.state = 'idle';
    this.speed = 1;
    this.t = Math.random() * 10;
    this.blinkT = 2 + Math.random() * 3;
    this.blinkK = -1;
    this.talkT = 0;
    this.emoteT = 0;
    this.emote = null;
    this.facing = 0;
    this.targetFacing = 0;
    this.lean = 0;
    this.swingPhase = 0;
    this.hold = null;
    this.baseHunch = parts.p.hunch || 0;
    this.squash = 0;
    this.earA = 0;
    this.earV = 0;
    this.tailA = 0;
    this.tailV = 0;
    this.prevHipY = null;
    this.prevVy = 0;
    this.prevFacing = 0;
    this.whiskT = 1 + Math.random() * 3;
    this.whiskK = 0;
    this.twitchT = 3 + Math.random() * 5;
    this.twitchK = 0;
    this.twitchSide = 1;
    this.expr = 'neutral';
    // expressions
    this.mood = 'neutral';
    this.held = null;
    this.heldT = 0;
    this.exprCur = 'neutral';
    this.exprT = 9;
    this.exprBody = true;
    this.gestW = 0;
    this.gestE = 'neutral';
    this.browCur = [0, 0, 0, 0];
    this.talkOn = false;
    this.lookTarget = null;
    this.lookYawC = 0;
    this.lookPitchC = 0;
    this.yawnT = 6 + Math.random() * 6;
    this.yawnK = 0;
    this.fxT = 0;
  }

  // ------------------------------------------------------------------ expressions
  /**
   * Show an expression: neutral happy laugh sad angry surprised worried smug sleepy thinking
   * (and stern; aliases in expr.js). o.hold: seconds, then back to the mood; without it the
   * expression becomes the mood. o.body: false = face only (no gesture).
   */
  setExpression(name, o = {}) {
    const n = exprName(name);
    if (o.hold != null && isFinite(o.hold)) { this.held = n; this.heldT = Math.max(0.05, o.hold); }
    else { this.mood = n; this.held = null; this.heldT = 0; }
    this.exprBody = o.body !== false;
    this.exprSeq = (this.exprSeq || 0) + 1; // the same face again still starts over (a new start, hop or sigh)
    return this;
  }

  /** The resting expression (what the face goes back to). */
  setMood(name) { this.mood = exprName(name); return this; }

  /** The expression showing now (held or the mood). */
  get expression() { return this.held || this.mood; }

  /** Blink now. */
  blink() { if (this.blinkK < 0) { this.blinkK = 0; this.blinkT = 0; } return this; }

  /** Turn the head toward a world point (Vector3) or follow an Object3D; null lets go. */
  lookAt(target) { this.lookTarget = target || null; return this; }

  /** States: idle walk run jump fall climb dig swing chisel brush drill wave talk cheer sit sleep laugh sneeze hammer swim carry sad hurt peck */
  play(state, speed = 1) {
    if (this.state !== state) {
      if ((this.state === 'fall' || this.state === 'jump') && GROUNDED.has(state)) this.squash = 1;
      this.state = state;
      this.stateT = 0;
    }
    this.speed = speed;
  }

  /** Emotes: nod shake hop wave, plus face-only happy sad surprise angry. */
  doEmote(kind, dur = 1.2) { this.emote = kind; this.emoteT = dur; }

  /** talk(true) talks until talk(false); talk(seconds) for a while (old API); talk() for 1.5 s. */
  talk(on = 1.5) {
    if (on === true) { this.talkOn = true; }
    else if (on === false || on === null) { this.talkOn = false; this.talkT = 0; }
    else this.talkT = +on || 0;
    return this;
  }

  get talking() { return this.talkOn || this.talkT > 0 || this.state === 'talk'; }

  /** Face a yaw angle (radians, 0 = +z toward camera). */
  face(yaw, instant = false) {
    this.targetFacing = yaw;
    if (instant) { this.facing = yaw; this.prevFacing = yaw; }
  }

  /** Put an object in one paw (replacing only what that paw held). */
  holdItem(obj, hand = 'R') {
    this.holds = this.holds || { L: null, R: null };
    const h = hand === 'R' ? this.handR : this.handL;
    const prev = this.holds[hand];
    if (prev && prev.parent) prev.parent.remove(prev);
    this.holds[hand] = obj || null;
    if (hand === 'R') this.hold = obj || null;
    if (obj) h.add(obj);
  }

  update(dt) {
    this.t += dt * this.speed;
    this.stateT = (this.stateT || 0) + dt;
    const t = this.t;
    const { hip, neck, armL, armR, legL, legR, tail } = this;
    // smooth facing
    let d = this.targetFacing - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * 14);
    this.root.rotation.y = this.facing;

    // reset pose
    const s = this.s;
    hip.position.set(0, this.p.lh * s + s * 0.5, 0);
    hip.rotation.set(this.baseHunch, 0, 0);
    hip.scale.set(1, 1, 1);
    neck.rotation.set(-this.baseHunch * 0.8, 0, 0);
    armL.rotation.set(0, 0, 0.12);
    armR.rotation.set(0, 0, -0.12);
    legL.rotation.set(0, 0, 0);
    legR.rotation.set(0, 0, 0);
    const { elbowL, elbowR, kneeL, kneeR } = this;
    const jointed = !!kneeL;
    if (jointed) {
      elbowL.rotation.set(-0.14, 0, 0);
      elbowR.rotation.set(-0.14, 0, 0);
      kneeL.rotation.set(0, 0, 0);
      kneeR.rotation.set(0, 0, 0);
      armL.rotation.z = 0.04;
      armR.rotation.z = -0.04;
    }
    const breathe = Math.sin(t * 2.2);

    switch (this.state) {
      case 'walk': case 'run': {
        const f = this.state === 'run' ? 14 : 9;
        const a = this.state === 'run' ? 0.9 : 0.6;
        const w = Math.sin(t * f);
        legL.rotation.x = w * a;
        legR.rotation.x = -w * a;
        armL.rotation.x = -w * a * 0.9;
        armR.rotation.x = w * a * 0.9;
        hip.position.y += Math.abs(Math.cos(t * f)) * s * (this.state === 'run' ? 1.6 : 1);
        hip.rotation.x += this.state === 'run' ? 0.18 : 0.06;
        hip.rotation.z = w * 0.05;
        neck.rotation.z = -w * 0.04;
        if (jointed) {
          // knees bend as each leg swings through, elbows stay soft (tucked in when running)
          const kA = this.state === 'run' ? 1.5 : 0.75;
          kneeL.rotation.x = Math.max(0, Math.sin(t * f + 0.9)) ** 1.5 * kA;
          kneeR.rotation.x = Math.max(0, Math.sin(t * f + 0.9 + Math.PI)) ** 1.5 * kA;
          const eA = this.state === 'run' ? -1.25 : -0.35;
          elbowL.rotation.x = eA + w * 0.15;
          elbowR.rotation.x = eA - w * 0.15;
        }
        break;
      }
      case 'jump': case 'fall': {
        armL.rotation.set(-2.4, 0, 0.5);
        armR.rotation.set(-2.4, 0, -0.5);
        legL.rotation.x = this.state === 'jump' ? -0.6 : 0.3;
        legR.rotation.x = this.state === 'jump' ? 0.4 : -0.3;
        if (jointed) { kneeL.rotation.x = this.state === 'jump' ? 1.0 : 0.35; kneeR.rotation.x = this.state === 'jump' ? 0.3 : 0.6; elbowL.rotation.x = elbowR.rotation.x = -0.4; }
        // stretch a little while airborne
        hip.scale.set(0.96, 1.05, 0.96);
        break;
      }
      case 'climb': {
        const w = Math.sin(t * 10);
        armL.rotation.set(-2.6 + w * 0.5, 0, 0.2);
        armR.rotation.set(-2.6 - w * 0.5, 0, -0.2);
        legL.rotation.x = -0.4 + w * 0.4;
        legR.rotation.x = -0.4 - w * 0.4;
        hip.rotation.x = -0.15;
        if (jointed) { kneeL.rotation.x = 0.6 - w * 0.5; kneeR.rotation.x = 0.6 + w * 0.5; }
        break;
      }
      case 'swim': {
        const w = Math.sin(t * 6);
        armL.rotation.set(-1.5 + w * 0.8, 0, 0.6);
        armR.rotation.set(-1.5 - w * 0.8, 0, -0.6);
        legL.rotation.x = w * 0.6;
        legR.rotation.x = -w * 0.6;
        hip.rotation.x = 0.4;
        break;
      }
      case 'swing': case 'hammer': {
        // pickaxe/hammer strike: phase 0 = windup, 1 = impact
        const ph = this.swingPhase;
        const k = ph < 0.55 ? ph / 0.55 : 1 - (ph - 0.55) / 0.45;
        armR.rotation.x = lerp(0.2, -2.6, k);
        armL.rotation.x = lerp(0.1, -2.2, k) * 0.9;
        armL.rotation.z = 0.3;
        hip.rotation.x += lerp(0.25, -0.15, k);
        neck.rotation.x += lerp(0.15, -0.1, k);
        if (jointed) { elbowR.rotation.x = lerp(-0.6, -0.15, k); elbowL.rotation.x = lerp(-0.9, -0.3, k); kneeL.rotation.x = kneeR.rotation.x = 0.18; }
        break;
      }
      case 'dig': case 'chisel': case 'brush': case 'drill': {
        const sp = this.state === 'brush' ? 14 : this.state === 'drill' ? 40 : this.state === 'chisel' ? 18 : 12;
        const w = Math.sin(t * sp);
        const amp = this.state === 'drill' ? 0.05 : this.state === 'brush' ? 0.35 : 0.45;
        armR.rotation.x = -1.4 + w * amp;
        armL.rotation.x = -1.3 - w * amp * (this.state === 'dig' ? 1 : 0.3);
        armR.rotation.z = this.state === 'brush' ? w * 0.3 - 0.1 : -0.1;
        hip.rotation.x += 0.2;
        if (this.state === 'drill') hip.position.x = Math.sin(t * 60) * s * 0.4;
        if (jointed) { elbowR.rotation.x = -0.55 + w * amp * 0.5; elbowL.rotation.x = -0.6; kneeL.rotation.x = kneeR.rotation.x = 0.25; }
        break;
      }
      case 'wave': {
        if (jointed) { armR.rotation.set(-2.3, 0, 0.35); elbowR.rotation.set(-0.5, 0, Math.sin(t * 10) * 0.7); }
        else armR.rotation.set(-2.7, 0, -0.3 + Math.sin(t * 10) * 0.5);
        neck.rotation.z = Math.sin(t * 5) * 0.08;
        break;
      }
      case 'cheer': {
        armL.rotation.set(-2.9, 0, 0.4 + Math.sin(t * 12) * 0.2);
        armR.rotation.set(-2.9, 0, -0.4 - Math.sin(t * 12) * 0.2);
        hip.position.y += Math.abs(Math.sin(t * 8)) * s * 4;
        if (jointed) { elbowL.rotation.x = elbowR.rotation.x = -0.25; kneeL.rotation.x = kneeR.rotation.x = Math.max(0, Math.cos(t * 16)) * 0.6; }
        break;
      }
      case 'sit': {
        legL.rotation.x = -1.45;
        legR.rotation.x = -1.45;
        hip.position.y = s * 2;
        armL.rotation.x = -0.4;
        armR.rotation.x = -0.4;
        if (jointed) {
          // shins hang over the seat edge; with rig.seatY (seat height in rig units) the feet
          // reach for the floor instead of going through it
          const shin = this.shinLen || s * 4;
          const drop = this.seatY != null ? this.seatY + s * 2.5 : 0; // no seat height: sitting on the ground, legs out
          kneeL.rotation.x = kneeR.rotation.x = drop >= shin ? 1.45 : drop < s ? 0.12 : Math.asin(Math.max(0.15, drop / shin)) * 0.95;
          legL.rotation.x += Math.sin(t * 1.3) * 0.03; legR.rotation.x -= Math.sin(t * 1.3) * 0.03;
          elbowL.rotation.x = elbowR.rotation.x = -0.9;
          armL.rotation.x = armR.rotation.x = -0.25;
        }
        break;
      }
      case 'sleep': {
        hip.rotation.x = 0.1;
        neck.rotation.x = 0.35 + breathe * 0.03;
        neck.rotation.z = 0.2;
        armL.rotation.x = -0.6;
        armR.rotation.x = -0.6;
        if (jointed) { elbowL.rotation.x = elbowR.rotation.x = -1.1; armL.rotation.z = 0.25; armR.rotation.z = -0.25; }
        break;
      }
      case 'laugh': {
        hip.rotation.x += -0.2 + Math.sin(t * 25) * 0.05;
        neck.rotation.x = -0.3;
        armL.rotation.set(-0.6, 0, 0.6);
        armR.rotation.set(-0.6, 0, -0.6);
        hip.position.y += Math.abs(Math.sin(t * 16)) * s;
        if (jointed) { armL.rotation.z = 0.3; armR.rotation.z = -0.3; elbowL.rotation.x = elbowR.rotation.x = -1.0; }
        break;
      }
      case 'sad': {
        neck.rotation.x = 0.45;
        hip.rotation.x += 0.15;
        armL.rotation.z = 0.05;
        armR.rotation.z = -0.05;
        break;
      }
      case 'carry': {
        armL.rotation.set(-1.3, 0, 0.1);
        armR.rotation.set(-1.3, 0, -0.1);
        if (jointed) { armL.rotation.x = armR.rotation.x = -0.75; elbowL.rotation.x = elbowR.rotation.x = -0.75; }
        break;
      }
      case 'peck': {
        hip.rotation.x = 0.35 + Math.max(0, Math.sin(t * 9)) * 0.3;
        break;
      }
      case 'hurt': {
        hip.rotation.x = -0.3;
        neck.rotation.x = -0.25;
        armL.rotation.set(-0.8, 0, 0.9);
        armR.rotation.set(-0.8, 0, -0.9);
        if (jointed) { elbowL.rotation.x = elbowR.rotation.x = -1.2; kneeL.rotation.x = kneeR.rotation.x = 0.3; }
        break;
      }
      case 'sneeze': {
        const k = this.stateT < 0.5 ? this.stateT / 0.5 : Math.max(0, 1 - (this.stateT - 0.5) * 6);
        neck.rotation.x = this.stateT < 0.5 ? -0.5 * k : 0.5 * k;
        hip.rotation.x += this.stateT < 0.5 ? -0.2 * k : 0.25 * k;
        break;
      }
      default: { // idle
        hip.position.y += breathe * s * 0.25;
        armL.rotation.x = Math.sin(t * 1.3) * 0.05;
        armR.rotation.x = -Math.sin(t * 1.3) * 0.05;
        neck.rotation.z = Math.sin(t * 0.7) * 0.05;
        neck.rotation.x += Math.sin(t * 0.9) * 0.03;
        if (jointed) {
          // a slow shift of weight from foot to foot
          const sway = Math.sin(t * 0.55);
          hip.position.x += sway * s * 0.35;
          hip.rotation.z += sway * 0.025;
          kneeL.rotation.x = Math.max(0, sway) * 0.12;
          kneeR.rotation.x = Math.max(0, -sway) * 0.12;
        }
      }
    }

    // expressions: the held one runs out back to the mood; the body gesture eases in and out
    if (this.held) { this.heldT -= dt; if (this.heldT <= 0) this.held = null; }
    const ex = this.held || this.mood;
    if (ex !== this.exprCur || (this.held && this.exprSeq !== this.exprSeen)) {
      this.exprSeen = this.exprSeq;
      this.exprCur = ex;
      this.expr = ex;
      this.exprT = 0;
      if (this.blinkK < 0 && EXPR[ex] && !EXPR[ex].noBlink) this.blinkK = 0.02; // a blink as the face changes
    }
    this.exprT += dt;
    const wantG = this.exprBody && GESTURE.has(this.state) && ex !== 'neutral' ? 1 : 0;
    if (wantG && this.gestE !== ex) { if (this.gestW < 0.05) this.gestE = ex; else this.gestW = Math.max(0, this.gestW - dt * 5); }
    else this.gestW += ((wantG ? 1 : 0) - this.gestW) * Math.min(1, dt * 6);
    if (this.gestW > 0.001) gesture(this, this.gestE, this.gestW, this.exprT, this.state === 'sit');
    // talking: beats of the paw on stressed syllables, a nod of the head
    if (this.talking && GESTURE.has(this.state) && this.state !== 'sit') {
      const beat = Math.max(0, Math.sin(t * 3.1) * Math.sin(t * 1.7 + 1));
      if (jointed && (this.gestW < 0.3 || ex === 'happy' || ex === 'sad' || ex === 'stern' || ex === 'neutral' || ex === 'sleepy')) {
        armR.rotation.x -= beat * 0.45; elbowR.rotation.x -= beat * 0.9;
      }
    }
    // look at something: the head turns (and the shoulders a little), smoothly
    let ly = 0, lp = 0;
    const tg = this.lookTarget;
    if (tg && this.state !== 'sleep') {
      if (tg.isObject3D) tg.getWorldPosition(_lv); else _lv.copy(tg);
      this.root.worldToLocal(_lv);
      const ny = hip.position.y + neck.position.y + (this.anchors?.eyes?.y ?? s * 6);
      const hd = Math.hypot(_lv.x, _lv.z);
      let yaw = Math.atan2(_lv.x, _lv.z);
      const far = Math.abs(yaw) > 2.2; // right behind: don't wring the neck
      if (!far && hd > 1e-4) {
        yaw = Math.max(-1.15, Math.min(1.15, yaw));
        ly = yaw;
        lp = Math.max(-0.45, Math.min(0.55, Math.atan2(_lv.y - ny, hd)));
      }
    }
    const kl = 1 - Math.exp(-dt * 7);
    this.lookYawC += (ly - this.lookYawC) * kl;
    this.lookPitchC += (lp - this.lookPitchC) * kl;
    if (Math.abs(this.lookYawC) > 1e-3 || Math.abs(this.lookPitchC) > 1e-3) {
      neck.rotation.y += this.lookYawC * 0.82;
      hip.rotation.y += this.lookYawC * 0.18;
      neck.rotation.x -= this.lookPitchC * 0.75;
    }

    // emote overlays
    if (this.emoteT > 0) {
      this.emoteT -= dt;
      if (this.emote === 'nod') neck.rotation.x += Math.sin(this.emoteT * 18) * 0.2;
      if (this.emote === 'shake') neck.rotation.y = Math.sin(this.emoteT * 18) * 0.3;
      if (this.emote === 'hop') hip.position.y += Math.abs(Math.sin(this.emoteT * 10)) * s * 3;
      if (this.emote === 'wave') armR.rotation.set(-2.7, 0, -0.3 + Math.sin(this.emoteT * 12) * 0.5);
      if (this.emoteT <= 0) this.emote = null;
    }

    // squash on landing
    if (this.squash > 0) {
      this.squash = Math.max(0, this.squash - dt * 4.5);
      const k = Math.sin(this.squash * Math.PI) * 0.16 * this.squash;
      hip.scale.set(1 + k * 0.6, 1 - k, 1 + k * 0.6);
      hip.position.y -= k * s * 2;
    }

    // grown-up legs hang from the hips (the classic stubby legs stay planted on the root)
    if (jointed) {
      const ly0 = hip.position.y + s * 0.5;
      legL.position.y = ly0; legR.position.y = ly0;
      legL.position.x = this.legX0 * -1 + hip.position.x; legR.position.x = this.legX0 + hip.position.x;
    }

    // breathing belly (bigger for chubby folk, faster when running)
    if (this.bodyMesh) {
      const rate = this.state === 'run' || this.state === 'cheer' ? 7 : this.state === 'sleep' ? 1.4 : 2.2;
      this.breathT = (this.breathT || 0) + dt * rate;
      const b = Math.sin(this.breathT) * this.breath;
      const vs = this.vs;
      this.bodyMesh.scale.set(vs * (1 + b * 0.7), vs * (1 + b * 0.35), vs * (1 + b));
    }

    this.secondary(dt);
    this.updateFace(dt);
  }

  /** Ear and tail springs driven by bobbing and turning, and whisker twitches. */
  secondary(dt) {
    const dtc = Math.min(dt, 1 / 30);
    const s = this.s;
    const hy = this.hip.position.y / s;
    if (this.prevHipY === null) this.prevHipY = hy;
    const vy = (hy - this.prevHipY) / Math.max(dtc, 1e-3);
    this.prevHipY = hy;
    const acc = (vy - this.prevVy) / Math.max(dtc, 1e-3);
    this.prevVy = vy;
    this.earV += (-90 * this.earA - 9 * this.earV + Math.max(-400, Math.min(400, acc)) * 0.0045) * dtc;
    this.earA += this.earV * dtc;
    // turning swings the tail
    let df = this.facing - this.prevFacing;
    while (df > Math.PI) df -= Math.PI * 2;
    while (df < -Math.PI) df += Math.PI * 2;
    this.prevFacing = this.facing;
    this.tailV += (-50 * this.tailA - 7 * this.tailV - (df / Math.max(dtc, 1e-3)) * 0.9) * dtc;
    this.tailA += this.tailV * dtc;
    const t = this.t;
    if (this.tail) {
      const wag = this.state === 'cheer' || this.emote === 'hop' ? Math.sin(t * 14) * 0.35 : Math.sin(t * 3) * 0.2;
      this.tail.rotation.set(-Math.abs(this.earA) * 0.6 + (this.state === 'run' ? 0.25 : 0), wag + this.tailA, 0);
    }
    // ear twitch now and then
    this.twitchT -= dt;
    if (this.twitchT < 0) { this.twitchT = 2.5 + Math.random() * 6; this.twitchK = 1; this.twitchSide = Math.random() < 0.5 ? -1 : 1; }
    if (this.twitchK > 0) this.twitchK = Math.max(0, this.twitchK - dt * 6);
    const tw = Math.sin(this.twitchK * Math.PI * 2) * 0.25 * this.twitchK;
    if (this.ears) {
      for (const e of this.ears) {
        const b = e.userData.base;
        const sway = Math.sin(t * 1.7 + e.userData.side) * 0.03;
        const ep = this.state === 'sad' ? 0.5 : (this.faceE?.ears || 0);
        this.earP = (this.earP || 0) + (ep - (this.earP || 0)) * Math.min(1, dt * 6);
        e.rotation.set(b[0] + this.earA * 1.2 + this.earP, 0, b[2] + sway + (e.userData.side === this.twitchSide ? tw * -e.userData.side : 0) + (this.earP > 0 ? -e.userData.side * this.earP * 0.6 : 0));
      }
    }
    // whiskers
    this.whiskT -= dt;
    if (this.whiskT < 0) { this.whiskT = 0.8 + Math.random() * 3.5; this.whiskK = 1; }
    if (this.whiskK > 0) this.whiskK = Math.max(0, this.whiskK - dt * 4);
    if (this.whiskers) {
      const w = Math.sin(this.whiskK * Math.PI * 3) * 0.16 * this.whiskK + (this.talkT > 0 ? Math.sin(t * 22) * 0.05 : 0);
      const droop = this.faceE?.whisk || 0;
      for (const g of this.whiskers) g.rotation.set(0, w * -g.userData.side, w * 0.6 + Math.sin(t * 2.3) * 0.03 + droop * g.userData.side);
    }
  }

  /** Pick eye, brow and mouth variants for the current state/emote/expression/talk, and blink. */
  updateFace(dt) {
    const st = this.state;
    const em = this.emoteT > 0 ? this.emote : null;
    const base = this.eyeType === 'happy' ? 'happy' : this.eyeType === 'sleepy' ? 'half' : 'open';
    // what the face is doing: a state's own face wins, then a face emote, then the expression
    let ex = this.exprCur || 'neutral';
    let eye = null, mouth = null, open = null, brow = null, custom = false;
    if (st === 'laugh' || st === 'cheer') ex = 'laugh';
    else if (st === 'hurt') { custom = true; eye = 'squeeze'; open = 'grimace'; brow = [-1, 0.32]; }
    else if (st === 'sad') ex = 'sad';
    else if (st === 'sleep') { custom = true; eye = 'shut'; mouth = this.restMouth; brow = [-0.3, -0.1]; }
    else if (st === 'sneeze') {
      custom = true;
      if (this.stateT < 0.35) { eye = 'half'; open = 'oh'; brow = [1, 0]; }
      else if (this.stateT < 0.5) { eye = 'squeeze'; open = 'oh'; }
      else { eye = 'squeeze'; open = 'laugh'; }
    } else if ((st === 'hammer' || st === 'swing' || st === 'dig' || st === 'drill' || st === 'chisel') && ex === 'neutral') {
      custom = true; eye = base === 'open' ? 'angry' : base; mouth = 'line'; brow = [-0.5, 0.16];
    }
    if (!custom) {
      if (em === 'hop' || em === 'happy') ex = 'happy';
      else if (em === 'sad') ex = 'sad';
      else if (em === 'angry') ex = 'angry';
      else if (em === 'surprise') ex = 'surprised';
      else if (em === 'shake') ex = ex === 'neutral' ? 'stern' : ex;
    }
    const E = EXPR[ex] || EXPR.neutral;
    if (!custom) {
      eye = E.eye ? (base === 'happy' && E.eye !== 'wide' && E.eye !== 'sad' ? 'happy' : E.eye) : base;
      if (st === 'wave' || ((em === 'nod' || em === 'wave') && ex === 'neutral')) mouth = 'smile';
      else mouth = E.mouth || this.restMouth;
      open = E.open || null;
      brow = E.brow;
    }
    if (!custom && E.snore && !this.talking) open = Math.sin(this.t * 1.3) > 0.55 ? 'ohS' : null;
    // sleepy folk yawn now and then (a big open mouth, eyes screwed shut)
    if (!custom && ex === 'sleepy' && !this.talking) {
      this.yawnT -= dt;
      if (this.yawnT < 0) { this.yawnT = 7 + Math.random() * 8; this.yawnK = 1.7; }
    }
    if (this.yawnK > 0) {
      this.yawnK -= dt;
      if (ex === 'sleepy' && !custom) {
        open = 'yawn'; eye = 'squeeze';
        const k = Math.sin(Math.min(1, (1.7 - this.yawnK) / 1.7) * Math.PI);
        this.neck.rotation.x -= 0.3 * k;
        if (GESTURE.has(st) && this.elbowR) { this.armL.rotation.x -= 0.5 * k; this.armR.rotation.x -= 0.5 * k; }
      }
    }
    // talking flaps the mouth in little syllables, shaped by the expression
    if (this.talkT > 0) this.talkT -= dt;
    if (this.talking && open !== 'yawn' && !(custom && st === 'sleep')) {
      const rate = E.slow ? 4.4 : 7.3;
      const syl = Math.floor(this.t * rate);
      const h = Math.sin(syl * 12.9898) * 43758.5453;
      const r = h - Math.floor(h);
      const talkSet = custom ? null : E.talk;
      if (!open || ex === 'surprised' || ex === 'laugh') {
        if (r < 0.26) { open = null; if (!custom && E.closed) mouth = E.closed; }
        else open = talkSet ? talkSet[Math.floor((r - 0.26) / 0.74 * talkSet.length)] : r < 0.5 ? 'oh' : 'talk';
      }
      this.neck.rotation.x += Math.sin(this.t * 11) * 0.04;
    }
    // blinking with lids (slow and heavy when sleepy, none for a moment when startled)
    this.blinkT -= dt;
    if (!custom && E.noBlink && this.exprT < E.noBlink) this.blinkT = Math.max(this.blinkT, 0.05);
    if (this.blinkT < 0 && this.blinkK < 0) { this.blinkK = 0; }
    const bd = !custom && E.slow ? 0.42 : 0.15;
    if (this.blinkK >= 0) {
      this.blinkK += dt;
      if (this.blinkK > bd) { this.blinkK = -1; this.blinkT = !custom && E.slow ? 1.4 + Math.random() * 2 : Math.random() < 0.18 ? 0.25 : 2 + Math.random() * 3.5; }
    }
    if (this.blinkK >= 0 && BLINKS[eye]) {
      const k = this.blinkK / bd;
      eye = k < 0.27 || k > 0.73 ? BLINKS[eye] : 'shut';
      if (eye === 'open') eye = 'half';
    }
    if (eye !== this.curEye) {
      this.curEye = eye;
      for (const g of this.eyes) {
        const vs = g.userData.variants;
        const show = vs[eye] ? eye : vs.open ? 'open' : null;
        for (const k in vs) vs[k].visible = k === show;
      }
    }
    for (const g of this.eyes) g.scale.y = 1;
    // brows: lift and tilt ease toward the expression (each side can differ)
    const bc = this.browCur;
    const bt = brow || [0, 0];
    const lk = this.elbowR ? 1 : 0.8; // chibi faces: the same moods, a touch less travel
    const tL = [bt[0] * lk, bt[1]], tR = bt.length > 2 ? [bt[2] * lk, bt[3]] : tL;
    const kb = 1 - Math.exp(-dt * 16);
    bc[0] += (tL[0] - bc[0]) * kb; bc[1] += (tL[1] - bc[1]) * kb;
    bc[2] += (tR[0] - bc[2]) * kb; bc[3] += (tR[1] - bc[3]) * kb;
    if (this.brows) {
      for (const b of this.brows) {
        const side = b.userData.side;
        const L = side < 0;
        const lift = L ? bc[0] : bc[2];
        b.rotation.z = side * (L ? bc[1] : bc[3]);
        b.position.y = b.userData.y + lift * this.vs;
        if (b.userData.lean) { b.position.z = b.userData.z - Math.max(0, lift) * 0.5 * this.vs; b.rotation.x = -0.25 - Math.max(0, lift) * 0.1; }
      }
    }
    // mouth: rest variants on the face, open variants in rig.mouth (missing shapes fall back)
    const rv = this.mouthRest.userData.variants, ov = this.mouth.userData.variants;
    const pick = (vs, k) => (k && vs[k] ? k : k && vs[MOUTH_FALLBACK[k]] ? MOUTH_FALLBACK[k] : null);
    const want = open ? null : (pick(rv, mouth) || pick(rv, this.restMouth) || 'rest');
    if (want !== this.curRest) {
      this.curRest = want;
      for (const k in rv) rv[k].visible = k === want;
    }
    const oo = pick(ov, open || 'laugh') || 'laugh';
    if (oo !== this.curOpen) {
      this.curOpen = oo;
      for (const k in ov) ov[k].visible = k === oo;
    }
    this.mouth.visible = !!open;
    // the extras: blush, tears sliding down, a sweat drop, a throbbing anger mark
    const fx = this.fx;
    if (fx) {
      this.fxT += dt;
      const on = (k) => !custom && !!E[k];
      const blush = on('blush') || st === 'laugh' || st === 'cheer';
      for (const b of fx.blush) if (b.visible !== blush) b.visible = blush;
      const tears = on('tears');
      for (const tr of fx.tears) {
        if (tr.visible !== tears) tr.visible = tears;
        if (tears) {
          const ph = ((this.fxT * 0.7 + (tr.userData.side > 0 ? 0.45 : 0)) % 1);
          tr.position.y = tr.userData.y - ph * this.vs * 6;
          tr.scale.setScalar(tr.userData.restScale.x * (ph > 0.85 ? (1 - ph) / 0.15 : 1));
        }
      }
      const sw = on('sweat');
      if (fx.sweat) {
        if (fx.sweat.visible !== sw) fx.sweat.visible = sw;
        if (sw) fx.sweat.position.y = fx.sweat.userData.y - ((this.fxT * 0.5) % 1) * this.vs * 2.5;
      }
      const vn = on('vein');
      if (fx.vein) {
        if (fx.vein.visible !== vn) fx.vein.visible = vn;
        if (vn) fx.vein.scale.setScalar(fx.vein.userData.restScale.x * (1 + Math.max(0, Math.sin(this.fxT * 9)) * 0.25));
      }
    }
    this.faceE = custom ? null : E;
  }

  /** Tint all character materials (mine lighting). Requires a unique 'basic' material. */
  setTint(color) {
    this.root.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.copy(color); });
  }

  /**
   * Turn this rig into the crowd level of detail in place: one skinned mesh (two draw calls
   * with the outline pass). Drops the whiskers and bakes the lamp lens into the skin; every
   * animation (blinks, mouths, expressions, ears, tail, emotes) keeps working.
   */
  simplify() {
    const k = this.skin;
    if (!k || this.lod === 'crowd') return this;
    if (k.detail) {
      k.detail.parent?.remove(k.detail);
      k.detail.geometry.dispose();
      k.detail = null;
      this.whiskers = null;
    }
    if (k.lens) {
      k.lens.parent?.remove(k.lens);
      k.assembler.attach(k.lensPart.bone, k.lensPart.geo);
      k.lens = null;
      const old = k.main.geometry;
      k.main.userData.unbindDispose?.(); // keep the skeleton alive while swapping geometry
      k.main.geometry = mergeSkinned(k.assembler.layers.main);
      old.dispose();
      rebindDispose(k.main, this.skeleton);
    }
    this.meshes = [k.main];
    this.lod = 'crowd';
    return this;
  }

  /** Free this character's GPU resources (its skinned geometries and bone texture). */
  dispose() {
    for (const m of this.meshes || []) if (m.isSkinnedMesh) m.geometry.dispose(); // the lens geometry is shared
    if (this.skeleton) this.skeleton.dispose();
  }
}
