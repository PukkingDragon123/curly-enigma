import * as THREE from 'three';

// Objects on this camera layer get a crisp 1px pixel-art outline.
export const LAYER_OUTLINE = 1;

const POST_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const POST_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tMask;
uniform sampler2D tMaskDepth;
uniform vec2 uRes;
uniform float uOutline;
uniform vec3 uOutlineColor;
uniform float uOutlineAlpha;
uniform float uNear;
uniform float uFar;
uniform float uPersp;
uniform float uInnerThresh;
uniform float uVignette;
uniform float uSat;
uniform float uContrast;
uniform float uBright;
uniform vec3 uTint;
uniform float uLevels;
uniform float uDither;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform vec2 uIrisCenter;
uniform float uIris;
uniform float uTime;
uniform float uGrain;
varying vec2 vUv;

float linDepth(float d) {
  if (uPersp < 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float x = q.x, y = q.y;
  float v = 0.0;
  // 4x4 Bayer matrix, explicit to stay GLSL ES 1.0 friendly
  if (y < 0.5) { v = x < 0.5 ? 0.0 : x < 1.5 ? 8.0 : x < 2.5 ? 2.0 : 10.0; }
  else if (y < 1.5) { v = x < 0.5 ? 12.0 : x < 1.5 ? 4.0 : x < 2.5 ? 14.0 : 6.0; }
  else if (y < 2.5) { v = x < 0.5 ? 3.0 : x < 1.5 ? 11.0 : x < 2.5 ? 1.0 : 9.0; }
  else { v = x < 0.5 ? 15.0 : x < 1.5 ? 7.0 : x < 2.5 ? 13.0 : 5.0; }
  return v / 16.0;
}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 px = 1.0 / uRes;
  vec3 col = texture2D(tColor, vUv).rgb;

  if (uOutline > 0.5) {
    float m = texture2D(tMask, vUv).a;
    float md = texture2D(tMaskDepth, vUv).r;
    float sd = texture2D(tDepth, vUv).r;
    bool selfVis = m > 0.5 && md <= sd + 0.00002;
    float myDepth = selfVis ? linDepth(md) : linDepth(sd);
    float edge = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
      vec2 uv2 = vUv + o * px;
      float m2 = texture2D(tMask, uv2).a;
      float md2 = texture2D(tMaskDepth, uv2).r;
      float sd2 = texture2D(tDepth, uv2).r;
      bool vis2 = m2 > 0.5 && md2 <= sd2 + 0.00002;
      if (vis2) {
        float d2 = linDepth(md2);
        if (!selfVis) { if (d2 < myDepth - 0.001) edge = 1.0; }
        else if (d2 < myDepth - uInnerThresh) edge = 1.0;
      }
    }
    col = mix(col, uOutlineColor, edge * uOutlineAlpha);
  }

  col *= uBright * uTint;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, uSat);
  vec3 s = toSRGB(col);
  s = (s - 0.5) * uContrast + 0.5;

  vec2 d = vUv - 0.5;
  d.x *= uRes.x / uRes.y;
  s *= clamp(1.0 - uVignette * dot(d, d) * 1.5, 0.0, 1.0);

  if (uGrain > 0.0) s += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * uGrain;

  if (uLevels > 0.0) {
    float b = bayer4(gl_FragCoord.xy) - 0.5;
    s = floor(clamp(s, 0.0, 1.0) * uLevels + 0.5 + b * uDither) / uLevels;
  }

  s = mix(s, uFadeColor, uFade);
  s = mix(s, uFlashColor, uFlash);

  if (uIris >= 0.0) {
    vec2 p = vUv * uRes;
    vec2 c = uIrisCenter * uRes;
    float dist = length(p - c);
    if (dist > uIris) s = uFadeColor;
  }
  gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
}
`;

function makeRT(w, h, srgb) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
  });
  if (srgb) rt.texture.colorSpace = THREE.SRGBColorSpace;
  rt.depthTexture = new THREE.DepthTexture(w, h);
  rt.depthTexture.type = THREE.UnsignedIntType;
  rt.depthTexture.minFilter = THREE.NearestFilter;
  rt.depthTexture.magFilter = THREE.NearestFilter;
  return rt;
}

/** Default post settings; scenes pass overrides to Engine.render(). */
export const DEFAULT_POST = {
  outline: true,
  outlineColor: 0x1a0f0b,
  outlineAlpha: 1,
  innerThresh: 0.35,
  vignette: 0.35,
  saturation: 1.08,
  contrast: 1.04,
  brightness: 1,
  tint: 0xffffff,
  levels: 40,
  dither: 1,
  grain: 0,
  fade: 0,
  fadeColor: 0x000000,
  flash: 0,
  flashColor: 0xffffff,
  iris: -1,
  irisCenter: [0.5, 0.5],
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    this.pixelOffset = 0;
    this.width = 640;
    this.height = 360;
    this.scale = 3;
    this.resizeListeners = new Set();

    this.rtScene = makeRT(this.width, this.height, true);
    this.rtMask = makeRT(this.width, this.height, false);

    this.postUniforms = {
      tColor: { value: this.rtScene.texture },
      tDepth: { value: this.rtScene.depthTexture },
      tMask: { value: this.rtMask.texture },
      tMaskDepth: { value: this.rtMask.depthTexture },
      uRes: { value: new THREE.Vector2(this.width, this.height) },
      uOutline: { value: 1 },
      uOutlineColor: { value: new THREE.Color() },
      uOutlineAlpha: { value: 1 },
      uNear: { value: 0.1 },
      uFar: { value: 100 },
      uPersp: { value: 1 },
      uInnerThresh: { value: 0.35 },
      uVignette: { value: 0.3 },
      uSat: { value: 1 },
      uContrast: { value: 1 },
      uBright: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uLevels: { value: 40 },
      uDither: { value: 1 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(0, 0, 0) },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uIrisCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uIris: { value: -1 },
      uTime: { value: 0 },
      uGrain: { value: 0 },
    };
    this.postMaterial = new THREE.ShaderMaterial({
      uniforms: this.postUniforms,
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    quad.frustumCulled = false;
    this.postScene.add(quad);

    // transition overlay (global, applied on top of scene post)
    this.transition = { fade: 0, iris: -1, irisCenter: [0.5, 0.5], color: 0x000000 };
    this.time = 0;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  setPixelOffset(o) {
    this.pixelOffset = o;
    this.resize();
  }

  resize() {
    const ww = Math.max(1, window.innerWidth);
    const wh = Math.max(1, window.innerHeight);
    const base = Math.max(1, Math.round(Math.min(wh / 330, ww / 420)));
    const s = Math.max(1, base + this.pixelOffset);
    this.scale = s;
    this.width = Math.ceil(ww / s);
    this.height = Math.ceil(wh / s);
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = this.width * s + 'px';
    this.canvas.style.height = this.height * s + 'px';
    this.rtScene.setSize(this.width, this.height);
    this.rtMask.setSize(this.width, this.height);
    this.postUniforms.uRes.value.set(this.width, this.height);
    for (const cb of this.resizeListeners) cb(this.width, this.height);
  }

  onResize(cb) {
    this.resizeListeners.add(cb);
    return () => this.resizeListeners.delete(cb);
  }

  get aspect() { return this.width / this.height; }

  /**
   * Render a scene through the pixel-art post pipeline.
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {object} post overrides for DEFAULT_POST
   */
  render(scene, camera, post = {}) {
    const p = { ...DEFAULT_POST, ...post };
    const r = this.renderer;
    const u = this.postUniforms;

    r.setRenderTarget(this.rtScene);
    r.setClearColor(scene.background && scene.background.isColor ? scene.background : 0x000000, 1);
    r.render(scene, camera);

    if (p.outline) {
      const bg = scene.background;
      const fog = scene.fog;
      const mask = camera.layers.mask;
      scene.background = null;
      scene.fog = null;
      camera.layers.set(LAYER_OUTLINE);
      r.setRenderTarget(this.rtMask);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      r.render(scene, camera);
      camera.layers.mask = mask;
      scene.background = bg;
      scene.fog = fog;
    }

    u.uOutline.value = p.outline ? 1 : 0;
    u.uOutlineColor.value.set(p.outlineColor);
    u.uOutlineAlpha.value = p.outlineAlpha;
    u.uInnerThresh.value = p.innerThresh;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uPersp.value = camera.isPerspectiveCamera ? 1 : 0;
    u.uVignette.value = p.vignette;
    u.uSat.value = p.saturation;
    u.uContrast.value = p.contrast;
    u.uBright.value = p.brightness;
    u.uTint.value.set(p.tint);
    u.uLevels.value = p.levels;
    u.uDither.value = p.dither;
    u.uGrain.value = p.grain;
    u.uTime.value = this.time;

    // combine scene fade with global transition
    const t = this.transition;
    u.uFade.value = Math.min(1, Math.max(p.fade, t.fade));
    u.uFadeColor.value.set(t.fade > p.fade ? t.color : p.fadeColor);
    u.uFlash.value = p.flash;
    u.uFlashColor.value.set(p.flashColor);
    const iris = t.iris >= 0 ? t.iris : p.iris;
    const ic = t.iris >= 0 ? t.irisCenter : p.irisCenter;
    u.uIris.value = iris;
    u.uIrisCenter.value.set(ic[0], ic[1]);
    if (t.iris >= 0) u.uFadeColor.value.set(t.color);

    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }

  /** Project a world position to CSS pixel coords on the page. */
  toScreen(vec3, camera, out = { x: 0, y: 0, visible: true }) {
    const v = vec3.clone().project(camera);
    out.visible = v.z > -1 && v.z < 1;
    out.x = (v.x * 0.5 + 0.5) * this.width * this.scale;
    out.y = (-v.y * 0.5 + 0.5) * this.height * this.scale;
    return out;
  }
}
