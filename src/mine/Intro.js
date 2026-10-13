// The opening: trapped in collapsed tunnels (work in progress stub).
import { generateMine } from './MineGen.js';
export function generateIntro(seed) { return generateMine(1, seed); }
export class IntroController {
  constructor(scene) { this.s = scene; }
  start() {}
  update() {}
  locked() { return false; }
  blockTools() { return false; }
  interact() { return false; }
  hit() { return false; }
  grab() { return false; }
  prompt() { return null; }
  lights() {}
  render() {}
  lampScale() { return 1; }
  dispose() {}
}
