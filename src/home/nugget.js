// Nugget at home: her walking coop (src/gfx/char/coop.js, Nugget in its window) potters about the
// room on the tile grid with the same follow / peck / nap AI as before, inside the scaled room
// group (1 tile = 0.5 m: the coop stands 0.8 m to its ridge next to the 0.86 m mole).
//  - She gets hungry slowly at home too (data.coop.food, core/inventory.js): hungry, the coop sits
//    down and sulks. E on the coop feeds her (when she's peckish and you carry hen food) or opens
//    her shelves next to your backpack; she lays eggs onto the shelves now and then.
//  - Interface kept for HomeScene: new HomeNugget(scene, W, D, x, z), .actor (Actor), .ai
//    (NuggetAI: wake, nap, mode, idleFor), .map, .x, .z, head(out), setBlocked(fill), update(dt, pl).
//    Plus coopNear() / fed() / coopOpened() / coopClosed() for the backpack, and debug.*.
import * as THREE from 'three';
import { Actor, NuggetAI } from '../iso/Actor.js';
import { TileMap } from '../iso/TileMap.js';
import { makeCoop } from '../gfx/char/coop.js';
import { CoopGear } from '../gfx/char/coopGear.js';
import * as W from '../core/weight.js';
import { ITEMS } from '../data/items.js';
import * as Inv from '../core/inventory.js';
import { T } from './units.js';

const _v = new THREE.Vector3();
const COOP_H = 0.62 / T; // tiles (a small old coop)
const NEAR = 2.3; // meters: the backpack shows the coop's shelves within this

/** The coop dressed as the hen rig the Actor and NuggetAI drive (play / face / peck / flap / update). */
class CoopAsHen {
  constructor(coop) {
    this.coop = coop;
    this.root = coop.root;
    this.height = coop.height;
    this.state = 'idle';
    this.speed = 0;
    this.sulk = false;
  }
  get facing() { return this.coop.facing; }
  play(state) { this.state = state; }
  face(yaw, instant) { this.coop.face(yaw, instant); }
  peck() { this.coop.peck(); if (Math.random() < 0.3) this.coop.shake(0.3); }
  flap() { this.coop.hen?.flap(0.5); this.coop.shake(0.5); }
  update(dt) {
    const sit = this.sulk || this.state === 'sit';
    this.coop.play(sit ? 'sit' : 'idle');
    const moving = !sit && (this.state === 'walk' || this.state === 'run');
    this.coop.update(dt, { speed: moving ? this.speed : 0, moving });
  }
}

export class HomeNugget {
  /** s: the HomeScene (room group, game, rig); W, D tiles. */
  constructor(s, W, D, x, z) {
    this.s = s;
    this.st = s.game.state;
    this.map = new TileMap(W, D);
    const st = this.st;
    this.coop = makeCoop({ height: COOP_H, kind: 'toon' });
    this.gear = new CoopGear(this.coop); // the parts built onto her coop, and her cargo
    this.dress();
    this.hen = this.coop.hen;
    this.rigA = new CoopAsHen(this.coop);
    this.actor = new Actor(this.rigA, { x, z, name: st.data.chicken.name || 'Nugget', voice: 620, radius: 0.5, headY: COOP_H * 0.82, shadow: 0.0001 });
    this.actor.shadow.visible = false; // the coop has its own soft shadow
    s.room.add(this.actor.obj);
    // the AI reads scene.map / scene.game; the player stand-in is refreshed every frame
    this.proxy = { x: 0, z: 0, speedNow: 0, rig: { facing: 0 } };
    this.ai = new NuggetAI(this.actor, { map: this.map, game: s.game });
    this.ai.leash = 3.4;
    this.ai.home = { x0: 0.8, z0: 0.8, x1: W - 1.8, z1: D - 1.8 };
    // naps happen where she stands (the coop is her bed)
    this.ai.nap = (spot, secs = 12) => { this.ai.mode = 'nap'; this.ai.napSpot = null; this.ai.napT = secs; };
    this.panelOpen = false;
    Inv.coopSlots(st);
    this.coop.onEgg = () => this.eggOut();
    this.coop.onStep = (side, k) => {
      if (this.distM() > 6) return;
      s.game.audio.tone?.({ f: 140 + Math.random() * 30, f2: 80, type: 'triangle', dur: 0.05, vol: 0.04 * (0.5 + k) });
    };
    // E on the coop: feed her or open her shelves (HomeScene's own "Pet" stays on her)
    if (s.addIt) {
      const name = () => st.data.chicken?.name || 'Nugget';
      s.addIt({
        r: 0.36,
        label: () => (this.wantsFood() ? `Feed ${name()}` : `Open ${name()}'s coop`),
        sphereFn: (v) => v.set(this.actor.pos.x * T, (this.actor.pos.y + 0.95) * T, this.actor.pos.z * T),
        action: () => this.interact(),
      });
    }
    this.debug = {
      state: () => ({ mode: this.ai.mode, food: +(st.data.coop?.food ?? 0).toFixed(3), mood: Inv.henMood(st), pos: [+(this.x * T).toFixed(2), +(this.z * T).toFixed(2)], near: this.coopNear(), shelves: Inv.coopSlots(st).map((q) => (q ? `${q.id}×${Inv.stackN(q)}` : null)) }),
      feed: (id) => this.feed(id),
      hunger: (f) => { st.data.coop.food = f; return Inv.henMood(st); },
      egg: () => { this.coop.layEgg(); return true; },
      open: () => { s.game.ui.openInventory(); return true; },
      coop: this.coop,
    };
  }

