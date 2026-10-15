// The player's burrow, in first person: a cozy timber-framed room 5 × 4 m under a boarded ceiling
// (it grows with room upgrades), where the mole crash-landed through the roof (the hole and its
// shaft of daylight stay). Walk it with the mouse and WASD (or the touch stick and look pad):
// sleep in the bed, cook at the stove, work the forge, collect Nugget's eggs, sow the planters,
// sit down, light the lamps; dig out through any free wall spot (hold E) into the mine, walk back
// into tunnels you dug before, ride the old brass lift in the corner down to the mine, and leave
// through the door to Deep Town once the way has been dug. X (or E at the build bench) is build
// mode: furniture, floors and wall styles placed straight into the room in first person.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { FPSRig, BoxWorld } from '../fps/FPSKit.js';
import { liftState } from '../fps/lifts.js';
import { Particles } from '../deep/Particles.js';
import { LightPool } from '../iso/LightPool.js';
import { buildFurniture } from '../iso/furniture.js';
import { footprint, roomSize, digSpots, tunnelList, TUNNEL_SLOTS, HOLE, WINDOW_SLOTS, occupancy, liftTiles, benchTiles } from '../iso/homeLayout.js';
import { holeHeap, toolsLeaning, broom, firewood, letterCrate, ragRug } from '../iso/homeDecor.js';
import { glowShrooms, bucket } from '../iso/props.js';
import { FURNITURE } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { el, rand, pick, clamp } from '../core/util.js';
import { T, CEIL, MOUTH_HW, MOUTH_H, DOOR_HW, DOOR_H } from '../home/units.js';
import { HomeShell } from '../home/shell.js';
import { HomeLift, liftBoxes } from '../home/lift.js';
import { FPGlow } from '../home/glow.js';
import { LightShaft } from '../home/fx.js';
import { HomeNugget } from '../home/nugget.js';
import { FPBuild } from '../home/build.js';
import { Landing } from '../home/landing.js';
import { relocateBlocked, besideItem } from '../home/layoutfix.js';
import { HomeMoves } from '../home/moves.js';
import { HomeLiving } from '../home/living.js';

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
const WALLS4 = ['n', 's', 'e', 'w'];
const isTouch = () => document.documentElement.classList.contains('is-touch');
/** Iso light intensities were tuned for 1 m tiles; a tile is 0.5 m now (inverse-square falloff). */
const ISO_LIGHT = 0.3;

