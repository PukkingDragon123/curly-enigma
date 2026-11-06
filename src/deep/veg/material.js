// The vegetation shader: every plant is a handful of voxel boxes (./vox.js boxify), and every box
// is one instance of a 7-vertex fan: the three faces of a box that can face the eye share a
// corner, so the vertex shader picks that corner (from where the eye is in the box's own frame)
// and spreads the hexagon round it. Back faces are never sent; there is no texture and no alpha
// test, so the plants are cheap opaque geometry that keeps the early depth test (phones).
// Boxes sway in the cave's breath (bend grows from the root to the tip), the mole pushes them
// aside, small plants shrink away with distance, and each face is lit by its normal (taken from
// the screen derivatives: flat, one light / mid / dark plane per face) like the rock.
//
// Lighting and air: when TerrainMaterial.js exports its GLSL chunks for mine materials (LIGHT with
// lightAt(p, n), AIR with caveAir(col, p, d) / fogAmount(d)) the plants use them, so they sit in
// the same light, fog, ground mist and dust as the terrain. Otherwise a self-contained copy of the
// same model is used. Either way the uniforms are the terrain's own objects, matched by name.
import * as THREE from 'three';
import * as TM from '../TerrainMaterial.js';

export const PUSHERS = 4;

/** A copy of the terrain's light + air model (used when its chunks aren't exported). */
function ownChunks(NL) {
  return /* glsl */`
  uniform vec4 lPos[${NL}];
  uniform vec3 lCol[${NL}];
  uniform vec3 lampPos;
  uniform vec3 lampDir;
  uniform vec3 lampCol;
  uniform float lampRange;
  uniform vec3 ambient;
  uniform vec3 skyCol;
  uniform vec3 bounce;
  vec3 lightAt(vec3 p, vec3 n) {
    vec3 L = ambient * (0.8 + 0.24 * n.y) + skyCol * (0.55 + 0.45 * n.y) + bounce * (0.55 - 0.45 * n.y);
    vec3 d = lampPos - p;
    float dist = length(d);
    vec3 dl = d / max(dist, 1e-4);
    float x = min(dist / lampRange, 1.0), w = 1.0 - x * x * x * x;
    float att = w * w * 1.25 / (1.0 + dist * dist * 0.05);
    float c = dot(-dl, lampDir);
    float cone = 0.24 + 0.78 * smoothstep(0.45, 0.92, c) + 0.28 * smoothstep(0.93, 0.995, c);
    L += lampCol * att * cone * max((dot(n, dl) + 0.28) / 1.28, 0.0);
    for (int i = 0; i < ${NL}; i++) {
      vec3 q = lPos[i].xyz - p;
      float r = lPos[i].w, dd = length(q);
      if (dd >= r) continue;
      float xx = min(dd / r, 1.0), ww = 1.0 - xx * xx * xx * xx;
      L += lCol[i] * (ww * ww / (1.0 + 7.0 * xx * xx)) * (max((dot(n, q / max(dd, 1e-4)) + 0.28) / 1.28, 0.0) * 0.82 + 0.18);
    }
    return L;
  }
  float fogAmount(float d) { return 1.0 - exp(-pow(d / fogDist, 2.6) * 3.2); }
  vec3 caveAir(vec3 col, vec3 p, float d) { return mix(col, fogCol, fogAmount(d)); }
`;
}

/** The box template: corner 0 is the corner nearest the eye, 1..6 the hexagon round it (a fan). */
export function boxTemplate(geo) {
  // in "seen" space: 1 = the side of the box that faces the eye on that axis
  geo.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 6, 0, 6, 1]);
  return geo;
}

