// DOM UI for the cooking scene: pantry panel, step HUD (pips, timer, hint), big words,
// meters, rhythm lane and the result card. Built on the shared panel/slot/btn styles.
import { el, clamp } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS, CAT_LABEL } from '../data/items.js';
import { DISHES, BUFFS, RECIPES } from '../data/recipes.js';
import { BOLT } from '../ui/UI.js';
import { ensureStyles } from './style.js';

export const GRADES = [
  { g: 'Perfect', min: 90, color: '#d89a10' },
  { g: 'Great', min: 75, color: '#3a9a3a' },
  { g: 'Good', min: 55, color: '#3a7ab8' },
  { g: 'Okay', min: 35, color: '#8a6a3a' },
  { g: 'Burnt', min: 0, color: '#6a3a2a' },
];
export const gradeOf = (score) => GRADES.find((x) => score >= x.min) || GRADES[GRADES.length - 1];

export const STEP_LABEL = { chop: 'Chop', crack: 'Crack', stir: 'Stir', season: 'Season', fry: 'Fry', pour: 'Pour', knead: 'Knead', plate: 'Plate' };

const COOKABLE_CATS = ['plant', 'critter', 'ingredient'];
const COOKABLE_EXTRA = ['salt_crystal', 'egg'];
export function isCookable(id) {
  const it = ITEMS[id];
  return !!it && (COOKABLE_CATS.includes(it.cat) || COOKABLE_EXTRA.includes(id));
}

export class CookUI {
  constructor(game) {
    ensureStyles();
    this.game = game;
    this.root = el('div', { class: 'ck-root' });
    game.ui.world.append(this.root);
    this.layer = el('div');
    this.root.append(this.layer);
  }

  destroy() { this.root.remove(); }

