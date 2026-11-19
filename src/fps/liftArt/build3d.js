// The lift panel's diorama, built in 3D: each section of the cross-section is a slab of voxel rock a
// few voxels deep (the cut face in front, the strata on it, the caves carved through it to a bumpy
// back wall, baked AO), laid out by the hand-composed maps (maps.js), and dressed with the game's
// own models (the mine's props and plants from deep/props, the burrow's furniture from iso/furniture,
// Deep Town's shop fronts), the hand-made sprites extruded into voxels (cages, headframe, critters,
// fossils, ore), water and lava, and the light sources the renderer (diorama.js) picks lights from.
// Units: one world unit = one internal pixel; x right, y up (a section hangs below y = 0), the cut
// face at z = 0 and the back wall at z = -DEPTH. Everything heavy is cached for the page's life.
import * as THREE from 'three';
import { VoxelGrid, meshGridGreedy } from '../../gfx/Voxel.js';
import { getModel } from '../../deep/props/models.js';
import { buildFurniture } from '../../iso/furniture.js';
import { buildShop } from '../../iso/shopFront.js';
import { CREATURES } from '../../data/creatures.js';
import { makeNoise2D, clamp } from '../../core/util.js';
import { PAL, RAMPS, hash } from './kit.js';
import { LAYER_MAPS, TOP_MAP, CORE_MAP, SHAFT_COL } from './maps.js';
import { SPR, ORE, STAR } from './tiles.js';
import { CRIT, CRIT_OF, MOVE } from './anim.js';

export const V = 2; // px per slab voxel
export const CS = 12; // px per map cell
export const PXM = 12; // px per metre (the game's models)
export const DEPTH = 24; // the slab's depth (px)
export const SEC_H = { top: 168, layer: 168, core: 96 };
export const SHAFT_X3 = SHAFT_COL * CS + CS / 2;
export const GROUND3 = 4 * CS; // the meadow's grass line in the top section
const FLOORY = 12 * CS; // a layer's hollow's floor (the top of map row 12)

const lin = (c) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return [f((c >> 16) & 255), f((c >> 8) & 255), f(c & 255)]; };
const mulc = (c, k) => (clamp(((c >> 16) & 255) * k, 0, 255) << 16) | (clamp(((c >> 8) & 255) * k, 0, 255) << 8) | clamp((c & 255) * k, 0, 255);
const mixc = (a, b, t) => (Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) | (Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) | Math.round((a & 255) * (1 - t) + (b & 255) * t);

// ------------------------------------------------------------------ materials (shared)
let MATS = null;
export function mats() {
  if (MATS) return MATS;
  const prop = new THREE.MeshLambertMaterial({ vertexColors: true });
  // the props' own glow (crystals, glowcaps, lantern glass) as emission, per vertex
  prop.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float glw;\nvarying float vGlw;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlw = glw;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlw;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlw * 1.4;');
  };
  prop.customProgramCacheKey = () => 'll-prop-glw';
  MATS = {
    slab: new THREE.MeshLambertMaterial({ vertexColors: true }),
    prop,
    vox: new THREE.MeshLambertMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    water: new THREE.MeshLambertMaterial({ color: 0x3a6e94, transparent: true, opacity: 0.74, emissive: 0x0a1c2c, depthWrite: true }),
    waterTop: new THREE.MeshBasicMaterial({ color: 0x9cc8d0, transparent: true, opacity: 0.85 }),
    lava: new THREE.MeshBasicMaterial({ color: 0xe8701e }),
    lavaTop: new THREE.MeshBasicMaterial({ color: 0xfcc25e }),
    ice: new THREE.MeshLambertMaterial({ color: 0xa8d4e4, emissive: 0x1a2c3a }),
    cable: new THREE.MeshLambertMaterial({ color: 0x75707a }),
    wood: new THREE.MeshLambertMaterial({ color: 0x9a643a }),
    woodD: new THREE.MeshLambertMaterial({ color: 0x6a3e2a }),
    spark: new THREE.MeshBasicMaterial({ color: 0xc8f0e0 }),
    drip: new THREE.MeshBasicMaterial({ color: 0x9cc8d0 }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xfde8a8 }),
  };
  return MATS;
}

// ------------------------------------------------------------------ the game's models as meshes
/** Geometries kept for the page's life (models, extruded sprites): never disposed with a section. */
export const KEEP = new Set();
const geoCache = new Map();
/** A deep-props model (deep/props/models.js) as a geometry in px, with its bounds; null if it can't be built. */
export function modelGeo(type, v = 0, p = 0) {
  const key = type + ':' + v + ':' + p;
  if (geoCache.has(key)) return geoCache.get(key);
  let res = null;
  try {
    const m = getModel(type, v, p);
    const n = m.nv;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), glw = new Float32Array(n);
    for (let i = 0; i < n * 3; i++) pos[i] = m.pos[i] * PXM;
    for (let i = 0; i < n; i++) {
      const a = m.nor[i * 3], b = m.nor[i * 3 + 1], c = m.nor[i * 3 + 2], l = Math.hypot(a, b, c) || 1;
      nor[i * 3] = a / l; nor[i * 3 + 1] = b / l; nor[i * 3 + 2] = c / l;
      const cc = (m.col[i * 3] << 16) | (m.col[i * 3 + 1] << 8) | m.col[i * 3 + 2], L = lin(cc);
      col[i * 3] = L[0]; col[i * 3 + 1] = L[1]; col[i * 3 + 2] = L[2];
      glw[i] = m.glw ? m.glw[i] : 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('glw', new THREE.BufferAttribute(glw, 1));
    g.setIndex(new THREE.BufferAttribute(m.idx instanceof Uint32Array ? m.idx : Uint32Array.from(m.idx), 1));
    res = { geo: g, min: m.min.map((q) => q * PXM), max: m.max.map((q) => q * PXM), light: m.light };
    KEEP.add(g);
  } catch (e) { res = null; }
  geoCache.set(key, res);
  return res;
}

