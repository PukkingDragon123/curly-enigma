// First-person face mode. Push into a wall (or rest against it) and the view drops from the
// side-on tunnel into a flat close-up of the rock face, seen through the mole's eyes: two big
// pixel-art paws hold the current tool and strike exactly where you aim. Step away, jump or
// get hurt and you are back in the tunnel.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { clamp, lerp, damp } from '../core/util.js';
import { M } from './micro.js';

const FACE_H = 3.3; // cells visible vertically in face mode
const FACE_FOV = 14;
const SPR = 72; // paw sprite canvas size (sprite pixels)
const PAW_D = 1.6; // distance of the paw planes in front of the camera

// ---------------------------------------------------------------- tiny pixel painter
class Px {
  constructor(n) { this.n = n; this.c = new Uint32Array(n * n); }
  set(x, y, col) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.n && y < this.n) this.c[y * this.n + x] = col | 0xff000000; }
  get(x, y) { return x >= 0 && y >= 0 && x < this.n && y < this.n ? this.c[y * this.n + x] : 0; }
  /** Filled capsule between two points (thick line). shade(x,y,t,s) → color, t along, s across (-1..1). */
  capsule(x0, y0, x1, y1, r0, r1, shade) {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
    const minx = Math.floor(Math.min(x0, x1) - Math.max(r0, r1) - 1), maxx = Math.ceil(Math.max(x0, x1) + Math.max(r0, r1) + 1);
    const miny = Math.floor(Math.min(y0, y1) - Math.max(r0, r1) - 1), maxy = Math.ceil(Math.max(y0, y1) + Math.max(r0, r1) + 1);
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      let t = ((px - x0) * dx + (py - y0) * dy) / L2;
      t = clamp(t, 0, 1);
      const cx = x0 + dx * t, cy = y0 + dy * t;
      const r = lerp(r0, r1, t);
      const ex = px - cx, ey = py - cy;
      const d = Math.hypot(ex, ey);
      if (d > r) continue;
      // signed across-coordinate (which side of the axis)
      const side = (ex * -dy + ey * dx) / Math.sqrt(L2);
      this.set(x, y, shade(x, y, t, clamp(side / r, -1, 1), d / r));
    }
  }
  ellipse(cx, cy, rx, ry, shade) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const ex = (x + 0.5 - cx) / rx, ey = (y + 0.5 - cy) / ry;
      const d = ex * ex + ey * ey;
      if (d <= 1) this.set(x, y, shade(ex, ey, d));
    }
  }
  /** 1px dark outline around everything drawn so far. */
  outline(col) {
    const n = this.n, src = this.c.slice();
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (src[y * n + x]) continue;
      const near = (x > 0 && src[y * n + x - 1]) || (x < n - 1 && src[y * n + x + 1]) || (y > 0 && src[(y - 1) * n + x]) || (y < n - 1 && src[(y + 1) * n + x]);
      if (near) this.c[y * n + x] = col | 0xff000000;
    }
  }
  canvas() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = this.n;
    const g = cv.getContext('2d');
    const img = g.createImageData(this.n, this.n);
    for (let i = 0; i < this.c.length; i++) {
      const v = this.c[i];
      if (!v) continue;
      img.data[i * 4] = (v >> 16) & 255; img.data[i * 4 + 1] = (v >> 8) & 255; img.data[i * 4 + 2] = v & 255; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
}

const FUR = [0x1c120c, 0x2e2016, 0x40301f, 0x55402b, 0x6c5338, 0x8a6c4a];
const PINK = [0xa8545e, 0xcc7480, 0xe8969c, 0xf8c0c0];
const CLAW = [0x7a6c58, 0xb4a68c, 0xdccfb4, 0xf6efdc, 0xfffcf4];
const INK = 0x120a06;
const WOOD = [0x3e2412, 0x5e3a1e, 0x80522c, 0xa8703c, 0xc89058];
const ramp = (c) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const f = (k, w = 0) => (clamp(Math.round(r * k + w), 0, 255) << 16) | (clamp(Math.round(g * k + w), 0, 255) << 8) | clamp(Math.round(b * k + w * 0.9), 0, 255);
  return [f(0.38), f(0.62), f(0.86), c, f(1.18, 18), f(1.3, 60)];
};
/** Fur shading across a limb: lit on the upper-left, tufts and strokes for texture. */
const furAt = (x, y, s, d, base = 3) => {
  let k = base + (s < -0.55 ? 2 : s < -0.1 ? 1 : s < 0.5 ? 0 : -1);
  if (d > 0.88) k -= 1;
  if (((x * 3 + y * 5) % 7) === 0) k += 1; // fur strokes
  if (((x + y * 2) % 11) === 0) k -= 1;
  return FUR[clamp(k, 0, 5)];
};

