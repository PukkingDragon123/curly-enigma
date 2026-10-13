// The Surface Express: an ornate brass lift cage with a tufted red velvet bench, a sliding gate,
// a little lamp and a sun crest. Built at 1/32 (the characters' voxel size); every world-space
// anchor (seat, gate, lamp, floor) matches the old 1/16 cage, so the scenes need no changes.
import * as THREE from 'three';
import { VoxelGrid, voxMesh, jitf, hash3 } from './vox.js';
import { makeGlow } from './fx.js';
import { shade, mixHex } from '../core/util.js';

const S = 1 / 32;
const W = 72, D = 56; // footprint inside the roof overhang
const M = 2; // roof overhang
const GW = W + 2 * M, GD = D + 2 * M;
const BRASS = 0xd9a83a, BRASS_HI = 0xffe08a, BRASS_LO = 0x9a6a1a, BRASS_DK = 0x6a4410;
const VELVET = 0xb0283a, VELVET_DK = 0x7a1426, VELVET_HI = 0xd84050, VELVET_DEEP = 0x5a0c1a;
const WOOD = 0x6b4426, WOOD_DK = 0x4a2e18, WOOD_HI = 0x8a5a34;
const IRON = 0x3a3030;

/** Polished brass: soft 2x2 speckle so it reads as metal, not noise. */
function brass(x, y, z) {
  const h = hash3(x >> 1, y >> 1, z >> 1, 31);
  return h < 0.1 ? BRASS_HI : h > 0.92 ? shade(BRASS, 0.86) : BRASS;
}

/** Ring (circle outline) in the XY plane at depth z, `t` voxels thick. */
function ringXY(g, cx, cy, z, r, c, t = 1.1) {
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (Math.abs(d - r) < t * 0.5 + 0.25) g.set(x, y, z, typeof c === 'function' ? c(x, y, d) : c);
  }
}
/** Ring in the ZY plane at x. */
function ringZY(g, x, cz, cy, r, c, t = 1.1) {
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let z = Math.floor(cz - r - 2); z <= cz + r + 2; z++) {
    const d = Math.hypot(z + 0.5 - cz, y + 0.5 - cy);
    if (Math.abs(d - r) < t * 0.5 + 0.25) g.set(x, y, z, typeof c === 'function' ? c(z, y, d) : c);
  }
}