/** A hand-made pixel map extruded into voxels (1 px each), depth d; zfn(i, j, z) can hollow it. Cached by key. */
const exCache = new Map();
export function extrude(key, rows, pal, d, zfn) {
  if (exCache.has(key)) return exCache.get(key);
  const w = Math.max(...rows.map((r) => r.length)), h = rows.length;
  const g = new VoxelGrid(w, h, d);
  for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i];
    if (ch === '.') continue;
    const c = pal[ch];
    if (c == null) continue;
    for (let z = 0; z < d; z++) if (!zfn || zfn(i, j, z, ch)) g.set(i, h - 1 - j, z, c);
  }
  const geo = meshGridGreedy(g, { scale: 1, pivot: [0, 0, d], ao: true });
  KEEP.add(geo);
  const res = { geo, w, h, d };
  exCache.set(key, res);
  return res;
}
const exMesh = (ex, mat) => { const m = new THREE.Mesh(ex.geo, mat || mats().vox); m.castShadow = true; m.receiveShadow = true; return m; };

// ------------------------------------------------------------------ the slab
const kindOf = (ch) => (ch == null ? 'A' : '#oRfbasMYG='.includes(ch) ? 'A' : '%O'.includes(ch) ? 'B' : ch === '~' ? 'water' : ch === '^' ? 'lava' : ch === '*' ? 'ice' : ch === ' ' ? 'sky' : 'air');

/**
 * A section's rock: the map's cells, softened into organic hollows (bilinear between the cells with
 * a little wobble), every column of rock the slab's full depth with the strata's colours in broad
 * patches; the open has a back wall 2-4 voxels thick. backCol(px, py) can pattern the back wall
 * (planks, dressed stone). slots: [{ x0, x1, y0, y1, d }] carved into the cut face (lift cables,
 * the shaft). Returns { mesh, air (per voxel: 0 rock 1 open 2 liquid 3 sky), GW, GH, floorAt, ceilAt }.
 */
function slab(map, zr, Wpx, Hpx, seed, o = {}) {
  const GW = Math.ceil(Wpx / V), GH = Math.round(Hpx / V), GD = DEPTH / V;
  const rows = map.length, cols = map[0].length;
  const cellCh = (c, r) => map[clamp(r, 0, rows - 1)][clamp(c, 0, cols - 1)];
  const openV = (c, r) => { const k = kindOf(cellCh(c, r)); return k === 'A' || k === 'B' ? 0 : 1; };
  const n = makeNoise2D(seed * 31 + zr * 7 + 3);
  const field = (px, py) => {
    const fx = px / CS - 0.5, fy = py / CS - 0.5, c0 = Math.floor(fx), r0 = Math.floor(fy), tx = fx - c0, ty = fy - r0;
    const a = openV(c0, r0) * (1 - tx) + openV(c0 + 1, r0) * tx, b = openV(c0, r0 + 1) * (1 - tx) + openV(c0 + 1, r0 + 1) * tx;
    return a * (1 - ty) + b * ty + n(px * 0.08, py * 0.08) * 0.2 + n(px * 0.23, py * 0.2) * 0.07;
  };
  const air = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const px = gx * V + 1, py = gy * V + 1;
    const k = kindOf(cellCh(Math.floor(px / CS), Math.floor(py / CS)));
    air[gy * GW + gx] = k === 'sky' ? 3 : k === 'water' || k === 'lava' ? 2 : field(px, py) > 0.5 ? 1 : 0;
  }
  const R = RAMPS[zr];
  const grid = new VoxelGrid(GW, GH, GD + 1); // (the extra layer in front: relief on the cut face)
  const backR = [mixc(R.A[1], R.back[1], 0.35), mixc(R.A[1], R.A[2], 0.5), mixc(R.A[2], R.A[3], 0.25)];
  const bandOf = (px, py) => (kindOf(cellCh(Math.floor(px / CS), Math.floor((py + n(px * 0.03, 5) * 4) / CS))) === 'B' ? 'B' : 'A');
  const relief = reliefFn(zr, n);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const k = gy * GW + gx, a = air[k];
    if (a === 3) continue;
    const px = gx * V + 1, py = gy * V + 1, y = GH - 1 - gy;
    let slotD = 0;
    for (const s of o.slots || []) if (px >= s.x0 && px < s.x1 && py >= s.y0 && py < s.y1) slotD = Math.max(slotD, s.d);
    if (a === 0) {
      const band = bandOf(px, py);
      const RR = R[band];
      const t = n(px * 0.03 + (band === 'B' ? 11 : 0), py * 0.045 + 3) + n(px * 0.11, py * 0.13) * 0.25;
      const base = t > 0.42 ? RR[3] : t < -0.45 ? RR[1] : RR[2];
      const above = gy > 0 ? air[k - GW] : 0, below = gy < GH - 1 ? air[k + GW] : 0;
      const sky = above === 3;
      const contact = gy > 1 && air[k - GW] === 0 && bandOf(px, py - V * 1.5) !== band; // one band on another: a dark seam
      const recess = band === 'B' && below !== 1 && above !== 1 ? 1 : 0; // the softer band weathers back: ledges
      for (let gz = 0; gz < GD - recess; gz++) {
        if (slotD && gz >= GD - slotD) continue;
        let c = base;
        if ((above === 1 || sky) && gz > 0) c = sky ? (hash(gx, gz, 3) < 0.3 ? PAL.G : PAL.g) : zr === 5 ? PAL.c : (zr <= 2 && gz > 2 && hash(gx >> 1, gz, zr) < 0.55) ? (hash(gx, gz, 9) < 0.5 ? PAL.G : PAL.h) : RR[3];
        else if (below === 1 && gz > 0) c = RR[1];
        else if (contact && gz >= GD - 3) c = mixc(RR[0], RR[1], 0.35);
        grid.set(gx, y, gz, c);
      }
      // relief standing out of the cut face: pebbles, clay lumps, basalt ridges, ice lenses, star flecks
      if (!slotD && !recess && above !== 1 && below !== 1) { const rc = relief(px, py, RR, band); if (rc != null) grid.set(gx, y, GD, rc); }
    } else {
      // the back wall: carved in depth (flowstone columns standing out, recesses going in), so the
      // lamps and shadows have something to work on; the walls of a room stay flat
      const bc = o.backCol ? o.backCol(px, py) : null;
      const colm = Math.abs(((px + Math.round(n(py * 0.04, 2) * 6)) % 34) - 17) / 17; // 0 at a column's middle
      const tb = bc != null ? 2 : Math.max(1, Math.round(2 + (n(px * 0.035, py * 0.05 + 9) + 1) * 1.6 + (colm < 0.22 ? 3 - colm * 8 : 0)));
      for (let gz = 0; gz < tb; gz++) grid.set(gx, y, gz, bc != null ? bc : gz === tb - 1 ? (colm < 0.22 ? backR[2] : backR[1]) : backR[0]);
    }
  }
  // (no baked AO on the big slab: on long merged faces it shows as diagonal streaks once the colour is stepped)
  const mesh = new THREE.Mesh(meshGridGreedy(grid, { scale: V, pivot: [0, 0, GD], ao: false }), mats().slab);
  mesh.position.y = -Hpx;
  mesh.castShadow = true; mesh.receiveShadow = true;
  const A = (px, py) => { const gx = Math.floor(px / V), gy = Math.floor(py / V); return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? 0 : air[gy * GW + gx]; };
  /** The top of the floor under (px, py) (py down), and the underside of the ceiling over it. */
  const floorAt = (px, py) => { let y = py; while (y < Hpx - 1 && A(px, y) === 1) y += 1; return Math.floor(y / V) * V; };
  const ceilAt = (px, py) => { let y = py; while (y > 0 && A(px, y) === 1) y -= 1; return (Math.floor(y / V) + 1) * V; };
  return { mesh, air, GW, GH, A, floorAt, ceilAt };
}

