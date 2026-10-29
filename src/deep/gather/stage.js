// The stage a gathering minigame plays on: a group set where the plant grows (its local frame:
// +y out of the rock, +z toward the camera, +x to the right on screen), the soil around it as
// loose clods that crack, heave, hop and burst, a dark hole under them, dirt and sparkle particles
// (the mine's own Particles) and a few helpers the stages share.
import * as THREE from 'three';
import { gatherMaterial, voxGeo, mesh, clodGeo, lin, PGrid } from './gfx.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { MAT, VOX } from '../materials.js';
import { hv, shade, mixc } from '../props/grid.js';
import { rng } from './sims.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Stage {
  /**
   * ctx: { scene3, U, world, fx, audio } · at: { pos: Vector3, right, up, toward (unit Vector3s),
   * mount: 'floor' | 'ceil' | 'wall' } · o: { seed, soilR }
   */
  constructor(ctx, at, o = {}) {
    this.ctx = ctx;
    this.at = at;
    this.seed = o.seed ?? 1;
    this.r = rng(this.seed * 31 + 7);
    this.t = 0;
    this.root = new THREE.Group();
    this.root.position.copy(at.pos);
    this.root.quaternion.setFromRotationMatrix(_m.makeBasis(at.right, at.up, at.toward));
    this.root.updateMatrixWorld(true);
    ctx.scene3.add(this.root);
    this.mat = gatherMaterial(ctx.U, { key: 0.22, rim: 0.3, glow: 0.85 });
    this.matSoil = gatherMaterial(ctx.U, { key: 0.25, rim: 0.12, texel: 0 });
    this.mats = [this.mat, this.matSoil];
    this.geos = [];
    this.occluders = []; // meshes the paws should pass behind (drawn depth-only over the paws)
    this.pops = []; // floating words: { text, color, pos (local), t }
    this.floor = this.floorMaterial();
  }

  /** The floor's material under the plant (clods take its colours). */
  floorMaterial() {
    const w = this.ctx.world, p = this.at.pos, u = this.at.mount === 'wall' ? this.at.toward : this.at.up;
    for (let k = 1; k <= 4; k++) {
      const x = p.x - u.x * k / VOX, y = p.y - u.y * k / VOX, z = p.z - u.z * k / VOX;
      const m = w.voxelAt(Math.floor(x * VOX), Math.floor(y * VOX), Math.floor(z * VOX));
      if (m && MAT[m] && MAT[m].tones) return m;
    }
    return 1;
  }
  tones() {
    const d = MAT[this.floor];
    return d?.tones || [0x4a2e1c, 0x5e3b24, 0x6e472c, 0x7d5536];
  }

  /** Local point → world. */
  toWorld(v, out = new THREE.Vector3()) { return out.copy(v).applyMatrix4(this.root.matrixWorld); }
  dirWorld(v, out = new THREE.Vector3()) { return out.copy(v).applyQuaternion(this.root.quaternion); }

  /** Height of the rock surface (local y) under local (x, z): the soil sits on the real floor. */
  surfaceY(x, z) {
    if (this.at.mount !== 'floor') return 0;
    const w = this.ctx.world;
    this.toWorld(_v.set(x, 0, z), _v2);
    const vx = Math.floor(_v2.x * VOX), vz = Math.floor(_v2.z * VOX);
    let vy = Math.floor((_v2.y + 0.15) * VOX);
    for (let k = 0; k < 9; k++, vy--) if (w.solidAt((vx + 0.5) / VOX, (vy + 0.5) / VOX, (vz + 0.5) / VOX)) return clamp((vy + 1) / VOX - this.at.pos.y, -0.08, 0.1);
    return 0;
  }

  // ------------------------------------------------------------ soil
  /** Clods in rings round the plant (a mound near the stem). opts: { r0, r1, n, mound, cracks: [angles] } */
  buildSoil(o = {}) {
    const r0 = o.r0 ?? 0.03, r1 = o.r1 ?? 0.17, n = o.n ?? 140;
    const geo = clodGeo(this.seed);
    this.geos.push(geo);
    const im = new THREE.InstancedMesh(geo, this.matSoil, n);
    im.frustumCulled = false;
    im.layers.enable(LAYER_OUTLINE);
    const T = this.tones();
    const c = new THREE.Color();
    const r = this.r;
    this.clods = [];
    for (let i = 0; i < n; i++) {
      // denser near the stem
      const u = Math.pow((i + r() * 0.8) / n, 0.8);
      const R = r0 + (r1 - r0) * u;
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      const y0 = this.at.mount === 'floor' ? this.surfaceY(x, z) : 0;
      const near = 1 - u;
      const s = (0.007 + r() * 0.011) * (0.75 + near * 0.6);
      const mound = (o.mound ?? 0.02) * Math.pow(near, 1.5);
      // turned earth: the floor's own tones, darker and duller (it's damp underneath)
      const tone = T[Math.min(3, Math.floor(r() * 2.2 + near * 1.2))];
      const dull = mixc(tone, 0x2a221c, (o.dark ?? 0.3) + r() * 0.15);
      const col = lin(hv(i, 3, 5, 9) < 0.12 ? shade(dull, 1.25) : shade(dull, 0.8 + near * 0.15));
      c.setRGB(col[0], col[1], col[2]);
      im.setColorAt(i, c);
      this.clods.push({ x, z, y: y0 + mound * 0.6, R, a, s, rest: new THREE.Vector3(x, y0 + mound * 0.6, z), off: new THREE.Vector3(), vel: new THREE.Vector3(), flying: false,
        rot: new THREE.Euler(r() * 0.5, r() * Math.PI * 2, r() * 0.5), spin: new THREE.Vector3(), near, k: r() });
    }
    im.instanceColor.needsUpdate = true;
    this.root.add(im);
    this.soil = im;
    this.cracks = o.cracks || [];
    this.writeClods();
  }

  /** Clod offsets from the minigame: crack (0..1 how open), heave (m), shift ({x, z} m near the stem). */
  soilPose(dt, { crack = 0, heave = 0, shiftX = 0, shiftZ = 0, hole = 0.05 } = {}) {
    if (!this.clods) return;
    for (const c of this.clods) {
      if (c.flying) {
        c.vel.y -= 9.8 * dt;
        c.off.addScaledVector(c.vel, dt);
        c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt;
        // land on the floor (a clod that left the hole lands outside it)
        const floorY = Math.hypot(c.rest.x + c.off.x, c.rest.z + c.off.z) < hole * 0.8 ? -0.03 : 0;
        if (c.rest.y + c.off.y < floorY && c.vel.y < 0) {
          c.off.y = floorY - c.rest.y;
          if (Math.abs(c.vel.y) > 0.6) { c.vel.y *= -0.3; c.vel.x *= 0.5; c.vel.z *= 0.5; c.spin.multiplyScalar(0.5); }
          else { c.flying = false; c.rest.add(c.off); c.rest.y = floorY + c.s * 0.3; c.off.set(0, 0, 0); c.settled = true; }
        }
        continue;
      }
      if (c.settled) { c.off.set(0, 0, 0); continue; }
      // cracks: clods next to a crack line are pushed off it, wider near the stem
      let ox = 0, oz = 0;
      if (crack > 0 && this.cracks.length) {
        let best = 9, side = 1;
        for (const a of this.cracks) {
          let d = c.a - a;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) < Math.abs(best)) { best = d; side = Math.sign(d) || 1; }
        }
        const dist = Math.abs(best) * c.R;
        const open = crack * 0.009 * Math.exp(-dist / 0.025) * clamp(1.25 - c.R / 0.16, 0, 1);
        ox += -Math.sin(c.a) * side * open; oz += Math.cos(c.a) * side * open;
        ox += Math.cos(c.a) * crack * 0.003 * c.near;
        oz += Math.sin(c.a) * crack * 0.003 * c.near;
      }
      const nearK = clamp(1 - c.R / 0.08, 0, 1);
      c.off.set(ox + shiftX * nearK * 0.5, heave * nearK * nearK + crack * 0.003 * c.near * (c.k - 0.3), oz + shiftZ * nearK * 0.5);
    }
    this.writeClods();
  }

  /** Kick clods near a local point (a root tearing out, the pop). */
  kickClods(x, z, rad, up, out = 0.4) {
    if (!this.clods) return;
    for (const c of this.clods) {
      const d = Math.hypot(c.rest.x - x, c.rest.z - z);
      if (d > rad) continue;
      const k = 1 - d / rad;
      c.flying = true;
      c.settled = false;
      const dx = c.rest.x - x, dz = c.rest.z - z, L = Math.hypot(dx, dz) || 1;
      c.vel.set(dx / L * out * k * (0.6 + Math.random() * 0.8), up * k * (0.6 + Math.random() * 0.7), dz / L * out * k * (0.6 + Math.random() * 0.8));
      c.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
    }
  }

  writeClods() {
    const im = this.soil;
    for (let i = 0; i < this.clods.length; i++) {
      const c = this.clods[i];
      _v.copy(c.rest).add(c.off);
      _q.setFromEuler(c.rot);
      _s.setScalar(c.s * 1.6);
      _m.compose(_v, _q, _s);
      im.setMatrixAt(i, _m);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  /** A dark disc of turned earth under the clods (the cracks show it; after the pop, the hole). */
  buildHole(R = 0.06) {
    const S = 1 / 96;
    const n = Math.ceil(R / S) + 1;
    const g = new PGrid(n * 2 + 2, 2, n * 2 + 2);
    const T = this.tones();
    for (let z = 0; z < n * 2 + 2; z++) for (let x = 0; x < n * 2 + 2; x++) {
      const dx = x + 0.5 - (n + 1), dz = z + 0.5 - (n + 1), d = Math.hypot(dx, dz) * S;
      if (d > R) continue;
      const k = d / R;
      g.set(x, 0, z, shade(T[0], 0.35 + k * 0.35 + hv(x, 0, z, 3) * 0.1));
    }
    const geo = voxGeo(g, { pivot: [n + 1, 1, n + 1], scale: S, ao: false });
    this.geos.push(geo);
    this.hole = mesh(geo, this.matSoil, this.root);
    this.hole.layers.disable(LAYER_OUTLINE);
    this.hole.position.y = (this.at.mount === 'floor' ? this.surfaceY(0, 0) : 0) + 0.004;
    this.hole.scale.setScalar(0.55);
    return this.hole;
  }

  // ------------------------------------------------------------ particles (the mine's)
  /** Dirt flying up from a local point. */
  dirt(x, y, z, n = 8, k = 1, col = null) {
    const fx = this.ctx.fx;
    if (!fx) return;
    const T = this.tones();
    this.toWorld(_v.set(x, y, z), _v2);
    const up = this.at.up;
    for (let i = 0; i < n; i++) {
      const tone = col ?? T[Math.floor(Math.random() * 4)];
      const c = [((tone >> 16) & 255) / 255, ((tone >> 8) & 255) / 255, (tone & 255) / 255];
      const a = Math.random() * Math.PI * 2, sp = (0.3 + Math.random() * 0.9) * k;
      const rx = this.at.right, tz = this.at.toward;
      const vx = (rx.x * Math.cos(a) + tz.x * Math.sin(a)) * sp, vz = (rx.z * Math.cos(a) + tz.z * Math.sin(a)) * sp, vy = (rx.y * Math.cos(a) + tz.y * Math.sin(a)) * sp;
      const lift = (0.8 + Math.random() * 1.6) * k;
      fx.spawn({ x: _v2.x, y: _v2.y + 0.005, z: _v2.z, vx: vx + up.x * lift, vy: vy + up.y * lift, vz: vz + up.z * lift,
        life: 0.5 + Math.random() * 0.6, size: 0.006 + Math.random() * 0.009, color: c, alpha: 1, drag: 0.8, grav: 7, bounce: 0.3, fade: false });
    }
  }
  /** A puff of dust. */
  dust(x, y, z, n = 4, spread = 0.04) {
    const fx = this.ctx.fx;
    if (!fx) return;
    const T = this.tones();
    const tone = shade(T[2], 1.2);
    this.toWorld(_v.set(x, y, z), _v2);
    for (let i = 0; i < n; i++) {
      fx.spawn({ x: _v2.x + (Math.random() - 0.5) * spread, y: _v2.y + Math.random() * spread * 0.5, z: _v2.z + (Math.random() - 0.5) * spread,
        vx: (Math.random() - 0.5) * 0.15, vy: 0.08 + Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.15,
        life: 0.8 + Math.random() * 0.8, size: 0.018 + Math.random() * 0.02, grow: 0.05, color: [((tone >> 16) & 255) / 255, ((tone >> 8) & 255) / 255, (tone & 255) / 255], alpha: 0.4, drag: 2, grav: -0.05 });
    }
  }
  /** Glowing sparkles (good pulls, pops). */
  sparkle(x, y, z, n = 6, color = [1, 0.92, 0.6], speed = 0.5) {
    const fx = this.ctx.fx;
    if (!fx) return;
    this.toWorld(_v.set(x, y, z), _v2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, sp = speed * (0.3 + Math.random());
      fx.spawn({ x: _v2.x, y: _v2.y, z: _v2.z, vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.abs(Math.sin(b)) * sp + 0.1, vz: Math.sin(a) * Math.cos(b) * sp,
        life: 0.5 + Math.random() * 0.5, size: 0.006 + Math.random() * 0.006, color, alpha: 1, glow: true, drag: 1.6, grav: 0.4 });
    }
  }
  /** Rising motes (the "you're doing it right" shimmer). */
  motes(x, y, z, color = [0.7, 1, 0.55], spread = 0.05) {
    const fx = this.ctx.fx;
    if (!fx) return;
    this.toWorld(_v.set(x + (Math.random() - 0.5) * spread, y, z + (Math.random() - 0.5) * spread), _v2);
    const up = this.at.up;
    fx.spawn({ x: _v2.x, y: _v2.y, z: _v2.z, vx: up.x * 0.25 + (Math.random() - 0.5) * 0.05, vy: up.y * 0.25 + 0.05, vz: up.z * 0.25 + (Math.random() - 0.5) * 0.05,
      life: 0.7 + Math.random() * 0.5, size: 0.005 + Math.random() * 0.004, color, alpha: 0.9, glow: true, drag: 1.2, grav: -0.1 });
  }

  /** A word that pops up in the world (drawn by the HUD at this local point). */
  word(text, color = '#fff4d8', x = 0, y = 0.2, z = 0, big = false) {
    this.pops.push({ text, color, pos: new THREE.Vector3(x, y, z), t: 0, big, id: Math.random() });
  }

  /** Occluder list: every mesh the paws should go behind. */
  occlude(m) { this.occluders.push(m); return m; }

  updateBase(dt, cam) {
    this.t += dt;
    for (const m of this.mats) { m.uniforms.uCam.value.copy(cam.position); }
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1.1);
  }

  /** After a harvest: keep the soil and the hole for a while (everything that came out goes). */
  leaveBehind(secs = 40) {
    if (this.plant) this.plant.visible = false;
    for (const o of this.keepOut || []) o.visible = false;
    if (this.ring) this.ring.visible = false;
    this.left = setTimeout(() => this.dispose(), secs * 1000);
  }

  dispose() {
    clearTimeout(this.left);
    if (this.disposed) return;
    this.disposed = true;
    this.root.parent?.remove(this.root);
    this.root.traverse((o) => { if (o.isInstancedMesh) o.dispose?.(); });
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

export { _e };
