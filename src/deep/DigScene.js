// First-person mining in the 3D underground. The mole tunnels out of the burrow walls, digs plates
// of rock that fly out as chunks, frees ore, follows the radar toward Deep Town, finds lift
// stations, and walks back into the burrow through its own tunnels.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { DeepWorld } from './World.js';
import { TerrainView } from './Terrain.js';
import { ChunkPool } from './ChunkPool.js';
import { FPSPlayer } from './Player.js';
import { Digger, breakable } from './Dig.js';
import { Bodies } from './Bodies.js';
import { Particles } from './Particles.js';
import { Ores } from './Ores.js';
import { Nugget } from './Nugget.js';
import { openLiftPanel, discoverLift, liftState, rideTo } from '../fps/lifts.js';
import { makeTerrainUniforms, MAX_LIGHTS } from './TerrainMaterial.js';
import { mouthBox, zoneAt, ZONE_DEPTHS, biomeAt, BIOMES, caveDensity } from './Generator.js';
import { VOX, M, MAT, ORE_BASE, voxelColor } from './materials.js';
import { h3 } from './noise.js';
import { roomSize } from '../iso/homeLayout.js';
import { ITEMS, sellPrice, HARD_ROCK_TIER, pickForTier } from '../data/items.js';
import * as EngineFx from '../core/Engine.js';
import { ZONES } from '../data/zones.js';
import { ORES } from '../data/ores.js';
import { iconURL } from '../gfx/PixelArt.js';
import { VoxelGrid, meshGridGreedy } from '../gfx/Voxel.js';
import { clamp, rand, chance, hexToRgb, formatGoldFull } from '../core/util.js';
import * as W from '../core/weight.js';
import { Build } from './Build.js'; // building part: blocks, ladders, torches, doors, chests; tools that break them

import { TOOL_KINDS, HOTBAR_N, hotbarOf } from '../core/hotbar.js';
// the build slot (slot 7) puts up what Build.js says: blocks on a 0.5 m grid, ladders, torches, doors…
const REACH = 2.3;
const vmModules = import.meta.glob('../fps/ViewModel.js');
// optional systems, built separately (see docs/DEEP.md): fantasy enemies, flowing fluids
const extModules = import.meta.glob(['./Enemies.js', './Fluids.js', './Props.js', './Clumps.js', './Prologue.js', './Explosives.js', './Ruins.js', './Traders.js', './Vegetation.js']);
const col01 = (hex) => { const c = hexToRgb(hex); return [c.r / 255, c.g / 255, c.b / 255]; };

