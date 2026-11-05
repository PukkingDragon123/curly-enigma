// The onboarding layer (game.ui.onboard): everything the forced, cinematic tutorial draws on top of
// the game, per device. Scenes (home/wake.js, home/lessons.js, deep/Prologue.js, forge/tutorial.js,
// cooking/lesson.js) drive it; it never decides what the lesson is.
//   - The tutorial UI level: which HUD pieces have been introduced (TUT below). Pieces not introduced
//     yet are hidden (#ui.obh-<piece>); each one that comes in pops in with a reveal and a name tag.
//     ui.setTutorialLevel(n) (UI.js) → onboard.setLevel(n). Saved in state.data.onboard.level; a save
//     without that key is at the full level (everything shows, as before the tutorial existed).
//   - cinema(on, { skip }): letterbox bars over a cutscene, the HUD tucked away, and a "hold to skip"
//     ring (hold Space / Enter / E, or hold the ring on a touch screen; a tap never skips).
//   - teach(id, opts): a prompt card for one control, drawn per device (key caps and a mouse on a
//     PC, the real touch control lit with a ring and a pointing paw on a phone), with a meter that
//     fills from opts.progress() and a stamp when it's done. Resolves when done (or closed).
//   - spot(target): a ring pulse and a pointing paw on a real control or HUD piece.
//   - mark(pos): a bobbing marker over a place in the world (clamped to the screen edge).
//   - talk(html, opts, fallback): Old Star's lines go through game.convo when it exists, else fallback().
//   - chapter(n, title, sub): a lesson's title card (big carved letters dropping in, a rule, a chime).
//   - lessonDone(n, title, sub): the same card comes back and a red LEARNED stamp slams onto it, a
//     fanfare, confetti sparks; the lesson's medal is kept (state.data.onboard.medals).
//   - graduate(title, sub): the end of the lessons: the four medals pop in one by one, a stamp,
//     confetti and a fanfare.
//   - caption(title, sub): a film caption for a place (top left, under the bar), fades by itself.
//   - toss(from, icon, to): something thrown to you (Old Star's coal, the copper, his chisel): a
//     pixel icon arcs from a screen point (or a world point) to a HUD piece and lands with a pop.
//   - confetti(x, y, n): a burst of pixel confetti and sparks at a screen point.
// None of these block input; each resolves when it's gone.
// Test hooks: ui.onboard.debug.{ state(), level(n), complete(), skip(), hidden(), history(), cinema(on), medals() }.
import { el, clamp } from '../core/util.js';
import { Px, art } from './uiArt.js';
import { SPR } from './uiSprites.js';
import { DSPR } from './deepArt.js';
import './onboard.css';

/** Tutorial UI levels, in the order the pieces are introduced. */
export const TUT = { CINEMA: 0, LOOK: 1, WALK: 2, USE: 3, QUEST: 4, DIG: 5, TOOLS: 6, PACK: 7, MAP: 8, GUARD: 9, FULL: 10 };

/** HUD pieces: [name, level it comes in at, selectors (inside #ui), tag shown when it comes in]. */
const PIECES = [
  ['xh', TUT.LOOK, '.xh', null],
  ['stick', TUT.WALK, '.tc-stick', null],
  ['use', TUT.USE, '.tc .d-use, .tc .b-use', null],
  ['quest', TUT.QUEST, '.qt, .qm-way, .qm-eye, .qm-pin, .qm-bang', { pc: 'Your task · <kbd>B</kbd>', t: 'Your task' }],
  ['belt', TUT.DIG, '.belt', { pc: 'Your tools · <kbd>1</kbd>–<kbd>8</kbd>', t: 'Your tools' }],
  ['dig', TUT.DIG, '.tc-dig', null],
  ['move', TUT.DIG, '.tc .d-jump, .tc .d-crouch, .tc .b-jump', null],
  ['pack', TUT.PACK, '.pack-bag, .pack-load', { pc: 'Backpack · <kbd>I</kbd>', t: 'Backpack' }],
  ['tool', TUT.TOOLS, '.tc .d-tool, .tc .b-tool', null],
  ['book', TUT.MAP, '.pack-book', { pc: 'Your book · <kbd>B</kbd>', t: 'Your book' }],
  ['radar', TUT.MAP, '.radar', { pc: 'Radar · <kbd>M</kbd> map', t: 'Radar: tap for the map' }],
  ['guard', TUT.GUARD, '.tc .d-block', null],
  ['snack', TUT.FULL, '.tc .d-snack, .tc .b-snack', null],
  ['purse', TUT.FULL, '.hud-tl, .fb-strip, .sk-chip, .cal', { pc: 'Gold &amp; energy', t: 'Gold &amp; energy' }],
  ['build', TUT.FULL, '.tc .b-build, .hud > button[aria-label="Decorate"]', null],
];

const isTouch = () => document.documentElement.classList.contains('is-touch');
/** Set a CSS custom property on an element (el()'s style object can't), and return it. */
const cssVar = (e, k, v) => { e.style.setProperty(k, String(v)); return e; };
const KEY_NAME = { Space: 'Space', ShiftLeft: 'Shift', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab' };
const keyLabel = (code) => KEY_NAME[code] || code.replace(/^Key|^Digit/, '');

// ---------------------------------------------------------------- pixel art
const INK = 0x24150d;

/** A computer mouse, 15×21, with one part lit: 'left' | 'right' | 'wheel' | ''. */
function mouseSprite(lit = '') {
  const p = new Px(17, 23);
  const cream = 0xf2e1b9, shade = 0xd4b47e, dark = 0x9a7448, gold = 0xf6be4a, goldHi = 0xffe8a0;
  p.rr(1, 1, 15, 21, 7, cream);
  // shading on the right and bottom
  p.each((x, y) => (x > 11 || y > 17 ? shade : undefined));
  p.each((x, y) => (x <= 3 && y > 4 && y < 15 ? 0xfcf3dc : undefined));
  const inBtn = (x, y, side) => y >= 1 && y <= 9 && (side === 'left' ? x <= 7 : x >= 9);
  if (lit === 'left' || lit === 'right') p.each((x, y) => (inBtn(x, y, lit) ? (y <= 3 || (lit === 'left' ? x <= 3 : x <= 11) ? goldHi : gold) : undefined));
  p.vl(8, 1, 9, dark);
  p.hl(1, 15, 10, dark);
  p.rect(7, 3, 3, 5, lit === 'wheel' ? gold : 0x56341b);
  p.set(7, 3, lit === 'wheel' ? goldHi : 0x8c5a32);
  p.outline(INK);
  return p;
}

/** A mole's paw pointing up-left with one claw (rotated in CSS for the other diagonals), 16×16. */
function pawSprite() {
  const p = new Px(18, 18);
  // the fur cuff in the corner
  p.disk(16.5, 16.5, 5.2, 0x7a5232);
  p.disk(15.5, 15.5, 2.5, 0x8c6240);
  // the palm
  p.ellipse(10.5, 10, 4.8, 4.4, 0xeaa092);
  p.ellipse(9.6, 9.0, 2.8, 2.2, 0xf8c2b2);
  p.each((x, y) => ((x - 10.5) + (y - 10) > 3.4 && p.get(x, y) !== 0x7a5232 && p.get(x, y) !== 0x8c6240 ? 0xc8786c : undefined));
  // folded claws along the top of the paw
  for (const [x, y] of [[12, 5], [14, 6], [15, 8]]) { p.set(x, y, 0xf2e6cc); p.set(x, y - 1, 0xfcf3dc); }
  // the pointing claw
  for (let i = 0; i <= 6; i++) { p.set(2 + i, 2 + i, 0xf2e6cc); p.set(3 + i, 2 + i, 0xfcf3dc); p.set(2 + i, 3 + i, 0xc0a882); }
  p.set(1, 1, 0xfcf3dc); p.set(2, 1, 0xf2e6cc);
  p.outline(0x2a140a);
  return p;
}

/** A pixel ring for pulses (scaled in CSS), 26×26. */
function ringSprite(color = 0xffe08a) {
  const p = new Px(26, 26);
  for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) {
    const d = Math.hypot(x + 0.5 - 13, y + 0.5 - 13);
    if (d > 10.2 && d < 12.2) p.set(x, y, color);
    else if (d > 9.4 && d <= 10.2) p.set(x, y, 0xffffff, 150);
  }
  return p;
}

