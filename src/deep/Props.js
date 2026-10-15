// Cave props for the first-person underground: decoration grown procedurally on cave floors,
// walls and ceilings (deterministic from the world seed + position, so the same props come back),
// per zone (glowing mushrooms and roots up top, fossils and bones in the clay, crystal clusters
// and glow-worm threads in the grotto, obsidian, ember vents and charred timbers in the magma,
// icicles and frozen crystals in the frost, floating void shards at the core), old-miner remnants
// everywhere (rails, carts, ladders, timber props, rope, lanterns, signposts to Deep Town) and the
// harvestable cave plants cooking needs. The old miners' lifts (plan.lifts) are always dressed
// (./props/lifts.js: a dark iron cage skinned over the generator's timber cage, with its grille
// door, plank floor, lamp and name plaque; plank landings at the shaft stops), and nothing else
// grows in a lift room or in front of its cage.
//
// Built and dropped per 32³ chunk near the player within a small per-frame budget. Every prop lives
// in ONE merged, dynamically allocated vertex buffer (one draw call + its outline): each chunk owns
// a slot in it. Props whose rock is dug away fall and crumble; harvested plants regrow next day.
//
// API (DigScene): new Props(ctx) · update(dt, {player, eye, time}) · onVoxel(vx, vy, vz, old, m) ·
// lights(eye) → ≤ 3 point lights · target(eye, dir, reach) → {label, kind: 'use'} | null ·
// use(eye, dir, reach) → {loot: {id}, say?, damage?} | null · dispose() · info() (debug stats).
// Models live in ./props/models.js (builders) and ./props/grid.js (voxel grid + mesher).
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { ITEMS } from '../data/items.js';
import { CS, zoneAt } from './Generator.js';
import { VOX, M } from './materials.js';
import { OPAQUE } from './Mesher.js';
import { h3, h3i } from './noise.js';
import { LIGHT } from './TerrainMaterial.js';
import { getModel, modelCached, modelStats, modelSteps, defineModel, forgetModel } from './props/models.js';
import { key3, CB } from './World.js';
import { rng32 } from './props/grid.js';
import { liftSnapshotSteps, liftLayoutSteps } from './props/lifts.js';

const CM = CS / VOX; // chunk size in metres
const R_BUILD = 19; // build chunks whose centre is this close to the eye (m)
const R_DROP = 24;
const R_NEAR = 12; // particles + reactions
const vkey = (vx, vy, vz) => ((vx + 4096) * 8192 + (vy + 4096)) * 8192 + (vz + 4096);

// voxels props may stand on / hang from (natural rock; not the burrow, timbering, ore or crystal spikes)
const MANMADE = new Uint8Array(256);
for (const m of [M.TIMBER, M.BOARDS, M.BURROW, M.BRICK, M.DOOR, M.LANTERN, M.CRYSTAL]) MANMADE[m] = 1;
const ground = (m) => OPAQUE[m] === 1 && m < 128 && !MANMADE[m];
// placement was tuned in 1/8 m steps: VK world voxels make one such step at any voxel size
const VK = Math.max(1, Math.round(VOX / 8));
const v8 = (n) => Math.round(n * VK); // a length in 1/8 m steps → world voxels
const CELL = VOX; // a placement cell is 1 m
const CPC = Math.max(1, Math.round(CS / VOX)); // cells per chunk (per axis)
/** Voxel offsets 0, 1, -1, 2, -2, … within [lo, hi]. */
const offs = (lo, hi) => { const a = [0]; for (let k = 1; k <= Math.max(-lo, hi); k++) { if (k <= hi) a.push(k); if (-k >= lo) a.push(-k); } return a; };
const DY5 = offs(-v8(2), v8(2)); // ±1/4 m
const DY3 = offs(-v8(1), v8(1)); // ±1/8 m
const DE = offs(-v8(2), v8(3)); // wall depth offsets tried (+ = further in)
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

// ---------------------------------------------------------------- prop types
// mount: floor | ceil | wall. r: footprint radius (m); h: height (m); vars: model variants;
// hug: stands with its back to a wall (back = pivot → back distance); len: hanging length range in
// prop voxels (1/16 m); fixed: fixed hanging length (m); flat/minUp/maxUp: wall flatness (voxels) and
// height above the floor (1/8 m voxels); sway/bob: animation (m); snd: what it sounds like breaking.
const TYPES = {
  mush: { mount: 'floor', vars: 4, r: 0.48, h: 0.85, react: 'puff', snd: 'dirt', brittle: true },
  shelf: { mount: 'wall', vars: 3, r: 0.35, flat: 2, minUp: 2, maxUp: 14, snd: 'dirt', brittle: true },
  roots: { mount: 'ceil', vars: 3, len: [6, 30], r: 0.4, sway: 0.035, snd: 'dirt', brittle: true },
  vine: { mount: 'ceil', vars: 2, len: [6, 26], r: 0.3, sway: 0.045, snd: 'dirt', brittle: true },
  fossil: { mount: 'wall', vars: 3, r: 0.5, flat: 2, deep: 3, minUp: 4, maxUp: 16, snd: 'stone' },
  bones: { mount: 'floor', vars: 3, r: 0.55, h: 0.45, snd: 'stone' },
  urn: { mount: 'floor', vars: 2, r: 0.3, h: 0.7, hug: true, back: 0.26, snd: 'clay' },
  crystal: { mount: 'floor', vars: 4, r: 0.55, h: 1.8, react: 'chime', pal: true, snd: 'crystal', brittle: true },
  crystalC: { mount: 'ceil', vars: 3, fixed: 1.1, r: 0.4, react: 'chime', pal: true, snd: 'crystal', brittle: true },
  glowthread: { mount: 'ceil', vars: 2, len: [6, 22], r: 0.35, sway: 0.03, snd: 'dirt', brittle: true },
  obsidian: { mount: 'floor', vars: 3, r: 0.5, h: 1.3, snd: 'crystal' },
  vent: { mount: 'floor', vars: 2, r: 0.5, h: 0.6, snd: 'stone' },
  charred: { mount: 'floor', vars: 2, r: 0.75, h: 0.45, snd: 'wood' },
  icicle: { mount: 'ceil', vars: 3, len: [4, 20], r: 0.4, snd: 'ice', brittle: true },
  frozen: { mount: 'floor', vars: 4, r: 0.55, h: 1.8, react: 'chime', snd: 'ice', brittle: true },
  shard: { mount: 'floor', vars: 4, r: 0.25, h: 1.6, bob: 0.06, snd: 'crystal', brittle: true },
  rail: { mount: 'floor', vars: 2, r: 0.5, h: 0.2, snd: 'metal' },
  cart: { mount: 'floor', vars: 2, r: 0.55, h: 0.95, snd: 'metal' },
  ladder: { mount: 'floor', vars: 2, r: 0.3, hug: true, back: 0.02, snd: 'wood' },
  post: { mount: 'floor', vars: 2, r: 0.22, hug: true, back: 0.13, snd: 'wood' },
  rope: { mount: 'ceil', vars: 1, len: [8, 26], r: 0.12, sway: 0.03, snd: 'wood', brittle: true },
  coil: { mount: 'floor', vars: 1, r: 0.38, h: 0.3, snd: 'wood' },
  lantern: { mount: 'wall', vars: 2, r: 0.3, flat: 1, minUp: 13, maxUp: 19, sway: 0.025, snd: 'metal' },
  lanternC: { mount: 'ceil', vars: 2, r: 0.2, sway: 0.02, snd: 'metal' },
  sign: { mount: 'floor', vars: 2, r: 0.45, h: 1.4, town: true, snd: 'wood' },
  crate: { mount: 'floor', vars: 2, r: 0.36, h: 0.65, hug: true, back: 0.36, snd: 'wood' },
  barrel: { mount: 'floor', vars: 2, r: 0.32, h: 0.75, hug: true, back: 0.33, snd: 'wood' },
  pick: { mount: 'floor', vars: 1, r: 0.4, h: 0.85, hug: true, back: 0.12, snd: 'metal' },
  // the old miners' lifts (placed by liftLayout; 'custom' models are skinned from the voxels)
  cage: { mount: 'floor', vars: 1, r: 0.8, h: 2.1, model: 'custom', snd: 'metal' },
  plaque: { mount: 'wall', vars: 1, r: 0.5, snd: 'metal' },
  railing: { mount: 'floor', vars: 1, r: 0.5, h: 1, snd: 'metal' },
  deck: { mount: 'floor', vars: 1, r: 1.4, h: 0.1, snd: 'wood' },
  // harvestable plants (the type is the item id)
  glowcap: { mount: 'floor', vars: 2, r: 0.32, h: 0.6, plant: true, snd: 'dirt', brittle: true },
  cave_carrot: { mount: 'floor', vars: 2, r: 0.3, h: 0.6, plant: true, sway: 0.02, snd: 'dirt', brittle: true },
  blindfern: { mount: 'floor', vars: 2, r: 0.4, h: 0.6, plant: true, sway: 0.025, snd: 'dirt', brittle: true },
  ashfern: { mount: 'floor', vars: 2, r: 0.4, h: 0.6, plant: true, sway: 0.02, snd: 'dirt', brittle: true },
  whisperweed: { mount: 'ceil', vars: 2, fixed: 0.85, r: 0.25, plant: true, sway: 0.04, snd: 'dirt', brittle: true },
  rubber_sap: { mount: 'ceil', vars: 1, fixed: 1.1, r: 0.25, plant: true, sway: 0.025, snd: 'dirt', brittle: true },
  pepperroot: { mount: 'floor', vars: 2, r: 0.3, h: 0.55, plant: true, sway: 0.015, snd: 'dirt', brittle: true },
  sparkmoss: { mount: 'wall', vars: 2, r: 0.35, flat: 2, deep: 1, minUp: 1, maxUp: 14, plant: true, snd: 'dirt', brittle: true },
  bubblebulb: { mount: 'floor', vars: 1, r: 0.25, h: 0.8, plant: true, sway: 0.015, react: 'bloop', snd: 'dirt', brittle: true },
  crystal_lily: { mount: 'floor', vars: 2, r: 0.25, h: 0.75, plant: true, sway: 0.012, react: 'chime', snd: 'crystal', brittle: true },
  gloomshroom: { mount: 'floor', vars: 2, r: 0.32, h: 0.65, plant: true, react: 'puff', snd: 'dirt', brittle: true },
  emberbloom: { mount: 'floor', vars: 2, r: 0.25, h: 0.8, plant: true, snd: 'dirt', brittle: true },
  frostbloom: { mount: 'floor', vars: 2, r: 0.25, h: 0.65, plant: true, snd: 'ice', brittle: true },
  core_lotus: { mount: 'floor', vars: 1, r: 0.4, h: 0.45, plant: true, snd: 'dirt', brittle: true },
};

// models sized (or coloured) to where they are put
const PARAM_TYPES = new Set(['crystal', 'crystalC', 'roots', 'vine', 'glowthread', 'icicle', 'shard', 'post', 'ladder', 'rope', 'lanternC']);

