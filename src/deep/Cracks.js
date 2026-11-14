// Cracks on a rock face that has taken a blow but not given yet (DigScene's pick, Dig.js plates).
// Each blow on a plate starts a star of jagged fractures at the point struck; the more damage the
// plate has, the further they run, and they stop where they reach the plate's seam (so a cracked
// plate reads as one piece about to come out). Every vertex is dropped onto the real voxel surface
// by a short ray, so the lines lie on the rock. One mesh of thin quads, rebuilt only when a crack
// changes; a plate's cracks go when it breaks out or the rock under them is dug away.
// Wave 14: the stages read at a glance: hairline cracks after the first blow, wider as the plate
// weakens, and close to giving each crack gets a pale lit lip along one side (the broken edge
// catching the lamp), so a plate about to go looks loose.
//
//   const cracks = new Cracks(scene3, world);
//   cracks.hit(key, [x, y, z] (m, on the face), [nx, ny, nz], damage 0..1, samePlate(vx, vy, vz) → bool, pale);
//   cracks.clear(key); cracks.refresh(); cracks.dispose();
import * as THREE from 'three';
import { VOX } from './materials.js';

const MAXQ = 900; // quads
const MAX_STARS = 18;
const SEG = 0.03; // m per segment
const OFF = 0.0025; // lift off the rock (m)
const TAN = [[[0, 1, 0], [0, 0, 1]], [[1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 1, 0]]];

// a small deterministic RNG per star
function rng(seed) {
  let h = (seed % 2147483646) + 1;
  return () => ((h = (h * 16807) % 2147483647) / 2147483647);
}

export class Cracks {
  constructor(scene3, world) {
    this.w = world;
    this.stars = []; // { key, p, n, d, same, pale, branches: [[{u, v, w}]], seed }
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXQ * 4 * 3);
    this.col = new Float32Array(MAXQ * 4 * 4);
    const idx = new Uint16Array(MAXQ * 6);
    for (let i = 0; i < MAXQ; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene3.add(this.mesh);
  }

  /** A blow on plate `key` at p (m) through a face with normal n; d = the plate's damage now. */
  hit(key, p, n, d, same, pale = false) {
    const mine = this.stars.filter((s) => s.key === key);
    for (const s of mine) { s.d = d; s.same = same; }
    // a new star where it was struck (unless one is right there already)
    if (!mine.some((s) => Math.hypot(s.p[0] - p[0], s.p[1] - p[1], s.p[2] - p[2]) < 0.06) && mine.length < 3) {
      const seed = (Math.floor(p[0] * 977) * 31 + Math.floor(p[1] * 613) * 17 + Math.floor(p[2] * 409) * 7 + key) >>> 0;
      this.stars.push({ key, p: p.slice(), n: n.slice(), d, same, pale, branches: this.pattern(seed) });
      while (this.stars.length > MAX_STARS) this.stars.shift();
    }
    this.build();
  }

  clear(key) {
    const n = this.stars.length;
    this.stars = this.stars.filter((s) => s.key !== key);
    if (this.stars.length !== n) this.build();
  }

  /** The rock changed: re-lay every crack on what is left (lines over fresh holes go). */
  refresh() { if (this.stars.length) this.build(); }

