// The first arrival in Deep Town, in first person: in the dark of the old tunnel, light leaks
// between the boards; two thumps rattle them and sift dust from the lintel; then the boards burst
// outward in splinters and dust, light floods in, and the mole tumbles head over heels onto the
// cobbles. The tunnel slumps shut behind; the mole gets up, sneezes off the dirt and looks out
// over the town while the townsfolk gasp, gather round and chatter. Nugget (once found) tumbles
// out too and trots off toward the new burrow. Input is back in under three seconds.
import * as THREE from 'three';
import { TOWN } from '../iso/townLayout.js';
import { rand, pick } from '../core/util.js';
import { M } from './units.js';

export const ELDER_LINE = 'Another one from the deep tunnels? ...There\'s an empty burrow down the lane. It\'s yours now.';
const GASPS = ['Did that wall just... sneeze out a mole?', 'Look at all that dirt!', 'Shaft Seven was sealed for years!', 'Somebody fetch a broom.', 'Is that a chicken?!'];

export class EscapeArrival {
  constructor(S) {
    this.S = S;
    this.debris = [];
    this.done = false;
    this.skip = false;
  }

  /** Put the mole (and Nugget) in the dark behind the boards before the first frame. */
  setup() {
    const S = this.S, T = TOWN.tunnel;
    S.locked = true;
    this.z0 = TOWN.northFace - 1.0;
    S.cut = { pos: new THREE.Vector3(T.cx - 0.05, 0, this.z0), yaw: Math.PI, pitch: -0.06, dip: 0.04 };
    S.place(T.cx, this.z0, Math.PI);
    const n = S.nugget;
    if (n) {
      n.collide = false;
      n.scripted = true;
      n.pos.set(T.cx + 0.45, 0, this.z0 + 0.15);
      n.rig.face(0, true);
    }
    // dark in here: the boards and frame tinted down, the paws barely lit
    for (const m of S.tunnel.tint || []) m.color.setRGB(0.26, 0.22, 0.2);
    this.lamp = [S.rig.lampK, S.rig.ambient.clone()];
    S.rig.lampK = 0.12;
    S.rig.ambient.setRGB(0.1, 0.08, 0.08);
    // a thin wash of light through the gaps between the boards
    this.leak = S.addLight({ x: T.cx, y: 1.0, z: TOWN.northFace - 0.3, color: 0xffd8a0, intensity: 0.35, distance: 1.6, real: true, bake: false, priority: 9 });
  }

