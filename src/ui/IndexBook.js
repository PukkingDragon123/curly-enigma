// The Index Book: a leather field notebook of everything you've discovered by poking at the world.
// Two parchment pages (one at a time on phones), category tabs on the page edge, sketches for what
// you've found and charcoal smudges for what you haven't. Pages turn when you change category.
import { el, formatGoldFull } from '../core/util.js';
import { iconURL, weaponIconURL, specURL } from '../gfx/PixelArt.js';
import { ITEMS, sellPrice } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { MECHANICS } from '../data/mechanics.js';
import { DISHES, RECIPES, BUFFS } from '../data/recipes.js';
import { WEAPON_TYPES, METALS, gradeFor } from '../data/weapons.js';
import { ZONES } from '../data/zones.js';
import * as blocks from '../data/ores.js';
import { creatureIconURL } from './UI.js';
import { onSwipe, put } from './common.js';

const bookIcon = () => specURL('ui:book', { k: 'book' });

const CATS = [
  { id: 'mineral', label: 'Minerals', color: '#9a7048', icon: () => iconURL('copper_ore'), list: () => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'mineral') },
  { id: 'gem', label: 'Gems', color: '#b03a6a', icon: () => iconURL('ruby'), list: () => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'gem') },
  { id: 'plant', label: 'Plants', color: '#4a8a3a', icon: () => iconURL('glowcap'), list: () => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'plant') },
  { id: 'critter', label: 'Creatures', color: '#3a6a9a', icon: () => iconURL('glow_beetle'), list: () => Object.keys(CREATURES) },
  { id: 'weapon', label: 'Weapons', color: '#6a6a7a', icon: () => weaponIconURL(Object.keys(WEAPON_TYPES)[0], 'iron'), list: () => Object.keys(WEAPON_TYPES) },
  { id: 'recipe', label: 'Recipes', color: '#c0702a', icon: () => iconURL(Object.keys(DISHES)[0]), list: () => Object.keys(DISHES) },
  { id: 'mechanic', label: 'Mechanics', color: '#6a3a8a', icon: bookIcon, list: () => Object.keys(MECHANICS) },
];

const PLANT_ZONES = {
  cave_carrot: [1, 2], glowcap: [1, 2, 3, 5], blindfern: [1, 2], whisperweed: [1, 2, 3, 5, 6], rubber_sap: [2, 3], pepperroot: [2, 4],
  sparkmoss: [3], bubblebulb: [3], crystal_lily: [3, 6], gloomshroom: [3, 4, 5], ashfern: [4], emberbloom: [4, 6], truffle: [1, 2, 4],
  frostbloom: [5, 6], core_lotus: [6],
};

function zonesOfMineral(id) {
  const out = [];
  const spawn = blocks.ORE_SPAWN || {};
  for (const [z, list] of Object.entries(spawn)) if (Array.isArray(list) && list.some((e) => (Array.isArray(e) ? e[0] : e?.id) === id)) out.push(+z);
  if (id === 'obsidian_shard' && !out.includes(4)) out.push(4);
  if (id === 'amethyst' && !out.includes(3)) out.push(3);
  return out;
}
const zoneNames = (zs) => zs.map((z) => ZONES[z]?.name).filter(Boolean).join(', ');

export function totalIndexEntries() {
  return CATS.reduce((s, c) => s + c.list().length, 0);
}

