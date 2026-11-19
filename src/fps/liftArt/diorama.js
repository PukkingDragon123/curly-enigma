// The lift panel's diorama renderer: the 3D cutaway (build3d.js) drawn by the game's shared renderer,
// off screen and small (about 480 px across), through an orthographic camera that looks a little down
// and leans with the mouse, then a pixel-art pass: colour stepped into a ramp that leans plum in the
// shadows and cream in the lights, 1 px plum outlines where depth jumps, a darker line where surfaces
// turn, and the layers you haven't reached drawn as a sepia pencil sketch with hatching (inking in
// with a sweep when you first see them reached). The result is read back into the panel's 2D canvas,
// which the page scales up with nearest-neighbour pixels. Real lights: a warm key from the top left
// with soft shadows, a dim cave fill, and a pool of point lights handed to the nearest lamps, lava,
// crystals, the hearth and the forge each frame, flickering. Drawn only while the panel is open.
import * as THREE from 'three';
import { DEPTH, SHAFT_X3, extrude, mats, KEEP } from './build3d.js';
import { SPR } from './tiles.js';
import { PAL } from './kit.js';

const POOL = 8;
const BG = new THREE.Color(0x1c1020);

const POST_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const POST_FS = `
precision highp float;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tNormal;
uniform vec2 res; uniform float scrollY; uniform float time; uniform int nBands;
uniform float frontD; uniform float frontS; uniform float pxD;
uniform vec4 bandA[10]; uniform vec4 bandB[10];
varying vec2 vUv;
const vec3 PLUM = vec3(0.165, 0.086, 0.149);
const vec3 CREAM = vec3(0.965, 0.902, 0.761);
const vec3 PAPER = vec3(0.910, 0.839, 0.682);
const vec3 PAPER2 = vec3(0.863, 0.776, 0.612);
const vec3 PENCIL = vec3(0.612, 0.541, 0.455);
const vec3 SEPIA = vec3(0.353, 0.227, 0.180);
vec3 toSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
float dAt(vec2 uv) { return texture2D(tDepth, uv).x; }
vec3 nAt(vec2 uv) { return texture2D(tNormal, uv).rgb * 2.0 - 1.0; }
// the sketch: the cut face is the bare sheet, what lies behind it hatched (deeper: crossed), things in
// shade get a light hatch; outlines in sepia where it's inked, pencil where it isn't
vec3 sketch(vec3 s, float edge, float crease, vec2 p, float faint, bool inked, float back, float bg) {
  float L = dot(s, vec3(0.3, 0.59, 0.11));
  vec3 o = PAPER;
  vec3 lead = faint > 0.5 ? mix(PENCIL, PAPER, 0.45) : PENCIL;
  float h1 = mod(p.x + p.y, 4.0), h2 = mod(p.x - p.y, 4.0);
  if (bg < 0.5) {
    if (back > 9.0 && h1 < 1.0) o = lead;
    if (back > 9.0 && L < 0.12 && mod(p.x - p.y, 6.0) < 1.0) o = lead;
    if (back > 2.0 && back <= 9.0 && L < 0.22 && h1 < 1.0) o = lead;
    if (back <= 2.0 && L < 0.11) o = lead;
  }
  if (crease > 0.5 && back < 9.0) o = mix(o, lead, 0.6);
  if (edge > 0.5) o = inked && faint < 0.5 ? SEPIA : lead;
  return o;
}
void main() {
  vec2 suv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 px = 1.0 / res;
  vec3 c = texture2D(tColor, suv).rgb;
  float d = dAt(suv);
  vec3 n = nAt(suv);
  float bg = d >= 0.99999 ? 1.0 : 0.0;
  // outlines: ink where this is in front of a neighbour by a step; a darker line where the surface turns
  float ink = 0.0, crease = 0.0;
  vec2 offs[4]; offs[0] = vec2(px.x, 0.0); offs[1] = vec2(-px.x, 0.0); offs[2] = vec2(0.0, px.y); offs[3] = vec2(0.0, -px.y);
  for (int i = 0; i < 4; i++) {
    float dn = dAt(suv + offs[i]);
    if (dn - d > pxD * 7.0) ink = 1.0;
    vec3 nn = nAt(suv + offs[i]);
    if (dot(n, nn) < 0.5 && dn > d - pxD) crease = 1.0;
  }
  vec3 s = toSrgb(c);
  // the ramp: luminance in nine steps, hue kept; shadows lean plum, lights lean cream
  float L = dot(s, vec3(0.3, 0.59, 0.11));
  float Lq = floor(L * 10.0 + 0.5) / 10.0;
  vec3 q = clamp(s / max(L, 0.03) * Lq, 0.0, 1.0);
  q = mix(q, PLUM * (0.7 + Lq), pow(1.0 - Lq, 2.6) * 0.32);
  q = mix(q, CREAM, smoothstep(0.78, 1.0, Lq) * 0.25);
  float back = (d - (frontD + frontS * (vUv.y * res.y - res.y * 0.5))) / pxD;
  if (bg > 0.5) q = vec3(0.110, 0.063, 0.125);
  else if (ink > 0.5) q = PLUM;
  else if (crease > 0.5) q *= 0.82;
  // the layers not reached yet: a sepia sketch; one being reached inks in behind a sweeping front
  float yTop = vUv.y * res.y, xs = vUv.x * res.x;
  vec2 wp = vec2(xs, yTop + scrollY);
  for (int i = 0; i < 10; i++) {
    if (i >= nBands) break;
    vec4 A = bandA[i]; vec4 B = bandB[i];
    if (yTop >= A.x && yTop < A.y && xs >= A.z) {
      bool inked = xs < B.z + sin(yTop * 0.21 + B.w) * 3.0;
      vec3 sk = sketch(s, ink, crease, wp, B.y, inked, back, bg);
      if (A.w < 1.5) q = sk;
      else {
        float f = -30.0 + B.x * (res.x + 60.0) + sin(wp.y * 0.09 + B.w) * 7.0 + sin(wp.y * 0.31) * 2.5;
        if (xs > f + 1.0) q = sk;
        else if (xs > f - 2.0) q = PLUM;
        else if (xs > f - 5.0 && mod(wp.y, 3.0) < 1.0) q = mix(q, PLUM, 0.5);
      }
    }
  }
  gl_FragColor = vec4(q, 1.0);
}`;

