// The mole's own shadow on the floor under it (wave 14): you can't see your body in first person,
// but looking down you see its shape. A dark, dithered silhouette built of flat voxel slabs: a
// round little body and two feet that step when walking; a longer, lower body when crouched; and in
// a belly crawl the whole body stretched out, swaying side to side like a rag doll (each segment a
// beat behind the one in front), four paws reaching and pulling in turn, the tail dragging. It
// leans into turns. Lies on the floor (a short ray down), fades as the floor falls away.
//
//   const sh = new MoleShadow(scene3, world); sh.update(dt, player); sh.dispose();
import * as THREE from 'three';
import { VOX } from './materials.js';

const N = 13; // body segments 0-4, paws 5-8, tail 9-11, snout 12
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class MoleShadow {
  constructor(scene3, world) {
    this.w = world;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { alpha: { value: 0.5 } },
      vertexShader: /* glsl */`
        void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform float alpha;
        float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          // see-through in pixel steps (no sorting), like the cave's other dithered things
          if (alpha <= bayer4(gl_FragCoord.xy) * 0.94 + 0.03) discard;
          gl_FragColor = vec4(0.015, 0.011, 0.009, 1.0);
        }`,
      depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.mat, N);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.name = 'moleShadow';
    scene3.add(this.mesh);
    this.k = 0; // crawl blend
    this.c = 0; // crouch blend
    this.lean = 0;
    this.yaw = null;
    this.floorY = null;
  }

  /** The floor's top under (x, z) from height y (m), within `down` m, or null. */
  floor(x, y, z, down = 1.4) {
    const w = this.w, vx = Math.floor(x * VOX), vz = Math.floor(z * VOX);
    const y0 = Math.floor(y * VOX);
    for (let k = 0; k < down * VOX; k++) if (w.voxelAt(vx, y0 - k, vz) && !w.voxelAt(vx, y0 - k + 1, vz)) return (y0 - k + 1) / VOX;
    return null;
  }

  update(dt, pl) {
    const p = pl.pos;
    const fy = this.floor(p.x, p.y + 0.12, p.z);
    const gap = fy === null ? 9 : p.y - fy;
    const a = Math.max(0, 0.5 * (1 - gap / 1.2));
    this.mat.uniforms.alpha.value = a;
    this.mesh.visible = a > 0.02;
    if (!this.mesh.visible) return;
    this.floorY = fy;
    dt = Math.min(dt, 0.05);
    this.k += ((pl.crawl ? 1 : 0) - this.k) * Math.min(1, dt * 8);
    this.c += ((pl.crouched && !pl.crawl ? 1 : 0) - this.c) * Math.min(1, dt * 8);
    // lean into turns
    if (this.yaw === null) this.yaw = pl.yaw;
    let dy = pl.yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw = pl.yaw;
    this.lean += (Math.max(-1, Math.min(1, dy / Math.max(dt, 1e-3) * 0.25)) - this.lean) * Math.min(1, dt * 6);
    const k = this.k, c = this.c, sp = Math.min(1, (pl.speed || 0) / 2.5);
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw), rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
    const ph = pl.crawlPh || 0, wph = (pl.bobT || 0) * 2;
    const y = fy + 0.003;
    let i = 0;
    const put = (along, side, w, l, rot = 0) => {
      // snapped to the 1/32 m grid: a pixel silhouette, not a smooth blob
      const g = 32;
      _p.set(Math.round((p.x + fx * along + rx * side) * g) / g, y, Math.round((p.z + fz * along + rz * side) * g) / g);
      _q.setFromAxisAngle(UP, pl.yaw + rot);
      _s.set(Math.max(1 / 32, Math.round(w * g) / g), 0.004, Math.max(1 / 32, Math.round(l * g) / g));
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i++, _m);
    };
    // body: 5 segments front to back; crawling it stretches out and sways (each a beat behind)
    const len = 0.34 + 0.06 * c + 0.3 * k;
    for (let j = 0; j < 5; j++) {
      const u = j / 4; // 0 head .. 1 rump
      const along = len * (0.45 - u);
      const sway = k * Math.sin(ph - u * 2.2) * 0.045 * (0.4 + u) + this.lean * 0.05 * u;
      const wd = (0.2 + 0.12 * Math.sin(Math.PI * (0.25 + u * 0.75))) * (1 - 0.12 * k);
      put(along, sway, wd, len / 4 + 0.04, -this.lean * 0.3 * u + k * Math.cos(ph - u * 2.2) * 0.12);
    }
    // paws: two feet stepping (walking) or four reaching and pulling (crawling)
    for (let j = 0; j < 4; j++) {
      const front = j < 2, sideS = j % 2 ? 1 : -1;
      const step = front === (sideS > 0) ? Math.sin(ph) : -Math.sin(ph);
      const walk = Math.sin(wph + (sideS > 0 ? 0 : Math.PI)) * 0.05 * sp;
      const along = front ? len * 0.42 + k * (0.05 + step * 0.09) : -len * 0.32 + k * step * 0.06 + (1 - k) * walk;
      const side = sideS * (0.13 + 0.08 * k + 0.02 * c);
      const vis = front ? k : 1;
      put(along, side, 0.07 * (0.3 + 0.7 * vis), 0.09 * (0.3 + 0.7 * vis), sideS * (0.3 + 0.4 * k));
    }
    // a tail dragging behind, and the snout
    for (let j = 0; j < 3; j++) {
      const u = (j + 1) / 3;
      put(-len * 0.5 - u * 0.06 * (1 + k), Math.sin(ph * 0.5 - u * 2) * 0.03 * k - this.lean * 0.04 * u, 0.035, 0.05, 0);
    }
    put(len * 0.5 + 0.04, k * Math.sin(ph + 0.6) * 0.02, 0.08, 0.07, 0);
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
