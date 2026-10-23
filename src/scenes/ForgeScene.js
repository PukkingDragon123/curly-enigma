// The forge in first person: you stand in the smithy (walk it with FPSRig + BoxWorld), and the
// work itself happens with your own paws: the left paw holds the tongs, the right pumps the
// bellows pull or swings the hammer onto the spot you aim at. Activities live in src/forge/
// (smelt.js, forging.js, parts.js: coop parts); this scene owns the room, the first-person view (walking, or "docked"
// at a station with a gentle look-around), the fire/bellows simulation, particles, the paws,
// input routing and menus. Entered with goto('forge', { from: 'home' | 'town' }); leaves to `from`.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { makeChicken } from '../gfx/characters.js';
import { clamp, lerp, el } from '../core/util.js';
import { FPSRig, BoxWorld } from '../fps/FPSKit.js';
import { buildWorld } from '../forge/world.js';
import { ForgeParticles } from '../forge/particles.js';
import { injectStyles, decorateLayer, popWord, TouchAction } from '../forge/ui.js';
import { Menus } from '../forge/menus.js';
import { Paws } from '../forge/paws.js';
import { makeGlow } from '../bookends/fx.js';
import { glowHex, glowAmount } from '../forge/blackbody.js';
import { ForgeLesson } from '../forge/tutorial.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export default class ForgeScene extends Scene {
  async enter(params = {}) {
    this.hud = 'deep';
    this.game.ui.setActionIcon?.(false); // walking the smithy has no primary action (stations use E)
    this.music = 'forge';
    this.allowMenus = true;
    this.params = params;
    this.from = params.from === 'town' ? 'town' : 'home';
    // ?ts=N speeds this scene up for automated screenshot runs (headless WebGL is slow)
    this.timeScale = clamp(parseFloat(params.ts) || 1, 0.25, 4);
    this.post = { vignette: 0.42, saturation: 1.12, contrast: 1.06, brightness: 1.05, tint: 0xfff0e4, innerThresh: 0.22 };
    this.scene.background = new THREE.Color(0x120a08);
    this.scene.fog = new THREE.Fog(0x120a08, 4.5, 11);
    this.own(injectStyles());
    this.layer = decorateLayer(el('div', { class: 'fg-layer' }));
    this.game.ui.world.append(this.layer);
    this.touchBtn = new TouchAction(this.layer, this.game.input);
    this.own(() => this.touchBtn.remove());
    const ui = this.game.ui;
    ui.setRadar?.(null);
    ui.setDepth?.(null);
    ui.setBag?.(null);
    // (the first-person HUD keeps the mine's depth readout on screen even when cleared: hide it here)
    const depthEl = ui.status?.depth;
    if (depthEl) { depthEl.hidden = true; this.own(() => { depthEl.hidden = false; }); }

    this.W = buildWorld(this.scene);
    console.log(`[forge] room built in ${this.W.stats.ms.toFixed(0)} ms (${this.W.stats.batched} props → ${this.W.stats.batches} batches)`);
    this.world = new BoxWorld();
    for (const b of this.W.boxes) this.world.add(...b);
    this.rig = await new FPSRig(this, { world: this.world, fov: 74, reach: 1.7, stepMat: 'wood', lamp: 0.5, far: 30 }).init();
    this.camera = this.rig.camera;
    this.camera.near = 0.02;
    this.camera.updateProjectionMatrix();
    this.own(() => this.rig.dispose());
    this.particles = new ForgeParticles(this.scene, 0.5);
    this.own(() => this.particles.dispose());
    // the white-hot flash where the hammer meets the metal
    this.impactGlow = makeGlow({ color: 0xfff0c0, size: 0.2, intensity: 0, falloff: 1.4, levels: 6, renderOrder: 22 });
    this.impactGlow.visible = false;
    this.scene.add(this.impactGlow);
    this.impactT = 0;
    this.hitStop = 0;
    this.shake = 0;
    this.extraLight = 0;
    this.workSrc = null; // { pos, T } hot metal lighting the paws and the room
    this.paws = new Paws(this);

    // Nugget keeps warm on the crate by the coal bin
    this.hen = makeChicken({ scale: 0.46 });
    this.hen.root.position.copy(this.W.perch);
    this.hen.face(0.9, true);
    this.hen.play('sit');
    this.scene.add(this.hen.root);
    this.henT = 3;

    // hearth & bellows
    this.fire = { air: 0, pumping: false, cycle: 0, compress: 0, glow: 0.45, flick: 0, spawn: { ember: 0, flame: 0, smoke: 0 }, nudge: 0 };
    this.pumpAllowed = false;
    this.fireLoop = this.game.audio.loop('forge_fire', { vol: 0.35 });
    this.own(() => this.fireLoop.stop());
    this.waterT = 0;

    // the first-person view: walking, or docked at a station
    this.view = { mode: 'walk' };
    this.lookOff = { x: 0, y: 0 };
    this.camOff = new THREE.Vector3();
    const sp = this.W.docks.spawn;
    const look = sp.look.clone().sub(sp.eye);
    this.rig.place(sp.stand.x, 0, sp.stand.z, Math.atan2(-look.x, -look.z), Math.atan2(look.y, Math.hypot(look.x, look.z)));
    this.rig.setTool('none');
    this.addInteractables();

    // Esc: free the mouse first (the browser does), then the menu / leave / ask the activity
    this.lockLostAt = -1e9;
    this.own(this.game.input.onKey((e) => { if (e.type === 'pointerlock' && e.code === 'Unlocked') this.lockLostAt = performance.now(); }));
    const onKey = (e) => {
      if (e.code !== 'Escape' || this.game.transitioning || this.game.ui.isPanelOpen() || e.repeat) return;
      if (this.walking() && (this.game.input.pointerLocked || performance.now() - this.lockLostAt < 600)) {
        e.preventDefault(); e.stopImmediatePropagation(); return;
      }
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
    else if (params.open === 'parts') this.menus.partsList();
    else if (params.open === 'main') this.menus.main();
    this.syncHud(true);
    this.installDebug();
    // Old Star's forging lesson (from home, during his lessons): he talks you through it
    if (params.tutorial === true || params.tutorial === 'true' || params.tutorial === '1' || params.tutorial === 1) {
      this.lesson = new ForgeLesson(this);
      this.own(() => this.lesson?.dispose());
      this.lesson.start();
    }
  }

  // ---------------------------------------------------------------- flow
  /** Free to walk the smithy (no menu, no activity)? */
  walking() { return this.view.mode === 'walk' && !this.activity && this.menus.mode === 'hidden'; }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.game.audio.play('door');
    this.game.goto(this.from, { from: 'forge' });
  }

  /** Called on Esc (capture phase). Return true if handled. */
  onEscape() {
    if (this.activity) return this.activity.onEscape ? this.activity.onEscape() : true;
    if (this.menus.mode !== 'hidden') return this.menus.onEscape();
    this.menus.main();
    return true;
  }

  /** Start an activity object ({update, onEscape, dispose}); menus are hidden while it runs. */
  startActivity(act) {
    this.activity = act; // first, so closing the menu doesn't send the view back to walking
    this.menus.hide();
    this.allowMenus = false;
  }

  endActivity(next = 'main') {
    if (this.activity) { try { this.activity.dispose?.(); } catch (e) { console.warn(e); } }
    this.activity = null;
    this.allowMenus = true;
    this.pumpAllowed = false;
    this.workSrc = null;
    this.game.ui.setHints(null);
    this.paws.clear();
    this.rig.setTool('none');
    if (next === 'smelt') this.menus.smeltList();
    else if (next === 'plan') this.menus.plan();
    else if (next === 'parts') this.menus.partsList();
    else if (next === 'main') this.menus.main();
    else this.undock();
  }

  /** Called by the menus when they open (dock at the station) or close (walk on). */
  menuChanged(mode) {
    if (this.activity) return;
    // the menu panel sits on the left: turn a little so the station shows to its right
    if (mode === 'smelt') this.dock('hearth', { dur: 0.7, side: 0.34 });
    else if (mode === 'plan' || mode === 'parts') this.dock('anvil', { dur: 0.7, side: 0.42 });
    else if (mode === 'main') { if (this.view.mode === 'walk') this.dock('here'); }
    else if (mode === 'hidden' && this.view.mode === 'dock') this.undock();
  }

  syncHud(force = false) {
    const want = this.walking() && !this.leaving ? 'deep' : 'mini';
    if (force || this.game.ui.hudMode !== want) {
      this.hud = want;
      if (this.game.scene === this || force) this.game.ui.setHudMode(want);
      if (want === 'deep') this.game.ui.setHints(this.game.ui.root && document.documentElement.classList.contains('is-touch') ? null
        : '<span class="fg-nolig"><kbd>E</kbd> use · <kbd>1</kbd> smelt · <kbd>2</kbd> forge · <kbd>3</kbd> coop parts · <kbd>Esc</kbd> menu</span>');
      else if (!this.activity) this.game.ui.setHints(null);
    }
  }

  // ---------------------------------------------------------------- interactables (walking)
  addInteractables() {
    const W = this.W, rig = this.rig;
    const free = () => this.walking();
    const fp = W.firePos;
    rig.add({ box: [fp.x - 0.56, 0.2, 0.05, fp.x + 0.56, 1.0, 0.86], label: 'Smelt ore', enabled: free, action: () => { this.game.audio.play('ui_click'); this.menus.smeltList(); } });
    const af = W.anvilFace;
    rig.add({ box: [af.x - 0.2, 0.1, af.z - 0.75, af.x + 0.2, af.y + 0.08, af.z + 0.45], label: 'Forge a weapon', enabled: free, action: () => { this.game.audio.play('ui_click'); this.menus.plan(); } });
    const d = W.doorPos;
    rig.add({ box: [d.x - 0.4, 0, d.z - 0.12, d.x + 0.4, 1.25, d.z + 0.12], label: this.from === 'town' ? 'Back to town' : 'Back to the cave', enabled: free, action: () => this.leave() });
    rig.add({ x: W.barrelTop.x, y: W.barrelTop.y, z: W.barrelTop.z, r: 0.26, label: 'Quench barrel', enabled: free, action: () => {
      this.game.audio.play('splash', { vol: 0.5 });
      W.water.splash(0.8);
      this.waterEnergy = 0.8;
      this.particles.bubbles(W.barrelTop, 6, 0.2);
    } });
    rig.add({ x: 0, y: 0, z: 0, r: 0.13, label: 'Pump the bellows', enabled: free, action: () => { this.fire.nudge = 0.9; this.game.audio.play('bellows', { vol: 0.7 }); this.puff(); } });
    const pullIt = rig.items[rig.items.length - 1];
    this.pullItem = pullIt;
    rig.add({ x: W.perch.x, y: W.perch.y + 0.12, z: W.perch.z, r: 0.2, label: 'Pet Nugget', enabled: free, action: () => this.henReact('startle') });
    const bb = W.bladeBarrel;
    rig.add({ x: bb.x, y: bb.y, z: bb.z, r: 0.3, label: 'Finished work', enabled: free, action: () => {
      const n = this.game.state.data.weapons.length;
      this.game.ui.toast(n ? `${n} forged weapon${n === 1 ? '' : 's'} waiting for the assay office.` : 'Nothing forged yet. The anvil is waiting.');
    } });
    rig.add({ box: [3.86, 0.3, 0.02, 5.04, 0.7, 0.5], label: 'Coop parts', enabled: free, action: () => { this.game.audio.play('ui_click'); this.menus.partsList(); } });
    rig.add({ x: 0.4, y: 0.3, z: 0.58, r: 0.3, label: 'Coal bin', enabled: free, action: () => this.game.ui.toast(`Coal in the bin: ${this.game.state.count('coal')}`) });
  }

  // ---------------------------------------------------------------- the view: walking or docked
  /** Camera stance for a dock, fitted to the screen (and to the blade on the anvil). */
  dockPose(name) {
    const d = name === 'here' ? this.hereDock : this.W.docks[name];
    if (!d) return null;
    const a = this.game.engine.aspect;
    const narrow = clamp((1.25 - a) / 0.8, 0, 1); // 0 landscape → 1 phone portrait
    const fov = Math.min(92, d.fov + narrow * 22);
    const eye = d.eye.clone(), look = d.look.clone();
    if (name !== 'here') {
      // frame what matters at this station (the work, the paws' handles): on narrow screens the
      // view centres on it, and the mole steps back until it all fits
      const pts = [...(d.pts || []), ...(this.activity?.framePoints?.(name) || [])];
      if (pts.length) {
        const c = new THREE.Vector3();
        for (const p of pts) c.add(p);
        c.multiplyScalar(1 / pts.length);
        look.lerp(c, narrow * 0.8);
        const tanV = Math.tan(THREE.MathUtils.degToRad(fov) / 2), tanH = tanV * a;
        const dh = new THREE.Vector3(eye.x - look.x, 0, eye.z - look.z);
        const h0 = Math.max(0.05, dh.length());
        dh.normalize();
        const f = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
        const UP = new THREE.Vector3(0, 1, 0);
        for (let h = h0; h < h0 + 2.5; h += 0.02) {
          eye.set(look.x + dh.x * h, d.eye.y + Math.min(0.08, (h - h0) * 0.12), look.z + dh.z * h);
          f.subVectors(look, eye).normalize();
          r.crossVectors(f, UP).normalize();
          u.crossVectors(r, f);
          let ok = true;
          for (const p of pts) {
            v.subVectors(p, eye);
            const z = v.dot(f);
            if (z < 0.08 || Math.abs(v.dot(r)) > z * tanH * 0.86 || Math.abs(v.dot(u)) > z * tanV * 0.8) { ok = false; break; }
          }
          if (ok) break;
        }
      }
    }
    const dir = look.clone().sub(eye);
    return { name, eye, yaw: Math.atan2(-dir.x, -dir.z), pitch: Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), fov, stand: d.stand };
  }

  /** Glide into a station view. opts: dur. */
  dock(name, opts = {}) {
    const cam = this.rig.camera, pl = this.rig.player;
    if (name === 'here') {
      const e = pl.eye(new THREE.Vector3());
      this.hereDock = { eye: e, look: e.clone().add(pl.forward(new THREE.Vector3())), fov: cam.fov, stand: pl.pos.clone() };
    }
    const to = this.dockPose(name);
    if (!to) return;
    const side = opts.side && this.game.engine.aspect > 1.1 ? opts.side : 0;
    to.yaw += side;
    const fromEye = cam.position.clone().sub(this.camOff);
    this.view = { mode: 'dock', name, t: 0, dur: opts.dur ?? 0.8, fromEye, fromYaw: pl.yaw, fromPitch: pl.pitch, fromFov: cam.fov, to, side };
    this.camOff.set(0, 0, 0);
    this.game.input.unlockPointer();
  }

  /** Is the view settled at its dock? */
  get docked() { return this.view.mode === 'dock' && this.view.t >= 1; }

  /** Back to walking from where the dock stands. */
  undock() {
    const v = this.view;
    if (v.mode !== 'dock') return;
    const pl = this.rig.player;
    const eye = this.rig.camera.position.clone();
    const st = v.to.stand || pl.pos;
    pl.pos.set(st.x, 0, st.z);
    pl.vel.set(0, 0, 0);
    pl.yaw = wrapPi(pl.yaw);
    pl.pitch = clamp(pl.pitch, -1.2, 1.2);
    this.view = { mode: 'walk' };
    this.camOff.copy(eye).sub(pl.eye(_v));
    this.paws.clear();
  }

  updateView(dt) {
    const rig = this.rig, pl = rig.player, cam = rig.camera, inp = this.game.input;
    const v = this.view;
    this.updateLighting();
    if (v.mode === 'walk') {
      this.paws.update(dt);
      rig.update(dt, { busy: !this.walking() || this.leaving });
      // walk fov (wider on phones in portrait)
      const a = this.game.engine.aspect;
      const want = 74 + clamp((1.25 - a) / 0.8, 0, 1) * 18;
      if (Math.abs(cam.fov - want) > 0.05) { cam.fov = lerp(cam.fov, want, 1 - Math.exp(-dt * 6)); cam.updateProjectionMatrix(); }
      // ease out of a dock without a jump
      if (this.camOff.lengthSq() > 1e-8) {
        this.camOff.multiplyScalar(Math.exp(-dt * 7));
        cam.position.add(this.camOff);
        cam.updateMatrixWorld();
      }
      return;
    }
    // docked: glide in, then hold still with a gentle look toward the pointer
    v.t = Math.min(1, v.t + dt / v.dur);
    const k = ease(v.t), to = v.to;
    _v.lerpVectors(v.fromEye, to.eye, k);
    _v.y += Math.sin(k * Math.PI) * 0.03; // a little lift as the mole steps over
    const touch = document.documentElement.classList.contains('is-touch');
    const m = inp.mouse;
    // (aiming the hammer with the pointer: the view barely follows, so the target holds still)
    const g = touch || this.freezeLook ? 0 : this.activity?.step === 'hammer' ? 0.35 : 1;
    const lx = clamp(-m.nx, -1, 1) * 0.085 * g, ly = clamp(m.ny, -1, 1) * 0.055 * g;
    this.lookOff.x += (lx * v.t - this.lookOff.x) * Math.min(1, dt * 4);
    this.lookOff.y += (ly * v.t - this.lookOff.y) * Math.min(1, dt * 4);
    const yaw = v.fromYaw + wrapPi(to.yaw - v.fromYaw) * k + this.lookOff.x;
    const pitch = lerp(v.fromPitch, to.pitch, k) + this.lookOff.y;
    const dyaw = yaw - pl.yaw, dpitch = pitch - pl.pitch;
    pl.pos.set(_v.x, _v.y - pl.eyeY, _v.z);
    pl.yaw = yaw;
    pl.pitch = pitch;
    const fov = lerp(v.fromFov, to.fov, k);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    inp.takeLook();
    rig.syncCamera(dt);
    this.game.ui.setCrosshair?.(null);
    this.paws.update(dt);
    const vm = rig.vm;
    if (vm) {
      const glide = v.t < 1 ? v.fromEye.distanceTo(to.eye) / v.dur : 0;
      vm.update(dt, {
        speed: Math.min(1.2, glide), grounded: true, look: { dx: -dyaw * 400, dy: -dpitch * 400 },
        lamp: { color: rig.lampCol, intensity: rig.lampK }, ambient: rig.ambient, camera: cam, heat: this.paws.heat,
      });
    }
  }

  /** Paws and room lit by the fire (and by hot metal close by). */
  updateLighting() {
    const f = this.fire, W = this.W, rig = this.rig, vm = rig.vm;
    const g = f.glow * f.flick;
    rig.lampCol.setRGB(1.0 + g * 0.35, 0.72 + g * 0.18, 0.5);
    rig.lampK = 0.42 + g * 0.22;
    rig.ambient.setRGB(0.34, 0.25, 0.21);
    const ws = this.workSrc;
    const wl = W.workLight;
    let wk = 0;
    if (ws) {
      wk = Math.min(1.3, glowAmount(ws.T));
      wl.position.copy(ws.pos);
      wl.position.y += 0.2;
      wl.position.lerp(this.camera.position, 0.15);
      if (wk > 0) wl.color.setHex(glowHex(Math.max(700, ws.T)));
    }
    wl.intensity = wk * 0.35 * (0.95 + Math.sin(this.time * 9.1) * 0.05) + this.extraLight * 0.25;
    const dl = this.displayLight;
    if (dl) { wl.position.copy(dl.pos); wl.color.setHex(dl.color); wl.intensity = dl.intensity; }
    if (!vm) return;
    // the strongest close light shines on the paws from where it is on screen
    const fireK = (0.55 + f.air * 1.1) * f.flick;
    const src = ws && wk * 1.4 > fireK * 0.6 ? ws.pos : _v2.copy(W.firePos).setY(W.firePos.y + 0.12);
    const pos = vm.toView(src, this.camera, this._workPos || (this._workPos = new THREE.Vector3()));
    const near = clamp(1.2 / Math.max(0.3, pos.length()), 0.4, 1.8);
    vm.work = { pos, color: ws && wk * 1.4 > fireK * 0.6 ? glowHex(Math.max(800, ws.T)) : 0xff9a4a, intensity: Math.max(fireK, wk * 0.8) * near * 0.55 + this.extraLight * 0.08 };
  }

  // ---------------------------------------------------------------- helpers for the activities
  /** Juice for a hammer blow on hot metal: impact flash, hit-stop, a camera kick. */
  impact(pos, power, T = 900) {
    this.impactGlow.position.copy(pos);
    this.impactGlow.userData.glow.uColor.value.setHex(glowHex(Math.max(1100, T + 250)));
    this.impactT = 1;
    this.impactPower = power;
    this.impactGlow.visible = true;
    if (power > 0.35) this.hitStop = 0.035 + power * 0.045;
    if ((this.game.state.data.settings.shake ?? 1) > 0) {
      this.rig.kick.x -= 0.012 + power * 0.03;
      this.rig.kick.z += (Math.random() - 0.5) * 0.012 * power;
      this.rig.shake(0.15 + power * 0.25);
    }
    this.post.flash = Math.max(this.post.flash || 0, 0.04 + power * 0.08);
    this.post.flashColor = 0xfff2d8;
  }

  addShake(a) {
    if ((this.game.state.data.settings.shake ?? 1) <= 0) return;
    this.rig.shake(Math.min(0.6, a * 8));
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

  /** Hand the paws a tool kind ('none' | 'tongs' | 'smith' | 'hammer'). */
  tool(kind) { this.rig.setTool(kind); }

  // ---------------------------------------------------------------- hearth & bellows
  /** Is the player pumping this frame? (Space, or holding the mouse / a finger on the view) */
  readPump() {
    const inp = this.game.input;
    if (!this.pumpAllowed || this.game.ui.isPanelOpen()) return false;
    return inp.isDown('Space') || (inp.mouseDown(0) && !this.pumpBlocked) || !!this.debugPump;
  }

  updateFire(dt) {
    const f = this.fire, W = this.W;
    f.pumping = this.readPump();
    f.nudge = Math.max(0, f.nudge - dt);
    const pumping = f.pumping || f.nudge > 0;
    f.air = clamp(f.air + (f.pumping ? 2.0 : -0.8) * dt, 0, 1);
    if (pumping) {
      const prev = f.cycle;
      f.cycle += dt / 0.8;
      if (f.pumping && (Math.floor(prev) !== Math.floor(f.cycle) || prev === 0)) {
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
    W.bellows.setCompress(f.compress);
    W.pull.setPull(f.compress);
    W.pullSpan.set(W.pullTop(this._pt || (this._pt = new THREE.Vector3())), W.bellowsEnd(this._pb || (this._pb = new THREE.Vector3())));
    if (this.pullItem) { const g = W.pullGrip(_v); this.pullItem.x = g.x; this.pullItem.y = g.y; this.pullItem.z = g.z; }
    // the magma hearth (forge level 2) never banks down: redder, brighter, always churning
    const magma = (this.game.state.data.forgeLevel || 0) >= 2;
    f.glow += (((magma ? 0.7 : 0.45) + f.air * 0.75) - f.glow) * Math.min(1, dt * 3);
    f.flick = 0.88 + 0.12 * Math.sin(this.time * 13.1) * Math.sin(this.time * 7.7 + 1.3) + (Math.random() - 0.5) * 0.08;
    const g = f.glow * f.flick;
    if (magma) W.hearth.coalMat.color.setRGB(0.8 + g * 0.6, 0.32 + g * 0.42, 0.18 + g * 0.2);
    else W.hearth.coalMat.color.setRGB(0.72 + g * 0.5, 0.5 + g * 0.42, 0.4 + g * 0.3);
    W.hearth.liningMat.color.setRGB(0.55 + g * 0.55, 0.45 + g * 0.35, 0.4 + g * 0.25);
    W.hearth.emberMat.color.setScalar(0.35 + g * 0.35);
    const sh = W.shimmer.userData.shimmer;
    sh.uTime.value = this.time;
    sh.uHeat.value = 0.25 + f.glow * 0.7;
    const fg = W.fireGlow.userData.glow;
    fg.uIntensity.value = (0.16 + f.air * 0.3) * f.flick;
    fg.uSize.value.setScalar(0.75 + f.air * 0.25);
    W.light.intensity = ((magma ? 2.6 : 2.0) + f.air * 3.0) * f.flick + this.extraLight;
    W.light.color.setHSL((magma ? 0.045 : 0.065) + f.air * 0.015, 1, 0.55 + f.air * 0.06);
    this.fireLoop.set({ vol: 0.3 + f.air * 0.45, intensity: f.air });
    // emitters
    const P = this.particles, fp = W.firePos, sp = f.spawn;
    sp.ember += dt * (4 + f.air * 22);
    sp.flame += dt * (12 + f.air * 40);
    sp.smoke += dt * (1.6 + f.air * 2.4);
    while (sp.ember >= 1) { sp.ember--; P.ember(_v.copy(fp).setY(fp.y + 0.02), 0.5, 0.6 + f.air); }
    while (sp.flame >= 1) { sp.flame--; P.flame(_v.copy(fp).setY(fp.y - 0.01), 0.6, 0.5 + f.air * 0.8); }
    while (sp.smoke >= 1) { sp.smoke--; P.smoke(_v.copy(fp).setY(fp.y + 0.3), 0.4, 0.8); }
  }

  /** Bellows stroke: a breath of sparks out of the coals. */
  puff() {
    const fp = this.W.firePos;
    for (let i = 0; i < 6; i++) this.particles.ember(_v.copy(fp), 0.4, 1.6);
    for (let i = 0; i < 8; i++) this.particles.flame(_v.copy(fp), 0.4, 1.4);
  }

  /** Quick smelt: a burst of sparks and steam over the ingot mold. */
  quickSmeltFx(recipe, count) {
    const top = _v.copy(this.W.moldTop).add(_v2.set(0, 0.08, 0));
    this.particles.sparks(top, 18 + Math.min(30, count * 4), 0.7);
    this.particles.sparkle(top, 0xffd27a, 12, 0.3, 0.4);
    this.particles.smoke(top, 0.15, 0.8);
    this.puff();
    this.addShake(0.01);
  }

  // ---------------------------------------------------------------- ambience
  updateAmbience(dt) {
    const t = this.time, W = this.W;
    for (const h of W.hanging) h.obj.rotation.z = Math.sin(t * 0.7 + h.phase) * h.amp;
    W.lantern.rotation.z = Math.sin(t * 0.6) * 0.03;
    const fl = 0.85 + Math.sin(t * 9.3) * 0.06 + Math.sin(t * 17.1) * 0.05;
    W.lanternMat.color.setScalar(fl);
    W.lamp.intensity = 1.1 * fl;
    W.candleMat.color.setScalar(0.8 + Math.sin(t * 13) * 0.12 + Math.random() * 0.08);
    W.shelfGlow.color.setScalar(0.8 + Math.sin(t * 1.4) * 0.15);
    this.waterT -= dt;
    if (this.waterT <= 0) { this.waterT = 0.11; W.water.draw(t, this.waterEnergy || 0); }
    this.waterEnergy = Math.max(0, (this.waterEnergy || 0) - dt * 0.6);
    // Nugget: dozes, looks around, pecks now and then
    const hen = this.hen;
    this.henT -= dt;
    if (this.henT <= 0) {
      this.henT = 2.5 + Math.random() * 5;
      const r = Math.random();
      if (r < 0.35) { hen.play('idle'); hen.peck(); }
      else if (r < 0.7) hen.play('sit');
      else { hen.play('idle'); hen.face(0.3 + Math.random() * 1.4); if (Math.random() < 0.4) this.game.audio.play('cluck', { vol: 0.5 }); }
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
    dt *= this.timeScale;
    const realDt = dt;
    // hit-stop: the world holds its breath for a few frames on a heavy blow
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.06; }
    super.update(dt);
    if (this.post.flash > 0) this.post.flash = Math.max(0, this.post.flash - realDt * 1.6);
    if (this.impactT > 0) {
      this.impactT = Math.max(0, this.impactT - realDt * 7);
      const k = this.impactT;
      const u = this.impactGlow.userData.glow;
      u.uIntensity.value = k * (0.6 + this.impactPower * 0.6);
      u.uSize.value.setScalar(0.06 + (1 - k) * 0.12 + this.impactPower * 0.08);
      this.impactGlow.visible = k > 0.01;
    }
    this.lesson?.update(dt);
    if (this.activity) {
      try { this.activity.update(dt); } catch (e) { console.error(e); this.game.reportError(e); this.activity = null; this.endActivity(); }
    } else {
      this.menus.update(dt);
      if (this.walking()) {
        const inp = this.game.input;
        if (inp.pressed('Digit1')) this.menus.smeltList();
        else if (inp.pressed('Digit2')) this.menus.plan();
        else if (inp.pressed('Digit3')) this.menus.partsList();
      }
    }
    this.extraLight = Math.max(0, this.extraLight - dt * 14);
    this.syncHud();
    // touch: the big button does what holding the mouse does in the current activity
    const tb = this.activity?.touchAction?.() ?? null;
    this.touchBtn.set(tb?.kind || null, tb?.label || '');
    this.updateFire(dt);
    this.updateAmbience(dt);
    this.updateView(dt);
    this.particles.update(dt, this.camera, this.game.engine.height);
  }

  render() {
    if (this.rig) this.rig.render(this.post); // (enter() is still loading the paws on the first frames)
  }

  onResize(w, h) {
    super.onResize(w, h);
    this.rig?.onResize(w, h);
    if (this.view?.mode === 'dock') {
      const to = this.dockPose(this.view.name);
      if (to) { to.yaw += this.view.side || 0; this.view.to = to; }
    }
  }

  exit() {
    if (this.activity) { try { this.activity.dispose?.(); } catch (e) { console.warn(e); } this.activity = null; }
    this.layer?.remove();
    super.exit();
  }

  // ---------------------------------------------------------------- test hooks (scene.debug)
  installDebug() {
    const sc = this;
    this.debug = {
      /** Advance n frames of dt (headless runs are slow: drive the simulation directly). */
      step(n = 30, dt = 1 / 30) { for (let i = 0; i < n; i++) { sc.update(dt); sc.game.input.endFrame(); } return sc.debug.state(); },
      /** Step frames until the activity reaches a step/phase name (or the view settles), max frames. */
      until(name, max = 600, dt = 1 / 30) {
        for (let i = 0; i < max; i++) {
          const a = sc.activity;
          if (name === 'idle' ? !a : name === 'docked' ? sc.docked : a && (a.step === name || a.phase === name || a.infPhase === name)) break;
          sc.update(dt);
          sc.game.input.endFrame();
        }
        return sc.debug.state();
      },
      /** Hold (true) or release the bellows. */
      pump(on = true) { sc.debugPump = !!on; },
      /** Start smelting a recipe (default bronze) as if picked from the list. */
      smelt(id = 'smelt_bronze') { return sc.menus.debugSmelt(id); },
      /** Start forging: sel = { type, metal, infusion, gem } (defaults: first plan, best metal). */
      forge(sel = {}) { return sc.menus.debugForge(sel); },
      /**
       * Coop parts: forge a part to the result, headless. o: { give (add missing inputs),
       * score (force the final quality), q (quality of given ingots), run: false (only start it),
       * blow: 'perfect' | 'good' | 'soft' | 'hard' | 0..1 (how every blow lands) }.
       */
      part(id, o = {}) {
        const st = sc.game.state, menus = sc.menus;
        id = id || menus.partRows().find((r) => r.status === 'ready')?.id || menus.partRows().find((r) => r.status === 'locked' && !r.why?.startsWith('Install'))?.id;
        if (!id) return 'no part to forge';
        if (o.give) {
          const row = menus.partRows().find((r) => r.id === id);
          for (const [iid, n] of Object.entries(row?.need || {})) { const miss = n - st.count(iid); if (miss > 0) st.addItem(iid, { n: miss, q: o.q ?? 80, spill: true }); }
          st.data.energy = Math.max(st.data.energy || 0, 60);
        }
        if (sc.activity) return 'busy: ' + (sc.activity.step || sc.activity.phase);
        if (!menus.startPart(id)) return 'cannot forge ' + id + ': ' + menus.partRows().find((r) => r.id === id)?.why;
        const a = sc.activity;
        if (typeof o.score === 'number') a.forceScore = o.score;
        if (o.run === false) return 'forging ' + id;
        const blowAt = () => {
          const b = o.blow ?? 'perfect';
          if (typeof b === 'number') return b;
          if (b === 'perfect') return (a.perfR[0] + a.perfR[1]) / 2;
          if (b === 'good') return a.zoneR[0] + (a.zoneR[1] - a.zoneR[0]) * 0.1;
          if (b === 'soft') return Math.max(0.05, a.zoneR[0] - 0.12);
          return Math.min(0.99, a.zoneR[1] + 0.04);
        };
        for (let n = 0; n < 8000 && sc.activity === a && a.step !== 'result'; n++) {
          const [w0, w1] = a.sim.workRange;
          if (a.step === 'heat' && !a.moving) { a.sim.T = (w0 + w1) / 2; a.toAnvil(); }
          else if (a.step === 'hammer' && !a.moving && sc.docked && !a.swing && !a.charge && !a.shaped) {
            if (a.sim.T < w0 + 15) a.toFire(); else a.debugStrike(null, blowAt());
          } else if (a.step === 'quench' && !a.busy && !a.plunged) { a.sim.T = (a.sim.quenchRange[0] + a.sim.quenchRange[1]) / 2; a.plunge(); }
          sc.update(1 / 30); sc.game.input.endFrame();
        }
        for (let n = 0; n < 40; n++) { sc.update(1 / 30); sc.game.input.endFrame(); }
        return { id, step: a.step, score: a.score, grade: a.grade?.g, blows: a.sim.blows.length, cracks: a.sim.cracks, carrying: st.count(id), toStash: !!a.toStash };
      },
      /** Coop parts: strike now ('perfect' | 'good' | 'soft' | 'hard' | ring value 0..1). */
      partStrike(kind = 'perfect') {
        const a = sc.activity;
        if (!a || !a.perfR) return false;
        const v = typeof kind === 'number' ? kind : kind === 'perfect' ? (a.perfR[0] + a.perfR[1]) / 2 : kind === 'good' ? a.zoneR[0] + 0.01 : kind === 'soft' ? Math.max(0.05, a.zoneR[0] - 0.12) : Math.min(0.99, a.zoneR[1] + 0.04);
        return a.debugStrike(null, v);
      },
      /** Coop parts: open the list and return its rows ({ id, name, track, level, status, why, need, have, carrying }). */
      partsList() { if (!sc.activity) sc.menus.partsList(); return sc.menus.partRows(); },
      /** Set the work's temperature (crucible, billet columns or finished blade). */
      heatTo(T) { const a = sc.activity; if (!a) return false; if (a.sim && a.sim.T !== undefined && !Array.isArray(a.sim.T)) a.sim.T = T; else if (a.sim) a.sim.T = a.sim.T.map(() => T); if (a.weaponT !== undefined) a.weaponT = T; return true; },
      /** Forging: carry the billet to the anvil / back to the fire. */
      toAnvil() { sc.activity?.toAnvil?.(); },
      toFire() { sc.activity?.toFire?.(); },
      /** Forging: aim at a column and strike with power 0..1 (plays the swing). */
      strike(col, power = 0.8) { return sc.activity?.debugStrike?.(col, power); },
      /** Forging: raise the hammer over a column (held until release()). */
      charge(col, t = 0.6) { return sc.activity?.debugCharge?.(col, t); },
      release() { sc.activity?.release?.(); },
      /** Forging: done shaping (skips the low-shape question). */
      finishShaping() { const a = sc.activity; if (a && a.step === 'hammer') { a.view.hover = -1; a.go('grind'); } },
      /** Forging: set the balance weight to level the blade and confirm. */
      balance(confirm = true) { const a = sc.activity; if (!a || !a.bal) return false; a.balW = (a.bal.Wneed / a.bal.Wmax); if (confirm) { for (let i = 0; i < 40; i++) sc.update(1 / 30); a.busy = false; a.confirmBalance(); } return true; },
      /** Forging: plunge into the quench barrel at temperature T (default: the middle of the window). */
      quench(T) { const a = sc.activity; if (!a || a.step !== 'quench') return false; a.busy = false; a.weaponT = T ?? (a.m.quench[0] + a.m.quench[1]) / 2; a.plunge(); return true; },
      /** Infusion: tap now. */
      tap() { const a = sc.activity; if (a) a.debugTap = true; },
      /** Walk mode: stand at (x, z) facing yaw/pitch. */
      place(x, z, yaw = 0, pitch = -0.2) { if (sc.view.mode === 'dock') sc.undock(); sc.rig.place(x, 0, z, yaw, pitch); sc.camOff.set(0, 0, 0); },
      /** Dock the view at a station (hearth, anvil, barrel, mold, grind, bench, reveal). */
      dock(name) { sc.dock(name, { dur: 0.01 }); },
      state() {
        const a = sc.activity;
        return {
          view: sc.view.mode + (sc.view.name ? ':' + sc.view.name : ''), menu: sc.menus.mode, hud: sc.game.ui.hudMode,
          activity: a ? (a.step || a.phase) : null, T: a?.sim ? Math.round(Array.isArray(a.sim.T) ? a.sim.meanT() : a.sim.T) : undefined,
          shape: a?.sim?.accuracy ? +(typeof a.sim.accuracy === 'function' ? a.sim.accuracy() : a.sim.accuracy).toFixed(2) : undefined,
          air: +sc.fire.air.toFixed(2), tool: sc.rig.vm?.kind, paws: [sc.paws.mode('L'), sc.paws.mode('R')],
        };
      },
    };
  }
}