/** The cut face's relief per layer: what stands a voxel proud of it at (px, py), and its colour (or null). */
function reliefFn(zr, n) {
  // big, few lumps lying in the strata (a lit top, a shaded underside), never single-voxel speckle
  const lump = (px, py, cell, rx, ry, s, p) => {
    const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
    if (hash(cx, cy, s) > p) return 0;
    const ox = cx * cell + rx + hash(cx, cy, s + 1) * (cell - rx * 2), oy = cy * cell + ry + hash(cx, cy, s + 2) * (cell - ry * 2);
    const k = 0.75 + hash(cx, cy, s + 3) * 0.5, dx = (px - ox) / (rx * k), dy = (py - oy) / (ry * k);
    return dx * dx + dy * dy < 1 ? (dy < -0.25 ? 2 : 1) : 0;
  };
  return (px, py, RR) => {
    if (zr === 0 || zr === 1) { const p = lump(px, py, 30, 6, 4, 41, 0.35); return p ? (p === 2 ? 0xa8988a : 0x7a6e68) : null; }
    if (zr === 2) { const p = lump(px, py, 34, 8, 4, 43, 0.4); return p ? (p === 2 ? RR[4] : RR[3]) : null; }
    if (zr === 3) { const p = lump(px, py, 36, 7, 5, 47, 0.3); return p ? (p === 2 ? RR[4] : RR[3]) : null; }
    if (zr === 4) { const col = (px + Math.round(n(py * 0.05, 3) * 2)) % 14; return col < 3 && n(px * 0.02, py * 0.06) > -0.1 ? (col === 0 ? RR[3] : RR[2]) : null; }
    if (zr === 5) { const lens = n(px * 0.02 + 7, py * 0.08); return lens > 0.42 ? (lens > 0.52 ? 0xd8ece4 : 0x9cc8d0) : null; }
    if (zr === 6) { const p = lump(px, py, 40, 6, 4, 51, 0.3); return p ? (p === 2 ? RR[4] : RR[3]) : null; }
    return null;
  };
}

/** Liquid boxes for the map's water / lava / ice cells (one box per row run), with a lit surface skin. */
function liquids(map, cols, out, lights, anim) {
  const M = mats();
  for (let r = 0; r < map.length; r++) {
    let c = 0;
    while (c < cols) {
      const ch = map[r][c];
      if (!'~^*'.includes(ch)) { c++; continue; }
      let e = c; while (e < cols && map[r][e] === ch) e++;
      const top = (r > 0 && !'~^*'.includes(map[r - 1][c])) || r === 0;
      const x0 = c * CS, x1 = e * CS, y0 = r * CS + (top ? 3 : 0), y1 = r * CS + CS + 1, d = DEPTH - 3;
      const box = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, d), ch === '~' ? M.water : ch === '^' ? M.lava : M.ice);
      box.position.set((x0 + x1) / 2, -(y0 + y1) / 2, -d / 2 - 0.5);
      if (ch !== '~') { box.castShadow = false; box.receiveShadow = ch === '*'; }
      out.add(box);
      if (top && ch !== '*') {
        const skin = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1, d), ch === '~' ? M.waterTop : M.lavaTop);
        skin.position.set((x0 + x1) / 2, -y0 - 0.5, -d / 2 - 0.5);
        out.add(skin);
        if (ch === '^') for (let x = x0 + 10; x < x1; x += 28) lights.push({ x, y: -y0 + 6, z: -6, c: 0xff7a2a, i: 1.7, d: 70, flick: 0.18 });
        anim.surfaces.push({ x0, x1, y: -y0, kind: ch === '~' ? 'water' : 'lava' });
      }
      c = e;
    }
  }
}

// ------------------------------------------------------------------ dressing
function placeModel(group, type, v, p, x, y, z, how = 'floor', s = 1) {
  const g = modelGeo(type, v, p);
  if (!g) return null;
  const m = new THREE.Mesh(g.geo, mats().prop);
  m.scale.setScalar(s);
  m.position.set(x, how === 'hang' ? y - g.max[1] * s : how === 'mid' ? y - (g.min[1] + g.max[1]) * 0.5 * s : y - g.min[1] * s, z);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return { mesh: m, g };
}
/** Put a game object (a THREE tree in metres) at (x, y) on a floor, its front toward us. */
function placeObj(group, obj, x, y, z, s = PXM) {
  obj.scale.setScalar(s);
  obj.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(obj);
  obj.position.set(x - (bb.min.x + bb.max.x) / 2, y - bb.min.y, z - bb.max.z);
  obj.traverse((q) => { if (q.isMesh) { q.castShadow = true; q.receiveShadow = true; } });
  group.add(obj);
  return bb;
}

const cagePal = () => ({ ...PAL });
/** A lift cage in 3D: the hand-drawn cage front and back, its posts and roof running through (open or locked). */
function cage3d(open) {
  const rows = open ? SPR.cageOpen : SPR.cageLocked;
  return extrude(open ? 'cageO' : 'cageL', rows, cagePal(), 9, (i, j, z) => z === 0 || z === 8 || j <= 5 || j >= 14 || j === 9 || i <= 2 || (i >= 11 && i <= 13));
}

