// The corner HUD: things that hang into view only when they matter, then tuck away again.
//  top-left : coin pouch (gold) · charms (buffs) · tear-off calendar (new day)
//  stamina  : the brass gauge on the tool belt / bottom middle (src/ui/Stamina.js; it replaced the lantern)
//  top-right: the backpack (inventory) with the Index Book peeking out · pause journal · depth plumb
// The art: src/ui/uiSprites.js (sprites) and src/ui/hudArt.js (the pouch, tags, plates, strings: --h-*).
import { el, formatGoldFull, clamp } from '../core/util.js';
import { BUFFS } from '../data/recipes.js';
import { ITEMS } from '../data/items.js';
import { iconURL } from '../gfx/PixelArt.js';
import { SPR } from './uiSprites.js';
import { itemVox } from './itemVox.js'; // (wave 19) an item flies home as its 3D model's picture
import { HART, installHudArt } from './hudArt.js';
import { StaminaBar } from './Stamina.js';

const CALM_AFTER = 9; // seconds of nothing happening before the corners tuck away

export class Hud {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    const st = this.game.state;
    installHudArt();
    this.goldShown = st.gold;
    this.pouchT = 0;
    this.pinned = 0;
    this.peekT = 0;
    this.depthT = 0;
    this.packTagT = 0;
    this.bag = null;
    this.bagFill = 0;
    this.charmEls = new Map();
    this.charmT = 0;

    // ---- coin pouch (hangs from the top-left on its drawstring)
    this.goldNum = el('span', { class: 'pouch-num' }, formatGoldFull(st.gold));
    this.pouchImg = el('img', { class: 'pix pouch-img', src: HART.pouch(false), alt: '' });
    this.coinFx = el('div', { class: 'pouch-coins' });
    this.pouchDelta = el('div', { class: 'pouch-delta' });
    this.pouch = el('div', { class: 'pouch', title: 'Gold' }, [
      el('i', { class: 'hang-string' }), this.pouchImg, el('div', { class: 'pouch-tag' }, [this.goldNum]), this.coinFx, this.pouchDelta,
    ]);

    // ---- buff charms
    this.charmsEl = el('div', { class: 'charms' });
    this.tl = el('div', { class: 'hud-tl' }, [this.pouch, this.charmsEl]);

    // ---- backpack with the book peeking out (top-right)
    this.packImg = el('img', { class: 'pix pack-img', src: SPR.pack(0), alt: '' });
    this.packTag = el('span', { class: 'pack-tag', hidden: true });
    this.badge = el('i', { class: 'pack-badge', hidden: true });
    this.bookBtn = el('button', { class: 'pack-book', title: 'Book (B)', 'aria-label': 'Book: quests, map, skills, index', onclick: (e) => { e.stopPropagation(); if (ui.openBook) ui.openBook(); else ui.openIndex(); } }, [
      el('img', { class: 'pix', src: SPR.bookPeek(), alt: '' }), this.badge,
    ]);
    // a tap: the flap heaves open with a puff (then the backpack panel)
    this.packBtn = el('button', { class: 'pack-bag', title: 'Backpack (I)', 'aria-label': 'Backpack', onclick: () => { const b = this.packBtn; b.classList.remove('open'); void b.offsetWidth; b.classList.add('open'); ui.openInventory(); } }, [this.packImg, this.packTag]);
    // the load gauge: a little spring scale hanging off the bag's strap (mine only)
    this.loadFill = el('i');
    this.loadTxt = el('span', { class: 'pack-load-t' });
    this.loadEl = el('div', { class: 'pack-load', hidden: true, title: 'How heavy your pack is' }, [el('b', {}, [this.loadFill]), this.loadTxt]);
    this.pack = el('div', { class: 'pack' }, [this.bookBtn, this.packBtn, this.loadEl]);
    this.menuBtn = el('button', { class: 'journal-btn', title: 'Journal (Esc)', 'aria-label': 'Pause menu', onclick: () => ui.openMenu() }, [
      el('img', { class: 'pix', src: SPR.journalIcon(), alt: '' }),
    ]);
    this.depthTxt = el('div', { class: 'depth-txt' });
    this.depth = el('div', { class: 'depth' }, [el('img', { class: 'pix', src: SPR.plumb(), alt: '' }), this.depthTxt]);
    this.tr = el('div', { class: 'hud-tr' }, [this.menuBtn, this.pack]);
    this.pack.addEventListener('pointerenter', () => this.peek());

