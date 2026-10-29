// Gathering in 3D: E on a plant in the mine eases the camera into a close-up of it, the mole's
// paws reach in and the minigame (src/deep/gather/sims.js) plays on the real spot: the stem
// stretches and bends in the paw, the soil cracks and heaves, roots tear out one by one, and at
// the end it pops out and is held up in the paw with its quality, then the view eases back.
//
//   openGather(props, plant, { protects }) → Promise<{ cancel } | { id, q, p, n, ... }>
//
// How it hooks into the mine without owning it: a transparent ui panel (so DigScene is `busy`:
// no walking, looking or digging; Esc reaches us first), and the session runs once per scene
// frame right after DigScene has placed its camera (it wraps the view model's update for the
// close-up's length). DigScene may call `gather.frame(dt)` itself after setting the camera; the
// wrapper then stands down (one frame each, never two).
//
// Test hooks: window.__gather = { open(id, o), run(id, o), sim(id, script, o), active, specs,
// still (no CSS animation, for screenshots), prof (per-section frame times in state().prof) };
// a session: drive(script, secs, { pause, until, stopAtShow }), step(dt, input), state(), go(phase).
// warmGather(plant, props) (Props calls it while a plant is aimed at) builds its model and compiles
// the close-up shaders ahead, so pressing E doesn't hitch.
import * as THREE from 'three';
import { forageSpec, FORAGE } from '../../cooking/forage.js';
import { makeSim, scriptInput, simulate } from './sims.js';
import { warmPlant } from './models.js';
import { gatherMaterial, cubeGeo } from './gfx.js';
import { PullStage } from './stagePull.js';
import { PickStage } from './stagePick.js';
import { PeelStage } from './stagePeel.js';
import { DigStage } from './stageDig.js';
import { LiftStage } from './stageLift.js';
import { GatherHud } from './hud.js';
import { GatherInput } from './input.js';
import { GatherSfx } from './sfx.js';
import { aim } from '../../fps/viewmodel/pose.js';

const STAGES = { pull: PullStage, pick: PickStage, peel: PeelStage, dig: DigStage, lift: LiftStage };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const NONE = { grip: false, pull: 0, wx: 0, vx: 0, tap: false };
const WORLD_UP = new THREE.Vector3(0, 1, 0);
// paws at rest below the view (view-model space)
const LOW = {
  R: { p: new THREE.Vector3(0.22, -0.44, -0.24), q: aim([-0.2, 1, 0.3], [-0.5, -0.1, -1]) },
  L: { p: new THREE.Vector3(-0.22, -0.44, -0.24), q: aim([0.2, 1, 0.3], [0.5, -0.1, -1]) },
};

let active = null;

/** The seed a plant's close-up is built with (stable per spot). */
const seedOf = (p) => ((Math.round(p.x * 64) * 73856093) ^ (Math.round(p.z * 64) * 19349663)) & 0xffff;

/** Build a plant's close-up model ahead (call when it's aimed at; cheap if already warm). */
export function warmGather(plant, props = null) {
  const owner = props?.ctx?.owner;
  if (owner) warmShaders(owner);
  const spec = forageSpec(plant.item);
  if (spec.tech !== 'pull') return;
  warmPlant(plant.item, spec, seedOf(plant));
}

/** Compile the close-up's shaders once, in the background, before the first E (no hitch then). */
let warmedFor = null;
function warmShaders(owner) {
  const r = owner.game?.engine?.renderer;
  if (!r || warmedFor === owner || !owner.U) return;
  warmedFor = owner;
  try {
    const sc = new THREE.Scene();
    const mat = gatherMaterial(owner.U);
    const geo = cubeGeo();
    const a = new THREE.Mesh(geo, mat);
    const b = new THREE.InstancedMesh(geo, mat, 1);
    b.setColorAt(0, new THREE.Color(1, 1, 1));
    const c = new THREE.InstancedMesh(geo, mat, 1);
    sc.add(a, b, c);
    const done = () => { geo.dispose(); mat.dispose(); };
    if (r.compileAsync) r.compileAsync(sc, owner.camera).then(done, done); else { r.compile(sc, owner.camera); done(); }
  } catch (e) { /* only a warm-up */ }
}

/** Start gathering `plant` (a Props plant record, or a test stand-in). */
export function openGather(props, plant, opts = {}) {
  const owner = props?.ctx?.owner;
  if (active || !owner?.camera || !owner.game?.ui?.openPanel) return Promise.resolve({ cancel: true, busy: true });
  try {
    const s = new Session(owner, props, plant, opts);
    return s.promise;
  } catch (e) {
    console.warn('gather failed to start', e);
    active = null;
    return Promise.resolve({ cancel: true, error: true });
  }
}

