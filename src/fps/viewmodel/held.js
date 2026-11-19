// What the mole holds in first person when the picked hotbar slot holds an item rather than a tool
// (wave 19): the item's real 3D model (src/ui/itemModels.js: the gathering plants, the clump's ore,
// the kitchen's dishes, the home's furniture, the forge's weapons, the build part's blocks, and the
// voxel models of src/ui/itemBuild.js for everything else) in view-model voxels (VMV), placed for
// the way a paw would hold it:
//   pinch   small things stood on the curled fist (a mushroom, a gem, an egg, a lump of ore, a jar)
//   cradle  bigger or flat-bottomed things on the open palm, palm up (a bowl, an ingot, a lantern)
//   sheet   paper held up by its bottom edge, face to you (plans, letters, tickets)
//   haft    long things by the lower end of their length (a stick, a forged sword, an axe)
// Each geometry is built once and kept (a few dozen at most); bites for the eating animation are
// cut from it (stage 1-3: mouthfuls gone from the top).
//
//   heldGeo(key, stage = 0) → { geo, glow, glowColor, grip, tip } | null   (key: item id or 'w.type.metal.inf')
//   gripOf(key) → 'pinch' | 'cradle' | 'sheet' | 'haft'
import * as THREE from 'three';
import { ITEMS } from '../../data/items.js';
import { DISHES } from '../../data/recipes.js';
import { itemMesh } from '../../ui/itemModels.js';

/** How a paw holds an item. */
export function gripOf(key) {
  if (!key) return 'pinch';
  if (key.startsWith('w.')) return 'haft';
  const it = ITEMS[key];
  if (!it) return 'pinch';
  const c = it.cat;
  if (c === 'blueprint' || /ticket|letter|hymn/.test(key)) return 'sheet';
  if (c === 'tool' || key === 'stick' || key === 'support_beam' || key === 'troll_tusk') return 'haft';
  if ((c === 'food' && DISHES[key]) || c === 'furniture' || c === 'block' || c === 'ingot' || c === 'equip' || c === 'floor' || c === 'wallpaper'
    || /butter|flour|meat|hide|plate|pie|weights|tablet|crown|disc|mirror|mask|honey|nest/.test(key)) return 'cradle';
  return 'pinch';
}
// how big it shows (its largest side, in view-model voxels: 3.5 mm each)
const SIZE = { pinch: 26, cradle: 40, sheet: 42, haft: 100 };
function sizeOf(key, grip) {
  const it = ITEMS[key], c = it?.cat;
  if (grip === 'pinch') {
    if (c === 'gem') return 20;
    if (c === 'critter' || c === 'plant' || /egg/.test(key)) return 28;
    if (c === 'mineral' || c === 'relic') return 26;
    return SIZE.pinch;
  }
  if (grip === 'cradle') {
    if (c === 'furniture') return 50;
    if (c === 'ingot') return 34;
    if (c === 'block') return 32;
    return SIZE.cradle;
  }
  if (grip === 'haft') return key.startsWith('w.') ? 120 : c === 'tool' ? 104 : SIZE.haft;
  return SIZE[grip] || 30;
}

const cache = new Map(); // `${key}|${stage}` → result | null
const BITES = [[0.32, 1.0, 0.22, 0.34], [-0.12, 1.02, 0.3, 0.36], [0.05, 0.9, -0.1, 0.4]];

/**
 * The held model of an item in view-model voxels, the paw's origin as the frame (the fist's grip
 * centre; for 'cradle' the open paw's palm centre, palm facing -y): { geo, glow, glowColor, grip, tip }.
 */
export function heldGeo(key, stage = 0) {
  const ck = key + '|' + stage;
  if (cache.has(ck)) return cache.get(ck);
  let out = null;
  try { out = build(key, stage); } catch (e) { console.warn('held', key, e); out = null; }
  cache.set(ck, out);
  return out;
}

