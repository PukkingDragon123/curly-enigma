// The mole's own face in the stamina gauge's medallion (src/ui/Stamina.js): the hero's real voxel
// head (src/gfx/char/hero.js, the model the cutscenes and the title use) rendered live into one
// tiny offscreen target on the game's own renderer (no extra GL context), read back without a GPU
// stall and inked in the house style (flat tones lifted to plum and cream, hatched deep shade, a
// dark-plum outline broken on the lit side). It only renders when the face actually changes (a
// blink, a sniff, a new expression), at most ~15 times a second and never while the gauge is
// tucked away; the idle breathing, the tummy rumble, the panting and the flinch are whole-pixel
// offsets of the finished picture (bob), so they cost nothing.
//
//   const f = new MoleFace(game)
//   f.setBox(FW, FH, R)            // the picture box in art pixels, R fine pixels per art pixel
//   f.tick(dt, vit, active)        // vit: { s, h, i, out } fractions of the bar (out: the blackout lids)
//   f.react('hit' | 'eat' | 'level')
//   f.pic → { w, h, u: Uint32Array (canvas byte order), a: Uint8Array } | null, f.bob → { x, y } fine px
//   f.mouth → { x, y } fine px in the picture, f.rumble (0..1), f.mood, f.key
//
// Faces: content (blinks, sniffs, whisker twitches, a glance at the bar), hungry (looking down, the
// tongue out, a licked lip, the tummy rumbling), hurt (a linen bandage round the head, a plaster on
// the cheek, winces), tired (droopy lids, a sweat drop sliding, panting), dazed near a blackout
// (lids fluttering, the head lolling, little voxel stars circling); reactions: a flinch when hit, a
// happy chew when eating, a grin on a level up. The helmet he has on is worn: the Miner's Cap with
// its candle, the brass lamp helmet, the lumite helmet or the sunstone crown.
import * as THREE from 'three';
import { Vox, templateVox, dk, lt, h3, glowMaterial } from '../gfx/char/vox.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { buildHead, skullRow } from '../gfx/char/head.js';
import { buildHat } from '../gfx/char/hats.js';

const LOW = 0.25;
const SS = 2; // the 3D render's supersampling, folded down to the fine grid
const K = 0.72; // art pixels per head voxel
const MAX_FPS = 15;
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const q = (v, s) => Math.round(v / s) * s;

// the house palette for the picture: shadows fall to plum, highlights stop at cream
const PLUM = [36, 20, 42], CREAM = [255, 242, 220], INK = [38, 16, 34], DEEP = [24, 12, 30];
/** Read-back values (linear-ish) → the page's tones (a gentle lift, as the portraits do). */
const LIFT = new Uint8ClampedArray(256).map((_, v) => Math.round(255 * Math.min(1, Math.pow(v / 255, 0.88) * 1.04)));

// ------------------------------------------------------------------ extras (voxels in the head's frame)
const LINEN = [0x8a7a6a, 0xc8b898, 0xe8dcc0, 0xf6eedc];
const BLOOD = [0x7a1a1c, 0xa83026];

/**
 * A linen bandage wound slantwise round the head (over the helmet's band when one is on: k), a
 * fat knot with two tails at the near temple, blood soaking through over the near brow.
 */
function bandageGeo(info, hat) {
  const { hx, hy, hz, n, H } = info;
  const k = hat ? 2.5 : 1.2;
  const v = new Vox(-hx - 7, hx + 7, 0, H + 8, -hz - 7, hz + 7);
  const outer = skullRow(hx, hy, hz, n, k + 1.5, k + 1.5);
  const inner = skullRow(hx, hy, hz, n, k - 0.2, k - 0.2);
  const inside = (row, x, y, z) => { const r = row(y + 0.5); if (!r) return false; const [sx, sz, nr, ty, nz] = r; return Math.abs((x + 0.5) / sx) ** nr + Math.abs(ty) ** nr + Math.abs((z + 0.5) / sz) ** nz <= 1; };
  // the band: a slanted slab, lower over the near (-x) temple, rising toward the far side
  const nx = 0.3, ny = 1, nz = -0.1, nl = Math.hypot(nx, ny, nz);
  const d0 = hat ? 17.2 : 16.4, half = 2.1;
  for (let y = 8; y < H + 8; y++) for (let z = -hz - 5; z <= hz + 5; z++) for (let x = -hx - 5; x <= hx + 5; x++) {
    const d = (x * nx + y * ny + z * nz) / nl;
    if (Math.abs(d - d0) > half) continue;
    if (!inside(outer, x, y, z) || inside(inner, x, y, z)) continue;
    // the turns of the wrap: clean slanted seams, each a shadow line then a lit edge; the band's
    // underside in shade
    const turn = ((Math.atan2(x + 0.5, z + 0.5) / TAU * 6 + (d - d0) * 0.13) % 1 + 1) % 1;
    const c = turn < 0.08 ? LINEN[1] : turn < 0.2 || d - d0 > half - 0.7 ? LINEN[3] : LINEN[2];
    v.set(x, y, z, c);
  }
  // the blood: a blot soaking through over the near brow
  v.paint((x, y, z) => {
    if (z < 2) return undefined;
    const e = Math.hypot((x + 4.5) / 2.8, (y - d0 + 0.3) / 1.7, (z - 9) / 4) + (h3(x, y, z, 5) - 0.5) * 0.45;
    return e < 0.7 ? BLOOD[0] : e < 1.1 ? BLOOD[1] : undefined;
  });
  // the knot at the near temple (find the wrap's side there) and its two tails
  let kx = -hx - 2, ky = Math.round(d0 + 1.8), kz = 2;
  for (let x = -hx - 6; x < 0; x++) if (v.has(x, ky, kz)) { kx = x - 1; break; }
  v.ell(kx, ky, kz, 1.8, 1.8, 1.9, (x, y) => (y > ky ? LINEN[3] : LINEN[2]));
  v.set(kx - 1, ky + 1, kz + 1, LINEN[3]);
  for (let t = 0; t < 6; t++) {
    v.set(kx - 1 - (t >> 1), ky - 1 - t, kz - 1, t === 5 ? LINEN[0] : LINEN[2]);
    v.set(kx - 1 - (t >> 2), ky - 1 - t, kz + 1 + (t >> 1), t === 5 ? LINEN[1] : LINEN[3]);
  }
  return v.geometry(false);
}

