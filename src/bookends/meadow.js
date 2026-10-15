// The opening's first beat: a sunny meadow above Deep Town with a sinkhole in it. The ground at
// its north lip (where the mole and Nugget stand) is a separate set of slabs that crack apart and
// drop into the hole. 1/16 relief for the turf (flowers, clover, a footpath, a raw soil lip), an
// undercut soil ceiling under the overhang, a big voxel tree, a warning sign nobody read, an old
// fence, pixel hills and clouds under a dithered daytime sky.
import * as THREE from 'three';
import { VoxelGrid, voxMesh, meshRelief, hash3, fshade, fmix } from './vox.js';
import { makeRock, makeMushrooms, makeFlower, makeRoot, S16 } from './props.js';
import { cloudCanvas, gullSheet, makeSheetSprite, makeBlobShadow, GLSL_BAYER } from './fx.js';
import { signTexture } from './pixfont.js';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { batchStatic } from './batch.js';
import { makeNoise2D, makeRng, clamp } from '../core/util.js';

const VS = 1 / 16;
const EXT = 9; // the relief covers x, z in [-EXT, EXT]
const BASE = 16; // turf top level (y = 0)
const SUN = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();

export const MEADOW = { holeR: 2.0, slab: { angle: -Math.PI / 2, r0: 1.95, r1: 3.45, span: 0.62 } };

const n1 = makeNoise2D(61), n2 = makeNoise2D(62), n3 = makeNoise2D(63);
function holeEdge(a) { return MEADOW.holeR * (1 + n1(Math.cos(a) * 2, Math.sin(a) * 2) * 0.09); }
function inSlab(x, z) {
  const S = MEADOW.slab;
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const da = Math.atan2(Math.sin(a - S.angle), Math.cos(a - S.angle));
  const r1 = S.r1 + n2(a * 6, 1) * 0.18;
  return r < r1 && r >= holeEdge(a) - 0.01 && Math.abs(da) < S.span + n2(r * 3, 2) * 0.06 ? da : null;
}
function turfLevel(x, z) {
  const r = Math.hypot(x, z);
  const hills = n1(x * 0.22, z * 0.22) * 2.4 + n2(x * 0.6, z * 0.6) * 0.6;
  return BASE + Math.round(hills * clamp((r - 3.2) / 4, 0, 1));
}
/** The path the pair walked in on, from the north edge to the lip. */
function onPath(x, z) {
  if (z > -2.6) return false;
  const cx = 0.35 + Math.sin(z * 0.55) * 0.5;
  return Math.abs(x - cx) < 0.32 + n3(x * 2, z * 2) * 0.08;
}
function grassColor(x, z, i, k) {
  const h = hash3(i, k, 0, 3);
  const p = hash3(i >> 1, k >> 1, 0, 4);
  let c = p < 0.33 ? 0x5aa83c : p < 0.66 ? 0x4e9a34 : 0x64b444;
  if (n2(x * 0.7, z * 0.7) > 0.25) c = fmix(c, 0x7ac04a, 0.4); // sunny clover patches
  if (n3(x * 0.45 + 5, z * 0.45) < -0.3) c = fshade(c, 0.88);
  if (h > 0.986) c = [0xfff6e8, 0xffe066, 0xff8ad0, 0x9ad0ff][(h * 7000) & 3]; // tiny flowers
  return c;
}