function buildFrame() {
  const g = new VoxelGrid(GW, 118, GD);
  const X0 = M, X1 = M + W - 1, Z0 = M, Z1 = M + D - 1;
  // ---- floor: iron base, planks with seams and nail heads, a riveted brass rim (top at y = 6)
  g.box(X0, 0, Z0, W, 2, D, (x, y) => (y === 0 ? 0x241c1e : IRON));
  g.box(X0, 2, Z0, W, 4, D, (x, y, z) => {
    const rim = x <= X0 + 1 || x >= X1 - 1 || z <= Z0 + 1 || z >= Z1 - 1;
    if (rim) {
      if (y === 5 && (x + z) % 8 === 0) return BRASS_HI; // rivets
      return y === 5 ? brass(x, y, z) : y === 2 ? BRASS_DK : BRASS_LO;
    }
    const pz = z - Z0 - 2, plank = Math.floor(pz / 8);
    if (pz % 8 === 0) return WOOD_DK;
    const off = (plank * 23) % 40;
    if ((x - X0 + off) % 40 === 0) return WOOD_DK; // butt joints
    if (y === 5 && ((x - X0 + off) % 40 === 3 || (x - X0 + off) % 40 === 37) && (pz % 8 === 2 || pz % 8 === 6)) return 0x8a8a92; // nails
    const grain = (x + plank * 7) % 13 === 0 ? 0.88 : 1;
    return jitf(shade(plank % 2 ? WOOD : shade(WOOD, 0.9), grain), x >> 2, y, z, 3, 0.04);
  });
  // ---- corner posts: square brass with chamfered edges and a collar every 12 voxels
  for (const x of [X0, X1 - 3]) for (const z of [Z0, Z1 - 3]) {
    g.box(x, 6, z, 4, 76, 4, (xx, y, zz) => {
      const ex = xx === x || xx === x + 3, ez = zz === z || zz === z + 3;
      if (ex && ez) return (y % 12) < 2 ? BRASS_LO : -1; // chamfer (collars stay square)
      if ((y % 12) < 2) return BRASS_HI;
      return (xx === x + 1 && zz <= z + 1) ? BRASS_HI : brass(xx, y, zz);
    });
  }
  // ---- rails round the sides and back, plus the gate tracks at the front
  for (const y of [6, 30, 60, 80]) for (let t = 0; t < 2; t++) {
    const yy = y + t;
    const c = (x, z) => (t === 1 ? BRASS_HI : brass(x, yy, z));
    for (let x = X0; x <= X1; x++) { g.set(x, yy, Z0, c(x, Z0)); g.set(x, yy, Z0 + 1, c(x, Z0 + 1)); }
    for (let z = Z0; z <= Z1; z++) for (const x of [X0, X0 + 1, X1 - 1, X1]) g.set(x, yy, z, c(x, z));
    if (y !== 30) for (let x = X0; x <= X1; x++) for (const z of [Z1 - 1, Z1]) g.set(x, yy, z, y === 6 ? BRASS_LO : c(x, z));
  }
  // ---- lower side panels: dark wood with two raised, bevelled panels and brass trim
  for (const x of [X0, X1 - 1]) {
    g.box(x, 8, Z0 + 4, 2, 22, D - 8, (xx, y, z) => {
      if (y === 8 || y === 29) return BRASS_LO;
      const pz = z - (Z0 + 4), half = (D - 8) / 2;
      const lz = pz % half, edge = lz < 3 || lz > half - 4 || y < 11 || y > 26;
      if (edge) return jitf(WOOD_DK, x, y >> 1, z >> 1, 5, 0.04);
      const top = y === 26 || lz === 3, bot = y === 11 || lz === half - 4;
      return top ? WOOD_HI : bot ? shade(WOOD, 0.75) : jitf(0x5a2a1a, xx, y >> 1, z >> 2, 7, 0.05);
    });
  }
  // ---- slim bars on the sides (2x2) and the back, each with a collar
  const bar = (x, y, z) => ((y % 16) === 0 ? BRASS_HI : (x + z) % 2 ? shade(BRASS, 0.88) : brass(x, y, z));
  for (let z = Z0 + 6; z < Z1 - 3; z += 6) for (const x of [X0, X1 - 1]) for (let y = 30; y < 80; y++) {
    g.set(x, y, z, bar(x, y, z)); g.set(x + 1, y, z, bar(x + 1, y, z)); g.set(x, y, z + 1, bar(x, y, z + 1)); g.set(x + 1, y, z + 1, bar(x + 1, y, z + 1));
  }
  for (let x = X0 + 6; x < X1 - 3; x += 6) for (let y = 8; y < 80; y++) {
    g.set(x, y, Z0, bar(x, y, Z0)); g.set(x + 1, y, Z0, bar(x + 1, y, Z0)); g.set(x, y, Z0 + 1, bar(x, y, Z0 + 1)); g.set(x + 1, y, Z0 + 1, bar(x + 1, y, Z0 + 1));
  }
  // ---- filigree band: rings with a bead, front ones above the gate
  for (let x = X0 + 8; x < X1 - 6; x += 12) {
    for (const z of [Z0, Z1]) {
      ringXY(g, x + 0.5, 70.5, z, 4.6, (xx, yy) => (yy > 70 && xx < x ? BRASS_HI : BRASS));
      g.set(x, 70, z, BRASS_HI); g.set(x + 1, 70, z, BRASS_HI); g.set(x, 71, z, BRASS_HI); g.set(x + 1, 71, z, BRASS);
    }
  }
  for (let z = Z0 + 8; z < Z1 - 6; z += 12) for (const x of [X0, X1]) {
    ringZY(g, x, z + 0.5, 70.5, 4.6, (zz, yy) => (yy > 70 ? BRASS_HI : BRASS));
    g.set(x, 70, z, BRASS_HI); g.set(x, 71, z, BRASS_HI);
  }
  // ---- roof: dark underside, brass plate with a bright lip, dentils under the overhang, corner finials
  g.box(0, 82, 0, GW, 4, GD, (x, y, z) => {
    if (y === 82) return 0x4a3a2e;
    const edge = x === 0 || x === GW - 1 || z === 0 || z === GD - 1;
    return edge ? (y === 85 ? BRASS_HI : BRASS) : y === 85 ? brass(x, y, z) : BRASS_LO;
  });
  for (let x = 0; x < GW; x += 3) { g.set(x, 81, 0, BRASS_LO); g.set(x, 81, GD - 1, BRASS_LO); }
  for (let z = 0; z < GD; z += 3) { g.set(0, 81, z, BRASS_LO); g.set(GW - 1, 81, z, BRASS_LO); }
  for (const [x, z] of [[2, 2], [GW - 3, 2], [2, GD - 3], [GW - 3, GD - 3]]) {
    g.ellipsoid(x + 0.5, 88, z + 0.5, 1.8, 2, 1.8, (xx, y) => (y > 88 ? BRASS_HI : BRASS));
    g.box(x, 86, z, 1, 1, 1, BRASS_LO);
  }
  // ---- dome with ribs, a finial and the cable ring
  const cx = GW / 2, cz = GD / 2;
  g.ellipsoid(cx, 86, cz, 28, 16, 22, (x, y, z, dx, dy, dz) => {
    if (dy < 0) return -1;
    const ang = Math.atan2(dz, dx);
    if (Math.abs(Math.sin(ang * 4)) < 0.12) return y > 94 ? BRASS_HI : shade(BRASS_HI, 0.92);
    if (dy < 0.12) return BRASS_LO; // a darker skirt where the dome meets the roof
    const lit = dx < 0 && dy > 0.5;
    return lit ? mixHex(BRASS, BRASS_HI, 0.45) : brass(x, y, z);
  });
  g.box(Math.floor(cx) - 2, 102, Math.floor(cz) - 2, 4, 3, 4, BRASS_LO);
  g.ellipsoid(cx, 106.5, cz, 2.4, 2.6, 2.4, (x, y) => (y > 106 ? BRASS_HI : BRASS));
  ringXY(g, cx, 112, Math.floor(cz), 3.2, 0x5a5050, 1.4);
  // ---- the sun crest on the front of the dome: rays, a warm disc, a ruby with a glint
  const sz = GD - 2;
  const scy = 94;
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    const long = a % 2 === 0;
    for (let r = 7.6; r < (long ? 13 : 10.5); r += 0.5) {
      const x = cx - 0.5 + Math.cos(t) * r, y = scy + Math.sin(t) * r * 0.9;
      g.set(x, y, sz, long ? (r > 11.5 ? 0xffe066 : 0xffc030) : 0xffb020);
      g.set(x, y, sz - 1, BRASS_LO);
    }
  }
  for (let x = -7; x <= 7; x++) for (let y = -7; y <= 7; y++) {
    const d2 = x * x + y * y;
    if (d2 > 50) continue;
    const c = d2 <= 6 ? (d2 <= 1 && x <= 0 && y >= 0 ? 0xffd0d0 : d2 <= 2 ? 0xf04a4a : 0xc02a2a) : d2 > 38 ? 0xffb020 : x < 0 && y > 0 ? 0xffe680 : 0xffd040;
    g.set(cx - 0.5 + x, scy + y, sz + 1, c);
    g.set(cx - 0.5 + x, scy + y, sz, BRASS_LO);
  }
  g.set(cx - 2.5, scy + 2, sz + 1, 0xffffff);
  return g;
}

