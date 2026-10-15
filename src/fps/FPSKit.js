// Shared first person for hand-built scenes (home, town, forge…): the mole's body (FPSPlayer, the
// same one that walks the mine), mouse/touch look, the paws overlay, crosshair targeting of
// interactables, E to use, head bob and footsteps. Scenes are built in meters: the mole is 0.86 m
// tall with its eyes at 0.72 m (docs/FPS.md).
import * as THREE from 'three';
import { FPSPlayer } from '../deep/Player.js';
import { VOX } from '../deep/materials.js';
import { clamp } from '../core/util.js';

const STONE = 4; // any opaque material id for the mole's collision

/**
 * Collision for hand-built scenes: axis-aligned boxes in meters, answered as 1/8 m voxels so the
 * mine's FPSPlayer walks them unchanged (step-ups, climbing, ceilings).
 */
export class BoxWorld {
  constructor() {
    this.boxes = [];
    this.grid = new Map(); // 1 m cell → boxes touching it
  }
  static key(x, y, z) { return ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512); }

  /** Add a solid box; tag lets you remove a group later (furniture, doors). Returns the box. */
  add(x0, y0, z0, x1, y1, z1, tag = null) {
    const b = { x0: Math.min(x0, x1), y0: Math.min(y0, y1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), y1: Math.max(y0, y1), z1: Math.max(z0, z1), tag };
    this.boxes.push(b);
    for (let z = Math.floor(b.z0); z <= Math.floor(b.z1); z++) for (let y = Math.floor(b.y0); y <= Math.floor(b.y1); y++) for (let x = Math.floor(b.x0); x <= Math.floor(b.x1); x++) {
      const k = BoxWorld.key(x, y, z);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(b);
    }
    return b;
  }
  /** Remove every box with this tag (or the box itself). */
  remove(tagOrBox) {
    const gone = (b) => b === tagOrBox || (b.tag !== null && b.tag === tagOrBox);
    this.boxes = this.boxes.filter((b) => !gone(b));
    for (const [k, l] of this.grid) { const f = l.filter((b) => !gone(b)); if (f.length) this.grid.set(k, f); else this.grid.delete(k); }
  }
  clear() { this.boxes = []; this.grid.clear(); }

  solidAt(x, y, z) {
    const l = this.grid.get(BoxWorld.key(Math.floor(x), Math.floor(y), Math.floor(z)));
    if (!l) return false;
    for (const b of l) if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1 && z >= b.z0 && z < b.z1) return true;
    return false;
  }
  voxelAt(vx, vy, vz) { return this.solidAt((vx + 0.5) / VOX, (vy + 0.5) / VOX, (vz + 0.5) / VOX) ? STONE : 0; }
  matAt(x, y, z) { return this.solidAt(x, y, z) ? STONE : 0; }

  /** First box along the ray: { dist, x, y, z, nx, ny, nz, box } or null. */
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 50) {
    let best = null, bt = maxDist;
    for (const b of this.boxes) {
      const t = rayBox(ox, oy, oz, dx, dy, dz, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1);
      if (t !== null && t < bt) { bt = t; best = b; }
    }
    if (!best) return null;
    const x = ox + dx * bt, y = oy + dy * bt, z = oz + dz * bt, e = 1e-3;
    const n = Math.abs(x - best.x0) < e ? [-1, 0, 0] : Math.abs(x - best.x1) < e ? [1, 0, 0] : Math.abs(y - best.y0) < e ? [0, -1, 0] : Math.abs(y - best.y1) < e ? [0, 1, 0] : Math.abs(z - best.z0) < e ? [0, 0, -1] : [0, 0, 1];
    return { dist: bt, x, y, z, nx: n[0], ny: n[1], nz: n[2], box: best };
  }
}

