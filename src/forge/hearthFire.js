// The hearth's fire as voxels: licking tongues of flame built every frame out of tiny cubes
// (one instanced draw, no outline) over the coal bed, banded white-yellow at the root through
// orange and red to a dark-red tip, swaying, flickering, now and then throwing off a lick that
// rises and dies. The coals under them "breathe": hot patches crawl across the bed and every
// stroke of the bellows makes the whole bed flare. Stoking (a poke of the coals) heaves the bed,
// kicks up sparks and makes the fire jump.
//
//   const fire = new HearthFire(W, { max })     W: the forge world (hearth, firePos)
//   fire.update(dt, time, { air, glow, magma })  per frame (air 0..1 from the bellows)
//   fire.pulse(k)                                 a bellows stroke: the coals flare
//   fire.stoke()                                  a poke: the bed heaves, the flames jump
//   fire.heat                                     0..~1.6, how bright the fire is right now (lights)
//   fire.count                                    voxels drawn this frame
import * as THREE from 'three';
import { S as WS } from './world.js';

const VOX = 1 / 64; // flame voxels: fine (a flame is a small thing)
const _c = new THREE.Color();
const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// colour bands up a tongue (0 root → 1 tip), cool / hot (the bellows push it toward white)
const BANDS = [
  [0.0, 0xffe6a0, 0xfff6d8],
  [0.14, 0xffc650, 0xffe090],
  [0.32, 0xff9a2a, 0xffc04a],
  [0.52, 0xf06a16, 0xff9228],
  [0.72, 0xc83c0c, 0xf0661a],
  [0.88, 0x8e2008, 0xc23a0c],
  [1.01, 0x541006, 0x861c08],
];
const BAND_C = BANDS.map(([u, a, b]) => [u, new THREE.Color(a), new THREE.Color(b)]);
function bandColor(u, hot, out) {
  for (let i = 1; i < BAND_C.length; i++) {
    if (u <= BAND_C[i][0]) {
      const [, a0, b0] = BAND_C[i - 1];
      // stepped, not blended: a flame in pixel art has hard colour bands
      return out.copy(a0).lerp(b0, hot);
    }
  }
  return out.copy(BAND_C[BAND_C.length - 1][1]);
}

