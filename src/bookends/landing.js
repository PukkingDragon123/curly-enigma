// Ending phase 1: the farewell at Deep Town's Surface Express landing.
import * as THREE from 'three';
import { VoxelGrid, voxMesh, jitf, hash3 } from './vox.js';
import { makeLantern, makeMushrooms, makeRock, S16 } from './props.js';
import { Particles, SHAPE, makeGlow, makeBlobShadow, fitFov } from './fx.js';
import { signTexture } from './pixfont.js';
import { PixelCanvas, pixelTexture } from '../gfx/PixelArt.js';
import { makeFolk } from './actors.js';
import { randomSpec } from '../gfx/characters.js';
import { SHOPS } from '../data/shops.js';
import { makeNoise2D, makeRng, shade, clamp } from '../core/util.js';

const VS = 1 / 8;
export const LIFT_X = 4.4;

function platform(textures) {
  // the boardwalk is a lit pixel-art texture (cheap) with a chunky voxel brass edge
  const x0 = -11.5, x1 = 10.5, z0 = -6.8, z1 = 5.6;
  const W = Math.round((x1 - x0) * 8), D = Math.round((z1 - z0) * 8);
  const pc = new PixelCanvas(W, D);
  for (let z = 0; z < D; z++) {
    const plank = Math.floor(z / 3);
    const seam = z % 3 === 2;
    const off = (plank * 37) % 23;
    for (let x = 0; x < W; x++) {
      let c = plank % 2 ? 0x8a5a32 : 0x7a4e2c;
      if (seam) c = 0x3a2416;
      else if ((x + off) % 46 === 0) c = 0x4a2e18; // plank ends
      else if (((x + off) % 46 === 3 || (x + off) % 46 === 42) && z % 3 === 1) c = 0x5a3a22; // nails
      else if (hash3(x, z, 0, 5) < 0.08) c = plank % 2 ? 0x94643a : 0x845634;
      pc.set(x, z, c);
    }
  }
  const tex = pixelTexture(pc.commit());
  textures.push(tex);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshToonMaterial({ map: tex, gradientMap: null }));
  top.rotation.x = -Math.PI / 2;
  top.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const grp = new THREE.Group();
  grp.add(top);
  // brass-trimmed front edge
  const nx = Math.round((x1 - x0) / VS);
  const e = new VoxelGrid(nx, 4, 2);
  for (let i = 0; i < nx; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 2; k++) e.set(i, j, k, j === 3 ? ((i % 6 === 0) ? 0xffe08a : 0xc8902a) : 0x2a1a12);
  const edge = voxMesh(e, { scale: VS, pivot: [-x0 / VS, 4, 2] });
  edge.position.z = z1 + VS * 2;
  grp.add(edge);
  return { mesh: grp };
}

function backWall() {
  const x0 = -12.5, x1 = 11.5, y0 = -0.5, y1 = 9.5, z0 = -9.6, z1 = -7.3;
  const nx = Math.round((x1 - x0) / VS), ny = Math.round((y1 - y0) / VS), nz = Math.round((z1 - z0) / VS);
  const g = new VoxelGrid(nx, ny, nz);
  const n = makeNoise2D(5), n2 = makeNoise2D(9);
  const bands = [0x4a3428, 0x3e2c22, 0x54392a, 0x36261e, 0x4a3a30];
  for (let i = 0; i < nx; i++) {
    const x = x0 + (i + 0.5) * VS;
    for (let j = 0; j < ny; j++) {
      const y = y0 + (j + 0.5) * VS;
      // the shaft opening above the lift
      const inShaft = Math.abs(x - LIFT_X) < 1.5 && y > 6.2;
      const relief = 0.6 + n(x * 0.3, y * 0.3) * 0.9 + (y > 6 ? (y - 6) * 0.4 : 0);
      const front = z1 - Math.max(0, relief);
      for (let k = 0; k < nz; k++) {
        const z = z0 + (k + 0.5) * VS;
        if (z > front) continue;
        if (inShaft && z > z0 + 0.6) continue;
        const b = Math.floor((y + n(x * 0.2, 3) * 0.6) / 0.7);
        let c = bands[((b % bands.length) + bands.length) % bands.length];
        if (hash3(i, j, k, 4) < 0.05) c = 0x6a6058;
        if (y > 4.5 && n2(x * 0.5 + 9, y * 0.5) > 0.25) c = hash3(i, j, k, 6) < 0.5 ? 0x3e5a2e : 0x4a6a34;
        g.set(i, j, k, jitf(c, i, j, k, 2, 0.07));
      }
    }
  }
  return voxMesh(g, { scale: VS, pivot: [-x0 / VS, -y0 / VS, -z0 / VS], solid: { nz: true, ny: true, py: true, nx: true, px: true }, outline: false });
}

