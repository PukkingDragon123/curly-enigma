// The backpack: the inventory as a big, open leather rucksack (rows of pockets, Minecraft-like).
//  - main compartment (canvas lining): the pockets, in rows of nine. A new mole has 9; a bigger
//    bag (bought in the shops) unpicks more rows, sewn-shut pockets show what's still to come.
//    A spring scale shows the load: past what the bag carries comfortably the mole slows down
//    (core/weight.js), and heavy ore is best taken home
//  - tool loops + gear hooks on the side = equipment (click → tag with Equip)
//  - front pockets = Index Book, coin pouch, savings jar toward the Surface Ticket, calendar,
//    snacks; or, at home, the trunk where whatever didn't fit waits
//  - drag stacks between pockets and containers, right-click / long-press to split, double-click
//    to send to the other side, drop on the toss pit to throw away (see invGrid.js)
//  - clicking anything hangs a paper tag on it: name, quality, notes, value and actions
//
//   openBackpack(game, { side: 'trunk' | 'front' }) → panel handle (ui.openInventory())
import { el, formatGoldFull, formatGold, clamp } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS, sellPrice, CAT_LABEL } from '../data/items.js';
import { BUFFS } from '../data/recipes.js';
import { GOAL_GOLD } from '../core/State.js';
import { gradeFor } from '../data/weapons.js';
import * as Inv from '../core/inventory.js';
import * as W from '../core/weight.js';
import { TOOL_KINDS, HOTBAR_N, hotbarOf, hotbarSet, KIND_LABEL, KIND_ICON } from '../core/hotbar.js';
import { SPR } from './uiSprites.js';
import { qColor, pips, stagger, put } from './common.js';
import { SlotDnD, slotEl, gridBox, stackIcon, stackName, bounce } from './invGrid.js';
import { INV_ART, installInvArt } from './invArt.js';
import { installPackArt } from './packArt.js';
import { itemVox } from './itemVox.js';

const TOOL_SLOTS = [['pick', 'Pickaxe', 'pick_rusty'], ['chisel', 'Chisel', 'chisel_basic'], ['brush', 'Brush', 'brush_basic'], ['drill', 'Drill', 'drill_steam'], ['xray', 'X-Ray Lamp', 'xray_lamp']];
const GEAR_SLOTS = [['helmet', 'Helmet', 'helmet_basic'], ['gloves', 'Gloves', 'rubber_gloves'], ['suit', 'Suit', 'heat_suit'], ['boots', 'Boots', 'grip_boots'], ['bag', 'Bag', 'bag_small']];
const BAGS = ['bag_small', 'bag_medium', 'bag_large', 'bag_huge', 'bag_bottomless'];
const edible = (it) => it && (it.cat === 'food' || it.food);
const COLS = Inv.COLS;

/** Bag-full feedback (toast + the HUD pack wiggles). For pickups that didn't fit. */
export function bagFullToast(game, id) {
  const it = ITEMS[id];
  const ui = game.ui;
  game.audio.play('ui_error');
  ui.toast(`<b>Backpack full!</b> No room for ${it ? it.name : 'that'}.`, { kind: 'warn', icon: it ? iconURL(id) : undefined, dur: 2600 });
  const f = game.state.bagFill?.();
  if (f) ui.setBag?.(f.slots, f.slots);
}

