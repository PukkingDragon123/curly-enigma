// The survey map: the radar's notes drawn up as an ink map on graph paper, clipped to a board.
// North is up. Drag to pan, +/− (or the wheel) to zoom, the depth ruler on the side picks the layer.
// "Head home" calls the scene's headHome() hook.
import { el, clamp } from '../core/util.js';
import { Px, mixHex } from './uiArt.js';
import { DSPR, plotGlyph } from './deepArt.js';
import { gridSampler, MARK_COLOR, LEVEL_GAP } from './Radar.js';
import { ZONES } from '../data/zones.js';

// depth bands (meters below the burrow floor), per docs/DEEP.md
const BANDS = [[0, 25], [25, 55], [55, 90], [90, 130], [130, 170], [170, 210]];
const MAX_DEPTH = 210;
const INK = 0x4a2c16, PAPER = 0xf2e1b9;
const INK_FOR = { home: 0xb8402c, town: 0x8a5a10, station: 0x7a4a14, stake: 0x2e7a3a, enemy: 0xc0302a, danger: 0xc0302a };
const NAMES = { home: 'Home', town: 'Deep Town', station: 'Lift station', stake: 'Glow stake', enemy: 'Creature', danger: 'Danger', ore: 'Ore' };

export function zoneAt(depth) {
  const i = BANDS.findIndex(([a, b]) => depth >= a && depth < b);
  const k = i < 0 ? (depth < 0 ? 0 : BANDS.length - 1) : i;
  return { i: k, name: ZONES[k + 1]?.name || '', color: ZONES[k + 1]?.color || '#8a6a48' };
}

const pxUnit = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;

/** Small legend swatches. */
function legendIcon(kind) {
  const p = new Px(9, 9);
  if (kind === 'open') { p.rect(1, 1, 7, 7, 0xfaf0d6); p.box(1, 1, 7, 7, INK); }
  else if (kind === 'rock') { p.rect(1, 1, 7, 7, 0xe2cba0); for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if ((i + j) % 3 === 0 && i > 0 && j > 0 && i < 8 && j < 8) p.set(i, j, 0x9a7a52); }
  else if (kind === 'water') { p.rect(1, 1, 7, 7, 0xa8cbe0); p.box(1, 1, 7, 7, 0x2a5a8a); p.set(3, 4, 0x6a9ac0); p.set(5, 5, 0x6a9ac0); }
  else if (kind === 'lava') { p.rect(1, 1, 7, 7, 0xf0a878); p.box(1, 1, 7, 7, 0xa8321e); p.set(4, 4, 0xd8603a); }
  else if (kind === 'you') { p.poly([[4.5, 0.5], [8, 8], [4.5, 6], [1, 8]], 0xd0302a); p.outline(0x2a1408); }
  else if (kind === 'danger') { for (let a = 0; a < 16; a++) if (a % 2 === 0) p.set(Math.round(4 + Math.cos(a / 16 * Math.PI * 2) * 3.4), Math.round(4 + Math.sin(a / 16 * Math.PI * 2) * 3.4), INK_FOR.danger); p.set(4, 4, INK_FOR.danger); }
  else if (kind === 'ore') { plotGlyph(p, 'ore', 4.5, 4.5, 0xd9773f, 0x2a1a10); }
  else plotGlyph(p, kind, 4.5, 4.5, INK_FOR[kind] || INK, 0xfaf0d6);
  return p.url();
}
const LEGEND = [['you', 'You'], ['home', 'Home'], ['town', 'Deep Town'], ['station', 'Lift station'], ['stake', 'Glow stake'], ['ore', 'Ore'], ['danger', 'Danger'], ['enemy', 'Creature'], ['open', 'Tunnel'], ['rock', 'Rock'], ['water', 'Water'], ['lava', 'Lava']];
const legendCache = new Map();

