// The HUD's sprites (wave 20): the hand-drawn maps of src/ui/hudMaps.js turned into cached data URLs
// through the master palette (src/ui/hudPix.js). Code only stacks, recolours and slices them.
//   HS.pouch(open) · pack(fill 0..3) · book() · journal() · plumb() · coins() (4-frame strip) · coin()
//   glint() · twine() · chain() · goldTag() · plaque() · brassPlate() · paperTag(red) · key()
//   seal(color, mark) · fleur() · tri(dir) · reticle(kind) · radarRing() · radarGlass()
//   strap() · loop(on) · buckle() · beltTip() · gauge() · charm(id)
//   holdRing(px, frac, on, off): paint the crosshair's hold ring into a Px (its track lit by angle)
// installHudSprites(root) publishes them over the older procedural art's CSS custom properties
// (--h-*, --a-key, --a-coins, --a-seal*, --a-buckle, --a-beltTip, --pk-loop*) and as --hs-*.
import { pix, pixPx, recolor, stack, hudVar, hex } from './hudPix.js';
import * as M from './hudMaps.js';

/** Wax colours: the seal is drawn in red (w r R); these swap its letters. */
const WAX = {
  red: {}, green: { w: 'M', r: 'v', R: 'f' }, amber: { w: 'u', r: 'g', R: 'G' }, brown: { w: '2', r: '3', R: '4' },
  blue: { w: 'z', r: 'Z', R: 'a' }, purple: { w: 'P', r: 'U', R: 'W' },
};
const SEALS = { ring: M.SEAL_RING, check: M.SEAL_CHECK, x: M.SEAL_X, star: M.SEAL_STAR };
/** Charm dyes (x shade, X body, Y light) per buff. */
const DYE = {
  glow: { x: 'z', X: 'Z', Y: 'a' }, warm: { x: 'r', X: 'h', Y: 'H' }, cool: { x: 'Z', X: 'a', Y: 'A' }, bouncy: { x: 'U', X: 'W', Y: 'C' },
  zippy: { x: 'b', X: 'g', Y: 'G' }, lucky: { x: 'v', X: 'V', Y: 'f' }, sense: { x: 'p', X: 'U', Y: 'W' }, sturdy: { x: '2', X: '3', Y: '4' },
};
const RETICLES = { none: M.RET_NONE, rock: M.RET_ROCK, ore: M.RET_ORE, enemy: M.RET_ENEMY, use: M.RET_USE };

