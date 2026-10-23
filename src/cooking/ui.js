// DOM UI for the cooking scene, drawn as things in the kitchen (src/cooking/kitchenArt.js):
//  - the pantry: a wooden cupboard under a hanging sign, its shelves holding baskets (plants),
//    crates (critters) and jars (basics) with paper count tags; a recipe box of index cards you
//    flip through (◀ ▶, arrow keys, swipe, or the card tabs); a copper pot on the stove where the
//    chosen 1–4 ingredients bob in the broth (tap one to fish it out); the brass Cook! bell; a paper
//    slip with what the pot might make; a hanging door plaque back home.
//  - the step HUD: an order ticket pinned at the top (dish name and the steps as wooden tokens that
//    get a star / check / dot / cross stamp), a wind-up kitchen timer, a chalk slate with the hint,
//    and the gauges as glass tubes on a notched plank (doneness: a brass bar with a spoon pointer;
//    kneading: paw tokens on a floured board).
//  - the result: a framed recipe card with the dish's portrait and a grade rosette, stars per step,
//    paper tags for what it does, and wooden plank buttons.
import { el, clamp } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { DISHES, BUFFS, RECIPES, MAX_INGS } from '../data/recipes.js';
import { BOLT } from '../ui/UI.js';
import { onSwipe } from '../ui/common.js';
import { ensureStyles } from './style.js';
import { KART, stampKind, installKitchenArt } from './kitchenArt.js';
import { pantryItems, pantryCount, pantryLots } from './quality.js';

export const GRADES = [
  { g: 'Perfect', min: 90, color: '#d89a10' },
  { g: 'Great', min: 75, color: '#3a9a3a' },
  { g: 'Good', min: 55, color: '#3a7ab8' },
  { g: 'Okay', min: 35, color: '#8a6a3a' },
  { g: 'Burnt', min: 0, color: '#6a3a2a' },
];
export const gradeOf = (score) => GRADES.find((x) => score >= x.min) || GRADES[GRADES.length - 1];

export const STEP_LABEL = { chop: 'Chop', crack: 'Crack', stir: 'Stir', season: 'Season', fry: 'Fry', pour: 'Pour', knead: 'Knead', plate: 'Plate', simmer: 'Simmer', flip: 'Flip', grate: 'Grate', roll: 'Roll', bake: 'Bake', mash: 'Mash' };

const COOKABLE_CATS = ['plant', 'critter', 'ingredient'];
const COOKABLE_EXTRA = ['salt_crystal', 'egg'];
export function isCookable(id) {
  const it = ITEMS[id];
  return !!it && (COOKABLE_CATS.includes(it.cat) || COOKABLE_EXTRA.includes(id));
}

/** Which container an ingredient sits in on the shelf. */
const SHELVES = [
  { cat: 'plant', name: 'Garden basket', kind: 'basket' },
  { cat: 'critter', name: 'Critter crates', kind: 'crate' },
  { cat: 'ingredient', name: 'Jars & basics', kind: 'jar' },
];
const shelfCat = (it) => (it.cat === 'plant' || it.cat === 'critter' ? it.cat : 'ingredient');

