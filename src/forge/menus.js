// Forge menus (DOM in the scene's layer), each one a thing in the smithy:
//   main()       the order board: a chalkboard on chains with pinned cards (1 smelt, 2 forge, 3 parts)
//   smeltList()  the smith's ledger: a leather notebook, one inked entry per recipe, rubber stamps
//   plan()       the weapon blueprint: chalk boxes for the plan, metal tokens, the drawing in the middle
//   partsList()  Nugget's coop schematic: the coop in blue ink with numbered spots, part cards taped on
// Styles: forge.css, art: forgeArt.js.
import { el, formatGoldFull } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { SMELTING, METALS, WEAPON_TYPES, INFUSIONS, SOCKET_GEMS, FORGE_MAX_TEMP, weaponValue, GRADES } from '../data/weapons.js';
import { COOP_PARTS } from '../data/coopParts.js';
import { COOP_UP, COOP_TRACKS, coopLevels } from '../core/weight.js';
import { iconURL, weaponIconURL } from '../gfx/PixelArt.js';
import { qColor } from '../ui/UI.js';
import { smeltStatus, quickSmelt, SmeltGame } from './smelt.js';
import { ForgeRun } from './forging.js';
import { PartRun, partStatus } from './parts.js';
import { fart, token, callout, blueprintURL } from './forgeArt.js';

const HEARTH_NAMES = ['Coal hearth', 'Coal hearth, double bellows', 'Magma hearth'];
const NEED_WORDS = {
  zap: 'Too shocking to handle without rubber gloves',
  heat: 'Too hot to handle without heat-proof mitts',
  cold: 'Too cold to handle without frost gauntlets',
};
const GEM_HEX = { quartz: 0xf2f2f8, amber: 0xf2a32c, amber_bug: 0xf2a32c, amethyst: 0xa05ad9, ruby: 0xe02a3a, emerald: 0x2ad96a, sapphire: 0x2a5ae0, diamond: 0xd8f6ff };
/** Where each track's numbered callout sits on the coop sketch (art px, 60×76). */
const CALLOUT = { shelves: [9, 34], legs: [12, 60], nest: [41, 41], chute: [47, 4], lamp: [21, 0] };

export function avgQ(lots) {
  return lots.length ? Math.round(lots.reduce((s, l) => s + l.q, 0) / lots.length) : 0;
}

/** Best-quality lots of an item, n of them. */
export function bestLots(state, id, n) {
  return state.lotsOf(id).slice().sort((a, b) => b.q - a.q).slice(0, n);
}