function buildTurf() {
  const W = Math.round((2 * EXT) / VS);
  const h = new Uint16Array(W * W), top = new Uint32Array(W * W);
  for (let k = 0; k < W; k++) for (let i = 0; i < W; i++) {
    const x = -EXT + (i + 0.5) * VS, z = -EXT + (k + 0.5) * VS;
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    const q = i + W * k;
    if (r < holeEdge(a) || inSlab(x, z) !== null) continue;
    let lv = turfLevel(x, z);
    let c = grassColor(x, z, i, k);
    const lip = r - holeEdge(a);
    if (lip < 0.22 + n3(a * 5, 3) * 0.12) { c = hash3(i, k, 1, 5) < 0.5 ? 0x6a4a30 : 0x5a3e28; lv -= 1; } // raw soil lip
    else if (lip < 0.45 && hash3(i, k, 2, 6) < 0.4) c = 0x7a8a3a; // trampled, yellowing grass
    if (onPath(x, z)) { c = hash3(i, k, 3, 7) < 0.1 ? 0x8a8278 : hash3(i >> 1, k >> 1, 3, 8) < 0.5 ? 0x9a7a52 : 0x8a6a46; lv -= 1; }
    h[q] = lv;
    top[q] = c;
  }
  const side = (q, y) => (y >= h[q] - 2 ? 0x3e5a2a : y > h[q] - 5 ? 0x4a3424 : hash3(q, y, 5, 1) < 0.08 ? 0x8a8278 : (y & 4 ? 0x5a3e2a : 0x553a26));
  const geo = meshRelief({ W, D: W, h, top, side, U: [VS, 0, 0], V: [0, 0, VS], N: [0, VS, 0], origin: [-EXT, -BASE * VS, -EXT] });
  return new THREE.Mesh(geo, voxelMaterial('toon'));
}

/** Soil ceiling under the undercut lip (seen from inside the hole looking up), roots hanging. */
function buildOverhang() {
  const R = 4.5;
  const W = Math.round((2 * R) / VS);
  const h = new Uint16Array(W * W), top = new Uint32Array(W * W);
  for (let k = 0; k < W; k++) for (let i = 0; i < W; i++) {
    const x = -R + (i + 0.5) * VS, z = -R + (k + 0.5) * VS;
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    if (r > R || r < holeEdge(a) || inSlab(x, z) !== null) continue;
    const q = i + W * k;
    h[q] = 2 + Math.max(0, Math.round(n2(x * 1.6, z * 1.6) * 4));
    top[q] = Math.abs(n3(x * 0.8, z * 0.8)) < 0.03 ? 0x9a7650 : hash3(i, k, 4, 1) < 0.5 ? 0x4a3424 : 0x3e2a1c;
  }
  const geo = meshRelief({ W, D: W, h, top, U: [VS, 0, 0], V: [0, 0, VS], N: [0, -VS, 0], origin: [-R, -BASE * VS, -R] });
  return new THREE.Mesh(geo, voxelMaterial('toon'));
}

