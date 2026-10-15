// Deep Town: a cozy town in a huge cavern. Layered rock walls with an upper level of
// burrows, walkways, laundry and lanterns; shops set into the walls; a fountain plaza with
// market stalls; a waterfall; the sunbeam on the Surface Express booth; the mine lift with
// Bramble at the crank; your burrow door; the old collapsed tunnel you escaped through;
// and a crowd of townsfolk. Statics are merged, camera-culled and light-baked.
import * as THREE from 'three';
import { IsoScene, flatPlane } from '../iso/IsoScene.js';
import { Actor } from '../iso/Actor.js';
import { TOWN } from '../iso/townLayout.js';
import * as TW from '../iso/townWorld.js';
import * as TS from '../iso/townShops.js';
import * as P from '../iso/props.js';
import { buildShop } from '../iso/shopFront.js';
import { markerArrow, homeEntrance } from '../iso/props2.js';
import { ticketBooth32, velvetRope32 } from '../iso/booth.js';
import { Townsfolk } from '../iso/TownNPCs.js';
import { Batch, keepUnbatched } from '../iso/vox.js';
import { WATER_TIME, waterMaterial } from '../iso/water.js';
import { beamTexture, poolTexture } from '../iso/pixel.js';
import { paintTownFloor, floorMaterialAt } from '../iso/townFloor.js';
import { place, buildCave, buildUpper, buildRails } from '../iso/townBuild.js';
import { tunnelFrame, tunnelBoards, brokenBoards, sealRubble } from '../iso/tunnel.js';
import { TownArrival } from '../iso/townArrival.js';
import { townLife } from '../iso/townLife.js';
import { SignSheet } from '../iso/atlas.js';
import { bakeLighting, caveAmbient } from '../iso/bake.js';
import { disposeTextures } from '../iso/surface.js';
import { MESH_STATS, withView, viewForYaw, meshDefaults } from '../iso/mesher.js';
import { SHOPS } from '../data/shops.js';
import { ZONES, MAX_ZONE } from '../data/zones.js';

/** Depth bands of the first-person underground, by zone/station (docs/DEEP.md). */
const DEEP_DEPTHS = [[0, 25], [0, 25], [25, 55], [55, 90], [90, 130], [130, 170], [170, 210]];
import { makeCharacter } from '../gfx/characters.js';
import { el, rand, pick, chance, clamp, makeRng } from '../core/util.js';

const _v = new THREE.Vector3();
const SUN_TILT = -0.1; // how far the sunbeam leans toward its crack in the ceiling (negative: leans right on screen)
const BRAMBLE = { name: 'Bramble', species: 'vole', age: 'elder', body: 'stocky', fur: 0x8a6a4a, outfit: 'overalls', outfitColor: 0x7a5a3a, hat: 'cap', hatColor: 0x3a5a3a, eyes: 'happy', brows: 'bushy', dirt: 0.6, seed: 31, blush: true, voice: 250 };
const BRAMBLE_LINES = [
  'Going down? Hop in, mind the gap.',
  'She creaks, but she has never dropped anyone. Twice.',
  'The deeper stops open once you have dug to the bottom of one.',
  'Bring me back something shiny, eh?',
  'Hold on to your helmet. And your chicken.',
];
const WELCOME_BACK = ['Welcome back up! Still got all your claws?', 'Back in one piece! Mostly dirt, though.', 'Up you come. Old Vex will want a look at that haul.'];

/** AO mode for the town's voxel statics (see meshDefaults). */
const TOWN_AO = 'tops';
/** Painted floor kept across visits: { key, tex }. */
let FLOOR_CACHE = null;

export default class TownScene extends IsoScene {
  async enter(params = {}) {
    this.hud = 'town';
    this.music = 'town';
    const st = this.game.state;
    st.flag('lastScene', 'town');
    const from = params.from || 'home';
    if (from === 'escape') st.flag('escaped', true);
    this.initIso({ w: TOWN.W, h: TOWN.H, zoom: 11.5, minZoom: 7, maxZoom: 14.5, lights: 6, lightRange: 11.5, bg: 0x07050a });
    this.cam.bounds = { minX: 6.5, maxX: 30.5, minZ: 6.2, maxZ: 25.2 };
    this.post = { vignette: 0.5, saturation: 1.12, contrast: 1.05 };
    WATER_TIME.value = 0;

    // cool cave ambience from above, warm bounce from the floor, a soft key from the upper left
    this.scene.add(new THREE.HemisphereLight(0x9a90c8, 0x4a3426, 1.3));
    const key = new THREE.DirectionalLight(0xffe2c8, 0.55);
    key.position.set(-4, 10, 6);
    this.scene.add(key);

    const t0 = performance.now();
    this.batch = new Batch(12);
    this.faders = [];
    this.shadows = [];
    this.bakeLights = [];
    this.unbatched = [];
    this.signs = new SignSheet(1024);
    const steps = {};
    const run = (name, fn) => { const ts = performance.now(); fn(); steps[name] = Math.round(performance.now() - ts); };
    // the town is big: AO only on upward faces (side-face AO at 1/32 cost ~130k triangles for ~2px of shading)
    const prevMesh = meshDefaults({ ao: TOWN_AO });
    try {
    run('cave', () => buildCave(this));
    run('upper', () => buildUpper(this));
    run('shops', () => this.buildShops());
    run('booth', () => this.buildBooth());
    run('home', () => this.buildHomeDoor());
    run('tunnel', () => this.buildTunnel(from === 'escape'));
    run('lift', () => this.buildLift());
    run('rails', () => buildRails(this));
    run('plaza', () => this.buildPlaza());
    run('market', () => this.buildMarket());
    run('decor', () => this.buildDecor());
    run('sun', () => this.buildSunbeam());
    } finally { meshDefaults(prevMesh); }
    const t1 = performance.now();
    run('floor', () => this.buildFloor());
    const t2 = performance.now();
    const statics = new THREE.Group();
    this.scene.add(statics);
    const amb = caveAmbient({ top: 7.6, fadeFrom: 3.6, minK: 0.12 });
    const bake = (g) => bakeLighting(g, this.bakeLights, { ambient: amb });
    this.batch.build(statics, this.cam.back, { bake });
    for (const o of this.unbatched) keepUnbatched(o, this.scene);
    const sheet = this.signs.build();
    if (sheet) { bake(sheet.geometry); this.scene.add(sheet); }
    this.buildMs = performance.now() - t0;
    console.info('[town] mesher', JSON.stringify({ calls: MESH_STATS.calls, Mcells: +(MESH_STATS.cells / 1e6).toFixed(2), ms: Math.round(MESH_STATS.ms), ktris: Math.round(MESH_STATS.tris / 1000) }));
    console.info(`[town] built in ${this.buildMs.toFixed(0)} ms (statics ${(t1 - t0).toFixed(0)}, floor ${(t2 - t1).toFixed(0)}, merge+bake ${(performance.now() - t2).toFixed(0)}) ${JSON.stringify(steps)}`);

    this.spawnKeepers();
    this.folk = new Townsfolk(this);
    this.folk.spawnAll();
    this.tickers.push((dt) => this.folk.update(dt));
    this.tickers.push((dt) => this.updateKeepers(dt));
    townLife(this);

    // player + Nugget (only once she has been found on the way out)
    const hasNugget = !!st.flag('nugget');
    if (from === 'mine') {
      this.spawnPlayer(TOWN.lift.cage.x, TOWN.lift.cage.z, 0);
      if (hasNugget) this.spawnNugget(TOWN.lift.cage.x + 0.45, TOWN.lift.cage.z - 0.3);
      this.arrive();
    } else if (from === 'escape') {
      const T = TOWN.tunnel;
      this.spawnPlayer(T.cx, T.inside.z, 0);
      if (hasNugget) this.spawnNugget(T.cx + 0.4, T.inside.z - 0.3);
      this.arrival = new TownArrival(this);
      this.arrival.setup();
      this.arrival.run();
    } else if (from === 'ending') {
      // back from the surface: standing in the sunbeam by the booth
      const S = TOWN.sun;
      this.spawnPlayer(S.x, S.z + 0.2, Math.PI * 0.75);
      if (hasNugget) this.spawnNugget(S.x + 0.6, S.z + 0.7);
    } else {
      const sp = TOWN.home.spawn;
      this.spawnPlayer(sp.x, sp.z, 0);
      if (hasNugget) this.spawnNugget(sp.x + 0.7, sp.z + 0.4);
      if (from === 'home') this.game.audio.play('door');
    }
    this.ambientLoop('water', () => (this.player ? 0.3 * clamp(1 - Math.hypot(this.player.x - TOWN.fountain.x, this.player.z - TOWN.fountain.z) / 8, 0, 1) : 0));
    this.ambientLoop('water', () => (this.player ? 0.42 * clamp(1 - Math.hypot(this.player.x - TOWN.falls.x, this.player.z - TOWN.falls.z) / 9, 0, 1) : 0), { intensity: 1 });
    this.dripT = 3;
    await this.warmShaders();
  }

