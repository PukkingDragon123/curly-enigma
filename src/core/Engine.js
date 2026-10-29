import * as THREE from 'three';

// Objects on this camera layer get a crisp 1px pixel-art outline.
export const LAYER_OUTLINE = 1;

// ---------------------------------------------------------------------------------------------
// The pixel post pipeline
//   1. scene → rtScene (colour + depth), outline layer → rtMask, first-person overlay → rtOverlay
//   2. (only when bloom or god rays are on) two tiny passes at 1/4 resolution:
//        prefilter: a 4x4 box of the scene → bright pixels (rgb) + light-shaft sources (a)
//        glow:      a soft ring blur of the bright pixels (rgb) + a radial blur toward the light (a)
//   3. the final pass: outlines, overlay, glow (quantized + dithered so it stays pixel art),
//      underwater wobble/murk, grade (lift/gamma/gain), vignette, posterize + dither, fades.
// Every effect is driven by the `post` object a scene passes to render(); see DEFAULT_POST.
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

const POST_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tMask;
uniform sampler2D tMaskDepth;
uniform sampler2D tOverlay;
uniform sampler2D tOverlayDepth;
uniform sampler2D tGlow;
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
varying vec2 vUv;
${GLSL_LUM}

float linDepth(float d) {
  if (uPersp < 0.5) return uNear + d * (uFar - uNear);
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

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
    vec3 glow = g.rgb * uBloom * uBloomTint + uRaysColor * (g.a * uRays);
    if (uGlowSteps > 0.0) {
      float m = max(glow.r, max(glow.g, glow.b));
      float q = floor(m * uGlowSteps + bayer4(gl_FragCoord.xy) * 0.999) / uGlowSteps;
      glow *= m > 1e-4 ? q / m : 0.0;
    }
    col += glow * (1.0 - col * 0.5);
  }

  col *= uBright * uTint;
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
  }

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

function makeRT(w, h, srgb) {
  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: true,
    stencilBuffer: false,
  });
  if (srgb) rt.texture.colorSpace = THREE.SRGBColorSpace;
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
  levels: 40,
  dither: 1,
  grain: 0,
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
  glowSteps: 7,
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
  home: { grade: 'tavern', gradeMix: 0.7, bloom: 0.6, bloomThreshold: 0.76 }, // Old Star's lamplit cave
  deep: { grade: 'deep', gradeMix: 0.85, bloom: 0.55, bloomThreshold: 0.72, saturation: 1.16, contrast: 1.06 }, // cool rock, warm lamps, glowing ore
  town: { grade: 'town', gradeMix: 0.85, bloom: 0.65, bloomThreshold: 0.74 },
  forge: { grade: 'forge', gradeMix: 0.85, bloom: 0.75, bloomThreshold: 0.7 }, // hot metal glows
  cooking: { grade: 'warm', gradeMix: 0.7, bloom: 0.5, bloomThreshold: 0.8 },
  showroom: { bloom: 0 },
};

/** The mine's strata, each with its own light (zone 1..6 → a GRADES name): post.grade = ZONE_GRADES[zone]. */
export const ZONE_GRADES = [null, 'rootsoil', 'clay', 'grotto', 'magma', 'frost', 'core'];

/** Effect quality levels: 'high' (default), 'low' (cheaper glow, for phones), 'off' (no glow passes). */
export const FX_LEVELS = ['high', 'low', 'off'];
const FX_KEY = 'moleforge.fx';

function initialFx() {
  try {
    const q = new URLSearchParams(window.location.search).get('fx');
    if (q && FX_LEVELS.includes(q)) return q;
    if (q === '0') return 'off';
    const s = window.localStorage.getItem(FX_KEY);
    if (s && FX_LEVELS.includes(s)) return s;
  } catch (e) { /* storage blocked */ }
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return coarse ? 'low' : 'high';
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

    this.rtScene = makeRT(this.width, this.height, true);
    this.rtMask = makeRT(this.width, this.height, false);
    this.rtOverlay = makeRT(this.width, this.height, true);
    this.rtPre = makeLowRT(160, 90);
    this.rtGlow = makeLowRT(160, 90);

    this.postUniforms = {
      tColor: { value: this.rtScene.texture },
      tDepth: { value: this.rtScene.depthTexture },
      tMask: { value: this.rtMask.texture },
      tMaskDepth: { value: this.rtMask.depthTexture },
      tOverlay: { value: this.rtOverlay.texture },
      tOverlayDepth: { value: this.rtOverlay.depthTexture },
      tGlow: { value: this.rtGlow.texture },
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

    this.setFx(initialFx(), false);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Effect quality: 'high' | 'low' | 'off' (saved in localStorage unless save = false). */
  setFx(level, save = true) {
    if (!FX_LEVELS.includes(level)) level = 'high';
    this.fx = level;
    const hi = level === 'high';
    this.preMaterial.defines = { TAPS: hi ? 16 : 4 };
    this.glowMaterial.defines = { RAY_N: hi ? 28 : 14 };
    this.preMaterial.needsUpdate = true;
    this.glowMaterial.needsUpdate = true;
    if (save) { try { window.localStorage.setItem(FX_KEY, level); } catch (e) { /* storage blocked */ } }
  }

  setPixelOffset(o) {
    this.pixelOffset = o;
    this.resize();
  }

  resize() {
    const ww = Math.max(1, window.innerWidth);
    const wh = Math.max(1, window.innerHeight);
    // ~540-720 internal lines: crisp pixel art that still has room for fine voxel detail
    const base = Math.max(1, Math.floor(Math.min(wh / 500, ww / 800)));
    const s = Math.max(1, base + this.pixelOffset);
    this.scale = s;
    this.width = Math.ceil(ww / s);
    this.height = Math.ceil(wh / s);
    this.renderer.setSize(this.width, this.height, false);
    this.canvas.style.width = this.width * s + 'px';
    this.canvas.style.height = this.height * s + 'px';
    this.rtScene.setSize(this.width, this.height);
    this.rtMask.setSize(this.width, this.height);
    this.rtOverlay.setSize(this.width, this.height);
    const lw = Math.max(1, Math.ceil(this.width / 4)), lh = Math.max(1, Math.ceil(this.height / 4));
    this.rtPre.setSize(lw, lh);
    this.rtGlow.setSize(lw, lh);
    this.glowUniforms.uLowRes.value.set(lw, lh);
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

    r.setRenderTarget(this.rtScene);
    r.setClearColor(scene.background && scene.background.isColor ? scene.background : 0x000000, 1);
    r.render(scene, camera);

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
      this.quad.material = this.postMaterial;
    }
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