    // ---- tear-off calendar (new day)
    this.cal = el('div', { class: 'cal', hidden: true });

    ui.hud.append(this.tl, this.tr, this.depth, this.cal);
    // ---- stamina: one bar, afflictions eating it from the right (src/ui/Stamina.js)
    this.stam = new StaminaBar(this);

    st.on('gold', (e) => { this.wake(); this.onGold(e); });
    st.on('energy', (e) => { if (e && (e.injury || e.fed || e.mend || Math.abs(e.delta || 0) > 2.5)) this.wake(); this.stam.onEnergy(e); });
    st.on('buffs', () => { this.wake(); this.renderCharms(); });
    st.on('day', (e) => this.onDay(e));
    st.on('items', () => this.wake(4));
    // wave 18, less on screen: after a while with nothing happening the corner pieces (pack, journal,
    // the quest strip, the depth sign) tuck away and the belt sinks and dims; anything that matters
    // (a pickup, gold, a hit, the wheel or a number key, the cursor coming back) brings them back
    this.calmT = 0;
    addEventListener('keydown', (e) => { if (/^(Digit[1-9]|Tab|KeyI|KeyB|KeyQ|KeyJ)$/.test(e.code)) this.wake(); }, { passive: true });
    addEventListener('wheel', () => this.wake(), { passive: true });
    addEventListener('pointermove', () => { if (!this.game.input?.pointerLocked) this.wake(2); }, { passive: true });
    st.on('load', () => this.refresh());
    this.refresh();
  }

  refresh() {
    const st = this.game.state;
    this.goldShown = st.gold;
    this.goldNum.textContent = formatGoldFull(st.gold);
    this.renderCharms();
  }

  setMode(mode) {
    if (mode !== 'mine' && mode !== 'deep') { this.setBag(null); this.setDepth(null); }
    if (mode === 'none') { clearTimeout(this.calTimer); this.cal.hidden = true; }
    this.stam.setMode(mode);
  }
  /** Out of stamina: the eyes close; cb runs once it's black (the next scene opens them). */
  blackout(cb) { this.stam.blackout(cb); }

  /** Show gold + stamina for a moment (e.g. when reaching for the backpack). */
  peek(t = 2.2) {
    this.peekT = Math.max(this.peekT, t);
    this.showPouch(t);
    this.stam.peek(t);
  }

  // ------------------------------------------------------------ gold
  showPouch(t = 2.6) {
    this.pouch.classList.add('show');
    this.pouchT = Math.max(this.pouchT, t);
  }
  pin(on) {
    this.pinned = Math.max(0, this.pinned + (on ? 1 : -1));
    this.pouch.classList.toggle('pinned', this.pinned > 0);
    if (on) this.showPouch(1);
  }
  onGold(e) {
    const d = (e && e.delta) || 0;
    this.showPouch(2.4);
    if (!d) return;
    const pd = this.pouchDelta;
    pd.textContent = (d > 0 ? '+' : '−') + formatGoldFull(Math.abs(d));
    pd.className = 'pouch-delta ' + (d > 0 ? 'up' : 'down');
    void pd.offsetWidth;
    pd.classList.add('go');
    this.pouch.classList.remove('jingle');
    void this.pouch.offsetWidth;
    this.pouch.classList.add('jingle');
    this.pouchImg.src = HART.pouch(true);
    clearTimeout(this._pouchShut);
    this._pouchShut = setTimeout(() => { this.pouchImg.src = HART.pouch(false); }, 1400);
    if (d > 0) this.spawnCoins(clamp(Math.round(Math.log10(d + 1) * 2), 2, 9));
    else this.spawnCoins(clamp(Math.round(Math.log10(-d + 1) * 1.5), 1, 6), false);
  }
  /**
   * Gold in: coins arc down into the pouch's mouth one after another, each landing with a clink (a
   * glint at the mouth, the pouch bobbing). Gold out: coins spill from the mouth and tumble away.
   */
  spawnCoins(n, gain = true) {
    for (let i = 0; i < n; i++) {
      const c = el('i', { class: 'coin ' + (gain ? 'in' : 'out') });
      c.style.setProperty('--dx', ((Math.random() * 2 - 1) * (gain ? 1 : 0.7) + (gain ? 0.25 : 0.35)).toFixed(2));
      c.style.setProperty('--h', (0.6 + Math.random() * 0.6).toFixed(2));
      c.style.animationDelay = `${i * 85}ms, ${i * 85}ms`;
      this.coinFx.append(c);
      setTimeout(() => c.remove(), 1100 + i * 85);
      if (!gain) continue;
      const g = el('i', { class: 'clink' });
      g.style.setProperty('--gx', (Math.random() * 4 - 2).toFixed(1));
      g.style.animationDelay = `${520 + i * 85}ms`;
      this.coinFx.append(g);
      setTimeout(() => g.remove(), 1000 + i * 85);
      if (i < 4) setTimeout(() => { const im = this.pouchImg; im.classList.remove('bob'); void im.offsetWidth; im.classList.add('bob'); }, 540 + i * 85);
    }
  }

  // ------------------------------------------------------------ rewards fly home
  /**
   * Wave 18: a reward is a thing, not a line of text: its picture (an item icon, a coin) pops up
   * mid-screen and arcs into the backpack ('pack') or the coin pouch ('pouch'), which takes it with a
   * gulp and a clink. n: how many (a few copies fly, staggered). from: {x, y} page px (default: just
   * above the middle of the screen).
   */
  flyTo(target, src, { n = 1, from = null, delay = 0 } = {}) {
    if (!src || this.ui.hudMode === 'none') return;
    this.wake(3);
    if (target === 'pouch') this.showPouch(3);
    const dest = target === 'pouch' ? this.pouchImg : this.packImg;
    const copies = Math.max(1, Math.min(target === 'pouch' ? 6 : 3, n));
    for (let k = 0; k < copies; k++) {
      setTimeout(() => {
        const r = dest.getBoundingClientRect();
        const x1 = r.left + r.width / 2, y1 = r.top + r.height * (target === 'pouch' ? 0.3 : 0.45);
        const x0 = (from?.x ?? innerWidth / 2) + (k - (copies - 1) / 2) * 14, y0 = (from?.y ?? innerHeight * 0.42) + (k % 2) * 6;
        const mx = (x0 + x1) / 2 + (x1 > x0 ? -40 : 40), my = Math.min(y0, y1) - 70 - Math.random() * 30;
        const size = target === 'pouch' ? 24 : 48;
        const pic = target === 'pack' ? itemVox.url(itemVox.keyOf(src), size) : null;
        const img = el('img', { class: 'pix fly-reward', src: pic || src, alt: '', style: { width: size + 'px', height: size + 'px' } });
        this.ui.hud.append(img);
        const tf = (x, y, s, rot) => `translate(${(x - size / 2).toFixed(1)}px, ${(y - size / 2).toFixed(1)}px) scale(${s}) rotate(${rot}deg)`;
        const a = img.animate([
          { transform: tf(x0, y0 + 16, 0.2, 0), opacity: 0 },
          { transform: tf(x0, y0, 1.15, -6), opacity: 1, offset: 0.16 },
          { transform: tf(x0, y0 - 4, 1, 0), opacity: 1, offset: 0.3 },
          { transform: tf(mx, my, 0.9, 18), opacity: 1, offset: 0.62 },
          { transform: tf(x1, y1, 0.42, 40), opacity: 1 },
        ], { duration: 820, easing: 'cubic-bezier(.4, 0, .8, .6)', fill: 'forwards' });
        a.onfinish = () => {
          img.remove();
          const au = this.game.audio;
          if (target === 'pouch') { au.play('coins', { vol: 0.32 }); this.pouch.classList.remove('jingle'); void this.pouch.offsetWidth; this.pouch.classList.add('jingle'); }
          else { au.play('pickup', { vol: 0.4 }); this.packBtn.classList.remove('gulp'); void this.packBtn.offsetWidth; this.packBtn.classList.add('gulp'); }
        };
      }, delay + k * 110);
    }
  }

  /** A reward ({ gold, items }) as things flying home: coins to the pouch, items to the backpack. */
  flyReward(r, delay = 0) {
    if (!r) return;
    let d = delay;
    if (r.gold) { this.flyTo('pouch', SPR.coin(), { n: Math.round(Math.min(6, 1 + Math.log10(r.gold + 1) * 1.6)), delay: d }); d += 260; }
    for (const [id, n] of Object.entries(r.items || {}).slice(0, 4)) { if (ITEMS[id]) { this.flyTo('pack', iconURL(id), { n: Math.min(3, n || 1), delay: d }); d += 240; } }
  }

  // ------------------------------------------------------------ buffs
  renderCharms() {
    const st = this.game.state;
    const now = st.data.playTime;
    const live = new Set();
    for (const b of st.data.buffs) {
      const def = BUFFS[b.id];
      if (!def || b.until <= now) continue;
      live.add(b.id);
      let c = this.charmEls.get(b.id);
      if (!c) {
        const tip = el('span', { class: 'charm-tip' });
        const node = el('button', { class: 'charm', 'aria-label': def.name, onclick: (ev) => { ev.stopPropagation(); node.classList.toggle('open'); } }, [
          el('i', { class: 'hang-string' }), el('img', { class: 'pix', src: SPR.charm(b.id), alt: '' }), tip,
        ]);
        node.style.setProperty('--sway', (0.8 + Math.random() * 0.8).toFixed(2) + 's');
        node.style.setProperty('--len', String(4 + (this.charmEls.size % 3) * 3));
        c = { node, tip, def };
        this.charmEls.set(b.id, c);
        this.charmsEl.append(node);
      }
      const left = Math.max(0, b.until - now);
      c.tip.innerHTML = `<b style="color:${def.color}">${def.name}</b><br>${def.desc}<br><small>${left >= 60 ? Math.ceil(left / 60) + ' min' : Math.ceil(left) + ' s'} left</small>`;
      c.node.classList.toggle('fading', left < 30);
    }
    for (const [id, c] of this.charmEls) if (!live.has(id)) { c.node.remove(); this.charmEls.delete(id); }
    this.charmsEl.classList.toggle('show', live.size > 0);
  }

  // ------------------------------------------------------------ day
  onDay(e) {
    clearTimeout(this.calTimer);
    const day = e && e.day ? e.day : this.game.state.data.day;
    this.calTimer = setTimeout(() => this.flipCalendar(day), 1800);
  }
  flipCalendar(day) {
    if (this.ui.hudMode === 'none') return;
    const cal = this.cal;
    cal.innerHTML = '';
    const under = el('div', { class: 'cal-page' }, [el('img', { class: 'pix', src: SPR.calendar(false), alt: '' }), el('b', {}, String(day))]);
    const over = el('div', { class: 'cal-page torn' }, [el('img', { class: 'pix', src: SPR.calendar(true), alt: '' }), el('b', {}, String(Math.max(1, day - 1)))]);
    cal.append(under, over);
    cal.hidden = false;
    cal.className = 'cal';
    void cal.offsetWidth;
    cal.classList.add('in');
    clearTimeout(this._cal1); clearTimeout(this._cal2); clearTimeout(this._cal3);
    this._cal1 = setTimeout(() => { over.classList.add('tear'); this.game.audio.play('page'); }, 650);
    this._cal2 = setTimeout(() => cal.classList.add('out'), 3800);
    this._cal3 = setTimeout(() => { cal.hidden = true; }, 4300);
  }

  // ------------------------------------------------------------ depth & bag (mine)
  setDepth(html) {
    if (!html) { this._depthHtml = null; this.depth.classList.remove('show'); return; }
    let h = String(html).replace(/<\/b>\s*<br\s*\/?>/i, '</b>');
    const m = /Bag\s+(\d+)\s*\/\s*(\d+)/i.exec(h);
    if (m) {
      if (!this.explicitBag) this.setBag(+m[1], +m[2], true);
      h = h.replace(/(<br\s*\/?>)?\s*Bag\s+\d+\s*\/\s*\d+/i, '');
    }
    if (h === this._depthHtml) return;
    const first = this._depthHtml == null;
    this._depthHtml = h;
    this.depthTxt.innerHTML = h;
    // a new depth: the plaque turns over on its pins to show it, the plumb-bob drops and bounces
    if (!first) for (const [node, cls] of [[this.depthTxt, 'flip'], [this.depth, 'drop']]) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); }
    if (!first) this.wake(1);
    if (!first || this.ui.hudMode === 'deep') { this.depthT = 2.4; this.depth.classList.add('show'); }
  }
  setBag(n, cap, fromDepth = false) {
    if (n === null || n === undefined) {
      this.bag = null;
      this.explicitBag = false;
      if (this.bagFill) { this.bagFill = 0; this.packImg.src = SPR.pack(0); }
      this.packTag.hidden = true;
      this.pack.classList.remove('full');
      return;
    }
    if (!fromDepth) this.explicitBag = true;
    cap = Math.max(1, cap || 1);
    const prev = this.bag;
    this.bag = { n, cap };
    const r = n / cap;
    const fill = n <= 0 ? 0 : r < 0.5 ? 1 : r < 1 ? 2 : 3;
    if (fill !== this.bagFill) { this.bagFill = fill; this.packImg.src = SPR.pack(fill); }
    const full = n >= cap;
    this.pack.classList.toggle('full', full);
    this.packTag.textContent = full ? 'FULL' : `${n}/${cap}`;
    if (!prev || prev.n !== n || prev.cap !== cap) {
      this.wake(3);
      if (prev && n > prev.n) {
        this.packBtn.classList.remove('gulp');
        void this.packBtn.offsetWidth;
        this.packBtn.classList.add('gulp');
      }
      if (prev || n > 0) { this.packTag.hidden = false; this.packTagT = 2.4; }
    }
  }

  /** The pack's weight (core/weight.js loadState) or null to hide the gauge. */
  setLoad(L) {
    if (!L) { this.loadEl.hidden = true; this.load = null; return; }
    this.loadEl.hidden = false;
    const k = Math.max(0, Math.min(1, L.r / 2));
    this.loadFill.style.height = (k * 100).toFixed(1) + '%';
    this.loadEl.className = 'pack-load ' + L.tier;
    const heavy = L.tier === 'heavy' || L.tier === 'over' || L.tier === 'max';
    this.loadTxt.textContent = heavy ? `${L.kg.toFixed(0)}/${L.carry.toFixed(0)} kg` : '';
    this.loadTxt.hidden = !heavy;
    this.loadEl.title = `${L.kg.toFixed(1)} kg of ${L.carry.toFixed(0)} kg`;
    this.load = L;
  }

  setBadge(on) {
    this.badge.hidden = !on;
    this.pack.classList.toggle('news', !!on);
    if (on) {
      this.bookBtn.classList.remove('ping');
      void this.bookBtn.offsetWidth;
      this.bookBtn.classList.add('ping');
    }
  }

  /** Bring the tucked pieces back (they settle again after `t` more quiet seconds than usual). */
  wake(t = 0) {
    this.calmT = Math.min(this.calmT, -t);
    if (this.calm) { this.calm = false; this.ui.root.classList.remove('hud-calm'); }
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const st = this.game.state;
    // quiet → calm (only in play, not while a panel is open; a full bag or news in the book keeps
    // the pack up: hud.css)
    const busy = this.ui.isPanelOpen() || this.ui.hudMode === 'none' || (this.ui.tracker && this.ui.tracker.idleT < 1);
    if (busy) this.wake();
    else if ((this.calmT += dt) > CALM_AFTER && !this.calm) { this.calm = true; this.ui.root.classList.add('hud-calm'); }
    const target = st.gold;
    const diff = target - this.goldShown;
    if (diff !== 0) {
      if (Math.abs(diff) < 1) this.goldShown = target;
      else this.goldShown += diff * (1 - Math.exp(-dt * 7)) + Math.sign(diff) * Math.min(Math.abs(diff), 60 * dt);
      this.goldNum.textContent = formatGoldFull(Math.round(this.goldShown));
    } else if (this.pouchT > 0) {
      this.pouchT -= dt;
      if (this.pouchT <= 0 && !this.pinned) this.pouch.classList.remove('show');
    }
    if (this.peekT > 0) this.peekT -= dt;
    this.stam.update(dt);
    // in first person the depth stays up (hanging under the radar); elsewhere it fades after a moment
    if (this.depthT > 0 && this.ui.hudMode !== 'deep') { this.depthT -= dt; if (this.depthT <= 0) this.depth.classList.remove('show'); }
    if (this.packTagT > 0 && !(this.bag && this.bag.n >= this.bag.cap)) { this.packTagT -= dt; if (this.packTagT <= 0) this.packTag.hidden = true; }
    this.charmT += dt;
    if (this.charmT > 1 && this.charmEls.size) { this.charmT = 0; this.renderCharms(); }
  }
}
