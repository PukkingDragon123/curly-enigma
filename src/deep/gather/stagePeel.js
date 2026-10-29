// The wall-mat close-up (glow moss, sparkmoss): the mat as a sheet of little tiles on the rock;
// the paw grips its right edge and peels it back over itself toward the left (a curl that rolls
// along the rock), the other paw braces on the wall. Too fast and it rips (tiles tear off and
// fall); sparkmoss crackles blue before it zaps.
import * as THREE from 'three';
import { Stage } from './stage.js';
import { PGrid, voxGeo, mesh, lin } from './gfx.js';
import { hv, shade } from '../props/grid.js';

const T = 0.0155; // tile size (m)
const RC = 0.022; // curl radius
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1), _q2 = new THREE.Quaternion();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** A tuft of moss (a unit tile, lumpy on top, darker roots under): instance colour tints it. */
function tileGeo(seed, glow) {
  const g = new PGrid(4, 4, 3);
  let h = seed * 9301 + 49297;
  const r = () => ((h = (h * 9301 + 49297) % 233280) / 233280);
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    g.set(x, y, 0, 0x8a7a6a, 0);
    const top = r() < 0.65 ? 2 : 1;
    for (let z = 1; z <= top; z++) g.set(x, y, z, z === top && r() < 0.3 ? 0xffffff : 0xd8d8d8, glow && z === top && r() < 0.4 ? glow : glow ? 1 : 0);
  }
  return voxGeo(g, { pivot: [2, 2, 0], scale: 0.25, ao: true });
}

