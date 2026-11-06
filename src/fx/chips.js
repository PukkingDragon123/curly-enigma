// Tiny voxel chips: little cubes that burst off a spot, tumble, fall and shrink away. The minigames
// use them to say how a moment went instead of a floating word (a glitter of gold chips for a fine
// blow or pick, a few pale ones for a so-so one, dark scale for a bad one).
//   chipBurst(parent, worldPos, { n, colors, size, speed, up, gravity, life, glow })
// One pooled InstancedMesh per parent (a THREE.Scene or group); it ticks itself while drawn
// (onBeforeRender), so callers don't need to update anything. Cubes only: no round sprites.
import * as THREE from 'three';

const MAX = 120;
const pools = new WeakMap();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function makePool(parent) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, _c.set(0xffffff));
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  mesh.name = 'voxel-chips';
  const pool = { mesh, chips: [], last: 0 };
  mesh.onBeforeRender = () => step(pool);
  parent.add(mesh);
  return pool;
}

function step(pool) {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - (pool.last || now)) / 1000));
  pool.last = now;
  const { mesh, chips } = pool;
  let n = 0;
  for (let i = 0; i < chips.length; i++) {
    const p = chips[i];
    p.t += dt;
    if (p.t >= p.life) continue;
    p.v.y -= p.g * dt;
    p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
    p.p.addScaledVector(p.v, dt);
    p.r.x += p.w.x * dt; p.r.y += p.w.y * dt; p.r.z += p.w.z * dt;
    const k = p.t / p.life;
    const s = p.size * (k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3)); // shrink away at the end (no fading)
    _m.compose(p.p, _q.setFromEuler(_e.set(p.r.x, p.r.y, p.r.z)), _s.set(s, s, s));
    mesh.setMatrixAt(n, _m);
    mesh.setColorAt(n, _c.setHex(p.c));
    chips[n++] = p;
  }
  chips.length = n;
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  if (!n) { mesh.visible = false; pool.last = 0; }
}

/**
 * A burst of voxel chips at a world point. o: { n = 8, colors = [hex], size (cube edge, world units)
 * = 0.012, speed = 0.5, up (Vector3, the "out" direction) = +y, gravity = 3, life = 0.6, drag = 1.5 }
 */
export function chipBurst(parent, at, o = {}) {
  if (!parent || !at) return;
  let pool = pools.get(parent);
  if (!pool || pool.mesh.parent !== parent) { pool = makePool(parent); pools.set(parent, pool); }
  const n = o.n ?? 8, colors = o.colors || [0xffe08a], size = o.size ?? 0.012, speed = o.speed ?? 0.5;
  const up = o.up || UP, life = o.life ?? 0.6;
  // a frame perpendicular to `up` for the sideways spread
  const side = Math.abs(up.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const t1 = new THREE.Vector3().crossVectors(up, side).normalize(), t2 = new THREE.Vector3().crossVectors(up, t1);
  for (let i = 0; i < n; i++) {
    if (pool.chips.length >= MAX) pool.chips.shift();
    const a = Math.random() * Math.PI * 2, out = speed * (0.35 + Math.random() * 0.75), lift = speed * (0.6 + Math.random() * 0.9);
    const v = new THREE.Vector3().addScaledVector(t1, Math.cos(a) * out).addScaledVector(t2, Math.sin(a) * out).addScaledVector(up, lift);
    pool.chips.push({
      p: new THREE.Vector3(at.x, at.y, at.z), v, t: 0, life: life * (0.7 + Math.random() * 0.6),
      size: size * (0.6 + Math.random() * 0.7), c: colors[(Math.random() * colors.length) | 0],
      g: o.gravity ?? 3, drag: o.drag ?? 1.5,
      r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18),
    });
  }
  pool.mesh.visible = true;
}
