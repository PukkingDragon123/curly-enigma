// The camera director for cutscene talk (src/ui/Convo.js): takes the first-person camera smoothly
// from the eyes to a cinematic framing of whoever is talking (their real 3D model, in the world),
// and back. The scenes call it once a frame, right after they set their camera:
//   this.game.convo?.director?.apply(this.camera, dt);   // (HomeScene, TownScene, DigScene)
// Shots (picked by the room there is, never through a wall):
//   'close'  a close-up of the speaker's face from in front, a little off the line between you two
//   'ots'    over your shoulder (your own mole stands in for the first person body) at the speaker
//   'two'    a two-shot from the side, both of you in the frame
//   'wide'   from behind and above you, looking at them
//   'hero'   a close-up of you (your own lines)
//   'face'   no move at all: the first-person view turns to look at the speaker (always fits)
// While a shot is up the paws are hidden, your mole's body stands where you stand (facing the
// speaker, looking at their face), the camera drifts in a little, and the frame keeps the head on a
// third so the words have room beside it (above or below on a phone held upright).
//   director.frame({ speaker, kinds: ['close', 'ots', ...], label })  → the shot it chose (or 'face')
//   director.release()        ease back to the eyes      director.reset()  snap back now
//   director.weight           0 (first person) … 1 (the shot)      director.shot  { kind, side, comp }
//   director.headScreen(out)  where the subject's head is on screen ({ x, y, r } CSS px, or null)
//   director.warm()           build your mole's body ahead of time (idle time)
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { rayBox } from '../fps/FPSKit.js';

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler(0, 0, 0, 'YXZ');
const heroMods = import.meta.glob('../gfx/char/hero.js');

