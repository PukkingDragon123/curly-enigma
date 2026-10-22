// Home, in first person: Old Star's cave workshop and, up three worn steps through the arch of the
// old ones, the side chamber that's yours. The cave (src/home/cave.js, its rock caveRock.js) has
// his forge, bellows, anvil and quench trough, the cooking hearth and his mossy armchair, his notes
// board and his chest, the ruins of something older, the old mining gear round the cage lift down
// to the mine, the caved-in passage to Deep Town, drips, glow-worms, roots and moss. Old Star
// lives here (src/home/oldstar.js): he works at his forge, sits by the fire, sleeps on his cot at
// night and talks you through his lessons (lessons.js) after waking you with a bucket of quench
// water (wake.js). Your room is the save's tile grid (it grows with room upgrades): sleep in the
// bed, collect Nugget's eggs, sow the planters, sit down, light the lamps; X (or E at the build
// bench) is build mode. There is no digging out of the home: the lift is the way down.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { FPSRig } from '../fps/FPSKit.js';
import { liftState } from '../fps/lifts.js';
import { Particles } from '../deep/Particles.js';
import { LightPool } from '../iso/LightPool.js';
import { buildFurniture } from '../iso/furniture.js';
import { footprint, roomSize, TUNNEL_SLOTS, WINDOW_SLOTS, occupancy, benchTiles } from '../iso/homeLayout.js';
import { toolsLeaning, broom, firewood, letterCrate, ragRug } from '../iso/homeDecor.js';
import { glowShrooms } from '../iso/props.js';
import { FURNITURE } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el, rand, pick, clamp } from '../core/util.js';
import { T, CEIL, HALL, ARCH, SHAFT, FRONT, HOLE, STAIRS, floorAt } from '../home/units.js';
import { HomeShell } from '../home/shell.js';
import { CaveHall, SPOTS } from '../home/cave.js';
import { CaveWorld, MOUND } from '../home/caveRock.js';
import { liftBoxes, LIFT } from '../home/lift.js';
import { FPGlow } from '../home/glow.js';
import { HomeNugget } from '../home/nugget.js';
import { FPBuild } from '../home/build.js';
import { relocateBlocked, besideItem } from '../home/layoutfix.js';
import { HomeMoves } from '../home/moves.js';
import { HomeLiving } from '../home/living.js';
import { WorkshopLife } from '../home/workshop.js';
import { HomeLessons } from '../home/lessons.js';
import { HomeWake } from '../home/wake.js';
import { OldStar } from '../home/oldstar.js';
import { LootChest } from '../home/chest.js';
import { starData } from '../home/starData.js';
import { lootChest } from '../home/tavernProps.js';
import { group } from '../iso/kit.js';
import { loadNotes } from '../home/notes.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

