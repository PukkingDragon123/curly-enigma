// The Miners' Board: the tavern's board, a wooden board under a hanging sign with paper notices
// pinned to it. Wave 16: gold no longer buys upgrades (it's for goods and the ticket): the board
// keeps the tool ladder (Tools: what you own, what Grubb sells, what's still deeper down) and the
// Milestones ledger; a wax seal on the left opens the skill tree, where the old upgrades are
// learned now. On the left: the purse and the mole's rig sheet (pick power, swing, bag, energy,
// lamp, blast, the tavern's takings).
// openUpgrades(game, tab?) → panel handle (ui.openUpgrades()).
import { el, formatGoldFull, pick } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { ZONES } from '../data/zones.js';
import { SHOPS } from '../data/shops.js';
import { UPGRADE_TABS, MILESTONES, milestoneValue, milestoneText } from '../data/upgrades.js';
import { tokenURL } from './skillArt.js';
import { explosiveIconURL } from '../deep/explosives/icon.js';
import { SPR } from './uiSprites.js';
import { put } from './common.js';
import { installPanelArt } from './panelArt.js'; // (wave 9: iron strap hinges on the board's frame)
import './upgrades.css';
import { dropCap, inkIn, margins, sealCss, vars, ensureTomeArt } from './tomeFx.js'; // (wave 9: the notices as vellum leaves, src/ui/tome.css)

const ZONE_NAMES = ZONES.map((z) => z?.name);
const iconFor = (id) => (ITEMS[id]?.blast ? explosiveIconURL(id) : iconURL(id));
const coinPrice = (n, cls = '') => el('span', { class: 'price ' + cls }, [el('img', { class: 'pix', src: cls.includes('big') ? SPR.coin() : SPR.coinMini(), alt: '' }), formatGoldFull(n)]);

const STAR_LINES = [
  'Don\'t buy a pick you can\'t lift.',
  'I paid for this tavern one nugget at a time. You\'ll get there.',
  'Dynamite\'s a tool. Ask my eyebrows.',
  'Clean your clumps. Vex can tell.',
  'Bigger bag, sorer back.',
  'Count your coins. I do, twice.',
];

