// The fluid surface material (water and lava; the mesher's fluid geometry: see Mesher.js).
//
// Water is drawn over a copy of the opaque scene (colour + depth) taken just before the first water
// surface of the frame (WaterGrab, a framebuffer blit from the engine's scene target), so it can:
// refract what lies under it (whole-pixel offsets from the wave normals), tint and fog it by how
// much water the eye looks through (Beer-Lambert, in pixel steps), foam where it gets thin at the
// shores, show the floor's caustics when the terrain doesn't draw them itself, and reflect the lit
// cave above it (a short screen-space march). Surfaces bend with the swell, ripple rings and the
// jelly wobble (fsurf, mirrored in JS by Fluids.waveAt), flowing water shows streaks and foam
// running downstream, falling water rushes in streaks with a foamy lip, impact points churn with
// foam, and the helmet lamp and nearby lights glint off the wavelets. From below, the surface is a
// Snell's window onto the cave above with total internal reflection around it. Lava keeps its own
// look: drifting crust plates that crack and heal, glowing seams and slow heat pulses.
import * as THREE from 'three';
import { LIGHT, MAX_LIGHTS, fluidUniforms } from '../TerrainMaterial.js';
import { CAUSTIC_GLSL } from './caustics.js';

export const MAX_IMPACTS = 6;

/**
 * Copies the engine's scene target (colour + depth) into its own target the moment the first
 * water surface is about to draw (all opaque geometry is in by then).
 */
export class WaterGrab {
  constructor() {
    this.rt = null;
    this.frame = -1;
    this.ok = false;
    this.inited = false;
  }
  ensure(w, h) {
    if (this.rt && this.rt.width === w && this.rt.height === h) return;
    this.rt?.dispose();
    const rt = new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    rt.texture.generateMipmaps = false;
    rt.depthTexture = new THREE.DepthTexture(w, h);
    rt.depthTexture.type = THREE.UnsignedIntType;
    rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
    this.rt = rt;
    this.inited = false;
  }
  /** Called from the water material's onBeforeRender; true when the copy is current. */
  take(renderer) {
    const fr = renderer.info.render.frame;
    if (fr === this.frame) return this.ok;
    this.frame = fr;
    this.ok = false;
    const src = renderer.getRenderTarget();
    if (!src || src.samples > 0 || !src.depthTexture) return false;
    const w = src.width, h = src.height;
    this.ensure(w, h);
    const gl = renderer.getContext(), P = renderer.properties, state = renderer.state;
    if (!this.inited) { renderer.initRenderTarget(this.rt); this.inited = true; }
    const sfb = P.get(src).__webglFramebuffer, dfb = P.get(this.rt).__webglFramebuffer;
    if (!sfb || !dfb || Array.isArray(sfb)) { state.bindFramebuffer(gl.FRAMEBUFFER, sfb || null); return false; }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sfb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dfb);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, sfb);
    state.bindFramebuffer(gl.FRAMEBUFFER, sfb); // keep three's bookkeeping in step
    this.ok = true;
    return true;
  }
  dispose() { this.rt?.dispose(); this.rt = null; }
}

