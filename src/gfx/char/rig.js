// The character animation rig: procedural poses for every state, plus secondary motion
// (breathing belly, squash on landing, ear/tail springs, whisker twitches) and a face that
// blinks with lids and changes expression for emotes, talking, laughing, hurting and sneezing.
import { lerp } from '../../core/util.js';

const GROUNDED = new Set(['idle', 'walk', 'run', 'carry', 'talk']);

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
  }

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

  talk(seconds = 1.5) { this.talkT = seconds; }

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
        break;
      }
      case 'jump': case 'fall': {
        armL.rotation.set(-2.4, 0, 0.5);
        armR.rotation.set(-2.4, 0, -0.5);
        legL.rotation.x = this.state === 'jump' ? -0.6 : 0.3;
        legR.rotation.x = this.state === 'jump' ? 0.4 : -0.3;
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
        break;
      }
      case 'wave': {
        armR.rotation.set(-2.7, 0, -0.3 + Math.sin(t * 10) * 0.5);
        neck.rotation.z = Math.sin(t * 5) * 0.08;
        break;
      }
      case 'cheer': {
        armL.rotation.set(-2.9, 0, 0.4 + Math.sin(t * 12) * 0.2);
        armR.rotation.set(-2.9, 0, -0.4 - Math.sin(t * 12) * 0.2);
        hip.position.y += Math.abs(Math.sin(t * 8)) * s * 4;
        break;
      }
      case 'sit': {
        legL.rotation.x = -1.45;
        legR.rotation.x = -1.45;
        hip.position.y = s * 2;
        armL.rotation.x = -0.4;
        armR.rotation.x = -0.4;
        break;
      }
      case 'sleep': {
        hip.rotation.x = 0.1;
        neck.rotation.x = 0.35 + breathe * 0.03;
        neck.rotation.z = 0.2;
        armL.rotation.x = -0.6;
        armR.rotation.x = -0.6;
        break;
      }
      case 'laugh': {
        hip.rotation.x += -0.2 + Math.sin(t * 25) * 0.05;
        neck.rotation.x = -0.3;
        armL.rotation.set(-0.6, 0, 0.6);
        armR.rotation.set(-0.6, 0, -0.6);
        hip.position.y += Math.abs(Math.sin(t * 16)) * s;
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
      }
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
        e.rotation.set(b[0] + this.earA * 1.2 + (this.state === 'sad' ? 0.5 : 0), 0, b[2] + sway + (e.userData.side === this.twitchSide ? tw * -e.userData.side : 0) + (this.state === 'sad' ? -e.userData.side * 0.3 : 0));
      }
    }
    // whiskers
    this.whiskT -= dt;
    if (this.whiskT < 0) { this.whiskT = 0.8 + Math.random() * 3.5; this.whiskK = 1; }
    if (this.whiskK > 0) this.whiskK = Math.max(0, this.whiskK - dt * 4);
    if (this.whiskers) {
      const w = Math.sin(this.whiskK * Math.PI * 3) * 0.16 * this.whiskK + (this.talkT > 0 ? Math.sin(t * 22) * 0.05 : 0);
      for (const g of this.whiskers) g.rotation.set(0, w * -g.userData.side, w * 0.6 + Math.sin(t * 2.3) * 0.03);
    }
  }

  /** Pick eye, brow and mouth variants for the current state/emote/talk, and blink. */
  updateFace(dt) {
    const st = this.state;
    const em = this.emoteT > 0 ? this.emote : null;
    const base = this.eyeType === 'happy' ? 'happy' : this.eyeType === 'sleepy' ? 'half' : 'open';
    let eye = base, mouth = this.restMouth, open = null, brow = 0, browY = 0;
    if (st === 'laugh' || st === 'cheer') { eye = 'happy'; open = 'laugh'; }
    else if (st === 'hurt') { eye = 'squeeze'; open = 'grimace'; brow = 1; }
    else if (st === 'sad') { eye = 'sad'; mouth = 'frown'; brow = -1; }
    else if (st === 'sleep') { eye = 'shut'; }
    else if (st === 'sneeze') {
      if (this.stateT < 0.35) { eye = 'half'; open = 'oh'; browY = 1; }
      else if (this.stateT < 0.5) { eye = 'squeeze'; open = 'oh'; }
      else { eye = 'squeeze'; open = 'laugh'; }
    } else if (st === 'wave') { mouth = 'smile'; }
    else if (st === 'hammer' || st === 'swing' || st === 'dig' || st === 'drill' || st === 'chisel') { if (base === 'open') eye = 'angry'; mouth = 'line'; brow = 0.5; }
    if (em === 'hop' || em === 'happy') { eye = 'happy'; mouth = 'smile'; }
    else if (em === 'nod' || em === 'wave') { mouth = 'smile'; }
    else if (em === 'shake') { mouth = 'frown'; brow = -0.6; }
    else if (em === 'sad') { eye = 'sad'; mouth = 'frown'; brow = -1; }
    else if (em === 'angry') { eye = 'angry'; mouth = 'frown'; brow = 1; }
    else if (em === 'surprise') { eye = 'open'; open = 'oh'; browY = 1.5; }
    // talking flaps the mouth in little syllables (talk(sec) or the 'talk' state)
    if (this.talkT > 0 || st === 'talk') {
      if (this.talkT > 0) this.talkT -= dt;
      const syl = Math.floor(this.t * 7.3);
      const h = Math.sin(syl * 12.9898) * 43758.5453;
      const r = h - Math.floor(h);
      if (!open) open = r < 0.28 ? null : r < 0.5 ? 'oh' : 'talk';
      this.neck.rotation.x += Math.sin(this.t * 11) * 0.04;
    }
    // blinking with lids
    this.blinkT -= dt;
    if (this.blinkT < 0 && this.blinkK < 0) { this.blinkK = 0; }
    if (this.blinkK >= 0) {
      this.blinkK += dt;
      if (this.blinkK > 0.15) { this.blinkK = -1; this.blinkT = Math.random() < 0.18 ? 0.25 : 2 + Math.random() * 3.5; }
    }
    if (this.blinkK >= 0 && (eye === 'open' || eye === 'half' || eye === 'sad' || eye === 'angry')) {
      eye = this.blinkK < 0.04 || this.blinkK > 0.11 ? (eye === 'open' ? 'half' : 'shut') : 'shut';
    }
    if (eye !== this.curEye) {
      this.curEye = eye;
      for (const g of this.eyes) {
        const vs = g.userData.variants;
        for (const k in vs) vs[k].visible = k === eye;
      }
    }
    for (const g of this.eyes) g.scale.y = 1;
    // brows tilt with the mood
    if (this.brows) {
      for (const b of this.brows) {
        b.rotation.z = b.userData.side * brow * 0.32;
        b.position.y = b.userData.y + browY * this.vs;
      }
    }
    // mouth: rest variants on the face, open variants in rig.mouth
    const want = open ? null : mouth;
    if (want !== this.curRest) {
      this.curRest = want;
      const vs = this.mouthRest.userData.variants;
      for (const k in vs) vs[k].visible = k === want;
    }
    const ov = open || 'laugh';
    if (ov !== this.curOpen) {
      this.curOpen = ov;
      const vs = this.mouth.userData.variants;
      for (const k in vs) vs[k].visible = k === ov;
    }
    this.mouth.visible = !!open;
  }

  /** Tint all character materials (mine lighting). Requires a unique 'basic' material. */
  setTint(color) {
    this.root.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.copy(color); });
  }
}
