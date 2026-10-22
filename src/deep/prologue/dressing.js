// Old Star's practice dig, dressed: the crate he writes at (papers, ink, a mug) with his lantern on
// it, a bedroll for naps, years of tally marks scratched in the wall, notes pinned up by the table, a
// bucket of ore he picked out, his old ladder (snapped), a barrel of tools, a stool, a little "LIFT"
// sign at the crawl, up on the ledge his map in a brass tube by a candle stub, and an amethyst in
// the geode in the south wall (inside the rock until it is dug open).
// Built from small voxel models (1/32 m) merged into one mesh lit like the rock
// (makeObjectMaterial); the lantern glass and the candle flame glow on their own; the map tube is
// separate so it can be taken.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Vox, mix, dk, lt, h3 } from '../../gfx/char/vox.js';
import { LAYER_OUTLINE } from '../../core/Engine.js';
import { makeObjectMaterial } from '../TerrainMaterial.js';
import { VOX } from '../materials.js';

const S = 1 / 32; // meters per model voxel
const WOOD = 0x7a5232, WOOD_D = 0x553820, WOOD_L = 0x9a6c42, IRON = 0x4a4c52, IRON_L = 0x7a7e86, BRASS = 0xc8a048;
const PAPER = 0xeee2c4, PAPER_D = 0xd8c8a2, INK = 0x3a2a3a;

/** Wall surfaces sit on voxel boundaries: the boundary just past a carved interval's end. */
const snapHi = (b) => Math.ceil(b * VOX - 0.5) / VOX; // carved below b: the wall face
const snapLo = (a) => (Math.floor(a * VOX - 0.5) + 1) / VOX; // carved above a: the wall face

// ---------------------------------------------------------------- models (origin: floor centre)
function table() {
  const v = new Vox(-8, 8, 0, 18, -11, 11);
  // the crate: corner posts, slatted sides
  v.box(-7, 0, -10, 7, 12, 10, (x, y, z) => {
    const post = (x <= -6 || x >= 5) && (z <= -9 || z >= 8);
    if (post) return WOOD_D;
    const inside = x > -7 && x < 6 && z > -10 && z < 9;
    if (inside && x > -6 && x < 5 && z > -9 && z < 8 && y > 0) return -1; // hollow
    if (y % 4 === 3) return -1; // gaps between slats
    return (x + z * 3 + (y >> 2) * 5) % 9 === 0 ? WOOD_L : WOOD;
  });
  // a plank top, overhanging
  v.box(-8, 12, -11, 8, 13, 11, (x, y, z) => (z % 5 === 0 ? WOOD_D : x === -8 || x === 7 ? WOOD_D : (x * 7 + z) % 11 === 0 ? WOOD_L : mix(WOOD, WOOD_L, 0.3)));
  // papers, an open notebook, ink and a quill, a tin mug
  const sheet = (x0, z0, w, d, rot) => {
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
      const xx = rot ? x0 + z : x0 + x, zz = rot ? z0 + x : z0 + z;
      v.set(xx, 13, zz, (z % 2 === 1 && x > 0 && x < w - 1 && z < d - 1) ? (h3(x, z, 3) < 0.7 ? mix(PAPER, INK, 0.45) : PAPER) : (x + z) % 7 === 0 ? PAPER_D : PAPER);
    }
  };
  sheet(-6, -9, 7, 9, false);
  sheet(-1, -6, 6, 8, true);
  sheet(-5, 2, 8, 7, false);
  v.box(1, 13, 4, 4, 16, 7, (x, y) => (y === 15 ? 0x2a2a30 : 0x1a1a22)); // ink pot
  v.line(2.5, 16, 5.5, 5.5, 20, 9, 0xf2eee6, 0.5); // quill
  v.cylY(-4.5, 7.5, 2.2, 13, 18, (x, y) => (y === 17 ? IRON_L : IRON)); // mug
  v.set(-2, 15, 7, IRON_L); v.set(-2, 16, 7, IRON_L); // handle
  return v;
}

function lanternFrame() {
  const v = new Vox(-5, 5, 0, 16, -5, 5);
  v.box(-4, 0, -4, 4, 2, 4, IRON);
  v.box(-4, 10, -4, 4, 12, 4, IRON);
  for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) v.box(x, 2, z, x + 1, 10, z + 1, IRON_L);
  v.box(-2, 12, -2, 2, 13, 2, IRON);
  // the handle ring
  for (let a = 0; a < 12; a++) { const t = (a / 11) * Math.PI; v.set(Math.round(Math.cos(t) * 3), 13 + Math.round(Math.sin(t) * 2.5), 0, IRON_L); }
  return v;
}
function lanternGlass() {
  const v = new Vox(-4, 4, 0, 12, -4, 4);
  v.box(-3, 2, -3, 3, 10, 3, (x, y) => (y > 7 ? 0xffe8a8 : y > 4 ? 0xffc860 : 0xffa838));
  return v;
}