/** A small quality pip for a pantry good (quality items only). */
function qPip(st, id) {
  if (!ITEMS[id]?.q) return null;
  const lots = pantryLots(st, id);
  if (!lots.length) return null;
  const best = Math.max(...lots.map((l) => l.q));
  const p = lots.some((l) => l.p && l.q === best);
  const col = best >= 90 ? '#d89a10' : best >= 70 ? '#3a9a3a' : best >= 45 ? '#3a7ab8' : '#a83a2a';
  return el('span', { class: 'ck-q' + (p ? ' p' : ''), style: { background: col }, title: `best ${best}%${p ? ' · pristine' : ''}` }, String(best));
}
export const fmtSecs = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}s`);

const img = (src, cls = '', alt = '') => el('img', { class: 'pix ' + cls, src, alt, draggable: 'false' });
const stampImg = (score) => img(KART.stamp(stampKind(score)), 'ck-stamp', `${Math.round(score)}`);
/** Where the four ingredients float in the pot (centres, in pot art pixels). */
const POT_X = [26, 48, 70, 92];

export class CookUI {
  constructor(game) {
    ensureStyles();
    installKitchenArt();
    this.game = game;
    this.root = el('div', { class: 'ck-root' });
    game.ui.world.append(this.root);
    this.layer = el('div');
    this.root.append(this.layer);
    this.cardI = 0;
  }

  destroy() { this.offKeys?.(); this.root.remove(); }

  // ------------------------------------------------------------------ pantry
  /**
   * opts: { selected: [ids], onChange(ids), onCook(ids), onLeave(), matchInfo(ids) → html }
   */
  openPantry(opts) {
    this.closeSide(true);
    const st = this.game.state;
    const audio = this.game.audio;
    let sel = opts.selected.slice();
    let tab = opts.tab || 'ings';
    let added = null; // the ingredient that just went into the pot (it drops in with a splash)
    let intro = true; // the goods settle onto the shelves when the cupboard opens (not on every click)

    const sign = el('div', { class: 'ck-sign' }, [el('i', { class: 'ck-chain l' }), el('i', { class: 'ck-chain r' }), el('h2', {}, 'Pantry')]);
    const tabs = el('div', { class: 'ck-tabs' });
    const scroll = el('div', { class: 'ck-scroll' });
    const cupboard = el('div', { class: 'ck-cupboard' }, [tabs, scroll]);
    const info = el('div', { class: 'ck-info', 'aria-live': 'polite' });
    const pot = el('div', { class: 'ck-pot' });
    const bellImg = img(KART.bell(false), 'ck-bell-img');
    const cookBtn = el('button', {
      class: 'ck-bell', title: 'Cook!', 'aria-label': 'Cook!',
      onclick: () => {
        if (!sel.length || cookBtn.disabled) { audio.play('ui_error'); this.nudge(pot); return; }
        cookBtn.disabled = true;
        ring();
        if (!opts.onCook(sel.slice())) cookBtn.disabled = false;
      },
    }, [bellImg, el('span', { class: 'ck-bell-lbl' }, 'Cook!')]);
    const ring = () => {
      audio.play('bell', { vol: 0.5 });
      bellImg.src = KART.bell(true);
      cookBtn.classList.remove('ring');
      void cookBtn.offsetWidth;
      cookBtn.classList.add('ring');
      setTimeout(() => { bellImg.src = KART.bell(false); }, 160);
    };
    const stove = el('div', { class: 'ck-stove' }, [pot, cookBtn]);
    const counter = el('div', { class: 'ck-counter' }, [info, stove]);
    const panel = el('div', { class: 'ck-side ck-pantry', role: 'dialog', 'aria-label': 'Pantry' }, [sign, cupboard, counter]);
    this.side = panel;
    this.layer.append(panel);
    const leave = el('button', { class: 'ck-leave interactive', title: 'Back home (Esc)', onclick: () => { audio.play('creak', { vol: 0.4 }); opts.onLeave(); } }, [
      el('i', { class: 'ck-hook' }), img(KART.mini('door'), 'ck-plaque-ic'), el('span', {}, 'Back home'),
    ]);
    this.layer.append(leave);
    this.leaveBtn = leave;

    const items = () => {
      const out = [];
      for (const g of pantryItems(st, (it) => it && isCookable(it.id))) if (g.n > 0) out.push(g.id);
      const order = { plant: 0, critter: 1, ingredient: 2, mineral: 3 };
      out.sort((a, b) => (order[ITEMS[a].cat] - order[ITEMS[b].cat]) || ITEMS[a].name.localeCompare(ITEMS[b].name));
      return out;
    };

    const toggle = (id) => {
      const i = sel.indexOf(id);
      if (i >= 0) { sel.splice(i, 1); added = null; audio.play('bloop', { vol: 0.5, pitch: 1.3 }); }
      else if (sel.length < MAX_INGS) { sel.push(id); added = id; audio.play('splash', { vol: 0.35 }); }
      else { audio.play('ui_error'); this.nudge(pot); return; }
      audio.play('ui_click', { pitch: i >= 0 ? 0.8 : 1.2 });
      opts.onChange(sel.slice());
      const refocus = document.activeElement?.dataset?.id === id;
      render();
      if (refocus) scroll.querySelector(`.ck-good[data-id="${id}"]`)?.focus({ preventScroll: true });
    };

    const showInfo = (html) => { info.innerHTML = html; };

    // ---- the shelves
    const renderIngs = () => {
      const list = items();
      if (!list.length) {
        scroll.append(el('div', { class: 'ck-empty' }, [
          img(KART.basket('front'), 'ck-empty-art'),
          el('p', { html: 'The pantry is bare.<br>Plants and critters turn up in the mines, and the grocer in town sells basics.' }),
        ]));
        return;
      }
      for (const sh of SHELVES) {
        const ids = list.filter((id) => shelfCat(ITEMS[id]) === sh.cat);
        if (!ids.length) continue;
        const goods = el('div', { class: 'ck-goods' });
        ids.forEach((id, n) => {
          const it = ITEMS[id];
          const on = sel.includes(id);
          const b = el('button', {
            class: `ck-good ${sh.kind}` + (on ? ' on' : ''), 'data-id': id, title: it.name, 'aria-pressed': on ? 'true' : 'false', 'aria-label': `${it.name}, ${pantryCount(st, id)} in the pantry`,
            onclick: () => toggle(id),
            onmouseenter: () => showInfo(`<b>${it.name}</b> · ${it.desc || ''}`),
            onmouseleave: () => showInfo(opts.matchInfo(sel)),
            onfocus: () => showInfo(`<b>${it.name}</b> · ${it.desc || ''}`),
            onblur: () => showInfo(opts.matchInfo(sel)),
          }, [
            el('span', { class: 'ck-cont' }, [img(KART[sh.kind]('back'), 'ck-c-back'), img(iconURL(id), 'ck-c-item', it.name), img(KART[sh.kind]('front'), 'ck-c-front'), qPip(st, id)]),
            el('span', { class: 'ck-tag' }, [on ? img(KART.stamp('check'), 'ck-tag-ok') : null, '×' + pantryCount(st, id)]),
          ]);
          b.style.setProperty('--d', Math.min(360, n * 30) + 'ms');
          goods.append(b);
        });
        scroll.append(el('div', { class: 'ck-shelf' }, [el('div', { class: 'ck-plate' }, sh.name), goods]));
      }
    };

    // ---- the recipe box
    const known = () => Object.keys(st.data.recipes || {}).filter((d) => DISHES[d] && d !== 'mystery_mush' && RECIPES.some((x) => x.dish === d));
    let flipDir = 0;
    const useCard = (r) => {
      sel = Object.keys(r.ing).slice(0, MAX_INGS);
      added = sel[sel.length - 1];
      audio.play('page');
      audio.play('splash', { vol: 0.35 });
      opts.onChange(sel.slice());
      tab = 'ings';
      intro = true;
      render();
    };
    const flip = (d) => {
      const n = known().length;
      if (n < 2) return;
      this.cardI = (this.cardI + d + n) % n;
      flipDir = d;
      audio.play('page');
      render();
    };
    const renderCards = () => {
      const list = known();
      const box = el('div', { class: 'ck-rbox' });
      const left = RECIPES.length - list.length;
      if (!list.length) {
        box.append(el('div', { class: 'ck-rcard blank' }, [el('p', { html: 'No recipe cards yet.<br>Toss things together and see what happens!' })]));
      } else {
        this.cardI = clamp(this.cardI, 0, list.length - 1);
        // the dividers sticking up out of the box
        const rtabs = el('div', { class: 'ck-rtabs', role: 'tablist' });
        list.forEach((dish, i) => {
          rtabs.append(el('button', {
            class: 'ck-rtab' + (i === this.cardI ? ' on' : ''), role: 'tab', 'aria-selected': i === this.cardI ? 'true' : 'false', title: DISHES[dish].name,
            onclick: () => { if (i === this.cardI) return; flipDir = i > this.cardI ? 1 : -1; this.cardI = i; audio.play('page'); render(); },
          }, [img(iconURL(dish), '', DISHES[dish].name)]));
        });
        // keep the current card's divider in view (the strip scrolls sideways)
        requestAnimationFrame(() => {
          const on = rtabs.children[this.cardI];
          if (on && rtabs.scrollWidth > rtabs.clientWidth) rtabs.scrollLeft = on.offsetLeft - (rtabs.clientWidth - on.offsetWidth) / 2;
        });
        const dish = list[this.cardI];
        const r = RECIPES.find((x) => x.dish === dish);
        const ings = Object.keys(r.ing);
        const missing = ings.filter((id) => pantryCount(st, id) < r.ing[id]);
        const best = st.data.recipes[dish] || 0;
        const gr = gradeOf(best);
        const D = DISHES[dish];
        const card = el('div', { class: 'ck-rcard' + (flipDir ? (flipDir > 0 ? ' fwd' : ' back') : '') }, [
          el('div', { class: 'ck-rc-head' }, [
            el('span', { class: 'ck-rc-pic' }, [img(iconURL(dish), '', D.name)]),
            el('div', { class: 'ck-rc-name' }, [el('b', {}, D.name), D.buff ? el('span', { class: 'ck-buffchip', style: { background: BUFFS[D.buff].color } }, BUFFS[D.buff].name) : null]),
            el('div', { class: 'ck-rc-best', title: `Best: ${gr.g} (${Math.round(best)})` }, [img(KART.rosette(gr.g, true), 'ck-ros-s'), el('span', { style: { color: gr.color } }, gr.g)]),
          ]),
          el('div', { class: 'ck-rc-row' }, [el('small', {}, 'Steps'), el('span', { class: 'ck-rc-steps' }, r.steps.map((k, i) => el('i', { class: 'ck-tok' }, `${i + 1}. ${STEP_LABEL[k] || k}`)))]),
          el('div', { class: 'ck-rc-row' }, [
            el('small', {}, 'Needs'), el('span', { class: 'ck-rc-ings' }, ings.map((id) => el('span', { class: 'ck-rc-ing' + (pantryCount(st, id) < r.ing[id] ? ' no' : ''), title: ITEMS[id]?.name }, [img(iconURL(id), '', ITEMS[id]?.name || id)]))),
            el('button', { class: 'btn ck-rc-use', disabled: missing.length ? true : null, onclick: () => useCard(r) }, missing.length ? `Missing ${missing.length}` : 'Into the pot'),
          ]),
        ]);
        onSwipe(card, (d) => flip(-d));
        box.append(rtabs, el('div', { class: 'ck-rc-wrap' }, [
          el('button', { class: 'ck-flipb prev', 'aria-label': 'Previous card', title: 'Previous card (←)', disabled: list.length < 2 ? true : null, onclick: () => flip(-1) }),
          card,
          el('button', { class: 'ck-flipb next', 'aria-label': 'Next card', title: 'Next card (→)', disabled: list.length < 2 ? true : null, onclick: () => flip(1) }),
        ]));
      }
      const which = list.length ? `Card ${this.cardI + 1} of ${list.length} · ` : '';
      box.append(el('div', { class: 'ck-rfront' }, [el('span', { class: 'ck-rlabel', html: which + (left ? `<b>${left}</b> still undiscovered` : '<b>Every</b> recipe found. Grandma Mole would weep.') })]));
      scroll.append(box);
      flipDir = 0;
    };

    // ---- the pot on the stove
    const renderPot = () => {
      pot.innerHTML = '';
      pot.classList.toggle('full', sel.length > 0);
      pot.append(img(KART.stove(), 'ck-pot-stove'), img(KART.pot('back', sel.length > 0), 'ck-pot-back'));
      for (let i = 0; i < MAX_INGS; i++) {
        const id = sel[i];
        const x = POT_X[i] ?? 44;
        if (id) {
          pot.append(el('button', {
            class: 'ck-pitem interactive' + (id === added ? ' drop' : ''), title: `Take out ${ITEMS[id].name}`, 'aria-label': `Take ${ITEMS[id].name} out of the pot`,
            style: { left: `calc(var(--px) * ${x})`, '--i': i }, onclick: () => toggle(id),
          }, [img(iconURL(id), '', ITEMS[id].name)]));
        } else {
          pot.append(el('i', { class: 'ck-pring', style: { left: `calc(var(--px) * ${x})` } }));
        }
      }
      pot.append(img(KART.pot('front'), 'ck-pot-front'), el('span', { class: 'ck-pot-n' }, `${sel.length}/${MAX_INGS}`));
      if (sel.length) for (let i = 0; i < 5; i++) pot.append(el('i', { class: 'ck-steam', style: { left: `calc(var(--px) * ${18 + i * 20})`, animationDelay: `${i * 0.37}s` } }));
      added = null;
    };

    const render = () => {
      if (!panel.isConnected) return;
      const before = sel.length;
      sel = sel.filter((id) => pantryCount(st, id) > 0);
      if (sel.length !== before) opts.onChange(sel.slice());
      tabs.innerHTML = '';
      const nCards = known().length;
      for (const [k, label, ic] of [['ings', 'Shelves', 'jar'], ['cards', 'Recipe box', 'card']]) {
        tabs.append(el('button', {
          class: 'ck-tab' + (tab === k ? ' on' : ''), 'aria-pressed': tab === k ? 'true' : 'false',
          onclick: () => { if (tab === k) return; tab = k; intro = true; audio.play(k === 'cards' ? 'page' : 'ui_click'); render(); scroll.scrollTop = 0; },
        }, [img(KART.mini(ic), 'ck-tab-ic'), label, k === 'cards' ? el('b', { class: 'ck-tab-n' }, String(nCards)) : null]));
      }
      panel.dataset.tab = tab;
      const keep = scroll.scrollTop;
      scroll.innerHTML = '';
      scroll.classList.toggle('intro', intro);
      intro = false;
      if (tab === 'ings') renderIngs(); else renderCards();
      scroll.scrollTop = keep;
      renderPot();
      cookBtn.disabled = !sel.length;
      cookBtn.classList.toggle('ready', sel.length > 0);
      showInfo(opts.matchInfo(sel));
    };

    // ← → flip the recipe cards while the box is open
    this.offKeys?.();
    const onKey = (e) => {
      if (tab !== 'cards' || !panel.isConnected || this.game.ui.isPanelOpen()) return;
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); flip(e.code === 'ArrowLeft' ? -1 : 1); }
    };
    window.addEventListener('keydown', onKey);
    this.offKeys = () => { window.removeEventListener('keydown', onKey); this.offKeys = null; };

    render();
    this.pantryRender = render;
    return { setSelected: (ids) => { sel = ids.slice(); render(); } };
  }

  nudge(node) {
    node.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 220 });
  }

  closeSide(instant = false) {
    const s = this.side;
    this.side = null;
    this.offKeys?.();
    if (this.leaveBtn) { this.leaveBtn.remove(); this.leaveBtn = null; }
    if (!s) return;
    if (instant) { s.remove(); return; }
    s.classList.add('out');
    setTimeout(() => s.remove(), 260);
  }

  // ------------------------------------------------------------------ step HUD
  /** The order ticket pinned at the top; opts.onStop adds a "Stop" tag (it asks first). */
  stepHud(dishLabel, steps, opts = {}) {
    this.clearHud();
    this.top = el('div', { class: 'ck-top' });
    this.dishEl = el('div', { class: 'ck-dish' }, dishLabel);
    this.pips = steps.map((s, i) => el('span', { class: 'ck-pip' }, [el('small', {}, String(i + 1)), STEP_LABEL[s] || s]));
    this.timerImg = img(KART.timer(1), 'ck-timer-img');
    this.timerEl = el('div', { class: 'ck-timer', hidden: true, title: 'Time left' }, [this.timerImg]);
    this.timerK = -1;
    this.top.append(el('div', { class: 'ck-ticket' }, [el('i', { class: 'ck-tack' }), this.dishEl, el('div', { class: 'ck-pips' }, this.pips)]), this.timerEl);
    this.layer.append(this.top);
    this.esc = el('button', { class: 'ck-stop interactive', title: 'Stop cooking (Esc)', onclick: () => opts.onStop?.() }, [
      el('i', { class: 'ck-hook' }), img(KART.mini('stop'), 'ck-plaque-ic'), el('span', {}, 'Stop'), el('kbd', {}, 'Esc'),
    ]);
    if (!opts.onStop) this.esc.disabled = true;
    this.layer.append(this.esc);
  }

  setDish(label) { if (this.dishEl) this.dishEl.textContent = label; }

  setStep(i) {
    if (!this.pips) return;
    this.pips.forEach((p, k) => p.classList.toggle('cur', k === i));
  }

  markStep(i, score) {
    const p = this.pips?.[i];
    if (!p) return;
    p.classList.remove('cur');
    p.classList.add('done');
    p.append(stampImg(score));
  }

  timer(frac) {
    if (!this.timerEl) return;
    if (frac === null || frac === undefined) { this.timerEl.hidden = true; this.timerK = -1; return; }
    this.timerEl.hidden = false;
    const f = clamp(frac, 0, 1);
    const low = f < 0.25;
    const k = Math.round(f * 24) + (low ? 100 : 0);
    if (k !== this.timerK) { this.timerK = k; this.timerImg.src = KART.timer(f, low); }
    this.timerEl.classList.toggle('low', low);
  }

  hint(html) {
    if (this.hintEl) { this.hintEl.remove(); this.hintEl = null; }
    if (!html) return;
    this.hintEl = el('div', { class: 'ck-hint' }, [el('div', { class: 'ck-slate', html })]);
    this.layer.append(this.hintEl);
  }

  clearHud() {
    for (const k of ['top', 'esc', 'hintEl']) if (this[k]) { this[k].remove(); this[k] = null; }
    this.pips = null;
    this.clearWidgets();
  }

  // ------------------------------------------------------------------ big words
  title(word, sub) {
    const n = el('div', { class: 'ck-big ck-title' }, [sub ? el('span', { class: 'ck-sub' }, sub) : null, el('span', { class: 'ck-word' }, word)]);
    this.layer.append(n);
    setTimeout(() => n.remove(), 1150);
  }

  feedback(score) {
    const kind = score >= 90 ? 'perfect' : score >= 75 ? 'great' : score >= 50 ? 'good' : 'oops';
    const word = { perfect: 'PERFECT!', great: 'GREAT!', good: 'GOOD', oops: 'OOPS!' }[kind];
    const n = el('div', { class: 'ck-big ck-fb ' + kind }, [el('span', { class: 'ck-word' }, word), el('span', { class: 'ck-pts' }, [stampImg(score), `${Math.round(score)} pts`])]);
    this.layer.append(n);
    if (kind === 'perfect' || kind === 'great') {
      for (let i = 0; i < (kind === 'perfect' ? 16 : 8); i++) {
        const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3, r = 120 + Math.random() * 120;
        const s = el('i', { class: 'ck-star', style: { left: '50%', top: '45%', animationDelay: `${Math.random() * 0.15}s` } });
        s.style.setProperty('--dx', `${Math.cos(a) * r}px`);
        s.style.setProperty('--dy', `${Math.sin(a) * r * 0.6}px`);
        n.append(s);
      }
    }
    setTimeout(() => n.remove(), 1400);
    return kind;
  }

  floatAt(text, x, y, color = '#fff') {
    const n = el('div', { class: 'ck-float', style: { left: x + 'px', top: y + 'px', color } }, text);
    this.layer.append(n);
    setTimeout(() => n.remove(), 950);
  }

  // ------------------------------------------------------------------ widgets
  clearWidgets() {
    for (const w of this.widgets || []) w.remove();
    this.widgets = [];
  }

  addWidget(node) {
    (this.widgets ||= []).push(node);
    this.layer.append(node);
    return node;
  }

  /** A glass tube on a notched plank at the right. Returns {set(v), zone(lo,hi,sweet), mark(v|null), node, btn}. */
  gauge({ label = '', top = '', zone = null, button = null, sweet = false } = {}) {
    const fill = el('div', { class: 'fill' });
    const zoneEl = el('div', { class: 'zone' + (sweet ? ' sweet' : ''), hidden: !zone });
    const notch = el('div', { class: 'notch' + (sweet ? ' sweet' : ''), hidden: !zone });
    const mark = el('div', { class: 'mark', hidden: true });
    const track = el('div', { class: 'ck-track' }, [zoneEl, fill, el('div', { class: 'ticks' })]);
    const plank = el('div', { class: 'ck-plank' }, [notch, track, mark]);
    const kids = [top ? el('div', { class: 'lbl top' }, top) : null, plank, label ? el('div', { class: 'lbl' }, label) : null];
    let btn = null;
    if (button) { btn = el('button', { class: 'btn', onclick: button.onClick }, button.text); kids.push(btn); }
    const node = this.addWidget(el('div', { class: 'ck-gauge' }, kids));
    const api = {
      node, btn,
      set(v, color) { fill.style.height = (clamp(v, 0, 1) * 100).toFixed(1) + '%'; if (color) fill.style.setProperty('--liq', color); },
      zone(lo, hi) {
        for (const z of [zoneEl, notch]) { z.hidden = false; z.style.bottom = (lo * 100) + '%'; z.style.height = ((hi - lo) * 100) + '%'; }
        notch.style.bottom = `calc(var(--px) * 5 + (100% - var(--px) * 10) * ${lo})`;
        notch.style.height = `calc((100% - var(--px) * 10) * ${hi - lo})`;
      },
      mark(v) {
        if (v === null) { mark.hidden = true; return; }
        mark.hidden = false;
        mark.style.bottom = `calc(var(--px) * 5 + (100% - var(--px) * 10) * ${clamp(v, 0, 1)})`;
      },
    };
    if (zone) api.zone(zone[0], zone[1]);
    api.set(0);
    return api;
  }

  /** Horizontal doneness bar (fry, flip, bake): a brass bar, a golden window, a spoon pointer. */
  hbar({ win = [0.55, 0.8], label = '' } = {}) {
    const mark = el('div', { class: 'mark' }, [img(KART.spoon(), '', '')]);
    const winEl = el('div', { class: 'win', style: { left: (win[0] * 100) + '%', width: ((win[1] - win[0]) * 100) + '%' } });
    const side = el('div', { class: 'side' }, label);
    const bar = el('div', { class: 'ck-hbar' }, [el('div', { class: 'ends' }, [el('span', {}, 'Raw'), el('span', {}, 'Burnt')]), winEl, mark]);
    const flips = el('div', { class: 'ck-flips' });
    const node = this.addWidget(el('div', { class: 'ck-done' }, [side, bar, flips]));
    return {
      node,
      set(v) { mark.style.left = (clamp(v, 0, 1.25) / 1.25 * 100) + '%'; },
      side(t) { side.textContent = t; },
      flips(t) { flips.innerHTML = t; flips.hidden = !t; },
      setWin(a, b) { winEl.style.left = (a / 1.25 * 100) + '%'; winEl.style.width = ((b - a) / 1.25 * 100) + '%'; },
    };
  }

  /** Rhythm lane for kneading: paw tokens slide along a floured board. notes: [{t, side:'L'|'R'}]. */
  lane() {
    const hit = el('div', { class: 'hit' });
    const node = this.addWidget(el('div', { class: 'ck-lane' }, [hit]));
    const notes = new Map();
    return {
      node, hit,
      draw(list, now, speed) {
        const w = node.clientWidth || 400;
        const hx = hit.offsetLeft;
        for (const n of list) {
          let e = notes.get(n);
          const x = hx + (n.t - now) * speed * w;
          if (x > w + 40 || x < -60) { if (e) e.style.display = 'none'; continue; }
          if (!e) { e = el('div', { class: 'ck-note ' + n.side }, n.side); notes.set(n, e); node.append(e); }
          e.style.display = '';
          e.style.left = x + 'px';
          e.classList.toggle('ok', !!n.hit && n.res !== 'miss');
          e.classList.toggle('miss', n.res === 'miss');
        }
      },
      flash() { hit.classList.add('flash'); setTimeout(() => hit.classList.remove('flash'), 90); },
    };
  }

  // ------------------------------------------------------------------ result
  /** r: {dish, score, grade, isNew, steps:[{kind, score}], line, count, onEat, onAgain, onDone} */
  openResult(r) {
    this.closeSide(true);
    const d = DISHES[r.dish];
    const gr = gradeOf(r.score);
    const audio = this.game.audio;
    const tag = (kids, o = {}) => el('span', { class: 'ck-stat', ...o }, kids);
    const stats = el('div', { class: 'ck-stats' }, [
      tag([img(BOLT(), 'ck-stat-ic'), `+${d.energy} energy`]),
      ...[d.buff, d.buff2].filter(Boolean).map((b) => tag([el('i', { class: 'ck-dot', style: { background: BUFFS[b].color } }), `${BUFFS[b].name} ${r.buffSecs ? fmtSecs(r.buffSecs) : ''}`], { title: BUFFS[b].desc, class: 'ck-stat buff' })),
      r.ingQ !== undefined ? tag(`Ingredients ${Math.round(r.ingQ)}%`) : null,
      d.maxEnergy ? tag(`+${d.maxEnergy} max energy`) : null,
      tag(`×${r.made} made`),
    ]);
    const eatBtn = el('button', { class: 'ck-plank-btn eat', onclick: () => { r.onEat(); refresh(); } }, 'Eat now');
    const actions = el('div', { class: 'ck-actions' }, [
      eatBtn,
      el('button', { class: 'ck-plank-btn', onclick: () => r.onAgain() }, 'Cook again'),
      el('button', { class: 'ck-plank-btn', onclick: () => r.onDone() }, 'Done'),
    ]);
    const refresh = () => {
      const n = this.game.state.count(r.dish);
      eatBtn.disabled = n <= 0;
      eatBtn.textContent = n > 0 ? `Eat now (${n})` : 'Yum!';
    };
    refresh();
    const steps = el('div', { class: 'ck-bars' }, r.steps.map((s) => el('span', { class: 'ck-sres', title: `${STEP_LABEL[s.kind]}: ${Math.round(s.score)}` }, [stampImg(s.score), el('small', {}, STEP_LABEL[s.kind])])));
    const card = el('div', { class: 'ck-rescard' }, [
      el('i', { class: 'ck-tack l' }), el('i', { class: 'ck-tack r' }),
      r.isNew ? el('div', { class: 'ck-new' }, 'New recipe!') : null,
      el('h3', { class: 'ck-dname' }, d.name),
      el('div', { class: 'ck-r-mid' }, [
        el('div', { class: 'ck-reveal' }, [el('div', { class: 'ck-rays' }), el('div', { class: 'ck-frame' }, [img(iconURL(r.dish), 'ck-dish-img', d.name)])]),
        el('div', { class: 'ck-grade' }, [img(KART.rosette(gr.g), 'ck-ros'), el('b', { style: { color: gr.color } }, gr.g + (gr.g === 'Perfect' ? '!' : '')), el('small', {}, `score ${Math.round(r.score)} / 100`)]),
      ]),
      steps,
      stats,
      el('div', { class: 'ck-line' }, `“${r.line}”`),
    ]);
    const panel = el('div', { class: 'ck-side ck-result', role: 'dialog', 'aria-label': 'Dish result' }, [el('div', { class: 'scroll' }, [card, actions])]);
    this.side = panel;
    this.layer.append(panel);
    setTimeout(() => { if (panel.isConnected) audio.play('thud', { vol: 0.35 }); }, 420);
    return panel;
  }
}
