// One dungeon at play time (./dungeon.js lays it out, gen/ruins.js stamps it): its props, built
// while the mole is near — the monster spawners (an iron cage with a flame inside that breeds the
// dungeon's creatures while you're close; dig its cage apart and it's done), the loot chests, the
// cobwebs, a dart trap, a lost miner's remains (a page of Hobb's journal), the stone guardians of a
// Starfolk vault — and, behind the sealed door, the puzzle (./puzzles.js), the progress runes, the
// seal opening, the braziers, the strongroom's chest (gold, gems and a relic) and the hoard you dig
// for gold. State: state.data.deep.ruins[id] = { seen, open, solved, chest, loot: {i: 1},
// spawners: {i: 1}, remains: {i: 1}, ...puzzle state }.
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { VOX, M, MAT } from '../materials.js';
import { RM } from './mats.js';
import { Vox, h3 } from '../../gfx/char/vox.js';
import { ruinLayout } from '../gen/ruins.js';
import { toWorld, toWorldVox, toLocal, yawOf } from './common.js';
import { DUNGEON_NAMES, DUNGEON_BLURB } from './dungeon.js';
import * as MD from './models.js';
import { PUZZLES } from './puzzles.js';
import { RELIC_IDS } from './relics.js';
import { ITEMS } from '../../data/items.js';

export const NAMES = DUNGEON_NAMES;
const CHEST_GOLD = [0, 260, 720, 1600, 3600, 7200, 12500];
const LOOT_GOLD = [0, 40, 110, 260, 600, 1200, 2200];
const HOARD_GOLD = [0, 0.6, 1.4, 3, 6, 10, 16]; // per voxel of hoard dug
const GEMS = [null, ['quartz', 'quartz', 'amber'], ['amber', 'amethyst', 'quartz'], ['amethyst', 'echo_crystal', 'amethyst'], ['ruby', 'emerald', 'ruby'], ['sapphire', 'emerald', 'diamond'], ['diamond', 'sunstone', 'voidstone']];
// a dungeon chest, by zone: [item, weight] (what isn't in ITEMS is skipped)
const LOOT = [null,
  [['copper_ingot', 3], ['tin_ingot', 2], ['spider_silk', 3], ['grub_bar', 3], ['tea_flask', 2], ['blk_torch', 3], ['glow_stake', 2], ['support_beam', 1], ['quartz', 1], ['bp_dagger', 0.4]],
  [['bronze_ingot', 3], ['iron_ingot', 2], ['dynamite', 2], ['spider_silk', 2], ['hearty_pie', 2], ['blk_torch', 3], ['glow_stake', 2], ['amber', 1], ['bp_shortsword', 0.4], ['bp_axe', 0.3]],
  [['iron_ingot', 3], ['silver_ingot', 2], ['dynamite', 2], ['slime_gel', 2], ['herb_bread', 2], ['blk_torch', 2], ['amethyst', 1], ['bp_mace', 0.4], ['bp_spear', 0.3]],
  [['steel_ingot', 3], ['gold_ingot', 2], ['dynamite_bundle', 2], ['ember_scale', 2], ['ember_curry', 2], ['ruby', 1], ['bp_longsword', 0.4], ['bp_warhammer', 0.3]],
  [['mithril_ingot', 3], ['moonsilver_ingot', 2], ['blasting_charge', 2], ['frost_parfait', 2], ['wraith_ash', 2], ['sapphire', 1], ['bp_rapier', 0.4]],
  [['adamant_ingot', 3], ['starmetal_ingot', 2], ['blasting_charge', 2], ['lotus_feast', 2], ['wraith_ash', 2], ['diamond', 1], ['bp_greatsword', 0.4], ['bp_moleblade', 0.25]],
];
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const SPAWN_R = 10; // m: a spawner breeds while the mole is this close
const SPAWN_CAP = [0, 2, 2, 3, 3, 3, 4]; // its creatures alive at once, by zone

export class Site {
  constructor(R, info, f, index) {
    this.R = R;
    this.info = info;
    this.f = f;
    this.L = ruinLayout(f);
    this.P = this.L.P;
    this.id = info.id;
    this.kind = this.L.kind;
    this.zone = this.L.zone;
    this.plain = !!this.P.plain;
    this.name = NAMES[this.kind] || 'Dungeon';
    this.relic = this.plain ? null : info.relic || RELIC_IDS[index % RELIC_IDS.length];
    this.save = R.save[this.id] ||= {};
    this.built = false;
    this.els = [];
    this.anims = [];
    this.bb = f.bb;
    this.center = toWorld(this.L, 0, 0, 0);
    const rm = this.P.room;
    this.roomBox = rm ? this.boxWorld(rm.a0, rm.a1, rm.y0, rm.y1, rm.b0, rm.b1) : null;
    const S = this.P.main;
    this.mainBox = this.boxWorld(S.a0, S.a1, S.y0, S.y1, S.b0, S.b1);
  }