function bedroll() {
  // a long blanket (along x), the pillow sack at the east end, a rolled spare at the foot
  const v = new Vox(-17, 17, 0, 8, -9, 9);
  v.box(-16, 0, -8, 13, 2, 8, (x, y, z) => {
    const plaid = (x + 40) % 6 === 0 || (z + 40) % 6 === 0;
    let c = plaid ? 0x6e2a24 : 0x9a4436;
    if ((x + 40) % 6 === 0 && (z + 40) % 6 === 0) c = 0xc89a60;
    if (y === 1 && h3(x, z, 2) < 0.08) c = dk(c, 0.15);
    return c;
  });
  v.box(-16, 2, -8, -6, 3, 8, (x, z) => mix(0x9a4436, 0xe8d0a0, 0.15)); // the folded-back top
  v.ell(10, 3, 0, 5, 2.6, 6.5, (x, y, z) => (h3(x, y, z, 5) < 0.2 ? 0xc8b48a : 0xd8c49a)); // pillow sack
  for (let z = -6; z <= 6; z += 3) v.set(14, 4, z, 0x8a7458); // its seam
  v.fill(-17, -12, 0, 6, -8, 8, (x, y, z) => (x + 14.5) ** 2 + (y - 2.6) ** 2 < 2.6 * 2.6, (x, y, z) => ((z + 40) % 4 === 0 ? 0x5a6a4a : 0x6e7e5a)); // rolled spare
  v.box(4, 2, 4, 9, 4, 8, (x, y) => (y === 3 ? 0xd8c8a0 : 0x5a2e3a)); // a little book
  return v;
}

/** Years of tally marks: groups of four strokes struck through, scratched into the wall. */
function tally(w, h) {
  const v = new Vox(-1, w + 2, -1, h + 2, 0, 1);
  const scratch = 0xd8aa7c, old = 0xb88a62;
  const GW = 10, GH = 10; // a group: four strokes 7 tall, two apart, and the slash
  for (let row = 0; row * GH + 7 <= h; row++) {
    for (let g = 0; g * GW + 8 <= w; g++) {
      if (h3(g, row, 1, 11) < 0.1) continue; // worn away here and there
      const gx = g * GW + (row & 1) * 3, gy = h - row * GH - 7;
      if (gx + 8 > w) continue;
      const c = row > 1 ? old : scratch; // the oldest rows have faded a little
      const last = row === Math.floor((h - 7) / GH) && (g + 1) * GW + 8 > w;
      const marks = last ? 2 : 5; // the newest group isn't finished
      for (let k = 0; k < Math.min(4, marks); k++) for (let y = 0; y < 7; y++) v.set(gx + k * 2, gy + y, 0, c);
      if (marks === 5) for (let k = 0; k <= 8; k++) v.set(gx - 1 + k, gy + 1 + Math.round(k * 0.6), 0, c);
    }
  }
  // a little star scratched under them
  const sx = Math.round(w / 2), sy = 0;
  for (const [x, y] of [[0, 2], [-1, 1], [1, 1], [0, 1], [0, 0], [-2, 2], [2, 2], [-1, 3], [1, 3], [0, 4]]) v.set(sx + x, sy + y, 0, 0xe8b070);
  return v;
}

/** Notes pinned on the wall by the table (built in x/y, facing +z; turned to face out of the wall). */
function notes() {
  const v = new Vox(0, 44, 0, 28, 0, 1);
  const page = (x0, y0, w, h, kind) => {
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      let c = (x + y) % 9 === 0 ? PAPER_D : PAPER;
      if (kind === 'text' && y % 2 === 0 && y > 0 && y < h - 2 && x > 0 && x < w - 1 && h3(x, y, x0, 7) < 0.75) c = mix(PAPER, INK, 0.5);
      v.set(x0 + x, y0 + y, 0, c);
    }
    if (kind === 'star') { const cx = x0 + (w >> 1), cy = y0 + (h >> 1); for (const [x, y] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 1], [-2, 1], [2, -1], [-2, -1], [1, 2], [-1, 2], [1, -2], [-1, -2]]) v.set(cx + x, cy + y, 0, 0xd85a78); }
    if (kind === 'map') { const pts = [[1, 2], [2, 3], [3, 3], [4, 4], [4, 5], [5, 6], [6, 6], [7, 7]]; for (const [x, y] of pts) v.set(x0 + x, y0 + y, 0, INK); v.set(x0 + 7, y0 + 8, 0, 0xc83a2a); v.set(x0 + 1, y0 + 1, 0, 0x2a5a8a); }
    v.set(x0 + (w >> 1), y0 + h - 1, 0, 0x5a5a62); // the nail
  };
  page(1, 14, 9, 11, 'text');
  page(12, 16, 10, 10, 'map');
  page(24, 13, 8, 12, 'text');
  page(34, 15, 9, 9, 'star');
  page(6, 1, 10, 10, 'text');
  page(20, 2, 9, 9, 'text');
  return v;
}

