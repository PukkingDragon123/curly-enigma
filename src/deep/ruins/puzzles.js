// The ruins' puzzles. Each one is built into a Site (./site.js) while the mole is near, keeps its
// state in the site's save, lights the door's progress runes as it goes, and calls site.solve()
// when done (the seal opens). Pieces are interactive elements (site.el): E / the use button.
//
//   levers  pull four levers in the order the signs over the door show (a wrong pull resets them)
//   switch  break the cracked wall panel (dust and a draught give it away), pull what is behind it
//   dials   turn three linked symbol drums (each turns its left neighbour too) to match the mural
//   beams   turn three crystal mirrors to carry the sun crystal's light round to the idol's socket
//   plates  weigh all three pressure plates down at once (you, a clump of ore, a block you build)
//   valve   turn the drain wheel on the landing: the flooded gallery drains and its door gives
import * as THREE from 'three';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { VOX, M } from '../materials.js';
import { OPAQUE } from '../Mesher.js';
import { SYMBOLS, G } from './glyphs.js';
import { toWorld, yawOf } from './common.js';
import * as MD from './models.js';

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const wrapPi = (a) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

class Puzzle {
  constructor(site) { this.s = site; this.R = site.R; this.L = site.L; this.P = site.P; this.save = site.save; this.busy = 0; }
  build() {}
  update() {}
  progress() { return 0; }
  dispose() { this.hum?.stop?.(); this.loop?.stop?.(); }
  /** A mesh in a pivot group (geometry tracked for disposal). */
  inPivot(pv, g, mat = this.R.mat) { const m = new THREE.Mesh(g, mat); m.layers.enable(LAYER_OUTLINE); pv.add(m); this.s.geos.push(g); return m; }
  locked() { return [{ say: 'It is locked fast now: the seal is open.', key: 'locked', cd: 3 }]; }
}

// ------------------------------------------------------------------ levers
const UP = 0.5, DOWN = 2.3;
class Levers extends Puzzle {
  build() {
    const s = this.s, P = this.P;
    this.save.seq ??= 0;
    this.items = P.levers.map((lv, i) => {
      const y0 = 7.5;
      s.put(MD.leverBase(lv.glyph), lv.a, y0, lv.b, lv.face);
      const pv = s.pivot(lv.a + lv.face[0] * 1.5, y0 + 5.25, lv.b + lv.face[1] * 1.5, lv.face);
      this.inPivot(pv, MD.leverHandle());
      pv.rotation.x = this.pulled(i) ? DOWN : UP;
      const pos = s.wp(lv.a + lv.face[0] * 3.5, y0 + 9, lv.b + lv.face[1] * 3.5);
      s.el(pos, 0.3, () => (this.save.open ? 'Lever (locked)' : this.pulled(i) ? 'Lever (down)' : 'Pull the lever'), () => this.pull(i));
      return { pv, pos };
    });
  }
  pulled(i) { return this.P.order.indexOf(i) < (this.save.seq || 0) || !!this.save.open; }
  progress() { return this.save.seq || 0; }
  swing(i, to, dur = 0.28) {
    const pv = this.items[i].pv, from = pv.rotation.x;
    this.s.anim(dur, (k) => { pv.rotation.x = from + (to - from) * ease(k); });
  }
  pull(i) {
    if (this.save.open) return this.locked();
    if (this.busy > 0) return [];
    if (this.pulled(i)) return [{ say: 'That lever is already down.', key: 'lvdown', cd: 2 }];
    const sx = this.R.sfx;
    this.busy = 0.35;
    this.swing(i, DOWN);
    sx.grind(0.4, 0.3);
    setTimeout(() => sx.click(0.9), 240);
    const P = this.P, seq = this.save.seq || 0;
    if (P.order[seq] === i) {
      this.save.seq = seq + 1;
      this.R.later(0.28, (out) => {
        sx.chime(seq + 1);
        this.s.setRunes(seq + 1);
        const rp = this.s.runePos(seq * 2), rq = this.s.runePos(seq * 2 + 1);
        for (const p of [rp, rq]) this.R.fx.sparks(p.x, p.y, p.z, 6, [0.5, 1, 1], [0, 0, 0], 1.2);
        if (seq + 1 >= P.levers.length) this.R.later(0.5, (o) => this.s.solve(o));
      });
      return [];
    }
    // wrong: they all clatter back up
    this.busy = 1.2;
    this.R.later(0.55, (out) => {
      sx.wrong();
      this.save.seq = 0;
      this.items.forEach((_, k) => this.swing(k, UP, 0.22));
      this.s.setRunes(0);
      this.R.owner?.shake?.(0.15);
      const c = this.s.center;
      for (let k = 0; k < 8; k++) this.R.fx.dust(c.x + (Math.random() - 0.5) * 4, c.y + 2.4, c.z + (Math.random() - 0.5) * 4, 3, [0.5, 0.45, 0.4], 0.2);
      out.push({ say: 'The levers clatter back up. There must be an order to it.', key: 'lvwrong', cd: 6 });
    });
    return [];
  }
  update(dt) { this.busy -= dt; }
}

