// Title screen: the old forest at golden hour, where the journey begins (the same wood as the
// opening fall: bookends/forest.js and its dressing, built only as far as these cameras can see),
// looking up the trail toward the sunny clearing. In the foreground stands a weathered trail
// signpost whose arrow boards are the menu (bookends/titleSigns.js; mouse, touch, keys and gamepads
// in bookends/titleSignNav.js): they catch the light and swing on their nails when touched, knock
// when chosen. Birds flit, sing and peck about the trail (forest/critters.js, forest/flocks.js),
// leaves drift down, the wind is in the crowns; the camera drifts slowly. No game name on screen
// (the player asked for none); the scene is the title.
// Wave 11 (player request): behind the boards, over and over, the young mole strolls up the trail
// (gfx/char/gait.js's walk), hears a faint peep from the grass, finds the raptor's egg in its nest
// at the clearing's edge (forest/egg.js), crouches and gently looks it over (it wobbles and
// chirps), stands, and strolls back down the trail past the camera; a pause, and again.
// Continue / New Game glides the camera down to a raptor's nest on a mossy rock by the trail
// (bookends/titleNest.js): three eggs, one per save slot, cracked as far as each save has got
// (hatched, a baby raptor in the shell, once a raptor's been tamed); choosing one cracks it open and
// the camera pushes into its light, into the journey.
//
// Debug (scene.debug): openStones(), closeStones(), pick(i), fake(i, pct), hatch(i, on), smash(i),
// hover(i), focus(i), press(i), boardCenter(i) → [x, y] page px, shot('menu'|'stones'), step(sec),
// perf(), ready(), menu (the nav), closeup(i), beat(t) (the mole's loop at t s; LOOP.peep, LOOP.egg),
// mole() (where he is in it). skipIntro() / intro() are kept (no opening shot any more: no-ops).
// Calls made while the forest is still growing wait for it.
// Dev: ?lite=0|1 (forest detail), &wildlife=0, &mole=0, &cam=x,y,z,lookX,lookY,lookZ[,fov] (a fixed
// camera), &frame=sx,sy,size,vx,pitch,fov (try a menu framing for this screen shape).
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { el, clamp, lerp } from '../core/util.js';
import { slotRaw } from '../core/saves.js';
import { useBookendStyles } from '../bookends/css.js';
import { disposeTextures, setPixelScale, fitFov } from '../bookends/fx.js';
import { buildForest, FOREST, SUN_DIR, groundH } from '../bookends/forest.js';
import { MF } from '../bookends/meadowfx.js';
import { FA, setAir } from '../bookends/forest/atmos.js';
import { forestSounds } from '../bookends/forest/sound.js';
import { dressForest } from '../bookends/forest/dress.js';
import { makeDrift } from '../bookends/forest/drift.js';
import { makeCritters } from '../bookends/forest/critters.js';
import { makeFlocks } from '../bookends/forest/flocks.js';
import { makeVoxelShadow } from '../bookends/forest/shadow.js';
import { makeHeroMole } from '../gfx/char/hero.js';
import { makeNest, EGGS } from '../bookends/titleNest.js';
import { titleSounds } from '../bookends/titleSounds.js';
import { makeSignpost } from '../bookends/titleSigns.js';
import { makeSignNav } from '../bookends/titleSignNav.js';
import { openSettings } from '../ui/PauseMenu.js';
import { makeSignMenu } from '../ui/signs.js';

const REDUCED = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const CONTINUE_OK = new Set(['town', 'home', 'forge', 'cooking']); // the mine and the deep fall back to home
/** Golden hour: warm highlights, cool blue-green shade (as the journey). */
const GRADE = { lift: [0.0, 0.006, 0.022], gamma: [1.02, 1.0, 0.98], gain: [1.1, 1.01, 0.86] };
const DARK = 0x0a0806; // the loading card's colour (the journey's too)
const SIGN_S = 36; // where the signpost stands: metres along the trail (just short of the clearing), on its right-hand verge
const SIGN_OFF = 1.35;
const SAVE_AT = { ds: -1.2, off: -1.75 }; // the save-slot nest: on the trail's other verge, a little nearer the camera
const VISTA = new THREE.Vector3(FOREST.nest.x, 0.9, FOREST.nest.z); // the raptor's nest at the clearing's edge (the eye goes there)
const TURN = 0.14; // the post faces a little past the camera (so its depth shows; the boards turn back to face it)
const WALK = 0.8; // m/s (his stroll, as the journey's)

