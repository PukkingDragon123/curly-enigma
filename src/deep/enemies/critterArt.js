// Wave 17 critter models ("Pinterest" voxel art): cozy cave critters drawn at H (1/48 m) with
// hue-shifted ramps, structured light, baked cavity AO and rim, big glossy eyes and one small
// story per critter (a leaf on the worm, ore in the slug's back, a lost button in the dust bunny).
// Same interfaces and pivots (in VS units) as the old builders in ./critters.js; `v` picks a
// seeded variant (markings, accessories) where the class asks for one.
import { VB, mul, mix, c01 } from './vox.js';
import { H, taper, hramp, lit, bake, clumps, gloss } from './voxKit.js';
import { socketEye, mouth, nostrils } from './face.js';
import { clamp } from '../../core/util.js';

/** Mesh at H; the pivot is given in VS units (as the classes place parts). */
const V = (vb, px = 0, py = 0, pz = 0) => vb.geo(px * 2, py * 2, pz * 2, H);
const INK = 0x140a10, GLINT = 0xffffff;
const front = (vb, x, y, z0 = 30, z1 = -30) => { for (let z = z0; z > z1; z--) if (vb.has(x, y, z)) return z; return 0; };

// ------------------------------------------------------------------ earthworm
export function buildWorm(v = 0) {
  const b = new VB(101);
  const T = hramp(0xe08e8a, 6), S = hramp(0xc8605e, 5);
  const L = 26;
  // beads of ringed body, the saddle (clitellum) fatter and darker, a rounded head
  for (let i = 0; i < 9; i++) {
    const z = 1.5 + i * 2.9, band = i === 5 || i === 6, r = (band ? 3 : 2.5) - (i > 7 ? 0.3 : 0) - (i % 2 ? 0.2 : 0);
    const R = band ? S : T;
    b.ell(0, 0, z, r, r, 1.75, (x, y, zz, nx, ny, nz) => (Math.abs(nz) > 0.8 ? R[1] : lit(R, { bias: 0.08 })(x, y, zz, nx, ny, nz)));
  }
  b.ell(0, 0.2, L, 2.3, 2.3, 2.6, lit(T, { bias: 0.12 }));
  bake(b, { ao: 0.3, rim: 0.25 });
  // (no simple face) an eyeless prostomium: a fleshy lip ring round a round mouth of tiny hooked
  // teeth, a darker throat, two sensory pits and a fold over the top
  b.ell(0, 0.2, L + 1.8, 2.6, 2.6, 1.2, (x, y, z, nx, ny) => (ny > 0.4 ? T[4] : T[3])); // the lip ring
  mouth(b, 0, -0.2, { w: 3.4, h: 3, d: 2, curve: 0, gap: 1, fangs: [], lower: true, tooth: 0xfff0e8, gum: 0xa83a4a, lip: S[1], tongue: 0x7a1a2a });
  taper(b, -2, 2.4, L + 1, 2, 2.4, L + 1, 0.9, 0.9, T[4]); // the fold over the mouth
  for (const sd of [1, -1]) { const x = sd > 0 ? 2 : -3; b.del(x, 1, L + 1); b.set(x, 1, L, 0x5a1a24); } // sensory pits
  // a crumb of soil round the root, a leaf stuck on its head (or a pebble)
  for (const [x, y, z, c] of [[2, -2, 1, 0x5a3e2a], [-3, 1, 0, 0x6e4c32], [1, 2, 2, 0x4a3222], [-2, -2, 3, 0x7a5a3a]]) b.set(x, y, z, c);
  if (v === 0) { taper(b, 0, 2.6, L - 1, -2, 4.5, L - 3, 0.9, 0.6, 0x6aa844); b.set(-2, 5, L - 3, 0x9ad060); b.set(0, 3, L - 1, 0x4a7a2a); }
  else if (v === 1) { b.ell(1.5, 2.4, L - 2, 1, 0.8, 1, 0x8a8478); b.set(1, 3, L - 2, 0xb0aa9a); }
  gloss(b, { k: 0.3, min: 0.86 });
  return { body: V(b), len: (L + 3) / 2 };
}

