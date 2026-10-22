// The clearing's bait: a strange old chest spilling gold and gems, sitting on a thin crust of
// turf over a hollow. Built here:
//   - the chest (1/48 m): weathered planks, iron bands and rivets, a lock plate whose keyhole and
//     carved runes glow violet, moss on the lid; the lid is its own mesh on a hinge;
//   - the treasure: a heap of coins in the chest, a spill of coins, gems, a goblet and a string of
//     pearls down its front (and points where they glint);
//   - the crust: the turf disc around it, cut into jagged pieces (1/16 m) that sag, part and fall,
//     with roots hanging under them;
//   - the cracks: a decal of cracks that race outward over the clearing (revealed by a uniform).
import * as THREE from 'three';
import { VoxelGrid, meshVoxGreedy, voxMesh, hash3, fshade, fmix } from './vox.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { makeRng, makeNoise2D, clamp } from '../core/util.js';
import { GLSL_BAYER } from './fx.js';

const S48 = 1 / 48;
const PLANK = [0x7a5232, 0x6a4628, 0x5a3c22, 0x8a5e3a];
const IRON = 0x3a3634, IRON_L = 0x6a625c, IRON_D = 0x24201e, RUST = 0x7a4a2a;
const GOLD = [0xffe070, 0xf2c23a, 0xd89a20, 0xa86a10];
const GEMS = [[0xff5a7a, 0xc8203a], [0x5ae0ff, 0x1a8ad0], [0x7aff8a, 0x1aa04a], [0xd08aff, 0x7a30c8]];
const RUNE = 0xc890ff;

/** A coin heap shape: true where a coin voxel sits (k: heap height at d from the peak). */
function coinColor(x, y, z, seed) {
  const h = hash3(x, y, z, seed);
  if (h < 0.06) return GOLD[0];
  if (h < 0.5) return GOLD[1];
  if (h < 0.85) return GOLD[2];
  return GOLD[3];
}

/**
 * The chest. Returns { group, body, lid, lidPivot, glints: [{pos, color}], runes, glowPos }.
 * Origin on the ground at the middle of the chest's footprint; the front faces +z.
 */