  /** Compile every material before the first frame (in parallel where the GPU driver allows). */
  async warmShaders() {
    const r = this.game.engine?.renderer;
    if (!r || !r.compileAsync) return;
    try { await r.compileAsync(this.scene, this.camera); } catch (e) { console.warn(e); }
  }

  // ------------------------------------------------------------ static world
  /** Lights also bake into the static voxels around them (see iso/bake.js). */
  addLight(o) {
    const src = super.addLight(o);
    if (o.bake !== false && this.bakeLights) {
      const power = o.bakePower ?? (o.intensity ? Math.min(1.3, o.intensity / 6) : 0.3);
      const radius = o.bakeRadius ?? (o.intensity ? (o.distance ?? 5) * 0.95 : 2.4);
      this.bakeLights.push({ x: o.x, y: o.y, z: o.z, color: o.color, power, radius });
    }
    return src;
  }

  addStatic(obj) {
    this.batch.add(obj);
    this.unbatched.push(obj);
  }

  buildFloor() {
    const { W, H } = TOWN;
    // the painted floor is deterministic: keep its texel data between visits (only the GPU copy is
    // freed on exit, and re-uploaded on the way back in), so returning to town skips ~0.5 s of painting
    const key = this.shadows.length + ':' + this.shadows.reduce((a, sh) => a + sh.x * 7 + sh.z * 13 + (sh.rx || 0) + (sh.rz || 0) + (sh.k || 0), 0).toFixed(3);
    if (FLOOR_CACHE && FLOOR_CACHE.key === key) this.floorTex = FLOOR_CACHE.tex;
    else {
      if (FLOOR_CACHE) disposeTextures(FLOOR_CACHE.tex);
      this.floorTex = paintTownFloor({ shadows: this.shadows });
      FLOOR_CACHE = { key, tex: this.floorTex };
    }
    // per-tile quads so the lift shaft can be a real hole
    const L = TOWN.lift;
    const hole = (x, z) => x >= L.cage.x - 1 && x < L.cage.x + 1 && z >= L.cage.z - 1 && z < L.cage.z + 1;
    const pos = [], uv = [], nor = [], idx = [];
    let v = 0;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (hole(x, z)) continue;
      for (const [dx, dz] of [[0, 0], [0, 1], [1, 1], [1, 0]]) {
        pos.push(x + dx, 0, z + dz);
        uv.push((x + dx) / W, (z + dz) / H);
        nor.push(0, 1, 0);
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const t = this.floorTex;
    const mat = new THREE.MeshPhongMaterial({ map: t.map, normalMap: t.normalMap, specularMap: t.specularMap, specular: 0x8a7e70, shininess: 24 });
    this.scene.add(new THREE.Mesh(g, mat));
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) this.map.setMat(x, z, floorMaterialAt(x + 0.5, z + 0.5));
    // puddles: rippling water skins that pick up the lantern glow
    this.puddles = [];
    for (const [x, z, rx, rz] of TOWN.puddles) {
      const m = new THREE.Mesh(flatPlane(), waterMaterial({ res: [Math.round(rx * 64), Math.round(rz * 64)], round: true, deep: 0x1c2430, mid: 0x2a3446, light: 0x56647c, foam: 0xb8c8e0, alpha: 0.82 }));
      m.scale.set(rx * 2, 1, rz * 2);
      m.position.set(x, 0.012, z);
      m.renderOrder = 1;
      this.scene.add(m);
      this.puddles.push({ x, z, rx, rz });
    }
  }

  buildShops() {
    this.shopInfo = {};
    for (const s of TOWN.shops) {
      const b = buildShop(s.id, s.w, s.wall === 'N' ? 0 : Math.PI / 2);
      const o = b.obj;
      const toWorld = (lx, lz) => (s.wall === 'N' ? { x: s.a + lx, z: TOWN.northFace + lz } : { x: TOWN.westFace + lz, z: s.a + s.w - lx });
      if (s.wall === 'N') o.position.set(s.a, 0, TOWN.northFace);
      else { o.position.set(TOWN.westFace, 0, s.a + s.w); o.rotation.y = Math.PI / 2; }
      this.addStatic(o);
      o.updateMatrixWorld(true);
      for (const sg of b.signs) this.signs.add(sg.pc, sg.w, sg.h, sg.anchor);
      if (s.wall === 'N') this.map.fill(Math.floor(s.a), TOWN.northFace, Math.ceil(s.w), 1, 1);
      else this.map.fill(TOWN.westFace, Math.floor(s.a), 1, Math.ceil(s.w), 1);
      for (const pr of b.props) {
        const w = toWorld(pr.x, pr.z);
        this.map.addCircle(w.x, w.z, pr.r);
        this.map.navCircle(w.x, w.z, pr.r + 0.25);
        if (pr.shadow) this.shadows.push({ x: w.x, z: w.z, rx: pr.shadow.rx, rz: pr.shadow.rz, k: pr.shadow.k });
      }
      for (const l of b.lights) {
        const w = toWorld(l.x, l.z);
        this.addLight({ x: w.x, y: l.y, z: w.z, color: 0xffb860, intensity: 3.2, distance: 4.5, flicker: 0.16, pool: 1.1, poolOpacity: 0.26, halo: 0.55, haloOpacity: 0.55, bakePower: 0.9, bakeRadius: 3.4 });
      }
      const door = toWorld(b.door.u, 1.48);
      this.shopInfo[s.id] = { door, yaw: s.wall === 'N' ? 0 : Math.PI / 2, wall: s.wall };
      if (s.id === 'tools') this.grindstone = toWorld(4.35, 1.6);
      // window light spilling onto the street
      const fw = toWorld(b.door.u, 1.25);
      this.addLight({ x: fw.x, y: 0.9, z: fw.z, color: 0xffb860, intensity: 0, real: false, pool: 1.5, poolOpacity: 0.14, bakePower: 0.4, bakeRadius: 2.6 });
    }
  }

