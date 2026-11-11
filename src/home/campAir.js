// The air in Old Star's camp (made by the scene, nothing of it in the build jobs): the cold shaft of
// daylight down the hole you fell through (a soft beam you see from anywhere in the hollow, dust
// turning in it), smoke off the fire pit curling up to the black patch it has made on the roof,
// wisps leaking from under the forge's hood (more when the bellows blow), the kettle's steam,
// sparks popping off the logs, and moths round the lanterns, bumping the glass. Meters.
import * as THREE from 'three';
import { HALL, HOLE, FRONT } from './units.js';
import { HOLE_SHAFT } from './plan.js';
import { rand } from '../core/util.js';

const Y = HALL.y;

// ---------------------------------------------------------------- the beam of daylight down the hole
const BEAM_V = /* glsl */`
  varying vec3 vW; varying vec3 vN; varying float vH;
  uniform float uY0; uniform float uY1;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
    vH = clamp((w.y - uY0) / (uY1 - uY0), 0.0, 1.0);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const BEAM_F = /* glsl */`
  varying vec3 vW; varying vec3 vN; varying float vH;
  uniform float uTime; uniform float uK; uniform vec3 uCol; uniform vec2 uC;
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  void main() {
    vec3 V = normalize(cameraPosition - vW);
    // (the shell is voxel-stepped: the beam's softness comes from the way out of its axis, not the faces')
    vec3 N = normalize(vec3(vW.x - uC.x, 0.0, vW.z - uC.y) + vec3(vN.x, 0.0, vN.z) * 0.15);
    vec3 Vh = normalize(vec3(V.x, 0.0, V.z) + 1e-5);
    float face = abs(dot(N, Vh));               // 1 through the beam's middle, 0 at its edges
    float core = pow(face, 2.2);
    float a = atan(vW.z - uC.y, vW.x - uC.x);
    // slow streaks of brighter air drifting round the beam, and down it
    float streak = 0.62 + 0.38 * sin(a * 5.0 + uTime * 0.13) * sin(a * 3.0 - uTime * 0.09 + vH * 2.6);
    streak *= 0.8 + 0.2 * sin(vW.y * 6.0 - uTime * 0.35 + a * 2.0);
    float fall = smoothstep(0.0, 0.18, vH) * (0.45 + 0.55 * vH) * (1.0 - smoothstep(0.93, 1.0, vH) * 0.6);
    // (from inside the beam, looking up it, it mustn't wash the view out)
    float inside = smoothstep(0.15, 0.85, length(cameraPosition.xz - uC));
    float k = core * streak * fall * uK * (0.25 + 0.75 * inside);
    // in steps, dithered (the game's pixel look)
    k = floor(k * 10.0 + bayer4(gl_FragCoord.xy) * 0.999) / 10.0;
    if (k <= 0.0) discard;
    gl_FragColor = vec4(uCol * k, k);
  }`;

/**
 * The beam's shell, voxel-stepped like the rock it comes down through: in bands `band` m tall, the
 * outline of the 1/16 m cells inside a circle of radius r0 (bottom) .. r1 (top), as vertical faces
 * (bands with the same outline merge). Centred on x = z = 0, from y0 to y1 (m). Open top and bottom.
 */
function voxelBeamShell(r0, r1, y0, y1, cell = 1 / 16, band = 0.2) {
  const pos = [], nor = [], idx = [];
  const nb = Math.max(1, Math.round((y1 - y0) / band));
  const outline = (r) => {
    const n = Math.ceil(r / cell) + 1, inside = (i, k) => Math.hypot((i + 0.5) * cell, (k + 0.5) * cell) <= r;
    const E = [];
    for (let k = -n; k < n; k++) for (let i = -n; i < n; i++) {
      if (!inside(i, k)) continue;
      const x0 = i * cell, z0 = k * cell, x1 = x0 + cell, z1 = z0 + cell;
      if (!inside(i + 1, k)) E.push([x1, z0, x1, z1, 1, 0]);
      if (!inside(i - 1, k)) E.push([x0, z1, x0, z0, -1, 0]);
      if (!inside(i, k + 1)) E.push([x1, z1, x0, z1, 0, 1]);
      if (!inside(i, k - 1)) E.push([x0, z0, x1, z0, 0, -1]);
    }
    return E;
  };
  let run = null;
  const flush = () => {
    if (!run) return;
    for (const [ax, az, bx, bz, nx, nz] of run.E) {
      const v = pos.length / 3;
      pos.push(ax, run.ya, az, bx, run.ya, bz, bx, run.yb, bz, ax, run.yb, az);
      for (let q = 0; q < 4; q++) nor.push(nx, 0, nz);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
  };
  for (let b = 0; b < nb; b++) {
    const ya = y0 + (y1 - y0) * (b / nb), yb = y0 + (y1 - y0) * ((b + 1) / nb);
    const r = r0 + (r1 - r0) * ((b + 0.5) / nb);
    const key = Math.ceil(r / cell * 4); // (outlines change in quarter-cell steps of radius)
    if (run && run.key === key) { run.yb = yb; continue; }
    flush();
    run = { key, ya, yb, E: outline(r) };
  }
  flush();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

function makeBeam() {
  const y0 = Y + 0.01, y1 = HOLE_SHAFT.top + 0.2;
  const geo = voxelBeamShell(HOLE_SHAFT.r * 0.78, HOLE_SHAFT.r * 1.12, y0, y1);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uK: { value: 0.16 }, uCol: { value: new THREE.Color(0x9ab8d8) }, uC: { value: new THREE.Vector2(HOLE.x, HOLE.z) }, uY0: { value: y0 }, uY1: { value: y1 } },
    vertexShader: BEAM_V, fragmentShader: BEAM_F,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(HOLE.x, 0, HOLE.z);
  m.renderOrder = 7;
  m.frustumCulled = true;
  return m;
}

// ---------------------------------------------------------------- a moth
/** A dusty moth: two wings and a body, the wings beating (its few vertices rewritten each frame). */
class Moth {
  constructor(c, seed) {
    this.c = c; // the lantern (m)
    this.t = seed * 3.1;
    this.ph = seed;
    this.a = seed * 2;
    this.r = 0.16;
    this.pos = new THREE.Vector3(c.x + 0.16, c.y, c.z);
    this.heading = 0;
    // 3 quads: left wing, right wing, body (a thin cross)
    const g = new THREE.BufferGeometry();
    this.P = new Float32Array(12 * 3);
    const col = new Float32Array(12 * 3);
    const wing = [0.62, 0.55, 0.44], dark = [0.4, 0.34, 0.28];
    for (let i = 0; i < 12; i++) { const c3 = i < 8 ? (i % 4 < 2 ? dark : wing) : dark; col.set(c3, i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]);
    this.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: 0x2a2018 }));
    this.mesh.frustumCulled = false;
  }

  update(dt) {
    this.t += dt;
    const t = this.t, c = this.c;
    // circling the light, wandering in and out, now and then darting at the glass
    const dart = Math.max(0, Math.sin(t * 0.7 + this.ph) - 0.82) * 5.5;
    this.a += dt * (2.4 + 1.6 * Math.sin(t * 0.9 + this.ph) + Math.sin(t * 5.3) * 0.8);
    const r = 0.17 + 0.07 * Math.sin(t * 1.3 + this.ph) + 0.03 * Math.sin(t * 7.1) - dart * 0.12;
    const tx = c.x + Math.cos(this.a) * r, tz = c.z + Math.sin(this.a) * r;
    const ty = c.y + 0.05 * Math.sin(t * 2.1 + this.ph) + 0.025 * Math.sin(t * 9.3) - 0.03;
    const p = this.pos, k = Math.min(1, dt * 14);
    const ox = p.x, oz = p.z;
    p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; p.z += (tz - p.z) * k;
    if (Math.hypot(p.x - ox, p.z - oz) > 1e-5) this.heading = Math.atan2(p.x - ox, p.z - oz);
    // wings: a fast beat, a glide now and then
    const beat = Math.sin(t * 46 + this.ph) * (Math.sin(t * 1.7 + this.ph) > 0.85 ? 0.15 : 0.95);
    const s = 0.024, ch = Math.cos(this.heading), sh = Math.sin(this.heading);
    // local: x across (right), z along (front); wing out to ±x, lifted by the beat
    const P = this.P;
    const put = (i, lx, ly, lz) => { P[i * 3] = p.x + lx * ch + lz * sh; P[i * 3 + 1] = p.y + ly; P[i * 3 + 2] = p.z - lx * sh + lz * ch; };
    for (const side of [-1, 1]) {
      const o = side < 0 ? 0 : 4, cw = Math.cos(beat), sw = Math.sin(beat);
      put(o, 0, 0, s * 0.45);
      put(o + 1, side * s * cw, s * sw, s * 0.25);
      put(o + 2, side * s * 0.9 * cw, s * 0.9 * sw, -s * 0.45);
      put(o + 3, 0, 0, -s * 0.3);
    }
    put(8, -0.003, 0.002, s * 0.5); put(9, 0.003, 0.002, s * 0.5); put(10, 0.003, -0.002, -s * 0.5); put(11, -0.003, -0.002, -s * 0.5);
    this.mesh.geometry.attributes.position.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- the camp's air
export class CampAir {
  /** s: the HomeScene (its cave, fx, rig). */
  constructor(s) {
    this.s = s;
    const c = s.cave;
    this.beam = makeBeam();
    s.scene.add(this.beam);
    // moths at the lantern over the middle of the hollow and the one by the door
    const lamps = c.lights.filter((l) => l.kind === 'lantern');
    const pickL = (x, z) => lamps.reduce((b, l) => (Math.hypot(l.x - x, l.z - z) < Math.hypot(b.x - x, b.z - z) ? l : b), lamps[0]);
    this.moths = lamps.length ? [pickL(5.3, -2.6), pickL(7.2, -4.0)].filter((l, i, a) => a.indexOf(l) === i).map((l, i) => new Moth({ x: l.x, y: l.y, z: l.z }, i * 1.7 + 0.4)) : [];
    for (const m of this.moths) s.scene.add(m.mesh);
    // (drawn only while the camp is: rooms.js culls them with its meshes)
    (c.roomMeshes.camp ||= []).push(this.beam, ...this.moths.map((m) => m.mesh));
    this.t = { smoke: 0, forge: 0.5, dust: 0, spark: 2, steam: 0, grit: 3, draught: 0 };
  }

  update(dt, time) {
    const s = this.s, c = s.cave, fx = s.fx, p = s.rig.player.pos, T = this.t;
    if (!c || !fx) return;
    this.beam.material.uniforms.uTime.value = time;
    // (a little brighter when you're under it, so the cold light reads against the dark roof)
    const dh = Math.hypot(p.x - HOLE.x, p.z - HOLE.z);
    this.beam.material.uniforms.uK.value = 0.1 + 0.04 * Math.max(0, 1 - dh / 5);
    const near = (q, r) => q && Math.hypot(q.x - p.x, q.z - p.z) < r;
    for (const m of this.moths) if (near(m.c, 9)) m.update(dt);
    // smoke off the fire pit, curling up toward the black patch on the roof
    const h = c.dyn.hearth?.fire;
    if (h && near(h, 10)) {
      T.smoke -= dt;
      if (T.smoke <= 0) {
        T.smoke = 0.26;
        fx.spawn({ x: h.x + rand(-0.1, 0.1), y: h.y + 0.22, z: h.z + rand(-0.1, 0.1), vx: rand(-0.04, 0.04), vy: rand(0.24, 0.34), vz: rand(-0.04, 0.04), life: rand(4.5, 6.5), size: 0.05, grow: 0.11, color: [0.27, 0.25, 0.25], alpha: 0.2, drag: 0.32, grav: -0.012, swirl: 0.05 });
      }
      // a log settles: sparks fly up
      T.spark -= dt;
      if (T.spark <= 0) {
        T.spark = rand(2.5, 6);
        const n = 4 + Math.floor(Math.random() * 6);
        for (let i = 0; i < n; i++) fx.spawn({ x: h.x + rand(-0.08, 0.08), y: h.y, z: h.z + rand(-0.08, 0.08), vx: rand(-0.35, 0.35), vy: rand(1.2, 2.2), vz: rand(-0.35, 0.35), life: rand(0.6, 1.3), size: rand(0.008, 0.014), color: Math.random() < 0.5 ? [1, 0.62, 0.2] : [1, 0.85, 0.45], glow: true, drag: 1.1, grav: 1.2 });
      }
    }
    // wisps from under the forge's hood (more while the bellows blow)
    const f = c.dyn.forge?.fire;
    if (f && near(f, 8)) {
      T.forge -= dt;
      if (T.forge <= 0) {
        const air = s.forgeAir || 0;
        T.forge = 0.9 - air * 0.6;
        fx.spawn({ x: f.x + rand(-0.25, 0.25), y: f.y + 0.32, z: f.z + 0.3 + rand(0, 0.1), vx: rand(-0.03, 0.03), vy: rand(0.12, 0.2), vz: rand(0.02, 0.06), life: rand(2.5, 3.5), size: 0.04, grow: 0.07, color: [0.17, 0.16, 0.16], alpha: 0.12, drag: 0.4, grav: -0.01, swirl: 0.04 });
      }
    }
    // the caved-in door to Deep Town: grit trickling from its cracked arch now and then, a cold draught through the rubble
    if (!s.doorOpen && Math.hypot(p.x - FRONT.x, p.z - FRONT.z) < 6) {
      T.grit -= dt;
      if (T.grit <= 0) {
        T.grit = rand(3, 8);
        const gx = FRONT.x + rand(-0.3, 0.3), n = 2 + Math.floor(Math.random() * 5);
        for (let i = 0; i < n; i++) fx.spawn({ x: gx + rand(-0.03, 0.03), y: Y + 1.12, z: FRONT.z + 0.08, vx: rand(-0.02, 0.02), vy: rand(-0.2, 0), vz: rand(0, 0.03), life: 1.4, size: rand(0.005, 0.01), color: [0.32, 0.3, 0.28], alpha: 0.9, drag: 0.05, grav: 6, bounce: 0.1 });
      }
      T.draught -= dt;
      if (T.draught <= 0) {
        T.draught = 0.35;
        fx.spawn({ x: FRONT.x + rand(-0.35, 0.35), y: Y + rand(0.15, 0.9), z: FRONT.z + 0.15, vx: rand(-0.03, 0.03), vy: rand(-0.005, 0.01), vz: rand(0.04, 0.09), life: rand(4, 6), size: rand(0.003, 0.006), color: [0.7, 0.8, 0.95], alpha: 0.4, drag: 0.08, grav: -0.002 });
      }
    }
    // dust turning in the beam of daylight
    if (dh < 9) {
      T.dust -= dt;
      if (T.dust <= 0) {
        T.dust = 0.11;
        const r = HOLE_SHAFT.r * 1.05 * Math.sqrt(Math.random()), an = Math.random() * Math.PI * 2;
        fx.spawn({ x: HOLE.x + Math.cos(an) * r, y: Y + rand(0.15, 2.0), z: HOLE.z + Math.sin(an) * r, vx: rand(-0.012, 0.012), vy: rand(-0.025, 0.01), vz: rand(-0.012, 0.012), life: rand(4, 7), size: rand(0.0035, 0.006), color: [0.78, 0.88, 1], alpha: 0.55, glow: true, drag: 0.05, grav: 0.002, swirl: 0.012 });
      }
    }
  }

  dispose() {
    this.s.scene.remove(this.beam);
    this.beam.geometry.dispose();
    this.beam.material.dispose();
    for (const m of this.moths) { this.s.scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose(); }
  }
}