export function makeChest(seed = 7) {
  const rng = makeRng(seed);
  const W = 30, D = 20, BH = 15, LH = 7; // body width/depth/height, lid height (voxels)
  const g = new VoxelGrid(W + 4, BH + 16, D + 4);
  const ox = 2, oz = 2;
  const glints = [];
  // body: vertical planks, a bottom rim, iron bands round the corners and across
  for (let x = 0; x < W; x++) for (let y = 0; y < BH; y++) for (let z = 0; z < D; z++) {
    const shell = x === 0 || x === W - 1 || z === 0 || z === D - 1 || y === 0;
    if (!shell) continue;
    const onFront = z === D - 1 || z === 0;
    const u = onFront ? x : z;
    const plank = Math.floor(u / 5);
    let col = PLANK[(plank + seed) % 4];
    if (u % 5 === 0) col = PLANK[2]; // gaps between planks
    if (hash3(x, y >> 1, z, seed) < 0.12) col = fshade(col, 0.88); // grain
    const corner = (x < 2 || x > W - 3) && (z < 2 || z > D - 3);
    const band = y === 2 || y === 3 || y === BH - 3 || y === BH - 2;
    if (corner) col = (y % 4 === 0) ? IRON_L : IRON;
    else if (band && !(onFront && x > W / 2 - 4 && x < W / 2 + 3)) col = (u % 6 === 0) ? IRON_L : IRON;
    if (band && hash3(x, y, z, seed + 3) < 0.12) col = RUST;
    if (y === 0) col = PLANK[2];
    if (y < 3 && hash3(x, y, z, seed + 5) < 0.35 && !corner) col = fmix(col, 0x4e6e34, 0.6); // moss at the foot
    g.set(ox + x, y, oz + z, col);
  }
  // the lock plate with its keyhole, and a row of carved runes on the front between the bands
  const fz = oz + D;
  for (let x = W / 2 - 4; x < W / 2 + 4; x++) for (let y = BH - 9; y < BH - 1; y++) g.set(ox + x, y, fz, (x === W / 2 - 4 || x === W / 2 + 3 || y === BH - 9 || y === BH - 2) ? IRON_L : IRON);
  g.set(ox + W / 2 - 1, BH - 5, fz + 1, IRON_D); g.set(ox + W / 2, BH - 5, fz + 1, IRON_D); g.set(ox + W / 2 - 1, BH - 6, fz + 1, IRON_D);
  const runePts = [];
  for (let i = 0; i < 6; i++) {
    const rx = i < 3 ? 3 + i * 3 : W - 13 + (i - 3) * 3;
    const pat = [[0, 0], [1, 1], [0, 2], [1, 3], [2, 2]].filter(() => rng.chance(0.75));
    for (const [dx, dy] of pat) runePts.push([ox + rx + (dx % 2), 5 + dy, fz]);
  }
  // rivets on the bands
  for (let x = 1; x < W; x += 4) for (const y of [2, BH - 2]) { g.set(ox + x, y, fz, IRON_L); g.set(ox + x, y, oz - 1, IRON_L); }
  // the treasure heaped inside, above the rim
  const cx = ox + W / 2, cz = oz + D / 2;
  for (let x = 1; x < W - 1; x++) for (let z = 1; z < D - 1; z++) {
    const d = Math.hypot((x - W / 2) / (W / 2), (z - D / 2) / (D / 2));
    const top = BH - 1 + Math.round((1 - d * d) * 5 + hash3(x, 0, z, seed) * 1.5);
    for (let y = BH - 3; y < top; y++) g.set(ox + x, y, oz + z, coinColor(x, y, z, seed));
    if (hash3(x, 1, z, seed + 8) < 0.04) { // gems poking out of the gold
      const [a, b] = GEMS[(x + z) % 4];
      g.set(ox + x, top, oz + z, a); g.set(ox + x, top + 1, oz + z, b);
      glints.push({ pos: [(x - W / 2) * S48, (top + 1.5) * S48, (z - D / 2) * S48], color: a });
    } else if (hash3(x, 2, z, seed + 9) < 0.05) glints.push({ pos: [(x - W / 2) * S48, (top + 0.5) * S48, (z - D / 2) * S48], color: 0xfff4c0 });
  }
  // a string of pearls hanging over the front edge
  for (let i = 0; i < 9; i++) g.set(ox + 6 + i, BH - Math.round(Math.sin((i / 8) * Math.PI) * 3), fz + 1, i % 2 ? 0xfff8f0 : 0xe8dcd8);
  const body = voxMesh(g, { pivot: [cx, 0, cz], scale: S48 });
  // runes: a little unlit mesh so they glow (and bloom)
  const rg = new VoxelGrid(W + 4, BH + 4, D + 4);
  for (const [x, y, z] of runePts) rg.set(x, y, z, RUNE);
  rg.set(ox + W / 2 - 1, BH - 5, fz, 0xe8c0ff); rg.set(ox + W / 2, BH - 5, fz, 0xe8c0ff); rg.set(ox + W / 2 - 1, BH - 6, fz, 0xe8c0ff); // the keyhole glows
  const runeMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
  const runes = new THREE.Mesh(meshVoxGreedy(rg, { pivot: [cx, 0, cz], scale: S48, shade: false, ao: false }), runeMat);
  runes.position.z = 0.002;
  // the lid: a curved top of planks and bands, on its own pivot at the back hinge
  const lg = new VoxelGrid(W + 2, LH + 2, D + 2);
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    const t = (z + 0.5) / D;
    const h = Math.round(LH * Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2)));
    for (let y = 0; y <= h; y++) {
      const shell = y === h || x === 0 || x === W - 1 || y === 0;
      if (!shell) continue;
      const plank = Math.floor(z / 4);
      let col = PLANK[(plank + 1) % 4];
      if (z % 4 === 0) col = PLANK[2];
      if (x < 2 || x > W - 3 || x === Math.floor(W / 2) || x === Math.floor(W / 2) - 1) col = (z % 3 === 0) ? IRON_L : IRON;
      if (y === h && hash3(x >> 1, 0, z >> 1, seed + 6) < 0.18) col = fmix(col, 0x5a8a3a, 0.7); // moss on the lid
      if (y === 0 && x > 0 && x < W - 1) col = 0x3a1e3a; // violet lining inside
      lg.set(1 + x, y, 1 + z, col);
    }
  }
  const lid = voxMesh(lg, { pivot: [1 + W / 2, 0, 1], scale: S48 });
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, BH * S48, -D / 2 * S48);
  lidPivot.add(lid);
  lidPivot.rotation.x = -1.15; // open
  const group = new THREE.Group();
  group.add(body, runes, lidPivot);
  return { group, body, lid, lidPivot, runes, runeMat, glints, glowPos: new THREE.Vector3(0, (BH + 3) * S48, 0), size: [W * S48, BH * S48, D * S48] };
}