// ------------------------------------------------------------------ the hidden switch
class Switch extends Puzzle {
  build() {
    const s = this.s, sw = this.P.switch;
    const y0 = 9;
    s.put(MD.leverBase(G.hammer), sw.a, y0, sw.b, sw.face);
    this.pv = s.pivot(sw.a + sw.face[0] * 1.5, y0 + 5.25, sw.b + sw.face[1] * 1.5, sw.face);
    this.inPivot(this.pv, MD.leverHandle('switch'));
    this.pv.rotation.x = this.save.open ? DOWN : UP;
    const pos = s.wp(sw.a + sw.face[0] * 3, y0 + 9, sw.b + sw.face[1] * 3);
    s.el(pos, 0.3, () => (this.save.open ? 'Switch (pulled)' : 'Pull the hidden switch'), () => this.pull());
    this.dustT = 0;
    this.windT = 1;
  }
  intact() {
    const sw = this.P.switch, LB = this.P.LB;
    let n = 0;
    for (const y of [10, 16, 22]) for (const da of [-3, 0, 3]) if (this.s.vox(Math.floor(sw.a + da), y, sw.side > 0 ? LB : -LB - 1) === M.CRACKED) n++;
    return n >= 3;
  }
  update(dt, eye, out) {
    if (this.save.open) return;
    const sw = this.P.switch, LB = this.P.LB, s = this.s;
    const face = s.wp(sw.a, 16, sw.side * LB);
    const d = Math.hypot(face.x - eye.x, face.y - eye.y, face.z - eye.z);
    if (d > 7) return;
    this.chk = (this.chk || 0) - dt;
    if (this.chk <= 0) { this.chk = 0.5; this.whole = this.intact(); }
    if (!this.whole) return;
    // dust sifting out of the cracks, and a draught you can hear
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.25 + Math.random() * 0.5;
      const p = s.wp(sw.a + (Math.random() - 0.5) * 14, 5 + Math.random() * 24, sw.side * (LB - 0.3));
      this.R.fx.spawn({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.05, vy: -0.25, vz: (Math.random() - 0.5) * 0.05, life: 1.6, size: 0.012 + Math.random() * 0.012, color: [0.62, 0.56, 0.48], alpha: 0.7, drag: 0.5 });
    }
    this.windT -= dt;
    if (this.windT <= 0 && d < 4) { this.windT = 3.5 + Math.random() * 3; this.R.sfx.draught(1 - d / 4); }
    if (d < 3 && !this.save.hint) { this.save.hint = 1; out.push({ say: 'A cold draught whistles through the cracks in this wall.', key: 'draught' + s.id, cd: 30 }); }
  }
  pull() {
    if (this.save.open) return this.locked();
    const sx = this.R.sfx;
    const from = this.pv.rotation.x;
    this.s.anim(0.35, (k) => { this.pv.rotation.x = from + (DOWN - from) * ease(k); });
    sx.grind(0.5, 0.35);
    setTimeout(() => sx.click(0.7), 300);
    this.R.later(0.6, (out) => this.s.solve(out));
    return [];
  }
}

