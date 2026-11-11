// Raptor taming (made by Enemies, run from its update): a lone raptor in the dino caverns you can
// win over (stray.js), and once it's yours, your companion in the mine (pal.js). Save data lives in
// state.data.tame:
//
//   { raptors: [{ id, name, trust, bornAt (ms), bornDay, how: 'wild', variant, size, bites, finds }],
//     active: id (the one that comes down the mine with you; the rest wait at home),
//     stray: { trust, meals, met (day), variant, encounters } | null (the wild one you're working on) }
//
// The loop: in the dino caverns, after a while, a lone young raptor (claw marks down its flank, a
// limp) turns up out of sight. Crouch (C) and keep still and it settles; come at it, run, swing
// your pick near it and it backs off hissing. Look at it and press E to toss it food it likes (meat
// best: food.js) — it comes for it when it dares, sniffs, eats, wags. Two meals and it's had enough
// for now and wanders off; it comes back later (or next trip) remembering you. At full trust it
// bonds: the naming moment (naming.js), then it follows you (E on it: stay / come).
//
// Hooks (Enemies.js): update(dt, busy) · target(eye, dir, reach) · use(eye, dir, reach) · dispose().
// Debug: window.__game.debug.tame (debug.js).
import * as THREE from 'three';
import { ITEMS } from '../../data/items.js';
import { boxHits, solidAt } from '../enemies/physics.js';
import { VS } from '../enemies/vox.js';
import { randInt } from '../../core/util.js';
import { Stray } from './stray.js';
import { Pal } from './pal.js';
import { Tossed, bestFood } from './food.js';
import { nameRaptor, welcome } from './naming.js';
import { defineTameSounds } from './sfx.js';
import { installTameDebug } from './debug.js';

export const MAX_RAPTORS = 3;