/**
 * The spill in front of the chest: a fan of coins, gems, a tipped goblet (1/48 m).
 * Returns { mesh, glints }. Origin at the chest's front edge on the ground; spills toward +z.
 */
export function makeSpill(seed = 3) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(64, 10, 44);
  const cx = 32;
  const glints = [];
  // a sliding heap tapering away from the chest, then scattered coins
  for (let x = 0; x < 64; x++) for (let z = 0; z < 44; z++) {
    const dx = (x - cx) / (16 + z * 0.5), dz = z / 26;
    const k = 1 - Math.hypot(dx, dz);
    if (k > 0) {
      const h = Math.round(k * k * 7 + hash3(x, 0, z, seed) * 1.2);
      for (let y = 0; y < h; y++) g.set(x, y, z, coinColor(x, y, z, seed));
      if (hash3(x, 3, z, seed) < 0.03) glints.push({ pos: [(x - cx) * S48, (h + 0.5) * S48, z * S48], color: 0xfff4c0 });
    } else if (hash3(x, 4, z, seed) < 0.025 && z < 40) {
      g.set(x, 0, z, GOLD[1]); g.set(x + 1, 0, z, GOLD[2]); // a lone coin lying flat
    }
  }
  // gems on and around the heap
  for (let i = 0; i < 9; i++) {
    const [a, b] = GEMS[i % 4];
    const x = Math.round(cx + rng.range(-20, 20)), z = Math.round(rng.range(4, 34));
    let y = 0; while (g.filled(x, y, z)) y++;
    g.set(x, y, z, a); g.set(x + 1, y, z, b); g.set(x, y + 1, z, fmix(a, 0xffffff, 0.5)); g.set(x, y, z + 1, b);
    glints.push({ pos: [(x - cx) * S48, (y + 1.5) * S48, z * S48], color: a, gem: true });
  }
  // a tipped-over goblet
  const gx = cx + 17, gz = 14;
  for (let t = 0; t < 10; t++) for (let a = 0; a < 12; a++) {
    const r = t < 6 ? 2.6 - t * 0.05 : t < 8 ? 1 : 2.2;
    const an = (a / 12) * Math.PI * 2;
    g.set(gx + t, 2 + Math.round(Math.sin(an) * r), gz + Math.round(Math.cos(an) * r), t < 6 && a < 3 ? GOLD[0] : GOLD[t % 2 ? 1 : 2]);
  }
  g.set(gx + 3, 4, gz + 3, 0xff5a7a);
  glints.push({ pos: [(gx + 3 - cx) * S48, 5 * S48, (gz + 3) * S48], color: 0xff7a9a, gem: true });
  const mesh = voxMesh(g, { pivot: [cx, 0, 0], scale: S48 });
  return { mesh, glints };
}

// ------------------------------------------------------------------ the crust
/**
 * Cut the crust (cells where inCrust(i, k) on a grid of cell size `cell` metres centred on the
 * origin) into jagged pieces, each with turf on top (top colour colorAt(x, z)) and soil and roots
 * under it, built at half the cell size. Returns [{ mesh, home: Vector3, area }].
 */
