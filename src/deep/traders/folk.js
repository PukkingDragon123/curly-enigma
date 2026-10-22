// The folk who keep the burrows: a character rig standing at its post, idling in character, turning
// to look at the mole when it comes in, greeting it with a face to match, talking in speech bubbles
// with its own voice, and a capsule for the crosshair.
//   trader     Barnaby Burr: cheery; polishes the counter, checks the ledger, eyes his shelves
//   herbalist  Granny Thistle: grumpy; grinds herbs, sniffs a bundle, glares at the cauldron
//   rocco      Rocco: shifty; glances at the door, pats his coat, flashes the hidden pockets
//   outpost    Warden Brask: stern; dozes off when nobody's about and jolts awake when you come in
import * as THREE from 'three';
import { makeCharacter } from '../../gfx/characters.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { SHOPS } from '../../data/shops.js';
import { VOX } from '../materials.js';
import { OPAQUE } from '../Mesher.js';
import { roomToWorld, roomYaw } from '../gen/burrows.js';
import { makeRocco } from './rocco.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/** Little idle routines per keeper: [weight, fn(folk) → seconds it takes]. */
const IDLES = {
  trader: [
    [3, (k) => { k.lookRoom(-0.35, -0.55, 0.5); k.rig.setExpression('thinking', { hold: 2.4 }); return 2.6; }],
    [2, (k) => { k.lookRoom(0.25, 0.35, 0.95); k.rig.setExpression('happy', { hold: 2 }); return 2.2; }],
    [2, (k) => { k.play('brush', 2.2); return 2.4; }],
    [1, (k) => { k.hum(); return 2; }],
  ],
  herbalist: [
    [3, (k) => { k.play('brush', 2.6); k.rig.setExpression('stern', { hold: 2.6 }); return 2.8; }],
    [2, (k) => { k.lookRoom(-1.42, -0.32, 0.6); k.rig.setExpression('thinking', { hold: 2.4 }); return 2.6; }],
    [1, (k) => { k.rig.setExpression('sleepy', { hold: 1.6 }); k.c.audio?.play('yawn'); return 2; }],
    [1, (k) => { k.lookRoom(0.94, -1.0, 1.4); return 2; }],
  ],
  rocco: [
    [3, (k) => { k.lookRoom(0, 3.4, 0.7); k.rig.setExpression('worried', { hold: 1.4 }); return 1.8; }],
    [2, (k) => { k.lookRoom(1.4, -2.6, 0.6); return 1.6; }],
    [2, (k) => { k.rig.openCoat?.(0.6); setTimeout(() => k.rig.openCoat?.(0), 1400); k.rig.setExpression('smug', { hold: 1.6 }); return 2.2; }],
    [1, (k) => { k.hum(); k.rig.setExpression('smug', { hold: 1.5 }); return 2; }],
    [1, (k) => { k.play('wave', 0.6); k.rig.doEmote('shake', 0.8); return 1.4; }],
  ],
  outpost: [
    [2, (k) => { k.lookRoom(-1.98, -0.78, 0.5); k.rig.setExpression('thinking', { hold: 2.2 }); return 2.4; }],
    [2, (k) => { k.lookRoom(0, 2.6, 1.0); k.rig.setExpression('stern', { hold: 2 }); return 2.2; }],
    [1, (k) => { k.rig.doEmote('nod', 0.8); return 1.4; }],
  ],
};

export class Folk {
  /** ctx: the Traders module context; f: the burrow feature; L: burrowLayout(f); shopId. */
  constructor(ctx, f, L, shopId) {
    this.c = ctx;
    this.f = f;
    this.L = L;
    this.shopId = shopId;
    this.shop = SHOPS[shopId];
    this.npc = this.shop.npc;
    this.name = this.shop.keeper.name;
    const rig = this.rig = shopId === 'rocco' ? makeRocco() : makeCharacter(this.shop.keeper, { kind: 'toon' });
    this.scale = (this.shop.height || 0.95) / rig.height;
    rig.root.scale.setScalar(this.scale);
    rig.root.traverse((o) => { if (o.isMesh && o !== rig.skin?.detail) o.layers.enable(LAYER_OUTLINE); });
    ctx.scene3.add(rig.root);
    const p = roomToWorld(f, L.npc.u, L.npc.v);
    this.home = new THREE.Vector3(p.x, f.y, p.z);
    this.homeYaw = roomYaw(f, L.npc.rot || 0);
    this.pos = this.home.clone();
    this.pos.y = this.floorAt(p.x, f.y + 0.3, p.z);
    rig.face(this.homeYaw, true);
    rig.play('idle');
    this.look = new THREE.Vector3();
    this.idleT = 2 + Math.random() * 3;
    this.stateT = 0;
    this.chatT = 14 + Math.random() * 8;
    this.greeted = false;
    this.seen = 0; // seconds the mole has been close
    this.away = 99; // seconds since the mole was last close
    this.dozing = shopId === 'outpost';
    if (this.dozing) rig.setExpression('asleep');
    this.snoreT = 2;
    this.bubbleKey = 'folk-' + this.npc;
    this.bubbleT = 0;
    this.busy = false; // trading: stays facing the mole, no idles
    this.syncRoot();
  }

