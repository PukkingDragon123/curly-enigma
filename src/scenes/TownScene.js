// Deep Town in first person: a lantern-lit village in a great closed cavern. Strata walls with
// burrows and walkways, a dome roof of stalactites, crystals and glow-worms, a sunbeam pouring
// through a crack onto the Surface Express booth, shops tucked into the cliffs with counters and
// keepers, the assay office's brass scale, the plaza fountain, market stalls, a waterfall, the
// mine lift with Bramble at the crank, the back lanes with their mound houses, your burrow door,
// the boarded tunnel you escape through, and a crowd of townsfolk who look round, wave and chat.
// Built in town units under one scaled root (src/town/units.js); the mole walks in meters
// (FPSRig + BoxWorld, docs/FPS.md).
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { FPSRig, BoxWorld } from '../fps/FPSKit.js';
import { openLiftPanel, rideTo, liftState } from '../fps/lifts.js';
import { Actor, NuggetAI } from '../iso/Actor.js';
import { makeCharacter, makeChicken } from '../gfx/characters.js';
import { TOWN } from '../iso/townLayout.js';
import { paintTownFloor, floorMaterialAt } from '../iso/townFloor.js';
import { WATER_TIME } from '../iso/water.js';
import { SignSheet } from '../iso/atlas.js';
import { MESH_STATS } from '../iso/mesher.js';
import { VoxelGrid, M16 } from '../iso/kit.js';
import { SHOPS } from '../data/shops.js';
import { M, IM } from '../town/units.js';
import { TownBuilder } from '../town/build.js';
import { ceilingAt, ceilingInfo } from '../town/cave.js';
import * as ST from '../town/statics.js';
import { buildLift, PIT_DEPTH } from '../town/lift.js';
import { Particles, GlowBatch, Lights, ShadowBatch, fxUniforms, glowWorms } from '../town/fx.js';
import { Townsfolk } from '../town/folk.js';
import { TownQuests } from '../town/quests.js';
import { townLife } from '../town/life.js';
import { sunbeam } from '../town/sunbeam.js';
import { EscapeArrival } from '../town/arrival.js';
import { RigLOD } from '../town/lod.js';
import { KEEPER_MOODS, moodOf } from '../town/moods.js';
import { updatePatches, cullPatches, disposePatches } from '../town/batch.js';
import { pick, rand, chance, clamp, makeRng } from '../core/util.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _f = new THREE.Vector3();
const _proj = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
export const BRAMBLE = { name: 'Bramble', species: 'vole', age: 'elder', body: 'stocky', fur: 0x8a6a4a, outfit: 'overalls', outfitColor: 0x7a5a3a, hat: 'cap', hatColor: 0x3a5a3a, eyes: 'happy', brows: 'bushy', dirt: 0.6, seed: 31, blush: true, voice: 250 };
const BRAMBLE_LINES = [
  'Going down? Hop in, mind the gap.',
  'She creaks, but she has never dropped anyone. Twice.',
  'The deeper stops open once you have dug to the bottom of one.',
  'Bring me back something shiny, eh?',
  'Hold on to your helmet. And your chicken.',
];
const WELCOME_BACK = ['Welcome back up! Still got all your claws?', 'Back in one piece! Mostly dirt, though.', 'Up you come. Old Vex will want a look at that haul.'];
const NOTICES = ['LOST: one left mitten, ember-proof. Reward: a pie. — Dilly', 'BAND PRACTICE Thursdays at the fountain. Bring a spoon.', 'Please do NOT feed the glow-worms. — The Council', 'WANTED: brave digger for deep commissions. Ask Old Vex.', 'Mushroom swap, Sunday, back lane. No blue ones please.', 'Surface Express: ONE WAY ONLY. No refunds. No returns. No exceptions.'];
const KNOCK = ['(muffled) Not today, thank you!', '(muffled) Who\'s there? ...Oh, it\'s the new one!', '(muffled) Kettle\'s on! Come back later!', '(muffled) Zzz... wha? Go \'way...', '(muffled) If that\'s about the begonias, I didn\'t do it!'];
/** Grown-up extras for the keepers' looks (the shop data only names the basics). */
const KEEPER_LOOKS = {
  tools: { belt: 2, shirt: 0x9a3a32, rolled: true, boots: 0x4a2e1e, brows: 'bushy', dirt: 0.5 },
  grocer: { shirt: 0x6a8ab0, rolled: true, belt: 0, boots: false },
  furniture: { shirt: 0xd8ccb0, belt: 0, boots: 0x6a4a2a, rolled: true },
  blueprints: { belt: 0, boots: 0x3a2a22 },
  outfitter: { belt: 1, boots: 0x7a5232 },
  assay: { belt: 0, boots: 0x3a2a22, brows: 'bushy' },
  ticket: { belt: 0, boots: 0x1e1618 },
  lift: { shirt: 0xb84a3a, rolled: true, belt: 2, boots: 0x5a3a24 },
};
const EMOTE_COLORS = { '♥': '#e0404a', '!': '#c0402a', '?': '#3a6ac9', '♪': '#6a3a8a', '♫': '#6a3a8a', 'Zz': '#5a6a9a', '…': '#5a4030' };
let FLOOR_CACHE = null;

