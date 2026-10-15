// The Surface Express ticket booth at 1/32 voxels: a lacquered red kiosk on a stone plinth
// with fluted cream columns, a brass-grilled ticket window with a counter (bell, ticket
// stack), a marquee "TICKETS" board ringed with bulbs, a striped awning, panelled walls
// with a sunburst, a framed beach poster and a departures board on the side, a velvet
// interior with pigeonholes for the fox clerk, a tiled pagoda roof (hip ridges in gold,
// upturned corners) with a clock dormer, and lanterns on the columns.
// Both sides are built (first person walks all round it); the back stands against the rock.
// Local voxel coords: x 0..160 (5 tiles), z 0..96 (3 tiles), y up.
import * as THREE from 'three';
import { VoxelGrid, C, wood, stone, line, sag, M32, G32, group, mulc, mixc, h3, S32 } from './kit.js';
import { reliefBuffers, reliefGeometry } from '../town/relief.js';
import { voxelMaterial } from '../gfx/Voxel.js';
import { LAYER_OUTLINE } from '../core/Engine.js';
import { hash2 } from './surface.js';
import { pixelTexture } from '../gfx/PixelArt.js';
import { ticketSignCanvas, paintingCanvas, textPixels, textWidth } from './pixel.js';

const RED = 0xa82a2a, RED_D = 0x7a1a1a, RED_L = 0xc03a32;
const GOLD = 0xe0b040, GOLD_D = 0xa87a20, GOLD_L = 0xffe08a, CREAM = 0xf0e8d8, PLUM = 0x3a1a2a;
const W = 160, D = 96, TOP = 88;

/** A voxel grid placed at an offset inside the booth, addressed in booth voxel coords. */
class Part {
  constructor(x0, y0, z0, w, h, d) { this.o = [x0, y0, z0]; this.g = new VoxelGrid(w, h, d); }
  set(x, y, z, c) { this.g.set(x - this.o[0], y - this.o[1], z - this.o[2], c); }
  get(x, y, z) { return this.g.get(x - this.o[0], y - this.o[1], z - this.o[2]); }
  clear(x, y, z) { this.g.clear(x - this.o[0], y - this.o[1], z - this.o[2]); }
  box(x, y, z, w, h, d, c) {
    const [ox, oy, oz] = this.o;
    this.g.box(x - ox, y - oy, z - oz, w, h, d, typeof c === 'function' ? (a, b, e) => c(a + ox, b + oy, e + oz) : c);
  }
  line(pts, r, c) {
    const [ox, oy, oz] = this.o;
    line(this.g, pts.map(([x, y, z]) => [x - ox, y - oy, z - oz]), r, typeof c === 'function' ? (a, b, e, t) => c(a + ox, b + oy, e + oz, t) : c);
  }
  /** Vertical cylinder (booth coords), c(x,y,z,angle). */
  cyl(cx, cz, r, y0, y1, c) {
    for (let y = y0; y < y1; y++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      if (dx * dx + dz * dz > r * r) continue;
      this.set(x, y, z, typeof c === 'function' ? c(x, y, z, Math.atan2(dz, dx)) : c);
    }
  }
  mesh(glow = false) { const [ox, oy, oz] = this.o; return (glow ? G32 : M32)(this.g, [-ox, -oy, -oz]); }
}

/** Lacquered boards running along `axis` ('x' boards are vertical planks side by side along x). */
function lacquer(axis = 'x', seed = 1) {
  return (x, y, z) => {
    const a = axis === 'x' ? x : z;
    const b = Math.floor(a / 8);
    if (a % 8 === 0) return RED_D;
    const k = 0.94 + hash2(b, seed, 3) * 0.1 + (((y + b * 5) % 23) === 0 ? -0.06 : 0);
    return mulc(RED, h3(x, y, z, seed) < 0.03 ? k * 0.92 : k);
  };
}

function frameRect(part, x0, y0, x1, y1, z, c) {
  for (let x = x0; x < x1; x++) { part.set(x, y0, z, c); part.set(x, y1 - 1, z, c); }
  for (let y = y0; y < y1; y++) { part.set(x0, y, z, c); part.set(x1 - 1, y, z, c); }
}
function frameRectZ(part, z0, y0, z1, y1, x, c) {
  for (let z = z0; z < z1; z++) { part.set(x, y0, z, c); part.set(x, y1 - 1, z, c); }
  for (let y = y0; y < y1; y++) { part.set(x, y, z0, c); part.set(x, y, z1 - 1, c); }
}

