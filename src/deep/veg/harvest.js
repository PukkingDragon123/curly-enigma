// The wild larder: ingredients aren't handed out, you go and gather them. Every cave plant and
// mushroom (the instanced vegetation, ../Vegetation.js) can be plucked with E (or the use button):
// it squashes down, springs up, pops, and a stub is left that grows back (a night's sleep, or a few
// minutes). The find pops out as a little voxel copy of itself and hops into the backpack (the
// mine's Bodies pickups). Among the plants grow larger finds (./harvestVox.js models): crystal
// salt outcrops you knock salt off (E, or a pick blow), wild honeycomb on the rock, ground nests
// of eggs, berry bushes, puffball spore pods and bundles of fat roots. The burrow and Deep Town
// get a few patches of their own (HarvestPatches), so there's always something by home.
//
// Hooks (kept tiny in the owners):
//   Vegetation.build → harvest.onBuilt(veg, rec)   (a chunk's plants are in: stubs, sources)
//   Vegetation.drop  → harvest.onDrop(rec)
//   DigScene: harvest.update(dt, eye) · target(eye, f, near) → { label } · use(eye, f, near) → [events]
//             · strike(eye, f, reach, power) → [events] | null (a pick blow on a salt outcrop)
//   Home / town: new HarvestPatches(scene, spots, { tag })   (spots: [{ kind, x, y, z, yaw }])
// Saved: state.data.harvest = { key: { d: day, t: ms } } (what's been taken, until it grows back).
import * as THREE from 'three';
import { sourceGeo } from './harvestVox.js';
import { makeObjectMaterial } from '../TerrainMaterial.js';
import { voxelMaterial } from '../../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { ITEMS } from '../../data/items.js';
import { iconPixels } from '../../cooking/food.js';
import { RDROPS } from './grow.js'; // (wave 17) the random plants that can be gathered

// ---------------------------------------------------------------- what each plant gives
// kind → [item, rare item, rare chance]
export const DROPS = {
  grass: ['stone_thyme'], grassTall: ['stone_thyme', 'cave_garlic', 0.12], paleGrass: ['stone_thyme'], dryGrass: ['stone_thyme', 'cave_garlic', 0.1],
  mossGrass: ['glow_moss'], frostGrass: ['stone_thyme', 'frostbloom', 0.05], crystalGrass: ['glow_moss', 'crystal_lily', 0.05], ashGrass: ['pepperroot'],
  voidGrass: ['gloomshroom'], fungusGrass: ['mushroom'],
  clover: ['glow_moss'], cloverGlow: ['glow_moss'], lichenFrost: ['glow_moss'], lichenRust: ['glow_moss'], lichenCrystal: ['glow_moss', 'crystal_lily', 0.04], starMoss: ['glow_moss', 'sparkmoss', 0.15],
  fern: ['blindfern'], fernPale: ['blindfern'], giantFern: ['blindfern', 'whisperweed', 0.2], horsetail: ['blindfern'],
  fungusCyan: ['glowcap'], fungusViolet: ['gloomshroom'], fungusPink: ['bubblebulb'], fungusBlue: ['glowcap'], fungusAmber: ['mushroom'], fungusBrown: ['mushroom', 'truffle', 0.03],
  puffballs: ['spore_puff'], brownCap: ['mushroom', 'truffle', 0.02], toadstool: ['mushroom'], inkcap: ['mushroom'], glowShroom: ['glowcap'], mushTiny: ['mushroom'],
  emberCap: ['pepperroot', 'emberbloom', 0.15], frostCap: ['glowcap', 'frostbloom', 0.12],
  flowerCyan: ['sparkmoss'], flowerViolet: ['whisperweed'], flowerPink: ['crystal_lily', 'bubblebulb', 0.4], flowerEmber: ['emberbloom'], flowerFrost: ['frostbloom'],
  thorn: ['cave_berry'], stoneRose: ['stone_thyme'], ashWeed: ['ashfern'], voidTendril: ['gloomshroom'],
  roots: ['cave_carrot'], rootsShort: ['pepperroot'], vine: ['cave_berry'], vineBerry: ['cave_berry'], vineDino: ['cave_berry'], glowVine: ['sparkmoss'],
  mossDrape: ['glow_moss'], rootDrape: ['pepperroot'], mycel: ['gloomshroom'], mycelCyan: ['glowcap'], rime: ['frostbloom', null, 0], voidHang: ['gloomshroom'],
  wallFern: ['blindfern'], wallFernDino: ['blindfern'], wallGrass: ['stone_thyme'], wallMoss: ['glow_moss'], wallPale: ['stone_thyme'],
  wallFungus: ['mushroom'], wallMush: ['mushroom'], wallBrown: ['mushroom'],
  wallLichenRust: ['glow_moss'], wallLichenFrost: ['glow_moss'], wallLichenCrystal: ['glow_moss'], wallStar: ['glow_moss', 'sparkmoss', 0.15],
};
Object.assign(DROPS, RDROPS); // (wave 17) herbs, coral, mushroom clutches, moss, creepers, puffballs, cave grass
// the larger finds: what they give, how many knocks, their sound
export const SOURCES = {
  salt: { item: 'salt_crystal', hits: 3, n: 2, label: 'Rock Salt' },
  comb: { item: 'honey', hits: 1, n: 1, label: 'Honeycomb' },
  nest: { item: 'egg', hits: 1, n: 2, label: 'Nest' },
  bush: { item: 'cave_berry', hits: 1, n: 3, label: 'Berries' },
  spores: { item: 'spore_puff', hits: 1, n: 2, label: 'Spore Pod' },
  roots: { item: 'tunnel_tuber', hits: 1, n: 2, label: 'Roots' },
  glowcaps: { item: 'glowcap', hits: 1, n: 2, label: 'Glowcaps' },
  thyme: { item: 'stone_thyme', hits: 1, n: 2, label: 'Thyme' },
  nuts: { item: 'stone_nut', hits: 1, n: 2, label: 'Stone Nuts' },
};