const kbd = (k) => el('kbd', {}, k);
const img = (src, cls = 'pix', style = null) => el('img', { class: cls, src, alt: '', style });
/** A handwritten link (back / leave). */
const link = (label, key, on) => el('button', { class: 'sm-link', onclick: on }, [label, key ? kbd(key) : null]);

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
      else if (this.mode === 'parts') this.partsList(true);
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
    if (this.mode === 'smelt' || this.mode === 'plan' || this.mode === 'parts') { this.back(); return true; }
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

  /** Rows of the parts list (scene.debug.partsList). */
  partRows() {
    return Object.keys(COOP_PARTS).map((id) => {
      const s = partStatus(this.state, id);
      return { id, name: s.p.name, track: s.p.track, level: s.p.level, status: s.done ? 'installed' : s.ok ? 'ready' : 'locked', why: s.why, need: Object.fromEntries(s.ins.map((x) => [x.id, x.n])), have: Object.fromEntries(s.ins.map((x) => [x.id, x.have])), carrying: s.carrying, works: s.m.work, hot: s.hot };
    });
  }

  update() {
    const inp = this.game.input;
    if (!this.keyHandler || this.game.ui.isPanelOpen()) return;
    for (const code of ['Digit1', 'Digit2', 'Digit3', 'Enter']) if (inp.pressed(code)) { inp.consume(code); this.keyHandler(code); break; }
  }

  // ---------------------------------------------------------------- the order board (hub)
  main(refresh = false) {
    const st = this.state, d = st.data;
    const lvl = d.forgeLevel || 0;
    const ingotIds = Object.values(METALS).map((m) => m.ingot);
    const ingots = ingotIds.reduce((s, id) => s + st.count(id), 0);
    const oreIds = [...new Set(SMELTING.flatMap((r) => Object.keys(r.inputs)))];
    const ores = oreIds.reduce((s, id) => s + st.count(id), 0);
    const plans = Object.keys(WEAPON_TYPES).filter((t) => st.owns('bp_' + t)).length;
    const forged = d.weapons.length;
    const parts = Object.keys(COOP_PARTS).map((id) => partStatus(st, id));
    const ready = parts.filter((s) => s.ok).length;
    const carrying = parts.reduce((n, s) => n + s.carrying, 0);
    const card = (icon, title, sub, key, on, r, tack, delay) => el('button', {
      class: 'sm-card', style: `--r:${r}deg;--tack:var(--fa-${tack});--d:${delay}s`,
      onclick: () => { this.game.audio.play('ui_click'); on(); },
    }, [img(icon), el('span', {}, [el('b', {}, title), el('small', { html: sub })]), kbd(key)]);
    const node = el('div', { class: 'sm-board interactive' + (refresh ? ' again' : '') }, [
      el('i', { class: 'sm-cord l' }), el('i', { class: 'sm-cord r' }),
      img(fart('dAnvil'), 'pix sm-doodle', { right: 'calc(var(--px) * 3)', top: 'calc(var(--px) * 2)', width: 'calc(var(--px) * 30)', height: 'calc(var(--px) * 22)' }),
      img(fart('dSpark'), 'pix sm-doodle', { right: 'calc(var(--px) * 34)', top: 'calc(var(--px) * 4)', width: 'calc(var(--px) * 9)', height: 'calc(var(--px) * 9)' }),
      img(fart('dHen'), 'pix sm-doodle', { left: 'calc(var(--px) * 40)', bottom: 'calc(var(--px) * 1)', width: 'calc(var(--px) * 18)', height: 'calc(var(--px) * 16)' }),
      el('div', { class: 'fg-kicker' }, 'Home forge · today\'s work'),
      el('h2', { class: 'sm-chalk-h' }, 'The Forge'),
      el('div', { class: 'sm-cards' }, [
        card(iconURL('copper_ingot'), 'Smelt ore', `${ores} ore · ${st.count('coal')} coal`, '1', () => this.smeltList(), -1.2, 'tackRed', 0.08),
        card(weaponIconURL('shortsword', 'iron'), 'Forge a weapon', `${ingots} ingot${ingots === 1 ? '' : 's'} · ${plans} plan${plans === 1 ? '' : 's'}`, '2', () => this.plan(), 1, 'tackBlue', 0.16),
        card(iconURL('legs_copper'), 'Coop parts', `For Nugget's coop · ${ready ? `<em>${ready} ready to forge</em>` : 'see what she needs'}${carrying ? ` · ${carrying} in your pack` : ''}`, '3', () => this.partsList(), -0.6, 'tackGold', 0.24),
      ]),
      forged ? el('div', { class: 'sm-chalknote', html: `In the barrel by the door: <b>${forged}</b> forged weapon${forged === 1 ? '' : 's'} for the assay office.` }) : null,
      el('div', { class: 'sm-foot' }, [
        link('Look around', null, () => { this.game.audio.play('ui_close'); this.hide(); }),
        link('Leave forge', 'Esc', () => this.scene.leave()),
      ]),
      img(fart('sticks'), 'pix sm-sticks'),
      el('div', { class: 'sm-hsign' }, `${HEARTH_NAMES[lvl] || HEARTH_NAMES[0]} · up to ${FORGE_MAX_TEMP[lvl]}°C`),
    ]);
    if (!refresh) this.game.audio.play('page');
    this.show(node, 'main');
    this.keyHandler = (code) => { if (code === 'Digit1') this.smeltList(); if (code === 'Digit2') this.plan(); if (code === 'Digit3') this.partsList(); };
  }

  // ---------------------------------------------------------------- the ledger (smelting)
  smeltList(refresh = false) {
    if (!refresh) this.from = this.mode === 'main' ? 'main' : this.mode === 'smelt' ? this.from : null;
    const st = this.state;
    const lvl = st.data.forgeLevel || 0;
    const list = el('div', { class: 'sm-list sm-scroll' });
    const rows = SMELTING.map((r) => ({ r, s: smeltStatus(st, r) }));
    rows.sort((a, b) => (b.s.ok - a.s.ok) || (b.s.known - a.s.known));
    rows.forEach(({ r, s }, i) => {
      const out = ITEMS[r.out];
      const f = el('div', { class: 'sm-formula' });
      const ins = el('div', { class: 'sm-ins' });
      for (const [id, n] of Object.entries(r.inputs)) {
        const have = st.count(id);
        const known = st.known('mineral', id) || have > 0;
        f.append(el('span', { class: 'n' }, n + '×'), img(iconURL(id), 'pix', known ? null : { filter: 'brightness(0) opacity(.35)' }));
        ins.append(el('span', { class: have < n ? 'miss' : '' }, `${known ? ITEMS[id].name : 'unknown ore'} ${have}/${n}`));
      }
      f.append(el('span', { class: 'n' }, '+' + r.coal + '×'), img(iconURL('coal')));
      f.append(img(fart('dArrow'), 'pix sm-arrow'), img(iconURL(r.out), 'pix out', s.known ? null : { filter: 'brightness(0) opacity(.35)' }));
      ins.append(el('span', { class: st.count('coal') < r.coal ? 'miss' : '' }, `coal ${st.count('coal')}/${r.coal}`));
      ins.append(el('span', { class: 'sm-heat' }, [el('i', { class: 'sm-flame' }), ` ${r.temp[0]}–${r.temp[1]}°C`]));
      const stamps = el('div', { class: 'sm-stamps' });
      stamps.append(el('button', { class: 'fg-stampbtn', disabled: !s.ok, onclick: (e) => { e.currentTarget.classList.add('thud'); this.game.audio.play('place'); this.startSmelt(r); } }, 'Smelt'));
      if (s.ok && s.learned && !this.scene.lesson) {
        stamps.append(el('button', { class: 'fg-stampbtn alt', title: 'Smelts every batch you can afford at once (steady 80% heat control).', onclick: () => this.quick(r, s.batches) }, `Quick ×${s.batches}`));
      }
      const outName = s.known ? `${out.name}${r.n > 1 ? ' ×' + r.n : ''}` : '???';
      list.append(el('div', { class: 'sm-entry' + (s.ok ? '' : ' locked') + (this.scene.lesson?.highlight === r.id ? ' fg-lesson' : ''), style: `--d:${Math.min(0.5, i * 0.04)}s` }, [
        el('div', {}, [f, el('div', { class: 'sm-name' }, outName), ins, s.why ? el('div', { class: 'sm-why' }, s.why) : null]),
        stamps,
      ]));
    });
    const last = this.lastSmelt;
    const left = el('div', { class: 'sm-page l' }, [
      el('div', { class: 'fg-kicker' }, 'The smith\'s ledger · smelting'),
      el('h2', {}, 'Ore into ingots'),
      el('div', { class: 'sm-hand', html: `<img class="pix" src="${iconURL('coal')}" alt=""> Coal in the bin: <b>${st.count('coal')}</b>` }),
      el('div', { class: 'sm-hand' }, [el('i', { class: 'sm-flame' }), ` ${HEARTH_NAMES[lvl] || HEARTH_NAMES[0]}: tops out at `, el('b', {}, FORGE_MAX_TEMP[lvl] + '°C')]),
      last ? el('div', { class: 'sm-margin', html: last }) : null,
      el('div', { class: 'sm-hand sm-hide-s', style: { marginTop: 'calc(var(--px) * 3)', fontSize: '.66em', color: '#8a6a4a' } }, 'Keep the crucible in its band with the bellows, then pour. A steady hand makes a good ingot.'),
      img(fart('dFlame'), 'pix sm-ink sm-hide-s', { width: 'calc(var(--px) * 18)', height: 'calc(var(--px) * 24)', margin: 'calc(var(--px) * 3) auto 0', display: 'block' }),
      el('div', { class: 'sm-spacer' }),
      el('div', {}, [link('Back', 'Esc', () => this.back())]),
    ]);
    const node = el('div', { class: 'sm-ledger interactive' + (refresh ? ' again' : '') }, [
      el('div', { class: 'sm-spread' }, [left, el('div', { class: 'sm-page r' }, [list]), el('i', { class: 'sm-ribbon' })]),
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
    this.lastSmelt = `Quick smelt: <b>${res.count}× ${out.name}</b> at about <b style="color:${qColor(res.avgQ)}">${res.avgQ}%</b> quality.`;
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
      if (m.work[0] > maxT) why = `Works at ${m.work[0]}°C+. Your hearth tops out at ${maxT}°C: it needs an upgrade from Inkwell Plans.`;
      else if (have < need) why = `Need ${need} ingots, you have ${have}.`;
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
    const chip = (on, face, title, small, onclick, why) => el('button', {
      class: 'sm-chip' + (on ? ' on' : ''), disabled: !!why, title: why || '',
      onclick: () => { this.game.audio.play(on ? 'ui_click' : 'click'); onclick(); },
    }, [face || el('span'), el('span', {}, [title, el('small', { html: why ? `<span class="why">${why}</span>` : small })])]);
    const tok = (hex, icon) => el('span', { class: 'sm-tok', style: `--tok:url("${token(hex)}")` }, [icon ? img(icon) : null]);
    // left: the plan and the metal
    const typeGrid = el('div', { class: 'sm-chips' });
    for (const t of opt.types) {
      const wt = WEAPON_TYPES[t];
      typeGrid.append(chip(sel.type === t, img(weaponIconURL(t, sel.metal || 'iron')), wt.name, `${wt.ingots} ingot${wt.ingots > 1 ? 's' : ''}`, () => { sel.type = t; this.plan(true); }));
    }
    if (!opt.types.length) typeGrid.append(el('div', { class: 'sm-anno' }, 'No weapon plans. Inkwell Plans in town sells them.'));
    const metalGrid = el('div', { class: 'sm-chips' });
    for (const mm of opt.metals) {
      metalGrid.append(chip(sel.metal === mm.id, tok(mm.m.color, iconURL(mm.m.ingot)), mm.m.name, `${mm.have} ingot${mm.have > 1 ? 's' : ''} · <b style="color:${qColor(mm.q)}">${mm.q}%</b> · ${mm.m.work[0]}–${mm.m.work[1]}°C`, () => { sel.metal = mm.id; this.plan(true); }, mm.why));
    }
    if (!opt.metals.length) metalGrid.append(el('div', { class: 'sm-anno' }, [el('span', {}, 'No ingots yet. '), link('Smelt some ore', null, () => this.smeltList())]));
    // right: infusion and gem
    const infGrid = el('div', { class: 'sm-chips' });
    infGrid.append(chip(!sel.infusion, tok(0x6a8ab0, null), 'None', 'Plain metal', () => { sel.infusion = null; this.plan(true); }));
    for (const inf of opt.infusions) {
      infGrid.append(chip(sel.infusion === inf.id, tok(inf.inf.color ?? 0xffffff, iconURL(inf.id)), inf.inf.name, `${ITEMS[inf.id].name} · +${Math.round(inf.inf.bonus * 100)}% value`, () => { sel.infusion = inf.id; this.plan(true); }, inf.why));
    }
    if (!opt.infusions.length) infGrid.append(el('div', { class: 'sm-anno' }, 'Strange minerals from the deep can be worked into a blade.'));
    const gemGrid = el('div', { class: 'sm-chips' });
    gemGrid.append(chip(!sel.gem, tok(0x6a8ab0, null), 'None', 'Bare pommel', () => { sel.gem = null; this.plan(true); }));
    for (const g of opt.gems) gemGrid.append(chip(sel.gem === g.id, tok(GEM_HEX[g.id] ?? 0xffffff, iconURL(g.id)), ITEMS[g.id].name, `<b style="color:${qColor(g.q)}">${g.q}%</b> quality`, () => { sel.gem = g.id; this.plan(true); }));
    // the drawing
    const ok = sel.type && sel.metal;
    const draw = el('div', { class: 'sm-draw' });
    if (ok) {
      const wt = WEAPON_TYPES[sel.type], m = METALS[sel.metal];
      const matQ = avgQ(bestLots(st, m.ingot, wt.ingots));
      const gemQ = sel.gem ? avgQ(bestLots(st, sel.gem, 1)) : undefined;
      const base = { type: sel.type, metal: sel.metal, matQ, infusion: sel.infusion || undefined, gem: sel.gem || undefined, gemQ };
      const lo = weaponValue({ ...base, score: 55 }, ITEMS), hi = weaponValue({ ...base, score: 95 }, ITEMS);
      draw.append(
        img(blueprintURL(sel.type, sel.metal), 'pix sm-bigdraw'),
        el('div', { class: 'sm-dname' }, `${sel.infusion ? INFUSIONS[sel.infusion].name + ' ' : ''}${m.name} ${wt.name}`),
        el('div', { class: 'sm-anno', html: `${wt.ingots} × ${m.name} ingot · material <b>${matQ}%</b>` }),
        el('div', { class: 'sm-anno', html: `works <b>${m.work[0]}–${m.work[1]}°C</b> · burns <b>${m.burn}°C</b>${m.quench ? ` · hardens <b>${m.quench[0]}–${m.quench[1]}°C</b>` : ' · no quench'}` }),
        el('div', { class: 'sm-anno', html: `<span class="gold-txt">${formatGoldFull(lo)}g</span> if ${GRADES[3].word.toLowerCase()} · up to <span class="gold-txt">${formatGoldFull(hi)}g</span> if ${GRADES[0].word.toLowerCase()}` }),
      );
    } else draw.append(el('div', { class: 'sm-anno', style: { marginTop: 'calc(var(--px) * 20)' } }, 'Pick a plan and a metal: the drawing goes here.'));
    const start = el('button', { class: 'fg-stampbtn big', disabled: !ok, onclick: () => this.startForge() }, ['Forge it', kbd('Enter')]);
    const tape = (c) => img(fart('tape'), 'pix sm-tape ' + c);
    const node = el('div', { class: 'sm-blue interactive' + (refresh ? ' again' : '') }, [
      tape('tl'), tape('tr'), tape('bl'), tape('br'),
      el('div', { class: 'fg-kicker' }, 'Forging · blueprint'),
      el('h2', {}, 'What will you make?'),
      el('div', { class: 'sm-bp-grid sm-scroll' }, [
        el('div', { class: 'sm-bp-col' }, [el('div', { class: 'sm-sec' }, 'Plan'), typeGrid, el('div', { class: 'sm-sec' }, 'Metal'), metalGrid]),
        draw,
        el('div', { class: 'sm-bp-col' }, [el('div', { class: 'sm-sec' }, 'Infusion · optional'), infGrid, el('div', { class: 'sm-sec' }, 'Pommel gem · optional'), gemGrid]),
      ]),
      el('div', { class: 'sm-bp-foot' }, [link('Back', 'Esc', () => this.back()), start]),
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

  // ---------------------------------------------------------------- the coop schematic (parts)
  partsList(refresh = false) {
    if (!refresh) this.from = this.mode === 'main' ? 'main' : this.mode === 'parts' ? this.from : null;
    const st = this.state;
    const lvl = st.data.forgeLevel || 0;
    const levels = coopLevels(st);
    const byTrack = {};
    for (const id of Object.keys(COOP_PARTS)) (byTrack[COOP_PARTS[id].track] ||= []).push(id);
    const tracks = COOP_TRACKS.filter((t) => byTrack[t]);
    const tracksEl = el('div', { class: 'sm-tracks sm-scroll' });
    const sections = {};
    let i = 0;
    const pips = (max, have, at) => el('span', { class: 'sm-pips' }, Array.from({ length: max }, (_, k) => el('i', { class: (k + 1 <= have ? 'on' : '') + (k + 1 === at ? ' this' : '') })));
    tracks.forEach((t, ti) => {
      const up = COOP_UP[t];
      const max = up.levels.length - 1;
      const cards = el('div', { class: 'sm-pcards' });
      for (const id of byTrack[t].sort((a, b) => COOP_PARTS[a].level - COOP_PARTS[b].level)) {
        const s = partStatus(st, id), p = s.p;
        const ins = el('div', { class: 'sm-ins' });
        for (const x of s.ins) ins.append(el('span', { class: x.have < x.n && !s.done ? 'miss' : '' }, [img(iconURL(x.id)), ` ${x.n}× ${ITEMS[x.id]?.name || x.id} (${x.have})`]));
        ins.append(el('span', { class: 'sm-heat' + (s.hot ? ' hot' : '') }, [el('i', { class: 'sm-flame' }), ` ${s.m.work[0]}–${s.m.work[1]}°C${p.quench ? ' · quench' : ''}`]));
        let state;
        if (s.done) state = el('div', { class: 'pstate' }, `On the coop${levels[t] > p.level ? ' (and better)' : ''}.`);
        else if (s.why) state = el('div', { class: 'pstate why' }, s.why);
        else state = el('div', { class: 'pstate' }, `${p.strikes} blows${p.quench ? ', then quench' : ''}.`);
        const carry = s.carrying ? el('div', { class: 'pstate carry' }, `You're carrying ${s.carrying}: install it at the coop.`) : null;
        const go = s.done ? null : el('button', { class: 'fg-stampbtn' + (s.ok ? '' : ' ink'), disabled: !s.ok, onclick: (e) => { e.currentTarget.classList.add('thud'); this.startPart(id); } }, 'Forge');
        cards.append(el('div', { class: 'sm-pcard' + (s.done ? ' done' : s.next ? ' next' : '') + (!s.done && !s.ok ? ' locked' : ''), style: `--r:${((i * 37) % 5 - 2) * 0.6}deg;--d:${Math.min(0.6, i * 0.05)}s`, 'data-part': id }, [
          img(iconURL(id)),
          el('div', {}, [el('div', { class: 'pn' }, p.name), el('div', { class: 'pl' }, [pips(max, levels[t], p.level), `level ${p.level}`])]),
          ins,
          el('div', { class: 'pdesc' }, p.desc),
          el('div', { class: 'pfoot' }, [el('div', {}, [state, carry]), go]),
          s.done ? el('div', { class: 'sm-done-stamp' }, 'Installed') : null,
        ]));
        i++;
      }
      const sec = el('div', { class: 'sm-track' }, [
        el('div', { class: 'sm-th' }, [img(callout(ti + 1)), el('b', {}, up.name), pips(max, levels[t], 0), el('small', {}, up.desc)]),
        cards,
      ]);
      sections[t] = sec;
      tracksEl.append(sec);
    });
    // the coop sketch with numbered spots (click one to jump to its parts)
    const coop = el('div', { class: 'sm-coop' }, [img(fart('coop'), 'pix sk')]);
    const legend = el('div', { class: 'sm-legend' });
    tracks.forEach((t, ti) => {
      const [x, y] = CALLOUT[t] || [0, 0];
      coop.append(el('img', {
        class: 'pix co', src: callout(ti + 1), alt: COOP_UP[t].name, title: COOP_UP[t].name,
        style: { left: `calc(${x / 60 * 100}%)`, top: `calc(${y / 76 * 100}%)` },
        onclick: () => { this.game.audio.play('page'); sections[t]?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
      }));
      const max = COOP_UP[t].levels.length - 1;
      legend.append(el('div', {}, [el('span', {}, [img(callout(ti + 1)), ' ' + COOP_UP[t].name]), el('b', {}, `${levels[t]}/${max}`)]));
    });
    const tack = (side) => img(fart(side === 'l' ? 'tackRed' : 'tackBlue'), 'pix sm-tack', side === 'l' ? { left: 'calc(var(--px) * 10)' } : { right: 'calc(var(--px) * 10)' });
    const node = el('div', { class: 'sm-schem interactive' + (refresh ? ' again' : '') }, [
      tack('l'), tack('r'),
      el('div', { class: 'fg-kicker' }, 'Nugget\'s walking coop · schematic'),
      el('h2', {}, 'Coop parts'),
      el('div', { class: 'sm-sub' }, `Forge a part here, carry it to her coop and install it from the coop side of your backpack. Hearth: up to ${FORGE_MAX_TEMP[lvl]}°C.`),
      el('div', { class: 'sm-sch-body' }, [el('div', { class: 'sm-coopcol' }, [coop, legend]), tracksEl]),
      el('div', { class: 'sm-sch-foot' }, [link('Back', 'Esc', () => this.back())]),
    ]);
    if (!refresh) this.game.audio.play('page');
    const top = this.mode === 'parts' && this.panel ? this.panel.querySelector('.sm-tracks')?.scrollTop : 0;
    this.show(node, 'parts');
    if (top) tracksEl.scrollTop = top;
    this.keyHandler = null;
    // the first time: Old Star explains where parts go
    if (!refresh && !this.scene.lesson && !st.flag('forge.partsTip')) {
      st.flag('forge.partsTip', true);
      this.game.ui.tutor?.say('Parts for your hen\'s coop! Forge one here: heat the bar, hammer it to shape, quench the hard metals. Then carry it to <b>Nugget\'s coop</b> and fit it from the coop side of your backpack (<b>I</b>, or <b>E</b> at the coop).', { mood: 'happy', key: 'forge-parts', dur: 11 });
    }
  }

  /** Start forging a part (false when it can't be made right now). */
  startPart(id) {
    const s = COOP_PARTS[id] ? partStatus(this.state, id) : null;
    if (!s || !s.ok) { this.game.audio.play('ui_error'); return false; }
    this.game.audio.play('place');
    const run = new PartRun(this.scene, id);
    this.scene.startActivity(run);
    run.start();
    return true;
  }
}