export function makeCrust({ R, cell, inCrust, colorAt, seed = 11, nPieces = 9 }) {
  const rng = makeRng(seed);
  const n = makeNoise2D(seed);
  // piece seeds: one near the middle (under the chest), a ring around
  const seeds = [[0.05, -0.08]];
  for (let i = 1; i < nPieces; i++) {
    const a = (i / (nPieces - 1)) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const r = R * rng.range(0.55, 0.8);
    seeds.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const owner = (x, z) => {
    // a wobbly nearest-seed partition so the cracks between pieces zig-zag
    const wx = x + n(x * 3.1, z * 3.1) * 0.12, wz = z + n(z * 3.1 + 9, x * 3.1) * 0.12;
    let best = 0, bd = 1e9;
    for (let i = 0; i < seeds.length; i++) { const d = (wx - seeds[i][0]) ** 2 + (wz - seeds[i][1]) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  };
  const vs = cell / 2;
  const N = Math.ceil((R + cell * 2) / vs);
  const cells = seeds.map(() => []);
  for (let j = -N; j < N; j++) for (let i = -N; i < N; i++) {
    const x = (i + 0.5) * vs, z = (j + 0.5) * vs;
    const ci = Math.floor(x / cell), ck = Math.floor(z / cell);
    if (!inCrust(ci, ck)) continue;
    cells[owner(x, z)].push([i, j, x, z]);
  }
  const pieces = [];
  const T = 6; // turf + soil thickness (voxels)
  cells.forEach((list, pi) => {
    if (!list.length) return;
    let mx = 0, mz = 0;
    for (const c of list) { mx += c[2]; mz += c[3]; }
    mx /= list.length; mz /= list.length;
    let i0 = 1e9, i1 = -1e9, j0 = 1e9, j1 = -1e9;
    for (const [i, j] of list) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    const gw = i1 - i0 + 3, gd = j1 - j0 + 3, gh = T + 14;
    const g = new VoxelGrid(gw, gh, gd);
    const top = 14; // the turf top sits at y = top (so roots can hang below)
    const filled = new Set(list.map(([i, j]) => `${i},${j}`));
    for (const [i, j, x, z] of list) {
      const gx = i - i0 + 1, gz = j - j0 + 1;
      const tc = colorAt(x, z);
      for (let y = top - T; y < top; y++) {
        const fromTop = top - 1 - y;
        let col;
        if (fromTop === 0) col = tc;
        else if (fromTop === 1) col = fshade(tc, 0.72);
        else col = hash3(i, y, j, seed) < 0.2 ? 0x3e2a1a : fromTop > 3 ? 0x4a3422 : 0x5a3e28;
        // the edge of the piece shows the cut: dark soil, roots
        g.set(gx, y, gz, col);
      }
      // roots dangling from the underside at the edges
      const edge = !filled.has(`${i + 1},${j}`) || !filled.has(`${i - 1},${j}`) || !filled.has(`${i},${j + 1}`) || !filled.has(`${i},${j - 1}`);
      if (hash3(i, 3, j, seed) < (edge ? 0.12 : 0.03)) {
        const len = 2 + (hash3(i, 4, j, seed) * 9 | 0);
        for (let k = 0; k < len; k++) g.set(gx + (k > 4 && hash3(i, k, j, 2) < 0.4 ? 1 : 0), top - T - 1 - k, gz, k % 3 === 2 ? 0x8a6a46 : 0x9a7650);
      }
    }
    const geo = meshVoxGreedy(g, { scale: vs, pivot: [(mx / vs) - i0 + 1, top, (mz / vs) - j0 + 1] });
    const mesh = new THREE.Mesh(geo, voxelMaterial('toon'));
    mesh.layers.enable(LAYER_OUTLINE);
    mesh.position.set(mx, 0, mz);
    mesh.userData.dynamic = true;
    // spots for grass on this piece (piece-local), so the blades ride down with it
    const tufts = [];
    for (const [i, j, x, z] of list) if (hash3(i, 7, j, seed) < 0.16) tufts.push({ x: x - mx, z: z - mz, k: hash3(i, 8, j, seed) });
    pieces.push({ mesh, home: new THREE.Vector3(mx, 0, mz), area: list.length * vs * vs, index: pi, tufts });
  });
  return pieces;
}

// ------------------------------------------------------------------ the cracks
const CRACK_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const CRACK_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform float uReveal;
uniform float uGlow;
varying vec2 vUv;
${GLSL_BAYER}
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  // g: when this bit of crack appears (0..1); r: 1 = the crack's dark core, 0 = its lit lip
  float when = t.g;
  if (when > uReveal) discard;
  float fresh = clamp(1.0 - (uReveal - when) * 6.0, 0.0, 1.0);
  vec3 core = vec3(0.07, 0.045, 0.03);
  vec3 lip = vec3(0.36, 0.27, 0.18);
  vec3 col = mix(lip, core, t.r);
  col = mix(col, vec3(0.62, 0.48, 0.3), fresh * (1.0 - t.r) * 0.6); // freshly torn soil is lighter
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Cracks spreading over a flat patch of ground (size × size m, centred on the origin) from the
 * crust's rim (radius R0) outward. Returns { mesh, tips(reveal) → [Vector3] (crack ends at that
 * reveal, for dust), uniforms }. Set uniforms.uReveal.value 0..1 to grow them.
 */
