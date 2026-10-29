// The dialogue box (game.ui.tutor): a carved oak board with brass corner brackets, the speaker's
// live 3D portrait (src/gfx/portrait3d.js: the real rig, breathing, blinking, talking, a face per
// line) in an ornate brass frame, a red name ribbon, and a parchment where the words type themselves
// out with the speaker's own voice blips. Every scene calls
//   game.ui.tutor?.say(html, { mood, key, wait, dur, name, who, place, sound, muffled })  → Promise
//   game.ui.tutor?.hide(key?)        (hide the line; with a key, only that line)
//   game.ui.tutor?.next()            (carry on, as the player would: first finishes the typing)
//   game.ui.tutor?.active            ({ key, mood, html, wait, who } or null)
// mood: 'calm' | 'happy' | 'stern' | 'proud' | 'worried' | 'laugh' (and any rig expression:
//   surprised sad angry smug thinking sleepy). key: the line's id: saying the same key again while it
//   is up only updates it (no retyping), and hide(key) leaves anyone else's line alone.
// wait: true keeps the card up until the player carries on (E, Space, Enter, a click or tap on the
//   card); otherwise it goes after a reading time (dur seconds overrides it; dur: Infinity keeps it
//   up until hide() or the next line). A new line replaces the one showing (its promise resolves).
// who: the speaker's portrait (default Old Star; also read from `name`): 'oldstar' | 'hero' | 'nugget'
//   | 'rocco' | a shop id | a keeper's or a Deep Town folk's name | a spec (see portrait3d.js).
// place: 'top' puts the card at the top of the screen (it is there anyway on touch screens).
// HTML: <b> (rust red), <i> (soft), .gold-txt (gold). Old exports kept: MOODS, starPortrait(mood)
// and starPortraitURL(mood) (now stills of the 3D Old Star).
import { el, clamp } from '../core/util.js';
import { portrait3d } from '../gfx/portrait3d.js';
import { randomSpec } from '../gfx/characters.js';
import { installDialogArt } from './dialogArt.js';
import { voiceBlip, breathAfter, STAR_VOICE } from './talkType.js';
import './tutor.css';

export const MOODS = ['calm', 'happy', 'stern', 'proud', 'worried', 'laugh'];
const EXPR_MOODS = new Set([...MOODS, 'neutral', 'surprised', 'sad', 'angry', 'smug', 'thinking', 'sleepy']);
const EMOTE = { happy: 'emHappy', laugh: 'emLaugh', surprised: 'emSurprised', thinking: 'emThinking', worried: 'emWorried', stern: 'emStern', angry: 'emStern', proud: 'emProud', smug: 'emProud', sad: 'emSad' };
const isTouch = () => document.documentElement.classList.contains('is-touch');
const hashName = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };

/** The speaker for a line: a portrait cast (an unknown name gets a townsfolk of its own). */
export function speakerOf(who, name) {
  const c = portrait3d.cast(who || name || 'oldstar');
  if (c) return c;
  if (!name && !who) return portrait3d.cast('oldstar');
  const n = String(name || who);
  return portrait3d.cast({ spec: { ...randomSpec(hashName(n)), name: n }, name: n, backdrop: 'town' });
}

// ---------------------------------------------------------------- old exports (3D stills now)
/** A canvas of Old Star's face for a mood (drawn from the 3D model as soon as it is ready). */
export function starPortrait(mood = 'calm') {
  const c = document.createElement('canvas');
  c.width = c.height = 40;
  portrait3d.still('oldstar', { mood, size: 40 }).then((s) => c.getContext('2d').drawImage(s, 0, 0)).catch(() => {});
  return c;
}
/** Old Star's face as a data URL ('' until the still has been made; it is made in the background). */
export function starPortraitURL(mood = 'calm') { return portrait3d.stillURL('oldstar', mood, 40); }

