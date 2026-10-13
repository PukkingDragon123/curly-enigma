// The first arrival in Deep Town after digging out of the collapsed tunnels: thumps
// behind the boarded mouth, the boards burst outward in a puff of dust and splinters,
// the dirty mole tumbles out (Nugget too, if found) and the tunnel slumps shut behind
// them. Nearby townsfolk turn, gasp and chatter in bubbles; an old-timer points the way
// to the empty burrow. Input is locked for well under 1.5 s; nothing else is forced.
import * as THREE from 'three';
import { TOWN } from './townLayout.js';
import { rand, pick, clamp } from '../core/util.js';

const _v = new THREE.Vector3();

export const ELDER_LINE = 'Another one from the deep tunnels? ...There\'s an empty burrow down the lane. It\'s yours now.';
const GASPS = ['Did that wall just... sneeze out a mole?', 'Look at all that dirt!', 'Shaft Seven was sealed for years!', 'Somebody fetch a broom.', 'Is that a chicken?!'];

export class TownArrival {
  constructor(S) {
    this.S = S;
    this.debris = [];
    this.done = false;
  }

  /** Put the actors inside the tunnel and aim the camera before the first frame. */
  setup() {
    const S = this.S, T = TOWN.tunnel;
    const p = S.player;
    S.locked = true;
    p.collide = false;
    p.scripted = true;
    p.pos.set(T.cx - 0.05, 0, T.inside.z);
    p.rig.face(0, true);
    p.shadow.visible = false;
    const n = S.nugget;
    if (n) {
      n.collide = false;
      n.scripted = true;
      n.pos.set(T.cx + 0.4, 0, T.inside.z - 0.35);
      n.rig.face(0, true);
      n.shadow.visible = false;
    }
    S.camFocus = new THREE.Vector3(T.cx + 0.3, 0.8, 4.9);
    this.bounds = S.cam.bounds;
    S.cam.bounds = null;
    S.cam.zoom = S.cam.zoomGoal = 8.6;
    S.cam.snap(S.camFocus);
  }

  async run() {
    const S = this.S, T = TOWN.tunnel, au = S.game.audio;
    const p = S.player, n = S.nugget;
    const boards = S.tunnel.boards, sign = S.tunnel.sign;
    // two muffled thumps: boards rattle, dust sifts from the lintel
    for (const [t, k] of [[0.12, 0.6], [0.38, 1]]) {
      await S.sleepFor(t === 0.12 ? 0.12 : 0.26);
      au.play('thud', { vol: 0.5 + k * 0.4, pitch: 0.7 });
      S.cam.shake = 0.25 * k;
      for (const b of boards) { b.userData.r0 = b.userData.r0 ?? b.rotation.z; b.rotation.z = b.userData.r0 + rand(-0.05, 0.05) * k; b.position.z += 0.012 * k; }
      S.particles.burst(Math.round(6 * k), { x: T.cx, y: 2.05, z: TOWN.northFace + 0.1, vy: -0.4, life: 0.9, size: 2, size2: 3.5, color: 0x9a8068, color2: 0x6a5a4a, alpha: 0.7, alpha2: 0, grav: 1.5, drag: 1.5 }, { x: 0.7, y: 0.05, z: 0.05, v: 0.2 });
    }
    await S.sleepFor(0.2);
    this.burst();
    // the mole tumbles out with a forward roll
    const z0 = T.inside.z, z1 = T.out.z;
    p.shadow.visible = true;
    p.rig.play('fall');
    au.play('whoosh', { vol: 0.5 });
    await S.tween(0.48, (k) => {
      const e = 1 - (1 - k) * (1 - k);
      p.pos.z = z0 + (z1 - z0) * e;
      p.pos.x = T.cx - 0.05 + Math.sin(k * Math.PI) * 0.06;
      p.body.position.y = Math.sin(k * Math.PI) * 0.42;
      p.body.rotation.x = k * Math.PI * 2;
    });
    p.body.rotation.x = 0;
    p.body.position.y = 0;
    au.play('land', { vol: 0.9 });
    au.play('debris', { vol: 0.4 });
    S.particles.dustPuff(p.x, 0.08, p.z, 12, 0x8a6a4a);
    p.rig.play('sit');
    p.body.scale.set(1.12, 0.84, 1.12);
    if (n) this.nuggetTumble(n);
    // the old shaft slumps shut behind them
    S.later(0.2, () => this.seal());
    await S.tween(0.22, (k) => { const s = 0.84 + 0.16 * k; p.body.scale.set(2 - s, s, 2 - s); });
    p.body.scale.set(1, 1, 1);
    p.rig.play('idle');
    p.rig.doEmote('shake', 0.7);
    au.play('sneeze', { vol: 0.5 });
    S.particles.dustPuff(p.x, 0.5, p.z, 8, 0x9a7a5a);
    // control back (≈1.4 s after the scene opened)
    p.collide = true;
    p.scripted = false;
    S.map.resolve(p.pos, p.radius);
    S.camFocus = null;
    S.cam.bounds = this.bounds;
    S.locked = false;
    S.cam.zoomGoal = 10.5;
    this.react();
    this.done = true;
  }