/** A little Deep Town house facade (box with roof and glowing windows). */
function house(seed, w, h, color, roof) {
  const rng = makeRng(seed);
  const g = new VoxelGrid(w + 2, h + 8, 8);
  const gl = new VoxelGrid(w + 2, h + 8, 8);
  g.box(1, 0, 1, w, h, 6, (x, y, z) => jitf(((x + y) % 7 === 0) ? shade(color, 0.85) : color, x, y, z, seed, 0.06));
  for (let y = 0; y < 7; y++) g.box(1 + y, h + y, 0, Math.max(0, w - y * 2), 1, 8, roof);
  // door
  g.box(Math.floor(w / 2), 0, 7, 2, 4, 1, 0x3a2416);
  // windows (glowing)
  const wins = rng.int(1, 3);
  for (let i = 0; i < wins; i++) {
    const wx = 2 + Math.floor(((i + 0.5) / wins) * (w - 4)), wy = rng.int(4, Math.max(4, h - 4));
    gl.box(wx, wy, 7, 2, 2, 1, rng.chance(0.5) ? 0xffd070 : 0xffb050);
    g.box(wx - 1, wy - 1, 6, 4, 4, 1, 0x3a2416);
  }
  const grp = new THREE.Group();
  grp.add(voxMesh(g, { scale: VS, pivot: [(w + 2) / 2, 0, 4] }));
  grp.add(voxMesh(gl, { scale: VS, pivot: [(w + 2) / 2, 0, 4], kind: 'basic', outline: false }));
  return grp;
}

/** A string of bunting flags along a sagging curve from a to b. */
function bunting(a, b, sag, seed) {
  const rng = makeRng(seed);
  const grp = new THREE.Group();
  const cols = [0xe0403a, 0xffd040, 0x4a8ae0, 0x5ab84a, 0xf6f0e0, 0xff8ad0];
  const flagG = cols.map((c) => {
    const g = new VoxelGrid(5, 6, 1);
    for (let y = 0; y < 6; y++) { const w = Math.max(0, Math.round((y + 1) * 5 / 6)); for (let x = 0; x < 5; x++) if (Math.abs(x - 2) <= w / 2) g.set(x, y, 0, c); }
    return g;
  });
  const N = Math.max(4, Math.round(a.distanceTo(b) / 0.42));
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2a1a12 }));
  grp.add(line);
  const flags = [];
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    const ci = (i + seed) % cols.length;
    const m = voxMesh(flagG[ci], { scale: S16 * 1.4, pivot: [2.5, 6, 0.5] });
    m.position.copy(p);
    m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    grp.add(m);
    flags.push({ m, ph: rng.range(0, 6) });
  }
  return { grp, flags };
}

function signMesh(lines, style, width) {
  const t = signTexture(lines, style);
  const h = width * (t.h / t.w);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, h), new THREE.MeshBasicMaterial({ map: t.texture, transparent: false }));
  return { mesh: m, texture: t.texture, h };
}

/**
 * Build the landing scene. ctx: {mole, hen, cage, textures, game}
 */
