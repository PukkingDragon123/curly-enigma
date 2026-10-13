// The Index Book: everything you've discovered by poking at the world.
import { el, formatGoldFull } from '../core/util.js';
import { iconURL, weaponIconURL, specURL } from '../gfx/PixelArt.js';
import { ITEMS, sellPrice } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { MECHANICS } from '../data/mechanics.js';
import { DISHES, RECIPES, BUFFS } from '../data/recipes.js';
import { WEAPON_TYPES, METALS, gradeFor } from '../data/weapons.js';
import { ZONES } from '../data/zones.js';
import { ORE_SPAWN } from '../mine/blocks.js';
import { creatureIconURL } from './UI.js';

const CATS = [
  { id: 'mineral', label: 'Minerals', color: '#8a6a4a', list: () => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'mineral') },
  { id: 'gem', label: 'Gems', color: '#b03a6a', list: () => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'gem') },
  { id: 'plant', label: 'Plants', color: '#4a8a3a', list: () => Object.keys(ITEMS).filter((k) => ITEMS[k].cat === 'plant') },
  { id: 'critter', label: 'Creatures', color: '#3a6a9a', list: () => Object.keys(CREATURES) },
  { id: 'weapon', label: 'Weapons', color: '#6a6a7a', list: () => Object.keys(WEAPON_TYPES) },
  { id: 'recipe', label: 'Recipes', color: '#c0702a', list: () => Object.keys(DISHES) },
  { id: 'mechanic', label: 'Mechanics', color: '#6a3a8a', list: () => Object.keys(MECHANICS) },
];

const PLANT_ZONES = {
  cave_carrot: [1, 2], glowcap: [1, 2, 3, 5], blindfern: [1, 2], whisperweed: [1, 2, 3, 5, 6], rubber_sap: [2, 3], pepperroot: [2, 4],
  sparkmoss: [3], bubblebulb: [3], crystal_lily: [3, 6], gloomshroom: [3, 4, 5], ashfern: [4], emberbloom: [4, 6], truffle: [1, 2, 4],
  frostbloom: [5, 6], core_lotus: [6],
};

