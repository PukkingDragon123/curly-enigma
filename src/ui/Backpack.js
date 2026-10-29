// The backpack: the inventory as a big, open leather rucksack (rows of pockets, Minecraft-like).
//  - main compartment (canvas lining): the pockets, in rows of nine. A new mole has 9; a bigger
//    bag (bought in the shops) unpicks more rows, sewn-shut pockets show what's still to come.
//    A spring scale shows the load: past what the bag carries comfortably the mole slows down
//    (core/weight.js), and heavy ore belongs on Nugget's coop
//  - the coop side: her shelves, her load, Unload ore, and the coop's upgrades: parts forged at
//    the home forge (data/coopParts.js) installed here
//  - tool loops + gear hooks on the side = equipment (click → tag with Equip)
//  - front pockets = Index Book, coin pouch, savings jar toward the Surface Ticket, calendar,
//    snacks; or, near Nugget's coop, the coop's straw cubbies and her feed bowl; or, at home,
//    the trunk where whatever didn't fit waits
//  - drag stacks between pockets and containers, right-click / long-press to split, double-click
//    to send to the other side, drop on the toss pit to throw away (see invGrid.js)
//  - clicking anything hangs a paper tag on it: name, quality, notes, value and actions
//
//   openBackpack(game, { side: 'coop' | 'trunk' | 'front' }) → panel handle (ui.openInventory()
//   opens it with the side chosen automatically: the coop when Nugget's coop is near)
import { el, formatGoldFull, formatGold, clamp } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS, sellPrice, CAT_LABEL } from '../data/items.js';
import { BUFFS } from '../data/recipes.js';
import { GOAL_GOLD } from '../core/State.js';
import { gradeFor } from '../data/weapons.js';
import * as Inv from '../core/inventory.js';
import * as W from '../core/weight.js';
import { COOP_PARTS } from '../data/coopParts.js';
import { SPR } from './uiSprites.js';
import { qColor, pips, stagger, put } from './common.js';
import { SlotDnD, slotEl, stackIcon, stackName, bounce } from './invGrid.js';
import { INV_ART, installInvArt } from './invArt.js';
import { portrait3d } from '../gfx/portrait3d.js';

const TOOL_SLOTS = [['pick', 'Pickaxe', 'pick_rusty'], ['chisel', 'Chisel', 'chisel_basic'], ['brush', 'Brush', 'brush_basic'], ['drill', 'Drill', 'drill_steam'], ['xray', 'X-Ray Lamp', 'xray_lamp']];
const GEAR_SLOTS = [['helmet', 'Helmet', 'helmet_basic'], ['gloves', 'Gloves', 'rubber_gloves'], ['suit', 'Suit', 'heat_suit'], ['boots', 'Boots', 'grip_boots'], ['bag', 'Bag', 'bag_small']];
const BAGS = ['bag_small', 'bag_medium', 'bag_large', 'bag_huge', 'bag_bottomless'];
const edible = (it) => it && (it.cat === 'food' || it.food);
const henFood = (it) => it && it.hen > 0;
const COLS = Inv.COLS;

/** Nugget in the current scene (the mine's or home's), if she's around. */
export function sceneNugget(game) {
  const s = game.scene;
  return s?.nugget || s?.nug || null;
}

/** Bag-full feedback (toast + the HUD pack wiggles). For pickups that didn't fit. */
export function bagFullToast(game, id) {
  const it = ITEMS[id];
  const ui = game.ui;
  game.audio.play('ui_error');
  ui.toast(`<b>Backpack full!</b> No room for ${it ? it.name : 'that'}.${game.state.flag('nugget') ? ' Nugget\'s coop has shelves.' : ''}`, { kind: 'warn', icon: it ? iconURL(id) : undefined, dur: 2600 });
  const f = game.state.bagFill?.();
  if (f) ui.setBag?.(f.slots, f.slots);
}

