// First-person view model: the mole's two paws and the held tool, drawn in their own scene and
// camera and composited on top of the world by the engine's overlay pass (they never clip into
// walls). Everything is one skinned mesh plus one small glowing mesh (2 draw calls), riding on
// plain pose groups that the animation layers below drive every frame.
//
//   const vm = new ViewModel();
//   vm.resize(aspect);
//   vm.setTool('pick', { item: 'pick_iron' });   // pick chisel brush drill xray stake beam food none hammer tongs smith
//   vm.update(dt, { speed, grounded, climbing, swimming, look: {dx, dy}, lamp: {color, intensity}, ambient, heat, camera });
//   vm.swing('pick', 0.3); vm.impact('pick', 1); vm.use('drill', true); vm.eat('grub_bar'); vm.hurt();
//   engine.render(world, cam, { overlay: { scene: vm.scene, camera: vm.camera } });
//
// Extras: vm.tipView(out) (tool tip in view-camera space, for sparks and dust), vm.shake (0..1,
// for the world camera), vm.heat (drill heat 0..1, simulated unless update() passes `heat`),
// vm.busy (an action or eat animation is playing), vm.world (a group to add to the WORLD scene
// once: the x-ray beam cone lives there, lined up with the lens; pass `camera` = the world
// camera to update() so it can follow).
//
// Smithing (the forge): 'hammer' (right paw), 'tongs' (left paw) and 'smith' (both). A scene can
// steer the paws onto things in its world with vm.drive = { R, L, k } (each hand: { p, q, at,
// grip, tool } in view-camera space: the tool point `at` (voxels, e.g. HAMMER_FACE / TONGS_JAW)
// lands on p with orientation q; k 0..1 blends from the normal poses), vm.jaw (tongs opening
// 0..1), and update() option `work` (or vm.work) = { pos (view space), color, intensity } for a
// light on the paws from the fire or hot metal. vm.toView(worldPoint, worldCamera, out) maps a world point
// into view space so a paw drawn there sits exactly over it.
import * as THREE from 'three';
import { SkinAssembler, scaleVisible, charMaterial } from '../gfx/char/skin.js';
import {
  forearmGeo, fistGeo, openPawGeo, pickGeo, chiselGeo, malletGeo, brushGeo, drillGeo, xrayGeo,
  stakeGeo, beamGeo, foodGeo, BEAM_GRIP, MALLET_HEAD, metalOf,
} from './viewmodel/parts.js';
import { Pose, P, aim, aimZ, Spring, ease, easeOut, easeIn, clamp, wobble } from './viewmodel/pose.js';
import { XrayBeam } from './viewmodel/beam.js';
import { hammerGeo, tongsGeo, HAMMER_FACE, TONGS_JAW, TONGS_RIVET } from './viewmodel/smith.js';
import { ITEMS } from '../data/items.js';

/** Meters per view-model voxel. */
export const VMV = 0.0035;
export const TOOL_KINDS = ['pick', 'chisel', 'brush', 'drill', 'xray', 'stake', 'beam', 'food', 'none', 'hammer', 'tongs', 'smith'];
export { HAMMER_FACE, TONGS_JAW };

// ---------------------------------------------------------------- poses (right hand, camera space)
const OPEN = P([0.2, -0.165, -0.35], [-0.25, 0.75, 0.62], [-0.3, 0.25, -1]);
const BASE = {
  pick: P([0.17, -0.165, -0.34], [-0.2, 1, -0.32], [-0.8, -0.05, -0.6]),
  chisel: P([0.11, -0.07, -0.44], [-0.35, 0.12, -0.93], [-0.5, 0.85, 0]),
  brush: P([0.125, -0.165, -0.34], [-0.58, 0.5, -0.64], [-0.55, -0.62, -0.6]),
  drill: P([0.14, -0.19, -0.31], [0.05, 1, 0.15], [-0.55, 0.05, -0.85]),
  xray: P([0.15, -0.185, -0.32], [0.05, 1, 0.12], [-0.5, 0.05, -0.86]),
  stake: P([0.125, -0.16, -0.34], [-0.6, 0.5, -0.62], [-0.55, -0.6, -0.6]),
  beam: P([0.135, -0.135, -0.37], [1, 0.04, -0.1], [0, 0.45, -1]),
  food: P([0.13, -0.15, -0.31], [-0.15, 1, 0.3], [-0.35, 0.05, -1]),
  none: OPEN,
  hammer: P([0.17, -0.2, -0.33], [-0.3, 1, -0.25], [-0.8, -0.1, -0.6]),
  tongs: OPEN,
  smith: P([0.17, -0.2, -0.33], [-0.3, 1, -0.25], [-0.8, -0.1, -0.6]),
};
const TONGS_L = P([0.15, -0.2, -0.3], [-0.12, 0.3, -1], [-0.2, -1, -0.25]); // left paw (mirrored on use): tongs out front, jaws down
const HAS_TONGS = new Set(['tongs', 'smith']);
const HAS_HAMMER = new Set(['hammer', 'smith']);
const XRAY_ON = P([0.07, -0.13, -0.34], [0.02, 1, 0.08], [-0.2, 0.08, -1]);
const MALLET = P([0.15, -0.15, -0.36], [-0.42, 1, 0.08], [-0.35, 0.1, -1]); // mirrored onto the left paw
const CLIMB_UP = P([0.13, -0.01, -0.34], [0, 0.18, 1], [-0.12, 1, -0.12]);
const CLIMB_DN = P([0.15, -0.25, -0.32], [0, 0.45, 1], [-0.1, 1, -0.35]);
const SWIM_A = P([0.05, -0.085, -0.42], [-0.45, 0.55, 0.7], [-0.15, 0.25, -1]);
const SWIM_B = P([0.25, -0.11, -0.34], [0.55, 0.45, 0.7], [0.5, 0.2, -1]);
const SWIM_C = P([0.12, -0.2, -0.29], [0.15, 0.5, 0.85], [-0.4, 0.1, -1]);
const SWIPE_UP = P([0.23, -0.07, -0.26], [-0.5, 0.6, 0.7], [-0.25, 0.75, -0.6]);
const SWIPE_HIT = P([0.02, -0.23, -0.44], [-0.4, 0.8, -0.5], [-0.55, -0.6, -0.6]);
const EAT_Q = aim([-0.1, 1, 0.25], [-0.45, 0.05, -1]);
const MOUTH = new THREE.Vector3(0.03, -0.052, -0.225); // where the snack is held for munching (just above the mouth, in view)
const SHOULDER = new THREE.Vector3(0.4, -0.6, 0.06);
const WRIST_Z = 12; // voxels behind the grip/palm centre

