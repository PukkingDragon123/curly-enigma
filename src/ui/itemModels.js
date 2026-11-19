// Where an item's 3D model comes from (what the mole holds in first person: src/fps/viewmodel/held.js).
// Wherever the game already has the thing in 3D, that model is used:
//   plants and mushrooms   the gathering close-ups (deep/gather/models.js plantModel): head, stem, bulb
//   ore and gems           the clump's ore core (deep/clumps/grid.js), cleaned, on a crumb of its rock
//   cooked dishes          the kitchen's servings (cooking/dishVox.js)
//   tools                  the paws' view-model tools (fps/viewmodel/parts.js, smith.js) and the
//                          building part's axes, spades, shears and blocks (deep/build/models.js)
//   explosives             the mine's sticks, bundles and charges (deep/explosives/models.js)
//   furniture              the home's builders (iso/furniture.js)
//   forged weapons         the forge's finished-weapon model (forge/bladeView.js) on the plan profile
// and everything else common is built here as voxels (./itemBuild.js: ingots, plans, critters,
// drops, ingredients, gear...). Only what has no shape of its own (a ticket, a letter) is the old
// flat icon, extruded.
//
//   itemMesh(key) → { M, real, pose, src } | null    M: { P, N, C, G, I, vox, orient } triangle arrays,
//                                                    normalized (largest side 1, x/z centred, on y = 0)
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { METALS, WEAPON_TYPES } from '../data/weapons.js';
import { ORE_ID } from '../data/ores.js';
import { DISHES } from '../data/recipes.js';
import { meshProp, PGrid } from '../deep/props/grid.js';
import { meshGridGreedy } from '../gfx/Voxel.js';
import { drawIconSmall, ICON } from '../gfx/PixelArt.js';
import { hashStr } from '../core/util.js';
import { plantModel } from '../deep/gather/models.js';
import { FORAGE } from '../cooking/forage.js';
import { buildClump, ORE, ROCK } from '../deep/clumps/grid.js';
import { M as MAT } from '../deep/materials.js';
import { dishMesh } from '../cooking/dishVox.js';
import { pickGeo, chiselGeo, brushGeo, drillGeo, xrayGeo, stakeGeo, beamGeo } from '../fps/viewmodel/parts.js';
import { hammerGeo } from '../fps/viewmodel/smith.js';
import { heldGeo } from '../deep/build/models.js';
import { explosiveModel } from '../deep/explosives/models.js';
import { buildFurniture } from '../iso/furniture.js';
import { buildWeapon } from '../forge/bladeView.js';
import { HAFTED } from '../forge/bladeSim.js';
import { BUILD } from './itemBuild.js';

// ------------------------------------------------------------------ a mesh being gathered
const FACE_SHADE = { px: 0.86, nx: 0.8, py: 1, ny: 0.62, pz: 0.93, nz: 0.74 };
const shadeOfN = (x, y, z) => (x > 0.5 ? FACE_SHADE.px : x < -0.5 ? FACE_SHADE.nx : y > 0.5 ? FACE_SHADE.py : y < -0.5 ? FACE_SHADE.ny : z > 0.5 ? FACE_SHADE.pz : z < -0.5 ? FACE_SHADE.nz : 1);
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const LIN8 = new Float32Array(256).map((_, i) => lin(i / 255));
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();

