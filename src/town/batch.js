// Static batching for the first-person town. Every lit (toon) and glowing (unlit) voxel mesh goes
// into one material, a toon material that passes vertices flagged as glowing through unlit, so a
// patch of town (a few meters square) is a single draw call. Levels of detail (lod.js):
//   0  the meshes as built, in the outline pass when near
//   1  1/32 detail snapped to 1/16 (per patch)
//   2  everything at 1/8 (fine pieces at 1/16), 3: at 1/4 (fine at 1/8)
// Levels 2 and 3 are packed per block of 2×2 patches, each patch's share a contiguous range: when
// the whole block is far it is one draw call, otherwise each patch draws its own range.
// Within a patch the outlined triangles come first: the outline pass draws the same buffers
// through a second mesh limited to that prefix. Vertex data is packed: 16-bit positions in the
// patch's (or block's) own frame, byte normals, 16-bit colours (scaled by 4 in the shader, baked
// light goes above 1), byte glow; the CPU copies are dropped once uploaded.
import * as THREE from 'three';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { snapPacked } from './lod.js';

const CSCALE = 4;
const _v = new THREE.Vector3();
let MAT = null;
/** The shared town material: MeshToonMaterial + a per-vertex `glow` (0 lit, 1 unlit vertex colour). */
export function townMaterial() {
  if (MAT) return MAT;
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: voxelMaterial('toon').gradientMap });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <color_vertex>', `#include <color_vertex>\nvColor *= ${CSCALE.toFixed(1)};`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, diffuseColor.rgb, vGlow);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'town-glow-2';
  m.userData.shared = true;
  MAT = m;
  return m;
}

const isBatchable = (mt) => mt && !Array.isArray(mt) && mt.userData?.shared && (mt.isMeshToonMaterial || mt.isMeshBasicMaterial)
  && !mt.transparent && mt.opacity === 1 && !mt.map;

/** Once on the GPU the statics are never read again: drop the CPU copy. */
function release() { this.array = null; }
/** The transform of a packed geometry: positions are 16-bit fractions of a cube at o with edge e (meters). */
function frameOf(box) {
  // padded: coarser levels snap vertices up to half a lattice step outside the original box, and
  // a 16-bit position outside its frame would wrap round into a sliver across the whole patch
  const PAD = 0.12;
  const s = box.getSize(new THREE.Vector3());
  return { o: box.min.clone().subScalar(PAD), e: Math.max(s.x, s.y, s.z, 0.01) + PAD * 2 };
}
/** A world box in frame xf (what three sees in the geometry's own coordinates). */
function localBounds(box, xf) {
  const b = box.clone().translate(_v.copy(xf.o).negate());
  b.min.divideScalar(xf.e); b.max.divideScalar(xf.e);
  return { box: b, sphere: b.getBoundingSphere(new THREE.Sphere()) };
}
/** Put a mesh in a packed geometry's frame. */
function applyFrame(mesh, xf) { mesh.position.copy(xf.o); mesh.scale.setScalar(xf.e); mesh.updateMatrix(); mesh.updateMatrixWorld(true); }
const q16 = (v) => (v <= 0 ? 0 : v >= 65535 ? 65535 : Math.round(v));
/** Packed arrays → a geometry in frame xf (positions as 16-bit fractions). */
function toGeometry(pk, xf) {
  const g = new THREE.BufferGeometry();
  const n = pk.P.length / 3, Q = new Uint16Array(n * 3), k = 65535 / xf.e;
  for (let v = 0; v < n; v++) {
    const i = v * 3;
    Q[i] = q16((pk.P[i] - xf.o.x) * k); Q[i + 1] = q16((pk.P[i + 1] - xf.o.y) * k); Q[i + 2] = q16((pk.P[i + 2] - xf.o.z) * k);
  }
  g.setAttribute('position', new THREE.BufferAttribute(Q, 3, true).onUpload(release));
  g.setAttribute('normal', new THREE.BufferAttribute(pk.N, 3, true).onUpload(release));
  g.setAttribute('color', new THREE.BufferAttribute(pk.C, 3, true).onUpload(release));
  g.setAttribute('glow', new THREE.BufferAttribute(pk.G, 1, true).onUpload(release));
  g.setIndex(new THREE.BufferAttribute(pk.I, 1).onUpload(release));
  return g;
}
/** Another geometry over the same buffers drawing index range [start, start + count). */
function view(geo, start, count, box, sphere) {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
  g.setIndex(geo.index);
  g.setDrawRange(start, count);
  g.boundingBox = box;
  g.boundingSphere = sphere;
  return g;
}

