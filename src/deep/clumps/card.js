// The specimen tag that floats beside a held clump: what it is, how sound the ore still is, how
// clean it is and what it would fetch, plus the controls (key caps on desktop, Bag / Drop buttons and
// a drag-to-turn pad over the clump on touch screens). Plain DOM in the HUD layer; styles injected.
import { el } from '../../core/util.js';

const CSS = `
.cc { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 3; transform-origin: 0 50%;
  color: var(--ink, #3a2410); font-size: 16px; line-height: 1.15; width: max(176px, calc(var(--px) * 74));
  border-style: solid; border-width: calc(var(--px) * 5); border-image: var(--a-note) 5 / calc(var(--px) * 5) repeat;
  background: #f8ecd2 padding-box; padding: 0 calc(var(--px) * 1.5) calc(var(--px) * 0.5);
  filter: drop-shadow(0 calc(var(--px) * 2) 0 rgba(8, 4, 6, .45)); transition: opacity .2s; }
.cc[hidden] { display: none; }
.cc.fade { opacity: 0; }
.cc-pin { position: absolute; top: 50%; width: calc(var(--px) * 3); height: calc(var(--px) * 3); margin-top: calc(var(--px) * -1.5); background: #8a5a2a; box-shadow: 0 0 0 var(--px) #3a2410; }
.cc-head { display: flex; align-items: center; gap: calc(var(--px) * 2); margin-bottom: calc(var(--px) * 1); }
.cc-head img { width: 32px; height: 32px; flex: none; image-rendering: pixelated; }
.cc-name { font-family: var(--font-head); font-size: var(--fs-h, 27px); line-height: .9; color: #6a2a14; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-star { margin-left: auto; font-size: 16px; color: #a8700c; white-space: nowrap; }
.cc-star[hidden] { display: none; }
.cc-row { display: flex; align-items: center; gap: calc(var(--px) * 2); margin: calc(var(--px) * 1) 0; }
.cc-row > span { width: 3.4em; flex: none; color: #7a5a3a; }
.cc-row > b { width: 2.6em; text-align: right; flex: none; font-weight: 400; font-variant-numeric: tabular-nums; }
.cc-bar { flex: 1; height: calc(var(--px) * 3); background: #c8ab7a; box-shadow: 0 0 0 var(--px) #6a4a2a; position: relative; overflow: hidden; }
.cc-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(#ffe38a 0 var(--px), #e8a83a var(--px)); transition: width .18s; }
.cc-bar.ore i { background: linear-gradient(#b8f08a 0 var(--px), #5aaa3a var(--px)); }
.cc-bar.ore.mid i { background: linear-gradient(#ffe08a 0 var(--px), #d89a2a var(--px)); }
.cc-bar.ore.low i { background: linear-gradient(#ffb09a 0 var(--px), #c2402c var(--px)); }
.cc-worth { display: flex; align-items: baseline; gap: calc(var(--px) * 2); margin-top: calc(var(--px) * 1.5); padding-top: calc(var(--px) * 1.5); border-top: var(--px) dashed #c8ab7a; white-space: nowrap; }
.cc-worth b { font-family: var(--font-head); font-weight: 400; font-size: var(--fs-h, 27px); line-height: .9; color: #2a6a1a; }
.cc-worth small { color: #8a6a4a; font-size: 16px; }
.cc-note { color: #8a6a4a; font-size: 16px; white-space: nowrap; }
.cc-keys { margin-top: calc(var(--px) * 1.5); color: #7a5a3a; font-size: 16px; line-height: 1.6; }
.cc-keys kbd { margin: 0 2px 0 0; }
.cc-keys span { white-space: nowrap; margin-right: 6px; }
html.is-touch .cc-keys { display: none; }
.cc-btns { display: none; gap: calc(var(--px) * 2); margin-top: calc(var(--px) * 2); }
html.is-touch .cc-btns { display: flex; }
.cc-btns .btn { flex: 1; pointer-events: auto; padding-left: 0; padding-right: 0; font-size: 16px; }
.cc-grab { position: absolute; left: 0; top: 0; border-radius: 50%; pointer-events: auto; touch-action: none; display: none; }
html.is-touch #ui[data-hud=deep]:not(.panel-open) .cc-grab.on { display: block; }
.cc-tip { position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; pointer-events: none; font-size: 16px; color: #efe6d4;
  padding: 2px 6px; background: rgba(18, 11, 8, .7); box-shadow: 0 0 0 var(--px) rgba(0, 0, 0, .5); text-shadow: 0 var(--px) 0 #000; transition: opacity .4s; }
.cc-tip.gone { opacity: 0; }
#ui.panel-open .cc, #ui.panel-open .cc-tip { display: none; }
`;

