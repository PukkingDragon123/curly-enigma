// The save slots: a raptor's nest on a mossy rock shelf at the foot of a glowcap (a ring of twigs
// and straw, moss and down inside, old bones and quills tucked in, bits of shell from hatchings
// gone by; a warm glow), holding three eggs, one per save slot. An empty slot is a smooth egg. As
// a save gets on, its egg cracks: a hairline from a pip first, then a zigzag round it, branching,
// with warm light leaking out of every crack; near the end the shell starts to break open round
// the pip and the light pours out. A save that has tamed a raptor (data.tame.raptors) has hatched:
// a baby raptor sits in the bottom half of its shell (the mine's raptor model, small and big-
// headed), the top lying beside it. Hover (or focus) an egg: it wobbles and its crack creeps a
// little, with a tiny crack; choose it: the shell gives (a sharp crack, a flash of light, chips)
// and the game goes on from it. Deleting a save smashes its egg (after the confirm) and a fresh
// smooth one rises from the straw.
// The eggs are voxels at 1/96 m (the mine's own egg close-up), the nest's twigs, bones and quills
// 1/64 m (small things), the rock shelf 1/32 m.
//
// The DOM over it keeps the save stones' plaques, labels, hooks and keys: an invisible button over
// each egg (role group "Save slots"), a plaque under it (slot, %, gold, day, play time), a hammer
// to delete, "last played"; arrows move between eggs, Delete smashes one.
//
//   const N = makeNest(layer, { audio, camera, canvas, slots: () => state.listSlots(), tame: (i) => bool,
//     onPick(i, slot), onDelete(i) → Promise<bool>, afterDelete(i) });
//   scene.add(N.group);  N.update(dt)  N.show() / N.hide() / N.open / N.refresh() / N.setFake(i, pct)
//   N.setHatched(i, on|null)  N.pick(i)  N.smash(i)  N.shot(aspect) → { pos, look, fov }  N.destroy()
import * as THREE from 'three';
import { el, clamp, formatGoldFull, makeRng } from '../core/util.js';
import { formatPlayTime } from '../core/saves.js';
import { VoxelGrid, hash3, fmix, fshade } from './vox.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { raptorModel } from './titleChase.js';
import { VS as RVS } from '../deep/enemies/vox.js';
import { MODELS, RAMP } from '../deep/veg/plants.js';
import { rng as vrng } from '../deep/veg/paint.js';
import { makeBoulderGeo } from './forest/flora.js';
import { Particles, SHAPE } from './fx.js';
import { CAVE, floorH } from './titleCave.js';
import { CF, caveToon, patchCave, glowHex, lit, meshGlow, vgGeo, withGlow } from './titleCaveFx.js';

const TAU = Math.PI * 2;
const R = (a, b) => a + Math.random() * (b - a);
const smooth = (t) => t * t * (3 - 2 * t);

/** The three eggs (the slots): shell ramp (dark → light), speckles, the light inside, the hatchling's colouring. */
export const EGGS = [
  { name: 'Amber', shell: [0x8a6a44, 0xc4a070, 0xe4cc9c, 0xf6e8cc], spot: [0x5a3418, 0x84542a], inner: 0xfff0d8, light: 0xffb048, raptor: 0, css: '#ffc870' },
  { name: 'Moss', shell: [0x5e6e44, 0x93a670, 0xbccc98, 0xdeeac4], spot: [0x2e3c1a, 0x4c5e28], inner: 0xf2fadc, light: 0xffcc50, raptor: 1, css: '#d8f08a' },
  { name: 'Dusk', shell: [0x6c5a7c, 0xa08eb4, 0xc6badc, 0xe8e2f4], spot: [0x3c2654, 0x5e3c78], inner: 0xfaf0ff, light: 0xffa868, raptor: 2, css: '#e0b8ff' },
];

// ------------------------------------------------------------------ the egg in voxels
const EV = 1 / 96; // egg voxel
const EH = 27, ER = 9.6; // height, widest radius (voxels): 0.28 × 0.2 m
const EW = 2 * Math.ceil(ER) + 4;
const ECX = EW / 2, ECZ = EW / 2;
const eggR = (t) => { const u = 2 * t - 1; return ER * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.13 * u); };
const inEgg = (x, y, z, shrink = 0) => {
  const t = (y + 0.5) / EH;
  if (t <= 0 || t >= 1) return false;
  return Math.hypot(x + 0.5 - ECX, z + 0.5 - ECZ) <= eggR(t) - shrink;
};
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const _c = new THREE.Color();
/**
 * Mesh a set of voxels face by face (no merging: every voxel carries its own crack timing).
 * vox: [{ x, y, z, c, a: [crack, edge, hole] }], solid(x, y, z) → is there a voxel; face(v, f) →
 * colour override or undefined. Pivot: the egg's foot.
 */
