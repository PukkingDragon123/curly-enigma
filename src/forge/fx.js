// Small animation helpers for the forge: a step sequencer, lightning arcs and infusion effects.
import * as THREE from 'three';

/** Sequential timeline: add(dur, fn(k, dt)) runs fn with k 0..1, call(fn) runs once. */
export class Seq {
  constructor() { this.items = []; this.t = 0; this.done = true; }
  add(dur, fn) { this.items.push({ dur, fn }); this.done = false; return this; }
  wait(dur) { return this.add(dur, () => {}); }
  call(fn) { return this.add(0, (k) => { if (k >= 1) fn(); }); }
  clear() { this.items = []; this.t = 0; this.done = true; }
  update(dt) {
    let left = dt;
    while (this.items.length && left >= 0) {
      const it = this.items[0];
      if (it.dur <= 0) { it.fn(1, 0); this.items.shift(); this.t = 0; continue; }
      const room = it.dur - this.t;
      const use = Math.min(room, left);
      this.t += use;
      left -= use;
      it.fn(Math.min(1, this.t / it.dur), use);
      if (this.t >= it.dur - 1e-6) { this.items.shift(); this.t = 0; } else break;
    }
    if (!this.items.length) this.done = true;
  }
}

export const ease = {
  out: (k) => 1 - (1 - k) * (1 - k),
  inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  back: (k) => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  in: (k) => k * k,
};

/** Arc along a quadratic bezier between a and b lifted by `lift`. */
export function arcPoint(a, b, lift, k, out = new THREE.Vector3()) {
  const mx = (a.x + b.x) / 2, my = Math.max(a.y, b.y) + lift, mz = (a.z + b.z) / 2;
  const u = 1 - k;
  out.set(u * u * a.x + 2 * u * k * mx + k * k * b.x, u * u * a.y + 2 * u * k * my + k * k * b.y, u * u * a.z + 2 * u * k * mz + k * k * b.z);
  return out;
}

/** Flickering lightning arcs between random points along a segment. */
export class Lightning {
  constructor(scene, color = 0x9af4ff) {
    this.max = 64;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 2 * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    this.lines = new THREE.LineSegments(this.geo, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 40;
    scene.add(this.lines);
    this.t = 0;
    this.n = 0;
  }
  /** Regenerate arcs between points sampled on segment a→b (world space). */
  strike(a, b, count = 4, reach = 0.18) {
    let k = 0;
    for (let c = 0; c < count; c++) {
      const s = Math.random();
      let p = new THREE.Vector3().lerpVectors(a, b, s);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      const segs = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < segs && k < this.max; i++) {
        const q = p.clone().addScaledVector(dir, reach / segs).add(new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06));
        this.pos.set([p.x, p.y, p.z, q.x, q.y, q.z], k * 6);
        k++;
        p = q;
      }
    }
    this.n = k;
    this.geo.setDrawRange(0, k * 2);
    this.geo.attributes.position.needsUpdate = true;
    this.t = 0.12;
    this.mat.opacity = 1;
  }
  update(dt) {
    this.t -= dt;
    this.lines.visible = this.t > 0;
    this.mat.opacity = Math.max(0, this.t / 0.12);
  }
  dispose() { this.lines.removeFromParent(); this.geo.dispose(); this.mat.dispose(); }
}

/**
 * Per-infusion visual flavor used by the infusion step and the reveal.
 * fx(particles, lightning, a, b, t, dt, k): a/b = blade base/tip in world space, k = intensity.
 */
