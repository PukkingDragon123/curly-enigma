// Helpers for the journey intro: a heartbeat, and the muffled hearing of someone who has just been
// knocked out. (The forest's own sounds are in forest/sound.js.)

// ------------------------------------------------------------------ sounds
/** One heartbeat (lub-dub), low enough to come through the muffle. */
export function heartbeat(audio, vol = 0.45) {
  audio.tone({ f: 62, f2: 40, type: 'sine', dur: 0.13, vol, a: 0.004, release: 0.12 });
  audio.tone({ f: 120, f2: 70, type: 'triangle', dur: 0.05, vol: vol * 0.25, a: 0.002, release: 0.05 });
  audio.tone({ f: 54, f2: 36, type: 'sine', dur: 0.11, vol: vol * 0.75, a: 0.004, release: 0.12, delay: 0.24 });
}

/**
 * Muffle everything (a lowpass on the master bus): knocked out, ears ringing.
 * Returns a function that restores normal hearing.
 */
export function muffle(audio, freq = 420) {
  const ctx = audio.ctx;
  if (!ctx || !audio.master || !audio.comp) return () => {};
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 14000;
  lp.Q.value = 0.9;
  try {
    audio.master.disconnect();
    audio.master.connect(lp).connect(audio.comp);
    lp.frequency.setTargetAtTime(freq, ctx.currentTime, 0.35);
  } catch (e) { return () => {}; }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    try { audio.master.disconnect(); lp.disconnect(); audio.master.connect(audio.comp); } catch (e) { /* already restored */ }
  };
}
