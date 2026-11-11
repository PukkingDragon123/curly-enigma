// Title screen: the old forest at golden hour, where the journey begins (the same wood as the
// opening fall: bookends/forest.js and its dressing, built only as far as this camera can see),
// looking up the trail past the log bridge toward the sunny clearing. In the foreground stands a
// weathered trail signpost whose arrow boards are the menu (bookends/titleSigns.js; mouse, touch,
// keys and gamepads in bookends/titleSignNav.js): they catch the light and swing on their nails
// when touched, knock when chosen. Birds flit and sing, leaves drift down, shafts of sun move with
// the canopy, the wind is in the crowns; the camera drifts slowly. The pixel MOLEFORGE logo sits
// over it all. Continue / New Game lifts the camera's gaze up the trail and brings up the three save
// stones (bookends/titleStones.js); picking one walks the camera on up the trail into the light and
// into the journey (the fall starts in this same wood).
//
// Debug (scene.debug): openStones(), closeStones(), pick(i), fake(i, pct), smash(i), focus(i),
// press(i), boardCenter(i) → [x, y] page px, shot('menu'|'stones'), step(sec), perf(), ready(),
// menu (the nav). Calls made while the forest is still growing wait for it.
// Dev: ?lite=0|1 (forest detail), &wildlife=0, &cam=x,y,z,lookX,lookY,lookZ[,fov] (a fixed camera),
// &frame=sx,sy,size,vx,pitch,fov (try a menu framing for this screen shape).
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { el, clamp } from '../core/util.js';
import { makeSaveStones, GEMS } from '../bookends/titleStones.js';
import { useBookendStyles } from '../bookends/css.js';
import { logoLetters, glintURL } from '../bookends/logo.js';
import { disposeTextures, setPixelScale, fitFov } from '../bookends/fx.js';
import { buildForest, FOREST, SUN_DIR, groundH } from '../bookends/forest.js';
import { MF } from '../bookends/meadowfx.js';
import { FA, setAir } from '../bookends/forest/atmos.js';
import { forestSounds } from '../bookends/forest/sound.js';
import { dressForest } from '../bookends/forest/dress.js';
import { makeDrift } from '../bookends/forest/drift.js';
import { makeCritters } from '../bookends/forest/critters.js';
import { makeSignpost } from '../bookends/titleSigns.js';
import { makeSignNav } from '../bookends/titleSignNav.js';
import { openSettings } from '../ui/PauseMenu.js';
import { makeSignMenu } from '../ui/signs.js';

const REDUCED = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const CONTINUE_OK = new Set(['town', 'home', 'forge', 'cooking']); // the mine and the deep fall back to home
/** Golden hour: warm highlights, cool blue-green shade (as the journey). */
const GRADE = { lift: [0.0, 0.006, 0.022], gamma: [1.02, 1.0, 0.98], gain: [1.1, 1.01, 0.86] };
const DARK = 0x0a0806; // the loading card's colour (the journey's too)
const SIGN_S = 38.5; // where the signpost stands: metres along the trail (just short of the clearing), on its right-hand verge
const SIGN_OFF = 1.35;
const VISTA = new THREE.Vector3(-0.6, 1.4, -1.5); // the sunny clearing up the trail (the eye goes there)
const TURN = 0.14; // the post faces a little past the camera (so its depth shows; the boards turn back to face it)

/**
 * Menu framings per screen shape: where the board stack's middle sits on screen (NDC sx, sy), how
 * much of the screen it fills (size: of the height when wide, of the width when tall), where the
 * sunny clearing up the trail lands across the screen (vx: the camera turns until it does), the
 * camera's pitch (+ up) and its fov.
 */
const FRAMES = {
  wide: { sx: 0.36, sy: -0.18, size: 0.36, fit: 'h', vx: -0.3, pitch: 0.05, fov: 40 },
  short: { sx: 0.42, sy: -0.1, size: 0.48, fit: 'h', vx: -0.32, pitch: 0.04, fov: 42 },
  tall: { sx: 0.0, sy: -0.24, size: 0.84, fit: 'w', vx: 0.05, pitch: 0.06, fov: 52 },
};
const STONES = { lift: 0.36, push: -0.4, turn: 0.35 }; // the stones shot: on the trail (push: metres along it from the signpost), the clearing high in the frame (lift: its NDC y)