/** Creatures: their hand-made sprite frames extruded two voxels deep (known: their colours; unknown: a silhouette with eyes). */
export function critterMeshes(id, known) {
  const c0 = CREATURES[id]?.color ?? 0xa08870;
  const pal = known ? { 1: c0, 2: mixc(c0, PAL.c, 0.4), 3: mixc(c0, PAL.k, 0.5), e: PAL.c, w: PAL.c, y: PAL.Y } : { 1: PAL.K, 2: 0x4a2c40, 3: PAL.k, e: PAL.Y, w: PAL.K, y: PAL.K };
  return (CRIT[CRIT_OF[id]] || []).map((rows, i) => extrude('crit:' + id + ':' + known + ':' + i, rows, pal, 3));
}

// ------------------------------------------------------------------ a layer
/**
 * Build a layer's diorama. L: { z, W, stops [{ id, open, ax }], ores [{ id, col, known }], finds, seed }.
 * Returns { group, lights [{ x, y, z, c, i, d, flick }], anim, floorTop(x) }.
 */
export function buildLayer(L) {
  const { z, W } = L;
  const H = SEC_H.layer;
  const map = LAYER_MAPS[z];
  const cols = map[0].length;
  const group = new THREE.Group();
  const lights = [], anim = { surfaces: [], drips: [], spores: [], cages: [], critters: [], falls: [], floaters: [], lamps: [] };
  // where the lifts go: the map's spots, nearest first; the town shaft's stations at the shaft
  const spots = [];
  for (let r = 0; r < map.length; r++) for (let c = 0; c < cols; c++) if (map[r][c] === 'L' && c * CS + 6 < W - 8) spots.push({ x: c * CS + 6, r });
  const placed = [];
  for (const s of (L.stops || []).slice().sort((a, b) => a.ax - b.ax)) {
    if (/^s\d/.test(s.id)) { placed.push({ s, x: SHAFT_X3 + 18 }); continue; }
    let best = null;
    for (const sp of spots) if (!sp.used && (!best || Math.abs(sp.x - s.ax) < Math.abs(best.x - s.ax))) best = sp;
    if (best) best.used = true;
    placed.push({ s, x: best ? best.x : clamp(s.ax, 20, W - 20) });
  }
  const slots = placed.map((p) => ({ x0: p.x - 2, x1: p.x + 2, y0: 0, y1: FLOORY - 30, d: 3 }));
  slots.push({ x0: SHAFT_X3 - 7, x1: SHAFT_X3 + 7, y0: 0, y1: H, d: 7 });
  const S = slab(map, z, W, H, (L.seed || 1) + z, { slots });
  group.add(S.mesh);
  liquids(map, Math.min(cols, Math.ceil(W / CS)), group, lights, anim);
  const R = RAMPS[z];
  const xpal = (k) => (z === 3 ? (k ? 'violet' : 'cyan') : z === 5 ? 'ice' : z === 6 ? (k ? 'pink' : 'violet') : z === 2 ? 'amber' : 'violet');
  const sprPal = { ...PAL, 0: R.A[0], 1: R.A[1], 2: R.A[2], 3: R.A[3], 4: R.A[4], 5: R.back[0], 6: R.back[1], 7: R.back[2] };
  const front = (ex, x, y, dz = 1) => { const m = exMesh(ex); m.position.set(x, y, dz); group.add(m); return m; };
  for (let r = 0; r < map.length; r++) for (let c = 0; c < cols; c++) {
    const ch = map[r][c];
    const cx = c * CS + CS / 2, top = r * CS, mid = top + CS / 2;
    if (cx > W + 12) continue;
    const zz = -DEPTH * 0.45 + (hash(c, r, 7) - 0.5) * 6;
    const fy = () => S.floorAt(cx, mid), cy = () => S.ceilAt(cx, mid);
    const v = Math.floor(hash(c, r, 1) * 4);
    switch (ch) {
      case 'v': { const h = placeModel(group, 'stalactite', v, 8 + v * 2, cx, -cy(), zz, 'hang'); if (h) anim.drips.push({ x: cx, y: -cy() - (h.g.max[1] - h.g.min[1]) * 0.9, ph: hash(c, r, 2) }); break; }
      case 'u': placeModel(group, 'stalagmite', v, 6 + v, cx, -fy(), zz); break;
      case 'h': placeModel(group, 'roots', v, 18 + v * 3, cx, -cy(), zz, 'hang'); anim.drips.push({ x: cx, y: -cy() - 12, ph: hash(c, r, 3) }); break;
      case 'w': placeModel(group, 'vine', v, 16 + v * 3, cx, -cy(), zz, 'hang'); break;
      case 'i': placeModel(group, 'icicle', v, 8 + v * 2, cx, -cy(), zz, 'hang'); anim.drips.push({ x: cx, y: -cy() - 8, ph: hash(c, r, 4), ice: true }); break;
      case 'X': { const h = placeModel(group, 'crystalC', v, xpal(c & 1), cx, -cy(), zz, 'hang', 1.3); if (h) lights.push({ x: cx, y: -cy() - 6, z: zz + 4, c: (c & 1) ? 0xb070ff : 0x52c8e0, i: 0.5, d: 26, flick: 0.05 }); break; }
      case 'x': {
        const type = z === 4 ? 'obsidian' : 'crystal';
        placeModel(group, type, v, xpal(c & 1), cx - 3, -fy(), zz, 'floor', 1.4);
        placeModel(group, type, v + 1, xpal(c & 1), cx + 5, -fy(), zz - 4, 'floor', 0.9);
        if (z !== 4) lights.push({ x: cx, y: -fy() + 8, z: zz + 5, c: z === 5 ? 0xb4e8ff : (c & 1) ? 0xb070ff : 0x48d4ff, i: 1.1, d: 40, flick: 0.05 });
        break;
      }
      case 'm': placeModel(group, 'glowcap', v, 0, cx - 2, -fy(), zz); placeModel(group, 'glowcap', v + 1, 0, cx + 3, -fy(), zz - 5, 'floor', 0.8); break;
      case 'g': placeModel(group, 'mush', v, 0, cx, -fy(), zz); lights.push({ x: cx, y: -fy() + 6, z: zz + 5, c: 0x3cc8c0, i: 0.9, d: 34, flick: 0.08 }); anim.spores.push({ x: cx, y: -fy() + 4, z: zz }); break;
      case 'T': {
        const f = fy();
        placeModel(group, 'post', v, 22, cx - 7, -f, -6); placeModel(group, 'post', v + 1, 22, cx + 7, -f, -6);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 4), mats().wood); beam.position.set(cx, -f + 14.5, -6); beam.castShadow = true; beam.receiveShadow = true; group.add(beam);
        placeModel(group, 'rail', v, 0, cx, -f, -12); break;
      }
      case 'r': placeModel(group, 'rail', v, 0, cx - 4, -fy(), -12); placeModel(group, 'rail', v + 1, 0, cx + 4, -fy(), -12); break;
      case 'c': placeModel(group, 'rail', v, 0, cx, -fy(), -12); placeModel(group, 'cart', 0, 0, cx, -fy() + 1, -12); break;
      case 'H': placeModel(group, 'ladder', v, 26, cx, -(top + CS), -8); break;
      case 'l': placeModel(group, 'lanternC', v, 3, cx, -cy(), -10, 'hang'); lights.push({ x: cx, y: -cy() - 9, z: -6, c: 0xffb050, i: 1.6, d: 64, flick: 0.22 }); anim.lamps.push({ x: cx, y: -cy() - 9 }); break;
      case 'f': front(extrude('fossil' + z, z === 2 || z === 5 ? SPR.fish : SPR.ammonite, sprPal, 2), cx - (z === 2 || z === 5 ? 8 : 4), -top - 2); break;
      case 'b': front(extrude('bone', SPR.bone, sprPal, 2), cx - 4, -top - 2); break;
      case 'a': { placeModel(group, 'crystal', 1, 'amber', cx, -mid - 4, -1, 'floor', 0.6); break; }
      case 'G': front(extrude('geode' + z, SPR.geode, sprPal, 2), cx - 6, -top - 2); lights.push({ x: cx + 2, y: -top - 8, z: 2, c: 0xb070ff, i: 0.7, d: 24, flick: 0.05 }); break;
      case 'M': front(extrude('mammoth', SPR.mammoth, sprPal, 2), cx - 6, -top - 4); break;
      case 'Y': front(extrude('ribs', SPR.ribs, sprPal, 2), cx - 18, -top - 4); break;
      case 'R': front(extrude('root' + (r & 1), r & 1 ? SPR.root2 : SPR.root, sprPal, 2, (i, j, zz2) => true), cx - 4, -top, 1).scale.set(1, 1.5, 1); break;
      case 'o': case 'O': case 's': {
        const o = (L.ores || [])[Math.floor(hash(c, r, 21) * Math.max(1, (L.ores || []).length))];
        const kn = ch !== 's' && o && o.known;
        const P = { ...sprPal, 8: kn ? o.col[0] : R.A[3], 9: kn ? o.col[1] : R.A[4] };
        front(extrude('ore' + z + ':' + (kn ? o.id : '-') + ':' + ((c + r) & 1), ch === 's' ? STAR : ORE[(c + r) % 2], P, 2, (i, j, zz2, k) => k === '8' || k === '9' || k === 'z' || k === 'Z'), cx - 4, -top - 2);
        if (kn || ch === 's') anim.glints = (anim.glints || []).concat([{ x: cx, y: -top - 6 }]);
        break;
      }
      case 'q': { const h = placeModel(group, 'shard', v, 0, cx, -mid, -10, 'mid'); if (h) anim.floaters.push({ mesh: h.mesh, y0: h.mesh.position.y, ph: hash(c, r, 6) }); lights.push({ x: cx, y: -mid, z: -4, c: 0xb070ff, i: 0.8, d: 30, flick: 0.1 }); break; }
      case 'A': { const ex = extrude('arch', SPR.arch, PAL, 10); const m = exMesh(ex); m.position.set(cx - 4, -fy(), -6); group.add(m); break; }
      case 'F': { const y0 = cy(), y1 = S.floorAt(cx, y0 + 4); const fall = new THREE.Mesh(new THREE.BoxGeometry(3, y1 - y0, 3), mats().lavaTop); fall.position.set(cx, -(y0 + y1) / 2, -10); group.add(fall); anim.falls.push({ mesh: fall }); lights.push({ x: cx, y: -(y0 + y1) / 2, z: -4, c: 0xff8a30, i: 1.6, d: 70, flick: 0.2 }); break; }
      case 'B': { const deck = new THREE.Mesh(new THREE.BoxGeometry(CS + 1, 2, 14), mats().wood); deck.position.set(cx, -(r + 1) * CS - 1, -9); deck.castShadow = true; deck.receiveShadow = true; group.add(deck); if (c % 2) { const post = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 2), mats().woodD); post.position.set(cx, -(r + 1) * CS - 7, -4); group.add(post); } break; }
      case 'Z': { const ex = extrude('ffall', SPR.frozenFall, PAL, 6); const m = exMesh(ex); m.position.set(cx - 4, -top - CS, -8); m.scale.set(1, CS / 8, 1); group.add(m); break; }
      default: break;
    }
  }
  // dressing along every floor and ceiling of the open: the layer's own rocks, plants and growths
  const DEC = {
    1: { f: [['stalagmite', 5], ['blindfern', 0], ['cave_carrot', 0], ['glowcap', 0], ['urn', 0], ['whisperweed', 0], ['stalagmite', 4]], c: [['roots', 14], ['stalactite', 7], ['roots', 22]] },
    2: { f: [['stalagmite', 6], ['pepperroot', 0], ['urn', 0], ['sparkmoss', 0], ['stalagmite', 4], ['whisperweed', 0]], c: [['vine', 16], ['stalactite', 8], ['rubber_sap', 0]] },
    3: { f: [['crystal', 'cyan'], ['sparkmoss', 0], ['bubblebulb', 0], ['crystal_lily', 0], ['crystal', 'violet'], ['stalagmite', 5]], c: [['crystalC', 'cyan'], ['stalactite', 8], ['glowthread', 10], ['crystalC', 'violet']] },
    4: { f: [['obsidian', 0], ['charred', 0], ['vent', 0], ['emberbloom', 0], ['stalagmite', 5], ['obsidian', 1]], c: [['stalactite', 9], ['stalactite', 6]] },
    5: { f: [['frozen', 0], ['crystal', 'ice'], ['frostbloom', 0], ['stalagmite', 5]], c: [['icicle', 10], ['icicle', 6], ['stalactite', 8]] },
    6: { f: [['shard', 0], ['core_lotus', 0], ['crystal', 'violet'], ['whisperweed', 0], ['crystal', 'pink']], c: [['crystalC', 'violet'], ['glowthread', 12], ['crystalC', 'pink']] },
  }[z];
  const busy = (x) => placed.some((p) => Math.abs(p.x - x) < 15) || Math.abs(x - SHAFT_X3) < 11;
  for (let x = 10; x < W - 8; x += 8) {
    if (busy(x)) continue;
    const gx = Math.floor(x / V);
    for (let gy = 1; gy < S.GH - 1; gy++) {
      const a = S.air[gy * S.GW + gx], b = S.air[(gy + 1) * S.GW + gx], u = S.air[(gy - 1) * S.GW + gx];
      // a floor: open over rock
      if (a === 1 && b === 0 && DEC && hash(x, gy, z * 3 + 1) < 0.26) {
        const [type, p] = DEC.f[Math.floor(hash(x, gy, z * 3 + 2) * DEC.f.length)];
        const sc = 0.8 + hash(x, gy, 5) * 0.5;
        const h = placeModel(group, type, Math.floor(hash(x, gy, 6) * 4), p, x + (hash(x, gy, 7) - 0.5) * 3, -(gy + 1) * V, -4 - hash(x, gy, 8) * 15, 'floor', sc);
        if (h && h.g.light && hash(x, gy, 9) < 0.3) lights.push({ x, y: -(gy + 1) * V + 6, z: -4, c: (((h.g.light.c[0] * 255) << 16) | ((h.g.light.c[1] * 255) << 8) | (h.g.light.c[2] * 255)) >>> 0, i: 0.6, d: 30, flick: 0.06 });
      }
      // a ceiling: rock over open
      if (a === 1 && u === 0 && DEC && hash(x, gy, z * 3 + 3) < 0.2) {
        const [type, p] = DEC.c[Math.floor(hash(x, gy, z * 3 + 4) * DEC.c.length)];
        placeModel(group, type, Math.floor(hash(x, gy, 10) * 4), p, x + (hash(x, gy, 11) - 0.5) * 3, -gy * V, -6 - hash(x, gy, 12) * 12, 'hang', 0.8 + hash(x, gy, 13) * 0.5);
      }
    }
  }
  // the town shaft: timber cribs and guide rails down the cut-open slot
  shaft3d(group, H);
  // lifts: a cage at each, its cable up the slot to a sheave under the ceiling
  for (const p of placed) {
    const x = p.x, f = S.floorAt(x, FLOORY - 4), cTop = S.ceilAt(x, FLOORY - 20);
    const cg = exMesh(cage3d(p.s.open)); cg.position.set(x - 8, -f, -4); group.add(cg);
    const bell = exMesh(extrude('bell', SPR.bell, PAL, 2)); bell.position.set(x - 12, -f + 13, -4); group.add(bell);
    const cable = new THREE.Mesh(new THREE.BoxGeometry(1, f - 16, 1), mats().cable); cable.position.set(x, -(f - 16) / 2, -1); group.add(cable);
    const sh = exMesh(extrude('sheave', SPR.sheave, PAL, 3)); sh.position.set(x - 4, -cTop - 8, -2); group.add(sh);
    p.s.x = x; p.s.fy = f;
    anim.cages.push({ id: p.s.id, open: p.s.open, x, fy: f });
    if (p.s.open) lights.push({ x: x + 6, y: -f + 9, z: 0, c: 0xffb050, i: 1.5, d: 60, flick: 0.2 });
  }
  const floorTop = (x) => S.floorAt(clamp(x, 0, W - 1), FLOORY - 4);
  const ceilBot = (x) => S.ceilAt(clamp(x, 0, W - 1), FLOORY - 20);
  // life: the creatures you know walk, fly, swim; the ones you don't lurk by the walls
  const known = L.finds.crit.filter((c) => c.e), unknown = L.finds.crit.filter((c) => !c.e).slice(0, 3);
  const list = known.map((c) => ({ c, kn: true })).concat(unknown.map((c) => ({ c, kn: false })));
  list.forEach(({ c, kn }, k) => {
    const frames = critterMeshes(c.id, kn).map((ex) => { const m = exMesh(ex); m.visible = false; group.add(m); return { m, w: ex.w, h: ex.h }; });
    if (!frames.length) return;
    frames[0].m.visible = true;
    const x = clamp(Math.round(24 + ((k + 0.5) / list.length) * (Math.min(W, 470) - 48) + (hash(k, z, 3) - 0.5) * 20), 20, W - 16);
    anim.critters.push({ frames, x, kn, mv: MOVE[c.id] || 'walk', ph: hash(k, z, 4), sp: 0.5 + hash(k, z, 5) * 0.6, range: kn ? 10 + hash(k, z, 6) * 18 : 0, z: -7 - hash(k, z, 7) * 6 });
  });
  // known plants by the walls
  L.finds.plants.filter((p) => p.e).forEach((p, k, all) => {
    const x = clamp(Math.round(30 + ((k + 0.5) / all.length) * (Math.min(W, 470) - 60) + (hash(k, z, 8) - 0.5) * 20), 24, W - 12);
    if (S.A(x, floorTop(x) - 1) !== 1) return;
    placeModel(group, p.id, k, 0, x, -floorTop(x), -9 - hash(k, z, 9) * 6);
  });
  // the staff down the left edge: painted bands of 5 m, the depth numbers on the plaque side
  staff3d(group, z, H);
  return { group, lights, anim, floorTop, ceilBot, H };
}