class Buf {
  constructor() { this.P = []; this.N = []; this.C = []; this.G = []; this.I = []; this.vox = Infinity; }
  get n() { return this.P.length / 3; }
  /**
   * Append a triangle mesh. col(i) → [r, g, b] linear; nor may be null (face normals are worked
   * out); o: { matrix, glow (number or per-vertex fn), unbake (divide out baked face shading), vox }.
   */
  add(pos, nor, colOf, idx, nv, o = {}) {
    const base = this.n, m = o.matrix || null;
    if (m) _m3.getNormalMatrix(m);
    const scale = m ? Math.cbrt(Math.abs(m.determinant())) : 1;
    if (o.vox) this.vox = Math.min(this.vox, o.vox * scale);
    const flat = !nor;
    for (let i = 0; i < nv; i++) {
      _v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      if (m) _v.applyMatrix4(m);
      this.P.push(_v.x, _v.y, _v.z);
      let nx = 0, ny = 1, nz = 0;
      if (!flat) { nx = nor[i * 3]; ny = nor[i * 3 + 1]; nz = nor[i * 3 + 2]; }
      const c = colOf(i);
      let r = c[0], g = c[1], b = c[2];
      if (o.unbake && !flat) { const s = shadeOfN(nx, ny, nz); r /= s; g /= s; b /= s; }
      if (m && !flat) { _n.set(nx, ny, nz).applyMatrix3(_m3).normalize(); nx = _n.x; ny = _n.y; nz = _n.z; }
      this.N.push(nx, ny, nz);
      this.C.push(Math.min(1, r), Math.min(1, g), Math.min(1, b));
      this.G.push(typeof o.glow === 'function' ? o.glow(i) : o.glow || 0);
    }
    for (let t = 0; t < idx.length; t++) this.I.push(base + idx[t]);
    if (flat) this.faceNormals(base);
  }
  faceNormals(from) {
    const P = this.P, I = this.I, N = this.N;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      if (a < from) continue;
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (const k of [a, b, c]) { N[k * 3] = nx; N[k * 3 + 1] = ny; N[k * 3 + 2] = nz; }
    }
  }
  /** A three.js geometry (position, normal, color (linear floats) or aCol (sRGB bytes + glow)). */
  geo(g, o = {}) {
    if (!g?.attributes?.position) return;
    const pos = g.attributes.position.array, nv = g.attributes.position.count;
    const nA = g.attributes.normal, nor = nA ? Float32Array.from({ length: nv * 3 }, (_, i) => nA.getComponent(Math.floor(i / 3), i % 3)) : null;
    const cA = g.attributes.color, aA = g.attributes.aCol;
    const tint = o.tint ? [o.tint.r, o.tint.g, o.tint.b] : [1, 1, 1];
    let colOf, glow = o.glow;
    if (aA) {
      const a = aA.array, norm = aA.normalized || a instanceof Uint8Array;
      colOf = (i) => (norm ? [LIN8[a[i * 4]], LIN8[a[i * 4 + 1]], LIN8[a[i * 4 + 2]]] : [lin(a[i * 4]), lin(a[i * 4 + 1]), lin(a[i * 4 + 2])]);
      glow = (i) => (o.glow || 0) + (norm ? a[i * 4 + 3] / 255 : a[i * 4 + 3]) * 0.75;
    } else if (cA) {
      const a = cA.array, isByte = a instanceof Uint8Array;
      colOf = (i) => (isByte ? [LIN8[a[i * 3]] * tint[0], LIN8[a[i * 3 + 1]] * tint[1], LIN8[a[i * 3 + 2]] * tint[2]] : [a[i * 3] * tint[0], a[i * 3 + 1] * tint[1], a[i * 3 + 2] * tint[2]]);
    } else colOf = () => tint;
    const idx = g.index ? g.index.array : Uint32Array.from({ length: nv }, (_, i) => i);
    this.add(pos, nor, colOf, idx, nv, { ...o, glow });
  }
  /** A PGrid, meshed with the props mesher (AO baked in, glow levels kept). */
  pgrid(grid, o = {}) {
    const m = meshProp(grid, { pivot: o.pivot ?? [grid.w / 2, 0, grid.d / 2], scale: 1, ao: true });
    if (!m.nv) return;
    const nor = new Float32Array(m.nv * 3);
    for (let i = 0; i < m.nv * 3; i++) nor[i] = m.nor[i] / 127;
    const col = m.col, glw = m.glw;
    this.add(m.pos, nor, (i) => [LIN8[col[i * 3]], LIN8[col[i * 3 + 1]], LIN8[col[i * 3 + 2]]], m.idx.subarray(0, m.ni ?? m.idx.length), m.nv, { ...o, vox: 1, glow: (i) => Math.min(1.2, glw[i] * 0.8) });
  }
  /** Every visible mesh under a three.js object (its world matrices applied). */
  object(obj, o = {}) {
    obj.updateMatrixWorld(true);
    obj.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      for (let p = m; p; p = p.parent) if (!p.visible) return;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      if (mat && (mat.transparent && mat.opacity < 0.5 || mat.blending === THREE.AdditiveBlending || mat.visible === false)) return;
      const basic = !!mat?.isMeshBasicMaterial;
      const tint = mat?.color && !m.geometry.attributes.color && !m.geometry.attributes.aCol ? mat.color : null;
      const emis = mat?.emissive ? Math.max(mat.emissive.r, mat.emissive.g, mat.emissive.b) * (mat.emissiveIntensity ?? 1) : 0;
      const glow = basic ? 0.55 : Math.min(0.8, emis * 1.2);
      if (m.isInstancedMesh) {
        const im = new THREE.Matrix4();
        for (let k = 0; k < m.count; k++) { m.getMatrixAt(k, im); this.geo(m.geometry, { ...o, matrix: new THREE.Matrix4().multiplyMatrices(m.matrixWorld, im), unbake: basic, glow, tint }); }
      } else this.geo(m.geometry, { ...o, matrix: m.matrixWorld, unbake: basic || o.unbake, glow, tint });
    });
  }
}