function meshFaces(vox, solid, faceCol) {
  const pos = [], nor = [], col = [], att = [], idx = [];
  for (const v of vox) {
    for (const f of FACES) {
      if (solid(v.x + f.n[0], v.y + f.n[1], v.z + f.n[2])) continue;
      const c = faceCol ? (faceCol(v, f) ?? v.c) : v.c;
      _c.setHex(c);
      const b = pos.length / 3;
      for (const k of f.c) {
        pos.push((v.x + k[0] - ECX) * EV, (v.y + k[1]) * EV, (v.z + k[2] - ECZ) * EV);
        nor.push(...f.n);
        col.push(_c.r, _c.g, _c.b);
        att.push(v.a ? v.a[0] : 9, v.a ? v.a[1] : 9, v.a ? v.a[2] : 9);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aCrack', new THREE.Float32BufferAttribute(att, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * One egg's meshes: the shell (every voxel knows when it cracks, when it darkens beside a crack,
 * when it breaks away), the glowing core under it, and the hatched pieces (the bottom half with its
 * jagged rim, the top). The crack network grows from a pip on the front (+z), zigzagging round
 * the egg and branching, in the order its voxels are reached.
 */
function buildEgg(spec, seed) {
  const rng = makeRng(seed);
  const key = (x, y, z) => x + 64 * (y + 64 * z);
  const surf = new Map(), list = [];
  for (let z = 0; z < EW; z++) for (let y = 0; y < EH; y++) for (let x = 0; x < EW; x++) {
    if (!inEgg(x, y, z)) continue;
    if (inEgg(x + 1, y, z) && inEgg(x - 1, y, z) && inEgg(x, y + 1, z) && inEgg(x, y - 1, z) && inEgg(x, y, z + 1) && inEgg(x, y, z - 1)) continue;
    surf.set(key(x, y, z), list.length);
    list.push({ x, y, z, c: 0, a: [9, 9, 9] });
  }
  // shell colours: a ramp by height, speckles and a few blotches
  const S = spec.shell;
  for (const v of list) {
    const t = (v.y + 0.5) / EH;
    let c = t > 0.78 ? S[3] : t > 0.3 ? S[2] : t > 0.12 ? S[1] : S[0];
    if (t > 0.3 && t < 0.78 && hash3(v.x, v.y >> 2, v.z, seed) < 0.18) c = fmix(S[2], S[3], 0.5);
    const h = hash3(v.x, v.y, v.z, seed + 1);
    if (h < 0.07) c = spec.spot[h < 0.03 ? 0 : 1];
    else if (hash3(v.x >> 1, v.y >> 1, v.z >> 1, seed + 2) < 0.045) c = fmix(c, spec.spot[1], 0.55);
    v.c = c;
  }
  // the pip: on the front, a little above the middle, a little off to one side
  let pip = 0, pd = 1e9;
  const pipAt = [ECX + rng.range(-2.5, 2.5), EH * 0.6, EW];
  list.forEach((v, i) => { const d = Math.hypot(v.x + 0.5 - pipAt[0], v.y + 0.5 - pipAt[1], v.z + 0.5 - pipAt[2]); if (d < pd) { pd = d; pip = i; } });
  // grow the crack: two tips set off left and right, zigzagging, and branch now and then
  const order = new Float32Array(list.length).fill(9);
  const N = Math.round(list.length * 0.2);
  let count = 0;
  order[pip] = 0;
  const normal = (v) => { const n = [v.x + 0.5 - ECX, (v.y + 0.5 - EH * 0.5) * 0.55, v.z + 0.5 - ECZ]; const l = Math.hypot(...n) || 1; return n.map((q) => q / l); };
  const tang = (d, n) => { const k = d[0] * n[0] + d[1] * n[1] + d[2] * n[2]; const o = [d[0] - n[0] * k, d[1] - n[1] * k, d[2] - n[2] * k]; const l = Math.hypot(...o) || 1; return o.map((q) => q / l); };
  const pv = list[pip], pn = normal(pv);
  const side = tang([1, 0, 0], pn);
  const tips = [{ i: pip, d: side, life: 999, z: 0 }, { i: pip, d: side.map((q) => -q), life: 999, z: 2 }];
  let guard = 0;
  while (tips.length && count < N && guard++ < 20000) {
    const T = tips.shift();
    const v = list[T.i];
    const n = normal(v);
    T.z++;
    const zig = ((T.z >> 1) & 1 ? 1 : -1) * 0.75;
    const up = tang([0, 1, 0], n);
    const want = [T.d[0] + up[0] * zig, T.d[1] + up[1] * zig, T.d[2] + up[2] * zig];
    let best = -1, bs = -1e9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const j = surf.get(key(v.x + dx, v.y + dy, v.z + dz));
      if (j === undefined || order[j] < 9) continue;
      const l = Math.hypot(dx, dy, dz);
      const sc = (dx * want[0] + dy * want[1] + dz * want[2]) / l + rng() * 0.5 - (l > 1.5 ? 0.3 : 0) + dz * 0.12;
      if (sc > bs) { bs = sc; best = j; }
    }
    if (best < 0 || T.life <= 0) continue;
    count++;
    order[best] = count / N;
    const b = list[best];
    const st = [b.x - v.x, b.y - v.y, b.z - v.z];
    T.d = tang([T.d[0] * 0.75 + st[0] * 0.25 + rng.range(-0.15, 0.15), T.d[1] * 0.75 + st[1] * 0.1 + rng.range(-0.1, 0.1), T.d[2] * 0.75 + st[2] * 0.25 + rng.range(-0.15, 0.15)], normal(b));
    T.i = best; T.life--;
    tips.push(T);
    // (more branches as it goes on: a late egg is crazed all over its front)
    if (rng() < 0.045 + 0.09 * (count / N) && tips.length < 9) {
      const a = rng.range(0.9, 1.4) * (rng() < 0.5 ? 1 : -1), nb = normal(b);
      const c = Math.cos(a), s = Math.sin(a);
      const cr = [nb[1] * T.d[2] - nb[2] * T.d[1], nb[2] * T.d[0] - nb[0] * T.d[2], nb[0] * T.d[1] - nb[1] * T.d[0]];
      tips.push({ i: best, d: [T.d[0] * c + cr[0] * s, T.d[1] * c + cr[1] * s, T.d[2] * c + cr[2] * s], life: rng.int(5, 16), z: rng.int(0, 3) });
    }
  }
  // edges darken as the crack beside them opens; near the end the shell breaks away round the pip
  list.forEach((v, i) => {
    v.a[0] = order[i];
    let e = 9;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = surf.get(key(v.x + dx, v.y + dy, v.z + dz));
      if (j !== undefined && j !== i) e = Math.min(e, order[j]);
    }
    v.a[1] = e;
    const d = Math.hypot(v.x - pv.x, (v.y - pv.y) * 1.2, v.z - pv.z);
    if (d < 4.2 && v.z > ECZ) v.a[2] = 0.86 + (d / 4.2) * 0.16 + hash3(v.x, v.y, v.z, seed + 5) * 0.03;
  });
  const solid = (x, y, z) => inEgg(x, y, z);
  const shell = meshFaces(list, solid);
  // the core: the egg one layer in, glowing (seen only where the shell has broken away)
  const inCore = (x, y, z) => inEgg(x, y, z) && !surf.has(key(x, y, z));
  const core = [];
  for (let z = 0; z < EW; z++) for (let y = 0; y < EH; y++) for (let x = 0; x < EW; x++) if (inCore(x, y, z)) core.push({ x, y, z, c: spec.light });
  const coreGeo = meshFaces(core, inCore);
  // hatched: the shell, hollow, broken along a zigzag; the bottom keeps, the top lies beside it
  const cutT = (x, z) => { const a = Math.atan2(z + 0.5 - ECZ, x + 0.5 - ECX); const tw = ((a / TAU) * 9 + 9) % 1; return 0.6 + (Math.abs(tw - 0.5) * 2 - 0.5) * 0.14; };
  const half = [], top = [];
  const inShell = (x, y, z) => inEgg(x, y, z) && !inEgg(x, y, z, 1.6);
  for (let z = 0; z < EW; z++) for (let y = 0; y < EH; y++) for (let x = 0; x < EW; x++) {
    if (!inShell(x, y, z)) continue;
    const t = (y + 0.5) / EH, ct = cutT(x, z);
    const s = list[surf.get(key(x, y, z))];
    const c = s ? s.c : S[1];
    if (t < ct) half.push({ x, y, z, c, rim: t > ct - 1.6 / EH });
    else if (t > ct + 1.2 / EH) top.push({ x, y, z, c, rim: t < ct + 2.6 / EH });
  }
  const hk = new Set(half.map((v) => key(v.x, v.y, v.z))), tk = new Set(top.map((v) => key(v.x, v.y, v.z)));
  const innerCol = (v, f) => (inEgg(v.x + f.n[0], v.y + f.n[1], v.z + f.n[2], 1.6) ? (f.n[1] > 0 ? fshade(spec.inner, 0.92) : spec.inner) : v.rim && f.n[1] > 0 ? fshade(v.c, 0.8) : undefined);
  const halfGeo = meshFaces(half, (x, y, z) => hk.has(key(x, y, z)), innerCol);
  const topGeo = meshFaces(top, (x, y, z) => tk.has(key(x, y, z)), innerCol);
  return { shell, core: coreGeo, half: halfGeo, top: topGeo, pip: new THREE.Vector3((pv.x + 0.5 - ECX) * EV, (pv.y + 0.5) * EV, (pv.z + 1 - ECZ) * EV), height: EH * EV, radius: ER * EV };
}

/** The shell's material: the cave's toon, plus the cracks (light leaking), their dark lips, the breaking away. */
function eggMaterial(spec) {
  const m = voxelMaterial('toon').clone();
  const U = { uCrack: { value: -1 }, uLight: { value: new THREE.Color(spec.light) }, uFlash: { value: 0 }, uLeak: { value: 1 } };
  m.userData = { u: U };
  m.onBeforeCompile = (sh) => {
    patchCave(sh, { emissive: 0.04 });
    Object.assign(sh.uniforms, U);
    sh.vertexShader = 'attribute vec3 aCrack;\nvarying vec3 vEgg;\n' + sh.vertexShader.replace('vCaW = caW.xyz;', 'vCaW = caW.xyz;\nvEgg = aCrack;');
    let fs = sh.fragmentShader;
    fs = fs.replace('#include <common>', '#include <common>\nvarying vec3 vEgg;\nuniform float uCrack;\nuniform vec3 uLight;\nuniform float uFlash;\nuniform float uLeak;');
    fs = fs.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vEgg.z < uCrack) discard;');
    fs = fs.replace('/*CAVE_EMIT*/', /* glsl */`
      float egPulse = 0.85 + 0.15 * sin(uTime * 3.1 + vEgg.x * 23.0);
      if (vEgg.x < uCrack) {
        // a crack: the light inside shows through
        diffuseColor.rgb = uLight * 0.12;
        totalEmissiveRadiance += uLight * (0.85 + 0.85 * clamp((uCrack - vEgg.x) * 6.0, 0.0, 1.0)) * (0.75 + 0.45 * clamp(uCrack, 0.0, 1.0)) * egPulse * uLeak;
      } else if (vEgg.y < uCrack) {
        // its lip: darker, with a little light bleeding round it
        diffuseColor.rgb *= 0.5;
        totalEmissiveRadiance += uLight * 0.04 * egPulse * uLeak;
      }
      totalEmissiveRadiance += uLight * uFlash * 1.5;`);
    sh.fragmentShader = fs;
  };
  m.customProgramCacheKey = () => 'egg-shell-2';
  return m;
}

// ------------------------------------------------------------------ the nest in voxels
const NK = 64; // twigs, bones, quills: small things
function buildNestGeo(seed = 5) {
  const rng = makeRng(seed);
  const RI = 0.33 * NK, RO = 0.56 * NK; // the ring's inner and outer radius
  const W = Math.ceil(RO * 2 + 14), H = Math.ceil(0.24 * NK), D = W, cx = W / 2, cz = D / 2;
  const g = new VoxelGrid(W, H, D);
  const BARK = [0x221812, 0x35281e, 0x4a3a2c, 0x5e4c3a, 0x7a6852];
  const STRAW = [0x5e5236, 0x7c6e48, 0x9a8a5e, 0xb4a476];
  const dishY = (d) => Math.round(1 + Math.min(1.7, d / RI) ** 2 * 2.6);
  // the bed: a shallow dish of straw, moss and down
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (d > RO * 0.98) continue;
    const dish = dishY(d);
    for (let y = 0; y <= Math.min(H - 1, dish); y++) {
      const h = hash3(x, y, z, seed);
      let c = h < 0.55 ? STRAW[((hash3(x >> 1, y, z, seed + 1) * 4) | 0)] : h < 0.72 ? RAMP.moss[1 + ((hash3(x, y, z, 3) * 3) | 0)] : h < 0.8 ? 0xd8d0c0 : BARK[2];
      if (d < RI * 0.75 && y === dish && hash3(x >> 1, 0, z >> 1, seed + 7) < 0.35) c = 0xf0eadc; // down
      g.set(x, y, z, lit(c));
    }
  }
  // twigs laid round the ring, criss-crossing, a few sticking out
  const twig = (a0, r0, len, w, tone0) => {
    const tx = -Math.sin(a0), tz = Math.cos(a0);
    const j = rng.range(-0.7, 0.7) + (rng() < 0.5 ? Math.PI : 0);
    const dx = tx * Math.cos(j) - Math.cos(a0) * Math.sin(j) * 0.6, dz = tz * Math.cos(j) - Math.sin(a0) * Math.sin(j) * 0.6;
    const dl = Math.hypot(dx, dz);
    const x0 = cx + Math.cos(a0) * r0, z0 = cz + Math.sin(a0) * r0;
    const y0 = dishY(r0) + rng.range(0, 3.5), dy = rng.range(-2, 2.5);
    const bend = rng.range(-0.15, 0.15);
    const steps = Math.ceil(len * 1.4);
    for (let s = 0; s <= steps; s++) {
      const k = s / steps, u = k * len;
      const x = x0 + (dx / dl) * u + Math.sin(k * Math.PI) * bend * len * (dz / dl);
      const z = z0 + (dz / dl) * u - Math.sin(k * Math.PI) * bend * len * (dx / dl);
      const y = Math.min(H - 2, y0 + dy * k + Math.sin(k * 6 + a0) * 0.5);
      const d = Math.hypot(x - cx, z - cz);
      if (d < RI * 0.85) continue; // (keeps out of the eggs' bed)
      const c = k > 0.95 || k < 0.04 ? BARK[4] : BARK[clamp(Math.round(tone0 + Math.sin(s * 0.9) * 0.6), 0, 4)];
      for (let q = 0; q < w; q++) g.set(x + (q & 1), y + (q >> 1), z, lit(c));
      if (s === Math.round(steps * 0.45) && rng() < 0.35) for (let jj = 1; jj < 5; jj++) g.set(x + (dz / dl) * jj * 0.8, y + jj * 0.4, z - (dx / dl) * jj * 0.8, lit(BARK[2]));
    }
  };
  for (let i = 0; i < 110; i++) twig(rng() * TAU, rng.range(RI * 1.02, RO * 0.98), rng.range(10, 26), rng() < 0.22 ? 2 : 1, rng.range(0.6, 3.2));
  // bones: a long bone with knobbly ends, a few ribs
  const bone = (x0, y0, z0, x1, y1, z1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 1.4);
    for (let s = 0; s <= n; s++) {
      const k = s / n, x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k, z = z0 + (z1 - z0) * k;
      const knob = k < 0.1 || k > 0.9;
      const c = hash3(Math.round(x), Math.round(y), Math.round(z), 9) < 0.2 ? 0xc8bc9c : 0xe8e0c8;
      g.set(x, y, z, lit(c)); g.set(x, y + 1, z, lit(0xf4eedc));
      if (knob) { g.set(x + 1, y, z, lit(c)); g.set(x, y, z + 1, lit(c)); g.set(x + 1, y + 1, z + 1, lit(0xf4eedc)); }
    }
  };
  bone(cx - RO * 0.78, 5, cz + RO * 0.3, cx - RO * 0.3, 8, cz + RO * 0.74);
  for (let i = 0; i < 3; i++) { const a = 2.4 + i * 0.22, r = RO * 0.8; for (let s = 0; s < 12; s++) { const b = a + s * 0.03; g.set(cx + Math.cos(b) * (r - s * 0.5), 5 + Math.sin(s / 11 * Math.PI) * 5, cz + Math.sin(b) * (r - s * 0.5), lit(s % 4 ? 0xe8e0c8 : 0xd4caae)); } }
  // quills shed by the mother (her crest's colours)
  const QUILL = [[0x1a9a8a, 0x5ae0c8], [0xd83a2a, 0xff8a5a], [0xe8b83a, 0xfff07a]];
  for (let i = 0; i < 8; i++) {
    const a = rng() * TAU, r = rng.range(RI * 1.05, RO * 0.95), Q = QUILL[i % 3];
    const ox = Math.cos(a), oz = Math.sin(a);
    for (let s = 0; s < 14; s++) {
      const x = cx + ox * (r + s * 0.6), z = cz + oz * (r + s * 0.6), y = Math.min(H - 1, 5 + s * 0.5);
      g.set(x, y, z, lit(s < 3 ? 0xe8e0c8 : Q[s % 3 ? 0 : 1]));
      if (s > 3 && s < 13) { g.set(x - oz, y, z + ox, lit(Q[1])); if (s % 2) g.set(x + oz, y, z - ox, lit(Q[0])); }
    }
  }
  // bits of old shell from the last hatching, and a few glowing moss specks
  for (let i = 0; i < 9; i++) {
    const a = rng() * TAU, r = rng.range(RI * 0.5, RO * 0.9), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const y = dishY(r) + 1;
    const c = EGGS[i % 3].shell[2];
    for (const [dx, dz, dy] of [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 1]]) if (rng() < 0.85) g.set(x + dx, Math.min(H - 1, y + dy), z + dz, lit(c));
  }
  for (let i = 0; i < 40; i++) {
    const a = rng() * TAU, r = rng.range(RO * 0.85, RO * 1.0), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    g.set(x, rng.int(0, 4), z, glowHex(RAMP.cyan[rng.int(4, 6)], rng() < 0.3 ? 2 : 1));
  }
  const geo = meshGlow(g, { scale: 1 / NK, pivot: [cx, 0, cz] });
  return { geo, bedY: 2.4 / NK, ring: RO / NK };
}

