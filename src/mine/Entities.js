// Living and loose things in the mine: dropped finds, plants and creatures.
// All positions are grid coordinates (x right, y down; cell centers at +0.5).
import { B, BLOCKS, ORES, ORE_ID, isSolid } from './blocks.js';
import { F } from './MineWorld.js';
import { ITEMS } from '../data/items.js';
import { rand, clamp, chance, pick } from '../core/util.js';

export const PLANT_ITEM = {
  glowcap: 'glowcap', carrot: 'cave_carrot', fern: 'blindfern', whisper: 'whisperweed', vine: 'rubber_sap', pepper: 'pepperroot',
  sparkmoss: 'sparkmoss', bubble: 'bubblebulb', lily: 'crystal_lily', gloom: 'gloomshroom', ashfern: 'ashfern', ember: 'emberbloom',
  frost: 'frostbloom', lotus: 'core_lotus',
};
const PLANT_LIGHT = {
  glowcap: [0.2, 0.5, 1.0, 3.2], lily: [0.55, 0.75, 1.0, 2.6], ember: [1.0, 0.5, 0.15, 3.6], lotus: [1.0, 0.5, 0.8, 3.2],
  sparkmoss: [0.25, 0.75, 1.0, 2.2], frost: [0.55, 0.85, 1.0, 2.2], whisper: [0.5, 0.35, 0.7, 1.6],
};
const METALS_MAGNETIC = new Set(['iron_ore', 'copper_ore', 'tin_ore', 'silver_ore', 'gold_ore', 'mithril_ore', 'moonsilver_ore', 'adamant_ore', 'starmetal_ore']);

// ---------------------------------------------------------------- pickups
export class Pickups {
  constructor(scene) {
    this.s = scene;
    this.list = [];
  }
  spawn(id, x, y, o = {}) {
    const it = ITEMS[id];
    if (!it) return null;
    const p = {
      id, x, y, vx: o.vx ?? rand(-1.5, 1.5), vy: o.vy ?? rand(-5, -2.5), q: o.q ?? 100, p: !!o.p, age: 0,
      float: id === 'gravium', glow: it.glow, bob: rand(0, 6), stuck: false, rejectT: 0,
    };
    this.list.push(p);
    return p;
  }
  update(dt) {
    const s = this.s, w = s.world, pl = s.player;
    const keep = [];
    for (const p of this.list) {
      p.age += dt;
      p.rejectT = Math.max(0, p.rejectT - dt);
      if (p.float) {
        // gravium falls up
        p.vy = Math.max(p.vy - 7 * dt, -1.5);
        if (!s.flags.antigravity && p.age > 0.6) { s.flags.antigravity = true; s.state.learn('antigravity'); }
      } else if (!p.stuck) p.vy = Math.min(p.vy + 22 * dt, 14);
      // magnetism toward exposed starmetal
      if (METALS_MAGNETIC.has(p.id) && s.magnets.length) {
        for (const m of s.magnets) {
          const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy);
          if (d < 5 && d > 0.6) { p.vx += (dx / d) * 9 * dt; p.vy += (dy / d) * 9 * dt; if (!s.flags.magnetism) { s.flags.magnetism = true; s.state.learn('magnetism'); } }
        }
      }
      // water slows
      const ci = w.idx(clamp(Math.floor(p.x), 0, w.W - 1), clamp(Math.floor(p.y), 0, w.H - 1));
      if (w.fluid[ci] > 0.4) { p.vx *= 1 - 3 * dt; p.vy *= 1 - 4 * dt; if (w.ftype[ci] === 2 && !['magmaite', 'sunstone', 'obsidian_shard', 'ember_scale'].includes(p.id) && p.age > 1) { s.fx.burnItem(p); continue; } }
      let nx = p.x + p.vx * dt;
      if (w.solidPt(nx + Math.sign(p.vx) * 0.18, p.y)) { p.vx = -p.vx * 0.3; nx = p.x; }
      let ny = p.y + p.vy * dt;
      if (p.vy > 0 && w.solidPt(nx, ny + 0.22)) {
        let g = 0;
        while (w.solidPt(nx, ny + 0.22) && g++ < 24) ny -= 1 / 32;
        if (p.vy > 3) p.vy = -p.vy * 0.35; else p.vy = 0;
        p.vx *= 0.55;
      } else if (p.vy < 0 && w.solidPt(nx, ny - 0.22)) {
        let g = 0;
        while (w.solidPt(nx, ny - 0.22) && g++ < 24) ny += 1 / 32;
        p.vy = p.float ? 0 : -p.vy * 0.2;
      }
      if (!p.float && p.vy === 0 && !w.solidPt(nx, ny + 0.25)) p.vy = 0.5; // the floor was dug away
      if (w.solidPt(nx, ny)) ny -= 2 / 32; // buried by sand: wriggle up
      p.x = nx; p.y = ny;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
      // collect (finds drift into your paws when close)
      const d = Math.hypot(pl.x - p.x, pl.y - p.y);
      if (p.age > 0.5 && d < 1.6 && d > 0.3 && p.rejectT <= 0 && !p.float) { p.vx += ((pl.x - p.x) / d) * 14 * dt; p.vy += ((pl.y - p.y) / d) * 14 * dt; }
      if (p.age > 0.35 && d < 0.8 && p.rejectT <= 0) {
        if (s.tryPickup(p)) continue;
        p.rejectT = 1.2;
        p.vy = -4.5;
        p.vx = Math.sign(p.x - pl.x || 1) * 3;
      }
      keep.push(p);
    }
    this.list = keep;
  }
  render(batch, glowBatch, atlas, t) {
    for (const p of this.list) {
      const ti = atlas.items[p.id];
      if (ti === undefined) continue;
      const bob = Math.sin(t * 3 + p.bob) * 0.04;
      batch.add(p.x, -p.y + 0.06 + bob, 0.5, 0.5, atlas.uv(ti), { z: 0.15, lit: 0.85 });
      if (p.p && Math.sin(t * 5 + p.bob) > 0.6) glowBatch.add(p.x + 0.18, -p.y + 0.25 + bob, 0.35, 0.35, atlas.uv(atlas.misc.glint), { z: 0.2, lit: 0, tint: [1, 1, 0.8, 0.9] });
    }
  }
  lights(out) {
    for (const p of this.list) if (p.glow) { const c = p.glow; out.push({ x: p.x, y: p.y, r: ((c >> 16) & 255) / 255 * 0.5, g: ((c >> 8) & 255) / 255 * 0.5, b: (c & 255) / 255 * 0.5, radius: 2.2 }); }
  }
}