const REGROW_MS = 7 * 60 * 1000; // a stub is whole again after this long (or the next day)
const SRC_CHANCE = 0.3; // a chunk with room grows one larger find this often
const R2 = (a) => Math.round(a * 20);
const keyOf = (p) => 'v' + R2(p.x) + ',' + R2(p.y) + ',' + R2(p.z);
const hash = (a, b, c) => { let h = (a * 374761393 + b * 668265263 + c * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const backOut = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _v = new THREE.Vector3();

// ---------------------------------------------------------------- saved state
const store = (st) => (st.data.harvest && typeof st.data.harvest === 'object' ? st.data.harvest : (st.data.harvest = {}));
/** Has this spot grown back (or never been taken)? Forgets spots that have. */
function ripe(st, key) {
  const S = store(st), e = S[key];
  if (!e) return true;
  if ((st.data.day || 1) > e.d || Date.now() - e.t > REGROW_MS) { delete S[key]; return true; }
  return false;
}
function taken(st, key) { store(st)[key] = { d: st.data.day || 1, t: Date.now() }; st.dirty = true; }
/** Quality of a find: a fair spread, nudged up by the forage skill. */
function qOf(st) { const k = Math.max(1, (typeof st.skill === 'function' && st.skill('forage')) || 1); return Math.round(clamp(58 + Math.random() * 30 + (k - 1) * 40, 30, 100)); }

/** Ray from e along unit f: distance along it to the closest approach to c, and how close (or null). */
function rayTo(e, f, c, maxT) {
  const dx = c.x - e.x, dy = c.y - e.y, dz = c.z - e.z;
  const t = dx * f.x + dy * f.y + dz * f.z;
  if (t < 0 || t > maxT) return null;
  const px = e.x + f.x * t - c.x, py = e.y + f.y * t - c.y, pz = e.z + f.z * t - c.z;
  return { t, d: Math.sqrt(px * px + py * py + pz * pz) };
}

// ---------------------------------------------------------------- the find hops out
/** A little voxel copy of the item (its icon grown 2 voxels deep) that hops out and flies into the bag. */
function popFind(owner, id, q, at, n = 1) {
  const bodies = owner.bodies;
  if (!bodies?.spawn) { for (let i = 0; i < n; i++) owner.collect?.({ id, q }); return; }
  let vox = null;
  try {
    const { W, H, px } = iconPixels(id);
    const list = [];
    let mx = 0, my = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = px[y * W + x]; if (c === null) continue; list.push([x, H - 1 - y, c]); mx += x; my += H - 1 - y; }
    mx = Math.round(mx / Math.max(1, list.length)); my = Math.round(my / Math.max(1, list.length));
    const bx = Math.round(at.x * 16), by = Math.round(at.y * 16), bz = Math.round(at.z * 16);
    vox = [];
    for (const [x, y, c] of list) for (let z = 0; z < 2; z++) vox.push({ x: bx + x - mx, y: by + y - my, z: bz + z, c });
  } catch (e) { vox = null; }
  for (let i = 0; i < n; i++) {
    const vel = [(Math.random() - 0.5) * 1.2, 2.2 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2];
    const b = vox && vox.length ? bodies.spawn(vox, { scale: 0.1, vel, pickup: { id, q, delay: 0.32 + i * 0.12 }, life: 5, bounce: 0.45 }) : null;
    if (!b) owner.collect?.({ id, q });
  }
}

/** A burst of tiny leaf / crystal voxels (the mine's particles). */
function burst(fx, x, y, z, col, n = 10, up = 1) {
  if (!fx?.spawn) return;
  const R = Math.random;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, sp = 0.5 + R() * 1.1;
    fx.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: (0.8 + R() * 1.4) * up, vz: Math.sin(a) * sp, life: 0.45 + R() * 0.45, size: R() < 0.5 ? 1 / 40 : 1 / 56, color: col, alpha: 1, drag: 1.8, grav: 6, fade: false });
  }
}