/** state.data.tame, made if an old save has none. */
export function tameData(state) {
  const d = state?.data;
  if (!d) return { raptors: [] };
  if (!d.tame || typeof d.tame !== 'object') d.tame = { raptors: [] };
  if (!Array.isArray(d.tame.raptors)) d.tame.raptors = [];
  return d.tame;
}
/** The raptor that comes down the mine with you (its record), or null. */
export function activeRaptor(state) {
  const T = tameData(state);
  return T.raptors.find((r) => r.id === T.active) || T.raptors[0] || null;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _h = new THREE.Vector3();
const G = 9.8; // the food's fall (food.js)

export class Tame {
  constructor(mgr) {
    this.mgr = mgr;
    this.state = mgr.state;
    this.game = mgr.owner?.game || (typeof window !== 'undefined' ? window.__game : null);
    this.stray = null;
    this.pal = null;
    this.away = []; // a pal heading home (a new one took its place)
    this.foods = [];
    this.crumbs = [];
    this.strayT = 0;
    this.dinoT = 0; this.dino = false;
    this.bolted = false;
    this.naming = null;
    this.palWant = !!activeRaptor(this.state);
    this.palT = 0;
    this.log = [];
    defineTameSounds(mgr.audio);
    installTameDebug(this);
  }

  get data() { return tameData(this.state); }
  note(s) { this.log.push(`${this.mgr.time.toFixed(1)} ${s}`); if (this.log.length > 30) this.log.shift(); }

  // ------------------------------------------------------------------ frame
  update(dt, busy = false) {
    const m = this.mgr;
    dt = Math.min(dt, 1 / 20);
    const N = this.naming;
    if (busy) {
      // a talk is up (the naming moment): the raptor keeps living, nothing else moves
      if (N && this.stray?.alive && N.s === this.stray) this.stray.update(dt);
      if (N?.final && this.pal?.alive) this.pal.update(dt);
      return;
    }
    // a breath of happy hopping, then the talk
    if (N && !N.started && (N.t += dt) > 1.3) this.startNaming();
    this.trailTick();
    if (this.stray && (!this.stray.alive || !m.list.includes(this.stray))) this.dropStray();
    this.strayTick(dt);
    // the companion
    if (!this.pal && this.palWant && (this.palT -= dt) <= 0) { this.palT = 0.5; this.spawnPal(); }
    if (this.pal) {
      const far = this.pal.staying && this.pal.pos.distanceTo(m.pl.pos) > 40;
      if (!far) this.pal.update(dt);
      this.pal.root.visible = !far;
    }
    for (let i = this.away.length - 1; i >= 0; i--) {
      const a = this.away[i];
      a.update(dt);
      if (a.hd > 12 && !m.inView(a.center.x, a.center.y, a.center.z) || a.modeT > 20) { a.dispose(); this.away.splice(i, 1); }
    }
    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      if (!f.gone) f.update(dt);
      if (f.gone || f.t > 90 || f.dist() > 40) { f.dispose(); this.foods.splice(i, 1); }
    }
  }

  /** The spots you walked (where the companion can follow you round corners). */
  trailTick() {
    const pl = this.mgr.pl;
    if (!pl?.grounded || pl.climbing) return;
    const c = this.crumbs, last = c[c.length - 1], p = pl.pos;
    if (last && Math.hypot(last.x - p.x, last.y - p.y, last.z - p.z) < 0.45) return;
    if (last && Math.hypot(last.x - p.x, last.y - p.y, last.z - p.z) > 6) c.length = 0; // a teleport (a lift): start again
    c.push({ x: p.x, y: p.y, z: p.z, t: this.mgr.time });
    if (c.length > 90) c.shift();
  }

  /** Where a companion that can't see you should head: the newest bit of your trail it can see. */
  trail(e) {
    const c = this.crumbs, w = this.mgr.world;
    const ey = e.pos.y + 0.5 * e.size;
    for (let i = c.length - 1, k = 0; i >= 0 && k < 24; i -= 2, k++) {
      const p = c[i];
      if (Math.hypot(p.x - e.pos.x, p.z - e.pos.z) > 14) continue;
      if (!w.raycast(e.pos.x, ey, e.pos.z, p.x - e.pos.x, p.y + 0.4 - ey, p.z - e.pos.z, 1)) return p;
    }
    return null;
  }

  /** Bring the companion up behind you, out of sight if it can be (left behind, stuck, in lava). */
  catchUp(e, force = false) {
    const m = this.mgr, P = m.pl.pos, c = this.crumbs;
    if (!force && (e.catchT || -99) > m.time - 2) return false;
    e.catchT = m.time;
    let best = null;
    for (let i = c.length - 1; i >= 0; i--) {
      const p = c[i], d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d < 1.8 || d > 6 || Math.abs(p.y - P.y) > 1.5) continue;
      if (!this.fitsAt(e, p.x, p.y, p.z)) continue;
      const seen = m.inView(p.x, p.y + 0.4, p.z);
      if (!seen) { best = p; break; }
      if (!best && (force || e.hd > 22)) best = p;
    }
    if (!best && (force || e.hd > 26)) {
      // no trail behind you: right beside you, then
      for (let k = 0; k < 8 && !best; k++) {
        const a = k * Math.PI / 4, x = P.x + Math.cos(a) * 1.2, z = P.z + Math.sin(a) * 1.2;
        const f = m.floorAt(x, P.y + 0.6, z, 0.8, 1.5, 0.8);
        if (f && this.fitsAt(e, f.x, f.y, f.z)) best = f;
      }
    }
    if (!best) return false;
    e.pos.set(best.x, best.y + 0.01, best.z);
    e.vel.set(0, 0, 0);
    e.yaw = Math.atan2(P.x - best.x, P.z - best.z);
    e.legs?.reset?.();
    e.stuck2 = 0; e.stuckT = 0;
    if (e.stats) e.stats.catchups++;
    this.note('catch-up');
    return true;
  }
  fitsAt(e, x, y, z) {
    const hw = e.hw * e.size;
    return !boxHits(this.mgr.world, x - hw, y + 0.28, z - hw, x + hw, y + e.h * e.size, z + hw, 2);
  }

  // ------------------------------------------------------------------ the stray
  strayTick(dt) {
    const m = this.mgr, T = this.data, P = m.pl.pos;
    if ((this.dinoT -= dt) <= 0) { this.dinoT = 1; this.dino = !!m.spawner?.isDino?.(P.x, P.y, P.z); }
    if (!m.autoSpawn || this.stray || this.bolted || this.naming || m.safe || !this.dino) return;
    if (T.raptors.length >= MAX_RAPTORS) return;
    this.strayT += dt;
    const wait = T.stray?.met ? 70 : 25;
    if (this.strayT < wait || m.threat?.()) return;
    this.strayT = wait - 4; // no room yet: look again in a moment
    const spot = m.findSpot('raptor', P.x, P.y, P.z, 9, 16, { tries: 14, ray: true });
    if (spot) this.spawnStray(spot.x, spot.y, spot.z);
  }

  /** The lone raptor at a point (the one you're working on: its record comes along). */
  spawnStray(x, y, z, o = {}) {
    const m = this.mgr, T = this.data;
    if (this.stray) this.dropStray(true);
    const rec = T.stray ||= { trust: 0, meals: 0, met: this.state.data.day || 1, variant: randInt(0, 2), encounters: 0 };
    rec.encounters = (rec.encounters || 0) + 1;
    const f = m.floorAt(x, y + 0.5, z, 0.8, 3, 1) || { x, y, z };
    const e = new Stray(m, { x: f.x, y: f.y + 0.01, z: f.z, zone: m.zone, variant: rec.variant, rec, tame: this, yaw: o.yaw ?? Math.atan2(m.pl.pos.x - f.x, m.pl.pos.z - f.z) });
    e.key = 'raptor';
    m.add(e);
    this.stray = e;
    this.strayT = 0;
    m.queueEv({ act: { type: 'tame', what: 'meet', n: rec.encounters } });
    this.note(`stray at ${f.x.toFixed(1)},${f.y.toFixed(1)},${f.z.toFixed(1)} trust ${rec.trust}`);
    return e;
  }
  /** It's gone (wandered off, bolted, swept away, or became your companion). */
  dropStray(dispose = false) {
    const s = this.stray, m = this.mgr;
    if (!s) return;
    this.stray = null;
    this.strayT = 0;
    const i = m.list.indexOf(s);
    if (i >= 0) m.list.splice(i, 1);
    if (dispose || i >= 0) { s.alive = false; s.dispose(); }
  }
  /** Called while it walks off (stray.js): gone once it's well out of sight. */
  gone(s, why) {
    const m = this.mgr;
    if (s.hd < 13 || (m.inView(s.center.x, s.center.y, s.center.z) && s.hd < 22)) return;
    if (why === 'bolt') this.bolted = true;
    this.note(`stray gone (${why})`);
    this.dropStray(true);
  }

  /** The best food in the backpack for a raptor (item id) or null. */
  foodFor() { return bestFood(this.state); }

  /** It's ready: the naming moment, then it's yours. */
  bonding(s) {
    if (this.naming) return;
    this.naming = { s, t: 0, started: false };
    this.note('bond');
  }
  startNaming() {
    const N = this.naming, s = N.s;
    N.started = true;
    if (this.stray !== s || !s.alive) { this.naming = null; return; }
    const taken = this.data.raptors.map((r) => r.name);
    nameRaptor(this.game, s, taken)
      .catch((err) => { console.warn('[tame]', err); return 'Nib'; })
      .then((name) => {
        if (this.disposed || this.stray !== s) { this.naming = null; return; }
        const rec = this.adopt(s, name);
        // the last line, by its new name, framed on the companion it is now
        if (this.pal) { N.final = true; this.naming = N; welcome(this.game, this.pal, rec.name).then(() => { if (this.naming === N) this.naming = null; }); }
      });
  }

  /** The stray becomes your raptor: a record, and the same animal, now with a collar, at your side. */
  adopt(s, name) {
    const m = this.mgr, T = this.data, st = this.state;
    const rec = {
      id: 'rx' + Date.now().toString(36) + randInt(10, 99), name: String(name || 'Nib').slice(0, 16), trust: 100,
      bornAt: Date.now(), bornDay: st.data.day || 1, how: 'wild', variant: s.variant, size: 0.88, zone: m.zone, bites: 0, finds: 0,
    };
    T.raptors.push(rec);
    T.stray = null;
    const at = { x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: s.yaw };
    this.dropStray(true);
    // the one that was with you heads home
    if (this.pal) { this.pal.setMode('follow'); this.pal.staying = false; this.away.push(this.pal); this.pal.T = null; this.pal.goHome = true; this.pal = null; }
    T.active = rec.id;
    this.palWant = true;
    this.spawnPal(at);
    this.naming = null;
    m.queueEv({ act: { type: 'tame', what: 'bond', name: rec.name } });
    this.pal?.glow(14);
    try { st.learn?.('raptor_friend'); } catch (e) { /* the index card is a bonus */ }
    try { st.save?.(); } catch (e) { /* autosave will */ }
    this.note(`adopted ${rec.name}`);
    return rec;
  }

  // ------------------------------------------------------------------ the companion
  /** Your raptor at your side (or at `at`): behind you on a floor with room for it. */
  spawnPal(at = null) {
    const m = this.mgr, rec = activeRaptor(this.state);
    if (!rec) { this.palWant = false; return null; }
    if (this.pal) return this.pal;
    const pl = m.pl, P = pl.pos;
    let spot = at;
    if (!spot) {
      if (!m.loaded(P.x, P.y + 0.3, P.z)) return null;
      const bx = Math.sin(pl.yaw), bz = Math.cos(pl.yaw); // behind you
      for (let k = 0; k < 12 && !spot; k++) {
        const a = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5, r = 1.1 + (k % 3) * 0.3;
        const x = P.x + (bx * Math.cos(a) - bz * Math.sin(a)) * r, z = P.z + (bz * Math.cos(a) + bx * Math.sin(a)) * r;
        const f = m.floorAt(x, P.y + 0.6, z, 0.8, 1.4, 0.8);
        if (f && Math.abs(f.y - P.y) < 0.8 && this.fitsAt({ hw: 0.24, h: 0.85, size: rec.size || 0.88 }, f.x, f.y, f.z)) spot = f;
      }
      if (!spot) { if ((this.palTries = (this.palTries || 0) + 1) < 12) return null; spot = { x: P.x, y: P.y, z: P.z }; }
    }
    const e = new Pal(m, { x: spot.x, y: spot.y + 0.01, z: spot.z, zone: m.zone, variant: rec.variant ?? 0, size: rec.size || 0.88, rec, tame: this, yaw: spot.yaw ?? Math.atan2(P.x - spot.x, P.z - spot.z) });
    e.key = 'raptor_pal';
    m.root.add(e.root);
    e.updateSpheres();
    e.place();
    e.sense(0);
    this.pal = e;
    this.note(`pal ${rec.name} at ${spot.x.toFixed(1)},${spot.y.toFixed(1)},${spot.z.toFixed(1)}`);
    return e;
  }

  // ------------------------------------------------------------------ the crosshair and E
  /** The middle of a raptor's head (world): you can aim at that when rock hides its body. */
  head(e, out = _h) {
    if (!e.headObj) return out.set(e.center.x, e.center.y + e.hitR * e.size * 0.85, e.center.z);
    e.headObj.updateWorldMatrix(true, false);
    return e.headObj.localToWorld(out.set(0, 3 * VS, 2 * VS));
  }

  /**
   * The tame raptor (stray or companion) under the crosshair: { e, kind, t } or null. Its body or
   * its head (a crystal by your nose, a ledge it stands behind: you aim at the part you can see).
   */
  under(eye, dir, reach) {
    const w = this.mgr.world;
    let best = null;
    for (const [e, kind, max] of [[this.pal, 'pal', 3.2], [this.stray, 'stray', 3.8]]) {
      if (!e?.alive || !e.root.visible) continue;
      for (const [c, r] of [[e.center, e.hitR * e.size + 0.14], [this.head(e), 0.15 * e.size + 0.1]]) {
        const ox = c.x - eye.x, oy = c.y - eye.y, oz = c.z - eye.z;
        const t = ox * dir.x + oy * dir.y + oz * dir.z;
        if (t < 0 || t > max) continue;
        if (ox * ox + oy * oy + oz * oz - t * t > r * r) continue;
        const t0 = Math.max(0, t - r * 0.6);
        if (t0 > reach && (reach < 2.25 || w.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, t0))) continue; // rock in between
        if (!best || t < best.t) best = { e, kind, t };
      }
    }
    return best;
  }

  target(eye, dir, reach) {
    const h = this.under(eye, dir, reach);
    if (!h) return null;
    if (h.kind === 'pal') return { label: h.e.staying ? `Call ${h.e.name}` : `Tell ${h.e.name} to stay`, kind: 'use' };
    const s = h.e;
    if (['bolt', 'leave', 'bond', 'eat', 'sniffFood', 'full'].includes(s.plan) || this.naming) return null;
    const f = s.full() ? null : this.foodFor();
    if (!f && s.full()) return null;
    return { label: f ? `Offer ${ITEMS[f]?.name || 'food'}` : 'Hold out a paw', kind: 'use' };
  }

  /** E: the companion stays / comes; the stray gets a bit of food tossed to it (or sniffs your paw). */
  use(eye, dir, reach) {
    const h = this.under(eye, dir, reach);
    if (!h) return null;
    if (h.kind === 'pal') {
      const on = h.e.toggleStay();
      return [{ act: { type: 'tame', what: on ? 'stay' : 'follow', name: h.e.name } }];
    }
    const s = h.e;
    if (['bolt', 'leave', 'bond', 'eat', 'sniffFood', 'full'].includes(s.plan) || this.naming || s.full()) return null;
    const id = this.foodFor();
    if (!id) { s.paw(); return [{ act: { type: 'tame', what: 'reach' } }]; }
    return this.toss(s, id, eye, dir);
  }

  /**
   * Toss a bit of food in front of it (nearer to it while it's shy, nearer to you once it trusts
   * you), on a lob that clears the rock: if the rock between you won't let it land there, nearer
   * its feet, a flatter or a higher lob (you can see it, so the food can reach it).
   */
  toss(s, id, eye, dir) {
    const m = this.mgr, st = this.state, w = m.world;
    const removed = st.removeItem?.(id, 1, { lowFirst: true });
    if (!removed || (Array.isArray(removed) && !removed.length)) return null;
    const P = m.pl.pos;
    const dx = P.x - s.pos.x, dz = P.z - s.pos.z, d = Math.hypot(dx, dz) || 1;
    const tk = Math.min(1, (s.trust || 0) / 100);
    // out of the paw, a little in front of your nose (not into a crystal right there)
    const k = Math.max(0, Math.min(0.35, (w.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 0.5)?.dist ?? 0.5) - 0.12));
    const from = _a.set(eye.x + dir.x * k, eye.y - 0.12 + dir.y * k * 0.57, eye.z + dir.z * k);
    if (solidAt(w, from.x, from.y, from.z)) from.y += 0.12;
    const ld0 = Math.max(0.45, Math.min(d - 0.55, 0.7 + (d * 0.55 - 0.7) * tk));
    let to = null, T = 0.55;
    for (const ld of ld0 > 0.5 ? [ld0, 0.45, 0.22] : [ld0, 0.22]) {
      const lx = s.pos.x + dx / d * ld, lz = s.pos.z + dz / d * ld;
      const f = m.floorAt(lx, s.pos.y + 0.6, lz, 0.2, 1.6, 1) || { x: lx, y: s.pos.y, z: lz };
      const p = _b.set(f.x, f.y + 0.02, f.z);
      to ||= p.clone();
      const lob = [0.55, 0.38, 0.75, 0.26].find((t) => this.lobClear(from, p, t));
      if (lob) { to = p.clone(); T = lob; break; }
    }
    const food = new Tossed(m, id, from, to, T);
    this.foods.push(food);
    s.offered(food);
    m.sound('whoosh', { vol: 0.25, pitch: 1.6 });
    try { m.owner?.updateHotbar?.(); } catch (e) { /* the belt catches up */ }
    this.note(`toss ${id} (trust ${Math.round(s.trust)}, fear ${s.fear.toFixed(2)})`);
    return [{ act: { type: 'tame', what: 'offer', item: id } }];
  }

  /** Does a lob from `a` that lands at `b` in T s miss the rock on the way? */
  lobClear(a, b, T) {
    const w = this.mgr.world, vy = (b.y - a.y) / T + 0.5 * G * T;
    for (let i = 1; i < 14; i++) {
      const t = T * i / 14;
      if (solidAt(w, a.x + (b.x - a.x) * i / 14, a.y + vy * t - 0.5 * G * t * t, a.z + (b.z - a.z) * i / 14)) return false;
    }
    return true;
  }

  dispose() {
    this.disposed = true;
    this.dropStray(true);
    this.pal?.dispose();
    this.pal = null;
    for (const a of this.away) a.dispose();
    this.away.length = 0;
    for (const f of this.foods) f.dispose();
    this.foods.length = 0;
  }
}