/**
 * A mole paw at (px, py) facing angle a: round furry mitt, pink pad and big cream claws.
 * grip: claws curl across a tool handle instead of spreading forward.
 */
function paw(P, px, py, a, open = 0, grip = false) {
  const fx = Math.cos(a), fy = Math.sin(a), nx = -fy, ny = fx;
  P.ellipse(px, py, 10.5, 9.5, (ex, ey, d) => {
    const s = ex * 0.7 + ey * 0.7;
    return FUR[clamp(3 + (s < -0.35 ? 2 : s < 0.05 ? 1 : s < 0.5 ? 0 : -1) - (d > 0.82 ? 1 : 0) + ((Math.round(ex * 9) + Math.round(ey * 7)) % 4 === 0 ? 1 : 0), 0, 5)];
  });
  P.ellipse(px - nx * 4 + fx * 2, py - ny * 4 + fy * 2, 4.2, 3, (ex, ey) => PINK[ey < -0.2 ? 3 : ex > 0.4 ? 1 : 2]);
  if (grip) {
    // a fist: four claws wrapped over the handle, thumb claw underneath
    for (let k = 0; k < 4; k++) {
      const o = -4 + k * 3.2;
      const sx = px + fx * o + nx * 6, sy = py + fy * o + ny * 6;
      const ex = sx - nx * 9 + fx * 1.5, ey = sy - ny * 9 + fy * 1.5;
      P.capsule(sx, sy, ex, ey, 2.1, 1.3, (x, y, t, s) => CLAW[t < 0.15 ? 1 : s < -0.2 ? 4 : s < 0.35 ? 3 : 2]);
      P.capsule(ex, ey, ex - nx * 1.2 - fx * 1.6, ey - ny * 1.2 - fy * 1.6, 1.1, 0.5, () => CLAW[2]);
    }
    return;
  }
  for (let k = 0; k < 5; k++) {
    const o = (k - 2) * 3.4;
    const sx = px + fx * 7 + nx * o, sy = py + fy * 7 + ny * o;
    const ca = a + (k - 2) * (0.12 + open * 0.18);
    const len = 9 - Math.abs(k - 2) * 1.2;
    const ex = sx + Math.cos(ca) * len, ey = sy + Math.sin(ca) * len;
    const tx = ex + Math.cos(ca + 0.9) * 2.2, ty = ey + Math.sin(ca + 0.9) * 2.2;
    P.capsule(sx, sy, ex, ey, 2.1, 1.1, (x, y, t, s) => CLAW[t < 0.2 ? 1 : s < -0.25 ? 4 : s < 0.35 ? 3 : 2]);
    P.capsule(ex, ey, tx, ty, 1.1, 0.5, () => CLAW[2]);
  }
}

/**
 * Right arm + paw holding `tool`, tool axis at angle offset `a` from the resting diagonal.
 * Returns the painter with grip/tip coordinates.
 */
