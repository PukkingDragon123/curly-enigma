// Old Star's cage lift down to the mine, in its own shaft behind the hall's east wall. On the
// hall side a heavy timber portal with iron straps carries a small brass plaque (a pick and Old
// Star's star), a call lever on a brass quadrant with a bell above it and a lantern on a hook. The
// shaft is lined with timber cribbing, with oak guide rails on both sides; a spoked sheave turns
// up in the dark, its cable running down to the cage's crosshead and, behind the cage, to a cast
// iron counterweight in its own guides. The cage: an oak platform in an iron frame, brass bars on
// three sides over a riveted kick plate, a riveted roof with a brass crest, an operator's lever
// inside, a hanging lantern, and a brass lattice gate that folds back on its open (hall) side.
// Tile units inside the room group; static pieces go into `decor` (merged and lit with the hall),
// the moving ones into the room. The scene drives cage, gate, levers and the sheave.
import * as THREE from 'three';
import { VoxelGrid, C, wood, beam, line, ring, M32, G32, group, mulc, mixc, sp3, h3, lowRes } from '../iso/kit.js';
import { hash2 } from '../iso/surface.js';
import { T, HALL, SHAFT } from './units.js';

const S = 1 / 32;
const BRASS = 0xc09a48, BRASS_L = 0xf0d488, BRASS_D = 0x86642a, PATINA = 0x6a9a82;
const IRON = 0x33333b, IRON_L = 0x5a5a66, IRON_D = 0x222228;
const brass = (x, y, z) => (h3(x, y, z, 5) < 0.015 ? PATINA : y % 23 === 0 ? BRASS_L : y % 17 === 0 ? BRASS_D : BRASS);
const iron = (x, y, z) => (h3(x, y, z, 3) < 0.015 ? 0x7a4a2a : IRON);

/** Shaft dimensions (voxels, 1/64 m): the well, the cage inside it, the counterweight lane behind. */
const WELL = Math.round((SHAFT.x1 - SHAFT.x0) * 64); // 74 across (x) and deep (z)
const BACK = WELL + 14; // the back wall, past the counterweight lane
const CAGE = { x0: 3, x1: WELL - 3, z0: 3, z1: WELL - 3, top: 90 };
const PORTAL_H = Math.round(SHAFT.h * 64); // 88
const TOP_V = Math.round((SHAFT.top - HALL.y) * 64);
const PIT_V = Math.round((SHAFT.pit - HALL.y) * 64);
const SHEAVE = { x: (CAGE.x0 + CAGE.x1) / 2 + 22, y: TOP_V - 30, r: 22 };

export class HomeLift {
  /** room: the tile-unit group; decor: the hall's static group (merged later). */
  constructor(room, decor) {
    this.room = room;
    this.root = new THREE.Group();
    this.root.position.set(SHAFT.x0 / T, HALL.y / T, SHAFT.z0 / T);
    room.add(this.root);
    this.staticRoot = new THREE.Group();
    this.staticRoot.position.copy(this.root.position);
    decor.add(this.staticRoot);
    this.cageY = 0; // tiles below the landing (negative = down)
    this.gate = 0;
    this.spin = 0;
    this.sway = 0;
    this.lever = 0;
    this.buildShaft();
    this.buildPortal();
    this.buildCage();
    this.setCage(0);
    this.setGate(0);
  }

