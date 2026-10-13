// The backpack: the inventory as a big, open leather rucksack.
//  - main compartment (canvas lining) = item pockets, filtered by sewn-on labels
//  - tool loops + gear hooks on the side = equipment (click → tag with Equip)
//  - front pockets = coin pouch, savings jar toward the Surface Ticket, calendar, snack pouch
//  - clicking anything hangs a paper tag on it: name, quality, notes, value and actions
import { el, formatGoldFull, formatGold, clamp } from '../core/util.js';
import { iconURL, weaponIconURL } from '../gfx/PixelArt.js';
import { ITEMS, sellPrice, CAT_LABEL } from '../data/items.js';
import { BUFFS } from '../data/recipes.js';
import { GOAL_GOLD } from '../core/State.js';
import { gradeFor } from '../data/weapons.js';
import { SPR } from './uiSprites.js';
import { qColor, pips, stagger, onSwipe, put } from './common.js';

const TABS = [
  ['all', 'All'], ['ore', 'Ores'], ['ingot', 'Ingots'], ['nature', 'Nature'], ['food', 'Food'],
  ['weapon', 'Weapons'], ['supply', 'Supplies'], ['home', 'Home'],
];
const TOOL_SLOTS = [['pick', 'Pickaxe', 'pick_rusty'], ['chisel', 'Chisel', 'chisel_basic'], ['brush', 'Brush', 'brush_basic'], ['drill', 'Drill', 'drill_steam'], ['xray', 'X-Ray Lamp', 'xray_lamp']];
const GEAR_SLOTS = [['helmet', 'Helmet', 'helmet_basic'], ['gloves', 'Gloves', 'rubber_gloves'], ['suit', 'Suit', 'heat_suit'], ['boots', 'Boots', 'grip_boots'], ['bag', 'Bag', 'bag_small']];

function matcher(tab) {
  return (it) => {
    if (!it) return false;
    switch (tab) {
      case 'all': return true;
      case 'ore': return it.cat === 'mineral' || it.cat === 'gem';
      case 'ingot': return it.cat === 'ingot';
      case 'nature': return ['plant', 'critter', 'drop', 'ingredient'].includes(it.cat);
      case 'food': return it.cat === 'food';
      case 'supply': return ['consumable', 'blueprint', 'key'].includes(it.cat);
      case 'home': return ['furniture', 'floor', 'wallpaper'].includes(it.cat);
      default: return false;
    }
  };
}
const edible = (it) => it && (it.cat === 'food' || it.food);

