// Forged and cast ornaments for the panels (shop, backpack, Miners' Board, pantry), hand-drawn as pixel
// maps (wave 20, src/ui/handKit.js legend), published as --pn-* custom properties and laid over a
// panel's corners with one ::after and four background layers (see shop.css, backpack.css, upgrades.css).
//   strapTL/TR/BL/BR  24×24 iron strap hinges: an L along the corner, a riveted boss, flared arm ends
//   capTL/TR/BL/BR    14×14 cast brass book corners: a bevelled cap, an engraved line, a stamped trefoil
//   nailHead          5×5 a hand-forged nail head (studs along leather seams)
// The other corners are the top-left map turned over. installPanelArt() publishes them (once).
import { art, cssUrl } from './uiArt.js';
import { mapPx, kitPx } from './handKit.js';

const STRAP = [
  'mmmmmmmmmmmmmmmmmmmmk...',
  'm44444444445444444544k..',
  'm433233333341332334134k.',
  'm43543233222222222322k..',
  'm43413332kkkkkkkkk2kk...',
  'm4333332k.........k.....',
  'm433332k................',
  'm43232k.................',
  'm4332k..................',
  'm432k...................',
  'm432k...................',
  'm542k...................',
  'm412k...................',
  'm432k...................',
  'm432k...................',
  'm432k...................',
  'm432k...................',
  'm432k...................',
  'm5422k..................',
  'm412k...................',
  'k432k...................',
  '.k4k....................',
  '..k.....................',
  '........................',
];

const CAP = [
  'mmmmmmmmmmmmk.',
  'mGGGGGGGGGkk..',
  'mGgggguYbk....',
  'mGgguuYbbk....',
  'mGguYbbbk.....',
  'mGgubbkk......',
  'mGuYbk........',
  'mGYbbk........',
  'mGbbk.........',
  'mGkk..........',
  'mk............',
  'mk............',
  'k.............',
  '..............',
];

const FLIP = { TL: '', TR: 'h', BL: 'v', BR: 'hv' };
const O = { res: 1 };
export const PART = {
  strap: (c) => art('pn:kit:strap' + c, () => mapPx(STRAP, null, FLIP[c]), O),
  cap: (c) => art('pn:kit:cap' + c, () => mapPx(CAP, null, FLIP[c]), O),
  nail: () => art('pn:kit:nail', () => kitPx('nail'), O),
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