export default class DigScene extends Scene {
  async enter(params = {}) {
    const g = this.game, st = g.state;
    this.state = st;
    this.audio = g.audio;
    this.hud = 'deep';
    this.allowMenus = true;
    this.post = { outline: true, vignette: 0.5, outlineAlpha: 0.6 };
    const d = st.data;
    if (!d.deep) d.deep = { seed: 1 + Math.floor(Math.random() * 1e6), tunnels: [], stations: [] };
    const deep = this.deep = d.deep;
    deep.stations ||= [];
    deep.explored ||= {};
    const [W, D] = roomSize(d.home?.level || 0);
    this.W = W; this.D = D;
    // a tunnel mouth for the wall we came through (new ones are remembered)
    const from = params.from || 'home';
    const wall = params.wall || 'n', t = params.t !== undefined ? +params.t : W / 2;
    if (from === 'home' && !deep.tunnels.some((m) => m.wall === wall && Math.abs(m.t - t) < 0.9)) deep.tunnels.push({ wall, t });
    liftState(st);
    this.lastMouth = { wall, t };
    this.world = new DeepWorld({ seed: deep.seed, W, D, tunnels: deep.tunnels });
    // generate and mesh far chunks in workers (?workers=0 keeps it all on the main thread)
    if (!/[?&]workers=0/.test(location.search)) {
      try { this.world.pool = new ChunkPool({ seed: deep.seed, opts: { W, D }, tunnels: deep.tunnels.map((m) => ({ wall: m.wall, t: m.t })) }); } catch (err) { this.world.pool = null; }
    }
    this.scene.background = new THREE.Color(0x030203);
    this.fov = 74;
    this.camera = new THREE.PerspectiveCamera(this.fov, g.engine.width / g.engine.height, 0.03, 60);
    this.U = makeTerrainUniforms();
    this.terrain = new TerrainView(this.scene, this.world, this.U);
    this.bodies = new Bodies(this.scene, this.world, this.U);
    this.fx = new Particles(this.scene, this.world, this.U);
    this.fx.setPixelScale(g.engine.height, this.fov);
    this.digger = new Digger(this.world);
    this.ores = new Ores(this.world);
    this.player = new FPSPlayer(this.world);
    this.stakes = deep.stakes ||= [];
    this.slot = 0;
    this.trip = 0;
    this.tripValue = 0;
    this.tripItems = [];
    this.useT = 0;
    this.swing = null;
    this.drillHeat = 0;
    this.kick = new THREE.Vector3();
    this.shakeAmp = 0;
    this.flags = {};
    this.toastCd = {};
    this.wish = { x: 0, z: 0 };
    // spawn
    const pl = this.player;
    // arriving by lift: step out of its cage (the open side faces +z)
    const liftId = from === 'lift' ? params.lift || 'L0' : from === 'town' ? 's' + clamp(+params.station || 0, 0, 5) : null;
    const lift = liftId && this.world.plan.lifts.find((l) => l.id === liftId);
    if (from === 'fall' && this.world.plan.prologue) {
      const P = this.world.plan.prologue;
      pl.pos.set(P.x, P.y + 0.05, P.z);
      pl.yaw = 0;
    } else if (lift) {
      pl.pos.set(lift.x, lift.y + 0.02, lift.z + (liftId[0] === 'L' ? 0 : 0));
      pl.yaw = Math.PI;
      this.lastLift = lift;
      discoverLift(st, lift);
    } else {
      const b = mouthBox(this.world.plan, wall, t);
      pl.pos.set((b.x0 + b.x1) / 2 + b.dir[0] * 0.15, 0.01, (b.z0 + b.z1) / 2 + b.dir[2] * 0.15);
      pl.yaw = Math.atan2(-b.dir[0], -b.dir[2]);
    }
    this.spawnPos = pl.pos.clone();
    // test hooks (docs/DEEP.md)
    const plan = this.world.plan;
    this.debug = {
      /** Play a gathering minigame to the end headless (deep/gather: window.__gather.run). */
      gather: (id, o) => window.__gather?.run?.(id, o),
      biomeAt: (x, y, z) => biomeAt(plan, x, y, z),
      density: (x, y, z) => caveDensity(plan, x, y, z),
      /** an open spot with a floor (meters) where test(biome, depth, x, y, z) holds, or null */
      find: (test, { r = 60, d0 = 4, d1 = 80, tries = 40000, seed = 1 } = {}) => {
        let h = seed;
        const rnd = () => ((h = (h * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < tries; i++) {
          const x = pl.pos.x + (rnd() * 2 - 1) * r, z = pl.pos.z + (rnd() * 2 - 1) * r;
          let y = -(d0 + rnd() * (d1 - d0));
          if (caveDensity(plan, x, y, z) < 0.04) continue;
          let k = 0;
          while (k++ < 60 && caveDensity(plan, x, y - 0.1, z) > 0) y -= 0.1;
          if (k >= 60 || caveDensity(plan, x, y + 1.1, z) < 0.03) continue;
          if (test(biomeAt(plan, x, y + 0.5, z), -y, x, y, z)) return { x, y: y + 0.1, z };
        }
        return null;
      },
      teleport: (x, y, z, yaw = pl.yaw, pitch = 0) => { pl.pos.set(x, y, z); pl.vel.set(0, 0, 0); pl.yaw = yaw; pl.pitch = pitch; this.terrain.warm(x, y + 0.5, z, 2); },
    };
    this.terrain.warm(pl.pos.x, pl.pos.y + 0.5, pl.pos.z, 2);
    // first-person hands and tools (when the view model module is present)
    this.vm = null;
    const load = vmModules['../fps/ViewModel.js'];
    if (load) {
      try {
        const mod = await load();
        this.vm = new mod.ViewModel();
        this.vm.resize(g.engine.width / g.engine.height);
        if (this.vm.world) this.scene.add(this.vm.world); // the x-ray beam haze lives in the world
      } catch (e) { console.warn('view model failed', e); }
    }
    // enemies + fluids (optional modules; the scene runs without them)
    this.enemies = null;
    this.fluids = null;
    this.props = null;
    this.clumps = null;
    this.prologue = null;
    this.explosives = null;
    this.ruins = null;
    this.traders = null;
    this.vegetation = null; // grass, ferns, roots, vines: textured cards that sway (Vegetation.js, optional)
    const ctx = { scene: this.scene, world: this.world, U: this.U, fx: this.fx, bodies: this.bodies, audio: this.audio, state: st, ui: g.ui, player: pl, plan: this.world.plan, scene3: this.scene, owner: this, params };
    for (const [path, Name, key] of [['./Enemies.js', 'Enemies', 'enemies'], ['./Fluids.js', 'Fluids', 'fluids'], ['./Props.js', 'Props', 'props'], ['./Clumps.js', 'Clumps', 'clumps'], ['./Prologue.js', 'Prologue', 'prologue'], ['./Explosives.js', 'Explosives', 'explosives'], ['./Ruins.js', 'Ruins', 'ruins'], ['./Traders.js', 'Traders', 'traders'], ['./Vegetation.js', 'Vegetation', 'vegetation']]) {
      const load = extModules[path];
      if (!load) continue;
      try { const mod = await load(); this[key] = new mod[Name](ctx); } catch (e) { console.warn(Name + ' failed', e); }
    }
    // Nugget tags along once she's fallen down here with the mole
    this.nugget = null;
    if (st.flag('nugget')) {
      try { this.nugget = new Nugget({ scene3: this.scene, world: this.world, player: pl, audio: this.audio, fx: this.fx, owner: this }); } catch (e) { console.warn('nugget failed', e); }
    }
    // the opening: the fall drops the mole into Old Star's dig
    if (from === 'fall') {
      const sp = this.prologue?.spawn?.();
      if (sp) { pl.pos.set(sp.x, sp.y, sp.z); pl.yaw = sp.yaw ?? pl.yaw; this.terrain.warm(sp.x, sp.y + 0.5, sp.z, 2); }
    }
    if (this.fluids || this.props) this.world.onChange = (vx, vy, vz, old, m) => { this.fluids?.onVoxel(vx, vy, vz, old, m); this.props?.onVoxel?.(vx, vy, vz, old, m); };
    this.bodies.hooks = {
      tick: (b, sp) => { if (chance(0.6)) this.audio.play('debris', { vol: clamp(sp / 8, 0.2, 0.7) }); if (sp > 3) this.fx.dust(b.pos.x, b.pos.y - b.r, b.pos.z, 2, [0.5, 0.42, 0.34], 0.05); },
      gone: (b) => this.fx.dust(b.pos.x, b.pos.y, b.pos.z, 3, [0.5, 0.42, 0.34], 0.06),
      collect: (b) => this.collect(b.pickup),
      // a find that won't fit waits on the floor (unless Nugget is close enough to take it)
      canTake: (b) => {
        const id = b.pickup?.id;
        if (!id || !st.canAdd || this.whereTo(id)) return true;
        if (st.canAdd(id, 1)) this.tooHeavy(id); else this.bagFull(id);
        return false;
      },
    };
    this.updateHotbar();
    if (g.ui.setRadar) g.ui.setRadar((o) => this.radar(o), { heading: () => this.player.yaw });
    this.showBag();
    if (!st.flag('escaped') && !this.flags.hintRadar) {
      this.flags.hintRadar = true;
      setTimeout(() => { if (g.scene === this) this.say('radar', 'Your radar hums: <b>Deep Town</b> is somewhere down there. Dig toward it.', 'good', 99); }, 2500);
    }
    this.music = 'mine';
  }

  // ------------------------------------------------------------------ helpers
  say(key, html, kind = 'warn', cd = 4) {
    if (this.toastCd[key] && this.time - this.toastCd[key] < cd) return;
    this.toastCd[key] = this.time;
    this.game.ui.toast(html, { kind });
  }
  isTouch() { return document.documentElement.classList.contains('is-touch'); }
  get slotName() { return hotbarOf(this.state)[this.slot] || 'none'; }
  toolItem(slot) {
    const st = this.state;
    if (slot === 'pick') return st.equipped('pick');
    if (slot === 'stake') return st.count('glow_stake') ? ITEMS.glow_stake : null;
    if (slot === 'food') return this.bestFood();
    if (slot === 'build') return this.builder?.item?.() || ITEMS.blk_ladder; // the selected block (Build.js)
    if (slot === 'dynamite') return this.bestBlast();
    return st.equipped(slot);
  }
  /** The strongest explosive in the bag (items with a blast radius). */
  bestBlast() {
    let best = null;
    for (const gr of this.state.inventory((it) => it && it.blast)) { const it = ITEMS[gr.id]; if (!best || it.blast > best.blast) best = it; }
    return best;
  }
  bestFood() {
    let best = null;
    for (const gr of this.state.inventory((it) => it && (it.cat === 'food' || it.food))) {
      const it = ITEMS[gr.id];
      if (!best || (it.energy || it.food || 0) > (best.energy || best.food || 0)) best = it;
    }
    return best;
  }
  updateHotbar() {
    const st = this.state;
    const icons = { dynamite: ITEMS.dynamite ? 'dynamite' : 'glow_stake', pick: 'pick_rusty', chisel: 'chisel_basic', brush: 'brush_basic', drill: 'drill_steam', xray: 'xray_lamp', stake: 'glow_stake', food: 'grub_bar' };
    const bar = hotbarOf(st);
    if (this.slot >= HOTBAR_N) this.slot = 0;
    const slots = bar.map((s, i) => {
      if (!s) return { icon: iconURL('pick_rusty'), key: String(i + 1), label: 'Empty: put a tool here from the backpack', off: true, empty: true };
      const it = this.toolItem(s);
      const n = s === 'stake' ? st.count('glow_stake') : (s === 'food' || s === 'dynamite') && it ? st.count(it.id) : s === 'build' && it && this.builder && !this.builder.freeBuild() ? st.count(it.id) : undefined;
      const label = s === 'build' ? (this.builder?.label?.() || 'Build') : it ? it.name : '—';
      return { icon: iconURL(it ? it.id : icons[s]), key: String(i + 1), label, off: !it, n, meter: s === 'drill' && it ? this.drillHeat : undefined };
    });
    this.game.ui.setHotbar(slots, this.slot, (i) => this.selectSlot(i));
    const it = this.toolItem(this.slotName);
    if (this.vm) {
      const hand = this.builder?.handTool?.(this.slotName); // the block in the paw, or the axe / spade the dig slot picked
      this.vm.setTool(hand ? hand.kind : this.slotName === 'build' ? 'beam' : it ? this.slotName : 'none', hand ? hand.opts : { item: it?.id });
    }
  }
  selectSlot(i) {
    const n = (i + HOTBAR_N) % HOTBAR_N;
    if (this.slot === n) { if (hotbarOf(this.state)[n] === 'build') this.cycleBuild(); return; }
    this.slot = n;
    this.audio.play('ui_click', { pitch: 1.3 });
    this.updateHotbar();
  }
  energy(n) { if (n > 0) this.state.useEnergy((this.state.hasBuff('sturdy') ? n * 0.6 : n) / (this.state.skill?.('stamina') || 1)); }
  shake(a) { if (this.state.data.settings.shake) this.shakeAmp = Math.max(this.shakeAmp, a); }

  // ------------------------------------------------------------------ frame
  update(dt) {
    super.update(dt);
    const g = this.game, inp = g.input, pl = this.player, st = this.state;
    this.U.time.value = this.time;
    const busy = this.leaving || g.ui.isPanelOpen() || !!this.gather; // a 3D gathering close-up has the paws
    // look
    let look = inp.takeLook();
    if (this.clumps?.filterLook) look = this.clumps.filterLook(look) ?? look; // turning a held clump
    if (!busy) pl.look(look.dx, look.dy, this.isTouch() ? 0.0055 : 0.0026);
    if (!busy && inp.mousePressed(0) && !inp.pointerLocked && !this.isTouch()) { inp.lockPointer(); inp.mouse.pressed[0] = false; }
    // tools
    if (!busy) {
      for (let k = 0; k < HOTBAR_N; k++) if (inp.pressed('Digit' + (k + 1))) this.selectSlot(k);
      if (inp.mouse.wheel) this.selectSlot(this.slot + Math.sign(inp.mouse.wheel));
      if (inp.pressed('KeyQ')) this.eatBest();
      if (inp.pressed('KeyR') && this.slotName === 'build') this.cycleBuild();
      if (inp.pressed('KeyE')) this.interact();
    }
    // block: hold mouse 2 or F (touch: the block button holds F); not while turning a held clump
    const blockIn = !busy && !this.clumps?.held && (inp.isDown('KeyF') || (inp.mouseDown(2) && !this.isTouch()));
    if (blockIn && !this.blocking) this.blockT = 0;
    this.blocking = blockIn;
    this.blockT = blockIn ? (this.blockT || 0) + dt : 0;
    this.vm?.block?.(blockIn);
    // move
    const mv = { x: inp.axisX(), y: inp.axisY() };
    // where the mole is trying to go (world xz), even when a wall stops it
    const sy = Math.sin(pl.yaw), cy = Math.cos(pl.yaw);
    this.wish = busy ? { x: 0, z: 0 } : { x: -sy * mv.y + cy * mv.x, z: -cy * mv.y - sy * mv.x };
    const exhausted = st.energy < 8;
    const load = this.weigh(dt);
    const ev = pl.update(dt, mv, { jump: inp.pressed('Space'), jumpHeld: inp.isDown('Space'), run: inp.isDown('ShiftLeft', 'ShiftRight') && !exhausted && load.run, crouch: inp.isDown('KeyC'), jumpMul: (st.hasBuff('bouncy') ? 1.35 : 1) * load.jump, frozen: busy, speedMul: (exhausted ? 0.6 : 1) * (st.skill?.('speed') || 1) * (this.blocking ? 0.55 : 1) * (this.nugget?.carrying ? 0.7 : 1) * load.speed });
    // hauling a heavy pack is hard work
    if (load.r > 1 && !busy && (mv.x || mv.y) && pl.grounded) this.energy(dt * 0.3 * Math.min(2, load.r - 1));
    if (ev.landed > 8) this.enemies?.noise?.(pl.pos.x, pl.pos.y, pl.pos.z, 3, 'land');
    if (ev.landed) { this.audio.play('land', { hard: ev.landed > 8 }); this.fx.dust(pl.pos.x, pl.pos.y + 0.05, pl.pos.z, Math.min(10, ev.landed | 0), [0.5, 0.42, 0.34], 0.2); }
    if (ev.fallDamage) this.hurt(Math.round(ev.fallDamage), 'fall');
    if (ev.jump) this.energy(0.2);
    if (ev.splash && !this.fluids) { this.audio.play('splash'); this.fx.splash(pl.pos.x, pl.pos.y + 0.4, pl.pos.z, 1.2); } // Fluids splashes on its own
    if (pl.climbing) { if (!pl.onLadder) this.energy(0.9 * dt); if (chance(dt * 5)) this.audio.play('climb'); }
    // the deep zones wear you down a little: frost in the Frost Vault, heat in the Magma Deep
    {
      const z = this.zone || 1;
      if (z === 5 && !st.protects('cold')) { st.useEnergy(0.22 * dt * (st.hasBuff('warm') ? 0.3 : 1)); if (!st.hasBuff('warm')) this.say('cold', 'Brr. The cold is <b>sapping your energy</b>. A warm meal would help.', 'warn', 120); }
      else if (z === 4 && !st.protects('heat')) { st.useEnergy(0.18 * dt * (st.hasBuff('cool') ? 0.4 : 1)); if (!st.hasBuff('cool')) this.say('heat', 'The heat down here is <b>draining you</b>. Something cooling to eat would help.', 'warn', 120); }
    }
    if (pl.inLava && !st.protects('heat')) { st.useEnergy(18 * dt * (st.hasBuff('cool') ? 0.4 : 1)); if (chance(dt * 4)) this.audio.play('sizzle'); this.say('lava', '<b>LAVA!</b> Get out!', 'bad', 2); for (let k = 0; k < 2; k++) this.fx.ember(pl.pos.x, pl.pos.y + 0.3, pl.pos.z); }
    if (pl.grounded && pl.speed > 0.6) {
      this.stepT = (this.stepT || 0) - dt * pl.speed / 2.4;
      if (this.stepT <= 0) { this.stepT = 1; this.audio.play('step', { vol: 0.35 }); this.energy(0.04); }
    }
    // dig / use
    const held = !!this.clumps?.capture();
    if (held) { if (this.vm) this.vm.use(this.slotName, false); }
    else { this.updateTarget(); this.useTools(dt, busy); }
    this.updateGhost(held || busy);
    if (this.clumps) this.events(this.clumps.update(dt, { player: pl, eye: pl.eye(), forward: pl.forward(), time: this.time, busy }));
    // world sim
    // hit-stop: the world holds its breath for a few frames when a blow breaks rock
    const sdt = this.hitStop > 0 ? dt * 0.15 : dt;
    this.hitStop = Math.max(0, (this.hitStop || 0) - dt);
    this.bodies.update(sdt, pl.eye(), pl.pos);
    if (this.fluids) this.fluids.update(dt, { player: pl, eye: pl.eye(), time: this.time });
    if (this.nugget) this.nugget.update(dt);
    if (this.prologue) this.events(this.prologue.update(dt, { player: pl, eye: pl.eye(), time: this.time, busy }));
    if (this.explosives) this.events(this.explosives.update(dt, { player: pl, eye: pl.eye(), time: this.time }));
    if (this.props) this.props.update(dt, { player: pl, eye: pl.eye(), time: this.time });
    if (this.ruins) this.events(this.ruins.update(dt, { player: pl, eye: pl.eye(), time: this.time }));
    if (this.traders) this.events(this.traders.update(dt, { player: pl, eye: pl.eye(), time: this.time, busy }));
    if (this.vegetation) this.events(this.vegetation.update(dt, { player: pl, eye: pl.eye(), time: this.time, busy }));
    if (this.enemies) {
      this.events(this.enemies.update(dt, { player: pl, eye: pl.eye(), forward: pl.forward(), time: this.time, busy, lamp: this.U.lampRange.value, blocking: !!this.blocking, blockT: this.blockT || 0 }));
    }
    this.fx.update(sdt);
    this.ambient(dt);
    this.updateProgress(dt);
    // camera (with kick and shake)
    const eye = pl.eye();
    const bob = pl.grounded ? Math.sin(pl.bobT * 2) * 0.022 * clamp(pl.speed / 3, 0, 1) : 0;
    const kf = Math.max(0, 1 - dt * 16);
    this.kick.multiplyScalar(kf);
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.4);
    const sh = this.shakeAmp;
    this.camera.position.set(eye.x + (Math.random() - 0.5) * sh * 0.05, eye.y + bob + (Math.random() - 0.5) * sh * 0.05, eye.z + (Math.random() - 0.5) * sh * 0.05);
    this.camera.rotation.set(pl.pitch + this.kick.x, pl.yaw + this.kick.y, this.kick.z, 'YXZ');
    this.camera.updateMatrixWorld();
    this.gather?.frame?.(dt); // the gathering close-up (deep/gather) steers the camera and paws
    this.game.convo?.director?.apply(this.camera, dt); // cutscene talk camera (src/fx/director.js) [convo hook]
    // terrain + lights
    this.terrain.update(pl.pos.x, pl.pos.y + 0.5, pl.pos.z, 7);
    this.terrain.cull(eye.x, eye.y, eye.z, this.U.fogDist.value + 2);
    this.lights(eye);
    const h = this.U.hit.value; h.w = Math.max(0, h.w - dt * 5);
    if (this.post.flash) this.post.flash = Math.max(0, this.post.flash - dt * 1.5);
    // hands and tools
    if (this.vm) {
      const lampK = clamp(st.lightRadius() / 5, 0.6, 1.6);
      this.vm.update(dt, { speed: pl.speed, grounded: pl.grounded, climbing: pl.climbing, swimming: pl.inWater, look, lamp: { color: this.U.lampCol.value, intensity: lampK }, ambient: this.U.ambient.value, camera: this.camera, heat: this.drillHeat });
    }
    this.hudTick(dt);
  }

  /** Events from enemies, critters and props: damage, toasts, loot for the backpack. */
  events(evs) {
    const pl = this.player;
    for (const e of evs || []) {
      if (e.damage) {
        // a blocked blow (combat.js already rang it and queued the shake): a parry flashes gold
        if (e.parried) { this.post.flash = 0.25; this.post.flashColor = 0xfff0c0; this.act('block', { perfect: true }); }
        else if (e.blocked) this.act('block', { perfect: false });
        this.hurt(e.damage, e.kind || 'enemy', !!(e.blocked || e.parried));
        if (e.push) pl.vel.add(new THREE.Vector3(...e.push));
      } else if (e.parried || e.blocked) {
        if (e.parried) { this.post.flash = 0.25; this.post.flashColor = 0xfff0c0; }
        this.act('block', { perfect: !!e.parried });
      }
      if (e.shake) this.shake(e.shake);
      if (e.hitStop) this.hitStop = Math.max(this.hitStop || 0, e.hitStop);
      if (e.energy) this.state.useEnergy(e.energy);
      if (e.say) this.say(e.key || e.say, e.say, e.tone || 'warn', e.cd ?? 4);
      if (e.loot) this.collect(e.loot);
      if (e.act) this.act(e.act.type, e.act);
    }
  }

  /** Tell everyone what the player did (quests, skills, milestones, the map: docs/REMAKE.md). */
  act(type, data = {}) { this.state.emit('act', { ...data, type }); }

  /** Reach along the crosshair, clipped to the rock it hits. */
  reach() { return this.target ? Math.min(REACH, this.target.dist + 0.05) : REACH; }

  updateTarget() {
    const pl = this.player;
    const eye = pl.eye(), f = pl.forward();
    const hit = this.world.raycast(eye.x, eye.y, eye.z, f.x, f.y, f.z, REACH);
    this.target = hit;
    const ui = this.game.ui;
    if (!ui.setCrosshair) return;
    const reach = hit ? Math.min(REACH, hit.dist + 0.05) : REACH;
    // something to pick or catch (props' plants, critters) comes first
    const use = this.prologue?.target?.(eye, f, reach) || this.clumps?.target(eye, f, reach) || this.nugget?.target?.(eye, f, reach) || this.traders?.target?.(eye, f, reach) || this.ruins?.target?.(eye, f, reach) || this.builder?.target?.(eye, f, reach) || this.props?.target?.(eye, f, reach) || this.enemies?.catchTest?.(eye, f, reach);
    if (use) { ui.setCrosshair({ visible: true, kind: 'use', label: use.label }); return; }
    const foe = this.enemies?.hitTest(eye, f, reach);
    if (foe) { ui.setCrosshair(foe.passive ? { visible: true, kind: 'rock', label: foe.constructor.info?.name || '' } : { visible: true, kind: 'enemy' }); return; }
    if (!hit) { ui.setCrosshair({ visible: true, kind: 'none' }); return; }
    const m = MAT[hit.m];
    const ore = hit.m >= ORE_BASE;
    if (hit.m === M.DOOR) { ui.setCrosshair({ visible: true, kind: 'use', label: 'Home' }); return; }
    if (this.liftNear()) { ui.setCrosshair({ visible: true, kind: 'use', label: `Ride the lift` }); return; }
    ui.setCrosshair({ visible: true, kind: ore ? 'ore' : breakable(hit.m) ? 'rock' : 'none', label: m ? m.name : '' });
  }

  useTools(dt, busy) {
    const inp = this.game.input, st = this.state;
    if (this.nugget?.carrying) return; // paws full: carrying her coop
    this.useT -= dt;
    this.drillHeat = Math.max(0, this.drillHeat - dt * (this.slotName === 'drill' && inp.mouseDown(0) ? 0 : 0.35));
    const want = !busy && inp.mouseDown(0) && (inp.pointerLocked || this.isTouch()) && !this.leaving && !this.blocking;
    const tool = this.slotName;
    const it = this.toolItem(tool);
    if (this.swing) {
      this.swing.t += dt;
      if (!this.swing.hit && this.swing.t >= this.swing.windup) { this.swing.hit = true; if (this.swing.fn) this.swing.fn(); else this.strike(); }
      if (this.swing.t >= this.swing.dur) this.swing = null;
    }
    if (this.vm) this.vm.use(tool, want && (tool === 'brush' || tool === 'drill' || tool === 'xray') && !!it);
    if (!want || !it) return;
    if (tool === 'pick') {
      if (!this.swing && this.useT <= 0) {
        const rate = (it.rate || 0.36) * this.bonus('rate');
        this.useT = rate * (st.hasBuff('zippy') ? 0.8 : 1) + 0.06;
        this.swing = { t: 0, windup: 0.13, dur: this.useT, hit: false };
        if (this.vm) this.vm.swing('pick', 0.13);
        this.audio.play('whoosh', { vol: 0.25, pitch: 1.4 });
      }
    } else if (tool === 'chisel') {
      // the mallet cocks back and knocks the chisel home
      if (this.useT <= 0 && !this.swing) { this.useT = (it.rate || 0.2) * this.bonus('rate') + 0.05; this.swing = { t: 0, windup: 0.1, dur: this.useT, hit: false, fn: () => this.chiselHit(it) }; if (this.vm) this.vm.swing('chisel', 0.1); }
    } else if (tool === 'brush') {
      if (this.useT <= 0) { this.useT = it.rate || 0.12; this.brushHit(it); }
    } else if (tool === 'drill') {
      if (this.drillHeat >= 1) { if (!this.flags.hot) { this.flags.hot = true; this.audio.play('overheat'); this.say('drill', 'The drill is too hot! Let it cool.', 'warn', 3); } return; }
      this.flags.hot = false;
      this.drillHeat = Math.min(1, this.drillHeat + dt * (it.heatRate || 0.3));
      if (this.useT <= 0) { this.useT = 0.07; this.drillHit(it); }
    } else if (tool === 'xray') {
      this.U.xray.value = 1;
      this.events(this.enemies?.xrayAt?.(this.player.eye(), this.player.forward(), 6));
      if (!this.xrayOn) { this.xrayOn = true; this.audio.play('xray_on'); }
      this.energy(0.25 * dt);
    } else if (tool === 'stake') {
      if (this.useT <= 0 && inp.mousePressed(0)) { this.useT = 0.4; this.placeStake(); }
    } else if (tool === 'dynamite') {
      if (this.useT <= 0 && inp.mousePressed(0) && this.explosives) {
        this.useT = 0.6;
        const evs = this.explosives.throw(it, this.player.eye(), this.player.forward());
        if (evs !== null && evs !== false) { st.removeItem(it.id, 1); this.events(evs); this.updateHotbar(); if (this.vm) this.vm.swing('dynamite', 0.12); }
      }
    } else if (tool === 'build') {
      // a click puts one down; holding the button keeps placing (Minecraft-like)
      this.buildHold = inp.mousePressed(0) ? 0 : (this.buildHold || 0) + dt;
      if (this.useT <= 0 && (inp.mousePressed(0) || this.buildHold > 0.32)) { this.useT = 0.26; this.build(); }
    } else if (tool === 'food') {
      if (this.useT <= 0 && inp.mousePressed(0)) { this.useT = 0.6; this.eatBest(); }
    }
  }

  /** An upgrade multiplier from the Miners' Board (state.mineBonus), 1 when there is none. */
  bonus(k) {
    const b = this.state.mineBonus?.();
    const v = b ? b[k] : 1;
    const s = this.state.skill?.(k), m = typeof s === 'number' && s > 0 ? s : 1;
    // skills read ≥ 1 = better; swing time (rate) and ore scratches (clean) go down as they go up
    return (typeof v === 'number' && v > 0 ? v : 1) * (k === 'rate' || k === 'clean' ? 1 / m : m);
  }

  /** The pick lands (timed by the swing). */
  strike() {
    const st = this.state, hit = this.target;
    const it = st.equipped('pick');
    const power = (it?.power || 1) * (st.hasBuff('strong') ? 1.3 : 1) * this.bonus('power');
    if (this.enemies && it) {
      const eye = this.player.eye(), f = this.player.forward();
      const reach = hit ? Math.min(REACH, hit.dist + 0.05) : REACH;
      const e = this.enemies.hitTest(eye, f, reach);
      if (e) {
        const r = this.enemies.damage(e, power, f); // combos, crits, finishers: { hitStop, shake, kick }
        if (r) { this.hitStop = Math.max(this.hitStop || 0, r.hitStop || 0); if (r.shake) this.shake(r.shake); }
        const k = r?.kick || 1;
        this.kick.set(-0.016 * power * k, (Math.random() - 0.5) * 0.012 * k, (Math.random() - 0.5) * 0.014 * k);
        if (this.vm) this.vm.impact('pick', Math.min(1, 0.6 + power * 0.15));
        this.energy(0.3);
        return;
      }
    }
    if (!hit || !it) { if (this.vm) this.vm.impact('pick', 0.2); return; }
    const m = hit.m;
    const out = [hit.nx, hit.ny, hit.nz];
    const px = (hit.vx + 0.5 + hit.nx * 0.5) / VOX, py = (hit.vy + 0.5 + hit.ny * 0.5) / VOX, pz = (hit.vz + 0.5 + hit.nz * 0.5) / VOX;
    this.energy(0.45);
    this.U.hit.value.set(px, py, pz, 0.7);
    this.kick.set(-0.012 * power, (Math.random() - 0.5) * 0.01, (Math.random() - 0.5) * 0.012);
    if (this.vm) this.vm.impact('pick', Math.min(1, 0.5 + power * 0.15));
    const mat = MAT[m];
    if (!breakable(m)) {
      this.audio.play('clang', { vol: 0.6 });
      this.fx.sparks(px, py, pz, 6, [1, 0.85, 0.5], out, 3);
      if (m === M.BEDROCK) this.say('bedrock', 'Bedrock. Nothing gets through that.', 'warn', 6);
      return;
    }
    if (m >= ORE_BASE) {
      // direct hit on ore: sparks, quality chips
      const r = this.ores.hitOre(hit.vx, hit.vy, hit.vz, power * this.bonus('clean'));
      this.audio.play('ore_damage');
      this.fx.sparks(px, py, pz, 10, col01(mat.accent), out, 3.5);
      if (r) {
        this.game.ui.floatText?.(`-${Math.round(r.ore.frag * power * this.bonus('clean'))}%`, ...this.screenXY(px, py, pz), '#ff8a6a', 0.8);
        if (!this.flags.oreHit) { this.flags.oreHit = true; st.learn('ore_damage'); this.say('orehit', 'Careful! Hitting ore chips its quality. Clear the rock around it instead.', 'warn', 30); }
        if (r.s.q <= 0) this.shatter(r.d);
      }
      return;
    }
    // rock
    const tier = it.tier || 1;
    const zone = zoneAt(-py);
    const needs = HARD_ROCK_TIER?.[zone] ?? (zone >= 4 ? 3 : 0);
    if (mat.hp > 3.5 && tier < needs) {
      this.audio.play('clang'); this.fx.sparks(px, py, pz, 8, [1, 0.8, 0.4], out, 3);
      const want = pickForTier?.(needs);
      this.say('hard', `${mat.name} is too hard for this pickaxe${want ? ` — you need at least a <b>${want.name}</b>` : ''}.`, 'warn', 5);
      return;
    }
    const res = this.digger.strike(hit.vx, hit.vy, hit.vz, power, [hit.nx, hit.ny, hit.nz]);
    this.audio.play('hit', { snd: mat.snd || 'stone' });
    this.enemies?.noise?.(px, py, pz, 4, 'dig'); // the ring of the pick carries
    const c = col01(mat.tones[2]);
    this.fx.dust(px, py, pz, 5, col01(mat.tones[1]), 0.06, out);
    this.fx.chips(px, py, pz, 4 + (Math.random() * 4 | 0), c, out);
    if (mat.snd === 'stone' || mat.snd === 'crystal') this.fx.sparks(px, py, pz, 3, [1, 0.8, 0.45], out, 2.5);
    this.ores.vibrate(px, py, pz, power * 0.4);
    this.afterBreak(res.broken, out, power, 'pick');
    if (res.broken.length > 6) { this.audio.play('break', { snd: mat.snd || 'stone' }); this.shake(0.25); this.hitStop = 0.05; }
    else if (res.broken.length) this.hitStop = Math.max(this.hitStop || 0, 0.025);
  }

  /** Broken voxels fly out as a chunk; check ore around; stats. */
  afterBreak(broken, out, power, tool) {
    if (!broken.length) return;
    const st = this.state;
    this.act('dig', { mat: broken[0].m, n: broken.length, tool });
    st.data.stats.blocks += broken.length > 6 ? 1 : 0;
    // grit: a spray of tiny chips for every broken bit
    {
      const v = broken[0];
      this.fx.chips((v.x + 0.5) / VOX, (v.y + 0.5) / VOX, (v.z + 0.5) / VOX, Math.min(14, 3 + broken.length), col01(v.c), out);
    }
    if (broken.length > 6) {
      // the plate crumbles as it comes out: a few tumbling lumps (quarter-meter cells), the rest grit
      const cells = new Map();
      for (const v of broken) {
        const k = (v.x >> 1) + ',' + (v.y >> 1) + ',' + (v.z >> 1);
        let c = cells.get(k);
        if (!c) cells.set(k, (c = []));
        c.push(v);
      }
      const lumps = [...cells.values()].sort((a, b) => b.length - a.length);
      // merge neighbouring cells pairwise so lumps aren't all perfect cubes
      let n = 0;
      for (let i = 0; i < lumps.length; i++) {
        const L = lumps[i];
        if (!L.length) continue;
        if (n < 6 && L.length >= 3) {
          const j = lumps.findIndex((o, k) => k > i && o.length && Math.abs(o[0].x - L[0].x) + Math.abs(o[0].y - L[0].y) + Math.abs(o[0].z - L[0].z) <= 3);
          if (j > 0 && chance(0.5)) { L.push(...lumps[j]); lumps[j] = []; }
          const sp = 0.6 + Math.random() * 1.2;
          this.bodies.spawn(L, { vel: [out[0] * sp + rand(-0.6, 0.6), out[1] * sp + rand(0.4, 1.6), out[2] * sp + rand(-0.6, 0.6)], life: 0.9 + Math.random() * 0.9, bounce: 0.45, mat: L[0].m });
          n++;
        } else {
          const v = L[0];
          this.fx.chips((v.x + 0.5) / VOX, (v.y + 0.5) / VOX, (v.z + 0.5) / VOX, Math.min(4, L.length), col01(v.c), out);
        }
      }
      const v0 = broken[(broken.length / 2) | 0];
      this.fx.dust((v0.x + 0.5) / VOX, (v0.y + 0.5) / VOX, (v0.z + 0.5) / VOX, 10, col01(MAT[v0.m]?.tones?.[1] ?? 0x806050), 0.18, [out[0] * 0.5, out[1] * 0.5, out[2] * 0.5]);
    } else if (broken.length) {
      const b = broken[0];
      this.fx.chips((b.x + 0.5) / VOX, (b.y + 0.5) / VOX, (b.z + 0.5) / VOX, 5, col01(b.c), out);
    }
    const b = broken[0];
    const x = (b.x + 0.5) / VOX, y = (b.y + 0.5) / VOX, z = (b.z + 0.5) / VOX;
    const freed = this.ores.checkFree(x, y, z, tool);
    if (freed.seenNew) this.revealed(freed.seenNew);
    for (const f of freed) this.popOre(f, out);
  }

  revealed(d) {
    const it = ITEMS[d.item];
    if (!it) return;
    this.audio.play('sparkle', { vol: 0.5 });
    const p = this.screenXY(d.x, d.y, d.z);
    this.game.ui.floatText?.(it.name, p[0], p[1], '#ffe8a0', 0.9);
  }

  popOre(f, out) {
    if (this.clumps) {
      // the ore comes out wrapped in its rock: pick it up, chip it clean, bag it
      this.audio.play('ore_free');
      for (let k = 0; k < 6; k++) this.fx.glints(f.d.x, f.d.y, f.d.z);
      this.clumps.spawn(f, out);
      if (!this.flags.firstOre) { this.flags.firstOre = true; this.say('ore1', `<b>${ITEMS[f.d.item]?.name || 'Ore'}!</b> A clump broke out of the wall. Pick it up (E) and chip it clean.`, 'good', 10); }
      return;
    }
    const { d, s, voxels } = f;
    let pristine = f.pristine;
    // a lucky meal: better ore, and a better chance it comes out whole
    if (this.state.hasBuff('lucky')) { s.q = Math.min(100, s.q + 10); if (!pristine && s.q >= 85 && chance(0.2)) pristine = true; }
    const it = ITEMS[d.item];
    const glow = !!(ORES[d.oreId].glow);
    this.audio.play('ore_free');
    if (pristine) this.audio.play('pristine');
    for (let k = 0; k < 6; k++) this.fx.glints(d.x, d.y, d.z);
    this.fx.dust(d.x, d.y, d.z, 8, [0.6, 0.55, 0.5], 0.1, out);
    this.bodies.spawn(voxels, { vel: [out[0] * 2 + rand(-0.5, 0.5), 2.5, out[2] * 2 + rand(-0.5, 0.5)], glow, scale: 0.85, pickup: { id: d.item, q: Math.round(s.q), p: pristine, delay: 0.75 } });
    if (!this.flags.firstOre) { this.flags.firstOre = true; this.say('ore1', `<b>${it?.name || 'Ore'}!</b> It popped out of the wall.`, 'good', 10); }
  }

  shatter(d) {
    const s = this.world.depState(d);
    s.taken = true;
    const vox = this.ores.voxelsOf(d);
    for (const v of vox) this.world.setVoxel(v.x, v.y, v.z, 0);
    this.fx.sparks(d.x, d.y, d.z, 20, col01(MAT[ORE_BASE + d.oreId].accent), [0, 0, 0], 4);
    this.audio.play('crack');
    this.say('shatter', `The ${ITEMS[d.item]?.name || 'ore'} shattered!`, 'bad', 3);
  }

  collect(p) {
    const st = this.state;
    const it = ITEMS[p.id];
    if (!it) return;
    const counts = it.cat === 'mineral' || it.cat === 'gem';
    const to = st.canAdd ? this.whereTo(p.id) : 'bag';
    const fits = to === 'bag' || (!st.canAdd && !(counts && this.trip >= st.bagCapacity()));
    if (to === 'coop' && this.nugget?.takeFind?.(p, this.chuteRange())) {
      const name = st.data.chicken?.name || 'Nugget';
      this.game.ui.toast(W.coopUp(st, 'chute').on && !this.nugget.near(4.5) ? `The <b>${it.name}</b> rolls down the chute onto ${name}'s shelves.` : `${name} tucks the <b>${it.name}</b> into her coop.`, { icon: iconURL(p.id) });
      if (counts) { st.data.stats.ores++; if (p.p) st.data.stats.pristine++; }
      this.act(it.cat === 'gem' ? 'gem' : it.cat === 'mineral' ? 'ore' : 'loot', { id: p.id, q: p.q, pristine: !!p.p });
      return;
    }
    // no room: it goes to the trunk at home rather than being lost
    st.addItem(p.id, { ...(it.q ? { q: p.q, p: p.p } : {}), spill: true });
    if (!fits) this.game.ui.toast(`No room in your backpack: the <b>${it.name}</b> waits in the trunk at home.`, { icon: iconURL(p.id), kind: 'warn' });
    if (counts) { this.trip++; st.data.stats.ores++; if (p.p) st.data.stats.pristine++; this.tripItems.push(p.id); }
    this.tripValue += sellPrice(p.id, p.q, p.p);
    this.audio.play(it.cat === 'gem' || p.p ? 'pickup_gem' : 'pickup', { pitch: 0.9 + Math.random() * 0.3 });
    const cat = it.cat === 'gem' ? 'gem' : it.cat === 'mineral' ? 'mineral' : it.cat === 'plant' ? 'plant' : null;
    if (cat) st.discover(cat, p.id);
    this.act(it.cat === 'gem' ? 'gem' : it.cat === 'mineral' ? 'ore' : it.cat === 'plant' || it.cat === 'ingredient' ? 'forage' : 'loot', { id: p.id, q: p.q, pristine: !!p.p });
    this.game.ui.toast(`+ <b>${it.name}</b>${it.q ? ` ${p.q ?? 100}%` : ''}${p.p ? ' · <b>pristine</b>' : ''}`, { icon: iconURL(p.id), kind: 'good' });
    this.showBag();
    this.updateHotbar();
  }

  /** Ore chute range (m): how close Nugget must be to take a find (7 m with the chute fitted). */
  chuteRange() { return W.coopUp(this.state, 'chute').on ? 7 : 4.5; }

  /**
   * Where a find goes: 'bag', 'coop' (the pack is full or too heavy and Nugget can take it; with
   * the ore chute, heavy finds roll onto her shelves as soon as you're loaded), or null (nowhere).
   */
  whereTo(id) {
    const st = this.state, nug = this.nugget;
    const bagOk = st.canAdd(id, 1) && (st.canLift?.(id, 1) ?? true);
    const coopOk = !!nug?.canTake?.(id, this.chuteRange());
    if (coopOk && W.coopUp(st, 'chute').on && ITEMS[id]?.cat !== 'gem' && W.kgOf(id) >= 0.4 && (this.load?.r ?? 0) >= 1) return 'coop';
    return bagOk ? 'bag' : coopOk ? 'coop' : null;
  }

  /**
   * The pack's weight, re-weighed a few times a second: { kg, carry, r, speed, jump, run, tier }.
   * Speaks up the first time it gets heavy (and the HUD's scale shows it).
   */
  weigh(dt) {
    this.loadT = (this.loadT || 0) - dt;
    if (!this.load || this.loadT <= 0) {
      this.loadT = 0.25;
      const st = this.state;
      this.load = st.bagLoad ? st.bagLoad() : { kg: 0, carry: 15, r: 0, speed: 1, jump: 1, run: true, tier: 'light' };
      this.game.ui.setLoad?.(this.load);
      const t = this.load.tier, name = st.data.chicken?.name || 'Nugget';
      if ((t === 'heavy' || t === 'over' || t === 'max') && !st.flag('tipHeavy')) {
        st.flag('tipHeavy', true);
        this.say('heavy', `Oof, your pack is <b>heavy</b>: you can't run and every step costs energy. Ore weighs a lot. ${st.flag('nugget') ? `Put it on <b>${name}'s coop</b> (<b>E</b> on the coop, or <b>Unload ore</b> in the backpack).` : 'Take it home and lighten the load.'}`, 'warn', 9999);
      } else if (t === 'max' && this.lastTier !== 'max') this.say('heavymax', `You can't lift any more! Unload onto ${name}'s coop or head home.`, 'warn', 12);
      this.lastTier = t;
    }
    return this.load;
  }

  /** Too heavy to pick something up (a short note, not every frame). */
  tooHeavy(id) {
    if ((this.heavyT || 0) > this.time) return;
    this.heavyT = this.time + 4;
    this.audio.play('ui_error');
    const it = ITEMS[id], name = this.state.data.chicken?.name || 'Nugget';
    this.game.ui.toast(`<b>Too heavy!</b> You can't lift the ${it ? it.name : 'find'} as well.${this.state.flag('nugget') ? ` Unload ore onto ${name}'s coop.` : ''}`, { kind: 'warn', icon: it ? iconURL(id) : undefined, dur: 2600 });
  }

  /** The bag strip: pockets used / pockets (or finds this trip / capacity on old inventories). */
  showBag() {
    const st = this.state, f = st.bagFill?.();
    if (f) this.game.ui.setBag?.(f.used, f.slots);
    else this.game.ui.setBag?.(this.trip, st.bagCapacity());
  }

  /** The backpack is full (a short note, not every frame). */
  bagFull(id) {
    if ((this.bagFullT || 0) > this.time) return;
    this.bagFullT = this.time + 4;
    this.audio.play('ui_error');
    import('../ui/Backpack.js').then((m) => { if (m.bagFullToast) m.bagFullToast(this.game, id); else this.say('bag', 'Your backpack is full!', 'warn', 4); });
  }

  chiselHit(it) {
    const hit = this.target;
    if (!hit) return;
    const out = [hit.nx, hit.ny, hit.nz];
    const px = (hit.vx + 0.5 + hit.nx * 0.5) / VOX, py = (hit.vy + 0.5 + hit.ny * 0.5) / VOX, pz = (hit.vz + 0.5 + hit.nz * 0.5) / VOX;
    if (this.vm) this.vm.impact('chisel', 0.4);
    this.energy(0.12);
    if (hit.m >= ORE_BASE) { this.audio.play('chisel', { vol: 0.5 }); this.fx.glints(px, py, pz); return; }
    if (!breakable(hit.m)) { this.audio.play('clang', { vol: 0.4 }); return; }
    const broken = this.digger.chisel(hit.vx, hit.vy, hit.vz);
    // a fine chisel takes a second voxel next to it
    if ((it.power || 0.5) > 1) { const v2 = this.world.raycast(this.player.eye().x, this.player.eye().y, this.player.eye().z, ...this.player.forward().toArray(), REACH); if (v2 && breakable(v2.m) && v2.m < ORE_BASE) broken.push(...this.digger.chisel(v2.vx, v2.vy, v2.vz)); }
    this.audio.play('chisel');
    this.fx.chips(px, py, pz, 3, col01(MAT[hit.m].tones[2]), out);
    this.afterBreak(broken, out, 0.3, 'chisel');
  }

  brushHit(it) {
    this.events(this.enemies?.brushAt?.(this.player.eye(), this.player.forward(), this.reach()));
    const hit = this.target;
    if (!hit) return;
    const px = (hit.vx + 0.5 + hit.nx * 0.5) / VOX, py = (hit.vy + 0.5 + hit.ny * 0.5) / VOX, pz = (hit.vz + 0.5 + hit.nz * 0.5) / VOX;
    this.energy(0.03);
    if (chance(0.4)) this.audio.play('brush', { vol: 0.5 });
    this.fx.dust(px, py, pz, 2, [0.62, 0.55, 0.46], 0.06, [hit.nx * 0.5, hit.ny * 0.5 + 0.2, hit.nz * 0.5]);
    const m = hit.m;
    if (MAT[m]?.gran || m === M.MOSS) {
      // loose stuff sweeps away
      this.afterBreak(this.digger.chisel(hit.vx, hit.vy, hit.vz), [hit.nx, hit.ny, hit.nz], 0.1, 'brush');
      return;
    }
    // brushing around ore loosens it (it pops at a lower exposure, pristine)
    for (const d of this.world.depositsNear(px, py, pz, 0.6)) {
      const s = this.world.depState(d);
      if (s.taken) continue;
      s.brushed = Math.min(1, s.brushed + (it.power || 1) * 0.08);
      if (chance(0.3)) this.fx.glints(d.x, d.y, d.z);
      const freed = this.ores.checkFree(d.x, d.y, d.z, 'brush');
      for (const f of freed) this.popOre(f, [hit.nx, hit.ny, hit.nz]);
    }
  }

  drillHit(it) {
    const hit = this.target;
    if (!hit) return;
    const cx = hit.vx + 0.5, cy = hit.vy + 0.5, cz = hit.vz + 0.5;
    const r = (1.5 + (it.power || 3) * 0.25) * (VOX / 8);
    const res = this.digger.drill(cx, cy, cz, r);
    const px = (hit.vx + 0.5) / VOX, py = (hit.vy + 0.5) / VOX, pz = (hit.vz + 0.5) / VOX;
    this.enemies?.noise?.(px, py, pz, 4, 'dig');
    this.energy(0.08);
    if (chance(0.5)) this.audio.play('hit', { snd: 'stone', vol: 0.4 });
    this.fx.sparks(px, py, pz, 3, [1, 0.7, 0.3], [hit.nx, hit.ny, hit.nz], 3);
    this.fx.dust(px, py, pz, 2, col01(MAT[hit.m]?.tones?.[1] ?? 0x806050), 0.05, [hit.nx, hit.ny, hit.nz]);
    for (const o of res.ore) { const r2 = this.ores.hitOre(o.x, o.y, o.z, 0.5 * this.bonus('clean')); if (r2 && r2.s.q <= 0) this.shatter(r2.d); }
    this.shake(0.12);
    this.kick.set((Math.random() - 0.5) * 0.006, (Math.random() - 0.5) * 0.006, 0);
    this.afterBreak(res.broken, [hit.nx, hit.ny, hit.nz], 0.5, 'drill');
  }

  // ------------------------------------------------------------------ explosions
  /**
   * A blast at (x, y, z) meters with radius r: a round crater (bedrock, burrow and lift timbers
   * hold), flying rock, ore shaken loose, enemies and the mole hurt by distance. power scales damage.
   */
  blast(x, y, z, r, power = 1) {
    this.act('blast', { r, power });
    const w = this.world, R = r * VOX, cx = x * VOX, cy = y * VOX, cz = z * VOX;
    const broken = [];
    for (let vz = Math.floor(cz - R); vz <= cz + R; vz++) for (let vy = Math.floor(cy - R); vy <= cy + R; vy++) for (let vx = Math.floor(cx - R); vx <= cx + R; vx++) {
      const d = Math.hypot(vx + 0.5 - cx, vy + 0.5 - cy, vz + 0.5 - cz) / R;
      if (d > 1 - h3(vx, vy, vz, 13) * 0.18) continue; // a ragged rim
      const m = w.voxelAt(vx, vy, vz);
      if (!breakable(m) || m >= ORE_BASE || m === M.TIMBER || m === M.BOARDS) continue;
      broken.push({ x: vx, y: vy, z: vz, m, c: voxelColor(m, vx, vy, vz, h3(vx, vy, vz, 1)) });
      w.setVoxel(vx, vy, vz, 0);
    }
    // the ore inside the blast comes loose (chipped a little), debris flies outward
    const pl = this.player, e = pl.eye();
    const out = [e.x - x, e.y - y, e.z - z]; const ol = Math.hypot(...out) || 1;
    if (broken.length) this.afterBreak(broken.slice(0, 600), out.map((v) => v / ol), power, 'blast');
    for (const d of w.depositsNear(x, y, z, r + 0.4)) { const s = w.depState(d); if (!s.taken) s.q = Math.max(5, s.q - 12 * power * this.bonus('clean')); }
    for (const f of this.ores.checkFree(x, y, z, 'blast')) this.popOre(f, out.map((v) => v / ol));
    this.fx.sparks(x, y, z, 40, [1, 0.75, 0.35], [0, 0, 0], 7);
    this.fx.dust(x, y, z, 30, [0.55, 0.47, 0.4], r * 0.6);
    this.U.hit.value.set(x, y, z, 1);
    this.audio.play('explode', { vol: 1 });
    this.enemies?.blast?.(x, y, z, r, power);
    const dist = Math.hypot(pl.pos.x - x, pl.pos.y + 0.4 - y, pl.pos.z - z);
    this.shake(clamp(1.2 - dist / (r * 6), 0.2, 1));
    if (dist < r * 1.3) {
      this.hurt(Math.round(18 * power * (1 - dist / (r * 1.3)) + 4), 'blast');
      const k = 5 * (1 - dist / (r * 1.3));
      pl.vel.add(new THREE.Vector3(pl.pos.x - x, Math.max(0.6, pl.pos.y + 0.4 - y), pl.pos.z - z).normalize().multiplyScalar(k));
    }
    return broken.length;
  }

  // ------------------------------------------------------------------ building (Build.js, building part)
  /** R, or tapping the build slot again: the block picker (blocks, shapes, crafting). */
  cycleBuild() {
    this.audio.play('ui_click', { pitch: 0.9 });
    this.builder?.openPicker('blocks');
  }

  /**
   * Every frame (from update): the build module (made on the first frame) plans the ghost, picks
   * the dig slot's tool, cracks placed blocks, lights torches, gathers blocks from digging.
   */
  updateGhost(hide) {
    if (!this.builder) {
      try {
        this.builder = new Build({ scene: this.scene, scene3: this.scene, world: this.world, U: this.U, fx: this.fx, bodies: this.bodies, audio: this.audio, state: this.state, ui: this.game.ui, player: this.player, plan: this.world.plan, owner: this });
        this.updateHotbar();
      } catch (e) { console.warn('build failed', e); this.builder = false; }
    }
    if (!this.builder) return;
    const dt = Math.min(0.1, this.time - (this.buildT ?? this.time));
    this.buildT = this.time;
    this.events(this.builder.update(dt, { hide }));
  }

  /** The build slot's click: a door, chest or workbench under the crosshair gets used, else the block goes down. */
  build() {
    if (this.builder) this.builder.place();
  }

  placeStake() {
    const st = this.state, hit = this.target;
    if (!hit || !st.count('glow_stake')) return;
    const x = (hit.vx + 0.5 + hit.nx * 0.6) / VOX, y = (hit.vy + 0.5 + hit.ny * 0.6) / VOX, z = (hit.vz + 0.5 + hit.nz * 0.6) / VOX;
    st.removeItem('glow_stake', 1);
    this.stakes.push({ x, y, z });
    this.world.plan.lights.push({ x, y, z, c: [0.45, 0.85, 0.7], r: 6, stake: true });
    this.audio.play('glow');
    if (this.vm) this.vm.swing('stake', 0.18);
    this.updateHotbar();
  }

  eatBest() {
    const f = this.bestFood();
    if (!f) { this.say('nofood', 'No snacks in your bag.', 'warn'); return; }
    this.game.eat(f.id);
    if (this.vm) this.vm.eat(f.id);
    this.updateHotbar();
  }

  hurt(n, kind, guarded = false) {
    if (n <= 0) return;
    const st = this.state;
    n /= (st.skill?.('hide') || 1) * (kind === 'fall' ? st.skill?.('fall') || 1 : 1);
    this.state.useEnergy(n);
    this.act('hurt', { n, by: kind });
    if (guarded) return; // the block already rang
    this.audio.play('hurt');
    this.shake(0.5);
    if (this.vm) this.vm.hurt();
    this.post.flash = 0.35;
    this.post.flashColor = 0xff3a20;
  }

  interact() {
    const pl = this.player;
    // pick a plant, catch a critter
    {
      const eye = pl.eye(), f = pl.forward(), reach = this.reach();
      const pr = this.prologue?.use?.(eye, f, reach);
      if (pr) { this.events(pr); return; }
      const cl = this.clumps?.use(eye, f, reach);
      if (cl) { this.events(cl); return; }
      for (const mod of [this.nugget, this.traders, this.ruins, this.builder]) { // builder: doors, chests, the workbench
        const r = mod?.use?.(eye, f, reach);
        if (r) { this.events(Array.isArray(r) ? r : [r]); if (this.vm) this.vm.impact('none', 0.3); return; }
      }
      const got = this.props?.use?.(eye, f, reach);
      if (got) { this.events([got]); if (this.vm) this.vm.impact('none', 0.3); return; }
      const evs = this.enemies?.catch?.(eye, f, reach, this.slotName);
      if (evs && evs.length) { this.events(evs); if (this.vm) this.vm.impact('none', 0.3); return; }
    }
    // the burrow door at the end of a tunnel
    if (this.target && this.target.m === M.DOOR) {
      let best = null, bd = 1e9;
      for (const m of this.world.plan.mouths) { const d = Math.hypot((m.x0 + m.x1) / 2 - pl.pos.x, (m.z0 + m.z1) / 2 - pl.pos.z); if (d < bd) { bd = d; best = m; } }
      if (best) { this.audio.play('door'); this.goHome(best.wall, best.t); }
      return;
    }
    // ring a lift's bell: ride home, to town, or to any lift found so far
    const L = this.liftNear();
    if (L) {
      if (discoverLift(this.state, L)) this.liftFound(L);
      openLiftPanel(this.game, L.id, { title: L.name, sub: `${L.depth} m · an old miners' lift. Where to?`, onRide: (id) => this.rideLift(id) });
    }
  }

  /** The lift whose cage the mole is standing at (within reach), or null. */
  liftNear() {
    const pl = this.player;
    for (const L of this.world.plan.lifts) if (Math.abs(L.y - pl.pos.y) < 1.6 && Math.hypot(L.x - pl.pos.x, L.z - pl.pos.z) < 2.0) return L;
    return null;
  }
  liftFound(L) {
    this.audio.play('ding');
    this.audio.play('bell', { vol: 0.4 });
    this.say('lift' + L.id, `<b>Lift found: ${L.name}!</b> Ring its bell (E) to ride up home whenever you're tired, and come back down here later.`, 'good', 99);
  }
  rideLift(id) {
    if (this.leaving) return;
    this.leaving = true;
    this.world.saveEdits();
    this.state.data.stats.trips++;
    rideTo(this.game, id);
  }

  /** Discovery of stations, the town gate, the way back home, zone changes, energy. */
  updateProgress(dt) {
    const pl = this.player, st = this.state, plan = this.world.plan, g = this.game;
    if (this.leaving) return;
    // back into the burrow through a tunnel mouth
    for (const mth of plan.mouths) {
      const b = mth;
      const inX = pl.pos.x > b.x0 - 0.1 && pl.pos.x < b.x1 + 0.1, inZ = pl.pos.z > b.z0 - 0.1 && pl.pos.z < b.z1 + 0.1;
      if (!inX || !inZ || pl.pos.y > 0.6) continue;
      const toward = -(b.dir[0] * (pl.pos.x - (b.x0 + b.x1) / 2) + b.dir[2] * (pl.pos.z - (b.z0 + b.z1) / 2));
      const moving = -(b.dir[0] * (pl.vel.x + this.wish.x) + b.dir[2] * (pl.vel.z + this.wish.z));
      if (toward > 0.18 && moving > 0.2 && this.time > 1.5) { this.goHome(mth.wall, mth.t); return; }
    }
    // the town gate
    const T = plan.town;
    if (Math.hypot(pl.pos.x - (T.x + 1.6), pl.pos.y - T.y, pl.pos.z - (T.z - 1.2)) < 2.6) {
      if (!st.flag('escaped')) {
        st.flag('escaped', true);
        st.learn('elevator');
        this.audio.play('fanfare');
        this.leave('town', { from: 'escape' }, { transition: 'fade', dur: 1.2, color: 0xfff0d0 });
        return;
      }
    }
    // lifts: walking into one's room remembers it
    for (const L of plan.lifts) {
      if (Math.abs(L.y - pl.pos.y) > 2.5 || Math.hypot(L.x - pl.pos.x, L.z - pl.pos.z) > 2.6) continue;
      if (discoverLift(st, L)) {
        this.liftFound(L);
        if (L.id[0] === 's' && !this.deep.stations.includes(+L.id.slice(1))) this.deep.stations.push(+L.id.slice(1));
      }
    }
    // zones and depth
    const depth = Math.max(0, -pl.pos.y);
    const zone = zoneAt(depth);
    // each stratum has its own light; under water the view goes murky
    this.post.grade = EngineFx.ZONE_GRADES?.[zone] || this.post.grade;
    this.post.underwater = this.fluids?.uwK ?? (pl.headUnder ? 1 : 0); // Fluids fades it in and out
    if (zone !== this.zone) {
      this.zone = zone;
      st.data.zoneMax = Math.max(st.data.zoneMax || 1, zone);
      this.music = 'mine';
      g.ui.setDepth(`<b>${Math.floor(depth)} m</b><br>${ZONES[zone].name}`);
      if (this.time > 1) this.say('zone' + zone, `<b>${ZONES[zone].name}</b> · ${ZONES[zone].desc}`, 'good', 999);
    }
    // biomes: the light and fog lean their way; the first visit to each gets a word
    if ((this.bioT = (this.bioT || 0) - dt) <= 0) {
      this.bioT = 0.3;
      const b = biomeAt(plan, pl.pos.x, pl.pos.y + 0.5, pl.pos.z);
      if (b !== this.biome) {
        this.biome = b;
        const seen = (st.data.biomes ||= {});
        if (b && !seen[BIOMES[b].id] && this.time > 1) { seen[BIOMES[b].id] = 1; this.say('bio' + b, `<b>${BIOMES[b].name}</b> · ${BIOMES[b].desc}`, 'good', 999); }
      }
    }
    {
      const B = BIOMES[this.biome || 0], A = AMBIENT[zone], F = FOG[zone];
      const k = this.lightInit ? 1 - Math.exp(-dt * 1.2) : 1;
      this.lightInit = true;
      const amb = this.U.ambient.value, fog = this.U.fogCol.value;
      amb.setRGB(amb.r + (A[0] + (B ? B.tint[0] : 0) - amb.r) * k, amb.g + (A[1] + (B ? B.tint[1] : 0) - amb.g) * k, amb.b + (A[2] + (B ? B.tint[2] : 0) - amb.b) * k);
      fog.setRGB(fog.r + (F[0] + (B ? B.fog[0] : 0) - fog.r) * k, fog.g + (F[1] + (B ? B.fog[1] : 0) - fog.g) * k, fog.b + (F[2] + (B ? B.fog[2] : 0) - fog.b) * k);
      this.scene.background.copy(fog);
    }
    st.data.deepest = Math.max(st.data.deepest || 0, depth);
    // energy
    if (st.energy <= 0 && !this.fainting) this.faint();
    else if (st.energy < 25 && !this.flags.low) { this.flags.low = true; this.say('low', 'Running low on energy! Eat something, or find a lift (the radar shows them) and ride up home.', 'warn', 60); }
    else if (st.energy > 40) this.flags.low = false;
    // remember explored cells for the radar
    this.exploreT = (this.exploreT || 0) - dt;
    if (this.exploreT <= 0) { this.exploreT = 0.25; this.explore(); }
  }

  goHome(wall, t) {
    this.leave('home', { from: 'tunnel', wall, t });
  }
  /** Radar's "Head home": back to the burrow by the tunnel we came out of. */
  headHome() {
    if (this.leaving) return;
    this.say('home', `Hauled up <b>${this.trip}</b> finds (≈${formatGoldFull(this.tripValue)}g).`, 'good', 1);
    this.goHome(this.lastMouth.wall, this.lastMouth.t);
  }
  leave(scene, params, opts = { transition: 'fade' }) {
    if (this.leaving) return;
    this.leaving = true;
    this.world.saveEdits();
    this.state.data.stats.trips++;
    this.game.goto(scene, params, opts);
  }

  faint() {
    this.fainting = true;
    const st = this.state;
    st.data.stats.faints++;
    this.audio.play('faint');
    this.say('faint', 'You fainted... and woke up back home, missing part of your haul.', 'bad', 1);
    // lose half of this trip's finds
    const lost = this.tripItems.filter((_, i) => i % 2 === 1);
    for (const id of lost) st.removeItem(id, 1);
    this.trip -= lost.length;
    st.data.energy = Math.round(st.data.maxEnergy * 0.5);
    this.goHome(this.lastMouth.wall, this.lastMouth.t);
  }

  explore() {
    const pl = this.player, w = this.world;
    const ex = this.deep.explored;
    const cx = Math.floor(pl.pos.x), cy = Math.floor(pl.pos.y + 0.4), cz = Math.floor(pl.pos.z);
    let fresh = 0;
    const R = Math.round(3 * (this.state.skill?.('ink') || 1)); // cave sense inks more around you
    for (let dz = -R; dz <= R; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy, z = cz + dz;
      const m = w.voxelAt(Math.floor((x + 0.5) * VOX), Math.floor((y + 0.5) * VOX), Math.floor((z + 0.5) * VOX));
      const v = !m ? 1 : m === M.WATER ? 2 : m === M.LAVA ? 3 : 0;
      const k = x + ',' + y + ',' + z;
      if (v) { if (!ex[k]) fresh++; ex[k] = v; } // only open space is remembered; rock is everything else
    }
    if (fresh) this.act('explore', { zone: zoneAt(-pl.pos.y), biome: this.biome || 0, cell: cx + ',' + cy + ',' + cz, n: fresh });
    // places: walking into a burrow, a ruin, Deep Town's hall or a lift room
    const plan = w.plan, near = (this.nearPlaces ||= new Set());
    const at = (id, x, y, z, r) => {
      const d = Math.hypot(x - pl.pos.x, (y - pl.pos.y) * 1.5, z - pl.pos.z);
      if (d < r && !near.has(id)) { near.add(id); this.act('reach', { place: id }); }
      else if (d > r + 3) near.delete(id);
    };
    for (const r of plan.ruins || []) at(r.id, r.x, r.y, r.z, r.r + 1);
    for (const L of plan.lifts) at(L.id, L.x, L.y, L.z, 2.6);
    at('town', plan.town.x, plan.town.y, plan.town.z, 8);
  }

  /** Data for the radar (see docs/DEEP.md). */
  radar(o = {}) {
    const pl = this.player, plan = this.world.plan, ex = this.deep.explored;
    const size = o.survey ? 160 : 48, cell = 1, half = size / 2;
    const data = new Uint8Array(size * size);
    const px = Math.floor(pl.pos.x), pz = Math.floor(pl.pos.z), py = o.survey && o.y !== undefined ? Math.floor(o.y) : Math.floor(pl.pos.y + 0.4);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = px - half + i, z = pz - half + j;
      let v = 0;
      for (let dy = -2; dy <= 2 && v !== 1; dy++) { const e = ex[x + ',' + (py + dy) + ',' + z]; if (e && (!v || e < v)) v = e; }
      data[i + j * size] = v;
    }
    const markers = [];
    markers.push({ kind: 'home', x: this.W / 2, y: 1, z: this.D / 2, label: 'Home' });
    markers.push({ kind: 'town', x: plan.town.x, y: plan.town.y, z: plan.town.z, label: 'Deep Town' });
    // lifts: known ones by name, unknown ones nearby as a faint signal to dig toward
    const known = new Set(liftState(this.state).map((l) => l.id));
    for (const L of plan.lifts) {
      if (known.has(L.id)) markers.push({ kind: 'station', x: L.x, y: L.y, z: L.z, label: L.name });
      else if (Math.hypot(L.x - pl.pos.x, (L.y - pl.pos.y) * 1.5, L.z - pl.pos.z) < (o.survey ? 60 : 26)) markers.push({ kind: 'station', x: L.x, y: L.y, z: L.z, label: '? lift', color: '#8a7a5a' });
    }
    for (const a of plan.areas) {
      const d = Math.hypot(a.x - pl.pos.x, (a.y - pl.pos.y) * 1.5, a.z - pl.pos.z);
      if (d > (o.survey ? 400 : 34)) continue;
      const it = ITEMS[a.item];
      const c = it?.icon?.ore?.[0] ?? it?.icon?.c?.[0] ?? 0xcccccc;
      markers.push({ kind: 'ore', x: a.x, y: a.y, z: a.z, label: it?.name || a.item, color: '#' + c.toString(16).padStart(6, '0') });
    }
    for (const dz of plan.dangers) {
      const d = Math.hypot(dz.x - pl.pos.x, (dz.y - pl.pos.y) * 1.5, dz.z - pl.pos.z);
      if (d > (o.survey ? 400 : 40)) continue;
      markers.push({ kind: 'danger', x: dz.x, y: dz.y, z: dz.z, r: dz.r, label: dz.kind === 'lava' ? 'Lava' : dz.kind === 'water' ? 'Flooded cave' : dz.kind === 'nest' ? 'Nest' : 'Gas', color: dz.kind === 'water' ? '#4aa8ff' : '#ff4a3a' });
    }
    for (const s of this.stakes) markers.push({ kind: 'stake', x: s.x, y: s.y, z: s.z });
    if (this.enemies?.radarMarkers) markers.push(...this.enemies.radarMarkers(pl.pos));
    markers.push(...(this.nugget?.radarMarkers?.() || []));
    if (this.ruins?.radarMarkers) markers.push(...this.ruins.radarMarkers(pl.pos, !!o.survey));
    if (this.traders?.radarMarkers) markers.push(...this.traders.radarMarkers(pl.pos, !!o.survey));
    return { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, heading: pl.yaw, range: o.survey ? half * cell : 22, explored: { size, cell, data, ox: px - half, oz: pz - half }, markers };
  }

  ambient(dt) {
    const pl = this.player, eye = pl.eye();
    // hidden ore glints through the rock it's buried in (only ore close under the surface)
    this.glintT = (this.glintT || 0) - dt;
    if (this.glintT <= 0) {
      this.glintT = 0.06;
      const nose = this.bonus('glint') * (this.state.hasBuff('sense') ? 1.4 : 1);
      const ds = this.world.depositsNear(eye.x, eye.y, eye.z, 6.5 * nose);
      const d = ds[(Math.random() * ds.length) | 0];
      if (d && !this.world.depState(d).taken) {
        const dx = eye.x - d.x, dy = eye.y - d.y, dz = eye.z - d.z, l = Math.hypot(dx, dy, dz) || 1;
        // walk from the ore toward the mole until open space: that's the rock face it shows on
        for (let t = d.r; t < Math.min(1.1 * nose, l); t += 1 / VOX) {
          const x = d.x + (dx / l) * t + rand(-0.12, 0.12), y = d.y + (dy / l) * t + rand(-0.12, 0.12), z = d.z + (dz / l) * t + rand(-0.12, 0.12);
          if (this.world.solidAt(x, y, z)) continue;
          const c = col01(MAT[ORE_BASE + d.oreId]?.accent ?? 0xffffff);
          this.fx.glints(x - (dx / l) * 0.03, y - (dy / l) * 0.03, z - (dz / l) * 0.03, c.map((v) => Math.min(1, v * 0.6 + 0.45)));
          break;
        }
      }
    }
    // dust motes in the lamp beam
    if (chance(dt * 14)) {
      const f = pl.forward();
      const d = rand(0.4, 3);
      this.fx.mote(eye.x + f.x * d + rand(-0.6, 0.6), eye.y + f.y * d + rand(-0.4, 0.4), eye.z + f.z * d + rand(-0.6, 0.6));
    }
    // lanterns flicker embers, lava spits
    for (const l of this.world.plan.lights) {
      if (Math.abs(l.x - eye.x) > 12 || Math.abs(l.z - eye.z) > 12 || Math.abs(l.y - eye.y) > 8) continue;
      if (l.lava && chance(dt * 3)) this.fx.ember(l.x + rand(-2, 2), l.y + 0.3, l.z + rand(-2, 2));
      if (l.lantern && chance(dt * 0.8)) this.fx.firefly(l.x + rand(-0.5, 0.5), l.y + rand(-0.3, 0.3), l.z + rand(-0.5, 0.5), [1, 0.75, 0.35]);
      if (l.stake && chance(dt * 1.2)) this.fx.firefly(l.x, l.y, l.z, [0.5, 1, 0.8]);
    }
  }

  lights(eye) {
    const U = this.U, pl = this.player, st = this.state;
    U.lampPos.value.copy(eye);
    pl.forward(U.lampDir.value);
    U.lampRange.value = 6 + st.lightRadius() * 1.2;
    const near = [];
    for (const l of this.world.plan.lights) {
      const d = Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z);
      if (d < l.r + 14) near.push([d - l.r * 0.3, l]);
    }
    // glowing enemies and hot fluids light the rock too
    for (const src of [this.enemies, this.fluids, this.props, this.clumps, this.prologue, this.explosives, this.nugget, this.traders, this.ruins, this.vegetation]) {
      for (const l of src?.lights?.(eye) || []) near.push([Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z) - l.r * 0.3, l]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < MAX_LIGHTS; i++) {
      const e = near[i];
      if (!e) { U.lPos.value[i].set(0, -9999, 0, 1); continue; }
      const l = e[1];
      const flick = l.lantern ? 0.92 + Math.sin(this.time * 9 + i) * 0.04 + Math.sin(this.time * 23 + i * 3) * 0.03 : l.lava ? 0.85 + Math.sin(this.time * 1.3 + i) * 0.15 : 1;
      U.lPos.value[i].set(l.x, l.y, l.z, l.r);
      U.lCol.value[i].set(l.c[0] * flick, l.c[1] * flick, l.c[2] * flick);
    }
    this.xrayGhosts(this.U.xray.value > 0, eye);
    if (!this.U.xray.value) this.xrayOn = false;
    U.xray.value = 0;
  }

  /** The x-ray lamp: ore deposits in its cone glow through the rock as see-through ghosts. */
  xrayGhosts(on, eye) {
    const G = (this.ghosts ||= new Map());
    this.ghostScan = (this.ghostScan || 0) - 1;
    if (on && this.ghostScan <= 0) {
      this.ghostScan = 6;
      const f = this.player.forward();
      for (const d of this.world.depositsNear(eye.x, eye.y, eye.z, 7)) {
        const s = this.world.depState(d);
        if (s.taken) continue;
        const dx = d.x - eye.x, dy = d.y - eye.y, dz = d.z - eye.z, l = Math.hypot(dx, dy, dz) || 1;
        if ((dx * f.x + dy * f.y + dz * f.z) / l < 0.75) continue;
        let gh = G.get(d.id);
        if (!gh) {
          const vox = this.ores.voxelsOf(d);
          if (!vox.length) continue;
          let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
          for (const v of vox) { x0 = Math.min(x0, v.x); y0 = Math.min(y0, v.y); z0 = Math.min(z0, v.z); x1 = Math.max(x1, v.x); y1 = Math.max(y1, v.y); z1 = Math.max(z1, v.z); }
          const g = new VoxelGrid(x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1);
          // the ore's own colour pushed to full brightness, tinted toward the lamp's cyan
          const a = col01(MAT[ORE_BASE + d.oreId].accent), mx = Math.max(0.05, ...a);
          const c = new THREE.Color(...a.map((v, i) => (v / mx) * 0.7 + [0.45, 1, 0.9][i] * 0.3)).getHex();
          for (const v of vox) g.set(v.x - x0, v.y - y0, v.z - z0, c);
          const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
          const mesh = new THREE.Mesh(meshGridGreedy(g, { scale: 1 / VOX, shade: true }), mat);
          mesh.position.set(x0 / VOX, y0 / VOX, z0 / VOX);
          mesh.renderOrder = 20;
          this.scene.add(mesh);
          gh = { mesh, k: 0, d };
          G.set(d.id, gh);
          if (!s.seen) { s.seen = true; this.revealed(d); }
        }
        gh.lit = this.time;
      }
    }
    for (const [id, gh] of G) {
      const want = on && this.time - (gh.lit || 0) < 0.4 && !this.world.depState(gh.d).taken ? 1 : 0;
      gh.k += (want - gh.k) * Math.min(1, 0.1 + (want ? 0.12 : 0.2));
      gh.mesh.material.opacity = gh.k * (0.85 + Math.sin(this.time * 9) * 0.15);
      gh.mesh.visible = gh.k > 0.01;
      if (!want && gh.k < 0.01) { this.scene.remove(gh.mesh); gh.mesh.geometry.dispose(); gh.mesh.material.dispose(); G.delete(id); }
    }
  }

  hudTick(dt) {
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT > 0) return;
    this.hudT = 0.25;
    const pl = this.player, st = this.state;
    const depth = Math.max(0, -pl.pos.y);
    const bio = this.biome ? ' · ' + BIOMES[this.biome].name : '';
    const f = st.bagFill?.();
    this.game.ui.setDepth(`<b>${Math.floor(depth)} m</b><br>${ZONES[zoneAt(depth)].name}${bio}<br>Bag ${f ? `${f.used}/${f.slots}` : `${this.trip}/${st.bagCapacity()}`}`);
    if (this.slotName === 'drill') this.game.ui.setHotbarMeter?.(hotbarOf(this.state).indexOf('drill'), this.drillHeat);
  }