export function makeCracks({ size = 9.6, R0 = 1.5, n = 11, seed = 5, texels = 384 } = {}) {
  const rng = makeRng(seed);
  const tpm = texels / size; // texels per metre
  const when = new Float32Array(texels * texels).fill(-1);
  const core = new Uint8Array(texels * texels);
  const segs = [];
  const put = (x, z, t, isCore) => {
    const px = Math.round(x * tpm + texels / 2), pz = Math.round(z * tpm + texels / 2);
    if (px < 0 || pz < 0 || px >= texels || pz >= texels) return;
    const i = pz * texels + px;
    if (when[i] < 0 || t < when[i]) when[i] = t;
    if (isCore) core[i] = 1;
  };
  const walk = (x, z, a, len, t0, speed, depth) => {
    const step = 1 / tpm;
    let t = t0;
    for (let s = 0; s < len; s += step) {
      a += rng.range(-0.35, 0.35) * (rng.chance(0.2) ? 2.2 : 1) * 0.5;
      x += Math.cos(a) * step; z += Math.sin(a) * step;
      t += step / speed;
      const w = Math.max(0, 1 - s / len) * (depth ? 0.6 : 1.2);
      put(x, z, t, true);
      if (w > 0.5) put(x + Math.sin(a) * step, z - Math.cos(a) * step, t, true);
      put(x - Math.sin(a) * step, z + Math.cos(a) * step, t, false);
      segs.push({ x, z, t });
      if (!depth && rng.chance(0.012) && s > len * 0.15) walk(x, z, a + rng.pick([-1, 1]) * rng.range(0.6, 1.2), (len - s) * rng.range(0.3, 0.6), t, speed, depth + 1);
    }
  };
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    walk(Math.cos(a) * R0, Math.sin(a) * R0, a + rng.range(-0.3, 0.3), rng.range(1.3, 3.2), rng.range(0, 0.12), rng.range(2.6, 4.2), 0);
  }
  const maxT = segs.reduce((m, s) => Math.max(m, s.t), 0.01);
  const data = new Uint8Array(texels * texels * 4);
  for (let i = 0; i < when.length; i++) {
    if (when[i] < 0) continue;
    data[i * 4] = core[i] ? 255 : 40;
    data[i * 4 + 1] = Math.min(255, Math.round((when[i] / maxT) * 255));
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, texels, texels);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  const uniforms = { uMap: { value: tex }, uReveal: { value: 0 }, uGlow: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  // PlaneGeometry's uv v runs +y → after the rotation, v grows toward -z; the canvas row 0 is z = -size/2
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.004;
  mesh.renderOrder = 3;
  mesh.userData.noBatch = true;
  const tips = (reveal) => {
    const out = [];
    const tt = reveal * maxT;
    for (const s of segs) if (Math.abs(s.t - tt) < 0.02) out.push(new THREE.Vector3(s.x, 0.02, s.z));
    return out;
  };
  return { mesh, uniforms, tips, texture: tex };
}