  buildBooth() {
    const B = TOWN.booth;
    const b = withView(viewForYaw(0), () => ticketBooth32());
    b.obj.position.set(B.x0, 0, B.z0);
    // the golden ticket bobs: keep it out of the static batch
    b.obj.remove(b.ticket);
    b.ticket.position.add(b.obj.position);
    this.scene.add(b.ticket);
    this.addStatic(b.obj);
    this.ticketSign = b.ticket;
    this.map.fill(B.x0, B.z0, B.w, B.d, 1);
    for (const l of b.lights) this.addLight({ x: B.x0 + l.x, y: l.y, z: B.z0 + l.z, color: 0xffd890, intensity: 3, distance: 4.5, flicker: 0.08, pool: 1.0, poolOpacity: 0.22, halo: 0.45, haloOpacity: 0.5 });
    this.addLight({ x: B.x0 + b.inside.x, y: b.inside.y, z: B.z0 + b.inside.z, color: 0xffc070, intensity: 0, real: false, pool: 0, halo: 0.3, haloOpacity: 0.35, bakePower: 0.8, bakeRadius: 1.6 });
    const rope = withView(viewForYaw(0), () => velvetRope32());
    rope.position.set(B.x0 + B.w / 2, 0, B.z0 + B.d + 0.72);
    this.addStatic(rope);
    this.shadows.push({ x: B.x0 + B.w / 2, z: B.z0 + B.d - 0.1, rx: 2.8, rz: 0.4, k: 0.55 });
    // the clerk stands on a step just behind the ticket window
    this.shopInfo.ticket = { door: { x: B.x0 + B.w / 2, z: B.z0 + 2.45 }, yaw: 0 };
  }

  buildHomeDoor() {
    const h = TOWN.home;
    const d = withView(viewForYaw(0), () => homeEntrance());
    const ox = h.x0 + h.w / 2, oz = TOWN.northFace - 0.1;
    d.obj.position.set(ox, 0, oz);
    this.addStatic(d.obj);
    this.map.fill(Math.floor(h.x0), TOWN.northFace, h.w, 1, 1);
    this.map.addCircle(ox + d.pot.x, oz + d.pot.z, 0.26);
    this.shadows.push({ x: ox + d.pot.x + 0.04, z: oz + d.pot.z + 0.05, rx: 0.3, rz: 0.22, k: 0.6 }, { x: ox + d.mailbox.x + 0.04, z: oz + d.mailbox.z + 0.03, rx: 0.22, rz: 0.2, k: 0.65 });
    const lan = d.lights[0], peep = d.lights[1];
    this.addLight({ x: ox + lan.x, y: lan.y, z: oz + lan.z, color: 0xffc070, intensity: 2.5, distance: 3.5, flicker: 0.12, real: false, pool: 1.0, poolOpacity: 0.26, poolZ: h.door.z + 0.75, poolX: ox + lan.x - 0.35, halo: 0.42, haloOpacity: 0.5 });
    this.addLight({ x: ox + peep.x, y: peep.y, z: oz + peep.z + 0.1, color: 0xffd27a, intensity: 0, real: false, pool: 0.7, poolOpacity: 0.12, poolZ: h.door.z + 0.55, halo: 0.25, haloOpacity: 0.35, bakePower: 0.3, bakeRadius: 1.6 });
    this.addInteractable({ x: h.door.x, z: h.door.z, r: 1.2, label: 'Go home', action: () => this.goHome() });
    // until the burrow has been visited once, its door glows to show the way
    if (!this.game.state.flag('homeVisited')) this.homeMarker = this.makeHomeMarker();
  }

  makeHomeMarker() {
    const h = TOWN.home;
    const ring = this.glow.add({ kind: 'pool', x: h.door.x, y: 0.04, z: h.door.z + 0.75, w: 1.5, h: 1.2, color: 0xffd27a, opacity: 0.4 });
    const halo = this.glow.add({ kind: 'halo', x: h.door.x, y: 1.2, z: h.door.z - 0.25, w: 0.8, color: 0xffe0a0, opacity: 0.32 });
    const ring2 = this.glow.add({ kind: 'ring', x: h.door.x, y: 2.3, z: h.door.z + 0.2, w: 0.5, color: 0xfff0b0, opacity: 0.9 });
    const gem = markerArrow();
    gem.position.set(h.door.x, 2.2, h.door.z + 0.3);
    this.scene.add(gem);
    return { ring, halo, ring2, gem, t: 0 };
  }

  buildTunnel(escape) {
    const T = TOWN.tunnel, NF = TOWN.northFace;
    const fr = tunnelFrame();
    fr.position.set(T.cx, 0, NF);
    this.addStatic(fr);
    this.map.fill(Math.floor(T.x0), 0, Math.ceil(T.x1 - T.x0) + 1, NF, 1);
    // the rubble that seals the mouth, the splintered boards, and (on arrival) the intact boards + sign
    const seal = sealRubble();
    seal.position.set(T.cx, 0, NF - 0.32);
    const stubs = brokenBoards();
    stubs.position.set(T.cx, 0, NF);
    this.tunnel = { seal, stubs };
    if (escape) {
      // animated parts stay separate meshes until the dust settles
      this.scene.add(seal, stubs);
      seal.visible = false;
      stubs.visible = false;
      const bd = tunnelBoards();
      const holder = new THREE.Group();
      holder.position.set(T.cx, 0, NF + 0.1);
      for (const b of bd.boards) holder.add(b);
      holder.add(bd.sign);
      this.scene.add(holder);
      this.tunnel.boards = bd.boards;
      this.tunnel.sign = bd.sign;
    } else {
      this.addStatic(seal);
      this.addStatic(stubs);
      // the old sign lies propped against the rubble
      const bd = tunnelBoards();
      bd.sign.position.set(T.cx + 0.55, 0.18, NF + 0.28);
      bd.sign.rotation.set(-1.05, 0.2, 0.1);
      this.scene.add(bd.sign);
      for (const b of bd.boards) b.geometry.dispose();
    }
    this.shadows.push({ x: T.cx, z: NF + 0.25, rx: 1.1, rz: 0.35, k: 0.6 });
    this.addInteractable({ x: T.cx, z: NF + 0.6, r: 1.0, priority: -0.6, label: 'Peer into the old tunnel', action: () => this.peerTunnel() });
  }

  peerTunnel() {
    const p = this.player;
    p.faceToward(TOWN.tunnel.cx, TOWN.northFace - 1);
    this.emote(p, '…');
    this.game.audio.play('drip');
    this.particles.burst(4, { x: TOWN.tunnel.cx, y: 1.6, z: TOWN.northFace + 0.1, vy: -0.6, life: 0.9, size: 1.5, color: 0x8a7a6a, alpha: 0.8, alpha2: 0, grav: 3 }, { x: 0.5, v: 0.1 });
  }

