// The onboarding layer (game.ui.onboard): the little the tutorial draws on top of the game, per
// device. Scenes (home/wake.js, home/lessons.js, deep/FirstDig.js, forge/tutorial.js,
// cooking/lesson.js) drive it; it never decides what the lesson is. It stays out of the way: the big
// moments are marked in the 3D world (camera moves, Old Star's gestures, sparks, light, sound), never
// with cards, stamps or confetti.
//   - Unlocks (state.data.unlocks = { id: true, all? }; a save without the key has everything): a new
//     game sees and reaches nothing it hasn't been introduced to. UNLOCKS below names each one and
//     the HUD pieces / entry points behind it; unlock(id) (ui.unlock) lets one in (the piece fades up
//     quietly once it can be seen), isUnlocked(id) (ui.isUnlocked, state.unlocked) asks. The entry
//     points ask too: ui.openInventory / openBook (and its tabs) / openIndex / openSurvey / openSkills /
//     openUpgrades / openShop, the hotbar's slots (src/ui/Belt.js), the home's build mode, the
//     skill feedback, the discovery cards. Where each is granted: the lessons (src/home/lessons.js,
//     src/forge/tutorial.js, src/deep/FirstDig.js); the lessons' end or a skip → unlockAll().
//     Old saves past the lessons (onboard done, lesson 'done' or skipped) have everything; one in the
//     middle of them gets what its stage had (migrate()).
//   - The tutorial UI level (TUT): kept for the scenes that still raise it; each level grants the
//     unlocks listed for it (LEVEL_GRANTS), FULL grants them all. Saved in state.data.onboard.level.
//   - goal(html): one short objective line at the top of the screen ("Talk to Old Star"); goal(null)
//     hides it, goalDone() ticks it off (a soft chime, a green tick, it fades).
//   - cinema(on, { skip }): letterbox bars over a cutscene, the HUD tucked away, and a "hold to skip"
//     ring (hold Space / Enter / E, or hold the ring on a touch screen; a tap never skips).
//   - teach(id, opts): one quiet line for one control (no box: a small glyph, what, how), drawn per
//     device (key caps / the mouse on a PC, the touch control's own art on a phone, whose real control
//     gets a soft pulsing ring), with a hairline meter fed by opts.progress(). When it's done it fades.
//     Resolves when done (or closed).
//   - hint(id, html, { dur, until }): a tiny line low in the middle, once per game per id, that fades
//     by itself (the first "WASD to walk" after the wake-up).
//   - spot(target): a pulsing ring on a real control or HUD piece.
//   - mark(pos): a small bobbing marker over a world point (an arrow at the edge when off screen).
//     The lessons mostly use a 3D glint in the world instead (lessons.js / FirstDig.js).
//   - talk(html, opts, fallback): Old Star's lines go through game.convo when it exists, else fallback().
//   - caption(title, sub): a film caption for a place (under the top bar), fades by itself.
// None of these block input.
// Test hooks: ui.onboard.debug.{ state(), unlocks(), unlock(id | 'all'), level(n), complete(), skip(), hidden(), history(), cinema(on), goal() }.
import { el, clamp } from '../core/util.js';
import { Px, art } from './uiArt.js';
import { SPR } from './uiSprites.js';
import { DSPR } from './deepArt.js';
import { floatIn, leave } from './floatType.js';
import { keepClear } from './uiSolid.js';
import './onboard.css';

/** Tutorial UI levels, in the order the pieces are introduced. */
export const TUT = { CINEMA: 0, LOOK: 1, WALK: 2, USE: 3, QUEST: 4, DIG: 5, TOOLS: 6, PACK: 7, MAP: 8, GUARD: 9, FULL: 10 };

/**
 * What a new game unlocks, one at a time (id → what it is, and where it's granted). The ids are what
 * ui.unlock / ui.isUnlocked / state.unlocked take.
 */
