// The opening: a quiet afternoon in the meadow above Deep Town, the mole and Nugget at the lip of
// a sinkhole... until the lip gives way. They tumble ~50 m down the shaft past roots, banded clay,
// an underground waterfall and a glow-worm grotto, bounce off three ledges (Nugget flapping
// uselessly the whole way) and crash through the roof of an old abandoned burrow. Cut to black on
// the impact; the home scene plays the landing. ~17.5 s, skippable (Esc, tap, the Skip button).
// Dev: ?scene=fall&at=secs to start later, &freeze=1 to stop time.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { el, clamp, lerp } from '../core/util.js';
import { useBookendStyles } from '../bookends/css.js';
import { disposeTextures, setPixelScale, Particles, SHAPE, fitFov, GLSL_BAYER } from '../bookends/fx.js';
import { makeMole, makeChicken } from '../bookends/actors.js';
import { buildMeadow, MEADOW } from '../bookends/meadow.js';
import { buildFallShaft, FALL_ZONES } from '../bookends/fallshaft.js';

const T_CAPTION = [0.5, 3.6];
const T_CRACK = 4.2;
const T_DROP = 5.6;
const FALL = 10.8; // seconds of falling
const T_CRASH = T_DROP + FALL;
const T_OUT = T_CRASH + 0.85;
const BOUNCES = [
  { tau: 2.2, ang: -Math.PI / 2 + 0.55, kind: 'moss' },
  { tau: 4.6, ang: Math.PI / 2 + 0.3, kind: 'clay' },
  { tau: 7.0, ang: -0.35, kind: 'crystal' },
];
const BODY = 0.45; // the mole's centre above his feet
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const bump = (x, w) => (Math.abs(x) < w ? 0.5 + 0.5 * Math.cos((x / w) * Math.PI) : 0);

/**
 * Pre-simulate the mole's fall (centre of mass) at 120 Hz, recording 60 Hz samples: drag to a
 * dreamy terminal velocity, a gentle wander, and a pull toward each wall just before the ledge
 * he will bounce off. The shaft then puts its ledges exactly where he hits.
 */
function simulateFall(start) {
  const dt = 1 / 120, g = 9.8, vt = 5.6, kd = g / (vt * vt);
  const n = Math.ceil(FALL * 60) + 4;
  const S = new Float32Array(n * 5); // x y z vy spin
  let x = start.x, y = start.y, z = start.z, vx = 0, vy = 0, vz = 0, spin = 0, spinV = 0.8;
  const contacts = [];
  let bi = 0;
  for (let s = 0; s < n * 2; s++) {
    const tau = s * dt;
    if (s % 2 === 0) { const i = s / 2; S[i * 5] = x; S[i * 5 + 1] = y; S[i * 5 + 2] = z; S[i * 5 + 3] = vy; S[i * 5 + 4] = spin; }
    const B = BOUNCES[bi];
    let tx = 0.3 * Math.sin(0.9 * tau), tz = 0.3 * Math.cos(0.7 * tau);
    if (B && tau > B.tau - 1.0) { tx = Math.cos(B.ang) * 1.25; tz = Math.sin(B.ang) * 1.25; }
    vx += ((tx - x) * 6 - vx * 3.2) * dt;
    vz += ((tz - z) * 6 - vz * 3.2) * dt;
    vy += (-g - Math.sign(vy) * kd * vy * vy) * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    spin += spinV * dt;
    spinV += ((bi % 2 ? -0.9 : 0.9) - spinV) * dt * 0.7;
    if (B && tau >= B.tau) {
      contacts.push({ ...B, x, y, z });
      const nx = Math.cos(B.ang), nz = Math.sin(B.ang);
      vx = -nx * 2.0 - nz * 0.4; vz = -nz * 2.0 + nx * 0.4; vy = 2.3;
      spinV = bi % 2 ? -6 : 6;
      bi++;
    }
  }
  const at = (tau, out) => {
    const f = clamp(tau, 0, FALL + 0.05) * 60, i = Math.min(n - 2, Math.floor(f)), k = f - i;
    for (let c = 0; c < 5; c++) out[c] = S[i * 5 + c] + (S[(i + 1) * 5 + c] - S[i * 5 + c]) * k;
    return out;
  };
  return { at, contacts };
}

/** Where to put the ledge he bounces off: the octagon face, position along it, reach, height. */
function ledgeFor(c) {
  const ang = Math.atan2(c.z, c.x);
  const face = ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;
  const th = (face * Math.PI) / 4;
  const rho = c.x * Math.cos(th) + c.z * Math.sin(th);
  const u = clamp(-c.x * Math.sin(th) + c.z * Math.cos(th), -0.5, 0.5);
  return { face, u, y: c.y - 0.02, reach: Math.min(2.1, rho + 0.32), w: 1.7, ang: th, kind: c.kind };
}

// ------------------------------------------------------------------ waterfall
const WATER_VERT = 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
const WATER_FRAG = /* glsl */`
uniform float uTime; uniform vec3 uFog; uniform float uNear; uniform float uFar;
varying vec2 vUv; varying vec3 vW;
${GLSL_BAYER}
float h1(float n) { return fract(sin(n * 91.3) * 43758.5453); }
void main() {
  float col = floor(vUv.x * 22.0);
  float sp = 1.6 + h1(col) * 1.4;
  float p = fract(vUv.y * 9.0 + uTime * sp + h1(col + 7.0));
  float edge = min(vUv.x, 1.0 - vUv.x) * 2.0;
  float a = smoothstep(0.0, 0.35, edge) * (0.75 + 0.25 * step(0.55, p));
  if (bk_bayer4(gl_FragCoord.xy) > a) discard;
  vec3 c = mix(vec3(0.22, 0.48, 0.72), vec3(0.75, 0.92, 1.0), step(0.72, p));
  float foam = max(smoothstep(0.88, 1.0, vUv.y), smoothstep(0.1, 0.0, vUv.y));
  c = mix(c, vec3(1.0), foam * step(0.3, h1(floor(vUv.y * 60.0) + col)));
  float d = length(vW - cameraPosition);
  c = mix(c, uFog, smoothstep(uNear, uFar, d));
  gl_FragColor = vec4(c, 1.0);
}`;

