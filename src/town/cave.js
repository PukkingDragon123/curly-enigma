// Deep Town's cavern, closed all round for first person: four rock walls in wavy strata (clay,
// shale, ochre sandstone in jointed blocks, a pale limestone band, the hard ledge the upper
// burrows sit on, darker bands up into the dark), meshed as reliefs with every face, 1/16 TU
// up to the ledges and 1/8 TU above; a squarish dome ceiling with lumps, the lift shaft and the
// crack the sunbeam pours through; and rubble slopes at the foot of the back-lane walls.
// Everything is built in town units, in world placement (the scene scales the town by M).
import * as THREE from 'three';
import { TOWN } from '../iso/townLayout.js';
import { hash2, noiseSampler } from '../iso/surface.js';
import { reliefBuffers, reliefGeometry } from './relief.js';
import { voxelMaterial } from '../gfx/Voxel.js';

export const FACE_D = 1.9; // TU from a wall's back plane to its nominal face
const LOW_TOP = 7.5; // fine (1/16) relief below this height, coarse (1/8) above
const CHUNK = 6;

// strata from the floor up: [top height, colour, relief (TU, + sticks out), kind]
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
  [8.6, 0x4a4250, 0.5, 'upper'],
  [9.4, 0x5a4a44, 0.1, 'sand'],
  [11.6, 0x3e3844, -0.1, 'shale'],
  [13.2, 0x6a5a50, 0.25, 'lime'],
  [99, 0x3a3440, 0.3, 'crown'],
];
const MOSS = [0x3f6a2c, 0x4f7f34, 0x66983e, 0x2f5222];
const VEINS = [0x4aa07a, 0xb85a3a, 0xe0b040, 0x6ac8d8];
const cl = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const mul = (c, k) => (cl(((c >> 16) & 255) * k) << 16) | (cl(((c >> 8) & 255) * k) << 8) | cl((c & 255) * k);
const mix = (a, b, t) => (cl(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) | (cl(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) | cl((a & 255) * (1 - t) + (b & 255) * t);

/**
 * The four walls. Wall space: u along the wall, y up, d out of the rock from the back plane
 * (the face sits at d = FACE_D). along × up = out, so the relief meshes keep their winding.
 */
export function wallFrames() {
  const T = TOWN, ext = 1.6;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const fr = (axis, along, out, P0, u0, u1, seed) => ({ axis, along: V3(...along), out: V3(...out), P0: V3(...P0), u0, u1, seed, yaw: Math.atan2(out[0], out[2]) });
  return {
    N: fr('N', [1, 0, 0], [0, 0, 1], [0, 0, T.northFace - FACE_D], T.westFace - ext, T.eastFace + ext, 5),
    W: fr('W', [0, 0, -1], [1, 0, 0], [T.westFace - FACE_D, 0, T.H], T.H - T.southFace - ext, T.H - T.northFace + ext, 9),
    E: fr('E', [0, 0, 1], [-1, 0, 0], [T.eastFace + FACE_D, 0, 0], T.northFace - ext, T.southFace + ext, 13),
    S: fr('S', [-1, 0, 0], [0, 0, -1], [T.W, 0, T.southFace + FACE_D], T.W - T.eastFace - ext, T.W - T.westFace + ext, 17),
  };
}

/** World point of a wall-space point: u along, y up, d out from the wall's FACE. */
export function wallPoint(fr, u, y, d = 0, out = new THREE.Vector3()) {
  return out.copy(fr.P0).addScaledVector(fr.along, u).addScaledVector(fr.out, FACE_D + d).setY(y);
}
/** Wall-space u of a world point. */
export function worldToU(fr, x, z) { return (x - fr.P0.x) * fr.along.x + (z - fr.P0.z) * fr.along.z; }

function rangeU(fr, a, b) {
  // a, b: world coordinates along the wall's axis (x for N/S, z for W/E)
  const pa = fr.axis === 'N' || fr.axis === 'S' ? worldToU(fr, a, 0) : worldToU(fr, 0, a);
  const pb = fr.axis === 'N' || fr.axis === 'S' ? worldToU(fr, b, 0) : worldToU(fr, 0, b);
  return [Math.min(pa, pb), Math.max(pa, pb)];
}

/** A matrix taking relief-local (u, v, depth) × scale to the world. */
function frameMatrix(along, up, out, origin) {
  return new THREE.Matrix4().makeBasis(along, up, out).setPosition(origin);
}

/**
 * Build all four walls. opts.flats[axis]: [{a, b, top, d}] world ranges where the rock is pressed
 * to face + d (TU) up to `top`; opts.holes[axis]: [{a, b, y0, y1, depth, shape(du, y), tint}].
 * Returns { meshes: [THREE.Mesh] (world TU), frames }.
 */
export function buildWalls(opts = {}) {
  const frames = wallFrames();
  const meshes = [];
  for (const fr of Object.values(frames)) {
    const flats = (opts.flats?.[fr.axis] || []).map((f) => ({ ...f, ua: rangeU(fr, f.a, f.b) }));
    const holes = (opts.holes?.[fr.axis] || []).map((h) => ({ ...h, ua: rangeU(fr, h.a, h.b), c: (h.a + h.b) / 2 }));
    const S = wallSampler(fr, flats, holes);
    for (let c0 = fr.u0; c0 < fr.u1 - 0.01; c0 += CHUNK) {
      const c1 = Math.min(fr.u1, c0 + CHUNK);
      const low = fr.axis === 'N' || fr.axis === 'W' ? LOW_TOP : 4.6;
      for (const [y0, y1, res] of [[0, low, 16], [low, TOWN.wallTop, 8]]) {
        const m = wallChunk(fr, S, c0, c1, y0, y1, res);
        if (m) meshes.push(m);
      }
    }
  }
  return { meshes, frames };
}

function wallSampler(fr, flats, holes) {
  const WV = 16;
  const seed = fr.seed;
  const n1 = noiseSampler(3.2 * WV, seed, 2, 0.5, 2000, 800);
  const n2 = noiseSampler(0.9 * WV, seed + 7, 2, 0.5, 2000, 800);
  const n3 = noiseSampler(5 * WV, seed + 13, 2, 0.5, 2000, 800);
  const nb = STRATA.length;
  const back = fr.axis === 'S' || fr.axis === 'E';
  const bounds = new Float32Array(nb);
  // world coordinate along the wall's axis (x for N/S, z for W/E) of a wall-space u
  const along = fr.axis === 'N' || fr.axis === 'S' ? (uw) => fr.P0.x + fr.along.x * uw : (uw) => fr.P0.z + fr.along.z * uw;
  let curU = NaN;
  let flat = null;
  /** Prepare column u (TU): strata boundaries, the flat it's in. */
  const column = (uw) => {
    curU = uw;
    const u = uw * WV;
    for (let k = 0; k < nb; k++) {
      const wav = Math.sin(u * 0.021 + k * 1.7 + seed) * 1.4 + Math.sin(u * 0.0071 + k) * 2.2 + n2(u + 40, k * 50) * 1.1;
      bounds[k] = STRATA[k][0] * WV + (k === nb - 1 ? 0 : wav);
    }
    flat = null;
    for (const f of flats) if (uw > f.ua[0] - 0.02 && uw < f.ua[1] + 0.02) { flat = f; break; }
  };
  /** Depth (voxels at 1/16 from the back plane) and colour at height j (1/16 units). */
  const sample = (j, res) => {
    const uw = curU, u = uw * WV;
    const F = FACE_D * WV;
    let k = 0;
    while (k < nb - 1 && j >= bounds[k]) k++;
    const [, bc, relief, kind] = STRATA[k];
    const bot = k ? bounds[k - 1] : 0, top = bounds[k];
    const sp = kind === 'shale' ? 40 : kind === 'lime' ? 26 : kind === 'ledge' ? 36 : kind === 'upper' || kind === 'crown' ? 44 : kind === 'base' ? 30 : 28;
    const lean = (hash2(k, 9, seed) - 0.5) * 0.9;
    const ju = u + hash2(k, 3, seed) * sp + (j - bot) * lean;
    const bi = Math.floor(ju / sp);
    const bl = ju - bi * sp;
    const br = hash2(bi, k, seed + 2), br2 = hash2(bi, k, seed + 3);
    const edgeV = Math.min(j - bot, top - 1 - j), edgeU = Math.min(bl, sp - 1 - bl);
    const patch = n2(u + 517, j * 1.3);
    const coarse = res < 16;
    let dOff = relief * WV + (coarse ? 0 : (br - 0.45) * 1.8 + n2(u, j) * 0.5) + n1(u, j) * 2.4;
    if (kind === 'ledge') dOff += Math.min(0, (top - j - 3)) * 0.8;
    if (kind === 'upper' && j > 6.35 * WV) dOff += Math.min(9, (j - 6.35 * WV) * 0.55) - Math.max(0, j - 8 * WV) * 0.3;
    if (kind === 'base') dOff += Math.max(0, 3 - j) * 0.5;
    if (kind === 'sand' && (j - bot) % 6 < 1) dOff -= 0.6;
    // the back-lane walls bulge in and out; everything leans back a little as it climbs to the roof
    if (back) dOff += n3(u, 300) * 9 + Math.sin(u * 0.012 + seed) * 4;
    else if (!flat) dOff += n3(u, 300) * 3;
    if (j > 9 * WV) dOff -= (j - 9 * WV) * 0.12;
    const pit = !coarse && hash2(Math.floor(u), Math.floor(j), seed + 41) < 0.003;
    if (pit) dOff -= 1;
    const joint = !coarse && edgeU < 1 && br > 0.18;
    if (!coarse && (edgeV < 1 || joint)) dOff -= 1;
    let d = F + dOff;
    if (flat && j < flat.top * WV) d = F + (flat.d ?? -0.06) * WV;
    let tint = null;
    for (const h of holes) if (uw > h.ua[0] && uw < h.ua[1] && j >= h.y0 * WV && j < h.y1 * WV && (!h.shape || h.shape(along(uw) - h.c, j / WV))) { d = Math.min(d, F - h.depth * WV); tint = h.tint || tint; }
    // colour
    let c = mul(bc, 0.88 + Math.floor(br2 * 4) * 0.055 + (patch > 0.42 ? 0.05 : patch < -0.5 ? -0.04 : 0));
    if (coarse) return [d, mul(bc, 0.9 + Math.floor(br2 * 2) * 0.08 + (patch > 0.3 ? 0.05 : 0))];
    const hn = hash2(Math.floor(u), Math.floor(j), seed + k);
    if (hn < 0.012) c = mul(c, 0.8); else if (hn > 0.99) c = mul(c, 1.16);
    if (pit) c = mul(c, 0.6);
    if (kind === 'shale' && (Math.floor(j) & 1)) c = mul(c, 0.86);
    if (kind === 'sand' && (j - bot) % 6 < 1) c = mul(c, 0.84);
    if (kind === 'sand' && Math.abs(Math.sin((j + u * 0.22 + br * 40) * 0.45)) > 0.95) c = mul(c, 0.9);
    if ((kind === 'mud' || kind === 'clay') && hash2(Math.floor(u) >> 2, Math.floor(j) >> 2, seed + 9) > 0.94) c = mix(c, 0x9a8a78, 0.55);
    if (kind === 'lime' && hash2(Math.floor(u) >> 1, Math.floor(j) >> 1, seed + 19) > 0.9) c = mul(c, 0.86);
    if (edgeV < 1 || joint) c = mul(c, 0.66);
    const vein = Math.sin((u * 0.55 + j * 0.9) * 0.18 + n1(u * 3, j) * 6);
    if (Math.abs(vein) < 0.035 && hash2(Math.floor(u / 40), Math.floor(j / 40), seed + 11) > 0.55) c = VEINS[Math.floor(hash2(Math.floor(u / 40), 0, seed + 12) * VEINS.length)];
    const streak = hash2(Math.floor(u / 3), 0, seed + 13);
    if (streak > 0.86 && j < 4.0 * WV && j > (streak - 0.86) * 160) c = mul(c, 0.84);
    if (j < 0.6 * WV) c = mix(c, 0x2e2a2a, (0.6 * WV - j) / (0.6 * WV) * 0.45);
    if (tint) c = (cl(((c >> 16) & 255) * tint[0]) << 16) | (cl(((c >> 8) & 255) * tint[1]) << 8) | cl((c & 255) * tint[2]);
    return [d, c];
  };
  return { column, sample, seed };
}

function wallChunk(fr, S, c0, c1, y0, y1, res) {
  const U = Math.round((c1 - c0) * res), V = Math.round((y1 - y0) * res);
  if (U <= 0 || V <= 0) return null;
  const B = reliefBuffers(U, V);
  const k16 = 16 / res;
  for (let i = -1; i <= U; i++) {
    const uw = c0 + (i + 0.5) / res;
    S.column(Math.max(fr.u0 - 0.5, uw));
    for (let j = -1; j <= V; j++) {
      const y = y0 + (j + 0.5) / res;
      const [d16, c] = S.sample(y * 16, res);
      let d = Math.max(1, Math.round(d16 / k16));
      // seams: close the wall's ends and the joint between the fine and coarse bands
      if (i < 0 && c0 <= fr.u0) d = 0;
      if (i >= U && c1 >= fr.u1) d = 0;
      if (j < 0) d = y0 === 0 ? Math.max(1, Math.round(S.sample(0.5 * k16, res)[0] / k16)) : 0;
      if (j >= V) d = y1 >= TOWN.wallTop ? d : 0;
      B.set(i, j, d, c);
    }
  }
  if (res === 16) mossPass(B, U, V, c0, S.seed);
  const geo = reliefGeometry(B.depth, B.color, U, V, { scale: 1 / res, aoMin: res === 16 ? 2 : 1, tag: 'wall' + fr.axis + res });
  if (!geo) return null;
  geo.applyMatrix4(frameMatrix(fr.along, new THREE.Vector3(0, 1, 0), fr.out, wallOrigin(fr, c0, y0)));
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, voxelMaterial('toon'));
}

function wallOrigin(fr, u, y) { return fr.P0.clone().addScaledVector(fr.along, u).setY(y); }

/** Moss on ledge tops (where the column above is set back) and drips of moss over the lip. */
function mossPass(B, U, V, c0, seed) {
  const n2 = noiseSampler(14, seed + 7, 2, 0.5, 2000, 800);
  const { depth, color, PW } = B;
  const I = (u, v) => u + 1 + (v + 1) * PW;
  for (let i = 0; i < U; i++) for (let j = 1; j < V - 1; j++) {
    const q = I(i, j);
    const d = depth[q], up = depth[I(i, j + 1)];
    if (d - up >= 2 && j < 6.2 * 16 && n2(i * 2.3 + c0 * 16, j * 3) > -0.15) {
      const run = Math.floor((i + c0 * 16) / 3);
      if (hash2(run, j, seed + 21) < 0.85) color[q] = MOSS[Math.floor(hash2(j, run, seed) * 4)];
      const drip = Math.floor(hash2(i >> 1, 0, seed + j) * 4);
      for (let t = 1; t <= drip && j - t > 0; t++) color[I(i, j - t)] = MOSS[(t + (i >> 1)) % 4];
    }
  }
}

// ---------------------------------------------------------------- the ceiling
let CEIL = null;
/** Ceiling height (TU) at a world point; features: the lift shaft and the sun crack. */
export function ceilingAt(x, z) {
  if (!CEIL) CEIL = makeCeiling();
  return CEIL.h(x, z);
}
export function ceilingInfo() { if (!CEIL) CEIL = makeCeiling(); return CEIL; }

function makeCeiling() {
  const C = TOWN.ceiling;
  const n1 = noiseSampler(5 * 8, 61, 3, 0.5, 600, 600);
  const n2 = noiseSampler(1.2 * 8, 62, 1, 0.5, 600, 600);
  const L = TOWN.lift.cage;
  const sun = { x: 23.4, z: 4.9 }; // the crack the sunbeam pours through
  const shaft = { x0: L.x - 1.15, x1: L.x + 1.15, z0: L.z - 1.15, z1: L.z + 1.15 };
  const h = (x, z) => {
    const dx = (x - C.cx) / C.rx, dz = (z - C.cz) / C.rz;
    const r = Math.pow(dx ** 4 + dz ** 4, 0.25);
    let y = C.edge + (C.top - C.edge) * (1 - Math.pow(Math.min(1, r), 2.2)) - Math.max(0, r - 1) * 6;
    y += n1(x * 8, z * 8) * 1.6 + n2(x * 8, z * 8) * 0.35;
    // the lift shaft: straight up into the dark
    if (x > shaft.x0 && x < shaft.x1 && z > shaft.z0 && z < shaft.z1) y = C.base - 0.6;
    // the sun crack: a narrow jagged slot
    const sx = x - sun.x, sz = z - sun.z;
    const along = sx * 0.8 + sz * 0.6, across = -sx * 0.6 + sz * 0.8;
    const w = 0.42 + Math.sin(along * 3.1) * 0.12 + n2(x * 8 + 90, z * 8) * 0.1;
    if (Math.abs(along) < 1.5 && Math.abs(across) < w * (1 - Math.abs(along) / 1.7)) y = C.base - 0.4;
    return y;
  };
  return { h, sun: { x: sun.x, y: C.base - 0.5, z: sun.z }, shaft };
}

const CEIL_COLS = [0x5a4e5c, 0x645664, 0x6e6068, 0x584e66, 0x726470];
/** The ceiling relief (hangs down from TOWN.ceiling.base). Returns [Mesh] in world TU. */
export function buildCeiling() {
  const info = ceilingInfo();
  const C = TOWN.ceiling;
  const res = 4, CH = 12;
  const out = [];
  const x0 = 0, z0 = 0, x1 = TOWN.W, z1 = TOWN.H;
  for (let cz = z0; cz < z1; cz += CH) for (let cx = x0; cx < x1; cx += CH) {
    const U = Math.round(Math.min(CH, x1 - cx) * res), V = Math.round(Math.min(CH, z1 - cz) * res);
    const B = reliefBuffers(U, V);
    for (let v = -1; v <= V; v++) for (let u = -1; u <= U; u++) {
      const x = cx + (u + 0.5) / res, z = cz + (v + 0.5) / res;
      const y = info.h(x, z);
      const d = Math.max(1, Math.round((C.base - y) * res));
      // colour: banded by height like contour strata, mottled in big patches
      const band = Math.floor(y * 0.9 + hash2(Math.floor(x * 0.4), Math.floor(z * 0.4), 3) * 0.5);
      let c = CEIL_COLS[((band % CEIL_COLS.length) + CEIL_COLS.length) % CEIL_COLS.length];
      if (hash2(Math.floor(x), Math.floor(z), 7) < 0.06) c = mul(c, 0.8);
      if (y > C.base - 1) c = 0x1a1418;
      B.set(u, v, d, c);
    }
    const geo = reliefGeometry(B.depth, B.color, U, V, { scale: 1 / res, aoMin: 1, tag: 'ceiling' });
    if (!geo) continue;
    // u → +x, v → +z, depth → −y (x × z = −y keeps the winding)
    geo.applyMatrix4(frameMatrix(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0), new THREE.Vector3(cx, C.base, cz)));
    geo.computeBoundingSphere();
    out.push(new THREE.Mesh(geo, voxelMaterial('toon')));
  }
  return out;
}

