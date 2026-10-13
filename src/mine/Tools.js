// Mining tools on the pixel terrain: targeting, strikes, ore deposits (reveal, chip,
// loosen, pop out), vibration, explosions, falling islands and cave-in chunks.
import * as THREE from 'three';
import { B, BLOCKS, ORES } from './blocks.js';
import { M, MAT, ORE_BASE, GRAN, pixelColor, D_CRUST, isOre } from './micro.js';
import { UNGEN, F } from './MineWorld.js';
import { ITEMS } from '../data/items.js';
import { clamp, rand, chance, hexToRgb } from '../core/util.js';
import { qColor } from '../ui/UI.js';

export const REACH = 2.45;
const rgb = (hex) => { const c = hexToRgb(hex); return [c.r / 255, c.g / 255, c.b / 255]; };

export class Tools {
  constructor(scene) {
    this.s = scene;
    this.islandQ = [];
    this.islandT = 0;
  }
  get w() { return this.s.world; }

  // ------------------------------------------------------------------ targeting
  /** First solid pixel along the ray from the mole's paw toward the pointer (within reach). */
  target(mx, my, reach = REACH) {
    const s = this.s, pl = s.player, w = this.w;
    const ox = pl.x + pl.facing * 0.12, oy = pl.y - 0.18;
    let dx = mx - ox, dy = my - oy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-4) return null;
    dx /= dist; dy /= dist;
    const maxD = Math.min(dist, reach);
    const stepL = 0.6 / M;
    for (let t = 0.12; t <= maxD + 0.02; t += stepL) {
      const x = ox + dx * t, y = oy + dy * t;
      const px = Math.floor(x * M), py = Math.floor(y * M);
      const m = w.pmat(px, py);
      if (m) {
        const ore = isOre(m);
        const breakable = m !== B.BEDROCK && m !== B.TIMBER && m !== UNGEN;
        return { px, py, x: (px + 0.5) / M, y: (py + 0.5) / M, cx: Math.floor(x), cy: Math.floor(y), solid: true, mat: m, ore, ok: breakable, mx, my, dirx: dx, diry: dy };
      }
    }
    const far = dist > reach + 0.5;
    const px = Math.floor(mx * M), py = Math.floor(my * M);
    return { px, py, x: mx, y: my, cx: Math.floor(mx), cy: Math.floor(my), solid: false, ok: !far, far, mx, my, dirx: dx, diry: dy };
  }

  // ------------------------------------------------------------------ strikes
  /** Pickaxe impact at the target. */
  pick(t, tool) {
    const s = this.s, w = this.w, st = s.state;
    if (!t || t.far || !t.ok) { if (t && t.solid && !t.ok) this.tooHard(t, true); return; }
    if (!t.solid) { s.hitOpenCell(t, 'pick'); return; }
    const power = (tool.power || 1) * (st.hasBuff('zippy') ? 1.05 : 1);
    const tier = st.equipped('pick')?.tier ?? 1;
    if (t.ore) { this.hitOre(t, 'pick', power); return; }
    const res = s.digger.strike(t.px + 0.5, t.py + 0.5, power, tier);
    if (res.hard && !res.chunks.length && !res.chips.length) { this.tooHard(t, false); return; }
    const mt = MAT[t.mat];
    s.audio.play('hit', { snd: mt.snd || 'stone' });
    s.impact(t, res.chunks.length ? 1 : 0.6);
    const away = this.away(t);
    for (const pcs of res.chunks) this.chunkOut(pcs, away, 1);
    this.chipsOut(res.chips, away, 3.2);
    if (res.chunks.length) {
      const big = res.chunks.reduce((a, c) => a + c.length, 0);
      s.audio.play('break', { snd: mt.snd || 'stone', vol: clamp(big / 400, 0.4, 1) });
      s.shake(clamp(big / 3000, 0.03, 0.09));
      s.hitStop = Math.max(s.hitStop || 0, 0.035);
      st.data.stats.blocks += big / (M * M);
    } else s.shake(0.025);
    s.fx.dust(t.x, t.y, res.chunks.length ? 8 : 3, rgb(mt.dust ?? 0x9a9088), 0.3);
    if (mt.tier >= 2) s.fx.sparks(t.x - t.dirx * 0.1, t.y - t.diry * 0.1, 4, [1, 0.8, 0.4], 4);
    if (t.mat === B.QUAKE && chance(0.4)) s.quake(t.cx, t.cy);
    if (t.mat === B.ROOTS) s.fx.leaves(t.x, t.y, 'fern');
    if (res.loose) st.learn('loose_ground');
    this.vibrate(t.x, t.y, 1.3, power);
    s.energy(0.3);
    if (!s.flags.digging) { s.flags.digging = true; st.learn('digging'); }
    this.after(t.px, t.py, 'pick', 16);
  }

  chisel(t, tool) {
    const s = this.s, st = s.state;
    if (!t || t.far || !t.ok) { if (t && t.solid && !t.ok) this.tooHard(t, true); return; }
    if (!t.solid) { s.hitOpenCell(t, 'chisel'); return; }
    const power = tool.power || 0.55;
    const tier = Math.max(1, (st.equipped('pick')?.tier ?? 1));
    s.audio.play('chisel');
    if (t.ore) {
      const d = this.w.depositAt(t.px, t.py);
      if (d) {
        const e = d.exp ?? s.digger.exposure(d);
        if (e > 0.42) { d.loosen += 0.07 * power; s.fx.sparks(t.x, t.y, 2, [1, 1, 0.85], 2); if (d.loosen >= 1) this.pop(d, 'chisel'); else s.float('loosening…', t.x, t.y - 0.3, '#e6dcc8', 0.7); }
        else { this.damageDeposit(d, 0.6, t.x, t.y); s.fx.sparks(t.x, t.y, 2, [1, 1, 0.85], 2); }
      }
      s.energy(0.12);
      return;
    }
    const res = s.digger.chisel(t.px + 0.5, t.py + 0.5, power, tier);
    if (!res.chips.length) { if (res.hard) this.tooHard(t, false); return; }
    this.chipsOut(res.chips, this.away(t), 1.8);
    s.impact(t, 0.35);
    s.fx.sparks(t.x, t.y, 1, [1, 1, 0.8], 2);
    s.energy(0.14);
    this.after(t.px, t.py, 'chisel', 6);
  }

  brush(t, tool) {
    const s = this.s, st = s.state, w = this.w;
    if (!t || t.far) return;
    s.audio.play('brush');
    s.energy(0.04);
    if (!t.solid) { if (!s.creatures.hitAt(t.mx, t.my, 'brush')) s.fx.dust(t.mx, t.my, 2); return; }
    const power = tool.power || 1;
    const res = s.digger.brush(t.px + 0.5, t.py + 0.5, power);
    this.chipsOut(res.chips, this.away(t), 0.9, true);
    const mt = MAT[t.mat];
    s.fx.dust(t.x, t.y, 2, rgb(mt.dust ?? 0xb0a090), 0.2);
    // brushing reveals what hides just under the surface
    for (const d of w.depositsNear(t.x, t.y, 1.2)) {
      if (d.revealed || d.done) continue;
      const cx = d.x0 + d.w / 2, cy = d.y0 + d.h / 2;
      if (Math.hypot(cx - t.px, cy - t.py) < Math.max(d.w, d.h) / 2 + 9) {
        d.revealed = true;
        this.touchDeposit(d);
        s.audio.play('glow');
        s.fx.sparkle(cx / M, cy / M);
        st.learn('hidden_ore');
      }
    }
    if (t.ore) {
      const d = w.depositAt(t.px, t.py);
      if (d) {
        const e = s.digger.exposure(d);
        d.exp = e;
        if (e > 0.38) {
          d.loosen += 0.1 * power;
          if (chance(0.3)) s.fx.sparkle(t.x, t.y, [1, 1, 0.8]);
          if (d.loosen >= 1) this.pop(d, 'brush');
        } else if (chance(0.25)) s.float('Too much rock', t.x, t.y - 0.4, '#e6dcc8', 0.8);
      }
    }
    if (res.chips.length) this.after(t.px, t.py, 'brush', 6);
  }

  drill(t, tool, dt) {
    const s = this.s, st = s.state;
    if (!t || t.far || !t.ok) { if (t && t.solid && !t.ok && chance(dt * 4)) this.tooHard(t, true); return; }
    if (!t.solid) { if (chance(dt * 4)) s.hitOpenCell(t, 'drill'); return; }
    const tier = (st.equipped('pick')?.tier ?? 1) + 1;
    const res = s.digger.drill(t.px + 0.5, t.py + 0.5, tool.power || 3, tier, dt);
    if (res.hard && chance(dt * 6)) { this.tooHard(t, false); return; }
    const away = this.away(t);
    if (res.chips.length) this.chipsOut(res.chips.filter(() => chance(0.35)), away, 4.5);
    for (const [x, y] of res.ore) {
      const d = this.w.depositAt(x, y);
      if (!d) continue;
      const o = ORES[d.oreId];
      if (o.tags.includes('explosive') && chance(0.25)) { this.explode(d); return; }
      s.digger.chipOre(d, x, y, 1);
      this.damageDeposit(d, o.frag * 0.45, x / M, y / M);
      st.learn('chipped_ore');
    }
    if (chance(dt * 25)) s.fx.sparks(t.x, t.y, 2, [1, 0.8, 0.35], 5);
    if (chance(dt * 12)) s.fx.dust(t.x, t.y, 2, rgb(MAT[t.mat].dust ?? 0x9a9088), 0.25);
    s.shake(0.025);
    s.energy(2.6 * dt);
    this.vibrate(t.x, t.y, 1.6, 3 * dt * 4);
    if (res.chips.length) this.after(t.px, t.py, 'drill', 10);
  }

  tooHard(t, bedrock) {
    const s = this.s;
    s.audio.play('hit', { snd: 'hard', vol: 0.8 });
    s.fx.sparks(t.x - t.dirx * 0.08, t.y - t.diry * 0.08, 6, [1, 0.85, 0.5], 4);
    const b = MAT[t.mat];
    s.float(bedrock || !b || !isFinite(b.hp) ? 'Solid bedrock' : 'Too hard!', t.x, t.y - 0.4, '#ffd0a0', 0.9);
    if (!bedrock) s.state.learn('too_hard');
    s.energy(0.15);
  }

  /** Unit vector pointing from the wall back toward the mole (chunks fly that way). */
  away(t) {
    const pl = this.s.player;
    let dx = pl.x - t.x, dy = (pl.y - 0.3) - t.y;
    const d = Math.hypot(dx, dy) || 1;
    return [dx / d, dy / d];
  }

  /** A broken fracture piece flies out of the wall as a physical chunk. */
  chunkOut(pcs, away, k) {
    const s = this.s;
    if (!pcs.length) return;
    const face = s.face && s.face.on;
    const sp = rand(1.4, 3.2) * k;
    const b = s.bodies.spawn(pcs, {
      vx: away[0] * sp * (face ? 0.4 : 1) + rand(-0.6, 0.6), vy: -away[1] * sp + rand(1.2, 3.2), vz: face ? rand(2, 5.5) : rand(-0.4, 1.4),
      z: face ? 0.58 : rand(-0.1, 0.35), free: face && chance(0.75),
    });
    if (!b) this.chipsOut(pcs, away, 2.5);
    // a puff of the piece's own dust
    const c = pcs[(pcs.length / 2) | 0];
    s.fx.dust(c.x / M, c.y / M, Math.min(8, 2 + (pcs.length >> 5)), rgb(MAT[c.m]?.dust ?? c.c), 0.25);
  }

  /** Single pixels as tiny tumbling cubes. */
  chipsOut(chips, away, speed, soft) {
    const s = this.s;
    const face = s.face && s.face.on;
    let n = 0;
    for (const c of chips) {
      if (n++ > 40) break;
      if (chance(soft ? 0.5 : 0.25)) continue;
      const sp = speed * rand(0.35, 1);
      s.debris.spawn((c.x + 0.5) / M, -(c.y + 0.5) / M, face ? 0.56 : rand(0.2, 0.5),
        away[0] * sp * (face ? 0.5 : 1) + rand(-0.8, 0.8), -away[1] * sp + rand(0.5, 2.6), face ? rand(1.5, 6) : rand(-0.2, 1.4),
        rand(1.3, 2.4) / M, c.c, 0.3, rand(0.8, 1.8), face);
    }
  }

  // ------------------------------------------------------------------ ore deposits
  hitOre(t, kind, power) {
    const s = this.s, st = s.state, w = this.w;
    const d = w.depositAt(t.px, t.py);
    if (!d) return;
    const o = ORES[d.oreId];
    const pick = st.equipped('pick');
    if ((o.tier || 0) > (pick?.tier ?? 1)) { this.tooHard(t, false); return; }
    if (o.tags.includes('explosive') && chance(0.35)) { this.explode(d); return; }
    if (o.tags.includes('electric') && Math.hypot(s.player.x - t.x, s.player.y - t.y) < 1.8) s.zap(t.x, t.y, 5, 'Bioxide crackles up your pickaxe!');
    const chips = s.digger.chipOre(d, t.px, t.py, Math.round(2 + power * 2));
    this.chipsOut(chips, this.away(t), 3);
    const dmg = o.frag * Math.sqrt(power) * rand(0.8, 1.2) * (st.hasBuff('lucky') ? 0.7 : 1);
    if (dmg > 0) {
      this.damageDeposit(d, dmg, t.x, t.y);
      s.audio.play('ore_damage');
      st.learn('chipped_ore');
      if (o.tags.includes('resonant')) this.resonate(d, 2);
    } else if (o.item === 'diamond') s.say('diamond', 'Diamond doesn\'t chip. Its rock does.', 'good', 10);
    s.audio.play('hit', { snd: 'crystal', vol: 0.7 });
    s.impact(t, 0.8);
    s.fx.sparks(t.x, t.y, 4, [1, 0.95, 0.8], 3);
    s.shake(0.03);
    s.energy(0.3);
    this.vibrate(t.x, t.y, 1.3, power, d);
    this.after(t.px, t.py, 'pick', 8);
  }

  damageDeposit(d, dmg, x, y) {
    const s = this.s;
    d.q = Math.max(0, d.q - dmg);
    d.chipped++;
    if (dmg >= 1) s.float(`-${Math.round(dmg)}%`, x, y - 0.3, '#ff6a5a', 0.9);
    if (d.q <= 0 || (d.stamped && d.removed > d.stamped * 0.7)) this.destroyDeposit(d, 'shattered');
  }

  destroyDeposit(d, how) {
    const s = this.s;
    if (d.done) return;
    const pcs = s.digger.extract(d);
    this.chipsOut(pcs, [0, -0.3], 3);
    s.audio.play('break', { snd: 'crystal', vol: 0.8 });
    s.fx.sparkle((d.x0 + d.w / 2) / M, (d.y0 + d.h / 2) / M, [0.8, 0.9, 1]);
    s.float(`${ITEMS[d.item].name} ${how}!`, (d.x0 + d.w / 2) / M, d.y0 / M, '#ff9a8a', 0.85);
    this.after(d.x0 + d.w / 2, d.y0 + d.h / 2, 'ore', 4);
  }

  /** The deposit falls out of the rock: becomes a pickup. */
  pop(d, how) {
    const s = this.s, st = s.state, pl = s.player;
    if (d.done) return;
    const cx = (d.x0 + d.w / 2) / M, cy = (d.y0 + d.h / 2) / M;
    const pcs = s.digger.extract(d);
    const pristine = how === 'brush' && d.chipped === 0;
    const qq = Math.round(clamp(d.q + (st.hasBuff('lucky') && how !== 'pick' ? 6 : 0), 1, 100));
    s.pickups.spawn(d.item, cx, cy, { q: qq, p: pristine, vx: clamp((pl.x - cx) * 1.5, -2, 2), vy: -3.5 });
    if (pristine) { s.audio.play('pristine'); s.fx.sparkle(cx, cy, [1, 1, 0.7]); st.learn('pristine'); st.data.stats.pristine++; }
    else if (how === 'chisel') { s.audio.play('ore_free'); st.learn('chiseling'); }
    else s.audio.play('ore_free', { gap: 0.2 });
    const o = ORES[d.oreId];
    if (o.tags.includes('electric') && !st.protects('zap')) s.fx.arcs(cx, cy, 4);
    s.float(`${ITEMS[d.item].name} ${qq}%${pristine ? ' ✦' : ''}`, cx, cy - 0.5, qColor(qq), 0.95);
    // the cavity it leaves crumbles a little
    s.fx.dust(cx, cy, 6, [0.8, 0.74, 0.66], 0.3);
    for (let k = 0; k < Math.min(12, pcs.length); k++) if (chance(0.4)) s.fx.glints(cx - 0.5 + rand(-0.2, 0.2), cy - 0.5 + rand(-0.2, 0.2));
    this.after(d.x0 + d.w / 2, d.y0 + d.h / 2, 'ore', 4);
  }

  /** Re-check deposits around a change: visibility, exposure → pop. */
  touchDeposit(d) {
    const w = this.w;
    w.touchPx(d.x0, d.y0); w.touchPx(d.x0 + d.w - 1, d.y0 + d.h - 1);
    w.touchPx(d.x0 + d.w - 1, d.y0); w.touchPx(d.x0, d.y0 + d.h - 1);
  }

  checkDeposits(px, py, r, how) {
    const s = this.s, w = this.w;
    for (const d of w.depositsNear(px / M, py / M, r / M + 1)) {
      if (d.done) continue;
      const e = s.digger.exposure(d);
      d.exp = e;
      if (!d.visible && (d.revealed || e > 0 || this.anyNearAir(d))) { d.visible = true; this.touchDeposit(d); }
      if (d.left === 0) { d.done = true; continue; }
      if (e >= 0.74) this.pop(d, how);
    }
  }

  anyNearAir(d) {
    const w = this.w, mOre = ORE_BASE + d.oreId;
    for (let y = d.y0; y < d.y0 + d.h; y++) for (let x = d.x0; x < d.x0 + d.w; x++) {
      if (w.pmat(x, y) !== mOre) continue;
      for (let yy = y - 3; yy <= y + 3; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (!w.psolid(xx, yy)) return true;
    }
    return false;
  }

  vibrate(x, y, r, power, skip) {
    const s = this.s, st = s.state;
    for (const d of this.w.depositsNear(x, y, r)) {
      if (d === skip || d.done) continue;
      const o = ORES[d.oreId];
      if (!o.vib) continue;
      const cx = (d.x0 + d.w / 2) / M, cy = (d.y0 + d.h / 2) / M;
      const dist = Math.max(0.35, Math.hypot(cx - x, cy - y));
      if (dist > r) continue;
      const dmg = 1.4 * o.vib * Math.pow(power, 0.35) / (dist * 1.6);
      d.q = Math.max(0, d.q - dmg);
      if (d.visible) {
        if (dmg > 1.5 && chance(0.5)) s.float(`-${Math.round(dmg)}%`, cx, cy - 0.3, '#ffa08a', 0.75);
        if (!s.flags.vibration) { s.flags.vibration = true; st.learn('vibration'); }
        s.fx.glints(cx - 0.5, cy - 0.5);
      }
      if (o.tags.includes('resonant')) this.resonate(d, 1);
      if (d.q <= 0) this.destroyDeposit(d, 'shattered');
    }
  }

  resonate(d, amount) {
    const s = this.s;
    const cx = (d.x0 + d.w / 2) / M, cy = (d.y0 + d.h / 2) / M;
    s.audio.tone({ f: 1400 + ((d.x0 * 37) % 400), type: 'sine', dur: 0.6, vol: 0.05, reverb: 0.6, vib: 8, vibRate: 12 });
    if (d.visible) { s.fx.glints(cx - 0.5, cy - 0.5); s.state.learn('resonance'); }
    d.q -= amount * 1.5;
    if (d.q <= 25) this.destroyDeposit(d, 'shattered');
  }

  // ------------------------------------------------------------------ explosions
  explode(d) {
    const s = this.s, w = this.w, st = s.state, pl = s.player;
    if (d.done) return;
    const px = d.x0 + d.w / 2, py = d.y0 + d.h / 2;
    const cx = px / M, cy = py / M;
    s.digger.extract(d);
    const R = 2.6 * M;
    const res = s.digger.blast(px, py, R);
    for (const pcs of res.chunks) {
      if (!pcs.length) continue;
      const mx = pcs[0].x / M, my = pcs[0].y / M;
      const dx = mx - cx, dy = my - cy, dd = Math.hypot(dx, dy) || 1;
      if (chance(0.55)) s.bodies.spawn(pcs, { vx: (dx / dd) * rand(4, 9), vy: -(dy / dd) * rand(3, 8) + 3, vz: rand(-1, 3) });
      else this.chipsOut(pcs, [dx / dd, dy / dd], 8);
    }
    // other deposits in the blast
    const chain = [];
    for (const od of w.depositsNear(cx, cy, 3)) {
      if (od.done) continue;
      const ox = (od.x0 + od.w / 2) / M, oy = (od.y0 + od.h / 2) / M;
      const dd = Math.hypot(ox - cx, oy - cy);
      if (dd > 2.8) continue;
      if (ORES[od.oreId].tags.includes('explosive')) { chain.push(od); continue; }
      od.q = Math.max(0, od.q - rand(30, 60) * (1 - dd / 2.6 + 0.3));
      if (od.q > 5) this.pop(od, 'blast'); else this.destroyDeposit(od, 'blasted');
    }
    for (const p of [...s.plants.map.values()]) if (Math.hypot(p.x + 0.5 - cx, p.y + 0.5 - cy) < 2.6) s.plants.remove(p);
    s.fx.dustCloud(cx, cy, 2.4, [0.6, 0.62, 0.66]);
    s.fx.arcs(cx, cy, 14);
    s.fx.sparks(cx, cy, 30, [0.6, 0.95, 1], 9);
    for (let k = 0; k < 6; k++) s.fx.smoke(cx + rand(-1, 1), cy + rand(-1, 1), 2);
    s.fx.light(cx, cy, [1.2, 1.6, 2.0], 9, 0.6);
    s.audio.play('explode');
    s.audio.play('zap', { vol: 1 });
    s.hitStop = 0.12;
    s.post.flash = 0.6; s.post.flashColor = 0xd8f6ff;
    s.shake(0.55);
    const dist = Math.hypot(pl.x - cx, pl.y - cy);
    if (dist < 3.4) {
      s.hurt(Math.round(20 * (1 - dist / 3.6)) + 4, 'explosion');
      pl.knock.x = Math.sign(pl.x - cx || 1) * 9 * (1 - dist / 3.6);
      pl.knock.y = -6 * (1 - dist / 3.6);
    }
    st.data.stats.explosions++;
    st.learn('explosion');
    s.say('kaboom', '<b>KA-BOOM!</b> Bioxide doesn\'t like being whacked.', 'bad', 6);
    this.after(px, py, 'blast', R + 4);
    chain.forEach((od, k) => setTimeout(() => { if (s.game.scene === s && !od.done) this.explode(od); }, 160 + k * 90));
  }

  // ------------------------------------------------------------------ after any change
  /** Bookkeeping after pixels changed around (px, py): deposits, sand, islands, plants. */
  after(px, py, how, r) {
    const s = this.s;
    this.checkDeposits(px, py, r + 6, how);
    s.sand.wake(px, py, r + 24);
    const removed = s.digger.drain();
    if (removed.length) this.islandQ.push(...removed.slice(-600));
    s.staticDirty = true;
  }

  /** Periodic: detached rock islands fall. */
  updateIslands(dt) {
    this.islandT -= dt;
    if (this.islandT > 0 || !this.islandQ.length) return;
    this.islandT = 0.12;
    const w = this.w, MW = w.MW;
    const seeds = new Set();
    for (const p of this.islandQ) {
      const x = p % MW, y = (p / MW) | 0;
      for (const q of [p - 1, p + 1, p - MW, p + MW, p - MW - 1, p - MW + 1, p + MW - 1, p + MW + 1]) {
        const qx = q % MW;
        if (q < 0 || q >= w.pm.length || Math.abs(qx - x) > 1) continue;
        const m = w.pm[q];
        if (m && !GRAN[m]) seeds.add(q);
      }
    }
    this.islandQ = [];
    const done = new Set();
    for (const seed of seeds) {
      if (done.has(seed)) continue;
      const comp = this.component(seed, 6000, done);
      if (comp) this.detach(comp);
    }
  }

  /** Flood fill solid, non-loose pixels; null if anchored (bedrock, timber, edges, too big, beams). */
  component(seed, limit, done) {
    const w = this.w, MW = w.MW, MH = w.MH, pm = w.pm;
    const seen = new Set([seed]);
    const stack = [seed];
    while (stack.length) {
      const p = stack.pop();
      done.add(p);
      const m = pm[p];
      if (m === B.BEDROCK || m === B.TIMBER || m === UNGEN) return null;
      const x = p % MW, y = (p / MW) | 0;
      if (x <= 1 || y <= 1 || x >= MW - 2 || y >= MH - 2) return null;
      if (seen.size > limit) return null;
      // a support beam right below holds it up
      if (!pm[p + MW]) { const cx = (x / M) | 0, cy = ((y + 1) / M) | 0; if (w.flags[cy * w.W + cx] & F.BEAM) return null; }
      for (const q of [p - 1, p + 1, p - MW, p + MW]) {
        if (seen.has(q)) continue;
        const qm = pm[q];
        if (!qm || GRAN[qm]) continue;
        seen.add(q);
        stack.push(q);
      }
    }
    return seen;
  }

  /** Cut a loose island free: ore inside pops out, the rock falls as one chunk. */
  detach(comp) {
    const s = this.s, w = this.w, MW = w.MW;
    const deps = new Set();
    const pix = [];
    for (const p of comp) {
      const m = w.pm[p];
      const x = p % MW, y = (p / MW) | 0;
      if (isOre(m)) { const d = w.depositAt(x, y); if (d) deps.add(d); continue; }
      pix.push({ x, y, c: pixelColor(m, w.pd[p]), m });
    }
    for (const d of deps) this.pop(d, 'fall');
    for (const p of pix) w.clearPx(p.x, p.y);
    if (pix.length < 14) { this.chipsOut(pix, [0, 0.2], 1); return; }
    const big = pix.length > 260;
    s.bodies.spawn(pix, { vx: rand(-0.2, 0.2), vy: 0, vz: 0, spin: rand(-0.6, 0.6), spinX: 0, spinY: 0, big, keepPixels: big, life: 2.5 });
    s.audio.play(big ? 'creak' : 'trickle');
    if (big) { s.shake(0.08); s.state.learn('cave_in'); }
    s.sand.wake(pix[0].x, pix[0].y, 60);
  }

  /** A big falling chunk hit the ground: shatter into pieces and a rubble mound. */
  bigLand(b, speed) {
    const s = this.s, w = this.w;
    const pix = b.pixels || [];
    s.bodies.kill(b, true);
    const ox = b.x * M, oy = -b.y * M;
    // pieces fly, the rest becomes a pile of rubble where it landed
    const groups = new Map();
    let cx = 0, cy = 0;
    for (const p of pix) { cx += p.x; cy += p.y; }
    cx /= pix.length || 1; cy /= pix.length || 1;
    for (const p of pix) {
      const k = (((p.x - cx) / 13) | 0) + 64 + ((((p.y - cy) / 13) | 0) + 64) * 256;
      let l = groups.get(k);
      if (!l) groups.set(k, (l = []));
      l.push({ x: Math.round(p.x - cx + ox), y: Math.round(p.y - cy + oy), c: p.c, m: p.m });
    }
    let n = 0;
    for (const l of groups.values()) {
      if (n++ < 10 && chance(0.6)) s.bodies.spawn(l, { vx: rand(-2.5, 2.5), vy: rand(1, 3.5), vz: rand(-0.5, 1.2) });
    }
    // rubble mound
    const amount = Math.round(pix.length * 0.35);
    const half = Math.max(8, Math.min(60, Math.round(Math.sqrt(amount) * 1.3)));
    let placed = 0;
    for (let ring = 0; placed < amount && ring < 80; ring++) {
      for (let dx = -half; dx <= half && placed < amount; dx++) {
        const x = Math.round(ox + dx);
        let y = Math.round(oy + b.hy * M);
        while (y < w.MH - 1 && !w.psolid(x, y + 1)) y++;
        while (y > 0 && w.psolid(x, y)) y--;
        if (Math.abs(dx) > half * (1 - ring / 40)) continue;
        if (w.fillPx(x, y, B.RUBBLE, 2 + ((x * 7 + y * 3) % 7))) placed++;
      }
    }
    s.sand.wake(ox, oy, 80);
    s.fx.dustCloud(b.x, -b.y + b.hy * 0.5, 1.6 + Math.min(1.5, pix.length / 2000), [0.72, 0.66, 0.6]);
    s.audio.play('collapse');
    s.audio.play('thud', { vol: clamp(speed / 12, 0.4, 1) });
    s.shake(clamp(speed / 40, 0.12, 0.35));
    s.state.data.stats.caveins++;
    // anything standing under it gets bonked
    const pl = s.player;
    if (Math.abs(pl.x - b.x) < b.hx + 0.35 && Math.abs(pl.y + b.y) < b.hy + 0.6) s.bonk(11);
    s.staticDirty = true;
  }

  /** Cell-level cave-in (span too wide / quake): drop the cell's rock as a chunk. */
  collapseCell(x, y) {
    const s = this.s, w = this.w;
    w.ensureCells(x, y, x, y);
    const comp = [];
    for (let yy = y * M; yy < (y + 1) * M; yy++) for (let xx = x * M; xx < (x + 1) * M; xx++) {
      const m = w.pmat(xx, yy);
      if (!m || m === B.BEDROCK || m === B.TIMBER || m === UNGEN || GRAN[m]) continue;
      comp.push(yy * w.MW + xx);
    }
    if (comp.length) this.detach(comp);
    s.sand.wake(x * M + M / 2, y * M + M / 2, 48);
  }
}

export { D_CRUST, BLOCKS };