/** Ray (origin o, direction d) against a box: entry distance or null. */
function rayBox3(o, d, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = Infinity;
  for (const [oo, dd, a, b] of [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
    let ta = (a - oo) / dd, tb = (b - oo) / dd;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return t0;
}
/** Iso light intensities were tuned for 1 m tiles; a tile is 0.5 m now (inverse-square falloff). */
const ISO_LIGHT = 0.3;
/** Kinds of the room's furniture that live in the cave now (Old Star's forge and hearth). */
const IN_THE_CAVE = new Set(['forge', 'stove']);

export default class HomeScene extends Scene {
  async enter(params = {}) {
    this.hud = 'deep';
    this.music = 'home';
    const g = this.game, st = g.state, d = st.data;
    const t0 = performance.now();
    const marks = {};
    let tm = t0;
    const mark = (k) => { const n = performance.now(); marks[k] = Math.round(n - tm); tm = n; };
    const from = params.from || 'continue';
    this.arrivalLesson = params.lesson || null; // cooking { tutorial } comes back with lesson: 'cook_done' | 'cook'
    this.from = from;
    st.flag('lastScene', 'home');
    st.flag('homeVisited', true);
    if (from === 'fall') { st.flag('fallen', true); st.flag('nugget', true); }
    if (!d.home.planters) d.home.planters = {};
    if (!d.home.floor) d.home.floor = {};
    starData(st);
    // Old Star's forge and hearth are in the cave now: the room's own come out of the save
    if (d.home.placed.some((p) => IN_THE_CAVE.has(FURNITURE[p.id]?.kind))) d.home.placed = d.home.placed.filter((p) => !IN_THE_CAVE.has(FURNITURE[p.id]?.kind));
    // the lift always knows the mine entrance right below (lifts.js seeds 'L0')
    liftState(st);
    const [W, D] = roomSize(d.home.level);
    this.W = W;
    this.D = D;
    this.tickers = [];
    this.loops = [];
    this.anchors = new Map();
    this.hideFrom = new Map(); // bubble key → () => true while it's out of sight
    this.scripted = false;
    this.post = { vignette: 0.42, outlineAlpha: 0.72, innerThresh: 0.22, saturation: 1.06, contrast: 1.06, brightness: 1.04 };
    this.scene.background = new THREE.Color(0x070405);
    // no digging out of the home: no tunnel mouths in your walls any more
    this.tunnels = [];
    for (const w of ['n', 's', 'e', 'w']) TUNNEL_SLOTS[w] = new Set();
    this.doorOpen = !!st.flag('escaped');
    if (relocateBlocked(st, W, D)) st.save();
    this.notes = loadNotes();
    mark('prep');

    // ---- your room (tile units, scaled to meters) and Old Star's cave
    this.room = new THREE.Group();
    this.room.scale.setScalar(T);
    this.scene.add(this.room);
    this.shell = new HomeShell(this.room, this.scene);
    this.shell.build(W, D, d.home.wall, d.home.floor, { tunnels: [] });
    this.own(() => this.shell.dispose());
    this.cave = new CaveHall(this.room, this.scene);
    this.cave.build({ doorOpen: this.doorOpen, notes: this.notes.length });
    this.own(() => this.cave.dispose());
    this.lift = this.cave.lift;
    this.holeTop = this.cave.rock.roofAt(HOLE.x, HOLE.z, HALL.y + 2.4);
    mark('build');

    // ---- light: dim warm ambience, a pool of point lights shared by every lamp, glows and contact shadows
    this.scene.add(new THREE.HemisphereLight(0xf0d0b0, 0x2a1810, 0.58));
    const fill = new THREE.DirectionalLight(0xffd0a0, 0.1);
    fill.position.set(2, 6, 2);
    this.scene.add(fill);
    this.lights = new LightPool(this.scene, 10, { range: 40 });
    this.glow = new FPGlow(this.scene, 420);
    this.shadows = new FPGlow(this.scene, 96, { shadow: true });
    this.fxU = { fogCol: { value: new THREE.Color(0x070405) }, fogDist: { value: 80 } };
    this.world = new CaveWorld(this.cave.rock);
    this.fx = new Particles(this.scene, this.world, this.fxU);
    this.own(() => this.fx.dispose());
    this.addShellLights();
    this.addCaveLights();

    // ---- first person
    this.rig = await new FPSRig(this, { world: this.world, fov: 74, reach: 2.1, stepMat: 'dirt', lamp: 0.5 }).init();
    this.camera = this.rig.camera;
    this.rig.lampCol.setRGB(1.2, 0.98, 0.78);
    this.rig.ambient.setRGB(0.4, 0.32, 0.28);
    this.own(() => this.rig.dispose());
    this.fx.setPixelScale(g.engine.height, this.rig.fov);
    mark('lights+rig');

    // ---- Old Star
    this.star = new OldStar(this);
    try { await this.star.load(); } catch (e) { console.warn('[home] Old Star failed to load', e); this.star = null; }
    this.own(() => this.star?.dispose());
    mark('star');

    // ---- furniture, loose things, collision, interactables
    this.items = new Map();
    this.loose = [];
    this.buildLoose();
    for (const p of d.home.placed) this.addPlaced(p);
    this.addFixedInteractions();
    this.chest = new LootChest(this, this.cave.dyn.chest);
    this.own(() => this.chest.dispose());
    this.shaftBox = [SHAFT.x0 - 0.14, HALL.y, SHAFT.z0, SHAFT.x1, HALL.y + 1.4, SHAFT.z1];
    this.addCaveInteractions();
    this.addIt({ box: [SHAFT.x0 - 0.24, HALL.y + 0.5, SHAFT.z0 - 0.22, SHAFT.x0, HALL.y + 1.05, SHAFT.z0], label: () => (this.lessonStage() === 'mine' ? 'Ride down to the dig' : 'Ride the lift'), action: () => this.useLift() });
    mark('furniture');
    this.rebuildCollision();
    mark('collision');
    this.buildStarGrid();
    mark('starGrid');
    this.refreshPins();
    this.placeGlints();
    if (this.star?.rig) {
      const stage = this.lessonStage();
      if (stage === 'mine' || stage === 'forge' || stage === 'cook') this.placeStarForLesson(true);
      else this.star.placeAt(this.clockHours() >= 21.5 ? 'cot' : pick(['anvil', 'anvil', 'fire', 'armchair', 'bellows', 'board']));
      this.moveStarBox();
    }

    mark('starPlace');
    // ---- the mole and Nugget
    this.spawnByFrom(from, params);
    mark('spawn');
    if (st.flag('nugget')) {
      const coop = this.findKind('coop');
      const cands = coop ? [[0.5, 1.35], [1.4, 0.5], [-0.4, 0.5], [0.5, -0.4]].map(([dx, dz]) => [coop.p.x + dx, coop.p.y + dz]) : [];
      cands.push([W / 2, D / 2]);
      const ok = cands.find(([x, z]) => x > 0.3 && z > 0.3 && x < W - 0.3 && z < D - 0.3 && !this.tileBlocked(Math.floor(x), Math.floor(z)));
      const [nx, nz] = ok || cands[cands.length - 1];
      this.nug = new HomeNugget(this, W, D, nx, nz);
      this.fillNuggetMap();
      const nA = this.nug.actor;
      this.addIt({
        r: 0.22, label: () => `Pet ${nA.name}`, sphereFn: (v) => v.set(nA.pos.x * T, (nA.pos.y + nA.body.position.y) * T + 0.15, nA.pos.z * T),
        action: () => this.petNugget(),
      });
    }
    this.napT = rand(25, 45);
    this.musicBox = { on: false, t: 0, i: 0 };
    mark('nugget');

    // ---- build mode, sounds
    this.build = new FPBuild(this);
    this.own(() => this.build.dispose());
    mark('buildmode');
    const F = this.cave.dyn.forge.fire, H = this.cave.dyn.hearth.fire, P = SPOTS.pool;
    this.ambientLoop('forge_fire', () => this.nearPointVol(F, 4.5, 0.38 + (this.forgeAir || 0) * 0.3));
    this.ambientLoop('fire', () => this.nearPointVol(H, 4.2, 0.42) + this.nearKindVol('fireplace', 3, 0.4));
    this.ambientLoop('water', () => this.nearPointVol(P, 2.4, 0.12) + this.nearKindVol('fountain', 2.5, 0.22) + this.nearKindVol('fish_tank', 1.5, 0.08));
    this.ambientLoop('wind', () => (this.rig.player.pos.z < HALL.z1 ? 0.035 : 0.015));
    this.own(() => { for (const l of this.loops) if (l.h) l.h.stop(0.1); });
    this.own(() => { for (const k of this.anchors.keys()) g.ui.hideBubble(k); g.ui.setHints(null); g.ui.tutor?.hide(); });
    g.ui.setRadar?.(null);
    g.ui.setDepth?.(null);
    g.ui.setBag?.(null);
    g.ui.setActionIcon?.(false);
    // the first-person HUD keeps the mine's depth plumb-bob up; there is no depth at home
    const dep = g.ui.status?.depth;
    if (dep) { dep.style.visibility = 'hidden'; this.own(() => { dep.style.visibility = ''; }); }
    this.hammerBtn();
    mark('rest');

    // ---- arrival
    st.emit('act', { type: 'reach', place: 'home' });
    const back = from === 'stove' ? 'cooking' : from;
    if (from === 'fall' || (from === 'newgame')) this.wakeFromFall();
    else if (from === 'lift') this.arriveByLift();
    else if (from === 'faint' || from === 'bed' || from === 'sleep') this.wakeUp(this.findKind('bed'), false);
    else if (from === 'forge' || back === 'cooking') this.later(0.6, () => (this.lessonStage() === 'done' ? this.greet() : this.onLessonArrival(back)));
    else if (from === 'town') { g.audio.play('door'); this.later(1.2, () => this.greet()); }
    else this.later(1.5, () => this.greet());
    this.debug = this.makeDebug();
    this.buildMs = performance.now() - t0;
    const steps = (o) => Object.entries(o).map(([k, v]) => k + ' ' + v).join(', ');
    this.buildMarks = marks;
    console.info(`[home] built in ${this.buildMs.toFixed(0)} ms [${steps(marks)}] (room ${this.shell.ms.toFixed(0)}: ${steps(this.shell.steps)}; cave ${this.cave.ms.toFixed(0)}: ${steps(this.cave.steps)})`);
    const r = g.engine?.renderer;
    if (r && r.compileAsync) { try { await r.compileAsync(this.scene, this.camera); } catch (e) { console.warn(e); } }
  }

  /** A hello from Old Star when you come home after the lessons (not every time). */
  greet() {
    const st = this.game.state, star = this.star;
    if (!star?.rig || this.scripted || star.scripted || star.mode === 'sleep') return;
    const stage = this.lessonStage();
    if (stage !== 'done') {
      const lines = { mine: 'The lift\'s waiting. Down to my dig, and bring me that copper.', forge: 'The forge is hot and the copper\'s cold. Come on, E on the anvil.', cook: 'My stomach\'s rumbling. To the hearth!' };
      if (lines[stage]) star.say(lines[stage], { mood: 'calm' });
      return;
    }
    const sd = starData(st);
    if (sd.greetDay === st.data.day && Math.random() < 0.7) return;
    sd.greetDay = st.data.day;
    const g = st.gold;
    star.say(pick([
      'There you are. Kettle\'s on. Well, it\'s near the fire, which is nearly the same.',
      `Home again! ${g >= 1000 ? `<span class="gold-txt">${g.toLocaleString()}</span> in the pouch. That's a start.` : 'Empty pockets? The mine\'s still there.'}`,
      'Mind the drip by the basin. Sixty years and I still step in it.',
    ]), { mood: 'happy' });
  }

  // ------------------------------------------------------------ lights
  /**
   * A light source (meters): { x, y, z, color, intensity, distance, flicker, speed, real, priority,
   * halo (size m), haloOpacity, pool (radius m), poolX, poolZ, poolY, poolOpacity, poolColor }.
   */
  addLight(o) {
    const src = this.lights.add({ real: true, ...o });
    src.extras = [];
    if (o.halo) src.extras.push(this.glow.add({ kind: 'halo', x: o.hx ?? o.x, y: o.hy ?? o.y, z: o.hz ?? o.z, w: o.halo, color: o.haloColor ?? o.color, opacity: o.haloOpacity ?? 0.5, src }));
    if (o.pool) src.extras.push(this.glow.add({ kind: 'pool', x: o.poolX ?? o.x, y: o.poolY ?? 0.006, z: o.poolZ ?? o.z, w: o.pool * 2, color: o.poolColor ?? o.color, opacity: o.poolOpacity ?? 0.25, src }));
    return src;
  }

  removeLight(src) {
    if (!src) return;
    this.lights.remove(src);
    for (const e of src.extras || []) this.glow.remove(e);
    src.extras = [];
  }

  addShellLights() {
    const sh = this.shell;
    for (const l of sh.lightsM()) {
      if (l.kind === 'sconce') this.addLight({ ...l, intensity: 1.05, distance: 3.2, flicker: 0.1, halo: 0.2, haloOpacity: 0.55, priority: 2 });
      else if (l.kind === 'hanging') this.addLight({ ...l, intensity: 1.0, distance: 3.4, flicker: 0.12, halo: 0.2, haloOpacity: 0.6, pool: 0.55, poolX: l.x, poolZ: l.z, poolOpacity: 0.14, priority: 2 });
      else if (l.kind === 'lamp') this.addLight({ ...l, intensity: 1.8, distance: 4.6, flicker: 0.08, halo: 0.26, haloOpacity: 0.6, pool: 0.95, poolX: l.x, poolZ: l.z, poolOpacity: 0.2, priority: 5 });
      else if (l.kind === 'window') this.addLight({ ...l, x: l.x + 0.05, intensity: 1.1, distance: 3.0, flicker: 0.06, speed: 0.4, halo: 0.42, haloOpacity: 0.3, hx: 0.02, pool: 0.55, poolX: 0.45, poolZ: l.z, poolOpacity: 0.16, priority: 3 });
      else if (l.kind === 'arch') this.addLight({ ...l, intensity: 0.6, distance: 2.6, flicker: 0.2, speed: 1.2, priority: 1 });
      else this.addLight({ ...l, intensity: 0.75, distance: 2.4, flicker: 0.18, halo: 0.16, haloOpacity: 0.55, pool: 0.4, poolOpacity: 0.14, priority: 1 });
    }
    for (const f of sh.fungi) this.addLight({ x: f.x * T, y: f.y * T, z: f.z * T, color: f.color, intensity: 0, real: false, halo: 0.22, haloOpacity: 0.28, pool: 0.32, poolOpacity: 0.12, flicker: 0.08, speed: 0.3 });
    for (const s of sh.strings || []) for (let i = 1; i < s.length - 1; i++) this.glow.add({ kind: 'halo', x: s[i].x * T, y: (s[i].y - 0.1) * T, z: s[i].z * T, w: 0.11, color: [0xffd060, 0xff8a6a, 0x9ae07a, 0x8ac8ff, 0xffa0d0, 0xfff0b0][i % 6], opacity: 0.32 });
  }

  /** The cave's fires, lanterns and glows (the rock reads them too: lightSrcs), the glow-worms. */
  addCaveLights() {
    this.lightSrcs = [];
    for (const l of this.cave.lights) {
      const o = { ...l, intensity: (l.intensity ?? 0) * 1.35 };
      if (o.pool) { o.poolX = l.poolX ?? l.x; o.poolZ = l.poolZ ?? l.z; o.poolY = l.poolY ?? this.cave.ground(o.poolX, o.poolZ) + 0.006; }
      const src = this.addLight(o);
      this.lightSrcs.push(src);
      if (l.kind === 'forge') this.forgeLight = src;
      if (l === this.cave.liftLantern) this.liftLight = src;
    }
    this.moteLights = this.lightSrcs.filter((l) => ['fire', 'forge', 'center', 'lantern', 'entry', 'notes'].includes(l.kind));
    // the anvil's flash when Old Star strikes
    const af = this.cave.dyn.anvilFace;
    this.anvilFlash = this.addLight({ x: af.x, y: af.y + 0.1, z: af.z, color: 0xffc070, intensity: 0, distance: 1.8, flicker: 0, halo: 0.16, haloOpacity: 0.7, priority: 7 });
    // glow-worms: tiny halos at the bead tips
    this.wormHalos = [];
    for (const w of this.cave.worms) {
      const h = this.glow.add({ kind: 'halo', x: w.x, y: w.y, z: w.z, w: 0.06 + Math.random() * 0.06, color: w.col, opacity: 0.75 });
      if (h) this.wormHalos.push({ h, ph: w.ph });
    }
    // a faint blue-green over the whole roof from the worms
    const wl = { kind: 'worms', x: 3.0, y: 2.4, z: -6.5, color: 0x6ad8c0, intensity: 0.0, real: false, rock: [0.05, 0.12, 0.11], reach: 7, priority: -2 };
    this.lightSrcs.push(this.lights.add(wl));
  }

  /** Halos over the coins in the rubble (until picked up). */
  placeGlints() {
    const sd = starData(this.game.state);
    this.glintHalos = (this.cave.glints || []).map((g, i) => ((sd.glints || [])[i] ? null : this.glow.add({ kind: 'star', x: g.x, y: g.y + 0.02, z: g.z, w: g.gem ? 0.12 : 0.08, color: g.gem ? 0x9affe8 : 0xffe08a, opacity: 0.7 })));
  }

  hideGlint() { /* the coin voxels stay: a little shine is enough */ }

  // ------------------------------------------------------------ interactables
  /** A crosshair target (meters). o: { box | x,y,z,r | sphereFn, label (string or fn), action, enabled, kind, reach } */
  addIt(o) {
    const it = { kind: 'use', ...o };
    if (typeof o.label === 'function') Object.defineProperty(it, 'label', { get: o.label, enumerable: true });
    if (o.sphereFn) {
      const v = new THREE.Vector3();
      Object.defineProperty(it, 'x', { get: () => o.sphereFn(v).x, enumerable: true });
      Object.defineProperty(it, 'y', { get: () => v.y, enumerable: true });
      Object.defineProperty(it, 'z', { get: () => v.z, enumerable: true });
    }
    const en = o.enabled;
    it.enabled = () => this.canInteract() && (!en || en());
    return this.rig.add(it);
  }

  canInteract() { return !this.scripted && !this.seat && !this.build?.active && !this.chest?.busy; }

  /** Your room's fixed things: the window, the poster, the build bench, your trunk. */
  addFixedInteractions() {
    const { W, D } = this;
    const wz = (WINDOW_SLOTS[0] + 0.5) * T;
    this.addIt({ box: [0, 0.82, wz - 0.3, 0.1, 1.28, wz + 0.3], label: 'Peek through the window', action: () => this.peekWindow() });
    const P = this.shell.poster;
    this.addIt({ box: [(P.cx - P.w / 2) * T, (P.cy - P.h / 2) * T, 0, (P.cx + P.w / 2) * T, (P.cy + P.h / 2) * T, 0.06], label: 'Look at the poster', action: () => this.lookPoster() });
    const B = benchTiles(W, D);
    this.addIt({ box: [B.x * T + 0.1, 0, B.y * T, W * T, 1.6, (B.y + B.d) * T], label: 'Build bench: decorate', action: () => this.build.toggle(true) });
    const tz = this.trunk.obj.position.z * T;
    this.addIt({ box: [0, 0, tz - 0.32, 0.4, 0.45, tz + 0.32], label: 'Your trunk', enabled: () => this.trunk.obj.visible, action: () => { this.game.audio.play('creak', { vol: 0.4 }); this.game.ui.openInventory(); } });
  }

  // ------------------------------------------------------------ collision
  /** Is floor tile (tx, ty) of your room out of the room or under furniture / the bench? */
  tileBlocked(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.D) return true;
    return !!this.blockedTiles?.has(tx + ',' + ty);
  }

  /** Floor height under (x, z) meters: your room, the steps, the cave's rock floor, the lift cage. */
  floorY(x, z) {
    if (this.inCage({ x, z })) return HALL.y + (this.lift?.cageY || 0) * T;
    if (z >= HALL.z1 - 1e-4 || (x >= STAIRS.x0 && x <= STAIRS.x1 && z >= STAIRS.z0)) return floorAt(x, z);
    return this.cave ? this.cave.ground(x, z) : HALL.y;
  }

  rebuildCollision() {
    const { W, D } = this, w = this.world;
    const Wm = W * T, Dm = D * T, z1 = HALL.z1;
    w.clear();
    // your room: floor (and the arch's threshold), ceiling, walls
    w.add(-2, -1, z1, Wm + 2, 0, Dm + 2, 'shell');
    w.add(-2, CEIL, -0.01, Wm + 2, CEIL + 1, Dm + 2, 'shell');
    const ax0 = ARCH.x - ARCH.hw, ax1 = ARCH.x + ARCH.hw;
    w.add(-2, -1, z1, ax0, CEIL + 1, 0, 'shell');
    w.add(ax1, -1, z1, Wm + 2, CEIL + 1, 0, 'shell');
    w.add(ax0, ARCH.h, z1, ax1, CEIL + 1, 0, 'shell');
    w.add(-2, -1, Dm, Wm + 2, CEIL + 1, Dm + 2, 'shell');
    w.add(-2, -1, 0, 0, CEIL + 1, Dm + 2, 'shell');
    w.add(Wm, -1, 0, Wm + 2, CEIL + 1, Dm + 2, 'shell');
    // corner posts, the build bench
    for (const [x0, z0] of [[0, 0], [Wm - 0.1875, 0], [0, Dm - 0.1875], [Wm - 0.1875, Dm - 0.1875]]) w.add(x0, 0, z0, x0 + 0.1875, CEIL, z0 + 0.1875, 'shell');
    const B = benchTiles(W, D);
    w.add(B.x * T + 0.06, 0, B.y * T, Wm, 0.5, (B.y + B.d) * T, 'shell');
    // the cave's things (its rock is the voxels) and the lift
    for (const b of this.cave.boxes) w.add(...b, 'cave');
    for (const b of liftBoxes(this.gateShut)) w.add(...b, 'lift');
    // furniture in your room
    this.blockedTiles = new Set();
    for (let y = B.y; y < B.y + B.d; y++) this.blockedTiles.add(B.x + ',' + y);
    for (const rec of this.items.values()) {
      const f = FURNITURE[rec.p.id];
      if (!f || f.kind === 'rug' || f.kind === 'wall') continue;
      for (let y = rec.p.y; y < rec.p.y + rec.fd; y++) for (let x = rec.p.x; x < rec.p.x + rec.fw; x++) this.blockedTiles.add(x + ',' + y);
      const bb = rec.bbox;
      const h = clamp(bb.max.y, 0.45, CEIL - 0.1);
      w.add(Math.max(rec.p.x * T, bb.min.x) + 0.02, 0, Math.max(rec.p.y * T, bb.min.z) + 0.02, Math.min((rec.p.x + rec.fw) * T, bb.max.x) - 0.02, h, Math.min((rec.p.y + rec.fd) * T, bb.max.z) - 0.02, rec.p.uid);
    }
    this.starBoxAt = null;
    this.moveStarBox?.();
    this.refreshLoose();
    this.refreshStepMap();
    if (this.nug) this.fillNuggetMap();
    // never leave the mole stuck inside something new
    if (this.rig && !this.scripted && !this.seat) this.unstick();
  }

  fillNuggetMap() {
    this.nug.setBlocked((map) => {
      for (const k of this.blockedTiles) { const [x, y] = k.split(',').map(Number); map.setSolid(x, y, 1); }
    });
  }

  /** Push the mole out of anything solid (after furniture moved under it). */
  unstick() {
    const pl = this.rig.player;
    if (!pl.hitsAt(pl.pos.x, pl.pos.y, pl.pos.z)) return;
    for (let r = 0.1; r < 3; r += 0.1) for (let a = 0; a < 12; a++) {
      const x = pl.pos.x + Math.cos(a / 12 * Math.PI * 2) * r, z = pl.pos.z + Math.sin(a / 12 * Math.PI * 2) * r;
      const inRoom = x > 0.25 && z > 0.25 && x < this.W * T - 0.25 && z < this.D * T - 0.25;
      const inCave = z < HALL.z1 && x > HALL.x0 && x < HALL.x1 && z > HALL.z0;
      if (!inRoom && !inCave) continue;
      const y = this.floorY(x, z);
      if (!pl.hitsAt(x, y, z)) { pl.pos.set(x, y, z); return; }
    }
  }

  /** Footstep sounds follow the floor under the mole (rugs are soft, the cave is earth and stone). */
  refreshStepMap() {
    const floors = this.game.state.data.home.floor;
    this.stepMats = new Map();
    for (let y = 0; y < this.D; y++) for (let x = 0; x < this.W; x++) {
      const id = floors[`${x},${y}`] || 'floor_dirt';
      this.stepMats.set(x + ',' + y, id === 'floor_plank' ? 'wood' : id === 'floor_dirt' || id === 'floor_moss' ? 'dirt' : id === 'floor_carpet' ? 'sand' : 'stone');
    }
    const occ = occupancy(this.game.state.data.home.placed, null, this.W, this.D);
    for (const k of occ.rugs.keys()) this.stepMats.set(k, 'sand');
    for (const r of this.loose) if (r.rug && r.obj.visible) for (const t of r.tiles) this.stepMats.set(t.x + ',' + t.y, 'sand');
  }

  stepMatAt(x, z) {
    if (z < 0) {
      if (z > STAIRS.z0 - 0.05) return 'stone';
      if (this.inCage({ x, z })) return 'wood';
      if (Math.hypot(x - SPOTS.mosaic.x, z - SPOTS.mosaic.z) < 1 || (Math.abs(x - SPOTS.dais.x) < 1.2 && Math.abs(z - SPOTS.dais.z) < 0.7)) return 'stone';
      if (Math.hypot(x - SPOTS.pool.x, z - SPOTS.pool.z) < 0.55) return 'water';
      return 'dirt';
    }
    return this.stepMats?.get(Math.floor(x / T) + ',' + Math.floor(z / T)) || 'dirt';
  }

  // ------------------------------------------------------------ loose things
  /** Things that sit on a floor tile of your room and only show while the tile is free of furniture. */
  buildLoose() {
    const { W, D } = this;
    const add = (tiles, make, x, z, yaw = 0, o = {}) => {
      const obj = make();
      obj.position.set(x, 0, z);
      obj.rotation.y = yaw;
      this.room.add(obj);
      const rec = { tiles, obj, ...o };
      this.loose.push(rec);
      return rec;
    };
    const rx = Math.min(W - 1.6, 5.6), rz = Math.min(D - 1.6, 4.4);
    const rugTiles = [];
    for (let y = Math.floor(rz - 0.8); y <= Math.floor(rz + 0.8 - 0.01); y++) for (let x = Math.floor(rx - 1.2); x <= Math.floor(rx + 1.2 - 0.01); x++) rugTiles.push({ x, y });
    add(rugTiles, () => ragRug(2.4, 1.6, 6), rx, rz, 0, { rug: true });
    add([{ x: 0, y: 0 }], () => firewood(3), 0.48, 0.42, 0.2);
    add([{ x: W - 1, y: 0 }], () => broom(2), W - 0.36, 0.12, -0.15);
    add([{ x: W - 1, y: 0 }], () => letterCrate(5), W - 0.7, 0.55, -0.1);
    add([{ x: 0, y: D - 3 }], () => toolsLeaning(1), 0.12, D - 2.5, Math.PI / 2);
    add([{ x: 0, y: WINDOW_SLOTS[0] }], () => glowShrooms(7, 1, 0.55).obj, 0.36, WINDOW_SLOTS[0] + 0.5, 0.4);
    // your own old trunk against the west wall (your backpack's things, as far as E is concerned)
    const ty = [4, 3, 6, 1].find((k) => k < D - 1) ?? 4;
    this.trunk = add([{ x: 0, y: ty }], () => { const c = lootChest(61); return group(c.obj, c.lid); }, 0.42, ty + 0.5, Math.PI / 2);
  }

  refreshLoose() {
    const occ = occupancy(this.game.state.data.home.placed, null, this.W, this.D);
    for (const r of this.loose) r.obj.visible = r.tiles.every((t) => !occ.floor.has(t.x + ',' + t.y) && !(r.rug && occ.rugs.has(t.x + ',' + t.y)));
  }

  // ------------------------------------------------------------ furniture
  findKind(kind) {
    for (const it of this.items.values()) if (FURNITURE[it.p.id]?.kind === kind || it.p.id === kind) return it;
    return null;
  }

  nearKindVol(kind, range, vol) {
    if (!this.rig) return 0;
    let best = Infinity;
    const p = this.rig.player.pos;
    for (const it of this.items.values()) {
      if (FURNITURE[it.p.id]?.kind !== kind && it.p.id !== kind) continue;
      best = Math.min(best, Math.hypot(it.cx * T - p.x, it.cz * T - p.z));
    }
    return best < range ? vol * (1 - best / range) : 0;
  }

  nearPointVol(pt, range, vol) {
    if (!this.rig || !pt) return 0;
    const p = this.rig.player.pos, d = Math.hypot(pt.x - p.x, pt.z - p.z);
    return d < range ? vol * (1 - d / range) : 0;
  }

  ctxFor(p) {
    const d = this.game.state.data;
    const pl = d.home.planters[p.uid];
    return { eggs: this.eggCount(), planter: pl ? { ...pl, ready: pl.ready || pl.day < d.day } : null, items: ITEMS, weapons: d.weapons, state: this.game.state };
  }

  addPlaced(p) {
    const f = FURNITURE[p.id];
    if (!f || IN_THE_CAVE.has(f.kind)) return null;
    const res = buildFurniture(p.id, this.ctxFor(p));
    const [fw, fd] = footprint(p.id, p.r);
    const obj = res.obj;
    obj.position.set(p.x + fw / 2, 0, p.y + fd / 2);
    obj.rotation.y = (p.r || 0) * Math.PI / 2;
    this.room.add(obj);
    this.room.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(obj);
    if (!isFinite(bbox.max.y)) bbox.set(new THREE.Vector3(p.x * T, 0, p.y * T), new THREE.Vector3((p.x + fw) * T, 0.4, (p.y + fd) * T));
    const rec = { p, res, obj, fw, fd, cx: p.x + fw / 2, cz: p.y + fd / 2, bbox, lights: [], its: [], emitters: [], shadow: null };
    const toWorld = (x, y, z) => _v.set(x, y, z).applyMatrix4(obj.matrixWorld);
    for (const l of res.lights) {
      const wp = toWorld(l.x, l.y, l.z).clone();
      const o = { color: l.color, x: wp.x, y: wp.y, z: wp.z, intensity: (l.intensity ?? 4) * ISO_LIGHT, distance: (l.distance ?? 5) * T * 0.9, flicker: l.flicker ?? 0.1, speed: l.speed ?? 1, real: l.intensity !== 0 && l.real !== false, priority: l.priority ?? 1 };
      if (l.pool) { const pw = toWorld(l.poolX ?? l.x, 0, l.poolZ ?? l.z); o.pool = l.pool * T * 0.75; o.poolX = pw.x; o.poolZ = pw.z; o.poolOpacity = (l.poolOpacity ?? 0.3) * 0.7; }
      if (l.halo) { const hw = toWorld(l.hx ?? l.x, l.hy ?? l.y, l.hz ?? l.z); o.halo = l.halo * T * 0.7; o.hx = hw.x; o.hy = hw.y; o.hz = hw.z; o.haloOpacity = l.haloOpacity ?? 0.5; }
      const src = this.addLight(o);
      src.on = !this.game.state.flag('lampOff:' + p.uid);
      rec.lights.push(src);
    }
    if (f.kind !== 'rug' && f.kind !== 'wall') rec.shadow = this.shadows.add({ kind: 'pool', x: rec.cx * T, y: 0.004, z: rec.cz * T, w: (fw * 1.05 + 0.25) * T, h: (fd * 1.05 + 0.25) * T, color: 0, opacity: 0.5 });
    this.addEmitters(rec);
    this.addItemInteractions(rec);
    this.items.set(p.uid, rec);
    return rec;
  }

  removePlaced(uid) {
    const rec = this.items.get(uid);
    if (!rec) return;
    if (FURNITURE[rec.p.id]?.kind === 'coop' && this.nug) this.nug.ai.wake();
    this.room.remove(rec.obj);
    rec.obj.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      if (o.material && !o.material.userData?.shared) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    for (const s of rec.lights) this.removeLight(s);
    for (const it of rec.its) this.rig.remove(it);
    if (rec.shadow) this.shadows.remove(rec.shadow);
    this.items.delete(uid);
  }

  refreshPlaced(uid) {
    const rec = this.items.get(uid);
    if (!rec) return;
    const p = rec.p;
    this.removePlaced(uid);
    this.addPlaced(p);
  }

  /** Embers, steam, bubbles and spray from furniture (local spots → meters). */
  addEmitters(rec) {
    const r = rec.res;
    const w = (o) => _v.set(o.x, o.y, o.z).applyMatrix4(rec.obj.matrixWorld).clone();
    if (r.embers) { const e = w(r.embers); rec.emitters.push({ every: 0.18, t: 0, fn: () => this.fx.ember(e.x + rand(-0.12, 0.12), e.y, e.z + rand(-0.05, 0.05)) }); }
    if (r.steam) { const e = w(r.steam); rec.emitters.push({ every: 0.3, t: 0, fn: () => this.fx.spawn({ x: e.x + rand(-0.02, 0.02), y: e.y, z: e.z + rand(-0.02, 0.02), vx: rand(-0.04, 0.04), vy: rand(0.18, 0.3), vz: rand(-0.04, 0.04), life: rand(1.2, 1.8), size: 0.01, grow: 0.022, color: [0.92, 0.9, 0.88], alpha: 0.22, drag: 0.8, grav: -0.1 }) }); }
    if (r.bubbles) { const e = w(r.bubbles); const top = (r.bubbles.top - r.bubbles.y) * T; rec.emitters.push({ every: 0.5, t: 0, fn: () => this.fx.spawn({ x: e.x + rand(-0.02, 0.02), y: e.y, z: e.z, vy: 0.18, life: top / 0.18, size: 0.008, color: [0.9, 0.97, 1], alpha: 0.8, drag: 0 }) }); }
    if (r.spray) { const e = w(r.spray); rec.emitters.push({ every: 0.06, t: 0, fn: () => { const a = Math.random() * Math.PI * 2; this.fx.droplet(e.x, e.y, e.z, Math.cos(a) * rand(0.1, 0.22), rand(0.3, 0.45), Math.sin(a) * rand(0.1, 0.22), 0.45, [0.8, 0.94, 1], 0.008); } }); }
  }

  addItemInteractions(rec) {
    const p = rec.p, f = FURNITURE[p.id], st = this.game.state;
    const b = rec.bbox;
    const box = [b.min.x - 0.02, 0, b.min.z - 0.02, b.max.x + 0.02, Math.max(0.3, b.max.y) + 0.02, b.max.z + 0.02];
    // the box only narrows it down: the crosshair must really be on the model (see updateAim)
    const add = (o) => rec.its.push(this.addIt({ box, enabled: () => this.aimRec === rec, ...o }));
    switch (f.kind) {
      case 'bed': add({ label: 'Sleep', action: () => this.trySleep(rec) }); break;
      case 'coop': add({ label: () => (this.eggCount() > 0 ? `Collect eggs (${st.data.chicken.eggs})` : 'Check the coop'), action: () => this.collectEggs(rec) }); break;
      case 'planter': add({ label: () => this.planterLabel(rec), action: () => this.usePlanter(rec) }); break;
      case 'desk': add({ label: 'Write in the Index Book', action: () => { this.game.audio.play('page'); this.game.ui.openIndex(); } }); break;
      case 'seat': add({ label: 'Sit', action: () => this.sitAt(rec) }); break;
      case 'light': add({ label: () => (rec.lights[0]?.on === false ? 'Light it' : 'Put it out'), action: () => this.toggleLamp(rec) }); break;
      default:
        if (p.id === 'music_box') add({ label: () => (this.musicBox.on ? 'Stop the music box' : 'Wind the music box'), action: () => this.toggleMusicBox() });
    }
  }

  /** Which placed piece the crosshair is really on (a ray against its voxel meshes), within reach. */
  updateAim() {
    const rig = this.rig, eye = rig.eye(_v), f = rig.forward(_w);
    const reach = rig.reach + 0.2;
    this.ray ||= new THREE.Raycaster();
    this.ray.set(eye, f);
    this.ray.far = reach;
    let best = null, bt = reach;
    if (eye.z > -0.4) for (const rec of this.items.values()) {
      const b = rec.bbox;
      const t = rayBox3(eye, f, b.min.x - 0.03, -0.01, b.min.z - 0.03, b.max.x + 0.03, b.max.y + 0.03, b.max.z + 0.03);
      if (t === null || t >= bt) continue;
      for (const h of this.ray.intersectObject(rec.obj, true)) {
        if (h.distance >= bt) break;
        let vis = true;
        for (let o = h.object; o && o !== this.room; o = o.parent) if (!o.visible) { vis = false; break; }
        if (vis) { bt = h.distance; best = rec; break; }
      }
    }
    this.aimRec = best;
    this.aimT = bt;
  }

  // ------------------------------------------------------------ spawning
  spawnByFrom(from, params = {}) {
    let spot = null;
    if (from === 'bed' || from === 'faint' || from === 'sleep') { const rec = this.findKind('bed'); const s = rec && besideItem(this, rec); if (s) spot = { x: s.x * T, z: s.z * T, face: { x: s.face.x * T, z: s.face.z * T } }; }
    if (from === 'forge') spot = { x: SPOTS.anvil.x + 0.55, z: SPOTS.anvil.z + 0.9, face: { x: SPOTS.forge.x, z: SPOTS.forge.z } };
    if (from === 'cooking' || from === 'stove') spot = { x: SPOTS.fire.x + 0.95, z: SPOTS.fire.z + 0.55, face: { x: SPOTS.fire.x, z: SPOTS.fire.z } };
    if (from === 'lift') spot = { x: LIFT.cx, z: LIFT.cz, yaw: Math.PI / 2 };
    if (from === 'town' || from === 'tunnel') spot = this.doorOpen && from === 'town' ? { x: FRONT.x, z: this.cave.passage.z + 0.85, yaw: Math.PI } : { x: LIFT.outX - 0.2, z: LIFT.cz, yaw: Math.PI / 2 };
    if (from === 'fall' || from === 'newgame') spot = { x: MOUND.x - 0.05, z: MOUND.z + 0.62, yaw: 0.15 };
    // otherwise: at the foot of the steps, looking out over the cave
    if (!spot) spot = { x: ARCH.x + 0.05, z: STAIRS.z0 - 0.75, face: { x: 2.2, z: -7.5 } };
    if (spot.face) spot.yaw = Math.atan2(-(spot.face.x - spot.x), -(spot.face.z - spot.z));
    this.rig.place(spot.x, this.floorY(spot.x, spot.z), spot.z, spot.yaw ?? 0, -0.06);
    if (from !== 'lift') this.unstick();
    void params;
  }

  // ------------------------------------------------------------ scripted moves
  /** Take the camera for a cutscene: cam = { x, y, z (eye, m), yaw, pitch, roll }. */
  beginScript(paws = true) {
    this.scripted = true;
    this.hidePaws = !paws;
    const pl = this.rig.player;
    this.cam = { x: pl.pos.x, y: pl.pos.y + pl.eyeY, z: pl.pos.z, yaw: pl.yaw, pitch: pl.pitch, roll: 0 };
    this.game.ui.setCrosshair?.(null);
  }

  endScript() {
    const pl = this.rig.player, c = this.cam;
    if (c) {
      const fy = this.floorY(c.x, c.z);
      pl.pos.set(c.x, Math.max(fy, c.y - pl.eyeY), c.z); pl.vel.set(0, 0, 0); pl.yaw = c.yaw; pl.pitch = clamp(c.pitch, -1.4, 1.4);
    }
    this.scripted = false;
    this.hidePaws = false;
    this.cam = null;
    this.rig.syncCamera(0);
  }

  /** Walk the scripted camera to (x, z) meters at eye height over the floor, turning to face along the way. */
  walkCam(x, z, speed = 1.6, faceYaw = null) {
    const c = this.cam;
    const x0 = c.x, z0 = c.z, d = Math.hypot(x - x0, z - z0);
    const yaw0 = c.yaw, yaw1 = faceYaw ?? (d > 0.05 ? Math.atan2(-(x - x0), -(z - z0)) : c.yaw);
    const dy = Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0));
    const eye = this.rig.player.eyeY;
    return this.tween(Math.max(0.25, d / speed), (k) => {
      const e = k * k * (3 - 2 * k);
      c.x = x0 + (x - x0) * e; c.z = z0 + (z - z0) * e;
      c.y += (this.floorY(c.x, c.z) + eye - c.y) * 0.35;
      c.yaw = yaw0 + dy * Math.min(1, k * 2.2);
      c.pitch += (-0.05 - c.pitch) * 0.08;
      c.bob = Math.sin(k * d * 9) * 0.012 * (1 - k);
      c.moving = k < 1 && d > 0.05;
      if (Math.floor(k * d * 3) !== this._stepK) { this._stepK = Math.floor(k * d * 3); this.game.audio.play('step', { vol: 0.3, mat: this.stepMatAt(c.x, c.z) }); }
    });
  }

  updateScriptCam(dt) {
    const c = this.cam, cam = this.camera, rig = this.rig;
    rig.shakeAmp = Math.max(0, rig.shakeAmp - dt * 1.4);
    const sh = rig.shakeAmp * 0.05;
    cam.position.set(c.x + (Math.random() - 0.5) * sh, c.y + (c.bob || 0) + (Math.random() - 0.5) * sh, c.z + (Math.random() - 0.5) * sh);
    cam.rotation.set(c.pitch, c.yaw, c.roll || 0, 'YXZ');
    cam.updateMatrixWorld();
    const pl = rig.player;
    pl.pos.set(c.x, Math.max(-3, c.y - pl.eyeY), c.z);
    pl.yaw = c.yaw;
    if (rig.vm) rig.vm.update(dt, { speed: c.moving ? 1.5 : 0, grounded: true, look: { dx: 0, dy: 0 }, lamp: { color: rig.lampCol, intensity: rig.lampK }, ambient: rig.ambient, camera: cam });
  }

  // ------------------------------------------------------------ HUD bits
  /** A small hammer button (desktop: shows the X key; touch: tap to decorate). */
  hammerBtn() {
    const b = el('button', { class: 'btn interactive', title: 'Build mode (X)', 'aria-label': 'Decorate', style: { position: 'absolute', right: 'calc(var(--sar, 0px) + var(--px) * 4)', top: 'calc(var(--sat, 0px) + var(--px) * 44)', display: 'flex', alignItems: 'center', gap: 'calc(var(--px) * 2)', fontSize: '1em', pointerEvents: 'auto', zIndex: 4 }, onclick: (e) => { e.stopPropagation(); this.toggleBuildHere(); } }, [
      el('img', { class: 'pix', src: iconURL('chair_wood'), alt: '', style: { width: 'var(--icon-s, 32px)', height: 'var(--icon-s, 32px)' } }), el('kbd', { style: { margin: 0 } }, 'X'),
    ]);
    // in the HUD layer: above the "click to look around" catcher, so it works with a free mouse
    this.game.ui.hud.append(b);
    this.hammer = b;
  }

  /** Build mode from the hammer / X: it's your room you decorate, up the steps. */
  toggleBuildHere() {
    if (!this.build.active && this.rig.player.pos.z < HALL.z1 - 0.05) {
      this.game.audio.play('ui_error', { vol: 0.5 });
      this.think('This is Old Star\'s workshop. I\'ll do my decorating up the steps, in my own room.', 3);
      return;
    }
    this.build.toggle();
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    super.update(dt);
    const g = this.game, inp = g.input;
    for (const t of [...this.tickers]) t(dt, this.time);
    if (this.scripted) {
      inp.takeLook(); // the mouse doesn't steer a cutscene (and mustn't pile up for afterwards)
      if (this.seat && this.seat.ready && (inp.pressed('KeyE') || inp.axisX() || inp.axisY() || inp.pressed('Space'))) { inp.consume('KeyE'); this.standUp(); }
      this.updateScriptCam(dt);
      if (this.seat) g.ui.setCrosshair?.({ visible: true, kind: 'use', label: 'Stand up' });
    } else {
      const busy = g.ui.isPanelOpen();
      this.updateAim();
      this.rig.update(dt, { busy });
      this.rig.stepMat = this.stepMatAt(this.rig.player.pos.x, this.rig.player.pos.z);
      if (!busy) {
        if (!this.build.active && this.rig.tool !== 'none') this.rig.setTool('none');
        if (!this.build.active && inp.pressed('KeyQ')) this.snack();
      }
    }
    this.build.update(dt);
    this.tickCave(dt);
    this.tickAmbience(dt);
    this.tickWakeFx(dt);
    // furniture life
    const pl = this.rig.player.pos;
    const env = { near: 99, audio: g.audio, playing: false };
    for (const rec of this.items.values()) {
      for (const e of rec.emitters) { if (rec.lights.length && rec.lights[0].on === false) continue; e.t -= dt; if (e.t <= 0) { e.t = e.every; e.fn(); } }
      if (!rec.res.update) continue;
      env.near = Math.hypot(rec.cx * T - pl.x, rec.cz * T - pl.z) / T;
      env.playing = this.musicBox.on && rec.p.id === 'music_box';
      rec.res.update(dt, this.time, env);
    }
    this.tickMusicBox(dt);
    // Nugget naps in her coop now and then
    if (this.nug) {
      this.nug.update(dt, this.rig.player);
      if (!this.scripted) {
        this.napT -= dt;
        if (this.napT <= 0) {
          this.napT = rand(40, 70);
          const coop = this.findKind('coop');
          if (coop && coop.res.nap && this.nug.ai.mode === 'follow' && this.nug.ai.idleFor > 3) this.sendNuggetToNap(coop, rand(14, 24));
        }
      }
    }
    if (this.star?.rig) this.star.update(dt);
    this.lift.update(dt, this.time);
    this.lights.update(dt, pl.x, pl.z);
    this.glow.update(this.camera);
    this.shadows.update(this.camera);
    this.fx.update(dt);
    this.updateAnchors();
    this.updateLoops();
  }

  /** Fireflies by the window and round the glowing fungi in your room. */
  tickAmbience(dt) {
    this.flyT = (this.flyT || 0) - dt;
    if (this.flyT <= 0) {
      this.flyT = 0.9;
      const spots = [{ x: 0.35, y: 0.9, z: (WINDOW_SLOTS[0] + 0.5) * T }, ...this.shell.fungi.map((f) => ({ x: f.x * T, y: f.y * T + 0.1, z: f.z * T }))];
      const s = pick(spots);
      this.fx.firefly(s.x + rand(-0.25, 0.25), s.y + rand(-0.1, 0.35), s.z + rand(-0.25, 0.25), pick([[0.78, 1, 0.48], [0.6, 1, 0.85], [1, 0.94, 0.62]]));
    }
  }

  // ------------------------------------------------------------ timelines and sound
  sleepFor(secs) { return new Promise((res) => { let t = 0; const tick = (dt) => { t += dt; if (t >= secs) { this.tickers.splice(this.tickers.indexOf(tick), 1); res(); } }; this.tickers.push(tick); }); }
  later(secs, fn) { let t = 0; const tick = (dt) => { t += dt; if (t >= secs) { this.tickers.splice(this.tickers.indexOf(tick), 1); fn(); } }; this.tickers.push(tick); }
  tween(secs, fn) {
    return new Promise((res) => {
      let t = 0;
      fn(0);
      const tick = (dt) => { t += dt; const k = Math.min(1, t / secs); fn(k); if (k >= 1) { this.tickers.splice(this.tickers.indexOf(tick), 1); res(); } };
      this.tickers.push(tick);
    });
  }

  ambientLoop(name, vol, params = {}) { const l = { name, vol, params, h: null, cur: 0 }; this.loops.push(l); return l; }
  updateLoops() {
    const audio = this.game.audio;
    for (const l of this.loops) {
      const v = Math.max(0, l.vol());
      if (!l.h || !l.h.alive) {
        l.h = null;
        if (v > 0.01 && audio.ctx && audio.ctx.state === 'running') l.h = audio.loop(l.name, { ...l.params, vol: v });
      } else if (v <= 0.003) { l.h.stop(0.3); l.h = null; } else if (Math.abs(v - l.cur) > 0.005) l.h.set({ vol: v });
      l.cur = v;
    }
  }

  render() {
    if (!this.rig) return;
    if (this.hidePaws) this.game.engine.render(this.scene, this.camera, this.post);
    else this.rig.render(this.post);
  }

  onResize(w, h) {
    if (this.rig) this.rig.onResize(w, h);
    if (this.fx && this.rig) this.fx.setPixelScale(h, this.rig.fov);
    this.wakeFx?.resize();
  }

  // ------------------------------------------------------------ test hooks
  makeDebug() {
    const s = this;
    const find = (label) => { const want = String(label).toLowerCase(); return s.rig.items.find((i) => String(i.label || '').toLowerCase().includes(want)); };
    // one frame, then a few microtask turns so awaited tweens and lines carry on (no render in between)
    const frame = async (dt) => { s.update(dt); s.game.ui.update(dt); s.game.input.endFrame(); for (let i = 0; i < 12; i++) await null; };
    const k0 = () => ({ waking: !!s.waking, scripted: !!s.scripted, lesson: s.lessonStage(), line: s.game.ui.tutor?.active?.html?.slice(0, 60) ?? null });
    return {
      /** Ride the lift to a destination id ('L0' the mine entrance, 'town', any found mine lift). */
      useLift(id = 'L0') { s.scripted = false; s.riding = false; s.rideLift(id); return true; },
      toggleBuild(on) { s.build.toggle(on); return s.build.active; },
      /** Place furniture id at tile (x, z) with rotation r (adds one to storage if needed). */
      placeAt(id, x, z, r = 0) { return s.build.placeDirect(id, x, z, r); },
      /** Run the interactable whose label contains `label` (case-insensitive). */
      interact(label) { const it = find(label); if (!it) return false; it.action?.(it); return true; },
      /** Every interactable label usable right now. */
      labels() { return s.rig.items.filter((i) => !i.enabled || i.enabled()).map((i) => String(i.label)); },
      /** Talk to Old Star: 'lesson' (the lesson talk opened), his line, or null. */
      talk() { return s.talkStar(); },
      /** Open Old Star's notes at note i (default: the first unread). Returns the note's id. */
      openNotes(i) { const k = i ?? s.noteUnderCrosshair(); s.readNotes(k); return s.notes[k]?.id ?? null; },
      /** E on the Miners' Board (resolves with its panel handle). */
      minersBoard(tab) { return s.useMinersBoard(tab); },
      /** Open the loot chest; resolves with what it handed over. */
      openChest() { return s.chest.use(); },
      /** The cave clock (hours, 7 = morning, 21.5+ = Old Star sleeps). */
      clock(h) { if (h !== undefined) s.setClock(h); return s.clockHours(); },
      /** Send Old Star to a place ('anvil' | 'bellows' | 'fire' | 'armchair' | 'board' | 'lift' | 'ruins' | 'pool' | 'cot'), instantly. */
      star(spot) { if (spot && s.star?.rig) { s.star.placeAt(spot); s.moveStarBox(); } return s.star ? { mode: s.star.mode, spot: s.star.spot, pose: s.star.pose, x: s.star.pos.x, z: s.star.pos.z, standIn: !!s.star.standIn } : null; },
      /** The lesson stage ('wake' | 'mine' | 'forge' | 'cook' | 'done'); with an argument, set it. */
      lesson(stage) { if (stage) { s.setLesson(stage); s.placeStarForLesson(true); } return s.lessonStage(); },
      /** Skip the lessons (as the talk menu's "Skip the lessons" does). */
      skipLessons() { s.skipLessons(); return s.lessonStage(); },
      /** Run the waking-up scene to its end: step the frames and carry on through Old Star's lines. */
      // (async: the scripted scenes await their tweens, so each frame lets those promises run on)
      async finishWake(maxFrames = 3000) {
        for (let i = 0; i < maxFrames && (s.waking || s.scripted); i++) { await frame(1 / 30); if (s.game.ui.tutor?.active?.wait) s.game.ui.tutor.next(); }
        return { waking: !!s.waking, lesson: s.lessonStage(), fallen: !!s.game.state.flag('fallen') };
      },
      /** The waking-up overlays right now. */
      wakeFx() { const f = s.wakeFx; return f ? { open: +f.open.toFixed(2), blur: +f.blur.toFixed(2), drops: f.drops.length } : null; },
      /** As if back home from somewhere mid-lesson ('lift' | 'forge' | 'cooking'). */
      arrive(from) { return s.onLessonArrival(from); },
      /** Aim at a point (meters) from where the mole stands. */
      aim(x, y, z) { const e = s.rig.eye(_v); s.rig.player.yaw = Math.atan2(-(x - e.x), -(z - e.z)); s.rig.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)); s.rig.syncCamera(0); },
      /** Stand at (x, z) meters (on whatever floor is there) facing yaw. */
      stand(x, z, yaw = 0, pitch = 0) { if (s.scripted && !s.seat) s.endScript(); s.rig.place(x, s.floorY(x, z), z, yaw, pitch); },
      /** Run the simulation n frames (synchronously: scripted scenes don't move on; use run()). */
      step(n = 30, dt = 1 / 30) { for (let k = 0; k < n; k++) { s.update(dt); s.game.ui.update(dt); } },
      /** Run n frames and let the scripted scenes (waking up, lessons) move on between them. Async. */
      async run(n = 30, dt = 1 / 30, until = null) { for (let k = 0; k < n && !(until && until()); k++) await frame(dt); return k0(); },
      /** Draw calls and triangles for one frame. */
      stats() { const r = s.game.engine.renderer; r.info.autoReset = false; r.info.reset(); s.render(); const o = { ...r.info.render }; r.info.autoReset = true; return o; },
      get target() { return s.rig.target ? String(s.rig.target.label) : null; },
      spots: { cave: HALL, arch: ARCH, shaft: SHAFT, lift: LIFT, front: FRONT, hole: HOLE, ...SPOTS },
    };
  }

  exit() {
    this.game.ui.setCrosshair?.(null);
    this.game.ui.setHints(null);
    this.game.ui.setTouchControls?.(true);
    this.game.canvas.style.filter = '';
    this.hammer?.remove();
    for (const n of document.querySelectorAll('.loot-fly')) n.remove();
    if (this.chest?.busy) this.game.ui.status?.pin?.(false);
    super.exit();
  }
}

// the lift and the passage (src/home/moves.js); living in your room (living.js); the workshop
// (workshop.js); the lessons (lessons.js); waking up (wake.js)
for (const M of [HomeMoves, HomeLiving, WorkshopLife, HomeLessons, HomeWake]) {
  for (const k of Object.getOwnPropertyNames(M.prototype)) if (k !== 'constructor') Object.defineProperty(HomeScene.prototype, k, Object.getOwnPropertyDescriptor(M.prototype, k));
}
