// Hats built in the head's own frame so they hug the skull: miner helmet (brim, rivets,
// dents, headlamp with a glowing lens), hardhat, cap, knit beanie with pom-pom, bandana with
// a knot, bow and top hat. Plus spectacles/monocle and the elders' carved cane.
import { Vox, mix, dk, lt, lum, h3, cached, PX, NX, PY, NY, PZ, NZ } from './vox.js';
import { skullRow } from './head.js';

function seatKey(info) { return `${info.W}|${info.H}|${info.D}|${info.n}`; }

/** Hat geometry for a head: { geo, lens?: geo, lamp?: [x,y,z] } in head-local voxels. */
export function buildHat(spec, info, bake) {
  const hat = spec.hat || 'none';
  if (hat === 'none') return null;
  const hc = spec.hatColor ?? 0xe0b030;
  const dirt = Math.round((spec.dirt ?? 0.4) * 3);
  const ears = info.earKind === 'long' || info.earKind === 'pointy' || info.earKind === 'oval' ? info.earKind : '';
  // frogs wear their hats on a smaller crown behind the eye bumps (the mesh is shifted back)
  const seat = info.frog ? { ...info, hx: info.hx * 0.66, hz: info.hz * 0.62, hy: info.hy * 1.02, n: 2.6, browY: info.H - 3.2, topAt: (x, z) => info.topAt(x, z - 4) } : info;
  // the bow sits on the head's actual top (tufts, quills); the band follows the brow line
  const topKey = hat === 'bow' ? seat.topAt(seat.hx * 0.36, 2.5) : 0;
  return cached(`hat|${hat}|${hc}|${seatKey(info)}|${info.frog ? 'frog' : ''}|${info.browY}|${topKey}|${dirt}|${ears}|${bake}`, () => ({ ...makeHat(hat, hc, seat, dirt, bake), offset: info.frog ? [0, 0.6, -4] : null }));
}