function buildSeat() {
  const g = new VoxelGrid(W, 58, 28);
  // bench body: velvet front with a brass kick plate and piping
  g.box(8, 6, 6, W - 16, 14, 18, (x, y, z) => {
    if (y <= 7) return y === 6 ? BRASS_DK : BRASS_LO;
    if (z === 23) return y % 6 === 2 ? BRASS : (x % 8 === 0 ? VELVET_DEEP : shade(VELVET_DK, 0.92)); // pleated front
    return VELVET_DK;
  });
  // cushion: rounded front edge, piping, a soft sheen
  g.box(8, 20, 4, W - 16, 4, 21, (x, y, z) => {
    if (z === 24 && y === 23) return -1; // round the front edge
    if (y === 20 || z === 24) return VELVET_DK;
    if (y === 23 && z === 23) return VELVET_HI; // piping catches the light
    if (y === 23 && (x + z) % 10 === 0) return VELVET_DK; // stitch dimples
    return jitf(y === 23 ? mixHex(VELVET, VELVET_HI, 0.35) : VELVET, x >> 1, y, z >> 1, 7, 0.04);
  });
  // tufted backrest: diamond tufting with buttons, creases and puffy centres
  g.box(8, 24, 4, W - 16, 28, 6, (x, y, z) => {
    const u = x - 8, v = y - 24;
    const a = (u + v) % 8, b = (u - v + 80) % 8;
    if (a === 0 && b === 0) return z >= 8 ? 0xffd060 : VELVET_DEEP; // gold buttons
    const crease = a === 0 || b === 0;
    if (z === 9) {
      if (crease) return -1; // creases sink in
      const da = Math.min(a, 8 - a), db = Math.min(b, 8 - b);
      if (da + db <= 3) return -1; // panels dome up toward their centres only
      return da + db >= 6 ? VELVET_HI : VELVET;
    }
    if (crease) return VELVET_DEEP;
    return jitf(VELVET, x >> 1, y >> 1, z, 9, 0.04);
  });
  // carved brass top rail with a little crest
  g.box(6, 52, 4, W - 12, 2, 6, (x, y) => (y === 53 ? BRASS_HI : BRASS));
  for (let x = 10; x < W - 10; x += 8) { g.set(x, 54, 6, BRASS_HI); g.set(x + 1, 54, 6, BRASS); }
  g.ellipsoid(W / 2, 55, 6.5, 3, 2.4, 1.5, (x, y) => (y > 55 ? BRASS_HI : BRASS));
  // arms: brass-capped velvet bolsters
  for (const x of [6, W - 8]) {
    g.box(x, 6, 4, 2, 24, 20, (xx, y, z) => (y >= 28 ? (y === 29 ? BRASS_HI : BRASS) : z === 23 ? BRASS_LO : VELVET_DK));
    g.box(x, 30, 20, 2, 2, 4, BRASS_HI); // scroll ends
  }
  return g;
}

