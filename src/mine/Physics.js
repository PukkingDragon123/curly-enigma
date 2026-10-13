// Physical destruction: flying debris chunks, falling blocks, cave-ins and loose ground.
import { B, BLOCKS, isSolid, isGranular } from './blocks.js';
import { F } from './MineWorld.js';
import { rand, clamp } from '../core/util.js';

// ---------------------------------------------------------------- debris chunks
export class Debris {
  constructor(swarm, world) {
    this.swarm = swarm;
    this.w = world;
    this.list = [];
    this.tick = null; // optional sound callback
  }
  /** World-space (three) coordinates. */
  spawn(x, y, z, vx, vy, vz, size, color, bounce = 0.3, life = 3) {
    if (this.list.length >= this.swarm.cap) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, size, color, bounce, life, t: 0, rx: rand(0, 6), ry: rand(0, 6), rz: rand(0, 6), wx: rand(-12, 12), wy: rand(-12, 12), wz: rand(-12, 12), rest: false });
  }
  /** Burst of chunks from a cell face. dir: [dx, dy] bias in three coords. */
  burst(cx, cy, n, colors, { speed = 4, dir = [0, 0.4], size = [0.06, 0.18], bounce = 0.3, life = [1.6, 3.4], spread = 0.45, z = 0.35 } = {}) {
    for (let i = 0; i < n; i++) {
      const c = colors[(Math.random() * colors.length) | 0];
      const a = Math.random() * Math.PI * 2;
      const sp = speed * rand(0.35, 1);
      this.spawn(cx + rand(-spread, spread), cy + rand(-spread, spread), z + rand(-0.15, 0.25),
        Math.cos(a) * sp * 0.6 + dir[0] * speed, Math.abs(Math.sin(a)) * sp * 0.7 + dir[1] * speed, rand(0.2, 2.2),
        rand(size[0], size[1]), c, bounce, rand(life[0], life[1]));
    }
  }
  update(dt) {
    const w = this.w;
    const L = this.list;
    let n = 0;
    const solidAt = (x, y) => w.solid(Math.floor(x), Math.floor(-y));
    for (let i = 0; i < L.length; i++) {
      const d = L[i];
      d.t += dt;
      if (d.t > d.life) continue;
      if (!d.rest) {
        d.vy -= 22 * dt;
        const h = d.size * 0.5;
        let nx = d.x + d.vx * dt;
        if (solidAt(nx + Math.sign(d.vx) * h, d.y)) { d.vx = -d.vx * d.bounce; nx = d.x; }
        let ny = d.y + d.vy * dt;
        if (solidAt(nx, ny - h)) {
          if (d.vy < -2.5 && this.tick && Math.random() < 0.3) this.tick(d);
          d.vy = -d.vy * d.bounce;
          d.vx *= 0.6; d.wx *= 0.5; d.wy *= 0.5; d.wz *= 0.5;
          ny = Math.floor(ny - h) + 1 + h + 0.001;
          if (Math.abs(d.vy) < 0.9) { d.vy = 0; if (Math.abs(d.vx) < 0.25) d.rest = true; }
        } else if (solidAt(nx, ny + h)) { d.vy = -Math.abs(d.vy) * 0.2; ny = d.y; }
        d.x = nx; d.y = ny;
        d.z += d.vz * dt;
        if (d.z > 0.45) { d.z = 0.45; d.vz = -d.vz * 0.4; }
        if (d.z < -0.42) { d.z = -0.42; d.vz = -d.vz * 0.4; }
        d.vz *= 1 - 1.5 * dt;
        d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
      } else if (!solidAt(d.x, d.y - d.size * 0.5 - 0.02)) d.rest = false;
      L[n++] = d;
    }
    L.length = n;
    const sw = this.swarm;
    for (let i = 0; i < n; i++) {
      const d = L[i];
      const fade = d.life - d.t < 0.4 ? (d.life - d.t) / 0.4 : 1;
      sw.set(i, d.x, d.y, d.z, d.rx, d.ry, d.rz, d.size * fade, d.color);
    }
    sw.commit(n);
  }
}