// ------------------------------------------------------------------ orientation and normalizing
/**
 * Pose and normalize. orient: 'stand' (as built, +y up) | 'lay' (rests on its broadest side, its
 * longest axis running up-right across the frame, the + end of that axis to the far end) | 'flat'
 * (a sheet: lies face up).
 */
function finish(b, orient = 'stand', o = {}) {
  const n = b.n;
  if (!n || !b.I.length) return null;
  let P = Float32Array.from(b.P), N = Float32Array.from(b.N);
  const C = Float32Array.from(b.C), G = Float32Array.from(b.G), I = Uint32Array.from(b.I);
  const box = () => {
    const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) { const v = P[i * 3 + a]; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    return { lo, hi, e: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
  };
  let bb = box();
  if (orient === 'lay' || orient === 'flat') {
    // basis: the long axis → x, the thin axis → y (up), the third → z
    const ax = [0, 1, 2].sort((p, q) => bb.e[p] - bb.e[q]);
    const thin = o.up ?? ax[0], long = o.along ?? ax[2];
    const third = 3 - thin - long;
    const E = (k) => [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0];
    const X = E(long).map((v) => v * (o.flipLong ? -1 : 1)), Y = E(thin).map((v) => v * (o.flipUp ? -1 : 1));
    const Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
    const tr = (A, i) => [A[i] * X[0] + A[i + 1] * X[1] + A[i + 2] * X[2], A[i] * Y[0] + A[i + 1] * Y[1] + A[i + 2] * Y[2], A[i] * Z[0] + A[i + 1] * Z[1] + A[i + 2] * Z[2]];
    const P2 = new Float32Array(P.length), N2 = new Float32Array(N.length);
    for (let i = 0; i < P.length; i += 3) { const p = tr(P, i), q = tr(N, i); P2.set(p, i); N2.set(q, i); }
    P = P2; N = N2;
    void third;
    bb = box();
  }
  const s = 1 / Math.max(bb.e[0], bb.e[1], bb.e[2], 1e-6);
  const cx = (bb.lo[0] + bb.hi[0]) / 2, cz = (bb.lo[2] + bb.hi[2]) / 2, y0 = bb.lo[1];
  for (let i = 0; i < P.length; i += 3) { P[i] = (P[i] - cx) * s; P[i + 1] = (P[i + 1] - y0) * s; P[i + 2] = (P[i + 2] - cz) * s; }
  const vox = (isFinite(b.vox) ? b.vox : Math.max(...bb.e) / 32) * s;
  return { P, N, C, G, I, vox, orient };
}
// how each orientation is looked at (a 3/4 view; kept for anyone drawing a model's picture)
export const POSES = {
  stand: { yaw: -0.62, pitch: 0.46 },
  lay: { yaw: 0.86, pitch: 0.74 },
  flat: { yaw: 0.42, pitch: 0.98 },
};

// ------------------------------------------------------------------ the sources
/** A plant pulled from the soil: head on its stem, the bulb or root under it (gather close-ups). */
const EXTRA_PLANTS = {
  // the kitchen's brown mushrooms: the cap form, in the browns of the mushrooms in the hollows
  mushroom: { form: 'cap', col: { cap: 0x9a6038, hi: 0xd8a870, gill: 0xe8d4b0, stem: 0xe8dcc4, spot: 0xf0dcb8 }, caps: 2 },
};
function plant(id) {
  const spec = FORAGE[id] || EXTRA_PLANTS[id];
  if (!spec || !['cap', 'root', 'herb', 'flower', 'bulb', 'hang'].includes(spec.form)) return null;
  const pm = plantModel(id, spec, 3);
  if (!pm?.stem) return null;
  const b = new Buf();
  const mat = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const vox = pm.S;
  b.geo(pm.stem, { vox });
  if (pm.head) b.geo(pm.head, { matrix: mat(0, pm.stemLen, 0), vox });
  if (pm.body?.geo && spec.form !== 'cap') b.geo(pm.body.geo, { vox }); // (a mushroom comes up clean: no clod)
  for (const e of pm.extras || []) if (e.geo) b.geo(e.geo, { matrix: mat(...(e.pos || [0, 0, 0])), vox });
  for (const g of [pm.stem, pm.head, pm.body?.geo, ...(pm.extras || []).map((e) => e.geo)]) g?.dispose?.();
  const orient = spec.form === 'root' || spec.form === 'hang' ? 'lay' : 'stand';
  return finish(b, orient, orient === 'lay' ? { flipLong: spec.form === 'root' } : {});
}

/** Ore and gems: the clump's core, cleaned, sitting on a crumb of its host rock. */
const ROCK_OF = { coal: MAT.STONE, fossil: MAT.LIMESTONE, salt_crystal: MAT.LIMESTONE, amber: MAT.MUDSTONE, amber_bug: MAT.MUDSTONE, obsidian_shard: MAT.BASALT, frostite: MAT.PERMAFROST, magmaite: MAT.MAGMAROCK, voidstone: MAT.VOIDROCK, starmetal_ore: MAT.STARROCK, sunstone: MAT.BASALT, echo_crystal: MAT.CRYSTALROCK, diamond: MAT.BASALT };
function clump(id) {
  const it = ITEMS[id];
  if (!it || !(it.cat === 'mineral' || it.cat === 'gem' || id === 'truffle')) return null;
  const gem = it.cat === 'gem';
  const rock = ROCK_OF[id] ?? (gem ? MAT.GRANITE : MAT.STONE);
  const g = buildClump({ seed: hashStr(id) % 9973 + 11, item: id, oreId: ORE_ID[id] ?? 1, R: gem ? 12 : 13, crust: MAT.DIRT, rock, peb: MAT.LIMESTONE, coat: 1 });
  const n = g.n, K = g.kind;
  // the ore's extent; what's kept: the ore, and the rock within a cell or two of it underneath
  let cy = 0, cnt = 0, ymin = n;
  for (let i = 0; i < K.length; i++) if (K[i] === ORE) { const y = ((i / n) | 0) % n; cy += y; cnt++; if (y < ymin) ymin = y; }
  if (!cnt) return null;
  cy /= cnt;
  const near = (x, y, z, r) => { for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (g.at(x + dx, y + dy, z + dz) === ORE) return true; return false; };
  const P = new PGrid(n, n, n);
  const glow = it.glow || (ORE_ID[id] && /lumite|bioxide|magmaite|frostite|sunstone|echo|void/.test(id)) ? 1 : 0;
  const keepRock = id !== 'truffle' && !gem;
  for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = x + n * (y + n * z), k = K[i];
    if (k === ORE) P.set(x, y, z, g.pal[g.col[i]], glow);
    else if (k === ROCK && (keepRock || gem) && y < cy - (gem ? 1 : 0.5) && near(x, y, z, gem ? 1 : 2)) P.set(x, y, z, g.pal[g.col[i]], 0);
  }
  const b = new Buf();
  b.pgrid(P, { pivot: [n / 2, 0, n / 2] });
  return finish(b, 'stand');
}