function buildLamp() {
  const f = new VoxelGrid(14, 24, 14);
  const gl = new VoxelGrid(14, 24, 14);
  for (let y = 12; y < 24; y++) { f.set(6, y, 6, 0x4a4040); f.set(7, y, 7, 0x3a3030); }
  f.box(2, 10, 2, 10, 2, 10, (x, y) => (y === 11 ? BRASS_HI : BRASS)); // cap
  f.box(4, 12, 4, 6, 1, 6, BRASS_LO);
  f.box(2, 0, 2, 10, 2, 10, (x, y) => (y === 0 ? BRASS_LO : BRASS)); // base
  for (const [x, z] of [[2, 2], [10, 2], [2, 10], [10, 10]]) f.box(x, 2, z, 2, 8, 2, BRASS);
  gl.box(4, 2, 4, 6, 8, 6, (x, y, z) => (y >= 5 && y <= 6 && x >= 6 && x <= 7 ? 0xffffff : y > 7 ? 0xffd070 : 0xffe9a0));
  return { f, gl };
}

/**
 * Build the cage. Returns { root, setGate(k 0=open..1=closed), seatY, seatZ, frontZ, halfW, floorY, lampGlow, lampPos }
 * Origin: centre of the floor's underside. Front (gate) faces +z.
 */