// ------------------------------------------------------------------ dust bunny
export function buildBunny(v = 0) {
  // a cloud of soft lumps (no static, soft AO in the partings), a pale muzzle, glossy black bead
  // eyes, a pink nose, buck teeth, blush, stubby feet, a puff tail; something caught in the fluff (v)
  const b = new VB(111 + v);
  const fur = v === 2 ? hramp(0xb4aaa4, 6, { step: 0.1 }) : v === 1 ? hramp(0xc8b294, 6, { step: 0.1 }) : hramp(0xccbea8, 6, { step: 0.1 });
  const sh = lit(fur, { bias: 0.12, k: 0.8 });
  // a cloud of round lumps (each lit on its own top, AO in the partings between): a scalloped, soft
  // silhouette that reads as fluff, not spikes
  b.ell(0, 6.8, 0, 6.6, 6.4, 6.4, sh);
  for (let i = 0; i < 30; i++) {
    const u = (i + 0.5) / 30 * 2 - 1, a = i * 2.39996, r = Math.sqrt(1 - u * u);
    const cx = Math.cos(a) * r * 5.6, cy = 6.8 + u * 5.4, cz = Math.sin(a) * r * 5.4;
    if (cz > 3 && Math.abs(cx) < 4.2 && cy > 4.5 && cy < 10.5) continue; // (the face stays smooth)
    const rr = 2.3 + b.n(i, 3, 3, 5) * 0.9;
    b.ell(cx, cy, cz, rr, rr * 0.92, rr, sh);
  }
  // a few soft wisps at the crown and cheeks, the stubby feet, the tail puff
  clumps(b, 7, { tones: fur.slice(2), seed: 3 + v, len: [1.5, 2.6], r: 1.2, droop: 0.25, filter: (x, y, z) => y > 11 || (Math.abs(x) > 6 && y > 4 && y < 9) });
  for (const sd of [1, -1]) b.ell(sd * 3.2, 0.9, 4.4, 2, 1.3, 2.4, (x, y, z, nx, ny) => (ny > 0.2 ? fur[4] : fur[2]));
  b.ell(0, 5, -7.4, 2.8, 2.6, 2.4, lit(fur, { bias: 0.12 }));
  b.ell(0, 6.6, 5.4, 2.6, 1.9, 1.4, lit(fur, { bias: 0.22 })); // a pale muzzle
  bake(b, { ao: 0.24, rim: 0.18, aoCol: 0x6a5a6a }); // (soft: fluff, not rock)
  const fz = (x, y) => front(b, x, y, 14, -10);
  // (no simple face) a sculpted rabbit face: split-lip cheek pads, a sculpted pink nose pad with
  // flared nostrils, an open mouth with gums and two big incisors, whiskers out of the cheeks
  for (const sd of [1, -1]) b.ell(sd * 1.5, 6.2, 6.4, 1.9, 1.6, 1.4, lit(fur, { bias: 0.26 })); // cheek pads
  b.ell(0, 7.9, 7.4, 1.6, 1.1, 1, (x, y, z, nx, ny) => (ny > 0.3 ? 0xffa8b8 : 0xe0728a)); // the nose pad
  nostrils(b, 0, 7.6, 1.6, { r: 0.6, col: 0x6a2030, rim: 0xffc0cc });
  mouth(b, 0, 4.6, { w: 4.2, h: 2.4, d: 2, curve: -0.1, asym: 0.25, gap: 9, fangs: [-0.24, 0.24], fang: 2, tooth: 0xfff8ec, gum: 0xd06a7a, throat: 0x3a1018, lip: fur[1] });
  for (const sd of [1, -1]) for (const dy of [0, 1.4]) taper(b, sd * 2.6, 6 + dy * 0.6, 7, sd * 7.5, 6.4 + dy * 1.6, 8, 0.4, 0.3, 0xf4ece0); // whiskers
  // what it rolled through
  if (v === 0) { taper(b, 4.5, 10, -3, 8.5, 12.5, -4.5, 0.7, 0.45, 0x6a4a2a); b.set(7, 12, -4, 0x5a8a3a); b.set(8, 13, -4, 0x7ab848); b.set(8, 13, -5, 0x5a8a3a); }
  else if (v === 1) { // a lost brass button, thread still on
    b.ell(-5.6, 9.5, 2.5, 1.6, 1.6, 0.8, (x, y, z, nx, ny) => (ny > 0.3 ? 0xf0c860 : 0xb88a30)); b.set(-6, 9, 4, 0x5a3a18); b.set(-5, 10, 4, 0x5a3a18);
    taper(b, -5, 9, 3, -3, 12, 1, 0.5, 0.4, 0xc83a3a);
  } else { // a tiny mushroom sprouted in the fluff
    taper(b, 3.5, 12, -1, 4.2, 15, -1.2, 0.8, 0.7, 0xf4e8d0);
    b.ell(4.3, 15.6, -1.2, 2.2, 1.2, 2.2, (x, y, z, nx, ny) => (ny < -0.3 ? 0xd8c8b0 : ny > 0.5 ? 0x8ae8ff : 0x4ab8e0));
  }
  // eyes (placed at (0, 4.5, ez) VS): set into sockets under tufted fur brows, a warm amber iris,
  // one lid a touch lower than the other (a wary look)
  const eyes = new VB();
  const ez = (Math.max(fz(3, 9), fz(-4, 9)) + 1) / 2;
  for (const sd of [1, -1]) socketEye(b, eyes, sd * 3.4, 9.3, sd, { r: 2.2, depth: 0.45, iris: 0x8a4a1a, pupil: 0x0a0404, pr: 0.5, ir: 0.66, look: [-sd * 0.1, -0.05], lid: sd > 0 ? 0.24 : 0.34, tilt: 0.05, skin: fur[2], brow: fur[4], browR: 1.2, browUp: sd > 0 ? 0.6 : 0 });
  const ear = new VB(112 + v);
  // a long ear: a soft rim, a pink inside, a darker tip folding back (one floppy on variant 2)
  taper(ear, 0, 0, 0, 0, 8, -1, 2.2, 1.7, (x, y, z, t) => lit(fur)(x, y, z, 0, 0.3, 0));
  taper(ear, 0, 8, -1, 0, 10.5, -3.5, 1.7, 0.9, (x, y, z) => (y > 9.5 ? fur[1] : fur[2]));
  // the inner ear: a cupped hollow, pink deepening to the root, with a dark vein down the middle
  for (const v of ear.list()) if (v.y > 1 && v.y < 9 && Math.abs(v.x + 0.5) < 1.3 && !ear.has(v.x, v.y, v.z + 1) && v.z >= -1) { ear.del(v.x, v.y, v.z); ear.set(v.x, v.y, v.z - 1, v.x === 0 && v.y % 3 ? 0xc8607a : v.y > 5 ? 0xffb8c8 : 0xf08aa0); }
  clumps(ear, 4, { tones: fur.slice(2), seed: 5, len: [1.5, 2.5], r: 1, filter: (x, y) => y < 4 });
  bake(ear, { ao: 0.3, rim: 0.25 });
  return { body: V(b), eyes: eyes.geo(0, 9, ez * 2, H), ez, ear: V(ear), fluff: c01(fur[4]), furC: fur.slice(1, 5).map(c01) };
}

