// Deep Town: a cozy cavern town. Shops set into the cave walls, a fountain plaza,
// glowing mushroom trees, a sunbeam falling on the Surface Express booth, the mine
// lift (with Bramble at the crank), your burrow door and a crowd of townsfolk.
import * as THREE from 'three';
import { IsoScene, flatPlane } from '../iso/IsoScene.js';
import { Actor } from '../iso/Actor.js';
import { TOWN } from '../iso/townLayout.js';
import * as TW from '../iso/townWorld.js';
import * as TS from '../iso/townShops.js';
import { Townsfolk } from '../iso/TownNPCs.js';
import { Batch, keepUnbatched } from '../iso/vox.js';
import { WATER_TIME } from '../iso/water.js';
import { beamTexture, poolTexture } from '../iso/pixel.js';
import { SHOPS } from '../data/shops.js';
import { ZONES, MAX_ZONE } from '../data/zones.js';
import { makeCharacter } from '../gfx/characters.js';
import { pixelTexture } from '../gfx/PixelArt.js';
import { el, rand, pick, chance, clamp, makeRng } from '../core/util.js';

const _v = new THREE.Vector3();
const SUN_TILT = 0.13; // how far the sunbeam leans back toward its crack in the ceiling
const BRAMBLE = { name: 'Bramble', species: 'vole', age: 'elder', body: 'stocky', fur: 0x8a6a4a, outfit: 'overalls', outfitColor: 0x7a5a3a, hat: 'cap', hatColor: 0x3a5a3a, eyes: 'happy', brows: 'bushy', dirt: 0.6, seed: 31, blush: true, voice: 250 };
const BRAMBLE_LINES = [
  'Going down? Hop in, mind the gap.',
  'She creaks, but she has never dropped anyone. Twice.',
  'The deeper stops open once you have dug to the bottom of one.',
  'Bring me back something shiny, eh?',
  'Hold on to your helmet. And your chicken.',
];
const WELCOME_BACK = ['Welcome back up! Still got all your claws?', 'Back in one piece! Mostly dirt, though.', 'Up you come. Old Vex will want a look at that haul.'];

export default class TownScene extends IsoScene {
  async enter(params = {}) {
    this.hud = 'town';
    this.music = 'town';
    const st = this.game.state;
    st.flag('lastScene', 'town');
    this.initIso({ w: TOWN.W, h: TOWN.H, zoom: 11.5, minZoom: 7, maxZoom: 14.5, lights: 6, lightRange: 11.5, bg: 0x0b0710 });
    this.cam.bounds = { minX: 6.5, maxX: 30.5, minZ: 6.2, maxZ: 25.2 };
    this.post = { vignette: 0.5, saturation: 1.1 };
    WATER_TIME.value = 0;

    this.scene.add(new THREE.HemisphereLight(0xa898c8, 0x4a3426, 1.45));
    const key = new THREE.DirectionalLight(0xffe2c8, 0.6);
    key.position.set(-4, 10, 6);
    this.scene.add(key);

    this.batch = new Batch(12);
    this.faders = [];
    this.buildFloor();
    this.buildCaves();
    this.buildShops();
    this.buildBooth();
    this.buildHomeDoor();
    this.buildLift();
    this.buildPlaza();
    this.buildDecor();
    this.buildSunbeam();
    const statics = new THREE.Group();
    this.scene.add(statics);
    this.batch.build(statics, this.cam.back);
    for (const o of this.unbatched) keepUnbatched(o, this.scene);

    this.spawnKeepers();
    this.folk = new Townsfolk(this);
    this.folk.spawnAll();
    this.tickers.push((dt) => this.folk.update(dt));
    this.tickers.push((dt) => this.updateKeepers(dt));

    // player + Nugget
    const from = params.from || 'home';
    if (from === 'mine') {
      this.spawnPlayer(TOWN.lift.cage.x, TOWN.lift.cage.z, 0);
      this.spawnNugget(TOWN.lift.cage.x + 0.45, TOWN.lift.cage.z - 0.3);
      this.arrive();
    } else if (from === 'ending') {
      // back from the surface: standing in the sunbeam by the booth
      const S = TOWN.sun;
      this.spawnPlayer(S.x, S.z + 0.2, Math.PI * 0.75);
      this.spawnNugget(S.x + 0.6, S.z + 0.7);
    } else {
      const sp = TOWN.home.spawn;
      this.spawnPlayer(sp.x, sp.z, 0);
      this.spawnNugget(sp.x + 0.7, sp.z + 0.4);
      if (from === 'home') this.game.audio.play('door');
    }
    this.ambientLoop('water', () => (this.player ? 0.3 * clamp(1 - Math.hypot(this.player.x - TOWN.fountain.x, this.player.z - TOWN.fountain.z) / 8, 0, 1) : 0));
    this.dripT = 3;
  }