export function openBackpack(game, opts = {}) {
  const st = game.state;
  const ui = game.ui;
  const audio = game.audio;
  let selKey = null; // 'slot:<c>:<i>' | 'gear:<slot>'
  let firstRender = true;
  const nug = sceneNugget(game);
  const coopNear = () => !!st.flag('nugget') && !!(nug?.coopNear?.() ?? false);
  const atHome = game.sceneName === 'home';
  const sides = () => {
    const out = ['front'];
    if (coopNear() || opts.side === 'coop') out.push('coop');
    if (opts.side === 'trunk' || (atHome && Inv.usedSlots(Inv.stash(st)) > 0)) out.push('trunk');
    return out;
  };
  let side = opts.side && sides().includes(opts.side) ? opts.side : coopNear() ? 'coop' : 'front';

  // ---------------------------------------------------------------- containers
  const slotsOf = (c) => (c === 'bag' ? Inv.bag(st) : c === 'coop' ? Inv.coopSlots(st) : c === 'trunk' ? Inv.stash(st) : null);
  const capOf = (c) => (c === 'bag' ? Inv.bagSlots(st) : c === 'trunk' ? Infinity : slotsOf(c).length);
  const nameOf = (c) => (c === 'bag' ? 'backpack' : c === 'coop' ? 'coop' : 'trunk');

  // ---------------------------------------------------------------- structure
  const grid = el('div', { class: 'bp-grid', role: 'grid', 'aria-label': 'Backpack pockets' });
  const scroll = el('div', { class: 'bp-scroll' }, [grid]);
  const count = el('span', { class: 'bp-count' });
  const scale = el('span', { class: 'bp-scale', title: 'How heavy your pack is' });
  const tidyB = el('button', { class: 'bp-tool', title: 'Tidy up (sort and stack)', 'aria-label': 'Tidy up', onclick: () => tidy('bag') }, [el('img', { class: 'pix', src: INV_ART.brush(), alt: '' }), el('span', {}, 'Tidy')]);
  const toss = el('div', { class: 'bp-toss', 'data-drop': 'toss', title: 'Drop a stack here to throw it away' }, [el('img', { class: 'pix', src: INV_ART.toss(false), alt: '' }), el('span', {}, 'Toss')]);
  const bar = el('div', { class: 'bp-bar' }, [count, scale, el('i', { class: 'spacer' }), tidyB, toss]);
  const tag = el('div', { class: 'bp-tag', hidden: true });
  const twine = el('i', { class: 'bp-twine', hidden: true });
  const tip = el('div', { class: 'inv-tip', hidden: true, role: 'tooltip' });
  const main = el('section', { class: 'bp-main' }, [bar, scroll, twine, tag]);
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
    const cur = Inv.bagSlots(st);
    for (const id of BAGS) if ((ITEMS[id]?.slots || 0) > cur - Math.floor((st.upEffect?.('bag') || 0) / 4) && (ITEMS[id]?.slots || 0) > (st.equipped('bag')?.slots || 9)) return ITEMS[id];
    return null;
  };
  const renderGrid = (animate) => {
    const slots = Inv.bag(st), cap = Inv.bagSlots(st);
    grid.innerHTML = '';
    grid.classList.toggle('bp-settle', !!animate);
    const nodes = [];
    const n = Math.max(slots.length, cap);
    for (let i = 0; i < n; i++) {
      const node = slotEl(slots[i], { c: 'bag', i, frame: 'pocket', hide: dnd?.heldFrom('bag', i) || 0, sel: selKey === `slot:bag:${i}` });
      if (i >= cap) node.classList.add('over-cap');
      nodes.push(node);
    }
    // sewn-shut pockets: the rest of this row, and the next bag's rows
    const nb = nextBag();
    const lockedTo = Math.max(Math.ceil(n / COLS) * COLS, nb ? Math.min(Inv.MAX_SLOTS, Math.ceil(n / COLS) * COLS + COLS) : 0);
    for (let i = n; i < lockedTo; i++) nodes.push(slotEl(null, { c: 'bag', i, frame: 'pocket', locked: true, lockLabel: i === n && nb ? nb.name : null }));
    grid.append(...nodes);
    if (animate) stagger(nodes, firstRender ? 16 : 8);
    const f = Inv.bagFill(st);
    count.innerHTML = `<b>${f.used}</b>/${f.slots} pockets`;
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
          el('img', { class: 'pix', src: iconURL(cur ? cur.id : sample), alt: '' }), ...extras,
        ]);
        b.onclick = () => selectGear(slot, label, sample, b);
        c.append(b);
      }
      return c;
    };
    equip.append(col('Tools', TOOL_SLOTS, 'tools'), col('Gear', GEAR_SLOTS, 'gear'));
  };

  // ---------------------------------------------------------------- the side: front pockets, the coop, the trunk
  const renderSideTabs = () => {
    const list = sides();
    if (!list.includes(side)) side = 'front';
    sideTabs.innerHTML = '';
    sideTabs.hidden = list.length < 2;
    const label = { front: 'Pockets', coop: 'Coop', trunk: 'Trunk' };
    for (const k of list) {
      sideTabs.append(el('button', {
        class: 'bp-label' + (side === k ? ' on' : ''), role: 'tab', 'aria-selected': side === k ? 'true' : 'false',
        onclick: () => { if (side === k) return; side = k; closeTag(); audio.play('page'); renderSide(true); },
      }, label[k]));
    }
    root.classList.toggle('with-coop', side === 'coop');
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
        el('div', {}, [el('small', {}, bagIt ? bagIt.name : 'Bag'), el('span', {}, `${Inv.bagSlots(st)} pockets`)]),
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
        el('img', { class: 'pix', src: iconURL(f.id), alt: '' }), el('span', { class: 'n' }, String(f.n)),
      ]);
      b.onclick = () => { if (i >= 0) selectSlot('bag', i, grid.querySelector(`.inv-slot[data-c="bag"][data-i="${i}"]`)); };
      row.append(b);
    }
    if (!foods.length) row.append(el('span', { class: 'bp-none' }, 'No food packed.'));
    snack.append(row);
    front.append(snack);
    return front;
  };

  const coopMood = () => Inv.henMood(st);
  // Nugget in her round window: the live 3D hen (src/gfx/portrait3d.js), kept across re-renders
  const henBox = el('div', { class: 'bp-hen', title: st.data.chicken?.name || 'Nugget' });
  let hen3d = null, henMoodNow = null;
  const henFace = (mood) => {
    if (!hen3d || hen3d.disposed) {
      const small = window.matchMedia?.('(max-height: 500px)').matches;
      henBox.textContent = '';
      hen3d = portrait3d.mount(henBox, 'nugget', { size: small ? 20 : 30, backdrop: 'coop' });
      henMoodNow = null;
    }
    if (mood !== henMoodNow) { henMoodNow = mood; hen3d.set({ happy: 'happy', ok: 'calm', peckish: 'worried', hungry: 'sad' }[mood] || 'calm'); }
    return henBox;
  };
  const renderCoop = () => {
    const d = st.data.coop;
    const mood = coopMood();
    const food = clamp(d.food ?? 0, 0, 1);
    const name = st.data.chicken?.name || 'Nugget';
    const moodTxt = { happy: 'Happy and well fed', ok: 'Content', peckish: 'Peckish. Clucking at you.', hungry: 'Hungry! Sulking, won\'t budge.' }[mood];
    const portrait = henFace(mood);
    const meter = el('div', { class: 'bp-food', title: `${Math.round(food * 100)}% fed` }, [el('i', { style: { width: (food * 100).toFixed(1) + '%' } })]);
    const bowl = el('button', { class: 'bp-bowl', 'data-drop': 'feed', title: `Feed ${name} (drop feed, worms, grubs or seeds here)`, 'aria-label': `Feed ${name}`, onclick: () => feedBest() }, [
      el('img', { class: 'pix', src: INV_ART.bowl(Math.round(food * 4)), alt: '' }), el('span', {}, 'Feed'),
    ]);
    const slots = Inv.coopSlots(st);
    const cg = el('div', { class: 'bp-cgrid' });
    slots.forEach((s, i) => cg.append(slotEl(s, { c: 'coop', i, frame: 'cubby', hide: dnd?.heldFrom('coop', i) || 0, sel: selKey === `slot:coop:${i}` })));
    const CL = Inv.coopLoad(st);
    const load = el('div', { class: 'bp-coop-load ' + CL.tier, title: `Her legs carry ${CL.carry.toFixed(0)} kg comfortably; a heavy coop walks slower and hops lower.` }, [
      el('span', { html: `Load <b>${CL.kg.toFixed(1)}</b>/${CL.carry.toFixed(0)} kg` }),
      el('i', { class: 'bp-scale-bar' }, [el('i', { style: { width: (clamp(CL.r / 1.5, 0, 1) * 100).toFixed(1) + '%', background: W.TIER_COLOR[CL.tier] } })]),
      el('button', { class: 'btn alt sm', title: 'Move ore, ingots and other heavy things from your pack onto her shelves', onclick: () => unloadHeavy() }, 'Unload ore'),
    ]);
    const coop = el('div', { class: 'bp-coop' }, [
      el('div', { class: 'bp-coop-head' }, [portrait, el('div', {}, [el('b', {}, `${name}'s Coop`), el('small', {}, moodTxt), meter])]),
      el('div', { class: 'bp-coop-feed' }, [bowl, el('small', {}, henFoodLine())]),
      el('div', { class: 'bp-coop-shelf' }, [el('div', { class: 'bp-coop-sign' }, [el('span', {}, `Shelves ${Inv.usedSlots(slots)}/${slots.length}`), el('button', { class: 'bp-tool sm', title: 'Tidy the shelves', 'aria-label': 'Tidy the shelves', onclick: () => tidy('coop') }, [el('img', { class: 'pix', src: INV_ART.brush(), alt: '' })])]), cg]),
      load,
      renderUpgrades(),
    ]);
    return coop;
  };
  /** The coop's upgrades: a row per track, level pips, and Install when you carry the next part. */
  const renderUpgrades = () => {
    const lv = W.coopLevels(st);
    const box = el('div', { class: 'bp-ups' }, [el('div', { class: 'bp-coltitle' }, 'Build onto the coop')]);
    for (const track of W.COOP_TRACKS) {
      const T = W.COOP_UP[track], L = lv[track], max = T.levels.length - 1;
      const nx = Inv.nextPart(st, track);
      const pips = el('span', { class: 'bp-up-pips' }, Array.from({ length: max }, (_, k) => el('i', { class: k < L ? 'on' : '' })));
      const row = el('div', { class: 'bp-up' + (nx?.have ? ' ready' : '') }, [
        el('img', { class: 'pix', src: iconURL(nx ? nx.id : Object.keys(COOP_PARTS).filter((id) => COOP_PARTS[id].track === track).pop()), alt: '' }),
        el('div', {}, [el('b', {}, T.name), pips, el('small', { html: nx ? (nx.have ? `<b>${nx.part.name}</b> ready to fit` : `Next: <b>${nx.part.name}</b> · forge it at home (${Object.entries(nx.part.ingots).map(([id, n]) => `${n}× ${ITEMS[id]?.name || id}`).join(', ')}${nx.part.extra ? ', ' + Object.entries(nx.part.extra).map(([id, n]) => `${n}× ${ITEMS[id]?.name || id}`).join(', ') : ''})`) : 'All built.' })]),
        nx?.have ? el('button', { class: 'btn sm', onclick: () => install(nx.id) }, 'Install') : null,
      ]);
      row.title = T.desc;
      box.append(row);
    }
    return box;
  };
  const henFoodLine = () => {
    const g = st.inventory(henFood);
    if (!g.length) return 'No hen food packed. Worms, grubs, seeds or a sack of feed.';
    return g.map((x) => `${x.n}× ${ITEMS[x.id].name}`).slice(0, 3).join(' · ');
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
    const node = side === 'coop' ? renderCoop() : side === 'trunk' ? renderTrunk() : renderFront();
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
    if (d === 'coop' && c !== 'coop') {
      // her legs only carry so much: whole swaps are fine if they don't make her heavier
      const s0 = from[i], tj = j >= 0 ? to[j] : null;
      const room = Inv.coopRoomKg(st, s0.id) + (tj && !Inv.sameKind(tj, s0) ? Math.floor(W.stackKg(tj) / Math.max(0.01, W.kgOf(s0.id))) : 0);
      if (room <= 0) { heavyToast(); return 0; }
      k = Math.min(k, room);
    }
    const moved = Inv.transfer(st, from, i, to, j, k, cap === Infinity ? to.length + 99 : cap);
    if (d === 'trunk' || c === 'trunk') { while (to.length && !to[to.length - 1]) to.pop(); while (from.length && !from[from.length - 1] && c === 'trunk') from.pop(); }
    if (moved > 0 && (c === 'coop' || d === 'coop')) nug?.coopTouched?.(d === 'coop' ? 'in' : 'out');
    return moved;
  };
  const other = (c) => (c === 'bag' ? (side === 'coop' ? 'coop' : side === 'trunk' ? 'trunk' : null) : 'bag');

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

  /** Feed Nugget one helping from slot (c, i), or the best hen food carried. */
  const feed = (c, i) => {
    const s = c ? slotsOf(c)?.[i] : null;
    const id = s ? s.id : null;
    if (s && !henFood(ITEMS[id])) { sfx('nope'); ui.toast(`${st.data.chicken?.name || 'Nugget'} won't eat ${stackName(s)}.`, { kind: 'warn', dur: 1800 }); return; }
    const r = Inv.feedHen(st, id, c === 'coop' ? 'coop' : 'bag');
    if (!r.ok) { sfx('nope'); ui.toast(r.reason, { kind: 'warn', dur: 2000 }); return; }
    audio.play('cluck', { n: 3, pitch: 1.15 });
    audio.play('eat');
    nug?.fed?.(r.id, r);
    const bowlEl = root.querySelector('.bp-bowl');
    bounce(bowlEl, 'gulp');
    closeTag();
    render(false);
  };
  const feedBest = () => feed(null, -1);

  let heavyT = 0;
  const heavyToast = () => {
    if (performance.now() - heavyT < 1500) return;
    heavyT = performance.now();
    ui.toast(`<b>${st.data.chicken?.name || 'Nugget'}'s legs are buckling!</b> The coop can't carry more. Fit stronger legs (forge them at home).`, { kind: 'warn', dur: 2600 });
  };
  /** Ore, ingots and the other heavy things from the pack onto her shelves, heaviest first. */
  const unloadHeavy = () => {
    const bagS = Inv.bag(st), coopS = Inv.coopSlots(st);
    const order = bagS.map((s, i) => [s, i]).filter(([s]) => s && !s.w && (ITEMS[s.id]?.cat === 'mineral' || ITEMS[s.id]?.cat === 'ingot' || ITEMS[s.id]?.cat === 'part' || W.kgOf(s.id) >= 0.8));
    order.sort((a, b) => W.stackKg(b[0]) - W.stackKg(a[0]));
    let moved = 0, stopped = false;
    for (const [s, i] of order) {
      const room = Inv.coopRoomKg(st, s.id);
      if (room <= 0) { stopped = true; continue; }
      moved += Inv.transfer(st, bagS, i, coopS, -1, room, coopS.length);
    }
    if (moved > 0) { sfx('tidy'); audio.play('cluck', { n: 2 }); nug?.coopTouched?.('in'); }
    else sfx('nope');
    if (stopped) heavyToast();
    else if (!moved) ui.toast('Nothing heavy to unload (or her shelves are full).', { kind: 'warn', dur: 1800 });
    closeTag();
    render(false);
  };
  /** Build a part onto the coop (the hammering is quick; the coop shows it at once). */
  const install = (id, from = 'bag') => {
    const has = Inv.countIn(Inv.bag(st), id) > 0 ? 'bag' : Inv.countIn(Inv.coopSlots(st), id) > 0 ? 'coop' : from;
    const r = Inv.installPart(st, id, { from: has });
    if (!r.ok) { sfx('nope'); ui.toast(r.reason, { kind: 'warn', dur: 2000 }); return; }
    for (let k = 0; k < 4; k++) audio.play('hit', { snd: 'metal', vol: 0.5, delay: k * 0.14 });
    audio.play('ui_buy');
    const T = W.COOP_UP[r.track];
    const what = r.track === 'shelves' ? `The coop holds ${Inv.coopSlots(st).length} now.` : r.track === 'legs' ? `She carries about ${W.coopCarry(st).toFixed(0)} kg now.` : r.track === 'nest' ? 'She\'ll lay more often.' : r.track === 'chute' ? 'When your pack is full or too heavy, what you dig rolls onto her shelves.' : 'Her roof lantern lights the way.';
    ui.toast(`<b>${r.name}</b> fitted! ${T.name} ${r.level}. ${what}`, { kind: 'good', icon: iconURL(id), dur: 3200 });
    nug?.coopTouched?.('install', r);
    closeTag();
    render(false);
    const nodes = root.querySelectorAll('.bp-up');
    nodes.forEach((n) => bounce(n, 'tidied'));
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

  const tagHead = (icon, name, kind, extra) => el('div', { class: 'bp-tag-head' }, [
    el('div', { class: 'bp-tag-icon' }, [el('img', { class: 'pix', src: icon, alt: '' })]),
    el('div', {}, [el('small', {}, kind), el('b', {}, name), extra || null]),
  ]);
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
    if (it.hen) info.push(`Nugget eats it: fills her <b>${Math.round(it.hen * 100)}%</b>`);
    info.push(`${n} in this ${c === 'bag' ? 'pocket' : c === 'coop' ? 'cubby' : 'slot'} · stacks to ${Inv.stackMax(s.id)}`);
    info.push(`Weighs <b>${W.kgOf(s.id) < 0.1 ? W.kgOf(s.id).toFixed(2) : W.kgOf(s.id).toFixed(1)} kg</b>${n > 1 ? ` each (${W.stackKg(s).toFixed(1)} kg here)` : ''}`);
    const part = COOP_PARTS[s.id];
    if (part) {
      const L = W.coopLevels(st)[part.track];
      info.push(part.level <= L ? 'The coop already has this.' : part.level > L + 1 ? `Fits after the ${W.COOP_UP[part.track].name.toLowerCase()} level ${part.level - 1} part.` : `Fits the coop now: <b>${W.COOP_UP[part.track].name} ${part.level}</b>.`);
    }
    const actions = el('div', { class: 'bp-actions' });
    if (c === 'bag' && (it.cat === 'food' || (it.food && game.scene?.allowEatRaw !== false))) {
      actions.append(el('button', { class: 'btn', onclick: () => { game.eat(s.id); render(); refreshTag(); } }, it.cat === 'food' ? 'Eat' : 'Eat raw'));
    }
    if (it.hen && st.flag('nugget') && (side === 'coop' || nug)) actions.append(el('button', { class: 'btn', onclick: () => feed(c, i) }, 'Feed Nugget'));
    if (part && st.flag('nugget') && coopNear() && part.level === W.coopLevels(st)[part.track] + 1) actions.append(el('button', { class: 'btn', onclick: () => install(s.id, c) }, 'Install on the coop'));
    const to = other(c);
    if (to) actions.append(el('button', { class: 'btn alt', onclick: () => { const m = move(c, i, to, -1, Infinity); sfx(m > 0 ? 'drop' : 'nope'); closeTag(); render(); } }, to === 'bag' ? 'Take' : to === 'coop' ? 'To the coop' : 'To the trunk'));
    if (n > 1) actions.append(el('button', { class: 'btn alt', title: 'Take half into your paw (right-click or long-press)', onclick: () => { closeTag(); dnd.hand = { c, i, k: Math.ceil(n / 2) }; dnd.ghostFor(s, Math.ceil(n / 2)); const r = grid.getBoundingClientRect(); dnd.showGhost(r.left + r.width / 2, r.top + 30); sfx('split'); render(); } }, 'Split'));
    actions.append(el('button', { class: 'btn alt danger', onclick: () => tossStack(c, i, n) }, 'Toss'));
    put(tag,
      tagClose(),
      tagHead(stackIcon(s), it.name, CAT_LABEL[it.cat] || it.cat, q !== null ? pips(q, Inv.stackPristine(s)) : null),
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
    if (to) actions.append(el('button', { class: 'btn alt', onclick: () => { const m = move(c, i, to, -1, 1); sfx(m > 0 ? 'drop' : 'nope'); closeTag(); render(); } }, to === 'bag' ? 'Take' : to === 'coop' ? 'To the coop' : 'To the trunk'));
    actions.append(el('button', { class: 'btn alt danger', onclick: () => tossStack(c, i, 1) }, 'Toss'));
    put(tag,
      tagClose(),
      tagHead(stackIcon({ w }), w.name, 'Forged weapon', el('span', { class: 'bp-grade', style: { color: g.color, borderColor: g.color } }, `Grade ${g.g}`)),
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
        el('img', { class: 'pix', src: iconURL(id), alt: '' }), el('span', {}, ITEMS[id].name),
        el('button', { class: 'btn', onclick: () => {
          if (!st.equip(id)) { sfx('nope'); ui.toast('Empty some pockets first: that bag is smaller.', { kind: 'warn', dur: 2000 }); return; }
          audio.play('ui_click'); render(); reanchor(); showSlot(slot, label, sample);
        } }, 'Equip'),
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

  // ---------------------------------------------------------------- render
  const render = (animate = false) => {
    renderGrid(animate || firstRender);
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
    toss: (c, i, k) => tossStack(c, i, k),
    feed: (c, i) => feed(c, i),
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
  // the coop panel follows Nugget's mood while open
  let lastMood = coopMood();
  const moodTick = setInterval(() => { if (side === 'coop' && tag.hidden && !dnd.hand && !dnd.drag) { const m = coopMood(); if (m !== lastMood) { lastMood = m; renderSide(false); } } }, 1000);

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
      clearInterval(moodTick);
      clearTimeout(tipT);
      dnd.destroy();
      hen3d?.dispose();
      nug?.coopClosed?.();
    },
  });
  h.onEscape = () => {
    if (dnd.cancelHand()) return true;
    if (!tag.hidden) { closeTag(); return true; }
    return false;
  };
  window.addEventListener('keydown', onKey);
  if (side === 'coop') nug?.coopOpened?.();
  // test hooks
  h.inv = {
    root, side: () => side, setSide: (k) => { side = k; renderSide(true); },
    move: (c, i, d, j, k) => { const m = move(c, i, d, j, k); render(); return m; },
    select: (c, i) => selectSlot(c, i, root.querySelector(`.inv-slot[data-c="${c}"][data-i="${i}"]`)),
    split: (c, i) => { const s = slotsOf(c)?.[i]; if (!s) return; dnd.hand = { c, i, k: Math.ceil(Inv.stackN(s) / 2) }; dnd.ghostFor(s, dnd.hand.k); render(); },
    tidy, feed: (c, i) => feed(c, i), toss: (c, i, k = 99) => tossStack(c, i, k), dnd,
  };
  return h;
}
