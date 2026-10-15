// The landing: after the long fall from the surface, the mole and Nugget crash through the
// ceiling of the abandoned burrow. Dust bursts out, the mole bounces and sprawls face down,
// loose things tip over, Nugget plops onto the mole's head, then flutters to the bed; the mole
// gets up dizzy and decides to dig a way out. Input is locked for about 2.5 s only.
import * as THREE from 'three';
import { HOLE } from './homeLayout.js';
import { rand } from '../core/util.js';

const lerp = (a, b, k) => a + (b - a) * k;

export class HomeLanding {
  constructor(s) {
    this.s = s;
    this.done = false;
  }

  /** Keep an airborne actor's blob shadow on the floor, shrinking with height. */
  groundShadow(a) {
    const y = a.pos.y;
    if (!a.shadowBase) a.shadowBase = { x: a.shadow.scale.x, z: a.shadow.scale.z };
    a.shadow.position.y = -y + 0.012;
    const k = Math.max(0.25, 1 - y / 7);
    a.shadow.scale.set(a.shadowBase.x * k, 1, a.shadowBase.z * k);
  }

  resetShadow(a) {
    if (a.shadowBase) a.shadow.scale.set(a.shadowBase.x, 1, a.shadowBase.z);
    a.shadow.position.y = 0.012;
  }

  async run() {
    const s = this.s, p = s.player, n = s.nugget, audio = s.game.audio;
    const H = HOLE;
    s.locked = true;
    s.noPrompt = true;
    s.game.ui.setTouchControls(false);
    // camera on the hole, a touch closer than normal
    s.camFocus = new THREE.Vector3(H.x + 0.4, 0.8, H.z + 0.6);
    s.cam.snap(s.camFocus);
    const z0 = s.cam.zoomGoal;
    s.cam.zoom = s.cam.zoomGoal = Math.max(s.cam.minZoom, z0 * 0.8);
    // the mole tumbles down the shaft
    p.scripted = true;
    p.collide = false;
    p.pos.set(H.x, 6.5, H.z);
    p.rig.play('fall');
    p.body.rotation.order = 'YXZ';
    if (n) {
      n.scripted = true;
      n.collide = false;
      n.pos.set(H.x + 0.25, 9.5, H.z + 0.15);
      n.rig.play?.('fall');
    }
    const tick = () => { this.groundShadow(p); if (n) this.groundShadow(n); };
    s.tickers.push(tick);
    audio.play('whoosh', { vol: 0.8 });
    await s.tween(0.62, (k) => {
      p.pos.y = 6.5 * (1 - k * k);
      p.body.rotation.x = k * Math.PI * 1.6;
      if (n) n.pos.y = 9.5 - 5.2 * k * k;
    });
    // impact
    p.pos.y = 0;
    this.impact(H.x, H.z, 1);
    p.rig.play('hurt');
    const knocked = s.knockOver?.();
    void knocked;
    // a bounce, landing sprawled face down
    await s.tween(0.36, (k) => {
      p.pos.y = Math.sin(k * Math.PI) * 0.42;
      p.body.rotation.x = lerp(Math.PI * 1.6, Math.PI * 2 - Math.PI / 2, k);
      p.body.position.y = lerp(0, 0.12, k);
      if (n) n.pos.y = Math.max(0.3, 4.3 - 6 * k * k);
    });
    p.pos.y = 0;
    p.body.rotation.x = -Math.PI / 2;
    p.body.position.set(0, 0.12, 0);
    audio.play('land', { vol: 0.8 });
    s.particles.dustPuff(H.x, 0.05, H.z, 10, 0x7a5a3a);
    const stars = this.dizzy(p, 3.2);
    // Nugget plops onto the mole's head
    if (n) {
      const head = { x: p.x, z: p.z + 0.32 };
      await s.tween(0.3, (k) => { n.pos.y = lerp(n.pos.y, 0.34, k); n.pos.x = lerp(n.pos.x, head.x, k); n.pos.z = lerp(n.pos.z, head.z, k); });
      n.pos.set(head.x, 0.34, head.z);
      audio.play('bawk', { pitch: 1.1 });
      s.particles.burst(9, { x: head.x, y: 0.55, z: head.z, vy: 0.8, life: 1.1, size: 2, color: 0xfff6ea, color2: 0xe8dcc8, alpha: 1, alpha2: 0, grav: 1.2, drag: 1.5, wob: 0.8 }, { x: 0.1, y: 0.05, z: 0.1, v: 0.9 });
      s.emote(n, '!', { life: 1.0 });
      await s.sleepFor(0.55);
    } else await s.sleepFor(0.6);
    // up again, dizzy
    p.rig.play('idle');
    await s.tween(0.3, (k) => {
      p.body.rotation.x = lerp(-Math.PI / 2, 0, k);
      p.body.position.y = lerp(0.12, 0, k);
    });
    p.body.rotation.set(0, 0, 0);
    p.body.position.set(0, 0, 0);
    p.rig.face(Math.PI * 0.25, true);
    p.rig.doEmote('shake', 1.3);
    audio.play('shake');
    s.emote(p, '?', { life: 1.6 });
    // Nugget flutters off to the bed (or the floor beside the mole)
    if (n) this.flutterOff(n);
    await s.sleepFor(0.5);
    // hand control back
    p.collide = true;
    p.scripted = false;
    s.map.resolve(p.pos, p.radius);
    s.locked = false;
    s.noPrompt = false;
    s.game.ui.setTouchControls(true);
    s.camFocus = null;
    s.cam.zoomGoal = z0;
    s.tickers.splice(s.tickers.indexOf(tick), 1);
    this.resetShadow(p);
    this.done = true;
    s.later(0.3, () => s.say(p, 'Oof… still in one piece.'));
    s.later(2.6, () => {
      s.say(p, 'Way too high to climb back up. I\'ll just have to dig my way out!', { life: 4.4 });
      s.showDigHint();
    });
    s.later(3.4, () => { stars.done = true; });
  }