/** The lip the pair stands on, in three slabs that break apart. Each piece: {mesh, center}. */
function buildSlabs() {
  const S = MEADOW.slab;
  const pieces = [];
  for (let p = 0; p < 3; p++) {
    const a0 = S.angle - S.span + (p * 2 * S.span) / 3, a1 = a0 + (2 * S.span) / 3;
    // bounding box of the piece
    let xmin = 1e9, xmax = -1e9, zmin = 1e9, zmax = -1e9;
    for (let t = 0; t <= 8; t++) for (const r of [S.r0 - 0.1, S.r1 + 0.25]) {
      const a = a0 - 0.08 + ((a1 - a0 + 0.16) * t) / 8;
      xmin = Math.min(xmin, Math.cos(a) * r); xmax = Math.max(xmax, Math.cos(a) * r);
      zmin = Math.min(zmin, Math.sin(a) * r); zmax = Math.max(zmax, Math.sin(a) * r);
    }
    const i0 = Math.floor((xmin + EXT) / VS), i1 = Math.ceil((xmax + EXT) / VS);
    const k0 = Math.floor((zmin + EXT) / VS), k1 = Math.ceil((zmax + EXT) / VS);
    const GW = i1 - i0, GD = k1 - k0, GH = BASE + 14;
    const g = new VoxelGrid(GW, GH + 2, GD);
    let sx = 0, sz = 0, n = 0;
    for (let k = 0; k < GD; k++) for (let i = 0; i < GW; i++) {
      const x = -EXT + (i0 + i + 0.5) * VS, z = -EXT + (k0 + k + 0.5) * VS;
      const da = inSlab(x, z);
      if (da === null) continue;
      const a = Math.atan2(z, x);
      const da0 = Math.atan2(Math.sin(a - a0), Math.cos(a - a0)), da1 = Math.atan2(Math.sin(a - a1), Math.cos(a - a1));
      // jagged break lines between pieces
      const jag = n3(Math.hypot(x, z) * 4, p) * 0.05;
      if (p > 0 && da0 < jag) continue;
      if (p < 2 && da1 >= jag) continue;
      const lv = turfLevel(x, z);
      const under = 2 + Math.round(Math.max(0, n2(x * 2.4, z * 2.4)) * 6); // a ragged underside
      const lip = Math.hypot(x, z) - holeEdge(a);
      for (let y = under; y < lv; y++) {
        let c;
        if (y === lv - 1) c = lip < 0.2 ? (hash3(i, k, 1, 5) < 0.5 ? 0x6a4a30 : 0x5a3e28) : grassColor(x, z, i0 + i, k0 + k);
        else if (y >= lv - 3) c = 0x3e5a2a;
        else c = hash3(i, y, k, 6) < 0.07 ? 0x8a8278 : (y & 4 ? 0x5a3e2a : 0x553a26);
        g.set(i, y + 2, k, c);
      }
      sx += x; sz += z; n++;
    }
    const cx = sx / Math.max(1, n), cz = sz / Math.max(1, n);
    const mesh = voxMesh(g, { scale: VS, pivot: [(cx + EXT) / VS - i0, 2 + BASE, (cz + EXT) / VS - k0] });
    const grp = new THREE.Group();
    grp.add(mesh);
    // roots dangling from the underside
    for (let r = 0; r < 2; r++) {
      const root = makeRoot(70 + p * 3 + r, 14 + r * 6);
      root.position.set((r - 0.5) * 0.3, -BASE * VS + 0.1, (r ? 0.15 : -0.1));
      root.scale.setScalar(0.8);
      grp.add(root);
    }
    grp.position.set(cx, 0, cz);
    grp.userData.dynamic = true;
    pieces.push({ mesh: grp, center: new THREE.Vector3(cx, 0, cz), home: new THREE.Vector3(cx, 0, cz) });
  }
  return pieces;
}

/** A broad-leaved tree (1/12): flared roots, a split trunk, clumped canopy with light and shade. */
function makeTree(seed = 5) {
  const rng = makeRng(seed);
  const S = 1 / 12;
  const g = new VoxelGrid(60, 76, 60);
  const cx = 30, cz = 30;
  for (let y = 0; y < 34; y++) {
    const r = y < 4 ? 4.6 - y * 0.5 : 3.0 - y * 0.02;
    const ox = Math.sin(y * 0.09) * 1.2;
    g.cylinderY(cx + ox, cz, r, y, y + 1, (x, yy, z) => ((x + z + (yy >> 2)) % 5 === 0 ? 0x4a3020 : (x < cx ? 0x6a4a30 : 0x5a3e28)));
  }
  for (let i = 0; i < 6; i++) { // roots
    const a = (i / 6) * Math.PI * 2 + rng.range(-0.3, 0.3);
    for (let r = 3; r < 8; r++) g.set(cx + Math.cos(a) * r, r > 6 ? 0 : 1, cz + Math.sin(a) * r, 0x5a3e28);
  }
  for (const [bx, bz, by] of [[-8, -2, 30], [7, 3, 32], [1, -7, 34]]) { // boughs
    for (let t = 0; t <= 10; t++) g.ellipsoid(cx + (bx * t) / 10, 26 + ((by - 26) * t) / 10, cz + (bz * t) / 10, 1.6, 1.6, 1.6, 0x5a3e28);
  }
  const clumps = [[0, 46, 0, 15, 11, 15], [-11, 40, -3, 10, 8, 10], [11, 42, 4, 11, 8, 10], [2, 41, -11, 10, 8, 9], [-3, 40, 11, 10, 7, 9], [3, 56, 2, 10, 7, 10]];
  for (const [ox, oy, oz, rx, ry, rz] of clumps) {
    g.ellipsoid(cx + ox, oy, cz + oz, rx, ry, rz, (x, y, z, dx, dy, dz) => {
      const nz = hash3(x >> 1, y >> 1, z >> 1, 3);
      if (nz < 0.12 && dx * dx + dy * dy + dz * dz > 0.6) return -1; // ragged edges
      const lit = -dx * 0.5 + dy * 0.8 + dz * 0.3;
      if (hash3(x, y, z, 4) > 0.985) return 0xd04a3a; // a few apples
      return lit > 0.55 ? 0x8ad060 : lit > 0.1 ? 0x6ab448 : lit > -0.4 ? 0x4e9a34 : 0x3a7a2a;
    });
  }
  return voxMesh(g, { scale: S, pivot: [cx, 0, cz] });
}