export const UNLOCKS = {
  look: 'the crosshair (after the wake-up)',
  move: 'walking, jumping, crouching on a touch screen (after the wake-up)',
  use: 'the touch "use" hand (after the wake-up)',
  belt: 'the hotbar, with what you have in it (your first pick: forge/tutorial.js)',
  dig: 'the touch dig button (your first pick)',
  tools: 'the touch tool switch (his spare chisel: lessons.js, back with the pick)',
  pack: 'the backpack: I / Tab, its button, the load gauge, your trunk (his old pack: lessons.js, back with the pick)',
  guard: 'the touch shield (the first thing that comes at you: FirstDig.js; else the lessons\' end)',
  book: 'the book: B, its button, the quests and index tabs, the Index Book, discovery cards (his notebook: lessons.js, back with the copper)',
  radar: 'the radar and the depth plumb in the mine (back from the first ride down)',
  layers: 'M / a tap on the radar: the lift layers (back from the first ride down)',
  energy: 'the lantern (when it first runs low, or the lessons\' end)',
  gold: 'the coin pouch (your first gold, or the lessons\' end)',
  quests: 'the quest strip and its waymarks, the calendar (the lessons\' end)',
  skills: 'the skill tree tab, the XP plaque, level-up notes (the lessons\' end)',
  lore: 'the lore tab (the lessons\' end)',
  snack: 'the snack button, food charms (the lessons\' end)',
  hotbar: 'every hotbar slot, empty ones too (the lessons\' end)',
  build: 'building: the home\'s build mode, the hotbar\'s build slot (the lessons\' end)',
  upgrades: 'the Miners\' Board (the lessons\' end)',
  shops: 'shop counters (the lessons\' end)',
};
export const UNLOCK_IDS = Object.keys(UNLOCKS);

/** Old tutorial levels → what each grants (a level grants its own and every one below it). */
const LEVEL_GRANTS = {
  [TUT.LOOK]: ['look'], [TUT.WALK]: ['move'], [TUT.USE]: ['use'], [TUT.QUEST]: [], [TUT.DIG]: ['belt', 'dig'],
  [TUT.TOOLS]: ['tools'], [TUT.PACK]: ['pack'], [TUT.MAP]: ['book', 'radar', 'layers'], [TUT.GUARD]: ['guard'],
};
/** What a game in the middle of the lessons has had by each stage (state.data.oldstar.lesson). */
const STAGE_GRANTS = {
  wake: [], pick: ['look', 'move', 'use'],
  mine: ['look', 'move', 'use', 'belt', 'dig', 'tools', 'pack'],
  forge: ['look', 'move', 'use', 'belt', 'dig', 'tools', 'pack', 'guard', 'book', 'radar', 'layers'],
  cook: ['look', 'move', 'use', 'belt', 'dig', 'tools', 'pack', 'guard', 'book', 'radar', 'layers'],
};

/** HUD pieces: [name, the unlock it waits for, selectors (inside #ui)]. */
const PIECES = [
  ['xh', 'look', '.xh'],
  ['stick', 'move', '.tc-stick'],
  ['use', 'use', '.tc .d-use, .tc .b-use'],
  ['quest', 'quests', '.qt, .qm-way, .qm-eye, .qm-pin, .qm-bang, .cal'],
  ['belt', 'belt', '.belt'],
  ['dig', 'dig', '.tc-dig'],
  ['move', 'move', '.tc .d-jump, .tc .d-crouch, .tc .b-jump'],
  ['pack', 'pack', '.pack-bag, .pack-load'],
  ['tool', 'tools', '.tc .d-tool, .tc .b-tool'],
  ['book', 'book', '.pack-book'],
  ['radar', 'radar', '.radar, .depth'],
  ['guard', 'guard', '.tc .d-block'],
  ['snack', 'snack', '.tc .d-snack, .tc .b-snack, .charms, .fb-strip'],
  ['gold', 'gold', '.hud-tl .pouch'],
  ['energy', 'energy', '.hud-tl .lamp'],
  ['skills', 'skills', '.sk-chip, .sk-badge'],
  ['build', 'build', '.tc .b-build, .hud > button[aria-label="Decorate"]'],
];

