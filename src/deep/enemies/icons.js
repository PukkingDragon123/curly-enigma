// 32×32 pixel-art portraits of the creatures for the Index Book and discovery cards, drawn
// straight from their voxel models (a 3/4 orthographic projection, painter's order, top light,
// dark outline). No WebGL needed.
import { buildMimic, buildGolem, rockPalette } from './rock.js';
import { buildCrystalGolem } from './golem.js';
import { buildWisp } from './wisp.js';
import { buildImp } from './imp.js';
import { buildWyrm } from './wyrm.js';
import { buildPuffer } from './puffer.js';
import { buildBat } from './bats.js';
import { M } from '../materials.js';

const vox = (geo, ox = 0, oy = 0, oz = 0, mirror = false) => ({ v: geo?.userData?.vox || [], o: [ox, oy, oz], mirror });

/** Each species posed for its portrait: a list of voxel parts with offsets (model voxels). */
const POSES = {
  pebble_mimic: () => {
    const G = buildMimic(rockPalette(M.DIRT), 1, 7);
    return [vox(G.body, 0, 2), vox(G.eyes, 0, 2), vox(G.sprout, -1, 11, -1), vox(G.foot, 2, 2), vox(G.foot, -1, 2)];
  },
  rubble_golem: () => {
    const G = buildGolem(rockPalette(M.GRANITE), 3, 11);
    return [vox(G.torso, 0, 7), vox(G.glow, 0, 7), vox(G.eyes, 0, 7), vox(G.arm, 10, 20), vox(G.arm, -10, 20, 0, true), vox(G.leg, 5, 7), vox(G.leg, -5, 7)];
  },
  crystal_golem: () => {
    const G = buildCrystalGolem(rockPalette(M.CLAY), 3, 23);
    const parts = [vox(G.torso, 0, 13), vox(G.glow, 0, 13), vox(G.eyes, 0, 13), vox(G.arm, 12, 31), vox(G.arm, -13, 31, 0, true), vox(G.leg, 5, 13), vox(G.leg, -6, 13)];
    for (const S of G.shards) parts.push(vox(S.geo, 0, 13));
    return parts;
  },
  gloom_wisp: () => {
    const G = buildWisp(2);
    return [vox(G.orb), vox(G.eye), vox(G.tails[0], 1, -2, -7), vox(G.tails[1], 2, -3, -10), vox(G.tails[2], 3, -3, -12)];
  },
  ember_imp: () => {
    const G = buildImp(4);
    return [vox(G.body), vox(G.eyes, 0, 0, G.ez), vox(G.arm, 3, 5), vox(G.arm, -3, 5, 0, true), vox(G.flame, 0, 12, -1)];
  },
  crystal_wyrm: () => {
    const G = buildWyrm(3);
    const parts = [vox(G.head, 0, 0, 0), vox(G.jaw, 0, -2, 1), vox(G.eyes)];
    let z = -4, x = 0, y = 0;
    G.segs.forEach((g, i) => { z -= 4.6 - i * 0.3; x = Math.round(Math.sin(i * 1.1) * 3); y = Math.round(Math.cos(i * 0.8) * 1.5 - 1); parts.push(vox(g, x, y, Math.round(z))); });
    return parts;
  },
  spore_puffer: () => {
    const G = buildPuffer(1);
    return [vox(G.stem), vox(G.eyes, 0, 0, G.ez), vox(G.cap, 0, 8), vox(G.spots, 0, 8)];
  },
  shade_bat: () => {
    const G = buildBat();
    return [vox(G.frames[0]), vox(G.eyes, 0, 0, 2)];
  },
};

const cache = new Map();
const YAW = -0.6, PITCH = 0.42;

function render(parts, size = 32) {
  // gather voxels in model space
  const pts = [];
  const occ = new Set();
  for (const p of parts) for (const v of p.v) {
    const x = (p.mirror ? -1 - v.x : v.x) + p.o[0], y = v.y + p.o[1], z = v.z + p.o[2];
    pts.push([x, y, z, v.c]);
    occ.add(x + ',' + y + ',' + z);
  }
  if (!pts.length) return null;
  // rotate (yaw, then pitch) and project
  const cy = Math.cos(YAW), sy = Math.sin(YAW), cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const pr = pts.map(([x, y, z, c]) => {
    const rx = x * cy + z * sy, rz = -x * sy + z * cy;
    const ry = y * cp - rz * sp, d = y * sp + rz * cp;
    if (rx < x0) x0 = rx; if (rx > x1) x1 = rx; if (-ry < y0) y0 = -ry; if (-ry > y1) y1 = -ry;
    return [rx, -ry, d, c, occ.has(x + ',' + (y + 1) + ',' + z), occ.has(x + ',' + (y - 1) + ',' + z)];
  });
  const pad = 2, k = Math.min((size - pad * 2) / (x1 - x0 + 1.2), (size - pad * 2) / (y1 - y0 + 1.2));
  const ox = (size - (x1 - x0 + 1) * k) / 2 - x0 * k, oy = (size - (y1 - y0 + 1) * k) / 2 - y0 * k;
  pr.sort((a, b) => a[2] - b[2]); // far → near
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const s = Math.max(1, Math.ceil(k));
  for (const [x, y, , c, up, down] of pr) {
    const f = !up ? 1.14 : !down ? 0.8 : 0.95;
    const r = Math.min(255, ((c >> 16) & 255) * f), gg = Math.min(255, ((c >> 8) & 255) * f), b = Math.min(255, (c & 255) * f);
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`;
    g.fillRect(Math.floor(x * k + ox), Math.floor(y * k + oy), s, s);
  }
  // 1px dark outline around the silhouette
  const img = g.getImageData(0, 0, size, size), d = img.data;
  const solid = (x, y) => x >= 0 && y >= 0 && x < size && y < size && d[(y * size + x) * 4 + 3] > 0;
  const edge = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!solid(x, y) && (solid(x + 1, y) || solid(x - 1, y) || solid(x, y + 1) || solid(x, y - 1))) edge.push((y * size + x) * 4);
  for (const i of edge) { d[i] = 26; d[i + 1] = 16; d[i + 2] = 24; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return cv.toDataURL();
}

/** Data URL of a creature portrait, or null for ids this module doesn't draw. */
export function enemyIconURL(id) {
  if (cache.has(id)) return cache.get(id);
  const pose = POSES[id];
  if (!pose) return null;
  let url = null;
  try {
    const parts = pose();
    url = render(parts);
  } catch (e) { console.warn('creature icon', id, e); }
  cache.set(id, url);
  return url;
}
