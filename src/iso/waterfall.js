// A thin waterfall pouring down Deep Town's north wall into a carved stone basin:
// a pixel-quantized flow shader (streaks sliding down, ragged edges, foam where it
// lands), the basin with rippling water, a drain grate for the overflow, wet moss and
// ferns. Mist and splashes are particles spawned by the scene.
import * as THREE from 'three';
import { WATER_TIME, waterMaterial } from './water.js';
import { VoxelGrid, C, stone, ring, line, M32, G32, group, mulc, h3, sp3 } from './kit.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */`
uniform float uTime;
uniform vec2 uRes;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uLight;
uniform vec3 uFoam;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 px = floor(vUv * uRes);
  vec2 p = (px + 0.5) / uRes;
  // ragged, wobbling edges (narrower at the top)
  float w = 0.5 * (0.55 + 0.45 * (1.0 - p.y)) + (noise(vec2(px.y * 0.15 - uTime * 3.0, 1.0)) - 0.5) * 0.18;
  float dx = abs(p.x - 0.5);
  if (dx > w) discard;
  // streaks sliding down
  float col = px.x;
  float speed = 9.0 + hash(vec2(col, 3.0)) * 5.0;
  float s = noise(vec2(col * 0.7, (px.y + uTime * speed) * 0.09));
  float s2 = noise(vec2(col * 1.3 + 7.0, (px.y + uTime * speed * 1.3) * 0.2));
  vec3 c = uMid;
  if (s > 0.62) c = uLight; else if (s < 0.3) c = uDeep;
  if (s2 > 0.8) c = uFoam;
  if (dx > w - 1.5 / uRes.x) c = mix(c, uFoam, 0.6);
  // foam where it lands
  float foam = smoothstep(0.08, 0.0, p.y) + step(0.88, noise(vec2(col * 0.9, px.y * 0.5 + uTime * 6.0))) * smoothstep(0.2, 0.0, p.y);
  if (foam > 0.5) c = uFoam;
  float a = 0.9 - 0.25 * smoothstep(0.5, 1.0, p.y);
  gl_FragColor = vec4(c, a);
  #include <colorspace_fragment>
}`;

export function fallsMaterial(resX = 18, resY = 200) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: WATER_TIME,
      uRes: { value: new THREE.Vector2(resX, resY) },
      uDeep: { value: new THREE.Color(0x2a6aa0) },
      uMid: { value: new THREE.Color(0x4a9ad0) },
      uLight: { value: new THREE.Color(0x9fdcf8) },
      uFoam: { value: new THREE.Color(0xe8fbff) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Build the waterfall at world (x, face z). top = height of the source crack.
 * Returns {obj (non-batched: shader parts), statics: [objects to batch], basin: {x,y,z,r}, lights}.
 */
export function waterfall(x, face, top, basin) {
  const width = 0.56;
  const fallH = top - 0.3;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, fallH), fallsMaterial(Math.round(width * 32), Math.round(fallH * 32)));
  plane.position.set(x, 0.3 + fallH / 2, face + 0.16);
  plane.renderOrder = 2;
  // a second, wider sheet of spray behind (lighter, more transparent)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.35, fallH * 0.96), fallsMaterial(Math.round(width * 1.35 * 32), Math.round(fallH * 32)));
  back.material.uniforms.uMid.value.setHex(0x3a7ab0);
  back.position.set(x, 0.3 + fallH * 0.48, face + 0.08);
  back.renderOrder = 1;
  // the basin: carved stone bowl in front of the wall
  const B = basin;
  const RX = Math.round(B.rx * 32) + 3, RZ = Math.round(B.rz * 32) + 3;
  const g = new VoxelGrid(RX * 2 + 2, 16, RZ * 2 + 2);
  const cx = RX + 1, cz = RZ + 1;
  const st = stone(C.stone, { seed: 61, block: 4, mortar: 0x4a4038 });
  for (let z = 0; z < g.d; z++) for (let xx = 0; xx < g.w; xx++) {
    const d = Math.hypot((xx + 0.5 - cx) / RX, (z + 0.5 - cz) / RZ);
    if (d > 1) continue;
    const rim = d > 0.82;
    for (let y = 0; y < (rim ? 12 : 3); y++) g.set(xx, y, z, rim ? (y === 11 ? mulc(C.stoneL, sp3(xx, y, z, 2)) : st(xx, y, z)) : 0x1a3040);
  }
  // moss on the rim and a drain lip at the front
  for (let k = 0; k < 40; k++) { const a = k * 0.61, r = 0.9; g.set(Math.round(cx + Math.cos(a) * RX * r), 12, Math.round(cz + Math.sin(a) * RZ * r), k % 3 ? C.moss : C.mossL); }
  g.box(cx - 2, 9, g.d - 3, 4, 3, 3, -1);
  g.box(cx - 2, 8, g.d - 3, 4, 1, 3, C.stoneD);
  const basinMesh = M32(g, [cx, 0, cz]);
  basinMesh.position.set(B.x, 0, B.z);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(B.rx * 2 * 0.86, B.rz * 2 * 0.86).rotateX(-Math.PI / 2), waterMaterial({ res: [Math.round(B.rx * 2 * 0.86 * 32), Math.round(B.rz * 2 * 0.86 * 32)], round: true, deep: 0x1e5a88, mid: 0x2e7ab0, light: 0x6ac0e8 }));
  water.position.set(B.x, 10.5 / 32, B.z);
  // overflow trickle down the lip to a floor grate
  const tr = new VoxelGrid(10, 12, 16);
  line(tr, [[5, 9, 1], [5, 6, 4], [5, 1, 7], [5, 0, 12]], 1.2, (xx, y, z) => (h3(xx, y, z, 5) < 0.3 ? 0xd8f6ff : 0x6ab8e8));
  const trickle = G32(tr, [5, 0, 0]);
  trickle.position.set(B.x, 0, B.z + B.rz + 0.02);
  const grate = new VoxelGrid(22, 2, 14);
  grate.box(0, 0, 0, 22, 1, 14, (xx, y, z) => (xx === 0 || z === 0 || xx === 21 || z === 13 ? C.ironL : (xx % 3 === 0 ? C.iron : 0x0a0a0c)));
  const grateM = M32(grate, [11, 0, 0]);
  grateM.position.set(B.x, 0.0, B.z + B.rz + 0.32);
  // the source: a dark gash with ferns and moss
  const src = new VoxelGrid(30, 30, 10);
  src.ellipsoid(15, 15, 2, 7, 12, 3, 0x14100f);
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2;
    line(src, [[15 + Math.cos(a) * 7, 15 + Math.sin(a) * 11, 5], [15 + Math.cos(a) * 13, 15 + Math.sin(a) * 15 - 3, 7]], 0.6, k % 2 ? 0x4a8a3a : 0x6ab84a);
  }
  const srcM = M32(src, [15, 15, 0]);
  srcM.position.set(x, top, face + 0.02);
  const statics = [basinMesh, grateM, srcM];
  return {
    obj: group(plane, back, water, trickle),
    statics,
    top: { x, y: top - 0.15, z: face + 0.2 },
    land: { x, y: 0.32, z: face + 0.2 },
    basin: { x: B.x, y: 10.5 / 32, z: B.z, rx: B.rx, rz: B.rz },
  };
}