export default class HomeScene extends Scene {
  async enter(params = {}) {
    this.hud = 'deep';
    this.music = 'home';
    const g = this.game, st = g.state, d = st.data;
    const t0 = performance.now();
    const from = params.from || 'continue';
    this.from = from;
    st.flag('lastScene', 'home');
    st.flag('homeVisited', true);
    if (from === 'fall') { st.flag('fallen', true); st.flag('nugget', true); }
    if (!d.home.planters) d.home.planters = {};
    if (!d.home.floor) d.home.floor = {};
    // the burrow's own lift always knows the mine entrance right below (lifts.js seeds 'L0')
    liftState(st);
    const [W, D] = roomSize(d.home.level);
    this.W = W;
    this.D = D;
    this.tickers = [];
    this.loops = [];
    this.anchors = new Map();
    this.scripted = false;
    this.locked = false;
    this.post = { vignette: 0.48, outlineAlpha: 0.72, innerThresh: 0.22, saturation: 1.02, contrast: 1.06 };
    this.scene.background = new THREE.Color(0x0b0708);

    // tunnels dug from these walls (the deep scene owns them; the one we just came out of is drawn even if unsaved)
    const arrived = from === 'tunnel' && WALLS4.includes(params.wall) ? { wall: params.wall, t: parseFloat(params.t) } : null;
    this.tunnels = tunnelList(d, arrived && isFinite(arrived.t) ? arrived : null).filter((tn) => (tn.wall === 'n' || tn.wall === 's' ? tn.t < W : tn.t < D));
    for (const w of WALLS4) TUNNEL_SLOTS[w] = new Set(this.tunnels.filter((t) => t.wall === w).map((t) => Math.floor(t.t)));
    this.arrivedTunnel = arrived && this.tunnels.find((t) => t.wall === arrived.wall && Math.floor(t.t) === Math.floor(arrived.t));
    this.doorOpen = !!st.flag('escaped');
    // older saves: anything standing where the lift, the bench, the door or a tunnel now needs room moves
    if (relocateBlocked(st, W, D)) st.save();

    // ---- the room (tile units, scaled to meters) and the shell
    this.room = new THREE.Group();
    this.room.scale.setScalar(T);
    this.scene.add(this.room);
    this.shell = new HomeShell(this.room, this.scene);
    this.shell.build(W, D, d.home.wall, d.home.floor, { tunnels: this.tunnels, doorOpen: this.doorOpen, hole: HOLE });
    this.own(() => this.shell.dispose());

    // ---- light: warm ambience, the shaft from the hole, a pool of point lights for every lamp
    this.scene.add(new THREE.HemisphereLight(0xf0d0b0, 0x24160e, 0.42));
    const sun = new THREE.DirectionalLight(0xffe8c8, 0.32);
    sun.position.set(HOLE.x * T + 0.6, 6, HOLE.z * T + 0.9);
    sun.target.position.set(HOLE.x * T, 0, HOLE.z * T);
    this.scene.add(sun, sun.target);
    this.lights = new LightPool(this.scene, 10, { range: 40 });
    this.glow = new FPGlow(this.scene, 256);
    this.shadows = new FPGlow(this.scene, 96, { shadow: true });
    this.fxU = { fogCol: { value: new THREE.Color(0x0b0708) }, fogDist: { value: 80 } };
    this.world = new BoxWorld();
    this.fx = new Particles(this.scene, this.world, this.fxU);
    this.own(() => this.fx.dispose());
    this.shaft = new LightShaft(this.scene, { x: HOLE.x * T, z: HOLE.z * T, top: CEIL + 0.02, bottom: 0, r0: 0.4, r1: 0.6 });
    this.addShellLights();

    // ---- the lift in the corner
    this.liftT = liftTiles(W, D);
    this.lift = new HomeLift(this.room, this.liftT);
    this.liftLight = this.addLight({ ...this.lift.lanternPos(_v).multiplyScalar(T), color: 0xffb860, intensity: 0.7, distance: 2.2, flicker: 0.1, halo: 0.16, haloOpacity: 0.55, priority: 1 });

    // ---- first person
    this.rig = await new FPSRig(this, { world: this.world, fov: 74, reach: 2.1, stepMat: 'dirt', lamp: 0.55 }).init();
    this.camera = this.rig.camera;
    this.rig.lampCol.setRGB(1.2, 0.98, 0.78);
    this.rig.ambient.setRGB(0.42, 0.34, 0.3);
    this.own(() => this.rig.dispose());
    this.fx.setPixelScale(g.engine.height, this.rig.fov);

    // ---- furniture, loose things, collision, interactables
    this.items = new Map();
    this.loose = [];
    this.buildLoose();
    for (const p of d.home.placed) this.addPlaced(p);
    this.addFixedInteractions();
    this.rebuildCollision();

    // ---- the mole and Nugget
    this.spawnByFrom(from, params);
    if (st.flag('nugget')) {
      let nx, nz;
      if (from === 'fall') { nx = HOLE.x + 0.9; nz = HOLE.z + 0.6; }
      else {
        const coop = this.findKind('coop');
        const pt = this.rig.player.pos;
        const cands = coop ? [[0.5, 1.35], [1.4, 0.5], [-0.4, 0.5], [0.5, -0.4]].map(([dx, dz]) => [coop.p.x + dx, coop.p.y + dz]) : [];
        cands.push([pt.x / T + 1.2, pt.z / T + 0.8], [pt.x / T + 0.8, pt.z / T - 0.9]);
        const ok = cands.find(([x, z]) => x > 0.3 && z > 0.3 && x < W - 0.3 && z < D - 0.3 && !this.tileBlocked(Math.floor(x), Math.floor(z)));
        [nx, nz] = ok || cands[cands.length - 1];
      }
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

    // ---- build mode, sounds
    this.build = new FPBuild(this);
    this.own(() => this.build.dispose());
    this.ambientLoop('forge_fire', () => this.nearKindVol('forge', 3, 0.35));
    this.ambientLoop('fire', () => this.nearKindVol('fireplace', 3, 0.4) + this.nearKindVol('stove', 2, 0.15));
    this.ambientLoop('water', () => this.nearKindVol('fountain', 2.5, 0.22) + this.nearKindVol('fish_tank', 1.5, 0.08));
    this.own(() => { for (const l of this.loops) if (l.h) l.h.stop(0.1); });
    this.own(() => { for (const k of this.anchors.keys()) g.ui.hideBubble(k); g.ui.setHints(null); });
    g.ui.setRadar?.(null);
    g.ui.setDepth?.(null);
    g.ui.setBag?.(null);
    // the first-person HUD keeps the mine's depth plumb-bob up; there is no depth at home
    const dep = g.ui.status?.depth;
    if (dep) { dep.style.visibility = 'hidden'; this.own(() => { dep.style.visibility = ''; }); }
    this.hammerBtn();

    // ---- arrival
    if (from === 'fall') { this.landing = new Landing(this); this.landing.run(); }
    else if (from === 'lift') this.arriveByLift();
    else if (from === 'tunnel') this.stepOutOfTunnel(this.arrivedTunnel);
    else if (from === 'newgame') this.wakeUp(this.findKind('bed'), true);
    else if (from === 'faint' || from === 'bed' || from === 'sleep') this.wakeUp(this.findKind('bed'), false);
    else if (from === 'town') g.audio.play('door');
    if (from !== 'fall' && !this.doorOpen && !this.tunnels.length) this.later(1.6, () => this.showDigHint());
    this.debug = this.makeDebug();
    this.buildMs = performance.now() - t0;
    console.info(`[home] built in ${this.buildMs.toFixed(0)} ms (shell ${this.shell.ms.toFixed(0)}: ${Object.entries(this.shell.steps).map(([k, v]) => k + ' ' + v).join(', ')})`);
    const r = g.engine?.renderer;
    if (r && r.compileAsync) { try { await r.compileAsync(this.scene, this.camera); } catch (e) { console.warn(e); } }
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
      else if (l.kind === 'window') this.addLight({ ...l, x: l.x + 0.05, intensity: 1.1, distance: 3.0, flicker: 0.06, speed: 0.4, halo: 0.42, haloOpacity: 0.3, hx: 0.02, pool: 0.55, poolX: 0.45, poolZ: l.z, poolOpacity: 0.16, priority: 3 });
      else if (l.kind === 'hole') this.addLight({ ...l, y: CEIL - 0.25, intensity: 3.2, distance: 5.2, flicker: 0, priority: 6, pool: 0.62, poolX: l.x, poolZ: l.z, poolOpacity: 0.34, poolColor: 0xffe8b8 });
      else this.addLight({ ...l, intensity: 0.75, distance: 2.4, flicker: 0.18, halo: 0.16, haloOpacity: 0.55, pool: 0.4, poolOpacity: 0.14, priority: 1 });
    }
    for (const f of sh.fungi) this.addLight({ x: f.x * T, y: f.y * T, z: f.z * T, color: f.color, intensity: 0, real: false, halo: 0.22, haloOpacity: 0.28, pool: 0.32, poolOpacity: 0.12, flicker: 0.08, speed: 0.3 });
    // the paper lanterns glow softly
    for (const s of sh.strings || []) for (let i = 1; i < s.length - 1; i++) this.glow.add({ kind: 'halo', x: s[i].x * T, y: (s[i].y - 0.1) * T, z: s[i].z * T, w: 0.11, color: [0xffd060, 0xff8a6a, 0x9ae07a, 0x8ac8ff, 0xffa0d0, 0xfff0b0][i % 6], opacity: 0.32 });
    // the bright disc of daylight far up the hole
    this.glow.add({ kind: 'halo', x: HOLE.x * T, y: CEIL + 2.6, z: HOLE.z * T, w: 1.6, color: 0xfff0c0, opacity: 0.55 });
  }

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

