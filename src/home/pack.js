// Packing the house for the trip from a build worker to the scene (and for keeping it between
// visits): static meshes merged per room and material, then quantized (positions as 16-bit fixed
// point in the mesh's own box, normals as bytes, colors as 16 bits at half scale, 16-bit indices
// wherever a chunk has < 64 k vertices), about 2.4x smaller than plain floats; the live pieces
// (flames, the pendulum, the bellows, the chest...) as small object trees; textures as raw RGBA.
// Everything packed is plain data and typed arrays, so it can be posted (transferred) and kept.
import * as THREE from 'three';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

/** Color scale of quantized vertex colors (baked light can lift a color to 2x). */
export const CSCALE = 2;
const MAXV = 65535;

// ---------------------------------------------------------------- materials
/** A small description of a material (only the kinds the house uses), or null for none we can pack. */
export function matDesc(m) {
  if (!m) return null;
  const k = m.isMeshToonMaterial ? 'toon' : m.isMeshLambertMaterial ? 'lambert' : m.isMeshBasicMaterial ? 'basic' : m.isShaderMaterial ? 'shader' : null;
  if (!k || k === 'shader') return null;
  const d = { k, vc: !!m.vertexColors };
  if (m.color && (m.color.r !== 1 || m.color.g !== 1 || m.color.b !== 1)) d.c = [m.color.r, m.color.g, m.color.b];
  if (m.transparent) d.tr = 1;
  if (m.opacity !== 1) d.op = m.opacity;
  if (m.side !== THREE.FrontSide) d.side = m.side;
  if (m.depthWrite === false) d.dw = 0;
  if (m.alphaTest) d.at = m.alphaTest;
  if (m.fog === false) d.fog = 0;
  if (!m.userData?.shared) d.u = 1; // its own instance (its color gets animated)
  return d;
}

const MAT_CACHE = new Map();
/** The material for a description: shared per description, or a fresh one (`u`, or `fresh`). cs: vertex color scale. */
export function matFrom(d, cs = 1, fresh = false) {
  const key = JSON.stringify(d) + '|' + cs;
  if (!fresh && !d.u && MAT_CACHE.has(key)) return MAT_CACHE.get(key);
  let m;
  if (d.vc) m = voxelMaterial(d.k, { unique: true });
  else if (d.k === 'toon') m = new THREE.MeshToonMaterial();
  else if (d.k === 'lambert') m = new THREE.MeshLambertMaterial();
  else m = new THREE.MeshBasicMaterial();
  if (d.c) m.color.setRGB(d.c[0], d.c[1], d.c[2]);
  if (cs !== 1) m.color.multiplyScalar(cs);
  if (d.tr) m.transparent = true;
  if (d.op !== undefined) m.opacity = d.op;
  if (d.side !== undefined) m.side = d.side;
  if (d.dw === 0) m.depthWrite = false;
  if (d.at) m.alphaTest = d.at;
  if (d.fog === 0) m.fog = false;
  if (!fresh && !d.u) { m.userData.shared = true; m.userData.house = true; MAT_CACHE.set(key, m); }
  return m;
}

// ---------------------------------------------------------------- merging
/**
 * Collects world-space geometries (position, normal, color, index; optional uv) into chunks of
 * fewer than 64 k vertices each (so their indices fit in 16 bits).
 */
