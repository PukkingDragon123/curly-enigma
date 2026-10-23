// The pause menu (Esc, ui.openMenu): carved signs drop down from the cave roof on chains over the
// dimmed scene: Resume, Book, Settings, Save & Quit, under a "Paused" banner. A brass tag at the
// bottom shows the save stone in use (slot, gem, completion) and the day.
// Also the Settings board shared with the title screen: openSettings(game).
//   openPauseMenu(game) → panel handle
//   openSettings(game, { onClose }) → panel handle
import { el } from '../core/util.js';
import { makeSignMenu } from './signs.js';
import { formatPlayTime } from '../core/saves.js';
import './choices.css';

const GEM_NAMES = ['Ruby', 'Emerald', 'Sapphire'];
const GEM_COL = ['#f04652', '#3ccc74', '#4a98ff'];

const CSS = /* css */`
.modal-back.pm-back { background: radial-gradient(ellipse at 50% 30%, rgba(40, 18, 10, .35), rgba(6, 3, 6, .82)); padding: 0; place-items: stretch; }
.modal-back.pm-back.closing > * { animation: none; }
.modal-back > .panel.sheet.pm-panel, .modal-back > .panel.pm-panel { position: absolute; inset: 0; width: auto; max-width: none; max-height: none; margin: 0; padding: 0;
  border: 0; background: none; filter: none; box-shadow: none; pointer-events: none; overflow: hidden; }
.modal-back > .panel.sheet.pm-panel::before { display: none; }
.pm-panel > .close { display: none; }
.pm-col { position: absolute; left: 0; right: 0; top: 0; display: flex; flex-direction: column; align-items: center; pointer-events: none; }
.pm-tag { position: absolute; left: 50%; bottom: calc(var(--px) * 6 + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); display: flex; align-items: center; gap: calc(var(--px) * 3);
  color: #fbeedc; font-size: var(--fs-ui); white-space: nowrap; pointer-events: none; animation: pmUp .5s .25s cubic-bezier(.2,1.3,.4,1) both;
  padding: calc(var(--px) * 1.5) calc(var(--px) * 5); background: rgba(20, 10, 8, .55); box-shadow: 0 0 0 var(--px) rgba(255, 220, 160, .18); }
.pm-tag i { width: calc(var(--px) * 4); height: calc(var(--px) * 4); transform: rotate(45deg); background: var(--gc); box-shadow: 0 0 0 var(--px) #1a0c08, 0 0 calc(var(--px) * 4) var(--gc); }
.pm-tag b { color: var(--gc); font-weight: 400; }
.pm-tag .dot { opacity: .5; }
.pm-hint { position: absolute; right: calc(var(--px) * 6); bottom: calc(var(--px) * 6); font-size: .7em; color: #e8d0b0; opacity: .7; pointer-events: none; }
.is-touch .pm-hint { display: none; }
@keyframes pmUp { from { transform: translate(-50%, calc(var(--px) * 12)); opacity: 0; } }
/* settings */
.pm-set { display: flex; flex-direction: column; gap: calc(var(--px) * 3.5); min-width: min(calc(var(--px) * 118), 82vw); }
.pm-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: calc(var(--px) * 4); }
.pm-row > span:first-child { white-space: nowrap; }
.pm-val { display: flex; align-items: center; gap: calc(var(--px) * 2); }
.pm-num { min-width: 3ch; text-align: right; font-variant-numeric: tabular-nums; color: var(--ink-soft); }
.pm-slider { -webkit-appearance: none; appearance: none; width: calc(var(--px) * 58); height: calc(var(--px) * 10); background: transparent; cursor: pointer; margin: 0; touch-action: none; }
.pm-slider::-webkit-slider-runnable-track { height: calc(var(--px) * 4); background: #482b15; box-shadow: 0 0 0 var(--px) #a06c3c, inset 0 var(--px) 0 #26160c; }
.pm-slider::-moz-range-track { height: calc(var(--px) * 4); background: #482b15; box-shadow: 0 0 0 var(--px) #a06c3c, inset 0 var(--px) 0 #26160c; }
.pm-slider::-webkit-slider-thumb { -webkit-appearance: none; width: calc(var(--px) * 8); height: calc(var(--px) * 12); margin-top: calc(var(--px) * -4); border: 0;
  background: linear-gradient(#ffe8a0 0 var(--px), #e0b040 var(--px) calc(100% - var(--px) * 2), #8a5a1a calc(100% - var(--px) * 2)); box-shadow: 0 0 0 var(--px) #3a2210; }
.pm-slider::-moz-range-thumb { width: calc(var(--px) * 8); height: calc(var(--px) * 12); border: 0; border-radius: 0; background: #e0b040; box-shadow: 0 0 0 var(--px) #3a2210; }
.pm-slider:focus-visible { outline: var(--px) solid var(--gold); outline-offset: var(--px); }
.pm-opts { display: flex; gap: calc(var(--px) * 1.5); }
.pm-opts button { font: inherit; font-size: .85em; cursor: pointer; padding: calc(var(--px) * 1) calc(var(--px) * 3); color: var(--ink-soft); background: var(--parch-2);
  border: 0; box-shadow: 0 0 0 var(--px) var(--wood-dk), inset 0 calc(var(--px) * -1) 0 rgba(0, 0, 0, .15); }
.pm-opts button.on { color: #fff3e0; background: #3d6a30; box-shadow: 0 0 0 var(--px) #1a3014, inset 0 calc(var(--px) * -1) 0 rgba(0, 0, 0, .3); }
.pm-lever { position: relative; width: calc(var(--px) * 22); height: calc(var(--px) * 10); padding: 0; border: 0; cursor: pointer; background: #482b15; box-shadow: 0 0 0 var(--px) #26160c, inset 0 var(--px) 0 #26160c; }
.pm-lever::after { content: ''; position: absolute; top: var(--px); left: var(--px); width: calc(var(--px) * 10); height: calc(var(--px) * 8); background: #e0b040; box-shadow: inset 0 var(--px) 0 #ffe8a0, inset 0 calc(var(--px) * -1) 0 #8a5a1a; transition: left .15s; }
.pm-lever.on { background: #3d6a30; box-shadow: 0 0 0 var(--px) #1a3014, inset 0 var(--px) 0 #1a3014; }
.pm-lever.on::after { left: calc(100% - var(--px) * 11); }
.pm-note { margin: 0; font-size: .75em; color: var(--ink-soft); }
@media (pointer: coarse) { .pm-opts button { min-height: 36px; } .pm-lever { min-height: 30px; } }
/* the settings board: brass name plates and wooden switches on dark wood */
.modal-back > .panel.tk-panel.pm-setpanel { width: min(calc(100vw - 16px - var(--sal) - var(--sar)), calc(var(--px) * 150)); }
.pm-board .tk-board { padding: calc(var(--px) * 11) calc(var(--px) * 6) calc(var(--px) * 5); }
.pm-board .pm-set { min-width: 0; gap: calc(var(--px) * 5); }
.pm-board .pm-row > span:first-child { justify-self: start; padding: var(--px) calc(var(--px) * 4) calc(var(--px) * 1.5); color: #4a2c0a; line-height: 1;
  background: linear-gradient(to bottom, #fff3c0 0 var(--px), #f2c96a var(--px) calc(100% - var(--px) * 2), #a8772c calc(100% - var(--px) * 2));
  box-shadow: 0 0 0 var(--px) #3a2410, 0 calc(var(--px) * 2) 0 var(--px) rgba(0, 0, 0, .35); }
.pm-board .pm-num { min-width: 4ch; text-align: center; color: var(--ink); background: #f8ecd2; padding: var(--px) var(--px) 0; line-height: 1; box-shadow: 0 0 0 var(--px) var(--paper-edge); }
.pm-board .pm-slider::-webkit-slider-runnable-track { background: #26160c; box-shadow: 0 0 0 var(--px) #c08a52, 0 calc(var(--px) * 2) 0 var(--px) rgba(0, 0, 0, .3), inset 0 var(--px) 0 #000; }
.pm-board .pm-slider::-moz-range-track { background: #26160c; box-shadow: 0 0 0 var(--px) #c08a52, inset 0 var(--px) 0 #000; }
.pm-board .pm-opts { gap: calc(var(--px) * 2); }
.pm-board .pm-opts button { font-size: 16px; line-height: 1; color: #f6e2c0; padding: calc(var(--px) * 1.5) calc(var(--px) * 3) calc(var(--px) * 2.5); text-shadow: 0 var(--px) 0 #2a160a;
  border: var(--px) solid transparent; border-image: var(--a-cut) 1 / var(--px) stretch; box-shadow: none;
  background: linear-gradient(to bottom, #b07a46 0 var(--px), #8a5a32 var(--px) calc(100% - var(--px) * 2), #5e3a1f calc(100% - var(--px) * 2)) padding-box; transition: transform .12s var(--pop); }
.pm-board .pm-opts button:hover { transform: translateY(calc(var(--px) * -1)); }
.pm-board .pm-opts button.on { color: var(--ink); text-shadow: none; box-shadow: none;
  background: linear-gradient(to bottom, #fff3c0 0 var(--px), #e8be5a var(--px) calc(100% - var(--px) * 2), #a8772c calc(100% - var(--px) * 2)) padding-box; }
.pm-board .pm-lever { box-shadow: 0 0 0 var(--px) #c08a52, inset 0 var(--px) 0 #000; background: #26160c; }
.pm-board .pm-lever.on { background: #3d6a30; box-shadow: 0 0 0 var(--px) #c08a52, inset 0 var(--px) 0 #1a3014; }
.pm-board .pm-note { text-align: center; font-size: 16px; color: #e8cfa0; text-shadow: 0 var(--px) 0 #1a0c04; }
@media (min-width: 1700px) and (min-height: 1000px) { .pm-board .pm-opts button, .pm-board .pm-note { font-size: 24px; } }
`;
let cssEl = null;
function css() {
  if (cssEl) return;
  cssEl = document.createElement('style');
  cssEl.id = 'pause-css';
  cssEl.textContent = CSS;
  document.head.append(cssEl);
}

