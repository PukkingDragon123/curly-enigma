// (wave 21) Daily life on paper: the morning letter (an envelope that opens into a handwritten
// sheet with its wax seal), the gift tray (what's in your bag on parchment tags, the friend's
// hearts on the sign) and the little hand-drawn hearts. Every sprite is a hand-authored pixel map
// on the shared legend (src/ui/handKit.js mapPx, master palette src/ui/palette.js).
//   openLetter(game, letter) → panel handle · openGiftTray(game, npc, onPick) → handle
//   heartsEl(n, max) → a row of heart <img>s · heartURL(full)
import { el } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { VILLAGERS } from '../data/villagers.js';
import { MAX_HEARTS } from '../data/story.js';
import { mapPx, kitURL, ACCENT } from './handKit.js';
import { swing } from './common.js';
import './choices.css';
import './letters.css';

// a lopsided heart, lit top left (9×8); the empty one is a scratched outline on paper
const HEART = [
  '.kk...kk.',
  'kFokkrrrk',
  'kFrrrrrRk',
  'korrrrrRk',
  '.krrrrRk.',
  '..krrRk..',
  '...kRk...',
  '....k....',
];
const HEART_NIL = [
  '.kk...kk.',
  'kssk.ksck',
  'ks.....ck',
  'kc....cck',
  '.kc...ck.',
  '..kc.ck..',
  '...kck...',
  '....k....',
];
// a folded envelope, flap down, a little crooked (24×16)
const ENVELOPE = [
  '.kkkkkkkkkkkkkkkkkkkkkk.',
  'kCClcccccccccccccccclCCk',
  'kCcClcccccccccccccclcsck',
  'kCccCllccccccccccllcsstk',
  'kCccccClllccccclllccsstk',
  'kCcccccccClllllccccssstk',
  'kCccccccccrrrrrcccccsstk',
  'kCcccccccrorrrRrcccssstk',
  'kCcccccccrrrrrRrccsssstk',
  'kCccccccccrRRRrccsssstk.',
  'kCccccccctccccccstssstk.',
  'kCcccccctccccccccstsstk.',
  'kCcccccsccccccccccsttsk.',
  'kCccctssssssssssssstttk.',
  '.ktttttttttttttttttttttk',
  '..kkkkkkkkkkkkkkkkkkkkk.',
];
// a parchment gift tag with its twine hole (22×26)
const TAG = [
  '.......kkkkkkkk.......',
  '......kCCCCCcctk......',
  '.....kCCcckkcctsk.....',
  '....kCCccck.kcstsk....',
  '...kCCcccckkkcsstsk...',
  '..kCCccccccccccsstsk..',
  '.kCCccccccccccccsstsk.',
  'kCCcccccccccccccccstsk',
  'kCcccccccccccccccccstk',
  'kCcccccccccccccccccstk',
  'kCcccccccccccccccccstk',
  'kCcccccccccccccccccstk',
  'kCccccccccccccccccsstk',
  'kCcccccccccccccccccstk',
  'kCcccccccccccccccccstk',
  'kCcccccccccccccccccstk',
  'kCcccccccccccccccccstk',
  'kCccccccccccccccccsstk',
  'kCcccccccccccccccccstk',
  'kCcccccccccccccccccstk',
  'kCcccccccccccccccccstk',
  'kCccccccccccccccccsstk',
  'kCccscccccccccccccsttk',
  'kCcssssssssssssssssttk',
  '.kttttttttttttttttttk.',
  '..kkkkkkkkkkkkkkkkkk..',
];

const urls = {};
const url = (k, rows, rc) => (urls[k] ||= mapPx(rows, rc).url());
export const heartURL = (full) => (full ? url('h1', HEART) : url('h0', HEART_NIL));
export const envelopeURL = () => url('env', ENVELOPE);
const tagURL = (i) => url('tag' + (i % 2), TAG, i % 2 ? { C: 'C', c: 's', s: 't', t: 'W' } : null);
const SEAL = { r: 'red', b: 'gold', n: 'green', q: 'blue', o: 'red', 9: 'purple' };