/** A crossed sticking plaster for the near cheek (flat, drawn on a little card). */
function plasterGeo() {
  const rows = [
    'L.....L.',
    'LL...LLL',
    '.LLDLLL.',
    '..LBDL..',
    '.LLDBLL.',
    'LLL..LLL',
    '.L....L.',
  ];
  const v = templateVox(rows, { L: LINEN[2], D: LINEN[0], B: BLOOD[1] }, 1);
  return v.geometry(false, [v.w / 2, v.h / 2, 0]);
}

/** The tongue, out over the lip (pivot at its root), tip rounded, a darker groove. */
function tongueGeo(len = 4) {
  const rows = ['.TTT.', 'TTGTT', 'TTGTT', 'TTGTT', '.TtT.', '..t..'].slice(0, Math.max(3, len + 1));
  const v = templateVox(rows, { T: 0xe8707e, G: 0xc0505e, t: 0xf49aa4 }, 2);
  return v.geometry(false, [v.w / 2, v.h, 1]);
}

/** A sweat drop (cool, the one cool note on the face). */
function sweatGeo() {
  const v = templateVox(['.B..', 'BWB.', 'BBBb', '.bb.'], { W: 0xf4f6ee, B: 0xa8d4e4, b: 0x6aa0c4 }, 2);
  return v.geometry(false, [v.w / 2, v.h / 2, 1]);
}

/** A lopsided five-point star (the dazed ring), cream with an amber edge. */
function starGeo(k) {
  const a = ['...S...', '..SCS..', 'SSCCCSS', '.SCCCS.', '.SC.CS.', 'S.....S'];
  const b = ['..S....', '..SS...', 'SSSCCSS', '.SCCCS.', '..SCCS.', '.S...S.'];
  const v = templateVox(k ? b : a, { S: 0xf0b048, C: 0xfff4d0 }, 2);
  return v.geometry(false, [v.w / 2, v.h / 2, 1]);
}

/** The pink nose again, a touch bigger, on its own pivot (it covers the head's own as it wiggles). */
function noseGeo(info) {
  const ny = info.noseY, fz = info.snoutFront - 0.6;
  const v = new Vox(-6, 6, Math.floor(ny - 5), Math.ceil(ny + 5), Math.floor(fz - 5), Math.ceil(fz + 5));
  v.ell(0, ny, fz, 3.7, 2.9, 2.5, (x, y, z) => {
    let c = 0xf09aa6;
    if (y >= Math.round(ny + 0.6)) c = lt(c, 0.2);
    if (y <= Math.floor(ny - 1.2)) c = dk(c, 0.14);
    if (y === Math.round(ny + 0.8) && (x === -2 || x === -1) && z >= fz + 1) c = 0xffe0e6;
    if (y === Math.floor(ny - 0.6) && (x === -2 || x === 1) && z >= fz + 1.4) c = dk(0xf09aa6, 0.36);
    return c;
  });
  return v.geometry(false, [0, ny - 1, fz - 2]);
}

/** The candle of the Miner's Cap: a tin cup on a bracket, a stub of tallow with drips (flame separate). */
function candleGeo(at) {
  const [cx, cy, cz] = at;
  const v = new Vox(cx - 5, cx + 5, cy - 3, cy + 9, cz - 4, cz + 6);
  const TIN = [0x5a5462, 0x8a8490, 0xb8b2b4];
  v.box(cx - 2, cy - 2, cz - 2, cx + 1, cy - 1, cz - 1, TIN[0]); // the bracket on the cap
  v.fill(cx - 3, cx + 3, cy - 1, cy, cz - 1, cz + 4, (x, y, z) => Math.hypot(x - cx, (z - cz - 1.5) * 1.1) < 3, (x, y, z) => (y === cy ? (x < cx ? TIN[2] : TIN[1]) : TIN[0]));
  v.fill(cx - 2, cx + 2, cy + 1, cy + 5, cz - 1, cz + 3, (x, y, z) => Math.hypot(x - cx + 0.5, z - cz - 1) < 1.8, (x, y, z) => (x < cx - 0.5 ? 0xfff0cc : x > cx ? 0xd8c498 : 0xf0e0b8));
  v.set(cx + 1, cy + 3, cz + 2, 0xf6e8c4); v.set(cx + 1, cy + 2, cz + 2, 0xf6e8c4); v.set(cx - 2, cy + 2, cz + 1, 0xeedcb0); // drips
  v.set(cx, cy + 6, cz + 1, 0x2a1e1a); // the wick
  return v.geometry(false);
}
/** The candle's flame (unlit, it glows): a teardrop with a hot core. */
function flameGeo(at) {
  const [cx, cy, cz] = at;
  const v = new Vox(cx - 3, cx + 3, cy + 6, cy + 13, cz - 2, cz + 4);
  v.fill(cx - 3, cx + 3, cy + 6, cy + 12, cz, cz + 2, (x, y) => { const t = (y - cy - 6) / 5.5; return Math.abs(x - cx + 0.5) < 1.7 * Math.sin(Math.min(1, t * 1.6 + 0.25) * Math.PI * 0.9) + 0.2; },
    (x, y) => (y < cy + 8 && Math.abs(x - cx + 0.5) < 1 ? 0xfff4c8 : y > cy + 10 ? 0xe8662a : 0xffb040));
  return v.geometry(false);
}

