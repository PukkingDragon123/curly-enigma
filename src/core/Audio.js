// Fully procedural audio: synthesized SFX presets, looping ambiences and a
// small step-sequencer for music. Nothing is loaded from disk.

const NOTE_A4 = 440;
export const midiToFreq = (m) => NOTE_A4 * Math.pow(2, (m - 69) / 12);

function makeNoiseBuffer(ctx, kind, seconds = 2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

function makeImpulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.presets = {};
    this.loopDefs = {};
    this.tracks = {};
    this.lastPlay = {};
    this.minGap = {};
    this.vol = { master: 0.9, music: 0.55, sfx: 0.85 };
    this.muted = false;
    this.activeLoops = new Set();
    this.pendingLoops = new Set();
    this.music = { name: null, gain: null, timer: null, step: 0, nextTime: 0, track: null, params: {} };
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
    const ctx = (this.ctx = new AC());
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
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 2.4, 2.6);
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.5;
    this.reverb.connect(this.reverbOut).connect(this.master);
    this.noiseBuf = {
      white: makeNoiseBuffer(ctx, 'white'),
      pink: makeNoiseBuffer(ctx, 'pink'),
      brown: makeNoiseBuffer(ctx, 'brown'),
    };
    this.applyVolumes();
    const startPending = () => {
      for (const p of [...this.pendingLoops]) { this.pendingLoops.delete(p); p.start(); }
    };
    if (ctx.state === 'running') startPending();
    else ctx.resume().then(startPending).catch(() => {});
    if (this.pendingMusic) {
      const { name, params } = this.pendingMusic;
      this.pendingMusic = null;
      this.playMusic(name, params);
    }
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

  // ---- routing ----
  route(node, o, t0) {
    const ctx = this.ctx;
    let out = node;
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      out.connect(p);
      out = p;
    }
    out.connect(o.bus === 'music' ? this.musicBus : (o.bus || this.sfxBus));
    if (o.reverb) {
      const s = ctx.createGain();
      s.gain.value = o.reverb;
      out.connect(s).connect(this.reverb);
    }
    return out;
  }

  /** Oscillator voice. f, f2 (slide target), type, dur, vol, a (attack), release, filter, ff, ff2, q, vib, vibRate, delay, pan, reverb, bus */
  tone(o) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = (o.at ?? ctx.currentTime) + (o.delay || 0);
    const dur = o.dur ?? 0.1;
    const a = o.a ?? 0.004;
    const rel = o.release ?? 0.04;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(Math.max(1, o.f), t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + (o.slide ?? dur));
    if (o.detune) osc.detune.value = o.detune;
    let node = osc;
    if (o.vib) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = o.vibRate || 5.5;
      lg.gain.value = o.vib;
      l.connect(lg).connect(osc.frequency);
      l.start(t0);
      l.stop(t0 + dur + rel + 0.1);
    }
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.setValueAtTime(o.ff || 1000, t0);
      if (o.ff2) f.frequency.exponentialRampToValueAtTime(Math.max(10, o.ff2), t0 + dur);
      f.Q.value = o.q ?? 0.8;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    const peak = (o.vol ?? 0.2);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    if (o.sustain) {
      g.gain.setValueAtTime(peak, t0 + Math.max(a, dur - rel));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(a + 0.005, dur) + rel);
    }
    node.connect(g);
    this.route(g, o, t0);
    osc.start(t0);
    osc.stop(t0 + dur + rel + 0.05);
    return osc;
  }

  /** Filtered noise burst. color, dur, vol, a, filter, f, f2, q, delay, pan, reverb */
  noise(o) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t0 = (o.at ?? ctx.currentTime) + (o.delay || 0);
    const dur = o.dur ?? 0.1;
    const a = o.a ?? 0.002;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf[o.color || 'white'];
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    let node = src;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t0 + dur);
    f.Q.value = o.q ?? 1;
    node.connect(f);
    node = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.vol ?? 0.2, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(dur, a + 0.01));
    node.connect(g);
    this.route(g, o, t0);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
    return src;
  }

  define(name, fn, minGap = 0.02) {
    this.presets[name] = fn;
    this.minGap[name] = minGap;
  }

  defineLoop(name, fn) {
    this.loopDefs[name] = fn;
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

  /**
   * Start a continuous sound. Returns a handle: { set({vol, pitch, ...}), stop(fade) }.
   * Safe to call before init (returns a dummy handle).
   */
  loop(name, params = {}) {
    const dummy = { set() {}, stop() {}, alive: false };
    const def = this.loopDefs[name];
    if (!def) return dummy;
    if (!this.ctx || this.ctx.state !== 'running') {
      // queue until the first user gesture unlocks audio, then hand over to a real loop
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

  /** Helper for loops: a looping noise source through a filter into dest. */
  noiseSource(dest, color = 'white', filterType = 'lowpass', freq = 800, q = 0.7) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf[color];
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(dest);
    src.start(0, Math.random());
    return { src, filter: f, gain: g, stop: () => { try { src.stop(); } catch (e) { /* noop */ } } };
  }

  oscSource(dest, type, freq, vol = 0.1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    o.connect(g).connect(dest);
    o.start();
    return { osc: o, gain: g, stop: () => { try { o.stop(); } catch (e) { /* noop */ } } };
  }

  // ---------------- music ----------------
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
      return;
    }
    this.stopMusic(1.2);
    const track = this.tracks[name];
    if (!track) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(track.gain ?? 0.8, ctx.currentTime + 0.1, 0.6);
    g.connect(this.musicBus);
    const m = (this.music = {
      name, track, gain: g, step: 0, params: { ...params },
      nextTime: ctx.currentTime + 0.15,
      timer: null,
    });
    const stepDur = () => 60 / (track.bpm || 100) / 4;
    const scheduler = () => {
      if (this.music !== m) return;
      while (m.nextTime < ctx.currentTime + 0.25) {
        try { track.tick(this.musicApi(m), m.step, m.nextTime); } catch (e) { console.warn('music', e); }
        m.step++;
        m.nextTime += stepDur() * (track.swing && m.step % 2 === 1 ? 1 + track.swing : track.swing && m.step % 2 === 0 ? 1 - track.swing : 1);
      }
    };
    m.timer = setInterval(scheduler, 40);
    scheduler();
  }

  stopMusic(fade = 1) {
    const m = this.music;
    if (!m || !m.name || !this.ctx) {
      this.music = { name: null };
      return;
    }
    clearInterval(m.timer);
    const g = m.gain;
    g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, fade / 3);
    setTimeout(() => { try { g.disconnect(); } catch (e) { /* noop */ } }, fade * 1000 + 600);
    this.music = { name: null };
  }

  musicApi(m) {
    const self = this;
    return {
      params: m.params,
      bus: m.gain,
      note(inst, midi, time, dur, vol = 1, extra = {}) {
        const fn = INSTRUMENTS[inst];
        if (fn) fn(self, m.gain, midiToFreq(midi), time, dur, vol, extra);
      },
      drum(kind, time, vol = 1) {
        const fn = DRUMS[kind];
        if (fn) fn(self, m.gain, time, vol);
      },
      stepDur: 60 / (m.track.bpm || 100) / 4,
    };
  }
}

