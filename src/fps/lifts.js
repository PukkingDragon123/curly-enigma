// The elevator network: the burrow's own lift down to the mine, Deep Town's lift, and every lift
// the mole has found down in the rock (each one a way back up when energy runs low). Any lift can
// ride to any other the mole knows. Mine lifts are remembered in state.data.deep.lifts.
// A mine lift found down in the rock is a checkpoint you have to unlock first (on: false until you
// ring its bell there: unlockLift); only unlocked ones are stops. Lifts found before checkpoints
// existed (no `on`) count as unlocked. The panel is a 3D diorama of the mine (liftDiorama.js).
import { ZONES } from '../data/zones.js';
import { openLiftDiorama } from './liftDiorama.js';

/** A mine lift that has to be unlocked down there before it's a stop (not the entrance, not the town shaft's stations). */
const needsUnlock = (id) => /^L\d/.test(id) && id !== 'L0';

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
  const rec = { id: lift.id, name: lift.name, depth: Math.round(lift.depth), zone: lift.zone };
  if (typeof lift.x === 'number') { rec.x = Math.round(lift.x * 10) / 10; rec.y = Math.round(lift.y * 10) / 10; rec.z = Math.round(lift.z * 10) / 10; }
  if (needsUnlock(lift.id) && !lift.unlocked) rec.on = false;
  L.push(rec);
  return true;
}

/** Remember where a known lift is (for the diorama), from the world plan. */
export function placeLift(st, lift) {
  const l = liftState(st).find((x) => x.id === lift.id);
  if (!l || typeof l.x === 'number' || typeof lift.x !== 'number') return;
  l.x = Math.round(lift.x * 10) / 10; l.y = Math.round(lift.y * 10) / 10; l.z = Math.round(lift.z * 10) / 10;
}
/** Is this lift a stop yet? (false: found but still locked) */
export function liftUnlocked(st, id) { const l = liftState(st).find((x) => x.id === id); return !!l && l.on !== false; }
/** Unlock a found lift as a checkpoint; true the first time. */
export function unlockLift(st, id) {
  const l = liftState(st).find((x) => x.id === id);
  if (!l || l.on !== false) return false;
  l.on = true;
  st.dirty = true;
  return true;
}
/** Lifts found but not unlocked yet. */
export function lockedLifts(st) { return liftState(st).filter((l) => l.on === false).map((l) => ({ ...l, desc: 'Locked: ring its bell down there to unlock it.' })); }

/** Every place the mole can ride to: home, Deep Town (once reached), mine lifts found. */
export function liftDestinations(st) {
  const out = [{ id: 'home', name: 'Home', desc: "Old Star's cave workshop: his forge, the hearth, your bed and Nugget.", depth: 0, zone: 0 }];
  if (st.flag('escaped')) out.push({ id: 'town', name: 'Deep Town', desc: 'Shops, the assay office and the Surface Express.', depth: 15, zone: 1 });
  for (const l of liftState(st).slice().sort((a, b) => a.depth - b.depth)) if (l.on !== false) out.push({ ...l, desc: ZONES[l.zone]?.desc || 'A lift you found down in the rock.' });
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
  return openLiftDiorama(game, here, opts, liftDestinations(game.state), opts.onRide || ((id) => rideTo(game, id)), lockedLifts(game.state));
}
