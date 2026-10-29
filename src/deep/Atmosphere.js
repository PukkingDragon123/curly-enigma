// The cave's air, per frame, in the mine (built by Particles when it is given a deep world):
//  - the mood of the zone and biome around the mole, blended as you walk: a cool sky light and a
//    warm bounce added to the ambient, dust haze (the lamp and lanterns glowing in the air), ground
//    mist, and what grows on the rock (moss on tops, damp streaks, rime, glowing cracks) — all as
//    uniforms of the terrain materials (makeTerrainUniforms: skyCol, bounce, haze, mist, mistCol, mood)
//  - the far darkness behind everything: a screen-filling sky drawn first, the same dark and lamp
//    glow the rock fades to (voidCol + airGlow), so far rock melts into it without a silhouette
//  - halos: each nearby light glows in the dusty air round it (one billboard per light, read
//    straight from the lPos / lCol uniforms, dithered into pixel steps)
//  - motes that drift around the eye and catch the helmet lamp: dust, sand, glitter, spores,
//    pollen, embers, snow, void sparks (by zone and biome)
//  - light shafts toward a bright lantern in a tall hall, and a little more bloom where things
//    glow (Engine post hook: scene.userData.postHook)
import * as THREE from 'three';
import { zoneAt, biomeAt } from './Generator.js';
import { LIGHT, AIR, MAX_LIGHTS } from './TerrainMaterial.js';

// sky / bounce / mist colours are linear light, added to an ambient of ~0.1
const ZONE = [
  null,
  // Rootsoil: warm earth, dust in the lamp, damp walls, a little moss on the ledges
  { haze: 0.9, mist: 0.03, mistCol: [0.03, 0.023, 0.018], sky: [0.003, 0.006, 0.013], bounce: [0.022, 0.012, 0.005], mood: [0.3, 0.55, 0, 0], motes: 'dust', bloom: 0 },
  // Clayworks: red clay, drier, dusty
  { haze: 1.0, mist: 0.02, mistCol: [0.036, 0.02, 0.014], sky: [0.003, 0.005, 0.011], bounce: [0.03, 0.012, 0.004], mood: [0.12, 0.35, 0, 0], motes: 'dust', bloom: 0 },
  // Crystal Grotto: cool violet air and glitter
  { haze: 0.55, mist: 0.03, mistCol: [0.018, 0.022, 0.05], sky: [0.01, 0.012, 0.032], bounce: [0.012, 0.007, 0.022], mood: [0.05, 0.3, 0, 0], motes: 'glitter', bloom: 0.12 },
  // Magma Deep: smoky, hot light from below, embers, cracks that glow
  { haze: 1.2, mist: 0.025, mistCol: [0.06, 0.018, 0.006], sky: [0.002, 0.002, 0.004], bounce: [0.075, 0.022, 0.005], mood: [0, 0, 0, 1], motes: 'embers', bloom: 0.1 },
  // Frost Vault: cold mist, rime on every ledge, ice glitter falling
  { haze: 0.8, mist: 0.06, mistCol: [0.04, 0.055, 0.07], sky: [0.012, 0.022, 0.036], bounce: [0.006, 0.01, 0.014], mood: [0, 0.12, 1, 0], motes: 'snow', bloom: 0.08 },
  // The Core: violet void sparks
  { haze: 0.85, mist: 0.04, mistCol: [0.035, 0.016, 0.055], sky: [0.012, 0.005, 0.028], bounce: [0.02, 0.005, 0.03], mood: [0, 0.1, 0, 0.35], motes: 'void', bloom: 0.15 },
];
const BIOME = [
  null,
  // Mossy Grotto: green damp air, moss on every ledge, spores
  { haze: 0.8, mist: 0.06, mistCol: [0.018, 0.04, 0.026], sky: [0.002, 0.012, 0.006], bounce: [0.004, 0.016, 0.008], mood: [1, 0.9, 0, 0], motes: 'spores', bloom: 0.08 },
  // Sandstone Hollows: dusty and warm, dry
  { haze: 1.4, mist: 0, mistCol: [0.05, 0.035, 0.02], sky: [0.006, 0.005, 0.004], bounce: [0.035, 0.02, 0.007], mood: [0, 0, 0, 0], motes: 'sand', bloom: 0 },
  // Mushroom Hollow: violet glow, spores rising
  { haze: 0.9, mist: 0.05, mistCol: [0.028, 0.018, 0.048], sky: [0.008, 0.004, 0.02], bounce: [0.01, 0.012, 0.03], mood: [0.3, 0.6, 0, 0], motes: 'glowspores', bloom: 0.14 },
  // Dino Caverns: warm and humid, pollen in the air
  { haze: 1.0, mist: 0.05, mistCol: [0.036, 0.04, 0.018], sky: [0.006, 0.01, 0.004], bounce: [0.03, 0.025, 0.006], mood: [0.8, 0.7, 0, 0], motes: 'pollen', bloom: 0.05 },
];