  // ------------------------------------------------------------ world
  floorAt(x, y, z) {
    const w = this.c.world, vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
    for (let vy = Math.floor((y + 0.4) * VOX); vy >= Math.floor((y - 0.8) * VOX); vy--) {
      if (OPAQUE[w.voxelAt(vx, vy, vz)] === 1 && OPAQUE[w.voxelAt(vx, vy + 1, vz)] !== 1 && OPAQUE[w.voxelAt(vx, vy + 2, vz)] !== 1) return (vy + 1) / VOX;
    }
    return y;
  }
  syncRoot() { this.rig.root.position.copy(this.pos); }
  headWorld(out = new THREE.Vector3()) {
    const a = this.rig.anchors;
    this.rig.root.updateMatrixWorld(true);
    return this.rig.neck.localToWorld(out.copy(a.headTop).add(_w.set(0, a.headH * 0.15, 0)));
  }
  /** Look at a point in the room (u, v, height). */
  lookRoom(u, v, y) {
    const p = roomToWorld(this.f, u, v);
    this.look.set(p.x, this.f.y + y, p.z);
    this.rig.lookAt(this.look);
    this.lookHold = 2.2;
  }
  play(state, secs) { this.rig.play(state); this.stateT = secs; }
  hum() { this.c.audio?.play('babble', { pitch: (this.shop.keeper.voice || 300) * 1.4, n: 3 }); this.rig.talk(0.9); }

  // ------------------------------------------------------------ talking
  /** Say a line: a speech bubble over the head, the mouth moving, a face, a voice. */
  say(text, o = {}) {
    if (!text || this.disposed) return;
    const rig = this.rig;
    const secs = o.dur ?? Math.min(6, 1.6 + text.length * 0.045);
    if (o.expr) rig.setExpression(o.expr, { hold: secs + 0.5 });
    rig.talk(Math.min(secs, 0.9 + text.length * 0.04));
    if (o.emote) rig.doEmote(o.emote, 1);
    if (o.sound !== false) this.c.audio?.play('babble', { pitch: this.shop.keeper.voice || 300, n: Math.min(9, 2 + Math.ceil(text.length / 9)) });
    this.bubbleText = text;
    this.bubbleT = secs;
    this.placeBubble(true);
  }
  placeBubble(fresh = false) {
    const ui = this.c.ui, own = this.c.owner;
    if (!ui?.bubble || !own?.toScreen) return;
    const p = own.toScreen(this.headWorld(_v));
    if (fresh) ui.bubble(this.bubbleKey, this.bubbleText, p.x, p.y, { life: this.bubbleT, name: this.name });
    else ui.moveBubble?.(this.bubbleKey, p.x, p.y, p.visible !== false);
  }

  /** The mole walked up: wake, turn, say hello. */
  greet(first) {
    const sh = this.shop;
    if (this.dozing) {
      this.dozing = false;
      this.rig.setExpression('surprised', { hold: 1.1 });
      this.rig.doEmote('hop', 0.5);
      this.c.audio?.play('snore', { vol: 0.4 });
      setTimeout(() => this.say(pick(sh.greet), { expr: 'stern' }), 650);
      this.rig.setMood('stern');
      return;
    }
    const expr = this.npc === 'herbalist' ? 'stern' : this.npc === 'rocco' ? 'smug' : 'happy';
    this.say(first ? sh.greet[0] : pick(sh.greet.slice(1)), { expr, emote: this.npc === 'trader' ? 'wave' : this.npc === 'rocco' ? 'hop' : 'nod' });
    if (this.npc === 'rocco') { this.rig.openCoat?.(0.8); setTimeout(() => this.rig.openCoat?.(0), 1800); }
  }
  /** A reaction after something happened at the counter. kind: bought | sold | poor | bye | haggle-up | haggle-miss | haggle-angry */
  react(kind, text) {
    if (this.disposed) return;
    const map = { bought: ['happy', 'nod'], sold: ['happy', 'nod'], poor: ['sad', 'shake'], bye: [this.npc === 'herbalist' ? 'stern' : 'happy', 'wave'], up: ['surprised', null], miss: ['smug', 'shake'], angry: ['angry', 'shake'], deal: ['smug', 'hop'], laugh: ['laugh', 'hop'] };
    const [expr, emote] = map[kind] || ['neutral', null];
    if (text) this.say(text, { expr, emote, sound: kind !== 'bye' });
    else { this.rig.setExpression(expr, { hold: 1.6 }); if (emote) this.rig.doEmote(emote, 0.9); }
  }

