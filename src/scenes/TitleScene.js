// Title screen: deep under the old wood, a great bioluminescent mushroom cave (bookends/titleCave.js:
// giant glowcaps lighting it teal and violet, shelf fungi, glowing gills, spores drifting up,
// crystals, roots and dripping stalactites over a still pool, mist on the floor; built only as
// far as these cameras can see). In the foreground stands a weathered trail signpost, grown over
// with fungi, whose arrow boards are the menu (bookends/titleSigns.js; mouse, touch, keys and
// gamepads in bookends/titleSignNav.js): they catch the light and swing on their nails when
// touched, knock when chosen. Behind it, over and over, the mole comes sprinting across the cave
// with a raptor bursting through the mushrooms after him (bookends/titleChase.js); the camera
// drifts slowly. The pixel MOLEFORGE logo sits over it all.
// Wave 9: the cave is the old wood's mushroom hollow now, the forest's golden light pouring down
// through openings in its roof (shafts, dappled pools, a sky-lit funnel over the clearing), a voxel
// grass carpet and ferns that sway and part as they run through, vines and moss hanging. The
// title opens on a short shot (bookends/titleIntro.js, ~8 s): close on the mole fleeing in a
// sweat, the raptor bursting through the glowcaps after him, then up and back into the menu.
// Any key, click or tap skips it at once (and only skips: the boards ignore that press). Continue / New Game glides the camera
// down to a raptor's nest on a mossy shelf (bookends/titleNest.js): three eggs, one per save slot,
// cracked as far as each save has got (hatched, a baby raptor in the shell, once a raptor's been
// tamed); choosing one cracks it open and the camera pushes into its light, into the journey.
//
// Debug (scene.debug): openStones(), closeStones(), pick(i), fake(i, pct), hatch(i, on), smash(i),
// hover(i), focus(i), press(i), boardCenter(i) → [x, y] page px, shot('menu'|'stones'), step(sec),
// chase(t, n) (play chase run n to t s), perf(), ready(), menu (the nav), skipIntro(),
// introAt(t) (the opening, replayed to t s and held there), intro() (its time, or null). Calls
// made while the cave is still being built wait for it; every one but introAt/intro/step/perf
// skips the opening first (so tests see the menu at once).
// Dev: ?lite=0|1 (cave detail), &cam=x,y,z,lookX,lookY,lookZ[,fov] (a fixed camera),
// &frame=sx,sy,size,vx,pitch,fov (try a menu framing for this screen shape), &chase=0 (no chase),
// &intro=0 (no opening shot).
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { el, clamp } from '../core/util.js';
import { slotRaw } from '../core/saves.js';
import { useBookendStyles } from '../bookends/css.js';
import { logoLetters, glintURL } from '../bookends/logo.js';
import { disposeTextures, setPixelScale, fitFov } from '../bookends/fx.js';
import { buildCave, CAVE, floorH, SHAFTS, SUN } from '../bookends/titleCave.js';
import { CF, setSun } from '../bookends/titleCaveFx.js';
import { makeChase } from '../bookends/titleChase.js';
import { INTRO, introShot } from '../bookends/titleIntro.js';
import { makeNest, EGGS } from '../bookends/titleNest.js';
import { caveSounds } from '../bookends/titleSounds.js';
import { makeSignpost } from '../bookends/titleSigns.js';
import { makeSignNav } from '../bookends/titleSignNav.js';
import { openSettings } from '../ui/PauseMenu.js';
import { makeSignMenu } from '../ui/signs.js';

const REDUCED = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const CONTINUE_OK = new Set(['town', 'home', 'forge', 'cooking']); // the mine and the deep fall back to home
/** The old wood's golden light pouring in among the glowcaps: warm highlights, cool blue-green shade. */
const GRADE = { lift: [0.006, 0.014, 0.028], gamma: [1.02, 1.0, 0.97], gain: [1.12, 1.03, 0.88] };
const DARK = 0x0a0806; // the loading card's colour (the journey's too)
const AIR = 0x34443a; // the hollow's haze: soft, sun-warmed green-grey depth
const TURN = 0.14; // the post faces a little past the camera (so its depth shows; the boards turn back to face it)

/**
 * Menu framings per screen shape: where the board stack's middle sits on screen (NDC sx, sy), how
 * much of the screen it fills (size: of the height when wide, of the width when tall), where the
 * heart of the cave lands across the screen (vx: the camera turns until it does), the camera's
 * pitch (+ up) and its fov.
 */
const FRAMES = {
  wide: { sx: 0.4, sy: -0.2, size: 0.36, fit: 'h', vx: -0.28, pitch: 0.06, fov: 40 },
  short: { sx: 0.45, sy: -0.12, size: 0.48, fit: 'h', vx: -0.3, pitch: 0.05, fov: 42 },
  tall: { sx: 0.0, sy: -0.34, size: 0.8, fit: 'w', vx: -0.1, pitch: 0.04, fov: 52 }, // (the boards seen near level: the carved words read)
};
const ASPECTS = [['wide', 16 / 9], ['short', 2.2], ['tall', 390 / 844], ['wide', 4 / 3], ['short', 844 / 390]];

