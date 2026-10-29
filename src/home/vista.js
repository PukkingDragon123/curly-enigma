// What you see through Old Star's round windows: the great glowing cavern his house looks out on.
// Two painted panoramas wrapped round the house (no light, no fog): far off, terraced cliffs of
// dark violet rock veined with glowing crystal, mushroom forests in the ledges, two waterfalls
// falling into the mist of the chasm, the warm lights of a far-off burrow village on a terrace,
// stalactites and glow-worms like stars overhead; nearer, an arc of dark rock spires and a giant
// crystal cluster and glowcap stalks, cut out against the far view so it shifts as you move past a
// window. Pixel art, painted once into an RGBA buffer.
import * as THREE from 'three';
import { makeRng } from '../core/util.js';
import { hash2 } from '../iso/surface.js';
import { MID, FY } from './plan.js';

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

class Paint {
  constructor(W, H, alpha = false) {
    this.W = W; this.H = H;
    this.d = new Uint8ClampedArray(W * H * 4);
    if (!alpha) for (let i = 3; i < this.d.length; i += 4) this.d[i] = 255;
  }
  /** Blend color c (hex) at (x, y) with alpha a (x wraps round the panorama). */
  px(x, y, c, a = 1) {
    y |= 0;
    if (y < 0 || y >= this.H) return;
    x = ((x | 0) % this.W + this.W) % this.W;
    const i = (x + y * this.W) * 4, d = this.d;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (a >= 1) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; return; }
    const da = d[i + 3] / 255, oa = a + da * (1 - a);
    if (oa <= 0) return;
    d[i] = clamp255((r * a + d[i] * da * (1 - a)) / oa);
    d[i + 1] = clamp255((g * a + d[i + 1] * da * (1 - a)) / oa);
    d[i + 2] = clamp255((b * a + d[i + 2] * da * (1 - a)) / oa);
    d[i + 3] = clamp255(oa * 255);
  }
  /** Add light (additive glow). */
  add(x, y, c, k = 1) {
    y |= 0;
    if (y < 0 || y >= this.H) return;
    x = ((x | 0) % this.W + this.W) % this.W;
    const i = (x + y * this.W) * 4, d = this.d;
    d[i] = clamp255(d[i] + ((c >> 16) & 255) * k);
    d[i + 1] = clamp255(d[i + 1] + ((c >> 8) & 255) * k);
    d[i + 2] = clamp255(d[i + 2] + (c & 255) * k);
    if (d[i + 3] < 255) d[i + 3] = clamp255(d[i + 3] + 255 * Math.min(1, k));
  }
  rect(x, y, w, h, c, a = 1) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a); }
  /** A soft round glow (additive), radius r, stepped in a few bands for the pixel look. */
  glow(x, y, r, c, k = 1) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.hypot(i, j) / r;
      if (d >= 1) continue;
      const v = Math.round((1 - d) ** 2 * 4) / 4;
      if (v > 0) this.add(x + i, y + j, c, v * k);
    }
  }
  texture() {
    // rows bottom-up for the texture (the painting is top-down)
    const out = new Uint8ClampedArray(this.d.length), row = this.W * 4;
    for (let y = 0; y < this.H; y++) out.set(this.d.subarray(y * row, y * row + row), (this.H - 1 - y) * row);
    const t = new THREE.DataTexture(out, this.W, this.H, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.wrapS = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  }
}

/** 1D value noise round the panorama (wraps every W). */
function ridge(rng, W, oct = [[0.004, 1], [0.012, 0.45], [0.04, 0.16]]) {
  const tables = oct.map(([f]) => { const n = Math.max(2, Math.round(W * f)); return { n, v: Array.from({ length: n }, () => rng() * 2 - 1) }; });
  return (x) => {
    let s = 0;
    oct.forEach(([, a], k) => {
      const { n, v } = tables[k];
      const t = ((x / W) * n % n + n) % n, i = Math.floor(t), f = t - i, e = f * f * (3 - 2 * f);
      s += (v[i] + (v[(i + 1) % n] - v[i]) * e) * a;
    });
    return s;
  };
}