  canInteract() { return !this.scripted && !this.seat && !this.build?.active && !this.dig?.done; }

  addFixedInteractions() {
    const { W, D } = this;
    const dz = this.shell.door.z * T;
    if (this.doorOpen) this.addIt({ box: [0, 0, dz - DOOR_HW, 0.08, DOOR_H, dz + DOOR_HW], label: 'Out to Deep Town', action: () => this.leave() });
    else this.addIt({ box: [0, 0.3, dz - DOOR_HW, 0.3, DOOR_H, dz + DOOR_HW], label: 'Caved in', action: () => this.blockedDoor() });
    const wz = (WINDOW_SLOTS[0] + 0.5) * T;
    this.addIt({ box: [0, 0.82, wz - 0.3, 0.1, 1.28, wz + 0.3], label: 'Peek through the window', action: () => this.peekWindow() });
    const P = this.shell.poster;
    this.addIt({ box: [(P.cx - P.w / 2) * T, (P.cy - P.h / 2) * T, 0, (P.cx + P.w / 2) * T, (P.cy + P.h / 2) * T, 0.06], label: 'Look at the poster', action: () => this.lookPoster() });
    const L = this.liftT;
    this.addIt({ box: [L.x * T, 0, L.y * T, W * T, 1.42, D * T], label: () => (this.inCage() ? 'Pull the lever' : 'Ride the lift'), action: () => this.useLift() });
    const B = benchTiles(W, D);
    this.addIt({ box: [B.x * T + 0.1, 0, B.y * T, W * T, 1.6, (B.y + B.d) * T], label: 'Build bench: decorate', action: () => this.build.toggle(true) });
    this.addIt({ box: [(HOLE.x - 0.9) * T, 0, (HOLE.z - 0.8) * T, (HOLE.x + 0.9) * T, 0.12, (HOLE.z + 0.8) * T], label: 'Look up the hole', reach: 1.4, enabled: () => this.loose.includes(this.heap) && this.heap.obj.visible, action: () => this.lookUpHole() });
  }