  // ------------------------------------------------------------ the shaft
  buildShaft() {
    const add = (m) => { this.staticRoot.add(m); return m; };
    // timber cribbing on the three walls, guide rails on the side walls; lit near the landing,
    // unlit and fading to black far up and down the shaft
    const lining = (y0, y1, lit) => {
      const n = y1 - y0;
      const fade = (yy) => (lit ? 1 : Math.max(0.04, 0.55 * (1 - Math.min(1, yy < 0 ? -yy / 170 : (yy - 120) / 110)) ** 1.6));
      const plankC = (yy, along) => {
        const row = Math.floor(yy / 8);
        const c = mulc([0x4e3220, 0x563826, 0x46301e][Math.floor(hash2(row, Math.floor(along / 40), 3) * 3)], yy % 8 === 0 ? 0.6 : 1);
        return mulc(c, fade(yy));
      };
      const railC = (yy, k) => mulc(yy % 40 < 3 ? IRON : (k === 0 || k === 7) ? 0x5a3a22 : 0x7a5434, fade(yy));
      // the two side walls (thin), each with its guide rails, and the back wall
      for (const side of [0, 1]) {
        const g = new VoxelGrid(BACK + 6, n, 8);
        const zw = side ? 0 : 6; // the wall's plank layer, the rails stand out of it toward the well
        for (let y = 0; y < n; y++) {
          const yy = y + y0;
          for (let x = 0; x < BACK + 6; x++) g.set(x, y, zw, plankC(yy, x + side * 90));
          for (const rx of [(CAGE.x0 + CAGE.x1) / 2 - 4, BACK - 9]) for (let k = 0; k < 8; k++) g.set(Math.round(rx) + k, y, side ? 1 : 5, railC(yy, k));
        }
        const m = lit ? M32(g, [0, 0, side ? 0 : 7]) : G32(g, [0, 0, side ? 0 : 7]);
        m.position.set(0, y0 * S, side ? WELL * S : 0);
        add(m);
      }
      const bg = new VoxelGrid(2, n, WELL + 12);
      for (let y = 0; y < n; y++) for (let z = 0; z < WELL + 12; z++) bg.set(0, y, z, plankC(y + y0, z + 40));
      const bm = lit ? M32(bg, [0, 0, 6]) : G32(bg, [0, 0, 6]);
      bm.position.set((BACK + 1) * S, y0 * S, 0);
      add(bm);
    };
    lowRes(() => lining(PIT_V, -40, false));
    lining(-40, 130, true);
    lowRes(() => lining(130, TOP_V, false));
    // the black pit floor and the dark shaft roof
    const cap = new VoxelGrid(BACK + 8, 2, WELL + 12);
    cap.box(0, 0, 0, BACK + 8, 2, WELL + 12, 0x060403);
    const c1 = add(G32(cap, [2, 0, 6], { outline: false })); c1.position.y = PIT_V * S;
    const c2 = add(G32(cap.box(0, 0, 0, BACK + 8, 2, WELL + 12, 0x0a0706), [2, 0, 6], { outline: false })); c2.position.y = TOP_V * S;
    // the sheave up in the dark: a spoked wheel on an axle across the shaft (turns while riding)
    const R = SHEAVE.r;
    const wg = new VoxelGrid(R * 2 + 4, R * 2 + 4, 10);
    const wc = R + 2;
    for (let y = 0; y < R * 2 + 4; y++) for (let x = 0; x < R * 2 + 4; x++) {
      const d = Math.hypot(x + 0.5 - wc, y + 0.5 - wc), a = Math.atan2(y + 0.5 - wc, x + 0.5 - wc);
      for (let z = 2; z < 8; z++) {
        if (d > R - 3 && d < R + 1 && (z === 2 || z === 7 || d < R - 1.5)) wg.set(x, y, z, d > R - 1.5 ? 0x3a3a42 : 0x2a2a30);
        else if (d < 3 || (d < R - 3 && Math.abs(((a / Math.PI) * 3 + 6) % 1 - 0.5) > 0.42 && z > 3 && z < 6)) wg.set(x, y, z, 0x2e2e36);
      }
    }
    this.wheel = G32(wg, [wc, wc, 5]);
    this.wheel.material = this.wheel.material.clone();
    this.wheel.material.color.setScalar(0.5);
    this.wheelPivot = new THREE.Group();
    this.wheelPivot.position.set(SHEAVE.x * S, SHEAVE.y * S, (WELL / 2) * S);
    this.wheelPivot.add(this.wheel);
    this.root.add(this.wheelPivot);
    // the axle beams
    const ab = new VoxelGrid(10, 8, WELL + 12);
    ab.box(0, 0, 0, 10, 8, WELL + 12, (x, y, z) => mulc(0x2a1c12, y === 7 ? 1.2 : 1));
    const axle = add(G32(ab, [5, 4, 6]));
    axle.position.set(SHEAVE.x * S, (SHEAVE.y - R - 8) * S, 0);
  }