/** The Sunstone Crown: a hammered gold circlet, five uneven points, the stone in front (glows). */
function crownGeo(info) {
  const { hx, hy, hz, n } = info;
  const band = Math.round(info.browY) + 2;
  const v = new Vox(-hx - 4, hx + 4, band - 2, band + 9, -hz - 4, hz + 4);
  const GOLD = [0x7a4a14, 0xb07a22, 0xe0aa38, 0xf8d878];
  v.seRows(0, 0, band, band + 2, hx + 3, hz + 3, skullRow(hx, hy, hz, n, 1.1, 1.1), (x, y, z) => (y === band + 2 ? GOLD[3] : y === band ? GOLD[0] : (x + z) % 4 === 0 ? GOLD[1] : GOLD[2]));
  const pts = [[-0.62, 4], [-0.3, 3], [0.02, 5], [0.36, 3], [0.7, 4]];
  for (const [a, h] of pts) {
    const dx = Math.sin(a), dz = Math.cos(a);
    let x = Math.round(dx * (hx + 0.6)), z = Math.round(dz * (hz + 0.6));
    for (let k = 0; k < 6; k++) if (!v.has(x, band + 1, z)) { x = Math.round(dx * (hx + 0.6 - k * 0.5)); z = Math.round(dz * (hz + 0.6 - k * 0.5)); } else break;
    for (let y = 1; y <= h; y++) {
      const w = y < h - 1 ? 1 : 0;
      for (let i = -w; i <= w; i++) v.set(x + i, band + 2 + y, z, y === h ? GOLD[3] : i < 0 ? GOLD[3] : GOLD[2]);
    }
  }
  return { geo: v.geometry(false), stoneAt: [0, band + 1.5, Math.round(hz + 1.4)] };
}
function sunstoneGeo(at) {
  const v = new Vox(-3, 3, Math.floor(at[1] - 3), Math.ceil(at[1] + 3), at[2] - 1, at[2] + 3);
  v.ell(0, at[1], at[2] + 0.6, 2.3, 2.1, 1.2, (x, y) => (Math.hypot(x + 1, y - at[1] - 0.8) < 1 ? 0xfff6d0 : Math.hypot(x + 0.5, y + 0.5 - at[1]) < 1.6 ? 0xffc040 : 0xe8742a));
  return v.geometry(false);
}

/** Recolour a lamp lens geometry (the hats' lens is warm yellow) into another light. */
function tintLens(geo, map) {
  const g = geo.clone();
  const c = g.getAttribute('color');
  for (let i = 0; i < c.count; i++) {
    const l = (c.getX(i) * 0.3 + c.getY(i) * 0.59 + c.getZ(i) * 0.11);
    const t = l > 0.95 ? map[0] : l > 0.85 ? map[1] : map[2];
    c.setXYZ(i, ((t >> 16) & 255) / 255, ((t >> 8) & 255) / 255, (t & 255) / 255);
  }
  c.needsUpdate = true;
  return g;
}

// ------------------------------------------------------------------ the face
export class MoleFace {
  constructor(game) {
    this.game = game;
    this.rig = null; this.building = null; this.failed = false;
    this.FW = 0; this.FH = 0; this.R = 0;
    this.pic = null; this.bob = { x: 0, y: 0 }; this.mouth = { x: 0, y: 0 };
    this.t = 0; this.since = 1; this.key = ''; this.want = ''; this.pending = false;
    this.mood = 'content'; this.rx = null; this.rumble = 0;
    // timers for the little idle things
    this.blinkT = rnd(1, 3); this.blinkK = -1; this.blinkSlow = false;
    this.sniffT = rnd(2, 5); this.sniffK = -1;
    this.whiskT = rnd(1, 4); this.whiskK = -1;
    this.glanceT = rnd(5, 9); this.glanceK = -1;
    this.lickT = rnd(2, 4); this.lickK = -1;
    this.winceT = rnd(1.5, 3); this.winceK = -1;
    this.rumbleT = rnd(1.5, 3); this.rumbleK = -1;
    this.flutterT = 0; this.flutterEye = 'drowsy';
    this.helmetId = undefined;
  }

  /** The picture box: FW × FH art pixels at R fine pixels each. */
  setBox(FW, FH, R) {
    if (FW === this.FW && FH === this.FH && R === this.R) return;
    this.FW = FW; this.FH = FH; this.R = R;
    this.CW = FW * R; this.CH = FH * R;
    this.px = new Uint8Array(this.CW * SS * this.CH * SS * 4);
    this.small = new Uint8Array(this.CW * this.CH * 4);
    this.flat = null; this.lum = null;
    const u = new Uint32Array(this.CW * this.CH), a = new Uint8Array(this.CW * this.CH);
    this.pic = null;
    this.next = { w: this.CW, h: this.CH, u, a };
    this.rt?.dispose(); this.rt = null;
    this.dropRead();
    this.key = ''; this.firstPic = true;
    if (this.rig) this.frame();
  }

  /** Reactions: 'hit' (a flinch), 'eat' (a happy chew), 'level' (a grin). */
  react(kind) {
    const dur = { hit: 0.6, eat: 1.6, level: 1.9 }[kind];
    if (!dur) return;
    if (this.rx && this.rx.kind === 'level' && kind === 'eat' && this.rx.t < 0.8) return;
    this.rx = { kind, t: 0, dur };
  }

  renderer() { return this.game?.engine?.renderer || null; }