// ---------------------------------------------------------------- pieces
function plinth() {
  const p = new Part(0, 0, 0, W, 6, D + 18);
  const st = stone(0x8a8078, { seed: 41, block: 6, mortar: 0x5a524a });
  // the top is mostly under the walls: plain there, coursed stone only on the faces the camera sees
  p.box(0, 0, 0, W, 6, D, (x, y, z) => (y === 5 && (z >= D - 2 || x >= W - 2 || x < 2) ? (x + z) % 2 ? GOLD : GOLD_D : z === D - 1 || x === W - 1 || x === 0 ? st(x, y, z) : 0x6e665e));
  // two steps up to the ticket window, worn in the middle
  p.box(42, 0, D, 76, 4, 8, (x, y, z) => (y === 3 ? (z === D + 7 ? GOLD_D : mulc(0x9a9088, Math.abs(x - 80) < 16 ? 0.92 : 1)) : st(x, y, z)));
  p.box(36, 0, D + 8, 88, 2, 8, (x, y, z) => (y === 1 ? (z === D + 15 ? 0x6e665e : mulc(0x8a8078, Math.abs(x - 80) < 18 ? 0.9 : 1)) : st(x, y, z)));
  return p.mesh();
}

function frontWall(glow) {
  const p = new Part(-6, 6, 86, W + 12, 90, 26);
  const lac = lacquer('x', 2);
  p.box(0, 6, 88, W, TOP - 6, 8, lac);
  // the ticket window: rounded opening, dark reveal, a gold moulded frame
  const wx0 = 46, wx1 = 114, wy0 = 34, wy1 = 62, rr = 6;
  const inWin = (x, y) => {
    if (x < wx0 || x >= wx1 || y < wy0 || y >= wy1) return false;
    const cx = Math.min(Math.max(x + 0.5, wx0 + rr), wx1 - rr), cy = Math.min(y + 0.5, wy1 - rr);
    return y + 0.5 < wy1 - rr || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= rr;
  };
  for (let y = wy0; y < wy1; y++) for (let x = wx0; x < wx1; x++) if (inWin(x, y)) for (let z = 88; z < 96; z++) p.clear(x, y, z);
  for (let y = wy0 - 4; y < wy1 + 4; y++) for (let x = wx0 - 4; x < wx1 + 4; x++) {
    if (inWin(x, y)) continue;
    let near = false;
    for (let k = 1; k <= 3 && !near; k++) near = inWin(x + k, y) || inWin(x - k, y) || inWin(x, y + k) || inWin(x, y - k) || inWin(x + k, y + k) || inWin(x - k, y - k) || inWin(x + k, y - k) || inWin(x - k, y + k);
    if (!near) continue;
    const edge = inWin(x + 1, y) || inWin(x - 1, y) || inWin(x, y + 1) || inWin(x, y - 1);
    p.set(x, y, 96, edge ? GOLD_D : GOLD);
    if (!edge) p.set(x, y, 97, inWin(x + 2, y - 2) || inWin(x + 3, y - 3) ? GOLD_L : GOLD);
  }
  // brass grille above the ticket slot
  for (let x = wx0 + 3; x < wx1 - 2; x += 6) for (let y = 44; y < wy1; y++) if (inWin(x, y)) p.set(x, y, 92, y % 4 ? C.brass : GOLD_L);
  for (const y of [44, 54]) for (let x = wx0; x < wx1; x++) if (inWin(x, y) && (y !== 44 || x < 70 || x >= 90)) p.set(x, y, 92, C.brass);
  for (let x = 70; x < 90; x++) { const dy = Math.round(Math.sqrt(Math.max(0, 100 - (x + 0.5 - 80) ** 2)) * 0.6); p.set(x, 44 + dy, 92, C.brass); }
  // counter shelf with a gold nosing and corbels; a brass bell and a stack of golden tickets
  p.box(42, 29, 86, 76, 4, 18, (x, y, z) => (z === 103 || x === 42 || x === 117 ? (y === 32 ? GOLD_L : GOLD) : y === 32 ? mulc(0x8a4a2a, 1.06 + (x % 9 === 0 ? -0.1 : 0)) : 0x6a3a22));
  for (const cx of [50, 110]) for (let k = 0; k < 7; k++) p.box(cx, 28 - k, 96, 3, 1, 7 - k, 0x6a3a22);
  for (let y = 33; y < 37; y++) for (let z = 96; z < 103; z++) for (let x = 100; x < 108; x++) {
    const d = Math.hypot(x + 0.5 - 104, (y - 33) * 1.3, z + 0.5 - 99.5);
    if (d < 3.6) p.set(x, y, z, y === 33 ? GOLD_D : (x + y) % 3 ? GOLD : GOLD_L);
  }
  p.set(104, 37, 99, GOLD_L);
  p.box(54, 33, 97, 8, 3, 4, (x, y) => (y === 34 ? 0xc03a32 : GOLD_L));
  p.box(55, 36, 97, 7, 1, 4, GOLD_L);
  // wainscot panels (proud gold-edged frames), a sunburst under the window
  for (const [x0, x1] of [[10, 40], [120, 150]]) { frameRect(p, x0, 10, x1, 27, 96, GOLD_D); p.box(x0 + 2, 12, 96, x1 - x0 - 4, 1, 1, RED_L); }
  frameRect(p, 44, 9, 116, 28, 96, GOLD_D);
  for (let y = 10; y < 27; y++) for (let x = 45; x < 115; x++) {
    const dx = x + 0.5 - 80, dy = y + 0.5 - 9;
    const d = Math.hypot(dx, dy * 1.2);
    const a = Math.atan2(dy, dx);
    if (d < 5) p.set(x, y, 96, GOLD_L);
    else if (d < 17 && Math.floor(a / (Math.PI / 12)) % 2 === 0) p.set(x, y, 96, d < 11 ? GOLD : GOLD_D);
  }
  // upper side panels with a gold lozenge
  for (const [x0, x1, cx] of [[10, 40, 25], [120, 150, 135]]) {
    frameRect(p, x0, 34, x1, 79, 96, GOLD_D);
    for (let y = 46; y < 66; y++) for (let x = cx - 8; x <= cx + 8; x++) {
      const m = Math.abs(x + 0.5 - cx - 0.5) + Math.abs(y + 0.5 - 56) * 0.85;
      if (m < 8) p.set(x, y, 96, m < 3 ? GOLD_L : m > 6.6 ? GOLD_D : GOLD);
    }
  }
  // the marquee board: TICKETS in raised gold letters, ringed with bulbs
  p.box(48, 64, 96, 64, 15, 2, RED_D);
  frameRect(p, 48, 64, 112, 79, 98, GOLD);
  const txt = 'TICKETS', tw = textWidth(txt, 2), tx0 = Math.round(80 - tw / 2);
  for (const [px, py] of textPixels(txt, 2)) { p.set(tx0 + px, 76 - py, 98, GOLD_L); p.set(tx0 + px + 1, 75 - py, 97, 0x4a0e0e); }
  for (let x = 50; x < 111; x += 4) { glow.set(x, 63, 98, 0xfff2c0); glow.set(x, 79, 98, 0xfff2c0); }
  for (let y = 66; y < 78; y += 4) { glow.set(47, y, 98, 0xfff2c0); glow.set(112, y, 98, 0xfff2c0); }
  // a striped, scalloped valance hung flat under the cornice (an awning would hide the clerk)
  for (let x = 2; x < W - 2; x++) {
    const lx = (x - 2) % 8, s = Math.floor((x - 2) / 8) % 2;
    const bottom = 81 - Math.round(2 - Math.abs(lx - 3.5) * 0.55);
    for (let y = bottom; y < 86; y++) p.set(x, y, 96, s ? CREAM : RED_L);
    if (lx === 3 || lx === 4) p.set(x, bottom - 1, 96, GOLD);
  }
  // the cornice: moulding, gold band and dentils under the roof's eave
  p.box(-1, 86, 96, W + 2, 2, 2, RED_D);
  p.box(-3, 88, 96, W + 6, 2, 4, (x, y) => (y === 89 ? GOLD_L : GOLD));
  p.box(-6, 90, 96, W + 12, 6, 6, (x, y, z) => (y === 90 && x % 4 === 0 ? GOLD_D : z === 101 && y === 95 ? GOLD : RED));
  // fluted columns with gold bases and capitals; lanterns on curled brackets
  for (const cx of [5, 155]) {
    const cz = 93;
    p.cyl(cx, cz, 7.2, 6, 12, (x, y) => (y < 8 ? GOLD_D : y === 11 ? GOLD_L : GOLD));
    p.cyl(cx, cz, 5.6, 12, 80, (x, y, z, a) => (Math.floor((a + Math.PI) / (Math.PI / 8)) % 2 ? CREAM : mulc(CREAM, 0.84)));
    p.cyl(cx, cz, 6.6, 80, 84, GOLD);
    p.cyl(cx, cz, 7.8, 84, 88, (x, y) => (y === 87 ? GOLD_L : GOLD));
    // lantern
    const lz = 104;
    p.line([[cx + 0.5, 72, cz + 5], [cx + 0.5, 72, lz + 0.5], [cx + 0.5, 70, lz + 2]], 0.6, C.iron);
    p.line([[cx + 0.5, 66, cz + 5], [cx + 0.5, 70.5, cz + 9]], 0.5, C.iron);
    p.box(cx - 3, 67, lz - 3, 7, 2, 7, C.iron); p.box(cx - 2, 69, lz - 2, 5, 1, 5, C.ironL); p.set(cx, 70, lz, C.ironL);
    for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) p.box(cx + dx, 56, lz + dz, 1, 11, 1, C.iron);
    p.box(cx - 3, 55, lz - 3, 7, 1, 7, C.iron); p.box(cx - 1, 53, lz - 1, 3, 2, 3, C.ironD);
    glow.box(cx - 2, 56, lz - 2, 5, 11, 5, (x, y) => (y > 61 ? C.glowW : C.glowO));
    glow.box(cx - 1, 58, lz - 1, 3, 5, 3, C.glowY);
  }
  return p.mesh();
}

