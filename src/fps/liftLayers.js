// The lift's panel (and the M key's map): the underground side-on, top to bottom, as a little lit
// diorama. src/fps/liftArt/build3d.js builds each section in 3D (a voxel slab cut open, its caves laid
// out by the hand-composed maps in maps.js, dressed with the game's own props, plants, furniture and
// shop fronts, the hand-made sprites in tiles.js extruded into voxels), and diorama.js draws it small
// through the shared renderer with real lights, soft shadows and fog, then a pixel pass (a stepped
// ramp, plum outlines) into this panel's canvas, nearest-neighbour scaled. The meadow and its oak; Old
// Star's burrow and Deep Town; the six layers (Rootsoil, Clayworks, Crystal Grotto, Magma Deep, Frost
// Vault, the Core); the town lift's cage riding its shaft; the Core's heart. A survey staff gives the
// depths. Without WebGL (or if the diorama fails) the same map is drawn flat from the tiles (paint.js).
//
// Layers you've reached are in colour. The ones you haven't are the cartographer's unfinished pencil-
// and-sepia sketch, fading the deeper it goes; the first time you see a layer you've reached, its
// colour sweeps in over the sketch (the ink-in). Locked lifts stay locked (a chained cage); a layer
// with no unlocked lift has no Dive.
//
// Every layer has a small plaque: its name, what you've found there (icons), and a Dive button that
// rides to the nearest unlocked lift in it. Each lift stands in its layer with a tag (click to ride).
//
//   openLiftLayers(game, here, opts, dests, ride, locked) → panel handle   (lifts.js openLiftPanel)
//   openLayers(game) → panel handle   (view-only unless you're standing at an unlocked lift)
import { el, clamp, makeRng } from '../core/util.js';
import { iconURL, drawIconSmall } from '../gfx/PixelArt.js';
import { ZONES } from '../data/zones.js';
import { ITEMS } from '../data/items.js';
import { CREATURES } from '../data/creatures.js';
import { ORE_SPAWN } from '../data/ores.js';
import { creatureIconURL } from '../ui/UI.js';
import { liftDestinations, lockedLifts, liftUnlocked, rideTo } from './lifts.js';
import './liftLayers.css';
import { dropCap, inkIn, ensureTomeArt } from '../ui/tomeFx.js'; // (wave 9: the survey as an atlas leaf, src/ui/tome.css)
import { doodleURL, cssUrl } from '../ui/tomeArt.js';
import { hash, hashStrLite } from './liftArt/kit.js';
import { paintLayer, paintTop, paintCore, sketchOf, LIFT_ZONE_DEPTHS, LAYER_H, TOP_H, CORE_H, GROUND, SHAFT_X } from './liftArt/paint.js';
import { placeLife, drawLayerAnim, drawTopAnim, drawSky, drawCoreAnim, drawMole, cageSprite } from './liftArt/anim.js';
import { Diorama } from './liftArt/diorama.js';
import { buildTop, buildLayer, buildCore, SEC_H, GROUND3 } from './liftArt/build3d.js';
import { Art, digits as drawDigits, CREAM as CREAM_C, PAL as PAL_C } from './liftArt/kit.js';

// the 3D diorama renderer, made once per page (it holds render targets on the shared renderer)
let DIO = null, DIO_FAILED = false;
function diorama(game) {
  if (DIO || DIO_FAILED) return DIO;
  try {
    if (/[?&]lift3d=0/.test(location.search) || !game.engine?.renderer) throw new Error('no 3D');
    DIO = new Diorama(game.engine.renderer);
  } catch (e) { DIO_FAILED = true; DIO = null; }
  return DIO;
}
const numCache = new Map();
/** A depth number as a little canvas in the 3x5 pixel font, on a plum chip. */
function numCanvas(n) {
  if (numCache.has(n)) return numCache.get(n);
  const w = String(n).length * 4 + 1, a = new Art(w, 7);
  for (let y = 0; y < 7; y++) for (let x = 0; x < w; x++) a.p(x, y, x === w - 1 || y === 6 ? PAL_C.k : PAL_C.K);
  drawDigits(a, 1, 1, n, CREAM_C);
  const cv = a.commit();
  numCache.set(n, cv);
  return cv;
}

export { LIFT_ZONE_DEPTHS };
const X0 = -96, X1 = 96; // the mine's x extent (Generator BOUNDS), mapped across the scene
/**
 * Explored cells (1 m, open space you've walked near) that count as 100% of a layer: about a fifth
 * of its open cave (sampled from Generator.caveDensity: ~44k, 128k, 228k, 212k, 161k, 131k cells).
 */
export const EXPLORE_TARGET = [0, 9000, 25000, 45000, 42000, 32000, 26000];
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const PLQ_X = 18, PLQ_Y = 3; // where a layer's plaque sits (art px, right of the staff and its numbers)
/** World x (m) → art x, across the part of the scene every view shows. */
const ax = (W, x) => clamp(Math.round(((x - X0) / (X1 - X0)) * (Math.min(W, 304) - 24) + 12), 10, W - 10);

// plants by layer (as in the Index Book, src/ui/IndexBook.js)
const PLANT_ZONES = {
  cave_carrot: [1, 2], glowcap: [1, 2, 3, 5], blindfern: [1, 2], whisperweed: [1, 2, 3, 5, 6], rubber_sap: [2, 3], pepperroot: [2, 4],
  sparkmoss: [3], bubblebulb: [3], crystal_lily: [3, 6], gloomshroom: [3, 4, 5], ashfern: [4], emberbloom: [4, 6], truffle: [1, 2, 4],
  frostbloom: [5, 6], core_lotus: [6],
};
const EXTRA_ORES = { 3: ['amethyst'], 4: ['obsidian_shard'] };
const ORE_COL = {
  coal: [0x3a3438, 0x6a6468], copper_ore: [0xc8743e, 0xf2b480], tin_ore: [0xa8b0b8, 0xe8ecec], salt_crystal: [0xd8d0c8, 0xf6eee0], fossil: [0xd0c098, 0xf4e6c4],
  quartz: [0xd8d4e8, 0xf6f0f0], iron_ore: [0xa85a36, 0xe09a68], amber: [0xe8981e, 0xfce08a], lumite: [0x6ac87a, 0xc8f0c0], silver_ore: [0xb8c0cc, 0xf0f0ec],
  echo_crystal: [0x7ab8e8, 0xd8ecf0], gravium: [0x7a62c0, 0xc8b8f0], bioxide: [0x5ac8dc, 0xd4f4ec], amethyst: [0x9a58d0, 0xe8ccf0], gold_ore: [0xe0b02a, 0xfce898],
  ruby: [0xc82a40, 0xf49aa0], magmaite: [0xf06a1a, 0xfcc870], emerald: [0x2ab068, 0xa8f0c8], frostite: [0x8adcf0, 0xf0f4ec], sapphire: [0x3450c8, 0xa0b8f0],
  mithril_ore: [0x7ac8c8, 0xe0f4ec], moonsilver_ore: [0xb8bce0, 0xf4f0f0], diamond: [0xc8ecf4, 0xf8f4ec], voidstone: [0x5e34a0, 0xc898f0], adamant_ore: [0x4e8a6e, 0xb8e8cc],
  starmetal_ore: [0xe0c880, 0xfaf0d0], sunstone: [0xf0b02a, 0xfcecb0], obsidian_shard: [0x342640, 0x8a72b8],
};

