// Ingredients as real 3D voxel models in the kitchen (on the board, bobbing in the pot, in the paws
// during the new steps): the item's own pixel art grown into a voxel body by ui/itemVox.js (rounded
// by what it is: a lump, a sheet, a blade), meshed with baked face shading and corner AO. One
// geometry per item, shared; meshes are cheap. Origin: the model's bottom centre.
//
//   ingredientMesh(id, size)  → THREE.Mesh (size: world width of the 64-voxel frame) or null
import * as THREE from 'three';
import { itemVox } from '../ui/itemVox.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

const geos = new Map(); // id → { geo, minY, maxY } | null
let mat = null;

function geoOf(id) {
  if (geos.has(id)) return geos.get(id);
  let out = null;
  try {
    const m = itemVox._build(id);
    if (m) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
      g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      g.computeBoundingBox();
      const b = g.boundingBox;
      g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      g.userData.shared = true;
      out = { geo: g, h: b.max.y - b.min.y, w: b.max.x - b.min.x };
    }
  } catch (e) { out = null; }
  geos.set(id, out);
  return out;
}

/** The ingredient's voxel model, `size` world units across its 64-voxel frame (null if it can't be made). */
export function ingredientMesh(id, size = 0.3) {
  const G = geoOf(id);
  if (!G) return null;
  mat ||= new THREE.MeshBasicMaterial({ vertexColors: true });
  mat.userData.shared = true;
  const m = new THREE.Mesh(G.geo, mat);
  m.scale.setScalar(size / 64);
  m.layers.enable(LAYER_OUTLINE);
  m.userData.h = G.h * size / 64;
  m.userData.w = G.w * size / 64;
  m.userData.keepGeo = true; // (shared: disposeObject should leave it)
  return m;
}
