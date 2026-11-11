// Input for the title's 3D signpost menu (bookends/titleSigns.js). A mouse or a finger finds a
// board by a ray against its (padded) box, or failing that by a generous zone round its picture on
// screen (bigger for fingers); arrow keys, W/S, Home/End, Tab and a gamepad's d-pad or stick move
// between boards; Enter, Space, a click, a tap or the pad's A button choose one (B goes back).
// Invisible real <button>s ride over the boards in a role="menu" for keyboard focus and screen
// readers; the board itself shows the focus (it catches the light and wobbles). Sounds are the
// game's recordings (a creak as a board is touched, a knock when it is chosen): nothing synthesized.
//
//   const nav = makeSignNav({ layer, canvas, camera, post, items: [{ label, onClick }], audio,
//                             blocked: () => bool, onBack: () => {}, autofocus });
//   nav.update(dt)        per frame: the buttons follow the boards; gamepads are polled
//   nav.enabled = false   (while something else has the screen: the save stones)
//   nav.focus(i, silent)  nav.focused  nav.center(i) → [x, y] page px  nav.press(i)  nav.destroy()
import * as THREE from 'three';
import { el } from '../core/util.js';

const CSS = /* css */`
.ts-hit { position: absolute; inset: 0; pointer-events: auto; touch-action: none; -webkit-tap-highlight-color: transparent; user-select: none; -webkit-user-select: none; }
.ts-hit.over { cursor: pointer; }
.ts-hit.off { pointer-events: none; cursor: default; }
.bk-root .ts-menu { position: absolute; inset: 0; margin: 0; padding: 0; list-style: none; pointer-events: none; }
.bk-root .ts-btn { position: absolute; left: 0; top: 0; margin: 0; padding: 0; border: 0; background: transparent; color: transparent;
  font: inherit; pointer-events: none; outline: none; opacity: 0; transform-origin: 0 0; }
`;

const R = (a, b) => a + Math.random() * (b - a);
function defineSounds(au) {
  if (!au || !au.define || au.presets?.title_sign_creak) return;
  // a board shifting on its nail: a short, high wood creak; chosen: a knock on the wood
  au.define('title_sign_creak', (a, o = {}) => a.sample(['creak1', 'creak2', 'creak3'], { vol: (o.vol ?? 1) * 0.14, pitch: R(1.3, 1.7), dur: R(0.16, 0.28), release: 0.08, pan: o.pan || 0, filter: 'highpass', ff: 380 }), 0.09);
  au.define('title_sign_knock', (a, o = {}) => {
    a.sample('knock', { vol: (o.vol ?? 1) * 0.5, pitch: R(0.8, 0.95), pan: o.pan || 0, reverb: 0.3 });
    a.sample(['hit_wood1', 'hit_wood2'], { vol: (o.vol ?? 1) * 0.2, pitch: R(1.0, 1.25), pan: o.pan || 0, delay: 0.012 });
  }, 0.05);
}