function orePile() {
  const v = new Vox(-9, 9, 0, 14, -9, 9);
  v.fill(-6, 6, 0, 9, -6, 6, (x, y, z) => Math.hypot(x, z) < 5.6 - y * 0.06 && Math.hypot(x, z) > (y > 0 ? 4.6 - y * 0.06 : -1), (x, y, z) => (y === 2 || y === 7 ? IRON : (Math.round(Math.atan2(z, x) * 3) & 1 ? WOOD : WOOD_D)));
  const lumps = [[0, 9, 0, 2.6, 0xd9773f], [-2, 8, 2, 2, 0xbfc3c4], [2, 8, -2, 2.2, 0x2a2a2e], [1.5, 10, 1.5, 1.8, 0xf2a35e], [-1.5, 9.5, -2, 1.7, 0xd9773f], [6, 1, 5, 1.8, 0x2a2a2e], [-7, 1, 3, 1.5, 0xd9773f], [5, 1, -6, 1.4, 0xbfc3c4]];
  for (const [x, y, z, r, c] of lumps) v.ell(x, y, z, r, r * 0.85, r, (xx, yy, zz) => (h3(xx, yy, zz, 9) < 0.25 ? lt(c, 0.35) : h3(xx, yy, zz, 4) < 0.25 ? dk(c, 0.25) : c));
  return v;
}

function brokenLadder() {
  // lying flat, along z: two rails, rungs, one rail snapped in the middle
  const v = new Vox(-8, 8, 0, 6, -21, 21);
  for (const x of [-6, 5]) {
    for (let z = -20; z <= 20; z++) {
      if (x === 5 && z > 1 && z < 5) continue; // the break
      v.box(x, 0, z, x + 2, 2, z + 1, (xx, y) => (y === 1 ? WOOD_L : WOOD));
    }
  }
  v.set(5, 2, 1, WOOD_L); v.set(6, 2, 5, WOOD_L); v.set(5, 1, 0, 0xc8a070); // splinters
  for (let z = -18; z <= 18; z += 6) { if (z === 6) continue; v.box(-4, 0, z, 5, 1, z + 2, WOOD_D); }
  v.box(-2, 0, 8, 3, 1, 9, WOOD_D); // a loose rung
  return v;
}

function toolBarrel() {
  const v = new Vox(-8, 8, 0, 34, -8, 8);
  v.fill(-8, 8, 0, 18, -8, 8, (x, y, z) => Math.hypot(x, z) < 6.6 + Math.sin((y / 18) * Math.PI) * 0.8, (x, y, z) => (y === 2 || y === 15 ? IRON : (Math.round(Math.atan2(z, x) * 3.4) & 1 ? WOOD : WOOD_D)));
  // a shovel and a pick sticking out
  v.line(-2, 10, 1, -4, 30, 3, WOOD_L, 0.6);
  v.box(-6, 28, 2, -2, 33, 4, IRON_L); // shovel blade
  v.line(2, 10, -1, 4, 27, -2, WOOD, 0.6);
  v.line(-1, 27, -2, 9, 26, -2, IRON, 0.7); // pick head
  return v;
}

function stool() {
  const v = new Vox(-6, 6, 0, 12, -6, 6);
  v.cylY(0, 0, 5, 9, 11, (x, y, z) => ((x + z) % 4 === 0 ? WOOD_L : WOOD));
  for (const a of [0, 2.1, 4.2]) v.line(Math.cos(a) * 3.5, 9, Math.sin(a) * 3.5, Math.cos(a) * 4.5, 0, Math.sin(a) * 4.5, WOOD_D, 0.6);
  return v;
}

