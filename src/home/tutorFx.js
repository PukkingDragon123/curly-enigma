// The tutorial's cues in the 3D world (no cards, no stamps): what to use next glints with a slow
// stream of gold motes rising off it, a good moment flares (embers and sparks off a fire, a ring of
// glints), and Old Star can hold a real lump of copper in his paws. Used by src/home/lessons.js and
// src/deep/FirstDig.js; both scenes have the same particle system (src/deep/Particles.js: spawn,
// sparks, glints, ember).
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * A glint over a thing to use: gold motes drifting up off it and, now and then, a twinkle. pos() →
 * a world point (or null to pause). r: how wide the motes rise (m). Call update(dt) every frame.
 */
export class Glint {
  constructor(fx, pos, o = {}) {
    this.fx = fx;
    this.pos = pos;
    this.r = o.r ?? 0.22;
    this.color = o.color || [1, 0.84, 0.42];
    this.rate = o.rate ?? 0.09;
    this.t = 0;
    this.tw = 0.3;
    this.on = true;
  }

  update(dt) {
    if (!this.on || !this.fx) return;
    let p = null;
    try { p = this.pos(); } catch (e) { p = null; }
    if (!p) return;
    this.t -= dt;
    this.tw -= dt;
    const c = this.color, r = this.r;
    while (this.t <= 0) {
      this.t += this.rate;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      this.fx.spawn({ x: p.x + Math.cos(a) * d, y: p.y - 0.1 + Math.random() * 0.15, z: p.z + Math.sin(a) * d, vx: rand(-0.03, 0.03), vy: rand(0.22, 0.4), vz: rand(-0.03, 0.03),
        life: rand(1.0, 1.6), size: rand(0.012, 0.022), color: Math.random() < 0.3 ? [1, 0.96, 0.8] : c, glow: true, drag: 0.5, grav: -0.04, swirl: 0.04, twinkle: 0.6 });
    }
    // a soft breathing halo where it is
    this.halo = (this.halo ?? 0) - dt;
    if (this.halo <= 0) {
      this.halo = 0.2;
      this.fx.spawn({ x: p.x, y: p.y + 0.05, z: p.z, life: 0.7, size: this.r * 0.55, color: [c[0] * 0.55, c[1] * 0.45, c[2] * 0.3], alpha: 0.2, glow: true, drag: 0 });
    }
    if (this.tw <= 0) {
      this.tw = rand(0.7, 1.4);
      this.fx.glints?.(p.x + rand(-r, r) * 0.6, p.y + rand(0, 0.25), p.z + rand(-r, r) * 0.6, [1, 0.95, 0.75]);
    }
  }

  remove() { this.on = false; }
}

/** A good moment: a burst of embers and sparks off a point (a fire, his paws), and a ring of glints. */
export function flare(fx, p, o = {}) {
  if (!fx || !p) return;
  const n = o.n ?? 26;
  for (let i = 0; i < n; i++) fx.ember?.(p.x + rand(-0.12, 0.12), p.y + rand(0, 0.08), p.z + rand(-0.12, 0.12));
  fx.sparks?.(p.x, p.y + 0.05, p.z, Math.round(n * 0.6), o.color || [1, 0.72, 0.3], [0, 0.6, 0], o.speed ?? 2.6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    fx.spawn({ x: p.x + Math.cos(a) * 0.08, y: p.y + 0.15, z: p.z + Math.sin(a) * 0.08, vx: Math.cos(a) * 0.55, vy: rand(0.5, 0.9), vz: Math.sin(a) * 0.55,
      life: rand(0.9, 1.3), size: rand(0.012, 0.018), color: [1, 0.9, 0.55], glow: true, drag: 1.4, grav: 0.25, twinkle: 0.8 });
  }
}

/**
 * A lump of copper ore as a little voxel model (~9 cm): orange-brown metal knuckles in a crust of
 * grey-brown rock, a green speck of verdigris. For Old Star's paws.
 */
export function copperLump(scale = 1) {
  const g = new THREE.Group();
  const s = 0.022 * scale;
  const geo = new THREE.BoxGeometry(s, s, s);
  const mats = {
    cu: new THREE.MeshLambertMaterial({ color: 0xd8743a, emissive: 0x3a1406 }),
    cuHi: new THREE.MeshLambertMaterial({ color: 0xf2a060, emissive: 0x4a2010 }),
    rock: new THREE.MeshLambertMaterial({ color: 0x6e5c4c }),
    rockDk: new THREE.MeshLambertMaterial({ color: 0x4e4036 }),
    verd: new THREE.MeshLambertMaterial({ color: 0x5aa88a }),
  };
  // a rough ball of cells: metal in the middle and on one face, rock round the rest
  let k = 0;
  for (let x = -2; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const d = Math.hypot(x + 0.5, y * 1.2, z);
    if (d > 2.05 || (d > 1.6 && ((x * 7 + y * 13 + z * 5 + 20) % 3 === 0))) continue;
    const face = z === 1 || (x === -2 && y >= 0);
    const m = face ? (k++ % 4 === 0 ? mats.cuHi : mats.cu) : (k++ % 5 === 0 ? mats.verd : (x + y + z) & 1 ? mats.rock : mats.rockDk);
    const b = new THREE.Mesh(geo, m);
    b.position.set((x + 0.5) * s, y * s, z * s);
    g.add(b);
  }
  g.userData.dispose = () => { geo.dispose(); for (const m of Object.values(mats)) m.dispose(); };
  return g;
}