export class Merger {
  constructor() { this.chunks = []; this.cur = null; }
  add(geo) {
    const n = geo.getAttribute('position').count;
    if (!n || !geo.index || !geo.index.count) return;
    if (!this.cur || (this.cur.nv + n > MAXV && this.cur.nv > 0)) { this.cur = { geos: [], nv: 0, ni: 0 }; this.chunks.push(this.cur); }
    this.cur.geos.push(geo);
    this.cur.nv += n;
    this.cur.ni += geo.index.count;
  }
  /** Merged geometries (Float32 position/normal/color, uv if every part has one). */
  build() {
    const out = [];
    for (const c of this.chunks) {
      const hasUV = c.geos.every((g) => g.getAttribute('uv'));
      const P = new Float32Array(c.nv * 3), N = new Float32Array(c.nv * 3), C = new Float32Array(c.nv * 3);
      const UV = hasUV ? new Float32Array(c.nv * 2) : null;
      const I = c.nv > MAXV ? new Uint32Array(c.ni) : new Uint16Array(c.ni);
      let ov = 0, oi = 0;
      for (const g of c.geos) {
        const n = g.getAttribute('position').count;
        P.set(g.getAttribute('position').array.subarray(0, n * 3), ov * 3);
        N.set(g.getAttribute('normal').array.subarray(0, n * 3), ov * 3);
        const col = g.getAttribute('color');
        if (col) C.set(col.array.subarray(0, n * 3), ov * 3); else C.fill(1, ov * 3, (ov + n) * 3);
        if (UV) UV.set(g.getAttribute('uv').array.subarray(0, n * 2), ov * 2);
        const idx = g.index.array;
        for (let k = 0; k < g.index.count; k++) I[oi + k] = idx[k] + ov;
        ov += n; oi += g.index.count;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
      if (UV) geo.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
      geo.setIndex(new THREE.BufferAttribute(I, 1));
      out.push(geo);
    }
    return out;
  }
}

/** A world-space copy of a mesh's geometry (non-indexed geometries get an index). */
export function worldGeo(m, geo = m.geometry) {
  const g = geo.clone().applyMatrix4(m.matrixWorld);
  if (!g.index) {
    const n = g.getAttribute('position').count;
    const I = n > MAXV ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) I[i] = i;
    g.setIndex(new THREE.BufferAttribute(I, 1));
  }
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- merging the mesher's shaded quads
/**
 * The voxel mesher merges only faces of one colour and flat corner shading (AO): a face with
 * shading across it (every step of a round or sloping thing) goes out on its own, one per voxel.
 * Most of those are the same face over and over along a straight run (a ring extruded through a
 * wall, a cylinder's side, a row of planks' edges): their shading changes across the run, not
 * along it. This merges such runs, exactly (the colours along the run are equal, so the merged
 * quad looks the same): first along v, then along u. Input: a mesher geometry (4 vertices and 6
 * indices per quad, axis-aligned, colours); anything else comes back unchanged.
 */
const MQ = new WeakMap();
export function mergeQuads(geo) {
  if (MQ.has(geo)) return MQ.get(geo);
  let out = geo;
  try { out = mergeQuadsNow(geo); } catch (e) { out = geo; }
  MQ.set(geo, out);
  return out;
}
const UA = [1, 0, 0], VA = [2, 2, 1];
function mergeQuadsNow(geo) {
  const pa = geo.getAttribute('position'), na = geo.getAttribute('normal'), ca = geo.getAttribute('color');
  if (!pa || !na || !ca || !geo.index || geo.getAttribute('uv') || geo.groups.length) return geo;
  const P = pa.array, N = na.array, Cf = ca.array, I = geo.index.array;
  const nv = pa.count;
  if (nv % 4 || geo.index.count !== nv * 1.5 || nv < 16 || ca.itemSize !== 3 || pa.itemSize !== 3) return geo;
  const C = new Uint32Array(Cf.buffer, Cf.byteOffset, Cf.length);
  const nq = nv / 4;
  const dA = new Uint8Array(nq), sA = new Uint8Array(nq), pl = new Float32Array(nq);
  const u0 = new Float32Array(nq), u1 = new Float32Array(nq), v0 = new Float32Array(nq), v1 = new Float32Array(nq);
  const side = new Uint8Array(nv), corner = new Int32Array(nq * 4), alive = new Uint8Array(nq).fill(1), merged = new Uint8Array(nq);
  for (let q = 0; q < nq; q++) {
    const b = q * 4;
    // its 6 indices must be its own 4 vertices
    for (let k = 0; k < 6; k++) { const i = I[q * 6 + k]; if (i < b || i > b + 3) return geo; }
    const nx = N[b * 3], ny = N[b * 3 + 1], nz = N[b * 3 + 2];
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    const d = ax > 0.99 ? 0 : ay > 0.99 ? 1 : az > 0.99 ? 2 : -1;
    if (d < 0) return geo;
    const u = UA[d], v = VA[d];
    dA[q] = d; sA[q] = (d === 0 ? nx : d === 1 ? ny : nz) < 0 ? 1 : 0; pl[q] = P[b * 3 + d];
    let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    for (let k = 0; k < 4; k++) { const pu = P[(b + k) * 3 + u], pv = P[(b + k) * 3 + v]; if (pu < a0) a0 = pu; if (pu > a1) a1 = pu; if (pv < c0) c0 = pv; if (pv > c1) c1 = pv; }
    u0[q] = a0; u1[q] = a1; v0[q] = c0; v1[q] = c1;
    for (let k = 0; k < 4; k++) {
      const su = P[(b + k) * 3 + u] === a1 ? 1 : 0, sv = P[(b + k) * 3 + v] === c1 ? 1 : 0;
      side[b + k] = su * 2 + sv;
      corner[q * 4 + su * 2 + sv] = b + k;
    }
  }
  const same = (i, j) => C[i * 3] === C[j * 3] && C[i * 3 + 1] === C[j * 3 + 1] && C[i * 3 + 2] === C[j * 3 + 2];
  const cmpC = (i, j) => (C[i * 3] - C[j * 3]) || (C[i * 3 + 1] - C[j * 3 + 1]) || (C[i * 3 + 2] - C[j * 3 + 2]);
  // along v: colours equal at v0 and v1 on each u side; along u: equal at u0 and u1 on each v side
  for (const alongV of [true, false]) {
    const list = [];
    for (let q = 0; q < nq; q++) {
      if (!alive[q]) continue;
      const k = q * 4;
      if (alongV ? same(corner[k], corner[k + 1]) && same(corner[k + 2], corner[k + 3]) : same(corner[k], corner[k + 2]) && same(corner[k + 1], corner[k + 3])) list.push(q);
    }
    if (list.length < 2) continue;
    const a0 = alongV ? u0 : v0, a1 = alongV ? u1 : v1, r0 = alongV ? v0 : u0, r1 = alongV ? v1 : u1;
    const cA = alongV ? 0 : 0, cB = alongV ? 2 : 1; // corner slots whose colours make the key
    list.sort((p, q) => (dA[p] - dA[q]) || (sA[p] - sA[q]) || (pl[p] - pl[q]) || (a0[p] - a0[q]) || (a1[p] - a1[q])
      || cmpC(corner[p * 4 + cA], corner[q * 4 + cA]) || cmpC(corner[p * 4 + cB], corner[q * 4 + cB]) || (r0[p] - r0[q]));
    let r = list[0];
    for (let i = 1; i < list.length; i++) {
      const q = list[i];
      if (dA[q] === dA[r] && sA[q] === sA[r] && pl[q] === pl[r] && a0[q] === a0[r] && a1[q] === a1[r] && r0[q] === r1[r]
        && same(corner[q * 4 + cA], corner[r * 4 + cA]) && same(corner[q * 4 + cB], corner[r * 4 + cB])) {
        r1[r] = r1[q];
        // the far corners come from the quad merged in
        if (alongV) { corner[r * 4 + 1] = corner[q * 4 + 1]; corner[r * 4 + 3] = corner[q * 4 + 3]; }
        else { corner[r * 4 + 2] = corner[q * 4 + 2]; corner[r * 4 + 3] = corner[q * 4 + 3]; }
        alive[q] = 0; merged[r] = 1;
      } else r = q;
    }
  }
  let n = 0;
  for (let q = 0; q < nq; q++) if (alive[q]) n++;
  if (n > nq * 0.95) return geo;
  const P2 = new Float32Array(n * 12), N2 = new Float32Array(n * 12), C2 = new Float32Array(n * 12);
  const I2 = n * 4 > 65535 ? new Uint32Array(n * 6) : new Uint16Array(n * 6);
  let o = 0;
  for (let q = 0; q < nq; q++) {
    if (!alive[q]) continue;
    const b = q * 4, d = dA[q], u = UA[d], v = VA[d];
    for (let k = 0; k < 4; k++) {
      const ov = o * 4 + k;
      if (merged[q]) {
        const sd = side[b + k], src = corner[q * 4 + sd];
        P2[ov * 3 + d] = pl[q]; P2[ov * 3 + u] = sd & 2 ? u1[q] : u0[q]; P2[ov * 3 + v] = sd & 1 ? v1[q] : v0[q];
        C2[ov * 3] = Cf[src * 3]; C2[ov * 3 + 1] = Cf[src * 3 + 1]; C2[ov * 3 + 2] = Cf[src * 3 + 2];
      } else {
        P2[ov * 3] = P[(b + k) * 3]; P2[ov * 3 + 1] = P[(b + k) * 3 + 1]; P2[ov * 3 + 2] = P[(b + k) * 3 + 2];
        C2[ov * 3] = Cf[(b + k) * 3]; C2[ov * 3 + 1] = Cf[(b + k) * 3 + 1]; C2[ov * 3 + 2] = Cf[(b + k) * 3 + 2];
      }
      N2[ov * 3] = N[b * 3]; N2[ov * 3 + 1] = N[b * 3 + 1]; N2[ov * 3 + 2] = N[b * 3 + 2];
    }
    if (merged[q]) { const j = o * 6, v0i = o * 4; I2[j] = v0i; I2[j + 1] = v0i + 1; I2[j + 2] = v0i + 2; I2[j + 3] = v0i; I2[j + 4] = v0i + 2; I2[j + 5] = v0i + 3; }
    else for (let k = 0; k < 6; k++) I2[o * 6 + k] = I[q * 6 + k] - b + o * 4;
    o++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P2, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N2, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C2, 3));
  g.setIndex(new THREE.BufferAttribute(I2, 1));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- quantized static geometry
/**
 * Quantize a world-space geometry (Float32 position, normal, color, optional uv; index) into
 * { pos: Uint16 (normalized in the box q), nor: Int8, col: Uint16 (color / CSCALE), uv?: Uint16,
 *   idx, q: [x0, y0, z0, size], bs: [cx, cy, cz, r] (in the quantized space) }.
 */
export function quantize(geo) {
  const P = geo.getAttribute('position').array, N = geo.getAttribute('normal').array, C = geo.getAttribute('color')?.array, UVa = geo.getAttribute('uv')?.array;
  const n = P.length / 3;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  const S = Math.max(1e-4, x1 - x0, y1 - y0, z1 - z0), k = MAXV / S;
  const pos = new Uint16Array(n * 3), nor = new Int8Array(n * 3), col = new Uint16Array(n * 3);
  for (let i = 0; i < n * 3; i += 3) {
    pos[i] = Math.round((P[i] - x0) * k); pos[i + 1] = Math.round((P[i + 1] - y0) * k); pos[i + 2] = Math.round((P[i + 2] - z0) * k);
    nor[i] = Math.round(N[i] * 127); nor[i + 1] = Math.round(N[i + 1] * 127); nor[i + 2] = Math.round(N[i + 2] * 127);
  }
  if (C) for (let i = 0; i < n * 3; i++) col[i] = Math.round(Math.min(1, Math.max(0, C[i] / CSCALE)) * MAXV);
  else col.fill(Math.round(MAXV / CSCALE));
  let uv = null;
  if (UVa) { uv = new Uint16Array(n * 2); for (let i = 0; i < n * 2; i++) uv[i] = Math.round(Math.min(1, Math.max(0, UVa[i])) * MAXV); }
  const src = geo.index.array;
  const idx = n > MAXV + 1 ? (src instanceof Uint32Array ? src.slice() : Uint32Array.from(src)) : (src instanceof Uint16Array ? src.slice() : Uint16Array.from(src));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
  let r2 = 0;
  for (let i = 0; i < P.length; i += 3) { const dx = P[i] - cx, dy = P[i + 1] - cy, dz = P[i + 2] - cz; const d = dx * dx + dy * dy + dz * dz; if (d > r2) r2 = d; }
  return { pos, nor, col, uv, idx, q: [x0, y0, z0, S], bs: [(cx - x0) / S, (cy - y0) / S, (cz - z0) / S, Math.sqrt(r2) / S], tris: idx.length / 3 };
}

/** Transferables of a quantized geometry. */
export function qTransfer(q, out = []) {
  for (const k of ['pos', 'nor', 'col', 'uv', 'idx']) if (q[k]) out.push(q[k].buffer);
  return out;
}

/** A mesh from a quantized geometry (positioned and scaled back into meters). */
export function unquantize(q, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(q.pos, 3, true));
  geo.setAttribute('normal', new THREE.BufferAttribute(q.nor, 3, true));
  geo.setAttribute('color', new THREE.BufferAttribute(q.col, 3, true));
  if (q.uv) geo.setAttribute('uv', new THREE.BufferAttribute(q.uv, 2, true));
  geo.setIndex(new THREE.BufferAttribute(q.idx, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(q.bs[0], q.bs[1], q.bs[2]), q.bs[3]);
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
  const m = new THREE.Mesh(geo, material);
  m.position.set(q.q[0], q.q[1], q.q[2]);
  m.scale.setScalar(q.q[3]);
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

// ---------------------------------------------------------------- live object trees
const SAFE = (v, depth = 0) => {
  if (v === null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (depth > 3 || typeof v !== 'object' || v.isObject3D || ArrayBuffer.isView(v)) return undefined;
  if (Array.isArray(v)) return v.map((x) => SAFE(x, depth + 1));
  const o = {};
  for (const [k, x] of Object.entries(v)) { const y = SAFE(x, depth + 1); if (y !== undefined) o[k] = y; }
  return o;
};

/**
 * Pack an object tree (groups and meshes; geometry kept as plain floats): returns the packed node
 * and fills ctx.ids (Object3D → id) and ctx.transfer.
 */
export function packNode(obj, ctx) {
  const id = ctx.next++;
  ctx.ids.set(obj, id);
  obj.updateMatrix();
  const p = { id, t: obj.isMesh ? 'M' : 'G', n: obj.name || undefined, m: obj.matrix.toArray(), v: obj.visible ? undefined : 0, r: obj.renderOrder || undefined, l: obj.layers.mask !== 1 ? obj.layers.mask : undefined, u: SAFE(obj.userData), c: [] };
  if (obj.isMesh) {
    const g = obj.geometry, a = {};
    for (const [k, attr] of Object.entries(g.attributes)) {
      const arr = attr.array.slice(0, attr.count * attr.itemSize);
      a[k] = { a: arr, s: attr.itemSize, n: attr.normalized ? 1 : undefined };
      ctx.transfer.push(arr.buffer);
    }
    p.g = { a, i: g.index ? g.index.array.slice(0, g.index.count) : null };
    if (p.g.i) ctx.transfer.push(p.g.i.buffer);
    p.mt = matDesc(obj.material);
  }
  for (const c of obj.children) if (c.isMesh || c.isGroup || c.type === 'Object3D') p.c.push(packNode(c, ctx));
  return p;
}

/** Rebuild a packed tree; fills ids (id → Object3D). */
export function unpackNode(p, ids) {
  let o;
  if (p.t === 'M' && p.g) {
    const geo = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(p.g.a)) geo.setAttribute(k, new THREE.BufferAttribute(a.a, a.s, !!a.n));
    if (p.g.i) geo.setIndex(new THREE.BufferAttribute(p.g.i, 1));
    geo.computeBoundingSphere();
    o = new THREE.Mesh(geo, p.mt ? matFrom(p.mt) : voxelMaterial('toon'));
  } else o = new THREE.Group();
  o.matrix.fromArray(p.m);
  o.matrix.decompose(o.position, o.quaternion, o.scale);
  if (p.n) o.name = p.n;
  if (p.v === 0) o.visible = false;
  if (p.r) o.renderOrder = p.r;
  if (p.l !== undefined) o.layers.mask = p.l;
  if (p.u) Object.assign(o.userData, p.u);
  ids.set(p.id, o);
  for (const c of p.c) o.add(unpackNode(c, ids));
  return o;
}

/**
 * Pack a value for the scene: Object3D → a reference to a packed node ({ $o: id }) or, for a piece
 * that was merged away, its frame in the room ({ $f: matrix }); vectors → { $v: [x, y, z] };
 * functions are dropped (the scene puts back the few it needs).
 */
export function packRef(v, ctx, depth = 0) {
  if (v === null || v === undefined || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'function') return undefined;
  if (v.isObject3D) {
    if (ctx.ids.has(v)) return { $o: ctx.ids.get(v) };
    v.updateMatrixWorld(true);
    const m = new THREE.Matrix4().copy(ctx.roomInv).multiply(v.matrixWorld);
    return { $f: m.toArray() };
  }
  if (v.isVector3) return { $v: [v.x, v.y, v.z] };
  if (v.isMaterial || v.isBufferGeometry || ArrayBuffer.isView(v) || depth > 5) return undefined;
  if (Array.isArray(v)) return v.map((x) => packRef(x, ctx, depth + 1));
  if (typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) { const y = packRef(x, ctx, depth + 1); if (y !== undefined) o[k] = y; }
    return o;
  }
  return undefined;
}

/** Undo packRef: ids (id → Object3D), room (the tile group: frames of merged pieces hang there). */
export function unpackRef(v, ids, room) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => unpackRef(x, ids, room));
  if (v.$o !== undefined) return ids.get(v.$o) || null;
  if (v.$v) return new THREE.Vector3(v.$v[0], v.$v[1], v.$v[2]);
  if (v.$f) {
    const g = new THREE.Group();
    g.matrix.fromArray(v.$f);
    g.matrix.decompose(g.position, g.quaternion, g.scale);
    room.add(g);
    return g;
  }
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = unpackRef(x, ids, room);
  return o;
}

/** Outline layer on (for meshes rebuilt from packed data). */
export function outlined(m, on) { if (on) m.layers.enable(LAYER_OUTLINE); return m; }