  screenXY(x, y, z) {
    const p = this.toScreen(new THREE.Vector3(x, y, z));
    return [p.x, p.y];
  }

  render() {
    const post = this.vm ? { ...this.post, overlay: { scene: this.vm.scene, camera: this.vm.camera } } : this.post;
    this.game.engine.render(this.scene, this.camera, post);
  }

  onResize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setPixelScale(h, this.fov);
    if (this.vm) this.vm.resize(w / h);
  }

  exit() {
    this.world.saveEdits();
    const g = this.game;
    g.input.unlockPointer();
    g.ui.setRadar?.(null);
    g.ui.setCrosshair?.(null);
    this.terrain.dispose();
    this.world.pool?.dispose();
    this.bodies.dispose();
    this.fx.dispose();
    this.enemies?.dispose();
    this.nugget?.dispose();
    this.props?.dispose();
    this.prologue?.dispose?.();
    this.explosives?.dispose?.();
    this.ruins?.dispose?.();
    this.traders?.dispose?.();
    this.vegetation?.dispose?.();
    this.builder?.dispose?.();
    this.events(this.clumps?.dispose());
    this.fluids?.dispose();
    this.world.onChange = null;
    for (const gh of this.ghosts?.values() || []) { gh.mesh.geometry.dispose(); gh.mesh.material.dispose(); }
    if (this.vm) this.vm.dispose();
    super.exit();
  }
}

// per-zone lamp-free light and fog colours
const AMBIENT = [null, [0.1, 0.08, 0.07], [0.1, 0.08, 0.07], [0.07, 0.08, 0.12], [0.13, 0.06, 0.045], [0.07, 0.095, 0.12], [0.09, 0.06, 0.13]];
const FOG = [null, [0.018, 0.012, 0.01], [0.02, 0.013, 0.01], [0.01, 0.012, 0.026], [0.04, 0.011, 0.005], [0.012, 0.02, 0.03], [0.018, 0.008, 0.03]];

export { ZONE_DEPTHS };
