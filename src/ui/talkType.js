// Words that type themselves out in the speaker's voice (the talk boards, the shop counters; the
// dialogue box has its own copy of the loop with its timers). Keeps <b>, <i>, .gold-txt and any
// other markup: only the text nodes are revealed, letter by letter, with a breath at the end of a
// sentence or a clause. A live portrait handle (portrait3d) moves its mouth while the words come.
//   const t = typeText(el, html, { voice, mood, audio, face, speed, onDone })
//   t.finish()   show everything now      t.done   true once it's all there      t.stop()
//   voiceBlip(audio, voice, mood, { muffled })  one syllable in a voice ({ f, type, q, vib, cluck, mumble })
export const MOOD_PITCH = { calm: 1, neutral: 1, happy: 1.1, laugh: 1.22, worried: 1.16, stern: 0.86, proud: 1.04, sad: 0.9, angry: 0.92, surprised: 1.28, smug: 0.96, thinking: 0.94, sleepy: 0.8 };
export const STAR_VOICE = { f: 205, type: 'square', q: 1.6, mumble: true };

export function voiceBlip(a, v = STAR_VOICE, mood = 'calm', o = {}) {
  if (!a?.tone || !a.ctx) return;
  const base = (v.f || 205) * (MOOD_PITCH[mood] || 1);
  const f = base * (0.82 + Math.random() * 0.4);
  if (o.muffled) { a.tone({ f: f * 0.6, f2: f * 0.5, type: 'triangle', dur: 0.09, vol: 0.03, filter: 'lowpass', ff: 380, q: 0.8, reverb: 0.5 }); return; }
  if (v.cluck) { a.tone({ f: f * 1.3, f2: f * 0.7, type: 'triangle', dur: 0.055, vol: 0.035, filter: 'bandpass', ff: base * 2, q: v.q || 2 }); return; }
  a.tone({ f, f2: f * (0.85 + Math.random() * 0.3), type: v.type || 'square', dur: v.mumble ? 0.05 : 0.045, vol: o.vol ?? 0.026, filter: 'bandpass', ff: base * 3, q: v.q || 1.6, ...(v.vib ? { vib: v.vib, vibRate: 14 } : {}) });
  if (mood === 'worried') a.tone({ f: f * 1.02, type: 'sine', dur: 0.06, vol: 0.01, vib: 14, vibRate: 18 });
}

/** Pause after a letter (end of a sentence, a clause, a dash). */
export function breathAfter(ch, nx) {
  if ('.!?'.includes(ch) && nx !== '.' && nx !== '!' && nx !== '?' && nx !== '"') return 0.24;
  if (',;:'.includes(ch)) return 0.11;
  if (ch === '—' || ch === '…') return 0.16;
  return 0;
}

export function typeText(host, html, o = {}) {
  host.innerHTML = html;
  const nodes = [];
  const walk = (n) => {
    for (const ch of [...n.childNodes]) {
      if (ch.nodeType === 3) {
        const full = ch.textContent;
        if (!full) continue;
        const shown = document.createTextNode('');
        const ghost = document.createElement('span');
        ghost.className = 'tt-ghost';
        ghost.textContent = full;
        ch.replaceWith(shown, ghost);
        nodes.push({ shown, ghost, full });
      } else if (ch.nodeType === 1) walk(ch);
    }
  };
  walk(host);
  const flat = nodes.map((n) => n.full).join('');
  const total = flat.length;
  const speed = o.speed || 46;
  const face = o.face || null;
  let n = 0, pause = 0, delay = o.delay ?? 0.1, blip = 0, raf = 0, last = performance.now(), talking = false;
  const ctl = { done: total === 0, stop, finish };
  const show = (k) => {
    let left = k;
    for (const nd of nodes) {
      const take = Math.max(0, Math.min(nd.full.length, left));
      nd.shown.textContent = nd.full.slice(0, take);
      nd.ghost.textContent = nd.full.slice(take);
      left -= nd.full.length;
    }
  };
  function finish() {
    if (ctl.done && !raf) return;
    show(total);
    ctl.done = true;
    if (talking) face?.talk(false);
    talking = false;
    stop();
    o.onDone?.();
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  const step = (now) => {
    raf = 0;
    if (!host.isConnected && performance.now() - last > 2000) { stop(); return; }
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (delay > 0) delay -= dt;
    else if (pause > 0) { pause -= dt; if (pause <= 0) { face?.talk(true); talking = true; } }
    else {
      const before = Math.floor(n);
      n = Math.min(total, n + dt * speed);
      let k = Math.floor(n);
      if (k !== before) {
        for (let i = before; i < k; i++) {
          const p = breathAfter(flat[i], flat[i + 1]);
          if (p && i + 1 < total) { k = i + 1; n = k; pause = p; face?.talk(false); talking = false; break; }
        }
        show(k);
        if (!talking && pause <= 0) { face?.talk(true); talking = true; }
        blip -= k - before;
        if (blip <= 0 && o.audio && flat[k - 1] !== ' ' && o.sound !== false) { blip = o.voice?.cluck ? 4 : 3; voiceBlip(o.audio, o.voice, o.mood); }
      }
      if (n >= total) { finish(); return; }
    }
    raf = requestAnimationFrame(step);
  };
  if (total) { show(0); raf = requestAnimationFrame(step); } else o.onDone?.();
  return ctl;
}
