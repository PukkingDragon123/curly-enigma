// Items as 3D voxel art for the UI. An item's 32×32 pixel icon is extruded into a voxel model, thick
// in its middle and thin at its edges (so an ore lump is a lump and a coin is a coin), meshed with the
// creatures' mesher (baked face shading and corner AO), and rendered with the game's own renderer into
// a small target, read back and drawn as pixels (no extra GL context, one art pixel per voxel face).
//   itemVox.init(game)                 once (the backpack does it): the renderer to borrow
//   itemVox.url(id) → data URL | null  a still, turned a little toward you and lit from above (cached)
//   itemVox.spin(el, id) → { dispose }  a canvas in el turning the model slowly (stops when el leaves the page)
// Anything that can't be done (no renderer yet, no icon) returns null: callers keep the flat icon.
import * as THREE from 'three';
import { VB, FINE } from '../deep/enemies/vox.js';
import { iconCanvas } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';

const RES = 64; // render size (2× the icon: each voxel face is a 2×2 block, the edges stay crisp)
let R = null;
const geos = new Map(), urls = new Map();
let scene = null, cam = null, mat = null, rt = null, px = null;

function setup() {
  if (scene) return;
  scene = new THREE.Scene();
  cam = new THREE.OrthographicCamera(-0.48, 0.48, 0.48, -0.48, 0.01, 10);
  cam.position.set(0, 0, 4);
  mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  rt = new THREE.WebGLRenderTarget(RES, RES, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  px = new Uint8Array(RES * RES * 4);
}

/** The voxel model of an item's icon (cached): thickness from each pixel's distance to the edge. */
function geoOf(id) {
  if (geos.has(id)) return geos.get(id);
  let geo = null;
  try {
    if (!ITEMS[id]) throw new Error('no item');
    const cv = iconCanvas(id);
    const W = cv.width, H = cv.height;
    const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3] > 100;
    // chamfer distance to the outside (how far in from the silhouette)
    const dist = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) dist[y * W + x] = solid(x, y) ? 99 : 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!dist[i]) continue;
        const nb = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : dist[yy * W + xx]);
        dist[i] = Math.min(dist[i], nb(x - 1, y) + 1, nb(x, y - 1) + 1, nb(x - 1, y - 1) + 1.4, nb(x + 1, y - 1) + 1.4);
      }
      for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x; if (!dist[i]) continue;
        const nb = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : dist[yy * W + xx]);
        dist[i] = Math.min(dist[i], nb(x + 1, y) + 1, nb(x, y + 1) + 1, nb(x + 1, y + 1) + 1.4, nb(x - 1, y + 1) + 1.4);
      }
    }
    const flat = /ingot|coin|ticket|note|map|letter|blueprint|bp_|paper|card|leaf|feather/.test(id) || ITEMS[id].cat === 'blueprint';
    const vb = new VB(7);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!dist[i]) continue;
      const k = (y * W + x) * 4;
      const c = (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
      // half-thickness: a rounded body (the outline pixels stay a voxel thick)
      const t = flat ? Math.min(1, Math.floor(dist[i] / 2)) : Math.min(5, Math.round(Math.sqrt(dist[i] * 2.2)) - 1);
      for (let z = -t; z <= t; z++) vb.set(x - 16, 15 - y, z, z === t || z === -t || dist[i] < 1.5 ? c : shade(c, 0.8));
    }
    geo = vb.geo(0, 0, 0, FINE);
    geo.computeBoundingSphere();
  } catch (e) { geo = null; }
  geos.set(id, geo);
  return geo;
}
const shade = (c, k) => ((Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k));

/** Render a model turned (yaw, pitch) into a canvas (RES × RES). */
function draw(geo, yaw, pitch, canvas) {
  setup();
  const mesh = new THREE.Mesh(geo, mat);
  // centre it and fit it: the icon is 32 voxels at FINE metres
  const s = 1 / (32 * FINE);
  mesh.scale.setScalar(s);
  const g = new THREE.Group();
  g.add(mesh);
  mesh.position.set(0.5 * FINE * s, -0.5 * FINE * s, 0);
  g.rotation.set(pitch, yaw, 0, 'YXZ');
  scene.add(g);
  const prev = R.getRenderTarget();
  const cc = R.getClearColor(new THREE.Color()), ca = R.getClearAlpha();
  const info = R.info.render, saved = { calls: info.calls, triangles: info.triangles };
  R.setRenderTarget(rt);
  R.setClearColor(0x000000, 0);
  R.clear(true, true, false);
  R.render(scene, cam);
  R.readRenderTargetPixels(rt, 0, 0, RES, RES, px);
  R.setRenderTarget(prev);
  R.setClearColor(cc, ca);
  Object.assign(info, saved);
  scene.remove(g);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(RES, RES);
  for (let y = 0; y < RES; y++) img.data.set(px.subarray((RES - 1 - y) * RES * 4, (RES - y) * RES * 4), y * RES * 4);
  // a dark outline round the silhouette (like the rest of the game's pixel art)
  const a = (x, y) => (x < 0 || y < 0 || x >= RES || y >= RES ? 0 : img.data[(y * RES + x) * 4 + 3]);
  const out = new Uint8ClampedArray(img.data);
  for (let y = 0; y < RES; y++) for (let x = 0; x < RES; x++) {
    if (a(x, y) > 40) continue;
    if (a(x - 1, y) > 40 || a(x + 1, y) > 40 || a(x, y - 1) > 40 || a(x, y + 1) > 40) { const i = (y * RES + x) * 4; out[i] = 26; out[i + 1] = 14; out[i + 2] = 8; out[i + 3] = 255; }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export const itemVox = {
  init(game) { R = game?.engine?.renderer || R; },
  ready() { return !!R; },
  /** A still of the item in 3D (turned toward you, a little from above), cached; null if it can't be. */
  url(id) {
    if (urls.has(id)) return urls.get(id);
    if (!R) return null;
    const geo = geoOf(id);
    let u = null;
    if (geo) {
      try {
        const cv = document.createElement('canvas');
        cv.width = cv.height = RES;
        u = draw(geo, -0.55, 0.38, cv).toDataURL();
      } catch (e) { u = null; }
    }
    urls.set(id, u);
    return u;
  },
  /** A canvas in el with the item turning slowly in 3D; returns { dispose } (or null). */
  spin(el, id) {
    if (!R) return null;
    const geo = geoOf(id);
    if (!geo) return null;
    const cv = document.createElement('canvas');
    cv.width = cv.height = RES;
    cv.className = 'vox-spin pix';
    el.append(cv);
    let raf = 0, last = 0, alive = true;
    const t0 = performance.now();
    const tick = (now) => {
      if (!alive) return;
      if (!cv.isConnected && now - t0 > 500) { alive = false; return; }
      raf = requestAnimationFrame(tick);
      if (now - last < 66) return; // ~15 fps is plenty for a turning trinket
      last = now;
      const t = (now - t0) / 1000;
      try { draw(geo, -0.6 + t * 1.1, 0.3 + Math.sin(t * 0.9) * 0.12, cv); } catch (e) { alive = false; }
    };
    raf = requestAnimationFrame(tick);
    return { canvas: cv, dispose() { alive = false; cancelAnimationFrame(raf); cv.remove(); } };
  },
};
