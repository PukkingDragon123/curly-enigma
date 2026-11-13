// The tutorial's cues in the 3D world (no cards, no stamps): what to use next glints with a slow
// stream of gold motes rising off it, a good moment flares (embers and sparks off a fire, a ring of
// glints), and Old Star can hold real things in his paws when he hands them over: a lump of copper,
// his old leather satchel (the backpack), his notebook (the book). Used by src/home/lessons.js and
// src/deep/FirstDig.js; both scenes have the same particle system (src/deep/Particles.js: spawn,
// sparks, glints, ember).
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * A glint over a thing to use: gold motes drifting up off it and, now and then, a twinkle. pos() →
 * a world point (or null to pause). r: how wide the motes rise (m). Call update(dt) every frame.
 */
export class Glint {
  constructor(fx, pos, o = {}) {
    this.fx = fx;
    this.pos = pos;
    this.r = o.r ?? 0.22;
    this.color = o.color || [1, 0.84, 0.42];
    this.rate = o.rate ?? 0.09;
    this.t = 0;
    this.tw = 0.3;
    this.on = true;
  }

  update(dt) {
    if (!this.on || !this.fx) return;
    let p = null;
    try { p = this.pos(); } catch (e) { p = null; }
    if (!p) return;
    this.t -= dt;
    this.tw -= dt;
    const c = this.color, r = this.r;
    while (this.t <= 0) {
      this.t += this.rate;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      this.fx.spawn({ x: p.x + Math.cos(a) * d, y: p.y - 0.1 + Math.random() * 0.15, z: p.z + Math.sin(a) * d, vx: rand(-0.03, 0.03), vy: rand(0.22, 0.4), vz: rand(-0.03, 0.03),
        life: rand(1.0, 1.6), size: rand(0.012, 0.022), color: Math.random() < 0.3 ? [1, 0.96, 0.8] : c, glow: true, drag: 0.5, grav: -0.04, swirl: 0.04, twinkle: 0.6 });
    }
    // a soft breathing halo where it is
    this.halo = (this.halo ?? 0) - dt;
    if (this.halo <= 0) {
      this.halo = 0.2;
      this.fx.spawn({ x: p.x, y: p.y + 0.05, z: p.z, life: 0.7, size: this.r * 0.55, color: [c[0] * 0.55, c[1] * 0.45, c[2] * 0.3], alpha: 0.2, glow: true, drag: 0 });
    }
    if (this.tw <= 0) {
      this.tw = rand(0.7, 1.4);
      this.fx.glints?.(p.x + rand(-r, r) * 0.6, p.y + rand(0, 0.25), p.z + rand(-r, r) * 0.6, [1, 0.95, 0.75]);
    }
  }

  remove() { this.on = false; }
}

/** A good moment: a burst of embers and sparks off a point (a fire, his paws), and a ring of glints. */
export function flare(fx, p, o = {}) {
  if (!fx || !p) return;
  const n = o.n ?? 26;
  for (let i = 0; i < n; i++) fx.ember?.(p.x + rand(-0.12, 0.12), p.y + rand(0, 0.08), p.z + rand(-0.12, 0.12));
  fx.sparks?.(p.x, p.y + 0.05, p.z, Math.round(n * 0.6), o.color || [1, 0.72, 0.3], [0, 0.6, 0], o.speed ?? 2.6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    fx.spawn({ x: p.x + Math.cos(a) * 0.08, y: p.y + 0.15, z: p.z + Math.sin(a) * 0.08, vx: Math.cos(a) * 0.55, vy: rand(0.5, 0.9), vz: Math.sin(a) * 0.55,
      life: rand(0.9, 1.3), size: rand(0.012, 0.018), color: [1, 0.9, 0.55], glow: true, drag: 1.4, grav: 0.25, twinkle: 0.8 });
  }
}

/**
 * A lump of copper ore as a little voxel model (~9 cm): orange-brown metal knuckles in a crust of
 * grey-brown rock, a green speck of verdigris. For Old Star's paws.
 */
export function copperLump(scale = 1) {
  const g = new THREE.Group();
  const s = 0.022 * scale;
  const geo = new THREE.BoxGeometry(s, s, s);
  const mats = {
    cu: new THREE.MeshLambertMaterial({ color: 0xd8743a, emissive: 0x3a1406 }),
    cuHi: new THREE.MeshLambertMaterial({ color: 0xf2a060, emissive: 0x4a2010 }),
    rock: new THREE.MeshLambertMaterial({ color: 0x6e5c4c }),
    rockDk: new THREE.MeshLambertMaterial({ color: 0x4e4036 }),
    verd: new THREE.MeshLambertMaterial({ color: 0x5aa88a }),
  };
  // a rough ball of cells: metal in the middle and on one face, rock round the rest
  let k = 0;
  for (let x = -2; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const d = Math.hypot(x + 0.5, y * 1.2, z);
    if (d > 2.05 || (d > 1.6 && ((x * 7 + y * 13 + z * 5 + 20) % 3 === 0))) continue;
    const face = z === 1 || (x === -2 && y >= 0);
    const m = face ? (k++ % 4 === 0 ? mats.cuHi : mats.cu) : (k++ % 5 === 0 ? mats.verd : (x + y + z) & 1 ? mats.rock : mats.rockDk);
    const b = new THREE.Mesh(geo, m);
    b.position.set((x + 0.5) * s, y * s, z * s);
    g.add(b);
  }
  g.userData.dispose = () => { geo.dispose(); for (const m of Object.values(mats)) m.dispose(); };
  return g;
}

