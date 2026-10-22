// One ruin at play time: its props (built while the mole is near), its puzzle, the progress runes
// on the door frame, the seal opening (the door's voxels go, a replica sinks into the floor or
// rolls into the wall in a cloud of dust), the braziers that light when it opens, the treasure
// room's chest, and the hoard you can dig for gold. State: state.data.deep.ruins[id].
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { VOX, M, MAT } from '../materials.js';
import { Vox, h3 } from '../../gfx/char/vox.js';
import { ruinLayout } from '../gen/ruins.js';
import { toWorld, toWorldVox, toLocal, yawOf } from './common.js';
import * as MD from './models.js';
import { PUZZLES } from './puzzles.js';
import { RELIC_IDS } from './relics.js';
import { ITEMS } from '../../data/items.js';

export const NAMES = { hall: 'Pillared Hall', shrine: 'Star Shrine', vault: 'Sealed Vault', well: 'Drowned Well' };
const BLURB = {
  hall: 'a long hall of the old ones, half fallen in. Its far door is sealed.',
  shrine: 'an old shrine; the idol watches the door. It is sealed.',
  vault: 'a vault behind a great round seal. Something holds it shut.',
  well: 'an old well going down into black water.',
};
const CHEST_GOLD = [0, 260, 720, 1600, 3600, 7200, 12500];
const HOARD_GOLD = [0, 0.6, 1.4, 3, 6, 10, 16]; // per voxel of hoard dug
const GEMS = [null, ['quartz', 'quartz', 'amber'], ['amber', 'amethyst', 'quartz'], ['amethyst', 'echo_crystal', 'amethyst'], ['ruby', 'emerald', 'ruby'], ['sapphire', 'emerald', 'diamond'], ['diamond', 'sunstone', 'voidstone']];
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

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
    this.name = NAMES[this.kind];
    this.relic = RELIC_IDS[index % RELIC_IDS.length];
    this.save = R.save[this.id] ||= {};
    this.built = false;
    this.els = [];
    this.anims = [];
    this.lightsOut = [];
    // world-space extents for distance checks
    this.bb = f.bb;
    this.center = toWorld(this.L, 0, 0, 0);
    const rm = this.P.room;
    this.roomBox = this.boxWorld(rm.a0, rm.a1, rm.y0, rm.y1, rm.b0, rm.b1);
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
  anim(dur, fn, done) { this.anims.push({ t: 0, dur, fn, done }); }

  // ------------------------------------------------------------ build / drop
  build() {
    if (this.built) return;
    this.built = true;
    this.group = new THREE.Group();
    this.group.name = 'ruin-' + this.id;
    this.R.root.add(this.group);
    this.geos = [];
    this.els = [];
    this.anims = [];
    const P = this.P;
    // braziers flanking the door, lit once it opens
    this.braziers = (P.braziers || []).map((b) => {
      const y = b.y ?? 0;
      const m = this.put(MD.brazier(), b.a, y, b.b);
      const fl = this.put(MD.flameGeo(), b.a, y + 10.6, b.b, [1, 0], this.R.flameMat);
      fl.layers.disable(LAYER_OUTLINE);
      fl.visible = !!this.save.open;
      return { m, fl, pos: this.wp(b.a, y + 12, b.b), t: Math.random() * 6 };
    });
    // treasure: the chest, gold trinkets about it
    const C = P.chest;
    const chestY = C.y;
    this.chest = { body: this.put(MD.chestBody(), C.a, chestY, C.b, C.face), lid: null };
    const lidBase = this.pivot(C.a - C.face[0] * 7 / 2, chestY + 12 / 2, C.b - C.face[1] * 7 / 2, C.face);
    const lidPivot = new THREE.Group();
    lidBase.add(lidPivot);
    this.chest.lid = new THREE.Mesh(MD.chestLid(), this.R.mat);
    this.chest.lid.layers.enable(LAYER_OUTLINE);
    this.geos.push(this.chest.lid.geometry);
    lidPivot.add(this.chest.lid);
    this.chest.pivot = lidPivot;
    if (this.save.chest) lidPivot.rotation.x = -1.9;
    this.chestPos = this.wp(C.a, chestY + 7, C.b);
    this.el(this.chestPos, 0.42, () => (this.save.chest ? 'Empty chest' : 'Open the chest'), () => this.openChest());
    const tr = ['goblet', 'crown', 'idol', 'goblet'];
    const side = [C.face[1], -C.face[0]];
    [[-14, 4], [13, -3], [-9, -7], [10, 6]].forEach(([s, f], i) => {
      this.put(MD.trinket(tr[i]), C.a + side[0] * s - C.face[0] * f, chestY, C.b + side[1] * s - C.face[1] * f, [Math.cos(i * 2.1), Math.sin(i * 2.1)]);
    });
    // the puzzle
    const Pz = PUZZLES[this.L.puzzle];
    this.puzzle = Pz ? new Pz(this) : null;
    this.puzzle?.build();
    this.synced = false;
    this.sync();
  }

  /** Bring the voxels in line with the save (the door, the runes, the eyes) once they are loaded. */
  sync() {
    const D = this.P.door;
    const [vx, vy, vz] = toWorldVox(this.L, D.a0, D.y0 + 4, Math.floor((D.b0 + D.b1) / 2));
    const ch = this.R.w.chunk(vx >> 5, vy >> 5, vz >> 5);
    if (!ch || !ch.vox || ch.pending) return false;
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
    const c = this.center;
    if (!this.save.seen && Math.hypot(c.x - eye.x, c.z - eye.z) < this.L.R / VOX + 1 && Math.abs(eye.y - c.y - 1) < 3) {
      this.save.seen = 1;
      out.push({ say: `<b>${this.name}</b> · ${BLURB[this.kind]}`, key: 'ruin' + this.id, tone: 'good', cd: 999 });
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
    // the hoard: dig it and the gold goes in your pouch
    if (this.save.open && this.inBox(this.roomBox, eye, 1.5)) this.pollHoard(dt, out);
  }

  /** Lights near the eye: lit braziers, the open treasure room's glow, the puzzle's own. */
  lights(eye, list) {
    if (!this.built) return;
    for (const b of this.braziers) if (b.fl.visible) list.push({ x: b.pos.x, y: b.pos.y + 0.15, z: b.pos.z, c: [1.25, 0.72, 0.32], r: 5.5, lantern: true });
    if (this.save.open) {
      const c = this.wp((this.P.room.a0 + this.P.room.a1) / 2, (this.P.room.y0 + this.P.room.y1) / 2, 0);
      list.push({ x: c.x, y: c.y, z: c.z, c: [0.9, 0.62, 0.22], r: 5 });
    }
    this.puzzle?.lights?.(eye, list);
  }

  // ------------------------------------------------------------ progress runes, eyes
  /** Light the first n pairs of door runes (the rest go dark). */
  setRunes(n) {
    const lit = this.zone === 4 ? M.RUNE_R : M.RUNE;
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
    for (const e of this.P.eyes || []) if (this.vox(e.a, e.y, e.b) === M.RUNEOFF) this.setVox(e.a, e.y, e.b, this.zone === 4 ? M.RUNE_R : M.RUNE);
  }
  runePos(i) {
    const r = this.P.doorRunes?.[i];
    if (!r) return this.wp(this.P.door.a0, 10, 0);
    return this.wp(r.a + 0.5, (r.y0 + r.y1) / 2, (r.b0 + r.b1) / 2);
  }

  // ------------------------------------------------------------ the door
  doorShape(a, y, b) {
    const D = this.P.door, cb = b + 0.5;
    if (a < D.a0 || a >= D.a1 || y < D.y0 || y >= D.y1) return false;
    if (this.kind === 'vault') return Math.hypot(y + 0.5 - this.P.DY, cb) < this.P.DR + 1;
    const DW = this.P.DW, DH = this.P.DH, yy = y - D.y0;
    return Math.abs(cb) < DW && yy >= 0 && (yy < DH || (yy - DH) ** 2 + cb * cb < DW * DW);
  }
  /** The door's voxels still standing (world coords + material). */
  doorVoxels() {
    const D = this.P.door, out = [];
    for (let a = D.a0; a < D.a1; a++) for (let y = D.y0; y < D.y1; y++) for (let b = D.b0; b < D.b1; b++) {
      if (!this.doorShape(a, y, b)) continue;
      const m = this.vox(a, y, b);
      if (m === M.WARD || m === M.BEDROCK) out.push({ a, y, b, m, w: toWorldVox(this.L, a, y, b) });
    }
    return out;
  }
  /** True when the crosshair's voxel is part of this ruin's sealed door. */
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
  /** A stand-in for the seal that sinks into the floor (or, the vault's disc, rolls into the wall). */
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
    const roll = this.kind === 'vault';
    const side = roll ? this.wp(0, 0, 1).sub(this.wp(0, 0, 0)).normalize() : null;
    const axis = roll ? this.wp(1, 0, 0).sub(this.wp(0, 0, 0)).normalize() : null;
    const dist = roll ? (this.P.DR * 2 + 3) / VOX : H + 0.05;
    const fx = this.R.fx, base = this.wp(this.P.door.a0, this.P.door.y0, 0);
    this.anim(roll ? 3 : 2.6, (k, dt) => {
      const e = ease(k);
      if (roll) { m.position.copy(start).addScaledVector(side, e * dist); m.setRotationFromAxisAngle(axis, -e * dist / (this.P.DR / VOX)); }
      else m.position.set(start.x + (Math.random() - 0.5) * 0.01 * (1 - k), start.y - e * dist, start.z + (Math.random() - 0.5) * 0.01 * (1 - k));
      if (Math.random() < dt * 30) fx.dust(base.x + (Math.random() - 0.5) * 1.1, base.y + 0.05 + Math.random() * 0.3, base.z + (Math.random() - 0.5) * 1.1, 3, [0.55, 0.48, 0.42], 0.25);
      if (Math.random() < dt * 4) this.R.fx.dust(start.x, start.y + H * 0.5 + 0.3, start.z, 2, [0.5, 0.45, 0.4], 0.5);
    }, () => { this.group?.remove(m); });
  }

  /** The puzzle is done: the seal gives. */
  solve(out) {
    if (this.save.open) return;
    this.save.open = 1;
    this.save.solved = 1;
    this.R.sfx.solved();
    setTimeout(() => this.R.sfx.open(), 450);
    this.R.owner?.shake?.(0.55);
    this.setRunes(99);
    this.lightEyes();
    this.removeDoor(true);
    for (const b of this.braziers || []) { b.fl.visible = true; this.R.fx.sparks(b.pos.x, b.pos.y, b.pos.z, 14, [1, 0.7, 0.3], [0, 1, 0], 2.5); }
    this.R.sfx.ignite();
    // dust shaken down from the ceiling all over the room
    const c = this.center;
    for (let i = 0; i < 16; i++) this.R.fx.dust(c.x + (Math.random() - 0.5) * this.L.R / 8, c.y + this.L.H / VOX * (0.6 + Math.random() * 0.3), c.z + (Math.random() - 0.5) * this.L.R / 8, 3, [0.5, 0.45, 0.4], 0.3);
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
    const pv = this.chest.pivot;
    this.anim(0.9, (k) => { pv.rotation.x = -1.9 * ease(k) - Math.sin(k * Math.PI) * 0.1; });
    const p = this.chestPos;
    for (let i = 0; i < 26; i++) this.R.fx.spawn({ x: p.x, y: p.y + 0.1, z: p.z, vx: (Math.random() - 0.5) * 1.6, vy: 1.6 + Math.random() * 2.2, vz: (Math.random() - 0.5) * 1.6, life: 1.1 + Math.random() * 0.6, size: 0.025, color: [1, 0.82, 0.3], glow: true, grav: 6, bounce: 0.4, drag: 0.4 });
    for (let i = 0; i < 10; i++) this.R.fx.glints(p.x + (Math.random() - 0.5) * 0.5, p.y + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 0.5, [1, 0.9, 0.5]);
    out.push({ say: `<b>+${gold.toLocaleString()} gold</b> from the old ones' chest!`, key: 'chestG', tone: 'good', cd: 0 });
    // the zone's gems and the ruin's relic go to the backpack the usual way (what doesn't fit
    // goes to the trunk at home); the relic is recorded in the Index
    (GEMS[zr] || []).filter((id) => ITEMS[id]).forEach((id, i) => out.push({ loot: { id, q: 86 + Math.round(h3(this.L.seed, i, 5, 7) * 14), p: true } }));
    const rid = this.relic;
    if (ITEMS[rid]) {
      out.push({ loot: { id: rid } });
      st.discover('relic', rid);
      out.push({ say: `<b>${ITEMS[rid].name}</b> · a relic of the old ones.`, key: 'relic', tone: 'good', cd: 0 });
      out.push({ act: { type: 'relic', id: rid, ruin: this.id } });
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