function zonesOfMineral(id) {
  const out = [];
  for (const [z, list] of Object.entries(ORE_SPAWN)) if (list.some(([item]) => item === id)) out.push(+z);
  if (id === 'obsidian_shard') out.push(4);
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
  const seenNew = new Set(JSON.parse(st.flag('indexSeen') || '[]'));
  const left = el('div', { class: 'page' });
  const right = el('div', { class: 'page' });
  const tabs = el('div', { class: 'gutter-tabs' });
  const book = el('div', { class: 'panel book' }, [left, right, tabs]);

  const iconFor = (c, id) => {
    if (c === 'critter') return creatureIconURL(id);
    if (c === 'weapon') {
      const e = st.data.index['weapon:' + id];
      const metal = e && e.metals ? Object.entries(e.metals).sort((a, b) => b[1] - a[1])[0][0] : 'iron';
      return weaponIconURL(id, metal);
    }
    if (c === 'mechanic') return specURL('ui:book', { k: 'book' });
    return iconURL(id);
  };
  const nameFor = (c, id) => {
    if (c === 'critter') return CREATURES[id].name;
    if (c === 'weapon') return WEAPON_TYPES[id].name;
    if (c === 'mechanic') return MECHANICS[id].name;
    return ITEMS[id]?.name || id;
  };

  const render = () => {
    const def = CATS.find((c) => c.id === cat);
    const list = def.list();
    const known = list.filter((id) => st.known(cat, id));
    tabs.innerHTML = '';
    for (const c of CATS) {
      const n = c.list().filter((id) => st.known(c.id, id)).length;
      tabs.append(el('button', { class: 'btab' + (c.id === cat ? ' on' : ''), style: { background: c.color }, onclick: () => { cat = c.id; sel = null; game.audio.play('page'); render(); } }, `${c.label} ${n}`));
    }
    left.innerHTML = '';
    const total = totalIndexEntries();
    const totalKnown = CATS.reduce((s, c) => s + c.list().filter((id) => st.known(c.id, id)).length, 0);
    left.append(
      el('div', { class: 'book-title' }, def.label),
      el('div', { class: 'progress-line' }, `${known.length} of ${list.length} recorded · whole book ${Math.round((totalKnown / total) * 100)}%`),
    );
    const grid = el('div', { class: 'entry-grid' });
    for (const id of list) {
      const k = st.known(cat, id);
      const isNew = k && !seenNew.has(cat + ':' + id);
      const cell = el('button', {
        class: 'entry' + (k ? ' known' : '') + (sel === id ? ' on' : '') + (isNew ? ' new' : ''),
        title: k ? nameFor(cat, id) : '???',
        'aria-label': k ? nameFor(cat, id) : 'Undiscovered',
        onclick: () => { sel = id; seenNew.add(cat + ':' + id); st.flag('indexSeen', JSON.stringify([...seenNew])); game.audio.play('ui_click'); render(); },
      }, [k ? el('img', { class: 'pix', src: iconFor(cat, id), alt: '' }) : el('span', { class: 'unk' }, '?')]);
      grid.append(cell);
    }
    left.append(el('div', { class: 'scroll', style: { flex: 1 } }, [grid]));
    renderRight();
  };

  const renderRight = () => {
    right.innerHTML = '';
    if (!sel) {
      right.append(
        el('div', { class: 'book-title' }, 'Field Notes'),
        el('p', { style: { lineHeight: 1.45, maxWidth: '42ch' } }, 'Everything here was learned the hard way: by digging, poking, burning, zapping and tasting. Pick an entry on the left to read your notes.'),
        el('p', { class: 'muted', style: { lineHeight: 1.45 } }, `Day ${st.data.day} · ${st.data.stats.blocks} blocks dug · ${st.data.stats.ores} finds · ${st.data.stats.weapons} weapons forged · ${st.data.stats.dishes} dishes cooked`),
      );
      return;
    }
    const k = st.known(cat, sel);
    if (!k) {
      right.append(el('div', { class: 'book-title' }, '???'), el('div', { class: 'book-big-icon' }, [el('span', { class: 'unk', style: { fontSize: '3em' } }, '?')]));
      let hint = 'Not discovered yet.';
      if (cat === 'mineral' || cat === 'gem') { const zs = zonesOfMineral(sel); if (zs.length) hint = `Rumored to be found in: ${zoneNames(zs)}.`; }
      if (cat === 'plant' && PLANT_ZONES[sel]) hint = `Said to grow in: ${zoneNames(PLANT_ZONES[sel])}.`;
      if (cat === 'critter') hint = `Spotted in: ${zoneNames(CREATURES[sel].zones)}.`;
      if (cat === 'weapon') hint = st.owns('bp_' + sel) ? 'You have the plans. Forge one!' : 'Plans for this are sold at Inkwell Plans.';
      if (cat === 'recipe') hint = 'Some combination of ingredients makes this. Experiment at the stove.';
      if (cat === 'mechanic') hint = 'You\'ll understand this one when it happens to you.';
      right.append(el('p', { class: 'muted', style: { lineHeight: 1.45 } }, hint));
      return;
    }
    const entry = st.data.index[cat + ':' + sel];
    right.append(el('div', { class: 'book-title' }, nameFor(cat, sel)));
    right.append(el('div', { class: 'row' }, [el('div', { class: 'book-big-icon' }, [el('img', { class: 'pix', src: iconFor(cat, sel), alt: '' })]), el('span', { class: 'stamp' }, `Day ${entry.day}`)]));
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
    for (const l of lines) right.append(el('p', { style: { margin: '0 0 calc(var(--px) * 2)', lineHeight: 1.45, maxWidth: '44ch' }, html: l }));
  };

  render();
  game.audio.play('page');
  const h = game.ui.openPanel({ body: book, className: 'book-wrap', onClose: () => st.flag('indexSeen', JSON.stringify([...seenNew])) });
  // the book panel brings its own frame
  h.el.style.padding = '0';
  h.el.style.background = 'transparent';
  h.el.style.boxShadow = 'none';
  h.el.style.border = '0';
  return h;
}