// ------------------------------------------------------------------ glow beetle
export function buildBeetle() {
  const b = new VB(121);
  const sh = hramp(0x2e7a4a, 6), head = hramp(0x2a2a3a, 4);
  // domed elytra with a seam, a lighter iridescent rim; pronotum; a round head with big eyes
  b.ell(0, 0.8, -0.5, 4.8, 3.6, 6, (x, y, z, nx, ny, nz) => {
    if (y < -0.5) return -1;
    if (Math.abs(x + 0.5) < 0.6 && ny > 0.1) return sh[1]; // the seam
    if (Math.abs(nx) > 0.8 && ny < 0.25) return 0x6ac8b8; // an iridescent hem
    return lit(sh, { bias: 0.04 })(x, y, z, nx, ny, nz);
  });
  b.ell(0, 0.2, 5, 3.4, 2.4, 2.4, lit(head));
  b.ell(0, -0.2, 7.4, 2.6, 2.4, 2.2, lit(head, { bias: 0.08 }));
  b.ell(0, -1.4, -0.5, 3.6, 1.6, 5, lit(head, { bias: -0.1 })); // underside
  for (const sd of [1, -1]) for (let i = 0; i < 3; i++) { // legs: femur out and up, a knee, the tibia down to a hooked tarsus
    const z = 3 - i * 3;
    taper(b, sd * 2.6, -1.4, z, sd * 4.8, -0.4, z + 0.3, 0.9, 0.7, head[2]);
    taper(b, sd * 4.8, -0.4, z + 0.3, sd * 5.6, -3.4, z + 0.8 - i * 0.4, 0.7, 0.45, head[1]);
    b.set(Math.round(sd * 5.6 - (sd < 0 ? 1 : 0)), -4, Math.round(z + 1.4 - i * 0.4), 0xc8b890);
  }
  gloss(b, { k: 0.55, min: 0.8, filter: (x, y, z) => z < 4 });
  bake(b, { ao: 0.35, rim: 0.2 });
  // (no simple face) faceted compound eyes set into the head's sides, a clypeus plate, curved
  // serrated mandibles, palps
  const fac = new VB();
  for (const sd of [1, -1]) socketEye(b, fac, sd * 1.9, 0.4, sd, { r: 1.5, depth: 0.3, glow: true, iris: 0x2a3a4a, pupil: 0x101820, pr: 0, lid: 0, brow: false });
  fac.paint((x, y, z, c) => (c === 0xffffff ? undefined : (x + y + z) & 1 ? mix(c, 0x6ac8b8, 0.35) : c)); // facets
  b.merge(fac);
  b.ell(0, 1.2, 9.4, 1.8, 0.8, 0.9, head[2]); // clypeus
  for (const sd of [1, -1]) { taper(b, sd * 1.2, -0.8, 9, sd * 1.8, -1, 11, 0.8, 0.6, head[1]); taper(b, sd * 1.8, -1, 11, sd * 0.4, -1.2, 12.4, 0.6, 0.4, (x, y, z, t) => (t > 0.6 ? 0xc8b890 : head[0])); b.set(sd > 0 ? 1 : -2, -1, 11, 0xd8c8a0); }
  for (const sd of [1, -1]) { taper(b, sd * 1, 1.6, 8.4, sd * 3, 4.5, 11, 0.5, 0.4, head[2]); b.ell(sd * 3.2, 4.8, 11.2, 0.9, 0.9, 0.9, 0xc8ff7a); } // antennae, glowing tips
  const glow = new VB(122);
  glow.ell(0, -0.8, -4.6, 3.4, 2.4, 3.2, (x, y, z, nx, ny, nz) => (z % 2 === 0 && nz < 0.5 ? 0xa8e860 : ny < -0.3 ? 0xf8ffd0 : 0xd8ff8a));
  const wing = new VB(123);
  // a membrane wing with veins (pivot at its root, spreading +x)
  for (let z = -10; z <= 1; z++) for (let x = 0; x <= 5; x++) {
    const r = Math.hypot((x - 2.5) / 3, (z + 4.5) / 6);
    if (r > 1) continue;
    wing.set(x, 0, z, x === 1 || z === -3 || (x + z) % 5 === 0 ? 0x7ab8a0 : r > 0.82 ? 0xa8e0d0 : 0xd8fff0);
  }
  return { body: V(b), glow: V(glow), wing: V(wing) };
}