function shaft3d(group, y0, y1) {
  const M = mats();
  const H = y1 == null ? y0 : y1 - y0, top = y1 == null ? 0 : y0;
  for (const dx of [-6, 6]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(2, H, 2), M.woodD); post.position.set(SHAFT_X3 + dx, -top - H / 2, -2); post.castShadow = true; post.receiveShadow = true; group.add(post);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1, H, 1), M.cable); rail.position.set(SHAFT_X3 + dx * 0.6, -top - H / 2, -9); group.add(rail);
  }
  for (let y = top + 6; y < top + H; y += 14) {
    const crib = new THREE.Mesh(new THREE.BoxGeometry(14, 2, 2), M.wood); crib.position.set(SHAFT_X3, -y, -2); crib.castShadow = true; crib.receiveShadow = true; group.add(crib);
  }
  const cable = new THREE.Mesh(new THREE.BoxGeometry(1, H, 1), M.cable); cable.position.set(SHAFT_X3, -top - H / 2, -6); group.add(cable);
}

const STAFF_C = [0xe4cc98, 0xa8402c];
function staff3d(group, z, H) {
  const LZ = [0, 25, 55, 90, 130, 170, 210];
  const d0 = LZ[z - 1], d1 = LZ[z];
  const rows = [];
  for (let y = 0; y < H; y++) { const d = d0 + (y / H) * (d1 - d0), b = Math.floor(d / 5) & 1 ? 'b' : 'a'; rows.push('k' + b + b + 'k'); }
  const m = exMesh(extrude('staff' + z, rows, { k: PAL.k, a: STAFF_C[0], b: STAFF_C[1] }, 2));
  m.position.set(1, -H, 2);
  group.add(m);
}