export class Diorama {
  constructor(renderer) {
    this.r = renderer;
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(0x1c1020, 395, 470);
    this.root = new THREE.Group();
    scene.add(this.root);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 900);
    // light: a dim cave fill, a warm key from the top left with soft shadows, and the pool
    scene.add(new THREE.HemisphereLight(0xfff0d8, 0x7a5a64, 3.1));
    const key = (this.key = new THREE.DirectionalLight(0xffe2b8, 2.4));
    key.castShadow = !/[?&]llshadow=0/.test(location.search);
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0025;
    key.shadow.normalBias = 1.6;
    key.shadow.radius = 2.5;
    scene.add(key, key.target);
    this.pool = [];
    for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffffff, 0, 60, 1); scene.add(l); this.pool.push(l); }
    this.normMat = new THREE.MeshNormalMaterial();
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null }, res: { value: new THREE.Vector2(1, 1) }, scrollY: { value: 0 }, time: { value: 0 },
        frontD: { value: 0.5 }, frontS: { value: 0 }, pxD: { value: 1 / 899 },
        nBands: { value: 0 }, bandA: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) }, bandB: { value: Array.from({ length: 10 }, () => new THREE.Vector4()) },
      },
    });
    this.postScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.sections = [];
    // the town's cage riding its shaft, and the mole marking where you are
    this.cage = new THREE.Mesh(extrude('cageO', SPR.cageOpen, { ...PAL }, 9, (i, j, z) => z === 0 || z === 8 || j <= 5 || j >= 14 || j === 9 || i <= 2 || (i >= 11 && i <= 13)).geo, mats().vox);
    this.cage.castShadow = true;
    scene.add(this.cage);
    const MOLE = ['...yy...', '..0000..', '.033330.', '03311220', '031e1pp0', '03311220', '.033330.', '..0..0..', '.00..00.'];
    this.mole = new THREE.Mesh(extrude('mole', MOLE, { y: PAL.Y, 0: PAL.k, 3: 0x4a3446, 1: 0x6a5266, 2: 0x8a7088, e: PAL.c, p: 0xe89aa8 }, 4).geo, mats().vox);
    this.mole.visible = false;
    scene.add(this.mole);
    this.W = 0; this.H = 0;
  }
  setSize(W, H) {
    if (W === this.W && H === this.H) return;
    this.W = W; this.H = H;
    for (const rt of [this.rtA, this.rtN, this.rtO]) rt?.dispose();
    const opt = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
    this.rtA = new THREE.WebGLRenderTarget(W, H, { ...opt, depthTexture: new THREE.DepthTexture(W, H) });
    this.rtN = new THREE.WebGLRenderTarget(W, H, { ...opt });
    this.rtO = new THREE.WebGLRenderTarget(W, H, { ...opt, depthBuffer: false });
    this.buf = new Uint8Array(W * H * 4);
    this.img = new ImageData(new Uint8ClampedArray(this.buf.buffer), W, H);
    const c = this.cam;
    c.left = -W / 2; c.right = W / 2; c.top = H / 2; c.bottom = -H / 2; c.updateProjectionMatrix();
    const s = this.key.shadow.camera;
    s.left = -W / 2 - 60; s.right = W / 2 + 60; s.top = H / 2 + 80; s.bottom = -H / 2 - 80; s.near = 1; s.far = 1200; s.updateProjectionMatrix();
    this.post.uniforms.res.value.set(W, H);
  }
  /** Add a built section (build3d.js) whose top is y px down the stack. */
  add(sec, built) {
    built.group.position.y = -sec.y;
    this.root.add(built.group);
    // a drip is a little box falling; spores rise from glowcaps (two instanced meshes per section)
    const A = built.anim;
    if (A.drips.length) { A.dripMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 2, 1), mats().drip, A.drips.length); built.group.add(A.dripMesh); }
    if (A.spores.length) { A.sporeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats().spark, A.spores.length * 3); built.group.add(A.sporeMesh); }
    this.sections.push({ sec, built });
  }
  /** Drop the sections (and free what was built for them; the shared models and sprites stay). */
  clear() {
    for (const s of this.sections) {
      this.root.remove(s.built.group);
      s.built.group.traverse((q) => { if (q.geometry && !KEEP.has(q.geometry)) q.geometry.dispose(); if (q.isInstancedMesh) q.dispose?.(); });
      s.built.group.traverse((q) => { if (q.material && q.material.map && q.material.map.isCanvasTexture) { q.material.map.dispose(); q.material.dispose(); } });
    }
    this.sections = [];
  }

  /** Move things: critters, drips, spores, floating rocks, falls, the town cage, the mole. */
  animate(t, view) {
    const M4 = new THREE.Matrix4();
    for (const { sec, built } of this.sections) {
      const A = built.anim;
      const near = Math.abs(-sec.y - built.H / 2 - view.cy) < built.H / 2 + view.h;
      built.group.visible = near;
      if (!near) continue;
      const ft = (x) => built.floorTop(x), cb = (x) => (built.ceilBot ? built.ceilBot(x) : 0);
      if (A.dripMesh) A.drips.forEach((d, i) => {
        const per = 2.6, tt = (t + d.ph * per) % per, fall = ft(d.x) + d.y;
        let y = d.y;
        if (tt > 0.8) y = d.y - Math.min(fall, 80 * (tt - 0.8) * (tt - 0.8));
        M4.makeTranslation(d.x, y, -8 - (i % 3) * 2);
        A.dripMesh.setMatrixAt(i, M4);
      });
      if (A.dripMesh) A.dripMesh.instanceMatrix.needsUpdate = true;
      if (A.sporeMesh) A.spores.forEach((s, i) => {
        for (let k = 0; k < 3; k++) {
          const per = 5 + k * 1.4, tt = ((t + k * 1.7 + s.x * 0.03) % per) / per;
          M4.makeTranslation(s.x + Math.sin(tt * 6 + k) * 3 + tt * 4, s.y + tt * 26, s.z + 3);
          A.sporeMesh.setMatrixAt(i * 3 + k, M4);
        }
      });
      if (A.sporeMesh) A.sporeMesh.instanceMatrix.needsUpdate = true;
      for (const f of A.floaters) f.mesh.position.y = f.y0 + Math.sin(t * 0.8 + f.ph * 6.28) * 1.5;
      for (const f of A.falls) f.mesh.material = (Math.floor(t * 8) & 1) ? mats().lavaTop : mats().lava;
      if (A.bulbs) A.bulbs.forEach((b, i) => { b.visible = Math.sin(t * 1.6 + i * 2.3) > -0.7; });
      if (A.heart) A.heart.scale.y = 0.55 + Math.sin(t * 1.2) * 0.015;
      for (const c of A.critters) {
        const ph = t * c.sp * 0.22 + c.ph * 6.28;
        const dir = Math.cos(ph) >= 0 ? 1 : -1;
        const x = c.x + Math.sin(ph) * c.range;
        const k = c.kn ? Math.floor(t * (c.mv === 'fly' ? 6 : 3) + c.ph * 10) % c.frames.length : 0;
        c.frames.forEach((f, i) => { f.m.visible = i === k; });
        const f = c.frames[k];
        let y = -ft(x) + f.h - 1;
        if (c.kn && c.mv === 'fly') y = -cb(x) - 6 - (ft(x) - cb(x) - 14) * (0.3 + 0.25 * Math.sin(t * 0.8 + c.ph * 6));
        else if (c.kn && c.mv === 'hop') y += Math.sin(t * 3 + c.ph * 6) > 0.5 ? 2 : 0;
        else if (c.kn && c.mv === 'hang') y = -cb(x) - 10 + Math.sin(t * 0.7 + c.ph * 6) * 4;
        else if (c.kn && c.mv === 'float') y = -(ft(x) + cb(x)) / 2 + Math.sin(t * 1.1 + c.ph * 6) * 3;
        f.m.position.set(dir > 0 ? x - f.w / 2 : x + f.w / 2, y, c.z);
        f.m.scale.x = dir;
      }
    }
  }

  /**
   * Draw a frame. o: { scroll (px down the stack), t, tilt [-1..1, -1..1], bands [{ y0, y1, x0, mode, p, faint, inkX, seed }],
   * cageY (px down the stack), mole { x, y } | null }. Returns ImageData (W x H).
   */
  frame(o) {
    const r = this.r, W = this.W, H = this.H;
    const cy = -(o.scroll + H / 2);
    this.animate(o.t, { cy, h: H });
    // the town cage and the mole
    this.cage.position.set(SHAFT_X3 - 8, -o.cageY, -12);
    this.mole.visible = !!o.mole;
    if (o.mole) this.mole.position.set(o.mole.x - 4, -o.mole.y + 9 + (Math.sin(o.t * 3) > 0.3 ? 1 : 0), -2);
    // the camera: a little above, leaning with the mouse
    const yaw = (o.tilt?.[0] || 0) * 0.07, pitch = 0.25 + (o.tilt?.[1] || 0) * 0.04;
    const tx = W / 2, tz = -DEPTH / 2, dist = 420;
    this.cam.position.set(tx + Math.sin(yaw) * Math.cos(pitch) * dist, cy + Math.sin(pitch) * dist, tz + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.cam.lookAt(tx, cy, tz);
    this.cam.updateMatrixWorld();
    this.key.position.set(tx - 260, cy + 360, tz + 320);
    this.key.target.position.set(tx, cy, tz);
    this.key.target.updateMatrixWorld();
    // hand the pool to the nearest light sources, flickering
    const cand = [];
    for (const { sec, built } of this.sections) {
      if (!built.group.visible) continue;
      for (const l of built.lights) { const wy = l.y - sec.y; const dy = Math.abs(wy - cy); if (dy < H / 2 + l.d) cand.push({ l, wy, k: dy + Math.abs(l.x - tx) * 0.3 - l.i * 10 }); }
    }
    if (o.mole) cand.push({ l: { x: o.mole.x + 2, z: 2, c: 0xffd890, i: 1.0, d: 40, flick: 0.1 }, wy: -o.mole.y + 10, k: -999 });
    cand.push({ l: { x: SHAFT_X3 + 6, z: 0, c: 0xffb050, i: 1.0, d: 46, flick: 0.2 }, wy: -o.cageY + 8, k: Math.abs(-o.cageY - cy) });
    cand.sort((a, b) => a.k - b.k);
    this.pool.forEach((pl, i) => {
      const c = cand[i];
      if (!c) { pl.intensity = 0; return; }
      const f = 1 - c.l.flick * (0.5 + 0.5 * Math.sin(o.t * 11 + c.l.x) * Math.sin(o.t * 7.3 + c.l.x * 2));
      pl.position.set(c.l.x, c.wy, c.l.z ?? -6);
      pl.color.setHex(c.l.c);
      pl.intensity = c.l.i * f * 45;
      pl.distance = c.l.d * 1.25;
      pl.decay = 1;
    });
    // render: scene (with shadows), normals, then the pixel pass, then read it back
    const prev = { rt: r.getRenderTarget(), auto: r.autoClear, tm: r.toneMapping, sm: r.shadowMap.enabled, smt: r.shadowMap.type, cc: r.getClearColor(new THREE.Color()), ca: r.getClearAlpha() };
    try {
      r.autoClear = true;
      r.toneMapping = THREE.NoToneMapping;
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.setClearColor(BG, 1);
      r.setRenderTarget(this.rtA); r.render(this.scene, this.cam);
      r.shadowMap.enabled = false;
      this.scene.overrideMaterial = this.normMat;
      const fog = this.scene.fog; this.scene.fog = null;
      r.setClearColor(0x8080ff, 1);
      r.setRenderTarget(this.rtN); r.render(this.scene, this.cam);
      this.scene.overrideMaterial = null; this.scene.fog = fog;
      const U = this.post.uniforms;
      U.tColor.value = this.rtA.texture; U.tDepth.value = this.rtA.depthTexture; U.tNormal.value = this.rtN.texture;
      U.scrollY.value = o.scroll; U.time.value = o.t;
      // where the cut face lies in depth along the screen (the sketch hatches what's behind it)
      const pa = new THREE.Vector3(tx, cy, 0).project(this.cam), pb = new THREE.Vector3(tx, cy + 20, 0).project(this.cam);
      const da = (pa.z + 1) / 2, db = (pb.z + 1) / 2, ya = (1 - (pa.y + 1) / 2) * H, yb = (1 - (pb.y + 1) / 2) * H;
      const slope = (db - da) / (yb - ya || 1);
      U.frontD.value = da + slope * (H / 2 - ya); U.frontS.value = slope; U.pxD.value = 1 / (this.cam.far - this.cam.near);
      const bands = (o.bands || []).slice(0, 10);
      U.nBands.value = bands.length;
      bands.forEach((b, i) => { U.bandA.value[i].set(b.y0, b.y1, b.x0 || 0, b.mode); U.bandB.value[i].set(b.p || 0, b.faint ? 1 : 0, b.inkX ?? 0, b.seed || 0); });
      r.setRenderTarget(this.rtO); r.render(this.postScene, this.postCam);
      r.readRenderTargetPixels(this.rtO, 0, 0, W, H, this.buf);
    } finally {
      this.scene.overrideMaterial = null;
      r.setRenderTarget(prev.rt); r.autoClear = prev.auto; r.toneMapping = prev.tm; r.shadowMap.enabled = prev.sm; r.shadowMap.type = prev.smt; r.setClearColor(prev.cc, prev.ca);
    }
    return this.img;
  }
  dispose() {
    for (const rt of [this.rtA, this.rtN, this.rtO]) rt?.dispose();
    this.clear();
  }
}
