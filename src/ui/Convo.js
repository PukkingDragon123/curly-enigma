// Cutscene talk (game.convo, also ui.convo): talking to somebody is a little zoom-in cutscene. The
// camera eases from your eyes to a framing of the speaker's real 3D model in the world (a close-up,
// over your shoulder, a two-shot: src/fx/director.js picks what fits the room), black bars slide
// in, the world keeps living while you're held; the speaker turns to you, looks at you, pulls faces
// and talks, and the words float beside their head (a parchment label anchored to the head on
// screen, with a tail, typing out in their voice). Lines carry on with a click / tap / E / Space /
// Enter; answers float in near your side of the frame (1–4, ↑ ↓, Enter, tap); then the camera eases
// back. Esc leaves the talk.
//
//   const r = await game.convo.play({
//     who,            // 'oldstar' | 'rocco' | 'trader' | 'herbalist' | 'outpost' | a Deep Town shop id |
//                     // a villager id or name | an actor / rig (see src/fx/speakers.js)
//     name,           // the name on the label (default: theirs)
//     lines: ['Hello!', { text, mood, who, camera, gesture, wait, dur, sub }],
//     camera: 'auto', // 'auto' | 'close' | 'ots' | 'two' | 'wide' | 'hero' | 'face' | 'none'
//     choices: [{ label, sub, value, primary }],   // after the last line
//     mood, sub,      // defaults for the lines (mood: calm happy stern proud worried laugh + any rig expression)
//     keep: false,    // true: stay framed after this resolves (until end() or the next play())
//   });               // → { choice (the value, or the index), index, skipped }
//   game.convo.say(who, html, opts) → Promise<result>      one line
//   game.convo.ask(who, html, choices, opts) → Promise<value | null>
//   game.convo.end()           ease back now             game.convo.active   { who, html, wait, choices } | null
//   game.convo.next()          carry on, as the player would (first finishes the typing)
//   game.convo.pick(i)         choose answer i (tests)   game.convo.speaker(who) → the 3D speaker or null
//   game.convo.director        the camera director (src/fx/director.js)
// Lines that follow each other within a moment (a play() right after another) stay one cutscene.
// HTML in lines: <b> (rust red), <i> (soft), .gold-txt (gold), <em> (shaky), <big> (loud),
// <small>, <w>wavy words</w>. Lines with `wait: false` go by themselves after a reading time (dur).
// Without a 3D model of the speaker in this scene the words still float (a live portrait in the label).
// openTalkMenu (src/ui/choices.js) and questTalk come here through convoTalkMenu(game, opts).
import * as THREE from 'three';
import { el, clamp, pick as pickOne } from '../core/util.js';
import { Director } from '../fx/director.js';
import { findSpeaker } from '../fx/speakers.js';
import { portrait3d } from '../gfx/portrait3d.js';
import { typeText, STAR_VOICE } from './talkType.js';
import { installDialogArt } from './dialogArt.js';
import { Px, PAL, INK, art } from './uiArt.js';
import { speakerOf } from './Tutor.js';
import './convo.css';

const isTouch = () => document.documentElement.classList.contains('is-touch');
const GESTURE = { happy: 'nod', laugh: 'hop', surprised: 'hop', stern: 'shake', angry: 'shake', proud: 'nod', smug: 'nod' };
const GRACE = 0.4; // seconds a finished talk waits for a follow-up line before the camera goes back

/** <w>wavy</w>: each letter in its own span (typed one by one, bobbing in turn). */
function prep(html) {
  return String(html ?? '').replace(/<w>([^<]*)<\/w>/g, (_, t) => [...t].map((c, i) => (c === ' ' ? ' ' : `<span class="cv-wv" style="--i:${i}">${c}</span>`)).join(''));
}
const plain = (s) => String(s || '').replace(/<[^>]*>/g, '');

// ------------------------------------------------------------------ art (--cv-*)
/** The label's tail: parchment, inked edges, open on the right where it joins the label (10×13). */
function tailSprite() {
  const P = PAL.paper;
  const p = new Px(10, 13);
  for (let x = 1; x < 10; x++) {
    const half = (x / 9) * 5.4;
    for (let y = Math.ceil(6 - half); y <= Math.floor(6 + half); y++) p.set(x, y, P.base);
  }
  // a burnt line inside the inked edge, and the ink
  p.each((x, y) => (x < 9 && (!p.a(x, y - 1) || !p.a(x, y + 1)) ? P.burn : undefined));
  p.outline(P.edge);
  for (let y = 0; y < 13; y++) if (p.a(9, y)) p.set(9, y, y < 2 || y > 10 ? P.edge : P.base);
  return p;
}
/** A brass disc for the answers' numbers (10×10). */
function numSprite() {
  const B = PAL.brass;
  const p = new Px(10, 10);
  p.disk(5, 5, 4.5, B.base);
  p.each((x, y) => (Math.hypot(x - 3.5, y - 3.5) < 2.2 ? B.lt : Math.hypot(x - 5.5, y - 5.5) > 3.6 ? B.dk : undefined));
  p.outline(INK);
  return p;
}
let artIn = false;
function installConvoArt() {
  if (artIn) return;
  artIn = true;
  const r = document.documentElement.style;
  r.setProperty('--cv-tail', `url("${art('cv:tail', tailSprite)}")`);
  r.setProperty('--cv-num', `url("${art('cv:num', numSprite)}")`);
}