function makeHat(hat, hc, info, dirt, bake) {
  const { H, hx, hy, hz, n } = info;
  const v = new Vox(-hx - 6, hx + 6, H - 9, H + 16, -hz - 8, hz + 9);
  const band = Math.round(info.browY) + 1; // hat band sits just above the brows
  // the skull grown outward by k (sides) and ky (top), optionally rounder (nh < n)
  const shell = (k, ky, y0, y1, m, nh = 0, sx = 1, pred = null) => v.seRows(0, 0, y0, y1, hx + k + 2, hz + k + 2, skullRow(hx, hy, hz, n, k, ky, sx, nh === n ? 0 : nh), 0, m, pred);
  const empty = (x, y, z) => !v.has(x, y, z);
  let lens = null, lamp = null;

  if (hat === 'helmet' || hat === 'hardhat') {
    // a hard dome: hugs the skull at the band, rounds off above it
    // boxy hard shell: big flat top, steep sides, so it reads smooth rather than woven
    shell(1.0, 1.0, band, H + 2, 1);
    shell(1.0, hat === 'helmet' ? 3.6 : 3, band + 2, H + 7, 1, 3.3, 0.96);
    // rim band: a hardhat's is proud, the helmet's is painted
    if (hat === 'hardhat') shell(1.6, 1.6, band, band + 1, 2, n, 1, empty);
    else v.paint((x, y, z, c, m) => (m === 1 && y <= band + 1 ? undefined : undefined));
    // brim: a short visor in front (helmet) or a full brim all around (hardhat)
    const front = hat === 'helmet' ? 2.4 : 3, around = hat === 'hardhat' ? 1.5 : 0;
    v.fill(-hx - 6, hx + 6, band - 1, band - 1, -hz - 6, hz + 6, (x, y, z) => {
      const fx = Math.abs(x) / (hx + 1.6 + around + (z > 0 ? 0.6 : 0));
      const fz = z > 0 ? z / (hz + 1.4 + front) : -z / (hz + 1.4 + around);
      if (fx ** 2.4 + fz ** 2.4 > 1) return false;
      return hat === 'hardhat' || z > hz * 0.25;
    }, 0, 3);
    // crest ridges over the crown
    const ridges = hat === 'helmet' ? [0] : [-4, 0, 4];
    for (const rx of ridges) {
      for (let z = -hz; z <= hz; z++) for (const x of [Math.floor(rx) - 1, Math.floor(rx)]) {
        const t = v.topY(x, z);
        if (isFinite(t) && t > band + 3) v.setM(x, t + 1, z, 4);
      }
    }
    // rivets around the band
    for (let i = 0; hat === 'helmet' && i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const dx = Math.sin(a), dz = Math.cos(a);
      if (dz > 0.8) continue; // the lamp sits there
      // step inward until we touch the band, then sit on its surface
      for (let k = 0; k < 5; k++) {
        const xx = Math.round(dx * (hx + 3 - k) - 0.5), zz = Math.round(dz * (hz + 3 - k) - 0.5);
        if (v.has(xx, band, zz)) { v.set(Math.round(dx * (hx + 4 - k) - 0.5), band, Math.round(dz * (hz + 4 - k) - 0.5), mix(hc, 0xd8d8d0, 0.55)); break; }
      }
    }
    if (hat === 'helmet') {
      // headlamp: a round housing on a bracket, with a glowing lens
      const ly = band + 3.5;
      const fz = Math.max(...[-2, -1, 0, 1].map((x) => v.frontZ(x, Math.round(ly))));
      v.box(-4, Math.round(ly) - 1, fz - 1, 4, Math.round(ly) + 1, fz + 1, 0, 6); // bracket strap
      v.fill(-4, 4, ly - 4, ly + 4, fz, fz + 2, (x, y, z) => x * x + (y - ly) ** 2 <= 3.1 * 3.1, 0, 5);
      lens = new Vox(-4, 4, band - 1, band + 8, fz, fz + 5);
      const lz = fz + 3;
      lens.fill(-4, 4, ly - 3, ly + 3, lz, lz, (x, y) => x * x + (y - ly) * (y - ly) <= 2.3 * 2.3, (x, y) => {
        const hl = Math.hypot(x + 0.5 + 0.8, y + 0.5 - ly - 0.8);
        return hl < 0.9 ? 0xffffff : Math.hypot(x + 0.5, y + 0.5 - ly) < 1.5 ? 0xfff6c8 : 0xffd25a;
      });
      lamp = [0, ly, lz + 2];
    }
    // a few dents and scratches, not noise
    const marks = [[-7, band + 3, 'd'], [6, band + 6, 'd'], [-5, band + 6, 's'], [7, band + 2, 's']];
    const scratches = (x, y, z) => {
      if (z < 0) return 0;
      for (const [mx, my, k] of marks) {
        if (k === 'd' && x === mx && y === my) return 1;
        if (k === 's' && y - my === x - mx && x >= mx && x < mx + 3) return 2;
      }
      return 0;
    };
    v.resolve({
      1: (x, y, z, e) => {
        let c = hc;
        if (y <= band + 1) return (e & NY) ? dk(hc, 0.4) : dk(hc, 0.2); // band
        if (z < -hz * 0.3) c = dk(c, 0.08);
        // a clean highlight on the flat crown, toward the front
        if ((e & PY) && !(e & (PX | NX | PZ | NZ)) && z > -2 && x < 2 && x > -7) c = lt(c, 0.16);
        const s = scratches(x, y, z);
        if (s === 1) c = dk(c, 0.2); else if (s === 2) c = lt(c, 0.4);
        if (dirt && h3(x >> 1, y >> 1, z >> 1, 23) < dirt * 0.04) c = mix(c, 0x5a4028, 0.45);
        return c;
      },
      2: (x, y, z, e) => (e & NY ? dk(hc, 0.4) : dk(hc, 0.2)),
      3: (x, y, z, e) => (e & NY ? dk(hc, 0.45) : e & PY ? dk(hc, 0.1) : dk(hc, 0.26)),
      4: (x, y, z, e) => (e & PY ? lt(hc, 0.14) : dk(hc, 0.1)),
      5: (x, y, z, e) => (e & PZ ? (Math.hypot(x + 0.5, y + 0.5 - (band + 3.5)) > 2.4 ? 0x7a7a84 : 0x3a3a42) : e & PY ? 0x6a6a74 : 0x4a4a54),
      6: () => 0x2a2a30,
    });
  } else if (hat === 'cap') {
    // soft six-panel crown, button on top, a bill out front
    shell(0.9, 1.6, band, H + 4, 1, Math.min(n, 2.8));
    v.fill(-hx, hx, band - 1, band, 0, hz + 8, (x, y, z) => {
      const ax = Math.abs(x);
      const reach = hz + 5 - (ax / 6.6) ** 2 * 4;
      if (ax > 6.8 || z > reach || z < hz - 3) return false;
      return ax > 4.6 ? y < band : y < band + 1; // the edges droop
    }, 0, 2);
    const top = v.topY(0, 0);
    v.box(-1, top + 1, -1, 1, top + 2, 1, 0, 3);
    v.resolve({
      1: (x, y, z, e) => {
        let c = hc;
        const a = Math.atan2(x + 0.5, z + 0.5);
        const seam = Math.abs(((a / (Math.PI / 3)) % 1 + 1) % 1 - 0.5) > 0.44;
        if (seam && y > band + 1) c = dk(c, 0.16);
        if (y === band) c = dk(c, 0.12);
        if ((e & PZ) && Math.abs(x + 0.5) < 2 && y >= band + 2 && y <= band + 3) c = lt(c, 0.6); // little emblem
        if (dirt && h3(x >> 1, y >> 1, z >> 1, 29) < dirt * 0.04) c = mix(c, 0x5a4028, 0.4);
        return c;
      },
      2: (x, y, z, e) => {
        if (e & NY) return dk(hc, 0.4);
        const ax = Math.abs(x + 0.5);
        const edge = z >= hz + 5 - (ax / 6.6) ** 2 * 4 - 1.2;
        return edge && (x + z) % 2 === 0 ? lt(hc, 0.22) : dk(hc, 0.1);
      },
      3: () => dk(hc, 0.3),
    });
  } else if (hat === 'beanie') {
    // a slouchy knit hat pulled down to the brows, with a folded cuff and a pom-pom
    const b0 = band - 1;
    shell(0.9, 0.9, b0, H + 2, 1);
    shell(0.9, 4.6, b0 + 3, H + 7, 1, 2.3, 0.94);
    shell(1.6, 1.6, b0, b0 + 2, 2, n, 1, empty);
    const top = v.topY(0, -1);
    v.ell(0, top + 2.4, -1, 3.2, 3, 3.2, 0, 3);
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4, b = (i % 5) * 0.6 - 1.2;
      v.setM(Math.round(Math.cos(a) * 3.4 - 0.5), Math.round(top + 2.4 + b * 2.1), Math.round(-1 + Math.sin(a) * 3.4 - 0.5), 3);
    }
    const pom = lum(hc) > 0.7 ? 0xc94a3a : 0xf6f2ea;
    v.resolve({
      1: (x, y, z, e) => {
        // knit rows: a lighter row of stitches every third course
        let c = (y - b0) % 3 === 0 ? lt(hc, 0.1) : (y - b0) % 3 === 1 ? hc : dk(hc, 0.07);
        if ((e & PY) && !(e & ~PY & 0x3f)) c = lt(c, 0.04);
        return c;
      },
      2: (x, y, z) => {
        const a = Math.atan2(x + 0.5, z + 0.5);
        const col = Math.round(a * (hx + 2) / 1.1);
        let c = (col & 1) ? dk(hc, 0.04) : dk(hc, 0.24);
        if (y === b0) c = dk(c, 0.1);
        return c;
      },
      3: (x, y, z, e) => {
        let c = pom;
        if (h3(x, y, z, 31) < 0.3) c = dk(c, 0.08);
        if (e & PY) c = lt(c, 0.1);
        return c;
      },
    });
  } else if (hat === 'bandana') {
    // a thin cloth wrap with a folded front hem and a knot at the back
    shell(0.7, 0.9, band, H + 2, 1);
    shell(1.3, 1.3, band - 1, band, 2, n, 1, empty);
    const kz = v.backZ(0, band + 1);
    v.ell(0, band + 1, kz - 1, 2.1, 1.8, 1.7, 0, 2);
    v.line(-1.2, band, kz - 1.4, -3.4, band - 7, kz - 3.4, 0, 1.05, 1);
    v.line(1.2, band, kz - 1.4, 2.8, band - 5.6, kz - 3.6, 0, 1.05, 1);
    v.resolve({
      1: (x, y, z, e) => {
        let c = hc;
        if ((x + 40) % 4 === 0 && (y + 40 + (((x + 40) >> 2) & 1) * 2) % 4 === 0) c = 0xf8f4ec; // polka dots
        if (e & NY) c = dk(c, 0.15);
        return c;
      },
      2: (x, y, z, e) => (e & NY ? dk(hc, 0.3) : (y + x) % 3 === 0 ? dk(hc, 0.16) : dk(hc, 0.06)),
    });
  } else if (hat === 'bow') {
    // a ribbon bow on top, toward the front
    const cx = hx * 0.36, cz = 2.5;
    const ht = info.topAt(cx, cz);
    const cy = (isFinite(ht) ? ht : H - 1) + 1.4;
    for (const s of [-1, 1]) {
      // loops: hollow ovals tilted up and out
      v.fill(cx + s * 0.5 - 6, cx + s * 0.5 + 6, cy - 3, cy + 5, cz - 3, cz + 3, (x, y, z) => {
        const lx = (x - cx) * s - 3.2, ly = y - cy - 0.9 - (lx * 0.25);
        const r = (lx / 3.4) ** 2 + (ly / 2.3) ** 2;
        return r <= 1 && Math.abs(z - cz) < 1.3 && !(r < 0.32 && z > cz);
      }, 0, 1);
      v.line(cx + s * 0.6, cy - 1, cz + 0.6, cx + s * 2.6, cy - 4.4, cz + 1, 0, 0.85, 1);
    }
    v.ell(cx, cy + 0.4, cz + 0.3, 1.5, 1.5, 1.6, 0, 2);
    v.resolve({
      1: (x, y, z, e) => (e & NY ? dk(hc, 0.24) : (e & PY) ? lt(hc, 0.2) : (e & PZ) && h3(x, y, 1, 3) < 0.2 ? lt(hc, 0.1) : hc),
      2: (x, y, z, e) => (e & PY ? dk(hc, 0.05) : dk(hc, 0.18)),
    });
  } else if (hat === 'tophat') {
    const y0 = H - 2.4;
    v.fill(-hx - 4, hx + 4, y0, y0 + 2, -hz - 4, hz + 4, (x, y, z) => {
      const f = (x / (hx + 3.2)) ** 2 + (z / (hz + 2.8)) ** 2;
      if (f > 1) return false;
      const curl = Math.abs(x) > hx + 1 ? 1 : 0;
      return y < y0 + 1 + curl;
    }, 0, 1);
    const top = y0 + 13;
    v.fill(-hx, hx, y0, top, -hz, hz, (x, y, z) => {
      const flare = 1 + (y - y0) / 13 * 0.08;
      return (x / (hx * 0.6 * flare)) ** 2 + ((z + 0.5) / (hz * 0.62 * flare)) ** 2 <= 1;
    }, 0, 2);
    const bandC = lum(hc) < 0.2 ? 0xc94a3a : dk(hc, 0.45);
    v.resolve({
      1: (x, y, z, e) => (e & NY ? dk(hc, 0.3) : e & PY ? lt(hc, 0.1) : hc),
      2: (x, y, z, e) => {
        if (y >= y0 + 1 && y < y0 + 4) return y === y0 + 3 ? lt(bandC, 0.15) : bandC;
        let c = hc;
        if (e & PY) return lt(c, 0.12);
        if (x < -1 && x > -5 && (e & PZ)) c = lt(c, 0.16); // satin sheen
        return c;
      },
    });
  }
  return { geo: v.geometry(bake), lens: lens ? lens.geometry(bake) : null, lamp };
}