function build(key, stage) {
  const m = itemMesh(key);
  if (!m) return null;
  const M = m.M, grip = gripOf(key);
  const s = sizeOf(key, grip);
  const P = M.P, N = M.N, n = P.length / 3;
  // the model stood up for holding: a long one ('lay': long axis on x) turned upright, its + end up
  const up = M.orient === 'lay';
  let tx, ty, tz; // where (model units, after standing it up) the model's frame sits
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    if (up) { const a = x; x = -y; y = a; const b = nx; nx = -ny; ny = b; }
    if (grip === 'sheet' && M.orient === 'flat') { // face up → face to the viewer, its top edge up
      const yy = y; y = -z; z = yy; const ny2 = ny; ny = -nz; nz = ny2;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; nor[i * 3] = nx; nor[i * 3 + 1] = ny; nor[i * 3 + 2] = nz;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const H = y1 - y0;
  // placement in the paw (voxels): stood on the fist / laid on the palm / held low on its length
  if (grip === 'pinch') { tx = 0; ty = 4 - y0 * s; tz = -1; }
  else if (grip === 'sheet') { tx = 0; ty = 2 - y0 * s; tz = -2; }
  else if (grip === 'haft') { tx = 0; ty = -(y0 + H * 0.22) * s; tz = 0; }
  else { tx = 0; ty = 0; tz = -3; }
  // bites (eating): mouthfuls gone from the top of it
  const bites = BITES.slice(0, stage).map(([bx, by, bz, r]) => [bx, y0 + by * H, bz, r]);
  const bitten = (x, y, z) => bites.some(([bx, by, bz, r]) => (x - bx) ** 2 + (y - by) ** 2 + (z - bz) ** 2 < r * r);
  const C = M.C, G = M.G, I = M.I;
  const mk = (keep) => {
    const idx = [];
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      if (!keep(a)) continue;
      if (bites.length) {
        const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3, cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
        if (bitten(cx, cy, cz)) continue;
      }
      idx.push(a, b, c);
    }
    if (!idx.length) return null;
    // compact the vertices this part uses
    const map = new Int32Array(n).fill(-1), vp = [], vn = [], vc = [], ii = [];
    for (const v of idx) {
      if (map[v] < 0) {
        map[v] = vp.length / 3;
        let x = pos[v * 3] * s, y = pos[v * 3 + 1] * s, z = pos[v * 3 + 2] * s, nx = nor[v * 3], ny = nor[v * 3 + 1], nz = nor[v * 3 + 2];
        if (grip === 'cradle') { x = -x; y = -y; nx = -nx; ny = -ny; } // on the palm: the paw is turned palm up
        vp.push(x + tx, y + (grip === 'cradle' ? -(6.5 - y0 * s) : ty), z + tz);
        vn.push(nx, ny, nz);
        vc.push(C[v * 3], C[v * 3 + 1], C[v * 3 + 2]);
      }
      ii.push(map[v]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vp, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(vn, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(vc, 3));
    g.setIndex(vp.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(ii, 1) : new THREE.Uint16BufferAttribute(ii, 1));
    g.userData.shared = true;
    return g;
  };
  const lit = (v) => !(G && G[v] > 0.25);
  const geo = mk(lit), glow = G ? mk((v) => !lit(v)) : null;
  // the glow's colour: the average of its voxels
  let glowColor = null;
  if (glow) {
    const c = glow.attributes.color.array, k = c.length / 3, sum = [0, 0, 0];
    for (let i = 0; i < c.length; i += 3) { sum[0] += c[i]; sum[1] += c[i + 1]; sum[2] += c[i + 2]; }
    glowColor = new THREE.Color(sum[0] / k, sum[1] / k, sum[2] / k).getHex();
  }
  // where its top is (dust, crumbs, sparks)
  const top = grip === 'cradle' ? [0, -6.5 - H * s, -3] : [0, (y1 * s) + ty, tz];
  return { geo: geo || glow, glow: geo ? glow : null, glowColor, grip, tip: top };
}
