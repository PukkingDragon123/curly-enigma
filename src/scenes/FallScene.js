// The journey: up on the surface, the young blacksmith mole walks an old forest trail at golden
// hour (tall pines, light shafts, mist on the stream, birds, pollen) with Nugget's walking coop
// stomping along beside him and Nugget peeking out of its window. They cross a stream (he takes
// the log bridge, the coop wades), and in a sunny clearing find a strange old chest spilling
// gold and gems. He walks up to it... the ground sags, cracks race across the clearing, the crust
// gives way and he tumbles down a dark shaft. Darkness, a heartbeat, muffled ringing: he blacks
// out. Ends with goto('home', { from: 'fall' }) (the home scene wakes him). ~34 s, skippable
// (Skip, Esc, a tap).
// Dev: ?scene=fall&at=secs to start later, &freeze=1 to stop time. Test hooks: scene.debug.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { mixGrade } from '../core/Engine.js';
import { el, clamp, lerp } from '../core/util.js';
import { useBookendStyles } from '../bookends/css.js';
import { disposeTextures, setPixelScale, Particles, SHAPE, fitFov } from '../bookends/fx.js';
import { buildForest, FOREST, SUN_DIR, groundH, HOLE_R } from '../bookends/forest.js';
import { buildFallShaft } from '../bookends/fallshaft.js';
import { makeHeroMole } from '../gfx/char/hero.js';
import { loadCoop, birdsong, heartbeat, muffle } from '../bookends/journey.js';