  /** Boards and sign fly outward; splinters and a dust cloud. */
  burst() {
    const S = this.S, T = TOWN.tunnel, au = S.game.audio;
    au.play('crack', { vol: 0.9 });
    au.play('break', { snd: 'wood', vol: 0.9 });
    au.play('collapse', { vol: 0.35 });
    S.cam.shake = 0.7;
    S.post.flash = 0.22;
    S.post.flashColor = 0xfff0d0;
    S.tween(0.35, (k) => { S.post.flash = 0.22 * (1 - k); });
    const parts = [...S.tunnel.boards, S.tunnel.sign];
    for (const b of parts) {
      b.updateMatrixWorld(true);
      const w = b.getWorldPosition(new THREE.Vector3());
      const q = b.getWorldQuaternion(new THREE.Quaternion());
      b.removeFromParent();
      S.scene.add(b);
      b.position.copy(w);
      b.quaternion.copy(q);
      this.debris.push({ o: b, vx: (w.x - T.cx) * 2.2 + rand(-0.7, 0.7), vy: rand(1.6, 3.2), vz: rand(2.2, 3.8), wx: rand(-7, 7), wy: rand(-5, 5), wz: rand(-6, 6), rest: false, bounced: false });
    }
    S.tickers.push(this.tickDebris = (dt) => this.updateDebris(dt));
    // splinters + dust cloud
    S.particles.burst(26, { x: T.cx, y: 1.0, z: TOWN.northFace + 0.15, vz: 2.2, vy: 1.4, life: 0.9, size: 1.6, size2: 1, color: 0xb08050, color2: 0x6a4a2a, alpha: 1, alpha2: 0.6, grav: 6 }, { x: 0.7, y: 0.7, z: 0.05, v: 1.6 });
    S.particles.burst(22, { x: T.cx, y: 0.9, z: TOWN.northFace + 0.4, vz: 1.3, vy: 0.5, life: 1.6, size: 4, size2: 9, color: 0xa88a6a, color2: 0x6a5a4a, alpha: 0.75, alpha2: 0, drag: 2.2 }, { x: 0.8, y: 0.7, z: 0.2, v: 0.9 });
  }