// ---------------------------------------------------------------- plants
export class Plants {
  constructor(scene, list) {
    this.s = scene;
    this.map = new Map();
    for (const p of list) this.add(p);
    this.whisperT = 0;
  }
  add(p) {
    const w = this.s.world;
    const plant = { ...p, frame: Math.random() < 0.5 ? 0 : 1, t: rand(0, 10), angle: 0, fx: rand(0, 5), ox: rand(-0.18, 0.18), anchorT: 0 };
    this.anchor(plant);
    this.map.set(w.idx(p.x, p.y), plant);
  }
  /** Find the real (pixel) surface the plant grows from. Returns false when it lost its support. */
  anchor(p) {
    const w = this.s.world;
    const S = 1 / 32;
    p.ok = false;
    if (p.side === 'floor' || p.side === 'ceil') {
      const x = p.x + 0.5 + p.ox;
      p.ax = x;
      if (p.side === 'floor') { for (let y = p.y + 0.15; y < p.y + 1.7; y += S) if (w.solidPt(x, y)) { p.ay = Math.floor(y * 32) / 32; p.ok = true; break; } }
      else { for (let y = p.y + 0.85; y > p.y - 0.7; y -= S) if (w.solidPt(x, y)) { p.ay = (Math.floor(y * 32) + 1) / 32; p.ok = true; break; } }
    } else {
      const y = p.y + 0.5 + p.ox;
      p.ay = y;
      if (p.side === 'wallL') { for (let x = p.x + 0.85; x > p.x - 0.7; x -= S) if (w.solidPt(x, y)) { p.ax = (Math.floor(x * 32) + 1) / 32; p.ok = true; break; } }
      else { for (let x = p.x + 0.15; x < p.x + 1.7; x += S) if (w.solidPt(x, y)) { p.ax = Math.floor(x * 32) / 32; p.ok = true; break; } }
    }
    if (p.ok && w.matPt(p.ax, p.ay + (p.side === 'floor' ? 0.02 : p.side === 'ceil' ? -0.02 : 0)) === 255) p.pending = true; else p.pending = false;
    return p.ok;
  }
  at(x, y) { return this.map.get(this.s.world.idx(x, y)); }
  remove(plant) { this.map.delete(this.s.world.idx(plant.x, plant.y)); }
  supportCell(p) {
    if (p.side === 'floor') return [p.x, p.y + 1];
    if (p.side === 'ceil') return [p.x, p.y - 1];
    if (p.side === 'wallL') return [p.x - 1, p.y];
    return [p.x + 1, p.y];
  }
  /** Harvest. gentle = picked by paw (E / right click); otherwise hit with a tool. */
  harvest(p, gentle) {
    const s = this.s, st = s.state;
    const item = PLANT_ITEM[p.type];
    const cx = p.x + 0.5, cy = p.y + 0.5;
    this.remove(p);
    if (p.type === 'sparkmoss' && !st.protects('zap')) { s.zap(cx, cy, 5, 'Sparkmoss bites!'); }
    if (p.type === 'ember' && !st.protects('heat')) { s.burn(5, cx, cy); s.pickups.spawn(item, cx, cy, { vy: -3 }); return; }
    if (p.type === 'gloom' && !gentle) { s.fx.spores(cx, cy); s.hurt(6, 'spores'); s.audio.play('sneeze'); s.game.ui.toast('Sleepy spores... yawn.', { kind: 'warn' }); return; }
    if (p.type === 'bubble' && !gentle) { s.fx.pop(cx, cy); return; }
    const n = p.type === 'carrot' ? (chance(0.4) ? 2 : 1) : p.type === 'vine' ? (chance(0.5) ? 2 : 1) : 1;
    for (let k = 0; k < n; k++) s.pickups.spawn(item, cx, cy, { vy: rand(-3.5, -2) });
    s.audio.play('pickup', { pitch: 0.8 });
    s.fx.leaves(cx, cy, p.type);
  }
  update(dt) {
    const s = this.s, w = s.world;
    this.whisperT -= dt;
    for (const p of [...this.map.values()]) {
      p.t += dt;
      p.anchorT -= dt;
      if (p.anchorT <= 0 || p.pending) {
        p.anchorT = 0.35 + Math.random() * 0.2;
        if (!this.anchor(p)) { this.harvest(p, true); continue; }
        const inside = p.side === 'floor' ? w.solidPt(p.ax, p.ay - 0.3) : p.side === 'ceil' ? w.solidPt(p.ax, p.ay + 0.3) : p.side === 'wallL' ? w.solidPt(p.ax + 0.3, p.ay) : w.solidPt(p.ax - 0.3, p.ay);
        if (inside && !p.pending) { this.remove(p); continue; }
      }
      if (w.fluid[w.idx(p.x, p.y)] > 0.5 && w.ftype[w.idx(p.x, p.y)] === 2) { this.remove(p); s.fx.burnAt(p.x + 0.5, p.y + 0.5); continue; }
      if (w.fire[w.idx(p.x, p.y)] > 0) continue;
      if (p.type === 'whisper' && this.whisperT <= 0) {
        // lean toward the nearest hidden ore
        const t = s.nearestHiddenOre(p.x, p.y, 9);
        p.target = t;
      }
      if (p.type === 'whisper' && p.target) {
        const a = Math.atan2(-(p.target.y - p.y), p.target.x - p.x) - Math.PI / 2;
        p.angle += (clamp(a, -0.9, 0.9) - p.angle) * Math.min(1, dt * 2);
        if (Math.hypot(s.player.x - p.x, s.player.y - p.y) < 4 && chance(dt * 0.4)) s.audio.play('wisp', { vol: 0.5 });
      }
      // cosmetic particles only where someone can see them
      const v = s.view;
      if (v && (p.x < v.x0 - 1 || p.x > v.x1 + 1 || p.y < v.y0 - 1 || p.y > v.y1 + 1)) continue;
      if (p.type === 'sparkmoss' && chance(dt * 1.5)) s.fx.spark(p.x + rand(0.2, 0.8), p.y + rand(0.2, 0.8), [0.5, 0.9, 1]);
      if (p.type === 'ember' && chance(dt * 4)) s.fx.ember(p.x + 0.5, p.y + 0.3);
      if (p.type === 'gloom' && chance(dt * 0.6)) s.fx.spore(p.x + 0.5, p.y + 0.5);
      if (p.type === 'lotus' && chance(dt * 2)) s.fx.sparkle(p.x + 0.5, p.y + 0.4, [1, 0.6, 0.9]);
      if ((p.type === 'glowcap' || p.type === 'lily') && chance(dt * 0.45)) s.fx.firefly(p.x + 0.5, p.y + 0.35, p.type === 'glowcap' ? [0.38, 0.72, 1] : [0.72, 0.9, 1]);
    }
    if (this.whisperT <= 0) this.whisperT = 2;
  }
  render(batch, atlas, view) {
    for (const p of this.map.values()) {
      if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
      const tiles = atlas.plants[p.type];
      if (!tiles) continue;
      const uv = atlas.uv(tiles[Math.floor(p.t * 1.5 + p.fx) % 2]);
      if (p.ax === undefined) continue;
      if (p.side === 'floor') batch.add(p.ax, -p.ay - 0.03, 0.95, 0.95, uv, { anchor: 'bottom', z: 0.05, sway: 1 });
      else if (p.side === 'ceil') batch.add(p.ax, -p.ay + 0.03, 0.95, 0.95, uv, { anchor: 'bottom', z: 0.05, rot: Math.PI + p.angle, sway: 0.6, swayTop: false });
      else if (p.side === 'wallL') batch.add(p.ax - 0.03, -p.ay, 0.95, 0.95, uv, { anchor: 'bottom', rot: -Math.PI / 2, z: 0.05, sway: 0.5 });
      else batch.add(p.ax + 0.03, -p.ay, 0.95, 0.95, uv, { anchor: 'bottom', rot: Math.PI / 2, z: 0.05, sway: 0.5 });
    }
  }
  lights(out, view) {
    for (const p of this.map.values()) {
      const L = PLANT_LIGHT[p.type];
      if (!L) continue;
      if (p.x < view.x0 - 4 || p.x > view.x1 + 4 || p.y < view.y0 - 4 || p.y > view.y1 + 4) continue;
      out.push({ x: p.ax ?? p.x + 0.5, y: (p.ay ?? p.y + 1) - (p.side === 'floor' ? 0.4 : p.side === 'ceil' ? -0.4 : 0), r: L[0], g: L[1], b: L[2], radius: L[3], pierce: 0 });
    }
  }
}