  // ---------------------------------------------------------------- building
  async build() {
    const m = await import('../gfx/char/hero.js');
    const rig = m.makeHeroMole({ height: 1, pack: false, hammer: false, goggles: 'up' });
    rig.play('idle');
    for (let i = 0; i < 4; i++) rig.update(1 / 30);
    // a bust: the arms, legs and tail folded away (their bones scaled to nothing)
    for (const g of [rig.armL, rig.armR, rig.legL, rig.legR, rig.tail]) g?.scale.setScalar(1e-4);
    const info = buildHead(rig.spec, rig.p, false).info;
    this.info = info;
    this.vs = rig.vs;
    const scene = new THREE.Scene();
    scene.add(rig.root);
    // lamplight: a warm key from the top left, a cool plum fill, a warm rim from behind
    scene.add(new THREE.HemisphereLight(0xffeedc, 0x3a2440, 0.85));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.7); key.position.set(-1.3, 1.7, 1.6);
    const fill = new THREE.DirectionalLight(0x9a84b8, 0.4); fill.position.set(2, 0.1, 0.7);
    const rim = new THREE.DirectionalLight(0xffb468, 1.4); rim.position.set(1.4, 1.1, -1.7);
    scene.add(key, fill, rim);
    this.scene = scene;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
    scene.add(this.cam);
    // hold the pose: from here on only the face parts and the neck move (set per picture)
    rig.neck.updateMatrix();
    this.neck0 = rig.neck.rotation.clone();
    const mat = voxelMaterial('toon');
    const part = (geo, glow = false) => { const o = new THREE.Mesh(geo, glow ? glowMaterial() : mat); o.scale.setScalar(rig.vs); rig.neck.add(o); return o; };
    this.part = part;
    // extras on the head
    this.bandages = [part(bandageGeo(info, false)), part(bandageGeo(info, true))];
    this.bandage = this.bandages[0]; this.bandages[1].visible = false; this.bandage.visible = false;
    this.plaster = part(plasterGeo());
    this.plaster.position.set(-10.2 * rig.vs, 6.6 * rig.vs, 9.2 * rig.vs);
    this.plaster.rotation.set(0, -0.62, 0.32);
    this.plaster.visible = false;
    const mi = info.mouth;
    this.tongue = new THREE.Group();
    this.tongue.position.set(0, (mi.y + 0.4) * rig.vs, (mi.z + 0.4) * rig.vs);
    rig.neck.add(this.tongue);
    this.tongueShort = new THREE.Mesh(tongueGeo(2), mat); this.tongueShort.scale.setScalar(rig.vs);
    this.tongueLong = new THREE.Mesh(tongueGeo(4), mat); this.tongueLong.scale.setScalar(rig.vs);
    this.tongue.add(this.tongueShort, this.tongueLong);
    this.tongue.visible = false;
    this.sweat = part(sweatGeo()); this.sweat.visible = false;
    this.stars = new THREE.Group();
    this.stars.position.set(0, (info.H + 3) * rig.vs, 1 * rig.vs);
    this.stars.rotation.x = 0.32;
    rig.neck.add(this.stars);
    this.starMeshes = [0, 1, 0].map((k, i) => { const s = new THREE.Mesh(starGeo(k), mat); s.scale.setScalar(rig.vs * (i === 1 ? 0.9 : 1)); this.stars.add(s); return s; });
    this.stars.visible = false;
    this.nose = part(noseGeo(info));
    this.nose.position.set(0, (info.noseY - 1) * rig.vs, (info.snoutFront - 2.6) * rig.vs);
    this.nose.userData.base = this.nose.position.clone();
    this.helmet = new THREE.Group();
    rig.neck.add(this.helmet);
    this.rig = rig;
    this.setHelmet(this.game?.state?.data?.equip?.helmet || null);
    this.frame();
    return rig;
  }

  /** Put on the helmet the mole wears (an item id, or null). */
  setHelmet(id) {
    this.helmetWant = id;
    if (!this.rig || id === this.helmetId) return;
    this.helmetId = id;
    const rig = this.rig, info = this.info, H = this.helmet;
    for (const c of [...H.children]) { H.remove(c); if (c.userData.own) c.geometry.dispose(); }
    let on = true;
    const add = (geo, glow = false, own = false) => { const o = new THREE.Mesh(geo, glow ? glowMaterial() : voxelMaterial('toon')); o.scale.setScalar(rig.vs); o.userData.own = own; H.add(o); return o; };
    const spec = { ...rig.spec, dirt: 0.5 };
    if (id === 'helmet_basic') {
      // the Miner's Cap: a soft leather cap, a tin bracket and a candle stub on its front
      const hat = buildHat({ ...spec, hat: 'cap', hatColor: 0x7a5434 }, info, false);
      add(hat.geo);
      const band = Math.round(info.browY) + 1;
      let fz = info.hz;
      for (let z = info.hz + 6; z > 0; z--) if (info.skull(0.5, band + 3.5, z + 0.5)) { fz = z + 2; break; }
      const at = [-1, band + 3, fz];
      add(candleGeo(at), false, true);
      add(flameGeo(at), true, true);
    } else if (id === 'helmet_brass' || id === 'helmet_lumite') {
      const steel = id === 'helmet_lumite';
      const hat = buildHat({ ...spec, hat: 'helmet', hatColor: steel ? 0x6e7680 : 0xc0902e }, info, false);
      add(hat.geo);
      if (hat.lens) add(steel ? tintLens(hat.lens, [0xeafff0, 0xb4ffc4, 0x62dc84]) : hat.lens, true, steel);
    } else if (id === 'helmet_sun') {
      const c = crownGeo(info);
      add(c.geo, false, true);
      add(sunstoneGeo(c.stoneAt), true, true);
    } else on = false;
    H.visible = on;
    // the goggles stay up on the forehead unless a helmet sits there
    for (const b of rig.gogUp || []) b.visible = !on;
    for (const b of rig.gogDown || []) b.visible = false;
    this.hasHat = on;
    this.key = '';
  }

  /** Aim the camera: a 3/4 view from the mole's right (he looks along the bar), the chin low in the box. */
  frame() {
    const rig = this.rig;
    if (!rig || !this.FW) return;
    const vs = rig.vs, wpa = vs / K; // world units per art pixel
    const cam = this.cam;
    cam.left = -this.FW / 2 * wpa; cam.right = this.FW / 2 * wpa;
    cam.top = this.FH / 2 * wpa; cam.bottom = -this.FH / 2 * wpa;
    rig.root.updateMatrixWorld(true);
    const head = rig.neck.localToWorld(new THREE.Vector3(0, 10 * vs, 2 * vs));
    const dir = new THREE.Vector3(-0.62, 0.06, 1).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), dir).normalize();
    const up = new THREE.Vector3().crossVectors(dir, right);
    // the head's middle sits FY art pixels down the box (room above for a helmet, the stars)
    const FY = this.FH * 0.61, FX = this.FW * 0.5 + 0.5;
    const target = head.clone().addScaledVector(up, (FY - this.FH / 2) * wpa).addScaledVector(right, (this.FW / 2 - FX) * wpa);
    cam.position.copy(target).addScaledVector(dir, 3);
    cam.lookAt(target);
    cam.near = 0.5; cam.far = 6;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.key = '';
  }

  // ---------------------------------------------------------------- what the face does now
  /** The base mood from the vitals. */
  moodOf(v) {
    if (v.out > 0.02 || v.s < 0.06) return 'dazed';
    if (v.s < LOW) return 'tired';
    if (v.i > 0.08) return 'hurt';
    if (v.h > 0.22) return 'hungry';
    return 'content';
  }

  /** Advance the timers; returns the face to show (eyes, mouth, brows, neck, extras). */
  pose(dt, v) {
    const t = this.t, mood = this.moodOf(v);
    if (mood !== this.mood) { this.mood = mood; this.blinkK = 0; this.blinkT = rnd(1.5, 3); }
    const f = { eyeL: 'open', eyeR: 'open', rest: 'smirk', open: null, brow: [0.7, -0.26, 0.7, -0.26], pitch: 0, yaw: 0, roll: 0, whisk: 0, droop: 0, nose: 0, tongue: 0, lick: 0, sweat: -1, stars: -1, bandage: v.i > 0.035, plaster: v.i > 0.14 };
    let bx = 0, by = 0;
    // the idle breath: a slow whole-pixel bob
    by += Math.sin(t * 2.1) > 0.35 ? -1 : 0;
    let blinkable = true, slow = false, sniffy = 1, glance = true;
    if (mood === 'hungry') {
      f.pitch = 0.24; f.eyeL = f.eyeR = 'half'; f.rest = 'line'; f.tongue = 1; f.brow = [0.7, -0.36, 0.7, -0.36]; f.droop = 0.08; sniffy = 1.8; glance = false;
      this.lickT -= dt;
      if (this.lickT < 0 && this.lickK < 0) { this.lickK = 0; this.lickT = rnd(3, 5.5); }
      if (this.lickK >= 0) { this.lickK += dt; const k = this.lickK / 0.6; f.lick = k < 0.25 ? -1 : k < 0.5 ? 0 : k < 0.75 ? 1 : 0; f.tongue = 2; if (k >= 1) this.lickK = -1; }
      // the tummy rumbles now and then: a wobble, motion lines (Stamina.js draws them)
      this.rumbleT -= dt;
      if (this.rumbleT < 0 && this.rumbleK < 0) { this.rumbleK = 0; this.rumbleT = rnd(3.5, 6.5); }
    }
    if (this.rumbleK >= 0) {
      this.rumbleK += dt;
      const k = this.rumbleK / 0.9;
      this.rumble = k < 1 ? Math.sin(k * Math.PI) : 0;
      bx += Math.round(Math.sin(this.rumbleK * 38) * 1.4 * this.rumble);
      if (k < 0.5) { f.eyeL = 'sad'; f.eyeR = 'sad'; f.rest = 'frown'; f.tongue = 0; f.pitch = 0.3; }
      if (k >= 1) { this.rumbleK = -1; this.rumble = 0; }
    } else this.rumble = 0;
    if (mood === 'hurt') {
      f.eyeL = f.eyeR = 'sad'; f.rest = 'frown'; f.brow = [0.5, -0.34, 0.5, -0.34]; f.pitch = 0.06;
      this.winceT -= dt;
      if (this.winceT < 0 && this.winceK < 0) { this.winceK = 0; this.winceT = rnd(2.2, 4.2); this.winceSide = Math.random() < 0.6 ? -1 : 1; }
      if (this.winceK >= 0) {
        this.winceK += dt;
        const k = this.winceK / 0.7;
        if (k < 1) {
          if (this.winceSide < 0) { f.eyeL = 'squeeze'; f.eyeR = 'half'; f.brow = [-0.9, 0.36, 0.6, -0.3]; } else { f.eyeR = 'squeeze'; f.eyeL = 'half'; f.brow = [0.6, -0.3, -0.9, 0.36]; }
          f.open = k < 0.75 ? 'grimace' : null; f.rest = 'frown'; f.roll = 0.07 * this.winceSide; f.pitch = 0.1;
          blinkable = false;
          if (k < 0.2) bx += this.winceSide;
        } else this.winceK = -1;
      }
    }
    if (mood === 'tired') {
      const lowK = Math.max(0, Math.min(1, (LOW - v.s) / LOW));
      f.eyeL = f.eyeR = 'drowsy'; f.brow = [0.6, -0.44, 0.6, -0.44]; f.pitch = 0.08 + 0.06 * lowK; f.droop = 0.12; slow = true; glance = false; sniffy = 0.4;
      // panting: the mouth open and shut, the tongue out, quicker the emptier
      const rate = 2.6 + 2.4 * lowK;
      const ph = (t * rate) % 1;
      f.open = ph < 0.55 ? 'oh' : null; f.rest = 'line'; f.tongue = ph < 0.55 ? 1 : 0;
      if (ph < 0.55) by += 1;
      // a sweat drop slides down the near temple
      f.sweat = Math.floor((t * 0.8) % 1 * 6);
    }
    if (mood === 'dazed') {
      // lids flutter, the head lolls, stars circle
      this.flutterT -= dt;
      if (this.flutterT < 0) { this.flutterT = rnd(0.06, 0.22); const r = Math.random(); this.flutterEye = r < 0.35 ? 'shut' : r < 0.65 ? 'drowsy' : r < 0.85 ? 'half' : 'squeeze'; }
      f.eyeL = f.eyeR = this.flutterEye;
      if (Math.random() < 0.3) f.eyeR = this.flutterEye === 'shut' ? 'drowsy' : f.eyeL;
      f.rest = 'frown'; f.open = Math.sin(t * 1.3) > 0.3 ? 'oh' : null; f.tongue = f.open ? 1 : 0;
      f.brow = [0.4, -0.2, 0.1, 0.1]; f.roll = q(Math.sin(t * 2.1) * 0.14, 0.035); f.pitch = 0.14 + q(Math.sin(t * 1.3) * 0.06, 0.03); f.droop = 0.16;
      f.stars = Math.floor((t * 0.75) % 1 * 18);
      bx += Math.sin(t * 2.1) > 0.5 ? 1 : Math.sin(t * 2.1) < -0.5 ? -1 : 0;
      blinkable = false; glance = false; sniffy = 0;
    }
    // reactions over the mood
    const rx = this.rx;
    if (rx) {
      rx.t += dt;
      const k = rx.t / rx.dur;
      if (k >= 1) this.rx = null;
      else if (rx.kind === 'hit') {
        f.eyeL = f.eyeR = 'squeeze'; f.open = 'grimace'; f.brow = [-1, 0.36, -1, 0.36]; f.pitch = -0.2 * (1 - k); f.roll = 0.1 * (1 - k); f.tongue = 0; f.stars = -1;
        const s = (1 - k) * (1 - k);
        bx += Math.round(Math.sin(rx.t * 44) * 3 * s); by += k < 0.2 ? -1 : 0;
        blinkable = false;
      } else if (rx.kind === 'eat') {
        // chomp chomp: happy eyes, the mouth working, a bounce with each bite
        const ph = (rx.t * 6.5) % 1;
        f.eyeL = f.eyeR = 'happy'; f.open = ph < 0.45 ? 'talk' : null; f.rest = 'smile'; f.tongue = 0; f.stars = -1; f.sweat = -1;
        f.brow = [0.9, -0.2, 0.9, -0.2]; f.pitch = -0.04; f.roll = q(Math.sin(rx.t * 6.5 * Math.PI) * 0.05, 0.025);
        if (ph < 0.45) by += 1;
        this.chew = ph < 0.45 && !this.wasChew;
        this.wasChew = ph < 0.45;
        blinkable = false;
      } else if (rx.kind === 'level') {
        f.eyeL = f.eyeR = 'happy'; f.open = 'laugh'; f.rest = 'smile'; f.tongue = 0; f.stars = -1; f.sweat = -1;
        f.brow = [1.3, -0.26, 1.3, -0.26]; f.pitch = -0.12; f.roll = 0.06;
        const hop = Math.max(0, Math.sin(rx.t * 9)) * (1 - k);
        by -= Math.round(hop * 3);
        blinkable = false;
      }
    }
    // blinks (slow and heavy when tired), a sniff, a whisker twitch, a glance at the bar
    this.blinkT -= dt;
    if (this.blinkT < 0 && this.blinkK < 0) { this.blinkK = 0; this.blinkSlow = slow; }
    if (this.blinkK >= 0) {
      this.blinkK += dt;
      const bd = this.blinkSlow ? 0.4 : 0.16, k = this.blinkK / bd;
      if (k >= 1) { this.blinkK = -1; this.blinkT = slow ? rnd(1.2, 2.8) : Math.random() < 0.2 ? 0.22 : rnd(2, 4.5); }
      else if (blinkable) {
        const mid = k > 0.28 && k < 0.72;
        for (const s of ['eyeL', 'eyeR']) {
          const e = f[s];
          f[s] = mid ? 'shut' : e === 'open' ? 'half' : e === 'half' || e === 'drowsy' || e === 'sad' ? 'shut' : e;
        }
      }
    }
    this.sniffT -= dt * sniffy;
    if (this.sniffT < 0 && this.sniffK < 0) { this.sniffK = 0; this.sniffT = rnd(2.6, 6); }
    if (this.sniffK >= 0) {
      this.sniffK += dt;
      const k = this.sniffK / 0.5;
      if (k >= 1) this.sniffK = -1;
      else { f.nose = [1, 0, 1, -1, 1, 0][Math.min(5, Math.floor(k * 6))]; f.whisk = f.nose * 0.12; }
    }
    this.whiskT -= dt;
    if (this.whiskT < 0 && this.whiskK < 0) { this.whiskK = 0; this.whiskT = rnd(1.8, 5); }
    if (this.whiskK >= 0) {
      this.whiskK += dt;
      const k = this.whiskK / 0.32;
      if (k >= 1) this.whiskK = -1;
      else f.whisk = [0.16, -0.1, 0.08, 0][Math.min(3, Math.floor(k * 4))];
    }
    if (glance && !this.rx) {
      this.glanceT -= dt;
      if (this.glanceT < 0 && this.glanceK < 0) { this.glanceK = 0; this.glanceT = rnd(6, 11); }
      if (this.glanceK >= 0) {
        this.glanceK += dt;
        if (this.glanceK > 1.6) this.glanceK = -1;
        else { f.yaw = -0.2; f.pitch += 0.05; }
      }
    } else this.glanceK = -1;
    this.bob.x = bx * Math.max(1, Math.round(this.R / 2));
    this.bob.y = by * Math.max(1, Math.round(this.R / 2));
    return f;
  }

  /** Put the face on the rig; returns the picture's key (it re-renders only when this changes). */
  apply(f) {
    const r = this.rig, vs = r.vs;
    for (const g of r.eyes) {
      const want = g.userData.side < 0 ? f.eyeL : f.eyeR, vv = g.userData.variants;
      const show = vv[want] ? want : 'open';
      for (const k in vv) { const on = k === show; if (vv[k].visible !== on) vv[k].visible = on; }
    }
    const rv = r.mouthRest.userData.variants, ov = r.mouth.userData.variants;
    const rest = f.open ? null : (rv[f.rest] ? f.rest : 'smirk');
    for (const k in rv) { const on = k === rest; if (rv[k].visible !== on) rv[k].visible = on; }
    const open = f.open && ov[f.open] ? f.open : 'laugh';
    for (const k in ov) { const on = k === open; if (ov[k].visible !== on) ov[k].visible = on; }
    r.mouth.visible = !!f.open;
    for (const b of r.brows || []) {
      const L = b.userData.side < 0;
      const lift = L ? f.brow[0] : f.brow[2], tilt = L ? f.brow[1] : f.brow[3];
      b.rotation.z = b.userData.side * tilt;
      b.position.y = b.userData.y + lift * 0.8 * vs;
    }
    for (const g of r.whiskers || []) g.rotation.set(0, f.whisk * -g.userData.side, f.whisk * 0.6 + f.droop * g.userData.side);
    r.neck.rotation.set(this.neck0.x + f.pitch, this.neck0.y + f.yaw, this.neck0.z + f.roll);
    const nb = this.nose.userData.base;
    this.nose.position.set(nb.x, nb.y + f.nose * 0.5 * vs, nb.z);
    this.nose.rotation.set(-f.nose * 0.12, 0, f.nose * 0.05);
    this.bandages[0].visible = f.bandage && !this.hasHat;
    this.bandages[1].visible = f.bandage && !!this.hasHat;
    this.plaster.visible = f.plaster;
    this.tongue.visible = f.tongue > 0;
    this.tongueShort.visible = f.tongue === 1;
    this.tongueLong.visible = f.tongue === 2;
    this.tongue.rotation.set(0.35, 0, f.lick * 0.55);
    this.sweat.visible = f.sweat >= 0;
    if (f.sweat >= 0) this.sweat.position.set(-11.2 * vs, (16.5 - f.sweat * 0.9) * vs, (3.5 + f.sweat * 0.35) * vs);
    this.stars.visible = f.stars >= 0;
    if (f.stars >= 0) {
      const a0 = f.stars / 18 * TAU;
      this.starMeshes.forEach((s, i) => {
        const a = a0 + i * TAU / 3 + (i === 1 ? 0.3 : 0);
        s.position.set(Math.sin(a) * 13 * vs, (i === 1 ? 1.2 : 0) * vs, Math.cos(a) * 11 * vs);
        s.rotation.set(-0.32, 0.46, a * 0.5);
      });
    }
    return [f.eyeL, f.eyeR, rest, f.open, f.brow.map((b) => b.toFixed(2)).join(','), f.whisk.toFixed(2), f.droop, q(f.pitch, 0.01).toFixed(2), f.yaw, f.roll.toFixed(3), f.nose, f.tongue, f.lick, f.sweat, f.stars, f.bandage, f.plaster, this.helmetId].join('|');
  }

  // ---------------------------------------------------------------- per frame
  /** active: the gauge is on screen (pictures are only made then). */
  tick(dt, v, active) {
    if (this.failed) return false;
    dt = Math.min(dt, 0.25);
    this.t += dt;
    this.since += dt;
    if (!this.rig) {
      if (active && !this.building && this.renderer()) {
        this.building = this.build().catch((e) => { console.warn('[stamina face]', e); this.failed = true; });
      }
      return false;
    }
    if (this.helmetWant !== undefined && this.helmetWant !== this.helmetId) this.setHelmet(this.helmetWant);
    if (this.pending) { try { this.poll(); } catch (e) { console.warn('[stamina face] read', e); this.fence = null; this.pending = false; this.syncRead = true; } }
    const f = this.pose(dt, v);
    if (!active) return false;
    const key = this.apply(f);
    if (key === this.key || this.pending || (this.since < 1 / MAX_FPS && !this.firstPic)) return false;
    try { this.render(key); } catch (e) { console.warn('[stamina face] render', e); this.pending = false; }
    return true;
  }

  render(key) {
    const R = this.renderer();
    if (!R || !this.FW) return;
    const gl = R.getContext();
    if (gl.isContextLost?.()) return;
    this.key = key;
    this.since = 0;
    const RW = this.CW * SS, RH = this.CH * SS;
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(RW, RH, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, stencilBuffer: false });
      this.rt.texture.colorSpace = THREE.SRGBColorSpace;
    }
    const info = R.info.render, saved = { calls: info.calls, triangles: info.triangles, points: info.points, lines: info.lines };
    const prev = R.getRenderTarget();
    const cc = R.getClearColor(new THREE.Color()), ca = R.getClearAlpha();
    R.setRenderTarget(this.rt);
    R.setClearColor(0x000000, 0);
    R.clear(true, true, false);
    R.render(this.scene, this.cam);
    // the mouth's spot in the picture (crumbs come from there)
    const m = this.rig.neck.localToWorld(new THREE.Vector3(0, (this.info.mouth.y + 1) * this.vs, (this.info.mouth.z + 1) * this.vs)).project(this.cam);
    this.mouth.x = Math.round((m.x * 0.5 + 0.5) * this.CW);
    this.mouth.y = Math.round((0.5 - m.y * 0.5) * this.CH);
    if (this.syncRead === undefined) this.syncRead = softGL(gl);
    const async = !this.firstPic && !this.syncRead && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    let done = false;
    if (async) {
      try { this.readAsync(gl, RW, RH); done = true; } catch (e) { this.syncRead = true; this.pending = false; this.fence = null; }
    }
    if (!done) {
      R.readRenderTargetPixels(this.rt, 0, 0, RW, RH, this.px);
      this.firstPic = false;
      this.ink();
    }
    R.setRenderTarget(prev);
    R.setClearColor(cc, ca);
    Object.assign(info, saved);
  }

  /**
   * readPixels into a fresh pixel-pack buffer behind a fence (a new buffer each time, as three's own
   * async read does: one never written twice); the game loop (poll) copies it out once the GPU is done.
   */
  readAsync(gl, RW, RH) {
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, this.px.byteLength, gl.STREAM_READ);
    gl.readPixels(0, 0, RW, RH, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this.gl = gl;
    this.fence = { sync: gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0), t0: performance.now(), n: 0, pbo, size: this.px.byteLength };
    gl.flush();
    this.pending = true;
  }

  /**
   * Per frame while a read is out: copy the picture out once the fence says the GPU is done. A fence
   * still out after a second or so (a driver that signals very late) gives up on fences for good:
   * pictures are read straight from the target from then on.
   */
  poll() {
    const F = this.fence, gl = this.gl;
    if (!F || !gl) { this.pending = false; return; }
    F.n++;
    let ready = false;
    try { ready = gl.getSyncParameter(F.sync, gl.SYNC_STATUS) === gl.SIGNALED; } catch (e) { ready = false; }
    const late = !ready && F.n >= 12 && performance.now() - F.t0 > 1200;
    if (!ready && !late) return;
    this.fence = null; this.pending = false;
    try { gl.deleteSync(F.sync); } catch (e) { /* gone with the context */ }
    const ok = !late && !gl.isContextLost?.() && F.size === this.px.byteLength;
    if (ok) {
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, F.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.px);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    }
    try { gl.deleteBuffer(F.pbo); } catch (e) { /* gone with the context */ }
    if (ok) this.ink();
    else if (late) {
      this.syncRead = true;
      const R = this.renderer();
      if (R && this.rt) { R.readRenderTargetPixels(this.rt, 0, 0, this.CW * SS, this.CH * SS, this.px); this.ink(); }
    }
  }

  /** Forget a read in flight (its fence and its buffer). */
  dropRead() {
    const F = this.fence, gl = this.gl;
    this.fence = null; this.pending = false;
    if (!F || !gl) return;
    try { gl.deleteSync(F.sync); gl.deleteBuffer(F.pbo); } catch (e) { /* gone with the context */ }
  }

  /**
   * The read-back render → the picture in the house style: folded to the fine grid (each block
   * keeps its commonest colour, so voxel edges stay crisp), tones lifted to plum / capped at cream,
   * the deepest shade hatched, a dark-plum outline that breaks on the lit (top-left) side.
   */
  ink() {
    const W = this.CW, H = this.CH, sm = flatten(fold(this.px, this.small, W, H, SS), this.flat ||= new Uint8Array(W * H * 4), W, H);
    const out = this.next;
    if (!out || out.w !== W || out.h !== H) return;
    const { u, a } = out;
    const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : sm[(y * W + x) * 4 + 3]);
    const P = Math.max(3, Math.round(this.R * 1.4));
    // the shade mask for the hatching, from a softened luminance (so the lines run clean, not in dots)
    const lum = this.lum && this.lum.length === W * H ? this.lum : (this.lum = new Float32Array(W * H));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let t = 0, n = 0;
      for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const xx = x + k, yy = y + j;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const q = (yy * W + xx) * 4;
        if (!sm[q + 3]) continue;
        t += LIFT[sm[q]] * 0.3 + LIFT[sm[q + 1]] * 0.59 + LIFT[sm[q + 2]] * 0.11; n++;
      }
      lum[y * W + x] = n ? t / n / 255 : 1;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, di = i * 4;
      if (sm[di + 3]) {
        let r = LIFT[sm[di]], g = LIFT[sm[di + 1]], b = LIFT[sm[di + 2]];
        const l = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
        // the darks fall to plum (never black), the brightest stop at cream (never white)
        if (l < 0.2) { const k = (0.2 - l) / 0.2 * 0.75; r += (PLUM[0] - r) * k; g += (PLUM[1] - g) * k; b += (PLUM[2] - b) * k; }
        else if (l > 0.9) { r = CREAM[0]; g = CREAM[1]; b = CREAM[2]; }
        // the deepest shade hatched (the lines run up to the right)
        if (lum[i] < 0.2 && l < 0.3 && (x + H - y) % P === 0) { r = (r + DEEP[0]) / 2; g = (g + DEEP[1]) / 2; b = (b + DEEP[2]) / 2; }
        // a warm rim where the silhouette turns away on the right (the lamp behind)
        if (!A(x + 1, y) && l > 0.2) { r += (255 - r) * 0.18; g += (196 - g) * 0.18; b += (120 - b) * 0.18; }
        u[i] = ((255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
        a[i] = 255;
        continue;
      }
      const L = A(x - 1, y), Rr = A(x + 1, y), T = A(x, y - 1), B = A(x, y + 1);
      if (L || Rr || T || B) {
        // the lit side (the shape below or to the right of this pixel): the line breaks in places
        const lit = (Rr || B) && !L && !T;
        if (lit && ((x * 5 + y * 3) % 7) < 3) { u[i] = 0; a[i] = 0; continue; }
        u[i] = ((255 << 24) | (INK[2] << 16) | (INK[1] << 8) | INK[0]) >>> 0;
        a[i] = 200;
        continue;
      }
      u[i] = 0; a[i] = 0;
    }
    this.pic = out;
    this.version = (this.version || 0) + 1;
  }

  dispose() {
    this.rt?.dispose(); this.rt = null;
    this.dropRead();
    if (this.rig) { this.scene.remove(this.rig.root); try { this.rig.dispose(); } catch (e) { /* gone */ } this.rig = null; }
  }
}