// ---------------------------------------------------------------- the mine
export class Harvest {
  /** owner: the DigScene (world, state, fx, bodies, audio, U, scene, collect). */
  constructor(owner) {
    this.o = owner;
    this.st = owner.state;
    this.veg = null;
    this.anims = []; // plants being plucked or growing back
    this.stubs = new Map(); // key → { rec, p } (cut plants in built chunks)
    this.src = new Map(); // chunk key → source | null (null: this chunk grows none)
    this.mat = makeObjectMaterial(owner.U, {});
    this.root = new THREE.Group();
    this.root.name = 'harvest';
    (owner.scene || owner.scene3).add(this.root);
    this.checkT = 0;
    this.eye = null;
    this.stats = { plucked: 0, sources: 0 };
    this.debug = {
      info: () => ({ sources: [...this.src.values()].filter(Boolean).length, stubs: this.stubs.size, ...this.stats }),
      /** Nearest harvestable things to the mole: [{ what, kind, x, y, z, d }]. */
      near: (r = 6) => this.near(r),
      /** Pluck / take the nearest one of a kind ('plant' | source kind) as if E were pressed on it. */
      take: (what = 'plant') => this.debugTake(what),
      /** Put a source of this kind right in front of the mole (for shots and tests). */
      place: (kind = 'salt', d = 1.1) => this.debugPlace(kind, d),
    };
  }

  /** Take over the vegetation (and the chunks it planted before we were here). */
  attach(veg) {
    this.veg = veg;
    veg.harvest = this;
    for (const rec of [...veg.built.values()]) if (rec.d) this.onBuilt(veg, rec);
  }

  // ------------------------------------------------------------ vegetation hooks
  /** A chunk's plants are in: cut the ones taken earlier, set its larger find. */
  onBuilt(veg, rec) {
    this.veg = veg;
    if (!rec.plants.length) return;
    const st = this.st;
    for (const p of rec.plants) {
      if (p.gone || !DROPS[p.kind]) continue;
      const k = keyOf(p);
      if (this.src.get(rec.key)?.spot === k) { veg.remove(rec, p, false); continue; } // a find stands here
      if (!ripe(st, k)) this.cut(rec, p, k);
    }
    if (!this.src.has(rec.key)) this.placeSource(veg, rec);
  }
  onDrop(rec) {
    const s = this.src.get(rec.key);
    if (s) { this.root.remove(s.mesh); }
    this.src.delete(rec.key);
    for (const [k, v] of this.stubs) if (v.rec === rec) this.stubs.delete(k);
    this.anims = this.anims.filter((a) => a.rec !== rec);
  }

