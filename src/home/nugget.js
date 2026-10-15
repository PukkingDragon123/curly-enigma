// Nugget in the first-person burrow: the same hen rig and follow/peck/nap AI as before, walking the
// room's tile grid inside the scaled room group (she stands ~0.3 m tall next to the 0.86 m mole).
// The AI follows a stand-in for the first-person mole (tile units, facing in the actor convention).
import * as THREE from 'three';
import { Actor, NuggetAI } from '../iso/Actor.js';
import { TileMap } from '../iso/TileMap.js';
import { makeChicken } from '../gfx/characters.js';
import { T } from './units.js';

const _v = new THREE.Vector3();

export class HomeNugget {
  /** s: the HomeScene (room group, game, rig); W, D tiles. */
  constructor(s, W, D, x, z) {
    this.s = s;
    this.map = new TileMap(W, D);
    const st = s.game.state;
    this.actor = new Actor(makeChicken(), { x, z, name: st.data.chicken.name || 'Nugget', voice: 620, radius: 0.17, headY: 0.68, shadow: 0.4 });
    s.room.add(this.actor.obj);
    // the AI reads scene.map / scene.game; the player stand-in is refreshed every frame
    this.proxy = { x: 0, z: 0, speedNow: 0, rig: { facing: 0 } };
    this.ai = new NuggetAI(this.actor, { map: this.map, game: s.game });
    this.ai.leash = 2.2;
    this.ai.home = { x0: 0.5, z0: 0.5, x1: W - 1.5, z1: D - 1.5 };
  }

  get x() { return this.actor.pos.x; }
  get z() { return this.actor.pos.z; }
  /** Her head in meters (for bubbles and the crosshair). */
  head(out = _v) { return this.actor.headPos(out).multiplyScalar(T); }

  /** Mark blocked tiles: fn(map) fills them (furniture, lift, bench...). */
  setBlocked(fill) {
    this.map.solid.fill(0);
    fill(this.map);
    if (!this.actor.scripted && this.ai.mode !== 'nap') this.map.resolve(this.actor.pos, 0.17);
  }

  update(dt, pl) {
    const p = this.proxy;
    const px = pl.pos.x / T, pz = pl.pos.z / T;
    if (!p.init) { p.init = true; p.x = px; p.z = pz; }
    p.speedNow = dt > 0 ? Math.hypot(px - p.x, pz - p.z) / dt : 0;
    p.x = px; p.z = pz;
    p.rig.facing = pl.yaw + Math.PI;
    if (!this.actor.scripted) this.ai.update(dt, p);
    this.actor.update(dt);
  }
}
