import * as THREE from 'three';

// Objects on this camera layer get a crisp 1px pixel-art outline.
export const LAYER_OUTLINE = 1;

// ---------------------------------------------------------------------------------------------
// The pixel post pipeline
//   1. scene → rtScene (colour + depth; half-float HDR where the GPU can render to it, so lamps,
//      lava and sunlit stone keep their highlights), outline layer → rtMask, first-person overlay
//      → rtOverlay
//   2. ambient occlusion (quality tier permitting): at half resolution, from the depth buffer
//      alone (view position + a normal rebuilt from the neighbours, a rotated disc of samples);
//      then a depth-aware 4x4 blur. Crevices, inner corners and the ground under things darken.
//   3. (only when bloom or god rays are on) tiny passes at 1/4 resolution (+ 1/8 on high):
//        prefilter: a 4x4 box of the scene → bright pixels (rgb) + light-shaft sources (a)
//        glow:      a soft ring blur of the bright pixels (rgb) + a radial blur toward the light (a)
//        wide:      a second, wider ring blur at 1/8 (a soft photographic halo round lights)
//   4. the final pass: AO (depth-aware upsample), outlines, overlay, glow, underwater wobble/murk,
//      exposure + a filmic shoulder (linear below the knee, highlights roll off instead of
//      clipping), grade (lift/gamma/gain), vignette, posterize + dither (or just a 1/255 dither
//      against banding), fades.
// Every effect is driven by the `post` object a scene passes to render(); see DEFAULT_POST.
// Quality tiers (resolution budget, glow level, AO) are picked per device and, on 'auto', adapted
// to the measured frame time (see TIERS and Engine.setFx).
// ---------------------------------------------------------------------------------------------

const POST_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const GLSL_LUM = 'float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }';

// prefilter: 1/4-res bright pass (rgb) and light-shaft source mask (a)
const PRE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tOverlay;
uniform float uOverlay;
uniform vec2 uRes;        // full-res size
uniform float uThresh;
uniform float uKnee;
uniform vec2 uLight;      // light position (uv)
uniform float uRaysOn;
uniform float uRaysThresh;
uniform float uRaysSky;
uniform float uRaysRadius;
uniform float uAspect;
varying vec2 vUv;
${GLSL_LUM}
void main() {
  vec2 px = 1.0 / uRes;
  vec3 acc = vec3(0.0);
  float sky = 0.0;
  vec3 avg = vec3(0.0);
#if TAPS == 16
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    vec2 uv = vUv + (vec2(float(i), float(j)) - 1.5) * px;
#else
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    // a rotated grid inside the 4x4 block
    vec2 uv = vUv + vec2(float(i) * 2.0 - 1.0 + (float(j) - 0.5), float(j) * 2.0 - 1.0 - (float(i) - 0.5)) * px;
#endif
    vec3 c = texture2D(tColor, uv).rgb;
    // HDR: above 1 the glow grows only a quarter as fast (an overlit wall doesn't flood the screen)
    float cm = max(c.r, max(c.g, c.b));
    if (cm > 1.0) c *= min(1.0 + (cm - 1.0) * 0.25, 2.5) / cm;
    float d = 0.0;
    if (uRaysOn > 0.5) d = texture2D(tDepth, uv).r; // only the shafts care about open sky
    if (uOverlay > 0.5) {
      vec4 o = texture2D(tOverlay, uv);
      if (o.a > 0.5) { c = o.rgb; d = 0.0; } // the paws hide the sky
    }
    // bright measure: half luminance, half brightest channel (so orange lava and blue crystals count)
    float b = 0.5 * lum(c) + 0.5 * max(c.r, max(c.g, c.b));
    float k = clamp((b - uThresh + uKnee) / (2.0 * uKnee + 1e-4), 0.0, 1.0);
    acc += c * k * k;
    avg += c;
    sky += step(0.99999, d);
  }
#if TAPS == 16
  acc /= 16.0; avg /= 16.0; sky /= 16.0;
#else
  acc /= 4.0; avg /= 4.0; sky /= 4.0;
#endif
  float rays = 0.0;
  if (uRaysOn > 0.5) {
    float l = lum(avg);
    float src = max(sky * uRaysSky * l, smoothstep(uRaysThresh, 1.0, l));
    vec2 dd = (vUv - uLight) * vec2(uAspect, 1.0);
    rays = src / (1.0 + dot(dd, dd) / (uRaysRadius * uRaysRadius) * 4.0);
  }
  gl_FragColor = vec4(acc, rays);
}
`;

// glow: ring blur of the bright pass (rgb) + radial blur of the shaft sources toward the light (a)
const GLOW_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tPre;
uniform vec2 uLowRes;
uniform float uRadius;
uniform vec2 uLight;
uniform float uRaysOn;
uniform float uDecay;
uniform float uLen;
varying vec2 vUv;
void main() {
  vec2 px = uRadius / uLowRes;
  vec3 c = texture2D(tPre, vUv).rgb * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    vec2 d1 = vec2(cos(a), sin(a));
    vec2 d2 = vec2(cos(a + 0.3926991), sin(a + 0.3926991));
    c += texture2D(tPre, vUv + d1 * px * 1.5).rgb * 0.06;
    c += texture2D(tPre, vUv + d2 * px * 3.6).rgb * 0.04;
  }
  float r = 0.0;
  if (uRaysOn > 0.5) {
    vec2 delta = (vUv - uLight) * uLen / float(RAY_N);
    vec2 p = vUv;
    float dec = 1.0;
    for (int i = 0; i < RAY_N; i++) {
      r += texture2D(tPre, p).a * dec;
      dec *= uDecay;
      p -= delta;
    }
    r /= float(RAY_N) * 0.5;
  }
  gl_FragColor = vec4(c, r);
}
`;

