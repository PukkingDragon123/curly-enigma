// The first-person crosshair: a small pixel reticle that changes with what you're looking at
// (rock, ore, a creature, something to use), a name tag under it and a ring for hold actions.
import { el } from '../core/util.js';
import { Px } from './uiArt.js';
import { DSPR, progressRing } from './deepArt.js';

const KINDS = new Set(['none', 'rock', 'ore', 'enemy', 'use']);

export class Crosshair {
  constructor(ui) {
    this.ui = ui;
    this.kind = null;
    this.text = null;
    this.q = -1;
    this.ret = el('img', { class: 'pix xh-ret', src: DSPR.reticle('none'), alt: '' });
    this.ring = new Px(25, 25);
    this.ring.c.className = 'pix xh-ring';
    this.ring.c.hidden = true;
    this.label = el('span', { class: 'xh-label', hidden: true });
    this.el = el('div', { class: 'xh', hidden: true, 'aria-hidden': 'true' }, [this.ring.c, this.ret, this.label]);
    ui.hud.append(this.el);
  }

  /** o: { visible, kind: 'none'|'rock'|'ore'|'enemy'|'use', label, progress: 0..1 } or null. */
  set(o) {
    if (!o || o.visible === false) { this.el.hidden = true; return; }
    this.el.hidden = false;
    const kind = KINDS.has(o.kind) ? o.kind : 'none';
    if (kind !== this.kind) {
      this.kind = kind;
      this.ret.src = DSPR.reticle(kind);
      this.el.dataset.kind = kind;
    }
    const text = o.label ? String(o.label) : '';
    if (text !== this.text) {
      this.text = text;
      this.label.hidden = !text;
      this.label.innerHTML = '';
      if (text) {
        if (kind === 'use') this.label.append(el('kbd', {}, 'E'));
        this.label.append(document.createTextNode(text));
      }
    }
    const pr = Number(o.progress) || 0;
    const q = pr > 0.001 ? Math.round(Math.min(1, pr) * 24) : 0;
    if (q !== this.q) {
      this.q = q;
      this.ring.c.hidden = !q;
      if (q) {
        progressRing(this.ring, q / 24, q >= 24 ? 0x8af07a : kind === 'enemy' ? 0xff7a5a : 0xffd76a);
        this.ring.ctx.putImageData(this.ring.img, 0, 0);
      }
    }
  }
}
