// The pause menu as the mole's little green journal: a handwritten to-do list on the left page,
// carved sliders and stamps for the settings on the right.
import { el } from '../core/util.js';

export function openJournal(game) {
  const st = game.state;
  const s = st.data.settings;
  const ui = game.ui;

  const item = (label, fn) => el('li', {}, [el('button', { onclick: (e) => fn(e.currentTarget) }, label)]);
  const mins = Math.floor(st.data.playTime / 60);
  const left = el('div', { class: 'ib-page ib-left' }, [
    el('h2', { class: 'jr-title' }, 'Paused'),
    el('div', { class: 'jr-sub' }, `Day ${st.data.day} · ${mins < 1 ? 'just started' : mins + ' min underground'}`),
    el('ul', { class: 'jr-menu' }, [
      item('Resume', () => h.close()),
      item('Save game', (b) => {
        const ok = st.save();
        b.classList.add('jr-saved');
        game.audio.play(ok ? 'success' : 'ui_error');
        ui.toast(ok ? 'Game saved' : 'Could not save', { kind: ok ? 'good' : 'bad' });
      }),
      item('Title screen', () => { h.close(); game.goto('title'); }),
    ]),
    el('p', { class: 'jr-note' }, 'Your game saves on its own every little while.'),
  ]);

  const slider = (label, val, on) => {
    const input = el('input', { class: 'jr-slider', type: 'range', min: 0, max: 1, step: 0.05, value: val, 'aria-label': label, oninput: (e) => on(parseFloat(e.target.value)) });
    input.addEventListener('change', () => game.audio.play('ui_click'));
    return el('label', { class: 'jr-row' }, [el('span', {}, label), input]);
  };
  const pixBtns = [[-1, 'Fine'], [0, 'Normal'], [1, 'Chunky']].map(([v, l]) => {
    const b = el('button', { class: s.pixel === v ? 'on' : '', onclick: () => {
      s.pixel = v;
      game.engine.setPixelOffset(v);
      game.audio.play('ui_click');
      for (const x of pixBtns) x.classList.toggle('on', x === b);
    } }, l);
    return b;
  });
  const lever = el('button', { class: 'jr-lever' + (s.shake > 0 ? ' on' : ''), role: 'switch', 'aria-checked': s.shake > 0 ? 'true' : 'false', 'aria-label': 'Screen shake', onclick: () => {
    s.shake = s.shake > 0 ? 0 : 1;
    lever.classList.toggle('on', s.shake > 0);
    lever.setAttribute('aria-checked', s.shake > 0 ? 'true' : 'false');
    game.audio.play('click');
  } });
  const right = el('div', { class: 'ib-page ib-right' }, [
    el('h3', { class: 'jr-h' }, 'Settings'),
    slider('Music', s.music, (v) => { s.music = v; game.audio.setVolumes({ music: v }); }),
    slider('Sound', s.sfx, (v) => { s.sfx = v; game.audio.setVolumes({ sfx: v }); }),
    el('div', { class: 'jr-row' }, [el('span', {}, 'Pixels'), el('div', { class: 'jr-opts' }, pixBtns)]),
    el('div', { class: 'jr-row' }, [el('span', {}, 'Screen shake'), lever]),
  ]);

  const book = el('div', { class: 'ib jr' }, [
    el('div', { class: 'ib-cover' }, [el('div', { class: 'ib-pages' }, [left, right])]),
    el('i', { class: 'jr-band' }),
  ]);
  game.audio.play('page');
  const h = ui.openPanel({ body: book, className: 'jr-panel' });
  if (!document.documentElement.classList.contains('is-touch')) setTimeout(() => left.querySelector('button')?.focus({ preventScroll: true }), 40);
  return h;
}