export function makeCage() {
  const root = new THREE.Group();
  root.name = 'surface-express';
  root.add(voxMesh(buildFrame(), { pivot: [GW / 2, 0, GD / 2], scale: S }));
  const seat = voxMesh(buildSeat(), { pivot: [W / 2, 0, 0], scale: S });
  seat.position.set(0, 0, (M - GD / 2) * S);
  root.add(seat);
  const lamp = buildLamp();
  const lampF = voxMesh(lamp.f, { pivot: [7, 24, 7], scale: S });
  const lampG = voxMesh(lamp.gl, { pivot: [7, 24, 7], scale: S, kind: 'basic', outline: false });
  const lampPos = new THREE.Vector3(0, 82 * S, 0.12);
  lampF.position.copy(lampPos);
  lampG.position.copy(lampPos);
  root.add(lampF, lampG);
  const lampGlow = makeGlow({ color: 0xffd070, size: 1.3, intensity: 0.55, levels: 4 });
  lampGlow.position.copy(lampPos).add(new THREE.Vector3(0, -18 * S, 0));
  root.add(lampGlow);

  // sliding gate: slim brass bars with knobs that bunch up on the left when open
  const barG = new VoxelGrid(2, 54, 2);
  for (let y = 0; y < 52; y++) for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) barG.set(x, y, z, y % 10 === 0 ? BRASS_HI : x === 0 && z === 1 ? BRASS_HI : brass(x, y, z));
  barG.box(0, 52, 0, 2, 2, 2, BRASS_HI);
  // the gate's bars and lattice are instanced: two draws however many bars there are
  const N = 8;
  const zFront = (GD / 2 - 1) * S; // just in front of the front rail (same world z as the old cage)
  const barMesh = voxMesh(barG, { pivot: [1, 0, 1], scale: S });
  const bars = new THREE.InstancedMesh(barMesh.geometry, barMesh.material, N);
  bars.layers.mask = barMesh.layers.mask;
  bars.frustumCulled = false;
  root.add(bars);
  // diagonal lattice pieces between the bars (only visible when closed)
  const latG = new VoxelGrid(8, 8, 1);
  for (let i = 0; i < 8; i++) { latG.set(i, i, 0, BRASS_LO); latG.set(i, 7 - i, 0, BRASS_LO); }
  latG.set(3, 3, 0, BRASS_HI); latG.set(4, 4, 0, BRASS_HI); latG.set(3, 4, 0, BRASS_HI); latG.set(4, 3, 0, BRASS_HI);
  const latMesh = voxMesh(latG, { pivot: [4, 4, 0.5], scale: S });
  const lattice = new THREE.InstancedMesh(latMesh.geometry, latMesh.material, N - 1);
  lattice.layers.mask = latMesh.layers.mask;
  lattice.frustumCulled = false;
  root.add(lattice);
  const S16 = 1 / 16;
  const xLeft = (-W / 4 + 2.5) * S16, xRight = (W / 4 - 2.5) * S16;
  const bx = new Float32Array(N);
  const m4 = new THREE.Matrix4();
  const setGate = (k) => {
    k = Math.max(0, Math.min(1, k));
    for (let i = 0; i < N; i++) {
      const open = xLeft - 1.5 * S16 + i * 0.42 * S16; // folded up against the left post
      const closed = xLeft + (i / (N - 1)) * (xRight - xLeft);
      bx[i] = open + (closed - open) * k;
      bars.setMatrixAt(i, m4.makeTranslation(bx[i], 8 * S, zFront));
    }
    bars.instanceMatrix.needsUpdate = true;
    lattice.visible = k > 0.85;
    if (lattice.visible) {
      for (let i = 0; i < N - 1; i++) {
        const sx = Math.max(0.2, (bx[i + 1] - bx[i]) / (8 * S));
        lattice.setMatrixAt(i, m4.makeScale(sx, 1, 1).setPosition((bx[i] + bx[i + 1]) / 2, 16 * S, zFront - 0.4 * S));
      }
      lattice.instanceMatrix.needsUpdate = true;
    }
  };
  setGate(0);

  // cable up into the dark
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.05, 60, 0.05), new THREE.MeshBasicMaterial({ color: 0x2a2228 }));
  cable.position.set(0, 110 * S + 30, 0);
  root.add(cable);

  return {
    root,
    cable,
    setGate,
    lampGlow,
    lampPos: lampPos.clone().add(new THREE.Vector3(0, -18 * S, 0)),
    // where riders sit (local): seat top height and z of the cushion centre
    seatY: 24 * S,
    seatZ: (M + 14 - GD / 2) * S,
    frontZ: zFront,
    halfW: (W / 2) * S,
    floorY: 6 * S,
  };
}
