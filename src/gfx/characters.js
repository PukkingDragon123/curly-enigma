// Chibi voxel characters: procedural moles (and friends) with ages, body types, faces,
// fur, dirty outfits, hats and a procedural animation rig.
//
// Models are built at 1/32-unit voxels (twice the classic 1/16 detail) by the part builders
// in ./char/ (head, face, body, limbs, hats, chicken, paw), greedy-meshed by ./char/mesher.js
// and cached by their inputs (LRU), so identical parts and rebuilt townsfolk share geometry
// while every character keeps its own meshes (setTint / uniqueMaterial still work).
// World-space sizes, heights, hand sockets, the lamp anchor and the rig API match the classic
// rig. rig.s is still the classic 1/16 unit (× scale) used for animation offsets; rig.vs is the
// hi-res voxel size. Extra rig fields: rig.anchors {eyes, mouth, nose, headTop (neck-local
// Vector3s), headW, headH, headD}, rig.eyeDrop (true: eyes sit lower than the classic rig's),
// rig.brows / rig.ears / rig.whiskers (groups or null), rig.mouthRest (closed-mouth shapes).
// Face-only emotes for doEmote: 'happy' 'sad' 'surprise' 'angry' (plus nod shake hop wave).
import * as THREE from 'three';
import { voxelMaterial } from './Voxel.js';
import { clamp } from '../core/util.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { FUR, SPECIES, randomSpec, playerSpec, proportions, normSpec, DIGGERS } from './char/spec.js';
import { partMesh, glowMaterial, lum } from './char/vox.js';
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

/** Build stats for profiling: the last makeCharacter call (ms, tris) and running totals. */
export const buildStats = { ms: 0, tris: 0, count: 0, totalMs: 0 };

/**
 * Build a character. Returns a CharacterRig with .root (THREE.Group) you add to a scene.
 * opts.kind: material kind ('toon' | 'lambert' | 'basic'); opts.scale extra scale.
 */
