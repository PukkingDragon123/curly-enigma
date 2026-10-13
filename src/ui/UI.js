// The interface, layered over the pixel canvas. Almost nothing sits on screen: the coin pouch,
// lantern and charms drop in when they change, the backpack (with the Index Book peeking out)
// waits in a corner, the tool belt tucks itself away. Big things open as real objects: the
// leather backpack, the Index Book, shop counters and the pause journal.
import { el } from '../core/util.js';
import { iconURL, specURL, weaponIconURL } from '../gfx/PixelArt.js';
import { critterIconURL } from '../gfx/critters32.js';
import { ITEMS } from '../data/items.js';
import { indexName } from '../core/State.js';
import { installArt } from './uiArt.js';
import { SPR } from './uiSprites.js';
import { Hud } from './Hud.js';
import { Belt } from './Belt.js';
import { openBackpack } from './Backpack.js';
import { openJournal } from './Journal.js';
import { qColor } from './common.js';
import './hud.css';
import './backpack.css';
import './book.css';
import './shop.css';
import './touch.css';

export const COIN = () => specURL('ui:coin', { k: 'coin' });
export const BOLT = () => specURL('ui:bolt', { k: 'bolt' });
export const BOOK = () => specURL('ui:book', { k: 'book' });
export const HEART = () => specURL('ui:heart', { k: 'heart' });

export { qColor };

const SEAL_FOR = { good: 'green', warn: 'amber', bad: 'red' };
const TACK_FOR = { good: 0x5a9a3a, warn: 0xd9901e, bad: 0xc23c2c };

