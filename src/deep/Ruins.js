// Ruins, trails and puzzles in the mine (an optional module, like Props). The old ones' halls,
// shrines, vaults and wells are stamped into the rock by gen/ruins.js; this brings them to life
// near the mole: each ruin's puzzle (levers, a hidden switch, symbol drums, light beams and
// mirrors, pressure plates, a drain valve — ./ruins/puzzles.js), the progress runes on its sealed
// door, the seal opening, braziers, the treasure room's chest (gold, gems and a relic for the
// Index) and the hoard you can dig for gold (./ruins/site.js). It also dresses the old trails
// (signposts, rails, carts, lost tools, bridge ropes: ./ruins/trailDress.js).
//
// API (DigScene): new Ruins(ctx) · update(dt, { player, eye, time }) → events · target(eye, dir,
// reach) → { label, kind: 'use' } | null · use(eye, dir, reach) → events | null · lights(eye) →
// ≤ 3 lights · radarMarkers(pos, survey) → markers · dispose(). Events: { say, key, tone, cd },
// { loot: { id, q, p } }, { act: { type: 'puzzle', id, ... } }, { act: { type: 'relic', id } }.
// Save: state.data.deep.ruins[ruinId] = { seen, open, solved, chest, gemsLeft, seq, dials,
// mirrors, drained, ... }. Test hooks: ruins.debug (list, go, solve, reset, step, trail).
import * as THREE from 'three';
import { makeObjectMaterial } from './TerrainMaterial.js';
import { VOX, M } from './materials.js';
import { Site, NAMES } from './ruins/site.js';
import { TrailDress } from './ruins/trailDress.js';
import { sfx } from './ruins/sfx.js';
import { toWorld } from './ruins/common.js';
import { RM } from './ruins/mats.js';

/** Carved stone you can read with a paw (quests part: lore, src/core/lore.js). */
const CARVED = new Set([RM.FRIEZE, RM.RUNEOFF, RM.RUNE, RM.RUNE_R, RM.GILT]);

