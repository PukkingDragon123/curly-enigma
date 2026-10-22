// The opening's on-screen words: Old Star's speech bubble (parchment and ink like the game's own
// bubbles, anchored above his helmet; when he is off screen it waits at the edge with an arrow
// toward him) and a small objective tag under the top of the screen. Plain DOM in the UI's world
// layer (cleared on every scene change); styles are injected once.
import * as THREE from 'three';

const CSS = `
.os-say { position: absolute; left: 0; top: 0; z-index: 3; pointer-events: none;
  width: max-content; max-width: min(calc(var(--px) * 118), 74vw); box-sizing: border-box;
  background: #fff8ea; color: var(--ink); font-family: var(--font); font-size: 16px; line-height: 1.32; text-align: left;
  padding: calc(var(--px) * 2.5) calc(var(--px) * 4) calc(var(--px) * 3);
  box-shadow: 0 calc(var(--px) * -1) 0 var(--ink), 0 var(--px) 0 var(--ink), calc(var(--px) * -1) 0 0 var(--ink), var(--px) 0 0 var(--ink),
    0 calc(var(--px) * 2) 0 rgba(0, 0, 0, .3), inset 0 calc(var(--px) * -1) 0 #e8d8b8;
  transform: translate(-50%, -100%); transition: opacity .2s; opacity: 0; text-wrap: pretty; }
.os-say.on { opacity: 1; }
.os-say b.os-name { display: block; color: #9a5a2a; font-weight: 400; margin-bottom: calc(var(--px) * .5); }
.os-say b.os-name::before { content: '\\2605 '; color: #e8607e; }
.os-say kbd { font-size: .8em; }
.os-say .os-tail, .os-say .os-tail2 { position: absolute; left: 50%; background: #fff8ea; }
.os-say .os-tail { bottom: calc(var(--px) * -4); width: calc(var(--px) * 4); height: calc(var(--px) * 3); margin-left: calc(var(--px) * -2);
  box-shadow: calc(var(--px) * -1) 0 0 var(--ink), var(--px) 0 0 var(--ink); }
.os-say .os-tail2 { bottom: calc(var(--px) * -6); width: calc(var(--px) * 2); height: calc(var(--px) * 2); margin-left: calc(var(--px) * -1);
  box-shadow: 0 var(--px) 0 var(--ink), calc(var(--px) * -1) 0 0 var(--ink), var(--px) 0 0 var(--ink); }
.os-say.edge .os-tail, .os-say.edge .os-tail2 { display: none; }
.os-say .os-arrow { display: none; position: absolute; top: 50%; margin-top: -0.6em; color: #e8607e; font-style: normal; text-shadow: 0 var(--px) 0 var(--ink); }
.os-say.edge-l .os-arrow { display: block; left: -1.1em; }
.os-say.edge-r .os-arrow { display: block; right: -1.1em; }
.os-goal { position: absolute; left: 50%; top: calc(var(--sat) + var(--px) * 34); transform: translateX(-50%); z-index: 2; pointer-events: none;
  font-family: var(--font); font-size: 16px; color: #f6ead0; white-space: nowrap; padding: var(--px) calc(var(--px) * 4);
  background: rgba(30, 18, 12, .72); box-shadow: 0 0 0 var(--px) rgba(246, 234, 208, .25); transition: opacity .3s, transform .3s; }
.os-goal::before { content: '\\2605 '; color: #f2c23a; }
.os-goal.off { opacity: 0; transform: translateX(-50%) translateY(calc(var(--px) * -3)); }
.os-goal.done { color: #b8f09a; }
.os-guard { position: absolute; right: calc(var(--sar) + 118px); bottom: calc(var(--sab) + 196px); z-index: 4; width: 64px; height: 64px;
  border-radius: 50%; border: 3px solid #3a2212; background: radial-gradient(circle at 40% 35%, #b88a4a, #7a5228); color: #fff4dc;
  display: grid; place-items: center; font-family: var(--font); line-height: 1; box-shadow: 0 3px 0 rgba(0,0,0,.45); touch-action: none; padding: 0; }
.os-guard span { font-size: 28px; margin-top: 4px; }
.os-guard small { font-size: 10px; margin-top: -6px; }
.os-guard.on { transform: translateY(2px); background: radial-gradient(circle at 40% 35%, #e8c070, #a07030); box-shadow: 0 1px 0 rgba(0,0,0,.45); }
@media (max-width: 900px), (max-height: 600px) {
  .os-say, .os-goal { font-size: 16px; }
  .os-goal { top: calc(var(--sat) + var(--px) * 90); white-space: normal; text-align: center; max-width: 76vw; }
}
@media (min-width: 1700px) and (min-height: 1000px) { .os-say, .os-goal { font-size: 24px; } }
`;

