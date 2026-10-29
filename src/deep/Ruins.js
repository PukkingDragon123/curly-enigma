// Dungeons and lift stations in the mine (an optional module, like Props). The dungeons (rare rooms
// hidden in the rock, Minecraft-like: a monster room, a flooded crypt, a collapsed Starfolk vault,
// a deep fortress — plan.ruins (with a sealed strongroom) and plan.rooms (plain monster rooms),
// stamped by gen/ruins.js from ./ruins/dungeon.js) come to life near
// the mole: their spawners, loot chests, cobwebs, dart traps, a lost miner's remains, the vault's
// guardians, and behind each sealed door the puzzle (levers, a hidden switch, symbol drums, light
// beams and mirrors, pressure plates, a drain valve — ./ruins/puzzles.js), the progress runes, the
// seal opening, braziers, the strongroom's chest (gold, gems and a relic for the Index) and the
// hoard you can dig for gold (./ruins/site.js). It also fits out the lift stations (the lever, the
// name sign, torches: ./ruins/liftKit.js). There are no dug trails any more (no human works in
// the caves); gen/trails.js only keeps two constants for old imports.
//
// API (DigScene): new Ruins(ctx) · update(dt, { player, eye, time }) → events · target(eye, dir,
// reach) → { label, kind: 'use' } | null · use(eye, dir, reach) → events | null · lights(eye) →
// ≤ 3 lights · radarMarkers(pos, survey) → markers · dispose(). Events: { say, key, tone, cd },
// { loot: { id, q, p } }, { damage, kind, push } (darts), { act: { type: 'puzzle' | 'relic' |
// 'spawner' | 'look', ... } }.
// Save: state.data.deep.ruins[id] = { seen, open, solved, chest, loot, spawners, remains, seq,
// dials, mirrors, drained, ... }. Test hooks: ruins.debug (list, dungeons, find, go, solve, reset,
// press, spawner, loot, lift, puzzle).
import * as THREE from 'three';
import { makeObjectMaterial } from './TerrainMaterial.js';
import { VOX, M } from './materials.js';
import { Site, NAMES } from './ruins/site.js';
import { LiftKit } from './ruins/liftKit.js';
import { LORE_KIND } from './ruins/dungeon.js';
import { sfx } from './ruins/sfx.js';
import { toWorld } from './ruins/common.js';
import { RM } from './ruins/mats.js';

/** Carved stone you can read with a paw (quests part: lore, src/core/lore.js). */
const CARVED = new Set([RM.FRIEZE, RM.RUNEOFF, RM.RUNE, RM.RUNE_R, RM.GILT]);

export class Ruins {
  constructor(ctx) {
    this.ctx = ctx;
    this.w = ctx.world;
    this.plan = ctx.plan || ctx.world.plan;
    this.U = ctx.U;
    this.fx = ctx.fx;
    this.audio = ctx.audio;
    this.st = ctx.state;
    this.ui = ctx.ui;
    this.player = ctx.player;
    this.owner = ctx.owner;
    this.scene3 = ctx.scene3 || ctx.scene;
    this.sfx = sfx(this.audio);
    this.root = new THREE.Group();
    this.root.name = 'ruins';
    this.scene3.add(this.root);
    this.mat = makeObjectMaterial(this.U, { texel: 128 });
    this.glowMat = makeObjectMaterial(this.U, { emissive: 1.6 });
    this.dimMat = makeObjectMaterial(this.U, { emissive: 0.25 });
    this.flameMat = makeObjectMaterial(this.U, { emissive: 2.2 });
    this.wardMat = makeObjectMaterial(this.U, { emissive: 0.35, texel: 128 });
    this.webMat = makeObjectMaterial(this.U, { emissive: 0.18 });
    this.webMat.side = THREE.DoubleSide;
    const deep = this.st?.data?.deep;
    this.save = deep ? (deep.ruins ||= {}) : {};
    this.queue = [];
    this.timers = [];
    this.time = 0;
    this.sites = [];
    (this.plan.ruins || []).concat(this.plan.rooms || []).forEach((r, i) => {
      const f = this.plan.features.find((q) => q.kind === 'ruin' && q.id === r.id);
      if (!f) return;
      try { this.sites.push(new Site(this, r, f, i)); } catch (e) { console.warn('dungeon site', r.id, e); }
    });
    this.lifts = new LiftKit(this);
    this.debug = this.makeDebug();
  }

