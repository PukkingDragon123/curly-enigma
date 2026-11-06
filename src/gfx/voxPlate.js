// Pixel art → voxel art. Painted things (a painting, a chalkboard, a sign board, the view through a
// window) are drawn on a PixelCanvas as before, then built as a slab of real voxels, one voxel per
// texel, with relief from a depth function: frames stand proud, chalk sits on the slate, letters
// are carved or raised. No flat textured quads.
//
//   readPixels(canvas | texture | PixelCanvas) → { w, h, get(x, y) → 0xRRGGBB | -1 (transparent) }
//   voxelPlate(src, { scale, depth(x, y, c) → voxels (0 = none), color(x, y, c, z, d) → colour,
//                     pivot, kind, outline, material, ao })
//     builds a VoxelGrid w × h × maxDepth (canvas row 0 at the top, the plate's back at z = 0,
//     facing +z) and meshes it greedily. Default pivot: the centre of the back face.
import { VoxelGrid } from './Voxel.js';
import { voxMesh } from '../bookends/vox.js';

export function readPixels(src) {
  const canvas = src.isTexture ? src.image : src.canvas && src.canvas.getContext ? src.canvas : src;
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  return {
    w, h,
    get(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return -1;
      const i = (y * w + x) * 4;
      return d[i + 3] < 128 ? -1 : (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    },
  };
}

export function voxelPlate(src, o = {}) {
  const pix = src.get ? src : readPixels(src);
  const { w, h } = pix;
  const depthOf = o.depth || (() => 1);
  const dep = new Uint8Array(w * h);
  let D = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = pix.get(x, y);
    if (c < 0) continue;
    const d = Math.max(0, Math.round(depthOf(x, y, c)));
    dep[y * w + x] = d;
    if (d > D) D = d;
  }
  const g = new VoxelGrid(w, h, D);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = dep[y * w + x];
    if (!d) continue;
    const c = pix.get(x, y);
    for (let z = 0; z < d; z++) g.set(x, h - 1 - y, z, o.color ? o.color(x, y, c, z, d) : c);
  }
  const m = voxMesh(g, {
    scale: o.scale ?? 1 / 32, pivot: o.pivot || [w / 2, h / 2, 0], kind: o.kind || 'lambert',
    outline: o.outline ?? true, material: o.material, ao: o.ao, shade: o.shade,
  });
  m.userData.plate = { w, h, d: D };
  return m;
}