/** The hatchling: the mine's raptor model small, big-headed, sitting up in its shell. */
function babyRig(v, mat, eyeMat) {
  const G = raptorModel(v);
  const VS = RVS;
  const g3 = (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };
  const part = (geo, m, p, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.layers.enable(LAYER_OUTLINE); p.add(o); return o; };
  const root = new THREE.Group();
  const hips = g3(root, 0, 2 * VS, 0), bodyG = g3(hips);
  bodyG.rotation.x = -1.25;
  part(G.body, mat, bodyG);
  const neck = g3(bodyG, 0, 6.5 * VS, 7 * VS);
  neck.rotation.x = 1.12;
  const head = g3(neck);
  head.scale.setScalar(1.08);
  part(G.head, mat, head);
  const jaw = g3(head, 0, 0.8 * VS, 1.5 * VS);
  part(G.jaw, mat, jaw);
  const eyes = part(G.eyes, eyeMat, head, 0, 3 * VS, 0);
  const arms = [1, -1].map((sd) => { const g = g3(bodyG, sd * 3 * VS, 0.5 * VS, 5.5 * VS); const a = part(G.arm, mat, g); if (sd < 0) a.scale.x = -1; g.rotation.x = -1.3; return g; });
  let tp = g3(bodyG, 0, 0.5 * VS, -5 * VS);
  const tail = G.tail.map((g, i) => { const s = i ? g3(tp, 0, 0.2 * VS, -4.8 * VS) : tp; part(g, mat, s); tp = s; s.rotation.y = 0.55; s.rotation.x = i ? -0.3 : 0.6; return s; });
  return { root, hips, bodyG, neck, head, jaw, eyes, arms, tail, geos: G };
}