  /** One crosshair target per diggable wall spot (and per tunnel mouth); rebuilt with the furniture. */
  rebuildDigSpots() {
    for (const it of this.digIts || []) this.rig.remove(it);
    this.digIts = [];
    for (const s of digSpots(this.game.state.data.home.placed, this.W, this.D, this.tunnels)) {
      const tile = { x: Math.floor(s.x), y: Math.floor(s.z) };
      const box = this.spotBox(s);
      if (s.tunnel) {
        this.digIts.push(this.addIt({ box, spot: s, label: 'Into the tunnel', enabled: () => !this.tileBlocked(tile.x, tile.y), action: () => this.walkIntoTunnel(s) }));
      } else {
        this.digIts.push(this.addIt({ box, spot: s, kind: 'rock', reach: 1.5, label: () => (isTouch() ? 'Dig through (hold dig)' : 'Dig through (hold E)'), enabled: () => !this.tileBlocked(tile.x, tile.y), action: () => this.startDig(s) }));
      }
    }
  }

  /** A wall spot's face as a box (meters); tunnel spots cover the open mouth. */
  spotBox(s) {
    const { W, D } = this;
    const a0 = s.k * T, a1 = (s.k + 1) * T;
    const c = s.t * T;
    if (s.tunnel) {
      const h = MOUTH_H - 0.05, hw = MOUTH_HW;
      if (s.wall === 'n') return [c - hw, 0, -0.35, c + hw, h, 0.02];
      if (s.wall === 's') return [c - hw, 0, D * T - 0.02, c + hw, h, D * T + 0.35];
      if (s.wall === 'w') return [-0.35, 0, c - hw, 0.02, h, c + hw];
      return [W * T - 0.02, 0, c - hw, W * T + 0.35, h, c + hw];
    }
    const y0 = 0.04, y1 = 1.3, e = 0.035;
    if (s.wall === 'n') return [a0, y0, -0.01, a1, y1, e];
    if (s.wall === 's') return [a0, y0, D * T - e, a1, y1, D * T + 0.01];
    if (s.wall === 'w') return [-0.01, y0, a0, e, y1, a1];
    return [W * T - e, y0, a0, W * T + 0.01, y1, a1];
  }

