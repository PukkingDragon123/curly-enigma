// Sample-based audio: every sound is a recorded file (src/audio, credits in CREDITS-AUDIO.md),
// decoded once after the first user gesture and played through the sfx / music buses. Nothing is
// synthesized: no oscillators, no generated noise. The old synth-style calls still work:
//   play(name, opts)    a named preset (src/core/sounds.js; opts vol, pitch, pan, delay, gap, ...)
//   sample(ids, o)      one recorded file (a random variant of a list): vol, pitch|rate, rate2+slide,
//                       delay|at, dur (cut with a fade), a (attack), offset, pan, reverb, bus,
//                       filter/ff/ff2/q, jit (random pitch, default ±3%)
//   tone(o) / noise(o)  the closest recording to the old oscillator / noise burst (pitched toward
//                       o.f, shaped by o.filter), so callers that still describe sounds that way
//                       get real ones; voices landing on the same instant are merged
//   loop(name, params)  a looping recording (handle: set({vol, ...}), stop(fade))
//   playMusic(name)     a looped music track (m_<name>), crossfaded; stopMusic(fade)
import { URLS, META, bytesOf } from '../audio/index.js';

const NOTE_A4 = 440;
export const midiToFreq = (m) => NOTE_A4 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const MAX_VOICES = 56;
// music tracks: m_<scene music name>, with a level each
const MUSIC_GAIN = { title: 0.8, town: 0.75, home: 0.8, mine: 0.85, forge: 0.7, cooking: 0.75, beach: 0.8, ascent: 0.8 };

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.presets = {};
    this.locked = new Set();
    this.loopDefs = {};
    this.tracks = {};
    this.lastPlay = {};
    this.minGap = {};
    this.vol = { master: 0.9, music: 0.55, sfx: 0.85 };
    this.muted = false;
    this.activeLoops = new Set();
    this.pendingLoops = new Set();
    this.music = { name: null };
    this.buffers = {};
    this.loading = {};
    this.lastPick = {};
    this.voices = 0;
    this.musicCache = [];
    this._vq = [];
    this._vqT = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => { for (const p of [...this.pendingLoops]) { this.pendingLoops.delete(p); p.start(); } }).catch(() => {});
      }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
    this.setup(ctx);
    const startPending = () => {
      for (const p of [...this.pendingLoops]) { this.pendingLoops.delete(p); p.start(); }
    };
    if (ctx.state === 'running') startPending();
    else ctx.resume().then(startPending).catch(() => {});
    this.preload();
    if (this.pendingMusic) {
      const { name, params } = this.pendingMusic;
      this.pendingMusic = null;
      this.playMusic(name, params);
    }
  }

  /** Build the mixer on a context (an OfflineAudioContext works too). */
  setup(ctx) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.makeReverb();
    this.applyVolumes();
  }

  /** A small cave echo from feedback delays (an effect on the recordings; it makes no sound itself). */
  makeReverb() {
    const ctx = this.ctx;
    this.reverb = ctx.createGain();
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.32;
    const pre = ctx.createBiquadFilter();
    pre.type = 'lowpass';
    pre.frequency.value = 3800;
    this.reverb.connect(pre);
    for (const [dt, fb] of [[0.0503, 0.74], [0.0631, 0.72], [0.0697, 0.7], [0.0743, 0.68], [0.0911, 0.62]]) {
      const d = ctx.createDelay(0.5);
      d.delayTime.value = dt;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.value = fb;
      pre.connect(d);
      d.connect(damp);
      damp.connect(g).connect(d);
      damp.connect(this.reverbOut);
    }
    this.reverbOut.connect(this.master);
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  setVolumes(v) {
    Object.assign(this.vol, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const m = this.muted ? 0 : this.vol.master;
    this.master.gain.setTargetAtTime(m, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- decoding
  /** Decode one file once; resolves to its entry { buf, s0, s1 } (null if it can't be decoded). */
  load(id) {
    if (this.buffers[id]) return Promise.resolve(this.buffers[id]);
    if (this.loading[id]) return this.loading[id];
    const url = URLS[id];
    if (!url || !this.ctx) return Promise.resolve(null);
    const ctx = this.ctx;
    const p = bytesOf(url)
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => {
        // skip the encoder's silent padding so loops and short hits start on the sound
        const d = buf.getChannelData(0);
        const n = d.length;
        let a = 0, b = n;
        const lim = Math.min(n, Math.round(buf.sampleRate * 0.12));
        while (a < lim && Math.abs(d[a]) < 2e-4) a++;
        while (b > n - lim && b > a + 1 && Math.abs(d[b - 1]) < 2e-4) b--;
        if (a >= lim) a = 0;
        const e = { buf, s0: a / buf.sampleRate, s1: b / buf.sampleRate };
        this.buffers[id] = e;
        delete this.loading[id];
        return e;
      })
      .catch((err) => { console.warn('audio decode', id, err?.message || err); delete this.loading[id]; return null; });
    this.loading[id] = p;
    return p;
  }

  /** Decode every sound effect (not the music) in the background, a few at a time. */
  preload() {
    if (this.preloading) return this.preloading;
    const ids = Object.keys(URLS).filter((k) => !k.startsWith('m_'));
    let i = 0;
    const worker = async () => { while (i < ids.length) await this.load(ids[i++]); };
    this.preloading = Promise.all([worker(), worker(), worker()]);
    return this.preloading;
  }

  pick(list) {
    if (typeof list === 'string') return list;
    if (list.length === 1) return list[0];
    const key = list.join('|');
    let i = (Math.random() * list.length) | 0;
    if (i === this.lastPick[key]) i = (i + 1 + ((Math.random() * (list.length - 1)) | 0)) % list.length;
    this.lastPick[key] = i;
    return list[i];
  }

  // ---------------------------------------------------------------- routing
  route(node, o) {
    const ctx = this.ctx;
    let out = node;
    if (o.pan) {
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) {
        p.pan.value = clamp(o.pan, -1, 1);
        out.connect(p);
        out = p;
      }
    }
    out.connect(o.bus === 'music' ? this.musicBus : (o.bus || this.sfxBus));
    if (o.reverb) {
      const s = ctx.createGain();
      s.gain.value = o.reverb;
      out.connect(s).connect(this.reverb);
    }
    return out;
  }

  /** Play one recording (a random variant of a list). Returns the source node or null. */
  sample(ids, o = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'closed') return null;
    const id = this.pick(ids);
    const e = this.buffers[id];
    if (!e) {
      if (!URLS[id]) return null;
      // not decoded yet: play it as soon as it is, if that's still within a beat
      const asked = ctx.currentTime;
      this.load(id).then((r) => { if (r && this.ctx && this.ctx.currentTime - asked < 0.25) this.sample(id, { ...o, at: undefined }); });
      return null;
    }
    const vol = o.vol ?? 1;
    if (vol < 0.002) return null;
    if (this.voices >= MAX_VOICES && vol < 0.5) return null;
    const t0 = Math.max(ctx.currentTime, (o.at ?? ctx.currentTime) + (o.delay || 0));
    const jit = o.jit ?? 0.03;
    const rate = clamp((o.rate ?? 1) * (o.pitch || 1) * (1 + (Math.random() * 2 - 1) * jit), 0.25, 4);
    const src = ctx.createBufferSource();
    src.buffer = e.buf;
    src.playbackRate.setValueAtTime(rate, t0);
    if (o.rate2) src.playbackRate.exponentialRampToValueAtTime(clamp(o.rate2 * rate / (o.rate ?? 1), 0.25, 4), t0 + Math.max(0.01, o.slide ?? o.dur ?? 0.1));
    let node = src;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.setValueAtTime(clamp(o.ff || 1000, 20, 20000), t0);
      if (o.ff2) f.frequency.exponentialRampToValueAtTime(clamp(o.ff2, 20, 20000), t0 + Math.max(0.02, o.dur || 0.2));
      f.Q.value = o.q ?? 0.7;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    const natural = (e.s1 - e.s0 - (o.offset || 0)) / rate;
    let end = t0 + natural;
    if (o.a > 0.004) {
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + o.a);
    } else g.gain.setValueAtTime(vol, t0);
    if (o.dur && t0 + o.dur + (o.release ?? 0.05) < end) {
      const rel = Math.max(0.015, o.release ?? 0.05);
      const hold = t0 + Math.max(o.a || 0, o.dur);
      g.gain.setValueAtTime(vol, hold);
      g.gain.exponentialRampToValueAtTime(0.0001, hold + rel);
      end = hold + rel;
    }
    node.connect(g);
    this.route(g, o);
    src.start(t0, e.s0 + (o.offset || 0));
    src.stop(end + 0.03);
    this.voices++;
    src.onended = () => { this.voices--; try { g.disconnect(); } catch (err) { /* gone */ } };
    return src;
  }

  // ------------------------------------------------- synth-style calls → recordings
  /** An old oscillator voice ({ f, f2, type, dur, vol, filter, ... }) → the closest recording. */
  tone(o) {
    if (!this.ctx) return;
    const v = toneVoice(o);
    if (v) this.queueVoice(v, o);
  }

  /** An old filtered noise burst ({ color, filter, f, f2, q, dur, vol, ... }) → the closest recording. */
  noise(o) {
    if (!this.ctx) return;
    const v = noiseVoice(o);
    if (v) this.queueVoice(v, o);
  }

  queueVoice(v, o) {
    v.o = o;
    v.t0 = (o.at ?? this.ctx.currentTime) + (o.delay || 0);
    this._vq.push(v);
    if (!this._vqT) {
      this._vqT = true;
      queueMicrotask(() => this.flushVoices());
    }
  }

  /** Callers layered several oscillators per sound: keep the loudest voice per kind, two kinds max. */
  flushVoices() {
    this._vqT = false;
    const q = this._vq;
    this._vq = [];
    const groups = new Map();
    for (const v of q) {
      const b = v.o.bus;
      const k = (b === undefined ? 's' : typeof b === 'string' ? b : 'n') + ':' + Math.round(v.t0 * 40);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(v);
    }
    for (const g of groups.values()) {
      const best = {};
      for (const v of g) if (!best[v.cat] || v.vol > best[v.cat].vol) best[v.cat] = v;
      const list = Object.values(best).sort((a, b) => b.vol - a.vol);
      for (let i = 0; i < Math.min(2, list.length); i++) {
        const v = list[i];
        if (i && v.vol < list[0].vol * 0.3) break;
        const o = v.o;
        this.sample(v.ids, {
          vol: v.vol, rate: v.rate, rate2: v.rate2, slide: o.slide ?? o.dur, dur: v.dur, release: v.release, a: v.a ?? o.a,
          at: v.t0, pan: o.pan, reverb: o.reverb, bus: o.bus, filter: v.filter, ff: v.ff, ff2: v.ff2, q: v.q, jit: v.jit ?? 0.02,
        });
      }
    }
  }

  define(name, fn, minGap = 0.02, lock = false) {
    if (this.locked.has(name)) return; // a recorded preset already owns this name
    this.presets[name] = fn;
    this.minGap[name] = minGap;
    if (lock) this.locked.add(name);
  }

  defineLoop(name, fn, lock = false) {
    if (this.locked.has('loop:' + name)) return;
    this.loopDefs[name] = fn;
    if (lock) this.locked.add('loop:' + name);
  }

  /** Play a named SFX preset. opts: {vol, pitch, pan, ...preset-specific} */
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const fn = this.presets[name];
    if (!fn) return;
    const now = this.ctx.currentTime;
    const gap = opts.gap ?? this.minGap[name];
    if (this.lastPlay[name] && now - this.lastPlay[name] < gap) return;
    this.lastPlay[name] = now;
    try { fn(this, opts); } catch (e) { console.warn('sfx', name, e); }
  }

  // ---------------------------------------------------------------- loops
  /**
   * Start a continuous sound. Returns a handle: { set({vol, pitch, ...}), stop(fade) }.
   * Safe to call before init (returns a handle that starts once audio is unlocked).
   */
  loop(name, params = {}) {
    const dummy = { set() {}, stop() {}, alive: false };
    const def = this.loopDefs[name];
    if (!def) return dummy;
    if (!this.ctx || this.ctx.state !== 'running') {
      const pend = { alive: true, real: null, params: { ...params } };
      pend.set = (p) => { Object.assign(pend.params, p); if (pend.real) pend.real.set(p); };
      pend.stop = (fade) => { pend.alive = false; if (pend.real) pend.real.stop(fade); this.pendingLoops.delete(pend); };
      pend.start = () => { if (pend.alive && !pend.real) pend.real = this.loop(name, pend.params); };
      this.pendingLoops.add(pend);
      return pend;
    }
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    const vol = params.vol ?? 1;
    out.gain.setTargetAtTime(vol, ctx.currentTime, params.fadeIn ?? 0.08);
    this.route(out, params);
    const inst = def(this, out, params) || {};
    const handle = {
      alive: true,
      set: (p) => {
        if (!handle.alive) return;
        if (p.vol !== undefined) out.gain.setTargetAtTime(Math.max(0.0001, p.vol), ctx.currentTime, 0.06);
        if (inst.set) inst.set(p);
      },
      stop: (fade = 0.15) => {
        if (!handle.alive) return;
        handle.alive = false;
        out.gain.setTargetAtTime(0.0001, ctx.currentTime, fade / 3);
        setTimeout(() => {
          if (inst.stop) inst.stop();
          try { out.disconnect(); } catch (e) { /* noop */ }
        }, fade * 1000 + 200);
        this.activeLoops.delete(handle);
      },
    };
    this.activeLoops.add(handle);
    return handle;
  }

  stopAllLoops() {
    for (const h of [...this.activeLoops]) h.stop(0.1);
    for (const p of [...this.pendingLoops]) p.stop();
  }

  /**
   * A looping recording into dest: { src (null until decoded), filter, gain, rate (AudioParam-like),
   * stop() }. o: rate, filter ('lowpass'…), ff, q, vol, offset ('random' default).
   */
  bed(dest, id, o = {}) {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter || 'lowpass';
    filter.frequency.value = o.ff ?? 20000;
    filter.Q.value = o.q ?? 0.7;
    const gain = ctx.createGain();
    gain.gain.value = o.vol ?? 1;
    filter.connect(gain).connect(dest);
    const h = { src: null, filter, gain, alive: true, rateValue: o.rate ?? 1 };
    const start = (e) => {
      if (!e || !h.alive || !this.ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = e.buf;
      src.loop = true;
      src.loopStart = e.s0;
      src.loopEnd = e.s1;
      src.playbackRate.value = h.rateValue;
      src.connect(filter);
      const len = e.s1 - e.s0;
      src.start(ctx.currentTime, e.s0 + (o.offset ?? Math.random()) * len * 0.999);
      h.src = src;
    };
    const ready = this.buffers[id];
    if (ready) start(ready); else this.load(id).then(start);
    h.setRate = (r, tc = 0.05) => {
      h.rateValue = clamp(r, 0.25, 4);
      if (h.src) h.src.playbackRate.setTargetAtTime(h.rateValue, ctx.currentTime, tc);
    };
    h.stop = () => {
      h.alive = false;
      if (h.src) try { h.src.stop(); } catch (e) { /* noop */ }
      setTimeout(() => { try { gain.disconnect(); } catch (e) { /* noop */ } }, 50);
    };
    return h;
  }

  /** Old helper for loops ("filtered noise into dest"): now a looping recording of air, water or hiss. */
  noiseSource(dest, color = 'white', filterType = 'lowpass', freq = 800, q = 0.7) {
    let id = 'lp_wind', rate = 1;
    if (color === 'brown' || (filterType === 'lowpass' && freq < 400)) rate = 0.55;
    else if (filterType === 'highpass' && freq > 2500) id = 'lp_sizzle';
    else if (filterType === 'bandpass' && freq > 2000) rate = 1.3;
    const h = this.bed(dest, id, { rate, filter: filterType, ff: freq, q: Math.min(q, 1.2) });
    return { src: h.src, filter: h.filter, gain: h.gain, stop: h.stop };
  }

  /** Old helper ("an oscillator into dest"): now a looping recorded hum, pitched toward freq. */
  oscSource(dest, type, freq, vol = 0.1) {
    const base = 110;
    const h = this.bed(dest, 'lp_hum', { rate: clamp(freq / base, 0.4, 3), vol: vol * 3 });
    const param = (k) => (f, t, c) => h.setRate(f / base, k === 'target' ? c : 0.03);
    const frequency = {
      get value() { return h.rateValue * base; },
      set value(f) { h.setRate(f / base, 0.01); },
      setValueAtTime: param('set'), setTargetAtTime: param('target'),
      linearRampToValueAtTime: param('ramp'), exponentialRampToValueAtTime: param('ramp'), cancelScheduledValues() {},
    };
    return { osc: { frequency, detune: { value: 0 }, connect() {}, start() {}, stop: h.stop }, gain: h.gain, stop: h.stop };
  }

  // ---------------------------------------------------------------- music
  /** Kept for old callers: music is recorded now, sequenced tracks are ignored. */
  defineTrack(name, track) {
    this.tracks[name] = track;
  }

  playMusic(name, params = {}) {
    if (!this.ctx) {
      this.pendingMusic = { name, params };
      return;
    }
    if (this.music.name === name) {
      Object.assign(this.music.params, params);
      this.applyMusicParams();
      return;
    }
    this.stopMusic(1.2);
    const id = 'm_' + name;
    if (!URLS[id]) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.connect(gain).connect(this.musicBus);
    const m = (this.music = { name, id, params: { ...params }, gain, filter, src: null });
    this.applyMusicParams();
    this.load(id).then((e) => {
      if (!e || this.music !== m) return;
      const src = ctx.createBufferSource();
      src.buffer = e.buf;
      src.loop = true;
      src.loopStart = e.s0;
      src.loopEnd = e.s1;
      src.connect(filter);
      src.start(ctx.currentTime + 0.05, e.s0);
      m.src = src;
      gain.gain.setTargetAtTime(MUSIC_GAIN[name] ?? 0.8, ctx.currentTime + 0.05, 0.5);
      // keep the current and the previous track decoded, drop older ones
      this.musicCache = this.musicCache.filter((k) => k !== id);
      this.musicCache.push(id);
      while (this.musicCache.length > 2) delete this.buffers[this.musicCache.shift()];
    });
  }

  /** params.depth (0..1, the mine) darkens the track. */
  applyMusicParams() {
    const m = this.music;
    if (!m || !m.filter || !this.ctx) return;
    const depth = clamp(m.params.depth || 0, 0, 1);
    m.filter.frequency.setTargetAtTime(18000 * Math.pow(0.12, depth), this.ctx.currentTime, 0.8);
  }

  stopMusic(fade = 1) {
    const m = this.music;
    if (!m || !m.name || !this.ctx) {
      this.music = { name: null };
      if (!this.ctx) this.pendingMusic = null;
      return;
    }
    const g = m.gain;
    g.gain.cancelScheduledValues(this.ctx.currentTime);
    g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, Math.max(0.05, fade / 3));
    setTimeout(() => {
      try { m.src?.stop(); } catch (e) { /* noop */ }
      try { g.disconnect(); } catch (e) { /* noop */ }
    }, fade * 1000 + 600);
    this.music = { name: null };
  }
}

