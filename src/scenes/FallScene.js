// The journey: up on the surface, at golden hour, the young blacksmith mole walks an old forest
// trail alone. Ancient trees, ferns and bluebells, shafts of low sun through the leaves, the log
// bridge over the stream, and in a sunny clearing a strange old chest glinting in a beam of light.
// Wave 10: stepping into the clearing he hears a faint peep: a raptor's nest at the clearing's edge, one
// egg left in it, warm. He crouches; it wobbles and chirps; he lifts it in both paws, wraps it in his
// kerchief and stows it on top of his pack (state.data.egg: it comes home with him, src/home/eggNest.js).
// He walks up to it; the lid creaks and gold light spills out over his face... the ground groans
// under his boots, cracks race over the clearing, roots snap, the birds burst from the trees, and
// the crust gives way: he tumbles down a dark shaft.
// Darkness, a heartbeat, muffled ringing: he blacks out. Ends with goto('home', { from: 'fall' }).
// ~39 s (wave 12: tighter cuts, the stroll at the same pace), not skippable.
// Wave 8: the wood is dressed for the camera (forest/dress.js: thick ground cover, flowers and stones in fine
// voxels, saplings, boughs hanging into the opening shot), leaves and pollen drift on the GPU (forest/drift.js),
// small birds perch, flit and sing about the trail (forest/critters.js: birds only, no other animals), and
// the air is full of recorded wind in the crowns and a placed evening chorus (forest/sound.js).
// Dev: ?scene=fall&at=secs to start later, &freeze=1 to stop time, &lite=1 for the phone forest (&lite=0: the full
// forest even on a software renderer, which otherwise gets the light one), &wildlife=0 for a forest with no birds.
// Test hooks: scene.debug.{ at(secs), time(), shot(), state(), skip(), perf(), cam(pos, look, fov), hold(on) }.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { el, clamp, lerp } from '../core/util.js';
import { useBookendStyles } from '../bookends/css.js';
import { disposeTextures, setPixelScale, Particles, SHAPE, fitFov } from '../bookends/fx.js';
import { buildForest, FOREST, SUN_DIR, groundH, HOLE_R, EGG_K } from '../bookends/forest.js';
import { bundleGeo } from '../bookends/forest/egg.js';
import { forestToon, FF } from '../bookends/forestfx.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { MF } from '../bookends/meadowfx.js';
import { FA, setAir } from '../bookends/forest/atmos.js';
import { forestSounds } from '../bookends/forest/sound.js';
import { dressForest } from '../bookends/forest/dress.js';
import { makeDrift } from '../bookends/forest/drift.js';
import { makeCritters, makeVoxelBird, flap } from '../bookends/forest/critters.js';
import { makeFlocks } from '../bookends/forest/flocks.js';
import { makeVoxelShadow } from '../bookends/forest/shadow.js';
import { buildFallShaft } from '../bookends/fallshaft.js';
import { makeHeroMole } from '../gfx/char/hero.js';
import { heartbeat, muffle } from '../bookends/journey.js';