  /** Run fn(out) after t seconds (its events go out with the next update). */
  later(t, fn) { this.timers.push({ t, fn }); }

  // ------------------------------------------------------------ frame
  update(dt, o = {}) {
    this.time += dt;
    const out = this.queue;
    this.queue = [];
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); try { tm.fn(out); } catch (e) { console.warn('dungeon timer', e); } }
    }
    const eye = o.eye || this.player?.eye?.() || this.player.pos;
    for (const s of this.sites) {
      try { s.update(dt, eye, out); } catch (e) { console.warn('dungeon', s.id, e); }
    }
    try { this.lifts.update(dt, eye); } catch (e) { console.warn('lift kit', e); }
    return out;
  }

  // ------------------------------------------------------------ picking
  pick(eye, dir, reach) {
    let best = null, bt = reach + 0.05;
    const test = (e) => {
      const ox = e.pos.x - eye.x, oy = e.pos.y - eye.y, oz = e.pos.z - eye.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > bt) return;
      const ex = ox - dir.x * t, ey = oy - dir.y * t, ez = oz - dir.z * t;
      if (ex * ex + ey * ey + ez * ez < e.r * e.r) { bt = t; best = e; }
    };
    for (const s of this.sites) if (s.built) for (const e of s.els) test(e);
    for (const e of this.lifts.elements()) test(e);
    if (best) return best;
    // the sealed door itself
    const hit = this.w.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, reach + 0.1);
    if (hit && (hit.m === M.WARD || hit.m === M.BEDROCK)) {
      for (const s of this.sites) {
        if (!s.built || s.save.open || !s.isDoorVoxel(hit.vx, hit.vy, hit.vz)) continue;
        return { label: 'Sealed door', use: () => [{ say: this.doorHint(s), key: 'door' + s.id, cd: 4 }] };
      }
    }
    // the carvings: run a paw along the raised runes and read what the Starfolk wrote (quests part)
    const lore = this.owner?.game?.lore;
    if (hit && lore && CARVED.has(hit.m)) {
      const s = this.siteAt(hit);
      if (s) return { label: 'Read the carvings', use: () => this.readCarving(s, hit, lore) };
    }
    return null;
  }
  /** The dungeon a voxel hit belongs to (the nearest built one, close enough). */
  siteAt(hit) {
    let best = null, bd = 30;
    const x = hit.vx / VOX, z = hit.vz / VOX, y = hit.vy / VOX;
    for (const s of this.sites) {
      if (!s.built) continue;
      const d = Math.hypot(s.center.x - x, (s.center.y - y) * 0.5, s.center.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  /** Read a dungeon's carving: two carved walls each, each with its own text (src/data/lore.js). */
  readCarving(s, hit, lore) {
    const wall = (Math.floor(hit.vx / (VOX * 3)) + Math.floor(hit.vz / (VOX * 3))) & 1;
    const e = lore.readCarving({ id: s.id, kind: LORE_KIND[s.kind] || s.kind, wall });
    this.sfx.grind?.(0.12, 0.08);
    s.save.read = (s.save.read || 0) + 1;
    lore.show(e, { kind: 'carving' });
    return [{ handled: true }];
  }
  doorHint(s) {
    const n = (s.save.knock = (s.save.knock || 0) + 1);
    this.sfx.grind(0.25, 0.2);
    const H = {
      levers: ['Sealed with old wards. Four levers in the walls, and signs over the door.', 'The signs over the door are the same as the ones by the levers. In that order?'],
      switch: ['Sealed with old wards. Over the door: a hammer, and an arrow.', 'A hammer and an arrow... is one of these walls not as solid as the rest?'],
      dials: ['Sealed with old wards. Three drums on the altar; the wall over them shows three signs.', 'Make the drums show the wall\'s signs. Each drum drags its neighbour round.'],
      beams: ['Sealed with old wards. A crystal in the wall burns like a little sun.', 'Turn the mirrors to carry its light to the socket before the door.'],
      plates: ['Sealed with old wards. Three plates in the floor, and weights over the door.', 'All three plates have to be down at once. A clump of ore is heavy. So is a block you build.'],
      valve: ['Sealed with old wards, down under the black water.', 'There was a wheel on the wall at the top of the stair. Water has to go somewhere.'],
    }[s.L.puzzle] || ['Sealed with old wards.'];
    return H[Math.min(H.length - 1, n > 2 ? 1 : 0)];
  }
  target(eye, dir, reach) {
    const e = this.pick(eye, dir, reach);
    return e ? { label: typeof e.label === 'function' ? e.label() : e.label, kind: 'use' } : null;
  }
  use(eye, dir, reach) {
    const e = this.pick(eye, dir, reach);
    if (!e) return null;
    const r = e.use();
    return r && r.length ? r : [{ handled: true }];
  }

  // ------------------------------------------------------------ lights, radar
  lights(eye) {
    const list = [];
    for (const s of this.sites) if (s.built) s.lights(eye, list);
    list.sort((a, b) => Math.hypot(a.x - eye.x, a.y - eye.y, a.z - eye.z) - a.r * 0.3 - (Math.hypot(b.x - eye.x, b.y - eye.y, b.z - eye.z) - b.r * 0.3));
    return list.slice(0, 3);
  }
  /** Radar / survey markers: dungeons found (by name) and an unknown signal from ones nearby. */
  radarMarkers(pos, survey = false) {
    const out = [];
    for (const s of this.sites) {
      const c = s.center, d = Math.hypot(c.x - pos.x, (c.y - pos.y) * 1.5, c.z - pos.z);
      if (s.save.seen) { if (survey || d < 60) out.push({ kind: 'ruin', x: c.x, y: c.y, z: c.z, label: s.name + (s.plain || s.save.open ? '' : ' (sealed)'), color: s.save.open || s.plain ? '#e8c060' : '#c8a0ff' }); }
      else if (d < (survey ? 40 : 22)) out.push({ kind: 'ruin', x: c.x, y: c.y, z: c.z, label: '? dungeon', color: '#8a7a9a' });
    }
    return out;
  }

  dispose() {
    for (const s of this.sites) s.drop();
    this.lifts.dispose();
    this.scene3.remove(this.root);
    for (const m of [this.mat, this.glowMat, this.dimMat, this.flameMat, this.wardMat, this.webMat]) m.dispose();
  }

  // ------------------------------------------------------------ test hooks
  makeDebug() {
    const R = this;
    const site = (id) => (typeof id === 'number' ? R.sites[id] : R.sites.find((s) => s.id === id)) || R.sites[0];
    const stand = (s, u, y, v, q) => {
      const L = s.L, p = toWorld(L, u, y, v), t = toWorld(L, q[0], q[1], q[2]);
      const dx = t.x - p.x, dy = t.y - (p.y + 0.72), dz = t.z - p.z;
      R.owner?.debug?.teleport?.(p.x, p.y + 0.05, p.z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      return { x: p.x, y: p.y, z: p.z };
    };
    return {
      /** [{ id, kind, name, puzzle, zone, plain, x, y, z, open, built, spawners, chests }] */
      list: () => R.sites.map((s) => ({ id: s.id, kind: s.kind, name: NAMES[s.kind], puzzle: s.L.puzzle, zone: s.zone, plain: s.plain, x: +s.center.x.toFixed(1), y: +s.center.y.toFixed(1), z: +s.center.z.toFixed(1), open: !!s.save.open, built: s.built, spawners: s.P.spawners.length, chests: s.P.chests.length + (s.P.door ? 1 : 0), relic: s.relic })),
      dungeons: () => R.debug.list(),
      /** The nearest dungeon (of a kind, if given) to the mole: its id. */
      find: (kind = null) => {
        const p = R.player?.pos || { x: 0, y: 0, z: 0 };
        let best = null, bd = Infinity;
        for (const s of R.sites) { if (kind && s.kind !== kind && !(kind === 'plain' && s.plain)) continue; const d = Math.hypot(s.center.x - p.x, s.center.y - p.y, s.center.z - p.z); if (d < bd) { bd = d; best = s; } }
        return best ? best.id : null;
      },
      site,
      /**
       * Stand in a dungeon: where 'entry' | 'mid' | 'door' | 'room' | 'puzzle' (or a local [a, y, b]);
       * look at 'door' | 'chest' | 'mid' | 'spawner' | 'lever' | 'switch' | 'dials' | 'beams' |
       * 'plates' | 'valve' | 'shaft' | 'gallery' (or a local [a, y, b]).
       */
      go: (id, where = 'mid', look = null) => {
        const s = site(id), P = s.P;
        const sp = Array.isArray(where) ? where : P.spots[where] || P.spots.mid;
        const q = look ? (Array.isArray(look) ? look : P.looks[look] || P.looks.mid) : (where === 'door' ? P.looks.door : where === 'room' ? P.looks.chest : P.looks.mid) || [sp[0] + 20, sp[1] + 10, sp[2]];
        return stand(s, sp[0], sp[1], sp[2], q);
      },
      /** Solve a dungeon's puzzle now (the door opens). */
      solve: (id) => { const s = site(id); if (!s.built) s.build(); s.solve(R.queue); return true; },
      /** Forget a dungeon's state (the door voxels come back only when the world is regenerated). */
      reset: (id) => { const s = site(id); for (const k of Object.keys(s.save)) delete s.save[k]; if (s.built) { s.drop(); s.build(); } return true; },
      /** Use a puzzle piece by index (lever, drum, mirror; 0 for the switch/valve; 'chest' = the strongroom's). */
      press: (id, i = 0) => {
        const s = site(id);
        if (!s.built) s.build();
        const els = i === 'chest' ? s.els.filter((e) => e.label().toLowerCase().includes('chest')) : s.els.filter((e) => !/chest|remains/.test(e.label().toLowerCase()));
        const e = els[i === 'chest' ? 0 : i];
        return e ? (R.queue.push(...(e.use() || [])), e.label()) : null;
      },
      /** Open dungeon chest i (not the strongroom's). */
      loot: (id, i = 0) => { const s = site(id); if (!s.built) s.build(); const r = s.openLoot(i); R.queue.push(...r); return r; },
      /** A spawner's state, or 'break' it as if dug apart. */
      spawner: (id, i = 0, what = 'info') => {
        const s = site(id);
        if (!s.built) s.build();
        const sp = s.spawners[i];
        if (!sp) return null;
        if (what === 'break' && !sp.broken) s.breakSpawner(sp, R.queue);
        if (what === 'go') { const P = s.P, q = P.spawners[i]; return stand(s, q.a - 30, 0, q.b, [q.a, q.y + 4, q.b]); }
        return { broken: sp.broken, cage: s.loaded(sp.sp.a, sp.sp.y, sp.sp.b) ? s.cageCount(sp.sp) : null, n0: sp.n0, alive: sp.mine.filter((e) => e.alive).length, kinds: sp.sp.kinds };
      },
      /** Stand in a lift station (id, e.g. 'L0', 'L31', 's2'), looking at its lever; 'pull' pulls it. */
      lift: (id = 'L0', what = 'go') => {
        const it = R.lifts.list.find((q) => q.L.id === id);
        if (!it) return null;
        const L = it.L, F = it.F;
        if (what === 'pull') { if (!it.built) R.lifts.build(it); return R.lifts.pull(it); }
        const px = L.x + (L.id[0] === 's' ? 0.6 : -0.4), pz = L.z + (L.id[0] === 's' ? -0.2 : 0.9);
        const dx = F.lever.x - px, dz = F.lever.z - pz, dy = F.lever.y + 0.5 - (L.y + 0.72);
        R.owner?.debug?.teleport?.(px, L.y + 0.05, pz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
        return { x: px, y: L.y, z: pz };
      },
      /** The puzzle object (state, pieces). */
      puzzle: (id) => site(id).puzzle,
      // the trails are gone (no human works in the caves): kept so old callers don't break
      trail: () => null,
      sign: () => null,
    };
  }
}

export { VOX };