// ------------------------------------------------------------------ what's where (state)
const zoneOfDepth = (d) => { for (let z = 1; z <= 6; z++) if (d < LIFT_ZONE_DEPTHS[z]) return z; return 6; };

/** The ores, creatures and plants of a layer, with what you've recorded of them. */
export function layerFinds(st, z) {
  const idx = st.data.index || {};
  const ores = [];
  for (const [id] of ORE_SPAWN[z] || []) if (ITEMS[id] && (ITEMS[id].cat === 'mineral' || ITEMS[id].cat === 'gem')) ores.push(id);
  for (const id of EXTRA_ORES[z] || []) if (ITEMS[id] && !ores.includes(id)) ores.push(id);
  const crit = Object.keys(CREATURES).filter((id) => (CREATURES[id].zones || []).includes(z));
  const plants = Object.keys(PLANT_ZONES).filter((id) => ITEMS[id] && PLANT_ZONES[id].includes(z));
  const rec = (cat, id) => ({ id, cat, e: idx[cat + ':' + id] || null });
  return { ores: ores.map((id) => rec(ITEMS[id].cat, id)), crit: crit.map((id) => rec('critter', id)), plants: plants.map((id) => rec('plant', id)) };
}

/** Explored cells per layer: counts and the (x, depth) of each. */
export function exploredByLayer(st) {
  const ex = st.data.deep?.explored || {};
  const n = [0, 0, 0, 0, 0, 0, 0];
  const pts = [null, [], [], [], [], [], []];
  for (const k in ex) {
    const a = k.indexOf(','), b = k.indexOf(',', a + 1);
    const x = +k.slice(0, a), d = -(+k.slice(a + 1, b));
    const z = zoneOfDepth(Math.max(0, d));
    n[z]++;
    pts[z].push(x, d);
  }
  return { n, pts, pct: n.map((c, z) => (z ? clamp(Math.floor((c / EXPLORE_TARGET[z]) * 100), 0, 100) : 0)) };
}

/** Where a stop is in the world: { x (m), d (depth m), zone, top: true for home / Deep Town }. */
function stopWhere(s, seed) {
  if (s.id === 'home') return { x: 5, d: 0, zone: 0, top: true };
  if (s.id === 'town') return { x: 30, d: 15, zone: 1, top: true };
  let d = s.depth || 0;
  if (d <= 0 && s.zone >= 1) d = s.id === 's0' ? 16 : LIFT_ZONE_DEPTHS[s.zone - 1] + 2; // stations from old saves
  let x = typeof s.x === 'number' ? s.x : null;
  if (x == null) x = /^s\d/.test(s.id) ? 41.1 : s.id === 'L0' ? 5 : -60 + hash(hashStrLite(s.id), seed, 5) * 120;
  return { x, d, zone: s.zone || zoneOfDepth(d), top: false };
}

// ------------------------------------------------------------------ icons for the plaques (16 px)
const small = new Map();
function smallIcon(cat, id) {
  const key = cat + ':' + id;
  if (small.has(key)) return small.get(key);
  let url = '';
  try {
    if (cat === 'critter') url = creatureIconURL(id);
    else { const spec = ITEMS[id]?.icon; url = spec ? drawIconSmall(spec, hashStrLite(id) >>> 0, 16).commit().toDataURL() : iconURL(id); }
  } catch (e) { url = ''; }
  small.set(key, url);
  return url;
}

// ------------------------------------------------------------------ the panel
/**
 * Open the layers. here: the stop you're at ('home', 'town', a lift id) or null; dests: the stops
 * you can ride to (liftDestinations); ride(id) rides (null: view-only); locked: lifts found but
 * not unlocked yet. opts: { title, sub, you: { x, d } (the mole's spot when not at a stop) }.
 */