// ---------------------------------------------------------------- falling blocks
export class Fallers {
  constructor(swarm, world, renderer, hooks) {
    this.swarm = swarm;
    this.w = world;
    this.r = renderer;
    this.hooks = hooks;
    this.list = [];
  }
  add(x, y) {
    const w = this.w;
    const i = w.idx(x, y);
    const block = w.block[i];
    if (!isSolid(block) || block === B.BEDROCK || block === B.TIMBER) return;
    const f = { x: x + 0.5, y: y + 0.5, vy: 0.5, block, ore: w.ore[i], oreQ: w.oreQ[i], variant: w.variant[i], rot: rand(-0.05, 0.05), spin: rand(-1, 1), flags: w.flags[i] & F.REVEALED };
    w.ore[i] = 0;
    w.setBlock(x, y, B.AIR);
    this.list.push(f);
    if (this.hooks.start) this.hooks.start(f);
  }
  update(dt, player) {
    const w = this.w;
    let n = 0;
    for (const f of this.list) {
      f.vy = Math.min(f.vy + 26 * dt, 18);
      const ny = f.y + f.vy * dt;
      f.rot += f.spin * dt * 0.6;
      const cx = Math.floor(f.x);
      const below = Math.floor(ny + 0.5);
      // hit the player?
      if (player && Math.abs(player.x - f.x) < 0.5 + 0.31 && Math.abs(player.y - ny) < 0.5 + 0.42) {
        this.hooks.hitPlayer(f);
        continue;
      }
      if (w.solid(cx, below) || below >= w.H - 1) {
        const cy = Math.floor(f.y);
        f.y = cy + 0.5;
        this.hooks.land(f, cx, cy);
        continue;
      }
      f.y = ny;
      this.list[n++] = f;
    }
    this.list.length = n;
    const sw = this.swarm;
    for (let i = 0; i < n; i++) {
      const f = this.list[i];
      sw.set(i, f.x, -f.y, 0, 0, 0, f.rot, 1, 0xffffff, this.r.tileUV(f.block, f.variant));
    }
    sw.commit(n);
  }
}

// ---------------------------------------------------------------- stability
export class Stability {
  constructor(world, hooks) {
    this.w = world;
    this.hooks = hooks;
    this.stressed = new Set();
    this.queue = [];
  }

  supportedByBeam(x, y) { return this.w.hasFlag(x, y, F.BEAM); }

  /** Width of the open run in `row` around column x (stops at solids and beams). */
  gapWidth(x, row, max = 24) {
    const w = this.w;
    if (!w.inb(x, row) || w.solid(x, row) || this.supportedByBeam(x, row)) return 0;
    let n = 1;
    for (let xx = x - 1; xx > x - max; xx--) { if (w.solid(xx, row) || this.supportedByBeam(xx, row)) break; n++; }
    for (let xx = x + 1; xx < x + max; xx++) { if (w.solid(xx, row) || this.supportedByBeam(xx, row)) break; n++; }
    return n;
  }
  openHeight(x, y, max = 4) {
    let h = 0;
    for (let yy = y; yy < y + max; yy++) { if (this.w.solid(x, yy) || this.supportedByBeam(x, yy)) break; h++; }
    return h;
  }

  /** Is a solid ceiling cell (x,y) holding? spanMul < 1 makes it weaker (quakes). */
  holds(x, y, spanMul = 1) {
    const w = this.w;
    const b = BLOCKS[w.get(x, y)];
    if (!b || !isSolid(b.id) || !isFinite(b.hp)) return true;
    if (w.hasFlag(x, y, F.STABLE) && spanMul >= 1) return true;
    if (w.solid(x, y + 1) || this.supportedByBeam(x, y + 1)) return true;
    if (isGranular(b.id)) return false;
    const gap = this.gapWidth(x, y + 1);
    const hgt = this.openHeight(x, y + 1);
    const span = (b.span + (hgt <= 1 ? 6 : hgt === 2 ? 2 : 0)) * spanMul;
    return gap <= span;
  }

  stress(x, y, t) {
    const w = this.w;
    if (!w.inb(x, y)) return;
    const i = w.idx(x, y);
    if (w.stress[i] > 0) return;
    w.stress[i] = t;
    this.stressed.add(i);
    if (this.hooks.warnStart) this.hooks.warnStart(x, y);
  }