/** Little upright grass blades, a few seed heads. */
function makeTuft(seed) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(9, 12, 9);
  for (let i = 0; i < 10; i++) {
    const x = rng.int(1, 7), z = rng.int(1, 7), hgt = rng.int(4, 11);
    const lx = rng.range(-0.3, 0.3), lz = rng.range(-0.3, 0.3);
    for (let y = 0; y < hgt; y++) g.set(x + lx * y, y, z + lz * y, y > hgt - 2 ? (rng.chance(0.2) ? 0xd8d080 : 0x8ad060) : y % 3 ? 0x5aa83c : 0x4e9a34);
  }
  return voxMesh(g, { scale: S16, pivot: [4.5, 0, 4.5] });
}

function makeFencePost(seed) {
  const g = new VoxelGrid(4, 18, 4);
  g.box(0, 0, 0, 4, 16, 4, (x, y, z) => ((y + x * 3 + seed) % 7 === 0 ? 0x5a4630 : x === 0 ? 0x8a7050 : 0x7a6044));
  g.box(1, 16, 1, 2, 1, 2, 0x5a4630);
  return voxMesh(g, { scale: S16, pivot: [2, 0, 2] });
}

// ------------------------------------------------------------------ sky & horizon
const SKY_VERT = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }';
const SKY_FRAG = /* glsl */`
uniform vec3 uSun; uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGlow;
varying vec3 vDir;
${GLSL_BAYER}
void main() {
  vec3 d = normalize(vDir);
  float e = max(d.y, 0.0);
  float t = floor(pow(e, 0.6) * 14.0 + bk_bayer4(gl_FragCoord.xy)) / 14.0;
  vec3 col = t < 0.4 ? mix(uHorizon, uMid, t / 0.4) : mix(uMid, uZenith, (t - 0.4) / 0.6);
  float s = max(dot(d, uSun), 0.0);
  float glow = floor((pow(s, 8.0) * 0.5 + pow(s, 60.0) * 0.5) * 6.0 + bk_bayer4(gl_FragCoord.xy)) / 6.0;
  col = mix(col, uGlow, glow * 0.6);
  if (s > 0.9985) col = vec3(1.0, 0.98, 0.9);
  if (d.y < 0.0) col = uHorizon * 0.92;
  gl_FragColor = vec4(col, 1.0);
}`;
function makeSky() {
  const C = (h) => new THREE.Color(h);
  const m = new THREE.Mesh(new THREE.SphereGeometry(150, 32, 16), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN.clone() }, uZenith: { value: C(0x3a7ad8) }, uMid: { value: C(0x6aaaf0) }, uHorizon: { value: C(0xcfeaf8) }, uGlow: { value: C(0xfff6d8) } },
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
  }));
  m.renderOrder = -100;
  m.frustumCulled = false;
  return m;
}