export function makeSignNav(opts) {
  const { layer, canvas, camera, post, items, audio } = opts;
  defineSounds(audio);
  const style = el('style', {}, CSS);
  document.head.append(style);
  const boards = post.boards;
  const hit = el('div', { class: 'ts-hit', 'aria-hidden': 'true' });
  const menu = el('div', { class: 'ts-menu', role: 'menu', 'aria-label': opts.label || 'Main menu', 'aria-orientation': 'vertical' });
  const buttons = items.map((it, i) => {
    const b = el('button', { class: 'ts-btn', type: 'button', role: 'menuitem', tabindex: i === 0 ? '0' : '-1' }, it.label);
    b.style.pointerEvents = 'none'; // (the hit layer finds boards for the pointer; these are for keys and screen readers)
    b.addEventListener('focus', () => setFocus(i, focusSilent));
    b.addEventListener('click', (e) => { e.preventDefault(); activate(i); });
    menu.append(b);
    return b;
  });
  layer.prepend(hit, menu);

  let enabled = true, focused = -1, focusSilent = false, down = null, busy = false, over = -1;
  const rects = boards.map(() => ({ l: 0, t: 0, r: 0, b: 0, ok: false }));
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(), inv = new THREE.Matrix4(), lray = new THREE.Ray(), box = new THREE.Box3(), hp = new THREE.Vector3(), v = new THREE.Vector3();
  const blocked = () => !enabled || busy || !!(opts.blocked && opts.blocked());
  const panOf = (i) => { const r = rects[i]; return r.ok ? Math.max(-0.7, Math.min(0.7, ((r.l + r.r) / 2 / window.innerWidth) * 2 - 1)) : 0; };
  const play = (name, o) => audio?.play?.(name, o);

  function setFocus(i, silent = false) {
    if (i === focused || i < 0 || i >= boards.length) return;
    focused = i;
    post.setFocus(i, !silent);
    buttons.forEach((b, k) => { b.tabIndex = k === i ? 0 : -1; });
    if (!silent) play('title_sign_creak', { pan: panOf(i), vol: 0.9 });
  }
  function focus(i, silent = false) {
    i = Math.max(0, Math.min(boards.length - 1, i));
    focusSilent = silent;
    const ae = document.activeElement;
    // the real button takes the focus (screen readers follow), unless something else holds it
    if (!ae || ae === document.body || buttons.includes(ae)) buttons[i].focus({ preventScroll: true });
    focusSilent = false;
    setFocus(i, silent);
  }
  const move = (d) => focus(focused < 0 ? 0 : (focused + d + boards.length) % boards.length);
  function activate(i) {
    if (blocked() || i < 0) return;
    setFocus(i, true);
    post.knock(i, 1);
    play('title_sign_knock', { pan: panOf(i) });
    busy = true;
    setTimeout(() => { busy = false; items[i].onClick?.(); }, 140);
  }

  // ---- which board is under a point (page px): the ray first, then the generous zones
  function pick(x, y, touch) {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return -1;
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    let best = -1, bd = Infinity;
    const pad = touch ? 0.05 : 0.02;
    boards.forEach((b, i) => {
      inv.copy(b.pivot.matrixWorld).invert();
      lray.copy(ray.ray).applyMatrix4(inv);
      box.copy(b.box).expandByScalar(pad);
      if (lray.intersectBox(box, hp)) { const d = hp.distanceTo(lray.origin); if (d < bd) { bd = d; best = i; } }
    });
    if (best >= 0) return best;
    const padPx = touch ? 28 : 8;
    let bz = Infinity;
    rects.forEach((q, i) => {
      if (!q.ok) return;
      const dx = Math.max(q.l - x, 0, x - q.r), dy = Math.max(q.t - y, 0, y - q.b);
      if (dx > padPx || dy > padPx) return;
      const d = Math.hypot(dx, dy) * 4 + Math.hypot(x - (q.l + q.r) / 2, y - (q.t + q.b) / 2) * 0.01;
      if (d < bz) { bz = d; best = i; }
    });
    return best;
  }

  // ---- pointer: hover focuses, press knocks, release on the same board chooses it
  const onMove = (e) => {
    if (blocked()) return;
    if (down) return;
    if (e.pointerType !== 'mouse') return;
    const i = pick(e.clientX, e.clientY, false);
    over = i;
    hit.classList.toggle('over', i >= 0);
    if (i >= 0 && i !== focused) focus(i);
  };
  const onDown = (e) => {
    if (blocked() || (e.button != null && e.button > 0)) return;
    const touch = e.pointerType !== 'mouse';
    const i = pick(e.clientX, e.clientY, touch);
    if (i < 0) return;
    e.preventDefault();
    down = { i, id: e.pointerId, x: e.clientX, y: e.clientY, touch };
    try { hit.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    focus(i, true);
    post.knock(i, 0.35);
  };
  const onUp = (e) => {
    if (!down || e.pointerId !== down.id) return;
    const d = down;
    down = null;
    if (blocked()) return;
    const i = pick(e.clientX, e.clientY, d.touch);
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (i === d.i || (d.touch && moved < 32)) activate(d.i);
  };
  const onCancel = () => { down = null; };
  hit.addEventListener('pointermove', onMove);
  hit.addEventListener('pointerdown', onDown);
  hit.addEventListener('pointerup', onUp);
  hit.addEventListener('pointercancel', onCancel);
  hit.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---- keys
  const onKey = (e) => {
    if (blocked() || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowRight' || k === 's' || k === 'S' || k === 'd' || k === 'D') { move(1); e.preventDefault(); }
    else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'w' || k === 'W' || k === 'a' || k === 'A') { move(-1); e.preventDefault(); }
    else if (k === 'Home') { focus(0); e.preventDefault(); }
    else if (k === 'End') { focus(boards.length - 1); e.preventDefault(); }
    else if ((k === 'Enter' || k === ' ') && !buttons.includes(document.activeElement)) { activate(focused < 0 ? 0 : focused); e.preventDefault(); }
  };
  window.addEventListener('keydown', onKey);

  // ---- gamepads: the d-pad / stick steps (with key-like repeat), A chooses, B goes back; while the
  // menu is away (the save stones, a panel) they drive whatever has the keyboard focus instead
  const pad = { held: {}, rep: {} };
  function pollPads(dt) {
    let list = [];
    try { list = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; } catch (err) { return; }
    if (!list.length) return;
    const st = { up: false, down: false, left: false, right: false, a: false, b: false };
    for (const g of list) {
      const B = (n) => !!g.buttons?.[n]?.pressed, ax = g.axes || [];
      st.up ||= B(12) || ax[1] < -0.55; st.down ||= B(13) || ax[1] > 0.55;
      st.left ||= B(14) || ax[0] < -0.55; st.right ||= B(15) || ax[0] > 0.55;
      st.a ||= B(0); st.b ||= B(1);
    }
    const ae = document.activeElement;
    const key = (k) => { (ae && ae !== document.body ? ae : window).dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true })); };
    for (const [n, k, d] of [['up', 'ArrowUp', -1], ['down', 'ArrowDown', 1], ['left', 'ArrowLeft', -1], ['right', 'ArrowRight', 1]]) {
      if (!st[n]) { pad.held[n] = false; continue; }
      const fresh = !pad.held[n];
      pad.held[n] = true;
      pad.rep[n] = fresh ? 0.38 : (pad.rep[n] ?? 0) - dt;
      if (!fresh && pad.rep[n] > 0) continue;
      if (!fresh) pad.rep[n] = 0.16;
      if (!blocked()) move(d);
      else if (!enabled || opts.blocked?.()) key(k);
    }
    for (const n of ['a', 'b']) {
      if (!st[n]) { pad.held[n] = false; continue; }
      if (pad.held[n]) continue;
      pad.held[n] = true;
      if (n === 'a') { if (!blocked()) activate(focused < 0 ? 0 : focused); else if (ae && ae !== document.body && ae.click) ae.click(); }
      else opts.onBack?.();
    }
  }

  // ---- per frame: where the boards are on screen (the zones, the buttons over them)
  const corners = [0, 1, 2, 3, 4, 5, 6, 7];
  function update(dt) {
    const r = canvas.getBoundingClientRect();
    boards.forEach((b, i) => {
      b.pivot.updateWorldMatrix(true, false);
      let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity, ok = true;
      for (const c of corners) {
        v.set(c & 1 ? b.box.max.x : b.box.min.x, c & 2 ? b.box.max.y : b.box.min.y, c & 4 ? b.box.max.z : b.box.min.z).applyMatrix4(b.pivot.matrixWorld).project(camera);
        if (v.z > 1 || v.z < -1) ok = false;
        const x = r.left + (v.x * 0.5 + 0.5) * r.width, y = r.top + (-v.y * 0.5 + 0.5) * r.height;
        l = Math.min(l, x); rr = Math.max(rr, x); t = Math.min(t, y); bb = Math.max(bb, y);
      }
      const q = rects[i];
      q.l = l; q.t = t; q.r = rr; q.b = bb; q.ok = ok;
      const key = `${Math.round(l)},${Math.round(t)},${Math.max(1, Math.round(rr - l))},${Math.max(1, Math.round(bb - t))}`;
      if (q.key !== key) { // (only when it moved: no style work on still frames)
        q.key = key;
        const [x, y, w, hh] = key.split(',');
        const btn = buttons[i];
        btn.style.transform = `translate(${x}px, ${y}px)`;
        btn.style.width = `${w}px`;
        btn.style.height = `${hh}px`;
      }
    });
    pollPads(dt);
  }

  return {
    buttons, rects, hit,
    get focused() { return focused; },
    get enabled() { return enabled; },
    set enabled(on) {
      enabled = !!on;
      hit.classList.toggle('off', !enabled);
      menu.setAttribute('aria-hidden', enabled ? 'false' : 'true');
      buttons.forEach((b, k) => { b.tabIndex = enabled && k === Math.max(0, focused) ? 0 : -1; });
      if (!enabled) { down = null; hit.classList.remove('over'); }
    },
    focus,
    press: activate,
    pick,
    setLabel(i, text) { buttons[i].textContent = text; items[i].label = text; },
    /** The middle of board i's words, in page px (tests, screenshots). */
    center(i) {
      const b = boards[i];
      if (!b) return null;
      b.pivot.updateWorldMatrix(true, false);
      v.set(b.textX, b.textY, b.box.max.z).applyMatrix4(b.pivot.matrixWorld).project(camera);
      const r = canvas.getBoundingClientRect();
      return [r.left + (v.x * 0.5 + 0.5) * r.width, r.top + (-v.y * 0.5 + 0.5) * r.height];
    },
    update,
    destroy() {
      window.removeEventListener('keydown', onKey);
      hit.remove(); menu.remove(); style.remove();
    },
    get over() { return over; },
  };
}