export function openIndexBook(game, startCat, startId) {
  const st = game.state;
  let cat = startCat && CATS.some((c) => c.id === startCat) ? startCat : 'mineral';
  let sel = startId || null;
  let side = sel ? 'right' : 'left'; // which page is showing in one-page mode
  const seenNew = new Set(JSON.parse(st.flag('indexSeen') || '[]'));

  const left = el('div', { class: 'ib-page ib-left' });
  const right = el('div', { class: 'ib-page ib-right' });
  const turn = el('div', { class: 'ib-turn', hidden: true }, [el('i'), el('b')]);
  const pages = el('div', { class: 'ib-pages' }, [left, right, turn]);
  const tabs = el('nav', { class: 'ib-tabs', 'aria-label': 'Chapters' });
  const ribbon = el('i', { class: 'ib-ribbon' });
  const cover = el('div', { class: 'ib-cover' }, [pages]);
  const book = el('div', { class: 'ib' }, [ribbon, cover, tabs]);

  const iconFor = (c, id) => {
    if (c === 'critter') return creatureIconURL(id);
    if (c === 'weapon') {
      const e = st.data.index['weapon:' + id];
      const metal = e && e.metals ? Object.entries(e.metals).sort((a, b) => b[1] - a[1])[0][0] : 'iron';
      return weaponIconURL(id, metal);
    }
    if (c === 'mechanic') return bookIcon();
    return iconURL(id);
  };
  const nameFor = (c, id) => {
    if (c === 'critter') return CREATURES[id].name;
    if (c === 'weapon') return WEAPON_TYPES[id].name;
    if (c === 'mechanic') return MECHANICS[id].name;
    return ITEMS[id]?.name || id;
  };
  const knownCount = (c) => c.list().filter((id) => st.known(c.id, id)).length;

  // ---------------- chapter tabs on the page edge
  const renderTabs = () => {
    tabs.innerHTML = '';
    for (const c of CATS) {
      const n = knownCount(c);
      const b = el('button', {
        class: 'ib-tab' + (c.id === cat ? ' on' : ''), title: `${c.label} · ${n}/${c.list().length}`, 'aria-label': c.label,
        onclick: () => goCat(c.id),
      }, [el('img', { class: 'pix', src: c.icon(), alt: '' }), el('span', {}, c.label)]);
      b.style.setProperty('--tc', c.color);
      tabs.append(b);
    }
  };

  // ---------------- left page: the chapter's sketches
  const renderLeft = () => {
    const def = CATS.find((c) => c.id === cat);
    const list = def.list();
    const known = list.filter((id) => st.known(cat, id));
    const total = totalIndexEntries();
    const totalKnown = CATS.reduce((s, c) => s + knownCount(c), 0);
    left.innerHTML = '';
    left.style.setProperty('--tc', def.color);
    const grid = el('div', { class: 'ib-grid' });
    for (const id of list) {
      const k = st.known(cat, id);
      const isNew = k && !seenNew.has(cat + ':' + id);
      const cell = el('button', {
        class: 'ib-entry' + (k ? ' known' : '') + (sel === id ? ' on' : '') + (isNew ? ' new' : ''),
        title: k ? nameFor(cat, id) : '???', 'aria-label': k ? nameFor(cat, id) : 'Undiscovered',
        onclick: () => pick(id),
      }, [el('img', { class: 'pix', src: iconFor(cat, id), alt: '' }), k ? null : el('span', { class: 'unk' }, '?')]);
      grid.append(cell);
    }
    put(left,
      el('header', { class: 'ib-head' }, [
        el('h2', { class: 'ib-title' }, def.label),
        el('div', { class: 'ib-count' }, [el('b', {}, `${known.length}`), ` of ${list.length} recorded`]),
      ]),
      el('div', { class: 'ib-scroll' }, [grid]),
      el('footer', { class: 'ib-foot' }, [el('span', {}, `Whole book ${Math.round((totalKnown / total) * 100)}%`), el('i', { class: 'ib-bar' }, [el('b', { style: { width: ((totalKnown / total) * 100).toFixed(1) + '%' } })])]),
    );
  };

  // ---------------- right page: field notes
  const renderRight = () => {
    right.innerHTML = '';
    const back = el('button', { class: 'ib-back', onclick: () => { side = 'left'; flip(-1, () => {}); } }, '‹ Back');
    if (!sel) {
      const s = st.data.stats;
      put(right,
        back,
        el('h2', { class: 'ib-title' }, 'Field Notes'),
        el('p', { class: 'ib-note' }, 'Everything in here was learned the hard way: by digging, poking, burning, zapping and tasting.'),
        el('p', { class: 'ib-note muted' }, 'Pick a sketch to read your notes.'),
        el('ul', { class: 'ib-stats' }, [
          el('li', {}, [el('img', { class: 'pix', src: iconURL('pick_rusty'), alt: '' }), el('span', {}, 'Blocks dug'), el('b', {}, String(s.blocks))]),
          el('li', {}, [el('img', { class: 'pix', src: iconURL('copper_ore'), alt: '' }), el('span', {}, 'Finds'), el('b', {}, String(s.ores))]),
          el('li', {}, [el('img', { class: 'pix', src: weaponIconURL(Object.keys(WEAPON_TYPES)[0], 'iron'), alt: '' }), el('span', {}, 'Weapons forged'), el('b', {}, String(s.weapons))]),
          el('li', {}, [el('img', { class: 'pix', src: iconURL(Object.keys(DISHES)[0]), alt: '' }), el('span', {}, 'Dishes cooked'), el('b', {}, String(s.dishes))]),
        ]),
        el('div', { class: 'ib-dayline' }, `Day ${st.data.day}`),
      );
      return;
    }
    const k = st.known(cat, sel);
    if (!k) {
      let hint = 'Not discovered yet.';
      if (cat === 'mineral' || cat === 'gem') { const zs = zonesOfMineral(sel); if (zs.length) hint = `Rumored to be found in: ${zoneNames(zs)}.`; }
      if (cat === 'plant' && PLANT_ZONES[sel]) hint = `Said to grow in: ${zoneNames(PLANT_ZONES[sel])}.`;
      if (cat === 'critter') hint = `Spotted in: ${zoneNames(CREATURES[sel].zones)}.`;
      if (cat === 'weapon') hint = st.owns('bp_' + sel) ? 'You have the plans. Forge one!' : 'Plans for this are sold at Inkwell Plans.';
      if (cat === 'recipe') hint = 'Some combination of ingredients makes this. Experiment at the stove.';
      if (cat === 'mechanic') hint = 'You\'ll understand this one when it happens to you.';
      put(right,
        back,
        el('div', { class: 'ib-entryhead' }, [
          el('div', { class: 'ib-sketch smudged' }, [el('img', { class: 'pix', src: iconFor(cat, sel), alt: '' }), el('span', { class: 'unk' }, '?')]),
          el('div', {}, [el('h2', { class: 'ib-title' }, '???'), el('div', { class: 'ib-count' }, 'Not yet recorded')]),
        ]),
        el('p', { class: 'ib-note' }, hint),
      );
      return;
    }
    const entry = st.data.index[cat + ':' + sel];
    const lines = [];
    if (cat === 'mineral' || cat === 'gem' || cat === 'plant') {
      const it = ITEMS[sel];
      lines.push(it.desc);
      const zs = cat === 'plant' ? PLANT_ZONES[sel] || zonesOfMineral(sel) : zonesOfMineral(sel);
      if (zs && zs.length) lines.push(`<b>Found in:</b> ${zoneNames(zs)}`);
      lines.push(`<b>Worth:</b> up to <span class="gold-txt">${formatGoldFull(sellPrice(sel, 100, it.q))}g</span>${it.q ? ' pristine' : ''}`);
      if (it.metal) lines.push(`<b>Smelts into:</b> ${METALS[it.metal]?.name || it.metal} ingots`);
      if (st.count(sel)) lines.push(`<b>In your bag:</b> ${st.count(sel)}`);
    } else if (cat === 'critter') {
      const c = CREATURES[sel];
      lines.push(c.desc);
      lines.push(`<b>Habitat:</b> ${zoneNames(c.zones)}`);
      if (c.drop) lines.push(`<b>Leaves behind:</b> ${ITEMS[c.drop].name}`);
    } else if (cat === 'weapon') {
      const t = WEAPON_TYPES[sel];
      lines.push(`Uses ${t.ingots} ingot${t.ingots > 1 ? 's' : ''}. Balances best ${t.balance < 0.3 ? 'close to the guard' : t.balance > 0.6 ? 'toward the head' : 'near the middle'}.`);
      if (entry.metals) lines.push('<b>Forged in:</b> ' + Object.entries(entry.metals).map(([m, sc]) => `${METALS[m]?.name} (best ${gradeFor(sc).g})`).join(', '));
    } else if (cat === 'recipe') {
      const d = DISHES[sel];
      lines.push(d.desc);
      const r = RECIPES.find((x) => x.dish === sel);
      if (r) lines.push('<b>Ingredients:</b> ' + Object.keys(r.ing).map((i) => ITEMS[i]?.name).join(' + '));
      lines.push(`<b>Energy:</b> +${d.energy}` + (d.buff ? ` · ${BUFFS[d.buff].name}: ${BUFFS[d.buff].desc}` : '') + (d.maxEnergy ? ` · +${d.maxEnergy} max energy` : ''));
      if (st.data.recipes[sel]) lines.push(`<b>Best attempt:</b> ${Math.round(st.data.recipes[sel])} / 100`);
    } else if (cat === 'mechanic') {
      lines.push(MECHANICS[sel].desc);
    }
    const [first, ...rest] = lines;
    put(right,
      back,
      el('div', { class: 'ib-entryhead' }, [
        el('div', { class: 'ib-sketch' }, [el('img', { class: 'pix', src: iconFor(cat, sel), alt: '' }), el('i', { class: 'tape a' }), el('i', { class: 'tape b' })]),
        el('div', {}, [el('h2', { class: 'ib-title' }, nameFor(cat, sel)), el('span', { class: 'ib-stamp' }, `Day ${entry.day}`)]),
      ]),
      first ? el('p', { class: 'ib-note lead', html: first }) : null,
      rest.length ? el('ul', { class: 'ib-lines' }, rest.map((l) => el('li', { html: l }))) : null,
    );
  };

  const render = () => { renderTabs(); renderLeft(); renderRight(); book.dataset.side = side; };

  // ---------------- page turning
  let turning = false;
  const flip = (dir, swap) => {
    if (turning) { swap(); render(); return; }
    turning = true;
    game.audio.play('page');
    turn.hidden = false;
    turn.className = 'ib-turn ' + (dir > 0 ? 'fwd' : 'back');
    void turn.offsetWidth;
    turn.classList.add('go');
    setTimeout(() => { swap(); render(); }, 190);
    setTimeout(() => { turn.hidden = true; turn.className = 'ib-turn'; turning = false; }, 460);
  };
  const goCat = (id, dir) => {
    if (id === cat) { if (side === 'right') { side = 'left'; flip(-1, () => {}); } return; }
    const d = dir || (CATS.findIndex((c) => c.id === id) > CATS.findIndex((c) => c.id === cat) ? 1 : -1);
    flip(d, () => { cat = id; sel = null; side = 'left'; });
  };
  const pick = (id) => {
    seenNew.add(cat + ':' + id);
    st.flag('indexSeen', JSON.stringify([...seenNew]));
    if (book.classList.contains('single')) { flip(1, () => { sel = id; side = 'right'; }); return; }
    sel = id;
    game.audio.play('ui_click');
    render();
    right.classList.remove('ink');
    void right.offsetWidth;
    right.classList.add('ink');
  };
  onSwipe(pages, (dir) => {
    if (book.classList.contains('single') && side === 'right') { if (dir > 0) { side = 'left'; flip(-1, () => {}); } return; }
    const i = CATS.findIndex((c) => c.id === cat);
    const j = i - dir;
    if (j >= 0 && j < CATS.length) goCat(CATS[j].id, -dir);
  });

  const fit = () => {
    const single = window.innerWidth < 760 || (window.innerWidth < 960 && window.innerHeight < 520);
    book.classList.toggle('single', single);
  };
  fit();
  window.addEventListener('resize', fit);
  render();
  game.audio.play('page');
  let h = null;
  const onKey = (e) => {
    if (!h || h.closed || game.ui.panelStack[game.ui.panelStack.length - 1] !== h) return;
    const i = CATS.findIndex((c) => c.id === cat);
    if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'PageDown') { if (i < CATS.length - 1) goCat(CATS[i + 1].id, 1); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'PageUp') { if (i > 0) goCat(CATS[i - 1].id, -1); }
    else if (e.code === 'KeyB') { e.preventDefault(); h.close(); }
  };
  h = game.ui.openPanel({
    body: book, className: 'ib-panel',
    onClose: () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', onKey);
      st.flag('indexSeen', JSON.stringify([...seenNew]));
    },
  });
  h.onEscape = () => {
    if (book.classList.contains('single') && side === 'right') { side = 'left'; flip(-1, () => {}); return true; }
    return false;
  };
  window.addEventListener('keydown', onKey);
  return h;
}
