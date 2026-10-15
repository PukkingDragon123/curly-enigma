// The town builder: everything static goes through here. Models are built in town units (TU)
// and placed under the scaled town root; statics are merged per material into chunks in meters
// (Batch), light-baked and frustum-culled. Collision goes to the mole's BoxWorld (meters) and
// the townsfolk's TileMap (TU cells); lights to the real-light pool, the glow batch and the bake.
import * as THREE from 'three';
import { Batch, keepUnbatched } from '../iso/vox.js';
import { lowRes } from '../iso/kit.js';
import { TileMap } from '../iso/TileMap.js';
import { bakeLighting, caveAmbient } from '../iso/bake.js';
import { M } from './units.js';

const _v = new THREE.Vector3();
export const LAMP = { color: 0xffc070, intensity: 6, distance: 6.5, flicker: 0.12, pool: 1.9, poolOpacity: 0.28, halo: 0.75, haloOpacity: 0.55 };
/** Height (TU) of the invisible lid over the town: climbing stops here. */
export const LID = 5.4;

export class TownBuilder {
  /** S: the scene ({ root, world (BoxWorld), lights (fx Lights), glow (GlowBatch), particles }). W, H in TU. */
  constructor(S, W, H) {
    this.S = S;
    this.batch = new Batch(9);
    this.unbatched = [];
    this.bakeLights = [];
    this.shadows = [];
    this.map = new TileMap(W, H);
  }

  /** A static object already positioned in TU (world placement under the root). o.outline=false: skip the outline pass. */
  addStatic(obj, o = {}) {
    if (o.outline === false) obj.traverse((m) => { if (m.isMesh) m.layers.disable(1); });
    this.S.root.add(obj);
    this.batch.add(obj);
    this.unbatched.push(obj);
    return obj;
  }

  /**
   * Place a prop builder result ({obj, shadow, r, lights} or an Object3D, or a function making one)
   * at x, z with yaw. o: {y, scale, low (1/16 decor), solid (default true), lights (default true),
   * light (overrides), h (collision height, TU), box: [w, d] collision box instead of a circle}.
   */
  place(make, x, z, yaw = 0, o = {}) {
    const res = typeof make === 'function' ? (o.low ? lowRes(make) : make()) : make;
    const obj = res.obj || res;
    obj.position.set(x, o.y ?? 0, z);
    obj.rotation.y = yaw;
    if (o.scale) obj.scale.setScalar(o.scale);
    this.addStatic(obj, { outline: o.outline });
    const sc = o.scale ?? 1;
    if (res.shadow && o.shadow !== false) this.shadows.push({ x, z, rx: res.shadow.rx * sc, rz: (res.shadow.rz ?? res.shadow.rx) * sc, k: res.shadow.k });
    if (o.solid !== false && (res.r || o.box || o.r)) {
      const h = o.h ?? 1.2;
      if (o.box) this.solidRot(x, z, o.box[0], o.box[1], yaw, (o.y ?? 0), (o.y ?? 0) + h);
      else this.solidCircle(x, z, (o.r ?? res.r) * sc, h, o.y ?? 0);
    }
    if (res.lights && o.lights !== false) {
      obj.updateMatrixWorld(true);
      for (const l of res.lights) {
        // obj.matrixWorld includes the root's scale: undo it to stay in TU
        _v.set(l.x, l.y, l.z).applyMatrix4(obj.matrixWorld).multiplyScalar(1 / M);
        this.S.addLight({ ...LAMP, ...(o.light || {}), x: _v.x, y: _v.y, z: _v.z });
      }
    }
    return obj;
  }

  /** Light that also bakes into the statics around it. */
  bakeLight(o) {
    const power = o.bakePower ?? (o.intensity ? Math.min(1.3, o.intensity / 6) : 0.3);
    const radius = o.bakeRadius ?? (o.intensity ? (o.distance ?? 5) * 0.95 : 2.4);
    this.bakeLights.push({ x: o.x * M, y: o.y * M, z: o.z * M, color: o.color, power, radius: radius * M });
  }

  // ------------------------------------------------------------ collision (TU in, meters to the BoxWorld)
  /** Solid box for the mole (and the townsfolk's tile map when it touches the floor). */
  solid(x0, y0, z0, x1, y1, z1, tag = null, o = {}) {
    const b = this.S.world.add(x0 * M, y0 * M, z0 * M, x1 * M, y1 * M, z1 * M, tag);
    if (o.nav !== false && y0 < 0.6) {
      this.map.fill(Math.floor(Math.min(x0, x1) + 0.2), Math.floor(Math.min(z0, z1) + 0.2), Math.max(1, Math.round(Math.abs(x1 - x0))), Math.max(1, Math.round(Math.abs(z1 - z0))), 1);
    }
    return b;
  }
  /** A round obstacle: a square box for the mole, a circle for the townsfolk. */
  solidCircle(x, z, r, h = 1.2, y = 0, tag = null) {
    const k = r * 0.86;
    this.S.world.add((x - k) * M, y * M, (z - k) * M, (x + k) * M, (y + h) * M, (z + k) * M, tag);
    if (y < 0.6) { this.map.addCircle(x, z, r); this.map.navCircle(x, z, r + 0.25); }
  }
  /** A w×d footprint rotated by yaw: split into a few boxes along its long axis. */
  solidRot(x, z, w, d, yaw, y0 = 0, y1 = 1.2, tag = null) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const n = Math.max(1, Math.round(Math.max(w, d) / Math.max(0.3, Math.min(w, d))));
    const long = w >= d;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const lx = long ? t * w : 0, lz = long ? 0 : t * d;
      const cx = x + lx * c + lz * s, cz = z - lx * s + lz * c;
      const hw = (long ? w / n : w) / 2, hd = (long ? d : d / n) / 2;
      const ex = Math.abs(hw * c) + Math.abs(hd * s), ez = Math.abs(hw * s) + Math.abs(hd * c);
      const k = Math.abs(Math.sin(2 * yaw)) > 0.3 ? 0.8 : 1;
      this.S.world.add((cx - ex * k) * M, y0 * M, (cz - ez * k) * M, (cx + ex * k) * M, y1 * M, (cz + ez * k) * M, tag);
    }
    if (y0 < 0.6) { const r = Math.min(w, d) / 2; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5; const lx = long ? t * w : 0, lz = long ? 0 : t * d; this.map.navCircle(x + lx * c + lz * s, z - lx * s + lz * c, r + 0.3); this.map.addCircle(x + lx * c + lz * s, z - lx * s + lz * c, r); } }
  }

  /** Merge, bake and add the statics; move the leftovers (textured quads) under the scene. */
  finish(opts = {}) {
    const statics = new THREE.Group();
    this.S.scene.add(statics);
    const amb = caveAmbient({ top: opts.ambTop ?? 9, fadeFrom: opts.ambFrom ?? 2.4, minK: opts.ambMin ?? 0.42, floorWarm: 0.1, cool: [0.5, 0.58, 1.0] });
    const bake = (g) => bakeLighting(g, this.bakeLights, { ambient: amb, max: 2.8 });
    // statics are batched in meters: Batch.add saw them under the scaled root
    const meshes = this.batch.build(statics, null, { bake });
    for (const o of this.unbatched) keepUnbatched(o, this.S.scene);
    for (const o of this.unbatched) if (o.parent === this.S.root) this.S.root.remove(o);
    return { meshes, bake };
  }
}
