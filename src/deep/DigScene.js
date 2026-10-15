// First-person mining in the 3D underground. The mole tunnels out of the burrow walls, digs plates
// of rock that fly out as chunks, frees ore, follows the radar toward Deep Town, finds lift
// stations, and walks back into the burrow through its own tunnels.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { DeepWorld } from './World.js';
import { TerrainView } from './Terrain.js';
import { FPSPlayer } from './Player.js';
import { Digger, breakable } from './Dig.js';
import { Bodies } from './Bodies.js';
import { Particles } from './Particles.js';
import { Ores } from './Ores.js';
import { Nugget } from './Nugget.js';
import { makeTerrainUniforms, MAX_LIGHTS } from './TerrainMaterial.js';
import { mouthBox, zoneAt, ZONE_DEPTHS } from './Generator.js';
import { VOX, M, MAT, ORE_BASE } from './materials.js';
import { roomSize } from '../iso/homeLayout.js';
import { ITEMS, sellPrice } from '../data/items.js';
import { ZONES } from '../data/zones.js';
import { ORES } from '../mine/blocks.js';
import { iconURL } from '../gfx/PixelArt.js';
import { VoxelGrid, meshGridGreedy } from '../gfx/Voxel.js';
import { clamp, rand, chance, hexToRgb, formatGoldFull } from '../core/util.js';