  // ------------------------------------------------------------------ pantry
  /**
   * opts: { selected: [ids], onChange(ids), onCook(ids), onLeave(), matchInfo(ids) → html }
   */
  openPantry(opts) {
    this.closeSide(true);
    const st = this.game.state;
    let sel = opts.selected.slice();
    let tab = opts.tab || 'ings';
    const panel = el('div', { class: 'panel ck-side', role: 'dialog', 'aria-label': 'Pantry' });
    const title = el('h2', {}, ['Pantry', el('small', {}, 'pick 1 to 3')]);
    const tabs = el('div', { class: 'tabs' });
    const scroll = el('div', { class: 'ck-scroll' });
    const info = el('div', { class: 'ck-info' });
    const tray = el('div', { class: 'ck-tray' });
    const cookBtn = el('button', { class: 'btn big ck-cookbtn', onclick: () => { if (sel.length) opts.onCook(sel.slice()); } }, 'Cook!');
    panel.append(title, tabs, scroll, info, tray);
    this.side = panel;
    this.layer.append(panel);
    const leave = el('button', { class: 'btn alt ck-leave', onclick: () => opts.onLeave() }, '← Back home');
    this.layer.append(leave);
    this.leaveBtn = leave;

    const items = () => {
      const out = [];
      for (const g of st.inventory((it) => it && isCookable(it.id))) if (st.count(g.id) > 0) out.push(g.id);
      const order = { plant: 0, critter: 1, ingredient: 2, mineral: 3 };
      out.sort((a, b) => (order[ITEMS[a].cat] - order[ITEMS[b].cat]) || ITEMS[a].name.localeCompare(ITEMS[b].name));
      return out;
    };

    const toggle = (id) => {
      const i = sel.indexOf(id);
      if (i >= 0) sel.splice(i, 1);
      else if (sel.length < 3) sel.push(id);
      else { this.game.audio.play('ui_error'); this.nudge(tray); return; }
      this.game.audio.play('ui_click', { pitch: i >= 0 ? 0.8 : 1.2 });
      opts.onChange(sel.slice());
      render();
    };

    const renderIngs = () => {
      const list = items();
      const grid = el('div', { class: 'ck-grid' });
      if (!list.length) {
        scroll.append(el('div', { class: 'ck-empty', html: 'The pantry is bare.<br>Plants and critters turn up in the mines, and the grocer in town sells basics.' }));
        return;
      }
      let lastCat = null;
      for (const id of list) {
        const it = ITEMS[id];
        const cat = it.cat === 'mineral' ? 'ingredient' : it.cat;
        if (cat !== lastCat) { grid.append(el('div', { class: 'ck-cat' }, cat === 'critter' ? 'Critters' : cat === 'plant' ? 'Plants' : 'Basics')); lastCat = cat; }
        const on = sel.includes(id);
        grid.append(el('div', {
          class: 'slot interactive' + (on ? ' on' : ''), title: it.name, role: 'button', tabindex: 0, 'aria-pressed': on ? 'true' : 'false',
          onclick: () => toggle(id),
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id); } },
          onmouseenter: () => { info.innerHTML = `<b>${it.name}</b> · ${it.desc || ''}`; },
        }, [el('img', { class: 'pix', src: iconURL(id), alt: it.name }), el('span', { class: 'n' }, '×' + st.count(id))]));
      }
      scroll.append(grid);
    };

    const renderCards = () => {
      const known = Object.keys(st.data.recipes || {}).filter((d) => DISHES[d] && d !== 'mystery_mush');
      const wrap = el('div', { class: 'ck-cards' });
      if (!known.length) wrap.append(el('div', { class: 'ck-empty', html: 'No recipe cards yet.<br>Toss things together and see what happens!' }));
      for (const dish of known) {
        const r = RECIPES.find((x) => x.dish === dish);
        if (!r) continue;
        const ings = Object.keys(r.ing);
        const have = ings.every((id) => st.count(id) >= r.ing[id]);
        const best = st.data.recipes[dish] || 0;
        const gr = gradeOf(best);
        const missing = ings.filter((id) => st.count(id) < 1).length;
        wrap.append(el('div', {
          class: 'ck-card interactive' + (have ? '' : ' missing'), role: 'button', tabindex: 0, title: have ? 'Use these ingredients' : 'Missing ingredients',
          onclick: () => {
            if (!have) { this.game.audio.play('ui_error'); return; }
            sel = ings.slice();
            this.game.audio.play('page');
            opts.onChange(sel.slice());
            tab = 'ings';
            render();
          },
        }, [
          el('img', { class: 'pix', src: iconURL(dish), alt: '' }),
          el('div', {}, [
            el('div', { class: 'nm' }, DISHES[dish].name),
            el('div', { class: 'ings' }, [...ings.map((id) => el('img', { class: 'pix' + (st.count(id) < 1 ? ' no' : ''), src: iconURL(id), title: ITEMS[id]?.name, alt: ITEMS[id]?.name })), missing ? el('span', {}, `need ${missing}`) : null]),
          ]),
          el('div', { class: 'gr', style: { color: gr.color } }, [gr.g, el('small', {}, `best ${Math.round(best)}`)]),
        ]));
      }
      const knownSet = new Set(known);
      const left = RECIPES.filter((r) => !knownSet.has(r.dish)).length;
      wrap.append(el('div', { class: 'ck-secret', html: left ? `<b>${left}</b> recipe${left === 1 ? '' : 's'} still undiscovered` : '<b>Every</b> recipe discovered. Grandma Mole would weep.' }));
      scroll.append(wrap);
    };

    const render = () => {
      tabs.innerHTML = '';
      const nCards = Object.keys(st.data.recipes || {}).filter((d) => DISHES[d] && d !== 'mystery_mush').length;
      for (const [k, label] of [['ings', 'Ingredients'], ['cards', `Recipe cards (${nCards})`]]) {
        tabs.append(el('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; this.game.audio.play('page'); render(); } }, label));
      }
      const keep = scroll.scrollTop;
      scroll.innerHTML = '';
      if (tab === 'ings') renderIngs(); else renderCards();
      scroll.scrollTop = keep;
      tray.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const id = sel[i];
        if (i > 0) tray.append(el('span', { class: 'ck-plus' }, '+'));
        tray.append(id
          ? el('div', { class: 'ck-tslot full interactive', title: `Remove ${ITEMS[id].name}`, onclick: () => toggle(id) }, [el('img', { class: 'pix', src: iconURL(id), alt: ITEMS[id].name }), el('span', { class: 'x' }, 'x')])
          : el('div', { class: 'ck-tslot' }));
      }
      cookBtn.disabled = !sel.length;
      tray.append(cookBtn);
      info.innerHTML = opts.matchInfo(sel);
    };
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
    if (this.leaveBtn) { this.leaveBtn.remove(); this.leaveBtn = null; }
    if (!s) return;
    if (instant) { s.remove(); return; }
    s.classList.add('out');
    setTimeout(() => s.remove(), 260);
  }

  // ------------------------------------------------------------------ step HUD
  stepHud(dishLabel, steps) {
    this.clearHud();
    this.top = el('div', { class: 'ck-top' });
    this.dishEl = el('div', { class: 'ck-dish' }, dishLabel);
    this.pips = steps.map((s) => el('span', { class: 'ck-pip' }, STEP_LABEL[s] || s));
    this.timerFill = el('i');
    this.timerEl = el('div', { class: 'ck-timer', hidden: true }, [this.timerFill]);
    this.top.append(this.dishEl, el('div', { class: 'ck-pips' }, this.pips), this.timerEl);
    this.layer.append(this.top);
    this.esc = el('div', { class: 'ck-esc', html: '<kbd>Esc</kbd> stop cooking' });
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
    const tag = score >= 90 ? '★' : score >= 75 ? '✓' : score >= 50 ? '·' : '✗';
    p.append(el('i', { style: { color: score >= 90 ? '#ffe066' : score >= 75 ? '#9af07a' : score >= 50 ? '#9fdcff' : '#ff9a8a' } }, tag));
  }

  timer(frac) {
    if (!this.timerEl) return;
    if (frac === null || frac === undefined) { this.timerEl.hidden = true; return; }
    this.timerEl.hidden = false;
    this.timerFill.style.width = (clamp(frac, 0, 1) * 100).toFixed(1) + '%';
    this.timerEl.classList.toggle('low', frac < 0.25);
  }

  hint(html) {
    if (this.hintEl) { this.hintEl.remove(); this.hintEl = null; }
    if (!html) return;
    this.hintEl = el('div', { class: 'ck-hint', html });
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
    const n = el('div', { class: 'ck-big ck-fb ' + kind }, [el('span', { class: 'ck-word' }, word), el('span', { class: 'ck-pts' }, `${Math.round(score)} pts`)]);
    this.layer.append(n);
    if (kind === 'perfect' || kind === 'great') {
      for (let i = 0; i < (kind === 'perfect' ? 16 : 8); i++) {
        const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3, r = 120 + Math.random() * 120;
        const s = el('i', { class: 'ck-star', style: { left: '50%', top: '45%', '--dx': `${Math.cos(a) * r}px`, '--dy': `${Math.sin(a) * r * 0.6}px`, animationDelay: `${Math.random() * 0.15}s` } });
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

  /** Vertical gauge at the right. Returns {set(v), zone(lo,hi,sweet), mark(v|null), node, btn}. */
  gauge({ label = '', top = '', zone = null, button = null, sweet = false } = {}) {
    const fill = el('div', { class: 'fill' });
    const zoneEl = el('div', { class: 'zone' + (sweet ? ' sweet' : ''), hidden: !zone });
    const mark = el('div', { class: 'mark', hidden: true });
    const track = el('div', { class: 'ck-track' }, [zoneEl, fill, mark]);
    const kids = [top ? el('div', { class: 'lbl' }, top) : null, track, label ? el('div', { class: 'lbl' }, label) : null];
    let btn = null;
    if (button) { btn = el('button', { class: 'btn', onclick: button.onClick }, button.text); kids.push(btn); }
    const node = this.addWidget(el('div', { class: 'ck-gauge' }, kids));
    const api = {
      node, btn,
      set(v, color) { fill.style.height = `calc(${(clamp(v, 0, 1) * 100).toFixed(1)}% - var(--px) * 2)`; if (color) fill.style.background = color; },
      zone(lo, hi) { zoneEl.hidden = false; zoneEl.style.bottom = (lo * 100) + '%'; zoneEl.style.height = ((hi - lo) * 100) + '%'; },
      mark(v) { if (v === null) { mark.hidden = true; return; } mark.hidden = false; mark.style.bottom = (clamp(v, 0, 1) * 100) + '%'; },
    };
    if (zone) api.zone(zone[0], zone[1]);
    api.set(0);
    return api;
  }

  /** Horizontal doneness bar (fry). */
  hbar({ win = [0.55, 0.8], label = '' } = {}) {
    const mark = el('div', { class: 'mark' });
    const winEl = el('div', { class: 'win', style: { left: (win[0] * 100) + '%', width: ((win[1] - win[0]) * 100) + '%' } });
    const side = el('div', { class: 'side' }, label);
    const bar = el('div', { class: 'ck-hbar' }, [winEl, mark, side]);
    const flips = el('div', { class: 'ck-flips' });
    const node = this.addWidget(el('div', { class: 'ck-done' }, [bar, flips]));
    return {
      node,
      set(v) { mark.style.left = (clamp(v, 0, 1.25) / 1.25 * 100) + '%'; },
      side(t) { side.textContent = t; },
      flips(t) { flips.innerHTML = t; },
      setWin(a, b) { winEl.style.left = (a / 1.25 * 100) + '%'; winEl.style.width = ((b - a) / 1.25 * 100) + '%'; },
    };
  }

  /** Rhythm lane for kneading. notes: [{t, side:'L'|'R'}]. */
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
    const panel = el('div', { class: 'panel ck-side ck-result', role: 'dialog', 'aria-label': 'Dish result' });
    const stats = el('div', { class: 'ck-stats' }, [
      el('span', { class: 'ck-stat' }, [el('img', { class: 'pix', src: BOLT(), alt: '' }), `+${d.energy} energy`]),
      d.buff ? el('span', { class: 'ck-stat', style: { color: BUFFS[d.buff].color, background: '#2a1a12', borderColor: '#000' } }, BUFFS[d.buff].name) : null,
      d.maxEnergy ? el('span', { class: 'ck-stat' }, `+${d.maxEnergy} max energy`) : null,
      el('span', { class: 'ck-stat' }, `×${r.made} made`),
    ]);
    const eatBtn = el('button', { class: 'btn', onclick: () => { r.onEat(); refresh(); } }, 'Eat now');
    const actions = el('div', { class: 'ck-actions' }, [
      eatBtn,
      el('button', { class: 'btn alt', onclick: () => r.onAgain() }, 'Cook again'),
      el('button', { class: 'btn alt', onclick: () => r.onDone() }, 'Done'),
    ]);
    const refresh = () => {
      const n = this.game.state.count(r.dish);
      eatBtn.disabled = n <= 0;
      eatBtn.textContent = n > 0 ? `Eat now (${n})` : 'Yum!';
    };
    refresh();
    const body = el('div', { class: 'scroll' }, [
      r.isNew ? el('div', { class: 'ck-new' }, 'NEW RECIPE!') : null,
      el('div', { class: 'ck-reveal' }, [el('div', { class: 'ck-rays' }), el('img', { class: 'pix', src: iconURL(r.dish), alt: d.name })]),
      el('h3', { class: 'ck-dname' }, d.name),
      el('div', { class: 'ck-grade', style: { color: gr.color } }, [gr.g + (gr.g === 'Perfect' ? '!' : ''), el('small', {}, `score ${Math.round(r.score)} / 100`)]),
      el('div', { class: 'ck-bars' }, r.steps.map((s) => el('span', { style: { color: s.score >= 90 ? '#b07a14' : s.score >= 50 ? '#3a6a2a' : '#a83a2a' } }, `${STEP_LABEL[s.kind]} ${Math.round(s.score)}`))),
      stats,
      el('div', { class: 'ck-line' }, `“${r.line}”`),
      actions,
    ]);
    panel.append(body);
    this.side = panel;
    this.layer.append(panel);
    return panel;
  }
}
