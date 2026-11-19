// The 8-bit babble voices (Animal Crossing / Undertale style), synthesised with WebAudio.
// Every syllable of the typed text is one chip blip: a vowel starts a new one and sets its note
// (a, e, i, o, u each sit on their own step of the speaker's scale), the consonant before it
// shapes the attack (a click for p/t/k, a hiss for s/f/h, a soft scoop for m/n/l/r). The tune
// follows the sentence: it drifts down as it goes, a question lifts its last word, a "!" is
// higher and louder, a full stop drops. The typing's own pauses (talkType.breathAfter) give the
// punctuation its rests.
//
// A voice is the old { f, type, q, vib, mumble } record (talkType / portrait3d); its timbre comes
// from it: Old Star (mumble) is low and warm (a triangle with a soft pulse an octave down,
// lowpassed); everyone else gets a pulse duty, a spread, a slide and a pace hashed from their
// voice (and their name when the caller passes `who`), so townsfolk all sound different.
//
//   const b = babbler(audio, voice, mood, { who, muffled });  b.letters(flat, from, to)
//   (opts.clock() → seconds: a stand-in for audio.ctx.currentTime, for offline renders)
//   say(audio, voice, mood, { muffled })   one syllable, no text (old voiceBlip callers)
// Volume: audio.vol.voice (0..1, the Voices slider; settings.voice); silent while audio.muted.
// Blips go through audio.master (so the master volume and mute apply) on their own small bus.

const VOWEL_STEP = { a: 0, e: 3, i: 5, o: -2, u: -4, y: 2 };
const PLOSIVE = 'pbtdkgcq', FRICATIVE = 'szfvhxj', SOFT = 'mnlrw';
const MOOD_STEP = { calm: 0, neutral: 0, happy: 2, laugh: 3, worried: 2, stern: -2, proud: 1, sad: -2, angry: -1, surprised: 4, smug: -1, thinking: -1, sleepy: -3 };
const isLetter = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
const isVowel = (c) => !!c && 'aeiouyàáâäèéêëìíîïòóôöùúûü'.includes(c.toLowerCase());
const plainVowel = (c) => { const l = c.toLowerCase(); return 'aàáâä'.includes(l) ? 'a' : 'eèéêë'.includes(l) ? 'e' : 'iìíîï'.includes(l) ? 'i' : 'oòóôö'.includes(l) ? 'o' : 'uùúûü'.includes(l) ? 'u' : 'y'; };

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

// ------------------------------------------------------------------ per-context bits
const KITS = new WeakMap();
function kit(audio) {
  const ctx = audio.ctx;
  let k = KITS.get(ctx);
  if (k) return k;
  const pulse = (d) => {
    const n = 28, re = new Float32Array(n + 1), im = new Float32Array(n + 1);
    for (let h = 1; h <= n; h++) re[h] = (2 / (h * Math.PI)) * Math.sin(h * Math.PI * d);
    return ctx.createPeriodicWave(re, im);
  };
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
  const nd = noise.getChannelData(0);
  // (a 7-bit LFSR-ish hiss: grainier than white noise, like an old sound chip)
  let r = 0x5f, v = 0;
  for (let i = 0; i < nd.length; i++) { if (i % 3 === 0) { const b = ((r >> 0) ^ (r >> 1)) & 1; r = (r >> 1) | (b << 6); v = (r & 1) ? 1 : -1; } nd[i] = v * 0.7; }
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(audio.master || ctx.destination);
  if (audio.reverb) { const send = ctx.createGain(); send.gain.value = 0.12; bus.connect(send).connect(audio.reverb); }
  k = { waves: { 0.125: pulse(0.125), 0.25: pulse(0.25), 0.5: pulse(0.5) }, noise, bus, live: 0, next: 0 };
  KITS.set(ctx, k);
  return k;
}

// ------------------------------------------------------------------ who sounds how
const PROFILES = new Map();
export function profileOf(v = {}, who = '') {
  const key = `${who}|${v.f}|${v.type}|${v.q}|${v.vib || 0}|${v.mumble ? 1 : 0}`;
  let p = PROFILES.get(key);
  if (p) return p;
  const h = hashStr(key), r = (k) => ((h >>> (k * 3)) & 1023) / 1023;
  if (v.mumble || who === 'oldstar' || who === 'star') {
    // Old Star: low and warm, a little gravel, slow vibrato, unhurried syllables
    p = { f: (v.f || 205) * 0.68, wave: 'triangle', sub: 0.5, subDuty: 0.25, lp: 1500, q: 0.9, spread: 0.65, slide: -1, dur: 0.085, vib: 0.18, vibRate: 5.5, vol: 1.15, grit: 0.25 };
  } else {
    const f = v.f || 300;
    const duty = v.type === 'sawtooth' ? 0.125 : v.type === 'triangle' ? null : [0.125, 0.25, 0.5][Math.floor(r(1) * 3)];
    p = {
      f: f * (0.94 + r(2) * 0.12), wave: duty ? 'pulse' : 'triangle', duty: duty || 0.5,
      sub: duty ? 0 : 0.25 + r(3) * 0.2, subDuty: 0.5,
      lp: 2200 + r(4) * 3400 + (f > 380 ? 900 : 0), q: 0.7 + (v.q || 1.5) * 0.25,
      spread: 0.7 + r(5) * 0.7, slide: [-2, -1, 0, 1, 2][Math.floor(r(6) * 5)],
      dur: 0.045 + r(7) * 0.03 + (v.vib ? 0.02 : 0), vib: v.vib ? 0.35 : r(8) < 0.25 ? 0.15 : 0, vibRate: v.vib ? 9 : 7,
      vol: duty === 0.5 ? 0.8 : 1, grit: r(9) * 0.3, chirp: r(10) < 0.3,
    };
  }
  PROFILES.set(key, p);
  return p;
}

