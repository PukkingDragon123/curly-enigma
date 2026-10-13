// The mine: a side-view cross-section of pixel rock you chip away bit by bit. Rock breaks
// into real chunks along its grain, ores hide inside as little pixel deposits you free with
// care, loose ground pours, undercut rock falls. Walk into a wall and the view drops into a
// first-person close-up of the rock face (FaceMode).
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { clamp, rand, chance, pick, wait, el, formatGoldFull, lerp } from '../core/util.js';
import { B, BLOCKS, ORES, isSolid, isGranular } from '../mine/blocks.js';
import { F } from '../mine/MineWorld.js';
import { M, CPX, MAT, ORE_BASE, isStain } from '../mine/micro.js';
import { generateMine } from '../mine/MineGen.js';
import { stepFluids } from '../mine/Fluids.js';
import { Lighting } from '../mine/Lighting.js';
import { MineRenderer } from '../mine/Render.js';
import { Player, P_W, P_H } from '../mine/Player.js';
import { Debris, Stability } from '../mine/Physics.js';
import { Pickups, Plants, Creatures, PLANT_ITEM } from '../mine/Entities.js';
import { FX } from '../mine/FX.js';
import { Bodies } from '../mine/Bodies.js';
import { Sand } from '../mine/Sand.js';
import { Digger } from '../mine/Dig.js';
import { Tools, REACH } from '../mine/Tools.js';
import { FaceMode } from '../mine/FaceMode.js';
import { generateIntro, IntroController } from '../mine/Intro.js';
import { ITEMS, sellPrice } from '../data/items.js';
import { ZONES, MAX_ZONE } from '../data/zones.js';
import { iconURL } from '../gfx/PixelArt.js';
import { qColor } from '../ui/UI.js';

const AMBIENT = [[0.085, 0.075, 0.07], [0.1, 0.088, 0.08], [0.1, 0.082, 0.074], [0.075, 0.08, 0.105], [0.105, 0.066, 0.052], [0.075, 0.092, 0.11], [0.08, 0.06, 0.105]];
const GROWTH = [0x5a8a3a, 0x5a8a3a, 0x3a8a6a, 0x4aa0a0, 0x4a4040, 0xd8f0ff, 0x8a5ad0];
// far-wall twinkles per zone: [r, g, b, density]
const SPECK = [[0.35, 0.5, 0.25, 0.005], [0.35, 0.5, 0.25, 0.004], [0.3, 0.55, 0.45, 0.006], [0.25, 0.45, 0.9, 0.012], [0.9, 0.35, 0.1, 0.006], [0.6, 0.85, 1.0, 0.01], [0.6, 0.35, 0.95, 0.012]];
const SLOTS = ['pick', 'chisel', 'brush', 'drill', 'xray', 'beam', 'stake', 'food'];
const FOOD_PRIORITY = (it) => (it.energy || it.food || 0);

export default class MineScene extends Scene {
  async enter(params) {
    const g = this.game, st = g.state;
    this.hud = 'mine';
    this.music = 'mine';
    this.intro = params.intro === '1' || params.intro === 1 || params.intro === true;
    let zone = clamp(parseInt(params.zone, 10) || 1, 1, MAX_ZONE);
    if (zone > st.data.zoneMax) zone = st.data.zoneMax;
    this.zone = this.intro ? 0 : zone;
    this.zdef = this.intro ? { name: 'Collapsed Tunnels', depth: [40, 70] } : ZONES[zone];
    this.musicParams = { depth: this.intro ? 0.15 : (zone - 1) / 5 };
    this.audio = g.audio;
    this.state = st;
    this.flags = {};
    const done = g.showLoading(this.intro ? '...' : 'Digging...');
    await wait(40);
    const seed = params.seed ? parseInt(params.seed, 10) : ((Date.now() ^ (zone * 7919)) >>> 0);
    const gen = this.intro ? generateIntro(seed) : generateMine(zone, seed);
    this.world = gen.world;
    this.gen = gen.gen;
    const w = this.world;
    // pixels around the start exist before the first frame
    w.ensureCells(Math.floor(w.spawn.x) - 18, Math.floor(w.spawn.y) - 11, Math.floor(w.spawn.x) + 18, Math.floor(w.spawn.y) + 11);
    this.lighting = new Lighting(w);
    this.renderer = new MineRenderer(this.scene, w, this.lighting, { growth: GROWTH[this.zone], speck: SPECK[this.zone] });
    const amb = AMBIENT[this.zone];
    this.renderer.U.ambient.value.setRGB(amb[0], amb[1], amb[2]);
    this.player = new Player(this.scene, w, st);
    this.debris = new Debris(this.renderer.debris, w);
    this.debris.tick = () => { if (chance(0.4)) this.audio.play('debris', { vol: 0.45 }); };
    this.bodies = new Bodies(this.renderer.root, w, this.renderer.U);
    this.bodies.hooks = {
      tick: (b, sp) => { if (chance(0.7)) this.audio.play('debris', { vol: clamp(sp / 9, 0.25, 0.8) }); if (sp > 4) this.fx.dust(b.x, -b.y + b.r, 2, [0.7, 0.64, 0.56], 0.15); },
      bigLand: (b, sp) => this.tools.bigLand(b, sp),
      hitPlayer: (b) => this.bonk(9),
      gone: (b) => this.fx.dust(b.x, -b.y, 2, [0.62, 0.56, 0.5], 0.12),
      splash: (b, t, sp, sy) => {
        if (t === 2) { this.fx.steam(b.x, sy, 5); this.fx.sparks(b.x, sy, 5, [1, 0.6, 0.2], 3); this.audio.play('sizzle', { vol: 0.5 }); return; }
        if (sp < 1.2) return;
        const k = clamp(0.35 + b.n / 500, 0.35, 1.6);
        this.fx.splash(b.x, sy, k);
        this.audio.play('splash', { vol: clamp(sp / 10, 0.2, 0.9) * Math.min(1, k) });
      },
    };
    this.sand = new Sand(w);
    this.digger = new Digger(w);
    this.tools = new Tools(this);
    this.fx = new FX(this);
    this.stability = new Stability(w, {
      warnStart: (x, y) => { if (chance(0.5)) this.audio.play('creak'); },
      warn: (x, y) => { if (chance(0.25)) this.fx.trickle(x, y); },
      collapse: (x, y) => this.collapse(x, y),
      loose: (x, y) => this.sand.wake(x * M + 16, y * M + 16, 40),
    });
    this.pickups = new Pickups(this);
    this.plants = new Plants(this, gen.plants);
    this.creatures = new Creatures(this, gen.creatures);
    this.magnets = [];
    this.fires = new Set();
    this.embersFlying = [];
    w.onChange((x, y, was, now) => {
      if (isSolid(was) && !isSolid(now)) this.stability.onOpened(x, y);
      this.staticDirty = true;
    });
    this.staticDirty = true;

    // camera: a fixed, slightly raised side view; FaceMode pulls it in close
    this.camera = new THREE.PerspectiveCamera(36, g.engine.aspect, 1, 260);
    this.scene.add(this.camera);
    this.camDist = params.overview ? 150 : 16;
    this.camX = this.player.x;
    this.camY = this.player.y;
    this.shakeAmp = 0;
    this.post = { vignette: 0.6, levels: 28, dither: 1, saturation: 1.12, contrast: 1.06, outline: true, outlineColor: 0x0a0608, innerThresh: 0.4 };
    this.scene.background = new THREE.Color(0x000000);
    if (params.overview) { this.overview = true; this.renderer.U.ambient.value.setRGB(0.55, 0.55, 0.55); for (const d of w.deposits) d.revealed = true; }

    // tools & trip
    this.slot = 0;
    this.swing = null;
    this.toolCd = 0;
    this.drillHeat = 0;
    this.overheat = 0;
    this.drillTime = 0;
    this.xrayOn = false;
    this.trip = 0;
    this.tripItems = [];
    this.tripValue = 0;
    this.fluidT = 0;
    this.fluidTick = 0;
    this.oreT = 0;
    this.scanT = 0;
    this.hudT = 0;
    this.stepT = 0;
    this.sandT = 0;
    this.toastCd = {};
    this.fainting = false;
    this.leaving = false;
    this.loops = {};
    this.cageY = -2;
    this.hitStop = 0;
    if (!this.intro) {
      st.data.stats.trips++;
      st.data.deepest = Math.max(st.data.deepest || 0, this.zdef.depth[0]);
    }

    this.own(st.on('exhausted', () => this.faint()));
    this.tooltip = el('div', { class: 'bubble', style: { pointerEvents: 'none', transform: 'translate(12px, 12px)', fontSize: '.7em', opacity: 0, transition: 'none', textAlign: 'left' } });
    g.ui.world.append(this.tooltip);

    this.face = new FaceMode(this);
    this.introCtl = this.intro ? new IntroController(this, gen.intro) : null;

    this.updateView();
    this.renderer.terrain.update(...this.viewPx(), 999);
    done();
    if (this.introCtl) this.introCtl.start();
    else {
      this.audio.play('bell');
      setTimeout(() => { if (this.game.scene === this) g.ui.toast(`<b>${this.zdef.name}</b> · ${Math.round(this.zdef.depth[0])}–${this.zdef.depth[1]} m`, { dur: 3500 }); }, 300);
    }
    this.updateHotbar(true);
  }