  // ------------------------------------------------------------ collision
  /** Is floor tile (tx, ty) out of the room or under furniture / the lift / the bench? */
  tileBlocked(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.D) return true;
    return !!this.blockedTiles?.has(tx + ',' + ty);
  }

  rebuildCollision() {
    const { W, D } = this, w = this.world;
    const Wm = W * T, Dm = D * T, L = this.liftT;
    w.clear();
    // floor (minus the lift pit), the pit's bottom, ceiling
    w.add(-2, -1, -2, Wm + 2, 0, L.y * T, 'shell');
    w.add(-2, -1, L.y * T, L.x * T, 0, Dm + 2, 'shell');
    w.add(Wm, -1, L.y * T, Wm + 2, 0, Dm + 2, 'shell');
    w.add(L.x * T, -3, L.y * T, Wm, -2.6, Dm, 'shell');
    w.add(-2, CEIL, -2, Wm + 2, CEIL + 1, Dm + 2, 'shell');
    // walls, with gaps where tunnel mouths open
    const wall = (name, x0, z0, x1, z1) => {
      const along = name === 'n' || name === 's';
      const gaps = this.tunnels.filter((t) => t.wall === name).map((t) => [t.t * T - MOUTH_HW, t.t * T + MOUTH_HW]).sort((a, b) => a[0] - b[0]);
      let a = along ? x0 : z0;
      const end = along ? x1 : z1;
      for (const [g0, g1] of [...gaps, [end, end]]) {
        if (g0 > a) { if (along) w.add(a, -1, z0, g0, CEIL + 1, z1, 'shell'); else w.add(x0, -1, a, x1, CEIL + 1, g0, 'shell'); }
        a = Math.max(a, g1);
      }
      // the tunnels' tubes: side walls and a roof
      for (const t of this.tunnels.filter((tt) => tt.wall === name)) {
        const c = t.t * T, hw = MOUTH_HW;
        const out = name === 'n' ? [-1.6, 0] : name === 's' ? [Dm, Dm + 1.6] : name === 'w' ? [-1.6, 0] : [Wm, Wm + 1.6];
        if (along) {
          w.add(c - hw - 0.4, -1, out[0], c - hw, CEIL, out[1], 'shell'); w.add(c + hw, -1, out[0], c + hw + 0.4, CEIL, out[1], 'shell');
          w.add(c - hw, MOUTH_H, out[0], c + hw, CEIL, out[1], 'shell');
        } else {
          w.add(out[0], -1, c - hw - 0.4, out[1], CEIL, c - hw, 'shell'); w.add(out[0], -1, c + hw, out[1], CEIL, c + hw + 0.4, 'shell');
          w.add(out[0], MOUTH_H, c - hw, out[1], CEIL, c + hw, 'shell');
        }
      }
    };
    wall('n', -2, -2, Wm + 2, 0);
    wall('s', -2, Dm, Wm + 2, Dm + 2);
    wall('w', -2, -2, 0, Dm + 2);
    wall('e', Wm, -2, Wm + 2, Dm + 2);
    // corner posts
    for (const [x0, z0] of [[0, 0], [Wm - 0.1875, 0], [0, Dm - 0.1875]]) w.add(x0, 0, z0, x0 + 0.1875, CEIL, z0 + 0.1875, 'shell');
    // the build bench, the lift cage, the rubble in the caved-in door
    const B = benchTiles(W, D);
    w.add(B.x * T + 0.06, 0, B.y * T, Wm, 0.5, (B.y + B.d) * T, 'shell');
    for (const b of liftBoxes(L, this.gateShut)) w.add(...b, 'lift');
    if (!this.doorOpen) { const dz = this.shell.door.z * T; w.add(0, 0, dz - 0.4, 0.375, 0.5, dz + 0.4, 'shell'); }
    // furniture
    this.blockedTiles = new Set();
    for (let y = L.y; y < L.y + L.d; y++) for (let x = L.x; x < L.x + L.w; x++) this.blockedTiles.add(x + ',' + y);
    for (let y = B.y; y < B.y + B.d; y++) this.blockedTiles.add(B.x + ',' + y);
    for (const rec of this.items.values()) {
      const f = FURNITURE[rec.p.id];
      if (!f || f.kind === 'rug' || f.kind === 'wall') continue;
      for (let y = rec.p.y; y < rec.p.y + rec.fd; y++) for (let x = rec.p.x; x < rec.p.x + rec.fw; x++) this.blockedTiles.add(x + ',' + y);
      const bb = rec.bbox;
      const h = clamp(bb.max.y, 0.45, CEIL - 0.1);
      w.add(Math.max(rec.p.x * T, bb.min.x) + 0.02, 0, Math.max(rec.p.y * T, bb.min.z) + 0.02, Math.min((rec.p.x + rec.fw) * T, bb.max.x) - 0.02, h, Math.min((rec.p.y + rec.fd) * T, bb.max.z) - 0.02, rec.p.uid);
    }
    this.refreshLoose();
    this.rebuildDigSpots();
    this.refreshStepMap();
    if (this.nug) this.fillNuggetMap();
    // never leave the mole stuck inside something new
    if (this.rig && !this.scripted && !this.seat) this.unstick();
  }

  fillNuggetMap() {
    this.nug.setBlocked((map) => {
      for (const k of this.blockedTiles) { const [x, y] = k.split(',').map(Number); map.setSolid(x, y, 1); }
      if (!this.doorOpen) map.setSolid(0, this.D - 2, 1);
    });
  }

  /** Push the mole out of anything solid (after furniture moved under it). */
  unstick() {
    const pl = this.rig.player;
    if (!pl.hitsAt(pl.pos.x, pl.pos.y, pl.pos.z)) return;
    for (let r = 0.1; r < 3; r += 0.1) for (let a = 0; a < 12; a++) {
      const x = pl.pos.x + Math.cos(a / 12 * Math.PI * 2) * r, z = pl.pos.z + Math.sin(a / 12 * Math.PI * 2) * r;
      if (x < 0.25 || z < 0.25 || x > this.W * T - 0.25 || z > this.D * T - 0.25) continue;
      if (!pl.hitsAt(x, 0, z)) { pl.pos.set(x, 0, z); return; }
    }
  }

  /** Footstep sounds follow the floor under the mole (rugs are soft). */
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
    const L = this.liftT;
    for (let y = L.y; y < L.y + L.d; y++) for (let x = L.x; x < L.x + L.w; x++) this.stepMats.set(x + ',' + y, 'wood');
  }

  // ------------------------------------------------------------ loose things
  /** Things that sit on a floor tile and only show while the tile is free of furniture. */
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
    this.heap = add([{ x: Math.floor(HOLE.x), y: Math.floor(HOLE.z) }], () => holeHeap(11), HOLE.x, HOLE.z, 0.3);
    add([{ x: 0, y: 0 }], () => firewood(3), 0.48, 0.42, 0.2);
    add([{ x: W - 1, y: 0 }], () => broom(2), W - 0.36, 0.12, -0.15);
    add([{ x: W - 1, y: 0 }], () => letterCrate(5), W - 0.7, 0.55, -0.1);
    add([{ x: 0, y: D - 3 }], () => toolsLeaning(1), 0.12, D - 2.5, Math.PI / 2);
    add([{ x: 0, y: WINDOW_SLOTS[0] }], () => glowShrooms(7, 1, 0.55).obj, 0.36, WINDOW_SLOTS[0] + 0.5, 0.4);
    const kx = Math.min(W - 3, Math.floor(HOLE.x) + 1), kz = Math.max(0, Math.floor(HOLE.z) - 1);
    this.knock = add([{ x: kx, y: kz }], () => {
      const grp = new THREE.Group();
      const b = bucket(false);
      (b.obj || b).position.set(-0.12, 0, 0.05);
      const pot = glowShrooms(19, 2, 0.32).obj;
      pot.position.set(0.22, 0, -0.12);
      grp.add(b.obj || b, pot);
      return grp;
    }, kx + 0.5, kz + 0.5, 0.2);
  }

  refreshLoose() {
    const occ = occupancy(this.game.state.data.home.placed, null, this.W, this.D);
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
    k.obj.getWorldPosition(_v);
    this.fx.dust(_v.x, 0.08, _v.z, 8, [0.48, 0.36, 0.24], 0.12);
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

  ctxFor(p) {
    const d = this.game.state.data;
    const pl = d.home.planters[p.uid];
    return { eggs: this.eggCount(), planter: pl ? { ...pl, ready: pl.ready || pl.day < d.day } : null, items: ITEMS, weapons: d.weapons, state: this.game.state };
  }

  addPlaced(p) {
    const f = FURNITURE[p.id];
    if (!f) return null;
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
    // a soft contact shadow on the floor
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
      case 'forge': add({ label: 'Work the forge', action: () => this.go('forge', rec) }); break;
      case 'stove': add({ label: 'Cook', action: () => this.go('cooking', rec) }); break;
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
    const { W, D } = this;
    let spot = null;
    if (from === 'forge' || from === 'stove' || from === 'cooking') { const rec = this.findKind(from === 'forge' ? 'forge' : 'stove'); if (rec) spot = besideItem(this, rec); }
    if (from === 'newgame' || from === 'bed' || from === 'faint' || from === 'sleep') { const rec = this.findKind('bed'); if (rec) spot = besideItem(this, rec); }
    if (from === 'fall') spot = { x: HOLE.x, z: HOLE.z, yaw: 0.6 };
    if (from === 'lift') { const L = this.liftT; spot = { x: L.x + 1.05, z: L.y + 1.1, yaw: 0 }; }
    if (from === 'tunnel' && this.arrivedTunnel) {
      const tn = this.arrivedTunnel;
      spot = { n: { x: tn.t, z: -0.75, yaw: Math.PI }, s: { x: tn.t, z: D + 0.75, yaw: 0 }, w: { x: -0.75, z: tn.t, yaw: -Math.PI / 2 }, e: { x: W + 0.75, z: tn.t, yaw: Math.PI / 2 } }[tn.wall];
    }
    if (from === 'town' && this.doorOpen) spot = { x: 1.2, z: this.shell.door.z, yaw: -Math.PI / 2 };
    if (!spot) spot = this.doorOpen && from !== 'continue' ? { x: 1.2, z: this.shell.door.z, yaw: -Math.PI / 2 } : { x: HOLE.x + 1.2, z: HOLE.z + 1.1, yaw: -2.4 };
    if (spot.face) spot.yaw = Math.atan2(-(spot.face.x - spot.x), -(spot.face.z - spot.z));
    this.rig.place(spot.x * T, 0, spot.z * T, spot.yaw ?? 0, -0.08);
    if (from !== 'tunnel' && from !== 'lift') this.unstick();
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
    if (c) { pl.pos.set(c.x, Math.max(0, c.y - pl.eyeY), c.z); pl.vel.set(0, 0, 0); pl.yaw = c.yaw; pl.pitch = clamp(c.pitch, -1.4, 1.4); }
    this.scripted = false;
    this.hidePaws = false;
    this.cam = null;
    this.rig.syncCamera(0);
  }

  /** Walk the scripted camera to (x, z) meters at eye height, turning to face along the way. */
  walkCam(x, z, speed = 1.6, faceYaw = null) {
    const c = this.cam;
    const x0 = c.x, z0 = c.z, d = Math.hypot(x - x0, z - z0);
    const yaw0 = c.yaw, yaw1 = faceYaw ?? (d > 0.05 ? Math.atan2(-(x - x0), -(z - z0)) : c.yaw);
    const dy = Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0));
    return this.tween(Math.max(0.25, d / speed), (k) => {
      const e = k * k * (3 - 2 * k);
      c.x = x0 + (x - x0) * e; c.z = z0 + (z - z0) * e;
      c.yaw = yaw0 + dy * Math.min(1, k * 2.2);
      c.pitch += (-0.05 - c.pitch) * 0.08;
      c.bob = Math.sin(k * d * 9) * 0.012 * (1 - k);
      c.moving = k < 1 && d > 0.05;
      if (Math.floor(k * d * 3) !== this._stepK) { this._stepK = Math.floor(k * d * 3); this.game.audio.play('step', { vol: 0.3, mat: this.stepMatAt(c.x, c.z) }); }
    });
  }

  stepMatAt(x, z) { return this.stepMats?.get(Math.floor(x / T) + ',' + Math.floor(z / T)) || 'dirt'; }

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
    const b = el('button', { class: 'btn interactive', title: 'Build mode (X)', 'aria-label': 'Decorate', style: { position: 'absolute', right: 'calc(var(--sar, 0px) + var(--px) * 4)', top: 'calc(var(--sat, 0px) + var(--px) * 44)', display: 'flex', alignItems: 'center', gap: 'calc(var(--px) * 2)', fontSize: '1em', pointerEvents: 'auto', zIndex: 4 }, onclick: (e) => { e.stopPropagation(); this.build.toggle(); } }, [
      el('img', { class: 'pix', src: iconURL('chair_wood'), alt: '', style: { width: 'var(--icon-s, 32px)', height: 'var(--icon-s, 32px)' } }), el('kbd', { style: { margin: 0 } }, 'X'),
    ]);
    // in the HUD layer: above the "click to look around" catcher, so it works with a free mouse
    this.game.ui.hud.append(b);
    this.hammer = b;
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
      const ev = this.rig.update(dt, { busy, frozen: !!this.dig });
      void ev;
      this.rig.stepMat = this.stepMatAt(this.rig.player.pos.x, this.rig.player.pos.z);
      if (!busy) {
        if (this.rig.primaryPressed && !this.build.active && !this.dig && this.rig.target?.spot && !this.rig.target.spot.tunnel) this.startDig(this.rig.target.spot);
        this.updateDig(dt);
        if (this.dig && !this.dig.done) g.ui.setCrosshair?.({ visible: true, kind: 'rock', label: 'Digging…', progress: this.dig.k });
        if (!this.build.active && !this.dig && this.rig.tool !== 'none') this.rig.setTool('none');
        if (!this.build.active && inp.pressed('KeyQ')) this.snack();
        this.checkTunnels();
      }
    }
    this.build.update(dt);
    this.tickAmbience(dt);
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
    this.lift.update(dt, this.time);
    this.lights.update(dt, pl.x, pl.z);
    this.glow.update(this.camera);
    this.shadows.update(this.camera);
    this.shaft.update(this.time);
    this.fx.update(dt);
    this.updateAnchors();
    this.updateLoops();
  }

  /** Motes in the light shaft, dirt trickling from the hole, fireflies by the window. */
  tickAmbience(dt) {
    this.moteT = (this.moteT || 0) - dt;
    if (this.moteT <= 0) {
      this.moteT = 0.08;
      const p = this.shaft.sample(_v);
      this.fx.spawn({ x: p.x, y: p.y, z: p.z, vx: rand(-0.02, 0.02), vy: rand(-0.015, 0.02), vz: rand(-0.02, 0.02), life: rand(3, 5), size: rand(0.006, 0.011), color: [1, 0.95, 0.78], alpha: 0.9, glow: true, drag: 0.05 });
    }
    this.trickleT = (this.trickleT ?? rand(3, 6)) - dt;
    if (this.trickleT <= 0) {
      this.trickleT = rand(4, 9);
      const n = 5 + Math.floor(Math.random() * 7);
      for (let i = 0; i < n; i++) this.fx.spawn({ x: HOLE.x * T + rand(-0.08, 0.08), y: CEIL + rand(0, 0.6), z: HOLE.z * T + rand(-0.08, 0.08), vy: -rand(0, 0.4), life: 1.2, size: rand(0.008, 0.014), color: [0.42, 0.29, 0.2], alpha: 1, grav: 9, fade: false, bounce: 0.1 });
      const p = this.rig.player.pos;
      if (Math.hypot(p.x - HOLE.x * T, p.z - HOLE.z * T) < 2) this.game.audio.play('trickle', { vol: 0.3 });
    }
    this.flyT = (this.flyT || 0) - dt;
    if (this.flyT <= 0) {
      this.flyT = 0.9;
      const spots = [{ x: 0.35, y: 0.9, z: (WINDOW_SLOTS[0] + 0.5) * T }, ...this.shell.fungi.map((f) => ({ x: f.x * T, y: f.y * T + 0.1, z: f.z * T }))];
      const s = pick(spots);
      this.fx.firefly(s.x + rand(-0.25, 0.25), s.y + rand(-0.1, 0.35), s.z + rand(-0.25, 0.25), pick([[0.78, 1, 0.48], [0.6, 1, 0.85], [1, 0.94, 0.62]]));
    }
    if (this.hintT > 0) {
      this.hintT -= dt;
      const near = this.rig.target && this.digIts?.includes(this.rig.target);
      if (this.hintT <= 0 || near || this.dig) { this.hintT = 0; this.game.ui.setHints(null); }
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
  }

  // ------------------------------------------------------------ test hooks
  makeDebug() {
    const s = this;
    return {
      /** Dig straight out through a free spot on `wall` (default: the first free one). */
      digOut(wall) {
        const spots = digSpots(s.game.state.data.home.placed, s.W, s.D, s.tunnels).filter((p) => !p.tunnel && (!wall || p.wall === wall) && !s.tileBlocked(Math.floor(p.x), Math.floor(p.z)));
        const sp = spots[Math.floor(spots.length / 2)];
        if (!sp) return null;
        s.digOut(sp);
        return { wall: sp.wall, t: sp.t };
      },
      /** Ride the lift to a destination id ('L0' the mine entrance, 'town', any found mine lift). */
      useLift(id = 'L0') { s.scripted = false; s.riding = false; s.rideLift(id); return true; },
      toggleBuild(on) { s.build.toggle(on); return s.build.active; },
      /** Place furniture id at tile (x, z) with rotation r (adds one to storage if needed). */
      placeAt(id, x, z, r = 0) { return s.build.placeDirect(id, x, z, r); },
      /** Run the interactable whose label contains `label` (case-insensitive). */
      interact(label) {
        const want = String(label).toLowerCase();
        const it = s.rig.items.find((i) => String(i.label || '').toLowerCase().includes(want));
        if (!it) return false;
        it.action?.(it);
        return true;
      },
      /** Every interactable label right now. */
      labels() { return s.rig.items.filter((i) => !i.enabled || i.enabled()).map((i) => String(i.label)); },
      /** Aim at a point (meters) from where the mole stands. */
      aim(x, y, z) { const e = s.rig.eye(_v); s.rig.player.yaw = Math.atan2(-(x - e.x), -(z - e.z)); s.rig.player.pitch = Math.atan2(y - e.y, Math.hypot(x - e.x, z - e.z)); s.rig.syncCamera(0); },
      /** Stand at (x, z) meters facing yaw. */
      stand(x, z, yaw = 0, pitch = 0) { s.rig.place(x, 0, z, yaw, pitch); },
      /** Run the simulation n frames. */
      step(n = 30, dt = 1 / 30) { for (let k = 0; k < n; k++) s.update(dt); },
      /** Draw calls and triangles for one frame. */
      stats() { const r = s.game.engine.renderer; r.info.autoReset = false; r.info.reset(); s.render(); const o = { ...r.info.render }; r.info.autoReset = true; return o; },
      get target() { return s.rig.target ? String(s.rig.target.label) : null; },
    };
  }

  exit() {
    this.game.ui.setCrosshair?.(null);
    this.game.ui.setHints(null);
    this.hammer?.remove();
    super.exit();
  }
}

// digging, tunnels and the lift (src/home/moves.js); living in the burrow (src/home/living.js)
for (const M of [HomeMoves, HomeLiving]) {
  for (const k of Object.getOwnPropertyNames(M.prototype)) if (k !== 'constructor') Object.defineProperty(HomeScene.prototype, k, Object.getOwnPropertyDescriptor(M.prototype, k));
}
