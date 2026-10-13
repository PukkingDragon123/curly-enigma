// On-screen controls for touch devices. Taps and drags on the world still act as the mouse
// (dig where you touch, drag to mine in face mode); these only stand in for the keyboard.
//  left thumb : a carved stone disc with a brass knob → KeyA / KeyD / KeyW / KeyS
//  right thumb: round carved buttons that depend on the HUD mode
//     mine → jump (Space) · use (KeyE) · snack (KeyQ) · next tool (wheel tick)
//     town → use (KeyE) · home → use (KeyE) + build (KeyX) · none / mini → hidden
// Everything hides while a panel is open. In focus mode the stick dims and the buttons become
// use, snack and back (back calls the scene's onBack, or taps KeyS, which leaves face mode).
import { el } from '../core/util.js';
import { SPR } from './uiSprites.js';

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
    const knob = el('img', { class: 'pix tc-knob', src: SPR.knob(), alt: '' });
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
    };
    const stopStick = () => {
      pid = null;
      knob.style.transform = '';
      stick.classList.remove('on', 'up');
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

    // ---------------- carved buttons
    const btn = (icon, label, cls, onDown, onUp) => {
      const face = el('img', { class: 'pix tc-face', src: SPR.rbtn(false), alt: '' });
      const b = el('button', { class: 'tc-btn ' + cls, 'aria-label': label, title: label }, [face, el('img', { class: 'pix tc-ic', src: SPR.icon(icon), alt: '' })]);
      let bid = null;
      b.addEventListener('pointerdown', (e) => {
        swallow(e);
        game.audio.init();
        if (bid !== null) return;
        bid = e.pointerId;
        try { b.setPointerCapture(bid); } catch (err) { /* noop */ }
        b.classList.add('on');
        face.src = SPR.rbtn(true);
        if (navigator.vibrate && navigator.userActivation?.hasBeenActive) try { navigator.vibrate(8); } catch (err) { /* noop */ }
        onDown();
      });
      const up = (e) => {
        if (e.pointerId !== bid) return;
        e.stopPropagation();
        bid = null;
        b.classList.remove('on');
        face.src = SPR.rbtn(false);
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
    const root = el('div', { class: 'tc' }, [stick, pad]);
    ui.root.append(root);
    game.touch = root;

    // never leave keys stuck when the controls vanish (panels, scene changes, app switch)
    const releaseAll = () => { stopStick(); for (const c of [...held]) release(c); };
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    new MutationObserver(() => { if (ui.root.classList.contains('panel-open') || ui.root.classList.contains('no-touch')) releaseAll(); }).observe(ui.root, { attributes: true, attributeFilter: ['class', 'data-hud'] });
    // decorating at home: swap to rotate / done (reads the home scene's build mode if it has one)
    setInterval(() => {
      const b = game.scene && game.scene.build;
      const on = !!(b && b.active && ui.hudMode === 'home');
      if (on !== ui.root.classList.contains('building')) { ui.root.classList.toggle('building', on); if (on) releaseAll(); }
    }, 200);
  };
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (coarse) build();
  window.addEventListener('touchstart', build, { once: true, passive: true });
}
