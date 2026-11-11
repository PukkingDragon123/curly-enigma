// Floating words as real 3D text in the world: chunky voxel letters built from the sign font's 5x7
// glyphs (src/bookends/pixfont.js glyphRows, plus the few marks it lacks: + % × ? : / ...), each ink
// pixel a little extruded block with a pixel-art bevel (lit top-left edges, shaded bottom-right) on a
// dark outline plate one pixel wider all round. They pop out of the spot that made them (a hit point,
// a coin, the work on the anvil), punch in scale, arc or rise, tumble a little and then shatter into
// tumbling voxel bits (or dissolve, for the gentle ones). No 2D boxes, no DOM labels.
//
//   floatText3D(game, text, worldPos, { kind, color, size, life, wrap, tint, rainbow, stack })
//      (worldPos: a Vector3; tint: the colour also recolours a named kind; stack: false = don't
//      climb over words born at the same spot)
//   floatText3D(game, text, sx, sy, color, size)                          (old screen-point form:
//      the point is lifted off the screen into the view, about a metre in front of the camera)
//   text3dStats(game) → { words, voxels, ms, msMax, cap }
//
// kind: damage | crit | parry | smash | combo | gold | ore | reveal | tough | weak | alert |
//       perfect | great | good | meh | bad | miss | info (guessed from the text and colour when
//       left out). `color` overrides the kind's core colour; `size` scales it.
//
// Drawing: ONE pooled InstancedMesh of unit cubes for every live word (capped: MAX_VOX voxels,
// MAX_WORDS words; the oldest goes first), lit by the scene (Lambert, so the forge's fire and the
// burrow's lamps tint it) with an emissive core that feeds the bloom, faces pre-shaded light top-left.
// Words are depth-tested; where something stands in front of one, a second draw of the same
// instances (depthFunc Greater, drawn first) shows it through as a faint dithered silhouette so a
// word behind a pillar still reads. Fades are an ordered dither (no blending, no sorting). Everything
// ticks in the scene's onBeforeRender (whatever camera draws it), sized against that camera so a
// word reads the same at any distance.
import * as THREE from 'three';
import { glyphRows } from '../bookends/pixfont.js';
import { LAYER_OUTLINE } from '../core/Engine.js';

const MAX_VOX = 8192; // all live words together
const MAX_WORDS = 40;
const LINE = 9; // 7 rows + a 2 px lead
const WRAP = 13; // characters on a line before a phrase wraps
const GLOW = 0.6; // all the kinds' glow, scaled (the bloom picks up anything much over 1)