  // ------------------------------------------------------------ geometry helpers
  /** World point (THREE.Vector3) of local (u, y, v) — continuous voxel units. */
  wp(u, y, v, out = new THREE.Vector3()) { const p = toWorld(this.L, u, y, v); return out.set(p.x, p.y, p.z); }
  boxWorld(a0, a1, y0, y1, b0, b1) {
    const p = toWorld(this.L, a0, y0, b0), q = toWorld(this.L, a1, y1, b1);
    return [Math.min(p.x, q.x), Math.min(p.y, q.y), Math.min(p.z, q.z), Math.max(p.x, q.x), Math.max(p.y, q.y), Math.max(p.z, q.z)];
  }
  inBox(B, p, pad = 0) { return p.x > B[0] - pad && p.x < B[3] + pad && p.y > B[1] - pad && p.y < B[4] + pad && p.z > B[2] - pad && p.z < B[5] + pad; }
  distTo(p) {
    const b = this.bb;
    const dx = Math.max(b[0] - p.x, 0, p.x - b[3]), dy = Math.max(b[1] - p.y, 0, p.y - b[4]), dz = Math.max(b[2] - p.z, 0, p.z - b[5]);
    return Math.hypot(dx, dy, dz);
  }
  /** Add a mesh made of geometry g at local (u, y, v), its +z facing local (da, db). */
  put(g, u, y, v, face = [1, 0], mat = this.R.mat, parent = this.group) {
    const m = new THREE.Mesh(g, mat);
    this.wp(u, y, v, m.position);
    m.rotation.y = yawOf(this.L, face[0], face[1]);
    m.layers.enable(LAYER_OUTLINE);
    parent.add(m);
    this.geos.push(g);
    return m;
  }
  /** A pivot group at local (u, y, v) facing (da, db). */
  pivot(u, y, v, face = [1, 0]) {
    const g = new THREE.Group();
    this.wp(u, y, v, g.position);
    g.rotation.order = 'YXZ'; // yaw first, then tilt (x) and spin (z) in the model's own frame
    g.rotation.y = yawOf(this.L, face[0], face[1]);
    this.group.add(g);
    return g;
  }
  /** Add an interactive element. */
  el(pos, r, label, use) { const e = { pos, r, label, use, site: this }; this.els.push(e); return e; }
  vox(a, y, b) { const [vx, vy, vz] = toWorldVox(this.L, a, y, b); return this.R.w.voxelAt(vx, vy, vz); }
  setVox(a, y, b, m) { const [vx, vy, vz] = toWorldVox(this.L, a, y, b); return this.R.w.setVoxel(vx, vy, vz, m); }
  /** Is the chunk holding local voxel (a, y, b) generated (not virtual, not pending)? */
  loaded(a, y, b) {
    const [vx, vy, vz] = toWorldVox(this.L, a, y, b);
    const ch = this.R.w.chunk(vx >> 5, vy >> 5, vz >> 5);
    return !!(ch && ch.vox && !ch.pending);
  }
  anim(dur, fn, done) { this.anims.push({ t: 0, dur, fn, done }); }

  // ------------------------------------------------------------ build / drop
  build() {
    if (this.built) return;
    this.built = true;
    this.group = new THREE.Group();
    this.group.name = 'dungeon-' + this.id;
    this.R.root.add(this.group);
    this.geos = [];
    this.els = [];
    this.anims = [];
    this.darts = [];
    const P = this.P;
    // braziers flanking the sealed door, lit once it opens
    this.braziers = (P.door ? P.braziers || [] : []).map((b) => {
      const y = b.y ?? 0;
      const m = this.put(MD.brazier(), b.a, y, b.b);
      const fl = this.put(MD.flameGeo(), b.a, y + 10.6, b.b, [1, 0], this.R.flameMat);
      fl.layers.disable(LAYER_OUTLINE);
      fl.visible = !!this.save.open;
      return { m, fl, pos: this.wp(b.a, y + 12, b.b), t: Math.random() * 6 };
    });
    // the strongroom's chest (first: debug.press(id, 'chest') opens this one), gold trinkets round it
    if (P.door && P.chest) {
      const C = P.chest;
      this.chest = this.makeChest(C, MD.chestBody(), MD.chestLid(), 12, 7, !!this.save.chest);
      this.chestPos = this.wp(C.a, C.y + 7, C.b);
      this.el(this.chestPos, 0.42, () => (this.save.chest ? 'Empty chest' : 'Open the chest'), () => this.openChest());
      const tr = ['goblet', 'crown', 'idol', 'goblet'];
      const side = [C.face[1], -C.face[0]];
      [[-14, 4], [13, -3], [-9, -7], [10, 6]].forEach(([s, f], i) => {
        this.put(MD.trinket(tr[i]), C.a + side[0] * s - C.face[0] * f, C.y, C.b + side[1] * s - C.face[1] * f, [Math.cos(i * 2.1), Math.sin(i * 2.1)]);
      });
    }
    // the dungeon's own chests
    this.save.loot ||= {};
    this.loot = P.chests.map((C, i) => {
      const ch = this.makeChest(C, MD.woodChest(), MD.woodChestLid(), 10, 7, !!this.save.loot[i]);
      const pos = this.wp(C.a, C.y + 5, C.b);
      this.el(pos, 0.36, () => (this.save.loot[i] ? 'Empty chest' : 'Open the chest'), () => this.openLoot(i));
      return { ...ch, pos };
    });
    // spawners: a flame turning in the cage
    this.save.spawners ||= {};
    this.spawners = P.spawners.map((sp, i) => {
      const fl = this.put(MD.flameGeo(), sp.a, sp.y + 1.5, sp.b, [1, 0], this.R.flameMat);
      fl.scale.setScalar(0.55);
      fl.layers.disable(LAYER_OUTLINE);
      const broken = !!this.save.spawners[i];
      fl.visible = !broken;
      return { sp, i, fl, pos: this.wp(sp.a, sp.y + 4, sp.b), broken, n0: null, pollT: 0, t: 2 + Math.random() * 3, mine: [], fxT: 0 };
    });
    // cobwebs in the corners (and one across the way in: a real one, if the creatures part is here)
    this.realWebs = [];
    P.webs.forEach((w, i) => this.makeWeb(w, i));
    // the dart trap's pressure plate
    this.traps = P.traps.map((t) => {
      const plate = this.put(MD.trapPlate(P.theme === 'deep' ? 0x4a2a2a : P.theme === 'brick' ? 0x6a6a6c : 0x6e6e70), t.a, 0, t.b);
      return { t, plate, c: this.wp(t.a, 0, t.b), cool: 0, k: 0, warned: false };
    });
    // skulls in the crypt's tombs
    P.skulls.forEach((k, i) => this.put(MD.skull(this.L.seed + i), k.a, k.y, k.b, [k.face[0] + (h3(i, 3, 1, this.L.seed) - 0.5) * 0.8, k.face[1]]));
    // a lost miner's remains (Hobb's journal pages for the quests part)
    this.save.remains ||= {};
    P.remains.forEach((rm, i) => {
      const a = h3(rm.a | 0, rm.b | 0, 3, this.L.seed) * Math.PI * 2;
      this.put(MD.remains(this.L.seed + i), rm.a, rm.y, rm.b, [Math.cos(a), Math.sin(a)]);
      this.el(this.wp(rm.a, rm.y + 3, rm.b), 0.45, () => (this.save.remains[i] ? 'The lost miner\'s remains' : 'Search the remains'), () => this.searchRemains(i));
    });
    // the puzzle
    const Pz = !this.plain && PUZZLES[this.L.puzzle];
    this.puzzle = Pz ? new Pz(this) : null;
    this.puzzle?.build();
    this.synced = false;
    this.sync();
  }