// ------------------------------------------------------------------ blind cave fish, frost shrimp
export function buildFish() {
  const b = new VB(131);
  const T = hramp(0xf2c8c4, 5, { step: 0.07 });
  b.ell(0, 0, 0.5, 3, 4.2, 7.2, (x, y, z, nx, ny, nz) => (ny < -0.45 ? 0xfff6f0 : lit(T)(x, y, z, nx, ny, nz)));
  b.ell(0, -0.6, 6.5, 2.4, 2.8, 2, lit(T, { bias: 0.06 })); // a blunt head
  // dorsal fin with rays, pectorals, a gill blush, faint ribs
  for (let z = -4; z <= 3; z++) for (let y = 4; y <= 4 + (z > -2 && z < 2 ? 3 : 2); y++) b.set(0, y, z, (z & 1) ? 0xf8b8bc : 0xffd8dc);
  for (const sd of [1, -1]) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) b.set(sd * (3 + j), -2 - i, 3 - j, j === 2 - i ? 0xffc8cc : 0xffe0e0); }
  b.paint((x, y, z, c) => (Math.abs(x) >= 2 && y > -2 && y < 2 && z > -4 && z < 3 && (z & 1) === 0 && b.open(x, y, z, Math.sign(x), 0, 0) ? mix(c, 0xe89aa0, 0.35) : undefined));
  bake(b, { ao: 0.25, rim: 0.3 });
  const fz = (x, y) => front(b, x, y);
  // (no simple face) blind: clouded eyes sunk in sockets under a ridge, nostrils, a gaping
  // underbite of needle teeth
  for (const sd of [1, -1]) socketEye(b, b, sd * 2.1, 1.6, sd, { r: 1.3, depth: 0.5, iris: 0xc8c0d4, pupil: 0xb0a8c0, sclera: 0xe8e4f0, pr: 0.35, lid: 0.35, tilt: 0.2, skin: T[2], brow: T[1], browR: 0.8 });
  nostrils(b, 0, 3, 2, { r: 0.5, col: 0x8a4a54 });
  mouth(b, 0, -1.4, { w: 5, h: 2.6, d: 2, curve: -0.2, gap: 1, fangs: [-0.7, 0.7], fang: 2, lower: true, tooth: 0xf8f4ff, gum: 0xc86a78, throat: 0x3a1420, lip: T[1] });
  gloss(b, { k: 0.35, min: 0.84 });
  const tail = new VB(132);
  // a forked fan with rays, on a short stem (the pivot is its root, z = -6)
  for (let z = -15; z <= -8; z++) for (let y = -8; y <= 8; y++) {
    const t = -8 - z, ay = Math.abs(y);
    if (ay > 1.5 + t * 1.05 || (t > 3 && ay < t - 3.5)) continue;
    tail.set(0, y, z, ay % 2 ? 0xf4b0b8 : t > 5 ? 0xffe8ea : 0xffd4d8);
  }
  for (let z = -9; z <= -5; z++) tail.box(-1, -1, z, 0, 1, z, z < -7 ? T[1] : T[2]);
  return { body: V(b), tail: V(tail, 0, 0, -3) };
}
export function buildShrimp() {
  const b = new VB(141);
  const C = hramp(0xf07a66, 5);
  // a curled body of shell segments, each with a lit rim, frost crystals on its back
  for (let i = 0; i < 7; i++) {
    const a = i * 0.42, r = 3.6 - i * 0.3;
    const cy = Math.sin(a) * -4.8, cz = 6 - Math.cos(a) * 3 - i * 2;
    b.ell(0, cy, cz, r * 0.85, r, 2.3, (x, y, z, nx, ny, nz) => (nz > 0.6 ? C[1] : lit(C)(x, y, z, nx, ny, nz)));
    if (i < 5 && i % 2 === 0) taper(b, 0, cy + r - 0.5, cz, 0.5, cy + r + 2.5, cz - 0.5, 0.9, 0.4, (x, y, z, t) => (t > 0.6 ? 0xf0ffff : 0x9ae0ff));
  }
  b.box(-4, -9, -9, 3, -9, -7, C[3]); b.box(-3, -10, -10, 2, -10, -9, C[4]); // the tail fan
  for (let i = 0; i < 5; i++) for (const sd of [1, -1]) taper(b, sd * 1.5, -2.5 - i * 0.3, 5 - i * 1.6, sd * 2.5, -5.5, 5.4 - i * 1.6, 0.5, 0.4, C[0]); // swimmerets
  // eye stalks with beady eyes, long antennae
  for (const sd of [1, -1]) { taper(b, sd * 1.5, 2, 7, sd * 2.6, 3.4, 8.4, 0.7, 0.6, C[2]); b.ell(sd * 2.8, 3.8, 8.8, 1.1, 1.1, 1.1, INK); b.set(sd > 0 ? 2 : -3, 4, 10, GLINT); }
  for (const sd of [1, -1]) taper(b, sd * 0.8, 1, 8, sd * 4, 6, 18, 0.4, 0.4, C[3]);
  gloss(b, { k: 0.45, min: 0.82 });
  bake(b, { ao: 0.3, rim: 0.2 });
  const tail = new VB(142); tail.set(0, 0, -1, C[1]);
  return { body: V(b), tail: V(tail) };
}

