// Chibi voxel characters: procedural moles (and friends) with ages, body types, faces,
// fur, dirty outfits, hats and a procedural animation rig.
//
// Models are built at 1/32-unit voxels (twice the classic 1/16 detail) by the part builders
// in ./char/ (head, face, body, limbs, hats, chicken, paw), greedy-meshed by ./char/mesher.js
// and cached by their inputs (LRU). Each character is then assembled into ONE skinned mesh
// (./char/skin.js): every part rides on its own bone under the classic rig groups, so a
// character costs ~3 draw calls (outlined body: colour + mask pass; whiskers) instead of ~30,
// with all animation intact. setTint / uniqueMaterial work as before.
// World-space sizes, heights, hand sockets, the lamp anchor and the rig API match the classic
// rig. rig.s is still the classic 1/16 unit (× scale) used for animation offsets; rig.vs is the
// hi-res voxel size. Extra rig fields: rig.anchors {eyes, mouth, nose, headTop (neck-local
// Vector3s), headW, headH, headD}, rig.eyeDrop (true: eyes sit lower than the classic rig's),
// rig.brows / rig.ears / rig.whiskers (groups or null), rig.mouthRest (closed-mouth shapes),
// rig.meshes, rig.skeleton, rig.dispose(). makeCharacter(spec, {lod: 'crowd'}) builds a single
// mesh for background crowds (no whiskers, lamp lens baked in); rig.simplify() does it in place.
// Face-only emotes for doEmote: 'happy' 'sad' 'surprise' 'angry' (plus nod shake hop wave).
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { FUR, SPECIES, randomSpec, playerSpec, proportions, normSpec, DIGGERS } from './char/spec.js';
import { glowMaterial, lum } from './char/vox.js';
import { SkinAssembler, scaleVisible, charMaterial } from './char/skin.js';
import { buildHead, earGeo } from './char/head.js';
import { eyeSet, browGeo, browSize, mouthGeo, mouthSize, whiskerGeo } from './char/face.js';
import { buildBody, buildTail } from './char/body.js';
import { buildArm, buildLeg } from './char/limbs.js';
import { buildHat, buildGlasses, buildCane } from './char/hats.js';
import { CharacterRig } from './char/rig.js';
import { makeChicken, ChickenRig } from './char/chicken.js';
import { makePaw } from './char/paw.js';

export { FUR, SPECIES, randomSpec, playerSpec, CharacterRig, makeChicken, ChickenRig, makePaw };

const V16 = 1 / 16; // classic world units per voxel at scale 1

/** Build stats for profiling: the last makeCharacter call (ms, tris, meshes) and running totals. */
export const buildStats = { ms: 0, tris: 0, meshes: 0, count: 0, totalMs: 0 };

/**
 * Build a character. Returns a CharacterRig with .root (THREE.Group) you add to a scene.
 * opts.kind: material kind ('toon' | 'lambert' | 'basic'); opts.scale extra scale;
 * opts.lod: 'crowd' for background folk (one mesh: no whiskers, the lamp lens baked in).
 *
 * The whole character is one skinned mesh (+ whiskers, + the glowing lamp lens) riding on the
 * classic rig groups, which stay plain Object3Ds you can pose, scale and parent things to.
 */
