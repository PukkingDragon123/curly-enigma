// Atmosphere for the first-person burrow: the golden shaft of daylight falling through the hole in
// the roof (a soft volumetric cone that reads from any angle, with slow drifting streaks), and the
// pixel stars that circle the edge of the view after the landing.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec3 vN;
varying vec3 vW;
varying float vH;
varying float vA;
uniform float uH;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vH = position.y / uH + 0.5;
  vA = atan(position.z, position.x);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vW;
varying float vH;
varying float vA;
void main() {
  vec3 v = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), v));
  float body = pow(facing, 1.6);
  // god-ray streaks drifting slowly round the shaft
  float st = 0.55 + 0.45 * sin(vA * 7.0 + uTime * 0.21) * sin(vA * 4.0 - uTime * 0.13 + vH * 1.5);
  st *= st;
  float fall = smoothstep(0.0, 0.3, vH) * (0.45 + 0.55 * vH);
  float near = smoothstep(0.35, 1.7, length(cameraPosition - vW));
  float a = body * st * fall * near * uOpacity;
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}`;

/** The shaft of light from the hole: an open cone from the ceiling to the floor (meters). */
export class LightShaft {
  constructor(scene, { x, z, top, bottom = 0, r0 = 0.42, r1 = 0.62, color = 0xffd98a, opacity = 0.2 }) {
    const h = top - bottom;
    const geo = new THREE.CylinderGeometry(r0, r1, h, 28, 1, true);
    this.uniforms = { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOpacity: { value: opacity }, uH: { value: h } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x, bottom + h / 2, z);
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
    // a second, thinner core
    const core = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.55, r1 * 0.6, h, 20, 1, true), mat.clone());
    core.material.uniforms = { uColor: { value: new THREE.Color(0xfff2c8) }, uTime: this.uniforms.uTime, uOpacity: { value: opacity * 0.55 }, uH: { value: h } };
    core.position.copy(this.mesh.position);
    core.renderOrder = 7;
    scene.add(core);
    this.core = core;
    this.x = x; this.z = z; this.top = top; this.bottom = bottom; this.r0 = r0; this.r1 = r1;
  }

  update(t) { this.uniforms.uTime.value = t; }

  /** A random point inside the shaft (for motes). */
  sample(out = new THREE.Vector3()) {
    const y = this.bottom + Math.random() * (this.top - this.bottom);
    const k = (y - this.bottom) / (this.top - this.bottom);
    const r = (this.r1 + (this.r0 - this.r1) * k) * Math.sqrt(Math.random()) * 0.9;
    const a = Math.random() * Math.PI * 2;
    return out.set(this.x + Math.cos(a) * r, y, this.z + Math.sin(a) * r);
  }
}

/** Little pixel stars circling round the top of the view after a knock on the head (DOM). */
export function dizzyStars(ui, secs = 3.2) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:2';
  const mk = (c1, c2) => {
    const cv = document.createElement('canvas');
    cv.width = 9; cv.height = 9;
    const g = cv.getContext('2d');
    const px = [[4, 0], [4, 1], [3, 2], [4, 2], [5, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [2, 6], [3, 6], [5, 6], [6, 6], [1, 7], [2, 7], [6, 7], [7, 7], [1, 8], [7, 8]];
    for (const [x, y] of px) { g.fillStyle = (x + y) % 3 ? c1 : c2; g.fillRect(x, y, 1, 1); }
    g.fillStyle = '#ffffff'; g.fillRect(4, 3, 1, 1);
    return cv.toDataURL();
  };
  const srcs = [mk('#ffe070', '#ffb030'), mk('#fff4b0', '#ffd060'), mk('#ffd0f0', '#ff90c0')];
  const stars = [];
  for (let i = 0; i < 7; i++) {
    const im = document.createElement('img');
    im.src = srcs[i % 3];
    im.className = 'pix';
    const s = 22 + (i % 3) * 6;
    im.style.cssText = `position:absolute;width:${s}px;height:${s}px;image-rendering:pixelated;filter:drop-shadow(0 2px 0 rgba(0,0,0,.4))`;
    wrap.append(im);
    stars.push({ im, ph: (i / 7) * Math.PI * 2, s });
  }
  ui.world.append(wrap);
  const h = { t: 0, done: false, el: wrap };
  h.update = (dt) => {
    h.t += dt;
    const W = wrap.clientWidth || window.innerWidth, H = wrap.clientHeight || window.innerHeight;
    const fade = Math.min(1, h.t / 0.3) * Math.min(1, Math.max(0, (secs - h.t) / 0.6));
    wrap.style.opacity = String(fade);
    for (const s of stars) {
      const a = s.ph + h.t * 2.6;
      const x = W / 2 + Math.cos(a) * W * 0.36 - s.s / 2;
      const y = H * 0.2 + Math.sin(a) * H * 0.09 + Math.sin(h.t * 7 + s.ph) * 6 - s.s / 2;
      s.im.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(${Math.round(Math.sin(h.t * 5 + s.ph) * 20)}deg) scale(${(0.8 + 0.3 * Math.sin(a)).toFixed(2)})`;
    }
    if (h.t > secs) { h.done = true; wrap.remove(); }
  };
  return h;
}
