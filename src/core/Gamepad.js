// Controllers (the standard mapping: Xbox / PlayStation / Steam Input). Polled once a frame before the
// scene updates; buttons go through the same paths as the keyboard and mouse, so every scene, panel
// and dialogue that takes keys takes the pad too:
//   left stick   move (analog: Input.axisX/axisY)          right stick  look (Input.look, an expo curve)
//   A / Cross    jump (Space)        B / Circle   crouch (C)        X / Square   use (E)
//   Y / Triangle eat (Q)             RT           dig / swing (mouse 1)          LT  block (mouse 2)
//   LB / RB      hotbar ← / →        L3           sprint (latched while moving)  R3  build menu (R)
//   D-pad        ↑ book (B)  ↓ backpack (I)  ← / → hotbar          Start  menu (Esc)   Back  backpack (I)
// While a pad is in use Input.pointerLocked reads true (aiming needs no mouse lock); touching the
// mouse hands control back.
const DEAD = 0.16; // radial dead zone of the sticks
const LOOK_RATE = 1300; // look speed at full tilt (Input.look units, CSS px per second: × the look sensitivity)
const KEYS = { 0: 'Space', 1: 'KeyC', 2: 'KeyE', 3: 'KeyQ', 8: 'KeyI', 9: 'Escape', 11: 'KeyR', 12: 'KeyB', 13: 'KeyI' };
const KEY_NAMES = { Space: ' ', KeyC: 'c', KeyE: 'e', KeyQ: 'q', KeyI: 'i', Escape: 'Escape', KeyR: 'r', KeyB: 'b', ShiftLeft: 'Shift' };
const MOUSE = { 7: 0, 6: 2 }; // triggers → mouse buttons
const WHEEL = { 4: -1, 5: 1, 14: -1, 15: 1 };

function stick(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEAD) return [0, 0, 0];
  const k = Math.min(1, (m - DEAD) / (1 - DEAD));
  return [(x / m) * k, (y / m) * k, k];
}

export class Gamepad {
  constructor(input) {
    this.input = input;
    this.held = new Set(); // keys this pad holds down
    this.prev = [];
    this.sprint = false;
    this.connected = false;
    this.ok = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
    if (this.ok) {
      window.addEventListener('gamepadconnected', () => { this.connected = true; });
      window.addEventListener('gamepaddisconnected', () => { this.connected = [...navigator.getGamepads()].some(Boolean); if (!this.connected) this.release(); });
    }
  }

  key(code, on) {
    if (on === this.held.has(code)) return;
    if (on) this.held.add(code); else this.held.delete(code);
    const t = document.activeElement || document.body || window;
    t.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, key: KEY_NAMES[code] || code, bubbles: true, cancelable: true }));
  }

  release() {
    for (const c of [...this.held]) this.key(c, false);
    this.input.setButton(0, false); this.input.setButton(2, false);
    this.input.pad = { x: 0, y: 0 };
    this.prev = [];
  }

  poll(dt) {
    if (!this.ok || !this.connected) return;
    let pad = null;
    try { for (const p of navigator.getGamepads()) if (p && p.connected) { pad = p; break; } } catch (e) { return; }
    if (!pad) return;
    const inp = this.input, b = pad.buttons, ax = pad.axes;
    const on = (i) => !!b[i] && (b[i].pressed || b[i].value > 0.4);
    let used = false;
    // buttons → keys, mouse buttons, the hotbar wheel
    for (let i = 0; i < b.length; i++) {
      const now = on(i), was = !!this.prev[i];
      if (now) used = true;
      if (now === was) continue;
      if (KEYS[i]) this.key(KEYS[i], now);
      if (MOUSE[i] !== undefined) inp.setButton(MOUSE[i], now);
      if (now && WHEEL[i]) inp.mouse.wheel += WHEEL[i];
      if (now && i === 10) this.sprint = !this.sprint;
      this.prev[i] = now;
    }
    // left stick: analog movement; sprint stays latched until the stick comes back
    const [mx, my, mk] = stick(ax[0] || 0, ax[1] || 0);
    inp.pad = { x: mx, y: -my };
    if (mk < 0.3) this.sprint = false;
    this.key('ShiftLeft', this.sprint);
    // right stick: look, an expo curve (fine aim near the middle, quick turns at the edge)
    const [lx, ly, lk] = stick(ax[2] || 0, ax[3] || 0);
    if (lk > 0) {
      const c = Math.pow(lk, 2.2) / lk;
      inp.look.dx += lx * c * LOOK_RATE * dt;
      inp.look.dy += ly * c * LOOK_RATE * 0.75 * dt;
    }
    if (mk > 0 || lk > 0) used = true;
    if (used) inp.padActive = true;
  }
}
