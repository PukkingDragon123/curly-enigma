// Keyboard + mouse state with per-frame "just pressed" edges.
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.engine = engine;
    this.down = new Set();
    this.justDown = new Set();
    this.justUp = new Set();
    this.mouse = {
      x: 0, y: 0, // css px relative to canvas
      px: 0, py: 0, // internal low-res pixel coords
      nx: 0, ny: 0, // normalized device coords (-1..1, y up)
      buttons: [false, false, false],
      pressed: [false, false, false],
      released: [false, false, false],
      wheel: 0,
      moved: false,
    };
    this.typed = '';
    this.enabled = true;
    this.listeners = new Set();

    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      if (PREVENT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.justDown.add(e.code);
      this.down.add(e.code);
      if (e.key && e.key.length === 1) this.typed = (this.typed + e.key.toLowerCase()).slice(-24);
      for (const fn of this.listeners) fn(e);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.justUp.add(e.code);
    });
    window.addEventListener('blur', () => this.clearAll());

    const updatePos = (e) => {
      const r = canvas.getBoundingClientRect();
      const m = this.mouse;
      m.x = e.clientX - r.left;
      m.y = e.clientY - r.top;
      m.px = m.x / this.engine.scale;
      m.py = m.y / this.engine.scale;
      m.nx = (m.x / r.width) * 2 - 1;
      m.ny = -((m.y / r.height) * 2 - 1);
      m.moved = true;
    };
    window.addEventListener('pointermove', updatePos);
    canvas.addEventListener('pointerdown', (e) => {
      updatePos(e);
      canvas.focus({ preventScroll: true });
      const b = e.button === 2 ? 2 : e.button === 1 ? 1 : 0;
      this.mouse.buttons[b] = true;
      this.mouse.pressed[b] = true;
    });
    window.addEventListener('pointerup', (e) => {
      const b = e.button === 2 ? 2 : e.button === 1 ? 1 : 0;
      if (this.mouse.buttons[b]) this.mouse.released[b] = true;
      this.mouse.buttons[b] = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }

  clearAll() {
    this.down.clear();
    this.mouse.buttons = [false, false, false];
  }

  onKey(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  isDown(...codes) {
    if (!this.enabled) return false;
    for (const c of codes) if (this.down.has(c)) return true;
    return false;
  }

  pressed(...codes) {
    if (!this.enabled) return false;
    for (const c of codes) if (this.justDown.has(c)) return true;
    return false;
  }

  /** Swallow a just-pressed key so it can't trigger twice this frame. */
  consume(code) {
    this.justDown.delete(code);
  }

  released(...codes) {
    for (const c of codes) if (this.justUp.has(c)) return true;
    return false;
  }

  mouseDown(b = 0) { return this.enabled && this.mouse.buttons[b]; }
  mousePressed(b = 0) { return this.enabled && this.mouse.pressed[b]; }
  mouseReleased(b = 0) { return this.mouse.released[b]; }

  axisX() {
    return (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
  }

  axisY() {
    return (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0);
  }

  /** True once when the player has typed the given word (cheat codes / secrets). */
  consumeTyped(word) {
    if (this.typed.endsWith(word)) {
      this.typed = '';
      return true;
    }
    return false;
  }

  endFrame() {
    this.justDown.clear();
    this.justUp.clear();
    const m = this.mouse;
    m.pressed = [false, false, false];
    m.released = [false, false, false];
    m.wheel = 0;
    m.moved = false;
  }
}

function isTypingTarget(t) {
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable;
}