  // ------------------------------------------------------------ the portal on the hall side
  buildPortal() {
    const add = (m) => { this.staticRoot.add(m); return m; };
    const P = 12, OUT = 7; // post width (along z) and how far it stands out into the hall
    const g = new VoxelGrid(OUT + 6, PORTAL_H + 22, WELL + P * 2);
    const pz = (z) => z + P; // grid z of shaft z
    const post = beam(0x4a2e1c, 'y', 3);
    for (const z0 of [0, WELL + P]) {
      g.box(0, 0, z0, OUT + 6, PORTAL_H + 20, P, (x, y, z) => {
        let c = post(x, y, z);
        if (y % 44 > 40) c = iron(x, y, z); // straps
        if ((y % 44 === 42) && (z - z0) % 4 === 2 && x === 0) c = IRON_L; // rivets
        if (y < 12) c = mulc(0x7a7068, sp3(x, y, z, 2, 0.12, 0.1) * (y === 11 ? 1.1 : 1)); // stone footing
        return c;
      });
    }
    // the lintel: a heavy beam faced with a riveted iron plate
    g.box(0, PORTAL_H, 0, OUT + 6, 20, WELL + P * 2, (x, y, z) => {
      if (x === 0 && y > PORTAL_H + 3 && y < PORTAL_H + 17) return (y === PORTAL_H + 4 || y === PORTAL_H + 16) && z % 5 === 2 ? IRON_L : IRON;
      return mulc(0x4a2e1c, (y === PORTAL_H ? 0.75 : 1) * sp3(x, y, z, 4, 0.1, 0.1));
    });
    // the little brass plaque: a raised rim, a pick and a five-pointed star engraved in it
    const pc = pz(WELL / 2);
    for (let y = PORTAL_H + 6; y < PORTAL_H + 15; y++) for (let z = pc - 9; z < pc + 9; z++) {
      const rim = y === PORTAL_H + 6 || y === PORTAL_H + 14 || z === pc - 9 || z === pc + 8;
      g.set(0, y, z, rim ? BRASS_D : brass(0, y, z));
    }
    const etch = (z, y) => g.set(0, PORTAL_H + y, pc + z, 0x5a4218);
    for (let k = 0; k < 6; k++) etch(-6 + k, 8 - k); // the pick's handle
    etch(-2, 9 - 1); etch(-1, 7); etch(0, 6); etch(-3, 6); // its head
    for (const [z, y] of [[4, 11], [3, 10], [5, 10], [2, 9], [6, 9], [3, 8], [5, 8], [4, 9], [2, 7], [6, 7]]) etch(z, y - 2); // the star
    // the call box on the north post (hall face): a riveted iron plate with a brass quadrant and
    // its notches round the lever's pivot (flush, picked out in colour), and a bell on a bracket above
    const qz = 1, qy = 38, PW = 10, PH = 24; // the plate's lower corner (grid z, y), size
    const pvz = qz + 2, pvy = qy + 5; // the lever's pivot
    for (let y = 0; y < PH; y++) for (let z = 0; z < PW; z++) {
      const r = Math.hypot(z + qz + 0.5 - pvz, y + qy + 0.5 - pvy);
      let c = (y === 0 || y === PH - 1 || z === 0 || z === PW - 1) ? IRON_D : IRON;
      if (r > 11 && r < 13.4 && y + qy >= pvy && z + qz >= pvz) c = (Math.round(Math.atan2(y + qy - pvy, z + qz - pvz) * 7) % 3 === 0) ? BRASS_D : BRASS; // the quadrant
      if ((y === 1 || y === PH - 2) && (z === 1 || z === PW - 2)) c = IRON_L; // rivets
      g.set(0, qy + y, qz + z, c);
    }
    g.box(0, qy + PH, qz + 3, 1, 6, 2, IRON); // the bell's bracket
    const bell = new VoxelGrid(10, 10, 10);
    for (let y = 2; y < 9; y++) ring(bell, 5, 5, 0, 1.6 + (9 - y) * 0.42 + (y < 4 ? 0.6 : 0), y, y + 1, (x, yy) => (yy === 3 ? BRASS_L : yy === 2 ? BRASS_D : BRASS));
    bell.box(4, 9, 4, 2, 1, 2, IRON); bell.set(5, 1, 5, IRON_L);
    const bm = M32(bell, [5, 0, 5]);
    // portal lantern on a hook on the south post
    const lg = new VoxelGrid(16, 40, 16), lgl = new VoxelGrid(16, 40, 16);
    line(lg, [[8, 36, 1], [8, 36, 9], [8, 32, 9]], 0.6, IRON);
    lg.box(4, 28, 5, 9, 2, 9, IRON); lg.box(5, 30, 6, 7, 1, 7, IRON_L);
    for (const [x, z] of [[4, 5], [12, 5], [4, 13], [12, 13]]) lg.box(x, 15, z, 1, 13, 1, IRON);
    lg.box(4, 14, 5, 9, 1, 9, IRON); lg.box(6, 12, 7, 5, 2, 5, IRON_D);
    lgl.box(5, 15, 6, 7, 13, 7, (x, y) => (y > 22 ? C.glowW : C.glowO)); lgl.box(7, 18, 8, 3, 5, 3, C.glowY);
    const lantern = group(M32(lg, [8, 0, 0]), G32(lgl, [8, 0, 0]));
    // grid x = 0 is the face toward the hall; x = OUT is the wall plane (the shaft's x0)
    add(M32(g, [OUT, 0, P]));
    bm.position.set(-(OUT + 4) * S, (qy + PH - 4) * S, (qz + 4 - P) * S);
    add(bm);
    lantern.rotation.y = -Math.PI / 2;
    lantern.position.set(-OUT * S, (PORTAL_H - 26) * S, (WELL + P / 2) * S);
    add(lantern);
    this.lanternM = { x: SHAFT.x0 - (OUT + 9.5) / 64, y: HALL.y + (PORTAL_H - 5) / 64, z: SHAFT.z0 + (WELL + P / 2) / 64 };
    // the call lever itself (moves when pulled): pivot at the quadrant's corner
    const lv = new VoxelGrid(4, 16, 4);
    lv.box(1, 0, 1, 2, 12, 2, IRON_L); lv.box(0, 12, 0, 4, 4, 4, 0xc8382a); lv.set(1, 15, 1, 0xff7a6a); lv.box(0, 0, 0, 4, 2, 4, BRASS_D);
    this.callLever = new THREE.Group();
    this.callLever.add(M32(lv, [2, 0, 2]));
    this.callLever.position.set(-(OUT + 1.5) * S, pvy * S, (pvz - P) * S);
    this.callLever.rotation.x = 0.2;
    this.root.add(this.callLever);
    this.callBox = { x: SHAFT.x0 - OUT / 64, y: HALL.y + (qy + PH / 2) / 64, z: SHAFT.z0 + (qz + PW / 2 - P) / 64 };
  }