// ---------------------------------------------------------------- rubble slopes at the wall foot
const TALUS = [0x5e4c4c, 0x6a5650, 0x54443f, 0x76625a];
/**
 * Rubble banks along the back-lane walls (south, east, and the far ends of north and west).
 * keep(x, z) → false where the bank must stay clear (doors, paths). Returns [Mesh] in world TU.
 */
export function buildTalus(keep = () => true) {
  const res = 8;
  const n1 = noiseSampler(1.6 * 16, 71, 3, 0.5, 900, 900);
  const n2 = noiseSampler(0.35 * 16, 72, 1, 0.5, 900, 900);
  const T = TOWN;
  const dist = (x, z) => Math.min(T.southFace - z, T.eastFace - x, z - T.northFace + (x > 34 ? 0 : 99), x - T.westFace + (z > 27 ? 0 : 99));
  const height = (x, z) => {
    const t = dist(x, z);
    if (t > 2.2 || !keep(x, z)) return 0;
    const crest = 0.9 + n1(x * 16, z * 16) * 0.5;
    let h = crest * Math.max(0, 1 - t / 2.2) ** 1.4;
    const b = n2(x * 16, z * 16);
    if (b > 0.3) h += (b - 0.3) * 0.8 * Math.max(0, 1 - t / 2.6);
    return Math.max(0, h);
  };
  const color = (x, z, h, d) => {
    const cell = n2(x * 8 + 40, z * 8);
    let c = TALUS[Math.floor((cell * 0.5 + 0.5) * 3.99) & 3];
    const hn = hash2(Math.floor(x * 16), Math.floor(z * 16), 74);
    if (hn < 0.015) c = mul(c, 0.78); else if (hn > 0.99) c = mul(c, 1.15);
    if (d % 3 === 0) c = mul(c, 0.92);
    if (h < 0.5 && n1(x * 34, z * 34) > 0.1) c = MOSS[(n1(x * 80, z * 80) > 0 ? 1 : 0) + (d % 2 ? 2 : 0)];
    return c;
  };
  const out = [];
  const strips = [[T.westFace - 0.5, T.southFace - 2.6, T.eastFace + 0.5, T.southFace + 0.6], [T.eastFace - 2.6, T.northFace - 0.5, T.eastFace + 0.6, T.southFace - 2.6],
    [T.westFace - 0.6, 27, T.westFace + 2.6, T.southFace - 2.6], [34, T.northFace - 0.6, T.eastFace - 2.6, T.northFace + 2.6]];
  for (const [sx0, sz0, sx1, sz1] of strips) {
    for (let cx = sx0; cx < sx1 - 0.01; cx += 10) for (let cz = sz0; cz < sz1 - 0.01; cz += 10) {
      const ex = Math.min(sx1, cx + 10), ez = Math.min(sz1, cz + 10);
      const U = Math.round((ex - cx) * res), V = Math.round((ez - cz) * res);
      const B = reliefBuffers(U, V);
      let any = false;
      for (let v = -1; v <= V; v++) for (let u = -1; u <= U; u++) {
        // v runs toward −z (u → +x, v → −z, depth → +y)
        const x = cx + (u + 0.5) / res, z = ez - (v + 0.5) / res;
        const h = height(x, z);
        const d = Math.round(h * res);
        if (d > 0 && u >= 0 && v >= 0 && u < U && v < V) any = true;
        B.set(u, v, d, d ? color(x, z, h, d) : 0);
      }
      if (!any) continue;
      const geo = reliefGeometry(B.depth, B.color, U, V, { scale: 1 / res, aoMin: 1, sideShade: 0.86, tag: 'talus' });
      if (!geo) continue;
      geo.applyMatrix4(frameMatrix(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(cx, 0, ez)));
      geo.computeBoundingSphere();
      out.push(new THREE.Mesh(geo, voxelMaterial('toon')));
    }
  }
  return out;
}
