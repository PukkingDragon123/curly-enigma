// (wave 21) The morning post at Old Star's: a letter slid in under the front door overnight lies
// on the floor (a 1/32 m voxel envelope, crooked, with its wax seal), E reads it (src/ui/letters.js).
// And the morning: Old Star sniffs the air and says what the cave's like today (data/story.js
// CONDITIONS), or tells you the next chapter of his slate when you talk to him (BEATS).
// Mixed into HomeScene (HomeScene.js: Object.assign(HomeScene.prototype, postPart)).
import { VoxelGrid, voxelMesh } from '../gfx/Voxel.js';
import { PAL } from '../ui/palette.js';
import { openLetter } from '../ui/letters.js';
import { pick } from '../core/util.js';
import { SPOTS } from './spots.js';

const hex = (n) => parseInt(PAL[n].slice(1), 16);

/** A folded letter, a little lopsided, its flap and a wax blob (12 × 2 × 8 voxels at 1/32 m). */
function envelopeMesh() {
  const g = new VoxelGrid(12, 2, 8);
  const cream = hex('cream'), dk = hex('creamDk'), sand = hex('sand'), red = hex('red'), wine = hex('wine');
  g.box(0, 0, 0, 12, 1, 8, cream);
  for (let x = 0; x < 12; x++) g.set(x, 0, 7, sand); // the far edge in shadow
  g.set(11, 0, 0, -1); // a dog-eared corner
  // the flap's fold: a shallow V of the darker paper
  for (let x = 1; x < 11; x++) { const z = 7 - Math.min(x, 11 - x) * 0.7; g.set(x, 1, Math.round(z), dk); }
  g.box(5, 1, 3, 2, 1, 2, red); g.set(6, 1, 4, wine); g.set(4, 1, 4, red);
  const m = voxelMesh(g, { scale: 1 / 32, pivot: [6, 0, 4], kind: 'toon', greedy: true });
  m.name = 'letter';
  return m;
}

export const postPart = {
  /** Put the waiting letter by the bedroll (or take it away). Called on enter and each morning. */
  placePost() {
    const L = this.game.daily?.mail;
    if (!L) { if (this.letterObj) this.letterObj.visible = false; return; }
    if (!this.letterObj) {
      this.letterObj = envelopeMesh();
      this.scene.add(this.letterObj);
      this.own(() => { this.letterObj?.geometry.dispose(); this.letterObj = null; });
      const o = this.letterObj;
      this.addIt({ r: 0.2, sphereFn: (v) => v.set(o.position.x, o.position.y + 0.04, o.position.z), enabled: () => o.visible, label: 'Read the letter', action: () => this.readPost() });
    }
    // slid in under the front door in the night, a step into the room
    const d = SPOTS.passage, dx = 5 - d.x, dz = -2.5 - d.z, l = Math.hypot(dx, dz) || 1;
    const x = d.x + dx / l * 0.55, z = d.z + dz / l * 0.55;
    this.letterObj.position.set(x, (this.floorY?.(x, z) ?? 0) + 0.012, z);
    this.letterObj.rotation.y = 0.5;
    this.letterObj.visible = true;
  },

  readPost() {
    const L = this.game.daily?.readMail();
    if (!L) return;
    this.letterObj.visible = false;
    openLetter(this.game, L);
    if (this.star && this.star.mode !== 'sleep' && !this.star.scripted && Math.random() < 0.5) {
      this.later(1.2, () => this.star?.say(pick(['Post. Don\'t read it out.', 'Nobody writes to me. Fine by me.', 'Mind you write back.']), { mood: 'calm', key: 'aside' }));
    }
  },

  /** Up in the morning: Old Star's nose on the day. */
  morningWord() {
    const c = this.game.daily?.cond(), star = this.star;
    if (!c || !star?.rig || star.scripted || star.mode === 'sleep') return;
    star.sniff?.();
    this.later(0.5, () => star.say(pick(c.star), { mood: c.id === 'quiet' ? 'calm' : 'happy', key: 'aside' }));
  },

  /** Talking to him: the next chapter of the slate, when there is one (a cutscene that waits); then: a line after it. */
  storyBeat(then = null) {
    const D = this.game.daily, b = D?.beat(), cv = this.game.convo;
    if (!b || !cv) return false;
    D.tellBeat(b);
    // (the job he's just handed over, if any, comes last)
    cv.play({ who: 'oldstar', lines: [...b.lines.map(([text, mood]) => ({ text, mood })), ...(then ? [{ text: then, mood: 'calm' }] : [])] });
    return true;
  },
};