/** A side wall; side = 1 builds the right (+x) one, -1 mirrors it onto the left. */
function sideWall(side = 1) {
  const mx = (x) => (side > 0 ? x : W - 1 - x);
  const raw = new Part(side > 0 ? 152 : -8, 6, -6, 16, 90, 108);
  const p = {
    set: (x, y, z, c) => raw.set(mx(x), y, z, c),
    box: (x, y, z, w, h, d, c) => raw.box(side > 0 ? x : W - x - w, y, z, w, h, d, typeof c === 'function' ? (a, b, e) => c(mx(a), b, e) : c),
  };
  p.box(152, 6, 0, 8, TOP - 6, D, lacquer('z', side > 0 ? 5 : 6));
  for (const [z0, z1] of [[8, 46], [50, 88]]) { frameRectZ(p, z0, 10, z1, 27, 160, GOLD_D); p.box(160, 12, z0 + 2, 1, 1, z1 - z0 - 4, RED_L); }
  frameRectZ(p, 26, 36, 70, 61, 160, GOLD);
  frameRectZ(p, 27, 37, 69, 60, 161, GOLD_L);
  for (let z = 27; z < 69; z++) p.set(161, 36, z, GOLD_D);
  if (side > 0) {
    // departures board: dark slate, gold header, rows of chalk times, a red "delayed" dot
    p.box(160, 30, 74, 1, 36, 16, 0x2a2024);
    frameRectZ(p, 74, 30, 90, 66, 161, GOLD_D);
    p.box(161, 60, 76, 1, 4, 12, GOLD);
    for (let r = 0; r < 8; r++) {
      const y = 56 - r * 3;
      for (let z = 76; z < 88; z++) if (hash2(r, z, 7) < 0.72 && z !== 81) p.set(161, y, z, z < 81 ? 0xe8e0d0 : 0xb8c8d8);
      if (r === 2 || r === 5) p.set(161, y, 87, 0xe03a2a);
    }
  } else {
    // a brass clock-lamp on a bracket and a little timetable
    p.box(160, 30, 76, 1, 24, 12, 0xf0e8d0);
    frameRectZ(p, 76, 30, 88, 54, 161, GOLD_D);
    for (let r = 0; r < 6; r++) for (let z = 78; z < 86; z++) if (hash2(r, z, 9) < 0.7) p.set(161, 50 - r * 3, z, 0x6a4a3a);
  }
  p.box(160, 86, -1, 2, 2, D + 2, RED_D);
  p.box(160, 88, -3, 4, 2, D + 6, (x, y) => (y === 89 ? GOLD_L : GOLD));
  p.box(160, 90, -6, 6, 6, D + 12, (x, y, z) => (y === 90 && z % 4 === 0 ? GOLD_D : x === 165 && y === 95 ? GOLD : RED));
  return raw.mesh();
}