/** The far panorama: W × H. */
function paintFar(W, H, seed = 11) {
  const rng = makeRng(seed);
  const p = new Paint(W, H);
  // the deep: dark violet up high, a teal glow across the middle, mist and black far down
  // (no dithering: the panorama is seen magnified through the windows, a smooth gradient reads better)
  const sky = [0x0a0a24, 0x101838, 0x16304e, 0x1e4e62, 0x28706c, 0x2c8274, 0x1e5a60, 0x10303e];
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1) * (sky.length - 1), i = Math.min(sky.length - 2, Math.floor(t));
    const c = mixHex(sky[i], sky[i + 1], t - i);
    for (let x = 0; x < W; x++) p.px(x, y, c);
  }
  // the cavern's roof: soft clouds of glow-worm light, dense specks of teal and white
  for (let k = 0; k < 70; k++) p.glow(rng() * W, rng() * H * 0.3, 22 + Math.floor(rng() * 24), rng() < 0.7 ? 0x1a6a68 : 0x3a3a7a, 0.35);
  for (let k = 0; k < 2600; k++) {
    const x = rng() * W, y = rng() ** 1.3 * H * 0.36;
    p.add(x, y, rng() < 0.75 ? 0x60e0c8 : 0xc8f0ff, 0.35 + rng() * 0.6);
    if (rng() < 0.08) p.glow(x, y, 3, 0x40c0b0, 0.45);
  }
  // cliffs: three layers of terraced rock, back to front, darker and nearer each time; each lit
  // from below by the glow of the chasm, rims catching the light, crystal veins and glowcap woods
  const layers = [
    { base: 0.31, amp: 0.1, col: 0x3a3664, deep: 0x26244a, rim: 0x6a9ab8, crystals: 0.014, shrooms: 0.035, lights: true },
    { base: 0.44, amp: 0.12, col: 0x2a2448, deep: 0x1a1634, rim: 0x5a86a0, crystals: 0.018, shrooms: 0.045 },
    { base: 0.58, amp: 0.12, col: 0x1c1830, deep: 0x100c1c, rim: 0x4a7088, crystals: 0.022, shrooms: 0.055 },
  ];
  // waterfalls: ribbons of pale water from the middle cliffs into the mist (behind the front ones)
  const falls = () => { for (const fx of [0.08, 0.36, 0.55, 0.81, 0.93]) {
    // (each spills over the lip of the middle cliffs)
    const x0 = Math.floor(W * fx + rng() * 30), w0 = 4 + Math.floor(rng() * 4), y0 = tops[1](x0 + 2) + 1;
    for (let y = y0; y < H * 0.9; y++) {
      const t = (y - y0) / (H * 0.9 - y0), w = w0 * (0.55 + t * 0.9) + t * 6;
      const wob = Math.sin(y * 0.11 + x0) * 1.2 * t;
      for (let i = -1; i < w + 1; i++) {
        const edge = i < 0 || i >= w - 0.5;
        if (edge && ((y + i * 3) & 3)) continue;
        // falling streaks: each column of water a shade, broken into long dashes
        const h = hash2(i + x0, Math.floor(y / 9 + i * 1.7), 7);
        const c = h < 0.25 ? 0xf0fcff : h < 0.7 ? 0xa8e0f0 : 0x6ab8d8;
        p.px(x0 + i + wob, y, c, (edge ? 0.45 : 0.85) * (1 - t * 0.45));
      }
    }
    p.glow(x0 + w0 / 2, y0 + 3, 9, 0xc8f4ff, 0.3); // spray at the lip
    for (let k = 0; k < 30; k++) p.glow(x0 + w0 / 2 + (rng() - 0.5) * 50, H * 0.9 + (rng() - 0.5) * 24, 6, 0x7ac0d0, 0.14);
  } };
  const tops = [];
  layers.forEach((L, li) => {
    const r = ridge(rng, W), r2 = ridge(rng, W, [[0.01, 1], [0.05, 0.3]]);
    const step = 3 + li; // terraces: the ridge is quantised into ledges
    const top = (x) => Math.round(((L.base + r(x) * L.amp) * H) / step) * step;
    tops.push(top);
    for (let x = 0; x < W; x++) {
      const t = top(x);
      // two more ledges down the face, following the ridge a little lower
      const l1 = t + 18 + Math.round(r2(x) * 10) * 2, l2 = t + 44 + Math.round(r2(x + 300) * 14) * 2;
      for (let y = Math.max(0, t); y < H; y++) {
        const dy = y - t;
        let c = mixHex(L.col, L.deep, Math.min(1, dy / (H * 0.3)));
        if (dy < 2) c = L.rim; // the lit lip of the ridge
        else if ((y === l1 || (li < 2 && y === l2)) && (x >> 2) % 5) c = mixHex(L.rim, c, 0.55); // lower ledges, fainter
        p.px(x, y, c);
      }
      // glowcap woods along the ledges: little caps glowing cyan and violet
      for (const [ly, k] of [[t, 1], [l1, 0.5], [l2, 0.3]]) {
        if (rng() >= L.shrooms * k) continue;
        const n = 3 + Math.floor(rng() * 9), hue = rng() < 0.7 ? 0x5ad8e8 : 0xb070f0;
        for (let j = 0; j < n; j++) {
          const sx = x + j * (2 + Math.floor(rng() * 3)), h = 2 + Math.floor(rng() * 5);
          const st = ly === t ? top(sx) : ly;
          p.rect(sx, st - h, 1, h, 0x4a3e5a);
          p.rect(sx - 1, st - h - 1, 3, 1, hue);
          p.glow(sx, st - h - 1, 5, hue, 0.5);
        }
      }
      // crystal veins: clusters of tall glowing shards with bright edges
      if (rng() < L.crystals) {
        const hue = [0x58f0d8, 0xa070ff, 0xff70c8, 0x70b8ff][Math.floor(rng() * 4)];
        const t0 = top(x) + 2 + Math.floor(rng() * 40), n = 2 + Math.floor(rng() * 5);
        p.glow(x, t0 - 8, 14 + li * 4, hue, 0.35);
        for (let k = 0; k < n; k++) {
          const h = 5 + Math.floor(rng() * (12 + li * 6)), lean = (rng() - 0.5) * 0.7, x0 = x + k * 2 - n;
          for (let j = 0; j < h; j++) {
            const w = j > h - 3 ? 1 : 2;
            p.px(x0 + Math.round(j * lean), t0 - j, j > h - 2 ? 0xffffff : hue);
            if (w > 1) p.px(x0 + 1 + Math.round(j * lean), t0 - j, mulHex(hue, 0.65));
          }
        }
      }
    }
    if (li === 1) falls();
    // far-off windows: a burrow village glowing warm on the far terraces
    if (L.lights) {
      for (let v = 0; v < 3; v++) {
        const cx = Math.floor(W * (0.18 + v * 0.3 + rng() * 0.05));
        for (let k = 0; k < 40; k++) {
          const x = cx + Math.floor((rng() - 0.5) * 110), t = top(x);
          const y = t + 4 + Math.floor(rng() * 50);
          p.rect(x, y, 2, 2, rng() < 0.7 ? 0xffc060 : 0xffe0a0);
          p.glow(x, y, 5, 0xff9a40, 0.25);
        }
        // a lantern-lit stair zigzagging up
        let x = cx - 30, y = top(cx) + 52;
        for (let k = 0; k < 14; k++) { x += k % 2 ? 7 : -5; y -= 3; p.add(x, y, 0xffb050, 0.9); }
      }
    }
  });
  // a glowing river winding along the floor of the chasm, with sparkles
  const rv = ridge(rng, W, [[0.003, 1], [0.012, 0.4]]);
  for (let x = 0; x < W; x++) {
    const cy = Math.round(H * (0.86 + rv(x) * 0.04)), hw = 2 + Math.round((rv(x + 500) + 1) * 1.5);
    for (let y = cy - hw; y <= cy + hw; y++) {
      const e = Math.abs(y - cy) / hw;
      p.px(x, y, e > 0.8 ? 0x226e74 : e > 0.4 ? 0x2e9a98 : 0x50c8c0, 0.85);
    }
    if (rng() < 0.08) p.add(x, cy + Math.round((rng() - 0.5) * hw), 0xffffff, 0.8);
    if (x % 6 === 0) p.glow(x, cy, 8, 0x30a0a0, 0.08);
  }
  // mist banks lying in the chasm
  for (let y = Math.floor(H * 0.78); y < H; y++) for (let x = 0; x < W; x++) {
    const m = 0.5 + 0.5 * Math.sin(x * 0.013 + y * 0.05) * Math.sin(x * 0.0041 - y * 0.02);
    if (m > 0.55) p.px(x, y, 0x3a7a80, (m - 0.55) * 0.45);
  }
  // stalactites hanging from the roof of the cavern
  for (let k = 0; k < 140; k++) {
    const x = rng() * W, len = 8 + rng() ** 2 * 60, w = 2 + rng() * 6;
    for (let j = 0; j < len; j++) {
      const ww = Math.max(1, Math.round(w * (1 - j / len)));
      p.rect(x - ww / 2, j, ww, 1, j > len - 3 ? 0x2a3a50 : 0x0e0d1a);
      p.px(x + ww / 2, j, 0x24485a); // lit on one side by the glow below
    }
    if (rng() < 0.45) p.glow(x, len + 1, 3, 0x70f0d8, 0.6);
  }
  return p;
}