export const INFUSION_FX = {
  bioxide: { sound: 'zap', color: 0x9af4ff, tick(P, L, a, b, t, dt, k) { if (Math.random() < dt * 14 * k) L.strike(a, b, 3, 0.22); if (Math.random() < dt * 20 * k) P.sparkle(lerpV(a, b, Math.random()), 0xbff8ff, 1, 0.1, 0.1); } },
  magmaite: { sound: 'ignite', color: 0xff7a2a, tick(P, L, a, b, t, dt, k) { for (let i = 0; i < Math.ceil(dt * 70 * k); i++) P.flame(lerpV(a, b, Math.random()), 0.05, 0.9); } },
  frostite: { sound: 'freeze', color: 0xbff6ff, tick(P, L, a, b, t, dt, k) { for (let i = 0; i < Math.ceil(dt * 30 * k); i++) { const p = lerpV(a, b, Math.random()); P.soft.spawn(P.w({ x: p.x + (Math.random() - 0.5) * 0.1, y: p.y, z: p.z + (Math.random() - 0.5) * 0.1, vx: (Math.random() - 0.5) * 0.1, vy: -0.05, vz: (Math.random() - 0.5) * 0.1, life: 1.2, size: 0.03, size1: 0.07, color: 0xffffff, color1: 0xbff6ff, alpha: 0.5, drag: 1 })); } if (Math.random() < dt * 12 * k) P.sparkle(lerpV(a, b, Math.random()), 0xffffff, 2, 0.12, 0.02); } },
  gravium: { sound: 'wisp', color: 0xc9a6ff, tick(P, L, a, b, t, dt, k) { if (Math.random() < dt * 24 * k) P.sparkle(lerpV(a, b, Math.random()), 0xd8b8ff, 2, 0.25, 0.35); } },
  voidstone: { sound: 'wisp', color: 0x7a3fd0, tick(P, L, a, b, t, dt, k) { for (let s = 0; s < 2; s++) { const ang = t * 7 + s * Math.PI; const u = (Math.sin(t * 1.3 + s) * 0.5 + 0.5); const c = lerpV(a, b, u); const r = 0.12; P.soft.spawn(P.w({ x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r * 0.5, z: c.z + Math.sin(ang) * r, life: 0.7, size: 0.05, size1: 0.01, color: 0x2a0a40, color1: 0x7a3fd0, alpha: 0.8 * k, drag: 2 })); } } },
  lumite: { sound: 'glow', color: 0x9dff9a, tick(P, L, a, b, t, dt, k) { if (Math.random() < dt * 22 * k) P.sparkle(lerpV(a, b, Math.random()), 0x9dff9a, 2, 0.12, 0.15); } },
  obsidian_shard: { sound: 'sparkle', color: 0x8a6ab0, tick(P, L, a, b, t, dt, k) { const u = (t * 0.9) % 1; const p = lerpV(a, b, u); P.glow.spawn(P.w({ x: p.x, y: p.y, z: p.z, life: 0.25, size: 0.04, size1: 0.005, color: 0xffffff, color1: 0x8a6ab0 })); } },
  echo_crystal: { sound: 'glow', color: 0x9fd6ff, tick(P, L, a, b, t, dt, k) { if (Math.random() < dt * 6 * k) { const c = lerpV(a, b, 0.5); for (let i = 0; i < 18; i++) { const ang = (i / 18) * Math.PI * 2; P.glow.spawn(P.w({ x: c.x, y: c.y, z: c.z, vx: Math.cos(ang) * 0.5, vy: 0, vz: Math.sin(ang) * 0.5, life: 0.6, size: 0.016, size1: 0.004, color: 0xdff2ff, color1: 0x9fd6ff, drag: 0.5 })); } } } },
  sunstone: { sound: 'sparkle', color: 0xffd34a, tick(P, L, a, b, t, dt, k) { for (let i = 0; i < Math.ceil(dt * 30 * k); i++) { const p = lerpV(a, b, Math.random()); const ang = Math.random() * Math.PI * 2; P.glow.spawn(P.w({ x: p.x, y: p.y, z: p.z, vx: Math.cos(ang) * 0.9, vy: Math.random() * 0.5, vz: Math.sin(ang) * 0.9, life: 0.5, size: 0.02, size1: 0.004, color: 0xfff6c0, color1: 0xffd34a, drag: 1.5 })); } } },
};

function lerpV(a, b, t) { return new THREE.Vector3().lerpVectors(a, b, t); }

// ---------------------------------------------------------------- heat haze
const BAYER = /* glsl */`
float fg_bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float fg_bayer4(vec2 a) { return fg_bayer2(0.5 * a) * 0.25 + fg_bayer2(a); }
`;

/**
 * A camera-facing heat-haze billboard: faint wavy bands of warm light rising off the coals,
 * ordered-dithered so it stays pixel-crisp. Drive userData.shimmer.uTime / uHeat.
 */
export function makeShimmer(w = 1.2, h = 1.0) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uHeat: { value: 0.5 }, uColor: { value: new THREE.Color(0xff9448) }, uSize: { value: new THREE.Vector2(w, h) } },
    vertexShader: /* glsl */`
      uniform vec2 uSize;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mv.xy += (uv - vec2(0.5, 0.0)) * uSize;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uHeat;
      uniform vec3 uColor;
      varying vec2 vUv;
      ${BAYER}
      void main() {
        float x = vUv.x - 0.5;
        float edge = smoothstep(0.5, 0.12, abs(x)) * smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.45, vUv.y);
        float wob = sin(vUv.x * 9.0 + uTime * 2.3) * 2.2 + sin(vUv.x * 23.0 - uTime * 3.1) * 0.6;
        float a = sin(vUv.y * 30.0 - uTime * 7.5 + wob) * 0.5 + 0.5;
        float b = sin(vUv.y * 13.0 - uTime * 4.1 + x * 17.0) * 0.5 + 0.5;
        float i = edge * pow(a * b, 2.2) * uHeat * 0.3;
        float q = floor(i * 6.0 + fg_bayer4(gl_FragCoord.xy)) / 6.0;
        if (q <= 0.0) discard;
        gl_FragColor = vec4(uColor * q, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.frustumCulled = false;
  m.renderOrder = 15;
  m.userData.shimmer = mat.uniforms;
  m.userData.dynamic = true;
  return m;
}