  // ------------------------------------------------------------ the cage
  buildCage() {
    this.cage = new THREE.Group();
    this.root.add(this.cage);
    const { x0, x1, z0, z1, top } = CAGE;
    const W = x1 - x0, D = z1 - z0;
    const g = new VoxelGrid(WELL, top + 16, WELL);
    const gl = new VoxelGrid(WELL, top + 16, WELL);
    const Y = 4; // the platform sits 4 voxels below the landing, its top flush with the floor
    // platform: oak planks in an iron frame
    g.box(x0, 0, z0, W, Y, D, wood(0x7a5232, { axis: 'x', across: 'z', pw: 7, seed: 9 }));
    for (let x = x0; x < x1; x++) for (const z of [z0, z1 - 1]) g.box(x, 0, z, 1, Y, 1, iron(x, 0, z));
    for (let z = z0; z < z1; z++) for (const x of [x0, x1 - 1]) g.box(x, 0, z, 1, Y, 1, iron(x, 0, z));
    for (let x = x0 + 4; x < x1 - 2; x += 8) { g.set(x, Y - 1, z0, IRON_L); g.set(x, Y - 1, z1 - 1, IRON_L); }
    // worn pale where everyone stands
    for (let x = x0 + 14; x < x1 - 14; x++) for (let z = z0 + 14; z < z1 - 14; z++) if (hash2(x >> 1, z >> 1, 4) < 0.4) g.set(x, Y - 1, z, 0x9a7650);
    // corner posts (iron angle), kick plates, brass bars on three sides, bands
    for (const [x, z] of [[x0, z0], [x1 - 3, z0], [x0, z1 - 3], [x1 - 3, z1 - 3]]) g.box(x, Y, z, 3, top - Y, 3, iron);
    g.box(x0, Y, z0, W, 12, 1, iron); g.box(x0, Y, z1 - 1, W, 12, 1, iron); g.box(x1 - 1, Y, z0, 1, 12, D, iron);
    for (let k = 4; k < W - 3; k += 6) for (let y = Y + 2; y < Y + 11; y += 4) { g.set(x0 + k, y, z0 - 0, IRON_L); g.set(x0 + k, y, z1 - 1, IRON_L); }
    for (let k = 5; k < W - 3; k += 5) {
      g.box(x0 + k, Y + 12, z0, 1, top - Y - 12, 1, brass);
      g.box(x0 + k, Y + 12, z1 - 1, 1, top - Y - 12, 1, brass);
    }
    for (let k = 5; k < D - 3; k += 5) g.box(x1 - 1, Y + 12, z0 + k, 1, top - Y - 12, 1, brass);
    for (const y of [Y + 12, Y + 50, top - 3]) {
      g.box(x0, y, z0, W, 2, 1, brass); g.box(x0, y, z1 - 1, W, 2, 1, brass); g.box(x1 - 1, y, z0, 1, 2, D, brass);
    }
    // the roof: a riveted iron plate, a brass crest over the gate, the crosshead and its shackle
    g.box(x0, top, z0, W, 2, D, iron);
    for (let k = 3; k < W; k += 6) { g.set(x0 + k, top + 2, z0 + 1, IRON_L); g.set(x0 + k, top + 2, z1 - 2, IRON_L); g.set(x0 + 1, top + 2, z0 + k, IRON_L); g.set(x1 - 2, top + 2, z0 + k, IRON_L); }
    for (let z = z0 + 4; z < z1 - 4; z++) { const h = Math.round(4 * Math.abs(Math.sin(((z - z0 - 4) / (D - 8)) * Math.PI * 3))); g.box(x0, top + 2, z, 1, h + 1, 1, brass); }
    g.box((x0 + x1) / 2 - 3, top + 2, z0 + 6, 6, 4, D - 12, iron);
    ring(g, (x0 + x1) / 2, (z0 + z1) / 2, 1.2, 2.6, top + 6, top + 9, IRON_L);
    // the operator's lever box inside, on the north side
    const lx = x1 - 22;
    g.box(lx, Y + 30, z0 + 1, 10, 18, 4, (x, y) => (y === Y + 47 ? BRASS_L : brass(x, y, 0)));
    g.box(lx + 2, Y + 40, z0 + 5, 6, 5, 1, 0xf0e8d0); g.set(lx + 4, Y + 42, z0 + 6, 0x1a1a1a); g.set(lx + 5, Y + 43, z0 + 6, 0x1a1a1a);
    const ol = new VoxelGrid(4, 16, 4);
    ol.box(1, 0, 1, 2, 12, 2, IRON_L); ol.ellipsoid(2, 13, 2, 2, 2, 2, 0x2a1a12);
    this.opLever = new THREE.Group();
    this.opLever.add(M32(ol, [2, 0, 2]));
    this.opLever.position.set((lx + 5) * S, 34 * S, (z0 + 6) * S);
    this.opLever.rotation.z = 0.5;
    this.cage.add(this.opLever);
    // a lantern hanging inside from the roof, in the back corner
    const hx = x1 - 12, hz = z1 - 12;
    for (let y = top - 10; y < top; y++) g.set(hx, y, hz, y % 2 ? IRON : IRON_L);
    g.box(hx - 4, top - 12, hz - 4, 9, 2, 9, IRON); g.box(hx - 4, top - 26, hz - 4, 9, 1, 9, IRON);
    for (const [x, z] of [[hx - 4, hz - 4], [hx + 4, hz - 4], [hx - 4, hz + 4], [hx + 4, hz + 4]]) g.box(x, top - 25, z, 1, 13, 1, IRON);
    gl.box(hx - 3, top - 25, hz - 3, 7, 13, 7, (x, y) => (y > top - 18 ? C.glowW : C.glowO)); gl.box(hx - 1, top - 22, hz - 1, 3, 5, 3, C.glowY);
    this.cageMesh = group(M32(g, [0, Y, 0]), G32(gl, [0, Y, 0]));
    this.cage.add(this.cageMesh);
    this.lanternLocal = { x: hx * S, y: (top - 19 - Y) * S, z: hz * S };
    this.crossTop = (top + 9 - Y) * S;
    // the folding brass lattice gate on the open (hall) side, hinged at the south post
    const gw = D - 6, gh = top - Y - 8;
    const gg = new VoxelGrid(2, gh, gw);
    for (let y = 0; y < gh; y++) for (let z = 0; z < gw; z++) {
      const a = (z + y) % 12, b = (z - y + 1200) % 12;
      if (a === 0 || b === 0 || z % 12 === 0 || y < 2 || y >= gh - 2) gg.set(0, y, z, (z % 12 === 0 && y % 6 === 0) ? BRASS_L : z % 12 === 0 ? BRASS_D : BRASS);
    }
    gg.box(0, 0, 0, 2, gh, 3, BRASS_D); // the leading stile, with a handle
    gg.box(1, gh / 2 - 3, 4, 1, 6, 2, 0x3a3a44);
    this.gateMesh = M32(gg, [1, 0, gw]);
    this.gatePivot = new THREE.Group();
    this.gatePivot.position.set((x0 + 1) * S, 2 * S, (z1 - 3) * S);
    this.gatePivot.add(this.gateMesh);
    this.cage.add(this.gatePivot);
    // cables: the cage's up to the sheave, the counterweight's down the back; the counterweight
    const cg = new VoxelGrid(2, 32, 2);
    cg.box(0, 0, 0, 2, 32, 2, (x, y) => (y % 4 === 0 ? 0x6a6a74 : 0x3e3e48));
    this.cable = M32(cg, [1, 0, 1], { outline: false });
    this.cable.position.set(((x0 + x1) / 2) * S, 0, ((z0 + z1) / 2) * S);
    this.root.add(this.cable);
    this.cwCable = M32(cg, [1, 0, 1], { outline: false });
    this.cwCable.position.set((SHEAVE.x + SHEAVE.r) * S, 0, (WELL / 2) * S);
    this.root.add(this.cwCable);
    const cw = new VoxelGrid(12, 34, 18);
    cw.box(0, 0, 0, 12, 30, 18, (x, y, z) => (y % 10 === 0 ? IRON_D : (x + z) % 7 === 0 ? IRON_L : IRON));
    cw.box(4, 30, 7, 4, 4, 4, IRON_L);
    this.counter = M32(cw, [6, 0, 9]);
    this.counter.position.set((SHEAVE.x + SHEAVE.r) * S, 0, (WELL / 2) * S);
    this.root.add(this.counter);
    this.cwRest = 132; // counterweight bottom (voxels above the landing) while the cage is here
  }

