// A contact shadow in the voxel grid (wave 8): the soft blob under a character, but snapped to
// 1/16 m cells in its own plane and filled with an ordered dither, so its edge steps like the
// voxels round it instead of drawing a smooth round disc.
//   const s = makeVoxelShadow(rx, rz, strength);  scene.add(s);  s.position / s.scale as usual
import * as THREE from 'three';
import { GLSL_BAYER } from '../fx.js';

export function makeVoxelShadow(rx = 0.5, rz = 0.35, strength = 0.45, cell = 1 / 16) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uStrength: { value: strength }, uCells: { value: new THREE.Vector2((rx * 2) / cell, (rz * 2) / cell) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uStrength;
      uniform vec2 uCells;
      varying vec2 vUv;
      ${GLSL_BAYER}
      void main() {
        // the cell this pixel is in, and how dark that whole cell is (stepped rings, not a smooth fall-off)
        vec2 c = (floor(vUv * uCells) + 0.5) / uCells;
        float d = length(c - 0.5) * 2.0;
        float i = floor(clamp(1.0 - d, 0.0, 1.0) * 4.0 + 0.5) / 4.0;
        i = pow(i, 0.6) * uStrength;
        if (i <= 0.0 || bk_bayer4(gl_FragCoord.xy) > i * 1.6) discard;
        gl_FragColor = vec4(0.0, 0.0, 0.0, i);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-rx, 0, -rz, rx, 0, -rz, rx, 0, rz, -rx, 0, rz], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 3;
  m.name = 'hero-shadow';
  return m;
}
