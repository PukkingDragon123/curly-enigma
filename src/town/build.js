// The town builder: everything static goes through here. Models are built in town units (TU)
// and placed under the scaled town root; statics are merged per material into chunks in meters
// (Batch), light-baked and frustum-culled. Collision goes to the mole's BoxWorld (meters) and
// the townsfolk's TileMap (TU cells); lights to the real-light pool, the glow batch and the bake.
import * as THREE from 'three';
import { keepUnbatched } from '../iso/vox.js';
import { TownBatch } from './batch.js';
import { lowRes } from '../iso/kit.js';
import { TileMap } from '../iso/TileMap.js';
import { bakeLighting, caveAmbient } from '../iso/bake.js';
import { M } from './units.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _r = new THREE.Matrix3();

/**
 * Drop the faces nobody can see: for every mesh under root, triangles for which
 * drop(normal, centre) is true, both in root's own frame (e.g. the faces of a building that look
 * into the rock it stands against). Vertices left unused are compacted away.
 */
export function cullFaces(root, drop) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  root.traverse((m) => {
    if (!m.isMesh || !m.geometry?.index || m.userData.noBatch) return;
    const g = m.geometry, P = g.getAttribute('position'), N = g.getAttribute('normal');
    if (!P || !N) return;
    _m.multiplyMatrices(inv, m.matrixWorld);
    _r.getNormalMatrix(_m);
    const I = g.index.array, keep = [];
    const c = new THREE.Vector3();
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], d = I[t + 2];
      _n.fromBufferAttribute(N, a).applyMatrix3(_r).normalize();
      c.set((P.getX(a) + P.getX(b) + P.getX(d)) / 3, (P.getY(a) + P.getY(b) + P.getY(d)) / 3, (P.getZ(a) + P.getZ(b) + P.getZ(d)) / 3).applyMatrix4(_m);
      if (!drop(_n, c)) keep.push(a, b, d);
    }
    if (keep.length === I.length) return;
    // compact
    const map = new Int32Array(P.count).fill(-1);
    let nv = 0;
    for (const v of keep) if (map[v] < 0) map[v] = nv++;
    const out = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) {
      const arr = new attr.array.constructor(nv * attr.itemSize);
      for (let v = 0; v < P.count; v++) if (map[v] >= 0) for (let k = 0; k < attr.itemSize; k++) arr[map[v] * attr.itemSize + k] = attr.array[v * attr.itemSize + k];
      out.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize, attr.normalized));
    }
    out.setIndex(keep.map((v) => map[v]));
    g.dispose();
    m.geometry = out;
  });
}
export const LAMP = { color: 0xffc070, intensity: 6, distance: 6.5, flicker: 0.12, pool: 1.9, poolOpacity: 0.28, halo: 0.75, haloOpacity: 0.55 };
/** Height (TU) of the invisible lid over the town: climbing stops here. */
export const LID = 5.4;

export class TownBuilder {
  /** S: the scene ({ root, world (BoxWorld), lights (fx Lights), glow (GlowBatch), particles }). W, H in TU. */
  constructor(S, W, H) {
    this.S = S;
    this.batch = new TownBatch({ cell: 4, cells: { roof: 8 } });
    this.unbatched = [];
    this.bakeLights = [];
    this.shadows = [];
    this.map = new TileMap(W, H);
  }

  /**
   * A static object already positioned in TU (world placement under the root). o.outline=false:
   * skip the outline pass; o.cls: patch class ('ground', or 'roof' for things far overhead).
   */
  addStatic(obj, o = {}) {
    if (o.outline === false) obj.traverse((m) => { if (m.isMesh) m.layers.disable(1); });
    if (this.stats) this.logStatic(obj, o.label);
    this.S.root.add(obj);
    this.batch.add(obj, o.cls || 'ground', { fine: o.nolod });  // nolod: true (halve only far) or 'keep'
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
    this.addStatic(obj, { outline: o.outline, nolod: o.nolod, cls: o.cls, label: this.stats ? (o.label || make.name || null) : null });
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

  /** Debug (?tstats): remember each static mesh's world sphere (meters), triangles and outline flag by build step. */
  logStatic(obj, label) {
    if (!label) {
      const fr = (new Error().stack || '').split('\n').slice(1).find((l) => !/build\.js/.test(l)) || '';
      const m = fr.match(/([A-Za-z]+\.js):(\d+)/);
      label = m ? `${m[1]}:${m[2]}` : '?';
    }
    obj.updateMatrixWorld(true);
    obj.traverse((m) => {
      if (!m.isMesh || !m.geometry || !m.geometry.index || !m.visible) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const sp = m.geometry.boundingSphere.clone().applyMatrix4(m.matrixWorld);
      this.stats.push({ tag: this.tag || '?', sub: label, sp, tris: m.geometry.index.count / 3, ol: m.layers.isEnabled(1) });
    });
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

  /** Merge, bake and add the statics (patches with coarser levels, see batch.js); move the leftovers (textured quads) under the scene. */
  finish(opts = {}) {
    const statics = new THREE.Group();
    statics.name = 'statics';
    this.S.scene.add(statics);
    const amb = caveAmbient({ top: opts.ambTop ?? 9, fadeFrom: opts.ambFrom ?? 2.4, minK: opts.ambMin ?? 0.42, floorWarm: 0.1, cool: [0.5, 0.58, 1.0] });
    const bake = (g) => bakeLighting(g, this.bakeLights, { ambient: amb, max: 2.8 });
    // statics are batched in meters: TownBatch.add saw them under the scaled root
    const { patches, blocks } = this.batch.build(statics, { bake, levels: opts.levels || [] });
    for (const o of this.unbatched) keepUnbatched(o, this.S.scene);
    for (const o of this.unbatched) if (o.parent === this.S.root) this.S.root.remove(o);
    return { patches, blocks, bake };
  }
}