/**
 * Flatten the voxel colour noise into flat tones (the house style: 3–5 flat tones per material, no
 * speckle): each pixel takes the mean of its 3×3 neighbours that are close to it in colour (an
 * edge-keeping smooth: eyes, lids, lips and outlines stay put; the fur's mottling settles).
 */
function flatten(src, out, W, H) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const di = (y * W + x) * 4;
    out[di + 3] = src[di + 3];
    if (!src[di + 3]) continue;
    const r0 = src[di], g0 = src[di + 1], b0 = src[di + 2];
    let r = 0, g = 0, b = 0, n = 0;
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const xx = x + k, yy = y + j;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const q = (yy * W + xx) * 4;
      if (!src[q + 3]) continue;
      const d = Math.abs(src[q] - r0) + Math.abs(src[q + 1] - g0) + Math.abs(src[q + 2] - b0);
      if (d > 34) continue;
      r += src[q]; g += src[q + 1]; b += src[q + 2]; n++;
    }
    out[di] = r / n; out[di + 1] = g / n; out[di + 2] = b / n;
  }
  return out;
}

/** Software GL (SwiftShader, llvmpipe): reading back at once costs nothing extra there, and fences signal late. */
function softGL(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return /swiftshader|llvmpipe|software/i.test(name);
  } catch (e) { return false; }
}