// ------------------------------------------------------------------ the top: the meadow, the burrow, Deep Town
function skyCanvas(W, H, gy) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const BANDS = [PAL.T, PAL.U, PAL.L, PAL.M, PAL.Q, PAL.J];
  const TEETH = '..X...XX..X.....X....XXX..X.....';
  const bandH = Math.ceil(gy / BANDS.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let b = Math.min(BANDS.length - 1, Math.floor(y / bandH));
    if (b < BANDS.length - 1 && y % bandH === bandH - 1 && TEETH[(x + b * 7) % TEETH.length] === 'X') b++;
    ctx.fillStyle = '#' + BANDS[b].toString(16).padStart(6, '0');
    ctx.fillRect(x, y, 1, 1);
  }
  const sun = ['...ccc...', '.cccccyy.', '.ccccccyy', 'cccccccyy', 'ccccccyy.', '.cyyyyyy.', '...yyy...'];
  sun.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') { ctx.fillStyle = '#' + PAL[r[i]].toString(16).padStart(6, '0'); ctx.fillRect(Math.round(W * 0.78) + i, 8 + j, 1, 1); } });
  for (let x0 = 0; x0 < W; x0 += 32) SPR.hills.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') { ctx.fillStyle = '#' + PAL[r[i]].toString(16).padStart(6, '0'); ctx.fillRect(x0 + i, gy - 7 + j, 1, 1); } });
  return cv;
}

