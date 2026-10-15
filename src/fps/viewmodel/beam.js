// The x-ray lamp's beam: a soft additive cone of light drawn in the WORLD scene (the overlay
// pass cannot blend translucency), lined up with the lamp lens in the view model. The game
// adds vm.world to its scene once and passes its camera to vm.update(dt, { camera }).
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
varying float vEdge;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  // surfaces seen edge-on read as the beam's bright sides (a cheap volume look)
  vec3 n = normalize(normalMatrix * normal);
  vEdge = 1.0 - abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOn;
uniform float uTime;
varying vec2 vUv;
varying float vEdge;
float bayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float v = q.x < 0.5 ? (q.y < 0.5 ? 0.0 : q.y < 1.5 ? 12.0 : q.y < 2.5 ? 3.0 : 15.0)
    : q.x < 1.5 ? (q.y < 0.5 ? 8.0 : q.y < 1.5 ? 4.0 : q.y < 2.5 ? 11.0 : 7.0)
    : q.x < 2.5 ? (q.y < 0.5 ? 2.0 : q.y < 1.5 ? 14.0 : q.y < 2.5 ? 1.0 : 13.0)
    : (q.y < 0.5 ? 10.0 : q.y < 1.5 ? 6.0 : q.y < 2.5 ? 9.0 : 5.0);
  return v / 16.0;
}
void main() {
  // vUv.y: 1 at the lens → 0 at the far end; vUv.x around the cone
  float along = 1.0 - vUv.y;
  float pulse = 0.85 + 0.15 * sin(uTime * 9.0 - along * 14.0);
  // soft start at the lens, brightest a little way out, gone by the far end
  float k = smoothstep(0.0, 0.18, along) * pow(1.0 - along, 2.2) * (0.3 + 0.7 * vEdge * vEdge) * pulse * uOn;
  // pixel-art banding: quantise the falloff with an ordered dither
  float q = floor(k * 5.0 + bayer(gl_FragCoord.xy)) / 5.0;
  gl_FragColor = vec4(uColor * q * 0.85, 1.0);
}
`;

export class XrayBeam {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'vm-world';
    const geo = new THREE.CylinderGeometry(0.06, 1, 1, 20, 1, true);
    geo.translate(0, -0.5, 0); // tip (lens) at y = 0, mouth at y = -1
    geo.rotateX(Math.PI / 2); // now along -Z
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x7fe7ff) }, uOn: { value: 0 }, uTime: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.cone = new THREE.Mesh(geo, this.mat);
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
    this.mat.uniforms.uOn.value = on;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uColor.value.set(color);
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
    g.rotateY(Math.PI); // lookAt points +Z at the target; the cone runs along -Z
    const len = start.distanceTo(target);
    const r = 0.2 + range * 0.025;
    g.scale.set(r, r, len);
  }

  dispose() { this.cone.geometry.dispose(); this.mat.dispose(); }
}