export default class TownScene extends Scene {
  async enter(params = {}) {
    const g = this.game, st = g.state;
    this.hud = 'deep';
    this.music = 'town';
    st.flag('lastScene', 'town');
    const from = params.from || 'home';
    this.from = from;
    if (from === 'escape') st.flag('escaped', true);
    liftState(st);
    this.post = { vignette: 0.42, saturation: 1.14, contrast: 1.06, outlineAlpha: 0.85, innerThresh: 0.25 };
    WATER_TIME.value = 0;
    // ---- the world: fog, the scaled town root, lights, effects
    this.fogCol = new THREE.Color(0x120e1a);
    this.scene.background = this.fogCol.clone();
    this.scene.fog = new THREE.FogExp2(this.fogCol, 0.03);
    this.root = new THREE.Group();
    this.root.scale.setScalar(M);
    this.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    this.U = fxUniforms();
    this.U.uFogCol.value.copy(this.fogCol);
    this.U.uFogDist.value = 26;
    this.world = new BoxWorld();
    this.lights = new Lights(this.scene, 8, 13);
    this.glow = new GlowBatch(this.root, this.U);
    this.particles = new Particles(this.root, this.U, 1100);
    this.shadowBatch = new ShadowBatch(this.root);
    this.scene.add(new THREE.HemisphereLight(0x9a90d0, 0x6a4a34, 1.5));
    const key = new THREE.DirectionalLight(0xffe2c8, 0.35);
    key.position.set(-4, 10, 6);
    this.scene.add(key);
    this.tickers = [];
    this.actors = [];
    this.anchors = new Map();
    this.loops = [];
    this.talks = [];
    this.locked = false;
    this.ceilingAt = ceilingAt;
    this.signs = new SignSheet(1024);
    this.B = new TownBuilder(this, TOWN.W, TOWN.H);
    // ---- statics
    if (params.meshlog) MESH_STATS.log = [];
    const t0 = performance.now();
    const steps = {};
    if (params.tstats) this.B.stats = [];
    this.noFolkLOD = this.noStaticLOD = !!params.nolod;
    if (params.l1gain) this.l1Gain = +params.l1gain;
    const run = (name, fn) => { const ts = performance.now(); this.B.tag = name; const r = fn(); steps[name] = Math.round(performance.now() - ts); return r; };
    const frames = run('cave', () => ST.buildCave(this));
    run('upper', () => ST.buildUpper(this, frames));
    run('roof', () => ST.buildRoof(this));
    run('shops', () => ST.buildShops(this));
    run('booth', () => ST.buildBooth(this));
    run('home', () => ST.buildHomeDoor(this));
    run('tunnel', () => ST.buildTunnel(this, from === 'escape'));
    run('lift', () => { this.lift = buildLift(this); ST.buildLiftYard(this); });
    run('rails', () => ST.buildRails(this));
    run('plaza', () => ST.buildPlaza(this));
    run('market', () => ST.buildMarket(this));
    run('decor', () => ST.buildDecor(this));
    run('sun', () => this.buildSunbeam());
    run('floor', () => this.buildFloor());
    const fin = run('merge', () => this.B.finish({ levels: [{ step: M / 16, fine: 0, minGain: this.l1Gain ?? 0.3 }, { step: M / 8, fine: M / 16 }, { step: M / 4, fine: M / 8 }] }));
    this.patches = fin.patches;
    this.blocks = fin.blocks;
    this.allStatics = fin.patches.flatMap((p) => (p.outline ? [p.mesh, p.outline] : [p.mesh])).concat(fin.blocks.map((b) => b.mesh).filter(Boolean));
    const sheet = this.signs.build();
    if (sheet) { fin.bake(sheet.geometry); this.scene.add(sheet); }
    this.map = this.B.map;
    this.worms = glowWorms(this.root, this.U, this.roofWorms || []);
    this.buildMs = performance.now() - t0;
    this.buildSteps = steps;
    if (MESH_STATS.log) { this.meshLog = MESH_STATS.log; MESH_STATS.log = null; }
    console.info(`[town] built in ${this.buildMs.toFixed(0)} ms ${JSON.stringify(steps)} mesher ${JSON.stringify({ calls: MESH_STATS.calls, ms: Math.round(MESH_STATS.ms), ktris: Math.round(MESH_STATS.tris / 1000) })}`);
    // ---- the mole
    this.rig = await new FPSRig(this, { world: this.world, fov: 74, reach: 2.1, stepMat: 'stone', lamp: 0.45 }).init();
    this.camera = this.rig.camera;
    this.rig.lampCol.setRGB(1.2, 0.95, 0.7);
    this.rig.ambient.setRGB(0.32, 0.28, 0.34);
    this.player = this.makePlayerProxy();
    /** Where townsfolk look when they look at the mole (world meters: the camera). */
    this.eyeTarget = new THREE.Vector3().copy(this.camera.position);
    // ---- people
    this.spawnKeepers();
    this.folk = new Townsfolk(this);
    this.folk.spawnAll();
    this.tickers.push((dt) => this.folk.update(dt));
    this.tickers.push((dt) => this.updateKeepers(dt));
    // quests part: who's who, quest talk, markers' anchors, the notice board (src/town/quests.js)
    this.townQuests = new TownQuests(this);
    this.tickers.push((dt) => this.townQuests.update(dt));
    if (st.flag('nugget')) this.spawnNugget();
    townLife(this);
    this.buildInteractions();
    if (!st.flag('homeVisited')) this.homeMarker = ST.makeHomeMarker(this);
    // ---- arrival
    const H = TOWN.home;
    if (from === 'escape') {
      this.arrival = new EscapeArrival(this);
      this.arrival.setup();
      this.arrival.run();
    } else if (from === 'lift' || from === 'mine') {
      this.arriveByLift();
    } else if (from === 'ending') {
      const S = TOWN.sun;
      this.place(S.x, S.z + 0.4, Math.PI * 0.8);
    } else {
      // out of the burrow door, looking down the street toward the plaza and the sunbeam
      this.place(H.spawn.x, H.spawn.z + 0.3, Math.PI + 0.62);
      if (this.nugget) this.nugget.pos.set(H.spawn.x + 0.7, 0, H.spawn.z + 0.7);
      if (from === 'home') g.audio.play('door');
    }
    // ---- sound
    const P = this.player;
    this.ambientLoop('water', () => 0.3 * clamp(1 - Math.hypot(P.x - TOWN.fountain.x, P.z - TOWN.fountain.z) / 9, 0, 1));
    this.ambientLoop('water', () => 0.42 * clamp(1 - Math.hypot(P.x - TOWN.falls.x, P.z - TOWN.falls.z) / 10, 0, 1), { intensity: 1 });
    g.ui.setRadar?.(null);
    g.ui.setDepth?.(null);
    g.ui.setBag?.(null);
    this.own(() => { for (const l of this.loops) if (l.h) l.h.stop(0.1); });
    // keepers react to what changes hands across their counters
    this.own(st.on('gold', (e) => { if (this.shopKeeper && e && e.delta) this.keeperDeal(e.delta); }));
    this.own(st.on('act', (e) => { if (this.shopKeeper && e && (e.type === 'buy' || e.type === 'sell')) this.keeperDeal(e.type === 'buy' ? -(e.gold || 1) : (e.gold || 1)); }));
    this.debug = this.makeDebug();
    await this.warmShaders();
  }

  async warmShaders() {
    const r = this.game.engine?.renderer;
    if (!r || !r.compileAsync) return;
    try { await r.compileAsync(this.scene, this.camera); } catch (e) { console.warn(e); }
  }

  // ------------------------------------------------------------ building helpers
  /** A light source (TU): real point light (pooled), glow halo, floor pool, baked into the statics. */
  addLight(o) {
    const src = this.lights.add(o);
    src.extras = [];
    if (o.pool) src.extras.push(this.glow.add({ kind: 'pool', x: o.poolX ?? o.x, y: o.poolY ?? 0.035, z: o.poolZ ?? o.z, w: o.pool * 2, h: o.pool * 2, color: o.poolColor ?? o.color, opacity: o.poolOpacity ?? 0.32, src }));
    if (o.halo) src.extras.push(this.glow.add({ kind: 'halo', x: o.hx ?? o.x, y: o.hy ?? o.y, z: o.hz ?? o.z, w: o.halo, color: o.haloColor ?? o.color, opacity: o.haloOpacity ?? 0.5, src }));
    if (o.bake !== false && this.B) this.B.bakeLight(o);
    return src;
  }

  removeLight(src) {
    if (!src) return;
    this.lights.remove(src);
    for (const e of src.extras || []) this.glow.remove(e);
    src.extras = [];
  }