/** The near arc: a dark foreground ridge with stalagmites, crystal clusters and giant glowcaps; transparent above. */
function paintNear(W, H, seed = 23) {
  const rng = makeRng(seed);
  const p = new Paint(W, H, true);
  const r = ridge(rng, W, [[0.006, 1], [0.03, 0.35], [0.1, 0.1]]);
  const top = (x) => Math.round(H * (0.72 + r(x) * 0.1));
  // the ridge itself, rim-lit teal along its edge
  for (let x = 0; x < W; x++) {
    const t = top(x);
    for (let y = t; y < H; y++) p.px(x, y, y - t < 2 ? 0x3a6a78 : (y + (x >> 3)) % 11 === 0 ? 0x16121e : 0x0d0a12);
  }
  // stalagmites: cones with broad bases standing on the ridge
  for (let k = 0; k < 26; k++) {
    const cx = rng() * W, base = 7 + rng() * 14, h = 14 + rng() ** 2 * H * 0.32, t0 = top(Math.floor(cx)) + 2;
    for (let j = 0; j < h; j++) {
      const hw = Math.max(0.8, base * (1 - j / h) ** 0.9 + Math.sin(j * 0.3 + k) * 0.7);
      for (let x = Math.floor(cx - hw); x <= cx + hw; x++) p.px(x, t0 - j, x > cx + hw - 1.5 ? 0x2e5664 : x < cx - hw + 1 ? 0x0a0810 : 0x120e1a);
    }
  }
  // crystal clusters and giant glowcaps
  for (let k = 0; k < 18; k++) {
    const cx = (k + rng() * 0.8) * (W / 18), t0 = top(Math.floor(cx)) + 1;
    if (k % 3 !== 1) {
      const hue = [0x58f0d8, 0xb080ff, 0xff80d0, 0x80c8ff][Math.floor(rng() * 4)], n = 3 + Math.floor(rng() * 4);
      p.glow(cx, t0 - 8, 20, hue, 0.3);
      for (let s2 = 0; s2 < n; s2++) {
        const hh = 8 + rng() * 26, lean = (rng() - 0.5) * 0.9, w = 2 + Math.floor(rng() * 2);
        for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
          const x = cx - n + s2 * 2.5 + j * lean + i;
          p.px(x, t0 - j, j > hh - 2 ? 0xffffff : i === 0 ? mixHex(hue, 0xffffff, 0.4) : mulHex(hue, 0.7));
        }
      }
    } else {
      const sh = 24 + rng() * 40, cr = 8 + rng() * 10, hue = rng() < 0.6 ? 0x5ad8e8 : 0xe070c0;
      for (let j = 0; j < sh; j++) p.rect(cx - 1 + Math.sin(j * 0.08) * 2, t0 - j, 3, 1, j % 5 === 0 ? 0x6a5a7a : 0x4a3e5a);
      const capY = t0 - sh;
      p.glow(cx, capY, 26, hue, 0.35);
      for (let j = 0; j < cr * 0.6; j++) { const ww = Math.round(cr * Math.sqrt(1 - (j / (cr * 0.6)) ** 2)); p.rect(cx - ww, capY - j, ww * 2 + 1, 1, j === 0 ? mulHex(hue, 0.55) : j < 2 ? mulHex(hue, 0.8) : hue); }
      for (let d = 0; d < 7; d++) p.add(cx - cr + rng() * cr * 2, capY - 1 - rng() * cr * 0.5, 0xffffff, 0.7); // spots
      for (let d = 0; d < 4; d++) { const dx = cx - cr + 2 + rng() * (cr * 2 - 4); for (let j = 0; j < 3 + rng() * 6; j++) p.add(dx, capY + 1 + j, hue, 0.6 - j * 0.06); } // drips of light
    }
  }
  // drifting spores / fireflies over the ridge
  for (let k = 0; k < 140; k++) p.add(rng() * W, H * (0.3 + rng() * 0.5), rng() < 0.6 ? 0xb0ffd8 : 0xffe8a0, 0.8);
  return p;
}