function drawRight(tool, a, metal, extra = {}) {
  const P = new Px(SPR);
  const gx = 38, gy = 42;
  const ang = -Math.PI * 0.72 + a;
  const fx = Math.cos(ang), fy = Math.sin(ang);
  const nx = -fy, ny = fx;
  const MT = ramp(metal);
  let tip = { x: gx + fx * 22, y: gy + fy * 22 };
  const handle = (len, back, w = 2.3) => P.capsule(gx - fx * back, gy - fy * back, gx + fx * len, gy + fy * len, w, w, (x, y, t, s) => WOOD[s < -0.45 ? 4 : s < 0.1 ? 3 : s < 0.6 ? 2 : 1] - (((x + y) % 6 === 0) ? 0x0a0604 : 0));
  // forearm first (behind everything), entering from the bottom edge
  P.capsule(gx + 18, SPR + 16, gx + 4, gy + 8, 14, 10, (x, y, t, s, d) => furAt(x, y, s, d));
  if (tool === 'pick') {
    handle(24, 10);
    const hx = gx + fx * 24, hy = gy + fy * 24;
    // steel pick head: a thick curved bar with two points, eye in the middle
    for (let k = -1; k <= 1.0001; k += 0.025) {
      const bend = -k * k * 5;
      const x = hx + nx * k * 17 + fx * bend, y = hy + ny * k * 17 + fy * bend;
      const r = 3.4 * (1 - Math.abs(k) * 0.78) + 0.5;
      P.ellipse(x, y, r, r, (ex, ey) => {
        const lit = -(ex * 0.6 + ey * 0.8);
        return MT[lit > 0.45 ? 5 : lit > 0.1 ? 4 : lit > -0.35 ? 3 : 2];
      });
    }
    P.ellipse(hx, hy, 4.4, 4.4, (ex, ey) => MT[ey < -0.3 ? 4 : ex > 0.3 ? 2 : 3]);
    P.ellipse(hx + fx * 0.5, hy + fy * 0.5, 1.6, 1.6, () => WOOD[1]);
    tip = { x: hx + nx * 17 - fx * 5, y: hy + ny * 17 - fy * 5 };
  } else if (tool === 'chisel') {
    P.capsule(gx - fx * 7, gy - fy * 7, gx + fx * 11, gy + fy * 11, 3, 2.8, (x, y, t, s) => WOOD[s < -0.3 ? 4 : s < 0.4 ? 3 : 1]);
    P.capsule(gx + fx * 11, gy + fy * 11, gx + fx * 27, gy + fy * 27, 2.1, 1.1, (x, y, t, s) => MT[s < -0.2 ? 5 : s < 0.4 ? 4 : 2]);
    tip = { x: gx + fx * 28, y: gy + fy * 28 };
  } else if (tool === 'brush') {
    handle(17, 9, 2);
    const bx = gx + fx * 21, by = gy + fy * 21;
    P.capsule(bx - nx * 7, by - ny * 7, bx + nx * 7, by + ny * 7, 3.6, 3.6, (x, y, t, s) => WOOD[s < 0 ? 3 : 1]);
    for (let k = -7; k <= 7; k += 1) P.capsule(bx + nx * k + fx * 2, by + ny * k + fy * 2, bx + nx * k * 1.15 + fx * 10, by + ny * k * 1.15 + fy * 10, 0.75, 0.6, () => ((k & 1) ? 0xeee0c0 : 0xc8b490));
    tip = { x: bx + fx * 10, y: by + fy * 10 };
  } else if (tool === 'drill') {
    P.capsule(gx - fx * 5, gy - fy * 5, gx + fx * 15, gy + fy * 15, 6.8, 6, (x, y, t, s) => [0x5a3a12, 0x8a6a22, 0xb8902e, 0xe0b850, 0xf8e090][s < -0.5 ? 4 : s < -0.1 ? 3 : s < 0.4 ? 2 : s < 0.8 ? 1 : 0]);
    for (let k = 0; k < 3; k++) P.capsule(gx + fx * (k * 4 + 6) - nx * 6.5, gy + fy * (k * 4 + 6) - ny * 6.5, gx + fx * (k * 4 + 6) + nx * 6.5, gy + fy * (k * 4 + 6) + ny * 6.5, 0.8, 0.8, () => 0x4a2a0a);
    const sp = extra.spin || 0;
    P.capsule(gx + fx * 15, gy + fy * 15, gx + fx * 31, gy + fy * 31, 3, 0.6, (x, y, t, s) => (((Math.floor(t * 9 + sp * 2) + (s > 0 ? 1 : 0)) & 1) ? MT[4] : MT[1]));
    tip = { x: gx + fx * 31, y: gy + fy * 31 };
  } else if (tool === 'xray') {
    P.capsule(gx - fx * 6, gy - fy * 6, gx + fx * 13, gy + fy * 13, 4.4, 4.4, (x, y, t, s) => [0x2a2a34, 0x4a4a56, 0x7a7f88, 0xa0a6ae][s < -0.4 ? 3 : s < 0.2 ? 2 : s < 0.7 ? 1 : 0]);
    P.ellipse(gx + fx * 16, gy + fy * 16, 6.2, 6.2, (ex, ey, d) => (d > 0.62 ? 0x8a8f96 : ey < -0.25 && ex < 0 ? 0xf0ffff : d > 0.3 ? 0x3ac8e8 : 0x9ff4ff));
    tip = { x: gx + fx * 19, y: gy + fy * 19 };
  } else if (tool === 'eat') {
    P.ellipse(gx + fx * 9, gy + fy * 9, 7, 6, (ex, ey) => (ey < -0.3 ? 0xf8d080 : ey < 0.3 ? 0xd89448 : 0xa86a2a));
  }
  const holding = tool !== 'none' && tool !== 'eat';
  paw(P, gx, gy, ang, holding ? 0 : 0.8, holding);
  P.outline(INK);
  return { px: P, grip: { x: gx, y: gy }, tip };
}

