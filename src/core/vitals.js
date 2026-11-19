// The stamina rules (PEAK-like). One bar: stamina fills it from the left, afflictions eat into its
// length from the right (State.energyCap):
//  - work drains it (digging, sprinting, jumping, climbing, swings: DigScene.energy / useEnergy);
//    a moment after the last real effort it refills slowly by itself (slower when hungry)
//  - hunger grows slowly while you play (only once the bar has been shown: Onboard 'energy');
//    food takes it away and refills the stamina (State.feed, from Game.eat)
//  - a hit drains stamina and wounds you: injury caps the bar until it mends (slowly; quicker with a
//    hearty meal; herbs and herb dishes mend it on the spot: item.heal; sleep mends it all)
//  - at 0 you black out (DigScene.faint → ui.status.blackout: the eyes close, you wake at home)
// Values are per 100 points of bar and scale with maxEnergy.
export const VIT = {
  regen: 1.5, // stamina/s while resting
  exertTau: 0.55, // s: how fast the effort of the last blows fades
  exertRest: 0.2, // effort (points, decaying) below which the mole counts as resting (walking is)
  hungerRate: 1 / 32, // points/s
  hungerMax: 0.65, // of the bar
  hurtInjury: 0.5, // of a hit's damage
  mend: 0.05, // injury points/s (×3 with the hearty buff)
};

/** Hits wound (DigScene.hurt tells everyone with an 'act' of type 'hurt'). */
export function attachVitals(game) {
  const st = game.state;
  st.on('act', (e) => { if (e?.type === 'hurt' && e.n > 0) st.injure(e.n * VIT.hurtInjury); });
}

/** Per frame, while a scene plays (Game.loop). */
export function tickVitals(game, dt) {
  const st = game.state, d = st.data, ui = game.ui;
  st.exert = (st.exert || 0) * Math.exp(-dt / VIT.exertTau);
  if (game.sceneName === 'title' || !ui || ui.hudMode === 'none') return;
  const k = d.maxEnergy / 100;
  const shown = ui.onboard?.isUnlocked ? ui.onboard.isUnlocked('energy') : true;
  // Survival skills (data/skills.js): appetite slows hunger, mend speeds healing
  if (shown && !ui.isPanelOpen?.()) d.hunger = Math.min(d.maxEnergy * VIT.hungerMax, (d.hunger || 0) + VIT.hungerRate * k * dt / (st.skill?.('appetite') || 1));
  if (d.injury > 0) d.injury = Math.max(0, d.injury - VIT.mend * k * dt * (st.hasBuff('hearty') ? 3 : 1) * (st.skill?.('mend') || 1));
  const cap = st.energyCap;
  if (d.energy > cap) d.energy = cap;
  else if (d.energy < cap && st.exert < VIT.exertRest && (d.energy > 0 || !game.scene?.faint)) { // (at 0 underground: the blackout)
    d.energy = Math.min(cap, d.energy + VIT.regen * k * dt * (1 - 0.5 * (d.hunger || 0) / d.maxEnergy));
  }
}
