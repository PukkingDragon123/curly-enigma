// The burrow's own lift down to the mine: a brass-and-timber cage in the south-east corner. Four
// timber guide posts run floor to ceiling with an X brace and a painted "MINE" board; the cage has
// brass bars, a riveted roof with a crosshead and a shackle, a lantern, a brass lever pedestal
// inside and a folding accordion gate on its open side. Its cable runs up over a spoked pulley
// wheel in a square opening in the ceiling and down into the dark pit under the floor. Built in
// tile units (1/32-tile voxels) inside the room group; the scene drives the cage, gate and wheel.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, iron, line, ring, M32, G32, group, mulc, sp3, lowRes } from '../iso/kit.js';
import { T, CEIL } from './units.js';

const CT = CEIL / T;
const S = 1 / 32;
const BRASS = 0xc8a050, BRASS_L = 0xf0d080, BRASS_D = 0x8a6a2a;
const brass = (x, y, z) => ((x + y * 3 + z) % 11 === 0 ? BRASS_L : (x * 7 + y + z * 5) % 13 === 0 ? BRASS_D : BRASS);

export class HomeLift {
  /** room: the tile-unit group; L: { x, y, w, d } tiles (the lift's footprint). */
  constructor(room, L) {
    this.room = room;
    this.L = L;
    this.root = new THREE.Group();
    this.root.position.set(L.x, 0, L.y); // the footprint's NW corner
    room.add(this.root);
    this.cageY = 0; // tiles (0 = level with the floor, negative = down the pit)
    this.gate = 0; // 0 open … 1 shut
    this.spin = 0;
    this.sway = 0;
    this.build();
    this.setCage(0);
    this.setGate(0);
  }

