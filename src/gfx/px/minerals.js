// 32×32 icons for raw ores, crystals, cut gems, coal, fossils, obsidian and ingots.
//
// The art lives in the facet-renderer modules (facets.js: z-buffered flat planes with
// top-left light, mottled texture, lit ridges, cast/contact shadows, selective outline):
//   oreIcons.js     host-rock chunks with embedded ore (nuggets, wire veins, bands, crystals)
//   crystalIcons.js druses of faceted prisms, halite cubes, gravium, the amethyst geode
//   gemIcons.js     cut gems (brilliant / step cuts), amber, coal, fossil slab, obsidian
//   ingotIcons.js   chamfered cast bars
// drawMineral() dispatches by spec.k / item id; unknown ids get a generic piece in the
// same style, coloured from the spec.
import { makeRng } from '../../core/util.js';
import { mix } from './color.js';
import { vol, fill } from './shade.js';
import { M, ring } from './parts.js';
import { Scene, material, rampOf, glint, prismUV } from './facets.js';
import { ROCK, rockMat, hostRock, copperOre, tinOre, ironOre, silverOre, goldOre, mithrilOre, moonsilverOre, adamantOre, starmetalOre } from './oreIcons.js';
import { drawCrystal, druse } from './crystalIcons.js';
import { drawGemIcon, brilliantMesh, gemScene } from './gemIcons.js';
import { drawIngot } from './ingotIcons.js';

// ---------------------------------------------------------------- legacy helpers (public API)
/** Lumpy metal nugget: union of blobs, dome-lit with a hot specular. */
export function nugget(pc, blobs, R, o = {}) {
  const m = M(pc.w, pc.h);
  for (const [x, y, rx, ry] of blobs) m.ellipse(x, y, rx, ry ?? rx);
  if (o.clip) m.and(o.clip);
  if (o.ring !== false) ring(pc, m, R, o.ringOpts || {});
  vol(pc, m, R, { spec: o.spec ?? 0.8, shine: o.shine ?? 14, emit: o.emit, bounce: true, round: o.round });
  return m;
}

/**
 * Faceted top view for any convex outline: table, 8 star facets and 8 kite facets,
 * toned by their direction to the light with internal-reflection flares opposite it.
 * outline(t) → [x, y] for t in [0, 1) around the girdle; (cx, cy) = table center.
 */
export function facetedGem(pc, R, outline, o = {}) {
  const N = 8;
  const cx = o.cx ?? 16, cy = o.cy ?? 16;
  const G = [], Gm = [], Tb = [];
  for (let i = 0; i < N; i++) { G.push(outline(i / N)); Gm.push(outline((i + 0.5) / N)); }
  const tk = o.table ?? 0.5;
  for (let i = 0; i < N; i++) Tb.push([cx + (G[i][0] - cx) * tk, cy + (G[i][1] - cy) * tk]);
  const girdle = [];
  for (let i = 0; i < N; i++) girdle.push(G[i], Gm[i]);
  const all = M().poly(girdle);
  ring(pc, all, R);
  const LA = Math.atan2(-0.68, -0.52);
  const toneAt = (px, py, star) => {
    const a = Math.atan2(py - cy, px - cx);
    let d = Math.abs(((a - LA) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI); // 0 = facing light
    let t = 1 + Math.round(d / (Math.PI / 4));
    if (star) t += 1;
    if (d > Math.PI * 0.8) t = star ? 4 : 2; // reflection flare opposite the light
    return Math.max(1, Math.min(5, t));
  };
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, h = (i + N - 1) % N;
    fill(pc, M().poly([Tb[i], Gm[h], G[i], Gm[i]]).and(all), R[toneAt(G[i][0], G[i][1], false)]);
    fill(pc, M().poly([Tb[i], Gm[i], Tb[j]]).and(all), R[toneAt(Gm[i][0], Gm[i][1], true)]);
  }
  const table = M().poly(Tb);
  table.each((x, y) => {
    const d = (x + 0.5 - cx) + (y + 0.5 - cy);
    pc.set(x, y, R[d < -4 ? 1 : d < 0 ? 2 : d < 4.5 ? 3 : 2]);
  });
  table.edge().each((x, y) => pc.set(x, y, (x + 0.5 - cx) + (y + 0.5 - cy) > 0 ? R[4] : R[1]));
  if (o.emit) all.each((x, y) => pc.emit(x, y, o.emit));
  return all;
}