/**
 * Collects static meshes (world matrices baked, meters) into patches. cls separates kinds of
 * statics that should not share a patch (the roof is far overhead and gets its own, larger patches).
 */
export class TownBatch {
  constructor(o = {}) {
    this.cell = o.cell ?? 4;
    this.cells = o.cells || {}; // per-class cell size
    this.groups = new Map();
  }

  /** o.fine: true = full detail at level 1, halved at 2 (lettering, thin posts); 'keep' = never simplified (wires). */
  add(obj, cls = 'ground', o = {}) {
    obj.updateMatrixWorld(true);
    const C = this.cells[cls] ?? this.cell;
    obj.traverse((m) => {
      if (!m.isMesh || !m.geometry || m.userData.noBatch || m.isSkinnedMesh || m.isInstancedMesh) return;
      const g0 = m.geometry;
      if (!g0.getAttribute('color') || g0.getAttribute('uv') || !g0.index || !isBatchable(m.material)) return;
      if (!m.visible || !g0.index.count) { m.userData.batched = true; return; }
      if (m.matrixWorld.determinant() < 0) return; // mirrored: keep as is (winding)
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', g0.getAttribute('position').clone());
      geo.setAttribute('normal', g0.getAttribute('normal').clone());
      geo.setAttribute('color', g0.getAttribute('color').clone());
      geo.setIndex(g0.index.clone());
      geo.applyMatrix4(m.matrixWorld);
      geo.computeBoundingSphere();
      const c = geo.boundingSphere.center;
      const cx = Math.floor(c.x / C), cz = Math.floor(c.z / C);
      const key = `${cls}|${cx},${cz}`;
      let e = this.groups.get(key);
      if (!e) this.groups.set(key, (e = { cls, cx, cz, ol: [], plain: [] }));
      // glowing bits (windows, bulbs, crystals) are small and stand out: they only halve, like fine ones
      const glow = m.material.isMeshBasicMaterial;
      // per mesh, userData.lod 'keep' (never simplified) or 'fine' overrides the object's setting
      const ml = m.userData.lod, of = ml || o.fine;
      (m.layers.isEnabled(LAYER_OUTLINE) ? e.ol : e.plain).push({ geo, glow: glow ? 255 : 0, fine: of === 'keep' ? 2 : (of || glow) ? 1 : 0 });
      m.userData.batched = true;
    });
    obj.traverse((m) => { if (m.isMesh && m.userData.batched) m.geometry.dispose(); });
  }