// ------------------------------------------------------------------ styles
const CSS = /* css */`
.nt-view { position: absolute; inset: 0; pointer-events: none; opacity: 0; transition: opacity .4s; }
.nt-view.on { opacity: 1; }
.nt-head { position: absolute; left: 0; right: 0; top: calc(var(--px) * 8 + env(safe-area-inset-top, 0px)); font-family: var(--font-display); font-size: calc(var(--px) * 16); color: #ffe8c8;
  letter-spacing: .02em; text-align: center; line-height: 1; transform: translateY(calc(var(--px) * -6)); transition: transform .45s cubic-bezier(.2,1.3,.4,1); }
.nt-view.on .nt-head { transform: none; transition-delay: .15s; }
@media (max-aspect-ratio: 5/4) { .nt-head { top: calc(var(--px) * 40 + env(safe-area-inset-top, 0px)); } }
.nt-head small { display: block; font-family: var(--font); font-size: calc(var(--px) * 5.4); color: #e8d0a8; opacity: .9; margin-top: calc(var(--px) * 1.5); letter-spacing: .04em; }
.nt-row { position: absolute; inset: 0; }
.nt-slot { position: absolute; left: 0; top: 0; width: 0; height: 0; }
#ui .nt-main:focus-visible, #ui .nt-del:focus-visible { outline: none; }
#ui .nt-main, .nt-main { position: absolute; left: 0; top: 0; background: transparent; border: 0; padding: 0; margin: 0; cursor: pointer; pointer-events: auto;
  touch-action: manipulation; outline: none; color: transparent; font: inherit; transform-origin: 0 0; }
.nt-ring { position: absolute; left: 0; top: 0; width: calc(var(--px) * 46); height: calc(var(--px) * 12); transform: translate(-50%, -50%); opacity: 0; transition: opacity .15s; pointer-events: none;
  background:
    linear-gradient(90deg, transparent 0 8%, rgba(255,206,120,.34) 8% 92%, transparent 92%) 0 37% / 100% 26% no-repeat,
    linear-gradient(90deg, transparent 0 22%, rgba(255,226,150,.26) 22% 78%, transparent 78%) 0 12% / 100% 76% no-repeat; image-rendering: pixelated; }
.nt-slot.hot .nt-ring, .nt-main:focus-visible ~ .nt-ring { opacity: 1; }
.nt-plaque { position: absolute; left: 0; top: 0; transform: translateX(-50%); min-width: calc(var(--px) * 52); text-align: center; color: #fbeedc; line-height: 1.15; pointer-events: none;
  padding: calc(var(--px) * 3.5) calc(var(--px) * 5) calc(var(--px) * 4); white-space: nowrap; }
.nt-tag { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; image-rendering: crisp-edges; z-index: -1; }
.nt-plaque b { display: block; font-family: var(--font-display); font-weight: 400; font-size: calc(var(--px) * 12); line-height: .95; }
.nt-plaque .nt-name { display: block; font-size: calc(var(--px) * 5.4); letter-spacing: .08em; text-transform: uppercase; opacity: .9; }
.nt-plaque .nt-meta { display: block; font-size: calc(var(--px) * 5.4); opacity: .92; }
.nt-plaque .nt-new { display: block; font-size: calc(var(--px) * 5.4); opacity: .88; font-style: italic; }
.nt-plaque .nt-hatch { display: block; font-size: calc(var(--px) * 5.4); color: #ffe080; }
.nt-slot.used .nt-plaque b { color: var(--gc); }
.nt-last { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); font-size: calc(var(--px) * 5.4); color: #ffd890; white-space: nowrap; pointer-events: none; animation: ntBob 1.6s ease-in-out infinite; }
@keyframes ntBob { 50% { margin-top: calc(var(--px) * -1.5); } }
#ui .nt-del, .nt-del { position: absolute; left: 0; top: 0; width: calc(var(--px) * 14); height: calc(var(--px) * 14); min-width: 30px; min-height: 30px; transform: translate(-50%, -50%);
  padding: 0; margin: 0; border: 0; background: transparent; cursor: pointer; pointer-events: auto; opacity: 0; transition: opacity .15s; outline: none; }
.nt-del img { width: 100%; height: 100%; image-rendering: pixelated; display: block; transition: transform .15s; }
.nt-slot.hot .nt-del, .nt-del:focus-visible, .is-touch .nt-del { opacity: .9; }
.nt-del:hover, .nt-del:focus-visible { opacity: 1; }
.nt-del:hover img, .nt-del:focus-visible img { transform: rotate(-14deg) scale(1.1); }
.nt-del:focus-visible { filter: drop-shadow(0 0 var(--px) #f2c23a) drop-shadow(0 0 var(--px) #f2c23a); }
.nt-slot.busy .nt-del, .nt-slot.busy .nt-main { pointer-events: none; }
#ui .nt-view:not(.on) .nt-main, #ui .nt-view:not(.on) .nt-del { pointer-events: none; }
@media (max-height: 520px) and (min-aspect-ratio: 5/4) {
  .nt-head { top: calc(var(--px) * 4 + env(safe-area-inset-top, 0px)); font-size: calc(var(--px) * 12); }
  .nt-plaque { min-width: 0; padding: calc(var(--px) * 2.5) calc(var(--px) * 3.5) calc(var(--px) * 3); }
  .nt-plaque b { font-size: calc(var(--px) * 9); }
  .nt-plaque .nt-name, .nt-plaque .nt-meta, .nt-plaque .nt-new, .nt-plaque .nt-hatch { font-size: calc(var(--px) * 4.4); letter-spacing: .02em; }
}
@media (max-aspect-ratio: 5/4) {
  .nt-plaque { min-width: 0; padding: calc(var(--px) * 3) calc(var(--px) * 3.5) calc(var(--px) * 3.5); }
  .nt-plaque b { font-size: calc(var(--px) * 10); }
  .nt-plaque .nt-name, .nt-plaque .nt-meta, .nt-plaque .nt-new, .nt-plaque .nt-hatch { font-size: calc(var(--px) * 4.6); letter-spacing: .02em; }
}
`;