  build() {
    const N = 64; // 2 tiles of 1/32 voxels
    // ---- the pit: timber lining fading into the dark (unlit so the depths stay black)
    const PD = 112;
    const p = new VoxelGrid(N, PD, N);
    for (let y = 0; y < PD; y++) {
      const k = Math.max(0.03, Math.round(Math.pow(y / PD, 1.8) * 0.55 * 8) / 8);
      for (let i = 0; i < N; i++) for (const [x, z] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) {
        const cross = y % 28 < 4;
        const c = cross ? 0x4a2e1a : (i % 9 === 0 ? 0x2e1c10 : Math.floor(i / 9) % 2 ? 0x5a3a22 : 0x523420);
        p.set(x, y, z, mulc(c, k));
      }
      if (y === 0) p.box(0, 0, 0, N, 1, N, 0x050302);
    }
    const pit = lowRes(() => G32(p, [0, PD, 0], { outline: false }));
    this.root.add(pit);
    // ---- guide frame: four posts to the ceiling, a header with the MINE board, an X brace
    const H = Math.round(CT * 32);
    const f = new VoxelGrid(N + 2, H, N + 2);
    const post = beam(0x5a3a22, 'y', 5);
    for (const [x, z] of [[0, 0], [N - 8, 0], [0, N - 8], [N - 8, N - 8]]) {
      f.box(x, 0, z, 9, H, 9, post);
      for (const y of [4, 40, 84]) f.box(x, y, z, 9, 2, 9, (xx, yy, zz) => ((xx + zz) % 4 === 0 ? C.ironL : C.iron));
    }
    // header beam across the open side, the board under it
    f.box(0, 92, 0, N, 8, 7, beam(0x4a2e1a, 'x', 6));
    f.box(12, 100, 1, N - 24, 14, 3, wood(0x6a4428, { axis: 'x', across: 'y', pw: 5, seed: 7 }));
    for (const [x, y] of [[14, 102], [N - 16, 102], [14, 111], [N - 16, 111]]) f.set(x, y, 4, C.brass);
    // trim round the drum opening in the ceiling (sits under the boards)
    // "MINE" + a down arrow, painted cream
    const glyph = { M: ['10001', '11011', '10101', '10001', '10001'], I: ['111', '010', '010', '010', '111'], N: ['1001', '1101', '1011', '1001', '1001'], E: ['111', '100', '110', '100', '111'], v: ['11111', '01110', '00100'] };
    let gx = 19;
    for (const ch of 'MINE') { const gl = glyph[ch]; for (let r = 0; r < 5; r++) for (let c = 0; c < gl[r].length; c++) if (gl[r][c] === '1') f.set(gx + c, 110 - r, 4, 0xf0e2c0); gx += gl[0].length + 1; }
    const ar = glyph.v;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) if (ar[r][c] === '1') f.set(gx + 1 + c, 109 - r, 4, 0xe0b040);
    // X brace on the west side (two diagonal timbers)
    line(f, [[3, 8, 9], [3, 88, N - 9]], 1.6, (x, y, z) => mulc(0x6a4428, sp3(x, y, z, 2, 0.1, 0.1)));
    line(f, [[3, 88, 9], [3, 8, N - 9]], 1.6, (x, y, z) => mulc(0x5e3c22, sp3(x, y, z, 3, 0.1, 0.1)));
    // the call box on the front-left post: a small brass plate with two buttons, a lever and a bell above
    const callBox = new VoxelGrid(12, 34, 8);
    callBox.box(1, 0, 0, 10, 16, 2, brass);
    callBox.box(2, 1, 2, 8, 14, 1, BRASS_D);
    callBox.box(4, 9, 3, 4, 2, 1, 0x3a8a4a); callBox.box(4, 4, 3, 4, 2, 1, 0xc84a3a);
    line(callBox, [[9, 8, 3], [9, 14, 6]], 0.6, C.ironL); callBox.set(9, 14, 6, 0x1a1a1a);
    ring(callBox, 6, 3, 0, 3.4, 27, 31, brass); ring(callBox, 6, 3, 0, 2.4, 25, 27, brass); callBox.box(5, 31, 2, 2, 2, 2, C.iron);
    callBox.box(5, 16, 0, 2, 9, 2, BRASS_D);
    this.root.add(M32(f, [0, 0, 0]));
    const cb = M32(callBox, [6, 0, 0]);
    cb.rotation.y = Math.PI; // back on the post's north face, front toward the room
    cb.position.set(4.5 * S, 1.55, -0.005);
    this.root.add(cb);
    // ---- the cage
    this.cage = new THREE.Group();
    this.root.add(this.cage);
    const g = new VoxelGrid(N, 96, N);
    const gl = new VoxelGrid(N, 96, N);
    const ir = iron(0x34343c, 3);
    // platform: planks in an iron rim
    g.box(3, 0, 3, N - 6, 4, N - 6, wood(0x8a5a32, { axis: 'z', across: 'x', pw: 7, seed: 9 }));
    g.box(3, 0, 3, N - 6, 4, 2, ir); g.box(3, 0, N - 5, N - 6, 4, 2, ir); g.box(3, 0, 3, 2, 4, N - 6, ir); g.box(N - 5, 0, 3, 2, 4, N - 6, ir);
    for (let k = 6; k < N - 6; k += 8) for (const [x, z] of [[k, 3], [k, N - 4], [3, k], [N - 4, k]]) g.set(x, 4, z, C.ironL);
    // cage corner posts and roof ring
    const top = 84;
    for (const [x, z] of [[3, 3], [N - 6, 3], [3, N - 6], [N - 6, N - 6]]) g.box(x, 4, z, 3, top - 4, 3, brass);
    g.box(3, top, 3, N - 6, 3, N - 6, ir);
    g.box(5, top + 3, 5, N - 10, 2, N - 10, (x, y, z) => ((x + z) % 6 === 0 ? C.ironL : 0x2e2e36));
    for (let k = 6; k < N - 6; k += 6) for (const [x, z] of [[k, 3], [k, N - 4], [3, k], [N - 4, k]]) g.set(x, top + 2, z, C.ironL);
    // a little crest on the front and the crosshead with the shackle
    for (let x = 18; x < N - 18; x++) { const h = Math.round(5 * Math.sin(((x - 18) / (N - 36)) * Math.PI)); g.box(x, top + 3, 3, 1, h + 1, 1, brass); }
    g.box(10, top + 5, N / 2 - 10, N - 20, 4, 6, beam(0x4a2e1a, 'x', 3));
    g.box(N / 2 - 4, top + 9, N / 2 - 9, 4, 3, 4, ir);
    ring(g, N / 2 - 2, N / 2 - 7, 1, 2.6, top + 12, top + 14, C.ironL);
    // brass bars on the three closed sides (the front stays open for the gate), with bands
    for (let k = 8; k < N - 6; k += 5) {
      g.box(3, 4, k, 1, top - 4, 1, brass); // west
      g.box(N - 4, 4, k, 1, top - 4, 1, brass); // east
      g.box(k, 4, N - 4, 1, top - 4, 1, brass); // south
    }
    for (const y of [30, 58]) {
      g.box(3, y, 3, 1, 2, N - 6, brass); g.box(N - 4, y, 3, 1, 2, N - 6, brass); g.box(3, y, N - 4, N - 6, 2, 1, brass);
    }
    // a kick plate of riveted iron along the bottom of the bars
    g.box(3, 4, 3, 1, 10, N - 6, ir); g.box(N - 4, 4, 3, 1, 10, N - 6, ir); g.box(3, 4, N - 4, N - 6, 10, 1, ir);
    // the lever pedestal inside on the right (east), with a dial and a brass lever
    g.box(N - 15, 4, N / 2 - 5, 8, 34, 9, (x, y, z) => (y > 34 ? BRASS_L : y < 8 ? 0x2e2e36 : brass(x, y, z)));
    ring(g, N - 11, N / 2, 0, 5.5, 38, 40, BRASS_D);
    g.box(N - 16, 30, N / 2 - 3, 1, 7, 7, 0xf0e8d0); // dial face
    line(g, [[N - 17, 33.5, N / 2 + 0.5], [N - 17, 35.5, N / 2 + 2.5]], 0.5, 0x1a1a1a);
    line(g, [[N - 11, 40, N / 2], [N - 16, 52, N / 2 - 3]], 0.9, C.ironL);
    g.ellipsoid(N - 16.5, 53, N / 2 - 3.5, 2.2, 2.2, 2.2, 0xc84a3a);
    // a lantern hanging inside from the roof
    g.box(N / 2 - 1, top - 8, N / 2 + 10, 2, 8, 2, ir);
    g.box(N / 2 - 4, top - 10, N / 2 + 7, 8, 2, 8, ir);
    for (const [x, z] of [[N / 2 - 4, N / 2 + 7], [N / 2 + 3, N / 2 + 7], [N / 2 - 4, N / 2 + 14], [N / 2 + 3, N / 2 + 14]]) g.box(x, top - 21, z, 1, 11, 1, ir);
    g.box(N / 2 - 4, top - 22, N / 2 + 7, 8, 1, 8, ir);
    gl.box(N / 2 - 3, top - 21, N / 2 + 8, 6, 11, 6, (x, y) => (y > top - 15 ? C.glowW : C.glowO));
    gl.box(N / 2 - 1, top - 18, N / 2 + 10, 2, 4, 2, C.glowY);
    this.cageMesh = group(M32(g, [0, 0, 0]), G32(gl, [0, 0, 0]));
    this.cage.add(this.cageMesh);
    this.lanternLocal = { x: (N / 2) * S, y: (top - 15) * S, z: (N / 2 + 10.5) * S };
    // ---- the accordion gate on the front: a lattice of brass diagonals hinged on the left post
    const gw = N - 12, gh = top - 8;
    const gg = new VoxelGrid(gw, gh, 2);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const a = (x + y) % 12, b = (x - y + 1200) % 12;
      if (a === 0 || b === 0 || x % 12 === 0 || y < 2 || y >= gh - 2) gg.set(x, y, 0, (x % 12 === 0 && (y % 6 === 0)) ? BRASS_L : (x % 12 === 0 ? BRASS_D : BRASS));
    }
    gg.box(gw - 3, 0, 0, 3, gh, 2, BRASS_D); // the leading stile with a handle
    gg.box(gw - 5, gh / 2 - 3, 1, 2, 6, 1, 0x3a3a44);
    this.gateMesh = M32(gg, [0, 0, 1]);
    this.gatePivot = new THREE.Group();
    this.gatePivot.position.set(6 * S, 6 * S, 2 * S);
    this.gatePivot.add(this.gateMesh);
    this.cage.add(this.gatePivot);
    // ---- the winding drum in the ceiling opening: a rope drum and a spoked gear on one axle
    const wg = new VoxelGrid(30, 30, 30);
    const wc = 15;
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
      const d = Math.hypot(x + 0.5 - wc, y + 0.5 - wc);
      const a = Math.atan2(y + 0.5 - wc, x + 0.5 - wc);
      for (let z = 0; z < 30; z++) {
        if (d < 1.6) { wg.set(x, y, z, C.ironL); continue; } // the axle
        if (z >= 4 && z < 20 && d < 7) wg.set(x, y, z, d > 6 ? ((z + Math.floor(a * 3)) % 3 ? 0xa88a5a : 0x7a6040) : 0x5a3a22); // rope coils
        if ((z === 3 || z === 20) && d < 9.5) wg.set(x, y, z, d > 8.5 ? BRASS_D : C.iron); // flanges
        if (z >= 23 && z < 27) {
          if (d > 11 && d < 14.5 && (d < 13 || Math.floor((a + Math.PI) / (Math.PI / 12)) % 2 === 0)) wg.set(x, y, z, d > 13 ? C.ironD : C.iron); // toothed rim
          else if (d < 3.2) wg.set(x, y, z, BRASS);
          else if (d < 11 && Math.abs(((a / Math.PI) * 3 + 6) % 1 - 0.5) > 0.4) wg.set(x, y, z, C.iron); // spokes
        }
        if ((z === 0 || z === 29) && d < 3.5) wg.set(x, y, z, C.iron); // bearings
      }
    }
    this.wheel = M32(wg, [wc, wc, 12]);
    this.wheelPivot = new THREE.Group();
    this.wheelPivot.position.set(N / 2 * S, CT + 0.06, N / 2 * S);
    this.wheelPivot.rotation.y = Math.PI / 2; // the axle runs along x
    this.wheelPivot.add(this.wheel);
    this.root.add(this.wheelPivot);
    // the cable: a unit-length rope scaled to fit between the shackle and the drum
    const cg = new VoxelGrid(2, 32, 2);
    cg.box(0, 0, 0, 2, 32, 2, (x, y) => (y % 4 === 0 ? 0x5a5a64 : 0x3a3a44));
    this.cable = M32(cg, [1, 0, 1], { outline: false });
    this.cable.position.set((N / 2 - 2) * S, 0, (N / 2 - 7) * S);
    this.root.add(this.cable);
    this.top = top;
  }

  /** Cage height in tiles (0 = floor level). */
  setCage(y) {
    this.cageY = y;
    this.cage.position.y = y;
    const from = y + (this.top + 14) * S, to = CT + 0.06;
    this.cable.position.y = from;
    this.cable.scale.y = Math.max(0.01, to - from);
  }

  /** Gate: 0 folded open at the left post … 1 drawn shut. */
  setGate(k) {
    this.gate = k;
    this.gatePivot.scale.x = 0.14 + 0.86 * k;
  }

  update(dt, t) {
    this.wheel.rotation.z = this.spin;
    if (this.sway) {
      this.cage.rotation.z = Math.sin(t * 17) * 0.004 * this.sway;
      this.cage.rotation.x = Math.sin(t * 13 + 1) * 0.003 * this.sway;
    } else { this.cage.rotation.z = 0; this.cage.rotation.x = 0; }
  }

  /** The cage lantern in room (tile) space. */
  lanternPos(out = new THREE.Vector3()) {
    const L = this.L, p = this.lanternLocal;
    return out.set(L.x + p.x, this.cageY + p.y, L.y + p.z);
  }
}

/** Collision for the lift in meters: [x0, y0, z0, x1, y1, z1] boxes (bars, posts, platform, gate). */
export function liftBoxes(L, gateShut = false) {
  const x0 = L.x * T, z0 = L.y * T, x1 = (L.x + L.w) * T, z1 = (L.y + L.d) * T, h = CEIL;
  const b = [
    [x0, 0, z0, x0 + 0.125, h, z1], // west bars + posts
    [x1 - 0.125, 0, z0, x1, h, z0 + 0.125], // front-right post
    [x0, -0.25, z0, x1, 0, z1], // the cage floor (when the cage is up)
    [x1 - 0.25, 0, z0 + 0.375, x1, 0.62, z0 + 0.625], // the lever pedestal
  ];
  if (gateShut) b.push([x0 + 0.125, 0, z0, x1 - 0.125, h, z0 + 0.125]);
  return b;
}

export { S as LIFT_S };
