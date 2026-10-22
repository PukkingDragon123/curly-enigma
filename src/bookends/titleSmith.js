// The blacksmith mole behind the title menu. The player's hero mole (gfx/char/hero.js,
// makeHeroMole) if it is there, else a stand-in built with makeCharacter (a stocky mole in a
// leather apron, bandana and goggles; classic chibi build). He works a blade blank on the anvil on a loop:
//   bout     4-6 heavy blows (sparks, flash, clang), the blade cooling a little with each
//   flip     leans in, turns the blade over with the tongs
//   reheat   steps to the forge, pushes the blade into the coals while the bellows roar, back
//   quench   now and then: dips it in the tub (steam), then
//   pose     plants the hammer, goggles up, chin up, a look at the camera
// The tongs aim at whatever they hold (a tiny IK: lookAt + stretch); the blade rides the jaws.
// Events (smith.on(name, fn)): strike(pos, power) · flip(pos) · bellows() · fire(pos) ·
// quench(pos) · clink(pos) · step().
import * as THREE from 'three';
import { makeCharacter } from '../gfx/characters.js';
import { makeSmithHammer, makeTongs, makeBlade, makeGoggles } from './titleProps.js';

const HERO = import.meta.glob('../gfx/char/hero.js');

// the classic chibi build (blocky and cute), made tough with a bandana, angry brows, goggles and a big hammer
const STANDIN = {
  seed: 4242, species: 'mole', age: 'adult', body: 'stocky', fur: 0x3a2e2c, eyes: 'bead',
  outfit: 'apron', outfitColor: 0x6a4224,
  hat: 'bandana', hatColor: 0x7a2418, glasses: false, scarf: null, dirt: 0.85, blush: false, brows: 'angry',
  mood: 'angry', patches: 1, freckles: false, earring: false, tuft: false, fabric: 'plain', eyeColor: 0x3a2a2a,
};

const v3 = () => new THREE.Vector3();
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

/** Build the smith. Resolves to a Smith (see the class). */
export async function makeSmith({ height = 1.45, standin = false } = {}) {
  let rig = null, kind = 'standin';
  const load = standin ? null : Object.values(HERO)[0];
  if (load) {
    try {
      const m = await load();
      if (typeof m.makeHeroMole === 'function') {
        rig = m.makeHeroMole({ height, pack: false, hammer: true, goggles: 'down' });
        kind = 'hero';
      }
    } catch (e) { console.warn('[title] hero mole failed to build, using the stand-in', e); rig = null; }
  }
  if (!rig) rig = standIn(height);
  return new Smith(rig, kind);
}

function standIn(height) {
  const rig = makeCharacter(STANDIN);
  const k = height / (rig.height || 1);
  rig.root.scale.setScalar(k);
  const hammer = makeSmithHammer();
  hammer.rotation.x = Math.PI / 2; // haft out of the fist, head forward
  rig.handR.add(hammer);
  rig._hammer = hammer;
  // goggles pushed up on the bandana
  if (rig.anchors) {
    const gg = makeGoggles(rig.anchors.headW / k);
    gg.scale.setScalar(1 / k);
    gg.position.copy(rig.anchors.eyes).add(new THREE.Vector3(0, rig.anchors.headH * 0.32, rig.anchors.headD * -0.05));
    rig.neck.add(gg);
  }
  rig.hammerFaceWorld = (out = v3()) => { rig.root.updateMatrixWorld(true); return hammer.localToWorld(out.copy(hammer.userData.head)); };
  rig.look = () => {};
  rig.setGoggles = () => {};
  rig.setHammer = () => {};
  return rig;
}

