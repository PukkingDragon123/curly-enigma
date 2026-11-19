// Wave 16: one design per mushroom and flower species instead of a shared dome/cone/flat cluster
// (the ids in plants.js MODELS stay the same; only how each one is drawn changed):
//
//   lanterns   (fungusCyan)    tall bell caps, ribbed, with a glowing gill skirt and a lit tip
//   witchHats  (fungusViolet)  tall cones whose tips flop over, a spiral band and star specks
//   frills     (fungusPink)    tiers of ruffled, wavy-edged shelves stacked up one stalk
//   dotDomes   (fungusBlue)    fat domes with rings of glowing dots, a skirt and a bulb foot
//   trumpets   (fungusAmber)   chanterelle funnels: hollow wavy-rimmed cups, ridges down the stem
//   porcini    (fungusBrown)   a fat netted club stem under a glossy bun cap with pores beneath
//   parasols   (brownCap)      a snakeskin stalk, a ring, a wide flat cap with rings of scales
//   toadstools (toadstool)     red domes with raised warts, white gills, a skirt, a cup at the foot
//   shaggy     (inkcap)        tall shaggy bullets dissolving into ink drips at the edge
//   glowStalks (glowShroom)    tall stalks with banded glowing caps and hanging droplets
//   bonnets    (mushTiny)      a tight fan of tiny conical bonnets on wiry stems
//   morels     (emberCap)      honeycombed cones, ember light glowing in the pits
//   icicles    (frostCap)      frosty cones with icicles hanging off the rim
//   earthstar  (puffballs)     a warty puffball sitting on a star of split, curled rays
//   bellArch   (flowerCyan)    an arching stem hung with a row of glowing bells (or a ribbed lantern)
//   crystalBloom (flowerViolet, flowerFrost)  faceted crystal petals round a glowing core
//   pitcher    (flowerPink)    pitcher plants: veined tubes with a glowing lip and a lid
//   fireLily   (flowerEmber)   recurved petals and long glowing stamens
//   bellVine   (vineBerry)     a hanging vine hung with little glowing bells
//
// Every builder is (r, RAMPS) → { g, pivot, mode } like the others in plants.js.
import { VG, tone, DIR8 } from './vox.js';
import { ph } from './paint.js';

const TAU = Math.PI * 2;

/**
 * Lathe: layers from y up, radius rad(h, a) (h 0..1 up the height H), col(h, a, d, rim) → colour
 * (< 0 skips), glow(h, a, d, rim). shell: only the outer ring (hollow pitchers and funnels). Centre
 * cx(h), cz(h) may wander (a flopping tip).
 */
function lathe(g, cx, y, cz, H, rad, col, glow = () => 0, o = {}) {
  const top = Math.max(1, Math.round(H));
  for (let yy = 0; yy < top; yy++) {
    const h = (yy + 0.5) / top;
    const ox = o.ox ? o.ox(h) : 0, oz = o.oz ? o.oz(h) : 0;
    const rmax = rad(h, 0) * 1.4 + 1.5;
    for (let z = Math.floor(cz + oz - rmax); z <= Math.ceil(cz + oz + rmax); z++)
      for (let x = Math.floor(cx + ox - rmax); x <= Math.ceil(cx + ox + rmax); x++) {
        const dx = x - cx - ox, dz = z - cz - oz, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx), r = rad(h, a);
        if (d > r || r < 0.3) continue;
        const rim = d > r - 1.05;
        if (o.shell && d < r - (o.shell || 1)) continue;
        const c = col(h, a, d / Math.max(0.5, r), rim, x, y + yy, z);
        if (c >= 0) g.set(x, y + yy, z, c, glow(h, a, d / Math.max(0.5, r), rim));
      }
  }
  return y + top - 1;
}
/** A stem from (x, y, z) up h voxels, w wide (1 or 2), leaning (lx, lz) per voxel; col(t, edge). Returns the top [x, y, z]. */
function stalk(g, x, y, z, h, w, col, lx = 0, lz = 0, glow = 0) {
  let tx = x, tz = z;
  for (let k = 0; k <= h; k++) {
    const t = k / Math.max(1, h);
    tx = x + lx * k * k / Math.max(1, h); tz = z + lz * k * k / Math.max(1, h);
    for (let q = 0; q < w; q++) for (let p = 0; p < w; p++) g.set(tx + q, y + k, tz + p, col(t, q + p === 0 ? 0 : 1), typeof glow === 'function' ? glow(t) : glow);
  }
  return [tx + (w - 1) / 2, y + h, tz + (w - 1) / 2];
}
/** Spots round a cluster centre for n mushrooms: [{x, z, big}] (the first one big, in the middle). */
function spread(r, n, c, d0 = 3.5, d1 = 9) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = i ? d0 + r() * (d1 - d0) : r() * 1.2;
    out.push({ x: Math.round(c + Math.cos(a) * d), z: Math.round(c + Math.sin(a) * d), big: i === 0, k: i ? 0.45 + r() * 0.35 : 1 });
  }
  return out;
}
const wob = (seed, k = 0.1) => { const p1 = ph(seed, 1, 5) * TAU, p2 = ph(seed, 2, 5) * TAU; return (a) => 1 + k * Math.sin(3 * a + p1) + k * 0.6 * Math.sin(5 * a + p2); };