// ------------------------------------------------------------------ gem tortoise
export function buildTortoise(mossy) {
  const b = new VB(151);
  const S = hramp(0x6a8a4a, 6), skin = hramp(0x9aa070, 5), belly = hramp(0xd8c08a, 4);
  // a high dome of raised hex scutes: grooves between, growth rings lighter toward each centre
  const cell = 4.2;
  const scute = (x, z) => {
    const r = Math.floor(z / cell), q = Math.floor((x + (r & 1) * cell / 2) / cell);
    const cx = q * cell - (r & 1) * cell / 2 + cell / 2, cz = r * cell + cell / 2;
    return Math.max(Math.abs(x + 0.5 - cx), Math.abs(z + 0.5 - cz) * 1.1) / (cell / 2);
  };
  b.ell(0, 5, 0, 11.2, 8, 12.8, (x, y, z, nx, ny, nz) => {
    if (y < 4) return -1;
    const d = scute(x, z);
    if (d > 0.86) return S[0];
    return S[clamp(Math.floor((0.35 + ny * 0.3 + (1 - d) * 0.35) * 6), 1, 5)];
  });
  for (let z = -14; z <= 13; z++) for (let x = -12; x <= 11; x++) { const r = Math.hypot((x + 0.5) / 11.8, (z + 0.5) / 13.4); if (r < 1.02 && r > 0.82) b.set(x, 4, z, (x + z) % 3 ? S[2] : S[3]); } // marginal rim
  b.box(-8, 3, -10, 7, 3, 9, belly[1]); b.box(-6, 2, -8, 5, 2, 7, belly[0]);
  for (const [x, z] of [[6, 6], [-7, 6], [6, -8], [-7, -8]]) { b.ell(x + 0.5, 1.6, z + 0.5, 2.4, 3.2, 2.4, lit(skin)); for (const dx of [-1, 0, 1]) b.set(x + dx, 0, z + 2, 0xe8dcc0); } // stumpy legs, toenails
  taper(b, 0, 3, -12, 0, 2, -15, 1.4, 0.6, skin[2]);
  bake(b, { ao: 0.38, rim: 0.2 });
  if (mossy) {
    // a moss carpet, little sprouts and a tiny blue mushroom
    for (const v of b.list()) if (v.y >= 9 && b.open(v.x, v.y, v.z, 0, 1, 0) && b.n(v.x >> 1, v.y, v.z >> 1, 4) < 0.8) {
      b.set(v.x, v.y + 1, v.z, b.n(v.x >> 1, v.y, v.z >> 1, 5) < 0.5 ? 0x3a7a32 : 0x5aa84a);
      if (b.n(v.x, v.y, v.z, 6) < 0.06) { b.set(v.x, v.y + 2, v.z, 0x7ac85a); b.set(v.x, v.y + 3, v.z, 0x9ae070); }
    }
    taper(b, -3, 13, 2, -3, 16, 2, 0.6, 0.6, 0xf0e8d8); b.ell(-3, 16.6, 2, 2, 1.1, 2, (x, y, z, nx, ny) => (ny > 0.4 ? 0x9af0ff : 0x3ab0e0));
    b.set(4, 14, -3, 0xffd84a); b.set(5, 14, -3, 0xffffff); b.set(4, 14, -2, 0xffffff); b.set(3, 14, -3, 0xffffff); b.set(4, 13, -3, 0x4a8a3a); // a daisy
  } else {
    // the ruby: a faceted cluster growing out of the shell
    const R = [0x7a0a2a, 0xc01a3a, 0xff4a5a, 0xffb0b8];
    for (const [x, z, h, lean] of [[0, 0, 7, 0], [2.5, -1.5, 4.5, 0.6], [-2, 1.5, 4, -0.6], [0.5, 2.5, 3.5, 0.2]]) taper(b, x, 12, z, x + lean * 2, 12 + h, z - lean, 1.9, 0.6, (xx, y, zz, t) => R[Math.min(3, Math.floor(t * 3.2 + (xx > x ? 0.6 : 0)))]);
  }
  const head = new VB(152);
  head.ell(0, 0, 3, 3.8, 3.4, 4.6, lit(skin, { bias: 0.04 }));
  head.ell(0, -1, 6.6, 2.6, 2, 1.8, lit(skin, { bias: 0.1 })); // a beaky snout
  taper(head, 0, 0, -1, 0, -1, -4, 2.8, 2.6, skin[1]); // the neck
  bake(head, { ao: 0.3, rim: 0.2 });
  // (no simple face) heavy-lidded old eyes in deep sockets under a scaly brow, a hooked horn beak
  // with a ridge, a crease of a mouth along it, nostrils on top
  for (const sd of [1, -1]) socketEye(head, head, sd * 2.2, 1.6, sd, { r: 1.5, depth: 0.45, iris: 0x6a4a1a, pupil: INK, pr: 0.45, lid: 0.48, tilt: -0.1, skin: skin[2], brow: skin[1], browR: 0.9 });
  taper(head, -0.5, 0, 7, -0.5, -1.8, 8.8, 1.6, 0.7, (x, y, z, t) => (t > 0.7 ? 0xd8c8a0 : x === 0 && y > -1 ? 0xb8a880 : 0x9a8a62)); // the beak hook
  mouth(head, 0, -1.6, { w: 5, h: 1.4, d: 1, curve: 0.35, gap: 99, fangs: [], lip: 0x6a5a3a, gum: 0x8a4a3a, tongue: 0xb06060 });
  nostrils(head, 0, 0.8, 1.6, { r: 0.5, col: 0x2a2018 });
  return { body: V(b), head: V(head) };
}