/**
 * Fold an ss× render (bottom-up rows) down to the fine grid (top-down): each block keeps its most
 * common colour (near-equal colours count together), ties to the darker; see-through when most of it is.
 */
function fold(px, out, W, H, ss) {
  const RW = W * ss, RH = H * ss, n = ss * ss;
  const r = new Int16Array(n), g = new Int16Array(n), b = new Int16Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let k = 0;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const si = ((RH - 1 - (y * ss + j)) * RW + x * ss + i) * 4;
      if (px[si + 3] > 24) { r[k] = px[si]; g[k] = px[si + 1]; b[k] = px[si + 2]; k++; }
    }
    const di = (y * W + x) * 4;
    if (k * 2 < n || k === 0) { out[di + 3] = 0; continue; }
    let best = 0, bestN = -1;
    for (let p = 0; p < k; p++) {
      let c = 0;
      for (let o = 0; o < k; o++) if (Math.abs(r[p] - r[o]) + Math.abs(g[p] - g[o]) + Math.abs(b[p] - b[o]) < 40) c++;
      if (c > bestN || (c === bestN && r[p] + g[p] + b[p] < r[best] + g[best] + b[best])) { bestN = c; best = p; }
    }
    out[di] = r[best]; out[di + 1] = g[best]; out[di + 2] = b[best]; out[di + 3] = 255;
  }
  return out;
}

