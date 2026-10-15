// The opening fall (placeholder until the cutscene lands): straight to the burrow.
import { Scene } from '../core/Scene.js';

export default class FallScene extends Scene {
  async enter() {
    this.allowMenus = false;
    setTimeout(() => this.game.goto('home', { from: 'fall' }, { transition: 'fade' }), 50);
  }
}
