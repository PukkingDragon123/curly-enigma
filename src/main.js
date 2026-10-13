import './ui/styles.css';
import { Game } from './core/Game.js';
import { setupTouch } from './ui/TouchControls.js';

function boot(hotData) {
  const root = document.getElementById('app');
  const game = new Game(root, hotData || {});
  window.__game = game; // handy for debugging in the console
  setupTouch(game);
  game.start();
}

// When hosted as an Artifact, the viewer can hand back a snapshot after a republish.
const hot = window.claude?.hot;
if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? {});