// ------------------------------------------------------------------ rock crab
export function buildCrab(pal) {
  const T = pal.tones;
  const soft = hramp(0xf08a64, 5);
  const make = (shell) => {
    const b = new VB(161);
    b.ell(0, 3.2, 0, 6, 3, 5, lit(soft));
    // legs: three a side, jointed (up, out, down), banded
    for (const sd of [1, -1]) for (let i = 0; i < 3; i++) {
      const z = 2.5 - i * 2.6;
      taper(b, sd * 4.5, 2.5, z, sd * 8, 4.5, z - 0.5, 0.9, 0.8, soft[2]);
      taper(b, sd * 8, 4.5, z - 0.5, sd * 9.5, 0, z - 1, 0.8, 0.5, (x, y, zz, t) => (t > 0.75 ? soft[0] : soft[1]));
    }
    // claws: the right one big (a brawler), the left small
    for (const sd of [1, -1]) {
      const big = sd > 0, s = big ? 1.35 : 0.9;
      taper(b, sd * 4, 2.5, 4, sd * 6.5, 3.5, 7, 1, 1, soft[2]);
      b.ell(sd * 7, 3.6 * s, 8.5, 2.2 * s, 1.8 * s, 2.4 * s, lit(soft, { bias: 0.06 }));
      taper(b, sd * 7.5, 4.4 * s, 10, sd * 6.5, 4.6 * s, 12.5, 1.1 * s, 0.6, soft[3]);
      taper(b, sd * 7.5, 2.4 * s, 10, sd * 6.8, 2.6 * s, 11.8, 0.9 * s, 0.5, soft[1]);
      b.set(sd > 0 ? 6 : -7, Math.round(4.6 * s), 13, 0xfff0e0);
    }
    if (shell) {
      // a borrowed chunk of the wall: rock with plates, a crystal and moss on top
      b.ell(0, 6, -1, 8.4, 6, 7.6, (x, y, z, nx, ny, nz) => (y < 4 ? -1 : lit(T, { clump: 0.35, cs: 3.5, seed: 4 })(x, y, z, nx, ny, nz)));
      for (const v of b.list()) if (v.y > 9 && b.open(v.x, v.y, v.z, 0, 1, 0) && v.x < -1 && b.n(v.x >> 1, 0, v.z >> 1, 3) < 0.6) b.set(v.x, v.y + 1, v.z, b.n(v.x, 1, v.z, 4) < 0.5 ? 0x4a8a3a : 0x6ab04a);
      taper(b, 2.5, 10, -1, 4, 15, -2, 1.5, 0.5, (x, y, z, t) => mix(pal.acc, 0xffffff, t * 0.6));
      taper(b, 4, 9.5, 1, 6, 12.5, 1.5, 1, 0.4, (x, y, z, t) => mix(pal.acc, 0xffffff, t * 0.5));
    }
    bake(b, { ao: 0.35, rim: 0.2 });
    // eye stalks: tall, beady black eyes with glints
    const top = shell ? 12 : 7;
    for (const sd of [1, -1]) {
      const x = sd * 2;
      taper(b, x, 5, 4, x + sd * 0.5, top, 4.5, 0.7, 0.6, soft[3]);
      b.ell(x + sd * 0.5, top + 1, 4.6, 1.3, 1.4, 1.3, INK);
      b.set(sd > 0 ? 2 : -3, top + 2, 6, GLINT);
    }
    gloss(b, { k: 0.3, min: 0.86 });
    return V(b);
  };
  return { shell: make(true), naked: make(false), dust: c01(T[1]) };
}

