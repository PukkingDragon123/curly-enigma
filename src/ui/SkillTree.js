// The skill tree: a page of the book (renderSkills, called by the book's Skills tab) and the same
// page in its own little book (ui.openSkills()). Seven lines along the top; each line's tree is
// hand-inked on parchment: stamped skills are wax seals in the line's colour, the ones you can
// reach are inked medallions, the rest faint pencil. Stamping one inks the path into it, presses
// the seal (thunk), and sprays a little wax. Also the feedback that works anywhere
// (installSkillFeedback): XP ribbons, level-up toasts, perk notes and a gentle nudge to spend points.
//   renderSkills(host, game, { line, standalone }) → { el, dispose(), select(id), stamp(id), line(id), layout() }
//   openSkills(game, line?) → panel handle (.debug = the page's controller)
import { el, makeRng, hashStr } from '../core/util.js';
import { iconURL } from '../gfx/PixelArt.js';
import { ITEMS } from '../data/items.js';
import { SKILL_LINES, LINE, NODE, SKILL_KEYS, TIER_LV, MAX_LEVEL, nodesOf, levelInfo, pointsForLevel } from '../data/skills.js';
import { canUnlock, nodeState, unlock, respec, respecCost, spentIn, fxOf, lineInfo } from '../core/skills.js';
import { nodeURL, lineSealURL, lineBigURL, tokenURL, selRingURL, pipURL, NODE_PX } from './skillArt.js';
import { SPR } from './uiSprites.js';
import { mixHex } from './uiArt.js';
import { put } from './common.js';
import './skilltree.css';

const TIERS = TIER_LV.length;
const SLOTS = 5;
const INK = [0x2e, 0x1a, 0x0e];
const INK2 = [0x5a, 0x3a, 0x20];
const PENCIL = [0x8a, 0x74, 0x58];
const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const isTouch = () => document.documentElement.classList.contains('is-touch');
const pxVar = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
const fmtMult = (k, v) => {
  const d = SKILL_KEYS[k];
  if (!d) return '';
  if (d.kind === 'mult') return d.fmt(v - 1);
  return d.fmt(v);
};

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

