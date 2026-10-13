// Pixel-art water: posterized ripples and twinkles in a tiny shader. All water
// materials share one time uniform that the active iso scene advances.
import * as THREE from 'three';

export const WATER_TIME = { value: 0 };

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FRAG = /* glsl */`
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uLight;
uniform vec3 uFoam;
uniform vec2 uRes;
uniform float uRound;
uniform float uAlpha;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 p = (floor(vUv * uRes) + 0.5) / uRes;
  if (uRound > 0.5 && length(p - 0.5) > 0.5) discard;
  vec2 q = p * uRes / 8.0;
  float w = sin(q.x * 2.1 + uTime * 1.3 + sin(q.y * 1.7 + uTime * 0.7) * 1.6) * 0.5
          + sin(q.y * 2.6 - uTime * 1.1 + q.x * 0.9) * 0.5;
  float r = length(p - 0.5);
  w += sin(r * 38.0 - uTime * 3.2) * 0.35 * smoothstep(0.5, 0.1, r) * uRound;
  vec3 c = uMid;
  if (w > 0.55) c = uLight; else if (w < -0.45) c = uDeep;
  float tw = hash(floor(p * uRes) + floor(uTime * 3.0));
  if (tw > 0.985) c = uFoam;
  gl_FragColor = vec4(c, uAlpha);
  #include <colorspace_fragment>
}`;

/** opts: {deep, mid, light, foam, res:[w,h] texels, round, alpha} */
export function waterMaterial(o = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: WATER_TIME,
      uDeep: { value: new THREE.Color(o.deep ?? 0x1a5a8a) },
      uMid: { value: new THREE.Color(o.mid ?? 0x2a7ab0) },
      uLight: { value: new THREE.Color(o.light ?? 0x5ab8e0) },
      uFoam: { value: new THREE.Color(o.foam ?? 0xd8f6ff) },
      uRes: { value: new THREE.Vector2(...(o.res || [32, 32])) },
      uRound: { value: o.round ? 1 : 0 },
      uAlpha: { value: o.alpha ?? 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: (o.alpha ?? 1) < 1,
    depthWrite: (o.alpha ?? 1) >= 1,
  });
  return m;
}
