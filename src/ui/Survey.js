// The hand-drawn map (the Map chapter of the book). Old Star's way of mapping: ink on parchment,
// and only where you have actually walked. Tunnels are inked as dug passages (a firm wall line,
// hachures and cross-hatching for the rock, stipple fading into blank paper), water gets a blue
// wash and wave lines, landmarks get little doodles with hand-lettered names. Ground you walked
// since the map was last opened is inked in by a quill when you open it.
// Layers are the zones (the one you're in by default). Drag to pan, wheel / pinch / +− to zoom,
// pins to mark your own spots. Data: state.data.deep.explored ("x,y,z" → 1 open, 2 water, 3 lava,
// 1 m cells, recorded by the mine), the world plan (lifts, burrows, ruins, trails, lakes), quests.
// Save: state.data.atlas = { pins: [{ id, zone, x, z, kind }], seen: { zone: ord } }.
//   renderMap(host, game, { focus }) → controller { resize, dispose, focus, setZone, debug }
//   openSurvey(game) opens the book at the map (old callers: the radar, M).
import { el, clamp, makeNoise2D } from '../core/util.js';
import { Px } from './uiArt.js';
import { INKC, WASH, hand, textW, paperPatch, wline, wcircle, DOODLE, youArrow, questMark, compass, scaleBar, hash } from './mapInk.js';
import { BART, PIN_KINDS, PIN_NAMES, pinPx } from './bookArt.js';
import { SFX } from './bookSfx.js';
import { ZONE_DEPTHS, ZONE_NAMES } from '../data/quests.js';
import { stepGoal, caveIns } from '../core/questWhere.js';
import { ZONES } from '../data/zones.js';
import { ITEMS } from '../data/items.js';
import './atlas.css';

const ZOOMS = [1, 2, 3, 4, 6];
const PAPER = 0xf2e1b9, FLOOR = 0xfbf2dc;
const pxUnit = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
const keyXZ = (x, z) => (x + 2048) * 4096 + (z + 2048);

/** Zone (1..6) of a depth in meters (positive down). */
export function zoneOfDepth(d) {
  for (let z = 1; z < ZONE_DEPTHS.length; z++) if (d < ZONE_DEPTHS[z]) return z;
  return 6;
}
const zoneOfY = (y) => zoneOfDepth(-(y + 0.5));
/** Kept for old imports: { i, name, color } of a depth. */
export function zoneAt(depth) {
  const z = zoneOfDepth(depth);
  return { i: z - 1, name: ZONE_NAMES[z], color: ZONES[z]?.color || '#8a6a48' };
}

/** The book at the map. */
export function openSurvey(game) { return game.ui.openBook ? game.ui.openBook('map') : null; }

// ---------------------------------------------------------------- explored cells, indexed by zone
const IDX = { src: null, n: 0, zones: new Map() };
/** Per zone: Map(keyXZ → { x, z, v, y0, y1, ord }). Incremental: only new keys are parsed. */
export function exploredIndex(st) {
  const ex = st.data.deep?.explored || {};
  const keys = Object.keys(ex);
  if (IDX.src !== ex || keys.length < IDX.n) { IDX.src = ex; IDX.n = 0; IDX.zones = new Map(); }
  for (let i = IDX.n; i < keys.length; i++) {
    const k = keys[i];
    const c1 = k.indexOf(','), c2 = k.indexOf(',', c1 + 1);
    const x = +k.slice(0, c1), y = +k.slice(c1 + 1, c2), z = +k.slice(c2 + 1);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    const v = ex[k] | 0 || 1;
    const zone = zoneOfY(y);
    let m = IDX.zones.get(zone);
    if (!m) IDX.zones.set(zone, (m = new Map()));
    const kk = keyXZ(x, z);
    const c = m.get(kk);
    if (!c) m.set(kk, { x, z, v, y0: y, y1: y, ord: i });
    else { if (v < c.v) c.v = v; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y; }
  }
  IDX.n = keys.length;
  return IDX;
}

// ---------------------------------------------------------------- the world plan (also outside the mine)
let planCache = { key: null, plan: null };
async function loadPlan(game) {
  const sc = game.scene;
  if (sc?.world?.plan) return sc.world.plan;
  const d = game.state.data;
  if (!d.deep?.seed) return null;
  try {
    const [{ makePlan }, { roomSize }] = await Promise.all([import('../deep/Generator.js'), import('../iso/homeLayout.js')]);
    const [W, D] = roomSize(d.home?.level || 0);
    const key = `${d.deep.seed}:${W}:${D}`;
    if (planCache.key !== key) planCache = { key, plan: makePlan(d.deep.seed, { W, D, tunnels: (d.deep.tunnels || []).map((m) => ({ wall: m.wall, t: m.t })) }) };
    return planCache.plan;
  } catch (e) { console.warn('map: no plan', e); return null; }
}

// ---------------------------------------------------------------- parchment (paper space, cached per size)
const paperCache = new Map();
function paperFor(W, H) {
  const key = W + 'x' + H;
  if (paperCache.has(key)) return paperCache.get(key);
  const N = makeNoise2D(41);
  const buf = new Uint8ClampedArray(W * H * 4);
  const br = (PAPER >> 16) & 255, bg = (PAPER >> 8) & 255, bb = PAPER & 255;
  const stains = [
    { x: W * 0.8, y: H * 0.74, r: Math.min(W, H) * 0.15, ring: true, a0: 0.6, a1: 5.4 },
    { x: W * 0.13, y: H * 0.2, r: Math.min(W, H) * 0.09, ring: false },
    { x: W * 0.55, y: H * 0.93, r: Math.min(W, H) * 0.06, ring: true, a0: 2.2, a1: 7.9 },
  ];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let f = 1 + N.fbm(x / 38, y / 38, 3) * 0.1 + N(x / 7 + 11, y / 7) * 0.025;
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (e < 10) f -= ((10 - e) / 10) ** 2 * (0.12 + N(x / 5, y / 5) * 0.06);
      let r = br * f, g = bg * f, b = bb * f;
      for (const s of stains) {
        const d = Math.hypot(x - s.x, (y - s.y) * 1.15) + N(x / 9 + s.r, y / 9) * 3;
        if (s.ring) {
          const a = (Math.atan2(y - s.y, x - s.x) + Math.PI * 2) % (Math.PI * 2);
          const inArc = (a > s.a0 % (Math.PI * 2) && a < s.a1 % (Math.PI * 2)) || (s.a1 > Math.PI * 2 && a < s.a1 - Math.PI * 2);
          const ring = Math.abs(d - s.r);
          if (ring < 1.6 && inArc) { const k = (1.6 - ring) / 1.6 * 0.16; r -= 70 * k; g -= 85 * k; b -= 95 * k; }
          else if (d < s.r) { r -= 4; g -= 6; b -= 9; }
        } else if (d < s.r) {
          const k = d > s.r - 1.5 ? 0.1 : 0.04;
          r -= 60 * k; g -= 70 * k; b -= 90 * k;
        }
      }
      const h = hash(x, y, 13);
      if (h < 0.004) { r -= 40; g -= 45; b -= 50; } else if (h > 0.996) { r += 10; g += 10; b += 8; }
      const i = (y * W + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  // paper fibres
  for (let k = 0; k < (W * H) / 260; k++) {
    const x = Math.floor(hash(k, 1, 5) * W), y = Math.floor(hash(k, 2, 5) * H), len = 2 + Math.floor(hash(k, 3, 5) * 4), dy = hash(k, 4, 5) < 0.5 ? 0 : 1;
    for (let t = 0; t < len; t++) {
      const xx = x + t, yy = y + (t > len / 2 ? dy : 0);
      if (xx >= W || yy >= H) continue;
      const i = (yy * W + xx) * 4;
      buf[i] -= 12; buf[i + 1] -= 13; buf[i + 2] -= 14;
    }
  }
  // the folds: a crease down the middle and across, light on one side, shadow on the other
  const crease = (x, y, light) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4, d = light ? 9 : -16; buf[i] += d; buf[i + 1] += d; buf[i + 2] += d; };
  const fx = Math.round(W / 2), fy = Math.round(H / 2);
  for (let y = 0; y < H; y++) if (hash(fx, y, 51) < 0.9) { crease(fx, y, false); crease(fx + 1, y, true); }
  for (let x = 0; x < W; x++) if (hash(x, fy, 52) < 0.9) { crease(x, fy, false); crease(x, fy + 1, true); }
  if (paperCache.size > 6) paperCache.clear();
  paperCache.set(key, buf);
  return buf;
}