const FONT = { L: '100100100100111', I: '111010010010111', F: '111100110100100', T: '111010010010010' };
function liftSign() {
  // a board on a stick: LIFT, and an arrow pointing down the crawl
  const v = new Vox(-10, 10, 0, 30, -2, 2);
  v.box(-1, 0, -1, 1, 20, 1, WOOD_D);
  v.box(-9, 18, -1, 10, 27, 1, (x, y) => (y === 18 || y === 26 ? WOOD_D : (x + y) % 7 === 0 ? WOOD_L : WOOD));
  let cx = -8;
  for (const ch of 'LIFT') {
    const g = FONT[ch];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1') v.set(cx + c, 24 - r, 1, 0xf2e8d0);
    cx += 4;
  }
  return v;
}

function mapTube() {
  const v = new Vox(-5, 5, 0, 10, -8, 8);
  // a little crate to lie on
  v.box(-4, 0, -5, 4, 4, 5, (x, y, z) => (y === 3 ? WOOD_L : (x + z) % 5 === 0 ? WOOD_D : WOOD));
  // the brass tube along z, its caps darker, a pink star on the front cap
  v.fill(-3, 3, 4, 8, -7, 7, (x, y, z) => (x * x + (y - 5.5) * (y - 5.5) < 1.7 * 1.7) && z > -6.5 && z < 6.5, (x, y, z) => (z < -5 || z > 5 ? dk(BRASS, 0.3) : y > 6 ? lt(BRASS, 0.3) : BRASS));
  v.set(0, 5, 6, 0xe8607e); v.set(0, 6, 6, 0xe8607e); v.set(-1, 5, 6, 0xf28aa0);
  return v;
}

/** A little cluster of amethyst points on a crust of geode, as it sits in the hollow. */
function amethyst() {
  const v = new Vox(-6, 6, 0, 12, -6, 6);
  v.ell(0, 0.6, 0, 4.4, 1.4, 4.2, (x, y, z) => (h3(x, y, z, 3) < 0.3 ? 0x6a5a7a : 0x4a3e5a));
  const pts = [[0, 0, 0, 7.5, 0.0], [-2, 0, 1, 5, -0.35], [2, 0, -1, 5.5, 0.35], [1, 0, 2, 4, 0.5], [-1.5, 0, -2, 4.5, -0.45]];
  for (const [x0, , z0, h, lean] of pts) {
    for (let y = 0; y < h; y++) {
      const t = y / h, r = 1.25 * (1 - Math.max(0, t - 0.6) * 2.2);
      const cx = x0 + lean * y * 0.45, cz = z0 + lean * y * 0.25;
      v.fill(cx - 2, cx + 2, y + 1, y + 1, cz - 2, cz + 2, (x, yy, z) => Math.abs(x - cx) + Math.abs(z - cz) * 0.8 <= r + 0.3, (x, yy, z) => (t > 0.75 ? 0xf0d8ff : x < cx ? 0x8a4ac8 : (yy + Math.round(z)) % 3 === 0 ? 0xc898f0 : 0xa060e0));
    }
  }
  return v;
}

function candle() {
  const v = new Vox(-4, 4, 0, 8, -4, 4);
  v.cylY(0, 0, 3.2, 0, 1, IRON_L); // the tin dish
  v.box(-1, 1, -1, 1, 5, 1, (x, y) => (y === 4 ? 0xfff0d0 : 0xf2e4c4));
  v.set(0, 5, 0, 0x2a2420); // wick
  return v;
}
function flame() {
  const v = new Vox(-2, 2, 0, 5, -2, 2);
  v.box(-1, 0, -1, 1, 2, 1, 0xffb040);
  v.set(0, 2, 0, 0xffe090); v.set(-1, 2, -1, 0xffe090); v.set(0, 3, -1, 0xfff4c8);
  return v;
}