// ------------------------------------------------------------------ ore slug
export function buildSlug() {
  const b = new VB(171);
  const g = hramp(0x5ab07a, 6), foot = hramp(0xc8f0b8, 4);
  // a glossy wet body, a frilled pale foot, eye stalks, nuggets of ore set in its back
  b.ell(0, 1.4, 0, 4.6, 4.2, 9.6, (x, y, z, nx, ny, nz) => (y < 0 ? -1 : lit(g, { bias: 0.05 })(x, y, z, nx, ny, nz)));
  b.ell(0, 0.6, 7.5, 3.4, 3.2, 3.2, lit(g, { bias: 0.1 }));
  for (let z = -10; z <= 11; z++) for (let x = -6; x <= 5; x++) { const r = Math.hypot((x + 0.5) / 5.6, (z + 0.5) / 10.6); if (r < 1 && r > 0.72 && (z & 1)) b.set(x, 0, z, foot[r > 0.86 ? 1 : 2]); }
  for (let z = -8; z <= 6; z += 3) for (const x of [-4, 3]) b.set(x, 2, z, g[1]); // breathing pore line
  const ore = [[1.5, 5, -2, 0xf0c040], [-2, 4.6, 1, 0xd8dce8], [0, 4, -6, 0xf0c040], [-1, 5, 4.5, 0x6ad8c8]];
  for (const [x, y, z, c] of ore) b.ell(x, y, z, 1.4, 1.2, 1.4, (xx, yy, zz, nx, ny) => (ny > 0.4 ? mix(c, 0xffffff, 0.45) : nx > 0.3 ? mul(c, 0.7) : c));
  bake(b, { ao: 0.3, rim: 0.25 });
  gloss(b, { k: 0.55, min: 0.78, col: 0xf0fff8 });
  for (const sd of [1, -1]) {
    taper(b, sd * 1.4, 3, 8.5, sd * 2.6, 8, 10, 0.8, 0.6, g[3]);
    b.ell(sd * 2.7, 8.6, 10.2, 1.2, 1.2, 1.2, INK); b.set(sd > 0 ? 2 : -3, 9, 11, GLINT);
  }
  // (no simple face) a lipped mouth with a rasping radula, two oral tentacles beside it
  mouth(b, 0, 1.4, { w: 4, h: 2, d: 2, curve: 0.1, gap: 1, fangs: [], lower: true, tooth: 0xe8f0d8, gum: 0x3a6a4a, throat: 0x10200a, lip: g[2], tongue: 0x8ab070 });
  for (const sd of [1, -1]) taper(b, sd * 2, 1.6, 10.6, sd * 3.4, 0.4, 12.6, 0.7, 0.4, g[3]);
  return { body: V(b), slime: c01(g[4]) };
}

