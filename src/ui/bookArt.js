// Pixel art for the quest tracker and the book: the parchment strip with its rolled ends, the
// quill, the ink stamp, check boxes, chapter tab icons, givers' ink sketches and map pins.
// Drawn once at 1 art px = 1 canvas px (shown at --px), cached as data URLs.
import { Px, PAL, INK, art } from './uiArt.js';
import { makeRng } from '../core/util.js';

const P = PAL.paper;
const SEPIA = 0x4a2c16, SEPIA_LT = 0x7a5a3a, RED = 0xb8402c, RED_DK = 0x7a2414;

// ---------------------------------------------------------------- the objective strip (9-slice, 8 px)
function strip() {
  const W = 32, H = 24, p = new Px(W, H);
  const rng = makeRng(7);
  // paper
  for (let y = 3; y < H - 3; y++)
    for (let x = 5; x < W - 5; x++) {
      const n = rng();
      p.set(x, y, n < 0.06 ? P.mid : n > 0.97 ? P.hi : P.base);
    }
  // deckled, scorched top and bottom edges (pattern repeats every 16 px across the middle)
  const edgeT = [0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0];
  const edgeB = [1, 0, 0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0];
  for (let x = 5; x < W - 5; x++) {
    const t = edgeT[x % 16], b = edgeB[x % 16];
    p.set(x, 2 + t, P.burn); p.set(x, 3 + t, P.dk);
    if (t) p.clear(x, 2);
    p.set(x, H - 3 - b, P.burn); p.set(x, H - 4 - b, P.dk);
    if (b) p.clear(x, H - 3);
    if ((x * 7) % 5 === 0) p.set(x, 4 + t, P.mid);
  }
  // rolled ends: a cylinder each side, lit from the top-left, with a curl at the caps
  const roll = [PAL.paper.edge, P.burn, P.dk, P.mid, P.hi, P.base, P.dk, PAL.paper.edge];
  for (const side of [0, 1]) {
    const x0 = side ? W - 8 : 0;
    for (let y = 1; y < H - 1; y++)
      for (let i = 0; i < 8; i++) p.set(x0 + i, y, roll[i]);
    // caps: an ellipse with the spiral of the rolled sheet
    for (const [cy, dir] of [[1, 1], [H - 2, -1]]) {
      for (let i = 1; i < 7; i++) { p.set(x0 + i, cy, P.base); p.set(x0 + i, cy - dir, PAL.paper.edge); }
      p.set(x0 + 3, cy, P.burn); p.set(x0 + 4, cy, P.burn); p.set(x0 + 2, cy + dir, P.dk); p.set(x0 + 5, cy + dir, P.mid);
      p.clear(x0, cy - dir); p.clear(x0 + 7, cy - dir);
    }
    // a twine binding round the roll
    for (const yy of [6, H - 7]) for (let i = 0; i < 8; i++) p.set(x0 + i, yy, i % 2 ? 0x8a5a32 : 0xb8864a);
  }
  // soft shadow where the paper meets the rolls
  for (let y = 4; y < H - 4; y++) { p.set(8, y, P.mid); p.set(W - 9, y, P.mid); }
  return p;
}

// ---------------------------------------------------------------- the quill (writes on the strip)
function quill() {
  const p = new Px(16, 20);
  // feather vane: a leaf shape from the top-right sweeping down-left
  for (let t = 0; t <= 1; t += 0.02) {
    const x = 14 - t * 10, y = 1 + t * 14;
    const w = Math.sin(t * Math.PI) * 3.4;
    for (let k = -w; k <= w; k += 0.5) {
      const xx = Math.round(x + k * 0.7), yy = Math.round(y + k * 0.7);
      p.set(xx, yy, k < -1.5 ? 0xd8d0c0 : k > 1.8 ? 0x9a8a78 : 0xf6f0e2);
    }
  }
  // barbs: little notches
  for (const [x, y] of [[12, 3], [10, 5], [11, 8], [8, 9], [7, 11]]) p.set(x, y, 0xb8ac98);
  // shaft (rachis) and nib
  p.line(14, 1, 3, 16, 0x6a5a48);
  p.line(4, 15, 2, 18, 0x3a2414);
  p.set(2, 19, INK); p.set(1, 19, INK);
  p.outline(0x2a1a10);
  return p;
}