// ------------------------------------------------------------------ the page
export function renderSkills(host, game, opts = {}) {
  const st = game.state, ui = game.ui, au = game.audio;
  defineSkillSounds(au);
  const S = () => st.data.skills;
  const lineReady = (id) => nodesOf(id).some((n) => nodeState(st, n.id) === 'ready');
  let line = LINE[opts.line] ? opts.line : LINE[S().view] ? S().view : (SKILL_LINES.find((l) => lineReady(l.id)) || SKILL_LINES[0]).id;
  let sel = null, hover = null;
  let geo = null; // tree geometry
  let anim = null; // { links: Map(key → {t0, dur}), until }
  let raf = 0, disposed = false;

  // ---------------- skeleton
  const ptsNum = el('b', {}, '0');
  const ptsLbl = el('span', {}, 'skill points');
  const ptsImg = el('img', { class: 'pix', src: tokenURL(), alt: '' });
  const pts = el('div', { class: 'sk-pts', title: 'Skill points to spend' }, [ptsImg, ptsNum, ptsLbl]);
  const head = el('header', { class: 'sk-head' }, [el('h2', { class: 'sk-title' }, 'Skills'), pts]);
  const nav = el('nav', { class: 'sk-lines', role: 'tablist', 'aria-label': 'Skill lines' });
  const cv = el('canvas', { class: 'sk-ink' });
  const tiersEl = el('div', { class: 'sk-tiers' });
  const nodesEl = el('div', { class: 'sk-nodes' });
  const selRing = el('img', { class: 'pix sk-sel', src: selRingURL(), alt: '', hidden: true });
  const fxEl = el('div', { class: 'sk-fxl' });
  const tree = el('div', { class: 'sk-tree' }, [cv, tiersEl, selRing, nodesEl, fxEl]);
  const card = el('div', { class: 'sk-lc' });
  const detail = el('div', { class: 'sk-dt' });
  const learn = el('div', { class: 'sk-learn' });
  const side = el('div', { class: 'sk-side' }, [card, detail, learn]);
  const body = el('div', { class: 'sk-body' }, [tree, side]);
  const hint = el('span', { class: 'sk-hint' });
  const scrape = el('button', { class: 'sk-scrape', onclick: () => doRespec() });
  const foot = el('footer', { class: 'sk-foot' }, [hint, scrape]);
  const root = el('div', { class: 'sk' }, [head, nav, body, foot]);
  host.append(root);

  // ---------------- tabs
  const tabEls = {};
  for (const l of SKILL_LINES) {
    const b = el('button', { class: 'sk-line', role: 'tab', 'data-line': l.id, title: l.name, onclick: () => setLine(l.id) }, [
      el('img', { class: 'pix', src: lineSealURL(l), alt: '' }), el('span', {}, l.name), el('i', { class: 'sk-lv' }), el('img', { class: 'pix sk-dot', src: pipURL(true), alt: '', hidden: true }),
    ]);
    b.style.setProperty('--lc', l.ink);
    tabEls[l.id] = b;
    nav.append(b);
  }
  const renderTabs = () => {
    for (const l of SKILL_LINES) {
      const b = tabEls[l.id];
      b.classList.toggle('on', l.id === line);
      b.setAttribute('aria-selected', l.id === line ? 'true' : 'false');
      b.querySelector('.sk-lv').textContent = String(st.skillLevel(l.id));
      b.querySelector('.sk-dot').hidden = !lineReady(l.id);
    }
  };
  const renderPoints = (bump = false) => {
    const n = S().points;
    ptsNum.textContent = String(n);
    ptsLbl.textContent = n === 1 ? 'skill point' : 'skill points';
    ptsImg.src = tokenURL(n === 0);
    pts.classList.toggle('none', n === 0);
    if (bump) { pts.classList.remove('bump'); void pts.offsetWidth; pts.classList.add('bump'); }
  };

  // ---------------- line card (level, XP)
  const renderCard = () => {
    const L = LINE[line];
    const info = lineInfo(st, line);
    card.innerHTML = '';
    card.style.setProperty('--lc', L.ink);
    const next = info.max ? 'Mastered' : `${Math.floor(info.into)} / ${info.need} XP`;
    put(card,
      el('img', { class: 'pix sk-lc-seal', src: lineBigURL(L), alt: '' }),
      el('div', { class: 'sk-lc-txt' }, [
        el('div', { class: 'sk-lc-row' }, [el('b', { class: 'sk-lc-name' }, L.name), el('span', { class: 'sk-lc-lv' }, `Lv ${info.level}`)]),
        el('div', { class: 'sk-xp', title: next }, [el('i', { style: { width: (info.frac * 100).toFixed(1) + '%' } })]),
        el('small', { class: 'sk-lc-next' }, [
          el('span', {}, info.max ? 'Every point this line can give, given.' : `Lv ${info.level + 1}: +${pointsForLevel(info.level + 1)} skill point${pointsForLevel(info.level + 1) > 1 ? 's' : ''}`),
          el('em', {}, next),
        ]),
      ]));
  };

  // ---------------- detail / summary
  const showId = () => hover || sel;
  const renderDetail = () => {
    const id = showId();
    detail.innerHTML = '';
    const L = LINE[line];
    detail.style.setProperty('--lc', L.ink);
    if (!id || NODE[id]?.line !== line) {
      const done = nodesOf(line).filter((n) => S().nodes[n.id]);
      const tot = fxOf(done.map((n) => n.id));
      const list = el('ul', { class: 'sk-fx' });
      for (const [k, v] of Object.entries(tot)) {
        const d = SKILL_KEYS[k];
        list.append(el('li', {}, [el('span', {}, d?.label || k), el('b', {}, d ? d.fmt(v) : '+' + v)]));
      }
      put(detail,
        el('h4', { class: 'sk-h' }, done.length ? `What you know (${done.length}/${nodesOf(line).length})` : 'Nothing stamped yet'),
        done.length ? list : el('p', { class: 'sk-p' }, isTouch() ? 'Tap a seal on the tree to read it.' : 'Click a seal on the tree to read it.'));
      // what can be stamped now, and what the next level opens up
      const ready = nodesOf(line).filter((n) => nodeState(st, n.id) === 'ready');
      if (ready.length) {
        const ul = el('ul', { class: 'sk-next' });
        for (const n of ready) {
          const pips = el('span', { class: 'sk-pips' });
          for (let i = 0; i < n.cost; i++) pips.append(el('img', { class: 'pix', src: pipURL(true), alt: '' }));
          const fx0 = Object.entries(n.fx)[0];
          ul.append(el('li', {}, [el('button', { onclick: () => select(n.id) }, [
            el('img', { class: 'pix seal', src: imgFor(n, 'ready'), alt: '' }),
            el('span', {}, [n.name, ' ', el('small', {}, fx0 && SKILL_KEYS[fx0[0]] ? fmtMult(fx0[0], SKILL_KEYS[fx0[0]].kind === 'mult' ? 1 + fx0[1] : fx0[1]) : '')]),
            pips,
          ])]));
        }
        put(detail, el('h4', { class: 'sk-h' }, 'Ready to stamp'), ul);
      }
      const lv = st.skillLevel(line);
      const nextT = TIER_LV.findIndex((v) => v > lv);
      if (nextT >= 0) {
        const n = nodesOf(line).filter((m) => m.t === nextT).length;
        put(detail, el('p', { class: 'sk-soon' }, `${L.name} Lv ${TIER_LV[nextT]} opens ${n} more seal${n === 1 ? '' : 's'}.`));
      }
      return;
    }
    const n = NODE[id];
    const ns = nodeState(st, id);
    const chk = canUnlock(st, id);
    const allOwn = Object.keys(S().nodes);
    const fxList = el('ul', { class: 'sk-fx' });
    for (const [k, v] of Object.entries(n.fx)) {
      const d = SKILL_KEYS[k];
      if (!d) continue;
      const before = 1 + (fxOf(allOwn.filter((x) => x !== id))[k] || 0);
      const after = before + v;
      const row = el('li', {}, [el('span', {}, d.label), el('b', {}, d.fmt(v))]);
      if (d.kind === 'mult' && ns !== 'done') row.append(el('em', {}, `×${before.toFixed(2)} → ×${after.toFixed(2)}`));
      fxList.append(row);
    }
    const req = el('ul', { class: 'sk-req' });
    const need = TIER_LV[n.t];
    const lvOk = st.skillLevel(line) >= need;
    req.append(el('li', { class: lvOk ? 'ok' : 'no' }, `${L.name} level ${need}`));
    if (n.t > 0 && n.req.length) {
      const ok = n.req.some((r) => S().nodes[r]);
      req.append(el('li', { class: ok ? 'ok' : 'no' }, 'After ' + n.req.map((r) => NODE[r].name).join(' or ')));
    }
    if (n.excl) {
      const others = nodesOf(line).filter((m) => m.excl === n.excl && m.id !== id);
      req.append(el('li', { class: ns === 'barred' ? 'no' : 'pick' }, `A choice: this or ${others.map((m) => m.name).join(' or ')}`));
    }
    const act = el('div', { class: 'sk-act' });
    if (ns === 'done') act.append(el('span', { class: 'sk-stamped' }, `Stamped · day ${S().nodes[id]}`));
    else if (ns === 'barred') act.append(el('span', { class: 'sk-barred' }, chk.reason));
    else {
      const pips = el('span', { class: 'sk-pips' });
      for (let i = 0; i < n.cost; i++) pips.append(el('img', { class: 'pix', src: pipURL(i < S().points || ns === 'ready'), alt: '' }));
      const btn = el('button', { class: 'sk-stamp', disabled: ns !== 'ready', title: chk.ok ? 'Press the seal' : chk.reason, onclick: () => stamp(id) }, [
        el('img', { class: 'pix', src: SPR.stampHandle(), alt: '' }), el('span', {}, ['Stamp ', pips]),
      ]);
      act.append(btn);
      if (!chk.ok) act.append(el('small', { class: 'sk-why' }, chk.reason));
    }
    put(detail,
      el('div', { class: 'sk-dt-top' }, [
        el('img', { class: 'pix sk-dt-seal', src: imgFor(n, ns), alt: '' }),
        el('div', {}, [el('small', {}, `${L.name} · ${['Root', 'Second', 'Third', 'Fourth', 'Crown'][n.t]} tier`), el('b', { class: 'sk-dt-name' }, n.name)]),
      ]),
      el('p', { class: 'sk-desc' }, n.desc),
      fxList, req, act);
  };
  const renderLearn = () => {
    const L = LINE[line];
    learn.innerHTML = '';
    learn.style.setProperty('--lc', L.ink);
    put(learn,
      el('p', { class: 'sk-how' }, [el('b', {}, 'Learn by doing: '), L.how]),
      el('p', { class: 'sk-star' }, [`"${L.star}"`, el('small', {}, ' Old Star')]));
  };
  const imgFor = (n, ns) => nodeURL(n, LINE[n.line], ns === 'done' ? 'done' : ns === 'ready' ? 'ink' : ns === 'open' ? 'faint' : ns === 'barred' ? 'barred' : 'pencil');

  // ---------------- the tree: nodes
  const nodeEls = {};
  const buildNodes = () => {
    nodesEl.innerHTML = '';
    tiersEl.innerHTML = '';
    for (const k of Object.keys(nodeEls)) delete nodeEls[k];
    for (const n of nodesOf(line)) {
      const b = el('button', { class: 'sk-node', 'data-id': n.id, 'aria-label': n.name, title: n.name }, [el('img', { class: 'pix', alt: '' }), el('i', { class: 'sk-tag' })]);
      b.addEventListener('click', () => select(n.id));
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && hover !== n.id) { hover = n.id; renderDetail(); } });
      b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && hover === n.id) { hover = null; renderDetail(); } });
      b.addEventListener('dblclick', () => { if (nodeState(st, n.id) === 'ready') stamp(n.id); });
      b.addEventListener('animationend', (e) => { if (e.target === b) b.classList.remove('nope'); else { b.classList.remove('stamp'); b.classList.remove('reveal'); } });
      nodeEls[n.id] = b;
      nodesEl.append(b);
    }
    for (let t = 0; t < TIERS; t++) tiersEl.append(el('span', { class: 'sk-tier', 'data-t': t }, `Lv ${TIER_LV[t]}`));
    // "or" between the two halves of a choice
    const groups = {};
    for (const n of nodesOf(line)) if (n.excl) (groups[n.excl] ||= []).push(n);
    for (const g of Object.values(groups)) if (g.length > 1) tiersEl.append(el('span', { class: 'sk-or', 'data-a': g[0].id, 'data-b': g[1].id }, 'or'));
  };
  const refreshNodes = () => {
    for (const n of nodesOf(line)) {
      const b = nodeEls[n.id];
      if (!b) continue;
      const ns = nodeState(st, n.id);
      b.dataset.state = ns;
      b.querySelector('img').src = imgFor(n, ns);
      const tag = b.querySelector('.sk-tag');
      const chk = canUnlock(st, n.id);
      tag.textContent = ns === 'open' && chk.code === 'level' ? `Lv ${chk.need}` : ns === 'ready' || ns === 'open' ? '●'.repeat(n.cost) : '';
      tag.hidden = !tag.textContent;
      b.classList.toggle('on', sel === n.id);
      b.title = `${n.name}${ns === 'done' ? ' (stamped)' : ns === 'ready' ? ' (ready to stamp)' : ''}`;
    }
    const lv = st.skillLevel(line);
    for (const t of tiersEl.querySelectorAll('.sk-tier')) t.classList.toggle('met', lv >= TIER_LV[+t.dataset.t]);
    placeSel();
  };

  // ---------------- the tree: geometry
  const layout = () => {
    if (disposed || !root.isConnected) return;
    const r = { width: root.clientWidth, height: root.clientHeight }; // (not the bounding box: the book opens with a scale animation)
    if (r.width < 10) return;
    const mode = r.width >= 560 ? 'wide' : 'narrow';
    root.dataset.mode = mode;
    root.classList.toggle('short', r.height < 360);
    if (mode === 'narrow') {
      // a phone held upright: the tree takes the page's width, the notes scroll below it
      const want = Math.round(Math.min(tree.clientWidth * 1.04, Math.max(220, window.innerHeight * 0.6)));
      if (Math.abs(tree.clientHeight - want) > 1) tree.style.height = want + 'px';
    } else if (tree.style.height) tree.style.height = '';
    const tw = tree.clientWidth, th = tree.clientHeight;
    if (tw < 40 || th < 40) return;
    const horiz = tw / th > 1.35;
    const along = horiz ? tw : th, cross = horiz ? th : tw;
    const dpr = window.devicePixelRatio || 1;
    const steps = dpr >= 2 ? [4, 3.5, 3, 2.5, 2, 1.5, 1] : [4, 3, 2, 1];
    const cap = Math.max(2, pxVar());
    let s = 1;
    for (const k of steps) {
      if (k > cap) continue;
      const lab = horiz ? 9 * k : 12 * k;
      if (NODE_PX * k * 1.16 <= (along - 4 * k) / TIERS && NODE_PX * k * 1.08 <= (cross - lab) / SLOTS) { s = k; break; }
    }
    const aw = Math.floor(tw / s), ah = Math.floor(th / s);
    const padL = horiz ? 2 : 12, padT = horiz ? 9 : 2, padR = 2, padB = 2;
    const pos = {};
    for (const n of nodesOf(line)) {
      let x, y;
      if (horiz) {
        x = padL + (n.t + 0.5) * (aw - padL - padR) / TIERS;
        y = padT + (n.s + 0.5) * (ah - padT - padB) / SLOTS;
      } else {
        x = padL + (n.s + 0.5) * (aw - padL - padR) / SLOTS;
        y = ah - padB - (n.t + 0.5) * (ah - padT - padB) / TIERS;
      }
      pos[n.id] = { x: Math.round(x), y: Math.round(y) };
    }
    geo = { s, aw, ah, horiz, pos, padL, padT };
    tree.style.setProperty('--s', s + 'px');
    tree.classList.toggle('big', s >= 3);
    tree.dataset.horiz = horiz ? '1' : '0';
    cv.width = aw; cv.height = ah;
    cv.style.width = aw * s + 'px'; cv.style.height = ah * s + 'px';
    const half = NODE_PX / 2;
    for (const n of nodesOf(line)) {
      const b = nodeEls[n.id], p = pos[n.id];
      if (!b) continue;
      b.style.left = (p.x - half) * s + 'px';
      b.style.top = (p.y - half) * s + 'px';
      b.style.width = b.style.height = NODE_PX * s + 'px';
    }
    for (const t of tiersEl.querySelectorAll('.sk-tier')) {
      const i = +t.dataset.t;
      if (horiz) { t.style.left = (padL + (i + 0.5) * (aw - padL - padR) / TIERS) * s + 'px'; t.style.top = '0px'; }
      else { t.style.top = (ah - padB - (i + 0.5) * (ah - padT - padB) / TIERS) * s + 'px'; t.style.left = '0px'; }
    }
    for (const o of tiersEl.querySelectorAll('.sk-or')) {
      const a = pos[o.dataset.a], b = pos[o.dataset.b];
      if (!a || !b) continue;
      o.style.left = ((a.x + b.x) / 2) * s + 'px';
      o.style.top = ((a.y + b.y) / 2) * s + 'px';
    }
    placeSel();
    draw();
  };
  const placeSel = () => {
    const id = sel && NODE[sel]?.line === line ? sel : null;
    selRing.hidden = !id || !geo;
    if (!id || !geo) return;
    const p = geo.pos[id];
    selRing.style.left = (p.x - 17) * geo.s + 'px';
    selRing.style.top = (p.y - 17) * geo.s + 'px';
    selRing.style.width = selRing.style.height = 34 * geo.s + 'px';
  };

  // ---------------- the tree: ink (pixel lines on a canvas at art resolution)
  const linkStyle = (a, b) => {
    const da = !!S().nodes[a], db = !!S().nodes[b];
    if (da && db) return 'ink';
    if (da && nodeState(st, b) !== 'barred') return 'path';
    return 'pencil';
  };
  const draw = () => {
    if (!geo) return;
    const { aw, ah, pos, horiz } = geo;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(aw, ah);
    const d = img.data;
    const plot = (x, y, c, a = 255) => {
      if (x < 0 || y < 0 || x >= aw || y >= ah) return;
      const i = (y * aw + x) * 4, t = a / 255, u = d[i + 3] / 255;
      const na = t + u * (1 - t);
      if (na <= 0) return;
      for (let k = 0; k < 3; k++) d[i + k] = (c[k] * t + d[i + k] * u * (1 - t)) / na;
      d[i + 3] = na * 255;
    };
    const now = performance.now();
    const pal = LINE[line].pal;
    const wash = rgb(mixHex(pal[1], 0xf2e1b9, 0.25));
    const links = [];
    for (const n of nodesOf(line)) for (const r of n.req) if (NODE[r]?.line === line) links.push([r, n.id, linkStyle(r, n.id)]);
    const order = { pencil: 0, path: 1, ink: 2 };
    links.sort((a, b) => order[a[2]] - order[b[2]]);
    const clip = NODE_PX / 2 - 1;
    // the pencil rule under each tier the line hasn't reached yet
    const lv = st.skillLevel(line);
    for (let t = 1; t < TIERS; t++) {
      if (lv >= TIER_LV[t] || lv < TIER_LV[t - 1]) continue;
      const m = horiz ? Math.round(geo.padL + t * (aw - geo.padL - 2) / TIERS) : Math.round(ah - 2 - t * (ah - geo.padT - 2) / TIERS);
      for (let k = 0; k < (horiz ? ah : aw); k++) if (k % 4 < 2) horiz ? plot(m, k, PENCIL, 90) : plot(k, m, PENCIL, 90);
    }
    for (const [a, b, style] of links) {
      const p0 = pos[a], p3 = pos[b];
      if (!p0 || !p3) continue;
      const key = a + '>' + b;
      const an = anim?.links.get(key);
      let tEnd = 1;
      let st2 = style;
      if (an) {
        tEnd = Math.max(0, Math.min(1, (now - an.t0) / an.dur));
        if (an.kind === 'ink' && tEnd < 1) {
          // the old dashed path underneath, the new ink racing along it
          drawCurve(p0, p3, 'path', 1, plot, horiz, clip, wash, key);
        }
        st2 = an.kind;
      }
      drawCurve(p0, p3, st2, tEnd, plot, horiz, clip, wash, key);
    }
    ctx.putImageData(img, 0, 0);
  };
  const drawCurve = (p0, p3, style, tEnd, plot, horiz, clip, wash, key) => {
    const dx = p3.x - p0.x, dy = p3.y - p0.y;
    const k = (horiz ? Math.abs(dx) : Math.abs(dy)) * 0.55;
    const p1 = horiz ? { x: p0.x + k, y: p0.y } : { x: p0.x, y: p0.y - k };
    const p2 = horiz ? { x: p3.x - k, y: p3.y } : { x: p3.x, y: p3.y + k };
    const len = Math.hypot(dx, dy) + 1;
    const n = Math.ceil(len * 3);
    const seed = hashStr(key) % 1000;
    let lx = -9, ly = -9, count = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (t > tEnd) break;
      const u = 1 - t;
      let x = u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x;
      let y = u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y;
      const w = Math.sin(t * Math.PI) * Math.sin(t * 9 + seed) * 0.55;
      if (horiz) y += w; else x += w;
      const ix = Math.round(x), iy = Math.round(y);
      if (ix === lx && iy === ly) continue;
      const steep = Math.abs(ix - lx) < Math.abs(iy - ly);
      lx = ix; ly = iy;
      if (Math.hypot(ix - p0.x, iy - p0.y) < clip || Math.hypot(ix - p3.x, iy - p3.y) < clip) continue;
      count++;
      if (style === 'ink') {
        plot(ix, iy, INK, 255);
        if (steep) { plot(ix + 1, iy, INK, 150); plot(ix - 1, iy, wash, 90); }
        else { plot(ix, iy + 1, INK, 150); plot(ix, iy - 1, wash, 90); }
      } else if (style === 'path') {
        if (count % 6 < 4) plot(ix, iy, INK2, 235);
      } else if (count % 2 === 0) plot(ix, iy, PENCIL, 120);
    }
  };
  const animate = () => {
    cancelAnimationFrame(raf);
    const tick = () => {
      if (disposed) return;
      draw();
      if (anim && performance.now() < anim.until) raf = requestAnimationFrame(tick);
      else { anim = null; draw(); }
    };
    raf = requestAnimationFrame(tick);
  };

  // ---------------- actions
  const select = (id) => {
    if (!NODE[id]) return;
    if (NODE[id].line !== line) setLine(NODE[id].line, true);
    sel = sel === id && !isTouch() ? sel : id;
    hover = null;
    au.play('sk_pick');
    refreshNodes();
    renderDetail();
    // just enough scroll to show the Stamp button (under the tree on phones, down the right page on short screens)
    const box = root.dataset.mode === 'narrow' ? body : side;
    const a = detail.querySelector('.sk-act') || detail;
    const r = a.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.bottom > b.bottom) box.scrollBy({ top: r.bottom - b.bottom + 8, behavior: 'smooth' });
    else if (box === side && r.top < b.top) side.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const setLine = (id, quiet = false) => {
    if (!LINE[id] || id === line) return;
    line = id;
    S().view = id;
    sel = null; hover = null; anim = null;
    if (!quiet) au.play('page', { vol: 0.6 });
    buildNodes();
    renderAll();
    tree.classList.remove('turn'); void tree.offsetWidth; tree.classList.add('turn');
    requestAnimationFrame(layout);
  };
  const stamp = (id) => {
    const n = NODE[id];
    if (!n) return false;
    if (n.line !== line) setLine(n.line, true);
    const parents = n.req.filter((r) => S().nodes[r]);
    const r = unlock(st, id);
    if (!r.ok) {
      au.play('ui_error');
      const b = nodeEls[id];
      b?.classList.remove('nope'); void b?.offsetWidth; b?.classList.add('nope');
      return false;
    }
    sel = id;
    const now = performance.now();
    const links = new Map();
    for (const p of parents) links.set(p + '>' + id, { t0: now, dur: 340, kind: 'ink' });
    const kids = nodesOf(line).filter((m) => m.req.includes(id));
    for (const m of kids) links.set(id + '>' + m.id, { t0: now + 520, dur: 360, kind: linkStyle(id, m.id) });
    anim = { links, until: now + 920 };
    if (parents.length) au.play('sk_ink');
    // the seal: hold the old picture while the ink runs, then press it
    const b = nodeEls[id];
    const delay = parents.length ? 300 : 40;
    b?.classList.add('inking');
    renderPoints(true);
    renderTabs();
    renderCard();
    animate();
    setTimeout(() => {
      if (disposed) return;
      refreshNodes();
      renderDetail();
      b?.classList.remove('inking');
      b?.classList.remove('stamp'); void b?.offsetWidth; b?.classList.add('stamp');
      setTimeout(() => { if (!disposed) { au.play('sk_stamp'); burst(id); } }, 110);
      for (const m of kids) { const k = nodeEls[m.id]; if (k && nodeState(st, m.id) !== 'locked') { k.classList.remove('reveal'); void k.offsetWidth; k.classList.add('reveal'); } }
    }, delay);
    return true;
  };
  const burst = (id) => {
    if (!geo) return;
    const p = geo.pos[id], s = geo.s, pal = LINE[line].pal;
    const r = makeRng((performance.now() * 1000) | 0);
    const cx = p.x * s, cy = p.y * s;
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, d = (14 + r() * 16) * s;
      const ink = i % 4 === 3;
      const c = ink ? '#2e1a0e' : '#' + pal[r.int(0, 3)].toString(16).padStart(6, '0');
      const sz = Math.max(1, Math.round((ink ? 1 : 1 + r.int(0, 1)) * s));
      const dot = el('i', { class: 'sk-drop', style: { left: cx + 'px', top: cy + 'px', width: sz + 'px', height: sz + 'px', background: c } });
      dot.style.setProperty('--dx', Math.cos(a) * d + 'px');
      dot.style.setProperty('--dy', Math.sin(a) * d + 'px');
      dot.style.animationDelay = r() * 60 + 'ms';
      fxEl.append(dot);
      setTimeout(() => dot.remove(), 900);
    }
    const n = NODE[id];
    const [k, v] = Object.entries(n.fx)[0] || [];
    const txt = k && SKILL_KEYS[k] ? `${SKILL_KEYS[k].fmt(v)} ${SKILL_KEYS[k].kind === 'mult' ? SKILL_KEYS[k].label.toLowerCase() : ''}`.trim() : n.name;
    const tw = tree.clientWidth;
    const f = el('div', { class: 'sk-float', style: { left: Math.max(tw * 0.28, Math.min(tw * 0.72, cx)) + 'px', top: (cy - NODE_PX * s * 0.55) + 'px' } }, txt);
    f.style.setProperty('--lc', LINE[line].ink);
    fxEl.append(f);
    setTimeout(() => f.remove(), 1400);
    tree.classList.remove('thump'); void tree.offsetWidth; tree.classList.add('thump');
  };
  const doRespec = async () => {
    const cost = respecCost(st, line), ptsBack = spentIn(st, line);
    if (!ptsBack) return;
    const L = LINE[line];
    const ok = await ui.confirm(`Scrape the <b>${L.name}</b> page clean?<br>You get <b>${ptsBack} skill point${ptsBack > 1 ? 's' : ''}</b> back to spend again, for <b>${cost}g</b> of fresh parchment.`, 'Scrape', 'Keep');
    if (!ok || disposed) return;
    const r = respec(st, line);
    if (!r.ok) { au.play('ui_error'); ui.toast(r.reason, { kind: 'bad' }); return; }
    au.play('sk_scrape');
    sel = null;
    root.classList.remove('scraped'); void root.offsetWidth; root.classList.add('scraped');
    renderAll();
  };

  // ---------------- render everything
  const renderFoot = () => {
    const pts = spentIn(st, line), cost = respecCost(st, line);
    scrape.hidden = !pts;
    scrape.textContent = `Scrape page · ${cost}g`;
    scrape.title = `Unstamp every ${LINE[line].name} skill and get ${pts} point${pts === 1 ? '' : 's'} back`;
    const ready = nodesOf(line).some((n) => nodeState(st, n.id) === 'ready');
    hint.textContent = ready ? (isTouch() ? 'A seal is ready: tap it, then Stamp.' : 'A seal is ready: pick it and press Stamp.') : S().points ? 'Spend your points where the ink reaches.' : 'Level up a line to earn skill points.';
  };
  const renderAll = () => {
    renderPoints();
    renderTabs();
    renderCard();
    refreshNodes();
    renderDetail();
    renderLearn();
    renderFoot();
    draw();
  };

  buildNodes();
  renderAll();
  const ro = new ResizeObserver(() => layout());
  ro.observe(root);
  ro.observe(tree);
  requestAnimationFrame(layout);

  // live updates (XP while the page is open, points from elsewhere)
  const off = st.on('skill', (e) => {
    if (disposed) return;
    if (!root.isConnected) { dispose(); return; }
    if (e.type === 'unlock') return; // our own stamp animates itself
    if (e.type === 'xp' && e.line !== line) { renderTabs(); return; }
    renderAll();
  });
  const keys = (e) => {
    if (!root.isConnected) return;
    if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && opts.standalone) { // (in the book, arrows turn chapters)
      const i = SKILL_LINES.findIndex((l) => l.id === line);
      const j = (i + (e.code === 'ArrowRight' ? 1 : -1) + SKILL_LINES.length) % SKILL_LINES.length;
      if (e.target?.tagName !== 'INPUT') { setLine(SKILL_LINES[j].id); e.preventDefault(); }
    } else if ((e.code === 'Enter' || e.code === 'Space') && sel && document.activeElement?.classList?.contains('sk-node') && nodeState(st, sel) === 'ready') {
      stamp(sel); e.preventDefault();
    }
  };
  window.addEventListener('keydown', keys);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    off();
    window.removeEventListener('keydown', keys);
    S().opened = st.data.playTime || 0;
  };
  S().opened = st.data.playTime || 0;
  ui.skillNudge?.clear();
  return { el: root, dispose, select, stamp, line: setLine, layout, get selected() { return sel; }, get current() { return line; } };
}

