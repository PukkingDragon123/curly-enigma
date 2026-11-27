// The loading screen's little 3D scene (wave 20): the game's own voxel pickaxe (fps/viewmodel/parts.js
// pickGeo, gripped in the mole's gloved fist on the furry forearm, drawn by hand over each frame by ./gripHand.js) swings at a voxel ore clump (deep/clumps:
// buildClump + ClumpMesher, a gold core in a crust of dirt and mudstone) on a rubble ledge against a
// faint plated cave wall. Warm lamplight from the top left, a plum fill from the right, the ore's own
// glow. Each strike: a wind-up, a snap, the hit (a pixel flash) held for two frames, then voxel chips
// arcing off, sparks and a little dust. Crust wedges come off stage by stage (the strike side first),
// so the cleaner the ore the further along the load is; on the last stage the bare ore gleams.
//
// It is not drawn live: oreLoader.js shows a sprite sheet animated by CSS steps() (it must keep
// moving while the page is stuck building a scene), and this bakes that sheet. Each frame is three
// tiny renders at the sheet's own resolution (W × H, shown nearest-neighbour at whole-pixel scale):
// the wall, the clump and the pick + bits, composited in 2D with the house 1px plum outline (softer
// on the lit side), ordered-dither edges, and the hand-drawn flash and glints on top.
//
//   const b = new Bake3D();     throws if WebGL can't be had (the caller falls back to the 2D loader)
//   b.frame(ctx, s, f, x, y)    draws frame f of stage s (0..S-1) at (x, y) of a 2D context
//   b.dispose()                 frees every GPU resource and drops the context
//   G3 = { W, H, F, S, dur, cx, cy, rx, ry }   sheet geometry (cx.. = the clump on screen, art px)
import * as THREE from 'three';
import { pickGeo } from '../fps/viewmodel/parts.js';
import { paintGrip } from './gripHand.js';
import { buildClump, AIR, SOFT, ORE, P_N, P_CRUST, P_ROCK, P_ORE } from '../deep/clumps/grid.js';
import { ClumpMesher } from '../deep/clumps/mesh.js';
import { M } from '../deep/materials.js';
import { ORES } from '../data/ores.js';
import { Vox, h3 } from '../gfx/char/vox.js';
import { PAL as P, OUTLINE, OUTLINE_LIT } from './palette.js';

export const G3 = { W: 224, H: 144, F: 18, S: 8, dur: 1.35, cx: 92, cy: 84, rx: 26, ry: 24 };
const { W, H, F, S } = G3;
const DT = G3.dur / F;
const HIT = 10; // the frame the point lands (10 and 11: the hit-stop)

// the strike, frame by frame: [handle angle (deg, from upright, + leans toward the ore), grip dx, dy
// from where it is at the impact (world units: the clump is about 1 across its radius)]
const POSE = [
  [57, 0.22, 0.16], [51, 0.27, 0.22], // the last of the recoil, at rest a moment
  [40, 0.3, 0.15], [20, 0.38, 0.13], [0, 0.45, 0.09], [-19, 0.5, 0.05], [-34, 0.53, 0.02], [-44, 0.55, 0], // the wind-up, slowing
  [-48, 0.56, -0.01], // held: the anticipation
  [24, 0.3, 0.12], // the snap (one in-between)
  [72, 0, 0], [72, 0, 0], // the hit, held two frames
  [63, 0.06, 0.08], [59, 0.12, 0.12], [60, 0.16, 0.13], [59, 0.19, 0.14], [58, 0.2, 0.15], [57, 0.21, 0.16], // a rebound, settling
];

const VS = 0.0235; // pick / glove voxel (world units)
const WV = 0.15; // wall and floor voxels (coarser: big background pieces)
const FLOOR_Y = -0.9;
const CLUMP_X = -0.55;
const ROT_Y = 0.5; // the clump turned a little to show a broken face
const HIT_DIR = new THREE.Vector3(0.78, 0.5, 0.38).normalize(); // where the point comes in from (world)
const CAM = new THREE.Vector3(0.6, 1.55, 9.6);
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const LINE = rgb(OUTLINE), LINE_LIT = rgb(OUTLINE_LIT); // the house outline (palette.js): ink, plum where the light hits