// ---------------------------------------------------------------- Old Star's stamp (red ink, a star in a ring)
function stamp(color = RED) {
  const S = 30, c = S / 2, p = new Px(S, S);
  const rng = makeRng(31);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const ring = (d > 12.2 && d < 14.4) || (d > 9.6 && d < 10.6);
      if (ring && rng() > 0.08) p.set(x, y, color);
    }
  // the star: twenty-two little fingers, drawn as an eight-point star
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 3.6 : 8.2;
    const a2 = ((k + 1) / 16) * Math.PI * 2 - Math.PI / 2, r2 = (k + 1) % 2 ? 3.6 : 8.2;
    p.poly([[c, c], [c + Math.cos(a) * r, c + Math.sin(a) * r], [c + Math.cos(a2) * r2, c + Math.sin(a2) * r2]], color);
  }
  // ink grain: worn spots
  for (let i = 0; i < 46; i++) { const x = Math.floor(rng() * S), y = Math.floor(rng() * S); if (p.a(x, y)) p.clear(x, y); }
  p.set(Math.round(c), Math.round(c), 0xf2e1b9);
  return p;
}

// ---------------------------------------------------------------- check boxes (hand-drawn)
function checkBox(ticked) {
  const p = new Px(11, 10);
  // a slightly wonky square
  p.line(1, 2, 7, 2, SEPIA); p.line(1, 2, 1, 8, SEPIA); p.line(1, 8, 8, 8, SEPIA); p.line(7, 2, 8, 8, SEPIA);
  p.set(0, 2, SEPIA_LT); p.set(8, 9, SEPIA_LT);
  if (ticked) {
    p.line(2, 5, 4, 7, RED); p.line(3, 5, 4, 6, RED); p.line(4, 7, 9, 0, RED); p.line(5, 7, 10, 1, RED_DK);
  }
  return p;
}

// ---------------------------------------------------------------- chapter tab icons (16×16)
function tabIcon(kind) {
  const p = new Px(16, 16);
  const L = PAL.leather;
  if (kind === 'quests') {
    // a scroll with a red ribbon
    p.rect(3, 3, 10, 10, P.base);
    for (let y = 3; y < 13; y++) { p.set(3, y, P.dk); p.set(12, y, P.mid); }
    p.rect(2, 1, 12, 3, P.mid); p.hl(2, 13, 1, P.hi); p.hl(2, 13, 3, P.burn);
    p.rect(2, 12, 12, 3, P.mid); p.hl(2, 13, 14, P.burn);
    for (const y of [5, 7, 9]) p.hl(5, 10 - (y === 9 ? 2 : 0), y, SEPIA_LT);
    p.rect(9, 9, 2, 6, RED); p.set(9, 15, RED_DK); p.set(10, 14, RED_DK);
  } else if (kind === 'map') {
    // a folded map with a red X and a dotted trail
    const cols = [P.base, P.mid, P.base, P.mid];
    for (let k = 0; k < 4; k++) p.poly([[1 + k * 3.5, 2 + (k % 2)], [4.5 + k * 3.5, 2 + ((k + 1) % 2)], [4.5 + k * 3.5, 14 - (k % 2 ? 0 : 1)], [1 + k * 3.5, 14 - (k % 2 ? 1 : 0)]], cols[k]);
    p.set(3, 11, SEPIA); p.set(5, 10, SEPIA); p.set(7, 9, SEPIA); p.set(8, 7, SEPIA);
    p.line(9, 4, 12, 7, RED); p.line(12, 4, 9, 7, RED);
    p.outline(L.ol);
  } else if (kind === 'skills') {
    // a little branching tree of nodes
    p.line(8, 14, 8, 4, SEPIA); p.line(8, 9, 4, 6, SEPIA); p.line(8, 9, 12, 6, SEPIA);
    for (const [x, y, c] of [[8, 3, 0xf2c23a], [4, 6, 0x8ac85a], [12, 6, 0x7fc0f0], [8, 14, 0xe8604a]]) { p.disk(x + 0.5, y + 0.5, 2.2, c); p.set(x, y - 1, 0xffffff, 200); }
    p.outline(L.ol);
  } else if (kind === 'index') {
    // the index book: oxblood cover, pages, a ribbon
    p.rect(3, 2, 10, 12, PAL.oxblood.base); p.rect(3, 2, 2, 12, PAL.oxblood.dk);
    p.rect(12, 3, 2, 10, P.base); p.vl(13, 3, 12, P.mid);
    p.hl(6, 10, 5, 0xdcae4e); p.hl(6, 9, 7, 0xdcae4e);
    p.rect(9, 12, 2, 3, RED);
    p.outline(L.ol);
  } else if (kind === 'notes') {
    // a note pinned with a red tack
    p.poly([[3, 3], [13, 2], [14, 13], [4, 14]], P.base);
    for (const y of [6, 8, 10]) p.hl(5, 11, y, SEPIA_LT);
    p.outline(P.edge);
    p.disk(8.5, 3.5, 2, RED); p.set(8, 2, 0xff9a7a);
  }
  return p;
}

