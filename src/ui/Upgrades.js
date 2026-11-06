// The Miners' Board: the tavern's upgrade board, a wooden board under a hanging sign with paper
// cards pinned to it. Each card is one upgrade (data/upgrades.js): its icon, level pips, what it
// does now and next, and the price (gold, sometimes ingots or gems) with a button to buy the
// next level. Tabs: Digging, Hauling, Blasting, Tavern, Tools (the tool ladder: what you own,
// what Grubb sells, what's still deeper down) and Milestones (a ledger). On the left: the purse
// and the mole's rig sheet (pick power, swing, bag, energy, lamp, blast, the tavern's takings).
// openUpgrades(game, tab?) → panel handle (ui.openUpgrades()).
import { el, formatGoldFull, pick } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { ZONES } from '../data/zones.js';
import { SHOPS } from '../data/shops.js';
import { UPGRADES, UPGRADE_TABS, MILESTONES, milestoneValue, milestoneText, upgradeEffect, upgradeLock } from '../data/upgrades.js';
import { explosiveIconURL } from '../deep/explosives/icon.js';
import { SPR } from './uiSprites.js';
import { Px, art } from './uiArt.js';
import { put } from './common.js';
import './upgrades.css';

const ZONE_NAMES = ZONES.map((z) => z?.name);
const iconFor = (id) => (ITEMS[id]?.blast ? explosiveIconURL(id) : iconURL(id));
const coinPrice = (n, cls = '') => el('span', { class: 'price ' + cls }, [el('img', { class: 'pix', src: cls.includes('big') ? SPR.coin() : SPR.coinMini(), alt: '' }), formatGoldFull(n)]);

const STAR_LINES = [
  'Strong paws dig deep. Clever paws dig deeper.',
  'I paid for this tavern one nugget at a time. You\'ll get there.',
  'Dynamite is a tool, not a toy. Mostly.',
  'Clean your clumps, little one. Vex can tell.',
  'A bigger bag is a lighter heart.',
  'Every swing counts. Every coin too.',
];

// ---------------------------------------------------------------- badge glyphs (round seals)
const BADGE = {
  up: { c: [0x8ac85a, 0x5a9a3a, 0x2a4a1a], t: ['..x..', '.xxx.', 'xxxxx', '.xxx.', '.xxx.'] },
  plus: { c: [0x8ac85a, 0x4f8a34, 0x22421a], t: ['..x..', '..x..', 'xxxxx', '..x..', '..x..'] },
  fast: { c: [0xffd27a, 0xd9901e, 0x5e3608], t: ['x.x..', '.x.x.', '..x.x', '.x.x.', 'x.x..'] },
  eye: { c: [0x9fd0ff, 0x3f7ec8, 0x18305a], t: ['.....', '.xxx.', 'xx.xx', '.xxx.', '.....'] },
  shield: { c: [0xb8c8d8, 0x5a7090, 0x1e2a3a], t: ['xxxxx', 'xx.xx', 'xx.xx', '.x.x.', '..x..'] },
  coin: { c: [0xffe08a, 0xd9a020, 0x5e3a08], t: ['.xxx.', 'x...x', 'x.x.x', 'x...x', '.xxx.'] },
  clock: { c: [0xe0c8ff, 0x8256b8, 0x30184a], t: ['.xxx.', 'x.x.x', 'x.xxx', 'x...x', '.xxx.'] },
  star: { c: [0xffe8a0, 0xe0a020, 0x5e3608], t: ['..x..', '..x..', 'xxxxx', '.x.x.', 'x...x'] },
  lock: { c: [0xc8c0b0, 0x6e675f, 0x1c1a18], t: ['.xxx.', '.x.x.', 'xxxxx', 'xx.xx', 'xxxxx'] },
};
function badgeURL(kind) {
  return art('ugbadge:' + kind, () => {
    const b = BADGE[kind] || BADGE.star;
    const p = new Px(11, 11);
    p.disk(5, 5, 5, b.c[1]);
    p.set(3, 2, b.c[0]); p.set(2, 3, b.c[0]); p.set(4, 2, b.c[0]); p.set(2, 4, b.c[0]);
    p.tpl(b.t.map((r) => r.replace(/x/g, 'a')), { a: kind === 'lock' ? 0xf6e8c8 : 0xfff8e8 }, 3, 3);
    p.outline(b.c[2]);
    return p;
  });
}

