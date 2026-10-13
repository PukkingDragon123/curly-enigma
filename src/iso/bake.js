// Baked static lighting for the iso scenes: every lamp, crystal and lit window brightens
// the voxels around it by scaling their vertex colors once at build time, so the whole
// town glows without hundreds of real lights. The LightPool's few real point lights add
// the flicker on top near the camera. Also bakes an ambient term (height falloff, tint).
import * as THREE from 'three';

const _c = new THREE.Color();

/**
 * lights: [{x, y, z, color, power, radius, wrap?}] in world space.
 * opts.ambient(x, y, z, nx, ny, nz, out) → writes an [r,g,b] multiplier into out (default 1).
 * opts.max: clamp of the final multiplier (default 2.6).
 */
export function bakeLighting(geo, lights, opts = {}) {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), colA = geo.getAttribute('color');
  if (!pos || !nor || !colA) return;
  const P = pos.array, Nn = nor.array, C = colA.array;
  const n = pos.count;
  const max = opts.max ?? 2.6;
  // light grid
  const CS = 4;
  const L = lights.map((l) => {
    _c.setHex(l.color ?? 0xffc070);
    return { x: l.x, y: l.y, z: l.z, r: _c.r * (l.power ?? 1), g: _c.g * (l.power ?? 1), b: _c.b * (l.power ?? 1), rad: l.radius ?? 4, wrap: l.wrap ?? 0.35 };
  });
  const cells = new Map();
  for (const l of L) {
    const x0 = Math.floor((l.x - l.rad) / CS), x1 = Math.floor((l.x + l.rad) / CS);
    const z0 = Math.floor((l.z - l.rad) / CS), z1 = Math.floor((l.z + l.rad) / CS);
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) {
      const k = cx * 4096 + cz;
      let a = cells.get(k);
      if (!a) cells.set(k, (a = []));
      a.push(l);
    }
  }
  const amb = [1, 1, 1];
  const ambient = opts.ambient;
  for (let i = 0; i < n; i++) {
    const k3 = i * 3;
    const x = P[k3], y = P[k3 + 1], z = P[k3 + 2];
    const nx = Nn[k3], ny = Nn[k3 + 1], nz = Nn[k3 + 2];
    if (ambient) ambient(x, y, z, nx, ny, nz, amb);
    let r = amb[0], g = amb[1], b = amb[2];
    const list = cells.get(Math.floor(x / CS) * 4096 + Math.floor(z / CS));
    if (list) {
      for (let j = 0; j < list.length; j++) {
        const l = list[j];
        const dx = l.x - x, dy = l.y - y, dz = l.z - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        const r2 = l.rad * l.rad;
        if (d2 >= r2) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const ndl = (dx * nx + dy * ny + dz * nz) / d;
        const w = ndl * (1 - l.wrap) + l.wrap;
        if (w <= 0) continue;
        const t = 1 - d2 / r2;
        const a = t * t * w;
        r += l.r * a; g += l.g * a; b += l.b * a;
      }
    }
    C[k3] *= Math.min(max, r);
    C[k3 + 1] *= Math.min(max, g);
    C[k3 + 2] *= Math.min(max, b);
  }
  colA.needsUpdate = true;
}

/** Standard cave ambient: darker and cooler toward the ceiling, a touch of warm bounce near the floor. */
export function caveAmbient({ top = 6.5, fadeFrom = 3.2, floorWarm = 0.12, cool = [0.62, 0.66, 0.9], minK = 0.16 } = {}) {
  return (x, y, z, nx, ny, nz, out) => {
    let k = 1;
    if (y > fadeFrom) k = Math.max(minK, 1 - (y - fadeFrom) / (top - fadeFrom) * (1 - minK));
    const c = 1 - k;
    out[0] = k + c * cool[0] * k;
    out[1] = k + c * cool[1] * k;
    out[2] = k + c * cool[2] * k;
    if (y < 0.6) { const w = (0.6 - y) / 0.6 * floorWarm; out[0] += w; out[1] += w * 0.6; }
  };
}