// ---------------------------------------------------------------- givers: ink sketches (26×26)
function giver(id) {
  const S = 26, p = new Px(S, S);
  const wash = (c) => c;
  if (id === 'oldstar') {
    // Old Star: a grizzled star-nosed mole in his leather apron, goggles pushed up, bushy white brows
    const F = { hi: 0x7a6a62, lt: 0x5e4e46, base: 0x4a3a34, dk: 0x34282a, dd: 0x241a1c };
    p.rect(4, 21, 18, 5, 0x704628); p.rect(4, 21, 18, 1, 0x8c5a32); // apron + shoulders
    p.vl(8, 21, 25, 0x3f2412); p.vl(17, 21, 25, 0x3f2412);
    p.set(8, 23, 0xdcae4e); p.set(17, 23, 0xdcae4e);
    for (let y = 3; y < 23; y++)
      for (let x = 2; x < 24; x++) {
        const dx = (x + 0.5 - 13) / 10.5, dy = (y + 0.5 - 13) / 10;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const lit = -(dx + dy * 1.2);
        let c = lit > 0.55 ? F.hi : lit > 0.1 ? F.lt : lit > -0.45 ? F.base : F.dk;
        if (d > 0.82 && lit < 0) c = F.dd;
        if (((x * 7 + y * 13) % 11 === 0) && d < 0.8) c = lit > 0 ? F.base : F.dk; // fur tufts
        p.set(x, y, c);
      }
    // goggles up on the brow: a strap and two brass-rimmed lenses
    p.rect(3, 6, 20, 2, 0x56341b);
    for (const gx of [9, 17]) { p.disk(gx, 6.5, 2.8, 0xa8772c); p.disk(gx, 6.5, 1.9, 0x8ad0e0); p.set(gx - 1, 5, 0xffffff); }
    // bushy white brows, little squinting eyes
    for (const [x, y] of [[6, 10], [7, 9], [8, 9], [9, 10], [17, 10], [18, 9], [19, 9], [20, 10]]) p.set(x, y, 0xe8e0d0);
    p.hl(7, 9, 12, 0x140c0a); p.hl(17, 19, 12, 0x140c0a); p.set(8, 11, 0x140c0a); p.set(18, 11, 0x140c0a);
    // the star: twenty-two pink fingers round a darker centre
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2, r = k % 2 ? 3.4 : 4.4;
      p.line(13, 16, Math.round(13 + Math.cos(a) * r), Math.round(16 + Math.sin(a) * r * 0.85), k % 3 ? 0xf0a0a8 : 0xffc8d0);
    }
    p.disk(13, 16, 1.6, 0xc85a6a); p.set(12, 15, 0xffd8e0);
    // white whiskers
    for (const [x, y] of [[3, 16], [4, 17], [2, 18], [22, 16], [21, 17], [23, 18]]) p.set(x, y, 0xe8e0d0);
    p.outline(SEPIA);
  } else if (id === 'rocco') {
    // Rocco: a grey raccoon, black bandit mask, a sly half-smile and a toothpick
    const F = { hi: 0xb0b0b8, lt: 0x9a9aa2, base: 0x84848c, dk: 0x62626a, dd: 0x44444a };
    p.poly([[4, 10], [6, 2], [11, 8]], F.base); p.poly([[15, 8], [20, 2], [22, 10]], F.base);
    p.poly([[6, 8], [7, 4], [9, 7]], 0x2a2a2e); p.poly([[17, 7], [19, 4], [20, 8]], 0x2a2a2e);
    for (let y = 5; y < 24; y++)
      for (let x = 2; x < 24; x++) {
        const dx = (x + 0.5 - 13) / 10.5, dy = (y + 0.5 - 15) / 9;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const lit = -(dx + dy);
        p.set(x, y, lit > 0.5 ? F.hi : lit > 0 ? F.lt : lit > -0.5 ? F.base : F.dk);
      }
    p.ellipse(13, 19, 6, 4.4, 0xe8e4dc); // muzzle
    p.hl(9, 11, 9, 0xf2f0ea); p.hl(15, 17, 9, 0xf2f0ea); // white brows
    for (let x = 3; x < 23; x++) for (let y = 11; y < 15; y++) if (Math.abs(x - 13) > 1 || y > 13) p.set(x, y, 0x26262a); // the mask
    p.set(8, 12, 0xffffff); p.set(9, 12, 0xffffff); p.set(9, 13, 0xd8b030); // eyes glance sideways
    p.set(17, 12, 0xffffff); p.set(18, 12, 0xffffff); p.set(18, 13, 0xd8b030);
    p.disk(13, 17.5, 1.4, 0x1a1a1a); p.set(12, 17, 0x6a6a6a);
    p.line(10, 21, 13, 21, 0x4a4a4a); p.line(13, 21, 16, 20, 0x4a4a4a); // the smirk
    p.line(16, 21, 22, 19, 0xc8a070); // toothpick
    p.outline(SEPIA);
  } else if (id === 'trader') {
    // the Trading Post: a coin sack and a set of scales
    p.ellipse(10, 17, 7, 6, 0xb8864a); p.rect(7, 9, 6, 3, 0x9a6a36); p.hl(6, 13, 11, 0x5a3a20);
    p.disk(10, 18, 2.4, 0xf2c23a); p.set(9, 17, 0xfff3c0);
    p.vl(19, 6, 22, SEPIA); p.hl(14, 24, 7, SEPIA);
    p.ellipse(15, 12, 2.5, 1, 0xdcae4e); p.ellipse(23, 12, 2.5, 1, 0xdcae4e);
    p.line(14, 7, 13, 11, SEPIA_LT); p.line(16, 7, 17, 11, SEPIA_LT); p.line(22, 7, 21, 11, SEPIA_LT); p.line(24, 7, 25, 11, SEPIA_LT);
    p.hl(16, 22, 23, SEPIA);
    p.outline(SEPIA);
  } else if (id === 'herbalist') {
    // the herbalist: a mortar and pestle with a sprig of mint
    p.poly([[5, 13], [21, 13], [18, 22], [8, 22]], 0x9a8a78); p.hl(5, 21, 13, 0xc8b8a0); p.hl(8, 18, 22, 0x6a5a48);
    p.line(14, 15, 21, 4, 0x8a5a32); p.line(15, 15, 22, 4, 0xa06c3c);
    for (const [x, y] of [[6, 9], [8, 7], [9, 10], [11, 8], [7, 11], [10, 6]]) { p.disk(x, y, 1.6, 0x5a9a3a); p.set(x, y - 1, 0x8ac85a); }
    p.line(7, 12, 11, 6, 0x3a6a24);
    p.outline(SEPIA);
  } else {
    // the outpost: a lantern under a pennant
    p.vl(6, 2, 23, 0x6a4a2a); p.poly([[7, 3], [16, 6], [7, 9]], RED);
    p.rect(12, 12, 8, 10, 0x3a3632); p.rect(13, 13, 6, 8, 0xf6be4a); p.rect(14, 14, 4, 6, 0xffe8a0);
    p.hl(11, 20, 11, 0x2a2622); p.vl(16, 9, 11, 0x2a2622);
    p.outline(SEPIA);
  }
  void wash;
  return p;
}

