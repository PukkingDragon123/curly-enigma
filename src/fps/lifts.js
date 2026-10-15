// The elevator network: the burrow's own lift down to the mine, Deep Town's lift, and every lift
// the mole has found down in the rock (each one a way back up when energy runs low). Any lift can
// ride to any other the mole knows. Mine lifts are remembered in state.data.deep.lifts.
import { el } from '../core/util.js';
import { ZONES } from '../data/zones.js';

/** Make sure the save has the lift list (and carry over lift stations from older saves). */
export function liftState(st) {
  const d = st.data;
  d.deep ||= { seed: 1 + Math.floor(Math.random() * 1e6), tunnels: [], stations: [] };
  const D = d.deep;
  D.lifts ||= [];
  for (const n of D.stations || []) {
    const id = 's' + n;
    if (!D.lifts.some((l) => l.id === id)) D.lifts.push({ id, name: n === 0 ? 'Below Deep Town' : `${ZONES[n]?.name || 'Deep'} station`, depth: 0, zone: n || 1 });
  }
  return D.lifts;
}

/** Remember a mine lift ({ id, name, depth, zone }); returns true the first time. */
export function discoverLift(st, lift) {
  const L = liftState(st);
  if (L.some((l) => l.id === lift.id)) return false;
  L.push({ id: lift.id, name: lift.name, depth: Math.round(lift.depth), zone: lift.zone });
  return true;
}

/** Every place the mole can ride to: home, Deep Town (once reached), mine lifts found. */
export function liftDestinations(st) {
  const out = [{ id: 'home', name: 'Home', desc: 'Your burrow. Bed, forge, stove and Nugget.', depth: 0, zone: 0 }];
  if (st.flag('escaped')) out.push({ id: 'town', name: 'Deep Town', desc: 'Shops, the assay office and the Surface Express.', depth: 15, zone: 1 });
  for (const l of liftState(st).slice().sort((a, b) => a.depth - b.depth)) out.push({ ...l, desc: ZONES[l.zone]?.desc || 'A lift you found down in the rock.' });
  return out;
}

/** Ride to a destination id: scene change with a lift rattle. */
export function rideTo(game, id) {
  game.audio.play('creak', { vol: 0.6 });
  game.audio.play('rumble_hit', { vol: 0.35 });
  const opts = { transition: 'fade', dur: 0.8, color: 0x0a0605 };
  if (id === 'home') return game.goto('home', { from: 'lift' }, opts);
  if (id === 'town') return game.goto('town', { from: 'lift' }, opts);
  return game.goto('deep', { from: 'lift', lift: id }, opts);
}

/**
 * The lift's brass panel: pick where to go. here: the id of this lift (left out of the list).
 * opts: { title, sub, onRide(id) } (default ride: rideTo).
 */
export function openLiftPanel(game, here, opts = {}) {
  const st = game.state;
  const list = el('div', { class: 'list' });
  let h = null;
  for (const d of liftDestinations(st)) {
    if (d.id === here) continue;
    const Z = ZONES[d.zone];
    const color = d.id === 'home' ? '#8a5a2a' : d.id === 'town' ? '#c8902a' : Z?.color || '#5a4a5a';
    const tag = el('div', { style: { width: 'calc(var(--px) * 16)', height: 'calc(var(--px) * 16)', background: color, border: 'var(--px) solid var(--wood-dk)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, textShadow: '0 var(--px) 0 #000', fontFamily: 'var(--font-display)', fontSize: '1.1em' } }, d.id === 'home' ? '⌂' : d.id === 'town' ? '★' : String(d.zone));
    const row = el('div', { class: 'li interactive', style: { cursor: 'pointer' }, onclick: () => { h?.close(); (opts.onRide || ((id) => rideTo(game, id)))(d.id); } }, [
      tag,
      el('div', {}, [el('div', { class: 'name' }, d.name), el('div', { class: 'desc' }, d.desc)]),
      el('span', { class: 'price', style: { flexDirection: 'column', alignItems: 'flex-end', fontSize: '.85em' } }, [d.depth ? `${d.depth} m` : 'surface', el('span', { class: 'btn', style: { marginTop: 'calc(var(--px) * 1.5)', padding: '0 calc(var(--px) * 3)' } }, 'Go')]),
    ]);
    list.append(row);
  }
  list.append(el('div', { class: 'li locked' }, [
    el('div', { style: { width: 'calc(var(--px) * 16)', height: 'calc(var(--px) * 16)', background: '#3a2a2a', border: 'var(--px) solid var(--wood-dk)', display: 'grid', placeItems: 'center', color: '#a08070' } }, '?'),
    el('div', {}, [el('div', { class: 'name' }, 'More lifts'), el('div', { class: 'desc' }, 'Old lifts are buried all over the mine. Dig to one and ring its bell to add it here.')]),
    el('span', { class: 'price' }, ''),
  ]));
  game.audio.play('bell', { vol: 0.5 });
  h = game.ui.openPanel({ title: opts.title || 'The Lift', sub: opts.sub || 'Where to?', body: el('div', { class: 'scroll', style: { maxHeight: 'min(calc(100vh - 180px), calc(var(--px) * 150))' } }, [list]), width: 'calc(var(--px) * 220)' });
  return h;
}