// ---------------------------------------------------------------- mushrooms
export function lanterns(r, R) {
  const W = 35, g = new VG(W, 34, W), c = 17, C = R.cyan, S = R.stem;
  for (const m of spread(r, r.int(3, 6), c, 4, 12)) {
    const h = Math.round((m.big ? r.int(11, 15) : r.int(4, 8)) * (m.big ? 1 : 1)), cr = (m.big ? 4.4 : 2.4) * (0.9 + r() * 0.2), seed = m.x * 31 + m.z;
    const top = stalk(g, m.x, 0, m.z, h, m.big ? 2 : 1, (t, e) => tone(S, 3 + t * 1.5 + e * 0.5), 0, 0, (t) => (t > 0.85 ? 1 : 0));
    const w = wob(seed, 0.06), capH = cr * 1.45;
    lathe(g, top[0], top[1] - 1, top[2], capH, (hh, a) => cr * w(a) * (hh < 0.65 ? 1 - hh * 0.12 : Math.sqrt(Math.max(0, 1 - ((hh - 0.65) / 0.38) ** 2)) * 0.92) + 0.3,
      (hh, a, d, rim) => (hh < 0.12 && rim ? tone(C, 6) : Math.abs(((a / TAU) * 10 + 10) % 1 - 0.5) > 0.42 ? tone(C, 2.6 + hh) : hh > 0.9 ? tone(C, 6) : tone(C, 3.4 + hh * 1.8 - (Math.cos(a) > 0.5 ? 0.5 : 0))),
      (hh, a, d, rim) => (hh < 0.12 && rim ? 3 : hh > 0.85 ? 3 : 2));
    // the glowing gill skirt hanging under the rim
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU; if (i % 2) g.set(top[0] + Math.cos(a) * (cr - 0.6), top[1] - 2, top[2] + Math.sin(a) * (cr - 0.6), tone(C, 5), 3); }
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function witchHats(r, R) {
  const W = 35, g = new VG(W, 36, W), c = 17, C = R.violet, S = R.stem;
  for (const m of spread(r, r.int(3, 5), c, 4, 12)) {
    const h = m.big ? r.int(6, 9) : r.int(2, 5), cr = m.big ? 4.2 : 2.2 + r() * 0.8, capH = cr * (2.2 + r() * 0.5);
    const top = stalk(g, m.x, 0, m.z, h, 1, (t) => tone(S, 2.6 + t * 1.6));
    const fa = r() * TAU, flop = cr * (0.9 + r() * 0.6), tw = r() * 2 + 2;
    lathe(g, top[0], top[1], top[2], capH, (hh) => (hh < 0.08 ? cr + 1.1 : cr * Math.pow(1 - hh, 1.15) + 0.3),
      (hh, a, d, rim) => {
        if (hh < 0.08) return rim ? tone(C, 1.5) : tone(C, 2.2); // the brim
        const band = Math.abs((((a / TAU) + hh * tw) % 0.5 + 0.5) % 0.5 - 0.25) < 0.05;
        if (ph(Math.round(a * 20), Math.round(hh * 30), 3) < 0.05) return 0xf4e8ff; // star specks
        return band ? tone(C, 5.5) : tone(C, 2.4 + hh * 2.2 + (Math.cos(a) > 0.4 ? 0.6 : 0));
      },
      (hh, a) => (ph(Math.round(a * 20), Math.round(hh * 30), 3) < 0.05 ? 3 : Math.abs((((a / TAU) + hh * tw) % 0.5 + 0.5) % 0.5 - 0.25) < 0.05 ? 2 : 0),
      { ox: (hh) => Math.cos(fa) * flop * Math.pow(Math.max(0, hh - 0.45) / 0.55, 2), oz: (hh) => Math.sin(fa) * flop * Math.pow(Math.max(0, hh - 0.45) / 0.55, 2) });
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function frills(r, R) {
  const W = 33, g = new VG(W, 28, W), c = 16, C = R.pink, S = R.stem;
  for (const m of spread(r, r.int(2, 4), c, 5, 11)) {
    const tiers = m.big ? r.int(3, 4) : 2, h = m.big ? r.int(14, 18) : r.int(6, 9);
    const top = stalk(g, m.x, 0, m.z, h, m.big ? 2 : 1, (t) => tone(S, 2.4 + t * 2));
    for (let i = 0; i < tiers; i++) {
      const t = (i + 1) / (tiers + 0.4), y = Math.round(top[1] * t), rr = (m.big ? 5.6 : 3.2) * (1.15 - t * 0.55), seed = i * 7 + m.x;
      const p = ph(seed, 3, 1) * TAU, k = r.int(5, 7);
      for (let z = Math.floor(top[2] - rr - 2); z <= top[2] + rr + 2; z++) for (let x = Math.floor(top[0] - rr - 2); x <= top[0] + rr + 2; x++) {
        const dx = x - top[0], dz = z - top[2], d = Math.hypot(dx, dz), a = Math.atan2(dz, dx), rrr = rr * (1 + 0.14 * Math.sin(k * a + p));
        if (d > rrr) continue;
        const rim = d > rrr - 1.1, lift = rim ? Math.round(Math.sin(k * 2 * a + p)) : 0;
        g.set(x, y + lift, z, rim ? tone(C, 4.6) : tone(C, 2 + (d / rrr) * 1.6 + (dx < 0 ? 0.4 : -0.3) + (Math.round(d) % 2 ? 0.5 : 0)), rim ? 3 : 1);
        if (!rim && d > 1.2) g.set(x, y - 1, z, Math.abs(((a / TAU) * 24) % 1 - 0.5) < 0.25 ? tone(C, 1.5) : tone(C, 2.4)); // gills
      }
    }
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function dotDomes(r, R) {
  const W = 35, g = new VG(W, 24, W), c = 17, C = R.blue, S = R.stem;
  for (const m of spread(r, r.int(3, 6), c, 4, 12)) {
    const h = m.big ? r.int(6, 9) : r.int(2, 5), cr = m.big ? 5 : 2.4 + r() * 0.8, w = m.big ? 2 : 1;
    if (m.big) g.blob(m.x + 0.5, 1, m.z + 0.5, 2.4, 1.6, 2.4, () => tone(S, 3.4), 0, m.x, 0.15); // bulb foot
    const top = stalk(g, m.x, 0, m.z, h, w, (t) => tone(S, 3 + t * 1.4));
    if (m.big) for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; g.set(top[0] + Math.cos(a) * 1.9, h - 2 - (i % 2), top[2] + Math.sin(a) * 1.9, tone(S, 5)); } // the skirt
    const capH = cr * 0.9, wb = wob(m.x * 13 + m.z, 0.07);
    lathe(g, top[0], top[1] + 1, top[2], capH, (hh, a) => cr * wb(a) * Math.sqrt(Math.max(0, 1 - hh * hh)) + 0.3,
      (hh, a, d, rim) => {
        const ring = Math.round(hh * 4), dot = ring > 0 && ring < 4 && Math.abs(((a / TAU) * (5 + ring * 2) + ring * 0.25) % 1 - 0.5) < 0.12 && Math.abs(hh * 4 - ring) < 0.32;
        return dot ? 0xdaf0ff : rim && hh < 0.2 ? tone(C, 5) : tone(C, 2.2 + hh * 2.5);
      },
      (hh, a, d, rim) => { const ring = Math.round(hh * 4); return ring > 0 && ring < 4 && Math.abs(((a / TAU) * (5 + ring * 2) + ring * 0.25) % 1 - 0.5) < 0.12 && Math.abs(hh * 4 - ring) < 0.32 ? 3 : rim && hh < 0.2 ? 2 : 1; });
    lathe(g, top[0], top[1], top[2], 1, () => cr - 0.6, (hh, a) => (Math.abs(((a / TAU) * 20) % 1 - 0.5) < 0.25 ? tone(C, 1) : tone(C, 3)), () => 1); // gills
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function trumpets(r, R) {
  const W = 33, g = new VG(W, 22, W), c = 16, C = R.amber;
  for (const m of spread(r, r.int(4, 7), c, 3, 11)) {
    const H = m.big ? r.int(12, 15) : r.int(6, 9), cr = m.big ? 4.6 : 2.4 + r() * 0.8, wb = wob(m.x + m.z * 7, 0.16);
    // a funnel flaring from a narrow foot to a wavy, hollow cup; ridges (false gills) run down it
    lathe(g, m.x, 0, m.z, H, (hh, a) => (0.9 + (cr - 0.9) * Math.pow(hh, 1.6)) * (hh > 0.7 ? wb(a) : 1),
      (hh, a, d, rim) => (hh > 0.93 && rim ? tone(C, 6) : hh > 0.93 ? tone(C, 2.4 + d) : Math.abs(((a / TAU) * 14) % 1 - 0.5) < 0.18 ? tone(C, 2.2 + hh * 2) : tone(C, 3.2 + hh * 2)),
      (hh, a, d, rim) => (hh > 0.93 && rim ? 2 : hh > 0.8 ? 1 : 0), { shell: 1 });
    for (let z = -Math.ceil(cr); z <= cr; z++) for (let x = -Math.ceil(cr); x <= cr; x++) if (Math.hypot(x, z) < cr - 1.2) g.add(m.x + x, H - 2, m.z + z, tone(C, 2)); // the cup's floor
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function porcini(r, R) {
  const W = 33, g = new VG(W, 24, W), c = 16, C = R.brownCap, S = [0x4a4030, 0x6e624a, 0x948468, 0xb8a888, 0xd8caa8, 0xece0c0, 0xfaf2dc];
  for (const m of spread(r, r.int(2, 4), c, 5, 11)) {
    const H = m.big ? r.int(8, 11) : r.int(4, 6), sr = m.big ? 2.8 : 1.6, cr = m.big ? 5.4 : 3;
    // a fat club stem, netted
    lathe(g, m.x, 0, m.z, H, (hh) => sr * (1.25 - hh * 0.45) + 0.3, (hh, a) => ((Math.round(hh * H * 1.5) + Math.round(a * 4)) % 3 === 0 ? tone(S, 5.5) : tone(S, 3.4 + hh)));
    const wb = wob(m.z * 3 + m.x, 0.08);
    lathe(g, m.x, H, m.z, cr * 0.85, (hh, a) => cr * wb(a) * Math.sqrt(Math.max(0, 1 - hh * hh * 0.9)) + 0.4,
      (hh, a, d, rim) => (hh < 0.2 && !rim ? -1 : hh > 0.55 && Math.cos(a + 0.8) > 0.55 && d < 0.6 ? tone(C, 6) : tone(C, 2.6 + hh * 2 + (rim ? 0.6 : 0))));
    lathe(g, m.x, H, m.z, 1, () => cr - 0.4, (hh, a, d, rim, x, y, z) => ((x + z) % 2 ? 0xd8c070 : 0xb89a4e)); // the pores
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function parasols(r, R) {
  const W = 35, g = new VG(W, 32, W), c = 17, C = R.brownCap, S = R.stem;
  for (const m of spread(r, r.int(2, 3), c, 6, 12)) {
    const H = m.big ? r.int(18, 24) : r.int(10, 13), cr = m.big ? 7 : 4;
    g.blob(m.x, 0.6, m.z, 1.8, 1.2, 1.8, () => tone(S, 3), 0, m.x, 0.1);
    const top = stalk(g, m.x, 0, m.z, H, 1, (t) => ((Math.round(t * H) % 3) === 0 ? tone(C, 2) : tone(S, 3.4 + t)));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; g.set(top[0] + Math.cos(a) * 1.4, Math.round(H * 0.7), top[2] + Math.sin(a) * 1.4, tone(S, 5)); } // the ring
    lathe(g, top[0], H + 1, top[2], 3, (hh) => (hh > 0.7 ? 1.4 : cr * (1 - hh * 0.4)),
      (hh, a, d, rim) => (hh > 0.7 ? tone(C, 1) : (Math.round(d * 4) % 2 === 1 && ph(Math.round(a * 12), Math.round(d * 6), 9) < 0.55) ? tone(C, 1.5) : rim ? tone(C, 3.4) : tone(C, 4.4 + (Math.cos(a) > 0.3 ? 0.6 : 0))));
    lathe(g, top[0], H, top[2], 1, () => cr - 0.5, (hh, a) => (Math.abs(((a / TAU) * 26) % 1 - 0.5) < 0.25 ? tone(S, 3) : tone(S, 5))); // gills
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function toadstools(r, R) {
  const W = 33, g = new VG(W, 24, W), c = 16, C = R.red, S = R.stem;
  for (const m of spread(r, r.int(2, 4), c, 5, 11)) {
    const H = m.big ? r.int(8, 11) : r.int(4, 6), cr = m.big ? 5 : 2.8;
    // the cup at the foot, the stem, the skirt
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.set(m.x + Math.cos(a) * 1.8, 0, m.z + Math.sin(a) * 1.8, tone(S, 3)); if (i % 2) g.set(m.x + Math.cos(a) * 1.8, 1, m.z + Math.sin(a) * 1.8, tone(S, 4)); }
    const top = stalk(g, m.x, 0, m.z, H, m.big ? 2 : 1, (t, e) => tone(S, 4 + t * 1.5 + e * 0.4));
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; g.set(top[0] + Math.cos(a) * 1.9, H - 2 - (i % 3 === 0 ? 1 : 0), top[2] + Math.sin(a) * 1.9, 0xf4ece0); }
    const wb = wob(m.x * 5 + m.z, 0.07), capH = cr * 0.85;
    lathe(g, top[0], H + 1, top[2], capH, (hh, a) => cr * wb(a) * Math.sqrt(Math.max(0, 1 - hh * hh)) + 0.3,
      (hh, a, d, rim) => (hh > 0.5 && Math.cos(a + 0.9) > 0.6 && d < 0.55 ? tone(C, 5.5) : tone(C, 2.6 + hh * 2.2 - (rim ? 0.6 : 0))));
    // raised white warts: a voxel proud of the cap
    for (let i = 0; i < (m.big ? 12 : 5); i++) {
      const a = r() * TAU, hh = 0.25 + r() * 0.65, rr = cr * wb(a) * Math.sqrt(1 - hh * hh) + 0.9, y = H + 1 + Math.round(hh * capH);
      const x = top[0] + Math.cos(a) * rr, z = top[2] + Math.sin(a) * rr;
      g.set(x, y, z, 0xfaf4ea); if (m.big && i % 2) g.set(x, y + 1, z, 0xe8e0d0);
    }
    lathe(g, top[0], H, top[2], 1, () => cr - 0.5, (hh, a) => (Math.abs(((a / TAU) * 24) % 1 - 0.5) < 0.25 ? 0xd8d0c0 : 0xf4ece0));
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function shaggy(r, R) {
  const W = 31, g = new VG(W, 30, W), c = 15, C = R.ink;
  for (const m of spread(r, r.int(3, 5), c, 3, 10)) {
    const H = m.big ? r.int(6, 9) : r.int(3, 5), cr = m.big ? 3.2 : 2, capH = cr * (m.big ? 4 : 3.4);
    const top = stalk(g, m.x, 0, m.z, H, 1, (t) => tone(C, 5 + t));
    lathe(g, top[0], H - 1, top[2], capH, (hh) => cr * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, hh - 0.2) / 0.8, 3))) + 0.2,
      (hh, a, d, rim, x, y, z) => {
        if (hh < 0.14) return rim ? 0x141018 : tone(C, 1); // the inky edge
        const sc = ph(x * 3 + z, y, 5);
        return hh > 0.88 ? tone(R.brownCap, 4) : sc < 0.1 ? tone(R.brownCap, 5) : sc < 0.45 ? tone(C, 6) : tone(C, 5 - (Math.cos(a) > 0.4 ? 0 : 0.6));
      });
    // ink drips off the rim
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + r(), L = r.int(1, 3); for (let k = 0; k < L; k++) g.set(top[0] + Math.cos(a) * (cr - 0.4), H - 2 - k, top[2] + Math.sin(a) * (cr - 0.4), k === L - 1 ? 0x2a2434 : 0x141018); }
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function glowStalks(r, R) {
  const C = r() < 0.33 ? R.violet : r() < 0.5 ? R.cyan : R.blue;
  const W = 33, g = new VG(W, 40, W), c = 16, S = R.stem;
  for (const m of spread(r, r.int(3, 5), c, 3, 10)) {
    const H = m.big ? r.int(18, 25) : r.int(8, 13), cr = m.big ? 4 : 2.6, lx = (r() - 0.5) * 0.25, lz = (r() - 0.5) * 0.25;
    const top = stalk(g, m.x, 0, m.z, H, 1, (t) => tone(S, 2.6 + t * 2), lx, lz, (t) => (Math.round(t * H) % 6 === 0 ? 1 : 0));
    const capH = cr * 0.95;
    lathe(g, top[0], top[1] + 1, top[2], capH, (hh) => cr * Math.sqrt(Math.max(0, 1 - hh * hh)) + 0.3,
      (hh) => (Math.round(hh * 6) % 2 ? tone(C, 5.5) : tone(C, 2.8 + hh)), (hh) => (Math.round(hh * 6) % 2 ? 3 : 1));
    for (let i = 0; i < 5; i++) { const a = r() * TAU; for (let k = 1; k <= 2; k++) g.set(top[0] + Math.cos(a) * (cr - 0.5), top[1] + 1 - k, top[2] + Math.sin(a) * (cr - 0.5), tone(C, 6), 3); } // droplets
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function bonnets(r, R) {
  const C = r() < 0.5 ? R.amber : r() < 0.6 ? R.cyan : R.brownCap, glow = C === R.brownCap ? 0 : 2;
  const W = 23, g = new VG(W, 16, W), c = 11;
  const n = r.int(8, 12);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.5, out = 0.18 + r() * 0.2, H = r.int(5, 10);
    const top = stalk(g, c, 0, c, H, 1, (t) => tone(R.stem, 2.4 + t * 2.4), Math.cos(a) * out, Math.sin(a) * out);
    const cr = 1.3 + r() * 0.7;
    lathe(g, top[0], top[1], top[2], cr * 1.8, (hh) => cr * Math.pow(1 - hh, 0.8) + 0.35,
      (hh, aa, d, rim) => (hh > 0.8 ? tone(C, 6) : rim && hh < 0.3 ? tone(C, 5) : tone(C, 3 + hh * 1.5)), (hh, aa, d, rim) => (glow && (hh > 0.8 || (rim && hh < 0.3)) ? glow + 1 : glow ? 1 : 0));
  }
  g.patch(c, 0, c, 3, 3, (dx, dz, X, Z, rim) => tone(R.moss, rim ? 3 : 2), 0, 3, 0.3);
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function morels(r, R) {
  const W = 31, g = new VG(W, 26, W), c = 15, C = R.ember, A = R.ash;
  for (const m of spread(r, r.int(3, 5), c, 3, 10)) {
    const H = m.big ? r.int(4, 6) : r.int(2, 4), cr = m.big ? 3.4 : 2.2, capH = cr * 2.6;
    const top = stalk(g, m.x, 0, m.z, H, m.big ? 2 : 1, (t) => tone(A, 4 + t));
    lathe(g, top[0], H, top[2], capH, (hh) => cr * Math.pow(Math.sin(Math.PI * Math.min(1, 0.25 + hh * 0.8)), 0.9) + 0.3,
      (hh, a, d, rim) => {
        // honeycomb: ridges on a grid of angle × height, pits between them glowing
        const u = (a / TAU) * 9 + Math.round(hh * capH / 2) * 0.5, v = hh * capH / 2;
        const ridge = Math.abs((u % 1 + 1) % 1 - 0.5) > 0.36 || Math.abs((v % 1) - 0.5) > 0.38;
        return ridge ? tone(A, 4.5 + hh) : tone(C, 3 + hh * 2);
      },
      (hh, a) => { const u = (a / TAU) * 9 + Math.round(hh * hh) * 0.5, v = hh * 3; return Math.abs((u % 1 + 1) % 1 - 0.5) > 0.36 || Math.abs((v % 1) - 0.5) > 0.38 ? 0 : 3; });
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function icicles(r, R) {
  const W = 31, g = new VG(W, 26, W), c = 15, C = R.frost;
  for (const m of spread(r, r.int(3, 5), c, 3, 10)) {
    const H = m.big ? r.int(7, 10) : r.int(3, 6), cr = m.big ? 4 : 2.4, capH = cr * 1.5;
    const top = stalk(g, m.x, 0, m.z, H, 1, (t) => tone(C, 3 + t * 2));
    lathe(g, top[0], H + 1, top[2], capH, (hh) => cr * Math.pow(1 - hh, 0.85) + 0.3,
      (hh, a, d, rim) => (hh > 0.8 ? tone(C, 6) : rim ? tone(C, 5) : tone(C, 3 + hh * 2 + (Math.cos(a) > 0.4 ? 0.7 : 0))), (hh, a, d, rim) => (rim && hh < 0.2 ? 2 : 1));
    for (let i = 0; i < (m.big ? 12 : 7); i++) { const a = (i / (m.big ? 12 : 7)) * TAU, L = 1 + ((i * 7) % 3); for (let k = 0; k < L; k++) g.set(top[0] + Math.cos(a) * (cr - 0.3), H - k, top[2] + Math.sin(a) * (cr - 0.3), tone(C, 6 - k), k === L - 1 ? 3 : 2); }
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

export function earthstar(r, R) {
  const W = 27, g = new VG(W, 10, W), c = 13, S = R.stem;
  for (const m of spread(r, r.int(3, 5), c, 4, 10)) {
    const rr = m.big ? 2.6 : 1.5 + r() * 0.6;
    if (m.big || r() < 0.5) {
      // the star of split rays, tips curled up
      const n = r.int(5, 7), L = rr * 2.4;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r() * 0.3;
        for (let u = rr * 0.6; u <= L; u += 0.5) { const w = Math.max(0, 1.3 * (1 - u / L)); for (let v = -w; v <= w; v += 0.5) g.set(m.x + Math.cos(a) * u - Math.sin(a) * v, u > L - 1 ? 1 : 0, m.z + Math.sin(a) * u + Math.cos(a) * v, u > L - 1.5 ? tone(R.brownCap, 5) : tone(R.brownCap, 3.4 + (v > 0 ? 0.5 : 0))); }
      }
    }
    g.blob(m.x, rr * 0.9 + 0.5, m.z, rr, rr * 0.88, rr, (dx, dy, dz, X, Y, Z) => (dy > 0.82 ? tone(S, 2) : tone(S, 3.6 + (dy > 0.35 ? 1 : 0) + (ph(X * 3 + Z, Y, 7) < 0.14 && dy > -0.2 ? 1.4 : 0))), (dx, dy) => (dy > 0.5 ? 1 : 0), m.x * 11 + 4, 0.18);
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

// ---------------------------------------------------------------- flowers
/** An arching stem with a row of glowing bells hanging off it. */
export function bellArch(r, R, PET = R.cyan, SR = R.fern) {
  const W = 23, g = new VG(W, 28, W), c = 11;
  for (let i = 0; i < 3; i++) { const [hx, hz] = DIR8[(i * 3 + r.int(0, 1)) % 8]; g.leaf(c, i * 2, c, hx, hz, r.int(4, 6), 3, 0.45, SR, 1.6); }
  const a = r() * TAU, dx = Math.cos(a), dz = Math.sin(a), H = r.int(18, 23), reach = 8;
  const pt = (t) => [c + dx * reach * t, H * Math.sin(Math.PI * (0.15 + t * 0.7)) + t * 2, c + dz * reach * t];
  for (let k = 0; k <= 60; k++) { const t = k / 60, [x, y, z] = pt(t); g.set(x, y, z, tone(SR, 2 + t * 2)); }
  for (let b = 0; b < 4; b++) {
    const t = 0.35 + b * 0.19, [x, y, z] = pt(t), s = 0.8 + b * 0.12;
    g.set(x, y - 1, z, tone(SR, 3.5));
    for (let yy = 0; yy < 4; yy++) {
      const rr = (0.6 + yy * 0.5) * s, yv = Math.round(y - 2 - yy);
      for (let q = -2; q <= 2; q++) for (let p = -2; p <= 2; p++) { const d = Math.hypot(q, p); if (d > rr + 0.2) continue; const rim = d > rr - 0.9; g.set(x + q, yv, z + p, tone(PET, 3 + (1 - yy / 3) * 1.2 + (rim && yy === 3 ? 1.6 : 0) - (q > 0 ? 0.6 : 0)), yy > 1 ? 3 : 2); }
    }
    g.set(x, Math.round(y - 6), z, tone(PET, 6), 3); // the clapper
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** A lantern bulb in a cage of ribs on a slim stem. */
export function lantern(r, R, PET = R.cyan, SR = R.fern) {
  const W = 17, g = new VG(W, 28, W), c = 8, H = r.int(14, 19);
  for (let i = 0; i < 3; i++) { const [hx, hz] = DIR8[(i * 3) % 8]; g.leaf(c, i * 2, c, hx, hz, r.int(4, 6), 3, 0.45, SR, 1.6); }
  stalk(g, c, 0, c, H, 1, (t) => tone(SR, 2 + t * 2));
  g.blob(c, H + 3, c, 2.2, 2.8, 2.2, (dx, dy) => tone(PET, 4.4 + (dy > 0.4 ? 1 : 0) - (dx > 0.4 ? 0.8 : 0)), (dx, dy, dz) => (dx * dx + dy * dy + dz * dz < 0.4 ? 3 : 2), 71, 0.1);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; for (let k = 0; k <= 6; k++) { const t = k / 6; g.set(c + Math.cos(a) * 2.9 * Math.sin(Math.PI * t), H + 0.5 + t * 5.5, c + Math.sin(a) * 2.9 * Math.sin(Math.PI * t), tone(SR, 3 + t)); } }
  g.set(c, H + 7, c, tone(SR, 4)); g.paint(c - 1, H + 4, c, 0xffffff, 3);
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** Faceted crystal petals (pointed prisms) angled up and out round a glowing core. */
export function crystalBloom(r, R, PET = R.violet, SR = R.fern) {
  const W = 21, g = new VG(W, 28, W), c = 10, H = r.int(11, 16);
  for (let i = 0; i < 2; i++) { const [hx, hz] = DIR8[(i * 4 + r.int(0, 2)) % 8]; g.leaf(c, i * 2, c, hx, hz, r.int(4, 6), 3, 0.45, SR, 1.6); }
  const top = stalk(g, c, 0, c, H, 1, (t) => tone(SR, 2 + t * 2));
  const n = r.int(5, 6), a0 = r() * TAU;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU, ux = Math.cos(a), uz = Math.sin(a), L = 5 + (i % 2) * 1.5;
    for (let u = 0; u <= L; u += 0.4) {
      const w = u < L * 0.6 ? 1 : (1 - (u - L * 0.6) / (L * 0.4)) * 1.2;
      for (let v = -w; v <= w; v += 0.5) {
        const facet = v > 0 ? 1 : 0, x = top[0] + ux * u * 0.75 - uz * v, y = top[1] + u * 0.85, z = top[2] + uz * u * 0.75 + ux * v;
        g.set(x, y, z, u > L - 0.8 ? tone(PET, 6) : Math.abs(v) > w - 0.5 ? tone(PET, 5.4) : tone(PET, 3.2 + facet * 1.2 + u / L), u > L * 0.5 ? 3 : 2);
      }
    }
  }
  g.blob(top[0], top[1] + 1, top[2], 1.2, 1.2, 1.2, () => 0xffffff, 3, 5, 0.05);
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** Pitcher plants: veined tubes with a glowing lip and a lid leaf over the mouth. */
export function pitchers(r, R, PET = R.pink, SR = R.vine) {
  const W = 29, g = new VG(W, 26, W), c = 14;
  for (const m of spread(r, r.int(3, 4), c, 4, 10)) {
    const H = m.big ? r.int(14, 18) : r.int(8, 11), rr = m.big ? 2.8 : 2;
    lathe(g, m.x, 0, m.z, H, (hh) => rr * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, hh * 1.1))) + (hh > 0.88 ? 0.8 : 0) + 0.2,
      (hh, a, d, rim, x, y, z) => (hh > 0.88 ? tone(PET, 6) : (Math.round(a * 4 + hh * 3) % 3 === 0) ? tone(PET, 2) : tone(SR, 2.5 + hh * 2.5 - (Math.cos(a) > 0.3 ? 0 : 0.6))),
      (hh) => (hh > 0.88 ? 3 : 0), { shell: 1 });
    for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) if (Math.hypot(x, z) < rr - 0.8) g.add(m.x + x, Math.round(H * 0.7), m.z + z, tone(PET, 4), 2); // nectar inside
    // the lid: a tilted leaf over the mouth
    const la = r() * TAU, lx = Math.cos(la), lz = Math.sin(la);
    for (let u = 0; u <= rr + 2; u += 0.5) for (let v = -rr; v <= rr; v += 0.5) { if (Math.hypot(u - rr / 2 - 0.5, v) > rr + 0.5) continue; g.set(m.x - lx * rr + lx * u - lz * v, H + 1 + u * 0.6, m.z - lz * rr + lz * u + lx * v, tone(SR, 3.5 + (v > 0 ? 0.6 : 0))); }
  }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

/** A fire lily: six petals curling back off a cup, and long glowing stamens. */
export function fireLily(r, R, PET = R.ember, SR = R.ash) {
  const W = 21, g = new VG(W, 30, W), c = 10, H = r.int(14, 19);
  for (let i = 0; i < 3; i++) { const [hx, hz] = DIR8[(i * 3 + 1) % 8]; g.leaf(c, i * 2, c, hx, hz, r.int(5, 7), 2, 0.6, SR, 3); }
  const top = stalk(g, c, 0, c, H, 1, (t) => tone(SR, 3 + t * 2));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, ux = Math.cos(a), uz = Math.sin(a);
    for (let u = 0; u <= 6; u += 0.4) { const back = Math.max(0, u - 3) ** 2 * 0.35, w = Math.sin(Math.PI * Math.min(1, u / 6)) * 1.1; for (let v = -w; v <= w; v += 0.5) g.set(top[0] + ux * u - uz * v, top[1] + 1 + u * 0.8 - back, top[2] + uz * u + ux * v, tone(PET, 2.6 + (u / 6) * 3 + (Math.abs(v) > w - 0.5 ? 0.6 : 0)), u > 3 ? 3 : 2); }
  }
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; for (let u = 0; u <= 5; u++) g.set(top[0] + Math.cos(a) * u * 0.45, top[1] + 1 + u, top[2] + Math.sin(a) * u * 0.45, u === 5 ? 0xfff0b0 : tone(PET, 5), 3); }
  return { g, pivot: [c, 0, c], mode: 'up' };
}

// ---------------------------------------------------------------- hanging
/** A vine hung with little glowing bells (root at the top). */
export function bellVine(r, R, o = {}) {
  const L = o.len ?? 60, W = 19, g = new VG(W, L + 4, W), c = 9, top = L + 3, LR = R.vine, PET = o.bell || R.cyan;
  for (let i = 0; i < 2; i++) {
    const x0 = c + (i ? r.int(-4, 4) : 0), z0 = c + (i ? r.int(-3, 3) : 0), p0 = r() * 6.28, len = Math.round(L * (i ? 0.5 + r() * 0.3 : 0.9));
    const xa = (k) => x0 + Math.sin(k * 0.08 + p0) * 2, za = (k) => z0 + Math.sin(k * 0.06 + p0 * 1.7) * 1.4;
    for (let k = 0; k < len; k++) g.set(xa(k), top - 1 - k, za(k), tone(LR, 1.4 + (k / len) * 2));
    let side = 1;
    for (let k = r.int(3, 5); k < len - 3; k += r.int(5, 7)) {
      const x = Math.round(xa(k)), y = top - 1 - k, z = Math.round(za(k));
      const [hx, hz] = DIR8[(side > 0 ? 0 : 4) + (k % 2)];
      g.leaf(x + hx, y, z + hz, hx, hz, 3, 2, -0.2, LR, 2, 0, 0.2);
      if (r() < 0.6) {
        // a bell on a short stalk
        const bx = x - hx * 2, bz = z - hz * 2;
        g.line(x, y, z, bx, y - 1, bz, tone(LR, 3));
        for (let yy = 0; yy < 3; yy++) for (let q = -1; q <= 1; q++) for (let p = -1; p <= 1; p++) { if (Math.abs(q) + Math.abs(p) > yy) continue; g.set(bx + q, y - 2 - yy, bz + p, tone(PET, 3.5 + (2 - yy) * 0.6 + (yy === 2 && Math.abs(q) + Math.abs(p) === 2 ? 1.6 : 0)), yy ? 3 : 2); }
        g.set(bx, y - 5, bz, tone(PET, 6), 3);
      }
      side = -side;
    }
  }
  g.patch(c, top, c, 3.5, 2.6, (dx, dz, X, Z, rim) => tone(R.moss, rim ? 3 : 2), 0, 9, 0.3);
  return { g, pivot: [c, top + 1, c], mode: 'down' };
}