export class Convo {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.game.convo = this;
    this.director = new Director(this.game);
    installDialogArt();
    installConvoArt();
    this.s = null; // the session (one cutscene)
    this.q = [];
    this.cur = null;
    this.simT = 0;
    this.wallT = 0;
    this.focusI = 0;
    this.eyeV = null;
    this.lab = { x: 0, y: 0, ok: false };
    this.build();
    // keys: carry on, choose (only while the talk is the top window)
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    // pointer-locked clicks land on the canvas: a click anywhere carries on
    document.addEventListener('mousedown', (e) => {
      if (!this.cur || !document.pointerLockElement || !this.topIsUs() || e.button !== 0) return;
      this.advance();
    }, true);
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 3000));
    idle(() => this.director.warm(), { timeout: 8000 });
  }

  build() {
    this.barT = el('div', { class: 'cv-bar top' });
    this.hintEl = el('div', { class: 'cv-hint' });
    this.barB = el('div', { class: 'cv-bar bot' }, [this.hintEl]);
    this.nameEl = el('span', { class: 'cv-name' });
    this.plate = el('div', { class: 'cv-plate' }, [this.nameEl]);
    this.subEl = el('div', { class: 'cv-sub' });
    this.textEl = el('div', { class: 'cv-text' });
    this.nextEl = el('div', { class: 'cv-next', 'aria-hidden': 'true' }, [el('kbd', {}, 'E'), el('span', { class: 'cv-tap' }, 'tap'), el('i', { class: 'cv-arrow' })]);
    this.wick = el('i', { class: 'cv-wick', 'aria-hidden': 'true' });
    this.tail = el('i', { class: 'cv-tail', 'aria-hidden': 'true' });
    this.faceEl = el('div', { class: 'cv-face' });
    this.body = el('div', { class: 'cv-body' }, [this.subEl, this.textEl, this.nextEl, this.wick]);
    this.label = el('div', { class: 'cv-say', role: 'status', 'aria-live': 'polite' }, [this.tail, this.plate, this.faceEl, this.body]);
    this.choicesEl = el('div', { class: 'cv-choices', role: 'menu' });
    this.root = el('div', { class: 'cv', hidden: true }, [this.barT, this.barB, this.label, this.choicesEl]);
    this.ui.root.insertBefore(this.root, this.ui.overlay);
    this.root.addEventListener('pointerdown', (e) => {
      if (!this.cur || e.target.closest?.('.cv-opt')) return;
      e.preventDefault();
      e.stopPropagation();
      this.game.audio.init?.();
      this.advance();
    });
  }

  // ------------------------------------------------------------ API
  /** What's showing: { who, html, wait, choices, typed } or null. */
  get active() {
    const b = this.cur;
    if (!b) return null;
    return { who: b.key, name: b.name, html: b.html, mood: b.mood, wait: !!(b.wait || b.choices), typed: !!b.typed, held: !!this.s?.hold, choices: b.choices ? b.choices.map((c) => plain(c.label)) : null, camera: this.director.shot && this.director.want ? this.director.shot.kind : null };
  }

  /** The 3D speaker for who in this scene (or null). */
  speaker(who) { return findSpeaker(this.game, who); }

  /** Is a cutscene with this speaker (key: 'oldstar', 'tools', ...) up, or just ending? */
  talkingTo(key) { const sp = this.s?.speaker; return !!sp && (sp.key === key || this.cur?.key === key); }

  play(o = {}) {
    const lines = (o.lines || (o.text != null ? [o.text] : [])).map((l) => (typeof l === 'string' ? { text: l } : l));
    if (!lines.length) lines.push({ text: o.prompt || '' });
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    const beats = lines.map((l, i) => {
      const last = i === lines.length - 1;
      return {
        who: l.who ?? o.who, name: l.name ?? o.name, html: l.text ?? l.html ?? '', sub: l.sub ?? (i === 0 ? o.sub : ''),
        mood: l.mood ?? o.mood ?? 'calm', gesture: l.gesture ?? l.emote, camera: l.camera ?? o.camera ?? 'auto',
        wait: l.wait ?? o.wait ?? true, dur: l.dur ?? o.dur, cls: l.className ?? o.className, lineKey: l.key ?? o.key ?? null,
        hold: l.hold ?? o.hold ?? true, promise,
        choices: last && o.choices?.length ? o.choices.map((c, k) => ({ ...c, value: c.value ?? c.id ?? k })) : null,
        onDone: last ? (r) => resolve({ choice: null, index: -1, skipped: false, ...r }) : (r) => { if (r?.skipped) resolve({ choice: null, index: -1, skipped: true }); },
      };
    });
    for (const b of beats) this.enqueue(b, o);
    return promise;
  }

  /**
   * One line. say(who, html, opts), or the tutor's shape say(html, { who, mood, wait, dur, key, rig,
   * head }) (a rig / head() handed over is used when there's no model of `who` here; in that shape
   * a line that doesn't wait floats by them without holding you or moving the camera: hold: true to).
   * opts.key: saying the same key again while it is up only updates the words.
   */
  say(a, b, c) {
    let who, html, o;
    const tutorShape = b == null || (typeof b === 'object' && !Array.isArray(b));
    if (tutorShape) { html = a; o = b || {}; who = o.who ?? 'oldstar'; } else { who = a; html = b; o = c || {}; }
    if ((o.rig || o.head) && !(typeof who === 'string' && findSpeaker(this.game, who))) {
      const key = typeof who === 'string' ? who : undefined;
      const head = o.head ? (out) => { const v = o.head(out); if (v && out && v !== out) out.copy(v); return out || v; } : null;
      who = { rig: o.rig, head, name: o.name || speakerOf(key)?.name, key, who: key };
    }
    const cur = this.cur;
    if (o.key && cur && cur.lineKey === o.key && !cur.done) {
      if (cur.html !== html) this.retype(cur, html, o.mood);
      return cur.promise;
    }
    const hold = o.hold ?? (tutorShape ? !!o.wait : true);
    return this.play({ ...o, hold, who, lines: [{ ...o, text: html, who, hold }] });
  }

  ask(who, html, choices, o = {}) { return this.play({ ...o, who, lines: [{ ...o, text: html }], choices }).then((r) => (r.skipped ? null : r.choice)); }

  /**
   * The letterbox on its own (a scripted scene of your own: the cinematic tutorial). bars(true) slides
   * them in, bars(false) out (a talk that's up keeps its own).
   */
  bars(on) {
    this.barsOn = !!on;
    if (on) { clearTimeout(this.hideT); this.root.hidden = false; this.root.classList.remove('out'); this.fitBars(); void this.root.offsetWidth; this.root.classList.add('bars'); }
    else if (!this.s?.hold) { this.root.classList.remove('bars'); if (!this.s) this.hideSoon(); }
  }

  /** New words for the line that's up (same key): typed again from the start. */
  retype(b, html, mood) {
    b.html = html;
    if (mood) { b.mood = mood; b.speaker?.face(mood, 3); }
    b.typer?.stop();
    b.typed = false;
    b.done = false;
    this.root.classList.remove('typed');
    const sp = b.speaker;
    b.typer = typeText(this.textEl, prep(html), { voice: b.voice, mood: b.mood, audio: this.game.audio, face: sp ? { talk: (on) => sp.talk(on) } : this.face, delay: 0.05, onDone: () => this.onTyped(b) });
  }

  /** Carry on (as a click): finish the typing, then the line. With answers up it picks the one in focus. */
  next() {
    const b = this.cur;
    if (!b) return false;
    if (!b.typed) { b.typer?.finish(); return true; }
    if (b.choices?.length) { this.pick(this.focusI); return true; }
    this.finishBeat(b);
    return true;
  }

  /** Choose answer i. */
  pick(i, gesture = false) {
    const b = this.cur;
    if (!b?.choices?.length || i < 0 || i >= b.choices.length || b.picked) return false;
    if (!b.typed) b.typer?.finish();
    const c = b.choices[i];
    this.game.audio.play(c.primary ? 'ui_click' : 'page', { vol: 0.6 });
    this.director.heroTalk(1.1);
    // a pick by a click or a key may take the mouse back (the pointer was freed for the answers)
    if (gesture && this.relock && !isTouch() && this.game.ui.hudMode === 'deep') { this.relock = false; try { this.game.input.lockPointer(); } catch (e) { /* no lock here */ } }
    const btn = this.choicesEl.children[i];
    btn?.classList.add('picked');
    if (b.board) { b.onPick?.(i); return true; } // the talk board's notes run their own code (and close it)
    b.picked = true;
    this.finishBeat(b, { choice: c.value, index: i });
    c.onClick?.();
    return true;
  }

  /** End the cutscene now (pending lines resolve as skipped). */
  end() { this.endSession(false); }

  /** Test hooks: settle() (the camera all the way to the shot now, the words typed), state(). */
  get debug() {
    const cv = this;
    return {
      settle() { cv.cur?.typer?.finish(); cv.director.settle(); cv.root.classList.add('settled'); return cv.director.shot?.kind || null; },
      state() { const d = cv.director; return { active: cv.active, weight: +d.weight.toFixed(2), shot: d.shot && d.want ? d.shot.kind : null, live: d.live(), hero: !!d.hero?.root.visible, held: !!cv.s?.hold, queue: cv.q.length }; },
    };
  }

  // ------------------------------------------------------------ sessions and beats
  /** The talk's clock: wall time, or scene time when the scene runs ahead (tests step frames by hand). */
  clock() { return this.wallT + this.simT; }

  /**
   * Time from the scene (sim, the director's hook) and from the wall (UI.update): per UI frame the
   * clock moves by whichever went further, so neither counts twice and either alone keeps it going.
   */
  tick(dt, src) {
    if (src === 'sim') this.simT += dt;
    else {
      // (the real time since the last UI frame: the game caps its dt on slow frames)
      const now = performance.now(), real = this.wallAt ? Math.min(1, Math.max(0, (now - this.wallAt) / 1000)) : dt;
      this.wallAt = now;
      this.wallT += Math.max(real, this.simT);
      this.simT = 0;
    }
    const s = this.s;
    if (!s) return;
    const now = this.clock();
    if (s.endAt != null && now >= s.endAt) { this.endSession(false); return; }
    const b = this.cur;
    if (b && b.typed && !b.wait && !b.choices) {
      const k = clamp(1 - (now - b.typedAt) / b.dur, 0, 1);
      this.wick.style.transform = `scaleX(${k.toFixed(3)})`;
      if (k <= 0) this.finishBeat(b);
    }
  }

  enqueue(beat, o = {}) {
    if (!this.s) this.beginSession(beat.hold !== false);
    else if (beat.hold !== false && !this.s.hold) this.holdOn();
    const s = this.s;
    s.endAt = null;
    if (o.keep) s.keep = true;
    this.q.push(beat);
    if (!this.cur) this.nextBeat();
  }

  topIsUs() { const st = this.ui.panelStack; return !!this.s?.hold && st[st.length - 1] === this.s.hold; }

  /** A talk starts. held: you're held (the cutscene proper); else the words just float by them. */
  beginSession(held = true) {
    this.relock = false;
    this.s = { hold: null, n: 0, keep: false, endAt: null, held: new Set(), t0: this.clock() };
    clearTimeout(this.hideT);
    this.root.hidden = false;
    this.root.classList.remove('out', 'held');
    this.fitBars();
    if (held) this.holdOn();
  }

  /**
   * Hold the player: the talk goes on the window stack (the scenes stop moving you, keys and menus
   * wait) without a backdrop; Esc (the UI's) closes it = leaves the talk. The bars slide in.
   */
  holdOn() {
    const ui = this.ui, g = this.game, s = this.s;
    if (!s || s.hold) return;
    const back = document.createElement('div');
    const hold = { el: this.root, back, closed: false, closable: true, kind: 'convo', onClose: () => this.onHoldClosed(hold) };
    hold.close = () => ui.closePanel(hold);
    ui.panelStack.push(hold);
    ui.root.classList.add('panel-open', 'cv-on');
    g.input.enabled = false;
    g.input.clearAll();
    s.hold = hold;
    // the quest strip and the "!" / "?" over people's heads step out of the shot too
    const tr = ui.tracker;
    if (tr?.mute && !tr.muted) { tr.mute(true); s.mutedTracker = true; }
    void this.root.offsetWidth;
    this.root.classList.add('held', 'bars');
    g.audio.play('page', { vol: 0.22, pitch: 0.8 });
  }

  hideSoon() {
    clearTimeout(this.hideT);
    this.hideT = setTimeout(() => { if (!this.s && !this.barsOn) { this.root.hidden = true; this.root.classList.remove('out'); } }, 620);
  }

  onHoldClosed(hold) {
    if (this.s?.hold !== hold) return;
    hold.closed = true;
    this.endSession(true);
  }

  endSession(skipped) {
    const s = this.s;
    if (!s) return;
    this.s = null;
    for (const b of [this.cur, ...this.q]) {
      if (!b || b.done) continue;
      b.done = true;
      b.typer?.stop();
      b.onDone?.({ skipped: true });
      b.onClosed?.();
    }
    this.cur = null;
    this.q = [];
    for (const sp of s.held) { try { sp.hold(false); sp.lookAt(null); sp.talk(false); } catch (e) { /* gone */ } }
    this.director.release();
    this.disposeFace();
    if (s.hold && !s.hold.closed) { s.hold.closed = true; this.ui.closePanel(s.hold); }
    if (s.mutedTracker && this.ui.tracker?.muted) this.ui.tracker.mute(false);
    this.ui.root.classList.remove('cv-on');
    this.root.classList.remove('held', 'typed', 'choosing', 'timed');
    if (!this.barsOn) this.root.classList.remove('bars');
    this.root.classList.add('out');
    this.choicesEl.textContent = '';
    // the words go with the talk (the bars may stay up for someone's scripted scene: bars(true))
    this.label.classList.add('gone');
    this.lastBeat = null;
    this.hideSoon();
    void skipped;
  }

  nextBeat() {
    const b = this.q.shift();
    const s = this.s;
    if (!b || !s) {
      this.cur = null;
      // nothing more to say: a moment for a follow-up line, then back to your eyes
      if (s && !s.keep) s.endAt = this.clock() + GRACE;
      this.root.classList.remove('typed', 'choosing');
      this.label.classList.add('gone');
      return;
    }
    this.cur = b;
    this.root.classList.remove('settled');
    b.n = s.n++;
    b.done = false;
    b.typed = false;
    // who: their 3D model here (or none), their name and voice
    const whoKey = typeof b.who === 'string' ? b.who : b.who?.npcId || b.who?.shopId || b.who?.key || null;
    const heroLine = b.who === 'hero' || b.who === 'you';
    b.speaker = heroLine ? null : (b.who != null ? findSpeaker(this.game, b.who) : null) || (b.name ? findSpeaker(this.game, b.name) : null);
    b.key = heroLine ? 'hero' : b.speaker?.key || whoKey || b.name || 'oldstar';
    b.cast = heroLine ? portrait3d.cast('hero') : speakerOf(typeof b.who === 'string' ? b.who : b.speaker?.key, b.name || b.speaker?.name);
    b.name = b.name || b.speaker?.name || b.cast?.name || '';
    b.voice = b.speaker?.voice || b.cast?.voice || STAR_VOICE;
    b.hero = heroLine;
    if (b.dur == null) b.dur = clamp(2.2 + plain(b.html).length * 0.05, 2.6, 9);
    if (b.speaker) { s.held.add(b.speaker); s.speaker = b.speaker; }
    this.animate(b); // (first: they start turning to you, and the shot is planned for their face)
    this.frameFor(b);
    this.showLabel(b);
    // the words
    const sp = b.speaker;
    const mouth = heroLine ? { talk: (on) => this.director.hero?.talk(on) } : sp ? { talk: (on) => sp.talk(on) } : this.face;
    b.typer = typeText(this.textEl, prep(b.html), {
      voice: b.voice, mood: b.mood, audio: this.game.audio, face: mouth,
      delay: b.n === 0 ? 0.55 : 0.18, speed: b.mood === 'laugh' ? 52 : b.mood === 'stern' ? 40 : 46,
      onDone: () => this.onTyped(b),
    });
  }

  onTyped(b) {
    if (b.done || this.cur !== b) return;
    b.typed = true;
    b.typedAt = this.clock();
    this.root.classList.add('typed');
    this.root.classList.toggle('timed', !b.wait && !b.choices);
    if (b.choices?.length) this.showChoices(b);
  }

  finishBeat(b, r = {}) {
    if (b.done) return;
    b.done = true;
    b.typer?.stop();
    if (b.speaker) b.speaker.talk(false);
    this.choicesEl.textContent = '';
    this.root.classList.remove('choosing', 'typed', 'timed');
    if (!b.board) this.game.audio.play('ui_click', { vol: 0.35, pitch: 0.85 });
    b.onDone?.(r);
    if (this.cur === b) this.nextBeat();
  }

  advance() {
    const b = this.cur;
    if (!b) return;
    this.game.audio.init?.();
    if (!b.typed) { b.typer?.finish(); return; }
    if (b.choices?.length) { this.flashChoices(); return; }
    this.finishBeat(b);
  }

  // ------------------------------------------------------------ the camera and the speaker
  frameFor(b) {
    const d = this.director;
    const cam = b.camera || 'auto';
    // a scene without the camera hook, or words that just float by (not held): the camera stays
    if (!d.live() || (!this.s?.hold && cam === 'auto')) { d.release(); this.shot = null; return; }
    if (cam === 'none' || (!b.speaker && !b.hero)) { if (cam === 'none' || !b.speaker) d.release(); this.shot = null; return; }
    const sp = b.hero ? this.s.speaker : b.speaker;
    if (!sp) { d.release(); this.shot = null; return; }
    let kinds;
    if (b.hero) kinds = ['hero', 'ots', 'face'];
    else if (cam !== 'auto') kinds = [cam === 'two-shot' ? 'two' : cam === 'over' ? 'ots' : cam, 'close', 'ots', 'face'];
    else if (b.choices?.length) kinds = ['ots', 'close', 'two', 'face'];
    else if (b.n === 0) kinds = this.q.length ? ['two', 'ots', 'close', 'face'] : ['ots', 'close', 'two', 'face']; // a longer talk opens on you both
    else kinds = ['close', 'ots', 'two', 'face'];
    // keep the framing for a run of lines from the same speaker (no reframing every line)
    const prev = d.shot;
    if (prev && d.want && prev.speaker === sp && !b.hero && prev.subject !== 'hero' && cam === 'auto' && b.n > 0) {
      // the same speaker again: stay on their close-up (or over your shoulder while you answer);
      // only the opening two-shot cuts in
      const want = b.choices?.length ? 'ots' : 'close';
      if (prev.kind === want || prev.kind === 'face' || (prev.kind !== 'two' && !b.choices?.length) || (b.choices?.length && prev.kind !== 'close' && prev.kind !== 'two')) { this.shot = prev; return; }
    }
    this.shot = d.frame({ speaker: sp, kinds, subject: b.hero ? 'hero' : 'speaker' });
  }

  animate(b) {
    const sp = b.speaker;
    const g = this.game;
    if (b.hero) { this.director.heroTalk(0.3); return; }
    if (!sp) return;
    const pl = this.director.player();
    if (pl) {
      this.eyeV = pl.eye(this.eyeV || undefined);
      sp.turnTo(pl.pos.x, pl.pos.z);
      sp.lookAt(this.eyeV);
    }
    sp.hold(true);
    sp.face(b.mood, Math.max(2.4, plain(b.html).length / 30));
    const gest = b.gesture ?? (b.n === 0 && b.mood !== 'worried' && b.mood !== 'sad' ? pickOne(['nod', 'wave', null]) : Math.random() < 0.45 ? GESTURE[b.mood] : null);
    if (gest) sp.gesture(gest);
    if (b.mood === 'laugh') g.audio.play('laugh', { pitch: b.voice?.f || 300 });
  }

  // ------------------------------------------------------------ the label
  showLabel(b) {
    const L = this.label;
    this.nameEl.textContent = b.name;
    this.plate.hidden = !b.name;
    // the label is never narrower than the name ribbon over it
    L.style.minWidth = '';
    if (b.name) L.style.minWidth = Math.ceil(this.plate.offsetWidth + 14) + 'px';
    this.subEl.innerHTML = b.sub || '';
    this.subEl.hidden = !b.sub;
    L.className = 'cv-say' + (b.cls ? ' ' + b.cls : '');
    L.dataset.kind = b.hero ? 'hero' : b.key === 'oldstar' ? 'oldstar' : b.key === 'rocco' ? 'rocco' : 'folk';
    L.dataset.mood = b.mood;
    this.root.classList.remove('typed', 'choosing', 'timed');
    this.choicesEl.textContent = '';
    // no 3D model here: their live portrait rides in the label
    const noModel = !b.speaker && !b.hero;
    L.classList.toggle('portrait', noModel);
    if (noModel) this.ensureFace(b.cast, b.mood); else this.disposeFace();
    // a fresh label pops; a following line from the same speaker just turns over
    const fresh = !this.lastBeat || this.lastBeat.key !== b.key || this.lastBeat.hero !== b.hero || this.label.classList.contains('gone');
    L.classList.remove('pop', 'swap', 'gone');
    void L.offsetWidth;
    L.classList.add(fresh ? 'pop' : 'swap');
    this.lastBeat = b;
    this.lab.ok = false;
    this.hint(b);
    if (fresh) this.game.audio.play('page', { vol: 0.2 });
  }

  ensureFace(cast, mood) {
    if (this.face && !this.face.disposed && this.faceKey === cast?.key) { this.face.set(mood); return; }
    this.disposeFace();
    this.faceKey = cast?.key;
    const small = window.matchMedia?.('(max-width: 560px), (max-height: 520px)').matches;
    this.face = portrait3d.mount(this.faceEl, cast, { size: small ? 32 : 40, mood });
  }
  disposeFace() { this.face?.dispose(); this.face = null; this.faceEl.textContent = ''; this.faceKey = null; }

  hint(b) {
    const t = isTouch();
    const h = b?.choices?.length ? (t ? 'Tap an answer' : '<kbd>1</kbd>–<kbd>' + b.choices.length + '</kbd> or <kbd>↑</kbd><kbd>↓</kbd> <kbd>E</kbd> answer') : t ? 'Tap to carry on' : '<kbd>E</kbd> carry on';
    this.hintEl.innerHTML = `${h}<span class="cv-esc">${t ? '' : ' · <kbd>Esc</kbd> leave'}</span>`;
  }

  showChoices(b) {
    const box = this.choicesEl;
    box.textContent = '';
    this.focusI = Math.max(0, b.choices.findIndex((c) => c.primary));
    b.choices.forEach((c, i) => {
      const btn = el('button', { class: 'cv-opt' + (c.primary ? ' primary' : ''), role: 'menuitem', type: 'button' }, [
        el('span', { class: 'cv-num' }, String(i + 1)),
        el('span', { class: 'cv-opt-t' }, [el('b', { html: c.label }), c.sub ? el('small', { html: c.sub }) : null]),
      ]);
      btn.style.setProperty('--d', `${0.05 + i * 0.07}s`);
      btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.pick(i, true); });
      btn.addEventListener('pointerenter', () => { this.focus(i); this.game.audio.play('ui_hover', { vol: 0.2 }); });
      box.append(btn);
    });
    this.focus(this.focusI);
    this.root.classList.add('choosing');
    this.hint(b);
    // the mouse comes free to click an answer (and is taken back on the pick)
    if (document.pointerLockElement && !isTouch()) { this.relock = true; this.ui.releasePointer(); }
    this.lab.ok = false;
  }

  focus(i) {
    const n = this.choicesEl.children.length;
    if (!n) return;
    this.focusI = (i + n) % n;
    [...this.choicesEl.children].forEach((c, k) => c.classList.toggle('on', k === this.focusI));
  }

  flashChoices() { this.choicesEl.classList.remove('nudge'); void this.choicesEl.offsetWidth; this.choicesEl.classList.add('nudge'); }

  onKey(e) {
    const b = this.cur;
    if (!b || !this.topIsUs() || e.code === 'Escape') return;
    const n = parseInt(e.key, 10);
    const choosing = !!b.choices?.length && b.typed;
    let used = true;
    if (b.choices?.length && n >= 1 && n <= b.choices.length) { if (!e.repeat) this.pick(n - 1, true); }
    else if (choosing && (e.code === 'ArrowUp' || e.code === 'ArrowLeft')) { this.focus(this.focusI - 1); this.game.audio.play('ui_hover', { vol: 0.2 }); }
    else if (choosing && (e.code === 'ArrowDown' || e.code === 'ArrowRight')) { this.focus(this.focusI + 1); this.game.audio.play('ui_hover', { vol: 0.2 }); }
    else if (['KeyE', 'Space', 'Enter', 'NumpadEnter'].includes(e.code)) { if (!e.repeat) { if (choosing) this.pick(this.focusI, true); else this.advance(); } }
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }

  fitBars() {
    const W = this.ui.root.clientWidth || innerWidth, H = this.ui.root.clientHeight || innerHeight;
    const bar = Math.round(W < H ? Math.min(H * 0.085, 84) : Math.min(H * 0.105, 92));
    if (bar !== this.barPx) this.root.style.setProperty('--cv-bar', bar + 'px');
    this.barPx = bar;
    this.W = W; this.H = H;
  }

  // ------------------------------------------------------------ per frame (UI.update)
  update(dt) {
    this.tick(dt, 'wall');
    const b = this.cur;
    if (!this.s) return;
    this.fitBars();
    // the speaker keeps still and keeps looking at you
    const pl = this.director.player();
    if (pl && b?.speaker) { this.eyeV = pl.eye(this.eyeV || undefined); b.speaker.hold(true); }
    if (b) this.place(dt, b);
  }

  /** Float the label beside the speaker's head, its tail pointing at them; answers on your side. */
  place(dt, b) {
    const L = this.label, d = this.director, W = this.W, H = this.H, bar = this.barPx, m = 10;
    const lw = L.offsetWidth, lh = L.offsetHeight;
    const shot = d.shot && d.want ? d.shot : null;
    const portrait = W < H * 0.9;
    // where the head is on screen
    let head = null;
    const who = b.hero ? d.hero : b.speaker;
    if (who && (b.hero || d.weight > 0.02 || shot?.kind === 'face' || !shot)) {
      const eyes = b.hero ? pl3(d) : b.speaker.eyes(this._v1 ||= newV());
      const top = b.hero ? null : b.speaker.top(this._v2 ||= newV());
      if (eyes) {
        const E = d.toScreen(eyes, this._s1 ||= {});
        const T = top ? d.toScreen(top, this._s2 ||= {}) : { x: E.x, y: E.y - 40 };
        if (E.front && E.x > -W * 0.2 && E.x < W * 1.2 && E.y > -H * 0.2 && E.y < H * 1.2) head = { x: E.x, y: E.y, r: clamp(Math.hypot(T.x - E.x, T.y - E.y) * 1.25, 14, H * 0.3) };
      }
    }
    // the answers: near your side of the frame (over your shoulder), a column at the bottom
    const cw = this.choicesEl.offsetWidth, ch = this.choicesEl.offsetHeight;
    let cx = 0, cy = 0;
    const choosing = this.root.classList.contains('choosing');
    if (choosing) {
      const side = portrait ? 'mid' : shot?.choices || (head && head.x > W / 2 ? 'left' : 'right');
      cx = side === 'mid' ? (W - cw) / 2 : side === 'left' ? Math.max(m + 6, W * 0.06) : W - cw - Math.max(m + 6, W * 0.06);
      cy = H - bar - ch - (portrait ? 12 : 18);
      this.choicesEl.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
    }
    const plateH = this.plate.hidden ? 0 : this.plate.offsetHeight; // (the name ribbon rides above the label)
    const lo = bar + m + plateH, hi = H - bar - m - (choosing ? ch + 22 : 0);
    let x, y, side;
    if (!head) {
      // nobody to point at: low in the frame, centred
      x = (W - lw) / 2; y = Math.max(lo, Math.min(hi - lh, H * (portrait ? 0.56 : 0.6) - lh / 2)); side = 'none';
    } else {
      const pref = shot?.label || (portrait ? 'below' : head.x < W / 2 ? 'right' : 'left');
      const order = { right: ['right', 'above', 'left', 'below'], left: ['left', 'above', 'right', 'below'], below: ['below', 'above', 'right', 'left'], above: ['above', 'right', 'left', 'below'] }[pref] || ['right', 'left', 'below', 'above'];
      // beside the head: as far off as there's room for, but never over the face itself
      const gap = head.r * 0.9 + 16, near = head.r * 0.45 + 8;
      const at = (s) => {
        if (s === 'right') return { x: Math.max(head.x + near, Math.min(head.x + gap, W - m - lw)), y: head.y - lh * 0.55 };
        if (s === 'left') return { x: Math.min(head.x - near - lw, Math.max(head.x - gap - lw, m)), y: head.y - lh * 0.55 };
        if (s === 'below') return { x: head.x - lw / 2, y: head.y + head.r * 0.8 + 18 };
        return { x: head.x - lw / 2, y: head.y - head.r * 1.15 - 18 - lh };
      };
      const fits = (p) => p.x >= m && p.x + lw <= W - m && p.y >= lo && p.y + lh <= hi;
      let p = null;
      for (const s of order) { const q = at(s); if (fits(q) || (s === 'below' || s === 'above') && q.y >= lo && q.y + lh <= hi) { p = q; side = s; break; } }
      if (!p) { side = order[0]; p = at(side); }
      x = clamp(p.x, m, W - m - lw);
      y = clamp(p.y, lo, Math.max(lo, hi - lh));
    }
    // ease after the camera, snap on a fresh line
    const k = this.lab.ok ? 1 - Math.exp(-dt * 12) : 1;
    this.lab.x += (x - this.lab.x) * k;
    this.lab.y += (y - this.lab.y) * k;
    this.lab.ok = true;
    L.style.transform = `translate(${Math.round(this.lab.x)}px, ${Math.round(this.lab.y)}px)`;
    // the tail: on the edge facing the head, pointing at the mouth
    const t = this.tail;
    t.dataset.side = side;
    if (head && side !== 'none') {
      if (side === 'right' || side === 'left') t.style.top = `${Math.round(clamp(head.y + head.r * 0.15 - this.lab.y, 14, lh - 22))}px`, t.style.left = '';
      else t.style.left = `${Math.round(clamp(head.x - this.lab.x, 18, lw - 26))}px`, t.style.top = '';
    }
  }
}