const TITLE_CSS = /* css */`
.tt-forest .tt-left { top: calc(var(--px) * 13); transform: none; }
.tt-left { transition: opacity .35s; }
.bk-title.stones .tt-left { opacity: 0; }
.bk-title.stones .bk-controls, .bk-title.stones .bk-sound { visibility: hidden; }
.tt-back { position: absolute; left: 0; top: 0; }
.tt-forest .bk-logo { filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(20, 12, 4, .45)) drop-shadow(0 0 calc(var(--px) * 6) rgba(255, 236, 190, .18)); }
.tt-forest .bk-sub { color: #fff4dc; }
@media (max-height: 520px) and (min-aspect-ratio: 5/4) {
  .tt-forest .tt-left { top: calc(var(--px) * 6); }
  .tt-left .bk-logo { --lp: calc(var(--px) * 1.5); }
  .tt-left .bk-sub { margin-top: calc(var(--px) * 2.5); }
}
@media (max-aspect-ratio: 5/4) {
  .tt-forest .tt-left { top: calc(var(--px) * 12 + env(safe-area-inset-top, 0px)); bottom: auto; }
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
    this.debug = this.makeDebug(); // (now: tests may reach for it while the forest still grows)
    this.own(useBookendStyles());
    this.own(() => disposeTextures(this.textures));
    this.own(() => { for (const h of Object.values(this.loops)) h?.stop?.(0.3); });
    const style = document.createElement('style');
    style.textContent = TITLE_CSS;
    document.head.append(style);
    this.own(() => style.remove());
    const g = this.game, eng = g.engine;
    setPixelScale(eng.height);
    forestSounds(g.audio);

    const sc = this.scene;
    this.haze = new THREE.Color(0xc8d4bc);
    sc.background = this.haze.clone();
    sc.fog = new THREE.Fog(this.haze.clone(), 30, 140);
    this.camera = new THREE.PerspectiveCamera(40, eng.aspect, 0.05, 220);
    setAir(0);
    MF.uWind.value.set(0.82, 0.57);

    // a quiet card while the wood grows (a second or two; longer on a phone)
    this.loadCard = el('div', { class: 'bk-root bk-loading' }, [el('div', { class: 'bk-load' }, [el('i', { class: 'bk-load-leaf' }), el('span', {}, 'The old wood stirs…')])]);
    g.ui.world.append(this.loadCard);
    this.own(() => this.loadCard?.remove());

    // ---- the signpost first: the camera is framed on it, and the forest is built for that camera
    const soft = params.lite !== '0' && params.lite !== '1' && !!eng.softwareGL;
    const lite = params.lite === '1' || soft || (params.lite !== '0' && eng.fx !== 'high');
    this.lite = soft ? 'soft' : lite;
    const anySave = g.state.listSlots().some((s) => s.used);
    this.items = [
      { label: anySave ? 'Continue' : 'New Game', primary: true, dir: 1, onClick: () => this.openStones() },
      { label: 'Settings', dir: -1, onClick: () => this.openSettings() },
      { label: 'Credits', dir: 1, onClick: () => this.openCredits() },
    ];
    this.sign = makeSignpost(this.items, { face: -TURN });
    this.own(() => this.sign.dispose());
    const signS = this.signS = +params.signs || SIGN_S, signOff = +params.signoff || SIGN_OFF; // (dev: try another spot)
    const P = FOREST.trail.at(signS);
    const [sx, sz] = FOREST.trail.beside(signS, signOff);
    this.signBase = new THREE.Vector3(sx, groundH(sx, sz) - 0.02, sz);
    this.sign.group.position.copy(this.signBase);
    sc.add(this.sign.group);
    // it faces the wide framing's camera (a little past it): settle the two together
    this.sign.group.rotation.y = P.yaw + Math.PI;
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

    // ---- the forest: only what these framings (any screen shape, the drift, the stones shot and
    // the walk up the trail) can see
    const t0 = performance.now();
    this.F = await buildForest({ lite, soft, view: this.viewWedge(), cancel: () => this.gone });
    if (this.gone || this.F.cancelled) { this.F.dispose?.(); return; }
    this.textures.push(...this.F.textures);
    this.own(() => this.F.dispose());
    sc.add(this.F.group, this.F.sky);
    if (this.F.sign) this.F.sign.visible = false; // (ours stands in its place)
    this.clearBeams();
    const perch = this.sign.group.localToWorld(this.sign.perch.clone());
    this.F.spots.sign = { x: perch.x, z: perch.z, top: perch.y };
    this.dress = dressForest(this.F, { lite, soft, view: this.viewWedge() });
    sc.add(this.dress.group);
    this.own(() => this.dress.dispose());
    this.drift = makeDrift({ lite, soft });
    sc.add(this.drift.group);
    this.own(() => this.drift.dispose());
    this.wildlife = params.wildlife !== '0';
    this.critters = this.wildlife ? makeCritters(this.F, { lite }) : { group: null, update() {}, dispose() {} };
    if (this.critters.group) { sc.add(this.critters.group); this.own(() => this.critters.dispose()); }

    // ---- light: the low sun through the trees, sky light, a cool fill; a soft warm bounce off the
    // trail onto the boards' faces (the sun is behind them)
    this.hemi = new THREE.HemisphereLight(0xa8c4e0, 0x3a4424, 1.05);
    this.sun = new THREE.DirectionalLight(0xffc27a, 3.0);
    this.sun.position.copy(SUN_DIR).multiplyScalar(30);
    this.fill = new THREE.DirectionalLight(0x9ab4e0, 0.35);
    this.fill.position.set(0.5, 0.6, 1).multiplyScalar(30);
    this.bounce = new THREE.DirectionalLight(0xffd8a0, 0.55);
    this.bounce.position.set(-0.2, 0.35, 1).multiplyScalar(30);
    this.bounce.target = this.sign.group;
    sc.add(this.hemi, this.sun, this.fill, this.bounce);

    Object.assign(this.post, {
      outlineFar: 26, vignette: 0.3, saturation: 1.1, contrast: 1.1, grade: GRADE, gradeMix: 1,
      bloom: 0.6, bloomThreshold: 0.8, rays: 1, raysDir: SUN_DIR, raysSky: 1, raysThreshold: 0.84, raysColor: 0xffd49a, raysRadius: 0.5, raysDecay: 0.966,
      fade: 0, fadeColor: DARK,
    });
    if (soft) this.post.outline = false; // (a software rasterizer can't afford the outline pass)

    this.buildDom();
    this.layoutCamera(eng.width, eng.height, true);
    this.updateWorld(0);
    await this.precompile();
    if (this.gone) return;
    this.buildMs = Math.round(performance.now() - t0);
    const st = this.F.stats;
    console.log(`[title] forest built in ${this.buildMs} ms (${this.lite === 'soft' ? 'soft' : lite ? 'lite' : 'full'}; ground ${st.terrainMs} ms, trees ${st.treeMs} ms, ${Math.round(st.trisTotal / 1000)}k tris built, dress ${this.dress.stats.ms} ms)`);
    this.ready = true;
    this.loadCard?.remove();
    this.loadCard = null;
    // the wood's sound: leaves and wind in the crowns, the evening chorus, the brook behind
    this.loop('forest_leaves', 0.34);
    this.loop('forest_air', 0.4);
    if (this.wildlife) this.loop('forest_chorus', 0.6);
    this.loop('forest_brook', 0.18);
    for (const fn of this.pending.splice(0)) fn();
  }

  /** A shaft of sun that falls between a framing's camera and the boards would wash the words out: dim it. */
  clearBeams() {
    const shapes = [['wide', 16 / 9], ['short', 2.2], ['tall', 390 / 844]].map(([k, a]) => this.frame(k, a));
    const seg = new THREE.Line3(), q = new THREE.Vector3(), p = new THREE.Vector3();
    for (const b of this.F.beams) {
      const B = b.userData.beam;
      let near = Infinity;
      for (const s of shapes) {
        seg.set(s.pos, s.M);
        for (let u = 0; u <= 1; u += 0.05) {
          p.lerpVectors(B.bottom, B.top, u);
          if (p.y > s.M.y + 1.5) break;
          seg.closestPointToPoint(p, true, q);
          near = Math.min(near, q.distanceTo(p) - B.w / 2);
        }
      }
      if (near < 0.7) B.base *= 0.12;
    }
  }

  loop(name, vol) {
    const h = this.loops[name];
    if (!h || h.alive === false) this.loops[name] = this.game.audio.loop(name, { vol, fadeIn: 1.2 });
    else h.set({ vol });
  }

  /** Run fn now, or once the forest has grown. */
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
   * the camera turns until the clearing up the trail lands at vx.
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
    const place = (H) => {
      const f = new THREE.Vector3(Math.sin(H) * Math.cos(fr.pitch), Math.sin(fr.pitch), -Math.cos(H) * Math.cos(fr.pitch));
      const right = new THREE.Vector3().crossVectors(f, Y).normalize();
      const up = new THREE.Vector3().crossVectors(right, f).normalize();
      const pos = M.clone().addScaledVector(f, -dist).addScaledVector(right, -fr.sx * dist * tanH).addScaledVector(up, -fr.sy * dist * tanV);
      const d = VISTA.clone().sub(pos);
      const z = d.dot(f);
      return { f, pos, vx: z > 0.1 ? d.dot(right) / (z * tanH) : 9 };
    };
    // turn until the clearing lands at vx (coarse sweep, then a fine one)
    let best = 0, bd = Infinity;
    for (let H = -1.4; H <= 1.4; H += 0.02) { const e = Math.abs(place(H).vx - fr.vx); if (e < bd) { bd = e; best = H; } }
    for (let H = best - 0.02; H <= best + 0.02; H += 0.001) { const e = Math.abs(place(H).vx - fr.vx); if (e < bd) { bd = e; best = H; } }
    const { f, pos } = place(best);
    pos.y = Math.max(pos.y, groundH(pos.x, pos.z) + 0.35);
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
    const s = this.frame(this.menuKind(), a);
    if (this.shotName === 'stones' || this.shotName === 'leave') {
      // out onto the trail itself, past the signpost (it slips away to the side), facing the sunny
      // clearing: it sits in the top of the screen over the stones' ledge; leaving walks on into it
      const P = FOREST.trail.at(this.signS + (this.shotName === 'leave' ? STONES.push + 3.2 : STONES.push));
      s.pos.set(P.x, groundH(P.x, P.z) + 1.25, P.z);
      if (a >= 1) s.fov += 4;
      const d = VISTA.clone().sub(s.pos).normalize();
      const right = new THREE.Vector3().crossVectors(d, THREE.Object3D.DEFAULT_UP).normalize();
      const tanV = Math.tan(THREE.MathUtils.degToRad(s.fov) / 2);
      d.applyAxisAngle(right, -Math.atan(STONES.lift * tanV));
      s.look.copy(s.pos).add(d);
    }
    return s;
  }

  /** The ground every framing can see: a wedge from behind the cameras up the trail into the fog. */
  viewWedge() {
    const shapes = [['wide', 16 / 9], ['short', 2.2], ['tall', 390 / 844], ['wide', 4 / 3]];
    const pts = [], dirs = [];
    let half = 0;
    for (const [k, a] of shapes) {
      const s = this.frame(k, a);
      pts.push(s.pos); dirs.push(new THREE.Vector3(s.f.x, 0, s.f.z).normalize());
      const vf = THREE.MathUtils.degToRad(s.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * a);
      half = Math.max(half, hf / 2);
    }
    const o = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const fd = dirs.reduce((a, d) => a.add(d), new THREE.Vector3()).normalize();
    o.addScaledVector(fd, -5); // (behind them all: the drift, the walk up the trail)
    const spread = Math.max(...dirs.map((d) => Math.acos(clamp(d.dot(fd), -1, 1))));
    const tanA = Math.tan(Math.min(1.35, half + spread + STONES.turn + 0.12));
    const FAR = 120;
    const keep = (x, z, pad = 0) => {
      const dx = x - o.x, dz = z - o.z;
      const along = dx * fd.x + dz * fd.z;
      if (along < -pad - 1) return false;
      if (along > FAR + pad) return false;
      const side = Math.abs(dx * fd.z - dz * fd.x);
      return side <= Math.max(0, along) * tanA + pad + 2.5;
    };
    // its box on the ground
    const sideV = new THREE.Vector3(fd.z, 0, -fd.x);
    const cs = [o.clone(), o.clone().addScaledVector(fd, FAR).addScaledVector(sideV, FAR * tanA + 3), o.clone().addScaledVector(fd, FAR).addScaledVector(sideV, -FAR * tanA - 3), o.clone().addScaledVector(sideV, 3), o.clone().addScaledVector(sideV, -3)];
    return { x0: Math.min(...cs.map((c) => c.x)), x1: Math.max(...cs.map((c) => c.x)), z0: Math.min(...cs.map((c) => c.z)), z1: Math.max(...cs.map((c) => c.z)), keep };
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
    this.root = el('div', { class: 'bk-root bk-title tt-forest' }, [this.left, controls, this.soundHint]);
    g.ui.world.append(this.root);
    this.own(() => this.root.remove());
    this.audioOn = false;

    // the signpost's boards are the menu
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.menu = makeSignNav({
      layer: this.root, canvas: g.engine.canvas, camera: this.camera, post: this.sign, items: this.items, audio: g.audio, label: 'Main menu',
      blocked: () => g.ui.isPanelOpen() || this.stones?.open || this.busy || g.transitioning,
      onBack: () => { if (g.ui.isPanelOpen()) g.ui.closePanel(); else if (this.stones?.open) this.closeStones(); },
    });
    this.own(() => this.menu.destroy());
    if (!touch) this.menu.focus(0, true);

    // the save stones
    this.stones = makeSaveStones(this.root, {
      audio: g.audio,
      slots: () => g.state.listSlots(),
      onPick: (i, info) => this.pickSlot(i, info),
      onDelete: (i) => g.ui.confirm(`<b>Smash save stone ${i + 1}?</b><br>The ${GEMS[i].name.toLowerCase()} and everything in it will be gone for good.`, 'Smash it', 'Keep it'),
      afterDelete: (i) => { g.state.deleteSlot(i); this.refreshMenu(); },
    });
    this.own(() => this.stones.destroy());
    this.onKey = (e) => {
      if (e.key === 'Escape' && this.stones.open && !g.ui.isPanelOpen()) { e.preventDefault(); this.closeStones(); }
    };
    window.addEventListener('keydown', this.onKey);
    this.own(() => window.removeEventListener('keydown', this.onKey));
  }

  /** The first board reads Continue while any stone holds a save. */
  refreshMenu() {
    const anySave = this.game.state.listSlots().some((s) => s.used);
    const want = anySave ? 'Continue' : 'New Game';
    if (this.items[0].label !== want) { this.sign.setLabel(0, want); this.menu.setLabel(0, want); }
  }

  openStones() {
    if (!this.ready) { this.whenReady(() => this.openStones()); return; }
    if (this.busy || this.stones.open) return;
    this.root.classList.add('stones');
    this.menu.enabled = false;
    this.sign.setFocus(-1);
    this.setShot('stones');
    this.stones.show();
    // a single sign to go back, hanging from a bough at the top left
    const holder = el('div', { class: 'tt-back' });
    holder.style.left = 'calc(var(--px) * 8 + env(safe-area-inset-left, 0px))';
    this.root.append(holder);
    this.backMenu = makeSignMenu(holder, [{ label: 'Back', onClick: () => this.closeStones() }], { audio: this.game.audio, layer: this.root, mount: 'ceiling', hanger: 'rope', top: 4, label: 'Back', autofocus: false, breeze: 0.2 });
    this.backHolder = holder;
  }

  closeStones() {
    if (this.busy || !this.stones.open) return;
    this.stones.hide();
    this.root.classList.remove('stones');
    this.setShot('menu');
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
      // every new game opens with the fall: on up the trail into the clearing...
      st.useSlot(i, { fresh: true });
      to = 'fall'; params = {};
    }
    this.leave(to, params);
  }

  /** Walk the camera on up the trail into the light, fading to the journey's dark, then go. */
  leave(to, params) {
    this.setShot('leave');
    this.stones.hide();
    this.root.classList.add('stones');
    this.backMenu?.raise(true); // (the Back sign is pulled up out of the way)
    this.loops.forest_brook?.set?.({ vol: 0 });
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
    // boards stay where they are on screen while the wood beyond them turns a little
    const M = this._m || (this._m = new THREE.Vector3());
    M.copy(this.stack.getCenter(M)).applyMatrix4(this.sign.group.matrixWorld);
    const calm = (this.shotName === 'menu' ? 1 : 0.5) * (REDUCED ? 0 : 1);
    const yaw = (Math.sin(t * 0.061) * 0.028 + Math.sin(t * 0.023 + 1.3) * 0.018) * calm;
    const breathe = 1 + Math.sin(t * 0.047) * 0.012 * calm;
    const off = this._off || (this._off = new THREE.Vector3());
    off.subVectors(pos, M).multiplyScalar(breathe).applyAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    c.position.copy(M).add(off);
    c.position.y += Math.sin(t * 0.11) * 0.012;
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
    // still growing: draw nothing but the dark (cheap), under the loading card
    if (!this.ready) { this.game.engine.render(this._blank || (this._blank = new THREE.Scene()), this.camera, { outline: false, bloom: 0, rays: 0, fade: 1, fadeColor: DARK }); return; }
    const a = performance.now();
    this.game.engine.render(this.scene, this.camera, this.post);
    this.perfAcc.ren += performance.now() - a;
    this.perfAcc.n++;
  }

  exit() {
    this.gone = true;
    MF.uWind.value.set(0.82, 0.57);
    setAir(0);
    super.exit();
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    super.update(dt);
    if (!this.ready) return;
    const a = performance.now();
    // glide toward the current framing
    const s = this.shot();
    const k = 1 - Math.exp(-dt * (this.shotName === 'leave' ? 1.6 : 2.2));
    this.cam.pos.lerp(s.pos, k);
    this.cam.look.lerp(s.look, k);
    this.cam.fov += (s.fov - this.cam.fov) * k;
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
    const cam = this.camera, sc = this.scene, F = this.F;
    sc.background.copy(FA.uFaCool.value);
    F.sky.position.copy(cam.position);
    F.sky.material.uniforms.uDark.value = 0;
    MF.uWind.value.set(0.82, 0.57).multiplyScalar(1 + Math.sin(this.time * 0.37) * 0.15 + Math.max(0, Math.sin(this.time * 0.13)) * 0.25);
    F.outlineFar = this.post.outline === false ? 0 : this.post.outlineFar || 0;
    F.update(dt, cam, sc.fog);
    this.dress.update(dt, cam);
    this.drift.update(dt, cam, this.game.engine.height);
    // the birds (their song placed where they are; the opening's finch crosses the trail now and then)
    this.critters.update(dt, { t: this.time % 30, hero: null, cam, glint: false, crack: false, sfx: (name, o) => this.game.audio.play('forest_' + name, o) });
    // a twig or the undergrowth stirring now and then, deep in the wood
    this.rustleT = (this.rustleT ?? 4) - dt;
    if (this.rustleT <= 0) { this.rustleT = 4 + Math.random() * 6; this.game.audio.play(Math.random() < 0.7 ? 'forest_rustle' : 'forest_twig', { pan: Math.random() * 1.6 - 0.8, vol: 0.5 + Math.random() * 0.3, far: true }); }
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
    const fog = sc.fog;
    for (const withFog of [true, false]) {
      sc.fog = withFog ? fog : null;
      for (const m of meshes) {
        const key = (withFog ? 'f' : 'n') + m.material.uuid + (m.isInstancedMesh ? 'i' : '');
        if (seen.has(key)) continue;
        seen.add(key);
        try { r.compile(m, cam, sc); } catch (e) { /* optional */ }
        await new Promise((res) => setTimeout(res, 0));
        if (this.gone) break;
      }
    }
    sc.fog = fog;
    for (const o of hidden) o.visible = false;
    sc.remove(extra);
  }

  // ------------------------------------------------------------------ test hooks
  makeDebug() {
    const self = this;
    const later = (fn) => (...a) => { if (self.ready) return fn(...a); self.whenReady(() => fn(...a)); return undefined; };
    return {
      ready: () => !!self.ready,
      get menu() { return self.menu; },
      get stones() { return self.stones; },
      get sign() { return self.sign; },
      openStones: later(() => self.openStones()),
      closeStones: later(() => self.closeStones()),
      pick: later((i) => { const info = self.game.state.listSlots()[i]; self.pickSlot(i, info); }),
      /** Pretend slot i is at pct% complete (null to stop pretending). */
      fake: later((i, pct) => self.stones.setFake(i, pct)),
      smash: later((i) => self.stones.smash(i)),
      focus: later((i) => self.menu.focus(i)),
      press: later((i) => self.menu.press(i)),
      /** Where board i's words are on the page (CSS px). */
      boardCenter: (i) => (self.ready ? self.menu.center(i) : null),
      shot: later((name) => { self.setShot(name); const s = self.shot(); self.cam.pos.copy(s.pos); self.cam.look.copy(s.look); self.cam.fov = s.fov; self.applyCamera(self.time); }),
      /** Advance the scene (and the stones, the back sign) by `sec` seconds in 1/30 s steps. */
      step(sec = 1) {
        if (!self.ready) return;
        const n = Math.round(sec * 30);
        for (let i = 0; i < n; i++) { self.update(1 / 30); self.backMenu?.step(1 / 30); if (self.stones.open) self.stones.step(1 / 30); }
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

