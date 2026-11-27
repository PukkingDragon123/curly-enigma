// The mole's gloved fist round a pickaxe handle, drawn by hand pixel by pixel (wave 21, the player:
// "the loading screen still has no hand"). Shared by both loader paths so they match: ./oreLoader3d.js
// stamps it over its 3D frame at the projected grip, ./oreLoader.js (the 2D fallback) over its own
// drawn pick. The view is first-person: your own arm comes in from the bottom-right edge, the four
// gloved fingers wrap over the handle (a dark seam between each, cut-open tips with the claws out),
// the thumb hooks across from the far side, the darker gauntlet with its strap and brass buckle,
// then the furry forearm. Tan leather from gfx/char/glove.js (lighter than the handle's wood),
// darker stitching, lit from the top left, and the house 1px plum outline round the lot.
import { GLOVE } from '../gfx/char/glove.js';
import { OUTLINE } from './palette.js';

const H = GLOVE.hide, C = GLOVE.cuff, B = GLOVE.brass;
const FUR = [0x120c12, 0x281e26, 0x3e323a, 0x5a4c54, 0x84747a, 0xa0929a]; // velvet mole fur (reads against the brown rock)
const CLAW = [0x4a3a2a, 0x8e7e62, 0xcfc3a3, 0xf6eedc];
const STITCH = H[1]; // dark thread: the seams read on the light hide
const LX = -0.62, LY = -0.78; // toward the lamp (screen, top left)
const hsh = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const ramp = (r, t) => r[Math.max(0, Math.min(r.length - 1, Math.round(t * (r.length - 1))))];

/** Distance from (u, v) to the segment (a, b)-(c, d), and where along it (0..1). */
function seg(u, v, a, b, c, d) {
  const ex = c - a, ey = d - b, l2 = ex * ex + ey * ey;
  const t = Math.max(0, Math.min(1, ((u - a) * ex + (v - b) * ey) / l2));
  return [Math.hypot(u - a - ex * t, v - b - ey * t), t];
}

/**
 * Paint the fist. put(x, y, 0xRRGGBB) writes a pixel; (gx, gy) is the middle of the grip (px),
 * (dx, dy) the handle's direction toward the head, (ax, ay) a point off the frame the arm runs to
 * (the shoulder), k the size (px per unit: the fist is about 16 units along the handle), w × h the frame.
 */
