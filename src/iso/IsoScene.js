// Shared base for the isometric scenes (Deep Town and the home burrow): camera rig,
// tile collision, player control with footsteps, Nugget, E-interactions with prompts,
// speech bubbles that follow actors, pooled lights with floor light pools, particles
// and distance-driven ambient sound loops.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { IsoCamera } from './IsoCamera.js';
import { TileMap } from './TileMap.js';
import { Particles } from './Particles.js';
import { LightPool } from './LightPool.js';
import { Actor, NuggetAI } from './Actor.js';
import { makeCharacter, playerSpec, makeChicken } from '../gfx/characters.js';
import { poolTexture, glowTexture } from './pixel.js';
import { clamp } from '../core/util.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
let flatGeo = null;
export function flatPlane() {
  if (!flatGeo) {
    flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    flatGeo.userData.shared = true;
  }
  return flatGeo;
}

export const EMOTE_COLORS = { '♥': '#e0404a', '!': '#c0402a', '?': '#3a6ac9', '♪': '#6a3a8a', '♫': '#6a3a8a', 'Zz': '#5a6a9a', '…': '#5a4030' };

export class IsoScene extends Scene {
  initIso({ w, h, zoom = 9, minZoom = 6, maxZoom = 13, lights = 7, lightRange = 11, bg = 0x140e18 } = {}) {
    this.scene.background = new THREE.Color(bg);
    this.cam = new IsoCamera({ zoom, minZoom, maxZoom });
    this.camera = this.cam.cam;
    this.map = new TileMap(w, h);
    this.particles = new Particles(this.scene);
    this.lightPool = new LightPool(this.scene, lights, { range: lightRange });
    this.interactables = [];
    this.actors = [];
    this.anchors = new Map();
    this.glows = [];
    this.tickers = [];
    this.loops = [];
    this.locked = false;
    this.seat = null;
    this.focusIt = null;
    this.camFocus = null; // optional override {x,y,z}
    this._stepSign = 0;
    this.own(() => { for (const l of this.loops) if (l.h) l.h.stop(0.1); this.game.ui.setPrompt(null); });
  }

  // ------------------------------------------------------------ actors
  addActor(a) {
    this.scene.add(a.obj);
    this.actors.push(a);
    return a;
  }

  spawnPlayer(x, z, yaw = 0) {
    const a = new Actor(makeCharacter(playerSpec()), { x, z, yaw, name: 'You', voice: 280, radius: 0.27 });
    this.player = this.addActor(a);
    this.cam.snap(_v.set(x, 0.6, z));
    return a;
  }

  spawnNugget(x, z) {
    const st = this.game.state;
    const a = new Actor(makeChicken(), { x, z, name: st.data.chicken.name || 'Nugget', voice: 620, radius: 0.17, headY: 0.68, shadow: 0.4 });
    this.nugget = this.addActor(a);
    this.nuggetAI = new NuggetAI(a, this);
    this.addInteractable({ actor: a, r: 1.25, priority: 0.25, label: () => `Pet ${a.name}`, action: () => this.petNugget() });
    return a;
  }

  petNugget() {
    const st = this.game.state;
    const d = st.data;
    d.chicken.pets = (d.chicken.pets || 0) + 1;
    d.chicken.lastPetDay = d.day;
    st.dirty = true;
    const n = this.nugget;
    this.game.audio.play('cluck', { n: 2, pitch: 1.15, gap: 0 });
    this.emote(n, '♥', { sound: 'love' });
    this.nuggetAI.petted();
    n.faceToward(this.player.x, this.player.z);
    this.player.faceToward(n.x, n.z);
    this.player.rig.doEmote('nod', 0.6);
    this.particles.hearts(n.x, 0.7, n.z);
  }

  // ------------------------------------------------------------ interactions
  /** it: {x,z | actor, r, label: str|fn, action, enabled?, priority?} */
  addInteractable(it) {
    it.r = it.r ?? 1.2;
    this.interactables.push(it);
    return it;
  }

  removeInteractable(it) {
    const i = this.interactables.indexOf(it);
    if (i >= 0) this.interactables.splice(i, 1);
  }