function interior(glow) {
  const parts = [];
  // back wall: plum velvet with pleats, a gold sun, pigeonholes full of tickets, a poster
  const b = new Part(8, 6, 8, 144, 82, 3);
  b.box(8, 6, 8, 144, 82, 2, (x, y) => (x % 4 === 0 ? mulc(PLUM, 0.78) : mulc(PLUM, 1 + (x % 4 === 2 ? 0.08 : 0))));
  for (let y = 46; y < 68; y++) for (let x = 68; x < 92; x++) {
    const d = Math.hypot(x + 0.5 - 80, y + 0.5 - 57), a = Math.atan2(y + 0.5 - 57, x + 0.5 - 80);
    if (d < 5) b.set(x, y, 10, GOLD_L);
    else if (d < 10 && Math.floor((a + Math.PI) / (Math.PI / 8)) % 2 === 0) b.set(x, y, 10, GOLD);
  }
  b.box(20, 36, 10, 40, 36, 1, 0x5a3a22);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    const x = 21 + c * 8, y = 37 + r * 9;
    b.box(x, y, 10, 7, 8, 1, -1);
    for (let yy = y; yy < y + 8; yy++) for (let xx = x; xx < x + 7; xx++) b.clear(xx, yy, 10);
    if (hash2(r, c, 4) < 0.7) b.box(x + 1, y, 9, 5, 2 + Math.floor(hash2(c, r, 5) * 3), 1, hash2(r, c, 6) < 0.5 ? GOLD_L : 0xf0e8d0);
  }
  // a little "1 WAY" poster: sky, sun, sand
  b.box(104, 40, 10, 26, 30, 1, (x, y) => (y < 48 ? 0xe8d080 : y < 52 ? 0x3a8ad0 : 0x6ab8f0));
  for (let y = 56; y < 66; y++) for (let x = 120; x < 128; x++) if (Math.hypot(x + 0.5 - 124, y + 0.5 - 61) < 3.5) b.set(x, y, 10, 0xffe066);
  for (const [px, py] of textPixels('1 WAY', 1)) b.set(106 + px, 46 - py, 10, 0x6a1a1a);
  frameRect(b, 103, 39, 131, 71, 10, GOLD_D);
  parts.push(b.mesh());
  // left wall (its inside face looks +x, through the window): velvet + a calendar
  const l = new Part(8, 6, 10, 3, 82, 78);
  l.box(8, 6, 10, 2, 82, 78, (x, y, z) => (z % 4 === 0 ? mulc(PLUM, 0.78) : PLUM));
  l.box(10, 44, 50, 1, 16, 14, 0xf0e8d0);
  l.box(10, 56, 50, 1, 4, 14, 0xc03a32);
  for (let k = 0; k < 9; k++) l.set(10, 46 + (k % 3) * 3, 52 + Math.floor(k / 3) * 4, k === 4 ? 0xc03a32 : 0x8a7a6a);
  parts.push(l.mesh());
  // floor boards and the clerk's step
  const f = new Part(10, 6, 10, 142, 8, 78);
  f.box(10, 6, 10, 142, 1, 78, (x, y, z) => (z % 6 === 0 ? 0x2e1e14 : mulc(0x4a3020, 0.92 + hash2(Math.floor((x + (Math.floor(z / 6) % 2) * 17) / 30), Math.floor(z / 6), 8) * 0.14)));
  f.box(60, 7, 60, 40, 6, 27, (x, y, z) => (y === 12 ? (z === 86 ? GOLD_D : 0x8a5a32) : z === 86 ? 0x6a4428 : 0x5a3a22));
  parts.push(f.mesh());
  // a hanging lamp lights the clerk
  glow.box(77, 74, 58, 6, 6, 6, (x, y) => (y > 76 ? C.glowW : C.glowO));
  glow.box(76, 80, 57, 8, 1, 8, 0x3a3a44);
  return parts;
}