/** A cooked dish in its bowl, mug, plate or jar. */
function dish(id) {
  if (!DISHES[id] || ITEMS[id]?.cat !== 'food') return null;
  const m = dishMesh(id, { R: 16, size: 1 });
  if (!m) return null;
  const b = new Buf();
  b.geo(m.geometry, { vox: 1 / 32 });
  m.geometry.dispose();
  return finish(b, 'stand');
}

/** The paws' tools, the building part's held things, explosives. */
function tool(id) {
  const it = ITEMS[id];
  if (!it) return null;
  const b = new Buf();
  const glowGeo = (g) => g && b.geo(g, { glow: 0.7, vox: 1 });
  let ok = true;
  if (/^pick_/.test(id) || id === 'tuck_pick') { const r = pickGeo(id === 'tuck_pick' ? 'pick_rusty' : id); b.geo(r.geo, { vox: 1 }); glowGeo(r.glow); }
  else if (/^chisel_/.test(id)) b.geo(chiselGeo(id), { vox: 1 });
  else if (/^brush_/.test(id)) b.geo(brushGeo(id), { vox: 1 });
  else if (/^drill_/.test(id)) { const r = drillGeo(id); b.geo(r.geo, { vox: 1 }); if (r.bitGeo) b.geo(r.bitGeo, { vox: 1, matrix: new THREE.Matrix4().makeTranslation(...(r.chuck || [0, 0, 0])) }); }
  else if (/^xray_/.test(id)) { const r = xrayGeo(id); b.geo(r.geo, { vox: 1 }); if (r.lensGeo) b.geo(r.lensGeo, { vox: 1, glow: 0.6, matrix: new THREE.Matrix4().makeTranslation(...(r.lens || [0, 0, 0])) }); }
  else if (id === 'glow_stake') { const r = stakeGeo(); b.geo(r.geo, { vox: 1 }); if (r.crystalGeo) b.geo(r.crystalGeo, { vox: 1, glow: 0.8 }); }
  else if (id === 'support_beam') b.geo(beamGeo(), { vox: 1 });
  else if (id === 'builder_hammer') b.geo(hammerGeo(), { vox: 1 });
  else if (it.slot === 'axe' || it.slot === 'spade' || it.slot === 'shears') { const r = heldGeo(id); if (!r) return null; b.geo(r.geo, { vox: 1, unbake: true }); }
  else if (it.cat === 'consumable' && /dynamite|blasting/.test(id)) {
    const m = explosiveModel(it);
    b.geo(m.body, { vox: 1, unbake: true });
    const f = m.fuses[m.fuses.length - 1];
    if (f) b.geo(f, { vox: 1, unbake: true });
    if (m.lamp) b.geo(m.lamp, { vox: 1, unbake: true, glow: 0.8 });
    return finish(b, 'stand');
  } else ok = false;
  if (!ok) return null;
  return finish(b, 'lay');
}

