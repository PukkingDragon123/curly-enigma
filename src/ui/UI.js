// The interface, layered over the pixel canvas. Almost nothing sits on screen: the coin pouch,
// lantern and charms drop in when they change, the backpack (with the Index Book peeking out)
// waits in a corner, the tool belt tucks itself away. Big things open as real objects: the
// leather backpack, the Index Book, shop counters and the pause journal.
import { el } from '../core/util.js';
import { iconURL, specURL, weaponIconURL } from '../gfx/PixelArt.js';
import { critterIconURL } from '../gfx/critters32.js';
import { ITEMS } from '../data/items.js';
import { milestoneText } from '../data/upgrades.js';
import { indexName } from '../core/State.js';
import { installArt } from './uiArt.js';
import { SPR } from './uiSprites.js';
import { Hud } from './Hud.js';
import { Belt } from './Belt.js';
import { openBackpack } from './Backpack.js';
import { openJournal, openBook } from './Journal.js';
import { openPauseMenu } from './PauseMenu.js';
import { qColor } from './common.js';
import { Radar } from './Radar.js';
import { Crosshair } from './Crosshair.js';
import { Tracker } from './Tracker.js';
import { DSPR } from './deepArt.js';
import { Tutor } from './Tutor.js';
import { installSkillFeedback, openSkills } from './SkillTree.js';
import { BuffStrip } from '../cooking/buffs.js';
import './hud.css';
import './backpack.css';
import './book.css';
import './shop.css';
import './touch.css';
import './deep.css';

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

    // first person ('deep'): radar, crosshair, and "click to look around" while the mouse is free
    this.radar = new Radar(this);
    this.tracker = new Tracker(this); // the objective strip (quests part)
    this.crosshair = new Crosshair(this);
    this.lookCatch = el('div', { class: 'look-catch', 'aria-label': 'Click to look around' }, [
      el('div', { class: 'look-card' }, [
        el('img', { class: 'pix', src: DSPR.mouse(), alt: '' }),
        el('div', {}, [el('b', {}, 'Click to look around'), el('small', {}, [el('kbd', {}, 'Esc'), ' frees the mouse'])]),
      ]),
    ]);
    this.lookCatch.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.game.audio.init?.();
      this.game.input.lockPointer();
    });
    this.root.insertBefore(this.lookCatch, this.hud);
    // Old Star's speech card (src/ui/Tutor.js): ui.tutor.say(html, { mood, key, wait }), ui.tutor.hide()
    this.tutor = new Tutor(this);
    // food buffs: a strip of dish icons with timers in the top-left cluster (cooking part, src/cooking/buffs.js)
    try { this.buffs = new BuffStrip(this); } catch (e) { console.warn('buff strip failed', e); }
    this._lockLostAt = -1e9;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === game.canvas;
      this.root.classList.toggle('locked', locked);
      if (locked) this.root.classList.remove('lock-failed');
      if (!locked && !this._unlocking) this._lockLostAt = performance.now();
      this._unlocking = false;
    });
    document.addEventListener('pointerlockerror', () => {
      // no pointer lock here (embedded page, old browser): let clicks reach the game, look with a
      // right-drag. Input retries without raw movement first, so only give up if that fails too.
      clearTimeout(this._lockFailT);
      this._lockFailT = setTimeout(() => { if (!document.pointerLockElement) this.root.classList.add('lock-failed'); }, 500);
    });
    window.addEventListener('pointermove', (e) => {
      if (this.hudMode === 'deep' && this.root.classList.contains('lock-failed') && (e.buttons & 2)) {
        this.game.input.look.dx += e.movementX || 0;
        this.game.input.look.dy += e.movementY || 0;
      }
    });
    // M: the book at the map (the book itself handles B / M while it's open)
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat || this.hudMode === 'none') return;
      if (this.panelStack.length || game.transitioning || game.scene?.allowMenus === false) return;
      this.openBook('map');
    });

    const st = game.state;
    st.on('discover', (e) => this.discoverCard(e));
    installSkillFeedback(this); // skill XP ribbon, level-up notes, nudges (src/ui/SkillTree.js)
    // milestones reached outside the mine (in the mine the explosives perks announce them)
    st.on('milestone', () => {
      if (game.sceneName === 'deep') return;
      for (const m of st.takeMilestones()) this.toast(milestoneText(m), { kind: 'good' });
    });

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
    if (mode !== 'deep') { this.crosshair.set(null); this.releasePointer(); }
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
  /** The big first-person touch button: an icon URL, null (the pickaxe) or false (hidden). Reset on every scene change. */
  setActionIcon(src) { this.actionIcon = src; this._applyActionIcon?.(src); }

  /**
   * First-person radar. provider() → { x, y, z, heading, range, explored: { size, cell, data, ox?, oz? },
   * markers: [{ kind, x, y, z, label, color, r? }] }, called ~10×/s while hud = 'deep'.
   * The survey map calls provider({ survey: true, y }) for other depth layers (it may ignore the args).
   * opts.heading: optional () => yaw, read every frame for a perfectly smooth turn.
   */
  setRadar(provider, opts = {}) { this.radar.set(provider, opts); }

  /** First-person crosshair: { visible, kind: 'none'|'rock'|'ore'|'enemy'|'use', label, progress } or null. */
  setCrosshair(o) { this.crosshair.set(o); }

  /** The map (also opened by tapping the radar or pressing M): the book at its Map chapter. */
  openSurvey() { return this.openBook('map'); }

  /** The book (src/ui/Journal.js): tab 'quests' | 'map' | 'skills' | 'index' | 'notes'; opts.focus for the map. */
  openBook(tab, opts) { return openBook(this.game, tab, opts); }

  /** Give the mouse back (panels, scene changes) without counting it as the player's Esc. */
  releasePointer() {
    if (!this.game.input.pointerLocked && !document.pointerLockElement) return;
    this._unlocking = true;
    this.game.input.unlockPointer();
  }

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
    this.radar.update(rdt);
    this.tracker.update(rdt);
    this.tutor?.update(rdt);
    this.buffs?.update(rdt);
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
    this.radar.set(null);
    this.crosshair.set(null);
    // a new scene starts clean: no face mode, no trip bag
    if (this.focus) this.setFocusMode(false);
    this.setTouchControls(true);
    this.status.setBag(null);
  }

  // ------------------------------------------------------------ panels
  isPanelOpen() { return this.panelStack.length > 0; }

  openPanel({ title, sub, body, className = '', width, onClose, closable = true, noBack = false }) {
    this.game.audio.play('ui_open');
    const generic = !/\b(bp-panel|ib-panel|sh-panel|jr-panel|sv-panel)\b/.test(className);
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
    this.releasePointer();
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

  // ------------------------------------------------------------ the Miners' Board (upgrades + milestones)
  /** tab: 'dig' | 'haul' | 'blast' | 'home' | 'gear' | 'ms' (default: Digging, or Milestones when one is new). */
  openUpgrades(tab) {
    if (this.panelStack.some((p) => p.kind === 'upgrades')) return Promise.resolve(null);
    return import('./Upgrades.js').then((m) => { const h = m.openUpgrades(this.game, tab); if (h) h.kind = 'upgrades'; return h; });
  }

  // ------------------------------------------------------------ skill tree on its own (the book's Skills tab shows the same page)
  openSkills(line) {
    const open = this.panelStack.find((p) => p.kind === 'skills');
    if (open) { if (line) open.debug?.line(line); return open; }
    return openSkills(this.game, line);
  }

  // ------------------------------------------------------------ index book (lazy import keeps UI light)
  openIndex(cat, id) {
    this.status.setBadge(false);
    if (this.panelStack.some((p) => p.kind === 'book')) return;
    import('./IndexBook.js').then((m) => { const h = m.openIndexBook(this.game, cat, id); if (h) h.kind = 'book'; });
  }

  // ------------------------------------------------------------ pause menu (hanging signs: ui/PauseMenu.js)
  openMenu() {
    if (this.panelStack.length) return;
    // in first person the browser spends the first Esc on freeing the mouse: don't also pause
    if (this.hudMode === 'deep' && (this.game.input.pointerLocked || performance.now() - this._lockLostAt < 600)) return;
    return openPauseMenu(this.game);
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