  // ================================================================== helpers
  idx(x, y) { return this.world.idx(x, y); }
  lightAt(x, y) { const L = this.lighting.sample(x, y); return Math.max(L[0], L[1], L[2]); }
  isLit(x, y, th = 0.15) { return this.lightAt(x, y) > th; }
  say(key, html, kind = 'warn', cd = 4) {
    const now = this.time;
    if (this.toastCd[key] && now - this.toastCd[key] < cd) return;
    this.toastCd[key] = now;
    this.game.ui.toast(html, { kind });
  }
  screen(x, y, z = 0.5) { return this.toScreen(new THREE.Vector3(x, -y, z)); }
  float(text, x, y, color = '#fff', size = 1) {
    const p = this.screen(x, y);
    if (p.visible) this.game.ui.floatText(text, p.x, p.y, color, size * (this.face.on ? 1.25 : 1));
  }
  shake(a) { if (this.state.data.settings.shake) this.shakeAmp = Math.max(this.shakeAmp, a); }
  /** A tool landed: flash the rock there and kick the camera toward the blow. */
  impact(t, k = 1) {
    const h = this.renderer.U.hit.value;
    h.set(t.x, -t.y, this.face.on ? 0.42 : 0.55, 0.55 * k);
    if (!this.state.data.settings.shake) return;
    const d = Math.hypot(t.dirx, t.diry) || 1;
    this.kick = { x: (t.dirx / d) * 0.07 * k, y: (-t.diry / d) * 0.07 * k, z: this.face.on ? -0.35 * k : 0 };
  }
  energy(n) {
    const st = this.state;
    if (st.hasBuff('sturdy')) n *= 0.6;
    if (this.intro) n *= 0.5;
    if (n > 0) st.useEnergy(n);
  }
  hurt(n, kind) {
    const pl = this.player;
    this.state.useEnergy(n);
    pl.hurtT = 0.45;
    this.audio.play('hurt');
    this.float(`-${Math.round(n)}`, pl.x, pl.y - 0.8, '#ff7a6a');
    this.shake(0.12);
    if (this.face.on) this.face.exit('hurt');
  }
  bonk(n) {
    if (this.bonkT > 0) return;
    this.bonkT = 1;
    this.hurt(n, 'rock');
    this.player.knock.x = (chance(0.5) ? 1 : -1) * 3;
    this.say('bonk', 'BONK! Watch the ceiling!', 'bad', 3);
  }
  zap(x, y, dmg, msg) {
    if (this.state.protects('zap')) return;
    this.audio.play('zap');
    this.fx.arcs(this.player.x, this.player.y, 7);
    this.fx.light(this.player.x, this.player.y, [0.5, 0.9, 1.4], 5, 0.25);
    this.hurt(dmg, 'zap');
    this.post.flash = 0.3; this.post.flashColor = 0x9fe8ff;
    this.state.learn('shock');
    if (msg) this.say('zap', msg, 'bad', 3);
  }
  burn(dmg, x, y) {
    if (this.state.protects('heat')) return;
    this.audio.play('sizzle');
    for (let i = 0; i < 6; i++) this.fx.ember(this.player.x, this.player.y);
    this.hurt(dmg, 'burn');
    this.state.learn('burning_paws');
    this.say('burn', 'Ouch! Too hot to hold!', 'bad', 3);
  }
  depCenter(d) { return { x: (d.x0 + d.w / 2) / M, y: (d.y0 + d.h / 2) / M }; }
  nearestHiddenDeposit(x, y, r) {
    let best = null, bd = Infinity;
    for (const d of this.world.depositsNear(x, y, r)) {
      if (d.visible || d.done || ORES[d.oreId].tags.includes('void')) continue;
      const c = this.depCenter(d);
      const dd = Math.hypot(c.x - x, c.y - y);
      if (dd < bd) { bd = dd; best = c; }
    }
    return best;
  }
  /** Legacy name used by plants (whisperweed). */
  nearestHiddenOre(x, y, r) { const c = this.nearestHiddenDeposit(x + 0.5, y + 0.5, r); return c ? { x: c.x - 0.5, y: c.y - 0.5 } : null; }
  nearestVisibleDeposit(x, y, r) {
    let best = null, bd = Infinity;
    for (const d of this.world.depositsNear(x, y, r)) {
      if (!d.visible || d.done) continue;
      const c = this.depCenter(d);
      const dd = Math.hypot(c.x - x, c.y - y);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  // ================================================================== tools
  toolItem(slot) {
    const st = this.state;
    if (slot === 'pick') return st.equipped('pick');
    if (slot === 'beam') return st.count('support_beam') ? ITEMS.support_beam : null;
    if (slot === 'stake') return st.count('glow_stake') ? ITEMS.glow_stake : null;
    if (slot === 'food') return this.bestFood();
    return st.equipped(slot);
  }
  bestFood() {
    let best = null;
    for (const gr of this.state.inventory((it) => it && (it.cat === 'food' || it.food))) {
      const it = ITEMS[gr.id];
      if (!best || FOOD_PRIORITY(it) > FOOD_PRIORITY(best)) best = it;
    }
    return best;
  }
  updateHotbar() {
    const st = this.state;
    const slots = SLOTS.map((s, i) => {
      const it = this.toolItem(s);
      const icons = { pick: 'pick_rusty', chisel: 'chisel_basic', brush: 'brush_basic', drill: 'drill_steam', xray: 'xray_lamp', beam: 'support_beam', stake: 'glow_stake', food: 'grub_bar' };
      const id = it ? it.id : icons[s];
      const n = s === 'beam' ? st.count('support_beam') : s === 'stake' ? st.count('glow_stake') : s === 'food' && it ? st.count(it.id) : undefined;
      return { icon: iconURL(id), key: String(i + 1), label: it ? it.name + (s === 'food' ? ` (+${it.energy || it.food})` : '') : '—', off: !it, n, meter: s === 'drill' && it ? this.drillHeat : undefined };
    });
    this.game.ui.setHotbar(slots, this.slot, (i) => { this.selectSlot(i); });
  }
  selectSlot(i) {
    const n = (i + SLOTS.length) % SLOTS.length;
    if (this.slot === n) return;
    this.slot = n;
    this.audio.play('ui_click', { pitch: 1.3 });
    this.updateHotbar();
  }
  get slotName() { return SLOTS[this.slot]; }

  /** Pointer position on the rock face in cell coords. */
  mouseWorld() {
    const mouse = this.game.input.mouse;
    if (!this._ray) this._ray = new THREE.Raycaster();
    this._ray.setFromCamera(new THREE.Vector2(mouse.nx, mouse.ny), this.camera);
    const r = this._ray.ray;
    const t = (0.5 - r.origin.z) / r.direction.z;
    if (!(t > 0)) return null;
    return { x: r.origin.x + r.direction.x * t, y: -(r.origin.y + r.direction.y * t) };
  }
  computeTarget() {
    const m = this.face.on ? this.face.pointer() : this.mouseWorld();
    if (!m) return null;
    return this.tools.target(m.x, m.y, this.face.on ? REACH + 0.6 : REACH);
  }

  useTools(dt) {
    const g = this.game, inp = g.input, st = this.state, pl = this.player;
    const slot = this.slotName;
    const tool = this.toolItem(slot);
    const t = this.target;
    const lmb = inp.mouseDown(0) && !this.fainting && !this.leaving && !(this.introCtl && this.introCtl.blockTools());
    pl.action = null;
    this.xrayOn = false;
    const heldMap = { pick: 'pick', chisel: 'chisel', brush: 'brush', drill: 'drill', xray: 'xray' };
    pl.hold(tool && heldMap[slot] ? heldMap[slot] : null);
    this.face.tool = tool && heldMap[slot] ? slot : null;

    if (this.swing) {
      this.swing.t += dt;
      pl.rig.swingPhase = clamp(this.swing.t / this.swing.dur, 0, 1);
      pl.action = 'swing';
      if (!this.swing.done && this.swing.t >= this.swing.dur * 0.5) {
        this.swing.done = true;
        const tg = this.computeTarget() || this.swing.target;
        this.face.impact('pick', tg);
        this.tools.pick(tg, this.swing.tool);
      }
      if (this.swing.t >= this.swing.dur) this.swing = null;
    }
    this.toolCd -= dt;
    if (this.overheat > 0) { this.overheat -= dt; this.drillHeat = Math.max(0, this.drillHeat - dt * 0.4); if (chance(dt * 8)) this.fx.steam(pl.x + pl.facing * 0.5, pl.y, 1); }
    let drilling = false;
    if (lmb && tool && t) {
      const zippy = st.hasBuff('zippy') ? 0.75 : 1;
      switch (slot) {
        case 'pick':
          if (!this.swing && this.toolCd <= 0) {
            const rate = (tool.rate || 0.36) * zippy;
            this.swing = { t: 0, dur: rate, done: false, target: t, tool };
            this.toolCd = rate;
            this.audio.play('whoosh', { gap: 0 });
            this.face.windup('pick', rate);
          }
          break;
        case 'chisel':
          pl.action = 'chisel';
          if (this.toolCd <= 0) { this.toolCd = (tool.rate || 0.2) * zippy; this.face.impact('chisel', t); this.tools.chisel(t, tool); }
          break;
        case 'brush':
          pl.action = 'brush';
          if (this.toolCd <= 0) { this.toolCd = (tool.rate || 0.12) * zippy; this.face.impact('brush', t); this.tools.brush(t, tool); }
          break;
        case 'drill':
          if (this.overheat > 0) { this.say('hot', 'The drill is too hot. Let it cool!', 'warn', 2); break; }
          pl.action = 'drill';
          drilling = true;
          this.face.impact('drill', t);
          this.tools.drill(t, tool, dt);
          break;
        case 'xray':
          pl.action = 'xray';
          this.xrayOn = true;
          this.energy(0.7 * dt);
          break;
        case 'beam':
          if (inp.mousePressed(0)) this.placeBeam(t);
          break;
        case 'stake':
          if (inp.mousePressed(0)) this.placeStake(t);
          break;
        case 'food':
          if (inp.mousePressed(0) && tool) { g.eat(tool.id); this.updateHotbar(); this.face.impact('eat', t); }
          break;
      }
    }
    const dtool = st.equipped('drill');
    if (drilling && dtool) {
      const slime = st.count('slug_slime') > 0;
      this.drillHeat += dt * dtool.heatRate * (slime ? 0.6 : 1);
      this.drillTime += dt;
      if (slime && this.drillTime > 15) { this.drillTime = 0; st.removeItem('slug_slime', 1); }
      if (this.drillHeat >= 1) { this.overheat = 2.6; this.audio.play('overheat'); st.learn('overheating'); this.say('overheat', 'Drill overheated!', 'bad', 2); }
      if (!this.loops.drill) { this.loops.drill = this.audio.loop('drill', { vol: 0.5 }); this.audio.play('drill_start'); }
      this.loops.drill.set({ load: t && t.solid ? 1 : 0.2 });
    } else {
      this.drillHeat = Math.max(0, this.drillHeat - dt * 0.22);
      if (this.loops.drill) { this.loops.drill.stop(); this.loops.drill = null; }
    }
    const U = this.renderer.U;
    if (this.xrayOn) {
      const xt = st.equipped('xray');
      const head = { x: pl.x, y: pl.y - 0.25 };
      const m = t ? { x: t.mx, y: t.my } : { x: head.x + pl.facing, y: head.y };
      const ang = Math.atan2(-(m.y - head.y), m.x - head.x);
      U.xray.value.set(head.x, -head.y, ang, xt.radius);
      U.xrayOn.value = 1;
      this.revealCone(head, ang, xt.radius);
      if (!this.loops.xray) { this.loops.xray = this.audio.loop('xray', { vol: 0.4 }); this.audio.play('xray_on'); }
    } else {
      U.xrayOn.value = 0;
      if (this.loops.xray) { this.loops.xray.stop(); this.loops.xray = null; }
    }
    if (inp.mousePressed(2) && t && !this.fainting) this.grab(t);
  }

  inXray(x, y) {
    if (!this.xrayOn) return false;
    const v = this.renderer.U.xray.value;
    const dx = x - v.x, dy = -y - v.y;
    const r = Math.hypot(dx, dy);
    if (r > v.w) return false;
    let da = Math.atan2(dy, dx) - v.z;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    return Math.abs(da) < 0.45;
  }

  revealCone(head, ang, R) {
    const st = this.state;
    for (const d of this.world.depositsNear(head.x, head.y, R + 1)) {
      if (d.revealed || d.done) continue;
      const c = this.depCenter(d);
      if (!this.inXray(c.x, c.y)) continue;
      if (ORES[d.oreId].tags.includes('void')) continue;
      d.revealed = true;
      d.visible = true;
      this.tools.touchDeposit(d);
      this.fx.sparkle(c.x, c.y, [0.5, 0.95, 1]);
      if (!this.flags.xray) { this.flags.xray = true; st.learn('x_ray'); }
      this.audio.play('glow', { gap: 0.15 });
    }
  }

  /** Hitting open space: plants, creatures, webs, beams. */
  hitOpenCell(t, kind) {
    const w = this.world;
    const x = t.cx, y = t.cy;
    if (this.creatures.hitAt(t.mx, t.my, kind)) { this.audio.play('hit', { snd: 'flesh', vol: 0.6 }); return; }
    const plant = this.plants.at(x, y);
    if (plant) { this.plants.harvest(plant, false); return; }
    if (w.hasFlag(x, y, F.WEB)) { this.clearWeb(x, y); return; }
    if (w.hasFlag(x, y, F.BEAM) && kind === 'pick') { this.removeBeam(x, y); return; }
    if (this.introCtl && this.introCtl.hit(t, kind)) return;
  }

  grab(t) {
    const w = this.world;
    if (t.far) return;
    if (this.introCtl && this.introCtl.grab(t)) return;
    const x = t.cx, y = t.cy;
    if (this.creatures.grabAt(t.mx, t.my, 0.9)) return;
    const plant = this.plants.at(x, y) || this.plants.at(Math.floor(t.mx), Math.floor(t.my));
    if (plant) { this.plants.harvest(plant, true); return; }
    if (w.hasFlag(x, y, F.WEB)) { this.clearWeb(x, y); return; }
    if (w.hasFlag(x, y, F.BEAM)) { this.removeBeam(x, y); return; }
    if (w.hasFlag(x, y, F.STAKE)) { w.setFlag(x, y, F.STAKE, false); this.state.addItem('glow_stake'); this.staticDirty = true; this.audio.play('remove'); this.updateHotbar(); }
  }

  clearWeb(x, y) {
    this.world.setFlag(x, y, F.WEB, false);
    this.pickups.spawn('spider_silk', x + 0.5, y + 0.5, { vy: -2 });
    this.fx.dust(x + 0.5, y + 0.5, 6, [0.9, 0.95, 1]);
    this.audio.play('brush');
  }

  placeBeam(t) {
    const w = this.world, st = this.state;
    if (!t || t.far) return;
    const x = Math.floor(t.mx), y = Math.floor(t.my);
    if (w.hasFlag(x, y, F.BEAM)) { this.removeBeam(x, y); return; }
    if (w.solid(x, y)) { this.say('beamsolid', 'Beams go in open space, under a ceiling.', 'warn'); return; }
    if (!w.solid(x, y - 1) && !w.hasFlag(x, y - 1, F.BEAM)) { this.say('beamceil', 'Nothing above to hold up.', 'warn'); return; }
    if (!st.count('support_beam')) return;
    st.removeItem('support_beam', 1);
    w.setFlag(x, y, F.BEAM, true);
    for (let yy = y - 3; yy < y; yy++) for (let xx = x - 8; xx <= x + 8; xx++) {
      if (!w.inb(xx, yy)) continue;
      const i = w.idx(xx, yy);
      if (w.stress[i] > 0 && this.stability.holds(xx, yy)) { w.stress[i] = 0; this.stability.stressed.delete(i); }
    }
    this.audio.play('place');
    this.fx.dust(x + 0.5, y + 0.5, 6);
    st.learn('supports');
    this.updateHotbar();
  }
  removeBeam(x, y) {
    this.world.setFlag(x, y, F.BEAM, false);
    this.state.addItem('support_beam');
    this.audio.play('remove');
    this.stability.onOpened(x, y);
    this.updateHotbar();
  }
  placeStake(t) {
    const w = this.world, st = this.state;
    if (!t || t.far) return;
    const x = Math.floor(t.solid ? t.mx - t.dirx * 0.3 : t.mx), y = Math.floor(t.solid ? t.my - t.diry * 0.3 : t.my);
    if (w.solid(x, y) || !st.count('glow_stake')) return;
    st.removeItem('glow_stake', 1);
    w.setFlag(x, y, F.STAKE, true);
    this.staticDirty = true;
    this.audio.play('place');
    this.audio.play('glow');
    st.learn('darkness');
    this.updateHotbar();
  }

  quake(x, y) {
    this.stability.quake(x, y, 4);
    this.audio.play('rumble_hit');
    this.audio.play('creak');
    this.shake(0.3);
    this.fx.dustCloud(x + 0.5, y + 0.5, 3, [0.7, 0.55, 0.45]);
    this.say('quake', 'The ground lurches! Quakestone!', 'bad', 6);
    this.state.learn('cave_in');
    this.sand.wake(x * M, y * M, 140);
  }

  collapse(x, y) {
    this.tools.collapseCell(x, y);
    this.collapseCount = (this.collapseCount || 0) + 1;
    this.collapseT = 2;
    this.audio.play('creak');
    this.shake(0.12);
    if (this.collapseCount >= 3 && !this.caveInCounted) {
      this.caveInCounted = true;
      this.state.learn('cave_in');
      this.audio.play('collapse');
      this.shake(0.4);
      this.say('cavein', '<b>Cave-in!</b>', 'bad', 5);
      if (!this.loops.rumble) { this.loops.rumble = this.audio.loop('rumble', { vol: 0.5 }); setTimeout(() => { if (this.loops.rumble) { this.loops.rumble.stop(1); this.loops.rumble = null; } }, 2500); }
    }
  }

  spitEmber(x, y, dir) {
    this.embersFlying.push({ x, y, vx: dir * rand(3, 5), vy: -rand(3, 5), t: 0 });
  }

  // ------------------------------------------------------------------ pickups & inventory
  tryPickup(p) {
    const st = this.state;
    const it = ITEMS[p.id];
    if (!it) return true;
    if (p.id === 'bioxide' && !st.protects('zap')) { this.zap(p.x, p.y, 6, 'Bioxide zaps your bare paws!'); return false; }
    if ((p.id === 'magmaite' || p.id === 'sunstone') && !st.protects('heat')) { this.burn(5, p.x, p.y); return false; }
    if (p.id === 'frostite' && !st.protects('cold')) { this.hurt(4, 'cold'); this.fx.frost(p.x - 0.5, p.y - 0.5); this.say('cold', 'Too cold to hold! Your paws go numb.', 'bad', 3); st.learn('freezing'); return false; }
    const counts = it.cat === 'mineral' || it.cat === 'gem';
    if (counts && this.trip >= st.bagCapacity()) { this.say('bag', `Bag full! (${this.trip}/${st.bagCapacity()})${this.intro ? '' : ' Ring a lift bell to head home.'}`, 'warn', 4); return false; }
    const lot = st.addItem(p.id, it.q ? { q: p.q, p: p.p } : {});
    if (counts) { this.trip++; st.data.stats.ores++; }
    this.tripItems.push({ id: p.id, uid: lot && lot.uid });
    this.tripValue += sellPrice(p.id, p.q, p.p);
    this.audio.play(it.cat === 'gem' || p.p ? 'pickup_gem' : 'pickup', { pitch: 0.9 + Math.random() * 0.3 });
    this.float(it.q ? `+${it.name} ${Math.round(p.q)}%` : `+${it.name}`, p.x, p.y - 0.5, it.q ? qColor(p.q) : '#e8ffd0', 0.85);
    const cat = it.cat === 'gem' ? 'gem' : it.cat === 'mineral' ? 'mineral' : it.cat === 'plant' ? 'plant' : null;
    if (cat) st.discover(cat, p.id);
    if (this.game.ui.setBag) this.game.ui.setBag(this.trip, st.bagCapacity());
    this.updateHotbar();
    return true;
  }

  // ------------------------------------------------------------------ deposits doing their thing
  oreBehaviors(dt) {
    const w = this.world, st = this.state, pl = this.player, v = this.view;
    this.magnets = [];
    this.oreLights = [];
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    const R = Math.max(v.x1 - v.x0, v.y1 - v.y0) / 2 + 6;
    for (const d of w.depositsNear(cx, cy, R)) {
      if (d.done) continue;
      const o = ORES[d.oreId];
      const c = this.depCenter(d);
      if (o.tags.includes('scent') && !d.visible && Math.hypot(pl.x - c.x, pl.y - c.y) < 6 && chance(dt * 1.5)) this.fx.scent(c.x - 0.5, c.y - 0.5);
      if (!d.visible) {
        // the faintest glint betrays hidden ore under lamplight
        if (d.stamped && chance(dt * 0.06) && this.lightAt(c.x, c.y) > 0.4) this.fx.glints(c.x - 0.5, c.y - 0.5);
        continue;
      }
      if (o.glow) this.oreLights.push({ x: c.x, y: c.y, r: ((o.glow >> 16) & 255) / 255 * 0.7, g: ((o.glow >> 8) & 255) / 255 * 0.7, b: (o.glow & 255) / 255 * 0.7, radius: 3.2 });
      if (o.tags.includes('void')) this.oreLights.push({ x: c.x, y: c.y, r: 0.8, g: 0.8, b: 0.7, radius: 3.5, neg: true, noOcc: true });
      if (o.tags.includes('magnet')) this.magnets.push({ x: c.x, y: c.y });
      if (o.tags.includes('tarnish')) {
        d.q = Math.max(1, d.q - dt * 0.5);
        if (!this.flags.tarnish && Math.hypot(pl.x - c.x, pl.y - c.y) < 6) { this.flags.tarnishT = (this.flags.tarnishT || 0) + dt; if (this.flags.tarnishT > 6) { this.flags.tarnish = true; st.learn('tarnish'); this.say('tarnish', 'The moonsilver is dulling in the air...', 'warn', 30); } }
      }
      const x = Math.floor(c.x), y = Math.floor(c.y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
        const xx = x + dx, yy = y + dy;
        if (!w.inb(xx, yy)) continue;
        const j = w.idx(xx, yy);
        const wet = w.fluid[j] > 0.2 && w.ftype[j] === 1;
        if (o.tags.includes('hot')) {
          if (wet) { w.fluid[j] = Math.max(0, w.fluid[j] - dt * 0.6); if (chance(dt * 6)) this.fx.steam(xx + 0.5, yy + 0.5, 2); if (chance(dt)) this.audio.play('sizzle'); }
          const plant = this.plants.at(xx, yy);
          if (plant && chance(dt * 0.4)) this.ignite(xx, yy);
          if (w.block[j] === B.ROOTS && chance(dt * 0.3)) this.ignite(xx, yy);
          if (chance(dt * 0.6)) this.fx.ember(c.x, c.y - 0.2);
        }
        if (o.tags.includes('cold') && wet) { w.setBlock(xx, yy, B.ICE); w.fluid[j] = 0; w.ftype[j] = 0; this.fx.frost(xx, yy); this.audio.play('freeze'); st.learn('freezing'); }
        if (o.tags.includes('soluble') && wet) { d.q -= dt * 3; if (chance(dt * 3)) this.fx.bubbles(c.x, c.y); if (d.q <= 3) this.tools.destroyDeposit(d, 'dissolved'); }
        if (o.tags.includes('electric') && wet) this.electrify(xx, yy);
        if (o.tags.includes('flammable') && w.fire[j] > 0 && chance(dt * 0.5)) this.ignite(x, y);
      }
      if (o.tags.includes('electric') && chance(dt * 0.8)) this.fx.spark(c.x + rand(-0.4, 0.4), c.y + rand(-0.4, 0.4), [0.5, 0.95, 1]);
    }
  }

  electrify(x, y) {
    const w = this.world;
    const seen = new Set();
    const stack = [[x, y]];
    while (stack.length && seen.size < 60) {
      const [cx, cy] = stack.pop();
      if (!w.inb(cx, cy)) continue;
      const i = w.idx(cx, cy);
      if (seen.has(i) || w.fluid[i] < 0.2 || w.ftype[i] !== 1) continue;
      seen.add(i);
      w.flags[i] |= F.ELECTRIC;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }

  ignite(x, y) {
    const w = this.world;
    if (!w.inb(x, y)) return;
    const i = w.idx(x, y);
    if (w.fire[i] > 0) return;
    if (w.fluid[i] > 0.2 && w.ftype[i] === 1) return;
    w.fire[i] = rand(4, 7);
    this.fires.add(i);
    this.audio.play('ignite');
    this.state.learn('fire');
  }

  /** Fire finished with a cell: roots and boards burn away, nearby rock is blackened. */
  burnCell(x, y) {
    const w = this.world;
    w.ensureCells(x, y, x, y);
    for (let yy = y * M; yy < (y + 1) * M; yy++) for (let xx = x * M; xx < (x + 1) * M; xx++) {
      const m = w.pmat(xx, yy);
      if (m === B.ROOTS || m === B.BOARDS) w.clearPx(xx, yy);
      else if (m && m < ORE_BASE && chance(0.5)) { w.pd[yy * w.MW + xx] |= 128; w.touchPx(xx, yy); }
    }
    this.tools.after(x * M + 16, y * M + 16, 'fire', 24);
  }

  updateFire(dt) {
    const w = this.world, pl = this.player;
    this.fireLights = [];
    for (const i of [...this.fires]) {
      const x = i % w.W, y = Math.floor(i / w.W);
      if (w.fluid[i] > 0.2 && w.ftype[i] === 1) { w.fire[i] = 0; this.fires.delete(i); this.fx.steam(x + 0.5, y + 0.5, 6); this.audio.play('sizzle'); continue; }
      w.fire[i] -= dt;
      if (chance(dt * 6)) this.fx.ember(x + 0.5, y + 0.6);
      if (chance(dt * 4)) this.fx.smoke(x + 0.5, y + 0.2);
      const flick = 0.75 + Math.sin(this.time * 17 + i) * 0.15 + Math.random() * 0.1;
      if (this.fireLights.length < 20) this.fireLights.push({ x: x + 0.5, y: y + 0.5, r: 1.0 * flick, g: 0.5 * flick, b: 0.15 * flick, radius: 4 });
      if (chance(dt * 0.6)) {
        const [dx, dy] = pick([[1, 0], [-1, 0], [0, -1], [0, 1]]);
        const xx = x + dx, yy = y + dy;
        if (w.inb(xx, yy)) {
          const j = w.idx(xx, yy);
          const flam = this.plants.at(xx, yy) || w.block[j] === B.ROOTS || w.block[j] === B.BOARDS || w.hasFlag(xx, yy, F.BEAM);
          if (flam) this.ignite(xx, yy);
        }
      }
      if (Math.abs(pl.x - (x + 0.5)) < 0.7 && Math.abs(pl.y - (y + 0.5)) < 0.8 && !this.state.protects('heat') && chance(dt * 3)) this.burn(3, x, y);
      if (w.fire[i] <= 0) {
        w.fire[i] = 0;
        this.fires.delete(i);
        const plant = this.plants.at(x, y);
        if (plant) { this.plants.remove(plant); this.fx.burnAt(x + 0.5, y + 0.5); }
        if (w.block[i] === B.ROOTS || w.block[i] === B.BOARDS) { this.fx.burnAt(x + 0.5, y + 0.5); this.burnCell(x, y); }
        if (w.hasFlag(x, y, F.BEAM)) { w.setFlag(x, y, F.BEAM, false); this.stability.onOpened(x, y); this.say('beamburn', 'A support beam burned through!', 'bad'); }
      }
    }
    const keep = [];
    for (const e of this.embersFlying) {
      e.t += dt;
      e.vy += 14 * dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      this.fx.ember(e.x, e.y);
      if (Math.hypot(pl.x - e.x, pl.y - e.y) < 0.6) { this.burn(5, e.x, e.y); continue; }
      if (w.solidPt(e.x, e.y) || e.t > 3) {
        const plant = this.plants.at(Math.floor(e.x), Math.floor(e.y) - 1);
        if (plant) this.ignite(plant.x, plant.y);
        continue;
      }
      keep.push(e);
    }
    this.embersFlying = keep;
    const near = [...this.fires].some((i) => Math.hypot((i % w.W) - pl.x, Math.floor(i / w.W) - pl.y) < 8);
    if (near && !this.loops.fire) this.loops.fire = this.audio.loop('fire', { vol: 0.45 });
    if (!near && this.loops.fire) { this.loops.fire.stop(0.6); this.loops.fire = null; }
  }

  // ------------------------------------------------------------------ discovery scan
  scan() {
    const w = this.world, st = this.state, v = this.view;
    const cx = (v.x0 + v.x1) / 2, cy = (v.y0 + v.y1) / 2;
    for (const d of w.depositsNear(cx, cy, Math.max(v.x1 - v.x0, v.y1 - v.y0) / 2)) {
      if (d.done || d.seen || !d.visible) continue;
      const c = this.depCenter(d);
      if (this.lightAt(c.x, c.y) < 0.18) continue;
      d.seen = true;
      this.fx.sparkle(c.x, c.y, [1, 0.95, 0.75]);
      this.audio.play('sparkle', { gap: 0.25 });
      const it = ITEMS[d.item];
      st.discover(it.cat === 'gem' ? 'gem' : it.cat === 'plant' ? 'plant' : 'mineral', d.item);
      if (!this.flags.hiddenOre) { this.flags.hiddenOre = true; st.learn('hidden_ore'); }
    }
    for (const p of this.plants.map.values()) {
      if (p.x < v.x0 || p.x > v.x1 || p.y < v.y0 || p.y > v.y1 || p.seen) continue;
      if (this.lightAt(p.x + 0.5, p.y + 0.5) < 0.15) continue;
      p.seen = true;
      st.discover('plant', PLANT_ITEM[p.type]);
    }
  }

  // ------------------------------------------------------------------ lift
  nearestBell() {
    const w = this.world, pl = this.player;
    let best = null;
    for (const sy of w.stations) {
      const bx = w.shaftX + 0.5, by = sy === 3 ? 2 : sy - 0.4;
      const d = Math.hypot(pl.x - bx, pl.y - by);
      if (d < 1.9 && (!best || d < best.d)) best = { x: bx, y: by, sy, d };
    }
    return best;
  }

  openLift() {
    const g = this.game, st = this.state;
    this.audio.play('bell');
    const next = this.zone < MAX_ZONE && st.data.zoneMax > this.zone ? ZONES[this.zone + 1] : null;
    const body = el('div', { class: 'menu-list' }, [
      el('p', { class: 'muted', style: { margin: 0 }, html: `This trip: <b>${this.trip}</b> finds, worth about <b class="gold-txt">${formatGoldFull(this.tripValue)}g</b>.` }),
      el('button', { class: 'btn big', onclick: () => { h.close(); this.leave('town'); } }, 'Ride up to Deep Town'),
      next ? el('button', { class: 'btn alt', onclick: () => { h.close(); this.leave('mine', { zone: this.zone + 1 }); } }, `Go down to ${next.name}`) : null,
      el('button', { class: 'btn alt', onclick: () => h.close() }, 'Keep digging'),
    ]);
    const h = g.ui.openPanel({ title: 'Lift Bell', body });
  }

  async leave(to, params = {}) {
    if (this.leaving) return;
    this.leaving = true;
    this.face.exit('leave');
    if (to !== 'town' || !params.from) { this.audio.play('bell'); this.audio.play('gate'); this.state.learn('elevator'); }
    const pl = this.player;
    const s = this.screen(pl.x, pl.y, 0);
    const center = [s.x / window.innerWidth, 1 - s.y / window.innerHeight];
    await wait(500);
    if (this.trip) this.game.ui.toast(`Hauled up <b>${this.trip}</b> finds (≈${formatGoldFull(this.tripValue)}g)`, { kind: 'good', dur: 4000 });
    this.game.goto(to, { from: 'mine', ...params }, { transition: 'iris', center });
  }

  faint() {
    if (this.fainting || this.leaving) return;
    this.fainting = true;
    this.face.exit('faint');
    const st = this.state;
    this.audio.play('faint');
    this.player.rig.play('sleep');
    st.data.stats.faints++;
    st.learn('fainting');
    if (this.intro) {
      // nobody can carry you out yet: you doze, then drag yourself up again
      this.post.fade = 0;
      const t0 = performance.now();
      const fade = () => { if (this.game.scene !== this) return; const k = (performance.now() - t0) / 1000; this.post.fade = k < 1.2 ? k / 1.2 : k < 2.6 ? 1 : Math.max(0, 1 - (k - 2.6) / 1.2); if (k < 3.8) requestAnimationFrame(fade); else this.post.fade = 0; };
      fade();
      setTimeout(() => {
        if (this.game.scene !== this) return;
        st.data.energy = Math.max(40, Math.round(st.data.maxEnergy * 0.45));
        st.emit('energy', {});
        this.fainting = false;
        this.game.ui.toast('You doze off in the dark... and wake up groggy. Food would help.', { kind: 'warn', dur: 5000 });
      }, 2400);
      return;
    }
    let lost = 0;
    for (const t of this.tripItems) {
      if (!chance(0.4)) continue;
      if (t.uid) { if (st.removeLot(t.uid)) lost++; }
      else if (st.count(t.id) > 0) { st.removeItem(t.id, 1); lost++; }
    }
    setTimeout(() => {
      if (this.game.scene !== this) return;
      st.data.energy = Math.max(25, Math.round(st.data.maxEnergy * 0.3));
      st.emit('energy', {});
      this.game.ui.toast(`You fainted! Bramble hauled you home on the lift.${lost ? ` ${lost} finds were lost on the way.` : ''}`, { kind: 'bad', dur: 6000 });
      this.game.goto('home', { from: 'faint' }, { transition: 'fade', dur: 1 });
    }, 1800);
  }

  // ================================================================== frame
  updateView() {
    const cam = this.camera;
    const dist = Math.max(1, cam.position.z - 0.5 || this.camDist - 0.5);
    const halfH = Math.tan((cam.fov * Math.PI) / 360) * dist;
    const halfW = halfH * cam.aspect;
    const cx = cam.position.x || this.camX, cy = -(cam.position.y || -this.camY);
    this.view = {
      x0: Math.floor(cx - halfW) - 1, x1: Math.ceil(cx + halfW) + 1,
      y0: Math.floor(cy - halfH) - 2, y1: Math.ceil(cy + halfH) + 2,
      halfW, halfH,
    };
  }
  viewPx() {
    const v = this.view;
    return [v.x0 * M - 8, v.y0 * M - 8, (v.x1 + 1) * M + 8, (v.y1 + 1) * M + 8];
  }

  update(dt) {
    if (this.hitStop > 0) { this.hitStop -= dt; dt *= 0.08; }
    super.update(dt);
    const g = this.game, inp = g.input, st = this.state, w = this.world, pl = this.player;
    const U = this.renderer.U;
    U.time.value = this.time;
    this.post.flash = Math.max(0, (this.post.flash || 0) - dt * 2.5);
    if (this.bonkT > 0) this.bonkT -= dt;
    { const h = U.hit.value; h.w = Math.max(0, h.w - dt * 7); }
    if (this.kick) { const f = Math.max(0, 1 - dt * 18); this.kick.x *= f; this.kick.y *= f; this.kick.z *= f; }

    // ---- input
    const busy = this.fainting || this.leaving || (this.introCtl && this.introCtl.locked());
    if (!busy) {
      for (let k = 0; k < SLOTS.length; k++) if (inp.pressed('Digit' + (k + 1))) this.selectSlot(k);
      if (inp.mouse.wheel) this.selectSlot(this.slot + Math.sign(inp.mouse.wheel));
      if (inp.pressed('KeyQ')) { const f = this.bestFood(); if (f) { g.eat(f.id); this.updateHotbar(); this.face.impact('eat'); } else this.say('nofood', 'No snacks in your bag.', 'warn'); }
      if (inp.pressed('KeyE')) {
        const bell = !this.intro && this.nearestBell();
        if (bell) this.openLift();
        else if (this.introCtl && this.introCtl.interact()) { /* handled */ }
        else if (this.target) this.grab(this.target);
      }
    }

    // ---- first-person face mode decides whether the mole is walking or working
    this.face.update(dt);

    // ---- player
    const zippy = st.hasBuff('zippy');
    const frozen = busy || this.face.on;
    const pev = pl.update(dt, inp, { frozen, speed: zippy ? 1.25 : 1, jump: (st.hasBuff('bouncy') ? 1.3 : 1) * (st.equipped('boots')?.jump || 1), exhausted: st.energy < 8 });
    if (pev.jump) { this.audio.play('jump'); this.energy(0.25); }
    if (pev.landed) { this.audio.play('land', { hard: pev.landed > 9 }); this.fx.blockDust(pl.x, pl.feetY - 0.1, pl.groundBlock(), Math.min(8, pev.landed)); }
    if (pev.fallDamage) { this.hurt(Math.round(pev.fallDamage), 'fall'); this.say('fall', 'Oof! That was a long drop.', 'bad'); }
    if (pev.splash) { this.audio.play('splash'); this.fx.splash(pl.x, Math.floor(pl.y) + 1 - Math.min(1, w.fluid[w.idx(Math.floor(pl.x), Math.floor(pl.y))] || 0), 1.2); }
    if (pev.buried > 6) { this.fx.dust(pl.x, pl.y, 6, [0.8, 0.72, 0.6], 0.4); if (chance(0.2)) this.audio.play('trickle'); }
    if (pev.climbing) { this.energy(1.0 * dt); if (chance(dt * 6)) { this.audio.play('climb'); this.fx.blockDust(pl.x + pl.wall * 0.3, pl.y, B.DIRT, 1); } }
    if (pl.onGround && Math.abs(pl.vx) > 0.5) {
      this.stepT -= dt * Math.abs(pl.vx) / 3.5;
      if (this.stepT <= 0) {
        this.stepT = 0.32;
        const gb = MAT[pl.groundBlock()];
        const snd = gb?.snd;
        const mat = !snd ? 'dirt' : snd === 'stone' || snd === 'hard' || snd === 'crystal' || snd === 'ice' ? 'stone' : snd === 'sand' ? 'sand' : snd === 'wood' ? 'wood' : 'dirt';
        this.audio.play('step', { mat });
      }
    }
    if (pl.inWater && chance(dt * 1.5)) this.audio.play('swim');
    if (pl.inLava) { if (!st.protects('heat')) { st.useEnergy(18 * dt); pl.hurtT = 0.2; if (chance(dt * 4)) this.audio.play('sizzle'); this.say('lava', '<b>LAVA!</b> Get out!', 'bad', 2); } else st.useEnergy(3 * dt); for (let k = 0; k < 2; k++) this.fx.ember(pl.x, pl.y); }
    const ci = w.idx(clamp(Math.floor(pl.x), 0, w.W - 1), clamp(Math.floor(pl.y), 0, w.H - 1));
    if (pl.inWater && (w.flags[ci] & F.ELECTRIC) && chance(dt * 2)) this.zap(pl.x, pl.y, 3, 'The water is electrified!');
    if (this.zone === 4 || this.zone === 6) {
      if (!st.protects('heat')) {
        const k = st.hasBuff('cool') ? 0.45 : 1;
        st.useEnergy((this.zone === 6 ? 1.5 : 1.1) * k * dt);
        this.heatT = (this.heatT || 0) + dt;
        if (this.heatT > 4 && !this.flags.heat) { this.flags.heat = true; st.learn('heat_drain'); this.say('heat', 'The heat is sapping your energy...', 'warn', 30); }
      }
    }
    if (this.zone === 5 || this.zone === 6) {
      if (!st.protects('cold')) {
        const k = st.hasBuff('warm') ? 0.45 : 1;
        st.useEnergy((this.zone === 6 ? 0.8 : 1.1) * k * dt);
        this.coldT = (this.coldT || 0) + dt;
        if (this.coldT > 4 && !this.flags.cold) { this.flags.cold = true; st.learn('freezing'); this.say('cold2', 'Brrr. The cold bites through your fur.', 'warn', 30); }
      }
    }
    if (st.energy < 20 && !this.flags.lowEnergy) { this.flags.lowEnergy = true; st.learn('energy'); this.say('low', this.intro ? 'You\'re running low on energy. Something to eat would help.' : 'You\'re running low on energy. Eat something, or head home.', 'warn', 60); }

    // ---- targeting & tools
    this.target = this.computeTarget();
    this.useTools(dt);

    // ---- world systems
    this.fluidT += dt;
    let fluidChanged = false;
    while (this.fluidT > 1 / 20) {
      this.fluidT -= 1 / 20;
      this.fluidTick++;
      const v = this.view;
      stepFluids(w, v.x0 - 14, v.y0 - 14, v.x1 + 14, v.y1 + 10, (kind, x, y) => this.fluidEvent(kind, x, y), this.fluidTick % 3 === 0);
      fluidChanged = true;
    }
    this.sandT += dt;
    let sandSteps = 0;
    while (this.sandT > 1 / 90 && sandSteps < 3) { this.sandT -= 1 / 90; sandSteps++; if (this.sand.step() > 40 && chance(0.06)) this.audio.play('trickle', { vol: 0.5 }); }
    this.sandT = Math.min(this.sandT, 0.05);
    this.tools.updateIslands(dt);
    this.stability.update(dt);
    this.bodies.update(dt, pl);
    this.debris.update(dt);
    this.pickups.update(dt);
    this.plants.update(dt);
    this.creatures.update(dt);
    this.updateFire(dt);
    if (this.introCtl) this.introCtl.update(dt);
    this.oreT -= dt;
    if (this.oreT <= 0) { this.oreBehaviors(0.25); this.oreT = 0.25; }
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scan(); this.scanT = 0.5; }
    if (this.collapseT > 0) { this.collapseT -= dt; if (this.collapseT <= 0) { this.collapseCount = 0; this.caveInCounted = false; } }
    if (!this.intro && pl.y > w.H - 7 && !this.flags.bottom) {
      this.flags.bottom = true;
      if (this.zone < MAX_ZONE && st.data.zoneMax <= this.zone) {
        st.data.zoneMax = this.zone + 1;
        st.learn('elevator');
        this.audio.play('fanfare');
        g.ui.toast(`<b>New lift stop!</b> The lift can now take you down to <b>${ZONES[this.zone + 1].name}</b>.`, { kind: 'good', dur: 6000 });
        st.save();
      } else if (this.zone === MAX_ZONE && !st.flag('coreBottom')) {
        st.flag('coreBottom', true);
        g.ui.toast('You\'ve reached the very heart of the world. It hums.', { kind: 'good', dur: 6000 });
      }
    }
    const lavaNear = this.lavaNear;
    if (lavaNear && !this.loops.lava) this.loops.lava = this.audio.loop('lava', { vol: 0.35 });
    if (!lavaNear && this.loops.lava) { this.loops.lava.stop(0.8); this.loops.lava = null; }
    if (chance(dt * 0.25)) this.audio.play('drip', { vol: 0.5 });
    if (chance(dt * 9)) {
      const R = st.lightRadius() * 0.8;
      const mx = pl.x + rand(-R, R), my = pl.y + rand(-R, R);
      if (!w.solidPt(mx, my)) this.fx.mote(mx, my);
    }
    if ((this.zone === 2 || this.zone === 5 || this.zone === 3 || this.zone === 0) && chance(dt * 1.2)) {
      const dx = pl.x + rand(-8, 8), dy = pl.y + rand(-5, 3);
      if (w.solidPt(dx, dy - 0.1) && !w.solidPt(dx, dy + 0.1)) this.fx.drip(dx, dy + 0.1);
    }

    // ---- camera (face mode drives its own)
    if (this.face.on || this.face.blend > 0) this.face.camera(dt);
    else this.sideCamera(dt);
    this.updateView();
    const v = this.view;

    // ---- pixels: generate ahead of the camera, refresh what changed
    {
      const [a, b, c, d] = this.viewPx();
      this.gen.pump(a - CPX, b - CPX, c + CPX, d + CPX, 2);
    }
    this.renderer.terrain.update(...this.viewPx(), 8);

    // ---- lighting
    this.lighting.compute(this.staticLights(), this.dynamicLights(dt), v.x0 - 6, v.y0 - 6, v.x1 + 6, v.y1 + 6, this.staticDirty);
    this.staticDirty = false;

    // ---- render data
    const t = this.target;
    const showMarker = t && !t.far && t.solid && ['pick', 'chisel', 'brush', 'drill'].includes(this.slotName) && !this.fainting;
    this.renderer.setMarker(showMarker ? t.px : null, showMarker ? t.py : null, showMarker && t.ok);
    if (fluidChanged) this.renderer.updateFluids(v.x0, v.y0, v.x1, v.y1);
    this.renderSprites();
    const pxScale = (g.engine.height / 2) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.renderer.dust.uPx.value = pxScale;
    this.renderer.glow.uPx.value = pxScale;
    this.renderer.dust.update(dt, (q) => {
      if (w.solidPt(q.x, -q.y)) { if (q.vy < -2 && chance(0.3)) this.audio.play('drip', { vol: 0.3 }); q.life = Math.min(q.life, q.t + 0.15); q.vx = q.vy = 0; q.grav = 0; return false; }
      return false;
    });
    this.renderer.glow.update(dt);
    const L = this.lighting.sample(pl.x, pl.y - 0.2);
    pl.updateVisual(dt, L, U.ambient.value, t ? t.mx - pl.x : pl.facing);
    pl.rig.root.visible = !this.face.hidesPlayer();

    // ---- HUD
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.15;
      const depth = w.depthMeters(pl.y, this.zdef);
      const cap = st.bagCapacity();
      g.ui.setDepth(`<b>${Math.floor(depth)} m</b><br>${this.zdef.name}<br>Bag ${this.trip}/${cap}`);
      const bell = !this.intro && this.nearestBell();
      const ip = this.introCtl ? this.introCtl.prompt() : null;
      g.ui.setPrompt(bell && !this.leaving ? '<kbd>E</kbd> Ring the lift bell' : ip);
      if (this.slotName === 'drill') g.ui.setHotbarMeter(3, this.drillHeat);
      this.updateTooltip();
    }
  }

  sideCamera(dt) {
    const pl = this.player, w = this.world;
    const lookAhead = pl.facing * 0.8;
    const tx = pl.x + lookAhead, ty = pl.y - 0.4;
    this.camX += (tx - this.camX) * Math.min(1, dt * 5);
    this.camY += (ty - this.camY) * Math.min(1, dt * 6);
    const halfH = Math.tan((this.camera.fov * Math.PI) / 360) * (this.camDist - 0.5);
    const halfW = halfH * this.camera.aspect;
    if (this.overview) { this.camX = w.W / 2; this.camY = w.H / 2; }
    else {
      this.camX = clamp(this.camX, halfW + 0.5, w.W - halfW - 0.5);
      this.camY = clamp(this.camY, halfH - 0.8, w.H - halfH);
    }
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.2);
    const sh = this.shakeAmp;
    this.camera.fov = 36;
    this.camera.updateProjectionMatrix();
    const kx = this.kick ? this.kick.x : 0, ky = this.kick ? this.kick.y : 0;
    this.camera.position.set(this.camX + kx + (Math.random() - 0.5) * sh, -this.camY + 2.2 + ky + (Math.random() - 0.5) * sh, this.camDist);
    this.camera.lookAt(this.camX + kx + (Math.random() - 0.5) * sh * 0.3, -this.camY - 0.15 + ky, 0);
    this.renderer.terrain.shared.uFlat.value = 0;
  }

