// The player's burrow: an isometric room you can walk around, decorate and live in.
// It is where the mole lands after falling from the surface (the hole and its shaft of light
// stay), the base for digging: walk up to any wall and dig into the deep (tunnel mouths stay
// open in the walls), and home to the bed (sleep), forge, stove, Nugget's coop, planters,
// the index desk, seats, lamps and a build mode for furniture, floors and walls.
// The door to Deep Town stays caved in until the way into town has been dug.
import * as THREE from 'three';
import { IsoScene } from '../iso/IsoScene.js';
import { HomeRoom } from '../iso/HomeRoom.js';
import { buildFurniture } from '../iso/furniture.js';
import { withView, viewForYaw } from '../iso/mesher.js';
import { footprint, roomSize, doorTile, digSpots, tunnelList, TUNNEL_SLOTS, HOLE, WINDOW_SLOTS, occupancy } from '../iso/homeLayout.js';
import { BuildMode } from '../iso/BuildMode.js';
import { WATER_TIME } from '../iso/water.js';
import { beamTexture } from '../iso/pixel.js';
import { holeHeap, toolsLeaning, broom, firewood, letterCrate, ragRug } from '../iso/homeDecor.js';
import { glowShrooms, bucket } from '../iso/props.js';
import { HomeLanding } from '../iso/homeLanding.js';
import { FURNITURE } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el, rand, pick, clamp } from '../core/util.js';
import { midiToFreq } from '../core/Audio.js';

const _v = new THREE.Vector3();
const TUNE = [72, 76, 79, 76, 74, 77, 81, 77, 72, 76, 79, 84, 83, 79, 76, 74];
const WALLS4 = ['n', 's', 'e', 'w'];
/** Touch screens get "tap" wording. */
const isTouch = () => document.documentElement.classList.contains('is-touch') || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

export default class HomeScene extends IsoScene {
  async enter(params = {}) {
    this.hud = 'home';
    this.music = 'home';
    const st = this.game.state;
    const d = st.data;
    const t0 = performance.now();
    const from = params.from || 'continue';
    st.flag('lastScene', 'home');
    st.flag('homeVisited', true);
    if (from === 'fall') { st.flag('fallen', true); st.flag('nugget', true); }
    if (!d.home.planters) d.home.planters = {};
    if (!d.home.floor) d.home.floor = {};
    const [W, D] = roomSize(d.home.level);
    this.W = W;
    this.D = D;
    this.initIso({ w: W, h: D, zoom: 9.6, minZoom: 6.5, maxZoom: 13, lights: 6, lightRange: 16, bg: 0x0e090c });
    this.cam.bounds = null;
    this.post = { vignette: 0.46 };
    WATER_TIME.value = 0;

    // lighting: warm burrow ambience + a key light that separates the voxel faces
    this.scene.add(new THREE.HemisphereLight(0xffd8b0, 0x3a2418, 0.9));
    const key = new THREE.DirectionalLight(0xffe2c4, 0.7);
    key.position.set(-3, 9, 7);
    this.scene.add(key);

    // tunnels dug from these walls (owned by the deep scene; the one we just came out of is drawn even if unsaved)
    const arrived = from === 'tunnel' && WALLS4.includes(params.wall) ? { wall: params.wall, t: parseFloat(params.t) } : null;
    this.tunnels = tunnelList(d, arrived && isFinite(arrived.t) ? arrived : null).filter((tn) => (tn.wall === 'n' || tn.wall === 's' ? tn.t < W : tn.t < D));
    TUNNEL_SLOTS.n = new Set(this.tunnels.filter((t) => t.wall === 'n').map((t) => Math.floor(t.t)));
    TUNNEL_SLOTS.w = new Set(this.tunnels.filter((t) => t.wall === 'w').map((t) => Math.floor(t.t)));
    this.doorOpen = !!st.flag('escaped');

    this.room = new HomeRoom(this.scene);
    this.room.build(W, D, d.home.wall, d.home.floor, { tunnels: this.tunnels, doorOpen: this.doorOpen, hole: HOLE });
    this.own(() => this.room.dispose());
    for (const L of this.room.sconces) {
      this.addLight({ x: L.x, y: L.y, z: L.z, color: 0xffc27a, intensity: 6, distance: 8, flicker: 0.1, pool: 2.2, poolOpacity: 0.16, poolX: L.x + (L.z < 0.5 ? 0 : 1.1), poolZ: L.z + (L.z < 0.5 ? 1.1 : 0), halo: 0.75, haloOpacity: 0.5, priority: 3 });
    }
    this.buildAmbience();

    // furniture
    this.items = new Map();
    this.loose = [];
    this.buildLoose();
    for (const p of d.home.placed) this.addPlaced(p);
    this.rebuildCollision();

    // door to town (caved in until the way into Deep Town has been dug), poster
    const door = doorTile(W, D);
    this.doorPos = { x: 0.55, z: door.y + 0.5 };
    if (this.doorOpen) this.addInteractable({ x: this.doorPos.x, z: this.doorPos.z, r: 1.15, label: 'Out to Deep Town', action: () => this.leave() });
    else this.addInteractable({ x: this.doorPos.x, z: this.doorPos.z, r: 1.0, priority: -0.1, label: 'Blocked', action: () => this.blockedDoor() });
    this.addInteractable({ x: this.room.poster.cx, z: 0.7, r: 1.0, priority: -0.2, label: 'Look at the poster', action: () => this.lookPoster() });
    this.addInteractable({ x: 0.75, z: WINDOW_SLOTS[0] + 0.5, r: 0.9, priority: -0.15, label: 'Peek through the window', action: () => this.peekWindow() });

    // player & Nugget
    this.spawnByFrom(from, params);
    // Nugget lives here once she has fallen with the mole (or been found on the way out)
    if (st.flag('nugget')) {
      if (from === 'fall') this.spawnNugget(HOLE.x + 0.3, HOLE.z + 0.2);
      else {
        const coop = this.findKind('coop');
        // she starts by her coop: in front of it, else beside or behind it, else next to the player
        const cands = coop ? [[0.5, 1.35], [1.4, 0.5], [-0.4, 0.5], [0.5, -0.4], [1.4, 1.35], [-0.4, 1.35]].map(([dx, dz]) => [coop.p.x + dx, coop.p.y + dz]) : [];
        cands.push([this.player.x + 0.8, this.player.z + 0.6], [this.player.x + 0.7, this.player.z + 0.5]);
        const ns = cands.find(([x, z]) => x > 0.3 && z > 0.3 && x < W - 0.3 && z < D - 0.3 && this.map.freeAt(x, z, 0.2)) || cands[cands.length - 1];
        this.spawnNugget(ns[0], ns[1]);
        this.map.resolve(this.nugget.pos, 0.17);
      }
      this.nuggetAI.home = { x0: 0, z0: 0, x1: W - 1, z1: D - 1 };
    }
    this.napT = rand(25, 45);
    { const e = this.game.engine, k = Math.max(clamp((W + D - 18) / 12, 0.22, 0.85), e.width < e.height ? 0.75 : 0); this.cam.snap(_v.set(W / 2 + 0.2 + (this.player.x - W / 2 - 0.2) * k, 0.6, D / 2 + 0.4 + (this.player.z - D / 2 - 0.4) * k)); }

    // build mode
    this.build = new BuildMode(this);
    this.own(() => this.build.dispose());
    this.musicBox = { on: false, t: 0, i: 0 };
    this.ambientLoop('forge_fire', () => this.nearKindVol('forge', 4.5, 0.35));
    this.ambientLoop('fire', () => this.nearKindVol('fireplace', 5, 0.4) + this.nearKindVol('stove', 3, 0.15));
    this.ambientLoop('water', () => this.nearKindVol('fountain', 4, 0.22) + this.nearKindVol('fish_tank', 2.5, 0.08));

    if (from === 'fall') { this.landing = new HomeLanding(this); this.landing.run(); }
    else if (from === 'tunnel') this.stepOutOfTunnel(arrived);
    else if (from === 'newgame') this.wakeUp(this.findKind('bed'), true);
    else if (from === 'faint' || from === 'bed' || from === 'sleep') this.wakeUp(this.findKind('bed'), false);
    if (from !== 'fall' && !this.doorOpen && !this.tunnels.length) this.later(1.2, () => this.showDigHint());
    this.buildMs = performance.now() - t0;
    console.info(`[home] built in ${this.buildMs.toFixed(0)} ms (floor ${(this.room.floorMs || 0).toFixed(0)})`);
    const r = this.game.engine?.renderer;
    if (r && r.compileAsync) { try { await r.compileAsync(this.scene, this.camera); } catch (e) { console.warn(e); } }
  }