// decoration per zone: [type, weight] lists + chances per 1 m cell (floor / ceiling / wall)
const DECOR = {
  1: { floor: [['mush', 6], ['post', 0.9], ['bones', 0.3], ['crate', 0.35], ['barrel', 0.25], ['pick', 0.3], ['coil', 0.25], ['ladder', 0.35], ['sign', 0.3], ['urn', 0.1]],
    ceil: [['roots', 5], ['vine', 2.5], ['rope', 0.35]], wall: [['shelf', 3], ['lantern', 1]], f: 0.13, c: 0.14, w: 0.06 },
  2: { floor: [['bones', 3], ['urn', 1], ['mush', 1.5], ['post', 1], ['crate', 0.4], ['barrel', 0.3], ['pick', 0.3], ['ladder', 0.35], ['sign', 0.3], ['coil', 0.2]],
    ceil: [['roots', 2.5], ['vine', 2], ['rope', 0.5]], wall: [['fossil', 4], ['shelf', 0.8], ['lantern', 1]], f: 0.12, c: 0.1, w: 0.12 },
  3: { floor: [['crystal', 5], ['mush', 1.2], ['post', 0.3], ['crate', 0.15], ['sign', 0.15], ['bones', 0.2]],
    ceil: [['glowthread', 3], ['crystalC', 2]], wall: [['shelf', 1], ['lantern', 0.5]], f: 0.11, c: 0.12, w: 0.035 },
  4: { floor: [['obsidian', 3], ['vent', 1.6], ['charred', 2.2], ['bones', 0.4], ['sign', 0.12]],
    ceil: [['rope', 0.3]], wall: [['lantern', 0.5]], f: 0.12, c: 0.015, w: 0.02 },
  5: { floor: [['frozen', 3], ['bones', 0.4], ['crate', 0.15], ['sign', 0.1], ['post', 0.2]],
    ceil: [['icicle', 6]], wall: [['lantern', 0.3]], f: 0.1, c: 0.16, w: 0.02 },
  6: { floor: [['shard', 4], ['obsidian', 1.2], ['crystal', 0.6]],
    ceil: [['crystalC', 1]], wall: [], f: 0.1, c: 0.04, w: 0 },
};
// the old mine's plant table (zone → mount → [item, weight]) + chances per cell: sparse finds
const PLANTS = {
  1: { floor: [['glowcap', 4], ['cave_carrot', 5], ['blindfern', 3]], ceil: [['whisperweed', 1]], wall: [], f: 0.03, c: 0.008, w: 0 },
  2: { floor: [['glowcap', 3], ['pepperroot', 3], ['cave_carrot', 2], ['blindfern', 2]], ceil: [['rubber_sap', 4], ['whisperweed', 2]], wall: [], f: 0.028, c: 0.016, w: 0 },
  3: { floor: [['bubblebulb', 3], ['gloomshroom', 2], ['glowcap', 2], ['crystal_lily', 0.8]], ceil: [['whisperweed', 1.5], ['rubber_sap', 1]], wall: [['sparkmoss', 1]], f: 0.026, c: 0.01, w: 0.012 },
  4: { floor: [['ashfern', 4], ['emberbloom', 2.5], ['pepperroot', 2], ['gloomshroom', 1]], ceil: [], wall: [['sparkmoss', 1]], f: 0.026, c: 0, w: 0.004 },
  5: { floor: [['frostbloom', 3], ['gloomshroom', 1.5], ['glowcap', 1.5]], ceil: [['whisperweed', 1]], wall: [], f: 0.024, c: 0.006, w: 0 },
  6: { floor: [['core_lotus', 0.7], ['emberbloom', 2], ['frostbloom', 1.5], ['crystal_lily', 1.5]], ceil: [['whisperweed', 1]], wall: [], f: 0.02, c: 0.005, w: 0 },
};
const CAMP = [0, 0.32, 0.26, 0.16, 0.1, 0.1, 0.05]; // chance per chunk (with room for one) of an old miners' camp
const CRYSTAL_PALS = { 3: ['violet', 'cyan', 'pink'], 6: ['violet', 'pink', 'cyan'] };

// particle emitters: spawns per second per prop
const RATE = { spore: 0.5, firefly: 0.3, glint: 0.9, mote: 0.9, vent: 7, smolder: 0.8, drip: 0.45, spark: 1.2, ember: 3, bubble: 0.3 };

function pickW(list, h) {
  let tot = 0;
  for (const e of list) tot += e[1];
  let r = h * tot;
  for (const e of list) { r -= e[1]; if (r <= 0) return e[0]; }
  return list[list.length - 1][0];
}

// ---------------------------------------------------------------- material
function propMaterial(U) {
  return new THREE.ShaderMaterial({
    // texel: the same chunky per-texel dither as the rock and other objects (texels per metre)
    uniforms: { ...U, texel: { value: 128 } },
    vertexShader: /* glsl */`
      attribute vec4 aNrm; // normal + sway weight (bytes)
      attribute vec4 aCol; // sRGB colour + glow (bytes)
      attribute vec3 aAnim; // sway (m), phase, bob (m)
      uniform float time;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vGlow;
      varying float vPh;
      varying vec3 vTex;
      void main() {
        vec3 p = position;
        vTex = position - aNrm.xyz * (0.5 / 128.0); // the texel this face is in (before any sway)
        float ph = aAnim.y, sw = aAnim.x * aNrm.w;
        p.x += sw * (sin(time * 1.3 + ph) * 0.7 + sin(time * 3.1 + ph * 1.7) * 0.3);
        p.z += sw * (cos(time * 1.1 + ph * 1.3) * 0.7 + sin(time * 2.6 + ph * 0.7) * 0.3);
        p.y += aAnim.z * sin(time * 1.2 + ph);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * aNrm.xyz);
        vColor = pow(aCol.rgb, vec3(2.2));
        vGlow = aCol.a * 1.2;
        vPh = ph;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float time;
      uniform float texel;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vGlow;
      varying float vPh;
      varying vec3 vTex;
      float h3o(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      ${LIGHT}
      void main() {
        vec3 L = lightAt(vWorld, normalize(vN));
        vec3 c = vColor;
        if (texel > 0.0) {
          vec3 q = floor(vTex * texel);
          c *= 0.82 + 0.26 * h3o(q + 3.1) + 0.12 * h3o(floor(q * 0.25) + 5.3);
        }
        float pulse = 0.82 + 0.18 * sin(time * 2.1 + vPh * 3.0);
        vec3 col = c * L + c * vGlow * pulse;
        float dist = length(vWorld - lampPos);
        // glowing bits shine a little further through the dark
        float fogK = (1.0 - exp(-pow(dist / fogDist, 2.0) * 2.2)) * (1.0 - 0.35 * min(vGlow, 1.0));
        gl_FragColor = vec4(mix(col, fogCol, fogK), 1.0);
      }`,
  });
}

// ---------------------------------------------------------------- the merged buffer
/** One big indexed mesh; chunks rent contiguous vertex + index ranges (first fit, coalescing). */
class Pool {
  constructor(mat, parent) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.layers.enable(LAYER_OUTLINE);
    this.mesh.name = 'cave-props';
    parent.add(this.mesh);
    this.capV = 0; this.capI = 0;
    this.vFree = []; this.iFree = [];
    this.live = new Set();
    this.liveI = 0;
    this.high = 0;
    this.resize(1 << 18, 3 << 17); // 8 MB up front: growing (a full copy) is a hitch
  }
  resize(capV, capI) {
    const old = this.mesh.geometry;
    const g = new THREE.BufferGeometry();
    const mk = (name, n, k, T, norm) => {
      const a = new T(n * k);
      const o = old.attributes[name];
      if (o) a.set(o.array);
      const at = new THREE.BufferAttribute(a, k, norm);
      at.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, at);
    };
    // 32 bytes a vertex: float position, byte normal + sway weight, byte sRGB colour + glow, float animation
    mk('position', capV, 3, Float32Array, false); mk('aNrm', capV, 4, Int8Array, true);
    mk('aCol', capV, 4, Uint8Array, true); mk('aAnim', capV, 3, Float32Array, false);
    const ia = new Uint32Array(capI);
    if (old.index) ia.set(old.index.array);
    g.setIndex(new THREE.BufferAttribute(ia, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    g.setDrawRange(0, this.high);
    this.mesh.geometry = g;
    old.dispose();
    this.give(this.vFree, this.capV, capV - this.capV);
    this.give(this.iFree, this.capI, capI - this.capI);
    this.capV = capV; this.capI = capI;
    this.geo = g;
  }
  take(list, n) {
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r[1] < n) continue;
      const s = r[0];
      r[0] += n; r[1] -= n;
      if (!r[1]) list.splice(i, 1);
      return s;
    }
    return -1;
  }
  give(list, s, n) {
    if (n <= 0) return;
    let i = 0;
    while (i < list.length && list[i][0] < s) i++;
    list.splice(i, 0, [s, n]);
    if (i + 1 < list.length && s + n === list[i + 1][0]) { list[i][1] += list[i + 1][1]; list.splice(i + 1, 1); }
    if (i > 0 && list[i - 1][0] + list[i - 1][1] === s) { list[i - 1][1] += list[i][1]; list.splice(i, 1); }
  }
  alloc(nv, ni) {
    for (;;) {
      const v0 = this.take(this.vFree, nv);
      const i0 = v0 >= 0 ? this.take(this.iFree, ni) : -1;
      if (v0 >= 0 && i0 >= 0) {
        const slot = { v0, nv, i0, ni, rec: null };
        this.live.add(slot);
        this.liveI += ni;
        if (i0 + ni > this.high) { this.high = i0 + ni; this.geo.setDrawRange(0, this.high); }
        return slot;
      }
      if (v0 >= 0) this.give(this.vFree, v0, nv);
      this.resize(Math.max(this.capV * 2, this.capV + nv * 2), Math.max(this.capI * 2, this.capI + ni * 2));
    }
  }
  free(slot) {
    if (!this.live.delete(slot)) return;
    this.liveI -= slot.ni;
    this.give(this.vFree, slot.v0, slot.nv);
    this.give(this.iFree, slot.i0, slot.ni);
    const idx = this.geo.index;
    idx.array.fill(0, slot.i0, slot.i0 + slot.ni);
    this.mark(idx, slot.i0, slot.ni);
    if (slot.i0 + slot.ni >= this.high) {
      this.high = 0;
      for (const s of this.live) this.high = Math.max(this.high, s.i0 + s.ni);
      this.geo.setDrawRange(0, this.high);
    }
  }
  /** The highest live slot, when the drawn index range is mostly holes (moving it down compacts). */
  topIfSparse() {
    if (this.high < 6000 || this.high < this.liveI * 1.25) return null;
    let top = null;
    for (const s of this.live) if (!top || s.i0 > top.i0) top = s;
    // only worth it if a hole below can take it
    for (const f of this.iFree) if (f[0] < top.i0 && f[1] >= top.ni) return top;
    return null;
  }
  mark(attr, start, count) {
    attr.addUpdateRange(start * attr.itemSize, count * attr.itemSize);
    attr.needsUpdate = true;
  }
  commit(slot) {
    const a = this.geo.attributes;
    for (const n of ['position', 'aNrm', 'aCol', 'aAnim']) this.mark(a[n], slot.v0, slot.nv);
    this.mark(this.geo.index, slot.i0, slot.ni);
  }
  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
  }
}

// ---------------------------------------------------------------- props
export class Props {
  constructor(ctx) {
    this.ctx = ctx;
    this.w = ctx.world;
    this.plan = ctx.plan || ctx.world.plan;
    this.U = ctx.U;
    this.fx = ctx.fx;
    this.audio = ctx.audio;
    this.state = ctx.state;
    this.scene3 = ctx.scene3 || ctx.scene;
    this.seed = (this.plan.seed | 0) || 1;
    this.W = ctx.owner?.W ?? this.plan.W ?? 10;
    this.D = ctx.owner?.D ?? this.plan.D ?? 8;
    this.mat = propMaterial(this.U);
    this.pool = new Pool(this.mat, this.scene3);
    this.built = new Map(); // chunk key → { ch, props, slot, x, y, z }
    this.support = new Map(); // voxel key → props resting on / hanging from it
    this.cageSup = new Map(); // 1/8 m cell key → lift props standing on that bit of cage timber
    this.plants = new Set();
    this.lit = new Set();
    this.dirty = new Set(); // chunks whose models just arrived (written within the frame budget)
    this.urgent = new Set(); // chunks that lost a prop (written this frame)
    this.pending = new Map();
    this.near = [];
    this.nearT = 0;
    this.queue = [];
    this.qi = 0;
    this.scanT = 0;
    this.lastCell = '';
    this.fallers = [];
    this.time = 0;
    this.age = 0;
    this.chimeT = 0;
    this.murmurT = 0;
    this.stats = { chunks: 0, props: 0, verts: 0, ms: 0, worst: 0, buildMs: 0 };
    this.lifts = this.plan.lifts || [];
    this.liftRooms = this.lifts.filter((L) => L.id[0] === 'L');
    // plan lanterns with nothing to show for them (the old passage); not the stations, lifts or the gate
    this.fixtures = this.plan.lights.filter((l) => l.lantern && !l.mouth && !this.blocked(l.x, l.y, l.z, 0));
    this.bio = this.plan.areas.filter((a) => a.item === 'bioxide');
    this.why = {};
    this.liftJob = null;
    this.stepMax = {}; // debug: slowest slice per kind of work
    this.outLights = [0, 1, 2].map(() => ({ x: 0, y: 0, z: 0, c: [0, 0, 0], r: 1, lantern: false, lava: false }));
    this.initPicked();
    // while the scene is still loading: dress the lift we arrive in (and any other close by) right away,
    // so a cage is there on the first frame and the code is warm before the first one is met on foot
    const pl = ctx.player;
    // while the scene is still loading: mesh the models this zone uses most (first meshing is the slow
    // one), so streaming in play only pays for the rarer ones
    if (pl?.pos) {
      const t0 = performance.now(), zone = zoneAt(-pl.pos.y);
      const want = [...DECOR[zone].floor.slice(0, 2), ...DECOR[zone].ceil.slice(0, 1), ...PLANTS[zone].floor.slice(0, 1)].map((e) => e[0]);
      for (const t of want) {
        if (performance.now() - t0 > 120) break;
        if (PARAM_TYPES.has(t)) continue; // sized to fit where they grow: no one variant to warm
        try { getModel(t, 0, 0); } catch (e) { /* warm-up only */ }
      }
    }
    if (pl?.pos) {
      const eye = pl.eye ? pl.eye() : pl.pos;
      for (const L of this.lifts) {
        if (Math.hypot(L.x - pl.pos.x, L.y - pl.pos.y, L.z - pl.pos.z) < 10 && this.liftReady(L)) {
          try { this.buildLift(L, eye); } catch (e) { console.warn('props: lift', e); }
        }
      }
    }
  }