const TITLE_CSS = /* css */`
.tt-cave .tt-left { top: calc(var(--px) * 13); transform: none; }
.tt-left { transition: opacity .35s; }
.bk-title.stones .tt-left { opacity: 0; }
.bk-title.stones .bk-controls, .bk-title.stones .bk-sound { visibility: hidden; }
.tt-back { position: absolute; left: 0; top: 0; }
.tt-cave .bk-logo { filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(6, 4, 14, .6)) drop-shadow(0 0 calc(var(--px) * 6) rgba(120, 230, 220, .22)); }
.tt-cave .bk-sub { color: #e8fff8; }
/* the opening shot: letterbox bars of dark loam with a mossy lip, the menu's words held back */
.bk-title .tt-bar { position: absolute; left: 0; right: 0; height: 0; pointer-events: none; z-index: 3;
  background: #0d0a08; transition: height .7s cubic-bezier(.5, 0, .2, 1); }
.bk-title .tt-bar.top { top: 0; box-shadow: 0 calc(var(--px) * 1) 0 #24341c, 0 calc(var(--px) * 2) 0 rgba(36, 52, 28, .45); }
.bk-title .tt-bar.bot { bottom: 0; box-shadow: 0 calc(var(--px) * -1) 0 #24341c, 0 calc(var(--px) * -2) 0 rgba(36, 52, 28, .45); }
.bk-title.intro .tt-bar { height: 9vh; }
.bk-title .tt-left, .bk-title .bk-controls, .bk-title .bk-sound { transition: opacity .9s ease .1s; }
.bk-title.intro .tt-left, .bk-title.intro .bk-controls, .bk-title.intro .bk-sound { opacity: 0; transition: none; }
.bk-title .tt-skip { position: absolute; right: calc(var(--px) * 8 + env(safe-area-inset-right, 0px)); bottom: calc(9vh + var(--px) * 4);
  z-index: 4; opacity: 0; transition: opacity .5s; pointer-events: none; color: #fff2d0; font-size: calc(var(--px) * 7); }
.bk-title.intro .tt-skip { opacity: .85; transition: opacity .8s ease 1.2s; }
.bk-title .tt-skip kbd { margin-right: calc(var(--px) * 2); }
@media (max-height: 520px) and (min-aspect-ratio: 5/4) {
  .tt-cave .tt-left { top: calc(var(--px) * 6); }
  .tt-left .bk-logo { --lp: calc(var(--px) * 1.5); }
  .tt-left .bk-sub { margin-top: calc(var(--px) * 2.5); }
}
@media (max-aspect-ratio: 5/4) {
  .tt-cave .tt-left { top: calc(var(--px) * 12 + env(safe-area-inset-top, 0px)); bottom: auto; }
  .bk-title .bk-sound { top: auto; bottom: calc(var(--px) * 8 + env(safe-area-inset-bottom, 0px)); }
}
`;

export default class TitleScene extends Scene {
  async enter(params = {}) {
    this.hud = 'none';
    this.music = 'title';
    this.allowMenus = false;
    this.params = params;
    this.ready = false;
    this.pending = [];
    this.textures = [];
    this.loops = {};
    this.perfAcc = { n: 0, upd: 0, ren: 0, nu: 0 };
    this.debug = this.makeDebug(); // (now: tests may reach for it while the cave is still being built)
    this.own(useBookendStyles());
    this.own(() => disposeTextures(this.textures));
    this.own(() => { for (const h of Object.values(this.loops)) h?.stop?.(0.3); });
    const style = document.createElement('style');
    style.textContent = TITLE_CSS;
    document.head.append(style);
    this.own(() => style.remove());
    const g = this.game, eng = g.engine;
    setPixelScale(eng.height);
    caveSounds(g.audio);

    const sc = this.scene;
    sc.background = new THREE.Color(AIR);
    sc.fog = new THREE.FogExp2(AIR, 0.034);
    setSun(SUN);
    CF.uMistCol.value.set(0x3a6a52);
    CF.uMistDen.value = 0.1;
    this.camera = new THREE.PerspectiveCamera(40, eng.aspect, 0.05, 160);

    // a quiet card while the cave is built (a second or two; longer on a phone)
    this.loadCard = el('div', { class: 'bk-root bk-loading' }, [el('div', { class: 'bk-load' }, [el('i', { class: 'bk-load-leaf' }), el('span', {}, 'The glowcaps stir…')])]);
    g.ui.world.append(this.loadCard);
    this.own(() => this.loadCard?.remove());

    // ---- the signpost first: the camera is framed on it, and the cave is built for that camera
    const soft = params.lite !== '0' && params.lite !== '1' && !!eng.softwareGL;
    const lite = params.lite === '1' || soft || (params.lite !== '0' && eng.fx !== 'high');
    this.lite = soft ? 'soft' : lite;
    const anySave = g.state.listSlots().some((s) => s.used);
    this.items = [
      { label: anySave ? 'Continue' : 'New Game', primary: true, dir: 1, onClick: () => this.openStones() },
      { label: 'Settings', dir: -1, onClick: () => this.openSettings() },
      { label: 'Credits', dir: 1, onClick: () => this.openCredits() },
    ];
    this.sign = makeSignpost(this.items, { face: -TURN, look: 'cave' });
    this.own(() => this.sign.dispose());
    const sx = +params.signx || CAVE.sign.x, sz = +params.signz || CAVE.sign.z; // (dev: try another spot)
    this.signBase = new THREE.Vector3(sx, floorH(sx, sz) - 0.02, sz);
    this.sign.group.position.copy(this.signBase);
    sc.add(this.sign.group);
    // it faces the wide framing's camera (a little past it): settle the two together
    this.sign.group.rotation.y = Math.atan2(0.4 - sx, 5 - sz);
    this.frames = new Map();
    for (let k = 0; k < 3; k++) {
      this.sign.group.updateMatrixWorld(true);
      this.stack = this.stackBox();
      this.frames.clear();
      const f = this.frame('wide', 16 / 9).f;
      this.sign.group.rotation.y = Math.atan2(-f.x, -f.z) + TURN;
    }
    this.sign.group.updateMatrixWorld(true);
    this.stack = this.stackBox();
    this.frames.clear();
    this.cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, init: false };
    this.shotName = 'menu';
    this.camera.aspect = eng.aspect;