/** A building block (as it's held in the paws: a little cube of it). */
function block(id) {
  if (ITEMS[id]?.cat !== 'block') return null;
  const r = heldGeo(id);
  if (!r?.geo) return null;
  const b = new Buf();
  b.geo(r.geo, { vox: 2.4, unbake: true });
  return finish(b, id === 'blk_torch' || id === 'blk_ladder' ? 'stand' : 'stand');
}

/** Furniture, as the home builds it. */
function furniture(id) {
  if (ITEMS[id]?.cat !== 'furniture') return null;
  let res = null;
  try { res = buildFurniture(id, {}); } catch { return null; }
  if (!res?.obj) return null;
  const b = new Buf();
  b.object(res.obj, { vox: 1 / 32 });
  res.obj.traverse((m) => { if (m.isMesh && !m.geometry?.userData?.shared && !m.userData?.keepGeo) m.geometry?.dispose?.(); });
  return finish(b, 'stand');
}

/** A forged weapon on its plan's profile (forge/bladeView.js). */
function weapon(type, metal, infusion) {
  const wt = WEAPON_TYPES[type];
  if (!wt || !METALS[metal]) return null;
  const prof = wt.profile;
  const hafted = HAFTED.has(type);
  const sim = {
    type, metal, w: prof.slice(), length: prof.length, cracks: [], target: prof.slice(),
    fittings() {
      if (hafted) { const haft = type === 'spear' ? 4.2 : 3.2; return { parts: [], pommelX: -(haft + 0.45), grip: haft }; }
      const grip = type === 'greatsword' || type === 'longsword' ? 3.2 : type === 'dagger' ? 1.8 : 2.4;
      return { parts: [], pommelX: -(grip + 0.55), grip };
    },
  };
  let r = null;
  try { r = buildWeapon(sim, { infusion }); } catch { return null; }
  const b = new Buf();
  b.object(r.group, { vox: 0.004 });
  r.group.traverse((m) => { if (m.isMesh) m.geometry?.dispose?.(); });
  try { r.heat?.dispose?.(); r.mat?.dispose?.(); r.veinMat?.dispose?.(); r.hiltMat?.dispose?.(); } catch { /* fine */ }
  return finish(b, 'lay');
}