// surface height offset (h, dh/dx, dh/dz) at p (xz, m) on a sheet at height y: a slow swell,
// damped-spring ripple rings (the centre dips, springs back past rest and rings outward) and the
// jelly wobble. Fluids.waveAt mirrors this in JS so the swimming mole bobs on the same waves.
const FLUID_SURF = /* glsl */`
  uniform vec4 fRip[8];
  uniform float fRipK[8];
  uniform vec4 fJig;
  vec3 fsurf(vec2 p, float y, float lava, float amp) {
    float t = time;
    float s = mix(1.0, 0.4, lava);
    vec2 d1 = vec2(0.8, 0.6) * 2.4, d2 = vec2(-0.45, 0.89) * 3.6, d3 = vec2(0.96, -0.28) * 6.1;
    float a1 = 0.011 * amp, a2 = 0.007 * amp, a3 = 0.0035 * amp * (1.0 - lava);
    float p1 = dot(p, d1) + t * 1.4 * s, p2 = dot(p, d2) - t * 1.9 * s, p3 = dot(p, d3) + t * 3.1;
    vec3 h = vec3(a1 * sin(p1), a1 * cos(p1) * d1) + vec3(a2 * sin(p2), a2 * cos(p2) * d2) + vec3(a3 * sin(p3), a3 * cos(p3) * d3);
    float spd = mix(1.3, 0.5, lava), kk = mix(14.0, 8.0, lava), damp = mix(1.6, 1.0, lava);
    for (int i = 0; i < 8; i++) {
      float k = fRipK[i];
      if (k == 0.0) continue;
      vec4 r = fRip[i];
      float age = t - r.w;
      if (age < 0.0 || age > 4.5 || abs(y - r.y) > 0.7) continue;
      vec2 dv = p - r.xz;
      float d = length(dv);
      float front = age * spd + 0.12;
      if (d > front + 0.3) continue;
      float env = exp(-age * damp) * (1.0 - smoothstep(front - 0.15, front + 0.3, d)) / (1.0 + d * 2.2);
      float ph = kk * d - kk * spd * 0.9 * age;
      float A = -0.075 * k * amp * env;
      h.x += A * cos(ph);
      h.yz -= A * kk * sin(ph) * dv / max(d, 1e-3);
    }
    if (fJig.w != 0.0 && abs(y - fJig.y) < 0.7) {
      vec2 q = p - fJig.xz;
      float fall = exp(-dot(q, q) * 0.15) * amp * fJig.w;
      float sx = sin(q.x * 3.3 + 0.7), sz = sin(q.y * 2.9 + 1.3);
      h.x += fall * sx * sz;
      h.yz += fall * vec2(3.3 * cos(q.x * 3.3 + 0.7) * sz, 2.9 * sx * cos(q.y * 2.9 + 1.3));
    }
    return h;
  }
`;

/**
 * Uniforms of the water look that Fluids drives each frame (shared object; also on the material).
 * wImp[i]: falling water landing (x, y, z, strength). wLook: x murk (absorption scale), y refraction
 * strength, z reflections on (0/1), w the terrain draws caustics itself (0/1).
 */
export function waterUniforms(U) {
  if (!U.wImp) {
    const imp = [];
    for (let i = 0; i < MAX_IMPACTS; i++) imp.push(new THREE.Vector4(0, -9999, 0, 0));
    U.wImp = { value: imp };
    U.wLook = { value: new THREE.Vector4(1, 1, 1, 0) };
  }
  return U;
}

