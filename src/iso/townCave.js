// Deep Town's cavern: the two tall back walls built from 1/16 voxels with wavy layered
// strata (clay, shale, ochre sandstone in jointed blocks, a pale limestone band, a hard
// ledge, the upper burrow band and a cold overhang), mossy ledge tops, damp streaks,
// mineral veins and a fossil or two. Walls are meshed in chunks, camera-facing faces only.
import * as THREE from 'three';
import { reliefMesh, viewForYaw, ISO_BACK } from './mesher.js';
import { TOWN } from './townLayout.js';
import { hash2, noiseSampler } from './surface.js';

export const WV = 16; // wall voxels per unit
const DEPTH = 2.6; // grid depth in units (the face sits at FACE_D)
const FACE_D = 1.9; // where the nominal wall face is inside the grid (units from the back)
const CHUNK = 6; // units per chunk along the wall
const DIM_Y = 6.6; // above this the wall is in near darkness: simple shapes, flat tones
/** Walls and rims skip the outline pass (it would draw all their triangles a second time). */
const WALL_OUTLINE = false;

// strata from the floor up: [top height, color, relief (units, + = sticks out), kind]
const STRATA = [
  [0.34, 0x40342e, 0.06, 'base'],
  [1.22, 0x7a4c38, -0.04, 'clay'],
  [1.42, 0x3c3440, -0.1, 'shale'],
  [2.52, 0x98744a, 0.04, 'sand'],
  [2.78, 0xb6a68c, 0.16, 'lime'],
  [3.72, 0x6c5c50, 0.0, 'mud'],
  [4.02, 0x433842, -0.12, 'shale'],
  [4.36, 0x8c7e70, 0.52, 'ledge'],
  [5.74, 0x8a6a4e, -0.04, 'sand'],
  [6.12, 0x473b3c, -0.1, 'shale'],
  [9.5, 0x4a4250, 0.5, 'upper'],
];

