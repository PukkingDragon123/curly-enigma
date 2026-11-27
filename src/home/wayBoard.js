// Old Star's slate (wave 21, docs/DESIGN_PROGRESSION.md): the Miners' Board on its crate is the board
// of the way down. Four layers chalked across the top (roots, a clay pot, a crystal, a flame), the two
// wardens' heads in the gaps between them, the filled ones ringed in gold; under them the card you're
// on: three slots, each the real item icon in a chalk box with "have/need" under it, an arrow and
// what it pays (the next pick, or coin). No words. E hands in what your bag has for the card.
//
// The art is hand-authored pixel maps (chalk strokes: '#' chalk, '+' faint chalk), drawn in the master
// palette (src/ui/palette.js) into a Px raster (src/ui/px.js) that becomes the slate face's texture;
// the item icons come from src/ui/iconRender.js. The slate itself is the voxel model the house job
// builds (src/home/hollowProps.js slateOnCrate); this face is laid over its chalk area.
import * as THREE from 'three';
import { Px } from '../ui/px.js';
import { PAL } from '../ui/palette.js';
import { iconCanvas } from '../ui/iconRender.js';
import { ITEMS } from '../data/items.js';
import { WAY_CARDS, WARDENS, currentCard, cardDone, cardProgress, wardenBeaten, handIn } from '../data/way.js';
import { SPOTS } from './spots.js';
import { T } from './units.js';

const hex = (s) => parseInt(s.slice(1), 16);
const C = {
  slate: hex(PAL.stoneDk), rub: hex(PAL.stone), chalk: hex(PAL.cream), chalk2: hex(PAL.creamDk),
  dim: hex(PAL.stoneMid), gold: hex(PAL.goldLt), warm: hex(PAL.peach),
};

// ---------------------------------------------------------------- the chalk maps (16×16 doodles)
const DOODLE = {
  roots: [
    '.......#........',
    '....#..#..#.....',
    '.....#.#.#......',
    '..#...###...#...',
    '...#...#...#....',
    '#####.####.#####',
    '.+..#..#...#..+.',
    '...#...#....#...',
    '..#...#.#....#..',
    '..#..#...#...#..',
    '.#...#....#...#.',
    '.#..#......#..#.',
    '....#.......#...',
    '...#.........#..',
    '...#............',
    '................',
  ],
  pot: [
    '................',
    '....#######.....',
    '...#.......##...',
    '....##....##....',
    '....#.+..+.#....',
    '...#........#...',
    '..#..++++....#..',
    '..#..........#..',
    '.#............#.',
    '.#..+.+.+.+...#.',
    '.#............#.',
    '..#..........#..',
    '..#.........#...',
    '...#........#...',
    '....#######.....',
    '................',
  ],
  crystal: [
    '.......#........',
    '......#.#.......',
    '......#.#..#....',
    '..#..#..#.#.#...',
    '.#.#.#...##.#...',
    '.#.#.#...#..#...',
    '.#..##...#...#..',
    '#...#....#...#..',
    '#...#....#....#.',
    '#...#....#....#.',
    '.#..#....#...#..',
    '..#.#....#..#...',
    '...##....#.#....',
    '#####.##########',
    '.+..+..+...+..+.',
    '................',
  ],
  flame: [
    '.......#........',
    '......##........',
    '......#.#.......',
    '.....#..#..#....',
    '....#...#.##....',
    '...#.....#.#....',
    '...#.........#..',
    '..#....#.....#..',
    '..#...#.#....#..',
    '..#..#...#...#..',
    '..#..#...#..#...',
    '...#..#.#..#....',
    '....#..#..#.....',
    '.....######.....',
    '...+..+..+..+...',
    '................',
  ],
};
// a warden's head: a blocky brow, two sockets, a jaw of stones
const WARDEN = [
  '.######..',
  '#.......#',
  '#.##.##.#',
  '#.......#',
  '##.###.##',
  '.#.....#.',
  '.#.###.#.',
  '..#...#..',
  '...###...',
];
const TICK = ['......#', '.....#.', '#...#..', '.#.#...', '..#....'];
const CROSS = ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'];
const ARROW = ['....#..', '.....#.', '######.', '.....#.', '....#..'];
const COIN = ['..#####..', '.#.....#.', '#..#....#', '#.###...#', '#..#....#', '#.......#', '#......##', '.#....##.', '..#####..'];
// a ring round a filled layer: a wobbly loop, hand placed (closed polygon, art pixels from the doodle's corner)
const RING = [[2, -2], [9, -3], [16, -1], [19, 4], [19, 11], [17, 17], [10, 19], [3, 18], [-2, 14], [-3, 7], [-1, 1]];
const DIGITS = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'], '/': ['..#', '..#', '.#.', '#..', '#..'],
};
// rubbed-out chalk on the slate (irregular patches, placed by hand)
const SMUDGES = [
  [[6, 24], [18, 22], [30, 25], [22, 28], [8, 28]],
  [[70, 3], [84, 2], [90, 6], [78, 8]],
  [[86, 64], [104, 62], [108, 70], [94, 74], [84, 70]],
  [[40, 70], [52, 68], [58, 73], [44, 75]],
];