/** A four-point sparkle, 9×9. */
function sparkSprite(color = 0xfff0b0) {
  const p = new Px(9, 9);
  p.vl(4, 0, 8, color); p.hl(0, 8, 4, color);
  p.set(4, 4, 0xffffff); p.set(3, 3, color); p.set(5, 5, color); p.set(3, 5, color); p.set(5, 3, color);
  return p;
}

/** A lesson medal on its ribbon (18×26): gold with Old Star's star, or a dim empty socket (lit false). */
function medalSprite(lit = true, ribbon = 0xc23c2c) {
  const p = new Px(18, 26);
  if (lit) {
    // the ribbon: two tails in a V, a fold where it meets the ring
    const dk = 0x5a140c, lt = 0xff9a7a;
    p.poly([[3, 0], [8, 0], [10, 11], [6, 13]], ribbon);
    p.poly([[10, 0], [15, 0], [12, 13], [8, 11]], ribbon);
    for (let y = 0; y < 11; y++) { p.set(3 + Math.floor(y * 0.33), y, lt); p.set(14 - Math.floor(y * 0.2), y, dk); }
    p.rect(7, 10, 4, 3, 0xa8772c);
  }
  // the disc
  const gold = lit ? { hi: 0xfff3c0, lt: 0xf7d97c, base: 0xdcae4e, dk: 0xa8772c, dd: 0x6e4a1a } : { hi: 0x6a5a48, lt: 0x5a4a3a, base: 0x46382c, dk: 0x34281e, dd: 0x241a12 };
  p.disk(9, 17.5, 7.6, gold.dk);
  p.disk(9, 17.5, 6.4, gold.base);
  p.each((x, y, c) => {
    const t = (x - 9) / 6 + (y - 17.5) / 6;
    if (c === gold.base && t < -0.75) return gold.lt;
    if (c === gold.base && t > 0.8) return gold.dk;
    return undefined;
  });
  // Old Star's star (raised, lit from the top left)
  const star = [[9, 13], [9, 14], [8, 15], [9, 15], [10, 15], [5, 16], [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16], [13, 16], [7, 17], [8, 17], [9, 17], [10, 17], [11, 17], [7, 18], [8, 18], [9, 18], [10, 18], [11, 18], [6, 19], [7, 19], [11, 19], [12, 19], [6, 20], [12, 20], [5, 21], [13, 21]];
  for (const [x, y] of star) p.set(x, y, lit ? gold.hi : gold.dk);
  for (const [x, y] of star) if (lit && !star.some(([a, b]) => a === x && b === y + 1)) p.set(x, y + 1, gold.dk);
  if (lit) { p.set(5, 13, 0xffffff); p.set(4, 14, gold.hi); }
  p.outline(INK);
  return p;
}

const ART = {
  medal: (lit, rib) => art('ob:medal:' + (lit ? 1 : 0) + ':' + (rib || ''), () => medalSprite(lit, rib)),
  mouse: (lit) => art('ob:mouse:' + lit, () => mouseSprite(lit)),
  paw: () => art('ob:paw', pawSprite),
  ring: (c) => art('ob:ring:' + (c || ''), () => ringSprite(c)),
  spark: (c) => art('ob:spark:' + (c || ''), () => sparkSprite(c)),
};

// ---------------------------------------------------------------- glyphs (the picture on a prompt card)
const img = (src, cls = '') => el('img', { class: 'pix ' + cls, src, alt: '' });
const kbd = (code, cls = '') => el('kbd', { class: 'ob-key ' + cls, 'data-code': code }, keyLabel(code));

const GLYPH = {
  /** WASD in a cluster (live: each lights while held). */
  wasd: () => el('div', { class: 'ob-g-wasd' }, [el('span'), kbd('KeyW'), el('span'), kbd('KeyA'), kbd('KeyS'), kbd('KeyD')]),
  keys: (codes) => el('div', { class: 'ob-g-keys' }, codes.map((c) => (c === '+' ? el('b', { class: 'ob-plus' }, '+') : c === '/' ? el('b', { class: 'ob-plus' }, 'or') : kbd(c, c === 'Space' ? 'wide' : c.startsWith('Shift') ? 'mid' : '')))),
  mouse: (lit = '', move = false) => el('div', { class: 'ob-g-mouse' + (move ? ' move' : '') }, [img(ART.mouse(lit), 'ob-mouse'), move ? el('i', { class: 'ob-arrows' }) : null]),
  mouseKey: (lit, code) => el('div', { class: 'ob-g-keys' }, [img(ART.mouse(lit), 'ob-mouse sm'), el('b', { class: 'ob-plus' }, 'or'), kbd(code)]),
  stick: () => el('div', { class: 'ob-g-stick' }, [img(SPR.stick(), 'ob-stick'), img(SPR.knob(), 'ob-knob')]),
  btn: (icon) => el('div', { class: 'ob-g-btn' }, [img(SPR.rbtn(false), 'ob-btnface'), img(/^(data:|blob:|https?:)/.test(icon) ? icon : SPR.icon(icon), 'ob-btnic')]),
  big: (src) => el('div', { class: 'ob-g-big' }, [img(DSPR.bigBtn(false), 'ob-bigface'), img(src || DSPR.pick(), 'ob-bigic')]),
  drag: () => el('div', { class: 'ob-g-drag' }, [el('i', { class: 'ob-trail' }), img(ART.paw(), 'ob-gpaw')]),
  tap: (hold = false) => el('div', { class: 'ob-g-tap' + (hold ? ' hold' : '') }, [img(ART.ring(), 'ob-tapring'), img(ART.paw(), 'ob-gpaw')]),
  circle: () => el('div', { class: 'ob-g-circle' }, [img(ART.paw(), 'ob-gpaw')]),
  icon: (src) => el('div', { class: 'ob-g-icon' }, [img(src)]),
};

