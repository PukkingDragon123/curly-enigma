// What is inside the pot, bowl, cup and pan. Contents persist between steps (stir → season)
// and are cleared when a new dish starts.
import * as THREE from 'three';
import { chunkMesh } from './food.js';
import { PS } from './models.js';
import { mixHex, shade } from '../core/util.js';
import { VoxelGrid } from '../gfx/Voxel.js';
import { voxMesh, hash3 } from '../bookends/vox.js';

export const VESSEL = {
  pot: { surface: 12.5 * PS, r: 11.6 * PS, floor: 2 * PS },
  bowl: { surface: 7 * PS, r: 11.2 * PS, floor: 2 * PS },
  cup: { surface: 11 * PS, r: 4.3 * PS, floor: 2 * PS, rim: 13 * PS },
  pan: { surface: 2.2 * PS, r: 10.8 * PS, floor: 2 * PS },
};

/** Voxel size and grid alignment of each vessel's liquid (matches the vessel's own voxel grid). */
const LIQ_VOX = { pot: { vs: PS / 2, odd: false }, bowl: { vs: PS, odd: false }, cup: { vs: PS, odd: true }, pan: { vs: PS, odd: false } };

/**
 * A liquid surface as a slab of voxels (never a disc): stepped to the vessel's grid, a darker
 * meniscus ring, swirl streaks, light flecks, a few bubbles standing proud (sparks when it glows).
 * Its top is at y = 0. vox = { vs: voxel size, odd: centre on a voxel (true) or a voxel corner }.
 */
export function liquidDisc(r, color, glow = false, vox = { vs: PS, odd: false }) {
  const vs = vox.vs;
  const n = Math.ceil(r / vs) + 1;
  const W = 2 * n + (vox.odd ? 1 : 0), c = W / 2, R = r / vs;
  const g = new VoxelGrid(W, 3, W);
  const hi = mixHex(color, 0xffffff, 0.28), fleck = mixHex(color, 0xffffff, 0.55);
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - c, dz = z + 0.5 - c, d = Math.hypot(dx, dz);
    if (d > R) continue;
    const dn = d / R, a = Math.atan2(dz, dx);
    const h = hash3(x, z, 7, 11);
    let col = color;
    if (dn > 0.82) col = shade(color, 0.72);
    else if (dn > 0.66) col = shade(color, 0.86);
    if (Math.sin(a * 3 + dn * 9) > 0.86 && dn < 0.8) col = hi;
    if (h < 0.05 && dn < 0.75) col = fleck;
    if (glow && h > 0.975) col = 0xffffff;
    if (dx < -R * 0.25 && dz < -R * 0.25 && dn < 0.7 && Math.abs(dx - dz) < 1) col = mixHex(col, 0xfff4e0, 0.45); // the key light's glint
    g.set(x, 0, z, shade(color, 0.8));
    g.set(x, 1, z, col);
    if (h > 0.992 - (glow ? 0.01 : 0) && dn < 0.7) g.set(x, 2, z, glow ? 0xffffff : fleck); // a bubble
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (glow) mat.emissive = new THREE.Color(color).multiplyScalar(0.35);
  return voxMesh(g, { scale: vs, pivot: [c, 2, c], material: mat, outline: false });
}

export class Contents {
  constructor(kitchen) {
    this.k = kitchen;
    this.v = {};
  }

  /** The spinning surface group of a vessel (created on demand). */
  slot(name) {
    if (this.v[name]) return this.v[name];
    const prop = this.k.props[name === 'cup' ? 'mug' : name];
    const g = new THREE.Group();
    g.position.y = VESSEL[name].surface;
    prop.add(g);
    this.v[name] = { g, prop, liquid: null, chunks: null, extra: [], spin: 0, level: 1 };
    return this.v[name];
  }

  liquid(name, color, glow = false) {
    const s = this.slot(name);
    if (s.liquid && s.color === color) return s.liquid;
    if (s.liquid) { s.g.remove(s.liquid); s.liquid.geometry.dispose(); s.liquid.material.map?.dispose(); s.liquid.material.dispose(); }
    s.liquid = liquidDisc(VESSEL[name].r * (name === 'bowl' ? 0.92 : 0.99), color, glow, LIQ_VOX[name]);
    s.color = color;
    s.g.add(s.liquid);
    return s.liquid;
  }

  chunks(name, colors, n = 14) {
    const s = this.slot(name);
    if (s.chunks) { s.g.remove(s.chunks); s.chunks.geometry.dispose(); }
    if (!colors.length) { s.chunks = null; return null; }
    const pal = [];
    for (const c of colors) pal.push(c, mixHex(c, 0xffffff, 0.2), mixHex(c, 0x000000, 0.15));
    s.chunks = chunkMesh(pal, n, (VESSEL[name].r / 0.03) * 0.72, n + colors.length);
    s.chunks.position.y = 0.004;
    s.g.add(s.chunks);
    return s.chunks;
  }

  /** Extra object riding on the surface group (yolk, shell bits...). */
  addExtra(name, obj) {
    const s = this.slot(name);
    s.g.add(obj);
    s.extra.push(obj);
    return obj;
  }

  /** Liquid level for the cup (0..1 of the inner height). */
  setLevel(name, k) {
    const s = this.slot(name);
    const V = VESSEL[name];
    s.level = k;
    const top = V.rim ?? V.surface;
    s.g.position.y = V.floor + (top - V.floor - PS) * Math.max(0.02, Math.min(1, k));
    s.g.visible = k > 0.01;
  }

  update(dt) {
    for (const s of Object.values(this.v)) {
      s.g.rotation.y += s.spin * dt;
      s.spin *= Math.max(0, 1 - dt * 1.5);
    }
  }

  clear() {
    for (const s of Object.values(this.v)) {
      s.prop.remove(s.g);
      s.g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && !o.material.userData?.shared) { o.material.map?.dispose(); o.material.dispose(); }
      });
    }
    this.v = {};
  }
}