// ------------------------------------------------------------------ dials
class Dials extends Puzzle {
  build() {
    const s = this.s, P = this.P;
    this.save.dials ??= P.dials.map((d) => d.start);
    const y1 = P.altar.y1;
    this.items = P.dials.map((d, i) => {
      s.put(MD.drumStand(), d.a, y1, d.b, d.face);
      const pv = s.pivot(d.a, y1 + 4.8, d.b, d.face);
      this.inPivot(pv, MD.drum(SYMBOLS));
      pv.rotation.x = (this.save.dials[i] * Math.PI) / 3;
      const pos = s.wp(d.a + d.face[0] * 2, y1 + 4.8, d.b + d.face[1] * 2);
      s.el(pos, 0.3, () => (this.save.open ? 'Symbol drum (set)' : 'Turn the drum'), () => this.turn(i));
      return { pv, pos };
    });
  }
  matched() { return this.P.dials.reduce((n, d, i) => n + (SYMBOLS[this.save.dials[i] % 6] === this.P.target[i] ? 1 : 0), 0); }
  progress() { return this.matched(); }
  spin(i) {
    const pv = this.items[i].pv, from = pv.rotation.x, to = (this.save.dials[i] * Math.PI) / 3;
    const dd = wrapPi(to - from);
    this.s.anim(0.42, (k) => { pv.rotation.x = from + dd * ease(k); });
  }
  turn(i) {
    if (this.save.open) return this.locked();
    if (this.busy > 0) return [];
    this.busy = 0.45;
    const P = this.P, D = this.save.dials;
    const before = this.matched();
    D[i] = (D[i] + 1) % 6;
    this.spin(i);
    const link = P.dials[i].link;
    if (link >= 0) { D[link] = (D[link] + 1) % 6; this.spin(link); }
    const sx = this.R.sfx;
    sx.grind(link >= 0 ? 0.7 : 0.5, 0.4);
    setTimeout(() => sx.click(link >= 0 ? 0.8 : 1), 380);
    const n = this.matched();
    this.R.later(0.42, () => {
      this.s.setRunes(n);
      if (n > before) sx.chime(n);
      if (n === P.dials.length) this.R.later(0.3, (out) => this.s.solve(out));
    });
    if (link >= 0 && !this.save.linkHint) { this.save.linkHint = 1; return [{ say: 'The drum next to it turned too.', key: 'link', cd: 20 }]; }
    return [];
  }
  update(dt) { this.busy -= dt; }
}