// ---------------------------------------------------------------- the board
export function openUpgrades(game, startTab) {
  const st = game.state, ui = game.ui;
  installPanelArt();
  st.checkMilestones?.();
  const fresh = new Set((st.takeMilestones?.() || []).map((m) => m.id));
  let tab = UPGRADE_TABS.some((t) => t.id === startTab) ? startTab : fresh.size ? 'ms' : 'gear';
  let enter = true;
  let h = null;

  const tabsEl = el('div', { class: 'ug-tabs', role: 'tablist' });
  const grid = el('div', { class: 'ug-grid' });
  const scroll = el('div', { class: 'ug-scroll' }, [grid]);
  const purse = el('div', { class: 'ug-purse' });
  const sheet = el('div', { class: 'ug-sheet' });
  const note = el('div', { class: 'ug-star' }, [el('b', {}, 'Old Star'), el('span', {}, pick(STAR_LINES))]);
  // the skill tree's wax seal: where the old upgrades are learned now (skill points, not gold)
  const skillBtn = el('button', { class: 'ug-skillseal', title: 'Skill tree', 'aria-label': 'Skill tree', onclick: () => { game.audio.play('page'); h.close?.(); setTimeout(() => (ui.openBook ? ui.openBook('skills') : ui.openSkills?.()), 60); } }, [
    el('img', { class: 'pix', src: tokenURL(), alt: '' }), el('span', {}, 'Skills'),
  ]);
  const side = el('div', { class: 'ug-side' }, [purse, skillBtn, sheet, note]);
  const main = el('div', { class: 'ug-main' }, [tabsEl, scroll]);
  const room = el('div', { class: 'ug-room' }, [side, main]);
  const sign = el('div', { class: 'sh-sign ug-sign' }, [el('i', { class: 'sh-chain l' }), el('i', { class: 'sh-chain r' }), el('h2', {}, 'The Miners\' Board')]);
  const root = el('div', { class: 'ug tm-ug' }, [sign, room]);
  ensureTomeArt();

  // ---------------- left: purse + rig sheet
  const renderSide = () => {
    purse.innerHTML = '';
    put(purse,
      el('img', { class: 'pix ug-pouch', src: SPR.pouch(false), alt: '' }),
      el('div', {}, [el('b', {}, formatGoldFull(st.gold)), el('small', {}, 'gold in the pouch'), el('small', {}, `${Object.keys(st.data.skills?.nodes || {}).length} skills learned`)]));
    const mb = st.mineBonus();
    const pk = st.equipped('pick');
    const line = (label, val, extra) => el('div', { class: 'ug-line' }, [el('span', {}, label), el('b', { html: val }), extra ? el('small', { html: extra }) : null].filter(Boolean));
    const done = MILESTONES.filter((m) => st.milestone(m.id)).length;
    const swing = (pk?.rate || 0.36) * mb.rate;
    sheet.innerHTML = '';
    put(sheet,
      dropCap(el('h3', {}, 'Your rig'), 'red'),
      line('Pick', pk ? pk.name.replace(' Pickaxe', '') : 'None', pk ? `tier ${pk.tier || 1}` : ''),
      line('Power', ((pk?.power || 1) * mb.power).toFixed(1), mb.power > 1 ? `×${mb.power.toFixed(2)}` : ''),
      line('Swing', `${swing.toFixed(2)} s`, mb.rate < 1 ? `${Math.round((1 / mb.rate - 1) * 100)}% faster` : ''),
      line('Bag', `${st.bagCapacity()} finds`, ''),
      line('Energy', `${st.maxEnergy}`, ''),
      line('Lamp', `${st.lightRadius().toFixed(1)} m`, ''),
      line('Blast', `×${mb.blast.toFixed(2)}`, mb.sticky ? 'sticky fuse' : ''),
      line('Tavern', `${st.tavernIncome()} g/day`, ''),
      line('Milestones', `${done}/${MILESTONES.length}`, ''));
  };

  // ---------------- tabs
  const renderTabs = () => {
    tabsEl.innerHTML = '';
    for (const t of UPGRADE_TABS) {
      const n = t.id === 'ms' ? fresh.size : 0;
      const b = el('button', { class: 'ug-tab' + (tab === t.id ? ' on' : ''), role: 'tab', 'aria-selected': tab === t.id ? 'true' : 'false',
        onclick: () => { if (tab === t.id) return; tab = t.id; enter = true; game.audio.play('page', { vol: 0.6 }); render(); scroll.scrollTop = 0; } }, [t.name]);
      if (n) b.append(el('i', { class: 'ug-dot new', title: 'New' }, String(n)));
      tabsEl.append(b);
    }
  };

  // ---------------- milestones ledger
  const renderMilestones = () => {
    const ledger = el('div', { class: 'ug-ledger' });
    const rows = MILESTONES.map((m, i) => ({ m, i, day: st.milestone(m.id), v: milestoneValue(m, st) }));
    // just reached first, then the closest to done, then the ones already ticked off
    const rank = (r) => (fresh.has(r.m.id) ? 0 : r.day ? 2 : 1);
    rows.sort((a, b) => (rank(a) - rank(b)) || (a.day ? a.i - b.i : (b.v / b.m.at) - (a.v / a.m.at)));
    for (const { m, day, v } of rows) {
      const rew = [];
      if (m.reward?.gold) rew.push(coinPrice(m.reward.gold));
      for (const [id, n] of Object.entries(m.reward?.items || {})) rew.push(el('span', { class: 'ug-need', title: ITEMS[id]?.name }, [el('img', { class: 'pix', src: iconFor(id), alt: '' }), `×${n}`]));
      const frac = Math.max(0, Math.min(1, v / m.at));
      const fmtV = (x) => (m.stat === 'deepest' ? `${Math.floor(x)} m` : formatGoldFull(Math.floor(x)));
      ledger.append(el('div', { class: 'ug-ms' + (day ? ' done' : '') + (fresh.has(m.id) ? ' fresh' : '') }, [
        el('img', { class: 'pix ug-seal', src: day ? SPR.seal('green', 'check') : SPR.seal('amber', 'ring'), alt: day ? 'Done' : '' }),
        el('div', { class: 'ug-ms-txt' }, [
          el('b', {}, m.name),
          el('span', {}, m.desc),
          day ? el('small', {}, `Reached on day ${day}`) : el('div', { class: 'ug-bar', title: `${fmtV(v)} / ${fmtV(m.at)}` }, [el('i', { style: { width: (frac * 100).toFixed(1) + '%' } }), el('em', {}, `${fmtV(Math.min(v, m.at))} / ${fmtV(m.at)}`)]),
        ]),
        el('div', { class: 'ug-rew' }, rew),
      ]));
    }
    grid.append(ledger);
  };

  // ---------------- the tool ladder
  const renderGear = () => {
    const stock = SHOPS.tools.stock.concat(SHOPS.outfitter.stock);
    const minZone = (id) => stock.find((s) => s.id === id)?.minZone || 1;
    const zoneMax = st.data.zoneMax || 1;
    const mb = st.mineBonus();
    const ladder = (title, ids, stat) => {
      const row = el('div', { class: 'ug-ladder' });
      ids.forEach((id, i) => {
        const it = ITEMS[id];
        const owned = st.owns(id), using = it.slot && st.data.equip[it.slot] === id;
        const inShop = stock.some((s) => s.id === id), z = minZone(id);
        const status = it.cat === 'consumable' ? `have ${st.count(id)}` : using ? 'In paw' : owned ? 'Owned' : !inShop ? '' : z > zoneMax ? `${ZONE_NAMES[z] || 'Deeper'}` : formatGoldFull(it.price || 0);
        const t = el('div', { class: 'ug-rung' + (using ? ' using' : owned ? ' owned' : '') + (!owned && inShop && z > zoneMax ? ' far' : ''), title: `${it.name}: ${it.desc || ''}` }, [
          el('img', { class: 'pix', src: iconFor(id), alt: '' }),
          el('b', {}, it.name.replace(/ (Pickaxe|Drill|Lamp)$/, '')),
          stat ? el('span', { class: 'ug-stat', html: stat(it) }) : null,
          el('small', { class: !owned && inShop && z <= zoneMax && it.cat !== 'consumable' ? 'buyable' : '' }, [!owned && inShop && z <= zoneMax && it.cat !== 'consumable' ? el('img', { class: 'pix', src: SPR.coinMini(), alt: '' }) : null, status].filter(Boolean)),
        ].filter(Boolean));
        if (i) row.append(el('i', { class: 'ug-arrow' }, '▸'));
        row.append(t);
      });
      return el('div', { class: 'ug-lad' }, [el('h4', {}, title), row]);
    };
    const bySlot = (slot) => Object.values(ITEMS).filter((it) => it.slot === slot && it.cat === 'tool').sort((a, b) => (a.price || 0) - (b.price || 0)).map((it) => it.id);
    const maxP = Math.max(...bySlot('pick').map((id) => ITEMS[id].power || 1));
    const bar = (v, max) => `<i class="ug-mini"><i style="width:${Math.round(Math.min(1, v / max) * 100)}%"></i></i>`;
    grid.append(
      el('p', { class: 'ug-hint' }, 'Grubb sells the next rung once you\'ve dug deep enough. Deep rock wants a better pick.'),
      ladder('Pickaxes', bySlot('pick'), (it) => `${bar(it.power, maxP)}${(it.power * mb.power).toFixed(1)}`),
      ladder('Chisels & brushes', bySlot('chisel').concat(bySlot('brush')), null),
      ladder('Drills & lamps', bySlot('drill').concat(bySlot('xray')), null),
      ladder('Explosives', Object.values(ITEMS).filter((it) => it.blast).sort((a, b) => a.blast - b.blast).map((it) => it.id), (it) => `${(it.blast * mb.blast).toFixed(1)} m`),
    );
  };

  const render = () => {
    renderSide();
    renderTabs();
    margins(sheet, 'rig' + tab, { doodle: false });
    grid.innerHTML = '';
    root.dataset.tab = tab;
    grid.classList.toggle('enter', enter);
    if (tab === 'ms') renderMilestones();
    else renderGear();
  };

  render();
  const fit = () => root.classList.toggle('narrow', window.innerWidth < 760 || window.innerHeight < 470);
  fit();
  window.addEventListener('resize', fit);
  ui.status?.pin?.(true);
  for (const id of fresh) { const m = MILESTONES.find((x) => x.id === id); if (m) { ui.toast(`<b>${m.name}</b>`, { kind: 'good' }); ui.status?.flyReward?.(m.reward, 300); } }
  h = ui.openPanel({ body: root, className: 'sh-panel ug-panel', onClose: () => { window.removeEventListener('resize', fit); ui.status?.pin?.(false); } });
  h.debug = { render, tab: (t) => { tab = t; enter = true; render(); } };
  return h;
}