  async run() {
    const S = this.S, T = TOWN.tunnel, au = S.game.audio, NF = TOWN.northFace;
    const c = S.cut;
    const boards = S.tunnel.boards, sign = S.tunnel.sign;
    // two thumps from the mole's shoulder: boards rattle, dust sifts from the lintel
    for (const [wait, k] of [[0.35, 0.6], [0.45, 1]]) {
      await this.wait(wait);
      au.play('thud', { vol: 0.5 + k * 0.4, pitch: 0.7 });
      S.rig.shake(0.5 * k);
      S.rig.vm?.impact?.('none', 0.6 * k);
      await S.tween(0.12, (q) => { c.pos.z = this.z0 + Math.sin(q * Math.PI) * 0.22 * k; });
      for (const b of boards) { b.userData.r0 = b.userData.r0 ?? b.rotation.z; b.rotation.z = b.userData.r0 + rand(-0.05, 0.05) * k; b.position.z += 0.014 * k; }
      S.particles.burst(Math.round(10 * k), { x: T.cx, y: 2.0, z: NF + 0.05, vy: -0.4, life: 1.1, size: 3, size2: 5, color: 0x9a8068, color2: 0x6a5a4a, alpha: 0.7, alpha2: 0, grav: 1.5, drag: 1.5 }, { x: 0.7, y: 0.05, z: 0.15, v: 0.2 });
      S.particles.burst(4, { x: T.cx, y: 1.0, z: NF - 0.2, vz: -0.3, life: 0.8, size: 1.4, color: 0xfff0c8, alpha: 0.9, alpha2: 0, add: true }, { x: 0.6, y: 0.6, z: 0.1, v: 0.2 });
    }
    await this.wait(0.35);
    // burst! light floods in
    this.burst(boards, sign);
    S.tween(0.35, (k) => {
      for (const m of S.tunnel.tint || []) m.color.setRGB(0.26 + 0.74 * k, 0.22 + 0.78 * k, 0.2 + 0.8 * k);
      S.rig.lampK = 0.12 + (this.lamp[0] - 0.12) * k;
      S.rig.ambient.setRGB(0.1 + (this.lamp[1].r - 0.1) * k, 0.08 + (this.lamp[1].g - 0.08) * k, 0.08 + (this.lamp[1].b - 0.08) * k);
    });
    S.removeLight(this.leak);
    au.play('whoosh', { vol: 0.5 });
    const z1 = T.out.z - 0.1;
    c.noPaws = true;
    await S.tween(0.6, (k) => {
      const e = 1 - (1 - k) * (1 - k);
      c.pos.z = this.z0 + (z1 - this.z0) * e;
      c.pos.x = T.cx - 0.05 + Math.sin(k * Math.PI) * 0.06;
      c.pos.y = Math.sin(k * Math.PI) * 0.35;
      // head over heels: the view pitches down through the floor and back up, with a wobble
      c.pitch = -0.06 - Math.sin(Math.min(1, k * 1.15) * Math.PI) * 1.35 - k * 0.35;
      c.roll = Math.sin(k * Math.PI * 2) * 0.25;
      c.dip = 0.05 + Math.sin(k * Math.PI) * 0.15;
    });
    c.pos.y = 0;
    au.play('land', { vol: 0.9 });
    au.play('debris', { vol: 0.4 });
    S.rig.shake(0.7);
    S.particles.dustPuff(c.pos.x, 0.08, c.pos.z + 0.4, 14, 0x8a6a4a);
    this.nuggetTumble();
    // the old shaft slumps shut behind
    S.later(0.25, () => this.seal());
    // sprawled on the cobbles, looking down at them; then up
    c.roll = 0.18;
    await S.tween(0.35, (k) => { c.dip = 0.32 - k * 0.04; c.pitch = -0.41 - (1 - k) * 0.3; c.roll = 0.18 * (1 - k * 0.5); });
    au.play('sneeze', { vol: 0.5 });
    S.particles.dustPuff(c.pos.x, 0.6, c.pos.z + 0.5, 10, 0x9a7a5a);
    S.rig.shake(0.25);
    c.noPaws = false;
    await S.tween(0.6, (k) => { const e = k * k * (3 - 2 * k); c.dip = 0.28 * (1 - e); c.pitch = -0.41 + 0.46 * e; c.roll = 0.09 * (1 - e); c.yaw = Math.PI + Math.sin(e * Math.PI) * 0.25; });
    // control back: look out over the town
    S.place(c.pos.x, c.pos.z, Math.PI + 0.02, 0.05);
    S.cut = null;
    S.locked = false;
    S.world.add((T.cx - 1) * M, 0, -2, (T.cx + 1) * M, 3 * M, (NF + 0.08) * M, 'sealed');
    this.react();
    this.done = true;
  }

  async wait(s) { if (!this.skip) await this.S.sleepFor(s); }

  /** Boards and sign fly outward; splinters whip past, dust billows, daylight-warm light floods in. */
  burst(boards, sign) {
    const S = this.S, T = TOWN.tunnel, au = S.game.audio, NF = TOWN.northFace;
    au.play('crack', { vol: 0.9 });
    au.play('break', { snd: 'wood', vol: 0.9 });
    au.play('collapse', { vol: 0.35 });
    S.rig.shake(1.0);
    S.post.flash = 0.35;
    S.post.flashColor = 0xfff0d0;
    S.tween(0.5, (k) => { S.post.flash = 0.35 * (1 - k); });
    const holder = S.tunnel.holder;
    for (const b of [...boards, sign]) {
      const w = new THREE.Vector3().copy(b.position).add(holder.position);
      const r = b.rotation.clone();
      b.removeFromParent();
      S.root.add(b);
      b.position.copy(w);
      b.rotation.copy(r);
      this.debris.push({ o: b, vx: (w.x - T.cx) * 2.4 + rand(-0.8, 0.8), vy: rand(1.4, 3.4), vz: rand(2.4, 4.4), wx: rand(-8, 8), wy: rand(-5, 5), wz: rand(-6, 6), rest: false, bounced: false });
    }
    S.tickers.push(this.tickDebris = (dt) => this.updateDebris(dt));
    // splinters: some outward with the boards, some whipping back past the eyes
    S.particles.burst(34, { x: T.cx, y: 1.0, z: NF + 0.15, vz: 2.4, vy: 1.4, life: 0.9, size: 1.8, size2: 1.1, color: 0xb08050, color2: 0x6a4a2a, alpha: 1, alpha2: 0.6, grav: 6 }, { x: 0.7, y: 0.7, z: 0.05, v: 1.8 });
    S.particles.burst(16, { x: T.cx, y: 1.15, z: NF - 0.1, vz: -0.6, vy: 0.8, life: 0.45, size: 1.6, color: 0xc89060, alpha: 1, alpha2: 0.4, grav: 4 }, { x: 0.35, y: 0.3, z: 0.05, v: 2.6, vz: 0.2 });
    S.particles.burst(26, { x: T.cx, y: 0.9, z: NF + 0.4, vz: 1.3, vy: 0.5, life: 1.8, size: 6, size2: 14, color: 0xa88a6a, color2: 0x6a5a4a, alpha: 0.6, alpha2: 0, drag: 2.2 }, { x: 0.8, y: 0.7, z: 0.2, v: 0.9 });
    S.particles.burst(14, { x: T.cx, y: 1.1, z: NF + 0.3, vz: 0.6, vy: 0.3, life: 1.2, size: 1.6, color: 0xfff0c8, alpha: 0.9, alpha2: 0, add: true, wob: 0.6 }, { x: 0.8, y: 0.6, z: 0.3, v: 0.5 });
  }