// ---------------------------------------------------------------- tone()/noise() → recordings
// Each returns { cat, ids, vol, rate, rate2?, dur?, filter? } for flushVoices, or null.
const NOTE_F0 = (id) => META[id]?.f0 || 440;

function toneVoice(o) {
  const f = Math.max(20, o.f || 440);
  const type = o.type || 'square';
  const dur = o.dur ?? 0.1;
  const vol = o.vol ?? 0.2;
  const bright = type === 'square' || type === 'sawtooth';
  const slide = o.f2 ? clamp(o.f2 / f, 0.25, 4) : 0;
  const v = { vol, dur: dur + (o.release ?? 0.04), release: 0.06 };
  if (f < 140) {
    // a low sine "thump": a soft body hit
    return { ...v, cat: 'thump', ids: dur > 0.5 ? ['rumble_hit1', 'rumble_hit2'] : ['thud1', 'thud2', 'land1'], vol: vol * 2.6, rate: clamp(f / 85, 0.7, 1.3), dur: undefined };
  }
  if ((type === 'sawtooth' || (bright && o.vib)) && dur >= 0.12) {
    if (f < 450) return { ...v, cat: 'creak', ids: ['creak1', 'creak2', 'creak3', 'chest'], vol: vol * 6, rate: clamp(f / 140, 0.6, 1.5) };
    return { ...v, cat: 'squeal', ids: ['cute1', 'cute2', 'squeak3'], vol: vol * 5, rate: clamp(f / 900, 0.6, 1.8) };
  }
  if (bright && f >= 1700 && dur <= 0.06) {
    return { ...v, cat: 'clink', ids: ['chisel2', 'chisel3', 'debris1', 'debris2'], vol: vol * 9, rate: clamp(f / 3000, 0.6, 1.6), dur: undefined };
  }
  if (o.filter === 'bandpass' && (bright || type === 'triangle') && dur <= 0.1 && f < 1300) {
    // a voice blip (talking boards, shopkeepers): a recorded syllable at the voice's pitch
    return { ...v, cat: 'voice', ids: ['syl2', 'syl3', 'syl5', 'syl6', 'syl1', 'syl4'], vol: vol * 9, rate: clamp(f / 330, 0.5, 2.2), dur: dur + 0.05, release: 0.04 };
  }
  if (type === 'triangle' && f < 420 && dur <= 0.14) {
    const r = f / NOTE_F0('n_wood');
    return { ...v, cat: 'knock', ids: ['n_wood'], vol: vol * 3.5, rate: clamp(r, 0.6, 2.5), rate2: slide ? clamp(r * slide, 0.5, 3) : undefined };
  }
  let id;
  if (!bright && dur >= 0.2) id = f > 1500 ? 'n_glass' : 'n_bell2';
  else if (f > 1500) id = f > 2600 ? 'n_ping' : 'n_glass';
  else id = 'n_pluck';
  let r = f / NOTE_F0(id);
  while (r > 4) r /= 2;
  while (r < 0.3) r *= 2;
  const k = id === 'n_pluck' ? (bright ? 5 : 6.5) : id === 'n_bell2' ? 5 : 4;
  return { ...v, cat: 'note', ids: [id], vol: vol * k, rate: r, rate2: slide ? clamp(r * slide, 0.25, 4) : undefined, jit: 0 };
}