  buildFloor() {
    const { W, H } = TOWN;
    if (!FLOOR_CACHE) FLOOR_CACHE = { tex: paintTownFloor({ shadows: this.B.shadows }) };
    const t = this.floorTex = FLOOR_CACHE.tex;
    t.map.minFilter = THREE.NearestMipmapNearestFilter;
    t.map.generateMipmaps = true;
    t.map.needsUpdate = true;
    const L = TOWN.lift;
    const hole = (x, z) => x >= L.cage.x - 1 && x < L.cage.x + 1 && z >= L.cage.z - 1 && z < L.cage.z + 1;
    const pos = [], uv = [], nor = [], idx = [];
    let v = 0;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (hole(x, z)) continue;
      for (const [dx, dz] of [[0, 0], [0, 1], [1, 1], [1, 0]]) { pos.push(x + dx, 0, z + dz); uv.push((x + dx) / W, (z + dz) / H); nor.push(0, 1, 0); }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.MeshPhongMaterial({ map: t.map, normalMap: t.normalMap, specularMap: t.specularMap, specular: 0x8a7e70, shininess: 24 });
    this.root.add(new THREE.Mesh(geo, mat));
    // the lift pit's floor, far down in the dark
    const pitFloor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x050304 }));
    pitFloor.position.set(L.cage.x, -PIT_DEPTH + 0.05, L.cage.z);
    this.root.add(pitFloor);
    this.pitFloor = pitFloor;
  }

  buildSunbeam() {
    const info = ceilingInfo(), S = TOWN.sun;
    const top = new THREE.Vector3(info.sun.x, ceilingAt(info.sun.x + 0.6, info.sun.z + 0.6) + 2.5, info.sun.z);
    const bottom = new THREE.Vector3(S.x, -0.05, S.z);
    const b = sunbeam(top, bottom, 1.1, 2.3);
    this.root.add(b.mesh);
    this.beamFx = b;
    this.beam = { x0: bottom.x, y0: 0.2, z0: bottom.z, x1: top.x, y1: top.y - 3, z1: top.z };
    this.glow.add({ kind: 'pool', x: S.x, y: 0.04, z: S.z, w: S.r * 2.8, h: S.r * 2.5, color: 0xfff0b0, opacity: 0.55 });
    this.glow.add({ kind: 'halo', x: info.sun.x, y: top.y - 3.5, z: info.sun.z, w: 3.2, color: 0xfff6d0, opacity: 0.5 });
    this.B.addStatic(sunPatchAt(S));
    this.addLight({ x: S.x, y: 3.2, z: S.z, color: 0xfff0d0, intensity: 7, distance: 6, flicker: 0, real: true, priority: 4, bakePower: 1.2, bakeRadius: 3.6 });
  }

  // ------------------------------------------------------------ actors, talk, bubbles
  makePlayerProxy() {
    const rig = this.rig;
    return {
      pos: new THREE.Vector3(), radius: 0.22 * IM, collide: true, speedNow: 0, key: 'town-me', voice: 280,
      rig: { facing: 0 },
      get x() { return this.pos.x; }, get z() { return this.pos.z; },
      dist(x, z) { return Math.hypot(x - this.pos.x, z - this.pos.z); },
      headPos(out) { return out.copy(rig.player.pos).multiplyScalar(IM).setY(rig.player.pos.y * IM + 1.4); },
    };
  }

  syncPlayerProxy() {
    const p = this.player, pl = this.rig.player;
    p.pos.set(pl.pos.x * IM, pl.pos.y * IM, pl.pos.z * IM);
    p.rig.facing = pl.yaw + Math.PI;
    p.speedNow = Math.hypot(pl.vel.x, pl.vel.z) * IM;
  }

  /** Put the mole at TU (x, z) facing yaw (0 looks north, π south). */
  place(x, z, yaw = 0, pitch = 0) {
    this.rig.place(x * M, 0.001, z * M, yaw, pitch);
    this.syncPlayerProxy();
  }

  addActor(a) {
    this.root.add(a.obj);
    this.actors.push(a);
    // blob shadows are drawn in one batch (ShadowBatch), not one mesh each
    a.shadowSize = a.shadow.scale.x;
    a.shadowOn = true;
    a.shadow.visible = false;
    a.shadow.removeFromParent();
    return a;
  }

  /** Something to chat with: a sphere on the actor's chest that follows it (made in buildInteractions). */
  addTalk(actor, label, action, o = {}) {
    const t = { actor, label, action, r: o.r ?? 0.42, item: null };
    this.talks.push(t);
    if (this.rig && this.talkItemsBuilt) this.makeTalkItem(t);
    return t;
  }

  near(x, z, r) { const p = this.player; return (p.x - x) ** 2 + (p.z - z) ** 2 < r * r; }

  /** Is an actor's head in front of the camera and not too far? */
  inView(a) {
    const cam = this.rig.camera;
    a.headPos(_v).multiplyScalar(M);
    _w.copy(_v).sub(cam.position);
    if (_w.length() > 14) return false;
    cam.getWorldDirection(_f);
    return _w.dot(_f) > 0.25 * _w.length();
  }

  say(actor, html, o = {}) {
    const ui = this.game.ui;
    ui.hideBubble(actor.key);
    const emote = !!o.emote;
    const s = this.bubbleAt(actor, emote);
    ui.bubble(actor.key, html, s.x, s.y, { emote, life: o.life ?? 3.4, name: o.name ?? null });
    ui.moveBubble(actor.key, s.x, s.y, s.visible);
    this.anchors.set(actor.key, actor);
    if (!emote && o.babble !== false) {
      actor.headPos(_v);
      const d = Math.hypot(_v.x - this.player.x, _v.z - this.player.z);
      if (d < 9) this.game.audio.play('babble', { pitch: o.voice ?? actor.voice, n: clamp(Math.round(html.length / 9), 2, 8) });
      if (actor.rig?.talk) actor.rig.talk(Math.min(2.6, 0.6 + html.length / 28));
      // say it with a face (o.mood, or a reading of the line), held a little past the words
      if (actor.rig?.setExpression && o.mood !== false) actor.rig.setExpression(o.mood || moodOf(html), { hold: Math.max(2.2, (o.life ?? 3.4) * 0.8) });
    }
  }

  emote(actor, sym, o = {}) {
    const col = o.color || EMOTE_COLORS[sym] || '#2a1a12';
    this.say(actor, `<span style="color:${col}">${sym}</span>`, { emote: true, life: o.life ?? 1.5, babble: false });
    if (o.sound) this.game.audio.play('emote', { kind: o.sound });
  }

  /** Screen spot for a bubble above an actor's head (hidden when it's behind the mole or far away). */
  bubbleAt(actor, emote) {
    const cam = this.rig.camera, e = this.game.engine;
    actor.headPos(_v).multiplyScalar(M);
    _v.y += 0.06;
    _w.copy(_v).sub(cam.position);
    const d = _w.length();
    cam.getWorldDirection(_f);
    const front = _w.dot(_f) > 0.15 * d;
    const s = e.toScreen(_v, cam);
    const W = e.width * e.scale, H = e.height * e.scale;
    s.visible = front && d < (emote ? 7 : 9.5) && s.x > -40 && s.x < W + 40 && s.y > -20 && s.y < H + 60;
    // hidden behind a wall, a stall or the fountain (keepers stand inside their shops: skip them)
    if (s.visible && !actor.indoors && d > 1.2) {
      _f.copy(_w).normalize();
      const hit = this.world.raycast(cam.position.x, cam.position.y, cam.position.z, _f.x, _f.y, _f.z, d);
      if (hit && hit.dist < d - 0.35 && hit.box.tag !== 'lid') s.visible = false;
    }
    const half = emote ? 24 : Math.min(150, W * 0.2);
    s.x = Math.max(half + 6, Math.min(W - half - 6, s.x));
    s.y = Math.max(70, Math.min(H - 10, s.y));
    return s;
  }

  updateAnchors() {
    const ui = this.game.ui;
    for (const [key, a] of this.anchors) {
      const b = ui.bubbles.get(key);
      if (!b) { this.anchors.delete(key); continue; }
      const s = this.bubbleAt(a, b.node.classList.contains('emote'));
      ui.moveBubble(key, s.x, s.y, s.visible);
    }
  }

  // ------------------------------------------------------------ timers
  later(secs, fn) {
    let t = 0;
    const tick = (dt) => { t += dt; if (t >= secs) { this.tickers.splice(this.tickers.indexOf(tick), 1); fn(); } };
    this.tickers.push(tick);
  }
  sleepFor(secs) { return new Promise((res) => this.later(secs, res)); }
  tween(secs, fn) {
    return new Promise((res) => {
      let t = 0;
      fn(0);
      const tick = (dt) => {
        t += dt;
        const k = Math.min(1, t / secs);
        fn(k);
        if (k >= 1) { this.tickers.splice(this.tickers.indexOf(tick), 1); res(); }
      };
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

  // ------------------------------------------------------------ keepers
  spawnKeepers() {
    this.keepers = [];
    const mk = (id, spec, pos, yaw, label) => {
      const rig = makeCharacter({ seed: 9, eyes: 'bead', dirt: 0.2, blush: true, ...KEEPER_LOOKS[id], ...spec, hat: spec.hat || 'none', glasses: spec.glasses || false });
      const a = new Actor(rig, { x: pos.x, z: pos.z, yaw, name: spec.name, voice: spec.voice, radius: 0.27 });
      a.body.position.y = pos.y || 0;
      // grown-up keepers: stand so the eyes sit in the upper part of the serving window
      const win = this.shopInfo[id]?.win;
      if (win && rig.anchors) {
        const eye = rig.hip.position.y + rig.neck.position.y + rig.anchors.eyes.y;
        const want = win[1] + (win[4] - win[1]) * 0.6;
        a.body.position.y = Math.max((pos.y || 0) - 0.5, Math.min((pos.y || 0) + 0.2, want - eye));
      }
      a.collide = false;
      a.indoors = true;
      this.addActor(a);
      a.shadowOn = !pos.y;
      const k = { id, a, spec, home: { x: pos.x, z: pos.z, yaw }, armed: true, cool: 0, lookT: rand(1, 4), label, faces: KEEPER_MOODS[id] || KEEPER_MOODS.grocer };
      rig.setMood(k.faces.mood);
      this.keepers.push(k);
      return k;
    };
    for (const s of TOWN.shops) {
      const info = this.shopInfo[s.id];
      const sh = SHOPS[s.id];
      mk(s.id, sh.keeper, info.keeper, info.yaw, s.id === 'assay' ? `Sell to ${sh.keeper.name}` : `Shop at ${sh.name}`);
    }
    mk('ticket', SHOPS.ticket.keeper, this.shopInfo.ticket.keeper, 0, 'Surface Express tickets');
    const L = TOWN.lift;
    this.bramble = mk('lift', BRAMBLE, { x: L.op.x, z: L.op.z }, Math.PI / 2 - 0.4, 'Ride the lift');
    this.bramble.a.collide = true;
    this.bramble.a.indoors = false;
  }

  useKeeper(k, direct = false) {
    if (this.locked) return null;
    if (!direct && this.townQuests?.keeper(k)) return null; // news about work first (quests part)
    const p = this.player;
    k.a.faceToward(p.x, p.z);
    k.a.rig.doEmote('wave', 0.9);
    k.a.rig.setExpression(k.faces.greet, { hold: 2.5 });
    k.a.rig.lookAt(this.eyeTarget);
    k.armed = false;
    k.cool = 25;
    if (k.id === 'lift') { this.openLift(); return null; }
    this.game.audio.play('babble', { pitch: k.spec.voice, n: 3 });
    this.shopKeeper = k;
    k.a.rig.talk(1.6);
    const h = this.game.ui.openShop(k.id);
    Promise.resolve(h).then((panel) => {
      // when the shop closes: a wave goodbye (pleased if you bought something)
      const done = () => { if (this.shopKeeper === k) this.shopKeeper = null; k.a.rig.setExpression(k.sold ? 'happy' : 'neutral', { hold: 2 }); if (k.sold) k.a.rig.doEmote('wave', 1); k.sold = 0; };
      const prev = panel?.onClose;
      if (panel && 'onClose' in panel) panel.onClose = () => { prev?.(); done(); };
      else this.watchShopClose(k, done);
    }).catch(() => {});
    return h;
  }

  /** Fallback for shop panels without an onClose hook: poll until no panel is open. */
  watchShopClose(k, done) {
    const tick = () => { if (!this.game.ui.isPanelOpen()) { this.tickers.splice(this.tickers.indexOf(tick), 1); done(); } };
    this.tickers.push(tick);
  }

  /** Money changed hands while a shop was open: the keeper reacts (a buy, a sale, a big one). */
  keeperDeal(delta) {
    const k = this.shopKeeper;
    if (!k || !delta) return;
    if (this.time - (this.lastDealT ?? -9) < 0.3) return; // a gold change and an 'act' for the same deal
    this.lastDealT = this.time;
    const big = Math.abs(delta) >= 500;
    const face = big ? k.faces.big : delta < 0 ? k.faces.buy : (k.faces.sell || 'happy');
    k.sold = (k.sold || 0) + 1;
    k.a.rig.setExpression(face, { hold: big ? 3 : 2.2 });
    if (face === 'laugh' || face === 'happy') k.a.rig.doEmote('hop', 0.6);
    else if (face === 'surprised') k.a.rig.doEmote('hop', 0.4);
    k.a.rig.talk(1.2);
    this.game.audio.play('babble', { pitch: k.spec.voice, n: 2 });
  }

  updateKeepers(dt) {
    const p = this.player;
    for (const k of this.keepers) {
      const a = k.a;
      const d = a.dist(p.x, p.z);
      k.cool -= dt;
      if (d < 4.4 && !this.locked) {
        a.faceToward(p.x, p.z);
        if (!a.rig.lookTarget) a.rig.lookAt(this.eyeTarget);
        if (k.armed && d < 3.4 && this.inView(a)) {
          k.armed = false;
          k.cool = 25;
          const lines = k.id === 'lift' ? BRAMBLE_LINES : SHOPS[k.id].lines;
          const line = pick(lines);
          this.say(a, line, { name: k.spec.name, voice: k.spec.voice, life: 4.5, mood: chance(0.5) ? k.faces.greet : moodOf(line) });
          if (chance(0.5)) a.rig.doEmote('wave', 1);
        }
      } else {
        if (a.rig.lookTarget && this.shopKeeper !== k) a.rig.lookAt(null);
        k.lookT -= dt;
        if (k.lookT <= 0) {
          k.lookT = rand(2, 5);
          a.rig.face(k.home.yaw + rand(-0.7, 0.7));
          if (chance(0.12)) a.rig.doEmote(pick(['nod', 'wave']), 1);
        }
        if (d > 6 && k.cool <= 0) k.armed = true;
      }
    }
  }

  // ------------------------------------------------------------ Nugget
  spawnNugget() {
    const st = this.game.state;
    const a = new Actor(makeChicken(), { x: TOWN.home.spawn.x + 0.6, z: TOWN.home.spawn.z + 0.6, name: st.data.chicken?.name || 'Nugget', voice: 620, radius: 0.17, headY: 0.68, shadow: 0.4 });
    this.nugget = this.addActor(a);
    this.nuggetAI = new NuggetAI(a, this);
    this.addTalk(a, `Pet ${a.name}`, () => this.petNugget(), { r: 0.34 });
  }

  petNugget() {
    const st = this.game.state, d = st.data, n = this.nugget;
    if (d.chicken) { d.chicken.pets = (d.chicken.pets || 0) + 1; d.chicken.lastPetDay = d.day; }
    st.dirty = true;
    this.game.audio.play('cluck', { n: 2, pitch: 1.15, gap: 0 });
    this.emote(n, '♥', { sound: 'love' });
    this.nuggetAI.petted();
    n.faceToward(this.player.x, this.player.z);
    this.particles.hearts(n.x, 0.7, n.z);
  }

  // ------------------------------------------------------------ interactions (crosshair + E)
  buildInteractions() {
    const rig = this.rig;
    const boxM = (b) => b.map((v) => v * M);
    // shops: the serving window and the keeper behind it
    for (const k of this.keepers) {
      if (k.id === 'lift') continue;
      const info = this.shopInfo[k.id];
      k.item = rig.add({ box: boxM(info.win), label: k.label, reach: 2.4, enabled: () => !this.locked, action: () => this.useKeeper(k) });
    }
    // the lift: the cage, and Bramble at the crank
    const c = TOWN.lift.cage;
    rig.add({ box: boxM([c.x - 1.0, 0, c.z - 0.6, c.x + 1.0, 2.3, c.z + 1.2]), label: 'Ride the lift', reach: 2.4, enabled: () => !this.locked, action: () => this.openLift() });
    // the burrow door
    rig.add({ box: boxM(this.homeDoor.box), label: 'Go home', reach: 2.2, enabled: () => !this.locked, action: () => this.goHome() });
    // the fountain, the well, the notice board, the sunbeam, the old tunnel
    const F = TOWN.fountain;
    // the basin only (a flat box, not a big sphere), so the folk on the benches round it can be talked to
    rig.add({ box: boxM([F.x - F.r - 0.1, 0, F.z - F.r - 0.1, F.x + F.r + 0.1, 0.85, F.z + F.r + 0.1]), label: 'Toss a coin in (1 G)', reach: 1.6, enabled: () => !this.locked, action: () => this.tossCoin() });
    rig.add({ x: this.well.x * M, y: 0.6 * M, z: this.well.z * M, r: 0.75 * M, label: 'Peer into the well', reach: 1.6, action: () => this.peerWell() });
    rig.add({ x: 11.6 * M, y: 1.3 * M, z: 13.9 * M, r: 0.8 * M, label: 'Read the notices', reach: 1.9, action: () => this.readNotice() });
    const S = TOWN.sun;
    rig.add({ x: S.x * M, y: 0.1, z: S.z * M, r: S.r * 0.8 * M, label: 'Stand in the sunlight', reach: 2.0, enabled: () => !this.locked, action: () => this.bask() });
    const Tu = TOWN.tunnel;
    rig.add({ box: boxM([Tu.cx - 0.9, 0, TOWN.northFace - 0.6, Tu.cx + 0.9, 2.0, TOWN.northFace + 0.5]), label: 'Peer into the old tunnel', reach: 2, enabled: () => !this.locked && (!this.arrival || this.arrival.done), action: () => this.peerTunnel() });
    for (const seat of this.benchSeats || []) rig.add({ x: seat.x * M, y: 0.3 * M, z: seat.z * M, r: 0.32 * M, label: 'Sit on the bench', reach: 1.6, enabled: () => !this.locked && !this.seat, action: () => this.sit(seat) });
    for (const d of this.houseDoors || []) rig.add({ x: d.x * M, y: 0.8 * M, z: d.z * M, r: 0.6 * M, label: 'Knock', reach: 1.8, action: () => this.knock(d) });
    // people: spheres on their chests that follow them
    for (const t of this.talks) this.makeTalkItem(t);
    this.talkItemsBuilt = true;
    const br = this.bramble;
    this.brambleItem = rig.add({ x: 0, y: 0, z: 0, r: 0.42 * M, label: 'Bramble: ride the lift', reach: 2.2, enabled: () => !this.locked, action: () => this.useKeeper(br) });
  }

  makeTalkItem(t) {
    t.item = this.rig.add({ x: 0, y: -9, z: 0, r: t.r * M, label: typeof t.label === 'function' ? t.label() : t.label, reach: 2.0, enabled: () => !this.locked, action: () => t.action() });
  }

  updateTalkItems() {
    for (const t of this.talks) {
      const a = t.actor, it = t.item;
      if (!it) continue;
      it.x = a.pos.x * M; it.z = a.pos.z * M;
      it.y = (a.pos.y + a.body.position.y + a.headY * 0.6) * M;
    }
    const b = this.bramble.a;
    this.brambleItem.x = b.pos.x * M; this.brambleItem.z = b.pos.z * M; this.brambleItem.y = (b.headY * 0.6) * M;
  }

  // ------------------------------------------------------------ the lift
  openLift() {
    if (this.locked) return null;
    this.bramble.a.faceToward(this.player.x, this.player.z);
    this.game.audio.play('babble', { pitch: BRAMBLE.voice, n: 4 });
    return openLiftPanel(this.game, 'town', { sub: '<b>Bramble:</b> Where to, digger?', onRide: (id) => this.rideLift(id) });
  }

  /** The ride down: the gate opens, the mole steps in, the gate shuts, down into the dark. */
  async rideLift(id) {
    if (this.locked) return;
    const st = this.game.state, c = TOWN.lift.cage, au = this.game.audio;
    st.learn('elevator');
    this.locked = true;
    this.say(this.bramble.a, pick(['Hold on tight!', 'Down she goes!', 'Mind your whiskers!']), { name: 'Bramble', voice: BRAMBLE.voice });
    au.play('bell');
    await this.tween(0.45, (k) => this.lift.gateOpen(k));
    au.play('gate');
    // step into the cage and turn round to face the gate
    const pl = this.rig.player;
    const x0 = pl.pos.x * IM, z0 = pl.pos.z * IM, yaw0 = pl.yaw, p0 = pl.pitch;
    const tx = c.x, tz = c.z - 0.05;
    this.cut = { pos: new THREE.Vector3(x0, 0, z0), yaw: yaw0, pitch: p0 };
    const n = this.nugget;
    if (n) { this.nuggetAI.mode = 'petted'; this.nuggetAI.pettedT = 99; n.collide = false; n.scripted = true; }
    const nx0 = n?.x, nz0 = n?.z;
    await this.tween(1.0, (k) => {
      const e = k * k * (3 - 2 * k);
      this.cut.pos.set(x0 + (tx - x0) * e, 0, z0 + (tz - z0) * e);
      this.cut.yaw = lerpAngle(yaw0, Math.PI, e);
      this.cut.pitch = p0 * (1 - e) - 0.08 * e;
      if (n) n.pos.set(nx0 + (tx + 0.5 - nx0) * e, 0, nz0 + (tz - 0.35 - nz0) * e);
    });
    await this.tween(0.45, (k) => this.lift.gateOpen(1 - k));
    au.play('gate');
    this.bramble.a.rig.play('dig');
    const loop = au.loop('elevator', { vol: 0.45 });
    await this.sleepFor(0.25);
    let gone = false;
    await this.tween(2.4, (k) => {
      const y = -k * k * 7;
      this.lift.setY(y);
      this.cut.pos.y = y;
      if (n) n.pos.y = y;
      this.lift.crank.wheel.children[0].rotation.z = k * 12;
      this.rig.shake(0.06);
      if (!gone && k > 0.6) { gone = true; this.leaving = true; rideTo(this.game, id); }
    });
    loop.stop(0.3);
  }

  /** Arriving by lift: the cage rises out of the pit, the gate opens, the mole steps out. */
  async arriveByLift() {
    const L = TOWN.lift, c = L.cage, au = this.game.audio;
    this.locked = true;
    this.place(c.x, c.z - 0.05, Math.PI);
    this.cut = { pos: new THREE.Vector3(c.x, -5, c.z - 0.05), yaw: Math.PI, pitch: 0.05 };
    const n = this.nugget;
    if (n) { this.nuggetAI.mode = 'petted'; this.nuggetAI.pettedT = 99; n.collide = false; n.scripted = true; }
    const set = (y) => { this.lift.setY(y); this.cut.pos.y = y; if (n) n.pos.set(c.x + 0.5, y, c.z - 0.35); };
    set(-5);
    this.lift.gateOpen(0);
    this.bramble.a.rig.play('dig');
    await this.sleepFor(0.2);
    const loop = au.loop('elevator', { vol: 0.45 });
    await this.tween(2.0, (k) => { const e = 1 - (1 - k) * (1 - k); set(-5 * (1 - e) + 0.07 * e); this.lift.crank.wheel.children[0].rotation.z = -k * 10; });
    loop.stop(0.2);
    await this.tween(0.3, (k) => set(0.07 * (1 - k)));
    set(0);
    au.play('clunk');
    au.play('bell');
    this.rig.shake(0.3);
    this.bramble.a.rig.play('idle');
    await this.tween(0.45, (k) => this.lift.gateOpen(k));
    au.play('gate');
    this.say(this.bramble.a, pick(WELCOME_BACK), { name: 'Bramble', voice: BRAMBLE.voice });
    // step out onto the deck
    const z0 = this.cut.pos.z, z1 = L.front.z + 0.25;
    await this.tween(0.8, (k) => { const e = k * k * (3 - 2 * k); this.cut.pos.z = z0 + (z1 - z0) * e; if (n) n.pos.set(c.x + 0.5 + e * 0.4, 0, c.z - 0.35 + (z1 + 0.6 - c.z) * e); });
    this.place(c.x, z1, this.cut.yaw, this.cut.pitch);
    this.cut = null;
    if (n) { n.collide = true; n.scripted = false; this.nuggetAI.mode = 'follow'; }
    this.locked = false;
    this.tween(0.45, (k) => this.lift.gateOpen(1 - k)).then(() => au.play('gate'));
  }

  // ------------------------------------------------------------ other interactions
  goHome() {
    if (this.locked) return;
    this.locked = true;
    this.game.state.flag('homeVisited', true);
    this.game.audio.play('door');
    this.game.goto('home', { from: 'town' }, { transition: 'iris', center: [0.5, 0.5] });
  }

  tossCoin() {
    const st = this.game.state, F = TOWN.fountain, p = this.player;
    if (!st.spend(1, 'wish')) { this.game.audio.play('ui_error'); return; }
    this.game.audio.play('coins');
    const eyeY = this.rig.eye().y * IM;
    const dx = F.x - p.x, dz = F.z - p.z, d = Math.hypot(dx, dz) || 1;
    const tx = p.x + (dx / d) * Math.max(0.6, d - 1.2), tz = p.z + (dz / d) * Math.max(0.6, d - 1.2);
    const T = 0.7, y0 = eyeY - 0.25, yT = this.fountainInfo?.basinY ?? 0.45;
    const vy = (yT - y0 + 0.5 * 5 * T * T) / T;
    this.particles.spawn({
      x: p.x + (dx / d) * 0.3, y: y0, z: p.z + (dz / d) * 0.3, vx: (tx - p.x) / T, vz: (tz - p.z) / T, vy, grav: 5, life: T, size: 2.6, color: 0xffe070, alpha: 1, alpha2: 1, add: true, blink: 30,
      fn: (q) => {
        if (Math.random() < 0.5) this.particles.spawn({ x: q.x, y: q.y, z: q.z, life: 0.3, size: 1.4, color: 0xfff0a0, alpha: 0.9, alpha2: 0, add: true });
        if (q.t >= T - 0.03 && !q.done) {
          q.done = true;
          this.game.audio.play('bloop');
          this.particles.burst(8, { x: q.x, y: yT + 0.02, z: q.z, vy: 1.1, life: 0.45, size: 1.4, color: 0xd8f6ff, alpha: 0.9, alpha2: 0, grav: 5 }, { x: 0.05, z: 0.05, v: 0.5 });
          this.later(0.25, () => { this.game.audio.play('sparkle'); this.game.ui.toast('You make a wish. ✦', { dur: 1600 }); this.game.state.emit('act', { type: 'look', at: 'fountain' }); });
        }
      },
    });
  }

  async bask() {
    const S = TOWN.sun;
    this.locked = true;
    const pl = this.rig.player;
    const x0 = pl.pos.x * IM, z0 = pl.pos.z * IM, yaw0 = pl.yaw, pitch0 = pl.pitch;
    const info = ceilingInfo();
    const yawUp = Math.atan2(-(info.sun.x - S.x), -(info.sun.z - S.z));
    this.cut = { pos: new THREE.Vector3(x0, 0, z0), yaw: yaw0, pitch: pitch0 };
    await this.tween(1.0, (k) => { const e = k * k * (3 - 2 * k); this.cut.pos.set(x0 + (S.x - x0) * e, 0, z0 + (S.z - z0) * e); this.cut.yaw = lerpAngle(yaw0, yawUp, e); this.cut.pitch = pitch0 + (1.2 - pitch0) * e; });
    this.game.audio.play('glow');
    this.particles.burst(18, { x: S.x, y: 1.4, z: S.z, vy: 0.6, life: 1.8, size: 1.7, color: 0xfff6c8, alpha: 1, alpha2: 0, add: true, wob: 0.8 }, { x: 0.6, y: 0.7, z: 0.6, v: 0.3 });
    await this.tween(1.8, (k) => { this.post.flash = Math.sin(k * Math.PI) * 0.16; this.post.flashColor = 0xfff0c8; });
    this.post.flash = 0;
    this.game.ui.toast('Warm sunlight on your nose. Someday…', { dur: 2200 });
    this.game.state.emit('act', { type: 'look', at: 'sunbeam' });
    await this.tween(0.8, (k) => { this.cut.pitch = 1.2 * (1 - k) + 0.05 * k; });
    if (this.nugget && this.nuggetAI) this.nuggetAI.petted();
    this.place(S.x, S.z, this.cut.yaw, this.cut.pitch);
    this.cut = null;
    this.locked = false;
  }

  sit(seat) {
    this.seat = seat;
    this.place(seat.x + Math.sin(seat.yaw) * 0.05, seat.z + Math.cos(seat.yaw) * 0.05, seat.yaw + Math.PI, 0);
    this.game.audio.play('step', { mat: 'wood' });
  }
  standUp() {
    const s = this.seat;
    this.seat = null;
    this.place(s.x + Math.sin(s.yaw) * 0.85, s.z + Math.cos(s.yaw) * 0.85, this.rig.player.yaw, this.rig.player.pitch);
  }

  peerWell() {
    this.game.audio.play('drip');
    this.later(0.5, () => this.game.audio.play('drip', { vol: 0.5 }));
    this.later(0.9, () => this.game.audio.play('bloop', { vol: 0.3 }));
    this.game.ui.toast('…drip. …drip. Deep down, something glints.', { dur: 2200 });
    this.game.state.emit('act', { type: 'look', at: 'well' });
  }
  readNotice() {
    this.game.audio.play('page');
    if (this.townQuests?.notices()) return; // the board of open requests (quests part)
    this.game.ui.toast(`<b>Notice board:</b> ${pick(NOTICES)}`, { dur: 3600 });
  }
  knock(d) {
    const au = this.game.audio;
    au.play('thud', { vol: 0.4 });
    this.later(0.18, () => au.play('thud', { vol: 0.35 }));
    this.later(0.9, () => {
      const anchor = { key: 'town-door-' + Math.round(d.x * 10), voice: 300, indoors: true, headPos: (out) => out.set(d.x, 1.5, d.z) };
      this.say(anchor, pick(KNOCK), { life: 3 });
    });
  }
  peerTunnel() {
    this.game.audio.play('drip');
    const Tu = TOWN.tunnel;
    this.particles.burst(5, { x: Tu.cx, y: 1.7, z: TOWN.northFace + 0.1, vy: -0.6, life: 0.9, size: 1.6, color: 0x8a7a6a, alpha: 0.8, alpha2: 0, grav: 3 }, { x: 0.5, v: 0.1 });
    this.game.ui.toast('Rubble all the way back. No way through any more.', { dur: 2000 });
    this.game.state.emit('act', { type: 'look', at: 'tunnel' });
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    super.update(dt);
    WATER_TIME.value += dt;
    const g = this.game, rig = this.rig;
    if (!rig) return;
    const busy = g.ui.isPanelOpen();
    if (!this.hudClean) { this.hudClean = true; g.ui.setDepth?.(null); g.ui.setBag?.(null); g.ui.setRadar?.(null); }
    for (const t of [...this.tickers]) t(dt, this.time);
    if (this.cut) this.cutCamera(dt);
    else {
      rig.stepMat = floorMaterialAt(this.player.x, this.player.z);
      if (this.seat) {
        const inp = g.input;
        if (!busy && (inp.axisX() || inp.axisY() || inp.pressed('Space'))) this.standUp();
      }
      rig.update(dt, { busy, frozen: this.locked || !!this.seat });
      if (this.seat) { rig.camera.position.y -= 0.16; rig.camera.updateMatrixWorld(); }
      this.pushPlayer();
    }
    this.syncPlayerProxy();
    this.eyeTarget.copy(rig.camera.position);
    g.convo?.director?.apply(rig.camera, dt); // cutscene talk camera (src/fx/director.js) [convo hook]
    if (this.nuggetAI && this.nugget && !this.nugget.scripted) this.nuggetAI.update(dt, this.player);
    // actors: far, hidden or behind-the-camera ones animate every few frames (time accumulates,
    // so held expressions and blinks keep their pace)
    const p = this.player;
    for (const a of this.actors) {
      a._acc = (a._acc || 0) + dt;
      const every = !a.obj.visible ? 6 : a._behind ? 3 : 1;
      let skip = every > 1 && (a._skip = (a._skip || 0) + 1) % every;
      if (!skip && a.skipFar) {
        const dx = a.x - p.x, dz = a.z - p.z;
        if (dx * dx + dz * dz > 400 && (a._skipF = (a._skipF || 0) + 1) % 4) skip = true;
      }
      if (skip) continue;
      a.update(Math.min(a._acc, 0.25));
      a._acc = 0;
    }
    this.updateTalkItems();
    this.updateLOD();
    this.shadowBatch.update(this.actors);
    const cam = rig.camera;
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.lights.update(dt, cam.position.x + _f.x * 3, cam.position.y, cam.position.z + _f.z * 3);
    this.glow.update();
    this.particles.update(dt);
    if (this.worms) this.worms.time.value += dt;
    if (this.beamFx) this.beamFx.time.value += dt;
    const e = g.engine;
    this.U.uPx.value = e.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    if (this.ticketSign) this.ticketSign.position.y += Math.sin(this.time * 1.6) * 0.0016;
    const hm = this.homeMarker;
    if (hm) {
      hm.t += dt;
      const k = 0.65 + 0.35 * Math.sin(hm.t * 3);
      hm.ring.mul = k; hm.halo.mul = k;
      hm.gem.position.y = 2.18 + Math.abs(Math.sin(hm.t * 3)) * 0.14;
      hm.gem.rotation.y = Math.sin(hm.t * 1.3) * 0.5;
    }
    this.updateAnchors();
    this.updateLoops();
  }

  /**
   * Level of detail for the eye: far statics and far townsfolk skip the outline pass (each outlined
   * mesh is drawn twice), townsfolk out in the haze are not drawn at all.
   */
  updateLOD() {
    this.lodT = (this.lodT || 0) - 1;
    if (this.lodT > 0) return;
    this.lodT = 6;
    const cam = this.rig.camera.position;
    const touch = this.rig.isTouch();
    const [olStatic, olFolk, hideFolk] = touch ? [4, 4, 11] : [6, 5, 14];
    const [lod1, lod2] = touch ? [3, 6] : [4, 8];
    if (this.lift) this.lift.setOutline(Math.hypot(TOWN.lift.cage.x * M - cam.x, TOWN.lift.cage.z * M - cam.z) < (touch ? 5 : 8));
    if (this.pitFloor) this.pitFloor.visible = !!this.lift && this.lift.cage.obj.position.y < -0.3;
    updatePatches(this.blocks || [], cam, this.lodDist || (touch ? [2.5, 7, 13] : [3.5, 9, 16]), this.olDist ?? olStatic, this.noStaticLOD);
    for (const a of this.actors) {
      const d = Math.hypot(a.pos.x * M - cam.x, a.pos.z * M - cam.z);
      const show = d < hideFolk;
      // behind the camera (and not right beside it): animate less often
      const fx = -Math.sin(this.rig.player.yaw), fz = -Math.cos(this.rig.player.yaw);
      a._behind = d > 2.2 && ((a.pos.x * M - cam.x) * fx + (a.pos.z * M - cam.z) * fz) < -0.35 * d;
      if (a.obj.visible !== show) a.obj.visible = show;
      if (show && a.rig && !this.noFolkLOD) (a._lod ||= new RigLOD(a.rig)).set(d < lod1 ? 0 : d < lod2 ? 1 : 2);
      const ol = d < olFolk;
      if (a._ol !== ol) {
        a._ol = ol;
        a._olMeshes ||= (a.rig.meshes || []).filter((mesh) => mesh && mesh.layers.isEnabled(1));
        for (const mesh of a._olMeshes) { if (ol) mesh.layers.enable(1); else mesh.layers.disable(1); }
      }
    }
  }

  /** Scripted camera (cutscenes): the mole at this.cut.pos (TU), looking yaw/pitch, optional roll and dip. */
  cutCamera(dt) {
    const c = this.cut, rig = this.rig, pl = rig.player;
    pl.pos.set(c.pos.x * M, c.pos.y * M, c.pos.z * M);
    pl.vel.set(0, 0, 0);
    pl.yaw = c.yaw;
    pl.pitch = c.pitch;
    pl.dip = c.dip ?? 0;
    pl.eyeY = 0.72;
    rig.syncCamera(dt);
    if (c.roll) { rig.camera.rotation.z += c.roll; rig.camera.updateMatrixWorld(); }
    if (rig.vm && !c.noPaws) rig.vm.update(dt, { speed: 0, grounded: true, climbing: false, swimming: false, look: { dx: 0, dy: 0 }, lamp: { color: rig.lampCol, intensity: rig.lampK }, ambient: rig.ambient, camera: rig.camera });
    this.game.ui.setCrosshair?.(null);
  }

  /** Townsfolk are soft: the mole slides round them. */
  pushPlayer() {
    const pl = this.rig.player;
    const px = pl.pos.x * IM, pz = pl.pos.z * IM, r = 0.22 * IM;
    let ox = 0, oz = 0;
    for (const a of this.actors) {
      if (a === this.nugget || !a.collide) continue;
      const min = r + a.radius * 0.85;
      const dx = px - a.x, dz = pz - a.z, d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      ox += (dx / d) * (min - d) * 0.5;
      oz += (dz / d) * (min - d) * 0.5;
      if (a.npc && pl.vel.lengthSq() > 1.2) this.folk.bumped(a.npc);
    }
    if (!ox && !oz) return;
    const nx = (px + ox) * M, nz = (pz + oz) * M;
    if (!pl.hitsAt(nx, pl.pos.y, nz)) { pl.pos.x = nx; pl.pos.z = nz; }
  }

  render() {
    if (!this.rig) return;
    if (this.blocks) {
      const cam = this.rig.camera;
      cam.updateMatrixWorld();
      _proj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_proj);
      cullPatches(this.blocks, _frustum);
    }
    const vm = this.rig.vm;
    if (this.cut?.noPaws) this.rig.vm = null;
    this.rig.render(this.post);
    this.rig.vm = vm;
  }

  onResize(w, h) {
    if (!this.rig) return;
    // phones held upright: open the vertical field of view so the street still fits across
    const a = w / h;
    this.rig.camera.fov = a < 1 ? Math.min(100, 74 + (1 - a) * 44) : 74;
    this.rig.onResize(w, h);
  }

  exit() {
    for (const a of this.actors || []) a._lod?.dispose();
    disposePatches(this.patches || [], this.blocks || []);
    this.rig?.dispose();
    super.exit();
  }

  // ------------------------------------------------------------ test hooks (scripts/e2e.mjs)
  makeDebug() {
    const S = this;
    return {
      /** Open a shop panel the way E on its counter does. */
      openShop(id) { S.locked = false; const k = S.keepers.find((q) => q.id === id); return k ? S.useKeeper(k, true) : S.game.ui.openShop(id); },
      /** Chat with a townsperson (or a keeper) by name; returns the line said. */
      talkTo(name) {
        const n = S.folk.list.find((f) => f.name === name);
        if (n) return S.folk.talkTo(n);
        const k = S.keepers.find((q) => q.spec.name === name);
        if (k) { const line = pick(k.id === 'lift' ? BRAMBLE_LINES : SHOPS[k.id].lines); S.say(k.a, line, { name: k.spec.name, voice: k.spec.voice }); return line; }
        return null;
      },
      /** Ride the lift to a destination id ('home', 'L0', a mine lift id…); without an id, open Bramble's panel. */
      useLift(id) { S.locked = false; if (id) return S.rideLift(id); return S.openLift(); },
      goHome() { S.locked = false; S.goHome(); },
      /** Teleport the mole (town units) facing yaw (0 north, π south). */
      place(x, y, z, yaw = 0, pitch = 0) { S.cut = null; S.seat = null; S.rig.place(x * M, (y || 0) * M + 0.001, z * M, yaw, pitch); S.syncPlayerProxy(); },
      /** Draw calls, triangles and update ms for one frame. */
      perf() {
        const r = S.game.engine.renderer;
        const t0 = performance.now(); S.update(1 / 60); const ms = performance.now() - t0;
        r.info.autoReset = false; r.info.reset(); S.render();
        const out = { calls: r.info.render.calls, tris: r.info.render.triangles, updateMs: +ms.toFixed(2), particles: S.particles.count(), actors: S.actors.length };
        r.info.autoReset = true;
        return out;
      },
      names() { return S.folk.list.map((f) => f.name); },
      /** Static patches in view: triangles (k) by level, outline triangles, counts. */
      patches() {
        const cam = S.rig.camera, fr = new THREE.Frustum();
        cam.updateMatrixWorld(); fr.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        const r = { n: S.patches.length, blocks: 0, lv: [0, 0, 0, 0], tris: [0, 0, 0, 0], ol: 0, olN: 0, calls: 0 };
        const cnt = (g) => Math.min(g.index.count, g.drawRange.count) / 3;
        for (const b of S.blocks) {
          if (b.mesh?.visible) { r.blocks++; r.calls++; r.lv[b.level] += b.children.length; r.tris[b.level] += cnt(b.mesh.geometry); }
        }
        for (const p of S.patches) {
          if (!p.mesh.visible) continue;
          r.calls++; r.lv[p.level]++; r.tris[p.level] += cnt(p.mesh.geometry);
          if (p.outline?.visible) { r.ol += cnt(p.outline.geometry); r.olN++; }
        }
        r.tris = r.tris.map((t) => Math.round(t / 1000)); r.ol = Math.round(r.ol / 1000);
        return r;
      },
      /** Advance the scene by secs at 30 fps, letting scripted sequences (async) run between frames. */
      async run(secs = 1) { const n = Math.round(secs * 30); for (let i = 0; i < n; i++) { S.update(1 / 30); await new Promise((r) => setTimeout(r, 0)); } return { t: S.time, locked: S.locked, scene: S.game.sceneName }; },
      skipArrival() { if (S.arrival && !S.arrival.done) S.arrival.skip = true; },
    };
  }
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Grass tufts and three flowers for the sunbeam patch (1/16). */
function sunPatchAt(S) {
  const g = new VoxelGrid(48, 10, 44);
  const rng = makeRng(321);
  for (let k = 0; k < 90; k++) {
    const x = rng.int(3, 44), z = rng.int(3, 40);
    if (Math.hypot((x - 24) / 22, (z - 22) / 20) > 1) continue;
    const h = rng.int(1, 5);
    for (let y = 0; y < h; y++) g.set(x + (y === h - 1 && rng.chance(0.5) ? 1 : 0), y, z, y === h - 1 ? 0x8ad86a : 0x5aa83a);
  }
  for (const [fx, fz, c] of [[25, 22, 0xfff070], [14, 18, 0xffffff], [32, 28, 0xf0a0c0]]) {
    for (let y = 0; y < 7; y++) g.set(fx, y, fz, 0x4a9a3a);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(fx + dx, 7, fz + dz, c);
    g.set(fx, 7, fz, 0xe0902a); g.set(fx, 8, fz, c);
  }
  const m = M16(g, [24, 0, 22]);
  m.position.set(S.x, 0, S.z);
  return m;
}

export { lerpAngle };