const isTouch = () => document.documentElement.classList.contains('is-touch');
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


const ART = {
  mouse: (lit) => art('ob:mouse:' + lit, () => mouseSprite(lit)),
  paw: () => art('ob:paw', pawSprite),
  ring: (c) => art('ob:ring:' + (c || ''), () => ringSprite(c)),
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
    // the lessons end (the last one done, or all skipped): everything, no objective line
    st.on('act', (a) => {
      if (a?.type !== 'lesson' || !st.data.onboard) return;
      if (a.step === 'cook_done' || a.step === 'skip') { this.setLevel(TUT.FULL); this.goal(null); }
    });
    // things that unlock themselves when they first matter: the lantern when it runs low, the
    // pouch with your first gold
    st.on('energy', () => { if (!this.isUnlocked('energy') && st.data.energy < st.data.maxEnergy * 0.45) this.unlock('energy'); });
    st.on('gold', (e) => { if (!this.isUnlocked('gold') && e?.delta) this.unlock('gold'); });
    this.sync(false);
    this.setupDebug();
  }

  // ------------------------------------------------------------ the tutorial UI level + unlocks
  get level() { return this.lvl; }
  get data() { return this.game.state.data.onboard || null; }
  get unlocks() { return this.game.state.data.unlocks || null; }

  /** A new game: the tutorial starts with nothing on screen and nothing unlocked. */
  begin() {
    const st = this.game.state;
    st.data.onboard = { level: TUT.CINEMA, seen: [] };
    st.data.unlocks = {};
    st.dirty = true;
    this.apply(TUT.CINEMA, false);
  }

  /** Has the tutorial introduced this yet? (No unlocks saved: everything is.) */
  isUnlocked(id) {
    const u = this.unlocks;
    return !u || !!u.all || !!u[id];
  }

  /**
   * Let one in (or a list). The pieces behind it fade up once they can be seen. Returns true if
   * anything was new. o.quiet: no fade-up.
   */
  unlock(ids, o = {}) {
    const u = this.unlocks;
    if (!u || u.all) return false;
    let any = false;
    for (const id of [].concat(ids)) if (id && !u[id]) { u[id] = true; any = true; this.hist.push('unlock:' + id); }
    if (!any) return false;
    this.game.state.dirty = true;
    this.applyUnlocks(!o.quiet);
    this.game.state.emit('unlock', { ids: [].concat(ids) });
    return true;
  }

  /** Everything (the lessons are over or skipped). */
  unlockAll(o = {}) {
    const u = this.unlocks;
    if (!u || u.all) { this.applyUnlocks(false); return; }
    u.all = true;
    this.game.state.dirty = true;
    this.applyUnlocks(!o.quiet);
    this.game.state.emit('unlock', { ids: ['all'] });
  }

  /**
   * A save from before the unlocks: past the lessons, everything; in the middle of them, what its
   * stage had by then (and its level's grants).
   */
  migrate() {
    const d = this.game.state.data;
    const od = d.onboard, sd = d.oldstar || {};
    if (sd.lesson === 'done' || sd.skipped || od?.done || (od && (od.level | 0) >= TUT.FULL)) {
      if (d.unlocks && !d.unlocks.all) d.unlocks.all = true;
      return;
    }
    if (!od || d.unlocks) return;
    const u = (d.unlocks = {});
    for (const id of STAGE_GRANTS[sd.lesson] || []) u[id] = true;
    for (const [lv, ids] of Object.entries(LEVEL_GRANTS)) if ((od.level | 0) >= +lv) for (const id of ids) u[id] = true;
  }

  /** Apply the saved level and unlocks (none saved: everything shows). */
  sync(reveal = false) {
    this.migrate();
    const d = this.data;
    this.apply(d ? clamp(d.level | 0, 0, TUT.FULL) : TUT.FULL, reveal);
  }

  /** Raise (or with force, set) the level; it grants that level's unlocks. FULL: everything. */
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
    if (n >= TUT.FULL) this.unlockAll({ quiet: !reveal });
    else {
      const ids = [];
      for (const [lv, g] of Object.entries(LEVEL_GRANTS)) if (n >= +lv) ids.push(...g);
      if (ids.length) this.unlock(ids, { quiet: !reveal });
    }
    this.apply(n, reveal);
    return this.lvl;
  }

  apply(n, reveal) {
    this.lvl = n;
    this.ui.root.dataset.tut = String(n);
    this.applyUnlocks(reveal);
  }

  /** Hide what isn't unlocked yet; what just came in fades up. */
  applyUnlocks(reveal) {
    const root = this.ui.root;
    const u = this.unlocks;
    root.classList.toggle('ob-tut', !!u && !u.all);
    for (const [name, id] of PIECES) {
      const hide = !this.isUnlocked(id);
      const was = root.classList.contains('obh-' + name);
      root.classList.toggle('obh-' + name, hide);
      if (!hide && was && reveal) this.pendingReveal.add(name);
    }
    if (this.pendingReveal.size) this.revealSoon();
  }

  /** Which pieces are hidden right now. */
  hidden() { return PIECES.filter(([, id]) => !this.isUnlocked(id)).map(([n]) => n); }

  installHiding() {
    const css = PIECES.map(([name, , sel]) => sel.split(',').map((s) => `#ui.obh-${name} ${s.trim()}`).join(', ') + ' { display: none !important; }').join('\n');
    document.head.append(el('style', { 'data-ob': 'levels' }, css));
  }

  /** Pieces that came in fade up (when they can be seen: in first person, no panel, no cutscene). */
  revealSoon() {
    clearTimeout(this._revT);
    this._revT = setTimeout(() => {
      if (this.ui.hudMode === 'none' || this.panelUp() || this.cine) { this.revealSoon(); return; }
      const names = [...this.pendingReveal];
      this.pendingReveal.clear();
      for (const name of names) {
        const p = PIECES.find((q) => q[0] === name);
        if (!p) continue;
        for (const e of this.ui.root.querySelectorAll(p[2])) {
          e.classList.remove('ob-new');
          void e.offsetWidth;
          e.classList.add('ob-new');
          setTimeout(() => e.classList.remove('ob-new'), 1300);
        }
      }
    }, 260);
  }

  // ------------------------------------------------------------ a control hint: once, tiny, it fades
  /**
   * A tiny line low in the middle of the screen, the first time only (per id, this game): which
   * keys / thumbs do something. It fades by itself after `dur` seconds or as soon as until() is true.
   */
  hint(id, html, { dur = 7, until = null } = {}) {
    const d = this.data;
    if (d?.seen?.includes('hint:' + id)) return null;
    if (d) { d.seen.push('hint:' + id); this.game.state.dirty = true; }
    this.hintEl?.remove();
    // (wave 9) floating words, no card: the letters arrive in a run and scatter into bits when it goes
    const n = el('div', { class: 'ob-hint' });
    this.layer.append(n);
    floatIn(n, html, { delay: 0.1, stagger: 0.022, max: 0.6 });
    keepClear(n, { prefer: 'y' });
    n.classList.add('in');
    const h = { el: n, t: 0, dur, until, gone: false, remove: () => { if (h.gone) return; h.gone = true; n.classList.add('out'); leave(n, { n: 10 }); setTimeout(() => n.remove(), 950); if (this.hintH === h) this.hintH = null; } };
    this.hintH = h;
    return h;
  }

  // ------------------------------------------------------------ the objective: one short line
  /**
   * The one thing to do now, in a few words, at the top of the screen. goal(null) hides it. Changing
   * it slides the old line out and the new one in. Returns the text.
   */
  goal(html, o = {}) {
    const g = this.goalEl;
    if (!html) {
      if (g) { this.goalEl = null; g.classList.add('out'); leave(g, { n: 8 }); setTimeout(() => g.remove(), 900); }
      this.goalHtml = null;
      return null;
    }
    if (g && this.goalHtml === html && !g.classList.contains('done')) return html;
    if (g) { g.classList.add('out'); leave(g, { n: 8 }); setTimeout(() => g.remove(), 900); }
    // (wave 9) floating words, no pill: the letters arrive in a run, the old line scatters into bits
    const t = el('span', { class: 'ob-goal-t' }), sm = o.sub ? el('small') : null;
    const n = el('div', { class: 'ob-goal' + (o.sub ? ' has-sub' : '') }, [el('i', { class: 'ob-goal-dot' }), t, sm]);
    this.layer.append(n);
    floatIn(t, html, { delay: 0.1, stagger: 0.02, max: 0.5 });
    if (sm) floatIn(sm, o.sub, { delay: 0.3, stagger: 0.015, max: 0.4 });
    keepClear(n, { prefer: 'y' });
    void n.offsetWidth;
    n.classList.add('in');
    this.goalEl = n;
    this.goalHtml = html;
    return html;
  }

  /** The objective is met: a soft chime, its dot turns into a green tick, and it fades. */
  goalDone() {
    const g = this.goalEl;
    if (!g || g.classList.contains('done')) return;
    g.classList.add('done');
    this.game.audio.play('ding', { vol: 0.35 });
    this.goalEl = null;
    this.goalHtml = null;
    setTimeout(() => { g.classList.add('out'); setTimeout(() => g.remove(), 500); }, 1100);
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
        // (the cutscene talk's own bars slide in over these when he talks: the same height and colour)
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
      this.cine.hold = opts.hold ?? 0.9;
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

  /** A film caption for a place: under the top bar, a gold rule, letter-spaced. Fades by itself. */
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
    const holding = c.ptr || (this.held.size > 0 && (!top || top.kind === 'convo' || top.closed));
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
   * Show the prompt for a control (an id from CONTROLS, or a spec). opts:
   *   progress() → 0..1 (the thin meter; 1 = done) · done() → bool · title, sub, subPc, subT (override) ·
   *   min (seconds shown before it can be done, default 0.5) · optional (a tip) · spot (override the
   *   touch control lit) · place ('low' | 'left') · onDone().
   * Returns a handle: { promise, complete(), close(), set(k), el, id, done, settled }. The promise
   * resolves with true when done, false when closed.
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
    const title = el('b', { class: 'ob-title' });
    floatIn(title, spec.title, { delay: 0.12, stagger: 0.025, max: 0.45 });
    const sub = el('span', { class: 'ob-sub', html: spec.sub });
    const fill = el('i', { class: 'ob-fill' });
    const meter = el('div', { class: 'ob-meter', hidden: !opts.progress }, [fill]);
    const lock = el('span', { class: 'ob-lockhint', hidden: true, html: 'Click the view first' });
    const card = el('div', { class: 'ob-card' }, [glyph, el('div', { class: 'ob-txt' }, [title, spec.sub ? sub : null, lock]), meter]);
    const wrap = el('div', { class: 'ob-prompt' + (opts.optional ? ' optional' : '') + (touch ? ' touch' : '') + (opts.place ? ' at-' + opts.place : ''), 'data-id': id }, [card]);
    this.layer.append(wrap);
    void wrap.offsetWidth;
    wrap.classList.add('in');
    this.game.audio.play('ui_hover', { vol: 0.25 });
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
    // the real control on a touch screen: a soft pulsing ring
    if (touch && spec.spot) h.spotH = this.spot(spec.spot, { prompt: true });
    return h;
  }

  donePrompt(h) {
    if (!h || h.done) return;
    h.done = true;
    h.k = 1;
    h.fill.style.setProperty('--k', '1');
    h.el.classList.add('done');
    this.game.audio.play('good', { vol: 0.22 });
    h.spotH?.remove();
    const d = this.data;
    if (d && !d.seen.includes(h.id)) { d.seen.push(h.id); this.game.state.dirty = true; }
    this.hist.push(h.id);
    try { h.opts.onDone?.(); } catch (e) { console.warn('[onboard] onDone', e); }
    setTimeout(() => {
      h.el.classList.add('out');
      setTimeout(() => h.el.remove(), 380);
      if (this.prompt === h) { this.prompt = null; this.ui.root.classList.remove('ob-teach-look'); }
      h.resolve(true);
    }, 520);
  }

  closePrompt(resolveFalse = true) {
    const h = this.prompt;
    if (!h) return;
    this.prompt = null;
    this.ui.root.classList.remove('ob-teach-look');
    h.spotH?.remove();
    h.el.classList.add('out');
    setTimeout(() => h.el.remove(), 380);
    if (!h.done) h.resolve(false);
    void resolveFalse;
  }

  /** Has the player been taught this control (this game)? */
  seen(id) { return !!this.data?.seen?.includes(id); }

  // ------------------------------------------------------------ highlights
  /**
   * A soft pulsing ring on a real control: a DOM element, a touch control name ('stick' 'use' 'dig'
   * 'jump' 'crouch' 'block' 'snack' 'tool' 'lookpad'), or a HUD piece ('pack' 'book' 'radar' 'belt'
   * 'quest' 'menu'), or a selector. 'lookpad': a ghost finger drags across the right half. Returns { remove() }.
   */
  spot(target, o = {}) {
    const ring = img(ART.ring(), 'ob-spot-ring');
    const look = target === 'lookpad';
    const paw = look ? img(ART.paw(), 'ob-spot-paw') : null;
    const node = el('div', { class: 'ob-spot' + (look ? ' lookpad' : '') }, [ring, paw]);
    this.layer.append(node);
    const s = { target, node, o, lit: null, remove: () => { this.spots.delete(s); node.remove(); if (s.lit) { s.lit.classList.remove('ob-lit'); this.ui.touchHi?.(s.lit, false); } } };
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
      // the right half of the screen, below the middle and clear of the thumbs' buttons
      const tall = window.innerHeight > window.innerWidth;
      s.node.style.left = Math.round(window.innerWidth * (tall ? 0.66 : 0.7)) + 'px';
      s.node.style.top = Math.round(window.innerHeight * (tall ? 0.72 : 0.72)) + 'px';
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
    s.node.style.left = (r.left + r.width / 2) + 'px';
    s.node.style.top = (r.top + r.height / 2) + 'px';
    s.node.style.setProperty('--rs', (Math.max(r.width, r.height) / 26 * 1.2).toFixed(2));
  }

  // ------------------------------------------------------------ world markers
  /**
   * A small bobbing marker over a world point (pos() → THREE.Vector3, or null to hide). o: { label,
   * edgeOnly (only an arrow at the screen edge while it's off screen), near (with edgeOnly: the chevron
   * too while it's further than this, m) }. Returns { remove(), label(html) }.
   */
  mark(pos, o = {}) {
    const lab = el('span', { class: 'ob-mark-l' });
    if (o.label) floatIn(lab, o.label, { stagger: 0.02, max: 0.4 });
    const node = el('div', { class: 'ob-mark' }, [el('i', { class: 'ob-mark-chev' }), lab, el('i', { class: 'ob-mark-arrow' })]);
    this.layer.append(node);
    const m = { pos, node, lab, labHtml: o.label || '', edgeOnly: !!o.edgeOnly, near: o.near ?? null, remove: () => { this.marks.delete(m); node.remove(); }, label: (h) => { if ((h || '') !== m.labHtml) { m.labHtml = h || ''; floatIn(lab, h || '', { stagger: 0.02, max: 0.4 }); } } };
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
    // (behind you: at the side edge it's nearer to turning toward)
    if (behind) { x = W / 2 + (v.x >= 0 ? 1 : -1) * W; y = H * 0.55; edge = true; }
    if (x < pad || x > W - pad || y < pad + 30 || y > H - pad) edge = true;
    // (edgeOnly: the thing itself glints in the world; this only points the way when it's off screen,
    // or, with near, also when it's further off than that (it may be round a corner))
    if (m.edgeOnly && !edge && (m.near == null || cam.position.distanceTo(p) < m.near)) { m.node.style.display = 'none'; return; }
    const cx = clamp(x, pad, W - pad), cy = clamp(y, pad + 30, H - pad);
    m.node.style.display = '';
    m.node.style.left = cx + 'px';
    m.node.style.top = cy + 'px';
    m.node.classList.toggle('edge', edge);
    if (edge) m.node.style.setProperty('--ang', Math.atan2(y - cy, x - cx).toFixed(3) + 'rad');
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
    const hh = this.hintH;
    if (hh && !hh.gone) {
      hh.t += dt;
      let over = hh.t > hh.dur;
      try { if (hh.t > 1.2 && hh.until?.()) over = true; } catch (e) { over = true; }
      if (over) hh.remove();
      hh.el.classList.toggle('hush', this.panelUp() || !!this.cine);
    }
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
      if (done && h.t >= (o.min ?? 0.5)) this.donePrompt(h);
    }
    for (const s of this.spots) this.placeSpot(s);
    for (const m of this.marks) this.placeMark(m);
    // (prompts step aside under a menu, a talk or a cutscene)
    const up = this.panelUp();
    this.layer.classList.toggle('panel', up);
    this.layer.classList.toggle('cine', !!this.cine);
  }

  /** A menu, a panel or a talk is up (a handle already closed doesn't count). */
  panelUp() {
    const st = this.ui.panelStack, top = st[st.length - 1];
    return !!top && !top.closed;
  }

  /** Everything the layer shows goes (scene change, skip). The level stays. */
  clear() {
    this.closePrompt(true);
    this.hintH?.remove();
    this.captionEl?.remove(); // (a place's caption belongs to its scene)
    this.captionEl = null;
    this.goalEl?.remove();
    this.goalEl = null;
    this.goalHtml = null;
    for (const s of [...this.spots]) s.remove();
    for (const m of [...this.marks]) m.remove();
    this.cinema(false);
  }

  // ------------------------------------------------------------ tests
  setupDebug() {
    this.debug = {
      unlocks: () => (this.unlocks ? (this.unlocks.all ? 'all' : Object.keys(this.unlocks)) : 'all'),
      unlock: (id) => (id === 'all' ? (this.unlockAll(), 'all') : this.unlock(id)),
      state: () => ({ level: this.lvl, unlocks: this.unlocks ? (this.unlocks.all ? 'all' : Object.keys(this.unlocks)) : 'all', saved: this.data?.level ?? null, cinema: !!this.cine, skippable: !!this.cine?.skip, prompt: this.prompt ? { id: this.prompt.id, k: +this.prompt.k.toFixed(2), done: this.prompt.done } : null, goal: this.goalHtml || null, spots: this.spots.size, marks: this.marks.size, hidden: this.hidden() }),
      level: (n) => (n === undefined ? this.lvl : this.setLevel(n, { force: true })),
      complete: () => { const h = this.prompt; if (!h) return null; this.donePrompt(h); return h.id; },
      skip: () => { const c = this.cine; if (!c?.skip) return false; const f = c.skip; c.skip = null; c.fired = true; f(); return true; },
      cinema: (on) => (on === undefined ? !!this.cine : (this.cinema(on), !!this.cine)),
      hidden: () => this.hidden(),
      history: () => this.hist.slice(),
      teach: (id) => this.teach(id, {}).id,
      spot: (t) => !!this.spot(t),
      goal: (h) => (h === undefined ? this.goalHtml || null : this.goal(h)),
      clear: () => this.clear(),
    };
  }
}
