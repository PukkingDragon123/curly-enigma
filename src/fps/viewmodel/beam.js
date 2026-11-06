// The x-ray lamp's beam: a stream of tiny additive light voxels pouring out of the lens and
// spreading into a cone (no cone mesh, no edges), drawn in the WORLD scene (the overlay pass
// cannot blend translucency), lined up with the lamp lens in the view model. The motes move on
// the GPU (one instanced draw, nothing per frame on the CPU). The game adds vm.world to its scene
// once and passes its camera to vm.update(dt, { camera }).
import * as THREE from 'three';

const N = 240;

const VERT = /* glsl */`
attribute vec4 aSeed;   // phase, angle, radial fraction, speed
attribute float aSize;
uniform float uTime;
uniform float uLen;
uniform float uRad;
varying float vK;
varying float vShade;
void main() {
  float along = fract(uTime * aSeed.w + aSeed.x);
  float a = aSeed.y + uTime * 0.6 * (aSeed.z - 0.5);
  float rr = aSeed.z * (0.04 + along) * uRad;
  vec3 c = vec3(cos(a) * rr, sin(a) * rr, -along * uLen);
  // brightest a little way out of the lens, gone by the far end, pulsing down the beam
  float pulse = 0.82 + 0.18 * sin(uTime * 9.0 - along * 14.0);
  vK = smoothstep(0.0, 0.12, along) * pow(1.0 - along, 1.7) * pulse * (1.15 - aSeed.z * 0.55);
  vShade = normal.y > 0.5 ? 1.2 : normal.x > 0.5 ? 0.75 : normal.y < -0.5 ? 0.6 : 0.95;
  vec4 mv = modelViewMatrix * vec4(c + position * aSize, 1.0);
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOn;
varying float vK;
varying float vShade;
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float v = q.x < 0.5 ? (q.y < 0.5 ? 0.0 : q.y < 1.5 ? 12.0 : q.y < 2.5 ? 3.0 : 15.0)
    : q.x < 1.5 ? (q.y < 0.5 ? 8.0 : q.y < 1.5 ? 4.0 : q.y < 2.5 ? 11.0 : 7.0)
    : q.x < 2.5 ? (q.y < 0.5 ? 2.0 : q.y < 1.5 ? 14.0 : q.y < 2.5 ? 1.0 : 13.0)
    : (q.y < 0.5 ? 10.0 : q.y < 1.5 ? 6.0 : q.y < 2.5 ? 9.0 : 5.0);
  return v / 16.0;
}
void main() {
  float k = vK * uOn;
  // pixel-art banding: quantise the falloff with an ordered dither
  float q = floor(k * 5.0 + bayer(gl_FragCoord.xy)) / 5.0;
  if (q <= 0.0) discard;
  gl_FragColor = vec4(uColor * q * vShade * 0.9, 1.0);
}
`;

export class XrayBeam {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'vm-world';
    const box = new THREE.BoxGeometry(1, 1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = box.index;
    geo.setAttribute('position', box.attributes.position);
    geo.setAttribute('normal', box.attributes.normal);
    const seed = new Float32Array(N * 4), size = new Float32Array(N);
    let s = 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    for (let i = 0; i < N; i++) {
      const big = i % 4 === 0; // a quarter are fat, dim light voxels that fill the cone; the rest are fine sparks
      seed[i * 4] = rnd();
      seed[i * 4 + 1] = rnd() * Math.PI * 2;
      seed[i * 4 + 2] = Math.sqrt(rnd());
      seed[i * 4 + 3] = (big ? 0.35 : 0.5) + rnd() * 0.45;
      size[i] = big ? 0.03 + rnd() * 0.015 : 0.009 + rnd() * 0.008;
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(size, 1));
    geo.instanceCount = N;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x7fe7ff) }, uOn: { value: 0 }, uTime: { value: 0 }, uLen: { value: 1 }, uRad: { value: 0.3 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.cone = new THREE.Mesh(geo, this.mat);
    this.cone.name = 'xray-motes';
    this.cone.frustumCulled = false;
    this.cone.renderOrder = 10;
    this.cone.visible = false;
    this.group.add(this.cone);
    this._p = new THREE.Vector3();
    this._t = new THREE.Vector3();
  }

  /**
   * lensView: the lens in view-model camera space; vmCam / worldCam: the two cameras;
   * range: beam length (m); on: 0..1.
   */
  update(dt, lensView, vmCam, worldCam, color, range, on, t) {
    const u = this.mat.uniforms;
    u.uOn.value = on;
    u.uTime.value = t;
    u.uColor.value.set(color);
    this.cone.visible = on > 0.02 && !!worldCam;
    if (!this.cone.visible) return;
    // the lens's screen position, re-projected into the world camera at a short depth
    const ndc = this._p.copy(lensView).project(vmCam);
    const d = 0.3;
    const th = Math.tan((worldCam.fov * Math.PI) / 360);
    const local = this._p.set(ndc.x * d * th * worldCam.aspect, ndc.y * d * th, -d);
    worldCam.updateMatrixWorld();
    const start = local.applyMatrix4(worldCam.matrixWorld);
    // the visible haze is short; the lamp's reach (range) is shown by the game's x-ray reveal
    const target = this._t.set(0, 0, -Math.min(2.4, range * 0.45)).applyMatrix4(worldCam.matrixWorld);
    const g = this.cone;
    g.position.copy(start);
    g.lookAt(target);
    g.rotateY(Math.PI); // lookAt points +Z at the target; the beam runs along -Z
    u.uLen.value = start.distanceTo(target);
    u.uRad.value = 0.2 + range * 0.025;
  }

  dispose() { this.cone.geometry.dispose(); this.mat.dispose(); }
}
