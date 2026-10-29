// The nest close-up (dino eggs): a ring of twigs and straw with the egg in it. Both paws cup the
// egg's sides and lift it slowly; it wobbles (lean against it) and, tipped too far, it clunks back
// into the nest with a crack in its shell.
import * as THREE from 'three';
import { Stage } from './stage.js';
import { PGrid, voxGeo, mesh } from './gfx.js';
import { hv, shade } from '../props/grid.js';

const S = 1 / 96;
const _v = new THREE.Vector3();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function nestGeo(seed) {
  const g = new PGrid(44, 14, 44);
  let h = seed * 9301 + 49297;
  const r = () => ((h = (h * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, R = 13 + r() * 6, y = 1 + r() * 9;
    const x = 22 + Math.cos(a) * R, z = 22 + Math.sin(a) * R;
    const b = a + (r() - 0.5) * 1.6, L = 6 + r() * 6;
    g.line(x, y, z, x + Math.cos(b + 1.57) * L, y + (r() - 0.5) * 3, z + Math.sin(b + 1.57) * L, r() < 0.5 ? 0x8a6a3a : r() < 0.5 ? 0x6a4a2a : 0xa07a44, 0, 0.6);
  }
  // straw and down inside
  g.ell(22, 2, 22, 13, 2.5, 13, (x, y, z) => (hv(x, y, z, 5) < 0.3 ? 0xd8c890 : hv(x, y, z, 6) < 0.5 ? 0xb8a060 : 0x9a8048));
  return voxGeo(g, { pivot: [22, 0, 22], scale: S * 1.15 });
}
function eggGeo(spec) {
  const C = spec.col;
  const g = new PGrid(16, 22, 16);
  g.ell(8, 11, 8, 6.6, 9.6, 6.6, (x, y, z, dx, dy, dz) => {
    const lit = -dx * 0.6 + dy * 0.7 + dz * 0.2;
    if (hv(x >> 1, y >> 1, z >> 1, 31) < 0.12) return shade(C.spot, 0.85);
    if (hv(x, y, z, 32) < 0.04) return shade(C.spot, 1.2);
    return lit > 0.75 ? shade(C.shell, 1.08) : lit > 0.1 ? shade(C.shell, 0.86) : shade(C.shell, 0.68);
  });
  return voxGeo(g, { pivot: [8, 1.5, 8], scale: S });
}
function crackGeo(n, seed) {
  // a jagged dark crack drawn on the shell's front
  const g = new PGrid(16, 22, 16);
  let x = 8 + (seed % 3) - 1, y = 14 - n * 2;
  for (let k = 0; k < 9; k++) {
    const dx = x - 8, dy = (y - 11) / 9.6 * 6.6;
    const z = 8 + Math.sqrt(Math.max(0, 6.6 * 6.6 - dx * dx - dy * dy)) - 0.2;
    g.set(x, y, z, 0x2a2018);
    x += k % 2 ? 1 : -1; y -= 1;
  }
  return voxGeo(g, { pivot: [8, 1.5, 8], scale: S, ao: false });
}

export class LiftStage extends Stage {
  constructor(ctx, at, id, spec, sim, o = {}) {
    super(ctx, at, o);
    this.id = id; this.spec = spec; this.sim = sim;
    this.base0 = this.surfaceY(0, 0);
    const ng = nestGeo(this.seed);
    this.geos.push(ng);
    this.nest = mesh(ng, this.mat, this.root);
    this.nest.position.y = this.base0;
    this.keepOut = [this.nest];
    this.mat.uniforms.uExpo.value = 0.62; // a pale shell right under the lamp
    this.plant = new THREE.Group();
    this.root.add(this.plant);
    const eg = eggGeo(spec);
    this.geos.push(eg);
    this.egg = this.occlude(mesh(eg, this.mat, this.plant));
    this.cracks = [0, 1, 2].map((i) => { const g = crackGeo(i, this.seed + i); this.geos.push(g); const m = mesh(g, this.mat, this.egg); m.visible = false; return m; });
    this.h = 0; this.tilt = 0;
    this.eggH = 20 * S;
    this.pose();
  }
  pose() {
    this.plant.position.set(0, this.base0 + 0.025 + this.h * 0.2, 0);
    this.plant.rotation.set(0, 0, -this.tilt * 0.55);
  }
  update(dt, vis, cam) {
    this.updateBase(dt, cam);
    const sim = this.sim;
    const hT = sim.done && !sim.done.broke ? 1.05 : sim.h ?? 0;
    this.h += (hT - this.h) * (1 - Math.exp(-dt * 14));
    this.tilt += ((sim.tilt ?? 0) - this.tilt) * (1 - Math.exp(-dt * 16));
    this.pose();
    for (let i = 0; i < 3; i++) this.cracks[i].visible = (sim.cracks ?? 0) > i;
    this.flashT = Math.max(0, (this.flashT || 0) - dt * 3);
    this.mat.uniforms.uTintK.value = this.flashT;
    if (Math.abs(sim.tilt ?? 0) > 0.7 && Math.random() < dt * 6) this.dust(0, this.base0 + 0.02, 0, 1, 0.1);
  }
  onEvent(e) {
    switch (e.type) {
      case 'crack': this.flashT = 0.5; this.word('Crack!', '#ff9a8a', 0, this.base0 + 0.2, 0, true); this.dirt(0, this.base0 + 0.05, 0, 8, 0.5, this.spec.col.shell); break;
      case 'pop': this.sparkle(0, this.base0 + 0.25, 0, 14, [1, 0.92, 0.6], 0.7); break;
    }
  }
  pawTargets(o) {
    const c = this.plant.localToWorld(new THREE.Vector3(0, this.eggH * 0.45, 0));
    const right = this.dirWorld(new THREE.Vector3(1, 0, 0)).applyAxisAngle(this.at.toward, -this.tilt * 0.55);
    const fwd = this.dirWorld(new THREE.Vector3(0, 0.6, -1).normalize());
    const R = { pos: c.clone().addScaledVector(right, 0.085), up: right.clone(), fwd, fist: false };
    const L = { pos: c.clone().addScaledVector(right, -0.085), up: right.clone().negate(), fwd, fist: false };
    return { R, L };
  }
  gripWorld(out = new THREE.Vector3()) { this.plant.updateMatrixWorld(); return this.plant.localToWorld(out.set(0, this.eggH * 0.45, 0)); }
  headWorld(out = new THREE.Vector3()) { return this.gripWorld(out); }
  middle(out = new THREE.Vector3()) { return out.set(0, this.eggH * 0.5, 0); }
  showSize() { return { span: 0.42, w: 0.36 }; }
  focus() { return { at: new THREE.Vector3(0, this.base0 + 0.12, 0), h: 0.32, w: 0.4 }; }
}