export function buildTop(T) {
  const { W, town } = T;
  const H = SEC_H.top;
  const group = new THREE.Group();
  const lights = [], anim = { surfaces: [], drips: [], spores: [], cages: [], critters: [], falls: [], floaters: [], lamps: [], smoke: [], fires: [] };
  // the sky: a painted backdrop far behind, its own (no fog, no light)
  const tex = new THREE.CanvasTexture(skyCanvas(W + 80, GROUND3 + 40, GROUND3 + 10));
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(W + 80, GROUND3 + 40), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
  sky.position.set(W / 2, -(GROUND3 + 40) / 2 + 2, -DEPTH - 60);
  group.add(sky);
  anim.sky = sky;
  // the ground: the burrow's planks and the town's dressed stone show on their back walls
  const planks = SPR.planks, stone = SPR.stoneWall;
  const S = slab(TOP_MAP, 0, W, H, 7, {
    slots: [{ x0: SHAFT_X3 - 7, x1: SHAFT_X3 + 7, y0: 13 * CS, y1: H, d: 7 }, { x0: 52, x1: 60, y0: 13 * CS, y1: H, d: 6 }],
    backCol: (px, py) => {
      const c = Math.floor(px / CS), r = Math.floor(py / CS), ch = TOP_MAP[clamp(r, 0, 13)][clamp(c, 0, 39)];
      if (ch === '.' && r >= 9) return PAL[planks[(py >> 1) & 7][(px >> 1) & 7]];
      if (ch === ',' && r >= 10) return PAL[stone[(py >> 1) & 7][(px >> 1) & 7]];
      return null;
    },
  });
  group.add(S.mesh);
  const fy = 13 * CS; // the burrow's and the town's floor
  // the meadow: the old oak, pines, grass tufts, the chimney pot
  const oak = exMesh(extrude('oak', SPR.oak, PAL, 6)); oak.position.set(8, -GROUND3 + SPR.oak.length - 3, -10); oak.scale.setScalar(1.3); group.add(oak);
  for (const x of [W - 74, W - 52, W - 30, 300, 330]) if (x > 290 && x < W - 6) { const p = exMesh(extrude('pine', SPR.pine, PAL, 4)); p.position.set(x, -GROUND3 + SPR.pine.length - 1, -14 + (x % 5)); p.scale.setScalar(1.4); group.add(p); }
  // ---- the burrow
  const hx0 = 2 * CS, hx1 = 12 * CS;
  const furn = (id, x, z = -12, s = PXM) => { try { const f = buildFurniture(id); placeObj(group, f.obj, x, -fy, z, s); return f; } catch (e) { return null; } };
  furn('fireplace', hx0 + 14, -14);
  lights.push({ x: hx0 + 14, y: -fy + 6, z: -4, c: 0xff8a30, i: 2.2, d: 90, flick: 0.3 });
  anim.fires.push({ x: hx0 + 14, y: -fy + 4 });
  furn('barrel', hx0 + 34, -16);
  furn('table_small', hx0 + 52, -12);
  furn('stool', hx0 + 44, -8);
  furn('bed_cozy', hx1 - 24, -14);
  furn('bookshelf', hx0 + 70, -20);
  // the chimney up through the soil to its pot in the grass
  const chim = exMesh(extrude('chimney', Array.from({ length: fy - 60 - GROUND3 + 8 }, (_, j) => SPR.chimney[j % 8]), PAL, 6)); chim.position.set(hx0 + 10, -(fy - 60), -16); group.add(chim);
  anim.smoke.push({ x: hx0 + 14, y: -GROUND3 + 10 });
  // the burrow's beam and lantern
  const beam = new THREE.Mesh(new THREE.BoxGeometry(hx1 - hx0 - 6, 3, 4), mats().wood); beam.position.set((hx0 + hx1) / 2, -(9 * CS) - 1, -6); beam.castShadow = true; beam.receiveShadow = true; group.add(beam);
  placeModel(group, 'lanternC', 1, 2, hx0 + 60, -(9 * CS) - 2, -6, 'hang');
  lights.push({ x: hx0 + 60, y: -(9 * CS) - 10, z: -2, c: 0xffc070, i: 1.5, d: 70, flick: 0.15 });
  // the burrow's own lift
  const hl = 56;
  const cg = exMesh(cage3d(true)); cg.position.set(hl - 8, -fy, -4); group.add(cg);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1, fy - 16 - 9 * CS, 1), mats().cable); cab.position.set(hl, -(9 * CS + (fy - 16 - 9 * CS) / 2), -1); group.add(cab);
  lights.push({ x: hl + 6, y: -fy + 9, z: 0, c: 0xffb050, i: 1.2, d: 50, flick: 0.2 });
  // the round green door to the passage, Nugget the hen
  const door = exMesh(extrude('door', SPR.door, PAL, 3)); door.position.set(hx1 - 8, -fy + 12, -16); group.add(door);
  const hen = exMesh(extrude('hen', SPR.hen, PAL, 4)); hen.position.set(hx1 + 6, -fy + 6, -10); group.add(hen);
  // ---- Deep Town: shop fronts and houses along the street, the headframe over the shaft, a string of lamps
  const tx0 = 14 * CS + 4;
  const shop = (id, x, w) => { try { const s = buildShop(id, w); placeObj(group, s.obj, x + w * PXM * 0.6, -fy, -4, PXM * 1.2); return true; } catch (e) { return false; } };
  const house = (rows, key, x, flip) => { const m = exMesh(extrude(key, rows, PAL, 12, (i, j, zz) => zz < 11 || j > 8)); m.scale.set(flip ? -1.5 : 1.5, 1.5, 1.2); m.position.set(x + (flip ? rows[0].length * 1.5 : 0), -fy, -16); group.add(m); };
  if (!shop('tools', tx0, 4.5)) house(SPR.houseA, 'houseA', tx0, false);
  if (!shop('grocer', tx0 + 42, 4.5)) house(SPR.houseB, 'houseB', tx0 + 42, false);
  house(SPR.houseA, 'houseA', SHAFT_X3 + 16, true);
  house(SPR.houseB, 'houseB', SHAFT_X3 + 50, true);
  for (const x of [tx0 + 30, tx0 + 96, SHAFT_X3 + 40]) { placeModel(group, 'lanternC', 2, 4, x, -S.ceilAt(x, 9 * CS), -8, 'hang'); lights.push({ x, y: -S.ceilAt(x, 9 * CS) - 10, z: -4, c: 0xffc060, i: 1.2, d: 70, flick: 0.15 }); }
  for (const [x, y] of [[SHAFT_X3 + 26, 10], [SHAFT_X3 + 34, 10], [SHAFT_X3 + 52, 9], [SHAFT_X3 + 60, 9]]) lights.push({ x, y: -fy + y, z: 2, c: 0xffc060, i: 0.7, d: 26, flick: 0.1 });
  const hf = exMesh(extrude('headframe', SPR.headframe, PAL, 10, (i, j, zz) => zz === 0 || zz === 9 || j <= 8 || j === 14 || j === 15 || j === 20 || j === 21 || j >= 26));
  hf.position.set(SHAFT_X3 - 12, -fy + SPR.headframe.length, -14); group.add(hf);
  shaft3d(group, fy, H);
  // a forge in town, flickering
  furn('forge', SHAFT_X3 + 82, -12);
  lights.push({ x: SHAFT_X3 + 82, y: -fy + 8, z: -2, c: 0xff7a20, i: 2.0, d: 80, flick: 0.35 });
  anim.fires.push({ x: SHAFT_X3 + 82, y: -fy + 6 });
  // the string of lamps across the cavern
  const bulbs = [];
  for (let x = tx0 + 6; x < Math.min(W - 6, 30 * CS); x += 9) {
    const t = (x - tx0) / (30 * CS - tx0), y = -(7 * CS + 6 + Math.sin(t * Math.PI) * 8);
    if (S.A(x, -y) !== 1) continue;
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mats().bulb); b.position.set(x, y, -3); group.add(b); bulbs.push(b);
  }
  anim.bulbs = bulbs;
  lights.push({ x: tx0 + 60, y: -(7 * CS + 12), z: 0, c: 0xffd080, i: 0.9, d: 80, flick: 0.05 });
  lights.push({ x: tx0 + 140, y: -(7 * CS + 12), z: 0, c: 0xffd080, i: 0.9, d: 80, flick: 0.05 });
  return { group, lights, anim, H, homeStop: { x: hl, fy }, townStop: { x: SHAFT_X3 + 24, fy }, townTag: { x: SHAFT_X3, y: fy - SPR.headframe.length - 4 }, townX0: 14 * CS - 6, homeR: { x0: hx0, x1: hx1 }, townR: { x0: 14 * CS, x1: 31 * CS }, floorTop: () => fy };
}