// wide glow: a bigger ring blur of the glow at 1/8 resolution (rgb only)
const WIDE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tGlow;
uniform vec2 uLowRes;
varying vec2 vUv;
void main() {
  vec2 px = 1.0 / uLowRes;
  vec3 c = texture2D(tGlow, vUv).rgb * 0.16;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982 + 0.39;
    vec2 d = vec2(cos(a), sin(a));
    c += texture2D(tGlow, vUv + d * px * 1.3).rgb * 0.065;
    c += texture2D(tGlow, vUv + vec2(d.y, -d.x) * px * 2.9).rgb * 0.04;
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

const GLSL_BAYER = /* glsl */`
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float x = q.x, y = q.y;
  float v = 0.0;
  // 4x4 Bayer matrix, explicit to stay GLSL ES 1.0 friendly
  if (y < 0.5) { v = x < 0.5 ? 0.0 : x < 1.5 ? 8.0 : x < 2.5 ? 2.0 : 10.0; }
  else if (y < 1.5) { v = x < 0.5 ? 12.0 : x < 1.5 ? 4.0 : x < 2.5 ? 14.0 : 6.0; }
  else if (y < 2.5) { v = x < 0.5 ? 3.0 : x < 1.5 ? 11.0 : x < 2.5 ? 1.0 : 9.0; }
  else { v = x < 0.5 ? 15.0 : x < 1.5 ? 7.0 : x < 2.5 ? 13.0 : 5.0; }
  return v / 16.0;
}
`;

// ambient occlusion from depth alone (half resolution): r = how open the spot is (1 = open),
// g = its view distance (for the depth-aware blur and upsample)
const AO_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDepth;
uniform vec2 uRes;        // full-res size
uniform vec2 uAoRes;
uniform mat4 uProjInv;
uniform vec4 uPInv;       // perspective: 1/P00, 1/P11, P20, P21 (a cheap unprojection)
uniform vec2 uNF;         // near, far
uniform float uProjScale; // AO pixels per metre at 1 m (perspective) or per metre (ortho)
uniform float uPersp;
uniform float uRadius;    // metres
varying vec2 vUv;
${GLSL_BAYER}
vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).r;
  vec2 ndc = uv * 2.0 - 1.0;
  if (uPersp > 0.5) {
    float z = 2.0 * uNF.x * uNF.y / (uNF.y + uNF.x - (d * 2.0 - 1.0) * (uNF.y - uNF.x));
    return vec3((ndc + uPInv.zw) * uPInv.xy * z, -z);
  }
  vec4 p = uProjInv * vec4(ndc, d * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
void main() {
  float d0 = texture2D(tDepth, vUv).r;
  if (d0 >= 0.99999) { gl_FragColor = vec4(1.0, 1e4, 0.0, 1.0); return; }
  vec3 P = viewPos(vUv);
  // the normal from the flatter side of each pair of neighbours (no smearing across silhouettes)
  vec2 px = 1.0 / uRes;
  vec3 pr = viewPos(vUv + vec2(px.x, 0.0)) - P, pl = P - viewPos(vUv - vec2(px.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, px.y)) - P, pd = P - viewPos(vUv - vec2(0.0, px.y));
  vec3 N = normalize(cross(abs(pr.z) < abs(pl.z) ? pr : pl, abs(pu.z) < abs(pd.z) ? pu : pd));
  float z = -P.z;
  float rPix = uRadius * uProjScale / (uPersp > 0.5 ? max(z, 0.05) : 1.0);
  if (rPix < 0.75) { gl_FragColor = vec4(1.0, z, 0.0, 1.0); return; }
  rPix = min(rPix, 0.12 * uAoRes.y); // a cap keeps the taps near (cache) and near things sane
  float ang = bayer4(gl_FragCoord.xy) * 6.2831853;
  float occ = 0.0;
  float R2 = uRadius * uRadius;
  for (int i = 0; i < AO_N; i++) {
    float t = (float(i) + 0.6) / float(AO_N);
    float a = ang + float(i) * 2.3999632;
    vec2 o = vec2(cos(a), sin(a)) * rPix * t;
    vec3 v = viewPos(vUv + o / uAoRes) - P;
    float vv = dot(v, v);
    float c = dot(v, N) * inversesqrt(vv + 1e-6);
    occ += max(0.0, c - 0.1) * max(0.0, 1.0 - vv / R2);
  }
  gl_FragColor = vec4(1.0 - min(1.0, occ * 2.2 / float(AO_N)), z, 0.0, 1.0);
}
`;

// a 4-wide depth-aware box over the AO, run across then down (4x4: the size of the rotation
// pattern, so its noise averages out)
const AOBLUR_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tAo;
uniform vec2 uAoRes;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec2 st = uDir / uAoRes;
  vec2 c = texture2D(tAo, vUv).rg;
  float sum = 0.0, wsum = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 s = texture2D(tAo, vUv + (float(i) - 2.0) * st).rg;
    float w = max(0.0, 1.0 - abs(s.g - c.g) / (c.g * 0.06 + 0.02));
    sum += s.r * w; wsum += w;
  }
  gl_FragColor = vec4(wsum > 0.0 ? sum / wsum : c.r, c.g, 0.0, 1.0);
}
`;

const POST_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tMask;
uniform sampler2D tMaskDepth;
uniform sampler2D tOverlay;
uniform sampler2D tOverlayDepth;
uniform sampler2D tGlow;
uniform sampler2D tWide;
uniform float uWide;
uniform float uOverlay;
uniform vec2 uRes;
uniform float uOutline;
uniform vec3 uOutlineColor;
uniform float uOutlineAlpha;
uniform float uOutlineFar;
uniform float uNear;
uniform float uFar;
uniform float uPersp;
uniform float uInnerThresh;
uniform float uVignette;
uniform float uSat;
uniform float uContrast;
uniform float uBright;
uniform vec3 uTint;
uniform float uLevels;
uniform float uDither;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform vec2 uIrisCenter;
uniform float uIris;
uniform float uTime;
uniform float uGrain;
uniform float uGlowOn;
uniform float uBloom;
uniform vec3 uBloomTint;
uniform float uGlowSteps;
uniform float uRays;
uniform vec3 uRaysColor;
uniform vec3 uLift;
uniform vec3 uGamma;
uniform vec3 uGain;
uniform float uFringe;
uniform float uWater;
uniform vec3 uWaterColor;
uniform sampler2D tAo;
uniform vec2 uAoRes;
uniform float uAo;
uniform float uAoFar;
uniform float uExposure;
uniform float uShoulder;
varying vec2 vUv;
${GLSL_LUM}

float linDepth(float d) {
  if (uPersp < 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

${GLSL_BAYER}

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 px = 1.0 / uRes;
  vec2 uv = vUv;
  // underwater: the picture wobbles in whole pixels (so it stays crisp)
  if (uWater > 0.0) {
    vec2 w = vec2(sin(vUv.y * 23.0 + uTime * 2.1) + 0.5 * sin(vUv.y * 61.0 - uTime * 3.3),
                  cos(vUv.x * 19.0 + uTime * 1.7) + 0.5 * sin(vUv.x * 47.0 + uTime * 2.6));
    uv += floor(w * uWater * 1.6 + 0.5) * px;
  }
  vec3 col = texture2D(tColor, uv).rgb;
  // chromatic fringe toward the edges (whole-pixel offsets)
  if (uFringe > 0.0) {
    vec2 dc = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float o = floor(dot(dc, dc) * uFringe * 4.0 + 0.5);
    if (o > 0.0) {
      vec2 dir = normalize(vUv - 0.5 + 1e-5) * px * o;
      col.r = texture2D(tColor, uv + dir).r;
      col.b = texture2D(tColor, uv - dir).b;
    }
  }

  if (uWater > 0.0) {
    float wd = linDepth(texture2D(tDepth, uv).r);
    float murk = 1.0 - exp(-wd * 0.22 * uWater);
    col *= mix(vec3(1.0), uWaterColor * 1.6 + 0.25, uWater);
    col = mix(col, uWaterColor * 0.55, murk * 0.85);
  }

  // ambient occlusion: the 4 nearest AO texels, weighted by how close their depth is to this
  // pixel's (no dark fringes round silhouettes); eased off in bright light and with distance
  if (uAo > 0.0) {
    float z = linDepth(texture2D(tDepth, uv).r);
    vec2 t = uv * uAoRes - 0.5;
    vec2 f = fract(t);
    vec2 b = (floor(t) + 0.5) / uAoRes;
    vec2 a00 = texture2D(tAo, b).rg, a10 = texture2D(tAo, b + vec2(1.0, 0.0) / uAoRes).rg;
    vec2 a01 = texture2D(tAo, b + vec2(0.0, 1.0) / uAoRes).rg, a11 = texture2D(tAo, b + 1.0 / uAoRes).rg;
    float tol = z * 0.04 + 0.01;
    vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y) + 1e-3;
    w /= 1.0 + abs(vec4(a00.g, a10.g, a01.g, a11.g) - z) / tol;
    float ao = dot(w, vec4(a00.r, a10.r, a01.r, a11.r)) / dot(w, vec4(1.0));
    float k = uAo * (1.0 - smoothstep(uAoFar * 0.5, uAoFar, z)) * (1.0 - 0.35 * smoothstep(0.3, 1.0, lum(col)));
    col *= mix(1.0, ao, k);
  }

  if (uOutline > 0.5) {
    float m = texture2D(tMask, uv).a;
    float md = texture2D(tMaskDepth, uv).r;
    float sd = texture2D(tDepth, uv).r;
    bool selfVis = m > 0.5 && md <= sd + 0.00002;
    float myDepth = selfVis ? linDepth(md) : linDepth(sd);
    float edge = 0.0;
    float edgeD = 1e9;
    for (int i = 0; i < 4; i++) {
      vec2 o = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
      vec2 uv2 = uv + o * px;
      float m2 = texture2D(tMask, uv2).a;
      float md2 = texture2D(tMaskDepth, uv2).r;
      float sd2 = texture2D(tDepth, uv2).r;
      bool vis2 = m2 > 0.5 && md2 <= sd2 + 0.00002;
      if (vis2) {
        float d2 = linDepth(md2);
        if (!selfVis) { if (d2 < myDepth - 0.001) { edge = 1.0; edgeD = min(edgeD, d2); } }
        else if (d2 < myDepth - uInnerThresh) { edge = 1.0; edgeD = min(edgeD, d2); }
      }
    }
    // far outlines fade out (in hazy scenes they would draw pencil lines over the fog)
    if (uOutlineFar > 0.0) edge *= 1.0 - smoothstep(uOutlineFar * 0.4, uOutlineFar, edgeD);
    col = mix(col, uOutlineColor * (uWater > 0.0 ? uWaterColor * 2.0 : vec3(1.0)), edge * uOutlineAlpha);
  }

  // first-person overlay (hands and tools): its own colour + depth, outlined on its silhouette
  // and on depth steps inside it
  if (uOverlay > 0.5) {
    vec4 o = texture2D(tOverlay, vUv);
    float od = texture2D(tOverlayDepth, vUv).r;
    float oe = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 off = i == 0 ? vec2(1.0, 0.0) : i == 1 ? vec2(-1.0, 0.0) : i == 2 ? vec2(0.0, 1.0) : vec2(0.0, -1.0);
      vec2 uv2 = vUv + off * px;
      float a2 = texture2D(tOverlay, uv2).a;
      float od2 = texture2D(tOverlayDepth, uv2).r;
      if (o.a < 0.5 && a2 > 0.5) oe = 1.0;
      else if (o.a > 0.5 && a2 > 0.5 && od2 < od - 0.0015) oe = 1.0;
    }
    if (o.a > 0.5) col = mix(o.rgb, o.rgb * (uWaterColor * 1.4 + 0.3), uWater);
    col = mix(col, uOutlineColor, oe * uOutlineAlpha);
  }

  // glow: bloom + light shafts, quantized into dithered steps so they read as pixel-art halos
  if (uGlowOn > 0.5) {
    vec4 g = texture2D(tGlow, uv);
    vec3 glow = (g.rgb + texture2D(tWide, uv).rgb * uWide) * uBloom * uBloomTint + uRaysColor * (g.a * uRays);
    if (uGlowSteps > 0.0) {
      float m = max(glow.r, max(glow.g, glow.b));
      float q = floor(m * uGlowSteps + bayer4(gl_FragCoord.xy) * 0.999) / uGlowSteps;
      glow *= m > 1e-4 ? q / m : 0.0;
    }
    col += glow * (1.0 - min(col, vec3(1.0)) * 0.5);
  }

  col *= uBright * uTint * uExposure;
  // filmic shoulder: linear below the knee, then highlights roll off toward white instead of
  // clipping (hot colours drift toward yellow-white, like film)
  if (uShoulder < 1.0) {
    // mostly hue-preserving (on the brightest channel: an overlit red stays red), a third per
    // channel (so the very hottest things still burn toward yellow-white)
    float kn = uShoulder, r = 1.0 - kn;
    float m = max(col.r, max(col.g, col.b));
    float fm = m > kn ? kn + r * (1.0 - exp(-(m - kn) / r)) : m;
    vec3 hp = col * (fm / max(m, 1e-5));
    vec3 pc = min(col, kn) + r * (1.0 - exp(-max(col - kn, 0.0) / r));
    col = mix(hp, pc, 0.35);
  }
  float l = lum(col);
  col = mix(vec3(l), col, uSat);
  vec3 s = toSRGB(col);
  s = (s - 0.5) * uContrast + 0.5;
  // grade: lift / gamma / gain per channel (display space)
  s = clamp(uGain * (s + uLift * (1.0 - s)), 0.0, 1.0);
  s = pow(s, 1.0 / uGamma);

  vec2 d = vUv - 0.5;
  d.x *= uRes.x / uRes.y;
  s *= clamp(1.0 - (uVignette + uWater * 0.25) * dot(d, d) * 1.5, 0.0, 1.0);

  if (uGrain > 0.0) s += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * uGrain;

  if (uLevels > 0.0) {
    float b = bayer4(gl_FragCoord.xy) - 0.5;
    s = floor(clamp(s, 0.0, 1.0) * uLevels + 0.5 + b * uDither) / uLevels;
  } else s += (bayer4(gl_FragCoord.xy) - 0.47) * uDither / 255.0; // just enough against banding

  s = mix(s, uFadeColor, uFade);
  s = mix(s, uFlashColor, uFlash);

  if (uIris >= 0.0) {
    vec2 p = vUv * uRes;
    vec2 c = uIrisCenter * uRes;
    float dist = length(p - c);
    if (dist > uIris) s = uFadeColor;
  }
  gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
}
`;

function makeRT(w, h, srgb, hdr = false) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
    type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
  });
  if (srgb && !hdr) rt.texture.colorSpace = THREE.SRGBColorSpace;
  rt.depthTexture = new THREE.DepthTexture(w, h);
  rt.depthTexture.type = THREE.UnsignedIntType;
  rt.depthTexture.minFilter = THREE.NearestFilter;
  rt.depthTexture.magFilter = THREE.NearestFilter;
  return rt;
}

function makeLowRT(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.UnsignedByteType,
  });
}

// AO targets: r = openness, g = view distance (half float, nearest: the blur and upsample weigh by depth)
function makeAoRT(w, h) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
  });
}

/**
 * Colour grades (display space): s = pow(gain * (s + lift * (1 - s)), 1 / gamma), per channel.
 * Use one by name (`post.grade = 'tavern'`), pass your own `{ lift, gamma, gain }` (arrays or
 * numbers), or blend toward it with `post.gradeMix` (0 = neutral, 1 = full).
 */
export const GRADES = {
  neutral: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1] },
  sunny: { lift: [0.0, 0.012, 0.04], gamma: [1.04, 1.02, 0.98], gain: [1.05, 1.0, 0.9] }, // golden light, cool blue shade
  warm: { lift: [0.03, 0.015, 0.0], gamma: [1.03, 1.0, 0.96], gain: [1.05, 0.99, 0.9] },
  tavern: { lift: [0.035, 0.018, 0.0], gamma: [1.05, 1.0, 0.94], gain: [1.06, 0.98, 0.86] }, // amber lamplight
  forge: { lift: [0.04, 0.012, 0.0], gamma: [1.05, 0.98, 0.92], gain: [1.1, 0.97, 0.84] }, // ember red-orange
  town: { lift: [0.02, 0.012, 0.025], gamma: [1.03, 1.01, 0.98], gain: [1.04, 1.0, 0.94] }, // lantern warm over cool rock
  cool: { lift: [0.0, 0.012, 0.035], gamma: [0.98, 1.0, 1.04], gain: [0.95, 1.0, 1.07] },
  deep: { lift: [0.005, 0.015, 0.04], gamma: [0.97, 1.0, 1.05], gain: [0.96, 1.0, 1.06] }, // the mine: cool shade, lamps still warm
  frost: { lift: [0.01, 0.03, 0.06], gamma: [0.96, 1.0, 1.06], gain: [0.92, 1.0, 1.1] },
  magma: { lift: [0.05, 0.008, 0.0], gamma: [1.04, 0.98, 0.94], gain: [1.08, 0.96, 0.86] },
  core: { lift: [0.03, 0.0, 0.05], gamma: [1.0, 0.98, 1.04], gain: [1.04, 0.95, 1.08] },
  dusk: { lift: [0.035, 0.0, 0.045], gamma: [1.04, 0.99, 0.98], gain: [1.06, 0.96, 0.92] }, // sunset pinks
  night: { lift: [0.0, 0.01, 0.05], gamma: [0.95, 0.98, 1.05], gain: [0.85, 0.93, 1.1] },
  // the mine's strata: split-toned, warm lamplight over cool shade
  rootsoil: { lift: [0.004, 0.01, 0.026], gamma: [1.03, 1.0, 0.97], gain: [1.07, 1.0, 0.88] },
  clay: { lift: [0.012, 0.008, 0.022], gamma: [1.04, 0.99, 0.96], gain: [1.08, 0.97, 0.86] },
  grotto: { lift: [0.01, 0.012, 0.045], gamma: [0.98, 1.0, 1.04], gain: [1.02, 0.98, 1.06] },
};

/** Blend two grades (names or objects) by t: handy for a descent from 'sunny' to 'deep'. */
export function mixGrade(a, b, t) {
  const A = resolveGrade(a), B = resolveGrade(b);
  const m = (x, y) => x.map((v, i) => v + (y[i] - v) * t);
  return { lift: m(A.lift, B.lift), gamma: m(A.gamma, B.gamma), gain: m(A.gain, B.gain) };
}

const v3 = (v, d) => (v == null ? [d, d, d] : typeof v === 'number' ? [v, v, v] : v);
function resolveGrade(g) {
  if (!g) return GRADES.neutral;
  if (typeof g === 'string') return GRADES[g] || GRADES.neutral;
  return { lift: v3(g.lift, 0), gamma: v3(g.gamma, 1), gain: v3(g.gain, 1) };
}

/**
 * Default post settings; scenes pass overrides to Engine.render().
 *
 * Glow (two 1/4-res passes, skipped entirely when bloom and rays are both 0, or engine.fx is 'off'):
 *  bloom          strength of the glow around bright pixels (lanterns, lava, crystals); 0 = off
 *  bloomThreshold brightness (0..1, half luminance + half brightest channel) where glow starts
 *  bloomKnee      softness of that threshold
 *  bloomRadius    blur spread (1 = default)
 *  bloomTint      colour multiplier for the glow
 *  glowSteps      the glow is quantized into this many dithered steps (0 = smooth)
 * God rays (screen-space light shafts toward one light; off while rays = 0):
 *  rays           strength
 *  raysDir        [x,y,z] world direction TOWARD the light (a sun), or
 *  raysPos        [x,y,z] world point (a lamp, a hole in the roof), or
 *  raysScreen     [u,v] screen position (0..1, origin bottom-left)
 *  raysColor, raysDecay (0.9..0.99 shaft length falloff), raysLength (0..1 of the way to the light),
 *  raysRadius     how far around the light (screen heights) the shafts gather light
 *  raysSky        how much plain sky (empty depth) counts as a source (1 outdoors, 0 indoors)
 *  raysThreshold  brightness above which a surface also feeds the shafts
 * Grade: grade ('sunny' | 'tavern' | 'deep' | … see GRADES, or {lift,gamma,gain}), gradeMix (0..1)
 * Lens: fringe (chromatic fringe at the edges, ~0.5–1.5; 0 = off), grain (film grain, ~0.02–0.05)
 * Underwater: underwater (0..1: wobble, blue-green murk with depth, softer outlines), underwaterColor
 * Outlines: outline, outlineColor, outlineAlpha, innerThresh (depth step for inner edges), outlineFar
 *   (metres: outlines fade out toward this distance, for hazy outdoor scenes; 0 = never fade)
 * Tone: exposure (linear multiplier before the curve), shoulder (the knee, 0..1: linear below it,
 *   highlights roll off softly above it; 1 = hard clip as before)
 * Ambient occlusion (quality tier permitting): ao (strength 0..1; 0 = off), aoRadius (metres),
 *   aoFar (metres: fades out toward this distance)
 * Pixel look: levels (posterize to this many steps per channel with a Bayer dither; 0 = off, just
 *   a 1/255 dither against banding), dither, glowSteps (0 = smooth glow)
 */
export const DEFAULT_POST = {
  outline: true,
  outlineColor: 0x1a0f0b,
  outlineAlpha: 1,
  outlineFar: 0,
  innerThresh: 0.35,
  vignette: 0.35,
  saturation: 1.08,
  contrast: 1.04,
  brightness: 1,
  tint: 0xffffff,
  levels: 0,
  dither: 1,
  grain: 0,
  exposure: 1,
  shoulder: 0.74,
  ao: 0.75,
  aoRadius: 0.45,
  aoFar: 30,
  fade: 0,
  fadeColor: 0x000000,
  flash: 0,
  flashColor: 0xffffff,
  iris: -1,
  irisCenter: [0.5, 0.5],
  // glow
  bloom: 0.5,
  bloomThreshold: 0.8,
  bloomKnee: 0.18,
  bloomRadius: 1,
  bloomTint: 0xffffff,
  glowSteps: 0,
  wideGlow: 0.45, // the 1/8-res halo (high effects only)
  // god rays
  rays: 0,
  raysDir: null,
  raysPos: null,
  raysScreen: null,
  raysColor: 0xffe2a8,
  raysDecay: 0.965,
  raysLength: 0.92,
  raysRadius: 0.45,
  raysSky: 1,
  raysThreshold: 0.86,
  // grade & lens
  grade: null,
  gradeMix: 1,
  fringe: 0,
  // underwater
  underwater: 0,
  underwaterColor: 0x2a7a8a,
};

/**
 * Each scene's own light, applied under the scene's `post` (Game sets engine.sceneName on every
 * scene switch). A scene's own `post` keys always win, so these are only defaults.
 */
export const SCENE_POST = {
  title: { grade: 'tavern', gradeMix: 0.8, bloom: 0.7, bloomThreshold: 0.74 },
  home: { grade: 'tavern', gradeMix: 0.7, bloom: 0.6, bloomThreshold: 0.76, aoRadius: 0.35, aoFar: 18 }, // Old Star's lamplit cave
  deep: { grade: 'deep', gradeMix: 0.85, bloom: 0.55, bloomThreshold: 0.76, saturation: 1.16, contrast: 1.06, aoFar: 18 }, // cool rock, warm lamps, glowing ore
  town: { grade: 'town', gradeMix: 0.85, bloom: 0.65, bloomThreshold: 0.74, aoRadius: 0.5 },
  forge: { grade: 'forge', gradeMix: 0.85, bloom: 0.75, bloomThreshold: 0.7, aoRadius: 0.35, aoFar: 14 }, // hot metal glows
  cooking: { grade: 'warm', gradeMix: 0.7, bloom: 0.5, bloomThreshold: 0.8 },
  showroom: { bloom: 0 },
};

/** The mine's strata, each with its own light (zone 1..6 → a GRADES name): post.grade = ZONE_GRADES[zone]. */
export const ZONE_GRADES = [null, 'rootsoil', 'clay', 'grotto', 'magma', 'frost', 'core'];

/**
 * Effect quality: 'auto' (default: a tier picked per device, then adapted to the frame time),
 * 'high', 'low' (cheaper glow and AO, for phones), 'off' (no glow passes, no AO). engine.fx always
 * holds the glow level in effect ('high' | 'low' | 'off'); engine.fxAuto says whether it adapts.
 */
export const FX_LEVELS = ['auto', 'high', 'low', 'off'];
const FX_KEY = 'moleforge.fx';

/**
 * Quality tiers, best first. px: internal pixel budget (the image is rendered at an integer
 * fraction of the device's own pixels, the largest that fits: crisp pixels at any DPR), fx: glow
 * level, ao: 2 = half-res AO with 10 samples, 1 = quarter-res with 6, 0 = off.
 * Desktop starts at 'high', phones at 'low'; 'auto' steps down when frames run long and back up
 * after a while of headroom (a tier that failed is not retried for a minute).
 */
export const TIERS = [
  { name: 'ultra', px: 2.3e6, fx: 'high', ao: 2 },
  { name: 'high', px: 1.4e6, fx: 'high', ao: 2 },
  { name: 'balanced', px: 1.4e6, fx: 'low', ao: 1 }, // cheaper effects before fewer pixels
  { name: 'medium', px: 0.8e6, fx: 'low', ao: 1 },
  { name: 'low', px: 0.42e6, fx: 'low', ao: 1 },
  { name: 'lower', px: 0.27e6, fx: 'low', ao: 0 },
  { name: 'potato', px: 0.17e6, fx: 'off', ao: 0 },
];
const tierIndex = (name) => TIERS.findIndex((t) => t.name === name);

function initialFx() {
  try {
    const q = new URLSearchParams(window.location.search).get('fx');
    if (q && FX_LEVELS.includes(q)) return q;
    if (q === '0') return 'off';
    const s = window.localStorage.getItem(FX_KEY);
    if (s && FX_LEVELS.includes(s)) return s;
  } catch (e) { /* storage blocked */ }
  return 'auto';
}

const _v = new THREE.Vector3();
const _cam = new THREE.Vector3();

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = false;
    // the GPU's name, read once now (later the query has to wait for the GPU's queue): software
    // rasterizers ('SwiftShader', 'llvmpipe') get lighter scenes (engine.softwareGL)
    this.gpuName = '';
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      this.gpuName = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    } catch (e) { /* unknown */ }
    this.softwareGL = /swiftshader|llvmpipe|softpipe|software/i.test(this.gpuName);
    this.pixelOffset = 0;
    this.width = 640;
    this.height = 360;
    this.scale = 3;
    this.resizeListeners = new Set();

    // HDR scene colour (and the AO targets) need a GPU that can render to half floats
    let hdr = false;
    try { hdr = this.renderer.extensions.has('EXT_color_buffer_float') || this.renderer.extensions.has('EXT_color_buffer_half_float'); } catch (e) { /* no */ }
    this._hdrOk = hdr;
    try { if (new URLSearchParams(window.location.search).get('hdr') === '0') hdr = false; } catch (e) { /* no query */ }
    this.hdr = hdr;
    this.rtScene = makeRT(this.width, this.height, true, hdr);
    this.rtMask = makeRT(this.width, this.height, false);
    this.rtOverlay = makeRT(this.width, this.height, true);
    this.rtPre = makeLowRT(160, 90);
    this.rtGlow = makeLowRT(160, 90);
    this.rtWide = makeLowRT(80, 45);
    this.rtAo = this._hdrOk ? makeAoRT(320, 180) : null;
    this.rtAo2 = this._hdrOk ? makeAoRT(320, 180) : null;

    this.postUniforms = {
      tColor: { value: this.rtScene.texture },
      tDepth: { value: this.rtScene.depthTexture },
      tMask: { value: this.rtMask.texture },
      tMaskDepth: { value: this.rtMask.depthTexture },
      tOverlay: { value: this.rtOverlay.texture },
      tOverlayDepth: { value: this.rtOverlay.depthTexture },
      tGlow: { value: this.rtGlow.texture },
      tWide: { value: this.rtWide.texture },
      uWide: { value: 0 },
      tAo: { value: this.rtAo ? this.rtAo.texture : null },
      uAoRes: { value: new THREE.Vector2(320, 180) },
      uAo: { value: 0 },
      uAoFar: { value: 30 },
      uExposure: { value: 1 },
      uShoulder: { value: 0.74 },
      uOverlay: { value: 0 },
      uRes: { value: new THREE.Vector2(this.width, this.height) },
      uOutline: { value: 1 },
      uOutlineColor: { value: new THREE.Color() },
      uOutlineAlpha: { value: 1 },
      uOutlineFar: { value: 0 },
      uNear: { value: 0.1 },
      uFar: { value: 100 },
      uPersp: { value: 1 },
      uInnerThresh: { value: 0.35 },
      uVignette: { value: 0.3 },
      uSat: { value: 1 },
      uContrast: { value: 1 },
      uBright: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uLevels: { value: 40 },
      uDither: { value: 1 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(0, 0, 0) },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(1, 1, 1) },
      uIrisCenter: { value: new THREE.Vector2(0.5, 0.5) },
      uIris: { value: -1 },
      uTime: { value: 0 },
      uGrain: { value: 0 },
      uGlowOn: { value: 0 },
      uBloom: { value: 0 },
      uBloomTint: { value: new THREE.Color(1, 1, 1) },
      uGlowSteps: { value: 7 },
      uRays: { value: 0 },
      uRaysColor: { value: new THREE.Color(1, 1, 1) },
      uLift: { value: new THREE.Vector3(0, 0, 0) },
      uGamma: { value: new THREE.Vector3(1, 1, 1) },
      uGain: { value: new THREE.Vector3(1, 1, 1) },
      uFringe: { value: 0 },
      uWater: { value: 0 },
      uWaterColor: { value: new THREE.Color(0x2a7a8a) },
    };
    this.postMaterial = new THREE.ShaderMaterial({
      uniforms: this.postUniforms,
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      depthTest: false,
      depthWrite: false,
    });

    // the 1/4-res glow passes
    this.preUniforms = {
      tColor: this.postUniforms.tColor,
      tDepth: this.postUniforms.tDepth,
      tOverlay: this.postUniforms.tOverlay,
      uOverlay: this.postUniforms.uOverlay,
      uRes: this.postUniforms.uRes,
      uThresh: { value: 0.8 },
      uKnee: { value: 0.18 },
      uLight: { value: new THREE.Vector2(0.5, 0.5) },
      uRaysOn: { value: 0 },
      uRaysThresh: { value: 0.86 },
      uRaysSky: { value: 1 },
      uRaysRadius: { value: 0.45 },
      uAspect: { value: 16 / 9 },
    };
    this.glowUniforms = {
      tPre: { value: this.rtPre.texture },
      uLowRes: { value: new THREE.Vector2(160, 90) },
      uRadius: { value: 1 },
      uLight: this.preUniforms.uLight,
      uRaysOn: this.preUniforms.uRaysOn,
      uDecay: { value: 0.965 },
      uLen: { value: 0.92 },
    };
    this.preMaterial = new THREE.ShaderMaterial({ uniforms: this.preUniforms, vertexShader: POST_VERT, fragmentShader: PRE_FRAG, depthTest: false, depthWrite: false });
    this.glowMaterial = new THREE.ShaderMaterial({ uniforms: this.glowUniforms, vertexShader: POST_VERT, fragmentShader: GLOW_FRAG, depthTest: false, depthWrite: false });
    this.wideUniforms = { tGlow: this.postUniforms.tGlow, uLowRes: { value: new THREE.Vector2(80, 45) } };
    this.wideMaterial = new THREE.ShaderMaterial({ uniforms: this.wideUniforms, vertexShader: POST_VERT, fragmentShader: WIDE_FRAG, depthTest: false, depthWrite: false });
    // ambient occlusion (half res) + its depth-aware blur
    this.aoUniforms = {
      tDepth: this.postUniforms.tDepth,
      uRes: this.postUniforms.uRes,
      uAoRes: this.postUniforms.uAoRes,
      uProjInv: { value: new THREE.Matrix4() },
      uPInv: { value: new THREE.Vector4(1, 1, 0, 0) },
      uNF: { value: new THREE.Vector2(0.1, 100) },
      uProjScale: { value: 100 },
      uPersp: this.postUniforms.uPersp,
      uRadius: { value: 0.45 },
    };
    this.aoMaterial = new THREE.ShaderMaterial({ uniforms: this.aoUniforms, vertexShader: POST_VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false, defines: { AO_N: 10 } });
    this.aoBlurUniforms = { tAo: { value: null }, uAoRes: this.postUniforms.uAoRes, uDir: { value: new THREE.Vector2(1, 0) } };
    this.aoBlurMaterial = new THREE.ShaderMaterial({ uniforms: this.aoBlurUniforms, vertexShader: POST_VERT, fragmentShader: AOBLUR_FRAG, depthTest: false, depthWrite: false });

    this.postScene = new THREE.Scene();
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);

    // transition overlay (global, applied on top of scene post)
    this.transition = { fade: 0, iris: -1, irisCenter: [0.5, 0.5], color: 0x000000 };
    this.time = 0;
    this._grade = { ref: undefined, mix: -1 };
    this.sceneName = null; // set by Game.goto: picks the SCENE_POST defaults

    // quality: a tier per device class, adapted to the frame time on 'auto'
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    this.mobile = coarse;
    this.baseTier = tierIndex(coarse ? 'low' : 'high');
    this.tier = this.baseTier;
    this.aoLevel = TIERS[this.tier].ao;
    this._auto = { last: 0, dts: [], acc: 0, settle: 0, upOk: 0, raisedAt: -1, failUntil: [] };
    this.fixedTier = -1;
    try {
      const q = new URLSearchParams(window.location.search).get('q'); // ?q=ultra|high|medium|low|lower|potato pins a tier
      if (q && tierIndex(q) >= 0) this.fixedTier = tierIndex(q);
    } catch (e) { /* no query */ }
    this.setFx(initialFx(), false);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** HDR scene colour on/off (off: 8-bit sRGB, highlights clip; for comparisons and old GPUs). */
  setHdr(on) {
    on = !!on && this._hdrOk;
    if (on === this.hdr) return;
    this.hdr = on;
    this.rtScene.dispose();
    this.rtScene = makeRT(this.width, this.height, true, on);
    this.postUniforms.tColor.value = this.rtScene.texture;
    this.postUniforms.tDepth.value = this.rtScene.depthTexture;
  }

  /** The quality in effect: { tier, name, fx, ao, auto, width, height }. */
  get quality() {
    const t = TIERS[this.tier];
    return { tier: this.tier, name: t.name, fx: this.fx, ao: this.aoLevel, auto: this.fxAuto, width: this.width, height: this.height };
  }

  /** Apply tier i (resolution budget, glow level, AO); keeps the explicit fx choice if there is one. */
  setTier(i) {
    i = Math.max(0, Math.min(TIERS.length - 1, i));
    const t = TIERS[i];
    const changed = i !== this.tier || this._tierApplied !== true;
    this.tier = i;
    this._tierApplied = true;
    if (this.fxAuto) this._applyFx(t.fx);
    // (software rasterizers — headless tests — get the cheap AO unless a tier is pinned with ?q=)
    if (this.fxAuto) this.aoLevel = this.softwareGL && this.fixedTier < 0 ? Math.min(t.ao, 1) : t.ao;
    if (changed) this.resize();
    this._sizeAo();
  }

  _applyFx(level) {
    if (this.fx === level && this._fxApplied) return;
    this._fxApplied = true;
    this.fx = level;
    const hi = level === 'high';
    this.preMaterial.defines = { TAPS: hi ? 16 : 4 };
    this.glowMaterial.defines = { RAY_N: hi ? 28 : 14 };
    this.preMaterial.needsUpdate = true;
    this.glowMaterial.needsUpdate = true;
  }

  /**
   * Frame-time governor ('auto' only, real GPUs only): the median frame of each ~1.2 s window. Too
   * slow → one tier down at once; comfortably fast for 5 windows in a row → one tier up (never
   * above ultra on desktop / medium on phones). Stepping back down right after a raise marks that
   * tier as failed for a minute, so it doesn't see-saw.
   */
  _govern(now) {
    const A = this._auto;
    const dt = A.last ? now - A.last : 0;
    A.last = now;
    if (!this.fxAuto || this.fixedTier >= 0 || this.softwareGL) return;
    if (!(dt > 0) || dt > 1000) return; // loading hitches, hidden tabs (the median ignores the odd spike)
    A.dts.push(dt);
    A.acc += dt;
    if (A.acc < 1200) return;
    const d = A.dts.sort((a, b) => a - b), med = d[d.length >> 1];
    A.dts.length = 0; A.acc = 0;
    if (A.settle > 0) { A.settle--; return; }
    const slow = this.mobile ? 38 : 22, fast = this.mobile ? 24 : 17.9;
    const top = this.mobile ? tierIndex('medium') : 0;
    if (med > slow && this.tier < TIERS.length - 1) {
      if (A.raisedAt === this.tier) A.failUntil[this.tier] = now + 60000;
      A.raisedAt = -1; A.upOk = 0; A.settle = 1;
      this.setTier(this.tier + 1);
    } else if (med < fast && this.tier > top) {
      if (++A.upOk >= 5 && !(A.failUntil[this.tier - 1] > now)) {
        A.upOk = 0; A.settle = 1;
        this.setTier(this.tier - 1);
        A.raisedAt = this.tier;
      }
    } else A.upOk = 0;
  }

  /**
   * Effect quality: 'auto' | 'high' | 'low' | 'off' (saved in localStorage unless save = false).
   * An explicit level keeps the device's own resolution budget and sets glow + AO; 'auto' starts
   * from the device's tier and adapts.
   */
  setFx(level, save = true) {
    if (!FX_LEVELS.includes(level)) level = 'auto';
    this.fxAuto = level === 'auto';
    if (this.fixedTier >= 0) {
      this.fxAuto = true;
      this.setTier(this.fixedTier);
    } else if (this.fxAuto) {
      this.setTier(this.tier);
    } else {
      this._applyFx(level);
      this.aoLevel = level === 'high' ? 2 : level === 'low' ? 1 : 0;
      this.setTier(this.baseTier);
      this._sizeAo();
    }
    if (save) { try { window.localStorage.setItem(FX_KEY, level); } catch (e) { /* storage blocked */ } }
  }

  // AO targets: half resolution on high, quarter on low
  _sizeAo() {
    const div = this.aoLevel >= 2 ? 2 : 4;
    const aw = Math.max(1, Math.ceil(this.width / div)), ah = Math.max(1, Math.ceil(this.height / div));
    if (this.rtAo && (this.rtAo.width !== aw || this.rtAo.height !== ah)) { this.rtAo.setSize(aw, ah); this.rtAo2.setSize(aw, ah); }
    this.postUniforms.uAoRes.value.set(aw, ah);
  }

  setPixelOffset(o) {
    this.pixelOffset = o;
    this.resize();
  }

  resize() {
    if (!this.rtScene) return;
    const ww = Math.max(1, window.innerWidth);
    const wh = Math.max(1, window.innerHeight);
    // in device pixels: the largest integer fraction of the screen that fits the tier's pixel
    // budget (so every internal pixel is a crisp s×s block of real ones at any DPR), then the
    // player's 'Pixels' setting a step finer or coarser
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const dw = ww * dpr, dh = wh * dpr;
    const budget = TIERS[this.tier].px;
    let s = 1;
    while ((dw / s) * (dh / s) > budget && s < 16) s++;
    s = Math.max(1, s + this.pixelOffset);
    const w = Math.ceil(dw / s), h = Math.ceil(dh / s);
    const sc = s / dpr;
    if (w === this.width && h === this.height && sc === this.scale && this._sized) return;
    this._sized = true;
    this.scale = sc; // CSS px per internal pixel
    this.width = w;
    this.height = h;
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = this.width * sc + 'px';
    this.canvas.style.height = this.height * sc + 'px';
    this.rtScene.setSize(this.width, this.height);
    this.rtMask.setSize(this.width, this.height);
    this.rtOverlay.setSize(this.width, this.height);
    const lw = Math.max(1, Math.ceil(this.width / 4)), lh = Math.max(1, Math.ceil(this.height / 4));
    this.rtPre.setSize(lw, lh);
    this.rtGlow.setSize(lw, lh);
    this.glowUniforms.uLowRes.value.set(lw, lh);
    const ew = Math.max(1, Math.ceil(lw / 2)), eh = Math.max(1, Math.ceil(lh / 2));
    this.rtWide.setSize(ew, eh);
    this.wideUniforms.uLowRes.value.set(ew, eh);
    this._sizeAo();
    this.postUniforms.uRes.value.set(this.width, this.height);
    for (const cb of this.resizeListeners) cb(this.width, this.height);
  }

  onResize(cb) {
    this.resizeListeners.add(cb);
    return () => this.resizeListeners.delete(cb);
  }

  get aspect() { return this.width / this.height; }

  /** Screen position (uv, bottom-left origin) of the god-ray light, plus how visible it is (0..1). */
  lightScreen(p, camera, out) {
    if (p.raysScreen) { out.set(p.raysScreen[0], p.raysScreen[1]); return 1; }
    const src = p.raysDir || p.raysPos;
    if (!src) return 0;
    camera.updateMatrixWorld();
    if (p.raysDir) {
      _v.set(src[0] ?? src.x, src[1] ?? src.y, src[2] ?? src.z).normalize().multiplyScalar(Math.max(10, camera.far * 0.9)).add(camera.getWorldPosition(_cam));
    } else _v.set(src[0] ?? src.x, src[1] ?? src.y, src[2] ?? src.z);
    // behind the camera: no shafts
    _cam.copy(_v).applyMatrix4(camera.matrixWorldInverse);
    if (camera.isPerspectiveCamera && _cam.z > -0.01) return 0;
    _v.project(camera);
    out.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
    // fade as the light slides far off screen
    const off = Math.max(Math.abs(_v.x), Math.abs(_v.y)) - 1;
    return Math.max(0, Math.min(1, 1 - off / 0.8));
  }

  /**
   * Render a scene through the pixel-art post pipeline.
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   * @param {object} post overrides for DEFAULT_POST; post.overlay = {scene, camera} draws a first-person layer on top
   */
  render(scene, camera, post = {}) {
    const p = { ...DEFAULT_POST, ...(SCENE_POST[this.sceneName] || null), ...post };
    // a scene's own per-frame adjustments (e.g. the mine's air: shafts toward a lantern in a hall)
    const hook = scene.userData && scene.userData.postHook;
    if (hook) hook(p, camera, this);
    const r = this.renderer;
    const u = this.postUniforms;
    this._govern(performance.now());

    r.setRenderTarget(this.rtScene);
    r.setClearColor(scene.background && scene.background.isColor ? scene.background : 0x000000, 1);
    r.render(scene, camera);

    // ambient occlusion (half res) from the scene's depth, then its depth-aware blur
    const aoOn = this.rtAo && this.aoLevel > 0 && p.ao > 0;
    u.uAo.value = aoOn ? p.ao : 0;
    if (aoOn) {
      const au = this.aoUniforms;
      const n = this.aoLevel >= 2 ? 10 : 6;
      if (this.aoMaterial.defines.AO_N !== n) { this.aoMaterial.defines.AO_N = n; this.aoMaterial.needsUpdate = true; }
      camera.updateMatrixWorld();
      const pe = camera.projectionMatrix.elements;
      au.uProjInv.value.copy(camera.projectionMatrixInverse);
      au.uPInv.value.set(1 / pe[0], 1 / pe[5], pe[8], pe[9]);
      au.uNF.value.set(camera.near, camera.far);
      au.uProjScale.value = pe[5] * u.uAoRes.value.y * 0.5;
      au.uRadius.value = p.aoRadius;
      u.uPersp.value = camera.isPerspectiveCamera ? 1 : 0;
      u.uAoFar.value = p.aoFar;
      this.quad.material = this.aoMaterial;
      r.setRenderTarget(this.rtAo);
      r.render(this.postScene, this.postCamera);
      // blur across (rtAo → rtAo2), then down (rtAo2 → rtAo); the composite reads rtAo
      const bu = this.aoBlurUniforms;
      this.quad.material = this.aoBlurMaterial;
      bu.tAo.value = this.rtAo.texture; bu.uDir.value.set(1, 0);
      r.setRenderTarget(this.rtAo2);
      r.render(this.postScene, this.postCamera);
      bu.tAo.value = this.rtAo2.texture; bu.uDir.value.set(0, 1);
      r.setRenderTarget(this.rtAo);
      r.render(this.postScene, this.postCamera);
      this.quad.material = this.postMaterial;
    }

    if (p.outline) {
      const bg = scene.background;
      const fog = scene.fog;
      const mask = camera.layers.mask;
      scene.background = null;
      scene.fog = null;
      camera.layers.set(LAYER_OUTLINE);
      r.setRenderTarget(this.rtMask);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      r.render(scene, camera);
      camera.layers.mask = mask;
      scene.background = bg;
      scene.fog = fog;
    }

    // first-person overlay ({scene, camera}): rendered on its own so it never clips into walls
    const ov = post.overlay;
    u.uOverlay.value = ov ? 1 : 0;
    if (ov) {
      r.setRenderTarget(this.rtOverlay);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      r.render(ov.scene, ov.camera);
    }

    // glow passes (1/4 res): bloom + god rays
    const fxOn = this.fx !== 'off';
    let raysK = 0;
    if (fxOn && p.rays > 0) raysK = this.lightScreen(p, camera, this.preUniforms.uLight.value) * p.rays;
    const bloomOn = fxOn && p.bloom > 0;
    const glowOn = bloomOn || raysK > 0.001;
    u.uGlowOn.value = glowOn ? 1 : 0;
    let wide = false;
    if (glowOn) {
      const pu = this.preUniforms, gu = this.glowUniforms;
      pu.uThresh.value = bloomOn ? p.bloomThreshold : 9;
      pu.uKnee.value = p.bloomKnee;
      pu.uRaysOn.value = raysK > 0.001 ? 1 : 0;
      pu.uRaysThresh.value = p.raysThreshold;
      pu.uRaysSky.value = p.raysSky;
      pu.uRaysRadius.value = p.raysRadius;
      pu.uAspect.value = this.width / this.height;
      gu.uRadius.value = p.bloomRadius;
      gu.uDecay.value = p.raysDecay;
      gu.uLen.value = p.raysLength;
      this.quad.material = this.preMaterial;
      r.setRenderTarget(this.rtPre);
      r.render(this.postScene, this.postCamera);
      this.quad.material = this.glowMaterial;
      r.setRenderTarget(this.rtGlow);
      r.render(this.postScene, this.postCamera);
      wide = bloomOn && this.fx === 'high' && p.wideGlow > 0;
      if (wide) {
        this.quad.material = this.wideMaterial;
        r.setRenderTarget(this.rtWide);
        r.render(this.postScene, this.postCamera);
      }
      this.quad.material = this.postMaterial;
    }
    u.uWide.value = wide ? p.wideGlow : 0;
    u.uBloom.value = bloomOn ? p.bloom : 0;
    u.uBloomTint.value.set(p.bloomTint);
    u.uGlowSteps.value = p.glowSteps;
    u.uRays.value = raysK;
    u.uRaysColor.value.set(p.raysColor);

    // grade (resolved only when it changes)
    const G = this._grade;
    if (G.ref !== p.grade || G.mix !== p.gradeMix || typeof p.grade === 'object') {
      G.ref = p.grade; G.mix = p.gradeMix;
      const g = resolveGrade(p.grade), k = p.gradeMix;
      u.uLift.value.set(g.lift[0] * k, g.lift[1] * k, g.lift[2] * k);
      u.uGamma.value.set(1 + (g.gamma[0] - 1) * k, 1 + (g.gamma[1] - 1) * k, 1 + (g.gamma[2] - 1) * k);
      u.uGain.value.set(1 + (g.gain[0] - 1) * k, 1 + (g.gain[1] - 1) * k, 1 + (g.gain[2] - 1) * k);
    }
    u.uFringe.value = p.fringe;
    u.uWater.value = p.underwater;
    u.uWaterColor.value.set(p.underwaterColor);

    u.uOutline.value = p.outline ? 1 : 0;
    u.uOutlineColor.value.set(p.outlineColor);
    u.uOutlineAlpha.value = p.outlineAlpha;
    u.uOutlineFar.value = p.outlineFar || 0;
    u.uInnerThresh.value = p.innerThresh;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uPersp.value = camera.isPerspectiveCamera ? 1 : 0;
    u.uVignette.value = p.vignette;
    u.uSat.value = p.saturation;
    u.uContrast.value = p.contrast;
    u.uBright.value = p.brightness;
    u.uTint.value.set(p.tint);
    u.uLevels.value = p.levels;
    u.uDither.value = p.dither;
    u.uGrain.value = p.grain;
    u.uExposure.value = p.exposure;
    u.uShoulder.value = p.shoulder;
    u.uTime.value = this.time;

    // combine scene fade with global transition
    const t = this.transition;
    u.uFade.value = Math.min(1, Math.max(p.fade, t.fade));
    u.uFadeColor.value.set(t.fade > p.fade ? t.color : p.fadeColor);
    u.uFlash.value = p.flash;
    u.uFlashColor.value.set(p.flashColor);
    const iris = t.iris >= 0 ? t.iris : p.iris;
    const ic = t.iris >= 0 ? t.irisCenter : p.irisCenter;
    u.uIris.value = iris;
    u.uIrisCenter.value.set(ic[0], ic[1]);
    if (t.iris >= 0) u.uFadeColor.value.set(t.color);

    r.setRenderTarget(null);
    r.render(this.postScene, this.postCamera);
  }

  /** Project a world position to CSS pixel coords on the page. */
  toScreen(vec3, camera, out = { x: 0, y: 0, visible: true }) {
    const v = vec3.clone().project(camera);
    out.visible = v.z > -1 && v.z < 1;
    out.x = (v.x * 0.5 + 0.5) * this.width * this.scale;
    out.y = (-v.y * 0.5 + 0.5) * this.height * this.scale;
    return out;
  }
}