  /** The boxes of plant p as they were built (kept the first time it's touched). */
  orig(rec, p) {
    if (p.orig) return p.orig;
    const a = p.q0 * 4, b = (p.q0 + p.nq) * 4;
    p.orig = { off: rec.d.off.slice(a, b), shape: rec.d.shape.slice(a, b) };
    let H = 1;
    for (let i = 0; i < p.nq; i++) H = Math.max(H, Math.abs(p.orig.off[i * 4 + 1]) + p.orig.shape[i * 4 + 1]);
    p.orig.H = H;
    return p.orig;
  }
  /** Rescale plant p's boxes about its root (kx across, ky along its growth), cut above `top` (voxels). */
  pose(rec, p, kx, ky, top = Infinity) {
    if (!rec.d || !rec.slot) return;
    const O = this.orig(rec, p), off = rec.d.off, sh = rec.d.shape;
    for (let i = 0; i < p.nq; i++) {
      const j = (p.q0 + i) * 4, k = i * 4;
      const oy = O.off[k + 1], sy = O.shape[k + 1];
      if (Math.abs(oy) >= top || !O.shape[k]) { sh[j] = sh[j + 1] = sh[j + 2] = 0; continue; }
      off[j] = clamp(Math.round(O.off[k] * kx), -127, 127);
      off[j + 1] = clamp(Math.round(oy * ky), -127, 127);
      off[j + 2] = clamp(Math.round(O.off[k + 2] * kx), -127, 127);
      sh[j] = clamp(Math.round(O.shape[k] * kx), 1, 255);
      sh[j + 1] = clamp(Math.round(Math.min(sy, top - Math.abs(oy)) * ky), 1, 255);
      sh[j + 2] = clamp(Math.round(O.shape[k + 2] * kx), 1, 255);
      sh[j + 3] = O.shape[k + 3];
    }
    this.write(rec, p);
  }
  write(rec, p) {
    const veg = this.veg;
    if (!veg || veg.built.get(rec.key) !== rec || !rec.slot) return;
    const A = veg.pool.geo.attributes, s = rec.slot.s + p.q0, n = p.nq, a = p.q0 * 4, b = (p.q0 + n) * 4;
    A.iOff.array.set(rec.d.off.subarray(a, b), s * 4); veg.pool.mark('iOff', s, n);
    A.iShape.array.set(rec.d.shape.subarray(a, b), s * 4); veg.pool.mark('iShape', s, n);
  }
  /** How much of a plucked plant stays (voxels up its stem): a flat one keeps just its footprint. */
  stubTop(rec, p) { const H = this.orig(rec, p).H; return H < 6 ? 0.5 : Math.max(2, Math.round(H * 0.24)); }
  cut(rec, p, k) {
    p.cut = true;
    this.pose(rec, p, 1, 1, this.stubTop(rec, p));
    this.stubs.set(k, { rec, p });
  }