/**
 * The controls the lessons teach: per device, the title, the line under it, the glyph, which keys
 * light up live (pc), and which real touch control gets the ring and the paw (touch).
 */
export const CONTROLS = {
  look: { title: 'Look around', pc: { sub: 'Move the mouse', glyph: () => GLYPH.mouse('', true) }, t: { sub: 'Drag on the right of the screen', glyph: () => GLYPH.drag(), spot: 'lookpad' } },
  walk: { title: 'Walk', pc: { sub: 'Hold <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>', glyph: () => GLYPH.wasd(), keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD'] }, t: { sub: 'Push the stick', glyph: () => GLYPH.stick(), spot: 'stick' } },
  run: { title: 'Run', pc: { sub: 'Hold <kbd>Shift</kbd> as you walk', glyph: () => GLYPH.keys(['ShiftLeft', '+', 'KeyW']), keys: ['ShiftLeft', 'ShiftRight', 'KeyW'] }, t: null },
  jump: { title: 'Jump', pc: { sub: 'Tap <kbd>Space</kbd>', glyph: () => GLYPH.keys(['Space']), keys: ['Space'] }, t: { sub: 'Tap the jump button', glyph: () => GLYPH.btn('jump'), spot: 'jump' } },
  crouch: { title: 'Crouch', pc: { sub: 'Hold <kbd>C</kbd> to duck', glyph: () => GLYPH.keys(['KeyC']), keys: ['KeyC'] }, t: { sub: 'Tap to duck, again to stand', glyph: () => GLYPH.btn('crouch'), spot: 'crouch' } },
  use: { title: 'Use', pc: { sub: 'Look at it and press <kbd>E</kbd>', glyph: () => GLYPH.keys(['KeyE']), keys: ['KeyE'] }, t: { sub: 'Tap the hand button', glyph: () => GLYPH.btn('use'), spot: 'use' } },
  talk: { title: 'Talk', pc: { sub: 'Look at him and press <kbd>E</kbd>', glyph: () => GLYPH.keys(['KeyE']), keys: ['KeyE'] }, t: { sub: 'Tap the hand button', glyph: () => GLYPH.btn('use'), spot: 'use' } },
  dig: { title: 'Dig', pc: { sub: 'Hold the <b>left button</b>', glyph: () => GLYPH.mouse('left'), mouse: 0 }, t: { sub: 'Hold the pick button', glyph: () => GLYPH.big(), spot: 'dig' } },
  pickup: { title: 'Pick it up', pc: { sub: 'Look at it and press <kbd>E</kbd>', glyph: () => GLYPH.keys(['KeyE']), keys: ['KeyE'] }, t: { sub: 'Tap the hand button', glyph: () => GLYPH.btn('use'), spot: 'use' } },
  tool: { title: 'Change tool', pc: { sub: 'A number key, or the wheel', glyph: () => GLYPH.keys(['Digit1', 'Digit2', 'Digit3']), keys: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'] }, t: { sub: 'Tap a tool on your belt', glyph: () => GLYPH.btn('tool'), spot: 'belt' } },
  pack: { title: 'Your backpack', pc: { sub: 'Press <kbd>I</kbd> to look inside', glyph: () => GLYPH.keys(['KeyI']), keys: ['KeyI'] }, t: { sub: 'Tap the backpack', glyph: () => GLYPH.icon(SPR.pack(1)), spot: 'pack' } },
  book: { title: 'Your book', pc: { sub: 'Press <kbd>B</kbd>', glyph: () => GLYPH.keys(['KeyB']), keys: ['KeyB'] }, t: { sub: 'Tap the book', glyph: () => GLYPH.icon(SPR.bookPeek()), spot: 'book' } },
  map: { title: 'The layers', pc: { sub: 'Press <kbd>M</kbd> to see the layers below', glyph: () => GLYPH.keys(['KeyM']), keys: ['KeyM'] }, t: { sub: 'Tap the radar to see the layers below', glyph: () => GLYPH.icon(DSPR.radarRing()), spot: 'radar' } },
  guard: { title: 'Guard', pc: { sub: 'Hold the <b>right button</b> or <kbd>F</kbd>', glyph: () => GLYPH.mouseKey('right', 'KeyF'), keys: ['KeyF'], mouse: 2 }, t: { sub: 'Hold the shield button', glyph: () => GLYPH.btn(document.querySelector('.d-block .tc-ic')?.src || 'use'), spot: 'block' } },
  snack: { title: 'Snack', pc: { sub: 'Press <kbd>Q</kbd> to eat', glyph: () => GLYPH.keys(['KeyQ']), keys: ['KeyQ'] }, t: { sub: 'Tap the snack button', glyph: () => GLYPH.btn('snack'), spot: 'snack' } },
  place: { title: 'Build', pc: { sub: 'Aim at the wall, <b>click</b> to place', glyph: () => GLYPH.mouse('left'), mouse: 0 }, t: { sub: 'Aim, then press the big button', glyph: () => GLYPH.big(), spot: 'dig' } },
  // the forge and the kitchen (pointer games)
  hold: { title: 'Hold', pc: { sub: 'Hold the <b>left button</b> (or <kbd>Space</kbd>)', glyph: () => GLYPH.mouseKey('left', 'Space'), keys: ['Space'], mouse: 0 }, t: { sub: 'Press and hold', glyph: () => GLYPH.tap(true) } },
  click: { title: 'Click', pc: { sub: '<b>Click</b>', glyph: () => GLYPH.mouse('left'), mouse: 0 }, t: { sub: 'Tap', glyph: () => GLYPH.tap() } },
  drag: { title: 'Drag', pc: { sub: 'Hold the button and <b>drag</b>', glyph: () => GLYPH.mouse('left', true), mouse: 0 }, t: { sub: 'Drag your finger', glyph: () => GLYPH.drag() } },
  circle: { title: 'Stir', pc: { sub: 'Move the mouse in <b>circles</b>', glyph: () => GLYPH.circle() }, t: { sub: 'Draw circles with your finger', glyph: () => GLYPH.circle() } },
};

// ---------------------------------------------------------------- the layer
export class Onboard {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.lvl = TUT.FULL;
    this.cine = null;
    this.prompt = null;
    this.spots = new Set();
    this.marks = new Set();
    this.queue = [];
    this.hist = [];
    this.pendingReveal = new Set();
    this.layer = el('div', { class: 'ob-layer' });
    ui.root.insertBefore(this.layer, ui.overlay);
    this.installHiding();
    // the hold-to-skip keys (registered before the dialogue box's, which swallows its own presses)
    this.held = new Set();
    window.addEventListener('keydown', (e) => {
      if (!this.cine?.skip || e.repeat) return;
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') this.held.add(e.code);
    }, true);
    window.addEventListener('keyup', (e) => { this.held.delete(e.code); });
    window.addEventListener('blur', () => this.held.clear());
    const st = this.game.state;
    st.on('load', () => this.sync());
    // the lessons end (the last one done, or all skipped): the whole HUD
    st.on('act', (a) => {
      if (a?.type !== 'lesson' || !st.data.onboard) return;
      if (a.step === 'cook_done' || a.step === 'skip') this.setLevel(TUT.FULL);
    });
    this.sync(false);
    this.setupDebug();
  }

  // ------------------------------------------------------------ the tutorial UI level
  get level() { return this.lvl; }
  get data() { return this.game.state.data.onboard || null; }

  /** A new game: the tutorial starts with nothing on screen. */
  begin() {
    const st = this.game.state;
    st.data.onboard = { level: TUT.CINEMA, seen: [] };
    st.dirty = true;
    this.apply(TUT.CINEMA, false);
  }

  /** Apply the saved level (none saved: everything shows). */
  sync(reveal = false) {
    const d = this.data;
    this.apply(d ? clamp(d.level | 0, 0, TUT.FULL) : TUT.FULL, reveal);
  }

  /** Raise (or with force, set) the level. New pieces pop in with a reveal and a name tag. */
  setLevel(n, { force = false, reveal = true } = {}) {
    n = clamp(n | 0, 0, TUT.FULL);
    const d = this.data;
    if (!d && !force) { this.apply(TUT.FULL, false); return this.lvl; }
    if (d) {
      if (!force && n <= d.level) { if (this.lvl !== d.level) this.apply(d.level, false); return this.lvl; }
      d.level = n;
      if (n >= TUT.FULL) d.done = true;
      this.game.state.dirty = true;
    }
    this.apply(n, reveal);
    return this.lvl;
  }

  apply(n, reveal) {
    const was = this.lvl;
    this.lvl = n;
    const root = this.ui.root;
    root.dataset.tut = String(n);
    root.classList.toggle('ob-tut', n < TUT.FULL);
    for (const [name, at] of PIECES) {
      const hide = n < at;
      root.classList.toggle('obh-' + name, hide);
      if (!hide && was < at && reveal) this.pendingReveal.add(name);
    }
    if (this.pendingReveal.size) this.revealSoon();
  }

  /** Which pieces are hidden right now. */
  hidden() { return PIECES.filter(([, at]) => this.lvl < at).map(([n]) => n); }

  installHiding() {
    const css = PIECES.map(([name, , sel]) => sel.split(',').map((s) => `#ui.obh-${name} ${s.trim()}`).join(', ') + ' { display: none !important; }').join('\n');
    document.head.append(el('style', { 'data-ob': 'levels' }, css));
  }

  /** Play the reveals for pieces that came in (when they can be seen: in first person, no panel). */
  revealSoon() {
    clearTimeout(this._revT);
    this._revT = setTimeout(() => {
      if (this.ui.hudMode !== 'deep' || this.panelUp() || this.cine) { this.revealSoon(); return; }
      const names = [...this.pendingReveal];
      this.pendingReveal.clear();
      let k = 0;
      for (const name of names) {
        const p = PIECES.find((q) => q[0] === name);
        if (!p) continue;
        const els = [...this.ui.root.querySelectorAll(p[2])].filter((e) => e.getClientRects().length && !e.closest('[hidden]'));
        if (!els.length) continue;
        setTimeout(() => this.revealEls(els, p[3]), k++ * 380);
      }
    }, 260);
  }

  revealEls(els, tag) {
    const a = this.game.audio;
    a.play('sparkle', { vol: 0.5 });
    a.play('ding', { vol: 0.35 });
    els.forEach((e, i) => {
      e.classList.remove('ob-new');
      void e.offsetWidth;
      e.classList.add('ob-new');
      setTimeout(() => e.classList.remove('ob-new'), 1400);
      if (i === 0) this.burst(e.getBoundingClientRect(), tag ? (isTouch() ? tag.t : tag.pc) : null);
    });
  }

  /** A ring and sparkles at a screen rect, and a name tag under it for a moment. */
  burst(r, tag = null) {
    if (!r || !r.width) return;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const b = el('div', { class: 'ob-burst', style: { left: cx + 'px', top: cy + 'px' } }, [img(ART.ring(), 'ob-burst-ring')]);
    for (let i = 0; i < 8; i++) {
      const s = img(ART.spark(), 'ob-burst-spark');
      const ang = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      s.style.setProperty('--dx', Math.cos(ang).toFixed(2));
      s.style.setProperty('--dy', Math.sin(ang).toFixed(2));
      s.style.animationDelay = (Math.random() * 0.12).toFixed(2) + 's';
      b.append(s);
    }
    this.layer.append(b);
    setTimeout(() => b.remove(), 1300);
    if (tag) {
      const below = cy < window.innerHeight * 0.6;
      const t = el('div', { class: 'ob-tag' + (below ? '' : ' up'), html: tag });
      const x = clamp(cx, 70, window.innerWidth - 70);
      t.style.left = x + 'px';
      t.style.top = (below ? r.bottom + 6 : r.top - 6) + 'px';
      this.layer.append(t);
      setTimeout(() => t.classList.add('out'), 2600);
      setTimeout(() => t.remove(), 3100);
    }
  }

  // ------------------------------------------------------------ cinema: letterbox + hold to skip
  /**
   * Letterbox bars over a cutscene (the HUD tucked away). opts.skip: called once when the player
   * holds the skip ring long enough (omit it for a beat that can't be skipped).
   */
  cinema(on, opts = {}) {
    const root = this.ui.root;
    if (on) {
      if (!this.cine) {
        const fill = el('i', { class: 'ob-skip-fill' });
        const skipEl = el('button', { class: 'ob-skip interactive', 'aria-label': 'Hold to skip' }, [
          el('span', { class: 'ob-skip-ring' }, [fill, el('i', { class: 'ob-skip-core' })]),
          el('span', { class: 'ob-skip-t', html: isTouch() ? 'Hold to skip' : 'Hold <kbd>Space</kbd> to skip' }),
        ]);
        const top = el('div', { class: 'ob-bar t' }), bot = el('div', { class: 'ob-bar b' });
        const c = el('div', { class: 'ob-cine' }, [top, bot]);
        this.layer.append(c);
        // the skip ring sits over everything (the cutscene talk's own bars and words too)
        this.skipWrap ||= el('div', { class: 'ob-skipwrap' });
        if (!this.skipWrap.isConnected) root.append(this.skipWrap);
        this.skipWrap.append(skipEl);
        this.fitBars();
        // (the cutscene talk's own bars slide in over these when he talks: the same height and colour, so
        // they read as one letterbox; its bars(true) isn't asked for, since with no line up it also shows
        // its empty name label at the top left)
        void c.offsetWidth;
        c.classList.add('on');
        this.cine = { el: c, skipEl, fill, t: 0, skip: null, fired: false, ptr: false };
        const down = (e) => { e.preventDefault(); e.stopPropagation(); this.game.audio.init?.(); if (this.cine) this.cine.ptr = true; };
        const up = (e) => { e?.stopPropagation?.(); if (this.cine) this.cine.ptr = false; };
        skipEl.addEventListener('pointerdown', down);
        for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) skipEl.addEventListener(ev, up);
        root.classList.add('ob-cinema');
      }
      this.cine.skip = opts.skip || null;
      this.cine.hold = opts.hold ?? 1.1;
      this.cine.fired = false;
      this.cine.t = 0;
      this.cine.skipEl.hidden = !this.cine.skip;
      return this.cine;
    }
    const c = this.cine;
    if (!c) return null;
    this.cine = null;
    this.held.clear();
    root.classList.remove('ob-cinema');
    if (c.el.classList.contains('ext')) { try { this.game.convo?.bars?.(false); } catch (e) { /* gone */ } }
    c.el.classList.remove('on');
    c.el.classList.add('off');
    c.skipEl.classList.add('gone');
    setTimeout(() => { c.el.remove(); c.skipEl.remove(); }, 700);
    if (this.pendingReveal.size) this.revealSoon();
    return null;
  }

  /**
   * A chapter card for a lesson: "Lesson 2" over its name in big carved letters (dropping in one by
   * one), a rule drawn out under it, a line beneath, a chime; it holds a moment and fades. Never
   * blocks input. Returns a promise that resolves when it's gone.
   */
  chapter(n, title, sub = '', dur = 3.2) {
    const card = this.lessonCard(n, title, sub);
    this.game.audio.play('ding', { vol: 0.8 });
    this.game.audio.play('page', { vol: 0.4 });
    return this.holdCard(card, dur);
  }

  /** The carved title card (chapter, lesson done): small kicker, big letters, a rule, a line. */
  lessonCard(n, title, sub = '', cls = '') {
    this.chapterEl?.remove();
    const letters = el('b', { class: 'ob-chapter-t', 'aria-label': title }, [...String(title)].map((c, i) => cssVar(el('span', { 'aria-hidden': 'true' }, c === ' ' ? '\u00a0' : c), '--i', i)));
    const card = el('div', { class: 'ob-chapter ' + cls, 'aria-live': 'polite' }, [
      el('i', { class: 'ob-chapter-glow' }),
      el('small', {}, typeof n === 'number' ? `Lesson ${n}` : String(n)),
      letters,
      el('i', { class: 'ob-chapter-rule' }),
      sub ? el('span', { class: 'ob-chapter-sub' }, sub) : null,
    ]);
    this.layer.append(card);
    this.chapterEl = card;
    void card.offsetWidth;
    card.classList.add('on');
    return card;
  }

  holdCard(card, dur) {
    return new Promise((res) => {
      setTimeout(() => card.classList.add('off'), dur * 1000);
      setTimeout(() => { card.remove(); if (this.chapterEl === card) this.chapterEl = null; res(); }, dur * 1000 + 700);
    });
  }

  /**
   * A lesson is over: its card comes back, a red LEARNED stamp slams onto it (a thud, the card
   * jolts), a fanfare and a burst of confetti sparks. The medal is kept for the graduation.
   */
  lessonDone(n, title, sub = '', dur = 3.0) {
    const d = this.data;
    if (d && typeof n === 'number') { d.medals ||= []; if (!d.medals.includes(n)) { d.medals.push(n); this.game.state.dirty = true; } }
    const card = this.lessonCard(n, title, sub, 'done');
    const stamp = el('i', { class: 'ob-stamp' }, [el('span', {}, 'Learned')]);
    const medal = img(ART.medal(true), 'ob-chapter-medal');
    card.append(stamp, medal);
    const a = this.game.audio;
    a.play('fanfare', { vol: 0.8 });
    setTimeout(() => {
      if (!card.isConnected) return;
      card.classList.add('stamped');
      a.play('thud', { vol: 0.9 });
      a.play('clunk', { vol: 0.5 });
      a.play('sparkle', { vol: 0.5 });
      const r = stamp.getBoundingClientRect();
      this.confetti(r.left + r.width / 2, r.top + r.height / 2, 46);
    }, 620);
    return this.holdCard(card, dur);
  }

  /**
   * The lessons are all done: "Apprentice" over the four medals (each pops in with a rising chime;
   * one not earned stays a dim socket), a gold stamp, confetti and a fanfare.
   */
  graduate(title = 'Apprentice', sub = '', dur = 4.8) {
    const got = new Set(this.data?.medals || [1, 2, 3, 4]);
    const card = this.lessonCard('Old Star\'s lessons', title, sub, 'grad');
    const names = ['The Pick', 'The Dig', 'The Forge', 'The Hearth'];
    const row = el('div', { class: 'ob-medals' }, names.map((nm, i) => cssVar(el('figure', { class: 'ob-medal' + (got.has(i + 1) ? '' : ' none') }, [img(ART.medal(got.has(i + 1), [0xc23c2c, 0x3f7ec8, 0x5a9a3a, 0xd9901e][i]), 'ob-medal-img'), el('figcaption', {}, nm)]), '--i', i)));
    const stamp = el('i', { class: 'ob-stamp gold' }, [el('span', {}, 'Graduated')]);
    card.append(row, stamp);
    const a = this.game.audio;
    a.play('fanfare', { vol: 0.9 });
    names.forEach((_, i) => setTimeout(() => {
      if (!card.isConnected) return;
      a.tone?.({ f: 660 * Math.pow(2, (i * 3) / 12), type: 'square', dur: 0.14, vol: 0.05, filter: 'lowpass', ff: 3000 });
      a.play('ding', { vol: 0.35 });
      const m = row.children[i]?.getBoundingClientRect();
      if (m && got.has(i + 1)) this.confetti(m.left + m.width / 2, m.top + m.height * 0.4, 10, { up: 0.6 });
    }, 700 + i * 330));
    setTimeout(() => {
      if (!card.isConnected) return;
      card.classList.add('stamped');
      a.play('thud', { vol: 0.9 });
      a.play('firework', { vol: 0.6 });
      a.play('success', { vol: 0.6 });
      const r = card.getBoundingClientRect();
      this.confetti(r.left + r.width / 2, r.top + r.height * 0.45, 70, { spread: 1.6 });
    }, 700 + names.length * 330 + 250);
    return this.holdCard(card, dur);
  }

  /** A film caption for a place: top left under the bar, a gold rule, letter-spaced. Fades by itself. */
  caption(title, sub = '', dur = 4) {
    this.captionEl?.remove();
    const c = el('div', { class: 'ob-caption' }, [el('i', { class: 'ob-caption-rule' }), el('b', {}, title), sub ? el('span', {}, sub) : null]);
    this.layer.append(c);
    this.captionEl = c;
    void c.offsetWidth;
    c.classList.add('on');
    return new Promise((res) => {
      setTimeout(() => c.classList.add('off'), dur * 1000);
      setTimeout(() => { c.remove(); if (this.captionEl === c) this.captionEl = null; res(); }, dur * 1000 + 900);
    });
  }

  /** Pixel confetti and sparks bursting from a screen point and falling. o: { up (0..1), spread }. */
  confetti(x, y, n = 30, o = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const wrap = el('div', { class: 'ob-confetti', style: { left: x + 'px', top: y + 'px' } });
    const cols = ['#ffd56a', '#fff3c0', '#f6be4a', '#e8604a', '#ff9ab8', '#8ac85a', '#7fc0f0', '#fff'];
    const up = o.up ?? 1, spread = o.spread ?? 1;
    for (let i = 0; i < n; i++) {
      const spark = i % 4 === 0;
      const b = spark ? img(ART.spark(), 'ob-cf spark') : el('i', { class: 'ob-cf' });
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25 * spread;
      const v = (60 + Math.random() * 110) * (0.6 + 0.4 * up);
      b.style.setProperty('--dx', (Math.cos(ang) * v * 1.3).toFixed(0) + 'px');
      b.style.setProperty('--dy', (Math.sin(ang) * v).toFixed(0) + 'px');
      b.style.setProperty('--fall', (90 + Math.random() * 140).toFixed(0) + 'px');
      b.style.setProperty('--r', ((Math.random() - 0.5) * 900).toFixed(0) + 'deg');
      b.style.setProperty('--t', (1.1 + Math.random() * 0.9).toFixed(2) + 's');
      if (!spark) { b.style.background = cols[i % cols.length]; if (i % 3 === 0) b.classList.add('long'); }
      b.style.animationDelay = (Math.random() * 0.08).toFixed(2) + 's';
      wrap.append(b);
    }
    this.layer.append(wrap);
    setTimeout(() => wrap.remove(), 2400);
  }

  /**
   * Something thrown to you: a pixel icon arcs from `from` (screen { x, y }, or a function giving a
   * world point, put on screen through the scene's camera) to `to` (a HUD piece: 'pack' 'belt' 'book'
   * …, an element, or a screen point), spinning, and lands with a pop, a sparkle and a little bump of
   * the piece it lands on. Resolves when it lands.
   */
  toss(from, src, to = 'pack', o = {}) {
    let p0 = from;
    if (typeof from === 'function') {
      try { const w = from(); const s = w && this.game.scene?.toScreen?.(w); p0 = s && s.visible !== false && Number.isFinite(s.x) ? { x: s.x, y: s.y } : null; } catch (e) { p0 = null; }
    }
    const W = window.innerWidth, H = window.innerHeight;
    if (!p0 || !Number.isFinite(p0.x)) p0 = { x: W * 0.62, y: H * 0.55 };
    const node = el('div', { class: 'ob-toss' }, [img(src, 'ob-toss-ic'), el('i', { class: 'ob-toss-sh' })]);
    this.layer.append(node);
    this.game.audio.play('whoosh', { vol: 0.35, pitch: 1.3 });
    return new Promise((res) => {
      const t = { node, p0, to, t: 0, dur: o.dur ?? 0.85, spin: (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random()), res, o };
      (this.tosses ||= []).push(t);
      this.placeToss(t);
    });
  }

  tossTarget(t) {
    const to = t.to;
    if (to && typeof to === 'object' && !(to instanceof Element) && Number.isFinite(to.x)) return { x: to.x, y: to.y, el: null };
    const e = to instanceof Element ? to : this.resolveTarget(to);
    const r = e?.getBoundingClientRect?.();
    if (r && r.width > 2) return { x: r.left + r.width / 2, y: r.top + r.height / 2, el: e };
    // (that piece isn't on screen: into your paws, low in the middle)
    return { x: window.innerWidth / 2, y: window.innerHeight * 0.86, el: null };
  }

  placeToss(t) {
    const k = clamp(t.t / t.dur, 0, 1);
    const q = this.tossTarget(t);
    const x = t.p0.x + (q.x - t.p0.x) * k;
    const lift = Math.min(window.innerHeight * 0.32, 80 + Math.abs(q.x - t.p0.x) * 0.25);
    const y = t.p0.y + (q.y - t.p0.y) * k - Math.sin(k * Math.PI) * lift;
    const sc = 1.5 - 0.7 * k + Math.sin(k * Math.PI) * 0.35;
    t.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    t.node.firstChild.style.transform = `translate(-50%, -50%) scale(${sc.toFixed(3)}) rotate(${(t.spin * k * 360).toFixed(0)}deg)`;
    return q;
  }

  tickTosses(dt) {
    if (!this.tosses?.length) return;
    for (const t of [...this.tosses]) {
      t.t += dt;
      const q = this.placeToss(t);
      if (t.t < t.dur) continue;
      this.tosses.splice(this.tosses.indexOf(t), 1);
      t.node.remove();
      const a = this.game.audio;
      a.play('pickup', { vol: 0.6 });
      a.play('sparkle', { vol: 0.35 });
      this.burst({ left: q.x - 10, top: q.y - 10, width: 20, height: 20, bottom: q.y + 10 }, t.o.label || null);
      if (q.el) { q.el.classList.remove('ob-bump'); void q.el.offsetWidth; q.el.classList.add('ob-bump'); setTimeout(() => q.el.classList.remove('ob-bump'), 600); }
      t.res();
    }
  }

  /** The bars are as tall as the cutscene talk's (src/ui/Convo.js), so one hands over to the other unseen. */
  fitBars() {
    const W = this.ui.root.clientWidth || innerWidth, H = this.ui.root.clientHeight || innerHeight;
    const bar = Math.round(W < H ? Math.min(H * 0.085, 84) : Math.min(H * 0.105, 92));
    this.ui.root.style.setProperty('--ob-bar', bar + 'px');
  }

  /** Hold-to-skip: fills while held, drains when let go; a full ring skips once. */
  tickSkip(dt) {
    const c = this.cine;
    if (!c || !c.skip || c.fired) return;
    // (keys count while the cutscene talk holds the player, not under a menu or a panel)
    const top = this.ui.panelStack[this.ui.panelStack.length - 1];
    const holding = c.ptr || (this.held.size > 0 && (!top || top.kind === 'convo'));
    c.t = holding ? c.t + dt : Math.max(0, c.t - dt * 2.5);
    const k = clamp(c.t / c.hold, 0, 1);
    c.fill.style.setProperty('--k', k.toFixed(3));
    c.skipEl.classList.toggle('holding', holding && k > 0);
    c.skipEl.classList.toggle('shown', holding || k > 0);
    if (k >= 1) {
      c.fired = true;
      c.skipEl.classList.add('fired');
      this.game.audio.play('whoosh', { vol: 0.5 });
      const f = c.skip;
      c.skip = null;
      try { f(); } catch (e) { console.warn('[onboard] skip', e); }
    }
  }

  // ------------------------------------------------------------ teaching a control
  /**
   * Show the prompt card for a control (an id from CONTROLS, or a spec). opts:
   *   progress() → 0..1 (the meter; 1 = done) · done() → bool · title, sub (override) ·
   *   min (seconds shown before it can be done, default 0.7) · optional (a small card) ·
   *   spot (override the touch control lit) · onDone().
   * Returns a handle: { promise, complete(), close(), set(k), el, id }. The promise resolves with
   * true when done, false when closed.
   */
  teach(id, opts = {}) {
    const base = CONTROLS[id] || { title: opts.title || id, pc: {}, t: {} };
    const touch = isTouch();
    const dev = (touch ? base.t : base.pc) || base.pc || {};
    const spec = { id, title: opts.title || base.title, sub: opts.sub ?? (touch ? opts.subT : opts.subPc) ?? dev.sub ?? '', glyph: dev.glyph, keys: dev.keys || [], mouse: dev.mouse, spot: opts.spot ?? dev.spot ?? null };
    this.closePrompt(false);
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const glyph = el('div', { class: 'ob-glyph' }, [spec.glyph ? spec.glyph() : null]);
    const title = el('b', { class: 'ob-title', html: spec.title });
    const sub = el('span', { class: 'ob-sub', html: spec.sub });
    const fill = el('i', { class: 'ob-fill' });
    const meter = el('div', { class: 'ob-meter', hidden: !opts.progress }, [fill]);
    const seal = img(SPR.seal('green', 'check'), 'ob-seal');
    const lock = el('span', { class: 'ob-lockhint', hidden: true, html: 'Click the view first' });
    const card = el('div', { class: 'ob-card' }, [glyph, el('div', { class: 'ob-txt' }, [title, sub, lock, meter]), seal]);
    const wrap = el('div', { class: 'ob-prompt' + (opts.optional ? ' optional' : '') + (touch ? ' touch' : '') + (opts.place ? ' at-' + opts.place : ''), 'data-id': id }, [card]);
    this.layer.append(wrap);
    void wrap.offsetWidth;
    wrap.classList.add('in');
    this.game.audio.play('page', { vol: 0.3 });
    const h = {
      id, el: wrap, promise, k: 0, t: 0, done: false, opts, spec, fill, lock,
      set: (k) => { h.k = clamp(k, 0, 1); },
      complete: () => this.donePrompt(h),
      close: () => { if (this.prompt === h) this.closePrompt(true); },
    };
    h.settled = false;
    h.resolve = (v) => { h.settled = true; resolve(v); };
    this.prompt = h;
    this.ui.root.classList.toggle('ob-teach-look', id === 'look');
    // the real control on a touch screen: ring + paw
    if (touch && spec.spot) h.spotH = this.spot(spec.spot, { prompt: true });
    return h;
  }

  donePrompt(h) {
    if (!h || h.done) return;
    h.done = true;
    h.k = 1;
    h.fill.style.setProperty('--k', '1');
    h.el.classList.add('done');
    const a = this.game.audio;
    a.play('success', { vol: 0.45 });
    a.play('sparkle', { vol: 0.4 });
    this.burst(h.el.querySelector('.ob-card').getBoundingClientRect());
    h.spotH?.remove();
    const d = this.data;
    if (d && !d.seen.includes(h.id)) { d.seen.push(h.id); this.game.state.dirty = true; }
    this.hist.push(h.id);
    h.opts.onDone?.();
    setTimeout(() => {
      h.el.classList.add('out');
      setTimeout(() => h.el.remove(), 420);
      if (this.prompt === h) { this.prompt = null; this.ui.root.classList.remove('ob-teach-look'); }
      h.resolve(true);
    }, 900);
  }

  closePrompt(resolveFalse = true) {
    const h = this.prompt;
    if (!h) return;
    this.prompt = null;
    this.ui.root.classList.remove('ob-teach-look');
    h.spotH?.remove();
    h.el.classList.add('out');
    setTimeout(() => h.el.remove(), 420);
    if (!h.done && resolveFalse) h.resolve(false);
    else if (!h.done) h.resolve(false);
  }

  /** Has the player been taught this control (this game)? */
  seen(id) { return !!this.data?.seen?.includes(id); }

  // ------------------------------------------------------------ highlights
  /**
   * A ring pulse and a pointing paw on a real control: a DOM element, a touch control name
   * ('stick' 'use' 'dig' 'jump' 'crouch' 'block' 'snack' 'tool' 'lookpad'), or a HUD piece
   * ('pack' 'book' 'radar' 'belt' 'quest' 'menu'), or a selector. Returns { remove() }.
   */
  spot(target, o = {}) {
    const ring = img(ART.ring(), 'ob-spot-ring');
    const ring2 = img(ART.ring(), 'ob-spot-ring r2');
    const paw = img(ART.paw(), 'ob-spot-paw');
    const lab = o.label ? el('span', { class: 'ob-spot-label', html: o.label }) : null;
    const node = el('div', { class: 'ob-spot' + (target === 'lookpad' ? ' lookpad' : '') }, [ring, ring2, paw, lab]);
    this.layer.append(node);
    const s = { target, node, paw, o, lit: null, remove: () => { this.spots.delete(s); node.remove(); if (s.lit) { s.lit.classList.remove('ob-lit'); this.ui.touchHi?.(s.lit, false); } } };
    this.spots.add(s);
    this.placeSpot(s);
    return s;
  }

  resolveTarget(t) {
    if (!t) return null;
    if (t instanceof Element) return t;
    const r = this.ui.root;
    const tc = this.ui.touchEl?.(t);
    if (tc) return tc;
    const named = { pack: '.pack-bag', book: '.pack-book', radar: '.radar', belt: '.belt .loop.sel, .belt', quest: '.qt', menu: '.journal-btn', stick: '.tc-stick', use: '.tc .d-use', dig: '.tc-dig', jump: '.tc .d-jump', crouch: '.tc .d-crouch', block: '.tc .d-block', snack: '.tc .d-snack', tool: '.tc .d-tool' }[t];
    try { return r.querySelector(named || t); } catch (e) { return null; }
  }

  placeSpot(s) {
    if (s.target === 'lookpad') {
      // the right half of the screen: a ghost paw drags across it
      // (below the middle, where the prompt card sits, and clear of the thumbs' buttons)
      const tall = window.innerHeight > window.innerWidth;
      s.node.style.left = Math.round(window.innerWidth * (tall ? 0.66 : 0.7)) + 'px';
      s.node.style.top = Math.round(window.innerHeight * (tall ? 0.7 : 0.72)) + 'px';
      return;
    }
    const e = this.resolveTarget(s.target);
    if (e !== s.lit) {
      if (s.lit) { s.lit.classList.remove('ob-lit'); this.ui.touchHi?.(s.lit, false); }
      s.lit = e;
      if (e) { e.classList.add('ob-lit'); this.ui.touchHi?.(e, true); }
    }
    const r = e?.getBoundingClientRect?.();
    if (!r || !r.width) { s.node.style.display = 'none'; return; }
    s.node.style.display = '';
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    s.node.style.left = cx + 'px';
    s.node.style.top = cy + 'px';
    s.node.style.setProperty('--rs', (Math.max(r.width, r.height) / 26 * 1.25).toFixed(2));
    // the paw sits on the side toward the middle of the screen, pointing at the control
    const sx = cx < window.innerWidth / 2 ? 1 : -1, sy = cy < window.innerHeight / 2 ? 1 : -1;
    const off = Math.max(r.width, r.height) * 0.55 + 14;
    s.paw.style.setProperty('--px0', (sx * off).toFixed(0) + 'px');
    s.paw.style.setProperty('--py0', (sy * off).toFixed(0) + 'px');
    // base sprite points up-left (−1, −1): turn it to point back at the control
    const rot = sx > 0 && sy > 0 ? 0 : sx < 0 && sy > 0 ? 90 : sx < 0 && sy < 0 ? 180 : 270;
    s.paw.style.setProperty('--rot', rot + 'deg');
    s.paw.style.setProperty('--bx', (-sx * 5) + 'px');
    s.paw.style.setProperty('--by', (-sy * 5) + 'px');
  }

  // ------------------------------------------------------------ world markers
  /** A bobbing marker over a world point (pos() → THREE.Vector3, or null to hide). Returns { remove(), label(html) }. */
  mark(pos, o = {}) {
    const lab = el('span', { class: 'ob-mark-l', html: o.label || '' });
    const node = el('div', { class: 'ob-mark' }, [el('i', { class: 'ob-mark-chev' }), lab, el('i', { class: 'ob-mark-arrow' })]);
    this.layer.append(node);
    const m = { pos, node, lab, remove: () => { this.marks.delete(m); node.remove(); }, label: (h) => { lab.innerHTML = h || ''; } };
    this.marks.add(m);
    return m;
  }

  placeMark(m) {
    const sc = this.game.scene;
    const p = (() => { try { return m.pos(); } catch (e) { return null; } })();
    if (!p || !sc?.camera || !sc.toScreen || this.panelUp() || this.cine) { m.node.style.display = 'none'; return; }
    const cam = sc.camera;
    const v = p.clone().applyMatrix4(cam.matrixWorldInverse);
    const behind = v.z > -0.05;
    const s = sc.toScreen(p);
    const W = window.innerWidth, H = window.innerHeight, pad = 34;
    let x = s.x, y = s.y, edge = false;
    if (behind) { x = W - s.x; y = H * 0.55; edge = true; if (Math.abs(x - W / 2) < 10) x = W / 2 + (v.x >= 0 ? 1 : -1) * W; }
    if (x < pad || x > W - pad || y < pad + 30 || y > H - pad) edge = true;
    const cx = clamp(x, pad, W - pad), cy = clamp(y, pad + 30, H - pad);
    m.node.style.display = '';
    m.node.style.left = cx + 'px';
    m.node.style.top = cy + 'px';
    m.node.classList.toggle('edge', edge);
    if (edge) m.node.style.setProperty('--ang', Math.atan2(y - cy, x - cx).toFixed(3) + 'rad');
    // its name stays on screen (a marker near an edge slides its label inward)
    const hw = m.lab.offsetWidth / 2;
    const dx = hw ? clamp(cx, hw + 6, W - hw - 6) - cx : 0;
    if (dx !== m.dx) { m.dx = dx; m.lab.style.translate = dx ? `${dx.toFixed(0)}px 0` : ''; }
  }

  // ------------------------------------------------------------ talk (Old Star's lines)
  /**
   * Old Star (or anyone: opts.who) says a line that waits for the player: through the cutscene talk
   * (game.convo: the camera frames the speaker, the words float by his head) when it exists, else
   * fallback(). Passing tips (no wait) stay on the tutor card: they never hold the player.
   */
  talk(html, opts = {}, fallback = null) {
    // (a lesson carrying on after its scene has gone says nothing in the next one)
    if (opts.scene && this.game.scene !== opts.scene) return Promise.resolve();
    const cv = this.game.convo;
    if (cv && typeof cv.say === 'function' && opts.wait) {
      try { return Promise.resolve(cv.say(opts.who || 'oldstar', html, { mood: opts.mood, wait: true, gesture: opts.gesture, camera: opts.camera })); } catch (e) { console.warn('[onboard] convo', e); }
    }
    if (fallback) return Promise.resolve(fallback());
    return Promise.resolve(this.ui.tutor?.say(html, opts));
  }

  // ------------------------------------------------------------ per frame (from ui.update)
  update(dt) {
    this.tickSkip(dt);
    this.tickTosses(dt);
    const h = this.prompt;
    if (h && !h.done) {
      h.t += dt;
      const o = h.opts;
      let k = h.k;
      try { if (o.progress) k = clamp(o.progress(), 0, 1); } catch (e) { /* the scene went away */ }
      h.k = k;
      h.fill.style.setProperty('--k', h.k.toFixed(3));
      // key caps and mouse buttons light while held
      const inp = this.game.input;
      for (const kc of h.el.querySelectorAll('.ob-key')) kc.classList.toggle('on', inp.down.has(kc.dataset.code) || (kc.dataset.code === 'ShiftLeft' && inp.down.has('ShiftRight')));
      if (h.spec.mouse !== undefined) h.el.querySelector('.ob-mouse')?.classList.toggle('on', !!inp.mouse.buttons[h.spec.mouse]);
      // a desktop look-around needs the mouse caught first
      if (h.lock) h.lock.hidden = !(this.ui.hudMode === 'deep' && !isTouch() && !inp.pointerLocked && !this.ui.isPanelOpen() && (h.id === 'look' || h.spec.mouse !== undefined || h.id === 'walk'));
      let done = h.k >= 1;
      try { if (o.done && o.done()) done = true; } catch (e) { /* noop */ }
      if (done && h.t >= (o.min ?? 0.7)) this.donePrompt(h);
    }
    for (const s of this.spots) this.placeSpot(s);
    for (const m of this.marks) this.placeMark(m);
    // (prompts step aside under a menu or a talk)
    this.layer.classList.toggle('panel', this.panelUp());
  }

  /** A menu, a panel or a talk is up (a handle already closed doesn't count). */
  panelUp() {
    const st = this.ui.panelStack, top = st[st.length - 1];
    return !!top && !top.closed;
  }

  /** Everything the layer shows goes (scene change, skip). The level stays. */
  clear() {
    this.closePrompt(true);
    for (const t of this.tosses || []) { t.node.remove(); t.res(); }
    this.tosses = [];
    this.captionEl?.remove(); // (a place's caption belongs to its scene)
    this.captionEl = null;
    for (const s of [...this.spots]) s.remove();
    for (const m of [...this.marks]) m.remove();
    this.cinema(false);
  }

  // ------------------------------------------------------------ tests
  setupDebug() {
    this.debug = {
      state: () => ({ level: this.lvl, saved: this.data?.level ?? null, cinema: !!this.cine, skippable: !!this.cine?.skip, prompt: this.prompt ? { id: this.prompt.id, k: +this.prompt.k.toFixed(2), done: this.prompt.done } : null, spots: this.spots.size, marks: this.marks.size, hidden: this.hidden() }),
      level: (n) => (n === undefined ? this.lvl : this.setLevel(n, { force: true })),
      complete: () => { const h = this.prompt; if (!h) return null; this.donePrompt(h); return h.id; },
      skip: () => { const c = this.cine; if (!c?.skip) return false; const f = c.skip; c.skip = null; c.fired = true; f(); return true; },
      cinema: (on) => (on === undefined ? !!this.cine : (this.cinema(on), !!this.cine)),
      hidden: () => this.hidden(),
      history: () => this.hist.slice(),
      teach: (id) => this.teach(id, {}).id,
      spot: (t) => !!this.spot(t),
      clear: () => this.clear(),
      medals: () => (this.data?.medals || []).slice(),
      lessonDone: (n = 1, t = 'The Pick') => (this.lessonDone(n, t, 'Forged your own pickaxe'), true),
      graduate: () => (this.graduate('Apprentice', 'Dig, forge, cook and sell.'), true),
      toss: (to = 'pack') => (this.toss({ x: innerWidth * 0.6, y: innerHeight * 0.5 }, SPR.pack(1), to), true),
    };
  }
}
