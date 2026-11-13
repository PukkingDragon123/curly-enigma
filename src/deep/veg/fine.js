// Wave 12, "super high resolution" plants: a cave plant's voxel model (./vox.js VG) twice as fine
// (1/96–1/128 m), with detail that only exists at that size, not just the old voxels split in 8:
//
//   - refined with the size rule's 3D Scale2x (gfx/voxRes.js refine2): convex edges rounded,
//     concave creases filled, colour edges stepped at the finer size
//   - thin parts made thin again: a blade, stem, vine or leaflet one voxel thick stays one (fine)
//     voxel thick, so grass and fronds come out half as thick, not twice as chunky (the half kept
//     leans toward the next voxel along the strand, so diagonal strands stay joined)
//   - leaves: a lit, translucent rim, toothed (serrated) edges and fine vein lines across the blade
//   - stems and blades: pale tips
//   - mushroom caps: radial gills under the cap, fine pale specks on top
//
// fine2(g, pivot) → { g: { w, h, d, data }, pivot } (data as VG's: 0xRRGGBB | glow << 24 | FILLED).
import { refine2 } from '../../gfx/voxRes.js';

const RGB = 0xffffff;
const hash = (x, y, z, s) => {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177) + Math.imul(s | 0, 144269)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const mul = (v, f) => {
  const r = Math.min(255, Math.round(((v >> 16) & 255) * f)), g = Math.min(255, Math.round(((v >> 8) & 255) * f)), b = Math.min(255, Math.round((v & 255) * f));
  return ((v & ~RGB) | (r << 16) | (g << 8) | b) >>> 0;
};
const leafy = (v) => { const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255; return g > r * 1.05 && g >= b * 0.85; };

export function fine2(g, pivot) {
  const { w, h, d, data } = g;
  const wh = w * h;
  const has = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < w && y < h && z < d && data[x + w * (y + h * z)] !== 0;
  const f = refine2(data, w, h, d);
  const W = f.w, H = f.h, D = f.d, WH = W * H, out = f.data;
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D ? 0 : out[x + W * (y + H * z)]);
  // per original voxel: thin along which axes, and which half of its fine block to keep
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!data[x + w * (y + h * z)]) continue;
    const thin = [!has(x - 1, y, z) && !has(x + 1, y, z), !has(x, y - 1, z) && !has(x, y + 1, z), !has(x, y, z - 1) && !has(x, y, z + 1)];
    const nThin = thin[0] + thin[1] + thin[2];
    if (!nThin || nThin === 3) continue; // (a lone voxel stays a 2×2×2 speck)
    const keep = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      if (!thin[a]) continue;
      let plus = 0, minus = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const da = a === 0 ? dx : a === 1 ? dy : dz;
        if (!da || !has(x + dx, y + dy, z + dz)) continue;
        if (da > 0) plus++; else minus++;
      }
      keep[a] = plus > minus ? 1 : plus < minus ? 0 : (hash(x >> 2, y >> 2, z >> 2, a) < 0.5 ? 0 : 1);
    }
    for (let k = 0; k < 8; k++) {
      const s = [k & 1, (k >> 1) & 1, k >> 2];
      if ((thin[0] && s[0] !== keep[0]) || (thin[1] && s[1] !== keep[1]) || (thin[2] && s[2] !== keep[2])) out[(2 * x + s[0]) + W * (2 * y + s[1]) + WH * (2 * z + s[2])] = 0;
    }
  }
  // detail on the fine surface
  const cx = pivot[0] * 2 + 1, cz = pivot[2] * 2 + 1;
  const paint = [], cut = [];
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x + W * (y + H * z), v = out[i];
    if (!v) continue;
    const ox = x >> 1, oy = y >> 1, oz = z >> 1;
    const e = [!at(x - 1, y, z), !at(x + 1, y, z), !at(x, y - 1, z), !at(x, y + 1, z), !at(x, y, z - 1), !at(x, y, z + 1)];
    const open = e[0] + e[1] + e[2] + e[3] + e[4] + e[5];
    if (!open) continue;
    const thinO = [!has(ox - 1, oy, oz) && !has(ox + 1, oy, oz), !has(ox, oy - 1, oz) && !has(ox, oy + 1, oz), !has(ox, oy, oz - 1) && !has(ox, oy, oz + 1)];
    const nThin = thinO[0] + thinO[1] + thinO[2];
    const hv = hash(x, y, z, 7);
    if (leafy(v) && nThin === 1) {
      // a leaf (one voxel thick, wide in the other two): in-plane rim, teeth, veins
      const a = thinO[0] ? 0 : thinO[1] ? 1 : 2;
      const inPlaneOpen = (a !== 0 && (e[0] || e[1])) || (a !== 1 && (e[2] || e[3])) || (a !== 2 && (e[4] || e[5]));
      const u = a === 0 ? y : x, w2 = a === 2 ? y : z;
      if (inPlaneOpen) {
        if (((u + w2) & 1) && hv < 0.55) cut.push(i); // toothed edge
        else paint.push(i, mul(v, 1.16)); // the light through its rim
      } else if (((u - w2) % 4 + 4) % 4 === 0) paint.push(i, mul(v, 1.09)); // veins
      else if (hv < 0.04) paint.push(i, mul(v, 0.85)); // a spot of rot
    } else if (nThin === 2) {
      if (open >= 5) paint.push(i, mul(v, 1.22)); // stem and blade tips
    } else if (!nThin && !leafy(v)) {
      // caps: gills underneath, specks on top
      if (e[2] && !e[3]) {
        const ang = Math.atan2(z - cz, x - cx);
        if (((Math.floor((ang / (Math.PI * 2) + 1) * 28) % 2) + 2) % 2 === 0) paint.push(i, mul(v, 0.72));
      } else if (e[3] && hv < 0.035) paint.push(i, mul(v, 1.3));
    }
  }
  for (let j = 0; j < paint.length; j += 2) out[paint[j]] = paint[j + 1];
  for (const i of cut) out[i] = 0;
  return { g: { w: W, h: H, d: D, data: out }, pivot: pivot.map((q) => q * 2) };
}