/** Left paw: braced on the rock (claws spread), or holding a little mallet for chisel work. */
function drawLeft(pose) {
  const P = new Px(SPR);
  const gx = 32, gy = 44;
  P.capsule(gx - 16, SPR + 16, gx - 3, gy + 8, 14, 10, (x, y, t, s, d) => furAt(x, y, -s, d, 2));
  if (pose === 'mallet' || pose === 'mallet2') {
    const up = pose === 'mallet' ? 0 : 1;
    const ang = -Math.PI * 0.3 - up * 0.45;
    const fx = Math.cos(ang), fy = Math.sin(ang);
    const nx = -fy, ny = fx;
    P.capsule(gx - fx * 6, gy - fy * 6, gx + fx * 17, gy + fy * 17, 2, 2, (x, y, t, s) => WOOD[s < 0 ? 3 : 1]);
    const hx = gx + fx * 17, hy = gy + fy * 17;
    P.capsule(hx - nx * 6.5, hy - ny * 6.5, hx + nx * 6.5, hy + ny * 6.5, 4, 4, (x, y, t, s) => WOOD[s < -0.35 ? 4 : s < 0.3 ? 2 : 0]);
    paw(P, gx, gy, ang, 0, true);
  } else {
    paw(P, gx, gy, -Math.PI * 0.42, 1);
  }
  P.outline(INK);
  return { px: P, grip: { x: gx, y: gy } };
}

const POSES = { pick: [-0.95, -0.6, -0.25, 0.1, 0.38], chisel: [0, 0.08], brush: [-0.15, 0.15], drill: [0, 0], xray: [0], eat: [0], none: [0] };

export { drawRight, drawLeft, Px };