  /**
   * Merge, bake and pack every patch; build its levels and the far blocks; add the meshes.
   * levels: [{ step, fine }] (meters) for levels 1, 2, 3. Returns { patches, blocks }.
   */
  build(parent, { bake, levels = [] } = {}) {
    const mat = townMaterial();
    const patches = [];
    for (const e of this.groups.values()) {
      const parts = e.ol.concat(e.plain);
      let nv = 0, ni = 0;
      for (const p of parts) { nv += p.geo.getAttribute('position').count; ni += p.geo.index.count; }
      if (!ni) continue;
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), Cc = new Float32Array(nv * 3), G = new Uint8Array(nv);
      const fine = parts.some((p) => p.fine) ? new Uint8Array(nv) : null;
      const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
      let v = 0, k = 0, olTris = 0;
      parts.forEach((p, pi) => {
        const n = p.geo.getAttribute('position').count;
        P.set(p.geo.getAttribute('position').array, v * 3);
        N.set(p.geo.getAttribute('normal').array, v * 3);
        Cc.set(p.geo.getAttribute('color').array, v * 3);
        if (p.glow) G.fill(p.glow, v, v + n);
        if (p.fine) fine.fill(p.fine, v, v + n);
        const src = p.geo.index.array;
        for (let j = 0; j < src.length; j++) I[k++] = src[j] + v;
        if (pi < e.ol.length) olTris += src.length / 3;
        v += n;
        p.geo.dispose();
      });
      if (bake) {
        // lit vertices take the baked light; glowing ones keep their own colour
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
        const keep = Cc.slice();
        g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
        bake(g);
        for (let i = 0; i < nv; i++) if (G[i]) { Cc[i * 3] = keep[i * 3]; Cc[i * 3 + 1] = keep[i * 3 + 1]; Cc[i * 3 + 2] = keep[i * 3 + 2]; }
      }
      // pack: byte normals, 16-bit colours
      const Nq = new Int8Array(nv * 3), Cq = new Uint16Array(nv * 3);
      for (let i = 0; i < nv * 3; i++) { Nq[i] = Math.round(N[i] * 127); Cq[i] = Math.round(Math.min(1, Cc[i] / CSCALE) * 65535); }
      const pk = { P, N: Nq, C: Cq, G, I, fine, ol: olTris };
      const box = new THREE.Box3();
      for (let i = 0; i < nv * 3; i += 3) box.expandByPoint(_v.set(P[i], P[i + 1], P[i + 2]));
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const xf = frameOf(box);
      const loc = localBounds(box, xf);
      const geo = toGeometry(pk, xf);
      geo.boundingBox = loc.box; geo.boundingSphere = loc.sphere;
      const lv = [{ geo, ol: olTris, pk, xf }];
      if (levels[0]) {
        const r = snapPacked(pk, levels[0].step, levels[0].fine, false, levels[0].minGain ?? 0.08);
        if (r) { const g1 = toGeometry(r, xf); g1.boundingBox = loc.box; g1.boundingSphere = loc.sphere; lv.push({ geo: g1, ol: r.ol, xf }); } else lv.push(lv[0]);
      }
      for (const l of lv) if (l.ol && !l.olGeo) l.olGeo = view(l.geo, 0, l.ol * 3, loc.box, loc.sphere);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.layers.set(0);
      mesh.frustumCulled = false; // cullPatches tests the box
      mesh.matrixAutoUpdate = false;
      applyFrame(mesh, xf);
      parent.add(mesh);
      let outline = null;
      if (olTris) {
        outline = new THREE.Mesh(lv[0].olGeo, mat);
        outline.layers.set(LAYER_OUTLINE);
        outline.frustumCulled = false;
        outline.matrixAutoUpdate = false;
        applyFrame(outline, xf);
        parent.add(outline);
      }
      patches.push({ mesh, outline, levels: lv, level: 0, want: 0, show: true, olShow: !!outline, box, sphere, cls: e.cls, cx: e.cx, cz: e.cz });
    }
    // far levels, packed per block of 2×2 patches
    const blocks = new Map();
    for (const p of patches) {
      const key = `${p.cls}|${p.cx >> 1},${p.cz >> 1}`;
      let b = blocks.get(key);
      if (!b) blocks.set(key, (b = { children: [], geos: {}, box: new THREE.Box3(), mesh: null, level: -1 }));
      b.children.push(p);
      b.box.union(p.box);
      p.block = b;
    }
    for (const b of blocks.values()) {
      b.xf = frameOf(b.box);
      for (let L = 2; L <= levels.length; L++) {
        const cfg = levels[L - 1];
        const packs = b.children.map((p) => snapPacked(p.levels[0].pk, cfg.step, cfg.fine, true));
        let nv = 0, ni = 0;
        for (const r of packs) { nv += r.P.length / 3; ni += r.I.length; }
        const all = { P: new Float32Array(nv * 3), N: new Int8Array(nv * 3), C: new Uint16Array(nv * 3), G: new Uint8Array(nv), I: new (nv > 65535 ? Uint32Array : Uint16Array)(ni) };
        let v = 0, k = 0;
        const ranges = [];
        for (const r of packs) {
          const n = r.P.length / 3;
          all.P.set(r.P, v * 3); all.N.set(r.N, v * 3); all.C.set(r.C, v * 3); all.G.set(r.G, v);
          ranges.push([k, r.I.length]);
          for (let j = 0; j < r.I.length; j++) all.I[k++] = r.I[j] + v;
          v += n;
        }
        const geo = toGeometry(all, b.xf);
        const bl = localBounds(b.box, b.xf);
        geo.boundingBox = bl.box; geo.boundingSphere = bl.sphere;
        b.geos[L] = geo;
        b.children.forEach((p, i) => { const pl = localBounds(p.box, b.xf); p.levels[L] = { geo: view(geo, ranges[i][0], ranges[i][1], pl.box, pl.sphere), ol: 0, xf: b.xf }; });
      }
      if (b.geos[2]) {
        b.mesh = new THREE.Mesh(b.geos[2], mat);
        b.mesh.layers.set(0);
        b.mesh.visible = false;
        b.mesh.frustumCulled = false;
        b.mesh.matrixAutoUpdate = false;
        applyFrame(b.mesh, b.xf);
        parent.add(b.mesh);
      }
    }
    for (const p of patches) delete p.levels[0].pk;
    this.groups.clear();
    return { patches, blocks: [...blocks.values()] };
  }
}