/**
 * Hip roof as a heightfield (relief mesher, rotated so depth points up), at 1/16: tile courses
 * two columns deep rising one step, scalloped lips, gold hips and ridge, upturned corners.
 */
function roof() {
  const R = 16, k = 32 / R;
  const X0 = -6, X1 = W + 6, Z0 = -6, Z1 = D + 6;
  const U = (X1 - X0) / k, V = (Z1 - Z0) / k;
  const depth = new Float32Array(U * V), color = new Int32Array(U * V);
  for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
    const dx = Math.min(u, U - 1 - u), dz = Math.min(v, V - 1 - v);
    const dist = Math.min(dx, dz);
    const course = dist >> 1, r = dist & 1;
    let h = 1 + course;
    const front = dz <= dx;
    const along = front ? u : v;
    const t = along % 3;
    let c = r === 0 ? (t === 0 ? RED_D : RED_L) : course % 2 ? RED : mulc(RED, 0.93);
    if (Math.abs(dx - dz) < 1) { c = course % 3 === 1 ? GOLD_L : GOLD; h += 1; } // hip ridges
    if (dist >= 26) { c = (u % 4 === 0) ? GOLD_L : GOLD; h = 1 + 13 + (dist >= 27 ? 2 : 1); } // ridge crest
    if (dx < 6 && dz < 6) { // upturned pagoda corners
      const lift = Math.max(0, 6 - (dx + dz)) * 0.6;
      if (lift > 0) { h = Math.max(h, Math.round(1 + lift)); if (lift > 1.6) c = lift > 2.8 ? GOLD_L : GOLD; }
    }
    if (dist === 0 && c !== GOLD && c !== GOLD_L) c = RED_D;
    depth[u + v * U] = h;
    color[u + v * U] = c;
  }
  // ridge-end finials
  for (const fu of [30, 56]) for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
    const d = Math.hypot(u + 0.5 - fu, v + 0.5 - V / 2);
    if (d < 1.7) { depth[u + v * U] = 1 + 13 + 2 + (d < 1 ? 3 : 2); color[u + v * U] = d < 1 ? GOLD_L : GOLD; }
  }
  const Bf = reliefBuffers(U, V);
  for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) Bf.set(u, v, depth[u + v * U], color[u + v * U]);
  const geo = reliefGeometry(Bf.depth, Bf.color, U, V, { scale: 1 / R, sideShade: 0.82, capShade: 0.9 });
  const m = new THREE.Mesh(geo, voxelMaterial('toon'));
  m.layers.enable(LAYER_OUTLINE);
  m.rotation.x = -Math.PI / 2;
  m.position.set(X0 * S32, 96 * S32, Z1 * S32);
  return m;
}

