import * as THREE from 'three';
import { Scene } from '../core/Scene.js';
import { Kitchen, SPOTS } from '../cooking/kitchen.js';
import { Paws } from '../cooking/paws.js';

export default class CookingScene extends Scene {
  async enter(params) {
    this.hud = 'mini';
    this.music = 'cooking';
    this.allowMenus = false;
    this.scene.background = new THREE.Color(0x1a1010);
    this.camera.fov = 50;
    this.camera.near = 0.1;
    this.camera.far = 40;
    this.camera.updateProjectionMatrix();
    this.post = { innerThresh: 0.15, vignette: 0.42, tint: 0xfff2e2, saturation: 1.1 };
    this.kitchen = new Kitchen(this.scene);
    this.paws = new Paws(this.scene);
    const v = params.view || 'board';
    const spot = SPOTS[v] || SPOTS.board;
    const off = params.view === 'pantry' ? new THREE.Vector3(0.9, 1.5, 1.9) : new THREE.Vector3(0, 1.3, 1.45);
    const look = params.view === 'pantry' ? new THREE.Vector3(0.9, 0.45, -0.6) : new THREE.Vector3(0, 0, -0.4);
    this.camera.position.copy(spot).add(off);
    this.lookAt = spot.clone().add(look);
    this.camera.lookAt(this.lookAt);
    this.spot = spot;
    this.paws.anchor(this.camera);
    this.paws.idle(spot);
    this.paws.L.snap(); this.paws.R.snap();
    if (params.burner) { this.kitchen.setBurner(0, 1); this.kitchen.setBurner(1, 1); }
    if (params.lab) {
      const { Paw } = await import('../cooking/paws.js');
      this.lab = [];
      const cam = this.camera.position.clone();
      let i = 0;
      for (const pitch of [-0.3, 0.2, 0.6, 1.0]) for (const yaw of [0, 0.4, 0.8]) {
        const p = new Paw(1);
        p.addTo(this.scene);
        p.goal.set(-1.3 + (i % 3) * 0.55 + Math.floor(i / 3) * 0.0, 0.35, -0.9 + Math.floor(i / 3) * 0.42);
        p.goal.x = -1.1 + (i % 3) * 0.75; 
        p.shoulder.set(p.goal.x + 0.3, p.goal.y + 0.3, p.goal.z + 1.2);
        p.setPose({ pitch, yaw, roll: 0.3 });
        p.snap();
        this.lab.push(p);
        i++;
      }
      this.paws.L.root.visible = this.paws.R.root.visible = false;
      this.paws.L.sleeve.visible = this.paws.R.sleeve.visible = false;
    }
    this.camOff = off; this.lookOff = look; off.set(0, 1.45, 1.6); look.set(0, 0, -0.45);
    window.__cook = this;
  }

  update(dt) {
    super.update(dt);
    this.kitchen.update(dt);
    this.camera.position.copy(this.spot).add(this.camOff);
    this.camera.lookAt(this.lookAt.copy(this.spot).add(this.lookOff));
    this.camera.updateMatrixWorld();
    this.paws.anchor(this.camera);
    this.paws.idle(this.spot);
    this.paws.update(dt);
    if (this.lab) for (const p of this.lab) p.update(dt, this.camera.quaternion);
  }
}
