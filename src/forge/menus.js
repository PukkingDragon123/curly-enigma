// Forge menus (DOM panels in the scene's layer): the hub, the smelting list and the weapon plan.
import { el, formatGoldFull } from '../core/util.js';
import { ITEMS } from '../data/items.js';
import { SMELTING, METALS, WEAPON_TYPES, INFUSIONS, SOCKET_GEMS, FORGE_MAX_TEMP, weaponValue, GRADES } from '../data/weapons.js';
import { iconURL, weaponIconURL } from '../gfx/PixelArt.js';
import { qColor } from '../ui/UI.js';
import { smeltStatus, quickSmelt, SmeltGame } from './smelt.js';
import { ForgeRun } from './forging.js';

const HEARTH_NAMES = ['Coal hearth', 'Coal hearth, double bellows', 'Magma hearth'];
const NEED_WORDS = {
  zap: 'Too shocking to handle without rubber gloves',
  heat: 'Too hot to handle without heat-proof mitts',
  cold: 'Too cold to handle without frost gauntlets',
};

export function avgQ(lots) {
  return lots.length ? Math.round(lots.reduce((s, l) => s + l.q, 0) / lots.length) : 0;
}

/** Best-quality lots of an item, n of them. */
export function bestLots(state, id, n) {
  return state.lotsOf(id).slice().sort((a, b) => b.q - a.q).slice(0, n);
}