export function paintGrip(put, { gx, gy, dx, dy, ax, ay, k, w, h }) {
  const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
  let ex = ax - gx, ey = ay - gy;
  const el = Math.hypot(ex, ey); ex /= el; ey /= el;
  // n: across the handle, toward the arm's side (the back of the fist); the fingers wrap to -n
  let nx = ex - (ex * dx + ey * dy) * dx, ny = ey - (ex * dx + ey * dy) * dy;
  const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
  const HR = 1.7; // the handle's half-width
  const FU = [4.6, 1.55, -1.5, -4.5]; // the four fingers along the handle (+u toward the head)
  const x0 = Math.max(0, Math.floor(gx - 16 * k)), y0 = Math.max(0, Math.floor(gy - 16 * k));
  const x1 = Math.min(w - 1, Math.ceil(Math.max(gx + 16 * k, ax))), y1 = Math.min(h - 1, Math.ceil(Math.max(gy + 16 * k, ay)));
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (bw <= 0 || bh <= 0) return;
  const col = new Int32Array(bw * bh).fill(-1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = (x + 0.5 - gx) / k, py = (y + 0.5 - gy) / k;
    const u = px * dx + py * dy, v = px * nx + py * ny; // handle frame
    const s = px * ex + py * ey, q = -px * ey + py * ex; // arm frame (s: out along the arm)
    let c = -1;
    // the thumb: from the heel of the hand, over the top finger, its tip hooked round the far side
    {
      const [dd, t] = seg(u, v, 3.2, 3.2, 7.3, -1.9);
      if (dd < 1.75 - t * 0.35) {
        const lit = dd < 0.9 ? 0.2 : -0.12;
        c = t > 0.93 ? CLAW[2] : dd > 1.25 - t * 0.3 ? H[3] : ramp(H, 0.72 + lit);
        if (t > 0.86 && t <= 0.93) c = STITCH; // the cut edge of the thumb's tip
      }
    }
    // the fingers: four rolls over the handle, rounded tips past its far side, claws out of them
    if (c < 0) for (let i = 0; i < 4 && c < 0; i++) {
      const uc = FU[i], tip = -HR - 1.5 + (i === 3 ? 0.4 : 0);
      const [dd, t] = seg(u, v, uc, 3, uc, tip);
      if (dd < 1.5) {
        // round across the roll: the side toward the lamp lit, the seam side dark
        const side = (u - uc) / 1.5, sx = side * dx, sy = side * dy;
        const lam = -(sx * LX + sy * LY);
        const top = v < -HR + 0.6 ? 0.08 : 0; // the knuckle bend catches light where it turns over
        c = Math.abs(side) > 0.8 ? H[2] : ramp(H, 0.66 + lam * 0.3 + top);
        if (Math.abs(v - 1.4) < 0.45 && ((Math.round(u * 2) & 1) === 0)) c = STITCH; // the knuckle seam, stitched
        if (t > 0.97) c = H[3]; // the cut tip
      } else {
        // the claw: hooked back out of the cut fingertip
        const [cd, ct] = seg(u, v, uc - 0.2, tip - 0.6, uc - 0.9, tip - 2.4);
        if (cd < 0.85 - ct * 0.45) c = ct < 0.15 ? CLAW[1] : (u - uc) > -0.5 ? CLAW[3] : CLAW[2];
      }
    }
    // the back of the hand: broad over the knuckles, narrowing into the wrist
    if (c < 0) {
      const bu = u / 6.6, bv = (v - 4.1) / 3.4;
      if (bu * bu + bv * bv <= 1) {
        const lam = -((bu * dx + bv * nx) * LX + (bu * dy + bv * ny) * LY);
        c = ramp(H, 0.6 + lam * 0.32);
        if (Math.abs(bu) < 0.5 && Math.abs(bv) < 0.42) c = ramp(GLOVE.patch, 0.78 + lam * 0.2); // the oiled knuckle patch, worn pale
        if (bu * bu + bv * bv > 0.8 && ((Math.round(u * 1.6 + v) & 1) === 0)) c = STITCH; // its edge seam
      }
    }
    // the gauntlet: a flared cuff along the arm, a rolled rim, a strap with a brass buckle
    if (c < 0 && s > 5.2 && s < 11.4) {
      const r = 4.7 + (s - 5.2) * 0.22;
      if (Math.abs(q) < r) {
        const lam = -(q / r) * (-ey * LX + ex * LY);
        c = s > 10.3 ? ramp(C, 0.85 + lam * 0.15) : ramp(C, 0.55 + lam * 0.35);
        if (s > 7 && s < 8.4) { // the strap
          c = Math.abs(q - r * 0.35) < 1.1 && s > 7.2 && s < 8.2 ? (s < 7.6 ? B[5] : B[3]) : ramp(GLOVE.strap, 0.7 + lam * 0.3);
          if (Math.abs(q - r * 0.35) < 0.45 && s > 7.4 && s < 8) c = B[1];
        }
        if (Math.abs(s - 6.1) < 0.35 && ((Math.round(q * 1.6) & 1) === 0)) c = STITCH;
      }
    }
    // the forearm: velvet fur in strands, a ruff spilling out of the gauntlet, lamp-lit on its top
    if (c < 0 && s >= 9) {
      const r = 5.3 + Math.min(1.4, (s - 9) * 0.06) + (s < 13 ? 0.8 * (1 - (s - 9) / 4) : 0);
      const tuft = (Math.floor(q * 1.3) & 1) * 0.5;
      if (Math.abs(q) < r + tuft * (s < 13 ? 1 : 0.4)) {
        const lam = -(q / r) * (-ey * LX + ex * LY);
        const strand = (hsh(Math.round(q * 0.9), Math.floor(s * 0.22)) > 0.62 ? 0.14 : 0) - (Math.abs(q % 2.2) < 0.35 ? 0.12 : 0); // (long strands down the arm, a parting line here and there)
        c = ramp(FUR, 0.4 + lam * 0.38 + strand - (Math.abs(q) > r - 0.6 ? 0.18 : 0));
      }
    }
    if (c >= 0) col[(y - y0) * bw + (x - x0)] = c;
  }
  // lay it down, then the plum outline round it
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const i = y * bw + x, c = col[i];
    if (c >= 0) { put(x + x0, y + y0, c); continue; }
    if ((x > 0 && col[i - 1] >= 0) || (x < bw - 1 && col[i + 1] >= 0) || (y > 0 && col[i - bw] >= 0) || (y < bh - 1 && col[i + bw] >= 0)) put(x + x0, y + y0, OUTLINE_HEX);
  }
}
const OUTLINE_HEX = typeof OUTLINE === 'number' ? OUTLINE : parseInt(String(OUTLINE).replace('#', ''), 16);