export default class FallScene extends Scene {
  async enter(params = {}) {
    const t0 = performance.now();
    this.hud = 'none';
    this.allowMenus = false;
    this.music = 'title';
    this.textures = [];
    this.loops = {};
    this.own(useBookendStyles());
    this.own(() => disposeTextures(this.textures));
    this.own(() => { for (const h of Object.values(this.loops)) h.stop(0.3); });
    setPixelScale(this.game.engine.height);
    this.t = 0;
    this.fired = new Set();
    this.shake = 0;
    this.leaving = false;

    const sc = this.scene;
    sc.background = new THREE.Color(0xcfeaf8);
    sc.fog = new THREE.Fog(0xcfeaf8, 45, 150);
    this.camera = new THREE.PerspectiveCamera(44, this.game.engine.aspect, 0.05, 260);

    // ---- the meadow
    const tm = performance.now();
    this.meadow = buildMeadow();
    this.textures.push(...this.meadow.textures);
    sc.add(this.meadow.group, this.meadow.sky);
    for (const p of this.meadow.pieces) sc.add(p.mesh); // the falling lip outlives the meadow's visibility
    const msMeadow = performance.now() - tm;

    // ---- lights: sun and sky up top, the mole's helmet lamp down below
    this.hemi = new THREE.HemisphereLight(0xc8e6ff, 0x5a7a3a, 1.6);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    this.sun.position.copy(this.meadow.sun).multiplyScalar(30);
    sc.add(this.hemi, this.sun);

    // ---- the travellers
    const S = MEADOW.slab;
    this.mole = makeMole();
    this.hen = makeChicken({});
    this.molePivot = new THREE.Group();
    this.henPivot = new THREE.Group();
    this.molePivot.add(this.mole.root);
    this.henPivot.add(this.hen.root);
    this.mole.root.position.y = -BODY;
    this.hen.root.position.y = -0.28;
    const ma = S.angle + 0.12, ha = S.angle - 0.34;
    this.moleHome = new THREE.Vector3(Math.cos(ma) * 2.55, BODY, Math.sin(ma) * 2.55);
    this.henHome = new THREE.Vector3(Math.cos(ha) * 2.95, 0.28, Math.sin(ha) * 2.95);
    this.molePivot.position.copy(this.moleHome);
    this.henPivot.position.copy(this.henHome);
    this.mole.face(0, true);
    this.mole.play('idle');
    this.hen.face(0.7, true);
    this.hen.play('idle');
    sc.add(this.molePivot, this.henPivot);
    this.lamp = new THREE.PointLight(0xffd8a0, 0, 7, 1.6);
    (this.mole.lamp || this.mole.neck).add(this.lamp);

    // ---- the fall, worked out in advance; the shaft is built around it
    this.sim = simulateFall(this.moleHome);
    this.simOut = new Float32Array(5);
    this.contacts = this.sim.contacts;
    this.ledges = this.contacts.map(ledgeFor);
    this.floorY = this.sim.at(FALL, this.simOut)[1] - BODY + 0.05;
    const wf = { face: 5, u: 0, yTop: FALL_ZONES.clay - 1.2, yBot: FALL_ZONES.wet + 0.6 };
    const ts = performance.now();
    this.shaft = buildFallShaft({ floorY: this.floorY, ledges: this.ledges, waterfall: wf });
    sc.add(this.shaft.group);
    this.shaft.ensure(-9); // whatever shows through the hole from up top
    const msShaft = performance.now() - ts;
    this.waterfall = this.makeWaterfall(wf);
    // the abyss: a black plug a little way below the camera hides (and lets us skip) everything deeper
    this.plug = new THREE.Mesh(new THREE.CircleGeometry(4.6, 24), new THREE.MeshBasicMaterial({ color: 0x050403, fog: false }));
    this.plug.rotation.x = -Math.PI / 2;
    this.plug.renderOrder = -10;
    sc.add(this.plug);
    // what shows through the broken roof for a heartbeat: the dim, dusty burrow below
    this.burrowGlow = new THREE.Group();
    const room = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 3, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x24160c, side: THREE.BackSide, fog: false }));
    room.position.y = this.floorY - 2.0;
    const rug = new THREE.Mesh(new THREE.CircleGeometry(3.3, 20), new THREE.MeshBasicMaterial({ color: 0x4a2e18, fog: false }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.y = this.floorY - 3.4;
    this.burrowGlow.add(room, rug);
    this.burrowGlow.visible = false;
    sc.add(this.burrowGlow);

    // ---- particles: dust, debris (pebbles, leaves, splinters), sparks, motes, feathers, spray
    this.dust = new Particles({ max: 420, additive: false, atten: true });
    this.debris = new Particles({ max: 360, additive: false, atten: true });
    this.sparks = new Particles({ max: 220, additive: true, atten: true });
    this.motes = new Particles({ max: 300, additive: true, atten: true });
    this.feathers = new Particles({ max: 90, additive: false, atten: true });
    this.spray = new Particles({ max: 260, additive: false, atten: true });
    this.pools = [this.dust, this.debris, this.sparks, this.motes, this.feathers, this.spray];
    for (const p of this.pools) sc.add(p.points);
    this.makeStreaks();

    // ---- DOM: an opening card and the skip button
    this.caption = el('div', { class: 'bk-caption bk-outline' }, ['One sunny afternoon, far above Deep Town', el('small', {}, 'the mole and Nugget go for a walk')]);
    this.skipBtn = el('button', { class: 'btn alt bk-skip', type: 'button', onclick: (e) => { e.stopPropagation(); this.skip(); } }, 'Skip ›');
    this.root = el('div', { class: 'bk-root bk-fall' }, [this.caption, this.skipBtn]);
    this.game.ui.world.append(this.root);
    this.own(() => this.root.remove());
    const onKey = (e) => { if (e.code === 'Escape') this.skip(); };
    const onTap = (e) => { if (this.t > 0.6 && !(e.target && e.target.closest && e.target.closest('button'))) this.skip(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onTap);
    this.own(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onTap); });

    this.post.vignette = 0.22;
    this.post.saturation = 1.08;
    this.onResize(this.game.engine.width, this.game.engine.height);
    try { this.game.engine.renderer.compile(sc, this.camera); } catch (e) { /* optional */ }
    console.log(`[fall] built in ${Math.round(performance.now() - t0)} ms (meadow ${Math.round(msMeadow)}, shaft head ${Math.round(msShaft)}; the rest of the shaft streams in while they stand at the lip)`);

    const at = parseFloat(params.at) || 0;
    if (at > 0) for (let k = 0; k < at; k += 1 / 30) this.update(1 / 30);
    this.frozen = !!params.freeze;
  }

  // ------------------------------------------------------------------ builders
  makeWaterfall(wf) {
    const th = (wf.face * Math.PI) / 4;
    const h = wf.yTop - wf.yBot;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFog: { value: new THREE.Color(0x0b0806) }, uNear: { value: 4 }, uFar: { value: 18 } },
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.15, h, 1, 1), mat);
    const r = 2.38;
    m.position.set(Math.cos(th) * r, (wf.yTop + wf.yBot) / 2 - 0.3, Math.sin(th) * r);
    m.lookAt(0, m.position.y, 0);
    this.scene.add(m);
    return { mesh: m, mat, top: new THREE.Vector3(Math.cos(th) * 2.4, wf.yTop - 0.4, Math.sin(th) * 2.4), bottom: new THREE.Vector3(Math.cos(th) * 2.35, wf.yBot, Math.sin(th) * 2.35) };
  }

  /** Vertical streaks of dust hanging in the shaft: as everyone falls past, they whip upward. */
  makeStreaks() {
    const N = 64;
    this.streaks = Array.from({ length: N }, () => ({ x: 0, y: 99, z: 0, a: 0 }));
    this.stPos = new Float32Array(N * 6);
    this.stCol = new Float32Array(N * 8);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.stPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.stCol, 4).setUsage(THREE.DynamicDrawUsage));
    this.stGeo = g;
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    lines.frustumCulled = false;
    lines.renderOrder = 40;
    this.scene.add(lines);
  }

  // ------------------------------------------------------------------ helpers
  once(key, t, fn) { if (this.t >= t && !this.fired.has(key)) { this.fired.add(key); fn(); } }
  sfx(name, opts) { this.game.audio.play(name, opts); }
  loop(name, vol) {
    const h = this.loops[name];
    if (vol <= 0.001) { if (h) { h.stop(0.4); delete this.loops[name]; } return; }
    if (!h || h.alive === false) this.loops[name] = this.game.audio.loop(name, { vol, fadeIn: 0.5 });
    else h.set({ vol });
  }
  /** Where the mole's centre is at scene time t, plus his vertical speed and tumble. */
  moleAt(t, out = new THREE.Vector3()) {
    if (t < T_DROP) return out.copy(this.moleHome);
    const s = this.sim.at(t - T_DROP, this.simOut);
    return out.set(s[0], s[1] - Math.max(0, t - T_CRASH) * 4.5, s[2]); // ...and on through the roof
  }
  shaftRadius(y) { return y > -1 ? 3.6 : y > -8.5 ? lerp(3.4, 2.45, smooth((-1 - y) / 7.5)) : 2.45; }

  skip() {
    if (this.leaving) return;
    this.sfx('whoosh');
    this.leave(0.35);
  }

  leave(dur = 0.2) {
    if (this.leaving) return;
    this.leaving = true;
    this.game.goto('home', { from: 'fall' }, { transition: 'fade', dur });
  }

  // ------------------------------------------------------------------ frame
  onResize(w, h) {
    setPixelScale(h);
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    if (this.frozen) dt = 0;
    super.update(dt);
    if (this.leaving) return;
    const t = (this.t += dt);
    const au = this.game.audio;

    // keep streaming the shaft: a few ms a frame, never letting the camera outrun it
    this.shaft.prebuild(t < T_DROP ? 3 : 2);

    this.story(t, dt, au);
    const C = this.updateTravellers(t, dt);
    this.updateCamera(t, dt, C);
    // up top the shaft streams in the background; once falling, it must reach past the fog
    if (t > T_DROP - 0.2) this.shaft.ensure(Math.min(this.camera.position.y, C.y) - 16);
    this.updateWorld(t, dt, C);
    if (t >= T_OUT) this.leave(0.2);
  }

  story(t, dt, au) {
    const M = this.meadow;
    this.once('wind', 0, () => this.loop('wind', 0.12));
    this.once('cap', T_CAPTION[0], () => this.caption.classList.add('on'));
    this.once('capoff', T_CAPTION[1], () => this.caption.classList.remove('on'));
    this.once('cluck', 1.1, () => this.sfx('cluck', { n: 2 }));
    this.once('chirp', 1.8, () => this.sfx('chirp'));
    this.once('peck1', 1.5, () => this.hen.peck());
    this.once('peck2', 2.7, () => { this.hen.peck(); this.sfx('cluck', { n: 1 }); });
    this.once('chirp2', 3.1, () => this.sfx('chirp'));
    // the lip gives way
    this.once('creak', T_CRACK, () => { this.sfx('creak'); this.loop('rumble', 0.55); au.stopMusic(1.2); this.shake = 0.02; });
    this.once('crack1', T_CRACK + 0.35, () => { this.sfx('crack'); this.mole.doEmote('surprise', 1.8); this.sfx('squeak'); this.crackPuff(1); });
    this.once('bawk', T_CRACK + 0.6, () => { this.sfx('bawk'); this.hen.flap(1.2); });
    this.once('crack2', T_CRACK + 0.85, () => { this.sfx('crack'); this.sfx('trickle'); this.crackPuff(2); this.shake = 0.05; });
    this.once('drop', T_DROP, () => {
      this.sfx('collapse'); this.sfx('whoosh'); this.shake = 0.09;
      this.mole.play('fall');
      this.burstDrop();
      for (const p of M.pieces) {
        const out = p.home.clone().setY(0).normalize();
        p.vel = new THREE.Vector3(out.x * 0.5 + (Math.random() - 0.5) * 0.3, -1.2 - Math.random() * 0.8, out.z * 0.5 + (Math.random() - 0.5) * 0.3);
        p.spin = new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2.5);
      }
    });
    // falling: wind roars with speed, the rumble dies away, ledges, the waterfall, the grotto
    if (t >= T_DROP) {
      const s = this.sim.at(t - T_DROP, this.simOut);
      const sp = clamp(-s[3] / 5.6, 0, 1);
      this.loop('wind', 0.12 + sp * 0.75);
      this.loop('rumble', Math.max(0, 0.55 - (t - T_DROP) * 0.25));
      const wd = this.camera.position.distanceTo(this.waterfall.bottom.clone().lerp(this.waterfall.top, 0.5));
      this.loop('water', clamp(1 - wd / 9, 0, 1) * 0.8);
      this.contacts.forEach((c, i) => this.once('bounce' + i, T_DROP + c.tau, () => this.bounce(c, i)));
      this.once('grotto', T_DROP + 6.1, () => this.sfx('sparkle', { vol: 0.5 }));
      this.once('bawk2', T_DROP + 1.4, () => this.sfx('bawk'));
      this.once('bawk3', T_DROP + 5.6, () => this.sfx('bawk', { pitch: 1.15 }));
      this.once('deb', T_DROP + 3.2, () => this.sfx('debris'));
      this.once('deb2', T_DROP + 8.4, () => this.sfx('debris'));
      this.once('crash', T_CRASH, () => this.crash());
    }
  }

  crackPuff(stage) {
    for (const p of this.meadow.pieces) {
      p.mesh.position.copy(p.home).add(new THREE.Vector3((Math.random() - 0.5) * 0.04 * stage, -0.025 * stage, (Math.random() - 0.5) * 0.04 * stage));
      p.mesh.rotation.set((Math.random() - 0.5) * 0.04 * stage, 0, (Math.random() - 0.5) * 0.04 * stage);
      for (let i = 0; i < 10 * stage; i++) {
        const a = Math.random() * Math.PI * 2;
        this.dust.spawn({ pos: [p.home.x + Math.cos(a) * 0.5, 0.05, p.home.z + Math.sin(a) * 0.5], vel: [(Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6], life: 1.4, color: 0x9a7a5a, color2: 0x6a5040, size: 0.08, size2: 0.22, alpha: 0.55, drag: 1.5, shape: SHAPE.round });
      }
    }
    for (let i = 0; i < 18 * stage; i++) {
      const a = MEADOW.slab.angle + (Math.random() - 0.5) * 1.2, r = MEADOW.holeR + Math.random() * 0.2;
      this.debris.spawn({ pos: [Math.cos(a) * r, -0.05, Math.sin(a) * r], vel: [(Math.random() - 0.5) * 0.3, -Math.random(), (Math.random() - 0.5) * 0.3], life: 2.2, color: Math.random() < 0.5 ? 0x5a3e2a : 0x8a8278, size: 0.04 + Math.random() * 0.04, gravity: 9, shape: SHAPE.square });
    }
  }

  burstDrop() {
    const c = this.moleHome;
    for (let i = 0; i < 60; i++) {
      const leaf = i % 3 === 0;
      this.debris.spawn({
        pos: [c.x + (Math.random() - 0.5) * 2.2, 0.05 + Math.random() * 0.3, c.z + (Math.random() - 0.5) * 1.2],
        vel: [(Math.random() - 0.5) * 1.2, leaf ? 0.6 + Math.random() : -Math.random() * 2, (Math.random() - 0.5) * 1.2],
        life: leaf ? 4 : 3, color: leaf ? (Math.random() < 0.5 ? 0x6ab448 : 0x8ad060) : Math.random() < 0.6 ? 0x5a3e2a : 0x3e5a2a,
        size: leaf ? 0.06 : 0.035 + Math.random() * 0.05, gravity: leaf ? 1.2 : 9, drag: leaf ? 1.2 : 0.2, wobble: leaf ? 0.6 : 0, spin: leaf ? 6 : 0, shape: leaf ? SHAPE.confetti : SHAPE.square,
      });
    }
    for (let i = 0; i < 40; i++) this.dust.spawn({ pos: [c.x + (Math.random() - 0.5) * 2.4, 0.1, c.z + (Math.random() - 0.5) * 1.4], vel: [(Math.random() - 0.5) * 0.8, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8], life: 2.2, color: 0xa88a66, color2: 0x7a6248, size: 0.1, size2: 0.32, alpha: 0.5, drag: 1.2, shape: SHAPE.round });
  }

  bounce(c, i) {
    const crystal = c.kind === 'crystal';
    this.sfx('thud', { vol: 1 });
    this.sfx('hit');
    this.sfx(crystal ? 'break' : 'debris');
    if (crystal) this.sfx('sparkle');
    this.sfx(i === 1 ? 'hurt' : 'squeak');
    this.mole.play('hurt');
    this.hurtT = 0.5;
    this.hen.flap(1);
    this.shake = 0.11;
    this.post.flash = 0.35;
    this.post.flashColor = crystal ? 0xbfe8ff : 0xfff2d8;
    const nx = Math.cos(c.ang), nz = Math.sin(c.ang);
    const px = c.x + nx * 0.3, pz = c.z + nz * 0.3, py = c.y - 0.05;
    const rockCol = c.kind === 'moss' ? [0x5a3e2a, 0x3e5a2a] : c.kind === 'clay' ? [0xb8603a, 0xd88a50] : [0x7fd0ff, 0xd8f4ff];
    for (let k = 0; k < 45; k++) {
      this.debris.spawn({ pos: [px, py + Math.random() * 0.3, pz], vel: [-nx * (1 + Math.random() * 2.5) + (Math.random() - 0.5) * 2, Math.random() * 2.5, -nz * (1 + Math.random() * 2.5) + (Math.random() - 0.5) * 2], life: 2.2, color: rockCol[k % 2], size: 0.03 + Math.random() * 0.06, gravity: 9.8, shape: crystal ? SHAPE.diamond : SHAPE.square });
    }
    for (let k = 0; k < (crystal ? 60 : 30); k++) {
      this.sparks.spawn({ pos: [px, py + 0.1, pz], vel: [-nx * (2 + Math.random() * 3) + (Math.random() - 0.5) * 3, (Math.random() - 0.2) * 3, -nz * (2 + Math.random() * 3) + (Math.random() - 0.5) * 3], life: 0.5 + Math.random() * 0.4, color: crystal ? 0xffffff : 0xfff0a0, color2: crystal ? 0x5ab0ff : 0xff7a20, size: 0.05, size2: 0.01, gravity: 4, drag: 1.5, shape: crystal ? SHAPE.plus : SHAPE.square });
    }
    for (let k = 0; k < 24; k++) this.dust.spawn({ pos: [px, py, pz], vel: [(Math.random() - 0.5) * 1.5 - nx, Math.random() * 1.2, (Math.random() - 0.5) * 1.5 - nz], life: 1.6, color: crystal ? 0xa0b8e0 : 0x8a7058, color2: 0x3a3030, size: 0.08, size2: 0.3, alpha: 0.5, drag: 1.8, shape: SHAPE.round });
    this.featherPuff(8);
  }

  featherPuff(n) {
    const h = this.henPivot.position;
    for (let k = 0; k < n; k++) this.feathers.spawn({ pos: [h.x, h.y, h.z], vel: [(Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.6], life: 2.6, color: Math.random() < 0.2 ? 0xe8d8c0 : 0xfff8ee, size: 0.05, gravity: 0.8, drag: 2, wobble: 0.7, spin: 7, shape: SHAPE.confetti });
  }

  crash() {
    const mid = this.shaft.floorMiddle;
    if (mid) { mid.visible = false; mid.userData.broken = true; }
    this.burrowGlow.visible = true;
    this.sfx('collapse', { vol: 1 });
    this.sfx('break', { vol: 1 });
    this.sfx('thud', { vol: 1 });
    this.sfx('rumble_hit');
    this.mole.play('hurt');
    this.shake = 0.25;
    this.post.flash = 1;
    this.post.flashColor = 0xfff2dc;
    const c = this.molePivot.position;
    for (let k = 0; k < 120; k++) {
      const wood = k % 3 === 0;
      this.debris.spawn({ pos: [c.x + (Math.random() - 0.5) * 0.8, this.floorY + 0.1, c.z + (Math.random() - 0.5) * 0.8], vel: [(Math.random() - 0.5) * 6, 1 + Math.random() * 5, (Math.random() - 0.5) * 6], life: 1.6, color: wood ? 0x7a6a58 : 0x5a3e2a, size: wood ? 0.09 : 0.05, gravity: 12, spin: 9, shape: wood ? SHAPE.confetti : SHAPE.square });
    }
    for (let k = 0; k < 70; k++) this.dust.spawn({ pos: [c.x, this.floorY + 0.2, c.z], vel: [(Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4], life: 1.8, color: 0xa88a66, color2: 0x4a3a2a, size: 0.12, size2: 0.5, alpha: 0.7, drag: 2.2, shape: SHAPE.round });
    this.featherPuff(14);
  }

  updateTravellers(t, dt) {
    const mole = this.mole, hen = this.hen;
    const C = this.moleAt(t, this._c || (this._c = new THREE.Vector3()));
    this.molePivot.position.copy(C);
    if (t < T_DROP) {
      // a beat of calm: he peers over the edge, she pecks about, the ground starts to go
      mole.update(dt);
      const peer = smooth((t - 1.4) / 1.2) * (1 - smooth((t - T_CRACK - 0.2) / 0.4));
      mole.neck.rotation.x = 0.55 * peer;
      if (t > T_CRACK + 0.3) { mole.neck.rotation.x = -0.15; mole.armL.rotation.set(-0.8, 0, 0.5); mole.armR.rotation.set(-0.8, 0, -0.5); }
      hen.update(dt);
      if (t > T_CRACK + 0.5 && Math.random() < dt * 3) hen.flap(0.4);
      const wob = t > T_CRACK ? Math.sin(t * 40) * 0.01 * smooth((t - T_CRACK) / 1) : 0;
      this.molePivot.position.y = BODY - (t > T_CRACK + 0.85 ? 0.05 : t > T_CRACK + 0.35 ? 0.025 : 0) + wob;
      this.henPivot.position.copy(this.henHome);
      this.henPivot.position.y += this.molePivot.position.y - BODY;
      return C;
    }
    const tau = t - T_DROP;
    const s = this.sim.at(tau, this.simOut);
    // tumbling, arms and legs going everywhere (hurt for a moment after each ledge)
    this.molePivot.rotation.set(s[4], 0, Math.sin(s[4] * 0.5) * 0.5);
    if (this.hurtT > 0) { this.hurtT -= dt; if (this.hurtT <= 0) mole.play('fall'); }
    mole.update(dt);
    if (!(this.hurtT > 0)) {
      mole.armL.rotation.set(-2.6 + Math.sin(t * 13) * 0.5, 0, 0.6 + Math.sin(t * 9) * 0.3);
      mole.armR.rotation.set(-2.6 + Math.sin(t * 11 + 1) * 0.5, 0, -0.6 - Math.sin(t * 8) * 0.3);
      mole.legL.rotation.x = Math.sin(t * 10) * 0.7;
      mole.legR.rotation.x = -Math.sin(t * 10) * 0.7;
    }
    // Nugget: orbiting him, flapping uselessly, passing him when he bounces
    let ang = 2.2 + tau * 0.9, dy = 0.55 + Math.sin(tau * 2.1) * 0.25;
    for (const c of this.contacts) {
      const b = bump(tau - c.tau, 0.8);
      ang = lerp(ang, c.ang + Math.PI, b);
      dy -= 1.0 * bump(tau - c.tau - 0.35, 0.6);
    }
    const r = 0.85 + Math.sin(tau * 1.3) * 0.15;
    const target = this._h || (this._h = new THREE.Vector3());
    target.set(C.x + Math.cos(ang) * r, C.y + dy, C.z + Math.sin(ang) * r);
    const lim = this.shaftRadius(target.y) - 0.55;
    const rr = Math.hypot(target.x, target.z);
    if (rr > lim) { target.x *= lim / rr; target.z *= lim / rr; }
    const start = this._hs || (this._hs = this.henHome.clone());
    const k = smooth(tau / 1.2);
    this.henPivot.position.set(lerp(start.x, target.x, k), lerp(start.y + s[1] - this.moleHome.y, target.y, k), lerp(start.z, target.z, k));
    this.henPivot.rotation.set(Math.sin(tau * 2.3) * 0.6, tau * 1.4, Math.cos(tau * 1.7) * 0.5);
    hen.update(dt);
    this.flapT = (this.flapT || 0) - dt;
    if (this.flapT < 0) { this.flapT = 0.28 + Math.random() * 0.25; hen.flap(0.35); if (Math.random() < 0.35) this.featherPuff(1); }
    // falling slabs of the lip
    for (const p of this.meadow.pieces) {
      if (!p.vel) continue;
      p.vel.y -= 9.8 * dt;
      p.vel.y *= Math.exp(-0.15 * dt);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
      const pr = Math.hypot(p.mesh.position.x, p.mesh.position.z), plim = this.shaftRadius(p.mesh.position.y) - 0.6;
      if (pr > plim) { p.mesh.position.x *= plim / pr; p.mesh.position.z *= plim / pr; }
      // gone once they have dropped out of the light (or would swing into the lens)
      if (tau > 2.6 || (tau > 0.6 && p.mesh.position.distanceTo(this.camera.position) < 1.6)) p.mesh.visible = false;
    }
    return C;
  }

  // ------------------------------------------------------------------ camera
  shot(i, t, C, o) {
    const H = this.henPivot.position;
    const tau = t - T_DROP;
    o.roll = 0; o.fov = 50;
    switch (i) {
      case 0: { // establishing: across the sinkhole at the pair on the far lip
        const u = smooth(t / T_CRACK);
        o.pos.set(lerp(1.7, 0.8, u), lerp(1.8, 1.35, u), lerp(5.6, 4.2, u));
        o.look.set(-0.25, 0.5, -2.6);
        o.fov = 44;
        break;
      }
      case 1: { // the crack: push in
        const u = smooth((t - T_CRACK) / (T_DROP - T_CRACK));
        o.pos.set(lerp(0.8, 0.35, u), lerp(1.35, 1.05, u), lerp(4.2, 2.7, u));
        o.look.set(-0.2, 0.35, -2.55);
        o.fov = lerp(44, 40, u);
        break;
      }
      case 2: // the drop: over the hole, tipping down after them
        o.pos.set(0.3, Math.min(1.9, C.y + 2.7), 0.7 - smooth(tau / 1.2) * 0.4);
        o.look.copy(C);
        o.fov = 52;
        break;
      case 3: { // chase from above, the abyss below them
        const a = 0.4 + tau * 0.22;
        o.pos.set(C.x + Math.cos(a) * 0.9, C.y + 3.1, C.z + Math.sin(a) * 0.9);
        o.look.set(C.x, C.y - 1.4, C.z);
        o.roll = Math.sin(tau * 0.8) * 0.08;
        o.fov = 54;
        break;
      }
      case 4: { // swinging round them from across the shaft, walls (and the waterfall) whipping past
        const a = Math.atan2(C.z, C.x) + Math.PI + Math.sin((tau - 3.4) * 0.6) * 0.8;
        const r = Math.min(1.75, this.shaftRadius(C.y) - 0.6);
        o.pos.set(Math.cos(a) * r, C.y + 0.35, Math.sin(a) * r);
        o.look.set((C.x * 2 + H.x) / 3, (C.y * 2 + H.y) / 3 + 0.1, (C.z * 2 + H.z) / 3);
        o.roll = Math.sin(tau * 1.1) * 0.12;
        o.fov = 64;
        break;
      }
      case 5: // from below: them tumbling toward us, daylight a speck far above
        o.pos.set(C.x * 0.4 + 0.5, C.y - 2.9, C.z * 0.4 + 0.4);
        o.look.set(C.x, C.y + 0.35, C.z);
        o.roll = Math.sin(tau * 0.9) * 0.1;
        o.fov = 58;
        break;
      default: // the burrow roof rushing up
        o.pos.set(C.x * 0.3 - 0.9, C.y + 2.7, C.z * 0.3 + 0.7);
        o.look.set(C.x * 0.5, this.floorY, C.z * 0.5);
        o.fov = 56;
        break;
    }
    return o;
  }

  updateCamera(t, dt, C) {
    const starts = [0, T_CRACK, T_DROP, T_DROP + 1.2, T_DROP + 3.4, T_DROP + 6.2, T_DROP + 9.0];
    let i = 0;
    while (i + 1 < starts.length && t >= starts[i + 1]) i++;
    const A = this._sa || (this._sa = { pos: new THREE.Vector3(), look: new THREE.Vector3() });
    const B = this._sb || (this._sb = { pos: new THREE.Vector3(), look: new THREE.Vector3() });
    this.shot(i, t, C, A);
    const blend = i > 1 ? 0.9 : 0.5;
    const k = i > 0 ? smooth((t - starts[i]) / blend) : 1;
    if (k < 1) {
      this.shot(i - 1, t, C, B);
      A.pos.lerpVectors(B.pos, A.pos, k);
      A.look.lerpVectors(B.look, A.look, k);
      A.roll = lerp(B.roll, A.roll, k);
      A.fov = lerp(B.fov, A.fov, k);
    }
    // stay inside the shaft, and off the ledges
    const cam = this.camera;
    cam.position.copy(A.pos);
    if (t > T_DROP + 0.6) {
      const y = cam.position.y;
      let lim = this.shaftRadius(y) - 0.55;
      const ca = Math.atan2(cam.position.z, cam.position.x);
      for (const L of this.ledges) {
        if (Math.abs(y - L.y) > 1.3) continue;
        const d = Math.abs(Math.atan2(Math.sin(ca - L.ang), Math.cos(ca - L.ang)));
        if (d < 0.8) lim = Math.min(lim, L.reach - 0.4);
      }
      const r = Math.hypot(cam.position.x, cam.position.z);
      if (r > lim) { cam.position.x *= lim / r; cam.position.z *= lim / r; }
    }
    // shake
    this.shake = Math.max(0, this.shake - dt * (this.t > T_DROP ? 0.25 : 0.04));
    if (t > T_CRACK && t < T_DROP) this.shake = Math.max(this.shake, 0.012 + 0.03 * smooth((t - T_CRACK) / (T_DROP - T_CRACK)));
    const sh = this.shake;
    if (sh > 0) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    cam.lookAt(A.look);
    if (A.roll) cam.rotateZ(A.roll);
    // Nugget may orbit him, but never into the lens
    if (t > T_DROP) {
      const hp = this.henPivot.position;
      const away = this._aw || (this._aw = new THREE.Vector3());
      away.subVectors(hp, cam.position);
      const d = away.length();
      if (d < 1.5) hp.addScaledVector(away.normalize(), 1.5 - d);
    }
    fitFov(cam, A.fov, 48);
    cam.updateMatrixWorld();
    for (const p of this.pools) p.setScaleFromCamera(cam, this.game.engine.height);
  }

  // ------------------------------------------------------------------ world
  updateWorld(t, dt, C) {
    const cam = this.camera;
    const sc = this.scene;
    // daylight drains away as they drop; the helmet lamp takes over
    const dl = Math.pow(clamp(1 + cam.position.y / 10, 0, 1), 1.4);
    this.hemi.intensity = 0.5 + 1.1 * dl;
    this.sun.intensity = 2.2 * dl;
    this.lamp.intensity = t > T_DROP ? (1 - dl) * 4.5 * (0.92 + Math.sin(t * 23) * 0.08) : 0;
    const fogK = 1 - dl;
    sc.fog.color.setRGB(lerp(0.81, 0.043, fogK), lerp(0.92, 0.031, fogK), lerp(0.97, 0.024, fogK));
    sc.fog.near = lerp(45, 4, fogK);
    sc.fog.far = lerp(150, 19, fogK);
    sc.background.copy(sc.fog.color);
    // nothing past the fog is worth drawing: pull the far plane in (the sky dome ignores it)
    const far = Math.max(24, sc.fog.far + 2);
    if (Math.abs(cam.far - far) > 0.5) { cam.far = far; cam.updateProjectionMatrix(); }
    // near the top the fog is thin, so a black plug ~24 m down stands in for the abyss; the shaft
    // bands below it (and, while it is dark, beyond the fog) are not drawn at all
    const plugY = cam.position.y - 24;
    this.plug.visible = cam.position.y > -14;
    this.plug.position.set(0, plugY, 0);
    const cut = this.plug.visible ? plugY : cam.position.y - sc.fog.far - 1;
    for (const m of this.shaft.group.children) if (m.isMesh && m.geometry.boundingBox) m.visible = !m.userData.broken && m.geometry.boundingBox.max.y > cut;
    this.post.vignette = 0.22 + fogK * 0.25;
    if (this.post.flash > 0) this.post.flash = Math.max(0, this.post.flash - dt * 2.4);
    if (t > T_CRASH + 0.12) this.post.fade = clamp((t - T_CRASH - 0.12) / 0.3, 0, 1);

    this.meadow.update(dt, cam);
    // from down the shaft only the sky shows through the hole: skip the meadow unless we look back up at it
    const lookY = cam.getWorldDirection(this._ld || (this._ld = new THREE.Vector3())).y;
    this.meadow.group.visible = cam.position.y > -2.5 || (cam.position.y > -9 && lookY > 0.2);
    this.shaft.update(dt);
    const wm = this.waterfall.mat.uniforms;
    wm.uTime.value = t;
    wm.uFog.value.copy(sc.fog.color);
    wm.uNear.value = sc.fog.near;
    wm.uFar.value = sc.fog.far;

    // surface life: leaves from the trees, pollen and butterflies in the sun
    if (t < T_DROP + 1) {
      if (Math.random() < dt * 3) this.debris.spawn({ pos: [-4.2 + (Math.random() - 0.5) * 3, 3.5 + Math.random(), -5.6 + (Math.random() - 0.5) * 3], vel: [0.5, -0.3, 0.6], life: 6, color: Math.random() < 0.6 ? 0x6ab448 : 0xc8b040, size: 0.07, gravity: 0.25, drag: 0.6, wobble: 0.8, spin: 5, shape: SHAPE.confetti });
      if (Math.random() < dt * 8) this.motes.spawn({ pos: [(Math.random() - 0.5) * 8, 0.3 + Math.random() * 2, -3 + (Math.random() - 0.5) * 6], vel: [0.1, 0.05, 0], life: 3, color: 0xfff2a0, size: 0.025, wobble: 0.3, flicker: 0.5 });
      if (Math.random() < dt * 1.5) this.motes.spawn({ pos: [(Math.random() - 0.5) * 6, 0.4 + Math.random() * 1.2, -2 + (Math.random() - 0.5) * 5], vel: [(Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.6], life: 4, color: Math.random() < 0.5 ? 0xffe066 : 0xff9ad0, size: 0.06, wobble: 1.2, flicker: 0.9, shape: SHAPE.diamond });
    }
    // the fall: dust and grit tumbling with them, drips by the waterfall, motes rushing past
    if (t >= T_DROP && t < T_CRASH) {
      const s = this.sim.at(t - T_DROP, this.simOut);
      const vy = s[3];
      if (Math.random() < dt * 14) this.debris.spawn({ pos: [C.x + (Math.random() - 0.5) * 1.6, C.y + (Math.random() - 0.3) * 2, C.z + (Math.random() - 0.5) * 1.6], vel: [(Math.random() - 0.5) * 0.4, vy * (0.9 + Math.random() * 0.2), (Math.random() - 0.5) * 0.4], life: 1.4, color: Math.random() < 0.5 ? 0x5a3e2a : 0x7a6a58, size: 0.03 + Math.random() * 0.04, gravity: 2, shape: SHAPE.square });
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 1.6;
        this.motes.spawn({ pos: [Math.cos(a) * r, cam.position.y - 6 - Math.random() * 6, Math.sin(a) * r], vel: [0, 0, 0], life: 2, color: C.y < FALL_ZONES.wet ? 0x9ad8ff : 0xffe8c0, size: 0.02 + Math.random() * 0.02, flicker: 0.4 });
      }
      const wf = this.waterfall;
      if (Math.abs(cam.position.y - (wf.top.y + wf.bottom.y) / 2) < 12) {
        for (let k = 0; k < 4; k++) {
          const src = k % 2 ? wf.bottom : wf.top;
          this.spray.spawn({ pos: [src.x + (Math.random() - 0.5) * 1.0, src.y + Math.random() * 0.3, src.z + (Math.random() - 0.5) * 1.0], vel: [(Math.random() - 0.5) * 1.6 - src.x * 0.3, Math.random() * 1.6, (Math.random() - 0.5) * 1.6 - src.z * 0.3], life: 1.3, color: 0xeaf6ff, color2: 0x9ac8e8, size: 0.04, size2: 0.12, alpha: 0.7, gravity: 2.5, drag: 1.2 });
        }
      }
    }
    for (const p of this.pools) p.update(dt);
    this.updateStreaks(t, cam);
  }

  updateStreaks(t, cam) {
    const fallSp = t >= T_DROP && t < T_CRASH ? clamp(-this.sim.at(t - T_DROP, this.simOut)[3] / 5.6, 0, 1) : 0;
    const cy = cam.position.y;
    for (let i = 0; i < this.streaks.length; i++) {
      const l = this.streaks[i];
      if (l.y > cy + 4 || l.y < cy - 16) {
        const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 1.5;
        l.x = Math.cos(a) * r; l.z = Math.sin(a) * r;
        l.y = cy - 3 - Math.random() * 12;
        l.a = 0.12 + Math.random() * 0.22;
      }
      const len = 0.3 + fallSp * 1.4;
      this.stPos.set([l.x, l.y, l.z, l.x, l.y + len, l.z], i * 6);
      const a = l.a * fallSp;
      this.stCol.set([1, 0.95, 0.85, 0, 1, 0.95, 0.85, a], i * 8);
    }
    this.stGeo.attributes.position.needsUpdate = true;
    this.stGeo.attributes.color.needsUpdate = true;
  }

  exit() {
    this.leaving = true;
    console.log(`[fall] shaft streamed: ${JSON.stringify(this.shaft.stats())}`);
    super.exit();
  }
}