// ---------------------------------------------------------------- spectacles
export function buildGlasses(spec, info, bake) {
  if (!spec.glasses) return null;
  const mono = spec.glasses === 'monocle';
  // gold frames on dark fur, and some dark horn-rims on light fur
  const col = mono || lum(spec.fur ?? 0x3a2e2a) < 0.35 || (spec.seed | 0) % 3 ? 0xd0a850 : 0x3a2a2a;
  return cached(`glasses|${mono}|${col}|${info.W}|${info.eyes[0].y}|${info.eyes[0].z}|${info.eyes[1].z}|${info.hz}|${bake}`, () => {
    const { hx, hz } = info;
    const v = new Vox(-hx - 3, hx + 3, -14, 22, -hz - 2, hz + 6);
    const sides = mono ? [1] : [-1, 1];
    let zRing = 0;
    for (const e of info.eyes) if (sides.includes(e.side)) zRing = Math.max(zRing, Math.ceil(e.z) + 1);
    for (const e of info.eyes) {
      if (!sides.includes(e.side)) continue;
      const cx = e.x, cy = e.y;
      v.fill(cx - 5, cx + 5, cy - 5, cy + 5, zRing, zRing + 1, (x, y) => {
        const r = Math.hypot(x - cx, (y - cy) * 1.05);
        return r <= 3.9 && r >= 2.9;
      }, (x, y) => (y > cy + 1 && x < cx ? lt(col, 0.3) : col));
      v.set(Math.floor(cx) - 1, Math.floor(cy) + 1, zRing, 0xf4f8ff); // glint
      if (!mono) {
        // temple arm back along the side of the head
        const sx = e.side * (hx + 0.4);
        v.path([[cx + e.side * 3.6, cy + 1, zRing], [sx, cy + 1, zRing - 2.5], [sx, cy + 1, -2]], col);
      } else {
        // a little chain down to the waistcoat
        v.path([[cx + 2.8, cy - 2.6, zRing], [cx + 4.2, cy - 8, zRing - 1], [cx + 3, cy - 13, zRing - 2]], (x, y) => ((x + y) % 2 ? col : dk(col, 0.25)));
      }
    }
    if (!mono) v.box(-2, Math.floor(info.eyes[0].y) + 1, zRing, 2, Math.floor(info.eyes[0].y) + 2, zRing + 1, col);
    return v.geometry(bake);
  });
}