// ------------------------------------------------------------------ settings
export function openSettings(game, { onClose } = {}) {
  css();
  const s = game.state.data.settings;
  const audio = game.audio;
  const slider = (label, key, apply) => {
    const num = el('span', { class: 'pm-num' }, String(Math.round((s[key] ?? 0) * 100)));
    const input = el('input', {
      class: 'pm-slider', type: 'range', min: 0, max: 1, step: 0.05, value: s[key] ?? 0, 'aria-label': label,
      oninput: (e) => { s[key] = parseFloat(e.target.value); num.textContent = String(Math.round(s[key] * 100)); apply(s[key]); },
      onchange: () => audio.play('ui_click'),
    });
    return el('label', { class: 'pm-row' }, [el('span', {}, label), el('span', { class: 'pm-val' }, [input, num])]);
  };
  const opts = (label, list, cur, apply) => {
    const btns = list.map(([v, l]) => {
      const b = el('button', { type: 'button', class: v === cur() ? 'on' : '', 'aria-pressed': v === cur() ? 'true' : 'false', onclick: () => {
        apply(v);
        audio.play('ui_click');
        for (const x of btns) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      } }, l);
      return b;
    });
    return el('div', { class: 'pm-row', role: 'group', 'aria-label': label }, [el('span', {}, label), el('div', { class: 'pm-opts' }, btns)]);
  };
  const lever = el('button', { class: 'pm-lever' + (s.shake > 0 ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': s.shake > 0 ? 'true' : 'false', 'aria-label': 'Screen shake', onclick: () => {
    s.shake = s.shake > 0 ? 0 : 1;
    lever.classList.toggle('on', s.shake > 0);
    lever.setAttribute('aria-checked', s.shake > 0 ? 'true' : 'false');
    audio.play('click');
  } });
  const body = el('div', { class: 'pm-set' }, [
    slider('Music', 'music', (v) => audio.setVolumes({ music: v })),
    slider('Sound', 'sfx', (v) => audio.setVolumes({ sfx: v })),
    opts('Pixels', [[-1, 'Fine'], [0, 'Normal'], [1, 'Chunky']], () => s.pixel || 0, (v) => { s.pixel = v; game.engine.setPixelOffset(v); }),
    opts('Shaders', [['high', 'Fancy'], ['low', 'Simple'], ['off', 'Off']], () => game.engine.fx, (v) => game.engine.setFx(v)),
    el('div', { class: 'pm-row' }, [el('span', {}, 'Screen shake'), lever]),
    el('p', { class: 'pm-note' }, 'Settings are kept with your save.'),
  ]);
  // a wooden control board under a hanging sign (the board styles live in ui/choices.css)
  const board = el('div', { class: 'tk pm-board' }, [
    el('div', { class: 'tk-sign' }, [el('i', { class: 'tk-chain l' }), el('i', { class: 'tk-chain r' }), el('h2', {}, 'Settings')]),
    el('div', { class: 'tk-board' }, [body]),
  ]);
  const h = game.ui.openPanel({ body: board, className: 'tk-panel pm-setpanel', onClose: () => { if (game.state.hasSave()) game.state.save(); onClose?.(); } });
  if (!document.documentElement.classList.contains('is-touch')) setTimeout(() => body.querySelector('input')?.focus({ preventScroll: true }), 40);
  return h;
}