/** A tiny hammer icon (16×16) for the delete buttons (the save stones' own). */
function hammerIcon() {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(16, 16);
  const b = new Uint32Array(img.data.buffer);
  const C32 = (hex, a = 255) => (((a & 255) << 24) | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >>> 16) & 0xff)) >>> 0;
  const set = (x, y, col) => { b[y * 16 + x] = C32(col); };
  for (let i = 0; i < 10; i++) { set(4 + i, 11 - Math.round(i * 0.7), 0x2a1408); set(4 + i, 12 - Math.round(i * 0.7), i % 3 ? 0xa87444 : 0x7a5030); }
  const head = [[9, 1], [10, 1], [11, 1], [12, 2], [13, 3], [14, 4], [8, 2], [9, 2], [10, 2], [11, 2], [12, 3], [13, 4], [9, 3], [10, 3], [11, 3], [12, 4], [10, 4], [11, 4], [11, 5]];
  for (const [x, y] of head) set(x, y, y < 3 ? 0xd6d4e2 : 0x6a6672);
  const o = new Uint32Array(b);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = y * 16 + x;
    if (o[i]) continue;
    if ((x > 0 && o[i - 1]) || (x < 15 && o[i + 1]) || (y > 0 && o[i - 16]) || (y < 15 && o[i + 16])) b[i] = C32(0xfff0d0, 230);
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

/**
 * A little bark tag for a plaque, drawn per pixel: a split plank hung on a twine loop, its
 * silhouette nicked and uneven, grain and a knot, lit from the top left, a tinted outline.
 */
function drawTag(canvas, w, h, seed, accent) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const b = new Uint32Array(img.data.buffer);
  const C32 = (hex, a = 255) => (((a & 255) << 24) | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >>> 16) & 0xff)) >>> 0;
  const WOOD = [0x2a1a10, 0x3e2818, 0x543822, 0x6a4a2e, 0x86603c];
  const top = 3, bot = h - 2, l = 1, r = w - 2;
  const inside = (x, y) => {
    if (y < top || y > bot || x < l || x > r) return false;
    // nicked corners and an uneven edge
    const cy = Math.min(y - top, bot - y), cx = Math.min(x - l, r - x);
    if (cx + cy < 2) return false;
    if (y === top && hash3(x >> 2, 0, 0, seed) < 0.25) return false;
    if (y === bot && hash3(x >> 2, 1, 0, seed) < 0.3) return false;
    if ((x === l || x === r) && hash3(0, y >> 1, x, seed) < 0.3) return false;
    return true;
  };
  const knot = [l + 4 + Math.floor(hash3(seed, 1, 2, 3) * (w - 12)), top + 3 + Math.floor(hash3(seed, 2, 2, 3) * Math.max(1, h - 10))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const grain = Math.sin(y * 1.7 + Math.sin(x * 0.11 + seed) * 2.2 + hash3(0, y, 0, seed) * 3);
    let k = 2 + (grain > 0.55 ? 1 : grain < -0.65 ? -1 : 0);
    const kd = Math.hypot((x - knot[0]) * 0.6, y - knot[1]);
    if (kd < 1.2) k = 0; else if (kd < 2.4) k = 1;
    if (y === top + (inside(x, top) ? 0 : 1) || x === l + 1) k = Math.min(4, k + 1); // lit edge
    if (y >= bot - 1 || x >= r - 1) k = Math.max(0, k - 1); // shadowed edge
    if (hash3(x, y, 7, seed) < 0.02) k = 4;
    b[y * w + x] = C32(WOOD[k], 238);
  }
  // the split in the plank and two nail holes with rust
  const sx = l + 6 + Math.floor(hash3(seed, 5, 5, 5) * (w - 14));
  for (let y = bot - 1, x = sx; y > bot - Math.min(6, h - 6); y--, x += hash3(x, y, 9, seed) < 0.4 ? 1 : 0) if (inside(x, y)) b[y * w + x] = C32(WOOD[0], 238);
  for (const nx of [l + 3, r - 3]) { if (inside(nx, top + 2)) { b[(top + 2) * w + nx] = C32(0x1a1418); if (inside(nx, top + 3)) b[(top + 3) * w + nx] = C32(0x6a3a22, 238); } }
  // twine loop to the nails, an accent thread
  for (let x = l + 3; x <= r - 3; x++) {
    const k = (x - l - 3) / Math.max(1, r - l - 6), y = Math.round(top + 2 - Math.sin(k * Math.PI) * 2.6);
    if (y >= 0 && y < h && !inside(x, y)) b[y * w + x] = C32(x % 3 ? 0xc8a868 : accent);
  }
  // outline
  const o = new Uint32Array(b);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (o[i]) continue;
    if ((x > 0 && o[i - 1]) || (x < w - 1 && o[i + 1]) || (y > 0 && o[i - w]) || (y < h - 1 && o[i + w])) b[i] = C32(0x140a0c, 230);
  }
  ctx.putImageData(img, 0, 0);
}

let cssRefs = 0, cssEl = null;
function useCss() {
  if (!cssRefs++) { cssEl = document.createElement('style'); cssEl.id = 'nest-css'; cssEl.textContent = CSS; document.head.append(cssEl); }
  return () => { if (!--cssRefs && cssEl) { cssEl.remove(); cssEl = null; } };
}