export function buildLanding(ctx) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120c12);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 120);
  const camBase = new THREE.Vector3(-0.35, 2.85, 12.2);
  const camLook = new THREE.Vector3(-0.35, 1.95, 0);
  camera.position.copy(camBase);
  camera.lookAt(camLook);
  const camQuat = camera.quaternion.clone();

  // lights
  scene.add(new THREE.HemisphereLight(0xffd0a8, 0x3a2420, 1.9));
  const key = new THREE.DirectionalLight(0xffe2c0, 0.9);
  key.position.set(-3, 8, 10);
  scene.add(key);
  const warm = new THREE.PointLight(0xffa050, 6, 14, 1.6);
  warm.position.set(-2.5, 3.2, 1.5);
  scene.add(warm);

  scene.add(platform(ctx.textures).mesh);
  scene.add(backWall());

  // Deep Town in the background
  const houses = [
    [-10.2, -5.6, 26, 22, 0x8a6a4a, 0x8a2a2a], [-6.9, -6.3, 20, 30, 0x7a5a4a, 0x3a4a6a], [-3.9, -5.7, 22, 18, 0x9a7a5a, 0x6a3a2a],
    [-1.0, -6.2, 18, 26, 0x6a5a4a, 0x2a5a4a], [8.8, -5.6, 20, 20, 0x8a6a4a, 0x7a2a3a],
  ];
  houses.forEach(([x, z, w, h, c, r], i) => {
    const hs = house(40 + i, w, h, c, r);
    hs.position.set(x, 0, z);
    scene.add(hs);
  });

  // the lift tower: two pillars behind the cage, a lintel and the sign
  const tower = new VoxelGrid(44, 72, 6);
  for (const x0 of [0, 40]) tower.box(x0, 0, 1, 4, 72, 4, (x, y, z) => (y % 8 === 0 ? 0xffe08a : (x + z) % 3 ? 0xc8902a : 0xa8741a));
  tower.box(0, 33, 1, 44, 3, 4, (x, y) => (y === 34 ? 0xffe08a : 0xb8801e));
  for (let x = 4; x < 40; x += 4) for (let y = 36; y < 72; y++) if ((x + y) % 8 === 0) tower.set(x, y, 2, 0x8a5a14);
  const towerMesh = voxMesh(tower, { scale: VS, pivot: [22, 0, 3] });
  towerMesh.position.set(LIFT_X, 0, -1.6);
  scene.add(towerMesh);
  const sign = signMesh(['SURFACE EXPRESS'], { bg: 0x5a1a22, border2: 0xe0b040, text: 0xffe070 }, 4.4);
  sign.mesh.position.set(LIFT_X, 5.05, -1.18);
  scene.add(sign.mesh);
  ctx.textures.push(sign.texture);

  // the farewell banner the townsfolk painted
  const banner = signMesh(['BON VOYAGE!', 'WE ♥ YOU'], { bg: 0xf3e2bf, border: 0x6b4226, border2: 0xd6b97f, text: 0xc94a3a, shadow: 0xe8c890, grain: 0xe8d2a8, rivet: 0x6b4226 }, 3.6);
  banner.mesh.position.set(-5.3, 3.75, -3.05);
  banner.mesh.rotation.z = 0.02;
  for (const bx of [-7.15, -3.45]) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.3, 0.1), new THREE.MeshLambertMaterial({ color: 0x6b4226 }));
    pole.position.set(bx, 2.15, -3.1);
    scene.add(pole);
  }
  scene.add(banner.mesh);
  ctx.textures.push(banner.texture);

  // lantern posts + glows
  const glows = [];
  for (const [x, z] of [[-9.4, -2.9], [-1.4, -3.4], [1.9, -2.3], [7.8, -2.6]]) {
    const l = makeLantern({ post: 40 });
    l.group.position.set(x, 0, z);
    scene.add(l.group);
    const gl = makeGlow({ color: 0xffb860, size: 1.9, intensity: 0.5, levels: 4 });
    gl.position.copy(l.group.position).add(l.glowPos);
    scene.add(gl);
    glows.push(gl);
  }

  // bunting
  const buntings = [
    bunting(new THREE.Vector3(LIFT_X - 2.6, 4.3, -1.35), new THREE.Vector3(-1.4, 3.25, -3.3), 0.45, 1),
    bunting(new THREE.Vector3(-1.4, 3.25, -3.3), new THREE.Vector3(-9.4, 3.25, -2.8), 0.7, 3),
    bunting(new THREE.Vector3(LIFT_X + 2.4, 4.3, -1.35), new THREE.Vector3(7.8, 3.25, -2.5), 0.3, 5),
  ];
  for (const b of buntings) scene.add(b.grp);

  // mushrooms & rocks for the corners
  for (const [x, z, seed, sc] of [[-9.6, 2.6, 3, 1.3], [8.6, 2.2, 7, 1.1], [-8.2, -4.0, 11, 0.9], [6.6, 4.6, 13, 0.9]]) {
    const m = makeMushrooms(seed, { n: 4, scale: sc });
    m.group.position.set(x, 0, z);
    scene.add(m.group);
    const gl = makeGlow({ color: 0x3aa0ff, size: 1.4 * sc, intensity: 0.3, levels: 4 });
    gl.position.set(x, 0.55 * sc, z);
    scene.add(gl);
  }
  const rock = makeRock(14, { w: 20, h: 12, d: 14, color: 0x6a5a50, moss: 0.3 });
  rock.position.set(7.6, 0, 3.4);
  scene.add(rock);

  // ---------------------------------------------------------------- the crowd
  const crowd = [];
  const spots = [
    { p: [2.45, 0.35], k: 'ticket' },
    { p: [-0.55, 0.55], k: 'grocer' },
    { p: [-2.55, 0.15], k: 'tools' },
    { p: [-5.0, 0.4], k: 'assay' },
    { p: [0.65, -0.85] }, { p: [-1.5, -1.1] }, { p: [-3.6, -1.35] }, { p: [-5.9, -1.6] },
    { p: [-4.0, 1.45], kid: true }, { p: [-6.6, 0.0] }, { p: [-1.75, 1.75], kid: true }, { p: [0.35, 1.6], kid: true },
  ];
  spots.forEach((s, i) => {
    let spec;
    if (s.k) spec = { ...SHOPS[s.k].keeper };
    else spec = randomSpec(9100 + i * 37, s.kid ? { age: 'kid' } : {});
    const rig = makeFolk(spec);
    rig.root.position.set(s.p[0], 0, s.p[1]);
    rig.play(i % 3 === 0 ? 'cheer' : 'wave');
    rig.t = Math.random() * 5;
    scene.add(rig.root);
    const sh = makeBlobShadow(0.42, 0.3, 0.42);
    sh.position.set(s.p[0], 0.01, s.p[1]);
    scene.add(sh);
    crowd.push({ rig, name: spec.name || null, keeper: !!s.k, home: new THREE.Vector3(s.p[0], 0, s.p[1]) });
  });

  // the travellers
  const { mole, hen, cage } = ctx;
  const confetti = new Particles({ max: 420, additive: false });
  scene.add(confetti.points);
  const sparks = new Particles({ max: 80, additive: true });
  scene.add(sparks.points);

  const moleShadow = makeBlobShadow(0.5, 0.36, 0.45);
  const henShadow = makeBlobShadow(0.28, 0.22, 0.45);
  scene.add(moleShadow, henShadow);

  const state = { t: 0, cageY: 0 };
  const events = new Set();

  const enter = () => {
    scene.add(cage.root, mole.root, hen.root);
    events.clear();
    cage.root.visible = true;
    cage.lampGlow.visible = true;
    if (cage.cable) cage.cable.visible = true;
    cage.root.position.set(LIFT_X, -cage.floorY, 0);
    cage.root.rotation.set(0, 0, 0);
    cage.setGate(0);
    mole.root.position.set(1.45, 0, 2.75);
    mole.face(-0.5, true);
    mole.play('wave');
    hen.root.position.set(2.2, 0, 3.25);
    hen.face(-0.6, true);
    hen.play('idle');
    state.t = 0;
    state.cageY = 0;
    camera.position.copy(camBase);
  };

  // choreography helpers
  const lerpPath = (pts, t) => {
    // pts: [[t, x, z], ...]
    if (t <= pts[0][0]) return { x: pts[0][1], z: pts[0][2], moving: false, dir: null };
    for (let i = 1; i < pts.length; i++) {
      const [t1, x1, z1] = pts[i];
      const [t0, x0, z0] = pts[i - 1];
      if (t <= t1) {
        const k = (t - t0) / Math.max(1e-6, t1 - t0);
        return { x: x0 + (x1 - x0) * k, z: z0 + (z1 - z0) * k, moving: x1 !== x0 || z1 !== z0, dir: Math.atan2(x1 - x0, z1 - z0) };
      }
    }
    const l = pts[pts.length - 1];
    return { x: l[1], z: l[2], moving: false, dir: null };
  };
  const seatX = { mole: -0.34, hen: 0.46 };
  const molePath = [[1.75, 1.45, 2.75], [3.3, LIFT_X + 0.15, 1.8], [4.05, LIFT_X + seatX.mole, 0.05]];
  const henPath = [[2.1, 2.2, 3.25], [3.75, LIFT_X + 0.7, 2.05], [4.5, LIFT_X + seatX.hen, 0.2]];

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  let heartT = 0.2;
  let confettiAcc = 0;
  const once = (k, t, fn) => { if (state.t >= t && !events.has(k)) { events.add(k); fn(); } };

  const burst = (x, y, z, n, up = 4.5) => {
    const cols = [0xe0403a, 0xffd040, 0x4a8ae0, 0x5ab84a, 0xf6f0e0, 0xff8ad0, 0xb06ae0];
    for (let i = 0; i < n; i++) {
      confetti.spawn({
        pos: [x, y, z], vel: [(Math.random() - 0.5) * 2.4, up * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 1.6],
        life: 2.6 + Math.random() * 1.6, color: cols[(Math.random() * cols.length) | 0], size: 2, shape: SHAPE.confetti,
        gravity: 3.2, drag: 1.6, spin: 6 + Math.random() * 8, wobble: 0.5, fadeIn: 0,
      });
    }
  };

  const update = (dt, api) => {
    const t = (state.t += dt);
    const audio = api.audio;
    // --- events
    once('bell', 0.25, () => { audio.play('bell'); api.say(crowd[0], 'All aboard the<br>Surface Express!', 2.4); });
    once('kid', 1.0, () => api.say(crowd[10], 'Bye, mole!!', 1.8));
    once('hazel', 1.9, () => api.say(crowd[1], 'Send us a seashell!', 2.0));
    once('cluck', 0.7, () => { audio.play('cluck', { n: 3 }); hen.flap(0.6); });
    once('burst0', 0.15, () => { burst(-1.5, 0.4, 2.8, 50); burst(-6.5, 0.4, 2.2, 40); audio.play('firework'); });
    once('gate', 4.75, () => audio.play('gate'));
    once('clunk', 5.45, () => audio.play('clunk', { vol: 0.8 }));
    once('bell2', 5.6, () => { audio.play('bell'); setTimeout(() => api.alive() && audio.play('bell'), 420); api.startLoop('elevator', 0.6); });
    once('cheer', 5.6, () => { for (const c of crowd) c.rig.play('cheer'); burst(2.6, 0.5, 2.0, 70, 5.5); burst(-3.0, 0.5, 2.6, 60, 5); audio.play('firework'); });
    once('grubb', 6.0, () => api.say(crowd[2], 'Don\'t forget us<br>down here!', 1.8));
    once('wave2', 6.05, () => { mole.doEmote('wave', 1.6); hen.flap(1.0); audio.play('bawk'); });

    // --- mole: wave, walk into the cage, hop onto the velvet seat
    if (t < 1.75) {
      mole.play('wave');
      mole.face(-0.5);
    } else if (t < 4.05) {
      const p = lerpPath(molePath, t);
      mole.root.position.set(p.x, 0, p.z);
      if (p.moving) { mole.play('walk'); mole.face(p.dir); }
    } else {
      if (mole.root.parent !== cage.root) { cage.root.attach(mole.root); state.moleFrom = mole.root.position.clone(); }
      const k = clamp((t - 4.05) / 0.35, 0, 1);
      mole.face(0);
      const f = state.moleFrom;
      const to = new THREE.Vector3(seatX.mole, cage.seatY - 2 * mole.s, cage.seatZ + 0.02);
      mole.root.position.lerpVectors(f, to, k);
      mole.root.position.y += Math.sin(k * Math.PI) * 0.22;
      mole.play(k < 1 ? 'jump' : 'sit');
    }
    // --- hen: trot after him and flap up beside him
    if (t < 2.1) {
      hen.face(-0.6);
    } else if (t < 4.5) {
      const p = lerpPath(henPath, t);
      hen.root.position.set(p.x, 0, p.z);
      if (p.moving) { hen.play('walk'); hen.face(p.dir); }
    } else {
      if (hen.root.parent !== cage.root) { cage.root.attach(hen.root); state.henFrom = hen.root.position.clone(); hen.flap(0.5); audio.play('bawk', { pitch: 1.1 }); }
      const k = clamp((t - 4.5) / 0.4, 0, 1);
      hen.face(0);
      const to = new THREE.Vector3(seatX.hen, cage.seatY, cage.seatZ + 0.06);
      hen.root.position.lerpVectors(state.henFrom, to, k);
      hen.root.position.y += Math.sin(k * Math.PI) * 0.3;
      hen.play(k < 1 ? 'idle' : 'sit');
    }

    // --- gate & rise
    cage.setGate(clamp((t - 4.75) / 0.7, 0, 1));
    if (t > 5.8) {
      const u = t - 5.8;
      state.cageY = 0.85 * u * u;
      cage.root.position.y = -cage.floorY + state.cageY;
      cage.root.position.x = LIFT_X + Math.sin(t * 31) * 0.006;
      for (let i = 0; i < 2; i++) sparks.spawn({ pos: [LIFT_X + (Math.random() - 0.5) * 2.2, 0.05, (Math.random() - 0.5) * 1.6], vel: [(Math.random() - 0.5) * 1.5, 1 + Math.random(), 0.6], life: 0.5, color: 0xffe080, color2: 0xff7a20, gravity: 6, size: 1 });
    }
    // camera: drifts in slowly, then rises with the cage (no rotation)
    camera.position.set(camBase.x + t * 0.03, camBase.y + state.cageY * 0.42, camBase.z - t * 0.12);
    camera.quaternion.copy(camQuat);

    // --- crowd
    mole.root.getWorldPosition(tmp2);
    for (const c of crowd) {
      tmp.copy(tmp2).sub(c.rig.root.position);
      // turn toward the travellers, but never so far that we lose their faces
      c.rig.face(clamp(Math.atan2(tmp.x, tmp.z), -0.95, 0.95));
      c.rig.update(dt);
    }
    heartT -= dt;
    if (heartT < 0 && t < 7.2) {
      heartT = 0.18 + Math.random() * 0.3;
      api.heart(crowd[(Math.random() * crowd.length) | 0]);
    }
    // gentle confetti rain once the cage moves
    if (t > 5.6) {
      confettiAcc += dt * 40;
      const cols = [0xe0403a, 0xffd040, 0x4a8ae0, 0x5ab84a, 0xf6f0e0, 0xff8ad0];
      while (confettiAcc > 1) {
        confettiAcc -= 1;
        confetti.spawn({ pos: [-8 + Math.random() * 15, 6.5 + state.cageY * 0.4, -2 + Math.random() * 4], vel: [(Math.random() - 0.5) * 0.4, -0.8, 0], life: 4, color: cols[(Math.random() * cols.length) | 0], size: 2, shape: SHAPE.confetti, spin: 5 + Math.random() * 6, wobble: 0.6, drag: 0.2, fadeIn: 0.1 });
      }
    }
    confetti.update(dt);
    sparks.update(dt);
    for (const b of buntings) for (const f of b.flags) f.m.rotation.x = Math.sin(state.t * 2.4 + f.ph) * 0.25;
    for (const g of glows) g.userData.glow.uIntensity.value = 0.48 + Math.sin(state.t * 3 + g.id) * 0.03;
    warm.intensity = 6 + Math.sin(t * 9) * 0.25;

    mole.update(dt);
    hen.update(dt);
    if (t > 4.4) {
      // seated: paws on knees, peeking at the crowd
      mole.armL.rotation.x = -0.5; mole.armR.rotation.x = mole.emoteT > 0 ? mole.armR.rotation.x : -0.5;
    }
    moleShadow.position.set(mole.root.position.x, 0.012, mole.root.position.z);
    moleShadow.visible = t < 4.05;
    henShadow.position.set(hen.root.position.x, 0.012, hen.root.position.z);
    henShadow.visible = t < 4.5;
    cage.lampGlow.userData.glow.uIntensity.value = 0.5 + Math.sin(t * 7) * 0.04;
  };

  const onResize = () => {
    // narrow screens: frame the travellers and the lift rather than the whole crowd
    const narrow = camera.aspect < 1.2;
    camBase.x = narrow ? 2.3 : -0.35;
    camLook.x = camBase.x;
    camera.position.copy(camBase);
    camera.lookAt(camLook);
    camQuat.copy(camera.quaternion);
    fitFov(camera, 34, narrow ? 40 : 56);
  };
  return { scene, camera, enter, update, state, crowd, duration: 7.6, onResize };
}