// ---------------------------------------------------------------- the box
export class Tutor {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    installDialogArt();
    portrait3d.init(this.game);
    this.cur = null;
    this.face = null; // portrait handle
    this.frameEl = el('div', { class: 'tt-frame' });
    this.emoteEl = el('i', { class: 'tt-emote', 'aria-hidden': 'true' });
    this.nameEl = el('span', { class: 'tt-name' });
    this.plate = el('div', { class: 'tt-plate', 'aria-hidden': 'true' }, [this.nameEl]);
    this.textEl = el('div', { class: 'tt-text' });
    this.nextEl = el('div', { class: 'tt-next', 'aria-hidden': 'true' }, [el('kbd', {}, 'E'), el('span', { class: 'tt-tap' }, 'tap'), el('i', { class: 'tt-arrow' })]);
    this.quill = el('i', { class: 'tt-quill', 'aria-hidden': 'true' });
    this.wick = el('i', { class: 'tt-wick', 'aria-hidden': 'true' });
    this.body = el('div', { class: 'tt-body' }, [this.textEl, this.nextEl, this.quill, this.wick]);
    this.card = el('div', { class: 'tt-card interactive', role: 'status', 'aria-live': 'polite' }, [
      el('div', { class: 'tt-face' }, [this.frameEl, el('i', { class: 'tt-glass' }), this.emoteEl]),
      this.plate,
      this.body,
    ]);
    this.el = el('div', { class: 'tutor', hidden: true }, [this.card]);
    ui.root.insertBefore(this.el, ui.overlay);
    this.card.addEventListener('pointerdown', (e) => {
      if (!this.cur) return;
      e.preventDefault();
      e.stopPropagation();
      this.game.audio.init?.();
      this.advance();
    });
    // keys carry a waiting line on (and never reach the game while it waits)
    window.addEventListener('keydown', (e) => {
      const c = this.cur;
      if (!c || !c.wait || e.repeat || this.ui.isPanelOpen?.()) return;
      if (e.code !== 'KeyE' && e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.advance();
    }, true);
    this.raf = 0;
    this.lastT = 0;
    // build Old Star's rig while the browser is idle, so his first line has his face at once
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 2500));
    // (and his stills for the quest tracker and toasts, src/ui/npcFace.js, so they're never a sketch)
    idle(() => portrait3d.warm('oldstar').then(() => { portrait3d.stillURL('oldstar', 'happy', 40); portrait3d.stillURL('oldstar', 'calm', 40); }), { timeout: 6000 });
  }

  /** What's showing: { key, mood, html, wait, who } or null. */
  get active() { const c = this.cur; return c ? { key: c.key, mood: c.mood, html: c.html, wait: c.wait, who: c.cast?.key || null } : null; }

  /** The portrait handle (tests): .studio, .canvas ... */
  get portrait() { return this.face; }

  /** Show a line. Returns a promise that resolves when it's gone (carried on, expired, replaced or hidden). */
  say(html, opts = {}) {
    html = String(html ?? '');
    const mood = EXPR_MOODS.has(opts.mood) ? opts.mood : 'calm';
    const c = this.cur;
    if (c && opts.key && c.key === opts.key) {
      // the same line again: update it in place
      const changed = c.html !== html;
      if (c.mood !== mood) this.setMood(mood);
      c.wait = !!opts.wait;
      if (changed) { c.html = html; this.typeIn(html); this.face?.talk(true); }
      c.t = 0;
      c.dur = this.durFor(html, opts);
      this.el.classList.toggle('waits', c.wait);
      this.el.classList.toggle('timed', !c.wait && isFinite(c.dur));
      this.el.classList.toggle('compact', !c.wait && !c.muffled);
      this.ensureFace(c.cast);
      return c.promise;
    }
    const wasUp = !!c && !this.el.hidden;
    if (c) this.finish(c, true);
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const muffled = !!opts.muffled;
    const cast = muffled ? portrait3d.cast('oldstar') : speakerOf(opts.who, opts.name);
    const name = opts.name ?? (muffled ? '· · ·' : cast?.name || 'Old Star');
    const line = { key: opts.key || null, html, mood, wait: !!opts.wait, resolve, promise, t: 0, typed: false, dur: 0, name, voice: opts.sound !== false, muffled, cast, vo: cast?.voice || STAR_VOICE };
    line.dur = this.durFor(html, opts);
    this.cur = line;
    this.nameEl.textContent = line.name;
    this.card.dataset.who = cast?.key?.split(':')[0] || 'oldstar';
    clearTimeout(this.outT);
    this.el.hidden = false;
    this.el.classList.toggle('waits', line.wait);
    this.el.classList.remove('typed');
    this.el.classList.toggle('top', opts.place === 'top');
    this.el.classList.toggle('timed', !line.wait && isFinite(line.dur));
    // lines you carry on yourself get the grand box; passing tips a compact one (less in your way)
    this.el.classList.toggle('compact', !line.wait && !muffled);
    this.muteTracker(isTouch() || opts.place === 'top');
    this.card.classList.toggle('muffled', muffled);
    this.el.classList.remove('out');
    // a fresh box opens with a flourish; a line following another turns the page
    const anim = wasUp ? 'swap' : 'pop';
    this.card.classList.remove('pop', 'swap');
    void this.card.offsetWidth;
    this.card.classList.add(anim);
    this.delayT = wasUp ? 0.08 : 0.2;
    this.ensureFace(cast);
    this.setMood(mood, !wasUp);
    this.typeIn(html);
    this.game.audio?.play?.('page', { vol: 0.25 });
    if (mood === 'laugh' && line.voice) this.game.audio?.play?.('laugh', { pitch: 300 });
    this.stepAt = performance.now();
    this.ensureClock();
    return promise;
  }

  /** Hide the line (only if it is `key`, when given). */
  hide(key) {
    const c = this.cur;
    if (!c || (key && c.key !== key)) return;
    this.finish(c);
  }

  /** Carry on, as if the player pressed E: finish the typing first, then close the line. */
  next() { this.advance(true); }

  durFor(html, opts) {
    if (opts.wait) return Infinity;
    if (opts.dur !== undefined) return opts.dur;
    const n = html.replace(/<[^>]*>/g, '').length;
    return clamp(2.4 + n * 0.055, 3, 10);
  }

  advance() {
    const c = this.cur;
    if (!c) return;
    if (!c.typed) { this.revealAll(); return; }
    this.game.audio?.play?.('ui_click', { pitch: 0.8 });
    this.finish(c);
  }

  finish(c, replaced = false) {
    if (this.cur === c) {
      this.cur = null;
      this.face?.talk(false);
      if (!replaced) {
        this.el.classList.add('out');
        const el0 = this.el;
        clearTimeout(this.outT);
        this.outT = setTimeout(() => {
          if (this.cur) return;
          el0.hidden = true;
          this.muteTracker(false);
          // let the rig go back to the shelf (cached: the next line mounts it again at once), so a
          // talk board or a still of the same face can use it meanwhile
          this.face?.dispose();
          this.face = null;
          this.shownMood = null;
        }, 240);
      }
    }
    c.resolve?.();
  }

  /**
   * At the top of the screen (always on touch screens) the card sits where the quest tracker's scroll
   * hangs: hide that while a line is up (only undoing a mute of our own).
   */
  muteTracker(on) {
    const tr = this.ui?.tracker;
    if (!tr?.mute) return;
    if (on) { if (!this.trMuted && !tr.muted) { tr.mute(true); this.trMuted = true; } } else if (this.trMuted) { this.trMuted = false; if (tr.muted) tr.mute(false); }
  }

  /** The live portrait for this speaker (kept between lines, rebuilt when the speaker or size changes). */
  ensureFace(cast) {
    const small = window.matchMedia?.('(max-width: 560px), (max-height: 520px)').matches;
    const size = this.el.classList.contains('compact') ? (small ? 30 : 34) : small ? 40 : 48;
    const key = cast?.key || 'none';
    if (this.face && !this.face.disposed && this.faceKey === key && this.faceSize === size) return;
    this.face?.dispose();
    this.frameEl.textContent = '';
    this.faceKey = key;
    this.faceSize = size;
    this.card.style.setProperty('--pp', size);
    this.face = portrait3d.mount(this.frameEl, cast, { size, mood: this.cur?.mood || 'calm' });
  }

  setMood(mood, instant = false) {
    const c = this.cur;
    const changed = this.shownMood !== mood || instant;
    this.shownMood = mood;
    if (c) c.mood = mood;
    this.card.dataset.mood = mood;
    this.face?.set(mood);
    // a little emote bubble pops by the frame when the face changes to something
    const em = EMOTE[mood];
    if (em && changed && !c?.muffled) {
      this.emoteEl.style.backgroundImage = `var(--dl-${em})`;
      this.emoteEl.classList.remove('on'); void this.emoteEl.offsetWidth; this.emoteEl.classList.add('on');
    }
    if (!instant) { this.frameEl.classList.remove('bump'); void this.frameEl.offsetWidth; this.frameEl.classList.add('bump'); }
  }

  // ------------------------------------------------------------ typing
  typeIn(html) {
    const t = this.textEl;
    t.innerHTML = html;
    // every text node: full text kept aside, shown a little at a time (layout reserved by a ghost span)
    this.nodes = [];
    const walk = (n) => {
      for (const ch of [...n.childNodes]) {
        if (ch.nodeType === 3) {
          const full = ch.textContent;
          if (!full) continue;
          const shown = document.createTextNode('');
          const ghost = el('span', { class: 'tt-ghost' }, full);
          ch.replaceWith(shown, ghost);
          this.nodes.push({ shown, ghost, full });
        } else if (ch.nodeType === 1) walk(ch);
      }
    };
    walk(t);
    this.flat = this.nodes.map((n) => n.full).join('');
    this.total = this.flat.length;
    this.typedN = 0;
    this.blipT = 0;
    this.pauseT = 0;
    this.talking = false;
    this.el.classList.remove('typed');
    if (this.cur) this.cur.typed = this.total === 0;
  }

  revealAll() {
    for (const n of this.nodes || []) { n.shown.textContent = n.full; n.ghost.textContent = ''; }
    this.typedN = this.total;
    if (this.cur) this.cur.typed = true;
    this.el.classList.add('typed');
    this.face?.talk(false);
  }

  showChars(k) {
    let left = k;
    for (const n of this.nodes) {
      const take = Math.max(0, Math.min(n.full.length, left));
      n.shown.textContent = n.full.slice(0, take);
      n.ghost.textContent = n.full.slice(take);
      left -= n.full.length;
    }
  }

  // ------------------------------------------------------------ frame
  tick() {
    const c = this.cur;
    if (!c) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(() => this.tick());
    // (the game loop drives it through UI.update; this only keeps it going if nothing does)
    if (performance.now() - (this.drivenAt || 0) > 250) this.step();
  }

  /** Per frame, from UI.update. */
  update() {
    this.drivenAt = performance.now();
    this.step();
  }

  /** A timer as well as the frames: lines type and time out by the clock even when frames starve. */
  ensureClock() {
    if (!this.raf) this.raf = requestAnimationFrame(() => this.tick());
    if (!this.clock) this.clock = setInterval(() => { if (!this.cur) { clearInterval(this.clock); this.clock = 0; return; } if (performance.now() - (this.stepAt || 0) > 120) this.step(); }, 100);
  }

  /** Typing (with breaths at the punctuation), the voice, the mouth, the reading timer, E from touch. */
  step() {
    // the wall clock, whoever calls (the game loop, a frame, the timer): slow frames type more at once
    const t = performance.now();
    const dt = Math.min(2.5, Math.max(0, (t - (this.stepAt || t)) / 1000));
    this.stepAt = t;
    const c = this.cur;
    if (!c) return;
    if (!c.typed) {
      if (this.delayT > 0) this.delayT -= dt;
      else if (this.pauseT > 0) { this.pauseT -= dt; if (this.pauseT <= 0) this.face?.talk(true); }
      else {
        const speed = c.mood === 'laugh' ? 54 : c.mood === 'worried' ? 50 : c.mood === 'stern' ? 38 : 44;
        const before = Math.floor(this.typedN);
        this.typedN = Math.min(this.total, this.typedN + dt * speed);
        let now = Math.floor(this.typedN);
        if (now !== before) {
          // stop at the end of a sentence or a clause for a breath
          for (let i = before; i < now; i++) {
            const p = breathAfter(this.flat[i], this.flat[i + 1]);
            if (p && i + 1 < this.total) { now = i + 1; this.typedN = now; this.pauseT = p; this.face?.talk(false); break; }
          }
          this.showChars(now);
          if (!this.talking && this.pauseT <= 0) { this.talking = true; this.face?.talk(true); }
          // a blip every few letters (not on spaces)
          this.blipT -= now - before;
          if (this.blipT <= 0 && c.voice && this.flat[now - 1] !== ' ') { this.blipT = c.vo.cluck ? 4 : 3; this.blip(c.mood); }
        }
        if (this.typedN >= this.total) { c.typed = true; this.revealAll(); this.talking = false; }
      }
    } else {
      c.t += dt;
      if (isFinite(c.dur)) this.wick.style.transform = `scaleX(${clamp(1 - c.t / c.dur, 0, 1).toFixed(3)})`;
      if (c.t >= c.dur) { this.finish(c); return; }
    }
    if (c.typed && this.talking) { this.talking = false; this.face?.talk(false); }
    // touch "use" button and other synthetic presses carry a waiting line on
    const inp = this.game.input;
    if (c.wait && inp && inp.justDown && inp.justDown.has('KeyE') && !this.ui.isPanelOpen?.()) { inp.consume('KeyE'); this.advance(); }
  }

  /** One syllable in the speaker's voice: Old Star mumbles, Rocco drawls, Nugget clucks. */
  blip(mood) { voiceBlip(this.game.audio, this.cur?.vo || STAR_VOICE, mood, { muffled: this.cur?.muffled }); }
}
