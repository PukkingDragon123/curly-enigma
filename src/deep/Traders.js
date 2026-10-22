// The folk who live in the mine's burrows, and their shops (an optional mine module, like Props).
// Each burrow in plan.burrows (dressed in voxels by gen/burrows.js) gets, when the mole comes
// within ~22 m: its 3D props (one merged mesh, plus the bits that move: the trader's scale, Rocco's
// swinging lantern, the cauldron's fire, the brazier, the secret door), the sign over its door, its
// lights, sounds and particles, and its keeper (./traders/folk.js; Rocco is ./traders/rocco.js).
// E on a keeper opens their counter (./traders/shop.js). Rocco's back wall hides a secret door
// to his stash nook.
//
// API (DigScene): new Traders(ctx) · update(dt, { player, eye, time }) → events · target(eye, dir,
// reach) → { label, kind: 'use' } | null · use(eye, dir, reach) → events | null · lights(eye) →
// ≤ 4 point lights · onVoxel() (no-op) · dispose() · debug (see the bottom of the constructor).
// Emits act events: { type: 'reach', place: 'burrow:<kind>' } on walking in, 'talk' when a counter
// opens, 'buy' / 'sell' on trades (shop.js), { type: 'puzzle', id: 'rocco_door' } for the secret door.
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { VOX, M } from './materials.js';
import { OPAQUE } from './Mesher.js';
import { key3, CB } from './World.js';
import { burrowLayout, roomToWorld, worldToRoom, roomYaw } from './gen/burrows.js';
import { traderMaterial, getModel, mergeModels, modelMesh, hasModel } from './traders/kit.js';
import './traders/models.js';
import './traders/models2.js';
import { Folk } from './traders/folk.js';
import { openBurrowShop, traderData } from './traders/shop.js';
import { SHOPS } from '../data/shops.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';

const SHOP_OF = { trader: 'trader', herbalist: 'herbalist', raccoon: 'rocco', outpost: 'outpost' };
const R_BUILD = 22, R_DROP = 30;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3();
const SWING = new Set(['herbs', 'noquestions', 'signboard', 'banner']);
// small things on counters and tables, sized down to mole scale
const SCALE = { bell: 0.55, coins: 0.7, ledger: 0.72, candle: 0.75, lanternpost: 0.7, potion: 0.62, mortar: 0.68, herbpile: 0.75, book: 0.7, jewels: 0.72, dynamite: 0.7, scale: 0.85, herbs: 0.72, gembox: 0.8, oreb: 0.85, skull: 0.75 };