  // ------------------------------------------------------------ static world
  addStatic(obj) {
    this.batch.add(obj);
    (this.unbatched ||= []).push(obj);
  }

  buildFloor() {
    const { W, H } = TOWN;
    const pc = TW.paintTownFloor();
    this.floorTex = pixelTexture(pc.commit());
    // per-tile quads so the lift shaft can be a real hole
    const L = TOWN.lift;
    const hole = (x, z) => x >= L.cage.x - 1 && x < L.cage.x + 1 && z >= L.cage.z - 1 && z < L.cage.z + 1;
    const pos = [], uv = [], nor = [], idx = [];
    let v = 0;
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
      if (hole(x, z)) continue;
      for (const [dx, dz] of [[0, 0], [0, 1], [1, 1], [1, 0]]) {
        pos.push(x + dx, 0, z + dz);
        uv.push((x + dx) / W, 1 - (z + dz) / H);
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
    const floor = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: this.floorTex }));
    this.scene.add(floor);
    // tile materials for footsteps
    for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) this.map.setMat(x, z, TW.floorMaterialAt(x + 0.5, z + 0.5));
  }

  buildCaves() {
    const map = this.map;
    const { W, H, northFace, westFace } = TOWN;
    map.fill(0, 0, W, northFace, 1);
    map.fill(0, 0, westFace, H, 1);
    map.fill(0, Math.floor(TOWN.southRim), W, H, 1);
    map.fill(Math.floor(TOWN.eastRim), 0, W, H, 1);
    const flatN = TOWN.shops.filter((s) => s.wall === 'N').map((s) => [s.a, s.a + s.w]).concat([[TOWN.booth.x0, TOWN.booth.x0 + TOWN.booth.w], [TOWN.home.x0 - 0.2, TOWN.home.x0 + TOWN.home.w + 0.2]]);
    const flatW = TOWN.shops.filter((s) => s.wall === 'W').map((s) => [s.a, s.a + s.w]);
    for (let u = 0; u < 36; u += 9) this.addStatic(TW.rockWall('N', Math.max(u, westFace - 1), Math.min(u + 9, 36.5), { flat: flatN }));
    for (let u = 0; u < 30; u += 10) this.addStatic(TW.rockWall('W', Math.max(u, northFace - 1), Math.min(u + 10, 31), { flat: flatW }));
    this.addStatic(TW.rockBlock(0, 0, westFace - 0.2, northFace - 0.2));
    for (let u = 0; u < 38; u += 12.5) this.addStatic(TW.rockRim('S', u, Math.min(u + 12.5, 37.5)));
    for (let u = 0; u < 28; u += 14) this.addStatic(TW.rockRim('E', u, Math.min(u + 14, TOWN.southRim)));
    // crystals set into the walls, some casting colored light
    const rng = makeRng(99);
    const spots = [[2.95, 1.4, 12.3, 'N'], [2.9, 2.8, 14.5, 'N'], [2.95, 0.6, 21.6, 'N'], [3.0, 3.1, 28.0, 'N'], [3.0, 1.0, 4.0, 'W'], [2.95, 2.5, 26.9, 'W'], [3.0, 0.5, 15.8, 'W'], [3.0, 3.4, 9.0, 'N'], [3.0, 3.0, 33.4, 'N']];
    spots.forEach(([face, y, u, wall], i) => {
      const c = TW.crystalCluster(i * 7 + 3, 0.8 + rng() * 0.6);
      const o = c.obj;
      if (wall === 'N') { o.position.set(u, y, face); o.rotation.x = Math.PI / 2 - 0.45; } else { o.position.set(face, y, u); o.rotation.z = -(Math.PI / 2 - 0.45); }
      this.addStatic(o);
      const lx = wall === 'N' ? u : face + 0.5, lz = wall === 'N' ? face + 0.5 : u;
      this.addLight({ x: lx, y: y + 0.2, z: lz, color: c.color, intensity: y < 2 ? 3 : 0, distance: 4, flicker: 0.05, speed: 0.3, real: y < 2 && i % 2 === 0, pool: y < 2 ? 1.2 : 0, poolX: wall === 'N' ? u : face + 0.9, poolZ: wall === 'N' ? face + 0.9 : u, poolOpacity: 0.22, halo: 1.1, haloOpacity: 0.3 });
    });
    // floor crystal clumps near the corners
    for (const [x, z, s] of [[3.7, 3.6, 1.2], [33.2, 3.9, 1.0], [33.0, 26.8, 1.1], [4.0, 26.9, 1.0]]) {
      const c = TW.crystalCluster(Math.round(x * 13 + z), s);
      c.obj.position.set(x, 0, z);
      this.addStatic(c.obj);
      this.addLight({ x, y: 0.8, z, color: c.color, intensity: 3.5, distance: 4.5, flicker: 0.05, speed: 0.3, pool: 1.5, poolOpacity: 0.28, halo: 1.2, hy: 0.7, haloOpacity: 0.3 });
    }
    // vines hanging from the walls
    for (let i = 0; i < 22; i++) {
      const north = i % 2 === 0;
      const u = north ? 4 + rng() * 30 : 4 + rng() * 22;
      const flat = (north ? flatN : flatW).some(([a, b]) => u > a - 0.3 && u < b + 0.3);
      if (flat && rng() < 0.7) continue;
      const vn = TW.vine(i * 17 + 5, 18 + Math.floor(rng() * 26));
      if (north) { vn.position.set(u, 4.6 + rng() * 1.2, TOWN.northFace + 0.08); } else { vn.position.set(TOWN.westFace + 0.08, 4.6 + rng() * 1.2, u); vn.rotation.y = Math.PI / 2; }
      this.addStatic(vn);
    }
  }

  buildShops() {
    this.shopInfo = {};
    for (const s of TOWN.shops) {
      const b = TS.buildShop(s.id, s.w);
      const o = b.obj;
      const toWorld = (lx, lz) => (s.wall === 'N' ? { x: s.a + lx, z: TOWN.northFace + lz } : { x: TOWN.westFace + lz, z: s.a + s.w - lx });
      if (s.wall === 'N') o.position.set(s.a, 0, TOWN.northFace);
      else { o.position.set(TOWN.westFace, 0, s.a + s.w); o.rotation.y = Math.PI / 2; }
      this.addStatic(o);
      if (s.wall === 'N') this.map.fill(Math.floor(s.a), TOWN.northFace, Math.ceil(s.w), 1, 1);
      else this.map.fill(TOWN.westFace, Math.floor(s.a), 1, Math.ceil(s.w), 1);
      for (const pr of b.props) {
        const w = toWorld(pr.x, pr.z);
        this.map.addCircle(w.x, w.z, pr.r);
        this.map.navCircle(w.x, w.z, 0.55);
      }
      for (const l of b.lights) {
        const w = toWorld(l.x, l.z);
        this.addLight({ x: w.x, y: l.y, z: w.z, color: 0xffb860, intensity: 3.2, distance: 4.5, flicker: 0.16, pool: 1.1, poolOpacity: 0.26, halo: 0.55, haloOpacity: 0.55 });
      }
      const door = toWorld(b.door.u, 1.48);
      this.shopInfo[s.id] = { door, yaw: s.wall === 'N' ? 0 : Math.PI / 2, wall: s.wall };
      if (s.id === 'tools') this.grindstone = toWorld(0.75, 1.55);
    }
  }

  buildBooth() {
    const B = TOWN.booth;
    const b = TS.ticketBooth();
    b.obj.position.set(B.x0, 0, B.z0);
    this.addStatic(b.obj);
    this.ticketSign = b.ticket;
    this.map.fill(B.x0, B.z0, B.w, B.d, 1);
    for (const l of b.lights) this.addLight({ x: B.x0 + l.x, y: l.y, z: B.z0 + l.z, color: 0xffd890, intensity: 3, distance: 4.5, flicker: 0.08, pool: 1.0, poolOpacity: 0.22, halo: 0.6, haloOpacity: 0.5 });
    this.shopInfo.ticket = { door: { x: B.x0 + B.w / 2, z: B.z0 + 2.05 }, yaw: 0 };
  }

  buildHomeDoor() {
    const h = TOWN.home;
    const d = TS.homeDoor();
    d.obj.position.set(h.x0 + h.w / 2, 0, TOWN.northFace - 0.1);
    this.addStatic(d.obj);
    this.map.fill(Math.floor(h.x0), TOWN.northFace, h.w, 1, 1);
    this.addLight({ x: h.door.x, y: 1.2, z: h.door.z + 0.3, color: 0xffd27a, intensity: 2.5, distance: 3.5, flicker: 0.1, real: false, pool: 0.9, poolOpacity: 0.25, poolZ: h.door.z + 0.7, halo: 0.5, hy: 1.2, hz: h.door.z - 0.25, haloOpacity: 0.45 });
    this.addInteractable({ x: h.door.x, z: h.door.z, r: 1.2, label: 'Go home', action: () => this.goHome() });
  }

  buildLift() {
    const L = TOWN.lift;
    const lf = TS.mineLift();
    lf.obj.position.set(L.x0, 0, L.z0);
    this.addStatic(lf.obj);
    this.addLight({ x: L.x0 + lf.light.x, y: lf.light.y, z: L.z0 + lf.light.z, color: 0xffc070, intensity: 5, distance: 6, flicker: 0.12, pool: 1.6, poolOpacity: 0.26, halo: 0.6, haloOpacity: 0.55 });
    // the shaft and posts
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
    // tracks, cart, ore pile
    this.addStatic(TW.tracks());
    const cart = TW.oreCart();
    cart.position.set(TOWN.cart.x, 0, TOWN.cart.z);
    this.addStatic(cart);
    this.map.addCircle(TOWN.cart.x, TOWN.cart.z - 0.3, 0.45);
    this.map.addCircle(TOWN.cart.x, TOWN.cart.z + 0.3, 0.45);
    this.map.navCircle(TOWN.cart.x, TOWN.cart.z, 0.9);
    const pile = TW.orePile();
    pile.position.set(TOWN.orePile.x, 0, TOWN.orePile.z);
    this.addStatic(pile);
    this.map.addCircle(TOWN.orePile.x, TOWN.orePile.z, 0.62);
    this.map.navCircle(TOWN.orePile.x, TOWN.orePile.z, 0.8);
  }

  buildPlaza() {
    const F = TOWN.fountain;
    const f = TW.fountain();
    this.addStatic(f.obj);
    this.fountainInfo = f;
    this.map.addCircle(F.x, F.z, F.r + 0.05);
    this.map.navCircle(F.x, F.z, F.r + 0.45);
    this.addLight({ x: F.x, y: f.crystal.y + 0.3, z: F.z, color: 0x7fd0ff, intensity: 7, distance: 7.5, flicker: 0.04, speed: 0.3, pool: 3.0, poolOpacity: 0.2, halo: 1.3, hy: f.crystal.y + 0.25, haloOpacity: 0.45, priority: 1 });
    this.addInteractable({ x: F.x, z: F.z, size: F.r, r: 0.95, priority: -0.1, label: 'Toss a coin in (1 G)', action: () => this.tossCoin() });
    // spray: droplets arc from the bowl rim into the basin
    const P = this.particles;
    P.addEmitter({
      every: 0.045,
      emit: (p) => {
        const a = Math.random() * Math.PI * 2;
        const r0 = f.bowlR;
        p.spawn({ x: F.x + Math.cos(a) * r0, y: f.bowlY, z: F.z + Math.sin(a) * r0, vx: Math.cos(a) * rand(0.35, 0.6), vz: Math.sin(a) * rand(0.35, 0.6), vy: rand(0.2, 0.6), grav: 5, life: 1.0, size: 1.5, color: 0xd8f6ff, color2: 0x7ac8f0, alpha: 0.95, alpha2: 0.4, fn: (q) => { if (q.y < f.basinY) { q.dead = true; if (Math.random() < 0.3) p.spawn({ x: q.x, y: f.basinY + 0.02, z: q.z, vy: 0.5, grav: 3, life: 0.25, size: 1, color: 0xffffff, alpha: 0.8 }); } } });
      },
      when: () => this.near(F.x, F.z, 14),
    });
    P.addEmitter({
      every: 0.12,
      emit: (p) => p.spawn({ x: F.x + rand(-0.06, 0.06), y: f.crystal.y - 0.2, z: F.z + rand(-0.06, 0.06), vy: rand(0.9, 1.3), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), grav: 3.2, life: 0.9, size: 1.3, color: 0xe8fbff, alpha: 0.85, alpha2: 0.2, fn: (q) => { if (q.y < f.bowlY && q.t > 0.2) q.dead = true; } }),
      when: () => this.near(F.x, F.z, 14),
    });
    // benches
    this.benchSeats = [];
    TOWN.benches.forEach((b, i) => {
      const m = TW.bench();
      m.position.set(b.x, 0, b.z);
      m.rotation.y = b.yaw;
      this.addStatic(m);
      for (const side of [-1, 1]) {
        const x = b.x + Math.cos(b.yaw) * 0.5 * side, z = b.z - Math.sin(b.yaw) * 0.5 * side;
        this.map.addCircle(x, z, 0.32);
        this.map.navCircle(x, z, 0.5);
      }
      const taken = { 0: [-1, 1], 1: [-1], 2: [1] }[i] || [];
      for (const side of [-1, 1]) {
        if (taken.includes(side)) continue;
        const sx = b.x + Math.cos(b.yaw) * 0.42 * side, sz = b.z - Math.sin(b.yaw) * 0.42 * side;
        this.benchSeats.push({ x: sx, z: sz, yaw: b.yaw, exitX: sx + Math.sin(b.yaw) * 0.85, exitZ: sz + Math.cos(b.yaw) * 0.85 });
      }
    });
    for (const seat of this.benchSeats) this.addInteractable({ x: seat.x, z: seat.z, r: 0.95, priority: -0.4, label: 'Sit on the bench', action: () => this.sitOn({ ...seat, y: 0.22 }) });
    // lamp posts
    TOWN.lamps.forEach((l, i) => {
      const lp = TW.lampPost(i);
      lp.obj.position.set(l.x, 0, l.z);
      lp.obj.rotation.y = i % 2 ? Math.PI / 2 : 0;
      this.addStatic(lp.obj);
      this.map.addCircle(l.x, l.z, 0.16);
      const off = i % 2 ? { x: 0, z: -lp.light.x } : { x: lp.light.x, z: 0 };
      this.addLight({ x: l.x + off.x, y: lp.light.y, z: l.z + off.z, color: 0xffc070, intensity: 6, distance: 6.5, flicker: 0.12, pool: 1.9, poolOpacity: 0.3, halo: 0.75, haloOpacity: 0.6 });
    });
    // giant glowing mushroom trees (fade when you walk behind them)
    for (const t of TOWN.trees) {
      const tr = TW.mushroomTree(t);
      this.scene.add(tr.obj);
      this.faders.push({ obj: tr.obj, mats: tr.mats, x: t.x, z: t.z, r: t.r, h: t.h, k: 1 });
      this.map.addCircle(t.x, t.z, 0.42);
      this.map.navCircle(t.x, t.z, 0.6);
      this.addLight({ x: t.x, y: tr.light.y, z: t.z, color: tr.light.color, intensity: 5, distance: 7, flicker: 0.05, speed: 0.25, pool: t.r + 0.9, poolOpacity: 0.26, halo: 0, real: true });
      // spores drifting down + glow beetles circling
      this.particles.addEmitter({ every: 0.5, when: () => this.near(t.x, t.z, 12), emit: (p) => { const a = rand(0, 6.28), r = rand(0, t.r); p.spawn({ x: t.x + Math.cos(a) * r, y: t.h - 0.4, z: t.z + Math.sin(a) * r, vy: -rand(0.12, 0.25), life: rand(4, 7), size: 1.2, color: tr.light.color, alpha: 0.9, alpha2: 0, add: true, wob: 0.35 }); } });
      for (let k = 0; k < 3; k++) this.spawnBeetle(t.x, t.z, t.h * 0.55);
    }
  }

  spawnBeetle(cx, cz, cy) {
    const ph = rand(0, 6.28), rad = rand(0.8, 2.2), sp = rand(0.4, 0.9) * (chance(0.5) ? 1 : -1);
    this.particles.spawn({
      x: cx, y: cy, z: cz, life: 1e9, size: 1.6, color: 0xc8ff7a, alpha: 1, alpha2: 1, add: true, blink: 3,
      fn: (q, dt) => {
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
    TOWN.houses.forEach((h, i) => {
      const hs = TW.moundHouse(40 + i);
      hs.obj.position.set(h.x, -0.15, h.z);
      hs.obj.rotation.y = h.yaw + Math.PI;
      this.addStatic(hs.obj);
      hs.obj.updateMatrixWorld(true);
      const ch = new THREE.Vector3(hs.chimney.x, hs.chimney.y, hs.chimney.z).applyMatrix4(hs.obj.matrixWorld);
      const wi = new THREE.Vector3(hs.window.x, hs.window.y, hs.window.z).applyMatrix4(hs.obj.matrixWorld);
      this.particles.addEmitter({ every: 0.4, when: () => this.near(ch.x, ch.z, 16), emit: (p) => p.spawn({ x: ch.x + rand(-0.05, 0.05), y: ch.y, z: ch.z + rand(-0.05, 0.05), vy: rand(0.35, 0.55), vx: 0.08, life: rand(2.5, 3.5), size: 2.5, size2: 6, color: 0x8a8090, color2: 0x4a4450, alpha: 0.5, alpha2: 0, wob: 0.25 }) });
      this.addLight({ x: wi.x, y: wi.y, z: wi.z, color: 0xffb860, intensity: 0, real: false, halo: 0.9, haloOpacity: 0.4, flicker: 0.1 });
    });
    // shroom clumps, stalagmites and rocks along the edges
    const clumps = [[4.2, 12.0], [4.0, 21.2], [10.0, 26.7], [28.6, 26.7], [32.8, 20.0], [32.6, 11.0], [8.6, 4.0], [27.9, 4.0], [21.6, 3.6], [32.6, 15.0]];
    clumps.forEach(([x, z], i) => {
      const c = TW.glowShrooms(i * 5 + 2, i % 3);
      c.obj.position.set(x, 0, z);
      this.addStatic(c.obj);
      this.map.addCircle(x, z, 0.3);
      this.addLight({ x, y: 0.4, z, color: c.color, intensity: 0, real: false, pool: 0.9, poolOpacity: 0.25, halo: 0.6, haloOpacity: 0.3, flicker: 0.04, speed: 0.3 });
    });
    for (const [x, z, h] of [[4.3, 9.2, 12], [33.0, 7.0, 16], [12.0, 27.1, 10], [20.5, 27.2, 14], [33.0, 19.4, 12]]) {
      const s = TW.stalagmite(Math.round(x * z), h);
      s.position.set(x, 0, z);
      this.addStatic(s);
      this.map.addCircle(x, z, 0.25);
    }
    for (const [x, z, s] of [[30.4, 26.8, 1.1], [8.4, 26.9, 0.9], [33.1, 25.0, 1.0], [17.4, 26.9, 0.8]]) {
      const r = TW.rockLump(Math.round(x + z), s);
      r.position.set(x, 0, z);
      this.addStatic(r);
    }
    // barrels & crates by the lift and the assay
    for (const [x, z, kind] of [[27.6, 4.6, 'b'], [28.1, 3.7, 'c'], [33.0, 9.0, 'c'], [32.9, 9.8, 'b'], [21.8, 4.4, 's']]) {
      const o = kind === 'b' ? TW.barrel(Math.round(x)) : kind === 'c' ? TW.crate(Math.round(z)) : TW.sack();
      o.position.set(x, 0, z);
      o.rotation.y = rng() * 0.6;
      this.addStatic(o);
      this.map.addCircle(x, z, 0.32);
    }
    // string lights: from the booth's roof to the plaza lamps, and along the promenades
    const B = TOWN.booth;
    const strands = [
      [{ x: B.x0 + 0.2, y: 2.75, z: B.z0 + B.d }, { x: 14.3 + 0.3, y: 2.25, z: 11.2 }],
      [{ x: B.x0 + B.w - 0.2, y: 2.75, z: B.z0 + B.d }, { x: 22.7 + 0.3, y: 2.25, z: 11.2 }],
      [{ x: 6.7 + 0.3, y: 2.25, z: 7.2 }, { x: 12.6 + 0.3, y: 2.25, z: 5.4 }],
      [{ x: 6.7 + 0.3, y: 2.25, z: 18.4 }, { x: 14.3 + 0.3, y: 2.25, z: 19.8 }],
    ];
    strands.forEach(([a, b], i) => {
      const gl = TW.garland(a, b, i * 2);
      this.addStatic(gl.obj);
      const mid = gl.points[Math.floor(gl.points.length / 2)];
      this.addLight({ x: mid.x, y: mid.y, z: mid.z, color: 0xffc080, intensity: 0, real: false, pool: 1.6, poolOpacity: 0.12, poolX: mid.x, poolZ: mid.z, flicker: 0.05 });
    });
    const nb = TW.noticeBoard();
    nb.position.set(11.6, 0, 13.9);
    nb.rotation.y = Math.PI / 2 - 0.35;
    this.addStatic(nb);
    this.map.addCircle(11.6, 13.5, 0.25);
    this.map.addCircle(11.6, 14.3, 0.25);
    // ceiling drips at a few spots
    this.drips = [[12.4, 3.3], [25.2, 3.3], [3.3, 17.6], [32.8, 13.5]];
  }

  buildSunbeam() {
    const S = TOWN.sun;
    const beamMat = new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0xfff1c8, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    // slanted shaft: bottom on the sunny patch, top leaning back toward the hole far above
    // (a gentle lean keeps the shaft over the bare rock between the home door and the booth)
    const L = 16, tilt = SUN_TILT;
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.0, L), beamMat);
    const off = (L / 2);
    beam.position.set(S.x - off * Math.sin(tilt) * Math.SQRT1_2, off * Math.cos(tilt) - 0.1, S.z + off * Math.sin(tilt) * Math.SQRT1_2);
    beam.rotation.set(0, Math.PI / 4, tilt);
    beam.renderOrder = 8;
    this.scene.add(beam);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(1.0, L), beamMat.clone());
    inner.material.opacity = 0.3;
    inner.position.copy(beam.position);
    inner.rotation.copy(beam.rotation);
    inner.renderOrder = 8;
    this.scene.add(inner);
    this.beam = { outer: beam, inner };
    const spotMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0xfff0b0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const spot = new THREE.Mesh(flatPlane(), spotMat);
    spot.scale.set(S.r * 2.6, 1, S.r * 2.3);
    spot.position.set(S.x, 0.025, S.z);
    spot.renderOrder = 3;
    this.scene.add(spot);
    this.addStatic(TW.sunPatch());
    this.addLight({ x: S.x, y: 3.2, z: S.z, color: 0xfff0d0, intensity: 9, distance: 6, flicker: 0, real: true, priority: 4 });
    // dust motes dancing in the light
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
    const max = clamp(st.data.zoneMax || 1, 1, MAX_ZONE);
    const list = el('div', { class: 'list' });
    for (let z = 1; z <= max; z++) {
      const Z = ZONES[z];
      const tag = el('div', { style: { width: 'calc(var(--px) * 16)', height: 'calc(var(--px) * 16)', background: Z.color, border: 'var(--px) solid var(--wood-dk)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, textShadow: '0 var(--px) 0 #000', fontFamily: 'var(--font-display)', fontSize: '1.3em' } }, String(z));
      const row = el('div', { class: 'li interactive', style: { cursor: 'pointer' }, onclick: () => { h.close(); this.rideDown(z); } }, [
        tag,
        el('div', {}, [
          el('div', { class: 'name' }, Z.name),
          el('div', { class: 'desc' }, Z.desc),
          el('div', { class: 'desc', style: { color: '#9a3a22' } }, '⚠ ' + Z.hazard),
        ]),
        el('span', { class: 'price', style: { flexDirection: 'column', alignItems: 'flex-end', fontSize: '.85em' } }, [`${Z.depth[0]}–${Z.depth[1]} m`, el('span', { class: 'btn', style: { marginTop: 'calc(var(--px) * 1.5)', padding: '0 calc(var(--px) * 3)' } }, 'Go')]),
      ]);
      list.append(row);
    }
    if (max < MAX_ZONE) {
      list.append(el('div', { class: 'li locked' }, [
        el('div', { style: { width: 'calc(var(--px) * 16)', height: 'calc(var(--px) * 16)', background: '#3a2a2a', border: 'var(--px) solid var(--wood-dk)', display: 'grid', placeItems: 'center', color: '#a08070' } }, '?'),
        el('div', {}, [el('div', { class: 'name' }, '???'), el('div', { class: 'desc' }, 'The cable goes deeper than any stop you have reached.')]),
        el('span', { class: 'price' }, `${ZONES[max + 1].depth[0]}+ m`),
      ]));
    }
    this.game.audio.play('babble', { pitch: BRAMBLE.voice, n: 4 });
    const h = this.game.ui.openPanel({ title: 'The Lift', sub: '<b>Bramble:</b> Where to, digger?', body: el('div', { class: 'scroll', style: { maxHeight: 'min(calc(100vh - 180px), calc(var(--px) * 150))' } }, [list]), width: 'calc(var(--px) * 220)' });
  }

  /** Walk the player (no collision) to a point. */
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

  async rideDown(zone) {
    if (this.locked) return;
    const st = this.game.state;
    const L = TOWN.lift;
    st.learn('elevator');
    this.game.audio.play('bell');
    this.locked = true;
    this.camFocus = new THREE.Vector3(L.cage.x - 0.5, 0.4, L.cage.z + 1.5);
    const p = this.player, n = this.nugget;
    this.say(this.bramble.a, pick(['Hold on tight!', 'Down she goes!', 'Mind your whiskers!']), { name: 'Bramble', voice: BRAMBLE.voice });
    // gate opens, step in
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
    this.game.goto('mine', { zone }, { transition: 'fade', dur: 0.5 });
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
    // ticket sign shimmer + bob
    if (this.ticketSign) this.ticketSign.position.y += Math.sin(this.time * 1.6) * 0.0016;
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
        this.particles.spawn({ x, y: 5.8, z, vy: -1, grav: 9, life: 1.2, size: 1.4, color: 0x9fd6ff, alpha: 0.9, alpha2: 0.9, fn: (q) => { if (q.y < 0.05 && !q.dead) { q.dead = true; this.particles.burst(4, { x: q.x, y: 0.05, z: q.z, vy: 0.7, grav: 5, life: 0.3, size: 1, color: 0xd8f6ff, alpha: 0.8, alpha2: 0 }, { x: 0.02, z: 0.02, v: 0.4 }); if (p && Math.hypot(p.x - x, p.z - z) < 5) this.game.audio.play('drip'); } } });
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
    if (this.floorTex) this.floorTex.dispose();
    super.exit();
  }
}