// ---------------------------------------------------------------- creatures
const SOFT = new Set([B.DIRT, B.LOAM, B.CLAY, B.SAND, B.ROOTS]);

export class Creatures {
  constructor(scene, list) {
    this.s = scene;
    this.list = list.map((c) => this.make(c.type, c.x, c.y));
  }
  make(type, x, y) {
    return { type, x, y, vx: 0, vy: 0, t: rand(0, 10), state: 'idle', timer: rand(1, 4), facing: chance(0.5) ? 1 : -1, alive: true, shell: true, slime: true, scale: true, gem: true, cooldown: 0, home: { x, y }, flash: 0, xrayT: 0 };
  }
  near(c, r) { const p = this.s.player; return Math.hypot(p.x - c.x, p.y - c.y) < r; }
  open(x, y) { return !this.s.world.solidPt(x, y); }

  update(dt) {
    const s = this.s, w = s.world, pl = s.player, st = s.state;
    for (const c of this.list) {
      if (!c.alive) continue;
      c.t += dt;
      c.timer -= dt;
      c.cooldown = Math.max(0, c.cooldown - dt);
      c.flash = Math.max(0, c.flash - dt);
      const dist = Math.hypot(pl.x - c.x, pl.y - c.y);
      switch (c.type) {
        case 'earthworm': this.worm(c, dt); break;
        case 'dust_bunny': {
          this.walker(c, dt, c.state === 'flee' ? 3 : 1.1, true);
          if (c.timer <= 0) { c.state = 'idle'; c.timer = rand(1, 3); c.vx = chance(0.5) ? 0 : (chance(0.5) ? 1 : -1) * 1.2; if (this.onGround(c) && chance(0.5)) c.vy = -4; }
          if (dist < 0.9 && Math.abs(pl.vx) > 3 && c.cooldown <= 0) { s.fx.dustCloud(c.x, c.y, 1.4); s.audio.play('sneeze'); c.vx = Math.sign(c.x - pl.x || 1) * 4; c.vy = -5; c.state = 'flee'; c.timer = 2; c.cooldown = 3; }
          break;
        }
        case 'mole_cricket': {
          this.walker(c, dt, dist < 2.5 ? 3 : 0.8, true);
          if (dist < 2.5 && c.state !== 'flee') { c.state = 'flee'; c.vx = Math.sign(c.x - pl.x || 1) * 3; c.timer = 1.5; }
          if (c.timer <= 0) { c.state = 'idle'; c.timer = rand(2, 5); c.vx = (chance(0.5) ? 1 : -1) * 0.8; if (chance(0.5) && dist < 10) s.audio.play('chirp', { vol: 0.6 }); }
          break;
        }
        case 'cave_bat': this.bat(c, dt, dist); break;
        case 'rock_crab': {
          if (c.state === 'idle') {
            c.vx = 0;
            this.walker(c, dt, 0, false);
            if (dist < 1.25 && c.cooldown <= 0) { c.state = 'pinch'; c.timer = 0.5; c.cooldown = 2.5; s.audio.play('click'); }
          } else if (c.state === 'pinch') {
            if (c.timer <= 0) {
              if (dist < 1.4) { s.hurt(4, 'pinch'); s.player.knock.x = Math.sign(pl.x - c.x || 1) * 5; s.game.ui.toast('Ow! A rock crab!', { kind: 'warn' }); }
              c.state = 'scuttle'; c.timer = rand(2, 4); c.vx = Math.sign(c.x - pl.x || 1) * 2.4;
            }
          } else {
            this.walker(c, dt, 2.4, true);
            if (c.timer <= 0) { c.state = 'idle'; }
          }
          break;
        }
        case 'ore_slug': this.slug(c, dt, dist); break;
        case 'glow_beetle': case 'ember_moth': {
          const target = c.type === 'ember_moth' && dist < 9 ? { x: pl.x + Math.cos(c.t * 2) * 1.2, y: pl.y - 0.8 + Math.sin(c.t * 2.6) * 0.6 } : null;
          this.flier(c, dt, c.type === 'ember_moth' ? 2.6 : 1.1, target);
          break;
        }
        case 'spark_mite': {
          c.x = c.home.x + Math.sin(c.t * 2.3 + c.home.y) * 0.8 + Math.sin(c.t * 7) * 0.15;
          c.y = c.home.y + Math.cos(c.t * 1.9) * 0.6 + Math.cos(c.t * 9) * 0.12;
          if (dist < 0.85 && c.cooldown <= 0 && !st.protects('zap')) { s.zap(c.x, c.y, 3, 'Zzzt! Spark mites!'); c.cooldown = 1.6; }
          break;
        }
        case 'crystal_spider': {
          c.y = c.home.y + Math.sin(c.t * 0.8) * 0.6 + 0.4;
          if (c.timer <= 0) {
            c.timer = rand(18, 34);
            const wx = Math.floor(c.x) + Math.round(rand(-2, 2)), wy = Math.floor(c.y) + Math.round(rand(0, 2));
            if (w.inb(wx, wy) && !w.solid(wx, wy) && w.fluid[w.idx(wx, wy)] < 0.2) { w.setFlag(wx, wy, F.WEB, true); }
          }
          break;
        }
        case 'blind_fish': case 'frost_shrimp': this.swimmer(c, dt, 1, 1); break;
        case 'lava_newt': this.newt(c, dt, dist); break;
        case 'gem_tortoise': {
          this.walker(c, dt, c.gem ? 0.35 : 0, false);
          if (c.timer <= 0) { c.timer = rand(3, 7); c.vx = (chance(0.5) ? 1 : -1) * 0.35; }
          break;
        }
        case 'void_wisp': {
          c.x += Math.sin(c.t * 0.3 + c.home.x) * dt * 0.8;
          c.y += Math.cos(c.t * 0.23 + c.home.y) * dt * 0.6;
          c.x = clamp(c.x, 2, w.W - 3); c.y = clamp(c.y, 6, w.H - 3);
          if (dist < 6 && !s.flags.darkMatter) { s.flags.darkMatter = true; st.learn('dark_matter'); }
          // caught by the X-ray beam
          if (s.xrayOn && s.inXray(c.x, c.y)) {
            c.xrayT += dt;
            c.flash = 0.1;
            if (c.xrayT > 2) { c.alive = false; s.pickups.spawn('wisp_essence', c.x, c.y, { vy: -2 }); s.fx.sparkle(c.x, c.y, [0.8, 0.6, 1]); s.audio.play('pristine'); st.discover('critter', 'void_wisp'); }
          } else c.xrayT = Math.max(0, c.xrayT - dt * 0.5);
          break;
        }
      }
      // sighting → index
      if (!c.seen && dist < 7 && s.isLit(c.x, c.y, 0.12)) { c.seen = true; st.discover('critter', c.type); }
    }
    this.list = this.list.filter((c) => c.alive);
  }