  // ------------------------------------------------------------ light, air and life
  /** The shaft of light from the hole, the crystal window's glow, fungi, lanterns, motes and fireflies. */
  buildAmbience() {
    const room = this.room, H = HOLE, P = this.particles;
    // light shaft from the hole the mole fell through
    const mat = new THREE.MeshBasicMaterial({ map: beamTexture(0.17), color: 0xffd98a, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const L = 15, tilt = -0.05;
    const mk = (w, op) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, L), mat.clone());
      m.material.opacity = op;
      // the card sits at the back of the shaft so things standing in the light stay in front of it
      m.position.set(H.x - 0.42 - (L / 2) * Math.sin(tilt) * Math.SQRT1_2, (L / 2) * Math.cos(tilt) - 0.02, H.z - 0.42 + (L / 2) * Math.sin(tilt) * Math.SQRT1_2);
      m.rotation.set(0, Math.PI / 4, tilt);
      m.renderOrder = 8;
      this.scene.add(m);
      return m;
    };
    this.beam = [mk(1.8, 0.5), mk(1.0, 0.42)];
    mat.dispose();
    this.addLight({ x: H.x, y: 2.6, z: H.z, color: 0xffeccc, intensity: 8, distance: 5.5, flicker: 0, real: true, priority: 4, pool: 1.3, poolOpacity: 0.42, poolColor: 0xffe8b8 });
    // lanterns hanging from the (cut-away) ceiling
    for (const l of this.room.hanging) this.addLight({ x: l.x, y: l.y, z: l.z, color: 0xffb860, intensity: 3.5, distance: 4.5, flicker: 0.12, real: true, priority: 1, pool: 1.2, poolOpacity: 0.2, poolX: l.x, poolZ: l.z, halo: 0.55, haloOpacity: 0.55 });
    // motes drifting in the shaft, and now and then a trickle of earth from the hole
    P.addEmitter({ every: 0.14, emit: (p) => {
      const y = rand(0.15, 4.2), a = rand(0, 6.28), r = Math.sqrt(Math.random()) * 0.42;
      p.spawn({ x: H.x + Math.cos(a) * r, y, z: H.z + Math.sin(a) * r, vy: rand(-0.04, 0.05), vx: rand(-0.03, 0.03), life: rand(3, 5), size: rand(1, 1.6), color: 0xfff8dc, alpha: 0.85, alpha2: 0, add: true, wob: 0.12, blink: 4 });
    } });
    this.trickleT = rand(3, 6);
    // the crystal window: a cool real light, a pool on the floor, a halo on the glass
    const w = room.windowLight;
    this.addLight({ x: w.x + 0.25, y: w.y, z: w.z, color: 0x6ad8ff, intensity: 3.2, distance: 4.6, flicker: 0.06, speed: 0.4, real: true, priority: 2, pool: 1.15, poolOpacity: 0.2, poolX: 1.0, poolZ: w.z, halo: 0.8, haloOpacity: 0.32, hx: 0.12, hy: w.y, hz: w.z });
    // glowing fungi and the lanterns at the tunnel mouths
    for (const f of room.fungi) this.addLight({ x: f.x, y: f.y, z: f.z, color: f.color, intensity: 0, real: false, pool: 0.65, poolOpacity: 0.16, halo: 0.42, haloOpacity: 0.3, flicker: 0.08, speed: 0.3 });
    for (const l of room.lanterns) this.addLight({ x: l.x, y: l.y, z: l.z, color: 0xffb050, intensity: 2.2, distance: 3.2, flicker: 0.18, real: false, pool: 0.85, poolOpacity: 0.22, poolY: 0.035, poolX: l.x, poolZ: l.z, halo: 0.45, haloOpacity: 0.5 });
    // fireflies around the window and the fungi
    const spots = [{ x: 0.9, z: WINDOW_SLOTS[0] + 0.5, y: 1.2 }, ...room.fungi];
    P.addEmitter({ every: 0.7, emit: (p) => {
      const s = pick(spots);
      p.spawn({ x: s.x + rand(-0.6, 0.6), y: s.y + rand(-0.2, 0.9), z: s.z + rand(-0.6, 0.6), vx: rand(-0.1, 0.1), vy: rand(-0.05, 0.08), vz: rand(-0.1, 0.1), life: rand(4, 7), size: rand(1.3, 2), color: pick([0xc8ff7a, 0x9affd8, 0xfff0a0]), alpha: 1, alpha2: 0, add: true, wob: 0.5, blink: rand(3, 6) });
    } });
  }

  /** Loose things that sit on a floor tile and only show while the tile is free of furniture. */
  buildLoose() {
    const { W, D } = this;
    const add = (tiles, make, x, z, yaw = 0, o = {}) => {
      const obj = withView(viewForYaw(yaw), make);
      obj.position.set(x, 0, z);
      obj.rotation.y = yaw;
      this.scene.add(obj);
      const rec = { tiles, obj, ...o };
      this.loose.push(rec);
      return rec;
    };
    // the old owner's rag rug in the middle of the room (hidden under furniture and player rugs)
    const rx = Math.min(W - 1.6, 5.6), rz = Math.min(D - 1.4, 4.6);
    const rugTiles = [];
    for (let y = Math.floor(rz - 0.8); y <= Math.floor(rz + 0.8 - 0.01); y++) for (let x = Math.floor(rx - 1.2); x <= Math.floor(rx + 1.2 - 0.01); x++) rugTiles.push({ x, y });
    add(rugTiles, () => ragRug(2.4, 1.6, 6), rx, rz, 0, { rug: true });
    // what came down with the mole, under the hole
    this.heap = add([{ x: Math.floor(HOLE.x), y: Math.floor(HOLE.z) }], () => holeHeap(11), HOLE.x, HOLE.z, 0.3);
    add([{ x: 0, y: 0 }], () => firewood(3), 0.42, 0.4, 0.2);
    add([{ x: W - 1, y: 0 }], () => broom(2), W - 0.3, 0.05, -0.15);
    add([{ x: W - 1, y: 0 }], () => letterCrate(5), W - 0.62, 0.48, -0.1);
    add([{ x: 0, y: D - 3 }], () => toolsLeaning(1), 0.06, D - 2.5, Math.PI / 2);
    add([{ x: 0, y: WINDOW_SLOTS[0] }], () => glowShrooms(7, 1, 0.55).obj, 0.32, WINDOW_SLOTS[0] + 0.5, 0.4);
    // a bucket and a pot that the landing knocks over
    const kx = Math.min(W - 1, Math.floor(HOLE.x) + 1), kz = Math.max(0, Math.floor(HOLE.z) - 1);
    this.knock = add([{ x: kx, y: kz }], () => {
      const g = new THREE.Group();
      const b = bucket(false);
      const bo = b.obj || b;
      bo.position.set(-0.12, 0, 0.05);
      const pot = glowShrooms(19, 2, 0.32).obj;
      pot.position.set(0.22, 0, -0.12);
      g.add(bo, pot);
      return g;
    }, kx + 0.5, kz + 0.5, 0.2);
  }

  /** Show loose things whose tiles are free; called after every furniture change. */
  refreshLoose() {
    const occ = occupancy(this.game.state.data.home.placed);
    for (const r of this.loose) r.obj.visible = r.tiles.every((t) => !occ.floor.has(t.x + ',' + t.y) && !(r.rug && occ.rugs.has(t.x + ',' + t.y)));
  }

  /** The landing tips the bucket and the pot over. */
  knockOver() {
    const k = this.knock;
    if (!k || !k.obj.visible) return;
    const [b, pot] = k.obj.children;
    this.game.audio.play('clunk', { vol: 0.6 });
    this.tween(0.45, (t) => {
      const e = 1 - (1 - t) ** 3;
      if (b) { b.rotation.z = e * Math.PI / 2; b.position.set(-0.12 - e * 0.25, e * 0.12, 0.05 + e * 0.1); }
      if (pot) { pot.rotation.x = e * 1.2; pot.position.set(0.22 + e * 0.1, 0, -0.12 + e * 0.15); }
    });
    this.particles.dustPuff(k.obj.position.x, 0.1, k.obj.position.z, 6, 0x7a5a3a);
  }

  // ------------------------------------------------------------ digging
  /** One interactable per diggable wall spot (rebuilt when furniture changes what hangs on the walls). */
  rebuildDigSpots() {
    for (const it of this.digIts || []) this.removeInteractable(it);
    this.digIts = [];
    for (const s of digSpots(this.game.state.data.home.placed, this.W, this.D)) {
      const tile = { x: Math.floor(s.x), y: Math.floor(s.z) };
      const tn = this.tunnelAt(s);
      this.digIts.push(this.addInteractable({
        x: s.x, z: s.z, r: 0.66, priority: tn ? 0.1 : -0.35,
        label: tn ? 'Into the tunnel' : 'Dig',
        enabled: () => this.canDigHere(s, tile),
        action: () => this.digAt(s),
      }));
    }
  }

  tunnelAt(s) { return this.tunnels.find((t) => t.wall === s.wall && Math.floor(t.t) === Math.floor(s.t)) || null; }

  /** Facing the wall, on a free tile, not building. */
  canDigHere(s, tile) {
    const p = this.player;
    if (!p || this.build?.active || this.map.blocked(tile.x, tile.y)) return false;
    const f = p.rig.facing ?? 0;
    return -(Math.sin(f) * s.nx + Math.cos(f) * s.nz) > 0.35;
  }

  async digAt(s) {
    if (this.locked) return;
    const p = this.player;
    const tn = this.tunnelAt(s);
    this.locked = true;
    this.game.ui.setHints(null);
    const wx = s.x - s.nx * 0.42, wz = s.z - s.nz * 0.42; // the wall face
    p.faceToward(wx, wz, true);
    if (tn) {
      // walk into the dark mouth
      p.collide = false;
      await this.walkTo(p, s.x - s.nx * 0.55, s.z - s.nz * 0.55, 1.8);
      this.game.audio.play('step', { mat: 'dirt' });
    } else {
      p.rig.play('dig');
      for (let i = 0; i < 3; i++) {
        await this.sleepFor(0.26);
        this.game.audio.play(i === 2 ? 'debris' : 'chop', { pitch: 0.9 + i * 0.08 });
        this.particles.dustPuff(wx, 0.5 + i * 0.12, wz, 7, 0x6a4a32);
        this.particles.burst(5, { x: wx, y: 0.6, z: wz, vx: s.nx * 1.2, vz: s.nz * 1.2, vy: 1.2, life: 0.6, size: 2, color: 0x5a3e2a, alpha: 1, alpha2: 1, grav: 7 }, { x: 0.1, y: 0.1, z: 0.1, v: 0.6 });
        this.cam.shake = 0.25;
      }
      p.rig.play('idle');
    }
    this.game.goto('deep', { from: 'home', wall: s.wall, t: s.t }, { transition: 'fade', dur: 0.5 });
  }

  /** Walk an actor (no collision) to a point. */
  walkTo(a, x, z, speed = 1.8) {
    return new Promise((res) => {
      a.scripted = true;
      const tick = (dt) => {
        const dx = x - a.x, dz = z - a.z, dd = Math.hypot(dx, dz);
        if (dd < 0.05) {
          a.drive(dt, 0, 0, null);
          a.scripted = false;
          this.tickers.splice(this.tickers.indexOf(tick), 1);
          res();
          return;
        }
        const sp = Math.min(speed, dd * 4 + 0.3);
        a.drive(dt, (dx / dd) * sp, (dz / dd) * sp, null, { accel: 20 });
      };
      this.tickers.push(tick);
    });
  }

  /** Coming back up a tunnel: appear in its mouth and step into the room. */
  async stepOutOfTunnel(tn) {
    if (!tn) return;
    const p = this.player;
    const s = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[tn.wall];
    const tx = p.x + s[0] * 0.75, tz = p.z + s[1] * 0.75;
    this.locked = true;
    p.collide = false;
    this.particles.dustPuff(p.x, 0.2, p.z, 8, 0x6a4a32);
    this.game.audio.play('step', { mat: 'dirt' });
    await this.walkTo(p, tx, tz, 1.6);
    p.collide = true;
    this.map.resolve(p.pos, p.radius);
    this.locked = false;
  }

  showDigHint() {
    if (this.game.state.flag('escaped')) return;
    this.game.ui.setHints(isTouch() ? 'Walk up to a wall and tap <b>Dig</b> to tunnel out' : 'Walk up to a wall and press <kbd>E</kbd> to dig your way out');
    this.hintT = 14;
  }

  blockedDoor() {
    const p = this.player;
    p.faceToward(-1, this.doorPos.z);
    p.rig.doEmote('shake', 1);
    this.game.audio.play('debris', { vol: 0.5 });
    this.particles.dustPuff(0.35, 0.6, this.doorPos.z, 6, 0x6a4a32);
    this.say(p, pick(['Caved in solid. I\'ll have to dig another way.', 'Rocks all the way up. Better dig through a wall.']));
  }

  peekWindow() {
    const p = this.player;
    p.faceToward(-1, WINDOW_SLOTS[0] + 0.5);
    this.emote(p, '✦', { color: '#3a9ad0' });
    this.game.audio.play('glow');
    this.particles.burst(6, { x: 0.3, y: 1.35, z: WINDOW_SLOTS[0] + 0.5, vx: 0.4, vy: 0.2, life: 1.4, size: 1.6, color: 0x9affd8, alpha: 1, alpha2: 0, add: true, wob: 0.6, blink: 5 }, { x: 0.05, y: 0.2, z: 0.25, v: 0.2 });
  }

  // ------------------------------------------------------------ furniture records
  findKind(kind) {
    for (const it of this.items.values()) if (FURNITURE[it.p.id]?.kind === kind || it.p.id === kind) return it;
    return null;
  }

  nearKindVol(kind, range, vol) {
    if (!this.player) return 0;
    let best = Infinity;
    for (const it of this.items.values()) {
      if (FURNITURE[it.p.id]?.kind !== kind && it.p.id !== kind) continue;
      best = Math.min(best, Math.hypot(it.cx - this.player.x, it.cz - this.player.z));
    }
    return best < range ? vol * (1 - best / range) : 0;
  }

  ctxFor(p) {
    const d = this.game.state.data;
    const pl = d.home.planters[p.uid];
    return {
      eggs: this.eggCount(),
      planter: pl ? { ...pl, ready: pl.ready || pl.day < d.day } : null,
      items: ITEMS,
      weapons: d.weapons,
      state: this.game.state,
    };
  }

  addPlaced(p) {
    const f = FURNITURE[p.id];
    if (!f) return null;
    // mesh only the faces the fixed iso camera can see for this rotation (the ghost keeps all)
    const res = withView(viewForYaw((p.r || 0) * Math.PI / 2), () => buildFurniture(p.id, this.ctxFor(p)));
    const [fw, fd] = footprint(p.id, p.r);
    const obj = res.obj;
    obj.position.set(p.x + fw / 2, 0, p.y + fd / 2);
    obj.rotation.y = (p.r || 0) * Math.PI / 2;
    this.scene.add(obj);
    obj.updateMatrixWorld(true);
    const rec = { p, res, obj, fw, fd, cx: p.x + fw / 2, cz: p.y + fd / 2, lights: [], its: [], emitters: [] };
    const toWorld = (x, y, z) => _v.set(x, y, z).applyMatrix4(obj.matrixWorld);
    for (const l of res.lights) {
      const w = toWorld(l.x, l.y, l.z).clone();
      const o = { ...l, x: w.x, y: w.y, z: w.z };
      if (l.poolX !== undefined || l.poolZ !== undefined) { const pw = toWorld(l.poolX ?? 0, 0, l.poolZ ?? 0); o.poolX = pw.x; o.poolZ = pw.z; }
      if (l.hx !== undefined || l.hy !== undefined || l.hz !== undefined) { const hw = toWorld(l.hx ?? l.x, l.hy ?? l.y, l.hz ?? l.z); o.hx = hw.x; o.hy = hw.y; o.hz = hw.z; }
      if (l.intensity === 0 && l.real !== false) o.real = false;
      const src = this.addLight(o);
      src.on = !this.game.state.flag('lampOff:' + p.uid);
      rec.lights.push(src);
    }
    this.addEmitters(rec);
    this.addItemInteractions(rec);
    this.items.set(p.uid, rec);
    return rec;
  }

  removePlaced(uid) {
    const rec = this.items.get(uid);
    if (!rec) return;
    if (FURNITURE[rec.p.id]?.kind === 'coop' && this.nuggetAI) this.nuggetAI.wake();
    this.scene.remove(rec.obj);
    rec.obj.traverse((o) => {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      if (o.material && !o.material.userData?.shared) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
    for (const s of rec.lights) this.removeLight(s);
    for (const it of rec.its) this.removeInteractable(it);
    for (const e of rec.emitters) this.particles.removeEmitter(e);
    this.items.delete(uid);
  }

  refreshPlaced(uid) {
    const rec = this.items.get(uid);
    if (!rec) return;
    const p = rec.p;
    this.removePlaced(uid);
    this.addPlaced(p);
  }

  rebuildCollision() {
    const map = this.map;
    map.solid.fill(0);
    for (const rec of this.items.values()) {
      const f = FURNITURE[rec.p.id];
      if (!f || f.kind === 'rug' || f.kind === 'wall') continue;
      map.fill(rec.p.x, rec.p.y, rec.fw, rec.fd, 1);
    }
    // floor sounds follow the painted floor
    const floors = this.game.state.data.home.floor;
    for (let y = 0; y < this.D; y++) for (let x = 0; x < this.W; x++) {
      const id = floors[`${x},${y}`] || 'floor_dirt';
      map.setMat(x, y, id === 'floor_plank' ? 'wood' : id === 'floor_dirt' || id === 'floor_moss' || id === 'floor_carpet' ? 'dirt' : 'stone');
    }
    for (const rec of this.items.values()) if (FURNITURE[rec.p.id]?.kind === 'rug') map.fillMat(rec.p.x, rec.p.y, rec.fw, rec.fd, 'dirt');
    // the rubble choking the door to town
    if (this.doorBlock) map.removeCircle(this.doorBlock);
    this.doorBlock = this.doorOpen === false ? map.addCircle(0.15, this.D - 1.5, 0.62) : null;
    this.refreshLoose();
    this.rebuildDigSpots();
    if (this.player && !this.seat && !this.playerPosed && !this.player.scripted) this.map.resolve(this.player.pos, this.player.radius);
  }

  addEmitters(rec) {
    const r = rec.res, P = this.particles;
    const w = (o) => _v.set(o.x, o.y, o.z).applyMatrix4(rec.obj.matrixWorld).clone();
    if (r.embers) {
      const e = w(r.embers);
      rec.emitters.push(P.addEmitter({ every: 0.22, emit: (p) => p.spawn({ x: e.x + rand(-0.3, 0.3), y: e.y, z: e.z + rand(-0.1, 0.1), vy: rand(0.6, 1.2), vx: rand(-0.1, 0.1), life: rand(0.8, 1.6), size: 1.2, color: 0xffc040, color2: 0xff4a10, alpha: 1, alpha2: 0, add: true, wob: 0.6 }) }));
    }
    if (r.steam) {
      const e = w(r.steam);
      rec.emitters.push(P.addEmitter({ every: 0.45, emit: (p) => p.spawn({ x: e.x + rand(-0.05, 0.05), y: e.y, z: e.z, vy: rand(0.3, 0.5), life: rand(1.2, 1.8), size: 2, size2: 4, color: 0xf0f0f0, alpha: 0.4, alpha2: 0, wob: 0.4 }) }));
    }
    if (r.bubbles) {
      const e = w(r.bubbles);
      const top = r.bubbles.top;
      rec.emitters.push(P.addEmitter({ every: 0.5, emit: (p) => p.spawn({ x: e.x + rand(-0.04, 0.04), y: e.y, z: e.z, vy: 0.35, life: (top - r.bubbles.y) / 0.35, size: 1.4, color: 0xe8f8ff, alpha: 0.8, alpha2: 0.5 }) }));
    }
    if (r.spray) {
      const e = w(r.spray);
      const s = r.spray;
      rec.emitters.push(P.addEmitter({
        every: 0.05,
        emit: (p) => {
          const a = Math.random() * Math.PI * 2;
          p.spawn({ x: e.x, y: e.y, z: e.z, vx: Math.cos(a) * rand(0.2, 0.45), vz: Math.sin(a) * rand(0.2, 0.45), vy: rand(0.6, 0.9), grav: 4, life: 0.75, size: 1.4, color: 0xd8f6ff, color2: 0x7ac8f0, alpha: 0.9, alpha2: 0.3, fn: (q) => { if (q.y < rec.obj.position.y + s.basinY) q.dead = true; } });
        },
      }));
    }
  }

  addItemInteractions(rec) {
    const p = rec.p;
    const f = FURNITURE[p.id];
    const st = this.game.state;
    const r = Math.max(rec.fw, rec.fd) / 2 + 0.72;
    const add = (o) => rec.its.push(this.addInteractable({ x: rec.cx, z: rec.cz, r, ...o }));
    switch (f.kind) {
      case 'bed': add({ label: 'Sleep', action: () => this.trySleep(rec) }); break;
      case 'forge': add({ label: 'Work the forge', action: () => this.go('forge', rec) }); break;
      case 'stove': add({ label: 'Cook', action: () => this.go('cooking', rec) }); break;
      case 'coop': add({ label: () => (st.data.chicken.eggs > 0 ? `Collect eggs (${st.data.chicken.eggs})` : 'Check the coop'), action: () => this.collectEggs(rec) }); break;
      case 'planter': add({ label: () => this.planterLabel(rec), action: () => this.usePlanter(rec) }); break;
      case 'desk': add({ label: 'Write in the Index Book', action: () => { this.game.audio.play('page'); this.game.ui.openIndex(); } }); break;
      case 'seat': add({ label: 'Sit', action: () => this.sitAt(rec) }); break;
      case 'light':
        add({ label: () => (rec.lights[0]?.on === false ? 'Light it' : 'Put it out'), action: () => this.toggleLamp(rec), priority: -0.3 });
        break;
      default:
        if (p.id === 'music_box') add({ label: () => (this.musicBox.on ? 'Stop the music box' : 'Wind the music box'), action: () => this.toggleMusicBox() });
    }
  }

  // ------------------------------------------------------------ spawning
  spawnByFrom(from, params = {}) {
    const W = this.W, D = this.D;
    let spot = null;
    if (from === 'forge' || from === 'stove' || from === 'cooking') {
      const rec = this.findKind(from === 'forge' ? 'forge' : 'stove');
      if (rec) spot = this.besideItem(rec);
    }
    if (from === 'newgame' || from === 'bed' || from === 'faint' || from === 'sleep') {
      const rec = this.findKind('bed');
      if (rec) spot = this.besideItem(rec);
    }
    if (from === 'fall') spot = { x: HOLE.x, z: HOLE.z, yaw: 0.6 };
    if (from === 'tunnel' && WALLS4.includes(params.wall)) {
      // in the tunnel's mouth, facing into the room
      const t = clamp(parseFloat(params.t) || 0.5, 0.3, (params.wall === 'n' || params.wall === 's' ? W : D) - 0.3);
      spot = { n: { x: t, z: 0.12, yaw: 0 }, s: { x: t, z: D - 0.12, yaw: Math.PI }, w: { x: 0.12, z: t, yaw: Math.PI / 2 }, e: { x: W - 0.12, z: t, yaw: -Math.PI / 2 } }[params.wall];
      spot.raw = true;
    }
    if (!spot && !this.doorOpen) spot = { x: HOLE.x + 0.6, z: HOLE.z + 0.6, yaw: 0.6 };
    if (!spot) {
      spot = { x: this.doorPos.x + 0.35, z: this.doorPos.z, yaw: Math.PI / 2 };
      if (from === 'town') this.game.audio.play('door');
    }
    this.spawnPlayer(spot.x, spot.z, spot.yaw ?? 0);
    if (!spot.raw && from !== 'fall') this.map.resolve(this.player.pos, this.player.radius);
    if (spot.face) this.player.faceToward(spot.face.x, spot.face.z, true);
  }

  /** A free spot next to an item, preferring its front. */
  besideItem(rec) {
    const { p, fw, fd } = rec;
    const yaw = (p.r || 0) * Math.PI / 2;
    const fx = Math.round(Math.sin(yaw)), fz = Math.round(Math.cos(yaw));
    const cands = [];
    const push = (x, y) => { if (!this.map.blocked(x, y)) cands.push({ x: x + 0.5, z: y + 0.5 }); };
    // front row first
    if (fz > 0) for (let x = p.x; x < p.x + fw; x++) push(x, p.y + fd);
    if (fz < 0) for (let x = p.x; x < p.x + fw; x++) push(x, p.y - 1);
    if (fx > 0) for (let y = p.y; y < p.y + fd; y++) push(p.x + fw, y);
    if (fx < 0) for (let y = p.y; y < p.y + fd; y++) push(p.x - 1, y);
    for (let y = p.y - 1; y <= p.y + fd; y++) for (let x = p.x - 1; x <= p.x + fw; x++) push(x, y);
    const c = cands[0];
    if (!c) return null;
    return { x: c.x, z: c.z, face: { x: rec.cx, z: rec.cz } };
  }

  // ------------------------------------------------------------ interactions
  go(scene, rec) {
    this.locked = true;
    this.player.faceToward(rec.cx, rec.cz);
    this.game.audio.play(scene === 'forge' ? 'clunk' : 'stir');
    this.game.goto(scene, { from: 'home' });
  }

  leave() {
    this.locked = true;
    this.game.audio.play('door');
    this.player.faceToward(-1, this.doorPos.z);
    this.game.goto('town', { from: 'home' }, { transition: 'iris', center: this.screenUV(this.player) });
  }

  screenUV(a) {
    const s = this.toScreen(a.headPos(_v));
    const e = this.game.engine;
    return [clamp(s.x / (e.width * e.scale), 0, 1), clamp(1 - s.y / (e.height * e.scale), 0, 1)];
  }

  lookPoster() {
    const p = this.player;
    p.faceToward(this.room.poster.cx, -1);
    this.emote(p, '☀', { color: '#e0a020' });
    this.game.audio.play('glow');
  }

  floatAt(x, y, z, text, color = '#fff') {
    const s = this.toScreen(_v.set(x, y, z));
    this.game.ui.floatText(text, s.x, s.y, color);
  }

  /** Eggs waiting in the coop (none until Nugget has moved in). */
  eggCount() {
    const st = this.game.state;
    return st.flag('nugget') ? st.data.chicken.eggs || 0 : 0;
  }

  collectEggs(rec) {
    const st = this.game.state;
    const d = st.data;
    const n = this.eggCount();
    this.player.faceToward(rec.cx, rec.cz);
    if (n <= 0) {
      if (this.nugget) this.game.audio.play('cluck', { n: 1 });
      this.floatAt(rec.cx, 1.1, rec.cz, 'Just straw', '#e6dcc8');
      return;
    }
    st.addItem('egg', { n });
    d.chicken.eggs = 0;
    d.stats.eggs = (d.stats.eggs || 0) + n;
    st.learn('eggs');
    this.game.audio.play('cluck', { n: 2, gap: 0 });
    this.game.audio.play('pickup', { pitch: 1.2 });
    if (rec.res.setEggs) rec.res.setEggs(0);
    this.floatAt(rec.cx, 1.1, rec.cz, `+${n} egg${n > 1 ? 's' : ''}`, '#fff4d0');
    if (this.nugget) this.emote(this.nugget, '♥');
    st.save();
  }

  planterLabel(rec) {
    const d = this.game.state.data;
    const pl = d.home.planters[rec.p.uid];
    if (!pl) return 'Plant something';
    if (pl.ready || pl.day < d.day) return `Harvest ${ITEMS[pl.id]?.name || ''}`;
    return 'Check the sprout';
  }

  usePlanter(rec) {
    const st = this.game.state;
    const d = st.data;
    const uid = rec.p.uid;
    const pl = d.home.planters[uid];
    this.player.faceToward(rec.cx, rec.cz);
    if (pl && (pl.ready || pl.day < d.day)) {
      st.addItem(pl.id, { n: 3 });
      delete d.home.planters[uid];
      st.learn('planting');
      this.game.audio.play('pickup');
      this.game.audio.play('sparkle');
      this.particles.burst(8, { x: rec.cx, y: 0.6, z: rec.cz, vy: 1, life: 0.7, size: 1.5, color: 0xa8f07a, alpha: 1, alpha2: 0, add: true, grav: 2 }, { x: 0.2, z: 0.2, v: 0.6 });
      this.floatAt(rec.cx, 1, rec.cz, `+3 ${ITEMS[pl.id]?.name || ''}`, '#d8ffb0');
      rec.res.setPlant?.(null, ITEMS);
      st.save();
      return;
    }
    if (pl) {
      this.emote(this.player, '…');
      this.floatAt(rec.cx, 0.9, rec.cz, 'Growing', '#d8ffb0');
      return;
    }
    const plants = st.inventory((it) => it && it.cat === 'plant');
    if (!plants.length) {
      this.game.audio.play('ui_error');
      this.floatAt(rec.cx, 0.9, rec.cz, 'No plants to sow', '#e6dcc8');
      return;
    }
    const list = el('div', { class: 'list' });
    const h = this.game.ui.openPanel({ title: 'Planter', sub: 'Pick something to plant.', body: el('div', { class: 'scroll', style: { maxHeight: 'calc(var(--px) * 110)' } }, [list]), width: 'calc(var(--px) * 170)' });
    for (const g of plants) {
      const it = ITEMS[g.id];
      list.append(el('div', { class: 'li interactive', style: { cursor: 'pointer' }, onclick: () => {
        if (st.count(g.id) <= 0) return;
        st.removeItem(g.id, 1);
        d.home.planters[uid] = { id: g.id, day: d.day };
        this.game.audio.play('place');
        this.particles.dustPuff(rec.cx, 0.45, rec.cz, 6, 0x5a3a22);
        rec.res.setPlant?.({ id: g.id, ready: false }, ITEMS);
        st.save();
        h.close();
      } }, [el('img', { class: 'pix', src: iconURL(g.id), alt: '' }), el('div', {}, [el('div', { class: 'name' }, it.name), el('div', { class: 'desc' }, it.desc || '')]), el('span', { class: 'price' }, '×' + g.n)]));
    }
  }

  sitAt(rec) {
    const seats = rec.res.seats || [{ x: 0, z: 0, y: 0.4, yaw: 0 }];
    let best = seats[0], bd = Infinity;
    for (const s of seats) {
      const w = _v.set(s.x, 0, s.z).applyMatrix4(rec.obj.matrixWorld);
      const dd = Math.hypot(w.x - this.player.x, w.z - this.player.z);
      if (dd < bd) { bd = dd; best = s; }
    }
    const w = _v.set(best.x, 0, best.z).applyMatrix4(rec.obj.matrixWorld).clone();
    const yaw = (best.yaw || 0) + (rec.p.r || 0) * Math.PI / 2;
    const ex = w.x + Math.sin(yaw) * 0.8, ez = w.z + Math.cos(yaw) * 0.8;
    const exit = this.map.freeAt(ex, ez, 0.25) ? { x: ex, z: ez } : { x: this.player.x, z: this.player.z };
    this.sitOn({ x: w.x, z: w.z, y: best.y - 0.2, yaw, exitX: exit.x, exitZ: exit.z });
  }

  toggleLamp(rec) {
    const st = this.game.state;
    const on = !(rec.lights[0]?.on ?? true);
    for (const s of rec.lights) s.on = on;
    if (on) { delete st.data.flags['lampOff:' + rec.p.uid]; st.dirty = true; } else st.flag('lampOff:' + rec.p.uid, true);
    rec.obj.traverse((o) => { if (o.isMesh && o.material?.type === 'MeshBasicMaterial' && o.material.vertexColors) o.visible = on; });
    this.game.audio.play('click');
  }

  toggleMusicBox() {
    const mb = this.musicBox;
    mb.on = !mb.on;
    mb.t = 0;
    this.game.audio.play('click');
  }

  tickMusicBox(dt) {
    const mb = this.musicBox;
    if (!mb.on) return;
    const rec = this.findKind('music_box');
    if (!rec) { mb.on = false; return; }
    mb.t -= dt;
    if (mb.t <= 0) {
      mb.t = 0.32;
      const note = TUNE[mb.i++ % TUNE.length];
      const a = this.game.audio;
      const dist = Math.hypot(rec.cx - this.player.x, rec.cz - this.player.z);
      const vol = clamp(1.2 - dist / 9, 0.15, 1);
      a.tone({ f: midiToFreq(note), type: 'sine', dur: 0.5, vol: 0.05 * vol, release: 0.4, reverb: 0.5 });
      a.tone({ f: midiToFreq(note + 12), type: 'sine', dur: 0.15, vol: 0.015 * vol, reverb: 0.3 });
      if (mb.i % 6 === 0) {
        this.particles.spawn({ x: rec.cx + rand(-0.15, 0.15), y: 0.95, z: rec.cz, vy: 0.4, vx: rand(-0.1, 0.1), life: 1.4, size: 2, color: 0xf0d0ff, alpha: 1, alpha2: 0, add: true, wob: 0.5 });
      }
    }
  }

  // ------------------------------------------------------------ bed
  bedPose(rec) {
    const lie = rec.res.lie || { y: 0.5, foot: 0.75 };
    const yaw = (rec.p.r || 0) * Math.PI / 2;
    return { lie, yaw };
  }

  lieDown(rec) {
    const p = this.player;
    const { lie, yaw } = this.bedPose(rec);
    this.playerPosed = true;
    p.collide = false;
    p.vx = p.vz = 0;
    p.pos.set(rec.cx, 0, rec.cz);
    p.rig.face(0, true);
    p.body.rotation.order = 'YXZ';
    p.body.rotation.set(-Math.PI / 2, yaw, 0);
    const lx = lie.x || 0, lz = lie.foot;
    p.body.position.set(Math.cos(yaw) * lx + Math.sin(yaw) * lz, lie.y + 0.12, -Math.sin(yaw) * lx + Math.cos(yaw) * lz);
    p.rig.play('sleep');
    p.shadow.visible = false;
  }

  sitUpInBed(rec) {
    const p = this.player;
    const { lie, yaw } = this.bedPose(rec);
    p.body.rotation.set(0, 0, 0);
    p.body.position.set(0, lie.y - 0.25, 0);
    p.pos.set(rec.cx + Math.sin(yaw) * 0.15, 0, rec.cz + Math.cos(yaw) * 0.15);
    p.rig.face(yaw + Math.PI / 2, true);
    p.rig.play('sit');
  }

  getUp(rec) {
    const p = this.player;
    const spot = this.besideItem(rec) || { x: rec.cx + 1, z: rec.cz };
    p.body.rotation.set(0, 0, 0);
    p.body.position.set(0, 0, 0);
    p.pos.set(spot.x, 0, spot.z);
    p.collide = true;
    p.shadow.visible = true;
    this.map.resolve(p.pos, p.radius);
    p.faceToward(this.W * 0.6, this.D * 0.7, true);
    p.rig.play('idle');
    this.playerPosed = false;
  }

  async wakeUp(rec, first = false) {
    if (!rec) return;
    this.locked = true;
    this.lieDown(rec);
    if (first) this.post.fade = 1;
    if (first) await this.tween(1.6, (k) => { this.post.fade = 1 - k; });
    await this.sleepFor(first ? 1.0 : 0.4);
    this.game.audio.play('yawn');
    this.emote(this.player, '…', { life: 1.4 });
    await this.sleepFor(0.8);
    this.sitUpInBed(rec);
    this.game.audio.play('step', { mat: 'wood' });
    await this.sleepFor(0.9);
    this.getUp(rec);
    this.player.rig.doEmote('hop', 0.5);
    this.game.audio.play('land', { vol: 0.5 });
    if (this.nugget && this.nuggetAI) { this.nuggetAI.wake(); this.game.audio.play('cluck', { n: 2 }); }
    this.locked = false;
    if (first) this.game.ui.toast(`Day ${this.game.state.data.day}`);
  }

  async trySleep(rec) {
    const ok = await this.game.ui.confirm('Sleep until morning?', 'Sleep', 'Not yet');
    if (!ok || this.locked) return;
    const st = this.game.state;
    const d = st.data;
    this.locked = true;
    this.game.audio.play('yawn');
    this.lieDown(rec);
    const coop = this.findKind('coop');
    if (coop && coop.res.nap) this.sendNuggetToNap(coop, 999);
    const eggsBefore = d.chicken.eggs || 0;
    await this.tween(1.4, (k) => { this.post.fade = k; });
    this.game.audio.play('snore');
    await this.sleepFor(1.3);
    this.game.audio.play('snore');
    this.game.sleep();
    this.refreshDayVisuals();
    await this.sleepFor(0.8);
    await this.tween(1.2, (k) => { this.post.fade = 1 - k; });
    this.post.fade = 0;
    const laid = (d.chicken.eggs || 0) - eggsBefore;
    const name = d.chicken.name || 'Nugget';
    this.game.ui.toast(`<b>Day ${d.day}</b>` + (laid > 0 ? ` · ${name} laid ${laid === 1 ? 'an egg' : laid + ' eggs'}!` : ''), { kind: 'good', dur: 3400 });
    await this.wakeUp(rec, false);
  }

  refreshDayVisuals() {
    for (const rec of [...this.items.values()]) {
      const k = FURNITURE[rec.p.id]?.kind;
      if (k === 'coop' && rec.res.setEggs) rec.res.setEggs(this.eggCount());
      if (k === 'planter' && rec.res.setPlant) rec.res.setPlant(this.ctxFor(rec.p).planter, ITEMS);
    }
  }

  sendNuggetToNap(coop, secs) {
    if (!this.nuggetAI) return;
    const n = coop.res.nap;
    const w = _v.set(n.x, 0, n.z).applyMatrix4(coop.obj.matrixWorld);
    this.nuggetAI.nap({ x: w.x, z: w.z, y: n.y, yaw: (coop.p.r || 0) * Math.PI / 2 }, secs);
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    WATER_TIME.value += dt;
    this.build.update(dt);
    this.tickAmbience(dt);
    if (!this.build.active && this.player && !(this.landing && !this.landing.done)) {
      // soft follow: small rooms stay framed, big rooms follow the player more
      // (a phone held upright sees much less of the room across, so it follows more there)
      const k = Math.max(clamp((this.W + this.D - 18) / 12, 0.22, 0.85), this.cam.aspect < 1 ? 0.75 : 0);
      const cx = this.W / 2 + 0.2, cz = this.D / 2 + 0.4;
      this.homeFocus = this.homeFocus || new THREE.Vector3();
      this.homeFocus.set(cx + (this.player.x - cx) * k, 0.6, cz + (this.player.z - cz) * k);
      this.camFocus = this.homeFocus;
    }
    super.update(dt);
    const env = { near: 99, audio: this.game.audio, playing: this.musicBox.on };
    for (const rec of this.items.values()) {
      if (!rec.res.update) continue;
      env.near = this.player ? Math.hypot(rec.cx - this.player.x, rec.cz - this.player.z) : 99;
      env.playing = this.musicBox.on && rec.p.id === 'music_box';
      rec.res.update(dt, this.time, env);
    }
    this.tickMusicBox(dt);
    // Nugget naps in her coop now and then
    if (this.nuggetAI && !this.locked) {
      this.napT -= dt;
      const coop = this.findKind('coop');
      if (this.napT <= 0) {
        this.napT = rand(40, 70);
        if (coop && coop.res.nap && this.nuggetAI.mode === 'follow' && this.nuggetAI.idleFor > 3) this.sendNuggetToNap(coop, rand(14, 24));
      }
    }
  }

  /** Dirt trickling from the hole now and then; the dig hint fades once used or ignored. */
  tickAmbience(dt) {
    this.trickleT -= dt;
    if (this.trickleT <= 0) {
      this.trickleT = rand(4, 9);
      const H = HOLE, n = 6 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++) {
        this.particles.spawn({ x: H.x + rand(-0.12, 0.12), y: rand(3.6, 4.6), z: H.z + rand(-0.12, 0.12), vy: -rand(0, 0.6), life: 1.4, size: rand(1.2, 2), color: 0x6a4a32, alpha: 1, alpha2: 1, grav: 6, fn: (q) => { if (q.y < 0.05) q.dead = true; } });
      }
      if (this.player && Math.hypot(this.player.x - H.x, this.player.z - H.z) < 4) this.game.audio.play('trickle', { vol: 0.35 });
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      const near = this.focusIt && this.digIts?.includes(this.focusIt);
      if (this.hintT <= 0 || near) { this.hintT = 0; this.game.ui.setHints(null); }
    }
  }

  exit() {
    this.game.ui.setHints(null);
    super.exit();
  }
}