// ---------------------------------------------------------------- the map
export function renderMap(host, game, opts = {}) {
  const st = game.state;
  const atlas = (st.data.atlas ||= { pins: [], seen: {} });
  atlas.pins ||= [];
  atlas.seen ||= {};
  const noise = makeNoise2D(7);
  let px = pxUnit();
  let plan = null, planReady = false;
  let W = 0, H = 0, map = null, frame = null;
  let zone = 1, k = 3, vcx = 0, vcz = 0;
  let pinMode = null; // pin kind being placed
  let anim = null; // the ink-in animation
  let hits = []; // hover targets { x, y (map px), r, label, sub }
  let paintTaken = []; // lettering boxes of the sheet being drawn
  let dead = false;
  let raf = 0;

  // ---------------- where the mole is
  const where = () => {
    const sc = game.scene, name = game.sceneName;
    if (sc?.player?.pos && (name === 'deep' || name === 'mine')) return { x: sc.player.pos.x, y: sc.player.pos.y, z: sc.player.pos.z, yaw: sc.player.yaw || 0, live: true };
    const W0 = plan?.W ?? 10, D0 = plan?.D ?? 8;
    if (name === 'town' && plan) return { x: plan.town.x, y: plan.town.y, z: plan.town.z, yaw: 0, place: 'town' };
    return { x: W0 / 2, y: 0.5, z: D0 / 2, yaw: 0, place: 'home' };
  };

  // ---------------- DOM
  const canvasHost = el('div', { class: 'at-canvas' });
  const quill = el('img', { class: 'pix at-quill', src: BART.quill(), alt: '', hidden: true });
  const tip = el('div', { class: 'at-tip', hidden: true });
  const mapEl = el('div', { class: 'at-map', tabindex: '0', 'aria-label': 'Map: drag to look around' }, [canvasHost, quill, tip]);
  const zoneTitle = el('h2', { class: 'ib-title at-title' });
  const zoneSub = el('div', { class: 'at-sub' });
  const zb = (label, aria, fn) => el('button', { class: 'at-zb', 'aria-label': aria, title: aria, onclick: fn }, label);
  const youBtn = el('button', { class: 'at-zb at-you', 'aria-label': 'Back to you', title: 'Back to you', onclick: () => { recenter(); SFX.flick(game.audio); } }, [legendIcon('you', true)]);
  const zoomBox = el('div', { class: 'at-zoom' }, [zb('+', 'Zoom in', () => setZoom(1)), zb('−', 'Zoom out', () => setZoom(-1)), youBtn]);
  const layers = el('nav', { class: 'at-layers', 'aria-label': 'Depth layers' });
  const pinBtn = el('button', { class: 'at-tool at-pinbtn', title: 'Place pins', onclick: () => setPinMode(pinMode ? null : atlas.lastPin || 'pin') }, [el('img', { class: 'pix', src: BART.pin('pin'), alt: '' }), el('span', {}, 'Pins')]);
  const keyBtn = el('button', { class: 'at-tool', title: 'The key', onclick: () => { root.classList.toggle('show-key'); SFX.flick(game.audio); } }, [el('span', {}, 'Key')]);
  const pinBar = el('div', { class: 'at-pinbar', hidden: true }, [
    el('span', { class: 'at-pinhint' }, 'Tap the map to pin · tap a pin to pull it'),
    ...PIN_KINDS.map((kd) => el('button', { class: 'at-pk', 'data-k': kd, title: PIN_NAMES[kd], 'aria-label': PIN_NAMES[kd], onclick: () => setPinMode(kd) }, [el('img', { class: 'pix', src: BART.pin(kd), alt: '' })])),
    el('button', { class: 'at-tool', onclick: () => setPinMode(null) }, 'Done'),
  ]);
  const canHome = typeof game.scene?.headHome === 'function' && game.sceneName === 'deep';
  const homeBtn = canHome ? el('button', { class: 'btn at-home', title: 'Follow the safest known way back home', onclick: () => { opts.onClose?.(); try { game.scene.headHome(); } catch (e) { console.warn(e); } } }, 'Head home') : null;
  const KEY = [['you', 'You'], ['home', "Old Star's"], ['lift', 'Lift'], ['town', 'Deep Town'], ['burrow', 'Burrow'], ['ruin', 'Ruins'], ['lake', 'Water'], ['nest', 'Nest'], ['ore', 'Ore'], ['quest', 'Quest'], ['trail', 'Old trail'], ['stake', 'Glow stake']];
  const legend = el('ul', { class: 'at-key' }, KEY.map(([kd, label]) => el('li', {}, [legendIcon(kd), label])));
  const root = el('div', { class: 'at' }, [
    el('header', { class: 'at-head' }, [el('div', { class: 'at-tt' }, [zoneTitle, zoneSub]), el('span', { class: 'spacer' }), pinBtn, keyBtn]),
    el('div', { class: 'at-body' }, [mapEl, el('div', { class: 'at-side' }, [layers, zoomBox]), legend]),
    el('footer', { class: 'at-foot' }, [pinBar, el('span', { class: 'at-hint' }, 'Drag to look around · wheel or +/− to zoom'), el('span', { class: 'spacer' }), homeBtn]),
  ]);
  host.append(root);

  // ---------------- layers (zones)
  const zoneHas = (z) => (exploredIndex(st).zones.get(z)?.size || 0) > 0;
  const questZones = () => {
    const out = new Set();
    for (const t of questTargets()) if (t.zone) out.add(t.zone);
    return out;
  };
  const renderLayers = () => {
    layers.innerHTML = '';
    const me = zoneOfY(where().y);
    const qz = questZones();
    for (let z = 1; z <= 6; z++) {
      const open = z === 1 || zoneHas(z) || z === me;
      const b = el('button', {
        class: 'at-layer' + (z === zone ? ' on' : '') + (open ? '' : ' locked') + (z === me ? ' here' : ''),
        disabled: !open, title: open ? `${ZONE_NAMES[z]} · ${ZONE_DEPTHS[z - 1]}–${ZONE_DEPTHS[z]} m` : 'Not walked yet',
        onclick: () => setZone(z),
      }, [el('b', {}, String(z)), el('span', {}, open ? ZONE_NAMES[z] : '???'), qz.has(z) && z !== zone ? el('i', { class: 'at-qdot', title: 'A quest leads here' }) : null]);
      b.style.setProperty('--zc', ZONES[z]?.color || '#8a6a48');
      layers.append(b);
    }
  };
  const setZone = (z, { quiet = false, center = true } = {}) => {
    z = clamp(z | 0, 1, 6);
    if (z === zone && !center) return;
    finishAnim();
    zone = z;
    if (!quiet) { game.audio.play('page'); }
    if (center) recenter(false);
    renderLayers();
    titles();
    startReveal();
  };
  const titles = () => {
    zoneTitle.textContent = `The ${ZONE_NAMES[zone]}`.replace('The The', 'The');
    const me = where();
    const here = zoneOfY(me.y) === zone;
    zoneSub.textContent = `${ZONE_DEPTHS[zone - 1]}–${ZONE_DEPTHS[zone]} m down${here ? ' · you are here' : ''}`;
  };

  // ---------------- view
  const recenter = (redrawNow = true) => {
    const me = where();
    if (zoneOfY(me.y) === zone) { vcx = me.x; vcz = me.z; }
    else {
      // the middle of what you've walked in this layer, or the shaft
      const m = exploredIndex(st).zones.get(zone);
      if (m && m.size) { let sx = 0, sz = 0, n = 0; for (const c of m.values()) { sx += c.x; sz += c.z; n++; } vcx = sx / n; vcz = sz / n; }
      else if (plan) { vcx = plan.shaft.x; vcz = plan.shaft.z; }
    }
    if (redrawNow) redraw();
  };
  const setZoom = (dir, at) => {
    const i = ZOOMS.indexOf(k);
    const j = clamp(i + dir, 0, ZOOMS.length - 1);
    if (j === i) return;
    finishAnim();
    if (at) {
      // keep the world point under the cursor still
      const wx = vcx + (at.x - W / 2) / k, wz = vcz + (at.y - H / 2) / k;
      const nk = ZOOMS[j];
      vcx = wx - (at.x - W / 2) / nk; vcz = wz - (at.y - H / 2) / nk;
    }
    k = ZOOMS[j];
    SFX.flick(game.audio);
    redraw();
  };

  const resize = () => {
    if (dead) return;
    px = pxUnit();
    // layout size, not the rect: the book opens with a little scale animation
    const w = Math.max(40, Math.floor(mapEl.clientWidth / px)), h = Math.max(40, Math.floor(mapEl.clientHeight / px));
    let fresh = false;
    if (!map || w !== W || h !== H) {
      fresh = true;
      W = w; H = h;
      map = new Px(W, H);
      [map.c, map.ctx] = cpuCanvas(W, H); // drawn on the CPU every redraw: keep it off the GPU
      map.c.className = 'pix';
      canvasHost.querySelector('canvas')?.remove();
      canvasHost.prepend(map.c);
      finishAnim();
    }
    map.c.style.width = W * px + 'px';
    map.c.style.height = H * px + 'px';
    if (fresh && !anim) draw(); // never show a blank sheet
    else redraw();
  };
  const redraw = () => { if (!raf && !dead) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

  // ---------------- what's on the map
  function near(m, x, z, r, maxOrd) {
    if (!m) return false;
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), z0 = Math.floor(z - r), z1 = Math.floor(z + r);
    for (let zz = z0; zz <= z1; zz++)
      for (let xx = x0; xx <= x1; xx++) {
        const c = m.get(keyXZ(xx, zz));
        if (c && c.ord <= maxOrd && (xx + 0.5 - x) ** 2 + (zz + 0.5 - z) ** 2 <= r * r) return true;
      }
    return false;
  }
  function landmarks(z, maxOrd) {
    const out = [];
    const m = exploredIndex(st).zones.get(z);
    const q = st.data.quests;
    const lessonsAt = q?.active?.lessons ? q.active.lessons.s : q?.done?.lessons ? 99 : 0;
    const W0 = plan?.W ?? 10, D0 = plan?.D ?? 8;
    if (z === 1) out.push({ kind: 'home', x: W0 / 2, z: D0 / 2, label: "Old Star's", sub: 'His workshop, and the cage lift down to the mine' });
    if (!plan) return out;
    const P = plan.prologue;
    if (P && zoneOfY(P.y) === z && (lessonsAt >= 1 || near(m, P.x, P.z, 6, maxOrd))) out.push({ kind: 'dig', x: P.x, z: P.z, label: "Star's dig", sub: 'Old Star\'s practice dig' });
    const T = plan.town;
    const townKnown = st.flag('escaped') || near(exploredIndex(st).zones.get(zoneOfY(T.y)), T.x, T.z, 9, maxOrd);
    if (zoneOfY(T.y) === z && townKnown) out.push({ kind: 'town', x: T.x, z: T.z, label: 'Deep Town', sub: 'Shops, the assay office, the Surface Express' });
    if (townKnown && plan.shaft) out.push({ kind: 'shaft', x: plan.shaft.x, z: plan.shaft.z, label: z === zoneOfY(T.y) ? '' : 'Town shaft', sub: 'The town lift shaft runs down through every layer', small: true });
    const lifts = new Set((st.data.deep?.lifts || []).map((l) => l.id));
    for (const L of plan.lifts || []) {
      if (L.id[0] === 's' || L.id === 'L0' || zoneOfY(L.y) !== z) continue;
      if (!lifts.has(L.id) && !near(m, L.x, L.z, 2.5, maxOrd)) continue;
      out.push({ kind: 'lift', x: L.x, z: L.z, label: L.id === 'L0' ? 'Mine lift' : L.name, sub: `Old lift · ${Math.round(-L.y)} m`, small: true });
    }
    for (const b of plan.burrows || []) {
      if (zoneOfY(b.y) !== z) continue;
      if (!near(m, b.x, b.z, 7, maxOrd) && !atlas.known?.['burrow:' + b.id]) continue;
      out.push({ kind: 'burrow', variant: b.kind, x: b.x, z: b.z, label: b.name || b.kind, sub: { trader: 'Trades ore and supplies', herbalist: 'Herbs, tinctures, opinions', raccoon: 'Buys blades. No questions.', outpost: 'A warden and a warm stove' }[b.kind] || 'Somebody lives here' });
    }
    for (const r of plan.ruins || []) {
      if (zoneOfY(r.y) !== z || (!near(m, r.x, r.z, (r.r || 5) + 3, maxOrd) && !atlas.known?.['ruin:' + r.id])) continue;
      out.push({ kind: 'ruin', x: r.x, z: r.z, label: 'Ruins', sub: { cell: 'A monster room', crypt: 'A flooded crypt', vault: 'A Starfolk vault', fortress: 'A deep fortress' }[r.kind] || 'An old dungeon' });
    }
    for (const d of plan.dangers || []) {
      if (zoneOfY(d.y) !== z || !near(m, d.x, d.z, (d.r || 4) + 2, maxOrd)) continue;
      const kind = d.kind === 'water' ? 'lake' : d.kind === 'lava' ? 'lava' : d.kind === 'nest' ? 'nest' : 'gas';
      out.push({ kind, x: d.x, z: d.z, r: d.r, label: { lake: 'Lake', lava: 'Lava', nest: 'Nest', gas: 'Bad air' }[kind], sub: { lake: 'Deep water. Dig beside it and it comes to see you.', lava: 'Hot. Very.', nest: 'Something lives here. Something bitey.', gas: 'Don\'t breathe. Don\'t strike sparks.' }[kind], danger: kind === 'nest' || kind === 'gas' || kind === 'lava' });
    }
    for (const a of plan.areas || []) {
      if (zoneOfY(a.y) !== z || !near(m, a.x, a.z, a.geode ? 1.6 : 2.6, maxOrd)) continue;
      const it = ITEMS[a.item];
      const c = it?.icon?.ore?.[0] ?? it?.icon?.c?.[0] ?? 0xd9773f;
      out.push({ kind: 'ore', x: a.x, z: a.z, label: '', sub: it?.name || a.item, color: c, small: true, title: it?.name || a.item });
    }
    for (const s of st.data.deep?.stakes || []) if (zoneOfY(s.y) === z) out.push({ kind: 'stake', x: s.x, z: s.z, label: '', title: 'Glow stake', small: true });
    return out;
  }
  function questTargets() {
    const Q = game.quests;
    if (!Q || !plan) return [];
    const out = [];
    const me = where();
    const W0 = plan.W ?? 10, D0 = plan.D ?? 8;
    for (const v of Q.active()) {
      const w = stepGoal(v);
      if (!w || (!w.scene && !w.zone)) continue;
      let p = null, known = true;
      const nearestOf = (list, rr = 4) => {
        let best = null, bd = Infinity;
        for (const r of list) { const d = Math.hypot(r.x - me.x, (r.y - me.y) * 2, r.z - me.z); if (d < bd) { bd = d; best = r; } }
        known = !!best && near(exploredIndex(st).zones.get(zoneOfY(best.y)), best.x, best.z, (best.r || rr) + 3, Infinity);
        return best;
      };
      if (w.scene === 'home' || w.place === 'home') p = { x: W0 / 2, y: 0.5, z: D0 / 2 };
      else if (w.place === 'dig' && plan.prologue) p = plan.prologue;
      else if (w.scene === 'town' || w.place === 'town') { p = plan.town; known = !!st.flag('escaped'); }
      else if (w.burrow) { p = (plan.burrows || []).find((b) => b.id === w.burrow || b.kind === w.burrow); known = !!p && near(exploredIndex(st).zones.get(zoneOfY(p.y)), p.x, p.z, 7, Infinity); }
      else if (w.ruin) {
        const save = st.data.deep?.ruins || {};
        let list = (plan.ruins || []).filter((r) => w.ruin === 'nearest' || r.kind === w.ruin || r.id === w.ruin);
        const open = list.filter((r) => !save[r.id]?.chest);
        p = nearestOf(open.length ? open : list);
      } else if (w.danger || ['lake', 'lava', 'nest'].includes(w.sight)) {
        const kind = w.danger || { lake: 'water', lava: 'lava', nest: 'nest' }[w.sight];
        p = nearestOf((plan.dangers || []).filter((d) => d.kind === kind));
      } else if (w.sight === 'cavein') p = nearestOf(caveIns(plan), 2);
      else if (w.zone) { out.push({ id: v.id, title: v.title, zone: w.zone, onlyZone: true, tracked: v.tracked }); continue; }
      if (!p) continue;
      out.push({ id: v.id, title: v.title, text: v.text, x: p.x, y: p.y, z: p.z, zone: zoneOfY(p.y), known, tracked: v.tracked });
    }
    return out;
  }

  // ---------------- drawing
  /** Draw the layer into `out` (a Px). maxOrd hides cells walked after it (for the ink-in). */
  function paint(out, maxOrd = Infinity, { fx = true } = {}) {
    const p = out, d = p.d;
    d.set(paperFor(W, H));
    hits = [];
    const ox = Math.round(vcx * k - W / 2), oz = Math.round(vcz * k - H / 2); // world px of the left/top edge
    const m = exploredIndex(st).zones.get(zone);
    // pencil survey grid every 10 m
    const g = 10 * k;
    for (let i = 0; i < W; i++) {
      const wx = i + ox;
      if (((wx % g) + g) % g === 0) for (let j = 0; j < H; j++) if (hash(wx, j + oz, 3) < 0.55) p.set(i, j, INKC.pencil, 34);
    }
    for (let j = 0; j < H; j++) {
      const wz = j + oz;
      if (((wz % g) + g) % g === 0) for (let i = 0; i < W; i++) if (hash(i + ox, wz, 4) < 0.55) p.set(i, j, INKC.pencil, 34);
    }
    // ---- the open field: a meter grid around the view, softened, sampled per pixel with wobble
    const mx0 = Math.floor(ox / k) - 3, mz0 = Math.floor(oz / k) - 3;
    const GW = Math.ceil(W / k) + 7, GH = Math.ceil(H / k) + 7;
    const G = new Uint8Array(GW * GH);
    let any = false;
    if (m && m.size) {
      if (m.size < GW * GH) {
        for (const c of m.values()) {
          if (c.ord > maxOrd) continue;
          const gx = c.x - mx0, gz = c.z - mz0;
          if (gx >= 0 && gz >= 0 && gx < GW && gz < GH) { G[gz * GW + gx] = c.v; any = true; }
        }
      } else {
        for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) {
          const c = m.get(keyXZ(gx + mx0, gz + mz0));
          if (c && c.ord <= maxOrd) { G[gz * GW + gx] = c.v; any = true; }
        }
      }
    }
    const M = new Uint8Array(W * H); // 0 rock/unknown, 1 open, 2 water, 3 lava
    if (any) {
      const F = new Float32Array(GW * GH), T = new Float32Array(GW * GH);
      for (let i = 0; i < G.length; i++) F[i] = G[i] ? 1 : 0;
      for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) {
        const i = gz * GW + gx;
        T[i] = (F[i] * 2 + (gx > 0 ? F[i - 1] : 0) + (gx < GW - 1 ? F[i + 1] : 0)) / 4;
      }
      for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) {
        const i = gz * GW + gx;
        F[i] = (T[i] * 2 + (gz > 0 ? T[i - GW] : 0) + (gz < GH - 1 ? T[i + GW] : 0)) / 4;
      }
      const wob = 0.34;
      for (let j = 0; j < H; j++) {
        const wz = (j + oz + 0.5) / k;
        for (let i = 0; i < W; i++) {
          const wx = (i + ox + 0.5) / k;
          const sx = wx + noise(wx * 0.33, wz * 0.33) * wob - mx0 - 0.5, sz = wz + noise(wx * 0.33 + 31, wz * 0.33 + 17) * wob - mz0 - 0.5;
          const ix = Math.floor(sx), iz = Math.floor(sz);
          if (ix < 0 || iz < 0 || ix >= GW - 1 || iz >= GH - 1) continue;
          const fx_ = sx - ix, fz = sz - iz;
          const a = F[iz * GW + ix], b = F[iz * GW + ix + 1], c = F[(iz + 1) * GW + ix], e = F[(iz + 1) * GW + ix + 1];
          const f = (a * (1 - fx_) + b * fx_) * (1 - fz) + (c * (1 - fx_) + e * fx_) * fz;
          if (f <= 0.33) continue;
          const gi = Math.round(sz) * GW + Math.round(sx);
          let v = G[gi] || 0;
          if (!v) v = G[iz * GW + ix] || G[iz * GW + ix + 1] || G[(iz + 1) * GW + ix] || G[(iz + 1) * GW + ix + 1] || 1;
          M[j * W + i] = v;
        }
      }
    }
    // tidy the edge: lone specks go, pinholes fill
    for (let j = 1; j < H - 1; j++)
      for (let i = 1; i < W - 1; i++) {
        const q = j * W + i;
        const n = (M[q - 1] ? 1 : 0) + (M[q + 1] ? 1 : 0) + (M[q - W] ? 1 : 0) + (M[q + W] ? 1 : 0);
        if (M[q] && n <= 1) M[q] = 0;
        else if (!M[q] && n >= 3) M[q] = M[q - 1] || M[q + 1] || M[q - W] || M[q + W];
      }
    // ---- distance from the open ground (chamfer 2-3, halved)
    const CAP = 26;
    const D = new Uint8Array(W * H).fill(CAP);
    for (let i = 0; i < M.length; i++) if (M[i]) D[i] = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const q = j * W + i;
      let v = D[q];
      if (!v) continue;
      if (i > 0) v = Math.min(v, D[q - 1] + 2);
      if (j > 0) { v = Math.min(v, D[q - W] + 2); if (i > 0) v = Math.min(v, D[q - W - 1] + 3); if (i < W - 1) v = Math.min(v, D[q - W + 1] + 3); }
      D[q] = v;
    }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
      const q = j * W + i;
      let v = D[q];
      if (!v) continue;
      if (i < W - 1) v = Math.min(v, D[q + 1] + 2);
      if (j < H - 1) { v = Math.min(v, D[q + W] + 2); if (i < W - 1) v = Math.min(v, D[q + W + 1] + 3); if (i > 0) v = Math.min(v, D[q + W - 1] + 3); }
      D[q] = v;
    }
    // ---- ink: floors, washes, hatching, stipple, walls (a better mapper inks more of the rock round a tunnel)
    const inkK = clamp(st.skill?.('ink') || 1, 1, 2);
    const sx = (k >= 3 ? 4 : 3);
    for (let j = 0; j < H; j++) {
      const wy = j + oz;
      for (let i = 0; i < W; i++) {
        const q = j * W + i, wx = i + ox;
        const v = M[q];
        if (v) {
          if (v === 2) {
            p.set(i, j, 0xc4dce0, 255);
            if (((wy + Math.round(Math.sin(wx * 0.7) * 1.2)) % 4 + 4) % 4 === 0 && hash(wx >> 2, wy, 8) < 0.8) p.set(i, j, INKC.blue, 190);
          } else if (v === 3) {
            p.set(i, j, 0xf4b088, 255);
            if (((wx + wy) % 3 + 3) % 3 === 0 && hash(wx, wy >> 1, 9) < 0.5) p.set(i, j, INKC.red, 150);
          } else {
            p.set(i, j, FLOOR, 200);
            if (hash(wx, wy, 6) < 0.008) p.set(i, j, INKC.pencil, 110);
          }
          continue;
        }
        const dd = D[q] / 2;
        if (dd > 12) continue;
        const press = noise(wx * 0.11, wy * 0.11);
        const hw = Math.min(11, (4 + press * 2.6) * (0.8 + inkK * 0.2));
        // a faint wash of rock tone hugging the walls
        if (dd < 5) p.set(i, j, 0xc8a878, Math.round(70 * (1 - dd / 5)));
        if (dd <= hw) {
          // hatching: parallel diagonal strokes, broken into hand-sized pieces, thinning outward
          const l1 = wx + wy, l2 = wx - wy;
          if (((l1 % 3) + 3) % 3 === 0) {
            const line = Math.floor(l1 / 3), seg = Math.floor((l2 + hash(line, 1) * 11) / 8);
            const keep = hash(line, seg, 11), cut = (l2 + hash(line, 1) * 11) % 8;
            if (cut > 0.5 && keep > 0.08 + (dd / hw) ** 1.4 * 0.75) p.set(i, j, dd < 2.5 ? INKC.ink2 : INKC.sepia, Math.round(240 - (dd / hw) * 90));
          }
          // where the pen pressed, a second pass across
          if (press > 0.18 && dd < 2.4 && ((l2 % 3) + 3) % 3 === 0) {
            const line = Math.floor(l2 / 3), seg = Math.floor((l1 + hash(line, 2) * 9) / 6);
            if (hash(line, seg, 12) > 0.35) p.set(i, j, INKC.sepia, 170);
          }
        } else if (hash(wx, wy, 14) < 0.05 * (1 - (dd - hw) / (12 - hw))) p.set(i, j, INKC.sepia, 160);
      }
    }
    // hachures: short ticks out from the wall
    for (let j = 1; j < H - 1; j++)
      for (let i = 1; i < W - 1; i++) {
        const q = j * W + i;
        if (D[q] !== 2 || hash(i + ox, j + oz, 21) > 0.26) continue;
        let gx = D[q + 1] - D[q - 1], gy = D[q + W] - D[q - W];
        const l = Math.hypot(gx, gy) || 1;
        gx /= l; gy /= l;
        const len = 2 + Math.floor(hash(i + ox, j + oz, 22) * 2.5);
        for (let t = 0; t <= len; t++) {
          const x = Math.round(i + gx * t), y = Math.round(j + gy * t);
          if (x < 0 || y < 0 || x >= W || y >= H || M[y * W + x]) break;
          p.set(x, y, INKC.ink2, 235 - t * 30);
        }
      }
    // the wall line, heavier where the pen pressed
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const q = j * W + i;
        const v = M[q];
        if (v) {
          const edge = (i > 0 && !M[q - 1]) || (i < W - 1 && !M[q + 1]) || (j > 0 && !M[q - W]) || (j < H - 1 && !M[q + W]);
          if (edge) p.set(i, j, v === 2 ? INKC.blue : v === 3 ? INKC.red : INKC.ink, 255);
        } else if (D[q] === 2 && noise((i + ox) * 0.09 + 5, (j + oz) * 0.09) > 0.3) p.set(i, j, INKC.ink2, 200);
      }

    // ---- trails: the old miners' tunnels, dashed where you've walked them
    if (plan?.trails) {
      const rails = new Set((plan.features || []).filter((f) => f.kind === 'trail' && f.rails).map((f) => f.trail));
      for (const t of plan.trails) {
        const pts = t.pts || [];
        for (let s = 1; s < pts.length; s++) {
          const a = pts[s - 1], b = pts[s];
          if (zoneOfY((a.y + b.y) / 2) !== zone) continue;
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          const n = Math.max(1, Math.ceil(len * k));
          let walked = 0;
          for (let e = 0; e <= n; e++) {
            const tt = e / n, x = a.x + (b.x - a.x) * tt, z = a.z + (b.z - a.z) * tt;
            const c = m?.get(keyXZ(Math.floor(x), Math.floor(z)));
            if (!c || c.ord > maxOrd) { walked = 0; continue; }
            walked++;
            const ix = Math.round(x * k - ox), iz = Math.round(z * k - oz);
            if (ix < 0 || iz < 0 || ix >= W || iz >= H) continue;
            const dash = Math.floor((e + hash(s, 3) * 4) / 2) % 2 === 0;
            if (dash) p.set(ix, iz, 0x8a3a1a, 230);
            if (rails.has(t.id) && e % 4 === 0 && k >= 2) {
              const ux = (b.z - a.z) / (len || 1), uz = -(b.x - a.x) / (len || 1);
              p.set(Math.round(ix + ux * 1.5), Math.round(iz + uz * 1.5), INKC.sepia, 200);
              p.set(Math.round(ix - ux * 1.5), Math.round(iz - uz * 1.5), INKC.sepia, 200);
            }
          }
          void walked;
        }
      }
    }

    // ---- landmarks, labels, pins, quests, you
    const toMap = (x, z) => [x * k - ox, z * k - oz];
    const inView = (sx, sy, pad = 6) => sx >= -pad && sy >= -pad && sx < W + pad && sy < H + pad;
    const taken = (paintTaken = []);
    const free = (r) => !taken.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]);
    const label = (text, cx, cy, col = INKC.ink, prefer = 'below', seed = 1) => {
      if (!text) return;
      const w = textW(text), h = 7;
      const tries = prefer === 'below' ? [[0, 1], [0, -1], [1, 0], [-1, 0]] : [[1, 0], [0, 1], [0, -1], [-1, 0]];
      for (const [dx, dy] of tries) {
        const x = Math.round(dx === 0 ? cx.x - w / 2 : dx > 0 ? cx.x1 + 3 : cx.x0 - w - 3);
        const y = Math.round(dy === 0 ? cx.y - h / 2 : dy > 0 ? cx.y1 + 2 : cx.y0 - h - 1);
        const r = [x - 2, y - 1, x + w + 2, y + h + 1];
        if (x < 2 || y < 1 || x + w > W - 2 || y + h > H - 1 || !free(r)) continue;
        paperPatch(p, x, y, w, h, PAPER, 215);
        hand(p, text, x, y, col, { seed });
        taken.push(r);
        return true;
      }
      return false;
    };
    const L = landmarks(zone, maxOrd);
    // danger rings first, under everything
    for (const lm of L) {
      if (!lm.danger || !lm.r) continue;
      const [sx_, sy_] = toMap(lm.x, lm.z);
      if (!inView(sx_, sy_, lm.r * k + 4)) continue;
      const rr = lm.r * k;
      for (let a = 0; a < 64; a++) if (a % 4 < 2) p.set(Math.round(sx_ + Math.cos((a / 64) * 6.283) * rr), Math.round(sy_ + Math.sin((a / 64) * 6.283) * rr), INKC.redLt, 170);
    }
    const order = { ore: 0, stake: 0, shaft: 1, lift: 2, lake: 3, lava: 3, gas: 3, nest: 3, ruin: 4, burrow: 5, dig: 6, town: 7, home: 8 };
    L.sort((a, b) => (order[a.kind] || 0) - (order[b.kind] || 0));
    const drawn = [];
    for (const lm of L) {
      const [sx_, sy_] = toMap(lm.x, lm.z);
      if (!inView(sx_, sy_, 14)) continue;
      if ((lm.kind === 'ore' || lm.kind === 'stake') && k < 2) continue;
      const fn = DOODLE[lm.kind] || DOODLE.lift;
      const b = lm.kind === 'burrow' ? fn(p, sx_, sy_, 3, lm.variant) : lm.kind === 'ore' ? fn(p, sx_, sy_, 2, lm.color) : fn(p, sx_, sy_, 2);
      taken.push(b);
      drawn.push({ lm, b, sx: sx_, sy: sy_ });
      hits.push({ x: sx_, y: sy_, r: Math.max(5, (b[2] - b[0]) / 2), label: lm.title || lm.label || '', sub: lm.sub || '' });
    }
    // labels: big places first (the list is sorted small → big)
    for (let i = drawn.length - 1; i >= 0; i--) {
      const { lm, b } = drawn[i];
      if (!lm.label || (lm.small && k < 2)) continue;
      label(lm.label, { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, x0: b[0], y0: b[1], x1: b[2], y1: b[3] }, lm.danger ? INKC.red : lm.kind === 'lake' ? INKC.blue : INKC.ink, 'below', i + 7);
    }
    // spot depths along your tunnels (a surveyor's habit), sparse
    if (m && k >= 3) {
      const B = 18;
      const seen = new Set();
      for (const c of m.values()) {
        if (c.ord > maxOrd) continue;
        const bx = Math.floor(c.x / B), bz = Math.floor(c.z / B), key = bx * 9973 + bz;
        if (seen.has(key)) continue;
        if (hash(c.x, c.z, 41) > 0.2) continue;
        const [sx_, sy_] = toMap(c.x + 0.5, c.z + 0.5);
        if (sx_ < 8 || sy_ < 8 || sx_ > W - 16 || sy_ > H - 10) continue;
        seen.add(key);
        const t = String(Math.round(-(c.y0 + c.y1) / 2));
        const r = [sx_ + 2, sy_ - 3, sx_ + 4 + textW(t), sy_ + 4];
        if (!free(r)) continue;
        p.set(Math.round(sx_), Math.round(sy_), INKC.pencil); p.set(Math.round(sx_) - 1, Math.round(sy_), INKC.pencil, 140); p.set(Math.round(sx_) + 1, Math.round(sy_), INKC.pencil, 140);
        hand(p, t, sx_ + 2, sy_ - 4, INKC.pencil, { seed: c.ord, lean: false });
        taken.push(r);
      }
    }
    // pins
    for (const pin of atlas.pins) {
      if (pin.zone !== zone) continue;
      const [sx_, sy_] = toMap(pin.x, pin.z);
      if (!inView(sx_, sy_)) continue;
      const pp = pinPx(pin.kind);
      p.blit(pp, Math.round(sx_ - 6), Math.round(sy_ - (pin.kind === 'pin' ? 13 : 7)));
      hits.push({ x: sx_, y: sy_ - 4, r: 6, label: pin.label || PIN_NAMES[pin.kind] || 'Pin', sub: 'Your pin', pin });
    }
    // quests
    const now = performance.now() / 1000;
    for (const t of questTargets()) {
      if (t.onlyZone || t.zone !== zone) continue;
      const [sx_, sy_] = toMap(t.x, t.z);
      if (!inView(sx_, sy_, 8)) { if (t.tracked) edgeArrow(p, sx_, sy_, INKC.red, t.title); continue; }
      if (t.tracked || !t.known) questMark(p, sx_, sy_, { pencil: !t.known, seed: 3, t: now });
      else flag(p, sx_, sy_);
      hits.push({ x: sx_, y: sy_, r: 8, label: t.title, sub: t.known ? t.text : `${t.text} · somewhere about here` });
    }
    // home, when it's off the page
    if (zone === 1) {
      const W0 = plan?.W ?? 10, D0 = plan?.D ?? 8;
      const [hx, hy] = toMap(W0 / 2, D0 / 2);
      if (!inView(hx, hy, -4)) edgeArrow(p, hx, hy, INKC.ink2, "Old Star's");
    }
    // Nugget and you
    const me = where();
    const nug = game.scene?.nugget?.pos;
    if (nug && game.sceneName === 'deep' && zoneOfY(nug.y) === zone) {
      const [nx, ny] = toMap(nug.x, nug.z);
      if (inView(nx, ny, 0)) { DOODLE.nugget(p, nx, ny); hits.push({ x: nx, y: ny, r: 5, label: 'Nugget', sub: 'Your hen' }); }
    }
    if (zoneOfY(me.y) === zone) {
      const [ux, uy] = toMap(me.x, me.z);
      if (inView(ux, uy, 0)) {
        youArrow(p, ux, uy, -Math.sin(me.yaw), -Math.cos(me.yaw));
        hits.push({ x: ux, y: uy, r: 6, label: 'You', sub: me.live ? `${Math.round(-me.y)} m down` : me.place === 'town' ? 'In Deep Town' : "At Old Star's" });
      } else if (fx) edgeArrow(p, ux, uy, 0xc8302a, 'You');
    }
    // the chrome on the sheet: compass, scale
    if (fx) {
      compass(p, W - 18, 22, 11);
      scaleBar(p, 8, H - 14, k, PAPER);
    }
    if (!any && fx) {
      const msg = zone === 1 ? 'NOT WALKED YET' : 'NOTHING WALKED HERE YET';
      const w = textW(msg);
      paperPatch(p, Math.round(W / 2 - w / 2), Math.round(H / 2 + 14), w, 7, PAPER, 230);
      hand(p, msg, W / 2 - w / 2, H / 2 + 14, INKC.pencil, { seed: 9 });
    }
  }

  /** A small red flag: another quest wants you here. */
  function flag(p, x, y) {
    x = Math.round(x); y = Math.round(y);
    p.vl(x, y - 8, y, INKC.ink);
    p.poly([[x + 1, y - 8], [x + 5, y - 6.5], [x + 1, y - 5]], INKC.red);
    p.set(x - 1, y, INKC.ink2); p.set(x + 1, y, INKC.ink2);
  }

  /** Off-page: a pencil arrow at the edge pointing to it, and its name. */
  function edgeArrow(p, tx, ty, color, text) {
    const cx = W / 2, cy = H / 2;
    const dx = tx - cx, dy = ty - cy;
    const s = Math.min((W / 2 - 10) / Math.abs(dx || 1e-6), (H / 2 - 10) / Math.abs(dy || 1e-6));
    const ex = cx + dx * s, ey = cy + dy * s;
    const l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
    wline(p, ex - ux * 8, ey - uy * 8, ex, ey, color, { amp: 0.3 });
    wline(p, ex, ey, ex - ux * 3 - uy * 3, ey - uy * 3 + ux * 3, color, { amp: 0 });
    wline(p, ex, ey, ex - ux * 3 + uy * 3, ey - uy * 3 - ux * 3, color, { amp: 0 });
    const meters = Math.round(l / k);
    const lab = `${text} ${meters} M`;
    const w = textW(lab);
    let lx = clamp(Math.round(ex - ux * 12 - w / 2), 3, W - w - 3), ly = clamp(Math.round(ey - uy * 12 - 3), 3, H - 10);
    // slide along the edge until it's clear of other lettering
    const clear = (x, y) => !paintTaken.some((q) => x - 2 < q[2] && x + w + 2 > q[0] && y - 1 < q[3] && y + 8 > q[1]);
    for (let t = 1; t < 12 && !clear(lx, ly); t++) {
      const off = (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 8;
      const nx = Math.abs(uy) > Math.abs(ux) ? clamp(lx + off, 3, W - w - 3) : lx, ny = Math.abs(uy) > Math.abs(ux) ? ly : clamp(ly + off, 3, H - 10);
      if (clear(nx, ny)) { lx = nx; ly = ny; break; }
    }
    paintTaken.push([lx - 2, ly - 1, lx + w + 2, ly + 8]);
    paperPatch(p, lx, ly, w, 7, PAPER, 200);
    hand(p, lab, lx, ly, color, { seed: 5 });
    hits.push({ x: ex, y: ey, r: 7, label: text, sub: `${meters} m that way` });
  }

  function draw() {
    if (!map || dead) return;
    if (!planReady) { map.d.set(paperFor(W, H)); map.ctx.putImageData(map.img, 0, 0); return; }
    if (anim) return; // the ink-in owns the canvas
    paint(map);
    map.ctx.putImageData(map.img, 0, 0);
  }

  // ---------------- the ink-in: ground walked since the last look gets inked by the quill
  function startReveal() {
    finishAnim();
    if (!planReady || !map) { redraw(); return; }
    const m = exploredIndex(st).zones.get(zone);
    if (!m || !m.size) { redraw(); return; }
    let maxOrd = -1;
    for (const c of m.values()) if (c.ord > maxOrd) maxOrd = c.ord;
    let seen = atlas.seen[zone];
    if (seen === undefined) seen = -1;
    const fresh = [];
    for (const c of m.values()) if (c.ord > seen) fresh.push(c);
    atlas.seen[zone] = maxOrd;
    if (!fresh.length) { redraw(); return; }
    fresh.sort((a, b) => a.ord - b.ord);
    // a long first look: older ground is simply there, the quill does the last stretch
    const cap = 500;
    const startOrd = fresh.length > cap ? fresh[fresh.length - cap].ord - 1 : seen;
    const path = fresh.filter((c) => c.ord > startOrd);
    const before = new Px(W, H), after = new Px(W, H);
    paint(before, startOrd);
    paint(after, Infinity);
    const ox = Math.round(vcx * k - W / 2), oz = Math.round(vcz * k - H / 2);
    const pts = [];
    for (const c of path) {
      const x = (c.x + 0.5) * k - ox, y = (c.z + 0.5) * k - oz;
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      pts.push([x, y]);
    }
    if (!pts.length) { redraw(); return; }
    map.d.set(before.d);
    map.ctx.putImageData(map.img, 0, 0);
    const R = Math.max(7, Math.round((2.4 * k + 6) * (st.skill?.('ink') || 1))); // the quill's stroke widens with Map ink
    const dur = clamp(0.5 + pts.length * 0.012, 0.7, 3.2);
    const mask = new Uint8Array(W * H);
    const t0 = performance.now();
    let done = 0, lastSfx = 0;
    anim = { after, stop: false };
    quill.hidden = false;
    const stepAnim = () => {
      if (dead || !anim || anim.stop) return;
      const t = clamp((performance.now() - t0) / 1000 / dur, 0, 1);
      const upto = Math.floor(t * pts.length);
      for (; done < upto; done++) {
        const [cx, cy] = pts[done];
        for (let y = Math.max(0, Math.floor(cy - R)); y < Math.min(H, cy + R); y++)
          for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(W, cx + R); x++) {
            const q = y * W + x;
            if (mask[q]) continue;
            const dd = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
            if (dd > R * R * (0.8 + hash(x, y, 31) * 0.4)) continue;
            mask[q] = 1;
            const i4 = q * 4;
            map.d[i4] = after.d[i4]; map.d[i4 + 1] = after.d[i4 + 1]; map.d[i4 + 2] = after.d[i4 + 2]; map.d[i4 + 3] = after.d[i4 + 3];
          }
      }
      map.ctx.putImageData(map.img, 0, 0);
      const cur = pts[Math.min(pts.length - 1, done)];
      quill.style.transform = `translate(${Math.round(cur[0] * px)}px, ${Math.round(cur[1] * px)}px) rotate(${Math.sin(t * 40) * 8}deg)`;
      const now = performance.now();
      if (now - lastSfx > 120) { lastSfx = now; SFX.brush(game.audio, { vol: 0.9 }); if (hash(done, 3) < 0.3) SFX.scratch(game.audio, { n: 2, vol: 0.6 }); }
      if (t >= 1) { finishAnim(); return; }
      anim.raf = requestAnimationFrame(stepAnim);
    };
    anim.raf = requestAnimationFrame(stepAnim);
  }
  function finishAnim() {
    if (!anim) return;
    const a = anim;
    anim = null;
    a.stop = true;
    cancelAnimationFrame(a.raf);
    quill.hidden = true;
    if (map && a.after && a.after.w === W && a.after.h === H) { map.d.set(a.after.d); map.ctx.putImageData(map.img, 0, 0); }
    redraw();
  }

  // ---------------- pins
  const setPinMode = (kind) => {
    pinMode = kind;
    if (kind) atlas.lastPin = kind;
    pinBar.hidden = !kind;
    root.classList.toggle('pinning', !!kind);
    for (const b of pinBar.querySelectorAll('.at-pk')) b.classList.toggle('on', b.dataset.k === kind);
    SFX.flick(game.audio);
  };
  const pinAt = (mx, my) => {
    // pull an existing pin, or push a new one in
    const hit = hits.find((h) => h.pin && Math.hypot(h.x - mx, h.y - my) < 6);
    if (hit) {
      atlas.pins = atlas.pins.filter((q) => q !== hit.pin);
      game.audio.play('ui_click', { vol: 0.5 });
    } else {
      const ox = Math.round(vcx * k - W / 2), oz = Math.round(vcz * k - H / 2);
      const x = (mx + ox) / k, z = (my + oz) / k;
      if (atlas.pins.length >= 60) atlas.pins.shift();
      atlas.pins.push({ id: Date.now().toString(36), zone, x: +x.toFixed(2), z: +z.toFixed(2), kind: pinMode || 'pin' });
      SFX.pin(game.audio);
    }
    st.dirty = true;
    redraw();
  };

  // ---------------- input: drag, pinch, wheel, taps
  const ptrs = new Map();
  let drag = null, pinch = null;
  const local = (e) => { const r = canvasHost.getBoundingClientRect(); return { x: (e.clientX - r.left) / px, y: (e.clientY - r.top) / px }; };
  mapEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    mapEl.focus({ preventScroll: true });
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { mapEl.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    if (anim) { finishAnim(); }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; return; }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
  });
  mapEl.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d / pinch.d > 1.35) { setZoom(1); pinch.d = d; } else if (d / pinch.d < 0.74) { setZoom(-1); pinch.d = d; }
      return;
    }
    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX; drag.y = e.clientY;
      vcx -= dx / (k * px);
      vcz -= dy / (k * px);
      tip.hidden = true;
      redraw();
    } else if (e.pointerType === 'mouse') hover(e);
  });
  const up = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    if (moved < 7) {
      const at = local(e);
      if (pinMode) pinAt(at.x, at.y);
      else hover(e, true);
    }
  };
  mapEl.addEventListener('pointerup', up);
  mapEl.addEventListener('pointercancel', up);
  mapEl.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(e.deltaY < 0 ? 1 : -1, local(e)); }, { passive: false });
  const hover = (e, sticky = false) => {
    const at = local(e);
    let best = null, bd = 1e9;
    for (const h of hits) { const d = Math.hypot(h.x - at.x, h.y - at.y) - h.r; if (d < bd) { bd = d; best = h; } }
    if (!best || bd > 3) { if (sticky || !tip.hidden) tip.hidden = true; return; }
    tip.innerHTML = '';
    tip.append(el('b', {}, best.label || ''), best.sub ? el('span', {}, best.sub) : '');
    const r = mapEl.getBoundingClientRect();
    tip.style.left = Math.round(clamp(e.clientX - r.left, 40, r.width - 40)) + 'px';
    tip.style.top = Math.round(e.clientY - r.top) + 'px';
    tip.hidden = false;
  };
  const onKey = (e) => {
    if (dead || !root.isConnected) return;
    const top = game.ui.panelStack[game.ui.panelStack.length - 1];
    if (!top || !top.el.contains(root)) return;
    const step = 24 / k;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') vcx -= step;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') vcx += step;
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') vcz -= step;
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') vcz += step;
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') { setZoom(1); return; }
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract') { setZoom(-1); return; }
    else if (e.code === 'PageUp') { if (zone > 1) setZone(zone - 1); return; }
    else if (e.code === 'PageDown') { if (zone < 6) setZone(zone + 1); return; }
    else if (e.code === 'KeyC') { recenter(); return; }
    else return;
    e.preventDefault();
    finishAnim();
    redraw();
  };
  window.addEventListener('keydown', onKey);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  ro?.observe(mapEl);

  // ---------------- focus on something (a quest, a place)
  const focus = (f) => {
    if (!f) return;
    if (f.quest) {
      const t = questTargets().find((q) => q.id === f.quest);
      if (t) {
        if (t.zone && t.zone !== zone) setZone(t.zone, { center: false, quiet: true });
        if (t.x !== undefined) { vcx = t.x; vcz = t.z; }
      }
    } else if (f.x !== undefined) {
      if (f.zone) setZone(f.zone, { center: false, quiet: true });
      vcx = f.x; vcz = f.z;
    }
    redraw();
  };

  // ---------------- start
  const me0 = where();
  zone = zoneOfY(me0.y);
  vcx = me0.x; vcz = me0.z;
  titles();
  renderLayers();
  requestAnimationFrame(() => { resize(); });
  loadPlan(game).then((pl) => {
    if (dead) return;
    plan = pl;
    planReady = true;
    const me = where();
    zone = zoneOfY(me.y);
    vcx = me.x; vcz = me.z;
    titles();
    renderLayers();
    if (opts.focus) focus(opts.focus);
    if (!map) requestAnimationFrame(() => { resize(); startReveal(); });
    else startReveal();
  });

  const ctl = {
    el: root,
    resize,
    focus,
    setZone: (z) => setZone(z),
    onEscape: () => { if (pinMode) { setPinMode(null); return true; } if (root.classList.contains('show-key')) { root.classList.remove('show-key'); return true; } return false; },
    dispose() {
      if (dead) return;
      dead = true;
      finishAnim();
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
    debug: {
      state: () => ({ zone, k, vcx: +vcx.toFixed(2), vcz: +vcz.toFixed(2), W, H, planReady, anim: !!anim, pins: atlas.pins.length, hits: hits.map((h) => h.label).filter(Boolean), landmarks: planReady ? landmarks(zone, Infinity).map((l) => l.kind + ':' + (l.label || l.title || '')) : [], quests: questTargets().map((q) => `${q.id}@${q.zone}${q.known ? '' : '?'}`) }),
      ready: () => planReady && !!map,
      finish: () => finishAnim(),
      zoom: (z) => { k = ZOOMS.includes(z) ? z : k; redraw(); },
      center: (x, z) => { vcx = x; vcz = z; redraw(); },
      zone: (z) => setZone(z),
      pin: (x, z, kind = 'pin') => { atlas.pins.push({ id: 'd' + atlas.pins.length, zone, x, z, kind }); redraw(); },
      pinMode: (kd) => setPinMode(kd),
      reveal: (fromOrd) => { if (fromOrd !== undefined) atlas.seen[zone] = fromOrd; startReveal(); },
      draw: () => { finishAnim(); paint(map); map.ctx.putImageData(map.img, 0, 0); },
    },
  };
  return ctl;
}

