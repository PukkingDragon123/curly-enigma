// First-person mining in the 3D underground (work in progress).
import { Scene } from '../core/Scene.js';

export default class DeepScene extends Scene {
  async enter() {
    this.hud = 'mine';
  }
}