// ---------------------------------------------------------------- generic fallbacks
/** 7-tone ramp from a spec triple [main, hi, lo]. */
function rampFrom([c, hi, lo]) {
  return rampOf([mix(hi ?? c, 0xffffff, 0.6), hi ?? mix(c, 0xffffff, 0.45), mix(c, hi ?? 0xffffff, 0.35), c, mix(c, lo ?? 0x202020, 0.5), lo ?? mix(c, 0x101018, 0.6), mix(lo ?? c, 0x08060c, 0.7)]);
}

function genericOre(pc, spec, seed) {
  const sc = new Scene(32);
  const RR = spec.rock ? rampFrom([spec.rock, mix(spec.rock, 0xffffff, 0.45), mix(spec.rock, 0x101018, 0.5)]) : ROCK.grey();
  hostRock(sc, rockMat(RR, seed & 255), seed, [{ x: 16, y: 18.5, a: 12.5, c: 8, h: 11.5, yaw: 0.3 }]);
  const OR = rampFrom(spec.ore || [0xd9773f, 0xf2a35e, 0x9c4a24]);
  const m = material(OR, { spec: 0.88, shine: 10, grad: 0.05 });
  sc.chunk(m, makeRng(seed + 1), { x: 14, y: 12.5, a: 5, b: 3.8, c: 4, n: 11, jag: 0.32, base: 0.75, on: true, embed: 0.6, smooth: 0.25 });
  sc.chunk(m, makeRng(seed + 2), { x: 21, y: 16, a: 3, b: 2.4, c: 2.6, n: 8, jag: 0.3, base: 0.75, on: true, embed: 0.4, smooth: 0.25 });
  sc.render(pc);
  glint(pc, 12, 10, 1, 0xffffff, OR[1]);
}

function genericCrystal(pc, spec, seed) {
  const sc = new Scene(32);
  hostRock(sc, rockMat(ROCK.grey(), 3, { amp: 0.4 }), seed, [{ x: 16, y: 25.5, a: 11.5, c: 6, h: 6.5, yaw: 0.3, n: [6, 5, 5] }]);
  const R = rampFrom(spec.c || [0xc0c8ff, 0xffffff, 0x6070b0]);
  const m = material(R, { eq: 0.55, grad: 0.05, gap: 1.4, ridgeAll: true, glow: spec.glow ? 0.7 : 0, tex: (c) => { const [u] = prismUV(c); return u < 0.22 ? (0.22 - u) * 4 : 0; } });
  druse(sc, m, { cx: 16, cy: 24, rx: 8, rz: 4, n: 6, len: [6, 21], seed: (seed % 13) + 1 });
  sc.render(pc);
}

function genericGem(pc, spec, seed) {
  const R = rampFrom(spec.c || [0xe02a3a, 0xff9aa2, 0x8a0a18]);
  const oval = (t) => { const a = t * Math.PI * 2; return [Math.cos(a) * 12, Math.sin(a) * 10]; };
  const { sc, m } = gemScene(R, brilliantMesh(oval, { table: 0.58, crown: 2.6, pav: 7 }), { yaw: 0.2, pitch: 0.42, roll: -0.25, t: [16, 16, 0] }, { seed });
  if (spec.glow) m.glow = 0.6;
  sc.render(pc);
  glint(pc, 11, 10, 2, 0xffffff, R[1]);
}

// ---------------------------------------------------------------- dispatcher
const ORE_DRAW = {
  copper_ore: copperOre, tin_ore: tinOre, iron_ore: ironOre, silver_ore: silverOre, gold_ore: goldOre,
  mithril_ore: mithrilOre, moonsilver_ore: moonsilverOre, adamant_ore: adamantOre, starmetal_ore: starmetalOre,
};

/** PixelArt.drawIconArt hook: true when the spec is a mineral kind and was drawn. */
export function drawMineral(pc, spec, id, seed) {
  switch (spec.k) {
    case 'ore': {
      const f = ORE_DRAW[id];
      if (f) f(pc);
      else genericOre(pc, spec, (seed >>> 0) % 997 + 1);
      break;
    }
    case 'crystal': if (!drawCrystal(pc, id)) genericCrystal(pc, spec, (seed >>> 0) % 997 + 1); break;
    case 'gem': if (!drawGemIcon(pc, id)) genericGem(pc, spec, (seed >>> 0) % 997 + 1); break;
    case 'coal': drawGemIcon(pc, 'coal'); break;
    case 'fossil': drawGemIcon(pc, 'fossil'); break;
    case 'shard': drawGemIcon(pc, 'obsidian_shard'); break;
    case 'ingot': drawIngot(pc, id, spec.c?.[0]); break;
    default: return false;
  }
  return true;
}

