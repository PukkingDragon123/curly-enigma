// First-person smithing tools for the view model: a cross-peen hammer and a pair of flat-bit
// tongs (reins plus two jaws that open on the rivet). Hi-res voxels (1 unit = VMV meters), cached.
//
// Frames follow parts.js: the gripped point is the origin and the held handle (or the reins)
// runs along +Y through the fist; the hammer's striking face looks toward -Z (the way the paw's
// knuckles point), the cross peen toward +Z. The tongs' jaws open along ±X around the rivet.
import { Vox, cached, mix, dk, lt, h3, PX, NX, PY, NY, PZ } from '../../gfx/char/vox.js';

export const HAMMER_HEAD = 82; // head centre on the handle (voxels): held near the end of a long handle
/** Centre of the hammer's striking face (tool-local voxels). */
export const HAMMER_FACE = [0, HAMMER_HEAD, -12];
export const TONGS_RIVET = 60;
/** Where the jaws bite (tool-local voxels). */
export const TONGS_JAW = [0, 84, 0];

const IRON = 0x45444c;
const ASH = 0xb88e5c;
const LEATHER = 0x5a3220;

function grain(base, x, y, z, seed) {
  const a = Math.atan2(z, x);
  const b = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 10);
  let c = b % 2 ? base : dk(base, 0.05);
  if (h3(b, y >> 3, seed, 1) < 0.16) c = dk(c, 0.15);
  if (h3(b, y >> 2, seed, 2) > 0.9) c = lt(c, 0.12);
  return c;
}

/** Forged iron: hammer-scale mottling, lit tops, dark undersides, bright worn edges. */
function forged(x, y, z, e, seed = 3) {
  let c = IRON;
  const r = h3(x >> 1, y >> 1, z >> 1, seed);
  if (r < 0.18) c = dk(c, 0.2); else if (r > 0.86) c = lt(c, 0.1);
  if (e & PY) c = lt(c, 0.16);
  if (e & NY) c = dk(c, 0.25);
  if ((e & (PX | NX)) && (e & (PY | NY))) c = lt(c, 0.22); // worn arrises
  return c;
}

/** Cross-peen smithing hammer: ash handle with a leather grip, a forged head with a polished face. */
export function hammerGeo() {
  return cached('vm-smith-hammer4', () => {
    const H = HAMMER_HEAD;
    const v = new Vox(-7, 8, -20, H + 9, -14, 14);
    // handle: an oval ash shaft, a touch slimmer under the head, a knob at the butt
    v.fill(-4, 4, -17, H + 6, -5, 5, (x, y, z) => {
      const k = y > 40 ? 0.84 : 1;
      return (x / (2.5 * k)) ** 2 + (z / (3.1 * k)) ** 2 <= 1;
    }, 0, 1);
    v.ell(0, -16, 0, 3, 2.2, 3.6, 0, 1);
    // leather wrap where the paw holds it
    v.fill(-4, 4, -9, 11, -5, 5, (x, y, z) => (x / 3) ** 2 + (z / 3.6) ** 2 <= 1, 0, 2);
    // the head: an octagonal face end, a waisted cheek around the eye, a cross peen
    v.fill(-6, 6, H - 6, H + 7, -13, 13, (x, y, z) => {
      const ax = Math.abs(x), ay = Math.abs(y + 0.5 - H);
      if (z < -11.5 || z > 11.5) return false;
      if (z < -5) return ax <= 4.4 && ay <= 4.8 && ax + ay <= 7.6; // face block, chamfered
      if (z < 4) return ax <= 3.8 && ay <= 4.8; // cheeks
      const t = (z - 4) / 7.5; // peen: thins in y toward a rounded edge across x
      return ax <= 4.2 - t * 0.4 && ay <= 4.6 - t * 3.6;
    }, 0, (x, y, z) => (z < -10.5 ? 4 : 3));
    // the wedge in the handle end, flush with the top of the head
    v.box(-1, H + 4, -2, 1, H + 6, 2, 0, 5);
    v.resolve({
      1: (x, y, z) => grain(ASH, x, y, z, 31),
      2: (x, y, z) => {
        const a = Math.atan2(z, x);
        const band = ((y * 2 + Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8)) % 8 + 8) % 8;
        return band < 3 ? dk(LEATHER, 0.18) : band === 3 ? lt(LEATHER, 0.12) : LEATHER;
      },
      3: (x, y, z, e) => {
        let c = forged(x, y, z, e, 5);
        if (z > 9 && (e & (PY | NY | PZ))) c = lt(0x8a8c94, 0.2); // the peen's worn edge
        if (z < -7 && (e & (PX | NX | PY | NY))) c = mix(c, 0x9aa0a8, 0.35); // chamfer catches the light
        return c;
      },
      4: (x, y, z) => {
        const r = Math.hypot(x + 0.5, y + 0.5 - H);
        if (r > 4.2) return 0x8a8e96;
        return r < 1.8 ? 0xf4f6fa : h3(x, y, 1, 7) < 0.25 ? 0xc8ccd4 : 0xdde2e8; // mirror-bright, scuffed
      },
      5: (x, y, z, e) => (e & PY ? 0x9aa0a8 : 0x6a6e76),
    });
    return v.geometry(false);
  });
}

