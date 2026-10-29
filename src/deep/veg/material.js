// The vegetation shader: instanced alpha-tested cards from the painted atlas, swaying in the cave's
// breath, pushed aside by the mole, lit by the helmet lamp and the point lights like the rock.
//
// Lighting and air: when TerrainMaterial.js exports its GLSL chunks for mine materials (LIGHT with
// lightAt(p, n), AIR with caveAir(col, p, d) / fogAmount(d)) the cards use them, so they sit in the
// same light, fog, ground mist and dust as the terrain. Otherwise a self-contained copy of the
// same model is used. Either way the uniforms are the terrain's own objects, matched by name
// (lPos, lCol, lampPos, lampDir, lampCol, lampRange, ambient, skyCol, bounce, fogCol, fogDist,
// haze, mist, mistCol, time): uniforms the terrain doesn't have simply stay zero.
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

export function makeVegMaterial(U, atlas) {
  const NL = TM.MAX_LIGHTS || 8;
  const shared = typeof TM.LIGHT === 'string' && typeof TM.AIR === 'string' && TM.LIGHT.includes('vec3 lightAt(') && TM.AIR.includes('vec3 caveAir(') && TM.AIR.includes('float fogAmount(');
  const chunks = shared ? TM.LIGHT + TM.AIR : ownChunks(NL);
  const push = [];
  for (let i = 0; i < PUSHERS; i++) push.push(new THREE.Vector4(0, -9999, 0, 0.3));
  const uniforms = {
    skyCol: { value: new THREE.Color(0, 0, 0) }, bounce: { value: new THREE.Color(0, 0, 0) },
    haze: { value: 0 }, mist: { value: new THREE.Vector4(0, 1.5, 0.6, 0) }, mistCol: { value: new THREE.Color(0, 0, 0) },
    ...U, // the terrain's own uniform objects (lights, lamp, fog, time): shared, so they update with it
    atlas: { value: atlas },
    uWind: { value: new THREE.Vector4(0.8, 0.6, 1, 0.9) }, // direction xz, strength, gust speed
    uPush: { value: push },
    uPushK: { value: new Float32Array(PUSHERS) },
    uLod: { value: new THREE.Vector2(9.5, 17) }, // small plants thin out between these distances (m)
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec2 corner;
      attribute vec3 iBase;
      attribute vec3 iSide;
      attribute vec3 iUp;
      attribute vec4 iUV;  // u0, v at the root, u1, v at the tip
      attribute vec4 iA;   // bend at the root, bend at the tip, gust phase, flutter phase
      attribute vec4 iB;   // tint rgb (× 2), lod rank
      attribute vec4 iC;   // ao at the root, ao at the tip, glow (× 2), sway (× 0.25 m)
      uniform float time;
      uniform vec3 lampPos;
      uniform vec4 uWind;
      uniform vec4 uPush[${PUSHERS}];
      uniform float uPushK[${PUSHERS}];
      uniform vec2 uLod;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vAo;
      varying float vGlow;
      varying vec3 vTint;
      void main() {
        float hl = length(iUp);
        float dist = length(iBase - lampPos);
        float far = clamp((dist - uLod.x) / (uLod.y - uLod.x), 0.0, 1.0);
        float keep = clamp((iB.w - far) * 6.0, 0.0, 1.0); // shrinks away as it nears its cut-off
        if (keep <= 0.0 || hl < 1e-5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float cy = corner.y;
        vec3 p = iBase + iSide * ((corner.x - 0.5) * keep) + iUp * (cy * keep);
        float bend = mix(iA.x, iA.y, cy);
        float amp = iC.w * 0.25;
        // the cave breathes: a slow draught along uWind with gusts rolling through, and each plant's own flutter
        float gust = 0.5 + 0.5 * sin(iA.z * 6.2832 - time * uWind.w);
        gust *= gust;
        float fp = iA.w * 6.2832;
        vec2 wv = uWind.xy * uWind.z * (0.3 + 0.9 * gust) + vec2(sin(time * 1.9 + fp), cos(time * 1.55 + fp * 1.37)) * 0.32;
        vec3 disp = vec3(wv.x, 0.0, wv.y) * amp * bend;
        // the mole (and whoever walks with it) brushes through: pushed aside and pressed down
        for (int i = 0; i < ${PUSHERS}; i++) {
          float k = uPushK[i];
          if (k <= 0.0) continue;
          vec4 P = uPush[i];
          vec2 d = p.xz - P.xz;
          float hd = length(d);
          float dy = p.y - P.y;
          float f = (1.0 - smoothstep(P.w * 0.35, P.w, hd)) * smoothstep(-0.3, -0.05, dy) * (1.0 - smoothstep(0.62, 0.95, dy)) * k;
          disp.xz += d / max(hd, 0.02) * f * P.w * 0.8 * bend;
          disp.y -= f * hl * 0.4 * bend * sign(iUp.y + 1e-3);
        }
        p += disp;
        vWorld = p;
        vN = normalize(cross(iSide, iUp));
        vUv = vec2(mix(iUV.x, iUV.z, corner.x), mix(iUV.y, iUV.w, cy));
        vAo = mix(iC.x, iC.y, cy);
        vGlow = iC.z * 2.0;
        vTint = iB.rgb * 2.0;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D atlas;
      uniform vec3 fogCol;
      uniform float fogDist;
      uniform float time;
      ${chunks}
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vAo;
      varying float vGlow;
      varying vec3 vTint;
      float vegBayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
      void main() {
        vec4 tx = texture2D(atlas, vUv);
        if (tx.a < 0.1) discard;
        // right in front of the eye a leaf would fill the screen with a few huge texels: dither it away
        float dist = length(vWorld - lampPos);
        if (dist < 0.55 && vegBayer2(0.5 * gl_FragCoord.xy) * 0.25 + vegBayer2(gl_FragCoord.xy) > smoothstep(0.18, 0.55, dist)) discard;
        float g = floor((1.0 - tx.a) * 255.0 / 48.0 + 0.5) * 0.25; // glow level 0..1 (alpha-coded)
        vec3 c = pow(tx.rgb, vec3(2.2)) * vTint;
        vec3 n = vN;
        if (dot(n, lampPos - vWorld) < 0.0) n = -n;
        // leaves take the light like the ground they grow from, with a share of their own facing
        vec3 nl = normalize(n * 0.55 + vec3(0.0, 0.5, 0.0));
        vec3 col = c * lightAt(vWorld, nl) * vAo;
        col = caveAir(col, vWorld, dist);
        // their own glow shines a little further through the dark than lit leaves do
        float pulse = 0.82 + 0.18 * sin(time * 2.1 + vWorld.x * 2.7 + vWorld.z * 1.9);
        col += c * g * vGlow * 1.25 * pulse * (1.0 - fogAmount(dist) * 0.7);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  mat.userData.sharedLight = shared;
  return mat;
}