  fluidEvent(kind, x, y) {
    const w = this.world;
    if (kind === 'obsidian') { w.setBlock(x, y, B.OBSIDIAN); this.state.learn('obsidian'); }
    this.fx.steam(x + 0.5, y + 0.5, 10);
    if (Math.hypot(this.player.x - x, this.player.y - y) < 12) this.audio.play('steam');
  }

  staticLights() {
    const w = this.world, v = this.view;
    const out = [];
    this.plants.lights(out, v);
    if (this.oreLights) out.push(...this.oreLights);
    if (this.introCtl) this.introCtl.lights(out);
    let lava = 0;
    this.lavaNear = false;
    const pl = this.player;
    for (let y = Math.max(0, v.y0 - 4); y <= Math.min(w.H - 1, v.y1 + 4); y++)
      for (let x = Math.max(0, v.x0 - 4); x <= Math.min(w.W - 1, v.x1 + 4); x++) {
        const i = w.idx(x, y);
        if (w.flags[i] & F.STAKE) out.push({ x: x + 0.5, y: y + 0.5, r: 0.55, g: 1.0, b: 0.6, radius: 5.5, pierce: 0 });
        if (w.ftype[i] === 2 && w.fluid[i] > 0.3 && (x + y) % 2 === 0 && lava < 70) {
          out.push({ x: x + 0.5, y: y + 0.5, r: 1.0, g: 0.42, b: 0.1, radius: 3.4, pierce: 0 });
          lava++;
          if (Math.abs(x - pl.x) < 8 && Math.abs(y - pl.y) < 6) this.lavaNear = true;
        }
      }
    if (!this.intro) for (const sy of w.stations) out.push({ x: w.shaftX + 0.5, y: sy === 3 ? 2 : sy - 0.4, r: 1.0, g: 0.72, b: 0.38, radius: 3.6, pierce: 0 });
    return out;
  }