function dormer() {
  const p = new Part(60, 96, 74, 40, 36, 28);
  // walls
  p.box(64, 96, 78, 32, 22, 21, (x, y, z) => (z === 98 ? (x < 66 || x >= 94 ? GOLD_D : CREAM) : x === 95 ? mulc(CREAM, 0.95) : CREAM));
  // little gable roof with gold bargeboards
  for (let k = 0; k < 12; k++) {
    const y = 118 + k, x0 = Math.round(62 + k * 1.5), x1 = Math.round(98 - k * 1.5);
    if (x1 <= x0) break;
    p.box(x0, y, 76, x1 - x0, 1, 25, (x, yy, z) => (z >= 99 ? GOLD : x === x0 || x === x1 - 1 ? RED_D : (x + k) % 6 === 0 ? RED_D : RED));
  }
  // clock face: cream dial, brass rim, hour ticks, hands at ten past ten
  const cx = 80, cy = 107;
  for (let y = cy - 11; y <= cy + 11; y++) for (let x = cx - 11; x <= cx + 11; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d <= 8.6) p.set(x, y, 99, 0xfaf4e4);
    else if (d <= 10.2) { p.set(x, y, 99, C.brass); p.set(x, y, 100, d > 9.4 ? GOLD_D : GOLD_L); }
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    p.set(Math.floor(cx + Math.sin(a) * 7), Math.floor(cy + Math.cos(a) * 7), 100, k % 3 === 0 ? 0x2a1a12 : 0x8a7a6a);
  }
  const hand = (ang, len, col) => { for (let i = 0; i <= len * 2; i++) { const t = i / 2; p.set(Math.floor(cx + Math.sin(ang) * t), Math.floor(cy + Math.cos(ang) * t), 100, col); } };
  hand(-Math.PI / 3, 4.6, 0x2a1a12);
  hand(Math.PI / 3, 6.4, 0x3a2a22);
  p.set(cx, cy, 101, GOLD_L); p.set(cx - 1, cy, 100, GOLD); p.set(cx, cy - 1, 100, GOLD);
  return p.mesh();
}