  // ------------------------------------------------------------ harvest records
  initPicked() {
    const d = this.state?.data;
    if (!d || !d.deep) { this.picked = this.picked || {}; this.day = d?.day ?? 0; return; }
    this.picked = d.deep.picked = d.deep.picked || {};
    this.day = d.day ?? 0;
    for (const k of Object.keys(this.picked)) if (this.picked[k] < this.day) delete this.picked[k];
  }
  checkDay() {
    const day = this.state?.data?.day ?? 0;
    if (day === this.day) return;
    // a new day: picked spots regrow (rebuild what is loaded)
    this.initPicked();
    for (const rec of [...this.built.values()]) this.dropChunk(rec);
    this.scanT = 0;
    this.scanJob = null;
  }

  // ------------------------------------------------------------ world queries (metres, never generates)
  voxAt(x, y, z) { return this.w.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX)); }
  solid(x, y, z) { return OPAQUE[this.voxAt(x, y, z)] === 1; }
  /** Air voxels straight up from (x, y, z) until rock (max n; n + 1 if open). */
  headroom(x, y, z, n) {
    const vx = Math.floor(x * VOX), vy = Math.floor(y * VOX), vz = Math.floor(z * VOX);
    for (let k = 0; k <= n; k++) if (OPAQUE[this.w.voxelAt(vx, vy + k, vz)] === 1) return k;
    return n + 1;
  }
  depthBelow(x, y, z, n) {
    const vx = Math.floor(x * VOX), vy = Math.floor(y * VOX), vz = Math.floor(z * VOX);
    for (let k = 0; k <= n; k++) if (OPAQUE[this.w.voxelAt(vx, vy - k, vz)] === 1) return k;
    return n + 1;
  }
  /** Open space straight up / down in metres (max m; a bit more if open). */
  headM(x, y, z, m) { return this.headroom(x, y, z, Math.ceil(m * VOX)) / VOX; }
  depthM(x, y, z, m) { return this.depthBelow(x, y, z, Math.ceil(m * VOX)) / VOX; }

  /** Places no prop may go: the burrow, tunnel mouths, the lift shaft and its stations, the town gate. */
  blocked(x, y, z, pad = 0.3) {
    const P = this.plan;
    if (x > -0.7 - pad && x < this.W + 0.7 + pad && z > -0.7 - pad && z < this.D + 0.7 + pad && y > -0.6 - pad && y < 3.6 + pad) return true;
    for (const m of P.mouths) {
      const b = m.bb || [m.x0, m.y0, m.z0, m.x1, m.y1, m.z1];
      if (x > b[0] - pad && x < b[3] + pad && y > b[1] - pad && y < b[4] + pad && z > b[2] - pad && z < b[5] + pad) return true;
    }
    const sh = P.shaft;
    if (Math.hypot(x - sh.x, z - sh.z) < 1.9 + pad && y < P.town.y + 4) return true;
    for (const s of P.stations) if (x > s.x - 1.9 - pad && x < s.x + 1.9 + pad && y > s.y - 0.4 - pad && y < s.y + 2.6 + pad && z > s.z - 1.7 - pad && z < s.z + 1.7 + pad) return true;
    const T = P.town;
    if (Math.hypot(x - (T.x + 1.6), y - T.y, z - (T.z - 1.2)) < 3.6 + pad) return true;
    // the old lifts: their rooms, the shaft over them, and the way out of the cage (toward +z)
    for (const L of this.liftRooms || []) {
      if (x > L.x - 1.7 - pad && x < L.x + 1.7 + pad && z > L.z - 1.7 - pad && z < L.z + 3.2 + pad && y > L.y - 0.5 - pad && y < L.y + 7 + pad) return true;
    }
    return false;
  }

  /** Floor footprint: the floor under every sample within ±2 voxels of the anchor (caves are rough: a
   * little embedding or a one-voxel gap at the rim is fine, a cliff or a wall is not), then headroom. */
  fitFloor(x, y, z, r, h) {
    const w = this.w, vy = Math.floor(y * VOX);
    let off = 0;
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * Math.PI * 2, rr = k === 6 ? 0 : r;
      const vx = Math.floor((x + Math.cos(a) * rr) * VOX), vz = Math.floor((z + Math.sin(a) * rr) * VOX);
      let fd = 99;
      for (const dy of DY5) if (OPAQUE[w.voxelAt(vx, vy + dy - 1, vz)] === 1 && OPAQUE[w.voxelAt(vx, vy + dy, vz)] !== 1) { fd = dy; break; }
      if (fd === 99) { this.no('ffCliff'); return false; }
      if (k === 6 && fd !== 0) { this.no('ffCenter'); return false; }
      off += (fd / VK) * (fd / VK);
    }
    if (off > 8) { this.no('ffRough'); return false; }
    for (let yy = y + 0.31; yy < y + h; yy += 0.25) {
      if (this.solid(x, yy, z)) { this.no('ffHead'); return false; }
      if (r > 0.25 && (this.solid(x + r * 0.5, yy, z) || this.solid(x - r * 0.5, yy, z) || this.solid(x, yy, z + r * 0.5) || this.solid(x, yy, z - r * 0.5))) { this.no('ffHead2'); return false; }
    }
    return true;
  }
  fitCeil(x, y, z, r) {
    const w = this.w, vy = Math.floor(y * VOX); // the ceiling voxel
    let off = 0;
    for (let k = 0; k <= 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4, rr = k === 4 ? 0 : r;
      const vx = Math.floor((x + Math.cos(a) * rr) * VOX), vz = Math.floor((z + Math.sin(a) * rr) * VOX);
      let fd = 99;
      for (const dy of DY5) if (OPAQUE[w.voxelAt(vx, vy + dy, vz)] === 1 && OPAQUE[w.voxelAt(vx, vy + dy - 1, vz)] !== 1) { fd = dy; break; }
      if (fd === 99) { this.no('fcCliff'); return false; }
      if (k === 4 && fd !== 0) { this.no('fcCenter'); return false; }
      off += (fd / VK) * (fd / VK);
    }
    if (off > 6) this.no('fcRough');
    return off <= 6;
  }
  /** Is the floor area free of other props? */
  free(c, x, z, r) {
    for (const o of c.occ) if ((o[0] - x) ** 2 + (o[1] - z) ** 2 < (o[2] + r) ** 2 * 0.8) return false;
    return true;
  }

  /** Rejection counter (debug: props.why). */
  no(k) { this.why[k] = (this.why[k] || 0) + 1; return null; }

  // ------------------------------------------------------------ placement (one chunk)
  place(rec) {
    const ch = rec.ch, w = this.w, S = this.seed;
    // a virtual chunk is solid rock through and through: nothing can stand in it
    if (ch.virtual || !ch.vox) return;
    const X0 = ch.cx * CS, Y0 = ch.cy * CS, Z0 = ch.cz * CS;
    const vox = ch.vox, ed = w.edits.get(ch.key), M1 = CS - 1;
    const inside = (lx, ly, lz) => lx >= 0 && ly >= 0 && lz >= 0 && lx < CS && ly < CS && lz < CS;
    const at = (lx, ly, lz) => (inside(lx, ly, lz) ? vox[lx + CS * (ly + CS * lz)] : w.voxelAt(X0 + lx, Y0 + ly, Z0 + lz));
    // the player's own tunnels stay bare (props only grow on the cave as it was generated)
    const fresh = (lx, ly, lz) => {
      if (inside(lx, ly, lz)) return !ed || !ed.has(lx + CS * (ly + CS * lz));
      const vx = X0 + lx, vy = Y0 + ly, vz = Z0 + lz;
      const e2 = w.edits.get(key3(vx >> CB, vy >> CB, vz >> CB));
      return !e2 || !e2.has((vx & M1) + CS * ((vy & M1) + CS * (vz & M1)));
    };
    // reads stay within the chunk and its (loaded) neighbours, so placement never depends on what else is loaded
    const reach = (lx, ly, lz) => lx >= -CS && ly >= -CS && lz >= -CS && lx < 2 * CS && ly < 2 * CS && lz < 2 * CS;
    const c = { rec, X0, Y0, Z0, at, fresh, reach, occ: [] };

    // fast reject: a chunk of solid rock all through has no open voxels for a prop to stand in
    let open = false;
    for (let i = 0; i < vox.length && !open; i += 5) if (vox[i] === 0) open = true;
    if (!open && !this.fixturesIn(c).length) return;

    for (const l of this.fixturesIn(c)) this.placeFixture(c, l);
    // camps are decided per 4 m block (the chunk at its low corner owns it), as with 4 m chunks
    const B = Math.max(1, Math.round(4 / CM)), md = (a) => ((a % B) + B) % B;
    if (!md(ch.cx) && !md(ch.cy) && !md(ch.cz)) {
      const bx = Math.floor(ch.cx / B), by = Math.floor(ch.cy / B), bz = Math.floor(ch.cz / B);
      const czone = zoneAt(-((by + 0.5) * 4));
      if (h3(bx, by, bz, S + 501) < CAMP[czone]) this.placeCamp(c, czone, bx, by, bz, B * CS);
    }

    for (let cz = 0; cz < CPC; cz++) for (let cy = 0; cy < CPC; cy++) for (let cx = 0; cx < CPC; cx++) {
      const gx = ch.cx * CPC + cx, gy = ch.cy * CPC + cy, gz = ch.cz * CPC + cz;
      const zone = zoneAt(-((Y0 + cy * CELL + CELL / 2) / VOX));
      const Dz = DECOR[zone], Pz = PLANTS[zone];
      const hf = h3(gx, gy, gz, S + 101), hp = h3(gx, gy, gz, S + 103);
      if (hf < Dz.f || hp < Pz.f) {
        const sp = this.findFloor(c, cx, cy, cz, gx, gy, gz);
        this.no(sp ? 'floorFound' : 'floorNone');
        if (sp) {
          let done = false;
          if (hf < Dz.f) done = !!this.tryFloor(c, pickW(Dz.floor, h3(gx, gy, gz, S + 131)), sp, gx, gy, gz, zone);
          if (!done && hp < Pz.f && Pz.floor.length) this.tryFloor(c, pickW(Pz.floor, h3(gx, gy, gz, S + 137)), sp, gx, gy, gz, zone);
        }
      }
      const hc = h3(gx, gy, gz, S + 107), hq = h3(gx, gy, gz, S + 109);
      if ((hc < Dz.c && Dz.ceil.length) || (hq < Pz.c && Pz.ceil.length)) {
        const sp = this.findCeil(c, cx, cy, cz, gx, gy, gz);
        this.no(sp ? 'ceilFound' : 'ceilNone');
        if (sp) {
          let done = false;
          if (hc < Dz.c && Dz.ceil.length) done = !!this.tryCeil(c, pickW(Dz.ceil, h3(gx, gy, gz, S + 139)), sp, gx, gy, gz, zone);
          if (!done && hq < Pz.c && Pz.ceil.length) this.tryCeil(c, pickW(Pz.ceil, h3(gx, gy, gz, S + 149)), sp, gx, gy, gz, zone);
        }
      }
      const hw = h3(gx, gy, gz, S + 113), hx = h3(gx, gy, gz, S + 127);
      // sparkmoss crowds round bioxide
      let pw = Pz.w, wl = Pz.wall;
      if ((zone === 3 || zone === 4) && this.bio.length) {
        const mx = (gx + 0.5) * 1, my = (gy + 0.5) * 1, mz = (gz + 0.5) * 1;
        for (const a of this.bio) if (Math.hypot(a.x - mx, a.y - my, a.z - mz) < a.r + 2.5) { pw = 0.12; wl = [['sparkmoss', 1]]; break; }
      }
      if ((hw < Dz.w && Dz.wall.length) || (hx < pw && wl.length)) {
        const sp = this.findWall(c, cx, cy, cz, gx, gy, gz);
        this.no(sp ? 'wallFound' : 'wallNone');
        if (sp) {
          let done = false;
          if (hw < Dz.w && Dz.wall.length) done = !!this.tryWall(c, pickW(Dz.wall, h3(gx, gy, gz, S + 151)), sp, gx, gy, gz, zone);
          if (!done && hx < pw && wl.length) this.tryWall(c, pickW(wl, h3(gx, gy, gz, S + 157)), sp, gx, gy, gz, zone);
        }
      }
    }
  }

  /** A spot inside a 1 m cell (keeping clear of its edges), from a hash. */
  cellPos(cc, h) { return cc * CELL + Math.floor((0.125 + h * 0.75) * CELL); }
  /** Open voxels above (dir 1) or below (dir -1) a spot, a quarter metre's worth. */
  clear(c, lx, ly, lz, dir) {
    for (let k = 1; k <= v8(2); k++) if (c.at(lx, ly + dir * k, lz) !== 0) return false;
    return true;
  }
  findFloor(c, cx, cy, cz, gx, gy, gz) {
    const lx = this.cellPos(cx, h3(gx, gy, gz, this.seed + 211)), lz = this.cellPos(cz, h3(gx, gy, gz, this.seed + 223));
    for (let ly = cy * CELL + CELL - 1; ly >= cy * CELL; ly--) {
      if (c.at(lx, ly, lz) !== 0) continue;
      if (!ground(c.at(lx, ly - 1, lz))) continue;
      if (!this.clear(c, lx, ly, lz, 1)) return null;
      if (!c.fresh(lx, ly, lz)) return null;
      return { lx, ly, lz };
    }
    return null;
  }
  findCeil(c, cx, cy, cz, gx, gy, gz) {
    const lx = this.cellPos(cx, h3(gx, gy, gz, this.seed + 227)), lz = this.cellPos(cz, h3(gx, gy, gz, this.seed + 229));
    for (let ly = cy * CELL; ly <= cy * CELL + CELL - 1; ly++) {
      if (c.at(lx, ly, lz) !== 0) continue;
      if (!ground(c.at(lx, ly + 1, lz))) continue;
      if (!this.clear(c, lx, ly, lz, -1)) return null;
      if (!c.fresh(lx, ly, lz)) return null;
      return { lx, ly, lz };
    }
    return null;
  }
  findWall(c, cx, cy, cz, gx, gy, gz) {
    const S = this.seed;
    const lx = this.cellPos(cx, h3(gx, gy, gz, S + 233)), lz = this.cellPos(cz, h3(gx, gy, gz, S + 239));
    const ly = this.cellPos(cy, h3(gx, gy, gz, S + 241));
    if (c.at(lx, ly, lz) !== 0) return null;
    const d0 = Math.floor(h3(gx, gy, gz, S + 251) * 4);
    for (const dd of [0, 1, 2]) {
      const d = d0 ^ dd; // the hashed side, the opposite one, then a perpendicular
      const dx = d === 0 ? 1 : d === 1 ? -1 : 0, dz = d === 2 ? 1 : d === 3 ? -1 : 0;
      for (let k = 1; k <= v8(7); k++) {
        const m = c.at(lx + dx * k, ly, lz + dz * k);
        if (m === 0) continue;
        if (!ground(m)) break;
        const ax = lx + dx * (k - 1), az = lz + dz * (k - 1);
        if (!c.fresh(ax, ly, az)) break;
        return { lx: ax, ly, lz: az, dx, dz };
      }
    }
    return null;
  }

  /** Slide a floor spot downhill (2-voxel steps, inside the chunk) so props sit in the dips, where
   * floors are flattest; ceiling spots slide up to the crown of the arch. */
  settle(c, sp, up) {
    let { lx, ly, lz } = sp;
    for (let it = 0; it < 4; it++) {
      let best = null;
      for (const [dx, dz] of N8) {
        const x = lx + dx * v8(2), z = lz + dz * v8(2);
        if (x < 0 || z < 0 || x >= CS || z >= CS) continue;
        for (const dy of DY5) {
          const y = ly + dy;
          if (up ? c.at(x, y, z) === 0 && ground(c.at(x, y + 1, z)) && c.at(x, y - 1, z) === 0 : c.at(x, y, z) === 0 && ground(c.at(x, y - 1, z)) && c.at(x, y + 1, z) === 0) {
            if (up ? y > (best ? best.ly : ly) : y < (best ? best.ly : ly)) best = { lx: x, ly: y, lz: z };
            break;
          }
        }
      }
      if (!best) break;
      lx = best.lx; ly = best.ly; lz = best.lz;
    }
    if (!c.fresh(lx, ly, lz)) return sp;
    return { lx, ly, lz };
  }

  /** The nearest wall beside a floor spot (within 5/8 m): {dx, dz, k} (k in voxels). */
  nearWall(c, sp, first) {
    let best = null;
    const order = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const h1 = v8(2), h2 = v8(5);
    for (let i = 0; i < 4; i++) {
      const [dx, dz] = order[(i + first) & 3];
      for (let k = 1; k <= v8(5); k++) {
        const x = sp.lx + dx * k, z = sp.lz + dz * k;
        if (OPAQUE[c.at(x, sp.ly + h1, z)] === 1 && OPAQUE[c.at(x, sp.ly + h2, z)] === 1) {
          if (!best || k < best.k) best = { dx, dz, k };
          break;
        }
        // the floor drops away (an eighth of a metre or more)
        let drop = OPAQUE[c.at(x, sp.ly, z)] !== 1;
        for (let q = 1; q <= VK && drop; q++) if (OPAQUE[c.at(x, sp.ly - q, z)] === 1) drop = false;
        if (drop) break;
      }
    }
    return best;
  }

  paletteFor(zone, h) {
    const list = CRYSTAL_PALS[zone] || CRYSTAL_PALS[3];
    return list[Math.floor(h * list.length) % list.length];
  }

  tryFloor(c, type, sp, gx, gy, gz, zone, o = {}) {
    const T = TYPES[type];
    if (!T) return null;
    const r = rng32(h3i(gx, gy, gz, this.seed + 307 + type.length * 13));
    if (o.x === undefined && !T.hug) sp = this.settle(c, sp, false);
    let x = o.x ?? (c.X0 + sp.lx + 0.5) / VOX + (r() - 0.5) * 0.6 / VOX; // a nudge, staying over the same voxel
    const y = o.y ?? (c.Y0 + sp.ly) / VOX;
    let z = o.z ?? (c.Z0 + sp.lz + 0.5) / VOX + (r() - 0.5) * 0.6 / VOX;
    let yaw = o.yaw ?? r() * Math.PI * 2;
    let v = o.v ?? Math.floor(r() * T.vars);
    let fr = T.r * (T.hug ? 0.45 : 0.7), occR = T.r;
    if (T.hug && !o.x) {
      const wl = this.nearWall(c, sp, Math.floor(r() * 4));
      if (!wl) return this.no('nowall');
      if (wl.dx) x = (c.X0 + sp.lx + 0.5 + wl.dx * (wl.k - 0.5)) / VOX - wl.dx * T.back;
      else z = (c.Z0 + sp.lz + 0.5 + wl.dz * (wl.k - 0.5)) / VOX - wl.dz * T.back;
      yaw = Math.atan2(-wl.dx, -wl.dz) + (type === 'ladder' || type === 'post' ? 0 : (r() - 0.5) * 0.35);
    } else if (T.town && o.yaw === undefined) {
      const tw = this.plan.town;
      yaw = Math.atan2(-(tw.z - z), tw.x - x) + (r() - 0.5) * 0.25;
    }
    if (!o.fixture && this.blocked(x, y, z, T.r + 0.15)) return this.no('blockedF');
    if (!o.noOcc && !this.free(c, x, z, occR)) return this.no('occ');
    let param = 0, h = T.h || 0.5;
    const y1 = y + 0.5 / VOX; // inside the first open voxel
    if (type === 'post') {
      const up = this.headM(x, y1, z, 3.25);
      if (up < 1 || up > 3) return this.no('postH');
      param = Math.round(up * 16); h = up - 0.1;
    } else if (type === 'ladder') {
      const up = this.headM(x, y1, z, 3);
      param = Math.min(36, Math.floor((up * 16 - 4) / 4) * 4, 20 + Math.floor(r() * 4) * 4);
      if (param < 16) return this.no('ladderH');
      h = param / 16;
    } else if (type === 'shard') {
      param = 6 + Math.floor(r() * 10);
      h = (param + 16) / 16;
    } else if (type === 'crystal' || type === 'frozen') {
      // the big clusters where there is room for them, small ones elsewhere
      if (type === 'crystal') param = this.paletteFor(zone, r());
      const big = v % 2 === 0 && this.headM(x, y1, z, 2.25) >= 2;
      v = big ? v - (v % 2) : v | 1;
      h = big ? 1.8 : 0.95; fr = big ? 0.38 : 0.24; occR = big ? 0.55 : 0.35;
    }
    if (!o.loose && !this.fitFloor(x, y, z, fr, h)) return this.no('fitFloor');
    if (o.loose && (!this.solid(x, y - 0.5 / VOX, z) || this.solid(x, y + 0.19, z))) return null;
    const vx = Math.floor(x * VOX), vy = Math.floor(y * VOX) - 1, vz = Math.floor(z * VOX);
    const p = this.make(c, type, v, param, x, y, z, yaw, 'floor', vx, vy, vz, r(), o);
    if (!p) return null;
    if (!o.noOcc) c.occ.push([x, z, occR]);
    // void shards come in little flocks
    if (type === 'shard' && !o.flock) {
      const n = 1 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2, d = 0.45 + r() * 0.5;
        this.tryFloor(c, 'shard', sp, gx + k * 31 + 1, gy, gz, zone, { x: x + Math.cos(a) * d, z: z + Math.sin(a) * d, y: this.floorNear(x + Math.cos(a) * d, y, z + Math.sin(a) * d), flock: true, noOcc: true, loose: true });
      }
    }
    return p;
  }
  /** Floor height near y at (x, z) (within a quarter metre), or NaN. */
  floorNear(x, y, z) {
    const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX), vy = Math.round(y * VOX), w = this.w;
    for (const k of DY5) {
      if (OPAQUE[w.voxelAt(vx, vy + k, vz)] !== 1 && OPAQUE[w.voxelAt(vx, vy + k - 1, vz)] === 1) return (vy + k) / VOX;
    }
    return NaN;
  }

  tryCeil(c, type, sp, gx, gy, gz, zone, o = {}) {
    const T = TYPES[type];
    if (!T) return null;
    const r = rng32(h3i(gx, gy, gz, this.seed + 401 + type.length * 17));
    if (o.x === undefined) sp = this.settle(c, sp, true);
    const x = o.x ?? (c.X0 + sp.lx + 0.5) / VOX + (r() - 0.5) * 0.6 / VOX;
    const y = o.y ?? (c.Y0 + sp.ly + 1) / VOX;
    const z = o.z ?? (c.Z0 + sp.lz + 0.5) / VOX + (r() - 0.5) * 0.6 / VOX;
    const v = o.v ?? Math.floor(r() * T.vars);
    const fd = this.depthM(x, y - 0.5 / VOX, z, 5);
    let param = o.param ?? 0, L;
    if (o.param !== undefined) L = (param + 8) / 16;
    else if (T.len) {
      const maxL = Math.min(T.len[1], Math.floor((fd - 0.35) * 16));
      if (maxL < T.len[0]) return this.no('lenC');
      param = Math.max(T.len[0], Math.min(maxL, Math.round((T.len[0] + r() * (maxL - T.len[0])) / 4) * 4));
      L = param / 16;
    } else {
      L = T.fixed || 0.6;
      if (fd < L + 0.4) return this.no('fixedC');
      if (type === 'crystalC') param = this.paletteFor(zone, r());
    }
    if (!o.fixture && (this.blocked(x, y, z, T.r + 0.1) || this.blocked(x, y - L, z, T.r + 0.1))) return this.no('blockedC');
    if (!o.fixture && !this.fitCeil(x, y, z, T.r * 0.6)) return this.no('fitCeil');
    const p = this.make(c, type, v, param, x, y, z, r() * Math.PI * 2, 'ceil', Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX), r(), o);
    if (p) p.fall = fd;
    return p;
  }

  tryWall(c, type, sp, gx, gy, gz, zone, o = {}) {
    const T = TYPES[type];
    if (!T) return null;
    const r = rng32(h3i(gx, gy, gz, this.seed + 503 + type.length * 19));
    const { lx, ly, lz, dx, dz } = sp;
    const tx = dz ? 1 : 0, tz = dx ? 1 : 0; // along the wall
    let lo = 0, sup = 0; // where the face sits (its most protruding part) / the rock right behind its middle
    if (!o.fixture) {
      // the rock face behind the prop: sample its depth over the prop's face; it may be ragged by
      // up to T.deep voxels (each model reaches that far back into the wall) and the prop sits on
      // its most protruding part
      const f = v8(T.flat || 1), deep = v8(T.deep || 1);
      let mn = 9, mx = -9;
      for (let t = -f; t <= f; t += f) for (let u = -f; u <= f; u += f) {
        let hit = 99;
        for (const e of DE) {
          if (ground(c.at(lx + dx * (1 + e) + tx * t, ly + u, lz + dz * (1 + e) + tz * t)) && c.at(lx + dx * e + tx * t, ly + u, lz + dz * e + tz * t) === 0) { hit = e; break; }
        }
        if (hit === 99) return this.no('flatW');
        if (hit < mn) mn = hit;
        if (hit > mx) mx = hit;
        if (t === 0 && u === 0) sup = hit;
      }
      if (mx - mn > deep) return this.no('flatW2');
      lo = mn;
      let up = 0;
      const maxUp = v8(T.maxUp), minUp = v8(T.minUp);
      while (up <= maxUp && c.at(lx + dx * lo, ly - up - 1, lz + dz * lo) === 0) up++;
      if (up < minUp || up > maxUp) return this.no('upW');
    }
    const jt = (r() - 0.5) * 0.08;
    const x = dx ? (c.X0 + lx + 0.5 + dx * (lo + 0.5)) / VOX : (c.X0 + lx + 0.5) / VOX + jt;
    const z = dz ? (c.Z0 + lz + 0.5 + dz * (lo + 0.5)) / VOX : (c.Z0 + lz + 0.5) / VOX + jt;
    const y = (c.Y0 + ly + 0.5) / VOX;
    const nx = -dx, nz = -dz;
    if (!o.fixture && this.blocked(x + nx * 0.2, y, z + nz * 0.2, T.r + 0.1)) return this.no('blockedW');
    const v = o.v ?? Math.floor(r() * T.vars);
    const p = this.make(c, type, v, 0, x, y, z, Math.atan2(nx, nz), 'wall', c.X0 + lx + dx * (1 + sup), c.Y0 + ly, c.Z0 + lz + dz * (1 + sup), r(), o);
    if (p) { p.nx = nx; p.nz = nz; }
    return p;
  }

  /** Plan lanterns (lights with nothing to show for them) inside this chunk. */
  fixturesIn(c) {
    const x0 = c.X0 / VOX, y0 = c.Y0 / VOX, z0 = c.Z0 / VOX;
    return this.fixtures.filter((l) => l.x >= x0 && l.x < x0 + CM && l.y >= y0 && l.y < y0 + CM && l.z >= z0 && l.z < z0 + CM);
  }
  placeFixture(c, l) {
    // hang it from the ceiling above the light if there is one close enough, else from a wall
    const up = this.headroom(l.x, l.y, l.z, v8(22));
    const hv = Math.floor(l.x * 13 + l.z * 7) & 1;
    if (up <= v8(21)) {
      const yc = (Math.floor(l.y * VOX) + up) / VOX;
      const L = Math.max(1, Math.min(30, Math.round((yc - l.y) * 16 - 5.5)));
      const p = this.tryCeil(c, 'lanternC', null, Math.floor(l.x), Math.floor(l.y), Math.floor(l.z), 1, { x: l.x, y: yc, z: l.z, v: hv, param: L, fixture: true, noLight: true });
      if (p) return;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const vx = Math.floor(l.x * VOX), vy = Math.floor(l.y * VOX) + v8(3), vz = Math.floor(l.z * VOX);
      for (let k = 1; k <= v8(10); k++) {
        if (OPAQUE[this.w.voxelAt(vx + dx * k, vy, vz + dz * k)] !== 1) continue;
        const sp = { lx: vx + dx * (k - 1) - c.X0, ly: vy - c.Y0, lz: vz + dz * (k - 1) - c.Z0, dx, dz };
        if (this.tryWall(c, 'lantern', sp, vx, vy, vz, 1, { fixture: true, noLight: true, v: hv })) return;
        break;
      }
    }
  }

  /**
   * An old miners' camp: a run of rails, a cart, bits of gear by the walls, a sign to Deep Town.
   * Laid out over a 4 m block (BS voxels a side) from the owning chunk's corner.
   */
  placeCamp(c, zone, bx, by, bz, BS) {
    const S = this.seed;
    const r = rng32(h3i(bx, by, bz, S + 601));
    const hx = bx * 4, hy = by * 4, hz = bz * 4; // hash seeds for the camp's pieces
    // stay where the world is surely loaded (this chunk and its neighbours), with room for the checks round each piece
    const lo = Math.max(1, -CS + v8(6)), hi = Math.min(BS - 2, 2 * CS - v8(7));
    this.no('campTry');
    for (let tries = 0; tries < 20; tries++) {
      const lx = v8(4) + Math.floor(r() * v8(24)), lz = v8(4) + Math.floor(r() * v8(24));
      let ly = -1;
      for (let y = hi; y >= lo; y--) {
        if (c.at(lx, y, lz) === 0 && ground(c.at(lx, y - 1, lz)) && c.fresh(lx, y, lz)) {
          let open = true;
          for (let k = 1; k <= VOX; k++) if (c.at(lx, y + k, lz) !== 0) { open = false; break; }
          if (open) { ly = y; break; }
        }
      }
      if (ly < 0) { this.no('campNoFloor'); continue; }
      const alongX = r() < 0.5;
      const ax = alongX ? 1 : 0, az = alongX ? 0 : 1;
      const yaw = alongX ? 0 : -Math.PI / 2;
      // rail segments 1 m apart while the floor stays level (±1/8 m)
      const segs = [];
      for (const dir of [1, -1]) {
        let fby = ly;
        for (let k = dir === 1 ? 0 : 1; k < 4; k++) {
          const sx = lx + ax * VOX * k * dir, sz = lz + az * VOX * k * dir;
          if (sx < lo || sz < lo || sx > hi || sz > hi) break;
          let fy = -1;
          for (const dy of DY3) if (c.at(sx, fby + dy, sz) === 0 && ground(c.at(sx, fby + dy - 1, sz)) && this.clear(c, sx, fby + dy, sz, 1)) { fy = fby + dy; break; }
          if (fy < 0 || !c.fresh(sx, fy, sz)) break;
          const x = (c.X0 + sx + 0.5) / VOX, y = (c.Y0 + fy) / VOX, z = (c.Z0 + sz + 0.5) / VOX;
          if (this.blocked(x, y, z, 0.8)) break;
          const end = (sg) => this.solid(x + ax * 0.45 * sg, y - 0.5 / VOX, z + az * 0.45 * sg) || this.solid(x + ax * 0.45 * sg, y - 0.19, z + az * 0.45 * sg);
          if (!end(1) || !end(-1)) break;
          // the sleepers rest on the highest bumps under them (never buried in the floor)
          let top = y;
          for (const t of [-0.4, -0.2, 0.2, 0.4]) {
            for (let q = v8(1); q >= 1; q--) {
              if (this.solid(x + ax * t, y + (q - 0.5) / VOX, z + az * t) && !this.solid(x + ax * t, y + 0.19, z + az * t)) { top = Math.max(top, y + q / VOX); break; }
            }
          }
          segs.push({ x, y: top, z, sx, sz, fy });
          fby = fy;
        }
      }
      if (segs.length < 2) { this.no('campShort'); continue; }
      this.no('campOk');
      for (const sg of segs) {
        const v = r() < 0.2 ? 1 : 0;
        this.make(c, 'rail', v, 0, sg.x, sg.y, sg.z, yaw, 'floor', Math.floor(sg.x * VOX), Math.floor(sg.y * VOX) - 1, Math.floor(sg.z * VOX), r());
      }
      const mid = segs[Math.floor(r() * segs.length)];
      if (r() < 0.55 && this.headM(mid.x, mid.y + 0.5 / VOX, mid.z, 1.25) >= 1.12) {
        this.make(c, 'cart', 0, 0, mid.x, mid.y, mid.z, yaw + (r() < 0.5 ? Math.PI : 0), 'floor', Math.floor(mid.x * VOX), Math.floor(mid.y * VOX) - 1, Math.floor(mid.z * VOX), r());
        c.occ.push([mid.x, mid.z, 0.6]);
      } else {
        // tipped over beside the track, its load spilt
        const side = r() < 0.5 ? 1 : -1;
        const x = mid.x + az * 1.0 * side, z = mid.z + ax * 1.0 * side;
        const fy = this.floorNear(x, mid.y, z);
        if (fy === fy && this.fitFloor(x, fy, z, 0.45, 0.8) && !this.blocked(x, fy, z, 0.7)) {
          this.make(c, 'cart', 1, 0, x, fy, z, Math.atan2(az * side, ax * side) + (r() - 0.5) * 0.6, 'floor', Math.floor(x * VOX), Math.floor(fy * VOX) - 1, Math.floor(z * VOX), r());
          c.occ.push([x, z, 0.65]);
        }
      }
      for (const sg of segs) c.occ.push([sg.x, sg.z, 0.35]);
      // a sign at the end of the track
      const end = segs[segs.length - 1];
      const sx = end.x - az * 0.7, sz = end.z + ax * 0.7;
      const sy = this.floorNear(sx, end.y, sz);
      if (sy === sy) this.tryFloor(c, 'sign', { lx: end.sx, ly: end.fy, lz: end.sz }, hx, hy + 1, hz, zone, { x: sx, y: sy, z: sz });
      // gear by the walls round about
      const gear = ['crate', 'barrel', 'post', 'pick', 'coil', 'ladder', 'crate', 'post'];
      for (let k = 0; k < 6; k++) {
        const qx = Math.max(lo, Math.min(hi, lx + Math.round((r() - 0.5) * v8(22)))), qz = Math.max(lo, Math.min(hi, lz + Math.round((r() - 0.5) * v8(22))));
        let qy = -1;
        for (let y = Math.min(hi - 1, ly + v8(6)); y >= Math.max(lo, ly - v8(6)); y--) if (c.at(qx, y, qz) === 0 && ground(c.at(qx, y - 1, qz)) && c.at(qx, y + 1, qz) === 0) { qy = y; break; }
        if (qy < 0 || !c.fresh(qx, qy, qz)) continue;
        this.tryFloor(c, gear[Math.floor(r() * gear.length)], { lx: qx, ly: qy, lz: qz }, hx + k, hy + 7, hz - k, zone);
      }
      // and a lantern on a wall
      for (let k = 0; k < 4; k++) {
        const d = (k + Math.floor(r() * 4)) & 3;
        const dx = d === 0 ? 1 : d === 1 ? -1 : 0, dz = d === 2 ? 1 : d === 3 ? -1 : 0;
        const wy = ly + v8(13) + Math.floor(r() * v8(3));
        if (wy > hi + CS - 2) continue;
        let found = null;
        for (let j = 1; j <= v8(24); j++) {
          const qx = lx + dx * j, qz = lz + dz * j;
          if (!c.reach(qx + dx * v8(4), wy, qz + dz * v8(4))) break;
          const m = c.at(qx, wy, qz);
          if (m === 0) continue;
          if (ground(m)) found = { lx: qx - dx, ly: wy, lz: qz - dz, dx, dz };
          break;
        }
        if (found && this.tryWall(c, 'lantern', found, hx + k, hy + 9, hz, zone)) break;
      }
      return;
    }
  }

  /** Create a prop record (world transform, light, emitter, supports). */
  make(c, type, v, param, x, y, z, yaw, mount, svx, svy, svz, h = 0.5, o = {}) {
    const T = TYPES[type];
    if (!T) return null;
    if (y !== y || x !== x || z !== z) return null;
    const key = type + '@' + svx + ',' + svy + ',' + svz;
    if (T.plant && this.picked[key] !== undefined) return null;
    const hh = T.h || 0.5;
    const p = {
      type, v, param, m: null, x, y, z, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), mount, key,
      item: T.plant ? type : null,
      phase: h * Math.PI * 2 * 7.3,
      sway: T.sway || 0, bob: T.bob || 0,
      rec: c.rec, sup: [vkey(svx, svy, svz)], supMain: vkey(svx, svy, svz), lost: 0,
      // rough bounds until the model is meshed (finalize)
      cx: x, cy: mount === 'ceil' ? y - 0.3 : y + hh * 0.5, cz: z, rad: T.r,
      top: mount === 'ceil' ? y : y + hh, bot: mount === 'ceil' ? y - 0.6 : y - 0.05,
      react: T.react || null, cool: 0, gone: false, fixture: !!o.fixture, noLight: !!o.noLight,
      light: null, emit: null, mtype: T.model || type, lift: !!o.lift,
    };
    // big things rest on more than one voxel
    if (mount === 'floor' && T.r >= 0.45) {
      const rr = T.r * 0.5;
      for (const [ox, oz] of [[rr, 0], [-rr, 0], [0, rr], [0, -rr]]) p.sup.push(vkey(Math.floor((x + ox) * VOX), svy, Math.floor((z + oz) * VOX)));
    }
    c.rec.props.push(p);
    return p;
  }

  /** Attach the meshed model: exact bounds, light and particle emitter in world space. */
  finalize(p, m) {
    p.m = m;
    const { x, y, z, cos, sin } = p;
    const L = (lx, ly, lz) => [x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos];
    const mid = L((m.min[0] + m.max[0]) / 2, (m.min[1] + m.max[1]) / 2, (m.min[2] + m.max[2]) / 2);
    p.cx = mid[0]; p.cy = mid[1]; p.cz = mid[2];
    p.rad = Math.max(m.max[0] - m.min[0], m.max[2] - m.min[2]) * 0.5;
    p.top = y + m.max[1]; p.bot = y + m.min[1];
    if (m.light && !p.noLight) {
      const at = L(...m.light.at);
      p.light = { x: at[0], y: at[1], z: at[2], c: m.light.c, r: m.light.r, lantern: !!m.light.lantern, lava: !!m.light.lava };
      if (!p.gone && this.built.get(p.rec.key) === p.rec) this.lit.add(p);
    }
    if (m.emit) {
      const at = L(...m.emit.at);
      p.emit = { k: m.emit.k, x: at[0], y: at[1], z: at[2], c: m.emit.c || [1, 0.9, 0.7], s: m.emit.spread || 0.15 };
    }
  }

  /** Props waiting for a model that isn't meshed yet: one model is meshed per frame. */
  queueModel(p) {
    const k = p.mtype + ':' + p.v + ':' + p.param;
    let a = this.pending.get(k);
    if (!a) this.pending.set(k, (a = []));
    a.push(p);
  }
  meshPending(deadline) {
    // one model at a time, meshed in slices until the deadline (at least one slice a frame)
    if (!this.job) {
      for (const [k, list] of this.pending) {
        // skip models nobody waits for any more (their chunk or lift was dropped meanwhile)
        const p = list.find((q) => !q.gone && this.built.get(q.rec.key) === q.rec);
        if (!p) { this.pending.delete(k); continue; }
        this.job = { k, gen: modelSteps(p.mtype, p.v, p.param) };
        break;
      }
      if (!this.job) return;
    }
    const job = this.job;
    let res;
    do {
      const t = performance.now();
      res = job.gen.next();
      const d = performance.now() - t, k = job.k.split(':')[0] + ':' + (res.done ? 'done' : res.value);
      if (d > (this.stepMax[k] || 0)) this.stepMax[k] = d;
    } while (!res.done && performance.now() < deadline);
    if (!res.done) return;
    this.job = null;
    const list = this.pending.get(job.k) || [];
    this.pending.delete(job.k);
    for (const p of list) {
      if (this.built.get(p.rec.key) !== p.rec) continue;
      if (!p.gone) this.finalize(p, res.value);
      if (--p.rec.wait <= 0) this.dirty.add(p.rec);
    }
  }

  register(p) {
    for (const k of p.sup) {
      let a = this.support.get(k);
      if (!a) this.support.set(k, (a = []));
      a.push(p);
    }
    if (p.cageKeys) for (const k of p.cageKeys) {
      let a = this.cageSup.get(k);
      if (!a) this.cageSup.set(k, (a = []));
      a.push(p);
    }
    if (p.item) this.plants.add(p);
    if (p.light) this.lit.add(p);
  }
  unregister(p) {
    for (const k of p.sup) {
      const a = this.support.get(k);
      if (!a) continue;
      const i = a.indexOf(p);
      if (i >= 0) a.splice(i, 1);
      if (!a.length) this.support.delete(k);
    }
    if (p.cageKeys) for (const k of p.cageKeys) {
      const a = this.cageSup.get(k);
      if (!a) continue;
      const i = a.indexOf(p);
      if (i >= 0) a.splice(i, 1);
      if (!a.length) this.cageSup.delete(k);
    }
    this.plants.delete(p);
    this.lit.delete(p);
  }

  // ------------------------------------------------------------ chunks → buffer
  buildChunk(ch) {
    const t0 = performance.now();
    const rec = { key: ch.key, ch, props: [], slot: null, x: (ch.cx + 0.5) * CM, y: (ch.cy + 0.5) * CM, z: (ch.cz + 0.5) * CM };
    this.built.set(ch.key, rec);
    try { this.place(rec); } catch (e) {
      if (!this.warned) { this.warned = true; console.warn('props: chunk placement failed', e); }
      rec.props.length = 0;
    }
    rec.wait = 0;
    for (const p of rec.props) {
      this.register(p);
      if (modelCached(p.mtype, p.v, p.param)) this.finalize(p, getModel(p.mtype, p.v, p.param));
      else { this.queueModel(p); rec.wait++; }
    }
    // shown once every model it needs is meshed (so each chunk is written about once)
    if (!rec.wait) this.upload(rec);
    this.stats.buildMs += performance.now() - t0;
    return rec;
  }
  upload(rec) {
    const pool = this.pool;
    if (rec.slot) { pool.free(rec.slot); rec.slot = null; }
    let nv = 0, ni = 0;
    for (const p of rec.props) if (!p.gone && p.m) { nv += p.m.nv; ni += p.m.ni; }
    if (!nv) return;
    const slot = pool.alloc(nv, ni);
    const g = pool.geo;
    const at = g.attributes;
    const P = at.position.array, N = at.aNrm.array, C = at.aCol.array, A = at.aAnim.array, I = g.index.array;
    let vo = slot.v0, io = slot.i0;
    for (const p of rec.props) {
      if (p.gone || !p.m) continue;
      const m = p.m, c = p.cos, s = p.sin;
      const pos = m.pos, nrm = m.nrm4;
      C.set(m.col4, vo * 4);
      for (let i = 0; i < m.nv; i++) {
        const j = i * 3, o3 = (vo + i) * 3, o4 = (vo + i) * 4, j4 = i * 4;
        const lx = pos[j], lz = pos[j + 2];
        P[o3] = p.x + lx * c + lz * s; P[o3 + 1] = p.y + pos[j + 1]; P[o3 + 2] = p.z - lx * s + lz * c;
        const nx = nrm[j4], nz = nrm[j4 + 2];
        N[o4] = Math.round(nx * c + nz * s); N[o4 + 1] = nrm[j4 + 1]; N[o4 + 2] = Math.round(-nx * s + nz * c); N[o4 + 3] = nrm[j4 + 3];
        A[o3] = p.sway; A[o3 + 1] = p.phase; A[o3 + 2] = p.bob;
      }
      const idx = m.idx;
      for (let k = 0; k < m.ni; k++) I[io + k] = idx[k] + vo;
      vo += m.nv; io += m.ni;
    }
    pool.commit(slot);
    slot.rec = rec;
    rec.slot = slot;
  }
  dropChunk(rec) {
    if (rec.building) this.liftJob = null;
    for (const p of rec.props) {
      if (!p.gone) this.unregister(p);
      if (p.mtype === 'custom') forgetModel(p.param); // one-off models are rebuilt from the voxels next time
    }
    if (rec.slot) this.pool.free(rec.slot);
    rec.slot = null;
    this.built.delete(rec.key);
    this.dirty.delete(rec);
    this.urgent.delete(rec);
  }

  // ------------------------------------------------------------ the old lifts
  /** Are the chunks round a lift's room all loaded (so its voxels can be read)? */
  liftReady(L) {
    const w = this.w;
    const c0 = Math.floor((L.x - 2.3) / CM), c1 = Math.floor((L.x + 2.3) / CM);
    const e0 = Math.floor((L.y - 0.6) / CM), e1 = Math.floor((L.y + 3.1) / CM); // the room
    const f0 = Math.floor((L.z - 2.3) / CM), f1 = Math.floor((L.z + 2.3) / CM);
    for (let cz = f0; cz <= f1; cz++) for (let cy = e0; cy <= e1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const ch = w.chunk(cx, cy, cz);
      if (!ch || ch.pending) return false;
    }
    return true;
  }
  /** Dress one lift: the skinned cage, lamp, bell, plaque, counterweight, furniture (or a shaft stop's landing). */
  buildLift(L, eye) {
    const it = this.liftSteps(L, eye);
    for (;;) { const r = it.next(); if (r.done) return r.value; }
  }
  /** buildLift as a generator (yields after the voxel snapshot and each heavy piece). */
  *liftSteps(L, eye) {
    let t0 = performance.now(), ms = 0;
    const key = 'lift:' + L.id;
    const rec = { key, lift: L, ch: null, props: [], slot: null, x: L.x, y: L.y + 1, z: L.z, wait: 0, building: true };
    this.built.set(key, rec);
    const c = { rec, occ: [] };
    try {
      const sg = liftSnapshotSteps(this.w, L, L.id[0] !== 's');
      let sr;
      for (;;) {
        sr = sg.next();
        ms += performance.now() - t0;
        if (sr.done) break;
        yield sr.value;
        if (this.built.get(key) !== rec) return rec; // dropped meanwhile
        t0 = performance.now();
      }
      const S = sr.value;
      S.shaftX = this.plan.shaft.x; S.shaftZ = this.plan.shaft.z;
      rec.cageKeys = S.cage.map(([vx, vy, vz]) => vkey(vx, vy, vz));
      const gen = liftLayoutSteps(S, L);
      let r;
      for (;;) {
        t0 = performance.now();
        r = gen.next();
        ms += performance.now() - t0;
        if (r.done) break;
        yield r.value;
        if (this.built.get(key) !== rec) return rec; // dropped meanwhile
      }
      t0 = performance.now();
      for (const it of r.value) {
        let v = it.v ?? 0, param = it.p ?? 0;
        if (it.custom) { defineModel(it.key, it.custom); v = 0; param = it.key; }
        // a piece whose rock was dug away stays gone
        if (it.sup && !it.cageSup && OPAQUE[this.w.voxelAt(it.sup[0], it.sup[1], it.sup[2])] !== 1) continue;
        const sv = it.sup || [Math.floor(L.x * VOX), Math.floor(L.y * VOX) - 1, Math.floor(L.z * VOX)];
        const p = this.make(c, it.type, v, param, it.x, it.y, it.z, it.yaw || 0, it.mount, sv[0], sv[1], sv[2], (it.x * 3.7 + it.z * 1.3) % 1, { noLight: it.noLight, lift: true });
        if (!p) continue;
        if (it.cageSup) {
          // the cage (and what hangs on it) stands on its timber: digging any of it re-dresses the lift.
          // The snapshot's cells are 1/8 m: dug world voxels are matched to them (onVoxel).
          p.cage = true;
          p.sup = [];
          p.cageKeys = rec.cageKeys;
          p.supMain = -1;
        }
      }
    } catch (e) {
      if (!this.warnedLift) { this.warnedLift = true; console.warn('props: lift dressing failed', L.id, e); }
      rec.props.length = 0;
    }
    // standing right at it (arriving by lift): the cage itself is meshed now so it is there on the
    // first frame; the rest follows within the frame budget (a few frames, under the fade-in)
    // (only while the scene is loading: in play everything is meshed in slices)
    const near = this.age === 0 && eye && Math.hypot(L.x - eye.x, L.y + 0.7 - eye.y, L.z - eye.z) < 12;
    rec.wait = 0;
    rec.building = false;
    for (const p of rec.props) {
      this.register(p);
      if ((near && p.mtype === 'custom') || modelCached(p.mtype, p.v, p.param)) this.finalize(p, getModel(p.mtype, p.v, p.param));
      else { this.queueModel(p); rec.wait++; }
    }
    // shown in two goes when arriving: the cage now, the furniture once it is meshed
    if (near && rec.wait) { this.upload(rec); }
    if (!rec.wait) this.upload(rec);
    ms += performance.now() - t0;
    this.stats.buildMs += ms;
    this.stats.liftMs = Math.max(this.stats.liftMs || 0, ms);
    return rec;
  }
  /** Advance the lift being dressed until the deadline (at least one step). */
  liftWork(deadline) {
    if (!this.liftJob) return;
    let r;
    do {
      const t = performance.now();
      r = this.liftJob.next();
      const d = performance.now() - t, k = 'lift:' + (r.done ? 'done' : r.value);
      if (d > (this.stepMax[k] || 0)) this.stepMax[k] = d;
    } while (!r.done && performance.now() < deadline);
    if (r.done) this.liftJob = null;
  }
  /** A lift's cage lost some timber: dress it again from the voxels as they are now. */
  relift(rec) {
    if (this.built.get(rec.key) !== rec) return;
    this.dropChunk(rec);
    this.scanT = 0;
  }
  /** Are the chunk's neighbours all there (generated, not waiting on a worker)? */
  neighborsLoaded(ch) {
    const w = this.w;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const n = w.chunk(ch.cx + dx, ch.cy + dy, ch.cz + dz);
      if (!n || n.pending) return false;
    }
    return true;
  }

  /** Chunk offsets within R_BUILD of a chunk, nearest first (computed once). */
  ring() {
    if (this._ring) return this._ring;
    const R = Math.ceil(R_BUILD / CM) + 1, out = [];
    for (let dz = -R; dz <= R; dz++) for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx, dy, dz) * CM;
      if (d < R_BUILD + CM) out.push([d, dx, dy, dz]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return (this._ring = out);
  }

  /**
   * Rescan what is around (a generator, spread over frames): drop what is too far or gone, then
   * queue unbuilt chunks nearest first (walking the precomputed ring; lifts first).
   */
  *scanSteps(eye) {
    const ex = eye.x, ey = eye.y, ez = eye.z;
    const ecx = Math.floor(ex / CM), ecy = Math.floor(ey / CM), ecz = Math.floor(ez / CM);
    const w = this.w, chunks = w.chunks;
    let n = 0;
    for (const rec of [...this.built.values()]) {
      if (this.built.get(rec.key) !== rec) continue;
      const far = Math.hypot(rec.x - ex, rec.y - ey, rec.z - ez) > R_DROP;
      if (rec.lift ? far || !this.liftReady(rec.lift) : far || chunks.get(rec.key) !== rec.ch) this.dropChunk(rec);
      if ((++n & 63) === 0) yield;
    }
    const q = [];
    for (const L of this.lifts) {
      if (this.built.has('lift:' + L.id)) continue;
      if (Math.hypot(L.x - ex, L.y + 1 - ey, L.z - ez) < R_BUILD) q.push([0, null, L]);
    }
    this.queue = q;
    this.qi = 0;
    for (const [, dx, dy, dz] of this.ring()) {
      const ch = w.chunk(ecx + dx, ecy + dy, ecz + dz);
      if (ch && !ch.pending && !this.built.has(ch.key) && Math.hypot((ch.cx + 0.5) * CM - ex, (ch.cy + 0.5) * CM - ey, (ch.cz + 0.5) * CM - ez) < R_BUILD) q.push([0, ch]);
      if ((++n & 127) === 0) yield;
    }
  }

  stream(eye, budget) {
    const t0 = performance.now();
    if (!this.scanJob && this.scanT <= 0) { this.scanT = 0.5; this.scanJob = this.scanSteps(eye); }
    if (this.scanJob) {
      let r;
      do r = this.scanJob.next(); while (!r.done && performance.now() - t0 < budget * 0.5);
      if (r.done) this.scanJob = null;
    }
    while (this.qi < this.queue.length && performance.now() - t0 < budget) {
      const [, ch, L] = this.queue[this.qi++];
      if (L) {
        if (!this.liftJob && !this.built.has('lift:' + L.id) && this.liftReady(L)) this.liftJob = this.liftSteps(L, eye);
        else if (this.liftJob) this.scanT = Math.min(this.scanT, 0.2); // come back for it soon
        continue;
      }
      if (ch.pending || this.built.has(ch.key) || this.w.chunks.get(ch.key) !== ch) continue;
      if (!this.neighborsLoaded(ch)) continue;
      const tb = performance.now();
      this.buildChunk(ch);
      const db = performance.now() - tb;
      if (db > (this.stats.maxBuild || 0)) { this.stats.maxBuild = db; this.stats.maxBuildAt = ch.cx + ',' + ch.cy + ',' + ch.cz; }
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt, o = {}) {
    const t0 = performance.now();
    this.time = o.time ?? this.time + dt;
    this.age += dt;
    const pl = o.player || this.ctx.player;
    const eye = o.eye || pl?.eye?.();
    if (!eye) return;
    this.checkDay();
    this.scanT -= dt;
    const pr = this.prof || (this.prof = { last: {}, worst: {} });
    const t1 = performance.now();
    const deadline = t0 + (this.age < 3 ? 3 : 1.6);
    for (const rec of this.urgent) if (this.built.get(rec.key) === rec) this.upload(rec);
    this.urgent.clear();
    if (this.liftJob) this.liftWork(t0 + (this.age < 3 ? 2 : 1));
    if (this.pending.size || this.job) this.meshPending(t0 + (this.age < 3 ? 2 : 1));
    const t2 = performance.now();
    this.stream(eye, deadline - performance.now());
    const t3 = performance.now();
    for (const rec of this.dirty) {
      if (performance.now() > deadline + 0.6) break;
      this.dirty.delete(rec);
      if (this.built.get(rec.key) === rec) this.upload(rec);
    }
    // keep the drawn index range dense: move the topmost chunk down into a hole
    if (performance.now() < deadline) {
      const top = this.pool.topIfSparse();
      if (top && top.rec && this.built.get(top.rec.key) === top.rec) this.upload(top.rec);
    }
    const t4 = performance.now();
    this.updateFallers(dt);
    this.nearT -= dt;
    if (this.nearT <= 0) { this.nearT = 0.3; this.collectNear(eye); }
    this.animate(dt, pl, eye);
    const ms = performance.now() - t0;
    pr.last = { pre: t1 - t0, mesh: t2 - t1, stream: t3 - t2, upload: t4 - t3, rest: performance.now() - t4 };
    if (ms > (pr.worstMs || 0)) { pr.worstMs = ms; pr.worst = pr.last; }
    const st = this.stats;
    st.ms = st.ms * 0.9 + ms * 0.1;
    if (this.age > 3) st.worst = Math.max(st.worst, ms);
    st.chunks = this.built.size;
    let n = 0;
    for (const rec of this.built.values()) n += rec.props.length;
    st.props = n;
    st.verts = this.pool.high ? this.pool.capV - this.pool.vFree.reduce((s, f) => s + f[1], 0) : 0;
  }

  collectNear(eye) {
    const near = [];
    for (const rec of this.built.values()) {
      if (Math.hypot(rec.x - eye.x, rec.y - eye.y, rec.z - eye.z) > R_NEAR + 3.5) continue;
      for (const p of rec.props) {
        if (p.gone || !p.m || (!p.emit && !p.react && p.item !== 'whisperweed')) continue;
        if (Math.hypot(p.cx - eye.x, p.cy - eye.y, p.cz - eye.z) < R_NEAR) near.push(p);
      }
    }
    this.near = near;
  }

  animate(dt, pl, eye) {
    const t = this.time;
    for (const p of this.near) {
      if (p.gone) continue;
      const e = p.emit;
      if (e && Math.random() < dt * (RATE[e.k] || 0.5)) this.emitOne(p, e);
      if (pl && p.react) this.react(p, pl, t);
      if (p.item === 'whisperweed' && this.murmurT <= t && Math.hypot(p.cx - eye.x, p.cy - eye.y, p.cz - eye.z) < 3.5 && Math.random() < dt * 0.25) {
        this.murmurT = t + 4;
        this.audio?.play('wisp', { vol: 0.4 });
      }
    }
  }

  emitOne(p, e) {
    const fx = this.fx;
    if (!fx) return;
    const s = e.s, R = Math.random;
    const x = e.x + (R() - 0.5) * 2 * s, y = e.y + (R() - 0.5) * s, z = e.z + (R() - 0.5) * 2 * s;
    switch (e.k) {
      case 'spore':
        fx.spawn({ x, y, z, vx: (R() - 0.5) * 0.08, vy: 0.06 + R() * 0.1, vz: (R() - 0.5) * 0.08, life: 2.5 + R() * 2, size: 0.011, color: e.c, alpha: 0.85, glow: true, drag: 0.6, grav: -0.02 });
        break;
      case 'firefly': fx.firefly(x, y, z, e.c); break;
      case 'glint': fx.glints(x, y, z, e.c); break;
      case 'mote':
        fx.spawn({ x, y, z, vx: (R() - 0.5) * 0.12, vy: (R() - 0.3) * 0.1, vz: (R() - 0.5) * 0.12, life: 2 + R() * 2, size: 0.013, color: e.c, alpha: 0.9, glow: true, drag: 0.3 });
        break;
      case 'vent':
        fx.ember(x, y, z);
        if (R() < 0.18) fx.spawn({ x, y: y + 0.1, z, vx: (R() - 0.5) * 0.1, vy: 0.45 + R() * 0.2, vz: (R() - 0.5) * 0.1, life: 2.2 + R(), size: 0.05, grow: 0.14, color: [0.16, 0.13, 0.12], alpha: 0.32, drag: 0.7, grav: -0.2 });
        break;
      case 'smolder':
        fx.ember(x, y, z);
        if (R() < 0.3) fx.spawn({ x, y: y + 0.05, z, vy: 0.3, life: 1.8, size: 0.035, grow: 0.08, color: [0.14, 0.12, 0.11], alpha: 0.25, drag: 0.8, grav: -0.15 });
        break;
      case 'drip': {
        const fall = Math.max(0.2, (p.fall || 1.5) - 0.1);
        fx.spawn({ x, y, z, life: Math.sqrt((2 * fall) / 9.8) + 0.02, size: 0.012, color: [0.72, 0.88, 1], alpha: 0.9, drag: 0, grav: 9.8 });
        if (Math.random() < 0.3 && this.ctx.player && Math.hypot(p.x - this.ctx.player.pos.x, p.z - this.ctx.player.pos.z) < 3) this.audio?.play('drip');
        break;
      }
      case 'spark': fx.sparks(x, y, z, 2, e.c, [p.nx || 0, 0.2, p.nz || 0], 1.2); break;
      case 'ember': fx.ember(x, y, z); break;
      case 'bubble':
        fx.spawn({ x, y, z, vx: (R() - 0.5) * 0.05, vy: 0.22, vz: (R() - 0.5) * 0.05, life: 2.2, size: 0.022, color: e.c, alpha: 0.55, glow: true, drag: 0.4, grav: -0.12 });
        break;
      default: break;
    }
  }

  react(p, pl, t) {
    if (p.cool > t) return;
    const dx = pl.pos.x - p.x, dz = pl.pos.z - p.z;
    const dy = pl.pos.y - p.y;
    const reach = p.mount === 'floor' ? p.rad * 0.9 + 0.15 : 0;
    if (p.mount !== 'floor' || dy < -0.5 || dy > Math.max(0.6, p.top - p.y)) return;
    if (dx * dx + dz * dz > reach * reach) return;
    const fx = this.fx;
    if (p.react === 'puff') {
      if ((pl.speed || 0) < 0.3) return;
      p.cool = t + 2.5;
      const col = p.emit?.c || [0.6, 0.9, 1];
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2, sp = 0.2 + Math.random() * 0.45;
        fx?.spawn({ x: p.cx + Math.cos(a) * 0.1, y: p.cy + 0.1, z: p.cz + Math.sin(a) * 0.1, vx: Math.cos(a) * sp, vy: 0.25 + Math.random() * 0.4, vz: Math.sin(a) * sp, life: 1.6 + Math.random() * 1.6, size: 0.014 + Math.random() * 0.01, color: col, alpha: 0.85, glow: true, drag: 1.4, grav: -0.04 });
      }
      this.audio?.play('squish');
    } else if (p.react === 'chime') {
      p.cool = t + 1.8;
      for (let i = 0; i < 6; i++) fx?.glints(p.cx + (Math.random() - 0.5) * p.rad, p.cy + (Math.random() - 0.3) * (p.top - p.bot) * 0.5, p.cz + (Math.random() - 0.5) * p.rad, p.emit?.c || [0.8, 0.9, 1]);
      this.audio?.play('sparkle');
    } else if (p.react === 'bloop') {
      p.cool = t + 3;
      for (let i = 0; i < 5; i++) fx?.spawn({ x: p.cx + (Math.random() - 0.5) * 0.2, y: p.cy + 0.15, z: p.cz + (Math.random() - 0.5) * 0.2, vy: 0.3 + Math.random() * 0.3, life: 2, size: 0.025, color: [0.6, 0.95, 0.9], alpha: 0.6, glow: true, drag: 0.5, grav: -0.1 });
      this.audio?.play('bloop');
    }
  }

  /** Up to 3 nearest glowing props as point lights (fading in at the edge of range). */
  lights(eye) {
    const best = [null, null, null], bd = [1e9, 1e9, 1e9];
    for (const p of this.lit) {
      if (p.gone) continue;
      const l = p.light;
      const d = Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z);
      if (d > 13) continue;
      if (d < bd[2]) {
        let i = 2;
        while (i > 0 && d < bd[i - 1]) { bd[i] = bd[i - 1]; best[i] = best[i - 1]; i--; }
        bd[i] = d; best[i] = p;
      }
    }
    const out = [];
    for (let i = 0; i < 3; i++) {
      const p = best[i];
      if (!p) break;
      const l = p.light, o = this.outLights[i];
      const k = Math.min(1, (13 - bd[i]) / 3);
      o.x = l.x; o.y = l.y; o.z = l.z; o.r = l.r; o.lantern = l.lantern; o.lava = l.lava;
      o.c[0] = l.c[0] * k; o.c[1] = l.c[1] * k; o.c[2] = l.c[2] * k;
      out.push(o);
    }
    return out;
  }

  // ------------------------------------------------------------ plants: aim + harvest
  pick(eye, dir, reach) {
    let best = null, bt = 1e9;
    for (const p of this.plants) {
      if (p.gone || !p.m) continue;
      const vx = p.cx - eye.x, vy = p.cy - eye.y, vz = p.cz - eye.z;
      const rad = Math.max(0.2, p.rad * 0.85);
      const d2 = vx * vx + vy * vy + vz * vz;
      if (d2 > (reach + rad) * (reach + rad)) continue;
      const t = vx * dir.x + vy * dir.y + vz * dir.z;
      if (t < 0 || t > reach + rad * 0.5) continue;
      if (d2 - t * t > rad * rad) continue;
      if (t < bt) { bt = t; best = p; }
    }
    return best;
  }
  target(eye, dir, reach) {
    const p = this.pick(eye, dir, reach);
    return p ? { label: ITEMS[p.item]?.name || p.item, kind: 'use' } : null;
  }
  use(eye, dir, reach) {
    const p = this.pick(eye, dir, reach);
    if (!p) return null;
    const st = this.state, it = ITEMS[p.item];
    if (st?.data) { this.picked[p.key] = st.data.day ?? 0; st.dirty = true; }
    this.pop(p);
    this.remove(p);
    const out = { loot: { id: p.item } };
    if (p.item === 'emberbloom' && !st?.protects?.('heat')) { out.damage = 3; out.kind = 'burn'; out.say = 'Ouch! <b>Emberbloom</b> really is on fire. Mitts would help.'; out.key = 'ember'; this.audio?.play('sizzle'); }
    else if (p.item === 'sparkmoss' && !st?.protects?.('zap')) { out.damage = 2; out.kind = 'zap'; out.say = '<b>Sparkmoss</b> bites! Your whiskers crackle.'; out.key = 'spark'; this.audio?.play('zap', { vol: 0.5 }); }
    else if (p.item === 'gloomshroom') { out.say = 'Sleepy spores... <i>achoo!</i>'; out.key = 'gloom'; out.tone = 'good'; this.audio?.play('sneeze'); }
    else if (p.item === 'crystal_lily') this.audio?.play('ding');
    else if (p.item === 'core_lotus') { this.audio?.play('sparkle'); out.say = `A <b>${it?.name || 'Core Lotus'}</b>! Legendary in mole cooking.`; out.tone = 'good'; out.key = 'lotus'; }
    else if (p.item === 'bubblebulb') this.audio?.play('bloop');
    return out;
  }
  /** A little burst of leaves / petals / glow where a plant was picked. */
  pop(p) {
    const fx = this.fx;
    this.audio?.play('brush');
    if (!fx) return;
    const col = p.m.main;
    const glow = !!p.emit || !!p.m.light;
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 1.2;
      fx.spawn({ x: p.cx, y: p.cy, z: p.cz, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 1.4, vz: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.5, size: 0.014 + Math.random() * 0.012, color: col, alpha: 1, drag: 1.2, grav: 7, bounce: 0.3, fade: false });
    }
    if (glow) for (let i = 0; i < 6; i++) fx.glints(p.cx + (Math.random() - 0.5) * 0.3, p.cy + (Math.random() - 0.5) * 0.3, p.cz + (Math.random() - 0.5) * 0.3, p.emit?.c || [1, 1, 0.85]);
  }
  /** Take a prop out of the world (its chunk's geometry is rewritten this frame). */
  remove(p) {
    if (p.gone) return;
    p.gone = true;
    this.unregister(p);
    if (this.built.get(p.rec.key) === p.rec) this.urgent.add(p.rec);
  }

  // ------------------------------------------------------------ digging under props
  onVoxel(vx, vy, vz, old, m) {
    const was = OPAQUE[old] === 1, now = OPAQUE[m] === 1;
    if (was === now) return;
    if (was) {
      const k = vkey(vx, vy, vz);
      const list = this.support.get(k);
      if (list) {
        for (const p of [...list]) {
          if (p.gone) continue;
          if (k === p.supMain || ++p.lost >= 3) this.fall(p);
        }
      }
      if (this.cageSup.size) {
        const cl = this.cageSup.get(vkey(Math.floor(vx / VK), Math.floor(vy / VK), Math.floor(vz / VK)));
        if (cl && cl.length) this.relift(cl[0].rec);
      }
      // crystals nearby ring when the rock beside them is struck away
      if (this.chimeT <= this.time) {
        const x = (vx + 0.5) / VOX, y = (vy + 0.5) / VOX, z = (vz + 0.5) / VOX;
        const rec = this.built.get(this.w.chunk(vx >> CB, vy >> CB, vz >> CB)?.key);
        if (rec) for (const p of rec.props) {
          if (p.gone || p.react !== 'chime') continue;
          if (Math.hypot(p.cx - x, p.cy - y, p.cz - z) < p.rad + 1.2) {
            this.chimeT = this.time + 0.35;
            this.audio?.play('ding');
            this.fx?.glints(p.cx, p.cy, p.cz, p.emit?.c || [0.8, 0.9, 1]);
            break;
          }
        }
      }
    } else {
      // rock (or cooled lava) filled space a prop stood in: it crumbles
      const x = (vx + 0.5) / VOX, y = (vy + 0.5) / VOX, z = (vz + 0.5) / VOX;
      const rec = this.built.get(this.w.chunk(vx >> CB, vy >> CB, vz >> CB)?.key);
      if (!rec) return;
      for (const p of rec.props) {
        if (p.gone || Math.abs(p.cx - x) > p.rad || Math.abs(p.cz - z) > p.rad || y < p.bot || y > p.top) continue;
        this.remove(p);
        this.crumbleAt(p, p.cx, p.cy, p.cz, 0.6);
      }
    }
  }

  /** Its rock is gone: the prop drops as a loose mesh, bounces and crumbles. */
  fall(p) {
    if (p.gone) return;
    this.remove(p);
    const T = TYPES[p.type];
    if (!p.m) return;
    if (this.fallers.length >= 10 || !this.scene3) { this.crumbleAt(p, p.cx, p.cy, p.cz, 1); return; }
    const m = p.m, c = p.cos, s = p.sin;
    const pos = new Float32Array(m.nv * 3), nor = new Int8Array(m.nv * 4), anim = new Float32Array(m.nv * 3);
    // centred on the prop's middle so it tumbles about it
    const ox = p.cx - p.x, oy = p.cy - p.y, oz = p.cz - p.z;
    for (let i = 0; i < m.nv; i++) {
      const j = i * 3, j4 = i * 4, lx = m.pos[j], lz = m.pos[j + 2];
      pos[j] = lx * c + lz * s - ox; pos[j + 1] = m.pos[j + 1] - oy; pos[j + 2] = -lx * s + lz * c - oz;
      const nx = m.nrm4[j4], nz = m.nrm4[j4 + 2];
      nor[j4] = Math.round(nx * c + nz * s); nor[j4 + 1] = m.nrm4[j4 + 1]; nor[j4 + 2] = Math.round(-nx * s + nz * c);
      anim[j + 1] = p.phase;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aNrm', new THREE.BufferAttribute(nor, 4, true));
    g.setAttribute('aCol', new THREE.BufferAttribute(m.col4, 4, true));
    g.setAttribute('aAnim', new THREE.BufferAttribute(anim, 3));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.position.set(p.cx, p.cy, p.cz);
    mesh.layers.enable(LAYER_OUTLINE);
    this.scene3.add(mesh);
    const vel = new THREE.Vector3(0, p.mount === 'ceil' ? -0.2 : 0.2, 0);
    if (p.mount === 'wall') vel.set((p.nx || 0) * 0.9, 0.5, (p.nz || 0) * 0.9);
    const big = Math.max(0.3, p.top - p.bot);
    const spin = new THREE.Vector3((Math.random() - 0.5) * 3 / big, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3 / big);
    this.fallers.push({ p, mesh, vel, spin, t: 0, hits: 0, half: (p.top - p.bot) * 0.5, brittle: !!T?.brittle });
    if (p.light) this.audio?.play('clang', { vol: 0.5 });
  }
  updateFallers(dt) {
    if (!this.fallers.length) return;
    const keep = [];
    for (const f of this.fallers) {
      f.t += dt;
      const m = f.mesh;
      f.vel.y -= 9.8 * dt;
      m.position.addScaledVector(f.vel, dt);
      m.rotation.x += f.spin.x * dt; m.rotation.y += f.spin.y * dt; m.rotation.z += f.spin.z * dt;
      const bottom = m.position.y - f.half * 0.8;
      let done = f.t > 3.5;
      if (!done && f.vel.y < 0 && this.solid(m.position.x, bottom, m.position.z)) {
        f.hits++;
        const sp = -f.vel.y;
        if (f.brittle || f.hits >= 2 || sp < 1.2) done = true;
        else {
          f.vel.y = sp * 0.32; f.vel.x *= 0.5; f.vel.z *= 0.5; f.spin.multiplyScalar(0.5);
          this.audio?.play('thud', { vol: 0.3 });
          this.fx?.dust(m.position.x, bottom + 0.05, m.position.z, 4, [0.5, 0.42, 0.34], 0.1);
        }
      }
      if (done) {
        this.crumbleAt(f.p, m.position.x, m.position.y, m.position.z, 1);
        this.scene3.remove(m);
        m.geometry.dispose();
        continue;
      }
      keep.push(f);
    }
    this.fallers = keep;
  }
  crumbleAt(p, x, y, z, vol) {
    const T = TYPES[p.type];
    this.audio?.play('break', { snd: T?.snd || 'stone', vol: 0.45 * vol });
    const fx = this.fx;
    if (!fx) return;
    const n = p.m ? Math.min(26, 8 + Math.round(p.m.nv / 120)) : 8;
    fx.chips(x, y, z, n, p.m ? p.m.main : [0.5, 0.45, 0.4], [0, 1, 0]);
    fx.dust(x, y, z, 5, [0.5, 0.44, 0.38], Math.max(0.1, p.rad * 0.6));
    if (p.emit || p.m?.light) for (let i = 0; i < 6; i++) fx.glints(x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.3, p.emit?.c || [1, 0.9, 0.7]);
  }

  // ------------------------------------------------------------ debug / teardown
  info() {
    return { ...this.stats, fallers: this.fallers.length, lights: this.lit.size, plants: this.plants.size, cap: this.pool.capV, models: modelStats() };
  }
  dispose() {
    for (const f of this.fallers) { this.scene3?.remove(f.mesh); f.mesh.geometry.dispose(); }
    this.fallers = [];
    this.pool.dispose();
    this.mat.dispose();
    this.built.clear();
    this.support.clear();
    this.cageSup.clear();
    this.plants.clear();
    this.lit.clear();
    this.near = [];
  }
}
