// Faces for Deep Town's folk: the resting mood each kind of townsperson wears, the shopkeepers'
// tempers, and a reading of a line of chatter (what face to say it with). The expressions
// themselves live on the character rig (rig.setExpression / setMood / talk / lookAt).
import { pick } from '../core/util.js';

/** Resting moods by townsfolk role (one is picked per person). */
export const ROLE_MOODS = {
  bench: ['happy', 'sleepy', 'neutral', 'happy'],
  sleeper: ['asleep'],
  elder: ['stern'],
  vendor: ['happy', 'smug', 'happy'],
  busker: ['happy'],
  fisher: ['thinking'],
  sweeper: ['neutral', 'stern', 'sleepy'],
  miner: ['stern', 'neutral', 'sleepy'],
  parent: ['happy', 'worried'],
  baby: ['happy', 'happy', 'surprised'],
  tag: ['laugh', 'happy'],
  gossip: ['neutral', 'happy', 'smug'],
  shopper: ['thinking', 'happy', 'worried'],
  doorstep: ['happy', 'sleepy', 'neutral'],
  wander: ['neutral', 'happy', 'neutral', 'worried', 'sleepy', 'thinking', 'smug'],
};

/** Shopkeepers' resting faces and how they take a sale. */
export const KEEPER_MOODS = {
  tools: { mood: 'stern', greet: 'smug', buy: 'happy', big: 'laugh' },
  grocer: { mood: 'happy', greet: 'laugh', buy: 'happy', big: 'laugh' },
  furniture: { mood: 'happy', greet: 'happy', buy: 'laugh', big: 'surprised' },
  blueprints: { mood: 'thinking', greet: 'happy', buy: 'smug', big: 'surprised' },
  outfitter: { mood: 'smug', greet: 'happy', buy: 'smug', big: 'laugh' },
  assay: { mood: 'stern', greet: 'neutral', buy: 'happy', sell: 'thinking', big: 'surprised' },
  ticket: { mood: 'smug', greet: 'smug', buy: 'laugh', big: 'surprised' },
  lift: { mood: 'happy', greet: 'happy', buy: 'happy', big: 'laugh' },
};

/** What face to say a line with (a rough reading of its punctuation and words). */
export function moodOf(line) {
  const t = String(line || '').replace(/<[^>]*>/g, '');
  if (/zz+/i.test(t)) return 'sleepy';
  if (/\b(ha|hee|haha|hah)\b|ho ho/i.test(t)) return 'laugh';
  if (/\b(run|careful|mind|don'?t|never|trust me)\b/i.test(t) && /!|\./.test(t)) return /!/.test(t) ? 'worried' : 'stern';
  if (/\b(cry|lost|sad|miss|poor)\b/i.test(t)) return 'sad';
  if (/\b(fake|really\?|no way|what)\b/i.test(t)) return 'surprised';
  if (/\?\s*$/.test(t)) return pick(['thinking', 'happy']);
  if (/(\.\.\.|…)/.test(t)) return pick(['worried', 'thinking']);
  if (/!/.test(t)) return pick(['happy', 'happy', 'surprised']);
  return pick(['neutral', 'happy', 'smug']);
}