  /** Call after the cell at (x,y) became open. */
  onOpened(x, y) {
    const w = this.w;
    // loose material above falls immediately
    for (const [dx, dy] of [[0, -1], [-1, -1], [1, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (isGranular(w.get(xx, yy)) && !w.solid(xx, yy + 1) && !this.supportedByBeam(xx, yy + 1)) this.queue.push([xx, yy, 0.05 + Math.random() * 0.15]);
    }
    // ceilings around
    for (let yy = y - 3; yy <= y; yy++)
      for (let xx = x - 9; xx <= x + 9; xx++) {
        if (!w.inb(xx, yy) || !w.solid(xx, yy)) continue;
        if (!this.holds(xx, yy)) this.stress(xx, yy, 1.8 + Math.random() * 1.6);
      }
    // islands cut free
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (!w.solid(xx, yy)) continue;
      const comp = this.component(xx, yy, 220);
      if (comp) for (const i of comp) this.stress(i % w.W, Math.floor(i / w.W), 0.7 + Math.random() * 0.6);
    }
  }

  /** Returns the cells of an unanchored solid component, or null if anchored. */
  component(x, y, limit) {
    const w = this.w;
    const seen = new Set();
    const stack = [w.idx(x, y)];
    while (stack.length) {
      const i = stack.pop();
      if (seen.has(i)) continue;
      seen.add(i);
      if (seen.size > limit) return null;
      const cx = i % w.W, cy = Math.floor(i / w.W);
      if (cx <= 1 || cx >= w.W - 2 || cy <= 1 || cy >= w.H - 2) return null;
      const b = w.block[i];
      if (b === B.BEDROCK || b === B.TIMBER) return null;
      if (w.flags[i] & F.STABLE && seen.size === 1) { /* natural ceilings still need a connection */ }
      for (const j of [i - 1, i + 1, i - w.W, i + w.W]) {
        if (!seen.has(j) && isSolid(w.block[j])) stack.push(j);
        else if (!isSolid(w.block[j]) && w.flags[j] & F.BEAM) return null;
      }
    }
    return seen;
  }

  /** A quake weakens everything around (quakestone). */
  quake(x, y, r = 4) {
    const w = this.w;
    this.weakT = 3;
    for (let yy = y - r; yy <= y + r; yy++)
      for (let xx = x - r; xx <= x + r; xx++) {
        if (!w.inb(xx, yy) || !w.solid(xx, yy)) continue;
        if ((xx - x) ** 2 + (yy - y) ** 2 > r * r) continue;
        if (!this.holds(xx, yy, 0.35)) this.stress(xx, yy, 0.6 + Math.random() * 1.4);
        else if (isGranular(w.get(xx, yy)) && !w.solid(xx, yy + 1)) this.queue.push([xx, yy, Math.random() * 0.5]);
      }
  }

  update(dt) {
    const w = this.w;
    // queued granular falls
    if (this.queue.length) {
      const keep = [];
      for (const q of this.queue) {
        q[2] -= dt;
        if (q[2] > 0) { keep.push(q); continue; }
        const [x, y] = q;
        if (isGranular(w.get(x, y)) && !w.solid(x, y + 1) && !this.supportedByBeam(x, y + 1)) this.hooks.collapse(x, y, true);
      }
      this.queue = keep;
    }
    for (const i of [...this.stressed]) {
      if (!isSolid(w.block[i])) { w.stress[i] = 0; this.stressed.delete(i); continue; }
      w.stress[i] -= dt;
      const x = i % w.W, y = Math.floor(i / w.W);
      if (this.hooks.warn) this.hooks.warn(x, y, w.stress[i]);
      if (w.stress[i] <= 0) {
        w.stress[i] = 0;
        this.stressed.delete(i);
        const isolated = this.component(x, y, 220);
        if (isolated || !this.holds(x, y, this.weakT > 0 ? 0.35 : 1)) this.hooks.collapse(x, y, false);
        else w.markDirty(x, y);
      }
    }
    if (this.weakT > 0) this.weakT -= dt;
  }
}
