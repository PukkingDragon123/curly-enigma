// Rock chunks that leave the wall: little voxel models built from the exact voxels that broke out,
// thrown toward the mole, tumbling and bouncing off the tunnel before crumbling to dust. The same
// bodies carry freed ore (pickups), which hop out and then fly into the backpack.
import * as THREE from 'three';
import { VoxelGrid, meshGridGreedy } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { makeObjectMaterial } from './TerrainMaterial.js';
import { VOX } from './materials.js';

const MAX = 48;
const GRAV = 14;

export class Bodies {
  constructor(scene3, world, U) {
    this.w = world;
    this.root = new THREE.Group();
    scene3.add(this.root);
    this.mat = makeObjectMaterial(U, { texel: 128 });
    this.glowMat = makeObjectMaterial(U, { emissive: 0.3, texel: 128 });
    this.list = [];
    this.hooks = {};
  }

  /**
   * voxels: [{x, y, z, c}] in voxel coords. opts: vel [x,y,z] m/s, spin, life, scale (shrink factor),
   * pickup: data for ore pickups (flies to the player when ready), glow.
   */
  spawn(voxels, opts = {}) {
    const n = voxels.length;
    if (!n) return null;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9, sx = 0, sy = 0, sz = 0;
    for (const v of voxels) {
      if (v.x < x0) x0 = v.x; if (v.x > x1) x1 = v.x;
      if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
      if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z;
      sx += v.x; sy += v.y; sz += v.z;
    }
    const gw = x1 - x0 + 1, gh = y1 - y0 + 1, gd = z1 - z0 + 1;
    if (gw * gh * gd > 40000) return null;
    const g = new VoxelGrid(gw, gh, gd);
    for (const v of voxels) g.set(v.x - x0, v.y - y0, v.z - z0, v.c);
    const cx = sx / n - x0 + 0.5, cy = sy / n - y0 + 0.5, cz = sz / n - z0 + 0.5;
    const k = opts.scale ?? 1;
    const geo = meshGridGreedy(g, { scale: k / VOX, pivot: [cx, cy, cz], shade: true });
    const mesh = new THREE.Mesh(geo, opts.glow ? this.glowMat : this.mat);
    mesh.layers.enable(LAYER_OUTLINE);
    const pos = new THREE.Vector3((sx / n + 0.5) / VOX, (sy / n + 0.5) / VOX, (sz / n + 0.5) / VOX);
    mesh.position.copy(pos);
    this.root.add(mesh);
    const r = Math.max(0.03, (Math.cbrt(n) / VOX) * 0.5 * k);
    const b = {
      mesh, pos, vel: new THREE.Vector3(...(opts.vel || [0, 0, 0])),
      rot: new THREE.Euler(), spin: new THREE.Vector3(...(opts.spin || [(Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9])),
      r, n, t: 0, life: opts.life ?? 1.6 + Math.random() * 1.2, rest: 0, dying: 0, pickup: opts.pickup || null, bounce: opts.bounce ?? 0.35,
    };
    this.list.push(b);
    while (this.list.length > MAX) this.kill(this.list.find((q) => !q.pickup) || this.list[0], true);
    return b;
  }

  kill(b, quiet) {
    const i = this.list.indexOf(b);
    if (i >= 0) this.list.splice(i, 1);
    this.root.remove(b.mesh);
    b.mesh.geometry.dispose();
    if (!quiet && this.hooks.gone) this.hooks.gone(b);
  }

  solid(x, y, z) { return this.w.solidAt(x, y, z); }

  update(dt, playerEye, playerFeet = null) {
    for (const b of [...this.list]) {
      b.t += dt;
      if (b.dying > 0) {
        b.dying -= dt;
        b.mesh.scale.setScalar(Math.max(0.01, b.dying / 0.3));
        if (b.dying <= 0) { this.kill(b); continue; }
      }
      // ore pickups fly to the mole once they've hopped out
      // (a find that won't fit right now waits where it landed: hooks.canTake)
      const wait = b.pickup && b.t > (b.pickup.delay ?? 0.7) && this.hooks.canTake && !this.hooks.canTake(b);
      if (wait) b.t = Math.min(b.t, 5);
      if (b.pickup && !wait && b.t > (b.pickup.delay ?? 0.7) && playerEye) {
        // into the backpack: aim below the eyes, shrink on the way in
        const d = new THREE.Vector3().subVectors(playerEye, b.pos);
        d.y -= 0.5;
        const dist = d.length();
        if (dist < 0.25 || b.t > 4) { this.kill(b, true); if (this.hooks.collect) this.hooks.collect(b); continue; }
        b.mesh.scale.setScalar(Math.min(1, Math.max(0.15, dist / 0.9)));
        b.vel.lerp(d.multiplyScalar(Math.min(9, 3 + b.t * 4) / dist), Math.min(1, dt * 6));
        b.pos.addScaledVector(b.vel, dt);
        b.rot.x += b.spin.x * dt; b.rot.y += b.spin.y * dt * 2;
        b.mesh.position.copy(b.pos); b.mesh.rotation.copy(b.rot);
        continue;
      }
      b.vel.y -= GRAV * dt;
      b.vel.multiplyScalar(Math.max(0, 1 - 0.3 * dt));
      // integrate per axis against the voxels
      const p = b.pos, v = b.vel, r = b.r;
      const nx = p.x + v.x * dt;
      if (this.solid(nx + Math.sign(v.x) * r, p.y, p.z)) { v.x *= -b.bounce; b.spin.y *= -0.6; } else p.x = nx;
      const nz = p.z + v.z * dt;
      if (this.solid(p.x, p.y, nz + Math.sign(v.z) * r)) { v.z *= -b.bounce; b.spin.x *= -0.6; } else p.z = nz;
      const ny = p.y + v.y * dt;
      if (this.solid(p.x, ny + Math.sign(v.y) * r, p.z)) {
        const sp = Math.abs(v.y);
        if (v.y < 0 && sp > 2 && this.hooks.tick) this.hooks.tick(b, sp);
        v.y = v.y < 0 && sp * b.bounce > 0.8 ? sp * b.bounce : 0;
        v.x *= 0.6; v.z *= 0.6;
        b.spin.multiplyScalar(0.5);
        if (v.y === 0) b.rest += dt;
      } else { p.y = ny; b.rest = 0; }
      if (this.solid(p.x, p.y, p.z)) p.y += 1 / VOX; // spawned inside rock: nudge out
      // chunks bump off the mole instead of flying through the camera
      if (playerFeet && p.y > playerFeet.y - r && p.y < playerFeet.y + 0.95) {
        const dx = p.x - playerFeet.x, dz = p.z - playerFeet.z;
        const dd = Math.hypot(dx, dz), min = 0.3 + r;
        if (dd < min) {
          const ux = dd > 1e-4 ? dx / dd : 1, uz = dd > 1e-4 ? dz / dd : 0;
          if (!this.solid(playerFeet.x + ux * min, p.y, playerFeet.z + uz * min)) { p.x = playerFeet.x + ux * min; p.z = playerFeet.z + uz * min; }
          const vn = v.x * ux + v.z * uz;
          if (vn < 0) { v.x -= vn * ux * 1.5; v.z -= vn * uz * 1.5; }
        }
      }
      b.rot.x += b.spin.x * dt; b.rot.y += b.spin.y * dt; b.rot.z += b.spin.z * dt;
      b.mesh.position.copy(p);
      b.mesh.rotation.copy(b.rot);
      if (!b.pickup && b.dying <= 0 && (b.rest > 0.6 || b.t > b.life)) b.dying = 0.3;
      if (b.pickup && b.dying <= 0 && b.t > 6) b.dying = 0.3;
    }
  }

  dispose() {
    for (const b of [...this.list]) this.kill(b, true);
    this.mat.dispose(); this.glowMat.dispose();
  }
}