export class FaceMode {
  constructor(scene) {
    this.s = scene;
    this.on = false;
    this.blend = 0;
    this.dir = 1;
    this.tool = null;
    this.focus = { x: 0, y: 0 };
    this.pushT = 0;
    this.idleT = 0;
    this.cool = 0;
    this.look = { x: 0, y: 0 };
    this.anim = { kind: null, t: 0, dur: 0, target: null };
    this.cache = new Map();
    this.root = new THREE.Group();
    scene.camera.add(this.root);
    const mk = (order) => {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, alphaTest: 0.5 });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      m.renderOrder = order;
      m.frustumCulled = false;
      this.root.add(m);
      return m;
    };
    this.right = mk(60);
    this.left = mk(59);
    this.root.visible = false;
    this.rightPos = { x: 0, y: 0 };
    this.leftPos = { x: 0, y: 0 };
  }

  // ------------------------------------------------------------ enter / exit
  wallAhead(dir) {
    const s = this.s, pl = s.player, w = s.world;
    const x0 = pl.x + dir * (0.31 + 1 / M);
    for (let d = 0; d < 1.2; d += 1 / M) {
      let hits = 0;
      for (let k = -0.3; k <= 0.25; k += 0.11) if (w.solidPt(x0 + dir * d, pl.y + k)) hits++;
      if (hits >= 2) return d;
    }
    return 9;
  }

  update(dt) {
    const s = this.s, pl = s.player, inp = s.game.input;
    this.cool = Math.max(0, this.cool - dt);
    const ax = inp.axisX();
    if (!this.on) {
      const ok = pl.onGround && !pl.climbing && !pl.inWater && !pl.inLava && !s.fainting && !s.leaving && this.cool <= 0 && !s.game.ui.isPanelOpen() &&
        !inp.isDown('KeyW', 'ArrowUp', 'Space', 'KeyS', 'ArrowDown') && !(s.introCtl && s.introCtl.locked());
      // pushing into rock: the mole is trying to walk but not getting anywhere
      const stuck = Math.abs(pl.x - (this.lastX ?? pl.x)) < 0.004;
      const pushing = ok && ax !== 0 && stuck && this.wallAhead(ax) < 0.6;
      this.pushT = pushing ? this.pushT + dt : 0;
      const resting = ok && ax === 0 && Math.abs(pl.vx) < 0.2 && this.wallAhead(pl.facing) < 0.25 && !inp.mouseDown(0);
      this.idleT = resting ? this.idleT + dt : 0;
      this.lastX = pl.x;
      if (this.pushT > 0.22) this.enter(ax);
      else if (this.idleT > 1.5) this.enter(pl.facing);
    } else {
      if (inp.pressed('KeyW', 'ArrowUp', 'Space')) { this.exit('jump'); return; }
      if (inp.pressed('KeyS', 'ArrowDown')) { this.exit('down'); return; }
      if (ax === -this.dir) { this.exit('away'); return; }
      if (ax === this.dir && this.wallAhead(this.dir) > 0.7) { this.exit('walk'); return; }
      if (!pl.onGround && pl.vy > 2) { this.exit('fall'); return; }
    }
  }

  enter(dir) {
    const s = this.s;
    this.on = true;
    this.dir = dir || 1;
    s.player.facing = this.dir;
    this.pushT = this.idleT = 0;
    this.look.x = this.look.y = 0;
    s.audio.play('whoosh', { vol: 0.5, pitch: 0.7 });
    if (s.game.ui.setFocusMode) s.game.ui.setFocusMode(true);
    if (!s.flags.faceMode) { s.flags.faceMode = true; s.state.learn('digging'); }
  }

  exit(why) {
    if (!this.on) return;
    const s = this.s;
    this.on = false;
    this.cool = why === 'away' || why === 'walk' ? 0.5 : 0.9;
    s.audio.play('whoosh', { vol: 0.35, pitch: 1.2 });
    if (s.game.ui.setFocusMode) s.game.ui.setFocusMode(false);
  }

  hidesPlayer() { return this.blend > 0.55; }

  /** Where the pointer lands on the rock (cell coords). */
  pointer() { return this.s.mouseWorld(); }

  // ------------------------------------------------------------ camera
  camera(dt) {
    const s = this.s, cam = s.camera, pl = s.player, inp = s.game.input;
    this.blend = clamp(this.blend + (this.on ? dt / 0.38 : -dt / 0.3), 0, 1);
    const k = this.blend * this.blend * (3 - 2 * this.blend);
    // side view first (keeps camX/camY tracking the mole), then pull in
    s.sideCamera(dt);
    if (k <= 0) { this.root.visible = false; return; }
    const sidePos = cam.position.clone();
    const sideFov = cam.fov;
    const sideLook = new THREE.Vector3(s.camX, -s.camY - 0.15, 0);
    // the face view looks straight at the wall in front, drifting a little toward the pointer
    const m = inp.mouse;
    if (this.on) {
      this.look.x = damp(this.look.x, clamp(m.nx, -1, 1) * 0.55, 3, dt);
      this.look.y = damp(this.look.y, clamp(m.ny, -1, 1) * 0.35, 3, dt);
    }
    const fx = pl.x + this.dir * 1.2 + this.look.x, fy = pl.y - 0.22 - this.look.y;
    this.focus.x = fx; this.focus.y = fy;
    const dist = FACE_H / (2 * Math.tan((FACE_FOV * Math.PI) / 360));
    const sh = s.shakeAmp * 0.6;
    const facePos = new THREE.Vector3(fx + (Math.random() - 0.5) * sh * 0.4, -fy + (Math.random() - 0.5) * sh * 0.4, 0.5 + dist);
    const faceLook = new THREE.Vector3(fx, -fy, 0.5);
    cam.fov = lerp(sideFov, FACE_FOV, k);
    // keep the framing continuous: interpolate the look point, then back off along the view axis
    const look = sideLook.clone().lerp(faceLook, k);
    const pos = sidePos.clone().lerp(facePos, k);
    cam.position.copy(pos);
    cam.lookAt(look);
    cam.updateProjectionMatrix();
    s.renderer.terrain.shared.uFlat.value = k;
    s.post.vignette = lerp(0.6, 0.85, k);
    this.paws(dt, k);
  }

  // ------------------------------------------------------------ paws
  frame(kind, idx, side) {
    const metal = this.metalFor(kind);
    const key = `${side}:${kind}:${idx}:${metal}`;
    let f = this.cache.get(key);
    if (f) return f;
    let d;
    if (side === 'L') d = drawLeft(kind);
    else d = drawRight(kind, POSES[kind] ? POSES[kind][idx] ?? 0 : 0, metal, { spin: idx });
    const tex = new THREE.CanvasTexture(d.px.canvas());
    tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    f = { tex, grip: d.grip, tip: d.tip };
    this.cache.set(key, f);
    return f;
  }
  metalFor(kind) {
    const st = this.s.state;
    const it = kind === 'pick' ? st.equipped('pick') : kind === 'chisel' || kind === 'brush' || kind === 'drill' || kind === 'xray' ? st.equipped(kind) : null;
    const c = it?.icon?.c;
    return typeof c === 'number' ? c : kind === 'pick' ? 0x9aa0a8 : 0xb0b6be;
  }

  /** Tool wind-up (pickaxe). */
  windup(kind, dur) {
    if (!this.on) return;
    this.anim = { kind, t: 0, dur, target: this.s.target };
  }
  /** Tool impact on target t: the paws snap to it. */
  impact(kind, t) {
    if (!this.on) return;
    if (kind === 'pick') { this.anim.hit = 0.16; this.anim.target = t || this.anim.target; return; }
    this.anim = { kind, t: 0, dur: kind === 'chisel' ? 0.18 : kind === 'brush' ? 0.24 : kind === 'eat' ? 0.5 : 0.1, target: t, hit: 0.1 };
  }

  paws(dt, k) {
    const s = this.s, eng = s.game.engine, cam = s.camera;
    this.root.visible = k > 0.02;
    if (!this.root.visible) return;
    const W = eng.width, H = eng.height;
    const viewH = 2 * Math.tan((cam.fov * Math.PI) / 360) * PAW_D;
    const unit = viewH / H; // world units per internal pixel at the paw plane
    const S = Math.max(2, Math.round((H / (FACE_H * M)) * 0.78)); // sprite px → internal px (close to the rock's pixels)
    const a = this.anim;
    a.t += dt;
    if (a.hit > 0) a.hit -= dt;
    const tool = this.tool || 'none';
    // choose frames
    let kind = tool, idx = 0;
    let leftKind = 'brace';
    const busy = a.t < a.dur;
    if (tool === 'pick') {
      const p = s.swing ? clamp(s.swing.t / s.swing.dur, 0, 1) : 1;
      idx = s.swing ? (p < 0.25 ? 0 : p < 0.45 ? 1 : p < 0.55 ? 3 : p < 0.75 ? 4 : 2) : 1;
    } else if (tool === 'chisel') { idx = busy ? 1 : 0; leftKind = busy ? 'mallet2' : 'mallet'; }
    else if (tool === 'brush') idx = Math.floor(s.time * 7) & 1 && busy ? 1 : 0;
    else if (tool === 'drill') idx = s.player.action === 'drill' ? Math.floor(s.time * 24) & 1 : 0;
    else if (tool === 'xray') idx = 0;
    else kind = busy && a.kind === 'eat' ? 'eat' : 'none';
    const fr = this.frame(kind, idx, 'R');
    const fl = this.frame(leftKind, 0, 'L');
    // where the tool should touch: the target's screen point
    let tx = W * 0.62, ty = H * 0.42;
    const tgt = (a.target && (busy || s.swing || s.player.action)) ? a.target : s.target;
    if (tgt && !tgt.far) {
      const p = s.toScreen(new THREE.Vector3(tgt.x, -tgt.y, 0.5));
      tx = p.x / eng.scale; ty = p.y / eng.scale;
    }
    // rest pose low on the right; reach toward the target when working
    const working = s.swing || busy || s.player.action;
    const restX = W * 0.74, restY = H * 0.86;
    let gx, gy;
    if (working && fr.tip) {
      const reach = s.swing ? Math.sin(clamp(s.swing.t / s.swing.dur, 0, 1) * Math.PI) : 1;
      const wantX = tx - (fr.tip.x - fr.grip.x) * S, wantY = ty - (fr.tip.y - fr.grip.y) * S;
      gx = lerp(restX, clamp(wantX, W * 0.25, W * 1.05), 0.35 + reach * 0.65);
      gy = lerp(restY, clamp(wantY, H * 0.35, H * 1.1), 0.35 + reach * 0.65);
    } else {
      const bob = Math.sin(s.time * 2.2) * 2.5 * S * 0.3;
      gx = restX; gy = restY + bob;
    }
    if (a.hit > 0) { gx += (Math.random() - 0.5) * S * 2; gy += (Math.random() - 0.5) * S * 2; }
    const slide = (1 - k) * H * 0.7;
    this.rightPos.x = damp(this.rightPos.x || gx, gx, 18, dt);
    this.rightPos.y = damp(this.rightPos.y || gy, gy, 18, dt);
    const lX = W * 0.2 + (leftKind !== 'brace' && busy ? -S * 4 : 0), lY = H * 0.9 + (leftKind === 'mallet2' ? -S * 5 : 0) + Math.sin(s.time * 2.2 + 1) * S * 0.6;
    this.leftPos.x = damp(this.leftPos.x || lX, lX, 14, dt);
    this.leftPos.y = damp(this.leftPos.y || lY, lY, 14, dt);
    this.place(this.right, fr, this.rightPos.x, this.rightPos.y + slide, S, unit, W, H);
    this.place(this.left, fl, this.leftPos.x, this.leftPos.y + slide, S, unit, W, H);
    // the lamp tints the paws a little
    const L = s.lighting.sample(s.player.x, s.player.y - 0.3);
    const lit = clamp(0.55 + Math.max(L[0], L[1], L[2]) * 0.4, 0.55, 1.15);
    this.right.material.color.setRGB(lit, lit * 0.97, lit * 0.92);
    this.left.material.color.setRGB(lit * 0.92, lit * 0.9, lit * 0.86);
  }

  /** Put a sprite so its grip sits at internal pixel (px, py) (y down), snapped to the pixel grid. */
  place(mesh, fr, px, py, S, unit, W, H) {
    if (mesh.material.map !== fr.tex) { mesh.material.map = fr.tex; mesh.material.needsUpdate = true; }
    const size = SPR * S;
    // sprite top-left so the grip lands on (px, py), snapped to whole internal pixels
    const x0 = Math.round(px - fr.grip.x * S), y0 = Math.round(py - fr.grip.y * S);
    const cx = x0 + size / 2, cy = y0 + size / 2;
    mesh.scale.set(size * unit, size * unit, 1);
    mesh.position.set((cx - W / 2) * unit, (H / 2 - cy) * unit, -PAW_D);
  }

  resize() {}

  dispose() {
    for (const f of this.cache.values()) f.tex.dispose();
    this.cache.clear();
    this.right.geometry.dispose(); this.right.material.dispose();
    this.left.geometry.dispose(); this.left.material.dispose();
    if (this.root.parent) this.root.parent.remove(this.root);
  }
}
