// The Surface Express: an ornate brass lift cage with a red velvet seat, a sliding gate,
// a little lamp and a sun crest. Built at character scale (1 voxel = 1/16 unit).
import * as THREE from 'three';
import { VoxelGrid, voxMesh, jitf, hash3 } from './vox.js';
import { makeGlow } from './fx.js';
import { mixHex, shade } from '../core/util.js';

const S = 1 / 16;
const W = 36, D = 28;
const BRASS = 0xd9a83a, BRASS_HI = 0xffe08a, BRASS_LO = 0x9a6a1a;
const VELVET = 0xb0283a, VELVET_DK = 0x7a1426, VELVET_HI = 0xd84050;
const WOOD = 0x6b4426, WOOD_DK = 0x4a2e18;

function brass(x, y, z) {
  const h = hash3(x, y, z, 31);
  return h < 0.12 ? BRASS_HI : h > 0.9 ? shade(BRASS, 0.85) : BRASS;
}

/** Draw a ring (circle outline) in the XY plane at depth z. */
function ringXY(g, cx, cy, z, r, c) {
  for (let a = 0; a < 40; a++) {
    const t = (a / 40) * Math.PI * 2;
    g.set(cx + Math.cos(t) * r, cy + Math.sin(t) * r, z, c);
  }
}
/** Ring in the ZY plane at x. */
function ringZY(g, x, cz, cy, r, c) {
  for (let a = 0; a < 40; a++) {
    const t = (a / 40) * Math.PI * 2;
    g.set(x, cy + Math.sin(t) * r, cz + Math.cos(t) * r, c);
  }
}

function buildFrame() {
  const g = new VoxelGrid(W + 2, 58, D + 2);
  const o = 1; // margin for the overhanging roof
  const X0 = o, X1 = o + W - 1, Z0 = o, Z1 = o + D - 1;
  // floor: iron base + planks with a brass rim
  g.box(X0, 0, Z0, W, 1, D, 0x3a3030);
  g.box(X0, 1, Z0, W, 2, D, (x, y, z) => {
    if (x === X0 || x === X1 || z === Z0 || z === Z1) return brass(x, y, z);
    return jitf(((z - Z0) >> 2) % 2 ? WOOD : shade(WOOD, 0.88), x, y, z, 3, 0.05);
  });
  // corner posts
  for (const x of [X0, X1 - 1]) for (const z of [Z0, Z1 - 1]) g.box(x, 3, z, 2, 38, 2, (xx, y, zz) => ((y % 6) === 0 ? BRASS_HI : brass(xx, y, zz)));
  // rails around the sides & back
  const rails = [3, 15, 30, 40];
  for (const y of rails) {
    for (let x = X0; x <= X1; x++) { g.set(x, y, Z0, brass(x, y, Z0)); }
    for (let z = Z0; z <= Z1; z++) { g.set(X0, y, z, brass(X0, y, z)); g.set(X1, y, z, brass(X1, y, z)); }
  }
  // lower side panels: dark wood with brass trim
  for (const x of [X0, X1]) g.box(x, 4, Z0 + 2, 1, 11, D - 4, (xx, y, z) => (y === 4 || y === 14 ? BRASS_LO : jitf(((z >> 2) % 2) ? 0x5a2a1a : 0x4e2416, xx, y, z, 5, 0.05)));
  // bars on the sides and back
  for (let z = Z0 + 3; z < Z1 - 1; z += 3) for (const x of [X0, X1]) for (let y = 15; y < 40; y++) g.set(x, y, z, brass(x, y, z));
  for (let x = X0 + 3; x < X1 - 1; x += 3) for (let y = 4; y < 40; y++) g.set(x, y, Z0, brass(x, y, Z0));
  // ornamental rings in the upper band (front ones sit above the gate)
  for (let x = X0 + 4; x < X1 - 3; x += 6) { ringXY(g, x + 0.5, 35, Z0, 2.4, BRASS_HI); ringXY(g, x + 0.5, 35, Z1, 2.4, BRASS_HI); }
  for (let z = Z0 + 4; z < Z1 - 3; z += 6) { ringZY(g, X0, z + 0.5, 35, 2.4, BRASS_HI); ringZY(g, X1, z + 0.5, 35, 2.4, BRASS_HI); }
  // front: header above the gate + gate tracks
  for (let x = X0; x <= X1; x++) { g.set(x, 40, Z1, brass(x, 40, Z1)); g.set(x, 30, Z1, brass(x, 30, Z1)); g.set(x, 3, Z1, BRASS_LO); }
  // roof plate (overhangs)
  g.box(0, 41, 0, W + 2, 2, D + 2, (x, y, z) => (y === 41 ? 0x5a4a3a : (x === 0 || x === W + 1 || z === 0 || z === D + 1) ? BRASS_HI : brass(x, y, z)));
  // dome with ribs
  const cx = (W + 2) / 2, cz = (D + 2) / 2;
  g.ellipsoid(cx, 43, cz, 14, 8, 11, (x, y, z, dx, dy, dz) => {
    if (dy < 0) return -1;
    const ang = Math.atan2(dz, dx);
    const rib = Math.abs(Math.sin(ang * 4)) < 0.18;
    if (rib) return BRASS_HI;
    return y > 48 ? shade(BRASS, 1.08) : brass(x, y, z);
  });
  g.box(Math.floor(cx) - 1, 51, Math.floor(cz) - 1, 2, 2, 2, BRASS_HI); // finial
  ringXY(g, cx, 54.5, Math.floor(cz), 1.6, 0x5a5050); // cable ring
  // the sun crest on the front of the dome
  const sz = D + 1;
  const scy = 47;
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2;
    for (let r = 3.6; r < 6.2; r += 0.5) g.set(cx - 0.5 + Math.cos(t) * r, scy + Math.sin(t) * r * 0.9, sz - 1, a % 2 ? 0xffc030 : 0xffe066);
  }
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) if (x * x + y * y <= 10) g.set(cx - 0.5 + x, scy + y, sz, x * x + y * y <= 2 ? 0xe03a3a : 0xffd040);
  g.set(cx - 0.5 - 1, scy + 1, sz, 0xffffff);
  return g;
}

