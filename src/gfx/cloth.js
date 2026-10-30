// Real cloth: a Verlet mass-spring sheet (structural, shear and bend links), pinned along its top,
// pushed by gravity and a draught, and shoved aside by upright cylinders (the mole, Old Star, Nugget)
// walking through it. Used for the sacking over Old Star's shack door and his tarp's ragged flap.
//
//   const c = new Cloth({ w: 0.8, h: 1.1, nx: 12, ny: 16, tex, pins: 'top' });
//   c.mesh.position.set(...)        // the top-left corner of the sheet, in the parent's space (m)
//   c.update(dt, colliders, time)   // colliders: [{ x, z, r, y0, y1 }] in the parent's space (m)
//
// The sheet starts hanging in its local x-y plane (x right, y down from the rod), facing +z.
import * as THREE from 'three';

const G = -9.8;

/** A sacking texture: coarse weave, stains, darns, a frayed hem (pixel art, nearest filtered). */
export function sackingTexture({ w = 48, h = 64, base = [154, 128, 88], seed = 7 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const x = cv.getContext('2d');
  const img = x.createImageData(w, h);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stains = Array.from({ length: 4 }, () => ({ x: rnd() * w, y: rnd() * h, r: 4 + rnd() * 9, k: 0.7 + rnd() * 0.2 }));
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const weave = ((i + (j >> 1)) % 2 === 0 ? 1.06 : 0.92) * ((j + (i >> 1)) % 3 === 0 ? 0.95 : 1);
    let k = weave * (0.9 + rnd() * 0.16);
    for (const st of stains) { const d = Math.hypot(i - st.x, j - st.y); if (d < st.r) k *= st.k + (1 - st.k) * (d / st.r); }
    if (j > h - 4) k *= 0.75 - (j - (h - 4)) * 0.08; // the hem, grubby
    if (j < 3) k *= 0.8; // folded over the rod
    let [r, g, b] = base.map((c) => c * k);
    // a darned patch
    if (i > w * 0.55 && i < w * 0.8 && j > h * 0.4 && j < h * 0.58) { r = r * 0.8 + 20; g = g * 0.78 + 12; b = b * 0.85; if ((i + j) % 4 === 0) { r *= 0.6; g *= 0.6; b *= 0.6; } }
    const p = (j * w + i) * 4;
    img.data[p] = r; img.data[p + 1] = g; img.data[p + 2] = b;
    // frayed: holes at the hem and a moth hole or two
    const moth = Math.hypot(i - w * 0.3, j - h * 0.3) < 1.6 || Math.hypot(i - w * 0.7, j - h * 0.75) < 1.2;
    img.data[p + 3] = (j >= h - 2 && rnd() < 0.45) || moth ? 0 : 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Cloth {
  /**
   * w × h m, nx × ny particles. pins: 'top' (the whole top row) or an array of [i, j] to pin.
   * damping (per second), stiff (constraint passes), mass-ish `drag` against the draught.
   */
  constructor({ w = 0.8, h = 1.1, nx = 12, ny = 16, tex = null, color = 0xffffff, pins = 'top', iters = 6, damping = 1.6, slack = 1.0, material = null } = {}) {
    this.w = w; this.h = h; this.nx = nx; this.ny = ny; this.iters = iters; this.damping = damping;
    const n = nx * ny;
    this.p = new Float32Array(n * 3); // positions (local m)
    this.o = new Float32Array(n * 3); // previous positions
    this.inv = new Float32Array(n).fill(1); // 0 = pinned
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = (j * nx + i) * 3;
      this.p[k] = (i / (nx - 1)) * w;
      this.p[k + 1] = -(j / (ny - 1)) * h;
      this.p[k + 2] = 0;
    }
    this.o.set(this.p);
    const pinList = pins === 'top' ? Array.from({ length: nx }, (_, i) => [i, 0]) : pins;
    for (const [i, j] of pinList) this.inv[j * nx + i] = 0;
    this.home = this.p.slice(); // where pinned particles stay
    // links: [a, b, rest]
    const L = [];
    const link = (a, b) => { const dx = this.p[a * 3] - this.p[b * 3], dy = this.p[a * 3 + 1] - this.p[b * 3 + 1]; L.push(a, b, Math.hypot(dx, dy) * slack); };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = j * nx + i;
      if (i + 1 < nx) link(a, a + 1);
      if (j + 1 < ny) link(a, a + nx);
      if (i + 1 < nx && j + 1 < ny) { link(a, a + nx + 1); link(a + 1, a + nx); }
      if (i + 2 < nx) link(a, a + 2);
      if (j + 2 < ny) link(a, a + nx * 2);
    }
    this.links = new Float32Array(L);
    // the mesh
    const geo = new THREE.PlaneGeometry(w, h, nx - 1, ny - 1);
    this.geo = geo;
    this.pos = geo.attributes.position;
    const mat = material || new THREE.MeshStandardMaterial({ color, map: tex, side: THREE.DoubleSide, roughness: 1, metalness: 0, alphaTest: 0.5 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.acc = 0;
    this.writeMesh();
  }

  /** Move the pinned particles (e.g. a rod that sways). fn(i, j, out[3]) sets local positions. */
  movePins(fn) {
    const out = [0, 0, 0];
    for (let k = 0; k < this.inv.length; k++) {
      if (this.inv[k]) continue;
      out[0] = this.home[k * 3]; out[1] = this.home[k * 3 + 1]; out[2] = this.home[k * 3 + 2];
      fn(k % this.nx, Math.floor(k / this.nx), out);
      this.p[k * 3] = out[0]; this.p[k * 3 + 1] = out[1]; this.p[k * 3 + 2] = out[2];
    }
  }

  /**
   * Step the sim (fixed 1/90 s substeps). colliders: [{ x, z, r, y0, y1 }] upright cylinders in
   * the PARENT's space; wind(t) → [wx, wz] m/s² in the parent's space (a draught).
   */
  update(dt, colliders = [], time = 0, wind = null) {
    this.acc = Math.min(this.acc + dt, 0.1);
    const step = 1 / 90;
    if (this.acc < step) return;
    // colliders and wind into the sheet's local space
    const m = this.mesh;
    m.updateMatrixWorld();
    const inv = this._inv || (this._inv = new THREE.Matrix4());
    inv.copy(m.matrix).invert();
    const v = this._v || (this._v = new THREE.Vector3());
    const cols = colliders.map((c) => {
      v.set(c.x, (c.y0 + c.y1) / 2, c.z).applyMatrix4(inv);
      return { x: v.x, z: v.z, r: c.r, y0: v.y - (c.y1 - c.y0) / 2, y1: v.y + (c.y1 - c.y0) / 2 };
    });
    const q = m.quaternion, qi = this._q || (this._q = new THREE.Quaternion());
    qi.copy(q).invert();
    while (this.acc >= step) {
      this.acc -= step;
      time += step;
      let wx = 0, wz = 0;
      if (wind) { const w = wind(time); v.set(w[0], 0, w[1]).applyQuaternion(qi); wx = v.x; wz = v.z; }
      this.integrate(step, wx, wz, time);
      for (let it = 0; it < this.iters; it++) this.relax();
      this.collide(cols);
    }
    this.writeMesh();
  }

  integrate(dt, wx, wz, time) {
    const p = this.p, o = this.o, inv = this.inv, n = inv.length;
    const keep = Math.max(0, 1 - this.damping * dt);
    const dt2 = dt * dt;
    // gravity in the sheet's local space (the sheet may be turned about y only: local y is up)
    for (let k = 0; k < n; k++) {
      if (!inv[k]) continue;
      const i = k * 3;
      const x = p[i], y = p[i + 1], z = p[i + 2];
      // the draught flutters: stronger at the free edge, a little noise per particle
      const jj = Math.floor(k / this.nx) / (this.ny - 1);
      const gust = 0.6 + 0.4 * Math.sin(time * 2.3 + k * 0.37) * Math.sin(time * 0.9 + (k % this.nx) * 0.5);
      p[i] = x + (x - o[i]) * keep + wx * gust * jj * dt2;
      p[i + 1] = y + (y - o[i + 1]) * keep + G * dt2;
      p[i + 2] = z + (z - o[i + 2]) * keep + wz * gust * jj * dt2;
      o[i] = x; o[i + 1] = y; o[i + 2] = z;
    }
  }

  relax() {
    const p = this.p, inv = this.inv, L = this.links;
    for (let l = 0; l < L.length; l += 3) {
      const a = L[l] * 3, b = L[l + 1] * 3, rest = L[l + 2];
      const wa = inv[L[l]], wb = inv[L[l + 1]];
      if (!wa && !wb) continue;
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
      // stretch is stiff, squash is soft (cloth bunches up, it doesn't push)
      const diff = d > rest ? (d - rest) / d : ((d - rest) / d) * 0.25;
      const s = diff / (wa + wb);
      p[a] += dx * s * wa; p[a + 1] += dy * s * wa; p[a + 2] += dz * s * wa;
      p[b] -= dx * s * wb; p[b + 1] -= dy * s * wb; p[b + 2] -= dz * s * wb;
    }
  }

  collide(cols) {
    if (!cols.length) return;
    const p = this.p, inv = this.inv, n = inv.length;
    for (let k = 0; k < n; k++) {
      if (!inv[k]) continue;
      const i = k * 3;
      for (const c of cols) {
        const y = p[i + 1];
        if (y < c.y0 || y > c.y1) continue;
        const dx = p[i] - c.x, dz = p[i + 2] - c.z;
        const d2 = dx * dx + dz * dz, r = c.r;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2) || 1e-4;
        // pushed out to the cylinder's side (and dragged along a little: friction)
        const nx = d > 1e-3 ? dx / d : 0, nz = d > 1e-3 ? dz / d : 1;
        p[i] = c.x + nx * r;
        p[i + 2] = c.z + nz * r;
        this.o[i] = this.o[i] * 0.6 + p[i] * 0.4;
        this.o[i + 2] = this.o[i + 2] * 0.6 + p[i + 2] * 0.4;
      }
    }
  }

  writeMesh() {
    // the mesh's origin is the sheet's top-left corner (the rod's left end): vertices = particles
    this.pos.array.set(this.p);
    this.pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  /** Put the sheet's top-left corner at (x, y, z) of the parent, turned yaw about y. */
  placeCorner(x, y, z, yaw = 0) {
    this.mesh.rotation.set(0, yaw, 0);
    this.mesh.position.set(x, y, z);
    this.mesh.updateMatrix();
  }

  dispose() {
    this.geo.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
  }
}
