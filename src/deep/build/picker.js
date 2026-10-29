// The builder's board (R, or tapping the build slot again): a wooden board under a hanging sign,
// two tabs. "Blocks": every block in little wooden crates with its count, the shape tokens for the
// chosen block (block, slab, stairs, post, pane, drawn as tiny isometric pieces), a chalk slate that
// says what it's for or where to get it, and the Gather lever (keep blocks from what you dig).
// "Craft": recipe cards (what goes in, what comes out, a Make stamp); workbench recipes wait for a
// workbench within reach. Also the chest: the chest's straw-lined boxes above your pockets, moved
// with the backpack's own drag & drop (drag, double-tap to send across, long-press for half).
//
//   openPicker(build, { tab: 'blocks' | 'craft', bench }) → panel handle
//   openChest(build, chest, key) → panel handle
import { el } from '../../core/util.js';
import { iconURL } from '../../gfx/PixelArt.js';
import { ITEMS } from '../../data/items.js';
import * as Inv from '../../core/inventory.js';
import { slotEl, SlotDnD, bounce } from '../../ui/invGrid.js';
import { installInvArt } from '../../ui/invArt.js';
import { BLOCKS, SHAPES, shapeHas } from './blocks.js';
import { blockColors } from './models.js';
import { RECIPES, canCraft, craft } from './craft.js';
import './build.css';

const HOW = {
  blk_cobble: 'Dig stone: you keep cobble as you go.', blk_dirt: 'Dig soil: you keep dirt as you go.', blk_log: 'Dig roots, mushroom stalks or old timber (an axe is quicker).',
  blk_planks: 'Craft: a log makes four.', blk_torch: 'Craft: a stick and a lump of coal make four.', blk_ladder: 'Craft at a workbench from sticks.',
  blk_stonebrick: 'Craft at a workbench from cobble.', blk_glass: 'Craft at a workbench: sand over coal.', blk_bricks: 'Craft at a workbench: clay over coal.',
  blk_door: 'Craft at a workbench from planks.', blk_chest: 'Craft at a workbench from planks.', blk_lantern: 'Craft at a workbench: a torch and an iron ingot.',
  blk_workbench: 'Craft: four planks. Put it down and craft at it.',
};

// ------------------------------------------------------------------ tiny isometric shape glyphs
const glyphs = new Map();
/** A 30×30 isometric drawing of a shape in a block's colours (4×4×4 cells). */
function shapeGlyph(block, shape) {
  const key = block.id + ':' + shape;
  if (glyphs.has(key)) return glyphs.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 30;
  const g = c.getContext('2d');
  const T = blockColors(block.m).map((v) => '#' + v.toString(16).padStart(6, '0'));
  const o = { top: false, dir: 3, axis: shape === 'pane' ? 'z' : 'y' };
  const has = (x, y, z) => shapeHas(shape, o, x * 2 + 1, y * 2 + 1, z * 2 + 1);
  const S = 3; // px per cell edge (iso: 2S wide, S tall top)
  const px = (x, y, z) => [15 + (x - z) * S, 17 + (x + z) * S * 0.5 - y * S * 1.2];
  for (let s = 0; s < 12; s++) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const z = s - x; // back to front
    if (z < 0 || z > 3 || !has(x, y, z)) continue;
    const [X, Y] = px(x, y, z);
    // top
    g.fillStyle = T[3]; g.beginPath(); g.moveTo(X, Y - S * 1.2); g.lineTo(X + S, Y - S * 0.7); g.lineTo(X, Y - S * 0.2); g.lineTo(X - S, Y - S * 0.7); g.fill();
    // left / right
    g.fillStyle = T[2]; g.beginPath(); g.moveTo(X - S, Y - S * 0.7); g.lineTo(X, Y - S * 0.2); g.lineTo(X, Y + S); g.lineTo(X - S, Y + S * 0.5); g.fill();
    g.fillStyle = T[1]; g.beginPath(); g.moveTo(X + S, Y - S * 0.7); g.lineTo(X, Y - S * 0.2); g.lineTo(X, Y + S); g.lineTo(X + S, Y + S * 0.5); g.fill();
  }
  const url = c.toDataURL();
  glyphs.set(key, url);
  return url;
}

function board(title, body, cls = '') {
  return el('div', { class: 'bd ' + cls }, [
    el('div', { class: 'bd-sign' }, [el('i', { class: 'bd-chain l' }), el('i', { class: 'bd-chain r' }), el('h2', {}, title)]),
    el('div', { class: 'bd-board' }, body),
  ]);
}

