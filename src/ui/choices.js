// Small diegetic pickers shared by the scenes:
//   openTalkMenu(game, { name, who, npc, mood, line, sub, options: [{ label, sub, primary, onClick }], onClose, convo })
//     when the speaker (npc / who / name) has a 3D model in this scene, this is a cutscene talk
//     (src/ui/Convo.js: the camera on them, the line floating by their head, the options floating in;
//     the handle has close(), closed, typer); `convo: false` keeps the board. Otherwise the talk board: the carved dialogue board with the speaker's live 3D portrait (portrait3d) in a
//     brass frame, a name ribbon, what they say typing out on parchment in their voice, and the
//     choices as paper notes pinned below (click, tap, the number keys or ↑ ↓ + Enter). onClick runs
//     with the menu still open (callers close it as they like). who: the portrait (default from
//     name; see portrait3d.js); `face` (an old 2D picture) is ignored: characters are always 3D.
//   openSeedTray(game, { title, note, items: [{ id, n }], onPick(id) })
//     a wooden seed box of paper seed packets, one per plant (the Planter at home).
// Both return the ui.openPanel handle (the talk board's has .portrait, the live portrait handle).
import { el } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { Px, PAL, INK, art, mixHex } from './uiArt.js';
import { portrait3d } from '../gfx/portrait3d.js';
import { speakerOf } from './Tutor.js';
import { installDialogArt } from './dialogArt.js';
import { typeText } from './talkType.js';
import { convoTalkMenu } from './Convo.js';
import './choices.css';

const P = PAL.paper;

/** A paper seed packet with a crimped top, a picture window and a coloured band (30×38). */
function packetSprite(band) {
  const R = [PAL.green, PAL.red, PAL.blue, PAL.amber, PAL.purple][band % 5];
  const p = new Px(30, 38);
  p.rect(1, 2, 28, 35, P.base);
  // crimped top edge
  for (let x = 1; x <= 28; x++) { p.set(x, 1, x % 2 ? P.mid : P.hi); if (x % 2) p.clear(x, 0); else p.set(x, 0, P.mid); }
  p.hl(1, 28, 3, P.dk); p.hl(1, 28, 4, P.hi);
  // shading: light left, darker right
  p.vl(1, 5, 36, P.hi); p.vl(28, 3, 36, P.mid); p.vl(27, 5, 36, mixHex(P.base, P.mid, 0.5));
  // picture window
  p.rect(4, 7, 22, 22, 0xfffaf0);
  p.box(3, 6, 24, 24, mixHex(P.edge, P.dk, 0.4));
  p.hl(4, 25, 28, mixHex(0xfffaf0, P.mid, 0.6));
  // coloured band with a little sprout
  p.rect(1, 31, 28, 6, R.base);
  p.hl(1, 28, 31, R.lt); p.hl(1, 28, 36, R.dk);
  p.set(6, 34, R.hi); p.set(7, 33, R.hi); p.set(8, 34, R.hi); p.set(7, 35, R.dk);
  for (let x = 12; x <= 24; x += 3) p.set(x, 34, R.hi);
  p.outline(P.edge);
  return p;
}
const PACKET = (band) => art('seedPacket' + band, () => packetSprite(band));
const bandOf = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

/** Pointing paw (aims right) beside the focused note: 12×9. */
function pawPoint() {
  const p = new Px(13, 10);
  p.tpl([
    '..........',
    '.aaaaa....',
    'aaaaaaaaaa',
    'aaaaaaaaaa',
    'aaaaaaa...',
    'aaaaaaa...',
    '.aaaaa....',
  ], { a: 0xf6dcc0 }, 1, 1);
  p.hl(7, 10, 2, 0xffffff);
  p.outline(INK);
  return p;
}

let artInstalled = false;
function installArt() {
  if (artInstalled) return;
  artInstalled = true;
  document.documentElement.style.setProperty('--a-pawPoint', `url("${art('pawPoint', pawPoint)}")`);
}

