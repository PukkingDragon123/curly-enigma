// Home, in first person: Old Star's cave. One small, old hollow in the rock (src/home/house.js; its
// plan plan.js, the rock caveShell.js): his forge and anvil, the bellows, his quench bucket and
// coal, his tools on pegs under old shoring timbers, the fleece he sleeps on, his trunk, the fire
// pit with the pot and kettle and his stump beside it, his notes nailed to the rock, the slate on a
// crate that is his Miners' Board, the cage lift down to the mine, the old door to Deep Town (caved
// in until you find the way from below; then it stands open on the old passage and you walk up it
// into town: src/home/passage.js), the hole you fell through; and your bedroll on the floor
// with a flat stone at its head (your notebook: the Index Book) and your little trunk. Old Star
// lives here (src/home/oldstar.js) and talks you through his lessons (lessons.js) after he wakes you
// on that bedroll (wake.js). The alcoves round the hollow are yours to dig out and furnish
// (src/home/nooks.js: your sleeping alcove once the lessons are done, then a storage nook, a
// workshop bay and a pantry, from the Miners' Board or with E at the chalk marks); X (or the chair
// button) is build mode in them. There is no digging out of the home: the lift is the way down.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { FPSRig } from '../fps/FPSKit.js';
import { liftState } from '../fps/lifts.js';
import { Particles } from '../deep/Particles.js';
import { LightPool } from '../iso/LightPool.js';
import { buildFurniture } from '../iso/furniture.js';
import { footprint, TUNNEL_SLOTS } from '../iso/homeLayout.js';
import { FURNITURE } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { iconURL, iconCanvas } from '../gfx/PixelArt.js';
import { el, rand, pick, clamp } from '../core/util.js';
import { T, HALL, ARCH, SHAFT, FRONT, HOLE, GRID } from '../home/units.js';
import { NookFloor } from '../home/nookFloor.js';
import { StarHouse, SPOTS } from '../home/house.js';
import { loadHouse, dropHouseCache, houseWant } from '../home/houseLoad.js';
import { houseLoading } from '../home/loading.js';
import { ROOM, walkable, ceilAt, setOpenNooks } from '../home/plan.js';
import { NOOKS, NOOK, openNooks, nookAt, grantNook, migrateHome, reseatNooks, diggable } from '../home/nooks.js';
import { NookDig } from '../home/nookDig.js';
import { BoxWorld } from '../fps/FPSKit.js';
import { HW as PLAYER_HW } from '../deep/Player.js';
import { liftBoxes, LIFT } from '../home/lift.js';
import { FPGlow } from '../home/glow.js';
import { FPBuild } from '../home/build.js';
import { besideItem } from '../home/layoutfix.js';
import { HomeMoves } from '../home/moves.js';
import { HomeLiving } from '../home/living.js';
import { WorkshopLife } from '../home/workshop.js';
import { HouseLife } from '../home/houseLife.js';
import { RoomCull } from '../home/rooms.js';
import { HomeLessons } from '../home/lessons.js';
import { HomeWake } from '../home/wake.js';
import { OldStar } from '../home/oldstar.js';
import { LootChest } from '../home/chest.js';
import { starData } from '../home/starData.js';
import { loadNotes } from '../home/notes.js';
import { campCloths } from '../home/campCloth.js';
import { CampAir } from '../home/campAir.js';
import { buildPassage, passageBoxes, inPassage, passageU, SWAP, PASSAGE_LOOK, toTown } from '../home/passage.js';
import { inDoorway } from '../home/caveShell.js';

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
    // UI icons are canvases read back as data URLs: the build button's is drawn once the camp is in
    // (drawing it here waited on the GPU to finish everything the last scene queued: up to 25 s on
    // software GL coming from the journey) and read back without waiting
    this.buildIconURL = null;
    const makeIcon = () => { if (this.buildIconURL || this.gone) return; try { iconCanvas('chair_wood').toBlob((b) => { if (!b) return; this.buildIconURL = URL.createObjectURL(b); if (this.hammerImg) this.hammerImg.src = this.buildIconURL; }); } catch (e) { this.buildIconURL = iconURL('chair_wood'); if (this.hammerImg) this.hammerImg.src = this.buildIconURL; } };
    const from = params.from || 'continue';
    // the wait while the house is built (or put back together): src/home/loading.js
    // (walking in from the old passage the frame held on screen stays: just a small lantern in the corner)
    const loading = this.loading = houseLoading(g, from === 'passage' ? { corner: true, appear: 0.35, label: 'Loading' } : { dark: from === 'fall' || from === 'newgame' });
    this.own(() => loading.done());
    mark('loadscreen');
    this.arrivalLesson = params.lesson || null; // cooking { tutorial } comes back with lesson: 'cook_done' | 'cook'
    this.from = from;
    st.flag('lastScene', 'home');
    st.flag('homeVisited', true);
    if (from === 'fall') st.flag('fallen', true);
    mark('flags');
    if (!d.home.planters) d.home.planters = {};
    if (!d.home.floor) d.home.floor = {};
    mark('flags');
    const sd = starData(st);
    // Old Star's forge and hearth are his: the room's own come out of the save
    if (d.home.placed.some((p) => IN_THE_CAVE.has(FURNITURE[p.id]?.kind))) d.home.placed = d.home.placed.filter((p) => !IN_THE_CAVE.has(FURNITURE[p.id]?.kind));
    // [home6] the alcoves you dig out (src/home/nooks.js): an old save's room becomes the alcoves it
    // was worth (its furniture set back down in them, the rest stored); once the lessons are over
    // your sleeping alcove is yours (Old Star dug it out while you were at the pot)
    const newGame = from === 'fall' || from === 'newgame';
    const lessonsOver = !newGame && (sd.lesson === 'done' || !!sd.skipped || (!!d.unlocks && st.unlocked?.('build') !== false));
    const mig = newGame ? null : migrateHome(st, { lessonsOver });
    if (mig?.granted?.length || mig?.stored?.length) console.info('[home] old save moved into the cave', JSON.stringify(mig));
    if (lessonsOver && grantNook(st, 'nook_bed')) this.nookGift = true;
    this.nooks = openNooks(st);
    setOpenNooks(this.nooks);
    mark('nooks');
    // the lift always knows the mine entrance right below (lifts.js seeds 'L0')
    liftState(st);
    const W = GRID.W, D = GRID.D;
    this.W = W;
    this.D = D;
    this.tickers = [];
    this.loops = [];
    this.anchors = new Map();
    this.hideFrom = new Map(); // bubble key → () => true while it's out of sight
    this.scripted = false;
    // split-toned: the rock's shade goes cold blue, the fire- and lamplight stays amber
    // (the old passage to town wears this look too: src/home/passage.js PASSAGE_LOOK)
    this.post = { ...PASSAGE_LOOK };
    this.scene.background = new THREE.Color(0x05060a);
    // a thin cold haze: the far end of the hollow goes blue-black (depth in a small cave)
    this.scene.fog = new THREE.FogExp2(0x090c12, 0.05);
    // no digging out of the home: no tunnel mouths in your walls any more
    this.tunnels = [];
    for (const w of ['n', 's', 'e', 'w']) TUNNEL_SLOTS[w] = new Set();
    this.doorOpen = !!st.flag('escaped');
    if (reseatNooks(st, this.nooks)) st.save();
    mark('relocate');
    this.notes = loadNotes();
    mark('prep');

    // ---- the cave (built in workers and kept between visits: src/home/houseLoad.js) and the floors
    // you've laid in your alcoves (here meanwhile); nothing renders until it's all in (see render())
    const built = loadHouse(houseWant(st), (p) => loading.set(p));
    this.room = new THREE.Group();
    this.room.scale.setScalar(T);
    this.scene.add(this.room);
    this.shell = new NookFloor(this.room, this.scene);
    await this.shell.build(W, D, d.home.floor, this.nooks);
    this.own(() => this.shell.dispose());
    const house = await built;
    // (it keeps its old name: `cave` is the house)
    this.cave = this.house = StarHouse.assemble(this.room, this.scene, house.jobs, house.vista);
    this.cave.buildMs = house.ms;
    this.cave.workers = house.workers;
    this.own(() => this.cave.dispose());
    this.lift = this.cave.lift;
    this.holeTop = this.cave.holeTop?.y ?? HALL.y + 2.4; // (up the hole you fell through)
    // real cloth: his apron, the sacking across your alcove (you push through it)
    try { this.cloths = campCloths(this.scene, this.cave.laundry); this.own(() => this.cloths.dispose()); (this.cave.roomMeshes.camp ||= []).push(...this.cloths.list.map((c) => c.mesh)); } catch (e) { console.warn('[home] cloth', e); }
    // the old passage up to Deep Town, behind the open door (the same tunnel the town has behind
    // your burrow door: src/home/passage.js); you walk it, and the town takes over halfway
    if (this.doorOpen) {
      try { this.passage = buildPassage(); this.scene.add(this.passage.group); } catch (e) { console.warn('[home] passage', e); this.passage = null; }
    }
    mark('build');

    // ---- light: a dim cave, a pool of point lights shared by the fires, lanterns and candles, glows and contact shadows
    // (the ground colour is the warm bounce off the earth: undersides of things aren't black)
    this.scene.add(new THREE.HemisphereLight(0x7a92c4, 0x3a3029, 0.62));
    const fill = new THREE.DirectionalLight(0xffd0a0, 0.06);
    fill.position.set(2, 6, 2);
    this.scene.add(fill);
    this.lights = new LightPool(this.scene, 10, { range: 40 });
    this.glow = new FPGlow(this.scene, 420);
    this.shadows = new FPGlow(this.scene, 180, { shadow: true });
    this.fxU = { fogCol: { value: new THREE.Color(0x090c12) }, fogDist: { value: 22 } };
    this.world = new BoxWorld();
    this.fx = new Particles(this.scene, this.world, this.fxU);
    this.own(() => this.fx.dispose());
    // the camp's air: the beam of daylight down the hole, smoke, sparks, moths at the lanterns
    try { this.air = new CampAir(this); this.own(() => this.air.dispose()); } catch (e) { console.warn('[home] air', e); }
    this.addShellLights();
    this.addCaveLights();
    // soft contact shadows under the house's furniture
    for (const p of this.cave.shadowSpots) this.shadows.add({ kind: 'pool', x: p.x, y: HALL.y + 0.004, z: p.z, w: p.w, h: p.h, color: 0, opacity: 0.42 });

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
    for (const p of d.home.placed) this.addPlaced(p);
    this.addFixedInteractions();
    this.chest = new LootChest(this, this.cave.dyn.chest);
    this.own(() => this.chest.dispose());
    this.shaftBox = [SHAFT.x0 - 0.14, HALL.y, SHAFT.z0, SHAFT.x1, HALL.y + 1.4, SHAFT.z1];
    this.addCaveInteractions();
    this.addHouseInteractions();
    this.addIt({ box: [SHAFT.x0 - 0.24, HALL.y + 0.5, SHAFT.z0 - 0.22, SHAFT.x0, HALL.y + 1.05, SHAFT.z0], label: () => (this.lessonStage() === 'mine' ? 'Ride down to the dig' : 'Ride the lift'), action: () => this.useLift() });
    mark('furniture');
    this.rebuildCollision();
    mark('collision');
    this.cull = new RoomCull(this);
    this.buildStarGrid();
    mark('starGrid');
    this.refreshPins();
    this.placeGlints();
    if (this.star?.rig) {
      const stage = this.lessonStage();
      if (stage === 'pick' || stage === 'mine' || stage === 'forge' || stage === 'cook') this.placeStarForLesson(true);
      else this.star.placeAt(this.clockHours() >= 21.5 ? 'cot' : pick(['anvil', 'anvil', 'fire', 'armchair', 'bellows', 'board']));
      this.moveStarBox();
    }

    mark('starPlace');
    // ---- the mole
    this.spawnByFrom(from, params);
    mark('spawn');
    if (d.tame?.raptors?.length) import('../deep/tame/home.js').then((m) => { if (!this.gone) m.homeRaptors(this); }).catch((e) => console.warn('[home] raptors', e)); // [tame hook] your raptors wait by the lift
    if (d.egg) import('../home/eggNest.js').then((m) => { if (!this.gone) m.homeEgg(this); }).catch((e) => console.warn('[home] egg', e)); // [egg hook] the raptor egg from the forest, by your bedroll
    this.musicBox = { on: false, t: 0, i: 0 };

    // ---- build mode, sounds
    this.build = new FPBuild(this);
    this.own(() => this.build.dispose());
    mark('buildmode');
    const F = this.cave.dyn.forge.fire, H = this.cave.dyn.hearth.fire, FP = this.cave.dyn.fireplace.fire, P = SPOTS.pool;
    this.ambientLoop('forge_fire', () => this.nearPointVol(F, 4.0, 0.36 + (this.forgeAir || 0) * 0.3) * this.sameRoomK(F));
    this.ambientLoop('fire', () => this.nearPointVol(H, 3.6, 0.3) * this.sameRoomK(H) + this.nearPointVol(FP, 4.6, 0.42) * this.sameRoomK(FP) + this.nearKindVol('fireplace', 3, 0.4));
    this.ambientLoop('water', () => this.nearPointVol(P, 1.2, 0.05) + this.nearKindVol('fountain', 2.5, 0.22) + this.nearKindVol('fish_tank', 1.5, 0.08));
    this.ambientLoop('wind', () => { const p = this.rig.player.pos; return this.inBedroom(p.x, p.z) ? 0.012 : 0.02 + 0.03 * Math.max(0, 1 - Math.hypot(p.x - HOLE.x, p.z - HOLE.z) / 2.5); });
    mark('loops');
    this.own(() => { for (const l of this.loops) if (l.h) l.h.stop(0.1); });
    this.own(() => { for (const k of this.anchors.keys()) g.ui.hideBubble(k); g.ui.setHints(null); g.ui.tutor?.hide(); });
    g.ui.setRadar?.(null);
    g.ui.setDepth?.(null);
    g.ui.setBag?.(null);
    g.ui.setActionIcon?.(false);
    mark('hud');
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
    else if (from === 'passage') this.later(2.4, () => this.greet());
    else if (from === 'dig') this.arriveFromDig(params.nook);
    else this.later(1.5, () => this.greet());
    if (this.nookGift && from !== 'dig') this.mentionNookGift();
    this.debug = this.makeDebug();
    this.buildMs = performance.now() - t0;
    const steps = (o) => Object.entries(o).map(([k, v]) => k + ' ' + v).join(', ');
    this.buildMarks = marks;
    console.info(`[home] built in ${this.buildMs.toFixed(0)} ms [${steps(marks)}] (room ${this.shell.ms.toFixed(0)}: ${steps(this.shell.steps)}; cave ${this.cave.ms.toFixed(0)}: ${steps(this.cave.steps)})`);
    const r = g.engine?.renderer;
    if (r && r.compileAsync) { try { await r.compileAsync(this.scene, this.camera); } catch (e) { console.warn(e); } }
    this.entered = true;
    loading.done();
    setTimeout(makeIcon, 1800);
  }

  /** A hello from Old Star when you come home after the lessons (not every time). */
  greet() {
    const st = this.game.state, star = this.star;
    if (!star?.rig || this.scripted || star.scripted || star.mode === 'sleep') return;
    const stage = this.lessonStage();
    if (stage !== 'done') {
      const lines = { pick: 'No pick, no digging. To my forge with you: we\'ll make yours.', mine: 'The cage is waiting. Down you go, and bring me that copper.', forge: 'The forge is hot and the copper\'s cold. Come on, E on the anvil.', cook: 'My stomach\'s rumbling. To the hearth!' };
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
      'Mind your head by the door. The rock dips. Sixty years I\'ve meant to chip it back.',
      'Small, isn\'t it? Dig out a bit more if you\'re staying. The soft rock\'s chalked.',
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
    this.roomMotes = []; // (dust turning in your room's lamplight)
    for (const l of sh.lightsM()) {
      if (['lamp', 'hanging', 'hearth', 'window', 'sconce'].includes(l.kind)) this.roomMotes.push(l);
      if (l.kind === 'sconce') this.addLight({ ...l, intensity: 0.45, distance: 2.6, flicker: 0.1, halo: 0.2, haloOpacity: 0.55, priority: 2 });
      else if (l.kind === 'hanging') this.addLight({ ...l, intensity: 0.6, distance: 3.0, flicker: 0.12, halo: 0.2, haloOpacity: 0.6, pool: 0.55, poolX: l.x, poolZ: l.z, poolOpacity: 0.14, priority: 2 });
      else if (l.kind === 'lamp') this.addLight({ ...l, intensity: 1.0, distance: 4.0, flicker: 0.08, halo: 0.26, haloOpacity: 0.6, pool: 0.95, poolX: l.x, poolZ: l.z, poolOpacity: 0.2, priority: 5 });
      else if (l.kind === 'window') this.addLight({ ...l, x: l.x + 0.05, intensity: 1.1, distance: 3.0, flicker: 0.06, speed: 0.4, halo: 0.42, haloOpacity: 0.3, hx: 0.02, pool: 0.55, poolX: 0.45, poolZ: l.z, poolOpacity: 0.16, priority: 3 });
      else if (l.kind === 'arch') this.addLight({ ...l, intensity: 0.6, distance: 2.6, flicker: 0.2, speed: 1.2, priority: 1 });
      else if (l.kind === 'hearth') this.addLight({ ...l, intensity: 1.35, distance: 4.2, flicker: 0.3, speed: 1.3, halo: 0.36, haloOpacity: 0.3, pool: 0.9, poolX: l.x, poolZ: l.z - 0.55, poolOpacity: 0.24, priority: 8 });
      else this.addLight({ ...l, intensity: 0.75, distance: 2.4, flicker: 0.18, halo: 0.16, haloOpacity: 0.55, pool: 0.4, poolOpacity: 0.14, priority: 1 });
    }
    for (const c of sh.hearth?.candles || []) this.glow.add({ kind: 'halo', x: c.x, y: c.y, z: c.z, w: 0.08, color: 0xffc070, opacity: 0.6 });
    for (const f of sh.fungi) this.addLight({ x: f.x * T, y: f.y * T, z: f.z * T, color: f.color, intensity: 0, real: false, halo: 0.22, haloOpacity: 0.28, pool: 0.32, poolOpacity: 0.12, flicker: 0.08, speed: 0.3 });
    for (const s of sh.strings || []) for (let i = 1; i < s.length - 1; i++) this.glow.add({ kind: 'halo', x: s[i].x * T, y: (s[i].y - 0.1) * T, z: s[i].z * T, w: 0.11, color: [0xffd060, 0xff8a6a, 0x9ae07a, 0x8ac8ff, 0xffa0d0, 0xfff0b0][i % 6], opacity: 0.32 });
  }

  /** The house's fires, lamps, candles, windows and glows. */
  addCaveLights() {
    this.lightSrcs = [];
    for (const l of this.cave.lights) {
      const o = { ...l, intensity: (l.intensity ?? 0) * 1.3 };
      if (o.pool) { o.poolX = l.poolX ?? l.x; o.poolZ = l.poolZ ?? l.z; o.poolY = l.poolY ?? this.cave.ground(o.poolX, o.poolZ) + 0.006; }
      const src = this.addLight(o);
      this.lightSrcs.push(src);
      if (l.kind === 'forge') this.forgeLight = src;
      if (l === this.cave.liftLantern) this.liftLight = src;
    }
    this.moteLights = this.lightSrcs.filter((l) => ['fire', 'forge', 'center', 'lantern', 'lamp', 'window', 'sconce', 'notes'].includes(l.kind));
    // the anvil's flash when Old Star strikes
    const af = this.cave.dyn.anvilFace;
    this.anvilFlash = this.addLight({ x: af.x, y: af.y + 0.1, z: af.z, color: 0xffc070, intensity: 0, distance: 1.8, flicker: 0, halo: 0.16, haloOpacity: 0.7, priority: 7 });
    this.wormHalos = [];
    // the hollow's firelight spilling round the corner into each alcove dug out (no lamp of your own
    // yet: the rock still reads, dim and warm by the way in, darker at the back)
    for (const id of this.nooks || []) {
      const n = NOOK[id];
      if (!n) continue;
      const cx = (n.rect[0] + n.rect[2]) * T / 2, cz = (n.rect[1] + n.rect[3]) * T / 2;
      const nx = (n.neck[0] + n.neck[2]) / 2, nz = (n.neck[1] + n.neck[3]) / 2;
      this.addLight({ x: nx + (cx - nx) * 0.7, y: HALL.y + 1.35, z: nz + (cz - nz) * 0.7, color: 0xffb27a, intensity: 0.9, distance: 3.8, flicker: 0.05, speed: 0.4, priority: 0 });
    }
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

  /** Your own things: the bedroll (sleep), the flat stone with your notebook (the Index Book), your trunk; the chalked soft rock. */
  addFixedInteractions() {
    const c = this.cave, mine = c.mine, br = c.dyn.bedroll;
    if (br) {
      this.bedroll = this.bedrollRec(br);
      const b = this.bedroll.bbox;
      this.addIt({ box: [b.min.x, 0, b.min.z, b.max.x, 0.32, b.max.z], label: 'Sleep', action: () => this.trySleep(this.bedroll) });
    }
    if (mine?.ledge) {
      const L = mine.ledge;
      this.addIt({ x: L.x, y: L.top + 0.04, z: L.z, r: 0.24, label: 'Write in the Index Book', action: () => { this.game.audio.play('page'); this.game.ui.openIndex(); } });
    }
    if (mine?.trunk) {
      const t = mine.trunk;
      this.addIt({ box: [t.x - 0.26, 0, t.z - 0.26, t.x + 0.26, 0.36, t.z + 0.26], label: 'Your trunk', action: () => { this.game.audio.play('creak', { vol: 0.4 }); this.game.ui.openInventory(); } });
    }
    this.addDigSpots?.();
  }

  /** The bedroll as the bed code wants it (living.js): a placed-piece look-alike in meters. */
  bedrollRec(br) {
    const obj = br.obj;
    obj.updateMatrixWorld(true);
    const yaw = br.yaw || 0, c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    const hw = 0.25 * c + 0.72 * s, hd = 0.25 * s + 0.72 * c;
    const bbox = new THREE.Box3(new THREE.Vector3(br.x - hw, 0, br.z - hd), new THREE.Vector3(br.x + hw, 0.2, br.z + hd));
    // you get up on the side toward the room, facing into it
    const side = br.inNook ? { x: br.x - 0.55, z: br.z + 0.1 } : { x: br.x + 0.25, z: br.z - 0.62 };
    const face = br.inNook ? { x: br.x - 2.2, z: br.z - 0.3 } : { x: SPOTS.anvil.x, z: SPOTS.anvil.z - 0.4 };
    return { bedroll: true, p: { uid: 'bedroll', id: 'bedroll', x: 0, y: 0, r: 0 }, res: { lie: br.lie }, obj, cx: br.x / T, cz: br.z / T, fw: 1, fd: 3, bbox, yaw, standAt: { x: side.x, z: side.z, face }, lie: br };
  }

  /** A bed you've placed in an alcove (sleeping there beats the bedroll), or null. */
  findPlacedBed() { for (const it of this.items.values()) if (FURNITURE[it.p.id]?.kind === 'bed') return it; return null; }

  // ------------------------------------------------------------ collision
  /** Is floor tile (tx, ty) out of your alcoves or under furniture? */
  tileBlocked(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.D) return true;
    if (!nookAt((tx + 0.5) * T, (ty + 0.5) * T, this.nooks || new Set(), false)) return true;
    return !!this.blockedTiles?.has(tx + ',' + ty);
  }

  /** Is (x, z) (m) in one of your alcoves (or the neck into it)? (It keeps its old name: your room.) */
  inBedroom(x, z) { return !!this.nooks && !!nookAt(x, z, this.nooks); }

  /** Floor height under (x, z) meters: one floor everywhere, or the lift cage. */
  floorY(x, z) {
    if (this.inCage({ x, z })) return HALL.y + (this.lift?.cageY || 0) * T;
    return HALL.y;
  }

  /** Is (x, z) (m) on open floor you can stand on? (The doorway and the old passage too, once open.) */
  onFloor(x, z) { return walkable(x, z) || (!!this.passage && (inPassage(x, z, 0.2) || inDoorway(x, 0.5, z) && Math.abs(x - FRONT.x) < 0.14)); }

  rebuildCollision() {
    const w = this.world;
    w.clear();
    // the cave's rock and floor (its own boxes), the low roof where a jump would reach it, the lift
    for (const b of this.cave.boxes) w.add(...b, 'cave');
    for (const b of this.roofBoxes()) w.add(...b, 'roof');
    for (const b of liftBoxes(this.gateShut)) w.add(...b, 'lift');
    if (this.passage) for (const b of passageBoxes()) w.add(...b, 'passage');
    // furniture in your alcoves
    this.blockedTiles = new Set();
    for (const rec of this.items.values()) {
      const f = FURNITURE[rec.p.id];
      if (!f || f.kind === 'rug' || f.kind === 'wall') continue;
      for (let y = rec.p.y; y < rec.p.y + rec.fd; y++) for (let x = rec.p.x; x < rec.p.x + rec.fw; x++) this.blockedTiles.add(x + ',' + y);
      const bb = rec.bbox;
      const h = clamp(bb.max.y, 0.45, 1.9);
      w.add(Math.max(rec.p.x * T, bb.min.x) + 0.02, 0, Math.max(rec.p.y * T, bb.min.z) + 0.02, Math.min((rec.p.x + rec.fw) * T, bb.max.x) - 0.02, h, Math.min((rec.p.y + rec.fd) * T, bb.max.z) - 0.02, rec.p.uid);
    }
    this.starBoxAt = null;
    this.moveStarBox?.();
    this.refreshStepMap();
    // Old Star finds his way round the new furniture too
    if (this.starGrid) this.buildStarGrid();
    // never leave the mole stuck inside something new
    if (this.rig && !this.scripted && !this.seat) this.unstick();
  }

  /** The roof where it's low enough to bump your head on (boxes, m: 0.25 m cells merged along x). */
  roofBoxes() {
    if (this._roof) return this._roof;
    const C = 0.25, out = [];
    const x0 = 0, x1 = SHAFT.x0, z0 = FRONT.z - 0.2, z1 = GRID.D * T + 0.2;
    for (let z = z0; z < z1; z += C) {
      let run = null;
      const flush = (xe) => { if (run) out.push([run.x, run.y, z, xe, run.y + 1.2, z + C]); run = null; };
      for (let x = x0; x <= x1; x += C) {
        const cx = x + C / 2, cz = z + C / 2;
        const ok = x < x1 && walkable(cx, cz) && !this.inCage({ x: cx, z: cz });
        const y = ok ? Math.round((ceilAt(cx, cz) - 0.05) * 20) / 20 : null;
        if (y !== null && y < HALL.y + 1.95) { if (run && Math.abs(run.y - y) < 0.01) continue; flush(x); run = { x, y }; } else flush(x);
      }
    }
    return (this._roof = out);
  }

  /** Push the mole out of anything solid (after furniture moved under it). */
  unstick() {
    const pl = this.rig.player;
    if (!pl.hitsAt(pl.pos.x, pl.pos.y, pl.pos.z)) return;
    for (let r = 0.1; r < 3; r += 0.1) for (let a = 0; a < 12; a++) {
      const x = pl.pos.x + Math.cos(a / 12 * Math.PI * 2) * r, z = pl.pos.z + Math.sin(a / 12 * Math.PI * 2) * r;
      if (!this.onFloor(x, z)) continue;
      const y = this.floorY(x, z);
      if (!pl.hitsAt(x, y, z)) { pl.pos.set(x, y, z); return; }
    }
  }

  /**
   * Every frame: something that moves (Old Star's box as he walks, sits up or is placed for a
   * lesson; a tame raptor's or the egg's box put back) may have come down on the mole, and the
   * mole's body can't walk out of a box it starts inside. Slide it out the shortest way along x or z
   * (a nudge as he shuffles past), or search round for room when it's boxed in.
   */
  pushOutOfBoxes() {
    const pl = this.rig?.player, w = this.world;
    if (!pl || !w || !pl.hitsAt(pl.pos.x, pl.pos.y, pl.pos.z)) return;
    const p = pl.pos, hw = PLAYER_HW, h = pl.h, e = 0.04; // (clear of the box by more than half a 1/16 m voxel)
    const cand = [];
    for (const b of w.boxes) {
      if (b.x1 <= p.x - hw || b.x0 >= p.x + hw || b.z1 <= p.z - hw || b.z0 >= p.z + hw || b.y1 <= p.y || b.y0 >= p.y + h) continue;
      cand.push([b.x1 + hw + e - p.x, 0], [b.x0 - hw - e - p.x, 0], [0, b.z1 + hw + e - p.z], [0, b.z0 - hw - e - p.z]);
    }
    cand.sort((a, b) => Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]));
    for (const [dx, dz] of cand) {
      if (Math.abs(dx + dz) > 0.7) break;
      const x = p.x + dx, z = p.z + dz;
      if (this.onFloor(x, z) && !pl.hitsAt(x, p.y, z)) { p.x = x; p.z = z; return; }
    }
    this.unstick();
  }

  /** Footstep sounds follow the floor under the mole (the cave is earth; what you've laid in your alcoves; rugs are soft). */
  refreshStepMap() {
    const floors = this.game.state.data.home.floor;
    this.stepMats = new Map();
    for (const [k, id] of Object.entries(floors)) this.stepMats.set(k, id === 'floor_plank' ? 'wood' : id === 'floor_dirt' || id === 'floor_moss' ? 'dirt' : id === 'floor_carpet' ? 'sand' : 'stone');
    for (const rec of this.items.values()) {
      if (FURNITURE[rec.p.id]?.kind !== 'rug') continue;
      for (let y = rec.p.y; y < rec.p.y + rec.fd; y++) for (let x = rec.p.x; x < rec.p.x + rec.fw; x++) this.stepMats.set(x + ',' + y, 'sand');
    }
  }

  stepMatAt(x, z) {
    if (this.inCage({ x, z })) return 'wood';
    const br = this.bedroll?.bbox;
    if (br && x > br.min.x && x < br.max.x && z > br.min.z && z < br.max.z) return 'sand';
    if (this.inBedroom(x, z) && z > 0) return this.stepMats?.get(Math.floor(x / T) + ',' + Math.floor(z / T)) || 'dirt';
    return 'dirt';
  }

  /** (Old: things on your room's floor that hid under furniture. The cave has none.) */
  refreshLoose() {}

  // ------------------------------------------------------------ furniture
  findKind(kind) {
    for (const it of this.items.values()) if (FURNITURE[it.p.id]?.kind === kind || it.p.id === kind) return it;
    if (kind === 'bed' || kind === 'bedroll') return this.bedroll || null; // (your bedroll on the floor)
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

  /** 1 in the camp with pt, less from your nook (sound round the corner). */
  sameRoomK(pt) {
    const p = this.rig?.player.pos;
    if (!p) return 1;
    // (the camp is one open hollow; your nook is round the corner up the steps)
    return this.inBedroom(p.x, p.z) && p.z > 0.6 ? 0.45 : 1;
  }

  nearPointVol(pt, range, vol) {
    if (!this.rig || !pt) return 0;
    const p = this.rig.player.pos, d = Math.hypot(pt.x - p.x, pt.z - p.z);
    return d < range ? vol * (1 - d / range) : 0;
  }

  ctxFor(p) {
    const d = this.game.state.data;
    const pl = d.home.planters[p.uid];
    return { planter: pl ? { ...pl, ready: pl.ready || pl.day < d.day } : null, items: ITEMS, weapons: d.weapons, state: this.game.state };
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
    for (const rec of this.items.values()) {
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
    if (from === 'bed' || from === 'faint' || from === 'sleep') { const s = this.bedStand(this.findKind('bed')); if (s) spot = s; }
    if (from === 'forge') spot = { x: SPOTS.anvil.x + 0.7, z: SPOTS.anvil.z + 0.75, face: { x: SPOTS.forge.x, z: SPOTS.forge.z } };
    if (from === 'cooking' || from === 'stove') spot = { x: SPOTS.fire.x - 0.75, z: SPOTS.fire.z - 0.35, face: { x: SPOTS.fire.x, z: SPOTS.fire.z } };
    if (from === 'lift') spot = { x: LIFT.cx, z: LIFT.cz, yaw: Math.PI / 2 };
    if (from === 'town' || from === 'tunnel') spot = this.doorOpen && from === 'town' ? { x: FRONT.x, z: this.cave.passage.z + 0.85, yaw: Math.PI } : { x: LIFT.outX - 0.2, z: LIFT.cz, yaw: Math.PI / 2 };
    // walked in from the town up the old passage: just where it left you, still walking
    const P = params.pose;
    if (from === 'passage' && P && this.passage && inPassage(P.x, P.z, 0.05)) {
      this.rig.place(P.x, P.y, P.z, P.yaw, P.pitch);
      this.rig.player.vel.set(P.vx || 0, P.vy || 0, P.vz || 0);
      if (P.crouch) { this.rig.player.crouched = true; this.rig.player.h = 0.5; }
      return;
    }
    if (from === 'passage') spot = { x: FRONT.x, z: FRONT.z + 0.85, yaw: Math.PI };
    // just dug an alcove: at the end of its neck, looking in
    if (from === 'dig' && NOOK[params.nook]) {
      const n = NOOK[params.nook], nk = n.neck;
      const x = (nk[0] + nk[2]) / 2, z = (nk[1] + nk[3]) / 2;
      spot = { x: x - n.dig.nx * 0.2, z: z - n.dig.nz * 0.2, face: { x: (n.rect[0] + n.rect[2]) / 2 * T, z: (n.rect[1] + n.rect[3]) / 2 * T } };
    }
    if (from === 'fall' || from === 'newgame') { const s = this.bedStand(this.findKind('bed')); if (s) spot = s; }
    // otherwise: in the middle of the hollow, looking at the forge
    if (!spot) spot = { x: 5.55, z: -1.75, face: { x: SPOTS.forge.x, z: SPOTS.forge.z } };
    if (spot.face) spot.yaw = Math.atan2(-(spot.face.x - spot.x), -(spot.face.z - spot.z));
    this.rig.place(spot.x, this.floorY(spot.x, spot.z), spot.z, spot.yaw ?? 0, -0.06);
    if (from !== 'lift') this.unstick();
  }

  /** Where you stand up beside a bed (the bedroll or a placed one): { x, z, face } in meters, or null. */
  bedStand(rec) {
    if (!rec) return null;
    if (rec.standAt) return { ...rec.standAt };
    const s = besideItem(this, rec);
    return s ? { x: s.x * T, z: s.z * T, face: { x: s.face.x * T, z: s.face.z * T } } : null;
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
  /** The decorate button: a small, quiet round chip with a chair (desktop: the X key beside it). */
  hammerBtn() {
    const b = el('button', { class: 'decorate-btn interactive', title: 'Build mode (X)', 'aria-label': 'Decorate', onclick: (e) => { e.stopPropagation(); this.toggleBuildHere(); } }, [
      (this.hammerImg = el('img', { class: 'pix', src: this.buildIconURL || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: '' })), el('span', { class: 'decorate-k' }, 'X'),
    ]);
    // in the HUD layer: above the "click to look around" catcher, so it works with a free mouse
    this.game.ui.hud.append(b);
    this.hammer = b;
  }

  /** Build mode from the hammer / X: it's your room you decorate, up the steps. */
  toggleBuildHere() {
    if (!this.build.active && !this.inBedroom(this.rig.player.pos.x, this.rig.player.pos.z)) {
      this.game.audio.play('ui_error', { vol: 0.5 });
      this.think(this.nooks?.size ? 'This is Old Star\'s hollow. I\'ll put my things in my own alcove.' : 'Nowhere of my own to put things yet. Old Star chalked a soft bit of rock for me to dig out…', 3.4);
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
    this.game.convo?.director?.apply(this.camera, dt); // cutscene talk camera (src/fx/director.js) [convo hook]
    this.build.update(dt);
    this.shell.hearth?.update?.(this.time);
    this.tickCave(dt);
    this.tickHouseLife(dt);
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
    if (this.star?.rig) this.star.update(dt);
    // never stuck inside Old Star (or anything else that moved onto the mole this frame)
    if (!this.scripted && !this.seat && !this.riding) this.pushOutOfBoxes();
    if (this.cloths) {
      const P = this.rig.player.pos, Y0 = HALL.y - 0.1, cols = [{ x: P.x, z: P.z, r: 0.26, y0: Y0, y1: Y0 + 1.2 }];
      if (this.star?.rig) cols.push({ x: this.star.pos.x, z: this.star.pos.z, r: 0.24, y0: Y0, y1: Y0 + 1.0 });
      this.cloths.update(dt, cols, this.time);
    }
    this.lift.update(dt, this.time);
    this.air?.update(dt, this.time);
    this.passage?.update(this.time);
    this.checkPassage();
    this.lights.update(dt, pl.x, pl.z);
    this.glow.update(this.camera);
    this.shadows.update(this.camera);
    this.fx.update(dt);
    this.updateAnchors();
    this.updateLoops();
  }

  /**
   * Up the old passage past its halfway mark: the town takes over (a seamless switch: the frame
   * holds while it's built, the mole keeps its place, heading and stride). src/home/passage.js
   */
  checkPassage() {
    if (!this.passage) return;
    // (out in the passage the markers over heads back in the hollow would float on its rock)
    this.hideQuestMarks = this.rig.player.pos.z < FRONT.z - 0.1;
    if (this.hideQuestMarks) this.game.prefetch?.('town');
    if (this.scripted || this.riding || this.handingOff || this.game.transitioning) return;
    const pl = this.rig.player, u = passageU(pl.pos.x, pl.pos.z);
    if (u === null || u <= SWAP.band) return;
    this.handingOff = true;
    this.build?.toggle(false);
    const pose = { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, yaw: pl.yaw, pitch: pl.pitch, vx: pl.vel.x, vy: pl.vel.y, vz: pl.vel.z, crouch: !!pl.crouched };
    this.game.state.flag('homeVisited', true);
    this.game.goto('town', { from: 'passage', pose }, { transition: 'seamless' }).finally(() => { this.handingOff = false; });
  }

  /** A glow-mote now and then over the glowing mushrooms in the damp corner. */
  tickAmbience(dt) {
    this.flyT = (this.flyT || 0) - dt;
    if (this.flyT <= 0) {
      this.flyT = 1.6;
      const p = this.rig.player.pos;
      if (Math.hypot(p.x - 2.66, p.z + 3.18) < 6) this.fx.firefly(2.66 + rand(-0.2, 0.2), 0.2 + rand(0, 0.35), -3.18 + rand(-0.2, 0.2), pick([[0.6, 1, 0.85], [0.45, 0.9, 1]]));
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
    // (nothing to see until enter() is done: the transition's black covers it, and a frame of the
    // half-built cave is pure cost while it loads)
    if (!this.rig || !this.entered) return;
    this.cull?.update(this.camera); // only the rooms in view (src/home/rooms.js)
    if (this.hidePaws) this.game.engine.render(this.scene, this.camera, this.post);
    else this.rig.render(this.post);
  }

  onResize(w, h) {
    if (this.rig) this.rig.onResize(w, h);
    if (this.fx && this.rig) this.fx.setPixelScale(h, this.rig.fov);
    this.wakeFx?.resize();
  }

  /** Where a named place is (meters), for the quest markers (src/core/questWhere.js). */
  questSpot(name) {
    const Y = HALL.y, S = SPOTS;
    const at = {
      lift: { x: LIFT.outX, y: Y + 1.0, z: LIFT.cz },
      passage: { x: FRONT.x, y: Y + 0.9, z: FRONT.z + 0.2 },
      town: { x: FRONT.x, y: Y + 0.9, z: FRONT.z - 0.6 },
      hole: { x: HOLE.x, y: Y + 2.2, z: HOLE.z },
      hearth: { x: S.fire.x, y: Y + 0.9, z: S.fire.z + 0.3 },
      forge: { x: S.anvil.x, y: Y + 0.9, z: S.anvil.z },
    };
    at.front = at.passage; at.fire = at.hearth; at.anvil = at.forge;
    return at[name] || null;
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
      /** Send Old Star to a place ('anvil' | 'bellows' | 'fire' | 'armchair' | 'board' | 'lift' | 'ruins' (his dream wall) | 'pool' (the sink) | 'books' | 'hearth' | 'cot'), instantly. */
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
      wakeFx() { const f = s.wakeFx; return f ? { open: +f.open.toFixed(2), blur: +f.blur.toFixed(2), drops: 0 } : null; },
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
      /** The alcoves dug out (ids). */
      nooks() { return [...(s.nooks || [])]; },
      /** Dig out an alcove right away (no cost, no cutscene) and build the cave again: resolves when home is back. */
      expand(id = 'nook_bed') { return s.digNook?.(id, { free: true, quick: true }); },
      spots: { cave: HALL, house: HALL, arch: ARCH, shaft: SHAFT, lift: LIFT, front: FRONT, hole: HOLE, rooms: ROOM, nooks: NOOKS, ...SPOTS },
      /**
       * Walk out of the door and up the old passage until the town takes over (holding W, as a
       * player does; the frames are stepped here). Resolves with the scene name it ends in.
       */
      async walkToTown(maxFrames = 400) {
        if (!s.passage) return 'no passage';
        const g = s.game, inp = g.input;
        if (s.scripted && !s.seat) s.endScript();
        s.rig.place(FRONT.x, s.floorY(FRONT.x, FRONT.z + 0.6), FRONT.z + 0.6, 0, -0.05);
        // the way: north up leg 1, west along the cross leg (steered by turning toward each mark)
        const marks = [[FRONT.x, -6.6], [SWAP.x - 0.6, -6.6]];
        let mi = 0;
        inp.down.add('KeyW');
        try {
          for (let i = 0; i < maxFrames && g.scene === s && !g.transitioning; i++) {
            const p = s.rig.player.pos, m = marks[Math.min(mi, marks.length - 1)];
            if (Math.hypot(m[0] - p.x, m[1] - p.z) < 0.25 && mi < marks.length - 1) mi++;
            s.rig.player.yaw = Math.atan2(-(m[0] - p.x), -(m[1] - p.z));
            await frame(1 / 30);
          }
        } finally { inp.down.delete('KeyW'); }
        return g.scene === s && !g.transitioning ? 'home' : g._target || g.sceneName;
      },
      /** Where the mole is, in the town's frame too (for the hand-off checks). */
      pose() { const p = s.rig.player.pos; return { x: p.x, y: p.y, z: p.z, yaw: s.rig.player.yaw, town: toTown(p.x, p.z), u: passageU(p.x, p.z) }; },
    };
  }

  exit() {
    this.gone = true;
    this.game.ui.setCrosshair?.(null);
    this.game.ui.setHints(null);
    this.game.ui.setTouchControls?.(true);
    this.game.canvas.style.filter = '';
    this.hammer?.remove();
    for (const n of document.querySelectorAll('.loot-fly')) n.remove();
    if (this.chest?.busy) this.game.ui.status?.pin?.(false);
    // the built house is kept for coming back (~80 MB of buffers): not on a phone or a small device,
    // where the mine needs the memory more than the house needs the seconds
    try { if ((navigator.deviceMemory || 8) <= 4 || matchMedia('(pointer: coarse)').matches) dropHouseCache(); } catch (e) { /* keep it */ }
    super.exit();
  }
}

// the lift and the passage (src/home/moves.js); living in your alcoves (living.js); the workshop
// (workshop.js); the lessons (lessons.js); waking up (wake.js); digging out alcoves (nookDig.js)
for (const M of [HomeMoves, HomeLiving, WorkshopLife, HouseLife, HomeLessons, HomeWake, NookDig]) {
  for (const k of Object.getOwnPropertyNames(M.prototype)) if (k !== 'constructor') Object.defineProperty(HomeScene.prototype, k, Object.getOwnPropertyDescriptor(M.prototype, k));
}