export class Director {
  constructor(game) {
    this.game = game;
    this.cam = null;
    this.w = 0; // blend: first person 0 … the shot 1
    this.want = false;
    this.inDur = 0.85;
    this.outDur = 0.7;
    this.shot = null;
    this.pose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), fov: 50 };
    this.from = null; // the pose a new shot eases from
    this.switchT = 1;
    this.fov0 = null;
    this.hero = null; // your mole's body (a HeroRig) while a shot shows you
    this.heroScene = null;
    this.vmHidden = null;
    this.t = 0;
    this.applyAt = -1e9;
    this.camScene = null;
    this.base = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  }

  get weight() { return this.w; }
  /** Does the running scene call apply() (the camera hook)? Without it the camera stays put. */
  live() { return !!this.cam && this.camScene === this.game.scene; }
  get active() { return this.w > 0 || this.want; }

  /** Build your mole's body ahead of time (it's ~30–80 ms of voxel meshing). */
  warm() {
    if (this.heroRig || this.heroP) return this.heroP;
    const load = heroMods['../gfx/char/hero.js'];
    if (!load) return Promise.resolve(null);
    this.heroP = load().then((m) => {
      const rig = m.makeHeroMole({ height: 0.86, pack: true, hammer: true });
      rig.root.traverse((o) => { if (o.isMesh && o !== rig.skin?.detail) o.layers.enable(LAYER_OUTLINE); });
      rig.setHammer?.('none');
      rig.setPack?.(false); // (the pack and the hammer would fill an over-the-shoulder shot)
      rig.root.name = 'convo-hero';
      this.heroRig = rig;
      return rig;
    }).catch((e) => { console.warn('[director] hero body', e); return null; });
    return this.heroP;
  }

  // ------------------------------------------------------------ the scene's side
  /** Who the player is in this scene: { pos (feet, m), eye(out), yaw } */
  player() {
    const s = this.game.scene;
    const pl = s?.rig?.player || s?.player;
    if (!pl?.pos || !pl.eye) return null;
    return pl;
  }

  /** The scene's ray test (meters): distance to the first solid thing, or Infinity. */
  ray(o, dir, max) {
    const w = this.game.scene?.world;
    if (w?.boxes) {
      // a box world (home, town): skip Old Star's own box and boxes we start inside
      let best = Infinity;
      for (const b of w.boxes) {
        if (b.tag === 'star' || (o.x > b.x0 && o.x < b.x1 && o.y > b.y0 && o.y < b.y1 && o.z > b.z0 && o.z < b.z1)) continue;
        const t = rayBox(o.x, o.y, o.z, dir.x, dir.y, dir.z, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
        if (t !== null && t < best && t <= max) best = t;
      }
      return best;
    }
    if (!w?.raycast) return Infinity;
    try {
      const h = w.raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, max);
      return h && h.dist != null ? h.dist : Infinity;
    } catch (e) { return Infinity; }
  }

  /** How far a camera can go from `from` toward `to` before a wall (keeping 12 cm off it). */
  reach(from, to) {
    const d = _d.subVectors(to, from);
    const L = d.length();
    if (L < 1e-4) return 0;
    d.multiplyScalar(1 / L);
    let best = this.ray(from, d, L + 0.15);
    // a few rays round the line too, so the near plane doesn't graze a corner
    _e.crossVectors(d, UP);
    if (_e.lengthSq() < 1e-6) _e.set(1, 0, 0);
    _e.normalize().multiplyScalar(0.07);
    for (const k of [1, -1]) {
      const o2 = _c.copy(from).addScaledVector(_e, k);
      best = Math.min(best, this.ray(o2, d, L + 0.15));
      const o3 = _c.copy(from).addScaledVector(UP, 0.06 * k);
      best = Math.min(best, this.ray(o3, d, L + 0.15));
    }
    return Math.min(L, best - 0.12);
  }

  /**
   * Room round a camera spot: 8 rays flat out, one up, one down. A wall closer than `min` pushes the
   * spot away from it (twice at most); returns the spot, or null when it's boxed in.
   */
  roomy(p, min = 0.24) {
    const q = p.clone();
    for (let pass = 0; pass < 3; pass++) {
      let worst = Infinity, wx = 0, wy = 0, wz = 0;
      for (let i = 0; i < 10; i++) {
        const a = (i / 8) * Math.PI * 2;
        const dir = i < 8 ? _e.set(Math.sin(a), 0, Math.cos(a)) : _e.set(0, i === 8 ? 1 : -1, 0);
        const d = this.ray(q, dir, min + 0.05);
        if (d < worst) { worst = d; wx = dir.x; wy = dir.y; wz = dir.z; }
      }
      if (worst >= min) return q;
      if (pass === 2) return null;
      q.x -= wx * (min - worst + 0.02); q.y -= wy * (min - worst + 0.02); q.z -= wz * (min - worst + 0.02);
    }
    return null;
  }

  // ------------------------------------------------------------ shots
  /**
   * Choose and start a shot. o: { speaker (src/fx/speakers.js), kinds (in order of preference),
   * subject: 'speaker' | 'hero' }. Returns the shot taken (kind 'face' when nothing else fits, or
   * null when there is nobody to look at).
   */
  frame(o = {}) {
    const sp = o.speaker;
    const pl = this.player();
    if (!sp || !pl || !this.live()) { this.release(); return null; }
    const kinds = o.kinds?.length ? o.kinds : ['close', 'ots', 'two', 'face'];
    const same = this.shot && this.want && this.shot.speaker === sp && this.shot.subject === (o.subject || 'speaker');
    if (same && kinds[0] === this.shot.kind) return this.shot;
    let shot = null;
    for (const k of kinds) { shot = this.plan(k, sp, pl, o); if (shot) break; }
    if (!shot) shot = this.plan('face', sp, pl, o);
    shot.speaker = sp;
    shot.subject = o.subject || 'speaker';
    shot.t = 0;
    // ease from wherever the camera is now (the eyes, or the last shot)
    if (this.w > 0 && this.shot) { this.from = { p: this.pose.p.clone(), q: this.pose.q.clone(), fov: this.pose.fov }; this.switchT = 0; }
    else this.from = null;
    this.shot = shot;
    this.want = true;
    this.computePose(shot, 0, true);
    if (!this.from) { this.pose.p.copy(shot.p); this.pose.q.copy(this.tq); this.pose.fov = shot.fov; }
    return shot;
  }

  /** Ease back to the eyes. */
  release() { this.want = false; }

  /** Tests and screenshots: finish the ease now (the shot fully in, or fully out). */
  settle() { this.w = this.want ? 1 : 0; this.switchT = 1; this.from = null; if (this.shot) this.shot.t = 99; }

  /** Back to first person at once (scene changes, tests). */
  reset() {
    this.want = false;
    this.w = 0;
    this.shot = null;
    this.restore();
  }

  aspect() { return this.cam?.aspect || (this.game.engine.width / Math.max(1, this.game.engine.height)); }

  /** A vertical fov for a shot that keeps at least `minH` degrees across (phones held upright). */
  fovFor(v, minH = 40) {
    const a = this.aspect();
    const need = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(minH) / 2) / a);
    return Math.min(90, Math.max(v, THREE.MathUtils.radToDeg(need)));
  }

  plan(kind, sp, pl, o) {
    const eyesS = sp.eyes(new THREE.Vector3());
    const eyeP = pl.eye(new THREE.Vector3());
    const feetP = pl.pos.clone();
    const h = sp.height;
    const portrait = this.aspect() < 0.9;
    // the line between you: A from the speaker toward you (flat), S across it
    const A = new THREE.Vector3(eyeP.x - eyesS.x, 0, eyeP.z - eyesS.z);
    const dist = A.length();
    if (dist < 1e-3) A.set(0, 0, 1); else A.multiplyScalar(1 / dist);
    const S = new THREE.Vector3(A.z, 0, -A.x);
    const base = { kind, eyesS, eyeP, feetP, A, S, h, dist, portrait };
    const vf = (f, minH) => this.fovFor(f, minH);
    if (kind === 'face') {
      return { ...base, p: this.base.p.clone(), fov: this.fov0 ?? this.cam.fov, comp: { x: 0, y: portrait ? 0.22 : 0.1 }, label: portrait ? 'below' : 'right', fixed: false, hero: false };
    }
    if (kind === 'close' || kind === 'hero') {
      const who = kind === 'hero' ? eyeP : eyesS;
      const dir = kind === 'hero' ? A.clone().negate() : A; // toward the one listening
      const hh = kind === 'hero' ? 0.86 : h;
      const fov = vf(portrait ? 58 : 44, 34);
      const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2), tanH = tanV * this.aspect();
      // head and chest fill the frame: up and down in landscape, across on a phone held upright
      const d = clamp(portrait ? (1.0 * hh) / (2 * tanH) : (1.3 * hh) / (2 * tanV), 0.55, 1.7);
      let best = null;
      for (const side of this.sides(o)) {
        const ang = 0.42 * side;
        const v = dir.clone().applyAxisAngle(UP, ang);
        const want = who.clone().addScaledVector(v, d).addScaledVector(UP, 0.03 * hh);
        const r = this.reach(who, want);
        if (r < d * 0.7 || r < 0.38) continue;
        const p = this.roomy(who.clone().add(_a.subVectors(want, who).normalize().multiplyScalar(r)));
        if (!p) continue;
        // (don't park the camera inside you for a close-up of them)
        if (kind === 'close' && p.distanceTo(eyeP) < 0.3) continue;
        if (!best || r > best.r) best = { r, p, side };
        if (r >= d - 0.01) break;
      }
      if (!best) return null;
      // the head on a third with room in front of the face (where they look: at the other one),
      // the words in that room; on a phone held upright, the words go below
      const other = kind === 'hero' ? eyesS : eyeP;
      const f = _a.subVectors(who, best.p).normalize(), rgt = _b.crossVectors(f, UP).normalize();
      const looks = Math.sign(_c.subVectors(other, who).dot(rgt)) || 1; // +1: they look toward screen right
      const sx = portrait ? 0 : -0.34 * looks;
      return { ...base, p: best.p, fov, side: best.side, comp: { x: sx, y: portrait ? 0.34 : 0.16 }, label: portrait ? 'below' : looks > 0 ? 'right' : 'left', fixed: true, hero: kind === 'hero', focus: kind === 'hero' ? 'hero' : 'speaker', drift: 0.05 };
    }
    if (kind === 'ots') {
      if (dist < 0.45) return null;
      const fov = vf(portrait ? 64 : 50, 42);
      const Ap = A.clone().negate(); // from you toward them
      const Sp = new THREE.Vector3(Ap.z, 0, -Ap.x);
      let best = null;
      for (const side of this.sides(o)) {
        const want = eyeP.clone().addScaledVector(Ap, -0.9).addScaledVector(Sp, 0.6 * side).addScaledVector(UP, 0.3);
        const r = this.reach(eyeP, want);
        const full = eyeP.distanceTo(want);
        if (r < full * 0.6) continue;
        const p = this.roomy(eyeP.clone().add(_a.subVectors(want, eyeP).normalize().multiplyScalar(r)), 0.18);
        if (!p) continue;
        // can the camera see their face from there, past your head?
        const see = this.reach(p, eyesS);
        if (see < p.distanceTo(eyesS) - 0.2) continue;
        if (!this.inFrame(p, eyesS, fov, { x: 0, y: 0 }, [eyesS], 0.9, 0.9)) continue;
        if (!best || r > best.r) best = { r, p, side };
        if (r >= full - 0.01) break;
      }
      if (!best) return null;
      // your shoulder on one side of the frame (the answers float there), their face across from it
      // with the words on the far side
      const f = _a.subVectors(eyesS, best.p).normalize(), rgt = _b.crossVectors(f, UP).normalize();
      const you = Math.sign(_c.subVectors(eyeP, eyesS).dot(rgt)) || 1; // +1: you're on screen right
      return { ...base, p: best.p, fov, side: best.side, comp: { x: portrait ? 0.1 * you : -0.26 * you, y: portrait ? 0.26 : 0.16 }, label: portrait ? 'below' : you > 0 ? 'left' : 'right', fixed: true, hero: true, focus: 'speaker', drift: 0.03, choices: you > 0 ? 'right' : 'left' };
    }
    if (kind === 'two') {
      if (portrait || dist < 0.5 || dist > 3.2) return null;
      const mid = eyesS.clone().add(eyeP).multiplyScalar(0.5);
      const d = clamp(0.9 + dist * 0.8, 1.2, 3.2);
      let best = null;
      for (const side of this.sides(o)) {
        const want = mid.clone().addScaledVector(S, d * side).addScaledVector(A, 0.1 * dist).addScaledVector(UP, 0.18);
        const r = this.reach(mid, want);
        if (r < d * 0.88) continue;
        const p = this.roomy(mid.clone().add(_a.subVectors(want, mid).normalize().multiplyScalar(r)));
        if (!p || this.reach(p, eyesS) < p.distanceTo(eyesS) - 0.2 || this.reach(p, eyeP) < p.distanceTo(eyeP) - 0.2) continue;
        // a lens that fits you both, heads well inside the frame
        let fov = null;
        for (const f of [44, 50, 56, 62]) {
          const v = vf(f, 36);
          if (this.inFrame(p, mid, v, { x: 0, y: 0.1 }, [eyesS, eyeP], 0.62, 0.5)) { fov = v; break; }
        }
        if (fov == null) continue;
        if (!best || r > best.r) best = { r, p, side, fov };
        if (r >= d - 0.01) break;
      }
      if (!best) return null;
      return { ...base, p: best.p, fov: best.fov, side: best.side, comp: { x: 0, y: 0.1 }, label: 'above', fixed: true, hero: true, focus: 'mid', drift: 0.03 };
    }
    if (kind === 'wide') {
      const Ap = A.clone().negate();
      const fov = vf(56, 44);
      const want = eyeP.clone().addScaledVector(Ap, -1.1).addScaledVector(UP, 0.5).addScaledVector(S, 0.25);
      const r = this.reach(eyeP, want);
      if (r < 0.7) return null;
      const p = this.roomy(eyeP.clone().add(_a.subVectors(want, eyeP).normalize().multiplyScalar(r)));
      if (!p || this.reach(p, eyesS) < p.distanceTo(eyesS) - 0.2) return null;
      return { ...base, p, fov, side: 1, comp: { x: 0, y: 0.1 }, label: portrait ? 'below' : 'right', fixed: true, hero: true, focus: 'speaker', drift: 0.02 };
    }
    return null;
  }

  /** Do these points land inside |x| < mx, |y| < my (NDC) for a camera at p aiming at tgt with comp? */
  inFrame(p, tgt, fov, comp, pts, mx = 0.8, my = 0.75) {
    const c = (this.probe ||= new THREE.PerspectiveCamera(50, 1, 0.03, 100));
    c.fov = fov; c.aspect = this.aspect(); c.updateProjectionMatrix();
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2), tanH = tanV * c.aspect;
    const dx = tgt.x - p.x, dy = tgt.y - p.y, dz = tgt.z - p.z;
    c.position.copy(p);
    c.rotation.set(Math.atan2(dy, Math.hypot(dx, dz)) - Math.atan(comp.y * tanV), Math.atan2(-dx, -dz) + Math.atan(comp.x * tanH), 0, 'YXZ');
    c.updateMatrixWorld();
    for (const q of pts) {
      const v = _d.copy(q).project(c);
      if (!(Math.abs(v.x) < mx && Math.abs(v.y) < my && v.z < 1)) return false;
    }
    return true;
  }

  /** Which side of the line to try first (alternating gives a little variety between shots). */
  sides(o) {
    if (o.side) return [o.side, -o.side];
    this.flip = !this.flip;
    return this.flip ? [1, -1] : [-1, 1];
  }

  /** The camera pose for a shot now (the subject moves a little: breathing, a nod, a turn). */
  computePose(shot, dt, snap = false) {
    const sp = shot.speaker;
    const pl = this.player();
    const p = shot.fixed ? shot.p.clone() : this.base.p.clone();
    // where to look: their eyes (or yours, or between you)
    const tgt = new THREE.Vector3();
    if (shot.focus === 'hero') tgt.copy(pl ? pl.eye(_b) : shot.eyeP);
    else if (shot.focus === 'mid') tgt.copy(sp.eyes(_b)).add(pl ? pl.eye(_c) : shot.eyeP).multiplyScalar(0.5);
    else tgt.copy(sp.eyes(_b));
    if (!this.tgt || snap) this.tgt = tgt.clone();
    else this.tgt.lerp(tgt, 1 - Math.exp(-dt * 5));
    // a slow push in
    if (shot.drift) p.lerp(this.tgt, shot.drift * Math.min(1, shot.t / 7));
    const fov = shot.fov;
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2), tanH = tanV * this.aspect();
    const dx = this.tgt.x - p.x, dy = this.tgt.y - p.y, dz = this.tgt.z - p.z;
    const yaw0 = Math.atan2(-dx, -dz), pitch0 = Math.atan2(dy, Math.hypot(dx, dz));
    // put the subject at comp.x, comp.y on screen (-1..1, + right / up)
    const yaw = yaw0 + Math.atan(shot.comp.x * tanH);
    const pitch = pitch0 - Math.atan(shot.comp.y * tanV);
    _eu.set(pitch, yaw, 0, 'YXZ');
    this.tq = (this.tq || new THREE.Quaternion()).setFromEuler(_eu);
    this.tp = p;
    this.tfov = fov;
  }

  // ------------------------------------------------------------ per frame (the scenes' hook)
  apply(camera, dt = 1 / 60) {
    if (!camera) return;
    this.applyAt = performance.now();
    if (this.camScene !== this.game.scene) { this.camScene = this.game.scene; this.cam = null; }
    if (camera !== this.cam) {
      // a new scene (or a new camera): start from the eyes
      this.detachHero();
      this.restoreVm();
      this.cam = camera;
      this.w = 0;
      this.want = false;
      this.shot = null;
      this.fov0 = null;
    }
    this.game.convo?.tick?.(dt, 'sim');
    this.base.p.copy(camera.position);
    this.base.q.copy(camera.quaternion);
    if (this.w <= 0 && !this.want) { this.restore(); return; }
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (this.w <= 0) this.fov0 = camera.fov;
    this.t += dt;
    this.w = clamp(this.w + (this.want ? dt / this.inDur : -dt / this.outDur), 0, 1);
    const shot = this.shot;
    if (!shot) { this.w = 0; this.restore(); return; }
    shot.t += dt;
    this.computePose(shot, dt);
    // a new shot eases in from the last one
    if (this.from && this.switchT < 1) {
      this.switchT = Math.min(1, this.switchT + dt / 0.75);
      const k = ease(this.switchT);
      this.pose.p.lerpVectors(this.from.p, this.tp, k);
      this.pose.q.slerpQuaternions(this.from.q, this.tq, k);
      this.pose.fov = this.from.fov + (this.tfov - this.from.fov) * k;
    } else {
      this.pose.p.copy(this.tp);
      this.pose.q.copy(this.tq);
      this.pose.fov = this.tfov;
    }
    const e = ease(this.w);
    camera.position.lerpVectors(this.base.p, this.pose.p, e);
    camera.quaternion.slerpQuaternions(this.base.q, this.pose.q, e);
    const fov0 = this.fov0 ?? camera.fov;
    const fov = fov0 + (this.pose.fov - fov0) * e;
    if (Math.abs(camera.fov - fov) > 1e-4) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    if (this.w <= 0 && !this.want) { this.restore(); return; }
    // the paws go while the camera is away from the eyes; your body stands in for them
    const away = camera.position.distanceTo(this.base.p);
    this.hideVm(e > 0.04);
    this.heroFrame(dt, shot, away > 0.3 && shot.hero);
  }

  restore() {
    const c = this.cam;
    if (c && this.fov0 != null) { if (Math.abs(c.fov - this.fov0) > 1e-4) { c.fov = this.fov0; c.updateProjectionMatrix(); } this.fov0 = null; }
    this.restoreVm();
    this.detachHero();
  }

  vm() { const s = this.game.scene; return s?.rig?.vm || s?.vm || null; }
  hideVm(on) {
    const vm = this.vm();
    if (!vm?.scene) return;
    if (on && vm.scene.visible) { vm.scene.visible = false; this.vmHidden = vm; }
    else if (!on && this.vmHidden === vm) { vm.scene.visible = true; this.vmHidden = null; }
  }
  restoreVm() { if (this.vmHidden?.scene) this.vmHidden.scene.visible = true; this.vmHidden = null; }

  // ------------------------------------------------------------ your mole
  heroFrame(dt, shot, show) {
    const s = this.game.scene;
    if (!show) { if (this.hero) this.hero.root.visible = false; return; }
    if (!this.heroRig) { this.warm(); return; }
    const rig = this.heroRig;
    if (this.heroScene !== s) {
      this.detachHero();
      s.scene.add(rig.root);
      this.heroScene = s;
      s.own?.(() => this.detachHero());
      const pl = this.player();
      if (pl) {
        rig.root.position.copy(pl.pos);
        const e = shot.speaker.eyes(_a);
        rig.face(Math.atan2(e.x - pl.pos.x, e.z - pl.pos.z), true);
      }
      rig.play('idle');
    }
    this.hero = rig;
    rig.root.visible = true;
    const pl = this.player();
    if (pl) {
      rig.root.position.lerp(pl.pos, 0.5);
      const e = shot.speaker.eyes(_a);
      rig.face(Math.atan2(e.x - pl.pos.x, e.z - pl.pos.z));
      rig.lookAt(_b.copy(e));
    }
    rig.update(dt);
  }

  detachHero() {
    const rig = this.heroRig;
    if (rig?.root.parent) rig.root.parent.remove(rig.root);
    if (rig) { rig.talk?.(false); rig.lookAt?.(null); }
    this.heroScene = null;
    this.hero = null;
  }

  /** Your mole says something (a nod, the mouth): the convo calls this when you pick an answer. */
  heroTalk(secs = 1.2) { const r = this.hero; if (!r) return; r.talk(secs); r.doEmote?.('nod', 0.8); }

  // ------------------------------------------------------------ for the floating words
  /**
   * Where a world point lands on the page (CSS px), through the camera as it is now.
   * Returns { x, y, front } (front: in front of the camera).
   */
  toScreen(v, out = {}) {
    const cam = (this.live() && this.cam) || this.game.scene?.camera;
    const e = this.game.engine;
    if (!cam) { out.x = out.y = 0; out.front = false; return out; }
    cam.updateMatrixWorld();
    _a.copy(v).applyMatrix4(cam.matrixWorldInverse);
    out.front = _a.z < -0.02;
    _a.copy(v).project(cam);
    out.x = (_a.x * 0.5 + 0.5) * e.width * e.scale;
    out.y = (-_a.y * 0.5 + 0.5) * e.height * e.scale;
    return out;
  }
}
