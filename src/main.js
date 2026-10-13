import './ui/styles.css';
import { Game } from './core/Game.js';

const root = document.getElementById('app');
const game = new Game(root);
window.__game = game; // handy for debugging in the console
game.start();