  dynamicLights(dt) {
    const st = this.state, pl = this.player;
    const out = [];
    const lp = pl.lampPos();
    const R = st.lightRadius() * (this.introCtl ? this.introCtl.lampScale() : 1);
    out.push({ x: lp.x, y: lp.y, r: 1.15, g: 0.98, b: 0.74, radius: R, pierce: 1, near: 1.6 });
    if (this.face.on) { const f = this.face.focus; out.push({ x: f.x, y: f.y, r: 0.55, g: 0.48, b: 0.38, radius: 2.6, noOcc: true }); }
    if (this.xrayOn) {
      const v = this.renderer.U.xray.value;
      for (let k = 1; k <= 3; k++) out.push({ x: v.x + Math.cos(v.z) * k * 1.6, y: -(v.y + Math.sin(v.z) * k * 1.6), r: 0.2, g: 0.55, b: 0.65, radius: 2.4, noOcc: true });
    }
    if (this.fireLights) out.push(...this.fireLights);
    this.fx.lights(out, dt);
    this.creatures.lights(out);
    this.pickups.lights(out);
    if (st.hasBuff('glow')) out.push({ x: pl.x, y: pl.y, r: 0.2, g: 0.45, b: 0.8, radius: 3, noOcc: true });
    if (st.hasBuff('sense')) {
      const t = this.nearestHiddenDeposit(pl.x, pl.y, 6);
      if (t && chance(dt * 4)) this.fx.glints(t.x - 0.5, t.y - 0.5);
    }
    return out;
  }