// ------------------------------------------------------------------ one blip
const semis = (s) => Math.pow(2, s / 12);
function blip(audio, p, o) {
  const ctx = audio.ctx;
  if (!ctx || audio.muted || (ctx.state !== 'running' && !(typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext))) return;
  const vv = audio.vol?.voice ?? 0.8;
  if (!(vv > 0) || !(audio.vol?.master > 0)) return;
  const K = kit(audio);
  if (K.live > 14) return;
  const now = o.now ?? ctx.currentTime;
  // syllables never pile up: one every so often, a backlog is dropped
  const at = Math.max(now + 0.005, K.next);
  if (at - now > 0.16) return;
  const dur = p.dur * (o.long ? 1.6 : 1) * (o.short ? 0.75 : 1);
  K.next = at + Math.max(0.05, dur * 0.82);
  const step = Math.round((o.step || 0) * p.spread + (o.lift || 0));
  const f0 = p.f * semis(step);
  const vol = 0.07 * vv * p.vol * (o.loud ? 1.3 : 1) * (o.soft ? 0.7 : 1) * (o.muffled ? 0.45 : 1);
  const out = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = o.muffled ? 420 : p.lp; lp.Q.value = p.q;
  out.connect(lp).connect(K.bus);
  // the envelope: a hard or soft attack, a short hold, a quick fall (chip voices click off)
  const att = o.attack === 'hard' ? 0.003 : o.attack === 'soft' ? 0.016 : 0.007;
  const g = out.gain;
  g.setValueAtTime(0.0001, at);
  g.linearRampToValueAtTime(vol, at + att);
  g.setValueAtTime(vol, at + dur * 0.55);
  g.linearRampToValueAtTime(vol * 0.35, at + dur * 0.85);
  g.linearRampToValueAtTime(0.0001, at + dur);
  const end = at + dur + 0.02;
  // the note: stepped (no smooth glides: it's a chip), a scoop up for soft consonants, the slide at the end
  const pitch = (osc, mul) => {
    const fr = osc.frequency;
    const scoop = o.attack === 'soft' ? semis(-2) : o.chirp ? semis(5) : 1;
    fr.setValueAtTime(f0 * mul * scoop, at);
    if (scoop !== 1) fr.setValueAtTime(f0 * mul, at + Math.min(0.018, dur * 0.3));
    const sl = (o.slide ?? p.slide);
    if (sl) fr.setValueAtTime(f0 * mul * semis(sl), at + dur * 0.6);
    if (p.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = p.vibRate; lg.gain.value = f0 * mul * (semis(p.vib) - 1);
      lfo.connect(lg).connect(fr);
      lfo.start(at); lfo.stop(end);
    }
  };
  const mk = (type, duty, mul, gain) => {
    const osc = ctx.createOscillator();
    if (type === 'triangle') osc.type = 'triangle'; else osc.setPeriodicWave(K.waves[duty] || K.waves[0.5]);
    pitch(osc, mul);
    const og = ctx.createGain(); og.gain.value = gain;
    osc.connect(og).connect(out);
    osc.start(at); osc.stop(end);
    return osc;
  };
  const main = mk(p.wave, p.duty, 1, 1);
  if (p.sub) mk(p.wave === 'triangle' ? 'pulse' : 'triangle', p.subDuty, 0.5, p.sub);
  // the consonant: a click or a hiss over the start
  if (o.attack === 'hard' || o.attack === 'hiss' || p.grit > 0.2) {
    const n = ctx.createBufferSource();
    n.buffer = K.noise;
    const nf = ctx.createBiquadFilter();
    nf.type = o.attack === 'hiss' ? 'bandpass' : 'highpass';
    nf.frequency.value = o.attack === 'hiss' ? (o.sib ? 5200 : 2600) : 1800;
    const ng = ctx.createGain(), nl = o.attack === 'hiss' ? 0.035 : o.attack === 'hard' ? 0.012 : 0.006;
    ng.gain.setValueAtTime(vol * (o.attack === 'hiss' ? 0.5 : 0.8), at);
    ng.gain.linearRampToValueAtTime(0.0001, at + nl);
    n.connect(nf).connect(ng).connect(K.bus);
    n.start(at, Math.random() * 0.2, nl + 0.01);
  }
  K.live++;
  main.onended = () => { K.live--; try { out.disconnect(); lp.disconnect(); } catch (e) { /* gone */ } };
}