const _v = new THREE.Vector3();

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
    const deep = this.st?.data?.deep;
    this.save = deep ? (deep.ruins ||= {}) : {};
    this.queue = [];
    this.timers = [];
    this.time = 0;
    this.sites = [];
    (this.plan.ruins || []).forEach((r, i) => {
      const f = this.plan.features.find((q) => q.kind === 'ruin' && q.id === r.id);
      if (!f) return;
      try { this.sites.push(new Site(this, r, f, i)); } catch (e) { console.warn('ruin site', r.id, e); }
    });
    this.trails = new TrailDress(this);
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
      if (tm.t <= 0) { this.timers.splice(i, 1); try { tm.fn(out); } catch (e) { console.warn('ruins timer', e); } }
    }
    const eye = o.eye || this.player?.eye?.() || this.player.pos;
    for (const s of this.sites) {
      try { s.update(dt, eye, out); } catch (e) { console.warn('ruin', s.id, e); }
    }
    this.trails.update(dt, eye);
    return out;
  }

  // ------------------------------------------------------------ picking
  pick(eye, dir, reach) {
    let best = null, bt = reach + 0.05;
    for (const s of this.sites) {
      if (!s.built) continue;
      for (const e of s.els) {
        const ox = e.pos.x - eye.x, oy = e.pos.y - eye.y, oz = e.pos.z - eye.z;
        const t = ox * dir.x + oy * dir.y + oz * dir.z;
        if (t < 0 || t > bt) continue;
        const ex = ox - dir.x * t, ey = oy - dir.y * t, ez = oz - dir.z * t;
        if (ex * ex + ey * ey + ez * ez < e.r * e.r) { bt = t; best = e; }
      }
    }
    const sg = this.trails.pick(eye, dir, Math.min(bt, reach));
    if (sg && sg.t < bt) best = sg;
    if (best) return best;
    // the sealed door itself
    const hit = this.w.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, reach + 0.1);
    if (hit && (hit.m === M.WARD || hit.m === M.BEDROCK)) {
      for (const s of this.sites) {
        if (!s.built || s.save.open || !s.isDoorVoxel(hit.vx, hit.vy, hit.vz)) continue;
        return { label: 'Sealed door', use: () => [{ say: this.doorHint(s), key: 'door' + s.id, cd: 4 }] };
      }
    }
    // the carvings: run a paw along the raised runes and read what the Old Ones wrote (quests part)
    const lore = this.owner?.game?.lore;
    if (hit && lore && CARVED.has(hit.m)) {
      const s = this.siteAt(hit);
      if (s) return { label: 'Read the carvings', use: () => this.readCarving(s, hit, lore) };
    }
    return null;
  }
  /** The ruin a voxel hit belongs to (the nearest built one, close enough). */
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
  /** Read a ruin's carving: two carved walls per ruin, each with its own text (src/data/lore.js). */
  readCarving(s, hit, lore) {
    const wall = (Math.floor(hit.vx / (VOX * 3)) + Math.floor(hit.vz / (VOX * 3))) & 1;
    const e = lore.readCarving({ id: s.id, kind: s.kind, wall });
    this.sfx.grind?.(0.12, 0.08);
    s.save.read = (s.save.read || 0) + 1;
    lore.show(e, { kind: 'carving' });
    return [{ handled: true }];
  }
  doorHint(s) {
    const n = (s.save.knock = (s.save.knock || 0) + 1);
    this.sfx.grind(0.25, 0.2);
    const H = {
      levers: ['Sealed with old wards. Four levers in the walls, and signs over the door.', 'The signs over the door are the same as the ones over the levers. In that order?'],
      switch: ['Sealed with old wards. Over the door: a hammer, and an arrow.', 'A hammer and an arrow... is one of these walls not as solid as the rest?'],
      dials: ['Sealed with old wards. The idol watches it; the mural shows three signs.', 'Make the drums on the altar show the mural\'s signs. Each drum drags its neighbour round.'],
      beams: ['Sealed with old wards. A crystal in the wall burns like a little sun.', 'Turn the mirrors to carry its light to the socket before the idol.'],
      plates: ['Sealed with old wards. Three plates in the floor, and weights carved on the walls.', 'All three plates have to be down at once. A clump of ore is heavy. So is a block you build.'],
      valve: ['Sealed with old wards, deep under the water.', 'There was a wheel on the landing above. Water has to go somewhere.'],
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
  /** Radar / survey markers: ruins found (by name) and an unknown signal from ones nearby. */
  radarMarkers(pos, survey = false) {
    const out = [];
    for (const s of this.sites) {
      const c = s.center, d = Math.hypot(c.x - pos.x, (c.y - pos.y) * 1.5, c.z - pos.z);
      if (s.save.seen) { if (survey || d < 60) out.push({ kind: 'ruin', x: c.x, y: c.y, z: c.z, label: s.name + (s.save.open ? '' : ' (sealed)'), color: s.save.open ? '#e8c060' : '#c8a0ff' }); }
      else if (d < (survey ? 50 : 28)) out.push({ kind: 'ruin', x: c.x, y: c.y, z: c.z, label: '? ruin', color: '#8a7a9a' });
    }
    return out;
  }

  dispose() {
    for (const s of this.sites) s.drop();
    this.trails.dispose();
    this.scene3.remove(this.root);
    for (const m of [this.mat, this.glowMat, this.dimMat, this.flameMat, this.wardMat]) m.dispose();
  }

  // ------------------------------------------------------------ test hooks
  makeDebug() {
    const R = this;
    const site = (id) => (typeof id === 'number' ? R.sites[id] : R.sites.find((s) => s.id === id)) || R.sites[0];
    return {
      /** [{ id, kind, puzzle, zone, x, y, z, open }] */
      list: () => R.sites.map((s) => ({ id: s.id, kind: s.kind, puzzle: s.L.puzzle, zone: s.zone, name: NAMES[s.kind], x: +s.center.x.toFixed(1), y: +s.center.y.toFixed(1), z: +s.center.z.toFixed(1), open: !!s.save.open, built: s.built })),
      site,
      /** Stand in a ruin: where 'entry' | 'door' | 'puzzle' | 'room' | 'mid'; looks at the spot named by 'look'. */
      go: (id, where = 'mid', look = null) => {
        const s = site(id), P = s.P, L = s.L;
        const spots = {
          entry: [P.entry.a + 46, P.entry.y ?? 0, 0],
          mid: [-L.R * 0.45, 0, 0],
          door: [P.door.a0 - 22, P.door.y0 ?? 0, 0],
          room: [(P.room.a0 + P.room.a1) / 2 - 8, P.room.y0, 0],
        };
        if (s.kind === 'well') { spots.door = [P.gal.a1 - 26, -P.DD, 0]; spots.puzzle = [P.valve.a + P.valve.face[0] * 12, P.yL, P.valve.b + P.valve.face[1] * 12]; spots.mid = [-(P.RS + 10), 0, 0]; }
        const pz = R.puzzleSpot(s);
        if (pz && !spots.puzzle) spots.puzzle = pz;
        const [u, y, v] = Array.isArray(where) ? where : spots[where] || spots.mid;
        const p = toWorld(L, u, y, v);
        const q = look ? (Array.isArray(look) ? look : R.lookSpot(s, look)) : [u + 20, y + 10, v];
        const t = toWorld(L, q[0], q[1], q[2]);
        const dx = t.x - p.x, dy = t.y - (p.y + 0.72), dz = t.z - p.z;
        R.owner?.debug?.teleport?.(p.x, p.y + 0.05, p.z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
        return { x: p.x, y: p.y, z: p.z };
      },
      /** Solve a ruin's puzzle now (the door opens). */
      solve: (id) => { const s = site(id); if (!s.built) s.build(); s.solve(R.queue); return true; },
      /** Forget a ruin's state (the door voxels come back only when the world is regenerated). */
      reset: (id) => { const s = site(id); for (const k of Object.keys(s.save)) delete s.save[k]; if (s.built) { s.drop(); s.build(); } return true; },
      /** Use a puzzle piece by index (lever, drum, mirror; 0 for the switch/valve; 'chest'). */
      press: (id, i = 0) => {
        const s = site(id);
        if (!s.built) s.build();
        const els = i === 'chest' ? s.els.filter((e) => e.label().toLowerCase().includes('chest')) : s.els.filter((e) => !e.label().toLowerCase().includes('chest'));
        const e = els[i === 'chest' ? 0 : i];
        return e ? (R.queue.push(...(e.use() || [])), e.label()) : null;
      },
      /** The puzzle object (state, pieces). */
      puzzle: (id) => site(id).puzzle,
      trail: () => R.trails,
      /** Where to stand to see a trail's junction signpost k. */
      sign: (k = 0) => { const it = R.trails.signs[k]; if (!it) return null; const p = R.trails.segPoint(it.seg, it.s, 0); return { x: p.x, y: p.y, z: p.z, ux: p.ux, uz: p.uz, boards: it.boards.map((b) => b.text) }; },
    };
  }
  puzzleSpot(s) {
    const P = s.P;
    if (P.levers) { const lv = P.levers[0]; return [lv.a + lv.face[0] * 20, 0, lv.b + lv.face[1] * 20]; }
    if (P.switch) { const w = P.switch; return [w.a + w.face[0] * 26, 0, w.b + w.face[1] * 26]; }
    if (P.dials) return [P.dials[1].a, 0, P.altar.b0 - 36];
    if (P.beam) return [-(s.L.R * 0.15), 0, -s.L.R * 0.25];
    if (P.plates) return [P.plates[0].a - 14, 0, P.plates[0].b * 0.4];
    return null;
  }
  lookSpot(s, what) {
    const P = s.P;
    if (what === 'lever' && P.levers) { const lv = P.levers[0]; return [lv.a, 14, lv.b]; }
    if (what === 'switch' && P.switch) return [P.switch.a, 16, P.switch.b];
    if (what === 'dials' && P.dials) return [P.dials[1].a, 20, P.dials[1].b];
    if (what === 'beams' && P.beam) return [P.beam.mirrors[1].a, 12, P.beam.mirrors[1].b];
    if (what === 'plates' && P.plates) return [P.plates[2].a, 0, P.plates[2].b];
    if (what === 'valve' && P.valve) return [P.valve.a, P.valve.y, P.valve.b];
    if (what === 'chest') return [P.chest.a, (P.chest.y || 0) + 6, P.chest.b];
    if (what === 'idol') return [0, 26, 0];
    if (what === 'shaft' && P.RS) return [0, -60, 0];
    if (what === 'gallery' && P.gal) return [P.gal.a1, -P.DD + 10, 0];
    return [P.door.a0, (P.door.y0 || 0) + 16, 0];
  }
}

export { VOX };
void _v;