// hand-drawn bits, in the master palette: w cream, c gold, b flame, a copper, o pale gold
const PAL = { w: rgb(P.cream), c: rgb(P.goldLt), b: rgb(P.flameLt), a: rgb(P.copper), o: rgb(P.goldPale) };
const FLASH = [
  '......a......',
  '......b...a..',
  '..a...c..b...',
  '...b..c.c....',
  '....ccwc.....',
  'abbcwwwwccba.',
  '.....wwwc....',
  '....c.wc.b...',
  '...b..c...a..',
  '..a...b......',
  '......a......',
];
const FLASH2 = [
  '....a....',
  '..a.b.b..',
  '...bcc...',
  '.abcwcba.',
  '...ccb...',
  '..b.b.a..',
  '....a....',
];
const GLINT = ['..o..', '..w..', 'owwwo', '..w..', '.....'];
const GLINT_BIG = ['...o...', '...w...', '..owo..', 'owwwwwo', '..owo..', '...w...', '...o...'];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const lerp = (a, b, t) => a + (b - a) * t;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _o = new THREE.Object3D();
const _c = new THREE.Color();

/** Vertex-coloured lambert; `glow` adds the vertex colour back as light (the ore), plus a screen-space gleam band. */
function lit(glow) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (glow) {
    m.userData.u = { oreK: { value: 0.1 }, gleam: { value: -999 }, gleamK: { value: 0 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, m.userData.u);
      sh.fragmentShader = 'uniform float oreK;\nuniform float gleam;\nuniform float gleamK;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  float gb = abs(gl_FragCoord.x + gl_FragCoord.y * 0.7 - gleam);\n  totalEmissiveRadiance += vColor.rgb * (oreK + (gb < 2.0 ? gleamK : gb < 5.0 ? gleamK * 0.45 : 0.0));');
    };
    m.customProgramCacheKey = () => 'loader-ore';
  }
  return m;
}