  updateDebris(dt) {
    let alive = 0;
    for (const d of this.debris) {
      if (d.rest) continue;
      alive++;
      d.vy -= 9 * dt;
      d.o.position.x += d.vx * dt; d.o.position.y += d.vy * dt; d.o.position.z += d.vz * dt;
      d.o.rotation.x += d.wx * dt; d.o.rotation.y += d.wy * dt; d.o.rotation.z += d.wz * dt;
      if (d.o.position.y < 0.03 && d.vy < 0) {
        if (!d.bounced && Math.abs(d.vy) > 1.2) {
          d.bounced = true;
          d.vy *= -0.32; d.vx *= 0.5; d.vz *= 0.5; d.wx *= 0.4; d.wy *= 0.4; d.wz *= 0.4;
          this.S.particles.dustPuff(d.o.position.x, 0.05, d.o.position.z, 3, 0x8a6a4a);
          if (Math.random() < 0.5) this.S.game.audio.play('step', { mat: 'wood', vol: 0.6 });
        } else {
          d.rest = true;
          d.o.position.y = 0.035;
          d.o.rotation.set(-Math.PI / 2, d.o.rotation.y, (Math.random() - 0.5) * 0.2, 'YXZ');
        }
      }
      if (d.o.position.z < TOWN.northFace + 0.15) { d.o.position.z = TOWN.northFace + 0.15; d.vz = Math.abs(d.vz) * 0.4; }
    }
    if (!alive && this.tickDebris) { this.S.tickers.splice(this.S.tickers.indexOf(this.tickDebris), 1); this.tickDebris = null; }
  }

  /** Rubble drops into the mouth; the tunnel is sealed for good. */
  seal() {
    const S = this.S, T = TOWN.tunnel;
    const r = S.tunnel.seal;
    r.visible = true;
    const y1 = r.position.y;
    S.game.audio.play('rumble_hit', { vol: 0.6 });
    S.game.audio.play('collapse', { vol: 0.55 });
    S.tween(0.3, (k) => { r.position.y = y1 + (1 - k * k) * 1.4; }).then(() => {
      S.rig.shake(0.6);
      S.particles.burst(22, { x: T.cx, y: 0.5, z: TOWN.northFace + 0.15, vz: 1.1, vy: 0.6, life: 1.6, size: 6, size2: 14, color: 0x9a8068, color2: 0x5a4a3a, alpha: 0.7, alpha2: 0, drag: 2 }, { x: 0.7, y: 0.4, z: 0.1, v: 0.6 });
      if (S.tunnel.stubs) S.tunnel.stubs.visible = true;
    });
  }