// ------------------------------------------------------------------ light beams
const BEAM_W = 0.035;
class Beams extends Puzzle {
  build() {
    const s = this.s, B = this.P.beam;
    this.save.mirrors ??= B.mirrors.map((m) => m.start);
    this.core = s.put(MD.sunCore(), B.src.a, B.y + 0.5, B.src.b, [1, 0], this.R.glowMat);
    this.items = B.mirrors.map((m, i) => {
      s.put(MD.mirrorPost(), m.a, 4, m.b);
      const pv = s.pivot(m.a, B.y + 0.5, m.b, [1, 0]);
      this.inPivot(pv, MD.mirrorHead());
      pv.rotation.y = this.yawFor(this.save.mirrors[i]);
      const pos = s.wp(m.a, B.y + 0.5, m.b);
      s.el(pos, 0.3, () => (this.save.open ? 'Crystal mirror' : 'Turn the mirror'), () => this.turn(i));
      return { pv, pos };
    });
    const sk = MD.socket();
    s.put(sk.base, B.recv.a, 4, B.recv.b);
    this.crys = s.put(sk.crystal, B.recv.a, 4 + 7 * 0.5, B.recv.b, [1, 0], this.R.dimMat);
    this.segs = [];
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    this.haloMat = new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
    this.box = new THREE.BoxGeometry(1, 1, 1);
    for (let k = 0; k < 8; k++) {
      const c = new THREE.Mesh(this.box, this.coreMat), h = new THREE.Mesh(this.box, this.haloMat);
      c.renderOrder = h.renderOrder = 12;
      c.visible = h.visible = false;
      s.group.add(c, h);
      this.segs.push([c, h]);
    }
    this.hum = this.R.sfx.hum();
    this.dirty = true;
    this.t = 0;
  }
  dispose() { super.dispose(); this.coreMat.dispose(); this.haloMat.dispose(); this.box.dispose(); }
  yawFor(k) { const a = Math.PI / 4 + (k * Math.PI) / 2; return yawOf(this.L, Math.cos(a), Math.sin(a)); }
  normal(k) { const a = Math.PI / 4 + (k * Math.PI) / 2; return [Math.cos(a), Math.sin(a)]; }
  progress() { return this.trace ? this.trace.lit : 0; }
  /** Follow the light from the crystal: mirrors turn it, their backs and the rock stop it. */
  run() {
    const B = this.P.beam, L = this.L, w = this.R.w;
    const pts = [], hits = [];
    let p = [B.src.a, B.src.b], d = B.src.dir.slice();
    let lit = 0, recv = false;
    pts.push(p);
    const els = B.mirrors.map((m, i) => ({ a: m.a, b: m.b, i })).concat([{ a: B.recv.a, b: B.recv.b, i: -1 }]);
    const yW = (L.CY + B.y + 0.5) / VOX;
    for (let bounce = 0; bounce < 8; bounce++) {
      let best = null, bt = 1e9;
      for (const e of els) {
        const ox = e.a - p[0], oz = e.b - p[1];
        const t = ox * d[0] + oz * d[1];
        if (t < 1) continue;
        const perp = Math.abs(ox * d[1] - oz * d[0]);
        if (perp < 0.75 && t < bt) { bt = t; best = e; }
      }
      // the rock (or something built in the way) stops it
      const start = toWorld(L, p[0] + d[0] * (bounce ? 2 : 3), B.y + 0.5, p[1] + d[1] * (bounce ? 2 : 3));
      const wd = [d[0] * L.F[0] + d[1] * L.Rv[0], d[0] * L.F[1] + d[1] * L.Rv[1]];
      const maxM = (best ? bt - (bounce ? 2 : 3) : 600) / VOX;
      const hit = w.raycast(start.x, yW, start.z, wd[0], 0, wd[1], Math.max(0.05, maxM), (m) => OPAQUE[m] === 1);
      if (hit) {
        const t = (bounce ? 2 : 3) + hit.dist * VOX;
        const q = [p[0] + d[0] * t, p[1] + d[1] * t];
        pts.push(q); hits.push({ q, wall: true });
        break;
      }
      if (!best) { const q = [p[0] + d[0] * 600, p[1] + d[1] * 600]; pts.push(q); break; }
      const q = [best.a, best.b];
      pts.push(q);
      if (best.i < 0) { recv = true; hits.push({ q, recv: true }); break; }
      const n = this.normal(this.save.mirrors[best.i]);
      const dot = d[0] * n[0] + d[1] * n[1];
      if (dot > -0.1) { hits.push({ q, back: true }); break; } // the dark back of the mirror
      d = [Math.round(d[0] - 2 * dot * n[0]), Math.round(d[1] - 2 * dot * n[1])];
      hits.push({ q, mirror: best.i });
      lit++;
      p = q;
    }
    return { pts, hits, lit, recv };
  }
  draw() {
    const tr = this.trace, B = this.P.beam, s = this.s;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    this.segs.forEach(([c, h], k) => {
      const p0 = tr.pts[k], p1 = tr.pts[k + 1];
      if (!p1) { c.visible = h.visible = false; return; }
      s.wp(p0[0], B.y + 0.5, p0[1], a); s.wp(p1[0], B.y + 0.5, p1[1], b);
      const len = a.distanceTo(b);
      for (const [m, wdt] of [[c, BEAM_W], [h, BEAM_W * 4]]) {
        m.visible = len > 0.01;
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.lookAt(b);
        m.scale.set(wdt, wdt, len);
      }
    });
  }
  turn(i) {
    if (this.save.open) return this.locked();
    if (this.busy > 0) return [];
    this.busy = 0.36;
    const pv = this.items[i].pv;
    this.save.mirrors[i] = (this.save.mirrors[i] + 1) % 4;
    const from = pv.rotation.y, dd = wrapPi(this.yawFor(this.save.mirrors[i]) - from);
    this.s.anim(0.32, (k) => { pv.rotation.y = from + dd * ease(k); }, () => { this.dirty = true; });
    this.R.sfx.grind(0.35, 0.3);
    setTimeout(() => this.R.sfx.click(1.3), 300);
    // while it turns the beam breaks off at it
    this.dirty = true;
    this.turning = i;
    return [];
  }
  update(dt, eye) {
    this.busy -= dt;
    this.t += dt;
    this.reT = (this.reT || 0) - dt;
    if (this.dirty || this.reT <= 0) {
      this.dirty = false;
      this.reT = 0.4;
      const before = this.trace?.lit ?? -1;
      this.trace = this.run();
      if (this.busy > 0 && this.turning !== undefined) {
        // the beam stops at the turning mirror
        const k = this.trace.hits.findIndex((h) => h.mirror === this.turning);
        if (k >= 0) { this.trace.pts.length = k + 2; this.trace.recv = false; }
      } else this.turning = undefined;
      this.draw();
      if (this.trace.lit !== before && !this.save.open) {
        this.s.setRunes(this.trace.lit);
        if (this.trace.lit > before && before >= 0) this.R.sfx.chime(this.trace.lit);
      }
      this.crys.material = this.trace.recv ? this.R.glowMat : this.R.dimMat;
      if (this.trace.recv && !this.save.open && this.busy <= 0) {
        this.R.sfx.chime(5);
        this.R.later(0.6, (out) => this.s.solve(out));
        this.busy = 2;
      }
    }
    // shimmer and sparkle
    const f = 0.85 + Math.sin(this.t * 31) * 0.08 + Math.sin(this.t * 7) * 0.07;
    this.coreMat.opacity = 0.9 * f;
    this.haloMat.opacity = 0.2 * f;
    const tr = this.trace;
    if (tr && Math.random() < dt * 14) {
      const k = Math.floor(Math.random() * (tr.pts.length - 1)), t = Math.random();
      const p0 = tr.pts[k], p1 = tr.pts[k + 1];
      if (p1) {
        const p = this.s.wp(p0[0] + (p1[0] - p0[0]) * t, this.P.beam.y + 0.5, p0[1] + (p1[1] - p0[1]) * t);
        if (p.distanceTo(eye) < 12) this.R.fx.mote(p.x, p.y + (Math.random() - 0.5) * 0.04, p.z, [1, 0.9, 0.6]);
      }
    }
    if (tr && Math.random() < dt * 6) for (const h of tr.hits) {
      const p = this.s.wp(h.q[0], this.P.beam.y + 0.5, h.q[1]);
      this.R.fx.glints(p.x, p.y, p.z, h.recv ? [0.7, 1, 1] : [1, 0.85, 0.5]);
    }
    const c = this.s.wp(this.P.beam.src.a, this.P.beam.y, this.P.beam.src.b);
    this.hum.set({ vol: Math.max(0.0001, 0.06 * (1 - Math.min(1, c.distanceTo(eye) / 9))) });
  }
  lights(eye, list) {
    const B = this.P.beam;
    const c = this.s.wp(B.src.a, B.y + 0.5, B.src.b);
    list.push({ x: c.x, y: c.y, z: c.z, c: [1.3, 1.05, 0.6], r: 4.5 });
    if (this.trace?.recv) { const r = this.s.wp(B.recv.a, B.y, B.recv.b); list.push({ x: r.x, y: r.y + 0.2, z: r.z, c: [0.6, 1.1, 1.3], r: 5 }); }
    else if (this.trace?.hits.length) {
      const h = this.trace.hits[this.trace.hits.length - 1], p = this.s.wp(h.q[0], B.y + 0.5, h.q[1]);
      list.push({ x: p.x, y: p.y, z: p.z, c: [0.9, 0.7, 0.35], r: 2.2 });
    }
  }
}