export class Bake3D {
  constructor() {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    this.lost = false;
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; }, false);
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power', depth: true, stencil: false });
    if (!r.getContext()) throw new Error('no webgl');
    r.setPixelRatio(1);
    r.setSize(W, H, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);
    this.r = r; this.cv = cv;
    this.work = document.createElement('canvas');
    this.work.width = W; this.work.height = H;
    this.wx = this.work.getContext('2d', { willReadFrequently: true });
    this.geos = []; this.mats = [];
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(31, W / H, 1, 30);
    this.cam.position.set(CAM.x, CAM.y, CAM.z);
    this.camAt = new THREE.Vector3(0.55, 0.72, 0);
    this.cam.lookAt(this.camAt);
    this.stageS = -1;
    this.lights();
    this.cave();
    this.clump();
    this.pick();
    this.bits();
    this.mask = this.edgeMask();
    // where the clump sits on screen (the DOM's flakes pop off it)
    const c0 = this.toPx(this.clumpG.position), c1 = this.toPx(this.clumpG.position.clone().add(_v.set(1, 1, 0)));
    Object.assign(G3, { cx: c0[0], cy: c0[1], rx: Math.abs(c1[0] - c0[0]), ry: Math.abs(c1[1] - c0[1]) });
  }

  geo(g) { this.geos.push(g); return g; }
  mat(m) { this.mats.push(m); return m; }

  lights() {
    const L = (l, x, y, z) => { l.position.set(x, y, z); l.layers.enableAll(); this.scene.add(l); return l; };
    L(new THREE.AmbientLight(0x3a2440, 0.9), 0, 0, 0);
    this.lamp = L(new THREE.PointLight(0xffc27a, 34, 0, 1.2), -3.2, 3.4, 3.2); // the lamp, top left
    L(new THREE.DirectionalLight(0x7a5aa8, 0.85), 4, -0.6, 2.5); // the plum fill
    this.glow = L(new THREE.PointLight(0xffa640, 0, 0, 1.6), CLUMP_X + 0.2, 0.1, 1.3); // the ore's own
    this.flash = L(new THREE.PointLight(0xfff0c0, 0, 0, 2), 0, 0, 0);
  }

  // ------------------------------------------------------------ the niche: a plated wall, a rubble ledge
  cave() {
    const v = new Vox(-26, 27, -10, 24, -15, 9);
    const rng = (i, k) => h3(i, k, 7, 901);
    const plates = []; for (let i = 0; i < 26; i++) plates.push([-26 + rng(i, 1) * 53, -8 + rng(i, 2) * 32, rng(i, 3), rng(i, 4)]);
    const pebs = []; for (let i = 0; i < 46; i++) pebs.push([-26 + rng(i, 5) * 53, -15 + rng(i, 6) * 24, rng(i, 7)]);
    const WALL = [0x1a1016, 0x24161c, 0x2e1e20, 0x3a2824, 0x4a342a];
    const FLOOR = [0x1c1216, 0x2a1c1c, 0x3a2822, 0x4c362a, 0x60463a];
    const near = (pts, x, y, sy = 1) => {
      let k = 0, d1 = 1e9, d2 = 1e9;
      for (let i = 0; i < pts.length; i++) { const dx = x - pts[i][0], dy = (y - pts[i][1]) * sy, d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d; }
      return [k, Math.sqrt(d2) - Math.sqrt(d1)];
    };
    // the wall: plates standing proud by 0-2 voxels, one-voxel cracks between, the top lip of each lit
    for (let y = -10; y < 24; y++) for (let x = -26; x < 27; x++) {
      const [k, gap] = near(plates, x + 0.5, y + 0.5, 1.3);
      const crack = gap < 1.1;
      const deep = crack ? 0 : 1 + Math.round(plates[k][2] * 2);
      const [ku] = near(plates, x + 0.5, y + 1.5, 1.3);
      let t = 1 + Math.round(plates[k][3] * 1.4);
      if (crack) t = 0; else if (ku !== k) t += 1;
      for (let z = -15; z < -15 + deep + 1; z++) v.set(x, y, z, WALL[Math.min(4, t)]);
    }
    // the ledge: pebbles a voxel proud here and there, darker toward the wall, a shadow under the clump
    for (let z = -14; z < 9; z++) for (let x = -26; x < 27; x++) {
      const [k, gap] = near(pebs, x + 0.5, z + 0.5);
      const up = gap > 1 && pebs[k][2] > 0.55 ? 1 : 0;
      let t = gap < 0.8 ? 1 : 2 + (pebs[k][2] > 0.8 ? 1 : 0);
      if (z < -11) t = Math.max(0, t - 1);
      const sx = (x + 0.5) * WV - CLUMP_X, sz = (z + 0.5) * WV;
      const sh = (sx * sx) / 1.3 + (sz * sz) / 0.75;
      if (sh < 1) t = Math.max(0, t - (sh < 0.55 ? 2 : 1));
      for (let y = -10; y <= -7 + up; y++) v.set(x, y, z, FLOOR[y === -7 + up ? t : Math.max(0, t - 1)]);
    }
    const m = new THREE.Mesh(this.geo(v.geometry(false)), this.mat(lit(false)));
    m.scale.setScalar(WV);
    m.layers.set(1);
    this.scene.add(m);
  }

  // ------------------------------------------------------------ the ore clump, in stages
  clump() {
    const oreId = Math.max(1, ORES.findIndex((o) => o && o.item === 'gold_ore'));
    const g = this.g = buildClump({ seed: 23, item: 'gold_ore', oreId, R: 8, crust: M.DIRT, rock: M.MUDSTONE, peb: M.LIMESTONE, coat: 1.25 });
    const n = g.n, N3 = n * n * n, [px, py, pz] = g.pivot;
    // a coat of dirt over any ore the fracture left bare (it starts all crusted: the strike side
    // shows the first glint itself)
    for (let pass = 0; pass < 2; pass++) {
      const K0 = g.kind.slice();
      for (let z = 1; z < n - 1; z++) for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
        const i = x + n * (y + n * z);
        if (K0[i]) continue;
        let near = 0;
        for (const o of [1, -1, n, -n, n * n, -n * n]) if (K0[i + o] === ORE || (pass && K0[i + o] === SOFT && g.col[i + o] === P_CRUST + 3)) near = 1;
        if (!near || (pass && h3(x, y, z, 41) < 0.35)) continue;
        g.kind[i] = SOFT; g.col[i] = P_CRUST + (pass ? 2 : 3) - (h3(x, y, z, 43) < 0.25 ? 1 : 0);
      }
    }
    this.kind0 = g.kind.slice();
    this.pal = new Float32Array(P_N * 3);
    for (let i = 0; i < P_N; i++) { _c.setHex(g.pal[i]); this.pal[i * 3] = _c.r; this.pal[i * 3 + 1] = _c.g; this.pal[i * 3 + 2] = _c.b; }
    // its size: the farthest cell from the middle is 1 world unit
    let r2 = 0, cnt = 0, ymin = 0;
    for (let i = 0; i < N3; i++) {
      if (!this.kind0[i]) continue;
      const x = i % n + 0.5 - px, y = ((i / n) | 0) % n + 0.5 - py, z = ((i / (n * n)) | 0) + 0.5 - pz;
      r2 += x * x + y * y + z * z; cnt++;
      ymin = Math.min(ymin, y - 0.5);
    }
    const cs = this.cs = 0.775 / Math.sqrt(r2 / Math.max(1, cnt)); // (the RMS radius of a ball is 0.775 R)
    const grp = this.clumpG = new THREE.Group();
    grp.position.set(CLUMP_X, FLOOR_Y - ymin * cs - 0.04, 0);
    grp.rotation.y = ROT_Y;
    grp.scale.setScalar(cs);
    this.scene.add(grp);
    grp.updateMatrixWorld();
    this.toGrid = grp.matrixWorld.clone().invert();
    // crust wedges (cells grouped by direction from the middle, so a wedge comes off down to the
    // ore and nothing is left floating); the wedges nearest the strike go first, the dirt of a
    // wedge just before its rock, and one is off from the start: a slit of ore shows at once
    const K = 15, seeds = [];
    for (let k = 0; k < K; k++) {
      const yy = 1 - (k + 0.5) / K * 2, rr = Math.sqrt(1 - yy * yy), a = k * 2.39996 + 0.4;
      seeds.push(new THREE.Vector3(Math.cos(a) * rr, yy, Math.sin(a) * rr));
    }
    const hitG = HIT_DIR.clone().applyMatrix4(new THREE.Matrix4().extractRotation(this.toGrid)).normalize();
    const order = seeds.map((d, k) => [-d.dot(hitG) + h3(k, 1, 2, 77) * 0.5, k]).sort((a, b) => a[0] - b[0]);
    const wt = new Float32Array(K);
    order.forEach(([, k], r) => { wt[k] = r === 0 ? -1 : 0.04 + (r / (K - 1)) * 0.9; });
    const thr = this.thr = new Float32Array(N3);
    for (let i = 0; i < N3; i++) {
      const kd = this.kind0[i];
      if (!kd || kd === ORE) { thr[i] = kd ? 9 : -1; continue; }
      _v.set(i % n + 0.5 - px, ((i / n) | 0) % n + 0.5 - py, ((i / (n * n)) | 0) + 0.5 - pz).normalize();
      let best = -9, bk = 0;
      for (let k = 0; k < K; k++) { const d = seeds[k].dot(_v); if (d > best) { best = d; bk = k; } }
      thr[i] = wt[bk] - (kd === SOFT ? 0.05 : 0);
    }
    this.mesher = new ClumpMesher();
    this.rockMat = this.mat(lit(false));
    this.oreMat = this.mat(lit(true));
    this.rockMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.rockMat);
    this.oreMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.oreMat);
    for (const m of [this.rockMesh, this.oreMesh]) { m.layers.set(2); grp.add(m); }
  }

  /** Mesh the clump as it is at stage s, and find where the point lands. */
  stage(s) {
    if (this.stageS === s) return;
    this.stageS = s;
    const c = s / (S - 1), g = this.g, K = g.kind, K0 = this.kind0, T = this.thr;
    for (let i = 0; i < K.length; i++) K[i] = K0[i] && T[i] > c - 1e-4 ? K0[i] : AIR;
    const [rb, ob] = this.mesher.build(g, this.pal);
    const fill = (mesh, b) => {
      mesh.geometry.dispose();
      const geo = new THREE.BufferGeometry(), cut = (a, k) => (a ? a.slice(0, k) : new Float32Array(0));
      geo.setAttribute('position', new THREE.BufferAttribute(cut(b.pos, b.nv * 3), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(cut(b.nor, b.nv * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(cut(b.col, b.nv * 3), 3));
      geo.setIndex(new THREE.BufferAttribute(b.idx ? b.idx.slice(0, b.ni) : new Uint32Array(0), 1));
      mesh.geometry = geo;
    };
    fill(this.rockMesh, rb);
    fill(this.oreMesh, ob);
    // the surface along the strike line
    // what's left settles onto the ledge (a bare nugget doesn't hang where the crust held it)
    const n = g.n, at = new THREE.Vector3();
    let ymin = 1e9;
    for (let i = 0; i < K.length; i++) if (K[i]) ymin = Math.min(ymin, ((i / n) | 0) % n - g.pivot[1]);
    if (ymin < 1e9) {
      this.clumpG.position.y = FLOOR_Y - ymin * this.cs - 0.04;
      this.clumpG.updateMatrixWorld();
      this.toGrid = this.clumpG.matrixWorld.clone().invert();
    }
    const solid = (p) => {
      at.copy(p).applyMatrix4(this.toGrid);
      const x = Math.floor(at.x + g.pivot[0]), y = Math.floor(at.y + g.pivot[1]), z = Math.floor(at.z + g.pivot[2]);
      return x >= 0 && y >= 0 && z >= 0 && x < n && y < n && z < n && K[x + n * (y + n * z)] !== AIR;
    };
    const ctr = this.clumpG.position.clone(), p = ctr.clone().addScaledVector(HIT_DIR, 2);
    for (let k = 0; k < 200 && !solid(p); k++) p.addScaledVector(HIT_DIR, -0.012);
    this.hp = p.clone();
    // the impact pose: the point just in
    const a = POSE[HIT][0] * Math.PI / 180;
    const tip = this.tipLocal.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), a);
    this.gripHit = p.clone().addScaledVector(HIT_DIR, -0.05).sub(tip);
    // where the hit and the ore show on screen (for the flash and the glints)
    this.hitPx = this.toPx(p);
    this.glints = [];
    if (c >= 0.99) {
      const pos = ob.pos, nor = ob.nor, cand = [];
      for (let i = 0; i < ob.nv; i += 4) if (nor[i * 3 + 2] > 0.5 || nor[i * 3 + 1] > 0.5) cand.push(i);
      const wp = new THREE.Vector3();
      for (const k of [0.31, 0.77]) {
        const i = cand[Math.floor(k * cand.length)];
        if (i == null) continue;
        wp.set(pos[i * 3] + 0.5, pos[i * 3 + 1] + 0.5, pos[i * 3 + 2] + 0.5).applyMatrix4(this.clumpG.matrixWorld);
        this.glints.push(this.toPx(wp));
      }
    }
  }

  toPx(p) {
    this.cam.updateMatrixWorld();
    _v.copy(p).project(this.cam);
    return [Math.round((_v.x * 0.5 + 0.5) * W), Math.round((0.5 - _v.y * 0.5) * H)];
  }

  // ------------------------------------------------------------ the pick in the gloved fist, on the arm
  pick() {
    const root = this.pickRoot = new THREE.Group();
    const base = new THREE.Group();
    base.rotation.set(0.16, Math.PI / 2, 0); // the point toward the ore, the head tipped to show its top
    root.add(base);
    const mat = this.mat(lit(false));
    const part = (geo) => { const m = new THREE.Mesh(this.geo(geo.clone()), mat); m.scale.setScalar(VS); m.layers.set(3); base.add(m); return m; };
    const p = pickGeo('pick_iron');
    part(p.geo);
    if (p.glow) part(p.glow);
    this.scene.add(root);
    // the gloved fist and the forearm are drawn by hand over the frame (./gripHand.js, shared with the
    // 2D loader): at this sheet's 224 × 144 a voxel glove turned to a brown lump that read as no hand
    this.pickBase = base;
    this.tipLocal = new THREE.Vector3(0, 66 * VS, -44 * VS).applyEuler(base.rotation);
  }

  // ------------------------------------------------------------ chips, sparks, dust: tiny voxels
  bits() {
    const box = this.geo(new THREE.BoxGeometry(1, 1, 1));
    const mk = (mat, n) => { const m = new THREE.InstancedMesh(box, this.mat(mat), n); m.layers.set(3); m.frustumCulled = false; m.count = 0; this.scene.add(m); return m; };
    this.chips = mk(new THREE.MeshLambertMaterial(), 16);
    this.sparks = mk(new THREE.MeshBasicMaterial(), 10);
    this.dust = mk(new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55, depthWrite: false }), 8);
  }

  /** The chips, sparks and dust of the strike in frame f (stage clean c). */
  pose(c, f, s) {
    const t = f - HIT - 1; // frames since the hit-stop let go
    const hp = this.hp, out = new THREE.Vector3(0.62, 0.62, 0.48).normalize();
    // chips: nuggets of crust and rock (and of ore, the cleaner it gets) arcing off and bouncing
    let n = 0;
    if (t >= 1) {
      const T = t * DT;
      for (let k = 0; k < 13; k++) {
        const h = (j) => h3(k, j, s, 311);
        const sp = 2.4 + h(1) * 2.8, ax = (h(2) - 0.35) * 1.5, ay = h(3) * 1.1, az = (h(4) - 0.4) * 1.2;
        const vx = (out.x + ax) * sp, vy = (out.y + ay) * sp, vz = (out.z + az) * sp, G = 17;
        const sz = (0.045 + h(5) * 0.07) * (k % 5 === 0 ? 1.6 : 1);
        let x = hp.x + vx * T, y = hp.y + vy * T - 0.5 * G * T * T, z = hp.z + vz * T;
        const fy = FLOOR_Y + sz * 0.5;
        let spin = T * (6 + h(6) * 10);
        if (y < fy) { // landed: a hop, then it lies there
          const tl = (vy + Math.sqrt(vy * vy + 2 * G * Math.max(0, hp.y - fy))) / G, rest = T - tl;
          x = hp.x + vx * (tl + rest * 0.25); z = hp.z + vz * (tl + rest * 0.25);
          y = fy + Math.max(0, vy * 0.18 * rest - 0.5 * G * rest * rest);
          spin = tl * (6 + h(6) * 10);
        }
        if (Math.abs(x) > 6 || z > 4) continue;
        const fade = f >= F - 1 ? 0.5 : 1;
        _o.position.set(x, y, z);
        _o.rotation.set(spin, spin * 0.7 + k, spin * 0.4);
        _o.scale.set(sz * (1 + h(7) * 0.6) * fade, sz * fade, sz * (1 + h(8) * 0.5) * fade);
        _o.updateMatrix();
        this.chips.setMatrixAt(n, _o.matrix);
        const pal = this.g.pal, oreChip = h(9) < c * 0.55 + (c >= 0.99 ? 0.4 : 0);
        _c.setHex(oreChip ? pal[P_ORE + 1 + (k % 3)] : k % 3 === 0 ? pal[P_CRUST + 1 + (k % 2)] : pal[P_ROCK + 1 + (k % 3)]);
        this.chips.setColorAt(n, _c);
        n++;
      }
    }
    this.chips.count = n;
    // sparks: quick streaks, cream to ember
    n = 0;
    if (t >= 0 && t <= 3) {
      for (let k = 0; k < 9; k++) {
        const h = (j) => h3(k, j, s, 517);
        const T = (t + 0.6) * DT, sp = 6 + h(1) * 5;
        const d = new THREE.Vector3(out.x + (h(2) - 0.5) * 1.8, out.y + (h(3) - 0.3) * 1.6, out.z + (h(4) - 0.5)).normalize();
        const p = hp.clone().addScaledVector(d, sp * T);
        p.y -= 3 * T * T;
        const len = 0.06 + 0.11 * (1 - t / 4);
        _o.position.copy(p);
        _o.lookAt(p.x + d.x, p.y + d.y, p.z + d.z);
        _o.scale.set(0.032, 0.032, len);
        _o.updateMatrix();
        this.sparks.setMatrixAt(n, _o.matrix);
        _c.setHex([0xfff2d0, 0xffd264, 0xf89634, 0xc0501e][Math.min(3, t + (k & 1))]);
        this.sparks.setColorAt(n, _c);
        n++;
      }
    }
    this.sparks.count = n;
    // a little dust: grey-brown puffs that swell, drift and thin
    n = 0;
    if (t >= 1 && t <= 6) {
      for (let k = 0; k < 7; k++) {
        const h = (j) => h3(k, j, s, 733);
        const T = t * DT;
        const sz = (0.07 + h(1) * 0.06) * (0.7 + t * 0.32) * (t >= 5 ? 0.6 : 1);
        _o.position.set(hp.x + (h(2) - 0.3) * 0.5 + out.x * T * 0.9, hp.y - 0.1 + (h(3) - 0.5) * 0.3 + T * 0.55, hp.z + (h(4) - 0.5) * 0.4 + 0.2);
        _o.rotation.set(h(5) * 3, h(6) * 3, 0);
        _o.scale.setScalar(sz);
        _o.updateMatrix();
        this.dust.setMatrixAt(n, _o.matrix);
        _c.setHex(0x8a7462);
        this.dust.setColorAt(n, _c);
        n++;
      }
    }
    this.dust.count = n;
    for (const m of [this.chips, this.sparks, this.dust]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  /** The ragged hole the scene is seen through: 0 out, 1 in, between: dithered. */
  edgeMask() {
    const m = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - W * 0.5) / (W * 0.5), dy = (y + 0.5 - H * 0.52) / (H * 0.5), a = Math.atan2(dy, dx);
      const wob = Math.sin(a * 3 + 0.7) * 0.035 + Math.sin(a * 7 + 2.1) * 0.02 + (h3(Math.round(a * 11), 0, 0, 5) - 0.5) * 0.03;
      const e = Math.hypot(dx * 1.02, dy) + wob;
      m[y * W + x] = Math.max(0, Math.min(1, (1 - e) / 0.16));
    }
    return m;
  }

  grab(layer) {
    this.cam.layers.set(layer);
    this.r.render(this.scene, this.cam);
    this.wx.clearRect(0, 0, W, H);
    this.wx.drawImage(this.cv, 0, 0);
    return this.wx.getImageData(0, 0, W, H).data;
  }

  /** Draw frame f of stage s into ctx at (ox, oy). */
  frame(ctx, s, f, ox, oy) {
    if (this.lost || !this.r) throw new Error('webgl context lost');
    this.cam.position.copy(CAM);
    this.cam.lookAt(this.camAt);
    this.stage(s);
    const c = s / (S - 1), last = s === S - 1;
    // the pose
    const [ang, gx, gy] = POSE[f];
    const root = this.pickRoot;
    root.position.copy(this.gripHit).add(_v.set(gx, gy, 0));
    root.rotation.set(0, 0, ang * Math.PI / 180);
    root.updateMatrixWorld(true);
    // a jolt through the clump and the view on the hit
    const k = f - HIT;
    const sq = k === 2 ? 0.035 : k === 3 ? -0.015 : 0;
    this.clumpG.scale.set(this.cs * (1 + sq), this.cs * (1 - sq * 1.4), this.cs * (1 + sq));
    const shake = k === 0 ? 0.045 : k === 1 ? -0.03 : 0;
    this.cam.position.set(CAM.x + shake, CAM.y - shake * 0.5, CAM.z);
    this.cam.lookAt(this.camAt.x + shake, this.camAt.y, this.camAt.z);
    // the light: a lamp that breathes, the ore glowing as it comes clean (and flaring when struck)
    this.lamp.intensity = 34 * [1, 0.98, 1.02, 1, 0.97, 1, 1.03, 1, 0.99][f % 9];
    const flare = k === 0 ? 0.3 : k === 1 ? 0.22 : k === 2 ? 0.1 : k === 3 ? 0.04 : 0;
    const u = this.oreMat.userData.u;
    u.oreK.value = 0.08 + c * 0.2 + flare * 0.8 + (last ? 0.06 : 0);
    u.gleam.value = f >= 2 && f <= 8 ? -20 + (f - 2) * ((W + H * 0.7 + 40) / 6) : -999;
    u.gleamK.value = 0.12 + c * c * (last ? 1.1 : 0.55);
    this.glow.intensity = 1.5 + c * 6 + flare * 12 + (last ? 3 : 0);
    this.flash.position.copy(this.hp).addScaledVector(HIT_DIR, 0.5);
    this.flash.intensity = k === 0 ? 16 : k === 1 ? 9 : k === 2 ? 3 : 0;
    this.pose(c, f, s);
    // three renders, composited with outlines
    const bg = this.grab(1);
    const img = ctx.createImageData(W, H), o = img.data, mk = this.mask;
    for (let i = 0, j = 0; i < W * H; i++, j += 4) {
      const e = mk[i];
      if (e <= 0 || (e < 1 && e < BAYER[((i / W | 0) & 3) * 4 + (i % W & 3)])) continue;
      const q = bg[j + 3] >= 128 ? j : j >= 4 && bg[j - 1] >= 128 ? j - 4 : j >= W * 4 && bg[j - W * 4 + 3] >= 128 ? j - W * 4 : -1; // (a pinhole between the wall's quads: its neighbour)
      if (q < 0) continue;
      o[j] = bg[q]; o[j + 1] = bg[q + 1]; o[j + 2] = bg[q + 2]; o[j + 3] = 255;
    }
    this.over(o, this.grab(2));
    this.over(o, this.grab(3));
    // the gloved fist round the handle and the arm in from the bottom-right edge, swinging with it
    const g = this.px(this.pickRoot.position), hd = this.px(this.pickBase.localToWorld(_v.set(0, 0.4, 0)));
    paintGrip((x, y, c) => { const j = (y * W + x) * 4; o[j] = c >> 16; o[j + 1] = (c >> 8) & 255; o[j + 2] = c & 255; o[j + 3] = 255; },
      { gx: g[0], gy: g[1], dx: hd[0] - g[0], dy: hd[1] - g[1], ax: W + 30, ay: H + 46, k: 2.3, w: W, h: H });
    // the flash of the hit, drawn by hand, held for the hit-stop
    if (k === 0) this.stamp(o, FLASH, this.hitPx);
    else if (k === 1) this.stamp(o, FLASH2, this.hitPx);
    // the clean ore gleams: a glint or two, in turn
    if (last && this.glints.length) {
      const g0 = this.glints[0], g1 = this.glints[1] || g0;
      if (f === 3 || f === 5) this.stamp(o, GLINT, g0); else if (f === 4) this.stamp(o, GLINT_BIG, g0);
      if (f === 13 || f === 15) this.stamp(o, GLINT, g1); else if (f === 14) this.stamp(o, GLINT_BIG, g1);
    }
    ctx.putImageData(img, ox, oy);
  }

  /** A world point on the sheet (px). */
  px(p) { const q = _v2.copy(p).project(this.cam); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; }

  /** Lay a pass over the frame: solid pixels (part-alpha ones dithered), then the plum outline round them. */
  over(o, src) {
    const N = W * H, own = this.own || (this.own = new Uint8Array(N)), mk = this.mask;
    own.fill(0);
    for (let i = 0, j = 0; i < N; i++, j += 4) {
      const a = src[j + 3] / 255, e = Math.min(1, mk[i] * 1.6), bay = BAYER[((i / W | 0) & 3) * 4 + (i % W & 3)];
      if (a <= 0.02 || e <= 0 || (e < 1 && e < bay)) continue; // (the arm fades into the dark at the edge like the wall)
      if (a < 0.9 && a < bay * 1.25) continue;
      o[j] = src[j]; o[j + 1] = src[j + 1]; o[j + 2] = src[j + 2]; o[j + 3] = 255;
      if (a >= 0.9) own[i] = 1;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (own[i]) continue;
      const r = x < W - 1 && own[i + 1], d = y < H - 1 && own[i + W], l = x > 0 && own[i - 1], u = y > 0 && own[i - W];
      if (!(r || d || l || u)) continue;
      const j = i * 4;
      if ((l || u) || o[j + 3] === 0) { o[j] = LINE[0]; o[j + 1] = LINE[1]; o[j + 2] = LINE[2]; o[j + 3] = 255; } // the shade side: a full line
      else if ((x + y) & 1 || o[j] + o[j + 1] + o[j + 2] < 150) { o[j] = LINE_LIT[0]; o[j + 1] = LINE_LIT[1]; o[j + 2] = LINE_LIT[2]; } // the lit side: a lighter line, broken
    }
  }

  stamp(o, rows, at) {
    const h = rows.length, w = rows[0].length, x0 = at[0] - (w >> 1), y0 = at[1] - (h >> 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = PAL[rows[y][x]];
      if (!c) continue;
      const X = x0 + x, Y = y0 + y;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const j = (Y * W + X) * 4;
      o[j] = c[0]; o[j + 1] = c[1]; o[j + 2] = c[2]; o[j + 3] = 255;
    }
  }

  dispose() {
    try {
      this.rockMesh?.geometry.dispose();
      this.oreMesh?.geometry.dispose();
      for (const g of this.geos) g.dispose();
      for (const m of this.mats) m.dispose();
      this.r.renderLists?.dispose?.();
      this.r.dispose();
      this.r.forceContextLoss();
    } catch (e) { /* gone already */ }
    this.geos = []; this.mats = []; this.scene = null; this.g = null; this.r = null;
  }
}