/** Rolling hills and tree lines on a band around the horizon (two layers, pixel art). */
function hillsTexture(seed, far) {
  const W = 512, H = 40;
  const pc = new PixelCanvas(W, H);
  const n = makeNoise2D(seed);
  const top = far ? [0x9ac8a0, 0x8abc94] : [0x6aa858, 0x5a9a4a];
  for (let x = 0; x < W; x++) {
    const u = (x / W) * Math.PI * 2;
    const hgt = Math.round(H * (far ? 0.45 : 0.3) + (n(Math.cos(u) * 2, Math.sin(u) * 2) * 0.5 + 0.5) * H * (far ? 0.4 : 0.35));
    const tree = !far && n(x * 0.15, 3) > 0.2 ? Math.round((n(x * 0.15, 3) - 0.2) * 22) : 0;
    for (let y = 0; y < hgt + tree; y++) {
      const yy = H - 1 - y;
      const c = y >= hgt ? (y > hgt + tree - 2 ? 0x4a8a3a : 0x3a7a2e) : y > hgt - 2 ? top[0] : (x + y) % 7 === 0 ? top[1] : top[0];
      pc.set(x, yy, c);
    }
  }
  const t = pixelTexture(pc.commit());
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function grassTexture() {
  const pc = new PixelCanvas(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const h = hash3(x, y, 0, 9);
    pc.set(x, y, h < 0.3 ? 0x5aa83c : h < 0.6 ? 0x4e9a34 : h < 0.97 ? 0x56a238 : 0x7ac04a);
  }
  const t = pixelTexture(pc.commit());
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(220, 220);
  return t;
}

/**
 * Build the meadow. Returns { group, pieces, sky, textures, birds, update(dt, camera) }.
 */
export function buildMeadow() {
  const group = new THREE.Group();
  group.name = 'meadow';
  const textures = [];
  const turf = buildTurf();
  group.add(turf, buildOverhang());

  // the wide world beyond the relief
  const gtex = grassTexture();
  textures.push(gtex);
  const ground = new THREE.Mesh(new THREE.RingGeometry(EXT - 0.1, 140, 48, 2), new THREE.MeshLambertMaterial({ map: gtex })); // never over the hole
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.userData.noBatch = true;
  group.add(ground);
  for (const [r, far, y, hgt] of [[118, true, -1, 15], [96, false, -1.5, 12]]) {
    const t = hillsTexture(far ? 7 : 8, far);
    textures.push(t);
    t.repeat.set(far ? 2 : 3, 1);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, 64, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, transparent: true, alphaTest: 0.5, fog: true }));
    band.position.y = y + hgt / 2;
    band.userData.noBatch = true;
    group.add(band);
  }

  // props
  const rng = makeRng(23);
  const place = (o, x, z, ry = 0, s = 1) => { o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s); group.add(o); return o; };
  place(makeTree(5), -4.2, -5.6, 0.3, 1);
  place(makeTree(9), 6.8, -7.4, 1.2, 0.8);
  place(makeBlobShadow(2.6, 2.2, 0.35), -4.0, -5.4).rotation.x = -Math.PI / 2;
  for (const [x, z, s, sc] of [[-2.6, -1.4, 3, 0.9], [2.9, 1.2, 7, 0.7], [-3.4, 2.4, 11, 0.6], [4.8, -3.2, 13, 1.1]]) {
    const rk = makeRock(s, { w: 16, h: 9, d: 13, color: 0x8a8478, moss: 0.4 });
    place(rk, x, z, rng.range(0, 6), sc);
  }
  for (let i = 0; i < 34; i++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(2.6, 8.5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inSlab(x, z) !== null || onPath(x, z)) continue;
    const t = i % 5 === 0 ? makeFlower() : makeTuft(i);
    place(t, x, z, rng.range(0, 6), rng.range(0.8, 1.2));
  }
  const shrooms = makeMushrooms(31, { n: 4, cap: [0xd83a2a, 0xf05a4a, 0xa82a1a], stem: 0xf6f0e6, glow: false, scale: 0.9 });
  place(shrooms.group, 3.2, -2.1, 0.4);
  // the warning sign nobody read, and an old fence that has seen better days
  const sign = signTexture(['DANGER!', 'SINKHOLE'], { bg: 0xe8d8b0, border: 0x5a3a22, border2: 0x8a6a48, text: 0xc03a2a, shadow: 0xd8c8a0, grain: 0xd8c8a0, rivet: 0x5a3a22 });
  textures.push(sign.texture);
  const signGrp = new THREE.Group();
  const post = makeFencePost(1);
  post.scale.set(1, 1.5, 1);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9 * (sign.h / sign.w)), new THREE.MeshLambertMaterial({ map: sign.texture }));
  board.position.set(0, 1.4, 0.15);
  board.userData.noBatch = true;
  signGrp.add(post, board);
  signGrp.rotation.set(0, 0.5, -0.12);
  place(signGrp, 2.35, -3.05, 0.5);
  const fence = [];
  for (const [a, lean] of [[0.35, 0.1], [0.95, -0.25], [1.6, 0.05], [2.3, 0.4]]) {
    const p = makeFencePost(Math.round(a * 10));
    p.position.set(Math.cos(a) * 3.7, 0, Math.sin(a) * 3.7);
    p.rotation.set(lean, a, lean * 0.5);
    group.add(p);
    fence.push(p.position.clone().add(new THREE.Vector3(0, 0.9 - Math.abs(lean) * 0.3, 0)));
  }
  const rope = [];
  for (let i = 0; i < fence.length - 1; i++) for (let t = 0; t <= 8; t++) {
    const p = fence[i].clone().lerp(fence[i + 1], t / 8);
    p.y -= Math.sin((t / 8) * Math.PI) * (i === 1 ? 0.55 : 0.25);
    rope.push(p);
    if (t > 0 && t < 8) rope.push(p.clone());
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rope), new THREE.LineBasicMaterial({ color: 0xc8b088 })));

  const batches = batchStatic(group);

  // the lip that gives way (kept out of the batch)
  const pieces = buildSlabs();
  for (const p of pieces) group.add(p.mesh);

  // sky, clouds, birds
  const sky = makeSky();
  const clouds = [];
  [[0.2, 9, 40], [-0.8, 13, 30], [1.1, 6, 46], [2.4, 11, 34], [-1.9, 7, 42], [3.3, 15, 28], [-2.8, 10, 36]].forEach(([az, el, w], i) => {
    const tex = pixelTexture(cloudCanvas(300 + i, 128, 40, { hi: 0xffffff, mid: 0xeef4fa, lo: 0xc0d0e4, rim: 0xffffff }));
    textures.push(tex);
    const s = makeSheetSprite(tex, { cols: 1, size: [w, w * (40 / 128)], anchor: [0.5, 0.5], renderOrder: -50 });
    const d = 125, e = THREE.MathUtils.degToRad(el);
    s.position.set(Math.sin(az) * d, Math.tan(e) * d, -Math.cos(az) * d);
    clouds.push({ s, az, e, d });
  });
  const gulls = gullSheet();
  textures.push(gulls.texture);
  const birds = [0, 1, 2].map((i) => {
    const s = makeSheetSprite(gulls.texture, { cols: gulls.cols, size: [0.9, 0.9 / gulls.aspect], anchor: [0.5, 0.5] });
    return { s, r: 14 + i * 5, h: 9 + i * 2.5, w: (i % 2 ? -1 : 1) * (0.16 - i * 0.03), a: i * 2.3 };
  });
  for (const c of clouds) group.add(c.s);
  for (const b of birds) group.add(b.s);

  let t = 0;
  const camRight = new THREE.Vector3();
  const update = (dt, camera) => {
    t += dt;
    sky.position.copy(camera.position);
    for (const c of clouds) {
      c.az += dt * 0.004;
      c.s.position.set(Math.sin(c.az) * c.d + camera.position.x, Math.tan(c.e) * c.d, -Math.cos(c.az) * c.d + camera.position.z);
    }
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    for (const b of birds) {
      b.a += b.w * dt;
      b.s.position.set(Math.cos(b.a) * b.r, b.h + Math.sin(t * 0.5 + b.r) * 0.8, Math.sin(b.a) * b.r * 0.7 - 6);
      b.s.userData.sheet.uFlipX.value = (-Math.sin(b.a) * b.w * camRight.x + Math.cos(b.a) * b.w * 0.7 * camRight.z) < 0 ? 1 : 0;
      b.s.userData.sheet.uFrame.value = [0, 1, 2, 1][Math.floor(t * 7 + b.r) % 4];
    }
  };
  return { group, pieces, sky, textures, update, sun: SUN, stats: { batched: batches.length } };
}