export function makeVegMaterial(U) {
  const NL = TM.MAX_LIGHTS || 8;
  const shared = typeof TM.LIGHT === 'string' && typeof TM.AIR === 'string' && TM.LIGHT.includes('vec3 lightAt(') && TM.AIR.includes('vec3 caveAir(') && TM.AIR.includes('float fogAmount(');
  const chunks = shared ? TM.LIGHT + TM.AIR : ownChunks(NL);
  const push = [];
  for (let i = 0; i < PUSHERS; i++) push.push(new THREE.Vector4(0, -9999, 0, 0.3));
  const uniforms = {
    skyCol: { value: new THREE.Color(0, 0, 0) }, bounce: { value: new THREE.Color(0, 0, 0) },
    haze: { value: 0 }, mist: { value: new THREE.Vector4(0, 1.5, 0.6, 0) }, mistCol: { value: new THREE.Color(0, 0, 0) },
    ...U, // the terrain's own uniform objects (lights, lamp, fog, time): shared, so they update with it
    uWind: { value: new THREE.Vector4(0.8, 0.6, 1, 0.9) }, // direction xz, strength, gust speed
    uPush: { value: push },
    uPushK: { value: new Float32Array(PUSHERS) },
    uLod: { value: new THREE.Vector3(9.5, 17, 19) }, // small plants thin out between x and y (m); nothing past z
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide, // (the fan's winding flips with the eye's side; only eye-facing faces are sent)
    vertexShader: /* glsl */`
      attribute vec3 corner;
      attribute vec3 iRoot;  // the plant's root (m)
      attribute vec4 iOff;   // the box's low corner (voxels from the root, the plant's frame), hanging flag
      attribute vec4 iShape; // the box's size (voxels), voxels per metre (0 = hidden)
      attribute vec4 iCol;   // sRGB colour, glow (× 2)
      attribute vec4 iSway;  // bend at the box's bottom, at its top, sway (× 0.25 m), push
      attribute vec4 iMisc;  // yaw (× 2π), lod rank, flutter phase, gust phase
      uniform float time;
      uniform vec4 uWind;
      uniform vec4 uPush[${PUSHERS}];
      uniform float uPushK[${PUSHERS}];
      uniform vec3 uLod;
      varying vec3 vWorld;
      varying vec3 vCol;
      varying float vGlow;
      void main() {
        float dist = length(iRoot - cameraPosition);
        float far = clamp((dist - uLod.x) / (uLod.y - uLod.x), 0.0, 1.0);
        float keep = clamp((iMisc.y - far) * 6.0, 0.0, 1.0) * (1.0 - smoothstep(uLod.z - 1.5, uLod.z, dist)); // shrinks away as it nears its cut-off
        if (keep <= 0.0 || iShape.w < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float vox = keep / iShape.w;
        float a = iMisc.x * 6.2831853, ca = cos(a), sa = sin(a);
        // which corner of the box faces the eye (in the plant's frame, voxels)
        vec3 lc = iOff.xyz + iShape.xyz * 0.5;
        // off screen (the box with room for the most any sway or push moves it): nothing to do.
        // (the whole pool is one draw, so this is the frustum cull)
        vec3 vr = (viewMatrix * vec4(iRoot + vec3(ca * lc.x + sa * lc.z, lc.y, -sa * lc.x + ca * lc.z) * vox, 1.0)).xyz;
        float br = 0.5 * length(iShape.xyz) * vox + 0.6, p0 = projectionMatrix[0][0], p1 = projectionMatrix[1][1];
        if (vr.z > br || abs(vr.x) * p0 + vr.z > br * sqrt(1.0 + p0 * p0) || abs(vr.y) * p1 + vr.z > br * sqrt(1.0 + p1 * p1)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 e = (cameraPosition - iRoot) / vox;
        vec3 le = vec3(ca * e.x - sa * e.z, e.y, sa * e.x + ca * e.z) - lc;
        vec3 sg = step(0.0, le);
        vec3 q = iOff.xyz + mix(1.0 - corner, corner, sg) * iShape.xyz;
        vec3 p = iRoot + vec3(ca * q.x + sa * q.z, q.y, -sa * q.x + ca * q.z) * vox;
        float cy = mix(1.0 - corner.y, corner.y, sg.y);
        float bend = mix(iSway.x, iSway.y, cy);
        float amp = iSway.z * 0.25;
        // the cave breathes: a slow draught along uWind with gusts rolling through, and each plant's own flutter
        float gust = 0.5 + 0.5 * sin(iMisc.w * 6.2832 - time * uWind.w);
        gust *= gust;
        float fp = iMisc.z * 6.2832;
        vec2 wv = uWind.xy * uWind.z * (0.3 + 0.9 * gust) + vec2(sin(time * 1.9 + fp), cos(time * 1.55 + fp * 1.37)) * 0.32;
        vec3 disp = vec3(wv.x, 0.0, wv.y) * amp * bend;
        // the mole (and whoever walks with it) brushes through: pushed aside and pressed down (hanging ones lifted)
        float hang = iOff.w;
        for (int i = 0; i < ${PUSHERS}; i++) {
          float k = uPushK[i];
          if (k <= 0.0) continue;
          vec4 P = uPush[i];
          vec2 d = p.xz - P.xz;
          float hd = length(d);
          float dy = p.y - P.y;
          float f = (1.0 - smoothstep(P.w * 0.35, P.w, hd)) * smoothstep(-0.3, -0.05, dy) * (1.0 - smoothstep(0.62, 0.95, dy)) * k * iSway.w;
          disp.xz += d / max(hd, 0.02) * f * P.w * 0.8 * bend;
          disp.y -= f * 0.12 * bend * (1.0 - 2.0 * hang);
        }
        p += disp;
        vWorld = p;
        vCol = pow(iCol.rgb, vec3(2.2));
        vGlow = iCol.a * 2.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float time;
      ${chunks}
      varying vec3 vWorld;
      varying vec3 vCol;
      varying float vGlow;
      void main() {
        // the face's own normal (flat: one plane per face, as voxels are)
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
        float dist = length(vWorld - lampPos);
        // voxel planes: tops lit, sides mid, undersides dark (read even in the flat cave light)
        float face = n.y > 0.6 ? 1.0 : n.y < -0.6 ? 0.64 : 0.8 + 0.08 * (abs(n.x) - abs(n.z));
        vec3 c = vCol * face;
        vec3 col = c * lightAt(vWorld, normalize(n * 0.8 + vec3(0.0, 0.2, 0.0)));
        col = caveAir(col, vWorld, dist);
        // their own glow shines a little further through the dark than lit leaves do
        float pulse = 0.82 + 0.18 * sin(time * 2.1 + vWorld.x * 2.7 + vWorld.z * 1.9);
        col += vCol * vGlow * 0.8 * pulse * (1.0 - fogAmount(dist) * 0.7);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.userData.sharedLight = shared;
  return mat;
}
