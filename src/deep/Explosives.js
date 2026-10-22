// Dynamite. The dynamite slot lights the strongest charge in the bag and throws it: a little voxel
// stick (or a bundle, or the beeping blasting charge) that flies in an arc, bounces and rolls on
// the rock, hisses and sparks along its fuse, then goes off: DigScene's blast() digs the crater
// and throws the rock; this module adds the flash (a point light), the fireball, the shockwave
// dust ring and the smoke. No blasting in the burrow, Deep Town, lift rooms or Old Star's dig:
// throwing from there is refused, and a charge that rolls in sputters out (you get it back).
// A charge that lands in water fizzles; one in lava goes off at once; a blast sets off charges
// nearby. Upgrade-board bonuses (state.mineBonus()): blast radius, throw speed, sticky fuses,
// spare sticks; the board's in-mine perks (./explosives/perks.js) tick here too.
//
// API (DigScene, see docs/DEEP.md): new Explosives(ctx) · throw(item, eye, dir) → events | false ·
// update(dt, { player, eye, time }) → events · lights(eye) · dispose() · debug.*
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { makeObjectMaterial } from './TerrainMaterial.js';
import { VOX, M } from './materials.js';
import { explosiveModel } from './explosives/models.js';
import { Perks } from './explosives/perks.js';

const GRAV = 13;
const MAX_LIVE = 10;
const STEP = 1 / 120;
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const rnd = (a, b) => a + Math.random() * (b - a);

export class Explosives {
  constructor(ctx) {
    this.ctx = ctx;
    this.w = ctx.world;
    this.U = ctx.U;
    this.fx = ctx.fx;
    this.audio = ctx.audio;
    this.st = ctx.state;
    this.owner = ctx.owner;
    this.plan = ctx.plan || ctx.world?.plan || {};
    this.scene3 = ctx.scene3 || ctx.scene;
    this.root = new THREE.Group();
    this.scene3.add(this.root);
    this.mat = makeObjectMaterial(this.U, { texel: 80 });
    this.lampMat = makeObjectMaterial(this.U, { emissive: 2.4 });
    this.list = []; // lit (or dud) charges
    this.flashes = []; // blast lights fading out
    this.out = []; // events raised outside update (throw refusals), sent with the next frame
    this.time = 0;
    this.hiss = null;
    this.zones = this.protectedZones();
    this.perks = new Perks(ctx);
    this.debug = {
      list: () => this.list.map((s) => ({ id: s.item.id, x: +s.pos.x.toFixed(2), y: +s.pos.y.toFixed(2), z: +s.pos.z.toFixed(2), fuse: +s.fuse.toFixed(2), rest: s.rest, wet: s.wet })),
      boom: () => { for (const s of this.list) s.fuse = Math.min(s.fuse, 0.01); },
      zones: () => this.zones,
      protectedAt: (x, y, z, m = 0) => this.protectedAt(x, y, z, m)?.name || null,
      perks: this.perks,
    };
  }

  // ------------------------------------------------------------------ no-blast zones
  protectedZones() {
    const p = this.plan, z = [];
    if (p.house) { const h = p.house; z.push({ box: [h.x0 - 3, (h.y0 ?? 0) - 2.5, h.z0 - 3, h.x1 + 3, (h.y1 ?? 3) + 1.5, h.z1 + 3], name: 'your burrow' }); }
    if (p.town) { const T = p.town; z.push({ sphere: [T.x - 1, T.y + 0.5, T.z, (T.r || 5) + 5], name: 'Deep Town' }); }
    for (const L of p.lifts || []) z.push({ box: [L.x - 2.8, L.y - 1.2, L.z - 2.8, L.x + 2.8, L.y + 3.4, L.z + 2.8], name: `the ${L.name || 'old'} lift` });
    if (p.prologue) { const P = p.prologue; z.push({ sphere: [P.x, P.y, P.z, 5], name: 'Old Star', when: () => !this.st?.flag?.('prologue') }); }
    return z;
  }