class Session {
  constructor(owner, props, plant, opts) {
    active = this;
    try { this.start(owner, props, plant, opts); } catch (e) { this.abort(); throw e; }
  }
  /** Something broke while starting: put everything back as it was. */
  abort() {
    try {
      this.unhookFn?.();
      if (this.owner?.vm) this.owner.vm.drive = null;
      if (this.handle && !this.handle.closed) { this.handle.onClose = null; this.handle.close(); }
      this.input?.detach?.();
      this.stage?.dispose();
      this.hud?.dispose();
      if (this.plant?.rec) this.props?.hidePlant?.(this.plant, false);
      this.game?.ui?.root?.classList.remove('gathering');
    } catch (e) { /* best effort */ }
    if (active === this) active = null;
  }
  start(owner, props, plant, opts) {
    this.owner = owner; this.props = props; this.plant = plant; this.opts = opts;
    this.game = owner.game;
    this.id = plant.item;
    this.spec = forageSpec(this.id);
    this.down = plant.mount === 'ceil';
    this.phase = 'in'; this.t = 0; this.pt = 0; this.camK = 0; this.reach = 0;
    this.result = null;
    const st = this.game.state;
    const skill = Math.max(1, (typeof st?.skill === 'function' && st.skill('forage')) || 1);
    this.seed = opts.seed ?? seedOf(plant);
    this.sim = makeSim(this.id, this.spec, { protects: opts.protects, skill, seed: this.seed });
    this.sfx = new GatherSfx(this.game.audio);
    // the stage on the plant's spot
    this.at = this.frameOf(plant);
    const ctx = { scene3: owner.scene, U: owner.U, world: owner.world, fx: owner.fx, audio: this.game.audio };
    const Stage = STAGES[this.spec.tech] || PullStage;
    this.stage = new Stage(ctx, this.at, this.id, this.spec, this.sim, { seed: this.seed });
    if (plant.rec) props.hidePlant?.(plant, true);
    this.light = plant.light ? { ...plant.light } : null;
    // the camera's close-up pose
    this.frameCamera();
    // HUD + input inside a see-through panel
    const ui = this.game.ui;
    this.hud = new GatherHud(this.game, this.id, this.spec, this.sim, { down: this.down, onLeave: () => this.escape() });
    this.wasLocked = !!document.pointerLockElement;
    this.quietUi(() => {
      this.handle = ui.openPanel({ body: this.hud.root, className: 'gt-panel', closable: true, noBack: true, onClose: () => this.onClosed() });
    });
    this.handle.back.classList.add('gt-back');
    if (typeof window !== 'undefined' && window.__gather?.still) { this.hud.root.classList.add('still'); document.documentElement.classList.add('gt-still'); } // tests: no CSS animation
    this.handle.onEscape = () => { this.escape(); return true; };
    this.input = new GatherInput({ down: this.down, tech: this.spec.tech });
    this.input.attach(this.handle.back);
    if (this.wasLocked && !document.documentElement.classList.contains('is-touch')) setTimeout(() => { if (active === this) this.game.input.lockPointer?.(); }, 0);
    this.prevFocus = !!ui.focus;
    ui.setFocusMode?.(true);
    ui.root?.classList.add('gathering');
    this.touchOff = !ui.root?.classList.contains('no-touch');
    if (this.touchOff) ui.setTouchControls?.(false);
    this.onResize = () => this.hud.resize();
    window.addEventListener('resize', this.onResize);
    // the occluders: depth-only twins of the plant drawn into the paw layer
    this.buildOccluders();
    this.vis = { pv: 0, wx: 0, strain: 0, loose: 0, prog: 0, inBand: false, grip: false, jerk: 0 };
    this.fpsPos = new THREE.Vector3(); this.fpsQ = new THREE.Quaternion();
    this.hook();
    this.promise = new Promise((res) => { this.resolve = res; });
    this.sfx.whoosh();
  }

  /** The stage's frame: +y out of the rock (walls: +y up, +z out of the rock), +z toward the player, +x to the right on screen. */
  frameOf(p) {
    const eye = this.owner.player.eye(new THREE.Vector3());
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    if (p.mount === 'wall') {
      const n = new THREE.Vector3(Math.sin(p.yaw || 0), 0, Math.cos(p.yaw || 0));
      if (n.dot(_v.set(eye.x - p.x, 0, eye.z - p.z)) < 0) n.negate();
      // find the rock face behind the mat
      const w = this.owner.world;
      for (let d = -0.1; d < 0.5; d += 0.01) {
        _v.copy(pos).addScaledVector(n, -d);
        if (w.solidAt(_v.x, _v.y, _v.z)) { pos.copy(pos).addScaledVector(n, -(d - 0.012)); break; }
      }
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(up, n).normalize();
      return { pos, up, toward: n, right, mount: 'wall' };
    }
    const up = new THREE.Vector3(0, p.mount === 'ceil' ? -1 : 1, 0);
    const toward = new THREE.Vector3(eye.x - p.x, 0, eye.z - p.z);
    if (toward.lengthSq() < 1e-4) { const f = this.owner.player.forward(new THREE.Vector3()); toward.set(-f.x, 0, -f.z); }
    toward.normalize();
    const right = new THREE.Vector3().crossVectors(up, toward).normalize();
    return { pos, up, toward, right, mount: p.mount || 'floor' };
  }