  /** Cage height in tiles below the landing (0 = level with the hall floor). */
  setCage(y) {
    this.cageY = y;
    this.cage.position.y = y;
    const from = y + this.crossTop, to = (SHEAVE.y) * S;
    this.cable.position.y = from;
    this.cable.scale.y = Math.max(0.01, to - from);
    const cwY = this.cwRest * S - y;
    this.counter.position.y = cwY;
    this.cwCable.position.y = cwY + 34 * S;
    this.cwCable.scale.y = Math.max(0.01, to - (cwY + 34 * S));
  }

  /** Gate: 0 folded back against the south post … 1 drawn shut across the opening. */
  setGate(k) {
    this.gate = k;
    this.gatePivot.scale.z = 0.12 + 0.88 * k;
  }

  /** The call lever on the portal: 0 up (resting) … 1 pulled down. */
  setLever(k) {
    this.lever = k;
    this.callLever.rotation.x = 0.2 + k * 1.1;
    this.opLever.rotation.z = 0.5 - k * 1.0;
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
    const p = this.lanternLocal;
    return out.set(this.root.position.x + p.x, this.root.position.y + this.cageY + p.y, this.root.position.z + p.z);
  }
}

/**
 * The lift's two lanterns in meters, without building anything (for baking the hall's light in a
 * build worker): the one on the portal's post, and the one in the cage while it stands at the landing.
 */