  /** A chest at C (local, facing C.face): body + lid on a pivot at the back hinge (h: body height, d: half depth, 1/32 m). */
  makeChest(C, body, lid, h, d, open) {
    const b = this.put(body, C.a, C.y, C.b, C.face);
    const base = this.pivot(C.a - C.face[0] * d / 2, C.y + h / 2, C.b - C.face[1] * d / 2, C.face);
    const pv = new THREE.Group();
    base.add(pv);
    const l = new THREE.Mesh(lid, this.R.mat);
    l.layers.enable(LAYER_OUTLINE);
    this.geos.push(lid);
    pv.add(l);
    if (open) pv.rotation.x = -1.9;
    return { body: b, lid: l, pivot: pv };
  }

  makeWeb(w, i) {
    const R = this.R, en = R.owner?.enemies;
    if (w.flat && !w.deco && en?.webs?.add && !this.save.webCut) {
      // across the way in: a web you have to cut through (it sticks, it tears)
      const p = this.wp(w.a + w.da * 0.5, w.y - w.r * VOX, w.b + w.db * 0.5);
      const wd = [w.da * this.L.F[0] + w.db * this.L.Rv[0], w.da * this.L.F[1] + w.db * this.L.Rv[1]];
      try {
        const web = en.webs.add(p.x, p.y, p.z, Math.atan2(wd[0], wd[1]), w.r);
        if (web) {
          // drawn as the dungeon's own (sparser, Minecraft-ish) cobweb; the creatures part's web logic
          const g = MD.cobweb(Math.round(w.r * 32), this.L.seed + i);
          this.geos.push(g);
          web.mesh.geometry = g;
          web.mesh.material = this.R.webMat;
          this.realWebs.push(web);
          return;
        }
      } catch (e) { /* decorative then */ }
    }
    const rv = Math.round(w.r * 32);
    const m = new THREE.Mesh(MD.cobweb(rv, this.L.seed + i), R.webMat);
    this.geos.push(m.geometry);
    const k = w.r * VOX * 0.62;
    if (w.flat) {
      this.wp(w.a + w.da * 0.5, w.y - w.r * VOX, w.b + w.db * 0.5, m.position);
      const t = this.wp(w.a + w.da * 6, w.y - w.r * VOX, w.b + w.db * 6);
      m.lookAt(t);
    } else {
      this.wp(w.a + w.da * k, w.y - k, w.b + w.db * k, m.position);
      m.lookAt(this.wp(w.a, w.y, w.b));
    }
    m.layers.enable(LAYER_OUTLINE);
    this.group.add(m);
  }

  /** Bring the voxels in line with the save (the door, the runes, the eyes) once they are loaded. */
  sync() {
    const D = this.P.door;
    if (!D) { this.synced = true; return true; }
    if (!this.loaded(D.a0, D.y0 + 4, Math.floor((D.b0 + D.b1) / 2))) return false;
    if (this.save.open) { this.removeDoor(false); this.setRunes(99); this.lightEyes(); }
    else this.setRunes(this.puzzle?.progress?.() ?? 0);
    this.synced = true;
    return true;
  }

  drop() {
    if (!this.built) return;
    this.built = false;
    this.puzzle?.dispose?.();
    this.puzzle = null;
    const en = this.R.owner?.enemies;
    for (const w of this.realWebs || []) { if (w.alive) { try { en.webs.remove(w); } catch (e) { /* gone */ } } else if (w.hp <= 0) this.save.webCut = 1; }
    this.realWebs = [];
    for (const d of this.darts || []) this.group.remove(d.m);
    this.darts = [];
    this.R.root.remove(this.group);
    for (const g of this.geos) g.dispose();
    this.geos = [];
    this.els = [];
    this.group = null;
    this.hoardBase = null;
    for (const a of this.anims) a.done?.(true);
    this.anims = [];
  }