// ---------------- instruments (music) ----------------
const INSTRUMENTS = {
  pluck(a, bus, f, t, dur, vol, x) {
    a.tone({ at: t, f, type: 'triangle', dur: Math.min(dur, 0.6), vol: 0.16 * vol, a: 0.003, release: 0.25, filter: 'lowpass', ff: 2600, ff2: 900, bus, reverb: x.reverb ?? 0.25 });
    a.tone({ at: t, f: f * 2, type: 'sine', dur: 0.15, vol: 0.04 * vol, a: 0.002, release: 0.1, bus });
  },
  uke(a, bus, f, t, dur, vol) {
    a.tone({ at: t, f, type: 'triangle', dur: 0.35, vol: 0.12 * vol, a: 0.002, release: 0.3, filter: 'lowpass', ff: 3200, ff2: 1200, bus, reverb: 0.2 });
    a.tone({ at: t, f: f * 1.003, type: 'square', dur: 0.12, vol: 0.025 * vol, a: 0.002, release: 0.08, filter: 'lowpass', ff: 1800, bus });
  },
  bass(a, bus, f, t, dur, vol) {
    a.tone({ at: t, f, type: 'triangle', dur: Math.max(0.08, dur * 0.9), vol: 0.22 * vol, a: 0.006, release: 0.08, sustain: true, bus });
    a.tone({ at: t, f: f * 2, type: 'sine', dur: Math.max(0.05, dur * 0.4), vol: 0.04 * vol, a: 0.004, release: 0.05, bus });
  },
  lead(a, bus, f, t, dur, vol, x) {
    a.tone({ at: t, f, type: 'square', dur, vol: 0.06 * vol, a: 0.01, release: 0.12, sustain: true, filter: 'lowpass', ff: 2200, q: 0.5, vib: f * 0.012, vibRate: 5, bus, reverb: x.reverb ?? 0.3 });
  },
  accordion(a, bus, f, t, dur, vol) {
    a.tone({ at: t, f, type: 'square', dur, vol: 0.045 * vol, a: 0.03, release: 0.1, sustain: true, filter: 'lowpass', ff: 1800, vib: f * 0.008, vibRate: 6, bus, reverb: 0.2 });
    a.tone({ at: t, f: f * 1.006, type: 'sawtooth', dur, vol: 0.025 * vol, a: 0.03, release: 0.1, sustain: true, filter: 'lowpass', ff: 1400, bus });
  },
  bell(a, bus, f, t, dur, vol, x) {
    a.tone({ at: t, f, type: 'sine', dur: 1.2, vol: 0.12 * vol, a: 0.002, release: 0.6, bus, reverb: x.reverb ?? 0.45 });
    a.tone({ at: t, f: f * 2.76, type: 'sine', dur: 0.4, vol: 0.03 * vol, a: 0.002, release: 0.2, bus, reverb: 0.3 });
  },
  marimba(a, bus, f, t, dur, vol) {
    a.tone({ at: t, f, type: 'sine', dur: 0.25, vol: 0.18 * vol, a: 0.002, release: 0.12, bus, reverb: 0.15 });
    a.tone({ at: t, f: f * 4, type: 'sine', dur: 0.05, vol: 0.05 * vol, a: 0.001, release: 0.04, bus });
  },
  pad(a, bus, f, t, dur, vol, x) {
    for (const d of [-7, 7]) {
      a.tone({ at: t, f, detune: d, type: 'sawtooth', dur, vol: 0.022 * vol, a: x.attack ?? 0.5, release: 0.8, sustain: true, filter: 'lowpass', ff: x.cutoff ?? 900, q: 0.4, bus, reverb: 0.5 });
    }
  },
  organ(a, bus, f, t, dur, vol) {
    a.tone({ at: t, f, type: 'sine', dur, vol: 0.07 * vol, a: 0.05, release: 0.3, sustain: true, bus, reverb: 0.4 });
    a.tone({ at: t, f: f * 2, type: 'sine', dur, vol: 0.03 * vol, a: 0.05, release: 0.3, sustain: true, bus });
  },
  drone(a, bus, f, t, dur, vol, x) {
    a.tone({ at: t, f, type: 'sawtooth', dur, vol: 0.05 * vol, a: 1.5, release: 1.5, sustain: true, filter: 'lowpass', ff: x.cutoff ?? 300, q: 1.5, bus, reverb: 0.6 });
    a.tone({ at: t, f: f * 1.5, detune: 4, type: 'triangle', dur, vol: 0.03 * vol, a: 2, release: 1.5, sustain: true, bus, reverb: 0.6 });
  },
  anvil(a, bus, f, t, dur, vol) {
    a.tone({ at: t, f, type: 'square', dur: 0.3, vol: 0.05 * vol, a: 0.001, release: 0.25, filter: 'bandpass', ff: f * 2, q: 6, bus, reverb: 0.3 });
    a.tone({ at: t, f: f * 2.43, type: 'sine', dur: 0.4, vol: 0.05 * vol, a: 0.001, release: 0.3, bus, reverb: 0.3 });
  },
};

