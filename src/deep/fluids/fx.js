// What water and lava do for the eyes and ears around the mole (methods mixed into Fluids):
// falling streams streaking down with spray and churning foam where they land, foam riding fast
// flows, steam where water meets lava, drips gathering on wet ceilings (over pools, and over the
// damp rock round them) that ring the surface or spatter on stone, bubbles rising from lake beds,
// lava bloops and spits, and crumbs trickling from freshly dug ceilings.
import { VOX, M, MAT } from '../materials.js';
import { OPAQUE, FLUID } from '../Mesher.js';
import { MAX_IMPACTS } from './water.js';

export const WATER_C = [0.62, 0.84, 1];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const chance = (p) => Math.random() < p;
const rnd = (a, b) => a + Math.random() * (b - a);
const col01 = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

export const fxMethods = {
  /** Falling streams, landing spray, foam on fast flows, steam where water meets lava. */
  flowFx(dt, eye) {
    const fx = this.fx, sim = this.sim;
    const near = (x, y, z, r) => Math.abs(x - eye.x) < r && Math.abs(z - eye.z) < r && Math.abs(y - eye.y) < r;
    const F = sim.falls;
    if (F.length) {
      // a curtain of droplets streaking down the falling stream, white flecks among them
      const n = Math.min(F.length / 4, Math.ceil(dt * 500));
      for (let i = 0; i < n; i++) {
        const j = ((Math.random() * F.length) / 4 | 0) * 4;
        const x = F[j], y = F[j + 1], z = F[j + 2], lava = F[j + 3] === M.LAVA;
        if (!near(x, y, z, 14)) continue;
        if (lava) { if (chance(0.3)) fx.ember(x, y, z); continue; }
        fx.droplet(x + rnd(-0.07, 0.07), y + rnd(-0.1, 0.12), z + rnd(-0.07, 0.07), rnd(-0.1, 0.1), rnd(-2.8, -1.4), rnd(-0.1, 0.1), rnd(0.12, 0.26), chance(0.35) ? [0.92, 0.98, 1] : WATER_C, 0.011);
      }
    }
    const Ls = sim.lands;
    this.landT = (this.landT || 0) - dt;
    if (Ls.length) {
      for (let i = 0; i < Math.min(4, Ls.length / 4); i++) {
        const j = ((Math.random() * Ls.length) / 4 | 0) * 4;
        const x = Ls[j], y = Ls[j + 1], z = Ls[j + 2], lava = Ls[j + 3] === M.LAVA;
        if (!near(x, y, z, 12)) continue;
        if (lava) { if (chance(dt * 8)) fx.steam(x, y + 0.05, z, 0.6, [0.5, 0.42, 0.4]); continue; }
        if (chance(dt * 40)) fx.mist(x + rnd(-0.1, 0.1), y + 0.04, z + rnd(-0.1, 0.1));
        if (chance(dt * 30)) { const vy = rnd(0.7, 1.6), a = Math.random() * 6.283, s = rnd(0.2, 0.7); fx.droplet(x, y + 0.03, z, Math.cos(a) * s, vy, Math.sin(a) * s, (2 * vy) / 9.8 + 0.3); }
        if (chance(dt * 4)) { const a = Math.random() * 6.283, s = rnd(0.3, 0.8); fx.foam(x, y + 0.012, z, Math.cos(a) * s, Math.sin(a) * s); }
        if (this.landT <= 0) { this.landT = 0.35; this.ripple(x, y + 0.03, z, 0.32); if (chance(0.5)) this.audio?.play('trickle', { vol: 0.5 }); }
      }
    }
    const Fo = sim.foams;
    for (let j = 0; j + 2 < Fo.length && j < 30; j += 3) {
      const x = (Fo[j] + 0.5) / VOX, y = (Fo[j + 1] + 0.7) / VOX, z = (Fo[j + 2] + 0.5) / VOX;
      if (near(x, y, z, 10)) fx.foam(x, y, z, rnd(-0.3, 0.3), rnd(-0.3, 0.3));
    }
    Fo.length = 0;
    const S = sim.steams;
    for (let j = 0; j + 2 < S.length && j < 30; j += 3) {
      const x = S[j], y = S[j + 1], z = S[j + 2];
      if (!near(x, y, z, 16)) continue;
      for (let i = 0; i < 4; i++) fx.steam(x, y, z, 1.4);
      if (chance(0.5)) fx.sparks(x, y, z, 2, [1, 0.6, 0.2], [0, 1, 0], 1.5);
      this.audio?.play(chance(0.5) ? 'steam' : 'sizzle');
    }
    S.length = 0;
    // a lake losing a layer gurgles
    if (sim.drains.length) { this.audio?.play('trickle', { vol: 0.6 }); sim.drains.length = 0; }
  },

  /** Foam churning where falling water lands (the shader draws it): points held a moment, fading. */
  impacts(dt, eye) {
    const I = this.imps, Ls = this.sim.lands;
    for (const p of I) p.k = Math.max(0, p.k - dt * 1.2);
    for (let j = 0; j < Ls.length; j += 4) {
      if (Ls[j + 3] !== M.WATER) continue;
      const x = Ls[j], y = Ls[j + 1], z = Ls[j + 2];
      if (Math.abs(x - eye.x) > 14 || Math.abs(z - eye.z) > 14) continue;
      let p = I.find((q) => Math.abs(q.x - x) + Math.abs(q.z - z) < 0.5 && Math.abs(q.y - y) < 0.3);
      if (!p) { if (I.length >= 24) continue; I.push(p = { x, y, z, k: 0 }); }
      p.k = Math.min(1, p.k + 0.12); p.x += (x - p.x) * 0.15; p.z += (z - p.z) * 0.15; p.y = y;
    }
    for (const s of this.splashes) s.k = Math.max(0, s.k - dt * 1.6);
    let j = 0;
    for (const p of I) if (p.k > 0) I[j++] = p;
    I.length = j;
    j = 0;
    for (const p of this.splashes) if (p.k > 0) this.splashes[j++] = p;
    this.splashes.length = j;
    const all = I.concat(this.splashes);
    all.sort((a, b) => Math.hypot(a.x - eye.x, a.z - eye.z) - Math.hypot(b.x - eye.x, b.z - eye.z));
    const W = this.U.wImp.value;
    for (let i = 0; i < MAX_IMPACTS; i++) { const p = all[i]; if (p) W[i].set(p.x, p.y, p.z, p.k); else W[i].set(0, -9999, 0, 0); }
  },

  // ------------------------------------------------------------------ ambient
  /** A random open-surface point of a lake near the eye, or null. */
  lakePoint(L, eye, maxD) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * maxD;
      let x = eye.x + Math.cos(a) * rr, z = eye.z + Math.sin(a) * rr;
      const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
      if (d > L.r * 0.95) { x = L.x + (dx / d) * L.r * 0.95 * Math.random(); z = L.z + (dz / d) * L.r * 0.95 * Math.random(); }
      const vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
      if (this.sim.vox(vx, L.top, vz) !== L.fluid || this.sim.vox(vx, L.top + 1, vz) !== 0) continue;
      return [x, z];
    }
    return null;
  },
  riseTime(d) {
    let y = 0, v = 0.15, t = 0;
    const h = 1 / 60;
    while (y < d && t < 3) { v += 1.4 * h; v *= 1 - 1.2 * h; y += v * h; t += h; }
    return t;
  },

  ambient(dt, eye) {
    const fx = this.fx;
    for (const L of this.sim.lakes) {
      const hd = Math.hypot(L.x - eye.x, L.z - eye.z) - L.r;
      if (hd > 12 || L.dry) continue;
      const sy = (L.top + 1) / VOX;
      if (Math.abs(sy - eye.y) > 9) continue;
      const near = clamp(1 - hd / 12, 0.25, 1);
      if (L.fluid === M.WATER) {
        if (chance(dt * 2.5 * near)) this.bubbleUp(L, eye, sy);
      } else {
        if (chance(dt * 6 * near)) { const q = this.lakePoint(L, eye, 8); if (q) fx.steam(q[0], sy + 0.05, q[1], 1, chance(0.5) ? [0.55, 0.45, 0.42] : [0.38, 0.32, 0.3]); }
        if (chance(dt * 1.2 * near)) this.bloop(L, eye, sy);
        if (chance(dt * 0.45 * near)) this.spit(L, eye, sy);
        if (chance(dt * 4 * near)) { const q = this.lakePoint(L, eye, 8); if (q) fx.ember(q[0], sy + 0.03, q[1]); }
      }
    }
    // wet ceilings: over any water near the mole drops gather and fall (and ring the surface); over
    // the damp rock right round it they spatter on stone
    const wm = this.wmap;
    if (wm.any) {
      this.dripT = (this.dripT || 0) - dt;
      if (this.dripT <= 0) {
        this.dripT = rnd(0.12, 0.3);
        for (let tries = 0; tries < 3; tries++) {
          const a = Math.random() * 6.283, rr = 0.6 + Math.sqrt(Math.random()) * 7;
          const x = eye.x + Math.cos(a) * rr, z = eye.z + Math.sin(a) * rr;
          const s = wm.surfaceAt(x, z);
          if (s !== null && Math.abs(s - eye.y) < 5) { if (chance(0.7)) this.dripAt(x, s, z, eye, true); break; }
          const n = wm.nearAt(x, z);
          if (n && n.k > 0.35 && Math.abs(n.top - eye.y) < 5 && chance(0.35)) {
            const hit = this.w.raycast(x, n.top + 0.4, z, 0, -1, 0, 3);
            if (hit) { this.dripAt(x, hit.y + 0.002, z, eye, false); break; }
          }
        }
      }
    }
  },

  /** A drop swells on the ceiling above (x, z), lets go and lands at y: a ring on water, a spatter on stone. */
  dripAt(x, y, z, eye, water) {
    const hit = this.w.raycast(x, y + 0.05, z, 0, 1, 0, 7);
    if (!hit) return;
    const cy = hit.y - 0.004, h = cy - y;
    if (h < 0.5) return;
    const form = rnd(0.5, 1.1), fx = this.fx;
    fx.dripForm(x, cy - 0.004, z, form, [0.55, 0.78, 1]);
    const tf = Math.sqrt((2 * h) / 9.8) * 0.96;
    this.later(form, () => fx.drip(x, cy - 0.01, z, tf, [0.6, 0.82, 1]));
    this.later(form + tf, () => {
      if (water) {
        this.ripple(x, y, z, 0.22);
        this.splashes.push({ x, y: y + 0.01, z, k: 0.25 });
      }
      for (let i = 0; i < (water ? 3 : 4); i++) { const vy = rnd(0.6, 1.3), a = Math.random() * 6.283, s = rnd(0.1, 0.35); fx.droplet(x, y + 0.01, z, Math.cos(a) * s, vy, Math.sin(a) * s, (2 * vy) / 9.8 + (water ? 0.02 : 0.25), WATER_C, 0.008); }
      const d = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
      if (d < 9) this.audio?.play('drip', { vol: clamp(1.2 - d / 8, 0.15, 1) * (water ? 1 : 0.6) });
    });
  },

  bubbleUp(L, eye, sy) {
    const q = this.lakePoint(L, eye, 7);
    if (!q) return;
    const [x, z] = q;
    const d = rnd(0.25, 1.2);
    if (this.sim.vox(Math.floor(x * VOX), Math.floor((sy - d) * VOX), Math.floor(z * VOX)) !== M.WATER) return;
    const life = this.riseTime(d);
    const fx = this.fx;
    for (let i = 0; i < (chance(0.3) ? 3 : 1); i++) fx.bubble(x + rnd(-0.03, 0.03), sy - d - i * 0.04, z + rnd(-0.03, 0.03), life + i * 0.05);
    this.later(life, () => {
      fx.foam(x, sy + 0.01, z, rnd(-0.2, 0.2), rnd(-0.2, 0.2));
      fx.glints(x, sy + 0.02, z, [0.8, 0.95, 1]);
      this.ripple(x, sy, z, 0.1);
      if (Math.hypot(x - eye.x, z - eye.z) < 5) this.audio?.play('bubble', { vol: 0.4 });
    });
  },

  bloop(L, eye, sy) {
    const q = this.lakePoint(L, eye, 9);
    if (!q) return;
    const [x, z] = q;
    this.ripple(x, sy, z, -0.6); // a dome swells...
    this.later(rnd(0.4, 0.6), () => { // ...and pops
      this.ripple(x, sy, z, 0.4);
      for (let i = 0; i < 3 + (Math.random() * 4 | 0); i++) this.fx.lavaBlob(x, sy + 0.03, z, rnd(-0.6, 0.6), rnd(1.2, 2.6), rnd(-0.6, 0.6), 0.02);
      this.fx.steam(x, sy + 0.06, z, 1, [0.5, 0.42, 0.4]);
      const d = Math.hypot(x - eye.x, sy - eye.y, z - eye.z);
      if (d < 10) this.audio?.play('bloop', { vol: clamp(1.1 - d / 9, 0.15, 1) });
    });
  },

  spit(L, eye, sy) {
    const q = this.lakePoint(L, eye, 8);
    if (!q) return;
    const [x, z] = q;
    const a = Math.random() * 6.283, s = rnd(0.6, 1.6), vy = rnd(3, 4.6);
    const vx = Math.cos(a) * s, vz = Math.sin(a) * s;
    this.fx.lavaBlob(x, sy + 0.04, z, vx, vy, vz, 0.042);
    for (let i = 0; i < 3; i++) this.fx.lavaBlob(x, sy + 0.04, z, vx * rnd(0.6, 1.3), vy * rnd(0.5, 0.9), vz * rnd(0.6, 1.3), 0.02);
    this.ripple(x, sy, z, 0.5);
    for (let i = 1; i <= 5; i++) {
      const t = i * 0.08;
      this.later(t, () => this.fx.glints(x + vx * t, sy + vy * t - 4.5 * t * t, z + vz * t, [1, 0.6, 0.2]));
    }
    const d = Math.hypot(x - eye.x, sy - eye.y, z - eye.z);
    if (d < 10) this.audio?.play('bloop', { vol: clamp(1.2 - d / 9, 0.2, 1) });
  },

  /** A freshly opened ceiling sheds a trickle of grains. */
  crumb(vx, vy, vz) {
    if (this.crumbs.length >= 10) return;
    const a = this.w.voxelAt(vx, vy + 1, vz);
    const mat = MAT[a];
    if (!OPAQUE[a] || !mat || a === M.BEDROCK || !mat.tones) return;
    if (!chance(mat.gran ? 0.4 : mat.snd === 'dirt' || mat.snd === 'sand' ? 0.12 : 0.05)) return;
    const x = (vx + 0.5) / VOX, y = (vy + 1) / VOX - 0.006, z = (vz + 0.5) / VOX;
    const P = this.ctx.player.pos;
    if (Math.abs(P.x - x) + Math.abs(P.z - z) > 8) return;
    for (const c of this.crumbs) if (Math.abs(c.x - x) + Math.abs(c.y - y) + Math.abs(c.z - z) < 0.35) return;
    this.crumbs.push({ x, y, z, t: 0, life: mat.gran ? rnd(1.2, 2.6) : rnd(0.5, 1.2), rate: mat.gran ? 26 : 10, col: col01(mat.tones[chance(0.5) ? 1 : 2]), col2: col01(mat.tones[3]) });
  },
  crumbFx(dt) {
    const C = this.crumbs;
    if (!C.length) return;
    let j = 0;
    for (const c of C) {
      c.t += dt;
      if (c.t >= c.life) continue;
      C[j++] = c;
      const n = c.rate * dt * (1 - c.t / c.life) * (c.t < 0.15 ? 2 : 1);
      const cnt = Math.floor(n) + (chance(n % 1) ? 1 : 0);
      for (let i = 0; i < cnt; i++) this.fx.grain(c.x, c.y, c.z, chance(0.7) ? c.col : c.col2);
    }
    C.length = j;
  },

  /** Is (x, y, z) inside fluid? (water 1, lava 2, else 0) */
  fluidAt(x, y, z) { return FLUID[this.sim.vox(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX))] || 0; },
};
