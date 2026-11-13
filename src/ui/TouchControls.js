// On-screen controls for touch devices. Taps and drags on the world still act as the mouse
// (dig where you touch, drag to mine in face mode); these only stand in for the keyboard.
//  left thumb : a carved stone disc with a brass knob → KeyA / KeyD / KeyW / KeyS
//  right thumb: round carved buttons that depend on the HUD mode
//     mine → jump (Space) · use (KeyE) · snack (KeyQ) · next tool (wheel tick)
//     town → use (KeyE) · home → use (KeyE) + build (KeyX) · none / mini → hidden
//     deep (first person) → a big hold-to-dig button (mouse button 0), jump (Space), use (E),
//       snack (Q), next tool, block (holds F: the guard; it glows while something hostile is
//       close); drags on the right half look around (input.look), the left half
//       grabs the stick wherever the thumb lands, and plain taps never dig
// Everything hides while a panel is open. In focus mode the stick dims and the buttons become
// use, snack and back (back calls the scene's onBack, or taps KeyS, which leaves face mode).
// Each button is a forged roundel with a vellum window (src/ui/touchArt.js) in which the mole acts
// out what it does: a short loop on press (looping while a hold button is held), a quiet idle of
// breaths and blinks the rest of the time; the stick's brass knob shows him running.
// (.tc-ic keeps the old glyph, hidden, for the tutorial's button pictures: src/ui/Onboard.js.)
import { el } from '../core/util.js';
import { SPR } from './uiSprites.js';
import { DSPR } from './deepArt.js';
import { TART, TOUCH_ACTS } from './touchArt.js';
import { iconURL } from '../gfx/PixelArt.js';

/** The little scene in a button's window: frames from touchArt, timings from TOUCH_ACTS. */
const SCENE_OF = { jump: 'jump', use: 'use', snack: 'snack', tool: 'tool', build: 'build', rotate: 'rotate', done: 'done', back: 'back', crouch: 'crouch', block: 'block', dig: 'dig' };
const vigs = new Set();
// frames past the first are drawn a few at a time while the game idles (each is a few ms), so
// building the controls does not stall the first frames; a frame needed sooner is drawn on the spot
const warmQ = [];
const warm = () => {
  const t0 = performance.now();
  while (warmQ.length && performance.now() - t0 < 6) { const f = warmQ.shift(); const u = f(); if (u) { const im = new Image(); im.src = u; } }
  if (warmQ.length) (window.requestIdleCallback ? requestIdleCallback(warm, { timeout: 500 }) : setTimeout(warm, 50));
};
const queueWarm = (fns) => { const was = warmQ.length; warmQ.push(...fns); if (!was) setTimeout(warm, 400); };
function vignette(action, big = false, cls = 'tc-vig') {
  const n = TART.count(action, big), url = (i) => TART.frame(action, big, i);
  queueWarm(Array.from({ length: n - 1 }, (_, i) => () => url(i + 1)));
  const spec = TOUCH_ACTS[action] || TOUCH_ACTS.use;
  const img = el('img', { class: 'pix ' + cls, src: url(0), alt: '' });
  const v = {
    img, action, held: false, low: false, seq: null, i: 0, t: 0, shown: 0,
    breath: 0, blinkT: 1.5 + Math.random() * 4,
    show(f) { if (f !== v.shown && f < n) { v.shown = f; img.src = url(f); } },
    play(seq) { v.seq = seq; v.i = 0; v.t = 0; v.show(seq[0][0]); },
    press() { v.held = true; v.play(spec.act); },
    release() { v.held = false; },
    setLow(on) { if (on === v.low) return; v.low = on; if (!on) v.play([[3, 90], [0, 1]]); },
    tick(ms) {
      if (v.seq) {
        v.t += ms;
        while (v.seq && v.t >= v.seq[v.i][1]) {
          v.t -= v.seq[v.i][1];
          v.i++;
          if (v.i >= v.seq.length) {
            if (spec.mode === 'loop' && v.held) v.i = 0;
            else if (spec.mode === 'hold' && v.held && spec.hold) { v.seq = spec.hold; v.i = 0; }
            else if (spec.mode === 'toggle' && v.low && spec.low) { v.seq = spec.low; v.i = 0; }
            else { v.seq = null; v.t = 0; break; }
          }
          v.show(v.seq[v.i][0]);
        }
        return;
      }
      // idle: slow breaths, a blink now and then
      v.breath = (v.breath + ms) % 1700;
      v.blinkT -= ms / 1000;
      if (v.blinkT <= 0) { v.blinkT = 2.5 + Math.random() * 5; v.play([[2, 130], [0, 1]]); return; }
      v.show(v.breath < 950 ? 0 : 1);
    },
  };
  vigs.add(v);
  return v;
}
let vigClock = null;
function runVignettes(root) {
  if (vigClock) return;
  let last = performance.now();
  vigClock = setInterval(() => {
    const now = performance.now(), ms = Math.min(200, now - last);
    last = now;
    if (document.hidden || !root.offsetParent) return;
    for (const v of vigs) if (v.img.offsetParent) v.tick(ms);
  }, 40);
}