const DRUMS = {
  kick(a, bus, t, v) { a.tone({ at: t, f: 140, f2: 42, slide: 0.12, type: 'sine', dur: 0.18, vol: 0.38 * v, a: 0.002, release: 0.05, bus }); },
  snare(a, bus, t, v) { a.noise({ at: t, color: 'white', filter: 'bandpass', f: 1800, q: 0.8, dur: 0.14, vol: 0.12 * v, bus }); a.tone({ at: t, f: 220, f2: 140, type: 'triangle', dur: 0.08, vol: 0.06 * v, bus }); },
  hat(a, bus, t, v) { a.noise({ at: t, color: 'white', filter: 'highpass', f: 7000, dur: 0.04, vol: 0.05 * v, bus }); },
  shaker(a, bus, t, v) { a.noise({ at: t, color: 'white', filter: 'bandpass', f: 6000, q: 1.5, dur: 0.06, a: 0.02, vol: 0.04 * v, bus }); },
  tick(a, bus, t, v) { a.tone({ at: t, f: 1800, type: 'sine', dur: 0.02, vol: 0.05 * v, bus }); },
  clap(a, bus, t, v) { for (let i = 0; i < 3; i++) a.noise({ at: t + i * 0.012, color: 'white', filter: 'bandpass', f: 1400, q: 1.2, dur: 0.05, vol: 0.06 * v, bus }); },
  drip(a, bus, t, v) { const f = 1200 + Math.random() * 1400; a.tone({ at: t, f, f2: f * 1.8, slide: 0.05, type: 'sine', dur: 0.07, vol: 0.05 * v, bus, reverb: 0.8 }); },
  wood(a, bus, t, v) { a.tone({ at: t, f: 700, type: 'sine', dur: 0.05, vol: 0.12 * v, a: 0.001, bus, reverb: 0.15 }); },
};