  /** One larger find per lucky chunk, standing in for one of its plants (by what grows there). */
  placeSource(veg, rec) {
    const ch = rec.ch, h0 = hash(ch.cx, ch.cy, ch.cz + 913);
    if (h0 > SRC_CHANCE || rec.lod) { if (!rec.lod) this.src.set(rec.key, null); return; }
    const cands = rec.plants.filter((p) => !p.gone && DROPS[p.kind]);
    if (!cands.length) { this.src.set(rec.key, null); return; }
    const p = cands[Math.floor(hash(ch.cx + 7, ch.cy, ch.cz) * cands.length)];
    const k = p.kind, h1 = hash(ch.cx, ch.cy + 31, ch.cz);
    let kind;
    if (p.hang) kind = /root/.test(k) || h1 < 0.5 ? 'roots' : 'comb';
    else if (/^wall/.test(k)) kind = 'comb';
    else if (/puff|fungus|Shroom|mush|Cap|cap|ink/.test(k)) kind = h1 < 0.6 ? 'spores' : 'salt';
    else if (/grass|Grass|clover|litter/.test(k)) kind = h1 < 0.3 ? 'nest' : h1 < 0.55 ? 'nuts' : 'salt';
    else if (/fern|Fern|thorn|vine|horse/.test(k)) kind = h1 < 0.55 ? 'bush' : 'nuts'; // berries, or a nut bush
    else kind = 'salt';
    const s = { kind, spot: keyOf(p), key: 's' + ch.cx + ',' + ch.cy + ',' + ch.cz, x: p.x, y: p.y, z: p.z, hits: 0, hang: !!p.hang, seed: Math.floor(h1 * 4), anim: null };
    // a comb on a wall faces out of it; one under a roof hangs (a comb is built facing +z)
    s.yaw = hash(ch.cx, ch.cy, ch.cz + 5) * Math.PI * 2;
    if (kind === 'comb' && !p.hang) {
      const W = this.o.world;
      let best = 0, bd = -1;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; if (W.solidAt(p.x - Math.sin(a) * 0.15, p.y + 0.1, p.z - Math.cos(a) * 0.15)) { best = a; bd = i; break; } }
      s.yaw = bd >= 0 ? best : s.yaw;
    }
    veg.remove(rec, p, false);
    s.full = !ripe(this.st, s.key) ? false : true;
    this.makeMesh(s);
    this.src.set(rec.key, s);
    this.stats.sources++;
  }
  makeMesh(s) {
    const G = sourceGeo(s.kind, !s.full, s.seed);
    const m = s.mesh || new THREE.Mesh(G.geo, this.mat);
    m.geometry = G.geo;
    m.layers.enable(LAYER_OUTLINE);
    m.position.set(s.x, s.y + (s.hang ? 0.02 : -0.02), s.z);
    m.rotation.y = s.yaw;
    if (s.kind === 'comb' && s.hang) m.rotation.x = Math.PI / 2; // under a roof it hangs flat
    s.h = G.h; s.r = G.r;
    if (!s.mesh) { s.mesh = m; this.root.add(m); }
  }
  centerOf(s, out = _v) { return out.set(s.x, s.y + (s.hang ? -s.h * 0.5 : s.h * 0.45), s.z); }

  // ------------------------------------------------------------ aiming and using
  /** What's under the crosshair within `near` m: { kind: 'plant', rec, p, t } | { kind: 'src', s, t } | null. */
  pick(eye, f, near, small = true) {
    let best = null;
    for (const s of this.src.values()) {
      if (!s || !s.full) continue;
      const r = rayTo(eye, f, this.centerOf(s), near + 0.2);
      if (r && r.d < Math.max(0.14, s.r * 0.85) && (!best || r.t < best.t)) best = { kind: 'src', s, t: r.t };
    }
    const veg = this.veg;
    if (veg) {
      const c = new THREE.Vector3();
      for (const rec of veg.built.values()) {
        if (Math.hypot(rec.x - eye.x, rec.y - eye.y, rec.z - eye.z) > near + 2) continue;
        for (const p of rec.plants) {
          if (p.gone || p.cut || !DROPS[p.kind]) continue;
          if (!small && !p.hang && p.h < 0.14) continue; // (grass and moss underfoot don't steal the crosshair from the rock; E still picks them)
          c.set(p.x, p.y + (p.hang ? -p.h * 0.5 : p.h * 0.5), p.z);
          const r = rayTo(eye, f, c, near + 0.15);
          if (!r) continue;
          const rad = clamp(Math.min(p.rad * 0.85, p.h * 0.6 + 0.06), 0.08, 0.3);
          if (r.d < rad && (!best || r.t < best.t - 0.05)) best = { kind: 'plant', rec, p, t: r.t };
        }
      }
    }
    return best;
  }
  target(eye, f, near) {
    const h = this.pick(eye, f, near, false);
    if (!h) return null;
    if (h.kind === 'src') return { label: SOURCES[h.s.kind].label };
    return { label: ITEMS[DROPS[h.p.kind][0]]?.name || 'Pick' };
  }
  use(eye, f, near) {
    const h = this.pick(eye, f, near);
    if (!h) return null;
    if (h.kind === 'src') return this.takeSource(h.s, 'paw');
    this.pluck(h.rec, h.p);
    return [{ act: { type: 'pluck', kind: h.p.kind } }];
  }
  /** A pick blow: only a salt outcrop takes it (and only if it's nearer than the rock behind). */
  strike(eye, f, reach, power = 1) {
    const h = this.pick(eye, f, reach);
    if (!h || h.kind !== 'src' || h.s.kind !== 'salt') return null;
    return this.takeSource(h.s, 'pick', power);
  }

  /** Pluck a plant: squash, spring, pop; the stub stays; the find hops out. */
  pluck(rec, p) {
    const st = this.st, k = keyOf(p), [id, rare, rc] = DROPS[p.kind];
    const got = rare && Math.random() < (rc || 0) ? rare : id;
    p.cut = true;
    taken(st, k);
    this.stubs.set(k, { rec, p });
    this.anims.push({ rec, p, t: 0, kind: 'pluck', got, q: qOf(st), key: k });
    this.o.audio?.noise?.({ color: 'pink', filter: 'bandpass', f: 1800, f2: 900, q: 0.9, dur: 0.12, a: 0.005, vol: 0.12 });
    if (this.o.vm) this.o.vm.impact('none', 0.35);
    this.stats.plucked++;
  }

  takeSource(s, how, power = 1) {
    const S = SOURCES[s.kind], audio = this.o.audio, c = this.centerOf(s, new THREE.Vector3());
    s.hits += how === 'pick' ? 1 + Math.min(1, power * 0.5) : 1;
    if (s.kind === 'salt') {
      // each knock rings and chips off sparkling salt; the last one breaks a crystal free
      audio?.play('chisel', { vol: 0.5, pitch: 1.4 + Math.random() * 0.3 });
      audio?.play('clang', { pitch: 1.9, vol: 0.18 });
      burst(this.o.fx, c.x, c.y, c.z, [1, 0.93, 0.94], 7, 0.8);
      this.o.fx?.glints?.(c.x, c.y + 0.05, c.z, [1, 0.95, 0.95]);
      s.anim = { t: 0, kind: 'knock' };
      if (s.hits < S.hits) return [{ shake: 0.08 }];
      audio?.play('crack', { vol: 0.6 });
    } else if (s.kind === 'comb') { audio?.play('buzz', { vol: 0.25 }); audio?.play('slurp', { vol: 0.3, pitch: 1.3 }); }
    else if (s.kind === 'nest') { audio?.play('chirp', { vol: 0.3 }); }
    else if (s.kind === 'spores') { audio?.play('sneeze', { vol: 0.2, pitch: 1.6 }); burst(this.o.fx, c.x, c.y + 0.1, c.z, [0.7, 1, 0.8], 14, 0.6); }
    else audio?.noise?.({ color: 'pink', filter: 'bandpass', f: 1500, f2: 700, q: 0.8, dur: 0.16, a: 0.005, vol: 0.14 });
    s.hits = 0;
    s.full = false;
    taken(this.st, s.key);
    s.anim = { t: 0, kind: 'take', got: S.item, n: S.n, q: qOf(this.st) };
    return [{ shake: s.kind === 'salt' ? 0.14 : 0.04, act: { type: 'pluck', kind: s.kind } }];
  }

  // ------------------------------------------------------------ per frame
  update(dt, eye) {
    this.eye = eye;
    const fx = this.o.fx;
    for (const a of this.anims) {
      a.t += dt;
      const { rec, p } = a;
      if (a.kind === 'pluck') {
        // squash (0.11 s) → spring up thin (0.09 s) → pop: the stub stays, the rest bursts away
        const t = a.t;
        if (t < 0.11) { const k = t / 0.11; this.pose(rec, p, 1 + 0.35 * k, 1 - 0.5 * k); }
        else if (t < 0.2) { const k = (t - 0.11) / 0.09; this.pose(rec, p, 1.35 - 0.6 * k, 0.5 + 0.85 * k); }
        else if (!a.popped) {
          a.popped = true;
          this.pose(rec, p, 1, 1, this.stubTop(rec, p));
          const y = p.y + (p.hang ? -p.h * 0.6 : p.h * 0.6);
          burst(fx, p.x, y, p.z, p.col || [0.4, 0.7, 0.3], 12);
          this.o.audio?.play('bloop', { vol: 0.45, pitch: 1.5 + Math.random() * 0.3 });
          popFind(this.o, a.got, a.q, _v.set(p.x, y + 0.05, p.z));
        } else if (t < 0.42) { const k = (t - 0.2) / 0.22; this.pose(rec, p, 1 + Math.sin(k * Math.PI) * 0.25, 1 - Math.sin(k * Math.PI) * 0.3, this.stubTop(rec, p)); } // the stub wobbles
        else a.done = true;
      } else if (a.kind === 'grow') {
        // back up from the stub with a springy overshoot
        const k = clamp(a.t / 0.9, 0, 1), H = this.orig(rec, p).H;
        const top = this.stubTop(rec, p) + (H - this.stubTop(rec, p)) * clamp(k * 1.25, 0, 1) + 1;
        const s = backOut(k);
        this.pose(rec, p, 0.8 + 0.2 * s, 0.6 + 0.4 * s, top);
        if (k >= 1) { this.pose(rec, p, 1, 1); a.done = true; }
      }
    }
    if (this.anims.length) this.anims = this.anims.filter((a) => !a.done);
    // the larger finds: knocks wobble them, a take squashes, pops and leaves the stub
    for (const s of this.src.values()) {
      if (!s || !s.anim) continue;
      const A = s.anim, m = s.mesh;
      A.t += dt;
      if (A.kind === 'knock') {
        const k = A.t / 0.22, w = Math.sin(k * Math.PI) * 0.12;
        m.scale.set(1 + w, 1 - w, 1 + w);
        if (k >= 1) { m.scale.setScalar(1); s.anim = null; }
      } else if (A.kind === 'take') {
        const t = A.t;
        if (t < 0.1) { const k = t / 0.1; m.scale.set(1 + 0.25 * k, 1 - 0.35 * k, 1 + 0.25 * k); }
        else if (t < 0.18) { const k = (t - 0.1) / 0.08; m.scale.set(1.25 - 0.4 * k, 0.65 + 0.6 * k, 1.25 - 0.4 * k); }
        else if (!A.popped) {
          A.popped = true;
          this.makeMesh(s);
          const c = this.centerOf(s, new THREE.Vector3());
          burst(fx, c.x, c.y, c.z, s.kind === 'salt' ? [1, 0.9, 0.92] : s.kind === 'comb' ? [1, 0.7, 0.2] : s.kind === 'bush' ? [0.8, 0.15, 0.2] : s.kind === 'nuts' ? [0.55, 0.42, 0.28] : [0.6, 0.8, 0.4], 14);
          this.o.audio?.play('bloop', { vol: 0.5, pitch: 1.2 });
          popFind(this.o, A.got, A.q, c, A.n);
        } else { const k = clamp((t - 0.18) / 0.3, 0, 1), b = backOut(k); m.scale.set(0.7 + 0.3 * b, 0.5 + 0.5 * b, 0.7 + 0.3 * b); if (k >= 1) { m.scale.setScalar(1); s.anim = null; } }
      } else if (A.kind === 'grow') {
        const k = clamp(A.t / 0.8, 0, 1), b = backOut(k);
        m.scale.set(0.3 + 0.7 * b, 0.2 + 0.8 * b, 0.3 + 0.7 * b);
        if (k >= 1) { m.scale.setScalar(1); s.anim = null; }
      }
    }
    // now and then: has anything grown back? (it pops up with a bounce if the mole can see it)
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 2.5;
      const st = this.st;
      for (const [k, v] of this.stubs) {
        if (!ripe(st, k)) continue;
        this.stubs.delete(k);
        v.p.cut = false;
        this.anims.push({ rec: v.rec, p: v.p, t: 0, kind: 'grow' });
      }
      for (const s of this.src.values()) {
        if (!s || s.full || !ripe(st, s.key)) continue;
        s.full = true; s.hits = 0;
        this.makeMesh(s);
        s.anim = { t: 0, kind: 'grow' };
      }
    }
  }

  // ------------------------------------------------------------ debug
  near(r = 6) {
    const e = this.o.player?.eye?.() || this.eye;
    if (!e) return [];
    const out = [];
    for (const s of this.src.values()) if (s) { const d = Math.hypot(s.x - e.x, s.y - e.y, s.z - e.z); if (d < r) out.push({ what: 'src', kind: s.kind, full: s.full, x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), d: +d.toFixed(2) }); }
    if (this.veg) for (const rec of this.veg.built.values()) for (const p of rec.plants) {
      if (p.gone || p.cut || !DROPS[p.kind]) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
      if (d < r) out.push({ what: 'plant', kind: p.kind, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), d: +d.toFixed(2) });
    }
    return out.sort((a, b) => a.d - b.d);
  }
  debugTake(what) {
    const e = this.o.player?.eye?.();
    if (!e) return null;
    let best = null, bd = 1e9;
    if (what === 'plant') {
      for (const rec of this.veg?.built.values() || []) for (const p of rec.plants) { if (p.gone || p.cut || !DROPS[p.kind]) continue; const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z); if (d < bd) { bd = d; best = { rec, p }; } }
      if (!best) return null;
      this.pluck(best.rec, best.p);
      return { kind: best.p.kind, d: +bd.toFixed(2) };
    }
    for (const s of this.src.values()) { if (!s || !s.full || (what !== 'src' && s.kind !== what)) continue; const d = Math.hypot(s.x - e.x, s.y - e.y, s.z - e.z); if (d < bd) { bd = d; best = s; } }
    if (!best) return null;
    let r = null;
    for (let i = 0; i < 4 && best.full; i++) r = this.takeSource(best, 'paw');
    return { kind: best.kind, d: +bd.toFixed(2), r };
  }
  debugPlace(kind, d) {
    const pl = this.o.player, e = pl.eye(), f = pl.forward();
    const x = e.x + f.x * d, z = e.z + f.z * d;
    let y = pl.pos.y;
    for (let k = 0; k < 24 && !this.o.world.solidAt(x, y - 0.03, z); k++) y -= 1 / 16;
    const s = { kind, spot: '', key: 'dbg' + kind + Math.round(x * 10) + ',' + Math.round(z * 10), x, y, z, hits: 0, hang: false, seed: 1, yaw: Math.atan2(-f.x, -f.z), full: true, anim: null };
    if (kind === 'comb') { s.y = e.y - 0.25; s.yaw = Math.atan2(-f.x, -f.z) + Math.PI; }
    delete store(this.st)[s.key];
    this.makeMesh(s);
    this.src.set('dbg:' + kind + this.src.size, s);
    return { kind, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) };
  }

  dispose() { this.root.parent?.remove(this.root); this.mat.dispose?.(); this.src.clear(); this.stubs.clear(); this.anims = []; }
}