function noiseVoice(o) {
  const color = o.color || 'white';
  const filter = o.filter || 'bandpass';
  const f = o.f || 1000;
  const dur = o.dur ?? 0.1;
  const vol = o.vol ?? 0.2;
  const q = o.q ?? 1;
  const low = color === 'brown' || (filter === 'lowpass' && f <= 1000);
  const shape = (ids, cat, k, centre, extra = {}) => ({
    cat, ids, vol: vol * k, dur: dur + 0.04, release: Math.min(0.12, dur * 0.5 + 0.02),
    rate: centre ? clamp(Math.sqrt(f / centre), 0.6, 1.6) : 1, ...extra,
  });
  if (low) {
    if (dur >= 0.5) return shape(dur > 1.2 ? ['collapse', 'rumble_hit1'] : ['rumble_hit1', 'rumble_hit2'], 'rumble', 1.6, 0, { filter: 'lowpass', ff: Math.max(150, f * 1.5) });
    if (f < 450) return shape(['thud1', 'thud2', 'land1'], 'thud', 2.2, 0, { filter: 'lowpass', ff: Math.max(200, f * 2) });
    return shape(['hit_dirt1', 'hit_dirt2', 'step_dirt1', 'step_dirt3'], 'dirt', 2.4, 600);
  }
  if (filter === 'highpass' && f >= 2400) {
    if (dur >= 0.2) return shape(dur > 0.8 ? ['steam1', 'steam2'] : ['hiss1', 'hiss2', 'sizzle1'], 'hiss', 2.2, 0, { filter: 'highpass', ff: f * 0.6 });
    return shape(['debris1', 'debris2', 'debris3'], 'tick', 3.5, 0, { rate: clamp(f / 5000, 0.8, 1.5) });
  }
  if (dur <= 0.045) {
    if (f >= 2000) return shape(['debris1', 'debris2', 'debris3', 'chisel2'], 'tick', 3.5, 0, { rate: clamp(f / 3500, 0.7, 1.5) });
    return shape(['knock', 'tick2', 'debris3'], 'tick', 3, 0, { rate: clamp(f / 1500, 0.7, 1.4) });
  }
  if (dur <= 0.35) {
    if (o.f2 && Math.abs(Math.log(o.f2 / f)) > 0.4) return shape(['whoosh1', 'whoosh2', 'whoosh3'], 'whoosh', 3, 0, { rate: clamp((f + o.f2) / 2 / 1200, 0.7, 1.4) });
    if (q >= 1.8 || f >= 2200) return shape(['brush1', 'brush2', 'brush3', 'page1'], 'rustle', 2.6, 3000);
    return shape(['rustle1', 'rustle2', 'rustle3', 'climb1', 'climb2'], 'rustle', 2.6, 1400);
  }
  if (f >= 2500 || color === 'white') return shape(['steam1', 'steam2', 'hiss1'], 'hiss', 2, 0, { filter: 'highpass', ff: Math.min(f * 0.5, 3000) });
  return shape(['whoosh_big', 'bellows2', 'rustle1'], 'air', 2.2, 0, { a: Math.max(o.a || 0, 0.05), dur: dur + 0.05 });
}