  // ------------------------------------------------------------ frame
  update(dt, eye, out) {
    const d = this.distTo(eye);
    if (!this.built && d < 16) this.build();
    else if (this.built && d > 24) { this.drop(); return; }
    if (this.built && !this.synced) { this.syncT = (this.syncT || 0) - dt; if (this.syncT <= 0) { this.syncT = 0.5; this.sync(); } }
    // first visit: walking into it
    if (!this.save.seen && this.inBox(this.mainBox, eye, 0.3)) {
      this.save.seen = 1;
      out.push({ say: `<b>${this.name}</b> · ${DUNGEON_BLURB[this.kind] || ''}`, key: 'ruin' + this.id, tone: 'good', cd: 999 });
      this.R.sfx.chime(0);
    }
    if (!this.built) return;
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k, dt);
      if (k >= 1) { this.anims.splice(i, 1); a.done?.(false); }
    }
    this.puzzle?.update?.(dt, eye, out);
    // braziers
    for (const b of this.braziers) {
      if (!b.fl.visible) continue;
      b.t += dt;
      const f = 1 + Math.sin(b.t * 13) * 0.12 + Math.sin(b.t * 5.3) * 0.08;
      b.fl.scale.set(1 + Math.sin(b.t * 7) * 0.06, f, 1 + Math.cos(b.t * 6) * 0.06);
      if (Math.random() < dt * 9) this.R.fx.ember(b.pos.x + (Math.random() - 0.5) * 0.12, b.pos.y + 0.05, b.pos.z + (Math.random() - 0.5) * 0.12);
    }
    for (const s of this.spawners) this.updateSpawner(s, dt, eye, out);
    for (const t of this.traps) this.updateTrap(t, dt, out);
    this.updateDarts(dt, out);
    this.guardians(eye, out);
    // the hoard: dig it and the gold goes in your pouch
    if (this.save.open && this.roomBox && this.inBox(this.roomBox, eye, 1.5)) this.pollHoard(dt, out);
  }

  /** Lights near the eye: lit braziers, the open strongroom's glow, spawner flames, lava, the puzzle's own. */
  lights(eye, list) {
    if (!this.built) return;
    for (const b of this.braziers) if (b.fl.visible) list.push({ x: b.pos.x, y: b.pos.y + 0.15, z: b.pos.z, c: [1.25, 0.72, 0.32], r: 5.5, lantern: true });
    if (this.save.open && this.P.room) {
      const c = this.wp((this.P.room.a0 + this.P.room.a1) / 2, (this.P.room.y0 + this.P.room.y1) / 2, 0);
      list.push({ x: c.x, y: c.y, z: c.z, c: [0.9, 0.62, 0.22], r: 5 });
    }
    for (const s of this.spawners) if (!s.broken) list.push({ x: s.pos.x, y: s.pos.y, z: s.pos.z, c: this.P.theme === 'deep' ? [1.1, 0.42, 0.12] : [0.62, 0.36, 1.0], r: 2.6, lantern: true });
    if (this.P.lava) { const p = this.wp((this.P.lava.a0 + this.P.lava.a1) / 2, 0, (this.P.lava.b0 + this.P.lava.b1) / 2); list.push({ x: p.x, y: p.y + 0.2, z: p.z, c: [1.5, 0.5, 0.14], r: 4.5, lava: true }); }
    this.puzzle?.lights?.(eye, list);
  }

  // ------------------------------------------------------------ the spawners
  /** The cage's block in world voxels [x0, y0, z0, x1, y1, z1] (inclusive; a quarter turn keeps it a box). */
  cageBox(sp) {
    if (sp.box) return sp.box;
    const p = toWorldVox(this.L, sp.a - 4, sp.y, sp.b - 4), q = toWorldVox(this.L, sp.a + 3, sp.y + 7, sp.b + 3);
    return (sp.box = [Math.min(p[0], q[0]), p[1], Math.min(p[2], q[2]), Math.max(p[0], q[0]), q[1], Math.max(p[2], q[2])]);
  }
  cageCount(sp) {
    const B = this.cageBox(sp), w = this.R.w;
    let n = 0;
    for (let z = B[2]; z <= B[5]; z++) for (let y = B[1]; y <= B[4]; y++) for (let x = B[0]; x <= B[3]; x++) if (w.voxelAt(x, y, z) === RM.SPAWNER) n++;
    return n;
  }
  updateSpawner(s, dt, eye, out) {
    if (s.broken) return;
    const sp = s.sp, R = this.R;
    // the cage: dug half apart and it's done for
    s.pollT -= dt;
    if (s.pollT <= 0) {
      s.pollT = 0.35;
      if (this.loaded(sp.a, sp.y + 4, sp.b)) {
        const n = this.cageCount(sp);
        if (s.n0 === null) s.n0 = n;
        else if (n < s.n0 * 0.75) { this.breakSpawner(s, out); return; }
      }
    }
    // the flame in the cage
    s.fxT += dt;
    s.fl.scale.set(0.55 + Math.sin(s.fxT * 9) * 0.05, 0.55 + Math.sin(s.fxT * 13) * 0.08, 0.55);
    s.fl.rotation.y += dt * 2.5;
    const d = s.pos.distanceTo(eye);
    if (d < 14 && Math.random() < dt * 6) {
      R.fx.spawn({ x: s.pos.x + (Math.random() - 0.5) * 0.3, y: s.pos.y - 0.1 + Math.random() * 0.2, z: s.pos.z + (Math.random() - 0.5) * 0.3, vx: 0, vy: 0.3 + Math.random() * 0.3, vz: 0, life: 0.6 + Math.random() * 0.5, size: 0.02, color: this.P.theme === 'deep' ? [1, 0.45, 0.12] : [0.62, 0.4, 1], glow: true, drag: 1, grav: -0.2, swirl: 0.4 });
    }
    // breeding: while the mole is close, every so often, up to a few at a time
    const en = R.owner?.enemies;
    if (!en || en.autoSpawn === false || en.peace || en.safe) return;
    if (d > SPAWN_R || Math.abs(eye.y - s.pos.y) > 3.5) return;
    s.t -= dt;
    if (s.t > 0) return;
    s.t = 7 + Math.random() * 7;
    s.mine = s.mine.filter((e) => e.alive && en.list.includes(e));
    if (s.mine.length >= (SPAWN_CAP[this.zone] || 3)) return;
    const kind = sp.kinds[Math.floor(Math.random() * sp.kinds.length)];
    let got = [];
    try { got = en.spawnGroup([kind], s.pos.x, s.pos.y - 0.25, s.pos.z, this.zone, { hidden: false, r: 2.2 }) || []; } catch (e) { got = []; }
    for (const e of got) {
      s.mine.push(e);
      const p = e.pos || s.pos;
      for (let k = 0; k < 14; k++) R.fx.spawn({ x: p.x + (Math.random() - 0.5) * 0.5, y: p.y + Math.random() * 0.6, z: p.z + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 0.6, vy: 0.4 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.6, life: 0.6 + Math.random() * 0.6, size: 0.03, color: this.P.theme === 'deep' ? [1, 0.5, 0.15] : [0.7, 0.45, 1], glow: true, drag: 1.5 });
      R.fx.dust(p.x, p.y + 0.1, p.z, 6, [0.25, 0.22, 0.28], 0.3);
    }
    if (!got.length) s.t = 1 + Math.random(); // no room to stand just now (the mole too close): soon again
    if (got.length) {
      R.sfx.spawn(Math.max(0.2, 1 - d / SPAWN_R));
      if (!this.R.hintSpawner) { this.R.hintSpawner = true; out.push({ say: 'The <b>spawner</b> breeds monsters while you\'re near. Break its cage with your pick!', key: 'spawner', cd: 60 }); }
    }
  }
  breakSpawner(s, out) {
    const sp = s.sp, R = this.R;
    s.broken = true;
    this.save.spawners[s.i] = 1;
    s.fl.visible = false;
    const B = this.cageBox(sp), w = R.w;
    for (let z = B[2]; z <= B[5]; z++) for (let y = B[1]; y <= B[4]; y++) for (let x = B[0]; x <= B[3]; x++) if (w.voxelAt(x, y, z) === RM.SPAWNER) w.setVoxel(x, y, z, 0);
    R.sfx.smash();
    R.owner?.shake?.(0.25);
    const p = s.pos;
    R.fx.sparks(p.x, p.y, p.z, 24, this.P.theme === 'deep' ? [1, 0.5, 0.2] : [0.7, 0.5, 1], [0, 1, 0], 3);
    R.fx.dust(p.x, p.y, p.z, 14, [0.3, 0.28, 0.32], 0.4);
    out.push({ say: '<b>Spawner smashed!</b> Nothing more will crawl out of that one.', key: 'smash' + this.id, tone: 'good', cd: 1 });
    out.push({ act: { type: 'spawner', id: this.id, kind: this.kind, zone: this.zone } });
  }

  // ------------------------------------------------------------ the stone guardians (Starfolk vaults)
  guardians(eye, out) {
    if (this.guarded || !this.P.guards.length || !this.inBox(this.mainBox, eye, -0.5)) return;
    const en = this.R.owner?.enemies;
    if (!en || en.autoSpawn === false || en.peace) return;
    this.guarded = true;
    let n = 0;
    for (const g of this.P.guards) {
      const p = this.wp(g.a, 0, g.b);
      try { n += (en.spawnGroup([g.kind], p.x, p.y + 0.1, p.z, this.zone, { hidden: false, r: 1.5 }) || []).length; } catch (e) { /* no room */ }
    }
    if (n) { this.R.owner?.shake?.(0.3); out.push({ say: 'Stone grinds on stone: the vault\'s <b>guardians</b> wake.', key: 'guard' + this.id, tone: 'warn', cd: 30 }); }
  }

  // ------------------------------------------------------------ the dart trap
  updateTrap(tr, dt, out) {
    const pl = this.R.player;
    tr.cool -= dt;
    const on = pl && Math.abs(pl.pos.x - tr.c.x) < 0.24 && Math.abs(pl.pos.z - tr.c.z) < 0.24 && pl.pos.y > tr.c.y - 0.15 && pl.pos.y < tr.c.y + 0.2;
    tr.k += ((on ? 1 : 0) - tr.k) * Math.min(1, dt * 16);
    tr.plate.position.y = tr.c.y - tr.k * 0.03;
    if (!on || tr.cool > 0) return;
    tr.cool = 3;
    this.R.sfx.trap();
    if (!tr.warned) { tr.warned = true; out.push({ say: 'Click. Something in the wall clicks back...', key: 'trap', cd: 20 }); }
    const t = tr.t, f = t.from;
    this.R.later(0.14, () => {
      if (!this.built) return;
      this.R.sfx.darts();
      const dir = new THREE.Vector3(t.dir[0] * this.L.F[0] + t.dir[1] * this.L.Rv[0], 0, t.dir[0] * this.L.F[1] + t.dir[1] * this.L.Rv[1]).normalize();
      for (let k = 0; k < 3; k++) {
        const p = this.wp(f.a - 1.5 + k * 1.5, f.y + (k === 1 ? 0.6 : 0), f.b + (t.dir[1] < 0 ? -0.4 : 0.4));
        const g = MD.dart();
        const m = new THREE.Mesh(g, this.R.mat);
        this.geos.push(g);
        m.position.copy(p);
        m.lookAt(p.clone().add(dir));
        this.group.add(m);
        const hit = this.R.w.raycast(p.x, p.y, p.z, dir.x, 0, dir.z, 8);
        this.darts.push({ m, dir, v: 13 + k, left: hit ? hit.dist - 0.05 : 8, stuck: 0, hurt: k === 0 });
      }
    });
  }
  updateDarts(dt, out) {
    const pl = this.R.player;
    for (let i = this.darts.length - 1; i >= 0; i--) {
      const d = this.darts[i];
      if (d.stuck > 0) { d.stuck -= dt; if (d.stuck <= 0) { this.group.remove(d.m); this.darts.splice(i, 1); } continue; }
      const step = Math.min(d.left, d.v * dt);
      d.m.position.addScaledVector(d.dir, step);
      d.left -= step;
      if (pl && d.hurt) {
        const q = d.m.position, bx = pl.pos.x - q.x, bz = pl.pos.z - q.z, by = pl.pos.y + 0.45 - q.y;
        if (bx * bx + bz * bz < 0.3 * 0.3 && Math.abs(by) < 0.5) {
          d.hurt = false;
          out.push({ damage: 3 + this.zone * 1.6, kind: 'dart', push: [d.dir.x * 1.6, 0.4, d.dir.z * 1.6] });
          out.push({ say: 'Ow! <b>Darts</b>. Mind the pressure plates.', key: 'darthit', cd: 12 });
          this.group.remove(d.m); this.darts.splice(i, 1);
          continue;
        }
      }
      if (d.left <= 0) d.stuck = 4;
    }
  }

  // ------------------------------------------------------------ the lost miner
  searchRemains(i) {
    const R = this.R, st = R.st, lore = R.owner?.game?.lore;
    const first = !this.save.remains[i];
    this.save.remains[i] = 1;
    // Hobb's journal pages were tucked in the tools left at cave-ins; now the lost miners carry them
    st?.emit?.('act', { type: 'look', at: 'cavein' });
    const out = [];
    if (first) {
      const g = 12 + this.zone * 18;
      st?.addGold?.(g, 'remains');
      R.sfx.coins(2);
      out.push({ say: `Under the bones, a purse: <b>+${g} gold</b>. Whoever this was came looking for the same thing you are.`, key: 'remains', tone: 'good', cd: 0 });
    }
    if (lore) {
      const e = lore.readJournal(`dungeon:${this.id}:${i}`);
      lore.show(e, { kind: 'journal' });
    } else if (!first) out.push({ say: 'Just bones, a snapped pick and an empty satchel.', key: 'remains2', cd: 3 });
    return out.length ? out : [{ handled: true }];
  }

  // ------------------------------------------------------------ progress runes, eyes
  /** Light the first n pairs of door runes (the rest go dark). */
  setRunes(n) {
    const lit = this.P.theme === 'deep' ? M.RUNE_R : M.RUNE;
    const list = this.P.doorRunes || [];
    list.forEach((r, i) => {
      const on = Math.floor(i / 2) < n;
      for (let y = r.y0; y < r.y1; y++) for (let b = r.b0; b < r.b1; b++) {
        const m = this.vox(r.a, y, b);
        if (m !== M.RUNE && m !== M.RUNE_R && m !== M.RUNEOFF) continue;
        const want = on ? lit : M.RUNEOFF;
        if (m !== want) this.setVox(r.a, y, b, want);
      }
    });
  }
  lightEyes() {
    for (const e of this.P.eyes || []) if (this.vox(e.a, e.y, e.b) === M.RUNEOFF) this.setVox(e.a, e.y, e.b, this.P.theme === 'deep' ? M.RUNE_R : M.RUNE);
  }
  runePos(i) {
    const r = this.P.doorRunes?.[i];
    if (!r) return this.wp(this.P.door.a0, 10, 0);
    return this.wp(r.a + 0.5, (r.y0 + r.y1) / 2, (r.b0 + r.b1) / 2);
  }

  // ------------------------------------------------------------ the door
  doorShape(a, y, b) {
    const D = this.P.door, cb = b + 0.5;
    if (!D || a < D.a0 || a >= D.a1 || y < D.y0 || y >= D.y1) return false;
    if (this.P.round) return Math.hypot(y + 0.5 - this.P.DY, cb) < this.P.DR + 1;
    const DW = this.P.DW, DH = this.P.DH, yy = y - D.y0;
    return Math.abs(cb) < DW && yy >= 0 && (yy < DH || (yy - DH) ** 2 + cb * cb < DW * DW);
  }
  /** The door's voxels still standing (world coords + material). */
  doorVoxels() {
    const D = this.P.door, out = [];
    if (!D) return out;
    for (let a = D.a0; a < D.a1; a++) for (let y = D.y0; y < D.y1; y++) for (let b = D.b0; b < D.b1; b++) {
      if (!this.doorShape(a, y, b)) continue;
      const m = this.vox(a, y, b);
      if (m === M.WARD || m === M.BEDROCK) out.push({ a, y, b, m, w: toWorldVox(this.L, a, y, b) });
    }
    return out;
  }
  /** True when the crosshair's voxel is part of this dungeon's sealed door. */
  isDoorVoxel(vx, vy, vz) {
    const loc = toLocal(this.L, vx, vy, vz, [0, 0, 0]);
    return this.doorShape(loc[0], loc[1], loc[2]);
  }
  removeDoor(animate = true) {
    const vox = this.doorVoxels();
    if (!vox.length) return;
    if (animate) this.doorReplica(vox);
    for (const v of vox) this.R.w.setVoxel(v.w[0], v.w[1], v.w[2], 0);
  }
  /** A stand-in for the seal that sinks into the floor. */
  doorReplica(vox) {
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const v of vox) { const [x, y, z] = v.w; x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z); }
    const g = new Vox(0, x1 - x0 + 1, 0, y1 - y0 + 1, 0, z1 - z0 + 1);
    const T = MAT[M.WARD].tones, A = MAT[M.WARD].accent;
    for (const v of vox) {
      const [x, y, z] = v.w, hh = h3(x, y, z, 7);
      g.set(x - x0, y - y0, z - z0, v.m === M.BEDROCK ? 0x1c181a : hh < 0.08 ? A : T[(hh * 4) | 0] ?? T[1]);
    }
    const cx = (x1 - x0 + 1) / 2, cy = (y1 - y0 + 1) / 2, cz = (z1 - z0 + 1) / 2;
    const geo = g.geometry(false, [cx, cy, cz]);
    geo.scale(1 / VOX, 1 / VOX, 1 / VOX);
    const m = new THREE.Mesh(geo, this.R.wardMat);
    m.position.set((x0 + cx) / VOX, (y0 + cy) / VOX, (z0 + cz) / VOX);
    m.layers.enable(LAYER_OUTLINE);
    this.group.add(m);
    this.geos.push(geo);
    const start = m.position.clone(), H = (y1 - y0 + 1) / VOX;
    const fx = this.R.fx, base = this.wp(this.P.door.a0, this.P.door.y0, 0);
    this.anim(2.6, (k, dt) => {
      const e = ease(k);
      m.position.set(start.x + (Math.random() - 0.5) * 0.01 * (1 - k), start.y - e * (H + 0.05), start.z + (Math.random() - 0.5) * 0.01 * (1 - k));
      if (Math.random() < dt * 30) fx.dust(base.x + (Math.random() - 0.5) * 1.1, base.y + 0.05 + Math.random() * 0.3, base.z + (Math.random() - 0.5) * 1.1, 3, [0.55, 0.48, 0.42], 0.25);
      if (Math.random() < dt * 4) this.R.fx.dust(start.x, start.y + H * 0.5 + 0.3, start.z, 2, [0.5, 0.45, 0.4], 0.5);
    }, () => { this.group?.remove(m); });
  }

  /** The puzzle is done: the seal gives. */
  solve(out) {
    if (this.save.open || !this.P.door) return;
    this.save.open = 1;
    this.save.solved = 1;
    this.R.sfx.solved();
    setTimeout(() => this.R.sfx.open(), 450);
    this.R.owner?.shake?.(0.55);
    this.setRunes(99);
    this.lightEyes();
    this.removeDoor(!!this.group);
    for (const b of this.braziers || []) { b.fl.visible = true; this.R.fx.sparks(b.pos.x, b.pos.y, b.pos.z, 14, [1, 0.7, 0.3], [0, 1, 0], 2.5); }
    this.R.sfx.ignite();
    // dust shaken down from the ceiling all over the room
    const c = this.center;
    for (let i = 0; i < 16; i++) this.R.fx.dust(c.x + (Math.random() - 0.5) * 4, c.y + 1.6 + Math.random() * 0.6, c.z + (Math.random() - 0.5) * 4, 3, [0.5, 0.45, 0.4], 0.3);
    out.push({ say: `<b>The seal gives!</b> Somewhere in the ${this.name.toLowerCase()} stone grinds on stone.`, key: 'open' + this.id, tone: 'good', cd: 1 });
    out.push({ act: { type: 'puzzle', id: this.id, kind: this.L.puzzle, ruin: this.kind, zone: this.zone } });
  }

  // ------------------------------------------------------------ treasure
  openChest() {
    const out = [], st = this.R.st, S = this.save;
    if (!S.open) return [{ say: 'Locked in the dark behind the seal.', cd: 2 }];
    if (S.chest) return [{ say: 'The chest is empty. Only dust and the smell of old gold.', key: 'chestE', cd: 3 }];
    S.chest = 1;
    S.gemsLeft = [];
    const zr = Math.max(1, Math.min(6, this.zone));
    const gold = Math.round(CHEST_GOLD[zr] * (0.85 + h3(this.L.seed, 1, 2, 3) * 0.35));
    st.addGold(gold, 'ruin');
    this.R.sfx.lid();
    this.R.sfx.coins(8);
    this.R.sfx.fanfare();
    if (this.chest) { const pv = this.chest.pivot; this.anim(0.9, (k) => { pv.rotation.x = -1.9 * ease(k) - Math.sin(k * Math.PI) * 0.1; }); }
    const p = this.chestPos || this.center;
    for (let i = 0; i < 26; i++) this.R.fx.spawn({ x: p.x, y: p.y + 0.1, z: p.z, vx: (Math.random() - 0.5) * 1.6, vy: 1.6 + Math.random() * 2.2, vz: (Math.random() - 0.5) * 1.6, life: 1.1 + Math.random() * 0.6, size: 0.025, color: [1, 0.82, 0.3], glow: true, grav: 6, bounce: 0.4, drag: 0.4 });
    for (let i = 0; i < 10; i++) this.R.fx.glints(p.x + (Math.random() - 0.5) * 0.5, p.y + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 0.5, [1, 0.9, 0.5]);
    out.push({ say: `<b>+${gold.toLocaleString()} gold</b> from the strongroom's chest!`, key: 'chestG', tone: 'good', cd: 0 });
    // the zone's gems and the dungeon's relic go to the backpack the usual way (what doesn't fit
    // goes to the trunk at home); the relic is recorded in the Index
    (GEMS[zr] || []).filter((id) => ITEMS[id]).forEach((id, i) => out.push({ loot: { id, q: 86 + Math.round(h3(this.L.seed, i, 5, 7) * 14), p: true } }));
    const rid = this.relic;
    if (rid && ITEMS[rid]) {
      out.push({ loot: { id: rid } });
      st.discover('relic', rid);
      out.push({ say: `<b>${ITEMS[rid].name}</b> · a relic of the Starfolk.`, key: 'relic', tone: 'good', cd: 0 });
      out.push({ act: { type: 'relic', id: rid, ruin: this.id } });
    }
    return out;
  }

  /** A dungeon chest: some gold and a few useful things for the depth. */
  openLoot(i) {
    const S = this.save, st = this.R.st, out = [];
    if (S.loot[i]) return [{ say: 'Empty. Cobwebs and a mouse\'s nest.', key: 'lootE', cd: 3 }];
    S.loot[i] = 1;
    const zr = Math.max(1, Math.min(6, this.zone)), seed = this.L.seed + i * 977;
    const gold = Math.round(LOOT_GOLD[zr] * (0.7 + h3(seed, 1, 2, 3) * 0.6));
    st.addGold(gold, 'dungeon');
    this.R.sfx.lid();
    this.R.sfx.coins(4);
    const ch = this.loot[i];
    if (ch) { const pv = ch.pivot; this.anim(0.7, (k) => { pv.rotation.x = -1.9 * ease(k); }); const p = ch.pos; for (let k = 0; k < 6; k++) this.R.fx.glints(p.x + (Math.random() - 0.5) * 0.3, p.y + Math.random() * 0.2, p.z + (Math.random() - 0.5) * 0.3, [1, 0.9, 0.6]); }
    out.push({ say: `A dungeon chest: <b>+${gold} gold</b>`, key: 'lootG', tone: 'good', cd: 0 });
    const table = (LOOT[zr] || LOOT[1]).filter(([id]) => ITEMS[id]);
    const n = 2 + Math.floor(h3(seed, 2, 3, 4) * 2);
    for (let k = 0; k < n && table.length; k++) {
      let r = h3(seed, k, 7, 9) * table.reduce((s, e) => s + e[1], 0), id = table[0][0];
      for (const [tid, w] of table) { r -= w; if (r <= 0) { id = tid; break; } }
      const it = ITEMS[id];
      const cnt = it.cat === 'block' || it.cat === 'consumable' ? 2 + Math.floor(h3(seed, k, 8, 1) * 3) : 1;
      for (let c = 0; c < cnt; c++) out.push({ loot: { id, q: 70 + Math.round(h3(seed, k, c, 5) * 28) } });
    }
    return out;
  }

  pollHoard(dt, out) {
    this.hoardT = (this.hoardT || 0) - dt;
    if (this.hoardT > 0) return;
    this.hoardT = 0.3;
    const P = this.P, rm = P.room;
    let n = 0;
    for (const hd of P.hoards) {
      const r = Math.ceil(hd.r) + 1;
      for (let a = Math.floor(hd.a - r); a <= hd.a + r; a++) for (let b = Math.floor(hd.b - r); b <= hd.b + r; b++) for (let y = rm.y0; y < rm.y0 + hd.h + 3; y++) if (this.vox(a, y, b) === M.HOARD) n++;
    }
    if (this.hoardBase === undefined || this.hoardBase === null) { this.hoardBase = n; return; }
    if (n < this.hoardBase) {
      const dug = this.hoardBase - n;
      this.hoardBase = n;
      const g = Math.max(1, Math.round(dug * HOARD_GOLD[Math.max(1, Math.min(6, this.zone))]));
      this.R.st.addGold(g, 'hoard');
      this.R.sfx.coins(Math.min(8, 2 + (dug >> 3)));
      const ui = this.R.ui, w = window.innerWidth || 800, h = window.innerHeight || 600;
      ui?.floatText?.(`+${g}g`, w / 2 + (Math.random() - 0.5) * 40, h / 2 - 30, '#ffd860', 1);
      const e = this.R.player?.eye?.();
      if (e) { const f = this.R.player.forward(); for (let i = 0; i < 4; i++) this.R.fx.glints(e.x + f.x * 1.2, e.y + f.y * 1.2 + (Math.random() - 0.5) * 0.2, e.z + f.z * 1.2, [1, 0.85, 0.4]); }
    } else if (n > this.hoardBase) this.hoardBase = n;
  }
}
