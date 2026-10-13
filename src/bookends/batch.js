// Static batching: merge many small voxel meshes that share a material into one mesh per
// (material, outline layer, render order). Dioramas are built from dozens of props; drawing
// them as a handful of merged meshes keeps the frame cheap (every outlined mesh is drawn twice:
// once for colour and once for the outline mask).
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../core/Engine.js';

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();

function mergeable(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return false;
  if (o.userData.dynamic || o.userData.noBatch) return false;
  const g = o.geometry, m = o.material;
  if (!g || !m || Array.isArray(m) || !g.index) return false;
  if (!g.attributes.position || !g.attributes.normal || !g.attributes.color) return false;
  if (m.map || m.transparent || !m.vertexColors) return false;
  return true;
}

function visibleChain(o, stop) {
  for (let p = o; p && p !== stop; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * Merge every static vertex-coloured mesh under `root` (skipping objects flagged
 * userData.dynamic / userData.noBatch, and anything inside an object flagged userData.dynamic).
 * The merged meshes are added to `root`; the originals are removed. Returns the merged meshes.
 */
export function batchStatic(root, { skip = null } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const groups = new Map();
  const walk = (o, dynamic) => {
    const dyn = dynamic || !!o.userData.dynamic || (skip && skip(o));
    if (!dyn && o !== root && mergeable(o) && visibleChain(o, root)) {
      const outline = o.layers.isEnabled(LAYER_OUTLINE);
      const key = `${o.material.uuid}|${outline ? 1 : 0}|${o.renderOrder}`;
      let gr = groups.get(key);
      if (!gr) { gr = { mat: o.material, outline, order: o.renderOrder, items: [], verts: 0, idx: 0 }; groups.set(key, gr); }
      gr.items.push(o);
      gr.verts += o.geometry.attributes.position.count;
      gr.idx += o.geometry.index.count;
    }
    for (const c of o.children) walk(c, dyn);
  };
  walk(root, false);
  const out = [];
  for (const gr of groups.values()) {
    if (gr.items.length < 2) continue;
    const pos = new Float32Array(gr.verts * 3), nor = new Float32Array(gr.verts * 3), col = new Float32Array(gr.verts * 3);
    const big = gr.verts > 65535;
    const idx = big ? new Uint32Array(gr.idx) : new Uint16Array(gr.idx);
    let vo = 0, io = 0;
    for (const o of gr.items) {
      _m.multiplyMatrices(_inv, o.matrixWorld);
      _n.getNormalMatrix(_m);
      const flip = _m.determinant() < 0;
      const g = o.geometry;
      const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, I = g.index;
      for (let i = 0; i < P.count; i++) {
        _v.fromBufferAttribute(P, i).applyMatrix4(_m);
        pos[(vo + i) * 3] = _v.x; pos[(vo + i) * 3 + 1] = _v.y; pos[(vo + i) * 3 + 2] = _v.z;
        _v.fromBufferAttribute(N, i).applyMatrix3(_n).normalize();
        nor[(vo + i) * 3] = _v.x; nor[(vo + i) * 3 + 1] = _v.y; nor[(vo + i) * 3 + 2] = _v.z;
        col[(vo + i) * 3] = C.getX(i); col[(vo + i) * 3 + 1] = C.getY(i); col[(vo + i) * 3 + 2] = C.getZ(i);
      }
      for (let i = 0; i < I.count; i += 3) {
        const a = I.getX(i) + vo, b = I.getX(i + 1) + vo, c = I.getX(i + 2) + vo;
        if (flip) { idx[io++] = a; idx[io++] = c; idx[io++] = b; } else { idx[io++] = a; idx[io++] = b; idx[io++] = c; }
      }
      vo += P.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, gr.mat);
    mesh.renderOrder = gr.order;
    if (gr.outline) mesh.layers.enable(LAYER_OUTLINE);
    mesh.name = 'batch';
    mesh.userData.batched = gr.items.length;
    out.push(mesh);
    for (const o of gr.items) {
      o.parent.remove(o);
      if (!o.geometry.userData.shared) o.geometry.dispose();
    }
  }
  for (const m of out) root.add(m);
  return out;
}

/** Count draw-relevant meshes under a root (for logs). */
export function countMeshes(root) {
  let n = 0;
  root.traverse((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.visible) n++; });
  return n;
}
