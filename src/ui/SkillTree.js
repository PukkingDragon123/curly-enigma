// The skill tree (ui.openSkills(), and the same map as the book's Skills tab via renderSkills):
// since wave 16 a pan-and-zoom root map on old parchment (ui/skillMap.js): six lines, ~60 knots,
// crisp icons, a tag with name + one line on hover / tap, learning pops the knot and lights the root.
// Also the feedback that works anywhere (installSkillFeedback): XP plaque, level-up toasts, perk
// notes and a gentle nudge to spend points.
//   renderSkills(host, game, { line, standalone }) → { el, dispose(), select(id), stamp(id), line(id),
//     layout(), escape(), zoom(z), selected }
//   openSkills(game, line?) → panel handle (.debug = the map's controller)
import { el } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { LINE } from '../data/skills.js';
import { lineInfo } from '../core/skills.js';
import { lineSealURL, lineBigURL, tokenURL } from './skillArt.js';
import { DL, installDialogArt } from './dialogArt.js';
import { bindCover } from './tomeFx.js'; // the Wave 9 book kit (iron corners and clasps)
import { renderMap } from './skillMap.js';
import { installSkillChrome } from './skillChrome.js'; // the brass frame round the standalone board
import './skilltree.css';

const isTouch = () => document.documentElement.classList.contains('is-touch');

// ------------------------------------------------------------------ sounds
export function defineSkillSounds(au) {
  if (!au?.define || au.presets?.sk_stamp) return;
  const R = (a, b) => a + Math.random() * (b - a);
  au.define('sk_stamp', (a) => {
    a.noise({ color: 'brown', filter: 'lowpass', f: 420, f2: 90, dur: 0.2, vol: 0.5 });
    a.tone({ f: 150, f2: 70, type: 'triangle', dur: 0.1, vol: 0.22 });
    a.noise({ color: 'pink', filter: 'bandpass', f: 900, f2: 260, q: 1.2, dur: 0.14, a: 0.01, vol: 0.16, delay: 0.025 });
    a.tone({ f: R(1700, 1900), type: 'sine', dur: 0.25, vol: 0.035, delay: 0.14, reverb: 0.45 });
    a.tone({ f: R(2500, 2700), type: 'sine', dur: 0.2, vol: 0.025, delay: 0.2, reverb: 0.45 });
  }, 0.08);
  au.define('sk_ink', (a) => {
    for (let i = 0; i < 3; i++) a.noise({ color: 'white', filter: 'bandpass', f: R(2600, 3400), f2: R(1500, 2000), q: 2.2, dur: 0.09, a: 0.01, vol: 0.05, delay: i * 0.09 });
  }, 0.1);
  au.define('sk_pick', (a) => { a.tone({ f: 620, f2: 540, type: 'triangle', dur: 0.04, vol: 0.06 }); a.noise({ color: 'pink', filter: 'highpass', f: 3000, dur: 0.03, vol: 0.03 }); }, 0.04);
  au.define('sk_level', (a) => {
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    [67, 71, 74, 79, 83].forEach((m, i) => a.tone({ f: mf(m), type: 'triangle', dur: 0.11, vol: 0.07, delay: i * 0.065, reverb: 0.3 }));
    a.tone({ f: mf(91), type: 'sine', dur: 0.7, vol: 0.05, delay: 0.34, reverb: 0.6 });
    a.tone({ f: mf(86), type: 'sine', dur: 0.6, vol: 0.035, delay: 0.38, reverb: 0.6 });
    a.noise({ color: 'brown', filter: 'lowpass', f: 380, f2: 90, dur: 0.18, vol: 0.32, delay: 0.33 });
  }, 0.5);
  au.define('sk_xp', (a) => { a.tone({ f: R(1300, 1500), type: 'sine', dur: 0.06, vol: 0.025 }); a.noise({ filter: 'highpass', f: 4000, dur: 0.03, vol: 0.02 }); }, 0.25);
  au.define('sk_scrape', (a) => {
    for (let i = 0; i < 4; i++) a.noise({ color: 'pink', filter: 'bandpass', f: R(1400, 2000), f2: R(500, 800), q: 1.4, dur: 0.12, a: 0.02, vol: 0.12, delay: i * 0.11 });
  }, 0.3);
  au.define('sk_points', (a) => {
    const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);
    [76, 81, 88].forEach((m, i) => a.tone({ f: mf(m), type: 'square', dur: 0.07, vol: 0.04, delay: i * 0.06, filter: 'lowpass', ff: 3000, reverb: 0.3 }));
  }, 0.3);
}