  /** Pick the close-up camera: look at the plant from the player's side, fit it, stay out of the rock. */
  frameCamera() {
    const st = this.stage, at = this.at;
    const f = st.focus();
    const target = st.toWorld(f.at, new THREE.Vector3());
    const aspect = this.game.engine.width / this.game.engine.height;
    const portrait = aspect < 0.85;
    this.fov = portrait ? 62 : 48;
    const vfov = THREE.MathUtils.degToRad(this.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    let dist = Math.max((f.h / 0.56) / 2 / Math.tan(vfov / 2), (f.w / (portrait ? 0.66 : 0.48)) / 2 / Math.tan(hfov / 2));
    dist = clamp(dist, 0.34, portrait ? 1.3 : 1.05);
    const world = this.owner.world;
    const wall = at.mount === 'wall';
    const elev0 = this.down ? -0.55 : wall ? 0.12 : this.spec.tech === 'pick' ? 0.3 : this.spec.tech === 'dig' ? 0.62 : 0.38; // look down onto floor plants, up at ceiling ones
    const elevs = this.down ? [elev0, -0.8, -0.32] : wall ? [elev0, 0.35, -0.1] : [elev0, 0.6, 0.22, 0.85];
    // rock, and the props standing round it (big mushrooms, crates...): the camera keeps clear of both
    const near = this.propsNear(target, dist + 0.4);
    const blocked = (x, y, z) => {
      if (world.solidAt(x, y, z)) return true;
      for (const q of near) if (y > q.bot - 0.03 && y < q.top + 0.03 && (q.cx - x) ** 2 + (q.cz - z) ** 2 < (q.rad * 0.8 + 0.04) ** 2) return true;
      return false;
    };
    let best = null;
    this.camWant = dist;
    search: for (const elev of elevs) {
      for (const yawOff of [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35, 1.8, -1.8]) {
        const dir = new THREE.Vector3().copy(at.toward).applyAxisAngle(WORLD_UP, yawOff);
        dir.multiplyScalar(Math.cos(elev)).addScaledVector(WORLD_UP, Math.sin(elev)).normalize();
        const side = _v2.crossVectors(dir, WORLD_UP).normalize();
        // walk out from the plant until rock gets in the way (a little tube, not a thin ray)
        let free = dist + 0.1;
        for (let d = 0.1; d <= dist + 0.1; d += 0.025) {
          _v.copy(target).addScaledVector(dir, d);
          const r = Math.min(0.07, d * 0.25);
          if (blocked(_v.x, _v.y, _v.z) || blocked(_v.x, _v.y + r, _v.z) || blocked(_v.x + side.x * r, _v.y, _v.z + side.z * r) || blocked(_v.x - side.x * r, _v.y, _v.z - side.z * r)) { free = d - 0.06; break; }
        }
        const score = Math.min(free, dist) - Math.abs(yawOff) * 0.05 - Math.abs(elev - elev0) * 0.08;
        if (!best || score > best.score) best = { score, d: Math.min(free, dist), dir };
        if (free >= dist && yawOff === 0 && elev === elev0) break search;
      }
    }
    const d = Math.max(0.26, best.d);
    // closer than wanted (a tight spot): widen the view instead
    if (d < dist - 0.02) this.fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(vfov / 2) * dist / d)), this.fov, portrait ? 78 : 70);
    this.camPos = new THREE.Vector3().copy(target).addScaledVector(best.dir, d);
    // the plant sits a little left of centre on wide screens (the gauge is on the right)
    const side = new THREE.Vector3().crossVectors(best.dir, WORLD_UP).normalize();
    this.camLook = target.clone().addScaledVector(side, portrait ? 0 : -d * 0.1).addScaledVector(WORLD_UP, f.h * (portrait ? 0.02 : 0.08) * (this.down ? -1 : 1));
    _m.lookAt(this.camPos, this.camLook, WORLD_UP);
    this.camQ = new THREE.Quaternion().setFromRotationMatrix(_m);
    this.camDist = d;
  }

  /** Props (not this plant) within r of a point: read-only, to keep the close-up camera clear of them. */
  propsNear(p, r) {
    const out = [];
    try {
      for (const rec of this.props?.built?.values?.() || []) {
        if (!rec.props || Math.abs(rec.x - p.x) > r + 2 || Math.abs(rec.y - p.y) > r + 2 || Math.abs(rec.z - p.z) > r + 2) continue;
        for (const q of rec.props) if (!q.gone && q.m && q !== this.plant && q.mount !== 'wall' && Math.hypot(q.cx - p.x, q.cy - p.y, q.cz - p.z) < r) out.push(q);
      }
    } catch (e) { /* props changed shape: rock only */ }
    return out;
  }

  // ------------------------------------------------------------ frame hook
  hook() {
    const vm = this.owner.vm;
    this.owner.gather = this;
    if (vm) {
      const orig = vm.update;
      const self = this;
      const wrap = function (dt, o) { self.frame(dt); return orig.call(this, dt, o); };
      vm.update = wrap;
      this.unhookFn = () => { if (vm.update === wrap) { if (Object.getPrototypeOf(vm).update === orig) delete vm.update; else vm.update = orig; } };
    } else {
      const own = this.owner;
      const orig = own.render;
      const self = this;
      let last = performance.now();
      const wrap = function () { const now = performance.now(); self.frame(Math.min(0.05, (now - last) / 1000)); last = now; return orig.call(this); };
      own.render = wrap;
      this.unhookFn = () => { if (own.render === wrap) delete own.render; };
    }
  }
  get active() { return this.phase !== 'done'; }

  /** Once per scene frame, after the scene placed its camera. */
  frame(dt) {
    const stamp = this.owner.time;
    if (stamp === this.stamp || this.phase === 'done') return;
    this.stamp = stamp;
    this.step(Math.min(dt, 1 / 20));
  }

  step(dt, scripted = null) {
    const t0 = performance.now();
    try { this.stepIn(dt, scripted); } finally { const ms = performance.now() - t0; this.ms = this.ms === undefined ? ms : this.ms * 0.95 + ms * 0.05; this.msMax = Math.max(this.msMax || 0, ms); }
  }
  stepIn(dt, scripted) {
    const cam = this.owner.camera;
    this.fpsPos.copy(cam.position); this.fpsQ.copy(cam.quaternion);
    this.t += dt; this.pt += dt;
    // ---- phases
    let inp = NONE;
    if (this.phase === 'in') {
      this.camK = ease(this.pt / 0.6);
      this.reach = ease((this.pt - 0.1) / 0.5);
      if (this.pt >= 0.6) this.go('play');
    } else if (this.phase === 'play') {
      inp = scripted || (this.keep && this.driving === false ? this.keep : null) || (this.paused ? NONE : this.input.read(dt));
      if (!this.paused || scripted) this.sim.update(dt, inp);
      for (const e of this.sim.ev) this.onEvent(e);
      this.sim.ev.length = 0;
      if (this.sim.done) this.go('end');
    } else if (this.phase === 'end') {
      for (const e of this.sim.ev) this.onEvent(e);
      this.sim.ev.length = 0;
      if (this.pt > (this.sim.done.snapped ? 0.55 : 0.7)) this.go('show');
    } else if (this.phase === 'show') {
      const any = this.input.takeAny();
      if ((any && this.pt > 0.6) || this.pt > (this.holdShow ? 1e9 : 3.2)) this.go('out');
    } else if (this.phase === 'out') {
      this.camK = 1 - ease(this.pt / 0.5);
      this.reach = 1 - ease(this.pt / 0.35);
      // let go: the real plant comes back a moment before its stand-in goes (no blink)
      if (this.cancelled && this.pt > 0.38 && !this.unhid) { this.unhid = true; if (this.plant.rec) this.props.hidePlant?.(this.plant, false); }
      if (this.pt >= 0.5) { this.finish(); return; }
    }
    // ---- visuals from the sim (smoothed a touch)
    const sim = this.sim, v = this.vis;
    const off = this.cancelled; // letting go: it springs back
    v.pv = damp(v.pv, off ? 0 : sim.pv ?? 0, off ? 8 : 20, dt);
    v.wx = damp(v.wx, off ? 0 : (sim.wx ?? 0) * (this.down ? -1 : 1), 20, dt);
    v.strain = off ? 0 : sim.strain ?? 0;
    v.loose = sim.loose ?? 0;
    v.prog = sim.prog ?? 0;
    v.inBand = !!sim.inBand;
    v.grip = !!sim.wasGrip;
    v.jerk = sim.jerk ?? 0;
    const P = typeof window !== 'undefined' && window.__gather?.prof ? (this.profT = this.profT || {}) : null;
    let tq = P ? performance.now() : 0;
    const lap = (k) => { if (!P) return; const n = performance.now(); P[k] = Math.max(P[k] || 0, n - tq); tq = n; };
    lap('sim');
    this.applyCamera(dt);
    lap('camera');
    this.stage.update(dt, v, cam);
    // held up after the pop: this has the last word on where the plant is (stages pose it too)
    if ((this.phase === 'show' || this.phase === 'out') && this.showFrom && !this.cancelled && !this.sim.done?.snapped) this.present(dt);
    lap('stage');
    this.paws(dt);
    lap('paws');
    this.syncOccluders();
    lap('occ');
    // the grass round the plant leans aside while you work on it
    const veg = this.owner.vegetation?.U;
    if (veg?.uPush?.value?.[2] && veg.uPushK?.value && this.reach > 0.01) {
      const P = this.at.pos;
      // (pressed right down, tips into the soil: big fronds would otherwise lie across the close-up)
      veg.uPush.value[1].set(P.x, P.y - (this.down ? 0.2 : 0), P.z, 0.36);
      veg.uPushK.value[1] = this.reach * 2.4;
      // and the stuff between us and it, so nothing stands in front of the close-up
      _v.copy(this.camPos).lerp(P, 0.4);
      // and once it's held up, the stuff round where it's held
      if (this.showGoal && this.showK > 0 && !this.cancelled) _v.lerp(this.showGoal, this.showK);
      veg.uPush.value[2].set(_v.x, P.y, _v.z, 0.5);
      veg.uPushK.value[2] = this.reach * 2;
    }
    this.hudFrame(dt);
    lap('hud');
    if (this.light && this.plant.light) {
      const hw = this.stage.headWorld(_v);
      this.plant.light.x = hw.x; this.plant.light.y = hw.y; this.plant.light.z = hw.z;
    }
    // the fibres creak and tick with the tension you hold
    if (this.phase === 'play') this.sfx.tension(dt, sim.wasGrip ? (sim.pv ?? 0) : 0, sim.strain ?? 0);
  }

  go(phase) {
    this.phase = phase;
    this.pt = 0;
    if (phase === 'play') this.started = true;
    if (phase === 'show') {
      const r = this.sim.done;
      this.hud.result(r);
      this.sfx.result(r.q, r.p);
      this.input.takeAny();
      this.showFrom = this.stage.plant.position.clone();
      this.showQ = this.stage.plant.quaternion.clone();
    }
    if (phase === 'out') {
      this.sfx.stop();
      if (!this.cancelled) this.sfx.play('pickup', { pitch: 1.2, vol: 0.5 });
      this.outFrom = this.stage.plant.position.clone();
    }
  }

  // ------------------------------------------------------------ the camera
  applyCamera(dt) {
    const cam = this.owner.camera, k = this.camK;
    // a held, breathing close-up: a little drift, a shiver as the stem strains, a nod after the pop
    const sh = (this.sim.strain ?? 0) > 0.4 ? (this.sim.strain - 0.4) * 0.006 : 0;
    this.kick = damp(this.kick || 0, 0, 6, dt);
    const sk = this.showCamQ && !this.cancelled ? this.showK || 0 : 0;
    _v.copy(this.camPos);
    if (sk > 0) _v.lerp(this.showCamPos, sk);
    _v.x += Math.sin(this.t * 0.9) * 0.003 + (Math.random() - 0.5) * sh;
    _v.y += Math.sin(this.t * 1.3) * 0.002 + (Math.random() - 0.5) * sh - this.kick * 0.01;
    cam.position.lerpVectors(this.fpsPos, _v, k);
    // a little arc on the way in and out: the mole leans down to it
    if (k > 0 && k < 1) cam.position.y += Math.sin(Math.PI * k) * 0.035 * (this.down ? -1 : 1);
    _q.copy(this.camQ);
    if (this.vis.pv > 0 && this.phase === 'play') _q.multiply(new THREE.Quaternion().setFromAxisAngle(_v2.set(1, 0, 0), this.vis.pv * 0.02 * (this.down ? -1 : 1)));
    if (sk > 0) _q.slerp(this.showCamQ, sk);
    cam.quaternion.slerpQuaternions(this.fpsQ, _q, k);
    const fov0 = this.owner.fov || 74;
    const fovC = this.fov + ((this.showFov || this.fov) - this.fov) * sk;
    cam.fov = fov0 + (fovC - fov0) * k;
    const post = this.owner.post;
    if (post) { if (this.vig0 === undefined) this.vig0 = post.vignette ?? 0.5; post.vignette = this.vig0 + (0.95 - this.vig0) * k; }
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.owner.fx?.setPixelScale?.(this.game.engine.height, cam.fov);
  }

  /** Where it's held up for its result (worked out once, at the start of the show). */
  planShow() {
    const st = this.stage;
    const portrait = this.game.engine.width / this.game.engine.height < 0.85;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camQ);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camQ);
    const sz = st.showSize?.();
    const span = sz ? sz.span : st.model ? st.model.stemLen + st.model.headH + (st.model.body?.depth ?? 0.03) + 0.05 : st.focus().h;
    const wide = sz ? sz.w : st.focus().w;
    const aspect = this.game.engine.width / this.game.engine.height;
    const vf = THREE.MathUtils.degToRad(this.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
    const fit = Math.max(span * 1.55 / (2 * Math.tan(vf / 2)), wide / (portrait ? 0.7 : 0.4) / (2 * Math.tan(hf / 2)));
    // along the line to where it grew (open air), never past it, and not into the ground
    const dist = clamp(fit, 0.3, this.camDist * 0.82);
    const side = portrait ? 0 : dist * 0.26;
    const goal = this.camPos.clone().addScaledVector(fwd, dist).addScaledVector(right, side);
    // the mole leans back a little to admire it, if there's room behind
    const w = this.owner.world;
    let back = 0;
    for (let b = 0.06; b <= 0.3; b += 0.04) {
      _v.copy(this.camPos).addScaledVector(fwd, -b);
      if (w.solidAt(_v.x, _v.y, _v.z) || w.solidAt(_v.x, _v.y + 0.1, _v.z) || w.solidAt(_v.x, _v.y - 0.1, _v.z) || w.solidAt(_v.x + right.x * 0.1, _v.y, _v.z + right.z * 0.1) || w.solidAt(_v.x - right.x * 0.1, _v.y, _v.z - right.z * 0.1)) break;
      back = b - 0.04;
    }
    this.showCamPos = this.camPos.clone().addScaledVector(fwd, -Math.max(0, back));
    if (!this.down && this.at.mount === 'floor') {
      // clear of the ground under it (a long root hangs a way below the paw)
      let top = this.at.pos.y;
      for (const [ox, oz] of [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) {
        for (let y = goal.y + 0.3; y > goal.y - 1.5; y -= 1 / 16) if (w.solidAt(goal.x + ox, y, goal.z + oz)) { top = Math.max(top, y + 1 / 16); break; }
      }
      goal.y = Math.max(goal.y, top + span * 0.5 + 0.05);
    }
    if (portrait) goal.y -= dist * 0.1;
    this.showGoal = goal;
    // the camera turns to it (keeping it off to the side for the tag) and widens if it must
    const look = goal.clone().addScaledVector(right, -side);
    // a touch low in the frame, clear of the name sign at the top
    look.y += portrait ? dist * 0.18 : span * 0.07;
    _m.lookAt(this.showCamPos, look, WORLD_UP);
    this.showCamQ = new THREE.Quaternion().setFromRotationMatrix(_m);
    const d = this.showCamPos.distanceTo(goal);
    const need = THREE.MathUtils.radToDeg(2 * Math.atan(Math.max(span * 0.78, wide * 0.66 / Math.max(0.5, aspect * (portrait ? 0.7 : 0.45))) / d));
    this.showFov = clamp(need, this.fov, portrait ? 84 : 76);
  }

  /** After the pop: the plant is held up in front of the camera, turning slowly, then put away. */
  present(dt) {
    const st = this.stage, cam = this.owner.camera;
    if (!st.middle) return;
    if (!this.showGoal) this.planShow();
    const right = _v2.set(1, 0, 0).applyQuaternion(this.camQ);
    const mid = st.middle(new THREE.Vector3());
    mid.y -= st.showSize?.()?.drop ?? 0; // long roots hang below it
    const goalLocal = st.root.worldToLocal(this.showGoal.clone()).sub(mid);
    if (this.sim.done?.snapped && st.model) goalLocal.y -= st.model.stemLen * 0.2;
    const k = ease(this.phase === 'show' ? this.pt / 0.45 : 1);
    this.showK = k;
    st.plant.position.lerpVectors(this.showFrom, goalLocal, k);
    // a slow turn to show it off
    this.spin = (this.spin || 0) + dt * (this.phase === 'show' ? 0.9 : 0);
    st.plant.quaternion.copy(this.showQ).multiply(_q.setFromAxisAngle(WORLD_UP, Math.sin(this.spin) * 0.5));
    if (this.phase === 'out' && !this.cancelled) {
      // into the bag: down and to the side, shrinking
      const o = easeOut(this.pt / 0.4);
      const down = st.root.worldToLocal(cam.position.clone().addScaledVector(_v3.set(0, -1, 0), 0.4).addScaledVector(right, 0.25)).sub(mid);
      st.plant.position.lerpVectors(goalLocal, down, o);
      st.plant.scale.setScalar(Math.max(0.001, 1 - o));
    }
  }

  // ------------------------------------------------------------ the paws
  /** Steer the view model's paws onto the stage's targets (vm.drive; see ViewModel's header). */
  paws(dt) {
    const vm = this.owner.vm;
    if (!vm || !this.stage.pawTargets) return;
    const cam = this.owner.camera;
    const live = this.phase === 'play' || this.phase === 'in';
    const kR = this.reach;
    const kL = this.reach * (live ? 1 : this.phase === 'end' ? 1 - ease(this.pt / 0.3) : 0);
    const holding = this.phase === 'end' || this.phase === 'show' || this.phase === 'out';
    const gripping = holding ? !this.cancelled && !this.sim.done?.empty : !!this.sim.wasGrip;
    this.stage.root.updateMatrixWorld(true);
    const T = this.stage.pawTargets({ gripping, held: holding && !this.cancelled, brace: kL > 0.01, phase: this.phase, cam });
    const drive = { k: 1 };
    for (const side of ['R', 'L']) {
      const t = T[side];
      const k = side === 'R' ? kR : kL;
      if (!t || k < 0.002) {
        // a paw with nothing to do waits low, out of the way
        if (kR > 0.002) drive[side] = { p: LOW[side].p, q: LOW[side].q, at: [0, 0, 0], grip: false, tool: false, k: kR };
        continue;
      }
      let tp = t.pos;
      if (t.cradle && this.showK > 0 && (this.phase === 'show' || this.phase === 'out')) {
        // held up on the open paw: the palm goes under it, the wrist toward us (not in front of it)
        const sk = this.showK * t.cradle;
        tp = _v3.copy(t.pos).addScaledVector(_v.set(0, 1, 0).applyQuaternion(cam.quaternion), -0.022 * sk).addScaledVector(_v2.set(0, 0, -1).applyQuaternion(cam.quaternion), -0.04 * sk);
      }
      const P = vm.toView(tp, cam, new THREE.Vector3());
      const up = vm.toView(t.up, cam, new THREE.Vector3(), true);
      let q;
      if (t.fist || !t.hover) {
        const f = t.fwdView ? _v.set(t.fwdView[0], t.fwdView[1], t.fwdView[2]) : vm.toView(t.fwd, cam, _v, true);
        q = aim([up.x, up.y, up.z], [f.x, f.y, f.z]);
      } else {
        // an open paw beside it, reaching: back of the paw to us, claws along the stem
        const back = vm.toView(_v2.copy(cam.position).sub(t.pos).normalize(), cam, new THREE.Vector3(), true);
        q = aim([back.x, back.y, back.z], [up.x, up.y, up.z]);
        P.add(_v.set(0.028, -0.01, 0.025));
      }
      drive[side] = { p: P, q, at: [0, 0, 0], grip: !!t.fist, tool: false, k };
    }
    // the forearms come in from the sides, clear of the plant (not up from under it)
    drive.shoulder = { R: [0.62, -0.5, 0.05], L: [-0.62, -0.5, 0.05] };
    vm.drive = kR > 0.001 ? drive : null;
  }

  // ------------------------------------------------------------ occluders (plant in front of paws)
  buildOccluders() {
    const vm = this.owner.vm;
    this.twins = [];
    if (!vm) return;
    this.depthMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    for (const m of this.stage.occluders) {
      const t = new THREE.Mesh(m.geometry, this.depthMat);
      t.matrixAutoUpdate = false;
      t.frustumCulled = false;
      t.renderOrder = -10;
      vm.scene.add(t);
      this.twins.push([m, t]);
    }
    this.Kz = new THREE.Matrix4();
  }
  syncOccluders() {
    const vm = this.owner.vm, cam = this.owner.camera;
    if (!vm) return;
    // meshes the stage added since (a handful of berries...) get their twins too
    while (this.twins.length < this.stage.occluders.length) {
      const m = this.stage.occluders[this.twins.length];
      const t = new THREE.Mesh(m.geometry, this.depthMat);
      t.matrixAutoUpdate = false; t.frustumCulled = false; t.renderOrder = -10;
      vm.scene.add(t);
      this.twins.push([m, t]);
    }
    if (!this.twins.length) return;
    const k = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(vm.camera.fov) / 2);
    this.Kz.makeScale(1, 1, k);
    for (const [m, t] of this.twins) {
      m.updateMatrixWorld();
      t.visible = m.visible && this.reach > 0.01;
      t.matrix.multiplyMatrices(this.Kz, cam.matrixWorldInverse).multiply(m.matrixWorld);
      t.matrixWorldNeedsUpdate = true;
    }
  }

  // ------------------------------------------------------------ HUD
  hudFrame(dt) {
    const sim = this.sim, s = this.spec;
    const band = sim.bandAt ? sim.bandAt() : [0, 0];
    this.hud.update(dt, {
      started: this.started, band, snap: sim.snapAt ?? 1, pv: sim.pv ?? 0, inBand: !!sim.inBand, grip: !!sim.wasGrip, strain: sim.strain ?? 0, prog: sim.prog ?? 0,
      loose: sim.loose ?? 0, need: s.needLoose ?? 0.4, heat: sim.heat ?? 0, cold: !!s.cold, phase: sim.phase, cover: sim.cover,
      speed: s.speed, v: sim.v ?? 0, p: sim.p ?? 0, warn: sim.warn ?? 0, tear: sim.tear ?? 0, h: sim.h ?? 0, tilt: sim.tilt ?? 0,
    });
    // floating words from the stage
    const eng = this.game.engine, cam = this.owner.camera, out = [];
    for (const w of this.stage.pops) {
      if (w.shown) continue;
      w.shown = true;
      const p = this.stage.toWorld(w.pos, new THREE.Vector3());
      const sp = eng.toScreen(p, cam);
      out.push({ id: w.id, text: w.text, color: w.color, big: w.big, x: sp.x, y: sp.y });
    }
    if (out.length) this.hud.words(out);
    this.handle?.back.classList.toggle('gripping', !!sim.wasGrip);
  }

  // ------------------------------------------------------------ events
  onEvent(e) {
    const st = this.stage, sfx = this.sfx, top = (st.model?.stemLen ?? 0.2) + (st.model?.headH ?? 0.1);
    st.onEvent?.(e);
    switch (e.type) {
      case 'grip': sfx.grip(); break;
      case 'wiggle': sfx.scrunch(e.amp); break;
      case 'crack': sfx.crack(); break;
      case 'loose': sfx.loose(); st.word('Loose!', '#c8f08a', 0.08, (st.base0 ?? 0) + 0.05, 0); break;
      case 'root': sfx.root(e.rip, e.i); if (e.rip && Math.random() < 0.6) st.word('Rip!', '#ff9a8a', (Math.random() - 0.5) * 0.2, 0.04, 0); break;
      case 'band': if (this.t - (this.bandT || -9) > 1.2) { this.bandT = this.t; sfx.band(); } break;
      case 'creak': sfx.creak(e.k); break;
      case 'spore': sfx.spore(); st.word('Achoo!', '#d8b0f0', 0, top, 0); break;
      case 'burn': sfx.burn(); st.word('Ow! Hot!', '#ff9a4a', 0.05, top * 0.6, 0); this.hud.flash(true); break;
      case 'numb': sfx.numb(); st.word('Brr! Numb paws', '#bff6ff', 0.05, top * 0.6, 0); break;
      case 'pop': {
        const p = !!this.sim.done?.p;
        sfx.pop(p);
        st.word(p ? 'POP! Perfect!' : 'POP!', p ? '#ffe066' : '#fff4d8', 0, top * 0.7, 0, true);
        this.hud.flash();
        this.kick = 1;
        break;
      }
      case 'snap': sfx.snap(); st.word(this.sim.done?.broke ? 'Crack...' : 'SNAP!', '#ff8a7a', 0, top * 0.6, 0, true); this.hud.flash(true); this.kick = 1; break;
    }
  }

  // ------------------------------------------------------------ leaving
  /** Esc / the Leave plaque: let go of the plant (or, once it's out, carry on). */
  escape() {
    if (this.phase === 'show') { this.go('out'); return; }
    if (this.phase === 'end' || this.phase === 'out' || this.phase === 'done') return;
    this.cancelled = true;
    this.sfx.play('brush', { vol: 0.3 });
    this.go('out');
  }
  onClosed() {
    // the panel went away under us (scene change, closeAllPanels): end at once
    this.handle = null;
    if (this.phase !== 'done') { if (!this.sim.done) this.cancelled = true; this.finish(); }
  }
  finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const ui = this.game.ui;
    this.unhookFn?.();
    if (this.owner.gather === this) this.owner.gather = null;
    const vm = this.owner.vm;
    if (vm) {
      vm.drive = null;
      for (const [, t] of this.twins || []) t.parent?.remove(t);
      this.depthMat?.dispose();
    }
    // the camera snaps back to the scene's own next frame; its fov and the particle scale too
    const cam = this.owner.camera;
    if (this.owner.post && this.vig0 !== undefined) this.owner.post.vignette = this.vig0;
    cam.fov = this.owner.fov || 74;
    cam.updateProjectionMatrix();
    this.owner.fx?.setPixelScale?.(this.game.engine.height, cam.fov);
    this.sfx.stop();
    this.input.detach?.();
    window.removeEventListener('resize', this.onResize);
    if (this.handle && !this.handle.closed) { const h = this.handle; this.handle = null; h.onClose = null; this.quietUi(() => h.close()); }
    ui.setFocusMode?.(this.prevFocus);
    ui.root?.classList.remove('gathering');
    if (this.touchOff) ui.setTouchControls?.(true);
    const ok = !this.cancelled && this.sim.done;
    // the turned soil and the hole stay a while where it came out
    if (ok && this.stage.leaveBehind) this.stage.leaveBehind(40); else this.stage.dispose();
    this.hud.dispose();
    if (this.plant.rec) {
      if (this.light && this.plant.light) Object.assign(this.plant.light, this.light);
      if (!ok && !this.unhid) this.props.hidePlant?.(this.plant, false);
    }
    if (active === this) active = null;
    this.resolve(ok ? { ...this.sim.done, fx: true } : { cancel: true });
  }
  /** Open/close the panel without the UI's own chime (this is a camera move, not a menu). */
  quietUi(fn) {
    const a = this.game.audio, play = a.play;
    a.play = (n, o) => (n === 'ui_open' || n === 'ui_close' ? undefined : play.call(a, n, o));
    try { fn(); } finally { a.play = play; }
  }

  // ------------------------------------------------------------ tests
  /** Play a script through the real session for `secs` (fixed 30 fps steps). */
  drive(script = 'good', secs = 3, o = {}) {
    const fn = scriptInput(script, this.sim);
    const dt = 1 / 30;
    let t = 0;
    this.driving = true;
    while (t < secs && this.phase !== 'done') {
      if (o.until && o.until(this)) break;
      this.step(dt, this.phase === 'play' ? { ...NONE, ...fn(t, this.sim) } : null);
      t += dt;
      if (this.phase === 'show' && o.stopAtShow) break;
    }
    this.driving = false;
    this.keep = this.phase === 'play' && o.hold !== false ? { ...NONE, ...fn(t, this.sim) } : null;
    this.paused = !!o.pause;
    return this.state();
  }
  state() {
    const s = this.sim;
    return { id: this.id, phase: this.phase, tech: this.spec.tech, t: Math.round(this.t * 100) / 100, pv: s.pv, prog: s.prog, loose: s.loose, strain: s.strain, done: s.done, prof: this.profT, cam: { d: this.camDist, want: this.camWant, fov: this.fov }, ms: Math.round((this.ms || 0) * 100) / 100, msMax: Math.round((this.msMax || 0) * 100) / 100 };
  }
}