// ------------------------------------------------------------------ the core
export function buildCore(C) {
  const { W } = C;
  const H = SEC_H.core;
  const group = new THREE.Group();
  const lights = [], anim = { surfaces: [], drips: [], spores: [], cages: [], critters: [], falls: [], floaters: [], lamps: [] };
  const S = slab(CORE_MAP, 6, W, H, 9);
  group.add(S.mesh);
  // the heart: a lopsided ball of flat carved bands of light, glowing on its own
  const R = 30, g = new VoxelGrid(R * 2 + 8, R + 4, 20);
  const BAND = [0xf6e6c2, 0xecc4c4, 0xc488b8, 0x8a52a0, 0x56307a];
  for (let z = 0; z < 20; z++) for (let y = 0; y < R + 4; y++) for (let x = 0; x < R * 2 + 8; x++) {
    const dx = (x - R - 4) * 0.62, dy = y, dz = (z - 10) * 1.5;
    const d = Math.hypot(dx, dy, dz) + Math.sin(x * 0.4) * 0.8 + Math.cos(y * 0.5 + x * 0.2) * 0.8;
    if (d > R) continue;
    g.set(x, y, z, BAND[Math.min(4, Math.floor((d / R) * 5))]);
  }
  const heart = new THREE.Mesh(meshGridGreedy(g, { scale: V, pivot: [g.w / 2, 0, 20], ao: false }), mats().glow);
  heart.position.set(W / 2, -H, -2);
  heart.scale.y = 0.55;
  group.add(heart);
  anim.heart = heart;
  lights.push({ x: W / 2, y: -H + 16, z: 4, c: 0xc890ff, i: 3.2, d: 160, flick: 0.12 });
  for (let r = 0; r < CORE_MAP.length; r++) for (let c = 0; c < CORE_MAP[0].length; c++) if (CORE_MAP[r][c] === 'q' && c * CS < W) {
    const h = placeModel(group, 'shard', c, 0, c * CS + 6, -(r * CS + 6), -10, 'mid');
    if (h) anim.floaters.push({ mesh: h.mesh, y0: h.mesh.position.y, ph: hash(c, r, 6) });
  }
  return { group, lights, anim, H, floorTop: () => H };
}