  renderSprites() {
    const r = this.renderer, A = r.spriteAtlas, w = this.world, v = this.view;
    const sb = r.sprites, gb = r.glowSprites;
    sb.begin();
    gb.begin();
    this.plants.render(sb, A, v);
    this.creatures.render(sb, gb, A, v, this.time);
    this.pickups.render(sb, gb, A, this.time);
    for (let y = Math.max(0, v.y0); y <= Math.min(w.H - 1, v.y1); y++)
      for (let x = Math.max(0, v.x0); x <= Math.min(w.W - 1, v.x1); x++) {
        const i = w.idx(x, y);
        const f = w.flags[i];
        if (f & F.BEAM) sb.add(x + 0.5, -y - 1, 1, 1, A.uv(A.misc.beam), { anchor: 'bottom', z: 0.2 });
        if (f & F.STAKE) sb.add(x + 0.5, -y - 1, 0.8, 0.8, A.uv(A.misc.stake), { anchor: 'bottom', z: 0.15 });
        if (f & F.WEB) sb.add(x + 0.5, -y - 0.5, 1, 1, A.uv(A.plants.web[0]), { z: 0.3, tint: [1, 1, 1, 0.85] });
        if (w.fire[i] > 0) gb.add(x + 0.5, -y - 1, 1, 1.1, A.uv(A.misc['fire' + (Math.floor(this.time * 10 + i) % 3)]), { anchor: 'bottom', z: 0.35, lit: 0 });
        if ((f & F.ELECTRIC) && w.fluid[i] > 0.2 && chance(0.05)) this.fx.spark(x + Math.random(), y + Math.random(), [0.6, 0.95, 1]);
      }
    if (!this.intro) {
      for (const sy of w.stations) {
        const bx = w.shaftX + 0.5, by = sy === 3 ? 2 : sy - 0.4;
        if (by < v.y0 - 2 || by > v.y1 + 2) continue;
        const swing = Math.sin(this.time * 2 + sy) * 0.08;
        sb.add(bx, -by + 0.35, 0.7, 0.7, A.uv(A.misc.bell), { anchor: 'top', z: 0.25, rot: swing });
      }
      if (v.y0 < 6) {
        this.cageY = lerp(this.cageY, this.leaving ? -6 : 2.3, 0.04);
        sb.add(w.shaftX + 0.5, -this.cageY - 0.5, 1.9, 1.9, A.uv(A.misc.lift), { anchor: 'center', z: -0.2 });
      }
      const last = w.stations[w.stations.length - 1];
      if (this.zone < MAX_ZONE && last > v.y0 - 2 && last < v.y1 + 2) sb.add(w.shaftX + 1.6, -last - 1, 0.7, 0.7, A.uv(A.misc.sign), { anchor: 'bottom', z: 0.2 });
    }
    if (this.introCtl) this.introCtl.render(sb, gb, A);
    sb.end();
    gb.end();
  }