// ---------------------------------------------------------------- test hooks
function scene() { return typeof window !== 'undefined' ? window.__game?.scene : null; }
/** A stand-in plant in front of the player (for testing a kind that hasn't grown nearby). */
function standIn(id, sc) {
  const pl = sc.player, w = sc.world, spec = forageSpec(id);
  const f = pl.forward(new THREE.Vector3());
  f.y = 0; f.normalize();
  const eye = pl.eye(new THREE.Vector3());
  if (spec.tech === 'peel') {
    // the nearest wall ahead (or any side)
    for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
      const d = f.clone().applyAxisAngle(WORLD_UP, turn);
      for (let k = 0.3; k < 2.5; k += 0.03) {
        const x = eye.x + d.x * k, y = eye.y - 0.3, z = eye.z + d.z * k;
        if (w.solidAt(x, y, z)) return { item: id, x: x - d.x * 0.05, y, z: z - d.z * 0.05, mount: 'wall', yaw: Math.atan2(-d.x, -d.z), standIn: true };
      }
    }
  }
  if (spec.form === 'hang') {
    for (const d of [0.8, 0.6, 1, 1.3]) {
      const x = eye.x + f.x * d, z = eye.z + f.z * d;
      for (let y = eye.y; y < eye.y + 3; y += 1 / 16) if (w.solidAt(x, y, z)) return { item: id, x, y: Math.floor(y * 16) / 16, z, mount: 'ceil', yaw: 0, standIn: true };
    }
  }
  const clear = (x, z) => {
    for (const rec of sc.props?.built?.values?.() || []) for (const q of rec.props || []) if (!q.gone && Math.hypot(q.cx - x, q.cz - z) < q.rad + 0.3 && Math.abs(q.cy - eye.y) < 2) return false;
    return true;
  };
  for (const d of [0.85, 0.7, 1, 0.6, 1.2, 1.4]) for (const turn of [0, 0.4, -0.4, 0.8, -0.8]) {
    const fd = f.clone().applyAxisAngle(WORLD_UP, turn);
    const x = eye.x + fd.x * d, z = eye.z + fd.z * d;
    if (!clear(x, z)) continue;
    for (let y = eye.y; y > eye.y - 2.2; y -= 1 / 16) {
      if (!w.solidAt(x, y, z) && w.solidAt(x, y - 1 / 16, z)) {
        const vy = Math.floor((y - 1 / 16) * 16) + 1;
        return { item: id, x, y: vy / 16, z, mount: 'floor', yaw: 0, standIn: true };
      }
    }
  }
  return { item: id, x: eye.x + f.x * 0.8, y: pl.pos.y, z: eye.z + f.z * 0.8, mount: 'floor', yaw: 0, standIn: true };
}
if (typeof window !== 'undefined') {
  window.__gather = {
    get active() { return active; },
    specs: FORAGE,
    sim: simulate,
    /** Start on the nearest real plant (id or any) within r m, else a stand-in in front of the player. */
    open(id = null, o = {}) {
      const sc = scene();
      const props = sc?.props;
      if (!props) return null;
      const e = sc.player.eye(new THREE.Vector3());
      let best = null, bd = o.r ?? 3;
      for (const p of props.plants || []) {
        if (p.gone || !p.m || (id && p.item !== id)) continue;
        const d = Math.hypot(p.cx - e.x, p.cy - e.y, p.cz - e.z);
        if (d < bd) { bd = d; best = p; }
      }
      const plant = best && !o.standIn ? best : standIn(id || 'glowcap', sc);
      if (best && !o.standIn) return props.debugGather?.(best, o) ?? null;
      openGather(props, plant, o).then((r) => { window.__gather.last = r; });
      return active?.state();
    },
    /** Headless: open (stand-in unless o.real), play `script` (or force o.score) to the end; returns the result. */
    run(id = 'glowcap', o = {}) {
      this.open(id, { standIn: !o.real, ...o });
      const s = active;
      if (!s) return null;
      if (o.score !== undefined) { s.drive('soft', 0.7); s.sim.force(o.score); }
      s.drive(o.script || 'good', o.secs ?? 20, { stopAtShow: o.keep });
      return s.sim.done || s.state();
    },
  };
  // the old 2D overlay's test hooks, kept: __forage.sim(id, script) runs headless, open() gathers
  window.__forage = {
    get active() { return active; },
    open: (id, o) => window.__gather.open(id, o),
    sim: simulate,
    specs: FORAGE,
  };
}

export { simulate };