const MOSS = [0x3f6a2c, 0x4f7f34, 0x66983e, 0x2f5222];
const VEINS = [0x4aa07a, 0xb85a3a, 0xe0b040, 0x6ac8d8];
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const mul = (c, k) => (cl(((c >> 16) & 255) * k) << 16) | (cl(((c >> 8) & 255) * k) << 8) | cl((c & 255) * k);
const mix = (a, b, t) => (cl(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) | (cl(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) | cl((a & 255) * (1 - t) + (b & 255) * t);

/**
 * Wall descriptions. N runs along x (face toward +z), W along z (face toward +x).
 * u is the distance along the wall in the wall's local space (for W it runs north from the south end).
 */
export function wallFrames() {
  const H = TOWN.wallH;
  return {
    N: { axis: 'N', u0: TOWN.westFace - 0.6, u1: TOWN.W, face: TOWN.northFace, H, yaw: 0, seed: 5 },
    W: { axis: 'W', u0: TOWN.northFace - 0.6, u1: TOWN.H, face: TOWN.westFace, H, yaw: Math.PI / 2, seed: 9 },
  };
}

/** World position of a wall-space point (u along, v up, d out from the face). */
export function wallToWorld(fr, u, v, d = 0) {
  if (fr.axis === 'N') return new THREE.Vector3(u, v, fr.face + d);
  return new THREE.Vector3(fr.face + d, v, fr.u1 - (u - fr.u0));
}
/** Wall-space u for a world point along the wall. */
export function worldToU(fr, x, z) { return fr.axis === 'N' ? x : fr.u0 + (fr.u1 - z); }

/**
 * Build a wall as chunked meshes. opts.flats: [{a, b, top, d}] (world-along ranges where the
 * rock is pressed flat to the face behind facades); opts.holes: [{a, b, y0, y1, depth}] openings.
 * Returns an array of THREE.Mesh placed in world space.
 */
export function buildWall(fr, opts = {}) {
  const out = [];
  const flats = (opts.flats || []).map((f) => ({ ...f, ua: worldUA(fr, f.a, f.b) }));
  const holes = (opts.holes || []).map((h) => ({ ...h, ua: worldUA(fr, h.a, h.b) }));
  const n1 = noiseSampler(3.2 * WV, fr.seed, 2, 0.5, 2000, 800);
  const n2 = noiseSampler(0.9 * WV, fr.seed + 7, 2, 0.5, 2000, 800);
  const view = viewForYaw(fr.yaw);
  for (let c0 = fr.u0; c0 < fr.u1 - 0.01; c0 += CHUNK) {
    const c1 = Math.min(fr.u1, c0 + CHUNK);
    const m = buildChunk(fr, c0, c1, { flats, holes, n1, n2, view });
    if (m) out.push(m);
  }
  return out;
}

function worldUA(fr, a, b) {
  if (fr.axis === 'N') return [a, b];
  const ua = worldToU(fr, 0, b), ub = worldToU(fr, 0, a);
  return [Math.min(ua, ub), Math.max(ua, ub)];
}

function buildChunk(fr, c0, c1, ctx) {
  const U = Math.round((c1 - c0) * WV), V = Math.round(fr.H * WV), D = Math.round(DEPTH * WV);
  const seed = fr.seed;
  const depth = new Int16Array(U * V); // front-most voxel index (exclusive) per column; 0 = no rock
  const col = new Uint32Array(U * V);
  const { n1, n2, flats, holes } = ctx;
  const F = FACE_D * WV;
  // per-column band boundaries (wavy) for this chunk
  const nb = STRATA.length;
  const bounds = new Float32Array(U * nb);
  for (let i = 0; i < U; i++) {
    const u = (c0 + (i + 0.5) / WV) * WV;
    for (let k = 0; k < nb; k++) {
      const wav = Math.sin(u * 0.021 + k * 1.7 + seed) * 1.4 + Math.sin(u * 0.0071 + k) * 2.2 + n2(u, k * 50) * 1.1;
      bounds[i * nb + k] = STRATA[k][0] * WV + (k === nb - 1 ? 0 : wav);
    }
  }
  for (let i = 0; i < U; i++) {
    const uw = c0 + (i + 0.5) / WV; // wall-space u (units)
    const u = uw * WV;
    let flat = null;
    for (const f of flats) if (uw > f.ua[0] - 0.02 && uw < f.ua[1] + 0.02) { flat = f; break; }
    for (let j = 0; j < V; j++) {
      // stratum
      let k = 0;
      while (k < nb - 1 && j >= bounds[i * nb + k]) k++;
      const [, bc, relief, kind] = STRATA[k];
      const bot = k ? bounds[i * nb + k - 1] : 0, top = bounds[i * nb + k];
      // jointed blocks: leaning joints at jittered spacing per band (parallel joint sets)
      const sp = kind === 'shale' ? 40 : kind === 'lime' ? 26 : kind === 'ledge' ? 36 : kind === 'upper' ? 44 : kind === 'base' ? 30 : 28;
      const lean = (hash2(k, 9, seed) - 0.5) * 0.9;
      const ju = u + hash2(k, 3, seed) * sp + (j - bot) * lean;
      const bi = Math.floor(ju / sp);
      const bl = ju - bi * sp;
      const br = hash2(bi, k, seed + 2), br2 = hash2(bi, k, seed + 3);
      const edgeV = Math.min(j - bot, top - 1 - j), edgeU = Math.min(bl, sp - 1 - bl);
      const patch = n2(u + 517, j * 1.3); // mottled patches (big enough to merge)
      // relief: band relief + block offset + slow bulges + lumps
      // (no voxel-scale lumps: they cost ~40% of the wall's triangles for little visible gain)
      // the top of the wall sits in near darkness (see caveAmbient): broad shapes only up there
      const dim = j > DIM_Y * WV;
      let dOff = relief * WV + (dim ? 0 : (br - 0.45) * 1.8 + n2(u, j) * 0.5) + n1(u, j) * 2.4;
      if (kind === 'ledge') dOff += Math.min(0, (top - j - 3)) * 0.8; // rounded nose
      if (kind === 'upper' && j > 6.35 * WV) dOff += Math.min(9, (j - 6.35 * WV) * 0.55); // overhang leans out
      if (kind === 'base') dOff += Math.max(0, 3 - j) * 0.5; // toe
      if (kind === 'sand' && (j - bot) % 6 === 0) dOff -= 0.6; // bedding planes
      const pit = !dim && hash2(i, j, seed + 41) < 0.003;
      if (pit) dOff -= 1;
      const joint = !dim && edgeU < 1 && br > 0.18; // some joints closed up
      if (!dim && (edgeV < 1 || joint)) dOff -= 1; // crisp joints between blocks and layers
      let d = Math.round(F + dOff);
      // pressed flat behind facades (up to their top), then rock resumes above
      if (flat && j < flat.top * WV) d = Math.round(F + (flat.d ?? -0.06) * WV);
      let tint = null;
      for (const h of holes) if (uw > h.ua[0] && uw < h.ua[1] && j >= h.y0 * WV && j < h.y1 * WV && (!h.shape || h.shape(uw, j / WV))) { d = Math.min(d, Math.round(F - h.depth * WV)); tint = h.tint || tint; }
      d = Math.max(1, Math.min(D, d));
      // color: band tone per block, mottled within, speckles, laminae, nodules, veins
      let c = mul(bc, 0.88 + Math.floor(br2 * 4) * 0.055 + (patch > 0.42 ? 0.05 : patch < -0.5 ? -0.04 : 0));
      if (dim) { depth[i + j * U] = Math.max(1, Math.min(D, d)); col[i + j * U] = mul(bc, 0.9 + Math.floor(br2 * 2) * 0.08); continue; }
      const hn = hash2(i, j, seed + k);
      if (hn < 0.012) c = mul(c, 0.8); else if (hn > 0.99) c = mul(c, 1.16);
      if (pit) c = mul(c, 0.6);
      if (kind === 'shale' && (j & 1)) c = mul(c, 0.86); // thin laminae
      if (kind === 'sand' && (j - bot) % 6 === 0) c = mul(c, 0.84);
      if (kind === 'sand' && Math.abs(Math.sin((j + u * 0.22 + br * 40) * 0.45)) > 0.95) c = mul(c, 0.9); // cross-bedding
      if ((kind === 'mud' || kind === 'clay') && hash2(i >> 2, j >> 2, seed + 9) > 0.94) c = mix(c, 0x9a8a78, 0.55); // nodules
      if (kind === 'lime' && hash2(i >> 1, j >> 1, seed + 19) > 0.9) c = mul(c, 0.86);
      if (edgeV < 1 || joint) c = mul(c, 0.66);
      // mineral veins: thin diagonal threads
      const vein = Math.sin((u * 0.55 + j * 0.9) * 0.18 + n1(u * 3, j) * 6);
      if (Math.abs(vein) < 0.035 && hash2(Math.floor(u / 40), Math.floor(j / 40), seed + 11) > 0.55) c = VEINS[Math.floor(hash2(Math.floor(u / 40), 0, seed + 12) * VEINS.length)];
      // damp streaks running down from the ledges
      const streak = hash2(Math.floor(u / 3), 0, seed + 13);
      if (streak > 0.86 && j < 4.0 * WV && j > (streak - 0.86) * 160) c = mul(c, 0.84);
      if (j < 0.6 * WV) c = mix(c, 0x2e2a2a, (0.6 * WV - j) / (0.6 * WV) * 0.45);
      if (tint) c = (cl(((c >> 16) & 255) * tint[0]) << 16) | (cl(((c >> 8) & 255) * tint[1]) << 8) | cl((c & 255) * tint[2]);
      depth[i + j * U] = d;
      col[i + j * U] = c;
    }
  }
  // moss on ledge tops (column whose voxel above is set back), and hanging moss below lips
  for (let i = 0; i < U; i++) for (let j = 1; j < V - 1; j++) {
    const q = i + j * U;
    const d = depth[q], up = depth[q + U];
    if (d - up >= 2 && j < 6.2 * WV && n2(i * 2.3 + c0 * WV, j * 3) > -0.15) {
      // moss in short runs of one tone (per-voxel tones would cost a face each)
      const run = Math.floor((i + c0 * WV) / 3);
      const h = hash2(run, j, seed + 21);
      if (h < 0.85) col[q] = MOSS[Math.floor(hash2(j, run, seed) * 4)];
      // drips of moss over the edge
      const drip = Math.floor(hash2(i >> 1, 0, seed + j) * 4);
      for (let t = 1; t <= drip && j - t > 0; t++) col[q - t * U] = MOSS[(t + (i >> 1)) % 4];
    }
  }
  // a few ammonite fossils in the soft bands
  for (let f = 0; f < 2; f++) {
    if (hash2(Math.floor(c0), f, seed + 31) < 0.55) continue;
    const fi = Math.floor(hash2(Math.floor(c0), f, seed + 32) * (U - 12)) + 6, fj = Math.floor((0.6 + hash2(Math.floor(c0), f, seed + 33) * 2.8) * WV);
    for (let a = 0; a < 26; a++) {
      const t = a / 26 * Math.PI * 4.2, r = 0.6 + a * 0.17;
      const x = Math.round(fi + Math.cos(t) * r), y = Math.round(fj + Math.sin(t) * r);
      if (x >= 0 && y >= 0 && x < U && y < V) col[x + y * U] = mix(col[x + y * U], 0xd8ccb8, 0.75);
    }
  }
  const mesh = reliefMesh(depth, col, U, V, { scale: 1 / WV, view: ctx.view, aoMin: 2, outline: WALL_OUTLINE });
  if (fr.axis === 'N') mesh.position.set(c0, 0, fr.face - FACE_D);
  else {
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(fr.face - FACE_D, 0, fr.u1 - (c0 - fr.u0));
  }
  return mesh;
}

/** Height of the wall face (relief) is irregular; this is the nominal top of the ledge band. */
export const LEDGE_Y = 4.36;

// ---------------------------------------------------------------- low rocky rims (foreground)
/** Camera "back" vector in an object's local space (for meshing rotated statics). */
export function localView(obj) {
  obj.updateMatrixWorld(true);
  const q = new THREE.Quaternion();
  obj.getWorldQuaternion(q);
  return ISO_BACK.clone().applyQuaternion(q.invert());
}

/**
 * A heightfield of rock over a world rect (x0..x1, z0..z1); height(x, z) → units, color(x, z, h) → hex.
 * Meshed as a relief lying on its back (columns grow up +y).
 */
export function terrain(x0, z0, x1, z1, height, color, res = WV) {
  const U = Math.round((x1 - x0) * res), V = Math.round((z1 - z0) * res);
  const depth = new Int16Array(U * V), col = new Uint32Array(U * V);
  for (let v = 0; v < V; v++) {
    const z = z1 - (v + 0.5) / res;
    for (let u = 0; u < U; u++) {
      const x = x0 + (u + 0.5) / res;
      const h = height(x, z);
      const d = Math.max(0, Math.round(h * res));
      depth[u + v * U] = d;
      if (d) col[u + v * U] = color(x, z, h, d);
    }
  }
  const holder = new THREE.Object3D();
  holder.rotation.x = -Math.PI / 2;
  const view = localView(holder);
  const mesh = reliefMesh(depth, col, U, V, { scale: 1 / res, view, aoMin: 1, outline: WALL_OUTLINE });
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x0, 0, z1);
  return mesh;
}

const RIM_ROCK = [0x5e4c4c, 0x6a5650, 0x54443f, 0x76625a];
/** Rim voxels per unit: the rims are dark foreground silhouettes, 1/12 keeps them light. */
const RIM_RES = 12;
/** The south and east rims: a crest of rock with boulders and moss, falling away into the dark. */
export function buildRims() {
  const S = TOWN.southRim, E = TOWN.eastRim;
  const n1 = noiseSampler(1.6 * WV, 71, 3, 0.5, 700, 700);
  const n2 = noiseSampler(0.35 * WV, 72, 1, 0.5, 700, 700);
  const prof = (t, x, z) => {
    // t = distance outward from the rim's inner edge
    const crest = 0.55 + n1(x * WV, z * WV) * 0.5;
    const hi = 0.75 + n1(x * WV + 300, z * WV) * 0.55;
    let h;
    if (t < crest) h = hi * Math.pow(Math.max(0, (t + 0.3) / (crest + 0.3)), 0.7);
    else h = hi * Math.max(0, 1 - (t - crest) / 2.2);
    // boulders
    const b = n2(x * WV, z * WV);
    if (b > 0.35) h += (b - 0.35) * 0.9;
    return Math.max(0, h + n2(x * WV + 99, z * WV) * 0.05);
  };
  // colors come in patches (rock tone per jittered cell, stepped fade, moss in clumps) so the
  // relief mesher can merge big faces: per-texel noise here used to cost ~60k triangles
  const color = (x, z, h, d) => {
    const t = Math.max(z - S, x - E);
    const fade = Math.max(0.12, 1 - Math.round(Math.max(0, t - 0.6) * 0.45 * 6) / 6);
    const cell = n2(x * WV * 0.5 + 40, z * WV * 0.5);
    let c = RIM_ROCK[Math.floor((cell * 0.5 + 0.5) * 3.99) & 3];
    const hn = hash2(Math.floor(x * WV), Math.floor(z * WV), 74);
    if (hn < 0.012) c = mul(c, 0.78); else if (hn > 0.99) c = mul(c, 1.15);
    if (d % 3 === 0) c = mul(c, 0.92); // terraced strata on the slopes
    if (h > 0.55 && n1(x * WV * 2.1, z * WV * 2.1) > 0.05) c = MOSS[(n1(x * WV * 5, z * WV * 5) > 0 ? 1 : 0) + (d % 2 ? 2 : 0)];
    return mul(c, fade);
  };
  const out = [];
  for (let x = 0; x < TOWN.W; x += 9) out.push(terrain(x, S - 0.3, Math.min(TOWN.W, x + 9), TOWN.H, (xx, zz) => prof(Math.max(zz - S, xx - E), xx, zz), color, RIM_RES));
  for (let z = 0; z < S - 0.3; z += 9) out.push(terrain(E - 0.3, z, TOWN.W, Math.min(S - 0.3, z + 9), (xx, zz) => prof(xx - E, xx, zz), color, RIM_RES));
  return out;
}