/**
 * Flat-bit tongs: { reins, jawA, jawB, tipA, tipB }. reins are tool-local (origin at the grip);
 * the jaws are built around the rivet (origin = rivet) so their bones can open them about Z.
 * tipA/tipB are the inner bit faces (drawn on the glowing layer: they heat up in the fire).
 */
export function tongsGeo() {
  return cached('vm-smith-tongs', () => {
    const R = TONGS_RIVET;
    const v = new Vox(-9, 10, -20, R + 8, -6, 7);
    // two reins, side by side through the fist, bowing apart a little and meeting at the rivet
    const reinX = (y) => {
      if (y < -10) return 3.2 + (-10 - y) * 0.2; // flared ends
      if (y < 30) return 3.0 + (y + 10) * 0.03;
      return 4.2 - (y - 30) / (R - 30) * 3.0;
    };
    for (const s of [-1, 1]) {
      v.fill(-9, 9, -18, R, -3, 3, (x, y, z) => Math.abs(x - s * reinX(y)) <= 1.35 && Math.abs(z) <= 1.7, 0, 1);
      v.ell(s * reinX(-17), -17, 0, 1.9, 1.9, 2.1, 0, 1); // rounded ends
    }
    // a sliding ring that keeps the reins shut on the work
    v.fill(-7, 7, 40, 43, -3, 3, (x, y, z) => Math.abs(x) <= 5.4 && Math.abs(z) <= 2.2 && !(Math.abs(x) < 3.8 && Math.abs(z) < 0.8), 0, 2);
    // the rivet boss
    v.fill(-6, 6, R - 5, R + 5, -3, 3, (x, y, z) => x * x + (y - R) ** 2 <= 4.6 * 4.6 && Math.abs(z) <= 2.2, 0, 2);
    v.fill(-2, 2, R - 2, R + 2, 2, 4, (x, y, z) => x * x + (y - R) ** 2 <= 1.8 * 1.8, 0, 3);
    v.resolve({
      1: (x, y, z, e) => forged(x, y, z, e, 11),
      2: (x, y, z, e) => forged(x, y, z, e, 12),
      3: () => 0xb8bcc4,
    });
    const reins = v.geometry(false);
    // one jaw: from the rivet out to a flat bit; s = side (+1 bites from +X)
    const jaw = (s, tips) => {
      const J = new Vox(-6, 7, -2, 32, -6, 7);
      const t = TONGS_JAW[1] - R; // bite height above the rivet
      const xAt = (y) => (y < 10 ? s * (0.4 + y * 0.12) : s * (1.6 + Math.max(0, y - 10) * 0.02));
      J.fill(-6, 6, -1, t + 6, -5, 5, (x, y, z) => {
        if (y < 14) return Math.abs(x - xAt(y)) <= 1.4 && Math.abs(z) <= 1.7;
        return Math.abs(x - xAt(y)) <= 1.0 && Math.abs(z) <= 3.8 && y <= t + 5; // the flat bit
      }, 0, 1);
      J.resolve({ 1: (x, y, z, e) => forged(x, y, z, e, 13 + s) });
      // the inner layer of the bit (nearest the other jaw): it touches the hot work and glows
      const inner = new Set();
      for (let y = 16; y < t + 6; y++) for (let z = -5; z < 7; z++) for (let x = -6; x < 7; x++) {
        if (J.has(x, y, z) && !J.has(x - s, y, z)) inner.add(`${x},${y},${z}`);
      }
      if (tips) J.paint((x, y, z) => (inner.has(`${x},${y},${z}`) ? 0x5e5a5c : -1));
      else J.paint((x, y, z) => (inner.has(`${x},${y},${z}`) ? -1 : undefined));
      return J.geometry(false);
    };
    return { reins, jawA: jaw(1, false), jawB: jaw(-1, false), tipA: jaw(1, true), tipB: jaw(-1, true) };
  });
}