export function makeCharacter(specIn, opts = {}) {
  const t0 = performance.now();
  const spec = normSpec(specIn || {});
  const p = proportions(spec);
  const u = V16 * p.scale * (opts.scale ?? 1); // classic unit (rig.s)
  const vs = u / 2; // hi-res voxel size
  const kind = opts.kind || 'toon';
  const bake = kind === 'basic';
  const crowd = opts.lod === 'crowd';
  const sp = spec.species;
  const A = new SkinAssembler();
  const R = [vs, vs, vs], L = [-vs, vs, vs]; // part scales: right side and mirrored left side
  const group = (parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();
  root.name = 'character';
  const hip = group(root); // body bob happens here

  // ------------------------------------------------------------------ legs
  const legL = group(root, -p.bw * 0.27 * u, p.lh * u + u, 0);
  const legR = group(root, p.bw * 0.27 * u, p.lh * u + u, 0);
  A.part(legR, buildLeg(spec, p, 1, bake).geo, { scale: R });
  A.part(legL, buildLeg(spec, p, -1, bake).geo, { scale: L });

  // ------------------------------------------------------------------ body & tail
  hip.position.y = p.lh * u + u * 0.5;
  const bodyMesh = A.part(hip, buildBody(spec, p, bake).geo, { scale: R }); // breathes (rig scales it)
  // tail root just inside the lower back (body half-depth is p.bd voxels); always present
  const tail = group(hip, 0, (sp === 'fox' ? 5 : 3) * vs, (-p.bd + 1.5) * vs);
  A.part(tail, buildTail(spec, bake), { scale: R });

  // ------------------------------------------------------------------ head & face
  const neck = group(hip, 0, (p.bh - 1) * u, u * 0.5);
  const head = buildHead(spec, p, bake);
  const info = head.info;
  const headMesh = A.part(neck, head.geo, { scale: R });

  // eyes: one group per side holding every lid/expression variant (shown by scale)
  const eyes = info.eyes.map((e) => {
    const set = eyeSet(e.type, e.side, info.lid, spec.eyeColor ?? 0x4a3a4a, bake);
    const g = group(neck, e.x * vs, e.y * vs, e.z * vs + vs * 0.02);
    const variants = {};
    const fpH = Math.max(3, set.h);
    for (const [name, geo] of Object.entries(set.variants)) {
      const bb = geo.boundingBox || (geo.computeBoundingBox(), geo.boundingBox);
      const h = Math.round(bb.max.y - bb.min.y);
      const b = scaleVisible(A.part(g, geo, { pos: [0, (fpH - h) % 2 ? -0.5 * vs : 0, 0], scale: R }));
      b.visible = name === 'open';
      variants[name] = b;
    }
    g.userData.variants = variants;
    g.userData.side = e.side;
    return g;
  });

  // brows
  let brows = null;
  if (spec.brows && spec.brows !== 'none') {
    const col = spec.age === 'elder' ? 0xf0ece4 : lum(spec.fur) < 0.25 ? 0x9a8a80 : (sp === 'badger' ? 0xf0f0ea : 0x2a1c1c);
    const bs = browSize(spec.brows);
    brows = info.eyes.map((e, i) => {
      const y = (info.browY + 0.5 + bs.h / 2) * vs;
      const g = group(neck, e.x * vs + (spec.brows === 'bushy' ? e.side * vs : 0), y, info.browZ[i] * vs);
      g.userData.side = e.side;
      g.userData.y = y;
      A.part(g, browGeo(spec.brows, e.side, col, bake), { scale: R });
      return g;
    });
  }

  // mouths: resting shapes on the face, open shapes in rig.mouth (compat: .visible shows it)
  const mi = info.mouth;
  const frog = mi.kind === 'frog';
  const restSet = frog ? { rest: 'frogRest', smile: 'frogSmile', frown: 'frogFrown', line: 'frogRest' }
    : { rest: mi.kind === 'bunny' ? 'bunny' : mi.teeth ? 'restT' : 'rest', smile: 'smile', frown: 'frown', line: 'line' };
  const openSet = frog ? { talk: 'frogTalk', laugh: 'frogTalk', oh: 'frogTalk', grimace: 'frogTalk' }
    : { talk: mi.teeth || mi.buck ? 'talkT' : 'talk', laugh: mi.teeth ? 'laughT' : 'laugh', oh: 'oh', grimace: 'grimace' };
  const mouthTop = (mi.y + 1.5) * vs;
  const mkMouthGroup = (set, dz) => {
    const g = group(neck, 0, mouthTop, (mi.z + dz) * vs);
    const variants = {};
    for (const [k, name] of Object.entries(set)) {
      const b = scaleVisible(A.part(g, mouthGeo(name, info.lip, bake), { pos: [0, -mouthSize(name).h / 2 * vs, 0], scale: R }));
      b.visible = false;
      variants[k] = b;
    }
    g.userData.variants = variants;
    return g;
  };
  const mouthRest = mkMouthGroup(restSet, 0.02);
  const mouth = scaleVisible(mkMouthGroup(openSet, 0.35), new THREE.Vector3(1, 1, 1));
  mouth.visible = false;

  // whiskers: hairline (half thickness), outside the outline pass so they stay delicate
  let whiskers = null;
  if (info.whisk && !crowd) {
    const w = info.whisk;
    whiskers = [-1, 1].map((side) => {
      const g = group(neck, side * w.x * vs, w.y * vs, w.z * vs);
      A.part(g, whiskerGeo(w.color, w.len, bake), { scale: [side * vs, vs * 0.5, vs * 0.5], layer: 'detail' });
      g.userData.side = side;
      return g;
    });
  }

  // ears
  let ears = null;
  if (info.ears.length) {
    const eg = earGeo(info.earKind, spec.fur, sp, spec.age === 'elder', bake);
    ears = info.ears.map((e) => {
      const g = group(neck, e.x * vs, e.y * vs, e.z * vs);
      g.rotation.set(e.rx, 0, e.rz);
      g.userData.base = [e.rx, 0, e.rz];
      g.userData.side = e.side;
      A.part(g, eg, { scale: e.side < 0 ? L : R });
      return g;
    });
  }

  // glasses
  const glassesGeo = buildGlasses(spec, info, bake);
  if (glassesGeo) A.part(neck, glassesGeo, { scale: R });

  // hat (built in the head frame so it hugs the skull)
  const hat = buildHat(spec, info, bake);
  let lampPos = null, lens = null, lensPart = null;
  if (hat) {
    const off = hat.offset || [0, 0, 0];
    const hatGroup = group(neck, off[0] * vs, off[1] * vs, off[2] * vs);
    const hatBone = A.part(hatGroup, hat.geo, { scale: R });
    if (hat.lens) {
      // the lamp lens glows (unlit), so it is its own little mesh; crowds bake it into the skin
      lensPart = { bone: hatBone, geo: hat.lens };
      if (crowd) A.attach(hatBone, hat.lens);
      else {
        lens = new THREE.Mesh(hat.lens, glowMaterial());
        lens.scale.setScalar(vs);
        hatGroup.add(lens);
      }
    }
    if (hat.lamp) {
      lampPos = new THREE.Object3D();
      lampPos.position.set(hat.lamp[0] * vs, hat.lamp[1] * vs, hat.lamp[2] * vs);
      hatGroup.add(lampPos);
    }
  }

  // ------------------------------------------------------------------ arms
  const shoulderY = (p.bh - 1.5) * u;
  const armL = group(hip, -(p.bw / 2 + 1.2) * u, shoulderY, u * 0.5);
  const armR = group(hip, (p.bw / 2 + 1.2) * u, shoulderY, u * 0.5);
  const arm = buildArm(spec, p, bake);
  A.part(armR, arm.geo, { scale: R });
  A.part(armL, arm.geo, { scale: L });
  // sockets at the paws for held items
  const handL = group(armL, 0, -(p.ah + 1) * u, u);
  const handR = group(armR, 0, -(p.ah + 1) * u, u);
  if (spec.cane) {
    // long enough to reach the floor from the resting paw
    const handH = (p.lh + 0.5 + p.bh - 1.5 - (p.ah + 1)) * 2;
    A.part(handR, buildCane(handH + 1, bake), { scale: R });
  }

  // ------------------------------------------------------------------ skin
  const height = (p.lh + p.bh + p.hh + 1) * u;
  const bounds = new THREE.Sphere(new THREE.Vector3(0, height * 0.55, 0), height * 0.95);
  const skin = A.build(charMaterial(kind), bounds);
  root.add(skin.main);
  if (skin.detail) root.add(skin.detail);
  const meshes = [skin.main, skin.detail, lens].filter(Boolean);

  const rig = new CharacterRig({
    root, hip, neck, headMesh, armL, armR, legL, legR, handL, handR, eyes, mouth, tail, lamp: lampPos, height, s: u, spec: specIn, p,
    vs, bodyMesh, brows, mouthRest, whiskers, ears, eyeType: spec.eyes, restMouth: 'rest',
    breath: spec.body === 'chubby' ? 0.022 : spec.age === 'baby' ? 0.02 : 0.013,
    digger: DIGGERS.has(sp), skeleton: skin.skeleton, meshes, lod: crowd ? 'crowd' : 'full',
    skin: { assembler: A, main: skin.main, detail: skin.detail, lens, lensPart },
  });
  // face anchors in neck-local space, for props that dress the face (sunglasses, masks, bubbles)
  const eyeZ = Math.max(...info.eyes.map((e) => e.z));
  rig.anchors = {
    eyes: new THREE.Vector3(0, info.eyes[0].y * vs, eyeZ * vs),
    mouth: new THREE.Vector3(0, mouthTop, (mi.z + 0.5) * vs),
    nose: new THREE.Vector3(0, info.noseY * vs, info.snoutFront * vs),
    headTop: new THREE.Vector3(0, (hat ? info.H + 6 : info.H) * vs, 0),
    headW: info.W * vs, headH: info.H * vs, headD: info.D * vs,
  };
  rig.eyeDrop = true; // eyes sit lower on the face than the classic rig's (bookends read this)
  root.userData.rig = rig;
  rig.update(0);
  buildStats.ms = performance.now() - t0;
  buildStats.count++;
  buildStats.totalMs += buildStats.ms;
  buildStats.meshes = meshes.length;
  buildStats.tris = meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0);
  return rig;
}