// ---------------------------------------------------------------- the key's little pictures
// Drawn once as pixels and painted into small canvases (no data-URL readbacks).
const legendCache = new Map();
/** A software-backed canvas: cheap putImageData, no GPU readbacks. */
function cpuCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return [c, ctx];
}
function legendIcon(kind, small = false) {
  let img = legendCache.get(kind + (small ? ':s' : ''));
  if (!img) {
    const p = small ? new Px(13, 13) : new Px(26, 22);
    const cx = small ? 6.5 : 13, cy = small ? 7 : 11;
    if (kind === 'you') youArrow(p, cx, cy, 0, -1);
    else if (kind === 'quest') questMark(p, cx, cy + 3, { seed: 3 });
    else if (kind === 'trail') { for (let x = 3; x < 23; x++) if (Math.floor(x / 2) % 2 === 0) p.set(x, cy, 0x8a3a1a); for (let x = 4; x < 23; x += 4) { p.set(x, cy - 2, INKC.sepia); p.set(x, cy + 2, INKC.sepia); } }
    else if (kind === 'burrow') DOODLE.burrow(p, cx - 2, cy + 1, 3, 'trader');
    else if (kind === 'ore') DOODLE.ore(p, cx, cy, 2, 0xd9773f);
    else if (DOODLE[kind]) DOODLE[kind](p, cx, cy, 2);
    img = p.img;
    legendCache.set(kind + (small ? ':s' : ''), img);
  }
  const [c, ctx] = cpuCanvas(img.width, img.height);
  ctx.putImageData(img, 0, 0);
  c.className = 'pix at-ic';
  return c;
}
export { legendIcon, cpuCanvas };