// ---------------------------------------------------------------- cane
/** A walking cane with a carved crook; origin at the grip, shaft runs down -y for `len` voxels. */
export function buildCane(len, bake) {
  len = Math.max(8, Math.round(len));
  return cached(`cane|${len}|${bake}`, () => {
    const v = new Vox(-3, 3, -len - 1, 9, -3, 8);
    const wood = 0x7a5030, dark = 0x5a3820, light = 0x9a6a40;
    v.box(-1, -len, -1, 1, 3, 1, (x, y) => (y < -len + 2 ? 0xc8a050 : (y + 60) % 7 === 0 ? dark : x === -1 ? light : wood));
    // carved crook curling forward over the paw
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI - (i / 14) * Math.PI * 1.05;
      const cy = 3 + Math.sin(a) * 3.4, cz = 3.4 + Math.cos(a) * 3.4;
      v.ell(-0.5 + 0.5, cy, cz, 1.2, 1.2, 1.2, i % 4 === 0 ? light : i === 14 ? dark : wood);
    }
    v.ell(0, 3 + Math.sin(-0.05 * Math.PI) * 3.4, 3.4 + Math.cos(-0.05 * Math.PI) * 3.4 + 0.3, 1.6, 1.6, 1.6, dark); // knob
    v.box(-1, 1, -1, 1, 2, 1, 0xc8a050); // brass collar
    return v.geometry(bake);
  });
}