export class Smith {
  constructor(rig, kind) {
    this.rig = rig;
    this.kind = kind;
    this.root = rig.root;
    this.handlers = {};
    // tongs: an aim pivot in the left paw whose +z points at what they hold
    this.tongsAim = new THREE.Group();
    this.tongs = makeTongs();
    this.tongs.rotation.x = Math.PI / 2; // jaws (+y) → pivot +z
    this.tongsAim.add(this.tongs);
    rig.handL.add(this.tongsAim);
    this.tongsLen = this.tongs.userData.jaw.y;
    this.blade = makeBlade();
    this.blade.userData.dynamic = true;
    this.heat = 1;
    this.blade.userData.setHeat(this.heat);
    // where things are (world), set by place()
    this.home = v3(); this.homeYaw = Math.PI / 2;
    this.spot = v3(); // tang end of the blade lying on the anvil
    this.spotDir = new THREE.Vector3(1, 0, 0); // along the anvil, away from the smith
    this.fire = v3(); this.forgeStep = v3(); this.forgeYaw = 0;
    this.tub = v3(); this.tubYaw = 0;
    this.cam = null;
    // state
    this.t = 0;
    this.queue = [];
    this.act = null;
    this.cycle = 0;
    this.yaw = this.homeYaw;
    this.pos = v3();
    this.hold = 'anvil'; // where the blade is: 'anvil' | 'tongs' | 'fire' | 'tub'
    this.aim = v3(); this.aimTo = v3(); // tongs target
    this.flat = 1; // 1 = blade lies flat along the anvil, 0 = follows the tongs
    this.flipA = 0; // blade roll around its long axis
    this.tmp = { a: v3(), b: v3(), c: v3(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), m: new THREE.Matrix4() };
    rig.setPack?.(false);
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  emit(name, ...a) { for (const fn of this.handlers[name] || []) fn(...a); }

  /**
   * Where the hammer face lands at the moment of impact, relative to the smith's feet, when he
   * stands at the origin facing +x. The scene builds the anvil to meet it.
   */
  impactOffset(yaw = Math.PI / 2) {
    const r = this.rig;
    r.root.position.set(0, 0, 0);
    r.face(yaw, true);
    r.play('hammer');
    r.swingPhase = 0;
    r.update(1 / 60);
    r.update(0);
    const p = r.hammerFaceWorld(v3());
    if (r.root.parent) r.root.parent.worldToLocal(p);
    return p;
  }

  /** o: { home, yaw, spot (blade tang on the anvil), dir, fire, tub } in the parent's space. */
  place(o) {
    this.home.copy(o.home);
    this.homeYaw = o.yaw ?? Math.PI / 2;
    this.yaw = this.homeYaw;
    this.pos.copy(this.home);
    this.spot.copy(o.spot);
    if (o.dir) this.spotDir.copy(o.dir).normalize();
    this.fire.copy(o.fire);
    // one step toward the forge
    const toF = this.tmp.a.copy(this.fire).sub(this.home).setY(0);
    this.forgeYaw = Math.atan2(toF.x, toF.z);
    this.forgeStep.copy(this.home).addScaledVector(toF.normalize(), o.step ?? 0.4);
    this.tub.copy(o.tub);
    const toT = this.tmp.a.copy(this.tub).sub(this.home);
    this.tubYaw = Math.atan2(toT.x, toT.z);
    this.aim.copy(this.spot);
    this.aimTo.copy(this.spot);
    this.root.position.copy(this.home);
    this.rig.face(this.yaw, true);
  }

  // ------------------------------------------------------------------ the loop
  plan() {
    const c = this.cycle++;
    this.queue.push(this.bout(4 + (c % 3)));
    this.queue.push(this.flip());
    if (c % 3 === 2) { this.queue.push(this.quench()); this.queue.push(this.pose()); this.queue.push(this.reheat()); }
    else if (c % 2 === 1) this.queue.push(this.reheat());
    else this.queue.push(this.bout(3));
  }

  bout(n) {
    const period = 0.92;
    let left = n;
    let ph = 0.25; // start mid-raise
    return {
      name: 'bout', dur: 99,
      enter: () => { this.rig.play('hammer'); this.rig.setGoggles?.('down'); this.rig.setHammer?.(null); this.hold = 'anvil'; },
      tick: (k, dt, a) => {
        const prev = ph;
        ph += dt / (period * (1 + (left % 2) * 0.06));
        if (left <= 0) {
          // the last blow is struck: let the hammer come up a little, then move on
          if (ph > 0.35) a.done = true;
        } else if (ph >= 1) {
          ph -= 1;
          left--;
          const pos = this.rig.hammerFaceWorld(v3());
          if (this.root.parent) this.root.parent.worldToLocal(pos);
          this.heat = Math.max(0.35, this.heat - 0.07);
          this.emit('strike', pos, left === 0 ? 1.25 : 1);
        }
        if (prev < 0.62 && ph >= 0.62) this.emit('raise');
        this.rig.swingPhase = ph % 1;
        this.aimTo.copy(this.spot);
        this.flat = 1;
      },
    };
  }

  flip() {
    return {
      name: 'flip', dur: 1.1,
      enter: () => { this.rig.play(this.kind === 'hero' ? 'peer' : 'idle'); this.rig.setHammer?.('hand'); },
      tick: (k) => {
        // lift the blade a hand's breadth, roll it over, set it back down
        const up = Math.sin(Math.min(1, k * 1.25) * Math.PI) * 0.12;
        this.aimTo.copy(this.spot).add(this.tmp.a.set(0, up, 0));
        this.flat = 1;
        this.flipA = ease((k - 0.2) / 0.6) * Math.PI;
        if (k >= 0.86 && !this._flipped) { this._flipped = true; this.emit('clink', this.spot.clone()); }
      },
      exit: () => { this.flipA = 0; this._flipped = false; this.rig.setHammer?.(null); },
    };
  }

  reheat() {
    return {
      name: 'reheat', dur: 3.6,
      enter: () => { this.rig.setHammer?.('hand'); this._b = false; },
      tick: (k, dt) => {
        const r = this.rig;
        // 0-.16 turn and step · .16-.28 reach in · .28-.7 in the coals · .7-.82 out · .82-1 back
        if (k < 0.16) {
          const e = ease(k / 0.16);
          this.yaw = lerpAngle(this.homeYaw, this.forgeYaw, e);
          this.pos.lerpVectors(this.home, this.forgeStep, e);
          r.play(e < 0.9 ? 'walk' : 'reach');
          this.aimTo.lerpVectors(this.spot, this.fire, e * 0.4);
          this.flat = 1 - e;
        } else if (k < 0.7) {
          r.play('reach');
          const e = ease((k - 0.16) / 0.12);
          this.aimTo.copy(this.fire).add(this.tmp.a.set(0, (1 - e) * 0.25, 0));
          this.flat = 0;
          if (k > 0.28) {
            this.heat = Math.min(1, this.heat + dt * 0.9);
            if (!this._b) { this._b = true; this.emit('bellows'); this.emit('fire', this.fire.clone()); }
          }
        } else if (k < 0.82) {
          const e = ease((k - 0.7) / 0.12);
          this.aimTo.copy(this.fire).add(this.tmp.a.set(0, e * 0.3, 0));
        } else {
          const e = ease((k - 0.82) / 0.18);
          this.yaw = lerpAngle(this.forgeYaw, this.homeYaw, e);
          this.pos.lerpVectors(this.forgeStep, this.home, e);
          r.play(e < 0.85 ? 'walk' : 'hammer');
          this.aimTo.lerpVectors(this.fire, this.spot, e);
          this.flat = e;
          if (e > 0.98 && !this._c) { this._c = true; this.emit('clink', this.spot.clone()); }
        }
      },
      exit: () => { this._c = false; this.yaw = this.homeYaw; this.pos.copy(this.home); this.rig.setHammer?.(null); },
    };
  }

  quench() {
    const water = () => this.tmp.c.copy(this.tub).add(this.tmp.b.set(0, -0.12, 0));
    return {
      name: 'quench', dur: 2.6,
      enter: () => { this.rig.setHammer?.('hand'); this._q = false; },
      tick: (k, dt) => {
        const r = this.rig;
        if (k < 0.18) {
          const e = ease(k / 0.18);
          this.yaw = lerpAngle(this.homeYaw, this.tubYaw, e);
          r.play('reach');
          this.aimTo.lerpVectors(this.spot, this.tmp.a.copy(this.tub).add(this.tmp.b.set(0, 0.35, 0)), e);
          this.flat = 1 - e;
        } else if (k < 0.66) {
          const e = ease((k - 0.18) / 0.12);
          this.aimTo.lerpVectors(this.tmp.a.copy(this.tub).add(this.tmp.b.set(0, 0.35, 0)), water(), e);
          this.flat = 0;
          if (e >= 1 && !this._q) { this._q = true; this.emit('quench', this.tub.clone()); }
          if (this._q) this.heat = Math.max(0, this.heat - dt * 2.5);
        } else if (k < 0.8) {
          const e = ease((k - 0.66) / 0.14);
          this.aimTo.lerpVectors(water(), this.tmp.a.copy(this.tub).add(this.tmp.b.set(0, 0.45, 0)), e);
        } else {
          const e = ease((k - 0.8) / 0.2);
          this.yaw = lerpAngle(this.tubYaw, this.homeYaw, e);
          this.aimTo.lerpVectors(this.tmp.a.copy(this.tub).add(this.tmp.b.set(0, 0.45, 0)), this.spot, e);
          this.flat = e;
        }
      },
      exit: () => { this.yaw = this.homeYaw; },
    };
  }

  pose() {
    return {
      name: 'pose', dur: 3.2,
      enter: () => {
        const r = this.rig;
        r.play(this.kind === 'hero' ? 'pose' : 'idle');
        r.setGoggles?.('up');
        this.tongsAim.visible = false;
        this.hold = 'anvil';
        this.emit('clink', this.spot.clone());
      },
      tick: (k) => {
        // a look over the shoulder at the camera, chin up
        if (this.cam && this.rig.look) {
          const to = this.tmp.a.copy(this.cam.position).sub(this.root.position);
          const yaw = Math.atan2(to.x, to.z) - this.yaw;
          const w = ease(k / 0.25) * (1 - ease((k - 0.8) / 0.2));
          this.rig.look(yaw * w, 0.12 * w);
        }
        this.aimTo.copy(this.spot);
        this.flat = 1;
      },
      exit: () => { this.tongsAim.visible = true; this.rig.look?.(0, 0); this.rig.setGoggles?.('down'); },
    };
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    this.t += dt;
    if (!this.act) {
      if (!this.queue.length) this.plan();
      this.act = this.queue.shift();
      this.act.t = 0;
      this.act.enter?.();
    }
    const a = this.act;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    a.tick?.(k, dt, a);
    if (k >= 1 || a.done) { a.exit?.(); this.act = null; }

    // body
    const r = this.rig;
    this.root.position.copy(this.pos);
    r.face(this.yaw, true);
    r.update(dt);
    // tongs: aim at the target, stretched a little to reach it
    this.aim.lerp(this.aimTo, Math.min(1, dt * 14));
    this.root.updateMatrixWorld(true);
    const T = this.tmp;
    const aimW = this.root.parent ? this.root.parent.localToWorld(T.a.copy(this.aim)) : T.a.copy(this.aim);
    const hand = this.tongsAim.getWorldPosition(T.b);
    const dist = hand.distanceTo(aimW);
    this.tongsAim.lookAt(aimW);
    const ws = new THREE.Vector3();
    this.tongsAim.parent.getWorldScale(ws);
    this.tongsAim.scale.setScalar(1 / Math.max(1e-3, ws.x));
    this.tongs.scale.set(1, Math.max(0.55, Math.min(1.5, dist / Math.max(0.01, this.tongsLen * 1))), 1);
    // the blade rides the jaws; on the anvil it lies flat along the anvil
    this.tongs.updateMatrixWorld(true);
    const jaw = this.tongs.localToWorld(T.c.copy(this.tongs.userData.jaw));
    const bl = this.blade;
    const par = bl.parent;
    if (par) par.worldToLocal(jaw);
    bl.position.copy(jaw);
    // orientation: along the tongs (their world +z) or flat along the anvil
    const dirT = this.tmp.a.set(0, 0, 1).applyQuaternion(this.tongsAim.getWorldQuaternion(T.q)).normalize();
    const along = new THREE.Vector3().copy(dirT).lerp(this.spotDir, this.flat).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    // blade local +y → along; +z (flat face normal) → up-ish
    const zAxis = up.clone().sub(along.clone().multiplyScalar(up.dot(along))).normalize();
    const xAxis = new THREE.Vector3().crossVectors(along, zAxis).normalize();
    T.m.makeBasis(xAxis, along, zAxis);
    bl.quaternion.setFromRotationMatrix(T.m);
    if (this.flipA) bl.quaternion.multiply(T.q2.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.flipA));
    bl.userData.setHeat(this.heat);
  }

  dispose() { this.rig.dispose?.(); }
}