const SLOTS = ['pick', 'chisel', 'brush', 'drill', 'xray', 'stake', 'food'];
const REACH = 2.3;
const vmModules = import.meta.glob('../fps/ViewModel.js');
// optional systems, built separately (see docs/DEEP.md): fantasy enemies, flowing fluids
const extModules = import.meta.glob(['./Enemies.js', './Fluids.js', './Props.js']);
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
    this.lastMouth = { wall, t };
    this.world = new DeepWorld({ seed: deep.seed, W, D, tunnels: deep.tunnels });
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
    if (from === 'town') {
      const s = this.world.plan.stations[clamp(+params.station || 0, 0, 5)];
      pl.pos.set(s.x, s.y + 0.02, s.z);
      pl.yaw = Math.PI / 2;
    } else {
      const b = mouthBox(this.world.plan, wall, t);
      pl.pos.set((b.x0 + b.x1) / 2 + b.dir[0] * 0.15, 0.01, (b.z0 + b.z1) / 2 + b.dir[2] * 0.15);
      pl.yaw = Math.atan2(-b.dir[0], -b.dir[2]);
    }
    this.spawnPos = pl.pos.clone();
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
    const ctx = { scene: this.scene, world: this.world, U: this.U, fx: this.fx, bodies: this.bodies, audio: this.audio, state: st, ui: g.ui, player: pl, plan: this.world.plan, scene3: this.scene, owner: this };
    for (const [path, Name, key] of [['./Enemies.js', 'Enemies', 'enemies'], ['./Fluids.js', 'Fluids', 'fluids'], ['./Props.js', 'Props', 'props']]) {
      const load = extModules[path];
      if (!load) continue;
      try { const mod = await load(); this[key] = new mod[Name](ctx); } catch (e) { console.warn(Name + ' failed', e); }
    }
    // Nugget tags along once she's fallen down here with the mole
    this.nugget = null;
    if (st.flag('nugget')) {
      try { this.nugget = new Nugget({ scene3: this.scene, world: this.world, player: pl, audio: this.audio, fx: this.fx, owner: this }); } catch (e) { console.warn('nugget failed', e); }
    }
    if (this.fluids || this.props) this.world.onChange = (vx, vy, vz, old, m) => { this.fluids?.onVoxel(vx, vy, vz, old, m); this.props?.onVoxel?.(vx, vy, vz, old, m); };
    this.bodies.hooks = {
      tick: (b, sp) => { if (chance(0.6)) this.audio.play('debris', { vol: clamp(sp / 8, 0.2, 0.7) }); if (sp > 3) this.fx.dust(b.pos.x, b.pos.y - b.r, b.pos.z, 2, [0.5, 0.42, 0.34], 0.05); },
      gone: (b) => this.fx.dust(b.pos.x, b.pos.y, b.pos.z, 3, [0.5, 0.42, 0.34], 0.06),
      collect: (b) => this.collect(b.pickup),
    };
    this.updateHotbar();
    if (g.ui.setRadar) g.ui.setRadar((o) => this.radar(o), { heading: () => this.player.yaw });
    g.ui.setBag?.(0, st.bagCapacity());
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
  get slotName() { return SLOTS[this.slot]; }
  toolItem(slot) {
    const st = this.state;
    if (slot === 'pick') return st.equipped('pick');
    if (slot === 'stake') return st.count('glow_stake') ? ITEMS.glow_stake : null;
    if (slot === 'food') return this.bestFood();
    return st.equipped(slot);
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
    const icons = { pick: 'pick_rusty', chisel: 'chisel_basic', brush: 'brush_basic', drill: 'drill_steam', xray: 'xray_lamp', stake: 'glow_stake', food: 'grub_bar' };
    const slots = SLOTS.map((s, i) => {
      const it = this.toolItem(s);
      const n = s === 'stake' ? st.count('glow_stake') : s === 'food' && it ? st.count(it.id) : undefined;
      return { icon: iconURL(it ? it.id : icons[s]), key: String(i + 1), label: it ? it.name : '—', off: !it, n, meter: s === 'drill' && it ? this.drillHeat : undefined };
    });
    this.game.ui.setHotbar(slots, this.slot, (i) => this.selectSlot(i));
    const it = this.toolItem(this.slotName);
    if (this.vm) this.vm.setTool(it ? this.slotName : (this.slotName === 'food' ? 'none' : 'none'), { item: it?.id });
  }
  selectSlot(i) {
    const n = (i + SLOTS.length) % SLOTS.length;
    if (this.slot === n) return;
    this.slot = n;
    this.audio.play('ui_click', { pitch: 1.3 });
    this.updateHotbar();
  }
  energy(n) { if (n > 0) this.state.useEnergy(this.state.hasBuff('sturdy') ? n * 0.6 : n); }
  shake(a) { if (this.state.data.settings.shake) this.shakeAmp = Math.max(this.shakeAmp, a); }

  // ------------------------------------------------------------------ frame
  update(dt) {
    super.update(dt);
    const g = this.game, inp = g.input, pl = this.player, st = this.state;
    this.U.time.value = this.time;
    const busy = this.leaving || g.ui.isPanelOpen();
    // look
    const look = inp.takeLook();
    if (!busy) pl.look(look.dx, look.dy, this.isTouch() ? 0.0055 : 0.0026);
    if (!busy && inp.mousePressed(0) && !inp.pointerLocked && !this.isTouch()) { inp.lockPointer(); inp.mouse.pressed[0] = false; }
    // tools
    if (!busy) {
      for (let k = 0; k < SLOTS.length; k++) if (inp.pressed('Digit' + (k + 1))) this.selectSlot(k);
      if (inp.mouse.wheel) this.selectSlot(this.slot + Math.sign(inp.mouse.wheel));
      if (inp.pressed('KeyQ')) this.eatBest();
      if (inp.pressed('KeyE')) this.interact();
    }
    // move
    const mv = { x: inp.axisX(), y: inp.axisY() };
    // where the mole is trying to go (world xz), even when a wall stops it
    const sy = Math.sin(pl.yaw), cy = Math.cos(pl.yaw);
    this.wish = busy ? { x: 0, z: 0 } : { x: -sy * mv.y + cy * mv.x, z: -cy * mv.y - sy * mv.x };
    const exhausted = st.energy < 8;
    const ev = pl.update(dt, mv, { jump: inp.pressed('Space'), jumpHeld: inp.isDown('Space'), run: inp.isDown('ShiftLeft', 'ShiftRight') && !exhausted, frozen: busy, speedMul: exhausted ? 0.6 : 1 });
    if (ev.landed) { this.audio.play('land', { hard: ev.landed > 8 }); this.fx.dust(pl.pos.x, pl.pos.y + 0.05, pl.pos.z, Math.min(10, ev.landed | 0), [0.5, 0.42, 0.34], 0.2); }
    if (ev.fallDamage) this.hurt(Math.round(ev.fallDamage), 'fall');
    if (ev.jump) this.energy(0.2);
    if (ev.splash) { this.audio.play('splash'); this.fx.splash(pl.pos.x, pl.pos.y + 0.4, pl.pos.z, 1.2); }
    if (pl.climbing) { this.energy(0.9 * dt); if (chance(dt * 5)) this.audio.play('climb'); }
    if (pl.inLava && !st.protects('heat')) { st.useEnergy(18 * dt); if (chance(dt * 4)) this.audio.play('sizzle'); this.say('lava', '<b>LAVA!</b> Get out!', 'bad', 2); for (let k = 0; k < 2; k++) this.fx.ember(pl.pos.x, pl.pos.y + 0.3, pl.pos.z); }
    if (pl.grounded && pl.speed > 0.6) {
      this.stepT = (this.stepT || 0) - dt * pl.speed / 2.4;
      if (this.stepT <= 0) { this.stepT = 1; this.audio.play('step', { vol: 0.35 }); this.energy(0.04); }
    }
    // dig / use
    this.updateTarget();
    this.useTools(dt, busy);
    // world sim
    this.bodies.update(dt, pl.eye(), pl.pos);
    if (this.fluids) this.fluids.update(dt, { player: pl, eye: pl.eye(), time: this.time });
    if (this.nugget) this.nugget.update(dt);
    if (this.props) this.props.update(dt, { player: pl, eye: pl.eye(), time: this.time });
    if (this.enemies) {
      this.events(this.enemies.update(dt, { player: pl, eye: pl.eye(), forward: pl.forward(), time: this.time, busy, lamp: this.U.lampRange.value }));
    }
    this.fx.update(dt);
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
      if (e.damage) { this.hurt(e.damage, e.kind || 'enemy'); if (e.push) pl.vel.add(new THREE.Vector3(...e.push)); }
      if (e.say) this.say(e.key || e.say, e.say, e.tone || 'warn', e.cd ?? 4);
      if (e.loot) this.collect(e.loot);
    }
  }

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
    const use = this.props?.target?.(eye, f, reach) || this.enemies?.catchTest?.(eye, f, reach);
    if (use) { ui.setCrosshair({ visible: true, kind: 'use', label: use.label }); return; }
    if (this.enemies?.hitTest(eye, f, reach)) { ui.setCrosshair({ visible: true, kind: 'enemy' }); return; }
    if (!hit) { ui.setCrosshair({ visible: true, kind: 'none' }); return; }
    const m = MAT[hit.m];
    const ore = hit.m >= ORE_BASE;
    if (hit.m === M.DOOR) { ui.setCrosshair({ visible: true, kind: 'use', label: 'Home' }); return; }
    if (this.state.flag('escaped') && this.world.plan.stations.some((q) => Math.hypot(q.x - pl.pos.x, q.y - pl.pos.y, q.z - pl.pos.z) < 2.2)) { ui.setCrosshair({ visible: true, kind: 'use', label: 'Lift to Deep Town' }); return; }
    ui.setCrosshair({ visible: true, kind: ore ? 'ore' : breakable(hit.m) ? 'rock' : 'none', label: m ? m.name : '' });
  }

  useTools(dt, busy) {
    const inp = this.game.input, st = this.state;
    this.useT -= dt;
    this.drillHeat = Math.max(0, this.drillHeat - dt * (this.slotName === 'drill' && inp.mouseDown(0) ? 0 : 0.35));
    const want = !busy && inp.mouseDown(0) && (inp.pointerLocked || this.isTouch()) && !this.leaving;
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
        const rate = it.rate || 0.36;
        this.useT = rate * (st.hasBuff('zippy') ? 0.8 : 1) + 0.06;
        this.swing = { t: 0, windup: 0.13, dur: this.useT, hit: false };
        if (this.vm) this.vm.swing('pick', 0.13);
        this.audio.play('whoosh', { vol: 0.25, pitch: 1.4 });
      }
    } else if (tool === 'chisel') {
      // the mallet cocks back and knocks the chisel home
      if (this.useT <= 0 && !this.swing) { this.useT = (it.rate || 0.2) + 0.05; this.swing = { t: 0, windup: 0.1, dur: this.useT, hit: false, fn: () => this.chiselHit(it) }; if (this.vm) this.vm.swing('chisel', 0.1); }
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
    } else if (tool === 'food') {
      if (this.useT <= 0 && inp.mousePressed(0)) { this.useT = 0.6; this.eatBest(); }
    }
  }

  /** The pick lands (timed by the swing). */
  strike() {
    const st = this.state, hit = this.target;
    const it = st.equipped('pick');
    const power = (it?.power || 1) * (st.hasBuff('strong') ? 1.3 : 1);
    if (this.enemies && it) {
      const eye = this.player.eye(), f = this.player.forward();
      const reach = hit ? Math.min(REACH, hit.dist + 0.05) : REACH;
      const e = this.enemies.hitTest(eye, f, reach);
      if (e) {
        this.enemies.damage(e, power, f);
        this.kick.set(-0.016 * power, (Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.014);
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
      const r = this.ores.hitOre(hit.vx, hit.vy, hit.vz, power);
      this.audio.play('ore_damage');
      this.fx.sparks(px, py, pz, 10, col01(mat.accent), out, 3.5);
      if (r) {
        this.game.ui.floatText?.(`-${Math.round(r.ore.frag * power)}%`, ...this.screenXY(px, py, pz), '#ff8a6a', 0.8);
        if (!this.flags.oreHit) { this.flags.oreHit = true; st.learn('ore_damage'); this.say('orehit', 'Careful! Hitting ore chips its quality. Clear the rock around it instead.', 'warn', 30); }
        if (r.s.q <= 0) this.shatter(r.d);
      }
      return;
    }
    // rock
    const tier = it.tier || 1;
    const zone = zoneAt(-py);
    if (mat.hp > 3.5 && tier < 3 && zone >= 4) { this.audio.play('clang'); this.fx.sparks(px, py, pz, 8, [1, 0.8, 0.4], out, 3); this.say('hard', `${mat.name} is too hard for this pickaxe.`, 'warn', 5); return; }
    const res = this.digger.strike(hit.vx, hit.vy, hit.vz, power);
    this.audio.play('hit', { snd: mat.snd || 'stone' });
    const c = col01(mat.tones[2]);
    this.fx.dust(px, py, pz, 5, col01(mat.tones[1]), 0.06, out);
    this.fx.chips(px, py, pz, 4 + (Math.random() * 4 | 0), c, out);
    if (mat.snd === 'stone' || mat.snd === 'crystal') this.fx.sparks(px, py, pz, 3, [1, 0.8, 0.45], out, 2.5);
    this.ores.vibrate(px, py, pz, power * 0.4);
    this.afterBreak(res.broken, out, power, 'pick');
    if (res.broken.length > 6) { this.audio.play('break', { snd: mat.snd || 'stone' }); this.shake(0.25); }
  }

  /** Broken voxels fly out as a chunk; check ore around; stats. */
  afterBreak(broken, out, power, tool) {
    if (!broken.length) return;
    const st = this.state;
    st.data.stats.blocks += broken.length > 6 ? 1 : 0;
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
          this.bodies.spawn(L, { vel: [out[0] * sp + rand(-0.6, 0.6), out[1] * sp + rand(0.4, 1.6), out[2] * sp + rand(-0.6, 0.6)], life: 0.9 + Math.random() * 0.9, bounce: 0.45 });
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
    const { d, s, voxels, pristine } = f;
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
    if (counts && this.trip >= st.bagCapacity()) { this.say('bag', `Bag full! (${this.trip}/${st.bagCapacity()}) Head home to unload.`, 'warn', 4); return; }
    st.addItem(p.id, it.q ? { q: p.q, p: p.p } : {});
    if (counts) { this.trip++; st.data.stats.ores++; if (p.p) st.data.stats.pristine++; this.tripItems.push(p.id); }
    this.tripValue += sellPrice(p.id, p.q, p.p);
    this.audio.play(it.cat === 'gem' || p.p ? 'pickup_gem' : 'pickup', { pitch: 0.9 + Math.random() * 0.3 });
    const cat = it.cat === 'gem' ? 'gem' : it.cat === 'mineral' ? 'mineral' : it.cat === 'plant' ? 'plant' : null;
    if (cat) st.discover(cat, p.id);
    this.game.ui.toast(`+ <b>${it.name}</b>${it.q ? ` ${p.q}%` : ''}${p.p ? ' · <b>pristine</b>' : ''}`, { icon: iconURL(p.id), kind: 'good' });
    this.game.ui.setBag?.(this.trip, st.bagCapacity());
    this.updateHotbar();
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
    const r = 1.5 + (it.power || 3) * 0.25;
    const res = this.digger.drill(cx, cy, cz, r);
    const px = (hit.vx + 0.5) / VOX, py = (hit.vy + 0.5) / VOX, pz = (hit.vz + 0.5) / VOX;
    this.energy(0.08);
    if (chance(0.5)) this.audio.play('hit', { snd: 'stone', vol: 0.4 });
    this.fx.sparks(px, py, pz, 3, [1, 0.7, 0.3], [hit.nx, hit.ny, hit.nz], 3);
    this.fx.dust(px, py, pz, 2, col01(MAT[hit.m]?.tones?.[1] ?? 0x806050), 0.05, [hit.nx, hit.ny, hit.nz]);
    for (const o of res.ore) { const r2 = this.ores.hitOre(o.x, o.y, o.z, 0.5); if (r2 && r2.s.q <= 0) this.shatter(r2.d); }
    this.shake(0.12);
    this.kick.set((Math.random() - 0.5) * 0.006, (Math.random() - 0.5) * 0.006, 0);
    this.afterBreak(res.broken, [hit.nx, hit.ny, hit.nz], 0.5, 'drill');
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

  hurt(n, kind) {
    this.state.useEnergy(n);
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
    // ring a lift station bell
    for (const s of this.world.plan.stations) {
      if (Math.hypot(s.x - pl.pos.x, s.y - pl.pos.y, s.z - pl.pos.z) < 2.2) {
        if (!this.state.flag('escaped')) { this.say('lift0', 'The lift bell is rusted silent. Find the way into Deep Town first.', 'warn', 4); return; }
        this.leave('town', { from: 'mine' });
        return;
      }
    }
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
    // lift stations
    for (const s of plan.stations) {
      if (this.deep.stations.includes(s.n)) continue;
      if (Math.hypot(s.x - pl.pos.x, s.y - pl.pos.y, s.z - pl.pos.z) < 2.6) {
        this.deep.stations.push(s.n);
        this.audio.play('ding');
        this.say('station' + s.n, `<b>Lift station found!</b> ${s.n === 0 ? 'Right below Deep Town.' : `The lift can now stop at ${ZONES[s.zone].name}.`}`, 'good', 99);
      }
    }
    // zones and depth
    const depth = Math.max(0, -pl.pos.y);
    const zone = zoneAt(depth);
    if (zone !== this.zone) {
      this.zone = zone;
      st.data.zoneMax = Math.max(st.data.zoneMax || 1, zone);
      this.U.ambient.value.setRGB(...AMBIENT[zone]);
      this.U.fogCol.value.setRGB(...FOG[zone]);
      this.scene.background.setRGB(...FOG[zone]);
      this.music = 'mine';
      g.ui.setDepth(`<b>${Math.floor(depth)} m</b><br>${ZONES[zone].name}`);
      if (this.time > 1) this.say('zone' + zone, `<b>${ZONES[zone].name}</b> · ${ZONES[zone].desc}`, 'good', 999);
    }
    st.data.deepest = Math.max(st.data.deepest || 0, depth);
    // energy
    if (st.energy <= 0 && !this.fainting) this.faint();
    else if (st.energy < 20 && !this.flags.low) { this.flags.low = true; this.say('low', 'Running low on energy. Eat something, or head home.', 'warn', 60); }
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
    for (let dz = -3; dz <= 3; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx, y = cy + dy, z = cz + dz;
      const m = w.voxelAt(Math.floor((x + 0.5) * VOX), Math.floor((y + 0.5) * VOX), Math.floor((z + 0.5) * VOX));
      const v = !m ? 1 : m === M.WATER ? 2 : m === M.LAVA ? 3 : 0;
      if (v) ex[x + ',' + y + ',' + z] = v; // only open space is remembered; rock is everything else
    }
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
    for (const s of plan.stations) if (this.deep.stations.includes(s.n)) markers.push({ kind: 'station', x: s.x, y: s.y, z: s.z, label: 'Lift' });
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
    return { x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, heading: pl.yaw, range: o.survey ? half * cell : 22, explored: { size, cell, data, ox: px - half, oz: pz - half }, markers };
  }

  ambient(dt) {
    const pl = this.player, eye = pl.eye();
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
    for (const src of [this.enemies, this.fluids, this.props]) {
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
    this.game.ui.setDepth(`<b>${Math.floor(depth)} m</b><br>${ZONES[zoneAt(depth)].name}<br>Bag ${this.trip}/${st.bagCapacity()}`);
    if (this.slotName === 'drill') this.game.ui.setHotbarMeter?.(SLOTS.indexOf('drill'), this.drillHeat);
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
    this.bodies.dispose();
    this.fx.dispose();
    this.enemies?.dispose();
    this.nugget?.dispose();
    this.props?.dispose();
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