export class Menus {
  constructor(scene) {
    this.scene = scene;
    this.game = scene.game;
    this.state = scene.game.state;
    this.panel = null;
    this.mode = 'hidden';
    this.sel = { type: null, metal: null, infusion: null, gem: null };
    this.lastSmelt = null;
    const off = this.state.on('items', () => { if (this.mode === 'smelt') this.smeltList(true); else if (this.mode === 'main') this.main(true); });
    this.unsub = off;
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

  /** Close a sub-menu: back to the hub if it came from there, else back to the smithy. */
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

  update() {
    const inp = this.game.input;
    if (!this.keyHandler || this.game.ui.isPanelOpen()) return;
    for (const code of ['Digit1', 'Digit2', 'Enter']) if (inp.pressed(code)) { inp.consume(code); this.keyHandler(code); break; }
  }

  // ---------------------------------------------------------------- hub
  main(refresh = false) {
    const st = this.state, d = st.data;
    const lvl = d.forgeLevel || 0;
    const ingotIds = Object.values(METALS).map((m) => m.ingot);
    const ingots = ingotIds.reduce((s, id) => s + st.count(id), 0);
    const oreIds = [...new Set(SMELTING.flatMap((r) => Object.keys(r.inputs)))];
    const ores = oreIds.reduce((s, id) => s + st.count(id), 0);
    const plans = Object.keys(WEAPON_TYPES).filter((t) => st.owns('bp_' + t)).length;
    const forged = d.weapons.length;
    const big = (icon, title, sub, key, on) => el('button', { class: 'btn alt fg-big', onclick: () => { this.game.audio.play('ui_click'); on(); } }, [
      el('img', { class: 'pix', src: icon, alt: '' }), el('span', {}, [el('b', {}, title), el('small', { html: sub })]), el('kbd', {}, key),
    ]);
    const node = el('div', { class: 'panel fg-side fg-col' }, [
      el('div', { class: 'fg-kicker' }, 'Home forge'),
      el('h2', {}, 'The Forge'),
      el('p', { class: 'sub' }, `${HEARTH_NAMES[lvl] || HEARTH_NAMES[0]} · up to ${FORGE_MAX_TEMP[lvl]}°C`),
      big(iconURL('copper_ingot'), 'Smelt ore', `${ores} ore · ${st.count('coal')} coal`, '1', () => this.smeltList()),
      big(weaponIconURL('shortsword', 'iron'), 'Forge a weapon', `${ingots} ingot${ingots === 1 ? '' : 's'} · ${plans} plan${plans === 1 ? '' : 's'}`, '2', () => this.plan()),
      forged ? el('div', { class: 'fg-note', html: `In the barrel by the door: <b>${forged}</b> forged weapon${forged === 1 ? '' : 's'}, waiting for the assay office.` }) : null,
      el('div', { class: 'row', style: { marginTop: 'calc(var(--px) * 2)', gap: 'calc(var(--px) * 2)', flexWrap: 'wrap' } }, [
        el('button', { class: 'btn alt', onclick: () => { this.game.audio.play('ui_close'); this.hide(); } }, 'Look around'),
        el('button', { class: 'btn alt', onclick: () => this.scene.leave() }, ['Leave forge ', el('kbd', { style: { marginLeft: 'calc(var(--px)*1.5)', marginRight: 0 } }, 'Esc')]),
      ]),
    ]);
    if (!refresh) this.game.audio.play('page');
    this.show(node, 'main');
    this.keyHandler = (code) => { if (code === 'Digit1') this.smeltList(); if (code === 'Digit2') this.plan(); };
  }

  // ---------------------------------------------------------------- smelting list
  smeltList(refresh = false) {
    if (!refresh) this.from = this.mode === 'main' ? 'main' : this.mode === 'smelt' ? this.from : null;
    const st = this.state;
    const lvl = st.data.forgeLevel || 0;
    const list = el('div', { class: 'list scroll', style: { maxHeight: 'calc(100vh - var(--px) * 118)' } });
    const rows = SMELTING.map((r) => ({ r, s: smeltStatus(st, r) }));
    rows.sort((a, b) => (b.s.ok - a.s.ok) || (b.s.known - a.s.known));
    for (const { r, s } of rows) {
      const out = ITEMS[r.out];
      const ins = el('div', { class: 'ins' });
      for (const [id, n] of Object.entries(r.inputs)) {
        const have = st.count(id);
        const known = st.known('mineral', id) || have > 0;
        ins.append(el('span', { class: have < n ? 'miss' : '' }, [known ? el('img', { class: 'pix', src: iconURL(id), alt: '' }) : null, ` ${n}× ${known ? ITEMS[id].name : 'unknown ore'} (${have})`]));
      }
      ins.append(el('span', { class: st.count('coal') < r.coal ? 'miss' : '' }, [el('img', { class: 'pix', src: iconURL('coal'), alt: '' }), ` ${r.coal}× Coal (${st.count('coal')})`]));
      ins.append(el('span', {}, `${r.temp[0]}–${r.temp[1]}°C`));
      const btns = el('div', { class: 'btns' });
      const go = el('button', { class: 'btn', disabled: !s.ok, onclick: () => this.startSmelt(r) }, 'Smelt');
      btns.append(go);
      if (s.ok && s.learned && !this.scene.lesson) {
        btns.append(el('button', { class: 'btn alt', title: 'Smelts every batch you can afford at once (steady 80% heat control).', onclick: () => this.quick(r, s.batches) }, `Quick ×${s.batches}`));
      }
      const outName = s.known ? `${out.name}${r.n > 1 ? ' ×' + r.n : ''}` : '???';
      list.append(el('div', { class: 'fg-recipe' + (s.ok ? '' : ' locked') + (this.scene.lesson?.highlight === r.id ? ' fg-lesson' : '') }, [
        el('img', { class: 'pix', src: iconURL(r.out), alt: '', style: s.known ? {} : { filter: 'brightness(0) opacity(.4)' } }),
        el('div', {}, [el('div', { class: 'name' }, outName), ins, s.why ? el('div', { class: 'why' }, s.why) : null]),
        btns,
      ]));
    }
    const last = this.lastSmelt;
    const node = el('div', { class: 'panel fg-side wide fg-col' }, [
      el('div', { class: 'fg-kicker' }, 'Smelting'),
      el('h2', {}, 'Ore into ingots'),
      el('p', { class: 'sub' }, `Coal in the bin: ${st.count('coal')} · Hearth tops out at ${FORGE_MAX_TEMP[lvl]}°C`),
      last ? el('div', { class: 'fg-note', html: last }) : null,
      list,
      el('div', { class: 'row' }, [el('button', { class: 'btn alt', onclick: () => this.back() }, ['Back ', el('kbd', { style: { marginLeft: 'calc(var(--px)*1.5)', marginRight: 0 } }, 'Esc')])]),
    ]);
    if (!refresh) this.game.audio.play('page');
    const scrollTop = this.mode === 'smelt' && this.panel ? this.panel.querySelector('.scroll')?.scrollTop : 0;
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

  // ---------------------------------------------------------------- forge plan
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
    const pick = (on, img, title, small, onclick, why) => el('button', { class: 'fg-pick' + (on ? ' on' : ''), disabled: !!why, title: why || '', onclick: () => { this.game.audio.play('ui_click'); onclick(); } }, [
      img ? el('img', { class: 'pix', src: img, alt: '' }) : el('span'),
      el('span', {}, [title, el('small', { html: why ? `<span class="why">${why}</span>` : small })]),
    ]);
    // left column: type + metal
    const typeGrid = el('div', { class: 'fg-grid2' });
    for (const t of opt.types) {
      const wt = WEAPON_TYPES[t];
      typeGrid.append(pick(sel.type === t, weaponIconURL(t, sel.metal || 'iron'), wt.name, `${wt.ingots} ingot${wt.ingots > 1 ? 's' : ''}`, () => { sel.type = t; this.plan(true); }));
    }
    if (!opt.types.length) typeGrid.append(el('div', { class: 'fg-note' }, 'No weapon plans. Inkwell Plans in town sells them.'));
    const metalGrid = el('div', { class: 'fg-grid2' });
    for (const mm of opt.metals) {
      metalGrid.append(pick(sel.metal === mm.id, iconURL(mm.m.ingot), mm.m.name, `${mm.have} ingot${mm.have > 1 ? 's' : ''} · <b style="color:${qColor(mm.q)}">${mm.q}%</b> · works ${mm.m.work[0]}–${mm.m.work[1]}°C`, () => { sel.metal = mm.id; this.plan(true); }, mm.why));
    }
    if (!opt.metals.length) {
      metalGrid.append(el('div', { class: 'fg-note' }, [el('span', {}, 'No ingots yet. '), el('button', { class: 'btn alt', style: { fontSize: '.85em', padding: 'var(--px) calc(var(--px)*3)' }, onclick: () => this.smeltList() }, 'Smelt some ore')]));
    }
    // right column: infusion, gem, summary
    const infGrid = el('div', { class: 'fg-grid2' });
    infGrid.append(pick(!sel.infusion, null, 'None', 'Plain metal', () => { sel.infusion = null; this.plan(true); }));
    for (const inf of opt.infusions) {
      infGrid.append(pick(sel.infusion === inf.id, iconURL(inf.id), `${inf.inf.name}`, `${ITEMS[inf.id].name} · +${Math.round(inf.inf.bonus * 100)}% value`, () => { sel.infusion = inf.id; this.plan(true); }, inf.why));
    }
    const gemGrid = el('div', { class: 'fg-grid2' });
    gemGrid.append(pick(!sel.gem, null, 'None', 'Bare pommel', () => { sel.gem = null; this.plan(true); }));
    for (const g of opt.gems) gemGrid.append(pick(sel.gem === g.id, iconURL(g.id), ITEMS[g.id].name, `<b style="color:${qColor(g.q)}">${g.q}%</b> quality`, () => { sel.gem = g.id; this.plan(true); }));
    if (!opt.infusions.length) infGrid.append(el('div', { class: 'fg-note' }, 'Strange minerals from the deep can be worked into a blade.'));

    const summary = el('div', { class: 'detail fg-col', style: { minHeight: 0, gap: 'var(--px)' } });
    const ok = sel.type && sel.metal;
    if (ok) {
      const wt = WEAPON_TYPES[sel.type], m = METALS[sel.metal];
      const matQ = avgQ(bestLots(st, m.ingot, wt.ingots));
      const gemQ = sel.gem ? avgQ(bestLots(st, sel.gem, 1)) : undefined;
      const base = { type: sel.type, metal: sel.metal, matQ, infusion: sel.infusion || undefined, gem: sel.gem || undefined, gemQ };
      const lo = weaponValue({ ...base, score: 55 }, ITEMS), hi = weaponValue({ ...base, score: 95 }, ITEMS);
      summary.append(
        el('div', { class: 'fg-row' }, [el('img', { class: 'pix', src: weaponIconURL(sel.type, sel.metal, sel.infusion), alt: '', style: { width: 'var(--icon)', height: 'var(--icon)' } }),
          el('b', {}, `${sel.infusion ? INFUSIONS[sel.infusion].name + ' ' : ''}${m.name} ${wt.name}`)]),
        el('div', { html: `Uses ${wt.ingots} ${m.name} ingot${wt.ingots > 1 ? 's' : ''} · material <b style="color:${qColor(matQ)}">${matQ}%</b>` }),
        el('div', { html: `Worth about <span class="gold-txt">${formatGoldFull(lo)}g</span> if ${GRADES[3].word.toLowerCase()}, up to <span class="gold-txt">${formatGoldFull(hi)}g</span> if ${GRADES[0].word.toLowerCase()}.` }),
        el('div', { class: 'fg-note', html: `Works at <b>${m.work[0]}–${m.work[1]}°C</b>, burns above <b>${m.burn}°C</b>${m.quench ? `, hardens from <b>${m.quench[0]}–${m.quench[1]}°C</b>` : ', does not harden'}.` }),
      );
    } else summary.append(el('div', { class: 'fg-note' }, 'Pick a plan and a metal.'));

    const start = el('button', { class: 'btn big', disabled: !ok, onclick: () => this.startForge() }, 'Start forging');
    const node = el('div', { class: 'panel fg-side plan fg-col' }, [
      el('div', { class: 'fg-kicker' }, 'Forging · plan'),
      el('h2', {}, 'What will you make?'),
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'calc(var(--px) * 4)', minHeight: 0, overflowY: 'auto' }, class: 'scroll' }, [
        el('div', { class: 'fg-col', style: { gap: 'var(--px)' } }, [el('div', { class: 'fg-section' }, 'Plan'), typeGrid, el('div', { class: 'fg-section' }, 'Metal'), metalGrid]),
        el('div', { class: 'fg-col', style: { gap: 'var(--px)' } }, [el('div', { class: 'fg-section' }, 'Infusion · optional'), infGrid, el('div', { class: 'fg-section' }, 'Pommel gem · optional'), gemGrid]),
      ]),
      summary,
      el('div', { class: 'row' }, [start, el('span', { class: 'spacer' }), el('button', { class: 'btn alt', onclick: () => this.back() }, ['Back ', el('kbd', { style: { marginLeft: 'calc(var(--px)*1.5)', marginRight: 0 } }, 'Esc')])]),
    ]);
    if (!refresh) this.game.audio.play('page');
    const scroller = this.mode === 'plan' && this.panel ? this.panel.querySelector('.scroll') : null;
    const top = scroller ? scroller.scrollTop : 0;
    this.show(node, 'plan');
    if (top) node.querySelector('.scroll').scrollTop = top;
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
}