// ------------------------------------------------------------------ standalone (ui.openSkills)
export function openSkills(game, line) {
  const ui = game.ui;
  const page = el('div', { class: 'sk-page' });
  const cover = el('div', { class: 'ib-cover sk-cover' }, [page]);
  const book = el('div', { class: 'ib sk-book' }, [el('i', { class: 'ib-ribbon' }), cover]);
  game.audio.play('page');
  let ctl = null;
  const h = ui.openPanel({ body: book, className: 'ib-panel sk-panel', onClose: () => ctl?.dispose() });
  h.kind = 'skills';
  ctl = renderSkills(page, game, { line, standalone: true });
  h.debug = ctl;
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

  // ---- the XP ribbon (slides in by the left edge when a line learns something)
  const chipSeal = el('img', { class: 'pix', alt: '' });
  const chipBar = el('i');
  const chipLv = el('em');
  const chipN = el('b');
  const chip = el('div', { class: 'sk-chip', 'aria-hidden': 'true' }, [chipSeal, el('div', { class: 'sk-chip-t' }, [el('div', { class: 'sk-chip-bar' }, [chipBar]), chipLv]), chipN]);
  ui.hud.append(chip);
  const acc = {};
  let chipT = 0, chipLine = null, chipShown = 0;
  const showChip = (line, n, lvl = false) => {
    const L = LINE[line];
    const info = lineInfo(st, line);
    if (chipLine !== line) { chipSeal.src = lineSealURL(L); chip.style.setProperty('--lc', L.ink); chipShown = 0; }
    chipLine = line;
    chipShown += n;
    chipN.textContent = lvl ? `Lv ${info.level}!` : `+${Math.max(1, Math.round(chipShown))}`;
    chipLv.textContent = `${L.name} ${info.level}`;
    chipBar.style.width = (info.frac * 100).toFixed(1) + '%';
    chip.classList.add('show');
    chip.classList.toggle('lvl', lvl);
    chip.classList.remove('tick'); void chip.offsetWidth; chip.classList.add('tick');
    clearTimeout(chipT);
    chipT = setTimeout(() => { chip.classList.remove('show'); chipShown = 0; }, lvl ? 3400 : 2400);
  };

  // ---- level-up note (a pinned toast with the line's seal pressing in)
  const levelToast = (e) => {
    const L = LINE[e.line];
    const big = e.level % 5 === 0;
    const t = el('div', { class: 'toast good sk-toast' + (big ? ' big' : ''), role: 'status', title: 'Open your skills' }, [
      el('img', { class: 'pix toast-tack', src: SPR.tack(0x5a9a3a), alt: '' }),
      el('img', { class: 'pix sk-toast-seal', src: lineSealURL(L), alt: '' }),
      el('span', { class: 'toast-text', html: `<b>${L.name}</b> is now <b>level ${e.level}</b>!<small>+${e.points} skill point${e.points > 1 ? 's' : ''} · ${isTouch() ? 'tap to spend' : '<kbd>B</kbd> to spend'}</small>` }),
    ]);
    t.style.setProperty('--lc', L.ink);
    t.addEventListener('click', () => openTree(e.line));
    ui.toasts.append(t);
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