const rand = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3();

export class Atmosphere {
  /** scene3: THREE.Scene of the cave · world: DeepWorld · U: terrain uniforms · fx: Particles */
  constructor(scene3, world, U, fx) {
    this.scene3 = scene3;
    this.w = world;
    this.U = U;
    this.fx = fx;
    this.t = 0;
    this.zone = 1;
    this.biome = 0;
    this.bioT = 0;
    this.cur = null; // the blended mood
    this.hall = 0; this.hallT = 0;
    this.ray = { k: 0, pos: new THREE.Vector3(), col: new THREE.Color(1, 0.85, 0.6), target: -1 };
    this.moteAcc = 0;
    // the sky: a screen-filling triangle drawn before everything, at the far plane
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: U,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vec3 v = vec3(position.x / projectionMatrix[0][0], position.y / projectionMatrix[1][1], -1.0);
          vDir = (vec4(v, 0.0) * viewMatrix).xyz;
          gl_Position = vec4(position.xy, 0.9999, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 fogCol;
        uniform float fogDist;
        varying vec3 vDir;
        ${LIGHT}
        ${AIR}
        void main() { vec3 d = normalize(vDir); gl_FragColor = vec4(voidCol(d) + airGlow(d, 60.0), 1.0); }`,
    });
    this.sky = new THREE.Mesh(g, this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    this.sky.name = 'caveSky';
    scene3.add(this.sky);
    // halos: one camera-facing quad per light slot
    const hg = new THREE.BufferGeometry(), corner = [], li = [], idx = [];
    for (let i = 0; i < MAX_LIGHTS; i++) {
      corner.push(-1, -1, 1, -1, 1, 1, -1, 1);
      li.push(i, i, i, i);
      idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    hg.setAttribute('position', new THREE.Float32BufferAttribute(new Array(MAX_LIGHTS * 12).fill(0), 3));
    hg.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
    hg.setAttribute('li', new THREE.Float32BufferAttribute(li, 1));
    hg.setIndex(idx);
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: U,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec2 corner;
        attribute float li;
        uniform vec4 lPos[${MAX_LIGHTS}];
        uniform vec3 lCol[${MAX_LIGHTS}];
        uniform float haze;
        uniform float fogDist;
        varying vec2 vC;
        varying vec3 vCol;
        void main() {
          int i = int(li + 0.5);
          vec4 L = lPos[i];
          vC = corner;
          if (L.y < -9000.0 || haze <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); return; }
          float size = L.w * 0.42;
          vec3 toCam = cameraPosition - L.xyz;
          float d = length(toCam);
          // sit a little toward the eye so a lantern hung on a wall isn't cut in half by it
          vec3 c = L.xyz + toCam / max(d, 1e-3) * min(size * 0.45, d * 0.4);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 p = c + (right * corner.x + up * corner.y) * size;
          float f = 1.0 - exp(-pow(d / fogDist, 2.6) * 3.2);
          // fades as the eye walks into it (no screen-filling glow)
          vCol = lCol[i] * haze * (1.0 - f) * smoothstep(size * 0.5, size * 1.6, d) * 0.06;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vC;
        varying vec3 vCol;
        float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          float r = length(vC);
          if (r >= 1.0) discard;
          float k = (1.0 - r) * (1.0 - r);
          k = k * 0.75 + pow(1.0 - r, 6.0) * 0.6;
          // pixel-art halo: the glow falls off in dithered steps
          float q = floor(k * 7.0 + bayer4(gl_FragCoord.xy) * 0.999) / 7.0;
          gl_FragColor = vec4(vCol * q, 1.0);
        }`,
    });
    this.halos = new THREE.Mesh(hg, this.haloMat);
    this.halos.frustumCulled = false;
    this.halos.renderOrder = 10;
    this.halos.name = 'caveHalos';
    scene3.add(this.halos);
    this.hook = (p, camera) => this.post(p, camera);
    scene3.userData.postHook = this.hook;
  }

  /** The mood to blend toward here. */
  target() {
    const Z = ZONE[this.zone] || ZONE[1], B = BIOME[this.biome];
    if (!B) return Z;
    const k = 0.75, m = (a, b) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * k) : a + (b - a) * k);
    return { haze: m(Z.haze, B.haze), mist: m(Z.mist, B.mist), mistCol: m(Z.mistCol, B.mistCol), sky: m(Z.sky, B.sky), bounce: m(Z.bounce, B.bounce), mood: m(Z.mood, B.mood), bloom: m(Z.bloom, B.bloom), motes: B.motes, motes2: Z.motes };
  }

  update(dt) {
    const U = this.U, eye = U.lampPos.value;
    if (eye.y < -9000) return;
    this.t += dt;
    // where are we
    if ((this.bioT -= dt) <= 0) {
      this.bioT = 0.3;
      this.zone = zoneAt(Math.max(0, -eye.y));
      try { this.biome = biomeAt(this.w.plan, eye.x, eye.y - 0.2, eye.z) || 0; } catch (e) { this.biome = 0; }
    }
    const T = this.target();
    if (!this.cur) this.cur = JSON.parse(JSON.stringify(T));
    const C = this.cur, k = 1 - Math.exp(-dt * 0.9);
    const lerp = (a, b) => a + (b - a) * k;
    for (const key of ['haze', 'mist', 'bloom']) C[key] = lerp(C[key] || 0, T[key] || 0);
    for (const key of ['mistCol', 'sky', 'bounce', 'mood']) for (let i = 0; i < T[key].length; i++) C[key][i] = lerp(C[key][i], T[key][i]);
    C.motes = T.motes; C.motes2 = T.motes2;
    U.haze.value = C.haze;
    U.mist.value.set(C.mist * 0.6, 1.4, 0.55, 0);
    U.mistCol.value.setRGB(C.mistCol[0], C.mistCol[1], C.mistCol[2]);
    U.skyCol.value.setRGB(C.sky[0], C.sky[1], C.sky[2]);
    U.bounce.value.setRGB(C.bounce[0], C.bounce[1], C.bounce[2]);
    U.mood.value.set(C.mood[0], C.mood[1], C.mood[2], C.mood[3]);
    this.motes(dt, C);
    // tall halls: how much room is there round the eye (sampled now and then)
    if ((this.hallT -= dt) <= 0) {
      this.hallT = 0.4;
      this.hall = this.measureHall(eye);
    }
  }

  measureHall(eye) {
    const w = this.w;
    let up = 0;
    for (; up < 9; up += 0.5) if (w.solidAt(eye.x, eye.y + up + 0.3, eye.z)) break;
    let open = 0;
    for (let a = 0; a < 8; a++) {
      const dx = Math.cos(a * 0.785), dz = Math.sin(a * 0.785);
      let t = 0.5;
      for (; t < 12; t += 0.75) if (w.solidAt(eye.x + dx * t, eye.y + 0.4, eye.z + dz * t)) break;
      open += t / 8;
    }
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    return sm(2.5, 6, up) * sm(3.5, 8, open);
  }

  /** Motes that drift round the eye; the lamp lights them (Particles: lit). */
  motes(dt, C) {
    const U = this.U, eye = U.lampPos.value, f = U.lampDir.value, fx = this.fx;
    const kinds = [C.motes || C.motes2, C.motes2];
    const rate = 16 + this.hall * 10;
    this.moteAcc += dt * rate;
    let n = Math.min(8, Math.floor(this.moteAcc));
    this.moteAcc -= n;
    while (n-- > 0) {
      // in front of the eye mostly, a few all round
      const fw = Math.random() < 0.75 ? rand(0.5, 7) : rand(-2, 2);
      _v.set(eye.x + f.x * fw + rand(-2.6, 2.6), eye.y + f.y * fw + rand(-1.4, 1.8), eye.z + f.z * fw + rand(-2.6, 2.6));
      if (this.w.solidAt(_v.x, _v.y, _v.z)) continue;
      this.spawnMote(kinds[Math.random() < 0.7 ? 0 : 1], _v.x, _v.y, _v.z);
    }
  }

  spawnMote(kind, x, y, z) {
    const fx = this.fx;
    switch (kind) {
      case 'sand':
        fx.spawn({ x, y, z, vx: rand(-0.06, 0.06), vy: rand(-0.04, 0.01), vz: rand(-0.06, 0.06), life: rand(3, 6), size: rand(0.005, 0.01), color: [0.95, 0.78, 0.52], alpha: 0.85, drag: 0.15, lit: 1, swirl: 0.05 });
        break;
      case 'glitter':
        fx.spawn({ x, y, z, vx: rand(-0.03, 0.03), vy: rand(-0.03, 0.02), vz: rand(-0.03, 0.03), life: rand(3, 6), size: rand(0.004, 0.008), color: [0.8, 0.85, 1], alpha: 0.95, drag: 0.1, lit: 1, twinkle: rand(3, 7) });
        if (Math.random() < 0.15) fx.spawn({ x, y, z, vx: rand(-0.02, 0.02), vy: rand(-0.01, 0.03), vz: rand(-0.02, 0.02), life: rand(2, 4), size: 0.006, color: [0.55, 0.6, 1], alpha: 0.8, glow: true, drag: 0.2, twinkle: rand(2, 5) });
        break;
      case 'embers':
        if (Math.random() < 0.55) fx.spawn({ x, y: y - 1, z, vx: rand(-0.08, 0.08), vy: rand(0.15, 0.45), vz: rand(-0.08, 0.08), life: rand(2, 4), size: rand(0.006, 0.012), color: Math.random() < 0.5 ? [1, 0.45, 0.1] : [1, 0.7, 0.25], glow: true, drag: 0.4, grav: -0.05, swirl: 0.25 });
        else fx.spawn({ x, y, z, vx: rand(-0.04, 0.04), vy: rand(0.02, 0.08), vz: rand(-0.04, 0.04), life: rand(3, 6), size: rand(0.006, 0.012), color: [0.5, 0.42, 0.38], alpha: 0.7, drag: 0.2, lit: 1, swirl: 0.06 });
        break;
      case 'snow':
        fx.spawn({ x, y: y + 0.6, z, vx: rand(-0.05, 0.05), vy: rand(-0.14, -0.05), vz: rand(-0.05, 0.05), life: rand(4, 7), size: rand(0.005, 0.011), color: [0.9, 0.96, 1], alpha: 0.9, drag: 0.1, lit: 1, swirl: 0.12, twinkle: Math.random() < 0.3 ? rand(4, 8) : 0 });
        break;
      case 'void':
        if (Math.random() < 0.35) fx.spawn({ x, y, z, vx: rand(-0.05, 0.05), vy: rand(-0.02, 0.06), vz: rand(-0.05, 0.05), life: rand(2, 4), size: rand(0.005, 0.009), color: Math.random() < 0.5 ? [0.7, 0.4, 1] : [1, 0.85, 0.5], glow: true, drag: 0.2, twinkle: rand(2, 6), swirl: 0.15 });
        else fx.spawn({ x, y, z, vx: rand(-0.04, 0.04), vy: rand(-0.02, 0.02), vz: rand(-0.04, 0.04), life: rand(3, 6), size: rand(0.005, 0.01), color: [0.75, 0.7, 0.9], alpha: 0.8, drag: 0.15, lit: 1 });
        break;
      case 'spores':
        if (Math.random() < 0.3) fx.spawn({ x, y, z, vx: rand(-0.03, 0.03), vy: rand(0.01, 0.06), vz: rand(-0.03, 0.03), life: rand(4, 7), size: rand(0.005, 0.009), color: [0.6, 1, 0.55], alpha: 0.55, glow: true, drag: 0.2, swirl: 0.1, twinkle: rand(1, 3) });
        else fx.spawn({ x, y, z, vx: rand(-0.04, 0.04), vy: rand(-0.02, 0.03), vz: rand(-0.04, 0.04), life: rand(3, 6), size: rand(0.005, 0.011), color: [0.82, 0.92, 0.7], alpha: 0.8, drag: 0.15, lit: 1, swirl: 0.06 });
        break;
      case 'glowspores':
        if (Math.random() < 0.45) fx.spawn({ x, y: y - 0.5, z, vx: rand(-0.03, 0.03), vy: rand(0.03, 0.1), vz: rand(-0.03, 0.03), life: rand(4, 7), size: rand(0.006, 0.011), color: Math.random() < 0.6 ? [0.45, 0.75, 1] : [0.85, 0.5, 1], alpha: 0.7, glow: true, drag: 0.2, swirl: 0.12, twinkle: rand(0.8, 2) });
        else fx.spawn({ x, y, z, vx: rand(-0.04, 0.04), vy: rand(-0.01, 0.03), vz: rand(-0.04, 0.04), life: rand(3, 6), size: rand(0.005, 0.01), color: [0.85, 0.8, 0.95], alpha: 0.75, drag: 0.15, lit: 1 });
        break;
      case 'pollen':
        if (Math.random() < 0.25) fx.spawn({ x, y, z, vx: rand(-0.04, 0.04), vy: rand(-0.01, 0.04), vz: rand(-0.04, 0.04), life: rand(4, 7), size: rand(0.005, 0.008), color: [1, 0.95, 0.5], alpha: 0.5, glow: true, drag: 0.2, swirl: 0.12 });
        else fx.spawn({ x, y, z, vx: rand(-0.05, 0.05), vy: rand(-0.03, 0.02), vz: rand(-0.05, 0.05), life: rand(3, 6), size: rand(0.005, 0.011), color: [0.95, 0.92, 0.65], alpha: 0.85, drag: 0.15, lit: 1, swirl: 0.08 });
        break;
      default: // dust
        fx.spawn({ x, y, z, vx: rand(-0.04, 0.04), vy: rand(-0.025, 0.015), vz: rand(-0.04, 0.04), life: rand(3, 7), size: rand(0.005, 0.011), color: [0.92, 0.86, 0.76], alpha: 0.85, drag: 0.15, lit: 1, swirl: 0.05 });
    }
  }

  /** Engine post hook: light shafts toward a bright lantern in a tall hall, a touch more bloom. */
  post(p, camera) {
    const C = this.cur, U = this.U;
    if (!C) return;
    p.bloom = (p.bloom || 0) + (C.bloom || 0) * 0.4;
    // the brightest light in front of the eye, 2.5–16 m away
    const R = this.ray;
    camera.getWorldDirection(_f);
    const eye = camera.position;
    let best = -1, bs = 0;
    for (let i = 0; i < U.lPos.value.length; i++) {
      const l = U.lPos.value[i], c = U.lCol.value[i];
      if (l.y < -9000) continue;
      _v.set(l.x - eye.x, l.y - eye.y, l.z - eye.z);
      const d = _v.length();
      if (d < 2.5 || d > 16) continue;
      const cos = _v.dot(_f) / d;
      if (cos < 0.55) continue;
      const b = Math.max(c.x, c.y, c.z);
      if (b < 0.35) continue;
      const s = b * Math.min(1.5, l.w / 4) * (cos - 0.5) * (1 - d / 20);
      if (s > bs) { bs = s; best = i; }
    }
    const want = this.hall > 0.05 && best >= 0;
    if (want && (R.target === best || R.k < 0.02)) {
      const l = U.lPos.value[best], c = U.lCol.value[best];
      if (R.target !== best) R.pos.set(l.x, l.y, l.z);
      R.pos.lerp(_c.set(l.x, l.y, l.z), 0.2);
      const m = Math.max(c.x, c.y, c.z, 1e-3);
      R.col.setRGB(0.4 + 0.6 * c.x / m, 0.4 + 0.6 * c.y / m, 0.4 + 0.6 * c.z / m);
      R.target = best;
      R.k += (1 - R.k) * 0.06;
    } else R.k *= 0.9;
    const k = R.k * this.hall;
    if (k > 0.01 && !(p.rays > 0)) {
      p.rays = 0.5 * k;
      p.raysPos = [R.pos.x, R.pos.y, R.pos.z];
      p.raysDir = null;
      p.raysScreen = null;
      p.raysColor = R.col.getHex();
      p.raysSky = 0;
      p.raysThreshold = 0.42;
      p.raysRadius = 0.34;
      p.raysDecay = 0.955;
      p.raysLength = 0.88;
    }
  }

  dispose() {
    this.scene3.remove(this.sky, this.halos);
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    this.halos.geometry.dispose();
    this.haloMat.dispose();
    if (this.scene3.userData.postHook === this.hook) delete this.scene3.userData.postHook;
  }
}
