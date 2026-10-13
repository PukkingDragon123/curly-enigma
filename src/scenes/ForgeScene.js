// The home forge: smelt ore into ingots and forge weapons in a cozy voxel blacksmith corner.
// Activities live in src/forge/ (smelt.js, forging.js); this scene owns the world, camera,
// the mole and Nugget, the fire/bellows simulation, particles, input routing and menus.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { makeCharacter, playerSpec, makeChicken } from '../gfx/characters.js';
import { clamp, lerp, el } from '../core/util.js';
import { buildWorld } from '../forge/world.js';
import { ForgeParticles } from '../forge/particles.js';
import { makeHammer } from '../forge/models.js';
import { injectStyles, popWord } from '../forge/ui.js';
import { Menus } from '../forge/menus.js';

const _v = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

export default class ForgeScene extends Scene {
  async enter(params = {}) {
    this.hud = 'mini';
    this.music = 'forge';
    this.allowMenus = true;
    this.params = params;
    this.post = { vignette: 0.38, saturation: 1.1, contrast: 1.05, brightness: 1.06, tint: 0xfff0e4, innerThresh: 0.22 };
    this.scene.background = new THREE.Color(0x140c0a);
    this.scene.fog = new THREE.Fog(0x140c0a, 10, 19);
    this.camera.near = 0.05;
    this.camera.far = 40;
    this.own(injectStyles());
    this.layer = el('div', { class: 'fg-layer' });
    this.game.ui.world.append(this.layer);

    this.W = buildWorld(this.scene);
    this.particles = new ForgeParticles(this.scene);
    this.own(() => this.particles.dispose());

    // the mole, with a hammer in the right paw
    this.mole = makeCharacter(playerSpec());
    this.scene.add(this.mole.root);
    this.hammer = makeHammer();
    this.mole.holdItem(this.hammer, 'R');
    this.molePose = 'idle';
    this.moleWalk = null;
    this.placeMole('idle');

    // Nugget keeps warm on the crate by the hearth
    this.hen = makeChicken();
    this.hen.root.position.copy(this.W.perch);
    this.hen.face(0.5, true);
    this.hen.play('sit');
    this.scene.add(this.hen.root);
    this.henT = 3;

    // camera rig with eased shots and shake
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 45 };
    this.shot = null;
    this.shake = 0;
    this.setShot(params.shot || 'menu', true);

    // hearth & bellows
    this.fire = { air: 0, pumping: false, cycle: 0, compress: 0, glow: 0.45, flick: 0, spawn: { ember: 0, flame: 0, smoke: 0 } };
    this.pumpGrab = false;
    this.pumpAllowed = false;
    this.fireLoop = this.game.audio.loop('forge_fire', { vol: 0.35 });
    this.own(() => this.fireLoop.stop());
    this.waterT = 0;

    // Esc: leave from the menu, back out of sub-menus, or ask the activity (handled before the global menu)
    const onKey = (e) => {
      if (e.code !== 'Escape' || this.game.transitioning || this.game.ui.isPanelOpen() || e.repeat) return;
      const handled = this.onEscape();
      if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    this.own(() => window.removeEventListener('keydown', onKey, true));

    this.activity = null;
    this.menus = new Menus(this);
    this.own(() => this.menus.dispose());
    if (params.open === 'smelt') this.menus.smeltList();
    else if (params.open === 'plan') this.menus.plan();
    else this.menus.main();
  }