    const tSign = performance.now();
    // ---- the nest (its shot is one of the cameras the cave is built for); its DOM joins the page later
    const menuCam = this.frame('wide', 16 / 9).pos;
    this.nestHolder = el('div', { class: 'tt-nest' });
    this.nest = makeNest(this.nestHolder, {
      audio: g.audio, camera: this.camera, canvas: eng.canvas,
      yaw: Math.atan2(menuCam.x - CAVE.nest.x, menuCam.z - CAVE.nest.z) - 0.25,
      slots: () => g.state.listSlots(),
      tame: (i) => this.tamed(i),
      onPick: (i, info) => this.pickSlot(i, info),
      onDelete: (i) => g.ui.confirm(`<b>Break egg ${i + 1}?</b><br>The ${EGGS[i].name.toLowerCase()} egg and the save in it will be gone for good.`, 'Break it', 'Keep it'),
      afterDelete: (i) => { g.state.deleteSlot(i); this.refreshMenu(); },
    });
    this.own(() => this.nest.destroy());
    sc.add(this.nest.group);

    const tNest = performance.now();
    // ---- the cave: only what these framings (every screen shape, the drift, the nest, the push into an egg) can see
    const t0 = performance.now();
    const view = this.makeView();
    this.C = await buildCave({ lite, soft, view, cancel: () => this.gone });
    if (this.gone || this.C.cancelled) { this.C.dispose?.(); return; }
    this.own(() => this.C.dispose());
    sc.add(this.C.group);
    this.C.sfx = (name, o) => this.game.audio.play(name, o);
    const tCave = performance.now();
    // the chase across it
    this.chaseOn = params.chase !== '0';
    this.chase = makeChase({ cave: this.C, lite, sfx: (name, o) => this.sfx(name, o) });
    this.chase.hold = !this.chaseOn;
    this.own(() => this.chase.dispose());
    sc.add(this.chase.group);

    // ---- light: the glowcaps' own (in the cave), the wood's daylight spilling down through the
    // openings (a soft warm key from the sun's side, sky light over a mossy, sun-warmed floor; the
    // shafts themselves are in the materials, titleCaveFx.js caSun), a warm bounce onto the boards
    this.hemi = new THREE.HemisphereLight(0xb8c8b0, 0x6a5430, 1.6);
    this.key = new THREE.DirectionalLight(0xffd29a, 1.25);
    this.key.position.copy(SUN).multiplyScalar(30);
    this.bounce = new THREE.DirectionalLight(0xffc890, 0.9);
    this.bounce.position.set(-0.3, 0.45, 1).multiplyScalar(30);
    this.bounce.target = this.sign.group;
    sc.add(this.hemi, this.key, this.bounce);

    Object.assign(this.post, {
      outlineFar: 22, vignette: 0.36, saturation: 1.12, contrast: 1.08, grade: GRADE, gradeMix: 1, exposure: 1.0,
      bloom: 0.75, bloomThreshold: 0.7, bloomKnee: 0.25, wideGlow: 0.55, ao: 0.85, aoRadius: 0.5,
      rays: 0.9, raysPos: SHAFTS[0].top.clone(), raysSky: 1, raysThreshold: 0.82, raysColor: 0xffd49a, raysRadius: 0.55, raysDecay: 0.968, raysLength: 0.95,
      fade: 0, fadeColor: DARK,
    });
    if (soft) this.post.outline = false; // (a software rasterizer can't afford the outline pass)