  buildLift() {
    const L = TOWN.lift;
    const lf = TS.mineLift();
    lf.obj.position.set(L.x0, 0, L.z0);
    this.addStatic(lf.obj);
    this.addLight({ x: L.x0 + lf.light.x, y: lf.light.y, z: L.z0 + lf.light.z, color: 0xffc070, intensity: 5, distance: 6, flicker: 0.12, pool: 1.6, poolOpacity: 0.26, halo: 0.6, haloOpacity: 0.55 });
    this.map.fill(L.x0, L.z0, L.w, 1, 1);
    this.map.fill(Math.floor(L.cage.x - 1), Math.floor(L.cage.z - 1), 2, 2, 1);
    for (const [x, z] of [[L.x0 + 0.3, L.z0 + 3.7], [L.x0 + 3.7, L.z0 + 3.7]]) this.map.addCircle(x, z, 0.25);
    const cage = TS.liftCage();
    cage.obj.position.set(L.cage.x, 0, L.cage.z);
    this.scene.add(cage.obj);
    this.cage = cage;
    const crank = TS.liftCrank();
    crank.obj.position.set(L.crank.x, 0, L.crank.z);
    crank.obj.rotation.y = Math.PI / 2;
    this.scene.add(crank.obj);
    this.crank = crank;
    this.map.addCircle(L.crank.x, L.crank.z, 0.42);
    this.map.navCircle(L.crank.x, L.crank.z, 0.6);
    this.addInteractable({ x: L.front.x, z: L.front.z - 0.3, r: 1.35, label: 'Ride the lift', action: () => this.openLiftPanel() });
    // the ore cart on the rails, the ore heap and the loading clutter
    place(this, () => P.oreCart(2), TOWN.cart.x, TOWN.cart.z, 0, { solid: false });
    this.map.addCircle(TOWN.cart.x, TOWN.cart.z - 0.32, 0.42);
    this.map.addCircle(TOWN.cart.x, TOWN.cart.z + 0.32, 0.42);
    this.map.navCircle(TOWN.cart.x, TOWN.cart.z, 0.9);
    const pile = TW.orePile();
    pile.position.set(TOWN.orePile.x, 0, TOWN.orePile.z);
    pile.scale.setScalar(1.15);
    this.addStatic(pile);
    this.shadows.push({ x: TOWN.orePile.x, z: TOWN.orePile.z, rx: 0.75, rz: 0.7, k: 0.6 });
    this.map.addCircle(TOWN.orePile.x, TOWN.orePile.z, 0.62);
    this.map.navCircle(TOWN.orePile.x, TOWN.orePile.z, 0.8);
    place(this, () => P.crate(8), 32.75, 7.85, 0.2);
    place(this, () => P.barrel(9, { fill: 'coal' }), 32.85, 8.65);
    place(this, () => P.ropeCoil(2), 29.0, 7.75, 0, { solid: false });
    place(this, () => P.bucket(true), 32.6, 9.35, 0.4);
  }