function buildSeat() {
  const g = new VoxelGrid(W, 28, 14);
  // bench body
  g.box(4, 3, 3, W - 8, 7, 9, (x, y, z) => (y === 3 ? BRASS_LO : z === 11 ? (y % 3 === 0 ? BRASS : shade(VELVET_DK, 0.9)) : VELVET_DK));
  // cushion
  g.box(4, 10, 2, W - 8, 2, 10, (x, y, z) => {
    if (y === 11 && (x + z) % 5 === 0) return VELVET_DK;
    return jitf(y === 11 ? VELVET_HI : VELVET, x, y, z, 7, 0.05);
  });
  // tufted backrest
  g.box(4, 12, 2, W - 8, 14, 3, (x, y, z) => {
    const u = x - 4, v = y - 12;
    if ((u + v) % 4 === 0 && (u - v + 40) % 4 === 0) return 0xffd060; // gold buttons
    if ((u + v) % 4 === 0 || (u - v + 40) % 4 === 0) return VELVET_DK;
    return jitf(VELVET, x, y, z, 9, 0.05);
  });
  // carved brass top edge + arms
  g.box(3, 26, 2, W - 6, 1, 3, BRASS);
  for (let x = 6; x < W - 6; x += 4) g.set(x, 27, 3, BRASS_HI);
  for (const x of [3, W - 4]) g.box(x, 3, 2, 1, 13, 10, (xx, y, z) => (y === 15 ? BRASS_HI : BRASS));
  return g;
}

function buildLamp() {
  const f = new VoxelGrid(7, 12, 7);
  const gl = new VoxelGrid(7, 12, 7);
  for (let y = 6; y < 12; y++) f.set(3, y, 3, 0x4a4040);
  f.box(1, 5, 1, 5, 1, 5, BRASS);
  f.box(1, 0, 1, 5, 1, 5, BRASS);
  for (const [x, z] of [[1, 1], [5, 1], [1, 5], [5, 5]]) f.box(x, 1, z, 1, 4, 1, BRASS);
  gl.box(2, 1, 2, 3, 4, 3, (x, y) => (y === 2 ? 0xffffff : 0xffe080));
  return { f, gl };
}