/** The old flat icon, given a body (one voxel a pixel, a soft rounded depth): the fallback. */
function iconBody(key) {
  const it = ITEMS[key];
  if (!it) return null;
  const pc = drawIconSmall(it.icon || { k: '?' }, hashStr(key), ICON, key);
  const W = pc.w, H = pc.h, d = pc.d;
  const dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = d[i * 4 + 3] > 100 ? 99 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : dist[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (dist[i]) dist[i] = Math.min(dist[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4); }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (dist[i]) dist[i] = Math.min(dist[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4); }
  const paper = it.cat === 'blueprint' || it.cat === 'key' || /ticket|letter|hymn|map|note/.test(key);
  const T = 12;
  const g = new PGrid(W, H, T * 2 + 1);
  let any = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!dist[i]) continue;
    const k = i * 4, c = (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
    const t = paper ? (dist[i] < 2.5 ? 0 : 1) : dist[i] < 1.5 ? 0 : Math.min(T, Math.round(Math.sqrt(dist[i] * 4.6)) - 1);
    for (let z = -t; z <= t; z++) g.set(x, H - 1 - y, T + z, c);
    any = true;
  }
  if (!any) return null;
  const b = new Buf();
  b.pgrid(g, { pivot: [W / 2, 0, T + 0.5] });
  return finish(b, paper ? 'flat' : 'stand', paper ? { up: 2, along: 0 } : {});
}

// ------------------------------------------------------------------ the entry point
const SOURCES = [
  ['dish', dish], ['plant', plant], ['ore', clump], ['tool', tool], ['block', block], ['furniture', furniture],
];
/**
 * The model of an item id or a weapon key ('w.<type>.<metal>.<infusion>'): { M, real, pose, src }.
 * real: built from a real 3D model (false: the flat icon's extrusion).
 */
export function itemMesh(key) {
  let M = null, src = null;
  if (key.startsWith('w.')) {
    const [, type, metal, inf] = key.split('.');
    M = weapon(type, metal, inf || undefined);
    src = 'weapon';
  } else {
    if (!ITEMS[key]) return null;
    const B = BUILD[key];
    if (B) {
      try {
        const r = B(key);
        if (r) {
          const b = new Buf();
          for (const part of r.parts || [r]) b.pgrid(part.grid, { pivot: part.pivot, matrix: part.matrix });
          M = finish(b, r.orient || 'stand', r.lay || {});
          src = 'built';
        }
      } catch (e) { console.warn('itemBuild', key, e); }
    }
    for (const [name, fn] of SOURCES) {
      if (M) break;
      try { M = fn(key); src = name; } catch (e) { M = null; console.warn('itemModels', name, key, e); }
    }
    if (!M) { M = iconBody(key); src = 'icon'; }
  }
  if (!M) return null;
  return { M, real: src !== 'icon', src, pose: POSES[M.orient] || POSES.stand, orient: M.orient };
}