// ------------------------------------------------------------------ the text's tune
/** Per letter of `flat`: its sentence's end mark, how far into the sentence, last word, shouted. */
function tuneOf(flat) {
  const n = flat.length, end = new Array(n), pos = new Float32Array(n), last = new Uint8Array(n), caps = new Uint8Array(n), nov = new Uint8Array(n);
  let s0 = 0;
  for (let i = 0; i <= n; i++) {
    const c = flat[i];
    const stop = i === n || ((c === '.' || c === '!' || c === '?') && !'.!?'.includes(flat[i + 1] || ''));
    if (!stop) continue;
    const mark = i === n ? '.' : c, len = Math.max(1, i - s0);
    let lw = i; // the last word of the sentence
    while (lw > s0 && !isLetter(flat[lw])) lw--;
    while (lw > s0 && isLetter(flat[lw - 1])) lw--;
    for (let j = s0; j < Math.min(n, i + 1); j++) { end[j] = mark; pos[j] = (j - s0) / len; last[j] = j >= lw ? 1 : 0; }
    s0 = i + 1;
  }
  // SHOUTED WORDS (two capitals or more in a row)
  for (let i = 0; i < n; i++) if (/\p{Lu}/u.test(flat[i]) && (/\p{Lu}/u.test(flat[i + 1] || '') || /\p{Lu}/u.test(flat[i - 1] || ''))) caps[i] = 1;
  // words with no vowel at all ("hmm", "grr", "pfft"): they babble on their consonants
  for (let i = 0; i < n;) {
    if (!isLetter(flat[i])) { i++; continue; }
    let j = i, any = false;
    while (j < n && isLetter(flat[j])) { if (isVowel(flat[j])) any = true; j++; }
    if (!any) nov.fill(1, i, j);
    i = j;
  }
  return { end, pos, last, caps, nov };
}

/** A voice that babbles along with typed text. */
export function babbler(audio, voice, mood = 'calm', o = {}) {
  const p = profileOf(voice || {}, o.who || '');
  const moodLift = MOOD_STEP[mood] || 0;
  let flat0 = null, tune = null, word = -1, vowels = 0, n = 0;
  return {
    letters(flat, from, to) {
      if (!audio?.ctx || audio.muted) return;
      if (flat !== flat0) { flat0 = flat; tune = tuneOf(flat); word = -1; }
      for (let i = Math.max(0, from); i < to && i < flat.length; i++) {
        const c = flat[i];
        if (!isLetter(c)) continue;
        const prev = flat[i - 1];
        if (!isLetter(prev)) { word = i; vowels = 0; }
        const v = isVowel(c) && !(c.toLowerCase() === 'y' && i === word);
        let speak = false;
        if (v && !(isVowel(prev) && isLetter(prev))) { speak = true; vowels++; }
        else if (/\p{N}/u.test(c)) speak = true; // numbers: one blip a digit
        else if (tune.nov[i] && (i - word) % 3 === 0) speak = true; // "hmm", "grr", "pfft"
        if (!speak) continue;
        // the consonant before shapes the attack
        const cons = isLetter(prev) && !isVowel(prev) ? prev.toLowerCase() : '';
        const attack = !cons ? 'soft' : PLOSIVE.includes(cons) ? 'hard' : FRICATIVE.includes(cons) ? 'hiss' : SOFT.includes(cons) ? 'soft' : '';
        const vow = v ? plainVowel(c) : 'u';
        const end = tune.end[i] || '.', pos = tune.pos[i], inLast = tune.last[i];
        let lift = moodLift - Math.round(pos * 2); // drifting down through the sentence
        let slide;
        if (end === '?' && inLast) { lift += 3 + vowels; slide = 2; }
        else if (end === '!') lift += 2;
        else if (inLast && end === '.') { lift -= 1; slide = -2; }
        if (tune.caps[i]) lift += 2;
        blip(audio, p, {
          step: VOWEL_STEP[vow] ?? 0, lift, slide, attack, sib: !!cons && 'sz'.includes(cons), muffled: o.muffled,
          loud: end === '!' || tune.caps[i], soft: !v, long: inLast && (end === '?' || end === '.') && vow !== 'i', short: !v,
          chirp: p.chirp && n++ % 7 === 3, now: o.clock?.(),
        });
      }
    },
  };
}

/** One syllable with no text behind it (a random vowel). */
export function say(audio, voice, mood = 'calm', o = {}) {
  if (!audio?.ctx || audio.muted) return;
  const p = profileOf(voice || {}, o.who || '');
  const vow = 'aeiou'[Math.floor(Math.random() * 5)];
  blip(audio, p, { step: VOWEL_STEP[vow], lift: MOOD_STEP[mood] || 0, attack: ['hard', 'soft', '', 'hiss'][Math.floor(Math.random() * 4)], muffled: o.muffled });
}