  impact(x, z, power) {
    const s = this.s, audio = s.game.audio;
    audio.play('thud', { vol: 1 });
    audio.play('collapse', { vol: 0.55 * power });
    s.cam.shake = 0.9 * power;
    // a ring of dust, clods and pebbles, more dirt raining from the hole
    s.particles.burst(26, { x, y: 0.12, z, vy: 0.5, life: 1.3, size: 3.2, size2: 6, color: 0x9a7a5a, color2: 0x5a4a3a, alpha: 0.75, alpha2: 0, drag: 2.4 }, { x: 0.25, y: 0.05, z: 0.25, v: 2.2, vy: 0.4 });
    s.particles.burst(16, { x, y: 0.2, z, vy: 2.2, life: 0.9, size: 2, color: 0x5a3e2a, color2: 0x3a281a, alpha: 1, alpha2: 1, grav: 7 }, { x: 0.15, y: 0.05, z: 0.15, v: 1.6 });
    for (let i = 0; i < 18; i++) {
      s.particles.spawn({ x: x + rand(-0.45, 0.45), y: rand(3.2, 5.5), z: z + rand(-0.4, 0.4), vy: rand(-1, 0), life: 1.6, size: rand(1.5, 2.6), color: 0x6a4a32, alpha: 1, alpha2: 1, grav: 6, fn: (q) => { if (q.y < 0.04) q.dead = true; } });
    }
  }

  /** Little stars circling the mole's head; returns a handle ({done}) that stops them. */
  dizzy(a, secs) {
    const s = this.s, h = { done: false };
    let t = 0;
    const tick = (dt) => {
      t += dt;
      if (h.done || t > secs + 3) { s.tickers.splice(s.tickers.indexOf(tick), 1); return; }
      if (Math.random() < dt * 14) {
        const hp = a.headPos(new THREE.Vector3());
        const ang = t * 7 + Math.random() * 0.3;
        s.particles.spawn({ x: hp.x + Math.cos(ang) * 0.28, y: hp.y + 0.12, z: hp.z + Math.sin(ang) * 0.28, vy: 0.05, life: 0.4, size: 2.2, color: 0xfff0a0, color2: 0xffc040, alpha: 1, alpha2: 0, add: true, blink: 18 });
      }
    };
    s.tickers.push(tick);
    return h;
  }

  async flutterOff(n) {
    const s = this.s;
    const bed = s.findKind('bed');
    let tx, tz, ty;
    if (bed) { tx = bed.cx; tz = bed.cz; ty = (bed.res.lie?.y ?? 0.45) + 0.02; }
    else { tx = n.x + 0.8; tz = n.z + 0.5; ty = 0; }
    const x0 = n.x, z0 = n.z, y0 = n.pos.y;
    n.faceToward(tx, tz);
    s.game.audio.play('cluck', { n: 2 });
    await s.tween(0.7, (k) => {
      n.pos.x = lerp(x0, tx, k);
      n.pos.z = lerp(z0, tz, k);
      n.pos.y = lerp(y0, ty, k) + Math.sin(k * Math.PI) * 0.6;
      this.groundShadow(n);
    });
    n.pos.y = ty;
    this.groundShadow(n);
    s.particles.burst(4, { x: tx, y: ty + 0.3, z: tz, vy: 0.4, life: 1, size: 1.8, color: 0xfff6ea, alpha: 1, alpha2: 0, grav: 1, wob: 0.6 }, { x: 0.1, y: 0.05, z: 0.1, v: 0.4 });
    await s.sleepFor(1.6);
    // hop down and start following
    if (ty > 0) {
      const fx = tx + (s.player.x > tx ? 0.7 : -0.7), fz = tz + 0.4;
      const ok = s.map.freeAt(fx, fz, 0.18);
      const ex = ok ? fx : s.player.x + 0.5, ez = ok ? fz : s.player.z + 0.5;
      await s.tween(0.4, (k) => {
        n.pos.x = lerp(tx, ex, k);
        n.pos.z = lerp(tz, ez, k);
        n.pos.y = lerp(ty, 0, k) + Math.sin(k * Math.PI) * 0.3;
        this.groundShadow(n);
      });
    }
    n.pos.y = 0;
    this.resetShadow(n);
    n.collide = true;
    n.scripted = false;
    s.map.resolve(n.pos, 0.17);
  }
}
