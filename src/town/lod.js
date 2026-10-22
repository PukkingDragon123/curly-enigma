// Cheap levels of detail for voxel meshes. Every vertex is snapped to a coarser lattice, one axis
// at a time with the same monotonic rounding, so a closed voxel surface stays closed: faces keep
// their axis and facing, faces thinner than a lattice step collapse and are dropped, wider ones
// grow to the lattice. It is roughly the mesh of the voxels downsampled, without re-meshing.
import * as THREE from 'three';

/**
 * A simplified copy of an indexed geometry: positions snapped to multiples of `step` (in the
 * geometry's own units), degenerate triangles dropped. Every other attribute is shared with the
 * source (only the positions and the index are new). o.dropBones: Set of skin bone indices whose
 * triangles are left out (hidden face variants). Returns { geo, tris } or null if nothing is gained.
 */
export function snapGeometry(src, step, o = {}) {
  const P = src.getAttribute('position');
  if (!P || !src.index) return null;
  const p = P.array, n = P.count;
  const q = new Float32Array(n * 3);
  const inv = 1 / step;
  for (let i = 0; i < n * 3; i++) q[i] = Math.round(p[i] * inv) * step;
  const si = o.dropBones ? src.getAttribute('skinIndex') : null;
  const I = src.index.array;
  const out = new (n > 65535 ? Uint32Array : Uint16Array)(I.length);
  let k = 0;
  const eps = 1e-12 * step * step * step * step;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (si && o.dropBones.has(si.getX(a))) continue;
    if (area2(q, a, b, c) < eps) continue;
    out[k++] = a; out[k++] = b; out[k++] = c;
  }
  if (k > I.length * 0.92) return null;
  const geo = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) geo.setAttribute(name, name === 'position' ? new THREE.BufferAttribute(q, 3) : attr);
  geo.setIndex(new THREE.BufferAttribute(out.slice(0, k), 1));
  if (src.boundingSphere) geo.boundingSphere = src.boundingSphere.clone();
  if (src.boundingBox) geo.boundingBox = src.boundingBox.clone();
  return { geo, tris: k / 3 };
}

/** Twice the squared area of triangle a, b, c in a packed xyz array (0 when it collapsed). */
function area2(q, a, b, c) {
  const ax = q[a * 3], ay = q[a * 3 + 1], az = q[a * 3 + 2];
  const ux = q[b * 3] - ax, uy = q[b * 3 + 1] - ay, uz = q[b * 3 + 2] - az;
  const vx = q[c * 3] - ax, vy = q[c * 3 + 1] - ay, vz = q[c * 3 + 2] - az;
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  return cx * cx + cy * cy + cz * cz;
}

/**
 * Snap a packed static mesh ({ P: Float32 xyz, N, C, G (any typed arrays, 3/3/1 per vertex),
 * I: index, fine: per-vertex Uint8 or null, ol: outlined triangles at the start }) and compact it
 * to the vertices still in use. step: lattice for ordinary vertices; fineStep for `fine` ones
 * (0 keeps them as they are). Returns the same shape, or null when it saves less than minGain.
 */