/** A little voxel model from a cell function f(x, y, z) → material key | null, over [x0..x1]×[y0..y1]×[z0..z1]. */
function voxModel(s, box, mats, f) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(s, s, s);
  const M = {};
  for (const [k, c] of Object.entries(mats)) M[k] = new THREE.MeshLambertMaterial(typeof c === 'number' ? { color: c } : c);
  const [x0, x1, y0, y1, z0, z1] = box;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    const k = f(x, y, z);
    if (!k || !M[k]) continue;
    const b = new THREE.Mesh(geo, M[k]);
    b.position.set((x + 0.5) * s, (y + 0.5) * s, (z + 0.5) * s);
    g.add(b);
  }
  g.userData.dispose = () => { geo.dispose(); for (const m of Object.values(M)) m.dispose(); };
  return g;
}

/**
 * Old Star's old leather satchel (~22 cm): a scuffed brown body, a darker flap with a brass buckle,
 * a strap looped over the top. Handed over as your backpack.
 */
export function satchel(scale = 1) {
  const s = 0.02 * scale;
  return voxModel(s, [-5, 4, -5, 5, -2, 2], { body: 0x7a4a2a, dark: 0x5a3018, flap: 0x4a2814, brass: { color: 0xd8a84a, emissive: 0x3a2808 }, stitch: 0xc89a6a }, (x, y, z) => {
    const inBody = y <= 2 && Math.abs(z) <= 1 && !(Math.abs(x + 0.5) > 4 && (y === -5 || y === 2));
    // the strap: an arch over the top
    if (y >= 3 && (z === 0) && (Math.abs(x + 0.5) === 3.5 || (y === 5 && Math.abs(x + 0.5) <= 3.5))) return 'dark';
    if (!inBody) return null;
    if (z === 2 - 1 && y >= -1) return x === -1 && y === -1 ? 'brass' : y === 2 && (x + 5) % 2 ? 'stitch' : 'flap';
    return (x * 3 + y * 5 + z * 7) % 4 === 0 ? 'dark' : 'body';
  });
}

/** His notebook (~14 cm): a worn brown leather cover, cream page edges, a red ribbon marker. */
export function notebook(scale = 1) {
  const s = 0.016 * scale;
  return voxModel(s, [-4, 3, 0, 2, -5, 5], { cover: 0x6a3a1e, edge: 0xeadcbe, ribbon: 0xb8442e, worn: 0x8a5a32 }, (x, y, z) => {
    if (z === 5) return x === 1 && y === 1 ? 'ribbon' : null;
    if (y === 1) return x === -4 ? 'cover' : Math.abs(z) === 4 || x === 3 ? 'edge' : null;
    return (x * 3 + z) % 7 === 0 ? 'worn' : 'cover';
  });
}

/**
 * A little bench anvil on a log stump (~0.5 m to the face): what Old Star hammers at by your bedside
 * fire while you sleep (the wake-up). Its local `userData.face` is the top of the face (meters, above
 * the stump's foot), for the sparks.
 */
