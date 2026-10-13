// DOM HUD + panels layered over the pixel canvas.
import { el, formatGoldFull, formatGold, clamp } from '../core/util.js';
import { iconURL, specURL, weaponIconURL } from '../gfx/PixelArt.js';
import { ITEMS, sellPrice, CAT_LABEL } from '../data/items.js';
import { BUFFS } from '../data/recipes.js';
import { GOAL_GOLD, indexName } from '../core/State.js';
import { gradeFor } from '../data/weapons.js';

export const COIN = () => specURL('ui:coin', { k: 'coin' });
export const BOLT = () => specURL('ui:bolt', { k: 'bolt' });
export const BOOK = () => specURL('ui:book', { k: 'book' });
export const HEART = () => specURL('ui:heart', { k: 'heart' });

export function qColor(q) {
  return q >= 90 ? '#2a9a3a' : q >= 70 ? '#5a8a2a' : q >= 45 ? '#b07a14' : '#c0402a';
}

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.panelStack = [];
    this.bubbles = new Map();
    this.goldShown = game.state.gold;
    this.hudMode = 'none';

    this.world = el('div', { class: 'world-layer' });
    this.hud = el('div', { class: 'hud' });
    this.overlay = el('div', { class: 'overlay' });
    this.root.append(this.world, this.hud, this.overlay);
    this.buildHud();

    const st = game.state;
    st.on('gold', (e) => { if (e.delta > 0) this.goldEl.classList.add('bump'); setTimeout(() => this.goldEl.classList.remove('bump'), 260); });
    st.on('energy', () => this.updateEnergy());
    st.on('buffs', () => this.updateBuffs());
    st.on('day', () => this.updateDay());
    st.on('discover', (e) => this.discoverCard(e));
    st.on('load', () => { this.goldShown = st.gold; this.refreshHud(); });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.panelStack.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.closePanel();
      }
    }, true);
  }

  // ------------------------------------------------------------ HUD
  buildHud() {
    const st = this.game.state;
    this.goldNum = el('span', { class: 'gold-num' }, formatGoldFull(st.gold));
    this.goldEl = el('div', { class: 'chip gold-chip', title: 'Gold' }, [el('img', { class: 'pix', src: COIN(), alt: '' }), this.goldNum]);
    this.goalFill = el('i');
    this.goalTxt = el('span');
    this.goalEl = el('div', { class: 'goal', title: 'Savings toward the Surface Ticket' }, [el('div', { class: 'goal-bar' }, [this.goalFill]), this.goalTxt]);
    this.energyFill = el('i');
    this.energyTxt = el('span');
    this.energyBar = el('div', { class: 'energy-bar' }, [this.energyFill, this.energyTxt]);
    this.energyEl = el('div', { class: 'energy-wrap', title: 'Energy' }, [el('img', { class: 'pix', src: BOLT(), alt: '', style: { width: 'calc(var(--px) * 12)', height: 'calc(var(--px) * 12)' } }), this.energyBar]);
    this.dayEl = el('div', { class: 'daytag' });
    this.buffsEl = el('div', { class: 'buffs' });
    this.tl = el('div', { class: 'hud-tl' }, [this.goldEl, this.goalEl, this.energyEl, this.dayEl, this.buffsEl]);

    this.bookBadge = el('span', { class: 'badge', hidden: true }, '!');
    this.btnBook = el('button', { class: 'icon-btn interactive', title: 'Index Book (B)', 'aria-label': 'Index Book', onclick: () => this.openIndex() }, [el('img', { class: 'pix', src: BOOK(), alt: '' }), this.bookBadge, el('span', { class: 'key' }, 'B')]);
    this.btnBag = el('button', { class: 'icon-btn interactive', title: 'Inventory (I)', 'aria-label': 'Inventory', onclick: () => this.openInventory() }, [el('img', { class: 'pix', src: iconURL('bag_medium'), alt: '' }), el('span', { class: 'key' }, 'I')]);
    this.btnMenu = el('button', { class: 'icon-btn interactive', title: 'Menu (Esc)', 'aria-label': 'Menu', onclick: () => this.openMenu() }, [el('span', { style: { fontWeight: 700, fontSize: '1.2em', color: '#3a2212' } }, '≡'), el('span', { class: 'key' }, 'Esc')]);
    this.tr = el('div', { class: 'hud-tr' }, [this.btnBook, this.btnBag, this.btnMenu]);

    this.depthEl = el('div', { class: 'depth', hidden: true });
    this.toasts = el('div', { class: 'toasts' });
    this.promptEl = el('div', { class: 'prompt', hidden: true });
    this.hotbarEl = el('div', { class: 'hotbar', hidden: true });
    this.hotbarLabel = el('div', { class: 'hotbar-label', hidden: true });
    this.hintEl = el('div', { class: 'hint-keys', hidden: true });
    this.hud.append(this.tl, this.tr, this.depthEl, this.toasts, this.promptEl, this.hotbarLabel, this.hotbarEl, this.hintEl);
    this.refreshHud();
  }

  setHudMode(mode) {
    this.hudMode = mode;
    const show = mode !== 'none';
    this.tl.hidden = !show;
    this.tr.hidden = !show;
    this.depthEl.hidden = mode !== 'mine';
    if (!show) { this.setHotbar(null); this.setPrompt(null); this.setHints(null); }
    this.refreshHud();
  }

  refreshHud() {
    this.updateEnergy();
    this.updateDay();
    this.updateBuffs();
    this.updateGold(true);
  }

  updateGold(snap = false) {
    const target = this.game.state.gold;
    if (snap) this.goldShown = target;
    const diff = target - this.goldShown;
    if (Math.abs(diff) < 1) this.goldShown = target;
    else this.goldShown += diff * 0.18 + Math.sign(diff) * 0.5;
    this.goldNum.textContent = formatGoldFull(Math.round(this.goldShown));
    const p = clamp(target / GOAL_GOLD, 0, 1);
    this.goalFill.style.width = (p * 100).toFixed(2) + '%';
    this.goalTxt.textContent = `${formatGold(target)} / 1M`;
  }

  updateEnergy() {
    const st = this.game.state;
    const p = st.energy / st.maxEnergy;
    this.energyFill.style.width = (p * 100).toFixed(1) + '%';
    this.energyTxt.textContent = `${Math.ceil(st.energy)} / ${st.maxEnergy}`;
    this.energyBar.classList.toggle('low', p < 0.2);
  }

  updateDay() { this.dayEl.textContent = `Day ${this.game.state.data.day}`; }

  updateBuffs() {
    const st = this.game.state;
    this.buffsEl.innerHTML = '';
    for (const b of st.data.buffs) {
      const def = BUFFS[b.id];
      if (!def) continue;
      const left = Math.max(0, Math.ceil((b.until - st.data.playTime) / 60));
      this.buffsEl.append(el('span', { class: 'buff', style: { color: def.color }, title: def.desc }, `${def.name} ${left}m`));
    }
  }

  setDepth(html) { this.depthEl.innerHTML = html; }

  setHints(html) {
    if (!html) { this.hintEl.hidden = true; return; }
    this.hintEl.hidden = false;
    this.hintEl.innerHTML = html;
  }

  /** Per-frame HUD tick (gold count-up, bubbles fade). */
  update(dt) {
    if (Math.abs(this.goldShown - this.game.state.gold) >= 1) this.updateGold();
    this._buffTimer = (this._buffTimer || 0) + dt;
    if (this._buffTimer > 5) { this._buffTimer = 0; this.game.state.tickBuffs(); this.updateBuffs(); }
  }

  // ------------------------------------------------------------ toasts / popups
  toast(text, { icon, kind = '', dur = 2600 } = {}) {
    const t = el('div', { class: 'toast ' + kind }, [icon ? el('img', { class: 'pix', src: icon, alt: '' }) : null, el('span', { html: text })]);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, dur);
    return t;
  }

  discoverCard(e) {
    this._discQ = this._discQ || [];
    this._discQ.push(e);
    if (!this._discBusy) this._nextDiscover();
  }

  _nextDiscover() {
    const e = this._discQ.shift();
    if (!e) { this._discBusy = false; return; }
    this._discBusy = true;
    this._showDiscover(e);
    setTimeout(() => this._nextDiscover(), this._discQ.length > 3 ? 650 : 1300);
  }

  _showDiscover({ cat, id, name }) {
    const icon = this.indexIcon(cat, id);
    const label = { mineral: 'New mineral', gem: 'New gem', plant: 'New plant', critter: 'New creature', weapon: 'New weapon', recipe: 'New recipe', mechanic: 'Learned' }[cat] || 'Discovered';
    const card = el('div', { class: 'discover' }, [el('img', { class: 'pix', src: icon, alt: '' }), el('div', {}, [el('small', {}, label + ' · Index Book'), el('b', {}, name)])]);
    this.hud.append(card);
    this.bookBadge.hidden = false;
    this.game.audio.play('discover');
    const existing = [...this.hud.querySelectorAll('.discover:not(.out)')];
    if (existing.length > 3) { const old = existing[0]; old.classList.add('out'); setTimeout(() => old.remove(), 380); existing.shift(); }
    existing.forEach((c, i) => { c.style.top = `calc(var(--px) * ${56 + (existing.length - 1 - i) * 34})`; });
    setTimeout(() => { card.classList.add('out'); setTimeout(() => card.remove(), 380); }, 3200);
  }

  indexIcon(cat, id) {
    if (cat === 'mechanic') return BOOK();
    if (cat === 'critter') return creatureIconURL(id);
    if (cat === 'weapon') return weaponIconURL(id, 'iron');
    if (cat === 'recipe') return iconURL(id);
    return ITEMS[id] ? iconURL(id) : BOOK();
  }

  setPrompt(html) {
    if (!html) { this.promptEl.hidden = true; this._prompt = null; return; }
    if (this._prompt === html) return;
    this._prompt = html;
    this.promptEl.innerHTML = html;
    this.promptEl.hidden = false;
  }

  /** slots: [{icon, key, label, off, n, meter}] */
  setHotbar(slots, sel = 0, onPick = null) {
    if (!slots) { this.hotbarEl.hidden = true; this.hotbarLabel.hidden = true; this._hotSig = null; return; }
    const sig = JSON.stringify(slots.map((s) => [s.icon, s.key, s.off, s.n])) + sel;
    this.hotbarEl.hidden = false;
    if (sig !== this._hotSig) {
      this._hotSig = sig;
      this.hotbarEl.innerHTML = '';
      this.hotSlots = slots.map((s, i) => {
        const meter = el('div', { class: 'meter', hidden: s.meter === undefined }, [el('i', { style: { width: ((s.meter || 0) * 100) + '%' } })]);
        const node = el('div', { class: 'hotbar-slot' + (i === sel ? ' sel' : '') + (s.off ? ' off' : ''), title: s.label, onclick: () => onPick && onPick(i) }, [
          el('img', { class: 'pix', src: s.icon, alt: '' }), el('span', { class: 'k' }, s.key || ''), s.n !== undefined ? el('span', { class: 'n' }, String(s.n)) : null, meter,
        ]);
        this.hotbarEl.append(node);
        return { node, meter };
      });
    }
    const lab = slots[sel]?.label;
    this.hotbarLabel.hidden = !lab;
    if (lab) this.hotbarLabel.textContent = lab;
  }
  setHotbarMeter(i, v) {
    const s = this.hotSlots?.[i];
    if (!s) return;
    s.meter.hidden = v === null || v === undefined;
    if (!s.meter.hidden) s.meter.firstChild.style.width = clamp(v, 0, 1) * 100 + '%';
  }

  // ------------------------------------------------------------ world-anchored
  floatText(text, sx, sy, color = '#fff', size = 1) {
    const t = el('div', { class: 'float-text', style: { left: sx + 'px', top: sy + 'px', color, fontSize: size + 'em' } }, text);
    this.world.append(t);
    setTimeout(() => t.remove(), 1150);
  }

  /** Create/update a speech bubble at screen coords. */
  bubble(key, text, sx, sy, { emote = false, life = 3, name = null } = {}) {
    let b = this.bubbles.get(key);
    if (!b) {
      const node = el('div', { class: 'bubble' + (emote ? ' emote' : '') });
      this.world.append(node);
      b = { node, text: null, t: 0 };
      this.bubbles.set(key, b);
    }
    if (text !== null && text !== b.text) {
      b.text = text;
      b.node.innerHTML = name ? `<b>${name}</b>${text}` : text;
      b.t = 0;
      b.life = life;
      b.node.className = 'bubble' + (emote ? ' emote' : '');
    }
    b.node.style.left = sx + 'px';
    b.node.style.top = sy + 'px';
    b.node.style.opacity = '1';
    return b;
  }
  moveBubble(key, sx, sy, visible = true) {
    const b = this.bubbles.get(key);
    if (!b) return;
    b.node.style.left = sx + 'px';
    b.node.style.top = sy + 'px';
    b.node.style.display = visible ? '' : 'none';
  }
  hideBubble(key) {
    const b = this.bubbles.get(key);
    if (b) { b.node.remove(); this.bubbles.delete(key); }
  }
  tickBubbles(dt) {
    for (const [k, b] of this.bubbles) {
      b.t += dt;
      if (b.life && b.t > b.life) { b.node.style.opacity = '0'; if (b.t > b.life + 0.3) this.hideBubble(k); }
    }
  }
  clearWorld() {
    this.world.innerHTML = '';
    this.bubbles.clear();
  }

  // ------------------------------------------------------------ panels
  isPanelOpen() { return this.panelStack.length > 0; }

  openPanel({ title, sub, body, className = '', width, onClose, closable = true, noBack = false }) {
    this.game.audio.play('ui_open');
    const panel = el('div', { class: 'panel ' + className, role: 'dialog', 'aria-label': title || 'Panel', style: width ? { width } : {} });
    if (title) panel.append(el('h2', {}, title));
    if (sub) panel.append(el('p', { class: 'sub', html: sub }));
    if (body) panel.append(body);
    const back = el('div', { class: 'modal-back' }, [panel]);
    const handle = { el: panel, back, onClose, closed: false };
    handle.close = () => this.closePanel(handle);
    if (closable) panel.append(el('button', { class: 'close', 'aria-label': 'Close', onclick: () => handle.close() }, 'X'));
    back.addEventListener('pointerdown', (e) => { if (e.target === back && closable && !noBack) handle.close(); });
    this.overlay.append(back);
    this.panelStack.push(handle);
    this.game.input.enabled = false;
    this.game.input.clearAll();
    return handle;
  }

  closePanel(handle) {
    const h = handle || this.panelStack[this.panelStack.length - 1];
    if (!h || h.closed) return;
    h.closed = true;
    h.back.remove();
    this.panelStack = this.panelStack.filter((p) => p !== h);
    if (!this.panelStack.length) {
      this.game.input.enabled = true;
      this.game.input.clearAll();
    }
    this.game.audio.play('ui_close');
    if (h.onClose) h.onClose();
  }

  closeAllPanels() {
    while (this.panelStack.length) this.closePanel();
  }

  confirm(text, yes = 'Yes', no = 'No') {
    return new Promise((resolve) => {
      let done = false;
      const body = el('div', { class: 'menu-list' }, [
        el('p', { html: text, style: { margin: 0, maxWidth: '44ch', paddingRight: 'calc(var(--px) * 12)' } }),
        el('div', { class: 'row' }, [
          el('button', { class: 'btn', onclick: () => { done = true; h.close(); resolve(true); } }, yes),
          el('button', { class: 'btn alt', onclick: () => { done = true; h.close(); resolve(false); } }, no),
        ]),
      ]);
      const h = this.openPanel({ body, onClose: () => { if (!done) resolve(false); } });
    });
  }

  // ------------------------------------------------------------ inventory
  openInventory() {
    if (this.panelStack.some((p) => p.kind === 'inv')) return;
    const st = this.game.state;
    const tabs = [
      ['all', 'All'], ['mineral', 'Minerals'], ['gem', 'Gems'], ['ingot', 'Ingots'], ['plant', 'Plants & Critters'],
      ['food', 'Food'], ['weapon', 'Weapons'], ['gear', 'Gear'], ['furniture', 'Furniture'],
    ];
    let tab = 'all';
    let selected = null;
    const tabRow = el('div', { class: 'tabs' });
    const grid = el('div', { class: 'grid' });
    const detail = el('div', { class: 'detail' }, 'Pick something to inspect it.');
    const scroll = el('div', { class: 'scroll', style: { maxHeight: 'calc(var(--px) * 110)' } }, [grid]);
    const body = el('div', { style: { display: 'flex', flexDirection: 'column', minHeight: 0 } }, [tabRow, scroll, detail]);

    const match = (it) => {
      if (!it) return false;
      if (tab === 'all') return true;
      if (tab === 'plant') return ['plant', 'critter', 'drop', 'ingredient'].includes(it.cat);
      if (tab === 'gear') return ['tool', 'equip', 'consumable', 'blueprint', 'key'].includes(it.cat);
      if (tab === 'furniture') return ['furniture', 'floor', 'wallpaper'].includes(it.cat);
      return it.cat === tab;
    };

    const render = () => {
      tabRow.innerHTML = '';
      for (const [k, label] of tabs) tabRow.append(el('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { tab = k; selected = null; render(); } }, label));
      grid.innerHTML = '';
      const entries = [];
      if (tab === 'weapon' || tab === 'all') {
        for (const w of st.data.weapons) entries.push({ weapon: w });
      }
      if (tab !== 'weapon') {
        for (const g of st.inventory(match)) entries.push(g);
        if (tab === 'gear' || tab === 'all') for (const id of Object.keys(st.data.owned)) {
          const it = ITEMS[id];
          if (it && match(it) && ['tool', 'equip', 'blueprint', 'key'].includes(it.cat)) entries.push({ id, n: 1, owned: true });
        }
      }
      if (!entries.length) grid.append(el('p', { class: 'muted', style: { gridColumn: '1 / -1' } }, 'Nothing here yet.'));
      for (const e of entries) {
        if (e.weapon) {
          const w = e.weapon;
          grid.append(el('div', { class: 'slot' + (selected === w.uid ? ' on' : ''), title: w.name, onclick: () => { selected = w.uid; showWeapon(w); render(); } }, [
            el('img', { class: 'pix', src: weaponIconURL(w.type, w.metal, w.infusion), alt: '' }),
            el('span', { class: 'q', style: { color: gradeFor(w.score).color, textShadow: '0 1px 0 #000' } }, w.grade),
          ]));
          continue;
        }
        const it = ITEMS[e.id];
        const isEq = it.slot && st.data.equip[it.slot] === e.id;
        grid.append(el('div', { class: 'slot' + (selected === e.id ? ' on' : ''), title: it.name, onclick: () => { selected = e.id; showItem(e); render(); } }, [
          el('img', { class: 'pix', src: iconURL(e.id), alt: '' }),
          e.avgQ !== undefined ? el('span', { class: 'q', style: { color: qColor(e.avgQ) } }, e.avgQ + '%') : null,
          e.n > 1 || (!e.owned && e.n) ? el('span', { class: 'n' }, '×' + e.n) : null,
          isEq ? el('span', { class: 'eq' }, 'ON') : null,
        ]));
      }
    };

    const showItem = (e) => {
      const it = ITEMS[e.id];
      detail.innerHTML = '';
      const parts = [el('div', { class: 'row' }, [el('b', {}, it.name), el('span', { class: 'muted' }, CAT_LABEL[it.cat] || it.cat), el('span', { class: 'spacer' })])];
      parts.push(el('div', { class: 'muted', style: { margin: 'calc(var(--px)*1.5) 0' } }, it.desc || ''));
      const info = [];
      if (e.avgQ !== undefined) info.push(`Avg quality <b style="color:${qColor(e.avgQ)}">${e.avgQ}%</b> · ${e.lots.filter((l) => l.p).length} pristine`);
      if (it.value && it.cat !== 'tool' && it.cat !== 'equip') info.push(`Worth about <span class="gold-txt">${formatGoldFull(sellPrice(e.id, e.avgQ ?? 100))}g</span> each`);
      if (it.energy) info.push(`Restores <b>${it.energy}</b> energy` + (it.buff ? ` · ${BUFFS[it.buff]?.name}` : '') + (it.maxEnergy ? ` · +${it.maxEnergy} max energy` : ''));
      if (it.cap) info.push(`Holds ${it.cap} finds per trip`);
      if (it.tier) info.push(`Pick tier ${it.tier} · power ${it.power}`);
      if (it.light) info.push(`Lamp radius ${it.light}`);
      if (info.length) parts.push(el('div', { html: info.join('<br>') }));
      const actions = el('div', { class: 'row', style: { marginTop: 'calc(var(--px)*2)' } });
      if (it.cat === 'food' || (it.food && this.game.scene?.allowEatRaw !== false)) {
        actions.append(el('button', { class: 'btn', onclick: () => { this.game.eat(e.id); render(); const g = st.inventory((x) => x === it)[0]; if (g) showItem(g); else detail.textContent = 'Yum.'; } }, it.cat === 'food' ? 'Eat' : 'Eat raw'));
      }
      if (it.slot && st.owns(e.id) && st.data.equip[it.slot] !== e.id) {
        actions.append(el('button', { class: 'btn', onclick: () => { st.equip(e.id); this.game.audio.play('ui_click'); render(); showItem(e); } }, 'Equip'));
      }
      if (actions.children.length) parts.push(actions);
      detail.append(...parts);
    };

    const showWeapon = (w) => {
      detail.innerHTML = '';
      const g = gradeFor(w.score);
      detail.append(
        el('div', { class: 'row' }, [el('b', {}, w.name), el('span', { class: 'stamp', style: { color: g.color, borderColor: g.color, background: '#2a1a12' } }, `Grade ${g.g}`)]),
        el('div', { class: 'muted', style: { margin: 'calc(var(--px)*1.5) 0' }, html: `Forged on day ${w.day}. Metal quality ${w.matQ}% · craft score ${Math.round(w.score)}` + (w.gem ? ` · socketed ${ITEMS[w.gem]?.name}` : '') }),
        el('div', { html: `Worth about <span class="gold-txt">${formatGoldFull(w.value)}g</span> at the assay office.` }),
      );
    };

    render();
    const h = this.openPanel({ title: 'Inventory', sub: `Bag holds ${st.bagCapacity()} finds per trip.`, body, width: 'calc(var(--px) * 200)' });
    h.kind = 'inv';
  }

  // ------------------------------------------------------------ shops
  openShop(shopId) {
    return import('./ShopUI.js').then((m) => m.openShop(this.game, shopId));
  }

  // ------------------------------------------------------------ index book (lazy import keeps UI light)
  openIndex(cat, id) {
    this.bookBadge.hidden = true;
    import('./IndexBook.js').then((m) => m.openIndexBook(this.game, cat, id));
  }

  // ------------------------------------------------------------ menu
  openMenu() {
    if (this.panelStack.length) return;
    const g = this.game;
    const st = g.state;
    const s = st.data.settings;
    const range = (id, label, val, on) => el('label', { class: 'setting', for: id }, [label, el('input', { id, type: 'range', min: 0, max: 1, step: 0.05, value: val, oninput: (e) => on(parseFloat(e.target.value)) })]);
    const body = el('div', { class: 'menu-list' }, [
      el('button', { class: 'btn big', onclick: () => h.close() }, 'Resume'),
      range('set-music', 'Music', s.music, (v) => { s.music = v; g.audio.setVolumes({ music: v }); }),
      range('set-sfx', 'Sound', s.sfx, (v) => { s.sfx = v; g.audio.setVolumes({ sfx: v }); }),
      el('label', { class: 'setting', for: 'set-pixel' }, ['Pixel size', el('select', { id: 'set-pixel', onchange: (e) => { s.pixel = parseInt(e.target.value, 10); g.engine.setPixelOffset(s.pixel); }, style: { font: 'inherit' } }, [
        el('option', { value: -1, selected: s.pixel === -1 }, 'Fine'), el('option', { value: 0, selected: s.pixel === 0 }, 'Normal'), el('option', { value: 1, selected: s.pixel === 1 }, 'Chunky'),
      ])]),
      el('label', { class: 'setting', for: 'set-shake' }, ['Screen shake', el('input', { id: 'set-shake', type: 'checkbox', checked: s.shake > 0, onchange: (e) => { s.shake = e.target.checked ? 1 : 0; } })]),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn alt', onclick: () => { st.save(); this.toast('Game saved', { kind: 'good' }); } }, 'Save'),
        el('button', { class: 'btn alt', onclick: () => { h.close(); g.goto('title'); } }, 'Title screen'),
      ]),
      el('p', { class: 'muted', style: { margin: 0, fontSize: '.75em' } }, `Day ${st.data.day} · ${Math.floor(st.data.playTime / 60)} min played · Your game saves automatically.`),
    ]);
    const h = this.openPanel({ title: 'Paused', body });
  }
}

// creature icons are drawn by the mine art module; fall back to a book icon until it registers
let creatureIconFn = null;
export function registerCreatureIcons(fn) { creatureIconFn = fn; }
export function creatureIconURL(id) { return creatureIconFn ? creatureIconFn(id) : BOOK(); }
export { indexName };