    const tChase = performance.now();
    this.buildDom();
    this.layoutCamera(eng.width, eng.height, true);
    this.updateWorld(0);
    const tPre = performance.now();
    await this.precompile();
    this.timing = { nest: Math.round(tNest - tSign), cave: Math.round(tCave - t0), chase: Math.round(tChase - tCave), precompile: Math.round(performance.now() - tPre) };
    if (this.gone) return;
    this.buildMs = Math.round(performance.now() - t0);
    const st = this.C.stats;
    console.log(`[title] cave built in ${this.buildMs} ms (${this.lite === 'soft' ? 'soft' : lite ? 'lite' : 'full'}; rock ${st.reliefMs} ms, giants ${st.giantsMs} ms, models ${st.modelsMs} ms, ${Math.round(st.tris / 1000)}k tris built)`, JSON.stringify(this.timing));
    this.ready = true;
    this.loadCard?.remove();
    this.loadCard = null;
    // the cave's sound: its slow breath, far drips, a trickle behind the glowcaps
    this.loop('cave_air', 0.55);
    this.loop('cave_water', 0.16);
    // the opening shot (not with the chase off, and not twice in a row if the motion is reduced)
    if (this.chaseOn && this.params.intro !== '0' && !REDUCED) this.startIntro();
    for (const fn of this.pending.splice(0)) fn();
  }

  // ------------------------------------------------------------------ the opening
  startIntro() {
    this.intro = { t: 0 };
    this.C.setIntro(true);
    this.root.classList.add('intro');
    this.chase.startIntro();
    this.menu.enabled = false;
    this.introCam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40 };
    this.updateIntro(0);
  }

  /** The opening's camera at its time now (and the menu's words coming up near its end). */
  updateIntro(dt) {
    const I = this.intro;
    I.t += dt;
    const sh = introShot(I.t, this.shot(), this.chase.live(), this.introCam);
    // on a screen held tall the close shots widen to keep the mole and the raptor in
    const c = { aspect: this.camera.aspect, fov: sh.fov, updateProjectionMatrix() {} };
    fitFov(c, sh.fov, this.camera.aspect < 1 ? 50 : 0);
    this.cam.pos.copy(sh.pos); this.cam.look.copy(sh.look); this.cam.fov = c.fov;
    if (I.t >= INTRO.ui && this.root.classList.contains('intro')) this.root.classList.remove('intro');
    if (I.t >= INTRO.dur) this.endIntro(false);
  }

  /** The opening's over (skipped: the camera is in the menu's place at once). */
  endIntro(skip = true) {
    if (!this.intro) return;
    this.intro = null;
    this.C.setIntro(false);
    this.root.classList.remove('intro');
    this.menu.enabled = !(this.nest?.open || this.busy);
    if (skip) {
      const s = this.shot();
      this.cam.pos.copy(s.pos); this.cam.look.copy(s.look); this.cam.fov = s.fov;
      this.skipT = performance.now();
    }
    this.applyCamera(this.time || 0);
    if (!this.nest?.open && !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) this.menu.focus(0, true);
  }

  /** Has save slot i tamed a raptor? (data.tame.raptors) */
  tamed(i) {
    const st = this.game.state;
    try {
      const d = i === st.slot ? st.data : JSON.parse(slotRaw(i) || 'null');
      return !!(d && d.tame?.raptors?.length > 0);
    } catch (e) { return false; }
  }

  /** A sound placed where it happens: pan from the screen, quieter and duller far off. */
  sfx(name, o = {}) {
    const a = this.game.audio;
    if (!a.ctx || a.ctx.state !== 'running') return;
    const at = o.at;
    if (!at) { a.play(name, o); return; }
    const v = this._sv || (this._sv = new THREE.Vector3());
    v.set(at.x, at.y ?? 0, at.z);
    const d = v.distanceTo(this.camera.position);
    v.project(this.camera);
    if (Math.abs(v.x) > 1.6 || v.z > 1) return;
    a.play(name, { pan: clamp(v.x * 0.85, -0.85, 0.85), vol: (o.vol ?? 1) * clamp(1.5 - d / 16, 0.12, 1), far: d > 10 });
  }

  loop(name, vol) {
    const h = this.loops[name];
    if (!h || h.alive === false) this.loops[name] = this.game.audio.loop(name, { vol, fadeIn: 1.2 });
    else h.set({ vol });
  }

  /** Run fn now, or once the cave is built. */
  whenReady(fn) { if (this.ready) fn(); else this.pending.push(fn); }

  /** The board stack's box in the signpost's local frame (boards only). */
  stackBox() {
    const b3 = new THREE.Box3(), tmp = new THREE.Box3(), m = new THREE.Matrix4();
    const root = this.sign.group;
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    for (const b of this.sign.boards) {
      m.multiplyMatrices(inv, b.pivot.matrixWorld);
      tmp.copy(b.box).applyMatrix4(m);
      b3.union(tmp);
    }
    return b3;
  }

  /**
   * A menu framing for a screen of the given aspect: { pos, look, fov, f }. kind: 'wide' | 'short' |
   * 'tall' (or a FRAMES-like object). The board stack's middle lands at (sx, sy) and fills `size`;
   * the camera turns until the heart of the cave lands at vx.
   */
  frame(kind, aspect) {
    const key = (typeof kind === 'string' ? kind : JSON.stringify(kind)) + '|' + aspect.toFixed(3);
    const hit = this.frames.get(key);
    if (hit) return { pos: hit.pos.clone(), look: hit.look.clone(), fov: hit.fov, f: hit.f.clone(), M: hit.M, dist: hit.dist };
    const fr = typeof kind === 'string' ? FRAMES[kind] : kind;
    const root = this.sign.group;
    const M = this.stack.getCenter(new THREE.Vector3()).applyMatrix4(root.matrixWorld);
    const sz = this.stack.getSize(new THREE.Vector3());
    // the fov: never narrower across than 44 degrees on a screen held tall
    const cam = { aspect, fov: fr.fov, updateProjectionMatrix() {} };
    fitFov(cam, fr.fov, fr.fit === 'w' ? 44 : 0);
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2), tanH = tanV * aspect;
    const dist = fr.fit === 'w' ? sz.x / (2 * tanH * fr.size) : sz.y / (2 * tanV * fr.size);
    const Y = new THREE.Vector3(0, 1, 0);
    const VISTA = CAVE.vista;
    const place = (H) => {
      const f = new THREE.Vector3(Math.sin(H) * Math.cos(fr.pitch), Math.sin(fr.pitch), -Math.cos(H) * Math.cos(fr.pitch));
      const right = new THREE.Vector3().crossVectors(f, Y).normalize();
      const up = new THREE.Vector3().crossVectors(right, f).normalize();
      const pos = M.clone().addScaledVector(f, -dist).addScaledVector(right, -fr.sx * dist * tanH).addScaledVector(up, -fr.sy * dist * tanV);
      const d = VISTA.clone().sub(pos);
      const z = d.dot(f);
      return { f, pos, vx: z > 0.1 ? d.dot(right) / (z * tanH) : 9 };
    };
    // turn until the heart of the cave lands at vx (coarse sweep, then a fine one)
    let best = 0, bd = Infinity;
    for (let H = -1.4; H <= 1.4; H += 0.02) { const e = Math.abs(place(H).vx - fr.vx); if (e < bd) { bd = e; best = H; } }
    for (let H = best - 0.02; H <= best + 0.02; H += 0.001) { const e = Math.abs(place(H).vx - fr.vx); if (e < bd) { bd = e; best = H; } }
    const { f, pos } = place(best);
    pos.y = Math.max(pos.y, floorH(pos.x, pos.z) + 0.35);
    const out = { pos, look: pos.clone().add(f), fov: cam.fov, f, M, dist };
    this.frames.set(key, out);
    return { pos: pos.clone(), look: out.look.clone(), fov: out.fov, f: f.clone(), M, dist };
  }

  /** Which menu framing this screen shape gets. */
  menuKind() {
    const a = this.camera.aspect;
    if (this.params.frame) { const v = String(this.params.frame).split(',').map(Number); return { sx: v[0], sy: v[1], size: v[2], vx: v[3], pitch: v[4], fov: v[5] || 40, fit: a < 1 ? 'w' : 'h' }; }
    return a < 1 ? 'tall' : a > 1.95 || this.game.engine.height < 420 ? 'short' : 'wide';
  }

  /** The framing for this screen (and shot). */
  shot() {
    const a = this.camera.aspect;
    if (this.shotName === 'stones') return this.nest.shot(a);
    if (this.shotName === 'leave') return this.nest.shot(a, this.leaveI ?? 0);
    return this.frame(this.menuKind(), a);
  }

  /**
   * What the cave must build: every framing's view (each screen shape, the menu and the nest, the
   * push into an egg), widened for the drift. view.box / view.point test against them; view.dist
   * is the distance to the nearest of their cameras (for detail).
   */
  makeView() {
    const frusta = [], eyes = [], menuN = { f: 0, e: 0 };
    const add = (s, aspect, widen = 1.12) => {
      const c = new THREE.PerspectiveCamera(Math.min(150, s.fov * widen + 4), aspect * 1.08, 0.05, 160);
      c.position.copy(s.pos); c.lookAt(s.look); c.updateMatrixWorld(); c.updateProjectionMatrix();
      frusta.push(new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse)));
      eyes.push(s.pos.clone());
    };
    const introShots = [];
    for (const [k, a] of ASPECTS) {
      const menu = this.frame(k, a);
      add(menu, a);
      add(this.nest.shot(a), a, 1.05);
      // the opening's cameras (its script is fixed: the cave is built for all of them)
      if (this.params.intro !== '0' && this.params.chase !== '0') {
        for (let t = 0; t <= INTRO.dur; t += 0.35) {
          const sh = introShot(t, menu);
          const c = { aspect: a, fov: sh.fov, updateProjectionMatrix() {} };
          fitFov(c, sh.fov, a < 1 ? 50 : 0);
          introShots.push([{ pos: sh.pos.clone(), look: sh.look.clone(), fov: c.fov }, a]);
        }
      }
    }
    menuN.f = frusta.length; menuN.e = eyes.length;
    for (const [sh, a] of introShots) add(sh, a, 1.18);
    const B = new THREE.Box3(), S = new THREE.Sphere();
    const make = (nf, ne) => ({
      box(x0, y0, z0, x1, y1, z1) { B.min.set(x0, y0, z0); B.max.set(x1, y1, z1); for (let i = 0; i < nf; i++) if (frusta[i].intersectsBox(B)) return true; return false; },
      point(x, y, z, r = 0.3) { S.center.set(x, y, z); S.radius = r; for (let i = 0; i < nf; i++) if (frusta[i].intersectsSphere(S)) return true; return false; },
      dist(x, y, z) { let d = Infinity; for (let i = 0; i < ne; i++) { const e = eyes[i]; d = Math.min(d, Math.hypot(e.x - x, e.y - y, e.z - z)); } return d; },
    });
    const all = make(frusta.length, eyes.length);
    // (view.menu: just the menu's framings and the nest's; what only the opening sees is built apart)
    if (introShots.length) all.menu = make(menuN.f, menuN.e);
    return all;
  }

  // ------------------------------------------------------------------ DOM
  buildDom() {
    const g = this.game;
    const word = 'MOLEFORGE';
    const cssVars = (e, vars) => { for (const [k, v] of Object.entries(vars)) e.style.setProperty(k, String(v)); return e; }; // el() can't set custom properties
    const letters = logoLetters().map((L, i) => cssVars(el('span', { class: L.hot ? 'hot' : '', 'aria-hidden': 'true' }, [
      el('img', { class: 'pix', src: L.url, alt: '', draggable: 'false', style: { width: `calc(var(--lp) * ${L.w})`, height: `calc(var(--lp) * ${L.h})` } }),
    ]), { '--i': i }));
    const glint = glintURL();
    const sparkles = [[1, 0.18, 0.22, 0], [8, 0.25, 0.12, 1.9], [5, 0.4, 0.05, 3.3]].map(([li, x, y, d]) => cssVars(el('img', { class: 'pix bk-glint', src: glint, alt: '', style: { animationDelay: `${2.6 + d}s` } }), { '--gl': li, '--gx': x, '--gy': y }));
    const embers = Array.from({ length: 9 }, (_, i) => el('i', { class: 'bk-ember', style: { left: `${46 + ((i * 37) % 52)}%`, animationDelay: `${(i * 0.53) % 2.6 + 2}s`, animationDuration: `${2.1 + (i % 4) * 0.35}s` } }));
    const logo = el('h1', { class: 'bk-logo', 'aria-label': word }, [...letters, ...sparkles, ...embers]);
    requestAnimationFrame(() => {
      for (const sp of sparkles) {
        const li = +sp.style.getPropertyValue('--gl');
        const L = letters[li];
        if (!L) continue;
        sp.style.left = `${L.offsetLeft + L.offsetWidth * +sp.style.getPropertyValue('--gx')}px`;
        sp.style.top = `${L.offsetTop + L.offsetHeight * +sp.style.getPropertyValue('--gy')}px`;
      }
    });
    const sub = el('div', { class: 'bk-sub bk-outline' }, [el('i'), 'One million gold to the surface', el('i')]);
    const keys = [['WASD', 'move'], ['C', 'crouch/dive'], ['Mouse', 'dig/aim'], ['E', 'interact'], ['B', 'the book'], ['I', 'backpack'], ['Esc', 'menu']];
    const controls = el('div', { class: 'bk-controls bk-outline' });
    keys.forEach(([k, label], i) => {
      if (i) controls.append(el('span', { class: 'dot' }, '·'));
      controls.append(el('kbd', {}, k), label);
    });
    this.soundHint = el('div', { class: 'bk-sound bk-outline', role: 'status' }, [el('span', { class: 'bk-sound-in' }, [el('span', { class: 'note' }, '♪'), (window.matchMedia && window.matchMedia('(pointer: coarse)').matches ? 'tap' : 'click') + ' anywhere for sound'])]);
    this.left = el('div', { class: 'bk-left tt-left' }, [logo, sub]);
    const touchy = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.skipHint = el('div', { class: 'tt-skip bk-outline', 'aria-hidden': 'true' }, touchy ? ['tap to skip'] : [el('kbd', {}, 'any key'), 'skip']);
    this.root = el('div', { class: 'bk-root bk-title tt-cave' }, [el('i', { class: 'tt-bar top' }), el('i', { class: 'tt-bar bot' }), this.left, controls, this.soundHint, this.nestHolder, this.skipHint]);
    g.ui.world.append(this.root);
    this.own(() => this.root.remove());
    this.audioOn = false;

    // the signpost's boards are the menu
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.menu = makeSignNav({
      layer: this.root, canvas: g.engine.canvas, camera: this.camera, post: this.sign, items: this.items, audio: g.audio, label: 'Main menu',
      blocked: () => g.ui.isPanelOpen() || this.nest?.open || this.busy || g.transitioning || !!this.intro || performance.now() - (this.skipT || 0) < 350,
      onBack: () => { if (g.ui.isPanelOpen()) g.ui.closePanel(); else if (this.nest?.open) this.closeStones(); },
    });
    this.own(() => this.menu.destroy());
    if (!touch) this.menu.focus(0, true);

    this.onKey = (e) => {
      if (e.key === 'Escape' && this.nest.open && !g.ui.isPanelOpen()) { e.preventDefault(); this.closeStones(); }
    };
    window.addEventListener('keydown', this.onKey);
    this.own(() => window.removeEventListener('keydown', this.onKey));
    // any key, click or tap skips the opening (first, before the boards hear it)
    this.onSkip = () => { if (this.intro) this.endIntro(true); };
    for (const ev of ['keydown', 'pointerdown', 'touchstart', 'wheel']) window.addEventListener(ev, this.onSkip, { capture: true, passive: true });
    this.own(() => { for (const ev of ['keydown', 'pointerdown', 'touchstart', 'wheel']) window.removeEventListener(ev, this.onSkip, { capture: true }); });
  }

  /** The first board reads Continue while any egg holds a save. */
  refreshMenu() {
    const anySave = this.game.state.listSlots().some((s) => s.used);
    const want = anySave ? 'Continue' : 'New Game';
    if (this.items[0].label !== want) { this.sign.setLabel(0, want); this.menu.setLabel(0, want); }
  }

  /** Down to the nest: the three eggs are the save slots. */
  openStones() {
    if (!this.ready) { this.whenReady(() => this.openStones()); return; }
    if (this.busy || this.nest.open) return;
    this.root.classList.add('stones');
    this.menu.enabled = false;
    this.sign.setFocus(-1);
    this.setShot('stones');
    this.nest.show();
    this.chase.hold = true;
    this.game.audio.play('rumble_hit', { vol: 0.2 });
    // a single sign to go back, hanging from the roof at the top left
    const holder = el('div', { class: 'tt-back' });
    holder.style.left = 'calc(var(--px) * 8 + env(safe-area-inset-left, 0px))';
    this.root.append(holder);
    this.backMenu = makeSignMenu(holder, [{ label: 'Back', onClick: () => this.closeStones() }], { audio: this.game.audio, layer: this.root, mount: 'ceiling', hanger: 'rope', top: 4, label: 'Back', autofocus: false, breeze: 0.2 });
    this.backHolder = holder;
  }

  closeStones() {
    if (this.busy || !this.nest.open) return;
    this.nest.hide();
    this.root.classList.remove('stones');
    this.setShot('menu');
    this.chase.hold = !this.chaseOn;
    this.backMenu?.raise(true);
    const bm = this.backMenu, bh = this.backHolder;
    setTimeout(() => { bm?.destroy(); bh?.remove(); }, 500);
    this.backMenu = null;
    this.backHolder = null;
    setTimeout(() => { this.menu.enabled = true; this.menu.focus(0, true); }, 300);
  }

  pickSlot(i, info) {
    if (this.busy) return;
    const g = this.game, st = g.state;
    this.busy = true;
    let to, params;
    if (info && info.used) {
      st.useSlot(i);
      // never fell yet (a save from before the opening): play the fall first
      if (!st.flag('fallen')) { to = 'fall'; params = {}; } else { to = this.continueTarget(); params = { from: 'continue' }; }
    } else {
      // every new game opens with the fall
      st.useSlot(i, { fresh: true });
      to = 'fall'; params = {};
    }
    this.leaveI = i;
    this.leave(to, params);
  }

  /** Push the camera into the chosen egg's light, fading to the journey's dark, then go. */
  leave(to, params) {
    this.setShot('leave');
    this.nest.hide();
    this.root.classList.add('stones');
    this.backMenu?.raise(true); // (the Back sign is pulled up out of the way)
    this.loops.cave_water?.set?.({ vol: 0 });
    const t0 = performance.now(), dur = 900;
    this.leaving = { t0, dur };
    setTimeout(() => this.game.goto(to, params, { transition: 'fade', dur: 0.2, color: DARK }), dur);
  }

  /** lastScene || 'home', but never back into the title, the ending or a dev scene. */
  continueTarget() {
    const ls = this.game.state.flag('lastScene');
    return CONTINUE_OK.has(ls) ? ls : 'home';
  }

  openSettings() {
    openSettings(this.game, { onClose: () => setTimeout(() => this.menu.focus(1, true), 30) });
  }

  openCredits() {
    const body = el('div', { class: 'bk-credits-body' }, [
      el('p', {}, 'A tough little mole, an old star-nosed smith, and one million gold between them and the sun.'),
      el('ul', {}, [
        el('li', {}, 'Made with Three.js'),
        el('li', {}, 'Every sound a real recording'),
        el('li', {}, 'All art procedurally generated'),
        el('li', {}, 'No image or model files'),
      ]),
      el('p', { class: 'muted' }, 'Thank you for digging with us.'),
    ]);
    this.game.ui.openPanel({ title: 'Credits', sub: 'MOLEFORGE', body, onClose: () => setTimeout(() => this.menu.focus(2, true), 30) });
  }

  // ------------------------------------------------------------------ camera
  setShot(name) { this.shotName = name; }

  layoutCamera(w, h, snap = false) {
    this.camera.aspect = w / h;
    // the boards turn on their nails to face this screen's camera (so the words read square on)
    this.sign.faceToward(this.frame(this.menuKind(), this.camera.aspect).pos);
    const s = this.shot();
    if (snap || !this.cam.init) {
      this.cam.pos.copy(s.pos); this.cam.look.copy(s.look); this.cam.fov = s.fov; this.cam.init = true;
    }
    // dev: ?cam=x,y,z,lookX,lookY,lookZ[,fov] for a fixed view
    const dc = this.params && this.params.cam ? String(this.params.cam).split(',').map(Number) : null;
    if (dc && dc.length >= 6) this.camFixed = { pos: new THREE.Vector3(dc[0], dc[1], dc[2]), look: new THREE.Vector3(dc[3], dc[4], dc[5]), fov: dc[6] || 40 };
    this.applyCamera(this.time || 0);
  }

  applyCamera(t) {
    const c = this.camera;
    if (this.camFixed) {
      c.position.copy(this.camFixed.pos); c.fov = this.camFixed.fov; c.lookAt(this.camFixed.look); c.updateProjectionMatrix(); c.updateMatrixWorld();
      return;
    }
    const { pos, look, fov } = this.cam;
    // a slow, gentle drift: the camera sways round the signpost and breathes in and out, so the
    // boards stay where they are on screen while the cave beyond them turns a little
    const M = this._m || (this._m = new THREE.Vector3());
    M.copy(this.stack.getCenter(M)).applyMatrix4(this.sign.group.matrixWorld);
    if (this.shotName !== 'menu') M.copy(look);
    const calm = (this.shotName === 'menu' ? 1 : 0.35) * (REDUCED || this.intro ? 0 : 1);
    const yaw = (Math.sin(t * 0.061) * 0.028 + Math.sin(t * 0.023 + 1.3) * 0.018) * calm;
    const breathe = 1 + Math.sin(t * 0.047) * 0.012 * calm;
    const off = this._off || (this._off = new THREE.Vector3());
    off.subVectors(pos, M).multiplyScalar(breathe).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    c.position.copy(M).add(off);
    c.position.y += Math.sin(t * 0.11) * 0.012 * calm;
    const lk = this._lk || (this._lk = new THREE.Vector3());
    lk.subVectors(look, M).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw).add(M);
    c.fov = fov;
    c.lookAt(lk);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
  }

  onResize(w, h) {
    setPixelScale(h);
    if (!this.sign) return;
    this.layoutCamera(w, h);
  }

  render() {
    // still building: draw nothing but the dark (cheap), under the loading card
    if (!this.ready) { this.game.engine.render(this._blank || (this._blank = new THREE.Scene()), this.camera, { outline: false, bloom: 0, rays: 0, fade: 1, fadeColor: DARK }); return; }
    const a = performance.now();
    this.game.engine.render(this.scene, this.camera, this.post);
    this.perfAcc.ren += performance.now() - a;
    this.perfAcc.n++;
  }

  exit() {
    this.gone = true;
    CF.uGlowGain.value = 1;
    super.exit();
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    super.update(dt);
    if (!this.ready) return;
    if (this.intro?.hold) return; // (debug.introAt: a still of the opening)
    const a = performance.now();
    if (this.intro) this.updateIntro(dt);
    else {
      // glide toward the current framing (down to the nest a little slower, an easy swoop)
      const s = this.shot();
      const k = 1 - Math.exp(-dt * (this.shotName === 'leave' ? 1.9 : this.shotName === 'stones' ? 1.7 : 2.2));
      this.cam.pos.lerp(s.pos, k);
      this.cam.look.lerp(s.look, k);
      this.cam.fov += (s.fov - this.cam.fov) * k;
    }
    this.applyCamera(this.time);
    this.sign.update(dt, this.camera, this.game.engine.height);
    this.menu.update(dt);
    this.updateWorld(dt);
    if (this.leaving) {
      const u = clamp((performance.now() - this.leaving.t0) / this.leaving.dur, 0, 1);
      this.post.fade = u * u;
    }
    const ctx = this.game.audio.ctx;
    const on = !!(ctx && ctx.state === 'running');
    if (on !== this.audioOn) {
      this.audioOn = on;
      this.soundHint.classList.toggle('gone', on);
    }
    this.perfAcc.upd += performance.now() - a;
    this.perfAcc.nu++;
  }

  updateWorld(dt) {
    const cam = this.camera, h = this.game.engine.height;
    this.C.update(dt, cam, h);
    this.chase.update(dt, cam, h);
    this.nest.update(dt, h);
  }

  /**
   * Compile every shader the title needs now, under the loading card (the boards' lit looks too),
   * a few at a time so a software renderer doesn't freeze the page.
   */
  async precompile() {
    const r = this.game.engine.renderer, sc = this.scene, cam = this.camera;
    const extra = new THREE.Group();
    const geo = this.sign.boards[0].woodMesh.geometry;
    for (const m of this.sign.materials) extra.add(new THREE.Mesh(geo, m));
    sc.add(extra);
    const hidden = [];
    sc.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    const meshes = [];
    sc.traverse((o) => { if ((o.isMesh || o.isPoints) && o.material) meshes.push(o); });
    const seen = new Set();
    for (const m of meshes) {
      const key = m.material.uuid + (m.isInstancedMesh ? 'i' : '') + (m.isSkinnedMesh ? 's' : '');
      if (seen.has(key)) continue;
      seen.add(key);
      try { r.compile(m, cam, sc); } catch (e) { /* optional */ }
      await new Promise((res) => setTimeout(res, 0));
      if (this.gone) break;
    }
    for (const o of hidden) o.visible = false;
    sc.remove(extra);
  }

  // ------------------------------------------------------------------ test hooks
  makeDebug() {
    const self = this;
    // (every action skips the opening first, so a test sees the menu at once)
    const later = (fn) => (...a) => { const go = () => { self.endIntro(true); return fn(...a); }; if (self.ready) return go(); self.whenReady(go); return undefined; };
    return {
      ready: () => !!self.ready,
      /** Skip the opening shot (as any key does). */
      skipIntro: later(() => {}),
      /** The opening's time (s), or null when it isn't playing. */
      intro: () => (self.intro ? +self.intro.t.toFixed(2) : null),
      /** (screenshots) Replay the opening from the start to t seconds, in 1/30 s steps, and hold it there. */
      introAt: (t = 0) => {
        const run = () => {
          self.startIntro();
          const n = Math.round(t * 30);
          for (let i = 0; i < n && self.intro; i++) self.update(1 / 30);
          if (self.intro) self.intro.hold = true;
        };
        if (self.ready) run(); else self.whenReady(run);
      },
      get menu() { return self.menu; },
      get stones() { return self.nest; },
      get nest() { return self.nest; },
      get sign() { return self.sign; },
      openStones: later(() => self.openStones()),
      closeStones: later(() => self.closeStones()),
      /** Choose slot i: through its egg when the nest is open (the crack, then the journey), else at once. */
      pick: later((i) => { if (self.nest.open) self.nest.pick(i); else { const info = self.game.state.listSlots()[i]; self.pickSlot(i, info); } }),
      /** Pretend slot i is at pct% complete (null to stop pretending). */
      fake: later((i, pct) => self.nest.setFake(i, pct)),
      /** Pretend slot i has hatched (true / false; null: as its save says). */
      hatch: later((i, on) => self.nest.setHatched(i, on)),
      hover: later((i) => self.nest.hover(i)),
      smash: later((i) => self.nest.smash(i)),
      focus: later((i) => self.menu.focus(i)),
      press: later((i) => self.menu.press(i)),
      /** Play chase run n (0: right to left, 1: left to right; the raptor's colours go round with n) to t seconds. */
      chase: later((t = 3, n = 0) => self.chase.jump(t, n)),
      /** (screenshots) A close look at egg i (null: back to the framed camera). */
      closeup: later((i, d = 0.6, fov = 34) => {
        if (i == null) { self.camFixed = null; return; }
        const E = self.nest.eggs[i];
        E.hold.updateWorldMatrix(true, false);
        const c = new THREE.Vector3(0, 0.12, 0).applyMatrix4(E.hold.matrixWorld);
        const from = self.nest.shot(self.camera.aspect).pos;
        const dir = c.clone().sub(from).normalize();
        self.camFixed = { pos: c.clone().addScaledVector(dir, -d), look: c, fov };
        self.applyCamera(self.time);
      }),
      /** Where board i's words are on the page (CSS px). */
      boardCenter: (i) => (self.ready ? self.menu.center(i) : null),
      shot: later((name) => { self.setShot(name); const s = self.shot(); self.cam.pos.copy(s.pos); self.cam.look.copy(s.look); self.cam.fov = s.fov; self.applyCamera(self.time); }),
      /** Advance the scene (and the nest, the back sign) by `sec` seconds in 1/30 s steps. */
      step(sec = 1) {
        if (!self.ready) return;
        const n = Math.round(sec * 30);
        for (let i = 0; i < n; i++) { self.update(1 / 30); self.backMenu?.step(1 / 30); }
      },
      /** Frame cost: CPU ms per update and render (averaged since the last call), draw calls, triangles. */
      perf() {
        const r = self.game.engine.renderer;
        r.info.autoReset = false; r.info.reset();
        self.render();
        const out = { calls: r.info.render.calls, tris: r.info.render.triangles, lite: self.lite, buildMs: self.buildMs };
        r.info.autoReset = true;
        const A = self.perfAcc;
        if (A.nu) out.updateMs = +(A.upd / A.nu).toFixed(2);
        if (A.n) out.renderMs = +(A.ren / A.n).toFixed(2);
        self.perfAcc = { n: 0, upd: 0, ren: 0, nu: 0 };
        return out;
      },
    };
  }
}