  onGround(c) { return this.s.world.solidPt(c.x, c.y + 0.44); }

  walker(c, dt, speed, canTurn) {
    const w = this.s.world;
    c.vy = Math.min(c.vy + 20 * dt, 12);
    if (speed) c.vx = Math.sign(c.vx || c.facing) * speed;
    let nx = c.x + c.vx * dt;
    const ahead = nx + Math.sign(c.vx) * 0.32;
    if (c.vx && w.solidPt(ahead, c.y + 0.3) && !w.solidPt(ahead, c.y + 0.05) && !w.solidPt(ahead, c.y - 0.3)) c.y -= 0.2; // hop up a bump
    else if (c.vx && (w.solidPt(ahead, c.y) || (this.onGround(c) && !w.solidPt(ahead, c.y + 0.9)))) {
      if (canTurn) c.vx = -c.vx; else c.vx = 0;
      nx = c.x;
    }
    c.x = nx;
    let ny = c.y + c.vy * dt;
    if (c.vy > 0 && w.solidPt(c.x, ny + 0.44)) { let g = 0; while (w.solidPt(c.x, ny + 0.44) && g++ < 32) ny -= 1 / 32; c.vy = 0; }
    if (c.vy < 0 && w.solidPt(c.x, ny - 0.38)) { c.vy = 0; ny = c.y; }
    c.y = ny;
    if (c.vx) c.facing = Math.sign(c.vx);
    if (w.solidPt(c.x, c.y)) c.y -= 2 / 32; // pushed by rubble
  }