export class ClumpCard {
  /** opts: { onAction(name), onDrag(dx, dy), onTap(x, y), onGrab(on) } */
  constructor(ui, opts = {}) {
    this.ui = ui;
    this.opts = opts;
    if (!document.getElementById('clump-card-css')) document.head.append(el('style', { id: 'clump-card-css' }, CSS));
    this.icon = el('img', { alt: '' });
    this.name = el('div', { class: 'cc-name' });
    this.star = el('div', { class: 'cc-star', hidden: true }, '★ pristine');
    this.oreBar = el('i');
    this.cleanBar = el('i');
    this.oreTxt = el('b');
    this.cleanTxt = el('b');
    this.worth = el('b');
    this.worthNote = el('span');
    const btn = (label, name) => {
      const b = el('button', { class: 'btn alt' }, label);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); opts.onAction?.(name, true); });
      for (const ev of ['pointerup', 'pointercancel']) b.addEventListener(ev, (e) => { e.stopPropagation(); opts.onAction?.(name, false); });
      b.addEventListener('click', (e) => e.preventDefault());
      return b;
    };
    this.pin = el('div', { class: 'cc-pin' });
    this.el = el('div', { class: 'cc', hidden: true }, [
      this.pin,
      el('div', { class: 'cc-head' }, [this.icon, this.name]),
      el('div', { class: 'cc-row' }, [el('span', {}, 'Ore'), el('div', { class: 'cc-bar ore' }, [this.oreBar]), this.oreTxt]),
      el('div', { class: 'cc-row' }, [el('span', {}, 'Clean'), el('div', { class: 'cc-bar' }, [this.cleanBar]), this.cleanTxt]),
      el('div', { class: 'cc-worth' }, [this.worth, el('small', {}, 'if bagged now'), this.star]),
      el('div', { class: 'cc-note' }, [this.worthNote]),
      el('div', { class: 'cc-keys' }, [
        el('span', {}, [el('kbd', {}, 'LMB'), 'chip']), el('span', {}, [el('kbd', {}, 'RMB'), 'turn']),
        el('span', {}, [el('kbd', {}, 'E'), 'bag it']), el('span', {}, [el('kbd', {}, 'G'), 'drop']),
      ]),
      el('div', { class: 'cc-btns' }, [btn('Bag it', 'bag'), btn('Drop', 'drop')]),
    ]);
    // touch: drag on the clump turns it, a tap chips where you tapped
    this.grab = el('div', { class: 'cc-grab' });
    this.tip = el('div', { class: 'cc-tip', hidden: true });
    let pid = null, sx = 0, sy = 0, lx = 0, ly = 0, t0 = 0, moved = 0;
    this.grab.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (pid !== null) return;
      pid = e.pointerId; sx = lx = e.clientX; sy = ly = e.clientY; t0 = performance.now(); moved = 0;
      try { this.grab.setPointerCapture(pid); } catch (err) { /* noop */ }
      opts.onGrab?.(true);
    });
    this.grab.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      e.preventDefault(); e.stopPropagation();
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      moved = Math.max(moved, Math.hypot(e.clientX - sx, e.clientY - sy));
      if (moved > 8) opts.onDrag?.(dx, dy);
    });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      e.stopPropagation();
      pid = null;
      opts.onGrab?.(false);
      if (moved <= 8 && performance.now() - t0 < 400 && e.type === 'pointerup') opts.onTap?.(e.clientX, e.clientY);
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) this.grab.addEventListener(ev, end);
    ui.hud.append(this.grab, this.el, this.tip);
    this.last = '';
  }

  show(on) {
    if (this.el.hidden === !on) return;
    this.el.hidden = !on;
    this.grab.classList.toggle('on', !!on);
  }

  /** info: { item, icon, name, cond, clean, q, price, full, pristine, chance } */
  set(o) {
    const key = [o.name, o.cond, o.clean, o.price, o.full, o.pristine, o.chance].join('|');
    if (key === this.last) return;
    this.last = key;
    if (this.icon.src !== o.icon) this.icon.src = o.icon;
    this.name.textContent = o.name;
    this.star.hidden = !o.chance;
    this.star.textContent = o.pristine ? '★ pristine' : '☆';
    this.star.title = o.pristine ? 'Pristine!' : 'Still unscratched: clean it spotless for a pristine find';
    this.oreBar.style.width = o.cond + '%';
    this.oreBar.parentNode.className = 'cc-bar ore' + (o.cond < 40 ? ' low' : o.cond < 70 ? ' mid' : '');
    this.oreTxt.textContent = o.cond + '%';
    this.cleanBar.style.width = o.clean + '%';
    this.cleanTxt.textContent = o.clean + '%';
    this.worth.textContent = `≈ ${o.price.toLocaleString('en-US')}g`;
    this.worthNote.textContent = o.clean >= 100 ? `${o.q}% · spotless${o.pristine ? ', pristine!' : ''}` : `${o.q}% now · clean: ≈ ${o.full.toLocaleString('en-US')}g`;
  }

  /** Place the tag: anchor (x, y) in CSS px at the clump's edge; side 'right' | 'top'. r: clump radius in px (for the touch pad). */
  place(ax, ay, cx, cy, r, side) {
    const W = this.ui.root.clientWidth || window.innerWidth, H = this.ui.root.clientHeight || window.innerHeight;
    const w = this.el.offsetWidth || 230, h = this.el.offsetHeight || 150;
    let x, y;
    if (side === 'top') { x = cx - w / 2; y = cy - r - h - 14; }
    else { x = ax + 18; y = ay - h * 0.5; }
    x = Math.max(8, Math.min(W - w - 8, x));
    y = Math.max(8, Math.min(H - h - 8, y));
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    // the pin on the side facing the clump
    if (side === 'top') { this.pin.style.left = '50%'; this.pin.style.top = '100%'; this.pin.style.marginTop = '0'; }
    else { this.pin.style.left = 'calc(var(--px) * -4)'; this.pin.style.top = '50%'; this.pin.style.marginTop = ''; }
    const g = this.grab.style;
    const rr = Math.max(40, r * 1.05);
    g.width = g.height = Math.round(rr * 2) + 'px';
    g.transform = `translate(${Math.round(cx - rr)}px, ${Math.round(cy - rr)}px)`;
    this.tip.style.top = Math.round(Math.min(H - 40, cy + r + 10)) + 'px';
  }

  hint(text) {
    this.tip.hidden = !text;
    if (text) { this.tip.textContent = text; this.tip.classList.remove('gone'); clearTimeout(this.tipT); this.tipT = setTimeout(() => this.tip.classList.add('gone'), 3200); }
  }

  dispose() {
    clearTimeout(this.tipT);
    this.el.remove();
    this.grab.remove();
    this.tip.remove();
  }
}