// ---------------------------------------------------------------- the burrow and Deep Town
/**
 * A few harvest patches in a first-person scene with an FPSRig (home, town): real voxel models on
 * the scene's toon lighting, each an interactable (E / tap) that pops a find into the backpack
 * and leaves its stub to grow back. spots: [{ kind (SOURCES key), x, y, z, yaw }]; o.tag names the
 * saved keys, o.add(item) registers an interactable (default scene.rig.add).
 */
export class HarvestPatches {
  constructor(scene, spots, o = {}) {
    this.s = scene;
    this.g = scene.game;
    this.mat = voxelMaterial('toon');
    this.glowMat = voxelMaterial('toon', { emissive: 0x1c4a50 }); // glowcaps and spore pods shine a little in the dark
    this.root = new THREE.Group();
    this.root.name = 'harvest-patches';
    scene.scene.add(this.root);
    this.list = spots.map((sp, i) => {
      const P = { ...sp, key: (o.tag || 'h') + ':' + i, anim: null, seed: i };
      P.full = ripe(this.g.state, P.key);
      P.mesh = new THREE.Mesh(sourceGeo(P.kind, !P.full, i).geo, P.kind === 'glowcaps' || P.kind === 'spores' ? this.glowMat : this.mat);
      P.mesh.layers.enable(LAYER_OUTLINE);
      P.mesh.position.set(sp.x, sp.y || 0, sp.z);
      P.mesh.rotation.y = sp.yaw || 0;
      if (sp.scale) P.mesh.scale.setScalar(sp.scale);
      P.base = sp.scale || 1;
      this.root.add(P.mesh);
      const G = sourceGeo(P.kind, false, i);
      const desc = { x: sp.x, y: (sp.y || 0) + G.h * 0.45 * P.base, z: sp.z, r: Math.max(0.16, G.r * 0.8 * P.base), reach: 1.7, enabled: () => P.full && !P.anim, action: () => this.take(P) };
      const label = () => SOURCES[P.kind].label;
      if (o.add) o.add({ ...desc, label });
      else if (scene.addIt) scene.addIt({ ...desc, label }); // (the burrow's: it also waits while you sit or build)
      else { const it = { kind: 'use', ...desc }; Object.defineProperty(it, 'label', { get: label, enumerable: true }); scene.rig?.add?.(it); }
      return P;
    });
    this.checkT = 0;
    scene.own?.(() => this.dispose());
  }