  flier(c, dt, speed, target) {
    if (!c.dir || c.timer <= 0) { c.dir = rand(0, Math.PI * 2); c.timer = rand(1, 3); }
    let ax = Math.cos(c.dir) * speed, ay = Math.sin(c.dir) * speed * 0.6;
    if (target) { const dx = target.x - c.x, dy = target.y - c.y, d = Math.hypot(dx, dy) || 1; ax = (dx / d) * speed * 1.4; ay = (dy / d) * speed * 1.4; }
    c.vx += (ax - c.vx) * Math.min(1, dt * 2);
    c.vy += (ay - c.vy) * Math.min(1, dt * 2);
    const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
    if (this.open(nx, c.y)) c.x = nx; else { c.vx = -c.vx; c.dir = Math.PI - c.dir; }
    if (this.open(c.x, ny)) c.y = ny; else { c.vy = -c.vy; c.dir = -c.dir; }
    if (c.vx) c.facing = Math.sign(c.vx);
  }

  swimmer(c, dt, speed) {
    const w = this.s.world;
    const wet = (x, y) => { if (!w.inb(Math.floor(x), Math.floor(y))) return false; const i = w.idx(Math.floor(x), Math.floor(y)); return !w.solidPt(x, y) && w.fluid[i] > 0.45 && w.ftype[i] === (c.type === 'lava_newt' ? 2 : 1); };
    if (!wet(c.x, c.y)) {
      // flop toward lower ground / out of water
      c.vy = Math.min(c.vy + 20 * dt, 10);
      const ny = c.y + c.vy * dt;
      if (!w.solidPt(c.x, ny + 0.3)) c.y = ny; else c.vy = 0;
      c.flop = (c.flop || 0) + dt;
      if (c.flop > 25) { c.alive = false; }
      return;
    }
    c.flop = 0;
    if (!c.dir || c.timer <= 0) { c.dir = rand(-0.5, 0.5) + (chance(0.5) ? 0 : Math.PI); c.timer = rand(1.5, 4); }
    const vx = Math.cos(c.dir) * speed, vy = Math.sin(c.dir) * speed * 0.4;
    if (wet(c.x + vx * dt * 3, c.y)) c.x += vx * dt; else c.dir = Math.PI - c.dir;
    if (wet(c.x, c.y + vy * dt * 3)) c.y += vy * dt; else c.dir = -c.dir;
    c.facing = Math.cos(c.dir) >= 0 ? 1 : -1;
  }