// the timeline (seconds): shots A..I
const T = { A: 0, B: 5.2, C: 9.6, D: 14.6, E: 19.2, F: 24.2, G: 27.8, H: 29.3, I: 32.2, END: 36.8 };
const CAP = [0.8, 4.6];
const WALK = 1.05; // m/s
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ease = (a, b, x) => smooth((x - a) / (b - a));
const _v = new THREE.Vector3();

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
    this.sag = 0;
    this.cur = { s: 0, cs: 0 };

    const sc = this.scene;
    this.haze = new THREE.Color(0xcad6bc);
    this.dark = new THREE.Color(0x080605);
    sc.background = this.haze.clone();
    sc.fog = new THREE.Fog(this.haze.clone(), 14, 74);
    this.camera = new THREE.PerspectiveCamera(48, this.game.engine.aspect, 0.05, 200);

    // ---- the forest
    // phones and 'Simple' shaders get a lighter forest
    const lite = this.game.engine.fx !== 'high' || params.lite === '1';
    this.F = buildForest({ lite });
    this.textures.push(...this.F.textures);
    sc.add(this.F.group, this.F.sky);
    this.own(() => this.F.dispose());

    // ---- light: a low warm sun through the trees, sky and fill
    this.hemi = new THREE.HemisphereLight(0xc4dcf0, 0x4a5a2c, 1.15);
    // down the shaft a little warm light falls with him (the daylight from the hole, bounced)
    this.fallLight = new THREE.PointLight(0xffd8a8, 0, 7, 1.4);
    sc.add(this.fallLight);
    this.sun = new THREE.DirectionalLight(0xffdcaa, 2.5);
    this.sun.position.copy(SUN_DIR).multiplyScalar(30);
    this.fill = new THREE.DirectionalLight(0xd6e2ff, 0.55);
    this.fill.position.set(0.5, 0.6, 1).multiplyScalar(30);
    sc.add(this.hemi, this.sun, this.fill);

    // ---- the travellers
    this.hero = makeHeroMole({ height: 0.86 });
    this.heroPivot = new THREE.Group(); // tumbling happens round his middle
    this.heroPivot.add(this.hero.root);
    this.hero.root.position.y = -0.42;
    sc.add(this.heroPivot);
    this.own(() => this.hero.dispose());
    this.coop = await loadCoop({ height: 1.15 });
    sc.add(this.coop.root);
    this.own(() => this.coop.dispose?.());
    this.coop.onStep = (side, k) => this.coopStep(side, k);
    if (!this.coop.isPlaceholder) console.log('[fall] using the coop model');

    // ---- the shaft under the clearing (streams in while they walk)
    this.shaft = buildFallShaft({ floorY: -60, ledges: [], waterfall: null, land: { x: 0, z: 0, a: 0 } });
    sc.add(this.shaft.group);
    this.shaft.ensure(-3);

    // ---- particles
    this.dust = new Particles({ max: 500, additive: false, atten: true });
    this.debris = new Particles({ max: 400, additive: false, atten: true });
    this.sparks = new Particles({ max: 260, additive: true, atten: true });
    this.motes = new Particles({ max: 360, additive: true, atten: true });
    this.leaves = new Particles({ max: 90, additive: false, atten: true });
    this.splash = new Particles({ max: 260, additive: false, atten: true });
    this.coins = new Particles({ max: 220, additive: false, atten: true });
    this.pools = [this.dust, this.debris, this.sparks, this.motes, this.leaves, this.splash, this.coins];
    for (const p of this.pools) sc.add(p.points);

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

    this.post.vignette = 0.24;
    this.post.saturation = 1.1;
    this.post.contrast = 1.04;
    this.onResize(this.game.engine.width, this.game.engine.height);
    this.place(0, 0);
    try { this.game.engine.renderer.compile(sc, this.camera); } catch (e) { /* optional */ }
    console.log(`[fall] built in ${Math.round(performance.now() - t0)} ms (forest ${JSON.stringify(this.F.stats)})`);

    this.debug = {
      at: (secs) => { const k = Math.max(0, secs - this.t); for (let s = 0; s < k; s += 1 / 30) this.update(1 / 30); return this.t; },
      time: () => this.t,
      shot: () => this.shotIndex,
      skip: () => this.skip(),
      state: () => ({ t: this.t, shot: this.shotIndex, hero: this.hero.state, sag: this.sag, s: this.cur.s, coop: !this.coop.isPlaceholder }),
    };
    const at = parseFloat(params.at) || 0;
    if (at > 0) this.debug.at(at);
    this.frozen = !!params.freeze;
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

  render() { this.game.engine.render(this.scene, this.camera, this.post); }

  onResize(w, h) {
    setPixelScale(h);
    if (!this.camera) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  exit() {
    this.leaving = true;
    this.unmuffle?.();
    super.exit();
  }

  // ------------------------------------------------------------------ where everyone is
  /** The hero's trail position s (m) at time t; cuts jump ahead along the trail. */
  heroS(t) {
    const L = FOREST.trail.length, X = FOREST.trail.cross.s;
    if (t < T.C) return 6.5 + WALK * t;
    if (t < T.D) return X - 3.8 + WALK * (t - T.C);
    // into the clearing, slowing to a stop when he sees it...
    if (t < T.E) return L - 7.4 + 3.8 * (1 - Math.pow(1 - (t - T.D) / (T.E - T.D), 1.6));
    // ...a look, then slowly up to the chest: he stops right at the spill
    return lerp(L - 3.6, L - 0.05, ease(T.E + 1.0, T.E + 4.0, t));
  }
  /** The coop's s: a step behind; it hangs back at the clearing's edge. */
  coopS(t) {
    const L = FOREST.trail.length;
    if (t < T.D) return this.heroS(t) - 0.8;
    return Math.min(this.heroS(t) - 0.8, L - 5.2 + (t > T.F + 1.2 ? -0.7 * ease(T.F + 1.2, T.F + 2.2, t) : 0));
  }

  /** Put the hero and the coop where they belong at time t (dt drives their animation). */
  place(t, dt) {
    const hero = this.hero, coop = this.coop, tr = FOREST.trail;
    const s = this.heroS(t), cs = this.coopS(t);
    const vH = dt > 0 ? (s - this.cur.s) / dt : 0, vC = dt > 0 ? (cs - this.cur.cs) / dt : 0;
    const jump = Math.abs(s - this.cur.s) > 1; // a cut
    this.cur.s = s; this.cur.cs = cs;
    const P = tr.at(s), Q = tr.at(cs);
    const fallen = t >= T.G;
    // the hero: a little left of the middle of the trail
    if (!fallen) {
      const off = t < T.E ? -0.22 : -0.22 * (1 - ease(T.E, T.E + 2.5, t));
      let x = P.x - P.tz * off, z = P.z + P.tx * off;
      let y = groundH(x, z);
      const B = FOREST.bridge;
      if (B && Math.abs(s - B.s) < B.half + 0.2) y = Math.max(y, B.y - Math.sin(clamp(1 - Math.abs(s - B.s) / B.half, 0, 1) * Math.PI / 2) * 0.05);
      // on the crust: he sinks with it
      if (Math.hypot(x, z) < HOLE_R + 0.3) y -= this.sag * 0.13;
      this.heroPivot.position.set(x, y + 0.42, z);
      this.heroPivot.rotation.set(0, 0, 0);
      // walking windows: on the trail, and the last slow steps up to the chest
      const speed = jump ? WALK : Math.abs(vH);
      const walking = t < T.E || (t > T.E + 1.0 && t < T.E + 4.0);
      if (walking) {
        if (speed > 0.12) { hero.play('walk', clamp(speed / WALK, 0.55, 1.25)); hero.face(P.yaw); }
        else if (hero.state === 'walk') hero.play('idle');
      }
    }
    hero.update(dt);
    // the coop: on the right, half a step behind, wading beside the bridge
    {
      const off = t < T.D ? 0.72 : lerp(0.72, 1.3, ease(T.D, T.E, t));
      const x = Q.x - Q.tz * off, z = Q.z + Q.tx * off;
      coop.root.position.set(x, groundH(x, z), z);
      if (!this.coopFace) coop.face(Q.yaw, true);
      const sp = jump ? WALK : Math.abs(vC);
      if (!this.coopFace) coop.face(Q.yaw);
      coop.update(dt, { speed: sp, moving: sp > 0.05 });
    }
    return P;
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    if (this.frozen) dt = 0;
    super.update(dt);
    if (this.leaving) return;
    if (this.pendingSkip) { this.pendingSkip = false; this.skip(); return; }
    const t = (this.t += dt);
    // the shaft walls stream in a few ms a frame while they walk; they must be ready for the fall
    this.shaft.prebuild(t < T.F ? 2 : 3);
    if (t > T.F) this.shaft.ensure(-14);
    if (t > T.G) this.shaft.ensure(Math.max(-40, Math.min(this.camera.position.y, this.heroPivot.position.y) - 12));
    this.story(t, dt);
    this.place(t, dt);
    this.updateFall(t, dt);
    this.updateCamera(t, dt);
    this.updateWorld(t, dt);
    if (t >= T.END) this.leave(0.4);
  }

  // ------------------------------------------------------------------ the story beats
  story(t, dt) {
    const au = this.game.audio;
    this.once('amb', 0, () => { this.loop('wind', 0.1); });
    this.once('cap', CAP[0], () => this.caption.classList.add('on'));
    this.once('capoff', CAP[1], () => this.caption.classList.remove('on'));
    // birdsong now and then while they walk
    this.birdT = (this.birdT ?? 0.6) - dt;
    if (t < T.F && this.birdT <= 0) { this.birdT = 1.2 + Math.random() * 2.6; birdsong(au, { pan: Math.random() * 1.6 - 0.8, pitch: 0.8 + Math.random() * 0.5 }); }
    this.once('cluck1', 2.2, () => this.sfx('cluck', { n: 2 }));
    this.once('peck', 6.4, () => this.coop.peck?.());
    this.once('cluck2', 7.6, () => this.sfx('cluck', { n: 3, pitch: 1.1 }));
    this.once('nod', 8.2, () => this.hero.doEmote('nod', 1));
    // the bridge: planks thud under him, the coop splashes through
    this.once('bridge', T.C + 0.2, () => { this.sfx('cluck', { n: 1 }); });
    // the clearing: something glitters
    this.once('glint', T.D + 1.6, () => { this.sfx('sparkle', { vol: 0.6 }); this.hero.doEmote('surprise', 1.3); });
    this.once('stop', T.E, () => { this.hero.play('peer'); this.hero.look(0, 0.1); });
    this.once('bawk', T.E + 0.35, () => { this.sfx('bawk'); this.coop.shake?.(1); });
    this.once('walk2', T.E + 1.0, () => this.hero.look(0, 0));
    this.once('cluckno', T.E + 1.6, () => { this.sfx('cluck', { n: 4, pitch: 1.25 }); this.coop.hop?.(); });
    this.once('coins', T.E + 3.6, () => this.sfx('coins', { n: 5 }));
    this.once('reach', T.E + 4.0, () => this.hero.play('reach'));
    this.once('chime', T.E + 4.3, () => this.sfx('sparkle', { vol: 0.8 }));
    // the ground goes
    this.once('creak', T.F, () => { this.sfx('creak'); this.loop('rumble', 0.5); au.stopMusic(1.4); this.shake = 0.015; this.hero.play('idle'); this.hero.look(0, 0.35); });
    this.once('crack1', T.F + 0.6, () => { this.sfx('crack'); this.sfx('rumble_hit'); this.hero.doEmote('surprise', 2); this.hero.play('brace'); this.F.cracks.mesh.visible = true; });
    this.once('bawk2', T.F + 0.9, () => { this.sfx('bawk', { pitch: 1.1 }); this.coop.hop?.(); this.coop.shake?.(1.5); });
    this.once('crack2', T.F + 1.7, () => { this.sfx('crack'); this.sfx('trickle'); this.shake = 0.05; });
    this.once('look', T.F + 2.2, () => { this.hero.look(-0.4, 0.3); this.sfx('squeak'); });
    this.once('crack3', T.F + 2.9, () => { this.sfx('crack'); this.sfx('debris'); this.shake = 0.08; });
    this.once('break', T.G, () => this.breakGround());
    this.once('bawk3', T.G + 0.5, () => this.sfx('bawk', { pitch: 1.2 }));
    this.once('coopturn', T.G + 0.3, () => { // the coop wheels round to stare down the hole
      this.coopFace = true;
      const c = this.coop.root.position;
      this.coop.face(Math.atan2(-c.x, -c.z));
      this.coop.hop?.();
    });
    this.once('whoosh', T.G + 0.4, () => { this.sfx('whoosh'); this.loop('wind', 0.6); });
    this.once('deb', T.H + 0.6, () => this.sfx('debris'));
    this.once('dark', T.H + 1.2, () => { this.unmuffle = muffle(au, 360); this.loop('rumble', 0); });
    this.once('thud', T.I - 0.25, () => { this.sfx('thud', { vol: 1 }); this.sfx('land', { hard: true }); this.loop('wind', 0); });
    // knocked out: the heart thumps in the dark, slowing
    const beats = [T.I + 0.5, T.I + 1.55, T.I + 2.7, T.I + 3.95];
    beats.forEach((b, i) => this.once('beat' + i, b, () => heartbeat(au, 0.5 - i * 0.08)));
    // the sagging ground and the cracks
    if (t >= T.F && t < T.G) {
      const k = ease(T.F, T.G, t);
      this.sag = k * k;
      this.F.cracks.uniforms.uReveal.value = ease(T.F + 0.55, T.G - 0.3, t);
      if (Math.random() < dt * 30) this.crackDust();
    }
  }

  coopStep(side, k = 1) {
    const c = this.coop.root.position;
    const wet = groundH(c.x, c.z) < -0.45;
    if (this.t > T.F + 3) return;
    if (wet) {
      this.sfx('splash', { vol: 0.6 });
      for (let i = 0; i < 16; i++) this.splash.spawn({ pos: [c.x + (Math.random() - 0.5) * 0.4, -0.45, c.z + (Math.random() - 0.5) * 0.4], vel: [(Math.random() - 0.5) * 1.4, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 1.4], life: 0.9, color: 0xe8f6ff, color2: 0x8ac0e0, size: 0.035, size2: 0.02, gravity: 9, shape: SHAPE.square });
    } else {
      this.sfx('step', { mat: 'dirt', vol: 0.8 });
      for (let i = 0; i < 4; i++) this.dust.spawn({ pos: [c.x + (Math.random() - 0.5) * 0.3, groundH(c.x, c.z) + 0.03, c.z + (Math.random() - 0.5) * 0.3], vel: [(Math.random() - 0.5) * 0.4, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.4], life: 0.9, color: 0xb89a70, color2: 0x8a7458, size: 0.05, size2: 0.12, alpha: 0.4, drag: 2, shape: SHAPE.round });
    }
  }

  crackDust() {
    const tips = this.F.cracks.tips(this.F.cracks.uniforms.uReveal.value);
    const p = tips.length ? tips[(Math.random() * tips.length) | 0] : null;
    if (p) for (let i = 0; i < 3; i++) this.dust.spawn({ pos: [p.x, 0.04, p.z], vel: [(Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5], life: 1.2, color: 0xa88a66, color2: 0x7a6248, size: 0.04, size2: 0.12, alpha: 0.45, drag: 1.6, shape: SHAPE.round });
    // grit trickling into the gaps between the crust pieces
    const a = Math.random() * Math.PI * 2, r = Math.random() * HOLE_R;
    this.debris.spawn({ pos: [Math.cos(a) * r, -this.sag * 0.1, Math.sin(a) * r], vel: [0, -0.3, 0], life: 1.4, color: Math.random() < 0.5 ? 0x5a3e2a : 0x7a6a58, size: 0.025, gravity: 6, shape: SHAPE.square });
  }

  breakGround() {
    this.sfx('collapse', { vol: 1 });
    this.sfx('break', { vol: 1 });
    this.sfx('crack');
    this.sfx('rumble_hit');
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
    for (let i = 0; i < 140; i++) {
      const gem = i % 9 === 0;
      this.coins.spawn({
        pos: [(Math.random() - 0.5) * 0.8, 0.05 + Math.random() * 0.2, 0.1 + Math.random() * 0.8],
        vel: [(Math.random() - 0.5) * 1.6, 0.6 + Math.random() * 2.4, (Math.random() - 0.5) * 1.6 - 0.4],
        life: 3.2, color: gem ? [0xff5a7a, 0x5ae0ff, 0x7aff8a][i % 3] : Math.random() < 0.5 ? 0xffd040 : 0xf2b030, color2: gem ? 0xffffff : 0xa86a10,
        size: gem ? 0.045 : 0.04, gravity: 9.8, spin: 12, shape: gem ? SHAPE.diamond : SHAPE.confetti,
      });
    }
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, r = HOLE_R * (0.8 + Math.random() * 0.4);
      this.dust.spawn({ pos: [Math.cos(a) * r, 0.05, Math.sin(a) * r], vel: [Math.cos(a) * 0.4, 0.4 + Math.random() * 1.2, Math.sin(a) * 0.4], life: 2, color: 0xa88a66, color2: 0x6a5440, size: 0.05, size2: 0.16, alpha: 0.35, drag: 1.4, shape: SHAPE.round });
    }
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * HOLE_R;
      const leaf = i % 3 === 0;
      this.debris.spawn({ pos: [Math.cos(a) * r, 0.02, Math.sin(a) * r], vel: [(Math.random() - 0.5) * 1.2, leaf ? 1 : -Math.random() * 2, (Math.random() - 0.5) * 1.2], life: 2.6, color: leaf ? 0x6ab448 : Math.random() < 0.6 ? 0x5a3e2a : 0x3e5a2a, size: leaf ? 0.05 : 0.04, gravity: leaf ? 1.5 : 9, drag: leaf ? 1 : 0.2, spin: leaf ? 6 : 0, shape: leaf ? SHAPE.confetti : SHAPE.square });
    }
    this.F.cracks.uniforms.uReveal.value = 1;
  }

  /** The crust sagging and falling, the chest tumbling, the hero dropping into the dark. */
  updateFall(t, dt) {
    const F = this.F;
    // the crust: sags toward the middle, trembles, then the pieces drop
    for (const p of F.crust) {
      if (!p.vel) {
        const r = p.home.length();
        const k = this.sag;
        const tremble = t > T.F ? (Math.random() - 0.5) * 0.006 * (1 + k * 3) : 0;
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
    // the chest rides the middle piece down, then tumbles
    const ch = F.chest.group;
    if (!this.chestFall) {
      ch.position.y = -this.sag * 0.13;
      ch.rotation.z = Math.sin(t * 31) * 0.01 * this.sag;
      F.spill.mesh.position.y = -this.sag * 0.11;
      F.spill.mesh.rotation.x = -this.sag * 0.12;
    } else {
      const c = this.chestFall;
      c.vy -= 9.8 * dt;
      ch.position.y += c.vy * dt;
      ch.rotation.x += c.spin * dt;
      F.chest.lidPivot.rotation.x = -1.15 - Math.sin(t * 14) * 0.5;
      if (ch.position.y < -30) ch.visible = false;
    }
    F.chestGlow.position.set(ch.position.x, ch.position.y + 0.45, ch.position.z);
    // the hero: free fall, tumbling, drifting to the middle of the shaft
    if (this.fallStart) {
      const tau = t - T.G;
      const P = this.heroPivot.position;
      const fs = this.fallStart;
      // falling with drag: about 5.5 m/s at most, so the dark comes before the bottom does
      const vt = 5.5, g = 9.8;
      const drop = (vt * vt / g) * Math.log(Math.cosh((g * tau) / vt));
      P.set(lerp(fs.x, 0.1, smooth(tau / 1.2)), fs.y - drop, lerp(fs.z, 0.15, smooth(tau / 1.2)));
      this.heroPivot.rotation.set(-tau * 2.6, tau * 0.7, Math.sin(tau * 3) * 0.6);
    }
  }

  // ------------------------------------------------------------------ camera
  shot(i, t, o) {
    const H = this.heroPivot.position, C = this.coop.root.position;
    const tr = FOREST.trail;
    o.roll = 0; o.fov = 46;
    switch (i) {
      case 0: { // the canopy and its light, craning down to the pair coming up the trail
        const u = ease(T.A, T.B, t);
        const P = tr.at(this.cur.s);
        o.pos.set(H.x + lerp(1.4, 1.5, u), lerp(3.6, 1.3, u), H.z + lerp(6.5, 3.4, u));
        _v.set(H.x - 0.6 + P.tx * 0, lerp(2.6, 0.55, u), H.z - lerp(14, 0, u));
        o.look.copy(_v);
        o.fov = lerp(52, 44, u);
        break;
      }
      case 1: { // walking with them: ahead and to the side, low, faces in the sun
        const P = tr.at(this.cur.s + 2.6);
        const u = (t - T.B) / (T.C - T.B);
        o.pos.set(P.x - P.tz * lerp(1.7, 1.2, u), P.y + 0.72, P.z + P.tx * lerp(1.7, 1.2, u));
        o.look.set((H.x * 2 + C.x) / 3, H.y + 0.25, (H.z * 2 + C.z) / 3);
        o.fov = 44;
        break;
      }
      case 2: { // the footbridge from downstream, low over the water
        const B = FOREST.bridge;
        const q = FOREST.stream.curve.getPointAt(clamp(FOREST.trail.cross.s / FOREST.trail.length, 0, 1));
        const u = (t - T.C) / (T.D - T.C);
        o.pos.set(B.x + 3.4 - u * 0.6, B.y + 0.35, B.z + 2.4 - u * 0.4);
        o.look.set(lerp(B.x + 0.5, H.x, 0.65), B.y + 0.35, lerp(B.z, H.z, 0.65));
        o.fov = 48;
        void q;
        break;
      }
      case 3: { // into the clearing over his left shoulder: the chest glitters in a beam of light ahead
        const u = ease(T.D, T.E, t);
        const P = tr.at(this.cur.s);
        const lx = P.tz, lz = -P.tx; // his left
        o.pos.set(H.x + lx * lerp(1.25, 1.0, u) - P.tx * lerp(2.6, 2.0, u), H.y + lerp(0.85, 0.7, u), H.z + lz * lerp(1.25, 1.0, u) - P.tz * lerp(2.6, 2.0, u));
        o.look.set(lerp(H.x + P.tx * 2, 0, 0.65), lerp(H.y + 0.1, 0.3, 0.7), lerp(H.z + P.tz * 2, -0.1, 0.65));
        o.fov = lerp(46, 40, u);
        break;
      }
      case 4: { // low, side on: he walks into frame, up to the chest, and reaches for it
        const u = ease(T.E + 1.0, T.F, t);
        o.pos.set(lerp(-3.7, -3.0, u), lerp(0.78, 0.62, u), lerp(3.0, 2.5, u));
        o.look.set(lerp(0.2, 0.05, u), 0.4, lerp(2.0, 0.9, u));
        o.fov = 46;
        break;
      }
      case 5: { // the ground sags and cracks race outward
        const u = ease(T.F, T.G, t);
        o.pos.set(lerp(2.2, 3.1, u), lerp(1.5, 2.6, u), lerp(2.7, 3.6, u));
        o.look.set(0, lerp(0.35, 0.05, u), 0.3);
        o.fov = lerp(46, 52, u);
        break;
      }
      case 6: { // it breaks: from above, down into the hole after him
        const tau = t - T.G;
        o.pos.set(0.9, 3.3 - tau * 0.4, 2.0);
        o.look.set(H.x * 0.6, Math.max(H.y, -6), H.z * 0.6);
        o.fov = 54;
        break;
      }
      case 7: { // falling with him from below: the light of the hole shrinking above
        const tau = t - T.H;
        const gap = lerp(3.2, 1.5, smooth(tau / 2.2));
        o.pos.set(0.45, H.y - gap, 0.55);
        o.look.set(H.x * 0.5, H.y + 0.6, H.z * 0.5);
        o.roll = Math.sin(tau * 1.3) * 0.14;
        o.fov = 60;
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
    const starts = [T.A, T.B, T.C, T.D, T.E + 1.0, T.F, T.G, T.H, T.I]; // D holds while he stops and stares
    let i = 0;
    while (i + 1 < starts.length && t >= starts[i + 1]) i++;
    this.shotIndex = i;
    const A = this._sa || (this._sa = { pos: new THREE.Vector3(), look: new THREE.Vector3() });
    const B = this._sb || (this._sb = { pos: new THREE.Vector3(), look: new THREE.Vector3() });
    this.shot(i, t, A);
    // hard cuts, except the shots that flow on from the one before
    const blendFrom = { 1: 0.9, 5: 0.5, 6: 0.25 };
    const bl = blendFrom[i];
    if (bl && t - starts[i] < bl) {
      const k = smooth((t - starts[i]) / bl);
      this.shot(i - 1, t, B);
      A.pos.lerpVectors(B.pos, A.pos, k);
      A.look.lerpVectors(B.look, A.look, k);
      A.roll = lerp(B.roll, A.roll, k);
      A.fov = lerp(B.fov, A.fov, k);
    }
    const cam = this.camera;
    cam.position.copy(A.pos);
    // keep the camera out of the ground (and out of the trees' trunks)
    if (i < 6) cam.position.y = Math.max(cam.position.y, groundH(cam.position.x, cam.position.z) + 0.25);
    // handheld drift, plus shake
    const hh = i < 5 ? 0.012 : 0.004;
    cam.position.x += Math.sin(t * 0.7) * hh; cam.position.y += Math.sin(t * 0.9 + 1) * hh;
    this.shake = Math.max(0, this.shake - dt * 0.12);
    if (t > T.F && t < T.G) this.shake = Math.max(this.shake, 0.008 + 0.03 * ease(T.F, T.G, t));
    const sh = this.shake;
    if (sh > 0) cam.position.add(_v.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
    cam.lookAt(A.look);
    if (A.roll) cam.rotateZ(A.roll);
    fitFov(cam, A.fov, 46);
    cam.updateMatrixWorld();
    for (const p of this.pools) p.setScaleFromCamera(cam, this.game.engine.height);
  }

  // ------------------------------------------------------------------ world
  updateWorld(t, dt) {
    const cam = this.camera, sc = this.scene, F = this.F;
    const cy = cam.position.y;
    // daylight drains away below the ground; the dark takes over
    const dl = Math.pow(clamp(1 + cy / 7, 0, 1), 1.3);
    this.hemi.intensity = 0.12 + 1.03 * dl;
    this.sun.intensity = 2.5 * dl;
    this.fill.intensity = 0.55 * dl;
    const fogK = 1 - dl;
    sc.fog.color.copy(this.haze).lerp(this.dark, fogK);
    sc.fog.near = lerp(14, 3, fogK);
    sc.fog.far = lerp(74, 22, fogK);
    sc.background.copy(sc.fog.color);
    const far = Math.max(24, sc.fog.far + 4);
    if (Math.abs(cam.far - far) > 0.5) { cam.far = far; cam.updateProjectionMatrix(); }
    F.sky.position.copy(cam.position);
    // the shaft below the hole: only bands near the camera
    const cut = cy - sc.fog.far - 1;
    for (const m of this.shaft.group.children) if (m.isMesh && m.geometry.boundingBox) m.visible = m.geometry.boundingBox.max.y > cut && m.geometry.boundingBox.min.y < cy + 30;
    F.group.visible = true; // from down the shaft the crowns still frame the hole
    // post: golden light through the trees on the surface, then down into the dark
    const p = this.post;
    p.grade = mixGrade('sunny', 'deep', fogK);
    p.gradeMix = 0.85;
    p.bloom = lerp(0.55, 0.7, fogK);
    p.bloomThreshold = lerp(0.8, 0.7, fogK);
    p.vignette = lerp(0.24, 0.62, fogK);
    p.saturation = lerp(1.1, 0.9, fogK);
    if (cy > -0.5) {
      p.rays = 0.95; p.raysDir = SUN_DIR; p.raysPos = null; p.raysSky = 1; p.raysThreshold = 0.86; p.raysColor = 0xffe2a8; p.raysRadius = 0.5; p.raysDecay = 0.965;
    } else {
      // the light from the hole above
      p.rays = 0.8 * (1 - ease(T.I - 1, T.I + 1, t)); p.raysDir = null; p.raysPos = this._holeP || (this._holeP = new THREE.Vector3(0, 0.5, 0)); p.raysSky = 1; p.raysThreshold = 0.8; p.raysColor = 0xfff0c8; p.raysRadius = 0.35; p.raysDecay = 0.95;
    }
    if (p.flash > 0) p.flash = Math.max(0, p.flash - dt * 2.4);
    // black out: the light fades, the eyes close round the speck of light far above
    if (t >= T.H + 1.0) {
      const k = ease(T.H + 1.0, T.I - 0.1, t);
      p.fade = k * 0.92;
      p.fadeColor = 0x000000;
    }
    if (t >= T.I) {
      if (this.bottomY == null) this.bottomY = this.heroPivot.position.y + 0.3;
      const u = t - T.I;
      // a few slow blinks, each one narrower, then nothing
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
    this.fallLight.intensity = t > T.G ? 3.2 * fogK * (1 - ease(T.H + 1.2, T.I, t)) : 0;
    F.update(dt, cam, sc.fog);
    this.shaft.update?.(dt);
    // the bars come off for the fall
    if (t > T.G && !this._barsOff) { this._barsOff = true; this.bars.classList.remove('on'); }

    // surface life: pollen in the light, fireflies in the shade, a leaf or two
    if (t < T.G + 0.5 && cy > -1) {
      const H = this.heroPivot.position;
      if (Math.random() < dt * 14) this.motes.spawn({ pos: [H.x + (Math.random() - 0.5) * 9, 0.3 + Math.random() * 2.6, H.z + (Math.random() - 0.5) * 9], vel: [0.06, 0.03, -0.02], life: 4, color: 0xfff2b0, size: 0.022, wobble: 0.3, flicker: 0.5, fadeIn: 0.5 });
      if (Math.random() < dt * 3) this.motes.spawn({ pos: [H.x + (Math.random() - 0.5) * 12, 0.2 + Math.random() * 1.2, H.z + (Math.random() - 0.5) * 12], vel: [(Math.random() - 0.5) * 0.3, 0.05, (Math.random() - 0.5) * 0.3], life: 3.5, color: 0xd8ff70, color2: 0x8aff40, size: 0.035, wobble: 1, flicker: 0.95, fadeIn: 0.4, shape: SHAPE.plus });
      if (Math.random() < dt * 1.6) this.leaves.spawn({ pos: [H.x + (Math.random() - 0.5) * 6, 4 + Math.random() * 2, H.z + (Math.random() - 0.5) * 6], vel: [0.5, -0.4, 0.3], life: 7, color: Math.random() < 0.6 ? 0x8ab448 : 0xd8a040, size: 0.05, gravity: 0.2, drag: 0.8, wobble: 0.9, spin: 5, shape: SHAPE.confetti });
    }
    // the stream: louder near the bridge
    if (t < T.D) {
      const B = FOREST.bridge;
      const d = Math.hypot(cam.position.x - B.x, cam.position.z - B.z);
      this.loop('water', clamp(1 - d / 14, 0, 1) * 0.55);
    } else this.loop('water', 0);
    // the fall: grit and motes rushing past
    if (t >= T.G && t < T.I) {
      const H = this.heroPivot.position;
      if (Math.random() < dt * 22) this.debris.spawn({ pos: [H.x + (Math.random() - 0.5) * 1.6, H.y + (Math.random() - 0.2) * 2, H.z + (Math.random() - 0.5) * 1.6], vel: [(Math.random() - 0.5) * 0.4, -9 * (t - T.G) * (0.85 + Math.random() * 0.2), (Math.random() - 0.5) * 0.4], life: 1.2, color: Math.random() < 0.5 ? 0x5a3e2a : 0x7a6a58, size: 0.03 + Math.random() * 0.03, gravity: 6, shape: SHAPE.square });
      for (let k = 0; k < 2; k++) { const a = Math.random() * 6.28, r = 0.4 + Math.random() * 1.6; this.motes.spawn({ pos: [Math.cos(a) * r, cy - 3 - Math.random() * 6, Math.sin(a) * r], vel: [0, 0, 0], life: 1.6, color: 0xffe8c0, size: 0.018, flicker: 0.4 }); }
    }
    // hero footsteps (on the bridge they ring hollow)
    const hr = this.hero;
    if (hr.state === 'walk') {
      const ph = Math.floor(hr.t * 8.5 / Math.PI);
      if (ph !== this._stepPh) {
        this._stepPh = ph;
        const B = FOREST.bridge;
        const onBridge = B && Math.abs(this.cur.s - B.s) < B.half;
        this.sfx('step', { mat: onBridge ? 'wood' : 'dirt', vol: 0.7 });
      }
    }
    for (const pl of this.pools) pl.update(dt);
  }
}
