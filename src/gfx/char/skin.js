// One skinned mesh per character: every part (head, body, limbs, ears, tail, hat, glasses,
// cane and each face variant) rides on its own "part bone" placed under the animated rig
// groups, and all parts are concatenated into a single geometry with rigid one-bone skinning.
// A character then draws as one outlined mesh (+ a small non-outlined one for whiskers), so
// it costs 3 draw calls instead of ~30, while every rig group still moves exactly as before.
// Face variants are shown or hidden by scaling their part bone to zero (see scaleVisible).
import * as THREE from 'three';
import { voxelMaterial } from '../Voxel.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';

const _identity = new THREE.Matrix4();

/**
 * Make obj.visible drive its scale (rest scale when shown, 0 when hidden), so code that toggles
 * .visible on a rig part keeps working when the part is skinned geometry rather than a mesh.
 */
export function scaleVisible(obj, restScale = obj.scale.clone()) {
  let vis = true;
  obj.userData.restScale = restScale;
  Object.defineProperty(obj, 'visible', {
    configurable: true,
    enumerable: true,
    get() { return vis; },
    set(v) {
      vis = !!v;
      if (vis) obj.scale.copy(obj.userData.restScale);
      else obj.scale.setScalar(0);
    },
  });
  return obj;
}

/** Collects part bones and their geometries, then builds the skinned meshes. */
export class SkinAssembler {
  constructor() {
    this.bones = [];
    this.layers = { main: [], detail: [] };
  }

  /**
   * Add a part: a new bone under `parent` (position, scale incl. mirroring, rotation) carrying
   * `geo` (voxel units, part-local). layer 'main' is outlined, 'detail' is not. Returns the bone.
   */
  part(parent, geo, o = {}) {
    const b = new THREE.Bone();
    if (o.pos) b.position.set(o.pos[0], o.pos[1], o.pos[2]);
    if (o.scale) b.scale.set(o.scale[0], o.scale[1], o.scale[2]);
    if (o.rot) b.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    parent.add(b);
    const index = this.bones.length;
    this.bones.push(b);
    if (geo && geo.attributes.position.count > 0) {
      const s = b.scale;
      this.layers[o.layer || 'main'].push({ geo, index, flip: s.x * s.y * s.z < 0 });
    }
    return b;
  }

  /** Add more geometry to an existing part bone (same local frame). */
  attach(bone, geo, layer = 'main') {
    const index = this.bones.indexOf(bone);
    const s = bone.userData.restScale || bone.scale;
    if (index >= 0 && geo && geo.attributes.position.count > 0) this.layers[layer].push({ geo, index, flip: s.x * s.y * s.z < 0 });
    return bone;
  }

  /** Build {main, detail, skeleton}. bounds: THREE.Sphere for culling (root-local). */
  build(material, bounds) {
    const skeleton = new THREE.Skeleton(this.bones, this.bones.map(() => _identity.clone()));
    const make = (parts, outline) => {
      if (!parts.length) return null;
      const geo = mergeSkinned(parts);
      const mesh = new THREE.SkinnedMesh(geo, material);
      // vertices are already in their bone's local frame: identity bind matrix and inverses
      mesh.bind(skeleton, new THREE.Matrix4());
      mesh.boundingSphere = bounds.clone();
      mesh.boundingBox = new THREE.Box3().setFromCenterAndSize(bounds.center, new THREE.Vector3().setScalar(bounds.radius * 2));
      if (outline) mesh.layers.enable(LAYER_OUTLINE);
      return mesh;
    };
    const main = make(this.layers.main, true);
    const detail = make(this.layers.detail, false);
    if (main) rebindDispose(main, skeleton);
    return { main, detail, skeleton };
  }
}

/** Free the bone texture when the scene disposes the character (Scene.exit → geometry.dispose). */
export function rebindDispose(mesh, skeleton) {
  mesh.userData.unbindDispose?.();
  const geo = mesh.geometry;
  const onDispose = () => { skeleton.dispose(); geo.removeEventListener('dispose', onDispose); };
  geo.addEventListener('dispose', onDispose);
  mesh.userData.unbindDispose = () => geo.removeEventListener('dispose', onDispose);
}

/**
 * Concatenate part geometries into one skinned geometry: positions as-is, normals as signed
 * bytes, colors as 16-bit, one bone per vertex (skinIndex.x, weight 1). Mirrored parts get
 * their triangle winding flipped so they stay front-facing.
 */
export function mergeSkinned(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.geo.attributes.position.count; ni += p.geo.index.count; }
  const pos = new Float32Array(nv * 3);
  const nor = new Int8Array(nv * 3);
  const col = new Uint16Array(nv * 3);
  const si = new Uint8Array(nv * 4);
  const sw = new Uint8Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.geo;
    const P = g.attributes.position.array, N = g.attributes.normal.array, C = g.attributes.color.array, I = g.index.array;
    const n = g.attributes.position.count;
    pos.set(P.subarray(0, n * 3), vo * 3);
    for (let i = 0, o = vo * 3; i < n * 3; i++, o++) {
      nor[o] = Math.round(N[i] * 127);
      const c = C[i];
      col[o] = c >= 1 ? 65535 : c <= 0 ? 0 : (c * 65535 + 0.5) | 0;
    }
    for (let i = 0, o = vo * 4; i < n; i++, o += 4) { si[o] = p.index; sw[o] = 255; }
    if (p.flip) for (let i = 0; i < I.length; i += 3) { idx[io + i] = I[i] + vo; idx[io + i + 1] = I[i + 2] + vo; idx[io + i + 2] = I[i + 1] + vo; }
    else for (let i = 0; i < I.length; i++) idx[io + i] = I[i] + vo;
    vo += n;
    io += I.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}

// ---------------------------------------------------------------- materials
// The voxel materials with a cheaper skinning path: every vertex follows exactly one bone, so
// the vertex shader fetches one bone matrix instead of four (the standard path still works,
// e.g. after setMaterialKind, because the weights are (1, 0, 0, 0)).
function oneBone(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <skinbase_vertex>', '#ifdef USE_SKINNING\n\tmat4 boneMatX = getBoneMatrix( skinIndex.x );\n#endif')
    .replace('#include <skinnormal_vertex>', '#ifdef USE_SKINNING\n\tmat4 skinMatrix = bindMatrixInverse * boneMatX * bindMatrix;\n\tobjectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;\n#endif')
    .replace('#include <skinning_vertex>', '#ifdef USE_SKINNING\n\ttransformed = ( bindMatrixInverse * ( boneMatX * ( bindMatrix * vec4( transformed, 1.0 ) ) ) ).xyz;\n#endif');
}

const shared = {};
/** Character material of a kind ('toon' | 'lambert' | 'basic'); unique → not shared/cached. */
export function charMaterial(kind = 'toon', unique = false) {
  if (!unique && shared[kind]) return shared[kind];
  const m = voxelMaterial(kind, unique ? { unique: true } : {}).clone();
  m.onBeforeCompile = oneBone;
  m.customProgramCacheKey = () => 'char-one-bone';
  m.userData = { shared: !unique, charKind: kind };
  if (!unique) shared[kind] = m;
  return m;
}