  updateDebris(dt) {
    let alive = 0;
    for (const d of this.debris) {
      if (d.rest) continue;
      alive++;
      d.vy -= 9 * dt;
      d.o.position.x += d.vx * dt;
      d.o.position.y += d.vy * dt;
      d.o.position.z += d.vz * dt;
      d.o.rotation.x += d.wx * dt;
      d.o.rotation.y += d.wy * dt;
      d.o.rotation.z += d.wz * dt;
      if (d.o.position.y < 0.03 && d.vy < 0) {
        if (!d.bounced && Math.abs(d.vy) > 1.2) {
          d.bounced = true;
          d.vy *= -0.32; d.vx *= 0.5; d.vz *= 0.5; d.wx *= 0.4; d.wy *= 0.4; d.wz *= 0.4;
          this.S.particles.dustPuff(d.o.position.x, 0.05, d.o.position.z, 3, 0x8a6a4a);
          if (Math.random() < 0.5) this.S.game.audio.play('step', { mat: 'wood', vol: 0.6 });
        } else {
          // settle lying flat on the floor
          d.rest = true;
          d.o.position.y = 0.035;
          d.o.rotation.set(-Math.PI / 2, d.o.rotation.y, (Math.random() - 0.5) * 0.2, 'YXZ');
        }
      }
      // keep debris out of the rock and inside the town
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
      S.cam.shake = 0.45;
      S.particles.burst(18, { x: T.cx, y: 0.5, z: TOWN.northFace + 0.15, vz: 1.1, vy: 0.6, life: 1.4, size: 3.5, size2: 8, color: 0x9a8068, color2: 0x5a4a3a, alpha: 0.8, alpha2: 0, drag: 2 }, { x: 0.7, y: 0.4, z: 0.1, v: 0.6 });
      if (S.tunnel.stubs) S.tunnel.stubs.visible = true;
    });
  }

  nuggetTumble(n) {
    const S = this.S, T = TOWN.tunnel, au = S.game.audio;
    S.later(0.32, async () => {
      n.shadow.visible = true;
      n.rig.flap(1.2);
      au.play('bawk', { vol: 0.8 });
      const z0 = n.z, z1 = T.out.z - 0.2, x0 = n.x, x1 = T.cx + 0.65;
      await S.tween(0.42, (k) => {
        n.pos.z = z0 + (z1 - z0) * k;
        n.pos.x = x0 + (x1 - x0) * k;
        n.body.position.y = Math.sin(k * Math.PI) * 0.5;
        n.body.rotation.x = k * Math.PI * 2;
      });
      n.body.rotation.x = 0;
      n.body.position.y = 0;
      S.particles.dustPuff(n.x, 0.05, n.z, 6, 0x8a6a4a);
      S.particles.burst(5, { x: n.x, y: 0.4, z: n.z, vy: 0.6, life: 1.2, size: 2, color: 0xf6f0e4, alpha: 1, alpha2: 0, grav: 0.6, wob: 0.8 }, { x: 0.15, y: 0.1, z: 0.15, v: 0.4 });
      au.play('cluck', { n: 3, pitch: 1.2 });
      await S.sleepFor(0.35);
      S.emote(n, '!', { sound: 'alert' });
      // trot off toward the new home and wait there
      const H = TOWN.home;
      n.collide = true;
      n.setPath(S.map.findPath(n.x, n.z, H.door.x + 0.55, H.spawn.z + 0.05, 0.17));
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
        const near = S.player && n.dist(S.player.x, S.player.z) < 2.2;
        if (t > 16 || (waited > 1 && near)) {
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

  /** Townsfolk turn, gasp and chatter (bubbles only, never blocking). */
  react() {
    const S = this.S, T = TOWN.tunnel;
    const tx = T.cx, tz = T.out.z;
    const folk = (S.folk?.list || []).filter((f) => !f.sleeping && f.a.dist(tx, tz) < 10);
    folk.sort((a, b) => a.a.dist(tx, tz) - b.a.dist(tx, tz));
    folk.forEach((f, i) => {
      S.later(0.08 + i * 0.12, () => {
        f.pause = 2.8;
        if (!f.seated || f.role === 'elder') f.a.faceToward(tx, tz);
        if (i < 6) S.emote(f.a, i % 3 === 2 ? '?' : '!', { sound: i === 0 ? 'alert' : undefined });
      });
    });
    for (const k of S.keepers || []) if (k.a.dist(tx, tz) < 9) { k.a.faceToward(tx, tz); k.armed = false; k.cool = 8; }
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

export { clamp };