const newV = () => new THREE.Vector3();
/** Your eyes (for your own lines). */
function pl3(d) { const pl = d.player(); return pl ? pl.eye() : null; }

// ------------------------------------------------------------------ the talk board, as a cutscene
/**
 * openTalkMenu's options as a cutscene line with answers (src/ui/choices.js calls this first):
 * returns a handle like the board's ({ close(), closed, portrait, typer, el }) or null when the
 * speaker has no 3D model in this scene (the board opens as before).
 */
export function convoTalkMenu(game, o = {}) {
  const cv = game.convo;
  if (!cv || o.convo === false) return null;
  const who = o.npc ?? (typeof o.who === 'string' ? o.who : null) ?? o.name;
  const sp = cv.speaker(who) || (o.name ? cv.speaker(o.name) : null) || (o.who && typeof o.who === 'object' ? cv.speaker(o.who) : null);
  if (!sp) return null;
  const opts = o.options || [];
  let beat = null;
  const h = {
    convo: true, closed: false, portrait: null, el: cv.label,
    typer: { finish: () => beat?.typer?.finish(), stop: () => {}, get done() { return !!beat?.typed; } },
    close: () => {
      if (h.closed) return;
      h.closed = true;
      if (beat && !beat.done) cv.finishBeat(beat);
      o.onClose?.();
    },
  };
  beat = {
    who: sp, name: o.name || sp.name, html: o.line || '', sub: o.sub || '', mood: o.mood || 'calm', camera: o.camera || 'auto', wait: true,
    cls: o.className, board: true,
    choices: opts.length ? opts.map((x, i) => ({ label: x.label, sub: x.sub, primary: x.primary, value: i })) : null,
    onPick: (i) => opts[i]?.onClick?.(),
    onDone: () => {},
    onClosed: () => { if (!h.closed) { h.closed = true; o.onClose?.(); } },
  };
  // a board with no answers waits for a click, then closes itself
  if (!beat.choices) beat.onDone = () => { if (!h.closed) { h.closed = true; o.onClose?.(); } };
  cv.enqueue(beat, o);
  return h;
}
