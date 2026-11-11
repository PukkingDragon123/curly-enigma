// The naming moment, in the game's own cutscene talk (src/ui/Convo.js): the camera eases onto the
// raptor, it chirps at you, you pick a name from a few (or ask for others), it chirps again.
// The raptor is a Speaker (src/fx/speakers.js) built here, so the talk frames its real body.
import * as THREE from 'three';

const NAMES = ['Nib', 'Pip', 'Sickle', 'Ember', 'Fern', 'Scree', 'Quill', 'Pebble', 'Dart', 'Moss', 'Flint', 'Ochre', 'Tinder', 'Bramble',
  'Skitter', 'Clink', 'Rusk', 'Tumble', 'Sprig', 'Chert', 'Wick', 'Nettle', 'Tansy', 'Cobble'];
const VOICE = { f: 1040, type: 'triangle', q: 2.4 };
const _t = new THREE.Vector3();

/** A Speaker for a raptor body (TameRaptor), so the talk can frame it, turn it to you and make it chirp. */
export function raptorSpeaker(e, name = '') {
  const sp = {
    key: 'raptor', name, cast: null, voice: VOICE, obj: e.root,
    rig: { get facing() { return e.yaw; }, get targetFacing() { return e.yaw; } },
    eyes(out = new THREE.Vector3()) { return e.headPos(out).add(_t.set(0, -0.05, 0)); },
    top(out = new THREE.Vector3()) { return e.headPos(out).add(_t.set(0, 0.06, 0)); },
    feet(out = new THREE.Vector3()) { return out.copy(e.pos); },
    get height() { return Math.max(0.35, sp.top(new THREE.Vector3()).y - e.pos.y); },
    turnTo(x, z) { e.faceAt = { x, z }; },
    lookAt(v) { if (v) e.lookAt.copy(v); },
    hold(on) { e.talkHold = !!on; },
    talk(on) { e.talking = !!on; if (on) e.jawOpen = Math.max(e.jawOpen || 0, 0.7); },
    face() {},
    gesture(kind) { if (kind === 'hop' || kind === 'nod' || kind === 'wave') e.hop?.(1.6); },
  };
  return sp;
}

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/**
 * Play the naming moment; resolves to the chosen name (the first one offered if the talk is left
 * with Esc, or when there's no talk UI). taken: names already used. The talk stays framed (keep):
 * the caller says the last line (welcome()).
 */
export async function nameRaptor(game, e, taken = []) {
  const pool = shuffle(NAMES.filter((n) => !taken.includes(n)));
  if (pool.length < 3) pool.push('Nib II', 'Pip II', 'Scree II');
  const cv = game?.convo;
  if (!cv?.play) return pool[0];
  const sp = raptorSpeaker(e, '');
  try {
    await cv.play({ who: sp, name: '', keep: true, lines: [{ text: '<i>It noses your paw, then tilts its head and waits.</i> <w>Chrrp?</w>', mood: 'happy', wait: true }] });
    for (let page = 0; page < 8; page++) {
      const opts = [0, 1, 2].map((k) => pool[(page * 3 + k) % pool.length]);
      const r = await cv.play({
        who: 'hero', keep: true,
        lines: [{ text: page ? 'Hmm. Not quite. What about…' : 'You can\'t keep calling it "the raptor". It needs a name.' }],
        choices: [...opts.map((n, i) => ({ label: n, value: n, primary: i === 0 })), { label: 'Other names…', value: '__more' }],
      });
      if (r?.skipped) return opts[0];
      if (r?.choice && r.choice !== '__more') {
        e.hop?.(2);
        return r.choice;
      }
    }
  } catch (err) { console.warn('[tame] naming', err); }
  return pool[0];
}

/** The last line: the raptor, by its new name. Resolves when the talk is over. */
export function welcome(game, e, name) {
  const cv = game?.convo;
  if (!cv?.play) return Promise.resolve();
  // (the naming lines kept the talk framed: this last one ends it)
  return cv.play({ who: raptorSpeaker(e, name), name, lines: [{ text: `<w>Chirrup!</w> <i>${name} bumps its snout against your paw. It's coming with you.</i>`, mood: 'happy', wait: true }] })
    .catch(() => {}).then(() => { try { if (!cv.cur) cv.end(); } catch (err) { /* already over */ } });
}