function mixHex(a, b, t) { return (clamp255(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) | (clamp255(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) | clamp255((a & 255) * (1 - t) + (b & 255) * t); }

function mulHex(c, k) { return (clamp255(((c >> 16) & 255) * k) << 16) | (clamp255(((c >> 8) & 255) * k) << 8) | clamp255((c & 255) * k); }

/** The cavern round the house. Returns { group, dispose() }; add group to the meters scene. */
/** The painted panoramas (for a look at them outside the game): { far, near } Paint buffers. */
export function paintVista() { return { far: paintFar(2048, 720), near: paintNear(1024, 360) }; }

/** The two panoramas painted (plain RGBA, for a build worker): { far: { d, W, H }, near } and the transfer list. */
export function paintVistaData(transfer = []) {
  const f = paintFar(2048, 720), n = paintNear(1024, 360);
  transfer.push(f.d.buffer, n.d.buffer);
  return { far: { d: f.d, W: f.W, H: f.H }, near: { d: n.d, W: n.W, H: n.H } };
}

/** Panorama data (from paintVistaData) as a texture. */
function vistaTexture(p) { const q = new Paint(1, 1, true); q.W = p.W; q.H = p.H; q.d = p.d; return q.texture(); }

export function buildVista(scene, painted = null) {
  const group = new THREE.Group();
  group.name = 'vista';
  const far = painted ? vistaTexture(painted.far) : paintFar(2048, 720).texture();
  const near = painted ? vistaTexture(painted.near) : paintNear(1024, 360).texture();
  const R = 24, H = R * 1.05;
  const farMat = new THREE.MeshBasicMaterial({ map: far, side: THREE.BackSide, fog: false, depthWrite: false });
  const farMesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64, 1, true), farMat);
  // (set so that looking straight out of a window meets the crests of the far cliffs and their lights)
  farMesh.position.set(MID.x, FY + 2.0, MID.z);
  farMesh.renderOrder = -10;
  group.add(farMesh);
  // the near arc only round the north and west (where the windows are), clear of your room
  const RN = 9.2;
  const nearMat = new THREE.MeshBasicMaterial({ map: near, side: THREE.BackSide, fog: false, transparent: true, alphaTest: 0.5, depthWrite: false });
  const nearMesh = new THREE.Mesh(new THREE.CylinderGeometry(RN, RN, RN * 0.9, 48, 1, true, Math.PI * 0.5, Math.PI * 1.25), nearMat);
  nearMesh.position.set(MID.x, FY - 2.6, MID.z);
  nearMesh.renderOrder = -9;
  near.repeat.set(1.25 * 1.2, 1);
  group.add(nearMesh);
  // a middle arc out past the terrace (north): the same spires and glowcaps farther off, rising from
  // below the terrace's edge so they stand over the balustrade between you and the far cliffs
  const RM = 14;
  const midGeo = new THREE.CylinderGeometry(RM, RM, RM * 0.9, 40, 1, true, Math.PI * 0.72, Math.PI * 0.56);
  const uv = midGeo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.7 + 0.37);
  const midMesh = new THREE.Mesh(midGeo, nearMat);
  midMesh.position.set(MID.x, FY + 0.3, MID.z);
  midMesh.scale.set(1, 1, 1);
  midMesh.renderOrder = -9.5;
  group.add(midMesh);
  // a black floor and roof far out, so no gap ever shows past the painted edges
  const capMat = new THREE.MeshBasicMaterial({ color: 0x05060a, side: THREE.DoubleSide, fog: false, depthWrite: false });
  for (const y of [FY + 2.0 - H / 2 + 0.05, FY + 2.0 + H / 2 - 0.05]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 32).rotateX(Math.PI / 2), capMat);
    cap.position.set(MID.x, y, MID.z);
    cap.renderOrder = -11;
    group.add(cap);
  }
  scene.add(group);
  group.traverse((m) => { m.frustumCulled = false; });
  return {
    group,
    dispose() {
      scene.remove(group);
      group.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); } });
      far.dispose(); near.dispose(); farMat.dispose(); nearMat.dispose(); capMat.dispose();
    },
  };
}