export const HS = {
  pouch: (open = false) => pix('pouch' + (open ? 1 : 0), open ? M.POUCH_OPEN : M.POUCH),
  pack: (fill = 0) => pix('pack' + fill, M.PACK[Math.max(0, Math.min(3, fill | 0))]),
  book: () => pix('book', M.BOOK_PEEK),
  journal: () => pix('journal', M.JOURNAL),
  plumb: () => pix('plumb', M.PLUMB),
  coins: () => pix('coins', () => M.COIN_FRAMES[0].map((_, y) => M.COIN_FRAMES.map((f) => f[y]).join(''))),
  coin: () => pix('coin', M.COIN),
  glint: () => pix('glint', M.GLINT),
  twine: () => pix('twine', M.TWINE),
  chain: () => pix('chain', M.CHAIN),
  goldTag: () => pix('goldTag', M.GOLD_TAG),
  plaque: () => pix('plaque', M.PLAQUE),
  brassPlate: () => pix('brassPlate', M.BRASS_PLATE),
  paperTag: (red = false) => pix('paperTag' + (red ? 'R' : ''), red ? recolor(M.PAPER_TAG, { C: 'h', c: 'r', S: 'r', T: 'w' }) : M.PAPER_TAG),
  key: () => pix('key', M.KEY),
  seal: (color = 'red', mark = 'ring') => pix(`seal:${color}:${mark}`, () => recolor(SEALS[mark] || SEALS.ring, WAX[color] || WAX.red)),
  fleur: () => pix('fleur', M.FLEUR),
  tri: (dir = 'up') => pix('tri' + dir, dir === 'down' ? M.TRI_DOWN : M.TRI_UP),
  reticle: (kind = 'none') => pix('ret:' + kind, RETICLES[kind] || RETICLES.none),
  radarRing: () => pix('radarRing', M.RADAR_RING),
  radarGlass: () => pix('radarGlass', M.RADAR_GLASS),
  strap: () => pix('strap', M.STRAP),
  loop: (on = false) => pix('loop' + (on ? 1 : 0), on ? M.LOOP_ON : M.LOOP),
  buckle: () => pix('buckle', M.BUCKLE),
  beltTip: () => pix('beltTip', M.BELT_TIP),
  gauge: () => pix('gauge', M.GAUGE),
  calendar: (torn = false) => pix('cal' + (torn ? 1 : 0), torn ? M.CALENDAR_TORN : M.CALENDAR),
  mouse: () => pix('mouse', M.MOUSE),
  wayArrow: () => pix('wayArrow', M.WAY_ARROW),
  burst: () => pix('burst', M.BURST),
  flourish: () => pix('flourish', M.FLOURISH),
  charm: (id) => pix('charm:' + id, () => stack({ rows: recolor(M.CHARM, DYE[id] || DYE.lucky) }, { rows: M.CHARM_EMBLEM[id] || M.CHARM_EMBLEM.lucky, x: 3, y: 7 })),
};
export const CHARM_KINDS = Object.keys(DYE);

/**
 * The crosshair's hold ring into a 25 × 25 Px: the hand-drawn track (HOLD_RING), its segments lit
 * clockwise from the top up to frac in `on`, the rest in `off` (legend letters), the rims in ink.
 */
export function holdRing(p, frac, on = 'G', off = 'p') {
  const rows = M.HOLD_RING, N = rows.length, c = N / 2, lit = Math.max(0, Math.min(1, frac));
  p.d.fill(0);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ch = rows[y][x];
    if (ch === 'K') { p.set(x, y, hex('K'), 200); continue; }
    if (ch !== 'o') continue;
    let a = Math.atan2(x + 0.5 - c, -(y + 0.5 - c)) / (Math.PI * 2);
    if (a < 0) a += 1;
    p.set(x, y, hex(a < lit ? on : off), a < lit ? 255 : 190);
  }
  return p;
}

/** Publish the sprites as CSS custom properties (over the older art's names, so every rule picks them up). */
export function installHudSprites(root = document.documentElement) {
  const put = (name, url) => hudVar(root, name, url);
  // corner HUD (hudArt.js names)
  put('--h-goldTag', HS.goldTag()); put('--h-plaque', HS.plaque()); put('--h-brassPlate', HS.brassPlate());
  put('--h-paperTag', HS.paperTag(false)); put('--h-paperTagRed', HS.paperTag(true)); put('--h-gauge', HS.gauge());
  put('--h-twineV', HS.twine()); put('--h-chainV', HS.chain()); put('--h-glint', HS.glint());
  // shared small pieces (uiArt / UI.js names)
  put('--a-key', HS.key()); put('--a-coins', HS.coins()); put('--a-coin', HS.coin());
  put('--a-sealCheck', HS.seal('green', 'check')); put('--a-sealX', HS.seal('red', 'x')); put('--a-sealStar', HS.seal('amber', 'star'));
  put('--a-buckle', HS.buckle()); put('--a-beltTip', HS.beltTip());
  put('--d-fleur', HS.fleur());
  // the belt
  put('--hs-wayArrow', HS.wayArrow()); put('--hs-burst', HS.burst()); put('--hs-flourish', HS.flourish());
  put('--hs-strap', HS.strap()); put('--hs-loop', HS.loop(false)); put('--hs-loopOn', HS.loop(true));
}
export { pixPx };