/** The full booth. Returns { obj, ticket, w, d, lights:[{x,y,z}] } in local units. */
export function ticketBooth32() {
  const glow = new Part(-6, 50, 40, W + 12, 40, 72);
  const grp = group(plinth(), frontWall(glow), sideWall(1), sideWall(-1), ...interior(glow), roof(), dormer());
  grp.add(glow.mesh(true));
  // the beach poster on the side
  const pc = paintingCanvas('beach');
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.72), new THREE.MeshLambertMaterial({ map: pixelTexture(pc.commit()) }));
  poster.position.set(160.4 * S32, 48.5 * S32, 48 * S32);
  poster.rotation.y = Math.PI / 2;
  grp.add(poster);
  const poster2 = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.72), new THREE.MeshLambertMaterial({ map: pixelTexture(paintingCanvas('beach').commit()) }));
  poster2.position.set(-1.4 * S32, 48.5 * S32, 48 * S32);
  poster2.rotation.y = -Math.PI / 2;
  grp.add(poster2);
  // the giant golden ticket over the roof
  const tpc = ticketSignCanvas();
  const tick = new THREE.Mesh(new THREE.PlaneGeometry(tpc.w / 15, tpc.h / 15), new THREE.MeshBasicMaterial({ map: pixelTexture(tpc.commit()), transparent: true, alphaTest: 0.5 }));
  tick.position.set((W / 2) * S32, 130 * S32 + tpc.h / 30 + 0.1, (D / 2) * S32 + 0.3);
  tick.userData.bob = true;
  grp.add(tick);
  const L = (x, y, z) => ({ x: x * S32, y: y * S32, z: z * S32 });
  return { obj: grp, ticket: tick, w: W * S32, d: D * S32, lights: [L(5, 62, 104), L(155, 62, 104)], inside: L(80, 72, 61) };
}

/** Brass stanchions with a sagging velvet rope (3 posts, ~3 units). Origin: middle post foot. */
export function velvetRope32() {
  const g = new VoxelGrid(100, 36, 10);
  const posts = [3, 49, 95];
  for (const x of posts) {
    for (let y = 0; y < 3; y++) for (let z = 0; z < 10; z++) for (let xx = x - 4; xx <= x + 4; xx++) if (Math.hypot(xx + 0.5 - x - 0.5, z + 0.5 - 5) < 4 - y * 0.6) g.set(xx, y, z, y === 2 ? GOLD_L : GOLD_D);
    for (let y = 3; y < 29; y++) for (let z = 4; z < 6; z++) for (let xx = x; xx < x + 2; xx++) g.set(xx, y, z, xx === x && y % 3 ? GOLD_L : GOLD);
    g.ellipsoid(x + 1, 31, 5, 2.6, 2.6, 2.6, (xx, y) => (y > 31 ? GOLD_L : GOLD));
  }
  for (let i = 0; i < 2; i++) {
    const a = [posts[i] + 2, 26, 5], b = [posts[i + 1], 26, 5];
    line(g, sag(a, b, 14, 8), 1.2, (x, y) => (y < 22 ? 0x7a1a2a : 0xa82a3a));
  }
  return M32(g, [50, 0, 5]);
}
