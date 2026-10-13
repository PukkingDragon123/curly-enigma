// Physical rock chunks: every broken fracture piece becomes a little voxel model built from
// the exact pixels that left the wall (same colors, rounded thickness), tumbling and
// bouncing through the tunnel before crumbling to dust. Big ones are falling islands.
import * as THREE from 'three';
import { VoxelGrid, meshGridGreedy } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { LIGHT_GLSL } from './Terrain.js';
import { M } from './micro.js';

const MAX = 44;

function bodyMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uFade: { value: 1 } },
    vertexShader: /* glsl */`
      attribute vec3 color;
      varying vec3 vColor;
      varying vec2 vWorld;
      void main() {
        vColor = color;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xy;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      ${LIGHT_GLSL}
      varying vec3 vColor;
      varying vec2 vWorld;
      void main() {
        vec3 L = ambient * 1.3 + lightAt(vWorld);
        gl_FragColor = vec4(vColor * L * 0.92, 1.0);
      }`,
  });
}

export class Bodies {
  constructor(scene3, world, U) {
    this.w = world;
    this.root = new THREE.Group();
    scene3.add(this.root);
    this.mat = bodyMaterial(U);
    this.list = [];
    this.hooks = {};
  }

  /**
   * pixels: [{x, y, c}] in world pixel coords. opts: vx, vy, vz (units/s), spin, big, bounce.
   * Returns the body (or null when the piece is too small to bother with).
   */
  spawn(pixels, opts = {}) {
    const n = pixels.length;
    if (n < (opts.min ?? 5)) return null;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, sx = 0, sy = 0;
    for (const p of pixels) {
      if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
      if (p.y < miny) miny = p.y; if (p.y > maxy) maxy = p.y;
      sx += p.x; sy += p.y;
    }
    const ds = n > 1600 ? 3 : n > 500 ? 2 : 1; // voxel size in pixels for big chunks
    const gw = Math.floor((maxx - minx) / ds) + 1, gh = Math.floor((maxy - miny) / ds) + 1;
    // thickness: inner pixels are thicker → rounded 3D lumps
    const occ = new Uint8Array(gw * gh);
    const col = new Uint32Array(gw * gh);
    for (const p of pixels) {
      const gx = Math.floor((p.x - minx) / ds), gy = Math.floor((p.y - miny) / ds);
      occ[gy * gw + gx] = 1;
      col[gy * gw + gx] = p.c;
    }
    const dist = new Uint8Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) dist[i] = occ[i] ? 255 : 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
        const xx = pass ? gw - 1 - x : x, yy = pass ? gh - 1 - y : y;
        const i = yy * gw + xx;
        if (!occ[i]) continue;
        const a = xx > 0 ? dist[i - 1] : 0, b = xx < gw - 1 ? dist[i + 1] : 0, c = yy > 0 ? dist[i - gw] : 0, d = yy < gh - 1 ? dist[i + gw] : 0;
        dist[i] = Math.min(dist[i], (pass ? Math.min(b, d) : Math.min(a, c)) + 1);
      }
    }
    const maxD = Math.max(2, Math.min(14, Math.round(Math.sqrt(n / (ds * ds)) * 0.55)));
    const D = maxD + 1;
    const g = new VoxelGrid(gw, gh, D);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if (!occ[i]) continue;
      const t = Math.max(1, Math.min(maxD, Math.round(dist[i] * 1.3)));
      const z0 = Math.floor((D - t) / 2);
      for (let z = z0; z < z0 + t; z++) {
        // the faces in depth are a touch darker, like the wall's side faces
        const k = z === z0 + t - 1 ? 1 : 0.86;
        const c = col[i];
        const cc = k === 1 ? c : (((((c >> 16) & 255) * k) | 0) << 16) | (((((c >> 8) & 255) * k) | 0) << 8) | (((c & 255) * k) | 0);
        g.set(x, gh - 1 - y, z, cc);
      }
    }
    const cx = (sx / n - minx) / ds, cy = (sy / n - miny) / ds;
    const geo = meshGridGreedy(g, { scale: ds / M, pivot: [cx + 0.5, gh - 1 - cy + 0.5, D / 2], shade: true });
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.layers.enable(LAYER_OUTLINE);
    const X = (sx / n + 0.5) / M, Y = -(sy / n + 0.5) / M;
    mesh.position.set(X, Y, opts.z ?? 0.1);
    this.root.add(mesh);
    const hx = ((maxx - minx + 1) / M) * 0.5, hy = ((maxy - miny + 1) / M) * 0.5;
    const b = {
      mesh, x: X, y: Y, z: mesh.position.z, vx: opts.vx || 0, vy: opts.vy || 0, vz: opts.vz || 0,
      rx: 0, ry: 0, rz: 0, wx: opts.spinX ?? (Math.random() - 0.5) * 6, wy: opts.spinY ?? (Math.random() - 0.5) * 6, wz: opts.spin ?? (Math.random() - 0.5) * 9,
      r: Math.max(0.03, Math.min(hx, hy) * 0.85), hx, hy, n, big: !!opts.big, bounce: opts.bounce ?? 0.32, rest: 0, t: 0,
      life: opts.life ?? (1.4 + Math.random() * 1.4), dying: 0, data: opts.data || null, pixels: opts.keepPixels ? pixels : null, free: !!opts.free,
    };
    this.list.push(b);
    while (this.list.length > MAX) this.kill(this.list.find((q) => !q.big) || this.list[0], true);
    return b;
  }

  kill(b, quiet) {
    const i = this.list.indexOf(b);
    if (i >= 0) this.list.splice(i, 1);
    this.root.remove(b.mesh);
    b.mesh.geometry.dispose();
    if (!quiet && this.hooks.gone) this.hooks.gone(b);
  }

  solid(x, y) { return this.w.solidPt(x, -y); }

  update(dt, player) {
    const keep = [];
    for (const b of [...this.list]) {
      b.t += dt;
      if (b.dying > 0) {
        b.dying -= dt;
        const k = Math.max(0, b.dying / 0.35);
        b.mesh.scale.setScalar(k);
        if (b.dying <= 0) { this.kill(b); continue; }
      }
      b.vy -= 24 * dt;
      b.vx *= 1 - 0.4 * dt;
      if (b.free && b.z > 0.55) {
        // flying out of the wall toward the viewer (face mode): no tunnel collisions out here
        b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
        if (b.z > 7 || b.t > 2.2) { this.kill(b, true); continue; }
        b.mesh.position.set(b.x, b.y, b.z);
        b.mesh.rotation.set(b.rx, b.ry, b.rz);
        continue;
      }
      // x
      let nx = b.x + b.vx * dt;
      const side = Math.sign(b.vx) * b.r;
      if (b.vx && (this.solid(nx + side, b.y) || this.solid(nx + side, b.y + b.r * 0.6))) { b.vx = -b.vx * b.bounce; nx = b.x; b.wz *= -0.6; }
      // y
      let ny = b.y + b.vy * dt;
      if (b.vy < 0 && (this.solid(nx, ny - b.r) || this.solid(nx - b.r * 0.6, ny - b.r) || this.solid(nx + b.r * 0.6, ny - b.r))) {
        const speed = -b.vy;
        if (b.big && this.hooks.bigLand) { b.x = nx; this.hooks.bigLand(b, speed); continue; }
        if (speed > 2.2 && this.hooks.tick) this.hooks.tick(b, speed);
        // settle on the surface
        let guard = 0;
        while (this.solid(nx, ny - b.r) && guard++ < 40) ny += 1 / M;
        b.vy = speed * b.bounce > 1 ? speed * b.bounce : 0;
        b.vx *= 0.55;
        b.wx *= 0.4; b.wy *= 0.4; b.wz = b.vx * -6;
      } else if (b.vy > 0 && this.solid(nx, ny + b.r)) { b.vy = -b.vy * 0.2; ny = b.y; }
      // stuck inside rock (spawned in a crevice) → nudge out
      if (this.solid(nx, ny)) ny += 2 / M;
      b.x = nx; b.y = ny;
      b.z += b.vz * dt;
      if (b.z > 0.42) { b.z = 0.42; b.vz = -b.vz * 0.4; }
      if (b.z < -0.4) { b.z = -0.4; b.vz = -b.vz * 0.4; }
      b.vz *= 1 - 1.2 * dt;
      b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
      const resting = b.vy === 0 && Math.abs(b.vx) < 0.3 && this.solid(b.x, b.y - b.r - 1.5 / M);
      if (resting) { b.vx = 0; b.wx = b.wy = b.wz = 0; b.rest += dt; } else b.rest = 0;
      if (!b.big && b.dying <= 0 && (b.rest > b.life * 0.6 || b.t > b.life + 3)) b.dying = 0.35;
      if (b.big && player && this.hooks.hitPlayer && b.vy < -3 && Math.abs(player.x - b.x) < b.hx + 0.3 && Math.abs(-player.y - b.y) < b.hy + 0.4) this.hooks.hitPlayer(b);
      if (b.y < -this.w.H - 2) { this.kill(b, true); continue; }
      b.mesh.position.set(b.x, b.y, b.z);
      b.mesh.rotation.set(b.rx, b.ry, b.rz);
      keep.push(b);
    }
  }

  dispose() {
    for (const b of [...this.list]) this.kill(b, true);
    this.mat.dispose();
  }
}
