// The journey: up on the surface, at golden hour, the young blacksmith mole walks an old forest
// trail with Nugget's walking coop stomping along beside him, Nugget peeking out of its window.
// Ancient trees, ferns and bluebells, shafts of low sun, a squirrel, a rabbit, robins, a woodpecker,
// a frog at the stream (he takes the log bridge, the coop wades), and in a sunny clearing a roe doe
// grazing and a strange old chest glinting in a beam of light. He walks up to it; the lid creaks
// and gold light spills out over his face... the ground sags, cracks race over the clearing, roots
// snap, the birds burst from the trees, and the crust gives way: he tumbles down a dark shaft.
// Darkness, a heartbeat, muffled ringing: he blacks out. Ends with goto('home', { from: 'fall' }).
// ~42 s, skippable (Skip, Esc, a tap).
// Dev: ?scene=fall&at=secs to start later, &freeze=1 to stop time, &lite=1 for the phone forest (&lite=0: the full
// forest even on a software renderer, which otherwise gets the light one).
// Test hooks: scene.debug.{ at(secs), time(), shot(), state(), skip(), perf(), cam(pos, look, fov), hold(on) }.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { el, clamp, lerp } from '../core/util.js';
import { useBookendStyles } from '../bookends/css.js';
import { disposeTextures, setPixelScale, Particles, SHAPE, fitFov, makeBlobShadow, makeSheetSprite } from '../bookends/fx.js';
import { buildForest, FOREST, SUN_DIR, groundH, HOLE_R } from '../bookends/forest.js';
import { MF, swallowSheet } from '../bookends/meadowfx.js';
import { FA, setAir } from '../bookends/forest/atmos.js';
import { makeCritters } from '../bookends/forest/critters.js';
import { forestSounds } from '../bookends/forest/sound.js';
import { buildFallShaft } from '../bookends/fallshaft.js';
import { makeHeroMole } from '../gfx/char/hero.js';
import { loadCoop, heartbeat, muffle } from '../bookends/journey.js';

// the timeline (seconds): shots A..L
const T = { A: 0, B: 6.2, C: 10.4, D: 13.6, E: 15.6, F: 20.4, G: 24.8, H: 27.4, I: 29.6, I2: 31.3, J: 33.2, K: 34.8, L: 37.8, END: 42.4 };
const SHOTS = [T.A, T.B, T.C, T.D, T.E, T.F, T.G, T.H, T.I, T.I2, T.J, T.K, T.L];
const CAP = [0.9, 5.0];
const WALK = 1.05; // m/s
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ease = (a, b, x) => smooth((x - a) / (b - a));
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
/** Golden hour: warm highlights, cool blue-green shade. */
const GRADE = { lift: [0.0, 0.006, 0.022], gamma: [1.02, 1.0, 0.98], gain: [1.1, 1.01, 0.86] };
const DEEP = { lift: [0.005, 0.015, 0.04], gamma: [0.97, 1.0, 1.05], gain: [0.96, 1.0, 1.06] };
const mixG = (a, b, k) => ({ lift: a.lift.map((v, i) => lerp(v, b.lift[i], k)), gamma: a.gamma.map((v, i) => lerp(v, b.gamma[i], k)), gain: a.gain.map((v, i) => lerp(v, b.gain[i], k)) });

export default class FallScene extends Scene {
  async enter(params = {}) {
    const t0 = performance.now();
    this.ready = false; // (nothing is drawn until it's all built: the screen is faded out meanwhile)
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
    this.sag = 0;
    this.cur = { s: 0, cs: 0 };
    this.perfAcc = { n: 0, upd: 0, ren: 0, nu: 0 };
    forestSounds(this.game.audio);

    const sc = this.scene;
    this.haze = new THREE.Color(0xc8d4bc);
    this.dark = new THREE.Color(0x080605);
    sc.background = this.haze.clone();
    sc.fog = new THREE.Fog(this.haze.clone(), 30, 140); // the characters' fog (the forest has its own air)
    this.camera = new THREE.PerspectiveCamera(48, this.game.engine.aspect, 0.05, 220);
    setAir(0);

    // ---- while the forest grows (a few seconds on a phone): a quiet card and a way past it
    const loadSkip = el('button', { class: 'btn alt bk-skip', type: 'button', onclick: (e) => { e.stopPropagation(); this.pendingSkip = true; } }, 'Skip ›');
    this.loadCard = el('div', { class: 'bk-root bk-loading' }, [el('div', { class: 'bk-load' }, [el('i', { class: 'bk-load-leaf' }), el('span', {}, 'The forest stirs…')]), loadSkip]);
    this.game.ui.world.append(this.loadCard);
    this.own(() => this.loadCard?.remove());
    // ---- the forest (phones, 'Simple' shaders and software GL get a lighter one; ?lite=0 / 1 forces it)
    const soft = params.lite !== '0' && params.lite !== '1' && !!this.game.engine.softwareGL;
    const lite = params.lite === '1' || soft || (params.lite !== '0' && this.game.engine.fx !== 'high');
    this.lite = soft ? 'soft' : lite;
    this.F = await buildForest({ lite, soft, cancel: () => this.pendingSkip });
    this.textures.push(...this.F.textures);
    this.own(() => this.F.dispose());
    if (this.F.cancelled) { // skipped while it was still being built: straight on to waking up
      this.loadCard?.remove(); this.loadCard = null;
      this.debug = { at: () => this.t, time: () => this.t, shot: () => 0, skip: () => this.skip(), state: () => ({ t: this.t, skipped: true }), perf: () => ({}), cam: () => false, hold: () => false, tris: () => ({}) };
      return;
    }
    sc.add(this.F.group, this.F.sky);

    // ---- light: a low warm sun through the trees, sky and a cool fill
    this.hemi = new THREE.HemisphereLight(0xa8c4e0, 0x3a4424, 1.05);
    this.sun = new THREE.DirectionalLight(0xffc27a, 3.0);
    this.sun.position.copy(SUN_DIR).multiplyScalar(30);
    this.fill = new THREE.DirectionalLight(0x9ab4e0, 0.35);
    this.fill.position.set(0.5, 0.6, 1).multiplyScalar(30);
    // gold from the chest (on his face), and the daylight that falls down the shaft with him
    this.chestLight = new THREE.PointLight(0xffb848, 0, 4.5, 1.6);
    this.chestLight.position.set(0, 0.5, 0.1);
    this.fallLight = new THREE.PointLight(0xffd8a8, 0, 7, 1.4);
    sc.add(this.hemi, this.sun, this.fill, this.chestLight, this.fallLight);

    // ---- the travellers
    this.hero = makeHeroMole({ height: 0.86 });
    this.heroPivot = new THREE.Group(); // tumbling happens round his middle
    this.heroPivot.add(this.hero.root);
    this.hero.root.position.y = -0.42;
    sc.add(this.heroPivot);
    this.own(() => this.hero.dispose());
    this.heroShadow = makeBlobShadow(0.32, 0.26, 0.5);
    sc.add(this.heroShadow);
    this.coop = await loadCoop({ height: 1.15 });
    sc.add(this.coop.root);
    this.own(() => this.coop.dispose?.());
    this.coop.onStep = (side, k) => this.coopStep(side, k);
    if (!this.coop.isPlaceholder) console.log('[fall] using the coop model');

    // ---- the forest's animals
    this.critters = makeCritters(this.F, { lite });
    sc.add(this.critters.group);
    this.own(() => this.critters.dispose());

    // ---- the chest's light: shafts of gold rising out of it (faded in at the chest moment)
    this.chestBeams = [
      this.F.addBeam(new THREE.Vector3(0.05, 2.6, -0.2), new THREE.Vector3(0, 0.32, -0.12), 0.55, 0, 0xffd070),
      this.F.addBeam(new THREE.Vector3(-0.5, 2.2, -0.5), new THREE.Vector3(-0.08, 0.32, -0.15), 0.3, 0, 0xffe090),
      this.F.addBeam(new THREE.Vector3(0.55, 2.3, -0.35), new THREE.Vector3(0.08, 0.32, -0.12), 0.32, 0, 0xffc860),
    ];

    // ---- the shaft under the clearing (streams in while they walk)
    this.shaft = buildFallShaft({ floorY: -60, ledges: [], waterfall: null, land: { x: 0, z: 0, a: 0 } });
    sc.add(this.shaft.group);
    this.shaft.ensure(-3);

    // ---- particles
    this.dust = new Particles({ max: 600, additive: false, atten: true });
    this.debris = new Particles({ max: 500, additive: false, atten: true });
    this.motes = new Particles({ max: 500, additive: true, atten: true });
    this.flies = new Particles({ max: 120, additive: true, atten: true });
    this.leaves = new Particles({ max: 260, additive: false, atten: true });
    this.splash = new Particles({ max: 300, additive: false, atten: true });
    this.coins = new Particles({ max: 260, additive: false, atten: true });
    this.gold = new Particles({ max: 260, additive: true, atten: true });
    this.flock = new Particles({ max: 60, additive: false, atten: true });
    this.pools = [this.dust, this.debris, this.motes, this.flies, this.leaves, this.splash, this.coins, this.gold, this.flock];
    for (const p of this.pools) sc.add(p.points);
    // the birds that burst out of the trees when the ground goes (flapping sprites)
    const sw = swallowSheet();
    this.textures.push(sw.texture);
    this.flockBirds = [];
    for (let i = 0; i < 16; i++) {
      const m = makeSheetSprite(sw.texture, { cols: sw.cols, size: [0.5, 0.5 / sw.aspect], anchor: [0.5, 0.5], renderOrder: 6, tint: i % 3 ? 0x8a8070 : 0xffffff });
      const a = 0.6 + (i / 16) * 1.9 + Math.random() * 0.2; // out of the trees behind the coop, across the open sky
      m.userData = { ...m.userData, a, r: 7.5 + Math.random() * 4, h: 4.5 + Math.random() * 4, sp: 2.2 + Math.random() * 1.6, up: 1.4 + Math.random() * 1.2, ph: Math.random() * 4 };
      m.visible = false;
      this.flockBirds.push(m);
      sc.add(m);
    }
    this.own(() => { for (const b of this.flockBirds) b.material.dispose(); });

    // ---- DOM: caption, letterbox bars, skip
    this.caption = el('div', { class: 'bk-caption bk-outline' }, ['Far above the Deep', el('small', {}, 'an old forest trail, late in the day')]);
    this.bars = el('div', { class: 'bk-bars' }, [el('i'), el('i')]);
    this.skipBtn = el('button', { class: 'btn alt bk-skip', type: 'button', onclick: (e) => { e.stopPropagation(); this.skip(); } }, 'Skip ›');
    this.root = el('div', { class: 'bk-root bk-fall' }, [this.bars, this.caption, this.skipBtn]);
    this.game.ui.world.append(this.root);
    this.own(() => this.root.remove());
    const onKey = (e) => { if (e.code === 'Escape') this.skip(); };
    const onTap = (e) => { if (this.t > 0.8 && !(e.target && e.target.closest && e.target.closest('button'))) this.skip(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onTap);
    this.own(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onTap); });
    requestAnimationFrame(() => this.bars.classList.add('on'));