export const BOARD_W = 112, BOARD_H = 80;
const DX = [4, 32, 62, 92]; // the four layers across the top
const SLOT_X = [2, 28, 54], SLOT_Y = 30;

function stamp(p, rows, x0, y0, c, c2 = C.chalk2) {
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x];
    if (ch === '#') p.set(x0 + x, y0 + y, c);
    else if (ch === '+') p.set(x0 + x, y0 + y, c2);
  }
}
function number(p, str, cx, y, c) {
  const w = str.length * 4 - 1;
  let x = Math.round(cx - w / 2);
  for (const ch of str) { if (DIGITS[ch]) stamp(p, DIGITS[ch], x, y, c); x += 4; }
}
/** A chalk box with a couple of skips in its strokes (fixed, so it's the same hand every time). */
function chalkBox(p, x, y, w, h, c) {
  for (let i = 0; i < w; i++) { if (i !== 5 && i !== w - 8) p.set(x + i, y, c); if (i !== 11) p.set(x + i, y + h - 1 + (i > w - 6 ? 1 : 0), c); }
  for (let j = 0; j < h; j++) { if (j !== 9) p.set(x, y + j, c); if (j !== 4 && j !== h - 6) p.set(x + w - 1, y + j - (j < 3 ? 1 : 0), c); }
}
function pasteIcon(p, id, x0, y0) {
  const cv = iconCanvas(id);
  if (!cv) return false;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const i = (y * cv.width + x) * 4;
    if (d[i + 3] > 127) p.set(x0 + x, y0 + y, (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  }
  return true;
}

/** Draw the slate face for a save. Returns { px, missing (icons still rendering) }. */
export function drawWayBoard(st) {
  const p = new Px(BOARD_W, BOARD_H, 1);
  p.rect(0, 0, BOARD_W, BOARD_H, C.slate);
  for (const s of SMUDGES) p.poly(s, C.rub);
  const cur = currentCard(st);
  const ci = cur ? WAY_CARDS.indexOf(cur) : WAY_CARDS.length;
  // the layers across the top: ringed when filled, underlined when it's the one you're on
  WAY_CARDS.forEach((c, i) => {
    const done = cardDone(st, c.id), x = DX[i];
    stamp(p, DOODLE[c.doodle], x, 3, done || i === ci ? C.chalk : C.dim, done || i === ci ? C.chalk2 : C.dim);
    if (done) for (let k = 0; k < RING.length; k++) { const a = RING[k], b = RING[(k + 1) % RING.length]; p.line(x + a[0], 3 + a[1], x + b[0], 3 + b[1], C.gold); }
    if (i === ci) for (let k = 0; k < 16; k++) p.set(x + k, 21 + (k % 5 === 2 ? 1 : 0), C.warm);
  });
  // between them: an arrow, then the two wardens (crossed out once beaten)
  stamp(p, ARROW, 22, 9, ci >= 1 ? C.chalk : C.dim);
  for (const [W, x] of [[WARDENS.clay, 51], [WARDENS.grotto, 81]]) {
    const beaten = wardenBeaten(st, W.id), near = cardDone(st, W.after);
    stamp(p, WARDEN, x, 6, beaten ? C.dim : near ? C.chalk : C.dim);
    if (beaten) stamp(p, CROSS, x + 1, 7, C.gold);
  }
  // the line under them, with a skip where the chalk caught
  for (let x = 3; x < BOARD_W - 3; x++) if (x % 23 !== 7) p.set(x, 25 + (x > 70 && x < 80 ? 1 : 0), C.chalk2);
  let missing = 0;
  if (cur) {
    const pr = cardProgress(st, cur.id);
    pr.slots.forEach((s, i) => {
      const x = SLOT_X[i], full = s.have >= s.need;
      chalkBox(p, x, SLOT_Y, 26, 26, full ? C.gold : C.chalk);
      if (!pasteIcon(p, s.id, x + 1, SLOT_Y + 1)) missing++;
      number(p, `${s.have}/${s.need}`, x + 13, SLOT_Y + 30, full ? C.gold : C.chalk);
      if (full) stamp(p, TICK, x + 18, SLOT_Y + 2, C.gold);
    });
    // what it pays: the pick it opens, or coin
    stamp(p, ARROW, 81, 41, C.chalk);
    if (cur.unlock) { if (!pasteIcon(p, cur.unlock, 88, SLOT_Y + 1)) missing++; }
    else stamp(p, COIN, 94, 38, C.gold);
  } else {
    // the slate's full: every layer ringed, a big tick where the card was
    for (let k = 0; k < 3; k++) stamp(p, TICK, 40 + k * 12, 44 + (k === 1 ? -2 : 0), C.gold);
    stamp(p, COIN, 94, 38, C.gold);
  }
  p.ctx.putImageData(p.img, 0, 0);
  return { px: p, missing };
}

// ---------------------------------------------------------------- the face in the cave
/**
 * The slate face over the Miners' Board (HomeScene mixin helpers below). The slate stands at
 * SPOTS.miners on its crate, leant back (hollowProps slateOnCrate: at 1/64 m, the slate's grid sits
 * 20 up and 6 back on the crate, tipped -0.18 rad; its chalk area is 36 × 26 voxels round 15 up).
 */
export class WayBoard {
  constructor(scene) {
    this.sc = scene;
    const S = SPOTS.miners, V = 1 / 64;
    this.canvas = null;
    this.tex = null;
    this.mat = new THREE.MeshBasicMaterial({ color: 0xc8b8a4, transparent: false });
    const geo = new THREE.PlaneGeometry(36 * V, 26 * V);
    this.face = new THREE.Mesh(geo, this.mat);
    this.face.position.set(0, 15 * V, 2.15 * V); // (just proud of the old chalk voxels and the frame)
    const lean = new THREE.Group();
    lean.position.set(0, 20 * V, -6 * V);
    lean.rotation.x = -0.18;
    lean.add(this.face);
    this.root = new THREE.Group();
    this.root.position.set(S.x / T, (scene.floorY?.(S.x, S.z) ?? 0) / T, S.z / T);
    this.root.rotation.y = S.yaw;
    this.root.scale.setScalar(1 / T);
    this.root.add(lean);
    scene.room.add(this.root);
    this.bounce = 0;
    this.retry = 0;
    this.redraw();
  }

  redraw() {
    const { px, missing } = drawWayBoard(this.sc.game.state);
    if (!this.tex) {
      this.tex = new THREE.CanvasTexture(px.c);
      this.tex.magFilter = THREE.NearestFilter;
      this.tex.minFilter = THREE.NearestFilter;
      this.tex.generateMipmaps = false;
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.mat.map = this.tex;
      this.mat.needsUpdate = true;
      this.canvas = px.c;
    } else {
      this.canvas.getContext('2d').drawImage(px.c, 0, 0);
      this.tex.needsUpdate = true;
    }
    this.retry = missing ? 0.4 : 0;
  }

  update(dt) {
    if (this.retry > 0 && (this.retry -= dt) <= 0) this.redraw();
    if (this.bounce > 0) {
      this.bounce = Math.max(0, this.bounce - dt * 3);
      const k = Math.sin(this.bounce * Math.PI * 3) * this.bounce;
      this.face.scale.set(1 + 0.04 * k, 1 - 0.03 * k, 1);
    }
  }

  /** What E says at the slate. */
  label() {
    const st = this.sc.game.state, c = currentCard(st);
    if (!st.unlocked?.('upgrades')) return 'Miners\' Board'; // (waits for the lessons' end: lessons.js NEEDS)
    if (!c) return 'Old Star\'s slate';
    const can = Object.entries(c.slots).some(([id, need]) => (st.data.way?.cards?.[c.id]?.[id] || 0) < need && st.count(id) > 0);
    return can ? 'Hand in ore' : 'Old Star\'s slate';
  }

  /** E at the slate: hand in what fits (true), or nothing to give (false). */
  use() {
    const sc = this.sc, st = sc.game.state, a = sc.game.audio;
    if (!st.unlocked?.('upgrades')) return false;
    const r = handIn(st);
    if (!r) return false;
    const S = SPOTS.miners, y = (sc.floorY?.(S.x, S.z) ?? 0) + 0.75;
    r.given.forEach((g, i) => sc.later?.(0.35 * i, () => { a.play('place', { vol: 0.5 }); sc.floatAt?.(S.x + 0.12 * (i - 1), y + 0.2 * i, S.z, `+${g.n} ${ITEMS[g.id]?.name || ''}`, '#f2dcae', 'good'); }));
    a.play('chisel', { vol: 0.35 });
    this.bounce = 1;
    if (r.filled) sc.later?.(0.5, () => { a.play('success'); this.bounce = 1; });
    this.redraw();
    st.save();
    return true;
  }
}