  // ---------------------------------------------------------------- flow
  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.game.audio.play('door');
    this.game.goto('home', { from: 'forge' });
  }

  /** Called on Esc (capture phase). Return true if handled. */
  onEscape() {
    if (this.activity) return this.activity.onEscape ? this.activity.onEscape() : true;
    return this.menus.onEscape();
  }

  /** Start an activity object ({update, onEscape, dispose}); menus are hidden while it runs. */
  startActivity(act) {
    this.menus.hide();
    this.activity = act;
    this.allowMenus = false;
  }

  endActivity(next = 'main') {
    if (this.activity) { try { this.activity.dispose?.(); } catch (e) { console.warn(e); } }
    this.activity = null;
    this.allowMenus = true;
    this.pumpAllowed = false;
    this.game.ui.setHints(null);
    this.setShot('menu');
    this.walkTo('idle', 'idle');
    this.hammer.visible = true;
    if (next === 'smelt') this.menus.smeltList();
    else if (next === 'plan') this.menus.plan();
    else if (next) this.menus.main();
  }

  // ---------------------------------------------------------------- camera
  setShot(name, instant = false) {
    const s = this.W.shots[name];
    if (!s) return;
    this.shot = { name, pos: s.pos.clone(), look: s.look.clone(), fov: s.fov };
    if (instant) {
      this.cam.pos.copy(s.pos); this.cam.look.copy(s.look); this.cam.fov = s.fov;
    }
  }

  /** Custom shot (pos/look Vector3s). */
  setShotRaw(pos, look, fov = 42, instant = false) {
    this.shot = { name: 'raw', pos: pos.clone(), look: look.clone(), fov };
    if (instant) { this.cam.pos.copy(pos); this.cam.look.copy(look); this.cam.fov = fov; }
  }

  addShake(a) {
    if ((this.game.state.data.settings.shake ?? 1) <= 0) return;
    this.shake = Math.min(0.06, this.shake + a);
  }

  updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 4.2);
    if (this.shot) {
      this.cam.pos.lerp(this.shot.pos, k);
      this.cam.look.lerp(this.shot.look, k);
      this.cam.fov = lerp(this.cam.fov, this.shot.fov, k);
    }
    const c = this.camera;
    c.position.copy(this.cam.pos);
    if (this.shake > 0.0005) {
      c.position.x += (Math.random() - 0.5) * this.shake;
      c.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 16);
    }
    c.lookAt(this.cam.look);
    if (Math.abs(c.fov - this.cam.fov) > 0.01) { c.fov = this.cam.fov; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
  }

  /** Mouse ray against objects; returns the first hit or null. */
  raycast(objects) {
    const m = this.game.input.mouse;
    _ndc.set(m.nx, m.ny);
    _ray.setFromCamera(_ndc, this.camera);
    const hits = _ray.intersectObjects(objects, true);
    return hits[0] || null;
  }

  /** Mouse ray against a horizontal plane at height y; returns a Vector3 or null. */
  mouseOnPlane(y, out = new THREE.Vector3()) {
    const m = this.game.input.mouse;
    _ndc.set(m.nx, m.ny);
    _ray.setFromCamera(_ndc, this.camera);
    const r = _ray.ray;
    if (Math.abs(r.direction.y) < 1e-5) return null;
    const t = (y - r.origin.y) / r.direction.y;
    if (t < 0) return null;
    return out.copy(r.origin).addScaledVector(r.direction, t);
  }

  screenOf(v) { return this.toScreen(v); }

  pop(text, worldPos, color = '#fff', size = 1) {
    const s = this.toScreen(worldPos);
    if (s.visible) popWord(this.layer, text, s.x, s.y, color, size);
  }

  // ---------------------------------------------------------------- mole
  placeMole(name) {
    const st = this.W.stations[name];
    this.mole.root.position.copy(st.pos);
    this.mole.face(st.yaw, true);
    this.moleStation = name;
  }

  /** Walk to a station, then take a pose ('idle' | 'pump' | 'hammer' | 'carry' | ...). */
  walkTo(name, pose = 'idle', onArrive = null) {
    const st = this.W.stations[name];
    const from = this.mole.root.position.clone();
    const dist = from.distanceTo(st.pos);
    this.moleStation = name;
    if (dist < 0.02) {
      this.mole.face(st.yaw);
      this.molePose = pose;
      this.moleWalk = null;
      if (onArrive) onArrive();
      return;
    }
    this.moleWalk = { from, to: st.pos.clone(), yaw: st.yaw, t: 0, dur: clamp(dist / 2.2, 0.25, 1.1), pose, onArrive };
  }

  updateMole(dt) {
    const rig = this.mole;
    const w = this.moleWalk;
    if (w) {
      w.t = Math.min(1, w.t + dt / w.dur);
      const k = w.t < 0.5 ? 2 * w.t * w.t : 1 - Math.pow(-2 * w.t + 2, 2) / 2;
      rig.root.position.lerpVectors(w.from, w.to, k);
      rig.root.position.y = lerp(w.from.y, w.to.y, k) + Math.sin(w.t * Math.PI) * 0.04;
      rig.face(Math.atan2(w.to.x - w.from.x, w.to.z - w.from.z));
      rig.play('walk', 1.3);
      if (w.t >= 1) {
        this.moleWalk = null;
        rig.face(w.yaw);
        this.molePose = w.pose;
        if (w.onArrive) w.onArrive();
      }
    } else {
      const pose = this.molePose;
      rig.play(pose === 'pump' ? 'carry' : pose === 'hammer' ? 'hammer' : pose);
    }
    rig.update(dt);
    // pose overrides after the rig sets its own
    if (!this.moleWalk && this.molePose === 'pump') {
      const c = this.fire.compress;
      rig.armL.rotation.set(-1.25 + c * 0.55, 0, 0.25);
      rig.armR.rotation.set(-1.25 + c * 0.55, 0, -0.25);
      rig.hip.position.y -= c * 0.035;
      rig.hip.rotation.x += 0.15 + c * 0.12;
      rig.neck.rotation.x -= 0.1;
    }
  }

  // ---------------------------------------------------------------- hearth & bellows
  /** Is the player pumping this frame? (Space, or mouse held after pressing on the bellows/hearth) */
  readPump() {
    const inp = this.game.input;
    if (!this.pumpAllowed) { this.pumpGrab = false; return false; }
    if (inp.mousePressed(0)) {
      const hit = this.raycast([this.W.bellowsHit, this.W.bellows.group, this.W.hearth.group]);
      this.pumpGrab = !!hit;
    }
    if (!inp.mouseDown(0)) this.pumpGrab = false;
    return inp.isDown('Space') || this.pumpGrab;
  }

  updateFire(dt) {
    const f = this.fire;
    f.pumping = this.readPump() && this.molePose === 'pump' && !this.moleWalk;
    f.air = clamp(f.air + (f.pumping ? 2.0 : -0.8) * dt, 0, 1);
    if (f.pumping) {
      const prev = f.cycle;
      f.cycle += dt / 0.8;
      if (Math.floor(prev) !== Math.floor(f.cycle) || prev === 0) {
        this.game.audio.play('bellows', { vol: 0.8 });
        this.puff();
      }
      const ph = f.cycle % 1;
      const target = ph < 0.55 ? ph / 0.55 : 1 - (ph - 0.55) / 0.45;
      f.compress += (target - f.compress) * Math.min(1, dt * 18);
    } else {
      f.cycle = 0;
      f.compress += (0 - f.compress) * Math.min(1, dt * 6);
    }
    this.W.bellows.setCompress(f.compress);
    f.glow += ((0.45 + f.air * 0.75) - f.glow) * Math.min(1, dt * 3);
    f.flick = 0.88 + 0.12 * Math.sin(this.time * 13.1) * Math.sin(this.time * 7.7 + 1.3) + (Math.random() - 0.5) * 0.08;
    const g = f.glow * f.flick;
    this.W.hearth.coalMat.color.setRGB(0.55 + g * 0.6, 0.45 + g * 0.45, 0.4 + g * 0.3);
    this.W.hearth.emberMat.color.setScalar(0.35 + g * 0.35);
    this.W.light.intensity = (5.5 + f.air * 7) * f.flick + (this.extraLight || 0);
    this.W.light.color.setHSL(0.065 + f.air * 0.015, 1, 0.55 + f.air * 0.06);
    this.fireLoop.set({ vol: 0.3 + f.air * 0.45, intensity: f.air });
    // emitters
    const P = this.particles, fp = this.W.firePos, sp = f.spawn;
    sp.ember += dt * (5 + f.air * 26);
    sp.flame += dt * (14 + f.air * 46);
    sp.smoke += dt * (2.2 + f.air * 3);
    while (sp.ember >= 1) { sp.ember--; P.ember(_v.copy(fp).setY(fp.y + 0.02), 0.6, 0.6 + f.air); }
    while (sp.flame >= 1) { sp.flame--; P.flame(_v.copy(fp).setY(fp.y - 0.02), 0.7, 0.5 + f.air * 0.8); }
    while (sp.smoke >= 1) { sp.smoke--; P.smoke(_v.copy(fp).setY(fp.y + 0.35), 0.5, 0.8); }
  }

  /** Bellows stroke: a breath of sparks out of the coals. */
  puff() {
    const fp = this.W.firePos;
    for (let i = 0; i < 6; i++) this.particles.ember(_v.copy(fp), 0.5, 1.6);
    for (let i = 0; i < 8; i++) this.particles.flame(_v.copy(fp), 0.5, 1.4);
  }

  // ---------------------------------------------------------------- ambience
  updateAmbience(dt) {
    const t = this.time;
    for (const h of this.W.hanging) h.obj.rotation.z = Math.sin(t * 0.7 + h.phase) * h.amp;
    this.W.lantern.rotation.z = Math.sin(t * 0.6) * 0.03;
    const fl = 0.85 + Math.sin(t * 9.3) * 0.06 + Math.sin(t * 17.1) * 0.05;
    this.W.lanternMat.color.setScalar(fl);
    this.W.candleMat.color.setScalar(0.8 + Math.sin(t * 13) * 0.12 + Math.random() * 0.08);
    this.W.shelfGlow.color.setScalar(0.8 + Math.sin(t * 1.4) * 0.15);
    this.waterT -= dt;
    if (this.waterT <= 0) { this.waterT = 0.11; this.W.water.draw(t, this.waterEnergy || 0); }
    this.waterEnergy = Math.max(0, (this.waterEnergy || 0) - dt * 0.6);
    // Nugget: dozes, looks around, pecks now and then
    const hen = this.hen;
    this.henT -= dt;
    if (this.henT <= 0) {
      this.henT = 2.5 + Math.random() * 5;
      const r = Math.random();
      if (r < 0.35) { hen.play('idle'); hen.peck(); }
      else if (r < 0.7) hen.play('sit');
      else { hen.play('idle'); hen.face(-0.6 + Math.random() * 1.6); if (Math.random() < 0.4) this.game.audio.play('cluck', { vol: 0.5 }); }
    }
    hen.update(dt);
  }

  /** Nugget reacts to results: 'great' | 'bad' | 'startle'. */
  henReact(kind) {
    const hen = this.hen;
    hen.play('idle');
    if (kind === 'great') { hen.flap(1.4); this.game.audio.play('bawk', { pitch: 1.1 }); setTimeout(() => this.game.audio.play('cluck', { n: 3 }), 500); }
    else if (kind === 'startle') { hen.flap(0.5); this.game.audio.play('cluck', { pitch: 1.3, n: 2 }); }
    else { hen.peck(); this.game.audio.play('cluck', { pitch: 0.8, n: 1 }); }
    this.henT = 3;
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    super.update(dt);
    if (this.activity) {
      try { this.activity.update(dt); } catch (e) { console.error(e); this.game.reportError(e); this.activity = null; this.endActivity(); }
    } else this.menus.update(dt);
    this.updateFire(dt);
    this.updateMole(dt);
    this.updateAmbience(dt);
    this.updateCamera(dt);
    this.particles.update(dt, this.camera, this.game.engine.height);
  }

  onResize(w, h) {
    super.onResize(w, h);
  }

  exit() {
    if (this.activity) { try { this.activity.dispose?.(); } catch (e) { console.warn(e); } this.activity = null; }
    super.exit();
  }
}
