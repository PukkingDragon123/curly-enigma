// Relief (heightfield) mesher for first person: a grid of columns sticking out along +z from a
// base plane, meshed with greedy caps (+z, corner AO) and every side face (±u, ±v) where a
// neighbour column is shallower, so it holds up from any angle (the iso mesher only emitted the
// faces its fixed camera could see). The grid carries a one-column apron on every side: the apron
// is never meshed, it only tells the edges what lies next door (no seams between chunks).
import * as THREE from 'three';
import { LIN, MESH_STATS } from '../iso/mesher.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

const AO = [1.0, 0.8, 0.66, 0.52];

class Out {
  constructor(n) {
    this.pos = new Float32Array(n * 3); this.nor = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.idx = new Uint32Array(n * 1.5); this.nv = 0; this.ni = 0;
  }
  grow() {
    const g = (a, len) => { const b = new a.constructor(len); b.set(a); return b; };
    const n = this.pos.length * 2;
    this.pos = g(this.pos, n); this.nor = g(this.nor, n); this.col = g(this.col, n); this.idx = g(this.idx, n / 2);
  }
}

/**
 * depth, color: (U+2)×(V+2) arrays (index u + v*(U+2), apron included); depth in voxels (z), color sRGB hex.
 * o: { scale, aoMin (only steps taller than this cast AO on caps), sideShade, capShade, sideAO (bool) }
 * Returns a BufferGeometry (local: x = u, y = v, z = depth, all × scale, origin at the inner grid corner) or null.
 */