// ------------------------------------------------------------------ the picker
export function openPicker(build, o = {}) {
  const ui = build.ui, st = build.st, au = build.audio;
  let tab = o.tab === 'craft' ? 'craft' : 'blocks';
  const bench = !!o.bench;
  const tabs = el('nav', { class: 'bd-tabs', role: 'tablist' });
  const pane = el('div', { class: 'bd-pane' });
  const foot = el('div', { class: 'bd-foot' });
  const root = board('Building', [tabs, pane, foot]);
  const h = ui.openPanel({ body: root, className: 'bd-panel', title: '' });
  root.closest('.panel')?.querySelector(':scope > h2')?.remove();

  const renderTabs = () => {
    tabs.innerHTML = '';
    const nMake = RECIPES.filter((r) => canCraft(st, r, { bench }).ok).length;
    for (const [k, label] of [['blocks', 'Blocks'], ['craft', 'Craft']]) {
      tabs.append(el('button', {
        class: 'bd-tab' + (tab === k ? ' on' : ''), role: 'tab', 'aria-selected': tab === k ? 'true' : 'false', type: 'button',
        onclick: () => { if (tab === k) return; tab = k; au.play('page'); render(); },
      }, [label, k === 'craft' && nMake ? el('b', { class: 'bd-badge' }, String(nMake)) : null]));
    }
  };

  const renderBlocks = () => {
    const grid = el('div', { class: 'bd-grid' });
    const sel = build.block;
    BLOCKS.forEach((b, i) => {
      const it = ITEMS[b.item];
      const n = st.count(b.item);
      const freeB = build.freeBuild() && build.block.kind === 'ladder' && b.kind === 'ladder';
      const tile = el('button', {
        class: 'bd-tile' + (b.id === sel.id ? ' on' : '') + (n || freeB ? '' : ' none'), type: 'button', 'data-id': b.id, title: it?.name || b.id,
        style: { '--d': i * 18 + 'ms' },
        onclick: () => {
          if (b.id === build.block.id) { h.close(); return; }
          build.select(b.id);
          render();
        },
      }, [
        el('span', { class: 'bd-crate' }, [el('img', { class: 'pix', src: iconURL(b.item), alt: '', draggable: 'false' })]),
        el('span', { class: 'bd-name' }, it?.name || b.id),
        el('span', { class: 'bd-n' + (n ? '' : ' zero') }, freeB ? '∞' : String(n)),
      ]);
      grid.append(tile);
    });
    pane.append(grid);
    // shapes for the chosen block
    if (sel.shapes?.length > 1) {
      const row = el('div', { class: 'bd-shapes' }, [el('span', { class: 'bd-lab' }, 'Shape')]);
      const cur = build.shapeOf(sel);
      for (const sh of sel.shapes) {
        row.append(el('button', {
          class: 'bd-shape' + (sh === cur ? ' on' : ''), type: 'button', title: SHAPES[sh].hint,
          onclick: () => { build.setShape(sh); au.play('ui_click', { pitch: 1.2 }); render(); },
        }, [el('img', { src: shapeGlyph(sel, sh), alt: '' }), el('span', {}, sh === 'post' && (sel.id === 'log' || sel.id === 'planks') ? 'Post / beam' : SHAPES[sh].name)]));
      }
      pane.append(row);
    }
  };

  const renderCraft = () => {
    const list = el('div', { class: 'bd-recipes' });
    if (!bench) list.append(el('p', { class: 'bd-note' }, 'Cards with a bench on them need a workbench close by. Craft one (four planks) and put it down.'));
    RECIPES.forEach((r, i) => {
      const it = ITEMS[r.out];
      const c = canCraft(st, r, { bench });
      const needs = Object.entries(r.needs).map(([id, n]) => el('span', { class: 'bd-need' + (st.count(id) >= n ? '' : ' miss'), title: `${ITEMS[id]?.name || id}: have ${st.count(id)}` }, [
        el('img', { class: 'pix', src: iconURL(id), alt: '' }), el('b', {}, `${n}`), el('small', {}, ITEMS[id]?.name || id),
      ]));
      const card = el('div', { class: 'bd-card' + (c.ok ? ' ok' : '') + (r.bench && !bench ? ' far' : ''), style: { '--d': i * 22 + 'ms' } }, [
        el('div', { class: 'bd-out' }, [el('img', { class: 'pix', src: iconURL(r.out), alt: '' }), r.n > 1 ? el('b', {}, '×' + r.n) : null]),
        el('div', { class: 'bd-txt' }, [
          el('strong', {}, it?.name || r.out),
          el('small', {}, c.owned ? 'You have one' : r.hint),
          el('div', { class: 'bd-needs' }, needs),
        ]),
        r.bench ? el('i', { class: 'bd-bench', title: 'At a workbench' }, [el('img', { class: 'pix', src: iconURL('blk_workbench'), alt: '' })]) : null,
        el('button', {
          class: 'bd-make', type: 'button', disabled: !c.ok,
          onclick: (e) => {
            const res = craft(st, r, { bench });
            if (!res.ok) { au.play('ui_error'); bounce(e.currentTarget.closest('.bd-card'), 'shake'); return; }
            au.play('chop', { vol: 0.5 }); au.play('ui_buy');
            build.owner?.updateHotbar?.();
            render();
            const again = pane.querySelectorAll('.bd-card')[i];
            again?.classList.add('made');
          },
        }, 'Make'),
      ]);
      list.append(card);
    });
    pane.append(list);
  };

  const renderFoot = () => {
    foot.innerHTML = '';
    const sel = build.block, it = ITEMS[sel.item], n = st.count(sel.item);
    const say = tab === 'blocks' ? (n || build.freeBuild() ? sel.hint || SHAPES[build.shapeOf(sel) || 'block']?.hint || it?.desc : HOW[sel.item] || it?.desc) : bench ? 'At the workbench: everything can be made here.' : 'Paw recipes work anywhere.';
    foot.append(
      el('p', { class: 'bd-slate' }, [el('b', {}, it?.name || ''), ' ', say || '']),
      el('button', {
        class: 'bd-lever' + (build.data.gather ? ' on' : ''), type: 'button', title: 'Keep a block now and then from the rock and soil you dig (never your last pocket, never too heavy)',
        onclick: () => { build.data.gather = !build.data.gather; au.play('click'); renderFoot(); },
      }, [el('i'), el('span', {}, build.data.gather ? 'Gather: on' : 'Gather: off')]),
      el('button', { class: 'bd-done', type: 'button', onclick: () => h.close() }, 'Build!'),
    );
  };

  const render = () => {
    renderTabs();
    pane.innerHTML = '';
    pane.dataset.tab = tab;
    if (tab === 'blocks') renderBlocks(); else renderCraft();
    renderFoot();
  };
  render();
  h.debug = { tab: (k) => { tab = k; render(); }, root };
  return h;
}

