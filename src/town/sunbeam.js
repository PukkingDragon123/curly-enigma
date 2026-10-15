// The sunbeam: a shaft of daylight pouring through a crack far up in the cavern roof onto the
// patch of grass by the Surface Express booth. One additive cone with a soft view-dependent edge,
// slow drifting streaks and stepped (dithered) brightness, so it reads as a volume from any side.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vN = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  return (q.y < 0.5 ? (q.x < 0.5 ? 0.0 : q.x < 1.5 ? 8.0 : q.x < 2.5 ? 2.0 : 10.0) : q.y < 1.5 ? (q.x < 0.5 ? 12.0 : q.x < 1.5 ? 4.0 : q.x < 2.5 ? 14.0 : 6.0) : q.y < 2.5 ? (q.x < 0.5 ? 3.0 : q.x < 1.5 ? 11.0 : q.x < 2.5 ? 1.0 : 9.0) : (q.x < 0.5 ? 15.0 : q.x < 1.5 ? 7.0 : q.x < 2.5 ? 13.0 : 5.0)) / 16.0;
}
void main() {
  float f = abs(dot(normalize(vN), normalize(vV)));
  float edge = pow(f, 2.6);
  // fade out when the eye is inside the shaft (no wall of light in the face)
  edge *= smoothstep(0.6, 2.2, length(vV));
  float streak = 0.62 + 0.55 * noise(vec2(vUv.x * 22.0, vUv.y * 2.0 - uTime * 0.05)) - 0.25 * noise(vec2(vUv.x * 61.0 + 3.0, vUv.y * 5.0 + uTime * 0.03));
  float fall = smoothstep(0.0, 0.12, vUv.y) * (0.35 + 0.65 * vUv.y) * smoothstep(1.0, 0.9, vUv.y);
  float v = clamp(edge * streak * fall, 0.0, 1.0);
  v = floor(v * 6.0 + bayer(gl_FragCoord.xy)) / 6.0;
  if (v <= 0.0) discard;
  gl_FragColor = vec4(uColor * v * uOpacity, 1.0);
  #include <colorspace_fragment>
}`;

/** A beam from top (crack) to bottom (floor), radii in TU: two nested soft cones. Returns { mesh, time }. */
export function sunbeam(top, bottom, rTop = 0.7, rBot = 1.35) {
  const len = top.distanceTo(bottom);
  const time = { value: 0 };
  const grp = new THREE.Group();
  for (const [k, op] of [[1, 0.075], [0.5, 0.1]]) {
    const geo = new THREE.CylinderGeometry(rTop * k, rBot * k, len, 32, 1, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: time, uColor: { value: new THREE.Color(0xffeec0) }, uOpacity: { value: op } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 8;
    mesh.frustumCulled = false;
    grp.add(mesh);
  }
  grp.position.copy(top).add(bottom).multiplyScalar(0.5);
  grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bottom).normalize());
  return { mesh: grp, time };
}
