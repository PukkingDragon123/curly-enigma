// Ore clumps. When a deposit comes free it no longer pops out as bare ore: it breaks out of the
// wall wrapped in a crust of its host rock (the rock right around it goes with it), tumbles to the
// floor and lies there glinting. E picks it up and it floats in front of the mole as a hi-res voxel
// specimen (an ore core shaped by its kind inside rock grains and a dirt crust, ./clumps/grid.js),
// lit by the helmet lamp, bobbing and slowly turning. Turn it (right-drag / R F / drag it on touch)
// and clean it with the tool in paw: the pick knocks off big bites (and scratches ore it reaches),
// the chisel nibbles rock right along the ore, the brush sweeps loose dirt, the drill bores (and
// gouges). The tag beside it shows the ore's condition, how clean it is and what it would fetch:
// quality = deposit quality − scratches, scaled by cleanliness (a dirty clump is worth a lot less);
// pristine only if it left the wall unhit and is cleaned spotless without a scratch. E bags it
// (a little flight into the backpack), G drops it (hold G to wind up a throw; flick the view to
// fling it). Clumps lying around are remembered in state.data.deep.clumps (with their cuts), the
// one in paw is bagged when the scene ends (or set down if the bag is full): nothing is lost.
//
// API (DigScene): new Clumps(ctx) · spawn(freed, out) · update(dt, {player, eye, forward, time, busy})
// → events · capture() · target(eye, dir, reach) · use(eye, dir, reach) → events | null ·
// lights(eye) · dispose() → events. Optional: filterLook(look) → look (see below), debug.*.
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { makeObjectMaterial } from './TerrainMaterial.js';
import { VOX, M, MAT, ORE_BASE } from './materials.js';
import { breakable } from './Dig.js';
import { zoneAt } from './Generator.js';
import { h3 } from './noise.js';
import { ITEMS, sellPrice } from '../data/items.js';
import { ORES } from '../data/ores.js';
import { iconURL } from '../gfx/PixelArt.js';
import { hexToRgb, clamp, hashStr } from '../core/util.js';
import { buildClump, AIR, SOFT, ROCK, ORE, P_N, P_ORE } from './clumps/grid.js';
import { ClumpMesher } from './clumps/mesh.js';
import { ClumpCard } from './clumps/card.js';

const CELL = 1 / 80; // metres per clump cell when lying in the world
const HOLD_DIST = 0.46; // camera-space distance of a held clump
// where a clump in paw floats (tangents of the angles from the crosshair): low in the middle while
// carried, lifted up beside the crosshair (clear of the tool paw) to work on it
const CARRY = { x: 0, y: -0.25, s: 0.8 }, INSPECT = { x: -0.065, y: 0.03, s: 1 };
const HOLD_ANG = 0.25; // apparent radius (rad) on a landscape screen
const GRAV = 14;
const HELD_LIGHT = 0.58; // lamp and lights on a clump in paw (it's right under the helmet lamp)
const PICK_T = 0.3, STASH_T = 0.5;
const SPOTLESS = 0.97; // this much of the ore's surface bared counts as clean (the rest crumbles off)
const col01 = (hex) => { const c = hexToRgb(hex); return [c.r / 255, c.g / 255, c.b / 255]; };
const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// soft stuff that makes a crust; per-zone fallbacks for the matrix, crust and pebbles
const SOFTM = new Set([M.DIRT, M.LOAM, M.CLAY, M.ROOTS, M.SAND, M.GRAVEL, M.ASH, M.SNOW, M.RUBBLE, M.MOSS]);
const MANMADE = new Set([M.TIMBER, M.BOARDS, M.BURROW, M.BRICK, M.DOOR, M.LANTERN, M.BEDROCK, M.CRYSTAL]);
const ZDEF = [null,
  { rock: M.MUDSTONE, crust: M.DIRT, peb: M.STONE },
  { rock: M.MUDSTONE, crust: M.CLAY, peb: M.LIMESTONE },
  { rock: M.GRANITE, crust: M.SAND, peb: M.CRYSTALROCK },
  { rock: M.BASALT, crust: M.ASH, peb: M.OBSIDIAN },
  { rock: M.PERMAFROST, crust: M.SNOW, peb: M.ICE },
  { rock: M.CORE, crust: M.ASH, peb: M.STARROCK }];

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _c = new THREE.Color(), _v3 = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);

export class Clumps {
  constructor(ctx) {
    this.ctx = ctx;
    this.w = ctx.world;
    this.U = ctx.U;
    this.fx = ctx.fx;
    this.audio = ctx.audio;
    this.st = ctx.state;
    this.ui = ctx.ui;
    this.owner = ctx.owner;
    this.scene3 = ctx.scene3 || ctx.scene;
    this.root = new THREE.Group();
    this.scene3.add(this.root);
    this.list = [];
    this.held = null;
    this.stashing = [];
    this.mesher = new ClumpMesher();
    this.card = null;
    this.out = [];
    this.flags = {};
    this.time = 0;
    this.cd = 0; // tool cooldown while holding
    this.pending = null; // a swing that lands on the clump
    this.yawRate = 0; this.pitchRate = 0;
    this.pyaw = null; this.ppitch = 0;
    this.lookTaken = false;
    this.touchRot = { x: 0, y: 0 };
    this.touchTap = null;
    this.dropBtn = null; // touch: Drop pressed (charging) / released
    // the x-ray lamp shows the ore through its rock: the ore drawn again, bright, over everything
    this.xrayMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    this.xrayMat.color.setRGB(1.25, 1.75, 1.7);
    // the camera carries the clump in paw (so it moves exactly with the view, shake and all)
    const cam = this.owner?.camera;
    if (cam && !cam.parent) { this.scene3.add(cam); this.addedCam = true; }
    // warm the generator, mesher and chisel up on a tiny clump so the first real one doesn't hitch
    try {
      const wg = buildClump({ seed: 7, item: 'copper_ore', oreId: 2, R: 5, crust: M.DIRT, rock: M.STONE, peb: M.LIMESTONE });
      const wp = new Float32Array(P_N * 3).fill(0.5);
      this.mesher.build(wg, wp);
      this.mesher.buildShell(wg, wp);
      const h = wg.raycast(-1, wg.n / 2, wg.n / 2, 1, 0, 0);
      if (h) { wg.bite(h.x + 1, h.y + 0.5, h.z + 0.5, 3, -1, 0, 0, 1); wg.nibble(h, [1, 0, 0], 8); wg.sweep(h.x, h.y, h.z); wg.updateClean(); }
      this.mesher.build(wg, wp);
    } catch (err) { /* only a warm-up */ }
    // clumps left lying around last time
    const deep = this.st?.data?.deep;
    if (deep) {
      deep.clumps ||= [];
      for (const e of [...deep.clumps]) {
        try { this.restore(e); } catch (err) { console.warn('clump restore failed', err); }
      }
    }
    this.debug = {
      list: () => this.list,
      held: () => this.held,
      /** Spawn a clump from the nearest untaken deposit (removes its ore from the wall). */
      spawnNear: (x, y, z, r = 8) => {
        const d = this.w.depositsNear(x, y, z, r).filter((q) => !this.w.depState(q).taken).sort((a, b) => Math.hypot(a.x - x, a.y - y, a.z - z) - Math.hypot(b.x - x, b.y - y, b.z - z))[0];
        if (!d) return null;
        const s = this.w.depState(d);
        const vox = this.owner?.ores?.voxelsOf(d) || [];
        s.taken = true;
        const voxels = vox.map((v) => ({ ...v, c: MAT[v.m]?.tones?.[1] ?? 0x888888 }));
        for (const v of vox) this.w.setVoxel(v.x, v.y, v.z, 0);
        return this.spawn({ d, s, voxels, pristine: s.hits === 0 });
      },
      grab: (c) => this.pickUp(c || this.list[this.list.length - 1]),
      chip: (tool, it) => this.strike(tool || 'chisel', it || { power: 1 }),
      turn: (dx, dy) => this.turn(dx, dy),
      value: (c) => this.value(c || this.held),
      clean: (c) => { c = c || this.held; for (let i = 0; i < c.g.kind.length; i++) if (c.g.kind[i] === SOFT || c.g.kind[i] === ROCK) c.g.kind[i] = AIR; c.g.updateClean(); c.dirty = true; },
    };
  }

