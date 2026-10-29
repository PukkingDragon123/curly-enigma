// Pointer, touch and keys → one minigame input per frame:
//   { grip, pull (0..1.45), wx (-1..1 sideways), vx (screen widths/s, negative = toward the peel), tap }
// Mouse with the pointer locked (desktop first person): hold the button and move the mouse, the
// movement accumulates like a drag. Free pointer / touch: press anywhere and drag. Keys: Space/E
// grip (hold), W/S or ↑/↓ more/less pull, A/D or ←/→ wiggle (or lean), and for picking any of
// Space / E / Enter / click / tap.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const KEYS = ['Space', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'Enter'];

export class GatherInput {
  /** o: { down: pull down (ceiling plants), tech, onAny() } */
  constructor(o = {}) {
    this.o = o;
    this.keys = new Set();
    this.ptr = null; // { id, ox, oy, x, y, ax, ay, locked }
    this.kPull = 0; this.kWx = 0; this.kv = 0; this.kSide = 1; this.kT = 0;
    this.tapQ = false;
    this.anyQ = false;
    this.lastMove = null;
    this.vxS = 0;
    this.on = false;
  }
  get locked() { return !!document.pointerLockElement; }
  attach(target) {
    this.target = target;
    const down = (e) => {
      if (e.target?.closest?.('.gt-btn')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault?.();
      this.anyQ = true;
      this.tapQ = true;
      if (this.ptr) return;
      this.ptr = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, ax: 0, ay: 0, locked: this.locked, lx: e.clientX, t: performance.now() };
      try { if (!this.locked && e.pointerId !== undefined) target.setPointerCapture?.(e.pointerId); } catch (err) { /* noop */ }
    };
    const move = (e) => {
      const p = this.ptr;
      if (this.locked) {
        const mx = e.movementX || 0, my = e.movementY || 0;
        if (p) {
          p.ax += mx; p.ay += my;
          // wiggles: the sideways drag is held to a short range so turning back counts at once
          const lim = innerWidth * 0.1;
          p.ax = clamp(p.ax, -lim, lim);
        }
        this.lastMove = { dx: mx, t: performance.now() };
        return;
      }
      if (!p || (e.pointerId !== undefined && p.id !== undefined && e.pointerId !== p.id)) return;
      const dx = e.clientX - p.x;
      p.x = e.clientX; p.y = e.clientY;
      p.ax = clamp(p.ax + dx, -innerWidth * 0.1, innerWidth * 0.1);
      p.ay = e.clientY - p.oy;
      this.lastMove = { dx, t: performance.now() };
    };
    const up = (e) => {
      const p = this.ptr;
      if (!p) return;
      if (!this.locked && e.pointerId !== undefined && p.id !== undefined && e.pointerId !== p.id) return;
      this.ptr = null;
    };
    const kd = (e) => {
      if (KEYS.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.anyQ = true;
      if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') this.tapQ = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.kSide = -1;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.kSide = 1;
    };
    const ku = (e) => this.keys.delete(e.code);
    const blur = () => { this.keys.clear(); this.ptr = null; };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    this.detach = () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
  }

  /** This frame's input (dt for the keyboard ramps). */
  read(dt) {
    const k = this.keys, p = this.ptr;
    const H = innerHeight, W = innerWidth;
    const touch = document.documentElement.classList.contains('is-touch');
    const kGrip = k.has('Space') || k.has('KeyE') || k.has('Enter');
    const up = k.has('KeyW') || k.has('ArrowUp'), dn = k.has('KeyS') || k.has('ArrowDown');
    const lf = k.has('KeyA') || k.has('ArrowLeft'), rt = k.has('KeyD') || k.has('ArrowRight');
    let grip = !!p, pull = 0, wx = 0, vx = 0;
    const flip = this.o.down ? -1 : 1;
    if (p) {
      const range = H * (touch ? 0.3 : 0.34);
      pull = clamp((-p.ay * flip) / range * (p.locked ? 1.15 : 1), 0, 1.45);
      wx = clamp(p.ax / (W * 0.085), -1, 1);
    }
    // the drag speed along the peel (from the last moves)
    const lm = this.lastMove;
    // (in "work widths" of 40% of the screen: the old overlay's scale, so a peel is a comfortable swipe)
    const v = lm && performance.now() - lm.t < 90 ? (lm.dx / (W * 0.4)) / Math.max(dt, 1 / 120) * (p?.locked ? 1.2 : 1) : 0;
    this.vxS += (v - this.vxS) * Math.min(1, dt * 14);
    if (p) vx = this.vxS;
    this.lastMove = null;
    // keyboard
    if (kGrip || (this.o.tech === 'peel' && lf)) {
      grip = true;
      this.kPull = clamp(this.kPull + ((up ? 0.9 : 0) - (dn ? 1.3 : 0)) * dt, 0, 1.45);
      if (this.o.tech === 'lift' && !up && !dn) this.kPull = clamp(this.kPull, 0, 1.2);
      pull = Math.max(pull, this.kPull);
      // wiggle: holding A or D swings that way; tapping them alternately wiggles
      const tw = lf && !rt ? -0.95 : rt && !lf ? 0.95 : 0;
      this.kWx += (tw - this.kWx) * Math.min(1, dt * 16);
      if (Math.abs(this.kWx) > Math.abs(wx)) wx = this.kWx;
      if (this.o.tech === 'peel') { this.kv = lf ? Math.min(0.32, this.kv + dt * 0.7) : Math.max(0, this.kv - dt * 2.5); vx = -this.kv; }
    } else { this.kPull = Math.max(0, this.kPull - dt * 2); this.kv = 0; this.kWx *= Math.exp(-dt * 10); }
    const tap = this.tapQ;
    this.tapQ = false;
    return { grip, pull, wx, vx, tap };
  }
  takeAny() { const a = this.anyQ; this.anyQ = false; return a; }
  clear() { this.keys.clear(); this.ptr = null; this.tapQ = false; this.anyQ = false; }
}