// ---------------------------------------------------------------- the board
export function openUpgrades(game, startTab) {
  const st = game.state, ui = game.ui;
  st.checkMilestones?.();
  const fresh = new Set((st.takeMilestones?.() || []).map((m) => m.id));
  let tab = UPGRADE_TABS.some((t) => t.id === startTab) ? startTab : fresh.size ? 'ms' : 'dig';
  let enter = true;

  const tabsEl = el('div', { class: 'ug-tabs', role: 'tablist' });
  const grid = el('div', { class: 'ug-grid' });
  const scroll = el('div', { class: 'ug-scroll' }, [grid]);
  const purse = el('div', { class: 'ug-purse' });
  const sheet = el('div', { class: 'ug-sheet' });
  const note = el('div', { class: 'ug-star' }, [el('b', {}, 'Old Star'), el('span', {}, pick(STAR_LINES))]);
  const side = el('div', { class: 'ug-side' }, [purse, sheet, note]);
  const main = el('div', { class: 'ug-main' }, [tabsEl, scroll]);
  const room = el('div', { class: 'ug-room' }, [side, main]);
  const sign = el('div', { class: 'sh-sign ug-sign' }, [el('i', { class: 'sh-chain l' }), el('i', { class: 'sh-chain r' }), el('h2', {}, 'The Miners\' Board')]);
  const root = el('div', { class: 'ug' }, [sign, room]);

  // ---------------- left: purse + rig sheet
  const renderSide = () => {
    purse.innerHTML = '';
    put(purse,
      el('img', { class: 'pix ug-pouch', src: SPR.pouch(false), alt: '' }),
      el('div', {}, [el('b', {}, formatGoldFull(st.gold)), el('small', {}, 'gold in the pouch'), el('small', {}, `${st.upgradeLevels()} upgrades bought`)]));
    const mb = st.mineBonus();
    const pk = st.equipped('pick');
    const line = (label, val, extra) => el('div', { class: 'ug-line' }, [el('span', {}, label), el('b', { html: val }), extra ? el('small', { html: extra }) : null].filter(Boolean));
    const done = MILESTONES.filter((m) => st.milestone(m.id)).length;
    const swing = (pk?.rate || 0.36) * mb.rate;
    sheet.innerHTML = '';
    put(sheet,
      el('h3', {}, 'Your rig'),
      line('Pick', pk ? pk.name.replace(' Pickaxe', '') : 'None', pk ? `tier ${pk.tier || 1}` : ''),
      line('Power', ((pk?.power || 1) * mb.power).toFixed(1), mb.power > 1 ? `×${mb.power.toFixed(2)}` : ''),
      line('Swing', `${swing.toFixed(2)} s`, mb.rate < 1 ? `${Math.round((1 / mb.rate - 1) * 100)}% faster` : ''),
      line('Bag', `${st.bagCapacity()} finds`, st.upEffect('bag') ? `+${st.upEffect('bag')} pockets` : ''),
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
      const n = t.id === 'ms' ? fresh.size : Object.keys(UPGRADES).filter((id) => UPGRADES[id].tab === t.id && st.canUpgrade(id, ZONE_NAMES).ok).length;
      const b = el('button', { class: 'ug-tab' + (tab === t.id ? ' on' : ''), role: 'tab', 'aria-selected': tab === t.id ? 'true' : 'false',
        onclick: () => { if (tab === t.id) return; tab = t.id; enter = true; game.audio.play('page', { vol: 0.6 }); render(); scroll.scrollTop = 0; } }, [t.name]);
      if (n && t.id !== 'gear') b.append(el('i', { class: 'ug-dot' + (t.id === 'ms' ? ' new' : ''), title: t.id === 'ms' ? 'New' : `${n} you can afford` }, String(n)));
      tabsEl.append(b);
    }
  };

  // ---------------- an upgrade card
  const card = (id) => {
    const u = UPGRADES[id];
    const lvl = st.upgrade(id);
    const maxed = lvl >= u.max;
    const chk = st.canUpgrade(id, ZONE_NAMES);
    const lock = chk.lock || upgradeLock(id, st, ZONE_NAMES);
    const c = el('div', { class: 'ug-card' + (maxed ? ' maxed' : '') + (lock ? ' locked' : '') + (chk.ok ? ' can' : ''), 'data-id': id });
    c.style.setProperty('--rot', ((((id.charCodeAt(0) * 7 + id.length * 13) % 9) - 4) * 0.25) + 'deg');
    const ic = el('div', { class: 'ug-ic' }, [
      el('img', { class: 'pix', src: iconFor(u.icon), alt: '' }),
      el('img', { class: 'pix ug-badge', src: badgeURL(lock ? 'lock' : u.badge), alt: '' }),
    ]);
    const pips = el('div', { class: 'ug-pips', title: `Level ${lvl} of ${u.max}` });
    for (let i = 0; i < u.max; i++) pips.append(el('i', { class: i < lvl ? 'on' : '' }));
    const head = el('div', { class: 'ug-hd' }, [
      el('b', {}, u.name),
      el('small', {}, maxed ? 'Max level' : lock ? 'Locked' : `Level ${lvl} / ${u.max}`),
      pips,
    ]);
    const now = u.fmt(upgradeEffect(id, lvl)), next = maxed ? null : u.fmt(upgradeEffect(id, lvl + 1));
    const eff = el('div', { class: 'ug-eff' }, maxed
      ? [el('span', { class: 'ug-max' }, now)]
      : [lvl ? el('span', { class: 'ug-now' }, now) : el('span', { class: 'ug-desc' }, u.desc), el('span', { class: 'ug-next' }, [el('i', {}, '▸ '), next])]);
    const foot = el('div', { class: 'ug-foot' });
    if (lock) foot.append(el('span', { class: 'ug-lock' }, lock));
    else if (maxed) foot.append(el('span', { class: 'ug-stamp' }, 'Maxed'));
    else {
      const cost = chk.cost || st.upgradeCost(id);
      const costs = el('div', { class: 'ug-cost' }, [coinPrice(cost.gold, st.canAfford(cost.gold) ? '' : 'short')]);
      for (const [nid, n] of Object.entries(cost.items || {})) {
        const have = st.count(nid);
        costs.append(el('span', { class: 'ug-need' + (have >= n ? '' : ' short'), title: `${n}× ${ITEMS[nid]?.name || nid} (you have ${have})` }, [
          el('img', { class: 'pix', src: iconFor(nid), alt: '' }), `${Math.min(have, n)}/${n}`,
        ]));
      }
      const btn = el('button', { class: 'btn ug-buy', disabled: !chk.ok, title: chk.ok ? `Buy level ${lvl + 1}` : chk.reason, onclick: () => buy(id) }, lvl ? 'Upgrade' : 'Buy');
      foot.append(costs, btn);
    }
    put(c, ic, head, eff, foot);
    if (!maxed && !lock && lvl) c.title = u.desc;
    return c;
  };

  const buy = (id) => {
    const r = st.buyUpgrade(id);
    if (!r.ok) {
      game.audio.play('ui_error');
      grid.querySelector(`.ug-card[data-id="${id}"] .ug-buy`)?.classList.add('nope');
      return;
    }
    const u = UPGRADES[id];
    game.audio.play('ui_buy');
    game.audio.play('coins', { n: 3 });
    game.audio.play(r.level >= u.max ? 'fanfare' : 'levelup');
    for (const m of st.takeMilestones?.() || []) { fresh.add(m.id); ui.toast(milestoneText(m), { kind: 'good' }); }
    const top = scroll.scrollTop;
    enter = false;
    render();
    scroll.scrollTop = top;
    const c = grid.querySelector(`.ug-card[data-id="${id}"]`);
    if (!c) return;
    c.classList.add('pop');
    const pip = c.querySelectorAll('.ug-pips i.on')[r.level - 1];
    pip?.classList.add('new');
    c.append(el('div', { class: 'ug-float' }, r.level >= u.max ? 'MAX!' : `Lv ${r.level}!`));
    for (let i = 0; i < 5; i++) {
      const coin = el('i', { class: 'sh-coin ug-coin' });
      coin.style.left = (40 + Math.random() * 50) + '%';
      coin.style.top = '30%';
      coin.style.animationDelay = `${i * 60}ms, ${i * 60}ms`;
      c.append(coin);
      setTimeout(() => coin.remove(), 900 + i * 60);
    }
    if (r.level >= u.max) note.lastChild.textContent = pick(['Now that is a fine bit of work.', 'Maxed out! I never got that far myself.', 'Ha! Nothing left to teach you there.']);
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
      el('p', { class: 'ug-hint' }, 'Grubb\'s in Deep Town sells the next rung once you\'ve dug deep enough. Hard rock in the deep zones needs a better pick.'),
      ladder('Pickaxes', bySlot('pick'), (it) => `${bar(it.power, maxP)}${(it.power * mb.power).toFixed(1)}`),
      ladder('Chisels & brushes', bySlot('chisel').concat(bySlot('brush')), null),
      ladder('Drills & lamps', bySlot('drill').concat(bySlot('xray')), null),
      ladder('Explosives', Object.values(ITEMS).filter((it) => it.blast).sort((a, b) => a.blast - b.blast).map((it) => it.id), (it) => `${(it.blast * mb.blast).toFixed(1)} m`),
    );
  };

  const render = () => {
    renderSide();
    renderTabs();
    grid.innerHTML = '';
    root.dataset.tab = tab;
    grid.classList.toggle('enter', enter);
    if (tab === 'ms') renderMilestones();
    else if (tab === 'gear') renderGear();
    else {
      const ids = Object.keys(UPGRADES).filter((id) => UPGRADES[id].tab === tab);
      const cards = ids.map(card);
      cards.forEach((c, i) => c.style.setProperty('--d', i * 40 + 'ms'));
      grid.append(...cards);
    }
  };

  render();
  const fit = () => root.classList.toggle('narrow', window.innerWidth < 760 || window.innerHeight < 470);
  fit();
  window.addEventListener('resize', fit);
  ui.status?.pin?.(true);
  for (const id of fresh) { const m = MILESTONES.find((x) => x.id === id); if (m) ui.toast(milestoneText(m), { kind: 'good' }); }
  const h = ui.openPanel({ body: root, className: 'sh-panel ug-panel', onClose: () => { window.removeEventListener('resize', fit); ui.status?.pin?.(false); } });
  h.debug = { buy, render, tab: (t) => { tab = t; enter = true; render(); } };
  return h;
}