/**
 * Build the cage. Returns { root, setGate(k 0=open..1=closed), seat: {y, z}, lampGlow, lampLocal }
 * Origin: centre of the floor's underside. Front (gate) faces +z.
 */
export function makeCage() {
  const root = new THREE.Group();
  root.name = 'surface-express';
  const pivot = [(W + 2) / 2, 0, (D + 2) / 2];
  root.add(voxMesh(buildFrame(), { pivot, scale: S }));
  const seat = voxMesh(buildSeat(), { pivot: [W / 2, 0, 0], scale: S });
  seat.position.set(0, 0, (1 - (D + 2) / 2) * S);
  root.add(seat);
  const lamp = buildLamp();
  const lampF = voxMesh(lamp.f, { pivot: [3.5, 12, 3.5], scale: S });
  const lampG = voxMesh(lamp.gl, { pivot: [3.5, 12, 3.5], scale: S, kind: 'basic', outline: false });
  const lampPos = new THREE.Vector3(0, 41 * S, 0.12);
  lampF.position.copy(lampPos);
  lampG.position.copy(lampPos);
  root.add(lampF, lampG);
  const lampGlow = makeGlow({ color: 0xffd070, size: 1.3, intensity: 0.55, levels: 4 });
  lampGlow.position.copy(lampPos).add(new THREE.Vector3(0, -9 * S, 0));
  root.add(lampGlow);

  // sliding gate: brass bars that bunch up on the left when open
  const barG = new VoxelGrid(1, 26, 1);
  for (let y = 0; y < 26; y++) barG.set(0, y, 0, y % 5 === 0 ? BRASS_HI : brass(0, y, 0));
  const bars = [];
  const N = 10;
  const zFront = (D + 1 - (D + 2) / 2 + 0.5) * S;
  for (let i = 0; i < N; i++) {
    const b = voxMesh(barG, { pivot: [0.5, 0, 0.5], scale: S });
    b.position.set(0, 4 * S, zFront);
    root.add(b);
    bars.push(b);
  }
  // diagonal lattice pieces between the bars (only visible when closed)
  const latG = new VoxelGrid(4, 4, 1);
  for (let i = 0; i < 4; i++) { latG.set(i, i, 0, BRASS_LO); latG.set(i, 3 - i, 0, BRASS_LO); }
  const lattice = [];
  for (let i = 0; i < N - 1; i++) {
    const l = voxMesh(latG, { pivot: [2, 2, 0.5], scale: S });
    l.position.set(0, 9 * S, zFront - 0.2 * S);
    root.add(l);
    const l2 = voxMesh(latG, { pivot: [2, 2, 0.5], scale: S });
    l2.position.set(0, 21 * S, zFront - 0.2 * S);
    root.add(l2);
    lattice.push(l, l2);
  }
  const xLeft = (-W / 2 + 2.5) * S, xRight = (W / 2 - 2.5) * S;
  const setGate = (k) => {
    k = Math.max(0, Math.min(1, k));
    for (let i = 0; i < N; i++) {
      const open = xLeft + i * 1.0 * S;
      const closed = xLeft + (i / (N - 1)) * (xRight - xLeft);
      bars[i].position.x = open + (closed - open) * k;
    }
    for (let i = 0; i < N - 1; i++) {
      const a = bars[i].position.x, b = bars[i + 1].position.x;
      const show = k > 0.85;
      for (const l of [lattice[i * 2], lattice[i * 2 + 1]]) {
        l.visible = show;
        l.position.x = (a + b) / 2;
        l.scale.x = Math.max(0.2, (b - a) / (4 * S));
      }
    }
  };
  setGate(0);

  // cable up into the dark
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.05, 60, 0.05), new THREE.MeshBasicMaterial({ color: 0x2a2228 }));
  cable.position.set(0, 55 * S + 30, 0);
  root.add(cable);

  return {
    root,
    setGate,
    lampGlow,
    lampPos: lampPos.clone().add(new THREE.Vector3(0, -9 * S, 0)),
    // where riders sit (local): seat top height and z of the cushion centre
    seatY: 12 * S,
    seatZ: (1 + 7 - (D + 2) / 2) * S,
    frontZ: zFront,
    halfW: (W / 2) * S,
    floorY: 3 * S,
  };
}