  take(P) {
    if (!P.full) return;
    const st = this.g.state, S = SOURCES[P.kind], audio = this.g.audio;
    P.full = false;
    taken(st, P.key);
    P.anim = { t: 0, kind: 'take' };
    audio.noise?.({ color: 'pink', filter: 'bandpass', f: 1600, f2: 800, q: 0.9, dur: 0.14, a: 0.005, vol: 0.14 });
    this.s.rig?.vm?.impact?.('none', 0.35);
    const q = qOf(st);
    const it = ITEMS[S.item];
    // into the pack (a full pack spills to the trunk), the index learns it, skills hear about it
    for (let i = 0; i < S.n; i++) st.addItem(S.item, { ...(it?.q ? { q } : {}), spill: true });
    if (it?.cat === 'plant') st.discover?.('plant', S.item);
    st.emit?.('act', { type: 'forage', id: S.item, q });
    setTimeout(() => {
      audio.play('bloop', { vol: 0.45, pitch: 1.4 });
      audio.play('pickup', { pitch: 1.1 });
      const at = P.mesh.position.clone().add(new THREE.Vector3(0, 0.25, 0));
      this.g.ui.floatText?.(`+${S.n} ${it?.name || ''}`, at, { kind: 'loot', size: 0.7, life: 1.4 });
    }, 180);
  }