  updateTooltip() {
    const t = this.target;
    const tip = this.tooltip;
    const w = this.world;
    if (!t || t.far || this.game.ui.isPanelOpen() || this.game.touch || this.face.on) { tip.style.opacity = 0; return; }
    let html = '';
    if (t.solid) {
      const d = t.ore ? w.depositAt(t.px, t.py) : null;
      if (d && (d.visible || d.revealed)) {
        const q = Math.round(d.q);
        html = `<b>${ITEMS[d.item].name}</b> <span style="color:${qColor(q)};font-weight:700">${q}%</span>`;
        const e = d.exp ?? 0;
        html += e > 0.38 ? ' <span style="color:#2a9a3a">· loose</span>' : ` <span style="opacity:.7">· ${Math.round(e * 100)}% free</span>`;
      } else {
        // hidden deposits (and their stained halo) read as the plain host rock
        const sd = !d && isStain(t.mat) ? w.depositAt(t.px, t.py) : null;
        const hd = d || (sd && !sd.visible && !sd.revealed ? sd : null);
        const mt = MAT[hd ? (hd.host[(t.py - hd.y0) * hd.w + (t.px - hd.x0)] || B.STONE) : t.mat];
        if (mt && mt.name) html = `<b>${mt.name}</b>`;
        const pickTier = this.state.equipped('pick')?.tier ?? 1;
        if (mt && mt.tier > pickTier) html += '<br><span style="color:#c0402a">too hard</span>';
      }
    } else {
      const plant = this.plants.at(t.cx, t.cy);
      if (plant) html = `<b>${this.state.known('plant', PLANT_ITEM[plant.type]) ? ITEMS[PLANT_ITEM[plant.type]].name : '???'}</b>`;
      else if (w.hasFlag(t.cx, t.cy, F.BEAM)) html = '<b>Support beam</b>';
      else if (w.hasFlag(t.cx, t.cy, F.WEB)) html = '<b>Sticky web</b>';
    }
    if (!html) { tip.style.opacity = 0; return; }
    tip.innerHTML = html;
    const m = this.game.input.mouse;
    tip.style.left = m.x + 'px';
    tip.style.top = m.y + 'px';
    tip.style.opacity = 0.92;
  }

  onResize(wd, ht) {
    super.onResize(wd, ht);
    if (this.face) this.face.resize();
  }

  exit() {
    for (const k of Object.keys(this.loops)) if (this.loops[k]) this.loops[k].stop(0.1);
    if (this.face) this.face.dispose();
    if (this.introCtl) this.introCtl.dispose();
    this.bodies.dispose();
    this.renderer.dispose();
    super.exit();
  }
}

export { CPX, BLOCKS, isGranular, P_W, P_H };
