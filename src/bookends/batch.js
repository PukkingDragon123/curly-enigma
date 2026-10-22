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
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    const e = _m.elements, ne = _n.elements;
    for (const o of gr.items) {
      _m.multiplyMatrices(_inv, o.matrixWorld);
      _n.getNormalMatrix(_m);
      const flip = _m.determinant() < 0;
      const g = o.geometry;
      const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, I = g.index;
      const fast = !P.isInterleavedBufferAttribute && !N.isInterleavedBufferAttribute && !C.isInterleavedBufferAttribute && P.itemSize === 3 && N.itemSize === 3 && C.itemSize === 3;
      const pa = P.array, na = N.array, ca = C.array;
      const nk = N.normalized ? (na instanceof Int8Array ? 1 / 127 : na instanceof Int16Array ? 1 / 32767 : 1) : 1;
      const ck = C.normalized ? (ca instanceof Uint8Array ? 1 / 255 : ca instanceof Uint16Array ? 1 / 65535 : 1) : 1;
      for (let i = 0; i < P.count; i++) {
        let px, py, pz, nx, ny, nz;
        if (fast) { px = pa[i * 3]; py = pa[i * 3 + 1]; pz = pa[i * 3 + 2]; nx = na[i * 3] * nk; ny = na[i * 3 + 1] * nk; nz = na[i * 3 + 2] * nk; }
        else { _v.fromBufferAttribute(P, i); px = _v.x; py = _v.y; pz = _v.z; _v.fromBufferAttribute(N, i); nx = _v.x; ny = _v.y; nz = _v.z; }
        const X = e[0] * px + e[4] * py + e[8] * pz + e[12], Y = e[1] * px + e[5] * py + e[9] * pz + e[13], Z = e[2] * px + e[6] * py + e[10] * pz + e[14];
        const o3 = (vo + i) * 3;
        pos[o3] = X; pos[o3 + 1] = Y; pos[o3 + 2] = Z;
        if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; if (Z < z0) z0 = Z; if (Z > z1) z1 = Z;
        let tx = ne[0] * nx + ne[3] * ny + ne[6] * nz, ty = ne[1] * nx + ne[4] * ny + ne[7] * nz, tz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
        const l = Math.hypot(tx, ty, tz) || 1;
        nor[o3] = tx / l; nor[o3 + 1] = ty / l; nor[o3 + 2] = tz / l;
        if (fast) { col[o3] = ca[i * 3] * ck; col[o3 + 1] = ca[i * 3 + 1] * ck; col[o3 + 2] = ca[i * 3 + 2] * ck; }
        else { col[o3] = C.getX(i); col[o3 + 1] = C.getY(i); col[o3 + 2] = C.getZ(i); }
      }
      const ia = I.array;
      for (let i = 0; i < I.count; i += 3) {
        const a = ia[i] + vo, b = ia[i + 1] + vo, c = ia[i + 2] + vo;
        if (flip) { idx[io++] = a; idx[io++] = c; idx[io++] = b; } else { idx[io++] = a; idx[io++] = b; idx[io++] = c; }
      }
      vo += P.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
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