export function openSurvey(game, radar) {
  const ui = game.ui;
  if (!radar || !radar.provider) return null;
  let base = radar.poll() || radar.data;
  if (!base) return null;
  const youDepth = -base.y;
  let layer = Math.round(youDepth); // meters (positive down)
  let data = base;
  let zoom = 0; // art px per meter (0 = fit)
  let vcx = base.x, vcz = base.z;
  let px = pxUnit();
  let map = null, W = 0, H = 0, sc = null;
  const scratch = () => { if (!sc || sc.w !== W || sc.h !== H) sc = new Px(W, H); sc.d.fill(0); return sc; };

  // ---------------- structure
  const labels = el('div', { class: 'sv-labels' });
  const canvasHost = el('div', { class: 'sv-canvas' }, [labels]);
  const tip = el('div', { class: 'sv-tip', hidden: true });
  const zoomIn = el('button', { class: 'sv-zb', 'aria-label': 'Zoom in', onclick: () => setZoom(zoom + 1) }, '+');
  const zoomOut = el('button', { class: 'sv-zb', 'aria-label': 'Zoom out', onclick: () => setZoom(zoom - 1) }, '−');
  if (!legendCache.has('you')) legendCache.set('you', legendIcon('you'));
  const recenter = el('button', { class: 'sv-zb', 'aria-label': 'Center on you', title: 'Center on you', onclick: () => { vcx = data.x; vcz = data.z; game.audio.play('ui_click'); redraw(); } }, [el('img', { class: 'pix', src: legendCache.get('you'), alt: '' })]);
  const mapEl = el('div', { class: 'sv-map' }, [canvasHost, tip, el('img', { class: 'pix sv-compass', src: DSPR.compass(), alt: '' }), el('div', { class: 'sv-zoom' }, [zoomIn, zoomOut, recenter])]);

  const knob = el('i', { class: 'sv-knob' });
  const youMark = el('i', { class: 'sv-you', title: 'You are here' });
  const bands = BANDS.map(([a, b], i) => {
    const z = ZONES[i + 1];
    const band = el('div', { class: 'sv-band', title: `${z?.name || ''} · ${a}–${b} m`, style: { flexGrow: String(b - a) } });
    band.style.setProperty('--zc', z?.color || '#8a6a48');
    return band;
  });
  const track = el('div', { class: 'sv-track' }, [...bands, knob, youMark]);
  const ruler = el('div', { class: 'sv-ruler' }, [
    el('button', { class: 'sv-step', 'aria-label': 'Shallower', title: 'Shallower', onclick: () => setLayer(layer - 5) }, [el('img', { class: 'pix', src: DSPR.tri('up', 0x4a2c16), alt: '' })]),
    track,
    el('button', { class: 'sv-step', 'aria-label': 'Deeper', title: 'Deeper', onclick: () => setLayer(layer + 5) }, [el('img', { class: 'pix', src: DSPR.tri('down', 0x4a2c16), alt: '' })]),
    el('button', { class: 'sv-here', onclick: () => setLayer(Math.round(youDepth)) }, 'Here'),
  ]);
  const layerTxt = el('span', { class: 'sv-layer' });
  const dists = el('div', { class: 'sv-dists' });
  const legend = el('ul', { class: 'sv-legend' }, LEGEND.map(([k, label]) => {
    if (!legendCache.has(k)) legendCache.set(k, legendIcon(k));
    return el('li', {}, [el('img', { class: 'pix', src: legendCache.get(k), alt: '' }), label]);
  }));
  const canHome = typeof game.scene?.headHome === 'function';
  const homeBtn = el('button', { class: 'btn sv-home', disabled: !canHome, title: canHome ? 'Follow the safest known way back to the burrow' : 'No way home is known from here', onclick: () => { h.close(); try { game.scene.headHome(); } catch (e) { console.warn(e); } } }, 'Head home');
  const keyBtn = el('button', { class: 'btn alt sv-keybtn', onclick: () => root.classList.toggle('show-key') }, 'Key');
  const root = el('div', { class: 'sv' }, [
    el('img', { class: 'pix sv-clip', src: DSPR.clip(), alt: '' }),
    el('div', { class: 'sv-sheet' }, [
      el('header', { class: 'sv-head' }, [el('h2', {}, 'Survey Map'), layerTxt, el('span', { class: 'spacer' }), dists]),
      el('div', { class: 'sv-body' }, [mapEl, ruler]),
      el('footer', { class: 'sv-foot' }, [legend, el('span', { class: 'spacer' }), keyBtn, el('button', { class: 'btn alt', onclick: () => h.close() }, 'Back'), homeBtn]),
    ]),
  ]);

  // ---------------- layer
  const setLayer = (d) => {
    layer = clamp(Math.round(d), 0, MAX_DEPTH);
    const fresh = radar.poll({ survey: true, y: -layer });
    data = fresh || base;
    game.audio.play('ui_click', { pitch: 1.2 });
    layoutRuler();
    redraw();
  };
  const layoutRuler = () => {
    knob.style.top = (layer / MAX_DEPTH * 100).toFixed(2) + '%';
    youMark.style.top = (clamp(youDepth, 0, MAX_DEPTH) / MAX_DEPTH * 100).toFixed(2) + '%';
    const z = zoneAt(layer);
    layerTxt.textContent = `${layer} m · ${z.name}${Math.abs(layer - youDepth) <= LEVEL_GAP ? ' · you are here' : ''}`;
  };
  let dragRuler = null;
  track.addEventListener('pointerdown', (e) => { e.preventDefault(); dragRuler = e.pointerId; try { track.setPointerCapture(e.pointerId); } catch (err) { /* noop */ } rulerTo(e); });
  track.addEventListener('pointermove', (e) => { if (e.pointerId === dragRuler) rulerTo(e); });
  for (const ev of ['pointerup', 'pointercancel']) track.addEventListener(ev, (e) => { if (e.pointerId === dragRuler) dragRuler = null; });
  const rulerTo = (e) => {
    const r = track.getBoundingClientRect();
    const d = clamp((e.clientY - r.top) / r.height, 0, 1) * MAX_DEPTH;
    const snapped = Math.round(d / 5) * 5;
    if (snapped !== layer) setLayer(snapped);
  };

  // ---------------- map drawing
  const fitZoom = () => {
    const ex = data.explored;
    // open close enough to read the tunnels around you (about 48 m across), never smaller than 1 px/m
    const span = Math.min(48, ex ? ex.size * (ex.cell || 1) : (data.range || 24) * 2);
    return clamp(Math.floor(Math.min(W, H) / span), 1, 5);
  };
  const setZoom = (z) => {
    const nz = clamp(z, 1, 6);
    if (nz === zoom) return;
    zoom = nz;
    game.audio.play('ui_click');
    redraw();
  };
  const toMap = (wx, wz) => [W / 2 + (wx - vcx) * zoom, H / 2 + (wz - vcz) * zoom];

  const resize = () => {
    px = pxUnit();
    const r = mapEl.getBoundingClientRect();
    const w = Math.max(40, Math.floor(r.width / px)), hh = Math.max(40, Math.floor(r.height / px));
    if (!map || w !== W || hh !== H) {
      W = w; H = hh;
      map = new Px(W, H);
      map.c.className = 'pix';
      canvasHost.querySelector('canvas')?.remove();
      canvasHost.prepend(map.c);
    }
    map.c.style.width = W * px + 'px';
    map.c.style.height = H * px + 'px';
    canvasHost.style.width = W * px + 'px';
    canvasHost.style.height = H * px + 'px';
    if (!zoom) zoom = fitZoom();
    redraw();
  };

  let raf = 0;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  const draw = () => {
    if (!map) return;
    const p = map;
    const sample = gridSampler(data);
    const k = zoom;
    const at = (i, j) => sample(vcx + (i + 0.5 - W / 2) / k, vcz + (j + 0.5 - H / 2) / k);
    const cells = new Uint8Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) cells[j * W + i] = at(i, j);
    const cAt = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : cells[j * W + i]);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const wx = vcx + (i + 0.5 - W / 2) / k, wz = vcz + (j + 0.5 - H / 2) / k;
        const v = cells[j * W + i];
        let c = PAPER;
        // graph paper: thin lines every 5 m, darker every 25 m
        const gx = ((wx % 5) + 5) % 5, gz = ((wz % 5) + 5) % 5;
        if (gx < 1 / k || gz < 1 / k) c = (((wx % 25) + 25) % 25 < 1 / k || ((wz % 25) + 25) % 25 < 1 / k) ? 0xd8bf8e : 0xe6d2a6;
        if (v === 4) c = (i + j) % 3 === 0 ? 0x9a7a52 : mixHex(c, 0xd8bf8a, 0.55);
        else if (v >= 1 && v <= 3) {
          let e = false;
          for (const [oi, oj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = cAt(i + oi, j + oj); if (n === 0 || n === 4) { e = true; break; } }
          if (v === 1) c = e ? INK : 0xfaf0d6;
          else if (v === 2) c = e ? 0x2a5a8a : (i * 3 + j * 5) % 9 === 0 ? 0x6a9ac0 : 0xa8cbe0;
          else c = e ? 0xa8321e : (i * 7 + j * 3) % 11 === 0 ? 0xd8603a : 0xf0a878;
        }
        p.set(i, j, c);
      }
    // markers
    labels.innerHTML = '';
    const marks = data.markers || [];
    const off = (m) => Math.abs((-(m.y ?? data.y)) - layer) > LEVEL_GAP * 2;
    for (const m of marks) {
      if (m.kind !== 'danger') continue;
      const [sx, sy] = toMap(m.x, m.z);
      const rr = (m.r || 4) * k;
      const a = off(m) ? 90 : 255;
      for (let s = 0; s < 64; s++) {
        if (s % 4 >= 2) continue;
        const t = (s / 64) * Math.PI * 2;
        p.set(Math.round(sx + Math.cos(t) * rr), Math.round(sy + Math.sin(t) * rr), INK_FOR.danger, a);
      }
      for (let j = Math.floor(sy - rr); j <= sy + rr; j++)
        for (let i = Math.floor(sx - rr); i <= sx + rr; i++)
          if ((i + j) % 4 === 0 && Math.hypot(i + 0.5 - sx, j + 0.5 - sy) < rr - 1) p.set(i, j, 0xe07a5a, Math.round(a * 0.7));
    }
    const edgeLabel = (m, color) => {
      // out of view: an arrow on the map's edge pointing at it
      const [sx, sy] = toMap(m.x, m.z);
      const dx = sx - W / 2, dy = sy - H / 2;
      const s = Math.min((W / 2 - 6) / Math.abs(dx || 1e-6), (H / 2 - 6) / Math.abs(dy || 1e-6));
      const ex = W / 2 + dx * s, ey = H / 2 + dy * s;
      const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
      const pts = [[ex + ux * 4, ey + uy * 4], [ex - ux * 2 - uy * 3, ey - uy * 2 + ux * 3], [ex - ux * 2 + uy * 3, ey - uy * 2 - ux * 3]];
      const o = scratch();
      o.poly(pts, color);
      o.outline(0xfaf0d6);
      p.blit(o);
      const dist = Math.round(Math.hypot(m.x - data.x, m.z - data.z));
      addLabel(`${m.label || NAMES[m.kind]} ${dist} m`, ex - ux * 8, ey - uy * 8, 'edge');
    };
    const addLabel = (text, x, y, cls = '') => {
      const l = el('span', { class: 'sv-lab ' + cls }, text);
      // anchor toward the inside of the map so labels near an edge stay readable
      const ax = x < W * 0.28 ? '0%' : x > W * 0.72 ? '-100%' : '-50%';
      l.style.left = Math.round(clamp(x, 2, W - 2) * px) + 'px';
      l.style.top = Math.round(clamp(y, 2, H - 8) * px) + 'px';
      l.style.transform = `translate(${ax}, ${cls === 'edge' ? '-50%' : '0'})`;
      labels.append(l);
      // keep labels from piling on top of each other: nudge down until it's clear
      const mine = () => l.getBoundingClientRect();
      for (let tries = 0; tries < 4; tries++) {
        const r = mine();
        const hit = placed.find((q) => r.left < q.right && r.right > q.left && r.top < q.bottom && r.bottom > q.top);
        if (!hit) break;
        l.style.top = (parseFloat(l.style.top) + (hit.bottom - r.top) + 2) + 'px';
      }
      placed.push(mine());
    };
    const placed = [];
    for (const m of marks) {
      if (m.kind === 'danger') continue;
      const [sx, sy] = toMap(m.x, m.z);
      const inView = sx >= 2 && sy >= 2 && sx < W - 2 && sy < H - 2;
      const ink = m.kind === 'ore' ? mixHex(m.color ?? MARK_COLOR.ore, 0x2a1a10, 0.2) : INK_FOR[m.kind] ?? INK;
      if (!inView) { if (m.kind === 'home' || m.kind === 'town') edgeLabel(m, ink); continue; }
      const faded = off(m);
      const a = faded ? 110 : 255;
      const glyph = m.kind === 'ore' ? 'ore' : m.kind;
      if (faded && m.kind !== 'home' && m.kind !== 'town') plotGlyph(p, -(m.y ?? 0) < layer ? 'up' : 'down', sx, sy, ink, 0xfaf0d6, a);
      else plotGlyph(p, glyph, sx, sy, ink, m.kind === 'ore' ? 0x2a1a10 : 0xfaf0d6, a);
      if ((m.kind === 'home' || m.kind === 'town' || m.kind === 'station') && !faded) addLabel(m.label || NAMES[m.kind], sx, sy + 4, m.kind);
    }
    // you
    const [ux, uy] = toMap(data.x, data.z);
    const hd = data.heading || 0, fx = -Math.sin(hd), fz = -Math.cos(hd);
    const rx = -fz, rz = fx;
    const ya = Math.abs(layer - youDepth) <= LEVEL_GAP * 2 ? 255 : 120;
    const o = scratch();
    o.poly([[ux + fx * 5, uy + fz * 5], [ux - fx * 3 + rx * 3.5, uy - fz * 3 + rz * 3.5], [ux - fx * 1.5, uy - fz * 1.5], [ux - fx * 3 - rx * 3.5, uy - fz * 3 - rz * 3.5]], 0xd0302a);
    o.outline(0x2a1408);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (o.a(i, j)) p.set(i, j, o.get(i, j), ya);
    p.ctx.putImageData(p.img, 0, 0);

    // distance chips
    dists.innerHTML = '';
    for (const kind of ['home', 'town']) {
      const m = marks.find((x) => x.kind === kind);
      if (!m) continue;
      const d = Math.round(Math.hypot(m.x - base.x, m.z - base.z));
      const dd = Math.round(-(m.y ?? 0) - youDepth);
      if (!legendCache.has(kind)) legendCache.set(kind, legendIcon(kind));
      dists.append(el('span', { class: 'sv-chip' }, [el('img', { class: 'pix', src: legendCache.get(kind), alt: '' }), `${m.label || NAMES[kind]} ${d} m${Math.abs(dd) > LEVEL_GAP ? (dd < 0 ? ` · ${-dd} m up` : ` · ${dd} m down`) : ''}`]));
    }
  };

  // ---------------- pan, zoom, tooltips
  let drag = null;
  mapEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    try { mapEl.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  });
  mapEl.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX; drag.y = e.clientY;
      vcx -= dx / (zoom * px);
      vcz -= dy / (zoom * px);
      tip.hidden = true;
      redraw();
    } else if (e.pointerType === 'mouse') hover(e);
  });
  for (const ev of ['pointerup', 'pointercancel']) mapEl.addEventListener(ev, (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.moved < 6) hover(e, true);
    drag = null;
  });
  mapEl.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
  const hover = (e, sticky = false) => {
    const r = canvasHost.getBoundingClientRect();
    const mx = (e.clientX - r.left) / px, my = (e.clientY - r.top) / px;
    let best = null, bd = 6;
    for (const m of data.markers || []) {
      const [sx, sy] = toMap(m.x, m.z);
      const d = Math.hypot(sx - mx, sy - my) - (m.kind === 'danger' ? (m.r || 4) * zoom : 0);
      if (d < bd) { bd = d; best = m; }
    }
    if (!best) { if (sticky || !tip.hidden) tip.hidden = true; return; }
    const dist = Math.round(Math.hypot(best.x - base.x, best.z - base.z));
    const dd = Math.round(-(best.y ?? base.y) - youDepth);
    tip.innerHTML = '';
    tip.append(el('b', {}, best.label || NAMES[best.kind] || best.kind), el('span', {}, `${dist} m away${Math.abs(dd) > LEVEL_GAP ? (dd < 0 ? `, ${-dd} m up` : `, ${dd} m down`) : ''}`));
    tip.style.left = Math.round(e.clientX - mapEl.getBoundingClientRect().left) + 'px';
    tip.style.top = Math.round(e.clientY - mapEl.getBoundingClientRect().top) + 'px';
    tip.hidden = false;
  };

  game.audio.play('page');
  const onResize = () => resize();
  window.addEventListener('resize', onResize);
  const h = ui.openPanel({ body: root, className: 'sv-panel', onClose: () => { window.removeEventListener('resize', onResize); if (raf) cancelAnimationFrame(raf); } });
  h.kind = 'survey';
  layoutRuler();
  requestAnimationFrame(resize);
  return h;
}