export function openBackpack(game) {
  const st = game.state;
  const ui = game.ui;
  let tab = 'all';
  let selKey = null; // 'item:<id>' | 'weapon:<uid>' | 'slot:<slot>'
  let firstRender = true;

  // ---------------- structure
  const tabsEl = el('div', { class: 'bp-tabs', role: 'tablist' });
  const grid = el('div', { class: 'bp-grid' });
  const scroll = el('div', { class: 'bp-scroll' }, [grid]);
  const tag = el('div', { class: 'bp-tag', hidden: true });
  const twine = el('i', { class: 'bp-twine', hidden: true });
  const main = el('section', { class: 'bp-main' }, [tabsEl, scroll, twine, tag]);
  const equip = el('aside', { class: 'bp-equip' });
  const front = el('aside', { class: 'bp-front' });
  const body = el('div', { class: 'bp-body' }, [equip, main, front]);
  const flap = el('div', { class: 'bp-flap' }, [
    el('i', { class: 'bp-strap l' }), el('i', { class: 'bp-strap r' }),
    el('div', { class: 'bp-patch' }, [el('span', {}, 'Backpack')]),
  ]);
  const root = el('div', { class: 'bp' }, [flap, body]);

  // ---------------- tabs
  const renderTabs = () => {
    tabsEl.innerHTML = '';
    for (const [k, label] of TABS) {
      tabsEl.append(el('button', {
        class: 'bp-label' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': tab === k ? 'true' : 'false',
        onclick: () => { if (tab === k) return; tab = k; closeTag(); game.audio.play('ui_click'); render(true); scroll.scrollTop = 0; },
      }, label));
    }
  };

  // ---------------- main compartment
  const entriesFor = (t) => {
    const out = [];
    if (t === 'weapon' || t === 'all') for (const w of st.data.weapons) out.push({ weapon: w });
    if (t !== 'weapon') {
      for (const g of st.inventory(matcher(t))) out.push(g);
      if (t === 'supply' || t === 'all') for (const id of Object.keys(st.data.owned)) {
        const it = ITEMS[id];
        if (it && ['blueprint', 'key'].includes(it.cat)) out.push({ id, n: 1, owned: true });
      }
    }
    return out;
  };

  const pocket = (key, icon, extras = [], cls = '', title = '') => {
    const b = el('button', { class: 'bp-pocket ' + cls + (selKey === key ? ' on' : ''), title, 'aria-label': title, 'data-key': key }, [
      el('img', { class: 'pix', src: icon, alt: '' }), ...extras,
    ]);
    return b;
  };

  const renderGrid = (animate) => {
    grid.innerHTML = '';
    grid.classList.toggle('bp-settle', !!animate);
    const entries = entriesFor(tab);
    if (!entries.length) {
      grid.append(el('p', { class: 'bp-empty' }, tab === 'all' ? 'Your pack is empty. Go dig something up!' : 'Nothing in this pocket yet.'));
    }
    const nodes = [];
    for (const e of entries) {
      if (e.weapon) {
        const w = e.weapon;
        const g = gradeFor(w.score);
        const n = pocket('weapon:' + w.uid, weaponIconURL(w.type, w.metal, w.infusion), [
          el('span', { class: 'grade', style: { color: g.color } }, w.grade),
        ], 'cloth', w.name);
        n.onclick = () => select('weapon:' + w.uid, n, () => showWeapon(w));
        nodes.push(n);
        continue;
      }
      const it = ITEMS[e.id];
      if (!it) continue;
      const extras = [];
      if (e.avgQ !== undefined) extras.push(pips(e.avgQ, e.lots && e.lots.some((l) => l.p)));
      if (e.n > 1 || (!e.owned && e.n)) extras.push(el('span', { class: 'n' }, String(e.n)));
      const n = pocket('item:' + e.id, iconURL(e.id), extras, '', it.name);
      n.onclick = () => select('item:' + e.id, n, () => showItem(e.id));
      nodes.push(n);
    }
    grid.append(...nodes);
    if (animate) stagger(nodes, firstRender ? 18 : 10);
  };

  // ---------------- equipment (tool loops + gear hooks)
  const renderEquip = () => {
    equip.innerHTML = '';
    const col = (title, slots, cls) => {
      const c = el('div', { class: 'bp-col ' + cls }, [el('div', { class: 'bp-coltitle' }, title)]);
      for (const [slot, label, sample] of slots) {
        const cur = st.equipped(slot);
        const owned = Object.keys(st.data.owned).filter((id) => ITEMS[id]?.slot === slot);
        const key = 'slot:' + slot;
        const extras = [];
        if (owned.length > 1) extras.push(el('span', { class: 'n' }, '+' + (owned.length - 1)));
        const b = el('button', { class: 'bp-loop' + (cur ? '' : ' empty') + (selKey === key ? ' on' : ''), title: cur ? `${label}: ${cur.name}` : `${label}: empty`, 'aria-label': cur ? `${label}: ${cur.name}` : `${label}: empty`, 'data-key': key }, [
          el('img', { class: 'pix', src: iconURL(cur ? cur.id : sample), alt: '' }), ...extras,
        ]);
        b.onclick = () => select(key, b, () => showSlot(slot, label, sample));
        c.append(b);
      }
      return c;
    };
    equip.append(col('Tools', TOOL_SLOTS, 'tools'), col('Gear', GEAR_SLOTS, 'gear'));
  };

  // ---------------- front pockets
  const renderFront = () => {
    front.innerHTML = '';
    const g = st.gold;
    const p = clamp(g / GOAL_GOLD, 0, 1);
    const notes = Object.keys(st.data.index).length;
    front.append(
      el('button', { class: 'bp-book', title: 'Index Book (B)', onclick: () => { game.audio.play('page'); ui.openIndex(); } }, [
        el('img', { class: 'pix', src: SPR.bookPeek(), alt: '' }),
        el('div', {}, [el('b', {}, 'Index Book'), el('small', {}, notes === 1 ? '1 note' : `${notes} notes`)]),
      ]),
      el('div', { class: 'bp-coin' }, [
        el('img', { class: 'pix', src: SPR.pouch(g > 0), alt: '' }),
        el('div', {}, [el('b', {}, formatGoldFull(g)), el('small', {}, 'gold in the pouch')]),
      ]),
      el('div', { class: 'bp-jar', title: 'Savings toward the Surface Ticket' }, [
        el('img', { class: 'pix', src: SPR.jar(p), alt: '' }),
        el('div', { class: 'bp-jar-txt' }, [
          el('small', {}, 'Surface Ticket'),
          el('div', { class: 'bp-goal' }, [el('i', { style: { width: (p * 100).toFixed(2) + '%' } }), el('img', { class: 'pix', src: iconURL('exit_ticket'), alt: '' })]),
          el('span', {}, `${formatGold(g)} / 1M · ${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`),
        ]),
      ]),
      el('div', { class: 'bp-day' }, [
        el('div', { class: 'bp-cal' }, [el('img', { class: 'pix', src: SPR.calendar(false), alt: '' }), el('b', {}, String(st.data.day))]),
        el('div', {}, [el('small', {}, 'Bag holds'), el('span', {}, `${st.bagCapacity()} finds a trip`)]),
      ]),
    );
    // snack pouch: quick access to food
    const foods = st.inventory(edible).sort((a, b) => (ITEMS[b.id].energy ?? ITEMS[b.id].food ?? 0) - (ITEMS[a.id].energy ?? ITEMS[a.id].food ?? 0)).slice(0, 4);
    const snack = el('div', { class: 'bp-snacks' }, [el('div', { class: 'bp-coltitle' }, 'Snacks')]);
    const row = el('div', { class: 'bp-snack-row' });
    for (const f of foods) {
      const it = ITEMS[f.id];
      const key = 'item:' + f.id;
      const b = el('button', { class: 'bp-snack' + (selKey === key ? ' on' : ''), title: `${it.name} (+${it.energy ?? it.food})`, 'data-key': key }, [
        el('img', { class: 'pix', src: iconURL(f.id), alt: '' }), el('span', { class: 'n' }, String(f.n)),
      ]);
      b.onclick = () => select(key, b, () => showItem(f.id));
      row.append(b);
    }
    if (!foods.length) row.append(el('span', { class: 'bp-none' }, 'No food packed.'));
    snack.append(row);
    front.append(snack);
  };

  // ---------------- selection + paper tag
  let anchor = null;
  const select = (key, node, show) => {
    if (selKey === key && !tag.hidden) { closeTag(); return; }
    selKey = key;
    for (const n of root.querySelectorAll('.on[data-key]')) n.classList.remove('on');
    node.classList.add('on');
    anchor = node;
    game.audio.play('ui_click');
    show();
    placeTag();
  };
  const closeTag = () => {
    selKey = null;
    anchor = null;
    tag.hidden = true;
    twine.hidden = true;
    for (const n of root.querySelectorAll('.on[data-key]')) n.classList.remove('on');
  };

  const placeTag = () => {
    tag.hidden = false;
    tag.classList.remove('swing');
    void tag.offsetWidth;
    tag.classList.add('swing');
    requestAnimationFrame(() => {
      if (!anchor || tag.hidden) return;
      const narrow = root.classList.contains('narrow');
      const mr = main.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
      const tw = tag.offsetWidth, th = tag.offsetHeight;
      if (narrow) { tag.style.left = ''; tag.style.top = ''; twine.hidden = true; return; }
      // hang the tag beside the pocket (right, left, below, above), inside the compartment
      const W = mr.width, H = mr.height, gap = 10;
      const ax0 = ar.left - mr.left, ax1 = ar.right - mr.left, ay0 = ar.top - mr.top, ay1 = ar.bottom - mr.top;
      const fitsX = (x) => x >= 4 && x + tw <= W - 4;
      const fitsY = (y) => y >= 4 && y + th <= H - 4;
      let x, y;
      const yBeside = clamp(ay0 - 6, 4, Math.max(4, H - th - 4));
      const xCentered = clamp((ax0 + ax1) / 2 - tw / 2, 4, Math.max(4, W - tw - 4));
      if (ax1 <= 0 || ax0 >= W) { x = ax1 <= 0 ? 4 : Math.max(4, W - tw - 4); y = yBeside; }
      else if (fitsX(ax1 + gap)) { x = ax1 + gap; y = yBeside; }
      else if (fitsX(ax0 - gap - tw)) { x = ax0 - gap - tw; y = yBeside; }
      else if (fitsY(ay1 + gap)) { x = xCentered; y = ay1 + gap; }
      else if (fitsY(ay0 - gap - th)) { x = xCentered; y = ay0 - gap - th; }
      else { x = ax1 + gap + tw <= W ? ax1 + gap : Math.max(4, W - tw - 4); y = yBeside; }
      tag.style.left = Math.round(x) + 'px';
      tag.style.top = Math.round(y) + 'px';
      const flip = x + tw <= ax0 + 2;
      tag.classList.toggle('flip', flip);
      // twine from the pocket to the tag's eyelet
      const ax = clamp(x > ax1 ? ax1 - 4 : x + tw < ax0 ? ax0 + 4 : (ax0 + ax1) / 2, 0, W);
      const ay = y > ay1 ? ay1 - 6 : y + th < ay0 ? ay0 + 6 : ay0 + (ay1 - ay0) * 0.3;
      const u = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
      const hx = flip ? x + tw - u * 5.5 : x + u * 5.5, hy = y + u * 5.5;
      const dx = hx - ax, dy = hy - ay, len = Math.hypot(dx, dy);
      twine.hidden = len < 8;
      twine.style.left = ax + 'px';
      twine.style.top = ay + 'px';
      twine.style.width = Math.round(len) + 'px';
      twine.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    });
  };

  const tagHead = (icon, name, kind, extra) => el('div', { class: 'bp-tag-head' }, [
    el('div', { class: 'bp-tag-icon' }, [el('img', { class: 'pix', src: icon, alt: '' })]),
    el('div', {}, [el('small', {}, kind), el('b', {}, name), extra || null]),
  ]);
  const tagClose = () => el('button', { class: 'bp-tag-x', 'aria-label': 'Put it back', title: 'Put it back', onclick: () => { game.audio.play('ui_click'); closeTag(); } });
  const facts = (lines) => (lines.length ? el('ul', { class: 'bp-facts' }, lines.map((l) => el('li', { html: l }))) : null);

  const showItem = (id) => {
    const it = ITEMS[id];
    const e = st.inventory((x) => x === it)[0] || { id, n: st.count(id), owned: true };
    tag.innerHTML = '';
    const info = [];
    if (e.avgQ !== undefined) info.push(`Quality <b style="color:${qColor(e.avgQ)}">${e.avgQ}%</b>${e.lots.some((l) => l.p) ? ` · ${e.lots.filter((l) => l.p).length} pristine` : ''}`);
    if (it.value && it.cat !== 'tool' && it.cat !== 'equip') info.push(`Worth about <span class="gold-txt">${formatGoldFull(sellPrice(e.id, e.avgQ ?? 100))}g</span> each`);
    if (it.energy || it.food) info.push(`Restores <b>${it.energy ?? it.food}</b> energy` + (it.buff ? ` · ${BUFFS[it.buff]?.name}` : '') + (it.maxEnergy ? ` · +${it.maxEnergy} max energy` : ''));
    if (it.cap) info.push(`Holds ${it.cap} finds per trip`);
    if (it.tier) info.push(`Pick tier ${it.tier} · power ${it.power}`);
    if (it.light) info.push(`Lamp radius ${it.light}`);
    if (e.n > 1) info.push(`You carry <b>${e.n}</b>`);
    const actions = el('div', { class: 'bp-actions' });
    if (it.cat === 'food' || (it.food && game.scene?.allowEatRaw !== false)) {
      actions.append(el('button', { class: 'btn', onclick: () => {
        game.eat(id);
        render();
        if (st.count(id) > 0) { reanchor(); showItem(id); } else closeTag();
      } }, it.cat === 'food' ? 'Eat' : 'Eat raw'));
    }
    if (it.slot && st.owns(id) && st.data.equip[it.slot] !== id) {
      actions.append(el('button', { class: 'btn', onclick: () => { st.equip(id); game.audio.play('ui_click'); render(); reanchor(); showItem(id); } }, 'Equip'));
    }
    put(tag,
      tagClose(),
      tagHead(iconURL(id), it.name, CAT_LABEL[it.cat] || it.cat, e.avgQ !== undefined ? pips(e.avgQ, e.lots.some((l) => l.p)) : null),
      el('p', { class: 'bp-desc' }, it.desc || ''),
      facts(info),
      actions.children.length ? actions : null,
    );
  };

  const showWeapon = (w) => {
    const g = gradeFor(w.score);
    tag.innerHTML = '';
    put(tag,
      tagClose(),
      tagHead(weaponIconURL(w.type, w.metal, w.infusion), w.name, 'Forged weapon', el('span', { class: 'bp-grade', style: { color: g.color, borderColor: g.color } }, `Grade ${g.g}`)),
      el('p', { class: 'bp-desc', html: `Forged on day ${w.day}. Metal quality ${w.matQ}% · craft score ${Math.round(w.score)}` + (w.gem ? ` · socketed ${ITEMS[w.gem]?.name}` : '') }),
      facts([`Worth about <span class="gold-txt">${formatGoldFull(w.value)}g</span> at the assay office.`]),
    );
  };

  const showSlot = (slot, label, sample) => {
    const cur = st.equipped(slot);
    const owned = Object.keys(st.data.owned).filter((id) => ITEMS[id]?.slot === slot);
    tag.innerHTML = '';
    const info = [];
    if (cur) {
      if (cur.tier) info.push(`Pick tier ${cur.tier} · power ${cur.power}`);
      if (cur.light) info.push(`Lamp radius ${cur.light}`);
      if (cur.cap) info.push(`Holds ${cur.cap} finds per trip`);
      if (cur.protect) info.push(`Protects from ${cur.protect.join(', ')}`);
      if (cur.radius) info.push(`Sees ${cur.radius} cells through rock`);
      if (cur.climb) info.push(`Climbing ×${cur.climb}` + (cur.jump ? ` · jump ×${cur.jump}` : ''));
    }
    const others = owned.filter((id) => !cur || id !== cur.id);
    const list = el('div', { class: 'bp-swap' });
    for (const id of others) {
      list.append(el('div', { class: 'bp-swap-row' }, [
        el('img', { class: 'pix', src: iconURL(id), alt: '' }), el('span', {}, ITEMS[id].name),
        el('button', { class: 'btn', onclick: () => { st.equip(id); game.audio.play('ui_click'); render(); reanchor(); showSlot(slot, label, sample); } }, 'Equip'),
      ]));
    }
    put(tag,
      tagClose(),
      tagHead(iconURL(cur ? cur.id : sample), cur ? cur.name : `No ${label.toLowerCase()}`, cur ? `${label} · in use` : label, null),
      el('p', { class: 'bp-desc' }, cur ? cur.desc || '' : 'This loop is empty. The shops in Deep Town might have something for it.'),
      facts(info),
      others.length ? el('small', { class: 'bp-swap-t' }, 'Also packed') : null,
      others.length ? list : null,
    );
  };

  // re-find the anchor node for the current selection after a re-render
  const reanchor = () => {
    if (!selKey) return;
    const n = root.querySelector(`[data-key="${CSS.escape(selKey)}"]`);
    if (n) { n.classList.add('on'); anchor = n; placeTag(); }
  };

  const render = (animate = false) => {
    renderTabs();
    renderGrid(animate || firstRender);
    renderEquip();
    renderFront();
    firstRender = false;
    if (selKey) reanchor();
  };

  render();
  scroll.addEventListener('scroll', () => { if (!tag.hidden && !root.classList.contains('narrow')) placeTag(); }, { passive: true });
  onSwipe(scroll, (dir) => {
    const i = TABS.findIndex(([k]) => k === tab);
    const j = clamp(i - dir, 0, TABS.length - 1);
    if (j === i) return;
    tab = TABS[j][0];
    selKey = null;
    closeTag();
    game.audio.play('page');
    render(true);
    tabsEl.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  });

  const fit = () => root.classList.toggle('narrow', window.innerWidth < 700 || window.innerHeight < 430);
  fit();
  const onResize = () => { fit(); if (!tag.hidden) placeTag(); };
  window.addEventListener('resize', onResize);
  const unsub = [st.on('gold', () => renderFront()), st.on('items', () => { if (!tag.hidden) return; render(); })];

  // I / Tab put the backpack away again
  let h = null;
  const onKey = (e) => {
    if (!h || h.closed || ui.panelStack[ui.panelStack.length - 1] !== h) return;
    if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); h.close(); }
  };
  h = ui.openPanel({
    body: root, className: 'bp-panel',
    onClose: () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      unsub.forEach((u) => u());
    },
  });
  h.onEscape = () => { if (!tag.hidden) { closeTag(); return true; } return false; };
  window.addEventListener('keydown', onKey);
  return h;
}