  findInteractable() {
    const p = this.player;
    if (!p) return null;
    const fy = p.rig.facing ?? 0;
    const fx = Math.sin(fy), fz = Math.cos(fy);
    let best = null, bs = Infinity;
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const x = it.actor ? it.actor.x : it.x, z = it.actor ? it.actor.z : it.z;
      const dx = x - p.x, dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > it.r) continue;
      const facing = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
      const score = d - facing * 0.45 - (it.priority || 0);
      if (score < bs) { bs = score; best = it; }
    }
    return best;
  }

  updateInteract() {
    const ui = this.game.ui;
    if (!this.player || this.locked || this.noPrompt) {
      this.focusIt = null;
      if (!this.keepPrompt) ui.setPrompt(null);
      return;
    }
    const it = this.findInteractable();
    this.focusIt = it;
    if (it) {
      const label = typeof it.label === 'function' ? it.label() : it.label;
      ui.setPrompt(`<kbd>E</kbd> ${label}`);
      if (this.game.input.pressed('KeyE')) {
        this.game.input.justDown.delete('KeyE');
        it.action();
      }
    } else ui.setPrompt(null);
  }

  // ------------------------------------------------------------ bubbles
  say(actor, html, o = {}) {
    const ui = this.game.ui;
    ui.hideBubble(actor.key);
    const s = this.toScreen(actor.headPos(_v));
    ui.bubble(actor.key, html, s.x, s.y, { emote: !!o.emote, life: o.life ?? 3.4, name: o.name ?? null });
    ui.moveBubble(actor.key, s.x, s.y, s.visible);
    this.anchors.set(actor.key, actor);
    if (!o.emote && o.babble !== false) {
      const near = this.player ? actor.dist(this.player.x, this.player.z) : 0;
      if (near < 9) this.game.audio.play('babble', { pitch: o.voice ?? actor.voice, n: clamp(Math.round(html.length / 9), 2, 8) });
      if (actor.rig.talk) actor.rig.talk(Math.min(2.2, 0.6 + html.length / 30));
    }
  }

  emote(actor, sym, o = {}) {
    const col = o.color || EMOTE_COLORS[sym] || '#2a1a12';
    this.say(actor, `<span style="color:${col}">${sym}</span>`, { emote: true, life: o.life ?? 1.5, babble: false });
    if (o.sound) this.game.audio.play('emote', { kind: o.sound });
  }

  updateAnchors() {
    const ui = this.game.ui;
    for (const [key, a] of this.anchors) {
      if (!ui.bubbles.has(key)) { this.anchors.delete(key); continue; }
      const s = this.toScreen(a.headPos(_v));
      ui.moveBubble(key, s.x, s.y, s.visible);
    }
  }

  // ------------------------------------------------------------ lights
  /**
   * A light source. o: {x,y,z,color,intensity,distance,flicker, real, pool, poolColor, poolOpacity, poolX, poolZ, halo, haloOpacity, hx,hy,hz}
   * pool = radius of the fake floor light pool; halo = size of a glow sprite.
   */
  addLight(o) {
    const src = this.lightPool.add(o);
    src.extras = [];
    if (o.pool) {
      const m = new THREE.MeshBasicMaterial({ map: poolTexture(), color: o.poolColor ?? o.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: o.poolOpacity ?? 0.32 });
      const mesh = new THREE.Mesh(flatPlane(), m);
      mesh.scale.set(o.pool * 2, 1, o.pool * 2);
      mesh.position.set(o.poolX ?? o.x, o.poolY ?? 0.02, o.poolZ ?? o.z);
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.glows.push({ src, mat: m, base: m.opacity });
      src.extras.push(mesh);
    }
    if (o.halo) {
      const sm = new THREE.SpriteMaterial({ map: glowTexture(), color: o.haloColor ?? o.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: o.haloOpacity ?? 0.5 });
      const sp = new THREE.Sprite(sm);
      sp.scale.set(o.halo, o.halo, 1);
      sp.position.set(o.hx ?? o.x, o.hy ?? o.y, o.hz ?? o.z);
      sp.renderOrder = 7;
      this.scene.add(sp);
      this.glows.push({ src, mat: sm, base: sm.opacity });
      src.extras.push(sp);
    }
    return src;
  }

  removeLight(src) {
    if (!src) return;
    this.lightPool.remove(src);
    for (const e of src.extras || []) {
      if (e.parent) e.parent.remove(e);
      e.material.dispose();
    }
    this.glows = this.glows.filter((g) => g.src !== src);
  }

  // ------------------------------------------------------------ sound
  /** A positional-ish ambient loop: vol() is evaluated each frame (0 = off). */
  ambientLoop(name, vol, params = {}) {
    const l = { name, vol, params, h: null, cur: 0 };
    this.loops.push(l);
    return l;
  }

  updateLoops() {
    const audio = this.game.audio;
    for (const l of this.loops) {
      const v = Math.max(0, l.vol());
      if (!l.h || !l.h.alive) {
        l.h = null;
        if (v > 0.01 && audio.ctx && audio.ctx.state === 'running') l.h = audio.loop(l.name, { ...l.params, vol: v });
      } else if (v <= 0.003) {
        l.h.stop(0.3);
        l.h = null;
      } else if (Math.abs(v - l.cur) > 0.005) l.h.set({ vol: v });
      l.cur = v;
    }
  }

  // ------------------------------------------------------------ player
  stepMat(x, z) { return this.map.matAt(x, z); }

  updatePlayer(dt) {
    const p = this.player;
    if (!p) return;
    const inp = this.game.input;
    if (this.locked || this.noMove) {
      if (!this.seat && !this.playerPosed) p.drive(dt, 0, 0, this.map);
      return;
    }
    const ax = inp.axisX(), ay = inp.axisY();
    if (this.seat) {
      if (inp.pressed('KeyE')) { inp.justDown.delete('KeyE'); this.standUp(); } else if (ax || ay) this.standUp();
      return;
    }
    const dir = this.cam.moveDir(ax, ay, _d);
    const run = inp.isDown('ShiftLeft', 'ShiftRight');
    const spd = run ? 4.6 : 2.5;
    p.drive(dt, dir.x * spd, dir.z * spd, this.map);
    const r = p.rig;
    if (r.state === 'walk' || r.state === 'run') {
      const f = r.state === 'run' ? 14 : 9;
      const s = Math.sin(r.t * f) >= 0 ? 1 : -1;
      if (s !== this._stepSign) {
        this._stepSign = s;
        const mat = this.stepMat(p.x, p.z);
        this.game.audio.play('step', { mat, vol: r.state === 'run' ? 1 : 0.7 });
        if (r.state === 'run' && Math.random() < 0.5 && mat !== 'wood') this.particles.dustPuff(p.x - Math.sin(r.facing) * 0.2, 0.05, p.z - Math.cos(r.facing) * 0.2, 2, 0x7a5a3a);
      }
    }
  }

  /** seat: {x, z, y, yaw, exitX, exitZ} */
  sitOn(seat) {
    const p = this.player;
    this.seat = seat;
    p.collide = false;
    p.vx = p.vz = 0;
    p.pos.x = seat.x;
    p.pos.z = seat.z;
    p.body.position.y = seat.y ?? 0.2;
    p.rig.face(seat.yaw ?? 0, true);
    p.rig.play('sit');
    this.game.audio.play('step', { mat: 'wood' });
  }

  standUp() {
    const p = this.player;
    const s = this.seat;
    this.seat = null;
    p.body.position.y = 0;
    p.collide = true;
    if (s && s.exitX !== undefined) { p.pos.x = s.exitX; p.pos.z = s.exitZ; }
    this.map.resolve(p.pos, p.radius);
    p.rig.play('idle');
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    super.update(dt);
    const inp = this.game.input;
    if (inp.enabled && inp.mouse.wheel && !this.noZoom) this.cam.zoomBy(inp.mouse.wheel);
    this.updatePlayer(dt);
    if (this.nuggetAI && this.player) this.nuggetAI.update(dt, this.player);
    for (const t of [...this.tickers]) t(dt, this.time);
    const f = this.camFocus || (this.player ? _v.set(this.player.x, 0.65, this.player.z) : null);
    if (f) this.cam.goal.set(f.x, f.y ?? 0.65, f.z);
    for (const a of this.actors) {
      if (a.skipFar) {
        const dx = a.x - this.cam.focus.x, dz = a.z - this.cam.focus.z;
        if (dx * dx + dz * dz > 400 && (a._skip = (a._skip || 0) + 1) % 4) continue;
      }
      a.update(dt);
    }
    this.updateInteract();
    this.cam.update(dt);
    this.lightPool.update(dt, this.cam.focus.x, this.cam.focus.z);
    for (const g of this.glows) g.mat.opacity = g.base * (g.src.on ? g.src.k : 0);
    this.particles.update(dt, 9 / this.cam.zoom);
    this.updateAnchors();
    this.updateLoops();
  }

  onResize(w, h) {
    if (this.cam) this.cam.resize(w, h);
  }

  /** Utility: blocking timeline. Resolves after `secs` of scene time (keeps updating). */
  sleepFor(secs) {
    return new Promise((res) => {
      let t = 0;
      const tick = (dt) => { t += dt; if (t >= secs) { this.tickers.splice(this.tickers.indexOf(tick), 1); res(); } };
      this.tickers.push(tick);
    });
  }

  /** Tween a value over scene time; fn(k) with k 0..1. */
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
}