/** A row of hand-drawn hearts (n full of max). */
export function heartsEl(n, max = MAX_HEARTS) {
  return el('span', { class: 'lt-hearts', title: `${n} of ${max}` }, Array.from({ length: max }, (_, i) => el('img', { class: 'pix' + (i < n ? ' on' : ''), src: heartURL(i < n), alt: '' })));
}

/** The morning letter: the envelope tips up, the seal pops, the sheet unfolds. */
export function openLetter(game, L) {
  game.audio?.play('page', { vol: 0.7 });
  const lines = String(L.text || '').split('\n');
  const gifts = Object.entries(L.gift || {}).filter(([id]) => ITEMS[id]);
  const sheet = el('div', { class: 'lt-sheet' }, [
    el('img', { class: 'pix lt-seal', src: kitURL('waxSeal', ACCENT[SEAL[L.seal] || 'red']), alt: '' }),
    el('div', { class: 'lt-body' }, lines.map((t, i) => el('p', { style: { '--d': 260 + i * 140 + 'ms' } }, t))),
    gifts.length ? el('div', { class: 'lt-gift' }, gifts.map(([id, n]) => el('span', {}, [el('img', { class: 'pix', src: iconURL(id), alt: '' }), n > 1 ? el('b', {}, '×' + n) : null]))) : null,
    el('div', { class: 'lt-from' }, L.from),
  ]);
  const env = el('img', { class: 'pix lt-env', src: envelopeURL(), alt: '' });
  const root = el('div', { class: 'lt' }, [env, sheet]);
  const h = game.ui.openPanel({ body: root, className: 'lt-panel' });
  setTimeout(() => game.audio?.play('crack', { vol: 0.25 }), 220);
  if (gifts.length) setTimeout(() => gifts.forEach(([id, n], i) => game.ui.status?.flyTo?.('pack', iconURL(id), { n, delay: i * 200 })), 900);
  root.addEventListener('click', () => h.close());
  return h;
}

/** What to give: the bag's giftables on tags, their hearts on the sign. onPick(id) with it open. */
export function openGiftTray(game, npc, items, onPick) {
  const V = VILLAGERS[npc] || {}, hearts = game.daily?.hearts(npc) ?? 0;
  const tags = items.slice(0, 24).map((g, i) => {
    const it = ITEMS[g.id];
    const b = el('button', {
      class: 'lt-tag', 'aria-label': `Give ${it?.name || g.id}`, style: { '--tilt': `${[-3, 2, -1, 3, -2][i % 5]}deg`, '--d': Math.min(360, i * 30) + 'ms' },
      onclick: () => { b.classList.add('given'); onPick?.(g.id); },
      onmouseenter: () => { game.audio?.play?.('ui_hover', { vol: 0.2 }); swing(b.firstChild, 4, 600); },
    }, [
      el('span', { class: 'lt-paper', style: { backgroundImage: `url("${tagURL(i)}")` } }, [el('img', { class: 'pix', src: iconURL(g.id), alt: '' })]),
      el('span', { class: 'lt-name' }, it?.name || g.id),
    ]);
    return b;
  });
  const root = el('div', { class: 'tk lt-tray' }, [
    el('div', { class: 'tk-sign' }, [el('i', { class: 'tk-chain l' }), el('i', { class: 'tk-chain r' }), el('h2', {}, V.name || npc)]),
    el('div', { class: 'tk-board lt-box' }, [
      heartsEl(hearts),
      tags.length ? el('div', { class: 'lt-tags' }, tags) : el('p', { class: 'lt-empty' }, 'Nothing in the bag worth giving.'),
    ]),
  ]);
  const h = game.ui.openPanel({ body: root, className: 'tk-panel' });
  setTimeout(() => tags[0]?.focus({ preventScroll: true }), 40);
  return h;
}
