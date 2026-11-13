// Forged and cast ornaments for the panels (shop, backpack, Miners' Board, pantry): drawn once,
// published as --pn-* custom properties, laid over a panel's corners with one ::after and four
// background layers (see shop.css, backpack.css, upgrades.css, the pantry's style).
//   strapTL/TR/BL/BR  24×24 hammered iron strap hinges: an L along the corner, a riveted boss, the
//                     arms ending in spearhead fleurs (each corner shaded from the top left, not mirrored)
//   capTL/TR/BL/BR    14×14 cast brass book corners: a bevelled cap, an engraved border, a stamped rosette
//   nailHead          5×5 a hand-forged nail head (studs along leather seams)
// installPanelArt() publishes them (once).
import { Px, art, cssUrl } from './uiArt.js';
import { RAMP, tone, vnoise, h2, rimLight, rivet } from './hudArt.js';

const IR = RAMP.iron, BR = RAMP.brass, INK = 0x0e0a0c;

/** The strap's shape for the top-left corner (1 = iron), S×S. */
function strapShape(S = 24) {
  const m = new Px(S, S, 1);
  m.rect(0, 0, 16, 4, 1); m.rect(0, 0, 4, 16, 1);
  // the boss over the corner, its inner corner cut on the diagonal
  m.rect(0, 0, 8, 8, 1);
  for (let i = 0; i < 3; i++) m.clear(7 - i, 7), m.clear(7, 7 - i);
  // spearhead fleurs: a lozenge point with two little side lobes
  for (const [a, b] of [[0, 1], [1, 0]]) {
    const P = (x, y) => (a ? [x, y] : [y, x]);
    m.poly([P(15, -1.5), P(22.5, 2), P(15, 5.5)].map(([x, y]) => [x, y]), 1);
    m.poly([P(14, 2), P(16.5, -2), P(18.5, 2)].map(([x, y]) => [x, y]), 1);
    m.poly([P(14, 2), P(16.5, 6), P(18.5, 2)].map(([x, y]) => [x, y]), 1);
    void b;
  }
  return m;
}
/** Mirror a top-left shape into another corner. */
function mirrored(m, fx, fy) {
  const o = new Px(m.w, m.h, 1);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.a(x, y)) o.set(fx ? m.w - 1 - x : x, fy ? m.h - 1 - y : y, 1);
  return o;
}

/** A hammered iron strap corner: facets, a bevel lit from the top left, rivets. corner: 'TL' | 'TR' | 'BL' | 'BR'. */
function strapCorner(corner) {
  const S = 24, fx = corner[1] === 'R', fy = corner[0] === 'B';
  const m = mirrored(strapShape(S), fx, fy);
  const p = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!m.a(x, y)) continue;
    const fac = vnoise(x / 2.2, y / 2.2, 301) - 0.5, rim = rimLight(m, x, y, 2);
    let k = 0.4 + fac * 0.32 + rim * 0.34 + (h2(x, y, 302) - 0.5) * 0.06;
    p.set(x, y, tone(IR, k));
  }
  // fine: hammer dents (a dark fine pixel with a lit one beside it), scale flecks of rust
  for (let i = 0; i < 26; i++) {
    const x = h2(i, 1, 303) * S, y = h2(i, 2, 303) * S;
    if (!m.a(Math.floor(x), Math.floor(y))) continue;
    p.dot(x, y, IR[1]); p.dot(x + 0.5, y + 0.5, IR[7]);
    if (h2(i, 3, 303) > 0.75) p.dot(x + 0.5, y, 0x6a3a22, 200);
  }
  // rivets: a big one through the boss, small ones along the arms
  const at = (x, y) => [fx ? S - 1 - x - 1 : x, fy ? S - 1 - y - 1 : y];
  rivet(p, ...at(2, 2), true, BR);
  for (const [x, y] of [[10, 1], [1, 10]]) rivet(p, ...at(x, y), false, BR);
  p.outline(INK);
  return p;
}

/** A cast brass book corner (14×14), shaded from the top left. */
function bookCap(corner) {
  const S = 14, fx = corner[1] === 'R', fy = corner[0] === 'B';
  const base = new Px(S, S, 1);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (x + y <= 12) base.set(x, y, 1);
  // a scalloped hypotenuse
  for (const i of [2, 6, 10]) base.clear(i, 12 - i);
  const m = mirrored(base, fx, fy);
  const p = new Px(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!m.a(x, y)) continue;
    const rim = rimLight(m, x, y, 2);
    const u = fx ? S - 1 - x : x, v = fy ? S - 1 - y : y;
    let k = 0.55 + rim * 0.32 + (vnoise(x / 2, y / 2, 311) - 0.5) * 0.14;
    if (u + v === 8 || u + v === 9) k -= 0.28; // the engraved border along the bevel
    if (u === 2 || v === 2) k += u <= 7 && v <= 7 ? -0.12 : 0;
    p.set(x, y, tone(BR, k));
  }
  // the stamped rosette near the tip, a glint
  const at = (u, v) => [fx ? S - 1 - u : u, fy ? S - 1 - v : v];
  for (const [u, v, c] of [[3, 4, 2], [4, 3, 2], [4, 4, 7], [5, 4, 3], [4, 5, 3]]) p.set(...at(u, v), BR[c]);
  p.dot(...at(1.5, 1.5), 0xffffff);
  p.outline(BR[0]);
  return p;
}

/** A forged nail head, 5×5. */
function nailHead() {
  const p = new Px(5, 5);
  p.tpl(['.ab.', 'abbc', 'bbcd', '.cd.'], { a: IR[7], b: IR[5], c: IR[3], d: IR[1] }, 0, 0);
  p.outline(INK);
  return p;
}

const O = { detail: false };
export const PART = {
  strap: (c) => art('pn:strap' + c, () => strapCorner(c), O),
  cap: (c) => art('pn:cap' + c, () => bookCap(c), O),
  nail: () => art('pn:nail', nailHead, O),
};

let done = false;
/** Publish the ornaments as --pn-* custom properties on :root (once). */
export function installPanelArt() {
  if (done) return;
  done = true;
  const r = document.documentElement.style;
  for (const c of ['TL', 'TR', 'BL', 'BR']) { r.setProperty('--pn-strap' + c, cssUrl(PART.strap(c))); r.setProperty('--pn-cap' + c, cssUrl(PART.cap(c))); }
  r.setProperty('--pn-nail', cssUrl(PART.nail()));
}
