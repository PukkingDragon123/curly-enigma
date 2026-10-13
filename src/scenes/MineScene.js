// The mine: a side-on slice of 3D voxel rock you dig through with physical, careful tools.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { clamp, rand, chance, pick, wait, el, formatGoldFull, lerp } from '../core/util.js';
import { B, BLOCKS, ORES, ORE_ID, isSolid, isGranular } from '../mine/blocks.js';
import { F, CHUNK } from '../mine/MineWorld.js';
import { generateMine } from '../mine/MineGen.js';
import { stepFluids } from '../mine/Fluids.js';
import { Lighting } from '../mine/Lighting.js';
import { MineRenderer } from '../mine/Render.js';
import { Player, P_W, P_H } from '../mine/Player.js';
import { Debris, Fallers, Stability } from '../mine/Physics.js';
import { Pickups, Plants, Creatures, PLANT_ITEM } from '../mine/Entities.js';
import { FX } from '../mine/FX.js';
import { ITEMS, sellPrice } from '../data/items.js';
import { ZONES, MAX_ZONE } from '../data/zones.js';
import { iconURL, specURL } from '../gfx/PixelArt.js';
import { qColor } from '../ui/UI.js';

const AMBIENT = [null, [0.1, 0.088, 0.08], [0.1, 0.082, 0.074], [0.075, 0.08, 0.105], [0.105, 0.066, 0.052], [0.075, 0.092, 0.11], [0.08, 0.06, 0.105]];
const SLOTS = ['pick', 'chisel', 'brush', 'drill', 'xray', 'beam', 'stake', 'food'];
const FOOD_PRIORITY = (it) => (it.energy || it.food || 0);
const REACH = 2.45;

export default class MineScene extends Scene {
  async enter(params) {
    const g = this.game, st = g.state;
    this.hud = 'mine';
    this.music = 'mine';
    let zone = clamp(parseInt(params.zone, 10) || 1, 1, MAX_ZONE);
    if (zone > st.data.zoneMax) zone = st.data.zoneMax;
    this.zone = zone;
    this.zdef = ZONES[zone];
    this.musicParams = { depth: (zone - 1) / 5 };
    this.audio = g.audio;
    this.state = st;
    this.flags = {};
    const done = g.showLoading('Digging...');
    await wait(40);
    const seed = params.seed ? parseInt(params.seed, 10) : ((Date.now() ^ (zone * 7919)) >>> 0);
    const gen = generateMine(zone, seed);
    this.world = gen.world;
    const w = this.world;
    this.lighting = new Lighting(w);
    this.renderer = new MineRenderer(this.scene, w, this.lighting);
    const amb = AMBIENT[zone];
    this.renderer.U.ambient.value.setRGB(amb[0], amb[1], amb[2]);
    this.player = new Player(this.scene, w, st);
    this.debris = new Debris(this.renderer.debris, w);
    this.debris.tick = () => { if (chance(0.5)) this.audio.play('debris', { vol: 0.6 }); };
    this.fx = new FX(this);
    this.fallers = new Fallers(this.renderer.fallers, w, this.renderer, {
      start: (f) => { this.audio.play('trickle'); },
      land: (f, x, y) => this.fallerLanded(f, x, y),
      hitPlayer: (f) => this.fallerHitPlayer(f),
    });
    this.stability = new Stability(w, {
      warnStart: (x, y) => { this.damaged.add(w.idx(x, y)); if (chance(0.5)) this.audio.play('creak'); },
      warn: (x, y, t) => { if (chance(0.25)) this.fx.trickle(x, y); this.renderer.setHit(this.hitSlot++, x, y, this.time, 0.4); },
      collapse: (x, y, granular) => this.collapse(x, y, granular),
    });
    this.pickups = new Pickups(this);
    this.plants = new Plants(this, gen.plants);
    this.creatures = new Creatures(this, gen.creatures);
    this.damaged = new Set();
    this.hitSlot = 0;
    this.magnets = [];
    this.fires = new Set();
    this.embersFlying = [];
    w.onChange((x, y, was, now) => {
      if (isSolid(was) && !isSolid(now)) this.stability.onOpened(x, y);
      this.staticDirty = true;
    });
    this.staticDirty = true;

    // camera
    this.camera = new THREE.PerspectiveCamera(36, g.engine.aspect, 1, 260);
    this.camDist = params.overview ? 150 : 16;
    if (params.overview) { this.renderer.U.ambient.value.setRGB(0.55, 0.55, 0.55); for (let i = 0; i < w.W * w.H; i++) if (w.ore[i]) w.flags[i] |= F.REVEALED; this.overview = true; }
    this.camX = this.player.x;
    this.camY = this.player.y;
    this.shakeAmp = 0;
    this.post = { vignette: 0.6, levels: 26, dither: 1, saturation: 1.12, contrast: 1.06, outline: true, outlineColor: 0x0a0608, innerThresh: 0.4 };
    this.scene.background = new THREE.Color(0x000000);

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
    this.toastCd = {};
    this.fainting = false;
    this.leaving = false;
    this.arriveT = 1.2;
    this.loops = {};
    this.cageY = -2;
    st.data.stats.trips++;
    st.data.deepest = Math.max(st.data.deepest || 0, this.zdef.depth[0]);

    this.own(st.on('exhausted', () => this.faint()));
    this.tooltip = el('div', { class: 'bubble', style: { pointerEvents: 'none', transform: 'translate(12px, 12px)', fontSize: '.7em', opacity: 0, transition: 'none', textAlign: 'left' } });
    g.ui.world.append(this.tooltip);
    g.ui.setHints(st.data.stats.trips <= 2 ? '<kbd>A</kbd><kbd>D</kbd> move · <kbd>W</kbd>/<kbd>Space</kbd> jump &amp; climb walls · <kbd>Mouse</kbd> dig · <kbd>Right</kbd> grab · <kbd>1</kbd>–<kbd>8</kbd> tools · <kbd>E</kbd> interact · <kbd>Q</kbd> snack' : null);
    if (st.data.stats.trips <= 2) setTimeout(() => { if (this.game.scene === this) g.ui.setHints(null); }, 40000);

    // initial chunks
    this.updateView();
    this.renderer.updateChunks(this.view.cx0, this.view.cy0, this.view.cx1, this.view.cy1, 999);
    done();
    this.audio.play('bell');
    setTimeout(() => { if (this.game.scene === this) g.ui.toast(`<b>${this.zdef.name}</b> · ${Math.round(this.zdef.depth[0])}–${this.zdef.depth[1]} m`, { dur: 3500 }); }, 300);
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
    if (p.visible) this.game.ui.floatText(text, p.x, p.y, color, size);
  }
  shake(a) { if (this.state.data.settings.shake) this.shakeAmp = Math.max(this.shakeAmp, a); }
  energy(n) {
    const st = this.state;
    if (st.hasBuff('sturdy')) n *= 0.6;
    if (n > 0) st.useEnergy(n);
  }
  hurt(n, kind) {
    const pl = this.player;
    this.state.useEnergy(n);
    pl.hurtT = 0.45;
    this.audio.play('hurt');
    this.float(`-${Math.round(n)}`, pl.x, pl.y - 0.8, '#ff7a6a');
    this.shake(0.12);
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

  nearestHiddenOre(x, y, r) {
    const w = this.world;
    let best = null, bd = Infinity;
    for (let yy = Math.max(1, y - r); yy <= Math.min(w.H - 2, y + r); yy++)
      for (let xx = Math.max(1, x - r); xx <= Math.min(w.W - 2, x + r); xx++) {
        const i = w.idx(xx, yy);
        if (!w.ore[i] || w.oreVisible(xx, yy)) continue;
        const d = (xx - x) ** 2 + (yy - y) ** 2;
        if (d < bd) { bd = d; best = { x: xx, y: yy }; }
      }
    return best;
  }
  nearestVisibleOre(x, y, r) {
    const w = this.world;
    let best = null, bd = Infinity;
    const cx = Math.floor(x), cy = Math.floor(y);
    for (let yy = Math.max(1, cy - r); yy <= Math.min(w.H - 2, cy + r); yy++)
      for (let xx = Math.max(1, cx - r); xx <= Math.min(w.W - 2, cx + r); xx++) {
        const i = w.idx(xx, yy);
        if (!w.ore[i] || !w.exposed(xx, yy)) continue;
        const d = (xx - cx) ** 2 + (yy - cy) ** 2;
        if (d < bd) { bd = d; best = { x: xx, y: yy }; }
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
    const it = st.equipped(slot);
    return it;
  }
  bestFood() {
    const st = this.state;
    let best = null;
    for (const g of st.inventory((it) => it && (it.cat === 'food' || it.food))) {
      const it = ITEMS[g.id];
      if (!best || FOOD_PRIORITY(it) > FOOD_PRIORITY(best)) best = it;
    }
    return best;
  }
  updateHotbar(force) {
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
    if (this.slot === i) return;
    this.slot = (i + SLOTS.length) % SLOTS.length;
    this.audio.play('ui_click', { pitch: 1.3 });
    this.updateHotbar();
  }

  /** Find the cell the tool would hit: first solid cell along the player→mouse ray within reach. */
  computeTarget() {
    const pl = this.player;
    const m = this.mouseGrid();
    if (!m) return null;
    const ox = pl.x, oy = pl.y - 0.1;
    let dx = m.x - ox, dy = m.y - oy;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.0001) return null;
    dx /= dist; dy /= dist;
    const maxD = Math.min(dist, REACH);
    const w = this.world;
    // march in small steps (good enough & robust)
    for (let t = 0.2; t <= maxD + 0.05; t += 0.08) {
      const x = Math.floor(ox + dx * t), y = Math.floor(oy + dy * t);
      if (w.solid(x, y)) {
        const b = w.get(x, y);
        return { x, y, solid: true, ok: isFinite(BLOCKS[b].hp), mx: m.x, my: m.y };
      }
    }
    const cx = Math.floor(m.x), cy = Math.floor(m.y);
    if (dist <= REACH + 0.5) return { x: cx, y: cy, solid: false, ok: true, mx: m.x, my: m.y };
    return { x: cx, y: cy, solid: false, ok: false, far: true, mx: m.x, my: m.y };
  }
  mouseGrid() {
    const mouse = this.game.input.mouse;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(mouse.nx, mouse.ny), this.camera);
    const t = (0.5 - ray.ray.origin.z) / ray.ray.direction.z;
    if (!(t > 0)) return null;
    const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    return { x: p.x, y: -p.y };
  }