let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.dataset.owner = 'prologue';
  s.textContent = CSS;
  document.head.append(s);
}

const _v = new THREE.Vector3(), _c = new THREE.Vector3();

export class Talk {
  /** ui: the game UI (its world layer holds the nodes); engine: for the screen size. */
  constructor(ui, engine, name) {
    style();
    this.ui = ui;
    this.engine = engine;
    const layer = ui.world || document.body;
    this.el = document.createElement('div');
    this.el.className = 'os-say';
    this.el.setAttribute('role', 'status');
    this.el.innerHTML = `<b class="os-name">${name}</b><span class="os-text"></span><i class="os-tail"></i><i class="os-tail2"></i><i class="os-arrow"></i>`;
    this.text = this.el.querySelector('.os-text');
    this.arrow = this.el.querySelector('.os-arrow');
    this.goalEl = document.createElement('div');
    this.goalEl.className = 'os-goal off';
    layer.append(this.el, this.goalEl);
    this.t = 0;
    this.dur = 0;
    this.goalText = '';
  }

  /** Show a line for dur seconds. */
  show(html, dur) {
    this.text.innerHTML = html;
    this.t = 0;
    this.dur = dur;
    this.el.classList.add('on');
  }
  hide() { this.dur = 0; this.el.classList.remove('on'); }
  get showing() { return this.dur > 0 && this.t < this.dur; }

  /** The objective (empty hides it). done: a green tick look for a moment. */
  goal(text, done = false) {
    if (text === this.goalText && !done) return;
    this.goalText = text;
    this.goalEl.classList.toggle('done', done);
    if (!text) { this.goalEl.classList.add('off'); return; }
    this.goalEl.textContent = text;
    this.goalEl.classList.remove('off');
  }

  /** Per frame: count down, and pin the bubble over the world point (or to the screen edge). */
  update(dt, world, camera) {
    if (this.dur > 0) {
      this.t += dt;
      if (this.t >= this.dur) this.hide();
    }
    if (!this.el.classList.contains('on')) return;
    const e = this.engine, W = e.width * e.scale, H = e.height * e.scale;
    camera.updateMatrixWorld();
    _c.copy(world).applyMatrix4(camera.matrixWorldInverse); // camera space: -z is ahead
    const ahead = _c.z < -0.05;
    let sx, sy, edge = 0;
    if (ahead) {
      _v.copy(world).project(camera);
      sx = (_v.x * 0.5 + 0.5) * W;
      sy = (-_v.y * 0.5 + 0.5) * H;
    }
    const bw = this.el.offsetWidth || 200, bh = this.el.offsetHeight || 60;
    // never over the objective tag
    let top = Math.min(H * 0.3, 96);
    if (this.goalText) { this.goalT = (this.goalT || 0) - dt; if (this.goalT <= 0 || !this.goalBottom) { this.goalT = 0.5; this.goalBottom = this.goalEl.getBoundingClientRect().bottom - (this.el.parentElement?.getBoundingClientRect().top || 0); } top = Math.max(top, this.goalBottom + 10); }
    const mx = 10;
    if (!ahead || sx < bw * 0.15 || sx > W - bw * 0.15) {
      // off screen: wait at the side he is on, a little above the middle
      edge = !ahead ? (_c.x < 0 ? -1 : 1) : sx < W / 2 ? -1 : 1;
      sx = edge < 0 ? mx + bw / 2 + 14 : W - mx - bw / 2 - 14;
      sy = Math.max(top + bh, H * 0.42);
    }
    sx = Math.max(mx + bw / 2, Math.min(W - mx - bw / 2, sx));
    sy = Math.max(top + bh, Math.min(H - 120, sy));
    this.el.classList.toggle('edge', !!edge);
    this.el.classList.toggle('edge-l', edge < 0);
    this.el.classList.toggle('edge-r', edge > 0);
    this.arrow.textContent = edge < 0 ? '◀' : edge > 0 ? '▶' : '';
    this.el.style.left = Math.round(sx) + 'px';
    this.el.style.top = Math.round(sy) + 'px';
  }

  dispose() {
    this.el.remove();
    this.goalEl.remove();
  }
}
