// Placeholder — replaced by the real Ending scene.
import * as THREE from 'three';
import { Scene } from '../core/Scene.js';

export default class EndingScene extends Scene {
  async enter() {
    this.hud = 'town';
    this.scene.background = new THREE.Color(0x221a2a);
    this.camera.position.set(0, 0, 5);
    this.game.ui.toast('Ending scene is under construction');
  }
}