  // ------------------------------------------------------------ building
  /** spec: { seed, item, oreId, R, crust, rock, peb }; meta: { dep, q0, p0, qLoss, dmgN } */
  make(spec, meta) {
    const g = buildClump(spec);
    g.kind0 = g.kind.slice();
    const pal = new Float32Array(P_N * 3);
    for (let i = 0; i < P_N; i++) { _c.setHex(g.pal[i]); pal[i * 3] = _c.r; pal[i * 3 + 1] = _c.g; pal[i * 3 + 2] = _c.b; }
    const ore = ORES[spec.oreId] || {};
    const glow = !!(ore.glow || ITEMS[spec.item]?.glow);
    const emissive = glow ? 0.55 : 0.16;
    const mats = { rock: litMaterial(this.U, {}), ore: litMaterial(this.U, { emissive }) };
    const group = new THREE.Group();
    const mk = (mat) => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      m.layers.enable(LAYER_OUTLINE);
      return m;
    };
    const rockMesh = mk(mats.rock), oreMesh = mk(mats.ore);
    group.add(rockMesh, oreMesh);
    group.scale.setScalar(CELL);
    const c = {
      spec, g, pal, mats, group, rockMesh, oreMesh, glow, emissive,
      item: spec.item, it: ITEMS[spec.item] || { name: spec.item },
      dep: meta.dep, q0: meta.q0 ?? 80, p0: !!meta.p0, qLoss: meta.qLoss || 0, dmgN: meta.dmgN || 0,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), ang: new THREE.Vector3(),
      r: 0.1, rCells: spec.R, rHold: spec.R, asleep: false, restT: 0, supT: 0, t: 0, glintT: Math.random(), grounded: false,
      state: 'world', dirty: true, glints: [], scale: 1, entry: null, wasClean: false,
      oreCol: col01(g.pal[P_ORE + 4]), oreMain: col01(g.pal[P_ORE + 1]),
    };
    this.measure(c);
    c.rHold = c.rCells;
    this.remesh(c);
    this.root.add(group);
    this.list.push(c);
    return c;
  }

  /** Collision radius from the cells that are left (RMS radius of a ball is 0.775 R). */
  measure(c) {
    const g = c.g, n = g.n, [hx, hy, hz] = g.pivot;
    let s = 0, k = 0;
    for (let i = 0; i < g.kind.length; i += 2) {
      if (!g.kind[i]) continue;
      const x = i % n + 0.5 - hx, y = ((i / n) | 0) % n + 0.5 - hy, z = ((i / (n * n)) | 0) + 0.5 - hz;
      s += x * x + y * y + z * z; k++;
    }
    c.rCells = k ? Math.sqrt(s / k) / 0.775 : 4;
    c.r = Math.max(0.035, c.rCells * CELL * 0.82);
  }

  remesh(c) {
    const [rb, ob] = this.mesher.build(c.g, c.pal);
    this.fill(c.rockMesh, rb, c.g.n);
    this.fill(c.oreMesh, ob, c.g.n);
    c.glints = c.g.exposedOre(40);
    c.dirty = false;
  }

  fill(mesh, b, n) {
    let geo = mesh.geometry;
    const cap = geo.userData.cap || 0;
    if (cap < b.nv) {
      geo.dispose();
      geo = new THREE.BufferGeometry();
      const nc = Math.ceil(b.nv * 1.35) + 64;
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nc * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nc * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nc * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(new THREE.BufferAttribute(new Uint32Array(Math.ceil(nc / 4) * 6), 1).setUsage(THREE.DynamicDrawUsage));
      geo.userData.cap = nc;
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), n * 1.2);
      geo.boundingBox = new THREE.Box3(new THREE.Vector3(-n, -n, -n), new THREE.Vector3(n, n, n));
      mesh.geometry = geo;
    }
    const a = geo.attributes;
    if (b.nv) {
      a.position.array.set(b.pos.subarray(0, b.nv * 3));
      a.normal.array.set(b.nor.subarray(0, b.nv * 3));
      a.color.array.set(b.col.subarray(0, b.nv * 3));
      geo.index.array.set(b.idx.subarray(0, b.ni));
    }
    for (const at of [a.position, a.normal, a.color]) { at.clearUpdateRanges(); at.addUpdateRange(0, b.nv * 3); at.needsUpdate = true; }
    geo.index.clearUpdateRanges(); geo.index.addUpdateRange(0, b.ni); geo.index.needsUpdate = true;
    geo.setDrawRange(0, b.ni);
    mesh.visible = b.ni > 0;
  }

  /** Materials around the ore: the crust (soft), the matrix (rock) and pebbles. */
  hostOf(voxels, d) {
    const w = this.w, count = new Map();
    const seen = new Set();
    for (const v of voxels.length > 40 ? voxels.filter((_, i) => i % 2 === 0) : voxels) {
      for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = v.x + dx, y = v.y + dy, z = v.z + dz;
        const k = x + ',' + y + ',' + z;
        if (seen.has(k)) continue;
        seen.add(k);
        const m = w.voxelAt(x, y, z);
        if (!m || m >= ORE_BASE || MAT[m]?.fluid || MANMADE.has(m)) continue;
        count.set(m, (count.get(m) || 0) + 1);
      }
    }
    const zone = zoneAt(Math.max(0, -d.y));
    const def = ZDEF[zone] || ZDEF[1];
    const sorted = [...count.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    const soft = sorted.filter((m) => SOFTM.has(m)), hard = sorted.filter((m) => !SOFTM.has(m));
    return { crust: soft[0] ?? def.crust, rock: hard[0] ?? def.rock, peb: hard[1] ?? def.peb };
  }

  /** The rock right around the ore comes out with it (it's the clump's crust). */
  carve(voxels) {
    const w = this.w, done = new Set(), cut = [];
    const key = (x, y, z) => x + ',' + y + ',' + z;
    for (const v of voxels) done.add(key(v.x, v.y, v.z));
    const tryCut = (x, y, z, p) => {
      const k = key(x, y, z);
      if (done.has(k)) return;
      done.add(k);
      if (h3(x, y, z, 77) > p || cut.length >= 48 * (VOX / 8) ** 2) return;
      const m = w.voxelAt(x, y, z);
      if (!m || m >= ORE_BASE || !breakable(m) || MANMADE.has(m) || MAT[m]?.fluid) return;
      // leave rock that holds back water or lava
      for (const [dx, dy, dz] of N6) { const q = w.voxelAt(x + dx, y + dy, z + dz); if (MAT[q]?.fluid) return; }
      cut.push({ x, y, z, m });
    };
    for (const v of voxels) for (const [dx, dy, dz] of N6) tryCut(v.x + dx, v.y + dy, v.z + dz, 0.85);
    const ring = [...cut];
    for (const v of ring) for (const [dx, dy, dz] of N6) tryCut(v.x + dx, v.y + dy, v.z + dz, 0.22);
    for (const v of cut) w.setVoxel(v.x, v.y, v.z, 0);
    return cut;
  }

  // ------------------------------------------------------------ API
  /** A deposit came free: it breaks out of the wall as a clump. freed = { d, s, voxels, pristine }. */
  spawn(freed, out = [0, 1, 0]) {
    const { d, s, voxels } = freed;
    const host = this.hostOf(voxels || [], d);
    const cut = this.carve(voxels || []);
    const R = 10 + clamp(((d.r || 0.2) - 0.12) / 0.2, 0, 1) * 4;
    const seed = (d.seed || hashStr(String(d.id))) >>> 0;
    const spec = { seed, item: d.item, oreId: d.oreId, R: Math.round(R * 2) / 2, ...host };
    const c = this.make(spec, { dep: d.id, q0: Math.round(s?.q ?? d.q ?? 80), p0: (s?.hits ?? 0) === 0 && (s?.q ?? 100) >= 60 });
    // out of the hole, pushed clear of the rock
    c.pos.set(d.x, d.y, d.z);
    const o = new THREE.Vector3(out[0], out[1], out[2]);
    if (o.lengthSq() < 0.1) o.set(0, 1, 0);
    for (let k = 0; k < 14 && this.overlaps(c.pos, c.r * 0.9); k++) c.pos.addScaledVector(o, 0.035);
    c.quat.setFromEuler(_e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
    c.vel.set(o.x * (1.6 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6, 1.6 + Math.max(0, o.y) * 1.2 + Math.random() * 0.8, o.z * (1.6 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6);
    c.ang.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    this.pose(c);
    // dust and grit of the host rock bursting out
    const fx = this.fx, tone = col01(MAT[host.crust]?.tones?.[1] ?? 0x806050), rock = col01(MAT[host.rock]?.tones?.[2] ?? 0x707070);
    if (fx) {
      fx.dust(d.x, d.y, d.z, 10, tone, 0.12, [o.x * 0.6, o.y * 0.6, o.z * 0.6]);
      fx.chips(d.x, d.y, d.z, 8, rock, out);
      for (const v of cut.slice(0, 10)) fx.chips((v.x + 0.5) / VOX, (v.y + 0.5) / VOX, (v.z + 0.5) / VOX, 2, col01(MAT[v.m]?.tones?.[1] ?? 0x806050), out);
    }
    this.audio?.play('break', { snd: MAT[host.rock]?.snd || 'stone', vol: 0.7 });
    this.save(c);
    return c;
  }

  /** True while a clump is in paw: DigScene leaves the tools, crosshair and primary button to us. */
  capture() { return !!(this.held && this.held.state === 'held'); }

  /** A resting clump under the crosshair → a "use" prompt. */
  target(eye, dir, reach) {
    const c = this.pick(eye, dir, reach);
    this.hover = c;
    this.hoverT = this.time;
    return c ? { label: `Pick up ${c.it.name} clump`, kind: 'use' } : null;
  }

  /** E / the use button: pick up the clump in sight, or bag the one in paw. null = not ours. */
  use(eye, dir, reach) {
    if (this.held) {
      if (this.held.state === 'held') this.stash(this.held);
      return this.flush([{ handled: true }]);
    }
    const c = this.pick(eye, dir, reach);
    if (!c) return null;
    this.pickUp(c);
    return this.flush([{ handled: true }]);
  }

  /** Optional hook: DigScene may pass the frame's look through here; while turning a clump the
   *  mouse turns it instead of the view. (Without it, right-drag reverts the view itself.) */
  filterLook(look) {
    if (!this.capture() || !this.rotating()) return look;
    this.lookTaken = true;
    this.turn(look.dx, look.dy);
    return { dx: 0, dy: 0 };
  }

  lights(eye) {
    const out = [];
    for (const c of this.list) {
      if (!c.glow || c.state === 'gone') continue;
      const p = c.state === 'world' ? c.pos : this.worldPos(c, _v2);
      const d = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z);
      if (d > 14) continue;
      const gc = col01(ORES[c.spec.oreId]?.glow || ITEMS[c.item]?.glow || 0xffffff);
      out.push({ d, x: p.x, y: p.y + 0.05, z: p.z, c: [gc[0] * 0.9, gc[1] * 0.9, gc[2] * 0.9], r: 1.8 });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, 2);
  }

  // ------------------------------------------------------------ frame
  update(dt, o = {}) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const pl = o.player || this.ctx.player, busy = !!o.busy;
    const eye = o.eye || pl.eye();
    // view turn rate (for flicks) and the right-drag turn
    if (this.pyaw === null) { this.pyaw = pl.yaw; this.ppitch = pl.pitch; }
    let dyaw = pl.yaw - this.pyaw, dpitch = pl.pitch - this.ppitch;
    const h = this.held;
    if (h && h.state === 'held' && !busy && this.rotating() && !this.lookTaken) {
      // the mouse turns the clump, not the view
      pl.yaw = this.pyaw; pl.pitch = this.ppitch;
      this.turn(-dyaw / 0.0026, -dpitch / 0.0026);
      dyaw = dpitch = 0;
    }
    this.lookTaken = false;
    const k = 1 - Math.exp(-dt * 12);
    this.yawRate += (dyaw / Math.max(dt, 1e-3) - this.yawRate) * k;
    this.pitchRate += (dpitch / Math.max(dt, 1e-3) - this.pitchRate) * k;

    if (h && h.state === 'held') this.updateHeld(h, dt, pl, eye, busy);
    else this.card?.show(false);
    for (let i = this.stashing.length - 1; i >= 0; i--) this.updateStash(this.stashing[i], dt, i);
    // the clump under the crosshair lights up a little
    const hov = this.hover && this.time - this.hoverT < 0.2 ? this.hover : null;
    for (const c of this.list) {
      const on = c === hov && c.state === 'world';
      const f = on ? 0.012 + Math.sin(this.time * 7) * 0.008 : 0;
      if (c.mats.rock.uniforms.flash.value !== f) c.mats.rock.uniforms.flash.value = f;
      const e = c.emissive + (on ? 0.35 + Math.sin(this.time * 7) * 0.15 : 0);
      if (c.mats.ore.uniforms.emissive.value !== e) c.mats.ore.uniforms.emissive.value = e;
    }
    for (const c of this.list) if (c.state === 'world') this.updateWorld(c, dt, pl, eye);
    for (const c of this.list) if (c.dirty) this.remesh(c);
    this.pyaw = pl.yaw; this.ppitch = pl.pitch;
    return this.flush();
  }

  flush(extra) {
    const ev = this.out;
    this.out = [];
    return extra ? ev.concat(extra) : ev;
  }

  say(key, html, tone = 'warn', cd = 6) { this.out.push({ say: html, key: 'clump_' + key, tone, cd }); }

  // ------------------------------------------------------------ in the world
  overlaps(p, r) {
    const w = this.w;
    if (w.solidAt(p.x, p.y, p.z)) return true;
    for (const [dx, dy, dz] of N6) if (w.solidAt(p.x + dx * r, p.y + dy * r, p.z + dz * r)) return true;
    return false;
  }

  /** Is the sphere's leading side along `axis` (0 x, 1 y, 2 z) in rock at position p? */
  hitSide(p, axis, sgn, r) {
    const w = this.w;
    const a = [0, 0, 0], t1 = [0, 0, 0], t2 = [0, 0, 0];
    a[axis] = sgn; t1[(axis + 1) % 3] = 1; t2[(axis + 2) % 3] = 1;
    if (w.solidAt(p.x + a[0] * r, p.y + a[1] * r, p.z + a[2] * r)) return true;
    const f = 0.68 * r, s = 0.55 * r;
    for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + a[0] * f + (t1[0] * u + t2[0] * v) * s, y = p.y + a[1] * f + (t1[1] * u + t2[1] * v) * s, z = p.z + a[2] * f + (t1[2] * u + t2[2] * v) * s;
      if (w.solidAt(x, y, z)) return true;
    }
    return false;
  }

  setLight(c, k) {
    c.mats.rock.uniforms.lightK.value = k;
    c.mats.ore.uniforms.lightK.value = k;
    c.light = k;
  }

  updateWorld(c, dt, pl, eye) {
    c.t += dt;
    if (c.light !== undefined && c.light < 1) this.setLight(c, Math.min(1, c.light + dt * 2.5));
    const dEye = Math.hypot(c.pos.x - eye.x, c.pos.y - eye.y, c.pos.z - eye.z);
    if (c.scale !== 1) { c.scale += (1 - c.scale) * Math.min(1, dt * 6); if (Math.abs(c.scale - 1) < 0.01) c.scale = 1; c.group.scale.setScalar(CELL * c.scale); c.r = Math.max(0.03, c.rCells * CELL * 0.82 * c.scale); }
    // the mole bumps into it
    const fp = pl.pos;
    if (c.pos.y > fp.y - c.r && c.pos.y < fp.y + 0.9) {
      const dx = c.pos.x - fp.x, dz = c.pos.z - fp.z, dd = Math.hypot(dx, dz), min = 0.24 + c.r;
      if (dd < min) {
        const ux = dd > 1e-4 ? dx / dd : 1, uz = dd > 1e-4 ? dz / dd : 0;
        const sp = Math.hypot(pl.vel.x, pl.vel.z);
        if (sp > 0.3) { c.vel.x += ux * sp * 0.5 + pl.vel.x * 0.3; c.vel.z += uz * sp * 0.5 + pl.vel.z * 0.3; c.asleep = false; c.restT = 0; }
      }
    }
    if (c.asleep) {
      // still lying on something?
      c.supT -= dt;
      if (c.supT <= 0 && dEye < 16) {
        c.supT = 0.5;
        if (!this.hitSide(c.pos, 1, -1, c.r + 0.03)) { c.asleep = false; c.restT = 0; }
      }
    } else this.step(c, dt);
    // glints so you notice it
    if (dEye < 9) {
      c.glintT -= dt;
      if (c.glintT <= 0) {
        c.glintT = 0.45 + Math.random() * 0.9;
        const p = this.cellWorld(c, c.glints.length ? c.glints[(Math.random() * c.glints.length) | 0] : -1, _v);
        this.fx?.twinkle?.(p.x, p.y, p.z, c.oreCol, 0.016);
      }
    }
  }

  step(c, dt) {
    const p = c.pos, v = c.vel, r = c.r;
    v.y -= GRAV * dt;
    const drag = Math.max(0, 1 - 0.25 * dt);
    v.x *= drag; v.z *= drag;
    // per axis against the rock
    for (const ax of [0, 2]) {
      const vv = ax === 0 ? v.x : v.z;
      if (!vv) continue;
      const np = p.clone();
      if (ax === 0) np.x += vv * dt; else np.z += vv * dt;
      if (this.hitSide(np, ax, Math.sign(vv), r)) {
        const nv = Math.abs(vv) > 0.8 ? -vv * 0.32 : 0;
        if (ax === 0) v.x = nv; else v.z = nv;
        if (Math.abs(vv) > 1.5) this.knock(c, Math.abs(vv));
        c.ang.multiplyScalar(0.6);
      } else p.copy(np);
    }
    const ny = p.y + v.y * dt;
    _v2.copy(p); _v2.y = ny;
    if (v.y !== 0 && this.hitSide(_v2, 1, Math.sign(v.y), r)) {
      const sp = Math.abs(v.y);
      if (v.y < 0) {
        c.grounded = true;
        if (sp > 1.6) { v.y = sp * 0.3; this.knock(c, sp); c.ang.multiplyScalar(0.55); }
        else v.y = 0;
        // ground friction: it rolls a little and stops
        const f = Math.max(0, 1 - dt * 5.5);
        v.x *= f; v.z *= f;
      } else v.y = 0;
    } else { p.y = ny; c.grounded = false; }
    if (this.w.solidAt(p.x, p.y, p.z)) { p.y += 1 / VOX; v.y = Math.max(0, v.y); }
    // spin: rolling on the ground, tumbling in the air
    if (c.grounded) {
      _v.set(v.z, 0, -v.x).multiplyScalar(1 / Math.max(0.04, r));
      c.ang.lerp(_v, Math.min(1, dt * 10));
    } else c.ang.multiplyScalar(Math.max(0, 1 - dt * 0.3));
    const w = c.ang.length();
    if (w > 1e-4) { _q.setFromAxisAngle(_v.copy(c.ang).multiplyScalar(1 / w), w * dt); c.quat.premultiply(_q); }
    this.pose(c);
    // at rest?
    if (c.grounded && Math.abs(v.x) + Math.abs(v.z) + Math.abs(v.y) < 0.08) {
      c.restT += dt;
      if (c.restT > 0.35) { c.asleep = true; v.set(0, 0, 0); c.ang.set(0, 0, 0); c.supT = 0.5; this.save(c, false); }
    } else c.restT = 0;
    if (p.y < -400) { c.asleep = true; v.set(0, 0, 0); }
  }

  /** A hard landing: a thud, dust, and maybe a few crumbs of crust shaken off. */
  knock(c, sp) {
    this.audio?.play('thud', { vol: clamp(sp / 9, 0.15, 0.6) });
    this.audio?.play('debris', { vol: clamp(sp / 8, 0.2, 0.6) });
    const tone = col01(c.g.pal[1]);
    this.fx?.dust(c.pos.x, c.pos.y - c.r * 0.8, c.pos.z, Math.min(8, 2 + sp | 0), tone, 0.06);
    if (sp > 3.5) {
      // the crust on the bottom cracks off
      const g = c.g, n = g.n;
      _q.copy(c.quat).invert();
      _v.set(0, -1, 0).applyQuaternion(_q);
      const [hx, hy, hz] = g.pivot;
      const cx = hx + _v.x * c.rCells * 0.95, cy = hy + _v.y * c.rCells * 0.95, cz = hz + _v.z * c.rCells * 0.95;
      const res = g.sweep(cx, cy, cz, Math.min(14, sp * 1.5 | 0), 3.5);
      if (res.removed.length) { g.updateClean(); c.dirty = true; this.crumbs(c, res.removed.concat(res.detached), [0, 0.4, 0], 0.5); }
    }
  }

  pose(c) {
    c.group.position.copy(c.pos);
    c.group.quaternion.copy(c.quat);
  }

  /** World position of a cell's centre (i < 0: the clump's top). */
  cellWorld(c, i, out) {
    const g = c.g, n = g.n, [hx, hy, hz] = g.pivot;
    if (i < 0) out.set(0, c.rCells * 0.8, 0);
    else out.set(i % n + 0.5 - hx, ((i / n) | 0) % n + 0.5 - hy, ((i / (n * n)) | 0) + 0.5 - hz);
    c.group.updateMatrixWorld();
    return c.group.localToWorld(out);
  }

  worldPos(c, out) {
    c.group.updateMatrixWorld();
    return c.group.getWorldPosition(out);
  }

  /** The resting (or slow) clump the crosshair ray hits first within reach. */
  pick(eye, dir, reach) {
    let best = null, bt = reach + 0.25;
    for (const c of this.list) {
      if (c.state !== 'world' || c.vel.lengthSq() > 9) continue;
      const ox = c.pos.x - eye.x, oy = c.pos.y - eye.y, oz = c.pos.z - eye.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0) continue;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      const rr = c.r * 1.35 + 0.04;
      if (d2 > rr * rr) continue;
      const th = t - Math.sqrt(Math.max(0, rr * rr - d2));
      if (th < bt) { bt = th; best = c; }
    }
    return best;
  }

  // ------------------------------------------------------------ in paw
  camQuat(pl, out = _q2) { return out.setFromEuler(_e.set(pl.pitch, pl.yaw, 0, 'YXZ')); }

  pickUp(c) {
    if (!c || c.state !== 'world') return;
    if (this.held) this.stash(this.held);
    const cam = this.owner.camera, pl = this.ctx.player;
    // from where it lies, in camera space, to the hand
    const eye = pl.eye(), cq = this.camQuat(pl, new THREE.Quaternion());
    const inv = cq.clone().invert();
    const from = c.pos.clone().sub(eye).applyQuaternion(inv);
    const fromQ = inv.clone().multiply(c.quat);
    c.state = 'held';
    c.asleep = false;
    c.vel.set(0, 0, 0); c.ang.set(0, 0, 0);
    cam.add(c.group);
    c.hold = { t: 0, from, fromQ, fromS: c.scale, rot: fromQ.clone(), k: 1, sway: new THREE.Vector2(), spin: 0, idle: 0, charge: -1, turn: null, scale: 1, pos: new THREE.Vector3(), w: 1, twT: 0.3 };
    this.held = c;
    this.cd = 0.25;
    this.pending = null;
    this.audio?.play('pickup', { pitch: 0.7 });
    this.audio?.play('debris', { vol: 0.4 });
    this.fx?.dust(c.pos.x, c.pos.y - c.r * 0.6, c.pos.z, 4, col01(c.g.pal[1]), 0.05);
    if (!this.card) this.card = new ClumpCard(this.ui, {
      onAction: (name, down) => {
        if (name === 'bag' && down && this.held?.state === 'held') this.stash(this.held);
        if (name === 'drop') this.dropBtn = down;
      },
      onDrag: (dx, dy) => { this.touchRot.x += dx; this.touchRot.y += dy; },
      onTap: (x, y) => { this.touchTap = { x, y }; },
    });
    this.card.show(true);
    this.updateCard(c, true);
    const st = this.st;
    if (st && !st.flag?.('clumpHint')) {
      st.flag?.('clumpHint', true);
      const touch = this.isTouch();
      this.say('hint', touch
        ? `<b>${c.it.name}</b> clump! Drag it to turn it, chip with the dig button (pick = big bites, chisel = rock, brush = dirt). Clean it for full value, then <b>Bag it</b>.`
        : `<b>${c.it.name}</b> clump! Right-drag to turn it, click to chip (pick = big bites, chisel = rock, brush = dirt). Clean it for full value, <b>E</b> bags it, <b>G</b> drops it.`, 'good', 999);
    }
    this.save(c);
  }

  isTouch() { return document.documentElement.classList.contains('is-touch'); }
  rotating() {
    const inp = this.owner?.game?.input;
    return !!(inp && inp.mouseDown(2) && !this.isTouch());
  }

  /** Turn the clump in paw by a drag (CSS px): right → its front swings right, down → front dips. */
  turn(dx, dy) {
    const h = this.held?.hold;
    if (!h) return;
    const k = this.isTouch() ? 0.012 : 0.0095;
    _q.setFromAxisAngle(AY, dx * k);
    h.rot.premultiply(_q);
    _q.setFromAxisAngle(AX, dy * k);
    h.rot.premultiply(_q);
    h.idle = 0;
  }

  updateHeld(c, dt, pl, eye, busy) {
    const H = c.hold, g = this.owner.game, inp = g.input, cam = this.owner.camera;
    const touch = this.isTouch();
    const can = !busy && !this.owner.leaving && (inp.pointerLocked || touch || this.ui.root?.classList.contains('lock-failed'));
    H.t += dt;
    H.idle += dt;
    // turning: touch drags, R / F quarter turns
    if (this.touchRot.x || this.touchRot.y) { if (!busy) this.turn(this.touchRot.x, this.touchRot.y); this.touchRot.x = this.touchRot.y = 0; }
    if (!busy && !H.turn) {
      if (inp.pressed('KeyR') && this.owner.slotName !== 'build') H.turn = { axis: AY, left: Math.PI / 2 };
      else if (inp.pressed('KeyF')) H.turn = { axis: AX, left: Math.PI / 2 };
    }
    if (H.turn) {
      const a = Math.min(H.turn.left, dt * 7);
      H.turn.left -= a;
      _q.setFromAxisAngle(H.turn.axis, a);
      H.rot.premultiply(_q);
      H.idle = 0;
      if (H.turn.left <= 1e-4) H.turn = null;
    }
    // slow idle spin while nobody's working on it
    const working = can && inp.mouseDown(0);
    if (working) H.idle = Math.min(H.idle, 0);
    // carried low while walking, lifted up to look at when standing still or working on it
    const busyHands = H.idle < 1.2 || !!this.pending;
    const wantW = pl.speed < 0.7 || busyHands ? 1 : 0;
    H.w += (wantW - H.w) * Math.min(1, dt * (wantW ? 5 : 3));
    const W = ease(H.w);
    const spin = H.idle > 2.2 ? Math.min(1, (H.idle - 2.2) / 1.5) * 0.35 : 0;
    if (spin) { _q.setFromAxisAngle(AY, spin * dt); H.rot.premultiply(_q); }

    // where it floats: lower middle of the view, a constant apparent size, pulled in near walls
    const tanV = Math.tan((cam.fov * Math.PI) / 360), aspect = cam.aspect || 1.6;
    const ang = Math.min(HOLD_ANG, Math.atan(tanV * aspect * 0.5));
    const rApp = HOLD_DIST * Math.tan(ang);
    let scale = rApp / Math.max(0.03, c.rHold * CELL) * (CARRY.s + (INSPECT.s - CARRY.s) * W);
    // wind up a throw
    if (H.charge >= 0) H.charge = Math.min(1, H.charge + dt * 1.4);
    const back = H.charge > 0 ? ease(H.charge) * 0.08 : 0;
    const px = (CARRY.x + (INSPECT.x - CARRY.x) * W) * Math.min(1, aspect), py = CARRY.y + (INSPECT.y - CARRY.y) * W;
    const base = _v.set(HOLD_DIST * px, HOLD_DIST * py - back * 0.4, -HOLD_DIST + back);
    // keep it out of the walls
    const r = c.rCells * CELL * scale;
    const cq = this.camQuat(pl);
    let kk = 1;
    for (const [ox, oy, oz] of [[0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 0]]) {
      _v2.set(base.x + ox * r, base.y + oy * r, base.z + oz * r);
      const L = _v2.length();
      _v2.multiplyScalar(1 / L).applyQuaternion(cq);
      const hit = this.w.raycast(eye.x, eye.y, eye.z, _v2.x, _v2.y, _v2.z, L + 0.06);
      if (hit) kk = Math.min(kk, Math.max(0.22, (hit.dist - 0.035) / L));
    }
    H.k += (kk - H.k) * Math.min(1, dt * (kk < H.k ? 22 : 5));
    // bob, sway with the view, a little lean
    const bob = Math.sin(this.time * 2.1) * 0.005;
    H.sway.x += (clamp(-this.yawRate * 0.012, -0.035, 0.035) - H.sway.x) * Math.min(1, dt * 6);
    H.sway.y += (clamp(this.pitchRate * 0.01, -0.03, 0.03) - H.sway.y) * Math.min(1, dt * 6);
    const tp = H.pos.set((base.x + H.sway.x) * H.k, (base.y + bob + H.sway.y) * H.k, base.z * H.k);
    const ts = CELL * scale * H.k;
    H.scale = scale * H.k;
    const grp = c.group;
    if (H.t < PICK_T) {
      const e = ease(H.t / PICK_T);
      grp.position.lerpVectors(H.from, tp, e);
      grp.quaternion.slerpQuaternions(H.fromQ, H.rot, e);
      grp.scale.setScalar(CELL * H.fromS + (ts - CELL * H.fromS) * e);
    } else {
      grp.position.copy(tp);
      grp.quaternion.copy(H.rot);
      _q.setFromAxisAngle(AX, Math.sin(this.time * 1.3) * 0.025);
      grp.quaternion.premultiply(_q);
      grp.scale.setScalar(ts);
    }
    grp.updateMatrix();
    this.setLight(c, 1 - (1 - HELD_LIGHT) * ease(H.t / PICK_T));
    // clean ore twinkles in the lamp light
    H.twT -= dt;
    if (H.twT <= 0 && c.glints.length) {
      H.twT = 0.25 + Math.random() * 0.6 / (0.4 + c.g.clean);
      const p = this.cellWorld(c, c.glints[(Math.random() * c.glints.length) | 0], _v2);
      this.fx?.twinkle?.(p.x, p.y, p.z, c.oreCol, 0.0055 * H.scale + 0.002);
    }

    // x-ray lamp: the ore shows through the rock
    const tool = this.owner.slotName, it = this.owner.toolItem?.(tool);
    const xr = can && tool === 'xray' && !!it && inp.mouseDown(0);
    if (xr && !c.xray) { c.xray = new THREE.Mesh(new THREE.BufferGeometry(), this.xrayMat); c.xray.renderOrder = 20; c.xray.frustumCulled = false; c.group.add(c.xray); c.xrayV = -1; }
    if (xr && c.xrayV !== c.g.version) { c.xrayV = c.g.version; this.fill(c.xray, this.mesher.buildShell(c.g, c.pal), c.g.n); }
    if (c.xray) { c.xray.visible = xr; this.xrayMat.opacity = 0.5 + Math.sin(this.time * 9) * 0.12; }

    // drop / throw: G (hold to wind up), or the touch Drop button
    const gDown = !busy && (inp.isDown('KeyG') || this.dropBtn === true);
    if (gDown && H.charge < 0 && (inp.pressed('KeyG') || this.dropBtn === true)) H.charge = 0;
    if (H.charge >= 0 && !gDown) { this.drop(c, H.charge); return; }

    // tools
    this.cd -= dt;
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) { const p = this.pending; this.pending = null; this.strike(p.tool, p.it, p.ray); }
    }
    const want = can && inp.mouseDown(0) && H.t > PICK_T * 0.8;
    const vm = this.owner.vm;
    if (vm && (tool === 'brush' || tool === 'drill' || tool === 'xray')) vm.use(tool, want && !!it);
    let tap = null;
    if (this.touchTap && !busy) { tap = this.touchTap; }
    this.touchTap = null;
    if ((want || tap) && this.cd <= 0) {
      const ray = tap ? this.tapRay(tap.x, tap.y) : null;
      if (!it) {
        if (inp.mousePressed(0) || tap) this.say('notool', tool === 'pick' || tool === 'chisel' || tool === 'brush' ? `You don't have a ${tool}.` : 'Clean it with the <b>pick</b>, <b>chisel</b> or <b>brush</b>.', 'warn', 5);
      } else if (tool === 'pick') {
        this.cd = (it.rate || 0.36) * (this.st?.hasBuff?.('zippy') ? 0.8 : 1) + 0.06;
        this.pending = { t: 0.13, tool, it, ray };
        vm?.swing('pick', 0.13);
        this.audio?.play('whoosh', { vol: 0.2, pitch: 1.5 });
      } else if (tool === 'chisel') {
        this.cd = (it.rate || 0.2) + 0.05;
        this.pending = { t: 0.1, tool, it, ray };
        vm?.swing('chisel', 0.1);
      } else if (tool === 'brush') {
        this.cd = it.rate || 0.12;
        this.strike('brush', it, ray);
      } else if (tool === 'drill') {
        this.cd = 0.08;
        this.strike('drill', it, ray);
      } else if (tool !== 'xray' && (inp.mousePressed(0) || tap)) {
        this.say('tool', 'Clean it with the <b>pick</b>, <b>chisel</b> or <b>brush</b>. (Mouse wheel / 1-3 to switch.)', 'warn', 6);
      }
    }
    // the crosshair: what's under it on the clump
    const hit = this.aim(c, null);
    const kind = !hit ? 'none' : hit.k === ORE ? 'ore' : 'rock';
    let label = '';
    if (hit && tool === 'brush' && hit.k === ROCK) label = 'Rock: chisel it';
    else if (hit && tool === 'pick' && hit.k === ORE && c.g.clean < SPOTLESS) label = 'Careful: ore';
    this.ui.setCrosshair?.({ visible: !touch || !!hit, kind, label });
    this.updateCard(c, !busy);
  }

  /** A ray (camera space) through a point on the screen (CSS px). */
  tapRay(x, y) {
    const cam = this.owner.camera, eng = this.owner.game.engine;
    const W = eng.width * eng.scale, Hh = eng.height * eng.scale;
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    const nx = (x / W) * 2 - 1, ny = -((y / Hh) * 2 - 1);
    return new THREE.Vector3(nx * tanV * cam.aspect, ny * tanV, -1).normalize();
  }

  /** The crosshair (or a tap) ray into the held clump's grid → grid hit + the ray in grid coords. */
  aim(c, ray, assist = false) {
    const grp = c.group, g = c.g;
    const s = grp.scale.x;
    _q.copy(grp.quaternion).invert();
    // camera-space origin (0,0,0) → grid coords
    const o = _v.set(0, 0, 0).sub(grp.position).applyQuaternion(_q).multiplyScalar(1 / s).add(_v3.fromArray(g.pivot));
    const d = _v2.copy(ray || AXZ).applyQuaternion(_q).normalize();
    const hit = g.raycast(o.x, o.y, o.z, d.x, d.y, d.z) || (assist ? g.nearRay(o.x, o.y, o.z, d.x, d.y, d.z, 2.5) : null);
    if (hit) { hit.o = o.clone(); hit.d = d.clone(); }
    return hit;
  }

  /** A blow / stroke on the clump in paw. */
  strike(tool, it, ray) {
    const c = this.held;
    if (!c || c.state !== 'held') return;
    const vm = this.owner.vm, g = c.g;
    const hit = this.aim(c, ray, true);
    if (!hit) {
      if (tool === 'pick' || tool === 'chisel') { vm?.impact(tool, 0.15); this.audio?.play('whoosh', { vol: 0.15 }); }
      return;
    }
    const ore = ORES[c.spec.oreId] || {};
    const power = it?.power || 1;
    const px = hit.x + 0.5, py = hit.y + 0.5, pz = hit.z + 0.5;
    let res = null, loss = 0;
    const before = g.clean;
    if (tool === 'pick') {
      const r = clamp(3.3 + power * 0.5, 3.6, 5.8);
      // the spall breaks off along a plane facing back up the blow, tilted a little at random
      const sd = (this.time * 1000) | 0, j = [h3(sd, 1, 2, 3) - 0.5, h3(sd, 4, 5, 6) - 0.5, h3(sd, 7, 8, 9) - 0.5];
      const nx = -hit.d.x + hit.nx * 0.4 + j[0] * 0.6, ny = -hit.d.y + hit.ny * 0.4 + j[1] * 0.6, nz = -hit.d.z + hit.nz * 0.4 + j[2] * 0.6, nl = Math.hypot(nx, ny, nz) || 1;
      res = g.bite(px + hit.d.x * 1.4, py + hit.d.y * 1.4, pz + hit.d.z * 1.4, r, nx / nl, ny / nl, nz / nl, sd);
      loss = res.oreHit ? (ore.frag ?? 12) * 0.45 * Math.min(1, 0.2 + res.oreHit / 12) * (0.75 + 0.25 * power) : 0;
      vm?.impact('pick', 0.55 + Math.min(0.4, res.removed.length / 120));
      this.audio?.play('hit', { snd: MAT[c.spec.rock]?.snd || 'stone' });
      if (res.removed.length > 30) this.audio?.play('break', { snd: MAT[c.spec.rock]?.snd || 'stone', vol: 0.5 });
      this.owner.energy?.(0.25);
    } else if (tool === 'chisel') {
      res = g.nibble(hit, [hit.d.x, hit.d.y, hit.d.z], Math.round((power > 1 ? 18 : 12) + (hit.k === SOFT ? 5 : 0)), (this.time * 1000) | 0);
      vm?.impact('chisel', 0.4);
      if (res.tink) { this.audio?.play('chisel', { vol: 0.5 }); this.audio?.play('clang', { vol: 0.15 }); }
      else this.audio?.play('chisel');
      this.owner.energy?.(0.08);
    } else if (tool === 'brush') {
      res = g.sweep(px + hit.nx * 0.5, py + hit.ny * 0.5, pz + hit.nz * 0.5, 5 + Math.round(power * 3), 3.4);
      if (Math.random() < 0.45) this.audio?.play('brush', { vol: 0.5 });
      if (!res.removed.length && hit.k === ROCK) this.say('brushrock', 'The brush only sweeps loose dirt. Chip the rock with the <b>chisel</b>.', 'warn', 10);
      this.owner.energy?.(0.02);
    } else if (tool === 'drill') {
      res = g.bore(px + hit.d.x * 0.8, py + hit.d.y * 0.8, pz + hit.d.z * 0.8, 2.1 + (power - 3) * 0.1);
      loss = res.oreHit ? (ore.frag ?? 12) * 0.12 * Math.min(1, 0.3 + res.oreHit / 8) : 0;
      if (Math.random() < 0.5) this.audio?.play('hit', { snd: 'stone', vol: 0.35 });
      this.owner.energy?.(0.06);
    }
    if (!res) return;
    // effects at the spot, in the world
    const hp = this.cellWorld(c, hit.i, new THREE.Vector3());
    const out = this.outDir(c, hit, new THREE.Vector3());
    const all = res.removed.concat(res.detached || []);
    if (all.length) this.crumbs(c, all, [out.x, out.y, out.z], tool === 'brush' ? 0.4 : tool === 'pick' ? 1.1 : 0.75, tool);
    if (tool === 'brush') this.fx?.puff(hp.x, hp.y, hp.z, 3, col01(c.g.pal[2]), [out.x, out.y, out.z], 0.015);
    if (res.oreHit) {
      loss *= this.st?.mineBonus?.().clean ?? 1; // Steady Paws (the Miners' Board)
      loss /= this.st?.skill?.('clean') || 1; // the skill tree's steady paws
      c.qLoss += loss;
      c.dmgN += res.oreHit;
      this.audio?.play('ore_damage');
      this.fx?.sparks(hp.x, hp.y, hp.z, 6, c.oreMain, [out.x, out.y, out.z], 1.4);
      const sp = this.owner.toScreen?.(hp);
      if (sp && loss >= 0.5) this.ui.floatText?.(`-${Math.max(1, Math.round(loss))}%`, sp.x, sp.y, '#ff8a6a', 0.8);
      if (!this.flags.oreHit) { this.flags.oreHit = true; this.say('orehit', 'The pick scratches the ore! Use the <b>chisel</b> close to it.', 'warn', 30); }
    } else if (res.tink) {
      this.fx?.twinkle?.(hp.x + out.x * 0.01, hp.y + out.y * 0.01, hp.z + out.z * 0.01, c.oreCol, 0.012);
    }
    if (all.length || res.oreHit) {
      g.updateClean();
      c.dirty = true;
      if (all.length > 8) this.measure(c);
    }
    // spotless! the last crumbs of rock let go of the ore
    if (g.clean >= SPOTLESS && before < SPOTLESS) {
      const rest = g.strip();
      if (rest.length) { this.crumbs(c, rest, [out.x, out.y + 0.3, out.z], 0.5); this.audio?.play('debris', { vol: 0.5 }); }
      g.updateClean();
      c.dirty = true;
      this.measure(c);
      const v = this.value(c);
      this.audio?.play('sparkle');
      if (v.p) this.audio?.play('pristine');
      for (let k = 0; k < 10; k++) { const p = this.cellWorld(c, c.g.ore[(Math.random() * c.g.ore.length) | 0], new THREE.Vector3()); this.fx?.twinkle?.(p.x, p.y, p.z, c.oreCol, 0.014); }
      this.say('clean', v.p ? `Spotless and unscratched: a <b>pristine</b> ${c.it.name}!` : `Spotless! The ${c.it.name} is worth its full value now.`, 'good', 4);
    }
  }

  /** World direction out of the struck face. */
  outDir(c, hit, out) {
    c.group.updateMatrixWorld();
    out.set(hit.nx, hit.ny, hit.nz);
    if (!out.lengthSq()) out.set(0, 1, 0);
    c.group.getWorldQuaternion(_q);
    out.applyQuaternion(_q).normalize();
    return out;
  }

  /** Bits knocked off: flakes for the small stuff, a tumbling lump for a big piece. */
  crumbs(c, cells, out, speed = 1, tool = '') {
    const fx = this.fx, g = c.g, [hx, hy, hz] = g.pivot;
    const sz = CELL * (c.state === 'held' ? c.hold.scale : c.scale);
    c.group.updateMatrixWorld();
    const p = new THREE.Vector3();
    // the cells that broke loose of the clump in one piece fall as a body
    const big = cells.length >= 10 && this.ctx.bodies && tool !== 'brush';
    let taken = 0;
    if (big) {
      let sx = 0, sy = 0, sz2 = 0;
      for (const v of cells) { sx += v.x; sy += v.y; sz2 += v.z; }
      const vox = cells.map((v) => ({ x: v.x, y: v.y, z: v.z, c: g.pal[v.c] }));
      const b = this.ctx.bodies.spawn(vox, { scale: sz * VOX, life: 1.4 + Math.random(), bounce: 0.3, vel: [out[0] * speed * 1.2, 0.6 + out[1] * speed, out[2] * speed * 1.2] });
      if (b) {
        p.set(sx / cells.length + 0.5 - hx, sy / cells.length + 0.5 - hy, sz2 / cells.length + 0.5 - hz);
        c.group.localToWorld(p);
        b.pos.copy(p);
        b.mesh.position.copy(p);
        c.group.getWorldQuaternion(_q);
        b.rot.setFromQuaternion(_q);
        b.mesh.rotation.copy(b.rot);
        b.spin.multiplyScalar(0.4);
        taken = cells.length;
      }
    }
    // flakes (a sample of the cells)
    const step = Math.max(1, Math.floor(cells.length / 14));
    for (let j = 0; j < cells.length; j += step) {
      const v = cells[j];
      p.set(v.x + 0.5 - hx, v.y + 0.5 - hy, v.z + 0.5 - hz);
      c.group.localToWorld(p);
      const col = col01(g.pal[v.c]);
      if (taken) { if (Math.random() < 0.5) fx?.flakes?.(p.x, p.y, p.z, 1, col, out, sz, speed); continue; }
      fx?.flakes?.(p.x, p.y, p.z, v.k === SOFT ? 1 : 2, col, out, sz, speed);
      if (v.k === SOFT && Math.random() < 0.5) fx?.puff?.(p.x, p.y, p.z, 1, col, out, 0.01);
    }
    if (cells.length > 4 && tool !== 'brush') {
      const v = cells[0];
      p.set(v.x + 0.5 - hx, v.y + 0.5 - hy, v.z + 0.5 - hz);
      c.group.localToWorld(p);
      fx?.puff?.(p.x, p.y, p.z, Math.min(5, cells.length / 6 | 0) + 1, col01(g.pal[2]), out, 0.02);
    }
  }

  /** Let go: it drops (or flies, if wound up / flicked) and lands with physics. */
  drop(c, charge = 0) {
    const pl = this.ctx.player, cam = this.owner.camera;
    const eye = pl.eye(), cq = this.camQuat(pl, new THREE.Quaternion());
    const grp = c.group;
    // world pose from the camera-space pose (the camera transform of this frame)
    const wp = grp.position.clone().applyQuaternion(cq).add(eye);
    const wq = cq.clone().multiply(grp.quaternion);
    const scale = grp.scale.x / CELL;
    cam.remove(grp);
    this.root.add(grp);
    c.state = 'world';
    c.scale = scale;
    c.pos.copy(wp);
    c.quat.copy(wq);
    this.measure(c);
    c.r = Math.max(0.03, c.r * scale);
    // never inside rock: back toward the eyes until it fits
    const dir = wp.clone().sub(eye);
    const L = dir.length();
    dir.normalize();
    for (let k = 0; k < 12 && this.overlaps(c.pos, c.r * 0.85); k++) c.pos.copy(eye).addScaledVector(dir, L * (1 - (k + 1) / 13));
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cq);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cq), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cq);
    const sp = charge > 0.12 ? 2 + charge * 6.5 : 0.9;
    c.vel.copy(f).multiplyScalar(sp).addScaledVector(up, charge > 0.12 ? 1 + charge * 1.5 : 0.5).add(pl.vel);
    // a flick of the view flings it sideways
    c.vel.addScaledVector(right, clamp(-this.yawRate, -12, 12) * L * 2.2);
    c.vel.addScaledVector(up, clamp(this.pitchRate, -10, 10) * L * 2.2);
    c.ang.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4).multiplyScalar(0.5 + charge * 2);
    c.asleep = false; c.restT = 0; c.grounded = false;
    if (c.xray) c.xray.visible = false;
    this.held = null;
    this.pending = null;
    this.dropBtn = null;
    this.card?.show(false);
    this.owner.vm?.use('brush', false); this.owner.vm?.use('drill', false); this.owner.vm?.use('xray', false);
    this.audio?.play('whoosh', { vol: 0.2 + charge * 0.4, pitch: 0.8 });
    this.pose(c);
    this.save(c);
  }

  /** Into the backpack (if there's room): it flies down into the bag, then the loot event. */
  stash(c) {
    const it = c.it, st = this.st, owner = this.owner;
    const counts = it.cat === 'mineral' || it.cat === 'gem';
    if (counts && st && (owner.trip ?? 0) >= st.bagCapacity()) {
      this.say('bagfull', `Bag full! (${owner.trip}/${st.bagCapacity()}) Drop it (<b>G</b>) or head home to unload.`, 'warn', 4);
      this.audio?.play('ui_error');
      return false;
    }
    c.state = 'stash';
    c.stashT = 0;
    c.stashFrom = c.group.position.clone();
    c.stashS = c.group.scale.x;
    c.stashTo = this.packTarget(0.42 * (c.hold?.k ?? 1));
    c.loot = this.lootOf(c);
    this.stashing.push(c);
    this.held = null;
    this.pending = null;
    this.card?.show(false);
    if (c.xray) c.xray.visible = false;
    this.owner.vm?.use('brush', false); this.owner.vm?.use('drill', false);
    this.owner.vm?.impact('none', 0.25);
    this.audio?.play('whoosh', { vol: 0.25, pitch: 1.2 });
    this.unsave(c);
    return true;
  }

  updateStash(c, dt, i) {
    c.stashT += dt;
    const e = clamp(c.stashT / STASH_T, 0, 1);
    const grp = c.group;
    // a little hop, then off into the backpack in the corner of the screen
    const k = e < 0.18 ? 0 : (e - 0.18) / 0.82;
    grp.position.lerpVectors(c.stashFrom, c.stashTo, k * k);
    grp.position.y += Math.sin(Math.min(1, e / 0.5) * Math.PI) * 0.035 * (1 - k);
    grp.scale.setScalar(c.stashS * (1 + Math.sin(Math.min(1, e / 0.18) * Math.PI) * 0.08 - k * 0.85));
    _q.setFromAxisAngle(AY, dt * 9);
    grp.quaternion.premultiply(_q);
    if (Math.random() < 0.5) { const p = this.worldPos(c, _v2); this.fx?.glints(p.x, p.y, p.z, c.oreCol); }
    if (e >= 1) {
      this.stashing.splice(i, 1);
      this.out.push({ loot: c.loot });
      this.kill(c);
    }
  }

  /** A point in camera space that sits over the HUD backpack (depth d), for the stash flight. */
  packTarget(d) {
    const cam = this.owner.camera, eng = this.owner.game.engine;
    const W = eng.width * eng.scale, Hh = eng.height * eng.scale;
    const r = this.ui.status?.packBtn?.getBoundingClientRect?.();
    let nx = 0.88, ny = 0.86;
    if (r && r.width && r.right > 0 && r.top < Hh) { nx = ((r.left + r.width / 2) / W) * 2 - 1; ny = -(((r.top + r.height / 2) / Hh) * 2 - 1); }
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    return new THREE.Vector3(nx * tanV * cam.aspect * d, ny * tanV * d, -d);
  }

  /** What the clump is worth as it is. */
  value(c) {
    const g = c.g;
    const clean = g.clean >= SPOTLESS ? 1 : g.clean;
    const cond = Math.max(1, Math.round(c.q0 - c.qLoss));
    const k = clean >= 1 ? 1 : 0.55 + 0.45 * Math.pow(clean, 1.5);
    const q = Math.max(1, Math.round(cond * k));
    const chance = c.p0 && c.dmgN === 0;
    const p = chance && clean >= 1;
    return { q, p, cond, clean, chance, price: sellPrice(c.item, q, p), full: sellPrice(c.item, cond, chance) };
  }

  lootOf(c) { const v = this.value(c); return { id: c.item, q: v.q, p: v.p }; }

  updateCard(c, show) {
    const card = this.card;
    if (!card) return;
    if (!show || c.hold.t < PICK_T * 0.6) { card.show(false); return; }
    card.show(true);
    const v = this.value(c);
    card.set({ icon: iconURL(c.item), name: c.it.name, cond: v.cond, clean: Math.floor(v.clean * 100), q: v.q, price: v.price, full: v.full, pristine: v.p, chance: v.chance });
    // anchor beside the clump on screen (camera-space projection)
    const cam = this.owner.camera, eng = this.owner.game.engine;
    const W = eng.width * eng.scale, Hh = eng.height * eng.scale;
    const tanV = Math.tan((cam.fov * Math.PI) / 360), asp = cam.aspect || W / Hh;
    const p = c.group.position, z = Math.max(0.05, -p.z);
    const sx = ((p.x / z) / (tanV * asp) * 0.5 + 0.5) * W, sy = (-(p.y / z) / tanV * 0.5 + 0.5) * Hh;
    const rpx = ((c.rCells * c.group.scale.x) / z) / tanV * 0.5 * Hh;
    const side = W / Hh > 1.15 ? 'right' : 'top';
    card.place(sx + rpx * 0.95, sy - rpx * 0.15, sx, sy, rpx, side);
  }

  // ------------------------------------------------------------ persistence
  /** Keep state.data.deep.clumps in step with the clumps lying around (and the one in paw). */
  save(c, full = true) {
    const deep = this.st?.data?.deep;
    if (!deep) return;
    deep.clumps ||= [];
    let e = c.entry;
    if (!e) {
      e = c.entry = { dep: c.dep, item: c.item, oreId: c.spec.oreId, seed: c.spec.seed, R: c.spec.R, crust: c.spec.crust, rock: c.spec.rock, peb: c.spec.peb, q0: c.q0, p0: c.p0 };
      deep.clumps.push(e);
    }
    const pl = this.ctx.player;
    if (c.state === 'world') { e.x = +c.pos.x.toFixed(3); e.y = +c.pos.y.toFixed(3); e.z = +c.pos.z.toFixed(3); e.q = [c.quat.x, c.quat.y, c.quat.z, c.quat.w].map((v) => +v.toFixed(4)); }
    else if (pl) { e.x = +pl.pos.x.toFixed(3); e.y = +(pl.pos.y + 0.2).toFixed(3); e.z = +pl.pos.z.toFixed(3); }
    e.qLoss = +c.qLoss.toFixed(2);
    e.dmgN = c.dmgN;
    if (full) {
      const fresh = { kind: c.g.kind0 };
      const d = c.g.diff(fresh);
      e.cut = d.cut; e.dmg = d.dmg;
    }
    if (this.st) this.st.dirty = true;
  }

  unsave(c) {
    const deep = this.st?.data?.deep;
    if (!deep?.clumps || !c.entry) return;
    const i = deep.clumps.indexOf(c.entry);
    if (i >= 0) deep.clumps.splice(i, 1);
    c.entry = null;
    if (this.st) this.st.dirty = true;
  }

  restore(e) {
    if (!ITEMS[e.item] || !isFinite(e.x)) { this.st.data.deep.clumps.splice(this.st.data.deep.clumps.indexOf(e), 1); return; }
    const spec = { seed: e.seed, item: e.item, oreId: e.oreId, R: e.R, crust: e.crust, rock: e.rock, peb: e.peb };
    const c = this.make(spec, { dep: e.dep, q0: e.q0, p0: e.p0, qLoss: e.qLoss, dmgN: e.dmgN });
    if (e.cut || e.dmg) { c.g.applyDiff(e.cut, e.dmg); this.measure(c); this.remesh(c); }
    c.entry = e;
    c.pos.set(e.x, e.y, e.z);
    if (e.q) c.quat.set(e.q[0], e.q[1], e.q[2], e.q[3]).normalize();
    c.asleep = !!e.q;
    c.supT = 0.2;
    this.pose(c);
  }

  kill(c) {
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
    c.state = 'gone';
    c.group.parent?.remove(c.group);
    c.rockMesh.geometry.dispose();
    c.oreMesh.geometry.dispose();
    c.xray?.geometry.dispose();
    c.mats.rock.dispose();
    c.mats.ore.dispose();
  }

  /** Scene ends: the clump in paw goes in the bag (or is set down if the bag is full); the rest stay. */
  dispose() {
    const ev = this.flush();
    for (const c of [...this.stashing]) { ev.push({ loot: c.loot }); this.kill(c); }
    this.stashing = [];
    const h = this.held;
    if (h) {
      this.held = null;
      const it = h.it, st = this.st, counts = it.cat === 'mineral' || it.cat === 'gem';
      if (!(counts && st && (this.owner.trip ?? 0) >= st.bagCapacity())) { ev.push({ loot: this.lootOf(h) }); this.unsave(h); this.kill(h); }
      else {
        // set it down at the mole's feet, to be found next time
        const pl = this.ctx.player;
        h.state = 'world';
        h.pos.set(pl.pos.x, pl.pos.y + h.r, pl.pos.z);
        this.save(h);
      }
    }
    for (const c of this.list) if (c.state === 'world') this.save(c);
    for (const c of [...this.list]) this.kill(c);
    this.card?.dispose();
    this.card = null;
    this.xrayMat.dispose();
    this.root.parent?.remove(this.root);
    if (this.addedCam) this.owner.camera.parent?.remove(this.owner.camera);
    return ev;
  }
}

const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** The world's object material, plus `lightK`: a clump held half a metre from the helmet lamp
 *  would glare, so the lamp and lights are dimmed for it (its glow is kept). */
function litMaterial(U, opts) {
  const m = makeObjectMaterial(U, opts);
  m.uniforms.lightK = { value: 1 };
  m.fragmentShader = m.fragmentShader.replace('uniform float flash;', 'uniform float flash;\n      uniform float lightK;').replace('vec3 col = c * L +', 'vec3 col = c * L * lightK +');
  return m;
}
const AXZ = new THREE.Vector3(0, 0, -1);