// the timeline (seconds): shots A..L
// (F: into the clearing, a peep; N, N2, N3: the nest, the egg in his paws, wrapped and stowed; F2: on, the chest glints)
// (wave 12, "the intro a little faster": was 55.2 s; the shots are cut shorter, nobody walks faster)
const T = { A: 0, B: 3.4, C: 5.8, D: 8.0, E: 9.3, F: 12.3, N: 14.5, N2: 17.1, N3: 19.3, F2: 22.3, G: 25.3, H: 27.3, I: 28.9, I2: 30.4, J: 31.9, K: 33.3, L: 35.7, END: 39.1 };
const SHOTS = [T.A, T.B, T.C, T.D, T.E, T.F, T.N, T.N2, T.N3, T.F2, T.G, T.H, T.I, T.I2, T.J, T.K, T.L];
const FALL_SHOT = 14; // (the shots from here on are below the ground)
const CAP = [0.7, 3.4];
const WALK = 0.8; // m/s (a brisk, bouncy stroll: ~3 steps a second with gait.js's cadence)
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ease = (a, b, x) => smooth((x - a) / (b - a));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _X = new THREE.Vector3(1, 0, 0);
/** Where the bundle rides: on top of his pack beside the rolled blanket (in the pack's strap pivot's space, so it swings with it). */
const PACK_TOP = new THREE.Vector3(-0.09, 0.0, -0.14);
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
    this.cur = { s: 0 };
    this.perfAcc = { n: 0, upd: 0, ren: 0, nu: 0 };
    forestSounds(this.game.audio);

    const sc = this.scene;
    this.haze = new THREE.Color(0xc8d4bc);
    this.dark = new THREE.Color(0x080605);
    sc.background = this.haze.clone();
    sc.fog = new THREE.Fog(this.haze.clone(), 30, 140); // the characters' fog (the forest has its own air)
    this.camera = new THREE.PerspectiveCamera(48, this.game.engine.aspect, 0.05, 220);
    setAir(0);
    FF.uShade.value = 0.31; // (the shade under the canopy a touch deeper: the flecks of sun stand out)
    this.own(() => { FF.uShade.value = 0.38; });

    // ---- while the forest grows (a few seconds on a phone): a quiet card and a way past it
    this.loadCard = el('div', { class: 'bk-root bk-loading' }, []);
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
    // the camera's own set dressing, the drifting leaves and pollen
    this.dress = dressForest(this.F, { lite, soft });
    sc.add(this.dress.group);
    this.own(() => this.dress.dispose());
    this.drift = makeDrift({ lite, soft });
    sc.add(this.drift.group);
    this.own(() => this.drift.dispose());

    // ---- light: a low warm sun through the trees, sky and a cool fill
    // (wave 10: a little more sun against a little less sky, so the dapples and the shade read richer)
    this.hemi = new THREE.HemisphereLight(0xa8c4e0, 0x3a4424, 0.95);
    this.sun = new THREE.DirectionalLight(0xffc27a, 3.3);
    this.sun.position.copy(SUN_DIR).multiplyScalar(30);
    this.fill = new THREE.DirectionalLight(0x9ab4e0, 0.35);
    this.fill.position.set(0.5, 0.6, 1).multiplyScalar(30);
    // gold from the chest (on his face), and the daylight that falls down the shaft with him
    this.chestLight = new THREE.PointLight(0xffb848, 0, 4.5, 1.6);
    this.chestLight.position.set(0, 0.5, 0.1);
    this.fallLight = new THREE.PointLight(0xffd8a8, 0, 7, 1.4);
    sc.add(this.hemi, this.sun, this.fill, this.chestLight, this.fallLight);

    // ---- the traveller
    this.hero = makeHeroMole({ height: 0.86 });
    this.heroPivot = new THREE.Group(); // tumbling happens round his middle
    this.heroPivot.add(this.hero.root);
    this.hero.root.position.y = -0.42;
    sc.add(this.heroPivot);
    this.own(() => this.hero.dispose());
    this.heroShadow = makeVoxelShadow(0.32, 0.26, 0.5);
    sc.add(this.heroShadow);

    // ---- the forest's small birds (?wildlife=0 leaves them, and the birdsong, out)
    this.wildlife = params.wildlife !== '0';
    this.critters = this.wildlife ? makeCritters(this.F, { lite }) : { group: null, update() {}, dispose() {} };
    if (this.critters.group) { sc.add(this.critters.group); this.own(() => this.critters.dispose()); }
    // ...and its flocks: sparrows on the trail, goldfinches on the bridge rail, bullfinches in the clearing, tits crossing the sky
    this.flocks = this.wildlife ? makeFlocks(this.F, { lite }) : { group: null, update() {}, dispose() {} };
    if (this.flocks.group) { sc.add(this.flocks.group); this.own(() => this.flocks.dispose()); }

    // ---- the raptor egg: in its nest at the clearing's edge (forest.js); he carries it off wrapped in
    // his kerchief, the bundle riding on top of his pack (eggCarry follows his paws, then the pack)
    if (this.F.nest) {
      const N = this.F.nest;
      this.eggCarry = new THREE.Group();
      this.eggCarry.name = 'egg-carry';
      const bundle = new THREE.Mesh(bundleGeo(5), forestToon({ dapple: true }));
      bundle.layers.enable(LAYER_OUTLINE);
      bundle.scale.setScalar(EGG_K);
      bundle.visible = false;
      this.eggCarry.add(bundle);
      this.eggBundle = bundle;
      sc.add(this.eggCarry);
      this.own(() => bundle.geometry.dispose());
      N.group.updateMatrixWorld(true);
      this.nestEggP = N.hold.getWorldPosition(new THREE.Vector3());
      this.nestEggQ = N.hold.getWorldQuaternion(new THREE.Quaternion());
    }

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
    // the small birds that burst out of the trees when the ground goes (voxel birds, wings beating)
    this.flockBirds = [];
    const LOOKS = [{ back: 0x5a4a3a, breast: 0xc89070, belly: 0xe8d8c4 }, { back: 0x6a8a4a, breast: 0xe8d040, belly: 0xe8d040, cap: 0x1a1a1e }, {}];
    for (let i = 0; i < (this.wildlife ? 14 : 0); i++) {
      const b = makeVoxelBird(LOOKS[i % 3]);
      const a = 0.6 + (i / 14) * 1.9 + Math.random() * 0.2; // out of the trees behind the clearing, across the open sky
      b.root.scale.setScalar(1.6);
      b.root.userData = { a, r: 7.5 + Math.random() * 4, h: 4.5 + Math.random() * 4, sp: 2.2 + Math.random() * 1.6, up: 1.4 + Math.random() * 1.2, ph: Math.random() * 4, rig: b };
      b.root.visible = false;
      this.flockBirds.push(b.root);
      sc.add(b.root);
    }
    this.own(() => { for (const b of this.flockBirds) b.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); });

    // ---- DOM: caption, letterbox bars, skip
    this.caption = el('div', { class: 'bk-caption bk-outline' }, ['Far above the Deep', el('small', {}, 'an old forest trail, late in the day')]);
    this.bars = el('div', { class: 'bk-bars' }, [el('i'), el('i')]);
    // the intro can't be skipped (only the test hook debug.skip() ends it early)
    this.root = el('div', { class: 'bk-root bk-fall' }, [this.bars, this.caption]);
    this.game.ui.world.append(this.root);
    this.own(() => this.root.remove());
    requestAnimationFrame(() => this.bars.classList.add('on'));

    Object.assign(this.post, {
      outlineFar: 26, vignette: 0.28, saturation: 1.12, contrast: 1.12, grade: GRADE, gradeMix: 1,
      bloom: 0.6, bloomThreshold: 0.8, rays: 1, raysDir: SUN_DIR, raysSky: 1, raysThreshold: 0.84, raysColor: 0xffd49a, raysRadius: 0.5, raysDecay: 0.966,
    });
    if (soft) this.post.outline = false; // (a software rasterizer can't afford the outline pass)
    this.onResize(this.game.engine.width, this.game.engine.height);
    this.place(0, 0);
    // boughs hanging into the opening crane (it starts up among them and sinks below)
    {
      const o = this.shot(0, 0.3, { pos: new THREE.Vector3(), look: new THREE.Vector3() });
      this.updateCamera(0.3, 0);
      const fr = { fov: this.camera.fov, aspect: this.camera.aspect };
      this.dress.frame(o.pos, o.look, { ...fr, side: -1, dist: 2.6, up: 0.98, len: 3.2, reach: 0.34, seed: 9601 });
      this.dress.frame(o.pos, o.look, { ...fr, side: 1, dist: 3.8, up: 1.02, len: 2.8, reach: 0.26, seed: 9613, yaw: 0.15 });
    }
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
      state: () => ({ t: this.t, shot: this.shotIndex, hero: this.hero.state, sag: this.sag, s: this.cur.s }),
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
    this.keepEgg();
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
    const L = FOREST.trail.length, X = FOREST.trail.cross.s, sN = FOREST.nest.s - 0.1;
    if (t < T.D) return 6.5 + WALK * t;
    if (t < T.E) return 6.5 + WALK * (13.6 + t - T.D); // (a cut: the boots shot on the stretch of trail it was framed for)
    if (t < T.F) return X - 1.85 + WALK * (t - T.E); // (onto the bridge early in the shot; the cut comes as he crosses it)
    // into the clearing: a peep from the grass, he slows and stops beside the nest
    if (t < T.F2) return lerp(sN - 1.1, sN, 1 - Math.pow(1 - clamp((t - T.F) / (T.N - T.F), 0, 1), 1.6));
    // on again: something glitters ahead, he slows to a stop when he sees it
    if (t < T.G) return sN + 1.5 * (1 - Math.pow(1 - clamp((t - T.F2) / 2.3, 0, 1), 1.6));
    // (cut to the chest) ...and up to it: he stops right at the spill
    return lerp(L - 1.6, L - 0.05, ease(T.G + 0.2, T.H + 0.4, t));
  }
  /** At the nest: how far he has stepped off the trail toward it (0..1). */
  nestStep(t) { return ease(T.N - 0.1, T.N + 0.8, t) * (1 - ease(T.F2 - 0.1, T.F2 + 1.0, t)); }
  /** Put the hero where he belongs at time t (dt drives his animation). */
  place(t, dt) {
    const hero = this.hero, tr = FOREST.trail;
    const s = this.heroS(t);
    const vH = dt > 0 ? (s - this.cur.s) / dt : 0;
    const jump = Math.abs(s - this.cur.s) > 1; // a cut
    this.cur.s = s;
    const P = tr.at(s);
    const fallen = t >= T.J;
    // the hero: down the middle of the trail
    if (!fallen) {
      // his feet: on the trail, or (near the footbridge) on its middle line and on the deck's top
      const B = FOREST.bridge;
      const W = B ? B.walk(P.x, P.z, this._bw || (this._bw = {})) : null;
      let x = W ? W.x : P.x, z = W ? W.z : P.z;
      // the nest: he steps off the trail toward it (and back on as he goes)
      const NS = FOREST.nest, ns = this.nestStep(t);
      if (ns > 0) { const dx = NS.x - x, dz = NS.z - z, d = Math.hypot(dx, dz) || 1; x += (dx / d) * 0.42 * ns; z += (dz / d) * 0.42 * ns; }
      let y = W && W.w > 0 ? W.y : groundH(x, z);
      this.onBridge = !!W?.on;
      // (a boot doesn't drop into every rut: the feet settle over a few frames, except across a cut)
      if (this.feetY == null || jump || dt <= 0) this.feetY = y;
      else this.feetY += (y - this.feetY) * Math.min(1, dt * 16);
      y = Math.max(y - 0.012, this.feetY);
      if (Math.hypot(x, z) < HOLE_R + 0.3) y -= this.sag * 0.13; // on the crust: he sinks with it
      this.heroPivot.position.set(x, y + 0.42, z);
      this.heroPivot.rotation.set(0, 0, 0);
      const speed = jump ? WALK : Math.abs(vH);
      const walking = t < T.N - 0.3 || (t > T.F2 - 0.4 && t < T.F2 + 2.3) || (t >= T.G && t < T.H + 0.4);
      if (t >= T.N - 0.3 && t < T.F2 - 0.4) this.nestBeat(t, x, z);
      else if (walking) {
        // (on the span he faces along the logs, not along the trail's bend under them)
        const yaw = W && W.w > 0 ? P.yaw + Math.atan2(Math.sin(B.yaw - P.yaw), Math.cos(B.yaw - P.yaw)) * W.w : P.yaw;
        if (speed > 0.12) { hero.play('walk', clamp(speed / WALK, 0.55, 1.25)); hero.face(yaw); }
        else if (hero.state === 'walk') hero.play('idle');
      }
    }
    hero.update(dt);
    this.eggPose(t);
    // his shadow: a soft blob on the ground (shrinks as he drops away)
    {
      const H = this.heroPivot.position;
      const onCrust = Math.hypot(H.x, H.z) < HOLE_R + 0.3;
      const gy = fallen ? -0.98 : groundH(H.x, H.z) - (onCrust ? this.sag * 0.13 : 0);
      const by = !fallen && this._bw && this._bw.w > 0 ? Math.max(gy, this._bw.y) : gy; // (on the deck: under his boots)
      const up = clamp((H.y - 0.42 - by) / 1.5, 0, 1);
      this.heroShadow.position.set(H.x, by + 0.02, H.z);
      this.heroShadow.scale.setScalar(1 - up * 0.6);
      this.heroShadow.visible = !fallen;
    }
    return P;
  }

  // ------------------------------------------------------------------ the egg
  /** The egg goes home with him: state.data.egg (src/home/eggNest.js keeps it by his bedroll and hatches it). */
  keepEgg() {
    const d = this.game.state?.data;
    if (d && !d.egg && !(d.tame?.raptors || []).some((r) => r.how === 'hatched')) { d.egg = { day: d.day || 1, at: Date.now(), crack: 0 }; this.game.state.dirty = true; }
  }
  /** Which way he faces (a unit vector on the ground) into out. */
  facing(out) { const y = this.hero.facing; return out.set(Math.sin(y), 0, Math.cos(y)); }
  /** Where the egg is (its foot, world) into out. */
  eggAt(out) {
    const N = this.F.nest;
    if (!N || !this.eggCarry) return out.set(0, 0, 0);
    return N.egg.parent === this.eggCarry ? out.copy(this.eggCarry.position) : out.copy(this.nestEggP);
  }
  /** His part in the nest beat (N-0.3 .. F2-0.4): a few careful steps to it, then down on his heels. */
  nestBeat(t, x, z) {
    const hero = this.hero, NS = FOREST.nest;
    hero.face(Math.atan2(NS.x - x, NS.z - z));
    if (t < T.N + 0.6) hero.play('walk', 0.55);
    else if (t < T.N3 + 1.35) hero.play('reach');
    else hero.play('idle');
    hero.setHammer?.(t > T.N + 0.45 && t < T.F2 - 0.6 ? 'back' : null); // (both paws for the egg)
  }
  /**
   * The nest beat's body and the egg (after his rig's own update): a crouch, his paws down to the egg,
   * the egg lifted to his chest in both paws, wrapped, swung up over his shoulder onto his pack, a pat.
   * All of it is a function of t, so jumping about the timeline (debug.at) lands in the right pose.
   */
  eggPose(t) {
    const h = this.hero, N = this.F.nest;
    if (!N || !this.eggCarry) return;
    const s = h.s;
    const kneel = ease(T.N + 0.6, T.N + 1.1, t) * (1 - ease(T.N3 + 1.2, T.N3 + 1.75, t));
    const down = ease(T.N + 1.9, T.N + 2.4, t) * (1 - ease(T.N2 - 0.15, T.N2 + 0.4, t)); // paws down to the egg
    const hold = ease(T.N2 - 0.15, T.N2 + 0.4, t) * (1 - ease(T.N3 + 1.75, T.N3 + 2.0, t)); // the egg at his chest
    const lift = ease(T.N3 + 1.75, T.N3 + 2.1, t) * (1 - ease(T.N3 + 2.25, T.N3 + 2.65, t)); // his right paw over his shoulder
    const pat = t > T.N3 + 2.45 && t < T.N3 + 2.95 ? Math.sin(((t - T.N3 - 2.45) / 0.5) * Math.PI) : 0;
    const beat = t > T.N - 0.3 && t < T.F2 - 0.4;
    if (beat) {
      const { hip, neck, armL, armR, legL, legR } = h;
      // down on his heels: the hips drop, one knee up, the other leg back, a lean to the egg
      hip.position.y -= s * 2.3 * kneel - s * 0.7 * (h.state === 'reach' ? Math.min(1, (h.stateT || 0) / 0.5) : 0);
      hip.rotation.x = h.baseHunch + kneel * (0.3 + 0.22 * down - 0.22 * hold);
      legL.rotation.x = lerp(legL.rotation.x, -1.35, kneel); legL.rotation.z = 0.12 * kneel;
      legR.rotation.x = lerp(legR.rotation.x, 0.5, kneel); legR.rotation.z = -0.1 * kneel;
      neck.rotation.x += kneel * (0.12 + 0.25 * down) - hold * 0.12;
      // the paws: down to the straw, then cupped together under the egg at his chest
      const ax = lerp(lerp(armL.rotation.x, -0.75, down), -0.86, hold), az = lerp(-0.1, 0.5, hold);
      armL.rotation.set(ax + pat * 1.6, 0, lerp(armL.rotation.z, az, Math.max(down, hold)));
      armR.rotation.set(lerp(lerp(armR.rotation.x, -0.75, down), -0.86, hold), 0, lerp(armR.rotation.z, -az, Math.max(down, hold)));
      if (lift > 0) armR.rotation.set(lerp(armR.rotation.x, -2.75, lift), 0, lerp(armR.rotation.z, 0.15, lift));
      // the wobbles: it rocks in the straw, then again in his paws
    }
    // ---- the egg itself
    const egg = N.egg, carry = this.eggCarry;
    const wob = (a) => (t > a && t < a + 0.75 ? Math.sin((t - a) * 26) * 0.16 * (1 - (t - a) / 0.75) : 0);
    const inNest = t < T.N2 - 0.15;
    if (inNest) {
      if (egg.parent !== N.hold) { N.hold.add(egg); egg.position.set(0, 0, 0); egg.quaternion.identity(); }
      egg.rotation.z = wob(T.N + 1.3) + wob(T.N + 1.75) * 0.6;
      egg.visible = true;
      this.eggBundle.visible = false;
      return;
    }
    if (egg.parent !== carry) { carry.add(egg); egg.position.set(0, 0, 0); egg.rotation.set(0, 0, 0); }
    h.root.updateMatrixWorld(true);
    // between his paws (a little below them: it sits in them)
    const pL = h.handL.getWorldPosition(_v2), pR = h.handR.getWorldPosition(_v3);
    const paws = _v4.copy(pL).add(pR).multiplyScalar(0.5);
    const f = this.facing(_v);
    paws.x += f.x * 0.11; paws.z += f.z * 0.11; paws.y += 0.005; // (it sits in his cupped paws, out in front of his snout)
    const up = ease(T.N2 - 0.15, T.N2 + 0.4, t);
    const P = carry.position;
    if (up < 1) {
      P.lerpVectors(this.nestEggP, paws, up);
      P.y += Math.sin(up * Math.PI) * 0.04;
    } else P.copy(paws);
    // over his shoulder and onto the top of his pack (then it rides there, the fall included)
    const st = ease(T.N3 + 1.85, T.N3 + 2.4, t);
    if (st > 0) {
      const pack = (h.packBone?.parent || h.hip).localToWorld(_v2.copy(PACK_TOP));
      const sh = h.handR.getWorldPosition(_v3);
      if (st < 1) {
        const k = st;
        // paws → up by his right ear → down onto the pack
        const mid = sh.lerp(pack, 0.5); mid.y += 0.12;
        if (k < 0.5) P.lerp(mid, k * 2); else P.lerpVectors(mid, pack, (k - 0.5) * 2);
      } else P.copy(pack);
    }
    // facing: the knot to his right while he holds it; on the pack, square with his back
    carry.quaternion.copy(h.root.getWorldQuaternion(_q));
    if (st >= 1) carry.quaternion.copy((h.packBone?.parent || h.hip).getWorldQuaternion(_q)).multiply(_q2.setFromAxisAngle(_X, -0.2));
    carry.rotateZ(wob(T.N2 + 0.95) + wob(T.N2 + 1.55) * 0.5);
    // his kerchief wrapped round it (the cloth rising round the shell), then just the bundle
    const wrap = ease(T.N3 + 0.15, T.N3 + 1.1, t);
    this.eggBundle.visible = wrap > 0.02;
    this.eggBundle.scale.set(EGG_K * lerp(1.06, 1, wrap), EGG_K * Math.max(0.04, wrap), EGG_K * lerp(1.06, 1, wrap));
    egg.visible = wrap < 0.99;
    egg.scale.setScalar(EGG_K);
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
    // the wood's sound: leaves and wind in the crowns, the evening chorus all round (placed and
    // answered across the trail, thinning out in the clearing); the birds in view sing for themselves
    this.once('amb', 0, () => { this.loop('forest_leaves', 0.42); this.loop('forest_air', 0.5); if (this.wildlife) this.loop('forest_chorus', 0.75); });
    if (t < T.I) {
      const inClear = t >= T.F;
      this.loops.forest_chorus?.set?.({ density: inClear ? 0.45 : 1 });
      // now and then the undergrowth stirs in a gust, a twig cracks deep in the wood
      this.rustleT = (this.rustleT ?? 3) - dt;
      if (this.rustleT <= 0) { this.rustleT = 3 + Math.random() * 5; this.sfx(Math.random() < 0.7 ? 'forest_rustle' : 'forest_twig', { pan: Math.random() * 1.6 - 0.8, vol: 0.6 + Math.random() * 0.4, far: true }); }
    }
    this.once('cap', CAP[0], () => this.caption.classList.add('on'));
    this.once('capoff', CAP[1], () => this.caption.classList.remove('on'));
    this.once('nod', T.B + 1.2, () => this.hero.doEmote('nod', 1));
    // his close-up: he tips his face up into the sun through the leaves, and smiles
    this.once('sunup', T.C + 0.35, () => this.hero.look(0.25, 0.5));
    this.once('smile', T.C + 0.9, () => this.hero.setExpression?.('happy', { hold: 1.8, body: false }));
    this.once('sundown', T.C + 2.1, () => this.hero.look(0, 0));
    // the clearing's edge: a faint peep from the grass by the trail; he stops, turns to it... a nest
    if (this.F.nest) {
      const NS = FOREST.nest;
      const peep = (o = {}) => { _v.set(NS.x, groundH(NS.x, NS.z) + 0.1, NS.z).sub(this.camera.position); const r = _v2.set(1, 0, 0).applyQuaternion(this.camera.quaternion); this.sfx('forest_eggchirp', { pan: clamp(_v.dot(r) / Math.max(1, _v.length()), -0.8, 0.8), ...o }); };
      this.once('peep', T.F + 0.6, () => peep({ vol: 0.55, muffled: true }));
      this.once('notice', T.F + 1.0, () => { this.hero.look(-0.75, -0.2); this.hero.doEmote('surprise', 1.0); });
      this.once('peep2', T.F + 1.7, () => peep({ vol: 0.7, n: 2, muffled: true }));
      this.once('nestlook', T.N + 0.1, () => this.hero.look(0, -0.3));
      this.once('wob1', T.N + 1.3, () => { peep({ vol: 0.85, n: 2 }); this.sfx('forest_eggtick', { vol: 0.8 }); this.hero.doEmote('surprise', 0.9); this.hero.look(0, 0.05); });
      this.once('wob1b', T.N + 1.75, () => this.sfx('forest_eggtick', { vol: 0.5 }));
      this.once('lean', T.N + 1.95, () => this.hero.look(0, -0.4));
      this.once('lift', T.N2 - 0.1, () => this.sfx('forest_rustle', { vol: 0.7 }));
      this.once('liftlook', T.N2 + 0.25, () => this.hero.look(0, -0.25));
      this.once('wob2', T.N2 + 0.95, () => { peep({ vol: 1, n: 2 }); this.sfx('forest_eggtick', { vol: 0.6 }); });
      this.once('smile2', T.N2 + 1.15, () => this.hero.setExpression?.('happy', { hold: 2.0, body: false }));
      this.once('glance', T.N2 + 1.6, () => this.hero.look(-0.7, 0.2)); // (is its mother about?)
      this.once('glance2', T.N2 + 2.0, () => this.hero.look(0.2, -0.2));
      this.once('wrap1', T.N3 + 0.2, () => this.sfx('forest_wrap', { vol: 0.9 }));
      this.once('wrap2', T.N3 + 0.75, () => this.sfx('forest_wrap', { vol: 0.7 }));
      this.once('stand', T.N3 + 1.25, () => { this.sfx('forest_rustle', { vol: 0.5 }); this.hero.look(0, 0); });
      this.once('stow', T.N3 + 2.35, () => { this.sfx('forest_stow', { vol: 1 }); this.keepEgg(); });
      this.once('pat', T.N3 + 2.55, () => { this.hero.doEmote('nod', 0.9); peep({ vol: 0.35, muffled: true }); });
    }
    // the clearing: something glitters
    this.once('glint', T.F2 + 1.0, () => { this.sfx('sparkle', { vol: 0.6 }); this.hero.doEmote('surprise', 1.3); this.glint = true; });
    this.once('stop', T.F2 + 2.3, () => { this.hero.play('peer'); this.hero.look(0, 0.1); });
    this.once('walk2', T.G, () => this.hero.look(0, 0));
    // the chest: the lid creaks wider and gold light pours out
    this.once('lid', T.G + 0.55, () => { this.sfx('forest_chest'); this.lidOpen = t; });
    this.once('chord', T.G + 0.8, () => { this.sfx('forest_chord', { vol: 0.05 }); this.sfx('coins', { n: 5 }); });
    this.once('reach', T.H + 0.9, () => this.hero.play('reach'));
    this.once('chime', T.H + 1.15, () => this.sfx('sparkle', { vol: 0.8 }));
    // the ground goes
    this.once('hush', T.I - 0.5, () => { this.loops.forest_chorus?.set?.({ density: 0 }); });
    this.once('creak', T.I, () => { this.sfx('creak'); this.sfx('forest_groan', { vol: 0.06 }); this.loop('rumble', 0.5); au.stopMusic(1.4); this.shake = 0.015; this.hero.play('idle'); this.hero.look(0, 0.35); });
    this.once('crack1', T.I + 0.5, () => { this.sfx('crack'); this.sfx('rumble_hit'); this.hero.doEmote('surprise', 2); this.hero.play('brace'); this.F.cracks.mesh.visible = true; this.crack = true; this.gust = 1; if (this.wildlife) { this.burstFlock(); this.sfx('forest_flock'); this.loop('forest_chorus', 0); } });
    this.once('feet', T.I + 0.85, () => this.hero.look(0.15, -0.5)); // he looks down at his boots
    [1.1, 1.6, 2.1, 2.55].forEach((d, i) => this.once('snap' + i, T.I + d, () => this.snapRoot(i)));
    this.once('crack2', T.I + 1.4, () => { this.sfx('crack'); this.sfx('trickle'); this.shake = 0.05; });
    this.once('look', T.I + 1.85, () => { this.hero.look(-0.4, 0.3); this.sfx('squeak'); });
    this.once('crack3', T.I + 2.4, () => { this.sfx('crack'); this.sfx('debris'); this.sfx('forest_groan', { vol: 0.07, pitch: 0.8 }); this.shake = 0.08; });
    this.once('break', T.J, () => this.breakGround());
    this.once('whoosh', T.J + 0.35, () => { this.sfx('whoosh'); this.loop('wind', 0.6); this.loop('forest_leaves', 0); this.loop('forest_air', 0); this.loop('forest_chorus', 0); });
    this.once('deb', T.K + 0.5, () => this.sfx('debris'));
    this.once('dark', T.K + 0.95, () => { this.unmuffle = muffle(au, 360); this.loop('rumble', 0); });
    this.once('thud', T.L - 0.25, () => { this.sfx('thud', { vol: 1 }); this.sfx('land', { hard: true }); this.loop('wind', 0); });
    // knocked out: the heart thumps in the dark, slowing
    const beats = [T.L + 0.4, T.L + 1.25, T.L + 2.15, T.L + 3.1];
    beats.forEach((b, i) => this.once('beat' + i, b, () => heartbeat(au, 0.5 - i * 0.08)));
    // the sagging ground and the cracks
    if (t >= T.I && t < T.J) {
      const k = ease(T.I, T.J, t);
      this.sag = k * k;
      this.F.cracks.uniforms.uReveal.value = ease(T.I + 0.45, T.J - 0.25, t);
      if (Math.random() < dt * 30) this.crackDust();
    }
  }

  /** A footfall of his: dust off the dirt, a hollow knock on the bridge, a leaf kicked up in the litter. */
  heroStep(side) {
    const H = this.heroPivot.position;
    const onBridge = !!this.onBridge;
    this.sfx('step', { mat: onBridge ? 'wood' : 'dirt', vol: 0.7 });
    if (onBridge) return;
    if (Math.random() < 0.3) this.sfx('forest_crunch', { vol: 0.8 }); // dry leaves on the trail
    const P = FOREST.trail.at(this.cur.s);
    const sx = -P.tz * (side ? 0.09 : -0.09), sz = P.tx * (side ? 0.09 : -0.09);
    const gy = H.y - 0.42; // (under his boots: the bank by the bridge eases up to the deck)
    for (let i = 0; i < 5; i++) this.dust.spawn({ pos: [H.x + sx + (Math.random() - 0.5) * 0.12, gy + 0.03, H.z + sz + (Math.random() - 0.5) * 0.12], vel: [(Math.random() - 0.5) * 0.35 - P.tx * 0.15, 0.1 + Math.random() * 0.2, (Math.random() - 0.5) * 0.35 - P.tz * 0.15], life: 0.9, color: 0xb89a74, color2: 0x8a7458, size: 0.025, size2: 0.06, alpha: 0.42, drag: 2.2, shape: SHAPE.square });
    if (Math.random() < 0.35) this.leaves.spawn({ pos: [H.x + sx, gy + 0.04, H.z + sz], vel: [(Math.random() - 0.5) * 0.5, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5], life: 1.2, color: Math.random() < 0.5 ? 0xa86a32 : 0x8a7a3a, size: 0.03, gravity: 3, drag: 1, spin: 8, shape: SHAPE.confetti });
  }

  crackDust() {
    const tips = this.F.cracks.tips(this.F.cracks.uniforms.uReveal.value);
    const p = tips.length ? tips[(Math.random() * tips.length) | 0] : null;
    if (p) for (let i = 0; i < 3; i++) this.dust.spawn({ pos: [p.x, 0.04, p.z], vel: [(Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5], life: 1.3, color: 0xa88a66, color2: 0x7a6248, size: 0.04, size2: 0.13, alpha: 0.45, drag: 1.6, shape: SHAPE.square });
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
    for (let k = 0; k < 10; k++) this.dust.spawn({ pos: [x, 0.05, z], vel: [(Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6], life: 1.6, color: 0xa88a66, color2: 0x6a5440, size: 0.05, size2: 0.18, alpha: 0.4, drag: 1.5, shape: SHAPE.square });
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
      this.dust.spawn({ pos: [Math.cos(a) * r, 0.05, Math.sin(a) * r], vel: [Math.cos(a) * 0.5, 0.4 + Math.random() * 1.4, Math.sin(a) * 0.5], life: 2.2, color: 0xa88a66, color2: 0x6a5440, size: 0.05, size2: 0.2, alpha: 0.38, drag: 1.4, shape: SHAPE.square });
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
    const H = this.heroPivot.position;
    const tr = FOREST.trail;
    const portrait = this.camera.aspect < 0.9;
    o.roll = 0; o.fov = 46; o.minH = portrait ? 34 : 46;
    switch (i) {
      case 0: { // up in the canopy, the low sun pouring through the leaves; craning down to him walking away up the trail into the light
        const u = ease(T.A + 0.2, T.B - 0.2, t);
        const P = tr.at(this.cur.s);
        const back = lerp(5.4, 3.3, u);
        o.pos.set(H.x - P.tx * back + P.tz * 0.2, lerp(3.4, H.y + 0.62, Math.pow(u, 0.9)), H.z - P.tz * back - P.tx * 0.2);
        // up the trail into the golden haze where the light pours through, then down to him
        const far = tr.at(this.cur.s + 16), ahead = tr.at(this.cur.s + 7);
        o.look.set(lerp(far.x, ahead.x * 0.6 + H.x * 0.4, u), lerp(far.y + 3.6, H.y + 0.32, Math.pow(u, 0.8)), lerp(far.z, ahead.z * 0.6 + H.z * 0.4, u));
        o.fov = lerp(50, 44, u);
        o.minH = portrait ? 40 : 46;
        break;
      }
      case 1: { // tracking with him from his left, low, ferns sliding past in front
        const P = tr.at(this.cur.s + 1.2);
        const u = (t - T.B) / (T.C - T.B);
        const side = lerp(2.1, 1.7, u);
        o.pos.set(P.x + P.tz * side, P.y + 0.62, P.z - P.tx * side);
        o.look.set(H.x, H.y + 0.15, H.z);
        o.fov = 42;
        o.minH = portrait ? 30 : 42;
        break;
      }
      case 2: { // close on his face from his right, tracking: he tips it up into the sun through the leaves, and smiles
        const P = tr.at(this.cur.s);
        const u = (t - T.C) / (T.D - T.C);
        const d = lerp(1.6, 1.4, u);
        // ahead of him and a little to his right, looking back at his face
        o.pos.set(H.x + P.tx * d - P.tz * 0.5, H.y + 0.32, H.z + P.tz * d + P.tx * 0.5);
        o.look.set(H.x + P.tx * 0.1, H.y + 0.2, H.z + P.tz * 0.1);
        o.fov = 38;
        o.minH = portrait ? 26 : 38;
        break;
      }
      case 3: { // low on the trail ahead, backing away as he comes on: his boots thumping down, dust puffing
        const u = (t - T.D) / (T.E - T.D);
        const P = tr.at(this.cur.s + lerp(2.3, 2.0, u));
        o.pos.set(P.x - P.tz * 0.25, P.y + 0.3, P.z + P.tx * 0.25);
        o.look.set(H.x, H.y - 0.12, H.z);
        o.fov = 40;
        o.minH = portrait ? 30 : 40;
        break;
      }
      case 4: { // the footbridge from downstream, low over the water
        const B = FOREST.bridge;
        const u = (t - T.E) / (T.F - T.E);
        const st = FOREST.stream, ss = FOREST.trail.cross.ss;
        const q = st.curve.getPointAt(clamp((ss + lerp(6.4, 5.6, u)) / st.L, 0, 1));
        o.pos.set(q.x, B.y + lerp(0.92, 0.78, u), q.z);
        o.look.set(lerp(B.x, H.x, 0.5), B.y + 0.36, lerp(B.z, H.z, 0.5));
        o.fov = 46;
        o.minH = portrait ? 34 : 46;
        break;
      }
      case 5: { // into the clearing, low beside the nest: he comes out of the trees toward us, slows at a faint peep, turns his head to it
        const NS = FOREST.nest, P = tr.at(NS.s);
        const u = ease(T.F, T.N, t);
        const rx = -P.tz, rz = P.tx; // his right
        const x = NS.x + P.tx * lerp(1.7, 1.45, u) + rx * 0.5, z = NS.z + P.tz * lerp(1.7, 1.45, u) + rz * 0.5;
        o.pos.set(x, groundH(x, z) + lerp(0.62, 0.5, u), z);
        o.look.set(lerp(H.x, NS.x, 0.3), lerp(H.y + 0.2, groundH(NS.x, NS.z) + 0.1, 0.3), lerp(H.z, NS.z, 0.3));
        o.fov = 44;
        o.minH = portrait ? 34 : 44;
        break;
      }
      case 6: { // the nest, low on its far side: the egg in its straw, and him coming down to it
        const NS = FOREST.nest, P = tr.at(NS.s);
        const u = ease(T.N, T.N2, t);
        const rx = -P.tz, rz = P.tx;
        const x = NS.x + rx * lerp(0.95, 0.82, u) + P.tx * 0.42, z = NS.z + rz * lerp(0.95, 0.82, u) + P.tz * 0.42;
        const gy = groundH(NS.x, NS.z);
        o.pos.set(x, gy + lerp(0.3, 0.24, u), z);
        o.look.set(lerp(NS.x, H.x, 0.4), gy + lerp(0.22, 0.2, u), lerp(NS.z, H.z, 0.4));
        o.fov = 40;
        o.minH = portrait ? 30 : 40;
        break;
      }
      case 7: { // close on his face and the egg in his paws, from the front: it wobbles, peeps; he smiles
        const u = ease(T.N2, T.N3, t);
        const f = this.facing(_v2), E = this.eggAt(_v3);
        const lx = f.z, lz = -f.x; // his left
        // (from a little above the egg, so his snout doesn't hide it)
        o.pos.set(E.x + f.x * lerp(0.95, 0.85, u) + lx * 0.34, E.y + 0.24, E.z + f.z * lerp(0.95, 0.85, u) + lz * 0.34);
        o.look.set(E.x - f.x * 0.04, E.y + lerp(0.1, 0.12, u), E.z - f.z * 0.04);
        o.fov = 38;
        o.minH = portrait ? 26 : 36;
        break;
      }
      case 8: { // wrapped and stowed: three-quarters from his right, swinging round behind him as the bundle goes up onto his pack
        const u = ease(T.N3 + 1.3, T.N3 + 2.8, t);
        const f = this.facing(_v2);
        const rx = -f.z, rz = f.x; // his right
        const fwd = lerp(1.35, 0.35, u), side = lerp(0.85, 1.25, u);
        const gy = H.y - 0.42;
        o.pos.set(H.x + f.x * fwd + rx * side, gy + lerp(0.55, 0.8, u), H.z + f.z * fwd + rz * side);
        o.look.set(H.x - f.x * 0.1 * u, gy + lerp(0.32, 0.5, u), H.z - f.z * 0.1 * u);
        o.fov = 40;
        o.minH = portrait ? 32 : 40;
        break;
      }
      case 9: { // into the clearing over his left shoulder: the chest glitters in its beam of light ahead
        const u = ease(T.F2, T.G, t);
        const P = tr.at(this.cur.s);
        const lx = P.tz, lz = -P.tx; // his left
        o.pos.set(H.x + lx * lerp(1.2, 0.95, u) - P.tx * lerp(2.5, 1.9, u), H.y + lerp(0.8, 0.66, u), H.z + lz * lerp(1.2, 0.95, u) - P.tz * lerp(2.5, 1.9, u));
        o.look.set(lerp(H.x + P.tx * 2, 0, 0.65), lerp(H.y + 0.1, 0.3, 0.7), lerp(H.z + P.tz * 2, -0.1, 0.65));
        o.fov = lerp(46, 38, u);
        o.minH = portrait ? 32 : 46;
        break;
      }
      case 10: { // the chest: low and close, pushing in as the lid creaks and gold light pours out
        const u = ease(T.G, T.H, t);
        o.pos.set(lerp(1.0, 0.66, u), lerp(0.46, 0.4, u), lerp(1.9, 1.4, u));
        o.look.set(-0.05, lerp(0.28, 0.38, u), -0.12);
        o.fov = lerp(42, 36, u);
        o.minH = portrait ? 30 : 42;
        break;
      }
      case 11: { // his face, lit gold from below; he reaches for it
        const u = ease(T.H, T.I, t);
        // (wave 12: out beside the chest, not against it: the gems in it kept ~0.4 m off the lens, the
        // line to his face clearing the chest's corner)
        o.pos.set(H.x + lerp(0.78, 0.7, u), lerp(0.4, 0.38, u), H.z - lerp(1.42, 1.3, u));
        o.look.set(H.x, H.y + 0.2, H.z);
        o.fov = lerp(38, 33, u);
        o.minH = portrait ? 26 : 36;
        break;
      }
      case 12: { // the ground groans: low by his boots, looking up at him as he glances up at the creaking trees, then down at the turf
        const u = ease(T.I, T.I2, t);
        const P = tr.at(this.cur.s), f = lerp(1.0, 0.85, u), l = lerp(1.45, 1.3, u); // ahead of him and to his left
        const x = H.x + P.tx * f + P.tz * l, z = H.z + P.tz * f - P.tx * l;
        o.pos.set(x, groundH(x, z) + 0.2, z);
        o.look.set(H.x, H.y + lerp(-0.1, 0.1, u), H.z);
        o.fov = 44;
        o.minH = portrait ? 30 : 44;
        break;
      }
      case 13: { // the ground sags and cracks race outward: wide and low
        const u = ease(T.I, T.J, t);
        o.pos.set(lerp(2.4, 3.3, u), lerp(1.3, 2.4, u), lerp(2.9, 3.8, u));
        o.look.set(0, lerp(0.45, 0.05, u), 0.25);
        o.fov = lerp(48, 54, u);
        o.minH = portrait ? 40 : 48;
        break;
      }
      case 14: { // it breaks: from above, down into the hole after him
        const tau = t - T.J;
        o.pos.set(0.9, 3.3 - tau * 0.4, 2.0);
        o.look.set(H.x * 0.6, Math.max(H.y, -6), H.z * 0.6);
        o.fov = 54;
        o.minH = portrait ? 44 : 54;
        break;
      }
      case 15: { // falling with him from below: the light of the hole shrinking above
        const tau = t - T.K;
        const gap = lerp(3.2, 1.5, smooth(tau / (T.L - T.K - 0.4)));
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
    const blendFrom = { 1: 0.9, [FALL_SHOT]: 0.25 };
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
    if (i < FALL_SHOT && !this.pin) cam.position.y = Math.max(cam.position.y, groundH(cam.position.x, cam.position.z) + 0.12);
    // handheld drift, plus shake
    const hh = this.pin ? 0 : i < FALL_SHOT ? 0.01 : 0.004;
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
    this.hemi.intensity = 0.12 + 0.83 * dl;
    this.sun.intensity = 3.3 * dl;
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
    if (t >= T.K + 0.8) {
      const k = ease(T.K + 0.8, T.L - 0.1, t);
      p.fade = k * 0.92;
      p.fadeColor = 0x000000;
    }
    if (t >= T.L) {
      if (this.bottomY == null) this.bottomY = this.heroPivot.position.y + 0.3;
      const u = t - T.L;
      const blink = Math.max(0, Math.sin(Math.min(u, 2.6) * 2.6)) * (1 - u / 2.6);
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
    this.fallLight.intensity = t > T.J ? 3.2 * fogK * (1 - ease(T.K + 0.95, T.L, t)) : 0;
    F.outlineFar = this.post.outline === false ? 0 : this.post.outlineFar || 0; // (the forest leaves what's past it out of the outline pass)
    F.update(dt, cam, sc.fog);
    this.dress.update(dt, cam);
    this.drift.update(dt, cam, this.game.engine.height);
    // the leaves and pollen in the air: everywhere on the surface, gone below it
    this.drift.group.visible = cy > -0.6 && t < T.K;
    this.drift.set({ leaves: t > T.I ? 1 : 0.85 });
    this.shaft.update?.(dt);
    // the forest's animals
    const life = this._life || (this._life = { sfx: (name, o) => this.sfx('forest_' + name, o) });
    Object.assign(life, { t, hero: this.heroPivot.position, cam, glint: !!this.glint, crack: !!this.crack, quiet: t > T.I - 0.1 });
    this.critters.update(dt, life);
    this.flocks.update(dt, life);
    // the flock wheeling away from the clearing
    for (const b of this.flockBirds) {
      if (!b.visible) continue;
      const U = b.userData;
      U.t += dt;
      const r = U.r + U.t * U.sp, a = U.a + Math.sin(U.t * 0.8 + U.ph) * 0.25;
      b.position.set(Math.cos(a) * r, U.h + U.t * U.up + Math.sin(U.t * 5 + U.ph) * 0.15, Math.sin(a) * r);
      b.rotation.set(-0.3, Math.atan2(Math.cos(a), Math.sin(a)), 0); // heading out, climbing
      flap(U.rig, U.t * 1.2 + U.ph, 0.15);
      if (U.t > 6) b.visible = false;
    }
    // the bars come off for the fall
    if (t > T.J && !this._barsOff) { this._barsOff = true; this.bars.classList.remove('on'); }

    // surface life: motes turning in the shafts of sun (the drifting leaves and the pollen
    // everywhere else are on the GPU: forest/drift.js)
    if (t < T.J + 0.5 && cy > -1) {
      const beams = F.beams;
      for (let k = 0; k < 2; k++) if (Math.random() < dt * 22) {
        const b = beams[(Math.random() * beams.length) | 0].userData.beam;
        const p0 = _v.copy(b.bottom).lerp(b.top, Math.random() * 0.6);
        if (p0.distanceTo(cam.position) < 26) this.motes.spawn({ pos: [p0.x + (Math.random() - 0.5) * b.w * 0.6, p0.y, p0.z + (Math.random() - 0.5) * b.w * 0.6], vel: [0.05, -0.02, -0.02], life: 5, color: 0xfff0b8, size: 0.02, wobble: 0.25, flicker: 0.6, fadeIn: 0.8 });
      }
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
    if (hr.state === 'walk' && hr.stepN !== this._stepPh) { this._stepPh = hr.stepN; this.heroStep(1 - hr.stepFoot); } // (his own footfalls: gait.js)
    for (const pl of this.pools) pl.update(dt);
  }
}
