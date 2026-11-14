// Forge menus (DOM in the scene's layer), each one a thing in the smithy:
//   main()       the order board: a chalkboard on chains with pinned cards (1 smelt, 2 forge)
//   smeltList()  the smith's ledger: a leather notebook, one inked entry per recipe, riveted forge-plate buttons
//   plan()       the weapon blueprint: chalk boxes for the plan, metal tokens, the drawing in the middle
// Styles: forge.css, art: forgeArt.js.
import { el, formatGoldFull } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { SMELTING, METALS, WEAPON_TYPES, INFUSIONS, SOCKET_GEMS, FORGE_MAX_TEMP, weaponValue, GRADES } from '../data/weapons.js';
import { FORGE_PIECES, pieceOf } from '../data/forgePieces.js';
import { iconURL, weaponIconURL } from '../gfx/PixelArt.js';
import { itemVox } from '../ui/itemVox.js'; // recipes and plans as 3D voxel art
import { qColor } from '../ui/UI.js';
import { smeltStatus, quickSmelt, SmeltGame } from './smelt.js';
import { ForgeRun } from './forging.js';
import { PartRun, partStatus } from './parts.js';
import { fart, token } from './forgeArt.js';
import { bart, inkWeaponURL } from './forgeBookArt.js';
import { cssUrl } from '../ui/uiArt.js';
import { wart } from './workArt.js';

const HEARTH_NAMES = ['Coal hearth', 'Coal hearth, double bellows', 'Magma hearth'];
const NEED_WORDS = {
  zap: 'Needs rubber gloves',
  heat: 'Needs heat-proof mitts',
  cold: 'Needs frost gauntlets',
};
const GEM_HEX = { quartz: 0xf2f2f8, amber: 0xf2a32c, amber_bug: 0xf2a32c, amethyst: 0xa05ad9, ruby: 0xe02a3a, emerald: 0x2ad96a, sapphire: 0x2a5ae0, diamond: 0xd8f6ff };

export function avgQ(lots) {
  return lots.length ? Math.round(lots.reduce((s, l) => s + l.q, 0) / lots.length) : 0;
}

/** Best-quality lots of an item, n of them. */
export function bestLots(state, id, n) {
  return state.lotsOf(id).slice().sort((a, b) => b.q - a.q).slice(0, n);
}

const kbd = (k) => el('kbd', {}, k);
const img = (src, cls = 'pix', style = null) => el('img', { class: cls, src, alt: '', style });
const isTouch = () => document.documentElement.classList.contains('is-touch');
/** A handwritten link (back / leave), with a little glyph in front. */
const link = (label, key, on, glyph = null) => el('button', { class: 'sm-link', onclick: on }, [glyph ? img(wart.glyph(glyph), 'pix sm-lg') : null, label, key && !isTouch() ? kbd(key) : null]);
/** A picture with a number on it (counts, have/need, quality). */
const badge = (src, n, cls = '', tip = '') => el('span', { class: 'sm-cnt ' + cls, title: tip }, [img(src), el('b', {}, String(n))]);

