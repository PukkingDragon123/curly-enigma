// Flags at the old miners' lifts (src/gfx/cloth.js): two oak poles in the front corners of each
// lift's alcove, a guild flag on each, flying in the air that breathes out of the shaft over the
// cage (out into the chamber, gusting). Real cloth: the mole brushes it walking by. A lift's flags
// are made the first time you come near it, simulated only while you're close and they're in view
// (ClothSet sleeps them), and drawn with the mine's own lighting (helmet lamp, cave lights, fog).
//
//   const f = new LiftFlags({ U, scene, plan })   ·   f.update(dt, player, time)   ·   f.dispose()
import * as THREE from 'three';
import { Cloth, ClothSet, clothTexture } from '../../gfx/cloth.js';
import { LIGHT, AIR } from '../TerrainMaterial.js';
import { PGrid, meshProp } from './grid.js';

const NEAR = 26; // m: make / wake a lift's flags this close
const COLS = [
  { base: [150, 44, 36], trim: [236, 196, 90], emblem: 'pick' },
  { base: [46, 70, 120], trim: [226, 214, 170], emblem: 'star' },
];
/** The poles (m, from the lift's floor centre; the alcove opens toward +z). */
const POLES = [[1.0, 1.0], [-1.0, 1.0]];
const POLE_H = 1.6;

/** The mine's light on a textured, double-sided sheet (vertex tint × the atlas, alpha cut-outs). */
function clothMaterial(U, map) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, map: { value: map } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec3 color;
      varying vec3 vColor; varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
      void main() {
        vColor = color; vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogCol; uniform float fogDist; uniform float time;
      uniform sampler2D map;
      varying vec3 vColor; varying vec3 vWorld; varying vec3 vN; varying vec2 vUv;
      ${LIGHT}
      ${AIR}
      void main() {
        vec4 tx = texture2D(map, vUv);
        if (tx.a < 0.5) discard;
        vec3 n = normalize(vN);
        if (!gl_FrontFacing) n = -n;
        vec3 V = normalize(lampPos - vWorld);
        vec3 sp;
        vec3 L = lightFull(vWorld, n, V, 0.45, 1.0, 8.0, sp);
        vec3 col = vColor * tx.rgb * L + sp * 0.03;
        col = caveAir(col, vWorld, length(vWorld - lampPos));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** An oak pole with iron bands and a brass knob, 1/32 m voxels: geometry (m, foot at 0) with linear colours. */
function poleGeometry() {
  const n = Math.round(POLE_H * 32);
  const g = new PGrid(6, n + 4, 6);
  for (let y = 0; y < n; y++) for (const [x, z] of [[2, 2], [3, 2], [2, 3], [3, 3]]) {
    const band = y % 18 === 0 || y < 3;
    g.set(x, y, z, band ? 0x34343c : (y + x * 5) % 9 === 0 ? 0x4a2e18 : x === 2 ? 0x6e4628 : 0x5e3c22);
  }
  for (let y = 0; y < 3; y++) g.box(1, y, 1, 4, 1, 4, 0x3a3a40); // the iron shoe
  g.box(2, n, 2, 2, 3, 2, 0xc8a050); g.set(2, n + 3, 2, 0xf0d070);
  const m = meshProp(g, { pivot: [3, 0, 3], scale: 1 / 32 });
  const lin = (b) => { const c = b / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const col = new Float32Array(m.nv * 3), nor = new Float32Array(m.nv * 3);
  for (let i = 0; i < m.nv * 3; i++) { col[i] = lin(m.col[i]); nor[i] = m.nor[i] / 127; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
  return geo;
}

export class LiftFlags {
  constructor({ U, scene, plan, objectMaterial = null }) {
    this.U = U; this.scene = scene;
    this.lifts = (plan?.lifts || []).filter((L) => L.id && L.id[0] === 'L');
    this.made = new Map(); // lift id → { set, poles }
    this.objMat = objectMaterial;
    this.poleGeo = null;
  }

  make(L) {
    const set = new ClothSet({ name: 'lift flags ' + L.id, far: 18, near: 1.2, material: (tex) => clothMaterial(this.U, tex) });
    // the shaft's breath: out of the alcove (+z) and away from the cage, gusting
    set.wind = (t, x, z) => {
      const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz) || 1;
      const gust = 0.65 + 0.35 * Math.sin(t * 1.1 + L.x) * Math.sin(t * 0.43 + L.z);
      return [(dx / d * 1.5 + 0.6 * Math.sin(t * 0.7)) * gust * 2.4, (2.6 + dz / d * 0.8) * gust * 2.4];
    };
    const group = new THREE.Group();
    POLES.forEach(([px, pz], i) => {
      const c = COLS[i % COLS.length];
      const x = L.x + px, z = L.z + pz;
      // (flying toward +z: the sheet's x runs along +z, its pinned edge on the pole)
      set.add(new Cloth({ w: 0.56, h: 0.36, nx: 8, ny: 5, tex: clothTexture('flag', { ...c, seed: i + 3 }), pins: 'left', iters: 4, damping: 1.2, gust: 1 }).place(x, L.y + POLE_H - 0.02, z + 0.035, -Math.PI / 2));
      if (!this.poleGeo) this.poleGeo = poleGeometry();
      const pole = new THREE.Mesh(this.poleGeo, this.objMat);
      pole.position.set(x, L.y, z);
      pole.layers.enable(1);
      group.add(pole);
    });
    const mesh = set.build();
    this.scene.add(mesh);
    if (this.objMat) this.scene.add(group);
    return { set, group };
  }

  /** player: { pos (feet, m) }. */
  update(dt, player, time) {
    const P = player?.pos;
    if (!P) return;
    for (const L of this.lifts) {
      const d = Math.hypot(L.x - P.x, L.y - P.y, L.z - P.z);
      let f = this.made.get(L.id);
      if (!f && d < NEAR) { try { f = this.make(L); } catch (e) { console.warn('props: lift flags', e); f = { set: null, group: null }; } this.made.set(L.id, f); }
      if (!f?.set || d > NEAR) continue;
      f.set.update(dt, [{ x: P.x, z: P.z, r: 0.26, y0: P.y - 0.02, y1: P.y + 0.9, key: 'me' }], time);
    }
  }

  stats() { return [...this.made.entries()].map(([id, f]) => ({ id, ...(f.set?.stats || {}) })); }

  dispose() {
    for (const f of this.made.values()) { f.set?.dispose(); if (f.group) this.scene.remove(f.group); }
    this.made.clear();
    this.poleGeo?.dispose();
  }
}
