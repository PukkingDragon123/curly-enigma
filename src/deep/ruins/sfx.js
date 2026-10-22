// Sounds of the ruins, synthesized: stone grinding, rune chimes rising with progress, the deep
// rumble of a seal giving, water draining, a draught through cracks, a chest lid. Built on
// audio.tone / audio.noise plus the shared presets.

export function sfx(audio) {
  const a = audio;
  const tone = (o) => a?.tone?.(o);
  const noise = (o) => a?.noise?.(o);
  const play = (n, o) => a?.play?.(n, o);
  return {
    /** Stone dragging on stone (a drum turning, a lever's slot, a plate sinking). */
    grind(vol = 0.5, dur = 0.45) {
      noise({ color: 'brown', filter: 'bandpass', f: 260, f2: 140, q: 1.4, dur, a: 0.04, vol: 0.32 * vol });
      noise({ color: 'pink', filter: 'bandpass', f: 1400, f2: 700, q: 2, dur: dur * 0.8, a: 0.02, vol: 0.06 * vol });
    },
    click(pitch = 1) {
      play('clunk', { pitch, vol: 0.6 });
      tone({ f: 420 * pitch, f2: 300 * pitch, type: 'square', dur: 0.05, vol: 0.05, filter: 'lowpass', ff: 1800 });
    },
    /** A rune lighting: a soft bell, higher with every step of progress. */
    chime(k = 0) {
      const f = 523.25 * Math.pow(2, [0, 4, 7, 12, 16, 19, 24][Math.min(6, k)] / 12);
      tone({ f, type: 'sine', dur: 1.4, vol: 0.07, a: 0.005, release: 1.2, reverb: 0.6 });
      tone({ f: f * 2.01, type: 'sine', dur: 0.9, vol: 0.03, a: 0.005, reverb: 0.6 });
      tone({ f: f * 3.98, type: 'triangle', dur: 0.3, vol: 0.012, reverb: 0.5 });
    },
    /** Wrong: a clatter and a low groan. */
    wrong() {
      play('fail', { vol: 0.5 });
      for (let i = 0; i < 4; i++) play('clunk', { pitch: 0.7 + i * 0.12, vol: 0.4, gap: 0 });
      tone({ f: 110, f2: 70, type: 'sawtooth', dur: 0.7, vol: 0.05, filter: 'lowpass', ff: 400 });
    },
    /** The seal gives: a deep rumble, grinding, then a ringing chord. */
    open() {
      play('rumble_hit', { vol: 0.9 });
      noise({ color: 'brown', filter: 'lowpass', f: 180, dur: 2.4, a: 0.2, vol: 0.5 });
      noise({ color: 'brown', filter: 'bandpass', f: 320, f2: 160, q: 1.2, dur: 2.0, a: 0.3, vol: 0.25, delay: 0.2 });
      [0, 7, 12, 16].forEach((s, i) => tone({ f: 261.6 * Math.pow(2, s / 12), type: 'sine', dur: 2.6, vol: 0.05, a: 0.02, release: 2, reverb: 0.8, delay: 0.5 + i * 0.16 }));
    },
    solved() {
      [0, 4, 7, 12, 16, 19].forEach((s, i) => tone({ f: 523.25 * Math.pow(2, s / 12), type: 'triangle', dur: 0.5, vol: 0.05, delay: i * 0.08, reverb: 0.5 }));
      play('discover', { vol: 0.6 });
    },
    gurgle() {
      play('bubble', { vol: 0.5 });
      noise({ color: 'pink', filter: 'bandpass', f: 500, f2: 220, q: 3, dur: 0.5, a: 0.05, vol: 0.12 });
    },
    draught(vol = 0.3) {
      tone({ f: 620 + Math.random() * 80, f2: 540, type: 'sine', dur: 1.6, vol: 0.012 * vol, a: 0.6, vib: 6, reverb: 0.6 });
      noise({ color: 'pink', filter: 'bandpass', f: 900, q: 6, dur: 1.4, a: 0.5, vol: 0.05 * vol });
    },
    creak() { play('creak', { vol: 0.7 }); },
    lid() { play('creak', { vol: 0.6, pitch: 0.8 }); play('door', { vol: 0.4 }); },
    coins(n = 6) { play('coins', { n }); },
    fanfare() { play('fanfare', { vol: 0.6 }); },
    ignite() { play('ignite', { vol: 0.6 }); },
    hum() { return a?.loop?.('hum', { vol: 0.0001 }) || { set() {}, stop() {} }; },
    water() { return a?.loop?.('water', { vol: 0.0001 }) || { set() {}, stop() {} }; },
  };
}
