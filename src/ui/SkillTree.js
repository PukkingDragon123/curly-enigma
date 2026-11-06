// The skill tree: a brass-framed board (ui.openSkills(), and the same board as the book's Skills tab
// via renderSkills). An ornate gold header with the line's round emblem and seven line tabs; the
// line's skills as framed tiles on dark leather, left → right by the level they need, joined by
// brass pipes with elbows (lit gold where learned). Skills you can't reach yet hang in chains with a
// padlock (the level they need engraved on it). Picking is pencilled in first: Undo / Confirm in
// the bottom bar ("N points left"); confirming lights the pipes, throws sparks, drops the chains.
// Hover (or tap) a skill for a parchment card: rank, effect now → next, cost, what it needs.
// Also the feedback that works anywhere (installSkillFeedback): XP ribbons, level-up toasts, perk
// notes and a gentle nudge to spend points.
//   renderSkills(host, game, { line, standalone }) → { el, dispose(), select(id), pick(id), unpick(id),
//     undo(), confirm(), stamp(id) (pick + confirm), line(id), layout(), escape(), pending, selected, current }
//   openSkills(game, line?) → panel handle (.debug = the board's controller)
import { el, makeRng } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { SKILL_LINES, LINE, NODE, SKILL_KEYS, TIER_LV, nodesOf, pointsForLevel } from '../data/skills.js';
import { canUnlock, unlock, respec, respecCost, spentIn, fxOf, lineInfo } from '../core/skills.js';
import { lineSealURL, lineBigURL, tokenURL } from './skillArt.js';
import { skillIconURL, lineIconURL } from './skillIcons.js';
import { SKC, installSkillChrome, paintPipes, FRAME_Y } from './skillChrome.js';
import { DL, installDialogArt } from './dialogArt.js';
import { put } from './common.js';
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
const COLW = 64, ROWH = 46, NW = 40, NH = 46, CY = FRAME_Y + 20, PAD_T = 14, PAD_B = 2, PAD_R = 6;
const TIER_NAME = ['Novice', 'Apprentice', 'Journeyman', 'Expert', 'Master'];
const pxVar = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
const hex6 = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
function* perms(a) {
  if (a.length <= 1) { yield a.slice(); return; }
  for (let i = 0; i < a.length; i++) for (const r of perms([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...r];
}

/** Pipe routes for a line: edges with polylines (art px), joints at the elbows. */
function routeLine(line, padL) {
  const ns = nodesOf(line);
  const colX = (t) => padL + t * COLW, rowY = (s) => PAD_T + s * ROWH;
  const edges = [];
  const gaps = new Map();
  for (const c of ns) for (const pid of c.req) {
    const p = NODE[pid];
    if (!p || p.line !== line) continue;
    const e = { p: p.id, c: c.id, straight: p.s === c.s };
    edges.push(e);
    if (!e.straight) { if (!gaps.has(c.t)) gaps.set(c.t, []); gaps.get(c.t).push(e); }
  }
  const lane = {};
  for (const [t, es] of gaps) {
    const parents = [...new Set(es.map((e) => e.p))];
    const span = {};
    for (const pid of parents) { const ys = [NODE[pid].s, ...es.filter((e) => e.p === pid).map((e) => NODE[e.c].s)]; span[pid] = [Math.min(...ys), Math.max(...ys)]; }
    const score = (perm) => {
      let sc = 0;
      perm.forEach((pid, i) => {
        const yp = NODE[pid].s;
        for (let j = 0; j < i; j++) { const [lo, hi] = span[perm[j]]; if (yp >= lo && yp <= hi) sc += yp > lo && yp < hi ? 1 : 2; }
        for (const e of es) {
          if (e.p !== pid) continue;
          const yc = NODE[e.c].s;
          for (let j = i + 1; j < perm.length; j++) {
            const q = perm[j], [lo, hi] = span[q];
            if (yc < lo || yc > hi || es.some((f) => f.p === q && f.c === e.c)) continue;
            sc += yc > lo && yc < hi ? 1 : 2;
          }
        }
      });
      return sc;
    };
    let best = parents.slice().sort((a, b) => NODE[a].s - NODE[b].s), bs = score(best);
    if (parents.length <= 5) for (const pm of perms(parents)) { const v = score(pm); if (v < bs) { bs = v; best = pm; } }
    const k = best.length;
    best.forEach((pid, i) => { lane[t + ':' + pid] = Math.round((i - (k - 1) / 2) * (k > 3 ? 5.5 : 6)); });
  }
  const joints = new Map();
  for (const e of edges) {
    const p = NODE[e.p], c = NODE[e.c];
    const x0 = colX(p.t) + NW, y0 = rowY(p.s) + CY, x3 = colX(c.t), y3 = rowY(c.s) + CY;
    if (e.straight) e.pts = [[x0, y0], [x3, y3]];
    else {
      const gx = colX(c.t) - (COLW - NW) / 2 + (lane[c.t + ':' + e.p] || 0);
      e.pts = [[x0, y0], [gx, y0], [gx, y3], [x3, y3]];
      for (const [x, y] of [[gx, y0], [gx, y3]]) { const key = x + ',' + y; if (!joints.has(key)) joints.set(key, { x, y, edges: [] }); joints.get(key).edges.push(e); }
    }
    e.len = e.pts.slice(1).reduce((t, q, i) => t + Math.abs(q[0] - e.pts[i][0]) + Math.abs(q[1] - e.pts[i][1]), 0);
  }
  return { edges, joints: [...joints.values()] };
}

export function renderSkills(host, game, opts = {}) {
  const st = game.state, ui = game.ui, au = game.audio;
  defineSkillSounds(au);
  installSkillChrome();
  const S = () => st.data.skills;
  const inBook = !opts.standalone;

  // ---------------- pending picks (pencilled in, not yet confirmed)
  let pend = [];
  let confirming = false;
  let V = null; // the state as it would be with the picks confirmed (for canUnlock)
  const pendCost = () => pend.reduce((t, id) => t + (NODE[id]?.cost || 0), 0);
  const recalc = () => {
    const s = S(), nodes = { ...s.nodes };
    for (const id of pend) nodes[id] = 'pending';
    V = { data: { skills: { ...s, nodes, points: s.points - pendCost() } } };
  };
  recalc();
  /** Drop picks that no longer stand (their way in was taken back, or the points went elsewhere). */
  const revalidate = () => {
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < pend.length; i++) {
        const keep = pend.slice(0, i);
        const s = S(), nodes = { ...s.nodes };
        for (const k of keep) nodes[k] = 'pending';
        const c = canUnlock({ data: { skills: { ...s, nodes, points: s.points - keep.reduce((t, k) => t + NODE[k].cost, 0) } } }, pend[i]);
        if (!c.ok) { pend.splice(i, 1); changed = true; break; }
      }
    }
    recalc();
  };
  /** How a node looks: done | pend | ready | open (needs points) | gated (needs level) | locked (path) | barred */
  const look = (id) => {
    if (S().nodes[id]) return { k: 'done' };
    if (pend.includes(id)) return { k: 'pend' };
    const c = canUnlock(V, id);
    if (c.ok) return { k: 'ready', c };
    if (c.code === 'barred') return { k: 'barred', c };
    if (c.code === 'path' || c.code === 'none') return { k: 'locked', c };
    if (c.code === 'level') return { k: 'gated', c };
    return { k: 'open', c };
  };
  const owned = (id) => (S().nodes[id] ? 'done' : pend.includes(id) ? 'pend' : null);
  const lineReady = (id) => nodesOf(id).some((n) => look(n.id).k === 'ready');
  let line = LINE[opts.line] ? opts.line : LINE[S().view] ? S().view : (SKILL_LINES.find((l) => lineReady(l.id)) || SKILL_LINES[0]).id;

  // ---------------- skeleton
  const emblemImg = el('img', { class: 'pix', alt: '' });
  const emblem = el('div', { class: 'skt-emblem' }, [emblemImg]);
  const titleSub = el('small');
  const title = el('div', { class: 'skt-title' }, [el('h2', {}, 'Skills'), titleSub]);
  const tabs = el('nav', { class: 'skt-tabs', role: 'tablist', 'aria-label': 'Skill lines' });
  const head = el('header', { class: 'skt-head' }, [emblem, title]);
  const cv = el('canvas', { class: 'skt-pipes' });
  const wm = el('i', { class: 'skt-wm' });
  const cols = el('div', { class: 'skt-cols' });
  const label = el('div', { class: 'skt-label' });
  const nodesEl = el('div', { class: 'skt-nodes' });
  const fxEl = el('div', { class: 'skt-fx' });
  const sheet = el('div', { class: 'skt-sheet' }, [wm, cv, cols, label, nodesEl, fxEl]);
  const board = el('div', { class: 'skt-board' }, [sheet]);
  const card = el('div', { class: 'skt-card' });
  const know = el('div', { class: 'skt-know' });
  const learn = el('div', { class: 'skt-learn' });
  const side = el('aside', { class: 'skt-side' }, [card, know, learn]);
  const main = el('div', { class: 'skt-main' }, [board, side]);
  const ptsN = el('b', {}, '0');
  const ptsL = el('span', {}, 'points left');
  const ptsS = el('span', { class: 'short' }, 'left');
  const ptsImg = el('img', { class: 'pix', alt: '' });
  const pts = el('div', { class: 'skt-pts', title: 'Skill points to spend' }, [ptsImg, ptsN, ptsL, ptsS]);
  const hint = el('span', { class: 'skt-hint' });
  const undoBtn = el('button', { class: 'skt-btn undo', type: 'button', title: 'Take back the last pick (Z)', onclick: () => undo() }, [el('i', { class: 'skt-ico' }), el('span', {}, 'Undo')]);
  const goBtn = el('button', { class: 'skt-btn go', type: 'button', title: 'Keep the picked skills (Enter)', onclick: () => confirm() }, [el('i', { class: 'skt-ico' }), el('span', {}, 'Confirm')]);
  const foot = el('footer', { class: 'skt-foot' }, [pts, hint, el('div', { class: 'skt-acts' }, [undoBtn, goBtn])]);
  const tip = el('div', { class: 'skt-tip', role: 'tooltip', hidden: true });
  const root = el('div', { class: 'skt' + (inBook ? ' in-book' : '') }, [head, tabs, main, foot, tip]);
  host.append(root);

  // ---------------- tabs
  const tabEls = {};
  for (const l of SKILL_LINES) {
    const b = el('button', { class: 'skt-tab', type: 'button', role: 'tab', 'data-line': l.id, title: l.name, 'aria-label': l.name, onclick: () => setLine(l.id) }, [
      el('img', { class: 'pix', src: lineIconURL(l.id), alt: '' }), el('b', { class: 'skt-tab-lv' }), el('i', { class: 'skt-tab-dot', hidden: true }),
    ]);
    b.style.setProperty('--lc', l.ink);
    tabEls[l.id] = b;
    tabs.append(b);
  }
  const renderTabs = () => {
    for (const l of SKILL_LINES) {
      const b = tabEls[l.id], on = l.id === line;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.querySelector('.skt-tab-lv').textContent = String(st.skillLevel(l.id));
      b.querySelector('.skt-tab-dot').hidden = !lineReady(l.id);
      b.classList.toggle('pend', pend.some((id) => NODE[id].line === l.id));
    }
  };
  const renderHead = () => {
    const L = LINE[line];
    emblemImg.src = lineIconURL(line);
    titleSub.textContent = `${L.name} · Lv ${st.skillLevel(line)}`;
    root.style.setProperty('--lc', L.ink);
    root.style.setProperty('--lt', hex6(L.pal[1]));
  };
  const renderPoints = (bump = false) => {
    const n = S().points - pendCost();
    ptsN.textContent = String(n);
    ptsL.textContent = n === 1 ? 'point left' : 'points left';
    ptsImg.src = SKC.token(n === 0);
    pts.classList.toggle('none', n === 0);
    if (bump) { pts.classList.remove('bump'); void pts.offsetWidth; pts.classList.add('bump'); }
    undoBtn.disabled = !pend.length;
    goBtn.disabled = !pend.length;
    foot.classList.toggle('pending', pend.length > 0);
    goBtn.querySelector('span').textContent = pend.length > 1 && root.dataset.mode !== 'narrow' ? `Confirm ${pend.length}` : 'Confirm';
  };

  // ---------------- side: the line's card, what you know (and what the picks add), how to learn
  const fmtFx = (k, v) => { const d = SKILL_KEYS[k]; return d ? d.fmt(v) : '+' + v; };
  const renderSide = () => {
    const L = LINE[line], info = lineInfo(st, line);
    card.innerHTML = '';
    const next = info.max ? 'Mastered' : `${Math.floor(info.into)} / ${info.need} XP`;
    put(card,
      el('div', { class: 'skt-card-top' }, [el('b', {}, L.name), el('span', { class: 'skt-lv' }, `Lv ${info.level}`)]),
      el('div', { class: 'skt-xp', title: next }, [el('i', { style: { width: (info.frac * 100).toFixed(1) + '%' } })]),
      el('small', { class: 'skt-card-next' }, [el('span', {}, info.max ? 'Every point this line can give, given.' : `Lv ${info.level + 1}: +${pointsForLevel(info.level + 1)} point${pointsForLevel(info.level + 1) > 1 ? 's' : ''}`), el('em', {}, next)]));
    know.innerHTML = '';
    const ids = nodesOf(line).map((n) => n.id);
    const now = fxOf(ids.filter((id) => S().nodes[id]));
    const after = fxOf(ids.filter((id) => S().nodes[id] || pend.includes(id)));
    const keys = Object.keys(after);
    const done = ids.filter((id) => S().nodes[id]).length;
    const list = el('ul', { class: 'skt-fxl' });
    for (const k of keys) {
      const a = now[k], b = after[k];
      const li = el('li', {}, [el('span', {}, SKILL_KEYS[k]?.label || k)]);
      if (a !== undefined && a === b) li.append(el('b', {}, fmtFx(k, a)));
      else li.append(el('b', { class: 'new' }, [a !== undefined ? el('s', {}, fmtFx(k, a)) : null, fmtFx(k, b)]));
      list.append(li);
    }
    put(know, el('h4', {}, done ? `What you know · ${done}/${ids.length}` : 'Nothing learned yet'),
      keys.length ? list : el('p', { class: 'skt-muted' }, isTouch() ? 'Tap a lit skill to read it, tap again to pick it.' : 'Hover a skill to read it, click a lit one to pick it.'));
    const lv = st.skillLevel(line), nextT = TIER_LV.findIndex((v) => v > lv);
    if (nextT >= 0) { const n = nodesOf(line).filter((m) => m.t === nextT).length; know.append(el('p', { class: 'skt-soon' }, `${L.name} Lv ${TIER_LV[nextT]} unchains ${n} more.`)); }
    learn.innerHTML = '';
    const spent = spentIn(st, line);
    put(learn,
      el('p', { class: 'skt-how' }, [el('b', {}, 'Learn by doing: '), L.how]),
      el('p', { class: 'skt-star' }, [`"${L.star}"`, el('small', {}, ' Old Star')]),
      spent ? el('button', { class: 'skt-respec', type: 'button', onclick: () => doRespec(), title: `Unlearn every ${L.name} skill and get ${spent} point${spent === 1 ? '' : 's'} back` }, `Reforge ${L.name} · ${respecCost(st, line)}g`) : null);
  };
  const renderHint = () => {
    const ready = nodesOf(line).some((n) => look(n.id).k === 'ready');
    hint.textContent = pend.length ? (isTouch() ? 'Confirm to keep them, Undo to take one back.' : 'Confirm to keep your picks · Undo (Z) takes one back.')
      : ready ? (isTouch() ? 'Tap a glowing skill, tap again to pick it.' : 'Click a glowing skill to pick it.')
        : S().points - pendCost() > 0 ? 'Level up a line to unchain more.' : 'Level up a line to earn points.';
  };

  // ---------------- geometry
  let geo = null; // { s, padL, aw, ah, edges, joints }
  const colX = (t) => geo.padL + t * COLW, rowY = (s) => PAD_T + s * ROWH;
  const nodeEls = {};
  const buildNodes = () => {
    nodesEl.innerHTML = '';
    cols.innerHTML = '';
    for (const k of Object.keys(nodeEls)) delete nodeEls[k];
    for (const n of nodesOf(line)) {
      const b = el('button', { class: 'skt-node', type: 'button', 'data-id': n.id, 'aria-label': n.name }, [
        el('img', { class: 'pix fr', alt: '' }), el('img', { class: 'pix ic', alt: '' }), el('img', { class: 'pix gem', alt: '' }), el('img', { class: 'pix pl', alt: '' }),
      ]);
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showTip(n.id, false); });
      b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && tipId === n.id && !tipPinned) hideTip(); });
      b.addEventListener('focus', () => { if (!tipPinned && b.matches(':focus-visible')) showTip(n.id, false); });
      b.addEventListener('blur', () => { if (tipId === n.id && !tipPinned) hideTip(); });
      b.addEventListener('click', (e) => onNode(n.id, e));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (pend.includes(n.id)) unpick(n.id); });
      b.addEventListener('animationend', (e) => { if (e.target === b) b.classList.remove('nope', 'pop', 'lit'); });
      nodeEls[n.id] = b;
      nodesEl.append(b);
    }
    for (let t = 0; t < TIER_LV.length; t++) cols.append(el('span', { class: 'skt-col', 'data-t': t }, [el('i'), el('b', {}, `Lv ${TIER_LV[t]}`), el('i')]));
    const groups = {};
    for (const n of nodesOf(line)) if (n.excl) (groups[n.excl] ||= []).push(n);
    for (const g of Object.values(groups)) if (g.length > 1) nodesEl.append(el('img', { class: 'pix skt-or', src: SKC.orTag(), alt: 'or', 'data-a': g[0].id, 'data-b': g[1].id }));
    // each track labelled on the left (reference-style): the root's with the line's name, the others
    // with what they mostly make better
    label.innerHTML = '';
    const used = new Set();
    for (let r = 0; r < 5; r++) {
      const ns = nodesOf(line).filter((n) => n.s === r).sort((a, b) => a.t - b.t);
      if (!ns.length) continue;
      let txt = LINE[line].name;
      if (ns[0].t > 0) {
        const cnt = {};
        ns.forEach((n, i) => Object.keys(n.fx).forEach((k, j) => { cnt[k] = (cnt[k] || 0) + (j === 0 ? 2 : 1) - i * 0.01; }));
        const best = Object.entries(cnt).sort((a, b) => b[1] - a[1]).find(([k]) => !used.has(k)) || Object.entries(cnt)[0];
        used.add(best[0]);
        txt = SKILL_KEYS[best[0]]?.label || '';
      } else used.add(Object.keys(ns[0].fx)[0]);
      label.append(el('span', { class: 'skt-row' + (ns[0].t === 0 ? ' root' : ''), 'data-r': r, 'data-t': ns[0].t }, txt));
    }
  };
  const chainsOn = (b, lk) => {
    let ch = b.querySelector('.skt-chain');
    const want = lk.k === 'locked' || lk.k === 'gated';
    if (!want) { if (ch && !ch.classList.contains('fall')) ch.remove(); return; }
    const lv = lk.k === 'gated' ? lk.c.need : 0;
    if (ch && +ch.dataset.lv === lv) return;
    ch?.remove();
    ch = el('span', { class: 'skt-chain', 'data-lv': lv }, [
      el('img', { class: 'pix a', src: SKC.chainA(), alt: '' }), el('img', { class: 'pix b', src: SKC.chainB(), alt: '' }), el('img', { class: 'pix lock', src: SKC.lock(lv), alt: '' }),
    ]);
    b.append(ch);
  };
  const refreshNodes = () => {
    const tint = LINE[line].pal[1];
    for (const n of nodesOf(line)) {
      const b = nodeEls[n.id];
      if (!b) continue;
      const lk = look(n.id), k = lk.k;
      b.dataset.state = k;
      const frame = k === 'done' || k === 'pend' ? 'owned' : k === 'ready' ? 'ready' : k === 'open' ? 'bronze' : k === 'barred' ? 'barred' : 'iron';
      b.querySelector('.fr').src = SKC.frame(frame, frame === 'owned' || frame === 'ready' ? tint : undefined);
      b.querySelector('.ic').src = skillIconURL(n.id, k === 'locked' || k === 'gated' ? 'dim' : k === 'barred' ? 'gray' : 'lit');
      b.querySelector('.gem').src = SKC.gem(k === 'done' ? 'owned' : k === 'pend' ? 'pending' : k === 'ready' ? 'ready' : k === 'barred' ? 'barred' : k === 'open' ? 'open' : 'off');
      b.querySelector('.pl').src = SKC.plate(n.cost, k === 'done' || k === 'pend' ? n.cost : 0, k === 'done' ? 'gold' : k === 'locked' || k === 'gated' || k === 'barred' ? 'iron' : 'brass');
      chainsOn(b, lk);
      b.title = '';
      b.setAttribute('aria-label', `${n.name}: ${k === 'done' ? 'learned' : k === 'pend' ? 'picked, not confirmed' : k === 'ready' ? `ready, ${n.cost} point${n.cost > 1 ? 's' : ''}` : lk.c?.reason || ''}`);
    }
    const lv = st.skillLevel(line);
    for (const c of cols.querySelectorAll('.skt-col')) c.classList.toggle('met', lv >= TIER_LV[+c.dataset.t]);
    for (const o of nodesEl.querySelectorAll('.skt-or')) o.classList.toggle('done', !!(owned(o.dataset.a) || owned(o.dataset.b)));
  };

  const layout = () => {
    if (disposed || !root.isConnected) return;
    const rw = root.clientWidth, rh = root.clientHeight;
    if (rw < 50) return;
    const wide = rw >= 640;
    root.dataset.mode = wide ? 'wide' : 'narrow';
    if (wide && tabs.parentNode !== head) head.append(tabs);
    else if (!wide && tabs.parentNode !== root) root.insertBefore(tabs, main);
    root.classList.toggle('short', rh < 420);
    const padL = wide ? 36 : 6;
    const aw = padL + 4 * COLW + NW + PAD_R, ah = PAD_T + 4 * ROWH + NH + PAD_B;
    const bw = board.clientWidth, bh = wide ? board.clientHeight : Infinity;
    const dpr = window.devicePixelRatio || 1;
    const cap = Math.max(2, pxVar());
    const steps = (dpr >= 2 ? [4, 3.5, 3, 2.5, 2, 1.5, 1] : [4, 3, 2, 1]).filter((k) => k <= cap);
    let s = steps[steps.length - 1];
    for (const k of steps) if (aw * k <= bw && ah * k <= bh * 1.12) { s = k; break; }
    root.style.setProperty('--s', s + 'px');
    root.style.setProperty('--ts', Math.min(s, 2) + 'px');
    const r = routeLine(line, padL);
    geo = { s, padL, aw, ah, ...r };
    sheet.style.width = aw * s + 'px';
    sheet.style.height = ah * s + 'px';
    board.style.height = wide ? '' : Math.ceil(ah * s + 2 * pxVar()) + 'px';
    board.classList.toggle('fits', aw * s <= bw && ah * s <= board.clientHeight + 1);
    cv.width = aw; cv.height = ah;
    cv.style.width = aw * s + 'px'; cv.style.height = ah * s + 'px';
    for (const n of nodesOf(line)) {
      const b = nodeEls[n.id];
      if (!b) continue;
      b.style.left = colX(n.t) * s + 'px';
      b.style.top = rowY(n.s) * s + 'px';
    }
    for (const c of cols.querySelectorAll('.skt-col')) {
      const t = +c.dataset.t;
      c.style.left = (colX(t) + NW / 2) * s + 'px';
    }
    for (const o of nodesEl.querySelectorAll('.skt-or')) {
      const a = NODE[o.dataset.a], b = NODE[o.dataset.b];
      o.style.left = (colX(a.t) + NW / 2 - 6.5) * s + 'px';
      o.style.top = (rowY((a.s + b.s) / 2) + CY - 3.5) * s + 'px';
    }
    label.hidden = !wide;
    for (const sp of label.children) {
      const r = +sp.dataset.r, t = +sp.dataset.t;
      sp.style.top = (rowY(r) + CY) * s + 'px';
      sp.style.width = (colX(t) - (t > 0 ? (COLW - NW) + 2 : 3)) * s + 'px';
      sp.classList.remove('clip');
    }
    if (wide) for (const sp of label.children) if (sp.scrollWidth > sp.clientWidth + 1) sp.classList.add('clip');
    draw();
    if (tipId) placeTip();
  };

  // ---------------- pipes
  let anim = null; // Map edgeKey → { t0, dur }
  let raf = 0;
  const edgeKind = (e) => {
    const a = owned(e.p), b = owned(e.c);
    if (a === 'done' && b === 'done') return 'lit';
    if (a && b) return 'pend';
    return 'dim';
  };
  const draw = () => {
    if (!geo) return;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(geo.aw, geo.ah);
    const segs = [], now = performance.now();
    let busy = false;
    for (const e of geo.edges) {
      const kind = edgeKind(e);
      const a = anim?.get(e.p + '>' + e.c);
      let T = 1;
      if (a) { T = Math.max(0, Math.min(1, (now - a.t0) / a.dur)); if (T < 1) busy = true; }
      if (T < 1) pushSegs(segs, e, 'dim', 1);
      pushSegs(segs, e, kind, T);
    }
    const jk = { dim: 0, pend: 1, lit: 2 };
    const joints = geo.joints.map((j) => {
      let best = 'dim';
      for (const e of j.edges) { const k = edgeKind(e), a = anim?.get(e.p + '>' + e.c); if (a && now - a.t0 < a.dur) continue; if (jk[k] > jk[best]) best = k; }
      return { x: j.x, y: j.y, kind: best };
    });
    paintPipes(img, segs, joints);
    ctx.putImageData(img, 0, 0);
    return busy;
  };
  const pushSegs = (out, e, kind, T) => {
    let left = e.len * T;
    for (let i = 1; i < e.pts.length && left > 0; i++) {
      const [x0, y0] = e.pts[i - 1], [x1, y1] = e.pts[i];
      const L = Math.abs(x1 - x0) + Math.abs(y1 - y0);
      if (!L) continue;
      const f = Math.min(1, left / L);
      out.push({ x0, y0, x1, y1, kind, t: f });
      left -= L;
    }
  };
  const animate = (keys, delay = 0, dur = 320) => {
    const now = performance.now() + delay;
    anim ||= new Map();
    for (const k of keys) anim.set(k, { t0: now, dur });
    cancelAnimationFrame(raf);
    const tick = () => {
      if (disposed) return;
      const busy = draw();
      const pending = [...anim.values()].some((a) => performance.now() < a.t0 + a.dur);
      if (busy || pending) raf = requestAnimationFrame(tick);
      else { anim = null; draw(); }
    };
    raf = requestAnimationFrame(tick);
  };

  // ---------------- the tooltip (parchment)
  let tipId = null, tipPinned = false;
  const showTip = (id, pinned) => {
    const n = NODE[id];
    if (!n || n.line !== line) return;
    tipId = id; tipPinned = pinned;
    const lk = look(id), k = lk.k, L = LINE[n.line];
    tip.innerHTML = '';
    const all = Object.keys(S().nodes).concat(pend);
    const fxList = el('ul', { class: 'skt-tip-fx' });
    for (const [key, v] of Object.entries(n.fx)) {
      const d = SKILL_KEYS[key];
      if (!d) continue;
      const others = fxOf(all.filter((x) => x !== id))[key] || 0;
      const has = k === 'done' || k === 'pend';
      const nowV = has ? others + v : others, nextV = others + v;
      const zero = d.kind === 'perk' ? !nowV : nowV === 0;
      fxList.append(el('li', {}, [el('span', {}, d.label), has
        ? el('b', {}, fmtFx(key, nowV))
        : el('b', {}, [el('s', {}, zero ? '—' : fmtFx(key, nowV)), ' → ', el('em', {}, fmtFx(key, nextV))])]));
    }
    const req = el('ul', { class: 'skt-tip-req' });
    const need = TIER_LV[n.t];
    req.append(el('li', { class: st.skillLevel(n.line) >= need ? 'ok' : 'no' }, `${L.name} level ${need}`));
    if (n.req.length) req.append(el('li', { class: n.req.some((r) => owned(r)) ? 'ok' : 'no' }, 'After ' + n.req.map((r) => NODE[r].name).join(' or ')));
    if (n.excl) {
      const others = nodesOf(n.line).filter((m) => m.excl === n.excl && m.id !== id);
      req.append(el('li', { class: k === 'barred' ? 'no' : 'pick' }, `A choice: this or ${others.map((m) => m.name).join(' or ')}`));
    }
    const pips = el('span', { class: 'skt-tip-pips' });
    for (let i = 0; i < n.cost; i++) pips.append(el('img', { class: 'pix', src: SKC.token(!(k === 'done' || k === 'pend')), alt: '' }));
    const status = {
      done: `Learned · day ${S().nodes[id]}`,
      pend: isTouch() ? 'Picked · Confirm to keep it' : 'Picked · Confirm to keep it, click to take back',
      ready: isTouch() ? 'Tap again to pick it' : 'Click to pick it',
    }[k] || (lk.c?.code === 'path' ? 'Learn ' + n.req.map((r) => NODE[r].name).join(' or ') + ' first' : lk.c?.reason || '');
    const act = el('div', { class: 'skt-tip-act ' + k }, [el('span', {}, status)]);
    if (pinned && (k === 'ready' || k === 'pend')) act.append(el('button', { class: 'skt-btn sm', type: 'button', onclick: (e) => { e.stopPropagation(); onNode(id, null, true); } }, k === 'ready' ? `Pick · ${n.cost} pt${n.cost > 1 ? 's' : ''}` : 'Take back'));
    put(tip,
      el('div', { class: 'skt-tip-h' }, [el('img', { class: 'pix', src: skillIconURL(id, k === 'locked' || k === 'gated' ? 'dim' : k === 'barred' ? 'gray' : 'lit'), alt: '' }), el('div', {}, [el('b', {}, n.name), el('small', {}, `${L.name} · ${TIER_NAME[n.t]} · Rank ${k === 'done' ? 1 : 0}/1`)])]),
      el('p', { class: 'skt-tip-d' }, n.desc),
      fxList,
      el('div', { class: 'skt-tip-cost' }, [el('span', {}, 'Cost'), pips, el('b', {}, `${n.cost} point${n.cost > 1 ? 's' : ''}`)]),
      req, act);
    tip.hidden = false;
    tip.classList.toggle('pinned', pinned);
    for (const [nid, b] of Object.entries(nodeEls)) b.classList.toggle('sel', pinned && nid === id);
    placeTip();
  };
  const hideTip = () => {
    tipId = null; tipPinned = false; tip.hidden = true;
    for (const b of Object.values(nodeEls)) b.classList.remove('sel');
  };
  const placeTip = () => {
    const b = nodeEls[tipId];
    if (!b || tip.hidden) return;
    const R = root.getBoundingClientRect(), nb = b.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 6;
    const sx = R.width / (root.offsetWidth || R.width) || 1; // (the book opens with a scale animation)
    const nL = (nb.left - R.left) / sx, nT = (nb.top - R.top) / sx, nW = nb.width / sx, nH = nb.height / sx;
    let x = nL + nW + gap;
    if (x + tw > root.clientWidth - 4) x = nL - tw - gap;
    if (x < 4) { x = Math.max(4, Math.min(root.clientWidth - tw - 4, nL + nW / 2 - tw / 2)); }
    let y = nT - 4;
    if (x === Math.max(4, Math.min(root.clientWidth - tw - 4, nL + nW / 2 - tw / 2))) y = nT + nH + gap > root.clientHeight - th - 4 ? nT - th - gap : nT + nH + gap;
    y = Math.max(4, Math.min(root.clientHeight - th - 4, y));
    tip.style.left = Math.round(x) + 'px';
    tip.style.top = Math.round(y) + 'px';
  };

  // ---------------- picking
  const pop = (b, cls) => { if (!b) return; b.classList.remove(cls); void b.offsetWidth; b.classList.add(cls); };
  const onNode = (id, e, fromTip = false) => {
    const touchy = isTouch() || e?.pointerType === 'touch';
    if (!fromTip && touchy && !(tipId === id && tipPinned)) { au.play('sk_pick'); showTip(id, true); return; }
    const k = look(id).k;
    if (k === 'ready') pick(id);
    else if (k === 'pend') unpick(id);
    else {
      au.play('ui_error');
      pop(nodeEls[id], 'nope');
      showTip(id, touchy || tipPinned);
    }
  };
  const pick = (id) => {
    if (look(id).k !== 'ready') return false;
    const n = NODE[id];
    if (n.line !== line) setLine(n.line, true);
    pend.push(id);
    delete root.dataset.warned;
    recalc();
    au.play('sk_pick');
    au.play('click', { vol: 0.5 });
    pop(nodeEls[id], 'pop');
    const keys = geo ? geo.edges.filter((e) => e.c === id && owned(e.p)).map((e) => e.p + '>' + e.c) : [];
    renderAll(true);
    if (keys.length) animate(keys, 0, 260);
    if (tipId) showTip(tipId, tipPinned);
    return true;
  };
  /** Take a pick back (and any pick that only stood on it). */
  const unpick = (id) => {
    if (!pend.includes(id)) return false;
    pend = pend.filter((x) => x !== id);
    revalidate();
    au.play('remove');
    renderAll(true);
    if (tipId) showTip(tipId, tipPinned);
    return true;
  };
  const undo = () => {
    if (!pend.length) return false;
    const id = pend[pend.length - 1];
    if (NODE[id].line !== line) setLine(NODE[id].line, true);
    return unpick(id);
  };
  const confirm = () => {
    if (!pend.length) return false;
    const order = pend.slice();
    const was = {};
    for (const n of nodesOf(line)) was[n.id] = look(n.id).k;
    pend = [];
    recalc();
    const got = [];
    confirming = true;
    try { for (const id of order) if (unlock(st, id).ok) got.push(id); } finally { confirming = false; }
    recalc();
    hideTip();
    if (!got.length) { au.play('ui_error'); renderAll(); return false; }
    au.play('clang');
    renderAll(true);
    const here = got.filter((id) => NODE[id].line === line);
    here.forEach((id, i) => setTimeout(() => { if (!disposed) celebrate(id); }, 90 + i * 150));
    const lit = geo ? geo.edges.filter((e) => here.includes(e.c) && S().nodes[e.p]).map((e) => e.p + '>' + e.c) : [];
    if (lit.length) animate(lit, 0, 420);
    // chains fall off whatever these opened up
    const freed = nodesOf(line).filter((n) => (was[n.id] === 'locked' || was[n.id] === 'gated') && !['locked', 'gated'].includes(look(n.id).k));
    freed.forEach((n, i) => setTimeout(() => { if (!disposed) dropChains(n.id); }, 380 + here.length * 150 + i * 120));
    if (freed.length) setTimeout(() => { if (!disposed) au.play('clunk'); }, 380 + here.length * 150);
    setTimeout(() => { if (!disposed) au.play('success', { vol: 0.8 }); }, 200 + here.length * 150);
    const others = got.length - here.length;
    if (others > 0) ui.toast?.(`${others} more skill${others > 1 ? 's' : ''} learned in other lines`, { kind: 'good' });
    return true;
  };
  const celebrate = (id) => {
    const b = nodeEls[id];
    if (!b || !geo) return;
    pop(b, 'lit');
    const s = geo.s, n = NODE[id];
    const cx = (colX(n.t) + NW / 2) * s, cy = (rowY(n.s) + CY) * s;
    const ring = el('i', { class: 'skt-ring', style: { left: cx + 'px', top: cy + 'px' } });
    fxEl.append(ring);
    setTimeout(() => ring.remove(), 700);
    const r = makeRng((performance.now() * 997) | 0);
    const cols3 = ['#fff6c8', '#ffd860', '#ffa830', '#ff7a20', hex6(LINE[line].pal[0])];
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = (18 + r() * 30) * s;
      const sz = Math.max(2, Math.round((2 + r.int(0, 1)) * s));
      const dot = el('i', { class: 'skt-spark', style: { left: cx + 'px', top: cy + 'px', width: sz + 'px', height: sz + 'px', background: cols3[r.int(0, cols3.length - 1)] } });
      dot.style.setProperty('--dx', (Math.cos(a) * d).toFixed(1) + 'px');
      dot.style.setProperty('--dy', (Math.sin(a) * d - 6 * s).toFixed(1) + 'px');
      dot.style.setProperty('--fall', (10 + r() * 14) * s + 'px');
      dot.style.animationDelay = Math.round(r() * 80) + 'ms';
      fxEl.append(dot);
      setTimeout(() => dot.remove(), 1100);
    }
    const [key, v] = Object.entries(n.fx)[0] || [];
    const d = SKILL_KEYS[key];
    const txt = d ? `${d.fmt(v)}${d.kind === 'mult' ? ' ' + d.label.toLowerCase() : ''}` : n.name;
    const f = el('div', { class: 'skt-float', style: { left: Math.max(60, Math.min(geo.aw * s - 60, cx)) + 'px', top: (cy - NH * s * 0.5) + 'px' } }, txt);
    fxEl.append(f);
    setTimeout(() => f.remove(), 1500);
    au.play('ding', { vol: 0.5 });
  };
  const dropChains = (id) => {
    const b = nodeEls[id];
    const ch = b?.querySelector('.skt-chain');
    if (!ch) { pop(b, 'pop'); return; }
    ch.classList.add('fall');
    setTimeout(() => ch.remove(), 900);
    pop(b, 'pop');
  };

  // ---------------- lines
  const setLine = (id, quiet = false) => {
    if (!LINE[id] || id === line) return;
    line = id;
    S().view = id;
    hideTip();
    anim = null;
    if (!quiet) au.play('ui_click');
    buildNodes();
    renderAll();
    layout();
    sheet.classList.remove('turn'); void sheet.offsetWidth; sheet.classList.add('turn');
    board.scrollTo?.({ left: 0, top: 0 });
  };
  const doRespec = async () => {
    const cost = respecCost(st, line), back = spentIn(st, line);
    if (!back) return;
    const L = LINE[line];
    const ok = await ui.confirm(`Reforge <b>${L.name}</b>?<br>Every ${L.name} skill is unlearned and you get <b>${back} point${back > 1 ? 's' : ''}</b> back, for <b>${cost}g</b>.`, 'Reforge', 'Keep');
    if (!ok || disposed) return;
    pend = pend.filter((x) => NODE[x].line !== line);
    const r = respec(st, line);
    recalc();
    if (!r.ok) { au.play('ui_error'); ui.toast(r.reason, { kind: 'bad' }); return; }
    au.play('sk_scrape');
    renderAll();
  };

  const renderAll = (bump = false) => {
    renderHead();
    renderTabs();
    renderPoints(bump);
    refreshNodes();
    renderSide();
    renderHint();
    draw();
  };

  // ---------------- panning the board with the mouse (touch scrolls natively)
  let drag = null;
  board.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.skt-node')) return;
    if (board.scrollWidth <= board.clientWidth + 1 && board.scrollHeight <= board.clientHeight + 1) { if (tipPinned) hideTip(); return; }
    drag = { x: e.clientX, y: e.clientY, l: board.scrollLeft, t: board.scrollTop };
    board.classList.add('drag');
    board.setPointerCapture?.(e.pointerId);
  });
  board.addEventListener('pointermove', (e) => { if (drag) { board.scrollLeft = drag.l - (e.clientX - drag.x); board.scrollTop = drag.t - (e.clientY - drag.y); } });
  const endDrag = () => { drag = null; board.classList.remove('drag'); };
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);
  board.addEventListener('scroll', () => { if (tipId) placeTip(); }, { passive: true });
  root.addEventListener('pointerdown', (e) => { if (tipPinned && !e.target.closest('.skt-node, .skt-tip')) hideTip(); });

  let disposed = false;
  buildNodes();
  renderAll();
  const ro = new ResizeObserver(() => layout());
  ro.observe(root);
  ro.observe(board);
  requestAnimationFrame(layout);

  // live updates (XP while the page is open, points from elsewhere)
  const off = st.on('skill', (e) => {
    if (disposed) return;
    if (!root.isConnected) { dispose(); return; }
    if (e.type === 'unlock' && confirming) return; // our own confirm animates itself
    revalidate();
    if (e.type === 'xp' && e.line !== line) { renderTabs(); return; }
    renderAll();
  });
  const keys = (e) => {
    if (!root.isConnected || disposed) return;
    if (ui.panelStack?.length && !ui.panelStack[ui.panelStack.length - 1].el.contains(root)) return; // a dialog over us
    const typing = /INPUT|TEXTAREA/.test(document.activeElement?.tagName || '');
    if (typing) return;
    if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && !inBook) { // (in the book, arrows turn chapters)
      const i = SKILL_LINES.findIndex((l) => l.id === line);
      setLine(SKILL_LINES[(i + (e.code === 'ArrowRight' ? 1 : -1) + SKILL_LINES.length) % SKILL_LINES.length].id);
      e.preventDefault();
    } else if (e.code === 'KeyZ' && !e.repeat) { if (undo()) e.preventDefault(); }
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && pend.length && !document.activeElement?.closest?.('.skt-node, button')) { confirm(); e.preventDefault(); }
  };
  window.addEventListener('keydown', keys);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (pend.length) ui.toast?.(`${pend.length} picked skill${pend.length > 1 ? 's' : ''} not confirmed: the points are still yours.`, { icon: SKC.token(false) });
    pend = [];
    cancelAnimationFrame(raf);
    ro.disconnect();
    off();
    window.removeEventListener('keydown', keys);
    S().opened = st.data.playTime || 0;
  };
  S().opened = st.data.playTime || 0;
  ui.skillNudge?.clear();
  return {
    el: root, dispose, layout, line: setLine, pick, unpick, undo, confirm,
    /** Show a skill's card (pinned), switching lines if needed. */
    select: (id) => { if (!NODE[id]) return; if (NODE[id].line !== line) setLine(NODE[id].line, true); showTip(id, true); nodeEls[id]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); },
    /** Pick and confirm in one go (tests). */
    stamp: (id) => (pick(id) ? confirm() : false),
    /** Esc: close the card first; with picks waiting, the first Esc asks. */
    escape: () => {
      if (tipPinned) { hideTip(); return true; }
      if (pend.length && !root.dataset.warned) { root.dataset.warned = '1'; pop(goBtn, 'nag'); hint.textContent = 'Picks not confirmed: Confirm to keep them, or Esc again to leave them.'; au.play('ui_error'); return true; }
      return false;
    },
    get pending() { return pend.slice(); },
    get selected() { return tipId; },
    get current() { return line; },
  };
}

// ------------------------------------------------------------------ standalone (ui.openSkills)
export function openSkills(game, line) {
  const ui = game.ui;
  const wrap = el('div', { class: 'skt-wrap' });
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
    if (!n || ui.hudMode === 'none' || ui.panelStack?.length || game.transitioning) return;
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