export class PeelStage extends Stage {
  constructor(ctx, at, id, spec, sim, o = {}) {
    super(ctx, at, o);
    this.id = id; this.spec = spec; this.sim = sim;
    this.base0 = 0;
    this.plant = new THREE.Group();
    this.root.add(this.plant);
    const C = spec.col;
    // the mat: an uneven oval of tiles, two shades and glowing specks
    const cols = 22, rows = 15;
    this.cols = cols; this.rows = rows;
    const tiles = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const dx = (c + 0.5 - cols / 2) / (cols / 2), dy = (r + 0.5 - rows / 2) / (rows / 2);
      const d = dx * dx + dy * dy;
      if (d > 1 || hv(c, r, 3, 17) < d * 0.3) continue;
      const spark = hv(c, r, 5, 19) < 0.12;
      tiles.push({ c, r, x: (c + 0.5 - cols / 2) * T, y: (r + 0.5 - rows / 2) * T, spark, th: 0.004 + hv(c, r, 1, 2) * 0.004, k: hv(c, r, 2, 3), state: 'on', vel: new THREE.Vector3(), off: new THREE.Vector3(), rot: new THREE.Euler() });
    }
    this.tiles = tiles;
    this.xMin = Math.min(...tiles.map((t) => t.x)) - T / 2;
    this.xMax = Math.max(...tiles.map((t) => t.x)) + T / 2;
    const gA = tileGeo(this.seed, 1), gS = tileGeo(this.seed + 1, 3);
    this.geos.push(gA, gS);
    const plain = tiles.filter((t) => !t.spark), sparks = tiles.filter((t) => t.spark);
    this.imA = new THREE.InstancedMesh(gA, this.mat, plain.length);
    this.imS = new THREE.InstancedMesh(gS, this.mat, Math.max(1, sparks.length));
    const col = new THREE.Color();
    plain.forEach((t, i) => { const h = lin(shade(t.k < 0.5 ? C.a : C.b, 0.95 + t.k * 0.35)); col.setRGB(h[0], h[1], h[2]); this.imA.setColorAt(i, col); t.im = this.imA; t.i = i; });
    sparks.forEach((t, i) => { const h = lin(C.spark); col.setRGB(h[0], h[1], h[2]); this.imS.setColorAt(i, col); t.im = this.imS; t.i = i; });
    for (const im of [this.imA, this.imS]) { im.frustumCulled = false; if (im.instanceColor) im.instanceColor.needsUpdate = true; this.plant.add(im); }
    // the bare rock under it: a damp stain revealed as it comes away
    const g = new PGrid(cols * 2 + 2, rows * 2 + 2, 1);
    for (let y = 0; y < rows * 2 + 2; y++) for (let x = 0; x < cols * 2 + 2; x++) {
      const dx = (x + 0.5 - cols - 1) / (cols + 0.5), dy = (y + 0.5 - rows - 1) / (rows + 0.5);
      if (dx * dx + dy * dy > 1) continue;
      // damp bare rock: the wall's own colour, darker where the mat was
      const T0 = this.tones();
      g.set(x, y, 0, hv(x, y, 0, 3) < 0.3 ? shade(T0[1], 0.7) : shade(T0[0], 0.75));
    }
    const sg = voxGeo(g, { pivot: [cols + 1, rows + 1, 0], scale: T / 2, ao: false });
    this.geos.push(sg);
    this.stain = mesh(sg, this.matSoil, this.root);
    this.stain.position.z = -T / 2 * 0.6;
    this.edge = this.xMax;
    this.free = new THREE.Vector3(this.xMax, 0, 0.02);
    this.warnK = 0;
    this.write();
  }

  /** Lay the tiles out: on the rock left of the edge, curled and folded back over it to the right. */
  write() {
    const span = this.xMax - this.xMin;
    const edge = this.xMax - clamp(this.sim.p, 0, 1) * (span + T);
    this.edge = edge;
    let freeX = edge, freeZ = 0.01, n = 0, fy = 0;
    for (const t of this.tiles) {
      if (t.state === 'gone') { _m.makeScale(0, 0, 0); t.im.setMatrixAt(t.i, _m); continue; }
      if (t.state === 'fall') {
        _v.set(t.x, t.y, 0).add(t.off);
        _q.setFromEuler(t.rot);
        _m.compose(_v, _q, _s.set(T, T, T));
        t.im.setMatrixAt(t.i, _m);
        continue;
      }
      const s = t.x - edge;
      const flick = this.warnK > 0 ? Math.sin(this.t * 60 + t.k * 20) * 0.002 * this.warnK : 0;
      if (s <= 0) {
        // still on the rock; the bit by the edge lifts a little
        const lift = Math.max(0, 1 + s / 0.03) * 0.004;
        _v.set(t.x, t.y, lift + flick);
        _q.identity();
      } else {
        const th = s / RC;
        if (th <= Math.PI) { _v.set(edge + RC * Math.sin(th), t.y, RC * (1 - Math.cos(th))); _q.setFromAxisAngle(AY, -th); }
        else {
          const run = s - Math.PI * RC;
          _v.set(edge - run * 0.95, t.y, 2 * RC + run * 0.45);
          _q.setFromAxisAngle(AY, -Math.PI - 0.45);
        }
        if (t.x > this.xMax - T * 1.5) { freeX += _v.x; freeZ += _v.z; fy += t.y; n++; }
      }
      _q.multiply(_q2.setFromAxisAngle(AZ, (t.c * 7 + t.r * 3) % 4 * Math.PI / 2));
      _m.compose(_v, _q, _s.set(T * 1.04, T * 1.04, T * (0.8 + t.k * 0.4)));
      t.im.setMatrixAt(t.i, _m);
    }
    if (n) this.free.set(freeX / (n + 1), fy / n, freeZ / (n + 1) + 0.006);
    else this.free.set(edge + 0.004, 0, 0.02);
    this.imA.instanceMatrix.needsUpdate = true;
    this.imS.instanceMatrix.needsUpdate = true;
  }

  update(dt, vis, cam) {
    this.updateBase(dt, cam);
    const sim = this.sim;
    this.warnK = sim.warn > 0 ? 1 : Math.max(0, this.warnK - dt * 4);
    for (const t of this.tiles) {
      if (t.state !== 'fall') continue;
      t.vel.y -= 9.8 * dt; t.off.addScaledVector(t.vel, dt);
      t.rot.x += dt * 9; t.rot.z += dt * 6;
      if (t.off.y < -0.6) t.state = 'gone';
    }
    this.write();
    const u = this.mat.uniforms;
    u.uTint.value.setRGB(0.75, 0.95, 1);
    u.uTintK.value = this.flashT > 0 ? this.flashT : this.warnK * (0.25 + 0.25 * Math.sin(this.t * 50));
    this.flashT = Math.max(0, (this.flashT || 0) - dt * 3);
    // flecks peel off the fold while it moves
    if (sim.wasGrip && sim.v > 0.05 && Math.random() < dt * 10) this.dirt(this.edge, 0, 0.01, 1, 0.3, this.spec.col.a);
    if (this.warnK > 0 && Math.random() < dt * 20) {
      this.toWorld(_v.set(this.xMin + Math.random() * (this.xMax - this.xMin), (Math.random() - 0.5) * this.rows * T, 0.02), _v);
      this.ctx.fx?.sparks(_v.x, _v.y, _v.z, 2, [0.6, 0.9, 1], [this.at.toward.x, 0.1, this.at.toward.z], 0.6);
    }
  }

  onEvent(e) {
    switch (e.type) {
      case 'tear': {
        // the strip at the fold tears away and drops
        for (const t of this.tiles) {
          const s = t.x - this.edge;
          if (t.state === 'on' && s > -0.004 && s < RC * 1.5 && Math.random() < 0.55) {
            t.state = 'fall'; t.off.set(0, 0, 0.02); t.vel.set((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.4, 0.4 + Math.random() * 0.3);
          }
        }
        this.word('Rip!', '#ff9a8a', this.edge, 0.06, 0.03);
        break;
      }
      case 'crackle': this.word('Crackle...', '#bfefff', this.edge, 0.08, 0.03); break;
      case 'zapflash': {
        this.flashT = 1;
        this.toWorld(_v.set((this.xMin + this.xMax) / 2, 0, 0.03), _v);
        this.ctx.fx?.sparks(_v.x, _v.y, _v.z, 26, [0.7, 0.95, 1], [this.at.toward.x, 0.2, this.at.toward.z], 2);
        break;
      }
      case 'zap': this.word('ZAP!', '#7fe7ff', this.free.x, 0.05, 0.05, true); break;
      case 'pop': this.sparkle(this.free.x, 0, 0.04, 12, this.spec.glow ? [0.7, 1, 0.6] : [1, 0.9, 0.5], 0.7); break;
    }
  }

  pawTargets(o) {
    const up = this.dirWorld(new THREE.Vector3(0, 1, 0));
    const R = { pos: this.plant.localToWorld(this.free.clone()), up, fwdView: [-1, -0.08, -0.55], fist: o.gripping, hover: true };
    let L = null;
    if (o.brace) L = { pos: this.toWorld(new THREE.Vector3(this.xMin - 0.07, -0.02, 0.035)), up: this.dirWorld(new THREE.Vector3(0, 0, 1)), fwd: this.dirWorld(new THREE.Vector3(0.2, 1, 0).normalize()), fist: false };
    return { R, L };
  }
  gripWorld(out = new THREE.Vector3()) { this.plant.updateMatrixWorld(); return this.plant.localToWorld(out.copy(this.free)); }
  headWorld(out = new THREE.Vector3()) { return this.gripWorld(out); }
  middle(out = new THREE.Vector3()) { return out.set((this.xMin + this.xMax) / 2, 0, 0.02); }
  showSize() { return { span: this.rows * T + 0.08, w: (this.xMax - this.xMin) * 0.7 }; }
  focus() { return { at: new THREE.Vector3(0, 0, 0.02), h: this.rows * T + 0.12, w: (this.xMax - this.xMin) + 0.18 }; }
}