export function makeCharacter(specIn, opts = {}) {
  const t0 = performance.now();
  const spec = normSpec(specIn || {});
  const p = proportions(spec);
  const u = V16 * p.scale * (opts.scale ?? 1); // classic unit (rig.s)
  const vs = u / 2; // hi-res voxel size
  const kind = opts.kind || 'toon';
  const bake = kind === 'basic';
  const mesh = (geo, outline = true) => partMesh(geo, kind, vs, outline);
  const sp = spec.species;

  const root = new THREE.Group();
  root.name = 'character';
  const hip = new THREE.Group(); // body bob happens here
  root.add(hip);

  // ------------------------------------------------------------------ legs
  const legR = new THREE.Group(), legL = new THREE.Group();
  legL.position.set(-p.bw * 0.27 * u, p.lh * u + u, 0);
  legR.position.set(p.bw * 0.27 * u, p.lh * u + u, 0);
  const lgR = buildLeg(spec, p, 1, bake), lgL = buildLeg(spec, p, -1, bake);
  legR.add(mesh(lgR.geo));
  const mL = mesh(lgL.geo);
  mL.scale.x = -vs;
  legL.add(mL);
  root.add(legL, legR);

  // ------------------------------------------------------------------ body & tail
  hip.position.y = p.lh * u + u * 0.5;
  const body = buildBody(spec, p, bake);
  const bodyMesh = mesh(body.geo);
  hip.add(bodyMesh);
  // tail (an empty group for tailless folk, so rig.tail is always there to animate)
  const tailGeo = buildTail(spec, bake);
  const tail = new THREE.Group();
  // root of the tail just inside the lower back (body half-depth is p.bd voxels)
  tail.position.set(0, (sp === 'fox' ? 5 : 3) * vs, (-p.bd + 1.5) * vs);
  if (tailGeo.attributes.position.count > 0) tail.add(mesh(tailGeo));
  hip.add(tail);

  // ------------------------------------------------------------------ head & face
  const neck = new THREE.Group();
  neck.position.set(0, (p.bh - 1) * u, u * 0.5);
  hip.add(neck);
  const head = buildHead(spec, p, bake);
  const info = head.info;
  const headMesh = mesh(head.geo);
  neck.add(headMesh);

  // eyes: one group per side holding every lid/expression variant
  const eyes = info.eyes.map((e) => {
    const set = eyeSet(e.type, e.side, info.lid, spec.eyeColor ?? 0x4a3a4a, bake);
    const g = new THREE.Group();
    g.position.set(e.x * vs, e.y * vs, e.z * vs + vs * 0.02);
    const variants = {};
    const fpH = Math.max(3, set.h);
    for (const [name, geo] of Object.entries(set.variants)) {
      const m = mesh(geo);
      const bb = geo.boundingBox || (geo.computeBoundingBox(), geo.boundingBox);
      const h = Math.round(bb.max.y - bb.min.y);
      if ((fpH - h) % 2) m.position.y = -0.5 * vs;
      m.visible = name === 'open';
      g.add(m);
      variants[name] = m;
    }
    g.userData.variants = variants;
    g.userData.side = e.side;
    neck.add(g);
    return g;
  });

  // brows
  let brows = null;
  if (spec.brows && spec.brows !== 'none') {
    const col = spec.age === 'elder' ? 0xf0ece4 : lum(spec.fur) < 0.25 ? 0x9a8a80 : (sp === 'badger' ? 0xf0f0ea : 0x2a1c1c);
    const bs = browSize(spec.brows);
    brows = info.eyes.map((e, i) => {
      const g = new THREE.Group();
      const y = (info.browY + 0.5 + bs.h / 2) * vs;
      g.position.set(e.x * vs + (spec.brows === 'bushy' ? e.side * vs : 0), y, info.browZ[i] * vs);
      g.userData.side = e.side;
      g.userData.y = y;
      g.add(mesh(browGeo(spec.brows, e.side, col, bake)));
      neck.add(g);
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
    const g = new THREE.Group();
    g.position.set(0, mouthTop, (mi.z + dz) * vs);
    const variants = {};
    for (const [k, name] of Object.entries(set)) {
      const ms = mouthSize(name);
      const m = mesh(mouthGeo(name, info.lip, bake));
      m.position.y = -ms.h / 2 * vs;
      m.visible = false;
      g.add(m);
      variants[k] = m;
    }
    g.userData.variants = variants;
    neck.add(g);
    return g;
  };
  const mouthRest = mkMouthGroup(restSet, 0.02);
  const mouth = mkMouthGroup(openSet, 0.35);
  mouth.visible = false;

  // whiskers (thin, no outline so they stay delicate)
  let whiskers = null;
  if (info.whisk) {
    const w = info.whisk;
    whiskers = [-1, 1].map((side) => {
      const g = new THREE.Group();
      g.position.set(side * w.x * vs, w.y * vs, w.z * vs);
      const m = mesh(whiskerGeo(w.color, w.len, bake), false);
      // hairline whiskers: full length, half thickness
      m.scale.set(side * vs, vs * 0.5, vs * 0.5);
      g.add(m);
      g.userData.side = side;
      neck.add(g);
      return g;
    });
  }

  // ears
  let ears = null;
  if (info.ears.length) {
    const eg = earGeo(info.earKind, spec.fur, sp, spec.age === 'elder', bake);
    ears = info.ears.map((e) => {
      const g = new THREE.Group();
      g.position.set(e.x * vs, e.y * vs, e.z * vs);
      g.rotation.set(e.rx, 0, e.rz);
      g.userData.base = [e.rx, 0, e.rz];
      g.userData.side = e.side;
      const m = mesh(eg);
      if (e.side < 0) m.scale.x = -vs;
      g.add(m);
      neck.add(g);
      return g;
    });
  }

  // glasses
  const glassesGeo = buildGlasses(spec, info, bake);
  if (glassesGeo) neck.add(mesh(glassesGeo));

  // hat (built in the head frame so it hugs the skull)
  const hat = buildHat(spec, info, bake);
  let lampPos = null;
  if (hat) {
    const hatGroup = new THREE.Group();
    if (hat.offset) hatGroup.position.set(hat.offset[0] * vs, hat.offset[1] * vs, hat.offset[2] * vs);
    neck.add(hatGroup);
    hatGroup.add(mesh(hat.geo));
    if (hat.lens) {
      const lm = new THREE.Mesh(hat.lens, glowMaterial());
      lm.scale.setScalar(vs);
      lm.layers.enable(LAYER_OUTLINE);
      hatGroup.add(lm);
    }
    if (hat.lamp) {
      lampPos = new THREE.Object3D();
      lampPos.position.set(hat.lamp[0] * vs, hat.lamp[1] * vs, hat.lamp[2] * vs);
      hatGroup.add(lampPos);
    }
  }

  // ------------------------------------------------------------------ arms
  const armL = new THREE.Group(), armR = new THREE.Group();
  const shoulderY = (p.bh - 1.5) * u;
  armL.position.set(-(p.bw / 2 + 1.2) * u, shoulderY, u * 0.5);
  armR.position.set((p.bw / 2 + 1.2) * u, shoulderY, u * 0.5);
  const arm = buildArm(spec, p, bake);
  armR.add(mesh(arm.geo));
  const aL = mesh(arm.geo);
  aL.scale.x = -vs;
  armL.add(aL);
  hip.add(armL, armR);
  // sockets at the paws for held items
  const handL = new THREE.Group(), handR = new THREE.Group();
  handL.position.set(0, -(p.ah + 1) * u, u);
  handR.position.set(0, -(p.ah + 1) * u, u);
  armL.add(handL);
  armR.add(handR);

  if (spec.cane) {
    // long enough to reach the floor from the resting paw
    const handH = (p.lh + 0.5 + p.bh - 1.5 - (p.ah + 1)) * 2;
    const cane = mesh(buildCane(handH + 1, bake));
    handR.add(cane);
  }

  const height = (p.lh + p.bh + p.hh + 1) * u;
  const rig = new CharacterRig({
    root, hip, neck, headMesh, armL, armR, legL, legR, handL, handR, eyes, mouth, tail, lamp: lampPos, height, s: u, spec: specIn, p,
    vs, bodyMesh, brows, mouthRest, whiskers, ears, eyeType: spec.eyes, restMouth: 'rest',
    breath: spec.body === 'chubby' ? 0.022 : spec.age === 'baby' ? 0.02 : 0.013,
    digger: DIGGERS.has(sp),
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
  let tris = 0;
  root.traverse((o) => { if (o.isMesh && o.visible !== false && o.geometry.index) tris += o.geometry.index.count / 3; });
  buildStats.tris = tris;
  return rig;
}

/** Give a character its own (non-shared) material so it can be tinted individually. */
export function uniqueMaterial(rig, kind = 'basic') {
  const m = voxelMaterial(kind, { unique: true });
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
  // geometries are cached and shared; only GPU buffers are released (re-uploaded on reuse)
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  return c;
}

export { LAYER_OUTLINE, clamp };
