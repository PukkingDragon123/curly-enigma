// Ending credits: a slow DOM roll over the beach with the player's journey stats,
// then the end-of-game choices.
import { el, formatGoldFull } from '../core/util.js';
import { logoLetters } from './logo.js';
import { ITEMS } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { DISHES } from '../data/recipes.js';
import { WEAPON_TYPES } from '../data/weapons.js';
import { MECHANICS } from '../data/mechanics.js';

const INDEX_CATS = new Set(['mineral', 'gem', 'plant', 'critter', 'weapon', 'recipe', 'mechanic']);

/** Total Index Book entries and how many the player has found. */
export function indexCompletion(state) {
  const total = Object.values(ITEMS).filter((it) => it.cat === 'mineral' || it.cat === 'gem' || it.cat === 'plant').length
    + Object.keys(CREATURES).length + Object.keys(DISHES).length + Object.keys(WEAPON_TYPES).length + Object.keys(MECHANICS).length;
  const known = Object.keys(state.data.index || {}).filter((k) => INDEX_CATS.has(k.split(':')[0])).length;
  return { known: Math.min(known, total), total };
}

export function formatPlayTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function journeyStats(state) {
  const d = state.data;
  const st = d.stats || {};
  const n = (v) => formatGoldFull(v || 0);
  const idx = indexCompletion(state);
  const pct = idx.total ? Math.round((idx.known / idx.total) * 100) : 0;
  return [
    ['Days underground', n(d.day)],
    ['Time played', formatPlayTime(d.playTime)],
    ['Ores mined', n(st.ores)],
    ['Pristine finds', n(st.pristine)],
    ['Weapons forged', n(st.weapons)],
    ['Best weapon', `${n(st.bestWeapon)} g`, 'gold'],
    ['Dishes cooked', n(st.dishes)],
    ['Cave-ins survived', n(st.caveins)],
    ['Index Book', `${idx.known} / ${idx.total} (${pct}%)`],
  ];
}

/**
 * Build the credits DOM. Returns {el, start(), update(dt), finish(), shown, done}.
 * handlers: {onRelax, onTown, onTitle, onClick}
 */
export function buildCredits(game, handlers) {
  const st = game.state;
  const hen = (st.data.chicken && st.data.chicken.name) || 'Nugget';
  const stats = el('dl', { class: 'bk-stats' });
  for (const [label, value, cls] of journeyStats(st)) stats.append(el('dt', {}, label), el('dd', { class: cls || '' }, value));

  const btn = (label, fn, alt) => el('button', { class: 'btn' + (alt ? ' alt' : ''), type: 'button', onclick: () => { game.audio.play('ui_click'); fn(); } }, label);
  const end = el('div', { class: 'bk-end' }, [
    btn('Keep relaxing', () => handlers.onRelax()),
    btn('Back to Deep Town', () => handlers.onTown(), true),
    btn('Title screen', () => handlers.onTitle(), true),
  ]);
  const endBlock = el('div', { class: 'bk-endblock' }, [el('div', { class: 'bk-thanks bk-outline' }, 'Thanks for playing!'), end]);

  // the same pixel logo as the title screen (gold MOLE, hot-metal FORGE), bobbing gently
  const logo = el('div', { class: 'bk-logo bk-roll-logo', role: 'img', 'aria-label': 'MOLEFORGE' }, logoLetters().map((L, i) => el('span', { class: L.hot ? 'hot' : '', style: { '--i': i } }, [
    el('img', { class: 'pix', src: L.url, alt: '', draggable: 'false', style: { width: `calc(var(--lp) * ${L.w})`, height: `calc(var(--lp) * ${L.h})` } }),
  ])));
  const roll = el('div', { class: 'bk-roll bk-outline' }, [
    logo,
    el('div', { class: 'tag' }, 'A game about digging your way out'),
    el('h3', {}, 'Starring'),
    el('p', {}, 'One very dirty mole'),
    el('p', {}, `${hen}, a very good chicken`),
    el('p', { class: 'soft' }, 'and everyone in Deep Town'),
    el('h3', {}, 'Your journey'),
    stats,
    el('h3', {}, 'Made with'),
    el('p', {}, 'Three.js'),
    el('p', {}, 'Every sound synthesized in your browser'),
    el('p', {}, 'All art procedurally generated'),
    el('p', { class: 'soft' }, 'No external assets. Just a lot of tiny cubes.'),
    endBlock,
  ]);
  // laid out from the start but invisible, so showing it later costs no layout pass mid-scene
  const root = el('div', { class: 'bk-credits', style: { visibility: 'hidden' } }, [roll]);

  const c = { el: root, shown: false, done: false, y: 0, target: 0, fast: false };
  const measure = () => {
    const vh = window.innerHeight;
    const center = endBlock.offsetTop + endBlock.offsetHeight / 2;
    c.target = vh * 0.5 - center;
  };
  c.start = () => {
    root.style.visibility = '';
    c.shown = true;
    c.done = false;
    end.classList.remove('on');
    c.y = window.innerHeight * 1.02;
    roll.style.transform = `translateY(${c.y}px)`;
    measure();
  };
  c.finish = () => {
    measure();
    c.y = c.target;
    roll.style.transform = `translateY(${Math.round(c.y)}px)`;
    c.done = true;
    end.classList.add('on');
  };
  c.hide = () => { root.style.visibility = 'hidden'; c.shown = false; };
  c.update = (dt) => {
    if (!c.shown || c.done) return;
    measure();
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
    const speed = px * 17 * (c.fast ? 5 : 1);
    c.y -= speed * dt;
    if (c.y <= c.target) c.finish();
    else roll.style.transform = `translateY(${Math.round(c.y)}px)`;
  };
  return c;
}