/** An 11×11 shield glyph in the style of the other button icons (cream, a dark outline). */
let shieldURL = null;
function shieldIcon() {
  if (shieldURL) return shieldURL;
  const T = ['..aaaaaaa..', '.abbbcbbba.', '.abbbcbbba.', '.abbbcbbba.', '.accccccca.', '.abbbcbbba.', '..abbcbba..', '..abbcbba..', '...abcba...', '....aba....', '.....a.....'];
  const C = { a: '#f6e8c8', b: '#e6cfa0', c: '#a8784a' };
  const cv = document.createElement('canvas');
  cv.width = cv.height = 11;
  const g = cv.getContext('2d');
  const on = (x, y) => T[y]?.[x] && T[y][x] !== '.';
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
    if (on(x, y)) { g.fillStyle = C[T[y][x]]; g.fillRect(x, y, 1, 1); }
    else if (on(x + 1, y) || on(x - 1, y) || on(x, y + 1) || on(x, y - 1)) { g.fillStyle = '#2a1a10'; g.fillRect(x, y, 1, 1); }
  }
  g.fillStyle = '#ffffff'; g.fillRect(3, 1, 1, 2); // a glint
  shieldURL = cv.toDataURL();
  return shieldURL;
}

export function setupTouch(game) {
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    document.documentElement.classList.add('is-touch');
    const inp = game.input;
    const ui = game.ui;
    const held = new Set();
    const press = (code) => { if (!inp.down.has(code)) { inp.down.add(code); inp.justDown.add(code); } held.add(code); };
    const release = (code) => { if (held.has(code)) { held.delete(code); inp.down.delete(code); inp.justUp.add(code); } };
    const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };

    // ---------------- joystick
    const knob = el('img', { class: 'pix tc-knob', src: TART.knobFrame(0), alt: '' });
    queueWarm(Array.from({ length: 12 }, (_, i) => () => TART.knobFrame((i % 6) + 1, i >= 6)));
    // the knob's mole runs while the stick is pushed (facing the way you go), stands when it rests
    let runF = 0, runT = 0, runLeft = false, running = false;
    vigs.add({ img: knob, tick(ms) {
      if (!running) { if (runF) { runF = 0; knob.src = TART.knobFrame(0); } return; }
      runT += ms;
      if (runT < 85) return;
      runT = 0;
      runF = (runF % 6) + 1;
      knob.src = TART.knobFrame(runF, runLeft);
    } });
    const stick = el('div', { class: 'tc-stick', 'aria-label': 'Move', role: 'slider' }, [el('img', { class: 'pix tc-base', src: SPR.stick(), alt: '' }), knob]);
    let pid = null, cx = 0, cy = 0, R = 1;
    const unit = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 2;
    const steer = (e) => {
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      const u = unit();
      knob.style.transform = `translate(${Math.round(dx / u) * u}px, ${Math.round(dy / u) * u}px)`;
      const nx = dx / R, ny = dy / R;
      // in the mine "up" means jump/climb, so it needs a firmer push than walking
      const yT = ui.hudMode === 'mine' ? 0.58 : 0.38;
      const want = { KeyA: nx < -0.38, KeyD: nx > 0.38, KeyW: ny < -yT, KeyS: ny > yT };
      for (const [code, on] of Object.entries(want)) on ? press(code) : release(code);
      stick.classList.toggle('up', want.KeyW);
      running = want.KeyA || want.KeyD || want.KeyW || want.KeyS;
      if (want.KeyA) runLeft = true; else if (want.KeyD) runLeft = false;
    };
    const stopStick = () => {
      pid = null;
      stick.style.left = '';
      stick.style.bottom = '';
      knob.style.transform = '';
      stick.classList.remove('on', 'up');
      running = false;
      for (const c of ['KeyA', 'KeyD', 'KeyW', 'KeyS']) release(c);
    };
    stick.addEventListener('pointerdown', (e) => {
      swallow(e);
      game.audio.init();
      if (pid !== null) return;
      pid = e.pointerId;
      try { stick.setPointerCapture(pid); } catch (err) { /* noop */ }
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      R = r.width * 0.36;
      stick.classList.add('on');
      steer(e);
    });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId !== pid) return; swallow(e); steer(e); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(ev, (e) => { if (e.pointerId !== pid) return; e.stopPropagation(); stopStick(); });

    // ---------------- forged buttons, each with the mole acting out its job in the window
    const btn = (icon, label, cls, onDown, onUp) => {
      const face = el('img', { class: 'pix tc-face', src: TART.face(false), alt: '' });
      const vig = vignette(SCENE_OF[icon] || 'use');
      const b = el('button', { class: 'tc-btn ' + cls, 'aria-label': label, title: label }, [face, el('img', { class: 'pix tc-ic', src: SPR.icon(icon), alt: '' }), vig.img]);
      b._vig = vig;
      let bid = null;
      b.addEventListener('pointerdown', (e) => {
        swallow(e);
        game.audio.init();
        if (bid !== null) return;
        bid = e.pointerId;
        try { b.setPointerCapture(bid); } catch (err) { /* noop */ }
        b.classList.add('on');
        face.src = TART.face(true);
        vig.press();
        if (navigator.vibrate && navigator.userActivation?.hasBeenActive) try { navigator.vibrate(8); } catch (err) { /* noop */ }
        onDown();
      });
      const up = (e) => {
        if (e.pointerId !== bid) return;
        e.stopPropagation();
        bid = null;
        b.classList.remove('on');
        face.src = TART.face(false);
        vig.release();
        if (onUp) onUp();
      };
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, up);
      b.addEventListener('click', (e) => e.preventDefault());
      return b;
    };
    const key = (icon, code, label, cls) => btn(icon, label, cls, () => press(code), () => release(code));
    const jump = key('jump', 'Space', 'Jump / climb', 'm-mine b-jump');
    const use = key('use', 'KeyE', 'Use', 'm-mine m-town m-home m-focus b-use');
    const snack = key('snack', 'KeyQ', 'Snack', 'm-mine m-focus b-snack');
    const tool = btn('tool', 'Next tool', 'm-mine b-tool', () => { inp.mouse.wheel += 1; ui.belt?.poke(); });
    const buildB = key('build', 'KeyX', 'Build mode', 'm-home b-build');
    const rotB = key('rotate', 'KeyR', 'Rotate', 'm-building b-rot');
    const doneB = key('done', 'KeyX', 'Done', 'm-building b-done');
    const back = btn('back', 'Back', 'm-focus-only b-back', () => {
      if (typeof ui.focusBack === 'function') ui.focusBack();
      else ui.pressKey('KeyS', 90); // face mode steps back out on 'down'
    });

    const pad = el('div', { class: 'tc-pad' }, [tool, jump, snack, use, buildB, back, rotB, doneB]);

    // ---------------- first person: dig button, buttons around it, look pad under the HUD
    let digId = null;
    const digFace = el('img', { class: 'pix tc-dface', src: TART.bigFace(false), alt: '' });
    const digIcon = el('img', { class: 'pix tc-dic', src: DSPR.pick(), alt: '' });
    // the big window: the mole swinging his pick (or, decorating, hammering a beam)
    const digVig = vignette('dig', true, 'tc-dvig'), buildVig = vignette('build', true, 'tc-dvig');
    buildVig.img.hidden = true;
    let bigVig = digVig;
    const dig = el('button', { class: 'tc-dig vig', 'aria-label': 'Dig (hold)', title: 'Dig (hold)' }, [digFace, digIcon, digVig.img, buildVig.img]);
    // scenes pick what the big button shows: an icon URL, null (the pick) or false (no button);
    // the pick and the build hammer are played as scenes, any other icon sits on the vellum
    ui._applyActionIcon = (src) => {
      const build = !!src && src === iconURL('support_beam');
      bigVig = dig._vig = build ? buildVig : digVig;
      digVig.img.hidden = !!src;
      buildVig.img.hidden = !build;
      dig.classList.toggle('vig', !src || build);
      digIcon.src = src || DSPR.pick();
      dig.style.display = src === false ? 'none' : '';
    };
    ui._applyActionIcon(ui.actionIcon ?? null);
    const digDown = () => { inp.mouse.buttons[0] = true; inp.mouse.pressed[0] = true; };
    const digEnd = () => {
      if (digId === null) return;
      digId = null;
      dig.classList.remove('on');
      digFace.src = TART.bigFace(false);
      bigVig.release();
      inp.mouse.buttons[0] = false;
      inp.mouse.released[0] = true;
    };
    dig.addEventListener('pointerdown', (e) => {
      swallow(e);
      game.audio.init();
      if (digId !== null) return;
      digId = e.pointerId;
      try { dig.setPointerCapture(digId); } catch (err) { /* noop */ }
      dig.classList.add('on');
      digFace.src = TART.bigFace(true);
      bigVig.press();
      digDown();
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) dig.addEventListener(ev, (e) => { if (e.pointerId !== digId) return; e.stopPropagation(); digEnd(); });
    // Input clears mouse button 0 on ANY pointerup: another finger lifting must not end the dig
    window.addEventListener('pointerup', (e) => { if (digId !== null && e.pointerId !== digId) { inp.mouse.buttons[0] = true; inp.mouse.released[0] = false; } });
    const dJump = key('jump', 'Space', 'Jump', 'tc-d d-jump');
    const dUse = key('use', 'KeyE', 'Use', 'tc-d d-use');
    const dSnack = key('snack', 'KeyQ', 'Snack', 'tc-d d-snack');
    const dTool = btn('tool', 'Next tool', 'tc-d d-tool', () => { inp.mouse.wheel += 1; ui.belt?.poke(); });
    // crouch is a toggle on touch (in water it dives)
    const dCrouch = btn('crouch', 'Crouch / dive', 'tc-d d-crouch', () => {
      const low = !held.has('KeyC');
      if (low) press('KeyC'); else release('KeyC');
      dCrouch.classList.toggle('lit', low);
      dCrouch._vig.setLow(low);
    });
    // block: hold to raise the guard (DigScene reads KeyF)
    const dBlock = key('block', 'KeyF', 'Block (hold)', 'tc-d d-block');
    dBlock.querySelector('.tc-ic').src = shieldIcon();
    dBlock.style.cssText = 'right: calc(var(--px) * 70); bottom: calc(var(--px) * 37);';
    const deepPad = el('div', { class: 'tc-deep' }, [dTool, dSnack, dUse, dJump, dCrouch, dBlock, dig]);

    const look = el('div', { class: 'tc-look' });
    let lookId = null, lx = 0, ly = 0;
    look.addEventListener('pointerdown', (e) => {
      swallow(e);
      game.audio.init();
      if (e.clientX < window.innerWidth * 0.45) {
        // left side: the stick jumps under the thumb
        if (pid !== null) return;
        const r = stick.getBoundingClientRect();
        stick.style.left = Math.max(0, e.clientX - r.width / 2) + 'px';
        stick.style.bottom = Math.max(0, window.innerHeight - e.clientY - r.height / 2) + 'px';
        pid = e.pointerId;
        const r2 = stick.getBoundingClientRect();
        cx = r2.left + r2.width / 2;
        cy = r2.top + r2.height / 2;
        R = r2.width * 0.36;
        try { look.setPointerCapture(pid); } catch (err) { /* noop */ }
        stick.classList.add('on');
        steer(e);
        return;
      }
      if (lookId !== null) return;
      lookId = e.pointerId;
      lx = e.clientX;
      ly = e.clientY;
      try { look.setPointerCapture(lookId); } catch (err) { /* noop */ }
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId === pid) { swallow(e); steer(e); return; }
      if (e.pointerId !== lookId) return;
      swallow(e);
      inp.look.dx += e.clientX - lx;
      inp.look.dy += e.clientY - ly;
      lx = e.clientX;
      ly = e.clientY;
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) look.addEventListener(ev, (e) => {
      if (e.pointerId === pid) { e.stopPropagation(); stopStick(); }
      if (e.pointerId === lookId) { e.stopPropagation(); lookId = null; }
    });
    ui.root.insertBefore(look, ui.hud);

    const root = el('div', { class: 'tc' }, [stick, pad, deepPad]);
    ui.root.append(root);
    game.touch = root;
    runVignettes(root);
    // the tutorial (src/ui/Onboard.js) lights the real controls it teaches: name → element, and a highlight
    const named = { stick, look, dig, jump: dJump, use: dUse, snack: dSnack, tool: dTool, crouch: dCrouch, block: dBlock, padUse: use, padJump: jump, build: buildB };
    ui.touchEl = (name) => named[name] || null;
    ui.touchHi = (elm, on) => elm?.classList?.toggle('tc-hi', !!on);

    // never leave keys stuck when the controls vanish (panels, scene changes, app switch)
    const releaseAll = () => { stopStick(); digEnd(); lookId = null; for (const c of [...held]) release(c); dCrouch.classList.remove('lit'); dCrouch._vig.setLow(false); for (const v of vigs) v.release?.(); };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    new MutationObserver(() => { if (ui.root.classList.contains('panel-open') || ui.root.classList.contains('no-touch')) releaseAll(); }).observe(ui.root, { attributes: true, attributeFilter: ['class', 'data-hud'] });
    // decorating at home: swap to rotate / done (reads the home scene's build mode if it has one)
    setInterval(() => {
      const b = game.scene && game.scene.build;
      const on = !!(b && b.active && ui.hudMode === 'home');
      // first-person decorating: the big button places, so it shows a hammer
      const fpBuild = !!(b && b.active && ui.hudMode === 'deep');
      if (fpBuild !== ui._fpBuild) { ui._fpBuild = fpBuild; ui._applyActionIcon(fpBuild ? iconURL('support_beam') : ui.actionIcon ?? null); }
      if (on !== ui.root.classList.contains('building')) { ui.root.classList.toggle('building', on); if (on) releaseAll(); }
      // the block button glows while something hostile is close
      const th = ui.hudMode === 'deep' ? game.scene?.enemies?.threat?.() || game.scene?.prologue?.threat?.() : null;
      dBlock.classList.toggle('lit', !!(th && th.dist < 9));
    }, 200);
  };
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (coarse) build();
  window.addEventListener('touchstart', build, { once: true, passive: true });
}
