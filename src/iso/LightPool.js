// A fixed set of point lights shared by many light sources: every few frames the
// sources nearest the focus get a real light. The light count never changes, so
// materials never recompile. Each source also exposes a flicker factor `k` that
// glow meshes and floor light pools can follow.
import * as THREE from 'three';
import { clamp } from '../core/util.js';

export function flickerAt(t, ph, amt) {
  if (!amt) return 1;
  const n = 0.5 * Math.sin(t * 7.3 + ph) + 0.3 * Math.sin(t * 13.1 + ph * 1.7) + 0.2 * Math.sin(t * 23.7 + ph * 3.1);
  return 1 - amt * (0.5 + 0.5 * n);
}

export class LightPool {
  constructor(scene, n = 7, { range = 11 } = {}) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 6, 2);
      l.position.set(0, -50, 0);
      scene.add(l);
      this.lights.push(l);
    }
    this.sources = [];
    this.sel = [];
    this.range = range;
    this.t = 0;
    this.acc = 0;
    this.fx = 0;
    this.fz = 0;
  }

  /** src: {x,y,z,color,intensity,distance,flicker,on,real}. real:false → only drives glows (no point light). */
  add(o) {
    const s = { x: 0, y: 1, z: 0, color: 0xffc070, intensity: 6, distance: 6, flicker: 0, on: true, real: true, k: 1, ph: Math.random() * 100, speed: 1, ...o };
    this.sources.push(s);
    this.acc = 0;
    return s;
  }

  remove(s) {
    const i = this.sources.indexOf(s);
    if (i >= 0) this.sources.splice(i, 1);
    this.acc = 0;
  }

  update(dt, fx, fz) {
    this.t += dt;
    this.fx = fx;
    this.fz = fz;
    for (const s of this.sources) s.k = s.on ? flickerAt(this.t * s.speed, s.ph, s.flicker) : 0;
    this.acc -= dt;
    if (this.acc <= 0) {
      this.acc = 0.2;
      const r2 = this.range * this.range;
      const cand = [];
      for (const s of this.sources) {
        if (!s.on || !s.real) continue;
        const d2 = (s.x - fx) ** 2 + (s.z - fz) ** 2;
        if (d2 < r2) cand.push([d2 - (s.priority || 0), s]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      this.sel = cand.slice(0, this.lights.length).map((c) => c[1]);
    }
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const s = this.sel[i];
      if (!s || !s.on) { l.intensity = 0; continue; }
      const d = Math.hypot(s.x - fx, s.z - fz);
      const edge = clamp((this.range - d) / 3, 0, 1);
      l.position.set(s.x, s.y, s.z);
      l.color.setHex(s.color);
      l.distance = s.distance;
      l.intensity = s.intensity * s.k * edge;
    }
  }
}