export function benchAnvil() {
  const g = new THREE.Group();
  const geos = [], mats = [];
  const box = (w, h, d, color, x, y, z, o = {}) => {
    const geo = new THREE.BoxGeometry(w, h, d), mat = new THREE.MeshLambertMaterial({ color, ...o });
    geos.push(geo); mats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  // the stump: bark round a pale, ringed top, a few chips of wood at its foot
  const H = 0.24;
  box(0.28, H, 0.28, 0x6a4628, 0, H / 2, 0);
  box(0.3, 0.05, 0.3, 0x543620, 0, 0.025, 0);
  box(0.24, 0.012, 0.24, 0xc09a68, 0, H + 0.006, 0);
  box(0.12, 0.004, 0.12, 0x9a7450, 0, H + 0.013, 0);
  for (const [x, z, r] of [[0.21, 0.06, 0.4], [-0.18, 0.15, 1.1], [0.06, -0.22, 2.0]]) box(0.05, 0.012, 0.025, 0xc8a070, x, 0.006, z).rotation.y = r;
  // the anvil: a dark iron foot, a waist, a face with a bright worn top, a horn off one end
  const iron = 0x3a3a44, y0 = H + 0.012;
  box(0.17, 0.035, 0.11, iron, 0, y0 + 0.018, 0);
  box(0.09, 0.05, 0.07, iron, 0, y0 + 0.06, 0);
  box(0.22, 0.055, 0.09, 0x464652, 0, y0 + 0.112, 0);
  box(0.21, 0.008, 0.082, 0xa0a0ae, 0, y0 + 0.143, 0, { emissive: 0x1a1a20 });
  box(0.075, 0.04, 0.055, iron, 0.145, y0 + 0.115, 0);
  box(0.045, 0.025, 0.032, iron, 0.2, y0 + 0.118, 0);
  // a bar of hot metal on the face
  box(0.09, 0.014, 0.024, 0xff9a4a, -0.02, y0 + 0.154, 0.005, { emissive: 0xd05010 });
  g.userData.face = new THREE.Vector3(-0.02, y0 + 0.16, 0.005);
  g.userData.dispose = () => { for (const x of geos) x.dispose(); for (const m of mats) m.dispose(); };
  return g;
}

// ---------------------------------------------------------------- teaching by showing (wave 12)
/**
 * A few floating words in the world (2-5 words, voxel text: src/gfx/text3d.js): all the text a
 * lesson shows next to what it demonstrates. pos: a world point. o: { kind, life, size }.
 */
export function teachWord(game, text, pos, o = {}) {
  if (!pos || !game?.ui?.floatText) return;
  try { game.ui.floatText(text, new THREE.Vector3(pos.x, pos.y, pos.z), { kind: o.kind || 'reveal', life: o.life ?? 2.4, size: o.size ?? 0.85, stack: o.stack }); } catch (e) { /* no words, no harm */ }
}

/**
 * A lump of ore still in its crust of rock (~10 cm, fine voxels): a copper core, grey-brown rock
 * all round it (each rock cell tagged userData.rock, outermost first to go). For Old Star's chisel
 * demonstration: chipLump() knocks the crust off a few cells at a time.
 */
export function rockyLump(scale = 1) {
  const g = new THREE.Group();
  const s = 0.011 * scale;
  const geo = new THREE.BoxGeometry(s, s, s);
  const M = {
    cu: new THREE.MeshLambertMaterial({ color: 0xd8743a, emissive: 0x3a1406 }),
    cuHi: new THREE.MeshLambertMaterial({ color: 0xf6a862, emissive: 0x5a2410 }),
    cuDk: new THREE.MeshLambertMaterial({ color: 0xa8542a, emissive: 0x2a0c04 }),
    rock: new THREE.MeshLambertMaterial({ color: 0x7a6a5a }),
    rockHi: new THREE.MeshLambertMaterial({ color: 0x9a8a76 }),
    rockDk: new THREE.MeshLambertMaterial({ color: 0x4e4238 }),
    dirt: new THREE.MeshLambertMaterial({ color: 0x5e4630 }),
  };
  const h = (x, y, z) => { const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return n - Math.floor(n); };
  for (let x = -4; x <= 4; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) {
    const d = Math.hypot(x / 1.25, y, z) + (h(x, y, z) - 0.5) * 0.7;
    if (d > 3.3) continue;
    const core = Math.hypot(x / 1.3 + 0.3, y * 1.1, z) + (h(z, x, y) - 0.5) * 0.6 < 1.9;
    let m;
    if (core) m = y > 0 && x < 1 ? M.cuHi : (x + y + z) & 1 ? M.cu : (h(y, z, x) < 0.3 ? M.cuDk : M.cu);
    else m = y >= 2 && h(x, z, y) < 0.5 ? M.rockHi : h(y, x, z) < 0.18 ? M.dirt : (x * 3 + y * 5 + z) % 4 === 0 ? M.rockDk : M.rock;
    const b = new THREE.Mesh(geo, m);
    b.position.set(x * s, y * s, z * s);
    if (!core) { b.userData.rock = true; b.userData.d = d; }
    g.add(b);
  }
  g.userData.dispose = () => { geo.dispose(); for (const m of Object.values(M)) m.dispose(); };
  return g;
}

/**
 * One blow of the chisel on a rockyLump: up to n of its outermost rock cells (round the side facing
 * `from`, a world point, when given) go flying as tiny voxel chips. Returns the rock cells left.
 */
export function chipLump(fx, lump, n = 6, from = null) {
  const rock = lump.children.filter((b) => b.userData.rock && b.visible);
  if (!rock.length) return 0;
  lump.updateMatrixWorld(true);
  const c = new THREE.Vector3().setFromMatrixPosition(lump.matrixWorld);
  const side = from ? new THREE.Vector3(from.x - c.x, 0, from.z - c.z).normalize() : null;
  const wp = new THREE.Vector3();
  const score = (b) => { b.getWorldPosition(wp); return b.userData.d + (side ? wp.sub(c).normalize().dot(side) * 1.5 : 0) + Math.random() * 0.8; };
  rock.sort((a, b) => score(b) - score(a));
  for (const b of rock.slice(0, n)) {
    b.visible = false;
    b.getWorldPosition(wp);
    const out = wp.clone().sub(c).normalize();
    const col = b.material.color;
    fx?.chips?.(wp.x, wp.y, wp.z, 2, [col.r, col.g, col.b], [out.x * 0.6, out.y * 0.6 + 0.3, out.z * 0.6]);
  }
  return Math.max(0, rock.length - n);
}