// ------------------------------------------------------------------ crystal spider
export function buildSpider() {
  const body = new VB(181);
  const C = hramp(0x8ac0e8, 5), D = hramp(0x4a5a8a, 4);
  // a round faceted abdomen with crystal spikes, a little head with two big eyes and four small
  body.ell(0, 5.2, -3.6, 4.8, 4, 5.6, (x, y, z, nx, ny, nz) => C[clamp(Math.floor((0.4 + ny * 0.35 + (((nx > 0.3) + (nz > 0.3) * 2 + (ny > 0.5) * 3) % 4) * 0.08) * 5), 0, 4)]);
  body.ell(0, 4.4, 2.8, 3.2, 2.6, 3.2, lit(D, { bias: 0.1 }));
  for (const [x, z, h, lx] of [[0, -3, 5, 0], [2, -6, 3.5, 1], [-2, -5, 3.5, -1], [0, -7.5, 2.5, 0]]) taper(body, x, 8, z, x + lx, 8 + h, z - 1, 1.3, 0.4, (xx, y, zz, t) => (t > 0.6 ? 0xf0ffff : xx > x ? C[3] : C[2]));
  bake(body, { ao: 0.3, rim: 0.25 });
  // (no simple face) two big glossy eyes and four small ones, each set in its own socket, a brow
  // plate of crystal, chelicerae with fangs
  for (const sd of [1, -1]) socketEye(body, body, sd * 1.4, 4.6, sd, { r: 1.2, depth: 0.3, glow: true, iris: 0xff5a7a, pupil: 0x2a0812, pr: 0.45, lid: 0, brow: C[3], browR: 0.7 });
  for (const [x, y] of [[3.2, 6.2], [-3.2, 6.2], [1.2, 6.9], [-1.2, 6.9]]) socketEye(body, body, x, y, Math.sign(x), { r: 0.7, depth: 0.2, glow: true, iris: 0xff8aa8, pupil: 0x3a0a1a, pr: 0, lid: 0, brow: false });
  for (const sd of [1, -1]) { taper(body, sd * 1, 3.2, 5.6, sd * 1.2, 1.6, 6.6, 0.9, 0.7, D[2]); taper(body, sd * 1.2, 1.6, 6.6, sd * 0.5, 0.6, 6.4, 0.6, 0.3, 0xf0f8ff); }
  const frames = [0, 1].map((f) => {
    const b = new VB(182);
    for (const sd of [1, -1]) for (let i = 0; i < 4; i++) {
      const z = 3 - i * 2.2, lift = (i + f) % 2 ? 2 : 0, X = (x) => sd * x, kz = z + (i - 1.5) * 1.2;
      // (no stick legs) a thick hairy femur, a faceted crystal knee, a tapering tibia, a hooked tip
      taper(b, X(2.6), 4.4, z, X(7), 8 + lift, kz, 1.6, 1.2, D[2]);
      b.ell(X(7), 8.4 + lift, kz, 1.5, 1.6, 1.5, (x, y, zz, nx, ny) => (ny > 0.3 ? C[4] : C[2])); // a crystal knee
      taper(b, X(7), 8 + lift, kz, X(9.6), 2 + lift * 0.6, z + (i - 1.5) * 2, 1.2, 0.8, (x, y, zz, t) => (t < 0.15 ? C[3] : D[1]));
      taper(b, X(9.6), 2 + lift * 0.6, z + (i - 1.5) * 2, X(10.4), lift * 0.6, z + (i - 1.5) * 2.2 + 0.6, 0.7, 0.4, C[4]);
    }
    return V(b);
  });
  return { body: V(body), legs: frames, glit: c01(C[4]) };
}

// ------------------------------------------------------------------ void wisp
export function buildVoidWisp() {
  const b = new VB(191);
  const C = [0x1a0838, 0x3a1470, 0x6a2ab8, 0xa060f0, 0xd8b0ff, 0xf8eaff];
  // an inky flame: a round body, two tongues curling up, a bright rim, stars inside; hollow eyes
  const sh = (x, y, z, nx, ny, nz) => {
    const rim = 1 - Math.abs(nz);
    const k = 0.25 + ny * 0.2 + rim * 0.35 + (y > 4 ? 0.15 : 0);
    return C[clamp(Math.floor(k * 6), 0, 5)];
  };
  b.ell(0, 0, 0, 6.6, 6.2, 6.2, sh);
  b.ell(0.5, 5.6, -1, 4.6, 4.4, 4.2, sh);
  taper(b, 1, 9, -1.5, 3, 15, -2, 2.6, 0.6, sh);
  taper(b, -2, 8, -1, -4.5, 12.5, -0.5, 2, 0.6, sh);
  taper(b, 3, 15, -2, 1.5, 17, -1, 0.7, 0.4, C[5]);
  b.paint((x, y, z, c) => (b.n(x, y, z, 7) > 0.975 && z < 3 ? C[5] : undefined)); // stars in the dark
  // (no simple face) a face of the dark itself: heavy brow ridges, deep sockets with a cold glowing
  // slit-pupilled eye in each (one wider than the other), a gaping jaw of crystal shard teeth
  for (const sd of [1, -1]) socketEye(b, b, sd * 2.7, 1.2, sd, { r: sd > 0 ? 1.9 : 1.6, depth: 0.7, glow: true, iris: 0xc8a0ff, pupil: 0x12041e, slit: true, pr: 0.5, lid: sd > 0 ? 0.2 : 0.3, tilt: 0.45, skin: C[2], brow: C[3], browR: 1.1 });
  mouth(b, 0, -3, { w: 7, h: 3.4, d: 3, curve: -0.3, asym: -0.4, gap: 2, fangs: [-0.55, 0.45], fang: 2, lower: true, tooth: 0xd8c0ff, gum: C[1], throat: 0x05010c, tongue: C[2], lip: C[2] });
  return { body: V(b), mote: [0.7, 0.45, 1] };
}