// ------------------------------------------------------------------ the nest
export function makeNest(parent, opts) {
  const unstyle = useCss();
  const { camera, canvas } = opts;
  const audio = opts.audio;
  const play = (n, o) => audio?.play?.(n, o);
  const group = new THREE.Group();
  group.name = 'nest';
  const geos = [], mats = [];
  // ---- where: on a rock shelf at the nest spot, turned to face the menu's camera
  const N = CAVE.nest;
  const y0 = floorH(N.x, N.z);
  group.position.set(N.x, y0, N.z);
  group.rotation.y = opts.yaw ?? 0;
  const rockGeo = withGlow(makeBoulderGeo(77, { w: 1.75, h: 0.5, d: 1.45, k: 32, moss: 0.3, tone: 0x6a6476 }));
  rockGeo.computeBoundingBox();
  const shelfTop = rockGeo.boundingBox.max.y * 0.82;
  const rock = new THREE.Mesh(rockGeo, caveToon({ key: 'rock' }));
  rock.position.y = -0.04;
  rock.layers.enable(LAYER_OUTLINE);
  group.add(rock);
  geos.push(rockGeo);
  const nestM = buildNestGeo(5);
  const nest = new THREE.Mesh(nestM.geo, caveToon({ key: 'plant' }));
  nest.position.y = shelfTop - 0.06;
  nest.layers.enable(LAYER_OUTLINE);
  group.add(nest);
  geos.push(nestM.geo);
  // ferns and little glowing mushrooms tucked round the shelf (the mine's plants)
  {
    const plantMat = caveToon({ key: 'plant' });
    const put = (name, v, s, x, z, ry, y = shelfTop - 0.05) => {
      let hsh = 99 + v * 7919;
      for (let i = 0; i < name.length; i++) hsh = Math.imul(hsh ^ name.charCodeAt(i), 16777619);
      const g = vgGeo(MODELS[name](vrng(hsh)), s);
      const m = new THREE.Mesh(g, plantMat);
      m.position.set(x, y, z); m.rotation.y = ry;
      m.layers.enable(LAYER_OUTLINE);
      group.add(m); geos.push(g);
    };
    put('fern', 1, 1 / 60, -0.62, -0.18, 0.5);
    put('mushTiny', 2, 1 / 64, 0.62, -0.22, 1.2);
    put('glowShroom', 1, 1 / 60, -0.78, 0.3, 2.0, 0.02);
    put('flowerCyan', 0, 1 / 64, 0.82, 0.32, 0.3, 0.02);
    put('mossGrass', 3, 1 / 64, 0.55, 0.42, 0.9, 0.02);
    put('fungusGrass', 1, 1 / 64, -0.45, 0.55, 2.4, 0.02);
  }
  // the warm light of the eggs
  const warm = new THREE.PointLight(0xffc488, 0.3, 3, 1.4);
  warm.position.set(0, shelfTop + 0.95, 0.45);
  group.add(warm);

  // ---- the eggs
  const bedY = nest.position.y + nestM.bedY - 0.015;
  const SPOTS = [[-0.27, 0.035, 0.12], [0, -0.045, -0.04], [0.27, 0.035, -0.12]];
  const babyMat = caveToon({ emissive: 0.12, key: 'baby' }), babyEye = caveToon({ emissive: 1.4, key: 'baby-eye' });
  const halfMat = caveToon({ emissive: 0.05, key: 'shell-half' });
  mats.push(babyMat, babyEye, halfMat);
  const chips = new Particles({ max: 160, additive: false, atten: true, renderOrder: 7 });
  const sparks = new Particles({ max: 120, additive: true, atten: true, renderOrder: 8 });
  group.add(chips.points, sparks.points);
  const eggs = EGGS.map((spec, i) => {
    const m = buildEgg(spec, 31 + i * 17);
    const mat = eggMaterial(spec);
    mats.push(mat);
    const hold = new THREE.Group(); // (wobbles on the egg's foot)
    hold.position.set(SPOTS[i][0], bedY, SPOTS[i][1]);
    hold.rotation.y = SPOTS[i][2];
    group.add(hold);
    const pivot = new THREE.Group();
    hold.add(pivot);
    const shell = new THREE.Mesh(m.shell, mat);
    shell.layers.enable(LAYER_OUTLINE);
    const coreMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.0, 1.6), fog: false });
    mats.push(coreMat);
    const core = new THREE.Mesh(m.core, coreMat);
    pivot.add(shell, core);
    // hatched: the bottom half (with the baby), the top lying beside it
    const half = new THREE.Mesh(m.half, halfMat);
    half.layers.enable(LAYER_OUTLINE);
    const top = new THREE.Mesh(m.top, halfMat);
    top.layers.enable(LAYER_OUTLINE);
    top.position.set(0.075, 0.27, 0.125);
    top.rotation.set(2.55, 0.5, -0.35);
    const hatched = new THREE.Group();
    hatched.add(half, top);
    hatched.visible = false;
    pivot.add(hatched);
    geos.push(m.shell, m.core, m.half, m.top);
    return {
      i, spec, hold, pivot, shell, core, mat, half, top, baby: null, hatched, m,
      info: null, fake: null, fakeHatch: null, used: false, base: -0.02, cur: -0.02, creep: 0, hot: false, hatchedOn: false,
      wob: 0, wobV: 0, axis: new THREE.Vector3(1, 0, 0), hop: 0, hopV: 0, flash: 0, boost: 0, t: Math.random() * 10,
      tickT: 0, smash: null, rise: 1, blink: 0, look: 0, lookT: 0,
    };
  });

  // ---- the DOM: buttons over the eggs, plaques, the hammer, "last played"
  const head = el('div', { class: 'nt-head bk-outline' }, ['The Nest', el('small', {}, 'Pick an egg to dig in')]);
  const row = el('div', { class: 'nt-row', role: 'group', 'aria-label': 'Save slots' });
  const view = el('div', { class: 'nt-view', 'aria-hidden': 'true' }, [head, row]);
  parent.append(view);
  const hammerURL = hammerIcon();
  for (const E of eggs) {
    const main = el('button', { class: 'nt-main', type: 'button', tabindex: '-1' });
    const ring = el('i', { class: 'nt-ring' });
    const tag = el('canvas', { class: 'nt-tag', 'aria-hidden': 'true' });
    const plaque = el('div', { class: 'nt-plaque bk-outline' });
    const del = el('button', { class: 'nt-del', type: 'button', tabindex: '-1', 'aria-label': `Delete save ${E.i + 1}`, title: 'Break this egg (delete the save)' }, [el('img', { src: hammerURL, alt: '' })]);
    const last = el('div', { class: 'nt-last bk-outline', hidden: true }, '▾ last played');
    const slotEl = el('div', { class: 'nt-slot' }, [ring, main, plaque, del, last]);
    slotEl.style.setProperty('--gc', E.spec.css);
    row.append(slotEl);
    Object.assign(E, { main, ring, tag, plaque, del, last, slotEl, tagKey: '' });
    const enter = () => {
      if (E.hot || !isOpen) return;
      E.hot = true; slotEl.classList.add('hot');
      play('ui_hover');
      E.wobV += 4.5; E.axis.set(Math.random() < 0.5 ? 1 : -1, 0, R(-0.4, 0.4)).normalize();
      if (E.hatchedOn) { play('egg_chirp', { pan: panOf(E) }); E.chirp = 0.5; } else play('egg_crack', { pan: panOf(E), vol: E.base > 0 ? 0.8 : 0.35 });
      E.tickT = 1.1;
    };
    const leave = () => { E.hot = false; slotEl.classList.remove('hot'); };
    main.addEventListener('pointerenter', enter);
    main.addEventListener('pointerleave', leave);
    main.addEventListener('focus', enter);
    main.addEventListener('blur', leave);
    del.addEventListener('pointerenter', () => slotEl.classList.add('hot'));
    del.addEventListener('pointerleave', () => { if (!E.hot) slotEl.classList.remove('hot'); });
    main.addEventListener('click', () => pick(E));
    del.addEventListener('click', (ev) => { ev.stopPropagation(); smash(E); });
    main.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        const d = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : 2;
        eggs[(E.i + d) % 3].main.focus({ preventScroll: true });
        ev.preventDefault();
      } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && E.info?.used) { smash(E); ev.preventDefault(); }
    });
  }
  const panOf = (E) => { const r = E.rect; return r ? clamp((r.cx / window.innerWidth) * 2 - 1, -0.7, 0.7) : 0; };

  let isOpen = false, busy = false;

  /** The saves → the eggs and their plaques. */
  function refresh() {
    const list = opts.slots();
    const used = list.filter((x) => x.used);
    const latest = used.slice().sort((a, b) => (b.saved || 0) - (a.saved || 0))[0];
    for (const E of eggs) {
      const info = list[E.i] || { i: E.i, used: false };
      E.info = info;
      const pct = E.fake ?? (info.used ? info.completion : -1);
      E.used = !!info.used;
      E.pct = pct;
      // how cracked: a started save shows a hairline; near the end the shell starts to give
      E.base = pct >= 0 ? 0.035 + 0.965 * clamp(pct / 100, 0, 1) : -0.02;
      const hatch = E.fakeHatch ?? (info.used && !!opts.tame?.(E.i));
      E.hatchedOn = !!hatch;
      if (hatch && !E.baby) {
        // the hatchling (built the first time a save needs it)
        E.baby = babyRig(E.spec.raptor, babyMat, babyEye);
        E.baby.root.scale.setScalar(0.3);
        E.baby.root.position.y = 0.04;
        E.hatched.add(E.baby.root);
      }
      E.shell.visible = E.core.visible = !hatch;
      E.hatched.visible = !!hatch;
      E.slotEl.classList.toggle('used', !!info.used);
      E.plaque.innerHTML = '';
      E.plaque.append(E.tag);
      if (info.used || E.fake != null) {
        E.plaque.append(
          el('span', { class: 'nt-name' }, `Slot ${E.i + 1} · ${E.spec.name}`),
          el('b', {}, `${Math.round(Math.max(0, pct))}%`),
          hatch ? el('span', { class: 'nt-hatch' }, 'Hatched!') : '',
          el('span', { class: 'nt-meta' }, info.used ? `${formatGoldFull(info.gold)} g · Day ${info.day}` : '—'),
          el('span', { class: 'nt-meta' }, info.used ? formatPlayTime(info.playTime) + ' played' : ''),
        );
        E.main.setAttribute('aria-label', info.used ? `Continue save ${E.i + 1}: ${Math.round(pct)}% done${hatch ? ', hatched' : ''}, ${info.gold} gold, day ${info.day}, ${formatPlayTime(info.playTime)} played` : `Save ${E.i + 1}`);
      } else {
        E.plaque.append(el('span', { class: 'nt-name' }, `Slot ${E.i + 1}`), el('b', {}, 'Empty'), el('span', { class: 'nt-new' }, 'A new adventure'));
        E.main.setAttribute('aria-label', `Start a new adventure in save ${E.i + 1}`);
      }
      E.del.hidden = !info.used;
      E.last.hidden = !(latest && latest.i === E.i && used.length > 1);
      E.tagKey = '';
    }
  }

  // ---- choosing an egg: the shell gives, then the game goes on from it
  function pick(E) {
    if (busy || E.smash || !isOpen) return;
    busy = true;
    E.wobV += 9; E.flash = 1;
    const pan = panOf(E);
    if (E.hatchedOn) { E.hopV = 1.6; play('egg_chirp', { pan }); play('egg_crack', { pan, vol: 0.6 }); }
    else {
      E.boost = 0.001;
      play('egg_hatch', { pan });
      setTimeout(() => play('egg_crack', { pan, pitch: 0.85 }), 160);
      burst(E, 18, true);
    }
    setTimeout(() => { busy = false; opts.onPick?.(E.i, E.info); }, 720);
  }
  /** Chips of shell and sparks of light from the pip. */
  function burst(E, n, light) {
    E.pivot.updateWorldMatrix(true, false);
    const p = E.m.pip.clone().applyMatrix4(E.pivot.matrixWorld);
    const g = group.worldToLocal(p.clone());
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      chips.spawn({ pos: [g.x, g.y, g.z], vel: [Math.cos(a) * R(0.2, 0.7), R(0.6, 1.4), Math.sin(a) * R(0.2, 0.7) + 0.3], life: R(0.5, 0.9), color: E.spec.shell[(k % 3) + 1], size: R(0.008, 0.014), shape: SHAPE.square, gravity: 5, drag: 0.6, spin: 8 });
      if (light) sparks.spawn({ pos: [g.x, g.y, g.z], vel: [Math.cos(a) * R(0.1, 0.5), R(0.2, 0.9), Math.sin(a) * R(0.1, 0.5) + 0.2], life: R(0.4, 0.9), color: 0xfff2c0, color2: E.spec.light, size: R(0.006, 0.012), shape: SHAPE.square, drag: 1.5, flicker: 0.4 });
    }
  }
  async function smash(E) {
    if (busy || E.smash || !E.info?.used) return;
    busy = true;
    const ok = await (opts.onDelete ? opts.onDelete(E.i, E.info) : Promise.resolve(true));
    busy = false;
    if (!ok) { E.main.focus({ preventScroll: true }); return; }
    doSmash(E);
  }
  function doSmash(E) {
    E.slotEl.classList.add('busy');
    E.smash = { t: 0, done: false };
    E.wobV += 14;
    play('egg_break', { pan: panOf(E) });
    // the shell bursts into chips
    E.pivot.updateWorldMatrix(true, false);
    const c = group.worldToLocal(new THREE.Vector3(0, E.m.height * 0.5, 0).applyMatrix4(E.pivot.matrixWorld));
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * TAU, up = R(0.4, 1.6);
      chips.spawn({ pos: [c.x + Math.cos(a) * 0.06, c.y + R(-0.08, 0.1), c.z + Math.sin(a) * 0.06], vel: [Math.cos(a) * R(0.4, 1.1), up, Math.sin(a) * R(0.4, 1.1)], life: R(0.7, 1.3), color: E.spec.shell[(k % 4)], size: R(0.01, 0.02), shape: SHAPE.square, gravity: 6, drag: 0.4, spin: 10 });
    }
    for (let k = 0; k < 24; k++) { const a = Math.random() * TAU; sparks.spawn({ pos: [c.x, c.y, c.z], vel: [Math.cos(a) * R(0.2, 0.8), R(0.3, 1.2), Math.sin(a) * R(0.2, 0.8)], life: R(0.4, 1.0), color: 0xfff0c0, color2: E.spec.light, size: R(0.008, 0.016), shape: SHAPE.square, drag: 1.2 }); }
    E.rise = 0;
  }

  // ---- framing: the camera's spot for the nest shot (eggs across the middle, room under them for the plaques)
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function shot(aspect, leaveI = -1) {
    group.updateMatrixWorld(true);
    const tall = aspect < 1;
    const fov = tall ? 58 : aspect > 1.95 ? 38 : 40;
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2), tanH = tanV * aspect;
    const rowW = tall ? 0.95 : 1.3; // (wide: the whole nest; held tall: the eggs)
    const fill = tall ? 0.96 : aspect > 1.95 ? 0.8 : 0.66;
    const dist = Math.max(rowW / (2 * tanH * fill), 0.7);
    const pitch = tall ? 0.72 : 0.62;
    const centre = new THREE.Vector3(0, bedY + 0.1, 0);
    const eye = new THREE.Vector3(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist).add(centre);
    // the eggs sit a little above the middle (the plaques go under them)
    const lift = (tall ? 0.0 : aspect > 1.95 ? 0.16 : 0.15) * dist * tanV * 2;
    const look = centre.clone().add(new THREE.Vector3(0, -Math.cos(pitch), Math.sin(pitch)).multiplyScalar(lift));
    let pos = group.localToWorld(eye), lk = group.localToWorld(look);
    if (leaveI >= 0) {
      const E = eggs[leaveI];
      E.pivot.updateWorldMatrix(true, false);
      const ec = _a.set(0, E.m.height * 0.55, 0).applyMatrix4(E.pivot.matrixWorld);
      pos = _b.copy(pos).lerp(ec, 0.72).clone();
      lk = ec.clone();
    }
    return { pos, look: lk, fov };
  }

  // ---- per frame
  const v3 = new THREE.Vector3();
  function project(p, r) {
    v3.copy(p).project(camera);
    return [r.left + (v3.x * 0.5 + 0.5) * r.width, r.top + (-v3.y * 0.5 + 0.5) * r.height, v3.z];
  }
  function update(dt, heightPx = 600) {
    let lightSum = 0;
    for (const E of eggs) {
      E.t += dt;
      // the crack: its save's progress, creeping a little while hovered, jumping when chosen
      E.creep += ((E.hot && E.base > 0 ? 0.075 : 0) - E.creep) * (1 - Math.exp(-dt * (E.hot ? 0.9 : 1.6)));
      if (E.boost > 0) E.boost = Math.min(0.32, E.boost + dt * 0.9);
      const want = E.base + E.creep + E.boost;
      E.cur += (want - E.cur) * (1 - Math.exp(-dt * 6));
      E.mat.userData.u.uCrack.value = E.cur;
      E.flash = Math.max(0, E.flash - dt * 2.2);
      E.mat.userData.u.uFlash.value = E.flash;
      if (E.hot && !E.hatchedOn && E.base > 0) {
        E.tickT -= dt;
        if (E.tickT <= 0) { E.tickT = R(1.2, 2.2); play('egg_crack', { pan: panOf(E), vol: 0.45 }); E.wobV += 1.6; }
      }
      // wobble on its foot, a hop
      E.wobV += (-70 * E.wob - 4.2 * E.wobV) * dt + (E.hot ? Math.sin(E.t * 9) * 0.6 * dt * 10 : 0);
      E.wob += E.wobV * dt;
      E.hopV -= 9 * dt; E.hop = Math.max(0, E.hop + E.hopV * dt);
      if (E.hop === 0 && E.hopV < 0) E.hopV = 0;
      E.pivot.quaternion.setFromAxisAngle(E.axis, clamp(E.wob, -1, 1) * 0.16);
      E.pivot.position.y = E.hop * 0.06;
      // smashed: gone, then a fresh egg rises out of the straw
      if (E.smash) {
        E.smash.t += dt;
        E.pivot.visible = false;
        if (!E.smash.done && E.smash.t > 0.45) { E.smash.done = true; opts.afterDelete?.(E.i); refresh(); }
        if (E.smash.t > 0.8) { E.smash = null; E.rise = 0.001; E.slotEl.classList.remove('busy'); E.main.focus({ preventScroll: true }); }
      } else E.pivot.visible = true;
      if (E.rise < 1) {
        E.rise = Math.min(1, E.rise + dt / 0.7);
        const k = E.rise;
        E.pivot.scale.setScalar(Math.max(0.001, smooth(k) * (1 + Math.sin(k * Math.PI) * 0.15)));
        E.pivot.position.y -= (1 - smooth(k)) * 0.05;
      } else E.pivot.scale.setScalar(1);
      lightSum += E.hatchedOn ? 0.5 : Math.max(0, E.cur) + E.flash;
      // the hatchling: looks about, blinks, chirps
      if (E.hatchedOn && E.baby) {
        const B = E.baby;
        E.lookT -= dt;
        if (E.lookT <= 0) { E.lookT = R(1.2, 3.4); E.look = R(-0.7, 0.7); }
        B.neck.rotation.y += (E.look - B.neck.rotation.y) * (1 - Math.exp(-dt * 5));
        B.neck.rotation.z = Math.sin(E.t * 1.3) * 0.08;
        E.blink = (E.t % 3.7) < 0.12 ? 1 : 0;
        B.eyes.scale.y = E.blink ? 0.15 : 1;
        E.chirp = Math.max(0, (E.chirp || 0) - dt);
        B.jaw.rotation.x = E.chirp > 0 ? 0.35 * Math.abs(Math.sin(E.chirp * 30)) : 0.04;
        B.hips.position.y = 2 * RVS + Math.abs(Math.sin(E.t * 2.2)) * 0.25 * RVS;
        B.arms.forEach((a, k) => { a.rotation.x = -1.3 + Math.sin(E.t * 3 + k) * 0.1 + (E.hot ? Math.sin(E.t * 14 + k) * 0.25 : 0); });
      }
    }
    warm.intensity = 0.22 + Math.min(0.7, lightSum * 0.22);
    chips.setScaleFromCamera(camera, heightPx); sparks.setScaleFromCamera(camera, heightPx);
    chips.update(dt); sparks.update(dt);
    if (!isOpen && !view.classList.contains('out')) return;
    // the DOM follows the eggs on screen
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    for (const E of eggs) {
      E.hold.updateWorldMatrix(true, true);
      const mw = E.hold.matrixWorld;
      const H = E.m.height, Rr = E.m.radius;
      const topP = project(_a.set(0, H * 1.02, 0).applyMatrix4(mw), r);
      const botP = project(_a.set(0, -0.01, Rr * 0.6).applyMatrix4(mw), r);
      const lP = project(_a.set(-Rr * 1.1, H * 0.45, 0).applyMatrix4(mw), r);
      const rP = project(_a.set(Rr * 1.1, H * 0.45, 0).applyMatrix4(mw), r);
      const cx = (lP[0] + rP[0]) / 2;
      const pad = touch ? 16 : 6;
      const w = Math.max(44, rP[0] - lP[0] + pad * 2), h = Math.max(44, botP[1] - topP[1] + pad * 2);
      E.rect = { cx, cy: (topP[1] + botP[1]) / 2, w, h, top: topP[1], bot: botP[1] };
      const key = `${Math.round(cx)},${Math.round(topP[1])},${Math.round(w)},${Math.round(h)},${Math.round(botP[1])}`;
      if (E.posKey === key) continue;
      E.posKey = key;
      E.main.style.transform = `translate(${Math.round(cx - w / 2)}px, ${Math.round(topP[1] - pad)}px)`;
      E.main.style.width = `${Math.round(w)}px`;
      E.main.style.height = `${Math.round(h)}px`;
      E.ring.style.left = `${Math.round(cx)}px`; E.ring.style.top = `${Math.round(botP[1] - 2)}px`;
      E.plaque.style.left = `${Math.round(cx)}px`; E.plaque.style.top = `${Math.round(botP[1] + 6)}px`;
      E.del.style.left = `${Math.round(rP[0] + 6)}px`; E.del.style.top = `${Math.round(topP[1] + 10)}px`;
      E.last.style.left = `${Math.round(cx)}px`; E.last.style.top = `${Math.round(topP[1] - 6)}px`;
    }
    // the bark tags behind the plaques (redrawn when a plaque's size changes)
    const px = parseFloat(getComputedStyle(view).getPropertyValue('--px')) || 2;
    for (const E of eggs) {
      const w = Math.ceil(E.plaque.offsetWidth / px), h = Math.ceil(E.plaque.offsetHeight / px);
      const k = `${w}x${h}`;
      if (!w || !h || E.tagKey === k) continue;
      E.tagKey = k;
      drawTag(E.tag, w, h, 11 + E.i * 7, E.i === 0 ? 0xffc870 : E.i === 1 ? 0xb8e070 : 0xd0a0ff);
    }
  }

  refresh();
  return {
    group, el: view, eggs, lights: [warm], materials: mats,
    get open() { return isOpen; },
    show() {
      refresh();
      isOpen = true;
      view.classList.remove('out');
      view.classList.add('on');
      view.removeAttribute('aria-hidden');
      for (const E of eggs) { E.main.tabIndex = 0; E.del.tabIndex = 0; E.posKey = ''; }
      const list = eggs.map((E) => E.info);
      const latest = list.filter((x) => x.used).sort((a, b) => (b.saved || 0) - (a.saved || 0))[0];
      const first = latest ? eggs[latest.i] : eggs.find((E) => !E.info.used) || eggs[0];
      setTimeout(() => { if (isOpen) first.main.focus({ preventScroll: true }); }, 700);
    },
    hide() {
      isOpen = false;
      view.classList.remove('on');
      view.classList.add('out');
      view.setAttribute('aria-hidden', 'true');
      for (const E of eggs) { E.main.tabIndex = -1; E.del.tabIndex = -1; E.hot = false; E.slotEl.classList.remove('hot'); }
      setTimeout(() => view.classList.remove('out'), 450);
    },
    refresh,
    shot,
    /** Debug: pretend slot i is at pct% (null to clear). */
    setFake(i, pct) { eggs[i].fake = pct == null ? null : clamp(pct, 0, 100); refresh(); eggs[i].cur = eggs[i].base; },
    /** Debug: pretend slot i has (or hasn't) hatched (null: as the save says). */
    setHatched(i, on) { eggs[i].fakeHatch = on == null ? null : !!on; refresh(); },
    /** Debug: hover egg i (or none). */
    hover(i) { for (const E of eggs) { if (E.i === i) E.main.dispatchEvent(new Event('pointerenter')); else E.main.dispatchEvent(new Event('pointerleave')); } },
    pick(i) { pick(eggs[i]); },
    step(dt = 1 / 60, n = 1) { for (let j = 0; j < n; j++) update(dt); },
    smash(i) { const E = eggs[i]; if (!E.info?.used && E.fake == null) return false; doSmash(E); return true; },
    update,
    destroy() {
      view.remove();
      unstyle();
      for (const g of geos) g.dispose();
      for (const m of mats) if (!m.userData?.caveKey) m.dispose();
      chips.geo.dispose(); chips.mat.dispose(); sparks.geo.dispose(); sparks.mat.dispose();
    },
  };
}