/** Give a character its own (non-shared) material so it can be tinted individually. */
export function uniqueMaterial(rig, kind = 'basic') {
  const m = charMaterial(kind, true);
  rig.root.traverse((o) => { if (o.isMesh) o.material = m; });
  rig.material = m;
  return m;
}

/** Quick portrait renderer: draws a character head-and-shoulders into a 2D canvas. */
export function renderPortrait(renderer, spec, size = 96) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x4a3050, 1.4));
  const dl = new THREE.DirectionalLight(0xffffff, 1.2);
  dl.position.set(1, 2, 3);
  scene.add(dl);
  const rig = makeCharacter({ ...spec }, { kind: 'toon' });
  rig.update(0.016);
  scene.add(rig.root);
  // head-and-shoulders: frame from the chest up (tall hats may crop, as in a real portrait)
  const h = rig.height;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 50);
  const dist = (h * 0.47) / Math.tan((15 * Math.PI) / 180);
  const dir = new THREE.Vector3(0.2, 0.14, 1).normalize();
  cam.position.set(dir.x * dist, h * 0.78 + dir.y * dist, dir.z * dist);
  cam.lookAt(0, h * 0.78, 0);
  const rim = new THREE.DirectionalLight(0xffd8a0, 0.8);
  rim.position.set(-2, 1.5, -2);
  scene.add(rim);
  const rt = new THREE.WebGLRenderTarget(size, size);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x221a2a, 1);
  renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
  renderer.setRenderTarget(prevRT);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const si = ((size - 1 - y) * size + x) * 4, di = (y * size + x) * 4;
    img.data[di] = px[si]; img.data[di + 1] = px[si + 1]; img.data[di + 2] = px[si + 2]; img.data[di + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  rt.dispose();
  rig.dispose();
  return c;
}

export { LAYER_OUTLINE, clamp };