const TWO_HANDED = new Set(['drill', 'beam']);
const SWING_TOOLS = new Set(['pick', 'chisel', 'stake', 'beam', 'none', 'drill', 'brush', 'xray', 'food', 'hammer', 'tongs', 'smith']);

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _m4 = new THREE.Matrix4(), _s3 = new THREE.Vector3();
const _c = new THREE.Color(), _c2 = new THREE.Color();
const UNIT = new THREE.Vector3(1, 1, 1);

function colorOf(c, fallback) {
  if (c === undefined || c === null) return _c2.set(fallback);
  if (c.isColor) return _c2.copy(c);
  if (typeof c === 'number') return _c2.set(c);
  if (typeof c === 'object' && 'r' in c) return _c2.setRGB(c.r, c.g, c.b);
  return _c2.set(c);
}

function heatColor(h, out) {
  // cold steel → dull red → orange → yellow-white
  if (h < 0.15) return out.setRGB(0, 0, 0);
  const k = (h - 0.15) / 0.85;
  if (k < 0.5) return out.setRGB(0.9 * k * 2, 0.12 * k * 2, 0);
  return out.setRGB(0.9 + 0.4 * (k - 0.5) * 2, 0.12 + 0.75 * (k - 0.5) * 2, 0.3 * (k - 0.5) * 2);
}

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.01, 10);
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    const g = (parent) => { const o = new THREE.Group(); parent.add(o); return o; };
    this.handR = g(this.rig); this.handL = g(this.rig);
    this.armR = g(this.rig); this.armL = g(this.rig);
    this.toolR = scaleVisible(g(this.handR), UNIT.clone());
    this.toolL = scaleVisible(g(this.handL), UNIT.clone());
    this.foodLGroup = scaleVisible(g(this.handL), UNIT.clone());

    // lights: the helmet lamp from above the eyes, the cave's ambient, and a glow light that the
    // x-ray lens or a hot drill bit cast onto the paws
    this.hemi = new THREE.HemisphereLight(0x8a7a7a, 0x3a2a2a, 1.2);
    this.key = new THREE.DirectionalLight(0xffe0b0, 1.7);
    this.key.position.set(0.12, 0.5, 0.3);
    this.key.target.position.set(0, -0.35, -0.6);
    this.glowLight = new THREE.PointLight(0x7fe7ff, 0, 0.9, 1.6);
    // a light the scene can place on the paws (the forge's fire, hot metal in the tongs)
    this.workLight = new THREE.PointLight(0xff8a3a, 0, 3, 1.4);
    this.scene.add(this.hemi, this.key, this.key.target, this.glowLight, this.workLight);

    // world-side effects (the x-ray beam): the game adds vm.world to its scene once
    this.beam = new XrayBeam();
    this.world = this.beam.group;

    this.mat = charMaterial('toon', true);
    this.glowMat = charMaterial('toon', true);
    this.glowMat.emissive = new THREE.Color(0);

    // state
    this.kind = null;
    this.item = null;
    this.pending = null;
    this.mode = 'tool';
    this.stow = 1; // start lowered and raise the first tool into view
    this.t = 0;
    this.walkPh = 0;
    this.bobAmp = 0;
    this.airT = 0;
    this.grounded = true;
    this.action = null;
    this.using = { brush: false, drill: false, xray: false };
    this.useK = { brush: 0, drill: 0, xray: 0 };
    this.heat = 0;
    this.heatOverride = null;
    this.spinA = 0;
    this.eating = null;
    this.hurtT = 0;
    this.shake = 0;
    this.placed = 0; // stake/beam: time since it was set down (re-arm afterwards)
    this.climbPh = 0;
    this.swimPh = 0;
    this.layout = { x: 1, y: 1 };
    this.sway = { x: new Spring(90, 13), y: new Spring(90, 13) };
    this.land = new Spring(170, 15);
    this.recoil = new Spring(220, 16);
    this.R = new Pose(); this.L = new Pose();
    this.tmp = new Pose(); this.tmp2 = new Pose();
    this.leftFood = null;
    // external steering (smithing): see the header
    this.drive = null;
    this.work = null; // default for update()'s `work` option
    this.driveK = 0;
    this.jaw = 0;
    this.jawK = 0;
    this.jaws = null;
    this.skin = null;
    this.bones = [];
    this.tool = {};
    this.resize(16 / 9);
  }

  // ---------------------------------------------------------------- API
  /** Fit the camera and the paw layout to the screen (narrow screens widen the FOV and pull the paws in). */
  resize(aspect) {
    this.camera.aspect = aspect;
    // narrow (portrait) screens: a much taller view (so the horizontal one is not tiny), the paws
    // pulled in toward the middle and pushed down to the bottom edge
    const k = clamp((aspect - 0.45) / (1.3 - 0.45), 0, 1);
    this.camera.fov = 60 + (1 - k) * 16;
    this.camera.updateProjectionMatrix();
    const L = this.layout;
    L.x = 0.56 + 0.44 * k;
    L.y = 1 + (1 - k) * 0.22;
    L.z = 1;
    // and the whole view model drawn smaller, shrunk toward the bottom centre of the view
    L.s = 1 - (1 - k) * 0.34;
    L.pivot = new THREE.Vector3(0, -0.24, -0.36);
    // the authored poses, pulled in for narrow screens (so sockets and blows stay exact)
    const fit = (pose) => { const o = pose.clone(); o.p.set(o.p.x * L.x, o.p.y * L.y, o.p.z * L.z); return o; };
    this.P = { base: {} };
    for (const [key, pose] of Object.entries(BASE)) this.P.base[key] = fit(pose);
    Object.assign(this.P, {
      open: fit(OPEN), xrayOn: fit(XRAY_ON), mallet: fit(MALLET), tongsL: fit(TONGS_L),
      climbUp: fit(CLIMB_UP), climbDn: fit(CLIMB_DN), swimA: fit(SWIM_A), swimB: fit(SWIM_B), swimC: fit(SWIM_C),
      swipeUp: fit(SWIPE_UP), swipeHit: fit(SWIPE_HIT),
      mouth: new THREE.Vector3(MOUTH.x * L.x, MOUTH.y * L.y, MOUTH.z),
      shoulder: new THREE.Vector3(SHOULDER.x * (0.4 + 0.6 * L.x), SHOULDER.y * L.y, SHOULDER.z),
    });
  }

  /** Equip a tool. item: the item id that tints it (e.g. 'pick_steel'). Animates a swap when visible. */
  setTool(kind, opts = {}) {
    if (!TOOL_KINDS.includes(kind)) kind = 'none';
    const item = opts.item ?? null;
    if (kind === this.kind && item === this.item && !this.pending) return;
    if (this.kind === null) { this.kind = kind; this.item = item; this.rebuild(); return; }
    this.pending = { kind, item };
  }

  /** Wind up a strike that lands `dur` seconds from now. */
  swing(kind = this.kind, dur = 0.3) {
    if (this.mode !== 'tool' || this.pending) return;
    this.action = { kind: SWING_TOOLS.has(this.kind) ? this.kind : kind, t: 0, dur: Math.max(0.08, dur) };
  }

  /** Contact: recoil and shake (strength 0..1+). */
  impact(kind = this.kind, strength = 1) {
    const s = clamp(strength, 0, 2);
    const k = kind === 'drill' ? 0.3 : kind === 'brush' ? 0.15 : kind === 'chisel' ? 0.6 : 1;
    this.recoil.kick(9 * s * k);
    this.shake = Math.max(this.shake, 0.35 * s * k);
  }

  /** Continuous use: 'brush' scrubbing, 'drill' spinning (heats up), 'xray' beam. */
  use(kind, on) {
    if (kind in this.using) this.using[kind] = !!on;
  }

  /** Bring a snack to the mouth and munch it (the right paw when holding food, else the left). */
  eat(itemId) {
    if (this.eating) return;
    const hand = this.kind === 'food' ? 'R' : 'L';
    this.eating = { t: 0, id: itemId, hand, bites: 3 };
    if (hand === 'L' && itemId !== this.leftFood) { this.leftFood = itemId; this.rebuild(); }
  }

  /** A pained flinch. */
  hurt() {
    this.hurtT = 0.5;
    this.shake = Math.max(this.shake, 0.6);
    this.recoil.kick(-5);
  }

  get busy() { return !!(this.action || this.eating); }

  /** Tool tip (or claw tips) in view-camera space. */
  tipView(out = new THREE.Vector3()) {
    const tip = this.tool.tip || [0, 0, -26];
    const parent = this.tool.tip ? this.toolR : this.handR;
    this.rig.updateMatrixWorld(true);
    return parent.localToWorld(out.set(tip[0] * VMV, tip[1] * VMV, tip[2] * VMV));
  }

  /**
   * Map a world point into this view-model camera's space so that something drawn there lines up
   * with it on screen (the world camera may have a different field of view): x and y stay, the
   * depth stretches by the ratio of the two views. Directions: pass dir = true (normalised).
   */
  toView(p, worldCam, out = new THREE.Vector3(), dir = false) {
    out.copy(p);
    if (dir) out.transformDirection(worldCam.matrixWorldInverse);
    else out.applyMatrix4(worldCam.matrixWorldInverse);
    const k = Math.tan(THREE.MathUtils.degToRad(worldCam.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    out.z *= k;
    return dir ? out.normalize() : out;
  }

  dispose() {
    this.clearSkin();
    this.mat.dispose();
    this.glowMat.dispose();
    this.beam.dispose();
    this.world.parent?.remove(this.world);
  }

  // ---------------------------------------------------------------- building
  clearSkin() {
    if (this.skin) {
      for (const m of [this.skin.main, this.skin.detail]) if (m) { m.parent?.remove(m); m.geometry.dispose(); }
      this.skin.skeleton.dispose();
      this.skin = null;
    }
    for (const b of this.bones) b.parent?.remove(b);
    this.bones = [];
    for (const g of [this.toolR, this.toolL, this.foodLGroup]) for (const c of [...g.children]) g.remove(c);
  }

  /** Assemble arms, paws, the current tool and the left paw's items into one skinned mesh. */
  rebuild() {
    this.clearSkin();
    const A = new SkinAssembler();
    const V = VMV, S = [V, V, V], M = [-V, V, V];
    A.part(this.armR, forearmGeo(), { scale: S });
    A.part(this.armL, forearmGeo(), { scale: M });
    this.gripR = scaleVisible(A.part(this.handR, fistGeo(), { scale: S }));
    this.openR = scaleVisible(A.part(this.handR, openPawGeo(), { scale: S }));
    this.gripL = scaleVisible(A.part(this.handL, fistGeo(), { scale: M }));
    this.openL = scaleVisible(A.part(this.handL, openPawGeo(), { scale: M }));
    const T = (this.tool = { kind: this.kind, glow: null, tip: null, socket: null, spin: null, light: null, food: null });
    const kind = this.kind, item = this.item;
    const sub = (parent, pos) => { const o = new THREE.Group(); o.position.set(pos[0] * V, pos[1] * V, pos[2] * V); parent.add(o); return o; };
    if (kind === 'pick') {
      const p = pickGeo(item || 'pick_rusty');
      A.part(this.toolR, p.geo, { scale: S });
      if (p.glow) { A.part(this.toolR, p.glow, { scale: S, layer: 'detail' }); T.glow = { color: p.runeColor, k: 0.6 }; }
      T.tip = [0, 66, -44];
    } else if (kind === 'chisel') {
      A.part(this.toolR, chiselGeo(item || 'chisel_basic'), { scale: S });
      A.part(this.toolL, malletGeo(), { scale: S });
      T.tip = [0, 48, 0];
      T.butt = [0, -33, 0];
    } else if (kind === 'brush') {
      A.part(this.toolR, brushGeo(item || 'brush_basic'), { scale: S });
      T.tip = [0, 40, 0];
    } else if (kind === 'drill') {
      const d = drillGeo(item || 'drill_steam');
      A.part(this.toolR, d.geo, { scale: S });
      T.spin = sub(this.toolR, d.chuck);
      A.part(T.spin, d.bitGeo, { scale: S, layer: 'detail' });
      T.socket = { pos: d.socket.pos, q: aim(d.socket.up, d.socket.fwd) };
      T.tip = [d.chuck[0], d.chuck[1], d.chuck[2] - 38];
      T.light = [d.chuck[0], d.chuck[1], d.chuck[2] - 12];
    } else if (kind === 'xray') {
      const x = xrayGeo(item || 'xray_lamp');
      A.part(this.toolR, x.geo, { scale: S });
      A.part(this.toolR, x.lensGeo, { scale: S, layer: 'detail' });
      T.glow = { color: x.color, k: 0.35 };
      T.lensColor = x.color;
      T.tip = x.lens;
      T.light = [x.lens[0], x.lens[1], x.lens[2] - 6];
    } else if (kind === 'stake') {
      const s = stakeGeo();
      A.part(this.toolR, s.geo, { scale: S });
      A.part(this.toolR, s.crystalGeo, { scale: S, layer: 'detail' });
      T.glow = { color: s.color, k: 0.32 };
      T.tip = [0, 46, 0];
      T.light = [0, 38, 0];
    } else if (kind === 'beam') {
      A.part(this.toolR, beamGeo(), { scale: S });
      T.socket = { pos: [0, -2 * BEAM_GRIP, 0], q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI)) };
      T.tip = [0, -BEAM_GRIP, -8];
    } else if (kind === 'food') {
      const F = [V * 1.35, V * 1.35, V * 1.35];
      T.food = [0, 1, 2, 3].map((st) => scaleVisible(A.part(this.toolR, foodGeo(item || 'grub_bar', st), { scale: F })));
      T.food.forEach((b, i) => { b.visible = i === 0; });
      T.tip = [0, 20, 0];
    }
    if (HAS_HAMMER.has(kind)) {
      A.part(this.toolR, hammerGeo(), { scale: S });
      T.tip = HAMMER_FACE;
    }
    this.jaws = null;
    if (HAS_TONGS.has(kind)) {
      // tongs in the left paw: the reins, two jaw bones on the rivet, and the jaws' inner faces
      // on the glowing layer (they heat up holding hot work)
      const tg = tongsGeo();
      A.part(this.toolL, tg.reins, { scale: M });
      const ja = A.part(this.toolL, tg.jawA, { scale: M, pos: [0, TONGS_RIVET * V, 0] });
      const jb = A.part(this.toolL, tg.jawB, { scale: M, pos: [0, TONGS_RIVET * V, 0] });
      A.attach(ja, tg.tipA, 'detail');
      A.attach(jb, tg.tipB, 'detail');
      this.jaws = [ja, jb];
      T.tongs = true;
    }
    // the snack the left paw is eating
    this.foodL = null;
    if (this.leftFood) {
      const F = [V * 1.35, V * 1.35, V * 1.35];
      this.foodL = [0, 1, 2, 3].map((st) => scaleVisible(A.part(this.foodLGroup, foodGeo(this.leftFood, st), { scale: F })));
      this.foodL.forEach((b, i) => { b.visible = i === 0; });
    }
    this.metal = metalOf(kind, item);
    const skin = A.build(this.mat, new THREE.Sphere(new THREE.Vector3(), 2));
    for (const m of [skin.main, skin.detail]) if (m) { m.frustumCulled = false; this.rig.add(m); }
    if (skin.detail) skin.detail.material = this.glowMat;
    this.skin = skin;
    this.bones = A.bones;
  }

  // ---------------------------------------------------------------- frame
  update(dt, o = {}) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const t = this.t;
    const speed = o.speed ?? 0;
    const grounded = o.grounded ?? true;
    const look = o.look || { dx: 0, dy: 0 };
    this.heatOverride = typeof o.heat === 'number' ? o.heat : null;

    // ---- mode changes and tool swaps go through a quick lower-and-raise
    const want = o.climbing ? 'climb' : o.swimming ? 'swim' : 'tool';
    const switching = want !== this.mode || this.pending;
    if (switching && !this.eating) {
      this.stow = Math.min(1, this.stow + dt * 7);
      if (this.stow >= 1) {
        this.mode = want;
        if (this.pending) {
          this.kind = this.pending.kind; this.item = this.pending.item; this.pending = null;
          this.action = null; this.placed = 0;
          this.rebuild();
        }
      }
    } else this.stow = Math.max(0, this.stow - dt * 4.5);

    // ---- timers
    const act = this.action;
    if (act) { act.t += dt; if (act.t > act.dur + 0.55 && !(act.kind === 'stake' || act.kind === 'beam') || act.t > act.dur + 1.1) this.action = null; }
    if (this.eating) { this.eating.t += dt; if (this.eating.t > 1.45) this.finishEat(); }
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt);
    this.shake = Math.max(0, this.shake - dt * 3.2);
    for (const k in this.useK) this.useK[k] += ((this.using[k] && this.kind === k && this.mode === 'tool' ? 1 : 0) - this.useK[k]) * Math.min(1, dt * 10);
    const drilling = this.useK.drill;
    if (this.heatOverride !== null) this.heat = this.heatOverride;
    else this.heat = clamp(this.heat + (this.using.drill && this.kind === 'drill' ? dt * 0.32 : -dt * 0.22), 0, 1);
    this.spinA += dt * drilling * 30;

    // ---- locomotion state
    if (!grounded) this.airT += dt;
    else {
      if (!this.grounded && this.airT > 0.12) this.land.kick(-Math.min(3, 1 + this.airT * 3));
      this.airT = 0;
    }
    this.grounded = grounded;
    const moving = grounded && this.mode === 'tool' ? clamp(speed / 3.2, 0, 1.5) : 0;
    this.bobAmp += (moving - this.bobAmp) * Math.min(1, dt * 6);
    this.walkPh += dt * (3.2 + speed * 2.1) * (moving > 0.02 ? 1 : 0);
    if (this.mode === 'climb') this.climbPh += dt * (2.2 + speed * 2.4);
    if (this.mode === 'swim') this.swimPh += dt * (2.4 + speed * 1.2);

    // ---- hand poses
    const R = this.R, L = this.L;
    let gripR = true, gripL = false, toolVis = true, leftItem = this.kind === 'chisel';
    if (this.mode === 'climb') {
      this.climbPose(R, this.climbPh);
      this.climbPose(L, this.climbPh + Math.PI).mirror();
      gripR = false; toolVis = false; leftItem = false;
    } else if (this.mode === 'swim') {
      this.swimPose(R, this.swimPh);
      this.swimPose(L, this.swimPh).mirror();
      gripR = false; toolVis = false; leftItem = false;
    } else {
      const P = this.P;
      R.copy(P.base[this.kind] || P.open);
      if (this.kind === 'none') gripR = false;
      // breathing
      R.rot(Math.sin(t * 1.9) * 0.012, 0, Math.sin(t * 0.8) * 0.01);
      if (this.kind === 'chisel') L.copy(P.mallet).mirror();
      else if (HAS_TONGS.has(this.kind)) L.copy(P.tongsL).mirror();
      else L.copy(P.open).mirror();
      L.rot(Math.sin(t * 1.9 + 0.6) * 0.012, 0, 0);
      gripL = this.kind === 'chisel' || HAS_TONGS.has(this.kind);
      if (HAS_TONGS.has(this.kind)) leftItem = true;
      this.toolLayers(R, L, dt);
      if (this.tool.socket && !(this.eating && this.eating.hand === 'L')) {
        // the off paw holds the tool's second grip (rides on the right paw + tool)
        _v.set(this.tool.socket.pos[0] * VMV, this.tool.socket.pos[1] * VMV, this.tool.socket.pos[2] * VMV).applyQuaternion(R.q).add(R.p);
        L.p.copy(_v);
        L.q.copy(R.q).multiply(this.tool.socket.q);
        gripL = true;
      }
      // stake/beam: it stays where it was set (the paw lets go), then a fresh one comes up
      if (this.placed > 0) { toolVis = this.placed < 0.08 || this.placed > 0.62; if (!toolVis) gripR = false; }
      // a scene steering the paws onto its world (smithing)
      const d = this.drive;
      this.driveK += ((d ? d.k ?? 1 : 0) - this.driveK) * Math.min(1, dt * 9);
      if (d && this.driveK > 0.001) {
        const f = this.applyDrive(R, L, d, this.driveK);
        if (f.R) { gripR = f.R.grip; toolVis = f.R.tool; }
        if (f.L) { gripL = f.L.grip; leftItem = f.L.tool; }
      }
    }
    if (this.mode !== 'tool') this.driveK = Math.max(0, this.driveK - dt * 9);

    // ---- eating
    if (this.eating) {
      const e = this.eating;
      const hand = e.hand === 'R' ? R : L;
      const up = easeOut(e.t / 0.3), down = ease((e.t - 1.12) / 0.3);
      const k = Math.min(up, 1 - down);
      const nom = e.t > 0.3 && e.t < 1.12 ? Math.max(0, Math.sin(((e.t - 0.3) / 0.27) * Math.PI * 2)) : 0;
      this.tmp.q.copy(EAT_Q);
      if (e.hand === 'L') this.tmp.q.set(EAT_Q.x, -EAT_Q.y, -EAT_Q.z, EAT_Q.w);
      const M = this.P.mouth;
      _v.set(e.hand === 'L' ? -M.x : M.x, M.y - nom * 0.014, M.z + nom * 0.02);
      this.tmp.p.copy(_v).sub(_v2.set(0, 26 * VMV, 0).applyQuaternion(this.tmp.q));
      hand.mix(this.tmp, k);
      const other = e.hand === 'R' ? L : R;
      other.move(0, -0.035 * k, 0.015 * k);
      if (e.hand === 'L') { gripL = true; leftItem = false; }
      const stage = Math.min(3, Math.max(0, Math.floor((e.t - 0.3) / 0.27) + (e.t > 0.3 ? 1 : 0)));
      const parts = e.hand === 'L' ? this.foodL : this.tool.food;
      if (parts) parts.forEach((b, i) => { b.visible = i === Math.min(stage, 3) && e.t < 1.2; });
    }

    // ---- hurt flinch
    if (this.hurtT > 0) {
      const k = Math.sin((this.hurtT / 0.5) * Math.PI) * (this.hurtT / 0.5);
      R.move(0.02 * k, -0.05 * k, 0.05 * k).rot(0.35 * k, 0, -0.2 * k);
      L.move(-0.02 * k, -0.05 * k, 0.05 * k).rot(0.35 * k, 0, 0.2 * k);
    }

    // ---- recoil spring (impacts)
    const rc = this.recoil.step(dt);
    R.rot(rc * 0.02, 0, 0).move(0, 0, rc * 0.0025);

    // ---- apply hands (layout fit for narrow screens)
    this.place(this.handR, R);
    this.place(this.handL, L);
    this.gripR.visible = gripR; this.openR.visible = !gripR;
    this.gripL.visible = gripL; this.openL.visible = !gripL;
    this.toolR.visible = toolVis;
    this.toolL.visible = leftItem && !(this.eating && this.eating.hand === 'L');
    if (this.jaws) {
      this.jawK += (this.jaw - this.jawK) * Math.min(1, dt * 16);
      const a = 0.015 + this.jawK * 0.2;
      this.jaws[0].rotation.z = a;
      this.jaws[1].rotation.z = -a;
    }
    this.foodLGroup.visible = !!(this.eating && this.eating.hand === 'L' && this.eating.t < 1.2);
    if (this.tool.spin) this.tool.spin.rotation.z = this.spinA;

    // ---- forearms from the shoulders (below the view) to the wrists
    this.placeArm(this.armR, this.handR, 1);
    this.placeArm(this.armL, this.handL, -1);

    // ---- whole-rig motion: look sway, walk bob, air, landing, shake, stow
    const rate = Math.max(dt, 1 / 120);
    const sx = this.sway.x.step(dt, clamp(-(look.dx || 0) / rate * 0.000032, -0.06, 0.06));
    const sy = this.sway.y.step(dt, clamp((look.dy || 0) / rate * 0.000032, -0.05, 0.05));
    const ld = this.land.step(dt);
    const air = this.grounded ? 0 : Math.min(1, this.airT * 4);
    const b = this.bobAmp, ph = this.walkPh;
    const sh = this.shake * this.shake;
    const rig = this.rig;
    const Ls = this.driveScale();
    // steered paws hold still on their work: the rig's own motion fades out under a drive
    const free = 1 - 0.9 * this.driveK;
    rig.scale.setScalar(Ls);
    rig.position.set(
      (sx + Math.sin(ph) * 0.012 * b + wobble(t * 23, 1) * 0.006 * sh + Math.sin(t * 0.7) * 0.002) * free,
      (sy - Math.abs(Math.cos(ph)) * 0.015 * b + 0.006 * b + ld * 0.35 + air * 0.022 + Math.sin(t * 1.9) * 0.0035 + wobble(t * 21, 2) * 0.006 * sh) * free - easeIn(this.stow) * 0.55,
      wobble(t * 19, 3) * 0.004 * sh * free,
    );
    rig.rotation.set(
      (sy * 1.6 + Math.abs(Math.cos(ph)) * 0.02 * b - air * 0.06 + ld * 0.6) * free + this.stow * 0.45,
      -sx * 1.4 * free,
      (Math.sin(ph) * 0.025 * b + sx * 0.6 + wobble(t * 17, 4) * 0.03 * sh) * free,
    );
    if (Ls !== 1) rig.position.addScaledVector(this.layout.pivot, 1 - Ls);

    // ---- light and glow
    this.updateLights(o);

    // ---- the x-ray beam cone in the world (needs the world camera)
    const ux = this.kind === 'xray' ? this.useK.xray : 0;
    if (ux > 0.02 && o.camera) {
      this.rig.updateMatrixWorld(true);
      const lp = this.tool.tip;
      const lens = this.toolR.localToWorld(_v.set(lp[0] * VMV, lp[1] * VMV, (lp[2] - 1) * VMV));
      const range = ITEMS[this.item]?.radius ?? 5;
      this.beam.update(dt, lens, this.camera, o.camera, this.tool.lensColor, range, ux, this.t);
    } else this.beam.update(dt, _v.set(0, 0, -1), this.camera, null, 0xffffff, 1, 0, this.t);
  }

  /** Per-tool animation: swings, continuous use and placement. */
  toolLayers(R, L, dt) {
    const t = this.t, act = this.action, kind = this.kind, P = this.P;
    if (act) {
      const a = act.t, d = act.dur;
      const windEnd = Math.max(d * 0.55, d - 0.085);
      const wind = ease(a / windEnd);
      const strike = clamp((a - windEnd) / (d - windEnd), 0, 1);
      const rec = ease((a - d - 0.1) / 0.35);
      if (kind === 'pick' || kind === 'hammer' || kind === 'smith') {
        // wind up over the shoulder, snap down so the point lands at `dur`, hang, recover
        // the point lands near the crosshair at `dur`, then the arm sags back as the head bites
        const WIND = 0.8, HIT = -0.42;
        const ang = a < windEnd ? WIND * wind : a < d ? WIND + (HIT - WIND) * easeIn(strike) : HIT * (1 - rec) - 0.1 * Math.sin(Math.min(1, (a - d) / 0.25) * Math.PI);
        const k = a < windEnd ? wind : a < d ? 1 - strike : 0;
        const fwd = a < windEnd ? 0 : a < d ? easeIn(strike) : 1 - rec;
        R.move(0.035 * k - 0.03 * fwd, 0.07 * k - 0.015 * fwd, 0.09 * k - 0.09 * fwd).rot(ang, 0.12 * k, -0.08 * fwd);
        L.move(-0.015 * k, -0.04 * fwd, 0.03 * k);
      } else if (kind === 'chisel') {
        // the mallet in the left paw cocks back along the chisel and knocks its butt at `dur`
        const hit = this.malletHit(R, this.tmp2);
        const up = this.tmp.copy(hit);
        _v.set(0, 1, 0).applyQuaternion(R.q); // chisel axis (toward the tip)
        up.p.addScaledVector(_v, -0.045).add(_v2.set(-0.035, 0.05, -0.01));
        up.rot(0.6, 0, 0.15);
        if (a < windEnd) L.mix(up, wind);
        else if (a < d) L.copy(up).mix(hit, easeIn(strike));
        else if (a < d + 0.07) L.copy(hit);
        else L.copy(up).mix(hit, 1 - ease((a - d - 0.07) / 0.12)).mix(this.tmp.copy(P.mallet).mirror(), ease((a - d - 0.12) / 0.3));
        const push = a >= d ? Math.max(0, 1 - (a - d) / 0.15) : 0;
        _v.set(0, 1, 0).applyQuaternion(R.q);
        R.p.addScaledVector(_v, 0.012 * push);
      } else if (kind === 'stake' || kind === 'beam') {
        // pull back, thrust/press it into place at `dur`, let go, then a fresh one comes up
        const k = a < windEnd ? wind : 0;
        const fwd = a < windEnd ? 0 : a < d ? easeIn(strike) : 1;
        if (kind === 'stake') R.move(0.01 * k - 0.02 * fwd, 0.03 * k + 0.04 * fwd, 0.08 * k - 0.2 * fwd).rot(0.25 * k - 0.1 * fwd, 0, 0);
        else R.move(0, -0.025 * k + 0.1 * fwd, 0.03 * k - 0.08 * fwd).rot(0.2 * fwd, 0, 0); // press it up to the ceiling
        if (a >= d) {
          this.placed = a - d;
          const back = ease((a - d) / 0.3), down = ease((a - d - 0.3) / 0.25), up = ease((a - d - 0.62) / 0.4);
          R.move(0, -0.3 * down * (1 - up) - 0.05 * back * (1 - up), 0.1 * back * (1 - up));
          if (kind === 'beam') L.move(0, -0.3 * down * (1 - up), 0.1 * back * (1 - up));
          if (a > d + 1.05) { this.placed = 0; this.action = null; }
        }
      } else if (kind === 'none') {
        // a big claw swipe
        if (a < windEnd) R.mix(P.swipeUp, wind);
        else if (a < d) R.copy(P.swipeUp).mix(P.swipeHit, easeIn(strike));
        else R.copy(P.swipeHit).mix(P.open, rec);
      } else {
        // any other tool: a short jab forward
        const k = a < d ? ease(a / d) : 1 - rec;
        R.move(0, 0.01 * k, -0.06 * k).rot(-0.15 * k, 0, 0);
      }
    }
    // continuous use
    const ub = this.useK.brush;
    if (ub > 0.01) {
      const s = Math.sin(t * 15);
      R.move(0.045 * s * ub, (Math.cos(t * 30) * 0.012 - 0.02) * ub, -0.06 * ub).rot(0.1 * Math.cos(t * 15) * ub, 0, 0.3 * s * ub);
      L.move(0.012 * Math.sin(t * 15 + 1) * ub, -0.01 * ub, 0);
    }
    const ud = this.useK.drill;
    if (ud > 0.01) {
      const j = (0.003 + this.heat * 0.003) * ud;
      R.move(wobble(t * 61, 1) * j, wobble(t * 57, 2) * j, -0.045 * ud + wobble(t * 53, 3) * j).rot(wobble(t * 47, 4) * 0.02 * ud, 0, wobble(t * 43, 5) * 0.02 * ud);
    }
    const ux = this.useK.xray;
    if (ux > 0.01) {
      R.mix(P.xrayOn, ux);
      R.move(wobble(t * 9, 6) * 0.002 * ux, wobble(t * 8, 7) * 0.002 * ux, 0);
      L.move(-0.02 * ux, -0.04 * ux, 0.03 * ux);
    }
    if (kind === 'brush' && ub < 0.01 && !act) R.rot(0, 0, Math.sin(t * 1.3) * 0.02);
  }

  /**
   * Steer the paws onto view-space targets (see the header). Each hand target puts its tool point
   * `at` (voxels) on `p` with orientation `q`; the steady rig frame (layout scale and pivot only)
   * converts them into rig space. Returns the grip/tool flags of the steered hands.
   */
  applyDrive(R, L, d, k) {
    // steered paws are drawn at true size (the narrow-screen shrink fades out under a drive)
    const Ls = this.driveScale();
    // steady rig frame: scale about the layout pivot (the swaying part is faded out while driven)
    _s3.copy(this.layout.pivot || _v.set(0, 0, 0)).multiplyScalar(1 - Ls);
    _m4.makeScale(Ls, Ls, Ls).setPosition(_s3).invert();
    const out = {};
    for (const [side, pose] of [['R', R], ['L', L]]) {
      const tg = d[side];
      if (!tg || !tg.p) continue;
      const q = tg.q || pose.q;
      const at = tg.at || [0, 0, 0];
      _v.set(at[0] * VMV * Ls, at[1] * VMV * Ls, at[2] * VMV * Ls).applyQuaternion(q);
      this.tmp.p.copy(tg.p).sub(_v).applyMatrix4(_m4);
      this.tmp.q.copy(q);
      pose.mix(this.tmp, k * (tg.k ?? 1));
      out[side] = { grip: tg.grip ?? true, tool: tg.tool ?? true };
    }
    return out;
  }

  /** The rig's scale now: the layout's shrink, faded toward 1 while the paws are steered. */
  driveScale() {
    const Ls = this.layout.s ?? 1;
    return Ls + (1 - Ls) * this.driveK;
  }

  /** Left paw pose for the mallet blow: the head's face meets the chisel's struck cap. */
  malletHit(R, out) {
    const butt = this.tool.butt || [0, -33, 0];
    const b = _v.set(butt[0] * VMV, butt[1] * VMV, butt[2] * VMV).applyQuaternion(R.q).add(R.p);
    // the barrel lines up with the chisel (its -Z face forward), the handle runs down-left to the paw
    const d = _v2.set(0, 1, 0).applyQuaternion(R.q);
    aim([0.9, 0.2, 0.25], [d.x, d.y, d.z], out.q);
    const face = _up.set(0, MALLET_HEAD * VMV, -10.5 * VMV).applyQuaternion(out.q);
    out.p.copy(b).sub(face);
    return out;
  }

  climbPose(out, ph) {
    const k = (1 - Math.cos(ph)) / 2;
    out.copy(this.P.climbDn).mix(this.P.climbUp, k);
    out.move(0, Math.sin(ph) * 0.015, 0).rot(0, 0, Math.sin(ph) * 0.12);
    return out;
  }

  swimPose(out, ph) {
    const c = ((ph / (Math.PI * 2)) % 1 + 1) % 1;
    const P = this.P;
    if (c < 0.4) out.copy(P.swimA).mix(P.swimB, ease(c / 0.4));
    else if (c < 0.75) out.copy(P.swimB).mix(P.swimC, ease((c - 0.4) / 0.35));
    else out.copy(P.swimC).mix(P.swimA, ease((c - 0.75) / 0.25));
    return out;
  }

  finishEat() {
    const e = this.eating;
    this.eating = null;
    const parts = e.hand === 'L' ? this.foodL : this.tool.food;
    if (parts) parts.forEach((b, i) => { b.visible = i === 0; });
  }

  place(group, pose) {
    group.position.copy(pose.p);
    group.quaternion.copy(pose.q);
  }

  placeArm(arm, hand, side) {
    const S = this.P.shoulder;
    _v.set(0, 0, WRIST_Z * VMV).applyQuaternion(hand.quaternion).add(hand.position); // wrist
    _v2.set(S.x * side, S.y, S.z);
    // reaching out to steered work, the arm comes up from lower down (it stays out of the way)
    // and is drawn a little slimmer
    if (this.driveK > 0) _v2.lerp(_up.set(Math.max(0.42, S.x) * side, S.y * 1.7, S.z + 0.2), this.driveK);
    const thin = 1 - 0.22 * this.driveK;
    arm.scale.set(thin, thin, 1);
    arm.position.copy(_v);
    _v2.sub(_v);
    _up.set(0, 1, 0).applyQuaternion(hand.quaternion);
    aimZ(_v2, _up, arm.quaternion);
  }

  updateLights(o) {
    const lamp = o.lamp || {};
    this.key.color.copy(colorOf(lamp.color, 0xffe0b0));
    this.key.intensity = 1.7 * (lamp.intensity ?? 1);
    const amb = o.ambient;
    if (typeof amb === 'number' && amb <= 16) {
      this.hemi.color.set(0x9a8a84); this.hemi.groundColor.set(0x3a2a2a);
      this.hemi.intensity = 1.2 * amb;
    } else {
      const c = colorOf(amb, 0x8a7a7a);
      this.hemi.color.copy(c).multiplyScalar(1.15);
      this.hemi.groundColor.copy(c).multiplyScalar(0.45);
      this.hemi.intensity = 1.2;
    }
    // glow parts and the light they cast on the paws
    const T = this.tool, gl = this.glowMat.emissive, t = this.t;
    let li = 0;
    if (T.kind === 'drill') {
      heatColor(this.heat, gl);
      li = this.heat * 1.2;
      this.glowLight.color.setRGB(1, 0.45, 0.15);
    } else if (T.kind === 'xray') {
      const u = this.useK.xray;
      gl.set(T.lensColor).multiplyScalar(0.35 + u * (1.2 + Math.sin(t * 23) * 0.15));
      li = u * 0.5;
      this.glowLight.color.set(T.lensColor);
    } else if (T.tongs) {
      heatColor(this.heat, gl);
      li = 0;
    } else if (T.glow) {
      gl.set(T.glow.color).multiplyScalar(T.glow.k + Math.sin(t * 2.6) * 0.12);
      li = T.kind === 'stake' && this.toolR.visible ? 0.18 : 0;
      this.glowLight.color.set(T.glow.color);
    } else gl.setRGB(0, 0, 0);
    this.glowLight.intensity = li;
    const w = o.work || this.work; // (vm.work persists for scenes whose rig calls update())
    if (w && w.intensity > 0) {
      this.workLight.color.copy(colorOf(w.color, 0xff8a3a));
      this.workLight.intensity = w.intensity;
      if (w.pos) this.workLight.position.copy(w.pos);
    } else this.workLight.intensity = 0;
    if (li > 0 && T.light) {
      this.rig.updateMatrixWorld(true);
      this.toolR.localToWorld(this.glowLight.position.set(T.light[0] * VMV, T.light[1] * VMV, T.light[2] * VMV));
    }
  }
}