// ------------------------------------------------------------------ talk menu
export function openTalkMenu(game, { name, who, mood = 'calm', face, line = '', sub = '', options = [], onClose, className = '', npc, convo, camera } = {}) {
  const real = game.engine ? game : game.ui?.game || game;
  // the speaker is here in 3D: it's a cutscene (src/ui/Convo.js), the words floating by their head
  const cv = convoTalkMenu(real, { name, who, npc, mood, line, sub, options, onClose, className, convo, camera });
  if (cv) return cv;
  installArt();
  installDialogArt();
  void face; // characters are never 2D pictures any more: the portrait is the live 3D model
  portrait3d.init(real);
  const audio = game.audio;
  const cast = speakerOf(who, name);
  const notes = options.map((o, i) => el('button', {
    class: 'tk-note' + (o.primary ? ' primary' : ''), style: { '--tilt': `${[-1.2, 0.9, -0.6, 1.1][i % 4]}deg`, '--d': `${0.18 + i * 0.07}s` },
    onclick: () => { audio.play(o.primary ? 'ui_click' : 'page', { vol: 0.6 }); o.onClick?.(); },
    onmouseenter: () => { audio.play('ui_hover', { vol: 0.25 }); },
  }, [el('i', { class: 'tk-tack' }), el('span', { class: 'tk-num' }, String(i + 1)), el('span', { class: 'tk-txt' }, [el('b', {}, o.label), o.sub ? el('small', {}, o.sub) : null])]));
  const frame = el('div', { class: 'tk-frame' });
  const sayP = el('p');
  const say = el('div', { class: 'tk-say' }, [sub ? el('small', {}, sub) : null, sayP]);
  const root = el('div', { class: 'tk tk-talk ' + className, 'data-who': cast?.key?.split(':')[0] || '' }, [
    el('div', { class: 'tk-board' }, [
      el('div', { class: 'tk-plate' }, [el('span', {}, name || cast?.name || '')]),
      el('div', { class: 'tk-head' }, [el('div', { class: 'tk-portrait' }, [frame, el('i', { class: 'tt-glass' })]), say]),
      notes.length ? el('div', { class: 'tk-notes' }, notes) : null,
    ]),
  ]);
  let typer = null, h3d = null;
  const key = (e) => {
    const i = parseInt(e.key, 10);
    if (i >= 1 && i <= notes.length) { e.preventDefault(); notes[i - 1].click(); return; }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      const cur = notes.indexOf(document.activeElement);
      const n = (cur + (e.code === 'ArrowDown' ? 1 : -1) + notes.length) % notes.length;
      notes[cur < 0 ? 0 : n].focus();
    }
  };
  window.addEventListener('keydown', key);
  const h = game.ui.openPanel({ body: root, className: 'tk-panel', onClose: () => { window.removeEventListener('keydown', key); typer?.stop(); h3d?.dispose(); onClose?.(); } });
  // the portrait and the words, once the board is on the page
  const small = window.matchMedia?.('(max-width: 560px), (max-height: 520px)').matches;
  const size = small ? 40 : 48;
  root.style.setProperty('--pp', size);
  h3d = portrait3d.mount(frame, cast, { size, mood });
  h3d.set(mood);
  typer = typeText(sayP, line, { voice: cast?.voice, mood, audio, face: h3d, delay: 0.3 });
  say.addEventListener('pointerdown', () => typer?.finish());
  h.portrait = h3d;
  h.typer = typer;
  setTimeout(() => (notes.find((n, i) => options[i].primary) || notes[0])?.focus({ preventScroll: true }), 40);
  return h;
}

// ------------------------------------------------------------------ seed tray
export function openSeedTray(game, { title = 'Planter', note = 'Pick a seed to sow. It grows by morning.', items = [], onPick } = {}) {
  installArt();
  const packs = items.map((g, i) => {
    const it = ITEMS[g.id];
    const b = el('button', {
      class: 'sd-pack', title: it?.desc || it?.name || g.id, 'aria-label': `Plant ${it?.name || g.id} (${g.n})`, style: { '--d': Math.min(400, i * 40) + 'ms', '--tilt': `${[-2, 1.5, -1, 2.2, -1.6][i % 5]}deg` },
      onclick: () => { b.classList.add('sown'); onPick?.(g.id); },
    }, [
      el('span', { class: 'sd-paper', style: { backgroundImage: `url("${PACKET(bandOf(g.id))}")` } }, [el('img', { class: 'pix', src: iconURL(g.id), alt: '' })]),
      el('span', { class: 'sd-name' }, it?.name || g.id),
      el('span', { class: 'sd-n' }, '×' + g.n),
    ]);
    return b;
  });
  const root = el('div', { class: 'tk sd' }, [
    el('div', { class: 'tk-sign' }, [el('i', { class: 'tk-chain l' }), el('i', { class: 'tk-chain r' }), el('h2', {}, title)]),
    el('div', { class: 'tk-board sd-box' }, [
      el('p', { class: 'sd-note' }, note),
      el('div', { class: 'sd-packs' }, packs),
    ]),
  ]);
  const h = game.ui.openPanel({ body: root, className: 'tk-panel' });
  setTimeout(() => packs[0]?.focus({ preventScroll: true }), 40);
  return h;
}
