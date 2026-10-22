// Facial expressions for every CharacterRig: which eye lids, mouth shapes, brow lift/tilt and
// face extras (blush, tears, sweat, an anger mark) each expression uses, how it talks, and the
// body gesture it adds while the character stands (or sits) about. Used by rig.js.
//
//   brow: [lift, tilt] for both brows, or [liftL, tiltL, liftR, tiltR] (L = the -x brow);
//         lift in hi-res voxels, tilt in radians (+ = inner ends down, cross; - = inner ends up)
//   eye:  an eye variant (face.js eyeSet), null = the character's own resting eyes
//   mouth: a resting mouth (on the face), null = the character's own (rig.restMouth)
//   open: an open mouth shown instead (laughing, gasping)
//   talk: the open mouths the expression talks with (a closed frame is mixed in)

export const EXPR = {
  neutral: { eye: null, mouth: null, talk: ['talk', 'oh', 'talk', 'ohS'], brow: [0, 0] },
  happy: { eye: 'smile', mouth: 'smile', talk: ['talkS', 'grinO', 'talkS', 'talk'], closed: 'grin', brow: [0.8, -0.18], blush: 1, ears: -0.1 },
  laugh: { eye: 'happy', open: 'laugh', talk: ['laugh', 'grinO'], brow: [1.3, -0.26], blush: 1, ears: -0.15 },
  sad: { eye: 'sad', mouth: 'wobble', talk: ['wail', 'talk', 'ohS'], brow: [0.9, -0.52], tears: 1, ears: 0.55, whisk: -0.18 },
  angry: { eye: 'angry', mouth: 'frown', talk: ['snarl', 'grimace', 'talk'], brow: [-1.4, 0.62], vein: 1, ears: 0.4 },
  surprised: { eye: 'wide', open: 'oh', talk: ['oh', 'ohS', 'talk'], brow: [2.4, -0.12], ears: -0.3, noBlink: 1.4 },
  worried: { eye: 'sad', mouth: 'wobble', talk: ['talk', 'ohS', 'wail'], brow: [1.5, -0.62], sweat: 1, ears: 0.3, whisk: -0.1 },
  smug: { eye: 'smug', mouth: 'smirk', talk: ['talkS', 'talk'], closed: 'smirk', brow: [1.7, -0.26, -0.4, 0.22] },
  sleepy: { eye: 'drowsy', mouth: 'line', talk: ['ohS', 'talk'], brow: [-0.3, -0.12], slow: true, ears: 0.25, whisk: -0.08 },
  thinking: { eye: 'up', mouth: 'hmm', talk: ['talk', 'ohS'], brow: [1.5, -0.2, -0.5, 0.3] },
  stern: { eye: 'squint', mouth: 'line', talk: ['talk', 'grimace'], brow: [-0.8, 0.36], ears: 0.15 },
  // fast asleep (sitting or standing): eyes shut, a little snore, the head nodding
  asleep: { eye: 'shut', mouth: 'line', talk: ['ohS', 'line'], brow: [-0.25, -0.05], snore: true, slow: true, ears: 0.35, whisk: -0.12 },
};
export const EXPRESSIONS = Object.keys(EXPR);

const ALIAS = {
  calm: 'neutral', none: 'neutral', idle: 'neutral', joy: 'happy', glad: 'happy', cheer: 'laugh', proud: 'smug', smirk: 'smug',
  surprise: 'surprised', shock: 'surprised', shocked: 'surprised', scared: 'worried', afraid: 'worried', nervous: 'worried',
  tired: 'sleepy', sleeping: 'asleep', think: 'thinking', puzzled: 'thinking', grumpy: 'stern', mad: 'angry', cross: 'angry', cry: 'sad', upset: 'sad',
};

/** A known expression name for any name or alias (unknown → 'neutral'). */
export function exprName(name) {
  if (!name) return 'neutral';
  const n = ALIAS[name] || name;
  return EXPR[n] ? n : 'neutral';
}