/** Ray vs box (slabs): entry distance or null. */
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = Infinity;
  for (const [o, d, a, b] of [[ox, dx, x0, x1], [oy, dy, y0, y1], [oz, dz, z0, z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < a || o > b) return null; continue; }
    let ta = (a - o) / d, tb = (b - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}

const vmModules = import.meta.glob('./ViewModel.js');

/**
 * The first-person mole for a scene. owner: the Scene (uses owner.game, owner.scene).
 * opts: { world (BoxWorld or anything with voxelAt/solidAt, optional raycast), fov, reach,
 *         tool ('none' | a ViewModel tool kind), stepMat (footstep sound family), lamp (0..2) }
 */
export class FPSRig {
  constructor(owner, opts = {}) {
    this.o = owner;
    this.g = owner.game;
    this.world = opts.world || new BoxWorld();
    this.fov = opts.fov ?? 74;
    this.reach = opts.reach ?? 2.2;
    this.stepMat = opts.stepMat || 'wood';
    this.lampK = opts.lamp ?? 0.8;
    this.tool = opts.tool || 'none';
    this.toolItem = opts.toolItem || null;
    const e = this.g.engine;
    this.camera = new THREE.PerspectiveCamera(this.fov, e.width / e.height, 0.03, opts.far ?? 80);
    this.camera.rotation.order = 'YXZ';
    this.player = new FPSPlayer(this.world);
    this.items = [];
    this.target = null;
    this.kick = new THREE.Vector3();
    this.shakeAmp = 0;
    this.stepT = 0;
    this.vm = null;
    this.lampCol = new THREE.Color(1.25, 1.05, 0.8);
    this.ambient = new THREE.Color(0.35, 0.3, 0.28);
  }

  /** Load the paws (optional module). */
  async init() {
    const load = vmModules['./ViewModel.js'];
    if (!load) return this;
    try {
      const mod = await load();
      this.vm = new mod.ViewModel();
      this.vm.resize(this.g.engine.width / this.g.engine.height);
      if (this.vm.world) this.o.scene.add(this.vm.world);
      this.vm.setTool(this.tool, { item: this.toolItem });
    } catch (err) { console.warn('view model failed', err); }
    return this;
  }

  /** Put the mole at (x, y, z) facing yaw (radians; 0 looks toward −z). */
  place(x, y, z, yaw = 0, pitch = 0) {
    const p = this.player;
    p.pos.set(x, y, z);
    p.vel.set(0, 0, 0);
    p.yaw = yaw;
    p.pitch = pitch;
    this.syncCamera(0);
  }

  setTool(kind, item = null) {
    this.tool = kind;
    this.toolItem = item;
    if (this.vm) this.vm.setTool(kind, { item });
  }

  /**
   * Something the crosshair can use: { x, y, z, r } (sphere) or { box: [x0,y0,z0,x1,y1,z1] },
   * label, kind ('use' default), reach, enabled() → bool, action(it) on E / the use button.
   */
  add(it) { this.items.push(it); return it; }
  remove(it) { const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); }

  isTouch() { return document.documentElement.classList.contains('is-touch'); }
  eye(out = new THREE.Vector3()) { return this.player.eye(out); }
  forward(out = new THREE.Vector3()) { return this.player.forward(out); }
  shake(a) { if (this.g.state.data.settings?.shake !== false) this.shakeAmp = Math.max(this.shakeAmp, a); }

  /** The interactable under the crosshair (closest hit within reach, not behind a wall). */
  pick() {
    const eye = this.eye(), f = this.forward();
    let wall = Infinity;
    if (this.world.raycast) { const h = this.world.raycast(eye.x, eye.y, eye.z, f.x, f.y, f.z, this.reach + 1); if (h) wall = h.dist; }
    let best = null, bt = Infinity;
    for (const it of this.items) {
      if (it.enabled && !it.enabled()) continue;
      const reach = it.reach ?? this.reach;
      let t = null;
      if (it.box) t = rayBox(eye.x, eye.y, eye.z, f.x, f.y, f.z, ...it.box);
      else {
        const r = it.r ?? 0.35, ox = it.x - eye.x, oy = it.y - eye.y, oz = it.z - eye.z;
        const tc = ox * f.x + oy * f.y + oz * f.z, d2 = ox * ox + oy * oy + oz * oz - tc * tc;
        if (tc > -r && d2 <= r * r) t = Math.max(0, tc - Math.sqrt(r * r - d2));
      }
      if (t === null || t > reach || t > wall + 0.05 || t >= bt) continue;
      bt = t; best = it;
    }
    return best;
  }

  /**
   * One frame: look, move, target, E. opts: { busy (a panel is open: no input), frozen (no
   * walking), speedMul, crosshair (false hides it) }. Returns the player's events
   * ({ landed, jump, step, fallDamage }).
   */
  update(dt, opts = {}) {
    const g = this.g, inp = g.input, pl = this.player;
    const busy = !!opts.busy || g.ui.isPanelOpen();
    const look = inp.takeLook();
    if (!busy) pl.look(look.dx, look.dy, this.isTouch() ? 0.0055 : 0.0026);
    if (!busy && inp.mousePressed(0) && !inp.pointerLocked && !this.isTouch()) { inp.lockPointer(); inp.mouse.pressed[0] = false; }
    const mv = { x: inp.axisX(), y: inp.axisY() };
    const ev = pl.update(dt, mv, { jump: !busy && inp.pressed('Space'), jumpHeld: !busy && inp.isDown('Space'), run: inp.isDown('ShiftLeft', 'ShiftRight'), frozen: busy || !!opts.frozen, speedMul: opts.speedMul ?? 1 });
    if (ev.landed) g.audio.play('land', { hard: ev.landed > 8 });
    if (pl.grounded && pl.speed > 0.6) {
      this.stepT -= dt * pl.speed / 2.4;
      if (this.stepT <= 0) { this.stepT = 1; g.audio.play('step', { vol: 0.3, mat: this.stepMat }); }
    }
    this.primaryDown = !busy && inp.mouseDown(0) && (inp.pointerLocked || this.isTouch());
    this.primaryPressed = !busy && inp.mousePressed(0) && (inp.pointerLocked || this.isTouch());
    // targeting + E
    this.target = busy ? null : this.pick();
    if (opts.crosshair !== false && g.ui.setCrosshair) {
      const t = this.target;
      g.ui.setCrosshair(busy ? null : { visible: true, kind: t ? t.kind || 'use' : 'none', label: t ? t.label : '', progress: t?.progress });
    }
    if (!busy && this.target && inp.pressed('KeyE')) {
      const t = this.target;
      if (this.vm) this.vm.impact('none', 0.25);
      t.action?.(t);
    }
    this.syncCamera(dt);
    if (this.vm) this.vm.update(dt, { speed: pl.speed, grounded: pl.grounded, climbing: pl.climbing, swimming: pl.inWater, look, lamp: { color: this.lampCol, intensity: this.lampK }, ambient: this.ambient, camera: this.camera });
    return ev;
  }

  syncCamera(dt) {
    const pl = this.player, eye = pl.eye();
    const bob = pl.grounded ? Math.sin(pl.bobT * 2) * 0.02 * clamp(pl.speed / 3, 0, 1) : 0;
    this.kick.multiplyScalar(Math.max(0, 1 - dt * 16));
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.4);
    const sh = this.shakeAmp * 0.05;
    this.camera.position.set(eye.x + (Math.random() - 0.5) * sh, eye.y + bob + (Math.random() - 0.5) * sh, eye.z + (Math.random() - 0.5) * sh);
    this.camera.rotation.set(pl.pitch + this.kick.x, pl.yaw + this.kick.y, this.kick.z, 'YXZ');
    this.camera.updateMatrixWorld();
  }

  /** Draw the scene through the pixel pipeline with the paws on top. */
  render(post = {}) {
    const p = this.vm ? { ...post, overlay: { scene: this.vm.scene, camera: this.vm.camera } } : post;
    this.g.engine.render(this.o.scene, this.camera, p);
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.vm) this.vm.resize(w / h);
  }

  dispose() {
    const g = this.g;
    g.input.unlockPointer();
    g.ui.setCrosshair?.(null);
    if (this.vm) { if (this.vm.world) this.o.scene.remove(this.vm.world); this.vm.dispose(); }
  }
}
