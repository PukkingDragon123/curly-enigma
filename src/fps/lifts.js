// The elevator network: the burrow's own lift down to the mine, Deep Town's lift, and every lift
// the mole has found down in the rock (each one a way back up when energy runs low). Any lift can
// ride to any other the mole knows. Mine lifts are remembered in state.data.deep.lifts.
import { ZONES } from '../data/zones.js';
import { openLiftMap } from './liftPanel.js';

/** Make sure the save has the lift list (and carry over lift stations from older saves). */
export function liftState(st) {
  const d = st.data;
  d.deep ||= { seed: 1 + Math.floor(Math.random() * 1e6), tunnels: [], stations: [] };
  const D = d.deep;
  D.lifts ||= [];
  // the burrow's own lift always goes down to the mine entrance
  if (!D.lifts.some((l) => l.id === 'L0')) D.lifts.unshift({ id: 'L0', name: 'Mine entrance', depth: 7, zone: 1 });
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
  const out = [{ id: 'home', name: 'Home', desc: "Old Star's cave workshop: his forge, the hearth, your bed and Nugget.", depth: 0, zone: 0 }];
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
 * The lift's panel: a pixel-art cross-section of the earth (src/fps/liftPanel.js) with every known
 * stop at its depth; tap a stop to ride. here: the id of this lift ("you are here").
 * opts: { title, sub, onRide(id) } (default ride: rideTo). Returns the panel handle.
 */
export function openLiftPanel(game, here, opts = {}) {
  return openLiftMap(game, here, opts, liftDestinations(game.state), opts.onRide || ((id) => rideTo(game, id)));
}
