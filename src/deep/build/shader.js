// The look of placed blocks: patches the terrain material at runtime (onBeforeCompile, like
// fluids/caustics.js) so every building material (ids 80..95, ./mats.js; and the dungeons' cobble,
// 64-65) is drawn with a crisp
// Minecraft-like block texture on the 0.5 m grid: 32 "block pixels" per block face (2×2 terrain
// texels each), the same pattern on every block so walls read block by block, a hairline where two
// blocks meet, bevelled outer edges (the mesher's convex-edge flags) the lamp picks out, and glass
// that is see-through (its inside texels are discarded; Build.js draws the faces the mesher hid
// behind it). The rest of the terrain lighting (lamp, lights, AO, fog) is untouched.
//
// patchBuildLook(mat) → true when the terrain material has the anchor line it hooks before
// (`float ti = clamp(floor(tone + 0.5), 0.0, 3.0);`); false leaves it alone (blocks then look like
// plain bricks: still usable).
import { BM } from './mats.js';
import { RM } from '../ruins/mats.js';

const ANCHOR = /float ti = clamp\(floor\(tone \+ 0\.5\), 0\.0, 3\.0\);/;
const MAIN = /void\s+main\s*\(\s*\)\s*\{/;

const FUNCS = /* glsl */`
  // ---- building blocks (build/shader.js)
  // 2D jittered Voronoi on block pixels, tiling every 32 px: x = stone id hash, y = edge distance (cells), zw = offset from the stone's centre (cells)
  vec4 bk_vor(vec2 P, float cs, float seed) {
    vec2 p = (P + 0.5) / cs;
    vec2 g = floor(p);
    float n = 32.0 / cs;
    float f1 = 1e9, f2 = 1e9; vec2 id = vec2(0.0), off = vec2(0.0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = g + vec2(float(i), float(j));
      vec2 cc = mod(c, n);
      vec3 h = hash33(vec3(cc, seed));
      vec2 fp = c + 0.5 + (h.xy - 0.5) * 0.72;
      vec2 d = p - fp;
      float dd = dot(d, d);
      if (dd < f1) { f2 = f1; f1 = dd; id = cc; off = d; } else if (dd < f2) { f2 = dd; }
    }
    return vec4(hash3(vec3(id, seed + 3.7)), sqrt(f2) - sqrt(f1), off);
  }
`;

// injected right before `float ti = ...` (all the terrain shader's locals are in scope)
const BODY = /* glsl */`
  if ((vMat > ${BM.B_COBBLE - 0.5} && vMat < ${BM.B_BENCH + 0.5}) || (vMat > ${RM.DCOB - 0.5} && vMat < ${RM.DMOSSCOB + 0.5})) {
    float bm = floor(vMat + 0.5);
    bool dcob = bm < ${RM.DMOSSCOB + 0.5}; // the dungeons' cobble (natural-caves part) gets the same stones
    vec3 cellc = floor(q / 8.0);
    vec3 bq = q - cellc * 8.0;                  // voxels inside the block, 0..8
    float fu = dot(bq, t1), fv = dot(bq, t2);    // on this face (t2 is up on walls)
    vec2 P = floor(vec2(fu, fv) * 4.0);          // block pixel, 0..31
    float bid = hash3(cellc + 0.37);             // this block's own little difference
    float pn = hash3(vec3(P, bm) + cellc * 0.11); // per block pixel noise
    float fs = dot(abs(n), vec3(1.0, 2.0, 3.0));  // which face way
    float side = 1.0 - abs(n.y);
    bool cut = false;
    tone = 1.5; seam = 0.0; accent = 0.0; bevel = 0.0; glin = 0.0; wrap = 0.35;
    vec3 tilt = vec3(0.0);
    if (!dcob) { grow = 0.0; ex.a = 0.0; } // placed blocks stay clean; dungeon walls keep the zone's moss
    ex.r = 0.06; ex.g = 0.2;
    // a hairline where two blocks meet (only on faces running across the seam)
    float edgeP = min(min(P.x, 31.0 - P.x), min(P.y, 31.0 - P.y));

    if (dcob || bm < ${BM.B_COBBLE + 0.5}) {
      // cobblestone: rounded stones in dark mortar
      vec4 v = bk_vor(P, 8.0, fs);
      if (v.y < 0.13) { if (dcob) { tone = 0.0; seam = 0.45; } else { accent = 1.0; tone = 0.0; } }
      else {
        tone = 0.7 + v.x * 2.2 + (pn - 0.5) * 0.7 + clamp(v.w * (n.y > 0.5 ? 0.0 : 1.4) - v.z * 0.4, -0.7, 0.7);
        seam = clamp(0.32 - v.y, 0.0, 0.32) * 1.4;
        tilt = (t1 * v.z + t2 * v.w) * 0.9;
        if (pn > 0.965) tone += 0.8;
      }
      ex.r = 0.12; ex.g = 0.35;
    } else if (bm < ${BM.B_STONEBRICK + 0.5}) {
      // stone bricks: two courses, bricks 16 px, half offset, mortar, a chisel bevel
      float row = floor(P.y / 16.0);
      float o = mod(row, 2.0) * 8.0;
      float bx = mod(P.x + o, 16.0), by = mod(P.y, 16.0);
      float bk = floor((P.x + o) / 16.0);
      float bh = hash3(vec3(bk, row, 5.0 + fs));
      if (bx < 1.0 || by < 1.0) { accent = 1.0; }
      else {
        tone = 1.2 + bh * 1.4 + (pn - 0.5) * 0.5;
        if (by > 14.0 || bx > 14.0) { tone -= 0.8; tilt -= (by > 14.0 ? t2 : t1) * 0.5; }
        else if (by < 2.0 || bx < 2.0) { tone += 0.7; tilt += (by < 2.0 ? t2 : t1) * 0.4; }
        // a crack here and there
        if (bh > 0.78 && abs(bx - 3.0 - by * 0.6 - bh * 6.0) < 0.6 && by > 3.0 && by < 12.0) { tone = 0.2; }
      }
      ex.r = 0.1; ex.g = 0.3;
    } else if (bm < ${BM.B_CLAYBRICK + 0.5}) {
      // clay bricks: four courses of red bricks in pale mortar
      float row = floor(P.y / 8.0);
      float o = mod(row, 2.0) * 8.0;
      float bx = mod(P.x + o, 16.0), by = mod(P.y, 8.0);
      float bh = hash3(vec3(floor((P.x + o) / 16.0), row, 9.0 + fs));
      if (bx < 1.0 || by < 1.0) { accent = 1.0; seam = 0.15 + pn * 0.15; }
      else {
        tone = 0.9 + bh * 1.6 + (pn - 0.5) * 0.6;
        if (bh < 0.12) tone -= 0.8; // a burnt one
        if (by > 6.0) { tone -= 0.6; tilt -= t2 * 0.35; } else if (by < 2.0) { tone += 0.5; tilt += t2 * 0.3; }
        if (pn > 0.93) seam = 0.25;
      }
    } else if (bm < ${BM.B_PLANKS + 0.5}) {
      // planks: four boards a block, joints staggered, grain, nails
      float along = P.x, acr = P.y;
      float board = floor(acr / 8.0), ba = mod(acr, 8.0);
      float shift = floor(hash3(vec3(board, bid * 7.0, fs)) * 4.0) * 8.0;
      float ja = mod(along + shift, 32.0);
      float bh = hash3(vec3(board, floor((along + shift) / 32.0), bid * 13.0 + fs));
      tone = 1.3 + bh * 1.2 + sin(along * 0.55 + bh * 40.0 + ba * 0.9) * 0.35 + (pn - 0.5) * 0.5;
      if (ba < 1.0) { accent = 1.0; }
      else if (ba > 6.0) { tone -= 0.6; tilt -= t2 * 0.3; }
      else if (ba < 2.0) { tone += 0.4; tilt += t2 * 0.25; }
      if (ja < 1.0 && ba >= 1.0) { accent = 1.0; }
      else if ((ja < 3.0 || ja > 29.0) && abs(ba - 4.0) < 0.5 && ba >= 1.0) { tone = 3.0; seam = 0.35; } // nail heads
      wrap = 0.4;
    } else if (bm < ${BM.B_LOG_Z + 0.5}) {
      // logs: rings on the ends, bark down the sides (axis by material)
      vec3 ax = bm < ${BM.B_LOG_Y + 0.5} ? vec3(0.0, 1.0, 0.0) : bm < ${BM.B_LOG_X + 0.5} ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
      if (abs(dot(n, ax)) > 0.5) {
        vec2 c = P - 15.5;
        float r = length(c) + hash3(vec3(floor(atan(c.y, c.x) * 3.0), bid, 2.0)) * 1.2;
        if (r > 13.5) { tone = 0.4 + pn * 0.9; seam = 0.15; }
        else {
          tone = 3.0 - step(1.0, mod(r, 3.2)) * 0.9 - (pn > 0.8 ? 0.5 : 0.0);
          if (r < 1.8) tone = 2.0;
          if (r > 12.4) { tone = 1.4; }
          ex.b = 0.0;
        }
      } else {
        float al = dot(bq, ax) * 4.0;                 // along the log, 0..32
        float ac = abs(dot(t1, ax)) > 0.5 ? P.y : P.x; // across
        float gr = floor(ac / 4.0);
        float gh = hash3(vec3(gr, floor(al / 9.0 + hash3(vec3(gr, 1.0, bid)) * 3.0), bid));
        float gx = mod(ac, 4.0);
        tone = 0.5 + gh * 1.3 + (pn - 0.5) * 0.6;
        if (gx < 1.0) { tone = 0.0; seam = 0.35; tilt -= (abs(dot(t1, ax)) > 0.5 ? t2 : t1) * 0.4; }
        else if (gx > 2.5) tone += 0.5;
        if (gh > 0.92 && pn > 0.55) { tone = 2.6; } // a lichen fleck
      }
      wrap = 0.4;
    } else if (bm < ${BM.B_GLASS + 0.5}) {
      // glass: a pale frame round each block, two glints; the rest is clear (discarded)
      float fr = edgeP;
      if (fr < 1.0) { tone = 3.0; seam = 0.0; accent = pn > 0.7 ? 1.0 : 0.0; }
      else if (fr < 2.0) { tone = 1.4; }
      else {
        float d1 = P.x + P.y, d2 = P.x + P.y - 9.0;
        if ((d1 > 34.0 && d1 < 36.5 && P.x > 6.0 && P.x < 26.0) || (d2 > 34.0 && d2 < 35.6 && P.x > 14.0 && P.x < 24.0) || (d1 > 13.0 && d1 < 14.6 && P.x > 3.0 && P.x < 10.0)) { tone = 3.0; accent = 1.0; }
        else cut = true;
      }
      ex.r = 0.9; ex.g = 0.95; glin = 0.0;
    } else if (bm < ${BM.B_DIRT + 0.5}) {
      // dirt block: crumbly earth with clods and a pebble or two
      float cl = hash3(vec3(floor(P / 3.0), 11.0 + fs));
      tone = 0.6 + cl * 1.6 + (pn - 0.5) * 0.9;
      if (pn > 0.955) { accent = 1.0; }
      if (cl < 0.12) tone = 0.0;
      wrap = 0.45;
    } else if (bm < ${BM.B_LANTERN + 0.5}) {
      // torch bracket, lantern hook: blackened iron
      tone = 0.8 + pn * 1.6;
      if (pn > 0.85) accent = 1.0;
      ex.r = 0.4; ex.g = 0.6;
    } else if (bm < ${BM.B_DOOR_CCW + 0.5}) {
      // doors: upright boards, two braces a block, iron studs; the hinge column is iron straps
      bool hingeCol = bm > ${BM.B_DOOR + 0.5};
      float u = P.x, v = P.y;
      float brace = (v >= 3.0 && v < 7.0) || (v >= 24.0 && v < 28.0) ? 1.0 : 0.0;
      if (hingeCol) {
        tone = 0.6 + pn;
        if (brace > 0.5) { accent = 1.0; tone = 1.0; }
        ex.r = 0.3; ex.g = 0.5;
      } else if (abs(n.y) > 0.5) {
        tone = 1.0 + pn;
      } else {
        float bw = mod(u, 8.0);
        float bh = hash3(vec3(floor(u / 8.0), cellc.y, bid));
        tone = 1.4 + bh * 1.1 + sin(v * 0.6 + bh * 30.0) * 0.3 + (pn - 0.5) * 0.4;
        if (bw < 1.0) { accent = 1.0; }
        if (brace > 0.5) {
          tone = 2.4 + (pn - 0.5) * 0.5; accent = 0.0;
          if (v < 4.0 || v >= 27.0 || (v >= 6.0 && v < 7.0) || (v >= 24.0 && v < 25.0)) { tone = 0.9; }
          if (abs(bw - 4.0) < 1.0 && abs(mod(v, 21.0) - 5.0) < 1.0) { accent = 1.0; seam = 0.0; }
        }
      }
      wrap = 0.4;
    } else if (bm < ${BM.B_CHEST + 0.5}) {
      // chest: boards, iron corners and rim, a dark lid seam, a brass lock (the accent)
      float y = bq.y;
      float row = floor(P.y / 6.0);
      tone = 1.5 + hash3(vec3(row, bid, fs)) * 1.1 + (pn - 0.5) * 0.5;
      if (mod(P.y, 6.0) < 1.0) tone -= 0.9;
      bool iron = false, lock = false;
      if (abs(n.y) < 0.5) {
        if (abs(y - 4.0) < 0.25) { tone = 0.0; seam = 0.6; }
        if (fu < 1.5 || fu > 6.5 || y > 5.6) iron = true;
        if (abs(fu - 4.0) < 0.5 && y > 3.0 && y < 4.6) lock = true;
      } else if (fu < 1.5 || fu > 6.5 || fv < 1.5 || fv > 6.5) iron = true;
      if (lock) { accent = 1.0; glin = 0.03; } else if (iron) { tone = 0.0; seam = 0.45; }
      wrap = 0.4;
    } else {
      // workbench: a planked top with a vise and a ruler; sturdy legs
      tone = 1.4 + hash3(vec3(floor(P.y / 8.0), bid, fs)) * 1.0 + sin(P.x * 0.5 + floor(P.y / 8.0) * 3.0) * 0.3 + (pn - 0.5) * 0.4;
      if (mod(P.y, 8.0) < 1.0) tone = 0.3;
      if (n.y > 0.5) {
        if (P.x > 2.0 && P.x < 10.0 && P.y > 2.0 && P.y < 9.0) { accent = 1.0; tone = 0.0; if (P.y > 7.0 || P.x < 3.5) seam = 0.4; } // the vise
        if (P.y > 25.0 && P.y < 27.0 && P.x > 6.0 && P.x < 28.0) { tone = 3.0; if (mod(P.x, 3.0) < 1.0) seam = 0.5; } // a ruler
        if (abs(P.x - P.y * 0.6 - 10.0) < 0.6 && P.y > 12.0 && P.y < 22.0) tone = 0.0; // a knife scratch
      } else if (bq.y < 6.0) {
        tone -= 0.4;
      }
      wrap = 0.4;
    }

    // block hairline: where this block's face meets the next one's
    if (edgeP < 0.5 && !dcob && bm != ${BM.B_GLASS}.0 && bm < ${BM.B_TORCH - 0.5}) seam = max(seam, 0.28);
    // bevel on the outer edges (the mesher's convex-edge flags): lit on top / left, shaded under
    if (vEdge > 0.5 && dist < 10.0) {
      vec3 lean = vec3(0.0);
      float bw = dist < 4.0 ? 2.0 : 1.0;
      if (mod(vEdge, 2.0) > 0.5 && tx.x < bw) lean -= t1;
      if (mod(floor(vEdge * 0.5), 2.0) > 0.5 && tx.x > TEXN - 1.0 - bw) lean += t1;
      if (mod(floor(vEdge * 0.25), 2.0) > 0.5 && tx.y < bw) lean -= t2;
      if (floor(vEdge * 0.125) > 0.5 && tx.y > TEXN - 1.0 - bw) lean += t2;
      if (dot(lean, lean) > 0.0) { tilt += lean * 1.1; bevel = max(bevel, 0.6); seam *= 0.5; }
    }
    nn = normalize(n + tilt * (0.45 + 0.55 * near));
    seam *= mix(0.6, 1.0, near);
    if (cut) discard;
  }
`;

/** Patch the terrain material (once). */
export function patchBuildLook(mat) {
  if (!mat || !mat.isShaderMaterial) return false;
  if (mat.userData.bkPatched) return true;
  if (!ANCHOR.test(mat.fragmentShader) || !MAIN.test(mat.fragmentShader)) return false;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    let f = sh.fragmentShader;
    if (!ANCHOR.test(f) || !MAIN.test(f)) return;
    f = f.replace(ANCHOR, (s) => BODY + '\n        ' + s);
    f = f.replace(MAIN, (s) => FUNCS + '\n' + s);
    sh.fragmentShader = f;
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|bk1';
  mat.userData.bkPatched = true;
  mat.needsUpdate = true;
  return true;
}