/** '<kbd>E</kbd>' text → KeyboardEvent.code, for tapping prompts on touch screens. */
function keyCode(label) {
  const t = String(label || '').trim();
  if (/^[A-Za-z]$/.test(t)) return 'Key' + t.toUpperCase();
  if (/^[0-9]$/.test(t)) return 'Digit' + t;
  const map = { space: 'Space', enter: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab', shift: 'ShiftLeft', '←': 'ArrowLeft', '→': 'ArrowRight', '↑': 'ArrowUp', '↓': 'ArrowDown' };
  return map[t.toLowerCase()] || null;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.panelStack = [];
    this.bubbles = new Map();
    this.hudMode = 'none';
    this.focus = false;
    installArt();
    const rs = document.documentElement.style;
    const css = { coin: SPR.coin(), sealX: SPR.seal('red', 'x'), sealCheck: SPR.seal('green', 'check'), sealStar: SPR.seal('amber', 'star'), tackRed: SPR.tack(0xc23c2c), coins: SPR.coins(), buckle: SPR.buckle(), beltTip: SPR.beltTip(), tap: SPR.tap(), knob: SPR.knob(), chain: SPR.chain(), twine: SPR.twine(), stampHandle: SPR.stampHandle(), sayTail: SPR.sayTail() };
    for (const [k, v] of Object.entries(css)) rs.setProperty('--a-' + k, `url("${v}")`);

    // touch devices: tap glyphs instead of key caps, bigger targets
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse) document.documentElement.classList.add('is-touch');
    window.addEventListener('touchstart', () => document.documentElement.classList.add('is-touch'), { once: true, passive: true });

    this.root.dataset.hud = 'none';
    this.world = el('div', { class: 'world-layer' });
    this.hud = el('div', { class: 'hud' });
    this.overlay = el('div', { class: 'overlay' });
    this.root.append(this.world, this.hud, this.overlay);

    this.status = new Hud(this);
    this.tl = this.status.tl;
    this.tr = this.status.tr;
    this.toasts = el('div', { class: 'toasts' });
    this.promptIn = el('div', { class: 'prompt-in', role: 'button', onclick: () => this.tapPrompt() });
    this.promptEl = el('div', { class: 'prompt', hidden: true }, [this.promptIn]);
    this.hintEl = el('div', { class: 'hint-keys', hidden: true });
    this.hud.append(this.toasts, this.promptEl, this.hintEl);
    this.belt = new Belt(this);
    this.hotbarEl = this.belt.el;

    const st = game.state;
    st.on('discover', (e) => this.discoverCard(e));

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.panelStack.length) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const top = this.panelStack[this.panelStack.length - 1];
        if (top && top.onEscape && top.onEscape()) return;
        this.closePanel();
      }
    }, true);
  }

  // ------------------------------------------------------------ HUD
  setHudMode(mode) {
    this.hudMode = mode;
    this.root.dataset.hud = mode;
    if (mode === 'none') { this.setHotbar(null); this.setPrompt(null); this.setHints(null); }
    this.status.setMode(mode);
  }
  refreshHud() { this.status.refresh(); }

  /**
   * Mine face close-up: hide nearly all chrome; the belt shrinks to the tool in hand.
   * opts.onBack: called by the touch "back" button (without it, the button taps KeyS, i.e. step back).
   */
  setFocusMode(on, opts = {}) {
    this.focus = !!on;
    this.focusBack = this.focus ? opts.onBack || null : null;
    this.root.classList.toggle('focus', this.focus);
    if (this.focus) this.belt.collapse();
    else this.belt.expand();
  }

  /** Touch screens: hide (false) or restore (true) the joystick and buttons, e.g. during a cutscene. */
  setTouchControls(on) { this.root.classList.toggle('no-touch', on === false); }

  /** Backpack fill for this trip (shown on the backpack itself). setBag(null) clears it. */
  setBag(n, cap) { this.status.setBag(n, cap); }

  setDepth(html) { this.status.setDepth(html); }

  setHints(html) {
    if (!html) { this.hintEl.hidden = true; this._hints = null; return; }
    if (this._hints === html) return;
    this._hints = html;
    this.hintEl.hidden = false;
    this.hintEl.innerHTML = html;
  }

  /** Per-frame tick (gold count-up, belt, buff expiry). */
  update(dt) {
    // HUD timers follow the wall clock (the game's dt is capped on slow frames)
    const now = performance.now();
    const rdt = this._lastT ? Math.min(0.25, Math.max(0, (now - this._lastT) / 1000)) : dt;
    this._lastT = now;
    this.status.update(rdt);
    this.belt.update(rdt);
    this._buffTimer = (this._buffTimer || 0) + dt;
    if (this._buffTimer > 5) { this._buffTimer = 0; this.game.state.tickBuffs(); }
  }

  // ------------------------------------------------------------ toasts / popups
  toast(text, { icon, kind = '', dur = 2600 } = {}) {
    const color = SEAL_FOR[kind] || 'brown';
    const t = el('div', { class: 'toast ' + kind, role: 'status' }, [
      el('img', { class: 'pix toast-tack', src: SPR.tack(TACK_FOR[kind] || 0xc23c2c), alt: '' }),
      icon ? el('img', { class: 'pix toast-icon', src: icon, alt: '' }) : null,
      el('span', { class: 'toast-text', html: text }),
      el('img', { class: 'pix toast-seal', src: SPR.seal(color, kind === 'good' ? 'check' : kind === 'bad' ? 'x' : 'ring'), alt: '' }),
    ]);
    if (!icon) t.insertBefore(t.lastChild, t.children[1]);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 360); }, dur);
    return t;
  }

  discoverCard(e) {
    this._discQ = this._discQ || [];
    this._discQ.push(e);
    if (!this._discBusy) this._nextDiscover();
  }

  _nextDiscover() {
    if (!this._discQ.length) { this._discBusy = false; return; }
    // cards flip out of the book in the corner: wait until the backpack/shop/book is put away
    if (this.panelStack.length) { this._discBusy = true; setTimeout(() => this._nextDiscover(), 350); return; }
    const e = this._discQ.shift();
    this._discBusy = true;
    this._showDiscover(e);
    setTimeout(() => this._nextDiscover(), this._discQ.length > 3 ? 650 : 1300);
  }

  _showDiscover({ cat, id, name }) {
    const icon = this.indexIcon(cat, id);
    const label = { mineral: 'New mineral', gem: 'New gem', plant: 'New plant', critter: 'New creature', weapon: 'New weapon', recipe: 'New recipe', mechanic: 'Learned' }[cat] || 'Discovered';
    const card = el('div', { class: 'disc', role: 'status' }, [el('div', { class: 'disc-card' }, [
      el('div', { class: 'disc-sketch' }, [el('img', { class: 'pix', src: icon, alt: '' })]),
      el('div', {}, [el('small', {}, label), el('b', {}, name)]),
    ])]);
    this.hud.append(card);
    this.status.setBadge(true);
    this.game.audio.play('discover');
    const live = [...this.hud.querySelectorAll('.disc:not(.out)')];
    const max = window.innerWidth < 640 || window.innerHeight < 420 ? 1 : 3;
    while (live.length > max) { const old = live.shift(); old.classList.add('out'); setTimeout(() => old.remove(), 500); }
    live.forEach((c, i) => { c.style.marginTop = `calc(var(--px) * ${(live.length - 1 - i) * 30})`; });
    setTimeout(() => { card.classList.add('out'); setTimeout(() => card.remove(), 520); }, 3400);
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
    this.promptIn.innerHTML = html;
    const k = this.promptIn.querySelector('kbd');
    this._promptKey = k ? keyCode(k.textContent) : 'KeyE';
    this.promptIn.prepend(el('img', { class: 'pix prompt-tap', src: SPR.tap(), alt: '' }));
    this.promptEl.hidden = false;
  }

  /** Touch: tapping the prompt presses its key. */
  tapPrompt() {
    if (!document.documentElement.classList.contains('is-touch') || !this._promptKey) return;
    this.pressKey(this._promptKey);
  }

  /** Simulate a short key press (touch buttons, tappable prompts). */
  pressKey(code, ms = 110) {
    const inp = this.game.input;
    this.game.audio.init?.();
    inp.justDown.add(code);
    inp.down.add(code);
    setTimeout(() => { inp.down.delete(code); inp.justUp.add(code); }, ms);
  }

  /** slots: [{icon, key, label, off, n, meter}] */
  setHotbar(slots, sel = 0, onPick = null) { this.belt.set(slots, sel, onPick); }
  setHotbarMeter(i, v) { this.belt.meter(i, v); }

  // ------------------------------------------------------------ world-anchored
  floatText(text, sx, sy, color = '#fff', size = 1) {
    const t = el('div', { class: 'float-text', style: { left: sx + 'px', top: sy + 'px', color } }, text);
    if (size && size !== 1) t.style.fontSize = size >= 1.4 ? (size >= 2 ? '32px' : '24px') : '';
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
    // a new scene starts clean: no face mode, no trip bag
    if (this.focus) this.setFocusMode(false);
    this.setTouchControls(true);
    this.status.setBag(null);
  }

  // ------------------------------------------------------------ panels
  isPanelOpen() { return this.panelStack.length > 0; }

  openPanel({ title, sub, body, className = '', width, onClose, closable = true, noBack = false }) {
    this.game.audio.play('ui_open');
    const generic = !/\b(bp-panel|ib-panel|sh-panel|jr-panel)\b/.test(className);
    const panel = el('div', { class: 'panel ' + (generic ? 'sheet ' : '') + className, role: 'dialog', 'aria-label': title || 'Panel', style: width ? { width } : {} });
    if (title) panel.append(el('h2', {}, title));
    if (sub) panel.append(el('p', { class: 'sub', html: sub }));
    if (body) panel.append(body);
    const back = el('div', { class: 'modal-back' }, [panel]);
    const handle = { el: panel, back, onClose, closed: false, closable };
    handle.close = () => this.closePanel(handle);
    if (closable) panel.append(el('button', { class: 'close', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => handle.close() }, 'X'));
    back.addEventListener('pointerdown', (e) => { if (e.target === back && closable && !noBack) handle.close(); });
    this.overlay.append(back);
    this.panelStack.push(handle);
    this.root.classList.add('panel-open');
    this.game.input.enabled = false;
    this.game.input.clearAll();
    return handle;
  }

  closePanel(handle) {
    const h = handle || this.panelStack[this.panelStack.length - 1];
    if (!h || h.closed) return;
    h.closed = true;
    h.back.classList.add('closing');
    setTimeout(() => h.back.remove(), 170);
    this.panelStack = this.panelStack.filter((p) => p !== h);
    if (!this.panelStack.length) {
      this.root.classList.remove('panel-open');
      this.game.input.enabled = true;
      this.game.input.clearAll();
    }
    this.game.audio.play('ui_close');
    if (h.onClose) h.onClose();
  }

  closeAllPanels() {
    while (this.panelStack.length) this.closePanel();
  }

  /** Parchment card with two rubber stamps. Resolves true/false. */
  confirm(text, yes = 'Yes', no = 'No') {
    return new Promise((resolve) => {
      let done = false;
      const card = el('div', { class: 'cf-body' });
      const stamp = (label, ok) => el('button', { class: 'stamp-btn ' + (ok ? 'yes' : 'no'), onclick: (e) => press(ok, e.currentTarget) }, [
        el('img', { class: 'pix', src: SPR.stampHandle(), alt: '' }), el('span', {}, label),
      ]);
      const press = (ok, btn) => {
        if (done) return;
        done = true;
        this.game.audio.play(ok ? 'thud' : 'ui_click', { vol: 0.6 });
        btn.classList.add('press');
        const r = btn.getBoundingClientRect(), cr = card.getBoundingClientRect();
        const mark = el('div', { class: 'ink-mark', style: { left: (r.left - cr.left + r.width / 2) + 'px', top: (r.top - cr.top) + 'px' } }, ok ? yes : no);
        mark.style.setProperty('--c', ok ? '#3d7a2e' : '#9a3a26');
        mark.style.translate = '-50% -110%';
        card.append(mark);
        setTimeout(() => { h.close(); resolve(ok); }, 300);
      };
      const yesB = stamp(yes, true), noB = stamp(no, false);
      card.append(el('p', { class: 'cf-text', html: text }), el('div', { class: 'cf-row' }, [yesB, noB]));
      const h = this.openPanel({ body: card, className: 'confirm-card', onClose: () => { if (!done) { done = true; resolve(false); } } });
      setTimeout(() => yesB.focus({ preventScroll: true }), 30);
    });
  }

  // ------------------------------------------------------------ backpack
  openInventory() {
    if (this.panelStack.some((p) => p.kind === 'inv')) return;
    const h = openBackpack(this.game);
    if (h) h.kind = 'inv';
  }

  // ------------------------------------------------------------ shops
  openShop(shopId) {
    return import('./ShopUI.js').then((m) => m.openShop(this.game, shopId));
  }

  // ------------------------------------------------------------ index book (lazy import keeps UI light)
  openIndex(cat, id) {
    this.status.setBadge(false);
    if (this.panelStack.some((p) => p.kind === 'book')) return;
    import('./IndexBook.js').then((m) => { const h = m.openIndexBook(this.game, cat, id); if (h) h.kind = 'book'; });
  }

  // ------------------------------------------------------------ pause journal
  openMenu() {
    if (this.panelStack.length) return;
    openJournal(this.game);
  }
}

// creature icons: the mine art module may register its own; otherwise the 32×32 critter sprites
let creatureIconFn = null;
export function registerCreatureIcons(fn) { creatureIconFn = fn; }
export function creatureIconURL(id) {
  let url = null;
  try { url = (creatureIconFn && creatureIconFn(id)) || critterIconURL(id); } catch (e) { url = null; }
  return url || BOOK();
}
export { indexName };
