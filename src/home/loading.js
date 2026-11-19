// The wait while Old Star's camp is built (or put back together), and any other scene build that
// takes a while: the ore loader (src/ui/oreLoader.js), a little cave niche where two mole paws
// chip the crust off a glowing ore clump, the ore coming cleaner as the build goes on. No words.
// It animates on the compositor, so it keeps moving even while the page is busy. After the fall
// it's quieter: dim and low on a black screen (you're out cold).
//
//   const ld = houseLoading(game, { dark }); ld.set({ k, label }); ld.done()
// opts.corner: no screen, just a small vignette in the corner (over a frame held on screen while a
// scene is swapped in under it: Game.goto 'seamless'); opts.appear: seconds before it fades in, as
// a CSS delay (a page busy building can't run a timer, but the compositor still runs this);
// opts.wick: false means there's nothing to count (the ore comes clean on its own, slowly).
import { oreLoader } from '../ui/oreLoader.js';

/** The loading screen over the game (above the transition's black). opts.dark: after the fall. */
export function houseLoading(game, opts = {}) {
  let L = null, gone = false;
  try {
    L = oreLoader(game?.ui?.overlay || document.body, {
      mode: opts.corner ? 'corner' : opts.dark ? 'dark' : 'full',
      appear: opts.appear, delay: opts.appear ? 0 : (opts.delay ?? 120),
      label: opts.label || 'Loading Old Star\'s camp', tau: opts.wick === false ? 5 : 9,
    });
  } catch (e) { /* no DOM to show it in */ }
  return {
    set(p) {
      if (gone || !L) return;
      L.set(Math.max(0.02, Math.min(1, p?.k ?? 0)));
    },
    done() {
      if (gone) return;
      gone = true;
      L?.done();
    },
  };
}