  /** The no-blast zone within `margin` m of a point, or null. */
  protectedAt(x, y, z, margin = 0) {
    for (const Z of this.zones) {
      if (Z.when && !Z.when()) continue;
      let d;
      if (Z.box) {
        const [x0, y0, z0, x1, y1, z1] = Z.box;
        d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1), Math.max(z0 - z, 0, z - z1));
      } else {
        const [sx, sy, sz, r] = Z.sphere;
        d = Math.max(0, Math.hypot(x - sx, y - sy, z - sz) - r);
      }
      if (d <= margin) return Z;
    }
    return null;
  }

  say(html, tone = 'warn', key = 'dyn', cd = 3) { this.out.push({ say: html, key, tone, cd }); }

  // ------------------------------------------------------------------ throwing
  /** Light and throw an explosive item from the eye along dir. Events, or false when refused. */
  throw(item, eye, dir) {
    if (!item || !item.blast) return false;
    const zone = this.protectedAt(eye.x, eye.y, eye.z, 0.2);
    if (zone) {
      this.audio?.play('ui_error');
      this.say(`No blasting near ${zone.name}! Take it somewhere quieter.`, 'warn', 'dynzone', 3);
      return false;
    }
    if (this.list.filter((s) => !s.wet).length >= MAX_LIVE) { this.say('That\'s plenty of lit fuses for now.', 'warn', 'dynmax', 3); return false; }
    const st = this.st, mb = st?.mineBonus?.() || {};
    const model = explosiveModel(item);
    const f = _v.set(dir.x, dir.y, dir.z).normalize().clone();
    const right = new THREE.Vector3(-f.z, 0, f.x);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    // out of the paw: in front, a little right and below the eye
    const pos = new THREE.Vector3(eye.x, eye.y, eye.z).addScaledVector(f, 0.3).addScaledVector(right, 0.1).add(_a.set(0, -0.12, 0));
    if (this.solid(pos.x, pos.y, pos.z)) pos.set(eye.x, eye.y, eye.z).addScaledVector(f, 0.08);
    if (this.solid(pos.x, pos.y, pos.z)) pos.set(eye.x, eye.y, eye.z);
    const speed = (item.toss || 6.5) * (mb.toss || 1);
    const vel = f.clone().multiplyScalar(speed).add(_a.set(0, 1.5, 0));
    const pv = this.ctx.player?.vel;
    if (pv) vel.addScaledVector(pv, 0.5);
    // held upright-ish, tumbling end over end as it flies
    const q = new THREE.Quaternion().setFromUnitVectors(UP, _a.copy(f).multiplyScalar(0.5).add(UP).normalize());
    const spin = right.clone().multiplyScalar(-(model.charge ? 4 : 10) * (0.8 + Math.random() * 0.4)).add(_a.set(rnd(-1.5, 1.5), rnd(-1.5, 1.5), rnd(-1.5, 1.5)));
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(model.body, this.mat);
    const fuseN = model.fuses.length - 1;
    const fuseMesh = new THREE.Mesh(model.fuses[fuseN] || model.body, this.mat);
    for (const m of [body, fuseMesh]) m.layers.enable(LAYER_OUTLINE);
    mesh.add(body, fuseMesh);
    let lamp = null;
    if (model.lamp) { lamp = new THREE.Mesh(model.lamp, this.lampMat); mesh.add(lamp); }
    mesh.position.copy(pos);
    mesh.quaternion.copy(q);
    this.root.add(mesh);
    const s = {
      item, model, pos, vel, q, spin, mesh, fuseMesh, lamp, fuseIdx: fuseN,
      fuse: item.fuse ?? 2.4, fuse0: item.fuse ?? 2.4, r: model.radius, t: 0,
      ground: false, rest: false, restT: 0, stuck: false, sticky: !!mb.sticky, wet: false, dudT: 0, roll: 0, beepT: 0.15, lampOn: 0, bounced: 0,
    };
    this.list.push(s);
    this.audio?.play('ignite');
    this.audio?.play('whoosh', { vol: 0.35, pitch: 0.9 });
    const evs = [];
    if (st && !st.flag?.('dynHint')) {
      st.flag('dynHint', true);
      evs.push({ say: `Fuse lit! <b>${item.name}</b> goes off in ${Math.round(s.fuse)} s. Stand clear of the blast.`, key: 'dynhint', tone: 'warn', cd: 99 });
    }
    // Spare Sticks: sometimes it was an extra one (DigScene takes one from the bag after this)
    if (mb.spare > 0 && Math.random() < mb.spare && st) {
      st.addItem(item.id);
      evs.push({ say: `Spare ${item.name.toLowerCase()}! Grubb packed an extra.`, key: 'dynspare', tone: 'good', cd: 2 });
    }
    return evs;
  }

  solid(x, y, z) { return this.w.solidAt(x, y, z); }
  matAt(x, y, z) { return this.w.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX)); }

  // ------------------------------------------------------------------ frame
  update(dt, o = {}) {
    this.time += dt;
    const eye = o.eye || this.ctx.player?.eye?.();
    for (const s of [...this.list]) this.step(s, dt, eye);
    for (const f of this.flashes) f.t += dt;
    this.flashes = this.flashes.filter((f) => f.t < f.life);
    // the hiss of the nearest burning fuse
    let near = 1e9;
    if (eye) for (const s of this.list) if (!s.wet) near = Math.min(near, s.pos.distanceTo(eye));
    if (near < 14) {
      if (!this.hiss) this.hiss = this.audio?.loop?.('sizzle', { vol: 0.01 }) || null;
      this.hiss?.set({ vol: 0.55 * Math.max(0, 1 - near / 14) ** 1.5 });
    } else if (this.hiss) { this.hiss.stop(); this.hiss = null; }
    const out = this.out.splice(0);
    try { out.push(...this.perks.update(dt, o)); } catch (e) { console.warn('perks', e); }
    return out;
  }

  /** One charge: flight, bounces, rolling, the fuse burning down, then the bang. */
  step(s, dt, eye) {
    s.t += dt;
    if (!s.wet) s.fuse -= dt;
    // physics (a resting charge wakes when the rock under it goes)
    if (s.rest && !s.stuck && !this.supported(s)) { s.rest = false; s.restT = 0; }
    if (!s.rest && !s.stuck) {
      const n = Math.max(1, Math.ceil(dt / STEP)), h = dt / n;
      for (let k = 0; k < n && !s.stuck; k++) this.integrate(s, h);
    }
    this.orient(s, dt);
    s.mesh.position.copy(s.pos);
    s.mesh.quaternion.copy(s.q);
    // water puts the fuse out; lava sets it off
    if (!s.wet) {
      const m = this.matAt(s.pos.x, s.pos.y, s.pos.z);
      if (m === M.WATER) {
        s.wet = true; s.dudT = 3.5;
        this.audio?.play('sizzle');
        this.fx?.steam?.(s.pos.x, s.pos.y + 0.05, s.pos.z, 1);
        this.say(`The ${s.item.name.toLowerCase()} hissed out in the water.`, 'warn', 'dynwet', 4);
        if (s.fuseMesh) s.fuseMesh.visible = false;
      } else if (m === M.LAVA && s.fuse > 0.05) s.fuse = 0.05;
    }
    if (s.wet) {
      s.dudT -= dt;
      if (s.dudT <= 0) this.remove(s);
      return;
    }
    this.burn(s, dt, eye);
    if (s.fuse <= 0) this.detonate(s);
  }

  supported(s) { return this.solid(s.pos.x, s.pos.y - s.r - 0.03, s.pos.z); }

  integrate(s, h) {
    const p = s.pos, v = s.vel, r = s.r;
    const inWater = s.wet;
    v.y -= (inWater ? 2 : GRAV) * h;
    v.multiplyScalar(Math.max(0, 1 - (inWater ? 3 : 0.12) * h));
    let landed = false;
    for (const ax of ['y', 'x', 'z']) {
      const d = v[ax] * h;
      if (!d) continue;
      const np = _a.copy(p);
      np[ax] += d;
      const sg = Math.sign(d);
      const px = np.x + (ax === 'x' ? sg * r : 0), py = np.y + (ax === 'y' ? sg * r : 0), pz = np.z + (ax === 'z' ? sg * r : 0);
      const hit = this.solid(px, py, pz) || (ax !== 'y' && this.solid(px, py - r * 0.6, pz));
      if (!hit) { p[ax] = np[ax]; continue; }
      const impact = Math.abs(v[ax]);
      if (s.sticky && impact > 0.6 && !s.ground) {
        // Sticky Fuse: it stays where it hits, wall or ceiling
        s.stuck = true;
        v.set(0, 0, 0);
        this.audio?.play('clunk', { vol: 0.5 });
        this.fx?.dust(p.x, p.y, p.z, 3, [0.5, 0.45, 0.4], 0.04);
        return;
      }
      if (ax === 'y' && d < 0) landed = true;
      v[ax] = impact < (ax === 'y' ? 0.9 : 0.3) ? 0 : -v[ax] * (s.model.charge ? 0.18 : 0.32);
      const fr = s.model.charge ? 0.6 : 0.8;
      if (ax === 'y') { v.x *= fr; v.z *= fr; } else { v.y *= 0.9; v[ax === 'x' ? 'z' : 'x'] *= fr; }
      s.spin.multiplyScalar(0.55).add(_v.set(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3)).multiplyScalar(Math.min(1, impact / 4)));
      if (impact > 1.1) {
        s.bounced++;
        const dist = this.ctx.player ? s.pos.distanceTo(this.ctx.player.pos) : 4;
        this.audio?.play(s.model.charge ? 'thud' : 'clunk', { vol: Math.min(1, impact / 6) * Math.max(0.15, 1 - dist / 14) });
        this.fx?.dust(p.x, p.y - (ax === 'y' ? r : 0), p.z, 2, [0.5, 0.44, 0.38], 0.04);
      }
    }
    s.ground = landed || this.supported(s);
    if (s.ground) {
      // rolling (sticks) or sliding (the drum) friction
      const hv = Math.hypot(v.x, v.z), dec = (s.model.charge ? 5 : 1.4) * h;
      if (hv <= dec) { v.x = 0; v.z = 0; } else { v.x *= (hv - dec) / hv; v.z *= (hv - dec) / hv; }
      if (hv < 0.05 && Math.abs(v.y) < 0.4) { s.restT += h; if (s.restT > 0.2) { s.rest = true; v.set(0, 0, 0); } } else s.restT = 0;
    } else s.restT = 0;
  }

  /** Tumble in the air; on the ground a stick lies down and rolls like a log, the drum stands up. */
  orient(s, dt) {
    if (s.stuck) return;
    const q = s.q;
    if (!s.ground) {
      const w = s.spin.length();
      if (w > 1e-4) { _q.setFromAxisAngle(_a.copy(s.spin).divideScalar(w), w * dt); q.premultiply(_q).normalize(); }
      return;
    }
    s.spin.multiplyScalar(Math.max(0, 1 - dt * 8));
    let target;
    if (s.model.charge) {
      // stand up, keeping the yaw it has
      const fwd = _a.set(0, 0, 1).applyQuaternion(q); fwd.y = 0;
      const yaw = fwd.lengthSq() > 1e-4 ? Math.atan2(fwd.x, fwd.z) : 0;
      target = _q2.setFromAxisAngle(UP, yaw);
    } else {
      const v = s.vel, hv = Math.hypot(v.x, v.z);
      const axis = _a.set(0, 1, 0).applyQuaternion(q); axis.y = 0;
      if (hv > 0.08) {
        // roll axis across the motion, on the side the stick already points
        const ax = new THREE.Vector3(v.z, 0, -v.x).divideScalar(hv);
        if (axis.dot(ax) < 0) ax.negate();
        axis.copy(ax);
        s.roll += (hv / Math.max(0.02, s.r * 0.75)) * dt * Math.sign(ax.dot(_v.set(v.z, 0, -v.x)) || 1);
      } else if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
      axis.normalize();
      const lie = new THREE.Quaternion().setFromUnitVectors(UP, axis);
      target = _q2.setFromAxisAngle(axis, s.roll).multiply(lie);
    }
    q.slerp(target, 1 - Math.exp(-dt * 16));
  }

  /** The fuse burning: it shortens, spits sparks and smoke; the drum beeps and blinks. */
  burn(s, dt, eye) {
    const m = s.model, fx = this.fx;
    const nF = m.fuses.length - 1;
    const idx = Math.max(0, Math.min(nF, Math.ceil((s.fuse / s.fuse0) * nF)));
    if (idx !== s.fuseIdx) {
      s.fuseIdx = idx;
      if (m.fuses[idx]) { s.fuseMesh.geometry = m.fuses[idx]; s.fuseMesh.visible = true; } else s.fuseMesh.visible = false;
    }
    s.mesh.updateMatrixWorld(true);
    const tip = _v.copy(m.tips[idx]).applyMatrix4(s.mesh.matrixWorld);
    s.tip = s.tip || new THREE.Vector3();
    s.tip.copy(tip);
    if (fx) {
      const late = s.fuse < 0.7 ? 2 : 1;
      let n = Math.floor(dt * 70 * late + Math.random());
      while (n-- > 0) {
        fx.spawn({ x: tip.x, y: tip.y, z: tip.z, vx: rnd(-0.9, 0.9), vy: rnd(0.2, 1.4), vz: rnd(-0.9, 0.9), life: rnd(0.1, 0.32), size: rnd(0.007, 0.014),
          color: Math.random() < 0.5 ? [1, 0.85, 0.4] : [1, 0.55, 0.18], glow: true, drag: 2.2, grav: 5, bounce: 0.3 });
      }
      if (Math.random() < dt * 7) fx.spawn({ x: tip.x, y: tip.y + 0.01, z: tip.z, vx: rnd(-0.05, 0.05), vy: rnd(0.15, 0.35), vz: rnd(-0.05, 0.05), life: rnd(0.8, 1.5), size: 0.018, grow: 0.07, color: [0.42, 0.4, 0.38], alpha: 0.35, drag: 1.2, grav: -0.15 });
    }
    s.flick = 0.75 + Math.random() * 0.5;
    // the blasting charge beeps faster and faster, its lamp blinking with each beep
    if (m.charge) {
      s.beepT -= dt;
      s.lampOn = Math.max(0, s.lampOn - dt);
      if (s.beepT <= 0) {
        const k = Math.max(0, s.fuse / s.fuse0);
        s.beepT = 0.09 + 0.55 * k * k;
        s.lampOn = 0.07;
        const d = eye ? s.pos.distanceTo(eye) : 4;
        const vol = 0.07 * Math.max(0.1, 1 - d / 16);
        this.audio?.tone?.({ f: k < 0.25 ? 2300 : 1800, type: 'square', dur: 0.05, vol, filter: 'lowpass', ff: 4000 });
      }
      if (s.lamp) s.lamp.visible = s.lampOn > 0;
    }
  }

  remove(s) {
    const i = this.list.indexOf(s);
    if (i >= 0) this.list.splice(i, 1);
    this.root.remove(s.mesh);
  }

  // ------------------------------------------------------------------ the bang
  detonate(s) {
    this.remove(s);
    const st = this.st, owner = this.owner;
    const { x, y, z } = s.pos;
    const mb = st?.mineBonus?.() || {};
    const r = s.item.blast * (mb.blast || 1) * (this.ctx.state?.skill?.('blast') || 1), power = s.item.power ?? 1;
    const zone = this.protectedAt(x, y, z, r + 0.6);
    if (zone) {
      // too close to something precious: the fuse sputters out and the charge goes back in the bag
      this.audio?.play('hiss');
      this.fx?.dust(x, y + 0.05, z, 8, [0.4, 0.38, 0.36], 0.08);
      st?.addItem(s.item.id);
      owner?.updateHotbar?.();
      this.say(`The fuse sputtered out: no blasting near ${zone.name}. You fish the ${s.item.name.toLowerCase()} back out.`, 'warn', 'dynfizzle', 3);
      return;
    }
    // a white flash on screen when it's close
    const pl = this.ctx.player;
    const dist = pl ? Math.hypot(pl.pos.x - x, pl.pos.y + 0.4 - y, pl.pos.z - z) : 99;
    if (owner?.post && dist < r * 7) { owner.post.flash = Math.max(owner.post.flash || 0, 0.5 * (1 - dist / (r * 7))); owner.post.flashColor = 0xfff0c8; }
    this.flashes.push({ x, y, z, t: 0, life: 0.6 + r * 0.15, r: 5 + r * 3.5 });
    try { owner?.blast?.(x, y, z, r, power); } catch (e) { console.warn('blast failed', e); }
    this.shockwave(x, y, z, r);
    this.audio?.play('rumble_hit', { vol: Math.min(1, 0.4 + r * 0.25) });
    if (st) {
      st.data.stats.blasts = (st.data.stats.blasts || 0) + 1;
      st.data.stats.explosions = (st.data.stats.explosions || 0) + 1;
      st.learn?.('explosion');
    }
    // charges caught in the blast go off too
    for (const o of this.list) {
      if (o.wet) continue;
      const d = o.pos.distanceTo(s.pos);
      if (d < r + 0.9 && o.fuse > 0.16) {
        o.fuse = 0.1 + Math.random() * 0.12;
        o.rest = false; o.stuck = false;
        o.vel.add(_a.copy(o.pos).sub(s.pos).setLength(3)).add(_v.set(0, 1.5, 0));
      }
    }
  }

  /** Fireball, a ring of dust racing out, sparks and a column of smoke. */
  shockwave(x, y, z, r) {
    const fx = this.fx;
    if (!fx) return;
    for (let i = 0; i < 16 + r * 6; i++) {
      fx.spawn({ x: x + rnd(-0.15, 0.15) * r, y: y + rnd(-0.15, 0.15) * r, z: z + rnd(-0.15, 0.15) * r, vx: rnd(-1.5, 1.5), vy: rnd(-0.5, 1.8), vz: rnd(-1.5, 1.5),
        life: rnd(0.12, 0.32), size: rnd(0.1, 0.22) * (0.7 + r * 0.3), grow: 0.6, color: Math.random() < 0.5 ? [1, 0.9, 0.6] : [1, 0.55, 0.2], glow: true, drag: 4 });
    }
    // the shockwave: a flat ring of dust and a faster, thinner ring of sparks
    const N = Math.round(30 + r * 16);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + rnd(-0.05, 0.05), c = Math.cos(a), sn = Math.sin(a);
      const sp = (3.4 + r * 1.7) * rnd(0.85, 1.15);
      const k = rnd(0.75, 1.05);
      fx.spawn({ x: x + c * r * 0.3, y: y + rnd(-0.1, 0.1), z: z + sn * r * 0.3, vx: c * sp, vy: rnd(-0.15, 0.45), vz: sn * sp,
        life: rnd(0.7, 1.2), size: 0.05 + r * 0.025, grow: 0.3 + r * 0.06, color: [0.58 * k, 0.5 * k, 0.42 * k], alpha: 0.6, drag: 3.4, grav: -0.1 });
      if (i % 2 === 0) fx.spawn({ x, y, z, vx: c * sp * 2.2, vy: rnd(-0.3, 0.6), vz: sn * sp * 2.2, life: rnd(0.15, 0.3), size: 0.016, color: [1, 0.85, 0.5], glow: true, drag: 3 });
    }
    // a vertical ring too, so it reads from any angle
    for (let i = 0; i < N / 2; i++) {
      const a = (i / (N / 2)) * Math.PI * 2, sp = (2.6 + r * 1.2) * rnd(0.85, 1.15);
      const yaw = Math.random() * Math.PI;
      fx.spawn({ x, y, z, vx: Math.cos(a) * Math.cos(yaw) * sp, vy: Math.sin(a) * sp, vz: Math.cos(a) * Math.sin(yaw) * sp,
        life: rnd(0.5, 0.9), size: 0.04 + r * 0.02, grow: 0.25, color: [0.5, 0.44, 0.38], alpha: 0.45, drag: 3.6 });
    }
    fx.sparks(x, y, z, Math.round(20 + r * 10), [1, 0.7, 0.3], [0, 0.4, 0], 6 + r * 2);
    for (let i = 0; i < 10 + r * 6; i++) {
      fx.spawn({ x: x + rnd(-0.3, 0.3) * r, y: y + rnd(0, 0.3) * r, z: z + rnd(-0.3, 0.3) * r, vx: rnd(-0.25, 0.25), vy: rnd(0.4, 1.2), vz: rnd(-0.25, 0.25),
        life: rnd(1.8, 3.4), size: rnd(0.07, 0.12) * (0.7 + r * 0.3), grow: 0.28, color: [0.2, 0.19, 0.19], alpha: 0.55, drag: 0.9, grav: -0.25 });
    }
    for (let i = 0; i < 12 + r * 6; i++) fx.ember(x + rnd(-0.5, 0.5) * r, y + rnd(-0.3, 0.3) * r, z + rnd(-0.5, 0.5) * r);
  }

  // ------------------------------------------------------------------ lights
  lights(eye) {
    const out = [];
    for (const f of this.flashes) {
      const k = Math.pow(Math.max(0, 1 - f.t / f.life), 1.6);
      out.push({ x: f.x, y: f.y, z: f.z, c: [3.4 * k, 2.3 * k, 1.2 * k], r: f.r * (0.55 + 0.45 * k) });
    }
    // burning fuses glow a little (the nearest two), the drum's lamp blinks red
    const lit = this.list.filter((s) => !s.wet && s.tip).sort((a, b) => a.pos.distanceToSquared(eye) - b.pos.distanceToSquared(eye)).slice(0, 2);
    for (const s of lit) {
      const fl = s.flick ?? 1;
      out.push({ x: s.tip.x, y: s.tip.y + 0.03, z: s.tip.z, c: [1.1 * fl, 0.6 * fl, 0.22 * fl], r: 1.8 });
      if (s.lampOn > 0) out.push({ x: s.pos.x, y: s.pos.y + 0.12, z: s.pos.z, c: [1.4, 0.15, 0.1], r: 1.4 });
    }
    return out;
  }

  dispose() {
    this.hiss?.stop?.();
    this.hiss = null;
    this.scene3.remove(this.root);
    this.mat.dispose();
    this.lampMat.dispose();
    this.list = [];
    this.flashes = [];
  }
}