  // ------------------------------------------------------------ update
  /** o: { eye (Vector3), inside (bool: the mole is in this burrow), dist (m to the mole) } */
  update(dt, o) {
    const rig = this.rig;
    const near = o.inside && o.dist < 4.2;
    if (near) { this.seen += dt; this.away = 0; } else { this.away += dt; this.seen = 0; }
    // greet once per visit
    if (near && !this.greeted && this.seen > 0.35) { this.greeted = true; this.greet(!this.c.state?.data?.traders?.met?.[this.npc]); }
    if (!o.inside && this.away > 6) this.greeted = false;
    // the warden nods off when nobody's about
    if (this.npc === 'outpost' && !near && this.away > 9 && !this.dozing) { this.dozing = true; rig.setExpression('asleep'); }
    if (this.dozing) { this.snoreT -= dt; if (this.snoreT < 0 && o.dist < 9) { this.snoreT = 3 + Math.random() * 2; this.c.audio?.play('snore', { vol: 0.25 }); } }
    // who to look at: the mole when it's close, otherwise whatever the idle picked
    this.lookHold = Math.max(0, (this.lookHold || 0) - dt);
    if ((near || this.busy) && !this.dozing) {
      rig.lookAt(o.eye);
      // turn the body when the mole goes round the side
      const yawTo = Math.atan2(o.eye.x - this.pos.x, o.eye.z - this.pos.z);
      if (Math.abs(wrap(yawTo - this.homeYaw)) < 1.4) rig.face(this.homeYaw + wrap(yawTo - this.homeYaw) * 0.45);
      else rig.face(yawTo);
    } else {
      if (!this.lookHold) rig.lookAt(null);
      rig.face(this.homeYaw);
    }
    // idles
    if (this.stateT > 0) { this.stateT -= dt; if (this.stateT <= 0) rig.play('idle'); }
    if (!this.busy && !this.dozing) {
      this.idleT -= dt;
      if (this.idleT <= 0 && this.bubbleT <= 0) {
        const list = IDLES[this.npc] || IDLES.trader;
        let tot = 0;
        for (const [w] of list) tot += w;
        let r = Math.random() * tot, fn = list[0][1];
        for (const [w, f] of list) { r -= w; if (r <= 0) { fn = f; break; } }
        this.idleT = (fn(this) || 2) + 3 + Math.random() * 4;
      }
      // now and then a line while the mole is about
      if (near) {
        this.chatT -= dt;
        if (this.chatT <= 0 && this.bubbleT <= 0) { this.chatT = 16 + Math.random() * 12; this.say(pick(this.shop.lines), { expr: this.npc === 'rocco' ? 'smug' : undefined }); }
      }
    }
    // stand on the floor (someone may have dug at it)
    const fy = this.floorAt(this.pos.x, this.pos.y + 0.1, this.pos.z);
    this.pos.y += (fy - this.pos.y) * Math.min(1, dt * 10);
    this.syncRoot();
    rig.update(dt);
    if (this.bubbleT > 0) { this.bubbleT -= dt; this.placeBubble(false); }
  }

  /** Distance along the ray to the keeper (a capsule round them), or null. */
  hit(eye, dir, reach) {
    const h = (this.shop.height || 0.95) * 0.95, r = 0.3;
    let best = null;
    for (let i = 0; i <= 10; i++) {
      const px = this.pos.x, py = this.pos.y + 0.1 + (h - 0.1) * (i / 10), pz = this.pos.z;
      const ox = px - eye.x, oy = py - eye.y, oz = pz - eye.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > reach + r) continue;
      const dx = eye.x + dir.x * t - px, dy = eye.y + dir.y * t - py, dz = eye.z + dir.z * t - pz;
      if (dx * dx + dy * dy + dz * dz < r * r && (best === null || t < best)) best = t;
    }
    return best;
  }

  dispose() {
    this.disposed = true;
    this.c.ui?.hideBubble?.(this.bubbleKey);
    this.rig.root.parent?.remove(this.rig.root);
    try { this.rig.dispose?.(); } catch (e) { /* noop */ }
    for (const m of this.rig.coatMeshes || []) { m.geometry.dispose(); }
  }
}