  useTools(dt) {
    const g = this.game, inp = g.input, st = this.state, pl = this.player;
    const slotName = SLOTS[this.slot];
    const tool = this.toolItem(slotName);
    const target = this.target;
    const lmb = inp.mouseDown(0) && !this.fainting && !this.leaving;
    pl.action = null;
    this.xrayOn = false;

    // held model
    const heldMap = { pick: 'pick', chisel: 'chisel', brush: 'brush', drill: 'drill', xray: 'xray' };
    pl.hold(tool && heldMap[slotName] ? heldMap[slotName] : null);

    // continuous swing animation
    if (this.swing) {
      this.swing.t += dt;
      pl.rig.swingPhase = clamp(this.swing.t / this.swing.dur, 0, 1);
      pl.action = 'swing';
      if (!this.swing.done && this.swing.t >= this.swing.dur * 0.5) {
        this.swing.done = true;
        const tg = this.computeTarget() || this.swing.target;
        this.applyHit(tg, 'pick', this.swing.tool);
      }
      if (this.swing.t >= this.swing.dur) this.swing = null;
    }
    this.toolCd -= dt;
    if (this.overheat > 0) { this.overheat -= dt; this.drillHeat = Math.max(0, this.drillHeat - dt * 0.4); if (chance(dt * 8)) this.fx.steam(pl.x + pl.facing * 0.5, pl.y, 1); }
    let drilling = false;
    if (lmb && tool && target) {
      const zippy = st.hasBuff('zippy') ? 0.75 : 1;
      switch (slotName) {
        case 'pick':
          if (!this.swing && this.toolCd <= 0) {
            const rate = (tool.rate || 0.36) * zippy;
            this.swing = { t: 0, dur: rate, done: false, target, tool };
            this.toolCd = rate;
            this.audio.play('whoosh', { gap: 0 });
          }
          break;
        case 'chisel':
          pl.action = 'chisel';
          if (this.toolCd <= 0) { this.toolCd = (tool.rate || 0.2) * zippy; this.applyHit(target, 'chisel', tool); }
          break;
        case 'brush':
          pl.action = 'brush';
          if (this.toolCd <= 0) { this.toolCd = (tool.rate || 0.12) * zippy; this.applyBrush(target, tool); }
          break;
        case 'drill':
          if (this.overheat > 0) { this.say('hot', 'The drill is too hot. Let it cool!', 'warn', 2); break; }
          pl.action = 'drill';
          drilling = true;
          this.applyDrill(target, tool, dt);
          break;
        case 'xray':
          pl.action = 'xray';
          this.xrayOn = true;
          this.energy(0.7 * dt);
          break;
        case 'beam':
          if (inp.mousePressed(0)) this.placeBeam(target);
          break;
        case 'stake':
          if (inp.mousePressed(0)) this.placeStake(target);
          break;
        case 'food':
          if (inp.mousePressed(0) && tool) this.game.eat(tool.id), this.updateHotbar();
          break;
      }
    }
    // drill heat & sound
    const dtool = st.equipped('drill');
    if (drilling && dtool) {
      const slime = st.count('slug_slime') > 0;
      this.drillHeat += dt * dtool.heatRate * (slime ? 0.6 : 1);
      this.drillTime += dt;
      if (slime && this.drillTime > 15) { this.drillTime = 0; st.removeItem('slug_slime', 1); }
      if (this.drillHeat >= 1) { this.overheat = 2.6; this.audio.play('overheat'); st.learn('overheating'); this.say('overheat', 'Drill overheated!', 'bad', 2); }
      if (!this.loops.drill) { this.loops.drill = this.audio.loop('drill', { vol: 0.5 }); this.audio.play('drill_start'); }
      this.loops.drill.set({ load: target && target.solid ? 1 : 0.2 });
    } else {
      this.drillHeat = Math.max(0, this.drillHeat - dt * 0.22);
      if (this.loops.drill) { this.loops.drill.stop(); this.loops.drill = null; }
    }
    // x-ray beam
    const U = this.renderer.U;
    if (this.xrayOn) {
      const xt = st.equipped('xray');
      const head = { x: pl.x, y: pl.y - 0.25 };
      const m = this.target ? { x: this.target.mx, y: this.target.my } : { x: head.x + pl.facing, y: head.y };
      const ang = Math.atan2(-(m.y - head.y), m.x - head.x);
      U.xray.value.set(head.x, -head.y, ang, xt.radius);
      U.xrayOn.value = 1;
      this.revealCone(head, ang, xt.radius);
      if (!this.loops.xray) { this.loops.xray = this.audio.loop('xray', { vol: 0.4 }); this.audio.play('xray_on'); }
    } else {
      U.xrayOn.value = 0;
      if (this.loops.xray) { this.loops.xray.stop(); this.loops.xray = null; }
    }
    // right click / E: gentle grab
    if ((inp.mousePressed(2)) && target && !this.fainting) this.grab(target);
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
    const w = this.world, st = this.state;
    const x0 = Math.floor(head.x - R), x1 = Math.ceil(head.x + R), y0 = Math.floor(head.y - R), y1 = Math.ceil(head.y + R);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!w.inb(x, y)) continue;
        const i = w.idx(x, y);
        if (!w.ore[i] || (w.flags[i] & F.REVEALED)) continue;
        if (!this.inXray(x + 0.5, y + 0.5)) continue;
        const o = ORES[w.ore[i]];
        if (o.tags.includes('void')) continue; // voidstone hides from x-rays
        w.flags[i] |= F.REVEALED;
        w.markDirty(x, y);
        this.fx.sparkle(x + 0.5, y + 0.5, [0.5, 0.95, 1]);
        if (!this.flags.xray) { this.flags.xray = true; st.learn('x_ray'); }
        this.audio.play('glow', { gap: 0.15 });
      }
  }

  // ------------------------------------------------------------------ hits
  /** Pick or chisel strike on a target. */
  applyHit(target, kind, tool) {
    if (!target || !target.ok || target.far) return;
    const w = this.world, st = this.state, pl = this.player;
    const { x, y } = target;
    if (!target.solid || !w.solid(x, y)) { this.hitOpenCell(target, kind); return; }
    const i = w.idx(x, y);
    const b = BLOCKS[w.block[i]];
    const pick = st.equipped('pick');
    const tier = pick?.tier ?? 1;
    const power = kind === 'chisel' ? (tool.power || 0.55) : (tool.power || 1);
    const cx = x + 0.5, cy = y + 0.5;
    const dir = [clamp((pl.x - cx) * 0.4, -0.6, 0.6), 0.35];
    const ore = w.ore[i] ? ORES[w.ore[i]] : null;
    const needTier = Math.max(b.tier, ore ? ore.tier || 0 : 0);
    if (!isFinite(b.hp) || needTier > tier) {
      this.audio.play('hit', { snd: 'hard', vol: 0.8 });
      this.fx.sparks(cx + dir[0] * 0.6, cy, 6, [1, 0.85, 0.5], 4);
      this.renderer.setHit(this.hitSlot++, x, y, this.time, 0.35);
      this.float(isFinite(b.hp) ? 'Too hard!' : 'Solid bedrock', cx, cy - 0.5, '#ffd0a0', 0.9);
      if (isFinite(b.hp)) st.learn('too_hard');
      this.energy(0.15);
      return;
    }
    // explosive ore struck hard
    if (ore && kind !== 'chisel' && ore.tags.includes('explosive') && chance(0.35)) { this.explode(x, y); return; }
    if (ore && kind !== 'chisel' && ore.tags.includes('electric') && Math.hypot(pl.x - cx, pl.y - cy) < 1.8) this.zap(cx, cy, 5, 'Bioxide crackles up your pickaxe!');
    // direct ore damage
    if (ore && kind === 'pick') {
      const dmg = ore.frag * Math.sqrt(power) * rand(0.8, 1.2) * (st.hasBuff('lucky') ? 0.7 : 1);
      if (dmg > 0) {
        w.oreQ[i] = Math.max(0, w.oreQ[i] - dmg);
        this.float(`-${Math.round(dmg)}%`, cx, cy - 0.3, '#ff6a5a', 0.95);
        this.audio.play('ore_damage');
        if (w.oreVisible(x, y)) st.learn('chipped_ore');
        if (ore.tags.includes('resonant')) this.resonate(x, y, 2);
        if (w.oreQ[i] <= 0) this.destroyOre(x, y, 'shattered');
      } else if (ore.item === 'diamond') this.say('diamond', 'Diamond doesn\'t chip. Its rock does.', 'good', 10);
    }
    if (kind === 'pick') this.vibrate(x, y, 1, power);
    // damage the block
    w.hp[i] -= power;
    this.damaged.add(i);
    this.renderer.setHit(this.hitSlot++, x, y, this.time, kind === 'chisel' ? 0.4 : 1);
    // feedback
    const snd = ore && kind === 'chisel' ? 'chisel' : null;
    if (kind === 'chisel') { this.audio.play('chisel'); this.fx.sparks(cx + dir[0] * 0.5, cy, 2, [1, 1, 0.8], 2); }
    else this.audio.play('hit', { snd: b.snd });
    const chipColors = b.debris || [b.color];
    this.debris.burst(cx + dir[0] * 0.5, -cy, kind === 'chisel' ? 2 : 4, chipColors, { speed: kind === 'chisel' ? 2 : 3.5, dir, size: [0.05, 0.12], bounce: b.bounce ?? 0.3, z: 0.45 });
    this.fx.blockDust(cx + dir[0] * 0.5, cy, b.id, kind === 'chisel' ? 2 : 4);
    if (kind === 'pick' && b.tier >= 2) this.fx.sparks(cx + dir[0] * 0.5, cy, 4, [1, 0.8, 0.4], 4);
    if (kind === 'pick') this.shake(0.035);
    if (b.quake && kind === 'pick' && chance(0.4)) this.quake(x, y);
    if (b.id === B.ROOTS) this.fx.leaves(cx, cy, 'fern');
    this.energy(kind === 'chisel' ? 0.18 : 0.32);
    if (!this.flags.digging) { this.flags.digging = true; st.learn('digging'); }
    if (w.hp[i] <= 0) this.breakBlock(x, y, kind);
  }

  applyDrill(target, tool, dt) {
    if (!target || !target.ok || target.far) return;
    const w = this.world, st = this.state, pl = this.player;
    const { x, y } = target;
    if (!target.solid || !w.solid(x, y)) { if (chance(dt * 4)) this.hitOpenCell(target, 'drill'); return; }
    const i = w.idx(x, y);
    const b = BLOCKS[w.block[i]];
    const tier = (st.equipped('pick')?.tier ?? 1) + 1;
    const ore = w.ore[i] ? ORES[w.ore[i]] : null;
    const cx = x + 0.5, cy = y + 0.5;
    const needTier = Math.max(b.tier, ore ? ore.tier || 0 : 0);
    if (!isFinite(b.hp) || needTier > tier) {
      if (chance(dt * 10)) { this.fx.sparks(cx, cy, 3); this.audio.play('hit', { snd: 'hard', vol: 0.5 }); }
      this.say('toohard', 'Too hard even for the drill.', 'warn', 3);
      return;
    }
    if (ore && ore.tags.includes('explosive') && chance(dt * 3)) { this.explode(x, y); return; }
    if (ore) {
      const dmg = ore.frag * 2.2 * dt;
      if (dmg > 0) { w.oreQ[i] = Math.max(0, w.oreQ[i] - dmg); if (chance(dt * 4)) { this.float('-%', cx, cy - 0.3, '#ff6a5a', 0.8); this.audio.play('ore_damage'); } st.learn('chipped_ore'); }
      if (ore.tags.includes('resonant')) this.resonate(x, y, 4 * dt * 10);
      if (w.oreQ[i] <= 0) { this.destroyOre(x, y, 'shredded'); }
    }
    this.vibrate(x, y, 2, 3 * dt * 4);
    w.hp[i] -= tool.power * dt * 2.4;
    this.damaged.add(i);
    if (chance(dt * 18)) this.renderer.setHit(this.hitSlot++, x, y, this.time, 0.5);
    if (chance(dt * 30)) this.debris.burst(cx + (pl.x - cx) * 0.3, -cy, 1, b.debris || [b.color], { speed: 4, size: [0.04, 0.1], z: 0.45 });
    if (chance(dt * 25)) this.fx.sparks(cx + (pl.x - cx) * 0.35, cy, 2, [1, 0.8, 0.35], 5);
    if (chance(dt * 10)) this.fx.blockDust(cx, cy, b.id, 2);
    this.shake(0.03);
    this.energy(2.6 * dt);
    if (w.hp[i] <= 0) this.breakBlock(x, y, 'drill');
  }

  applyBrush(target, tool) {
    if (!target || !target.ok || target.far) return;
    const w = this.world, st = this.state;
    const { x, y } = target;
    const cx = x + 0.5, cy = y + 0.5;
    this.audio.play('brush');
    this.energy(0.05);
    if (!target.solid || !w.solid(x, y)) {
      if (!this.creatures.hitAt(target.mx, target.my, 'brush')) this.fx.dust(target.mx, target.my, 2);
      return;
    }
    const i = w.idx(x, y);
    this.fx.blockDust(cx, cy, w.block[i], 3);
    this.renderer.setHit(this.hitSlot++, x, y, this.time, 0.15);
    if (!w.ore[i]) {
      // brushing grit off bare rock: nothing hiding here
      if (!(w.flags[i] & F.REVEALED)) { w.flags[i] |= F.REVEALED; }
      return;
    }
    if (!(w.flags[i] & F.REVEALED) && !w.exposed(x, y)) {
      w.flags[i] |= F.REVEALED;
      w.markDirty(x, y);
      this.audio.play('glow');
      this.fx.sparkle(cx, cy);
      st.learn('hidden_ore');
      return;
    }
    const max = w.maxHp(x, y);
    const frac = w.hp[i] / max;
    if (frac > 0.38) { if (chance(0.25)) this.float('Too much rock', cx, cy - 0.4, '#e6dcc8', 0.8); return; }
    w.hp[i] -= (tool.power || 1) * 0.3;
    this.damaged.add(i);
    if (w.hp[i] <= 0) this.breakBlock(x, y, 'brush');
  }

  /** Hitting an open cell: plants, creatures, webs, beams. */
  hitOpenCell(target, kind) {
    const w = this.world;
    const { x, y } = target;
    if (this.creatures.hitAt(target.mx, target.my, kind)) { this.audio.play('hit', { snd: 'flesh', vol: 0.6 }); return; }
    const plant = this.plants.at(x, y);
    if (plant) { this.plants.harvest(plant, false); return; }
    if (w.hasFlag(x, y, F.WEB)) { this.clearWeb(x, y); return; }
    if (w.hasFlag(x, y, F.BEAM) && kind === 'pick') { this.removeBeam(x, y); return; }
  }

  grab(target) {
    const w = this.world, pl = this.player;
    if (target.far) return;
    const { x, y } = target;
    if (this.creatures.grabAt(target.mx, target.my, 0.9)) return;
    const plant = this.plants.at(x, y);
    if (plant) { this.plants.harvest(plant, true); return; }
    if (w.hasFlag(x, y, F.WEB)) { this.clearWeb(x, y); return; }
    if (w.hasFlag(x, y, F.BEAM)) { this.removeBeam(x, y); return; }
    if (w.hasFlag(x, y, F.STAKE)) { w.setFlag(x, y, F.STAKE, false); this.state.addItem('glow_stake'); this.staticDirty = true; this.audio.play('remove'); this.updateHotbar(); }
  }

  clearWeb(x, y) {
    const w = this.world;
    w.setFlag(x, y, F.WEB, false);
    this.pickups.spawn('spider_silk', x + 0.5, y + 0.5, { vy: -2 });
    this.fx.dust(x + 0.5, y + 0.5, 6, [0.9, 0.95, 1]);
    this.audio.play('brush');
  }

  placeBeam(target) {
    const w = this.world, st = this.state, pl = this.player;
    if (!target || target.far) return;
    const { x, y } = target;
    if (w.hasFlag(x, y, F.BEAM)) { this.removeBeam(x, y); return; }
    if (target.solid || w.solid(x, y)) { this.say('beamsolid', 'Beams go in open space, under a ceiling.', 'warn'); return; }
    if (!w.solid(x, y - 1) && !w.hasFlag(x, y - 1, F.BEAM)) { this.say('beamceil', 'Nothing above to hold up.', 'warn'); return; }
    if (!st.count('support_beam')) return;
    st.removeItem('support_beam', 1);
    w.setFlag(x, y, F.BEAM, true);
    // relieve stress above
    for (let yy = y - 3; yy < y; yy++) for (let xx = x - 8; xx <= x + 8; xx++) {
      if (!w.inb(xx, yy)) continue;
      const i = w.idx(xx, yy);
      if (w.stress[i] > 0 && this.stability.holds(xx, yy)) { w.stress[i] = 0; this.stability.stressed.delete(i); w.markDirty(xx, yy); }
    }
    this.audio.play('place');
    this.fx.dust(x + 0.5, y + 0.5, 6);
    st.learn('supports');
    this.updateHotbar();
  }
  removeBeam(x, y) {
    const w = this.world;
    w.setFlag(x, y, F.BEAM, false);
    this.state.addItem('support_beam');
    this.audio.play('remove');
    this.stability.onOpened(x, y);
    this.updateHotbar();
  }
  placeStake(target) {
    const w = this.world, st = this.state;
    if (!target || target.far || target.solid || w.solid(target.x, target.y)) return;
    if (!st.count('glow_stake')) return;
    st.removeItem('glow_stake', 1);
    w.setFlag(target.x, target.y, F.STAKE, true);
    this.staticDirty = true;
    this.audio.play('place');
    this.audio.play('glow');
    st.learn('darkness');
    this.updateHotbar();
  }

  vibrate(x, y, r, power) {
    const w = this.world, st = this.state;
    for (let yy = y - r; yy <= y + r; yy++)
      for (let xx = x - r; xx <= x + r; xx++) {
        if ((xx === x && yy === y) || !w.inb(xx, yy)) continue;
        const i = w.idx(xx, yy);
        if (!w.ore[i]) continue;
        const o = ORES[w.ore[i]];
        if (!o.vib) continue;
        const d = Math.max(Math.abs(xx - x), Math.abs(yy - y));
        const dmg = 1.4 * o.vib * Math.pow(power, 0.35) / d;
        w.oreQ[i] = Math.max(0, w.oreQ[i] - dmg);
        if (w.oreVisible(xx, yy)) {
          if (dmg > 1.5 && chance(0.5)) this.float(`-${Math.round(dmg)}%`, xx + 0.5, yy + 0.2, '#ffa08a', 0.75);
          if (!this.flags.vibration) { this.flags.vibration = true; st.learn('vibration'); }
          this.renderer.setHit(this.hitSlot++, xx, yy, this.time, 0.25);
        }
        if (o.tags.includes('resonant')) this.resonate(xx, yy, 1);
        if (w.oreQ[i] <= 0) this.destroyOre(xx, yy, 'shattered');
      }
  }

  resonate(x, y, amount) {
    const w = this.world;
    const i = w.idx(x, y);
    this.audio.tone({ f: 1400 + (x * 37 % 400), type: 'sine', dur: 0.6, vol: 0.05, reverb: 0.6, vib: 8, vibRate: 12 });
    if (w.oreVisible(x, y)) { this.fx.glints(x, y); this.state.learn('resonance'); }
    w.oreQ[i] -= amount * 1.5;
    if (w.oreQ[i] <= 25 && w.ore[i]) this.destroyOre(x, y, 'shattered');
  }

  destroyOre(x, y, how) {
    const w = this.world;
    const i = w.idx(x, y);
    const o = ORES[w.ore[i]];
    if (!o) return;
    w.ore[i] = 0;
    w.oreQ[i] = 0;
    w.markDirty(x, y);
    this.audio.play('break', { snd: 'crystal', vol: 0.8 });
    this.fx.sparkle(x + 0.5, y + 0.5, [0.8, 0.9, 1]);
    this.debris.burst(x + 0.5, -y - 0.5, 8, [0xffffff, 0xd8f0ff, ITEMS[o.item]?.icon?.c?.[0] ?? 0xaaaaff], { speed: 4, size: [0.04, 0.1] });
    if (w.oreVisible(x, y) || true) this.float(`${ITEMS[o.item].name} ${how}!`, x + 0.5, y, '#ff9a8a', 0.85);
  }

  breakBlock(x, y, kind) {
    const w = this.world, st = this.state, pl = this.player;
    const i = w.idx(x, y);
    const b = BLOCKS[w.block[i]];
    const oreId = w.ore[i];
    const q = w.oreQ[i];
    const cx = x + 0.5, cy = y + 0.5;
    // debris & dust
    this.debris.burst(cx, -cy, kind === 'brush' ? 4 : kind === 'chisel' ? 7 : 13, b.debris || [b.color], { speed: kind === 'drill' ? 5 : 4, size: [0.07, 0.22], bounce: b.bounce ?? 0.3, z: 0.25 });
    this.fx.blockDust(cx, cy, b.id, kind === 'brush' ? 4 : 10);
    this.audio.play('break', { snd: b.snd });
    this.shake(kind === 'brush' ? 0 : 0.07);
    if (oreId) {
      const o = ORES[oreId];
      const item = o.item;
      const pristine = kind === 'brush';
      const qq = Math.round(clamp(q + (st.hasBuff('lucky') && kind !== 'pick' ? 6 : 0), 1, 100));
      const p = this.pickups.spawn(item, cx, cy, { q: qq, p: pristine, vx: clamp((pl.x - cx) * 1.5, -2, 2), vy: -3.5 });
      if (pristine) { this.audio.play('pristine'); this.fx.sparkle(cx, cy, [1, 1, 0.7]); st.learn('pristine'); st.data.stats.pristine++; }
      else if (kind === 'chisel') { this.audio.play('ore_free'); st.learn('chiseling'); }
      else this.audio.play('ore_free', { gap: 0.2 });
      if (o.tags.includes('electric') && !st.protects('zap')) { this.fx.arcs(cx, cy, 4); }
      this.float(`${ITEMS[item].name} ${qq}%${pristine ? ' ✦' : ''}`, cx, cy - 0.5, qColor(qq), 0.95);
    }
    if (b.drop && chance(b.dropChance || 1)) this.pickups.spawn(b.drop, cx, cy, { q: Math.round(rand(60, 100)) });
    if (b.id === B.ROOTS && chance(0.12)) this.pickups.spawn('cave_carrot', cx, cy);
    w.setBlock(x, y, B.AIR);
    w.flags[i] |= F.MINED;
    w.flags[i] &= ~F.REVEALED;
    this.damaged.delete(i);
    st.data.stats.blocks++;
    // freshly opened fluid pocket?
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      const j = w.idx(x + dx, y + dy);
      if (w.inb(x + dx, y + dy) && w.fluid[j] > 0.3) {
        if (w.ftype[j] === 1 && !this.flags.flooding) { this.flags.flooding = true; st.learn('flooding'); this.audio.play('splash'); }
      }
    }
  }

  explode(x, y) {
    const w = this.world, st = this.state, pl = this.player;
    const cx = x + 0.5, cy = y + 0.5;
    const R = 2.6;
    const chain = [];
    w.ore[w.idx(x, y)] = 0;
    for (let yy = Math.floor(y - R); yy <= y + R; yy++)
      for (let xx = Math.floor(x - R); xx <= x + R; xx++) {
        if (!w.inb(xx, yy)) continue;
        const d = Math.hypot(xx - x, yy - y);
        if (d > R) continue;
        const i = w.idx(xx, yy);
        const b = BLOCKS[w.block[i]];
        if (w.ore[i]) {
          if (ORES[w.ore[i]].tags.includes('explosive')) { chain.push([xx, yy]); continue; }
          w.oreQ[i] = Math.max(0, w.oreQ[i] - rand(30, 60) * (1 - d / R + 0.3));
        }
        if (isSolid(b.id) && isFinite(b.hp) && b.hp < 14 && d < R - 0.3 && chance(0.85)) {
          if (w.ore[i] && w.oreQ[i] > 5) this.pickups.spawn(ORES[w.ore[i]].item, xx + 0.5, yy + 0.5, { q: Math.round(w.oreQ[i]), vx: (xx - x) * 3, vy: -4 + (yy - y) * 2 });
          this.debris.burst(xx + 0.5, -yy - 0.5, 4, b.debris || [b.color], { speed: 9, size: [0.08, 0.24] });
          w.setBlock(xx, yy, B.AIR);
          this.damaged.delete(i);
        } else if (isSolid(b.id)) { w.hp[i] -= 3; this.damaged.add(i); }
        const plant = this.plants.at(xx, yy);
        if (plant) this.plants.remove(plant);
      }
    this.fx.dustCloud(cx, cy, 2.4, [0.6, 0.62, 0.66]);
    this.fx.arcs(cx, cy, 14);
    this.fx.sparks(cx, cy, 30, [0.6, 0.95, 1], 9);
    for (let k = 0; k < 6; k++) this.fx.smoke(cx + rand(-1, 1), cy + rand(-1, 1), 2);
    this.fx.light(cx, cy, [1.2, 1.6, 2.0], 9, 0.6);
    this.audio.play('explode');
    this.audio.play('zap', { vol: 1 });
    this.post.flash = 0.6; this.post.flashColor = 0xd8f6ff;
    this.shake(0.55);
    const d = Math.hypot(pl.x - cx, pl.y - cy);
    if (d < 3.4) {
      this.hurt(Math.round(20 * (1 - d / 3.6)) + 4, 'explosion');
      pl.knock.x = Math.sign(pl.x - cx || 1) * 9 * (1 - d / 3.6);
      pl.knock.y = -6 * (1 - d / 3.6);
    }
    st.data.stats.explosions++;
    st.learn('explosion');
    this.say('kaboom', '<b>KA-BOOM!</b> Bioxide doesn\'t like being whacked.', 'bad', 6);
    chain.forEach(([xx, yy], k) => setTimeout(() => { if (this.game.scene === this && w.ore[w.idx(xx, yy)]) this.explode(xx, yy); }, 160 + k * 90));
  }

  quake(x, y) {
    this.stability.quake(x, y, 4);
    this.audio.play('rumble_hit');
    this.audio.play('creak');
    this.shake(0.3);
    this.fx.dustCloud(x + 0.5, y + 0.5, 3, [0.7, 0.55, 0.45]);
    this.say('quake', 'The ground lurches! Quakestone!', 'bad', 6);
    this.state.learn('cave_in');
  }

  collapse(x, y, granular) {
    const w = this.world;
    if (!w.solid(x, y)) return;
    this.fallers.add(x, y);
    this.damaged.delete(w.idx(x, y));
    this.collapseCount = (this.collapseCount || 0) + 1;
    this.collapseT = 2;
    if (granular) { this.state.learn('loose_ground'); this.audio.play('trickle'); }
    else { this.audio.play('creak'); this.shake(0.12); }
    if (this.collapseCount >= 3 && !this.caveInCounted) {
      this.caveInCounted = true;
      this.state.data.stats.caveins++;
      this.state.learn('cave_in');
      this.audio.play('collapse');
      this.shake(0.4);
      this.say('cavein', '<b>Cave-in!</b>', 'bad', 5);
      if (!this.loops.rumble) { this.loops.rumble = this.audio.loop('rumble', { vol: 0.5 }); setTimeout(() => { if (this.loops.rumble) { this.loops.rumble.stop(1); this.loops.rumble = null; } }, 2500); }
    }
  }

  fallerLanded(f, x, y) {
    const w = this.world;
    const speed = f.vy;
    const b = BLOCKS[f.block];
    if (!w.solid(x, y) && y < w.H - 1) {
      const nb = isGranular(f.block) ? f.block : B.RUBBLE;
      w.setBlock(x, y, nb);
      const i = w.idx(x, y);
      if (f.ore) { w.ore[i] = f.ore; w.oreQ[i] = Math.max(1, f.oreQ * (speed > 8 ? 0.8 : 0.92)); w.flags[i] |= f.flags; w.hp[i] = w.maxHp(x, y); }
      // rubble keeps falling if unsupported
      if (!w.solid(x, y + 1)) this.stability.queue.push([x, y, 0.05]);
      // crush plants
      const plant = this.plants.at(x, y);
      if (plant) this.plants.remove(plant);
    }
    this.debris.burst(f.x, -f.y - 0.3, 6 + Math.min(10, speed), b.debris || [b.color], { speed: 2 + speed * 0.3, size: [0.06, 0.18] });
    this.fx.blockDust(f.x, f.y + 0.4, f.block, 10);
    this.audio.play('thud', { vol: clamp(speed / 12, 0.3, 1) });
    this.shake(clamp(speed / 60, 0.04, 0.2));
  }

  fallerHitPlayer(f) {
    const b = BLOCKS[f.block];
    this.debris.burst(f.x, -f.y, 14, b.debris || [b.color], { speed: 5, size: [0.06, 0.2] });
    this.fx.blockDust(f.x, f.y, f.block, 12);
    if (f.ore) this.pickups.spawn(ORES[f.ore].item, f.x, f.y, { q: Math.round(f.oreQ * 0.6) });
    this.audio.play('break', { snd: b.snd });
    this.hurt(isGranular(f.block) ? 4 : 11, 'rock');
    this.player.knock.x = Math.sign(this.player.x - f.x || 1) * 3;
    this.say('bonk', 'BONK! Watch the ceiling!', 'bad', 3);
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
    if (counts && this.trip >= st.bagCapacity()) { this.say('bag', `Bag full! (${this.trip}/${st.bagCapacity()}) Ring a lift bell to head home.`, 'warn', 4); return false; }
    const lot = st.addItem(p.id, it.q ? { q: p.q, p: p.p } : {});
    if (counts) { this.trip++; st.data.stats.ores++; }
    this.tripItems.push({ id: p.id, uid: lot && lot.uid });
    this.tripValue += sellPrice(p.id, p.q, p.p);
    this.audio.play(it.cat === 'gem' || p.p ? 'pickup_gem' : 'pickup', { pitch: 0.9 + Math.random() * 0.3 });
    const label = it.q ? `+${it.name} <span style="color:${qColor(p.q)}">${Math.round(p.q)}%</span>` : `+${it.name}`;
    this.float(it.q ? `+${it.name} ${Math.round(p.q)}%` : `+${it.name}`, p.x, p.y - 0.5, it.q ? qColor(p.q) : '#e8ffd0', 0.85);
    const cat = it.cat === 'gem' ? 'gem' : it.cat === 'mineral' ? 'mineral' : it.cat === 'plant' ? 'plant' : null;
    if (cat) st.discover(cat, p.id);
    this.updateHotbar();
    return true;
  }

  // ------------------------------------------------------------------ periodic world behaviors
  oreBehaviors(dt) {
    const w = this.world, st = this.state, pl = this.player, v = this.view;
    this.magnets = [];
    this.oreLights = [];
    const x0 = Math.max(1, v.x0 - 6), x1 = Math.min(w.W - 2, v.x1 + 6), y0 = Math.max(1, v.y0 - 6), y1 = Math.min(w.H - 2, v.y1 + 6);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = w.idx(x, y);
        const oid = w.ore[i];
        if (!oid) continue;
        const o = ORES[oid];
        const exposed = w.exposed(x, y);
        // truffle scent drifts out of the dirt
        if (o.tags.includes('scent') && !exposed && Math.hypot(pl.x - x, pl.y - y) < 6 && chance(dt * 1.5)) this.fx.scent(x, y);
        if (!exposed) {
          // the faintest glint betrays hidden ore under lamplight
          if (chance(dt * 0.05) && this.lightAt(x + 0.5, y + 0.5) > 0.4) this.fx.glints(x, y);
          continue;
        }
        if (o.glow) this.oreLights.push({ x: x + 0.5, y: y + 0.5, r: ((o.glow >> 16) & 255) / 255 * 0.7, g: ((o.glow >> 8) & 255) / 255 * 0.7, b: (o.glow & 255) / 255 * 0.7, radius: 3.2 });
        if (o.tags.includes('void')) this.oreLights.push({ x: x + 0.5, y: y + 0.5, r: 0.8, g: 0.8, b: 0.7, radius: 3.5, neg: true, noOcc: true });
        if (o.tags.includes('magnet')) this.magnets.push({ x: x + 0.5, y: y + 0.5 });
        if (o.tags.includes('tarnish')) {
          w.oreQ[i] = Math.max(1, w.oreQ[i] - dt * 0.5);
          if (!this.flags.tarnish && Math.hypot(pl.x - x, pl.y - y) < 6) { this.flags.tarnishT = (this.flags.tarnishT || 0) + dt; if (this.flags.tarnishT > 6) { this.flags.tarnish = true; st.learn('tarnish'); this.say('tarnish', 'The moonsilver is dulling in the air...', 'warn', 30); } }
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (!w.inb(xx, yy)) continue;
          const j = w.idx(xx, yy);
          const wet = w.fluid[j] > 0.2 && w.ftype[j] === 1;
          if (o.tags.includes('hot')) {
            if (wet) { w.fluid[j] = Math.max(0, w.fluid[j] - dt * 0.6); if (chance(dt * 6)) this.fx.steam(xx + 0.5, yy + 0.5, 2); if (chance(dt)) this.audio.play('sizzle'); }
            const plant = this.plants.at(xx, yy);
            if (plant && chance(dt * 0.4)) this.ignite(xx, yy);
            if (w.block[j] === B.ROOTS && chance(dt * 0.3)) this.ignite(xx, yy);
            if (w.block[j] === B.ICE && chance(dt * 0.5)) { w.setBlock(xx, yy, B.AIR); w.fluid[j] = 1; w.ftype[j] = 1; this.fx.steam(xx + 0.5, yy + 0.5, 6); }
            if (chance(dt * 0.6)) this.fx.ember(x + 0.5, y + 0.3);
          }
          if (o.tags.includes('cold') && wet) {
            w.setBlock(xx, yy, B.ICE);
            this.fx.frost(xx, yy);
            this.audio.play('freeze');
            st.learn('freezing');
          }
          if (o.tags.includes('soluble') && wet) { w.oreQ[i] -= dt * 3; if (chance(dt * 3)) this.fx.bubbles(x + 0.5, y + 0.5); if (w.oreQ[i] <= 3) { w.ore[i] = 0; w.markDirty(x, y); } }
          if (o.tags.includes('electric') && wet) this.electrify(xx, yy);
          if (o.tags.includes('flammable') && w.fire[j] > 0 && chance(dt * 0.5)) this.ignite(x, y);
        }
        if (o.tags.includes('electric') && chance(dt * 0.8)) this.fx.spark(x + rand(0.1, 0.9), y + rand(0.1, 0.9), [0.5, 0.95, 1]);
      }
  }

  electrify(x, y) {
    const w = this.world;
    // flood a little region of connected water
    const seen = new Set();
    const stack = [[x, y]];
    while (stack.length && seen.size < 60) {
      const [cx, cy] = stack.pop();
      const i = w.idx(cx, cy);
      if (seen.has(i) || !w.inb(cx, cy) || w.fluid[i] < 0.2 || w.ftype[i] !== 1) continue;
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
      // spread
      if (chance(dt * 0.6)) {
        const [dx, dy] = pick([[1, 0], [-1, 0], [0, -1], [0, 1]]);
        const xx = x + dx, yy = y + dy;
        if (w.inb(xx, yy)) {
          const j = w.idx(xx, yy);
          const flam = this.plants.at(xx, yy) || w.block[j] === B.ROOTS || (w.ore[j] && ORES[w.ore[j]].tags.includes('flammable') && w.exposed(xx, yy)) || w.hasFlag(xx, yy, F.BEAM);
          if (flam) this.ignite(xx, yy);
        }
      }
      if (Math.abs(pl.x - (x + 0.5)) < 0.7 && Math.abs(pl.y - (y + 0.5)) < 0.8 && !this.state.protects('heat') && chance(dt * 3)) this.burn(3, x, y);
      if (w.fire[i] <= 0) {
        w.fire[i] = 0;
        this.fires.delete(i);
        const plant = this.plants.at(x, y);
        if (plant) { this.plants.remove(plant); this.fx.burnAt(x + 0.5, y + 0.5); }
        if (w.block[i] === B.ROOTS) { this.fx.burnAt(x + 0.5, y + 0.5); w.setBlock(x, y, B.AIR); }
        if (w.ore[i] && ORES[w.ore[i]].tags.includes('flammable')) { w.ore[i] = 0; w.markDirty(x, y); this.float('Coal burned away', x + 0.5, y, '#ffb07a', 0.8); }
        if (w.hasFlag(x, y, F.BEAM)) { w.setFlag(x, y, F.BEAM, false); this.stability.onOpened(x, y); this.say('beamburn', 'A support beam burned through!', 'bad'); }
      }
    }
    // spat embers
    const keep = [];
    for (const e of this.embersFlying) {
      e.t += dt;
      e.vy += 14 * dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      this.fx.ember(e.x, e.y);
      if (Math.hypot(pl.x - e.x, pl.y - e.y) < 0.6) { this.burn(5, e.x, e.y); continue; }
      if (w.solid(Math.floor(e.x), Math.floor(e.y)) || e.t > 3) {
        const plant = this.plants.at(Math.floor(e.x), Math.floor(e.y) - 1);
        if (plant) this.ignite(plant.x, plant.y);
        continue;
      }
      keep.push(e);
    }
    this.embersFlying = keep;
    // fire ambience
    const near = [...this.fires].some((i) => Math.hypot((i % w.W) - pl.x, Math.floor(i / w.W) - pl.y) < 8);
    if (near && !this.loops.fire) this.loops.fire = this.audio.loop('fire', { vol: 0.45 });
    if (!near && this.loops.fire) { this.loops.fire.stop(0.6); this.loops.fire = null; }
  }

  // ------------------------------------------------------------------ discovery scan
  scan() {
    const w = this.world, st = this.state, v = this.view;
    for (let y = Math.max(0, v.y0); y <= Math.min(w.H - 1, v.y1); y++)
      for (let x = Math.max(0, v.x0); x <= Math.min(w.W - 1, v.x1); x++) {
        const i = w.idx(x, y);
        if (!w.ore[i] || (w.flags[i] & F.SEEN)) continue;
        if (!w.oreVisible(x, y)) continue;
        if (this.lightAt(x + 0.5, y + 0.5) < 0.18) continue;
        w.flags[i] |= F.SEEN;
        const item = ORES[w.ore[i]].item;
        const cat = ITEMS[item].cat === 'gem' ? 'gem' : ITEMS[item].cat === 'plant' ? 'plant' : 'mineral';
        st.discover(cat, item);
        if (w.exposed(x, y) && !this.flags.hiddenOre) { this.flags.hiddenOre = true; st.learn('hidden_ore'); }
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
    this.audio.play('bell');
    this.audio.play('gate');
    this.state.learn('elevator');
    const pl = this.player;
    const s = this.screen(pl.x, pl.y, 0);
    const center = [s.x / window.innerWidth, 1 - s.y / window.innerHeight];
    await wait(500);
    if (this.trip) this.game.ui.toast(`Hauled up <b>${this.trip}</b> finds (≈${formatGoldFull(this.tripValue)}g)`, { kind: 'good', dur: 4000 });
    this.game.goto(to, { ...params, from: 'mine' }, { transition: 'iris', center });
  }

  faint() {
    if (this.fainting || this.leaving) return;
    this.fainting = true;
    const st = this.state;
    this.audio.play('faint');
    this.player.rig.play('sleep');
    st.data.stats.faints++;
    st.learn('fainting');
    // lose part of the haul
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
    const dist = this.camDist - 0.5;
    const halfH = Math.tan((cam.fov * Math.PI) / 360) * dist;
    const halfW = halfH * cam.aspect;
    const cx = this.camX, cy = this.camY;
    const v = {
      x0: Math.floor(cx - halfW) - 1, x1: Math.ceil(cx + halfW) + 1,
      y0: Math.floor(cy - halfH) - 1, y1: Math.ceil(cy + halfH) + 1,
    };
    v.cx0 = Math.floor(v.x0 / CHUNK); v.cx1 = Math.floor(v.x1 / CHUNK);
    v.cy0 = Math.floor(v.y0 / CHUNK); v.cy1 = Math.floor(v.y1 / CHUNK);
    v.halfW = halfW; v.halfH = halfH;
    this.view = v;
  }

  update(dt) {
    super.update(dt);
    const g = this.game, inp = g.input, st = this.state, w = this.world, pl = this.player;
    const U = this.renderer.U;
    U.time.value = this.time;
    this.post.flash = Math.max(0, (this.post.flash || 0) - dt * 2.5);

    // ---- input
    if (!this.fainting && !this.leaving) {
      for (let k = 0; k < SLOTS.length; k++) if (inp.pressed('Digit' + (k + 1))) this.selectSlot(k);
      if (inp.mouse.wheel) this.selectSlot(this.slot + Math.sign(inp.mouse.wheel));
      if (inp.pressed('KeyQ')) { const f = this.bestFood(); if (f) { g.eat(f.id); this.updateHotbar(); } else this.say('nofood', 'No snacks in your bag.', 'warn'); }
      if (inp.pressed('KeyE')) {
        const bell = this.nearestBell();
        if (bell) this.openLift();
        else if (this.target) this.grab(this.target);
      }
    }
    // ---- player
    const zippy = st.hasBuff('zippy');
    const pev = pl.update(dt, inp, { frozen: this.fainting || this.leaving, speed: zippy ? 1.25 : 1, jump: (st.hasBuff('bouncy') ? 1.3 : 1) * (st.equipped('boots')?.jump || 1), exhausted: st.energy < 8 });
    if (pev.jump) { this.audio.play('jump'); this.energy(0.25); }
    if (pev.landed) { this.audio.play('land', { hard: pev.landed > 9 }); this.fx.blockDust(pl.x, pl.feetY - 0.1, pl.groundBlock(), Math.min(8, pev.landed)); }
    if (pev.fallDamage) { this.hurt(Math.round(pev.fallDamage), 'fall'); this.say('fall', 'Oof! That was a long drop.', 'bad'); }
    if (pev.splash) { this.audio.play('splash'); this.fx.steam(pl.x, pl.y, 0); for (let k = 0; k < 8; k++) this.fx.bubbles(pl.x, pl.y); }
    if (pev.climbing) { this.energy(1.0 * dt); if (chance(dt * 6)) { this.audio.play('climb'); this.fx.blockDust(pl.x + pl.wall * 0.3, pl.y, B.DIRT, 1); } }
    if (pl.onGround && Math.abs(pl.vx) > 0.5) {
      this.stepT -= dt * Math.abs(pl.vx) / 3.5;
      if (this.stepT <= 0) {
        this.stepT = 0.32;
        const gb = BLOCKS[pl.groundBlock()];
        const mat = !gb ? 'dirt' : gb.snd === 'stone' || gb.snd === 'hard' || gb.snd === 'crystal' || gb.snd === 'ice' ? 'stone' : gb.snd === 'sand' ? 'sand' : gb.snd === 'wood' ? 'wood' : 'dirt';
        this.audio.play('step', { mat });
      }
    }
    if (pl.inWater && chance(dt * 1.5)) this.audio.play('swim');
    // hazards
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
    if (st.energy < 20 && !this.flags.lowEnergy) { this.flags.lowEnergy = true; st.learn('energy'); this.say('low', 'You\'re running low on energy. Eat something, or head home.', 'warn', 60); }

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
    this.stability.update(dt);
    this.fallers.update(dt, pl);
    this.debris.update(dt);
    this.pickups.update(dt);
    this.plants.update(dt);
    this.creatures.update(dt);
    this.updateFire(dt);
    this.oreT -= dt;
    if (this.oreT <= 0) { this.oreBehaviors(0.25); this.oreT = 0.25; }
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scan(); this.scanT = 0.5; }
    if (this.collapseT > 0) { this.collapseT -= dt; if (this.collapseT <= 0) { this.collapseCount = 0; this.caveInCounted = false; } }
    // bottom of the zone → unlock the next lift stop
    if (pl.y > w.H - 7 && !this.flags.bottom) {
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
    // ambience
    const lavaNear = this.lavaNear;
    if (lavaNear && !this.loops.lava) this.loops.lava = this.audio.loop('lava', { vol: 0.35 });
    if (!lavaNear && this.loops.lava) { this.loops.lava.stop(0.8); this.loops.lava = null; }
    if (chance(dt * 0.25)) this.audio.play('drip', { vol: 0.5 });

    // ---- camera
    const lookAhead = pl.facing * 0.8;
    const tx = pl.x + lookAhead, ty = pl.y - 0.4;
    this.camX += (tx - this.camX) * Math.min(1, dt * 5);
    this.camY += (ty - this.camY) * Math.min(1, dt * 6);
    this.updateView();
    const v = this.view;
    if (this.overview) { this.camX = w.W / 2; this.camY = w.H / 2; }
    else {
      this.camX = clamp(this.camX, v.halfW + 0.5, w.W - v.halfW - 0.5);
      this.camY = clamp(this.camY, v.halfH - 0.8, w.H - v.halfH);
    }
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.2);
    const sh = this.shakeAmp;
    // a fixed, slightly raised side view: floors read as 3D voxel tops, the camera never rotates
    this.camera.position.set(this.camX + (Math.random() - 0.5) * sh, -this.camY + 2.2 + (Math.random() - 0.5) * sh, this.camDist);
    this.camera.lookAt(this.camX + (Math.random() - 0.5) * sh * 0.3, -this.camY - 0.15, 0);
    this.updateView();

    // ---- lighting
    this.lighting.compute(this.staticLights(), this.dynamicLights(dt), v.x0 - 6, v.y0 - 6, v.x1 + 6, v.y1 + 6, this.staticDirty);
    this.staticDirty = false;

    // ---- render data
    this.renderer.updateChunks(v.cx0, v.cy0, v.cx1, v.cy1, 6);
    this.renderer.updateOverlay(this.damaged, this.target && !this.target.far && this.slotUsesTarget() ? this.target : null);
    if (fluidChanged) this.renderer.updateFluids(v.x0, v.y0, v.x1, v.y1);
    this.renderSprites();
    const pxScale = (g.engine.height / 2) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.renderer.dust.uPx.value = pxScale;
    this.renderer.glow.uPx.value = pxScale;
    this.renderer.dust.update(dt);
    this.renderer.glow.update(dt);
    const L = this.lighting.sample(pl.x, pl.y - 0.2);
    pl.updateVisual(dt, L, U.ambient.value, this.target ? this.target.mx - pl.x : pl.facing);

    // ---- HUD
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.15;
      const depth = w.depthMeters(pl.y, this.zdef);
      const cap = st.bagCapacity();
      g.ui.setDepth(`<b>${Math.floor(depth)} m</b><br>${this.zdef.name}<br>Bag ${this.trip}/${cap}`);
      const bell = this.nearestBell();
      g.ui.setPrompt(bell && !this.leaving ? '<kbd>E</kbd> Ring the lift bell' : null);
      if (SLOTS[this.slot] === 'drill') g.ui.setHotbarMeter(3, this.drillHeat);
      this.updateTooltip();
    }
  }

  slotUsesTarget() { return ['pick', 'chisel', 'brush', 'drill', 'beam', 'stake'].includes(SLOTS[this.slot]); }

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
    for (const sy of w.stations) out.push({ x: w.shaftX + 0.5, y: sy === 3 ? 2 : sy - 0.4, r: 1.0, g: 0.72, b: 0.38, radius: 3.6, pierce: 0 });
    return out;
  }

  dynamicLights(dt) {
    const st = this.state, pl = this.player;
    const out = [];
    const lp = pl.lampPos();
    const R = st.lightRadius();
    out.push({ x: lp.x, y: lp.y, r: 1.15, g: 0.98, b: 0.74, radius: R, pierce: 1, near: 1.6 });
    if (this.xrayOn) {
      const v = this.renderer.U.xray.value;
      for (let k = 1; k <= 3; k++) out.push({ x: v.x + Math.cos(v.z) * k * 1.6, y: -(v.y + Math.sin(v.z) * k * 1.6), r: 0.2, g: 0.55, b: 0.65, radius: 2.4, noOcc: true });
    }
    if (this.fireLights) out.push(...this.fireLights);
    this.fx.lights(out, dt);
    this.creatures.lights(out);
    this.pickups.lights(out);
    // the mole glows faintly when Glowing Whiskers is active
    if (st.hasBuff('glow')) out.push({ x: pl.x, y: pl.y, r: 0.2, g: 0.45, b: 0.8, radius: 3, noOcc: true });
    if (st.hasBuff('sense')) {
      const t = this.nearestHiddenOre(Math.floor(pl.x), Math.floor(pl.y), 6);
      if (t && chance(dt * 4)) this.fx.glints(t.x, t.y);
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
    // beams, stakes, webs, fire
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
    // lift bells, the cage at the top, and the down sign
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
    sb.end();
    gb.end();
  }

  updateTooltip() {
    const t = this.target;
    const tip = this.tooltip;
    const w = this.world;
    if (!t || t.far || this.game.ui.isPanelOpen()) { tip.style.opacity = 0; return; }
    let html = '';
    if (t.solid && w.solid(t.x, t.y)) {
      const i = w.idx(t.x, t.y);
      const b = BLOCKS[w.block[i]];
      html = `<b>${b.name}</b>`;
      if (w.ore[i] && w.oreVisible(t.x, t.y)) {
        const o = ORES[w.ore[i]];
        const q = Math.round(w.oreQ[i]);
        html += `<br>${ITEMS[o.item].name} <span style="color:${qColor(q)};font-weight:700">${q}%</span>`;
        const frac = w.hp[i] / w.maxHp(t.x, t.y);
        if (frac <= 0.38) html += ' <span style="color:#2a9a3a">· loose</span>';
      }
      const pickTier = this.state.equipped('pick')?.tier ?? 1;
      if (b.tier > pickTier) html += '<br><span style="color:#c0402a">too hard</span>';
    } else {
      const plant = this.plants.at(t.x, t.y);
      if (plant) html = `<b>${this.state.known('plant', PLANT_ITEM[plant.type]) ? ITEMS[PLANT_ITEM[plant.type]].name : '???'}</b>`;
      else if (w.hasFlag(t.x, t.y, F.BEAM)) html = '<b>Support beam</b>';
      else if (w.hasFlag(t.x, t.y, F.WEB)) html = '<b>Sticky web</b>';
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
  }

  exit() {
    for (const k of Object.keys(this.loops)) if (this.loops[k]) this.loops[k].stop(0.1);
    this.renderer.dispose();
    super.exit();
  }
}