// ---------------------------------------------------------------- assembly
export class Dressing {
  /** ctx: the DigScene context; L: the layout (src/deep/gen/prologue.js). */
  constructor(ctx, L) {
    this.c = ctx;
    this.L = L;
    this.group = new THREE.Group();
    this.mat = makeObjectMaterial(ctx.U, {});
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    const o = L.o;
    const parts = [];
    const put = (vox, x, y, z, rotY = 0) => {
      const g = vox.geometry(false);
      g.scale(S, S, S);
      if (rotY) g.rotateY(rotY);
      g.translate(x, y, z);
      parts.push(g);
    };
    const floor = o.y;
    const westWall = snapLo(o.x - 3.1), northWall = snapLo(o.z - 2.6);
    // the table against the west wall, the lantern on it, the stool
    put(table(), westWall + 0.27, floor, L.table.z);
    put(lanternFrame(), L.lantern.x, floor + 13 * S + 0.002, L.lantern.z);
    put(stool(), L.stool.x, floor, L.stool.z);
    // bed under the tally marks
    put(bedroll(), L.bedroll.x, floor, northWall + 0.3);
    // scratched into the wall: a flat decal, no outline
    const t = L.tally, tw = Math.round((t.x1 - t.x0) / S), th = Math.round((t.y1 - t.y0) / S);
    const tg = tally(tw, th).geometry(false);
    tg.scale(S, S, S * 0.25).translate(t.x0, t.y0, northWall + 0.004);
    this.tally = new THREE.Mesh(tg, this.mat);
    this.group.add(this.tally);
    // notes over the table (face +x, out of the west wall)
    const n = notes();
    {
      const g = n.geometry(false);
      g.scale(S, S, S);
      g.rotateY(Math.PI / 2); // +z → +x; local x runs toward -z
      g.translate(westWall + 0.006, L.notes.y0, L.notes.z1);
      parts.push(g);
    }
    put(orePile(), L.pile.x, floor, L.pile.z);
    put(brokenLadder(), L.ladder.x, floor, L.ladder.z);
    put(toolBarrel(), L.tools.x, floor, L.tools.z);
    put(liftSign(), L.o.x - 2.85, floor, L.o.z + 1.95, 2.5); // beside the crawl mouth, out of the way
    put(candle(), L.candle.x, L.ledge.y, L.candle.z);
    this.mesh = new THREE.Mesh(mergeGeometries(parts), this.mat);
    for (const g of parts) g.dispose();
    this.mesh.layers.enable(LAYER_OUTLINE);
    this.group.add(this.mesh);
    // glowing bits
    const glass = lanternGlass().geometry(false);
    glass.scale(S, S, S).translate(L.lantern.x, floor + 13 * S + 0.002, L.lantern.z);
    const fl = flame().geometry(false);
    fl.scale(S, S, S);
    this.glass = new THREE.Mesh(glass, this.glowMat);
    this.flame = new THREE.Mesh(fl, this.glowMat);
    this.flame.position.set(L.candle.x, L.ledge.y + 5 * S, L.candle.z);
    this.group.add(this.glass, this.flame);
    // the map in its tube (taken later)
    const mt = mapTube().geometry(false);
    mt.scale(S, S, S);
    this.map = new THREE.Mesh(mt, this.mat);
    this.map.position.set(L.map.x, L.ledge.y, L.map.z);
    this.map.layers.enable(LAYER_OUTLINE);
    this.group.add(this.map);
    // the amethyst in the geode (hidden in the rock until it's dug open)
    const gm = amethyst().geometry(false);
    gm.scale(S * 0.8, S * 0.8, S * 0.8);
    this.gemMat = makeObjectMaterial(ctx.U, { emissive: 0.5 });
    this.gem = new THREE.Mesh(gm, this.gemMat);
    this.gem.position.set(L.gem.x, L.gem.y - 0.02, L.gem.z);
    this.gem.rotation.y = 0.4;
    this.gem.layers.enable(LAYER_OUTLINE);
    this.group.add(this.gem);
    ctx.scene3.add(this.group);
    this.t = 0;
  }

  /** Where the map tube's middle is (for the crosshair and glints). */
  mapPoint(out = new THREE.Vector3()) { return out.set(this.L.map.x, this.L.ledge.y + 5.5 * S, this.L.map.z); }

  takeMap() { if (this.map) { this.group.remove(this.map); this.map.geometry.dispose(); this.map = null; } }

  /** The amethyst's middle (for the crosshair and its sparkle). */
  gemPoint(out = new THREE.Vector3()) { return out.set(this.L.gem.x, this.L.gem.y + 0.08, this.L.gem.z); }
  takeGem() { if (this.gem) { this.group.remove(this.gem); this.gem.geometry.dispose(); this.gem = null; } }

  update(dt) {
    this.t += dt;
    const f = 1 + Math.sin(this.t * 17) * 0.12 + Math.sin(this.t * 7.3) * 0.08;
    this.flame.scale.set(1, f, 1);
  }

  dispose() {
    this.c.scene3.remove(this.group);
    this.mesh.geometry.dispose();
    this.tally.geometry.dispose();
    this.glass.geometry.dispose();
    this.flame.geometry.dispose();
    this.map?.geometry.dispose();
    this.gem?.geometry.dispose();
    this.gemMat.dispose();
    this.mat.dispose();
    this.glowMat.dispose();
  }
}