/** Resting mouths a rig might not have, and what to show instead. */
export const MOUTH_FALLBACK = {
  grin: 'smile', smirk: 'smile', wobble: 'frown', hmm: 'line',
  talkS: 'talk', grinO: 'laugh', ohS: 'oh', snarl: 'grimace', wail: 'oh', yawn: 'oh',
};

/** Lids that can blink, and the in-between frame on the way down. */
export const BLINKS = { open: 'half', half: 'shut', sad: 'shut', angry: 'shut', smile: 'shut', wide: 'open', smug: 'shut', drowsy: 'shut', up: 'shut', squint: 'shut' };

const sm = (k) => k * k * (3 - 2 * k);

/**
 * The body side of an expression, added on top of the idle (or talking, or sitting) pose with
 * weight w (0..1, eased in and out by the rig). r: the rig; e: the expression name; et: seconds
 * since it started; sitting: arms only. Elbow and knee poses only exist on the tall build.
 */
export function gesture(r, e, w, et, sitting) {
  if (w <= 0.001) return;
  const { hip, neck, armL, armR } = r;
  const eL = r.elbowL, eR = r.elbowR;
  const s = r.s, t = r.t;
  const on = sm(Math.min(1, et / 0.35)); // the onset
  switch (e) {
    case 'happy': {
      if (!sitting) hip.position.y += Math.abs(Math.sin(et * 7)) * s * 0.55 * Math.max(0, 1 - et * 0.9) * w;
      neck.rotation.x -= 0.08 * w;
      neck.rotation.z += Math.sin(t * 2.1) * 0.05 * w;
      armL.rotation.z -= 0.12 * w; armR.rotation.z += 0.12 * w;
      break;
    }
    case 'laugh': {
      neck.rotation.x -= 0.26 * w;
      hip.rotation.x -= 0.1 * w;
      if (!sitting) hip.position.y += Math.abs(Math.sin(t * 15)) * s * 0.5 * w;
      // paws on the belly
      if (eL) {
        armL.rotation.x -= 0.2 * w; armR.rotation.x -= 0.2 * w;
        armL.rotation.z += 0.22 * w; armR.rotation.z -= 0.22 * w;
        eL.rotation.x -= 1.35 * w; eR.rotation.x -= 1.35 * w; eL.rotation.y -= 0.5 * w; eR.rotation.y += 0.5 * w;
      } else {
        armL.rotation.x -= (0.55 + Math.sin(t * 15) * 0.08) * w; armR.rotation.x -= (0.55 - Math.sin(t * 15) * 0.08) * w;
        armL.rotation.z += 0.3 * w; armR.rotation.z -= 0.3 * w;
      }
      break;
    }
    case 'sad': {
      neck.rotation.x += 0.4 * w;
      hip.rotation.x += 0.12 * w;
      armL.rotation.x -= 0.08 * w; armR.rotation.x -= 0.08 * w;
      // a sigh at the start
      if (!sitting && et < 1.2) hip.position.y += Math.sin(Math.min(1, et / 1.2) * Math.PI) * s * 0.35 * w;
      break;
    }
    case 'angry': {
      neck.rotation.x += 0.14 * w;
      hip.rotation.x += 0.1 * w;
      // fists clenched, arms held out a little, trembling
      armL.rotation.z -= 0.3 * w; armR.rotation.z += 0.3 * w;
      armL.rotation.x += 0.12 * w; armR.rotation.x += 0.12 * w;
      if (eL) { eL.rotation.x -= 0.5 * w; eR.rotation.x -= 0.5 * w; }
      hip.position.x += Math.sin(t * 43) * s * 0.06 * w;
      if (!sitting && et < 0.3) hip.position.y -= Math.sin(et / 0.3 * Math.PI) * s * 0.6 * w; // a stomp
      break;
    }
    case 'surprised': {
      // a start: up on the toes and back, paws up
      const jolt = Math.sin(Math.min(1, et / 0.4) * Math.PI) * Math.max(0, 1 - et * 1.5);
      if (!sitting) hip.position.y += jolt * s * 1.4 * w;
      neck.rotation.x -= (0.22 + jolt * 0.1) * w;
      hip.rotation.x -= 0.12 * w;
      armL.rotation.x -= 0.65 * on * w; armR.rotation.x -= 0.65 * on * w;
      armL.rotation.z -= 0.5 * on * w; armR.rotation.z += 0.5 * on * w;
      if (eL) { eL.rotation.x -= 0.9 * on * w; eR.rotation.x -= 0.9 * on * w; }
      break;
    }
    case 'worried': {
      neck.rotation.x += 0.12 * w;
      neck.rotation.z += Math.sin(t * 1.4) * 0.06 * w;
      // paws wringing together in front of the chest
      armL.rotation.x -= (eL ? 0.6 : 1.0 + Math.sin(t * 6) * 0.08) * w; armR.rotation.x -= (eL ? 0.6 : 1.0 - Math.sin(t * 6) * 0.08) * w;
      armL.rotation.z += (eL ? 0.32 : 0.5) * w; armR.rotation.z -= (eL ? 0.32 : 0.5) * w;
      if (eL) { eL.rotation.x -= (1.25 + Math.sin(t * 6) * 0.1) * w; eR.rotation.x -= (1.25 - Math.sin(t * 6) * 0.1) * w; }
      break;
    }
    case 'smug': {
      neck.rotation.x -= 0.16 * w;
      neck.rotation.z += 0.12 * w;
      hip.rotation.x -= 0.06 * w;
      // paws on the hips
      if (eL) {
        armL.rotation.z -= 0.62 * w; armR.rotation.z += 0.62 * w;
        armL.rotation.x += 0.18 * w; armR.rotation.x += 0.18 * w;
        eL.rotation.z += 1.55 * w; eR.rotation.z -= 1.55 * w;
        eL.rotation.x -= 0.25 * w; eR.rotation.x -= 0.25 * w;
      } else {
        // chibi arms are too short for hips: paws tucked behind the back, chest out
        armL.rotation.x += 0.45 * w; armR.rotation.x += 0.45 * w;
        armL.rotation.z += 0.12 * w; armR.rotation.z -= 0.12 * w;
      }
      break;
    }
    case 'sleepy': {
      neck.rotation.x += (0.18 + Math.sin(t * 0.7) * 0.07) * w;
      neck.rotation.z += Math.sin(t * 0.45) * 0.07 * w;
      hip.rotation.x += 0.06 * w;
      break;
    }
    case 'thinking': {
      neck.rotation.z += 0.15 * w;
      neck.rotation.x -= 0.1 * w;
      if (eR) {
        // a paw to the chin, the other across the belly holding the elbow
        armR.rotation.x -= 0.8 * w; armR.rotation.z -= 0.4 * w;
        eR.rotation.x -= (2.1 + Math.sin(t * 3) * 0.06) * w;
        armL.rotation.x -= 0.4 * w; armL.rotation.z += 0.3 * w;
        eL.rotation.x -= 1.3 * w;
      } else {
        // the paw up at the chin
        armR.rotation.x -= (1.95 + Math.sin(t * 3) * 0.05) * w; armR.rotation.z -= 0.55 * w;
        armL.rotation.x -= 0.5 * w; armL.rotation.z += 0.35 * w;
      }
      break;
    }
    case 'asleep': {
      const br = Math.sin(t * 1.3);
      neck.rotation.x += (0.42 + br * 0.04) * w;
      neck.rotation.z += 0.18 * w;
      hip.rotation.x += 0.05 * w;
      if (!sitting) hip.position.y += br * s * 0.12 * w;
      break;
    }
    case 'stern': {
      neck.rotation.x += 0.05 * w;
      armL.rotation.z += 0.08 * w; armR.rotation.z -= 0.08 * w;
      break;
    }
    default:
  }
}