export class HearthFire {
  constructor(W, opts = {}) {
    this.W = W;
    const max = opts.max ?? 1100;
    this.max = max;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.setRGB(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 9;
    this.mesh.userData.dynamic = true;
    W.root.add(this.mesh);
    const fp = W.firePos;
    this.origin = fp.clone();
    const bed = W.hearth.bed, S = WS;
    this.bedW = bed.w * S * 0.82;
    this.bedD = bed.d * S * 0.7;
    // the tongues: rooted over the bed, more and taller in its hot middle
    this.tongues = [];
    const N = opts.tongues ?? 26;
    for (let i = 0; i < N; i++) {
      const a = hash(i, 1), b = hash(i, 2);
      const x = (a - 0.5) * this.bedW, z = (b - 0.5) * this.bedD * 0.9 - this.bedD * 0.05;
      const r = Math.hypot(x / (this.bedW / 2), z / (this.bedD / 2));
      this.tongues.push({
        x, z, r, rank: hash(i, 3), phase: hash(i, 4) * 6.28, freq: 1.6 + hash(i, 5) * 1.8,
        w0: 0.9 + (1 - r) * 1.1 + hash(i, 6) * 0.7, h: 0, lick: -1, lickY: 0, lickH: 0, nextLick: hash(i, 7) * 2,
      });
    }
    this.t = 0;
    this.flare = 0; // stoke / bellows-stroke boost, decays
    this.breath = 0; // the coals' flare from the last stroke
    this.heave = 0;
    this.heat = 0.5;
    this.count = 0;
    /** { x, w } (world x and half width): keep the flames low there (the work lies in the coals). */
    this.keepClear = null;
    // the coals breathe: hot patches crawl over the bed, and the bed flares with each stroke
    this.coalU = { uTime: { value: 0 }, uBreath: { value: 0 }, uAir: { value: 0 } };
    const cm = W.hearth.coalMat, u = this.coalU;
    cm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vCW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCW = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = `uniform float uTime; uniform float uBreath; uniform float uAir; varying vec3 vCW;
float cb_h(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float cb_n(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(cb_h(i), cb_h(i + vec3(1,0,0)), f.x), mix(cb_h(i + vec3(0,1,0)), cb_h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(cb_h(i + vec3(0,0,1)), cb_h(i + vec3(1,0,1)), f.x), mix(cb_h(i + vec3(0,1,1)), cb_h(i + vec3(1,1,1)), f.x), f.y), f.z); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 q = floor(vCW / ${(1 / 45).toFixed(5)});
  float n = cb_n(q * 0.42 + vec3(uTime * 0.35, -uTime * 0.5, uTime * 0.27)) * 0.75 + cb_h(q) * 0.25;
  float k = 0.5 + n * (0.85 + uBreath * 0.5) + uBreath * 0.3;
  diffuseColor.rgb *= k;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.96, 0.82), clamp((n - 0.72) * 2.5, 0.0, 1.0) * (0.25 + uAir * 0.55 + uBreath * 0.4));
}`);
    };
    cm.customProgramCacheKey = () => 'fg-coal-breath';
    cm.needsUpdate = true;
    // the bed (its glowing and its dark lumps sit together) heaves when it's poked
    this.coalMeshes = [];
    const hot = W.hearth.group.children.find((o) => o.isMesh && o.material === cm);
    if (hot) for (const o of W.hearth.group.children) if (o.isMesh && o.position.distanceToSquared(hot.position) < 1e-8) this.coalMeshes.push({ m: o, y: o.position.y });
  }

  /** A bellows stroke: the bed flares and the flames lean up. */
  pulse(k = 1) { this.breath = Math.min(1.4, this.breath + 0.6 * k); this.flare = Math.min(1.2, this.flare + 0.35 * k); }

  /** A poke of the coals: the bed heaves, sparks, the fire jumps. */
  stoke() { this.heave = 1; this.flare = Math.min(1.6, this.flare + 1.0); this.breath = Math.min(1.6, this.breath + 1.0); }

  update(dt, time, o = {}) {
    const air = o.air ?? 0, glow = o.glow ?? 0.5;
    this.t = time;
    this.flare = Math.max(0, this.flare - dt * 0.9);
    this.breath = Math.max(0, this.breath - dt * 1.6);
    this.heave = Math.max(0, this.heave - dt * 1.8);
    const u = this.coalU;
    u.uTime.value = time; u.uBreath.value = this.breath; u.uAir.value = air;
    // the bed heaves when poked
    for (const c of this.coalMeshes) c.m.position.y = c.y + Math.sin(this.heave * 14) * this.heave * 0.012;
    const roar = Math.min(1.5, air * 0.9 + this.flare * 0.6 + (o.magma ? 0.3 : 0));
    const hot = Math.min(0.85, air * 0.6 + this.flare * 0.35 + (o.magma ? 0.2 : 0));
    const arr = this.mesh.instanceMatrix.array;
    const col = this.mesh.instanceColor.array;
    let n = 0, sumH = 0;
    const max = this.max, ox = this.origin.x, oy = this.origin.y - VOX * 1.5, oz = this.origin.z;

    const put = (x, y, z, s, c) => {
      if (n >= max) return;
      // snap to the voxel grid so the flame reads as cubes
      const gx = Math.round((ox + x) / VOX) * VOX, gy = Math.round((oy + y) / VOX) * VOX, gz = Math.round((oz + z) / VOX) * VOX;
      const i = n * 16;
      arr[i] = s; arr[i + 1] = 0; arr[i + 2] = 0; arr[i + 3] = 0;
      arr[i + 4] = 0; arr[i + 5] = s; arr[i + 6] = 0; arr[i + 7] = 0;
      arr[i + 8] = 0; arr[i + 9] = 0; arr[i + 10] = s; arr[i + 11] = 0;
      arr[i + 12] = gx; arr[i + 13] = gy; arr[i + 14] = gz; arr[i + 15] = 1;
      col[n * 3] = c.r; col[n * 3 + 1] = c.g; col[n * 3 + 2] = c.b;
      n++;
    };
    const active = 0.62 + Math.min(1, roar) * 0.38; // share of tongues alight
    const slot = Math.floor(time * 14); // flicker frames (a pixel-art flame steps, it doesn't glide)
    for (let ti = 0; ti < this.tongues.length; ti++) {
      const tg = this.tongues[ti];
      if (tg.rank > active) { tg.h = 0; continue; }
      // height: base by where it sits, breathing with its own rhythm, jumping with the bellows
      const wob = Math.sin(time * tg.freq + tg.phase) * 0.5 + Math.sin(time * tg.freq * 2.3 + tg.phase * 1.7) * 0.3 + (hash(ti, slot) - 0.5) * 0.4;
      const hBase = (5 + (1 - tg.r) * 8) * (0.72 + glow * 0.42);
      let want = Math.max(2, hBase * (1 + roar * 0.6) + wob * (2 + roar * 1.6));
      // round the work in the coals the flames stay low and lick up its sides
      const kc = this.keepClear;
      if (kc) { const d = Math.abs(ox + tg.x - kc.x); if (d < kc.w * 2.2) want = Math.max(1, want * (d < kc.w ? 0.22 : 0.55)); }
      tg.h += (want - tg.h) * Math.min(1, dt * 12);
      const h = Math.round(tg.h);
      sumH += h;
      const w0 = tg.w0 * (0.9 + roar * 0.35);
      const lean = Math.sin(time * 0.9 + tg.phase) * 0.6 + (air > 0.1 ? -0.4 * air : 0); // the draught off the tuyere leans it
      for (let j = 0; j < h; j++) {
        const u01 = j / Math.max(1, h - 1);
        const hw = Math.max(0, w0 * (1 - Math.pow(u01, 1.25)) * (0.85 + 0.25 * Math.sin(j * 0.9 + time * 7 + tg.phase)));
        const sway = (Math.sin(time * (tg.freq * 2.1) + j * 0.45 + tg.phase) * 1.1 + lean) * Math.pow(u01, 1.3) * 1.6;
        const cx = tg.x / VOX + sway, cz = tg.z / VOX + Math.cos(time * tg.freq + j * 0.4 + tg.phase) * 0.5 * u01;
        const r = Math.round(hw);
        // dithered tip: the last rows flicker in and out
        if (u01 > 0.7 && hash(ti * 31 + j, slot) < (u01 - 0.7) * 1.6) continue;
        for (let dx = -r; dx <= r; dx++) {
          const dz = Math.abs(dx) < r ? (r > 1 ? 1 : 0) : 0;
          for (let zz = -dz; zz <= dz; zz++) {
            const outer = Math.abs(dx) === r && r > 0;
            bandColor(Math.min(1, u01 + (outer ? 0.18 : 0) + (Math.abs(zz) ? 0.08 : 0)), hot, _c);
            put((cx + dx) * VOX, j * VOX, (cz + zz) * VOX, VOX, _c);
          }
        }
      }
      // licks: now and then the tip tears off and rises, shrinking, before it dies
      tg.nextLick -= dt * (0.6 + roar);
      if (tg.lick < 0 && tg.nextLick <= 0 && h > 4) { tg.lick = 0; tg.lickY = h * 0.75; tg.lickH = Math.max(2, Math.round(h * 0.3)); tg.nextLick = 0.6 + hash(ti, slot + 3) * 1.6; }
      if (tg.lick >= 0) {
        tg.lick += dt * 2.6;
        const life = tg.lick;
        if (life >= 1) tg.lick = -1;
        else {
          const y0 = tg.lickY + life * 9 * (1 + roar * 0.6), lh = Math.max(1, Math.round(tg.lickH * (1 - life)));
          const sx = tg.x / VOX + Math.sin(time * 3 + tg.phase) * 1.4;
          for (let j = 0; j < lh; j++) {
            bandColor(0.55 + life * 0.45 + (j / lh) * 0.15, hot * 0.6, _c);
            put(sx * VOX, (y0 + j) * VOX, tg.z, VOX, _c);
            if (lh > 2 && j < lh - 1) put((sx + 1) * VOX, (y0 + j) * VOX, tg.z, VOX, _c);
          }
        }
      }
    }
    this.mesh.count = n;
    this.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    // how bright the fire is now (drives the room's light so it flickers with the flames)
    const lit = this.tongues.length ? sumH / (this.tongues.length * 9) : 0;
    this.heat = 0.35 + lit * 0.7 + this.breath * 0.25;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.dispose?.();
    this.mat.dispose();
  }
}