// ------------------------------------------------------------------ pause
export function openPauseMenu(game) {
  css();
  const ui = game.ui, st = game.state;
  const col = el('div', { class: 'pm-col' });
  const slot = st.slot ?? 0;
  const pct = st.completion ? st.completion() : 0;
  const tag = el('div', { class: 'pm-tag bk-outline' }, [
    el('i'), el('span', {}, `Save stone ${slot + 1}`), el('b', {}, `${GEM_NAMES[slot] || ''} ${pct}%`), el('span', { class: 'dot' }, '·'),
    el('span', {}, `Day ${st.data.day}`), el('span', { class: 'dot' }, '·'), el('span', {}, formatPlayTime(st.data.playTime)),
  ]);
  tag.style.setProperty('--gc', GEM_COL[slot] || '#f2c23a');
  const hint = el('div', { class: 'pm-hint bk-outline' }, [el('kbd', {}, 'Esc'), ' resume']);
  const box = el('div', { class: 'pm-box' }, [col, tag, hint]);
  let menu = null;
  let leaving = false;
  const h = ui.openPanel({ body: box, className: 'pm-panel', onClose: () => { menu?.destroy(); } });
  h.kind = 'pause';
  h.back.classList.add('pm-back');
  const close = () => { if (!h.closed) h.close(); };
  const short = window.innerHeight < 480;
  const items = [
    !short ? { label: 'Paused', header: true } : null,
    { label: 'Resume', primary: true, onClick: () => close() },
    { label: 'Book', onClick: () => { close(); if (ui.openBook) ui.openBook(); else ui.openIndex(); } },
    { label: 'Settings', onClick: () => openSettings(game, { onClose: () => setTimeout(() => menu?.focus(1), 30) }) },
    { label: 'Save & Quit', tone: 'red', onClick: () => {
      if (leaving) return;
      leaving = true;
      const ok = st.save();
      game.audio.play(ok ? 'success' : 'ui_error');
      if (!ok) { ui.toast('Could not save!', { kind: 'bad' }); leaving = false; return; }
      ui.toast('Game saved', { kind: 'good', dur: 1400 });
      menu?.raise(true);
      setTimeout(() => { close(); game.goto('title'); }, 380);
    } },
  ].filter(Boolean);
  // the panel must be in the page before the signs measure it
  requestAnimationFrame(() => {
    if (h.closed) return;
    const top = el('div', { style: { height: `calc(var(--px) * ${short ? 4 : 10})` } });
    col.append(top);
    const slotEl = el('div');
    col.append(slotEl);
    menu = makeSignMenu(slotEl, items, {
      audio: game.audio, layer: h.el, mount: 'ceiling', top: short ? 6 : 14, gap: 6, columns: short ? 2 : 1, label: 'Pause menu',
      onEscape: () => close(),
    });
    h.signs = menu; // tests: h.signs.step(dt, n)
  });
  game.audio.play('ui_open');
  return h;
}