export function openBackpack(game, opts = {}) {
  itemVox.init(game); // (items in the pack are drawn as 3D voxel stills; the picked one turns on its tag)
  const st = game.state;
  const ui = game.ui;
  const audio = game.audio;
  let selKey = null; // 'slot:<c>:<i>' | 'gear:<slot>'
  let firstRender = true;
  const atHome = game.sceneName === 'home';
  const sides = () => {
    const out = ['front'];
    if (opts.side === 'trunk' || (atHome && Inv.usedSlots(Inv.stash(st)) > 0)) out.push('trunk');
    return out;
  };
  let side = opts.side && sides().includes(opts.side) ? opts.side : 'front';

  // ---------------------------------------------------------------- containers
  const slotsOf = (c) => (c === 'bag' ? Inv.bag(st) : c === 'trunk' ? Inv.stash(st) : null);
  const capOf = (c) => (c === 'bag' ? Inv.bagSlots(st) : c === 'trunk' ? Infinity : slotsOf(c).length);

  // ---------------------------------------------------------------- structure
  const grid = el('div', { class: 'bp-grid', role: 'grid', 'aria-label': 'Backpack pockets' });
  const scroll = el('div', { class: 'bp-scroll' }, [grid]);
  const count = el('span', { class: 'bp-count' });
  const scale = el('span', { class: 'bp-scale', title: 'How heavy your pack is' });
  const tidyB = el('button', { class: 'bp-tool', title: 'Tidy up (sort and stack)', 'aria-label': 'Tidy up', onclick: () => tidy('bag') }, [el('img', { class: 'pix', src: INV_ART.brush(), alt: '' }), el('span', {}, 'Tidy')]);
  const toss = el('div', { class: 'bp-toss', 'data-drop': 'toss', title: 'Drop a stack here to throw it away' }, [el('img', { class: 'pix', src: INV_ART.toss(false), alt: '' }), el('span', {}, 'Toss')]);
  // turning what you hold (R, the wheel; on a touch screen this button)
  const turnB = el('button', { class: 'bp-tool inv-turn', hidden: true, title: 'Turn it (R)', 'aria-label': 'Turn it', onclick: () => dnd?.turn() }, [el('span', { class: 'inv-turn-ico' }, '⟳'), el('span', {}, 'Turn')]);
  const bar = el('div', { class: 'bp-bar' }, [count, scale, el('i', { class: 'spacer' }), turnB, tidyB, toss]);
  const tag = el('div', { class: 'bp-tag', hidden: true });
  const twine = el('i', { class: 'bp-twine', hidden: true });
  const tip = el('div', { class: 'inv-tip', hidden: true, role: 'tooltip' });
  // the hotbar row: the five loops you see in the mine; tap one to choose what goes in it
  const hotRow = el('div', { class: 'bp-hot', role: 'group', 'aria-label': 'Hotbar' });
  const main = el('section', { class: 'bp-main' }, [bar, scroll, hotRow, twine, tag]);
  const equip = el('aside', { class: 'bp-equip' });
  const sideTabs = el('div', { class: 'bp-sidetabs', role: 'tablist' });
  const sideBody = el('div', { class: 'bp-sidebody' });
  const sideEl = el('aside', { class: 'bp-side' }, [sideTabs, sideBody]);
  const body = el('div', { class: 'bp-body' }, [equip, main, sideEl]);
  const flap = el('div', { class: 'bp-flap' }, [
    el('i', { class: 'bp-strap l' }), el('i', { class: 'bp-strap r' }),
    el('div', { class: 'bp-patch' }, [el('span', {}, 'Backpack')]),
  ]);
  const root = el('div', { class: 'bp' }, [flap, body, tip]);
  installInvArt(root);
  installPackArt(root);

  // ---------------------------------------------------------------- sounds
  const sfx = (k) => {
    if (k === 'lift') { audio.tone({ f: 420, f2: 640, type: 'triangle', dur: 0.06, vol: 0.07 }); audio.noise({ color: 'brown', filter: 'lowpass', f: 900, dur: 0.05, vol: 0.06 }); }
    else if (k === 'drop') audio.play('place');
    else if (k === 'merge') { audio.play('place'); audio.tone({ f: 880, f2: 1320, type: 'square', dur: 0.05, vol: 0.035, delay: 0.04, filter: 'lowpass', ff: 3000 }); }
    else if (k === 'swap') { audio.play('place'); audio.tone({ f: 300, f2: 420, type: 'triangle', dur: 0.06, vol: 0.06, delay: 0.05 }); }
    else if (k === 'split') { audio.tone({ f: 990, f2: 1480, type: 'square', dur: 0.045, vol: 0.04, filter: 'lowpass', ff: 3500 }); audio.noise({ color: 'pink', filter: 'bandpass', f: 1800, dur: 0.06, vol: 0.05 }); }
    else if (k === 'one') audio.tone({ f: 740, f2: 980, type: 'triangle', dur: 0.04, vol: 0.06 });
    else if (k === 'nope') audio.play('ui_error');
    else if (k === 'tidy') { for (let i = 0; i < 4; i++) audio.noise({ color: 'pink', filter: 'bandpass', f: 1400 + i * 300, q: 1.2, dur: 0.07, vol: 0.07, delay: i * 0.06 }); audio.tone({ f: 660, f2: 990, type: 'triangle', dur: 0.08, vol: 0.05, delay: 0.26 }); }
  };

  // ---------------------------------------------------------------- the pockets
  const nextBag = () => {
    const cur = Inv.bagPockets(st);
    for (const id of BAGS) if ((ITEMS[id]?.slots || 0) > cur - Math.floor((st.upEffect?.('bag') || 0) / 4) && (ITEMS[id]?.slots || 0) > (st.equipped('bag')?.slots || 9)) return ITEMS[id];
    return null;
  };
  const renderGrid = (animate) => {
    const slots = Inv.bag(st);
    grid.innerHTML = '';
    grid.classList.toggle('bp-settle', !!animate);
    // the pack's lining: a grid of cells; what you carry lies on it as tiles (turn them to fit).
    // A sewn-shut row below shows the next bag.
    const nb = nextBag();
    const box = gridBox(slots, { c: 'bag', frame: 'pocket', cls: 'bag' + (slots.grid.cols > 6 ? ' big' : ''), hide: (i) => dnd?.heldFrom('bag', i) || 0, sel: (i) => selKey === `slot:bag:${i}`, sewnRows: nb ? 1 : 0 });
    grid.append(box);
    if (nb) grid.append(el('div', { class: 'bp-nextbag' }, [el('span', { class: 'inv-lock' }, nb.name), el('small', {}, ` sews on more rows`)]));
    const nodes = [...box.querySelectorAll('.inv-slot')];
    if (animate) stagger(nodes, firstRender ? 16 : 8);
    const f = Inv.bagFill(st);
    count.innerHTML = `<b>${f.used}</b>/${f.slots} cells`;
    count.classList.toggle('full', f.full);
    renderScale();
  };
  /** The spring scale: kg carried vs what the bag carries comfortably. */
  const renderScale = () => {
    const L = Inv.bagLoad(st);
    const k = clamp(L.r / 2, 0, 1);
    scale.innerHTML = '';
    scale.className = 'bp-scale ' + L.tier;
    scale.title = `${W.TIER_LABEL[L.tier]}. You carry ${L.carry.toFixed(0)} kg comfortably; past that you slow down. Twice that is the most you can lift.`;
    put(scale,
      el('img', { class: 'pix', src: INV_ART.weight ? INV_ART.weight() : iconURL('iron_ore'), alt: '' }),
      el('span', { html: `<b>${L.kg.toFixed(1)}</b>/${L.carry.toFixed(0)} kg` }),
      el('i', { class: 'bp-scale-bar' }, [el('i', { style: { width: (k * 100).toFixed(1) + '%', background: W.TIER_COLOR[L.tier] } }), el('u', { style: { left: '50%' } })]),
      L.tier !== 'light' && L.tier !== 'good' ? el('em', {}, W.TIER_LABEL[L.tier]) : null,
    );
  };

  // ---------------------------------------------------------------- equipment (tool loops + gear hooks)
  const renderEquip = () => {
    equip.innerHTML = '';
    const col = (title, list, cls) => {
      const c = el('div', { class: 'bp-col ' + cls }, [el('div', { class: 'bp-coltitle' }, title)]);
      for (const [slot, label, sample] of list) {
        const cur = st.equipped(slot);
        const owned = Object.keys(st.data.owned).filter((id) => ITEMS[id]?.slot === slot);
        const key = 'gear:' + slot;
        const extras = [];
        if (owned.length > 1) extras.push(el('span', { class: 'n' }, '+' + (owned.length - 1)));
        const b = el('button', { class: 'bp-loop' + (cur ? '' : ' empty') + (selKey === key ? ' on' : ''), title: cur ? `${label}: ${cur.name}` : `${label}: empty`, 'aria-label': cur ? `${label}: ${cur.name}` : `${label}: empty`, 'data-key': key }, [
          el('img', { class: 'pix', src: itemVox.src(cur ? cur.id : sample), alt: '' }), ...extras,
        ]);
        b.onclick = () => selectGear(slot, label, sample, b);
        c.append(b);
      }
      return c;
    };
    equip.append(col('Tools', TOOL_SLOTS, 'tools'), col('Gear', GEAR_SLOTS, 'gear'));
  };

  // ---------------------------------------------------------------- the side: front pockets, the trunk
  const renderSideTabs = () => {
    const list = sides();
    if (!list.includes(side)) side = 'front';
    sideTabs.innerHTML = '';
    sideTabs.hidden = list.length < 2;
    const label = { front: 'Pockets', trunk: 'Trunk' };
    for (const k of list) {
      sideTabs.append(el('button', {
        class: 'bp-label' + (side === k ? ' on' : ''), role: 'tab', 'aria-selected': side === k ? 'true' : 'false',
        onclick: () => { if (side === k) return; side = k; closeTag(); audio.play('page'); renderSide(true); },
      }, label[k]));
    }
    root.classList.toggle('with-trunk', side === 'trunk');
  };

  const renderFront = () => {
    const g = st.gold;
    const p = clamp(g / GOAL_GOLD, 0, 1);
    const notes = Object.keys(st.data.index).length;
    const bagIt = st.equipped('bag');
    const front = el('div', { class: 'bp-front' });
    front.append(
      el('button', { class: 'bp-book', title: 'Index Book (B)', onclick: () => { audio.play('page'); ui.openIndex(); } }, [
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
        el('div', {}, [el('small', {}, bagIt ? bagIt.name : 'Bag'), el('span', {}, `${Inv.bag(st).grid.cols}×${Inv.bag(st).grid.rows} pack`)]),
      ]),
    );
    // snack pouch: quick access to food in the pockets
    const foods = st.inventory(edible).sort((a, b) => (ITEMS[b.id].energy ?? ITEMS[b.id].food ?? 0) - (ITEMS[a.id].energy ?? ITEMS[a.id].food ?? 0)).slice(0, 4);
    const snack = el('div', { class: 'bp-snacks' }, [el('div', { class: 'bp-coltitle' }, 'Snacks')]);
    const row = el('div', { class: 'bp-snack-row' });
    for (const f of foods) {
      const it = ITEMS[f.id];
      const slots = Inv.bag(st);
      const i = slots.findIndex((s) => s && s.id === f.id);
      const b = el('button', { class: 'bp-snack', title: `${it.name} (+${it.energy ?? it.food})` }, [
        el('img', { class: 'pix', src: itemVox.src(f.id), alt: '' }), el('span', { class: 'n' }, String(f.n)),
      ]);
      b.onclick = () => { if (i >= 0) selectSlot('bag', i, grid.querySelector(`.inv-slot[data-c="bag"][data-i="${i}"]`)); };
      row.append(b);
    }
    if (!foods.length) row.append(el('span', { class: 'bp-none' }, 'No food packed.'));
    snack.append(row);
    front.append(snack);
    return front;
  };

  const renderTrunk = () => {
    const slots = Inv.stash(st);
    const n = Math.max(12, Math.ceil((slots.length + 4) / 4) * 4);
    const tg = el('div', { class: 'bp-tgrid' });
    for (let i = 0; i < n; i++) tg.append(slotEl(slots[i] || null, { c: 'trunk', i, frame: 'trunk', hide: dnd?.heldFrom('trunk', i) || 0, sel: selKey === `slot:trunk:${i}` }));
    return el('div', { class: 'bp-trunk' }, [
      el('div', { class: 'bp-trunk-head' }, [el('b', {}, 'The trunk'), el('small', {}, atHome ? 'Whatever didn\'t fit in your pack waits in here.' : 'It stays at home.'), el('button', { class: 'bp-tool sm', title: 'Tidy the trunk', 'aria-label': 'Tidy the trunk', onclick: () => tidy('trunk') }, [el('img', { class: 'pix', src: INV_ART.brush(), alt: '' })])]),
      el('div', { class: 'bp-tscroll' }, [tg]),
    ]);
  };

  const renderSide = (animate = false) => {
    renderSideTabs();
    sideBody.innerHTML = '';
    const node = side === 'trunk' ? renderTrunk() : renderFront();
    sideBody.append(node);
    if (animate) bounce(node, 'swap-in');
  };

  // ---------------------------------------------------------------- moving things around
  const move = (c, i, d, j, k) => {
    const from = slotsOf(c), to = slotsOf(d);
    if (!from || !to) return 0;
    // the trunk only opens at home
    if ((c === 'trunk' || d === 'trunk') && !atHome && opts.side !== 'trunk') return 0;
    if (d === 'trunk' && j >= to.length) { while (to.length <= j) to.push(null); }
    const cap = capOf(d);
    if (j >= 0 && j >= cap) return 0;
    const moved = Inv.transfer(st, from, i, to, j, k, cap === Infinity ? to.length + 99 : cap);
    if (d === 'trunk' || c === 'trunk') { while (to.length && !to[to.length - 1]) to.pop(); while (from.length && !from[from.length - 1] && c === 'trunk') from.pop(); }
    return moved;
  };
  /** Drop on a grid cell (the backpack): the same rules as move(). */
  const moveAt = (c, i, d, x, y, r, k) => {
    const from = slotsOf(c), to = slotsOf(d);
    if (!from || !to || !from[i]) return null;
    if ((c === 'trunk' || d === 'trunk') && !atHome && opts.side !== 'trunk') return null;
    const res = Inv.transferAt(st, from, i, to, x, y, r, k);
    if (c === 'trunk') while (from.length && !from[from.length - 1]) from.pop();
    return res;
  };
  const other = (c) => (c === 'bag' ? (side === 'trunk' ? 'trunk' : null) : 'bag');

  const tidy = (c) => {
    const s = slotsOf(c);
    if (!s) return;
    Inv.tidy(s, c === 'trunk' ? s.length : capOf(c));
    if (c === 'trunk') while (s.length && !s[s.length - 1]) s.pop();
    Inv.sync(st);
    st.emit('items', { id: null, n: 0, tidy: c });
    sfx('tidy');
    closeTag();
    render(false);
    const nodes = [...root.querySelectorAll(`.inv-slot[data-c="${c}"]:not(.empty)`)];
    nodes.forEach((n, k) => { n.style.setProperty('--d', k * 22 + 'ms'); bounce(n, 'tidied'); });
  };

  const tossStack = async (c, i, k) => {
    const s = slotsOf(c)?.[i];
    if (!s) return;
    const n = Math.min(Inv.stackN(s), k);
    const worth = s.w ? s.w.value : s.lots ? s.lots.slice(0, n).reduce((a, l) => a + sellPrice(l.id, l.q, l.p), 0) : sellPrice(s.id) * n;
    if (worth >= 60 || s.w) {
      const ok = await ui.confirm(`Throw away <b>${n > 1 ? n + '× ' : ''}${stackName(s)}</b>? It's worth about <span class="gold-txt">${formatGoldFull(worth)}g</span>.`, 'Toss it', 'Keep');
      if (!ok) return;
    }
    const cur = slotsOf(c)?.[i];
    if (cur !== s) return;
    if (s.w) slotsOf(c)[i] = null;
    else Inv.splitStack(slotsOf(c), i, n);
    Inv.sync(st);
    st.emit('items', { id: s.id, n: -n, toss: true });
    audio.play('whoosh');
    audio.play('thud', { vol: 0.5 });
    toss.classList.remove('gulp'); void toss.offsetWidth; toss.classList.add('gulp');
    toss.querySelector('img').src = INV_ART.toss(true);
    setTimeout(() => { toss.querySelector('img').src = INV_ART.toss(false); }, 380);
    closeTag();
    render(false);
  };

  // ---------------------------------------------------------------- selection + paper tag
  let anchor = null;
  const markSel = (node) => {
    for (const n of root.querySelectorAll('.on[data-key], .inv-slot.on')) n.classList.remove('on');
    node?.classList.add('on');
  };
  const selectSlot = (c, i, node) => {
    const key = `slot:${c}:${i}`;
    if (selKey === key && !tag.hidden) { closeTag(); return; }
    const s = slotsOf(c)?.[i];
    if (!s) return;
    selKey = key;
    markSel(node);
    anchor = node;
    audio.play('ui_click');
    showStack(c, i);
    placeTag();
  };
  const selectGear = (slot, label, sample, node) => {
    const key = 'gear:' + slot;
    if (selKey === key && !tag.hidden) { closeTag(); return; }
    selKey = key;
    markSel(node);
    anchor = node;
    audio.play('ui_click');
    showSlot(slot, label, sample);
    placeTag();
  };
  const closeTag = () => {
    selKey = null;
    anchor = null;
    tag.hidden = true;
    twine.hidden = true;
    markSel(null);
  };

  const placeTag = () => {
    tag.hidden = false;
    tag.classList.remove('swing');
    void tag.offsetWidth;
    tag.classList.add('swing');
    requestAnimationFrame(() => {
      if (!anchor || tag.hidden) return;
      const narrow = root.classList.contains('narrow');
      if (narrow) { tag.style.left = ''; tag.style.top = ''; twine.hidden = true; return; }
      const mr = main.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
      const tw = tag.offsetWidth, th = tag.offsetHeight;
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

  let tagSpin = null;
  const tagHead = (icon, name, kind, extra, voxId = null) => {
    const box = el('div', { class: 'bp-tag-icon' }, [el('img', { class: 'pix', src: icon, alt: '' })]);
    // the picked item turns slowly on its tag, in 3D voxels
    tagSpin?.dispose();
    tagSpin = voxId ? itemVox.spin(box, voxId) : null;
    if (tagSpin) box.classList.add('vox');
    return el('div', { class: 'bp-tag-head' }, [box, el('div', {}, [el('small', {}, kind), el('b', {}, name), extra || null])]);
  };
  const tagClose = () => el('button', { class: 'bp-tag-x', 'aria-label': 'Put it back', title: 'Put it back', onclick: () => { audio.play('ui_click'); closeTag(); } });
  const facts = (lines) => (lines.length ? el('ul', { class: 'bp-facts' }, lines.map((l) => el('li', { html: l }))) : null);

  const showStack = (c, i) => {
    const s = slotsOf(c)?.[i];
    tag.innerHTML = '';
    if (!s) { closeTag(); return; }
    if (s.w) { showWeapon(c, i, s.w); return; }
    const it = ITEMS[s.id];
    const n = Inv.stackN(s);
    const q = Inv.stackQ(s);
    const info = [];
    if (q !== null) info.push(`Quality <b style="color:${qColor(q)}">${q}%</b> on average${n > 1 && Math.min(...s.lots.map((l) => l.q)) !== Math.max(...s.lots.map((l) => l.q)) ? ` (${Math.min(...s.lots.map((l) => l.q))}–${Math.max(...s.lots.map((l) => l.q))}%)` : ''}${Inv.stackPristine(s) ? ` · ${s.lots.filter((l) => l.p).length} pristine` : ''}`);
    if (it.value) info.push(`Worth about <span class="gold-txt">${formatGoldFull(sellPrice(s.id, q ?? 100))}g</span> each`);
    if (it.energy || it.food) info.push(`Restores <b>${it.energy ?? it.food}</b> energy` + (it.buff ? ` · ${BUFFS[it.buff]?.name || it.buff}` : '') + (it.maxEnergy ? ` · +${it.maxEnergy} max energy` : ''));
    info.push(`${n} here · stacks to ${Inv.stackMax(s.id)}${slotsOf(c)?.grid ? ` · takes <b>${Inv.footprint(s).join('×')}</b> cells` : ''}`);
    info.push(`Weighs <b>${W.kgOf(s.id) < 0.1 ? W.kgOf(s.id).toFixed(2) : W.kgOf(s.id).toFixed(1)} kg</b>${n > 1 ? ` each (${W.stackKg(s).toFixed(1)} kg here)` : ''}`);
    const actions = el('div', { class: 'bp-actions' });
    if (c === 'bag' && (it.cat === 'food' || (it.food && game.scene?.allowEatRaw !== false))) {
      actions.append(el('button', { class: 'btn', onclick: () => { game.eat(s.id); render(); refreshTag(); } }, it.cat === 'food' ? 'Eat' : 'Eat raw'));
    }
    const to = other(c);
    if (to) actions.append(el('button', { class: 'btn alt', onclick: () => { const m = move(c, i, to, -1, Infinity); sfx(m > 0 ? 'drop' : 'nope'); closeTag(); render(); } }, to === 'bag' ? 'Take' : 'To the trunk'));
    if (n > 1) actions.append(el('button', { class: 'btn alt', title: 'Take half into your paw (right-click or long-press)', onclick: () => { closeTag(); dnd.hand = { c, i, k: Math.ceil(n / 2) }; dnd.ghostFor(s, Math.ceil(n / 2)); const r = grid.getBoundingClientRect(); dnd.showGhost(r.left + r.width / 2, r.top + 30); sfx('split'); render(); } }, 'Split'));
    const fpS = Inv.footprint(s);
    if (slotsOf(c)?.grid && fpS[0] !== fpS[1]) actions.append(el('button', { class: 'btn alt', title: 'Turn it a quarter where it lies (R while holding it)', onclick: () => { if (Inv.rotateStack(st, slotsOf(c), i)) { sfx('one'); render(); reanchor(); placeTag(); } else { sfx('nope'); ui.toast('No room to turn it there.', { kind: 'warn', dur: 1400 }); } } }, 'Turn'));
    actions.append(el('button', { class: 'btn alt danger', onclick: () => tossStack(c, i, n) }, 'Toss'));
    put(tag,
      tagClose(),
      tagHead(stackIcon(s), it.name, CAT_LABEL[it.cat] || it.cat, q !== null ? pips(q, Inv.stackPristine(s)) : null, s.id),
      el('p', { class: 'bp-desc' }, it.desc || ''),
      facts(info),
      actions,
    );
  };
  const refreshTag = () => {
    if (!selKey || !selKey.startsWith('slot:')) return;
    const [, c, i] = selKey.split(':');
    if (!slotsOf(c)?.[+i]) { closeTag(); return; }
    reanchor();
    showStack(c, +i);
  };

  const showWeapon = (c, i, w) => {
    const g = gradeFor(w.score);
    tag.innerHTML = '';
    const actions = el('div', { class: 'bp-actions' });
    const to = other(c);
    if (to) actions.append(el('button', { class: 'btn alt', onclick: () => { const m = move(c, i, to, -1, 1); sfx(m > 0 ? 'drop' : 'nope'); closeTag(); render(); } }, to === 'bag' ? 'Take' : 'To the trunk'));
    actions.append(el('button', { class: 'btn alt danger', onclick: () => tossStack(c, i, 1) }, 'Toss'));
    put(tag,
      tagClose(),
      tagHead(stackIcon({ w }), w.name, 'Forged weapon', el('span', { class: 'bp-grade', style: { color: g.color, borderColor: g.color } }, `Grade ${g.g}`), itemVox.wkey(w.type, w.metal, w.infusion)),
      el('p', { class: 'bp-desc', html: `Forged on day ${w.day}. Metal quality ${w.matQ}% · craft score ${Math.round(w.score)}` + (w.gem ? ` · socketed ${ITEMS[w.gem]?.name}` : '') }),
      facts([`Worth about <span class="gold-txt">${formatGoldFull(w.value)}g</span> at the assay office.`, `Takes a whole pocket · weighs <b>${W.weaponKg(w).toFixed(1)} kg</b>.`]),
      actions,
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
      if (cur.slots) info.push(`${cur.slots} pockets` + (Inv.bagSlots(st) > cur.slots ? ` (+${Inv.bagSlots(st) - cur.slots} sewn in)` : '') + ` · carries <b>${W.carryOf(st).toFixed(0)} kg</b> comfortably`);
      if (cur.protect) info.push(`Protects from ${cur.protect.join(', ')}`);
      if (cur.radius) info.push(`Sees ${cur.radius} cells through rock`);
      if (cur.climb) info.push(`Climbing ×${cur.climb}` + (cur.jump ? ` · jump ×${cur.jump}` : ''));
    }
    const others = owned.filter((id) => !cur || id !== cur.id);
    const list = el('div', { class: 'bp-swap' });
    for (const id of others) {
      list.append(el('div', { class: 'bp-swap-row' }, [
        el('img', { class: 'pix', src: itemVox.src(id), alt: '' }), el('span', {}, ITEMS[id].name),
        el('button', { class: 'btn', onclick: () => {
          if (!st.equip(id)) { sfx('nope'); ui.toast('Empty some pockets first: that bag is smaller.', { kind: 'warn', dur: 2000 }); return; }
          audio.play('ui_click'); render(); reanchor(); showSlot(slot, label, sample);
        } }, 'Equip'),
      ]));
    }
    put(tag,
      tagClose(),
      tagHead(itemVox.src(cur ? cur.id : sample), cur ? cur.name : `No ${label.toLowerCase()}`, cur ? `${label} · in use` : label, null, cur ? cur.id : null),
      el('p', { class: 'bp-desc' }, cur ? cur.desc || '' : 'This loop is empty. The shops in Deep Town might have something for it.'),
      facts(info),
      others.length ? el('small', { class: 'bp-swap-t' }, 'Also packed') : null,
      others.length ? list : null,
    );
  };

  // re-find the anchor node for the current selection after a re-render
  const reanchor = () => {
    if (!selKey) return;
    let n = null;
    if (selKey.startsWith('slot:')) { const [, c, i] = selKey.split(':'); n = root.querySelector(`.inv-slot[data-c="${c}"][data-i="${i}"]`); }
    else n = root.querySelector(`[data-key="${CSS.escape(selKey)}"]`);
    if (n) { markSel(n); anchor = n; placeTag(); }
  };

  // ---------------------------------------------------------------- tooltips (mouse hover)
  let tipT = 0;
  const hover = (c, i, node, e) => {
    clearTimeout(tipT);
    if (c === null || c === undefined) { tip.hidden = true; return; }
    const s = slotsOf(c)?.[i];
    if (!s) { tip.hidden = true; return; }
    tipT = setTimeout(() => {
      const n = Inv.stackN(s), q = Inv.stackQ(s);
      tip.innerHTML = '';
      const it = s.w ? null : ITEMS[s.id];
      const val = s.w ? s.w.value : sellPrice(s.id, q ?? 100);
      put(tip,
        el('b', {}, stackName(s)),
        el('span', { class: 'inv-tip-sub' }, [
          s.w ? `Grade ${s.w.grade}` : (CAT_LABEL[it?.cat] || ''),
          n > 1 ? ` · ×${n}` : '',
          q !== null ? el('span', { style: { color: qColor(q) } }, ` · ${q}%`) : '',
        ]),
        val ? el('span', { class: 'gold-txt' }, `${formatGoldFull(val)}g${n > 1 && !s.w ? ' each' : ''}`) : null,
      );
      const r = node.getBoundingClientRect();
      tip.hidden = false;
      const tw = tip.offsetWidth;
      tip.style.left = Math.round(clamp(r.left + r.width / 2 - tw / 2, 4, window.innerWidth - tw - 4)) + 'px';
      tip.style.top = Math.round(r.top - tip.offsetHeight - 6) + 'px';
    }, 260);
  };

  // ---------------------------------------------------------------- the hotbar row
  const renderHot = () => {
    const bar = hotbarOf(st);
    hotRow.innerHTML = '';
    hotRow.append(el('span', { class: 'bp-hot-t' }, 'Hotbar'));
    bar.forEach((k, i) => {
      const b = el('button', { class: 'bp-hot-slot' + (k ? '' : ' empty') + (selKey === 'hot:' + i ? ' on' : ''), 'data-key': 'hot:' + i, title: k ? `${i + 1}: ${KIND_LABEL[k]}` : `${i + 1}: empty`, 'aria-label': k ? `Hotbar ${i + 1}: ${KIND_LABEL[k]}` : `Hotbar ${i + 1}: empty` }, [
        k ? el('img', { class: 'pix', src: itemVox.src(KIND_ICON[k]), alt: '' }) : null, el('i', { class: 'k' }, String(i + 1)),
      ]);
      b.onclick = () => selectHot(i, b);
      hotRow.append(b);
    });
  };
  const selectHot = (i, node) => {
    const key = 'hot:' + i;
    if (selKey === key && !tag.hidden) { closeTag(); return; }
    selKey = key; markSel(node); anchor = node; audio.play('ui_click');
    const bar = hotbarOf(st);
    tag.innerHTML = '';
    const list = el('div', { class: 'bp-swap' });
    for (const k of TOOL_KINDS) {
      list.append(el('div', { class: 'bp-swap-row' }, [
        el('img', { class: 'pix', src: itemVox.src(KIND_ICON[k]), alt: '' }), el('span', {}, KIND_LABEL[k] + (bar.includes(k) && bar[i] !== k ? ` (slot ${bar.indexOf(k) + 1})` : '')),
        el('button', { class: 'btn' + (bar[i] === k ? ' alt' : ''), disabled: bar[i] === k, onclick: () => { hotbarSet(st, i, k); sfx('drop'); game.scene?.updateHotbar?.(); closeTag(); renderHot(); } }, bar[i] === k ? 'In it' : 'Put here'),
      ]));
    }
    put(tag, tagClose(), tagHead(itemVox.src(bar[i] ? KIND_ICON[bar[i]] : 'pick_rusty'), `Hotbar slot ${i + 1}`, bar[i] ? KIND_LABEL[bar[i]] : 'Empty', null),
      el('p', { class: 'bp-desc' }, `What sits in loop ${i + 1} at the bottom of the screen in the mine (key ${i + 1}).`), list);
    placeTag();
  };

  // ---------------------------------------------------------------- render
  const render = (animate = false) => {
    renderGrid(animate || firstRender);
    renderHot();
    renderEquip();
    renderSide(false);
    firstRender = false;
    if (selKey) reanchor();
  };

  let dnd = null;
  dnd = new SlotDnD({
    root,
    slots: slotsOf,
    cap: capOf,
    other,
    move,
    moveAt,
    canAt: (c, i, d, x, y, r) => { const from = slotsOf(c), to = slotsOf(d); return from && to ? Inv.previewAt(from, i, to, x, y, r) : null; },
    held: (on) => { turnB.hidden = !on; },
    toss: (c, i, k) => tossStack(c, i, k),
    select: (c, i, node) => selectSlot(c, i, node),
    hover,
    changed: () => render(false),
    sfx,
  });
  render(true);

  const fit = () => {
    root.classList.toggle('narrow', window.innerWidth < 700 || window.innerHeight < 430);
    root.classList.toggle('portrait', window.innerWidth < 640 && window.innerHeight > window.innerWidth);
  };
  fit();
  const onResize = () => { fit(); if (!tag.hidden) placeTag(); };
  window.addEventListener('resize', onResize);
  const unsub = [
    st.on('gold', () => { if (side === 'front') renderSide(false); }),
    st.on('items', (e) => { if (e && (e.moved !== undefined || e.tidy || e.toss)) return; if (!tag.hidden) return; render(); }),
  ];
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
      clearTimeout(tipT);
      dnd.destroy();
    },
  });
  h.onEscape = () => {
    if (dnd.cancelHand()) return true;
    if (!tag.hidden) { closeTag(); return true; }
    return false;
  };
  window.addEventListener('keydown', onKey);
  // test hooks
  h.inv = {
    root, side: () => side, setSide: (k) => { side = k; renderSide(true); },
    move: (c, i, d, j, k) => { const m = move(c, i, d, j, k); render(); return m; },
    select: (c, i) => selectSlot(c, i, root.querySelector(`.inv-slot[data-c="${c}"][data-i="${i}"]`)),
    split: (c, i) => { const s = slotsOf(c)?.[i]; if (!s) return; dnd.hand = { c, i, k: Math.ceil(Inv.stackN(s) / 2) }; dnd.ghostFor(s, dnd.hand.k); render(); },
    tidy, toss: (c, i, k = 99) => tossStack(c, i, k), dnd,
  };
  return h;
}