export function reliefGeometry(depth, color, U, V, o = {}) {
  const s = o.scale ?? 1 / 16;
  const aoMin = o.aoMin ?? 0;
  const sideK = o.sideShade ?? 0.9, capK = o.capShade ?? 1;
  const sideAO = o.sideAO ?? true;
  const PW = U + 2;
  const D = (u, v) => depth[u + 1 + (v + 1) * PW];
  const Cc = (u, v) => color[u + 1 + (v + 1) * PW];
  const out = new Out(Math.max(2048, U * V));
  const push = (x, y, z, nx, ny, nz, c, k) => {
    if ((out.nv + 1) * 3 > out.pos.length) out.grow();
    const i = out.nv * 3;
    out.pos[i] = x * s; out.pos[i + 1] = y * s; out.pos[i + 2] = z * s;
    out.nor[i] = nx; out.nor[i + 1] = ny; out.nor[i + 2] = nz;
    out.col[i] = LIN[(c >> 16) & 255] * k; out.col[i + 1] = LIN[(c >> 8) & 255] * k; out.col[i + 2] = LIN[c & 255] * k;
    out.nv++;
  };
  // the last 4 pushed vertices as a quad; flips the diagonal by AO and the winding to match the normal
  const quad = (a0, a1, a2, a3) => {
    if (out.ni + 6 > out.idx.length) out.grow();
    const v0 = out.nv - 4, P = out.pos, N = out.nor;
    const ax = P[(v0 + 1) * 3] - P[v0 * 3], ay = P[(v0 + 1) * 3 + 1] - P[v0 * 3 + 1], az = P[(v0 + 1) * 3 + 2] - P[v0 * 3 + 2];
    const bx = P[(v0 + 2) * 3] - P[v0 * 3], by = P[(v0 + 2) * 3 + 1] - P[v0 * 3 + 1], bz = P[(v0 + 2) * 3 + 2] - P[v0 * 3 + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const flip = cx * N[v0 * 3] + cy * N[v0 * 3 + 1] + cz * N[v0 * 3 + 2] < 0;
    const I = out.idx;
    let j = out.ni;
    const t = (p, q, r) => { if (flip) { I[j++] = p; I[j++] = r; I[j++] = q; } else { I[j++] = p; I[j++] = q; I[j++] = r; } };
    if (AO[a0] + AO[a2] < AO[a1] + AO[a3]) { t(v0 + 1, v0 + 2, v0 + 3); t(v0 + 1, v0 + 3, v0); }
    else { t(v0, v0 + 1, v0 + 2); t(v0, v0 + 2, v0 + 3); }
    out.ni = j;
  };
  const scale = (c, k) => {
    if (k === 1) return c;
    const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
    return (r << 16) | (g << 8) | b;
  };

  // ---- caps (+z): greedy over equal depth + colour + flat AO
  const key = new Int32Array(U * V);
  for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
    const d = D(u, v), q = u + v * U;
    if (d <= 0) { key[q] = 0; continue; }
    const c = scale(Cc(u, v), capK);
    const dd = d + aoMin;
    const L = D(u - 1, v) > dd ? 1 : 0, R = D(u + 1, v) > dd ? 1 : 0, Dn = D(u, v - 1) > dd ? 1 : 0, Up = D(u, v + 1) > dd ? 1 : 0;
    const q0 = L && Dn ? 3 : L + Dn + (D(u - 1, v - 1) > dd ? 1 : 0);
    const q1 = R && Dn ? 3 : R + Dn + (D(u + 1, v - 1) > dd ? 1 : 0);
    const q2 = R && Up ? 3 : R + Up + (D(u + 1, v + 1) > dd ? 1 : 0);
    const q3 = L && Up ? 3 : L + Up + (D(u - 1, v + 1) > dd ? 1 : 0);
    if (q0 === q1 && q1 === q2 && q2 === q3) { key[q] = ((c & 0xffffff) * 4 + q0 + 1) | 0; continue; }
    key[q] = 0;
    push(u, v, d, 0, 0, 1, c, AO[q0]); push(u + 1, v, d, 0, 0, 1, c, AO[q1]); push(u + 1, v + 1, d, 0, 0, 1, c, AO[q2]); push(u, v + 1, d, 0, 0, 1, c, AO[q3]);
    quad(q0, q1, q2, q3);
  }
  for (let v = 0; v < V; v++) for (let u = 0; u < U;) {
    const q = u + v * U, k = key[q];
    if (!k) { u++; continue; }
    const d = D(u, v);
    let w = 1;
    while (u + w < U && key[q + w] === k && D(u + w, v) === d) w++;
    let h = 1;
    outer: while (v + h < V) {
      const r = q + h * U;
      for (let i = 0; i < w; i++) if (key[r + i] !== k || D(u + i, v + h) !== d) break outer;
      h++;
    }
    for (let hh = 0; hh < h; hh++) key.fill(0, q + hh * U, q + hh * U + w);
    const c = (k - 1) >>> 2, a = AO[(k - 1) & 3];
    push(u, v, d, 0, 0, 1, c, a); push(u + w, v, d, 0, 0, 1, c, a); push(u + w, v + h, d, 0, 0, 1, c, a); push(u, v + h, d, 0, 0, 1, c, a);
    quad((k - 1) & 3, (k - 1) & 3, (k - 1) & 3, (k - 1) & 3);
    u += w;
  }
  // ---- sides: a face wherever the neighbour is shallower, merged into runs
  const lo = sideAO ? AO[2] : 1, hi = 1;
  // ±u faces (normal ±x), runs along v
  for (const sg of [1, -1]) {
    for (let u = 0; u < U; u++) for (let v = 0; v < V;) {
      const d = D(u, v), dn = Math.max(0, D(u + sg, v));
      if (d <= dn) { v++; continue; }
      const c = Cc(u, v);
      let h = 1;
      while (v + h < V && D(u, v + h) === d && Math.max(0, D(u + sg, v + h)) === dn && Cc(u, v + h) === c) h++;
      const x = sg > 0 ? u + 1 : u, cc = scale(c, sideK);
      push(x, v, dn, sg, 0, 0, cc, lo); push(x, v + h, dn, sg, 0, 0, cc, lo); push(x, v + h, d, sg, 0, 0, cc, hi); push(x, v, d, sg, 0, 0, cc, hi);
      quad(2, 2, 0, 0);
      v += h;
    }
  }
  // ±v faces (normal ±y), runs along u
  for (const sg of [1, -1]) {
    for (let v = 0; v < V; v++) for (let u = 0; u < U;) {
      const d = D(u, v), dn = Math.max(0, D(u, v + sg));
      if (d <= dn) { u++; continue; }
      const c = Cc(u, v);
      let w = 1;
      while (u + w < U && D(u + w, v) === d && Math.max(0, D(u + w, v + sg)) === dn && Cc(u + w, v) === c) w++;
      const y = sg > 0 ? v + 1 : v, cc = scale(c, sideK * (sg > 0 ? 1.04 : 0.86));
      push(u, y, dn, 0, sg, 0, cc, lo); push(u + w, y, dn, 0, sg, 0, cc, lo); push(u + w, y, d, 0, sg, 0, cc, hi); push(u, y, d, 0, sg, 0, cc, hi);
      quad(2, 2, 0, 0);
      u += w;
    }
  }
  MESH_STATS.tris += out.ni / 3;
  if (MESH_STATS.log) MESH_STATS.log.push([out.ni / 3, U, V, 0, 'relief:' + (o.tag || '?')]);
  if (!out.nv) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(out.pos.slice(0, out.nv * 3), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(out.nor.slice(0, out.nv * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(out.col.slice(0, out.nv * 3), 3));
  geo.setIndex(new THREE.BufferAttribute(out.nv > 65535 ? out.idx.slice(0, out.ni) : Uint16Array.from(out.idx.subarray(0, out.ni)), 1));
  geo.computeBoundingSphere();
  return geo;
}

/** reliefGeometry as a toon mesh (outline off by default: rock is drawn once). */
export function reliefMesh(depth, color, U, V, o = {}) {
  const geo = reliefGeometry(depth, color, U, V, o);
  if (!geo) return null;
  const m = new THREE.Mesh(geo, voxelMaterial(o.kind ?? 'toon'));
  if (o.outline) m.layers.enable(LAYER_OUTLINE);
  return m;
}

/** Allocate apron'd relief buffers: { depth, color, PW, PH, set(u, v, d, c) } (u, v may be -1..U / -1..V). */
export function reliefBuffers(U, V) {
  const PW = U + 2, PH = V + 2;
  const depth = new Int16Array(PW * PH), color = new Uint32Array(PW * PH);
  return { depth, color, PW, PH, U, V, set(u, v, d, c) { const i = u + 1 + (v + 1) * PW; depth[i] = d; color[i] = c; } };
}