  buildPlaza() {
    const F = TOWN.fountain;
    const f = TW.fountain();
    this.addStatic(f.obj);
    this.fountainInfo = f;
    this.map.addCircle(F.x, F.z, F.r + 0.05);
    this.map.navCircle(F.x, F.z, F.r + 0.45);
    this.shadows.push({ x: F.x, z: F.z, rx: F.r + 0.25, rz: F.r + 0.25, k: 0.7, ox: 0.1, oz: 0.12 });
    this.addLight({ x: F.x, y: f.crystal.y + 0.3, z: F.z, color: 0x7fd0ff, intensity: 7, distance: 7.5, flicker: 0.04, speed: 0.3, pool: 3.0, poolOpacity: 0.2, halo: 1.3, hy: f.crystal.y + 0.25, haloOpacity: 0.45, priority: 1 });
    this.addInteractable({ x: F.x, z: F.z, size: F.r, r: 0.95, priority: -0.1, label: 'Toss a coin in (1 G)', action: () => this.tossCoin() });
    const PS = this.particles;
    PS.addEmitter({
      every: 0.045,
      emit: (p) => {
        const a = Math.random() * Math.PI * 2;
        const r0 = f.bowlR;
        p.spawn({ x: F.x + Math.cos(a) * r0, y: f.bowlY, z: F.z + Math.sin(a) * r0, vx: Math.cos(a) * rand(0.35, 0.6), vz: Math.sin(a) * rand(0.35, 0.6), vy: rand(0.2, 0.6), grav: 5, life: 1.0, size: 1.5, color: 0xd8f6ff, color2: 0x7ac8f0, alpha: 0.95, alpha2: 0.4, fn: (q) => { if (q.y < f.basinY) { q.dead = true; if (Math.random() < 0.3) p.spawn({ x: q.x, y: f.basinY + 0.02, z: q.z, vy: 0.5, grav: 3, life: 0.25, size: 1, color: 0xffffff, alpha: 0.8 }); } } });
      },
      when: () => this.near(F.x, F.z, 14),
    });
    PS.addEmitter({
      every: 0.12,
      emit: (p) => p.spawn({ x: F.x + rand(-0.06, 0.06), y: f.crystal.y - 0.2, z: F.z + rand(-0.06, 0.06), vy: rand(0.9, 1.3), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), grav: 3.2, life: 0.9, size: 1.3, color: 0xe8fbff, alpha: 0.85, alpha2: 0.2, fn: (q) => { if (q.y < f.bowlY && q.t > 0.2) q.dead = true; } }),
      when: () => this.near(F.x, F.z, 14),
    });
    // benches
    this.benchSeats = [];
    TOWN.benches.forEach((b, i) => {
      place(this, () => P.bench(), b.x, b.z, b.yaw, { solid: false });
      for (const side of [-1, 1]) {
        const x = b.x + Math.cos(b.yaw) * 0.5 * side, z = b.z - Math.sin(b.yaw) * 0.5 * side;
        this.map.addCircle(x, z, 0.32);
        this.map.navCircle(x, z, 0.5);
      }
      const taken = { 0: [-1, 1], 1: [-1], 2: [1], 4: [1] }[i] || [];
      for (const side of [-1, 1]) {
        if (taken.includes(side)) continue;
        const sx = b.x + Math.cos(b.yaw) * 0.42 * side, sz = b.z - Math.sin(b.yaw) * 0.42 * side;
        this.benchSeats.push({ x: sx, z: sz, yaw: b.yaw, exitX: sx + Math.sin(b.yaw) * 0.85, exitZ: sz + Math.cos(b.yaw) * 0.85 });
      }
    });
    for (const seat of this.benchSeats) this.addInteractable({ x: seat.x, z: seat.z, r: 0.95, priority: -0.4, label: 'Sit on the bench', action: () => this.sitOn({ ...seat, y: 0.22 }) });
    // lamp posts
    TOWN.lamps.forEach((l, i) => place(this, () => P.lampPost(i), l.x, l.z, i % 2 ? Math.PI / 2 : 0, { light: { intensity: 6, distance: 6.5, pool: 1.9, poolOpacity: 0.3, halo: 0.75, haloOpacity: 0.6 } }));
    // giant glowing mushroom trees (fade when you walk behind them)
    for (const t of TOWN.trees) {
      const tr = TW.mushroomTree(t);
      this.scene.add(tr.obj);
      this.faders.push({ obj: tr.obj, mats: tr.mats, x: t.x, z: t.z, r: t.r, h: t.h, k: 1 });
      this.map.addCircle(t.x, t.z, 0.42);
      this.map.navCircle(t.x, t.z, 0.6);
      this.shadows.push({ x: t.x, z: t.z, rx: t.r * 0.9, rz: t.r * 0.8, k: 0.72 });
      this.addLight({ x: t.x, y: tr.light.y, z: t.z, color: tr.light.color, intensity: 5, distance: 7, flicker: 0.05, speed: 0.25, pool: t.r + 0.9, poolOpacity: 0.26, halo: 0, real: true });
      this.particles.addEmitter({ every: 0.5, when: () => this.near(t.x, t.z, 12), emit: (p) => { const a = rand(0, 6.28), r = rand(0, t.r); p.spawn({ x: t.x + Math.cos(a) * r, y: t.h - 0.4, z: t.z + Math.sin(a) * r, vy: -rand(0.12, 0.25), life: rand(4, 7), size: 1.2, color: tr.light.color, alpha: 0.9, alpha2: 0, add: true, wob: 0.35 }); } });
      for (let k = 0; k < 3; k++) this.spawnBeetle(t.x, t.z, t.h * 0.55);
    }
    // the notice board and a stone well
    place(this, () => P.noticeBoard(), 11.6, 13.9, Math.PI / 2 - 0.35, { solid: false });
    this.map.addCircle(11.6, 13.5, 0.25);
    this.map.addCircle(11.6, 14.3, 0.25);
    place(this, () => P.well(), 9.15, 10.85, 0.3);
  }

  buildMarket() {
    this.stallSpots = [];
    const Y = new THREE.Vector3(0, 1, 0);
    TOWN.stalls.forEach((s, i) => {
      place(this, () => P.marketStall(s.kind, i + 2), s.x, s.z, s.yaw);
      // a lantern glow under the awning
      _v.set(0.7, 0, 0.6).applyAxisAngle(Y, s.yaw);
      this.addLight({ x: s.x + _v.x, y: 1.55, z: s.z + _v.z, color: 0xffc070, intensity: 0, real: false, pool: 1.3, poolOpacity: 0.16, halo: 0.45, haloOpacity: 0.45, flicker: 0.14, bakePower: 0.7, bakeRadius: 2.6 });
      // the keeper stands behind the counter
      _v.set(0, 0, -0.18).applyAxisAngle(Y, s.yaw);
      this.stallSpots.push({ x: s.x + _v.x, z: s.z + _v.z, yaw: s.yaw, kind: s.kind });
      // crates, sacks and a barrel beside it
      _v.set(1.05, 0, 0.1).applyAxisAngle(Y, s.yaw);
      place(this, () => (i % 2 ? P.sack({ color: 0xa88a5a }) : P.crate(i + 11)), s.x + _v.x, s.z + _v.z, s.yaw + 0.3);
      _v.set(-1.05, 0, 0.25).applyAxisAngle(Y, s.yaw);
      place(this, () => P.barrel(i + 21, { fill: s.kind === 'fish' ? 'water' : s.kind === 'gems' ? 'ore' : 'shrooms' }), s.x + _v.x, s.z + _v.z, s.yaw);
    });
  }

  spawnBeetle(cx, cz, cy) {
    const ph = rand(0, 6.28), rad = rand(0.8, 2.2), sp = rand(0.4, 0.9) * (chance(0.5) ? 1 : -1);
    this.particles.spawn({
      x: cx, y: cy, z: cz, life: 1e9, size: 1.6, color: 0xc8ff7a, alpha: 1, alpha2: 1, add: true, blink: 3,
      fn: (q) => {
        q.vx = q.vy = q.vz = 0;
        const t = q.t * sp + ph;
        q.x = cx + Math.cos(t) * rad + Math.sin(t * 2.3) * 0.3;
        q.z = cz + Math.sin(t) * rad;
        q.y = cy + Math.sin(t * 1.7) * 0.5;
      },
    });
  }

  buildDecor() {
    const rng = makeRng(5);
    // mound houses on the rims, with chimney smoke and glowing windows
    this.chimneys = this.chimneys || [];
    TOWN.houses.forEach((h, i) => {
      const hs = TW.moundHouse(40 + i);
      hs.obj.position.set(h.x, -0.15, h.z);
      hs.obj.rotation.y = h.yaw + Math.PI;
      this.addStatic(hs.obj);
      hs.obj.updateMatrixWorld(true);
      this.chimneys.push(new THREE.Vector3(hs.chimney.x, hs.chimney.y, hs.chimney.z).applyMatrix4(hs.obj.matrixWorld));
      const wi = new THREE.Vector3(hs.window.x, hs.window.y, hs.window.z).applyMatrix4(hs.obj.matrixWorld);
      this.addLight({ x: wi.x, y: wi.y, z: wi.z, color: 0xffb860, intensity: 0, real: false, halo: 0.9, haloOpacity: 0.4, flicker: 0.1 });
    });
    // glowing mushroom clumps along the edges
    const clumps = [[4.2, 12.0, 0], [4.0, 21.2, 1], [10.0, 26.7, 2], [28.6, 26.7, 0], [32.8, 20.0, 1], [32.6, 11.0, 2], [8.6, 4.0, 1], [27.9, 4.25, 0], [32.6, 15.0, 3], [15.2, 26.9, 0], [23.4, 26.95, 1], [3.6, 9.4, 2], [3.7, 16.1, 0]];
    clumps.forEach(([x, z, hue], i) => {
      const ry = rng() * 6;
      let c = null;
      place(this, () => (c = P.glowShrooms(i * 5 + 2, hue, 0.85 + (i % 3) * 0.2)), x, z, ry, { solid: false, low: true });
      this.map.addCircle(x, z, 0.28);
      this.addLight({ x, y: 0.4, z, color: c.color, intensity: 0, real: false, pool: 0.9, poolOpacity: 0.24, halo: 0.6, haloOpacity: 0.28, flicker: 0.04, speed: 0.3, bakePower: 0.55, bakeRadius: 1.8 });
    });
    // stalagmites, crystals and rocks on the rims
    for (const [x, z, h] of [[4.3, 26.6, 22], [33.0, 7.0, 26], [12.0, 27.15, 18], [20.5, 27.25, 24], [33.0, 19.4, 20], [26.2, 27.3, 16], [33.2, 24.6, 28], [7.4, 27.2, 14]]) place(this, () => P.stalagmite(Math.round(x * z), h), x, z, rng() * 6, { low: true });
    for (const [x, z, s, hue] of [[3.8, 3.75, 1.1, 1], [33.25, 3.9, 1.0, 0], [33.0, 26.9, 1.15, 2], [4.0, 26.95, 0.95, 3], [17.6, 27.15, 0.8, 1]]) {
      let c = null;
      place(this, () => (c = P.crystals(Math.round(x * 13 + z), s, hue)), x, z, rng() * 6, { low: true });
      this.addLight({ x, y: 0.8, z, color: c.color, intensity: 3.5, distance: 4.5, flicker: 0.05, speed: 0.3, pool: 1.5, poolOpacity: 0.26, halo: 1.2, hy: 0.7, haloOpacity: 0.3 });
    }
    for (const [x, z, w, d] of [[30.6, 26.9, 1.3, 0.8], [8.6, 26.95, 1.0, 0.7], [33.15, 22.3, 0.8, 1.2]]) place(this, () => P.rubble(Math.round(x + z), w, d), x, z, 0, { solid: false, low: true });
    // barrels, crates & sacks: by the assay, the lift, the shops' gaps
    const clutter = [[22.2, 4.6, 'b', 0], [21.7, 5.15, 'c', 0.3], [33.0, 10.3, 'c', 0.1], [32.9, 11.1, 'b', 0], [9.0, 4.4, 's', 0], [8.95, 5.0, 'b', 0], [3.75, 10.25, 'c', 0.2], [3.7, 15.9, 's', 0], [3.75, 21.25, 'b', 0], [15.6, 4.1, 'c', 0.15], [11.9, 4.15, 's', 0.4]];
    for (const [x, z, k, ry] of clutter) {
      const fill = rng() < 0.3 ? 'water' : null, sc = rng() < 0.5 ? 0xc8b08a : 0xa88a5a, yaw = ry + rng() * 0.4;
      place(this, () => (k === 'b' ? P.barrel(Math.round(x * 3 + z), { fill }) : k === 'c' ? P.crate(Math.round(z * 5)) : P.sack({ color: sc })), x, z, yaw, { low: Math.hypot(x - TOWN.home.door.x, z - TOWN.home.door.z) > 3 });
    }
    place(this, () => P.handCart(3), 26.9, 15.6, -0.35);
    place(this, () => P.woodpile(2), 14.3, 4.05, 0);
    place(this, () => P.pottedFern(1), 16.1, 6.6, 0);
    place(this, () => P.pottedFern(2), 20.9, 6.6, 0);
    place(this, () => P.mailboxes(3, 2), 8.95, 6.35, 0);
    // string lights: from the booth's roof to the plaza lamps, and along the promenades
    const B = TOWN.booth;
    const strands = [
      [{ x: B.x0 + 0.2, y: 2.75, z: B.z0 + B.d }, { x: 14.3 + 0.3, y: 2.25, z: 11.2 }],
      [{ x: B.x0 + B.w - 0.2, y: 2.75, z: B.z0 + B.d }, { x: 22.7 + 0.3, y: 2.25, z: 11.2 }],
      [{ x: 6.7 + 0.3, y: 2.25, z: 7.2 }, { x: 15.35 + 0.3, y: 2.25, z: 5.35 }],
      [{ x: 6.7 + 0.3, y: 2.25, z: 18.4 }, { x: 14.3 + 0.3, y: 2.25, z: 19.8 }],
    ];
    strands.forEach(([a, b], i) => {
      const gl = TW.garland(a, b, i * 2);
      this.addStatic(gl.obj);
      const mid = gl.points[Math.floor(gl.points.length / 2)];
      this.addLight({ x: mid.x, y: mid.y, z: mid.z, color: 0xffc080, intensity: 0, real: false, pool: 1.6, poolOpacity: 0.12, poolX: mid.x, poolZ: mid.z, flicker: 0.05, bakePower: 0.35, bakeRadius: 2 });
    });
    // ceiling drips at a few spots
    this.drips = [[12.4, 3.4], [25.2, 3.4], [3.4, 17.6], [32.8, 13.5], [17.2, 3.5], [6.0, 3.4]];
  }

  buildSunbeam() {
    const S = TOWN.sun;
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0xfff1c8, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const L = 16, tilt = SUN_TILT;
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.0, L), beamMat);
    const off = L / 2;
    beam.position.set(S.x - off * Math.sin(tilt) * Math.SQRT1_2, off * Math.cos(tilt) - 0.1, S.z + off * Math.sin(tilt) * Math.SQRT1_2);
    beam.rotation.set(0, Math.PI / 4, tilt);
    beam.renderOrder = 8;
    this.scene.add(beam);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.0, L), beamMat.clone());
    inner.material.opacity = 0.24;
    inner.position.copy(beam.position);
    inner.rotation.copy(beam.rotation);
    inner.renderOrder = 8;
    this.scene.add(inner);
    this.beam = { outer: beam, inner };
    const spotMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0xfff0b0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const spot = new THREE.Mesh(flatPlane(), spotMat);
    spot.scale.set(S.r * 2.6, 1, S.r * 2.3);
    spot.position.set(S.x, 0.03, S.z);
    spot.renderOrder = 3;
    this.scene.add(spot);
    this.addStatic(TW.sunPatch());
    this.addLight({ x: S.x, y: 3.2, z: S.z, color: 0xfff0d0, intensity: 9, distance: 6, flicker: 0, real: true, priority: 4 });
    this.particles.addEmitter({
      every: 0.16,
      when: () => this.near(S.x, S.z, 15),
      emit: (p) => {
        const y = rand(0.2, 6), a = rand(0, 6.28), r = rand(0, 0.8);
        const lean = y * Math.tan(SUN_TILT) * Math.SQRT1_2;
        p.spawn({ x: S.x + Math.cos(a) * r - lean, y, z: S.z + Math.sin(a) * r * 0.9 + lean, vy: rand(-0.05, 0.08), vx: rand(-0.05, 0.05), life: rand(3, 5.5), size: rand(1, 1.6), color: 0xfff8d8, alpha: 0.9, alpha2: 0, add: true, wob: 0.18, blink: 5 });
      },
    });
    this.addInteractable({ x: S.x, z: S.z, size: 0.4, r: 0.9, priority: -0.5, label: 'Stand in the sunlight', action: () => this.bask() });
  }

  near(x, z, r) { const f = this.cam.focus; return (f.x - x) ** 2 + (f.z - z) ** 2 < r * r; }

  // ------------------------------------------------------------ keepers
  spawnKeepers() {
    this.keepers = [];
    const mk = (id, spec, pos, yaw, label) => {
      const rig = makeCharacter({ seed: 9, eyes: 'bead', dirt: 0.2, blush: true, ...spec, hat: spec.hat || 'none', glasses: spec.glasses || false });
      const a = new Actor(rig, { x: pos.x, z: pos.z, yaw, name: spec.name, voice: spec.voice, radius: 0.27 });
      this.addActor(a);
      a.solid = true;
      const k = { id, a, spec, home: { x: pos.x, z: pos.z, yaw }, armed: true, cool: 0, lookT: rand(1, 4) };
      this.keepers.push(k);
      this.addInteractable({ actor: a, r: id === 'ticket' ? 2.0 : 1.55, priority: 0.3, label, action: () => this.useKeeper(k) });
      return k;
    };
    for (const s of TOWN.shops) {
      const info = this.shopInfo[s.id];
      const sh = SHOPS[s.id];
      mk(s.id, sh.keeper, info.door, info.yaw, s.id === 'assay' ? `Sell to ${sh.keeper.name}` : `Shop at ${sh.name}`);
    }
    const tk = this.shopInfo.ticket;
    const fox = mk('ticket', SHOPS.ticket.keeper, tk.door, 0, 'Surface Express tickets');
    fox.a.collide = false;
    fox.a.shadow.visible = false;
    fox.a.body.position.y = 0.42; // standing on a step behind the ticket window
    const L = TOWN.lift;
    this.bramble = mk('lift', BRAMBLE, L.op, Math.PI / 2 - 0.4, 'Ride the lift');
  }

  useKeeper(k) {
    const p = this.player;
    k.a.faceToward(p.x, p.z);
    p.faceToward(k.a.x, k.a.z);
    k.a.rig.doEmote('wave', 0.9);
    k.armed = false;
    k.cool = 25;
    if (k.id === 'lift') { this.openLiftPanel(); return; }
    this.game.ui.openShop(k.id);
  }

  updateKeepers(dt) {
    const p = this.player;
    if (!p) return;
    for (const k of this.keepers) {
      const a = k.a;
      const d = a.dist(p.x, p.z);
      k.cool -= dt;
      if (d < 4.2 && !this.locked) {
        a.faceToward(p.x, p.z);
        if (k.armed && d < 3.3) {
          k.armed = false;
          k.cool = 25;
          const lines = k.id === 'lift' ? BRAMBLE_LINES : SHOPS[k.id].lines;
          this.say(a, pick(lines), { name: k.spec.name, voice: k.spec.voice, life: 4.5 });
        }
      } else {
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

  // ------------------------------------------------------------ the lift
  openLiftPanel() {
    if (this.locked) return;
    const st = this.game.state;
    // lift stations found down in the deep (station 0, the top of the shaft, is always there)
    const found = [...new Set([0, ...(st.data.deep?.stations || []).map((n) => n | 0).filter((n) => n >= 0)])].sort((a, b) => a - b);
    const list = el('div', { class: 'list' });
    for (const n of found) {
      const Z = ZONES[n] || null;
      const dep = DEEP_DEPTHS[n];
      const color = n === 0 ? '#6a5a4a' : Z?.color || '#5a4a5a';
      const tag = el('div', { style: { width: 'calc(var(--px) * 16)', height: 'calc(var(--px) * 16)', background: color, border: 'var(--px) solid var(--wood-dk)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, textShadow: '0 var(--px) 0 #000', fontFamily: 'var(--font-display)', fontSize: '1.3em' } }, String(n));
      const name = n === 0 ? 'Top of the shaft' : Z ? `${Z.name} station` : `Station ${n}`;
      const desc = n === 0 ? 'Just below town. Soft earth and roots: a good place to start digging.' : Z?.desc || 'A lift stop you found on the way down.';
      const row = el('div', { class: 'li interactive', style: { cursor: 'pointer' }, onclick: () => { h.close(); this.rideDown(n); } }, [
        tag,
        el('div', {}, [
          el('div', { class: 'name' }, name),
          el('div', { class: 'desc' }, desc),
          Z && n > 0 ? el('div', { class: 'desc', style: { color: '#9a3a22' } }, '⚠ ' + Z.hazard) : null,
        ]),
        el('span', { class: 'price', style: { flexDirection: 'column', alignItems: 'flex-end', fontSize: '.85em' } }, [dep ? `${dep[0]}–${dep[1]} m` : '', el('span', { class: 'btn', style: { marginTop: 'calc(var(--px) * 1.5)', padding: '0 calc(var(--px) * 3)' } }, 'Go')]),
      ]);
      list.append(row);
    }
    const next = found[found.length - 1] + 1;
    if (next <= MAX_ZONE) {
      list.append(el('div', { class: 'li locked' }, [
        el('div', { style: { width: 'calc(var(--px) * 16)', height: 'calc(var(--px) * 16)', background: '#3a2a2a', border: 'var(--px) solid var(--wood-dk)', display: 'grid', placeItems: 'center', color: '#a08070' } }, '?'),
        el('div', {}, [el('div', { class: 'name' }, '???'), el('div', { class: 'desc' }, 'The cable goes deeper. Find the next station down there and ring its bell.')]),
        el('span', { class: 'price' }, DEEP_DEPTHS[next] ? `${DEEP_DEPTHS[next][0]}+ m` : ''),
      ]));
    }
    this.game.audio.play('babble', { pitch: BRAMBLE.voice, n: 4 });
    const h = this.game.ui.openPanel({ title: 'The Lift', sub: '<b>Bramble:</b> Where to, digger?', body: el('div', { class: 'scroll', style: { maxHeight: 'min(calc(100vh - 180px), calc(var(--px) * 150))' } }, [list]), width: 'calc(var(--px) * 220)' });
  }

  /** Walk an actor (no collision) to a point. */
  walkTo(a, x, z, speed = 1.8) {
    return new Promise((res) => {
      a.collide = false;
      a.scripted = true;
      const tick = (dt) => {
        const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz);
        if (d < 0.06) {
          a.drive(dt, 0, 0, null);
          a.scripted = false;
          this.tickers.splice(this.tickers.indexOf(tick), 1);
          res();
          return;
        }
        const sp = Math.min(speed, d * 4 + 0.3);
        a.drive(dt, (dx / d) * sp, (dz / d) * sp, null, { accel: 20 });
      };
      this.tickers.push(tick);
    });
  }

  async rideDown(station) {
    if (this.locked) return;
    const st = this.game.state;
    const L = TOWN.lift;
    st.learn('elevator');
    this.game.audio.play('bell');
    this.locked = true;
    this.camFocus = new THREE.Vector3(L.cage.x - 0.5, 0.4, L.cage.z + 1.5);
    const p = this.player, n = this.nugget;
    this.say(this.bramble.a, pick(['Hold on tight!', 'Down she goes!', 'Mind your whiskers!']), { name: 'Bramble', voice: BRAMBLE.voice });
    await this.tween(0.4, (k) => { this.cage.gate.position.x = k * 0.85; });
    this.game.audio.play('gate');
    if (n) { this.nuggetAI.mode = 'petted'; this.nuggetAI.pettedT = 99; n.collide = false; this.walkTo(n, L.cage.x + 0.45, L.cage.z - 0.2, 2.4); }
    await this.walkTo(p, L.front.x, L.front.z - 0.3, 2.2);
    await this.walkTo(p, L.cage.x - 0.2, L.cage.z + 0.1, 1.8);
    p.rig.face(0);
    await this.tween(0.45, (k) => { this.cage.gate.position.x = (1 - k) * 0.85; });
    this.game.audio.play('gate');
    this.bramble.a.rig.play('dig');
    const loop = this.game.audio.loop('elevator', { vol: 0.45 });
    await this.sleepFor(0.25);
    await this.tween(1.7, (k) => {
      const y = -k * k * 2.8;
      this.cage.obj.position.y = y;
      p.pos.y = y;
      if (n) n.pos.y = y;
      this.crank.wheel.rotation.z = k * 9;
    });
    loop.stop(0.3);
    this.game.goto('deep', { from: 'town', station }, { transition: 'fade', dur: 0.5 });
  }

  async arrive() {
    const L = TOWN.lift;
    const p = this.player, n = this.nugget;
    this.locked = true;
    p.collide = false;
    if (n) { n.collide = false; this.nuggetAI.mode = 'petted'; this.nuggetAI.pettedT = 99; }
    this.camFocus = new THREE.Vector3(L.cage.x - 0.5, 0.4, L.cage.z + 1.5);
    this.cam.snap(this.camFocus);
    const set = (y) => { this.cage.obj.position.y = y; p.pos.y = y; if (n) n.pos.y = y; };
    set(-2.8);
    this.bramble.a.rig.play('dig');
    await this.sleepFor(0.2);
    const loop = this.game.audio.loop('elevator', { vol: 0.45 });
    await this.tween(1.7, (k) => { const e = 1 - (1 - k) * (1 - k); set(-2.8 * (1 - e) + 0.07 * e); this.crank.wheel.rotation.z = -k * 9; });
    loop.stop(0.2);
    await this.tween(0.3, (k) => set(0.07 * (1 - k)));
    set(0);
    this.game.audio.play('clunk');
    this.game.audio.play('bell');
    this.bramble.a.rig.play('idle');
    await this.tween(0.45, (k) => { this.cage.gate.position.x = k * 0.85; });
    this.game.audio.play('gate');
    this.say(this.bramble.a, pick(WELCOME_BACK), { name: 'Bramble', voice: BRAMBLE.voice });
    if (n) this.walkTo(n, L.front.x + 0.7, L.front.z + 0.6, 2.4).then(() => { n.collide = true; this.nuggetAI.mode = 'follow'; });
    await this.walkTo(p, L.front.x, L.front.z + 0.3, 2.0);
    p.collide = true;
    this.camFocus = null;
    this.locked = false;
    this.tween(0.45, (k) => { this.cage.gate.position.x = (1 - k) * 0.85; }).then(() => this.game.audio.play('gate'));
  }

  // ------------------------------------------------------------ other interactions
  goHome() {
    this.locked = true;
    this.game.state.flag('homeVisited', true);
    this.game.audio.play('door');
    this.player.faceToward(TOWN.home.door.x, TOWN.home.door.z - 1);
    const s = this.toScreen(this.player.headPos(_v));
    const e = this.game.engine;
    this.game.goto('home', { from: 'town' }, { transition: 'iris', center: [clamp(s.x / (e.width * e.scale), 0, 1), clamp(1 - s.y / (e.height * e.scale), 0, 1)] });
  }

  tossCoin() {
    const st = this.game.state;
    const F = TOWN.fountain;
    const p = this.player;
    if (!st.spend(1, 'wish')) { this.game.audio.play('ui_error'); return; }
    p.faceToward(F.x, F.z);
    p.rig.doEmote('nod', 0.5);
    this.game.audio.play('coins');
    const dx = F.x - p.x, dz = F.z - p.z, d = Math.hypot(dx, dz);
    const tx = p.x + (dx / d) * (d - 1.1), tz = p.z + (dz / d) * (d - 1.1);
    const T = 0.7;
    this.particles.spawn({
      x: p.x, y: 1.0, z: p.z, vx: (tx - p.x) / T, vz: (tz - p.z) / T, vy: 2.2, grav: 2 * (2.2 * T + 1.0 - 0.25) / (T * T), life: T, size: 3.6, color: 0xffe070, alpha: 1, alpha2: 1, add: true, blink: 30,
      fn: (q) => {
        if (Math.random() < 0.5) this.particles.spawn({ x: q.x, y: q.y, z: q.z, life: 0.3, size: 1.5, color: 0xfff0a0, alpha: 0.9, alpha2: 0, add: true });
        if (q.t >= T - 0.02 && !q.done) {
          q.done = true;
          this.game.audio.play('bloop');
          this.particles.burst(8, { x: q.x, y: 0.3, z: q.z, vy: 1.1, life: 0.45, size: 1.4, color: 0xd8f6ff, alpha: 0.9, alpha2: 0, grav: 5 }, { x: 0.05, z: 0.05, v: 0.5 });
          this.later(0.25, () => { this.emote(p, '✦', { color: '#d9a020' }); this.game.audio.play('sparkle'); });
        }
      },
    });
  }

  async bask() {
    const S = TOWN.sun;
    const p = this.player;
    this.locked = true;
    await this.walkTo(p, S.x, S.z + 0.1, 1.6);
    p.collide = true;
    p.rig.face(Math.PI * 0.75);
    p.rig.play('cheer');
    this.game.audio.play('glow');
    this.emote(p, '☀', { color: '#e0a020', life: 2.2 });
    this.particles.burst(14, { x: S.x, y: 1.2, z: S.z, vy: 0.6, life: 1.6, size: 1.6, color: 0xfff6c8, alpha: 1, alpha2: 0, add: true, wob: 0.8 }, { x: 0.5, y: 0.6, z: 0.5, v: 0.3 });
    await this.sleepFor(1.6);
    p.rig.play('idle');
    if (this.nugget && this.nuggetAI) this.nuggetAI.petted();
    this.locked = false;
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    WATER_TIME.value += dt;
    super.update(dt);
    this.pushPlayerFromActors();
    // tree fading when the player walks behind one
    const p = this.player;
    const cam = this.cam;
    for (const f of this.faders) {
      let target = 1;
      if (p) {
        const dx = p.x - f.x, dz = p.z - f.z;
        const sx = dx * cam.right.x + dz * cam.right.z;
        const up = dx * cam.groundUp.x + dz * cam.groundUp.z;
        if (Math.abs(sx) < f.r + 0.35 && up > -0.2 && up < f.h * 1.55) target = 0.3;
      }
      const nk = f.k + (target - f.k) * Math.min(1, dt * 6);
      if (Math.abs(nk - f.k) > 0.001) {
        f.k = nk;
        for (const m of f.mats) { m.opacity = nk; m.depthWrite = nk > 0.95; }
      }
    }
    if (this.ticketSign) this.ticketSign.position.y += Math.sin(this.time * 1.6) * 0.0016;
    // the home door's glow until it has been visited
    const hm = this.homeMarker;
    if (hm) {
      hm.t += dt;
      const k = 0.65 + 0.35 * Math.sin(hm.t * 3);
      hm.ring.mul = k; hm.halo.mul = k; hm.ring2.mul = 0.6 + 0.4 * Math.sin(hm.t * 3 + 1);
      hm.ring2.y = 2.42 + Math.sin(hm.t * 2) * 0.06;
      this.glow.place(hm.ring2);
      hm.gem.position.y = 2.18 + Math.abs(Math.sin(hm.t * 3)) * 0.14;
      hm.gem.rotation.y = Math.sin(hm.t * 1.3) * 0.5;
      if (p && Math.random() < dt * 3) this.particles.spawn({ x: TOWN.home.door.x + rand(-0.5, 0.5), y: rand(0.2, 1.8), z: TOWN.home.door.z + 0.25, vy: 0.25, life: 1.4, size: 1.5, color: 0xffe8a0, alpha: 1, alpha2: 0, add: true, blink: 6 });
    }
    // grindstone sparks at Grubb's
    this.sparkT = (this.sparkT ?? 3) - dt;
    if (this.sparkT <= 0 && this.grindstone) {
      this.sparkT = rand(3, 7);
      if (this.near(this.grindstone.x, this.grindstone.z, 11)) {
        this.particles.sparks(this.grindstone.x, 0.55, this.grindstone.z, 9, 0xffd060);
        if (p && Math.hypot(p.x - this.grindstone.x, p.z - this.grindstone.z) < 6) this.game.audio.play('chisel');
      }
    }
    // drips from the ceiling
    this.dripT -= dt;
    if (this.dripT <= 0) {
      this.dripT = rand(1.2, 3);
      const [x, z] = pick(this.drips);
      if (this.near(x, z, 12)) {
        this.particles.spawn({ x, y: 6.4, z, vy: -1, grav: 9, life: 1.3, size: 1.4, color: 0x9fd6ff, alpha: 0.9, alpha2: 0.9, fn: (q) => { if (q.y < 0.05 && !q.dead) { q.dead = true; this.particles.burst(4, { x: q.x, y: 0.05, z: q.z, vy: 0.7, grav: 5, life: 0.3, size: 1, color: 0xd8f6ff, alpha: 0.8, alpha2: 0 }, { x: 0.02, z: 0.02, v: 0.4 }); if (p && Math.hypot(p.x - x, p.z - z) < 5) this.game.audio.play('drip'); } } });
      }
    }
  }

  /** Keepers and grown-ups are solid: the player slides around them. */
  pushPlayerFromActors() {
    const p = this.player;
    if (!p || !p.collide) return;
    for (const a of this.actors) {
      if (a === p || a === this.nugget || !a.collide) continue;
      const min = p.radius + a.radius * 0.9;
      const dx = p.x - a.x, dz = p.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      p.pos.x = a.x + (dx / d) * min;
      p.pos.z = a.z + (dz / d) * min;
    }
    this.map.resolve(p.pos, p.radius);
  }

  exit() {
    disposeTextures(this.floorTex);
    super.exit();
  }
}