export class Traders {
  constructor(ctx) {
    this.c = { ...ctx, scene3: ctx.scene3 || ctx.scene };
    this.scene3 = this.c.scene3;
    this.world = ctx.world;
    this.plan = ctx.plan || ctx.world.plan;
    this.state = ctx.state;
    this.ui = ctx.ui;
    this.audio = ctx.audio;
    this.fx = ctx.fx;
    this.owner = ctx.owner;
    this.mat = traderMaterial(ctx.U);
    this.time = 0;
    this.burrows = this.plan.features.filter((f) => f.kind === 'burrow').map((f) => ({ f, L: burrowLayout(f), id: f.id, kind: f.burrow, shopId: SHOP_OF[f.burrow] || 'trader', built: null, job: null, inside: false, dist: 1e9 }));
    // the keepers are toon-shaded: a lamp-warm key light where we are, a soft fill, a fill at the eye
    this.amb = new THREE.AmbientLight(0xffe2c8, 0);
    this.key = new THREE.PointLight(0xffc888, 0, 7, 1.3);
    this.fill = new THREE.PointLight(0xffd8a8, 0, 8, 1.4);
    this.scene3.add(this.amb, this.key, this.fill);
    this.panel = null;
    this.loops = {};
    this.outLights = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, z: 0, c: [0, 0, 0], r: 1, lantern: true }));
    traderData(this.state);
    // test hooks: scene.traders.debug
    const T = this;
    this.debug = {
      /** the burrows: id, kind, keeper, where, built */
      list: () => this.burrows.map((b) => ({ id: b.id, kind: b.kind, shop: b.shopId, keeper: SHOPS[b.shopId].keeper.name, x: +b.f.x.toFixed(1), y: +b.f.y.toFixed(1), z: +b.f.z.toFixed(1), built: !!b.built?.done, dist: +b.dist.toFixed(1) })),
      /** teleport the mole: where 'door' (just inside, looking in) | 'counter' (facing the keeper) | 'out' (on the porch) */
      go: (id, where = 'counter') => T.go(id, where),
      /** build a burrow now (headless tests) */
      build: (id) => { const b = T.find(id); if (!b) return false; T.ensureBuilt(b, true); return !!b.built?.done; },
      talk: (id) => { const b = T.find(id); if (!b) return null; T.ensureBuilt(b, true); return T.openShop(b); },
      shop: (id, tab) => { const b = T.find(id); if (!b) return null; T.ensureBuilt(b, true); return T.openShop(b, tab); },
      say: (id, text) => { const b = T.find(id); b?.built?.folk?.say(text || SHOPS[b.shopId].lines[0], { expr: 'happy' }); return !!b; },
      secret: () => T.openSecret(T.find('raccoon'), true),
      stash: () => T.lootStash(T.find('raccoon')),
      folk: (id) => T.find(id)?.built?.folk || null,
      layout: (id) => T.find(id)?.L,
      sim: (secs = 1) => { for (let t = 0; t < secs; t += 1 / 30) { T.c.owner?.update?.(1 / 30); } return true; },
    };
  }

  find(id) { return this.burrows.find((b) => b.id === id || b.kind === id || b.shopId === id) || null; }

  // ------------------------------------------------------------------ building
  /** Are the voxels of this burrow's room in memory (so ceilings can be found)? */
  ready(b) {
    const f = b.f, w = this.world;
    for (const [x, y, z] of [[f.x, f.y + 0.5, f.z], [f.x, f.y + f.h - 0.3, f.z], [f.x + f.rx * 0.6, f.y + 0.5, f.z], [f.x - f.rx * 0.6, f.y + 0.5, f.z], [f.x, f.y + 0.5, f.z + f.rz * 0.6], [f.x, f.y + 0.5, f.z - f.rz * 0.6]]) {
      const ch = w.chunks.get(key3(Math.floor(x * VOX) >> CB, Math.floor(y * VOX) >> CB, Math.floor(z * VOX) >> CB));
      if (!ch || ch.pending || (!ch.vox && !ch.virtual)) return false;
    }
    return true;
  }
  ceilingY(x, y0, z, max = 3.5) {
    const w = this.world, vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
    for (let vy = Math.floor(y0 * VOX); vy < Math.floor((y0 + max) * VOX); vy++) if (OPAQUE[w.voxelAt(vx, vy, vz)] === 1) return vy / VOX;
    return y0 + max;
  }

  /** Where a layout prop goes: { x, y, z, rot }. */
  place(b, p) {
    const f = b.f;
    const w = roomToWorld(f, p.u, p.v);
    const y = p.y === 'ceil' ? this.ceilingY(w.x, f.y + 0.7, w.z) : f.y + p.y;
    return { x: w.x, y, z: w.z, rot: roomYaw(f, p.rot || 0), s: p.scale ?? SCALE[p.type] ?? 1 };
  }
  matrix(at, s = 1) { _e.set(0, at.rot, 0); _q.setFromEuler(_e); _p.set(at.x, at.y, at.z); _s.setScalar(s); return _m.clone().compose(_p, _q, _s); }

  *buildSteps(b) {
    const f = b.f, L = b.L, T = traderData(this.state);
    const B = { group: new THREE.Group(), items: [], moving: [], lights: [], emit: [], sounds: [], done: false, folk: null, stash: null, door: null, hinges: null };
    B.group.name = 'burrow-' + b.id;
    const props = L.props.slice();
    // the sign over the door outside, and a lamp in the porch beside it
    props.push({ type: 'signboard', u: 0, v: f.rz + 1.0, y: 1.98, rot: 0, p: b.kind });
    props.push({ type: 'hanglamp', u: 0.84, v: f.rz + 0.55, y: 'ceil', rot: 0, variant: 0, porch: true });
    let t0 = performance.now();
    for (const p of props) {
      if (!hasModel(p.type)) continue;
      const at = this.place(b, p);
      if (p.type === 'noquestions') p.p = Math.round((this.ceilingY(at.x, f.y + 1.2, at.z) - at.y) * 32);
      if (p.type === 'noquestions') at.y = this.ceilingY(at.x, f.y + 1.2, at.z);
      const model = getModel(p.type, p.variant || 0, p.p || 0);
      if (!model) continue;
      const mat = this.matrix(at, at.s);
      const ph = (Math.abs(p.u * 7.3 + p.v * 3.1) % 6.28);
      if (p.anim || p.stash || p.type === 'cratedoor' || p.type === 'swinglamp') {
        this.addMoving(B, b, p, at, model);
      } else {
        B.items.push({ model, matrix: mat, sway: SWING.has(p.type) ? (model.swayAmt || 0.02) : 0, phase: ph });
      }
      if (model.light) {
        _v.set(...model.light.at).applyMatrix4(mat);
        B.lights.push({ x: _v.x, y: _v.y, z: _v.z, c: model.light.c, r: model.light.r, lantern: !!(model.light.lantern || model.light.fire), key: model.light.lantern && !p.porch, porch: !!p.porch });
      }
      if (performance.now() - t0 > 5) { yield 'props'; t0 = performance.now(); }
    }
    // the layout's fires and glows (lamps light themselves above)
    for (const l of L.lights) {
      if (l.lantern || l.swing) continue;
      const w = roomToWorld(f, l.u, l.v);
      B.lights.push({ x: w.x, y: f.y + l.y, z: w.z, c: l.c, r: l.r, lantern: !!l.fire });
      if (l.fire || l.glow) B.emit.push({ x: w.x, y: f.y + l.y, z: w.z, fire: !!l.fire, glow: !!l.glow, c: l.c, t: Math.random() });
    }
    if (B.items.length) {
      const geo = mergeModels(B.items);
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.layers.enable(LAYER_OUTLINE);
      mesh.name = 'burrow-props';
      B.group.add(mesh);
      B.mesh = mesh;
    }
    yield 'merged';
    this.scene3.add(B.group);
    // the keeper
    try { B.folk = new Folk({ ...this.c, world: this.world }, f, L, b.shopId); } catch (e) { console.warn('traders: folk', e); }
    yield 'folk';
    // ambient sounds
    if (b.kind === 'herbalist') B.sounds.push({ name: 'boil', at: B.emit.find((e) => e.fire), vol: 0.22 });
    if (b.kind === 'outpost') B.sounds.push({ name: 'fire', at: B.emit.find((e) => e.fire), vol: 0.2 });
    // Rocco's door: open already if found before
    if (B.door && T.secret) { B.door.k = 1; B.door.to = 1; }
    B.done = true;
    return B;
  }

  /** Props that move get their own meshes. */
  addMoving(B, b, p, at, model) {
    const T = traderData(this.state);
    const g = new THREE.Group();
    g.position.set(at.x, at.y, at.z);
    g.rotation.y = at.rot;
    g.scale.setScalar(at.s || 1);
    B.group.add(g);
    if (p.type === 'scale') {
      g.add(modelMesh(model, this.mat));
      const beam = modelMesh(getModel('scalebeam'), this.mat);
      const beamG = new THREE.Group();
      beamG.position.y = model.info?.beamY || 0.47;
      beamG.add(beam);
      g.add(beamG);
      const arm = getModel('scalebeam').info?.arm || 0.34;
      const pans = [1, 2].map((v, i) => { const pm = modelMesh(getModel('scalepan', v), this.mat); g.add(pm); return { m: pm, side: i ? 1 : -1 }; });
      B.moving.push({ kind: 'scale', g, beamG, pans, arm, t: Math.random() * 10 });
    } else if (p.type === 'swinglamp') {
      g.add(modelMesh(model, this.mat));
      B.moving.push({ kind: 'swing', g, a: 0.35, len: 37 / 32 - 6 / 32, t: Math.random() * 10, lit: model.light });
      B.swingLight = { x: at.x, y: at.y - 1, z: at.z, c: [0.95, 0.62, 0.3], r: 5.8, lantern: true, key: true };
      B.lights.push(B.swingLight);
      B.swing = B.moving[B.moving.length - 1];
    } else if (p.type === 'cauldron') {
      g.add(modelMesh(model, this.mat));
      const emb = modelMesh(getModel('embers'), this.mat);
      emb.position.y = -0.1;
      g.add(emb);
      B.moving.push({ kind: 'cauldron', g, t: 0 });
    } else if (p.type === 'brazier') {
      g.add(modelMesh(model, this.mat));
      const flames = [0, 1, 2].map((i) => { const fm = modelMesh(getModel('flame', i), this.mat, { outline: false }); fm.position.set((i - 1) * 0.06, 0.45, (i % 2 ? 0.04 : -0.03)); g.add(fm); return fm; });
      B.moving.push({ kind: 'fire', g, flames, t: Math.random() * 10 });
    } else if (p.type === 'cratedoor') {
      // the secret door: tell-tale hinges while it's shut, the crate stack swung open once found
      const S = b.L.secret;
      const side = { u: -S.dv, v: S.du };
      const hingeAt = roomToWorld(b.f, S.door.u + side.u * -S.w, S.door.v + side.v * -S.w);
      const hinges = modelMesh(getModel('hinges'), this.mat);
      const ha = roomYaw(b.f, S.a);
      hinges.position.set(hingeAt.x, b.f.y + 0.02, hingeAt.z);
      hinges.rotation.y = ha;
      // the slab: local x along the side axis, swung into the room round the hinge
      const dw = roomToWorld(b.f, side.u, side.v), d0 = roomToWorld(b.f, 0, 0);
      const sx = dw.x - d0.x, sz = dw.z - d0.z;
      const theta = Math.atan2(-sz, sx);
      const slab = modelMesh(getModel('cratedoor'), this.mat);
      const pivot = new THREE.Group();
      pivot.position.set(hingeAt.x, b.f.y, hingeAt.z);
      pivot.add(slab);
      slab.position.set(0, 0, -0.06);
      B.group.remove(g);
      B.group.add(hinges, pivot);
      // which way is "into the room" for the slab's swing
      const inward = roomToWorld(b.f, -S.du, -S.dv);
      const zx = Math.sin(theta), zz = Math.cos(theta);
      const sgn = zx * (inward.x - d0.x) + zz * (inward.z - d0.z) > 0 ? -1 : 1;
      pivot.rotation.y = theta;
      pivot.visible = !!T.secret;
      B.door = { pivot, hinges, theta, sgn, k: T.secret ? 1 : 0, to: T.secret ? 1 : 0 };
      B.moving.push({ kind: 'door', d: B.door });
    } else if (p.stash) {
      const m = modelMesh(getModel('stashchest', T.stash ? 1 : 0), this.mat);
      g.add(m);
      B.stash = { g, m, at: new THREE.Vector3(at.x, at.y + 0.2, at.z) };
    } else {
      g.add(modelMesh(model, this.mat));
    }
  }

  ensureBuilt(b, now = false) {
    if (b.built?.done) return b.built;
    if (!b.job) b.job = this.buildSteps(b);
    for (let i = 0; i < (now ? 999 : 1); i++) {
      const r = b.job.next();
      if (r.done) { b.built = r.value; b.job = null; break; }
    }
    return b.built;
  }

  drop(b) {
    const B = b.built;
    b.job = null;
    if (!B) return;
    B.folk?.dispose();
    B.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    B.group.parent?.remove(B.group);
    for (const s of B.sounds) s.h?.stop?.();
    b.built = null;
  }

  // ------------------------------------------------------------------ per frame
  update(dt, o = {}) {
    this.time += dt;
    const pl = o.player || this.c.player, eye = o.eye || pl.eye();
    const evs = [];
    let near = null;
    for (const b of this.burrows) {
      const f = b.f;
      b.dist = Math.hypot(f.x - eye.x, (f.y + 1 - eye.y) * 1.3, f.z - eye.z);
      if (b.dist < R_BUILD && !b.built && this.ready(b)) {
        // spread the building over frames (a few ms each)
        const t0 = performance.now();
        while (!b.built && performance.now() - t0 < 6) this.ensureBuilt(b);
      } else if (b.dist > R_DROP && (b.built || b.job)) this.drop(b);
      // walking in
      const r = worldToRoom(f, pl.pos.x, pl.pos.z);
      const e = (r.u / f.rx) ** 2 + (r.v / f.rz) ** 2;
      const inside = e < 1.15 && pl.pos.y > f.y - 0.6 && pl.pos.y < f.y + 2;
      if (inside && !b.inside) this.enter(b);
      b.inside = inside;
      if (b.built?.done && (!near || b.dist < near.dist)) near = b;
      if (b.built?.done) this.tick(b, dt, eye, inside);
    }
    this.lightKeepers(near, eye);
    return evs;
  }

  enter(b) {
    const T = traderData(this.state);
    T.found ||= {};
    this.state.emit('act', { type: 'reach', place: 'burrow:' + b.kind });
    if (!T.found[b.kind]) {
      T.found[b.kind] = (this.state.data.day ?? 0) + 1;
      const sh = SHOPS[b.shopId];
      this.ui?.toast?.(`<b>${sh.name}</b> · ${sh.title}. Talk to ${sh.keeper.name} to trade.`, { kind: 'good', icon: iconURL(b.kind === 'raccoon' ? 'amber_bug' : b.kind === 'herbalist' ? 'glowcap' : b.kind === 'outpost' ? 'dynamite' : 'crate') });
      this.audio?.play('discover');
    }
  }

  tick(b, dt, eye, inside) {
    const B = b.built, t = this.time, fx = this.fx;
    B.folk?.update(dt, { eye, inside, dist: B.folk ? Math.hypot(B.folk.pos.x - eye.x, B.folk.pos.z - eye.z) : 99 });
    const close = b.dist < 14;
    for (const m of B.moving) {
      if (m.kind === 'scale') {
        m.t += dt;
        const a = Math.sin(m.t * 0.9) * 0.07 + Math.sin(m.t * 2.3) * 0.02;
        m.beamG.rotation.z = a;
        for (const p of m.pans) { p.m.position.set(Math.cos(a) * m.arm * p.side, m.beamG.position.y + Math.sin(a) * m.arm * p.side - 0.02, 0); }
      } else if (m.kind === 'swing') {
        // a lantern on a chain, swinging slowly in the draught; its light swings with it
        m.t += dt;
        const ax = Math.sin(m.t * 1.7) * 0.22 + Math.sin(m.t * 0.63) * 0.08, az = Math.sin(m.t * 1.3 + 1) * 0.12;
        m.g.rotation.set(ax, m.g.rotation.y, az, 'YXZ');
        _v.set(0, -m.len, 0).applyEuler(m.g.rotation).add(m.g.position);
        B.swingLight.x = _v.x; B.swingLight.y = _v.y; B.swingLight.z = _v.z;
        const s = Math.sign(Math.cos(m.t * 1.7));
        if (s !== m.s && close && Math.random() < 0.35) this.audio?.play('creak', { vol: 0.12 });
        m.s = s;
        if (close && Math.random() < dt * 2) fx?.mote(_v.x + (Math.random() - 0.5) * 0.8, _v.y - Math.random() * 0.8, _v.z + (Math.random() - 0.5) * 0.8);
      } else if (m.kind === 'fire') {
        m.t += dt;
        m.flames.forEach((fl, i) => { const k = 0.8 + Math.sin(m.t * (9 + i * 3) + i) * 0.15 + Math.random() * 0.1; fl.scale.set(1, k, 1); });
      } else if (m.kind === 'door') {
        const d = m.d;
        d.k += (d.to - d.k) * Math.min(1, dt * 2.5);
        d.pivot.rotation.y = d.theta + d.sgn * d.k * 1.75;
        d.pivot.visible = d.to > 0 || d.k > 0.01;
        d.hinges.visible = d.to === 0;
      }
    }
    if (close) {
      for (const e of B.emit) {
        e.t -= dt;
        if (e.t > 0) continue;
        if (e.fire) { e.t = 0.12 + Math.random() * 0.2; fx?.ember(e.x, e.y, e.z); if (Math.random() < 0.3) fx?.steam(e.x, e.y + 0.3, e.z, 0.6, [0.42, 0.4, 0.38]); }
        else if (e.glow) { e.t = 0.7 + Math.random(); fx?.firefly(e.x + (Math.random() - 0.5) * 0.8, e.y, e.z + (Math.random() - 0.5) * 1.2, [0.35, 0.65, 1]); }
      }
      if (b.kind === 'herbalist' && Math.random() < dt * 3) {
        const c = B.moving.find((m) => m.kind === 'cauldron');
        if (c) { const p = c.g.position; fx?.steam(p.x, p.y + 0.5, p.z, 0.8, [0.6, 0.9, 0.55]); if (Math.random() < 0.35) { fx?.firefly(p.x, p.y + 0.48, p.z, [0.5, 1, 0.4]); if (b.dist < 5) this.audio?.play('bubble', { vol: 0.25 }); } }
      }
      if (b.kind === 'raccoon' && B.door && B.door.to === 0 && Math.random() < dt * 0.8) {
        // a draught from behind the crates: dust curling out of the cracks
        const S = b.L.secret, w = roomToWorld(b.f, S.door.u, S.door.v);
        fx?.mote(w.x + (Math.random() - 0.5) * 0.6, b.f.y + 0.2 + Math.random() * 1.1, w.z + (Math.random() - 0.5) * 0.6, [0.85, 0.8, 0.7]);
      }
    }
    // ambient loops follow the distance
    for (const s of B.sounds) {
      if (!s.at) continue;
      const d = Math.hypot(s.at.x - eye.x, s.at.y - eye.y, s.at.z - eye.z);
      const vol = Math.max(0, 1 - d / 7) * s.vol;
      if (vol > 0.005 && !s.h) s.h = this.audio?.loop?.(s.name, { vol });
      if (s.h) s.h.set?.({ vol });
    }
  }

  /** three.js lights for the toon-shaded keepers (the rock lights itself). Others in the scene
   * (Nugget's lamp, Old Star's) light them too, so ours only make up the difference. */
  lightKeepers(b, eye) {
    if (!b || b.dist > 14) { this.amb.intensity = 0; this.key.intensity = 0; this.fill.intensity = 0; return; }
    if ((this.otherT = (this.otherT || 0) - 1) <= 0) {
      this.otherT = 30;
      let amb = 0, pts = 0;
      this.scene3.traverse((o) => { if (o === this.amb || o === this.key || o === this.fill || !o.isLight || !o.visible) return; if (o.isAmbientLight || o.isHemisphereLight) amb += o.intensity; else if (o.isPointLight && o.intensity > 0) pts++; });
      this.otherAmb = amb; this.otherPts = pts;
    }
    const k = Math.max(0, Math.min(1, (14 - b.dist) / 4));
    const L = b.built.lights.find((l) => l.key) || b.built.lights[0];
    if (L) { this.key.position.set(L.x, L.y, L.z); this.key.color.setRGB(1, 0.8, 0.6); }
    this.key.intensity = 1.6 * k;
    this.amb.intensity = Math.max(0, 0.42 - this.otherAmb * 0.8) * k;
    this.fill.position.copy(eye);
    this.fill.intensity = (this.otherPts ? 0.4 : 1.3) * k;
  }

  /** Point lights for the rock (DigScene picks the nearest 8 of everyone's). */
  lights(eye) {
    const all = [];
    for (const b of this.burrows) {
      if (!b.built?.done || b.dist > 26) continue;
      for (const l of b.built.lights) all.push([Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z) - l.r * 0.3, l]);
    }
    all.sort((a, c) => a[0] - c[0]);
    const out = [];
    for (let i = 0; i < Math.min(4, all.length); i++) {
      const l = all[i][1], o = this.outLights[i];
      o.x = l.x; o.y = l.y; o.z = l.z; o.c = l.c; o.r = l.r; o.lantern = l.lantern !== false;
      out.push(o);
    }
    return out;
  }

  // ------------------------------------------------------------------ using things
  /** What the crosshair is on: a keeper, Rocco's secret door, his stash. */
  pickAt(eye, dir, reach) {
    let best = null;
    for (const b of this.burrows) {
      const B = b.built;
      if (!B?.done || b.dist > 8) continue;
      if (B.folk) {
        // you talk over the counter: reach past it when you're in the room
        const t = B.folk.hit(eye, dir, b.inside ? Math.max(reach, 2.4) : reach);
        if (t !== null && (!best || t < best.t)) best = { t, b, what: 'folk' };
      }
      if (B.stash && !traderData(this.state).stash) {
        const t = raySphere(eye, dir, B.stash.at, 0.32);
        if (t !== null && t < reach + 0.3 && (!best || t < best.t)) best = { t, b, what: 'stash' };
      }
      if (B.door && B.door.to === 0) {
        const t = this.doorHit(b, eye, dir, reach + 0.1);
        if (t !== null && (!best || t < best.t)) best = { t, b, what: 'door' };
      }
    }
    return best;
  }
  doorHit(b, eye, dir, reach) {
    const hit = this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, reach);
    if (!hit || (hit.m !== M.CRATEWOOD && hit.m !== M.STAINED)) return null;
    return this.inPlug(b, (hit.vx + 0.5) / VOX, (hit.vy + 0.5) / VOX, (hit.vz + 0.5) / VOX) ? hit.dist : null;
  }
  inPlug(b, x, y, z) {
    const S = b.L.secret, f = b.f;
    if (!S) return false;
    const r = worldToRoom(f, x, z), ym = y - f.y;
    const along = r.u * S.du + r.v * S.dv, side = r.u * -S.dv + r.v * S.du;
    return along > S.r0 - 0.02 && along < S.r1 + 0.02 && Math.abs(side) < S.w + 0.02 && ym >= -0.01 && ym < S.h;
  }

  target(eye, dir, reach) {
    const p = this.pickAt(eye, dir, reach);
    if (!p) return null;
    if (p.what === 'folk') { const sh = SHOPS[p.b.shopId]; return { label: `${p.b.shopId === 'rocco' ? 'Psst... ' : ''}Talk to ${sh.keeper.name}`, kind: 'use' }; }
    if (p.what === 'stash') return { label: 'Rummage in the chest', kind: 'use' };
    if (p.what === 'door') return { label: traderData(this.state).doorHint ? 'Push the crates (hinges?)' : 'A draughty stack of crates', kind: 'use' };
    return null;
  }

  use(eye, dir, reach) {
    const p = this.pickAt(eye, dir, reach);
    if (!p) return null;
    if (p.what === 'folk') { this.openShop(p.b); return []; }
    if (p.what === 'stash') { this.lootStash(p.b); return []; }
    if (p.what === 'door') { this.openSecret(p.b); return []; }
    return null;
  }

  openShop(b, tab) {
    if (this.panel && !this.panel.closed) return this.panel;
    const B = this.ensureBuilt(b, true);
    this.audio?.play('ui_open');
    const game = this.owner?.game || globalThis.__game;
    this.panel = openBurrowShop(game, b.shopId, { folk: B?.folk, ctx: this.c, tab, onClose: () => { this.panel = null; } });
    return this.panel;
  }

  /** Rocco's secret door: first a push (it rattles: hinges!), then it swings open for good. */
  openSecret(b, force = false) {
    if (!b?.L.secret) return false;
    const B = this.ensureBuilt(b, true), T = traderData(this.state);
    if (!T.doorHint && !force) {
      T.doorHint = true;
      this.audio?.play('creak', { vol: 0.5 });
      B.folk?.say('Those crates? Nothing behind those crates. Nothing at ALL.', { expr: 'worried' });
      const w = roomToWorld(b.f, b.L.secret.door.u, b.L.secret.door.v);
      this.fx?.dust(w.x, b.f.y + 0.7, w.z, 10, [0.6, 0.52, 0.42], 0.3);
      return true;
    }
    if (T.secret && B.door?.to === 1) return true;
    T.secret = true;
    // the crate-stack plug goes (saved as world edits), the slab swings open on its hinges
    const S = b.L.secret, f = b.f;
    const c = roomToWorld(f, S.door.u, S.door.v), R = S.w + 0.5;
    const w = this.world;
    for (let vz = Math.floor((c.z - R) * VOX); vz <= Math.ceil((c.z + R) * VOX); vz++)
      for (let vx = Math.floor((c.x - R) * VOX); vx <= Math.ceil((c.x + R) * VOX); vx++)
        for (let vy = Math.floor(f.y * VOX) - 1; vy <= Math.ceil((f.y + S.h) * VOX); vy++) {
          const m = w.voxelAt(vx, vy, vz);
          if ((m === M.CRATEWOOD || m === M.STAINED) && this.inPlug(b, (vx + 0.5) / VOX, (vy + 0.5) / VOX, (vz + 0.5) / VOX)) w.setVoxel(vx, vy, vz, 0);
        }
    if (B.door) { B.door.to = 1; B.door.pivot.visible = true; }
    this.audio?.play('creak', { vol: 0.8 });
    setTimeout(() => this.audio?.play('door'), 300);
    this.fx?.dust(c.x, f.y + 0.6, c.z, 26, [0.6, 0.52, 0.42], 0.5);
    B.folk?.say(pick(['Hey! That\'s my... ventilation.', 'That\'s, uh, the emergency exit. Unfinished. Like most emergencies.', 'Okay. Okay. You found it. Don\'t tell the herbalist.']), { expr: 'surprised', emote: 'hop' });
    this.state.emit('act', { type: 'puzzle', id: 'rocco_door' });
    this.ui?.toast?.('A secret door behind Rocco\'s crates!', { kind: 'good' });
    return true;
  }

  /** Rocco's stash: once. He notices. */
  lootStash(b) {
    const T = traderData(this.state);
    if (!b || T.stash) return false;
    const B = this.ensureBuilt(b, true);
    T.stash = true;
    const st = this.state, z = Math.max(1, st.data.zoneMax || 1);
    const gold = 180 + z * 140;
    st.addGold(gold, 'stash');
    const gem = ['amber', 'amethyst', 'ruby', 'emerald'][Math.min(3, z - 1)];
    const gotGem = !!ITEMS[gem] && st.addItem(gem, { q: 92, spill: true }) != null; // no room: it goes home to the stash
    this.audio?.play('coins', { n: 8 });
    this.audio?.play('pickup_gem');
    this.ui?.toast?.(`Rocco's stash: <b>${gold}</b> gold${gotGem ? ` and a <b>${ITEMS[gem].name}</b>` : ''}.`, { kind: 'good', icon: gotGem ? iconURL(gem) : undefined });
    if (B?.stash) { B.stash.g.remove(B.stash.m); B.stash.m.geometry.dispose(); B.stash.m = modelMesh(getModel('stashchest', 1), this.mat); B.stash.g.add(B.stash.m); this.fx?.glints?.(B.stash.at.x, B.stash.at.y, B.stash.at.z); }
    setTimeout(() => B?.folk?.say('Was that... my stash? ...What stash. There is no stash. Rocco has never had a stash.', { expr: 'angry', emote: 'shake' }), 600);
    return true;
  }

  /** Teleport the mole into a burrow (tests). */
  go(id, where = 'counter') {
    const b = this.find(id), own = this.owner;
    if (!b || !own?.debug?.teleport) return false;
    const f = b.f, L = b.L;
    let u = 0, v = f.rz - 0.55, rot = Math.PI; // just inside the door, looking in
    if (where === 'counter') { u = L.spots.counter?.u ?? 0; v = (L.spots.counter?.v ?? -0.6) + 0.95; rot = Math.PI; }
    if (where === 'out') { u = 0; v = f.rz + 2.4; rot = Math.PI; }
    if (where === 'secret' && L.secret) { const S = L.secret; u = S.door.u - S.du * 1.4; v = S.door.v - S.dv * 1.4; rot = Math.atan2(S.du, -S.dv) - Math.PI; }
    const w = roomToWorld(f, u, v);
    // the camera yaw: forward = (-sin h, -cos h); look along room rot (0 = toward the door)
    const yaw = roomYaw(f, rot) + Math.PI;
    own.debug.teleport(w.x, f.y + 0.02, w.z, yaw, -0.08);
    b.dist = 0;
    if (this.ready(b)) this.ensureBuilt(b, true);
    return { x: w.x, y: f.y, z: w.z };
  }

  onVoxel() {}

  dispose() {
    for (const b of this.burrows) this.drop(b);
    this.scene3.remove(this.amb, this.key, this.fill);
    this.mat.dispose();
    if (this.panel && !this.panel.closed) this.panel.close?.();
  }
}

function raySphere(o, d, c, r) {
  const ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z;
  const t = ox * d.x + oy * d.y + oz * d.z;
  if (t < 0) return null;
  const qx = o.x + d.x * t - c.x, qy = o.y + d.y * t - c.y, qz = o.z + d.z * t - c.z;
  return qx * qx + qy * qy + qz * qz < r * r ? t : null;
}
const pick = (a) => a[Math.floor(Math.random() * a.length)];