// ------------------------------------------------------------------ the chest
const CHEST_SLOTS = 18;
export function openChest(build, chest, key) {
  const ui = build.ui, st = build.st, au = build.audio;
  chest.slots ||= [];
  while (chest.slots.length < CHEST_SLOTS) chest.slots.push(null);
  const cgrid = el('div', { class: 'bd-cgrid', role: 'grid', 'aria-label': 'Chest' });
  const bgrid = el('div', { class: 'bd-cgrid bag', role: 'grid', 'aria-label': 'Your pockets' });
  const btns = el('div', { class: 'bd-cbtns' });
  const wrap = el('div', { class: 'bd-chest' }, [
    el('div', { class: 'bd-chest-in' }, [cgrid]),
    btns,
    el('div', { class: 'bd-chest-bag' }, [el('small', {}, 'Your pockets'), bgrid]),
  ]);
  const root = board('Chest', [wrap], 'bd-chestp');
  installInvArt(root);
  const h = ui.openPanel({ body: root, className: 'bd-panel', title: '' });
  const slotsOf = (c) => (c === 'chest' ? chest.slots : c === 'bag' ? Inv.bag(st) : null);
  const capOf = (c) => (c === 'chest' ? CHEST_SLOTS : Inv.bagSlots(st));
  const render = () => {
    cgrid.innerHTML = ''; bgrid.innerHTML = '';
    chest.slots.forEach((s, i) => cgrid.append(slotEl(s, { c: 'chest', i, frame: 'trunk', hide: dnd?.heldFrom('chest', i) || 0 })));
    const bag = Inv.bag(st), cap = Inv.bagSlots(st);
    for (let i = 0; i < cap; i++) bgrid.append(slotEl(bag[i] || null, { c: 'bag', i, frame: 'pocket', hide: dnd?.heldFrom('bag', i) || 0 }));
    btns.innerHTML = '';
    btns.append(
      el('button', { class: 'bd-cbtn', type: 'button', onclick: () => { moveAll('bag', 'chest'); } }, 'Store all ▲'),
      el('button', { class: 'bd-cbtn', type: 'button', onclick: () => { moveAll('chest', 'bag'); } }, 'Take all ▼'),
    );
  };
  const move = (c, i, d, j, k) => {
    const from = slotsOf(c), to = slotsOf(d);
    if (!from || !to) return 0;
    const cap = capOf(d);
    if (j >= 0 && j >= cap) return 0;
    const moved = Inv.transfer(st, from, i, to, j, k, cap);
    if (moved) { build.owner?.updateHotbar?.(); build.owner?.showBag?.(); }
    return moved;
  };
  const moveAll = (c, d) => {
    let n = 0;
    const from = slotsOf(c);
    for (let i = 0; i < capOf(c); i++) if (from[i]) n += move(c, i, d, -1, Infinity);
    au.play(n ? 'place' : 'ui_error');
    render();
  };
  const sfx = (k) => { if (k === 'nope') au.play('ui_error'); else if (k === 'lift') au.play('ui_click', { pitch: 1.3 }); else au.play('place', { vol: 0.6 }); };
  let dnd = null;
  dnd = new SlotDnD({
    root: wrap,
    slots: slotsOf,
    cap: capOf,
    other: (c) => (c === 'chest' ? 'bag' : 'chest'),
    move,
    toss: () => 0,
    feed: () => 0,
    select: () => {},
    hover: () => {},
    changed: () => render(),
    sfx,
  });
  render();
  const prevClose = h.onClose;
  h.onClose = () => { dnd?.destroy?.(); prevClose?.(); build.st.emit('items', { id: 'chest', n: 0 }); };
  h.debug = { move, moveAll, chest, key };
  return h;
}