  get x() { return this.actor.pos.x; }
  get z() { return this.actor.pos.z; }
  /** Her head (the coop's window) in meters, for bubbles and the crosshair. */
  head(out = _v) { return this.actor.headPos(out).multiplyScalar(T); }
  distM() { const p = this.s.rig?.player?.pos; return p ? Math.hypot(this.x * T - p.x, this.z * T - p.z) : 99; }
  coopNear() { return this.distM() < NEAR; }
  wantsFood() { return Inv.henMood(this.st) !== 'happy' && this.st.inventory((it) => it && it.hen > 0).length > 0; }

  interact() {
    if (this.wantsFood()) { this.feed(); return; }
    this.s.game.ui.openInventory();
  }
  feed(id = null) {
    const r = Inv.feedHen(this.st, id, 'bag');
    const ui = this.s.game.ui;
    if (!r.ok) { this.s.game.audio.play('ui_error'); ui.toast(r.reason, { kind: 'warn', dur: 2000 }); return r; }
    this.s.game.audio.play('eat');
    this.fed(r.id, r);
    ui.toast(`${this.st.data.chicken?.name || 'Nugget'} gobbles up the ${ITEMS[r.id]?.name.toLowerCase() || 'food'}.`, { kind: 'good', dur: 2000 });
    return r;
  }
  /** After a feeding (here or from the coop panel). */
  fed() {
    this.coop.shake(0.9);
    this.hen?.flap(0.5);
    this.s.game.audio.play('cluck', { n: 3, pitch: 1.2 });
    this.ai.wake?.();
  }
  eggOut() {
    const st = this.st, name = st.data.chicken?.name || 'Nugget';
    this.s.game.audio.play('cluck', { n: 4, pitch: 1.2 });
    if (Inv.eggToCoop(st)) this.s.game.ui.toast(`<b>${name}</b> laid an egg! It's on the coop's shelf.`, { kind: 'good', dur: 2600 });
    else { st.data.chicken.eggs = Math.min(6, (st.data.chicken.eggs || 0) + 1); }
  }
  coopOpened() { this.panelOpen = true; this.s.game.audio.play('door'); }
  coopClosed() { if (this.panelOpen) this.s.game.audio.play('door'); this.panelOpen = false; }
  coopTouched() { this.coop.shake(0.35); this.dress(); }
  /** Show what's installed and how loaded the shelves are. */
  dress() { this.gear.set(W.coopLevels(this.st), Inv.coopLoad(this.st).r); }

  /** Mark blocked tiles: fn(map) fills them (furniture, lift, bench...). */
  setBlocked(fill) {
    this.map.solid.fill(0);
    fill(this.map);
    if (!this.actor.scripted && this.ai.mode !== 'nap') this.map.resolve(this.actor.pos, 0.5);
  }

  update(dt, pl) {
    const p = this.proxy, st = this.st;
    const px = pl.pos.x / T, pz = pl.pos.z / T;
    if (!p.init) { p.init = true; p.x = px; p.z = pz; }
    p.speedNow = dt > 0 ? Math.hypot(px - p.x, pz - p.z) / dt : 0;
    p.x = px; p.z = pz;
    p.rig.facing = pl.yaw + Math.PI;
    // hunger is slow at home; hungry, she sits and sulks where she is
    const sk = st.skill?.('nugget') || 1;
    if (Inv.tickHen(st, dt, { rate: 1 / 2400 / sk, lay: !this.rigA.sulk, layK: sk }) === 'egg') this.coop.layEgg();
    this.rigA.sulk = Inv.henMood(st) === 'hungry';
    if (!this.actor.scripted && !this.rigA.sulk) this.ai.update(dt, p);
    else if (this.rigA.sulk) this.actor.drive(dt, 0, 0, this.map, { anim: false });
    this.rigA.speed = this.actor.speedNow;
    this.coop.setDoor(this.panelOpen ? 1 : 0);
    this.dressT = (this.dressT || 0) - dt;
    if (this.dressT <= 0) { this.dressT = 0.5; this.dress(); }
    this.actor.update(dt);
  }
}