// ------------------------------------------------------------------ the board
// One line at a time (its tab in the header): the line's skills laid out left → right by tier (the
// level each needs, on the ruler along the top), five tracks deep, joined by brass pipes with
// elbows. Spending is two steps: click (or tap twice) to pencil a skill in, Undo / Confirm below.
// ------------------------------------------------------------------ the board (wave 16: the root map, ui/skillMap.js)
export function renderSkills(host, game, opts = {}) {
  defineSkillSounds(game.audio);
  return renderMap(host, game, opts);
}

export function openSkills(game, line) {
  const ui = game.ui;
  installSkillChrome();
  const wrap = el('div', { class: 'skt-wrap' });
  bindCover(wrap); // iron corners and clasps on the brass frame (src/ui/tomeFx.js)
  let ctl = null;
  const h = ui.openPanel({ body: wrap, className: 'skt-panel', onClose: () => ctl?.dispose() });
  h.kind = 'skills';
  ctl = renderSkills(wrap, game, { line, standalone: true });
  h.debug = ctl;
  h.onEscape = () => ctl.escape();
  return h;
}

// ------------------------------------------------------------------ feedback anywhere
export function installSkillFeedback(ui) {
  const game = ui.game, st = game.state;
  defineSkillSounds(game.audio);
  const openTree = (line) => {
    if (ui.panelStack?.length) return;
    game.audio.init?.();
    if (ui.openBook) ui.openBook('skills', { line });
    else ui.openSkills(line);
  };

  // ---- the level plaque (slides in by the left edge when a line learns something): a carved oak
  // plaque, the line's seal in a milled brass ring, its name and level, a brass-rimmed glass tube
  // the XP fills like liquid (a shine rolling over it, the new part glowing), a paper tag with +N.
  // Levelling up: a ribbon swings down ("Level up!"), the seal stamps, sparks burst, the tube floods.
  installDialogArt();
  const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
  const chipSeal = el('img', { class: 'pix', alt: '' });
  const chipMedal = el('div', { class: 'sk-chip-medal' }, [chipSeal]);
  const chipName = el('em');
  const chipLvN = el('span', { class: 'sk-chip-lv' });
  const chipFill = el('i', { class: 'sk-chip-fill' }, [el('i', { class: 'sk-chip-shine' })]);
  const chipGain = el('i', { class: 'sk-chip-gain' });
  const chipBar = el('div', { class: 'sk-chip-bar' }, [chipGain, chipFill, el('i', { class: 'sk-chip-glass' })]);
  const chipN = el('b', { class: 'sk-chip-n' });
  const chipRibbon = el('div', { class: 'sk-chip-ribbon' }, [el('span', {}, 'Level up!')]);
  const chipBurst = el('div', { class: 'sk-chip-burst' });
  const chip = el('div', { class: 'sk-chip', 'aria-hidden': 'true' }, [
    chipRibbon, chipMedal,
    el('div', { class: 'sk-chip-t' }, [el('div', { class: 'sk-chip-head' }, [chipName, chipLvN]), chipBar]),
    chipN, chipBurst,
  ]);
  ui.hud.append(chip);
  const acc = {};
  let chipT = 0, chipLine = null, chipShown = 0, chipFrac = 0, lvlT = 0;
  const burst = (host, n = 12, r = 22) => {
    host.textContent = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = r * (0.6 + Math.random() * 0.6);
      host.append(el('img', { class: 'pix sk-spark', src: DL.spark(i), alt: '', style: { '--dx': (Math.cos(a) * d).toFixed(1), '--dy': (Math.sin(a) * d).toFixed(1), '--sd': (Math.random() * 0.12).toFixed(2) + 's' } }));
    }
  };
  const setFill = (frac, instant = false) => {
    if (instant) { chipFill.style.transition = 'none'; chipFill.style.width = (frac * 100).toFixed(1) + '%'; void chipFill.offsetWidth; chipFill.style.transition = ''; }
    else chipFill.style.width = (frac * 100).toFixed(1) + '%';
  };
  const showChip = (line, n, lvl = false) => {
    const L = LINE[line];
    const info = lineInfo(st, line);
    const fresh = chipLine !== line || !chip.classList.contains('show');
    if (chipLine !== line) {
      chipSeal.src = lineSealURL(L);
      chip.style.setProperty('--lc', L.ink);
      chip.style.setProperty('--l1', hex(L.pal[0])); chip.style.setProperty('--l2', hex(L.pal[1])); chip.style.setProperty('--l3', hex(L.pal[2])); chip.style.setProperty('--l4', hex(L.pal[3]));
      chipShown = 0;
      setFill(info.frac, true);
      chipFrac = info.frac;
    }
    chipLine = line;
    chipShown += n;
    chipName.textContent = L.name;
    chipLvN.textContent = String(info.level);
    chipN.textContent = lvl ? `Lv ${info.level}!` : `+${Math.max(1, Math.round(chipShown))}`;
    clearTimeout(lvlT);
    if (lvl) {
      // the tube floods to the brim, flashes, and starts over at the new level
      setFill(1);
      lvlT = setTimeout(() => { chip.classList.add('flood'); setFill(info.frac, true); chipFrac = info.frac; setTimeout(() => chip.classList.remove('flood'), 500); }, 650);
      burst(chipBurst, 14, 24);
      chip.classList.remove('lvl'); void chip.offsetWidth;
    } else {
      // the new part glows where it came in
      const from = fresh ? Math.max(0, info.frac - 0.06) : chipFrac;
      if (info.frac > from) {
        chipGain.style.left = (from * 100).toFixed(1) + '%';
        chipGain.style.width = ((info.frac - from) * 100).toFixed(1) + '%';
        chipGain.classList.remove('on'); void chipGain.offsetWidth; chipGain.classList.add('on');
      }
      setFill(info.frac);
      chipFrac = info.frac;
    }
    chip.classList.add('show');
    chip.classList.toggle('lvl', lvl);
    chip.classList.remove('tick'); void chip.offsetWidth; chip.classList.add('tick');
    clearTimeout(chipT);
    chipT = setTimeout(() => { if (keepChip) return; chip.classList.remove('show'); chipShown = 0; }, lvl ? 3800 : 2600);
  };
  // test hook: ui.levelPlaque.show(line, n, levelUp), .keep(true) holds it up (screenshots)
  let keepChip = false;
  ui.levelPlaque = { el: chip, show: (line = 'mining', n = 10, lvl = false) => showChip(line, n, lvl), keep: (on = true) => { keepChip = !!on; if (!on) chip.classList.remove('show'); } };

  // ---- level-up card (a wooden plaque pinned to the toasts: a ribbon, the line's big seal stamping in, sparks)
  const levelToast = (e) => {
    const L = LINE[e.line];
    const big = e.level % 5 === 0;
    const sparks = el('div', { class: 'sk-chip-burst' });
    const t = el('div', { class: 'toast good sk-toast' + (big ? ' big' : ''), role: 'status', title: 'Open your skills' }, [
      el('div', { class: 'sk-toast-ribbon' }, [el('span', {}, big ? `Level ${e.level}!` : 'Level up!')]),
      el('div', { class: 'sk-toast-medal' }, [el('img', { class: 'pix sk-toast-seal', src: lineBigURL(L), alt: '' }), sparks]),
      el('span', { class: 'toast-text', html: `<b>${L.name}</b> is now <b>level ${e.level}</b>!<small>+${e.points} skill point${e.points > 1 ? 's' : ''} · ${isTouch() ? 'tap to spend' : '<kbd>B</kbd> to spend'}</small>` }),
    ]);
    t.style.setProperty('--lc', L.ink);
    t.addEventListener('click', () => openTree(e.line));
    ui.toasts.append(t);
    setTimeout(() => burst(sparks, big ? 16 : 10, big ? 30 : 22), 260);
    while (ui.toasts.children.length > 4) ui.toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 360); }, big ? 5200 : 4200);
  };

  // ---- the book button wears a little wax seal while points wait
  const badge = el('img', { class: 'pix sk-badge', src: tokenURL(), alt: '', hidden: true });
  const syncBadge = () => {
    const btn = ui.status?.bookBtn;
    if (btn && badge.parentNode !== btn) btn.append(badge);
    badge.hidden = !(st.skillPoints?.() > 0);
  };

  // ---- a gentle nudge now and then while points wait
  const nudge = () => {
    const s = st.data.skills;
    const n = s?.points || 0;
    if (!n || ui.hudMode === 'none' || ui.panelStack?.length || game.transitioning || st.unlocked?.('skills') === false) return; // [unlock guard]
    const t = ui.toast(`You have <b>${n} skill point${n > 1 ? 's' : ''}</b> to spend. ${isTouch() ? 'Tap here.' : 'Open your book (<kbd>B</kbd>).'}`, { icon: tokenURL(), dur: 4200 });
    t.classList.add('sk-nudge');
    t.addEventListener('click', () => openTree());
    s.nudge = st.data.playTime || 0;
    syncBadge();
    const btn = ui.status?.bookBtn;
    if (btn) { btn.classList.remove('ping'); void btn.offsetWidth; btn.classList.add('ping'); }
  };
  const NUDGE_EVERY = 300; // seconds of play
  const nudger = setInterval(() => {
    const s = st.data.skills;
    if (!s || !(s.points > 0)) return;
    const now = st.data.playTime || 0;
    if (now - Math.max(s.nudge || 0, s.opened || 0) >= NUDGE_EVERY) nudge();
  }, 5000);
  ui.skillNudge = { clear: () => { const s = st.data.skills; if (s) s.nudge = st.data.playTime || 0; syncBadge(); }, now: nudge, stop: () => clearInterval(nudger) };

  // ---- perks firing
  const lastPerk = {};
  st.on('skill', (e) => {
    if (st.unlocked?.('skills') === false) return; // [unlock guard] (the XP still counts; no plaque, no notes)
    if (e.type === 'xp') {
      acc[e.line] = (acc[e.line] || 0) + e.xp;
      if (acc[e.line] >= 4 || (chip.classList.contains('show') && chipLine === e.line)) {
        if (acc[e.line] >= 10) game.audio.play('sk_xp');
        showChip(e.line, acc[e.line]);
        acc[e.line] = 0;
      }
    } else if (e.type === 'level') {
      acc[e.line] = 0;
      showChip(e.line, 0, true);
      game.audio.play('sk_level');
      setTimeout(() => game.audio.play('sparkle', { vol: 0.6 }), 320);
      levelToast(e);
      const s = st.data.skills;
      if (s) s.nudge = st.data.playTime || 0; // the toast is the nudge
      syncBadge();
    } else if (e.type === 'points') {
      syncBadge();
      if (e.n > 0 && e.reason !== 'debug-quiet') {
        game.audio.play('sk_points');
        const t = ui.toast(`<b>+${e.n} skill point${e.n > 1 ? 's' : ''}</b>${e.reason && !/^debug/.test(e.reason) ? ` · ${e.reason}` : ''}`, { icon: tokenURL(), kind: 'good' });
        t?.classList.add('sk-nudge');
        t?.addEventListener('click', () => openTree());
      }
    } else if (e.type === 'perk') {
      const now = performance.now();
      if (e.quiet && now - (lastPerk[e.key] || 0) < 15000) return;
      lastPerk[e.key] = now;
      const icon = e.item && ITEMS[e.item] ? iconURL(e.item) : tokenURL();
      ui.toast(e.text, { icon, kind: 'good', dur: e.quiet ? 1800 : 2800 });
      game.audio.play(e.quiet ? 'toast' : 'sparkle');
    } else {
      syncBadge();
    }
  });
  st.on('load', () => syncBadge());
  setTimeout(syncBadge, 0);
}