    Object.assign(this.post, {
      outlineFar: 26, vignette: 0.28, saturation: 1.12, contrast: 1.12, grade: GRADE, gradeMix: 1,
      bloom: 0.6, bloomThreshold: 0.8, rays: 1, raysDir: SUN_DIR, raysSky: 1, raysThreshold: 0.84, raysColor: 0xffd49a, raysRadius: 0.5, raysDecay: 0.966,
    });
    if (soft) this.post.outline = false; // (a software rasterizer can't afford the outline pass)
    this.onResize(this.game.engine.width, this.game.engine.height);
    this.place(0, 0);
    // frame the opening shot now: the fade-in draws a few frames before the first update
    this.updateCamera(0, 0);
    this.updateWorld(0, 0);
    await this.precompile();
    this.buildMs = Math.round(performance.now() - t0);
    this.ready = true;
    this.loadCard?.remove(); this.loadCard = null;
    // build Old Star's camp in the background while the journey plays, so waking up doesn't wait
    import('../home/houseLoad.js').then((m) => m.prebuildHouse?.(this.game)).catch(() => {});
    console.log(`[fall] built in ${this.buildMs} ms (forest ${JSON.stringify(this.F.stats)})`);

    this.debug = {
      at: (secs) => { const k = Math.max(0, secs - this.t); const fr = this.frozen; this.frozen = false; for (let s = 0; s < k; s += 1 / 30) this.update(1 / 30); this.frozen = fr; return this.t; },
      time: () => this.t,
      shot: () => this.shotIndex,
      skip: () => this.skip(),
      state: () => ({ t: this.t, shot: this.shotIndex, hero: this.hero.state, sag: this.sag, s: this.cur.s, coop: !this.coop.isPlaceholder }),
      perf: () => this.perf(),
      hold: (on = true) => { this.hold = on ? 1 : 0; return on; },
      /** Visible triangles by part (in the view, after the distance cull; colour pass only). */
      tris: () => {
        const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
        const out = {};
        const sph = new THREE.Sphere();
        this.scene.traverseVisible((o) => {
          if (!o.isMesh || !o.geometry) return;
          const g = o.geometry;
          if (!g.boundingSphere) g.computeBoundingSphere?.();
          if (o.frustumCulled !== false && g.boundingSphere) { sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(sph)) return; }
          const n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : g.instanceCount ?? 1);
          const key = o.name || o.parent?.name || o.material?.type || 'mesh';
          out[key] = (out[key] || 0) + Math.round(n);
        });
        return out;
      },
      cam: (pos, look, fov = 46) => { this.pin = pos ? { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov } : null; this.updateCamera(this.t, 0); return !!this.pin; },
    };
    const at = parseFloat(params.at) || 0;
    if (at > 0) this.debug.at(at);
    this.frozen = !!params.freeze;
  }

  /**
   * Compile every shader the journey will need now, while the screen is dark, so nothing stutters
   * later when the cracks, the shaft, the flock or the gold appear: everything shown, and both the
   * colour pass and the outline-mask pass (which draws without fog).
   */
  async precompile() {
    const r = this.game.engine.renderer, sc = this.scene, cam = this.camera;
    const hidden = [];
    sc.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    // a few meshes at a time, yielding in between (without parallel shader compiles a software
    // renderer would otherwise block the page for a long while)
    const meshes = [];
    sc.traverse((o) => { if ((o.isMesh || o.isPoints) && o.material) meshes.push(o); });
    const seen = new Set();
    const fog = sc.fog;
    for (const withFog of [true, false]) {
      sc.fog = withFog ? fog : null;
      let n = 0;
      for (const m of meshes) {
        const key = (withFog ? 'f' : 'n') + m.material.uuid + (m.isInstancedMesh ? 'i' : '') + (m.isSkinnedMesh ? 's' : '');
        if (seen.has(key)) continue;
        seen.add(key);
        try { r.compile(m, cam, sc); } catch (e) { /* optional */ }
        await new Promise((res) => setTimeout(res, 0));
        n++;
      }
    }
    sc.fog = fog;
    for (const o of hidden) o.visible = false;
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

  skip() {
    if (this.leaving) return;
    if (this.game.transitioning) { this.pendingSkip = true; return; }
    this.sfx('whoosh');
    this.leave(0.35);
  }

  leave(dur = 0.3) {
    if (this.leaving) return;
    this.leaving = true;
    this.unmuffle?.();
    this.game.goto('home', { from: 'fall' }, { transition: 'fade', dur });
  }

  render() {
    // still building: draw nothing but black (cheap), so no stale frame of the last scene lingers
    if (!this.ready) { if (this.camera) this.game.engine.render(this._blank || (this._blank = new THREE.Scene()), this.camera, { outline: false, bloom: 0, rays: 0, fade: 1 }); return; }
    // debug.hold(): draw one more frame, then keep it (screenshots on a slow software renderer)
    if (this.hold === 2) return;
    if (this.hold === 1) this.hold = 2;
    const a = performance.now();
    this.game.engine.render(this.scene, this.camera, this.post);
    this.perfAcc.ren += performance.now() - a;
    this.perfAcc.n++;
  }

  /** Frame cost: CPU ms per update and per render call (averaged since the last call), draw calls and triangles of one frame. */
  perf() {
    const r = this.game.engine.renderer;
    r.info.autoReset = false; r.info.reset();
    this.game.engine.render(this.scene, this.camera, this.post);
    const out = { calls: r.info.render.calls, tris: r.info.render.triangles, lite: this.lite, buildMs: this.buildMs };
    r.info.autoReset = true;
    const A = this.perfAcc;
    if (A.nu) out.updateMs = +(A.upd / A.nu).toFixed(2);
    if (A.n) out.renderMs = +(A.ren / A.n).toFixed(2);
    this.perfAcc = { n: 0, upd: 0, ren: 0, nu: 0 };
    return out;
  }

  onResize(w, h) {
    setPixelScale(h);
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  exit() {
    this.leaving = true;
    this.unmuffle?.();
    MF.uWind.value.set(0.82, 0.57);
    setAir(0);
    super.exit();
  }

  // ------------------------------------------------------------------ where everyone is
  /** The hero's trail position s (m) at time t; cuts jump ahead along the trail. */
  heroS(t) {
    const L = FOREST.trail.length, X = FOREST.trail.cross.s;
    if (t < T.E) return 6.5 + WALK * t;
    if (t < T.F) return X - 3.0 + WALK * (t - T.E);
    // into the clearing, slowing to a stop when he sees it...
    if (t < T.F + 3.2) return L - 8 + 4.4 * (1 - Math.pow(1 - (t - T.F) / 3.2, 1.6));
    // ...a long look, then slowly up to the chest: he stops right at the spill
    return lerp(L - 3.6, L - 0.05, ease(T.F + 4.0, T.G + 2.4, t));
  }
  /** The coop's s: a step behind; it hangs back at the clearing's edge. */
  coopS(t) {
    const L = FOREST.trail.length;
    if (t < T.F) return this.heroS(t) - 0.85;
    return Math.min(this.heroS(t) - 0.85, L - 5.0 + (t > T.I + 1.2 ? -0.7 * ease(T.I + 1.2, T.I + 2.2, t) : 0));
  }

  /** Put the hero and the coop where they belong at time t (dt drives their animation). */
  place(t, dt) {
    const hero = this.hero, coop = this.coop, tr = FOREST.trail;
    const s = this.heroS(t), cs = this.coopS(t);
    const vH = dt > 0 ? (s - this.cur.s) / dt : 0, vC = dt > 0 ? (cs - this.cur.cs) / dt : 0;
    const jump = Math.abs(s - this.cur.s) > 1; // a cut
    this.cur.s = s; this.cur.cs = cs;
    const P = tr.at(s), Q = tr.at(cs);
    const fallen = t >= T.J;
    // the hero: a little left of the middle of the trail
    if (!fallen) {
      const off = t < T.F ? -0.22 : -0.22 * (1 - ease(T.F, T.F + 2.5, t));
      const x = P.x - P.tz * off, z = P.z + P.tx * off;
      let y = groundH(x, z);
      const B = FOREST.bridge;
      if (B && Math.abs(s - B.s) < B.half + 0.2) y = Math.max(y, B.y - Math.sin(clamp(1 - Math.abs(s - B.s) / B.half, 0, 1) * Math.PI / 2) * 0.05);
      if (Math.hypot(x, z) < HOLE_R + 0.3) y -= this.sag * 0.13; // on the crust: he sinks with it
      this.heroPivot.position.set(x, y + 0.42, z);
      this.heroPivot.rotation.set(0, 0, 0);
      const speed = jump ? WALK : Math.abs(vH);
      const walking = t < T.F + 3.2 || (t > T.F + 4.0 && t < T.G + 2.4);
      if (walking) {
        if (speed > 0.12) { hero.play('walk', clamp(speed / WALK, 0.55, 1.25)); hero.face(P.yaw); }
        else if (hero.state === 'walk') hero.play('idle');
      }
    }
    hero.update(dt);
    // his shadow: a soft blob on the ground (shrinks as he drops away)
    {
      const H = this.heroPivot.position;
      const onCrust = Math.hypot(H.x, H.z) < HOLE_R + 0.3;
      const gy = fallen ? -0.98 : groundH(H.x, H.z) - (onCrust ? this.sag * 0.13 : 0);
      const B = FOREST.bridge;
      const by = !fallen && B && Math.abs(this.cur.s - B.s) < B.half + 0.2 ? Math.max(gy, H.y - 0.42) : gy;
      const up = clamp((H.y - 0.42 - by) / 1.5, 0, 1);
      this.heroShadow.position.set(H.x, by + 0.02, H.z);
      this.heroShadow.scale.setScalar(1 - up * 0.6);
      this.heroShadow.visible = !fallen;
    }
    // the coop: on the right, a step behind, wading beside the bridge
    {
      const off = t < T.F ? 0.75 : lerp(0.75, 1.35, ease(T.F, T.F + 3, t));
      const x = Q.x - Q.tz * off, z = Q.z + Q.tx * off;
      coop.root.position.set(x, groundH(x, z), z);
      const sp = jump ? WALK : Math.abs(vC);
      if (!this.coopFace) coop.face(Q.yaw, jump);
      coop.update(dt, { speed: sp, moving: sp > 0.05 });
      // Nugget watches a butterfly by her window
      const hen = coop.hen;
      if (hen && hen.head && this.henLook) { hen.head.rotation.y = this.henLook.y; hen.head.rotation.x = this.henLook.x; }
    }
    return P;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const a = performance.now();
    if (this.frozen) dt = 0;
    super.update(dt);
    if (this.leaving) return;
    if (this.pendingSkip) { this.pendingSkip = false; this.skip(); return; }
    const t = (this.t += dt);
    // the shaft walls stream in a few ms a frame while they walk; they must be ready for the fall
    this.shaft.prebuild(t < T.I ? 2 : 3);
    if (t > T.I) this.shaft.ensure(-14);
    if (t > T.J) this.shaft.ensure(Math.max(-40, Math.min(this.camera.position.y, this.heroPivot.position.y) - 12));
    this.story(t, dt);
    this.place(t, dt);
    this.updateFall(t, dt);
    this.updateCamera(t, dt);
    this.updateWorld(t, dt);
    if (t >= T.END) this.leave(0.4);
    this.perfAcc.upd += performance.now() - a;
    this.perfAcc.nu++;
  }

  // ------------------------------------------------------------------ the story beats
  story(t, dt) {
    const au = this.game.audio;
    this.once('amb', 0, () => { this.loop('forest_leaves', 0.5); });
    this.once('cap', CAP[0], () => this.caption.classList.add('on'));
    this.once('capoff', CAP[1], () => this.caption.classList.remove('on'));
    // birdsong: a busy evening chorus while they walk, thinning out in the clearing
    this.birdT = (this.birdT ?? 0.5) - dt;
    if (t < T.I && this.birdT <= 0) {
      this.birdT = (t < T.F ? 0.9 : 2.2) + Math.random() * 2.2;
      const kinds = ['trill', 'robin', 'trill', 'wren', 'robin', 'cuckoo', 'dove'];
      this.sfx('forest_song', { kind: kinds[(Math.random() * kinds.length) | 0], pan: Math.random() * 1.6 - 0.8, pitch: 0.85 + Math.random() * 0.35, vol: 0.022 + Math.random() * 0.02 });
    }
    this.once('cluck1', 2.4, () => this.sfx('cluck', { n: 2 }));
    this.once('nod', 8.4, () => this.hero.doEmote('nod', 1));
    // Nugget's close-up: she spots a butterfly, follows it, clucks
    this.once('henfly', T.C + 0.3, () => { this.henFly = { t0: t }; });
    this.once('cluck2', T.C + 1.4, () => { this.sfx('cluck', { n: 3, pitch: 1.15 }); });
    this.once('peck', T.C + 2.5, () => this.coop.peck?.());
    // the bridge: planks thud under him, the coop splashes through
    this.once('bridge', T.E + 1.2, () => { this.sfx('cluck', { n: 1 }); });
    // the clearing: something glitters
    this.once('glint', T.F + 1.2, () => { this.sfx('sparkle', { vol: 0.6 }); this.hero.doEmote('surprise', 1.3); this.glint = true; });
    this.once('stop', T.F + 3.2, () => { this.hero.play('peer'); this.hero.look(0, 0.1); });
    this.once('bawk', T.F + 3.5, () => { this.sfx('bawk'); this.coop.shake?.(1); });
    this.once('walk2', T.F + 4.0, () => this.hero.look(0, 0));
    this.once('cluckno', T.G + 0.4, () => { this.sfx('cluck', { n: 4, pitch: 1.25 }); this.coop.hop?.(); });
    // the chest: the lid creaks wider and gold light pours out
    this.once('lid', T.G + 0.8, () => { this.sfx('forest_chest'); this.lidOpen = t; });
    this.once('chord', T.G + 1.1, () => { this.sfx('forest_chord', { vol: 0.05 }); this.sfx('coins', { n: 5 }); });
    this.once('reach', T.H + 1.3, () => this.hero.play('reach'));
    this.once('chime', T.H + 1.6, () => this.sfx('sparkle', { vol: 0.8 }));
    // the ground goes
    this.once('creak', T.I, () => { this.sfx('creak'); this.sfx('forest_groan', { vol: 0.06 }); this.loop('rumble', 0.5); au.stopMusic(1.4); this.shake = 0.015; this.hero.play('idle'); this.hero.look(0, 0.35); });
    this.once('crack1', T.I + 0.6, () => { this.sfx('crack'); this.sfx('rumble_hit'); this.hero.doEmote('surprise', 2); this.hero.play('brace'); this.F.cracks.mesh.visible = true; this.crack = true; this.gust = 1; });
    this.once('flock', T.I + 0.55, () => { this.burstFlock(); this.sfx('forest_flock'); });
    this.once('bawk2', T.I + 0.9, () => { this.sfx('bawk', { pitch: 1.1 }); this.coop.hop?.(); this.coop.shake?.(1.5); this.coop.hen?.flap?.(1.2); });
    this.once('bawk2b', T.I + 0.25, () => { this.coop.hen?.flap?.(0.6); this.coop.shake?.(0.8); });
    [1.3, 1.95, 2.5, 3.05].forEach((d, i) => this.once('snap' + i, T.I + d, () => this.snapRoot(i)));
    this.once('crack2', T.I + 1.7, () => { this.sfx('crack'); this.sfx('trickle'); this.shake = 0.05; });
    this.once('look', T.I + 2.2, () => { this.hero.look(-0.4, 0.3); this.sfx('squeak'); });
    this.once('crack3', T.I + 2.9, () => { this.sfx('crack'); this.sfx('debris'); this.sfx('forest_groan', { vol: 0.07, pitch: 0.8 }); this.shake = 0.08; });
    this.once('break', T.J, () => this.breakGround());
    this.once('bawk3', T.J + 0.5, () => this.sfx('bawk', { pitch: 1.2 }));
    this.once('coopturn', T.J + 0.3, () => { // the coop wheels round to stare down the hole
      this.coopFace = true;
      const c = this.coop.root.position;
      this.coop.face(Math.atan2(-c.x, -c.z));
      this.coop.hop?.();
      this.coop.hen?.flap?.(1.2);
    });
    this.once('whoosh', T.J + 0.4, () => { this.sfx('whoosh'); this.loop('wind', 0.6); this.loop('forest_leaves', 0); });
    this.once('deb', T.K + 0.6, () => this.sfx('debris'));
    this.once('dark', T.K + 1.2, () => { this.unmuffle = muffle(au, 360); this.loop('rumble', 0); });
    this.once('thud', T.L - 0.25, () => { this.sfx('thud', { vol: 1 }); this.sfx('land', { hard: true }); this.loop('wind', 0); });
    // knocked out: the heart thumps in the dark, slowing
    const beats = [T.L + 0.5, T.L + 1.55, T.L + 2.7, T.L + 3.95];
    beats.forEach((b, i) => this.once('beat' + i, b, () => heartbeat(au, 0.5 - i * 0.08)));
    // the sagging ground and the cracks
    if (t >= T.I && t < T.J) {
      const k = ease(T.I, T.J, t);
      this.sag = k * k;
      this.F.cracks.uniforms.uReveal.value = ease(T.I + 0.55, T.J - 0.3, t);
      if (Math.random() < dt * 30) this.crackDust();
    }
  }

  coopStep(side, k = 1) {
    const c = this.coop.root.position;
    const wet = groundH(c.x, c.z) < -0.45;
    if (this.t > T.I + 3) return;
    const ry = this.coop.root.rotation.y, o = side ? 0.16 : -0.16;
    const fx = Math.cos(ry) * o, fz = -Math.sin(ry) * o;
    if (wet) {
      this.sfx('splash', { vol: 0.6 });
      for (let i = 0; i < 18; i++) this.splash.spawn({ pos: [c.x + fx + (Math.random() - 0.5) * 0.3, -0.47, c.z + fz + (Math.random() - 0.5) * 0.3], vel: [(Math.random() - 0.5) * 1.4, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 1.4], life: 0.9, color: 0xf0f8ff, color2: 0x8ac0e0, size: 0.035, size2: 0.02, gravity: 9, shape: SHAPE.square });
    } else {
      this.sfx('step', { mat: 'dirt', vol: 0.8 * k });
      const gy = groundH(c.x + fx, c.z + fz);
      for (let i = 0; i < 8; i++) this.dust.spawn({ pos: [c.x + fx + (Math.random() - 0.5) * 0.3, gy + 0.03, c.z + fz + (Math.random() - 0.5) * 0.3], vel: [(Math.random() - 0.5) * 0.6, 0.12 + Math.random() * 0.28, (Math.random() - 0.5) * 0.6], life: 1.1, color: 0xb89a74, color2: 0x8a7458, size: 0.035, size2: 0.09, alpha: 0.45, drag: 2, shape: i % 2 ? SHAPE.square : SHAPE.round });
      if (k > 0.5) for (let i = 0; i < 3; i++) this.leaves.spawn({ pos: [c.x + fx, gy + 0.04, c.z + fz], vel: [(Math.random() - 0.5) * 0.8, 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8], life: 1.2, color: [0xa86a32, 0x8a7a3a, 0x6a8a3a][i], size: 0.03, gravity: 3, drag: 1, spin: 8, shape: SHAPE.confetti });
    }
  }

  /** A footfall of his: dust off the dirt, a hollow knock on the bridge, a leaf kicked up in the litter. */
  heroStep(side) {
    const H = this.heroPivot.position, B = FOREST.bridge;
    const onBridge = B && Math.abs(this.cur.s - B.s) < B.half;
    this.sfx('step', { mat: onBridge ? 'wood' : 'dirt', vol: 0.7 });
    if (onBridge) return;
    const P = FOREST.trail.at(this.cur.s);
    const sx = -P.tz * (side ? 0.09 : -0.09), sz = P.tx * (side ? 0.09 : -0.09);
    const gy = groundH(H.x, H.z);
    for (let i = 0; i < 5; i++) this.dust.spawn({ pos: [H.x + sx + (Math.random() - 0.5) * 0.12, gy + 0.03, H.z + sz + (Math.random() - 0.5) * 0.12], vel: [(Math.random() - 0.5) * 0.35 - P.tx * 0.15, 0.1 + Math.random() * 0.2, (Math.random() - 0.5) * 0.35 - P.tz * 0.15], life: 0.9, color: 0xb89a74, color2: 0x8a7458, size: 0.025, size2: 0.06, alpha: 0.42, drag: 2.2, shape: i % 2 ? SHAPE.square : SHAPE.round });
    if (Math.random() < 0.35) this.leaves.spawn({ pos: [H.x + sx, gy + 0.04, H.z + sz], vel: [(Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5], life: 1.2, color: Math.random() < 0.5 ? 0xa86a32 : 0x8a7a3a, size: 0.03, gravity: 3, drag: 1, spin: 8, shape: SHAPE.confetti });
  }

  crackDust() {
    const tips = this.F.cracks.tips(this.F.cracks.uniforms.uReveal.value);
    const p = tips.length ? tips[(Math.random() * tips.length) | 0] : null;
    if (p) for (let i = 0; i < 3; i++) this.dust.spawn({ pos: [p.x, 0.04, p.z], vel: [(Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5], life: 1.3, color: 0xa88a66, color2: 0x7a6248, size: 0.04, size2: 0.13, alpha: 0.45, drag: 1.6, shape: SHAPE.round });
    // grit trickling into the gaps between the crust pieces
    const a = Math.random() * Math.PI * 2, r = Math.random() * HOLE_R;
    this.debris.spawn({ pos: [Math.cos(a) * r, -this.sag * 0.1, Math.sin(a) * r], vel: [0, -0.3, 0], life: 1.4, color: Math.random() < 0.5 ? 0x5a3e2a : 0x7a6a58, size: 0.025, gravity: 6, shape: SHAPE.square });
  }

  /** A root under the turf tears: splinters and a spurt of soil from the crack. */
  snapRoot(i) {
    const a = 0.8 + i * 1.55, r = HOLE_R + 0.1;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    this.sfx('forest_snap', { vol: 0.32 });
    this.shake = Math.max(this.shake, 0.04);
    for (let k = 0; k < 14; k++) this.debris.spawn({ pos: [x, 0.03, z], vel: [Math.cos(a) * 0.4 + (Math.random() - 0.5) * 1.2, 1 + Math.random() * 1.6, Math.sin(a) * 0.4 + (Math.random() - 0.5) * 1.2], life: 1.2, color: k % 3 ? 0x9a7650 : 0xc8a070, size: 0.03, size2: 0.02, gravity: 8, spin: 10, shape: k % 2 ? SHAPE.confetti : SHAPE.square });
    for (let k = 0; k < 10; k++) this.dust.spawn({ pos: [x, 0.05, z], vel: [(Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6], life: 1.6, color: 0xa88a66, color2: 0x6a5440, size: 0.05, size2: 0.18, alpha: 0.4, drag: 1.5, shape: SHAPE.round });
  }

  /** The birds burst out of the trees round the clearing and wheel away; the canopy sheds leaves. */
  burstFlock() {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, r = 7 + Math.random() * 5;
      this.flock.spawn({ pos: [Math.cos(a) * r, 5 + Math.random() * 4, Math.sin(a) * r], vel: [Math.cos(a) * (2 + Math.random() * 2), 2.5 + Math.random() * 2, Math.sin(a) * (2 + Math.random() * 2)], life: 4, color: Math.random() < 0.5 ? 0x2a2420 : 0x4a3a30, size: 0.09, gravity: -0.4, drag: 0.1, wobble: 1.2, spin: 20, shape: SHAPE.confetti });
    }
    for (const b of this.flockBirds) { b.visible = true; b.userData.t = 0; }
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 6;
      this.leaves.spawn({ pos: [Math.cos(a) * r, 4 + Math.random() * 5, Math.sin(a) * r], vel: [(Math.random() - 0.5) * 0.6, -0.3, (Math.random() - 0.5) * 0.6], life: 6, color: [0x8aac48, 0xb8b048, 0xd89040, 0x6a9a3a][i % 4], size: 0.05, gravity: 0.25, drag: 0.8, wobble: 1, spin: 6, shape: SHAPE.confetti });
    }
  }

  breakGround() {
    this.sfx('collapse', { vol: 1 });
    this.sfx('break', { vol: 1 });
    this.sfx('crack');
    this.sfx('rumble_hit');
    this.sfx('forest_snap', { vol: 0.45 });
    this.shake = 0.16;
    this.post.flash = 0.25;
    this.post.flashColor = 0xfff2d8;
    this.hero.play('fall');
    this.hero.doEmote('surprise', 3);
    this.fallStart = { y: this.heroPivot.position.y, x: this.heroPivot.position.x, z: this.heroPivot.position.z };
    for (const p of this.F.crust) {
      const out = p.home.clone().setY(0);
      const r = out.length();
      out.normalize();
      p.vel = new THREE.Vector3(-out.x * (0.2 + Math.random() * 0.4), -0.6 - Math.random() * 1.2 - (1 - r / HOLE_R) * 0.8, -out.z * (0.2 + Math.random() * 0.4));
      p.spin = new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 3);
    }
    this.chestFall = { vy: -0.4, spin: 1.6 };
    this.F.spill.mesh.visible = false;
    // the spill bursts into a shower of coins and gems
    for (let i = 0; i < 150; i++) {
      const gem = i % 9 === 0;
      this.coins.spawn({
        pos: [(Math.random() - 0.5) * 0.8, 0.05 + Math.random() * 0.2, 0.1 + Math.random() * 0.8],
        vel: [(Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 2.4, (Math.random() - 0.5) * 1.6 - 0.4],
        life: 3.2, color: gem ? [0xff5a7a, 0x5ae0ff, 0x7aff8a][i % 3] : Math.random() < 0.5 ? 0xffd040 : 0xf2b030, color2: gem ? 0xffffff : 0xa86a10,
        size: gem ? 0.045 : 0.04, gravity: 9.8, spin: 12, shape: gem ? SHAPE.diamond : SHAPE.confetti,
      });
    }
    for (let i = 0; i < 110; i++) {
      const a = Math.random() * Math.PI * 2, r = HOLE_R * (0.8 + Math.random() * 0.4);
      this.dust.spawn({ pos: [Math.cos(a) * r, 0.05, Math.sin(a) * r], vel: [Math.cos(a) * 0.5, 0.4 + Math.random() * 1.4, Math.sin(a) * 0.5], life: 2.2, color: 0xa88a66, color2: 0x6a5440, size: 0.05, size2: 0.2, alpha: 0.38, drag: 1.4, shape: SHAPE.round });
    }
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * HOLE_R;
      const leaf = i % 3 === 0;
      this.debris.spawn({ pos: [Math.cos(a) * r, 0.02, Math.sin(a) * r], vel: [(Math.random() - 0.5) * 1.2, leaf ? 1 : -Math.random() * 2, (Math.random() - 0.5) * 1.2], life: 2.6, color: leaf ? 0x6ab448 : Math.random() < 0.6 ? 0x5a3e2a : 0x3e5a2a, size: leaf ? 0.05 : 0.045, gravity: leaf ? 1.5 : 9, drag: leaf ? 1 : 0.2, spin: leaf ? 6 : 0, shape: leaf ? SHAPE.confetti : SHAPE.square });
    }
    this.F.cracks.uniforms.uReveal.value = 1;
  }

  /** The crust sagging and falling, the chest tumbling, the hero dropping into the dark. */
  updateFall(t, dt) {
    const F = this.F;
    for (const p of F.crust) {
      if (!p.vel) {
        const r = p.home.length();
        const k = this.sag;
        const tremble = t > T.I ? (Math.random() - 0.5) * 0.006 * (1 + k * 3) : 0;
        p.mesh.position.set(p.home.x * (1 - k * 0.02), -k * 0.13 * (1 - (r / HOLE_R) * 0.55) + tremble, p.home.z * (1 - k * 0.02));
        const ax = r > 0.05 ? -p.home.z / r : 0, az = r > 0.05 ? p.home.x / r : 0;
        p.mesh.rotation.set(ax * k * 0.16 * (r / HOLE_R), 0, az * k * 0.16 * (r / HOLE_R) * -1);
        continue;
      }
      p.vel.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt; p.mesh.rotation.y += p.spin.y * dt; p.mesh.rotation.z += p.spin.z * dt;
      if (p.mesh.position.y < -26) p.mesh.visible = false;
    }
    // the chest rides the middle piece down, then tumbles; its lid creaks wider at the chest moment
    const ch = F.chest.group;
    if (!this.chestFall) {
      ch.position.y = -this.sag * 0.13;
      ch.rotation.z = Math.sin(t * 31) * 0.01 * this.sag;
      F.spill.mesh.position.y = -this.sag * 0.11;
      F.spill.mesh.rotation.x = -this.sag * 0.12;
      const lk = this.lidOpen != null ? ease(this.lidOpen, this.lidOpen + 1.2, t) : 0;
      F.chest.lidPivot.rotation.x = -1.15 - lk * 0.5 + Math.sin(lk * Math.PI * 3) * 0.05 * (1 - lk);
    } else {
      const c = this.chestFall;
      c.vy -= 9.8 * dt;
      ch.position.y += c.vy * dt;
      ch.rotation.x += c.spin * dt;
      F.chest.lidPivot.rotation.x = -1.15 - Math.sin(t * 14) * 0.5;
      if (ch.position.y < -30) ch.visible = false;
    }
    F.chestGlow.position.set(ch.position.x, ch.position.y + 0.45, ch.position.z);
    this.chestLight.position.set(ch.position.x, ch.position.y + 0.55, ch.position.z + 0.15);
    // the hero: free fall, tumbling, drifting to the middle of the shaft
    if (this.fallStart) {
      const tau = t - T.J;
      const P = this.heroPivot.position;
      const fs = this.fallStart;
      const vt = 5.5, g = 9.8;
      const drop = (vt * vt / g) * Math.log(Math.cosh((g * tau) / vt));
      P.set(lerp(fs.x, 0.1, smooth(tau / 1.2)), fs.y - drop, lerp(fs.z, 0.15, smooth(tau / 1.2)));
      this.heroPivot.rotation.set(-tau * 2.6, tau * 0.7, Math.sin(tau * 3) * 0.6);
    }
  }

  // ------------------------------------------------------------------ camera
  /** Shot i at time t into o = { pos, look, fov, roll, minH } (minH: the narrowest horizontal fov on tall screens). */
  shot(i, t, o) {
    const H = this.heroPivot.position, C = this.coop.root.position;
    const tr = FOREST.trail;
    const portrait = this.camera.aspect < 0.9;
    o.roll = 0; o.fov = 46; o.minH = portrait ? 34 : 46;
    switch (i) {
      case 0: { // up in the canopy, the low sun pouring through the leaves; craning down to the pair walking away up the trail into the light
        const u = ease(T.A + 0.2, T.B - 0.2, t);
        const P = tr.at(this.cur.s);
        const back = lerp(5.4, 3.3, u);
        o.pos.set(H.x - P.tx * back + P.tz * 0.2, lerp(3.4, H.y + 0.62, Math.pow(u, 0.9)), H.z - P.tz * back - P.tx * 0.2);
        // up the trail into the golden haze where the light pours through, then down to them
        const far = tr.at(this.cur.s + 16), ahead = tr.at(this.cur.s + 7);
        o.look.set(lerp(far.x, ahead.x * 0.6 + H.x * 0.4, u), lerp(far.y + 3.6, H.y + 0.32, Math.pow(u, 0.8)), lerp(far.z, ahead.z * 0.6 + H.z * 0.4, u));
        o.fov = lerp(50, 44, u);
        o.minH = portrait ? 40 : 46;
        break;
      }
      case 1: { // tracking with them from his left, low, ferns sliding past in front
        const P = tr.at(this.cur.s + 1.2);
        const u = (t - T.B) / (T.C - T.B);
        const side = lerp(2.1, 1.7, u);
        o.pos.set(P.x + P.tz * side, P.y + 0.62, P.z - P.tx * side);
        o.look.set((H.x * 2 + C.x) / 3, H.y + 0.15, (H.z * 2 + C.z) / 3);
        o.fov = 42;
        o.minH = portrait ? 30 : 42;
        break;
      }
      case 2: { // Nugget: close on the coop's window from its right, tracking; she watches a butterfly
        const w = this.coop.windowWorld ? this.coop.windowWorld(_w) : _w.copy(C).setY(C.y + 1);
        const P = tr.at(this.cur.cs);
        const u = (t - T.C) / (T.D - T.C);
        const d = lerp(1.2, 0.95, u);
        // ahead of the hut and a little to its right, looking back at the round gable window
        o.pos.set(w.x + P.tx * d - P.tz * 0.38, w.y - 0.06, w.z + P.tz * d + P.tx * 0.38);
        o.look.set(w.x + P.tx * 0.1, w.y - 0.02, w.z + P.tz * 0.1);
        o.fov = 38;
        o.minH = portrait ? 26 : 38;
        break;
      }
      case 3: { // low on the trail ahead, backing away as they come on: boots and great chicken feet thumping down, dust puffing
        const u = (t - T.D) / (T.E - T.D);
        const P = tr.at(this.cur.s + lerp(2.3, 2.0, u));
        o.pos.set(P.x - P.tz * 0.25, P.y + 0.3, P.z + P.tx * 0.25);
        const wH = portrait ? 0.8 : 0.58;
        o.look.set(H.x * wH + C.x * (1 - wH), H.y - 0.12, H.z * wH + C.z * (1 - wH));
        o.fov = 40;
        o.minH = portrait ? 30 : 40;
        break;
      }
      case 4: { // the footbridge from downstream, low over the water
        const B = FOREST.bridge;
        const u = (t - T.E) / (T.F - T.E);
        const st = FOREST.stream, ss = FOREST.trail.cross.ss;
        const q = st.curve.getPointAt(clamp((ss + lerp(6.4, 5.6, u)) / st.L, 0, 1));
        o.pos.set(q.x, B.y + lerp(0.75, 0.6, u), q.z);
        o.look.set(lerp(B.x, (H.x + C.x) / 2, 0.5), B.y + 0.2, lerp(B.z, (H.z + C.z) / 2, 0.5));
        o.fov = 46;
        o.minH = portrait ? 34 : 46;
        break;
      }
      case 5: { // into the clearing over his left shoulder: the chest glitters in its beam of light ahead
        const u = ease(T.F, T.G, t);
        const P = tr.at(this.cur.s);
        const lx = P.tz, lz = -P.tx; // his left
        o.pos.set(H.x + lx * lerp(1.2, 0.95, u) - P.tx * lerp(2.5, 1.9, u), H.y + lerp(0.8, 0.66, u), H.z + lz * lerp(1.2, 0.95, u) - P.tz * lerp(2.5, 1.9, u));
        o.look.set(lerp(H.x + P.tx * 2, 0, 0.65), lerp(H.y + 0.1, 0.3, 0.7), lerp(H.z + P.tz * 2, -0.1, 0.65));
        o.fov = lerp(46, 38, u);
        o.minH = portrait ? 32 : 46;
        break;
      }
      case 6: { // the chest: low and close, pushing in as the lid creaks and gold light pours out
        const u = ease(T.G, T.H, t);
        o.pos.set(lerp(1.0, 0.66, u), lerp(0.46, 0.4, u), lerp(1.9, 1.4, u));
        o.look.set(-0.05, lerp(0.28, 0.38, u), -0.12);
        o.fov = lerp(42, 36, u);
        o.minH = portrait ? 30 : 42;
        break;
      }
      case 7: { // his face, lit gold from below; he reaches for it
        const u = ease(T.H, T.I, t);
        o.pos.set(H.x + lerp(0.34, 0.27, u), lerp(0.36, 0.34, u), H.z - lerp(1.5, 1.34, u));
        o.look.set(H.x, H.y + 0.2, H.z);
        o.fov = lerp(38, 33, u);
        o.minH = portrait ? 26 : 36;
        break;
      }
      case 8: { // the ground groans: Nugget in her window, feathers up, the trees shaking and the birds bursting into the sky behind her
        const w = this.coop.windowWorld ? this.coop.windowWorld(_w) : _w.copy(C).setY(C.y + 1);
        const u = ease(T.I, T.I2, t);
        const dx = -C.x, dz = -C.z, dl = Math.hypot(dx, dz) || 1; // toward the clearing (the way she faces)
        const d = lerp(1.15, 0.95, u);
        o.pos.set(w.x + (dx / dl) * d + (dz / dl) * 0.3, w.y - 0.42, w.z + (dz / dl) * d - (dx / dl) * 0.3);
        o.look.set(w.x, w.y + 0.12 + u * 0.1, w.z);
        o.fov = 44;
        o.minH = portrait ? 30 : 44;
        break;
      }
      case 9: { // the ground sags and cracks race outward: wide and low
        const u = ease(T.I, T.J, t);
        o.pos.set(lerp(2.4, 3.3, u), lerp(1.3, 2.4, u), lerp(2.9, 3.8, u));
        o.look.set(0, lerp(0.45, 0.05, u), 0.25);
        o.fov = lerp(48, 54, u);
        o.minH = portrait ? 40 : 48;
        break;
      }
      case 10: { // it breaks: from above, down into the hole after him
        const tau = t - T.J;
        o.pos.set(0.9, 3.3 - tau * 0.4, 2.0);
        o.look.set(H.x * 0.6, Math.max(H.y, -6), H.z * 0.6);
        o.fov = 54;
        o.minH = portrait ? 44 : 54;
        break;
      }
      case 11: { // falling with him from below: the light of the hole shrinking above
        const tau = t - T.K;
        const gap = lerp(3.2, 1.5, smooth(tau / 2.2));
        o.pos.set(0.45, H.y - gap, 0.55);
        o.look.set(H.x * 0.5, H.y + 0.6, H.z * 0.5);
        o.roll = Math.sin(tau * 1.3) * 0.14;
        o.fov = 60;
        o.minH = portrait ? 44 : 60;
        break;
      }
      default: { // out cold at the bottom of the dark: looking up at a far-off speck of light
        o.pos.set(0.2, this.bottomY ?? -24, 0.3);
        o.look.set(0, 1, 0.05);
        o.fov = 50;
        break;
      }
    }
    return o;
  }

  updateCamera(t, dt) {
    let i = 0;
    while (i + 1 < SHOTS.length && t >= SHOTS[i + 1]) i++;
    this.shotIndex = i;
    const A = this._sa || (this._sa = { pos: new THREE.Vector3(), look: new THREE.Vector3() });
    const B = this._sb || (this._sb = { pos: new THREE.Vector3(), look: new THREE.Vector3() });
    this.shot(i, t, A);
    // hard cuts, except the shots that flow on from the one before
    const blendFrom = { 1: 0.9, 10: 0.25 };
    const bl = blendFrom[i];
    if (bl && t - SHOTS[i] < bl) {
      const k = smooth((t - SHOTS[i]) / bl);
      this.shot(i - 1, t, B);
      A.pos.lerpVectors(B.pos, A.pos, k);
      A.look.lerpVectors(B.look, A.look, k);
      A.roll = lerp(B.roll, A.roll, k);
      A.fov = lerp(B.fov, A.fov, k);
      A.minH = lerp(B.minH, A.minH, k);
    }
    if (this.pin) { A.pos.copy(this.pin.pos); A.look.copy(this.pin.look); A.fov = this.pin.fov; A.roll = 0; }
    const cam = this.camera;
    cam.position.copy(A.pos);
    if (i < 10 && !this.pin) cam.position.y = Math.max(cam.position.y, groundH(cam.position.x, cam.position.z) + 0.12);
    // handheld drift, plus shake
    const hh = this.pin ? 0 : i < 10 ? 0.01 : 0.004;
    cam.position.x += Math.sin(t * 0.7) * hh; cam.position.y += Math.sin(t * 0.9 + 1) * hh;
    this.shake = Math.max(0, this.shake - dt * 0.12);
    if (t > T.I && t < T.J) this.shake = Math.max(this.shake, 0.008 + 0.03 * ease(T.I, T.J, t));
    const sh = this.pin ? 0 : this.shake;
    if (sh > 0) cam.position.add(_v.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    cam.lookAt(A.look);
    if (A.roll) cam.rotateZ(A.roll);
    fitFov(cam, A.fov, A.minH ?? 46);
    cam.updateMatrixWorld();
    for (const p of this.pools) p.setScaleFromCamera(cam, this.game.engine.height);
  }

  // ------------------------------------------------------------------ world
  updateWorld(t, dt) {
    const cam = this.camera, sc = this.scene, F = this.F;
    const cy = cam.position.y;
    // daylight drains away below the ground; the dark takes over
    const dl = Math.pow(clamp(1 + cy / 7, 0, 1), 1.3);
    const fogK = 1 - dl;
    this.hemi.intensity = 0.12 + 0.93 * dl;
    this.sun.intensity = 3.0 * dl;
    this.fill.intensity = 0.35 * dl;
    setAir(fogK);
    sc.fog.color.copy(this.haze).lerp(this.dark, fogK);
    sc.fog.near = lerp(30, 3, fogK);
    sc.fog.far = lerp(140, 22, fogK);
    sc.background.copy(FA.uFaCool.value);
    const far = lerp(220, 40, fogK);
    if (Math.abs(cam.far - far) > 0.5) { cam.far = far; cam.updateProjectionMatrix(); }
    F.sky.position.copy(cam.position);
    F.sky.material.uniforms.uDark.value = fogK;
    // the shaft below the hole: only bands near the camera
    // (under the crust nothing of it shows until the ground starts to give)
    const cut = t < T.I ? 99 : t < T.J - 0.2 ? -5 : cy - sc.fog.far - 1;
    for (const m of this.shaft.group.children) if (m.isMesh && m.geometry.boundingBox) m.visible = m.geometry.boundingBox.max.y > cut && m.geometry.boundingBox.min.y < cy + 30;
    this.shaft.group.visible = t >= T.I;
    // the wind gusts when the ground starts to go (the trees shake)
    this.gust = Math.max(0, (this.gust || 0) - dt * 0.35);
    MF.uWind.value.set(0.82, 0.57).multiplyScalar(1 + this.gust * 2.2 + Math.sin(t * 0.37) * 0.15);
    // post: golden light through the trees on the surface, then down into the dark
    const p = this.post;
    p.grade = mixG(GRADE, DEEP, fogK);
    p.bloom = lerp(0.6, 0.7, fogK);
    p.bloomThreshold = lerp(0.8, 0.7, fogK);
    p.vignette = lerp(0.26, 0.62, fogK);
    p.saturation = lerp(1.08, 0.9, fogK);
    if (cy > -0.5) {
      p.rays = 1.0; p.raysDir = SUN_DIR; p.raysPos = null; p.raysSky = 1; p.raysThreshold = 0.84; p.raysColor = 0xffd49a; p.raysRadius = 0.5; p.raysDecay = 0.966;
    } else {
      p.rays = 0.8 * (1 - ease(T.L - 1, T.L + 1, t)); p.raysDir = null; p.raysPos = this._holeP || (this._holeP = new THREE.Vector3(0, 0.5, 0)); p.raysSky = 1; p.raysThreshold = 0.8; p.raysColor = 0xfff0c8; p.raysRadius = 0.35; p.raysDecay = 0.95;
    }
    // the chest's moment: gold light pours out and lights his face
    {
      const k = this.lidOpen != null ? ease(this.lidOpen, this.lidOpen + 1.4, t) * (1 - ease(T.J + 0.4, T.J + 1.6, t)) : 0;
      const flick = 0.9 + Math.sin(t * 13) * 0.05 + Math.sin(t * 31) * 0.05;
      this.chestLight.intensity = 3.2 * k * flick;
      F.chestGlow.userData.glow.uIntensity.value = 0.45 + k * 0.9 * flick;
      F.chestGlow.userData.glow.uSize.value.setScalar(1.1 + k * 1.3);
      for (const b of this.chestBeams) b.userData.beam.base = k * 0.5;
      if (k > 0.05 && t < T.J && Math.random() < dt * 40 * k) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.25;
        this.gold.spawn({ pos: [Math.cos(a) * r, 0.36, -0.12 + Math.sin(a) * r * 0.6], vel: [(Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.5, (Math.random() - 0.5) * 0.15], life: 2.2, color: Math.random() < 0.85 ? 0xffe080 : [0xff7a9a, 0x7ae8ff, 0x9aff9a][(Math.random() * 3) | 0], color2: 0xffa040, size: 0.022, wobble: 0.25, flicker: 0.5, fadeIn: 0.2, shape: Math.random() < 0.3 ? SHAPE.plus : SHAPE.square });
      }
      p.bloom += k * 0.25;
      F.glintGain = 1 + k;
    }
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 2.4);
    // black out: the light fades, the eyes close round the speck of light far above
    if (t >= T.K + 1.0) {
      const k = ease(T.K + 1.0, T.L - 0.1, t);
      p.fade = k * 0.92;
      p.fadeColor = 0x000000;
    }
    if (t >= T.L) {
      if (this.bottomY == null) this.bottomY = this.heroPivot.position.y + 0.3;
      const u = t - T.L;
      const blink = Math.max(0, Math.sin(Math.min(u, 3.4) * 2.2)) * (1 - u / 3.4);
      const R = Math.hypot(this.game.engine.width, this.game.engine.height);
      p.fade = clamp(1 - blink * 0.85, 0, 1);
      p.iris = blink > 0.02 ? R * 0.25 * blink : 0;
      p.irisCenter = [0.5, 0.62];
      p.vignette = 1.2;
    }
    if (t > T.END - 1.2) { p.fade = 1; p.iris = -1; }

    // the light that falls with him: from just above his head
    const H0 = this.heroPivot.position;
    this.fallLight.position.set(H0.x + 0.3, H0.y + 1.4, H0.z + 0.5);
    this.fallLight.intensity = t > T.J ? 3.2 * fogK * (1 - ease(T.K + 1.2, T.L, t)) : 0;
    F.update(dt, cam, sc.fog);
    this.shaft.update?.(dt);
    // the forest's animals
    this.critters.update(dt, {
      t, hero: this.heroPivot.position, coop: this.coop.root.position, glint: !!this.glint, crack: !!this.crack,
      sfx: (name, o) => this.sfx('forest_' + name, o),
      splash: (pos) => { for (let i = 0; i < 12; i++) this.splash.spawn({ pos: [pos.x, -0.47, pos.z], vel: [(Math.random() - 0.5) * 1, 1 + Math.random() * 1.2, (Math.random() - 0.5) * 1], life: 0.8, color: 0xf0f8ff, color2: 0x8ac0e0, size: 0.03, gravity: 9, shape: SHAPE.square }); this.sfx('splash', { vol: 0.3 }); },
    });
    // Nugget: in her close-up she follows a butterfly past the window
    if (this.henFly && t < T.D + 0.5) {
      const u = (t - this.henFly.t0) / 3;
      this.henLook = { y: Math.sin(u * 3.2) * 0.7, x: -0.25 + Math.sin(u * 5) * 0.1 };
      const w = this.coop.windowWorld ? this.coop.windowWorld(_w) : _w.copy(this.coop.root.position);
      if (!this.henBf) this.henBf = F.flies[0];
      const P = FOREST.trail.at(this.cur.cs);
      this.henBf.userData.pinned = true;
      const sw = 0.45 + Math.sin(u * 3.2) * 0.1, along = 0.25 - u * 0.4;
      this.henBf.position.set(w.x - P.tz * sw + P.tx * along, w.y + 0.12 + Math.sin(u * 9) * 0.06, w.z + P.tx * sw + P.tz * along);
    } else if (this.henBf) { this.henBf.userData.pinned = false; this.henLook = null; this.henBf = null; }
    // the flock wheeling away from the clearing
    for (const b of this.flockBirds) {
      if (!b.visible) continue;
      const U = b.userData;
      U.t += dt;
      const r = U.r + U.t * U.sp, a = U.a + Math.sin(U.t * 0.8 + U.ph) * 0.25;
      b.position.set(Math.cos(a) * r, U.h + U.t * U.up + Math.sin(U.t * 5 + U.ph) * 0.15, Math.sin(a) * r);
      U.sheet.uFrame.value = Math.floor(U.t * 14 + U.ph * 3) % 4;
      if (U.t > 6) b.visible = false;
    }
    // the bars come off for the fall
    if (t > T.J && !this._barsOff) { this._barsOff = true; this.bars.classList.remove('on'); }

    // surface life: pollen and motes in the shafts, fireflies in the shade, leaves drifting down
    if (t < T.J + 0.5 && cy > -1) {
      const H = this.heroPivot.position;
      const beams = F.beams;
      for (let k = 0; k < 2; k++) if (Math.random() < dt * 22) {
        const b = beams[(Math.random() * beams.length) | 0].userData.beam;
        const p0 = _v.copy(b.bottom).lerp(b.top, Math.random() * 0.6);
        if (p0.distanceTo(cam.position) < 26) this.motes.spawn({ pos: [p0.x + (Math.random() - 0.5) * b.w * 0.6, p0.y, p0.z + (Math.random() - 0.5) * b.w * 0.6], vel: [0.05, -0.02, -0.02], life: 5, color: 0xfff0b8, size: 0.02, wobble: 0.25, flicker: 0.6, fadeIn: 0.8 });
      }
      if (Math.random() < dt * 10) this.motes.spawn({ pos: [H.x + (Math.random() - 0.5) * 8, 0.3 + Math.random() * 2.4, H.z + (Math.random() - 0.5) * 8], vel: [0.06, 0.03, -0.02], life: 4, color: 0xfff2b0, size: 0.018, wobble: 0.3, flicker: 0.5, fadeIn: 0.5 });
      if (Math.random() < dt * 5) this.flies.spawn({ pos: [H.x + (Math.random() - 0.5) * 12, 0.2 + Math.random() * 1.4, H.z + (Math.random() - 0.5) * 12], vel: [(Math.random() - 0.5) * 0.3, 0.05, (Math.random() - 0.5) * 0.3], life: 4, color: 0xe0ff70, color2: 0x9aff40, size: 0.04, wobble: 1, flicker: 0.95, fadeIn: 0.6, shape: SHAPE.plus });
      if (Math.random() < dt * 2.2) this.leaves.spawn({ pos: [H.x + (Math.random() - 0.5) * 7, 4 + Math.random() * 3, H.z + (Math.random() - 0.5) * 7], vel: [0.45, -0.35, 0.25], life: 8, color: [0x8ab448, 0xd8a040, 0xb8c058, 0xc87838][(Math.random() * 4) | 0], size: 0.045, gravity: 0.18, drag: 0.8, wobble: 0.9, spin: 5, shape: SHAPE.confetti });
    }
    // the stream: louder near the bridge
    if (t < T.F) {
      const B = FOREST.bridge;
      const d = Math.hypot(cam.position.x - B.x, cam.position.z - B.z);
      this.loop('forest_brook', clamp(1 - d / 16, 0, 1) * 0.6);
    } else this.loop('forest_brook', 0);
    // the fall: grit and motes rushing past
    if (t >= T.J && t < T.L) {
      const H = this.heroPivot.position;
      if (Math.random() < dt * 22) this.debris.spawn({ pos: [H.x + (Math.random() - 0.5) * 1.6, H.y + (Math.random() - 0.2) * 2, H.z + (Math.random() - 0.5) * 1.6], vel: [(Math.random() - 0.5) * 0.4, -9 * (t - T.J) * (0.85 + Math.random() * 0.2), (Math.random() - 0.5) * 0.4], life: 1.2, color: Math.random() < 0.5 ? 0x5a3e2a : 0x7a6a58, size: 0.03 + Math.random() * 0.03, gravity: 6, shape: SHAPE.square });
      for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28, r = 0.4 + Math.random() * 1.6; this.motes.spawn({ pos: [Math.cos(a) * r, cy - 3 - Math.random() * 6, Math.sin(a) * r], vel: [0, 0, 0], life: 1.6, color: 0xffe8c0, size: 0.018, flicker: 0.4 }); }
    }
    // hero footsteps: dust, a knock on the bridge, a kicked leaf
    const hr = this.hero;
    if (hr.state === 'walk') {
      const ph = Math.floor(hr.t * 8.5 / Math.PI);
      if (ph !== this._stepPh) { this._stepPh = ph; this.heroStep(ph % 2); }
    }
    for (const pl of this.pools) pl.update(dt);
  }
}
