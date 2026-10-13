// What is inside the pot, bowl, cup and pan. Contents persist between steps (stir → season)
// and are cleared when a new dish starts.
import * as THREE from 'three';
import { liquidTex } from './tex.js';
import { chunkMesh } from './food.js';
import { PS } from './models.js';
import { mixHex } from '../core/util.js';

export const VESSEL = {
  pot: { surface: 12.5 * PS, r: 11.6 * PS, floor: 2 * PS },
  bowl: { surface: 7 * PS, r: 11.2 * PS, floor: 2 * PS },
  cup: { surface: 11 * PS, r: 4.3 * PS, floor: 2 * PS, rim: 13 * PS },
  pan: { surface: 2.2 * PS, r: 10.8 * PS, floor: 2 * PS },
};

export function liquidDisc(r, color, glow = false) {
  const mat = new THREE.MeshLambertMaterial({ map: liquidTex(color, { glow }) });
  if (glow) mat.emissive = new THREE.Color(color).multiplyScalar(0.35);
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
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
    s.liquid = liquidDisc(VESSEL[name].r * (name === 'bowl' ? 0.92 : 0.99), color, glow);
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