  update(dt) {
    for (const P of this.list) {
      const A = P.anim, m = P.mesh, b = P.base;
      if (!A) continue;
      A.t += dt;
      const t = A.t;
      if (A.kind === 'take') {
        if (t < 0.1) { const k = t / 0.1; m.scale.set(b * (1 + 0.25 * k), b * (1 - 0.35 * k), b * (1 + 0.25 * k)); }
        else if (t < 0.18) { const k = (t - 0.1) / 0.08; m.scale.set(b * (1.25 - 0.4 * k), b * (0.65 + 0.6 * k), b * (1.25 - 0.4 * k)); }
        else if (!A.popped) { A.popped = true; m.geometry = sourceGeo(P.kind, true, P.seed).geo; }
        else { const k = clamp((t - 0.18) / 0.3, 0, 1), e = backOut(k); m.scale.set(b * (0.7 + 0.3 * e), b * (0.5 + 0.5 * e), b * (0.7 + 0.3 * e)); if (k >= 1) { m.scale.setScalar(b); P.anim = null; } }
      } else if (A.kind === 'grow') {
        const k = clamp(t / 0.8, 0, 1), e = backOut(k);
        m.scale.set(b * (0.3 + 0.7 * e), b * (0.2 + 0.8 * e), b * (0.3 + 0.7 * e));
        if (k >= 1) { m.scale.setScalar(b); P.anim = null; }
      }
    }
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 3;
      for (const P of this.list) if (!P.full && !P.anim && ripe(this.g.state, P.key)) { P.full = true; P.mesh.geometry = sourceGeo(P.kind, false, P.seed).geo; P.anim = { t: 0, kind: 'grow' }; }
    }
  }

  dispose() { this.root.parent?.remove(this.root); }
}