/**
 * Menu framings per screen shape: where the board stack's middle sits on screen (NDC sx, sy), how
 * much of the screen it fills (size: of the height when wide, of the width when tall), where the
 * raptor's nest up the trail lands across the screen (vx: the camera turns until it does), the
 * camera's pitch (+ up) and its fov.
 */
const FRAMES = {
  wide: { sx: 0.36, sy: -0.18, size: 0.36, fit: 'h', vx: -0.3, pitch: 0.02, fov: 40 },
  short: { sx: 0.42, sy: -0.1, size: 0.48, fit: 'h', vx: -0.32, pitch: 0.02, fov: 42 },
  tall: { sx: 0.0, sy: -0.45, size: 0.8, fit: 'w', vx: -0.35, pitch: -0.14, fov: 52 }, // (looking down a little: the trail and the nest above the boards)
};

const TITLE_CSS = /* css */`
.bk-title.stones .bk-controls, .bk-title.stones .bk-sound { visibility: hidden; }
.tt-back { position: absolute; left: 0; top: 0; }
@media (max-aspect-ratio: 5/4) {
  .bk-title .bk-sound { top: auto; bottom: calc(var(--px) * 8 + env(safe-area-inset-bottom, 0px)); }
}
`;

const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const ease = (a, b, x) => smooth((x - a) / (b - a));

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
    titleSounds(g.audio);

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

    // ---- the save slots' nest (its shot is one of the cameras the forest is built for); its DOM joins the page later
    const menuCam = this.frame('wide', 16 / 9).pos;
    const [nx, nz] = FOREST.trail.beside(signS + SAVE_AT.ds, SAVE_AT.off);
    this.nestHolder = el('div', { class: 'tt-nest' });
    this.nest = makeNest(this.nestHolder, {
      audio: g.audio, camera: this.camera, canvas: eng.canvas,
      at: { x: nx, y: groundH(nx, nz) - 0.04, z: nz },
      yaw: Math.atan2(menuCam.x - nx, menuCam.z - nz) - 0.25,
      slots: () => g.state.listSlots(),
      tame: (i) => this.tamed(i),
      onPick: (i, info) => this.pickSlot(i, info),
      onDelete: (i) => g.ui.confirm(`<b>Break egg ${i + 1}?</b><br>The ${EGGS[i].name.toLowerCase()} egg and the save in it will be gone for good.`, 'Break it', 'Keep it'),
      afterDelete: (i) => { g.state.deleteSlot(i); this.refreshMenu(); },
    });
    this.own(() => this.nest.destroy());
    sc.add(this.nest.group);

    // ---- the forest: only what these framings (any screen shape, the drift, the nest shot) can see
    const t0 = performance.now();
    const view = this.viewWedge();
    // (the save nest and the camera's way down to it are kept clear of trees and undergrowth)
    const ns = this.nest.shot(16 / 9).pos, NP = this.nest.group.position;
    const clear = [[NP.x, NP.z, 1.3], [(NP.x + ns.x) / 2, (NP.z + ns.z) / 2, 1.0], [ns.x, ns.z, 0.8]];
    // ...and the raptor's egg up the trail is kept in sight of the menu's camera (no stone or toadstool in front of it)
    const EN = FOREST.nest;
    for (const k of [0.07, 0.13, 0.2]) clear.push([lerp(EN.x, menuCam.x, k), lerp(EN.z, menuCam.z, k), 0.4]);
    this.F = await buildForest({ lite, soft, view, clear, cancel: () => this.gone });
    if (this.gone || this.F.cancelled) { this.F.dispose?.(); return; }
    this.textures.push(...this.F.textures);
    this.own(() => this.F.dispose());
    sc.add(this.F.group, this.F.sky);
    if (this.F.sign) this.F.sign.visible = false; // (ours stands in its place)
    this.clearBeams();
    const perch = this.sign.group.localToWorld(this.sign.perch.clone());
    this.F.spots.sign = { x: perch.x, z: perch.z, top: perch.y };
    // (the camera's extra set dressing: not on a phone, where the title keeps to the old cave's draw count)
    this.dress = params.dress === '1' || (params.dress !== '0' && !lite) ? dressForest(this.F, { lite, soft, view }) : { group: new THREE.Group(), stats: {}, update() {}, dispose() {} };
    sc.add(this.dress.group);
    this.own(() => this.dress.dispose());
    this.drift = makeDrift({ lite, soft });
    sc.add(this.drift.group);
    this.own(() => this.drift.dispose());
    this.wildlife = params.wildlife !== '0';
    const none = { group: null, update() {}, dispose() {} };
    this.critters = this.wildlife ? makeCritters(this.F, { lite }) : none;
    if (this.critters.group) { sc.add(this.critters.group); this.own(() => this.critters.dispose()); }
    this.flocks = this.wildlife ? makeFlocks(this.F, { lite }) : none;
    if (this.flocks.group) { sc.add(this.flocks.group); this.own(() => this.flocks.dispose()); }

    // ---- the mole, strolling up the trail to the egg and back
    this.moleOn = params.mole !== '0' && !!this.F.nest;
    this.hero = makeHeroMole({ height: 0.86 });
    this.heroPivot = new THREE.Group();
    this.heroPivot.add(this.hero.root);
    this.hero.root.position.y = -0.42;
    this.heroPivot.visible = this.moleOn;
    sc.add(this.heroPivot);
    this.own(() => this.hero.dispose());
    this.heroShadow = makeVoxelShadow(0.32, 0.26, 0.5);
    this.heroShadow.visible = this.moleOn;
    sc.add(this.heroShadow);
    this.setupLoop();

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
    this.mt = 0;
    this.placeMole(0, 0);
    this.updateWorld(0);
    await this.precompile();
    if (this.gone) return;
    this.buildMs = Math.round(performance.now() - t0);
    const st = this.F.stats;
    console.log(`[title] forest built in ${this.buildMs} ms (${this.lite === 'soft' ? 'soft' : lite ? 'lite' : 'full'}; ground ${st.terrainMs} ms, trees ${st.treeMs} ms, ${Math.round((st.trisTotal || 0) / 1000)}k tris built, dress ${this.dress.stats?.ms} ms)`);
    this.ready = true;
    this.loadCard?.remove();
    this.loadCard = null;
    // the wood's sound: leaves and wind in the crowns, the evening chorus, the brook behind
    this.loop('forest_leaves', 0.34);
    this.loop('forest_air', 0.4);
    if (this.wildlife) this.loop('forest_chorus', 0.6);
    this.loop('forest_brook', 0.18);
    if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) this.menu.focus(0, true);
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

  // ------------------------------------------------------------------ the mole's stroll
  /**
   * The loop's script (seconds): in from behind the camera, up the trail; a peep; to the nest, down
   * on his heels; a long gentle look at the egg (it wobbles, chirps; a paw to it); up, and back down
   * the trail past the camera; a pause off screen.
   */
  setupLoop() {
    // where he starts and ends: on the trail a little behind the nearest framing's camera
    let s0 = this.signS;
    for (const [k, a] of [['wide', 16 / 9], ['short', 2.2], ['tall', 390 / 844]]) {
      const c = this.frame(k, a).pos;
      let best = 0, bd = Infinity;
      for (let s = 20; s < FOREST.nest.s; s += 0.1) { const p = FOREST.trail.at(s); const d = Math.hypot(p.x - c.x, p.z - c.z); if (d < bd) { bd = d; best = s; } }
      s0 = Math.min(s0, best - 1.6);
    }
    const sN = FOREST.nest.s - 0.1;
    const walk = (sN - s0) / WALK;
    const L = { s0, sN, walk };
    L.peep = walk - 1.6; // (a peep from the grass as he nears it)
    L.arrive = walk + 0.25; // (the last steps slow)
    L.kneel = L.arrive + 1.3;
    // where he kneels: round the far side of the nest, facing the camera over the egg
    const c = this.frame('wide', 16 / 9).pos, NS = FOREST.nest;
    const dx = NS.x - c.x, dz = NS.z - c.z, d = Math.hypot(dx, dz) || 1;
    L.kx = NS.x + (dx / d) * 0.46; L.kz = NS.z + (dz / d) * 0.46;
    L.egg = L.kneel + 1.4; // the wobble: he's down on his heels, eyes on it
    L.touch = L.egg + 1.2; // a paw to the shell
    L.up = L.egg + 5.2;
    L.back = L.up + 1.1;
    L.gone = L.back + walk + 0.6;
    L.dur = L.gone + 3.0;
    this.LOOP = L;
  }

  /** His trail position s at loop time t. */
  moleS(t) {
    const L = this.LOOP;
    if (t < L.walk - 1.2) return L.s0 + WALK * t;
    if (t < L.back) { const k = clamp((t - (L.walk - 1.2)) / 1.45, 0, 1); return L.sN - 0.96 * Math.pow(1 - k, 1.6); }
    return Math.max(L.s0 - 0.8, L.sN - WALK * (t - L.back));
  }

  /** Put him where he is at loop time t (dt drives his rig). */
  placeMole(t, dt) {
    if (!this.moleOn) return;
    const L = this.LOOP, hero = this.hero, NS = FOREST.nest;
    const s = this.moleS(t);
    const vH = dt > 0 ? Math.abs(s - (this.moleLastS ?? s)) / dt : 0;
    const jump = Math.abs(s - (this.moleLastS ?? s)) > 1;
    this.moleLastS = s;
    const P = FOREST.trail.at(s);
    // at the nest he steps round it to its far side (and back onto the trail as he goes)
    const ns = ease(L.arrive - 0.6, L.arrive + 0.5, t) * (1 - ease(L.up + 0.1, L.back + 0.5, t));
    const x = lerp(P.x, L.kx, ns), z = lerp(P.z, L.kz, ns);
    let y = groundH(x, z);
    if (this.feetY == null || jump || dt <= 0) this.feetY = y;
    else this.feetY += (y - this.feetY) * Math.min(1, dt * 16);
    y = Math.max(y - 0.012, this.feetY);
    this.heroPivot.position.set(x, y + 0.42, z);
    const atNest = t >= L.arrive - 0.6 && t < L.back;
    if (atNest) {
      hero.face(t < L.arrive + 0.3 ? Math.atan2(L.kx - P.x, L.kz - P.z) : Math.atan2(NS.x - x, NS.z - z));
      if (t < L.arrive + 0.5 || (t > L.up + 0.1 && t < L.back + 0.4)) {
        hero.play('walk', 0.6);
        if (t > L.up + 0.1) hero.face(FOREST.trail.at(s).yaw + Math.PI);
      } else if (t < L.up) hero.play('reach');
      else hero.play('idle');
      hero.setHammer?.(t > L.arrive && t < L.up + 0.3 ? 'back' : null);
    } else {
      const back = t >= L.back;
      const speed = jump ? WALK : vH;
      if (speed > 0.12) { hero.play('walk', clamp(speed / WALK, 0.55, 1.25)); hero.face(back ? P.yaw + Math.PI : P.yaw); } else if (hero.state === 'walk') hero.play('idle');
    }
    hero.update(dt);
    this.molePose(t);
    this.heroShadow.position.set(x, groundH(x, z) + 0.02, z);
    // out of every framing while he waits behind the camera
    const hide = t > L.gone;
    this.heroPivot.visible = !hide;
    this.heroShadow.visible = !hide;
  }

  /** The egg moment's body (after his rig's own update): down on his heels, paws to the straw, a gentle touch; the egg wobbles. */
  molePose(t) {
    const L = this.LOOP, h = this.hero, N = this.F.nest;
    const kneel = ease(L.arrive + 0.1, L.kneel, t) * (1 - ease(L.up, L.up + 0.6, t));
    const down = ease(L.touch - 0.4, L.touch + 0.3, t) * (1 - ease(L.up - 1.4, L.up - 0.6, t)); // paws down to the egg
    const stroke = t > L.touch + 0.3 && t < L.up - 1.4 ? Math.sin((t - L.touch - 0.3) * 3.2) : 0; // a slow, gentle pat
    if (kneel > 0) {
      const s = h.s, { hip, neck, armL, armR, legL, legR } = h;
      hip.position.y -= s * 2.3 * kneel - s * 0.7 * (h.state === 'reach' ? Math.min(1, (h.stateT || 0) / 0.5) : 0);
      hip.rotation.x = h.baseHunch + kneel * (0.3 + 0.22 * down);
      legL.rotation.x = lerp(legL.rotation.x, -1.35, kneel); legL.rotation.z = 0.12 * kneel;
      legR.rotation.x = lerp(legR.rotation.x, 0.5, kneel); legR.rotation.z = -0.1 * kneel;
      neck.rotation.x += kneel * (0.18 + 0.2 * down);
      armL.rotation.set(lerp(armL.rotation.x, -0.75, down) + stroke * 0.12 * down, 0, lerp(armL.rotation.z, 0.2, down));
      armR.rotation.set(lerp(armR.rotation.x, -0.75, down) - stroke * 0.12 * down, 0, lerp(armR.rotation.z, -0.2, down));
    }
    // the egg rocks in the straw: when he finds it, under his paw, and once more as he goes
    const wob = (a, k = 1) => (t > a && t < a + 0.75 ? Math.sin((t - a) * 26) * 0.16 * k * (1 - (t - a) / 0.75) : 0);
    if (N) N.egg.rotation.z = wob(L.peep) * 0.5 + wob(L.egg) + wob(L.egg + 0.55, 0.6) + wob(L.touch + 1.6, 0.5) + wob(L.up + 0.2, 0.4);
  }

  /** The loop's sounds and looks (fired once per pass). */
  moleBeats(t) {
    const L = this.LOOP, NS = FOREST.nest, hero = this.hero;
    if (t < (this.lastMt ?? 0)) this.fired = new Set(); // (a new pass)
    this.lastMt = t;
    const once = (k, at, fn) => { if (t >= at && !this.fired.has(k)) { this.fired.add(k); if (t - at < 0.5) fn(); } };
    const at = { at: { x: NS.x, y: groundH(NS.x, NS.z) + 0.1, z: NS.z } };
    once('peep', L.peep, () => { this.sfx('forest_eggchirp', { ...at, vol: 0.7 }); hero.look(0.3, -0.1); });
    once('see', L.arrive - 0.3, () => hero.look(0, -0.3));
    once('egg', L.egg, () => { this.sfx('forest_eggchirp', { ...at, vol: 0.9, n: 2 }); this.sfx('forest_eggtick', { ...at, vol: 0.8 }); hero.doEmote?.('surprise', 0.9); hero.look(0, 0.05); });
    once('egg2', L.egg + 0.55, () => this.sfx('forest_eggtick', { ...at, vol: 0.5 }));
    once('touch', L.touch + 1.6, () => { this.sfx('forest_eggchirp', { ...at, vol: 0.6 }); hero.doEmote?.('happy', 0.9); });
    once('stand', L.up, () => { this.sfx('forest_rustle', { ...at, vol: 0.45 }); hero.look(0, 0); });
    once('bye', L.up + 0.2, () => this.sfx('forest_eggchirp', { ...at, vol: 0.45 }));
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
    a.play(name, { ...o, at: undefined, pan: clamp(v.x * 0.85, -0.85, 0.85), vol: (o.vol ?? 1) * clamp(1.5 - d / 16, 0.12, 1), far: d > 10 });
  }

  /** Has save slot i tamed a raptor? (data.tame.raptors) */
  tamed(i) {
    const st = this.game.state;
    try {
      const d = i === st.slot ? st.data : JSON.parse(slotRaw(i) || 'null');
      return !!(d && d.tame?.raptors?.length > 0);
    } catch (e) { return false; }
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
   * the camera turns until the raptor's nest up the trail lands at vx.
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
    // turn until the nest lands at vx (coarse sweep, then a fine one)
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
    if (this.shotName === 'stones') return this.nest.shot(a);
    if (this.shotName === 'leave') return this.nest.shot(a, this.leaveI ?? 0);
    return this.frame(this.menuKind(), a);
  }

  /** The ground every framing can see: a wedge from behind the cameras up the trail into the fog (and round the save nest). */
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
    o.addScaledVector(fd, -3); // (behind them all: the drift)
    const spread = Math.max(...dirs.map((d) => Math.acos(clamp(d.dot(fd), -1, 1))));
    const tanA = Math.tan(Math.min(1.35, half + spread + 0.12));
    const FAR = 120;
    // the save nest's shot looks down at it from close by: a disc round it
    const NP = this.nest.group.position, NR = 3.2;
    const keep = (x, z, pad = 0) => {
      if (Math.hypot(x - NP.x, z - NP.z) < NR + pad) return true;
      const dx = x - o.x, dz = z - o.z;
      const along = dx * fd.x + dz * fd.z;
      if (along < -pad - 1) return false;
      if (along > FAR + pad) return false;
      const side = Math.abs(dx * fd.z - dz * fd.x);
      return side <= Math.max(0, along) * tanA + pad + 2.5;
    };
    const sideV = new THREE.Vector3(fd.z, 0, -fd.x);
    const cs = [o.clone(), o.clone().addScaledVector(fd, FAR).addScaledVector(sideV, FAR * tanA + 3), o.clone().addScaledVector(fd, FAR).addScaledVector(sideV, -FAR * tanA - 3), o.clone().addScaledVector(sideV, 3), o.clone().addScaledVector(sideV, -3),
      new THREE.Vector3(NP.x - NR, 0, NP.z - NR), new THREE.Vector3(NP.x + NR, 0, NP.z + NR)];
    return { x0: Math.min(...cs.map((c) => c.x)), x1: Math.max(...cs.map((c) => c.x)), z0: Math.min(...cs.map((c) => c.z)), z1: Math.max(...cs.map((c) => c.z)), keep };
  }

  // ------------------------------------------------------------------ DOM
  buildDom() {
    const g = this.game;
    const keys = [['WASD', 'move'], ['C', 'crouch/dive'], ['Mouse', 'dig/aim'], ['E', 'interact'], ['B', 'the book'], ['I', 'backpack'], ['Esc', 'menu']];
    // (wave 12: less text) the key legend rests out of sight; it shows only when it's wanted: a
    // game key pressed on the title ("how do I move?") or a long idle look at the forest
    const controls = el('div', { class: 'bk-controls bk-outline rest' });
    keys.forEach(([k, label], i) => {
      if (i) controls.append(el('span', { class: 'dot' }, '·'));
      controls.append(el('kbd', {}, k), label);
    });
    let legendT = 0;
    const legend = (ms) => {
      controls.classList.remove('rest');
      controls.classList.add('woke');
      clearTimeout(legendT);
      legendT = setTimeout(() => { controls.classList.add('rest'); controls.classList.remove('woke'); }, ms);
    };
    const gameKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyE', 'KeyB', 'KeyI', 'F1']);
    const onLegendKey = (e) => { if (gameKeys.has(e.code) || e.key === '?') legend(5000); };
    window.addEventListener('keydown', onLegendKey);
    const idleT = setTimeout(() => legend(6000), 20000);
    this.own(() => { window.removeEventListener('keydown', onLegendKey); clearTimeout(legendT); clearTimeout(idleT); });
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.soundHint = el('div', { class: 'bk-sound bk-outline', role: 'status' }, [el('span', { class: 'bk-sound-in' }, [el('span', { class: 'note' }, '♪'), (touch ? 'tap' : 'click') + ' for sound'])]);
    this.root = el('div', { class: 'bk-root bk-title tt-forest' }, [controls, this.soundHint, this.nestHolder]);
    g.ui.world.append(this.root);
    this.own(() => this.root.remove());
    this.audioOn = false;

    // the signpost's boards are the menu
    this.menu = makeSignNav({
      layer: this.root, canvas: g.engine.canvas, camera: this.camera, post: this.sign, items: this.items, audio: g.audio, label: 'Main menu',
      blocked: () => g.ui.isPanelOpen() || this.nest?.open || this.busy || g.transitioning,
      onBack: () => { if (g.ui.isPanelOpen()) g.ui.closePanel(); else if (this.nest?.open) this.closeStones(); },
    });
    this.own(() => this.menu.destroy());

    this.onKey = (e) => {
      if (e.key === 'Escape' && this.nest.open && !g.ui.isPanelOpen()) { e.preventDefault(); this.closeStones(); }
    };
    window.addEventListener('keydown', this.onKey);
    this.own(() => window.removeEventListener('keydown', this.onKey));
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
    this.game.audio.play('forest_rustle', { vol: 0.5 });
    // a single sign to go back, hanging from a bough at the top left
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
    if (this.shotName !== 'menu') M.copy(look);
    const calm = (this.shotName === 'menu' ? 1 : 0.35) * (REDUCED ? 0 : 1);
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
    // glide toward the current framing (down to the nest a little slower, an easy swoop)
    const s = this.shot();
    const k = 1 - Math.exp(-dt * (this.shotName === 'leave' ? 1.9 : this.shotName === 'stones' ? 1.7 : 2.2));
    this.cam.pos.lerp(s.pos, k);
    this.cam.look.lerp(s.look, k);
    this.cam.fov += (s.fov - this.cam.fov) * k;
    this.applyCamera(this.time);
    this.sign.update(dt, this.camera, this.game.engine.height);
    this.menu.update(dt);
    // the mole's stroll (round and round)
    if (this.moleOn) {
      this.mt = (this.mt + dt) % this.LOOP.dur;
      this.moleBeats(this.mt);
      this.placeMole(this.mt, dt);
    }
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
    const cam = this.camera, sc = this.scene, F = this.F, h = this.game.engine.height;
    sc.background.copy(FA.uFaCool.value);
    F.sky.position.copy(cam.position);
    F.sky.material.uniforms.uDark.value = 0;
    MF.uWind.value.set(0.82, 0.57).multiplyScalar(1 + Math.sin(this.time * 0.37) * 0.15 + Math.max(0, Math.sin(this.time * 0.13)) * 0.25);
    F.outlineFar = this.post.outline === false ? 0 : this.post.outlineFar || 0;
    F.update(dt, cam, sc.fog);
    this.dress.update(dt, cam);
    this.drift.update(dt, cam, h);
    // the birds (their song placed where they are; they hop clear of the mole)
    const life = this._life || (this._life = { sfx: (name, o) => this.game.audio.play('forest_' + name, o) });
    Object.assign(life, { t: this.time % 30, hero: this.moleOn && this.heroPivot.visible ? this.heroPivot.position : null, cam, glint: false, crack: false, quiet: false });
    this.critters.update(dt, life);
    this.flocks.update(dt, life);
    this.nest.update(dt, h);
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
    const later = (fn) => (...a) => { if (self.ready) return fn(...a); self.whenReady(() => fn(...a)); return undefined; };
    return {
      ready: () => !!self.ready,
      /** (no opening shot any more: kept for old tests) */
      skipIntro: later(() => {}),
      intro: () => null,
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
      /** The mole's loop: its script times (LOOP) and where he is in it. */
      mole: () => (self.ready ? { t: +self.mt.toFixed(2), loop: self.LOOP, s: self.moleLastS, pos: self.heroPivot.position.toArray(), state: self.hero.state } : null),
      /** (screenshots) Jump the mole's loop to t seconds (a name from LOOP works too: 'egg', 'touch'...). */
      beat: later((t = 0) => {
        if (!self.moleOn) return;
        const T = typeof t === 'string' ? self.LOOP[t] : t;
        self.fired = new Set(Object.keys(self.LOOP)); self.lastMt = T; // (no sounds for the skipped part)
        const from = Math.max(0, T - 2);
        self.mt = from; self.moleLastS = self.moleS(from); self.feetY = null;
        for (let x = from; x < T; x += 1 / 30) { self.mt = x; self.placeMole(x, 1 / 30); }
        self.mt = T;
        self.placeMole(T, 1 / 30);
      }),
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
      /** Meshes in the view now, by part (draw calls of the colour pass, roughly). */
      parts() {
        const cam = self.camera, fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        const out = {}, sph = new THREE.Sphere();
        self.scene.traverseVisible((o) => {
          if (!(o.isMesh || o.isPoints) || !o.geometry) return;
          if (o.frustumCulled !== false) { const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); sph.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); if (!fr.intersectsSphere(sph)) return; }
          let p = o; while (p && !p.name) p = p.parent;
          const k = p?.name || 'mesh';
          out[k] = (out[k] || 0) + 1;
        });
        return out;
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