/** Use level lv of a patch, with or without its outline (shown by cullPatches). */
function setPatch(p, lv, near) {
  lv = Math.min(lv, p.levels.length - 1);
  const L = p.levels[lv];
  if (p.level !== lv) {
    if (p.levels[p.level]?.xf !== L.xf) applyFrame(p.mesh, L.xf);
    p.level = lv;
    p.mesh.geometry = L.geo;
    if (p.outline && L.olGeo) p.outline.geometry = L.olGeo;
  }
  p.show = true;
  p.olShow = !!(p.outline && near && L.ol);
}

/**
 * Pick every patch's level from the camera (dist: [level-1, level-2, level-3 thresholds] in
 * meters to the patch's box; olDist: outline pass). A block whose patches all want level 2 or
 * more is drawn as one mesh at the finest level any of them wants.
 */
export function updatePatches(blocks, cam, dist, olDist, lodOff = false) {
  for (const b of blocks) {
    let min = 9;
    for (const p of b.children) {
      const d = p.box.distanceToPoint(cam);
      p.want = lodOff ? 0 : d < dist[0] ? 0 : d < dist[1] ? 1 : d < dist[2] ? 2 : 3;
      p.near = d < olDist;
      if (p.want < min) min = p.want;
    }
    b.show = !!(b.mesh && min >= 2);
    if (b.show) {
      const L = Math.min(min, 3);
      if (b.level !== L) { b.level = L; b.mesh.geometry = b.geos[L] || b.geos[2]; }
      for (const p of b.children) { p.show = false; p.olShow = false; }
    } else {
      for (const p of b.children) setPatch(p, p.want, p.near);
    }
  }
}

/** Every frame: show what updatePatches picked and the camera can see (boxes: tighter than three's spheres). */
export function cullPatches(blocks, frustum) {
  for (const b of blocks) {
    if (b.mesh) b.mesh.visible = !!b.show && frustum.intersectsBox(b.box) && !b.mesh.userData.hideDbg;
    for (const p of b.children) {
      const v = !!p.show && frustum.intersectsBox(p.box) && !p.mesh.userData.hideDbg;
      p.mesh.visible = v;
      if (p.outline) p.outline.visible = v && p.olShow;
    }
  }
}

/** Free the levels' own buffers (level 0 goes with the scene's usual disposal). */
export function disposePatches(patches, blocks) {
  const own = new Set();
  for (const p of patches) {
    if (p.levels[1] && p.levels[1] !== p.levels[0]) own.add(p.levels[1].geo);
    p.mesh.geometry = p.levels[0].geo;
    if (p.outline) p.outline.geometry = p.levels[0].olGeo;
  }
  for (const b of blocks) for (const g of Object.values(b.geos)) own.add(g);
  for (const g of own) g.dispose();
}