export function makeWaterMaterial(U, grab) {
  fluidUniforms(U);
  waterUniforms(U);
  const own = {
    tGrab: { value: null },
    tGrabD: { value: null },
    uGrab: { value: new THREE.Vector4(1, 1, 0, 0) }, // 1/w, 1/h, copy ok, -
    uCam: { value: new THREE.Vector4(0.03, 60, 0, 0) }, // near, far
    uFwd: { value: new THREE.Vector3(0, 0, -1) },
    uVP: { value: new THREE.Matrix4() },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...U, ...own },
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    vertexShader: /* glsl */`
      attribute vec4 vdata;
      attribute vec4 fdata;
      uniform float time;
      uniform vec4 fLake[2];
      uniform float fLakeDrop[2];
      ${FLUID_SURF}
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vMat;
      varying vec4 vInfo;
      varying vec2 vFlow;
      varying float vTopE;
      const vec3 NRM[6] = vec3[6](vec3(1.,0.,0.), vec3(-1.,0.,0.), vec3(0.,1.,0.), vec3(0.,-1.,0.), vec3(0.,0.,1.), vec3(0.,0.,-1.));
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float lava = vdata.y > 40.5 ? 1.0 : 0.0;
        float depth = fdata.x / 64.0;
        vTopE = mod(vdata.z, 2.0) > 0.5 ? 1.0 : 0.0; // 1 along the surface, 0 down a side face
        if (vTopE > 0.5) {
          for (int i = 0; i < 2; i++) {
            if (fLakeDrop[i] > 0.0 && abs(wp.y - fLake[i].y) < 0.01 && length(wp.xz - fLake[i].xz) < fLake[i].w + 0.6) wp.y -= fLakeDrop[i];
          }
          wp.y += fsurf(wp.xz, wp.y, lava, clamp(depth / 0.25, 0.15, 1.0)).x;
        }
        vWorld = wp.xyz;
        vN = NRM[int(vdata.x + 0.5)];
        vMat = vdata.y;
        vInfo = vec4(vdata.w / 255.0, fdata.w / 255.0, depth, vdata.z);
        vFlow = (fdata.yz - 128.0) / 16.0;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D palette;
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float time;
      uniform sampler2D tGrab;
      uniform sampler2D tGrabD;
      uniform vec4 uGrab;
      uniform vec4 uCam;
      uniform vec3 uFwd;
      uniform mat4 uVP;
      uniform vec4 wImp[${MAX_IMPACTS}];
      uniform vec4 wLook;
      uniform sampler2D wcFlow;
      uniform vec4 wcO;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vMat;
      varying vec4 vInfo; // shore foam, open-edge foam, column depth (m), flags
      varying vec2 vFlow;
      varying float vTopE;
      ${LIGHT}
      ${FLUID_SURF}
      ${CAUSTIC_GLSL}
      vec3 pal(float m, float c) { return texture2D(palette, vec2((c + 0.5) / 8.0, (m + 0.5) / 256.0)).rgb; }
      float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(fh(i), fh(i + vec2(1.0, 0.0)), f.x), mix(fh(i + vec2(0.0, 1.0)), fh(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      // moving cells: x nearest distance, y second nearest, z id of the nearest
      vec3 cells(vec2 p, float t) {
        vec2 g = floor(p), f = fract(p);
        float f1 = 9.0, f2 = 9.0, id = 0.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 c = vec2(float(i), float(j));
          float h = fh(g + c);
          vec2 o = 0.5 + 0.38 * sin(t + 6.2831 * vec2(h, fh(g + c + 17.3)));
          float d = length(c + o - f);
          if (d < f1) { f2 = f1; f1 = d; id = h; } else if (d < f2) f2 = d;
        }
        return vec3(f1, f2, id);
      }
      float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
      float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
      float linD(float d) { float n = uCam.x, f = uCam.y; return 2.0 * n * f / (f + n - (d * 2.0 - 1.0) * (f - n)); }
      // view depth (m, along the camera's forward) of a world point
      float viewZ(vec3 p) { return dot(p - cameraPosition, uFwd); }
      // a two-phase flow map: noise carried downstream without stretching forever
      float flowNoise(vec2 q, vec2 flow, float sc) {
        float t = time * 0.55;
        float p0 = fract(t), p1 = fract(t + 0.5);
        float a = vnoise(q * sc - flow * p0 * 1.6), b = vnoise(q * sc - flow * p1 * 1.6 + 7.31);
        return mix(a, b, abs(p0 * 2.0 - 1.0));
      }

      void main() {
        bool lava = vMat > 40.5;
        vec3 fn = vN;
        bool top = fn.y > 0.5, bottom = fn.y < -0.5;
        float flags = vInfo.w;
        bool falling = mod(floor(flags / 2.0), 2.0) > 0.5;
        float depth = vInfo.z;
        float dist = length(vWorld - lampPos);
        // the face's own pixel grid: 64 texels per meter, like the rock
        vec2 fp = top || bottom ? vWorld.xz : vec2(abs(fn.x) > 0.5 ? vWorld.z : vWorld.x, vWorld.y);
        vec2 px = floor(fp * 64.0);
        vec2 uv = (px + 0.5) / 64.0;
        float dith = bayer4(px);
        float amp = clamp(depth / 0.25, 0.15, 1.0);
        vec3 hs = top ? fsurf(uv, vWorld.y, lava ? 1.0 : 0.0, amp) : vec3(0.0);
        vec3 n = top ? normalize(vec3(-hs.y, 1.0, -hs.z)) : fn;
        bool under = !gl_FrontFacing;
        if (under) { n = -n; fn = -fn; }
        vec3 V = normalize(cameraPosition - vWorld);
        float nv = max(dot(n, V), 0.0);
        vec2 flow = vFlow;
        {
          // streams running level still show which way they go (the sim's momentum, per column)
          vec2 fuv = (vWorld.xz - wcO.xy) * wcO.z;
          if (fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0) flow += (texture2D(wcFlow, fuv).rg * 255.0 - 128.0) / 110.0 * 0.9;
        }
        float fs = min(1.0, length(flow));
        vec3 col;
        float alpha = 1.0;
        float fogK = 1.0 - exp(-pow(dist / fogDist, 2.0) * 2.2);
        if (lava) {
          vec2 q = uv + flow * time * 0.22;
          float heat;
          float id = 0.0;
          if (top || bottom) {
            // crust plates drift and slowly turn; each lives a cycle: molten → crusted → cracking open
            vec2 wq = q * 1.4 + vec2(time * 0.04, time * 0.025);
            wq += (vec2(vnoise(q * 0.8 + 3.1), vnoise(q * 0.8 + 9.7)) - 0.5) * 1.1;
            vec3 c = cells(wq, time * 0.12);
            id = c.z;
            float life = fract(id * 3.7 + time * 0.045);
            float crust = smoothstep(0.05, 0.3, life) * (1.0 - smoothstep(0.72, 0.97, life));
            float edge = c.y - c.x;
            float gap = mix(0.5, 0.07, crust);
            vec3 ci = cells(q * 4.5 + id * 7.0, 0.0);
            float crack = (1.0 - step(0.04 + (1.0 - crust) * 0.1, ci.y - ci.x)) * step(0.5, life);
            heat = 1.0 - smoothstep(gap * 0.35, gap, edge);
            heat = max(heat, crack * 0.8);
            heat = max(heat, (1.0 - crust) * 0.85);
          } else {
            // a falling tongue: molten streaks with crust bits sliding down
            float s = fh(vec2(floor(px.x * 0.25), 7.0));
            float run = fract(uv.y * 0.9 + time * (falling ? 0.7 : 0.15) + s * 3.0);
            heat = 0.55 + step(0.6, run) * 0.4 - step(0.92, run) * 0.6 + (s - 0.5) * 0.3;
            id = s;
          }
          heat += hs.x * 14.0 + (vnoise(q * 3.0 + time * 0.3) - 0.5) * 0.35 + fs * 0.25;
          float pulse = 0.88 + 0.12 * sin(time * 1.7 + id * 6.28) + 0.05 * sin(time * 4.3 + uv.x * 2.0);
          float b = clamp(floor(heat * 5.0 + (dith - 0.5) * 0.6), 0.0, 5.0);
          vec3 L = lightAt(vWorld, n);
          float shade = step(0.5, fract(id * 13.7)) * 0.35 + 1.0;
          if (b < 0.5) col = vec3(0.022, 0.009, 0.007) * shade * (L * 1.3 + 0.6) + vec3(0.03, 0.004, 0.0) * pulse;
          else if (b < 1.5) col = vec3(0.07, 0.02, 0.011) * shade * (L * 1.3 + 0.6) + vec3(0.1, 0.012, 0.0) * pulse;
          else if (b < 2.5) col = vec3(0.42, 0.045, 0.008) * pulse;
          else if (b < 3.5) col = pal(vMat, 1.0) * 1.35 * pulse;
          else if (b < 4.5) col = pal(vMat, 2.0) * 1.5 * pulse;
          else col = mix(pal(vMat, 3.0), pal(vMat, 4.0), step(0.5, dith)) * 1.6 * pulse;
          col = mix(col, fogCol, fogK * 0.65);
          gl_FragColor = vec4(col, 1.0);
          return;
        }

        // ---------------------------------------------------------------- water
        // fine ripples riding the swell: a texel-scale normal drifting downstream (it breaks the
        // lights' reflections into glitter and gives the refraction its shimmer)
        if (top) {
          float nearK = clamp(1.0 - (dist - 2.0) / 9.0, 0.0, 1.0);
          vec2 rq = uv * 9.0 - flow * time * 1.3 + vec2(time * 0.4, -time * 0.3);
          float r0 = vnoise(rq), rx = vnoise(rq + vec2(0.45, 0.0)), rz = vnoise(rq + vec2(0.0, 0.45));
          vec2 g = vec2(rx - r0, rz - r0) * 0.7 * (0.3 + 0.7 * nearK) * (0.4 + 0.6 * amp);
          vec3 nd = normalize(vec3(-hs.y - g.x, 1.0, -hs.z - g.y));
          n = under ? -nd : nd;
          nv = max(dot(n, V), 0.0);
        }
        vec3 L = lightAt(vWorld, n);
        vec3 acc = pal(vMat, 4.0);
        vec3 deep = pal(vMat, 0.0), mid = pal(vMat, 1.0), hi = pal(vMat, 3.0);
        vec3 tint = vec3(0.72, 0.89, 1.0); // water's own colour, even where it's shallow
        bool grab = uGrab.z > 0.5;
        vec2 suv = gl_FragCoord.xy * uGrab.xy;
        float zs = linD(gl_FragCoord.z);
        vec3 rd = -V;
        float cosV = max(dot(rd, uFwd), 0.05);
        // how far the eye looks through water behind this surface (m)
        float zb = grab ? linD(texture2D(tGrabD, suv).r) : zs + depth * 1.5;
        float path = max(zb - zs, 0.0) / cosV;
        // refraction: the wave normal's tilt (in view space) shifts what's underneath, in whole pixels
        vec3 tilt = mat3(viewMatrix) * (n - fn);
        vec2 off = tilt.xy * 0.1 * wLook.y * clamp(path * 1.4, 0.0, 1.0) / max(1.0, zs * 0.35);
        off = floor(off / uGrab.xy + 0.5) * uGrab.xy;
        vec3 refr = vec3(0.0);
        float pathR = path;
        if (grab) {
          float zr = linD(texture2D(tGrabD, suv + off).r);
          if (zr < zs + 0.02) { off = vec2(0.0); zr = zb; } // something in front of the water: don't borrow it
          pathR = max(zr - zs, 0.0) / cosV;
          refr = texture2D(tGrab, suv + off).rgb;
        }
        // the water's own colour: deep blue-green, lit by the lamp and lights at the surface
        vec3 scat = mix(deep, mid, 0.6) * (L * 1.0 + 0.06) + deep * 0.12;
        // foam in crisp pixel clumps: lapping at the shores and wherever the water gets thin, the
        // ragged edge of a spreading front, churning where water lands
        float lap = 0.5 + 0.5 * sin(time * 2.2 + (uv.x - uv.y) * 2.5);
        float grain = vnoise(floor(px * 0.5) * 0.3 + vec2(time * 1.3, -time * 0.9));
        float clump = vnoise(floor(px * 0.25) * 0.21 + vec2(-time * 0.4, time * 0.3));
        float fm = 0.0;
        if (!under) {
          // (the mesher marks shores: corners touching rock; the open edge of a spreading front)
          float shore = vInfo.x * (0.3 + 0.35 * lap) * step(0.3, clump + 0.15);
          fm = step(1.0 - shore, grain * 0.55 + clump * 0.45);
          fm = max(fm, step(1.0 - vInfo.y * 0.45, grain));
        }
        for (int i = 0; i < ${MAX_IMPACTS}; i++) {
          vec4 im = wImp[i];
          if (im.w <= 0.0) continue;
          vec3 dq = vWorld - im.xyz;
          if (abs(dq.y) > 0.25) continue;
          float d = length(dq.xz);
          float R = 0.18 + im.w * 0.35;
          if (d > R * 1.6) continue;
          float churn = vnoise(floor(px * 0.5) * 0.45 + vec2(d * 9.0 - time * 5.0, time * 2.0));
          fm = max(fm, step(0.35 + 0.65 * smoothstep(R * 0.4, R * 1.5, d), churn));
        }
        if (top && !under) {
          float dk = 1.0 - exp(-pathR * 0.9);
          vec2 fd = fs > 0.05 ? flow / length(flow) : vec2(0.8, 0.6);
          vec2 sq = vec2(dot(uv, fd), dot(uv, vec2(-fd.y, fd.x)));
          vec2 fl = vec2(fs, 0.0);
          float streak = 0.0, fleck = 0.0;
          if (fs > 0.1) { // only where it runs
            streak = flowNoise(vec2(sq.x * 0.9, sq.y * 7.0), fl, 1.0);
            fleck = flowNoise(vec2(sq.x * 3.0, sq.y * 3.0), fl * 3.0, 1.0);
          }
          float hn = clamp(hs.x / (0.02 * amp), -3.0, 3.0);
          // what's below, tinted and fogged by the water in between (stepped like the palette)
          vec3 absorb = vec3(0.95, 0.34, 0.2) * wLook.x;
          vec3 T = exp(-absorb * pathR);
          T = floor(T * 6.0 + dith * 0.9) / 6.0;
          vec3 below = grab ? refr * tint : scat * 0.4;
          if (grab && wLook.w < 0.5) {
            // the terrain doesn't light its own caustics: draw them on the floor we see through
            vec3 fp3 = vWorld + rd * pathR;
            float c = wc_caustic((floor(fp3.xz * 64.0) + 0.5) / 64.0, time) * exp(-pathR * 0.5);
            below *= 1.0 + vec3(0.5, 0.82, 1.0) * floor(c * 3.0 + 0.35) / 3.0 * 0.7;
          }
          col = below * T + scat * (1.0 - T);
          col *= 1.0 + 0.12 * (step(1.3, hn) - step(hn, -1.3));
          // pixel crest lines: short light dashes along the wavelets, drifting with the swell and flow
          if (dist < 9.0) {
            vec2 cd = normalize(vec2(0.8, 0.6) + fd * fs * 3.0);
            float cph = dot(uv, cd) * 6.0 + vnoise(uv * 2.3 + time * 0.2) * 2.4 - time * (1.0 + fs * 3.0);
            float crest = step(0.93, fract(cph)) * step(0.55, vnoise(uv * 3.0 + vec2(time * 0.5, -time * 0.3)));
            col = mix(col, hi * (L * 1.15 + 0.06), crest * mix(0.4, 0.2, dk) * clamp(1.0 - (dist - 3.0) / 6.0, 0.0, 1.0));
          }
          // flowing water shows its streaks and flecks running downstream
          col = mix(col, hi * (L * 1.1 + 0.05), step(0.76, streak) * smoothstep(0.15, 0.6, fs) * 0.5);
          fm = max(fm, step(0.86 - fs * 0.08, fleck) * step(0.3, fs));
          fm = max(fm, step(1.8, hn) * step(0.35, grain));
          // reflection: the cave's glow toward grazing angles, plus what a short march finds above
          float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
          // (what isn't found: the cave's own glow, a soft blue sheen so far water still reads as water)
          vec3 refl = fogCol * 1.4 + scat * 0.3 + hi * (0.07 + 0.35 * min(dot(L, vec3(0.33)), 1.0));
          if (grab && wLook.z > 0.5 && F > 0.1) {
            vec3 R = reflect(rd, n);
            float t = 0.15;
            for (int i = 0; i < 7; i++) {
              vec3 Q = vWorld + R * t;
              vec4 cp = uVP * vec4(Q, 1.0);
              if (cp.w <= 0.0) break;
              vec2 su = cp.xy / cp.w * 0.5 + 0.5;
              if (su.x < 0.0 || su.y < 0.0 || su.x > 1.0 || su.y > 1.0) break;
              float zq = viewZ(Q);
              float zz = linD(texture2D(tGrabD, su).r);
              if (zz < zq - 0.02 && zq - zz < t * 0.6 + 0.15) {
                su = (floor(su / uGrab.xy) + 0.5) * uGrab.xy;
                refl = texture2D(tGrab, su).rgb * tint * 0.85 + fogCol * 0.4;
                break;
              }
              t *= 1.75;
            }
          }
          col = mix(col, refl, clamp(F * 0.95, 0.0, 0.85));
          // glitter: the helmet lamp right below and the lights across the water, off the wavelets
          float att = clamp(1.0 - dist / lampRange, 0.0, 1.0);
          float cone = smoothstep(0.6, 0.95, dot(rd, lampDir));
          vec3 sc = lampCol * pow(nv, 900.0) * 1.1 * att * (0.4 + cone);
          for (int i = 0; i < ${MAX_LIGHTS}; i++) {
            vec3 lq = lPos[i].xyz - vWorld;
            float ld = length(lq);
            float la = clamp(1.0 - ld / (lPos[i].w * 1.8), 0.0, 1.0);
            if (la <= 0.0) continue;
            vec3 H = normalize(lq / ld + V);
            float nh = max(dot(n, H), 0.0);
            sc += lCol[i] * la * (pow(nh, 300.0) * 3.0 + pow(nh, 50.0) * 0.05);
          }
          float gl = max(sc.r, max(sc.g, sc.b));
          float tw = step(0.997, fh(floor(px * 0.5) + floor(time * 6.0) * 13.1)) * att * cone;
          col += step(0.2, gl) * (sc / max(gl, 1e-3)) * min(gl, 1.6) * 0.8 + sc * step(gl, 0.2) * 0.6 + tw * acc * 1.1;
          col = mix(col, acc * (L * 0.85 + 0.16), fm * 0.85);
          alpha = grab ? 1.0 : mix(mix(0.6, 0.88, dk), 0.96, F);
        } else if (top && under) {
          // the surface seen from below: Snell's window onto the cave above, mirror-dark outside it
          float hn = clamp(hs.x / (0.02 * amp), -3.0, 3.0);
          float win = smoothstep(0.6, 0.72, nv);
          vec3 sky = grab ? texture2D(tGrab, suv + off * 2.0).rgb : hi * L;
          vec3 tir = mix(deep, mid, 0.4) * (L * 0.6 + 0.06);
          col = mix(tir, sky * tint * 0.9 + hi * 0.05, win);
          col += hi * (L * 0.7 + 0.1) * (1.0 - smoothstep(0.0, 0.06, abs(nv - 0.66))) * 0.5; // the bright rim
          vec3 c = cells(uv * 1.6 + vec2(time * 0.15, -time * 0.1), time * 0.8);
          col += acc * (L * 0.5 + 0.1) * step(c.y - c.x, 0.03) * 0.4 + acc * 0.08 * step(1.3, hn);
          col = mix(col, acc * (L * 0.85 + 0.16), fm * 0.88);
          alpha = 1.0;
        } else if (!bottom && !falling) {
          // a pool's side against open air (seen from outside or from within)
          vec3 T = exp(-vec3(0.95, 0.34, 0.2) * wLook.x * (under ? 0.15 : pathR));
          T = floor(T * 6.0 + dith * 0.9) / 6.0;
          vec3 below = grab ? refr * tint : scat * 0.4;
          col = below * T + scat * (1.0 - T);
          float rim = step(0.82, vTopE + (fh(vec2(floor(px.x * 0.5), floor(time * 4.0))) - 0.5) * 0.12);
          col = mix(col, acc * (L * 0.9 + 0.14), max(rim, fm) * 0.8);
          alpha = grab ? 1.0 : 0.8;
        } else {
          // falling water: streaks rushing down, flecks of foam, the world behind bent through it
          float s = fh(vec2(floor(px.x * 0.5), 3.0));
          float sp = falling ? 2.8 : 0.8;
          float run = fract(uv.y * 1.6 + time * sp + s * 3.0);
          float run2 = fract(uv.y * 0.7 + time * sp * 0.6 + fh(vec2(floor(px.x * 0.25), 9.0)) * 5.0);
          vec3 Ls = lightAt(vWorld, vec3(0.0, 0.7, 0.0) + fn * 0.3);
          // streaks: a few bright threads per stream, racing down; the rest clear blue-green
          float thread = step(0.72, s) * step(0.55, run) + step(0.85, run2) * 0.5;
          vec3 sheet = mix(mid, hi, 0.3 + thread * 0.5) * (Ls * 1.15 + 0.05);
          vec3 behind = grab ? texture2D(tGrab, suv + vec2(floor((s - 0.5) * 4.0) * uGrab.x, 0.0)).rgb : sheet;
          col = behind * tint * 0.55 + sheet * 0.55;
          float lip = step(0.95, run) * step(0.6, s);
          col = mix(col, acc * (Ls * 0.9 + 0.14), clamp(lip + fm * 0.6, 0.0, 1.0) * 0.6);
          alpha = 0.85;
        }
        col = mix(col, fogCol, fogK);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  mat.onBeforeRender = (renderer, scene, camera) => {
    const u = mat.uniforms;
    const ok = grab ? grab.take(renderer) : false;
    u.uGrab.value.z = ok ? 1 : 0;
    if (ok) {
      u.tGrab.value = grab.rt.texture;
      u.tGrabD.value = grab.rt.depthTexture;
      u.uGrab.value.x = 1 / grab.rt.width;
      u.uGrab.value.y = 1 / grab.rt.height;
    }
    if (camera.isPerspectiveCamera) { u.uCam.value.x = camera.near; u.uCam.value.y = camera.far; }
    camera.getWorldDirection(u.uFwd.value);
    u.uVP.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  };
  return mat;
}