export class Menus {
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
    this.state = scene.game.state;
    this.panel = null;
    this.mode = 'hidden';
    this.sel = { type: null, metal: null, infusion: null, gem: null };
    this.lastSmelt = null;
    this.unsub = this.state.on('items', () => {
      if (this.mode === 'smelt') this.smeltList(true);
      else if (this.mode === 'main') this.main(true);
    });
  }

  dispose() { this.unsub?.(); this.hide(); }

  hide() {
    if (this.panel) this.panel.remove();
    this.panel = null;
    const was = this.mode;
    this.mode = 'hidden';
    this.keyHandler = null;
    if (was !== 'hidden') this.scene.menuChanged?.('hidden');
  }

  show(node, mode) {
    if (this.panel) this.panel.remove();
    this.panel = node;
    const was = this.mode;
    this.mode = mode;
    this.scene.layer.append(node);
    if (was !== mode) this.scene.menuChanged?.(mode);
  }

  /** Close a sub-menu: back to the board if it came from there, else back to the smithy. */
  back() {
    this.game.audio.play('ui_close');
    if (this.from === 'main') this.main(); else this.hide();
  }

  onEscape() {
    if (this.mode === 'main') { this.scene.leave(); return true; }
    if (this.mode === 'smelt' || this.mode === 'plan') { this.back(); return true; }
    return false;
  }

  // ---------------------------------------------------------------- test helpers (scene.debug)
  debugSmelt(id) {
    const r = SMELTING.find((x) => x.id === id) || SMELTING[0];
    if (!smeltStatus(this.state, r).ok) return 'cannot smelt ' + r.id + ': ' + smeltStatus(this.state, r).why;
    this.startSmelt(r);
    return 'smelting ' + r.id;
  }

  debugForge(sel = {}) {
    const opt = this.planOptions();
    this.sel.type = sel.type || this.sel.type || opt.types[0] || null;
    const o2 = this.planOptions();
    const usable = o2.metals.filter((m) => !m.why);
    this.sel.metal = sel.metal || usable.sort((a, b) => ITEMS[b.m.ingot].value - ITEMS[a.m.ingot].value)[0]?.id || null;
    this.sel.infusion = sel.infusion || null;
    this.sel.gem = sel.gem || null;
    if (!this.sel.type || !this.sel.metal) return 'nothing to forge';
    this.startForge();
    return 'forging ' + this.sel.metal + ' ' + this.sel.type;
  }

  /** Rows of the forge pieces (scene.debug.part / pieces). */
  pieceRows() {
    return Object.keys(FORGE_PIECES).map((id) => {
      const s = partStatus(this.state, id);
      return { id, name: s.p.name, status: s.done ? 'made' : s.ok ? 'ready' : 'locked', why: s.why, need: Object.fromEntries(s.ins.map((x) => [x.id, x.n])), have: Object.fromEntries(s.ins.map((x) => [x.id, x.have])), works: s.m.work, hot: s.hot };
    });
  }

  update() {
    const inp = this.game.input;
    if (!this.keyHandler || this.game.ui.isPanelOpen()) return;
    for (const code of ['Digit1', 'Digit2', 'Enter']) if (inp.pressed(code)) { inp.consume(code); this.keyHandler(code); break; }
  }

  // ---------------------------------------------------------------- the order board (hub)
  main(refresh = false) {
    const st = this.state, d = st.data;
    const lvl = d.forgeLevel || 0;
    const ingotIds = Object.values(METALS).map((m) => m.ingot);
    const ingots = ingotIds.reduce((s, id) => s + st.count(id), 0);
    const bestIngot = ingotIds.filter((id) => st.count(id) > 0).sort((a, b) => st.count(b) - st.count(a))[0] || 'copper_ingot';
    const oreIds = [...new Set(SMELTING.flatMap((r) => Object.keys(r.inputs)))];
    const ores = oreIds.reduce((s, id) => s + st.count(id), 0);
    const bestOre = oreIds.filter((id) => st.count(id) > 0).sort((a, b) => st.count(b) - st.count(a))[0] || 'copper_ore';
    const plans = Object.keys(WEAPON_TYPES).filter((t) => st.owns('bp_' + t)).length;
    const forged = d.weapons.length;
    // two pinned cards, each a big picture, one word and what you have for it (pictures and numbers)
    const card = (icon, title, counts, key, on, r, tack, delay) => el('button', {
      class: 'sm-card', style: `--r:${r}deg;--tack:var(--fa-${tack});--d:${delay}s`,
      onclick: (e) => { e.currentTarget.classList.add('thud'); this.game.audio.play('ui_click'); on(); },
    }, [img(icon), el('span', {}, [el('b', {}, title), el('span', { class: 'sm-cnts' }, counts)]), isTouch() ? null : kbd(key)]);
    const node = el('div', { class: 'sm-board interactive' + (refresh ? ' again' : '') }, [
      el('i', { class: 'sm-cord l' }), el('i', { class: 'sm-cord r' }),
      el('i', { class: 'fg-cap tl' }), el('i', { class: 'fg-cap tr' }), el('i', { class: 'fg-cap bl' }), el('i', { class: 'fg-cap br' }),
      img(fart('dAnvil'), 'pix sm-doodle', { right: 'calc(var(--px) * 3)', top: 'calc(var(--px) * 2)', width: 'calc(var(--px) * 30)', height: 'calc(var(--px) * 22)' }),
      img(fart('dSpark'), 'pix sm-doodle', { right: 'calc(var(--px) * 34)', top: 'calc(var(--px) * 4)', width: 'calc(var(--px) * 9)', height: 'calc(var(--px) * 9)' }),
      el('div', { class: 'sm-cards' }, [
        card(itemVox.src('copper_ingot'), 'Smelt', [badge(itemVox.src(bestOre), ores, ores ? '' : 'miss', 'Ore'), badge(itemVox.src('coal'), st.count('coal'), st.count('coal') ? '' : 'miss', 'Coal')], '1', () => this.smeltList(), -1.2, 'tackRed', 0.08),
        card(itemVox.weapon('shortsword', 'iron'), 'Forge', [badge(itemVox.src(bestIngot), ingots, ingots ? '' : 'miss', 'Ingots'), badge(itemVox.src('bp_dagger'), plans, '', 'Plans')], '2', () => this.plan(), 1, 'tackBlue', 0.16),
      ]),
      el('div', { class: 'sm-foot' }, [
        link('Look', null, () => { this.game.audio.play('ui_close'); this.hide(); }, 'eye'),
        forged ? badge(itemVox.weapon('dagger', 'bronze'), '×' + forged, 'sm-barrel', 'Forged, for the assay office') : null,
        link('Leave', 'Esc', () => this.scene.leave(), 'door'),
      ]),
      img(fart('sticks'), 'pix sm-sticks'),
      el('div', { class: 'sm-hsign', title: HEARTH_NAMES[lvl] || HEARTH_NAMES[0] }, [img(wart.glyph('flame'), 'pix sm-lg'), `${FORGE_MAX_TEMP[lvl]}°`]),
    ]);
    if (!refresh) this.game.audio.play('page');
    this.show(node, 'main');
    this.keyHandler = (code) => { if (code === 'Digit1') this.smeltList(); if (code === 'Digit2') this.plan(); };
  }

  // ---------------------------------------------------------------- the ledger (smelting)
  smeltList(refresh = false) {
    if (!refresh) this.from = this.mode === 'main' ? 'main' : this.mode === 'smelt' ? this.from : null;
    const st = this.state;
    const list = el('div', { class: 'sm-list sm-scroll' });
    const rows = SMELTING.map((r) => ({ r, s: smeltStatus(st, r) }));
    rows.sort((a, b) => (b.s.ok - a.s.ok) || (b.s.known - a.s.known));
    const unknown = { filter: 'brightness(0) opacity(.35)' };
    rows.forEach(({ r, s }, i) => {
      // ore + coal → ingot, in pictures: every input shows have/need (red when short)
      const f = el('div', { class: 'sm-formula' });
      for (const [id, n] of Object.entries(r.inputs)) {
        const have = st.count(id);
        const known = st.known('mineral', id) || have > 0;
        f.append(el('span', { class: 'sm-in' + (have < n ? ' miss' : ''), title: known ? ITEMS[id].name : '?' }, [img(itemVox.src(id), 'pix', known ? null : unknown), el('b', {}, `${have}/${n}`)]));
      }
      f.append(el('span', { class: 'sm-in' + (st.count('coal') < r.coal ? ' miss' : ''), title: ITEMS.coal.name }, [img(itemVox.src('coal')), el('b', {}, `${st.count('coal')}/${r.coal}`)]));
      f.append(img(fart('dArrow'), 'pix sm-arrow'), el('span', { class: 'sm-out', title: s.known ? ITEMS[r.out].name : '?' }, [img(itemVox.src(r.out), 'pix', s.known ? null : unknown), r.n > 1 ? el('b', {}, '×' + r.n) : null]));
      const stamps = el('div', { class: 'sm-stamps' });
      const hot = (r.forge || 0) > (st.data.forgeLevel || 0);
      stamps.append(el('button', { class: 'fg-stampbtn', disabled: !s.ok, title: s.why || '', onclick: (e) => { e.currentTarget.classList.add('thud'); this.game.audio.play('place'); this.startSmelt(r); } }, [hot ? img(wart.glyph('lock'), 'pix fg-bic') : null, 'Smelt']));
      if (s.ok && s.learned && !this.scene.lesson) {
        stamps.append(el('button', { class: 'fg-stampbtn alt', title: 'Smelt them all at once', onclick: () => this.quick(r, s.batches) }, [img(wart.glyph('quick'), 'pix fg-bic'), `×${s.batches}`]));
      }
      list.append(el('div', { class: 'sm-entry' + (s.ok ? '' : ' locked') + (this.scene.lesson?.highlight === r.id ? ' fg-lesson' : ''), style: `--d:${Math.min(0.5, i * 0.04)}s`, title: s.why || '' }, [
        el('div', {}, [f, el('div', { class: 'sm-name' }, s.known ? ITEMS[r.out].name.replace(/ Ingot$/, '') : '?')]),
        stamps,
      ]));
    });
    // the left page: the smith's own drawing of the work (crucible in the coals, the pour), the last pour
    const last = this.lastSmelt;
    const left = el('div', { class: 'sm-page l' }, [
      img(bart('inkCrucible'), 'pix sm-diagram'),
      last ? el('div', { class: 'sm-last', title: 'Last pour' }, [img(itemVox.src(last.id)), el('b', {}, '×' + last.n), el('b', { style: { color: qColor(last.q) } }, last.q + '%')]) : null,
    ]);
    const node = el('div', { class: 'sm-ledger interactive' + (refresh ? ' again' : '') }, [
      el('div', { class: 'sm-spread' }, [left, el('div', { class: 'sm-page r' }, [list, el('div', { class: 'sm-rfoot' }, [link('Back', 'Esc', () => this.back(), 'back')])]), el('i', { class: 'sm-ribbon' })]),
    ]);
    if (!refresh) this.game.audio.play('page');
    const scrollTop = this.mode === 'smelt' && this.panel ? this.panel.querySelector('.sm-list')?.scrollTop : 0;
    this.show(node, 'smelt');
    if (scrollTop) list.scrollTop = scrollTop;
    this.keyHandler = null;
  }

  startSmelt(recipe) {
    this.game.audio.play('ui_click');
    const game = new SmeltGame(this.scene, recipe);
    this.scene.startActivity(game);
    game.start();
  }

  quick(recipe, n) {
    const res = quickSmelt(this.state, recipe, n);
    if (!res) { this.game.audio.play('ui_error'); return; }
    this.game.audio.play('pour');
    setTimeout(() => this.game.audio.play('ding'), 350);
    setTimeout(() => this.game.audio.play('coins', { n: Math.min(8, res.count) }), 600);
    const out = ITEMS[recipe.out];
    this.lastSmelt = { id: recipe.out, n: res.count, q: res.avgQ };
    this.game.ui.toast(`+${res.count} ${out.name} <b>${res.avgQ}%</b>`, { icon: iconURL(recipe.out), kind: 'good' });
    this.scene.quickSmeltFx?.(recipe, res.count);
    this.smeltList(true);
  }

  // ---------------------------------------------------------------- the blueprint (weapons)
  planOptions() {
    const st = this.state;
    const lvl = st.data.forgeLevel || 0;
    const maxT = FORGE_MAX_TEMP[lvl];
    const types = Object.keys(WEAPON_TYPES).filter((t) => st.owns('bp_' + t));
    const metals = Object.entries(METALS).filter(([, m]) => st.count(m.ingot) > 0).map(([id, m]) => {
      const have = st.count(m.ingot);
      const need = this.sel.type ? WEAPON_TYPES[this.sel.type].ingots : 1;
      let why = null;
      if (m.work[0] > maxT) why = `Needs ${m.work[0]}°: hearth too cool`;
      else if (have < need) why = `${have}/${need} ingots`;
      return { id, m, have, need, why, q: avgQ(bestLots(st, m.ingot, need)) };
    });
    const infusions = Object.entries(INFUSIONS).filter(([id]) => st.count(id) > 0).map(([id, inf]) => ({
      id, inf, why: inf.needs && !st.protects(inf.needs) ? NEED_WORDS[inf.needs] : null, q: avgQ(bestLots(st, id, 1)),
    }));
    const gems = SOCKET_GEMS.filter((id) => st.count(id) > 0).map((id) => ({ id, q: avgQ(bestLots(st, id, 1)) }));
    return { types, metals, infusions, gems, maxT };
  }

  plan(refresh = false) {
    if (!refresh) this.from = this.mode === 'main' ? 'main' : this.mode === 'plan' ? this.from : null;
    const st = this.state;
    let opt = this.planOptions();
    const sel = this.sel;
    if (!sel.type || !opt.types.includes(sel.type)) sel.type = opt.types[0] || null;
    opt = this.planOptions();
    const usable = opt.metals.filter((m) => !m.why);
    if (!sel.metal || !usable.some((m) => m.id === sel.metal)) {
      sel.metal = usable.sort((a, b) => ITEMS[b.m.ingot].value - ITEMS[a.m.ingot].value)[0]?.id || null;
    }
    if (sel.infusion && !opt.infusions.some((i) => i.id === sel.infusion && !i.why)) sel.infusion = null;
    if (sel.gem && !opt.gems.some((g) => g.id === sel.gem)) sel.gem = null;
    // tiles: a big picture each, its numbers in the corners; the name and any reason it can't be used on hover
    const chip = (on, face, tip, nums, onclick, why) => el('button', {
      class: 'sm-chip' + (on ? ' on' : ''), disabled: !!why, title: why || tip,
      onclick: () => { this.game.audio.play(on ? 'ui_click' : 'click'); onclick(); },
    }, [face || el('span'), ...(nums || []), why ? img(wart.glyph('lock'), 'pix sm-lock') : null]);
    const q = (v) => el('b', { class: 'sm-q', style: { color: qColor(v) } }, v + '%');
    const n = (v) => el('b', { class: 'sm-n' }, '×' + v);
    const tok = (hex, icon) => el('span', { class: 'sm-tok', style: `--tok:${cssUrl(token(hex))}` }, [icon ? img(icon) : null]);
    // left: the plan and the metal
    const typeGrid = el('div', { class: 'sm-chips' });
    for (const t of opt.types) {
      const wt = WEAPON_TYPES[t];
      typeGrid.append(chip(sel.type === t, img(itemVox.weapon(t, sel.metal || 'iron')), wt.name, [n(wt.ingots)], () => { sel.type = t; this.plan(true); }));
    }
    if (!opt.types.length) typeGrid.append(el('div', { class: 'sm-anno' }, [img(wart.glyph('lock'), 'pix sm-lg'), 'Inkwell Plans']));
    const metalGrid = el('div', { class: 'sm-chips' });
    for (const mm of opt.metals) {
      metalGrid.append(chip(sel.metal === mm.id, img(itemVox.src(mm.m.ingot)), mm.m.name, [q(mm.q), n(mm.have)], () => { sel.metal = mm.id; this.plan(true); }, mm.why));
    }
    if (!opt.metals.length) metalGrid.append(el('div', { class: 'sm-anno' }, [link('Smelt', null, () => this.smeltList(), 'flame')]));
    // right: infusion and gem (an empty token: none)
    const infGrid = el('div', { class: 'sm-chips' });
    infGrid.append(chip(!sel.infusion, tok(0x6a8ab0, null), 'None', null, () => { sel.infusion = null; this.plan(true); }));
    for (const inf of opt.infusions) {
      infGrid.append(chip(sel.infusion === inf.id, img(itemVox.src(inf.id)), `${inf.inf.name} · +${Math.round(inf.inf.bonus * 100)}%`, [q(inf.q)], () => { sel.infusion = inf.id; this.plan(true); }, inf.why));
    }
    const gemGrid = el('div', { class: 'sm-chips' });
    gemGrid.append(chip(!sel.gem, tok(0x6a8ab0, null), 'None', null, () => { sel.gem = null; this.plan(true); }));
    for (const g of opt.gems) gemGrid.append(chip(sel.gem === g.id, img(itemVox.src(g.id)), ITEMS[g.id].name, [q(g.q)], () => { sel.gem = g.id; this.plan(true); }));
    // the drawing: the weapon in ink, its name, what it could fetch
    const ok = sel.type && sel.metal;
    const draw = el('div', { class: 'sm-draw' });
    if (ok) {
      const wt = WEAPON_TYPES[sel.type], m = METALS[sel.metal];
      const matQ = avgQ(bestLots(st, m.ingot, wt.ingots));
      const gemQ = sel.gem ? avgQ(bestLots(st, sel.gem, 1)) : undefined;
      const base = { type: sel.type, metal: sel.metal, matQ, infusion: sel.infusion || undefined, gem: sel.gem || undefined, gemQ };
      const lo = weaponValue({ ...base, score: 55 }, ITEMS), hi = weaponValue({ ...base, score: 95 }, ITEMS);
      draw.append(
        img(inkWeaponURL(sel.type, sel.metal), 'pix sm-bigdraw'),
        img(bart('forgeSeal'), 'pix sm-drawseal'),
        el('div', { class: 'sm-dname' }, `${sel.infusion ? INFUSIONS[sel.infusion].name + ' ' : ''}${m.name} ${wt.name}`),
        el('div', { class: 'sm-worth', title: `${GRADES[3].word} … ${GRADES[0].word}` }, [img(wart.glyph('coin')), `${formatGoldFull(lo)}–${formatGoldFull(hi)}`]),
      );
    } else draw.append(img(fart('dAnvil'), 'pix sm-bigdraw', { opacity: 0.4 }));
    const start = el('button', { class: 'fg-stampbtn big', disabled: !ok, onclick: (e) => { e.currentTarget.classList.add('thud'); this.startForge(); } }, [img(wart.glyph('hammer'), 'pix fg-bic'), 'Forge', isTouch() ? null : kbd('Enter')]);
    const node = el('div', { class: 'sm-blue interactive' + (refresh ? ' again' : '') }, [
      el('i', { class: 'sm-ribbon' }),
      el('div', { class: 'sm-bp-grid sm-scroll' }, [
        el('div', { class: 'sm-bp-col' }, [el('div', { class: 'sm-sec' }, 'Plan'), typeGrid, el('div', { class: 'sm-sec' }, 'Metal'), metalGrid]),
        draw,
        el('div', { class: 'sm-bp-col' }, [el('div', { class: 'sm-sec' }, 'Infuse'), infGrid, el('div', { class: 'sm-sec' }, 'Gem'), gemGrid]),
      ]),
      el('div', { class: 'sm-bp-foot' }, [link('Back', 'Esc', () => this.back(), 'back'), start]),
    ]);
    if (!refresh) this.game.audio.play('page');
    const scroller = this.mode === 'plan' && this.panel ? this.panel.querySelector('.sm-bp-grid') : null;
    const top = scroller ? scroller.scrollTop : 0;
    this.show(node, 'plan');
    if (top) node.querySelector('.sm-bp-grid').scrollTop = top;
    this.keyHandler = (code) => { if (code === 'Enter' && ok) this.startForge(); };
  }

  startForge() {
    const sel = this.sel;
    if (!sel.type || !sel.metal) return;
    this.game.audio.play('ui_click');
    const run = new ForgeRun(this.scene, { ...sel });
    if (!run.ok) { this.game.audio.play('ui_error'); this.plan(true); return; }
    this.scene.startActivity(run);
    run.start();
  }

  // ---------------------------------------------------------------- forge pieces (your first pick)
  /** Start forging a piece (false when it can't be made right now). */
  startPart(id) {
    const s = pieceOf(id) ? partStatus(this.state, id) : null;
    if (!s || !s.ok) { this.game.audio.play('ui_error'); return false; }
    this.game.audio.play('place');
    const run = new PartRun(this.scene, id);
    this.scene.startActivity(run);
    run.start();
    return true;
  }
}
