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
import * as THREE from 'three';
import { VoxelGrid } from './Voxel.js';
import { voxMesh, meshRelief } from '../bookends/vox.js';

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

/**
 * A painted surface (wall, floor, ceiling) as a voxel relief at its texture's own resolution: one
 * column per texel, the dark seams (mortar, board gaps, cracks: darker than `seam` × their
 * neighbourhood) sunk one voxel (dz) behind the faces, which sit exactly on the old plane. The
 * pixel art stays on the faces (planar uv), the relief adds real depth and baked AO, and flat runs
 * merge into a few quads. topLeft = world corner of canvas pixel (0, 0); xDir / yDir = unit
 * vectors along canvas x and down the canvas rows; normal = the side that faces the room.
 */
export function texRelief(tex, { topLeft, xDir, yDir, normal, width, height, dz, seam = 0.72, tint = 0xffffff }) {
  const pix = readPixels(tex);
  const W = pix.w, D = pix.h;
  const lum = new Float32Array(W * D);
  for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    const c = pix.get(i, k);
    lum[i + W * k] = c < 0 ? 0 : 0.3 * ((c >> 16) & 255) + 0.59 * ((c >> 8) & 255) + 0.11 * (c & 255);
  }
  // 5x5 neighbourhood mean through an integral image
  const I = new Float64Array((W + 1) * (D + 1));
  for (let k = 0; k < D; k++) { let row = 0; for (let i = 0; i < W; i++) { row += lum[i + W * k]; I[(i + 1) + (W + 1) * (k + 1)] = I[(i + 1) + (W + 1) * k] + row; } }
  const box = (i0, k0, i1, k1) => I[i1 + (W + 1) * k1] - I[i0 + (W + 1) * k1] - I[i1 + (W + 1) * k0] + I[i0 + (W + 1) * k0];
  const h = new Uint16Array(W * D), top = new Uint32Array(W * D).fill(0xffffff);
  for (let k = 0; k < D; k++) for (let i = 0; i < W; i++) {
    const i0 = Math.max(0, i - 2), k0 = Math.max(0, k - 2), i1 = Math.min(W, i + 3), k1 = Math.min(D, k + 3);
    const avg = box(i0, k0, i1, k1) / ((i1 - i0) * (k1 - k0));
    h[i + W * k] = lum[i + W * k] < avg * seam ? 1 : 2;
  }
  const sx = width / W, sy = height / D;
  const mul = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
  const o = [topLeft[0] - normal[0] * 2 * dz, topLeft[1] - normal[1] * 2 * dz, topLeft[2] - normal[2] * 2 * dz];
  const geo = meshRelief({ W, D, h, top, U: mul(xDir, sx), V: mul(yDir, sy), N: mul(normal, dz), origin: o, wallAO: false });
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let n = 0; n < p.count; n++) {
    const rx = p.getX(n) - topLeft[0], ry = p.getY(n) - topLeft[1], rz = p.getZ(n) - topLeft[2];
    uv[n * 2] = (rx * xDir[0] + ry * xDir[1] + rz * xDir[2]) / width;
    uv[n * 2 + 1] = 1 - (rx * yDir[0] + ry * yDir[1] + rz * yDir[2]) / height;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, color: tint }));
}