  nuggetTumble() {
    const S = this.S, T = TOWN.tunnel, au = S.game.audio, n = S.nugget;
    if (!n) return;
    S.later(0.3, async () => {
      n.rig.flap(1.2);
      au.play('bawk', { vol: 0.8 });
      const z0 = n.z, z1 = T.out.z + 0.2, x0 = n.x, x1 = T.cx + 0.8;
      await S.tween(0.45, (k) => {
        n.pos.z = z0 + (z1 - z0) * k;
        n.pos.x = x0 + (x1 - x0) * k;
        n.body.position.y = Math.sin(k * Math.PI) * 0.6;
        n.body.rotation.x = k * Math.PI * 2;
      });
      n.body.rotation.x = 0;
      n.body.position.y = 0;
      S.particles.dustPuff(n.x, 0.05, n.z, 6, 0x8a6a4a);
      S.particles.burst(6, { x: n.x, y: 0.5, z: n.z, vy: 0.6, life: 1.4, size: 2.2, color: 0xf6f0e4, alpha: 1, alpha2: 0, grav: 0.6, wob: 0.8 }, { x: 0.15, y: 0.1, z: 0.15, v: 0.4 });
      au.play('cluck', { n: 3, pitch: 1.2 });
      await S.sleepFor(0.5);
      S.emote(n, '!', { sound: 'alert' });
      // trot off toward the new home and wait there for the mole
      const H = TOWN.home;
      n.collide = true;
      n.setPath(S.map.findPath(n.x, n.z, H.door.x + 0.6, H.spawn.z + 0.1, 0.17));
      S.nuggetAI.mode = 'petted';
      S.nuggetAI.pettedT = 999;
      let t = 0, waited = 0;
      const tick = (dt) => {
        t += dt;
        const st = n.path ? n.followPath(dt, S.map, 1.9, { runAt: 2.5 }) : 'done';
        if (st !== 'moving') {
          waited += dt;
          n.drive(dt, 0, 0, S.map);
          if (waited > 0.4 && waited < 0.5) { n.faceToward(H.door.x, H.door.z - 1); n.rig.peck(); }
          if (Math.random() < dt * 0.5) n.rig.peck();
        }
        const near = n.dist(S.player.x, S.player.z) < 2.2;
        if (t > 20 || (waited > 1 && near)) {
          S.tickers.splice(S.tickers.indexOf(tick), 1);
          n.scripted = false;
          S.nuggetAI.mode = 'follow';
          S.nuggetAI.pettedT = 0;
          if (near) S.emote(n, '♥');
        }
      };
      S.tickers.push(tick);
    });
  }

  /** Townsfolk turn, gasp, gather round and chatter (bubbles only, never blocking). */
  react() {
    const S = this.S, T = TOWN.tunnel;
    const tx = T.cx, tz = T.out.z;
    const folk = (S.folk?.list || []).filter((f) => !f.sleeping && f.a.dist(tx, tz) < 12);
    folk.sort((a, b) => a.a.dist(tx, tz) - b.a.dist(tx, tz));
    folk.forEach((f, i) => {
      S.later(0.08 + i * 0.1, () => {
        f.pause = 2.8;
        if (!f.seated || f.role === 'elder') f.a.faceToward(tx, tz);
        if (i < 7) S.emote(f.a, i % 3 === 2 ? '?' : '!', { sound: i === 0 ? 'alert' : undefined });
        if (!f.seated && i < 6 && Math.random() < 0.5) f.a.rig.doEmote('surprise', 1.2);
      });
    });
    S.later(0.7, () => S.folk?.gather(tx, tz + 0.6, 4));
    for (const k of S.keepers || []) if (k.a.dist(tx, tz) < 10) { k.a.faceToward(tx, tz); k.armed = false; k.cool = 8; }
    const elder = S.folk?.elder;
    if (elder) {
      S.later(0.9, () => { elder.a.faceToward(tx, tz); elder.a.rig.doEmote('nod', 0.8); });
      S.later(1.4, () => { elder.pause = 5; S.say(elder.a, ELDER_LINE, { name: elder.name, voice: elder.a.voice, life: 6.5 }); });
      S.later(2.4, () => elder.a.rig.doEmote('wave', 1.2));
    }
    const talkers = folk.filter((f) => f !== elder && f.role !== 'baby' && f.spec.age !== 'baby').slice(0, 2);
    const lines = [...GASPS];
    if (!S.nugget) lines.splice(lines.indexOf('Is that a chicken?!'), 1);
    talkers.forEach((f, i) => S.later(3.0 + i * 1.7, () => { f.pause = 3.5; S.say(f.a, pick(lines.splice(i === 0 && S.nugget ? lines.length - 1 : Math.floor(Math.random() * lines.length), 1)), { name: f.name, life: 3.6 }); }));
  }
}
