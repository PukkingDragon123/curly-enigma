// The dig close-up (truffles, grubs): a heap of loose soil with the find buried in it. The open
// paw scrubs side to side and the clods fly off the heap (the top first) until the find shows,
// then the paw closes on it and eases it out (a grub wriggles in the paw).
import * as THREE from 'three';
import { Stage } from './stage.js';
import { PGrid, voxGeo, mesh } from './gfx.js';
import { hv, shade } from '../props/grid.js';

const S = 1 / 96;
const _v = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOutBack = (t) => { t = clamp(t, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

function truffleGeo(spec) {
  const g = new PGrid(12, 11, 12);
  const C = spec.col;
  g.ell(6, 5, 6, 4.6, 4.2, 4.4, (x, y, z, dx, dy) => {
    const bump = hv(x >> 1, y >> 1, z >> 1, 11);
    if (bump < 0.18) return -1;
    return dy > 0.4 && bump > 0.7 ? C.hi : bump > 0.55 ? shade(C.body, 1.15) : C.body;
  });
  g.ell(6, 5, 6, 3.8, 3.6, 3.8, () => shade(C.body, 0.85));
  return voxGeo(g, { pivot: [6, 5, 6], scale: S * 0.8 });
}
/** A grub: a curl of segments built straight; the stage bends it by rotating segments. */
function grubSegs(spec) {
  const C = spec.col;
  const out = [];
  for (let i = 0; i < 7; i++) {
    const g = new PGrid(8, 8, 6);
    const head = i === 6;
    const r = head ? 2.6 : 3.2 - Math.abs(i - 3) * 0.25;
    g.ell(4, 4, 3, r, r, 2.4, (x, y, z, dx, dy) => (head ? (dy > 0.2 ? shade(C.head, 1.2) : C.head) : dy > 0.5 ? C.hi : z === 0 || z === 5 ? shade(C.body, 0.85) : C.body));
    if (head) { g.set(2, 5, 5, 0x1a1008); g.set(6, 5, 5, 0x1a1008); }
    out.push(voxGeo(g, { pivot: [4, 4, 3], scale: S * 0.75 }));
  }
  return out;
}

export class DigStage extends Stage {
  constructor(ctx, at, id, spec, sim, o = {}) {
    super(ctx, at, o);
    this.id = id; this.spec = spec; this.sim = sim;
    this.base0 = this.surfaceY(0, 0);
    this.buildHole(0.075);
    this.hole.scale.setScalar(1);
    // the heap: clods piled into a mound; the top ones go first
    this.buildSoil({ r0: 0.0, r1: 0.12, n: 230, mound: 0.06, dark: 0.45 });
    // heaped up: a dome of loose clods over the find
    for (const c of this.clods) {
      const dome = Math.max(0, 1 - (c.R / 0.11) ** 2);
      c.rest.y += dome * 0.055 * (0.35 + c.k * 0.65);
    }
    this.writeClods();
    for (const c of this.clods) {
      c.th = clamp(1 - (c.rest.y - this.base0) / 0.09 + (c.k - 0.5) * 0.25 - c.near * 0.1, 0.06, 0.95);
      c.swept = false;
    }
    this.plant = new THREE.Group();
    this.plant.position.y = this.base0 - 0.012;
    this.root.add(this.plant);
    if (id === 'grub') {
      this.segs = grubSegs(spec).map((g, i) => { this.geos.push(g); const m = this.occlude(mesh(g, this.mat, this.plant)); return m; });
    } else {
      const g = truffleGeo(spec);
      this.geos.push(g);
      this.item = this.occlude(mesh(g, this.mat, this.plant));
      this.item.position.y = 0.02;
    }
    this.lift = 0;
    this.popT = -1;
    this.scrub = 0;
    this.pose(0);
  }

  pose(dt) {
    if (this.segs) {
      // a grub curled in a C, wriggling (harder when you tug it)
      const w = Math.sin(this.t * 9) * (0.25 + (this.sim.wasGrip ? 0.25 : 0)) + (this.sim.phase === 'pull' ? Math.sin(this.t * 4) * 0.2 : 0);
      let a = -1.1, x = -0.024, y = 0.018;
      for (let i = 0; i < this.segs.length; i++) {
        const m = this.segs[i];
        a += 0.36 + w * (i % 2 ? 0.08 : -0.08);
        x += Math.cos(a) * 0.0078; y += Math.sin(a) * 0.0052;
        m.position.set(x, y + 0.003, Math.sin(a) * 0.005);
        m.rotation.set(0, -a * 0.5, a * 0.4);
      }
    } else this.item.rotation.y = Math.sin(this.t * 0.7) * 0.2;
  }

  update(dt, vis, cam) {
    this.updateBase(dt, cam);
    const sim = this.sim;
    // clods swept off as the cover goes
    const cleared = 1 - clamp(sim.cover ?? 0, 0, 1);
    for (const c of this.clods) {
      if (c.swept || c.th > cleared) continue;
      c.swept = true;
      c.flying = true; c.settled = false;
      const side = Math.sign(sim.wx || (Math.random() - 0.5)) || 1;
      c.vel.set(side * (0.5 + Math.random() * 0.6) + c.rest.x * 3, 0.6 + Math.random() * 0.7, c.rest.z * 3 + (Math.random() - 0.3) * 0.3);
      c.spin.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 12);
    }
    this.soilPose(dt, { hole: 0.07 });
    // the find rises as you ease it out, then pops
    let liftT = sim.phase === 'pull' ? Math.pow(clamp(sim.prog ?? 0, 0, 1), 1.4) * 0.03 + (sim.pv ?? 0) * 0.006 : 0;
    if (this.popT >= 0) { this.popT += dt; liftT = this.lift0 + (0.09 - this.lift0) * easeOutBack(this.popT / 0.4); this.lift = liftT; } else this.lift += (liftT - this.lift) * (1 - Math.exp(-dt * 12));
    this.plant.position.y = this.base0 - 0.012 + this.lift;
    this.scrub += ((sim.phase === 'dig' && sim.wasGrip ? sim.wx || 0 : 0) - this.scrub) * (1 - Math.exp(-dt * 18));
    this.pose(dt);
    this.mat.uniforms.uTintK.value = (sim.strain ?? 0) > 0.3 ? (sim.strain - 0.3) * 0.6 * (0.6 + 0.4 * Math.sin(this.t * 28)) : this.flashT > 0 ? this.flashT : 0;
    this.flashT = Math.max(0, (this.flashT || 0) - dt * 3);
  }

  onEvent(e) {
    switch (e.type) {
      case 'wiggle': if (e.dig) { this.dirt(this.scrub * 0.06, this.base0 + 0.04, 0.02, 5, 0.6); this.dust(0, this.base0 + 0.03, 0, 1, 0.06); } break;
      case 'exposed': this.word(this.id === 'grub' ? 'There it is!' : 'Uncovered!', '#ffe066', 0, this.base0 + 0.1, 0); this.sparkle(0, this.base0 + 0.03, 0, 8, [1, 0.9, 0.5], 0.4); break;
      case 'pop':
        this.popT = 0; this.lift0 = this.lift; this.flashT = 0.6;
        this.dirt(0, this.base0 + 0.02, 0, 22, 1.1);
        this.sparkle(0, this.base0 + 0.06, 0, 12, [1, 0.9, 0.45], 0.7);
        break;
      case 'snap': this.flashT = 0.5; this.dirt(0, this.base0 + 0.02, 0, 10, 0.6, this.spec.col.body); break;
    }
  }

  pawTargets(o) {
    const sim = this.sim, up = this.dirWorld(new THREE.Vector3(0, 1, 0));
    if (sim.phase === 'dig' && !sim.done) {
      // the open paw scrubbing over the heap, claws first
      const pos = this.toWorld(new THREE.Vector3(this.scrub * 0.06, this.base0 + 0.05 + (1 - (1 - (sim.cover ?? 1))) * 0.02, 0.05));
      const fwd = this.dirWorld(new THREE.Vector3(-this.scrub * 0.3, -0.35, -1).normalize());
      return { R: { pos, up, fwd, fist: false }, L: null };
    }
    if (o.held) {
      // out: it rests in the open paw, held up
      const pos = this.plant.localToWorld(new THREE.Vector3(0, -0.012, 0));
      return { R: { pos, up: this.dirWorld(new THREE.Vector3(0, -1, 0)), fwd: this.dirWorld(new THREE.Vector3(-0.3, 0.25, -1).normalize()), fist: false }, L: null };
    }
    return { R: { pos: this.gripWorld(new THREE.Vector3()), up, fwdView: [-1, -0.08, -0.55], fist: o.gripping, hover: true }, L: null };
  }
  /** The paw closes on it from above and behind (so it shows in front of the claws). */
  gripWorld(out = new THREE.Vector3()) { this.plant.updateMatrixWorld(); return this.plant.localToWorld(out.set(0.008, 0.05, -0.022)); }
  headWorld(out = new THREE.Vector3()) { return this.gripWorld(out); }
  middle(out = new THREE.Vector3()) { return out.set(0, 0.02, 0); }
  showSize() { return { span: 0.26, w: 0.24 }; }
  focus() { return { at: new THREE.Vector3(0, this.base0 + 0.04, 0), h: 0.3, w: 0.44 }; }
}