// marks the sign font lacks (5x7 like the rest; '#' = ink)
const EXTRA = {
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  '?': ['.###.', '#...#', '....#', '..##.', '..#..', '.....', '..#..'],
  ':': ['.', '.', '#', '.', '.', '#', '.'],
  ';': ['..', '..', '.#', '..', '..', '.#', '#.'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['.#', '#.', '#.', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '.#', '.#', '#.'],
  '"': ['#.#', '#.#', '...', '...', '...', '...', '...'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '=': ['....', '....', '####', '....', '####', '....', '....'],
  '✓': ['.....', '....#', '....#', '...#.', '#.#..', '.#...', '.....'],
  '♪': ['..##', '..#.', '..#.', '..#.', '###.', '###.', '.#..'],
  '→': ['.....', '..#..', '...#.', '#####', '...#.', '..#..', '.....'],
  '←': ['.....', '..#..', '.#...', '#####', '.#...', '..#..', '.....'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  '°': ['###', '#.#', '###', '...', '...', '...', '...'],
  '·': ['.', '.', '.', '#', '.', '.', '.'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
};
const rowsOf = (ch) => EXTRA[ch] || glyphRows(ch);
const clean = (s) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/…/g, '...').replace(/[‘’`]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/\s+/g, ' ').trim().toUpperCase();
const lineWidth = (s) => { let w = 0; for (const ch of s) w += rowsOf(ch)[0].length + 1; return Math.max(0, w - 1); };

// ------------------------------------------------------------------ styles
// core: ink colour · edge: the outline plate · size: cap height as a share of the view's height ·
// life (s) · glow: emissive boost on the ink · motion: arc | slam | rise | drop | shake | bob ·
// punch: how hard it overshoots popping out · tumble · end: shatter | dissolve · shine: a glint
// sweeps across · rainbow: the ink steps through bright colours (the cooking grade "PERFECT!")
const KINDS = {
  damage: { core: 0xfff0dc, edge: 0x4a1410, size: 0.046, life: 0.95, glow: 0.35, motion: 'arc', punch: 0.55, tumble: 0.16, end: 'shatter' },
  crit: { core: 0xffd84a, edge: 0x5a1c04, size: 0.074, life: 1.3, glow: 1.0, motion: 'slam', punch: 0.9, tumble: 0.2, end: 'shatter', shine: true },
  parry: { core: 0xffe27a, edge: 0x1c2a52, size: 0.066, life: 1.2, glow: 0.9, motion: 'slam', punch: 0.7, tumble: 0.14, end: 'shatter', shine: true },
  smash: { core: 0xffb070, edge: 0x581404, size: 0.066, life: 1.15, glow: 0.8, motion: 'slam', punch: 0.8, tumble: 0.24, end: 'shatter' },
  combo: { core: 0xfff0c8, edge: 0x4a2a10, size: 0.046, life: 0.9, glow: 0.45, motion: 'arc', punch: 0.7, tumble: 0.2, end: 'shatter' },
  gold: { core: 0xffd860, edge: 0x4e2c04, size: 0.052, life: 1.35, glow: 0.75, motion: 'rise', punch: 0.5, tumble: 0.06, end: 'shatter', shine: true },
  ore: { core: 0xff8a6a, edge: 0x420a06, size: 0.054, life: 1.05, glow: 0.45, motion: 'drop', punch: 0.45, tumble: 0.12, end: 'shatter' },
  reveal: { core: 0xffe8a0, edge: 0x3a2410, size: 0.046, life: 1.8, glow: 0.7, motion: 'rise', punch: 0.35, tumble: 0.04, end: 'dissolve', shine: true },
  tough: { core: 0xffc89a, edge: 0x3a1a10, size: 0.048, life: 1.05, glow: 0.35, motion: 'shake', punch: 0.4, tumble: 0.1, end: 'shatter' },
  weak: { core: 0xffe08a, edge: 0x4a2808, size: 0.052, life: 1.15, glow: 0.8, motion: 'slam', punch: 0.5, tumble: 0.1, end: 'shatter', shine: true },
  alert: { core: 0xffd84a, edge: 0x4a1804, size: 0.07, life: 0.9, glow: 0.9, motion: 'bob', punch: 0.8, tumble: 0.06, end: 'shatter' },
  perfect: { core: 0xffe066, edge: 0x5a2a04, size: 0.07, life: 1.35, glow: 0.8, motion: 'slam', punch: 0.85, tumble: 0.14, end: 'shatter', shine: true },
  great: { core: 0xffe066, edge: 0x4e2a06, size: 0.058, life: 1.2, glow: 0.75, motion: 'slam', punch: 0.6, tumble: 0.12, end: 'shatter', shine: true },
  good: { core: 0x9af07a, edge: 0x14380c, size: 0.05, life: 1.1, glow: 0.5, motion: 'arc', punch: 0.5, tumble: 0.12, end: 'shatter' },
  meh: { core: 0x9fdcff, edge: 0x12304a, size: 0.046, life: 1.15, glow: 0.35, motion: 'rise', punch: 0.35, tumble: 0.08, end: 'dissolve' },
  bad: { core: 0xff9a8a, edge: 0x3a1010, size: 0.05, life: 1.15, glow: 0.4, motion: 'shake', punch: 0.4, tumble: 0.14, end: 'shatter' },
  miss: { core: 0xd8c8b0, edge: 0x2a2018, size: 0.046, life: 1.0, glow: 0.2, motion: 'drop', punch: 0.3, tumble: 0.16, end: 'dissolve' },
  info: { core: 0xf6e6c0, edge: 0x2e2014, size: 0.042, life: 1.35, glow: 0.4, motion: 'rise', punch: 0.4, tumble: 0.06, end: 'dissolve' },
};
const RAINBOW_LIN = [0xffe066, 0xffb0e0, 0xa0f0ff, 0xc0ff9a].map((h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; });

const TONES = new Set(['great', 'good', 'bad', 'meh', 'info']);
const darkHex = (h, k) => (Math.round(((h >> 16) & 255) * k) << 16) | (Math.round(((h >> 8) & 255) * k) << 8) | Math.round((h & 255) * k);

/** The tone of a colour: gold → great, green → good, red → bad, cool → meh, else info. */
function toneOf(hex) {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  if (r > 200 && g > 180 && b < 140) return 'great';
  if (g > r + 20 && g > b) return 'good';
  if (r > g + 40 && r > b + 40) return 'bad';
  if (b > r + 20) return 'meh';
  return 'info';
}

/** Which style a word gets when the caller didn't say. */
function guessKind(s, hex) {
  if (/^CRIT/.test(s)) return 'crit';
  if (/^PARRY/.test(s)) return 'parry';
  if (/^SMASH/.test(s)) return 'smash';
  if (/^[×X]\d+$/.test(s)) return 'combo';
  if (/^\+\s*\d+\s*(G|GOLD|COINS?)$/.test(s)) return 'gold';
  if (/^-\d+%$/.test(s)) return 'ore';
  if (/TOO TOUGH/.test(s)) return 'tough';
  if (/WEAK SPOT/.test(s)) return 'weak';
  if (s === '!' || s === '?' || s === '!?') return 'alert';
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'damage';
  if (/^(PERFECT|BULLSEYE)/.test(s)) return 'perfect';
  if (/^(MISS|MISSED|OOPS)/.test(s)) return 'miss';
  if (hex === null) return 'info';
  return toneOf(hex);
}

const parseHex = (c) => {
  if (c === null || c === undefined) return null;
  if (typeof c === 'number') return c;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(c).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return parseInt(h, 16);
};

// ------------------------------------------------------------------ glyph layout (cached)
const layouts = new Map();
function hash(i, k) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }

/**
 * The voxels of a phrase: outline plate first (drawn under), then the ink. Local units are font
 * pixels, centred. Per voxel: x y z, depth, kind (0 plate, 1 ink), shade (-1..1 bevel), glow, the
 * line row (for gradients), three randoms (shatter).
 */
function layout(text, wrap = WRAP) {
  const key = wrap + '|' + text;
  let L = layouts.get(key);
  if (L) { layouts.delete(key); layouts.set(key, L); return L; }
  const lines = [];
  let cur = '';
  for (const w of text.split(' ')) {
    if (cur && cur.length + 1 + w.length > wrap) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  lines.push(cur);
  const lw = lines.map(lineWidth);
  const W = Math.max(1, ...lw) + 2, H = lines.length * LINE - 2 + 2; // +1 px border round for the plate
  const ink = new Uint8Array(W * H), row = new Int8Array(W * H).fill(-1);
  lines.forEach((ln, li) => {
    let x = 1 + Math.floor((W - 2 - lw[li]) / 2);
    const y0 = 1 + li * LINE;
    for (const ch of ln) {
      const g = rowsOf(ch);
      for (let y = 0; y < 7; y++) for (let i = 0; i < g[y].length; i++) if (g[y][i] === '#') { ink[(y0 + y) * W + x + i] = 1; row[(y0 + y) * W + x + i] = y; }
      x += g[0].length + 1;
    }
  });
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : ink[y * W + x]);
  const plate = [], inks = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y)) { inks.push([x, y]); continue; }
    let near = 0, side = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, y + dy)) { near++; if (!dx || !dy) side++; }
    if (near) plate.push([x, y, side ? 0 : 1]);
  }
  const n = plate.length + inks.length;
  L = { W, H, n, nPlate: plate.length, lines: lines.length, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), d: new Float32Array(n), shade: new Float32Array(n), glow: new Float32Array(n), r: new Float32Array(n * 3), col: new Float32Array(n) };
  let i = 0;
  const put = (x, y, z, d, shade, glow) => {
    L.x[i] = x + 0.5 - W / 2; L.y[i] = H / 2 - (y + 0.5); L.z[i] = z; L.d[i] = d; L.shade[i] = shade; L.glow[i] = glow; L.col[i] = x;
    L.r[i * 3] = hash(i, 1); L.r[i * 3 + 1] = hash(i, 2); L.r[i * 3 + 2] = hash(i, 3);
    i++;
  };
  // the plate: a slab behind the ink, its corner-only pixels a shade darker (a rounder silhouette)
  for (const [x, y, corner] of plate) put(x, y, -0.45, 0.9, corner ? -1 : -0.6, 0);
  // the ink: a pixel-art bevel (light on the top / left edges, shade on the bottom / right) and a
  // top-to-bottom gradient through each line
  for (const [x, y] of inks) {
    let s = 0;
    if (!at(x, y - 1)) s += 0.42;
    if (!at(x - 1, y)) s += 0.16;
    if (!at(x, y + 1)) s -= 0.34;
    if (!at(x + 1, y)) s -= 0.14;
    const r = row[y * W + x];
    s += (3 - r) * 0.045;
    const edge = !at(x, y - 1) || !at(x, y + 1) || !at(x - 1, y) || !at(x + 1, y);
    put(x, y, 0, 1.3, Math.max(-0.9, Math.min(0.9, s)), edge ? 0.7 : 1);
  }
  layouts.set(key, L);
  if (layouts.size > 96) layouts.delete(layouts.keys().next().value);
  return L;
}

// ------------------------------------------------------------------ materials
const BAYER = /* glsl */`
float t3Bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float t3Bayer(vec2 a) { return t3Bayer2(0.5 * a) * 0.25 + t3Bayer2(a); }
`;

function makeMaterials() {
  const U = { uSelf: { value: 0.72 }, uLit: { value: 0.35 } };
  const main = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, transparent: true, depthWrite: true });
  main.onBeforeCompile = (sh) => {
    sh.uniforms.uSelf = U.uSelf; sh.uniforms.uLit = U.uLit;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFx;\nvarying vec2 vFx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFx = aFx;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFx;\nuniform float uSelf;\nuniform float uLit;\n' + BAYER)
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (vFx.x < 0.999 && vFx.x <= t3Bayer(gl_FragCoord.xy)) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * (uSelf + vFx.y);\ndiffuseColor.rgb *= uLit;');
  };
  main.customProgramCacheKey = () => 'text3d-main';
  // the see-through silhouette where scenery stands in front: flat, dithered at half strength
  const ghost = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, depthWrite: false, depthFunc: THREE.GreaterDepth });
  ghost.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFx;\nvarying vec2 vFx;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFx = aFx;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFx;\n' + BAYER)
      .replace('#include <color_fragment>', '#include <color_fragment>\nif (vFx.x * 0.5 <= t3Bayer(gl_FragCoord.xy)) discard;\ndiffuseColor.rgb *= 0.75 + 0.35 * vFx.y;');
  };
  ghost.customProgramCacheKey = () => 'text3d-ghost';
  for (const m of [main, ghost]) m.userData.shared = true;
  return { main, ghost, U };
}

/** A unit cube whose faces are pre-shaded: lit from the top left, the front a touch below the top. */
function makeCube() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const shade = [0.66, 0.9, 1.0, 0.5, 0.86, 0.42]; // +x −x +y −y +z −z (BoxGeometry's face order)
  const c = new Float32Array(24 * 3);
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) c.set([shade[f], shade[f], shade[f]], (f * 4 + v) * 3);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.userData.shared = true;
  return g;
}

// ------------------------------------------------------------------ the pool
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _c2 = new THREE.Color();
const _v = new THREE.Vector3();
const ease = (k) => 1 - (1 - k) * (1 - k);

class Text3D {
  constructor(game) {
    this.game = game;
    const geo = makeCube();
    this.fx = new THREE.InstancedBufferAttribute(new Float32Array(MAX_VOX * 2), 2);
    this.fx.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFx', this.fx);
    const { main, ghost, U } = makeMaterials();
    this.U = U;
    this.mesh = new THREE.InstancedMesh(geo, main, MAX_VOX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_VOX * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.ghost = new THREE.InstancedMesh(geo, ghost, MAX_VOX);
    this.ghost.instanceMatrix = this.mesh.instanceMatrix; // same instances, drawn twice
    this.ghost.instanceColor = this.mesh.instanceColor;
    for (const m of [this.mesh, this.ghost]) { m.frustumCulled = false; m.count = 0; m.matrixAutoUpdate = false; }
    this.ghost.renderOrder = 9990; // the see-through first, against the scenery only…
    this.mesh.renderOrder = 9991; // …then the words themselves over it
    this.mesh.layers.enable(LAYER_OUTLINE); // the post pass rings them with a crisp 1 px line
    this.mesh.name = 'text3d';
    this.group = new THREE.Group();
    this.group.name = 'text3d-pool';
    this.group.add(this.ghost, this.mesh);
    this.group.visible = false;
    this.words = [];
    this.owner = null; // the game Scene whose THREE.Scene draws us
    this.last = 0;
    this.camPos = new THREE.Vector3();
    this.camOk = false;
    this.stats = { words: 0, voxels: 0, ms: 0, msMax: 0, cap: MAX_VOX, frames: 0 };
  }

  /** Make sure the pool hangs in the game's current scene (a scene change clears the words). */
  attach() {
    const sc = this.game.scene;
    const three = sc?.scene;
    if (!three?.isScene) return false;
    if (this.owner === sc && this.group.parent === three) return true;
    this.words.length = 0;
    this.group.removeFromParent();
    three.add(this.group);
    this.owner = sc;
    this.camOk = false;
    if (!three.userData.text3dHook) {
      const prev = three.onBeforeRender;
      three.onBeforeRender = (r, s, cam, rt) => { prev?.call(three, r, s, cam, rt); if (this.group.parent === three) this.frame(cam); };
      three.userData.text3dHook = true;
    }
    const cam = sc.camera;
    if (cam?.isCamera) { cam.updateMatrixWorld(); this.camPos.setFromMatrixPosition(cam.matrixWorld); this.camOk = true; this.cam = cam; }
    return true;
  }

  /** Lift a screen point (page CSS px) into the view: on the ray through it, `dist` in front of the camera. */
  unproject(sx, sy, dist = 1.2) {
    const e = this.game.engine, cam = this.cam || this.game.scene?.camera;
    if (!cam?.isCamera) return null;
    const w = e.width * e.scale || window.innerWidth, h = e.height * e.scale || window.innerHeight;
    _v.set((sx / w) * 2 - 1, -((sy / h) * 2 - 1), 0.5).unproject(cam);
    const o = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    return _v.sub(o).normalize().multiplyScalar(dist).add(o).clone();
  }

  spawn(text, pos, o = {}) {
    const s = clean(text);
    if (!s || !pos || !this.attach()) return null;
    const hex = parseHex(o.color);
    const kind = KINDS[o.kind] ? o.kind : guessKind(s, hex);
    const st = { ...KINDS[kind] };
    // a word known by its text (CRIT!, -5%, +12g…) keeps its own colours; for the rest the caller's
    // colour is the ink, on a plate of the same hue, much darker
    if (hex !== null && (TONES.has(kind) || o.tint)) { st.core = hex; st.edge = darkHex(hex, 0.2); }
    st.size *= o.size ?? 1;
    if (o.life) st.life = o.life;
    if (o.rainbow) st.rainbow = true;
    const L = layout(s, o.wrap ?? WRAP);
    // over the caps: the oldest words go
    while (this.words.length >= MAX_WORDS) this.words.shift();
    // pop out of the surface toward the camera a little
    const p0 = new THREE.Vector3(pos.x, pos.y, pos.z);
    if (this.camOk) {
      _v.copy(this.camPos).sub(p0);
      const d = _v.length();
      if (d > 1e-4) p0.addScaledVector(_v.multiplyScalar(1 / d), Math.min(0.14, d * 0.22));
    }
    // words born on top of each other stack up instead of overlapping
    let stack = 0;
    if (o.stack !== false) for (const w of this.words) if (w.t < 0.45 && w.p0.distanceToSquared(p0) < 0.12) stack = Math.max(stack, w.stack + 1);
    // per voxel colours (linear): the plate in the edge colour, the ink lerped toward a highlight or
    // toward the edge by its bevel shade
    const col = new Float32Array(L.n * 3);
    _c.setHex(st.core); _c2.setHex(st.edge);
    const core = [_c.r, _c.g, _c.b], edge = [_c2.r, _c2.g, _c2.b];
    const hi = core.map((v) => v + (1 - v) * 0.5), lo = core.map((v, j) => v + (edge[j] - v) * 0.42);
    for (let i = 0; i < L.n; i++) {
      const sh = L.shade[i];
      for (let j = 0; j < 3; j++) {
        col[i * 3 + j] = i < L.nPlate ? edge[j] * (sh < -0.8 ? 0.7 : 1) : sh >= 0 ? core[j] + (hi[j] - core[j]) * sh : core[j] + (lo[j] - core[j]) * -sh;
      }
    }
    const rnd = Math.random;
    const w = {
      text: s, kind, st, L, p0, col, t: 0, life: st.life, stack: Math.min(stack, 3),
      vx: (rnd() - 0.5) * 1.4, vy: 1, rz: (rnd() - 0.5) * 2, ry: (rnd() - 0.5) * 2, rx: (rnd() - 0.5),
      drift: (rnd() - 0.5) * 0.3, sizeK: 1, yaw0: (rnd() < 0.5 ? -1 : 1) * (0.1 + rnd() * 0.12),
    };
    this.words.push(w);
    this.group.visible = true;
    return w;
  }

  /** How a word moves at time t: offsets in cap heights (screen right / up), scale, turn, alpha, glow. */
  motion(w, out) {
    const st = w.st, t = w.t, P = st.punch;
    let ox = 0, oy = (st.motion === 'bob' ? 0.4 : 0.9) + w.stack * 1.25, s = 1;
    // pop: from small at the spot, overshooting, then a damped wobble back to size
    const a = 0.09;
    if (st.motion === 'slam') {
      // big and close, slammed down onto the spot, then a ringing settle
      if (t < 0.08) s = 1 + P * 1.6 * (1 - t / 0.08) + 0.0;
      else s = 1 - 0.18 * P * Math.exp(-(t - 0.08) * 8) * Math.cos((t - 0.08) * 24);
      const j = Math.exp(-t * 9) * 0.09 * P;
      ox += Math.sin(t * 93) * j; oy += Math.cos(t * 71) * j;
      oy += 0.45 * ease(Math.min(1, t / 0.9)) + Math.max(0, t - 0.9) * 0.3;
    } else {
      if (t < a) s = 0.22 + (0.78 + P) * ease(t / a);
      else s = 1 + P * Math.exp(-(t - a) * 9) * Math.cos((t - a) * 21);
      switch (st.motion) {
        case 'arc': ox += w.vx * t; oy += 3.1 * t - 2.4 * t * t; break;
        case 'rise': oy += 1.25 * (1 - Math.exp(-t * 2.4)) + 0.22 * t; ox += Math.sin(t * 3 + w.rz) * 0.05; break;
        case 'drop': ox += w.vx * 0.4 * t + Math.sin(t * 38) * 0.07 * Math.exp(-t * 5); oy += 1.7 * t - 2.6 * t * t; break;
        case 'shake': ox += Math.sin(t * 42) * 0.16 * Math.exp(-t * 4.5); oy += 0.55 * (1 - Math.exp(-t * 3.5)) - Math.max(0, t - 0.5) * 0.35; break;
        case 'bob': oy += 0.3 * (1 - Math.exp(-t * 12)) + Math.sin(t * 13) * 0.06 * Math.exp(-t * 2); break;
        default: break;
      }
    }
    // a little tumble that settles, on a standing lean (top tipped back, turned a touch) so the
    // letters' extruded tops and sides catch the light
    const tb = st.tumble;
    out.rz = tb * (w.rz * 0.6 * Math.exp(-t * 3) * Math.cos(t * 7) + w.drift * t);
    out.ry = w.yaw0 + tb * w.ry * 1.2 * Math.exp(-t * 2.6) * Math.sin(t * 8.5);
    out.rx = -0.2 + tb * w.rx * 0.8 * Math.exp(-t * 3) * Math.sin(t * 6);
    // the end: shatter into bits (or dissolve) over the last moments
    const sh = st.end === 'dissolve' ? 0.45 : 0.32;
    const ts = w.life - sh;
    out.k = t > ts ? Math.min(1, (t - ts) / sh) : 0;
    out.tau = Math.max(0, t - ts);
    out.ox = ox; out.oy = oy; out.s = s;
    out.glow = st.glow * GLOW * (1 + 1.2 * Math.exp(-t * 11));
    return out;
  }

  /** Per frame (the scene's onBeforeRender): move every word and write the instances. */
  frame(cam) {
    if (!cam?.isCamera) return;
    const now = performance.now();
    const dtRaw = (now - (this.last || now)) / 1000;
    this.cam = cam;
    this.camPos.setFromMatrixPosition(cam.matrixWorld);
    this.camOk = true;
    // (the same frame drawn again, e.g. the outline pass: the instances are already written)
    if (this.last && dtRaw < 0.002) return;
    this.last = now;
    const dt = this.freeze ? 0 : Math.min(0.05, Math.max(0, dtRaw)) * (this.timeScale ?? 1);
    const words = this.words;
    if (!words.length) {
      if (this.group.visible) { this.group.visible = false; this.mesh.count = this.ghost.count = 0; }
      this.last = 0;
      return;
    }
    const t0 = performance.now();
    const E = cam.matrixWorld.elements;
    // camera axes (right, up, back) and position
    let rx = E[0], ry = E[1], rz = E[2]; let l = Math.hypot(rx, ry, rz) || 1; rx /= l; ry /= l; rz /= l;
    let ux = E[4], uy = E[5], uz = E[6]; l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
    let bx = E[8], by = E[9], bz = E[10]; l = Math.hypot(bx, by, bz) || 1; bx /= l; by /= l; bz /= l;
    const cx = E[12], cy = E[13], cz = E[14];
    const persp = cam.isPerspectiveCamera;
    const tanH = persp ? Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) / (cam.zoom || 1) : 1;
    const aspect = persp ? cam.aspect : 1;
    _q.setFromRotationMatrix(_m.extractRotation(cam.matrixWorld));
    const M = this.mesh.instanceMatrix.array, C = this.mesh.instanceColor.array, F = this.fx.array;
    const mo = this._mo || (this._mo = {});
    let n = 0, live = 0;
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi];
      w.t += dt;
      if (w.t >= w.life) continue;
      words[live++] = w;
      const L = w.L, st = w.st;
      if (n + L.n > MAX_VOX) continue; // (over the cap this frame: it waits its turn)
      this.motion(w, mo);
      // its depth in front of the camera, and the size that reads the same at any distance
      const px = w.p0.x - cx, py = w.p0.y - cy, pz = w.p0.z - cz;
      const d = -(px * bx + py * by + pz * bz);
      if (persp && d < 0.06) continue; // behind the camera
      const vh = persp ? 2 * Math.max(0.25, d) * tanH : 2, vw = vh * aspect;
      // (a tall phone view sizes by its width, not its height)
      let U = st.size * Math.min(vh, vw * 1.25) * Math.min(1, Math.max(0.6, 1.15 - d / 18)) * w.sizeK;
      const maxW = 0.9 * vw;
      const wide = (U / 7) * L.W;
      if (wide > maxW) U *= maxW / wide;
      const vs = (U / 7) * mo.s;
      // keep the whole word inside the view: a word born near the edge slides in
      let sx = (px * rx + py * ry + pz * rz) + mo.ox * U, sy = (px * ux + py * uy + pz * uz) + mo.oy * U;
      if (persp) {
        const hw = Math.max(0, vw / 2 - (U / 7) * L.W * 0.5 * Math.max(1, mo.s) - vw * 0.03), hh = Math.max(0, vh / 2 - (U / 7) * L.H * 0.5 * Math.max(1, mo.s) - vh * 0.04);
        sx = Math.max(-hw, Math.min(hw, sx)); sy = Math.max(-hh, Math.min(hh, sy));
      }
      const fd = d; // (its depth stays; only the sideways / up offsets are clamped)
      const ax = cx + rx * sx + ux * sy - bx * fd, ay = cy + ry * sx + uy * sy - by * fd, az = cz + rz * sx + uz * sy - bz * fd;
      // its turn: facing the camera, tipped by its tumble
      _q2.copy(_q).multiply(_qLocal(mo.rx, mo.ry, mo.rz));
      _m.makeRotationFromQuaternion(_q2);
      const R = _m.elements;
      const c0x = R[0], c0y = R[1], c0z = R[2], c1x = R[4], c1y = R[5], c1z = R[6], c2x = R[8], c2y = R[9], c2z = R[10];
      const k = mo.k, tau = mo.tau, shatter = st.end !== 'dissolve';
      const glow = mo.glow;
      // a glint sweeping across (left to right, slanted), once early and once late
      const sweep = st.shine ? ((w.t - 0.12) % 0.95) / 0.95 * (L.W + 10) - L.W / 2 - 5 : -1e9;
      const rb = st.rainbow ? (w.t * 8) | 0 : 0;
      for (let i = 0; i < L.n; i++) {
        const isInk = i >= L.nPlate;
        let lx = L.x[i], ly = L.y[i];
        const lz = L.z[i];
        let sc = vs, a = 1;
        let wx = 0, wy = 0, wz = 0, spin = 0;
        if (k > 0) {
          const r1 = L.r[i * 3], r2 = L.r[i * 3 + 1], r3 = L.r[i * 3 + 2];
          if (shatter) {
            // bits fly apart from the middle, up and out, then fall; they spin and shrink
            const sp = (isInk ? 2.3 : 1.4) * (0.6 + r3 * 0.8);
            const dx = lx / (L.W * 0.5) + (r1 - 0.5) * 0.9, dy = ly / (L.H * 0.5) * 0.5 + 0.55 + (r2 - 0.5) * 0.7;
            const ox = dx * sp * tau, oy = dy * sp * tau - 3.6 * tau * tau, oz = (r3 - 0.3) * 1.2 * tau;
            wx = (rx * ox + ux * oy + bx * oz) * U; wy = (ry * ox + uy * oy + by * oz) * U; wz = (rz * ox + uz * oy + bz * oz) * U;
            spin = (r1 - 0.5) * 16 * tau;
            // chunky bits that hold their size, then shrink away and thin out at the very end
            sc *= isInk ? (k < 0.55 ? 1.08 : 1.08 * (1 - (k - 0.55) / 0.45)) * (0.75 + r2 * 0.4) : Math.max(0, 1 - k * 2.6);
            a = isInk ? (k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4) : 1 - k * 1.8;
          } else {
            // dissolve: a gentle upward drift, thinning out in the dither
            const oy = tau * (0.6 + r2 * 0.9), ox = (r1 - 0.5) * tau * 0.6;
            wx = (rx * ox + ux * oy) * U; wy = (ry * ox + uy * oy) * U; wz = (rz * ox + uz * oy) * U;
            sc *= 1 - k * k * (0.4 + r3 * 0.4);
            a = 1 - k * (0.7 + r1 * 0.5);
          }
        }
        if (sc <= 0.0005 || a <= 0.01) { sc = 0; a = 0; }
        const sz = sc * L.d[i];
        lx *= vs; ly *= vs;
        const lzz = lz * vs;
        let a0x = c0x * sc, a0y = c0y * sc, a0z = c0z * sc, a1x = c1x * sc, a1y = c1y * sc, a1z = c1z * sc;
        if (spin) {
          const cs = Math.cos(spin), sn = Math.sin(spin);
          const b0x = a0x * cs + a1x * sn, b0y = a0y * cs + a1y * sn, b0z = a0z * cs + a1z * sn;
          a1x = a1x * cs - a0x * sn; a1y = a1y * cs - a0y * sn; a1z = a1z * cs - a0z * sn;
          a0x = b0x; a0y = b0y; a0z = b0z;
        }
        const o = n * 16;
        M[o] = a0x; M[o + 1] = a0y; M[o + 2] = a0z; M[o + 3] = 0;
        M[o + 4] = a1x; M[o + 5] = a1y; M[o + 6] = a1z; M[o + 7] = 0;
        M[o + 8] = c2x * sz; M[o + 9] = c2y * sz; M[o + 10] = c2z * sz; M[o + 11] = 0;
        M[o + 12] = ax + c0x * lx + c1x * ly + c2x * lzz + wx;
        M[o + 13] = ay + c0y * lx + c1y * ly + c2y * lzz + wy;
        M[o + 14] = az + c0z * lx + c1z * ly + c2z * lzz + wz;
        M[o + 15] = 1;
        // colour, alpha and glow
        let r = w.col[i * 3], g = w.col[i * 3 + 1], b = w.col[i * 3 + 2], gl = 0;
        if (isInk) {
          gl = glow * L.glow[i];
          if (rb) {
            const h = RAINBOW_LIN[rb & 3]; // (the whole word steps through the colours together, like the old grade word)
            const lum = 1 + L.shade[i] * 0.35;
            r = h[0] * lum; g = h[1] * lum; b = h[2] * lum;
          }
          if (st.shine) {
            const dd = Math.abs(L.col[i] - L.W / 2 + L.y[i] * 0.55 - sweep);
            if (dd < 1.6) { const kk = 1 - dd / 1.6; r += (1 - r) * kk * 0.75; g += (1 - g) * kk * 0.75; b += (1 - b) * kk * 0.75; gl += kk * 0.9; }
          }
        }
        C[n * 3] = r; C[n * 3 + 1] = g; C[n * 3 + 2] = b;
        F[n * 2] = a; F[n * 2 + 1] = gl;
        n++;
      }
    }
    words.length = live;
    this.mesh.count = this.ghost.count = n;
    const im = this.mesh.instanceMatrix, ic = this.mesh.instanceColor;
    im.clearUpdateRanges(); im.addUpdateRange(0, n * 16); im.needsUpdate = true;
    ic.clearUpdateRanges(); ic.addUpdateRange(0, n * 3); ic.needsUpdate = true;
    this.fx.clearUpdateRanges(); this.fx.addUpdateRange(0, n * 2); this.fx.needsUpdate = true;
    this.group.visible = n > 0 || live > 0;
    const ms = performance.now() - t0;
    const S = this.stats;
    S.words = live; S.voxels = n; S.frames++;
    S.ms = S.ms * 0.9 + ms * 0.1; S.msMax = Math.max(S.msMax, ms);
  }
}

const _ql = new THREE.Quaternion();
function _qLocal(x, y, z) { return _ql.setFromEuler(_e.set(x, y, z, 'XYZ')); }

/** The pool for a game (made on first use). */
export function text3d(game) {
  if (!game) return null;
  if (!game.text3d) game.text3d = new Text3D(game);
  return game.text3d;
}

/**
 * A floating word in the world. (game, text, worldPos, opts?) or the old screen form
 * (game, text, sx, sy, color, size). Returns the word (or null when there's no 3D view).
 */
export function floatText3D(game, text, a, b, c, d) {
  const T = text3d(game);
  if (!T) return null;
  try {
    if (a && typeof a === 'object' && Number.isFinite(a.x) && Number.isFinite(a.z)) {
      const o = b && typeof b === 'object' ? b : { color: b, size: typeof c === 'number' ? c : undefined };
      return T.spawn(text, a, o);
    }
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (!T.attach()) return null;
    const p = T.unproject(a, b, 1.15);
    return p ? T.spawn(text, p, { color: c, size: typeof d === 'number' ? d : 1 }) : null;
  } catch (e) {
    console.warn('text3d', e);
    return null;
  }
}

/** Numbers for tests and the perf check. */
export function text3dStats(game) {
  const T = game?.text3d;
  return T ? { ...T.stats, live: T.words.length } : { words: 0, voxels: 0, ms: 0, msMax: 0, cap: MAX_VOX, live: 0 };
}

export { KINDS as TEXT3D_KINDS, MAX_VOX as TEXT3D_MAX_VOX };