  worm(c, dt) {
    const s = this.s, w = s.world;
    const cx = Math.floor(c.x), cy = Math.floor(c.y);
    if (!w.solid(cx, cy)) {
      // fell out of its dirt: wriggle on the floor (catchable)
      c.exposed = true;
      this.walker(c, dt, 0.25, true);
      if (c.timer <= 0) { c.timer = rand(1, 3); c.vx = chance(0.5) ? 0.3 : -0.3; }
      // burrow back in after a while
      if (c.t > 40 && SOFT.has(w.get(cx, cy + 1))) { c.y += 1; c.t = 0; }
      return;
    }
    c.exposed = w.exposed(cx, cy);
    if (c.timer <= 0) {
      c.timer = rand(1.5, 4);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => SOFT.has(w.get(cx + dx, cy + dy)));
      if (dirs.length) { const [dx, dy] = pick(dirs); c.tx = cx + dx + 0.5; c.ty = cy + dy + 0.5; }
    }
    if (c.tx !== undefined) {
      c.x += clamp(c.tx - c.x, -dt * 0.6, dt * 0.6);
      c.y += clamp(c.ty - c.y, -dt * 0.6, dt * 0.6);
      if (c.tx !== c.x) c.facing = Math.sign(c.tx - c.x);
    }
  }

  bat(c, dt, dist) {
    const s = this.s, w = s.world;
    const lit = s.lightAt(c.x, c.y);
    if (c.state === 'idle') {
      // roosting
      if (!w.solidPt(c.x, c.y - 0.4)) { c.y -= dt * 2; }
      if ((lit > 0.75 && dist < 6) || dist < 1.5) { c.state = 'fly'; c.timer = rand(5, 9); s.audio.play('squeak'); c.flown = (c.flown || 0) + 1; }
    } else {
      this.flier(c, dt, 3.2, null);
      if (dist < 0.7 && c.cooldown <= 0) { s.player.knock.x = Math.sign(s.player.x - c.x || 1) * 3; s.audio.play('squeak'); c.cooldown = 1.5; }
      if (chance(dt * 0.05)) s.pickups.spawn('bat_guano', c.x, c.y, { vy: 1 });
      if (c.timer <= 0 && !w.solidPt(c.x, c.y) && w.solidPt(c.x, c.y - 0.55)) { c.state = 'idle'; c.vx = c.vy = 0; }
      if (c.timer <= -6) { // find a ceiling by drifting up
        c.vy = -2;
      }
    }
  }

  slug(c, dt, dist) {
    const s = this.s, w = s.world;
    if (c.state === 'flee') {
      this.walker(c, dt, 1.4, true);
      if (c.timer <= 0) c.state = 'idle';
      return;
    }
    if (c.timer <= 0) {
      c.timer = 3;
      c.target = s.nearestVisibleDeposit(c.x, c.y, 10);
    }
    const t = c.target;
    if (t && !t.done) {
      const tx = (t.x0 + t.w / 2) / 32, ty = (t.y0 + t.h / 2) / 32;
      const dx = tx - c.x, dy = ty - c.y;
      if (Math.abs(dx) < 1.0 && Math.abs(dy) < 1.2) {
        // munch
        c.eating = true;
        t.q -= dt * 5;
        if (chance(dt * 1.2) && dist < 10) s.audio.play('slurp', { vol: 0.6 });
        if (chance(dt * 3)) { s.fx.crumbs(tx, ty, t.oreId); s.digger.chipOre(t, c.x * 32, c.y * 32, 1); }
        if (dist < 8 && !s.flags.slugs && s.isLit(c.x, c.y, 0.1)) { s.flags.slugs = true; s.state.learn('ore_slugs'); }
        if (t.q <= 4) { s.digger.extract(t); s.tools.after(t.x0 + t.w / 2, t.y0 + t.h / 2, 'slug', 4); c.target = null; }
      } else {
        c.eating = false;
        c.vx = Math.sign(dx) * 0.45;
        this.walker(c, dt, 0.45, true);
      }
    } else {
      c.eating = false;
      this.walker(c, dt, 0.3, true);
    }
  }

  newt(c, dt, dist) {
    const s = this.s, w = s.world;
    if (c.state === 'hop') {
      c.vy += 18 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.vy > 0 && w.fluid[w.idx(Math.floor(c.x), Math.floor(c.y))] > 0.4) c.state = 'idle';
      if (w.solidPt(c.x, c.y + 0.4)) { c.vy = 0; c.state = 'idle'; }
      return;
    }
    this.swimmer(c, dt, 0.8);
    if (c.timer <= -4 && dist < 7) {
      c.timer = rand(4, 8);
      c.state = 'hop';
      c.vy = -7;
      c.vx = Math.sign(s.player.x - c.x || 1) * 1.6;
      s.audio.play('hiss');
      s.fx.ember(c.x, c.y - 0.3);
      s.spitEmber(c.x, c.y - 0.4, Math.sign(s.player.x - c.x || 1));
    }
  }

  /** Tool hit on a creature at the target point. Returns true if handled. */
  hitAt(x, y, tool) {
    const s = this.s, st = s.state;
    for (const c of this.list) {
      if (!c.alive || Math.hypot(c.x - x, c.y - y) > 0.75) continue;
      if (c.type === 'earthworm' && !c.exposed) continue;
      c.flash = 0.15;
      if (tool === 'brush') {
        if (c.type === 'dust_bunny' && c.cooldown <= 0) { s.audio.play('squeak', { pitch: 0.8 }); s.pickups.spawn('dust_fluff', c.x, c.y, { vy: -3 }); c.cooldown = 25; s.fx.hearts(c.x, c.y); st.discover('critter', c.type); return true; }
        if (c.type === 'gem_tortoise' && c.gem) {
          c.gem = false;
          const gem = pick(s.zone >= 5 ? ['sapphire', 'emerald', 'diamond'] : ['ruby', 'emerald', 'amethyst']);
          s.pickups.spawn(gem, c.x, c.y - 0.3, { vy: -3.5, q: 100, p: true });
          s.fx.sparkle(c.x, c.y, [1, 0.9, 0.6]); s.audio.play('pristine');
          s.game.ui.toast('The tortoise leaves you a gift.', { kind: 'good' });
          return true;
        }
        if (c.type === 'spark_mite') { s.pickups.spawn('spark_dust', c.x, c.y, { vy: -2 }); if (!st.protects('zap')) s.zap(c.x, c.y, 3); return true; }
        s.fx.dust(c.x, c.y, 4);
        return true;
      }
      switch (c.type) {
        case 'rock_crab':
          if (c.shell) { c.shell = false; s.pickups.spawn('crab_shell', c.x, c.y, { vy: -3 }); s.audio.play('click'); }
          c.state = 'scuttle'; c.timer = 4; c.vx = Math.sign(c.x - s.player.x || 1) * 3;
          return true;
        case 'ore_slug':
          if (c.slime) { c.slime = false; s.pickups.spawn('slug_slime', c.x, c.y, { vy: -3 }); }
          s.audio.play('squeak', { pitch: 0.6 });
          c.state = 'flee'; c.timer = 5; c.vx = Math.sign(c.x - s.player.x || 1);
          c.target = null;
          return true;
        case 'lava_newt':
          if (c.scale) { c.scale = false; s.pickups.spawn('ember_scale', c.x, c.y, { vy: -3 }); }
          s.audio.play('hiss');
          return true;
        case 'crystal_spider':
          s.audio.play('squeak', { pitch: 1.4 });
          c.home.y = Math.max(c.home.y - 2, 2);
          return true;
        case 'cave_bat': c.state = 'fly'; c.timer = 5; s.audio.play('squeak'); return true;
        case 'dust_bunny': s.fx.dustCloud(c.x, c.y, 1.4); s.audio.play('sneeze'); c.vy = -5; c.vx = 3 * Math.sign(c.x - s.player.x || 1); c.state = 'flee'; c.timer = 2; return true;
        default:
          return false;
      }
    }
    return false;
  }

  /** Gentle grab (E / right click). Returns true if something was caught. */
  grabAt(x, y, reach) {
    const s = this.s;
    for (const c of this.list) {
      if (!c.alive || Math.hypot(c.x - x, c.y - y) > reach) continue;
      const item = c.type === 'earthworm' && c.exposed ? 'worm' : c.type === 'glow_beetle' ? 'glow_beetle' :
        (c.type === 'blind_fish' || c.type === 'frost_shrimp') && s.player.inWater ? (c.type === 'blind_fish' ? 'blind_fish' : 'frost_shrimp') : null;
      if (!item) continue;
      c.alive = false;
      s.pickups.spawn(item, c.x, c.y, { vy: -2, vx: 0 });
      s.audio.play('squeak', { pitch: 1.2 });
      s.state.discover('critter', c.type);
      return true;
    }
    return false;
  }

  render(batch, glowBatch, atlas, view, t) {
    const s = this.s;
    for (const c of this.list) {
      if (!c.alive || c.x < view.x0 - 1 || c.x > view.x1 + 1 || c.y < view.y0 - 1 || c.y > view.y1 + 1) continue;
      const frames = atlas.critters[c.type];
      if (!frames) continue;
      let f = Math.floor(c.t * 6) % 2;
      if (c.type === 'rock_crab') f = c.state === 'idle' ? 0 : 2 + (Math.floor(c.t * 10) % 2);
      if (c.type === 'cave_bat' && c.state === 'idle') f = 1;
      if (c.type === 'cave_bat' && c.state !== 'idle') f = Math.floor(c.t * 12) % 2;
      const uv = atlas.uv(frames[f]);
      const tint = c.flash > 0 ? [2, 2, 2, 1] : [1, 1, 1, 1];
      let size = 0.8;
      if (c.type === 'spark_mite') size = 0.5;
      if (c.type === 'gem_tortoise') size = 0.95;
      if (c.type === 'earthworm') {
        if (!c.exposed) continue;
        const inside = s.world.solidPt(c.x, c.y);
        if (inside && s.lightAt(c.x, c.y) < 0.3) continue;
        size = inside ? 0.45 : 0.7;
      }
      const flipY = c.type === 'cave_bat' && c.state === 'idle';
      const z = c.type === 'earthworm' && s.world.solidPt(c.x, c.y) ? 0.51 : 0.12;
      batch.add(c.x, -c.y, size, size, uv, { z, flipX: c.facing < 0, flipY, tint, lit: c.type === 'void_wisp' ? 0 : 1 });
      if (c.type === 'void_wisp' && c.xrayT > 0) glowBatch.add(c.x, -c.y, 1.4, 1.4, atlas.uv(atlas.misc.glint), { z: 0.2, lit: 0, tint: [0.7, 0.5, 1, Math.min(1, c.xrayT / 2)] });
      if (c.type === 'crystal_spider') {
        const top = Math.floor(c.home.y) - 0.0;
        for (let yy = top; yy < c.y - 0.3; yy += 0.25) batch.add(c.x, -yy, 0.06, 0.25, atlas.uv(atlas.misc.spark), { z: 0.1, lit: 1, tint: [0.9, 0.95, 1, 0.8] });
      }
    }
  }

  lights(out) {
    for (const c of this.list) {
      if (!c.alive) continue;
      if (c.type === 'glow_beetle') out.push({ x: c.x, y: c.y, r: 0.55, g: 0.85, b: 0.3, radius: 3.4 });
      else if (c.type === 'ember_moth') out.push({ x: c.x, y: c.y, r: 0.9, g: 0.45, b: 0.12, radius: 2.4 });
      else if (c.type === 'spark_mite') out.push({ x: c.x, y: c.y, r: 0.3, g: 0.7, b: 1.0, radius: 1.6 });
      else if (c.type === 'lava_newt') out.push({ x: c.x, y: c.y, r: 0.9, g: 0.35, b: 0.08, radius: 2.2 });
      else if (c.type === 'void_wisp') out.push({ x: c.x, y: c.y, r: 0.7, g: 0.7, b: 0.6, radius: 4, neg: true, noOcc: true });
    }
  }
}