export const LIFT_LIGHTS = {
  portal: { x: SHAFT.x0 - (7 + 9.5) / 64, y: HALL.y + (PORTAL_H - 5) / 64, z: SHAFT.z0 + (WELL + 12 / 2) / 64 },
  cage: { x: SHAFT.x0 + (CAGE.x1 - 12) / 64, y: HALL.y + (CAGE.top - 19 - 4) / 64, z: SHAFT.z0 + (CAGE.z1 - 12) / 64 },
};

/** Where to stand in the cage (meters): its centre, and the spot on the landing in front of the gate. */
export const LIFT = {
  cx: SHAFT.x0 + ((CAGE.x0 + CAGE.x1) / 2) / 64,
  cz: SHAFT.z0 + ((CAGE.z0 + CAGE.z1) / 2) / 64,
  outX: SHAFT.x0 - 0.5,
};

/** Collision for the lift in meters: [x0, y0, z0, x1, y1, z1] (shaft walls, cage sides, floor, gate). */
export function liftBoxes(gateShut = false) {
  const X0 = SHAFT.x0, Z0 = SHAFT.z0, Y = HALL.y, b = 1 / 64;
  const xb = X0 + BACK * b;
  const out = [
    [X0, SHAFT.pit, Z0 - 0.3, xb + 0.3, SHAFT.top, Z0], // north shaft wall
    [X0, SHAFT.pit, Z0 + WELL * b, xb + 0.3, SHAFT.top, Z0 + WELL * b + 0.3], // south shaft wall
    [xb, SHAFT.pit, Z0 - 0.3, xb + 0.3, SHAFT.top, Z0 + WELL * b + 0.3], // back
    [X0, Y - 0.12, Z0, xb, Y, Z0 + WELL * b], // the cage floor (while it's up)
    [X0, Y, Z0, xb, Y + 1.5, Z0 + (CAGE.z0 + 1) * b], // its north side
    [X0, Y, Z0 + (CAGE.z1 - 1) * b, xb, Y + 1.5, Z0 + WELL * b], // its south side
    [X0 + (CAGE.x1 - 1) * b, Y, Z0, xb, Y + 1.5, Z0 + WELL * b], // its back
    [X0, Y + CAGE.top * b, Z0, xb, SHAFT.top, Z0 + WELL * b], // its roof
    [X0 - 7 * b, Y, Z0 - 12 * b, X0, Y + SHAFT.h + 0.4, Z0], // the portal posts
    [X0 - 7 * b, Y, Z0 + WELL * b, X0, Y + SHAFT.h + 0.4, Z0 + WELL * b + 12 * b],
  ];
  if (gateShut) out.push([X0, Y, Z0, X0 + (CAGE.x0 + 2) * b, Y + 1.5, Z0 + WELL * b]);
  return out;
}

export { S as LIFT_S, mixc };