export function openLiftLayers(game, here, opts = {}, dests = [], ride = null, locked = []) {
  const st = game.state;
  const seed = ((st.data.deep && st.data.deep.seed) || 1) % 9973;
  const canRide = typeof ride === 'function';
  const town = dests.some((d) => d.id === 'town');
  const exp = exploredByLayer(st);
  const finds = [null, 1, 2, 3, 4, 5, 6].map((z) => (z ? layerFinds(st, z) : null));
  // the stops, where they are
  const stops = dests.map((d) => ({ ...d, open: true })).concat(locked.map((d) => ({ ...d, open: false })));
  for (const s of stops) s.where = stopWhere(s, seed);
  const layerStops = (z) => stops.filter((s) => !s.where.top && s.where.zone === z);
  const unlockedIn = (z) => layerStops(z).some((s) => s.open);
  // where you are
  let you = null;
  const hs = stops.find((s) => s.id === here);
  if (hs) you = { x: hs.where.x, d: hs.where.d, zone: hs.where.top ? 0 : hs.where.zone, top: hs.where.top, stop: hs };
  else if (opts.you) you = { x: opts.you.x, d: opts.you.d, zone: zoneOfDepth(Math.max(0, opts.you.d)), top: false };
  // which layers you've reached (printed in colour) and which are still a sketch; which are new (ink in)
  const zoneMax = st.data.zoneMax || 1;
  const reached = [town, 1, 2, 3, 4, 5, 6].map((z, i) => (i === 0 ? !!town : z <= zoneMax || exp.n[z] > 0 || layerStops(z).length > 0 || (you && !you.top && you.zone === z)));
  reached[7] = reached[6]; // the core shows once you've reached the layer over it
  const deepest = Math.max(1, ...[1, 2, 3, 4, 5, 6].filter((z) => reached[z]));
  let inked = st.flag('llInked');
  if (typeof inked !== 'number') inked = 0;
  const bit = (k) => 1 << k;

  // ---- DOM
  const canvas = el('canvas', { class: 'll-canvas' });
  const ctx = canvas.getContext('2d');
  const track = el('div', { class: 'll-track' });
  const rail = el('nav', { class: 'll-rail', 'aria-label': 'Layers' });
  const thumb = el('i', { class: 'll-thumb' });
  const tip = el('div', { class: 'll-tip', hidden: true });
  const pick = el('button', { class: 'll-pick', type: 'button', hidden: true });
  const view = el('div', { class: 'll-view', tabindex: '0', role: 'region', 'aria-label': 'The layers of the underground, top to bottom' }, [canvas, track, rail, tip, pick]);
  const body = el('div', { class: 'll-body' }, [view]);

  // a plaque per layer: name, finds as icons, Dive (or a padlock and a few words)
  const plaques = [];
  const dive = (s) => { if (!canRide || !s || s.id === here || !s.open) return; game.audio.play('click'); h?.close(); ride(s.id); };
  const nearestIn = (z, pt) => {
    const list = layerStops(z).filter((s) => s.open && s.id !== here);
    if (!list.length) return null;
    const p = pt || (you ? { x: you.x, d: you.d } : { x: 0, d: LIFT_ZONE_DEPTHS[z - 1] });
    return list.sort((a, b) => Math.hypot(a.where.x - p.x, (a.where.d - p.d) * 2) - Math.hypot(b.where.x - p.x, (b.where.d - p.d) * 2))[0];
  };
  for (let z = 1; z <= 6; z++) {
    const Z = ZONES[z], F = finds[z];
    const isLocked = !unlockedIn(z);
    const sketch = !reached[z];
    const pct = exp.pct[z];
    const lifts = layerStops(z).filter((s) => /^L\d/.test(s.id));
    const chips = (list, label, ico) => {
      const known = list.filter((o) => o.e);
      const g = el('span', { class: 'll-grp', title: `${label}: ${known.length} of ${list.length} found` }, [el('i', { class: 'll-gi ' + ico })]);
      for (const o of known.slice(0, 6)) {
        const url = smallIcon(o.cat, o.id);
        const name = o.cat === 'critter' ? CREATURES[o.id]?.name : ITEMS[o.id]?.name;
        g.append(el('span', { class: 'll-chip', title: `${name || o.id}${o.e?.n ? ` · ×${o.e.n}` : ''}` }, [url ? el('img', { src: url, alt: name || '' }) : null]));
      }
      if (known.length > 6) g.append(el('span', { class: 'll-more' }, `+${known.length - 6}`));
      const unk = list.length - known.length;
      if (unk) g.append(el('span', { class: 'll-unk', title: `${unk} not found yet` }));
      return g;
    };
    const target = nearestIn(z, null);
    const youHere = you && !you.top && you.zone === z;
    const btn = isLocked ? null : canRide && target ? el('button', {
      class: 'll-dive btn', type: 'button',
      'aria-label': `Dive to the ${Z.name}: ride to ${target.name}, ${Math.round(target.where.d)} m`,
      onclick: () => dive(target),
    }, [el('span', {}, 'Dive'), el('small', {}, `${Math.round(target.where.d)}m`)]) : el('span', { class: 'll-note' }, canRide ? 'You are here' : 'Ride from a lift');
    const pips = el('span', { class: 'll-pips', title: `${lifts.filter((s) => s.open).length} unlocked · ${lifts.length} of 3 old lifts found` }, [0, 1, 2].map((k) => el('i', { class: 'll-pip' + (k < lifts.length ? (lifts[k].open ? ' on' : ' found') : '') })));
    const plq = el('section', { class: 'll-plaque' + (isLocked ? ' locked' : '') + (sketch ? ' sketch' : '') + (youHere ? ' here' : ''), 'data-z': z }, [
      el('header', {}, [el('i', { class: 'll-num' }, ROMAN[z]), el('b', { class: 'll-name' }, Z.name), youHere ? el('em', { class: 'll-yh' }, 'you') : null]),
      el('div', { class: 'll-finds' }, [chips(F.ores, 'Ores and gems', 'ore'), chips(F.crit, 'Creatures', 'crit'), chips(F.plants, 'Plants', 'plant')]),
      el('div', { class: 'll-act' }, [
        isLocked ? el('span', { class: 'll-lockmsg', title: lifts.length ? 'Go back down and ring its bell to unlock it.' : `Find one of the old lifts in the ${Z.name} and ring its bell.` }, [el('i', { class: 'll-lock' }), lifts.length ? 'Ring its bell' : 'Find a lift'])
          : btn,
        pips,
        el('span', { class: 'll-gauge', title: `Explored ${pct}% · ${exp.n[z].toLocaleString()} cells walked` }, [el('i', { style: { width: pct + '%' } })]),
      ]),
    ]);
    plq.style.setProperty('--zc', Z.color);
    plaques[z] = plq;
    track.append(plq);
  }
  // stop tags (positions after painting)
  const tags = new Map();
  for (const s of stops) {
    const isHere = s.id === here;
    const rideable = canRide && s.open && !isHere;
    const tag = el(rideable ? 'button' : 'div', {
      class: 'll-stop' + (s.open ? '' : ' locked') + (isHere ? ' here' : '') + (s.where.top ? ' top' : ''), type: rideable ? 'button' : undefined,
      title: s.open ? (s.desc || '') : 'Locked: ring this lift\'s bell down there to unlock it as a checkpoint.',
      'aria-label': isHere ? `${s.name}: you are here` : s.open ? `Ride to ${s.name}${s.where.top ? '' : `, ${Math.round(s.where.d)} metres down`}` : `${s.name} (locked)`,
      onclick: rideable ? () => dive(s) : undefined,
    }, [s.open ? null : el('i', { class: 'll-lock' }), el('span', { class: 'll-sn' }, s.name), s.where.top ? null : el('small', {}, `${Math.round(s.where.d)}m`), isHere ? el('em', {}, 'here') : null]);
    tags.set(s.id, tag);
    track.append(tag);
  }
  const youTag = el('div', { class: 'll-stop here you' }, [el('span', { class: 'll-sn' }, 'You'), el('em', {}, 'here')]);
  if (you && !you.stop) track.append(youTag);

  // rail
  const rk = [];
  const railItems = [{ key: 'top', label: '⌂', title: town ? 'Home and Deep Town' : 'Home' }].concat([1, 2, 3, 4, 5, 6].map((z) => ({ key: z, label: ROMAN[z], title: ZONES[z].name })));
  for (const it of railItems) {
    const isLocked = it.key !== 'top' && !unlockedIn(it.key);
    const sk = it.key !== 'top' && !reached[it.key];
    const b = el('button', { class: 'll-rk' + (isLocked ? ' locked' : '') + (sk ? ' sketch' : '') + ((you && (you.top ? it.key === 'top' : you.zone === it.key)) ? ' you' : ''), type: 'button', title: it.title + (sk ? ' (not reached yet)' : isLocked ? ' (locked)' : ''), 'aria-label': `Scroll to ${it.title}`, onclick: () => goTo(it.key) }, it.label);
    if (it.key !== 'top') b.style.setProperty('--zc', ZONES[it.key].color);
    rk.push({ key: it.key, b });
    rail.append(b);
  }
  rail.append(thumb);

  // ---- open the panel; measure; build the scene
  game.audio.play('bell', { vol: 0.5 });
  let h = null;
  let alive = true, raf = 0;
  const S = { px: 3, W: 0, VH: 0, sections: [], scroll: 0, target: 0, vel: 0, total: 0, ready: false };
  h = game.ui.openPanel({
    title: opts.title || 'The Lift', sub: opts.sub || (canRide ? 'Where to?' : 'The layers you know.'), body, className: 'll-panel',
    onClose: () => { alive = false; cancelAnimationFrame(raf); clearTimeout(idleT); ro?.disconnect(); window.removeEventListener('keydown', onKey, true); try { D3?.clear(); } catch (e) { /* gone */ } },
  });
  // (wave 9) an atlas leaf: the title as an illuminated initial over a knotwork band, a compass rose
  // in the margin, a raptor chasing a mole along the top edge (src/ui/tome.css)
  ensureTomeArt();
  h.el.classList.add('tm-atlas');
  const h2 = h.el.querySelector(':scope > h2');
  if (h2) { dropCap(h2, 'blue'); inkIn(h2, { dur: 700, quill: false, audio: game.audio }); }
  const chase = el('div', { class: 'tm-chase', 'aria-hidden': 'true' }, ['raptor', 'mole'].map((k) => { const d = el('i', { class: 'tm-doodle tm-d-' + k }); d.style.setProperty('--d', cssUrl(doodleURL(k))); return d; }));
  h.el.append(el('i', { class: 'tm-compass', 'aria-hidden': 'true' }), chase);

  let D3 = diorama(game);
  if (D3) D3.clear();
  let idleT = 0;
  const build = () => {
    const cw = view.clientWidth, ch = view.clientHeight;
    if (!cw || !ch) return false;
    // a whole number of screen pixels per art pixel: about 480 across in 3D (288 for the flat tiles)
    const px = Math.max(2, Math.round(cw / (D3 ? 480 : 288)));
    S.px = px;
    S.W = Math.max(160, Math.ceil(cw / px));
    S.VH = Math.max(60, Math.ceil(ch / px));
    canvas.width = S.W; canvas.height = S.VH;
    canvas.style.width = S.W * px + 'px'; canvas.style.height = S.VH * px + 'px';
    ctx.imageSmoothingEnabled = false;
    const LH = D3 ? SEC_H.layer : LAYER_H, TH = D3 ? SEC_H.top : TOP_H, CH = D3 ? SEC_H.core : CORE_H;
    const M = Math.ceil(0.22 * (TH + S.VH) / 2) + 4;
    if (D3) { D3.clear(); D3.setSize(S.W, S.VH); }
    S.sections = [];
    let y = 0;
    S.sections.push({ kind: 'top', key: 0, y, H: TH, W: S.W, M, art: null });
    y += TH;
    for (let z = 1; z <= 6; z++) {
      S.sections.push({ kind: 'layer', key: z, z, y, H: LH, W: S.W, M, art: null });
      y += LH;
    }
    S.sections.push({ kind: 'core', key: 7, y, H: CH, W: S.W, M: 0, art: null });
    y += CH;
    S.total = y;
    track.style.height = y * px + 'px';
    for (const sec of S.sections) {
      if (sec.kind !== 'layer') continue;
      plaques[sec.z].style.transform = `translate(${PLQ_X * px}px, ${(sec.y + PLQ_Y) * px}px)`;
    }
    for (const s of stops) if (!s.where.top) s.ax = ax(S.W, s.where.x);
    for (const sec of S.sections) if (sec.kind === 'layer') sec.stops = layerStops(sec.z);
    // the town cage rides from the town's floor to the foot of the deepest layer you've reached
    S.cageTop = D3 ? 13 * 12 : TOP_H - 8; S.cageBot = S.sections[deepest].y + (D3 ? 144 : 96);
    return true;
  };

  // sketch settings: the layer just below what you know is half inked, deeper ones only pencilled
  const sketchFor = (key) => { const d = key - deepest; return d <= 1 ? { ink: 0.55 } : d === 2 ? { ink: 0.18 } : { faint: true }; };
  const paintSection = (sec) => {
    if (sec.art) return;
    const k = sec.key;
    if (D3) {
      // the 3D diorama: build the section, hand it to the renderer (the sketch is a pass over it)
      const z = sec.z;
      const built = sec.kind === 'top' ? buildTop({ W: sec.W, town })
        : sec.kind === 'core' ? buildCore({ W: sec.W })
          : buildLayer({ z, W: sec.W, seed, stops: sec.stops, finds: finds[z], ores: finds[z].ores.filter((o) => ORE_COL[o.id]).map((o) => ({ id: o.id, col: ORE_COL[o.id], known: !!o.e })) });
      D3.add(sec, built);
      sec.art = built;
      sec.sk = reached[k] && (inked & bit(k)) ? null : true;
      if (sec.kind === 'top') { if (town && (inked & bit(0))) sec.sk = null; placeTopTags(sec); }
      else if (sec.kind === 'layer') placeLayerTags(sec);
      sec.mode = reached[k] ? ((inked & bit(k)) ? 'color' : 'pending') : 'sketch';
      return;
    }
    if (sec.kind === 'top') {
      const A = paintTop({ W: sec.W, town, M: sec.M });
      sec.art = A;
      sec.cv = A.art.commit();
      if (!town || !(inked & bit(0))) sec.sk = sketchOf(A.art, { z: 1, ink: 0.75, region: (x, y) => x >= A.townX0 && y >= GROUND + 6 }).commit();
      placeTopTags(sec);
    } else if (sec.kind === 'layer') {
      const z = sec.z, F = finds[z];
      const R = paintLayer({ z, W: sec.W, stops: sec.stops, ores: F.ores.filter((o) => ORE_COL[o.id]).map((o) => ({ id: o.id, col: ORE_COL[o.id], known: !!o.e })) });
      placeLife({ W: sec.W, finds: F }, R, makeRng(seed * 7 + z));
      sec.art = R;
      sec.cv = R.art.commit();
      if (!reached[z] || !(inked & bit(z))) sec.sk = sketchOf(R.art, { z, ...sketchFor(z) }).commit();
      placeLayerTags(sec);
    } else {
      const R = paintCore({ W: sec.W });
      sec.art = R;
      sec.cv = R.art.commit();
      if (!reached[7] || !(inked & bit(7))) sec.sk = sketchOf(R.art, { z: 6, ...sketchFor(7) }).commit();
    }
    sec.mode = reached[k] ? ((inked & bit(k)) ? 'color' : 'pending') : 'sketch';
  };
  const placeTag = (tag, x, y) => {
    const px = S.px;
    tag.style.transform = `translate(${Math.round(x * px - tag.offsetWidth / 2)}px, ${Math.round(y * px - tag.offsetHeight)}px)`;
    tag.style.visibility = 'visible';
  };
  const placeTopTags = (sec) => {
    const A = sec.art;
    const ht = tags.get('home'), tt = tags.get('town');
    if (ht) placeTag(ht, A.homeStop.x, sec.y + A.homeStop.fy - 20);
    if (tt) placeTag(tt, A.townTag.x, sec.y + A.townTag.y);
    if (you && you.top) { const f = (you.stop?.id === 'town' ? A.townStop : A.homeStop) || A.homeStop; youSpot = { sec, x: f.x - (you.stop?.id === 'town' ? 0 : 14), fy: f.fy }; }
  };
  const placeLayerTags = (sec) => {
    const placed = [];
    const list = sec.stops.slice().sort((a, b) => a.x - b.x);
    for (const s of list) {
      const tag = tags.get(s.id);
      if (!tag) continue;
      const w = tag.offsetWidth / S.px, hgt = tag.offsetHeight / S.px;
      let y = sec.y + s.fy - 20;
      const x = clamp(s.x, w / 2 + 2, sec.W - w / 2 - 14);
      for (const p of placed) if (Math.abs(p.x - x) < (p.w + w) / 2 + 1 && Math.abs(p.y - y) < hgt + 1) y = p.y - hgt - 1;
      placed.push({ x, y, w });
      placeTag(tag, x, y);
    }
    if (you && !you.top && you.zone === sec.z) {
      const x = you.stop ? clamp(you.stop.x - 15, 8, sec.W - 6) : clamp(ax(sec.W, you.x), 8, sec.W - 6);
      const ft = sec.art.floorTop;
      youSpot = { sec, x, fy: typeof ft === 'function' ? ft(x) : ft[clamp(x, 0, sec.W - 1)] };
      if (!you.stop) placeTag(youTag, x, sec.y + youSpot.fy - 13);
    }
  };
  let youSpot = null;

  // ---- scrolling
  const maxScroll = () => Math.max(0, S.total - S.VH);
  const secOf = (key) => S.sections.find((s) => (key === 'top' ? s.kind === 'top' : s.z === key));
  const goTo = (key) => {
    const sec = secOf(key);
    if (!sec) return;
    S.target = clamp(sec.y + sec.H / 2 - S.VH / 2, 0, maxScroll());
    S.vel = 0;
  };
  const centerOn = (y) => { S.scroll = S.target = clamp(y - S.VH * 0.45, 0, maxScroll()); };

  // ---- input: wheel, drag (with inertia), keys, taps
  const onWheel = (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? S.VH * S.px : 1;
    S.target = clamp(S.target + (e.deltaY * k) / S.px, 0, maxScroll());
    S.vel = 0;
  };
  const tilt = [0, 0], tiltT = [0, 0];
  let drag = null;
  const onDown = (e) => {
    if (e.button != null && e.button !== 0) return;
    drag = { id: e.pointerId, y: e.clientY, x: e.clientX, y0: e.clientY, x0: e.clientX, t: performance.now(), moved: false, type: e.pointerType, target: e.target };
    S.vel = 0;
    S.target = S.scroll;
  };
  const onMove = (e) => {
    if (drag && e.pointerId === drag.id) {
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) {
        drag.moved = true;
        try { view.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        hideTip();
      }
      if (drag.moved) {
        const now = performance.now(), dt = Math.max(1, now - drag.t);
        S.scroll = S.target = clamp(S.scroll - dy / S.px, 0, maxScroll());
        S.vel = S.vel * 0.6 + (-dy / S.px / (dt / 1000)) * 0.4;
        drag.t = now;
      }
      drag.y = e.clientY;
      return;
    }
    if (e.pointerType === 'mouse') { hover(e); const r = view.getBoundingClientRect(); tiltT[0] = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1); tiltT[1] = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1); }
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved) { if (performance.now() - d.t > 90) S.vel = 0; suppressClick = true; setTimeout(() => { suppressClick = false; }, 0); return; }
    S.vel = 0;
    if (d.target.closest('button, a, .ll-plaque')) return;
    tapScene(e, d.type);
  };
  let suppressClick = false;
  const onClickCapture = (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } };
  const onKey = (e) => {
    if (!alive || game.ui.panelStack?.[game.ui.panelStack.length - 1] !== h) return;
    const step = { ArrowDown: 24, ArrowUp: -24, PageDown: S.VH * 0.85, PageUp: -S.VH * 0.85, ' ': S.VH * 0.85 }[e.key];
    if (step != null) { S.target = clamp(S.target + step, 0, maxScroll()); e.preventDefault(); return; }
    if (e.key === 'Home') { S.target = 0; e.preventDefault(); }
    if (e.key === 'End') { S.target = maxScroll(); e.preventDefault(); }
  };
  view.addEventListener('wheel', onWheel, { passive: false });
  view.addEventListener('pointerdown', onDown);
  view.addEventListener('pointermove', onMove);
  view.addEventListener('pointerup', onUp);
  view.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) drag = null; });
  view.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
  view.addEventListener('click', onClickCapture, true);
  // (the view never scrolls natively: focusing a tag far down must not slide the track under the canvas)
  view.addEventListener('scroll', () => { if (view.scrollTop || view.scrollLeft) { view.scrollTop = 0; view.scrollLeft = 0; } });
  window.addEventListener('keydown', onKey, true);

  // what's under a point of the view: the section, the art x/y, the nearest stop
  const probe = (e) => {
    const r = view.getBoundingClientRect();
    const x = (e.clientX - r.left) / S.px, y = Math.round(S.scroll) + (e.clientY - r.top) / S.px;
    const sec = S.sections.find((s) => y >= s.y && y < s.y + s.H);
    if (!sec) return null;
    if (sec.kind === 'top') {
      const A = sec.art;
      if (!A) return { sec };
      const ly = y - sec.y;
      const inHome = x >= A.homeR.x0 && x <= A.homeR.x1 && ly > GROUND;
      const inTown = x >= A.townR.x0 && x <= A.townR.x1 && ly > GROUND;
      const s = inHome ? stops.find((q) => q.id === 'home') : inTown ? stops.find((q) => q.id === 'town') : null;
      return { sec, x, y, stop: s && s.id !== here ? s : null, label: s ? s.name : null, here: s && s.id === here };
    }
    if (sec.kind !== 'layer') return { sec };
    const d0 = LIFT_ZONE_DEPTHS[sec.z - 1], d1 = LIFT_ZONE_DEPTHS[sec.z];
    const wx = X0 + ((x - 4) / (S.W - 8)) * (X1 - X0), wd = d0 + clamp((y - sec.y) / sec.H, 0, 1) * (d1 - d0);
    const s = nearestIn(sec.z, { x: wx, d: wd });
    return { sec, x, y, stop: s, locked: !unlockedIn(sec.z), sketch: !reached[sec.z], label: s ? s.name : null };
  };
  const showTip = (html, cx, cy, cls) => {
    const r = view.getBoundingClientRect();
    tip.hidden = false;
    tip.className = 'll-tip' + (cls ? ' ' + cls : '');
    tip.innerHTML = html;
    const tw = tip.offsetWidth;
    tip.style.transform = `translate(${Math.round(clamp(cx - r.left + 14, 4, r.width - tw - 40))}px, ${Math.round(clamp(cy - r.top + 16, 4, r.height - 40))}px)`;
  };
  const hideTip = () => { tip.hidden = true; view.classList.remove('hot'); setHot(null); };
  let hotZ = null;
  const setHot = (z) => { if (hotZ === z) return; if (hotZ) plaques[hotZ]?.classList.remove('hot'); hotZ = z; if (z) plaques[z]?.classList.add('hot'); };
  const lockTip = (z, sk) => (sk ? `<b>${ZONES[z].name}</b><br><small>Not reached yet</small>` : `<b>${ZONES[z].name}</b> · locked<br><small>Unlock a lift down there first</small>`);
  const hover = (e) => {
    if (e.target.closest('button, .ll-plaque, .ll-rail')) { hideTip(); return; }
    const p = probe(e);
    if (!p || !p.sec || (p.sec.kind !== 'layer' && p.sec.kind !== 'top')) { hideTip(); return; }
    if (p.sec.kind === 'top') {
      if (p.stop && canRide) { view.classList.add('hot'); showTip(`<b>Ride</b> to ${p.label}`, e.clientX, e.clientY); } else if (p.here) showTip(`${p.label}: <i>you are here</i>`, e.clientX, e.clientY, 'dim'); else hideTip();
      return;
    }
    setHot(p.sec.z);
    if (p.locked) { view.classList.remove('hot'); showTip(lockTip(p.sec.z, p.sketch), e.clientX, e.clientY, 'dim'); return; }
    if (!canRide) { view.classList.remove('hot'); showTip(`<b>${ZONES[p.sec.z].name}</b><br><small>Ride from a lift to dive here</small>`, e.clientX, e.clientY, 'dim'); return; }
    if (!p.stop) { view.classList.remove('hot'); showTip(`<b>${ZONES[p.sec.z].name}</b>: you are here`, e.clientX, e.clientY, 'dim'); return; }
    view.classList.add('hot');
    showTip(`<b>Dive ▾</b> ${p.stop.name} <small>${Math.round(p.stop.where.d)} m</small>`, e.clientX, e.clientY);
  };
  let picked = null;
  const tapScene = (e, type) => {
    const p = probe(e);
    pick.hidden = true;
    if (!p || !p.sec) return;
    if (p.sec.kind === 'layer') setHot(p.sec.z);
    if (!canRide || !p.stop) {
      if (p.sec.kind === 'layer' && (p.locked || !canRide)) showTip(p.locked ? lockTip(p.sec.z, p.sketch) : `<b>${ZONES[p.sec.z].name}</b><br><small>Ride from a lift to dive here</small>`, e.clientX, e.clientY, 'dim');
      return;
    }
    if (type === 'mouse') { dive(p.stop); return; }
    // touch: the first tap picks, the button rides
    picked = p.stop;
    const r = view.getBoundingClientRect();
    pick.innerHTML = '';
    pick.append(el('b', {}, 'Dive ▾'), el('span', {}, `${p.stop.name} · ${p.stop.where.top ? '' : Math.round(p.stop.where.d) + ' m'}`));
    pick.hidden = false;
    const pw = pick.offsetWidth, ph = pick.offsetHeight;
    pick.style.transform = `translate(${Math.round(clamp(e.clientX - r.left - pw / 2, 6, r.width - pw - 36))}px, ${Math.round(clamp(e.clientY - r.top - ph - 18, 6, r.height - ph - 6))}px)`;
    tip.hidden = true;
  };
  pick.addEventListener('click', () => { if (picked) dive(picked); });

  // ---- the ink-in: a newly reached layer's colour rolls on over its sketch, left to right
  const INK_DUR = 1.5;
  const startInk = (sec, t) => {
    sec.mode = 'ink';
    sec.ink0 = t;
    inked |= bit(sec.key);
    st.flag('llInked', inked);
    game.audio.play('page', { vol: 0.5 });
    sec.inkSnd = 0;
  };
  /** The roller's front at row y (art px from the section's top), p 0..1. */
  const frontAt = (sec, y, p) => {
    const x0 = sec.kind === 'top' ? sec.art.townX0 - 30 : -26;
    return x0 + p * (sec.W + 26 - x0) + Math.sin(y * 0.09 + sec.key) * 7 + Math.sin(y * 0.31) * 2.5 + (hash(y >> 2, sec.key, 3) - 0.5) * 4;
  };

  // ---- the frame: physics, compose, labels
  const t0 = performance.now();
  let last = t0;
  const frame = (now) => {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (!S.ready) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - t0) / 1000;
    if (!drag) {
      if (Math.abs(S.vel) > 4) { S.scroll += S.vel * dt; S.vel *= Math.exp(-dt * 4.2); S.target = S.scroll; }
      else { S.vel = 0; S.scroll += (S.target - S.scroll) * (1 - Math.exp(-dt * 12)); }
      if (S.scroll < 0 || S.scroll > maxScroll()) { S.scroll = clamp(S.scroll, 0, maxScroll()); S.target = S.scroll; S.vel = 0; }
    }
    render(t);
  };
  let last3d = -1;
  const render = (t) => {
    if (D3) {
      try { render3d(t); return; } catch (e) {
        console.error('lift layers: the 3D diorama failed; drawing the flat map instead', e);
        DIO_FAILED = true; DIO = null; D3 = null;
        for (const s2 of S.sections) s2.art = null;
        build(); layoutRail();
      }
    }
    const sy = Math.round(S.scroll), VH = S.VH, W = S.W;
    track.style.transform = `translateY(${-sy * S.px}px)`;
    ctx.fillStyle = '#1c1020';
    ctx.fillRect(0, 0, W, VH);
    for (const sec of S.sections) {
      const top = sec.y - sy;
      if (top >= VH || top + sec.H <= 0) continue;
      paintSection(sec);
      const A = sec.art;
      const c0 = Math.max(0, top), c1 = Math.min(VH, top + sec.H);
      // a newly reached layer inks in once it's well in view
      if (sec.mode === 'pending' && top < VH * 0.55 && top + sec.H > VH * 0.45) { sec.pendT ??= t; if (t - sec.pendT > 0.35) startInk(sec, t); }
      const p = sec.mode === 'ink' ? (sec.inkFreeze ?? clamp((t - sec.ink0) / INK_DUR, 0, 1)) : sec.mode === 'color' ? 1 : 0;
      if (sec.mode === 'ink' && p >= 1) sec.mode = 'color';
      if (sec.mode === 'ink' && sec.inkSnd < 3 && p > sec.inkSnd * 0.3 + 0.08) { sec.inkSnd++; game.audio.play('brush', { vol: 0.35 }); }
      const blit = (cv, k, M) => {
        if (!cv) return;
        const center = sec.y + sec.H / 2 - (sy + VH / 2);
        const off = Math.round(center * (k - 1));
        const py = top + off - M;
        const sy0 = clamp(c0 - py, 0, cv.height), sh = Math.min(c1 - c0, cv.height - sy0);
        if (sh > 0) ctx.drawImage(cv, 0, sy0, W, sh, 0, c0, W, sh);
        return off - M;
      };
      ctx.save();
      ctx.beginPath(); ctx.rect(0, c0, W, c1 - c0); ctx.clip();
      // the coloured print (and what moves in it)
      const drawColor = () => {
        if (sec.kind === 'top') {
          const ob = blit(A.back, 0.78, sec.M);
          drawSky(ctx, sec, t, top + ob + sec.M);
          blit(sec.cv, 1, 0);
          drawTopAnim(ctx, sec, t, top);
          if (youSpot && youSpot.sec === sec) drawMole(ctx, youSpot.x, top + youSpot.fy, t);
        } else if (sec.kind === 'layer') {
          blit(sec.cv, 1, 0);
          drawLayerAnim(ctx, sec, t, top);
          if (youSpot && youSpot.sec === sec) drawMole(ctx, youSpot.x, top + youSpot.fy, t);
        } else {
          blit(sec.cv, 1, 0);
          drawCoreAnim(ctx, sec, t, top);
        }
      };
      if (sec.mode === 'color' || !sec.sk) drawColor();
      else if (sec.mode === 'sketch' || sec.mode === 'pending') {
        if (sec.kind === 'top') { drawColor(); blit(sec.sk, 1, 0); } // only the town's corner is a sketch
        else blit(sec.sk, 1, 0);
      } else {
        // inking: the sketch, then the colour clipped to what the roller has covered, then its wet edge
        if (sec.kind === 'top') drawColor();
        blit(sec.sk, 1, 0);
        ctx.save();
        ctx.beginPath();
        const y0 = sec.kind === 'top' ? GROUND + 6 : 0;
        for (let y = y0; y < sec.H; y += 2) { const fx = Math.round(frontAt(sec, y, p)); if (fx > 0) ctx.rect(0, top + y, fx, 2); }
        ctx.clip();
        drawColor();
        ctx.restore();
        ctx.fillStyle = '#2a1626';
        for (let y = y0; y < sec.H; y += 2) {
          const fx = Math.round(frontAt(sec, y, p));
          if (fx < -2 || fx > W || (sec.kind === 'top' && fx < sec.art.townX0)) continue;
          ctx.fillRect(fx, top + y, 2, 2);
          if (hash(y, sec.key, 9) < 0.18) ctx.fillRect(fx + 3 + Math.round(hash(y, 2, 9) * 6), top + y + (y & 1), 1, 1);
        }
      }
      ctx.restore();
    }
    // the town lift's cage rides its shaft (dwelling at each end), in the layers you've reached
    {
      const per = 26, tt = (t / per) % 1;
      const u = tt < 0.18 ? 0 : tt < 0.5 ? (1 - Math.cos(((tt - 0.18) / 0.32) * Math.PI)) / 2 : tt < 0.68 ? 1 : (1 + Math.cos(((tt - 0.68) / 0.32) * Math.PI)) / 2;
      const gy = S.cageTop + (S.cageBot - S.cageTop) * u;
      const cy = Math.round(gy - sy);
      if (cy > -24 && cy < VH + 24) {
        ctx.drawImage(cageSprite(), SHAFT_X - 8, cy - 16);
        ctx.fillStyle = Math.sin(t * 9) > 0.3 ? '#fde8a8' : '#f6c25a';
        ctx.fillRect(SHAFT_X + 6, cy - 9, 1, 1);
      }
    }
    // the rail's thumb: where the view is
    if (railH) {
      const k = railH / S.total;
      thumb.style.transform = `translateY(${Math.round(sy * k)}px)`;
      thumb.style.height = Math.max(8, Math.round(VH * k)) + 'px';
    }
  };
  // the 3D frame: build what comes into view, the bands to sketch or ink, the cage, the mole, the depths
  const render3d = (t) => {
    const sy = Math.round(S.scroll), VH = S.VH, W = S.W;
    track.style.transform = `translateY(${-sy * S.px}px)`;
    if (railH) { const k = railH / S.total; thumb.style.transform = `translateY(${Math.round(sy * k)}px)`; thumb.style.height = Math.max(8, Math.round(VH * k)) + 'px'; }
    if (t - last3d < 1 / 30 && last3d >= 0) return; // (a 30 fps cap: it's a map)
    last3d = t;
    const bands = [];
    for (const sec of S.sections) {
      const top = sec.y - sy;
      if (top >= VH + 40 || top + sec.H <= -40) continue;
      paintSection(sec);
      if (sec.mode === 'pending' && top < VH * 0.55 && top + sec.H > VH * 0.45) { sec.pendT ??= t; if (t - sec.pendT > 0.35) startInk(sec, t); }
      const p = sec.mode === 'ink' ? (sec.inkFreeze ?? clamp((t - sec.ink0) / INK_DUR, 0, 1)) : 0;
      if (sec.mode === 'ink' && p >= 1) sec.mode = 'color';
      if (sec.mode === 'ink' && sec.inkSnd < 3 && p > sec.inkSnd * 0.3 + 0.08) { sec.inkSnd++; game.audio.play('brush', { vol: 0.35 }); }
      if (sec.mode === 'color' || !sec.sk) continue;
      const sk = sketchFor(sec.key);
      const y0 = sec.kind === 'top' ? top + GROUND3 + 8 : top;
      bands.push({ y0, y1: top + sec.H, x0: sec.kind === 'top' ? sec.art.townX0 : 0, mode: sec.mode === 'ink' ? 2 : 1, p, faint: !!sk.faint, inkX: W * (sk.ink ?? 0), seed: sec.key * 1.7 });
    }
    for (let i = 0; i < 2; i++) tilt[i] += (tiltT[i] - tilt[i]) * 0.08;
    const per = 26, tt = (t / per) % 1;
    const u = tt < 0.18 ? 0 : tt < 0.5 ? (1 - Math.cos(((tt - 0.18) / 0.32) * Math.PI)) / 2 : tt < 0.68 ? 1 : (1 + Math.cos(((tt - 0.68) / 0.32) * Math.PI)) / 2;
    const mole = youSpot ? { x: youSpot.x, y: youSpot.sec.y + youSpot.fy } : null;
    const img = D3.frame({ scroll: sy, t, tilt, bands, cageY: S.cageTop + (S.cageBot - S.cageTop) * u, mole });
    ctx.putImageData(img, 0, 0);
    // the depths, in the pixel font, by the staff
    for (const sec of S.sections) {
      if (sec.kind !== 'layer') continue;
      const top = sec.y - sy;
      if (top >= VH || top + sec.H <= 0) continue;
      const d0 = LIFT_ZONE_DEPTHS[sec.z - 1], d1 = LIFT_ZONE_DEPTHS[sec.z];
      for (let d = Math.ceil(d0 / 10) * 10; d < d1; d += 10) {
        if ((d - d0 < 5 && d !== d0) || d1 - d < 5) continue;
        ctx.drawImage(numCanvas(d), 6, Math.round(top + ((d - d0) / (d1 - d0)) * sec.H) + 1);
      }
    }
  };
  let railH = 0;
  const layoutRail = () => {
    railH = rail.clientHeight - 0;
    const k = railH / S.total;
    for (const r of rk) {
      const sec = secOf(r.key);
      r.b.style.top = Math.round(sec.y * k) + 'px';
      r.b.style.height = Math.max(14, Math.round(sec.H * k)) + 'px';
    }
  };
  const start = () => {
    if (!alive) return;
    if (!build()) { requestAnimationFrame(start); return; }
    // open on where you are
    let at = 0;
    if (you && you.top) at = TOP_H * 0.62;
    else if (you) { const sec = secOf(you.zone); at = sec ? sec.y + sec.H * 0.6 : 0; }
    centerOn(at);
    S.ready = true;
    layoutRail();
    // (a painting error must not stop the loop: the view would stay black and dead)
    try { render(0); } catch (e) { console.error('lift layers: first paint failed', e); }
    const queue = S.sections.slice().sort((a, b) => Math.abs(a.y - S.scroll) - Math.abs(b.y - S.scroll));
    const idle = () => { if (!alive) return; const s = queue.find((q) => !q.art); if (!s) return; try { paintSection(s); } catch (e) { console.error('lift layers: paint failed', e); s.art = s.art || null; return; } idleT = setTimeout(idle, 40); };
    idleT = setTimeout(idle, 120);
    raf = requestAnimationFrame(frame);
  };
  // rebuild on a real size change (resizing the window)
  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    let lastW = 0, lastH = 0;
    ro = new ResizeObserver(() => {
      const w = view.clientWidth, hh = view.clientHeight;
      if (!S.ready || (Math.abs(w - lastW) < 2 && Math.abs(hh - lastH) < 2)) { lastW = w; lastH = hh; return; }
      lastW = w; lastH = hh;
      const frac = S.total ? (S.scroll + S.VH / 2) / S.total : 0;
      if (build()) { youSpot = null; S.scroll = S.target = clamp(frac * S.total - S.VH / 2, 0, maxScroll()); layoutRail(); }
    });
    ro.observe(view);
  }
  requestAnimationFrame(start);

  h.debug = {
    state: S, stops, exp, reached, you: () => youSpot,
    scrollTo: (key) => { goTo(key); S.scroll = S.target; },
    dive: (z) => dive(nearestIn(z, null)),
    paintAll: () => { for (const s of S.sections) paintSection(s); },
    /** Re-run a layer's ink-in (for a look at it). */
    reink: (key) => { const s = S.sections.find((q) => q.key === key); if (s && s.sk) { s.mode = 'pending'; s.pendT = null; s.inkFreeze = undefined; } },
    /** Hold a layer's ink-in at p (0..1) for a look at it. */
    inkAt: (key, p) => { const s = S.sections.find((q) => q.key === key); if (s && s.sk) { s.mode = 'ink'; s.ink0 = 0; s.inkSnd = 3; s.inkFreeze = p; } },
    is3d: () => !!D3,
  };
  return h;
}

/**
 * The layers from anywhere (the M key, the radar): view-only, unless you're standing at an
 * unlocked lift down in the mine (then its Dive buttons ride from it).
 */
export function openLayers(game) {
  const st = game.state;
  const sc = game.scene;
  let here = null, ride = null, you = null;
  if (game.sceneName === 'home') here = 'home';
  else if (game.sceneName === 'town') here = 'town';
  else if (game.sceneName === 'deep' && sc?.player?.pos) {
    const p = sc.player.pos;
    you = { x: p.x, d: -p.y };
    const L = sc.liftNear?.();
    if (L && liftUnlocked(st, L.id)) { here = L.id; ride = (id) => (sc.rideLift ? sc.rideLift(id) : rideTo(game, id)); }
  }
  return openLiftLayers(game, here, { title: 'The Layers', sub: ride ? 'Where to?' : 'Everything under the meadow, layer by layer.', you }, liftDestinations(st), ride, lockedLifts(st));
}
export default openLayers;
