// Creature material: the mine's object shading (terrain lights, helmet lamp, fog, optional rock
// texel dither) plus what fights need to read well:
//   flash / flashCol  a full-body flash (hit = white, a parried creature flashes gold)
//   rim / rimCol      a pulsing rim glow while an attack winds up (yellow: block or parry it,
//                     red: too heavy to block, get out of the way)
//   alpha             screen-door (ordered dither) translucency for ghosts: no sorting, stays
//                     pixel-crisp and keeps writing depth for the outline pass
import * as THREE from 'three';
import { LIGHT } from '../TerrainMaterial.js';

export function creatureMaterial(U, opts = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      emissive: { value: opts.emissive || 0 },
      fade: { value: 1 },
      texel: { value: opts.texel || 0 },
      flash: { value: 0 },
      flashCol: { value: new THREE.Color(1, 0.95, 0.9) },
      rim: { value: 0 },
      rimCol: { value: new THREE.Color(1, 0.85, 0.3) },
      alpha: { value: opts.alpha ?? 1 },
      wobble: { value: opts.wobble || 0 },
    },
    vertexShader: /* glsl */`
      attribute vec3 color;
      uniform float time;
      uniform float wobble;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec3 vLocal;
      varying vec3 vNo;
      void main() {
        vColor = color;
        vLocal = position;
        vNo = normal;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        if (wobble > 0.0) wp.xyz += vec3(sin(time * 3.1 + wp.y * 9.0), sin(time * 2.3 + wp.x * 7.0) * 0.5, cos(time * 2.7 + wp.y * 8.0)) * wobble;
        vWorld = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float emissive;
      uniform float time;
      uniform float texel;
      uniform float flash;
      uniform vec3 flashCol;
      uniform float rim;
      uniform vec3 rimCol;
      uniform float alpha;
      varying vec3 vColor;
      varying vec3 vWorld;
      varying vec3 vN;
      varying vec3 vLocal;
      varying vec3 vNo;
      float h3o(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
      float bayer4(vec2 p) {
        vec2 q = mod(floor(p), 4.0);
        float i = q.x + q.y * 4.0;
        // 4x4 Bayer matrix, row-major
        if (i < 0.5) return 0.0; if (i < 1.5) return 8.0; if (i < 2.5) return 2.0; if (i < 3.5) return 10.0;
        if (i < 4.5) return 12.0; if (i < 5.5) return 4.0; if (i < 6.5) return 14.0; if (i < 7.5) return 6.0;
        if (i < 8.5) return 3.0; if (i < 9.5) return 11.0; if (i < 10.5) return 1.0; if (i < 11.5) return 9.0;
        if (i < 12.5) return 15.0; if (i < 13.5) return 7.0; if (i < 14.5) return 13.0; return 5.0;
      }
      ${LIGHT}
      void main() {
        if (alpha < 0.999 && alpha * 16.0 <= bayer4(gl_FragCoord.xy) + 0.5) discard;
        vec3 n = normalize(vN);
        vec3 L = lightAt(vWorld, n);
        vec3 c = vColor;
        if (texel > 0.0) {
          vec3 q = floor(vLocal * texel - vNo * 0.5);
          float k1 = h3o(q + 3.1), k2 = h3o(floor(q * 0.25) + 5.3);
          c *= 0.8 + 0.3 * k1 + 0.14 * k2;
        }
        vec3 col = c * L + c * emissive * (0.8 + 0.2 * sin(time * 3.0));
        if (rim > 0.0) {
          float f = 1.0 - max(0.0, dot(normalize(cameraPosition - vWorld), n));
          col += rimCol * rim * (0.25 + 1.6 * f * f);
        }
        col = mix(col, flashCol, flash);
        float dist = length(vWorld - lampPos);
        col = mix(col, fogCol, 1.0 - exp(-pow(dist / fogDist, 2.0) * 2.2));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return m;
}