  /** Branches in face coordinates: 3-5 jagged main runs and a few side cracks. */
  pattern(seed) {
    const r = rng(seed), out = [];
    const nb = 4 + ((r() * 3) | 0), a0 = r() * 6.283;
    for (let i = 0; i < nb; i++) {
      let a = a0 + (i / nb) * 6.283 + (r() - 0.5) * 0.9;
      let u = 0, v = 0;
      const pts = [{ u, v }];
      const len = 5 + ((r() * 4) | 0);
      for (let k = 0; k < len; k++) {
        a += (r() - 0.5) * 0.95;
        const s = SEG * (0.7 + r() * 0.6);
        u += Math.cos(a) * s; v += Math.sin(a) * s;
        pts.push({ u, v });
        // a side crack forks off now and then
        if (k > 0 && k < len - 2 && r() < 0.3) {
          let b = a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), bu = u, bv = v;
          const side = [{ u: bu, v: bv }];
          for (let j = 0; j < 2 + ((r() * 2) | 0); j++) { b += (r() - 0.5) * 0.8; bu += Math.cos(b) * SEG * 0.7; bv += Math.sin(b) * SEG * 0.7; side.push({ u: bu, v: bv }); }
          out.push({ pts: side, w: 0.55, at: k / len });
        }
      }
      out.push({ pts, w: 1, at: 0 });
    }
    return out;
  }

  /** Drop a face point onto the rock: [x, y, z] on the surface, or null (dug away) / false (another plate). */
  land(s, u, v, t1, t2) {
    const n = s.n, w = this.w;
    const x = s.p[0] + t1[0] * u + t2[0] * v, y = s.p[1] + t1[1] * u + t2[1] * v, z = s.p[2] + t1[2] * u + t2[2] * v;
    const h = w.raycast(x + n[0] * 0.07, y + n[1] * 0.07, z + n[2] * 0.07, -n[0], -n[1], -n[2], 0.3);
    if (!h || !h.m) return null;
    if (s.same && !s.same(h.vx, h.vy, h.vz)) return false;
    return [h.x + n[0] * OFF, h.y + n[1] * OFF, h.z + n[2] * OFF];
  }

  build() {
    let q = 0;
    const P = this.pos, C = this.col;
    const keep = [];
    for (const s of this.stars) {
      const n = s.n, ax = n[0] ? 0 : n[1] ? 1 : 2, [t1, t2] = TAN[ax];
      // the first blow shows short cracks; they reach the seams as the plate is about to give
      const reach = Math.min(1, 0.3 + s.d * 0.85);
      const col = s.pale ? [0.82, 0.9, 1, 0.55] : [0.02, 0.016, 0.012, 0.92];
      const lip = !s.pale && s.d > 0.62 ? [1, 0.9, 0.74, Math.min(0.5, (s.d - 0.62) * 1.6)] : null;
      let any = false;
      for (const br of s.branches) {
        if (br.at > reach) continue;
        const nseg = br.pts.length - 1;
        const shown = Math.min(nseg, (reach - br.at) / (1 - br.at) * nseg);
        // start where the crack first meets rock (the blow's own splinter pit may be under the origin)
        let a = null, k0 = 0;
        while (!a && k0 < 2) { a = this.land(s, br.pts[k0].u, br.pts[k0].v, t1, t2); if (!a) k0++; }
        if (!a) continue;
        for (let k = k0; k < Math.ceil(shown) && q < MAXQ; k++) {
          const p0 = br.pts[k], p1 = br.pts[k + 1];
          const f = Math.min(1, shown - k);
          const b = this.land(s, p0.u + (p1.u - p0.u) * f, p0.v + (p1.v - p0.v) * f, t1, t2);
          if (b === null) break;
          const end = b === false;
          const bb = end ? this.land({ ...s, same: null }, p0.u + (p1.u - p0.u) * f * 0.5, p0.v + (p1.v - p0.v) * f * 0.5, t1, t2) : b;
          if (!bb) break;
          // a thin quad from a to b in the face, tapering toward the tip (wider as the plate weakens)
          const W = 0.009 * br.w * (0.7 + 0.6 * Math.min(1, s.d));
          const wd = W * (1 - 0.6 * (k / nseg)), wd1 = W * (1 - 0.6 * ((k + 1) / nseg));
          const dx = bb[0] - a[0], dy = bb[1] - a[1], dz = bb[2] - a[2];
          let sx = n[1] * dz - n[2] * dy, sy = n[2] * dx - n[0] * dz, sz = n[0] * dy - n[1] * dx;
          const sl = Math.hypot(sx, sy, sz) || 1;
          sx /= sl; sy /= sl; sz /= sl;
          const o = q * 12;
          P[o] = a[0] + sx * wd; P[o + 1] = a[1] + sy * wd; P[o + 2] = a[2] + sz * wd;
          P[o + 3] = bb[0] + sx * wd1; P[o + 4] = bb[1] + sy * wd1; P[o + 5] = bb[2] + sz * wd1;
          P[o + 6] = bb[0] - sx * wd1; P[o + 7] = bb[1] - sy * wd1; P[o + 8] = bb[2] - sz * wd1;
          P[o + 9] = a[0] - sx * wd; P[o + 10] = a[1] - sy * wd; P[o + 11] = a[2] - sz * wd;
          for (let j = 0; j < 4; j++) C.set(col, q * 16 + j * 4);
          q++;
          any = true;
          // about to give: a pale lip along one side of the main cracks
          if (lip && br.w > 0.9 && q < MAXQ) {
            const o2 = q * 12, l0 = wd * 1.0, l1 = wd1 * 1.0, w0 = wd * 2.1, w1 = wd1 * 2.1;
            P[o2] = a[0] + sx * w0; P[o2 + 1] = a[1] + sy * w0; P[o2 + 2] = a[2] + sz * w0;
            P[o2 + 3] = bb[0] + sx * w1; P[o2 + 4] = bb[1] + sy * w1; P[o2 + 5] = bb[2] + sz * w1;
            P[o2 + 6] = bb[0] + sx * l1; P[o2 + 7] = bb[1] + sy * l1; P[o2 + 8] = bb[2] + sz * l1;
            P[o2 + 9] = a[0] + sx * l0; P[o2 + 10] = a[1] + sy * l0; P[o2 + 11] = a[2] + sz * l0;
            for (let j = 0; j < 4; j++) C.set(lip, q * 16 + j * 4);
            q++;
          }
          if (end) break;
          a = bb;
        }
      }
      if (any) keep.push(s);
    }
    this.stars = keep;
    this.geo.setDrawRange(0, q * 6);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}

export { VOX };