// ---------------------------------------------------------------- map pins (12×14)
export const PIN_KINDS = ['pin', 'star', 'x', 'ore', 'skull', 'heart'];
export const PIN_NAMES = { pin: 'Pin', star: 'Star', x: 'X marks', ore: 'Ore here', skull: 'Danger', heart: 'Nice spot' };
function pin(kind) {
  const p = new Px(12, 14);
  if (kind === 'pin') {
    p.vl(6, 6, 13, 0x6a6a72); p.set(6, 13, 0x3a3a3e);
    p.disk(6, 4, 3.6, RED); p.set(5, 2, 0xff9a7a); p.set(4, 3, 0xe8604a);
  } else if (kind === 'star') {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2, r = k % 2 ? 2.4 : 5.6;
      const a2 = ((k + 1) / 10) * Math.PI * 2 - Math.PI / 2, r2 = (k + 1) % 2 ? 2.4 : 5.6;
      p.poly([[6, 7], [6 + Math.cos(a) * r, 7 + Math.sin(a) * r], [6 + Math.cos(a2) * r2, 7 + Math.sin(a2) * r2]], 0xf2c23a);
    }
    p.set(5, 4, 0xfff3c0);
  } else if (kind === 'x') {
    for (let k = 0; k < 2; k++) { p.line(1 + k, 2, 9 + k, 11, RED); p.line(9 + k, 2, 1 + k, 11, RED); }
  } else if (kind === 'ore') {
    p.poly([[2, 8], [5, 3], [9, 4], [10, 9], [6, 12], [2, 11]], 0x8a7a6a);
    p.disk(5, 7, 1.6, 0xd9773f); p.disk(8, 9, 1.2, 0xf2c23a); p.set(4, 6, 0xffd0a0);
  } else if (kind === 'skull') {
    p.ellipse(6, 6, 4.6, 4.2, 0xf2ead8); p.rect(4, 9, 5, 3, 0xf2ead8);
    p.rect(3, 5, 2, 2, 0x2a1a10); p.rect(7, 5, 2, 2, 0x2a1a10); p.set(6, 8, 0x2a1a10);
    p.vl(5, 10, 11, 0x9a8a78); p.vl(7, 10, 11, 0x9a8a78);
  } else if (kind === 'heart') {
    p.disk(4, 5, 2.6, 0xe8604a); p.disk(8, 5, 2.6, 0xe8604a); p.poly([[1.5, 6], [10.5, 6], [6, 12]], 0xe8604a); p.set(3, 3, 0xff9a7a);
  }
  p.outline(0x2a1408);
  return p;
}

export const BART = {
  strip: () => art('b:strip', strip),
  quill: () => art('b:quill', quill),
  stamp: (c) => art('b:stamp' + (c || ''), () => stamp(c || RED)),
  box: (t) => art('b:box' + (t ? 1 : 0), () => checkBox(t)),
  tab: (k) => art('b:tab:' + k, () => tabIcon(k)),
  giver: (id) => art('b:giver:' + id, () => giver(id)),
  pin: (k) => art('b:pin:' + k, () => pin(k)),
};
/** The raw pin raster, for drawing straight onto the map. */
export const pinPx = (k) => pin(k);
export const stampPx = (c) => stamp(c);
export const quillPx = () => quill();