// ------------------------------------------------------------------ pressure plates
const SINK = 0.035;
class Plates extends Puzzle {
  build() {
    const s = this.s;
    this.items = this.P.plates.map((p) => {
      const pv = s.pivot(p.a, 0, p.b, [1, 0]);
      this.inPivot(pv, MD.plateSlab());
      const c = s.wp(p.a, 0, p.b);
      return { pv, c, half: p.h / VOX, down: false, k: this.save.open ? 1 : 0, vox: false };
    });
    this.voxT = 0;
  }
  progress() { return this.items ? this.items.filter((it) => it.down).length : 0; }
  weighed(it, pl) {
    const h = it.half - 0.04;
    // the mole standing on it
    if (pl && pl.grounded !== false && Math.abs(pl.pos.x - it.c.x) < h + 0.18 && Math.abs(pl.pos.z - it.c.z) < h + 0.18 && pl.pos.y > it.c.y - 0.12 && pl.pos.y < it.c.y + 0.16) return 'mole';
    // a clump of ore lying on it
    for (const c of this.R.owner?.clumps?.list || []) {
      if (c.state !== 'world') continue;
      if (Math.abs(c.pos.x - it.c.x) < h && Math.abs(c.pos.z - it.c.z) < h && c.pos.y - (c.r || 0.1) < it.c.y + 0.2 && c.pos.y > it.c.y - 0.2) return 'clump';
    }
    return it.vox ? 'block' : null;
  }
  update(dt, eye, out) {
    if (!this.items) return;
    const pl = this.R.player, s = this.s;
    this.voxT -= dt;
    if (this.voxT <= 0) {
      this.voxT = 0.25;
      // something built or fallen on it (any solid voxel in the pit or just above)
      for (const it of this.items) {
        let solid = false;
        for (const [dx, dz] of [[0, 0], [-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
          for (const dy of [-0.03, 0.03]) {
            const m = this.R.w.voxelAt(Math.floor((it.c.x + dx) * VOX), Math.floor((it.c.y + dy) * VOX), Math.floor((it.c.z + dz) * VOX));
            if (m && OPAQUE[m] === 1) solid = true;
          }
        }
        it.vox = solid;
      }
    }
    let n = 0, changed = false;
    for (const it of this.items) {
      const w = this.save.open ? 'open' : this.weighed(it, pl);
      const down = !!w;
      if (down !== it.down) {
        it.down = down;
        changed = true;
        if (!this.save.open) { this.R.sfx.grind(0.3, 0.2); this.R.sfx.click(down ? 0.8 : 1.1); }
        if (down && w === 'mole' && !this.save.plateHint) { this.save.plateHint = 1; out.push({ say: 'The plate sinks under your weight... and the others stay up. Something heavy to hold them down?', key: 'plate', cd: 20 }); }
      }
      it.k += ((down ? 1 : 0) - it.k) * Math.min(1, dt * 14);
      it.pv.position.y = it.c.y - it.k * SINK;
      if (down) n++;
    }
    if (changed && !this.save.open) {
      s.setRunes(n);
      if (n === this.items.length) { this.R.sfx.chime(4); this.R.later(0.4, (o) => this.s.solve(o)); }
    }
  }
}

// ------------------------------------------------------------------ the drain valve
class Valve extends Puzzle {
  build() {
    const s = this.s, V = this.P.valve;
    s.put(MD.valveMount(), V.a, V.y, V.b, V.face);
    this.pv = s.pivot(V.a + V.face[0] * 2.6, V.y, V.b + V.face[1] * 2.6, V.face);
    this.inPivot(this.pv, MD.valveWheel());
    const pos = s.wp(V.a + V.face[0] * 3, V.y, V.b + V.face[1] * 3);
    s.el(pos, 0.34, () => (this.save.drained ? 'Drain wheel (open)' : 'Turn the wheel'), () => this.turn());
    // the winch rope and its bucket, down the shaft
    const W = this.P.winch;
    s.put(MD.rope(W.len / VOX), 0.5, W.y, 0.5, [1, 0]);
    s.put(MD.bucket(), 0.5, W.y - W.len - 5, 0.5, [1, 0]);
    this.cols = null;
  }
  progress() { return this.save.drained ? 2 : 0; }
  turn() {
    if (this.save.drained) return [{ say: 'The wheel won\'t turn any further. The water has gone.', key: 'valve', cd: 3 }];
    if (this.busy > 0 || this.draining) return [];
    this.busy = 2.4;
    const from = this.pv.rotation.z;
    this.s.anim(2.2, (k) => { this.pv.rotation.z = from - ease(k) * Math.PI * 3; });
    const sx = this.R.sfx;
    sx.creak(); setTimeout(() => sx.creak(), 700); setTimeout(() => sx.grind(0.6, 0.8), 1200);
    this.R.later(2.0, (out) => this.startDrain(out));
    return [];
  }
  columns() {
    if (this.cols) return this.cols;
    const P = this.P, cols = [];
    for (let a = -P.RS - 1; a <= P.RS; a++) for (let b = -P.RS - 1; b <= P.RS; b++) if (Math.hypot(a + 0.5, b + 0.5) < P.RS) cols.push([a, b]);
    for (let a = P.RS - 3; a < P.gal.a1; a++) for (let b = -P.GW; b < P.GW; b++) if (Math.hypot(a + 0.5, b + 0.5) >= P.RS) cols.push([a, b]);
    return (this.cols = cols);
  }
  startDrain(out) {
    this.draining = true;
    this.level = -this.P.DD + this.P.GH + 1;
    this.layerT = 0;
    this.loop = this.R.sfx.water();
    out.push({ say: 'Somewhere below, the old drain opens. The water begins to sink.', key: 'drain', tone: 'good', cd: 5 });
  }
  update(dt, eye, out) {
    this.busy -= dt;
    if (!this.draining) return;
    this.layerT -= dt;
    const P = this.P;
    const near = this.s.wp(0.5, -P.DD + P.WL, 0.5).distanceTo(eye) < 16;
    this.loop?.set({ vol: near ? 0.35 : 0.1 });
    if (Math.random() < dt * 20) {
      const p = this.s.wp((Math.random() - 0.5) * 6, Math.max(this.level, -P.DD) + 0.5, (Math.random() - 0.5) * 6);
      this.R.fx.bubble?.(p.x, p.y, p.z, 0.8);
      if (Math.random() < 0.15) this.R.sfx.gurgle();
    }
    if (this.layerT > 0) return;
    this.layerT = 0.14;
    const w = this.R.w;
    for (const [a, b] of this.columns()) if (this.s.vox(a, this.level, b) === M.WATER) this.s.setVox(a, this.level, b, 0);
    const swirl = this.s.wp(0.5, this.level, 0.5);
    this.R.fx.splash?.(swirl.x, swirl.y, swirl.z, 0.4);
    void w;
    this.level--;
    if (this.level < -P.DD) {
      // a last sweep for anything that flowed back
      for (let y = -P.DD; y < -P.DD + P.GH + 1; y++) for (const [a, b] of this.columns()) if (this.s.vox(a, y, b) === M.WATER) this.s.setVox(a, y, b, 0);
      this.draining = false;
      this.loop?.stop?.(1.5);
      this.loop = null;
      this.save.drained = 1;
      this.s.setRunes(2);
      this.R.later(0.6, (o) => this.s.solve(o));
    }
  }
}

export const PUZZLES = { levers: Levers, switch: Switch, dials: Dials, beams: Beams, plates: Plates, valve: Valve };
