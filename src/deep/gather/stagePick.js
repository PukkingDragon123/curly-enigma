// The berry bush close-up: a twiggy bush with its berries (ripe red, sour green) as separate little
// meshes, a golden ring that closes on one berry at a time (green for the sour ones: leave those),
// and the paw that reaches, pinches and plucks; perfect picks sparkle, early or late ones squish.
import * as THREE from 'three';
import { Stage } from './stage.js';
import { PGrid, voxGeo, mesh, ringMesh } from './gfx.js';
import { hv, shade, mixc } from '../props/grid.js';

const S = 1 / 64;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function berryGeo(col, glow) {
  const g = new PGrid(8, 9, 8);
  g.ell(4, 4, 4, 3.4, 3.4, 3.4, (x, y, z, dx, dy, dz) => (dx < -0.25 && dy > 0.35 && dz > 0 ? 0xffffff : dy > 0.25 ? shade(col, 1.12) : dy < -0.5 ? shade(col, 0.72) : col), glow);
  g.set(4, 7, 4, 0x3a5a22); g.set(4, 8, 4, 0x5a3a1c); g.set(3, 7, 4, 0x4a7a2a);
  return voxGeo(g, { pivot: [4, 4, 4], scale: S * 0.42, ao: false });
}

export class PickStage extends Stage {
  constructor(ctx, at, id, spec, sim, o = {}) {
    super(ctx, at, o);
    this.id = id; this.spec = spec; this.sim = sim;
    this.base0 = this.surfaceY(0, 0);
    this.plant = new THREE.Group();
    this.plant.position.y = this.base0;
    this.root.add(this.plant);
    // the bush: twigs and leaf clumps, a little mounded soil at its foot
    const g = new PGrid(40, 34, 40);
    const leaf = shade(spec.col?.leaf ?? 0x4e8a3a, 0.72), stem = spec.col?.stem ?? 0x6a4a2a;
    const r = this.r;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.5, R = 6 + r() * 9, H = 14 + r() * 14;
      g.line(20, 0, 20, 20 + Math.cos(a) * R, H, 20 + Math.sin(a) * R, stem, 0, 0.6);
    }
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 3 + r() * 13, y = 8 + r() * 22;
      const x = 20 + Math.cos(a) * d, z = 20 + Math.sin(a) * d;
      g.ell(x, y, z, 2.6, 1.6, 2.6, (xx, yy, zz) => (hv(xx, yy, zz, 3) < 0.18 ? shade(leaf, 1.3) : hv(xx, yy, zz, 4) < 0.55 ? leaf : shade(leaf, 0.72)));
    }
    g.ell(20, 0, 20, 7, 2, 7, (x, y, z) => (hv(x, y, z, 7) < 0.5 ? 0x4c3422 : 0x5a3c28));
    const bushGeo = voxGeo(g, { pivot: [20, 0, 20], scale: S });
    this.geos.push(bushGeo);
    this.bush = this.occlude(mesh(bushGeo, this.mat, this.plant));
    this.bushH = 30 * S;
    // the berries: on the bush's skin, mostly on the side facing us
    const ripeG = berryGeo(spec.ripe ?? 0xd02a40, 1), greenG = berryGeo(0x6a9a3a, 0);
    this.geos.push(ripeG, greenG);
    this.berries = [];
    const n = sim.berries.length;
    for (let i = 0; i < n; i++) {
      // a loose grid over the front of the bush, sitting on its leafy skin
      const col = i % 4, row = Math.floor(i / 4);
      const x = (col / 3 - 0.5) * 0.24 + (r() - 0.5) * 0.04 + (row % 2) * 0.03;
      const y = 0.15 + row * 0.085 + (r() - 0.5) * 0.03;
      const z = Math.sqrt(Math.max(0, 0.23 * 0.23 - x * x)) * 0.9 + 0.012;
      const pos = new THREE.Vector3(x, y, z);
      const m = mesh(sim.berries[i].ripe ? ripeG : greenG, this.mat, this.plant);
      m.position.copy(pos);
      this.berries.push({ m, pos: pos.clone(), state: 'on', t: 0, vel: new THREE.Vector3() });
    }
    // what you carry away: a handful of the picked berries (shown once it's over)
    this.hand = new THREE.Group();
    this.hand.visible = false;
    this.root.add(this.hand);
    this.ripeG = ripeG;
    // the timing ring
    this.ring = ringMesh(0xffe066);
    this.root.add(this.ring);
    this.ring.visible = false;
    this.reachP = new THREE.Vector3(0.05, 0.22, 0.24);
    this.pinch = 0;
  }

  update(dt, vis, cam) {
    this.updateBase(dt, cam);
    const sim = this.sim, B = sim.beat;
    // berries: a little sway; plucked ones fly off, squashed ones flatten
    for (let i = 0; i < this.berries.length; i++) {
      const b = this.berries[i], st = sim.berries[i]?.state;
      b.t += dt;
      if (b.state === 'on' && st === 'picked') { b.state = 'fly'; b.t = 0; b.vel.set(0.25, 0.9, 0.5); }
      if (b.state === 'on' && st === 'squashed') { b.state = 'squash'; b.t = 0; }
      if (b.state === 'on') {
        b.m.position.copy(b.pos);
        b.m.position.x += Math.sin(this.t * 1.7 + i) * 0.002;
        const hot = B && B.i === i ? 1 : 0;
        b.m.scale.setScalar(1 + hot * (0.12 + Math.sin(this.t * 14) * 0.04));
      } else if (b.state === 'fly') {
        b.vel.y -= 4 * dt;
        b.m.position.addScaledVector(b.vel, dt);
        b.m.scale.setScalar(Math.max(0.001, 1 - b.t * 1.6));
      } else if (b.state === 'squash') {
        b.m.scale.set(1.5, Math.max(0.15, 1 - b.t * 6), 1.5);
        b.m.position.y = b.pos.y - Math.min(0.012, b.t * 0.06);
      }
    }
    // the ring closing on the berry in play
    const ring = this.ring;
    if (B && sim.berries[B.i]?.state === 'on') {
      const b = this.berries[B.i];
      ring.visible = true;
      ring.position.copy(b.m.position);
      const u = clamp(B.u, 0, 1.4);
      const rr = 0.016 * (1 + Math.max(0, 1 - u) * 3.2);
      ring.scale.set(rr, rr, 1);
      const near = Math.abs(B.t - B.dur) < 0.09;
      ring.material.uniforms.uCol.value.set(!B.ripe ? 0x8ad06a : near ? 0xffffff : 0xffd040);
      ring.material.uniforms.uW.value = near ? 0.3 : 0.18;
      ring.material.uniforms.uFill.value = near && B.ripe ? 1 : 0;
      ring.material.uniforms.uDash.value = B.ripe ? 0 : 1;
      ring.material.uniforms.uA.value = u > 1 ? Math.max(0, 1 - (u - 1) * 4) : 1;
      this.reachP.lerp(_v.copy(b.m.position).add(_v2.set(0.035, -0.005, 0.03)), 1 - Math.exp(-dt * 10));
    } else ring.visible = false;
    this.pinch = Math.max(0, this.pinch - dt * 4);
  }

  onEvent(e) {
    const b = e.i !== undefined ? this.berries[e.i] : null;
    const p = b ? b.m.position : null;
    switch (e.type) {
      case 'pick':
        this.pinch = 1;
        this.sparkle(p.x, this.base0 + p.y, p.z, e.perfect ? 12 : 5, e.perfect ? [1, 0.9, 0.4] : [1, 0.75, 0.75], 0.5);
        this.word(e.perfect ? (e.streak > 2 ? `Perfect ×${e.streak}` : 'Perfect!') : 'Good', e.perfect ? '#ffe066' : '#fff4d8', p.x, this.base0 + p.y + 0.04, p.z);
        break;
      case 'squash': {
        this.pinch = 1;
        const fx = this.ctx.fx;
        this.toWorld(_v.set(p.x, this.base0 + p.y, p.z), _v2);
        const c = e.ripe ? [0.7, 0.08, 0.15] : [0.55, 0.75, 0.3];
        for (let i = 0; i < 14; i++) fx?.spawn({ x: _v2.x, y: _v2.y, z: _v2.z, vx: (Math.random() - 0.5) * 0.8, vy: Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.8, life: 0.5 + Math.random() * 0.4, size: 0.004 + Math.random() * 0.005, color: c, alpha: 1, drag: 1, grav: 6, bounce: 0.2, fade: false });
        this.word(e.ripe ? (e.early ? 'Too soon!' : 'Too late!') : 'Not ripe!', e.ripe ? '#ff9a8a' : '#c8f08a', p.x, this.base0 + p.y + 0.04, p.z);
        break;
      }
      case 'miss': this.word('Missed', '#d8c8b0', p.x, this.base0 + p.y + 0.04, p.z); break;
      case 'leave': this.word('Left it ✓', '#c8f08a', p.x, this.base0 + p.y + 0.04, p.z); break;
      case 'pop': {
        // the picked berries gather into a handful at the paw
        const n = Math.min(9, this.sim.picked);
        for (let i = 0; i < n; i++) {
          const m = mesh(this.ripeG, this.mat, this.hand);
          const a = i * 2.4, rr = i ? 0.017 + (i % 3) * 0.006 : 0;
          m.position.set(Math.cos(a) * rr, Math.floor(i / 4) * 0.014 - 0.006, Math.sin(a) * rr);
          m.rotation.set(i * 0.7, i * 1.3, 0);
          this.occlude(m);
        }
        this.hand.position.copy(this.reachP).add(this.plant.position);
        this.hand.visible = n > 0;
        this.bushPlant = this.plant;
        this.plant = this.hand;
        this.keepOut = [this.bushPlant]; // the bush goes with the harvest
        this.sparkle(this.hand.position.x, this.hand.position.y, this.hand.position.z, 14, [1, 0.9, 0.5], 0.6);
        break;
      }
    }
  }

  pawTargets(o) {
    if (this.bushPlant) {
      // the handful rests in a cupped paw
      const down = this.dirWorld(new THREE.Vector3(0, -1, 0));
      const pos = this.gripWorld(new THREE.Vector3());
      return { R: { pos, up: down, fwd: this.dirWorld(new THREE.Vector3(-0.3, 0.25, -1).normalize()), fist: false, cradle: 0.7 }, L: null };
    }
    const R = { pos: this.gripWorld(new THREE.Vector3()), up: this.dirWorld(new THREE.Vector3(0, 1, 0)), fwdView: [-1, -0.08, -0.55], fist: this.pinch > 0.3, hover: true };
    return { R, L: null };
  }
  gripWorld(out = new THREE.Vector3()) {
    if (this.bushPlant) { this.hand.updateMatrixWorld(); return this.hand.localToWorld(out.set(0, -0.022, 0)); }
    this.plant.updateMatrixWorld(); return this.plant.localToWorld(out.copy(this.reachP));
  }
  headWorld(out = new THREE.Vector3()) { return this.toWorld(out.set(0, this.base0 + this.bushH * 0.6, 0)); }
  middle(out = new THREE.Vector3()) { return this.bushPlant ? out.set(0, 0, 0) : out.set(0, this.bushH * 0.5, 0); }
  showSize() { return this.bushPlant ? { span: 0.16, w: 0.14 } : { span: this.bushH, w: 0.3 }; }
  focus() { return { at: new THREE.Vector3(0, this.base0 + this.bushH * 0.5, 0), h: this.bushH + 0.06, w: 0.3 }; }
}
