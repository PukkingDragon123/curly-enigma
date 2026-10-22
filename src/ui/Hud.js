// The corner HUD: things that hang into view only when they matter, then tuck away again.
//  top-left : coin pouch (gold) · lantern (energy) · charms (buffs) · tear-off calendar (new day)
//  top-right: the backpack (inventory) with the Index Book peeking out · pause journal · depth plumb
import { el, formatGoldFull, clamp } from '../core/util.js';
import { BUFFS } from '../data/recipes.js';
import { SPR } from './uiSprites.js';

const LOW = 0.3;

export class Hud {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    const st = this.game.state;
    this.goldShown = st.gold;
    this.pouchT = 0;
    this.pinned = 0;
    this.lampT = 0;
    this.peekT = 0;
    this.lampBucket = -1;
    this.lampLvl = -1;
    this.depthT = 0;
    this.packTagT = 0;
    this.bag = null;
    this.bagFill = 0;
    this.charmEls = new Map();
    this.charmT = 0;

    // ---- coin pouch (hangs from the top-left on its drawstring)
    this.goldNum = el('span', { class: 'pouch-num' }, formatGoldFull(st.gold));
    this.pouchImg = el('img', { class: 'pix pouch-img', src: SPR.pouch(false), alt: '' });
    this.coinFx = el('div', { class: 'pouch-coins' });
    this.pouchDelta = el('div', { class: 'pouch-delta' });
    this.pouch = el('div', { class: 'pouch', title: 'Gold' }, [
      el('i', { class: 'hang-string' }), this.pouchImg, el('div', { class: 'pouch-tag' }, [this.goldNum]), this.coinFx, this.pouchDelta,
    ]);

    // ---- lantern (energy)
    this.lampImg = el('img', { class: 'pix lamp-img', src: SPR.lantern(4), alt: '' });
    this.lampTxt = el('span');
    this.lamp = el('div', { class: 'lamp', title: 'Energy' }, [
      el('i', { class: 'hang-chain' }), el('i', { class: 'lamp-glow' }), this.lampImg, el('div', { class: 'lamp-tag' }, [this.lampTxt]),
    ]);

    // ---- buff charms
    this.charmsEl = el('div', { class: 'charms' });
    this.tl = el('div', { class: 'hud-tl' }, [this.pouch, this.lamp, this.charmsEl]);

    // ---- backpack with the book peeking out (top-right)
    this.packImg = el('img', { class: 'pix pack-img', src: SPR.pack(0), alt: '' });
    this.packTag = el('span', { class: 'pack-tag', hidden: true });
    this.badge = el('i', { class: 'pack-badge', hidden: true });
    this.bookBtn = el('button', { class: 'pack-book', title: 'Book (B)', 'aria-label': 'Book: quests, map, skills, index', onclick: (e) => { e.stopPropagation(); if (ui.openBook) ui.openBook(); else ui.openIndex(); } }, [
      el('img', { class: 'pix', src: SPR.bookPeek(), alt: '' }), this.badge,
    ]);
    this.packBtn = el('button', { class: 'pack-bag', title: 'Backpack (I)', 'aria-label': 'Backpack', onclick: () => ui.openInventory() }, [this.packImg, this.packTag]);
    this.pack = el('div', { class: 'pack' }, [this.bookBtn, this.packBtn]);
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

    st.on('gold', (e) => this.onGold(e));
    st.on('energy', (e) => this.onEnergy(e));
    st.on('buffs', () => this.renderCharms());
    st.on('day', (e) => this.onDay(e));
    st.on('load', () => this.refresh());
    this.refresh();
  }

  refresh() {
    const st = this.game.state;
    this.goldShown = st.gold;
    this.goldNum.textContent = formatGoldFull(st.gold);
    this.setLamp();
    this.renderCharms();
  }

  setMode(mode) {
    if (mode !== 'mine' && mode !== 'deep') { this.setBag(null); this.setDepth(null); }
    if (mode === 'none') { clearTimeout(this.calTimer); this.cal.hidden = true; }
  }

  /** Show gold + energy for a moment (e.g. when reaching for the backpack). */
  peek(t = 2.2) {
    this.peekT = Math.max(this.peekT, t);
    this.showPouch(t);
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
    this.pouchImg.src = SPR.pouch(true);
    clearTimeout(this._pouchShut);
    this._pouchShut = setTimeout(() => { this.pouchImg.src = SPR.pouch(false); }, 1400);
    if (d > 0) this.spawnCoins(clamp(Math.round(Math.log10(d + 1) * 2), 2, 9));
  }
  spawnCoins(n) {
    for (let i = 0; i < n; i++) {
      const c = el('i', { class: 'coin' });
      c.style.setProperty('--dx', (Math.random() * 2 - 1).toFixed(2));
      c.style.setProperty('--h', (0.6 + Math.random() * 0.6).toFixed(2));
      c.style.animationDelay = `${i * 70}ms, ${i * 70}ms`;
      this.coinFx.append(c);
      setTimeout(() => c.remove(), 1100 + i * 70);
    }
  }

  // ------------------------------------------------------------ energy
  setLamp() {
    const st = this.game.state;
    const p = clamp(st.energy / Math.max(1, st.maxEnergy), 0, 1);
    const lvl = p > 0.8 ? 4 : p > 0.55 ? 3 : p > LOW ? 2 : p > 0.08 ? 1 : 0;
    if (lvl !== this.lampLvl) { this.lampLvl = lvl; this.lampImg.src = SPR.lantern(lvl); }
    this.lamp.style.setProperty('--e', p.toFixed(3));
    this.lamp.classList.toggle('low', p < LOW);
    this.lampTxt.textContent = `${Math.ceil(st.energy)}/${st.maxEnergy}`;
    return p;
  }
  onEnergy(e) {
    const p = this.setLamp();
    const bucket = Math.floor(p * 20);
    if (bucket !== this.lampBucket || (e && e.delta > 0)) {
      if (this.lampBucket >= 0 || (e && e.delta)) this.lampT = 2.6;
      this.lampBucket = bucket;
    }
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
      if (prev && n > prev.n) {
        this.packBtn.classList.remove('gulp');
        void this.packBtn.offsetWidth;
        this.packBtn.classList.add('gulp');
      }
      if (prev || n > 0) { this.packTag.hidden = false; this.packTagT = 2.4; }
    }
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

  // ------------------------------------------------------------ per frame
  update(dt) {
    const st = this.game.state;
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
    if (this.lampT > 0) this.lampT -= dt;
    this.lamp.classList.toggle('show', this.lampT > 0 || this.peekT > 0 || this.lamp.classList.contains('low'));
    // in first person the depth stays up (hanging under the radar); elsewhere it fades after a moment
    if (this.depthT > 0 && this.ui.hudMode !== 'deep') { this.depthT -= dt; if (this.depthT <= 0) this.depth.classList.remove('show'); }
    if (this.packTagT > 0 && !(this.bag && this.bag.n >= this.bag.cap)) { this.packTagT -= dt; if (this.packTagT <= 0) this.packTag.hidden = true; }
    this.charmT += dt;
    if (this.charmT > 1 && this.charmEls.size) { this.charmT = 0; this.renderCharms(); }
  }
}