export function snapPacked(src, step, fineStep = 0, force = false, minGain = 0.08) {
  const { P, I, fine } = src;
  const n = P.length / 3;
  const q = new Float32Array(n * 3);
  const inv = 1 / step, finv = fineStep ? 1 / fineStep : 0;
  for (let v = 0; v < n; v++) {
    const i = v * 3;
    if (fine && fine[v]) {
      if (fineStep && fine[v] === 1) { q[i] = Math.round(P[i] * finv) * fineStep; q[i + 1] = Math.round(P[i + 1] * finv) * fineStep; q[i + 2] = Math.round(P[i + 2] * finv) * fineStep; }
      else { q[i] = P[i]; q[i + 1] = P[i + 1]; q[i + 2] = P[i + 2]; }
    } else { q[i] = Math.round(P[i] * inv) * step; q[i + 1] = Math.round(P[i + 1] * inv) * step; q[i + 2] = Math.round(P[i + 2] * inv) * step; }
  }
  const eps = 1e-12 * Math.pow(Math.min(step, fineStep || step), 4);
  const keepT = new Uint8Array(I.length / 3);
  const map = new Int32Array(n).fill(-1);
  let nt = 0, nv = 0, ol = 0;
  const olAt = (src.ol || 0) * 3;
  const Nn = src.N;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (area2(q, a, b, c) < eps) continue;
    // a sliver of a turned prop can fold over when its corners snap past each other: it would
    // show its back (lit as if facing the other way), so it goes too
    const ux = q[b * 3] - q[a * 3], uy = q[b * 3 + 1] - q[a * 3 + 1], uz = q[b * 3 + 2] - q[a * 3 + 2];
    const vx = q[c * 3] - q[a * 3], vy = q[c * 3 + 1] - q[a * 3 + 1], vz = q[c * 3 + 2] - q[a * 3 + 2];
    if ((uy * vz - uz * vy) * Nn[a * 3] + (uz * vx - ux * vz) * Nn[a * 3 + 1] + (ux * vy - uy * vx) * Nn[a * 3 + 2] <= 0) continue;
    keepT[t / 3] = 1; nt++;
    if (t < olAt) ol++;
    if (map[a] < 0) map[a] = nv++;
    if (map[b] < 0) map[b] = nv++;
    if (map[c] < 0) map[c] = nv++;
  }
  if (!force && nt * 3 > I.length * (1 - minGain)) return null;
  const out = {
    P: new Float32Array(nv * 3), N: new src.N.constructor(nv * 3), C: new src.C.constructor(nv * 3), G: new src.G.constructor(nv),
    I: new (nv > 65535 ? Uint32Array : Uint16Array)(nt * 3), fine: null, ol,
  };
  for (let v = 0; v < n; v++) {
    const m = map[v];
    if (m < 0) continue;
    out.P[m * 3] = q[v * 3]; out.P[m * 3 + 1] = q[v * 3 + 1]; out.P[m * 3 + 2] = q[v * 3 + 2];
    out.N[m * 3] = src.N[v * 3]; out.N[m * 3 + 1] = src.N[v * 3 + 1]; out.N[m * 3 + 2] = src.N[v * 3 + 2];
    out.C[m * 3] = src.C[v * 3]; out.C[m * 3 + 1] = src.C[v * 3 + 1]; out.C[m * 3 + 2] = src.C[v * 3 + 2];
    out.G[m] = src.G[v];
  }
  for (let t = 0, o = 0; t < I.length; t += 3) {
    if (!keepT[t / 3]) continue;
    out.I[o++] = map[I[t]]; out.I[o++] = map[I[t + 1]]; out.I[o++] = map[I[t + 2]];
  }
  return out;
}

/**
 * Levels of detail for a character rig (makeCharacter): per skinned mesh, [full, lod1, lod2].
 * lod1 snaps to 2 hi-res voxels, lod2 to 4. Every face variant is kept, so expressions, blinks
 * and talking mouths still switch at any distance. Built on first use.
 */
export class RigLOD {
  constructor(rig) {
    this.rig = rig;
    this.meshes = (rig.meshes || []).filter((m) => m && m.isSkinnedMesh && m.geometry?.index);
    this.levels = null;
    this.level = 0;
  }
  build() {
    this.levels = this.meshes.map((m) => {
      const full = m.geometry;
      // every face variant stays (expressions switch them at any distance); far folk only snap
      const l1 = snapGeometry(full, 2);
      const l2 = snapGeometry(full, 4);
      return [full, l1 ? l1.geo : full, l2 ? l2.geo : (l1 ? l1.geo : full)];
    });
  }
  set(level) {
    if (level === this.level) return;
    if (!this.levels) this.build();
    this.level = level;
    this.meshes.forEach((m, i) => { m.geometry = this.levels[i][level]; });
  }
  /** Back to the full meshes and free the copies (their own positions and index only). */
  dispose() {
    if (!this.levels) return;
    this.meshes.forEach((m, i) => {
      const [full, a, b] = this.levels[i];
      m.geometry = full;
      for (const g of new Set([a, b])) if (g !== full) { for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); g.dispose(); }
    });
    this.levels = null;
  }
}
